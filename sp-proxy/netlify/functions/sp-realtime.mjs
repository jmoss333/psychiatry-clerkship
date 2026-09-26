// /api/sp/realtime — the server side of the spoken-first Interview Room.
//
// The browser sends its WebRTC SDP offer here (op=start); the proxy performs
// the SDP exchange with the server key, answers, and hands back a sealed
// receipt. On every learner utterance the browser posts the whole learner
// transcript (op=turn); the proxy re-derives rapport, gates and intents with
// the SAME deterministic engine /api/sp uses and returns a director brief that
// names only what the learner has earned. op=end hangs the call up.
//
// What the ledger reservation is and is not (amendment A1): the reservation is
// ACCOUNTING for cooperating clients — a rotation-scoped record of starts and
// of the ceiling each session was charged — not enforcement, and this module
// claims no cost ceiling. The enforced stops are wall-clock: the receipt
// deadline (every op refuses an expired receipt), the hangup the proxy issues
// on every touch of an expired receipt, the scheduled reaper, and op=end.
//
// Design: docs/superpowers/specs/2026-09-26-interview-room-realtime-voice-design.md

import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';

import { getStore } from '@netlify/blobs';

import * as productionGovernance from './_shared/sp-governance.mjs';
import {
  OperationalError,
  createHttp,
  operationalError,
  readEnv,
} from './_shared/sp-http.mjs';
import { createPackLoader } from './_shared/sp-pack.mjs';
import { PRODUCTION_BUDGET_STORE_NAME } from './_shared/sp-budget.mjs';
import {
  PRODUCTION_REALTIME_NAMESPACE,
  createRealtimeLedger,
} from './_shared/sp-realtime-ledger.mjs';
import { createRealtimeProvider } from './_shared/sp-realtime-provider.mjs';
import {
  createReceiptCodec,
  credentialHash,
  receiptBinding,
} from './_shared/sp-realtime-receipt.mjs';
import {
  EAGERNESS_VALUES,
  REALTIME_RATE_CARD,
  publicRealtimeState,
  realtimeSessionConfig,
  resolveVoice,
  sessionCeilingMicros,
  turnBrief,
} from './_shared/sp-realtime-session.mjs';
import { _internals } from './sp.mjs';

const { deriveState } = _internals;

// op=start carries an SDP offer of a few KB; op=turn carries up to
// maxTurns × TEXT_LIMIT characters of learner transcript plus item ids.
const JSON_BODY_LIMIT = 140 * 1024;
const SDP_OFFER_LIMIT_BYTES = 64 * 1024;
const TEXT_LIMIT = 1_200;
const MAX_CASE_ID = 64;
const OPPORTUNISTIC_REAP_LIMIT = 5;
const DEFAULT_DEADLINE_MINUTES = 15;
const DEFAULT_CAP_USD = 20;
const DEFAULT_START_LIMIT = 40;
const DEFAULT_WINDOW_LIMIT = 8;
const PROVIDER_TIMEOUT_MS = 20_000;
const ENCOUNTER_ID = /^[A-Za-z0-9_-]{22}$/;
const ROTATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const AUDIO_SETUPS = Object.freeze(['headphones', 'speakers']);
// The controller's terminal statuses for a patient reply (sp-interview.realtime.js): a
// reply the model finished is `complete` whether or not the sink played it — delivery
// evidence stays client-side and never reaches this route.
const PLAYBACK_STATUSES = Object.freeze(['complete', 'interrupted', 'incomplete', 'failed', 'none']);
// Parity with sp.mjs / sp-voice.mjs: billable POSTs require an approved pack.
const POST_PACK_STATUSES = new Set(['reviewed', 'attested']);
// A codec built on this clock authenticates a receipt and validates its
// payload exactly as the live codec does, and skips only the deadline
// comparison (0 is before every deadline). It exists so an EXPIRED receipt can
// still be read — to hang its call up and close its ledger row — and for
// nothing else; a payload read this way never mints a new receipt.
const EPOCH_CLOCK = () => 0;

/* ------------------------------- errors ------------------------------- */

function invalidConfiguration() {
  return operationalError(503, 'invalid_configuration', 'The spoken Interview Room is not configured.');
}
function realtimeDisabled() {
  return operationalError(503, 'realtime_disabled', 'The spoken Interview Room is not available.');
}
function invalidRequest() {
  return operationalError(400, 'invalid_request', 'The request is invalid.');
}
function invalidReceipt() {
  return operationalError(400, 'invalid_realtime_receipt', 'The encounter receipt is invalid.');
}
function unsupportedJson() {
  return operationalError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
}
function bodyTooLarge() {
  return operationalError(413, 'request_too_large', 'The request body is too large.');
}
function packNotApproved() {
  return operationalError(403, 'pack_not_approved', 'The case pack is not approved for learner use.');
}
function packUnavailable() {
  return operationalError(502, 'pack_unavailable', 'The reviewed case pack is unavailable.');
}
function packInvalid() {
  return operationalError(502, 'pack_invalid', 'The reviewed case pack is invalid.');
}
function unknownCase() {
  return operationalError(400, 'unknown_case', 'Unknown case.');
}
function caseNotReviewed() {
  return operationalError(403, 'case_not_reviewed', 'This case is not reviewed for learner use.');
}
function turnCapReached() {
  return operationalError(429, 'turn_cap_reached', 'The reviewed turn limit has been reached.');
}
function methodNotAllowed() {
  return operationalError(405, 'method_not_allowed', 'Method not allowed.');
}
function requestCancelled() {
  return operationalError(499, 'request_cancelled', 'The request was cancelled.');
}
function ledgerUnavailable() {
  return operationalError(503, 'budget_unavailable', 'Spoken-encounter accounting is temporarily unavailable.');
}
function providerFailed() {
  return operationalError(502, 'provider_status', 'The realtime provider could not complete the request.');
}
function internalError() {
  return operationalError(500, 'internal_error', 'Internal server error.');
}

