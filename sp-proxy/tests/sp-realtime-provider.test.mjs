import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRealtimeProvider,
  parseCallId,
} from '../netlify/functions/_shared/sp-realtime-provider.mjs';

const KEY = 'sk-test-server-key-0123456789';
const OFFER = 'v=0\r\no=- 4227147428 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const ANSWER = 'v=0\r\no=- 9 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=setup:active\r\n';
const INSTRUCTIONS = 'You are Dana. SPOKEN ENCOUNTER RULES: never read a stage direction aloud.';
const SESSION = Object.freeze({
  type: 'realtime',
  model: 'gpt-realtime-mini-2025-12-15',
  instructions: INSTRUCTIONS,
  output_modalities: ['audio'],
  audio: { input: { noise_reduction: { type: 'far_field' } }, output: { voice: 'marin' } },
});

function fakeFetch({
  answer = ANSWER,
  location = '/v1/realtime/calls/rtc_abc',
  exchangeStatus = 201,
  hangupStatus = 200,
  exchangeError = null,
  hangupError = null,
  hang = false,
} = {}) {
  const calls = [];
  async function fetchImpl(url, init) {
    calls.push({ url, init });
    if (hang) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        }, { once: true });
      });
    }
    if (url.endsWith('/hangup')) {
      if (hangupError) throw hangupError;
      return new Response(hangupStatus === 404 ? '{"error":{"message":"gone"}}' : null, { status: hangupStatus });
    }
    if (exchangeError) throw exchangeError;
    const headers = { 'Content-Type': 'application/sdp' };
    if (location !== null) headers.Location = location;
    return new Response(answer, { status: exchangeStatus, headers });
  }
  return { fetchImpl, calls };
}

function provider(fetch, overrides = {}) {
  return createRealtimeProvider({
    fetchImpl: fetch.fetchImpl,
    readApiKey: () => KEY,
    timeoutMs: 5_000,
    ...overrides,
  });
}

function assertContentFree(error) {
  const text = `${error.message} ${error.code}`;
  assert.ok(!text.includes(KEY), 'the key never appears in an error');
  assert.ok(!text.includes('v=0'), 'no SDP in an error');
  assert.ok(!text.includes('SPOKEN'), 'no instructions in an error');
}

test('exchange performs the documented multipart SDP exchange with the server key and returns the answer and call id', async () => {
  const fetch = fakeFetch();
  const result = await provider(fetch).exchange({ sdp: OFFER, session: SESSION });
  assert.deepEqual(result, { sdp: ANSWER, callId: 'rtc_abc' });
  assert.equal(Object.isFrozen(result), true);

  assert.equal(fetch.calls.length, 1);
  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(init.headers.Accept, 'application/sdp');
  assert.ok(init.signal instanceof AbortSignal);

  assert.ok(init.body instanceof FormData);
  assert.deepEqual([...init.body.keys()], ['sdp', 'session']);
  const sdpPart = init.body.get('sdp');
  const sessionPart = init.body.get('session');
  assert.equal(sdpPart.type, 'application/sdp');
  assert.equal(await sdpPart.text(), OFFER);
  assert.equal(sessionPart.type, 'application/json');
  assert.deepEqual(JSON.parse(await sessionPart.text()), SESSION);

  // The serialised body is real multipart/form-data with a boundary and the
  // per-part content types the contract names.
  const serialised = new Response(init.body);
  assert.match(serialised.headers.get('content-type'), /^multipart\/form-data; boundary=/);
  const raw = await serialised.text();
  assert.match(raw, /name="sdp"[\s\S]*?Content-Type: application\/sdp/i);
  assert.match(raw, /name="session"[\s\S]*?Content-Type: application\/json/i);
  assert.ok(raw.includes(OFFER));
});

