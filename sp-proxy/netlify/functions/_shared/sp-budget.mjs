import {
  createHash,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';

import { operationalError } from './sp-http.mjs';

export const PRODUCTION_BUDGET_STORE_NAME = 'sp-usage';
export const PRODUCTION_BUDGET_NAMESPACE = 'managed-voice';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const KINDS = new Set(['actor', 'evaluation', 'transcription', 'synthesis']);
const VOICE_KINDS = new Set(['transcription', 'synthesis']);
const ACTIVE_STATUSES = new Set(['reserved', 'provider_started']);
const TERMINAL_PROVIDER_STATUSES = new Set(['settled', 'provider_failed']);
const FAILURE_CODES = new Set([
  'budget_rejected',
  'lease_expired',
  'provider_unavailable',
  'redemption_failed',
  'request_aborted',
  'request_cancelled',
  'ticket_rejected',
  'validation_failed',
]);
const RATE_CARD_KEYS = ['currency', 'effectiveDate', 'rates', 'version'].sort();
const RATE_KEYS = ['meter', 'model', 'price', 'provider', 'sourceUrl', 'unit'].sort();
const RATE_KEY_KEYS = ['model', 'provider'].sort();
const RECORD_KEYS = [
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
].sort();
const UNIT_KEYS = [
  'actorInputTokens',
  'actorOutputTokens',
  'synthesisCharacters',
  'transcriptionMilliseconds',
].sort();
const OPERATION_KEYS = [
  'attempts',
  'bindingHash',
  'generation',
  'kind',
  'maximumMicros',
  'maximumUsage',
  'rateKey',
].sort();
const ATTEMPT_KEYS = [
  'actualMicros',
  'actualUsage',
  'createdAt',
  'failureCode',
  'generation',
  'outcome',
  'ownerTokenHash',
  'settlementHash',
  'status',
  'updatedAt',
].sort();
const MICRO_DOLLARS = 1_000_000n;
const MAX_DATE_MS = 8_640_000_000_000_000;

function invalidConfiguration() {
  return operationalError(
    500,
    'invalid_configuration',
    'The budget ledger is not configured.',
  );
}

function invalidRequest() {
  return operationalError(
    400,
    'invalid_budget_request',
    'The budget request is invalid.',
  );
}

function budgetUnavailable() {
  return operationalError(
    503,
    'budget_unavailable',
    'Budget accounting is temporarily unavailable.',
  );
}

function budgetContention() {
  return operationalError(
    503,
    'budget_contention',
    'Budget accounting is temporarily busy.',
  );
}

function invalidReservation() {
  return operationalError(
    403,
    'invalid_budget_reservation',
    'The budget reservation is invalid.',
  );
}

function stateConflict() {
  return operationalError(
    409,
    'budget_state_conflict',
    'The budget operation is not in the required state.',
  );
}

function idempotencyMismatch() {
  return operationalError(
    409,
    'idempotency_mismatch',
    'The budget operation does not match its original request.',
  );
}

function budgetInProgress() {
  return operationalError(
    409,
    'budget_in_progress',
    'The budget operation is already in progress.',
  );
}

function budgetLimit(kind) {
  if (VOICE_KINDS.has(kind)) {
    return operationalError(
      429,
      'voice_budget_reserved',
      'The managed voice budget is reserved.',
    );
  }
  return operationalError(
    429,
    'rotation_budget_reserved',
    'The rotation budget is reserved.',
  );
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function exactKeys(value, expected) {
  return isObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function safeNonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
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

function sha256(value) {
  const input = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? value
    : Buffer.from(String(value), 'utf8');
  return createHash('sha256').update(input).digest('hex');
}

function canonicalHash(value) {
  return sha256(canonicalJson(value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clockMilliseconds(clock) {
  let value;
  try {
    value = clock();
  } catch {
    throw invalidConfiguration();
  }
  if (
    !Number.isSafeInteger(value)
    || value < -MAX_DATE_MS
    || value > MAX_DATE_MS
  ) {
    throw invalidConfiguration();
  }
  try {
    if (!CANONICAL_TIMESTAMP.test(new Date(value).toISOString())) {
      throw invalidConfiguration();
    }
  } catch {
    throw invalidConfiguration();
  }
  return value;
}

function timestampAt(clock, previous = null) {
  const now = clockMilliseconds(clock);
  const previousMs = previous === null ? null : Date.parse(previous);
  const next = previousMs !== null && previousMs > now ? previousMs : now;
  try {
    return new Date(next).toISOString();
  } catch {
    throw invalidConfiguration();
  }
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !CANONICAL_TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value;
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function parseDecimal(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) return null;
  const whole = match[1];
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1_000) return null;
  let numerator = BigInt(`${whole}${fraction}`);
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  return { numerator, denominator };
}

function unitQuantity(meter, unit) {
  if (meter === 'input_tokens' || meter === 'output_tokens') {
    if (unit === 'million_tokens') return 1_000_000n;
    if (unit === 'thousand_tokens') return 1_000n;
    return null;
  }
  if (meter === 'synthesis_characters') {
    if (unit === 'million_characters') return 1_000_000n;
    if (unit === 'thousand_characters') return 1_000n;
    return null;
  }
  if (meter === 'transcription_audio') {
    if (unit === 'minute') return 60_000n;
    if (unit === 'hour') return 3_600_000n;
  }
  return null;
}

function rateIndex(rateCard, nowMs) {
  if (
    !exactKeys(rateCard, RATE_CARD_KEYS)
    || !nonempty(rateCard.version)
    || rateCard.currency !== 'USD'
    || !Array.isArray(rateCard.rates)
    || rateCard.rates.length === 0
  ) {
    throw invalidConfiguration();
  }
  const effectiveAt = validDateOnly(rateCard.effectiveDate);
  if (effectiveAt === null || effectiveAt > nowMs) throw invalidConfiguration();

  const index = new Map();
  for (const rate of rateCard.rates) {
    if (
      !exactKeys(rate, RATE_KEYS)
      || !nonempty(rate.provider)
      || !nonempty(rate.model)
      || !nonempty(rate.meter)
      || !nonempty(rate.unit)
      || !nonempty(rate.sourceUrl)
      || parseDecimal(rate.price) === null
      || unitQuantity(rate.meter, rate.unit) === null
    ) {
      throw invalidConfiguration();
    }
    const key = `${rate.provider}\u0000${rate.model}\u0000${rate.meter}`;
    if (index.has(key)) throw invalidConfiguration();
    index.set(key, rate);
  }
  return index;
}

function validateRateKey(rateKey) {
  if (
    !exactKeys(rateKey, RATE_KEY_KEYS)
    || !nonempty(rateKey.provider)
    || !nonempty(rateKey.model)
  ) {
    throw invalidRequest();
  }
  return { provider: rateKey.provider, model: rateKey.model };
}

function usageKeys(kind) {
  if (kind === 'actor' || kind === 'evaluation') {
    return ['inputTokens', 'outputTokens'].sort();
  }
  if (kind === 'transcription') return ['milliseconds'];
  if (kind === 'synthesis') return ['characters'];
  return null;
}

function validateUsage(kind, usage) {
  const expected = usageKeys(kind);
  if (!expected || !exactKeys(usage, expected)) throw invalidRequest();
  for (const key of expected) {
    if (!safeNonnegative(usage[key])) throw invalidRequest();
  }
  return clone(usage);
}

function ceilRate(quantity, rate) {
  const decimal = parseDecimal(rate.price);
  const units = unitQuantity(rate.meter, rate.unit);
  if (!decimal || units === null) throw invalidConfiguration();
  const numerator = BigInt(quantity) * decimal.numerator * MICRO_DOLLARS;
  const denominator = decimal.denominator * units;
  const result = (numerator + denominator - 1n) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidRequest();
  return Number(result);
}

function safeSum(left, right, errorFactory = budgetUnavailable) {
  const value = left + right;
  if (!safeNonnegative(value)) throw errorFactory();
  return value;
}

function quoteFrom(index, input) {
  if (!exactKeys(input, ['kind', 'rateKey', 'usage'].sort()) || !KINDS.has(input.kind)) {
    throw invalidRequest();
  }
  const rateKey = validateRateKey(input.rateKey);
  const usage = validateUsage(input.kind, input.usage);
  const lookup = (meter) => {
    const rate = index.get(`${rateKey.provider}\u0000${rateKey.model}\u0000${meter}`);
    if (!rate) throw invalidRequest();
    return rate;
  };

  if (input.kind === 'actor' || input.kind === 'evaluation') {
    const inputCost = ceilRate(usage.inputTokens, lookup('input_tokens'));
    const outputCost = ceilRate(usage.outputTokens, lookup('output_tokens'));
    return safeSum(inputCost, outputCost, invalidRequest);
  }
  if (input.kind === 'transcription') {
    return ceilRate(usage.milliseconds, lookup('transcription_audio'));
  }
  return ceilRate(usage.characters, lookup('synthesis_characters'));
}

function bindingFor({ kind, rateKey, maximumUsage, maximumMicros, rateCardVersion }) {
  return canonicalHash({
    kind,
    maximumMicros,
    maximumUsage,
    rateCardVersion,
    rateKey,
  });
}

function currentAttempt(operation) {
  return operation.attempts[operation.attempts.length - 1];
}

// F1 reclaim: a 'reserved' attempt means the provider was never called
// (markProviderStarted flips it to 'provider_started' immediately before the
// call). If such an attempt outlives the lease it was stranded by a crash or a
// contention throw and its held maximum will otherwise inflate authorizedMicros
// forever. Release it via the existing failed_before_provider transition. Only
// 'reserved' is reclaimed; a stranded 'provider_started' may reflect real,
// already-billed provider work, so it is left charged (fail closed on money).
function reclaimStaleReservations(record, nowMs, updatedAt, leaseMs) {
  let released = 0;
  for (const operation of Object.values(record.operations)) {
    const attempt = currentAttempt(operation);
    if (
      attempt.status === 'reserved'
      && nowMs - Date.parse(attempt.updatedAt) >= leaseMs
    ) {
      attempt.status = 'failed_before_provider';
      attempt.failureCode = 'lease_expired';
      attempt.updatedAt = updatedAt;
      released = safeSum(released, operation.maximumMicros);
    }
  }
  if (released > 0) {
    record.reservedMicros -= released;
    if (!safeNonnegative(record.reservedMicros)) throw budgetUnavailable();
    record.authorizedMicros = safeSum(record.spentMicros, record.reservedMicros);
    record.updatedAt = updatedAt;
  }
  return released;
}

function emptyUnits() {
  return {
    actorInputTokens: 0,
    actorOutputTokens: 0,
    transcriptionMilliseconds: 0,
    synthesisCharacters: 0,
  };
}

function addUsage(units, kind, usage) {
  if (kind === 'actor' || kind === 'evaluation') {
    units.actorInputTokens = safeSum(units.actorInputTokens, usage.inputTokens);
    units.actorOutputTokens = safeSum(units.actorOutputTokens, usage.outputTokens);
  } else if (kind === 'transcription') {
    units.transcriptionMilliseconds = safeSum(
      units.transcriptionMilliseconds,
      usage.milliseconds,
    );
  } else {
    units.synthesisCharacters = safeSum(units.synthesisCharacters, usage.characters);
  }
}

function sameUsage(kind, value) {
  try {
    return validateUsage(kind, value);
  } catch {
    return null;
  }
}

function validStoredAttempt(attempt, operation, index, recordTimestamp, quote) {
  if (
    !exactKeys(attempt, ATTEMPT_KEYS)
    || attempt.generation !== index + 1
    || !SHA256_HEX.test(attempt.ownerTokenHash)
    || !validTimestamp(attempt.createdAt)
    || !validTimestamp(attempt.updatedAt)
    || Date.parse(attempt.updatedAt) < Date.parse(attempt.createdAt)
    || Date.parse(attempt.updatedAt) > Date.parse(recordTimestamp)
  ) {
    return false;
  }
  const priorGeneration = index < operation.attempts.length - 1;
  if (priorGeneration && attempt.status !== 'failed_before_provider') return false;

  if (attempt.status === 'reserved' || attempt.status === 'provider_started') {
    return !priorGeneration
      && attempt.actualMicros === null
      && attempt.actualUsage === null
      && attempt.outcome === null
      && attempt.failureCode === null
      && attempt.settlementHash === null;
  }
  if (attempt.status === 'failed_before_provider') {
    return FAILURE_CODES.has(attempt.failureCode)
      && attempt.actualMicros === null
      && attempt.actualUsage === null
      && attempt.outcome === null
      && attempt.settlementHash === null;
  }
  if (!TERMINAL_PROVIDER_STATUSES.has(attempt.status) || priorGeneration) return false;
  const expectedOutcome = attempt.status === 'settled' ? 'succeeded' : 'provider_failed';
  const actualUsage = sameUsage(operation.kind, attempt.actualUsage);
  if (actualUsage === null) return false;
  const expectedMicros = quote({
    kind: operation.kind,
    rateKey: operation.rateKey,
    usage: actualUsage,
  });
  const explicitSettlementHash = canonicalHash({
    outcome: expectedOutcome,
    usage: actualUsage,
  });
  const unknownSettlementHash = canonicalHash({
    outcome: expectedOutcome,
    usage: null,
  });
  const explicitSettlement = attempt.settlementHash === explicitSettlementHash;
  const unknownSettlement = attempt.settlementHash === unknownSettlementHash
    && canonicalJson(actualUsage) === canonicalJson(operation.maximumUsage)
    && attempt.actualMicros === operation.maximumMicros;
  return safeNonnegative(attempt.actualMicros)
    && attempt.actualMicros === expectedMicros
    && attempt.outcome === expectedOutcome
    && attempt.failureCode === null
    && typeof attempt.settlementHash === 'string'
    && SHA256_HEX.test(attempt.settlementHash)
    && (explicitSettlement || unknownSettlement);
}

function validStoredRecord(record, { rateCard, rateCardHash, quote }) {
  try {
    if (
      !exactKeys(record, RECORD_KEYS)
      || record.schemaVersion !== 1
      || record.currency !== 'USD'
      || record.rateCardVersion !== rateCard.version
      || record.rateCardHash !== rateCardHash
      || !safeNonnegative(record.authorizedMicros)
      || !safeNonnegative(record.spentMicros)
      || !safeNonnegative(record.reservedMicros)
      || !safeNonnegative(record.overrunMicros)
      || !exactKeys(record.units, UNIT_KEYS)
      || !Object.values(record.units).every(safeNonnegative)
      || !isObject(record.operations)
      || !validTimestamp(record.updatedAt)
    ) {
      return false;
    }

    let spentMicros = 0;
    let reservedMicros = 0;
    let overrunMicros = 0;
    const units = emptyUnits();
    for (const [operationHash, operation] of Object.entries(record.operations)) {
      if (
        !SHA256_HEX.test(operationHash)
        || !exactKeys(operation, OPERATION_KEYS)
        || !KINDS.has(operation.kind)
        || !safeNonnegative(operation.maximumMicros)
        || operation.maximumMicros === 0
        || !Number.isSafeInteger(operation.generation)
        || operation.generation < 1
        || !Array.isArray(operation.attempts)
        || operation.attempts.length !== operation.generation
        || !SHA256_HEX.test(operation.bindingHash)
      ) {
        return false;
      }
      const rateKey = validateRateKey(operation.rateKey);
      const maximumUsage = validateUsage(operation.kind, operation.maximumUsage);
      const computedMaximum = quote({ kind: operation.kind, rateKey, usage: maximumUsage });
      if (
        computedMaximum !== operation.maximumMicros
        || operation.bindingHash !== bindingFor({
          kind: operation.kind,
          rateKey,
          maximumUsage,
          maximumMicros: computedMaximum,
          rateCardVersion: rateCard.version,
        })
        || !operation.attempts.every((attempt, index) => (
          validStoredAttempt(attempt, operation, index, record.updatedAt, quote)
        ))
      ) {
        return false;
      }
      const attempt = currentAttempt(operation);
      if (ACTIVE_STATUSES.has(attempt.status)) {
        reservedMicros = safeSum(reservedMicros, operation.maximumMicros);
      } else if (TERMINAL_PROVIDER_STATUSES.has(attempt.status)) {
        spentMicros = safeSum(spentMicros, attempt.actualMicros);
        overrunMicros = safeSum(
          overrunMicros,
          Math.max(0, attempt.actualMicros - operation.maximumMicros),
        );
        addUsage(units, operation.kind, attempt.actualUsage);
      }
    }
    const authorizedMicros = safeSum(spentMicros, reservedMicros);
    return record.spentMicros === spentMicros
      && record.reservedMicros === reservedMicros
      && record.authorizedMicros === authorizedMicros
      && record.overrunMicros === overrunMicros
      && JSON.stringify(record.units) === JSON.stringify(units);
  } catch {
    return false;
  }
}

function publicTerminal(attempt) {
  return {
    finalized: true,
    status: attempt.status,
    outcome: attempt.outcome,
    chargedMicros: attempt.actualMicros,
  };
}

function publicSettlement(attempt, modified) {
  return {
    modified,
    status: attempt.status,
    outcome: attempt.outcome,
    chargedMicros: attempt.actualMicros,
  };
}

function bandFor(record, capMicros, warningMicros) {
  if (record.overrunMicros > 0 || record.authorizedMicros >= capMicros) return 'capped';
  if (record.authorizedMicros >= warningMicros) return 'warning';
  return 'ok';
}

export function createBudgetLedger({
  store,
  namespace,
  rotationId,
  capMicros,
  warningMicros,
  rateCard,
  clock = Date.now,
  randomBytes = nodeRandomBytes,
  maxCasAttempts = 5,
  reservationLeaseMilliseconds = 120_000,
}) {
  if (
    !store
    || typeof store.getWithMetadata !== 'function'
    || typeof store.set !== 'function'
    || !nonempty(namespace)
    || !nonempty(rotationId)
    || !safeNonnegative(capMicros)
    || capMicros === 0
    || !safeNonnegative(warningMicros)
    || warningMicros === 0
    || warningMicros > capMicros
    || typeof clock !== 'function'
    || typeof randomBytes !== 'function'
    || !Number.isSafeInteger(maxCasAttempts)
    || maxCasAttempts < 1
    || !Number.isSafeInteger(reservationLeaseMilliseconds)
    || reservationLeaseMilliseconds < 1
  ) {
    throw invalidConfiguration();
  }
  const cleanNamespace = namespace.replace(/^\/+|\/+$/g, '');
  if (!cleanNamespace || rotationId.includes('/')) throw invalidConfiguration();
  const frozenRateCard = clone(rateCard);
  const nowAtConfiguration = clockMilliseconds(clock);
  const rates = rateIndex(frozenRateCard, nowAtConfiguration);
  const rateCardHash = canonicalHash(frozenRateCard);
  const key = `${cleanNamespace}/${rotationId}`;
  const handles = new WeakMap();

  const quote = (input) => quoteFrom(rates, input);
  const validationContext = { rateCard: frozenRateCard, rateCardHash, quote };

  function initialRecord() {
    return {
      schemaVersion: 1,
      currency: 'USD',
      rateCardVersion: frozenRateCard.version,
      rateCardHash,
      authorizedMicros: 0,
      spentMicros: 0,
      reservedMicros: 0,
      overrunMicros: 0,
      units: emptyUnits(),
      operations: {},
      updatedAt: timestampAt(clock),
    };
  }

  async function read() {
    let result;
    try {
      result = await store.getWithMetadata(key, {
        type: 'json',
        consistency: 'strong',
      });
    } catch {
      throw budgetUnavailable();
    }
    if (result === null) return null;
    if (
      !result
      || !nonempty(result.etag)
      || !validStoredRecord(result.data, validationContext)
    ) {
      throw budgetUnavailable();
    }
    return result;
  }

  async function write(record, conditions) {
    let result;
    try {
      // @netlify/blobs 10.7.9 drops conditional options in setJSON; raw set preserves them.
      result = await store.set(key, JSON.stringify(record), conditions);
    } catch {
      throw budgetUnavailable();
    }
    if (result?.modified !== true && result?.modified !== false) throw budgetUnavailable();
    if (result.modified === true && !nonempty(result.etag)) throw budgetUnavailable();
    return result.modified;
  }

  function newOwner() {
    let bytes;
    try {
      bytes = Buffer.from(randomBytes(32));
    } catch {
      throw invalidConfiguration();
    }
    if (bytes.byteLength !== 32) throw invalidConfiguration();
    return { bytes, hash: sha256(bytes) };
  }

  function makeHandle(metadata) {
    const handle = Object.freeze({});
    handles.set(handle, metadata);
    return handle;
  }

  function handleMetadata(reservation) {
    if (!isObject(reservation) || !handles.has(reservation)) throw invalidReservation();
    return handles.get(reservation);
  }

  function operationFor(record, metadata) {
    const operation = record.operations[metadata.operationHash];
    if (!operation) throw stateConflict();
    const attempt = currentAttempt(operation);
    if (
      operation.generation !== metadata.generation
      || attempt.generation !== metadata.generation
      || attempt.ownerTokenHash !== metadata.ownerTokenHash
    ) {
      throw stateConflict();
    }
    return { operation, attempt };
  }

  async function ensureRecord() {
    for (let attempt = 0; attempt < maxCasAttempts; attempt += 1) {
      const existing = await read();
      if (existing) return existing.data;
      const next = initialRecord();
      if (await write(next, { onlyIfNew: true })) return next;
    }
    throw budgetContention();
  }

  async function reserve(input) {
    if (
      !exactKeys(input, ['idempotencyKey', 'kind', 'maximumUsage', 'rateKey'].sort())
      || !nonempty(input.idempotencyKey)
      || input.idempotencyKey.length > 1_024
      || !KINDS.has(input.kind)
    ) {
      throw invalidRequest();
    }
    const rateKey = validateRateKey(input.rateKey);
    const maximumUsage = validateUsage(input.kind, input.maximumUsage);
    const maximumMicros = quote({ kind: input.kind, rateKey, usage: maximumUsage });
    if (maximumMicros === 0) throw invalidRequest();
    const operationHash = sha256(input.idempotencyKey);
    const bindingHash = bindingFor({
      kind: input.kind,
      rateKey,
      maximumUsage,
      maximumMicros,
      rateCardVersion: frozenRateCard.version,
    });
    let owner = null;
    let intendedGeneration = null;

    for (let casAttempt = 0; casAttempt < maxCasAttempts; casAttempt += 1) {
      const existing = await read();
      const record = existing ? clone(existing.data) : initialRecord();
      const nowMs = clockMilliseconds(clock);
      const updatedAt = timestampAt(clock, record.updatedAt);
      const reclaimedMicros = reclaimStaleReservations(
        record,
        nowMs,
        updatedAt,
        reservationLeaseMilliseconds,
      );
      const operation = record.operations[operationHash];
      let generation = 1;
      if (operation) {
        if (operation.bindingHash !== bindingHash) throw idempotencyMismatch();
        const last = currentAttempt(operation);
        if (ACTIVE_STATUSES.has(last.status)) throw budgetInProgress();
        if (TERMINAL_PROVIDER_STATUSES.has(last.status)) return publicTerminal(last);
        if (last.status !== 'failed_before_provider') throw budgetUnavailable();
        generation = operation.generation + 1;
      }
      intendedGeneration = generation;

      const limit = VOICE_KINDS.has(input.kind) ? warningMicros : capMicros;
      const prospective = safeSum(record.authorizedMicros, maximumMicros);
      if (record.overrunMicros > 0 || prospective > limit) throw budgetLimit(input.kind);
      if (owner === null) owner = newOwner();
      const nextAttempt = {
        generation,
        ownerTokenHash: owner.hash,
        status: 'reserved',
        actualMicros: null,
        actualUsage: null,
        outcome: null,
        settlementHash: null,
        failureCode: null,
        createdAt: updatedAt,
        updatedAt,
      };
      if (operation) {
        operation.generation = generation;
        operation.attempts.push(nextAttempt);
      } else {
        record.operations[operationHash] = {
          bindingHash,
          kind: input.kind,
          rateKey,
          maximumUsage,
          maximumMicros,
          generation,
          attempts: [nextAttempt],
        };
      }
      record.reservedMicros = safeSum(record.reservedMicros, maximumMicros);
      record.authorizedMicros = safeSum(record.spentMicros, record.reservedMicros);
      record.updatedAt = updatedAt;
      const conditions = existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true };
      if (await write(record, conditions)) {
        if (reclaimedMicros > 0) {
          // A persisted reclaim is evidence a strand happened (crash or
          // contention throw) — the F1 anomaly must be visible to operators,
          // not only inferable from the blob record.
          console.info(JSON.stringify({
            event: 'sp_budget_reclaimed',
            releasedMicros: reclaimedMicros,
          }));
        }
        return makeHandle({
          operationHash,
          generation,
          ownerTokenHash: owner.hash,
        });
      }
    }
    const final = await read();
    if (!final) throw budgetContention();
    const operation = final.data.operations[operationHash];
    if (!operation) throw budgetContention();
    if (operation.bindingHash !== bindingHash) throw idempotencyMismatch();
    const attempt = currentAttempt(operation);
    if (TERMINAL_PROVIDER_STATUSES.has(attempt.status)) return publicTerminal(attempt);
    if (
      attempt.status === 'reserved'
      && owner !== null
      && operation.generation === intendedGeneration
      && attempt.ownerTokenHash === owner.hash
    ) {
      return makeHandle({
        operationHash,
        generation: operation.generation,
        ownerTokenHash: owner.hash,
      });
    }
    if (ACTIVE_STATUSES.has(attempt.status)) throw budgetInProgress();
    throw budgetContention();
  }

  async function markProviderStarted(reservation) {
    const metadata = handleMetadata(reservation);
    for (let casAttempt = 0; casAttempt < maxCasAttempts; casAttempt += 1) {
      const existing = await read();
      if (!existing) throw stateConflict();
      const { operation, attempt } = operationFor(existing.data, metadata);
      if (attempt.status === 'provider_started') {
        return { modified: false, authorized: false, status: 'provider_started' };
      }
      if (attempt.status !== 'reserved') throw stateConflict();
      const record = clone(existing.data);
      const nextAttempt = currentAttempt(record.operations[metadata.operationHash]);
      const updatedAt = timestampAt(clock, record.updatedAt);
      nextAttempt.status = 'provider_started';
      nextAttempt.updatedAt = updatedAt;
      record.updatedAt = updatedAt;
      if (await write(record, { onlyIfMatch: existing.etag })) {
        return { modified: true, authorized: true, status: 'provider_started' };
      }
      void operation;
    }
    const final = await read();
    if (!final) throw stateConflict();
    const { attempt } = operationFor(final.data, metadata);
    if (attempt.status === 'provider_started') {
      return { modified: false, authorized: false, status: 'provider_started' };
    }
    if (attempt.status === 'reserved') throw budgetContention();
    throw stateConflict();
  }

  async function failBeforeProvider(input) {
    if (
      !exactKeys(input, ['code', 'reservation'].sort())
      || !FAILURE_CODES.has(input.code)
    ) {
      throw invalidRequest();
    }
    const metadata = handleMetadata(input.reservation);
    for (let casAttempt = 0; casAttempt < maxCasAttempts; casAttempt += 1) {
      const existing = await read();
      if (!existing) throw stateConflict();
      const { operation, attempt } = operationFor(existing.data, metadata);
      if (attempt.status === 'failed_before_provider') {
        if (attempt.failureCode !== input.code) throw idempotencyMismatch();
        return { modified: false, status: 'failed_before_provider' };
      }
      if (attempt.status !== 'reserved') throw stateConflict();
      const record = clone(existing.data);
      const nextAttempt = currentAttempt(record.operations[metadata.operationHash]);
      const updatedAt = timestampAt(clock, record.updatedAt);
      nextAttempt.status = 'failed_before_provider';
      nextAttempt.failureCode = input.code;
      nextAttempt.updatedAt = updatedAt;
      record.reservedMicros -= operation.maximumMicros;
      if (!safeNonnegative(record.reservedMicros)) throw budgetUnavailable();
      record.authorizedMicros = safeSum(record.spentMicros, record.reservedMicros);
      record.updatedAt = updatedAt;
      if (await write(record, { onlyIfMatch: existing.etag })) {
        return { modified: true, status: 'failed_before_provider' };
      }
    }
    const final = await read();
    if (!final) throw stateConflict();
    const { attempt } = operationFor(final.data, metadata);
    if (attempt.status === 'failed_before_provider') {
      if (attempt.failureCode !== input.code) throw idempotencyMismatch();
      return { modified: false, status: 'failed_before_provider' };
    }
    if (attempt.status === 'reserved') throw budgetContention();
    throw stateConflict();
  }

  async function settle(input) {
    if (
      !isObject(input)
      || !Object.keys(input).every((keyName) => ['outcome', 'reservation', 'usage'].includes(keyName))
      || !Object.hasOwn(input, 'reservation')
      || !Object.hasOwn(input, 'outcome')
      || !['succeeded', 'provider_failed'].includes(input.outcome)
    ) {
      throw invalidRequest();
    }
    const suppliedUsage = Object.hasOwn(input, 'usage') ? input.usage : null;
    if (suppliedUsage !== null && !isObject(suppliedUsage)) throw invalidRequest();
    const metadata = handleMetadata(input.reservation);
    const settlementFor = (operation) => {
      const actualUsage = suppliedUsage === null
        ? clone(operation.maximumUsage)
        : validateUsage(operation.kind, suppliedUsage);
      const actualMicros = suppliedUsage === null
        ? operation.maximumMicros
        : quote({ kind: operation.kind, rateKey: operation.rateKey, usage: actualUsage });
      const settlementHash = canonicalHash({
        outcome: input.outcome,
        usage: suppliedUsage === null ? null : actualUsage,
      });
      return { actualUsage, actualMicros, settlementHash };
    };

    for (let casAttempt = 0; casAttempt < maxCasAttempts; casAttempt += 1) {
      const existing = await read();
      if (!existing) throw stateConflict();
      const { operation, attempt } = operationFor(existing.data, metadata);
      const { actualUsage, actualMicros, settlementHash } = settlementFor(operation);
      if (TERMINAL_PROVIDER_STATUSES.has(attempt.status)) {
        if (attempt.settlementHash !== settlementHash) throw idempotencyMismatch();
        return publicSettlement(attempt, false);
      }
      if (attempt.status !== 'provider_started') throw stateConflict();

      const record = clone(existing.data);
      const nextAttempt = currentAttempt(record.operations[metadata.operationHash]);
      const updatedAt = timestampAt(clock, record.updatedAt);
      nextAttempt.status = input.outcome === 'succeeded' ? 'settled' : 'provider_failed';
      nextAttempt.actualMicros = actualMicros;
      nextAttempt.actualUsage = actualUsage;
      nextAttempt.outcome = input.outcome;
      nextAttempt.settlementHash = settlementHash;
      nextAttempt.updatedAt = updatedAt;
      record.reservedMicros -= operation.maximumMicros;
      if (!safeNonnegative(record.reservedMicros)) throw budgetUnavailable();
      record.spentMicros = safeSum(record.spentMicros, actualMicros);
      record.authorizedMicros = safeSum(record.spentMicros, record.reservedMicros);
      record.overrunMicros = safeSum(
        record.overrunMicros,
        Math.max(0, actualMicros - operation.maximumMicros),
      );
      addUsage(record.units, operation.kind, actualUsage);
      record.updatedAt = updatedAt;
      if (await write(record, { onlyIfMatch: existing.etag })) {
        return publicSettlement(nextAttempt, true);
      }
    }
    const final = await read();
    if (!final) throw stateConflict();
    const { operation, attempt } = operationFor(final.data, metadata);
    const { settlementHash } = settlementFor(operation);
    if (TERMINAL_PROVIDER_STATUSES.has(attempt.status)) {
      if (attempt.settlementHash !== settlementHash) throw idempotencyMismatch();
      return publicSettlement(attempt, false);
    }
    if (attempt.status === 'provider_started') throw budgetContention();
    throw stateConflict();
  }

  async function getUsage() {
    const record = await ensureRecord();
    return {
      schemaVersion: record.schemaVersion,
      band: bandFor(record, capMicros, warningMicros),
      currency: record.currency,
      rateCardVersion: record.rateCardVersion,
      authorizedMicros: record.authorizedMicros,
      spentMicros: record.spentMicros,
      reservedMicros: record.reservedMicros,
      remainingMicros: Math.max(0, capMicros - record.authorizedMicros),
      overrunMicros: record.overrunMicros,
      capMicros,
      warningMicros,
      units: clone(record.units),
      updatedAt: record.updatedAt,
    };
  }

  async function getBand() {
    return (await getUsage()).band;
  }

  return {
    quote,
    reserve,
    markProviderStarted,
    settle,
    failBeforeProvider,
    getBand,
    getUsage,
  };
}