/* ----------------------------- validation ----------------------------- */

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

// sp.mjs boundedText plus a control-character rule: learner items arrive from
// the provider's transcription or from typing, and neither has a use for C0
// controls beyond tab and newlines.
function boundedText(value, { maximum = TEXT_LIMIT } = {}) {
  return typeof value === 'string'
    && !hasUnpairedSurrogate(value)
    && !CONTROL_CHARACTERS.test(value)
    && [...value].length <= maximum
    && value.trim().length > 0;
}

function canonicalEncounterId(value) {
  if (typeof value !== 'string' || !ENCOUNTER_ID.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.byteLength === 16 && decoded.toString('base64url') === value;
  } catch {
    return false;
  }
}

function validCaseId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_CASE_ID
    && value === value.trim()
    && !CONTROL_CHARACTERS.test(value)
    && !value.includes('\n');
}

function validSdpOffer(value) {
  return typeof value === 'string'
    && value.startsWith('v=')
    && !hasUnpairedSurrogate(value)
    && !value.includes('\u0000')
    && Buffer.byteLength(value, 'utf8') <= SDP_OFFER_LIMIT_BYTES;
}

function declaredTooLarge(value, maximum) {
  if (value === null) return false;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw invalidRequest();
  const limit = String(maximum);
  return value.length > limit.length || (value.length === limit.length && value > limit);
}

async function cancelReader(reader) {
  try {
    await reader.cancel();
  } catch {
    // The bounded-reader error remains authoritative.
  }
}

async function readRequestJson(request) {
  if (request.headers.get('content-type') !== 'application/json') throw unsupportedJson();
  if (declaredTooLarge(request.headers.get('content-length'), JSON_BODY_LIMIT)) {
    throw bodyTooLarge();
  }
  if (request.signal.aborted) throw requestCancelled();
  if (!request.body || typeof request.body.getReader !== 'function') throw invalidRequest();
  const reader = request.body.getReader();
  const bytes = new Uint8Array(JSON_BODY_LIMIT);
  let length = 0;
  try {
    while (true) {
      let item;
      try {
        item = await reader.read();
      } catch {
        if (request.signal.aborted) throw requestCancelled();
        throw invalidRequest();
      }
      if (item.done) break;
      if (!(item.value instanceof Uint8Array) || item.value.byteLength === 0) {
        await cancelReader(reader);
        throw invalidRequest();
      }
      if (item.value.byteLength > JSON_BODY_LIMIT - length) {
        await cancelReader(reader);
        throw bodyTooLarge();
      }
      bytes.set(item.value, length);
      length += item.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (request.signal.aborted) throw requestCancelled();
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidRequest();
    return value;
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw invalidRequest();
  }
}

function validateStartBody(body) {
  if (
    !exactKeys(body, ['audioSetup', 'caseId', 'eagerness', 'encounterId', 'sdp'])
    || !validCaseId(body.caseId)
    || !canonicalEncounterId(body.encounterId)
    || !validSdpOffer(body.sdp)
    || !EAGERNESS_VALUES.includes(body.eagerness)
    || !AUDIO_SETUPS.includes(body.audioSetup)
  ) {
    throw invalidRequest();
  }
  return Object.freeze({
    caseId: body.caseId,
    encounterId: body.encounterId,
    sdp: body.sdp,
    eagerness: body.eagerness,
    audioSetup: body.audioSetup,
  });
}

function validateItems(value, maximumTurns) {
  if (!Array.isArray(value) || value.length === 0) throw invalidRequest();
  if (value.length > maximumTurns) throw turnCapReached();
  const seen = new Set();
  return Object.freeze(value.map((item) => {
    if (
      !exactKeys(item, ['itemId', 'text'])
      || typeof item.itemId !== 'string'
      || !ITEM_ID.test(item.itemId)
      || seen.has(item.itemId)
      || !boundedText(item.text)
    ) {
      throw invalidRequest();
    }
    seen.add(item.itemId);
    return Object.freeze({ itemId: item.itemId, text: item.text });
  }));
}

// The client's honest report of what the learner actually heard of the last
// patient reply. Validated and kept for the transcript's sake; it never feeds
// state, which is derived from the learner's words alone.
function validateLastPatient(value) {
  if (
    !exactKeys(value, ['itemId', 'status'])
    || !(value.itemId === null || (typeof value.itemId === 'string' && ITEM_ID.test(value.itemId)))
    || !PLAYBACK_STATUSES.includes(value.status)
  ) {
    throw invalidRequest();
  }
  return Object.freeze({ itemId: value.itemId, status: value.status });
}

function validateTurnBody(body, maximumTurns) {
  if (
    !exactKeys(body, ['caseId', 'encounterId', 'items', 'lastPatient', 'receipt'])
    || typeof body.receipt !== 'string'
    || !validCaseId(body.caseId)
    || !canonicalEncounterId(body.encounterId)
  ) {
    throw invalidRequest();
  }
  return Object.freeze({
    receipt: body.receipt,
    caseId: body.caseId,
    encounterId: body.encounterId,
    items: validateItems(body.items, maximumTurns),
    lastPatient: validateLastPatient(body.lastPatient),
  });
}

function validateEndBody(body) {
  if (
    !exactKeys(body, ['caseId', 'encounterId', 'receipt'])
    || typeof body.receipt !== 'string'
    || !validCaseId(body.caseId)
    || !canonicalEncounterId(body.encounterId)
  ) {
    throw invalidRequest();
  }
  return Object.freeze({
    receipt: body.receipt,
    caseId: body.caseId,
    encounterId: body.encounterId,
  });
}

/* ------------------------------ pack + case ------------------------------ */

async function loadFrozenSnapshot(packLoader) {
  if (!packLoader || typeof packLoader.load !== 'function') throw invalidConfiguration();
  let snapshot;
  try {
    snapshot = await packLoader.load();
  } catch (error) {
    if (error?.code === 'pack_invalid') throw packInvalid();
    throw packUnavailable();
  }
  if (
    !snapshot
    || typeof snapshot !== 'object'
    || !Object.isFrozen(snapshot)
    || !snapshot.pack
    || !Object.isFrozen(snapshot.pack)
    || !Object.isFrozen(snapshot.pack.cases)
    || typeof snapshot.packHash !== 'string'
    || !SHA256_HEX.test(snapshot.packHash)
  ) {
    throw packInvalid();
  }
  return snapshot;
}

function requireApprovedPack(snapshot) {
  if (!POST_PACK_STATUSES.has(snapshot?.pack?.status)) throw packNotApproved();
}

function maximumTurns(pack) {
  const value = pack?.engine?.maxTurns;
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1000) throw invalidConfiguration();
  return value;
}

