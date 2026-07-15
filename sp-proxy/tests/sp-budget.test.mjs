import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  createBudgetLedger,
  SP_USAGE_NAMESPACE,
  SP_USAGE_STORE_NAME,
} from '../netlify/functions/_shared/sp-budget.mjs';
import { createFakeBlobStore } from './helpers/fake-blob-store.mjs';

const NOW_MS = Date.parse('2026-07-14T12:00:00.000Z');
const KEY = 'test/rotation-1';
const ACTOR_RATE_KEY = Object.freeze({
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
});
const OPENAI_TTS_RATE_KEY = Object.freeze({ provider: 'openai', model: 'tts-1-hd' });
const ELEVEN_TTS_RATE_KEY = Object.freeze({
  provider: 'elevenlabs',
  model: 'eleven_multilingual_v2',
});

test('actor and voice operations share one production store and namespace', () => {
  assert.equal(SP_USAGE_STORE_NAME, 'sp-usage');
  assert.equal(SP_USAGE_NAMESPACE, 'managed-voice');
});

const RATE_CARD = Object.freeze({
  version: '2026-07-14-planning-v1',
  effectiveDate: '2026-07-14',
  currency: 'USD',
  rates: Object.freeze([
    Object.freeze({
      provider: ACTOR_RATE_KEY.provider,
      model: ACTOR_RATE_KEY.model,
      meter: 'input_tokens',
      unit: 'million_tokens',
      price: 1,
      sourceUrl: 'https://example.test/anthropic-input',
    }),
    Object.freeze({
      provider: ACTOR_RATE_KEY.provider,
      model: ACTOR_RATE_KEY.model,
      meter: 'output_tokens',
      unit: 'million_tokens',
      price: 5,
      sourceUrl: 'https://example.test/anthropic-output',
    }),
    Object.freeze({
      provider: OPENAI_TTS_RATE_KEY.provider,
      model: OPENAI_TTS_RATE_KEY.model,
      meter: 'synthesis_characters',
      unit: 'million_characters',
      price: 30,
      sourceUrl: 'https://example.test/openai-tts',
    }),
    Object.freeze({
      provider: 'openai',
      model: 'whisper-1',
      meter: 'transcription_audio',
      unit: 'minute',
      price: 0.006,
      sourceUrl: 'https://example.test/openai-whisper',
    }),
    Object.freeze({
      provider: ELEVEN_TTS_RATE_KEY.provider,
      model: ELEVEN_TTS_RATE_KEY.model,
      meter: 'synthesis_characters',
      unit: 'thousand_characters',
      price: 0.1,
      sourceUrl: 'https://example.test/eleven-v2',
    }),
    Object.freeze({
      provider: 'elevenlabs',
      model: 'scribe_v2',
      meter: 'transcription_audio',
      unit: 'hour',
      price: 0.22,
      sourceUrl: 'https://example.test/eleven-scribe',
    }),
  ]),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalHash(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function assertOperationalError(error, { status, code }) {
  assert.equal(error?.status, status);
  assert.equal(error?.code, code);
  assert.equal(typeof error?.message, 'string');
  assert.equal(error.message.length > 0, true);
  return true;
}

function makeHarness({
  fake = createFakeBlobStore({ nonStrongReadsReturnNull: true }),
  clockRef = { now: NOW_MS },
  rateCard = RATE_CARD,
  capMicros = 20_000_000,
  warningMicros = 16_000_000,
  maxCasAttempts = 5,
  namespace = 'test',
  rotationId = 'rotation-1',
  randomBytes,
} = {}) {
  let randomSequence = 0;
  const ledger = createBudgetLedger({
    store: fake.store,
    namespace,
    rotationId,
    capMicros,
    warningMicros,
    rateCard,
    clock: () => clockRef.now,
    randomBytes: randomBytes ?? ((size) => {
      assert.equal(size, 32);
      randomSequence += 1;
      return Buffer.alloc(size, randomSequence);
    }),
    maxCasAttempts,
  });
  return { ledger, fake, clockRef };
}

function actorRequest(idempotencyKey, inputTokens = 100, outputTokens = 20) {
  return {
    idempotencyKey,
    kind: 'actor',
    rateKey: ACTOR_RATE_KEY,
    maximumUsage: { inputTokens, outputTokens },
  };
}

function voiceRequest(idempotencyKey, characters, rateKey = ELEVEN_TTS_RATE_KEY) {
  return {
    idempotencyKey,
    kind: 'synthesis',
    rateKey,
    maximumUsage: { characters },
  };
}

function currentAttempt(fake, key = KEY) {
  const operation = Object.values(fake.read(key).operations)[0];
  return operation.attempts.at(-1);
}

function writeCalls(fake) {
  return fake.calls.filter((call) => call.method === 'set');
}

function commitFifthAttempt({ current, attempted, matchConflictCount }) {
  return matchConflictCount === 5 ? attempted : current;
}

function assertFiveWritesThenFinalStrongRead(fake, beforeCallCount) {
  const calls = fake.calls.slice(beforeCallCount);
  assert.equal(calls.filter((call) => call.method === 'set').length, 5);
  assert.equal(calls.filter((call) => call.method === 'getWithMetadata').length, 6);
  assert.equal(calls.at(-1).method, 'getWithMetadata');
  assert.deepEqual(calls.at(-1).options, { type: 'json', consistency: 'strong' });
}

test('quote uses exact rational micro-dollar arithmetic and rounds each component upward', () => {
  const { ledger } = makeHarness();

  assert.equal(ledger.quote({
    kind: 'actor',
    rateKey: ACTOR_RATE_KEY,
    usage: { inputTokens: 100, outputTokens: 20 },
  }), 200);
  assert.equal(ledger.quote({
    kind: 'evaluation',
    rateKey: ACTOR_RATE_KEY,
    usage: { inputTokens: 100, outputTokens: 20 },
  }), 200);
  assert.equal(ledger.quote({
    kind: 'synthesis',
    rateKey: OPENAI_TTS_RATE_KEY,
    usage: { characters: 100 },
  }), 3_000);
  assert.equal(ledger.quote({
    kind: 'transcription',
    rateKey: { provider: 'openai', model: 'whisper-1' },
    usage: { milliseconds: 1_500 },
  }), 150);
  assert.equal(ledger.quote({
    kind: 'transcription',
    rateKey: { provider: 'elevenlabs', model: 'scribe_v2' },
    usage: { milliseconds: 1_000 },
  }), 62);
  assert.equal(ledger.quote({
    kind: 'actor',
    rateKey: ACTOR_RATE_KEY,
    usage: { inputTokens: 1, outputTokens: 1 },
  }), 6, 'input and output components are ceiled independently');
});

test('quote and reserve require exact content-free shapes and never accept caller-supplied money', async () => {
  const { ledger, fake } = makeHarness();
  const invalidQuotes = [
    { kind: 'actor', rateKey: ACTOR_RATE_KEY, usage: { inputTokens: 1 } },
    { kind: 'actor', rateKey: ACTOR_RATE_KEY, usage: { inputTokens: 1, outputTokens: 1, text: 'secret' } },
    { kind: 'actor', rateKey: ACTOR_RATE_KEY, usage: { inputTokens: -1, outputTokens: 0 } },
    { kind: 'actor', rateKey: ACTOR_RATE_KEY, usage: { inputTokens: 0.5, outputTokens: 0 } },
    { kind: 'transcription', rateKey: { provider: 'openai', model: 'whisper-1' }, usage: { seconds: 1 } },
    { kind: 'synthesis', rateKey: OPENAI_TTS_RATE_KEY, usage: { characters: '1' } },
    { kind: 'synthesis', rateKey: { ...OPENAI_TTS_RATE_KEY, voice: 'alloy' }, usage: { characters: 1 } },
    { kind: 'unknown', rateKey: OPENAI_TTS_RATE_KEY, usage: { characters: 1 } },
  ];
  for (const input of invalidQuotes) {
    assert.throws(
      () => ledger.quote(input),
      (error) => assertOperationalError(error, { status: 400, code: 'invalid_budget_request' }),
    );
  }

  await assert.rejects(
    ledger.reserve({ ...actorRequest('money-is-not-input'), maximumMicros: 1 }),
    (error) => assertOperationalError(error, { status: 400, code: 'invalid_budget_request' }),
  );
  await assert.rejects(
    ledger.reserve(actorRequest('zero-cost', 0, 0)),
    (error) => assertOperationalError(error, { status: 400, code: 'invalid_budget_request' }),
  );
  assert.equal(fake.calls.length, 0);
});

test('configuration rejects unknown, future, duplicate, non-USD, and unsupported rate cards', () => {
  const invalidCards = [];
  const noVersion = clone(RATE_CARD);
  noVersion.version = '';
  invalidCards.push(noVersion);
  const nonUsd = clone(RATE_CARD);
  nonUsd.currency = 'EUR';
  invalidCards.push(nonUsd);
  const impossibleDate = clone(RATE_CARD);
  impossibleDate.effectiveDate = '2026-02-30';
  invalidCards.push(impossibleDate);
  const future = clone(RATE_CARD);
  future.effectiveDate = '2026-07-15';
  invalidCards.push(future);
  const duplicate = clone(RATE_CARD);
  duplicate.rates.push({ ...duplicate.rates[0], sourceUrl: 'https://example.test/duplicate' });
  invalidCards.push(duplicate);
  const unsupportedUnit = clone(RATE_CARD);
  unsupportedUnit.rates[0].unit = 'request';
  invalidCards.push(unsupportedUnit);
  const unsupportedMeter = clone(RATE_CARD);
  unsupportedMeter.rates[0].meter = 'cached_input_tokens';
  invalidCards.push(unsupportedMeter);
  const invalidPrice = clone(RATE_CARD);
  invalidPrice.rates[0].price = '1';
  invalidCards.push(invalidPrice);
  const extraRateField = clone(RATE_CARD);
  extraRateField.rates[0].notes = 'not canonical';
  invalidCards.push(extraRateField);

  for (const rateCard of invalidCards) {
    assert.throws(
      () => makeHarness({ rateCard }),
      (error) => assertOperationalError(error, { status: 500, code: 'invalid_configuration' }),
    );
  }

  const { ledger } = makeHarness();
  assert.throws(
    () => ledger.quote({
      kind: 'actor',
      rateKey: { provider: 'missing', model: 'missing' },
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
    (error) => assertOperationalError(error, { status: 400, code: 'invalid_budget_request' }),
  );
});

test('initialization persists a strict, hashed, empty rotation record through raw CAS', async () => {
  const { ledger, fake } = makeHarness();
  const usage = await ledger.getUsage();
  const stored = fake.read(KEY);

  assert.deepEqual(Object.keys(stored).sort(), [
    'authorizedMicros',
    'currency',
    'operations',
    'overrunMicros',
    'rateCardHash',
    'rateCardVersion',
    'reservedMicros',
    'schemaVersion',
    'spentMicros',
    'units',
    'updatedAt',
  ]);
  assert.deepEqual(stored, {
    schemaVersion: 1,
    currency: 'USD',
    rateCardVersion: RATE_CARD.version,
    rateCardHash: stored.rateCardHash,
    authorizedMicros: 0,
    spentMicros: 0,
    reservedMicros: 0,
    overrunMicros: 0,
    units: {
      actorInputTokens: 0,
      actorOutputTokens: 0,
      transcriptionMilliseconds: 0,
      synthesisCharacters: 0,
    },
    operations: {},
    updatedAt: '2026-07-14T12:00:00.000Z',
  });
  assert.match(stored.rateCardHash, /^[a-f0-9]{64}$/);
  assert.equal(usage.authorizedMicros, 0);
  assert.equal(usage.band, 'ok');
  assert.deepEqual(writeCalls(fake).map((call) => call.options), [{ onlyIfNew: true }]);
  assert.equal(writeCalls(fake).every((call) => typeof call.value === 'string'), true);
  assert.equal(fake.calls.filter((call) => call.method === 'getWithMetadata').every((call) => (
    call.options.type === 'json' && call.options.consistency === 'strong'
  )), true);
});

test('getUsage is an aggregate allowlist, returns copies, and getBand returns only a band string', async () => {
  const { ledger } = makeHarness();
  const usage = await ledger.getUsage();

  assert.deepEqual(Object.keys(usage), [
    'schemaVersion',
    'band',
    'currency',
    'rateCardVersion',
    'authorizedMicros',
    'spentMicros',
    'reservedMicros',
    'remainingMicros',
    'overrunMicros',
    'capMicros',
    'warningMicros',
    'units',
    'updatedAt',
  ]);
  assert.equal(JSON.stringify(usage).includes('operations'), false);
  assert.equal(JSON.stringify(usage).includes('Hash'), false);
  usage.units.actorInputTokens = 999;
  assert.equal((await ledger.getUsage()).units.actorInputTokens, 0);
  assert.equal(await ledger.getBand(), 'ok');
});

test('corrupt counters, operation sums, or stored rate identity fail closed without writes', async () => {
  for (const mutate of [
    (record) => { record.authorizedMicros = 1; },
    (record) => { record.spentMicros = -1; },
    (record) => { record.reservedMicros = Number.MAX_SAFE_INTEGER + 1; },
    (record) => { record.rateCardHash = '00'.repeat(32); },
    (record) => { record.rateCardVersion = 'changed'; },
  ]) {
    const { ledger, fake } = makeHarness();
    await ledger.getUsage();
    const record = fake.read(KEY);
    mutate(record);
    fake.replace(KEY, record);
    const before = writeCalls(fake).length;
    await assert.rejects(
      ledger.getUsage(),
      (error) => assertOperationalError(error, { status: 503, code: 'budget_unavailable' }),
    );
    assert.equal(writeCalls(fake).length, before);
  }
});

test('the same version with changed rate-card content fails the pinned hash check', async () => {
  const fake = createFakeBlobStore();
  await makeHarness({ fake }).ledger.getUsage();
  const changed = clone(RATE_CARD);
  changed.rates[0].price = 2;
  const second = makeHarness({ fake, rateCard: changed }).ledger;

  await assert.rejects(
    second.getUsage(),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_unavailable' }),
  );
});

test('the ledger snapshots its validated rate card instead of following caller mutations', () => {
  const mutableRateCard = clone(RATE_CARD);
  const { ledger } = makeHarness({ rateCard: mutableRateCard });
  mutableRateCard.rates[0].price = 999;
  mutableRateCard.version = 'mutated-after-construction';

  assert.equal(ledger.quote({
    kind: 'actor',
    rateKey: ACTOR_RATE_KEY,
    usage: { inputTokens: 100, outputTokens: 20 },
  }), 200);
});

test('storage failures are a 503 and never return reassuring zero usage', async () => {
  const { ledger } = makeHarness({ fake: createFakeBlobStore({ unavailable: true }) });
  await assert.rejects(
    ledger.getUsage(),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_unavailable' }),
  );
  await assert.rejects(
    ledger.reserve(actorRequest('storage-down')),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_unavailable' }),
  );
});

test('a modified write without a nonempty ETag cannot create a durable reservation', async () => {
  for (const etag of ['', '   ']) {
    const fake = createFakeBlobStore();
    fake.ambiguousNextWrites(1, etag);
    const { ledger } = makeHarness({ fake });

    await assert.rejects(
      ledger.reserve(actorRequest(`ambiguous-reserve-${etag.length}`)),
      (error) => assertOperationalError(error, { status: 503, code: 'budget_unavailable' }),
    );
    assert.equal(fake.read(KEY), null);
    assert.equal(writeCalls(fake).length, 1);
  }
});

test('an ambiguous provider-start write never returns provider authorization', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  const reservation = await ledger.reserve(actorRequest('ambiguous-provider-start'));
  fake.ambiguousNextWrites();
  const beforeWrites = writeCalls(fake).length;

  await assert.rejects(
    ledger.markProviderStarted(reservation),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_unavailable' }),
  );
  assert.equal(writeCalls(fake).length, beforeWrites + 1);
  assert.equal(currentAttempt(fake).status, 'reserved');
});

test('initialization stops after exactly five conditional writes under contention', async () => {
  const fake = createFakeBlobStore({ onlyIfNewConflicts: 5 });
  const { ledger } = makeHarness({ fake });

  await assert.rejects(
    ledger.getUsage(),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_contention' }),
  );
  assert.equal(writeCalls(fake).length, 5);
  assert.equal(writeCalls(fake).every((call) => call.options.onlyIfNew === true), true);
});

test('an existing-record transition stops after exactly five matching conditional writes', async () => {
  const fake = createFakeBlobStore({ onlyIfMatchConflicts: 5 });
  const { ledger } = makeHarness({ fake });
  await ledger.getUsage();
  const before = writeCalls(fake).length;

  await assert.rejects(
    ledger.reserve(actorRequest('five-match-conflicts')),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_contention' }),
  );
  const transitionWrites = writeCalls(fake).slice(before);
  assert.equal(transitionWrites.length, 5);
  assert.equal(transitionWrites.every((call) => typeof call.options.onlyIfMatch === 'string'), true);
});

test('reserve reconciles an identical fifth-write commit with one final read and no sixth write', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  await ledger.getUsage();
  fake.conflictNextMatches(5, commitFifthAttempt);
  const beforeCalls = fake.calls.length;

  const reservation = await ledger.reserve(actorRequest('reserve-final-read-identical'));
  assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
  assert.equal(Object.isFrozen(reservation), true);
  assert.deepEqual(await ledger.markProviderStarted(reservation), {
    modified: true,
    authorized: true,
    status: 'provider_started',
  });
});

test('reserve final read never grants ownership of a competing reservation', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  await ledger.getUsage();
  fake.conflictNextMatches(5, ({ current, attempted, matchConflictCount }) => {
    if (matchConflictCount !== 5) return current;
    const competitor = clone(attempted);
    const operation = Object.values(competitor.operations)[0];
    operation.attempts.at(-1).ownerTokenHash = 'ab'.repeat(32);
    return competitor;
  });
  const beforeCalls = fake.calls.length;

  await assert.rejects(
    ledger.reserve(actorRequest('reserve-final-read-competitor')),
    (error) => assertOperationalError(error, { status: 409, code: 'budget_in_progress' }),
  );
  assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
});

test('reserve final read requires the exact attempted generation even when owner hashes repeat', async () => {
  const fake = createFakeBlobStore();
  const ownerBytes = Buffer.alloc(32, 0x5a);
  const { ledger } = makeHarness({ fake, randomBytes: () => ownerBytes });
  const first = await ledger.reserve(actorRequest('reserve-final-read-generation'));
  await ledger.failBeforeProvider({ reservation: first, code: 'request_aborted' });
  fake.conflictNextMatches(5, ({ current, attempted, matchConflictCount }) => {
    if (matchConflictCount !== 5) return current;
    const competitor = clone(attempted);
    const operation = Object.values(competitor.operations)[0];
    const second = operation.attempts.at(-1);
    second.status = 'failed_before_provider';
    second.failureCode = 'request_aborted';
    const third = {
      ...clone(second),
      generation: 3,
      status: 'reserved',
      failureCode: null,
    };
    operation.generation = 3;
    operation.attempts.push(third);
    return competitor;
  });
  const beforeCalls = fake.calls.length;

  await assert.rejects(
    ledger.reserve(actorRequest('reserve-final-read-generation')),
    (error) => assertOperationalError(error, { status: 409, code: 'budget_in_progress' }),
  );
  assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
});

test('reserve final read returns a stable terminal result committed by the fifth writer', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  await ledger.getUsage();
  fake.conflictNextMatches(5, ({ current, attempted, matchConflictCount }) => {
    if (matchConflictCount !== 5) return current;
    const terminal = clone(attempted);
    const operation = Object.values(terminal.operations)[0];
    const attempt = operation.attempts.at(-1);
    attempt.status = 'settled';
    attempt.actualMicros = 200;
    attempt.actualUsage = { inputTokens: 100, outputTokens: 20 };
    attempt.outcome = 'succeeded';
    attempt.settlementHash = canonicalHash({
      outcome: 'succeeded',
      usage: attempt.actualUsage,
    });
    terminal.reservedMicros = 0;
    terminal.spentMicros = 200;
    terminal.authorizedMicros = 200;
    terminal.units.actorInputTokens = 100;
    terminal.units.actorOutputTokens = 20;
    return terminal;
  });
  const beforeCalls = fake.calls.length;

  assert.deepEqual(await ledger.reserve(actorRequest('reserve-final-read-terminal')), {
    finalized: true,
    status: 'settled',
    outcome: 'succeeded',
    chargedMicros: 200,
  });
  assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
});

test('provider start reconciles a fifth-write commit without granting loser authorization', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  const reservation = await ledger.reserve(actorRequest('mark-final-read-identical'));
  fake.conflictNextMatches(5, commitFifthAttempt);
  const beforeCalls = fake.calls.length;

  assert.deepEqual(await ledger.markProviderStarted(reservation), {
    modified: false,
    authorized: false,
    status: 'provider_started',
  });
  assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
});

