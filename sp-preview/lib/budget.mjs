import { createHash } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 30 * 60 * 1000;
const MAX_DAILY_UNITS = 680;
const MAX_WINDOW_UNITS = 340;
const MAX_DAILY_STARTS = 20;
// Current UTC day plus the preceding day: at least 24 hours of replay history
// for receipts that expire 30 minutes after the original encounter starts.
const MAX_OPERATIONS = MAX_DAILY_UNITS * 2;
const MAX_CAS_ATTEMPTS = 5;
const HASH = /^[a-f0-9]{64}$/;
const RECORD_KEYS = ['schemaVersion', 'limit', 'windowLimit', 'startLimit', 'updatedAt', 'operations'];
const LEGACY_KEYS = ['schemaVersion', 'limit', 'windowLimit', 'createdAt', 'updatedAt', 'chargedUnits', 'operations'];
const OPERATION_KEYS = ['bindingHash', 'units', 'reservedAt'];

function problem(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
const unavailable = () => problem(503, 'preview_budget_unavailable', 'Preview usage accounting is temporarily unavailable.');
const configurationError = () => problem(500, 'invalid_preview_budget_configuration', 'The preview usage limit is not configured.');
const invalidRequest = () => problem(400, 'invalid_preview_budget_request', 'The preview operation is invalid.');
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const timestamp = value => integer(value, 0, 8_640_000_000_000_000);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value)
  && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const dayStart = time => Math.floor(time / DAY_MS) * DAY_MS;
// The handler, not browser input, selects the charge: one opening or a three-unit
// question/alternative. This also identifies starts in the existing v1 ledger.
const validUnits = units => units === 1 || units === 3;

function clock(now) {
  let value;
  try { value = now(); } catch { throw unavailable(); }
  if (!timestamp(value)) throw unavailable();
  return value;
}

function validOperations(operations, { minimumTime, updatedAt, maximumEntries }) {
  if (!object(operations)) return false;
  const entries = Object.entries(operations);
  if (entries.length < 1 || entries.length > maximumEntries) return false;
  let last = -Infinity;
  for (const [hash, operation] of entries) {
    if (!HASH.test(hash) || !exactKeys(operation, OPERATION_KEYS)
      || !HASH.test(operation.bindingHash) || !validUnits(operation.units)
      || !timestamp(operation.reservedAt)
      || operation.reservedAt < minimumTime || operation.reservedAt > updatedAt) return false;
    last = Math.max(last, operation.reservedAt);
  }
  return last === updatedAt;
}

function validRecord(record, { limit, windowLimit, startLimit, time }) {
  if (!exactKeys(record, RECORD_KEYS) || record.schemaVersion !== 2
    || record.limit !== limit || record.windowLimit !== windowLimit || record.startLimit !== startLimit
    || !timestamp(record.updatedAt) || record.updatedAt > time
    || !validOperations(record.operations, {
      minimumTime: dayStart(record.updatedAt) - DAY_MS, updatedAt: record.updatedAt, maximumEntries: MAX_OPERATIONS,
    })) return false;
  const byDay = new Map();
  for (const operation of Object.values(record.operations)) {
    const day = dayStart(operation.reservedAt);
    byDay.set(day, (byDay.get(day) || 0) + operation.units);
  }
  // Migrated old usage can contain more than 20 starts. Keep those charges and
  // refuse additional starts that day instead of erasing them or losing access
  // to continuations. A legacy day never exceeded 120 units.
  return [...byDay.values()].every(units => units <= MAX_DAILY_UNITS);
}

function validLegacyRecord(record, time) {
  if (!exactKeys(record, LEGACY_KEYS) || record.schemaVersion !== 1
    || record.limit !== 120 || record.windowLimit !== 72
    || !timestamp(record.createdAt) || !timestamp(record.updatedAt)
    || record.createdAt > record.updatedAt || record.updatedAt > time
    || !integer(record.chargedUnits, 1, 120)
    || !validOperations(record.operations, {
      minimumTime: record.createdAt, updatedAt: record.updatedAt, maximumEntries: 120,
    })) return false;
  const operations = Object.values(record.operations);
  return operations.reduce((sum, operation) => sum + operation.units, 0) === record.chargedUnits
    && Math.min(...operations.map(operation => operation.reservedAt)) === record.createdAt;
}

/**
 * A site-wide daily start/paid-call allowance, not dollar accounting. Every
 * reservation remains charged if generation fails or the browser disconnects.
 * Pin namespace to the original production ledger once; never derive it from a
 * deployment, rotate it, or delete it to recover capacity. The same atomic CAS
 * migrates that ledger and protects starts, daily units, and rolling-window units.
 */
