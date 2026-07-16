import assert from 'node:assert/strict';
import test from 'node:test';

import {
  config as netlifyConfig,
  createVoiceHandler,
  default as productionVoiceHandler,
} from '../netlify/functions/sp-voice.mjs';
import { createHttp, operationalError } from '../netlify/functions/_shared/sp-http.mjs';
import * as governance from '../netlify/functions/_shared/sp-governance.mjs';
import { createBudgetLedger } from '../netlify/functions/_shared/sp-budget.mjs';
import { createTicketCodec } from '../netlify/functions/_shared/sp-speech-ticket.mjs';
import { createFakeBlobStore } from './helpers/fake-blob-store.mjs';
import {
  createReviewedPack,
  NOW_MS,
  PACK_HASH,
  RUNTIME_PINS,
} from './fixtures/pack.fixture.mjs';

const ORIGIN = 'https://learn.example.test';
const STUDENT_KEY = 'student-secret';
const OPERATIONS_KEY = 'operations-secret';
const TICKET_SECRET = '0123456789abcdef0123456789abcdef';

function createTestHttp() {
  return createHttp({
    studentKey: STUDENT_KEY,
    operationsKey: OPERATIONS_KEY,
    allowedOrigins: [ORIGIN],
    production: true,
  });
}

function learnerRequest(path = '', {
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
  return new Request(`https://proxy.example.test/api/sp/voice${path}`, {
    method,
    headers: requestHeaders,
    body,
    signal,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}

function operationsRequest(path = '?op=usage', {
  method = 'GET',
  operationsKey = OPERATIONS_KEY,
  origin = ORIGIN,
} = {}) {
  const headers = new Headers();
  if (operationsKey !== null) headers.set('x-operations-key', operationsKey);
  if (origin !== null) headers.set('origin', origin);
  return new Request(`https://proxy.example.test/api/sp/voice${path}`, { method, headers });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function reviewedSnapshot(pack = createReviewedPack()) {
  return deepFreeze({ pack, packHash: PACK_HASH, fetchedAt: NOW_MS });
}

function bytes(...parts) {
  const normalized = parts.map((part) => (
    part instanceof Uint8Array ? part : new Uint8Array(part)
  ));
  const output = new Uint8Array(normalized.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of normalized) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function ascii(value) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function u16le(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function u32le(value) {
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function wav({ dataLength = 8_000, sampleRate = 8_000 } = {}) {
  const fmt = bytes(
    ascii('fmt '),
    u32le(16),
    u16le(1),
    u16le(1),
    u32le(sampleRate),
    u32le(sampleRate),
    u16le(1),
    u16le(8),
  );
  const data = bytes(
    ascii('data'),
    u32le(dataLength),
    new Uint8Array(dataLength),
    dataLength % 2 === 1 ? Uint8Array.of(0) : new Uint8Array(),
  );
  const body = bytes(fmt, data);
  return bytes(ascii('RIFF'), u32le(body.length + 4), ascii('WAVE'), body);
}

const CAPTURE_ID = Buffer.from(Array.from({ length: 16 }, (_, index) => index)).toString('base64url');
const CAPTURE_ID_2 = Buffer.from(Array.from({ length: 16 }, (_, index) => index + 16)).toString('base64url');

function transcribeRequest({
  audio = wav(),
  contentType = 'audio/wav',
  caseId = 'case-reviewed',
  encounterId = 'encounter-7',
  turnId = '3',
  captureId = CAPTURE_ID,
  contentLength,
  body = audio,
  signal,
} = {}) {
  const headers = {
    'content-type': contentType,
    'x-sp-case-id': caseId,
    'x-sp-encounter-id': encounterId,
    'x-sp-turn-id': turnId,
    'x-sp-capture-id': captureId,
  };
  if (contentLength !== undefined) headers['content-length'] = contentLength;
  return learnerRequest('?op=transcribe', {
    method: 'POST',
    headers,
    body,
    signal,
  });
}

function fixedTicketCodec() {
  return createTicketCodec({
    secret: TICKET_SECRET,
    clock: () => NOW_MS,
    randomBytes(size) {
      assert.equal(size, 16);
      return Buffer.from(Array.from({ length: size }, (_, index) => index));
    },
  });
}

function ticketFor({
  snapshot = reviewedSnapshot(),
  codec = fixedTicketCodec(),
  reply = '*looks away* Hello there.',
  encounterId = 'encounter-7',
  turnId = 3,
  caseId = 'case-reviewed',
} = {}) {
  const caseDef = governance.resolveReviewedCase({
    pack: snapshot.pack,
    caseId,
    now: () => NOW_MS,
  });
  const eligibility = governance.requireManagedVoiceEligibility({
    pack: snapshot.pack,
    packHash: snapshot.packHash,
    caseDef,
    now: () => NOW_MS,
    runtime: RUNTIME_PINS,
  });
  return codec.issue({
    rotationId: 'rotation-2026-07-a',
    encounterId,
    turnId,
    caseId,
    packHash: snapshot.packHash,
    attestationHash: eligibility.attestationHash,
    profileHash: eligibility.profileHash,
    profileVersion: eligibility.profile.profileVersion,
    provider: eligibility.profile.provider,
    model: RUNTIME_PINS.synthesisModel,
    voiceId: eligibility.profile.voiceId,
    reply,
  });
}

function speakRequest({
  reply = '*looks away* Hello there.',
  ticket,
  snapshot = reviewedSnapshot(),
  codec = fixedTicketCodec(),
  contentType = 'application/json',
  contentLength,
  body,
  signal,
} = {}) {
  const actualTicket = ticket ?? ticketFor({ snapshot, codec, reply });
  const headers = { 'content-type': contentType };
  if (contentLength !== undefined) headers['content-length'] = contentLength;
  return learnerRequest('?op=speak', {
    method: 'POST',
    headers,
    body: body ?? JSON.stringify({ reply, ticket: actualTicket }),
    signal,
  });
}

function createBudgetSpy({
  band = 'ok',
  reserveResult,
  markResult,
  settleError = null,
  onReserve = null,
  onGetBand = null,
  onMark = null,
  onSettle = null,
} = {}) {
  const calls = [];
  const reservation = Object.freeze({});
  const ledger = Object.freeze({
    async getBand() {
      calls.push({ method: 'getBand' });
      if (onGetBand) await onGetBand();
      return band;
    },
    async reserve(input) {
      calls.push({ method: 'reserve', input });
      if (onReserve) await onReserve(input);
      return reserveResult ?? reservation;
    },
    async markProviderStarted(value) {
      calls.push({ method: 'markProviderStarted', reservation: value });
      if (onMark) await onMark(value);
      return markResult ?? { modified: true, authorized: true, status: 'provider_started' };
    },
    async settle(input) {
      calls.push({ method: 'settle', input });
      if (onSettle) await onSettle(input);
      if (settleError) throw settleError;
      return { modified: true, status: 'settled', outcome: input.outcome, chargedMicros: 1 };
    },
    async failBeforeProvider(input) {
      calls.push({ method: 'failBeforeProvider', input });
      return { modified: true, status: 'failed_before_provider' };
    },
  });
  return { ledger, calls, reservation };
}

function createRecordingProvider({
  prepareError = null,
  onPrepare = null,
  transcribeError = null,
  transcriptionResult = Object.freeze({
    text: 'What brings you in?',
    durationMilliseconds: 8_470,
    usage: Object.freeze({ milliseconds: 9_000 }),
  }),
  synthesizeError = null,
  onSynthesize = null,
  synthesisResult = Object.freeze({
    audio: Uint8Array.of(0x49, 0x44, 0x33, 0x04),
    contentType: 'audio/mpeg',
    usage: Object.freeze({ characters: 12 }),
  }),
} = {}) {
  const calls = [];
  const provider = Object.freeze({
    async prepare() {
      calls.push({ method: 'prepare' });
      if (onPrepare) await onPrepare();
      if (prepareError) throw prepareError;
      return Object.freeze({
        async transcribe(input) {
          calls.push({ method: 'transcribe', input });
          if (transcribeError) throw transcribeError;
          return transcriptionResult;
        },
        async synthesize(input) {
          calls.push({ method: 'synthesize', input });
          if (onSynthesize) await onSynthesize(input);
          if (synthesizeError) throw synthesizeError;
          return synthesisResult;
        },
      });
    },
  });
  return { provider, calls };
}

function enabledHandler({
  snapshot = reviewedSnapshot(),
  budgetSpy = createBudgetSpy(),
  budget = budgetSpy.ledger,
  recordingProvider = createRecordingProvider(),
  ticketCodec = fixedTicketCodec(),
  config = {},
} = {}) {
  let packLoads = 0;
  const handler = createVoiceHandler({
    http: createTestHttp(),
    packLoader: { async load() { packLoads += 1; return snapshot; } },
    governance,
    ticketCodec,
    provider: recordingProvider.provider,
    budget,
    config: {
      enabled: true,
      rotationId: 'rotation-2026-07-a',
      runtime: RUNTIME_PINS,
      now: () => NOW_MS,
      ...config,
    },
  });
  return {
    handler,
    budgetSpy,
    recordingProvider,
    get packLoads() { return packLoads; },
  };
}

function realBudgetFactory(fake, { store = fake.store } = {}) {
  let randomSequence = 0;
  return ({ snapshot, config }) => createBudgetLedger({
    store,
    namespace: 'voice-test',
    rotationId: config.rotationId,
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    rateCard: snapshot.pack.speechEngine.rateCard,
    clock: config.now,
    randomBytes(size) {
      assert.equal(size, 32);
      randomSequence += 1;
      return Buffer.alloc(size, randomSequence);
    },
  });
}

function dependencies(overrides = {}) {
  const calls = { pack: 0, provider: 0, budget: 0 };
  return {
    calls,
    input: {
      http: createTestHttp(),
      packLoader: {
        async load() {
          calls.pack += 1;
          throw new Error('pack must not be read');
        },
      },
      governance: Object.freeze({}),
      ticketCodec: Object.freeze({}),
      provider: {
        async prepare() {
          calls.provider += 1;
          throw new Error('provider must not be prepared');
        },
      },
      budget: {
        async getBand() {
          calls.budget += 1;
          throw new Error('budget must not be read');
        },
      },
      config: {
        enabled: false,
        now: () => Date.parse('2026-07-14T12:00:00.000Z'),
      },
      ...overrides,
    },
  };
}

async function errorBody(response) {
  return (await response.json()).error;
}

test('exports the exact Netlify path and disabled health reads no pack, provider key, body, or budget', async () => {
  assert.deepEqual(netlifyConfig, { path: '/api/sp/voice' });
  const harness = dependencies();
  const handler = createVoiceHandler(harness.input);

  const health = await handler(learnerRequest());
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    schemaVersion: 1,
    enabled: false,
    acceptingVoice: false,
    budgetBand: null,
    activeStack: null,
    eligibleProfiles: [],
    acceptedMediaTypes: [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ],
    limits: {
      maxAudioBytes: 4_194_304,
      maxAudioDurationMilliseconds: 90_000,
    },
  });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');

  const body = new ReadableStream({
    pull() { throw new Error('disabled request body must not be read'); },
  });
  const disabledPost = learnerRequest('?op=transcribe', {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
    body,
  });
  const response = await handler(disabledPost);
  assert.equal(response.status, 503);
  assert.deepEqual(await errorBody(response), {
    code: 'managed_voice_disabled',
    message: 'Managed voice is not available.',
  });
  assert.equal(disabledPost.bodyUsed, false);
  assert.deepEqual(harness.calls, { pack: 0, provider: 0, budget: 0 });
});

test('learner preflight, typed 401, disallowed origin, and method matrix preserve CORS boundaries', async () => {
  const harness = dependencies();
  const handler = createVoiceHandler(harness.input);

  for (const path of ['', '?op=transcribe', '?op=speak']) {
    const response = await handler(learnerRequest(path, { method: 'OPTIONS', studentKey: null }));
    assert.equal(response.status, 204, path);
    assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(
      response.headers.get('access-control-allow-headers'),
      'Content-Type, x-student-key, x-sp-case-id, x-sp-encounter-id, x-sp-turn-id, x-sp-capture-id',
    );
  }

  const wrongKey = await handler(learnerRequest('', { studentKey: 'wrong' }));
  assert.equal(wrongKey.status, 401);
  assert.equal(wrongKey.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal((await errorBody(wrongKey)).code, 'unauthorized');

  const disallowed = await handler(learnerRequest('', {
    origin: 'https://attacker.example.test',
  }));
  assert.equal(disallowed.status, 403);
  assert.equal(disallowed.headers.has('access-control-allow-origin'), false);

  for (const [path, method] of [
    ['?op=speak', 'GET'],
    ['?op=transcribe', 'GET'],
    ['', 'POST'],
    ['?op=unknown', 'POST'],
  ]) {
    const response = await handler(learnerRequest(path, { method }));
    assert.equal(response.status, 405, `${method} ${path}`);
    assert.equal((await errorBody(response)).code, 'method_not_allowed');
  }

  const usagePreflight = await handler(learnerRequest('?op=usage', {
    method: 'OPTIONS',
    studentKey: null,
  }));
  assert.equal(usagePreflight.status, 405);
  assert.equal(usagePreflight.headers.has('access-control-allow-origin'), false);
  assert.deepEqual(harness.calls, { pack: 0, provider: 0, budget: 0 });
});

test('enabled health uses one frozen pack, reviewed profiles, provider key, then budget band', async () => {
  const snapshot = reviewedSnapshot();
  const order = [];
  let packLoads = 0;
  let providerStack;
  const handler = createVoiceHandler({
    http: createTestHttp(),
    packLoader: {
      async load() {
        order.push('pack');
        packLoads += 1;
        return snapshot;
      },
    },
    governance,
    ticketCodec: Object.freeze({}),
    provider({ stack }) {
      order.push('provider-factory');
      providerStack = stack;
      return Object.freeze({
        async prepare() {
          order.push('provider-key');
          return Object.freeze({});
        },
      });
    },
    budget() {
      order.push('budget-factory');
      return Object.freeze({
        async getBand() {
          order.push('budget-band');
          return 'ok';
        },
      });
    },
    config: {
      enabled: true,
      rotationId: 'rotation-2026-07-a',
      runtime: RUNTIME_PINS,
      now: () => NOW_MS,
    },
  });

  const response = await handler(learnerRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    enabled: true,
    acceptingVoice: true,
    budgetBand: 'ok',
    activeStack: {
      id: 'openai-quality-v1',
      transcription: { provider: 'openai', model: 'whisper-1' },
      synthesis: { provider: 'openai', model: 'tts-1-hd' },
    },
    eligibleProfiles: [
      { caseId: 'case-reviewed', profileId: 'dana-measured-v1', profileVersion: 2 },
      { caseId: 'case-reviewed-second', profileId: 'morgan-guarded-v1', profileVersion: 2 },
    ],
    acceptedMediaTypes: [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ],
    limits: { maxAudioBytes: 4_194_304, maxAudioDurationMilliseconds: 90_000 },
  });
  assert.equal(packLoads, 1);
  assert.equal(Object.isFrozen(snapshot.pack), true);
  assert.deepEqual(providerStack, {
    id: 'openai-quality-v1',
    transcription: { provider: 'openai', model: 'whisper-1' },
    synthesis: { provider: 'openai', model: 'tts-1-hd' },
    zeroRetentionEntitled: false,
  });
  assert.deepEqual(order, [
    'pack',
    'provider-factory',
    'provider-key',
    'budget-factory',
    'budget-band',
  ]);
});

test('pending governance returns no active voice and never reads provider credentials or budget', async () => {
  const pack = createReviewedPack();
  pack.speechEngine.status = 'draft-pending-attestation';
  pack.speechEngine.enabled = false;
  const snapshot = reviewedSnapshot(pack);
  let providerCalls = 0;
  let budgetCalls = 0;
  const handler = createVoiceHandler({
    http: createTestHttp(),
    packLoader: { async load() { return snapshot; } },
    governance,
    ticketCodec: Object.freeze({}),
    provider() { providerCalls += 1; throw new Error('not eligible'); },
    budget() { budgetCalls += 1; throw new Error('not eligible'); },
    config: {
      enabled: true,
      rotationId: 'rotation-2026-07-a',
      runtime: RUNTIME_PINS,
      now: () => NOW_MS,
    },
  });

  const response = await handler(learnerRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.enabled, true);
  assert.equal(body.acceptingVoice, false);
  assert.equal(body.budgetBand, null);
  assert.equal(body.activeStack, null);
  assert.deepEqual(body.eligibleProfiles, []);
  assert.equal(providerCalls, 0);
  assert.equal(budgetCalls, 0);
});

test('operations usage is the exact aggregate allowlist and never emits learner CORS', async () => {
  const usage = Object.freeze({
    schemaVersion: 1,
    band: 'warning',
    currency: 'USD',
    rateCardVersion: 'reviewed-v1',
    authorizedMicros: 16_000_000,
    spentMicros: 15_000_000,
    reservedMicros: 1_000_000,
    remainingMicros: 4_000_000,
    overrunMicros: 0,
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    units: {
      actorInputTokens: 1,
      actorOutputTokens: 2,
      transcriptionMilliseconds: 3,
      synthesisCharacters: 4,
    },
    updatedAt: '2026-07-14T12:00:00.000Z',
  });
  let usageCalls = 0;
  const harness = dependencies({
    budget: {
      async getUsage() { usageCalls += 1; return usage; },
    },
    config: {
      enabled: true,
      rotationId: 'rotation-2026-07-a',
      runtime: RUNTIME_PINS,
      now: () => NOW_MS,
    },
  });
  const handler = createVoiceHandler(harness.input);

  const response = await handler(operationsRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), usage);
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(usageCalls, 1);

  const wrongKey = await handler(operationsRequest('?op=usage', { operationsKey: 'wrong' }));
  assert.equal(wrongKey.status, 401);
  assert.equal(wrongKey.headers.has('access-control-allow-origin'), false);
  assert.equal(usageCalls, 1);
});

test('valid transcription validates audio before key and budget, then settles trusted milliseconds', async () => {
  const audio = wav({ dataLength: 8_000 });
  const harness = enabledHandler();
  const response = await harness.handler(transcribeRequest({
    audio,
    contentLength: 'malformed-hint-is-not-trusted',
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    text: 'What brings you in?',
    durationMilliseconds: 8_470,
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(harness.packLoads, 1);
  assert.equal(harness.recordingProvider.calls[0].method, 'prepare');
  assert.equal(harness.recordingProvider.calls[1].method, 'transcribe');
  assert.deepEqual(harness.recordingProvider.calls[1].input.audio, audio);
  assert.equal(harness.recordingProvider.calls[1].input.mimeType, 'audio/wav');
  assert.equal(harness.budgetSpy.calls[0].method, 'getBand');
  assert.deepEqual(harness.budgetSpy.calls[1], {
    method: 'reserve',
    input: {
      idempotencyKey: JSON.stringify({
        schemaVersion: 1,
        rotationId: 'rotation-2026-07-a',
        encounterId: 'encounter-7',
        turnId: 3,
        caseId: 'case-reviewed',
        operation: 'transcription',
        captureId: CAPTURE_ID,
      }),
      kind: 'transcription',
      rateKey: { provider: 'openai', model: 'whisper-1' },
      maximumUsage: { milliseconds: 90_000 },
    },
  });
  assert.equal(harness.budgetSpy.calls[2].method, 'markProviderStarted');
  assert.deepEqual(harness.budgetSpy.calls[3], {
    method: 'settle',
    input: {
      reservation: harness.budgetSpy.reservation,
      outcome: 'succeeded',
      usage: { milliseconds: 9_000 },
    },
  });
});

test('MP4, spoofed media, overlong audio, and invalid identifiers fail before key or budget', async () => {
  const invalidRequests = [
    ['MP4 is not accepted', transcribeRequest({
      contentType: 'audio/mp4',
      audio: bytes(u32le(16), ascii('ftyp'), new Uint8Array(8)),
    }), 415],
    ['MIME spoof', transcribeRequest({ contentType: 'audio/ogg', audio: wav() }), 415],
    ['over 90 seconds under 4 MiB', transcribeRequest({
      audio: wav({ dataLength: 720_001 }),
    }), 422],
    ['bad case ID', transcribeRequest({ caseId: 'case reviewed' }), 400],
    ['bad encounter ID', transcribeRequest({ encounterId: 'patient name here' }), 400],
    ['noncanonical turn', transcribeRequest({ turnId: '03' }), 400],
    ['bad capture ID', transcribeRequest({ captureId: 'not-16-byte-base64url' }), 400],
    ['draft case', transcribeRequest({ caseId: 'case-draft' }), 403],
  ];

  for (const [label, request, status] of invalidRequests) {
    const harness = enabledHandler();
    const response = await harness.handler(request);
    assert.equal(response.status, status, label);
    assert.equal(harness.recordingProvider.calls.length, 0, label);
    assert.equal(harness.budgetSpy.calls.length, 0, label);
  }
});

test('actual streaming bytes enforce the exact 4 MiB boundary and cancel overflow', async () => {
  const earlyHarness = enabledHandler();
  let earlyPulled = false;
  const earlyBody = new ReadableStream({
    pull() { earlyPulled = true; throw new Error('must not pull an oversized declared body'); },
  });
  const earlyRequest = transcribeRequest({
    body: earlyBody,
    contentLength: String(4_194_305),
  });
  await Promise.resolve();
  const platformPulledBeforeHandler = earlyPulled;
  earlyPulled = false;
  const early = await earlyHarness.handler(earlyRequest);
  assert.equal(early.status, 413);
  assert.equal(earlyPulled, false);
  assert.equal(platformPulledBeforeHandler, true, 'Node prefetches the stream independently');

  let cancelled = false;
  const chunks = [new Uint8Array(4_194_304), Uint8Array.of(1)];
  const overflowBody = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  const overflowHarness = enabledHandler();
  const overflow = await overflowHarness.handler(transcribeRequest({ body: overflowBody }));
  assert.equal(overflow.status, 413);
  assert.equal(cancelled, true);
  assert.equal(overflowHarness.recordingProvider.calls.length, 0);
  assert.equal(overflowHarness.budgetSpy.calls.length, 0);

  const boundaryHarness = enabledHandler();
  const boundaryAudio = new Uint8Array(4_194_304);
  boundaryAudio.set(ascii('RIFF'), 0);
  boundaryAudio.set(u32le(boundaryAudio.length - 8), 4);
  boundaryAudio.set(ascii('WAVE'), 8);
  const boundary = await boundaryHarness.handler(transcribeRequest({
    body: boundaryAudio,
  }));
  assert.equal(boundary.status, 422, 'exactly 4 MiB is inspected rather than rejected for size');
  assert.equal(boundaryHarness.recordingProvider.calls.length, 0);
  assert.equal(boundaryHarness.budgetSpy.calls.length, 0);
});

test('300,000 one-byte audio chunks stay within a 64 MiB heap before media rejection', async () => {
  const harness = enabledHandler();
  let emitted = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (emitted >= 300_000) {
        controller.close();
        return;
      }
      controller.enqueue(Uint8Array.of(0));
      emitted += 1;
    },
  });
  const response = await harness.handler(transcribeRequest({ body }));
  assert.equal(response.status, 415);
  assert.equal(emitted, 300_000);
  assert.deepEqual(harness.recordingProvider.calls, []);
  assert.deepEqual(harness.budgetSpy.calls, []);
});

test('zero-progress audio and JSON chunks reject instead of extending stream work', async () => {
  const audioHarness = enabledHandler();
  const validAudio = wav();
  let audioStep = 0;
  const audioBody = new ReadableStream({
    pull(controller) {
      if (audioStep === 0) controller.enqueue(new Uint8Array());
      else if (audioStep === 1) controller.enqueue(validAudio);
      else controller.close();
      audioStep += 1;
    },
  });
  const audioResponse = await audioHarness.handler(transcribeRequest({ body: audioBody }));
  assert.equal(audioResponse.status, 422);
  assert.deepEqual(audioHarness.recordingProvider.calls, []);
  assert.deepEqual(audioHarness.budgetSpy.calls, []);

  const jsonHarness = enabledHandler();
  const reply = '*looks away* Hello there.';
  const codec = fixedTicketCodec();
  const payload = new TextEncoder().encode(JSON.stringify({
    reply,
    ticket: ticketFor({ codec, reply }),
  }));
  let jsonStep = 0;
  const jsonBody = new ReadableStream({
    pull(controller) {
      if (jsonStep === 0) controller.enqueue(new Uint8Array());
      else if (jsonStep === 1) controller.enqueue(payload);
      else controller.close();
      jsonStep += 1;
    },
  });
  const jsonResponse = await jsonHarness.handler(speakRequest({
    codec,
    reply,
    body: jsonBody,
  }));
  assert.equal(jsonResponse.status, 400);
  assert.equal((await errorBody(jsonResponse)).code, 'invalid_speech_request');
  assert.deepEqual(jsonHarness.recordingProvider.calls, []);
  assert.deepEqual(jsonHarness.budgetSpy.calls, []);
});

test('missing provider key and non-ok bands cause zero reservation or provider invocation', async () => {
  const missingRotation = enabledHandler({ config: { rotationId: '' } });
  const rotationResponse = await missingRotation.handler(transcribeRequest());
  assert.equal(rotationResponse.status, 503);
  assert.equal((await errorBody(rotationResponse)).code, 'invalid_configuration');
  assert.equal(missingRotation.packLoads, 0);
  assert.deepEqual(missingRotation.recordingProvider.calls, []);
  assert.deepEqual(missingRotation.budgetSpy.calls, []);

  const missingKeyProvider = createRecordingProvider({
    prepareError: operationalError(503, 'invalid_configuration', 'Managed speech is not configured.'),
  });
  const missingKey = enabledHandler({ recordingProvider: missingKeyProvider });
  const keyResponse = await missingKey.handler(transcribeRequest());
  assert.equal(keyResponse.status, 503);
  assert.equal((await errorBody(keyResponse)).code, 'invalid_configuration');
  assert.deepEqual(missingKey.budgetSpy.calls, []);

  for (const band of ['warning', 'capped']) {
    const budgetSpy = createBudgetSpy({ band });
    const harness = enabledHandler({ budgetSpy });
    const response = await harness.handler(transcribeRequest());
    assert.equal(response.status, 429, band);
    assert.equal((await errorBody(response)).code, 'voice_budget_reserved');
    assert.deepEqual(budgetSpy.calls, [{ method: 'getBand' }]);
    assert.deepEqual(harness.recordingProvider.calls, [{ method: 'prepare' }]);

    const healthBudget = createBudgetSpy({ band });
    const healthHarness = enabledHandler({ budgetSpy: healthBudget });
    const healthResponse = await healthHarness.handler(learnerRequest());
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.budgetBand, band);
    assert.equal(health.acceptingVoice, false);
  }
});

test('valid signed synthesis strips visual directions, settles exact characters, then returns no-store audio', async () => {
  const snapshot = reviewedSnapshot();
  const codec = fixedTicketCodec();
  const reply = '*looks away* Hello there.';
  const harness = enabledHandler({ snapshot, ticketCodec: codec });
  const response = await harness.handler(speakRequest({ snapshot, codec, reply }));

  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), Uint8Array.of(0x49, 0x44, 0x33, 0x04));
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('content-length'), '4');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(harness.packLoads, 1);
  assert.equal(harness.recordingProvider.calls[0].method, 'prepare');
  assert.equal(harness.recordingProvider.calls[1].method, 'synthesize');
  assert.equal(harness.recordingProvider.calls[1].input.text, 'Hello there.');
  const caseDef = snapshot.pack.cases.find(({ id }) => id === 'case-reviewed');
  const eligibility = governance.requireManagedVoiceEligibility({
    pack: snapshot.pack,
    packHash: snapshot.packHash,
    caseDef,
    now: () => NOW_MS,
    runtime: RUNTIME_PINS,
  });
  assert.deepEqual(harness.recordingProvider.calls[1].input.profile, eligibility.profile);
  assert.equal(harness.budgetSpy.calls[0].method, 'getBand');
  assert.deepEqual(harness.budgetSpy.calls[1], {
    method: 'reserve',
    input: {
      idempotencyKey: JSON.stringify({
        schemaVersion: 1,
        rotationId: 'rotation-2026-07-a',
        encounterId: 'encounter-7',
        turnId: 3,
        caseId: 'case-reviewed',
        operation: 'synthesis',
        jti: CAPTURE_ID,
      }),
      kind: 'synthesis',
      rateKey: { provider: 'openai', model: 'tts-1-hd' },
      maximumUsage: { characters: 4_096 },
    },
  });
  assert.equal(harness.budgetSpy.calls[2].method, 'markProviderStarted');
  assert.deepEqual(harness.budgetSpy.calls[3], {
    method: 'settle',
    input: {
      reservation: harness.budgetSpy.reservation,
      outcome: 'succeeded',
      usage: { characters: 12 },
    },
  });
});