function resolveReviewedCase(governance, pack, caseId, now) {
  if (typeof governance?.resolveReviewedCase !== 'function') throw invalidConfiguration();
  let caseDef;
  try {
    caseDef = governance.resolveReviewedCase({ pack, caseId, now });
  } catch (error) {
    if (error?.code === 'unknown_case') throw unknownCase();
    if (error?.code === 'case_not_reviewed') throw caseNotReviewed();
    throw invalidConfiguration();
  }
  if (!Array.isArray(pack?.cases) || !pack.cases.includes(caseDef) || caseDef?.id !== caseId) {
    throw invalidConfiguration();
  }
  return caseDef;
}

function reviewedCases(governance, pack, now) {
  if (typeof governance?.reviewedCaseSummaries !== 'function') throw invalidConfiguration();
  let summaries;
  try {
    summaries = governance.reviewedCaseSummaries(pack, { now });
  } catch {
    throw invalidConfiguration();
  }
  if (!Array.isArray(summaries) || !Array.isArray(pack?.cases)) throw invalidConfiguration();
  const cases = [];
  for (const summary of summaries) {
    if (!exactKeys(summary, ['id', 'title']) || !validCaseId(summary.id) || !boundedText(summary.title)) {
      throw invalidConfiguration();
    }
    const caseDef = pack.cases.find((candidate) => candidate?.id === summary.id);
    let voice;
    try {
      voice = resolveVoice(caseDef);
    } catch (error) {
      // A reviewed case with no spoken voice cannot be started, so it is not
      // advertised; any other failure is a configuration fault.
      if (error?.code === 'realtime_voice_unavailable') continue;
      throw invalidConfiguration();
    }
    cases.push({ id: summary.id, title: summary.title, voice });
  }
  return cases;
}

/* ------------------------------ dependencies ------------------------------ */

async function resolveDependency(dependency, context, method) {
  const resolved = typeof dependency === 'function'
    ? await dependency(context)
    : dependency;
  if (!resolved || typeof resolved[method] !== 'function') throw invalidConfiguration();
  return resolved;
}

function codecFor(receiptCodec, { maxTurns, clock }) {
  if (typeof receiptCodec !== 'function') throw invalidConfiguration();
  let codec;
  try {
    codec = receiptCodec({ maxTurns, clock });
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw invalidConfiguration();
  }
  if (!codec || typeof codec.seal !== 'function' || typeof codec.open !== 'function') {
    throw invalidConfiguration();
  }
  return codec;
}

function validEnabledConfig(config) {
  return typeof config.rotationId === 'string'
    && ROTATION_ID.test(config.rotationId)
    && nonempty(config.model)
    && config.model.length <= 128
    && config.model === config.model.trim()
    && nonempty(config.transcriptionModel)
    && config.transcriptionModel.length <= 128
    && config.transcriptionModel === config.transcriptionModel.trim()
    && Number.isInteger(config.deadlineMinutes)
    && config.deadlineMinutes >= 3
    && config.deadlineMinutes <= 60
    && typeof config.credentialHash === 'string'
    && SHA256_HEX.test(config.credentialHash)
    && typeof config.now === 'function';
}

