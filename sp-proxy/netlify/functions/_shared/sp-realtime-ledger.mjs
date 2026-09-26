// Rotation ledger for real-time (speech-to-speech) encounters.
//
// A live speech session's spend is not observable by a request/response
// function once the browser and the provider are talking to each other, so this
// ledger charges the ceiling the server ENFORCES rather than a number it cannot
// verify: each session reserves its worst case (session deadline × pinned rate)
// before the provider is contacted, the charge becomes final the moment the call
// exists, and three independent stops end the call (the learner, the reaper,
// the provider's own maximum). Same posture as the managed-voice ledger —
// "storage ambiguity is charged conservatively and never authorizes a second
// provider call" — with a much simpler record, because there is nothing to
// reconcile after the fact.
//
// Bounds, all rotation-scoped: starts per UTC day, starts per rolling half hour,
// and a micro-dollar cap on reserved+spent. Every write is a compare-and-swap on
// the blob's ETag; a lost race re-reads and retries; an ambiguous write grants no
// authority. Ledger failure fails the encounter closed — text remains available.
//
// The record holds provider call ids (opaque session handles the reaper needs to
// hang up) and numbers. It never holds dialogue, audio, learner identity or
// request headers.

import { createHash } from 'node:crypto';

import { operationalError } from './sp-http.mjs';

export const PRODUCTION_REALTIME_NAMESPACE = 'realtime';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 30 * 60 * 1000;
const RETAIN_MS = 2 * DAY_MS;
const RESERVATION_LEASE_MS = 2 * 60 * 1000;
const MAX_SESSIONS = 2000;
const MAX_CAS_ATTEMPTS = 5;
const HASH = /^[a-f0-9]{64}$/;
const CALL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OPERATION_ID = /^[A-Za-z0-9_.:-]{1,512}$/;
const STATUSES = new Set(['reserved', 'active', 'ended', 'reaped']);
const RECORD_KEYS = [
  'capMicros',
  'reservedMicros',
  'rotationId',
  'schemaVersion',
  'sessions',
  'spentMicros',
  'startLimit',
  'updatedAt',
  'windowLimit',
].sort();
const SESSION_KEYS = [
  'bindingHash',
  'callId',
  'deadline',
  'endedAt',
  'maximumMicros',
  'reservedAt',
  'status',
].sort();

function invalidConfiguration() {
  return operationalError(500, 'invalid_configuration', 'The realtime ledger is not configured.');
}
function invalidRequest() {
  return operationalError(400, 'invalid_budget_request', 'The realtime ledger request is invalid.');
}
function unavailable() {
  return operationalError(503, 'budget_unavailable', 'Spoken-encounter accounting is temporarily unavailable.');
}
function contention() {
  return operationalError(503, 'budget_contention', 'Spoken-encounter accounting is temporarily busy.');
}
function duplicate() {
  return operationalError(409, 'realtime_operation_duplicate', 'This spoken encounter was already started.');
}
function mismatch() {
  return operationalError(409, 'idempotency_mismatch', 'The spoken encounter does not match its original request.');
}
function stateConflict() {
  return operationalError(409, 'budget_state_conflict', 'The spoken encounter is not in the required state.');
}
function dailyStartsExhausted() {
  return operationalError(429, 'realtime_daily_starts_exhausted', 'Today’s spoken-encounter allowance has been reached. It renews at midnight UTC.');
}
function windowExhausted() {
  return operationalError(429, 'realtime_window_exhausted', 'The shared spoken-encounter allowance for this half hour has been reached. Try again shortly or continue by typing.');
}
function capReached() {
  return operationalError(429, 'realtime_budget_reserved', 'The spoken-encounter budget for this rotation is reserved. Typing remains available.');
}

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const exactKeys = (value, keys) => isObject(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);
const nonempty = (value) => typeof value === 'string' && value.length > 0 && value === value.trim();
const safeNonnegative = (value) => Number.isSafeInteger(value) && value >= 0;
const timestamp = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
const sha256 = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');
const dayStart = (time) => Math.floor(time / DAY_MS) * DAY_MS;
const clone = (value) => JSON.parse(JSON.stringify(value));