export function createPreviewBudget({ store, namespace, limit = 680, windowLimit = 340, startLimit = 20, now = Date.now } = {}) {
  if (!store || typeof store.getWithMetadata !== 'function' || typeof store.set !== 'function'
    || typeof namespace !== 'string' || namespace.length > 128
    || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(namespace)
    || !integer(limit, 1, MAX_DAILY_UNITS) || !integer(windowLimit, 1, MAX_WINDOW_UNITS)
    || !integer(startLimit, 1, MAX_DAILY_STARTS) || typeof now !== 'function') throw configurationError();
  // Keep the original key to upgrade the existing production record in place.
  // The stored schema is v2; changing the key would silently discard paid usage.
  const key = `${namespace}/paid-operations-v1`;

  async function reserve(input) {
    if (!exactKeys(input, ['operationId', 'bindingHash', 'units'])
      || typeof input.operationId !== 'string' || input.operationId.length > 512
      || !/^[A-Za-z0-9_.:-]+$/.test(input.operationId)
      || typeof input.bindingHash !== 'string' || !HASH.test(input.bindingHash)
      || !validUnits(input.units)) throw invalidRequest();
    // Copy and hash before awaiting; callers cannot mutate a request mid-CAS.
    const operationHash = sha256(input.operationId);
    const bindingHash = input.bindingHash, units = input.units;

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      let existing;
      try { existing = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' }); }
      catch { throw unavailable(); }
      const time = clock(now);
      if (existing !== null && (!object(existing) || !nonempty(existing.etag)
        || !(validRecord(existing.data, { limit, windowLimit, startLimit, time }) || validLegacyRecord(existing.data, time)))) throw unavailable();
      const operations = existing === null ? {} : structuredClone(existing.data.operations);
      const duplicate = operations[operationHash];
      // Check before pruning. In particular, midnight cannot make a recently
      // consumed continuation or retry receipt spendable again.
      if (duplicate) {
        if (duplicate.bindingHash !== bindingHash || duplicate.units !== units) {
          throw problem(409, 'preview_operation_mismatch', 'The preview operation does not match its original request.');
        }
        throw problem(409, 'preview_operation_duplicate', 'This preview operation was already charged.');
      }
      const today = dayStart(time);
      let chargedUnits = units, windowChargedUnits = units, startedEncounters = units === 1 ? 1 : 0;
      for (const [hash, operation] of Object.entries(operations)) {
        if (operation.reservedAt < today - DAY_MS) { delete operations[hash]; continue; }
        if (operation.reservedAt >= today) {
          chargedUnits += operation.units;
          if (operation.units === 1) startedEncounters += 1;
        }
        if (operation.reservedAt > time - WINDOW_MS) windowChargedUnits += operation.units;
      }
      if (units === 1 && startedEncounters > startLimit) {
        throw problem(429, 'preview_daily_starts_exhausted', 'Today’s encounter start allowance has been reached. It renews at midnight UTC.');
      }
      if (chargedUnits > limit || Object.keys(operations).length >= MAX_OPERATIONS) {
        throw problem(429, 'preview_budget_exhausted', 'Today’s paid-call allowance has been reached. It renews at midnight UTC.');
      }
      if (windowChargedUnits > windowLimit) {
        throw problem(429, 'preview_window_exhausted', 'The shared paid-call allowance for this rolling thirty-minute window has been reached.');
      }
      operations[operationHash] = { bindingHash, units, reservedAt: time };
      const record = { schemaVersion: 2, limit, windowLimit, startLimit, updatedAt: time, operations };
      let written;
      try {
        // setJSON previously discarded conditional options in the verified adapter.
        written = await store.set(key, JSON.stringify(record), existing === null
          ? { onlyIfNew: true } : { onlyIfMatch: existing.etag });
      } catch { throw unavailable(); }
      if (written?.modified !== true && written?.modified !== false) throw unavailable();
      if (written.modified === false) continue;
      // An ambiguous write grants no provider authority and is never refunded.
      if (!nonempty(written.etag)) throw unavailable();
      return Object.freeze({
        authorized: true, chargedUnits, windowChargedUnits, startedEncounters,
        remainingUnits: limit - chargedUnits, windowRemainingUnits: windowLimit - windowChargedUnits,
        remainingStarts: Math.max(0, startLimit - startedEncounters), resetsAt: today + DAY_MS,
      });
    }
    throw problem(503, 'preview_budget_contention', 'Preview usage accounting is temporarily busy.');
  }
  return Object.freeze({ reserve });
}
