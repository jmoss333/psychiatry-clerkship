import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  config as netlifyConfig,
  createRealtimeHandler,
  default as productionRealtimeHandler,
  runtimeRealtimeConfig,
  validLedgerPolicy,
} from '../netlify/functions/sp-realtime.mjs';
import { createHttp } from '../netlify/functions/_shared/sp-http.mjs';
import * as governance from '../netlify/functions/_shared/sp-governance.mjs';
import { createRealtimeLedger } from '../netlify/functions/_shared/sp-realtime-ledger.mjs';
import { createRealtimeProvider } from '../netlify/functions/_shared/sp-realtime-provider.mjs';
import {
  createReceiptCodec,
  credentialHash,
  receiptBinding,
} from '../netlify/functions/_shared/sp-realtime-receipt.mjs';
import {
  REALTIME_RATE_CARD,
  realtimeInstructions,
  realtimeSessionConfig,
  sessionCeilingMicros,
  turnBrief,
} from '../netlify/functions/_shared/sp-realtime-session.mjs';
import { _internals } from '../netlify/functions/sp.mjs';
import { createFakeBlobStore } from './helpers/fake-blob-store.mjs';

const { deriveState } = _internals;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW_PACK = fs.readFileSync(path.join(ROOT, '_prototypes/sp-interview/sp-interview.pack.json'));
const PACK_HASH = createHash('sha256').update(RAW_PACK).digest('hex');
const PACK = JSON.parse(RAW_PACK);

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const MINUTE = 60 * 1000;
const ORIGIN = 'https://learn.example.test';
const STUDENT_KEY = 'student-secret';
const OPERATIONS_KEY = 'operations-secret';
const RECEIPT_SECRET = '0123456789abcdef0123456789abcdef';
const ROTATION = 'rotation-2026-09';
const MODEL = 'gpt-realtime-mini-2025-12-15';
const TRANSCRIPTION = 'gpt-4o-mini-transcribe';
const API_KEY = 'sk-test-server-key';
const CASE = 'sp_depression_gated_si_001';
const OTHER_CASE = 'sp_mania_redirect_001';
const ENCOUNTER = Buffer.from(Array.from({ length: 16 }, (_, index) => index + 1)).toString('base64url');
const ENCOUNTER_2 = Buffer.from(Array.from({ length: 16 }, (_, index) => index + 40)).toString('base64url');
const OFFER = 'v=0\r\no=- 4227147428 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=ice-ufrag:offer\r\n';
const ANSWER = 'v=0\r\no=- 9 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=ice-ufrag:answer\r\n';
const LEDGER_KEY = `realtime/${ROTATION}/sessions-v1`;
const EXPECTED_MICROS = sessionCeilingMicros({
  rateCard: REALTIME_RATE_CARD,
  model: MODEL,
  transcriptionModel: TRANSCRIPTION,
  deadlineMinutes: 15,
  maxTurns: PACK.engine.maxTurns,
});

// The text actor's leak corpus (leak.test.mjs / sp-realtime-session.test.mjs).
const CORPUS = [
  {
    caseId: 'sp_depression_gated_si_001',
    secrets: ['looked at it long enough', 'never written anything', 'picked a day', "Tom doesn't know I've thought", 'hung the moon', 'kept the bottle closed', 'waiting for you to look horrified', 'stood in the bathroom'],
    warm: ['Hi, my name is Alex, what would you like me to understand?', "Tell me more about what's been going on, in your own words.", 'That sounds really hard.', 'Have you had thoughts of killing yourself?'],
    warmExpect: 'looked at it long enough',
    warmStillLocked: 'hung the moon',
  },
  {
    caseId: 'sp_mania_redirect_001',
    secrets: ['passenger in my own head', 'nine hundred dollars', 'felt inevitable', "don't know her name", 'ugly flicker', 'Jayden froze the card'],
    warm: ["Hi, my name is Alex, I'm the medical student on the team — before we start, what would you most want from this conversation?", "Tell me what's been going on, in your own words.", 'What have you been spending money on lately?'],
    warmExpect: 'nine hundred dollars',
    warmStillLocked: "don't know her name",
  },
  {
    caseId: 'sp_psychosis_paranoid_001',
    secrets: ['make them stop before they finish', 'To do it myself', 'tired of being afraid of my own apartment', 'since Sunday', "seal's still on", 'sleeping in my car', 'The voice wants that, not me'],
    warm: ["Hi, I'm Alex, no recording here, you're in control.", 'We can stop whenever you want. What has this been like for you, these last few weeks?', 'That sounds really frightening.', 'When the voice talks, does it ever tell you to do anything?'],
    warmExpect: 'make them stop before they finish',
    warmStillLocked: 'sleeping in my car',
  },
];

/* --------------------------------- helpers --------------------------------- */

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function realSnapshot(mutate = null) {
  const pack = JSON.parse(RAW_PACK);
  if (mutate) mutate(pack);
  return deepFreeze({ pack, packHash: PACK_HASH, fetchedAt: NOW });
}

function caseDefFor(caseId, snapshot = realSnapshot()) {
  return snapshot.pack.cases.find((candidate) => candidate.id === caseId);
}

function createTestHttp({ studentKey = STUDENT_KEY } = {}) {
  return createHttp({
    studentKey,
    operationsKey: OPERATIONS_KEY,
    allowedOrigins: [ORIGIN],
    production: true,
  });
}

function learnerRequest(query = '', {
  method = 'GET',
  origin = ORIGIN,
  studentKey = STUDENT_KEY,
  headers = {},
  body,
  signal,
} = {}) {
  const requestHeaders = new Headers(headers);
  if (origin !== null) requestHeaders.set('origin', origin);
  if (studentKey !== null) requestHeaders.set('x-student-key', studentKey);
  return new Request(`https://proxy.example.test/api/sp/realtime${query}`, {
    method,
    headers: requestHeaders,
    body,
    signal,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}

function jsonRequest(op, body, { contentType = 'application/json', raw = null, ...options } = {}) {
  return learnerRequest(`?op=${op}`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: raw ?? JSON.stringify(body),
    ...options,
  });
}

function operationsRequest(query = '?op=usage', { operationsKey = OPERATIONS_KEY, origin = ORIGIN } = {}) {
  const headers = new Headers();
  if (operationsKey !== null) headers.set('x-operations-key', operationsKey);
  if (origin !== null) headers.set('origin', origin);
  return new Request(`https://proxy.example.test/api/sp/realtime${query}`, { method: 'GET', headers });
}

function startBody(overrides = {}) {
  return { caseId: CASE, encounterId: ENCOUNTER, sdp: OFFER, eagerness: 'low', audioSetup: 'speakers', ...overrides };
}

function turnBody(receipt, items, overrides = {}) {
  return {
    receipt,
    caseId: CASE,
    encounterId: ENCOUNTER,
    items,
    lastPatient: { itemId: 'item_pt_0', status: 'complete' },
    ...overrides,
  };
}

function itemsFrom(texts) {
  return texts.map((text, index) => ({ itemId: `item_me_${index}`, text }));
}

async function errorBody(response) {
  return (await response.json()).error;
}

// Fetch-level fake for the real provider: captures every request, answers the
// SDP exchange with a configurable Location, and the hangup with a
// configurable status (a number, or a function of the hangup ordinal).
function fakeFetch({
  answer = ANSWER,
  location = '/v1/realtime/calls/rtc_abc',
  exchangeStatus = 201,
  hangupStatus = 200,
  exchangeError = null,
  hangupError = null,
  hangExchange = false,
} = {}) {
  const calls = [];
  let hangups = 0;
  async function fetchImpl(url, init) {
    calls.push({ url, init });
    if (url.endsWith('/hangup')) {
      hangups += 1;
      if (hangupError) throw hangupError;
      const status = typeof hangupStatus === 'function' ? hangupStatus(hangups) : hangupStatus;
      return new Response(null, { status });
    }
    if (hangExchange) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    }
    if (exchangeError) throw exchangeError;
    const resolvedLocation = typeof location === 'function' ? location(calls.length) : location;
    return new Response(answer, { status: exchangeStatus, headers: { Location: resolvedLocation, 'Content-Type': 'application/sdp' } });
  }
  return {
    fetchImpl,
    calls,
    get exchanges() { return calls.filter((call) => !call.url.endsWith('/hangup')); },
    get hangups() { return calls.filter((call) => call.url.endsWith('/hangup')); },
  };
}

