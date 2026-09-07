import { createHash } from 'node:crypto';

const WINDOW_MS = 30 * 60 * 1000;
const MAX_OPERATIONS = 120;
const MAX_WINDOW_OPERATIONS = 72;
const MAX_CAS_ATTEMPTS = 5;
const HASH = /^[a-f0-9]{64}$/;
const RECORD_KEYS = ['schemaVersion', 'limit', 'windowLimit', 'createdAt', 'updatedAt', 'chargedUnits', 'operations'];
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

function clock(now) {
  let value;
  try { value = now(); } catch { throw unavailable(); }
  if (!timestamp(value)) throw unavailable();
  return value;
}

function validRecord(record, { limit, windowLimit, time }) {
  if (!exactKeys(record, RECORD_KEYS)
    || record.schemaVersion !== 1
    || record.limit !== limit || record.windowLimit !== windowLimit
    || !timestamp(record.createdAt) || !timestamp(record.updatedAt)
    || record.createdAt > record.updatedAt || record.updatedAt > time
    || !integer(record.chargedUnits, 1, limit)
    || !object(record.operations)) return false;
  const entries = Object.entries(record.operations);
  if (entries.length < 1 || entries.length > MAX_OPERATIONS) return false;
  let units = 0, first = Infinity, last = -Infinity;
  for (const [hash, operation] of entries) {
    if (!HASH.test(hash) || !exactKeys(operation, OPERATION_KEYS)
      || !HASH.test(operation.bindingHash)
      || !integer(operation.units, 1, 3)
      || !timestamp(operation.reservedAt)
      || operation.reservedAt < record.createdAt || operation.reservedAt > record.updatedAt) return false;
    units += operation.units;
    first = Math.min(first, operation.reservedAt);
    last = Math.max(last, operation.reservedAt);
  }
  return units === record.chargedUnits && first === record.createdAt && last === record.updatedAt;
}

/**
 * A preview-only paid-call allowance, not dollar accounting. Every reservation
 * is charged permanently, even when generation fails or the browser disconnects.
 * Use one deployment-specific namespace for every function instance. Never delete
 * or rotate that namespace to recover a failed attempt: it is the lifetime cap.
 */
export function createPreviewBudget({ store, namespace, limit = 120, windowLimit = 72, now = Date.now } = {}) {
  if (!store || typeof store.getWithMetadata !== 'function' || typeof store.set !== 'function'
    || typeof namespace !== 'string' || namespace.length > 128
    || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(namespace)
    || !integer(limit, 1, MAX_OPERATIONS)
    || !integer(windowLimit, 1, MAX_WINDOW_OPERATIONS)
    || typeof now !== 'function') throw configurationError();
  const key = `${namespace}/paid-operations-v1`;

  async function reserve(input) {
    if (!exactKeys(input, ['operationId', 'bindingHash', 'units'])
      || typeof input.operationId !== 'string' || input.operationId.length > 512
      || !/^[A-Za-z0-9_.:-]+$/.test(input.operationId)
      || typeof input.bindingHash !== 'string' || !HASH.test(input.bindingHash)
      || !integer(input.units, 1, 3)) throw invalidRequest();
    // Copy and hash before awaiting; callers cannot mutate a request mid-CAS.
    const operationHash = sha256(input.operationId);
    const bindingHash = input.bindingHash, units = input.units;

    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      let existing;
      try {
        existing = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      } catch { throw unavailable(); }
      const time = clock(now);
      if (existing !== null && (!object(existing) || !nonempty(existing.etag)
        || !validRecord(existing.data, { limit, windowLimit, time }))) throw unavailable();
      const record = existing === null ? {
        schemaVersion: 1, limit, windowLimit,
        createdAt: time, updatedAt: time, chargedUnits: 0, operations: {},
      } : structuredClone(existing.data);
      const duplicate = record.operations[operationHash];
      if (duplicate) {
        if (duplicate.bindingHash !== bindingHash || duplicate.units !== units) {
          throw problem(409, 'preview_operation_mismatch', 'The preview operation does not match its original request.');
        }
        throw problem(409, 'preview_operation_duplicate', 'This preview operation was already charged.');
      }
      const chargedUnits = record.chargedUnits + units;
      const windowChargedUnits = Object.values(record.operations)
        .filter(operation => operation.reservedAt > time - WINDOW_MS)
        .reduce((total, operation) => total + operation.units, units);
      if (chargedUnits > limit || Object.keys(record.operations).length >= MAX_OPERATIONS) {
        throw problem(429, 'preview_budget_exhausted', 'The preview paid-call allowance has been reached.');
      }
      if (windowChargedUnits > windowLimit) {
        throw problem(429, 'preview_window_exhausted', 'The preview paid-call allowance for this thirty-minute window has been reached.');
      }
      record.chargedUnits = chargedUnits;
      record.updatedAt = time;
      record.operations[operationHash] = { bindingHash, units, reservedAt: time };
      let written;
      try {
        // Match the verified production adapter: setJSON previously discarded
        // conditional options. A single CAS protects lifetime and rolling counts.
        written = await store.set(key, JSON.stringify(record), existing === null
          ? { onlyIfNew: true } : { onlyIfMatch: existing.etag });
      } catch { throw unavailable(); }
      if (written?.modified !== true && written?.modified !== false) throw unavailable();
      if (written.modified === false) continue;
      // Some SDK failures report modified:true with an empty ETag. Do not grant
      // authority for an ambiguous write, and do not refund or replay it.
      if (!nonempty(written.etag)) throw unavailable();
      return Object.freeze({
        authorized: true, chargedUnits, windowChargedUnits,
        remainingUnits: limit - chargedUnits,
        windowRemainingUnits: windowLimit - windowChargedUnits,
      });
    }
    throw problem(503, 'preview_budget_contention', 'Preview usage accounting is temporarily busy.');
  }

  return Object.freeze({ reserve });
}
