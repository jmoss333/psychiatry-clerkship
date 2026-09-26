// Sealed receipt for a real-time (speech-to-speech) encounter.
//
// The browser holds one of these between /api/sp/realtime operations. It is the
// server's own note to itself — which call, which case, which turn, which
// deadline — sealed with AES-256-GCM so the client can neither read nor forge
// it, and bound (as GCM associated data) to the case, the pack bytes, the
// learner origin and the rotation so a receipt minted for one encounter cannot
// be presented in another. It carries no dialogue: the learner transcript is
// re-sent on every turn and re-derived server-side, exactly as /api/sp does.
//
// The key is derived once, by HKDF-SHA-256, from the same server-only secret
// the speech tickets sign with. One secret to rotate, two independent keys.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';

import { operationalError } from './sp-http.mjs';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = 'sp-realtime';
const HKDF_INFO = 'sp-realtime-receipt-v1';
const ENCOUNTER_ID = /^[A-Za-z0-9_-]{22}$/;
const SESSION_ID = /^[a-f0-9]{32}$/;
const CALL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOKEN = /^[A-Za-z0-9_-]{40,4096}$/;
const MAX_CASE_ID = 64;
const MAX_SESSION_MS = 2 * 60 * 60 * 1000;
const PAYLOAD_KEYS = [
  'callId',
  'caseId',
  'deadline',
  'encounterId',
  'sid',
  'startedAt',
  'turn',
  'v',
];

function invalidConfiguration(message) {
  return operationalError(500, 'invalid_configuration', message);
}

function invalidReceipt() {
  return operationalError(400, 'invalid_realtime_receipt', 'The encounter receipt is invalid.');
}

function sessionExpired() {
  return operationalError(410, 'realtime_session_expired', 'This spoken encounter has ended. Start a new one.');
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function exactKeys(value, expected) {
  return isObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function safeTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validReceiptPayload(payload, { maxTurns } = {}) {
  return exactKeys(payload, PAYLOAD_KEYS)
    && payload.v === VERSION
    && typeof payload.encounterId === 'string'
    && ENCOUNTER_ID.test(payload.encounterId)
    && typeof payload.caseId === 'string'
    && payload.caseId.length > 0
    && payload.caseId.length <= MAX_CASE_ID
    && payload.caseId === payload.caseId.trim()
    && typeof payload.callId === 'string'
    && CALL_ID.test(payload.callId)
    && typeof payload.sid === 'string'
    && SESSION_ID.test(payload.sid)
    && Number.isInteger(payload.turn)
    && payload.turn >= 0
    && (!Number.isInteger(maxTurns) || payload.turn <= maxTurns)
    && safeTimestamp(payload.startedAt)
    && safeTimestamp(payload.deadline)
    && payload.deadline > payload.startedAt
    && payload.deadline - payload.startedAt <= MAX_SESSION_MS;
}

function clockMilliseconds(clock) {
  let value;
  try {
    value = clock();
  } catch {
    throw invalidConfiguration('The receipt clock failed.');
  }
  if (!safeTimestamp(value)) throw invalidConfiguration('The receipt clock is invalid.');
  return value;
}

/**
 * @param {object} options
 * @param {string} options.secret     server-only secret, at least 32 bytes (SP_SPEECH_TICKET_SECRET)
 * @param {() => number} [options.clock]
 * @param {(size:number) => Uint8Array} [options.randomBytes]
 * @param {number} [options.maxTurns] upper bound accepted for `turn` (the pack's engine.maxTurns)
 */
export function createReceiptCodec({
  secret,
  clock = Date.now,
  randomBytes = nodeRandomBytes,
  maxTurns = 40,
} = {}) {
  const secretBytes = Buffer.from(typeof secret === 'string' ? secret : '', 'utf8');
  if (secretBytes.byteLength < 32) {
    throw invalidConfiguration('The realtime receipt secret must contain at least 32 bytes.');
  }
  if (typeof clock !== 'function' || typeof randomBytes !== 'function') {
    throw invalidConfiguration('The realtime receipt codec is not configured.');
  }
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 1000) {
    throw invalidConfiguration('The realtime receipt turn bound is invalid.');
  }
  const key = Buffer.from(hkdfSync('sha256', secretBytes, HKDF_SALT, HKDF_INFO, 32));

  function requireBinding(binding) {
    if (typeof binding !== 'string' || binding.length === 0 || binding.length > 2048) {
      throw invalidConfiguration('The realtime receipt binding is invalid.');
    }
    return Buffer.from(binding, 'utf8');
  }

  function seal(payload, { binding } = {}) {
    const aad = requireBinding(binding);
    if (!validReceiptPayload(payload, { maxTurns })) {
      throw invalidConfiguration('The realtime receipt payload is invalid.');
    }
    let iv;
    try {
      iv = Buffer.from(randomBytes(IV_BYTES));
    } catch {
      throw invalidConfiguration('The realtime receipt randomness failed.');
    }
    if (iv.byteLength !== IV_BYTES) {
      throw invalidConfiguration('The realtime receipt randomness is invalid.');
    }
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  function open(token, { binding } = {}) {
    const aad = requireBinding(binding);
    if (typeof token !== 'string' || !TOKEN.test(token)) throw invalidReceipt();
    let payload;
    try {
      const data = Buffer.from(token, 'base64url');
      if (data.byteLength <= IV_BYTES + TAG_BYTES) throw invalidReceipt();
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV_BYTES));
      decipher.setAAD(aad);
      decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const plaintext = Buffer.concat([
        decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]);
      payload = JSON.parse(plaintext.toString('utf8'));
    } catch {
      throw invalidReceipt();
    }
    if (!validReceiptPayload(payload, { maxTurns })) throw invalidReceipt();
    if (clockMilliseconds(clock) >= payload.deadline) throw sessionExpired();
    return Object.freeze({ ...payload });
  }

  return Object.freeze({ seal, open });
}

// The binding names everything a receipt must not outlive: the case, the exact
// pack bytes, the learner origin, the rotation, and the learner credential — so
// an emergency passcode replacement (the README's only containment for a leak)
// fails every outstanding receipt closed, as the hosted room's codec does.
export function receiptBinding({ caseId, packHash, origin, rotationId, credentialHash }) {
  const parts = [caseId, packHash, origin, rotationId, credentialHash];
  if (!parts.every((part) => typeof part === 'string' && part.length > 0 && !part.includes('\n'))) {
    throw invalidConfiguration('The realtime receipt binding inputs are invalid.');
  }
  if (!/^[a-f0-9]{64}$/.test(credentialHash)) {
    throw invalidConfiguration('The realtime receipt credential hash must be a SHA-256 hex digest.');
  }
  return `sp-realtime-v${VERSION}:${caseId}:${packHash}:${origin}:${rotationId}:${credentialHash}`;
}

export function credentialHash(secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw invalidConfiguration('The learner credential is missing.');
  }
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