function realProvider(fetchOptions = {}, { timeoutMs = 5_000 } = {}) {
  const fetch = fakeFetch(fetchOptions);
  return {
    fetch,
    provider: createRealtimeProvider({ fetchImpl: fetch.fetchImpl, readApiKey: () => API_KEY, timeoutMs }),
  };
}

function receiptCodecFactory() {
  return ({ maxTurns, clock }) => createReceiptCodec({ secret: RECEIPT_SECRET, clock, maxTurns });
}

function bindingFor({ caseId = CASE, credential = STUDENT_KEY, origin = ORIGIN, packHash = PACK_HASH } = {}) {
  return receiptBinding({ caseId, packHash, origin, rotationId: ROTATION, credentialHash: credentialHash(credential) });
}

// What the provider must receive: the shared module's session object with the
// route's one override (A4: noise reduction follows the learner's audio setup).
function expectedSession({ caseDef, eagerness, voice, audioSetup }) {
  const session = realtimeSessionConfig({ caseDef, model: MODEL, transcriptionModel: TRANSCRIPTION, eagerness, voice });
  session.audio.input.noise_reduction = { type: audioSetup === 'headphones' ? 'near_field' : 'far_field' };
  return session;
}

function openReceipt(token, { caseId = CASE, now = NOW, credential = STUDENT_KEY } = {}) {
  return createReceiptCodec({ secret: RECEIPT_SECRET, clock: () => now, maxTurns: PACK.engine.maxTurns })
    .open(token, { binding: bindingFor({ caseId, credential }) });
}

function enabledHandler({
  snapshot = realSnapshot(),
  fake = createFakeBlobStore(),
  ledger = null,
  ledgerOptions = {},
  providerHarness = realProvider(),
  http = createTestHttp(),
  config = {},
  clock = null,
} = {}) {
  let current = NOW;
  const now = clock ?? (() => current);
  let sequence = 0;
  const ledgerInstance = ledger ?? createRealtimeLedger({
    store: fake.store,
    rotationId: ROTATION,
    capMicros: 20_000_000,
    startLimit: 40,
    windowLimit: 8,
    clock: now,
    ...ledgerOptions,
  });
  const events = [];
  const handler = createRealtimeHandler({
    http,
    packLoader: { async load() { return snapshot; } },
    governance,
    ledger: ledgerInstance,
    provider: providerHarness.provider,
    receiptCodec: receiptCodecFactory(),
    config: {
      enabled: true,
      model: MODEL,
      transcriptionModel: TRANSCRIPTION,
      deadlineMinutes: 15,
      rotationId: ROTATION,
      credentialHash: credentialHash(STUDENT_KEY),
      now,
      randomBytes(size) {
        assert.equal(size, 16);
        sequence += 1;
        return Buffer.alloc(size, sequence);
      },
      ...config,
    },
    logger: (event) => events.push(event),
  });
  return {
    handler,
    fake,
    ledger: ledgerInstance,
    provider: providerHarness,
    fetch: providerHarness.fetch,
    events,
    advance(milliseconds) { current += milliseconds; },
    set now(value) { current = value; },
  };
}

// Dependencies that must never be touched: they throw if they are.
function untouchable(overrides = {}) {
  const calls = { pack: 0, provider: 0, ledger: 0, codec: 0 };
  const input = {
    http: createTestHttp(),
    packLoader: { async load() { calls.pack += 1; throw new Error('pack must not be read'); } },
    governance,
    provider: {
      async exchange() { calls.provider += 1; throw new Error('provider must not be called'); },
      async hangup() { calls.provider += 1; throw new Error('provider must not be called'); },
    },
    ledger: {
      async getBand() { calls.ledger += 1; throw new Error('ledger must not be read'); },
      async getUsage() { calls.ledger += 1; throw new Error('ledger must not be read'); },
      async reserveSession() { calls.ledger += 1; throw new Error('ledger must not be written'); },
      async endSession() { calls.ledger += 1; throw new Error('ledger must not be written'); },
      async expiredSessions() { calls.ledger += 1; throw new Error('ledger must not be read'); },
    },
    receiptCodec() { calls.codec += 1; throw new Error('codec must not be built'); },
    config: { enabled: false, now: () => NOW },
    ...overrides,
  };
  return { input, calls };
}

async function startSession(harness, overrides = {}) {
  const response = await harness.handler(jsonRequest('start', startBody(overrides)));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  return response.json();
}

function captureConsole(t) {
  const lines = [];
  const original = { info: console.info, error: console.error, warn: console.warn, log: console.log };
  for (const level of Object.keys(original)) {
    console[level] = (...args) => { lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg) ?? String(arg))).join(' ')); };
  }
  t.after(() => { Object.assign(console, original); });
  return lines;
}

const DISABLED_HEALTH = Object.freeze({
  schemaVersion: 1,
  enabled: false,
  acceptingSessions: false,
  model: null,
  transcriptionModel: null,
  budgetBand: null,
  deadlineMinutes: null,
  eagerness: [],
  cases: [],
});

/* ----------------------------------- tests ----------------------------------- */

test('exports the exact Netlify path; preflight, origin, credential and method refusals happen before any dependency is touched', async () => {
  assert.deepEqual(netlifyConfig, {
    path: '/api/sp/realtime',
    rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
  });
  const harness = untouchable();
  const handler = createRealtimeHandler(harness.input);

  for (const query of ['', '?op=start', '?op=turn', '?op=end']) {
    const response = await handler(learnerRequest(query, { method: 'OPTIONS', studentKey: null }));
    assert.equal(response.status, 204, query);
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(response.headers.get('access-control-allow-headers'), /x-student-key/);
  }
  const unknownPreflight = await handler(learnerRequest('?op=usage', { method: 'OPTIONS', studentKey: null }));
  assert.equal(unknownPreflight.status, 405);
  assert.equal(unknownPreflight.headers.has('access-control-allow-origin'), false);

  const noOrigin = await handler(learnerRequest('', { origin: null }));
  assert.equal(noOrigin.status, 403);
  assert.equal((await errorBody(noOrigin)).code, 'origin_not_allowed');
  const wrongOrigin = await handler(learnerRequest('', { origin: 'https://attacker.example.test' }));
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.headers.has('access-control-allow-origin'), false);

  const missingKey = await handler(learnerRequest('', { studentKey: null }));
  assert.equal(missingKey.status, 401);
  assert.equal((await errorBody(missingKey)).code, 'unauthorized');
  assert.equal(missingKey.headers.get('access-control-allow-origin'), ORIGIN);
  const wrongKey = await handler(jsonRequest('start', startBody(), { studentKey: 'wrong' }));
  assert.equal(wrongKey.status, 401);

  for (const [query, method] of [
    ['?op=start', 'GET'],
    ['?op=turn', 'GET'],
    ['?op=end', 'GET'],
    ['', 'POST'],
    ['?op=unknown', 'POST'],
    ['?op=usage', 'POST'],
    ['?op=start', 'PUT'],
    ['', 'DELETE'],
  ]) {
    const response = await handler(learnerRequest(query, { method }));
    assert.equal(response.status, 405, `${method} ${query}`);
    assert.equal((await errorBody(response)).code, 'method_not_allowed');
  }
  assert.deepEqual(harness.calls, { pack: 0, provider: 0, ledger: 0, codec: 0 });
});

