import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { operationalError } from './sp-http.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const TERMINAL_STATUSES = new Set(['succeeded', 'provider_failed']);
const PAYLOAD_KEYS = [
  'attestationHash',
  'caseId',
  'encounterId',
  'exp',
  'iat',
  'jti',
  'model',
  'packHash',
  'profileHash',
  'profileVersion',
  'provider',
  'replyHash',
  'rotationId',
  'schemaVersion',
  'turnId',
  'voiceId',
].sort();

function invalidTicket() {
  return operationalError(403, 'invalid_speech_ticket', 'The speech ticket is invalid.');
}

function expiredTicket() {
  return operationalError(403, 'speech_ticket_expired', 'The speech ticket has expired.');
}

function redemptionUnavailable() {
  return operationalError(
    503,
    'redemption_unavailable',
    'Speech ticket redemption is temporarily unavailable.',
  );
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function fixedDigest(value) {
  return createHash('sha256').update(String(value), 'utf8').digest();
}

function secureEqual(left, right) {
  return timingSafeEqual(fixedDigest(left), fixedDigest(right));
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function validSha256(value) {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

function validJti(jti) {
  if (typeof jti !== 'string' || !BASE64URL.test(jti)) return false;
  try {
    const decoded = Buffer.from(jti, 'base64url');
    return decoded.byteLength === 16 && decoded.toString('base64url') === jti;
  } catch {
    return false;
  }
}

function nowSeconds(clock) {
  const nowMs = clock();
  if (!Number.isFinite(nowMs)) throw invalidTicket();
  return Math.floor(nowMs / 1000);
}

function validateBindings(input) {
  return Boolean(
    input
    && nonempty(input.rotationId)
    && nonempty(input.encounterId)
    && Number.isInteger(input.turnId)
    && input.turnId >= 0
    && nonempty(input.caseId)
    && validSha256(input.packHash)
    && validSha256(input.attestationHash)
    && validSha256(input.profileHash)
    && Number.isInteger(input.profileVersion)
    && input.profileVersion > 0
    && nonempty(input.provider)
    && nonempty(input.model)
    && nonempty(input.voiceId)
  );
}

function validatePayload(payload) {
  return Boolean(
    payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(PAYLOAD_KEYS)
    && payload.schemaVersion === 1
    && validateBindings(payload)
    && validJti(payload.jti)
    && validSha256(payload.replyHash)
    && Number.isInteger(payload.iat)
    && Number.isInteger(payload.exp)
    && payload.exp === payload.iat + 120
  );
}

function publicClaim(key, etag, record) {
  return {
    key,
    etag,
    status: record.status,
    expiresAt: record.expiresAt,
  };
}

function validStoredRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const keys = Object.keys(record).sort();
  const expected = [
    'claimedAt',
    'completedAt',
    'expiresAt',
    'schemaVersion',
    'status',
    'usage',
  ].sort();
  if (
    JSON.stringify(keys) !== JSON.stringify(expected)
    || record.schemaVersion !== 1
    || !['in_progress', 'succeeded', 'provider_failed'].includes(record.status)
    || !Number.isInteger(record.expiresAt)
    || !Number.isInteger(record.claimedAt)
    || record.claimedAt >= record.expiresAt
  ) {
    return false;
  }
  if (record.status === 'in_progress') {
    return record.completedAt === null && record.usage === null;
  }
  if (!Number.isInteger(record.completedAt) || record.completedAt < record.claimedAt) {
    return false;
  }
  if (record.status === 'succeeded') return validUsage(record.usage);
  return record.usage === null || validUsage(record.usage);
}

function validUsage(usage) {
  return Boolean(
    usage
    && typeof usage === 'object'
    && !Array.isArray(usage)
    && JSON.stringify(Object.keys(usage).sort()) === JSON.stringify(['quantity', 'unit'])
    && usage.unit === 'synthesis_characters'
    && Number.isInteger(usage.quantity)
    && usage.quantity >= 0
  );
}

function validateUsage(status, usage) {
  if (status === 'provider_failed' && usage === null) return null;
  if (!validUsage(usage)) {
    throw operationalError(
      500,
      'invalid_usage_metadata',
      'Redemption usage metadata must be content-free.',
    );
  }
  return { unit: 'synthesis_characters', quantity: usage.quantity };
}

export function spokenText(reply) {
  return String(reply ?? '').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function createTicketCodec({
  secret,
  clock = Date.now,
  randomBytes = nodeRandomBytes,
}) {
  const secretBytes = Buffer.from(typeof secret === 'string' ? secret : '', 'utf8');
  if (secretBytes.byteLength < 32) {
    throw operationalError(
      500,
      'invalid_configuration',
      'The speech ticket secret must contain at least 32 bytes.',
    );
  }
  if (typeof clock !== 'function' || typeof randomBytes !== 'function') {
    throw operationalError(500, 'invalid_configuration', 'The speech ticket codec is not configured.');
  }
  const authenticatedPayloads = new WeakSet();

  function signature(encodedPayload) {
    return createHmac('sha256', secretBytes).update(encodedPayload, 'utf8').digest();
  }

  function issue(input) {
    if (!validateBindings(input) || typeof input.reply !== 'string') throw invalidTicket();
    const jtiBytes = Buffer.from(randomBytes(16));
    if (jtiBytes.byteLength !== 16) {
      throw operationalError(500, 'invalid_configuration', 'Speech ticket randomness is invalid.');
    }
    const iat = nowSeconds(clock);
    const payload = {
      schemaVersion: 1,
      rotationId: input.rotationId,
      encounterId: input.encounterId,
      turnId: input.turnId,
      jti: jtiBytes.toString('base64url'),
      caseId: input.caseId,
      packHash: input.packHash,
      attestationHash: input.attestationHash,
      profileHash: input.profileHash,
      profileVersion: input.profileVersion,
      provider: input.provider,
      model: input.model,
      voiceId: input.voiceId,
      replyHash: sha256(input.reply),
      iat,
      exp: iat + 120,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encodedPayload}.${signature(encodedPayload).toString('base64url')}`;
  }

  function authenticate({ ticket, reply }) {
    try {
      if (typeof ticket !== 'string' || typeof reply !== 'string') throw invalidTicket();
      const parts = ticket.split('.');
      if (
        parts.length !== 2
        || !parts[0]
        || !parts[1]
        || !BASE64URL.test(parts[0])
        || !BASE64URL.test(parts[1])
      ) {
        throw invalidTicket();
      }
      const suppliedSignature = Buffer.from(parts[1], 'base64url');
      const expectedSignature = signature(parts[0]);
      if (
        suppliedSignature.byteLength !== expectedSignature.byteLength
        || suppliedSignature.toString('base64url') !== parts[1]
        || !timingSafeEqual(suppliedSignature, expectedSignature)
      ) {
        throw invalidTicket();
      }

      const payloadText = Buffer.from(parts[0], 'base64url').toString('utf8');
      if (Buffer.from(payloadText, 'utf8').toString('base64url') !== parts[0]) throw invalidTicket();
      const payload = JSON.parse(payloadText);
      if (!validatePayload(payload)) throw invalidTicket();
      const now = nowSeconds(clock);
      if (now >= payload.exp) throw expiredTicket();
      if (now < payload.iat) throw invalidTicket();
      if (!secureEqual(payload.replyHash, sha256(reply))) throw invalidTicket();
      const frozen = Object.freeze(payload);
      authenticatedPayloads.add(frozen);
      return frozen;
    } catch (error) {
      if (error?.code === 'speech_ticket_expired') throw error;
      throw invalidTicket();
    }
  }

  function assertBindings({ payload, expected }) {
    try {
      if (
        !validatePayload(payload)
        || !Object.isFrozen(payload)
        || !authenticatedPayloads.has(payload)
        || !validateBindings(expected)
      ) {
        throw invalidTicket();
      }
      for (const field of [
        'rotationId',
        'encounterId',
        'turnId',
        'caseId',
        'packHash',
        'attestationHash',
        'profileHash',
        'profileVersion',
        'provider',
        'model',
        'voiceId',
      ]) {
        if (!secureEqual(JSON.stringify(payload[field]), JSON.stringify(expected[field]))) {
          throw invalidTicket();
        }
      }
      return payload;
    } catch {
      throw invalidTicket();
    }
  }

  function verify({ ticket, reply, expected }) {
    return assertBindings({ payload: authenticate({ ticket, reply }), expected });
  }

  return Object.freeze({ issue, authenticate, assertBindings, verify });
}

export function createRedemptionLedger({
  store,
  namespace,
  clock = Date.now,
  maxCasAttempts = 5,
}) {
  if (
    !store
    || typeof store.getWithMetadata !== 'function'
    || typeof store.set !== 'function'
    || !nonempty(namespace)
    || typeof clock !== 'function'
    || !Number.isInteger(maxCasAttempts)
    || maxCasAttempts < 1
  ) {
    throw operationalError(500, 'invalid_configuration', 'The redemption ledger is not configured.');
  }
  const cleanNamespace = namespace.replace(/^\/+|\/+$/g, '');
  if (!cleanNamespace) {
    throw operationalError(500, 'invalid_configuration', 'The redemption ledger is not configured.');
  }

  // @netlify/blobs 10.7.9 drops conditional options in setJSON; set preserves them.
  function write(key, record, conditions) {
    return store.set(key, JSON.stringify(record), conditions);
  }

  async function read(key) {
    try {
      const result = await store.getWithMetadata(key, {
        type: 'json',
        consistency: 'strong',
      });
      if (result === null) return null;
      if (!result || !nonempty(result.etag) || !validStoredRecord(result.data)) {
        throw redemptionUnavailable();
      }
      return result;
    } catch (error) {
      if (error?.code === 'redemption_unavailable') throw error;
      throw redemptionUnavailable();
    }
  }

  function classifyExisting(existing) {
    if (existing.data.status === 'in_progress') {
      throw operationalError(
        409,
        'speech_in_progress',
        'Speech generation is already in progress.',
      );
    }
    if (TERMINAL_STATUSES.has(existing.data.status)) {
      throw operationalError(
        409,
        'speech_already_redeemed',
        'This speech ticket has already been redeemed.',
      );
    }
    throw redemptionUnavailable();
  }

  async function claim(payload) {
    const now = nowSeconds(clock);
    if (!validJti(payload?.jti) || !Number.isInteger(payload?.exp)) throw invalidTicket();
    if (now >= payload.exp) throw expiredTicket();
    const key = `${cleanNamespace}/speech-redemptions/${sha256(payload.jti)}`;
    const record = {
      schemaVersion: 1,
      status: 'in_progress',
      expiresAt: payload.exp,
      claimedAt: now,
      completedAt: null,
      usage: null,
    };

    for (let attempt = 0; attempt < maxCasAttempts; attempt += 1) {
      let result;
      try {
        result = await write(key, record, { onlyIfNew: true });
      } catch {
        throw redemptionUnavailable();
      }
      if (result?.modified === true) {
        if (nonempty(result.etag)) return publicClaim(key, result.etag, record);
        const stored = await read(key);
        if (stored) return publicClaim(key, stored.etag, stored.data);
        throw redemptionUnavailable();
      }
      if (result?.modified !== false) throw redemptionUnavailable();
      const existing = await read(key);
      if (existing) classifyExisting(existing);
    }
    throw redemptionUnavailable();
  }

  async function complete(claimed, { status, usage }) {
    if (
      !claimed
      || !nonempty(claimed.key)
      || !claimed.key.startsWith(`${cleanNamespace}/speech-redemptions/`)
      || !nonempty(claimed.etag)
      || claimed.status !== 'in_progress'
      || !Number.isInteger(claimed.expiresAt)
      || !TERMINAL_STATUSES.has(status)
    ) {
      throw invalidTicket();
    }
    const safeUsage = validateUsage(status, usage);

    for (let attempt = 0; attempt < maxCasAttempts; attempt += 1) {
      const current = await read(claimed.key);
      if (!current) throw redemptionUnavailable();
      if (TERMINAL_STATUSES.has(current.data.status)) {
        return publicClaim(claimed.key, current.etag, current.data);
      }
      if (
        current.data.status !== 'in_progress'
        || current.data.expiresAt !== claimed.expiresAt
        || current.etag !== claimed.etag
      ) {
        throw redemptionUnavailable();
      }

      const next = {
        schemaVersion: 1,
        status,
        expiresAt: current.data.expiresAt,
        claimedAt: current.data.claimedAt,
        completedAt: nowSeconds(clock),
        usage: safeUsage,
      };
      let result;
      try {
        result = await write(claimed.key, next, { onlyIfMatch: claimed.etag });
      } catch {
        throw redemptionUnavailable();
      }
      if (result?.modified === true) {
        if (nonempty(result.etag)) return publicClaim(claimed.key, result.etag, next);
        const stored = await read(claimed.key);
        if (stored) return publicClaim(claimed.key, stored.etag, stored.data);
        throw redemptionUnavailable();
      }
      if (result?.modified !== false) throw redemptionUnavailable();
    }
    const finalRecord = await read(claimed.key);
    if (finalRecord && TERMINAL_STATUSES.has(finalRecord.data.status)) {
      return publicClaim(claimed.key, finalRecord.etag, finalRecord.data);
    }
    throw redemptionUnavailable();
  }

  return { claim, complete };
}
