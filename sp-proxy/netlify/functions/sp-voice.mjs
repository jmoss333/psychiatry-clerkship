import { getStore } from '@netlify/blobs';

import {
  createBudgetLedger,
  PRODUCTION_BUDGET_NAMESPACE,
  PRODUCTION_BUDGET_STORE_NAME,
} from './_shared/sp-budget.mjs';
import * as productionGovernance from './_shared/sp-governance.mjs';
import { createHttp, operationalError, readEnv } from './_shared/sp-http.mjs';
import { inspectAudio } from './_shared/sp-audio-metadata.mjs';
import { createPackLoader } from './_shared/sp-pack.mjs';
import { createSpeechProvider } from './_shared/sp-speech-provider.mjs';
import { createTicketCodec, spokenText } from './_shared/sp-speech-ticket.mjs';

const ACCEPTED_MEDIA_TYPES = Object.freeze([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/wav',
]);
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_DURATION_MILLISECONDS = 90_000;
const MAX_SYNTHESIS_BODY_BYTES = 16 * 1024;
const MAX_SYNTHESIS_CHARACTERS = 4_096;
const MAX_TRANSCRIPTION_TEXT_BYTES = 256 * 1024;
const MAX_SYNTHESIS_AUDIO_BYTES = 10 * 1024 * 1024;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CAPTURE_ID = /^[A-Za-z0-9_-]{22}$/;
// Parity with the actor endpoint (sp.mjs POST_PACK_STATUSES): billable POSTs
// require an approved top-level pack, independent of per-case/engine review.
const POST_PACK_STATUSES = new Set(['reviewed', 'attested']);

function methodNotAllowed() {
  return operationalError(405, 'method_not_allowed', 'Method not allowed.');
}

function managedVoiceDisabled() {
  return operationalError(503, 'managed_voice_disabled', 'Managed voice is not available.');
}

function packNotApproved() {
  return operationalError(403, 'pack_not_approved', 'The case pack is not approved for learner use.');
}

function requireApprovedPack(snapshot) {
  if (!POST_PACK_STATUSES.has(snapshot?.pack?.status)) throw packNotApproved();
}

function disabledHealth() {
  return {
    schemaVersion: 1,
    enabled: false,
    acceptingVoice: false,
    budgetBand: null,
    activeStack: null,
    eligibleProfiles: [],
    acceptedMediaTypes: [...ACCEPTED_MEDIA_TYPES],
    limits: {
      maxAudioBytes: MAX_AUDIO_BYTES,
      maxAudioDurationMilliseconds: MAX_AUDIO_DURATION_MILLISECONDS,
    },
  };
}

function invalidConfiguration() {
  return operationalError(503, 'invalid_configuration', 'Managed voice is not configured.');
}

function invalidVoiceRequest() {
  return operationalError(400, 'invalid_voice_request', 'The voice request is invalid.');
}

function unsupportedAudio() {
  return operationalError(415, 'unsupported_audio', 'The audio format is not supported.');
}

function audioTooLarge() {
  return operationalError(413, 'audio_too_large', 'The audio file is too large.');
}

function voiceBudgetReserved() {
  return operationalError(429, 'voice_budget_reserved', 'Managed voice is temporarily reserved.');
}

function requestCancelled() {
  return operationalError(499, 'request_cancelled', 'The request was cancelled.');
}

function providerFailed() {
  return operationalError(502, 'speech_provider_error', 'The speech provider could not complete the request.');
}

function providerTimeout() {
  return operationalError(504, 'speech_provider_timeout', 'The speech provider timed out.');
}

function invalidSpeechRequest() {
  return operationalError(400, 'invalid_speech_request', 'Speech input is invalid.');
}

function unsupportedJson() {
  return operationalError(415, 'unsupported_media_type', 'The request media type is not supported.');
}

function synthesisBodyTooLarge() {
  return operationalError(413, 'request_too_large', 'The request body is too large.');
}

function transcriptionInProgress() {
  return operationalError(409, 'transcription_in_progress', 'Transcription is already in progress.');
}