test('synthesis JSON, spoken text, ticket, and governance fail before key or budget', async () => {
  const codec = fixedTicketCodec();
  const snapshot = reviewedSnapshot();
  const validTicket = ticketFor({ snapshot, codec });
  const cases = [
    ['wrong media type', speakRequest({ snapshot, codec, contentType: 'text/plain' }), 415],
    ['declared body too large', speakRequest({
      snapshot,
      codec,
      contentLength: String(16 * 1024 + 1),
    }), 413],
    ['malformed JSON', speakRequest({ snapshot, codec, body: '{' }), 400],
    ['extra JSON field', speakRequest({
      snapshot,
      codec,
      body: JSON.stringify({ reply: '*looks away* Hello there.', ticket: validTicket, extra: true }),
    }), 400],
    ['empty spoken text', speakRequest({ reply: '*looks away*', snapshot, codec }), 400],
    ['provider control syntax', speakRequest({ reply: '[whispers] Hello.', snapshot, codec }), 400],
    ['over 4096 code points', speakRequest({ reply: 'x'.repeat(4_097), snapshot, codec }), 400],
    ['altered signed reply', speakRequest({
      reply: 'Altered reply.',
      ticket: validTicket,
      snapshot,
      codec,
    }), 403],
  ];

  for (const [label, request, status] of cases) {
    const harness = enabledHandler({ snapshot, ticketCodec: codec });
    const response = await harness.handler(request);
    assert.equal(response.status, status, label);
    assert.deepEqual(harness.recordingProvider.calls, [], label);
    assert.deepEqual(harness.budgetSpy.calls, [], label);
  }
});