function clockMilliseconds(config) {
  let value;
  try {
    value = config.now();
  } catch {
    throw invalidConfiguration();
  }
  if (!Number.isSafeInteger(value) || value < 0) throw invalidConfiguration();
  return value;
}

function sessionId(config) {
  const generate = typeof config.randomBytes === 'function' ? config.randomBytes : nodeRandomBytes;
  let bytes;
  try {
    bytes = Buffer.from(generate(16));
  } catch {
    throw invalidConfiguration();
  }
  if (bytes.byteLength !== 16) throw invalidConfiguration();
  return bytes.toString('hex');
}

function operationIdFor({ rotationId, encounterId, sid }) {
  return `start:${rotationId}:${encounterId}:${sid}`;
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
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// What the reservation is bound to: the start request minus the offer bytes,
// with the offer folded in as its own digest so the ledger never holds an SDP.
function startBindingHash(input) {
  return sha256(canonicalJson({
    audioSetup: input.audioSetup,
    caseId: input.caseId,
    eagerness: input.eagerness,
    encounterId: input.encounterId,
    sdpSha256: sha256(input.sdp),
  }));
}

function bindingFor({ snapshot, caseId, origin, config }) {
  return receiptBinding({
    caseId,
    packHash: snapshot.packHash,
    origin,
    rotationId: config.rotationId,
    credentialHash: config.credentialHash,
  });
}

function safeLog(logger, event) {
  if (typeof logger !== 'function') return;
  try {
    logger(event);
  } catch {
    // Logging must never change a response.
  }
}

// Where an error happened, without what it said: the name and the stack
// frames (file:line), never the message, which is the one field that could
// echo a learner's words or an SDP back out through the function log.
function contentFreeError(error) {
  const frames = typeof error?.stack === 'string'
    ? error.stack.split('\n').slice(1, 6).map((line) => line.trim())
    : [];
  return { name: typeof error?.name === 'string' ? error.name : 'Error', frames };
}

// A non-operational throw is a bug. It becomes a generic 500 and is logged
// content-free.
function normalizeError(error, { logger, op }) {
  if (error instanceof OperationalError) return error;
  safeLog(logger, { event: 'sp_realtime_internal_error', op, ...contentFreeError(error) });
  return internalError();
}

function sanitizeLedgerError(error) {
  if (error instanceof OperationalError) return error;
  return ledgerUnavailable();
}

function sanitizeProviderError(error) {
  if (error instanceof OperationalError) return error;
  return providerFailed();
}

/* ------------------------------ session stops ------------------------------ */

// Every proxy touch of an expired session is a stop. Both halves are best
// effort and independent: the call is hung up even if the ledger is down, the
// row is closed even if the provider is; the reaper covers whichever failed.
async function stopSession({ ledger, provider, payload, config, logger, reason }) {
  const outcome = { hungUp: false, ended: false };
  try {
    await provider.hangup({ callId: payload.callId });
    outcome.hungUp = true;
  } catch (error) {
    safeLog(logger, { event: 'sp_realtime_stop_failed', step: 'hangup', reason, code: error?.code ?? 'unknown' });
  }
  try {
    await ledger.endSession({
      operationId: operationIdFor({
        rotationId: config.rotationId,
        encounterId: payload.encounterId,
        sid: payload.sid,
      }),
    });
    outcome.ended = true;
  } catch (error) {
    safeLog(logger, { event: 'sp_realtime_stop_failed', step: 'ledger', reason, code: error?.code ?? 'unknown' });
  }
  return outcome;
}

/**
 * Hang up every active call past its deadline and mark it reaped. Used by the
 * scheduled reaper (sp-realtime-reaper.mjs) and opportunistically by op=start.
 * A hangup that answers 404 still marks the row reaped (the call is gone, which
 * is the point); any other failure leaves the row active for the next pass and
 * counts as failed. Never throws for a per-session failure; a ledger that
 * cannot even be read does throw, because there is nothing to iterate.
 */
export async function reapExpired({ ledger, provider, limit = 25, logger = null } = {}) {
  if (
    !ledger || typeof ledger.expiredSessions !== 'function' || typeof ledger.markReapedByHash !== 'function'
    || !provider || typeof provider.hangup !== 'function'
    || !Number.isInteger(limit) || limit < 1
  ) {
    throw invalidConfiguration();
  }
  const expired = await ledger.expiredSessions();
  const batch = expired.slice(0, limit);
  let reaped = 0;
  let failed = 0;
  for (const session of batch) {
    try {
      await provider.hangup({ callId: session.callId });
      await ledger.markReapedByHash({ operationHash: session.operationHash });
      reaped += 1;
    } catch (error) {
      failed += 1;
      safeLog(logger, { event: 'sp_realtime_reap_failed', code: error?.code ?? 'unknown' });
    }
  }
  const result = Object.freeze({ reaped, failed, deferred: expired.length - batch.length });
  safeLog(logger, { event: 'sp_realtime_reaped', ...result });
  return result;
}

/* --------------------------------- health --------------------------------- */

function disabledHealth() {
  return {
    schemaVersion: 1,
    enabled: false,
    acceptingSessions: false,
    model: null,
    transcriptionModel: null,
    budgetBand: null,
    deadlineMinutes: null,
    eagerness: [],
    cases: [],
  };
}

function requireBand(band) {
  if (!['ok', 'warning', 'capped'].includes(band)) throw invalidConfiguration();
  return band;
}

/* ---------------------------------- ops ---------------------------------- */

async function startSession({ request, origin, body, snapshot, governance, ledger, provider, receiptCodec, config, logger }) {
  const startedAt = clockMilliseconds(config);
  const input = validateStartBody(body);
  const pack = snapshot.pack;
  const maxTurns = maximumTurns(pack);
  const caseDef = resolveReviewedCase(governance, pack, input.caseId, config.now);
  const voice = resolveVoice(caseDef);
  const codec = codecFor(receiptCodec, { maxTurns, clock: config.now });
  const binding = bindingFor({ snapshot, caseId: caseDef.id, origin, config });
  const maximumMicros = sessionCeilingMicros({
    rateCard: REALTIME_RATE_CARD,
    model: config.model,
    transcriptionModel: config.transcriptionModel,
    deadlineMinutes: config.deadlineMinutes,
    maxTurns,
  });

  // The session object is fixed server-side; the only learner-chosen fields are
  // the turn-detection eagerness and the microphone setup (A4: near-field for
  // headphones, far-field for speakers, where the patient's own voice reaches
  // the microphone).
  const base = realtimeSessionConfig({
    caseDef,
    model: config.model,
    transcriptionModel: config.transcriptionModel,
    eagerness: input.eagerness,
    voice,
  });
  const session = {
    ...base,
    audio: {
      ...base.audio,
      input: {
        ...base.audio.input,
        noise_reduction: { type: input.audioSetup === 'headphones' ? 'near_field' : 'far_field' },
      },
    },
  };

  const sid = sessionId(config);
  const operationId = operationIdFor({ rotationId: config.rotationId, encounterId: input.encounterId, sid });
  const deadline = startedAt + config.deadlineMinutes * 60_000;

  const ledgerInstance = await resolveDependency(ledger, { snapshot, config }, 'reserveSession');
  for (const method of ['attachCall', 'releaseSession', 'endSession', 'expiredSessions', 'markReapedByHash']) {
    if (typeof ledgerInstance[method] !== 'function') throw invalidConfiguration();
  }
  const providerInstance = await resolveDependency(provider, { snapshot, config }, 'exchange');
  if (typeof providerInstance.hangup !== 'function') throw invalidConfiguration();

  let reservation;
  try {
    reservation = await ledgerInstance.reserveSession({
      operationId,
      bindingHash: startBindingHash(input),
      maximumMicros,
      deadline,
    });
  } catch (error) {
    throw sanitizeLedgerError(error);
  }
  if (reservation?.authorized !== true) throw ledgerUnavailable();

  // Opportunistic reap: a start is the one moment we know a function is awake.
  // Bounded, best effort, and it can never fail the start it rides on.
  try {
    await reapExpired({ ledger: ledgerInstance, provider: providerInstance, limit: OPPORTUNISTIC_REAP_LIMIT, logger });
  } catch (error) {
    safeLog(logger, { event: 'sp_realtime_reap_failed', code: error?.code ?? 'unknown' });
  }

  // No call exists yet: releasing the reservation charges nothing. If the
  // release itself fails, the ledger's reservation lease reclaims it.
  async function releaseReservation() {
    try {
      await ledgerInstance.releaseSession({ operationId });
    } catch (error) {
      safeLog(logger, { event: 'sp_realtime_release_failed', code: error?.code ?? 'unknown' });
    }
  }
  async function hangUpUnaccounted(callId, reason) {
    if (typeof callId !== 'string') return;
    try {
      await providerInstance.hangup({ callId });
    } catch (error) {
      safeLog(logger, { event: 'sp_realtime_stop_failed', step: 'hangup', reason, code: error?.code ?? 'unknown' });
    }
  }

  let answer;
  try {
    answer = await providerInstance.exchange({ sdp: input.sdp, session, signal: request.signal });
  } catch (error) {
    await releaseReservation();
    throw sanitizeProviderError(error);
  }
  if (!answer || typeof answer.sdp !== 'string' || !answer.sdp.startsWith('v=') || typeof answer.callId !== 'string') {
    await hangUpUnaccounted(answer?.callId, 'invalid_answer');
    await releaseReservation();
    throw providerFailed();
  }

  // The call exists. From here every failure hangs it up: a live call the
  // server cannot account for, or cannot hand a receipt to, is not left for
  // the reaper.
  let attachment;
  try {
    attachment = await ledgerInstance.attachCall({ operationId, callId: answer.callId });
    if (attachment?.attached !== true) throw ledgerUnavailable();
  } catch (error) {
    await hangUpUnaccounted(answer.callId, 'attach_failed');
    await releaseReservation();
    throw sanitizeLedgerError(error);
  }

  const payload = {
    v: 1,
    encounterId: input.encounterId,
    caseId: caseDef.id,
    callId: answer.callId,
    sid,
    turn: 0,
    startedAt,
    deadline,
  };
  try {
    const state = deriveState(caseDef, []);
    const result = {
      sdp: answer.sdp,
      receipt: codec.seal(payload, { binding }),
      deadline,
      turn: 0,
      opening: caseDef.persona.opening,
      brief: turnBrief(caseDef, state, { opening: true }),
      state: publicRealtimeState(state, pack.engine),
      model: config.model,
      voice,
    };
    safeLog(logger, {
      event: 'sp_realtime_start',
      caseId: caseDef.id,
      turn: 0,
      band: attachment.band ?? reservation.band ?? null,
      durationMs: clockMilliseconds(config) - startedAt,
    });
    return result;
  } catch (error) {
    await stopSession({ ledger: ledgerInstance, provider: providerInstance, payload, config, logger, reason: 'receipt_failed' });
    throw error;
  }
}

// Opens a receipt under its binding. An expired receipt is read a second time
// with the epoch clock (authentication unchanged, deadline check skipped) so the
// caller can stop the session it names; `expired` says which happened.
function openReceipt({ receiptCodec, maxTurns, token, binding, config }) {
  const live = codecFor(receiptCodec, { maxTurns, clock: config.now });
  try {
    return { payload: live.open(token, { binding }), expired: false };
  } catch (error) {
    if (error?.code !== 'realtime_session_expired') throw error;
    const stale = codecFor(receiptCodec, { maxTurns, clock: EPOCH_CLOCK });
    return { payload: stale.open(token, { binding }), expired: true };
  }
}

function requireReceiptMatch(payload, input) {
  if (payload.caseId !== input.caseId || payload.encounterId !== input.encounterId) throw invalidReceipt();
}

async function turnSession({ origin, body, snapshot, governance, ledger, provider, receiptCodec, config, logger }) {
  const startedAt = clockMilliseconds(config);
  const pack = snapshot.pack;
  const maxTurns = maximumTurns(pack);
  const input = validateTurnBody(body, maxTurns);
  const caseDef = resolveReviewedCase(governance, pack, input.caseId, config.now);
  const binding = bindingFor({ snapshot, caseId: caseDef.id, origin, config });
  const { payload, expired } = openReceipt({ receiptCodec, maxTurns, token: input.receipt, binding, config });
  requireReceiptMatch(payload, input);
  if (expired) {
    const ledgerInstance = await resolveDependency(ledger, { snapshot, config }, 'endSession');
    const providerInstance = await resolveDependency(provider, { snapshot, config }, 'hangup');
    const outcome = await stopSession({ ledger: ledgerInstance, provider: providerInstance, payload, config, logger, reason: 'expired' });
    safeLog(logger, { event: 'sp_realtime_end', caseId: caseDef.id, turn: payload.turn, reason: 'expired', ...outcome });
    throw operationalError(410, 'realtime_session_expired', 'This spoken encounter has ended. Start a new one.');
  }
  // A2: the turn is the transcript length. The receipt's turn is a floor the
  // transcript may not fall below (a replayed older transcript), never the
  // source of the count.
  if (input.items.length < payload.turn) throw invalidRequest();

  const state = deriveState(caseDef, input.items.map((item) => item.text));
  const codec = codecFor(receiptCodec, { maxTurns, clock: config.now });
  const result = {
    receipt: codec.seal({ ...payload, turn: input.items.length }, { binding }),
    turn: input.items.length,
    brief: turnBrief(caseDef, state),
    state: publicRealtimeState(state, pack.engine),
    deadline: payload.deadline,
  };
  safeLog(logger, {
    event: 'sp_realtime_turn',
    caseId: caseDef.id,
    turn: input.items.length,
    durationMs: clockMilliseconds(config) - startedAt,
  });
  return result;
}

async function endSession({ origin, body, snapshot, governance, ledger, provider, receiptCodec, config, logger }) {
  const startedAt = clockMilliseconds(config);
  const pack = snapshot.pack;
  const maxTurns = maximumTurns(pack);
  const input = validateEndBody(body);
  const caseDef = resolveReviewedCase(governance, pack, input.caseId, config.now);
  const binding = bindingFor({ snapshot, caseId: caseDef.id, origin, config });
  // An expired receipt is accepted here: ending is exactly what an expired
  // session needs, and refusing it would strand the call for the reaper.
  const { payload, expired } = openReceipt({ receiptCodec, maxTurns, token: input.receipt, binding, config });
  requireReceiptMatch(payload, input);
  const ledgerInstance = await resolveDependency(ledger, { snapshot, config }, 'endSession');
  const providerInstance = await resolveDependency(provider, { snapshot, config }, 'hangup');
  // Hang up first, then close the row. A hangup the provider refuses (other
  // than 404) surfaces as an error and leaves the row active, so the reaper
  // retries it; an unavailable ledger after a successful hangup does the same,
  // and the reaper's hangup then answers 404 and closes the row.
  try {
    await providerInstance.hangup({ callId: payload.callId });
  } catch (error) {
    throw sanitizeProviderError(error);
  }
  try {
    await ledgerInstance.endSession({
      operationId: operationIdFor({ rotationId: config.rotationId, encounterId: payload.encounterId, sid: payload.sid }),
    });
  } catch (error) {
    throw sanitizeLedgerError(error);
  }
  safeLog(logger, {
    event: 'sp_realtime_end',
    caseId: caseDef.id,
    turn: payload.turn,
    reason: expired ? 'expired' : 'learner',
    durationMs: clockMilliseconds(config) - startedAt,
  });
  return { ended: true };
}

/* -------------------------------- handler -------------------------------- */

export function createRealtimeHandler({
  http,
  packLoader,
  governance,
  ledger,
  provider,
  receiptCodec,
  config,
  logger = null,
} = {}) {
  if (!http || typeof config?.enabled !== 'boolean') {
    throw operationalError(500, 'invalid_configuration', 'The spoken Interview Room is not configured.');
  }

  return async function realtimeHandler(request) {
    let origin = null;
    let operation = null;
    try {
      const url = new URL(request.url);
      operation = url.searchParams.get('op');

      if (request.method === 'OPTIONS') {
        if (operation === null || ['start', 'turn', 'end'].includes(operation)) {
          return http.preflight(request);
        }
        return http.error(methodNotAllowed(), { origin: null });
      }

      if (request.method === 'GET' && operation === 'usage') {
        http.requireOperations(request);
        const ledgerInstance = await resolveDependency(ledger, { snapshot: null, config }, 'getUsage');
        let usage;
        try {
          usage = await ledgerInstance.getUsage();
        } catch (error) {
          throw sanitizeLedgerError(error);
        }
        return http.json(usage, { origin: null });
      }

      origin = http.requireOrigin(request);
      http.requireStudentCredential(request);

      const healthRoute = request.method === 'GET' && operation === null;
      const startRoute = request.method === 'POST' && operation === 'start';
      const turnRoute = request.method === 'POST' && operation === 'turn';
      const endRoute = request.method === 'POST' && operation === 'end';
      if (!healthRoute && !startRoute && !turnRoute && !endRoute) throw methodNotAllowed();

      if (!config.enabled) {
        if (healthRoute) return http.json(disabledHealth(), { origin });
        throw realtimeDisabled();
      }
      if (!validEnabledConfig(config)) throw invalidConfiguration();

      if (healthRoute) {
        const snapshot = await loadFrozenSnapshot(packLoader);
        // A pack below the billable-POST floor must not advertise sessions
        // every start would 403 on.
        if (!POST_PACK_STATUSES.has(snapshot.pack.status)) {
          return http.json(disabledHealth(), { origin });
        }
        const cases = reviewedCases(governance, snapshot.pack, config.now);
        const ledgerInstance = await resolveDependency(ledger, { snapshot, config }, 'getBand');
        let band;
        try {
          band = requireBand(await ledgerInstance.getBand());
        } catch (error) {
          throw sanitizeLedgerError(error);
        }
        return http.json({
          schemaVersion: 1,
          enabled: true,
          acceptingSessions: band !== 'capped',
          model: config.model,
          transcriptionModel: config.transcriptionModel,
          budgetBand: band,
          deadlineMinutes: config.deadlineMinutes,
          eagerness: [...EAGERNESS_VALUES],
          cases,
        }, { origin });
      }

      const body = await readRequestJson(request);
      const snapshot = await loadFrozenSnapshot(packLoader);
      requireApprovedPack(snapshot);
      const context = { request, origin, body, snapshot, governance, ledger, provider, receiptCodec, config, logger };
      if (startRoute) return http.json(await startSession(context), { origin });
      if (turnRoute) return http.json(await turnSession(context), { origin });
      return http.json(await endSession(context), { origin });
    } catch (error) {
      return http.error(normalizeError(error, { logger, op: operation }), { origin });
    }
  };
}

/* ----------------------------- production wiring ----------------------------- */

function optionalString(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

function boundedInteger(value, { fallback, minimum, maximum }) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

// Whole or fractional dollars (up to six places) → integer micro-dollars.
function usdToMicros(value, { fallback }) {
  if (value === undefined || value === null || value === '') return fallback * 1_000_000;
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value.trim())) return null;
  const micros = Math.round(Number(value.trim()) * 1_000_000);
  return Number.isSafeInteger(micros) && micros > 0 && micros <= 10_000 * 1_000_000 ? micros : null;
}