function transcriptionAlreadyProcessed() {
  return operationalError(409, 'transcription_already_processed', 'This recording was already processed.');
}

function speechInProgress() {
  return operationalError(409, 'speech_in_progress', 'Speech generation is already in progress.');
}

function speechAlreadyRedeemed() {
  return operationalError(409, 'speech_already_redeemed', 'This speech ticket has already been redeemed.');
}

function validEnabledConfig(value) {
  const stringRuntimeKeys = [
    'stackId',
    'synthesisModel',
    'synthesisProvider',
    'transcriptionModel',
    'transcriptionProvider',
  ];
  const runtimeKeys = [...stringRuntimeKeys, 'zeroRetentionEntitled'].sort();
  return value
    && typeof value.rotationId === 'string'
    && OPAQUE_ID.test(value.rotationId)
    && typeof value.now === 'function'
    && value.runtime
    && typeof value.runtime === 'object'
    && JSON.stringify(Object.keys(value.runtime).sort()) === JSON.stringify(runtimeKeys)
    && stringRuntimeKeys.every((key) => (
      typeof value.runtime[key] === 'string'
      && value.runtime[key].length > 0
      && value.runtime[key].length <= 128
      && value.runtime[key] === value.runtime[key].trim()
    ))
    && typeof value.runtime.zeroRetentionEntitled === 'boolean';
}

async function loadFrozenSnapshot(packLoader) {
  if (!packLoader || typeof packLoader.load !== 'function') throw invalidConfiguration();
  const snapshot = await packLoader.load();
  if (
    !snapshot
    || typeof snapshot !== 'object'
    || !Object.isFrozen(snapshot)
    || !snapshot.pack
    || !Object.isFrozen(snapshot.pack)
    || !Object.isFrozen(snapshot.pack.cases)
    || typeof snapshot.packHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(snapshot.packHash)
  ) {
    throw operationalError(502, 'pack_invalid', 'The reviewed case pack is invalid.');
  }
  return snapshot;
}

function resolveEligibleContext({ snapshot, governance, config }) {
  if (typeof governance?.managedVoiceEligibility !== 'function') throw invalidConfiguration();
  const results = [];
  for (const caseDef of snapshot.pack.cases) {
    const result = governance.managedVoiceEligibility({
      pack: snapshot.pack,
      packHash: snapshot.packHash,
      caseDef,
      now: config.now,
      runtime: config.runtime,
    });
    if (result?.eligible === true) results.push({ caseDef, eligibility: result });
  }
  if (results.length === 0) return Object.freeze({ stack: null, profiles: [], results: [] });

  const candidates = snapshot.pack.speechEngine?.candidateStacks;
  const matches = Array.isArray(candidates)
    ? candidates.filter((candidate) => candidate?.id === config.runtime.stackId)
    : [];
  if (matches.length !== 1) throw invalidConfiguration();
  const candidate = matches[0];
  const zeroRetentionEntitled = results[0].eligibility.zeroRetentionEntitled;
  if (results.some(({ eligibility }) => (
    eligibility.zeroRetentionEntitled !== zeroRetentionEntitled
  ))) {
    throw invalidConfiguration();
  }
  const stack = Object.freeze({
    id: candidate.id,
    transcription: Object.freeze({ ...candidate.transcription }),
    synthesis: Object.freeze({ ...candidate.synthesis }),
    zeroRetentionEntitled,
  });
  const profiles = Object.freeze(results.map(({ caseDef, eligibility }) => Object.freeze({
    caseId: caseDef.id,
    profileId: eligibility.profile.id,
    profileVersion: eligibility.profile.profileVersion,
  })));
  return Object.freeze({ stack, profiles, results: Object.freeze(results) });
}

function activeStack({ snapshot, eligibility, config }) {
  const candidates = snapshot.pack.speechEngine?.candidateStacks;
  const matches = Array.isArray(candidates)
    ? candidates.filter((candidate) => candidate?.id === config.runtime.stackId)
    : [];
  if (matches.length !== 1 || typeof eligibility?.zeroRetentionEntitled !== 'boolean') {
    throw invalidConfiguration();
  }
  return Object.freeze({
    id: matches[0].id,
    transcription: Object.freeze({ ...matches[0].transcription }),
    synthesis: Object.freeze({ ...matches[0].synthesis }),
    zeroRetentionEntitled: eligibility.zeroRetentionEntitled,
  });
}