test('provider failure is charged conservatively and settlement failure blocks every response', async () => {
  const providerError = operationalError(
    502,
    'speech_provider_error',
    'The speech provider could not complete the request.',
  );
  const failedProvider = createRecordingProvider({ synthesizeError: providerError });
  const failed = enabledHandler({ recordingProvider: failedProvider });
  const failedResponse = await failed.handler(speakRequest());
  assert.equal(failedResponse.status, 502);
  assert.equal((await errorBody(failedResponse)).code, 'speech_provider_error');
  assert.deepEqual(failed.budgetSpy.calls.at(-1), {
    method: 'settle',
    input: {
      reservation: failed.budgetSpy.reservation,
      outcome: 'provider_failed',
      usage: null,
    },
  });

  const settlementError = operationalError(
    503,
    'budget_unavailable',
    'Budget accounting is temporarily unavailable.',
  );
  const budgetSpy = createBudgetSpy({ settleError: settlementError });
  const unsettled = enabledHandler({ budgetSpy });
  const unsettledResponse = await unsettled.handler(speakRequest());
  assert.equal(unsettledResponse.status, 503);
  assert.equal((await errorBody(unsettledResponse)).code, 'budget_unavailable');
  assert.equal(unsettled.recordingProvider.calls.filter(({ method }) => method === 'synthesize').length, 1);
});