test('provider start retains contention when the final read is still reserved', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  const reservation = await ledger.reserve(actorRequest('mark-final-read-pending'));
  fake.conflictNextMatches(5, ({ current }) => current);
  const beforeCalls = fake.calls.length;

  await assert.rejects(
    ledger.markProviderStarted(reservation),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_contention' }),
  );
  assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
});

test('fail-before-provider reconciles identical and mismatched fifth-write outcomes safely', async () => {
  {
    const fake = createFakeBlobStore();
    const { ledger } = makeHarness({ fake });
    const reservation = await ledger.reserve(actorRequest('fail-final-read-identical'));
    fake.conflictNextMatches(5, commitFifthAttempt);
    const beforeCalls = fake.calls.length;

    assert.deepEqual(await ledger.failBeforeProvider({
      reservation,
      code: 'provider_unavailable',
    }), { modified: false, status: 'failed_before_provider' });
    assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
  }

  {
    const fake = createFakeBlobStore();
    const { ledger } = makeHarness({ fake });
    const reservation = await ledger.reserve(actorRequest('fail-final-read-mismatch'));
    fake.conflictNextMatches(5, ({ current, attempted, matchConflictCount }) => {
      if (matchConflictCount !== 5) return current;
      const mismatch = clone(attempted);
      Object.values(mismatch.operations)[0].attempts.at(-1).failureCode = 'request_aborted';
      return mismatch;
    });
    const beforeCalls = fake.calls.length;

    await assert.rejects(
      ledger.failBeforeProvider({ reservation, code: 'provider_unavailable' }),
      (error) => assertOperationalError(error, { status: 409, code: 'idempotency_mismatch' }),
    );
    assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
  }
});

