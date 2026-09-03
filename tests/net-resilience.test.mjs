/**
 * Transport resilience for the production canary.
 *
 * The smoke suite was written against localhost, where a socket never resets. The nightly
 * "Maintenance — Production Learner Canary" reuses those same specs against the public
 * Netlify origins, where transient TCP resets are ordinary. Every canary failure examined
 * across runs 33073824073 → 33614575243 was a transport error (`read ECONNRESET`, its
 * downstream `net::ERR_ABORTED`, or a hung-socket timeout) — never a failed assertion and
 * never a real production regression.
 *
 * These tests pin the contract that fixes that: retry the transport, and ONLY the transport.
 * A reset is retried; a 404, an LFS pointer stub, or a persistent outage still fails loudly,
 * because that is the entire point of a canary.
 *
 * The reset is produced with `socket.resetAndDestroy()` mid-body, which yields a genuine TCP
 * RST and the exact `read ECONNRESET` string production emits. `socket.destroy()` would send
 * a graceful FIN and surface as `UND_ERR_SOCKET`, which is NOT the failure being fixed.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { isRemoteTarget, isTransientNetworkError, retryTransient } from './smoke/net-resilience.js';

/**
 * Start a server that RSTs the first `resets` requests mid-body, then serves `status`.
 * `resets: Infinity` models a sustained outage.
 */
async function startFlakyServer({ resets = 0, status = 200, body = 'ok' } = {}) {
  let seen = 0;
  const server = http.createServer((req, res) => {
    seen += 1;
    if (seen <= resets) {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '1000' });
      res.write('partial');
      res.socket.resetAndDestroy();
      return;
    }
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    requestCount: () => seen,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// The unit under retry always includes the body read: production resets land mid-transfer on
// the largest responses, so a helper that retried only the request call would still fail.
const fetchText = (url) => async () => {
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
};

test('a mid-transfer connection reset is retried until the request succeeds', async () => {
  const server = await startFlakyServer({ resets: 2 });
  try {
    const result = await retryTransient(fetchText(server.url), { baseDelayMs: 1 });
    assert.equal(result.status, 200);
    assert.equal(result.body, 'ok');
    assert.equal(server.requestCount(), 3, 'two resets then one success');
  } finally {
    await server.close();
  }
});

test('a sustained outage exhausts the retries and rethrows, so the canary still fails', async () => {
  const server = await startFlakyServer({ resets: Infinity });
  try {
    await assert.rejects(
      () => retryTransient(fetchText(server.url), { attempts: 3, baseDelayMs: 1 }),
      (error) => /ECONNRESET/.test(String(error.cause?.message ?? error.message)),
    );
    assert.equal(server.requestCount(), 3, 'bounded at exactly the attempt budget');
  } finally {
    await server.close();
  }
});

test('an HTTP error status is returned unretried, so a real 404 is never masked', async () => {
  const server = await startFlakyServer({ status: 404, body: 'missing' });
  try {
    const result = await retryTransient(fetchText(server.url), { baseDelayMs: 1 });
    assert.equal(result.status, 404);
    assert.equal(server.requestCount(), 1, 'a status is an answer, not a transport failure');
  } finally {
    await server.close();
  }
});

test('a non-network error is rethrown immediately, so assertion failures are never masked', async () => {
  let calls = 0;
  await assert.rejects(
    () => retryTransient(async () => {
      calls += 1;
      throw new Error('expect(locator).toBeVisible() failed');
    }, { baseDelayMs: 1 }),
    /toBeVisible/,
  );
  assert.equal(calls, 1);
});

test('each retry is reported, so transport noise stays visible instead of silent', async () => {
  const server = await startFlakyServer({ resets: 2 });
  const seen = [];
  try {
    await retryTransient(fetchText(server.url), {
      baseDelayMs: 1,
      onRetry: (info) => seen.push(info),
    });
    assert.equal(seen.length, 2);
    assert.deepEqual(seen.map((info) => info.attempt), [1, 2]);
    assert.ok(seen.every((info) => /ECONNRESET/.test(info.reason)));
  } finally {
    await server.close();
  }
});

test('transient transport failures are recognised across the shapes each client reports', () => {
  // Node/undici (apiRequestContext): the code hangs off `cause`.
  assert.ok(isTransientNetworkError(
    Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET', message: 'read ECONNRESET' } }),
  ));
  // Playwright surfaces the transport failure as a flat prefixed message.
  assert.ok(isTransientNetworkError(new Error('route.fetch: read ECONNRESET')));
  assert.ok(isTransientNetworkError(new Error('apiRequestContext.get: read ECONNRESET')));
  assert.ok(isTransientNetworkError(new Error('page.goto: net::ERR_CONNECTION_RESET')));
  assert.ok(isTransientNetworkError(new Error('socket hang up')));
  // A failed expectation is not a transport failure and must never be retried.
  assert.equal(isTransientNetworkError(new Error('expect(received).toBe(expected)')), false);
  assert.equal(isTransientNetworkError(new Error('HTTP 404')), false);
});

test('only a non-loopback target counts as remote, so localhost runs keep their tight budgets', () => {
  assert.equal(isRemoteTarget('https://une-ms3-psychiatry.netlify.app'), true);
  assert.equal(isRemoteTarget('https://mmc-psychiatry-residents-sanford.netlify.app/'), true);
  assert.equal(isRemoteTarget('http://localhost:4200'), false);
  assert.equal(isRemoteTarget('http://127.0.0.1:4201/'), false);
  assert.equal(isRemoteTarget('http://[::1]:4202'), false);
  // An unparseable or absent target must not silently opt into remote budgets.
  assert.equal(isRemoteTarget(undefined), false);
  assert.equal(isRemoteTarget('not a url'), false);
});
