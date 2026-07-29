import { createHash } from 'node:crypto';

const HEALTH_KEYS = Object.freeze([
  'schemaVersion',
  'actorModel',
  'evaluatorModel',
  'packVersion',
  'packStatus',
  'cases',
]);
const SUCCESS_KEYS = Object.freeze([
  'schemaVersion',
  'state',
  'learnerReady',
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
const FAILURE_CODES = new Set([
  'configuration',
  'timeout',
  'transport',
  'http_status',
  'content_type',
  'invalid_json',
  'contract',
  'receipt_write',
]);
const SHA256 = /^[a-f0-9]{64}$/;

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
    if (!item || typeof item !== 'object' || Array.isArray(item) || !nonempty(item.id)) {
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
    contractSha256: createHash('sha256').update(normalizedContract, 'utf8').digest('hex'),
  });
}

export function validateHealthReceipt(receipt) {
  if (exactKeys(receipt, SUCCESS_KEYS)
    && receipt.schemaVersion === 1
    && receipt.state === 'success'
    && typeof receipt.learnerReady === 'boolean'
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