test('fail-before-provider retains contention when the final read is still reserved', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  const reservation = await ledger.reserve(actorRequest('fail-final-read-pending'));
  fake.conflictNextMatches(5, ({ current }) => current);
  const beforeCalls = fake.calls.length;

  await assert.rejects(
    ledger.failBeforeProvider({ reservation, code: 'provider_unavailable' }),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_contention' }),
  );
  assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
});

test('settle reconciles identical and mismatched fifth-write terminal outcomes safely', async () => {
  const settlement = (reservation) => ({
    reservation,
    outcome: 'succeeded',
    usage: { inputTokens: 100, outputTokens: 20 },
  });

  {
    const fake = createFakeBlobStore();
    const { ledger } = makeHarness({ fake });
    const reservation = await ledger.reserve(actorRequest('settle-final-read-identical'));
    await ledger.markProviderStarted(reservation);
    fake.conflictNextMatches(5, commitFifthAttempt);
    const beforeCalls = fake.calls.length;

    assert.deepEqual(await ledger.settle(settlement(reservation)), {
      modified: false,
      status: 'settled',
      outcome: 'succeeded',
      chargedMicros: 200,
    });
    assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
  }

  {
    const fake = createFakeBlobStore();
    const { ledger } = makeHarness({ fake });
    const reservation = await ledger.reserve(actorRequest('settle-final-read-mismatch'));
    await ledger.markProviderStarted(reservation);
    fake.conflictNextMatches(5, ({ current, attempted, matchConflictCount }) => {
      if (matchConflictCount !== 5) return current;
      const mismatch = clone(attempted);
      const attempt = Object.values(mismatch.operations)[0].attempts.at(-1);
      attempt.status = 'provider_failed';
      attempt.outcome = 'provider_failed';
      attempt.settlementHash = canonicalHash({
        outcome: 'provider_failed',
        usage: attempt.actualUsage,
      });
      return mismatch;
    });
    const beforeCalls = fake.calls.length;

    await assert.rejects(
      ledger.settle(settlement(reservation)),
      (error) => assertOperationalError(error, { status: 409, code: 'idempotency_mismatch' }),
    );
    assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
  }
});