test('the call id is the last path segment of Location, in every documented form', async () => {
  for (const [location, expected] of [
    ['/v1/realtime/calls/rtc_abc', 'rtc_abc'],
    ['rtc_abc', 'rtc_abc'],
    ['/v1/realtime/calls/rtc_abc/', 'rtc_abc'],
    ['https://api.openai.com/v1/realtime/calls/rtc_x.y:z-1?monitor=1#frag', 'rtc_x.y:z-1'],
    ['calls/rtc_%41bc', 'rtc_Abc'],
  ]) {
    assert.equal(parseCallId(location), expected, location);
    const fetch = fakeFetch({ location });
    assert.equal((await provider(fetch).exchange({ sdp: OFFER, session: SESSION })).callId, expected);
  }
  for (const location of [null, '', '/', 'has space', '/v1/realtime/calls/', `/${'a'.repeat(129)}`, 42, '-leading-dash']) {
    assert.equal(parseCallId(location), null, String(location));
  }
  await assert.rejects(provider(fakeFetch({ location: null })).exchange({ sdp: OFFER, session: SESSION }), { status: 502, code: 'provider_status' });
  await assert.rejects(provider(fakeFetch({ location: '/v1/realtime/calls/bad id' })).exchange({ sdp: OFFER, session: SESSION }), { status: 502, code: 'provider_status' });
});

test('the answer must be a bounded, non-empty SDP', async () => {
  for (const answer of ['', 'not sdp', '{"error":"x"}', `v=${'x'.repeat(256 * 1024)}`]) {
    await assert.rejects(provider(fakeFetch({ answer })).exchange({ sdp: OFFER, session: SESSION }), { status: 502, code: 'provider_status' });
  }
  const invalidUtf8 = new Response(Uint8Array.of(0x76, 0x3d, 0xff, 0xfe), { status: 201, headers: { Location: 'rtc_a' } });
  await assert.rejects(provider({ fetchImpl: async () => invalidUtf8 }).exchange({ sdp: OFFER, session: SESSION }), { code: 'provider_status' });
});

test('provider failures sanitise to stable codes and never carry the key, the SDP or the instructions', async () => {
  const cases = [
    [{ exchangeStatus: 401 }, 502, 'provider_auth'],
    [{ exchangeStatus: 403 }, 502, 'provider_auth'],
    [{ exchangeStatus: 429 }, 502, 'provider_limit'],
    [{ exchangeStatus: 500 }, 502, 'provider_status'],
    [{ exchangeStatus: 400 }, 502, 'provider_status'],
    [{ exchangeError: new Error(`connect ECONNREFUSED ${KEY} ${OFFER}`) }, 502, 'provider_connection'],
  ];
  for (const [options, status, code] of cases) {
    const fetch = fakeFetch(options);
    await assert.rejects(provider(fetch).exchange({ sdp: OFFER, session: SESSION }), (error) => {
      assert.equal(error.status, status, code);
      assert.equal(error.code, code);
      assertContentFree(error);
      return true;
    });
  }
  // Timeout: the provider's own deadline aborts the fetch and reports 504.
  const hung = fakeFetch({ hang: true });
  await assert.rejects(provider(hung, { timeoutMs: 5 }).exchange({ sdp: OFFER, session: SESSION }), (error) => {
    assert.equal(error.status, 504);
    assert.equal(error.code, 'provider_timeout');
    assertContentFree(error);
    return true;
  });
  assert.equal(hung.calls[0].init.signal.aborted, true);
  // Caller abort: the learner's own request went away.
  const controller = new AbortController();
  const cancelled = fakeFetch({ hang: true });
  const pending = provider(cancelled).exchange({ sdp: OFFER, session: SESSION, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { status: 499, code: 'request_cancelled' });
  const already = new AbortController();
  already.abort();
  await assert.rejects(provider(fakeFetch()).exchange({ sdp: OFFER, session: SESSION, signal: already.signal }), { code: 'request_cancelled' });
});

test('a missing server key fails closed before any request is made', async () => {
  for (const readApiKey of [() => undefined, () => '', () => '   ', () => { throw new Error('vault down'); }]) {
    const fetch = fakeFetch();
    const instance = createRealtimeProvider({ fetchImpl: fetch.fetchImpl, readApiKey, timeoutMs: 1_000 });
    await assert.rejects(instance.exchange({ sdp: OFFER, session: SESSION }), { status: 503, code: 'invalid_configuration' });
    await assert.rejects(instance.hangup({ callId: 'rtc_abc' }), { status: 503, code: 'invalid_configuration' });
    assert.equal(fetch.calls.length, 0);
  }
  // The key is read at call time and trimmed, never cached at construction.
  let key = undefined;
  const fetch = fakeFetch();
  const instance = createRealtimeProvider({ fetchImpl: fetch.fetchImpl, readApiKey: () => key, timeoutMs: 1_000 });
  await assert.rejects(instance.hangup({ callId: 'rtc_abc' }), { code: 'invalid_configuration' });
  key = `  ${KEY}  `;
  await instance.hangup({ callId: 'rtc_abc' });
  assert.equal(fetch.calls[0].init.headers.Authorization, `Bearer ${KEY}`);
});

test('hangup posts to the call id with the bearer key; 200 and 404 both mean the call is gone', async () => {
  for (const hangupStatus of [200, 204, 404]) {
    const fetch = fakeFetch({ hangupStatus });
    assert.deepEqual(await provider(fetch).hangup({ callId: 'rtc_x.y:z-1' }), { hungUp: true });
    const { url, init } = fetch.calls[0];
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls/rtc_x.y%3Az-1/hangup');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(init.body, undefined);
  }
  for (const [options, code] of [
    [{ hangupStatus: 401 }, 'provider_auth'],
    [{ hangupStatus: 429 }, 'provider_limit'],
    [{ hangupStatus: 500 }, 'provider_status'],
    [{ hangupStatus: 409 }, 'provider_status'],
    [{ hangupError: new TypeError('fetch failed') }, 'provider_connection'],
  ]) {
    await assert.rejects(provider(fakeFetch(options)).hangup({ callId: 'rtc_abc' }), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, code);
      assertContentFree(error);
      return true;
    });
  }
  await assert.rejects(provider(fakeFetch({ hang: true }), { timeoutMs: 5 }).hangup({ callId: 'rtc_abc' }), { status: 504, code: 'provider_timeout' });
});