test('ten duplicate synthesis requests and a process restart authorize exactly one provider call', async () => {
  const fake = createFakeBlobStore({ nonStrongReadsReturnNull: true });
  const budget = realBudgetFactory(fake);
  const snapshot = reviewedSnapshot();
  const codec = fixedTicketCodec();
  const provider = createRecordingProvider();
  const ticket = ticketFor({ snapshot, codec });
  const harness = enabledHandler({
    snapshot,
    ticketCodec: codec,
    recordingProvider: provider,
    budget,
  });

  const responses = await Promise.all(Array.from({ length: 10 }, () => (
    harness.handler(speakRequest({ snapshot, codec, ticket }))
  )));
  assert.equal(responses.filter(({ status }) => status === 200).length, 1);
  assert.equal(responses.filter(({ status }) => status === 409).length, 9);
  const duplicateCodes = await Promise.all(responses
    .filter(({ status }) => status === 409)
    .map(errorBody));
  assert.equal(duplicateCodes.every(({ code }) => (
    code === 'speech_in_progress' || code === 'speech_already_redeemed'
  )), true);
  assert.equal(provider.calls.filter(({ method }) => method === 'synthesize').length, 1);

  const restarted = enabledHandler({
    snapshot,
    ticketCodec: codec,
    recordingProvider: provider,
    budget,
  });
  const retry = await restarted.handler(speakRequest({ snapshot, codec, ticket }));
  assert.equal(retry.status, 409);
  assert.equal((await errorBody(retry)).code, 'speech_already_redeemed');
  assert.equal(provider.calls.filter(({ method }) => method === 'synthesize').length, 1);

  const usage = await (await budget({
    snapshot,
    config: {
      rotationId: 'rotation-2026-07-a',
      now: () => NOW_MS,
    },
  })).getUsage();
  assert.equal(usage.units.synthesisCharacters, 12);
  assert.equal(usage.reservedMicros, 0);
  const storedText = JSON.stringify(fake.calls);
  assert.equal(storedText.includes('*looks away* Hello there.'), false);
  assert.equal(storedText.includes(TICKET_SECRET), false);
});