test('settle retains contention when the final read is still provider-started', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  const reservation = await ledger.reserve(actorRequest('settle-final-read-pending'));
  await ledger.markProviderStarted(reservation);
  fake.conflictNextMatches(5, ({ current }) => current);
  const beforeCalls = fake.calls.length;

  await assert.rejects(
    ledger.settle({
      reservation,
      outcome: 'succeeded',
      usage: { inputTokens: 100, outputTokens: 20 },
    }),
    (error) => assertOperationalError(error, { status: 503, code: 'budget_contention' }),
  );
  assertFiveWritesThenFinalStrongRead(fake, beforeCalls);
});

test('reserve stores hashes rather than raw identity or owner secrets and enforces stable binding', async () => {
  const idempotencyKey = 'private-turn-key-never-store';
  const ownerBytes = Buffer.alloc(32, 0x7a);
  const { ledger, fake } = makeHarness({ randomBytes: () => ownerBytes });
  const reservation = await ledger.reserve(actorRequest(idempotencyKey));
  const storedText = JSON.stringify(fake.read(KEY));

  assert.deepEqual(Object.keys(reservation), []);
  assert.equal(Object.isFrozen(reservation), true);
  assert.equal(storedText.includes(idempotencyKey), false);
  assert.equal(storedText.includes(ownerBytes.toString('hex')), false);
  assert.equal(storedText.includes(ownerBytes.toString('base64url')), false);
  assert.match(Object.keys(fake.read(KEY).operations)[0], /^[a-f0-9]{64}$/);
  assert.match(currentAttempt(fake).ownerTokenHash, /^[a-f0-9]{64}$/);
  assert.deepEqual((await ledger.getUsage()), {
    schemaVersion: 1,
    band: 'ok',
    currency: 'USD',
    rateCardVersion: RATE_CARD.version,
    authorizedMicros: 200,
    spentMicros: 0,
    reservedMicros: 200,
    remainingMicros: 19_999_800,
    overrunMicros: 0,
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    units: {
      actorInputTokens: 0,
      actorOutputTokens: 0,
      transcriptionMilliseconds: 0,
      synthesisCharacters: 0,
    },
    updatedAt: '2026-07-14T12:00:00.000Z',
  });

  const before = writeCalls(fake).length;
  await assert.rejects(
    ledger.reserve(actorRequest(idempotencyKey)),
    (error) => assertOperationalError(error, { status: 409, code: 'budget_in_progress' }),
  );
  await assert.rejects(
    ledger.reserve(actorRequest(idempotencyKey, 101, 20)),
    (error) => assertOperationalError(error, { status: 409, code: 'idempotency_mismatch' }),
  );
  assert.equal(writeCalls(fake).length, before);
});