test('disabled: health is the disabled shape and every POST is 503 realtime_disabled with no body read, no provider, no ledger', async () => {
  const harness = untouchable();
  const handler = createRealtimeHandler(harness.input);

  const health = await handler(learnerRequest());
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), DISABLED_HEALTH);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');

  for (const op of ['start', 'turn', 'end']) {
    const body = new ReadableStream({ pull() { throw new Error('disabled request body must not be read'); } });
    const request = learnerRequest(`?op=${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const response = await handler(request);
    assert.equal(response.status, 503, op);
    assert.deepEqual(await errorBody(response), { code: 'realtime_disabled', message: 'The spoken Interview Room is not available.' });
    assert.equal(request.bodyUsed, false);
  }
  assert.deepEqual(harness.calls, { pack: 0, provider: 0, ledger: 0, codec: 0 });

  assert.throws(() => createRealtimeHandler({ http: createTestHttp(), config: {} }), { code: 'invalid_configuration' });
  assert.throws(() => createRealtimeHandler({ config: { enabled: false } }), { code: 'invalid_configuration' });
});

test('enabled without both model pins, or with an out-of-range deadline, fails closed: 503 invalid_configuration, zero provider fetches', async () => {
  const base = {
    enabled: true,
    model: MODEL,
    transcriptionModel: TRANSCRIPTION,
    deadlineMinutes: 15,
    rotationId: ROTATION,
    credentialHash: credentialHash(STUDENT_KEY),
    now: () => NOW,
  };
  for (const broken of [
    { model: null },
    { model: '' },
    { model: ' padded ' },
    { transcriptionModel: undefined },
    { deadlineMinutes: 2 },
    { deadlineMinutes: 61 },
    { deadlineMinutes: 15.5 },
    { rotationId: '' },
    { credentialHash: 'not-a-digest' },
  ]) {
    const harness = untouchable({ config: { ...base, ...broken } });
    const handler = createRealtimeHandler(harness.input);
    for (const request of [learnerRequest(), jsonRequest('start', startBody()), jsonRequest('turn', turnBody('x', itemsFrom(['hi']))), jsonRequest('end', { receipt: 'x', caseId: CASE, encounterId: ENCOUNTER })]) {
      const response = await handler(request);
      assert.equal(response.status, 503, JSON.stringify(broken));
      assert.equal((await errorBody(response)).code, 'invalid_configuration');
    }
    assert.deepEqual(harness.calls, { pack: 0, provider: 0, ledger: 0, codec: 0 });
  }
});

test('an unapproved pack, an unknown case and an unreviewed case are refused before any ledger or provider work', async () => {
  const draftPack = enabledHandler({ snapshot: realSnapshot((pack) => { pack.status = 'draft-pending-attestation'; }) });
  for (const request of [
    jsonRequest('start', startBody()),
    jsonRequest('turn', turnBody('x', itemsFrom(['hi']))),
    jsonRequest('end', { receipt: 'x', caseId: CASE, encounterId: ENCOUNTER }),
  ]) {
    const response = await draftPack.handler(request);
    assert.equal(response.status, 403);
    assert.equal((await errorBody(response)).code, 'pack_not_approved');
  }
  // The unapproved pack also disables the advisory surface.
  const draftHealth = await draftPack.handler(learnerRequest());
  assert.equal(draftHealth.status, 200);
  assert.deepEqual(await draftHealth.json(), DISABLED_HEALTH);
  assert.deepEqual(draftPack.fetch.calls, []);
  assert.deepEqual(draftPack.fake.calls, []);

  const harness = enabledHandler({ snapshot: realSnapshot((pack) => { pack.cases[0].facultyReview.status = 'draft'; }) });
  const unknown = await harness.handler(jsonRequest('start', startBody({ caseId: 'sp_unknown_999' })));
  assert.equal(unknown.status, 400);
  assert.equal((await errorBody(unknown)).code, 'unknown_case');
  const unreviewed = await harness.handler(jsonRequest('start', startBody()));
  assert.equal(unreviewed.status, 403);
  assert.equal((await errorBody(unreviewed)).code, 'case_not_reviewed');
  const unreviewedTurn = await harness.handler(jsonRequest('turn', turnBody('x', itemsFrom(['hi']))));
  assert.equal(unreviewedTurn.status, 403);
  assert.deepEqual(harness.fetch.calls, []);
  assert.deepEqual(harness.fake.calls, []);
  // The demoted case disappears from health; the others keep their voices.
  const health = await (await harness.handler(learnerRequest())).json();
  assert.deepEqual(health.cases.map((entry) => entry.id), ['sp_mania_redirect_001', 'sp_psychosis_paranoid_001']);
});

test('start: the exact provider exchange, an exact response, a receipt that opens under its binding, and one active ledger session', async () => {
  const harness = enabledHandler();
  const body = await startSession(harness);

  assert.deepEqual(Object.keys(body).sort(), ['brief', 'deadline', 'model', 'opening', 'receipt', 'sdp', 'state', 'turn', 'voice']);
  assert.equal(body.sdp, ANSWER);
  assert.equal(body.deadline, NOW + 15 * MINUTE);
  assert.equal(body.turn, 0);
  assert.equal(body.model, MODEL);
  assert.equal(body.voice, 'marin');
  const caseDef = caseDefFor(CASE);
  assert.equal(body.opening, caseDef.persona.opening);
  assert.equal(body.brief, turnBrief(caseDef, deriveState(caseDef, []), { opening: true }));
  assert.ok(body.brief.includes(`"${caseDef.persona.opening}"`));
  for (const secret of CORPUS[0].secrets) assert.ok(!body.brief.includes(secret), `opening brief leaked ${secret}`);
  assert.deepEqual(body.state, { intents: [], flags: [], rapport: 0, unlocked: [] });
  assert.ok(!('callId' in body));
  assert.ok(!JSON.stringify(body).includes('rtc_abc'), 'the call id never reaches the browser');

  const payload = openReceipt(body.receipt);
  assert.deepEqual(payload, {
    v: 1,
    encounterId: ENCOUNTER,
    caseId: CASE,
    callId: 'rtc_abc',
    sid: '01'.repeat(16),
    turn: 0,
    startedAt: NOW,
    deadline: NOW + 15 * MINUTE,
  });
  assert.throws(() => createReceiptCodec({ secret: RECEIPT_SECRET, clock: () => NOW }).open(body.receipt, { binding: bindingFor({ caseId: OTHER_CASE }) }), { code: 'invalid_realtime_receipt' });

  // Exactly one exchange, shaped as the contract says.
  assert.equal(harness.fetch.exchanges.length, 1);
  assert.equal(harness.fetch.hangups.length, 0);
  const { url, init } = harness.fetch.exchanges[0];
  assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(init.headers.Accept, 'application/sdp');
  assert.ok(init.body instanceof FormData);
  const sdpPart = init.body.get('sdp');
  const sessionPart = init.body.get('session');
  assert.equal(sdpPart.type, 'application/sdp');
  assert.equal(await sdpPart.text(), OFFER);
  assert.equal(sessionPart.type, 'application/json');
  // The session part IS the shared module's output with only the noise
  // reduction overridden, so this assertion follows the module rather than
  // pinning turn-detection literals here.
  const session = JSON.parse(await sessionPart.text());
  assert.deepEqual(session, expectedSession({ caseDef, eagerness: 'low', voice: 'marin', audioSetup: 'speakers' }));
  assert.equal(session.instructions, realtimeInstructions(caseDef));
  assert.equal(session.audio.input.transcription.model, TRANSCRIPTION);
  assert.equal(session.model, MODEL);

  // The ledger: one active session, charged the ceiling, nothing reserved.
  const usage = await harness.ledger.getUsage();
  assert.equal(usage.activeSessions, 1);
  assert.equal(usage.startsToday, 1);
  assert.equal(usage.reservedMicros, 0);
  assert.equal(usage.spentMicros, EXPECTED_MICROS);
  const stored = harness.fake.read(LEDGER_KEY);
  assert.deepEqual(Object.values(stored.sessions).map((entry) => [entry.status, entry.callId]), [['active', 'rtc_abc']]);
  assert.ok(!JSON.stringify(stored).includes('v=0'), 'the ledger never holds an SDP');

  assert.deepEqual(harness.events.filter((event) => event.event === 'sp_realtime_start'), [
    { event: 'sp_realtime_start', caseId: CASE, turn: 0, band: 'ok', durationMs: 0 },
  ]);
});

test('start: headphones select near-field noise reduction, medium eagerness is honoured, and a bare Location still yields the call id', async () => {
  const harness = enabledHandler({ providerHarness: realProvider({ location: 'rtc_bare_77' }) });
  const body = await startSession(harness, { audioSetup: 'headphones', eagerness: 'medium', encounterId: ENCOUNTER_2 });
  const session = JSON.parse(await harness.fetch.exchanges[0].init.body.get('session').text());
  assert.deepEqual(session, expectedSession({ caseDef: caseDefFor(CASE), eagerness: 'medium', voice: 'marin', audioSetup: 'headphones' }));
  assert.deepEqual(session.audio.input.noise_reduction, { type: 'near_field' });
  assert.equal(openReceipt(body.receipt).callId, 'rtc_bare_77');
  const stored = harness.fake.read(LEDGER_KEY);
  assert.deepEqual(Object.values(stored.sessions).map((entry) => entry.callId), ['rtc_bare_77']);
});

test('start: every provider failure releases the reservation (nothing reserved, nothing active) and maps to a stable status', async () => {
  const failures = [
    [{ exchangeStatus: 500 }, 502, 'provider_status'],
    [{ exchangeStatus: 401 }, 502, 'provider_auth'],
    [{ exchangeStatus: 429 }, 502, 'provider_limit'],
    [{ exchangeError: new TypeError('fetch failed') }, 502, 'provider_connection'],
    [{ answer: 'not an sdp' }, 502, 'provider_status'],
    [{ location: '/v1/realtime/calls/' }, 502, 'provider_status'],
  ];
  for (const [options, status, code] of failures) {
    const harness = enabledHandler({ providerHarness: realProvider(options) });
    const response = await harness.handler(jsonRequest('start', startBody()));
    assert.equal(response.status, status, code);
    assert.equal((await errorBody(response)).code, code);
    const usage = await harness.ledger.getUsage();
    assert.equal(usage.reservedMicros, 0, code);
    assert.equal(usage.spentMicros, 0, code);
    assert.equal(usage.activeSessions, 0, code);
    assert.deepEqual(harness.fake.read(LEDGER_KEY).sessions, {}, code);
    assert.equal(harness.fetch.exchanges.length, 1);
  }
  // Timeout → 504, same release.
  const slow = enabledHandler({ providerHarness: realProvider({ hangExchange: true }, { timeoutMs: 5 }) });
  const timedOut = await slow.handler(jsonRequest('start', startBody()));
  assert.equal(timedOut.status, 504);
  assert.equal((await errorBody(timedOut)).code, 'provider_timeout');
  assert.deepEqual(slow.fake.read(LEDGER_KEY).sessions, {});
  // A missing server key is a configuration fault, and still releases.
  const keyless = enabledHandler({ providerHarness: { provider: createRealtimeProvider({ fetchImpl: async () => { throw new Error('must not fetch'); }, readApiKey: () => undefined }), fetch: fakeFetch() } });
  const noKey = await keyless.handler(jsonRequest('start', startBody()));
  assert.equal(noKey.status, 503);
  assert.equal((await errorBody(noKey)).code, 'invalid_configuration');
  assert.deepEqual(keyless.fake.read(LEDGER_KEY).sessions, {});
});

test('start: a live call the ledger cannot attach is hung up, not adopted', async () => {
  const fake = createFakeBlobStore();
  const real = createRealtimeLedger({ store: fake.store, rotationId: ROTATION, capMicros: 20_000_000, clock: () => NOW });
  let attachFailures = 0;
  const ledger = {
    ...real,
    async attachCall() { attachFailures += 1; throw new Error('blob store went away'); },
  };
  const harness = enabledHandler({ fake, ledger });
  const response = await harness.handler(jsonRequest('start', startBody()));
  assert.equal(response.status, 503);
  assert.equal((await errorBody(response)).code, 'budget_unavailable');
  assert.equal(attachFailures, 1);
  assert.equal(harness.fetch.hangups.length, 1);
  assert.match(harness.fetch.hangups[0].url, /\/rtc_abc\/hangup$/);
  assert.deepEqual(fake.read(LEDGER_KEY).sessions, {}, 'the reservation was released');
});

test('start: ledger refusals surface as 429 with the ledger code and the provider is never called; an unavailable ledger is 503', async () => {
  const daily = enabledHandler({ ledgerOptions: { startLimit: 1, windowLimit: 8 } });
  await startSession(daily);
  assert.equal(daily.fetch.exchanges.length, 1);
  const secondDaily = await daily.handler(jsonRequest('start', startBody({ encounterId: ENCOUNTER_2 })));
  assert.equal(secondDaily.status, 429);
  assert.equal((await errorBody(secondDaily)).code, 'realtime_daily_starts_exhausted');
  assert.equal(daily.fetch.exchanges.length, 1, 'refused start never reached the provider');

  const window = enabledHandler({ ledgerOptions: { startLimit: 5, windowLimit: 1 } });
  await startSession(window);
  const secondWindow = await window.handler(jsonRequest('start', startBody({ encounterId: ENCOUNTER_2 })));
  assert.equal(secondWindow.status, 429);
  assert.equal((await errorBody(secondWindow)).code, 'realtime_window_exhausted');
  assert.equal(window.fetch.exchanges.length, 1);
  // The rolling window opens again; the daily limit has room.
  window.advance(31 * MINUTE);
  await startSession(window, { encounterId: ENCOUNTER_2 });

  const capped = enabledHandler({ ledgerOptions: { capMicros: EXPECTED_MICROS - 1 } });
  const cap = await capped.handler(jsonRequest('start', startBody()));
  assert.equal(cap.status, 429);
  assert.equal((await errorBody(cap)).code, 'realtime_budget_reserved');
  assert.deepEqual(capped.fetch.calls, []);

  const down = enabledHandler({ fake: createFakeBlobStore({ unavailable: true }) });
  const unavailable = await down.handler(jsonRequest('start', startBody()));
  assert.equal(unavailable.status, 503);
  assert.equal((await errorBody(unavailable)).code, 'budget_unavailable');
  assert.deepEqual(down.fetch.calls, []);
  const downHealth = await down.handler(learnerRequest());
  assert.equal(downHealth.status, 503);
  assert.equal((await errorBody(downHealth)).code, 'budget_unavailable');
});

test('start: request validation is exact-key and every field is bounded', async () => {
  const harness = enabledHandler();
  const bad = [
    ['missing key', (body) => { delete body.audioSetup; }],
    ['extra key', (body) => { body.turn = 0; }],
    ['sdp not an offer', (body) => { body.sdp = 'o=- 1 1'; }],
    ['sdp too large', (body) => { body.sdp = `v=0\r\n${'a'.repeat(64 * 1024)}`; }],
    ['sdp with NUL', (body) => { body.sdp = 'v=0\u0000'; }],
    ['sdp not a string', (body) => { body.sdp = ['v=0']; }],
    ['bad eagerness', (body) => { body.eagerness = 'high'; }],
    ['bad audio setup', (body) => { body.audioSetup = 'laptop'; }],
    ['non-canonical encounter', (body) => { body.encounterId = 'AAAAAAAAAAAAAAAAAAAAAB'; }],
    ['short encounter', (body) => { body.encounterId = 'short'; }],
    ['blank case', (body) => { body.caseId = ' '; }],
    ['long case', (body) => { body.caseId = 'c'.repeat(65); }],
  ];
  for (const [label, mutate] of bad) {
    const body = startBody();
    mutate(body);
    const response = await harness.handler(jsonRequest('start', body));
    assert.equal(response.status, 400, label);
    assert.equal((await errorBody(response)).code, 'invalid_request', label);
  }
  const wrongType = await harness.handler(jsonRequest('start', startBody(), { contentType: 'text/plain' }));
  assert.equal(wrongType.status, 415);
  const notJson = await harness.handler(jsonRequest('start', null, { raw: '{not json' }));
  assert.equal(notJson.status, 400);
  const array = await harness.handler(jsonRequest('start', null, { raw: '[]' }));
  assert.equal(array.status, 400);
  const declared = await harness.handler(learnerRequest('?op=start', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(140 * 1024 + 1) }, body: JSON.stringify(startBody()) }));
  assert.equal(declared.status, 413);
  const oversized = await harness.handler(jsonRequest('start', startBody({ sdp: `v=0${'x'.repeat(200 * 1024)}` })));
  assert.equal(oversized.status, 413);
  assert.deepEqual(harness.fetch.calls, []);
  assert.deepEqual(harness.fake.calls, []);
});

test('turn: over the real pack the brief reveals what the learner earned and nothing still locked, the state is the text engine’s, and the receipt turn is the transcript length', async () => {
  for (const { caseId, secrets, warm, warmExpect, warmStillLocked } of CORPUS) {
    const harness = enabledHandler();
    const started = await startSession(harness, { caseId });
    const caseDef = caseDefFor(caseId);

    // Turn 1: a single opening line unlocks nothing.
    const first = await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(warm.slice(0, 1)), { caseId })));
    assert.equal(first.status, 200, caseId);
    const firstBody = await first.json();
    assert.deepEqual(Object.keys(firstBody).sort(), ['brief', 'deadline', 'receipt', 'state', 'turn']);
    assert.equal(firstBody.turn, 1);
    assert.equal(firstBody.deadline, started.deadline);
    for (const secret of secrets) assert.ok(!firstBody.brief.includes(secret), `${caseId}: turn-1 brief leaked ${secret}`);
    assert.equal(openReceipt(firstBody.receipt, { caseId }).turn, 1);

    // The warm sequence earns exactly one disclosure.
    const items = itemsFrom(warm);
    const response = await harness.handler(jsonRequest('turn', turnBody(firstBody.receipt, items, { caseId })));
    assert.equal(response.status, 200, caseId);
    const body = await response.json();
    assert.equal(body.turn, items.length);
    assert.ok(body.brief.includes(warmExpect), `${caseId}: earned reveal is in the brief`);
    assert.ok(!body.brief.includes(warmStillLocked), `${caseId}: still-locked reveal stays out`);
    const state = deriveState(caseDef, warm);
    assert.equal(body.brief, turnBrief(caseDef, state));
    assert.deepEqual(body.state, {
      intents: state.lastIntents,
      flags: state.lastFlags,
      rapport: state.rapport,
      unlocked: Object.keys(state.unlocked),
    });
    const payload = openReceipt(body.receipt, { caseId });
    assert.equal(payload.turn, items.length);
    assert.equal(payload.callId, 'rtc_abc');
    assert.equal(payload.deadline, started.deadline);
    // The receipt's turn is a floor: a shorter transcript is a replay.
    const replay = await harness.handler(jsonRequest('turn', turnBody(body.receipt, itemsFrom(warm.slice(0, 2)), { caseId })));
    assert.equal(replay.status, 400);
    assert.equal((await errorBody(replay)).code, 'invalid_request');
    // Turns never touch the provider or write the ledger.
    assert.equal(harness.fetch.calls.length, 1);
    assert.equal(harness.fake.calls.filter((call) => call.method === 'set').length, 2, 'reserve + attach only');
    assert.deepEqual(harness.events.filter((event) => event.event === 'sp_realtime_turn').map((event) => event.turn), [1, items.length]);
  }
});

test('turn: cap, forged, foreign-case and replaced-passcode receipts are refused', async () => {
  const harness = enabledHandler();
  const started = await startSession(harness);
  const maxTurns = PACK.engine.maxTurns;

  const overCap = await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(Array.from({ length: maxTurns + 1 }, (_, index) => `Question ${index}?`)))));
  assert.equal(overCap.status, 429);
  assert.equal((await errorBody(overCap)).code, 'turn_cap_reached');
  const atCap = await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(Array.from({ length: maxTurns }, (_, index) => `Question ${index}?`)))));
  assert.equal(atCap.status, 200, 'the last permitted turn is allowed');

  const raw = Buffer.from(started.receipt, 'base64url');
  raw[raw.length - 1] ^= 0x01;
  const forged = await harness.handler(jsonRequest('turn', turnBody(raw.toString('base64url'), itemsFrom(['Hello?']))));
  assert.equal(forged.status, 400);
  assert.equal((await errorBody(forged)).code, 'invalid_realtime_receipt');
  const garbage = await harness.handler(jsonRequest('turn', turnBody('not-a-receipt', itemsFrom(['Hello?']))));
  assert.equal(garbage.status, 400);
  assert.equal((await errorBody(garbage)).code, 'invalid_realtime_receipt');

  // Another reviewed case: the binding differs, so the receipt does not open.
  const foreign = await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(['Hello?']), { caseId: OTHER_CASE })));
  assert.equal(foreign.status, 400);
  assert.equal((await errorBody(foreign)).code, 'invalid_realtime_receipt');
  // Another encounter id under the same case: the payload does not match.
  const otherEncounter = await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(['Hello?']), { encounterId: ENCOUNTER_2 })));
  assert.equal(otherEncounter.status, 400);
  assert.equal((await errorBody(otherEncounter)).code, 'invalid_realtime_receipt');

  // An emergency passcode replacement fails every outstanding receipt closed.
  const replaced = enabledHandler({
    fake: harness.fake,
    http: createTestHttp({ studentKey: 'replaced-passcode' }),
    config: { credentialHash: credentialHash('replaced-passcode') },
  });
  const afterRotation = await replaced.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(['Hello?'])), { studentKey: 'replaced-passcode' }));
  assert.equal(afterRotation.status, 400);
  assert.equal((await errorBody(afterRotation)).code, 'invalid_realtime_receipt');
  assert.equal(harness.fetch.hangups.length, 0);
});

test('turn: items and lastPatient are validated exactly, and a non-operational failure logs no learner text', async (t) => {
  const harness = enabledHandler();
  const started = await startSession(harness);
  const valid = itemsFrom(['Hello, what brings you in?']);

  for (const lastPatient of [
    { itemId: 'item_pt_0', status: 'complete' },
    { itemId: 'item_pt_0', status: 'interrupted' },
    { itemId: null, status: 'none' },
    { itemId: 'item_pt_1', status: 'incomplete' },
    { itemId: 'item_pt_1', status: 'failed' },
  ]) {
    const response = await harness.handler(jsonRequest('turn', turnBody(started.receipt, valid, { lastPatient })));
    assert.equal(response.status, 200, JSON.stringify(lastPatient));
  }
  const rejectedPatient = [
    { itemId: 'item_pt_0' },
    { itemId: 'item_pt_0', status: 'complete', extra: 1 },
    { itemId: 'item_pt_0', status: 'heard' },
    { itemId: 'item_pt_0', status: 'played' },
    { itemId: 42, status: 'complete' },
    { itemId: 'has space', status: 'complete' },
    null,
    'complete',
  ];
  for (const lastPatient of rejectedPatient) {
    const response = await harness.handler(jsonRequest('turn', turnBody(started.receipt, valid, { lastPatient })));
    assert.equal(response.status, 400, JSON.stringify(lastPatient));
    assert.equal((await errorBody(response)).code, 'invalid_request');
  }
  const rejectedItems = [
    [],
    'not an array',
    [{ itemId: 'a', text: 'ok', extra: true }],
    [{ itemId: 'a' }],
    [{ itemId: '', text: 'ok' }],
    [{ itemId: 'bad id', text: 'ok' }],
    [{ itemId: 'a'.repeat(129), text: 'ok' }],
    [{ itemId: 'a', text: '' }],
    [{ itemId: 'a', text: '   ' }],
    [{ itemId: 'a', text: 'x'.repeat(1201) }],
    [{ itemId: 'a', text: 'control\u0007char' }],
    [{ itemId: 'a', text: 'lone\ud800surrogate' }],
    [{ itemId: 'a', text: 42 }],
    [{ itemId: 'dup', text: 'one' }, { itemId: 'dup', text: 'two' }],
  ];
  for (const items of rejectedItems) {
    const response = await harness.handler(jsonRequest('turn', turnBody(started.receipt, items)));
    assert.equal(response.status, 400, JSON.stringify(items).slice(0, 60));
    assert.equal((await errorBody(response)).code, 'invalid_request');
  }
  const okTexts = await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(['line one\nline two\ttabbed', 'x'.repeat(1200)]))));
  assert.equal(okTexts.status, 200, 'newlines, tabs and the 1200-character bound are fine');
  for (const body of [{ ...turnBody(started.receipt, valid), extra: 1 }, (() => { const b = turnBody(started.receipt, valid); delete b.lastPatient; return b; })(), turnBody(42, valid)]) {
    const response = await harness.handler(jsonRequest('turn', body));
    assert.equal(response.status, 400);
  }

  // A TypeError thrown inside state derivation with the learner's words in its
  // message: the response is a generic 500 and no log line carries the words.
  const learnerText = 'MY-UNIQUE-LEARNER-UTTERANCE-7f3a';
  const poisoned = realSnapshot((pack) => {
    pack.cases[0].intents[0].patterns = {
      map: () => [{ test(text) { throw new TypeError(`unexpected input: ${text}`); } }],
    };
  });
  const consoleLines = captureConsole(t);
  const broken = enabledHandler({ snapshot: poisoned });
  const brokenStart = await startSession(broken);
  const response = await broken.handler(jsonRequest('turn', turnBody(brokenStart.receipt, itemsFrom([learnerText]))));
  assert.equal(response.status, 500);
  assert.deepEqual(await errorBody(response), { code: 'internal_error', message: 'Internal server error.' });
  const internal = broken.events.filter((event) => event.event === 'sp_realtime_internal_error');
  assert.equal(internal.length, 1);
  assert.equal(internal[0].name, 'TypeError');
  assert.equal(internal[0].op, 'turn');
  assert.ok(Array.isArray(internal[0].frames) && internal[0].frames.length > 0, 'frames locate the throw');
  const everything = [...consoleLines, ...broken.events.map((event) => JSON.stringify(event))].join('\n');
  assert.ok(!everything.includes(learnerText), 'no log line carries the learner text');
  assert.ok(!everything.includes('unexpected input'), 'the error message itself is not logged');
});

test('an expired receipt on op=turn hangs the call up exactly once, ends the ledger session and answers 410; on op=end it hangs up and answers 200', async () => {
  const harness = enabledHandler();
  const started = await startSession(harness);
  harness.advance(15 * MINUTE);

  const turn = await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(['Hello?']))));
  assert.equal(turn.status, 410);
  assert.deepEqual(await errorBody(turn), { code: 'realtime_session_expired', message: 'This spoken encounter has ended. Start a new one.' });
  assert.equal(harness.fetch.hangups.length, 1);
  assert.equal(harness.fetch.hangups[0].url, 'https://api.openai.com/v1/realtime/calls/rtc_abc/hangup');
  assert.equal(harness.fetch.hangups[0].init.headers.Authorization, `Bearer ${API_KEY}`);
  const usage = await harness.ledger.getUsage();
  assert.equal(usage.activeSessions, 0);
  assert.deepEqual(await harness.ledger.expiredSessions(), [], 'nothing left for the reaper');
  assert.equal(harness.fake.read(LEDGER_KEY).sessions[Object.keys(harness.fake.read(LEDGER_KEY).sessions)[0]].status, 'ended');
  assert.deepEqual(harness.events.filter((event) => event.event === 'sp_realtime_end'), [
    { event: 'sp_realtime_end', caseId: CASE, turn: 0, reason: 'expired', hungUp: true, ended: true },
  ]);

  // op=end accepts the expired receipt and still hangs up (404 = already gone).
  const ending = enabledHandler({ providerHarness: realProvider({ hangupStatus: (ordinal) => (ordinal === 1 ? 200 : 404) }) });
  const second = await startSession(ending);
  ending.advance(20 * MINUTE);
  const end = await ending.handler(jsonRequest('end', { receipt: second.receipt, caseId: CASE, encounterId: ENCOUNTER }));
  assert.equal(end.status, 200);
  assert.deepEqual(await end.json(), { ended: true });
  assert.equal(ending.fetch.hangups.length, 1);
  assert.equal((await ending.ledger.getUsage()).activeSessions, 0);
  // Still idempotent after expiry.
  const again = await ending.handler(jsonRequest('end', { receipt: second.receipt, caseId: CASE, encounterId: ENCOUNTER }));
  assert.equal(again.status, 200);
  assert.equal(ending.fetch.hangups.length, 2);
  // A ledger that cannot be reached does not stop the hangup on an expired turn.
  const flaky = enabledHandler();
  const third = await startSession(flaky);
  flaky.advance(16 * MINUTE);
  flaky.fake.store.getWithMetadata = async () => { throw new Error('store down'); };
  const flakyTurn = await flaky.handler(jsonRequest('turn', turnBody(third.receipt, itemsFrom(['Hello?']))));
  assert.equal(flakyTurn.status, 410);
  assert.equal(flaky.fetch.hangups.length, 1);
  assert.deepEqual(flaky.events.filter((event) => event.event === 'sp_realtime_stop_failed'), [
    { event: 'sp_realtime_stop_failed', step: 'ledger', reason: 'expired', code: 'budget_unavailable' },
  ]);
});

test('op=end hangs up and closes the ledger row; it is idempotent; a refused hangup leaves the row for the reaper', async () => {
  const harness = enabledHandler({ providerHarness: realProvider({ hangupStatus: (ordinal) => (ordinal === 1 ? 200 : 404) }) });
  const started = await startSession(harness);
  const endBody = { receipt: started.receipt, caseId: CASE, encounterId: ENCOUNTER };

  const first = await harness.handler(jsonRequest('end', endBody));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ended: true });
  assert.equal(harness.fetch.hangups.length, 1);
  assert.equal(harness.fetch.hangups[0].url, 'https://api.openai.com/v1/realtime/calls/rtc_abc/hangup');
  let usage = await harness.ledger.getUsage();
  assert.equal(usage.activeSessions, 0);
  assert.equal(usage.spentMicros, EXPECTED_MICROS, 'ending never refunds the charge');

  const second = await harness.handler(jsonRequest('end', endBody));
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { ended: true });
  assert.equal(harness.fetch.hangups.length, 2, 'each end hangs up; the provider answers 404 for a call already gone');
  usage = await harness.ledger.getUsage();
  assert.equal(usage.activeSessions, 0);
  assert.deepEqual(harness.events.filter((event) => event.event === 'sp_realtime_end').map((event) => event.reason), ['learner', 'learner']);

  // A turn after the end still derives state (the browser may finish its
  // transcript), but the ledger row stays closed.
  const afterEnd = await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom(['Thank you.']))));
  assert.equal(afterEnd.status, 200);

  // Validation and mismatches.
  for (const body of [
    { ...endBody, extra: 1 },
    { receipt: started.receipt, caseId: CASE },
    { ...endBody, receipt: 42 },
    { ...endBody, encounterId: 'short' },
  ]) {
    const response = await harness.handler(jsonRequest('end', body));
    assert.equal(response.status, 400);
    assert.equal((await errorBody(response)).code, 'invalid_request');
  }
  const foreign = await harness.handler(jsonRequest('end', { ...endBody, caseId: OTHER_CASE }));
  assert.equal(foreign.status, 400);
  assert.equal((await errorBody(foreign)).code, 'invalid_realtime_receipt');

  // A provider that refuses the hangup: the error surfaces and the row stays
  // active, so the reaper retries at the deadline.
  const refusing = enabledHandler({ providerHarness: realProvider({ hangupStatus: 500 }) });
  const live = await startSession(refusing);
  const refused = await refusing.handler(jsonRequest('end', { receipt: live.receipt, caseId: CASE, encounterId: ENCOUNTER }));
  assert.equal(refused.status, 502);
  assert.equal((await errorBody(refused)).code, 'provider_status');
  assert.equal((await refusing.ledger.getUsage()).activeSessions, 1);
});

test('health when enabled: pins, band, deadline, eagerness and every reviewed case with its voice; capped stops accepting', async () => {
  const harness = enabledHandler();
  const response = await harness.handler(learnerRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    enabled: true,
    acceptingSessions: true,
    model: MODEL,
    transcriptionModel: TRANSCRIPTION,
    budgetBand: 'ok',
    deadlineMinutes: 15,
    eagerness: ['low', 'medium'],
    cases: [
      { id: 'sp_depression_gated_si_001', title: 'Dana — Day 1 Admission Interview', voice: 'marin' },
      { id: 'sp_mania_redirect_001', title: 'Marcus — Day 1 After a Sleepless Week', voice: 'cedar' },
      { id: 'sp_psychosis_paranoid_001', title: 'Ray — First Days, Guarded and Afraid', voice: 'cedar' },
    ],
  });
  assert.deepEqual(harness.fetch.calls, [], 'health never contacts the provider');

  for (const [band, accepting] of [['warning', true], ['capped', false]]) {
    const banded = enabledHandler({ ledger: { async getBand() { return band; } } });
    const body = await (await banded.handler(learnerRequest())).json();
    assert.equal(body.budgetBand, band);
    assert.equal(body.acceptingSessions, accepting);
    assert.equal(body.enabled, true);
  }
  const nonsense = enabledHandler({ ledger: { async getBand() { return 'plenty'; } } });
  const invalid = await nonsense.handler(learnerRequest());
  assert.equal(invalid.status, 503);
  assert.equal((await errorBody(invalid)).code, 'invalid_configuration');

  // A reviewed stock speech profile wins over the audition table in health too.
  const profiled = enabledHandler({
    snapshot: realSnapshot((pack) => {
      pack.cases[0].speechProfile.status = 'reviewed';
      pack.cases[0].speechProfile.facultyReview.status = 'reviewed';
      pack.cases[0].speechProfile.voiceId = 'sage';
    }),
  });
  const profiledBody = await (await profiled.handler(learnerRequest())).json();
  assert.equal(profiledBody.cases[0].voice, 'sage');
});

test('operations usage requires the operations key, carries no learner CORS, and works while the room is disabled', async () => {
  const harness = enabledHandler();
  await startSession(harness);
  const response = await harness.handler(operationsRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const usage = await response.json();
  assert.deepEqual(Object.keys(usage).sort(), ['activeSessions', 'band', 'capMicros', 'currency', 'reservedMicros', 'schemaVersion', 'spentMicros', 'startLimit', 'startsToday', 'updatedAt', 'windowLimit']);
  assert.equal(usage.activeSessions, 1);
  assert.equal(usage.spentMicros, EXPECTED_MICROS);

  const wrongKey = await harness.handler(operationsRequest('?op=usage', { operationsKey: 'wrong' }));
  assert.equal(wrongKey.status, 401);
  assert.equal(wrongKey.headers.has('access-control-allow-origin'), false);
  const studentKeyOnly = await harness.handler(learnerRequest('?op=usage'));
  assert.equal(studentKeyOnly.status, 401, 'the learner credential does not open usage');
  const noOrigin = await harness.handler(operationsRequest('?op=usage', { origin: null }));
  assert.equal(noOrigin.status, 200, 'usage is not a browser surface and needs no origin');

  const disabled = enabledHandler({ fake: harness.fake, config: { enabled: false } });
  const stillReadable = await disabled.handler(operationsRequest());
  assert.equal(stillReadable.status, 200);
  assert.equal((await stillReadable.json()).activeSessions, 1);
});

test('op=start reaps expired calls opportunistically, bounded, and never fails the start when the reaper cannot', async () => {
  const harness = enabledHandler();
  const stale = await startSession(harness, { encounterId: ENCOUNTER_2 });
  harness.advance(16 * MINUTE);
  assert.equal((await harness.ledger.expiredSessions()).length, 1);

  const fresh = await startSession(harness);
  assert.equal(harness.fetch.hangups.length, 1);
  assert.equal(harness.fetch.hangups[0].url, 'https://api.openai.com/v1/realtime/calls/rtc_abc/hangup');
  assert.deepEqual(await harness.ledger.expiredSessions(), []);
  const stored = harness.fake.read(LEDGER_KEY);
  assert.deepEqual(Object.values(stored.sessions).map((entry) => entry.status).sort(), ['active', 'reaped']);
  assert.equal(openReceipt(fresh.receipt, { now: NOW + 16 * MINUTE }).turn, 0);
  assert.ok(openReceipt(stale.receipt, { now: NOW }).deadline < NOW + 16 * MINUTE);
  assert.deepEqual(harness.events.filter((event) => event.event === 'sp_realtime_reaped'), [
    { event: 'sp_realtime_reaped', reaped: 0, failed: 0, deferred: 0 },
    { event: 'sp_realtime_reaped', reaped: 1, failed: 0, deferred: 0 },
  ]);

  // The provider refuses the hangup: the stale row stays active for the
  // scheduled reaper, and the new start still succeeds.
  const refusing = enabledHandler({ providerHarness: realProvider({ hangupStatus: 500 }) });
  await startSession(refusing, { encounterId: ENCOUNTER_2 });
  refusing.advance(16 * MINUTE);
  const started = await startSession(refusing);
  assert.equal(openReceipt(started.receipt, { now: NOW + 16 * MINUTE }).turn, 0);
  assert.equal(refusing.fetch.hangups.length, 1);
  assert.equal((await refusing.ledger.expiredSessions()).length, 1);
  assert.deepEqual(refusing.events.filter((event) => event.event === 'sp_realtime_reaped').pop(), { event: 'sp_realtime_reaped', reaped: 0, failed: 1, deferred: 0 });
});

test('no log line — logger, console.info or console.error — ever carries an SDP, a receipt, a call id, instructions or learner text', async (t) => {
  const consoleLines = captureConsole(t);
  const harness = enabledHandler({ providerHarness: realProvider({ hangupStatus: (ordinal) => (ordinal === 1 ? 200 : 500) }) });
  const learnerText = 'I keep thinking about the pills in the cabinet.';
  const started = await startSession(harness);
  const turned = await (await harness.handler(jsonRequest('turn', turnBody(started.receipt, itemsFrom([learnerText]))))).json();
  await harness.handler(jsonRequest('end', { receipt: turned.receipt, caseId: CASE, encounterId: ENCOUNTER }));
  // Failure paths log too: a refused hangup, a provider error, an invalid body.
  await harness.handler(jsonRequest('end', { receipt: turned.receipt, caseId: CASE, encounterId: ENCOUNTER }));
  const failing = enabledHandler({ providerHarness: realProvider({ exchangeStatus: 500 }) });
  await failing.handler(jsonRequest('start', startBody({ encounterId: ENCOUNTER_2 })));
  await failing.handler(jsonRequest('turn', turnBody('garbage', itemsFrom([learnerText]))));

  const everything = [
    ...consoleLines,
    ...harness.events.map((event) => JSON.stringify(event)),
    ...failing.events.map((event) => JSON.stringify(event)),
  ].join('\n');
  assert.ok(harness.events.length >= 4, 'the flow did log');
  for (const forbidden of [OFFER, ANSWER, 'v=0', started.receipt, turned.receipt, 'rtc_abc', 'SPOKEN ENCOUNTER RULES', '[Director]', learnerText, 'pills', API_KEY, STUDENT_KEY]) {
    assert.ok(!everything.includes(forbidden), `log carries forbidden content: ${forbidden.slice(0, 24)}`);
  }
  for (const event of [...harness.events, ...failing.events]) {
    assert.ok(/^sp_realtime_/.test(event.event), event.event);
    for (const value of Object.values(event)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof value) || value === null || Array.isArray(value), `${event.event}: scalar or list fields only`);
    }
  }
});

test('the runtime environment parser defaults, bounds and fails closed; the default handler hard-disables deploy previews without touching the network', async () => {
  const env = (values) => (name) => values[name];
  const defaults = runtimeRealtimeConfig(env({ CONTEXT: 'production', SP_REALTIME_ENABLED: 'true', SP_REALTIME_MODEL: MODEL, SP_REALTIME_TRANSCRIPTION_MODEL: TRANSCRIPTION, SP_ROTATION_ID: ROTATION }));
  assert.deepEqual(defaults, {
    production: true,
    enabled: true,
    model: MODEL,
    transcriptionModel: TRANSCRIPTION,
    deadlineMinutes: 15,
    capMicros: 20_000_000,
    startLimit: 40,
    windowLimit: 8,
    rotationId: ROTATION,
  });
  assert.equal(validLedgerPolicy(defaults), true);
  const tuned = runtimeRealtimeConfig(env({ CONTEXT: 'production', SP_REALTIME_ENABLED: 'true', SP_REALTIME_MAX_SESSION_MINUTES: '20', SP_REALTIME_ROTATION_CAP_USD: '12.5', SP_REALTIME_STARTS_PER_DAY: '10', SP_REALTIME_STARTS_PER_HALF_HOUR: '3', SP_ROTATION_ID: ROTATION }));
  assert.equal(tuned.deadlineMinutes, 20);
  assert.equal(tuned.capMicros, 12_500_000);
  assert.equal(tuned.startLimit, 10);
  assert.equal(tuned.windowLimit, 3);
  assert.equal(tuned.model, null, 'no default model: fail closed');
  // Previews never enable, whatever the flag says.
  assert.equal(runtimeRealtimeConfig(env({ CONTEXT: 'deploy-preview', SP_REALTIME_ENABLED: 'true' })).enabled, false);
  assert.equal(runtimeRealtimeConfig(env({ CONTEXT: 'production', SP_REALTIME_ENABLED: 'yes' })).enabled, false);
  // Out-of-range or malformed values read as null, never as a default.
  for (const [name, value, field] of [
    ['SP_REALTIME_MAX_SESSION_MINUTES', '2', 'deadlineMinutes'],
    ['SP_REALTIME_MAX_SESSION_MINUTES', '61', 'deadlineMinutes'],
    ['SP_REALTIME_MAX_SESSION_MINUTES', 'fifteen', 'deadlineMinutes'],
    ['SP_REALTIME_ROTATION_CAP_USD', '0', 'capMicros'],
    ['SP_REALTIME_ROTATION_CAP_USD', '-5', 'capMicros'],
    ['SP_REALTIME_ROTATION_CAP_USD', '1e3', 'capMicros'],
    ['SP_REALTIME_STARTS_PER_DAY', '0', 'startLimit'],
    ['SP_REALTIME_STARTS_PER_HALF_HOUR', '1001', 'windowLimit'],
  ]) {
    const parsed = runtimeRealtimeConfig(env({ CONTEXT: 'production', [name]: value, SP_ROTATION_ID: ROTATION }));
    assert.equal(parsed[field], null, `${name}=${value}`);
    assert.equal(validLedgerPolicy(parsed), field === 'deadlineMinutes', `${name}=${value}`);
  }
  assert.equal(validLedgerPolicy(runtimeRealtimeConfig(env({ CONTEXT: 'production' }))), false, 'no rotation id, no ledger');

  const names = ['CONTEXT', 'SP_REALTIME_ENABLED', 'SP_REALTIME_MODEL', 'SP_REALTIME_TRANSCRIPTION_MODEL', 'SP_STUDENT_PASSCODE', 'SP_OPERATIONS_KEY', 'SP_ALLOWED_ORIGINS', 'SP_ROTATION_ID'];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const priorFetch = globalThis.fetch;
  process.env.CONTEXT = 'deploy-preview';
  process.env.SP_REALTIME_ENABLED = 'true';
  process.env.SP_REALTIME_MODEL = MODEL;
  process.env.SP_REALTIME_TRANSCRIPTION_MODEL = TRANSCRIPTION;
  process.env.SP_STUDENT_PASSCODE = STUDENT_KEY;
  process.env.SP_OPERATIONS_KEY = OPERATIONS_KEY;
  process.env.SP_ALLOWED_ORIGINS = ORIGIN;
  process.env.SP_ROTATION_ID = ROTATION;
  globalThis.fetch = async () => { throw new Error('network denied in endpoint tests'); };
  try {
    const response = await productionRealtimeHandler(learnerRequest());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), DISABLED_HEALTH);
    const post = await productionRealtimeHandler(jsonRequest('start', startBody()));
    assert.equal(post.status, 503);
    assert.equal((await errorBody(post)).code, 'realtime_disabled');
  } finally {
    globalThis.fetch = priorFetch;
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  }
});