/**
 * The runtime pins, read from the environment. Every invalid value reads as
 * `null` and fails closed downstream (503 invalid_configuration), never as a
 * default. The reaper reads the same function so its ledger policy can never
 * drift from the route's — the ledger record validates cap and limits against
 * whoever opens it, and a mismatch would make every reap fail.
 */
export function runtimeRealtimeConfig(read = readEnv) {
  const production = read('CONTEXT') === 'production';
  return Object.freeze({
    production,
    enabled: production && read('SP_REALTIME_ENABLED') === 'true',
    model: optionalString(read('SP_REALTIME_MODEL')),
    transcriptionModel: optionalString(read('SP_REALTIME_TRANSCRIPTION_MODEL')),
    deadlineMinutes: boundedInteger(read('SP_REALTIME_MAX_SESSION_MINUTES'), { fallback: DEFAULT_DEADLINE_MINUTES, minimum: 3, maximum: 60 }),
    capMicros: usdToMicros(read('SP_REALTIME_ROTATION_CAP_USD'), { fallback: DEFAULT_CAP_USD }),
    startLimit: boundedInteger(read('SP_REALTIME_STARTS_PER_DAY'), { fallback: DEFAULT_START_LIMIT, minimum: 1, maximum: 1000 }),
    windowLimit: boundedInteger(read('SP_REALTIME_STARTS_PER_HALF_HOUR'), { fallback: DEFAULT_WINDOW_LIMIT, minimum: 1, maximum: 1000 }),
    rotationId: typeof read('SP_ROTATION_ID') === 'string' ? read('SP_ROTATION_ID') : '',
  });
}