test('ambiguous settlement and post-settlement response loss never authorize a retry', async () => {
  const snapshot = reviewedSnapshot();
  const codec = fixedTicketCodec();
  const ticket = ticketFor({ snapshot, codec });

  const ambiguousFake = createFakeBlobStore({ nonStrongReadsReturnNull: true });
  let writes = 0;
  const failSettlementStore = {
    getWithMetadata: (...args) => ambiguousFake.store.getWithMetadata(...args),
    async set(...args) {
      writes += 1;
      if (writes === 4) throw new Error('simulated settlement outage');
      return ambiguousFake.store.set(...args);
    },
  };
  const provider = createRecordingProvider();
  const first = enabledHandler({
    snapshot,
    ticketCodec: codec,
    recordingProvider: provider,
    budget: realBudgetFactory(ambiguousFake, { store: failSettlementStore }),
  });
  const failedSettlement = await first.handler(speakRequest({ snapshot, codec, ticket }));
  assert.equal(failedSettlement.status, 503);
  assert.equal((await errorBody(failedSettlement)).code, 'budget_unavailable');
  assert.equal(provider.calls.filter(({ method }) => method === 'synthesize').length, 1);

  const retry = enabledHandler({
    snapshot,
    ticketCodec: codec,
    recordingProvider: provider,
    budget: realBudgetFactory(ambiguousFake),
  });
  const retryResponse = await retry.handler(speakRequest({ snapshot, codec, ticket }));
  assert.equal(retryResponse.status, 409);
  assert.equal((await errorBody(retryResponse)).code, 'speech_in_progress');
  assert.equal(provider.calls.filter(({ method }) => method === 'synthesize').length, 1);

  const settledFake = createFakeBlobStore({ nonStrongReadsReturnNull: true });
  const settledProvider = createRecordingProvider();
  const baseHttp = createTestHttp();
  const crashHttp = Object.freeze({
    ...baseHttp,
    binary() { throw new Error('simulated response loss'); },
  });
  const settledBudget = realBudgetFactory(settledFake);
  const crashingHandler = createVoiceHandler({
    http: crashHttp,
    packLoader: { async load() { return snapshot; } },
    governance,
    ticketCodec: codec,
    provider: settledProvider.provider,
    budget: settledBudget,
    config: {
      enabled: true,
      rotationId: 'rotation-2026-07-a',
      runtime: RUNTIME_PINS,
      now: () => NOW_MS,
    },
  });
  const lost = await crashingHandler(speakRequest({ snapshot, codec, ticket }));
  assert.equal(lost.status, 500);
  assert.equal(settledProvider.calls.filter(({ method }) => method === 'synthesize').length, 1);

  const afterLoss = enabledHandler({
    snapshot,
    ticketCodec: codec,
    recordingProvider: settledProvider,
    budget: settledBudget,
  });
  const afterLossResponse = await afterLoss.handler(speakRequest({ snapshot, codec, ticket }));
  assert.equal(afterLossResponse.status, 409);
  assert.equal((await errorBody(afterLossResponse)).code, 'speech_already_redeemed');
  assert.equal(settledProvider.calls.filter(({ method }) => method === 'synthesize').length, 1);
});