test('malformed input and configuration are refused as proxy faults, before any request', async () => {
  const fetch = fakeFetch();
  const instance = provider(fetch);
  for (const input of [
    { sdp: '', session: SESSION },
    { sdp: 'o=- not an offer', session: SESSION },
    { sdp: `v=0${'x'.repeat(64 * 1024)}`, session: SESSION },
    { sdp: OFFER, session: null },
    { sdp: OFFER, session: [] },
    { sdp: OFFER, session: { ...SESSION, type: 'transcription' } },
    { sdp: OFFER, session: { ...SESSION, model: '' } },
    { sdp: OFFER, session: SESSION, signal: {} },
  ]) {
    await assert.rejects(instance.exchange(input), { status: 500, code: 'invalid_configuration' });
  }
  for (const input of [{ callId: '' }, { callId: 'has space' }, { callId: 42 }, {}, { callId: `a${'b'.repeat(128)}` }]) {
    await assert.rejects(instance.hangup(input), { status: 500, code: 'invalid_configuration' });
  }
  assert.equal(fetch.calls.length, 0);

  assert.throws(() => createRealtimeProvider({ readApiKey: () => KEY }), { code: 'invalid_configuration' });
  assert.throws(() => createRealtimeProvider({ fetchImpl: fetch.fetchImpl }), { code: 'invalid_configuration' });
  assert.throws(() => createRealtimeProvider({ fetchImpl: fetch.fetchImpl, readApiKey: () => KEY, timeoutMs: 0 }), { code: 'invalid_configuration' });
  assert.throws(() => createRealtimeProvider({ fetchImpl: fetch.fetchImpl, readApiKey: () => KEY, timeoutMs: 120_000 }), { code: 'invalid_configuration' });
  assert.throws(() => createRealtimeProvider({ fetchImpl: fetch.fetchImpl, readApiKey: () => KEY, timers: {} }), { code: 'invalid_configuration' });
  assert.equal(Object.isFrozen(instance), true);
});