export function validLedgerPolicy(runtime) {
  return typeof runtime?.rotationId === 'string'
    && ROTATION_ID.test(runtime.rotationId)
    && Number.isSafeInteger(runtime.capMicros) && runtime.capMicros > 0
    && Number.isInteger(runtime.startLimit) && runtime.startLimit >= 1
    && Number.isInteger(runtime.windowLimit) && runtime.windowLimit >= 1;
}

export function createProductionRealtimeHandler() {
  const runtime = runtimeRealtimeConfig(readEnv);
  const now = Date.now;
  const http = createHttp({
    studentKey: readEnv('SP_STUDENT_PASSCODE'),
    operationsKey: readEnv('SP_OPERATIONS_KEY'),
    allowedOrigins: readEnv('SP_ALLOWED_ORIGINS'),
    production: runtime.production,
  });
  const configValue = Object.freeze({
    enabled: runtime.enabled,
    model: runtime.model,
    transcriptionModel: runtime.transcriptionModel,
    deadlineMinutes: runtime.deadlineMinutes,
    rotationId: runtime.rotationId,
    credentialHash: credentialHash(readEnv('SP_STUDENT_PASSCODE')),
    now,
  });

  let packLoader = null;
  const lazyPackLoader = Object.freeze({
    load() {
      if (packLoader === null) {
        packLoader = createPackLoader({
          url: readEnv('SP_PACK_URL'),
          token: readEnv('SP_PACK_TOKEN'),
          fetchImpl: globalThis.fetch,
          now,
        });
      }
      return packLoader.load();
    },
  });

  // One codec per (clock, turn bound): the live clock for every op, the epoch
  // clock only to read an expired receipt on its way to being stopped.
  const codecs = new Map();
  const receiptCodec = ({ maxTurns, clock }) => {
    if (!codecs.has(clock)) codecs.set(clock, new Map());
    const byTurns = codecs.get(clock);
    if (!byTurns.has(maxTurns)) {
      byTurns.set(maxTurns, createReceiptCodec({
        secret: readEnv('SP_SPEECH_TICKET_SECRET'),
        clock,
        maxTurns,
      }));
    }
    return byTurns.get(maxTurns);
  };

  let ledgerInstance = null;
  const ledger = () => {
    if (ledgerInstance === null) {
      if (!validLedgerPolicy(runtime)) throw invalidConfiguration();
      ledgerInstance = createRealtimeLedger({
        store: getStore({ name: PRODUCTION_BUDGET_STORE_NAME, consistency: 'strong' }),
        namespace: PRODUCTION_REALTIME_NAMESPACE,
        rotationId: runtime.rotationId,
        capMicros: runtime.capMicros,
        startLimit: runtime.startLimit,
        windowLimit: runtime.windowLimit,
        clock: now,
      });
    }
    return ledgerInstance;
  };

  const provider = createRealtimeProvider({
    fetchImpl: globalThis.fetch,
    readApiKey: () => readEnv('OPENAI_API_KEY'),
    timeoutMs: PROVIDER_TIMEOUT_MS,
  });

  return createRealtimeHandler({
    http,
    packLoader: lazyPackLoader,
    governance: productionGovernance,
    ledger,
    provider,
    receiptCodec,
    config: configValue,
    logger(event) { console.info(JSON.stringify(event)); },
  });
}