function managedCaseContext({ snapshot, governance, config, caseId }) {
  if (
    typeof governance?.resolveReviewedCase !== 'function'
    || typeof governance?.requireManagedVoiceEligibility !== 'function'
  ) {
    throw invalidConfiguration();
  }
  const caseDef = governance.resolveReviewedCase({
    pack: snapshot.pack,
    caseId,
    now: config.now,
  });
  const eligibility = governance.requireManagedVoiceEligibility({
    pack: snapshot.pack,
    packHash: snapshot.packHash,
    caseDef,
    now: config.now,
    runtime: config.runtime,
  });
  return Object.freeze({
    caseDef,
    eligibility,
    stack: activeStack({ snapshot, eligibility, config }),
  });
}

async function resolveDependency(dependency, context, method) {
  const resolved = typeof dependency === 'function'
    ? await dependency(context)
    : dependency;
  if (!resolved || typeof resolved[method] !== 'function') throw invalidConfiguration();
  return resolved;
}

function publicStack(stack) {
  if (stack === null) return null;
  return {
    id: stack.id,
    transcription: { ...stack.transcription },
    synthesis: { ...stack.synthesis },
  };
}

function healthBody({ context = null, budgetBand = null, acceptingVoice = false } = {}) {
  return {
    schemaVersion: 1,
    enabled: true,
    acceptingVoice,
    budgetBand,
    activeStack: publicStack(context?.stack ?? null),
    eligibleProfiles: context?.profiles ? [...context.profiles] : [],
    acceptedMediaTypes: [...ACCEPTED_MEDIA_TYPES],
    limits: {
      maxAudioBytes: MAX_AUDIO_BYTES,
      maxAudioDurationMilliseconds: MAX_AUDIO_DURATION_MILLISECONDS,
    },
  };
}

function requiredHeader(request, name) {
  const value = request.headers.get(name);
  if (value === null || value.length === 0 || value !== value.trim()) {
    throw invalidVoiceRequest();
  }
  return value;
}

function parseOpaqueId(request, name) {
  const value = requiredHeader(request, name);
  if (!OPAQUE_ID.test(value)) throw invalidVoiceRequest();
  return value;
}

function parseTurnId(request) {
  const value = requiredHeader(request, 'x-sp-turn-id');
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw invalidVoiceRequest();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw invalidVoiceRequest();
  return number;
}

function parseCaptureId(request) {
  const value = requiredHeader(request, 'x-sp-capture-id');
  if (!CAPTURE_ID.test(value)) throw invalidVoiceRequest();
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.byteLength !== 16 || decoded.toString('base64url') !== value) {
      throw invalidVoiceRequest();
    }
  } catch {
    throw invalidVoiceRequest();
  }
  return value;
}

function parseTranscriptionHeaders(request) {
  return Object.freeze({
    caseId: parseOpaqueId(request, 'x-sp-case-id'),
    encounterId: parseOpaqueId(request, 'x-sp-encounter-id'),
    turnId: parseTurnId(request),
    captureId: parseCaptureId(request),
  });
}

function transcriptionOperationId({ config, identifiers }) {
  return JSON.stringify({
    schemaVersion: 1,
    rotationId: config.rotationId,
    encounterId: identifiers.encounterId,
    turnId: identifiers.turnId,
    caseId: identifiers.caseId,
    operation: 'transcription',
    captureId: identifiers.captureId,
  });
}

function synthesisOperationId({ config, payload }) {
  return JSON.stringify({
    schemaVersion: 1,
    rotationId: config.rotationId,
    encounterId: payload.encounterId,
    turnId: payload.turnId,
    caseId: payload.caseId,
    operation: 'synthesis',
    jti: payload.jti,
  });
}