test('active and terminal duplicates classify from storage without minting another owner token', async () => {
  let randomCalls = 0;
  const { ledger } = makeHarness({
    randomBytes: (size) => {
      randomCalls += 1;
      if (randomCalls > 1) throw new Error('randomness must not be used for duplicates');
      return Buffer.alloc(size, 1);
    },
  });
  const reservation = await ledger.reserve(actorRequest('duplicate-no-owner'));
  await assert.rejects(
    ledger.reserve(actorRequest('duplicate-no-owner')),
    (error) => assertOperationalError(error, { status: 409, code: 'budget_in_progress' }),
  );
  await ledger.markProviderStarted(reservation);
  await ledger.settle({
    reservation,
    outcome: 'succeeded',
    usage: { inputTokens: 100, outputTokens: 20 },
  });
  assert.deepEqual(await ledger.reserve(actorRequest('duplicate-no-owner')), {
    finalized: true,
    status: 'settled',
    outcome: 'succeeded',
    chargedMicros: 200,
  });
  assert.equal(randomCalls, 1);
});

test('failed-before-provider releases once, retains its tombstone, and enables one new generation', async () => {
  const { ledger, fake } = makeHarness();
  const first = await ledger.reserve(actorRequest('retry-generation'));
  const failed = await ledger.failBeforeProvider({
    reservation: first,
    code: 'provider_unavailable',
  });
  assert.deepEqual(failed, { modified: true, status: 'failed_before_provider' });
  assert.equal((await ledger.getUsage()).authorizedMicros, 0);
  const writesAfterFirstFail = writeCalls(fake).length;
  assert.deepEqual(await ledger.failBeforeProvider({
    reservation: first,
    code: 'provider_unavailable',
  }), { modified: false, status: 'failed_before_provider' });
  assert.equal(writeCalls(fake).length, writesAfterFirstFail);

  const second = await ledger.reserve(actorRequest('retry-generation'));
  assert.notEqual(second, first);
  const operation = Object.values(fake.read(KEY).operations)[0];
  assert.equal(operation.generation, 2);
  assert.equal(operation.attempts.length, 2);
  assert.equal(operation.attempts[0].status, 'failed_before_provider');
  assert.equal(operation.attempts[1].status, 'reserved');
  assert.equal((await ledger.getUsage()).reservedMicros, 200);

  const beforeStale = writeCalls(fake).length;
  await assert.rejects(
    ledger.markProviderStarted(first),
    (error) => assertOperationalError(error, { status: 409, code: 'budget_state_conflict' }),
  );
  assert.equal(writeCalls(fake).length, beforeStale);
});

