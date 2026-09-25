import test from 'node:test';
import assert from 'node:assert/strict';

// Boot smoke check. This is the test that would have caught the esbuild/JSON
// bundler bug: ev.mjs reads metrics/allowlist.json at MODULE SCOPE via
// `readFileSync(new URL('../../allowlist.json', import.meta.url))`. If a
// bundler ever fails to carry that file into the deployed function (as
// esbuild's default `json` loader does for a `new URL(...)` reference — it
// only special-cases the `file`/`copy` loaders), the read throws at import
// time, the module never finishes loading, and the deployed function never
// boots. Because the handler is silent by design (no logging, every store
// error swallowed), that failure mode produces NO diagnostic anywhere in
// production — counters simply stay at zero forever. Importing the module
// fresh and asserting the default export is a callable handler is the one
// check that would fail loudly here instead of silently there.
//
// `ev.mjs`'s default export no longer calls `getStore()` unconditionally.
// Since commit b49c7b8 (Task 4's fix round), `createEv` only acquires the
// store AFTER the method, origin, body, and allowlist checks all pass — see
// ev.mjs's own comment at the `resolvedStore = getStore ? ...` line. A
// disallowed-origin request (this test's own request, `origin:
// 'https://evil.invalid'`) is rejected by the origin check with 403 before
// `getStore()` is ever invoked, so `@netlify/blobs`'s real `getStore()` never
// runs its synchronous environment validation and never has the chance to
// throw `MissingBlobsEnvironmentError` for this request. No synthetic
// `netlifyBlobsContext` scaffolding is needed to satisfy that check, because
// the check is never reached. What IS still required: the `@netlify/blobs`
// *package* being resolvable, since the default export's
// `await import('@netlify/blobs')` runs unconditionally on every invocation
// (module resolution only — it does not call anything in the package until
// `getStore` is actually invoked). This task's own `npm install` step
// guarantees that. Confirmed empirically: this test performs no network I/O
// and needs no real Netlify site, deploy, or credentials.

test('ev.mjs module loads and its default export is an invocable handler', async () => {
  const mod = await import('../netlify/functions/ev.mjs');

  assert.equal(typeof mod.default, 'function', 'default export must be a callable handler');

  const request = new Request('https://metrics.invalid/api/ev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://evil.invalid' },
    body: JSON.stringify({ site: 'ms3', keys: ['page:t_mood.md'] }),
  });

  const response = await mod.default(request);

  assert.ok(response instanceof Response, 'handler must return a real Response object');
  assert.equal(response.status, 403, 'a disallowed origin must be rejected, proving the handler actually ran');
});
