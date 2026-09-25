/**
 * The attestation ledger (ADR-003): a faculty sign-off as a signed, hash-chained event.
 *
 * ONE FILE, TWO READERS, ONE WRITER. The faculty console appends events; the console and the
 * learner-site build both verify the whole ledger and overlay it onto the git baseline
 * (`reviewed.json`, `topic_meta.json`, `question_bank.json`). Everything here is pure except
 * the Ed25519 calls, so both readers get byte-identical answers from the same function.
 *
 * WHY THE LEDGER NEVER MERGES. A sign-off is a statement by a person about a text, not a code
 * change. Routed through a pull request it inherited every property of one: it went stale when
 * `main` moved, conflicted, needed CI, and waited on a merge (rolling PR #781, 2026-09-24). Here
 * it is one line on an orphan branch that nothing builds, and the builds read it.
 *
 * WHAT MAKES A LINE TRUSTWORTHY (the invariants, ADR-003 §3):
 *   L-1  every line carries an Ed25519 signature by a key listed in keys.json on `main`
 *        (governance, so a content PR cannot swap it) and not revoked at the event's time;
 *   L-2  every line carries `seq` = previous + 1 and `prev` = sha256(previous line), and the
 *        signature covers both — deleting, inserting, reordering or editing any line breaks
 *        verification of the ledger from that point on;
 *   L-3  verification is all-or-nothing: one bad line and `verifyLedger` throws, and the build
 *        refuses to ship (the last good deploy stays live). There is no "skip the bad line";
 *        a partially trusted ledger is how a forged line would get in;
 *   L-7  a question sign-off binds to `itemHash`, the question's text without its status;
 *   L-8  applying the ledger changes governance fields only (see applyLedger).
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
} from 'node:crypto';

import { PENDING_SENTINEL, canonicalJson } from './attestation-hash.mjs';

export const LEDGER_FORMAT_VERSION = 1;
export const LEDGER_BRANCH = 'attestations';
export const LEDGER_FILE = 'ledger/events.jsonl';
export const KEYS_PATH = '13_Faculty_Resources/ledger/keys.json';
export const GENESIS_PREV = '0'.repeat(64);
export const MAX_REASON_LENGTH = 240;
export const MAX_BY_LENGTH = 80;
export const MAX_LEDGER_BYTES = 8 * 1024 * 1024;

const TYPES = new Set(['attest', 'reopen']);
const KINDS = new Set(['content', 'question']);
const ID_PATTERN = /^[A-Za-z0-9_.-]{1,200}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const KEY_ID = /^[a-f0-9]{16}$/;
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SIG = /^[A-Za-z0-9+/]{86}==$/; // 64 bytes, standard base64
const CONTROL = /[\u0000-\u001f\u007f]/;

const COMMON_FIELDS = ['v', 'seq', 'prev', 'ts', 'type', 'kind', 'id', 'by', 'base', 'keyId', 'sig'];
const FIELDS = {
  'attest:content': [...COMMON_FIELDS, 'contentHash'],
  'attest:question': [...COMMON_FIELDS, 'itemHash'],
  'reopen:content': [...COMMON_FIELDS, 'reason'],
  'reopen:question': [...COMMON_FIELDS, 'reason'],
};

/** A ledger that cannot be trusted. `line` is 1-based, or 0 when the fault is not one line. */
export class LedgerError extends Error {
  constructor(code, message, line = 0) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = 'LedgerError';
    this.code = code;
    this.line = line;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** The UTC calendar date of an event — the `at` a ledger row carries. */
export function eventDate(event) {
  return event.ts.slice(0, 10);
}

/**
 * A question's signed fingerprint: sha256 over its canonical JSON without `status`.
 * `status` is the thing being signed, so it cannot be part of what is signed.
 */
export function questionItemHash(item) {
  if (!isRecord(item)) throw new TypeError('a question item must be an object');
  const body = {};
  for (const [key, value] of Object.entries(item)) {
    if (key !== 'status') body[key] = value;
  }
  return sha256Hex(Buffer.from(canonicalJson(body), 'utf8'));
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// keys
// ─────────────────────────────────────────────────────────────────────────────────────────

/** First 16 hex of sha256 over the SPKI DER — stable, and derived, so it cannot lie. */
export function keyIdOf(publicKey) {
  const key = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
  return sha256Hex(key.export({ type: 'spki', format: 'der' })).slice(0, 16);
}

function requireEd25519(key, what) {
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new LedgerError('ledger.key_type', `${what} is not an Ed25519 key`);
  }
  return key;
}

/**
 * keys.json → Map(keyId → { publicKey, revokedAt }). Strict: a key whose declared keyId does
 * not match the key itself, a duplicate, or an unknown field is refused, because a keys file
 * that is quietly lenient is a keys file somebody can smuggle a key into.
 */
export function parseKeys(doc) {
  if (!isRecord(doc) || doc.version !== 1 || !Array.isArray(doc.keys)) {
    throw new LedgerError('ledger.keys_invalid', 'keys.json must be {"version": 1, "keys": [...]}');
  }
  const keys = new Map();
  for (const [index, entry] of doc.keys.entries()) {
    const where = `keys.json keys[${index}]`;
    if (!isRecord(entry)) throw new LedgerError('ledger.keys_invalid', `${where} is not an object`);
    const allowed = new Set(['keyId', 'algorithm', 'publicKeyPem', 'addedAt', 'revokedAt', 'note']);
    for (const field of Object.keys(entry)) {
      if (!allowed.has(field)) throw new LedgerError('ledger.keys_invalid', `${where} has unknown field ${field}`);
    }
    if (entry.algorithm !== 'ed25519') throw new LedgerError('ledger.keys_invalid', `${where} algorithm must be ed25519`);
    if (typeof entry.keyId !== 'string' || !KEY_ID.test(entry.keyId)) {
      throw new LedgerError('ledger.keys_invalid', `${where} keyId must be 16 hex`);
    }
    if (typeof entry.addedAt !== 'string' || !DATE.test(entry.addedAt)) {
      throw new LedgerError('ledger.keys_invalid', `${where} addedAt must be YYYY-MM-DD`);
    }
    if (entry.revokedAt != null && (typeof entry.revokedAt !== 'string' || !TS.test(entry.revokedAt))) {
      throw new LedgerError('ledger.keys_invalid', `${where} revokedAt must be null or an ISO UTC timestamp with milliseconds`);
    }
    let publicKey;
    try {
      publicKey = createPublicKey(String(entry.publicKeyPem));
    } catch {
      throw new LedgerError('ledger.keys_invalid', `${where} publicKeyPem is not a public key`);
    }
    requireEd25519(publicKey, where);
    if (keyIdOf(publicKey) !== entry.keyId) {
      throw new LedgerError('ledger.keys_invalid', `${where} keyId does not match its public key`);
    }
    if (keys.has(entry.keyId)) throw new LedgerError('ledger.keys_invalid', `${where} duplicates key ${entry.keyId}`);
    keys.set(entry.keyId, { publicKey, revokedAt: entry.revokedAt ?? null });
  }
  return keys;
}

/**
 * The console's signer, from the LEDGER_SIGNING_KEY secret: a PKCS#8 PEM, or the same DER as
 * one line of base64 (what `bin/ledger_keygen.mjs --install` stores, because env vars and
 * newlines do not mix).
 */
export function loadSigner(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new LedgerError('ledger.no_signing_key', 'no signing key is configured');
  let privateKey;
  try {
    privateKey = text.includes('BEGIN')
      ? createPrivateKey(text)
      : createPrivateKey({ key: Buffer.from(text, 'base64'), format: 'der', type: 'pkcs8' });
  } catch {
    throw new LedgerError('ledger.signing_key_invalid', 'the signing key could not be read');
  }
  requireEd25519(privateKey, 'the signing key');
  const publicKey = createPublicKey(privateKey);
  return { privateKey, publicKey, keyId: keyIdOf(publicKey) };
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// events
// ─────────────────────────────────────────────────────────────────────────────────────────

function unsignedBytes(event) {
  const body = {};
  for (const [key, value] of Object.entries(event)) {
    if (key !== 'sig') body[key] = value;
  }
  return Buffer.from(canonicalJson(body), 'utf8');
}

/** Field-level validation. Throws LedgerError naming the line and the field. */
export function validateEventShape(event, line = 0) {
  const fail = (message) => { throw new LedgerError('ledger.event_invalid', message, line); };
  if (!isRecord(event)) fail('an event must be a JSON object');
  if (event.v !== LEDGER_FORMAT_VERSION) fail(`unsupported event version ${JSON.stringify(event.v)}`);
  if (!TYPES.has(event.type)) fail(`unknown type ${JSON.stringify(event.type)}`);
  if (!KINDS.has(event.kind)) fail(`unknown kind ${JSON.stringify(event.kind)}`);
  const allowed = FIELDS[`${event.type}:${event.kind}`];
  for (const field of allowed) {
    if (!Object.hasOwn(event, field)) fail(`missing field ${field}`);
  }
  for (const field of Object.keys(event)) {
    if (!allowed.includes(field)) fail(`field ${field} is not allowed on a ${event.type} ${event.kind} event`);
  }
  if (!Number.isSafeInteger(event.seq) || event.seq < 1) fail('seq must be a positive integer');
  if (typeof event.prev !== 'string' || !HEX64.test(event.prev)) fail('prev must be 64 hex');
  if (typeof event.ts !== 'string' || !TS.test(event.ts) || Number.isNaN(Date.parse(event.ts))) {
    fail('ts must be an ISO UTC timestamp with milliseconds');
  }
  if (typeof event.id !== 'string' || !ID_PATTERN.test(event.id)) fail('id is malformed');
  if (typeof event.by !== 'string' || !event.by || event.by.length > MAX_BY_LENGTH
      || CONTROL.test(event.by) || event.by === PENDING_SENTINEL) {
    fail('by must name the attesting clinician');
  }
  if (typeof event.base !== 'string' || !HEX40.test(event.base)) fail('base must be a 40-hex commit sha');
  if (typeof event.keyId !== 'string' || !KEY_ID.test(event.keyId)) fail('keyId must be 16 hex');
  if (typeof event.sig !== 'string' || !SIG.test(event.sig)) fail('sig must be a base64 Ed25519 signature');
  if (event.type === 'attest' && event.kind === 'content'
      && (typeof event.contentHash !== 'string' || !HEX40.test(event.contentHash))) {
    fail('contentHash must be 40 hex');
  }
  if (event.type === 'attest' && event.kind === 'question'
      && (typeof event.itemHash !== 'string' || !HEX64.test(event.itemHash))) {
    fail('itemHash must be 64 hex');
  }
  if (event.type === 'reopen') {
    if (typeof event.reason !== 'string' || !event.reason.trim()
        || event.reason.length > MAX_REASON_LENGTH || CONTROL.test(event.reason)) {
      fail(`reason must be 1-${MAX_REASON_LENGTH} characters of text`);
    }
  }
  return event;
}

/**
 * Verify a whole ledger. Returns { events, head } where head is { seq, hash, ts } or null for
 * an empty ledger. Throws LedgerError on the FIRST fault — see L-3 in the header.
 *
 * Strictness that looks pedantic and is not: every line must be exactly the canonical JSON of
 * its own content (so a line cannot carry a second, whitespace-different reading), the file
 * must end with one newline and contain no blank lines or carriage returns (so `prev` is over
 * bytes both readers agree on), and `ts` may never go backwards.
 */
export function verifyLedger(text, keysDoc) {
  if (typeof text !== 'string') throw new LedgerError('ledger.not_text', 'the ledger is not text');
  if (Buffer.byteLength(text, 'utf8') > MAX_LEDGER_BYTES) {
    throw new LedgerError('ledger.too_large', `the ledger exceeds ${MAX_LEDGER_BYTES} bytes`);
  }
  if (text === '') return { events: [], head: null };
  if (text.includes('\r')) throw new LedgerError('ledger.format', 'the ledger contains a carriage return');
  if (!text.endsWith('\n')) throw new LedgerError('ledger.format', 'the ledger must end with a newline');
  const keys = parseKeys(keysDoc);
  const lines = text.slice(0, -1).split('\n');
  const events = [];
  let prevHash = GENESIS_PREV;
  let prevTs = '';
  lines.forEach((lineText, index) => {
    const line = index + 1;
    if (!lineText) throw new LedgerError('ledger.format', 'blank line', line);
    let event;
    try {
      event = JSON.parse(lineText);
    } catch {
      throw new LedgerError('ledger.format', 'not JSON', line);
    }
    validateEventShape(event, line);
    if (canonicalJson(event) !== lineText) {
      throw new LedgerError('ledger.not_canonical', 'the line is not in canonical form', line);
    }
    if (event.seq !== line) throw new LedgerError('ledger.chain', `seq ${event.seq} where ${line} was expected`, line);
    if (event.prev !== prevHash) throw new LedgerError('ledger.chain', 'prev does not match the line before it', line);
    if (event.ts < prevTs) throw new LedgerError('ledger.chain', 'ts goes backwards', line);
    const key = keys.get(event.keyId);
    if (!key) throw new LedgerError('ledger.unknown_key', `key ${event.keyId} is not in keys.json`, line);
    if (key.revokedAt && event.ts >= key.revokedAt) {
      throw new LedgerError('ledger.revoked_key', `key ${event.keyId} was revoked at ${key.revokedAt}`, line);
    }
    let valid = false;
    try {
      valid = edVerify(null, unsignedBytes(event), key.publicKey, Buffer.from(event.sig, 'base64'));
    } catch {
      valid = false;
    }
    if (!valid) throw new LedgerError('ledger.bad_signature', 'signature does not verify', line);
    events.push(event);
    prevHash = sha256Hex(Buffer.from(lineText, 'utf8'));
    prevTs = event.ts;
  });
  const last = events.at(-1);
  return { events, head: { seq: last.seq, hash: prevHash, ts: last.ts } };
}

/**
 * The console's write: verify what is there, then sign and chain `drafts` after it.
 *
 * `drafts` are `{ type, kind, id, contentHash? | itemHash? | reason? }`. Verifying first is not
 * optional: extending a ledger nobody checked would sign a forged history into place.
 * Returns { text, events, head } — `text` is the whole new file.
 */
export function appendEvents({ existingText, keysDoc, drafts, ts, by, base, signer }) {
  const { events: existing, head } = verifyLedger(existingText, keysDoc);
  if (!Array.isArray(drafts) || !drafts.length) throw new TypeError('nothing to append');
  if (typeof ts !== 'string' || !TS.test(ts)) throw new TypeError('ts must be an ISO UTC timestamp with milliseconds');
  if (head && ts < head.ts) throw new LedgerError('ledger.clock', 'the clock is behind the ledger head');
  const known = parseKeys(keysDoc);
  if (!known.has(signer.keyId)) {
    throw new LedgerError('ledger.unknown_key', `the signing key ${signer.keyId} is not listed in keys.json`);
  }
  let seq = head ? head.seq : 0;
  let prev = head ? head.hash : GENESIS_PREV;
  const lines = [];
  const events = [];
  for (const draft of drafts) {
    seq += 1;
    const unsigned = {
      v: LEDGER_FORMAT_VERSION, seq, prev, ts, type: draft.type, kind: draft.kind, id: draft.id,
      by, base, keyId: signer.keyId,
    };
    if (draft.type === 'attest' && draft.kind === 'content') unsigned.contentHash = draft.contentHash;
    if (draft.type === 'attest' && draft.kind === 'question') unsigned.itemHash = draft.itemHash;
    if (draft.type === 'reopen') unsigned.reason = draft.reason;
    const sig = edSign(null, unsignedBytes(unsigned), signer.privateKey).toString('base64');
    const event = validateEventShape({ ...unsigned, sig }, seq);
    const lineText = canonicalJson(event);
    lines.push(lineText);
    events.push(event);
    prev = sha256Hex(Buffer.from(lineText, 'utf8'));
  }
  const text = `${existingText}${lines.join('\n')}\n`;
  return {
    text,
    events,
    head: { seq, hash: prev, ts },
    previousCount: existing.length,
  };
}

/** The latest event for each (kind, id), in ledger order. */
export function latestByItem(events) {
  const latest = new Map();
  for (const event of events) latest.set(`${event.kind}:${event.id}`, event);
  return latest;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// overlay
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Project the ledger onto the git baseline. Pure: returns new documents and a report.
 *
 * THE RULES, each one a sentence a reviewer can check:
 *   · the latest ledger event per item wins over the baseline — EXCEPT a baseline row dated
 *     strictly LATER than the event (a later human decision recorded in git, or a content
 *     change that re-registered the page) keeps the baseline. Same day: the ledger wins;
 *   · an item no site ships, or with no registration row, is skipped and reported: the ledger
 *     can sign what exists, never create it;
 *   · a content attest rebuilds the row from the baseline and sets only status/at/by/
 *     contentHash (dropping `reason`); a reopen sets status/at/by/reason — L-8;
 *   · a `facultyReview` block in topic_meta follows its row (the consistency validator
 *     requires it), and nothing else in topic_meta is touched — facultyReview is outside
 *     every content hash, so this cannot drift anything;
 *   · a question attest sets `status: attested` only when the signed itemHash still matches
 *     the question's text; a mismatch is reported and the item is left alone. A retired item
 *     is never promoted. A reopen sets `draft`.
 * Drift for pages is NOT decided here: the row carries the signed contentHash and the build's
 * existing projection compares it with the text actually being built.
 */
export function applyLedger({ reviewed, topicMeta = null, qbank = null, events, shippedSlugs = null }) {
  const outReviewed = structuredClone(reviewed);
  const outTopicMeta = topicMeta === null ? null : structuredClone(topicMeta);
  const outQbank = qbank === null ? null : structuredClone(qbank);
  const report = {
    content: { attested: [], reopened: [] },
    question: { attested: [], reopened: [] },
    skipped: [],
    questionDrift: [],
  };
  const items = outQbank && Array.isArray(outQbank.items) ? outQbank.items : [];
  const byQuestionId = new Map(items.filter(isRecord).map(item => [item.id, item]));

  for (const event of latestByItem(events).values()) {
    const date = eventDate(event);
    if (event.kind === 'content') {
      if (shippedSlugs && !shippedSlugs.has(event.id)) {
        report.skipped.push({ kind: 'content', id: event.id, why: 'not shipped' });
        continue;
      }
      const base = Object.hasOwn(outReviewed, event.id) ? outReviewed[event.id] : null;
      if (!isRecord(base)) {
        report.skipped.push({ kind: 'content', id: event.id, why: 'no registration row in reviewed.json' });
        continue;
      }
      if (typeof base.at === 'string' && DATE.test(base.at) && base.at > date) {
        report.skipped.push({ kind: 'content', id: event.id, why: `baseline row is newer (${base.at})` });
        continue;
      }
      const next = { ...base, at: date };
      if (event.type === 'attest') {
        next.status = 'reviewed';
        next.by = event.by;
        next.contentHash = event.contentHash;
        delete next.reason;
        report.content.attested.push(event.id);
      } else {
        next.status = 'pending';
        next.by = PENDING_SENTINEL;
        next.reason = event.reason;
        report.content.reopened.push(event.id);
      }
      Object.defineProperty(outReviewed, event.id, {
        configurable: true, enumerable: true, writable: true, value: next,
      });
      const record = outTopicMeta && Object.hasOwn(outTopicMeta, event.id) ? outTopicMeta[event.id] : null;
      if (isRecord(record) && isRecord(record.facultyReview)) {
        record.facultyReview = event.type === 'attest'
          ? { ...record.facultyReview, status: 'reviewed', reviewer: event.by, lastReviewed: date }
          : { ...record.facultyReview, status: 'pending' };
      }
    } else {
      const item = byQuestionId.get(event.id);
      if (!item) {
        report.skipped.push({ kind: 'question', id: event.id, why: 'no such question' });
        continue;
      }
      if (event.type === 'attest') {
        if (item.retired === true) {
          report.skipped.push({ kind: 'question', id: event.id, why: 'retired' });
          continue;
        }
        if (questionItemHash(item) !== event.itemHash) {
          report.questionDrift.push(event.id);
          continue;
        }
        item.status = 'attested';
        report.question.attested.push(event.id);
      } else {
        item.status = 'draft';
        report.question.reopened.push(event.id);
      }
    }
  }
  return { reviewed: outReviewed, topicMeta: outTopicMeta, qbank: outQbank, report };
}