async function cancelReader(reader) {
  try {
    await reader.cancel();
  } catch {
    // The size/cancellation error remains authoritative.
  }
}

function declaredBodyTooLarge(value, maximum) {
  if (!/^[0-9]+$/.test(value ?? '')) return false;
  const normalized = value.replace(/^0+/, '') || '0';
  const limit = String(maximum);
  return normalized.length > limit.length
    || (normalized.length === limit.length && normalized > limit);
}

function rejectOversizedContentLength(request) {
  const contentLength = request.headers.get('content-length');
  if (declaredBodyTooLarge(contentLength, MAX_AUDIO_BYTES)) throw audioTooLarge();
}

async function readBoundedAudio(request) {
  rejectOversizedContentLength(request);
  if (request.signal.aborted) throw requestCancelled();
  if (!request.body || typeof request.body.getReader !== 'function') {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const audio = new Uint8Array(MAX_AUDIO_BYTES);
  let length = 0;
  try {
    while (true) {
      if (request.signal.aborted) {
        await cancelReader(reader);
        throw requestCancelled();
      }
      let item;
      try {
        item = await reader.read();
      } catch (error) {
        if (request.signal.aborted || error?.name === 'AbortError') throw requestCancelled();
        throw operationalError(400, 'invalid_audio', 'The audio file is invalid.');
      }
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) {
        await cancelReader(reader);
        throw operationalError(422, 'invalid_audio', 'The audio file is invalid.');
      }
      if (item.value.byteLength === 0) {
        await cancelReader(reader);
        throw operationalError(422, 'invalid_audio', 'The audio file is invalid.');
      }
      if (item.value.byteLength > MAX_AUDIO_BYTES - length) {
        await cancelReader(reader);
        throw audioTooLarge();
      }
      audio.set(item.value, length);
      length += item.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (request.signal.aborted) throw requestCancelled();
  return audio.slice(0, length);
}

function rejectOversizedSynthesisLength(request) {
  const contentLength = request.headers.get('content-length');
  if (declaredBodyTooLarge(contentLength, MAX_SYNTHESIS_BODY_BYTES)) {
    throw synthesisBodyTooLarge();
  }
}

async function readSynthesisJson(request) {
  rejectOversizedSynthesisLength(request);
  if (request.signal.aborted) throw requestCancelled();
  if (!request.body || typeof request.body.getReader !== 'function') throw invalidSpeechRequest();
  const reader = request.body.getReader();
  const encoded = new Uint8Array(MAX_SYNTHESIS_BODY_BYTES);
  let length = 0;
  try {
    while (true) {
      if (request.signal.aborted) {
        await cancelReader(reader);
        throw requestCancelled();
      }
      let item;
      try {
        item = await reader.read();
      } catch (error) {
        if (request.signal.aborted || error?.name === 'AbortError') throw requestCancelled();
        throw invalidSpeechRequest();
      }
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) {
        await cancelReader(reader);
        throw invalidSpeechRequest();
      }
      if (item.value.byteLength === 0) {
        await cancelReader(reader);
        throw invalidSpeechRequest();
      }
      if (item.value.byteLength > MAX_SYNTHESIS_BODY_BYTES - length) {
        await cancelReader(reader);
        throw synthesisBodyTooLarge();
      }
      encoded.set(item.value, length);
      length += item.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (request.signal.aborted) throw requestCancelled();
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      encoded.subarray(0, length),
    ));
    if (
      !value
      || typeof value !== 'object'
      || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['reply', 'ticket'])
      || typeof value.reply !== 'string'
      || typeof value.ticket !== 'string'
    ) {
      throw invalidSpeechRequest();
    }
    return value;
  } catch (error) {
    if (error?.code === 'invalid_speech_request') throw error;
    throw invalidSpeechRequest();
  }
}

function requireOkBand(band) {
  if (!['ok', 'warning', 'capped'].includes(band)) throw invalidConfiguration();
  if (band !== 'ok') throw voiceBudgetReserved();
}

