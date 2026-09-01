import { createHash } from 'node:crypto';

const HEALTH_KEYS = Object.freeze([
  'schemaVersion',
  'actorModel',
  'evaluatorModel',
  'packVersion',
  'packStatus',
  'cases',
]);
// `actorReady` is present on every success receipt written by this contract and
// is always true: a probe that could not obtain a live actor reply writes a
// FAILURE receipt instead. It exists so a success receipt states affirmatively
// that a real turn was completed, and so that a receipt written by the earlier
// reachability-only canary fails `exactKeys` and reads as `malformed` rather
// than being mistaken for evidence that the Interview Room can answer.
const SUCCESS_KEYS = Object.freeze([
  'schemaVersion',
  'state',
  'learnerReady',
  'actorReady',
  'caseCount',
  'checkedAt',
  'nextRun',
  'contractSha256',
]);
const FAILURE_KEYS = Object.freeze([
  'schemaVersion',
  'state',
  'failureCode',
  'checkedAt',
]);
const HEALTHY_PACK_STATUSES = new Set([
  'draft-pending-attestation',
  'reviewed',
  'attested',
]);
// The `actor_*` codes belong to the second leg of the canary — the live
// `mode:converse` turn. They are kept distinct from the leg-agnostic codes
// above because each points at a different repair:
//   actor_timeout  — a slow or wedged provider.
//   actor_status   — the call was rejected. A dead ANTHROPIC_API_KEY surfaces
//                    here as 502, a missing one as 503.
//   actor_budget   — 429. Separate from actor_status because the repair is to
//                    raise or top up the rotation cap, and because the canary
//                    spends against that same cap: this is the one failure the
//                    canary can inflict on itself, and it must be legible as
//                    such rather than read as a provider outage.
//   actor_contract — a 200 that carried no usable reply.
// `transport` still covers a socket-level failure on either leg, because the
// network is the same network.
const FAILURE_CODES = new Set([
  'configuration',
  'timeout',
  'transport',
  'http_status',
  'content_type',
  'invalid_json',
  'contract',
  'receipt_write',
  'actor_timeout',
  'actor_status',
  'actor_budget',
  'actor_contract',
]);
const SHA256 = /^[a-f0-9]{64}$/;
const CASE_KEYS = Object.freeze(['id', 'title']);
const CASE_ID_LIMIT = 128;
const CASE_TITLE_LIMIT = 200;

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function boundedText(value, maximum) {
  return nonempty(value)
    && !hasUnpairedSurrogate(value)
    && [...value].length <= maximum;
}

function utcTimestamp(value) {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function invalidHealthContract() {
  return new Error('Invalid health contract.');
}

export function validateHealth(body) {
  if (!exactKeys(body, HEALTH_KEYS)
    || body.schemaVersion !== 1
    || !nonempty(body.actorModel)
    || body.actorModel !== body.evaluatorModel
    || !nonempty(body.packVersion)
    || !HEALTHY_PACK_STATUSES.has(body.packStatus)
    || !Array.isArray(body.cases)
    || body.cases.length === 0) {
    throw invalidHealthContract();
  }

  const caseIds = [];
  for (const item of body.cases) {
    if (!exactKeys(item, CASE_KEYS)
      || !boundedText(item.id, CASE_ID_LIMIT)
      || !boundedText(item.title, CASE_TITLE_LIMIT)) {
      throw invalidHealthContract();
    }
    caseIds.push(item.id);
  }
  if (new Set(caseIds).size !== caseIds.length) throw invalidHealthContract();

  const normalizedContract = JSON.stringify({
    actorModel: body.actorModel,
    evaluatorModel: body.evaluatorModel,
    packVersion: body.packVersion,
    packStatus: body.packStatus,
    caseIds: [...caseIds].sort(),
  });
  return Object.freeze({
    learnerReady: body.packStatus === 'reviewed' || body.packStatus === 'attested',
    caseCount: caseIds.length,
    // Sorted so the caller's case selection is a pure function of the pack, not
    // of response ordering. These IDs are for addressing the actor probe only —
    // D6 keeps them out of every receipt and log line.
    caseIds: Object.freeze([...caseIds].sort()),
    contractSha256: createHash('sha256').update(normalizedContract, 'utf8').digest('hex'),
  });
}

export function validateHealthReceipt(receipt) {
  if (exactKeys(receipt, SUCCESS_KEYS)
    && receipt.schemaVersion === 1
    && receipt.state === 'success'
    && typeof receipt.learnerReady === 'boolean'
    && typeof receipt.actorReady === 'boolean'
    // A pack learners can reach must have answered. `learnerReady` without
    // `actorReady` is the exact contradiction this probe exists to end — it is
    // the shape the health surface had while the Interview Room was mute. The
    // reverse is honest and allowed: a draft pack refuses POSTs by design, so
    // nothing was probed because nothing is being served.
    && (receipt.learnerReady === false || receipt.actorReady === true)
    && Number.isInteger(receipt.caseCount)
    && receipt.caseCount > 0
    && utcTimestamp(receipt.checkedAt)
    && utcTimestamp(receipt.nextRun)
    && SHA256.test(receipt.contractSha256)) {
    return Object.freeze({ ...receipt });
  }
  if (exactKeys(receipt, FAILURE_KEYS)
    && receipt.schemaVersion === 1
    && receipt.state === 'failed'
    && FAILURE_CODES.has(receipt.failureCode)
    && utcTimestamp(receipt.checkedAt)) {
    return Object.freeze({ ...receipt });
  }
  throw new Error('Invalid health receipt.');
}

export function createFailureReceipt(failureCode, checkedAt) {
  if (!FAILURE_CODES.has(failureCode) || !utcTimestamp(checkedAt)) {
    throw new Error('Invalid health receipt.');
  }
  return Object.freeze({
    schemaVersion: 1,
    state: 'failed',
    failureCode,
    checkedAt,
  });
}

export function isUtcTimestamp(value) {
  return utcTimestamp(value);
}