test('invalid failure codes are rejected before storage and never echo sensitive text', async () => {
  const sentinel = 'real-patient-name-must-not-persist';
  const { ledger, fake } = makeHarness();
  const reservation = await ledger.reserve(actorRequest('failure-code'));
  const before = fake.calls.length;
  await assert.rejects(
    ledger.failBeforeProvider({ reservation, code: sentinel }),
    (error) => {
      assertOperationalError(error, { status: 400, code: 'invalid_budget_request' });
      assert.equal(error.message.includes(sentinel), false);
      return true;
    },
  );
  assert.equal(fake.calls.length, before);
  assert.equal(JSON.stringify(fake.read(KEY)).includes(sentinel), false);
});

test('markProviderStarted authorizes only the winning transition and never authorizes twice', async () => {
  const { ledger, fake } = makeHarness();
  const reservation = await ledger.reserve(actorRequest('mark-once'));
  assert.deepEqual(await ledger.markProviderStarted(reservation), {
    modified: true,
    authorized: true,
    status: 'provider_started',
  });
  const before = writeCalls(fake).length;
  assert.deepEqual(await ledger.markProviderStarted(reservation), {
    modified: false,
    authorized: false,
    status: 'provider_started',
  });
  assert.equal(writeCalls(fake).length, before);
  await assert.rejects(
    ledger.failBeforeProvider({ reservation, code: 'provider_unavailable' }),
    (error) => assertOperationalError(error, { status: 409, code: 'budget_state_conflict' }),
  );
  await assert.rejects(
    ledger.reserve(actorRequest('mark-once')),
    (error) => assertOperationalError(error, { status: 409, code: 'budget_in_progress' }),
  );
});

test('two concurrent marks yield exactly one provider authorization', async () => {
  const { ledger } = makeHarness();
  const reservation = await ledger.reserve(actorRequest('concurrent-mark'));
  const results = await Promise.all([
    ledger.markProviderStarted(reservation),
    ledger.markProviderStarted(reservation),
  ]);

  assert.equal(results.filter((result) => result.modified && result.authorized).length, 1);
  assert.equal(results.filter((result) => !result.modified && !result.authorized).length, 1);
});

test('mark-versus-fail races permit exactly one state-changing winner', async () => {
  const { ledger, fake } = makeHarness();
  const reservation = await ledger.reserve(actorRequest('mark-vs-fail'));
  const results = await Promise.allSettled([
    ledger.markProviderStarted(reservation),
    ledger.failBeforeProvider({ reservation, code: 'provider_unavailable' }),
  ]);
  const modifiedWinners = results.filter((result) => (
    result.status === 'fulfilled' && result.value.modified === true
  ));
  assert.equal(modifiedWinners.length, 1);
  assert.equal(['provider_started', 'failed_before_provider'].includes(currentAttempt(fake).status), true);
  const usage = await ledger.getUsage();
  assert.equal([0, 200].includes(usage.reservedMicros), true);
  assert.equal(usage.authorizedMicros, usage.spentMicros + usage.reservedMicros);
});

test('whole-record ETags are refreshed after unrelated operations before an owned transition', async () => {
  const { ledger, fake } = makeHarness();
  const first = await ledger.reserve(actorRequest('operation-a'));
  await ledger.reserve(actorRequest('operation-b'));
  const etagAfterB = fake.etag(KEY);
  const result = await ledger.markProviderStarted(first);

  assert.equal(result.authorized, true);
  assert.equal(writeCalls(fake).at(-1).options.onlyIfMatch, etagAfterB);
  assert.equal(fake.read(KEY).authorizedMicros, 400);
});

test('concurrent unrelated record changes are retried while per-operation ownership remains valid', async () => {
  const { ledger, fake } = makeHarness();
  const first = await ledger.reserve(actorRequest('owned-operation'));
  const results = await Promise.allSettled([
    ledger.markProviderStarted(first),
    ledger.reserve(actorRequest('unrelated-operation')),
  ]);
  assert.equal(results.every((result) => result.status === 'fulfilled'), true);
  assert.equal(results[0].value.authorized, true);
  assert.equal(Object.keys(fake.read(KEY).operations).length, 2);
  assert.equal(fake.read(KEY).authorizedMicros, 400);
});

test('forged, cloned, and cross-ledger handles fail before any storage access', async () => {
  const fake = createFakeBlobStore();
  const { ledger } = makeHarness({ fake });
  const reservation = await ledger.reserve(actorRequest('opaque-owner'));
  const otherLedger = makeHarness({ fake }).ledger;

  for (const [candidateLedger, candidate] of [
    [ledger, {}],
    [ledger, { ...reservation }],
    [otherLedger, reservation],
  ]) {
    const before = fake.calls.length;
    await assert.rejects(
      candidateLedger.markProviderStarted(candidate),
      (error) => assertOperationalError(error, { status: 403, code: 'invalid_budget_reservation' }),
    );
    assert.equal(fake.calls.length, before);
  }
});