test('same recording capture is idempotent while a new capture authorizes one new transcription', async () => {
  const fake = createFakeBlobStore({ nonStrongReadsReturnNull: true });
  const budget = realBudgetFactory(fake);
  const provider = createRecordingProvider();
  const harness = enabledHandler({ recordingProvider: provider, budget });

  const first = await harness.handler(transcribeRequest());
  assert.equal(first.status, 200);
  const retry = await harness.handler(transcribeRequest());
  assert.equal(retry.status, 409);
  assert.equal((await errorBody(retry)).code, 'transcription_already_processed');
  const newCapture = await harness.handler(transcribeRequest({ captureId: CAPTURE_ID_2 }));
  assert.equal(newCapture.status, 200);
  assert.equal(provider.calls.filter(({ method }) => method === 'transcribe').length, 2);
});

test('caller cancellation is released before authorization and charged after authorization', async () => {
  const beforeController = new AbortController();
  const before = enabledHandler();
  const beforeRequest = transcribeRequest({ signal: beforeController.signal });
  beforeController.abort();
  const beforeResponse = await before.handler(beforeRequest);
  assert.equal(beforeResponse.status, 499);
  assert.equal((await errorBody(beforeResponse)).code, 'request_cancelled');
  assert.deepEqual(before.recordingProvider.calls, []);
  assert.deepEqual(before.budgetSpy.calls, []);

  const reservedController = new AbortController();
  const reservedBudget = createBudgetSpy({
    onReserve() { reservedController.abort(); },
  });
  const reserved = enabledHandler({ budgetSpy: reservedBudget });
  const reservedResponse = await reserved.handler(speakRequest({ signal: reservedController.signal }));
  assert.equal(reservedResponse.status, 499);
  assert.deepEqual(reservedBudget.calls.map(({ method }) => method), [
    'getBand',
    'reserve',
    'failBeforeProvider',
  ]);
  assert.equal(reserved.recordingProvider.calls.some(({ method }) => method === 'synthesize'), false);

  const providerController = new AbortController();
  const provider = createRecordingProvider({
    onSynthesize() { providerController.abort(); },
    synthesizeError: operationalError(499, 'request_cancelled', 'The request was cancelled.'),
  });
  const authorized = enabledHandler({ recordingProvider: provider });
  const providerRequest = speakRequest({ signal: providerController.signal });
  const authorizedResponse = await authorized.handler(providerRequest);
  assert.equal(authorizedResponse.status, 499);
  assert.deepEqual(authorized.budgetSpy.calls.at(-1), {
    method: 'settle',
    input: {
      reservation: authorized.budgetSpy.reservation,
      outcome: 'provider_failed',
      usage: null,
    },
  });

  const settlementController = new AbortController();
  const settlementBudget = createBudgetSpy({
    onSettle() { settlementController.abort(); },
  });
  const duringSettlement = enabledHandler({ budgetSpy: settlementBudget });
  const settlementResponse = await duringSettlement.handler(speakRequest({
    signal: settlementController.signal,
  }));
  assert.equal(settlementResponse.status, 499);
  assert.equal((await errorBody(settlementResponse)).code, 'request_cancelled');
  assert.equal(settlementBudget.calls.at(-1).method, 'settle');
  assert.equal(duringSettlement.recordingProvider.calls.filter(({ method }) => method === 'synthesize').length, 1);
});