function clockMilliseconds(clock) {
  let value;
  try {
    value = clock();
  } catch {
    throw unavailable();
  }
  if (!timestamp(value)) throw unavailable();
  return value;
}

function validSession(session, now) {
  if (!exactKeys(session, SESSION_KEYS)) return false;
  if (!HASH.test(session.bindingHash) || !STATUSES.has(session.status)) return false;
  if (!safeNonnegative(session.maximumMicros) || session.maximumMicros === 0) return false;
  if (!timestamp(session.reservedAt) || !timestamp(session.deadline)) return false;
  if (session.deadline <= session.reservedAt || session.reservedAt > now) return false;
  if (session.callId !== null && !(typeof session.callId === 'string' && CALL_ID.test(session.callId))) return false;
  if (session.status === 'reserved' && session.callId !== null) return false;
  if ((session.status === 'active' || session.status === 'ended' || session.status === 'reaped') && session.callId === null) return false;
  if (session.endedAt !== null && !timestamp(session.endedAt)) return false;
  if ((session.status === 'ended' || session.status === 'reaped') !== (session.endedAt !== null)) return false;
  return true;
}

function validRecord(record, { rotationId, capMicros, startLimit, windowLimit, now }) {
  if (!exactKeys(record, RECORD_KEYS) || record.schemaVersion !== 1) return false;
  if (record.rotationId !== rotationId || record.capMicros !== capMicros) return false;
  if (record.startLimit !== startLimit || record.windowLimit !== windowLimit) return false;
  if (!safeNonnegative(record.spentMicros) || !safeNonnegative(record.reservedMicros)) return false;
  if (!timestamp(record.updatedAt) || record.updatedAt > now) return false;
  if (!isObject(record.sessions)) return false;
  const entries = Object.entries(record.sessions);
  if (entries.length > MAX_SESSIONS) return false;
  let reserved = 0;
  for (const [hash, session] of entries) {
    if (!HASH.test(hash) || !validSession(session, now)) return false;
    if (session.status === 'reserved') reserved += session.maximumMicros;
  }
  return reserved === record.reservedMicros;
}

/**
 * @param {object} options
 * @param {{getWithMetadata:Function,set:Function}} options.store  strong-consistency blob store
 * @param {string} [options.namespace]
 * @param {string} options.rotationId
 * @param {number} options.capMicros       rotation cap on reserved+spent micro-dollars
 * @param {number} [options.startLimit]    starts per UTC day
 * @param {number} [options.windowLimit]   starts per rolling 30 minutes
 * @param {() => number} [options.clock]
 */
