import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  _internals,
  config as netlifyConfig,
  createAnthropicProvider,
  createSpHandler,
} from '../netlify/functions/sp.mjs';
import {
  createBudgetLedger,
  PRODUCTION_BUDGET_NAMESPACE,
  PRODUCTION_BUDGET_STORE_NAME,
} from '../netlify/functions/_shared/sp-budget.mjs';
import * as governance from '../netlify/functions/_shared/sp-governance.mjs';
import { createHttp, operationalError } from '../netlify/functions/_shared/sp-http.mjs';
import { createTicketCodec } from '../netlify/functions/_shared/sp-speech-ticket.mjs';
import { createVoiceHandler } from '../netlify/functions/sp-voice.mjs';
import { createFakeBlobStore } from './helpers/fake-blob-store.mjs';

const ORIGIN = 'https://learn.example.test';
const STUDENT_KEY = 'student-secret';
const OPERATIONS_KEY = 'operations-secret';
const MODEL = 'claude-haiku-4-5-20251001';
const NOW_MS = Date.parse('2026-07-15T12:00:00.000Z');
const PACK_HASH = 'ab'.repeat(32);
const TICKET_SECRET = '0123456789abcdef0123456789abcdef';
const ENCOUNTER_ID = Buffer.from(
  Array.from({ length: 16 }, (_, index) => index),
).toString('base64url');
const PACK_TEMPLATE = JSON.parse(fs.readFileSync(
  new URL('../../_prototypes/sp-interview/sp-interview.pack.json', import.meta.url),
  'utf8',
));
const ORIGINAL_GLOBAL_FETCH = globalThis.fetch;

test.before(() => {
  globalThis.fetch = async () => {
    throw new Error('test-level network deny');
  };
});