test('cancellation during provider preparation or band lookup never creates a reservation', async () => {
  const prepareController = new AbortController();
  const preparingProvider = createRecordingProvider({
    onPrepare() { prepareController.abort(); },
  });
  const preparing = enabledHandler({ recordingProvider: preparingProvider });
  const preparingResponse = await preparing.handler(transcribeRequest({
    signal: prepareController.signal,
  }));
  assert.equal(preparingResponse.status, 499);
  assert.deepEqual(preparing.budgetSpy.calls, []);
  assert.deepEqual(preparingProvider.calls, [{ method: 'prepare' }]);

  const bandController = new AbortController();
  const bandBudget = createBudgetSpy({
    onGetBand() { bandController.abort(); },
  });
  const duringBand = enabledHandler({ budgetSpy: bandBudget });
  const bandResponse = await duringBand.handler(transcribeRequest({ signal: bandController.signal }));
  assert.equal(bandResponse.status, 499);
  assert.deepEqual(bandBudget.calls, [{ method: 'getBand' }]);
  assert.equal(duringBand.recordingProvider.calls.some(({ method }) => method === 'transcribe'), false);
});

test('malformed or oversized provider outputs fail closed and settle the reserved maximum', async () => {
  const malformedTranscript = createRecordingProvider({
    transcriptionResult: Object.freeze({
      text: 'Provider text',
      durationMilliseconds: 1_000,
      usage: Object.freeze({ milliseconds: 1_000, unexpected: 1 }),
    }),
  });
  const transcription = enabledHandler({ recordingProvider: malformedTranscript });
  const transcriptionResponse = await transcription.handler(transcribeRequest());
  assert.equal(transcriptionResponse.status, 502);
  assert.deepEqual(transcription.budgetSpy.calls.at(-1).input, {
    reservation: transcription.budgetSpy.reservation,
    outcome: 'provider_failed',
    usage: null,
  });

  const oversizedAudio = createRecordingProvider({
    synthesisResult: Object.freeze({
      audio: new Uint8Array(10 * 1024 * 1024 + 1),
      contentType: 'audio/mpeg',
      usage: Object.freeze({ characters: 12 }),
    }),
  });
  const synthesis = enabledHandler({ recordingProvider: oversizedAudio });
  const synthesisResponse = await synthesis.handler(speakRequest());
  assert.equal(synthesisResponse.status, 502);
  assert.deepEqual(synthesis.budgetSpy.calls.at(-1).input, {
    reservation: synthesis.budgetSpy.reservation,
    outcome: 'provider_failed',
    usage: null,
  });
});