function duplicateTranscription(result) {
  if (result?.finalized === true || ['settled', 'provider_failed'].includes(result?.status)) {
    throw transcriptionAlreadyProcessed();
  }
  throw transcriptionInProgress();
}

function duplicateSpeech(result) {
  if (result?.finalized === true || ['settled', 'provider_failed'].includes(result?.status)) {
    throw speechAlreadyRedeemed();
  }
  throw speechInProgress();
}

function safeProviderFailure(error) {
  if (error?.code === 'speech_provider_timeout') return providerTimeout();
  if (error?.code === 'request_cancelled') return requestCancelled();
  return providerFailed();
}

function validTranscriptionResult(result) {
  if (
    !result
    || typeof result !== 'object'
    || JSON.stringify(Object.keys(result).sort()) !== JSON.stringify([
      'durationMilliseconds',
      'text',
      'usage',
    ])
    || typeof result.text !== 'string'
    || result.text.length === 0
    || Buffer.byteLength(result.text, 'utf8') > MAX_TRANSCRIPTION_TEXT_BYTES
    || !Number.isSafeInteger(result.durationMilliseconds)
    || result.durationMilliseconds <= 0
    || result.durationMilliseconds > MAX_AUDIO_DURATION_MILLISECONDS
    || (
      result.usage !== null
      && (
        !result.usage
        || JSON.stringify(Object.keys(result.usage)) !== JSON.stringify(['milliseconds'])
        || !Number.isSafeInteger(result.usage.milliseconds)
        || result.usage.milliseconds <= 0
        || result.usage.milliseconds > MAX_AUDIO_DURATION_MILLISECONDS
      )
    )
  ) {
    throw providerFailed();
  }
  return result;
}

async function transcribe({ request, snapshot, context, provider, budget, config }) {
  const providerFactory = await resolveDependency(
    provider,
    { stack: context.stack, snapshot, config },
    'prepare',
  );
  const preparedProvider = await providerFactory.prepare();
  if (!preparedProvider || typeof preparedProvider.transcribe !== 'function') {
    throw invalidConfiguration();
  }
  if (request.signal.aborted) throw requestCancelled();

  const ledger = await resolveDependency(budget, { snapshot, config }, 'getBand');
  const band = await ledger.getBand();
  if (request.signal.aborted) throw requestCancelled();
  requireOkBand(band);
  if (
    typeof ledger.reserve !== 'function'
    || typeof ledger.markProviderStarted !== 'function'
    || typeof ledger.settle !== 'function'
    || typeof ledger.failBeforeProvider !== 'function'
  ) {
    throw invalidConfiguration();
  }

  let reservation;
  try {
    reservation = await ledger.reserve({
      idempotencyKey: transcriptionOperationId({ config, identifiers: context.identifiers }),
      kind: 'transcription',
      rateKey: { ...context.stack.transcription },
      maximumUsage: { milliseconds: MAX_AUDIO_DURATION_MILLISECONDS },
    });
  } catch (error) {
    if (error?.code === 'budget_in_progress') throw transcriptionInProgress();
    throw error;
  }
  if (reservation?.finalized === true) duplicateTranscription(reservation);

  if (request.signal.aborted) {
    await ledger.failBeforeProvider({ reservation, code: 'request_cancelled' });
    throw requestCancelled();
  }

  const authorization = await ledger.markProviderStarted(reservation);
  if (authorization?.authorized !== true) duplicateTranscription(authorization);

  let result;
  try {
    result = validTranscriptionResult(await preparedProvider.transcribe({
      audio: context.audio,
      mimeType: context.mimeType,
      signal: request.signal,
    }));
  } catch (error) {
    const safeFailure = request.signal.aborted ? requestCancelled() : safeProviderFailure(error);
    await ledger.settle({ reservation, outcome: 'provider_failed', usage: null });
    if (request.signal.aborted) throw requestCancelled();
    throw safeFailure;
  }

  await ledger.settle({
    reservation,
    outcome: 'succeeded',
    usage: result.usage === null ? null : { milliseconds: result.usage.milliseconds },
  });
  if (request.signal.aborted) throw requestCancelled();
  return {
    text: result.text,
    durationMilliseconds: result.durationMilliseconds,
  };
}

