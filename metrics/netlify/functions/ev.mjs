import { readFileSync } from 'node:fs';

import { isoWeek, increment } from './_shared/counters.mjs';

// Runtime read + JSON.parse, resolved relative to this module's own URL.
// NOT `import allowlistJson from '../../allowlist.json' with { type: 'json' }` —
// import attributes are Node 22 syntax. Local dev runs Node 22, so that line
// would pass every local test, but metrics/netlify.toml pins NODE_VERSION 20
// for production, where the same syntax can fail to parse and the function
// never boots. fs.readFileSync + JSON.parse works identically on any Node
// version (readFileSync has accepted `file:` URL objects since Node 7.6) and
// survives esbuild's function bundler, which special-cases exactly this
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

export function createEv({ store, allowlist, now = () => new Date(), origins = LEARNER_ORIGINS }) {
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

    const week = isoWeek(now());
    for (const key of unique) {
      try {
        await increment(store, { site, week, key });
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
// (and in any dev environment) before the dependency exists. Deferring both
// the import and the `getStore` call into this closure means `createEv` can
// be imported and exercised on its own; only an actual invocation of the
// deployed function (Task 4's concern) ever touches `@netlify/blobs`.
let productionEv;
export default async function ev(request) {
  if (!productionEv) {
    const { getStore } = await import('@netlify/blobs');
    productionEv = createEv({ store: getStore('usage-counters'), allowlist: allowlistJson });
  }
  return productionEv(request);
}