test('successful settlement releases the maximum, records actual cost and units, and is idempotent', async () => {
  const { ledger, fake } = makeHarness();
  const reservation = await ledger.reserve(actorRequest('settle-success', 1_000, 500));
  await ledger.markProviderStarted(reservation);
  const settlement = {
    reservation,
    outcome: 'succeeded',
    usage: { inputTokens: 100, outputTokens: 20 },
  };
  assert.deepEqual(await ledger.settle(settlement), {
    modified: true,
    status: 'settled',
    outcome: 'succeeded',
    chargedMicros: 200,
  });
  assert.deepEqual(await ledger.getUsage(), {
    schemaVersion: 1,
    band: 'ok',
    currency: 'USD',
    rateCardVersion: RATE_CARD.version,
    authorizedMicros: 200,
    spentMicros: 200,
    reservedMicros: 0,
    remainingMicros: 19_999_800,
    overrunMicros: 0,
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    units: {
      actorInputTokens: 100,
      actorOutputTokens: 20,
      transcriptionMilliseconds: 0,
      synthesisCharacters: 0,
    },
    updatedAt: '2026-07-14T12:00:00.000Z',
  });

  const before = writeCalls(fake).length;
  assert.deepEqual(await ledger.settle(settlement), {
    modified: false,
    status: 'settled',
    outcome: 'succeeded',
    chargedMicros: 200,
  });
  assert.equal(writeCalls(fake).length, before);
  const duplicate = await ledger.reserve(actorRequest('settle-success', 1_000, 500));
  assert.deepEqual(duplicate, {
    finalized: true,
    status: 'settled',
    outcome: 'succeeded',
    chargedMicros: 200,
  });
  assert.equal(Object.keys(duplicate).includes('ownerToken'), false);
});

test('different repeated settlement usage or outcome is an idempotency mismatch with zero writes', async () => {
  const { ledger, fake } = makeHarness();
  const reservation = await ledger.reserve(actorRequest('settle-mismatch', 1_000, 500));
  await ledger.markProviderStarted(reservation);
  await ledger.settle({
    reservation,
    outcome: 'succeeded',
    usage: { inputTokens: 100, outputTokens: 20 },
  });

  for (const changed of [
    { outcome: 'succeeded', usage: { inputTokens: 101, outputTokens: 20 } },
    { outcome: 'provider_failed', usage: { inputTokens: 100, outputTokens: 20 } },
    { outcome: 'succeeded', usage: null },
  ]) {
    const before = writeCalls(fake).length;
    await assert.rejects(
      ledger.settle({ reservation, ...changed }),
      (error) => assertOperationalError(error, { status: 409, code: 'idempotency_mismatch' }),
    );
    assert.equal(writeCalls(fake).length, before);
  }
});

test('stored settlement cost and settlement digest are verified against content-free usage', async () => {
  for (const mutate of [
    (record) => {
      const operation = Object.values(record.operations)[0];
      const attempt = operation.attempts.at(-1);
      attempt.actualMicros += 1;
      record.spentMicros += 1;
      record.authorizedMicros += 1;
    },
    (record) => {
      const operation = Object.values(record.operations)[0];
      operation.attempts.at(-1).settlementHash = '00'.repeat(32);
    },
    (record) => {
      const operation = Object.values(record.operations)[0];
      operation.attempts.at(-1).settlementHash = canonicalHash({
        outcome: 'succeeded',
        usage: null,
      });
    },
  ]) {
    const { ledger, fake } = makeHarness();
    const reservation = await ledger.reserve(actorRequest('corrupt-settlement', 1_000, 500));
    await ledger.markProviderStarted(reservation);
    await ledger.settle({
      reservation,
      outcome: 'succeeded',
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    const record = fake.read(KEY);
    mutate(record);
    fake.replace(KEY, record);
    const before = writeCalls(fake).length;
    await assert.rejects(
      ledger.getUsage(),
      (error) => assertOperationalError(error, { status: 503, code: 'budget_unavailable' }),
    );
    assert.equal(writeCalls(fake).length, before);
  }
});

test('settlement is allowed only after provider start and double fail never makes counters negative', async () => {
  const { ledger, fake } = makeHarness();
  const reservation = await ledger.reserve(actorRequest('settle-too-early'));
  const before = writeCalls(fake).length;
  await assert.rejects(
    ledger.settle({
      reservation,
      outcome: 'succeeded',
      usage: { inputTokens: 100, outputTokens: 20 },
    }),
    (error) => assertOperationalError(error, { status: 409, code: 'budget_state_conflict' }),
  );
  assert.equal(writeCalls(fake).length, before);
  await ledger.failBeforeProvider({ reservation, code: 'request_cancelled' });
  await ledger.failBeforeProvider({ reservation, code: 'request_cancelled' });
  const usage = await ledger.getUsage();
  assert.equal(usage.authorizedMicros, 0);
  assert.equal(usage.reservedMicros, 0);
  assert.equal(usage.spentMicros, 0);
});

test('unknown usage after provider start charges the full maximum and terminalizes both outcomes', async () => {
  for (const outcome of ['succeeded', 'provider_failed']) {
    const { ledger } = makeHarness();
    const reservation = await ledger.reserve(actorRequest(`unknown-${outcome}`, 1_000, 500));
    await ledger.markProviderStarted(reservation);
    const result = await ledger.settle({ reservation, outcome, usage: null });
    assert.equal(result.chargedMicros, 3_500);
    assert.equal(result.status, outcome === 'succeeded' ? 'settled' : 'provider_failed');
    const usage = await ledger.getUsage();
    assert.equal(usage.spentMicros, 3_500);
    assert.equal(usage.reservedMicros, 0);
    assert.equal(usage.units.actorInputTokens, 1_000);
    assert.equal(usage.units.actorOutputTokens, 500);
  }
});

test('measured actual over maximum is stored honestly, records overrun, and caps all future work', async () => {
  const { ledger, fake } = makeHarness();
  const reservation = await ledger.reserve(actorRequest('overrun', 100, 0));
  await ledger.markProviderStarted(reservation);
  await ledger.settle({
    reservation,
    outcome: 'succeeded',
    usage: { inputTokens: 2_000_000, outputTokens: 0 },
  });
  const usage = await ledger.getUsage();
  assert.equal(usage.spentMicros, 2_000_000);
  assert.equal(usage.authorizedMicros, 2_000_000);
  assert.equal(usage.overrunMicros, 1_999_900);
  assert.equal(usage.band, 'capped');
  assert.equal(fake.read(KEY).spentMicros, 2_000_000);

  for (const request of [
    actorRequest('after-overrun'),
    voiceRequest('voice-after-overrun', 1),
  ]) {
    await assert.rejects(
      ledger.reserve(request),
      (error) => assertOperationalError(error, {
        status: 429,
        code: request.kind === 'synthesis' ? 'voice_budget_reserved' : 'rotation_budget_reserved',
      }),
    );
  }
});

test('ten concurrent actor reservations never overshoot $20 and sequential retries fill the cap', async () => {
  const { ledger, fake } = makeHarness();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, index) => ledger.reserve(actorRequest(
      `turn-${index}`,
      2_500_000,
      0,
    ))),
  );
  const initiallyFulfilled = results.filter((result) => result.status === 'fulfilled').length;
  assert.equal(initiallyFulfilled <= 8, true);
  assert.equal(fake.read(KEY).authorizedMicros <= 20_000_000, true);

  for (let index = 0; index < 10 && (await ledger.getUsage()).authorizedMicros < 20_000_000; index += 1) {
    if (results[index].status === 'fulfilled') continue;
    try {
      await ledger.reserve(actorRequest(`turn-${index}`, 2_500_000, 0));
    } catch (error) {
      if (!['budget_contention', 'rotation_budget_reserved'].includes(error.code)) throw error;
    }
  }
  assert.equal((await ledger.getUsage()).authorizedMicros, 20_000_000);
  assert.equal(fake.read(KEY).authorizedMicros, 20_000_000);
  await assert.rejects(
    ledger.reserve(actorRequest('over-total-cap', 1, 0)),
    (error) => assertOperationalError(error, { status: 429, code: 'rotation_budget_reserved' }),
  );
});