export function createRealtimeLedger({
  store,
  namespace = PRODUCTION_REALTIME_NAMESPACE,
  rotationId,
  capMicros,
  startLimit = 40,
  windowLimit = 8,
  clock = Date.now,
  maxCasAttempts = MAX_CAS_ATTEMPTS,
} = {}) {
  if (
    !store
    || typeof store.getWithMetadata !== 'function'
    || typeof store.set !== 'function'
    || !nonempty(namespace)
    || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(namespace)
    || !nonempty(rotationId)
    || rotationId.includes('/')
    || !safeNonnegative(capMicros)
    || capMicros === 0
    || !Number.isInteger(startLimit) || startLimit < 1 || startLimit > 1000
    || !Number.isInteger(windowLimit) || windowLimit < 1 || windowLimit > 1000
    || typeof clock !== 'function'
    || !Number.isInteger(maxCasAttempts) || maxCasAttempts < 1
  ) {
    throw invalidConfiguration();
  }
  const key = `${namespace}/${rotationId}/sessions-v1`;
  const policy = { rotationId, capMicros, startLimit, windowLimit };

  function initialRecord(now) {
    return {
      schemaVersion: 1,
      rotationId,
      capMicros,
      startLimit,
      windowLimit,
      spentMicros: 0,
      reservedMicros: 0,
      updatedAt: now,
      sessions: {},
    };
  }

  async function read(now) {
    let result;
    try {
      result = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    } catch {
      throw unavailable();
    }
    if (result === null) return null;
    if (!isObject(result) || !nonempty(result.etag) || !validRecord(result.data, { ...policy, now })) {
      throw unavailable();
    }
    return result;
  }

  async function write(record, conditions) {
    let result;
    try {
      // Raw set: setJSON has dropped conditional options in earlier adapters.
      result = await store.set(key, JSON.stringify(record), conditions);
    } catch {
      throw unavailable();
    }
    if (result?.modified !== true && result?.modified !== false) throw unavailable();
    if (result.modified === true && !nonempty(result.etag)) throw unavailable();
    return result.modified;
  }

  // Housekeeping applied to every working copy before a write: a reservation
  // whose SDP exchange never completed is reclaimed after its lease (the
  // provider was never contacted, so nothing was spent), and finished sessions
  // older than the retention window are dropped — their charge already lives in
  // spentMicros, which is never decremented.
  function tidy(record, now) {
    for (const [hash, session] of Object.entries(record.sessions)) {
      if (session.status === 'reserved' && now - session.reservedAt > RESERVATION_LEASE_MS) {
        record.reservedMicros -= session.maximumMicros;
        delete record.sessions[hash];
        continue;
      }
      if ((session.status === 'ended' || session.status === 'reaped') && now - session.endedAt > RETAIN_MS) {
        delete record.sessions[hash];
      }
    }
    if (!safeNonnegative(record.reservedMicros)) throw unavailable();
  }

  function committedMicros(record) {
    return record.spentMicros + record.reservedMicros;
  }

  function band(record) {
    const committed = committedMicros(record);
    if (committed >= capMicros) return 'capped';
    if (committed * 5 >= capMicros * 4) return 'warning';
    return 'ok';
  }

  async function mutate(step) {
    for (let attempt = 0; attempt < maxCasAttempts; attempt += 1) {
      const now = clockMilliseconds(clock);
      const existing = await read(now);
      const record = existing === null ? initialRecord(now) : clone(existing.data);
      tidy(record, now);
      const outcome = step(record, now);
      record.updatedAt = now;
      const written = await write(record, existing === null ? { onlyIfNew: true } : { onlyIfMatch: existing.etag });
      if (written) return Object.freeze(outcome);
    }
    throw contention();
  }

  async function snapshotRecord() {
    const now = clockMilliseconds(clock);
    const existing = await read(now);
    const record = existing === null ? initialRecord(now) : clone(existing.data);
    tidy(record, now);
    return { record, now };
  }

  function requireOperationId(operationId) {
    if (typeof operationId !== 'string' || !OPERATION_ID.test(operationId)) throw invalidRequest();
    return sha256(operationId);
  }

  async function reserveSession(input) {
    if (
      !exactKeys(input, ['bindingHash', 'deadline', 'maximumMicros', 'operationId'])
      || typeof input.bindingHash !== 'string' || !HASH.test(input.bindingHash)
      || !safeNonnegative(input.maximumMicros) || input.maximumMicros === 0
      || !timestamp(input.deadline)
    ) {
      throw invalidRequest();
    }
    const hash = requireOperationId(input.operationId);
    const { bindingHash, maximumMicros, deadline } = input;
    return mutate((record, now) => {
      if (deadline <= now) throw invalidRequest();
      const existing = record.sessions[hash];
      if (existing) {
        if (existing.bindingHash !== bindingHash || existing.maximumMicros !== maximumMicros) throw mismatch();
        throw duplicate();
      }
      const today = dayStart(now);
      let startsToday = 1;
      let startsInWindow = 1;
      for (const session of Object.values(record.sessions)) {
        if (session.reservedAt >= today) startsToday += 1;
        if (session.reservedAt > now - WINDOW_MS) startsInWindow += 1;
      }
      if (startsToday > startLimit) throw dailyStartsExhausted();
      if (startsInWindow > windowLimit) throw windowExhausted();
      if (committedMicros(record) + maximumMicros > capMicros) throw capReached();
      if (Object.keys(record.sessions).length >= MAX_SESSIONS) throw capReached();
      record.sessions[hash] = {
        bindingHash,
        callId: null,
        deadline,
        endedAt: null,
        maximumMicros,
        reservedAt: now,
        status: 'reserved',
      };
      record.reservedMicros += maximumMicros;
      return {
        authorized: true,
        operationHash: hash,
        band: band(record),
        startsToday,
        startsInWindow,
        remainingStarts: Math.max(0, startLimit - startsToday),
        resetsAt: today + DAY_MS,
      };
    });
  }

  // The call exists: the reservation becomes a charge and is never refunded.
  async function attachCall({ operationId, callId } = {}) {
    const hash = requireOperationId(operationId);
    if (typeof callId !== 'string' || !CALL_ID.test(callId)) throw invalidRequest();
    return mutate((record) => {
      const session = record.sessions[hash];
      if (!session || session.status !== 'reserved') throw stateConflict();
      session.callId = callId;
      session.status = 'active';
      record.reservedMicros -= session.maximumMicros;
      record.spentMicros += session.maximumMicros;
      if (!safeNonnegative(record.reservedMicros)) throw unavailable();
      return { attached: true, band: band(record) };
    });
  }

  // The SDP exchange failed before any call existed: nothing was spent.
  async function releaseSession({ operationId } = {}) {
    const hash = requireOperationId(operationId);
    return mutate((record) => {
      const session = record.sessions[hash];
      if (!session) return { released: false };
      if (session.status !== 'reserved') throw stateConflict();
      record.reservedMicros -= session.maximumMicros;
      if (!safeNonnegative(record.reservedMicros)) throw unavailable();
      delete record.sessions[hash];
      return { released: true };
    });
  }

  function finish(status) {
    return async ({ operationId } = {}) => {
      const hash = requireOperationId(operationId);
      return mutate((record, now) => {
        const session = record.sessions[hash];
        if (!session) return { changed: false, callId: null };
        if (session.status === 'ended' || session.status === 'reaped') {
          return { changed: false, callId: session.callId };
        }
        if (session.status !== 'active') throw stateConflict();
        session.status = status;
        session.endedAt = now;
        return { changed: true, callId: session.callId };
      });
    };
  }

  async function expiredSessions() {
    const { record, now } = await snapshotRecord();
    return Object.entries(record.sessions)
      .filter(([, session]) => session.status === 'active' && session.deadline <= now)
      .map(([hash, session]) => Object.freeze({ operationHash: hash, callId: session.callId, deadline: session.deadline }));
  }

  // Reaping is keyed by the stored hash because the reaper never held the
  // operation id — it only ever sees the ledger.
  async function markReapedByHash({ operationHash } = {}) {
    if (typeof operationHash !== 'string' || !HASH.test(operationHash)) throw invalidRequest();
    return mutate((record, now) => {
      const session = record.sessions[operationHash];
      if (!session || session.status !== 'active') return { changed: false };
      session.status = 'reaped';
      session.endedAt = now;
      return { changed: true };
    });
  }

  async function getBand() {
    const { record } = await snapshotRecord();
    return band(record);
  }

  async function getUsage() {
    const { record, now } = await snapshotRecord();
    const today = dayStart(now);
    const sessions = Object.values(record.sessions);
    return Object.freeze({
      schemaVersion: 1,
      currency: 'USD',
      capMicros,
      spentMicros: record.spentMicros,
      reservedMicros: record.reservedMicros,
      band: band(record),
      activeSessions: sessions.filter((session) => session.status === 'active').length,
      startsToday: sessions.filter((session) => session.reservedAt >= today).length,
      startLimit,
      windowLimit,
      updatedAt: new Date(record.updatedAt).toISOString(),
    });
  }

  return Object.freeze({
    reserveSession,
    attachCall,
    releaseSession,
    endSession: finish('ended'),
    expiredSessions,
    markReapedByHash,
    getBand,
    getUsage,
  });
}