let defaultHandler = null;

export default async function handler(request) {
  try {
    if (defaultHandler === null) defaultHandler = createProductionRealtimeHandler();
    return await defaultHandler(request);
  } catch (error) {
    const operational = Number.isInteger(error?.status) && typeof error?.code === 'string';
    if (!operational) console.error('sp-realtime: internal error', JSON.stringify(contentFreeError(error)));
    const status = operational ? error.status : 500;
    const code = operational ? error.code : 'internal_error';
    const message = operational && typeof error?.message === 'string'
      ? error.message
      : 'Internal server error.';
    return new Response(JSON.stringify({ error: { code, message } }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}

// Sized from this route's own session cap, not copied from sp.mjs's 20. Ward
// wifi puts a whole cohort behind one NAT, so the per-IP window sees every
// learner at once: 8 concurrent sessions (the half-hour window cap) × ~5
// op=turn POSTs a minute at semantic-VAD 'medium', plus starts, ends and health
// polls, is ~50 requests a minute from one address. A 429 on op=turn mutes the
// patient for that learner — no brief, no reply — so the limit sits above that
// load while still bounding a scripted passcode holder to well under the
// ledger's own start caps.
export const config = Object.freeze({
  path: '/api/sp/realtime',
  rateLimit: Object.freeze({
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: Object.freeze(['ip', 'domain']),
  }),
});