test('voice stops at $16 while actor/evaluation work can continue to the $20 total cap', async () => {
  const { ledger } = makeHarness();
  for (let index = 0; index < 6; index += 1) {
    await ledger.reserve(voiceRequest(`voice-${index}`, 25_000));
  }
  assert.equal((await ledger.getUsage()).authorizedMicros, 15_000_000);
  await assert.rejects(
    ledger.reserve(voiceRequest('voice-would-cross-warning', 25_000)),
    (error) => assertOperationalError(error, { status: 429, code: 'voice_budget_reserved' }),
  );
  await ledger.reserve(voiceRequest('voice-exact-warning', 10_000));
  assert.equal((await ledger.getUsage()).authorizedMicros, 16_000_000);
  assert.equal(await ledger.getBand(), 'warning');
  await assert.rejects(
    ledger.reserve(voiceRequest('voice-after-warning', 1)),
    (error) => assertOperationalError(error, { status: 429, code: 'voice_budget_reserved' }),
  );

  await ledger.reserve({
    ...actorRequest('actor-to-cap', 4_000_000, 0),
    kind: 'evaluation',
  });
  assert.equal((await ledger.getUsage()).authorizedMicros, 20_000_000);
  assert.equal(await ledger.getBand(), 'capped');
});

test('clock rollback never moves canonical UTC timestamps backward', async () => {
  const clockRef = { now: NOW_MS };
  const { ledger, fake } = makeHarness({ clockRef });
  await ledger.reserve(actorRequest('clock-a'));
  const firstTimestamp = fake.read(KEY).updatedAt;
  clockRef.now -= 60_000;
  await ledger.reserve(actorRequest('clock-b'));
  assert.equal(fake.read(KEY).updatedAt, firstTimestamp);
  assert.match(fake.read(KEY).updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('invalid clocks and unsafe arithmetic fail before a corrupt write', async () => {
  for (const now of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0.5,
    Number.MAX_SAFE_INTEGER,
    Date.parse('+010000-01-01T00:00:00.000Z'),
    Date.parse('-000001-01-01T00:00:00.000Z'),
  ]) {
    const fake = createFakeBlobStore();
    assert.throws(
      () => makeHarness({ fake, clockRef: { now } }),
      (error) => assertOperationalError(error, { status: 500, code: 'invalid_configuration' }),
    );
    assert.equal(fake.calls.length, 0);
  }

  const clockRef = { now: NOW_MS };
  const runtimeFake = createFakeBlobStore();
  const { ledger: runtimeLedger } = makeHarness({ fake: runtimeFake, clockRef });
  clockRef.now = Date.parse('+010000-01-01T00:00:00.000Z');
  await assert.rejects(
    runtimeLedger.reserve(actorRequest('runtime-extended-year')),
    (error) => assertOperationalError(error, { status: 500, code: 'invalid_configuration' }),
  );
  assert.equal(writeCalls(runtimeFake).length, 0);

  const huge = clone(RATE_CARD);
  huge.rates[0].price = Number.MAX_SAFE_INTEGER;
  const { ledger, fake } = makeHarness({ rateCard: huge });
  assert.throws(
    () => ledger.quote({
      kind: 'actor',
      rateKey: ACTOR_RATE_KEY,
      usage: { inputTokens: 2, outputTokens: 0 },
    }),
    (error) => assertOperationalError(error, { status: 400, code: 'invalid_budget_request' }),
  );
  assert.equal(fake.calls.length, 0);
});

test('malformed owner randomness fails closed and never stores a free reservation', async () => {
  const { ledger, fake } = makeHarness({ randomBytes: () => Buffer.alloc(31) });
  await assert.rejects(
    ledger.reserve(actorRequest('bad-randomness')),
    (error) => assertOperationalError(error, { status: 500, code: 'invalid_configuration' }),
  );
  assert.equal(fake.read(KEY), null);
});

test('stored records contain no raw keys, owner tokens, transcripts, audio, or free-form errors', async () => {
  const sentinel = 'SENTINEL-learner-transcript-and-audio';
  const bytes = Buffer.from('a'.repeat(32), 'utf8');
  const { ledger, fake } = makeHarness({ randomBytes: () => bytes });
  const reservation = await ledger.reserve(actorRequest(sentinel));
  await ledger.failBeforeProvider({ reservation, code: 'validation_failed' });
  const serialized = JSON.stringify(fake.read(KEY));
  for (const prohibited of [
    sentinel,
    bytes.toString('hex'),
    bytes.toString('base64url'),
    '"transcript":',
    '"audio":',
    '"error":',
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
});
