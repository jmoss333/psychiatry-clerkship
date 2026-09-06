import { readFileSync } from 'node:fs';

import { isoWeek, increment } from './_shared/counters.mjs';

// Runtime read + JSON.parse, resolved relative to this module's own URL.
// NOT `import allowlistJson from '../../allowlist.json' with { type: 'json' }` —
// import attributes are Node 22 syntax. Local dev runs Node 22, so that line
// would pass every local test, but the deploy target for this function is
// Node 20 (a later task adds metrics/netlify.toml pinning NODE_VERSION 20),
// where the same syntax can fail to parse and the function never boots.
// fs.readFileSync + JSON.parse works identically on any Node version
// (readFileSync has accepted `file:` URL objects since Node 7.6) and survives
// esbuild's function bundler, which special-cases exactly this
// `new URL(..., import.meta.url)` pattern to carry the referenced file along
// with the bundle instead of trying to inline a require() of JSON.
const allowlistPath = new URL('../../allowlist.json', import.meta.url);
const allowlistJson = JSON.parse(readFileSync(allowlistPath, 'utf8'));

const SITES = new Set(['ms3', 'res']);
const MAX_KEYS = 20;
const MAX_BODY_BYTES = 4096;

const LEARNER_ORIGINS = [
  'https://une-ms3-psychiatry.netlify.app',
  'https://mmc-psychiatry-residents-sanford.netlify.app',
];

function noContent(origin) {
  // 204 for everything the client could get wrong. A probe must not be able to
  // learn which keys exist by watching status codes.
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function createEv({ store, getStore, allowlist, now = () => new Date(), origins = LEARNER_ORIGINS }) {
  const allowed = {
    ms3: new Set(allowlist.keys.ms3),
    res: new Set(allowlist.keys.res),
  };

  return async function ev(request) {
    const origin = request.headers.get('origin') || '';

    if (request.method === 'OPTIONS') {
      if (!origins.includes(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!origins.includes(origin)) return new Response(null, { status: 403 });

    // Deliberately NOT read or logged: IP, user agent, referrer. There is no
    // logging in this function at all; Netlify's own function logs would
    // otherwise reintroduce the IPs this design promises never to keep.
    let payload;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return noContent(origin);
      payload = JSON.parse(text);
    } catch {
      return noContent(origin);
    }

    const site = payload?.site;
    if (!SITES.has(site)) return noContent(origin);

    const keys = Array.isArray(payload?.keys) ? payload.keys.slice(0, MAX_KEYS) : [];
    const unique = [...new Set(keys.filter((k) => typeof k === 'string' && allowed[site].has(k)))];
    if (unique.length === 0) return noContent(origin);

    // The store is acquired here — after every method/origin/body/allowlist
    // check has passed, on the one path that actually reaches `increment` —
    // never for an OPTIONS preflight, a non-POST, a disallowed origin, or a
    // batch with no allowlisted keys. `getStore`, when supplied, is called
    // fresh for THIS invocation only (see `createProductionEv` below); a
    // caller that instead passes `store` directly (every pre-existing test)
    // is unaffected, since `getStore` is simply undefined for them.
    // Acquiring the store is wrapped exactly like every other store-touching
    // call in this file: a Blobs outage or misconfiguration here must
    // produce the same silent 204 as any client error, never a 500.
    let resolvedStore;
    try {
      resolvedStore = getStore ? await getStore() : store;
    } catch {
      return noContent(origin);
    }
    if (!resolvedStore) return noContent(origin);

    const week = isoWeek(now());
    for (const key of unique) {
      try {
        await increment(resolvedStore, { site, week, key });
      } catch {
        // A store failure must never surface to the learner's page.
      }
    }
    return noContent(origin);
  };
}

// Production wiring, deliberately lazy. `@netlify/blobs` is not installed yet
// (a later task owns metrics/package.json), and even once it is, this default
// export must not evaluate `getStore(...)` — or resolve the `@netlify/blobs`
// import at all — at module-load time. A bare top-level
// `import { getStore } from '@netlify/blobs'` would make this whole module,
// including the testable `createEv` factory, fail to load in this test file
// (and in any dev environment) before the dependency exists. Deferring the
// import into the function body below means `createEv` can be imported and
// exercised on its own; only an actual invocation of the deployed function
// (Task 4's concern) ever touches `@netlify/blobs`.
//
// `getStore('usage-counters')` is NOT called here. Calling it eagerly — as an
// argument to `createEv({...})` — used to construct the store client on
// EVERY invocation of the returned handler, including an OPTIONS preflight
// or a POST from a disallowed origin, before `createEv`'s own method/origin
// checks ever ran. Under a Blobs outage or misconfiguration, `getStore()`
// throwing turned what should be a clean 403/204/405 into an unhandled 500,
// for traffic that never needed the store — and contradicted this file's own
// resilience posture, where every other store-touching call is wrapped and
// its error swallowed. Instead, `createEv` is handed the factory itself (via
// its optional `getStore` parameter) and calls it only after every check has
// passed, on the one path that reaches `increment`.
//
// The store is still fetched fresh on EVERY qualifying invocation and is
// never cached alongside the handler. `@netlify/blobs` reads
// `NETLIFY_BLOBS_CONTEXT` (the deploy-scoped credentials) each time
// `getStore()` runs; a container that memoized the returned client across
// invocations could keep using credentials from a stale deploy context after
// a new one takes over. Every store error in this handler is caught and
// swallowed by design — the learner's page must never break on a metrics
// failure — which means a stale client would silently stop incrementing
// counters with zero signal anywhere. `createProductionEv` is its own export
// (rather than inlined below) precisely so a test can inject a fake
// `getStore` and prove it is invoked once per qualifying request, never once
// per container lifetime, and never at all for a request that was always
// going to be rejected.
export function createProductionEv({ allowlist, getStore, now, origins }) {
  return createEv({
    getStore: () => getStore('usage-counters'),
    allowlist,
    now,
    origins,
  });
}

export default async function ev(request) {
  // Node caches a dynamic import's module resolution after the first call,
  // so this costs nothing on repeat invocations — but nothing here caches
  // the STORE itself. Only the allowlist (immutable, parsed once at module
  // load above) is memoized; getStore() runs fresh every time.
  const { getStore } = await import('@netlify/blobs');
  return createProductionEv({ allowlist: allowlistJson, getStore })(request);
}