function validSynthesisResult(result, expectedCharacters) {
  if (
    !result
    || typeof result !== 'object'
    || JSON.stringify(Object.keys(result).sort()) !== JSON.stringify([
      'audio',
      'contentType',
      'usage',
    ])
    || !(result.audio instanceof Uint8Array)
    || result.audio.byteLength === 0
    || result.audio.byteLength > MAX_SYNTHESIS_AUDIO_BYTES
    || result.contentType !== 'audio/mpeg'
    || !result.usage
    || JSON.stringify(Object.keys(result.usage)) !== JSON.stringify(['characters'])
    || result.usage.characters !== expectedCharacters
  ) {
    throw providerFailed();
  }
  return result;
}

function validateSpokenText(reply) {
  const text = spokenText(reply);
  if (
    text.length === 0
    || [...text].length > MAX_SYNTHESIS_CHARACTERS
    || /\[[^\]\r\n]{1,120}\]/.test(text)
    || /<\/?[a-z][^>]*>/i.test(text)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  ) {
    throw invalidSpeechRequest();
  }
  return text;
}

async function synthesize({ request, snapshot, context, payload, text, provider, budget, config }) {
  const providerFactory = await resolveDependency(
    provider,
    { stack: context.stack, snapshot, config },
    'prepare',
  );
  const preparedProvider = await providerFactory.prepare();
  if (!preparedProvider || typeof preparedProvider.synthesize !== 'function') {
    throw invalidConfiguration();
  }
  if (request.signal.aborted) throw requestCancelled();

  const ledger = await resolveDependency(budget, { snapshot, config }, 'getBand');
  const band = await ledger.getBand();
  if (request.signal.aborted) throw requestCancelled();
  requireOkBand(band);
  if (
    typeof ledger.reserve !== 'function'
    || typeof ledger.markProviderStarted !== 'function'
    || typeof ledger.settle !== 'function'
    || typeof ledger.failBeforeProvider !== 'function'
  ) {
    throw invalidConfiguration();
  }

  let reservation;
  try {
    reservation = await ledger.reserve({
      idempotencyKey: synthesisOperationId({ config, payload }),
      kind: 'synthesis',
      rateKey: { ...context.stack.synthesis },
      maximumUsage: { characters: MAX_SYNTHESIS_CHARACTERS },
    });
  } catch (error) {
    if (error?.code === 'budget_in_progress') throw speechInProgress();
    throw error;
  }
  if (reservation?.finalized === true) duplicateSpeech(reservation);

  if (request.signal.aborted) {
    await ledger.failBeforeProvider({ reservation, code: 'request_cancelled' });
    throw requestCancelled();
  }
  const authorization = await ledger.markProviderStarted(reservation);
  if (authorization?.authorized !== true) duplicateSpeech(authorization);

  const characters = [...text].length;
  let result;
  try {
    result = validSynthesisResult(await preparedProvider.synthesize({
      text,
      profile: context.eligibility.profile,
      signal: request.signal,
    }), characters);
  } catch (error) {
    const safeFailure = request.signal.aborted ? requestCancelled() : safeProviderFailure(error);
    await ledger.settle({ reservation, outcome: 'provider_failed', usage: null });
    if (request.signal.aborted) throw requestCancelled();
    throw safeFailure;
  }
  await ledger.settle({
    reservation,
    outcome: 'succeeded',
    usage: { characters },
  });
  if (request.signal.aborted) throw requestCancelled();
  return result;
}