test('the default handler hard-disables deploy previews without touching the network', async () => {
  const names = [
    'CONTEXT',
    'SP_MANAGED_VOICE_ENABLED',
    'SP_STUDENT_PASSCODE',
    'SP_OPERATIONS_KEY',
    'SP_ALLOWED_ORIGINS',
  ];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const priorFetch = globalThis.fetch;
  process.env.CONTEXT = 'deploy-preview';
  process.env.SP_MANAGED_VOICE_ENABLED = 'true';
  process.env.SP_STUDENT_PASSCODE = STUDENT_KEY;
  process.env.SP_OPERATIONS_KEY = OPERATIONS_KEY;
  process.env.SP_ALLOWED_ORIGINS = ORIGIN;
  globalThis.fetch = async () => { throw new Error('network denied in endpoint tests'); };
  try {
    const response = await productionVoiceHandler(learnerRequest());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      schemaVersion: 1,
      enabled: false,
      acceptingVoice: false,
      budgetBand: null,
      activeStack: null,
      eligibleProfiles: [],
      acceptedMediaTypes: [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/ogg',
        'audio/ogg;codecs=opus',
        'audio/wav',
      ],
      limits: { maxAudioBytes: 4_194_304, maxAudioDurationMilliseconds: 90_000 },
    });
  } finally {
    globalThis.fetch = priorFetch;
    for (const name of names) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  }
});

// F7 — the billable voice POST routes must enforce the same pack-status floor
// the actor endpoint enforces (sp.mjs POST_PACK_STATUSES). A reviewed+enabled
// speech engine on a pack whose top-level status is not approved must not bill
// transcription or synthesis.
test('transcribe and speak reject a pack whose top-level status is not approved, with no billable work', async () => {
  const pack = createReviewedPack();
  pack.status = 'draft-pending-attestation';
  const snapshot = reviewedSnapshot(pack);

  const t = enabledHandler({ snapshot });
  const transcribeResponse = await t.handler(transcribeRequest());
  assert.equal(transcribeResponse.status, 403);
  assert.equal((await transcribeResponse.json()).error.code, 'pack_not_approved');
  assert.deepEqual(t.recordingProvider.calls, []);
  assert.deepEqual(t.budgetSpy.calls, []);

  const s = enabledHandler({ snapshot });
  const speakResponse = await s.handler(speakRequest({ snapshot }));
  assert.equal(speakResponse.status, 403);
  assert.equal((await speakResponse.json()).error.code, 'pack_not_approved');
  assert.deepEqual(s.recordingProvider.calls, []);
  assert.deepEqual(s.budgetSpy.calls, []);
});

// F7 parity on the advisory surface — the health route must not advertise
// acceptingVoice/eligible profiles that every billable POST would then 403,
// or the client enables the mic and every capture dies as pack_not_approved.
test('health does not advertise voice for a pack whose top-level status is not approved', async () => {
  const pack = createReviewedPack();
  pack.status = 'draft-pending-attestation';
  const snapshot = reviewedSnapshot(pack);

  const harness = enabledHandler({ snapshot });
  const response = await harness.handler(learnerRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.enabled, true);
  assert.equal(body.acceptingVoice, false);
  assert.equal(body.budgetBand, null);
  assert.equal(body.activeStack, null);
  assert.deepEqual(body.eligibleProfiles, []);
  assert.deepEqual(harness.recordingProvider.calls, []);
  assert.deepEqual(harness.budgetSpy.calls, []);
});

// F15 — the anti-billing kill switch depends on request.signal being forwarded
// into the provider call (sp-voice.mjs synthesize/transcribe: signal:
// request.signal). The adapter-level abort is tested elsewhere; this locks the
// sp-voice -> provider forwarding seam so dropping it turns red.
test('the request abort signal is forwarded into the provider transcribe and synthesize calls', async () => {
  const transcribeController = new AbortController();
  const t = enabledHandler();
  const transcribeResponse = await t.handler(
    transcribeRequest({ signal: transcribeController.signal }),
  );
  assert.equal(transcribeResponse.status, 200);
  const transcribeCall = t.recordingProvider.calls.find((call) => call.method === 'transcribe');
  assert.ok(transcribeCall, 'provider transcribe must have been called');
  assert.ok(
    transcribeCall.input.signal instanceof AbortSignal,
    'provider transcribe must receive the request AbortSignal (forwarding not dropped)',
  );
  assert.equal(transcribeCall.input.signal.aborted, false);
  transcribeController.abort();
  assert.equal(transcribeCall.input.signal.aborted, true);

  const synthController = new AbortController();
  const s = enabledHandler();
  const speakResponse = await s.handler(speakRequest({ signal: synthController.signal }));
  assert.equal(speakResponse.status, 200);
  const synthesizeCall = s.recordingProvider.calls.find((call) => call.method === 'synthesize');
  assert.ok(synthesizeCall, 'provider synthesize must have been called');
  assert.ok(
    synthesizeCall.input.signal instanceof AbortSignal,
    'provider synthesize must receive the request AbortSignal (forwarding not dropped)',
  );
  synthController.abort();
  assert.equal(synthesizeCall.input.signal.aborted, true);
});