test.after(() => {
  globalThis.fetch = ORIGINAL_GLOBAL_FETCH;
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function actorPack({ status = 'reviewed', mutate = null } = {}) {
  const pack = clone(PACK_TEMPLATE);
  pack.status = status;
  pack.engine.maxActorOutputTokens = 300;
  pack.engine.maxEvaluatorOutputTokens = 1_500;
  if (mutate) mutate(pack);
  return pack;
}

function snapshot(options = {}) {
  return deepFreeze({
    pack: actorPack(options),
    packHash: PACK_HASH,
    fetchedAt: NOW_MS,
  });
}

function managedVoiceSnapshot() {
  return snapshot({ mutate(pack) {
    pack.speechEngine.enabled = true;
    pack.speechEngine.status = 'reviewed';
    pack.speechEngine.activeStack = 'openai-quality-v1';
  } });
}

function managedVoiceGovernance() {
  const eligibility = {
    eligible: true,
    zeroRetentionEntitled: false,
    attestationHash: 'cd'.repeat(32),
    profileHash: 'ef'.repeat(32),
    profile: {
      id: 'dana-measured-v2',
      status: 'reviewed',
      profileVersion: 2,
      provider: 'openai',
      providerModel: 'tts-1-hd',
      voiceId: 'alloy',
    },
  };
  return {
    ...governance,
    managedVoiceEligibility({ caseDef }) {
      return caseDef?.id === 'sp_depression_gated_si_001'
        ? eligibility
        : { eligible: false };
    },
    requireManagedVoiceEligibility({ caseDef }) {
      if (caseDef?.id !== 'sp_depression_gated_si_001') {
        throw operationalError(403, 'managed_voice_ineligible', 'Managed voice is ineligible.');
      }
      return eligibility;
    },
  };
}

function createTestHttp() {
  return createHttp({
    studentKey: STUDENT_KEY,
    operationsKey: OPERATIONS_KEY,
    allowedOrigins: [ORIGIN],
    production: true,
  });
}

function learnerRequest({
  method = 'POST',
  body,
  rawBody,
  contentType = 'application/json',
  contentLength,
  origin = ORIGIN,
  studentKey = STUDENT_KEY,
  signal,
} = {}) {
  const headers = new Headers();
  if (origin !== null) headers.set('origin', origin);
  if (studentKey !== null) headers.set('x-student-key', studentKey);
  if (contentType !== null) headers.set('content-type', contentType);
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));
  const requestBody = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
  return new Request('https://proxy.example.test/api/sp', {
    method,
    headers,
    body: requestBody,
    signal,
    ...(requestBody instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}

function voiceRequest(path = '', { method = 'GET', body } = {}) {
  const headers = new Headers({
    origin: ORIGIN,
    'x-student-key': STUDENT_KEY,
  });
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`https://proxy.example.test/api/sp/voice${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function openBody(overrides = {}) {
  return {
    caseId: 'sp_depression_gated_si_001',
    mode: 'open',
    encounterId: ENCOUNTER_ID,
    turnId: 0,
    ...overrides,
  };
}

function converseBody(overrides = {}) {
  return {
    caseId: 'sp_depression_gated_si_001',
    mode: 'converse',
    encounterId: ENCOUNTER_ID,
    turnId: 1,
    turns: [],
    message: 'What has been going on?',
    ...overrides,
  };
}

function feedback(overrides = {}) {
  return {
    domains: {
      alliance: { rating: 'observed', note: 'The opening supported alliance.' },
      data: { rating: 'partial', note: 'Some symptom data were gathered.' },
      technique: { rating: 'observed', note: 'The questions were understandable.' },
      organization: { rating: 'partial', note: 'The sequence could be clearer.' },
    },
    strengths: ['Used a collaborative opening.', 'Asked in plain language.'],
    growth: [
      { t: 'Ask directly about suicide.', link: 'pg_suicide.md' },
      { t: 'Summarize before closing.', link: 'pg_interview.md' },
    ],
    selfAssessmentNote: 'The self-assessment identifies a useful next step.',
    ...overrides,
  };
}

function evaluateBody(overrides = {}) {
  return {
    caseId: 'sp_depression_gated_si_001',
    mode: 'evaluate',
    encounterId: ENCOUNTER_ID,
    turns: [{ me: 'How have you been feeling?', pt: 'Pretty low.' }],
    selfAssess: { a: 'She fears judgment.', b: 'More about sleep.', c: 'Depression.' },
    ...overrides,
  };
}

function createBudgetSpy({
  reserveResult = Object.freeze({}),
  reserveError = null,
  markResult = { modified: true, authorized: true, status: 'provider_started' },
  markError = null,
  settleError = null,
  failError = null,
  onReserve = null,
  onMark = null,
  onSettle = null,
  onFail = null,
} = {}) {
  const calls = [];
  const ledger = {
    async reserve(input) {
      calls.push({ method: 'reserve', input });
      if (onReserve) await onReserve(input);
      if (reserveError) throw reserveError;
      return reserveResult;
    },
    async markProviderStarted(reservation) {
      calls.push({ method: 'markProviderStarted', reservation });
      if (onMark) await onMark(reservation);
      if (markError) throw markError;
      return markResult;
    },
    async settle(input) {
      calls.push({ method: 'settle', input });
      if (onSettle) await onSettle(input);
      if (settleError) throw settleError;
      return {
        modified: true,
        status: input.outcome === 'succeeded' ? 'settled' : 'provider_failed',
        outcome: input.outcome,
      };
    },
    async failBeforeProvider(input) {
      calls.push({ method: 'failBeforeProvider', input });
      if (onFail) await onFail(input);
      if (failError) throw failError;
      return { modified: true, status: 'failed_before_provider' };
    },
  };
  return { ledger, calls };
}

function createAnthropicSpy({
  text = 'I have just been feeling worn down.',
  usage = { inputTokens: 120, outputTokens: 24 },
  prepareError = null,
  onPrepare = null,
  callError = null,
  onCall = null,
} = {}) {
  const calls = [];
  const anthropic = {
    async prepare() {
      calls.push({ method: 'prepare' });
      if (onPrepare) await onPrepare();
      if (prepareError) throw prepareError;
      return {
        async call(input) {
          calls.push({ method: 'call', input });
          if (onCall) await onCall(input);
          if (callError) throw callError;
          return { text, usage };
        },
      };
    },
  };
  return { anthropic, calls };
}

function createTimers() {
  const pending = new Map();
  const calls = [];
  let sequence = 0;
  return {
    api: {
      setTimeout(callback, milliseconds) {
        const id = ++sequence;
        pending.set(id, callback);
        calls.push({ method: 'setTimeout', milliseconds, id });
        return id;
      },
      clearTimeout(id) {
        pending.delete(id);
        calls.push({ method: 'clearTimeout', id });
      },
    },
    calls,
    fire() {
      for (const callback of [...pending.values()]) callback();
    },
    get pendingCount() { return pending.size; },
  };
}

function makeHarness({
  packSnapshot = snapshot(),
  packError = null,
  budgetSpy = createBudgetSpy(),
  budget = budgetSpy.ledger,
  anthropicSpy = createAnthropicSpy(),
  anthropic = anthropicSpy.anthropic,
  ticketCodec = null,
  governanceImpl = governance,
  config = {},
} = {}) {
  let packLoads = 0;
  const logs = [];
  const handler = createSpHandler({
    http: createTestHttp(),
    packLoader: {
      async load() {
        packLoads += 1;
        if (packError) throw packError;
        return packSnapshot;
      },
    },
    governance: governanceImpl,
    budget,
    anthropic,
    ticketCodec,
    logger(event) { logs.push(event); },
    config: {
      rotationId: 'rotation-2026-07-a',
      actorModel: MODEL,
      evaluatorModel: MODEL,
      maxActorOutputTokens: 300,
      maxEvaluatorOutputTokens: 1_500,
      voiceRuntime: {
        stackId: 'openai-quality-v1',
        transcriptionProvider: 'openai',
        transcriptionModel: 'whisper-1',
        synthesisProvider: 'openai',
        synthesisModel: 'tts-1-hd',
        zeroRetentionEntitled: false,
      },
      now: () => NOW_MS,
      ...config,
    },
  });
  return {
    handler,
    budgetSpy,
    anthropicSpy,
    logs,
    get packLoads() { return packLoads; },
  };
}

async function json(response) {
  return JSON.parse(await response.text());
}

function assertError(responseBody, code, disposition = 'offline-only') {
  assert.deepEqual(Object.keys(responseBody), ['error', 'retryDisposition']);
  assert.deepEqual(Object.keys(responseBody.error), ['code', 'message']);
  assert.equal(responseBody.error.code, code);
  assert.equal(typeof responseBody.error.message, 'string');
  assert.equal(responseBody.retryDisposition, disposition);
}

test('exports the injected handler, exact Netlify path, and unchanged parity surface', () => {
  assert.equal(typeof createSpHandler, 'function');
  assert.deepEqual(netlifyConfig, { path: '/api/sp' });
  assert.deepEqual(Object.keys(_internals), [
    'deriveState',
    'computeCoverage',
    'actorSystem',
    'evaluatorSystem',
  ]);
});

test('Anthropic adapter sends the exact one-shot request and returns validated text and usage', async () => {
  const timers = createTimers();
  const calls = [];
  let keyReads = 0;
  const provider = createAnthropicProvider({
    readApiKey() { keyReads += 1; return 'anthropic-test-key'; },
    timers: timers.api,
    timeoutMs: 45_000,
    async fetchImpl(url, options) {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        content: [
          { type: 'tool_use', id: 'ignored-non-text-block' },
          { type: 'text', text: 'Validated reply.' },
        ],
        usage: { input_tokens: 17, output_tokens: 5 },
      }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
    },
  });
  assert.equal(keyReads, 0);
  const prepared = await provider.prepare();
  assert.equal(keyReads, 1);
  const bodyBytes = new TextEncoder().encode('{"fixed":"bytes"}');
  assert.deepEqual(await prepared.call({ bodyBytes }), {
    text: 'Validated reply.',
    usage: { inputTokens: 17, outputTokens: 5 },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(calls[0].options, {
    method: 'POST',
    headers: {
      'x-api-key': 'anthropic-test-key',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: bodyBytes,
    signal: calls[0].options.signal,
  });
  assert.equal(calls[0].options.signal instanceof AbortSignal, true);
  assert.deepEqual(timers.calls.map(({ method }) => method), ['setTimeout', 'clearTimeout']);
  assert.equal(timers.pendingCount, 0);
});

test('Anthropic adapter enforces an ignored-abort deadline, never retries, and clears the timer', async () => {
  const timers = createTimers();
  let fetchCalls = 0;
  const provider = createAnthropicProvider({
    readApiKey: () => 'anthropic-test-key',
    timers: timers.api,
    timeoutMs: 45_000,
    fetchImpl: () => {
      fetchCalls += 1;
      return new Promise(() => {});
    },
  });
  const prepared = await provider.prepare();
  const pending = prepared.call({ bodyBytes: Uint8Array.of(1) });
  await Promise.resolve();
  timers.fire();
  await assert.rejects(
    pending,
    (error) => error?.status === 504 && error?.code === 'anthropic_timeout',
  );
  assert.equal(fetchCalls, 1);
  assert.equal(timers.pendingCount, 0);
  assert.equal(timers.calls.at(-1).method, 'clearTimeout');
});

test('Anthropic adapter cancels non-2xx bodies and rejects malformed or oversized responses safely', async () => {
  let cancelled = 0;
  const nonOk = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new TextEncoder().encode('provider-secret')); },
    cancel() { cancelled += 1; },
  }), { status: 500, headers: { 'content-type': 'text/plain' } });
  const responses = [
    nonOk,
    new Response(JSON.stringify({ content: [{ type: 'text', text: 'x' }], usage: {
      input_tokens: 1.5,
      output_tokens: 2,
    } }), { headers: { 'content-type': 'application/json' } }),
    new Response(new Uint8Array(256 * 1024 + 1), {
      headers: { 'content-type': 'application/json' },
    }),
    new Response('{}', {
      headers: { 'content-type': 'application/json', 'content-length': 'not-a-number' },
    }),
  ];
  let calls = 0;
  const provider = createAnthropicProvider({
    readApiKey: () => 'anthropic-test-key',
    fetchImpl: async () => { calls += 1; return responses.shift(); },
  });
  const prepared = await provider.prepare();
  for (let index = 0; index < 4; index += 1) {
    await assert.rejects(
      prepared.call({ bodyBytes: Uint8Array.of(1) }),
      (error) => {
        assert.equal(error?.status, 502);
        assert.equal(error?.code, 'anthropic_provider_error');
        assert.doesNotMatch(error.message, /secret|https?:|500/i);
        return true;
      },
    );
  }
  assert.equal(calls, 4);
  assert.equal(cancelled, 1);
});

test('GET exposes exact reviewed summaries while opening is canonical and provider-free', async () => {
  const harness = makeHarness();
  const getResponse = await harness.handler(learnerRequest({ method: 'GET', contentType: null }));
  assert.equal(getResponse.status, 200);
  assert.deepEqual(await json(getResponse), {
    schemaVersion: 1,
    actorModel: MODEL,
    evaluatorModel: MODEL,
    packVersion: '0.1.0',
    packStatus: 'reviewed',
    cases: [{
      id: 'sp_depression_gated_si_001',
      title: 'Dana — Day 1 Admission Interview',
    }],
  });

  const openResponse = await harness.handler(learnerRequest({ body: openBody() }));
  assert.equal(openResponse.status, 200);
  assert.deepEqual(await json(openResponse), {
    reply: PACK_TEMPLATE.cases[0].persona.opening,
    state: { intents: [], flags: [], rapport: 0, unlocked: [] },
    ticket: null,
  });
  assert.equal(harness.packLoads, 2);
  assert.deepEqual(harness.anthropicSpy.calls, []);
  assert.deepEqual(harness.budgetSpy.calls, []);
});

test('learner authentication, origin, and method failures use exact offline-only errors', async () => {
  const cases = [
    {
      request: learnerRequest({ method: 'GET', contentType: null, studentKey: 'wrong' }),
      status: 401,
      code: 'unauthorized',
    },
    {
      request: learnerRequest({ method: 'GET', contentType: null, origin: 'https://evil.example' }),
      status: 403,
      code: 'origin_not_allowed',
    },
    {
      request: learnerRequest({ method: 'DELETE', contentType: null }),
      status: 405,
      code: 'method_not_allowed',
    },
  ];
  for (const item of cases) {
    const harness = makeHarness();
    const response = await harness.handler(item.request);
    assert.equal(response.status, item.status);
    assertError(await json(response), item.code);
    assert.equal(harness.packLoads, 0);
    assert.deepEqual(harness.anthropicSpy.calls, []);
    assert.deepEqual(harness.budgetSpy.calls, []);
  }
});

test('pack-loader details are reduced to one safe typed error', async () => {
  const harness = makeHarness({
    packError: operationalError(
      502,
      'unsafe_pack_error',
      'PACK_TOKEN_SENTINEL https://private.example.test',
    ),
  });
  const response = await harness.handler(learnerRequest({ body: openBody() }));
  assert.equal(response.status, 502);
  const responseBody = await json(response);
  assertError(responseBody, 'pack_unavailable');
  assert.doesNotMatch(JSON.stringify(responseBody), /PACK_TOKEN|private\.example/);
  assert.deepEqual(harness.anthropicSpy.calls, []);
  assert.deepEqual(harness.budgetSpy.calls, []);
});

test('governance output and errors are rebuilt into exact content-free contracts', async () => {
  const sentinel = 'PRIVATE_TRANSCRIPT_SENTINEL https://private.example.test';
  const cases = [
    {
      method: 'GET',
      governanceImpl: {
        ...governance,
        reviewedCaseSummaries() {
          return [{ id: 'case-id', title: 'Case title', transcript: sentinel }];
        },
      },
      code: 'invalid_configuration',
    },
    {
      method: 'GET',
      governanceImpl: {
        ...governance,
        reviewedCaseSummaries() {
          throw operationalError(502, 'unsafe_governance_error', sentinel);
        },
      },
      code: 'invalid_configuration',
    },
    {
      method: 'POST',
      governanceImpl: {
        ...governance,
        resolveReviewedCase() {
          throw operationalError(400, 'unknown_case', sentinel);
        },
      },
      code: 'unknown_case',
    },
    {
      method: 'POST',
      governanceImpl: {
        ...governance,
        resolveReviewedCase() {
          throw operationalError(403, 'case_not_reviewed', sentinel);
        },
      },
      code: 'case_not_reviewed',
    },
    {
      method: 'POST',
      governanceImpl: {
        ...governance,
        resolveReviewedCase() {
          throw operationalError(502, 'unsafe_governance_error', sentinel);
        },
      },
      code: 'invalid_configuration',
    },
  ];
  for (const item of cases) {
    const harness = makeHarness({ governanceImpl: item.governanceImpl });
    const response = await harness.handler(learnerRequest(
      item.method === 'GET'
        ? { method: 'GET', contentType: null }
        : { body: openBody() },
    ));
    assert.equal(response.status >= 400, true);
    const responseBody = await json(response);
    assertError(responseBody, item.code);
    assert.doesNotMatch(JSON.stringify(responseBody), /PRIVATE_TRANSCRIPT|private\.example/);
    assert.doesNotMatch(JSON.stringify(harness.logs), /PRIVATE_TRANSCRIPT|private\.example/);
    assert.deepEqual(harness.anthropicSpy.calls, []);
    assert.deepEqual(harness.budgetSpy.calls, []);
  }
});

test('POST accepts only literal reviewed or attested top-level status before provider or budget', async () => {
  for (const status of ['reviewed', 'attested']) {
    const harness = makeHarness({ packSnapshot: snapshot({ status }) });
    const response = await harness.handler(learnerRequest({ body: openBody() }));
    assert.equal(response.status, 200, status);
  }
  for (const status of ['draft-pending-attestation', 'Reviewed', ' reviewed', 'approved', null]) {
    const harness = makeHarness({ packSnapshot: snapshot({
      status,
      mutate: status === 'draft-pending-attestation'
        ? (pack) => { delete pack.engine.maxActorOutputTokens; }
        : null,
    }) });
    const response = await harness.handler(learnerRequest({ body: openBody() }));
    assert.equal(response.status, 403, String(status));
    assertError(await json(response), 'pack_not_approved');
    assert.deepEqual(harness.anthropicSpy.calls, []);
    assert.deepEqual(harness.budgetSpy.calls, []);
  }
});

test('converse reserves the exact sent bytes, settles captured usage, and returns exact state', async () => {
  const harness = makeHarness();
  const response = await harness.handler(learnerRequest({ body: converseBody() }));
  assert.equal(response.status, 200);
  const responseBody = await json(response);
  assert.deepEqual(Object.keys(responseBody), ['reply', 'state', 'ticket']);
  assert.equal(responseBody.reply, 'I have just been feeling worn down.');
  assert.equal(responseBody.ticket, null);
  assert.deepEqual(Object.keys(responseBody.state), ['intents', 'flags', 'rapport', 'unlocked']);

  assert.deepEqual(harness.anthropicSpy.calls.map(({ method }) => method), ['prepare', 'call']);
  const call = harness.anthropicSpy.calls[1].input;
  assert.equal(call.bodyBytes instanceof Uint8Array, true);
  const outbound = JSON.parse(new TextDecoder().decode(call.bodyBytes));
  assert.deepEqual(Object.keys(outbound), ['model', 'max_tokens', 'system', 'messages']);
  assert.equal(outbound.model, MODEL);
  assert.equal(outbound.max_tokens, 300);
  assert.deepEqual(outbound.messages, [{ role: 'user', content: 'What has been going on?' }]);

  assert.deepEqual(harness.budgetSpy.calls.map(({ method }) => method), [
    'reserve',
    'markProviderStarted',
    'settle',
  ]);
  const reservation = harness.budgetSpy.calls[0].input;
  assert.deepEqual(reservation.maximumUsage, {
    inputTokens: call.bodyBytes.byteLength,
    outputTokens: 300,
  });
  assert.deepEqual(reservation.rateKey, { provider: 'anthropic', model: MODEL });
  assert.deepEqual(JSON.parse(reservation.idempotencyKey), {
    schemaVersion: 1,
    rotationId: 'rotation-2026-07-a',
    encounterId: ENCOUNTER_ID,
    turnId: 1,
    caseId: 'sp_depression_gated_si_001',
    operation: 'actor',
  });
  assert.deepEqual(harness.budgetSpy.calls[2].input.usage, {
    inputTokens: 120,
    outputTokens: 24,
  });
});

test('evaluation validates and returns the exact feedback object directly', async () => {
  const expected = feedback();
  const harness = makeHarness({
    anthropicSpy: createAnthropicSpy({ text: JSON.stringify(expected) }),
  });
  const response = await harness.handler(learnerRequest({ body: evaluateBody() }));
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), expected);
  const call = harness.anthropicSpy.calls[1].input;
  const outbound = JSON.parse(new TextDecoder().decode(call.bodyBytes));
  assert.equal(outbound.max_tokens, 1_500);
  assert.equal(outbound.messages.length, 1);
  assert.match(outbound.messages[0].content, /^TRANSCRIPT:/);
  assert.deepEqual(harness.budgetSpy.calls[0].input, {
    idempotencyKey: JSON.stringify({
      schemaVersion: 1,
      rotationId: 'rotation-2026-07-a',
      encounterId: ENCOUNTER_ID,
      turnId: 1,
      caseId: 'sp_depression_gated_si_001',
      operation: 'evaluation',
    }),
    kind: 'evaluation',
    rateKey: { provider: 'anthropic', model: MODEL },
    maximumUsage: { inputTokens: call.bodyBytes.byteLength, outputTokens: 1_500 },
  });
});

test('request framing, exact keys, canonical IDs, turn bounds, and Unicode fail before provider work', async () => {
  const tooManyTurns = Array.from({ length: 40 }, () => ({ me: 'Question?', pt: 'Answer.' }));
  const invalidBodies = [
    openBody({ extra: true }),
    openBody({ turnId: 1 }),
    openBody({ encounterId: `${ENCOUNTER_ID}=` }),
    converseBody({ turnId: 2 }),
    converseBody({ message: '   ' }),
    converseBody({ message: '\ud800' }),
    converseBody({ turns: [{ me: 'Question?', pt: 'Answer.', extra: true }] }),
    converseBody({ turns: tooManyTurns, turnId: 41 }),
    evaluateBody({ selfAssess: { a: '', b: '', c: '', extra: '' } }),
    evaluateBody({ turns: [...tooManyTurns, { me: 'One more?', pt: 'No.' }] }),
  ];
  for (const body of invalidBodies) {
    const harness = makeHarness();
    const response = await harness.handler(learnerRequest({ body }));
    assert.equal(response.status >= 400, true);
    assertError(await json(response), response.status === 429 ? 'turn_cap_reached' : 'invalid_request');
    assert.deepEqual(harness.anthropicSpy.calls, []);
    assert.deepEqual(harness.budgetSpy.calls, []);
  }

  for (const contentType of [null, 'application/json; charset=utf-8', 'Application/JSON']) {
    const harness = makeHarness();
    const response = await harness.handler(learnerRequest({ body: openBody(), contentType }));
    assert.equal(response.status, 415);
    assert.equal(harness.packLoads, 0);
  }
});

test('declared and streamed 256 KiB overflow plus invalid UTF-8 fail before pack access', async () => {
  const declared = makeHarness();
  const declaredResponse = await declared.handler(learnerRequest({
    rawBody: '{}',
    contentLength: 256 * 1024 + 1,
  }));
  assert.equal(declaredResponse.status, 413);
  assert.equal(declared.packLoads, 0);

  const streamed = makeHarness();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(200 * 1024));
      controller.enqueue(new Uint8Array(60 * 1024));
    },
  });
  const streamedResponse = await streamed.handler(learnerRequest({ rawBody: stream }));
  assert.equal(streamedResponse.status, 413);
  assert.equal(streamed.packLoads, 0);

  const invalidUtf8 = makeHarness();
  const invalidResponse = await invalidUtf8.handler(learnerRequest({
    rawBody: Uint8Array.of(0xc3, 0x28),
  }));
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidUtf8.packLoads, 0);
});

test('the exact 256 KiB boundary succeeds while zero-progress, truncation, and 1,201 scalars fail', async () => {
  const encoded = JSON.stringify(openBody());
  const exactBody = encoded.padEnd(256 * 1024, ' ');
  const boundary = makeHarness();
  const boundaryResponse = await boundary.handler(learnerRequest({
    rawBody: exactBody,
    contentLength: 256 * 1024,
  }));
  assert.equal(boundaryResponse.status, 200);

  const invalidStreams = [
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array());
        controller.enqueue(new TextEncoder().encode(encoded));
        controller.close();
      },
    }),
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"mode":"open"'));
        controller.close();
      },
    }),
  ];
  for (const rawBody of invalidStreams) {
    const harness = makeHarness();
    const response = await harness.handler(learnerRequest({ rawBody }));
    assert.equal(response.status, 400);
    assert.equal(harness.packLoads, 0);
  }

  for (const body of [
    converseBody({ message: 'x'.repeat(1_201) }),
    converseBody({ turns: [{ me: 'x'.repeat(1_201), pt: 'Answer.' }], turnId: 2 }),
    evaluateBody({ selfAssess: { a: 'x'.repeat(1_201), b: '', c: '' } }),
  ]) {
    const harness = makeHarness();
    const response = await harness.handler(learnerRequest({ body }));
    assert.equal(response.status, 400);
    assert.deepEqual(harness.anthropicSpy.calls, []);
    assert.deepEqual(harness.budgetSpy.calls, []);
  }
});

test('model, output, and unique rate pins fail closed before credential or budget access', async () => {
  const cases = [
    { config: { actorModel: 'another-model' } },
    { config: { evaluatorModel: 'another-model' } },
    { config: { maxActorOutputTokens: 301 } },
    { config: { now: () => NOW_MS + 0.5 } },
    { config: { now: () => Number.MAX_SAFE_INTEGER } },
    { packSnapshot: snapshot({ mutate: (pack) => { delete pack.engine.maxActorOutputTokens; } }) },
    { packSnapshot: snapshot({ mutate: (pack) => {
      pack.speechEngine.rateCard.rates = pack.speechEngine.rateCard.rates.filter(
        (rate) => rate.meter !== 'input_tokens',
      );
    } }) },
    { packSnapshot: snapshot({ mutate: (pack) => {
      const rate = pack.speechEngine.rateCard.rates.find((item) => item.meter === 'output_tokens');
      pack.speechEngine.rateCard.rates.push(clone(rate));
    } }) },
    { packSnapshot: snapshot({ mutate: (pack) => {
      pack.speechEngine.rateCard.rates.find((rate) => rate.meter === 'input_tokens').unit = 'tokens';
    } }) },
    { packSnapshot: snapshot({ mutate: (pack) => {
      pack.speechEngine.rateCard.rates.find((rate) => rate.meter === 'output_tokens').price = 0;
    } }) },
    { packSnapshot: snapshot({ mutate: (pack) => {
      pack.speechEngine.rateCard.rates.find((rate) => rate.meter === 'input_tokens').extra = true;
    } }) },
    { packSnapshot: snapshot({ mutate: (pack) => {
      pack.speechEngine.rateCard.rates.find((rate) => rate.meter === 'output_tokens').sourceUrl = 'javascript:alert(1)';
    } }) },
    { packSnapshot: snapshot({ mutate: (pack) => {
      pack.speechEngine.rateCard.effectiveDate = '2026-02-30';
    } }) },
  ];
  for (const item of cases) {
    const harness = makeHarness(item);
    const response = await harness.handler(learnerRequest({ body: converseBody() }));
    assert.equal(response.status, 500);
    assertError(await json(response), 'invalid_configuration');
    assert.deepEqual(harness.anthropicSpy.calls, []);
    assert.deepEqual(harness.budgetSpy.calls, []);
  }
});

test('duplicates and provider failures are typed offline-only and settle conservatively', async () => {
  for (const [kind, budgetSpy, code] of [
    ['active', createBudgetSpy({
      reserveError: operationalError(409, 'budget_in_progress', 'busy sentinel'),
    }), 'actor_in_progress'],
    ['terminal', createBudgetSpy({
      reserveResult: { finalized: true, status: 'settled', outcome: 'succeeded', chargedMicros: 1 },
    }), 'actor_already_processed'],
  ]) {
    const harness = makeHarness({ budgetSpy });
    const response = await harness.handler(learnerRequest({ body: converseBody() }));
    assert.equal(response.status, 409, kind);
    assertError(await json(response), code);
    assert.deepEqual(harness.anthropicSpy.calls.map(({ method }) => method), ['prepare']);
  }

  const providerFailure = createAnthropicSpy({
    callError: operationalError(504, 'anthropic_timeout', 'safe timeout'),
  });
  const harness = makeHarness({ anthropicSpy: providerFailure });
  const response = await harness.handler(learnerRequest({ body: converseBody() }));
  assert.equal(response.status, 504);
  assertError(await json(response), 'anthropic_timeout');
  const reservation = harness.budgetSpy.calls.find(
    ({ method }) => method === 'markProviderStarted',
  ).reservation;
  assert.deepEqual(harness.budgetSpy.calls.at(-1).input, {
    reservation,
    outcome: 'provider_failed',
    usage: null,
  });

  const factoryFailure = makeHarness({
    anthropic: async () => {
      throw operationalError(502, 'unsafe_injected_error', 'PROVIDER_SECRET_SENTINEL');
    },
  });
  const factoryResponse = await factoryFailure.handler(learnerRequest({ body: converseBody() }));
  assert.equal(factoryResponse.status, 502);
  const factoryBody = await json(factoryResponse);
  assertError(factoryBody, 'anthropic_provider_error');
  assert.doesNotMatch(JSON.stringify(factoryBody), /PROVIDER_SECRET_SENTINEL/);
  assert.deepEqual(factoryFailure.budgetSpy.calls, []);

  const missingKey = makeHarness({
    anthropicSpy: createAnthropicSpy({
      prepareError: operationalError(503, 'anthropic_unavailable', 'missing key'),
    }),
  });
  const missingKeyResponse = await missingKey.handler(learnerRequest({ body: converseBody() }));
  assert.equal(missingKeyResponse.status, 503);
  assertError(await json(missingKeyResponse), 'anthropic_unavailable');
  assert.deepEqual(missingKey.budgetSpy.calls, []);
});

test('only a proven durable release permits same-operation retry', async () => {
  const beforeReserveController = new AbortController();
  const beforeReserveProvider = createAnthropicSpy({
    onPrepare() { beforeReserveController.abort(); },
  });
  const beforeReserveHarness = makeHarness({ anthropicSpy: beforeReserveProvider });
  const beforeReserveResponse = await beforeReserveHarness.handler(learnerRequest({
    body: converseBody(),
    signal: beforeReserveController.signal,
  }));
  assert.equal(beforeReserveResponse.status, 499);
  assertError(await json(beforeReserveResponse), 'request_cancelled', 'same-operation');
  assert.deepEqual(beforeReserveHarness.budgetSpy.calls, []);
  assert.deepEqual(beforeReserveProvider.calls.map(({ method }) => method), ['prepare']);

  const controller = new AbortController();
  const released = createBudgetSpy({
    onReserve() { controller.abort(); },
  });
  const safeHarness = makeHarness({ budgetSpy: released });
  const safeResponse = await safeHarness.handler(learnerRequest({
    body: converseBody(),
    signal: controller.signal,
  }));
  assert.equal(safeResponse.status, 499);
  assertError(await json(safeResponse), 'request_cancelled', 'same-operation');
  assert.deepEqual(released.calls.map(({ method }) => method), ['reserve', 'failBeforeProvider']);
  assert.deepEqual(safeHarness.anthropicSpy.calls.map(({ method }) => method), ['prepare']);

  const failedController = new AbortController();
  const failedRelease = createBudgetSpy({
    onReserve() { failedController.abort(); },
    failError: new Error('ambiguous release'),
  });
  const failedHarness = makeHarness({ budgetSpy: failedRelease });
  const failedResponse = await failedHarness.handler(learnerRequest({
    body: converseBody(),
    signal: failedController.signal,
  }));
  assert.equal(failedResponse.status, 503);
  assertError(await json(failedResponse), 'operation_state_unavailable', 'offline-only');
});

test('evaluation duplicates use evaluation-specific active and terminal codes', async () => {
  const expected = feedback();
  for (const [budgetSpy, code] of [
    [createBudgetSpy({
      reserveError: operationalError(409, 'budget_in_progress', 'busy'),
    }), 'evaluation_in_progress'],
    [createBudgetSpy({
      reserveResult: { finalized: true, status: 'settled', outcome: 'succeeded' },
    }), 'evaluation_already_processed'],
  ]) {
    const harness = makeHarness({
      budgetSpy,
      anthropicSpy: createAnthropicSpy({ text: JSON.stringify(expected) }),
    });
    const response = await harness.handler(learnerRequest({ body: evaluateBody() }));
    assert.equal(response.status, 409);
    assertError(await json(response), code);
  }
});

test('valid provider usage settles succeeded before an abort suppresses delivery', async () => {
  const controller = new AbortController();
  const anthropicSpy = createAnthropicSpy({ onCall() { controller.abort(); } });
  const harness = makeHarness({ anthropicSpy });
  const response = await harness.handler(learnerRequest({
    body: converseBody(),
    signal: controller.signal,
  }));
  assert.equal(response.status, 499);
  assertError(await json(response), 'request_cancelled');
  const settlement = harness.budgetSpy.calls.find(({ method }) => method === 'settle').input;
  assert.deepEqual(settlement, {
    reservation: harness.budgetSpy.calls.find(
      ({ method }) => method === 'markProviderStarted',
    ).reservation,
    outcome: 'succeeded',
    usage: { inputTokens: 120, outputTokens: 24 },
  });
});

test('malformed durable-transition results never produce a reassuring success', async () => {
  const malformedSettlement = createBudgetSpy();
  malformedSettlement.ledger.settle = async (input) => {
    malformedSettlement.calls.push({ method: 'settle', input });
    return {};
  };
  const settlementHarness = makeHarness({ budgetSpy: malformedSettlement });
  const settlementResponse = await settlementHarness.handler(learnerRequest({ body: converseBody() }));
  assert.equal(settlementResponse.status, 503);
  assertError(await json(settlementResponse), 'operation_state_unavailable');

  const controller = new AbortController();
  const malformedRelease = createBudgetSpy({ onReserve() { controller.abort(); } });
  malformedRelease.ledger.failBeforeProvider = async (input) => {
    malformedRelease.calls.push({ method: 'failBeforeProvider', input });
    return {};
  };
  const releaseHarness = makeHarness({ budgetSpy: malformedRelease });
  const releaseResponse = await releaseHarness.handler(learnerRequest({
    body: converseBody(),
    signal: controller.signal,
  }));
  assert.equal(releaseResponse.status, 503);
  assertError(await json(releaseResponse), 'operation_state_unavailable');
});

test('feedback mutations fail closed and charge the reserved maximum', async () => {
  const mutations = [
    (value) => { value.extra = true; },
    (value) => { value.domains.alliance.extra = true; },
    (value) => { value.domains.data.rating = 'excellent'; },
    (value) => { value.strengths.pop(); },
    (value) => { value.growth[0].link = 'unknown.md'; },
    (value) => { value.growth[0].t = 'x'.repeat(601); },
    (value) => { value.selfAssessmentNote = '\ud800'; },
  ];
  for (const mutate of mutations) {
    const value = feedback();
    mutate(value);
    const harness = makeHarness({
      anthropicSpy: createAnthropicSpy({ text: JSON.stringify(value) }),
    });
    const response = await harness.handler(learnerRequest({ body: evaluateBody() }));
    assert.equal(response.status, 502);
    assertError(await json(response), 'anthropic_provider_error');
    assert.deepEqual(harness.budgetSpy.calls.at(-1).input.usage, null);
    assert.equal(harness.budgetSpy.calls.at(-1).input.outcome, 'provider_failed');
  }
});

test('ticket failures are fail-soft after opening or settled converse text', async () => {
  const throwingCodec = {
    issueStableOpening() { throw new Error('ticket secret sentinel'); },
    issue() { throw new Error('ticket random sentinel'); },
  };
  const eligibleGovernance = {
    ...governance,
    managedVoiceEligibility({ caseDef }) {
      return {
        eligible: true,
        attestationHash: 'cd'.repeat(32),
        profileHash: 'ef'.repeat(32),
        profile: {
          ...caseDef.speechProfile,
          profileVersion: 2,
          provider: 'openai',
          providerModel: 'tts-1-hd',
          voiceId: 'alloy',
        },
      };
    },
  };
  for (const body of [openBody(), converseBody()]) {
    const harness = makeHarness({
      ticketCodec: throwingCodec,
      governanceImpl: eligibleGovernance,
      packSnapshot: snapshot({ mutate(pack) {
        pack.speechEngine.enabled = true;
        pack.speechEngine.status = 'reviewed';
        pack.speechEngine.activeStack = 'openai-quality-v1';
      } }),
    });
    const response = await harness.handler(learnerRequest({ body }));
    assert.equal(response.status, 200);
    assert.equal((await json(response)).ticket, null);
    assert.deepEqual(harness.logs, [{ event: 'speech_ticket_unavailable', mode: body.mode }]);
    if (body.mode === 'converse') {
      assert.equal(harness.anthropicSpy.calls.filter(({ method }) => method === 'call').length, 1);
      assert.equal(harness.budgetSpy.calls.filter(({ method }) => method === 'settle').length, 1);
    }
  }
});

test('stable opening tickets share a JTI while ordinary converse tickets remain random', async () => {
  let randomSequence = 0;
  const codec = createTicketCodec({
    secret: TICKET_SECRET,
    clock: () => NOW_MS,
    randomBytes(size) {
      randomSequence += 1;
      return Buffer.alloc(size, randomSequence);
    },
  });
  const eligibleGovernance = {
    ...governance,
    managedVoiceEligibility() {
      return {
        eligible: true,
        attestationHash: 'cd'.repeat(32),
        profileHash: 'ef'.repeat(32),
        profile: {
          profileVersion: 2,
          provider: 'openai',
          voiceId: 'alloy',
        },
      };
    },
  };
  const harness = makeHarness({
    ticketCodec: codec,
    governanceImpl: eligibleGovernance,
    packSnapshot: snapshot({ mutate(pack) {
      pack.speechEngine.enabled = true;
      pack.speechEngine.status = 'reviewed';
      pack.speechEngine.activeStack = 'openai-quality-v1';
    } }),
  });
  const openingTickets = await Promise.all(Array.from({ length: 10 }, async () => {
    const response = await harness.handler(learnerRequest({ body: openBody() }));
    return (await json(response)).ticket;
  }));
  const openingJtis = openingTickets.map((ticket) => (
    JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8')).jti
  ));
  assert.equal(new Set(openingJtis).size, 1);

  const first = await harness.handler(learnerRequest({ body: converseBody() }));
  const second = await makeHarness({
    ticketCodec: codec,
    governanceImpl: eligibleGovernance,
    packSnapshot: snapshot({ mutate(pack) {
      pack.speechEngine.enabled = true;
      pack.speechEngine.status = 'reviewed';
      pack.speechEngine.activeStack = 'openai-quality-v1';
    } }),
  }).handler(learnerRequest({ body: converseBody({ encounterId: Buffer.alloc(16, 9).toString('base64url') }) }));
  const ordinaryJtis = await Promise.all([first, second].map(async (response) => {
    const ticket = (await json(response)).ticket;
    return JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8')).jti;
  }));
  assert.notEqual(ordinaryJtis[0], ordinaryJtis[1]);
});

test('ten stable opening tickets redeem through voice with exactly one synthesis call', async () => {
  const codec = createTicketCodec({
    secret: TICKET_SECRET,
    clock: () => NOW_MS,
    randomBytes: (size) => Buffer.alloc(size, 7),
  });
  const packSnapshot = managedVoiceSnapshot();
  const governanceImpl = managedVoiceGovernance();
  const actorHarness = makeHarness({
    packSnapshot,
    governanceImpl,
    ticketCodec: codec,
  });
  const openings = await Promise.all(Array.from({ length: 10 }, async () => {
    const response = await actorHarness.handler(learnerRequest({ body: openBody() }));
    assert.equal(response.status, 200);
    return json(response);
  }));
  assert.equal(new Set(openings.map(({ ticket }) => ticket)).size, 1);

  const fake = createFakeBlobStore({ nonStrongReadsReturnNull: true });
  let ownerSequence = 0;
  const budget = () => createBudgetLedger({
    store: fake.store,
    namespace: PRODUCTION_BUDGET_NAMESPACE,
    rotationId: 'rotation-2026-07-a',
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    rateCard: packSnapshot.pack.speechEngine.rateCard,
    clock: () => NOW_MS,
    randomBytes(size) {
      ownerSequence += 1;
      return Buffer.alloc(size, ownerSequence);
    },
  });
  let synthesisCalls = 0;
  const provider = {
    async prepare() {
      return {
        async synthesize({ text }) {
          synthesisCalls += 1;
          return {
            audio: Uint8Array.of(0x49, 0x44, 0x33, 0x04),
            contentType: 'audio/mpeg',
            usage: { characters: [...text].length },
          };
        },
      };
    },
  };
  const voiceHandler = createVoiceHandler({
    http: createTestHttp(),
    packLoader: { async load() { return packSnapshot; } },
    governance: governanceImpl,
    ticketCodec: codec,
    budget,
    provider,
    config: {
      enabled: true,
      rotationId: 'rotation-2026-07-a',
      runtime: {
        stackId: 'openai-quality-v1',
        transcriptionProvider: 'openai',
        transcriptionModel: 'whisper-1',
        synthesisProvider: 'openai',
        synthesisModel: 'tts-1-hd',
        zeroRetentionEntitled: false,
      },
      now: () => NOW_MS,
    },
  });
  const responses = await Promise.all(openings.map(({ reply, ticket }) => voiceHandler(
    voiceRequest('?op=speak', { method: 'POST', body: { reply, ticket } }),
  )));
  assert.equal(responses.filter(({ status }) => status === 200).length, 1);
  assert.equal(responses.filter(({ status }) => status === 409).length, 9);
  assert.equal(synthesisCalls, 1);
});

test('ten concurrent actor duplicates and a process restart authorize one provider call', async () => {
  const fake = createFakeBlobStore({ nonStrongReadsReturnNull: true });
  const packSnapshot = snapshot();
  let ownerSequence = 0;
  const budget = () => createBudgetLedger({
    store: fake.store,
    namespace: PRODUCTION_BUDGET_NAMESPACE,
    rotationId: 'rotation-concurrent',
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    rateCard: packSnapshot.pack.speechEngine.rateCard,
    clock: () => NOW_MS,
    randomBytes(size) {
      ownerSequence += 1;
      return Buffer.alloc(size, ownerSequence);
    },
  });
  let releaseProvider;
  const providerBarrier = new Promise((resolve) => { releaseProvider = resolve; });
  let providerCalls = 0;
  const anthropic = {
    async prepare() {
      return {
        async call() {
          providerCalls += 1;
          await providerBarrier;
          return {
            text: 'One durable actor response.',
            usage: { inputTokens: 100, outputTokens: 10 },
          };
        },
      };
    },
  };
  const firstProcess = makeHarness({
    packSnapshot,
    budget,
    anthropic,
    config: { rotationId: 'rotation-concurrent' },
  });
  const sensitiveBody = converseBody({ message: 'SENSITIVE_TRANSCRIPT_SENTINEL' });
  const pending = Promise.all(Array.from({ length: 10 }, () => (
    firstProcess.handler(learnerRequest({ body: sensitiveBody }))
  )));
  for (let attempt = 0; attempt < 100 && providerCalls === 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(providerCalls, 1);
  releaseProvider();
  const responses = await pending;
  assert.equal(responses.filter(({ status }) => status === 200).length, 1);
  assert.equal(responses.filter(({ status }) => status === 409).length, 9);
  assert.equal(providerCalls, 1);

  const restartedProvider = createAnthropicSpy();
  const restarted = makeHarness({
    packSnapshot,
    budget,
    anthropicSpy: restartedProvider,
    config: { rotationId: 'rotation-concurrent' },
  });
  const retry = await restarted.handler(learnerRequest({ body: sensitiveBody }));
  assert.equal(retry.status, 409);
  assertError(await json(retry), 'actor_already_processed');
  assert.deepEqual(restartedProvider.calls.map(({ method }) => method), ['prepare']);
  assert.doesNotMatch(JSON.stringify(fake.calls), /SENSITIVE_TRANSCRIPT_SENTINEL/);
});

test('actor handler spend changes voice health and capacity in one shared $20 record', async () => {
  const fake = createFakeBlobStore({ nonStrongReadsReturnNull: true });
  const packSnapshot = managedVoiceSnapshot();
  const governanceImpl = managedVoiceGovernance();
  let randomSequence = 0;
  const makeLedger = () => createBudgetLedger({
    store: fake.store,
    namespace: PRODUCTION_BUDGET_NAMESPACE,
    rotationId: 'rotation-shared',
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    rateCard: packSnapshot.pack.speechEngine.rateCard,
    clock: () => NOW_MS,
    randomBytes(size) {
      randomSequence += 1;
      return Buffer.alloc(size, randomSequence);
    },
  });

  assert.equal(PRODUCTION_BUDGET_STORE_NAME, 'sp-usage');
  const actorHarness = makeHarness({
    packSnapshot,
    governanceImpl,
    budget: () => makeLedger(),
    config: { rotationId: 'rotation-shared' },
  });
  const actorResponse = await actorHarness.handler(learnerRequest({ body: converseBody() }));
  assert.equal(actorResponse.status, 200);
  assert.equal(actorHarness.anthropicSpy.calls.filter(({ method }) => method === 'call').length, 1);

  const actorLedger = makeLedger();
  const afterActor = await actorLedger.getUsage();
  assert.equal(afterActor.spentMicros > 0, true);
  const remainingToWarning = 16_000_000 - afterActor.authorizedMicros;
  assert.equal(remainingToWarning > 0, true);
  const warning = await actorLedger.reserve({
    idempotencyKey: 'actor-warning',
    kind: 'actor',
    rateKey: { provider: 'anthropic', model: MODEL },
    maximumUsage: { inputTokens: remainingToWarning, outputTokens: 0 },
  });
  await actorLedger.markProviderStarted(warning);
  await actorLedger.settle({
    reservation: warning,
    outcome: 'succeeded',
    usage: { inputTokens: remainingToWarning, outputTokens: 0 },
  });
  assert.equal(await makeLedger().getBand(), 'warning');

  const voiceProvider = {
    async prepare() {
      return { async synthesize() { throw new Error('health must not synthesize'); } };
    },
  };
  const voiceHandler = createVoiceHandler({
    http: createTestHttp(),
    packLoader: { async load() { return packSnapshot; } },
    governance: governanceImpl,
    ticketCodec: null,
    provider: voiceProvider,
    budget: () => makeLedger(),
    config: {
      enabled: true,
      rotationId: 'rotation-shared',
      runtime: {
        stackId: 'openai-quality-v1',
        transcriptionProvider: 'openai',
        transcriptionModel: 'whisper-1',
        synthesisProvider: 'openai',
        synthesisModel: 'tts-1-hd',
        zeroRetentionEntitled: false,
      },
      now: () => NOW_MS,
    },
  });
  const healthResponse = await voiceHandler(voiceRequest());
  assert.equal(healthResponse.status, 200);
  const health = await json(healthResponse);
  assert.equal(health.budgetBand, 'warning');
  assert.equal(health.acceptingVoice, false);

  await assert.rejects(
    makeLedger().reserve({
      idempotencyKey: 'voice-blocked-at-warning',
      kind: 'synthesis',
      rateKey: { provider: 'openai', model: 'tts-1-hd' },
      maximumUsage: { characters: 1 },
    }),
    (error) => error?.status === 429 && error?.code === 'voice_budget_reserved',
  );
  const beforeCap = await actorLedger.getUsage();
  const remainingToCap = 20_000_000 - beforeCap.authorizedMicros;
  const cap = await actorLedger.reserve({
    idempotencyKey: 'actor-cap',
    kind: 'actor',
    rateKey: { provider: 'anthropic', model: MODEL },
    maximumUsage: { inputTokens: remainingToCap, outputTokens: 0 },
  });
  assert.equal(await makeLedger().getBand(), 'capped');
  const cappedHealthResponse = await voiceHandler(voiceRequest());
  assert.equal(cappedHealthResponse.status, 200);
  const cappedHealth = await json(cappedHealthResponse);
  assert.equal(cappedHealth.budgetBand, 'capped');
  assert.equal(cappedHealth.acceptingVoice, false);
  await assert.rejects(
    actorLedger.reserve({
      idempotencyKey: 'actor-over-cap',
      kind: 'actor',
      rateKey: { provider: 'anthropic', model: MODEL },
      maximumUsage: { inputTokens: 1, outputTokens: 0 },
    }),
    (error) => error?.status === 429 && error?.code === 'rotation_budget_reserved',
  );
  assert.equal(cap && typeof cap === 'object', true);
  assert.equal(new Set(fake.calls.map((call) => call.key)).size, 1);
  assert.equal(
    fake.calls.every((call) => call.key === `${PRODUCTION_BUDGET_NAMESPACE}/rotation-shared`),
    true,
  );
});