export function createVoiceHandler({
  http,
  packLoader,
  governance,
  ticketCodec,
  budget,
  provider,
  config,
} = {}) {
  if (!http || typeof config?.enabled !== 'boolean') {
    throw operationalError(500, 'invalid_configuration', 'Managed voice is not configured.');
  }

  return async function voiceHandler(request) {
    let origin = null;
    try {
      const url = new URL(request.url);
      const operation = url.searchParams.get('op');

      if (request.method === 'OPTIONS') {
        if (operation === null || operation === 'transcribe' || operation === 'speak') {
          return http.preflight(request);
        }
        return http.error(methodNotAllowed(), { origin: null });
      }

      if (request.method === 'GET' && operation === 'usage') {
        http.requireOperations(request);
        if (!validEnabledConfig(config)) throw invalidConfiguration();
        let snapshot = null;
        if (typeof budget === 'function') snapshot = await loadFrozenSnapshot(packLoader);
        const ledger = await resolveDependency(
          budget,
          { snapshot, config },
          'getUsage',
        );
        return http.json(await ledger.getUsage(), { origin: null });
      }

      origin = http.requireOrigin(request);
      http.requireStudentCredential(request);

      const healthRoute = request.method === 'GET' && operation === null;
      const transcribeRoute = request.method === 'POST' && operation === 'transcribe';
      const speakRoute = request.method === 'POST' && operation === 'speak';
      if (!healthRoute && !transcribeRoute && !speakRoute) throw methodNotAllowed();

      if (!config.enabled) {
        if (healthRoute) return http.json(disabledHealth(), { origin });
        throw managedVoiceDisabled();
      }

      if (!validEnabledConfig(config)) throw invalidConfiguration();
      if (healthRoute) {
        const snapshot = await loadFrozenSnapshot(packLoader);
        // F7 parity on the advisory surface: a pack below the billable-POST
        // floor must not advertise a stack/profiles every capture would 403 on.
        if (!POST_PACK_STATUSES.has(snapshot?.pack?.status)) {
          return http.json(healthBody(), { origin });
        }
        const context = resolveEligibleContext({ snapshot, governance, config });
        if (context.stack === null) {
          return http.json(healthBody({ context }), { origin });
        }
        const providerFactory = await resolveDependency(
          provider,
          { stack: context.stack, snapshot, config },
          'prepare',
        );
        await providerFactory.prepare();
        const ledger = await resolveDependency(
          budget,
          { snapshot, config },
          'getBand',
        );
        const budgetBand = await ledger.getBand();
        if (!['ok', 'warning', 'capped'].includes(budgetBand)) throw invalidConfiguration();
        return http.json(healthBody({
          context,
          budgetBand,
          acceptingVoice: budgetBand === 'ok',
        }), { origin });
      }

      if (transcribeRoute) {
        const identifiers = parseTranscriptionHeaders(request);
        const mimeType = request.headers.get('content-type');
        if (!ACCEPTED_MEDIA_TYPES.includes(mimeType)) throw unsupportedAudio();
        rejectOversizedContentLength(request);
        const audio = await readBoundedAudio(request);
        inspectAudio({ audio, mimeType });
        const snapshot = await loadFrozenSnapshot(packLoader);
        requireApprovedPack(snapshot);
        const caseContext = managedCaseContext({
          snapshot,
          governance,
          config,
          caseId: identifiers.caseId,
        });
        const result = await transcribe({
          request,
          snapshot,
          provider,
          budget,
          config,
          context: Object.freeze({
            ...caseContext,
            identifiers,
            mimeType,
            audio,
          }),
        });
        return http.json(result, { origin });
      }

      if (speakRoute) {
        if (request.headers.get('content-type') !== 'application/json') throw unsupportedJson();
        rejectOversizedSynthesisLength(request);
        const input = await readSynthesisJson(request);
        if (
          typeof ticketCodec?.authenticate !== 'function'
          || typeof ticketCodec?.assertBindings !== 'function'
        ) {
          throw invalidConfiguration();
        }
        const payload = ticketCodec.authenticate({ ticket: input.ticket, reply: input.reply });
        const text = validateSpokenText(input.reply);
        const snapshot = await loadFrozenSnapshot(packLoader);
        requireApprovedPack(snapshot);
        const caseContext = managedCaseContext({
          snapshot,
          governance,
          config,
          caseId: payload.caseId,
        });
        const profile = caseContext.eligibility.profile;
        ticketCodec.assertBindings({
          payload,
          expected: {
            rotationId: config.rotationId,
            encounterId: payload.encounterId,
            turnId: payload.turnId,
            caseId: caseContext.caseDef.id,
            packHash: snapshot.packHash,
            attestationHash: caseContext.eligibility.attestationHash,
            profileHash: caseContext.eligibility.profileHash,
            profileVersion: profile.profileVersion,
            provider: profile.provider,
            model: caseContext.stack.synthesis.model,
            voiceId: profile.voiceId,
          },
        });
        const result = await synthesize({
          request,
          snapshot,
          context: caseContext,
          payload,
          text,
          provider,
          budget,
          config,
        });
        return http.binary(result.audio, { contentType: result.contentType, origin });
      }

      throw operationalError(501, 'not_implemented', 'Managed voice is not implemented.');
    } catch (error) {
      return http.error(error, { origin });
    }
  };
}

