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
// `@netlify/blobs`'s real `getStore()` validates its environment SYNCHRONOUSLY
// and throws `MissingBlobsEnvironmentError` when it finds no site/token
// context — and ev.mjs's default export calls `getStore()` unconditionally,
// before it ever inspects the request's origin. So invoking the default
// export at all (even for a request this handler will go on to reject)
// requires *some* context to be present. The fake context below is a
// synthetic, made-up siteID/token pair this test constructs itself — not a
// real credential, not read from any file or env var. It satisfies
// `getStore()`'s synchronous config check so the call can proceed to
// construct a (never-used) Store object; it does not, and cannot, cause a
// real network call, because the disallowed-origin check inside `createEv`
// short-circuits with 403 before this handler ever calls a store method
// (`store.get` / `store.setJSON` only run from `increment()`, which is only
// reached after the origin and allowlist checks both pass). Confirmed
// empirically: this test performs no network I/O and needs no real Netlify
// site, deploy, or credentials — only the `@netlify/blobs` *package* being
// resolvable, which this task's own `npm install` step guarantees.
globalThis.netlifyBlobsContext = Buffer.from(
  JSON.stringify({ siteID: 'boot-test-fake-site', token: 'boot-test-fake-token' }),
).toString('base64');

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