function createProductionVoiceHandler() {
  const production = readEnv('CONTEXT') === 'production';
  const now = Date.now;
  const zeroRetention = readEnv('SP_VOICE_ZERO_RETENTION_ENTITLED');
  const configValue = Object.freeze({
    enabled: production && readEnv('SP_MANAGED_VOICE_ENABLED') === 'true',
    rotationId: readEnv('SP_ROTATION_ID') ?? '',
    runtime: Object.freeze({
      stackId: readEnv('SP_VOICE_STACK_ID') ?? '',
      transcriptionProvider: readEnv('SP_VOICE_TRANSCRIPTION_PROVIDER') ?? '',
      transcriptionModel: readEnv('SP_VOICE_TRANSCRIPTION_MODEL') ?? '',
      synthesisProvider: readEnv('SP_VOICE_SYNTHESIS_PROVIDER') ?? '',
      synthesisModel: readEnv('SP_VOICE_SYNTHESIS_MODEL') ?? '',
      zeroRetentionEntitled: zeroRetention === 'true'
        ? true
        : zeroRetention === 'false'
          ? false
          : null,
    }),
    now,
  });
  const http = createHttp({
    studentKey: readEnv('SP_STUDENT_PASSCODE'),
    operationsKey: readEnv('SP_OPERATIONS_KEY'),
    allowedOrigins: readEnv('SP_ALLOWED_ORIGINS'),
    production,
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

  let ticketCodec = null;
  const codec = () => {
    if (ticketCodec === null) {
      ticketCodec = createTicketCodec({
        secret: readEnv('SP_SPEECH_TICKET_SECRET'),
        clock: now,
      });
    }
    return ticketCodec;
  };
  const lazyTicketCodec = Object.freeze({
    authenticate: (input) => codec().authenticate(input),
    assertBindings: (input) => codec().assertBindings(input),
  });

  const provider = ({ stack }) => createSpeechProvider({
    stack,
    fetchImpl: globalThis.fetch,
    readApiKey(providerName) {
      if (providerName === 'openai') return readEnv('OPENAI_API_KEY');
      if (providerName === 'elevenlabs') return readEnv('ELEVENLABS_API_KEY');
      return null;
    },
    timeoutMs: 45_000,
  });
  const budget = ({ snapshot }) => createBudgetLedger({
    store: getStore({ name: PRODUCTION_BUDGET_STORE_NAME, consistency: 'strong' }),
    namespace: PRODUCTION_BUDGET_NAMESPACE,
    rotationId: configValue.rotationId,
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    rateCard: snapshot.pack.speechEngine?.rateCard,
    clock: now,
  });

  return createVoiceHandler({
    http,
    packLoader: lazyPackLoader,
    governance: productionGovernance,
    ticketCodec: lazyTicketCodec,
    budget,
    provider,
    config: configValue,
  });
}

let defaultHandler = null;

export default async function handler(request) {
  try {
    if (defaultHandler === null) defaultHandler = createProductionVoiceHandler();
    return await defaultHandler(request);
  } catch (error) {
    const operational = Number.isInteger(error?.status) && typeof error?.code === 'string';
    if (!operational) console.error('sp-voice: internal error', error);
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

export const config = Object.freeze({ path: '/api/sp/voice' });
