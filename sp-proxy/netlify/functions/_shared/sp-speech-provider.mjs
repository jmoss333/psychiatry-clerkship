import { OperationalError, operationalError } from './sp-http.mjs';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const TRANSCRIPTION_JSON_LIMIT = 256 * 1024;
const SYNTHESIS_AUDIO_LIMIT = 10 * 1024 * 1024;
const SYNTHESIS_JSON_LIMIT = 16 * 1024;
const SYNTHESIS_CODE_POINT_LIMIT = 4_096;
const DEFAULT_TIMEOUT_MS = 45_000;
const CADENCES = new Set(['measured-flat', 'pressured-fast', 'guarded-halting']);
const OPENAI_STOCK_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
]);
const MEDIA_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/wav',
]);

const SAFE_ERRORS = Object.freeze({
  configuration: Object.freeze({
    status: 503,
    code: 'invalid_configuration',
    message: 'Managed speech is not configured.',
  }),
  factoryConfiguration: Object.freeze({
    status: 500,
    code: 'invalid_configuration',
    message: 'Managed speech configuration is invalid.',
  }),
  input: Object.freeze({
    status: 400,
    code: 'invalid_speech_request',
    message: 'Speech input is invalid.',
  }),
  provider: Object.freeze({
    status: 502,
    code: 'speech_provider_error',
    message: 'The speech provider could not complete the request.',
  }),
  timeout: Object.freeze({
    status: 504,
    code: 'speech_provider_timeout',
    message: 'The speech provider timed out.',
  }),
  cancelled: Object.freeze({
    status: 499,
    code: 'request_cancelled',
    message: 'The request was cancelled.',
  }),
});

function safeError(kind) {
  const value = SAFE_ERRORS[kind];
  return operationalError(value.status, value.code, value.message);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function finiteBetween(value, minimum, maximum) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function canonicalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function validProvenance(value) {
  return exactKeys(value, ['kind', 'catalogUrl', 'verifiedBy', 'verifiedAt', 'evidenceHash'])
    && value.kind === 'provider-stock'
    && validHttpsUrl(value.catalogUrl)
    && nonempty(value.verifiedBy)
    && canonicalDate(value.verifiedAt)
    && /^[0-9a-f]{64}$/.test(value.evidenceHash);
}

function validateStack(stack) {
  if (
    !exactKeys(stack, ['id', 'synthesis', 'transcription', 'zeroRetentionEntitled'])
    || !nonempty(stack.id)
    || !exactKeys(stack.transcription, ['model', 'provider'])
    || !exactKeys(stack.synthesis, ['model', 'provider'])
    || typeof stack.zeroRetentionEntitled !== 'boolean'
  ) {
    throw safeError('factoryConfiguration');
  }
  const transcription = stack.transcription;
  const synthesis = stack.synthesis;
  const openai = stack.id === 'openai-quality-v1'
    && transcription?.provider === 'openai'
    && transcription?.model === 'whisper-1'
    && synthesis?.provider === 'openai'
    && synthesis?.model === 'tts-1-hd'
    && stack.zeroRetentionEntitled === false;
  const elevenlabs = stack.id === 'elevenlabs-expressive-v1'
    && transcription?.provider === 'elevenlabs'
    && transcription?.model === 'scribe_v2'
    && synthesis?.provider === 'elevenlabs'
    && synthesis?.model === 'eleven_v3'
    && typeof stack.zeroRetentionEntitled === 'boolean';
  if (!openai && !elevenlabs) throw safeError('factoryConfiguration');
  return Object.freeze({
    provider: transcription.provider,
    transcriptionModel: transcription.model,
    synthesisModel: synthesis.model,
    zeroRetentionEntitled: elevenlabs && stack.zeroRetentionEntitled === true,
  });
}

function validateFactoryDependencies({ fetchImpl, readApiKey, timeoutMs, timers }) {
  if (typeof fetchImpl !== 'function' || typeof readApiKey !== 'function') {
    throw safeError('factoryConfiguration');
  }
  if (timeoutMs !== DEFAULT_TIMEOUT_MS) throw safeError('factoryConfiguration');
  if (
    !timers
    || typeof timers.setTimeout !== 'function'
    || typeof timers.clearTimeout !== 'function'
  ) {
    throw safeError('factoryConfiguration');
  }
}

function defaultTimers() {
  return Object.freeze({
    setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  });
}

function validateSignal(signal) {
  if (signal === undefined) return;
  if (
    !signal
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
  ) {
    throw safeError('input');
  }
}

async function withDeadline({ callerSignal, timeoutMs, timers }, operation) {
  validateSignal(callerSignal);
  if (callerSignal?.aborted) throw safeError('cancelled');

  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort();
  };
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeoutId = timers.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut) throw safeError('timeout');
    if (callerAborted || callerSignal?.aborted) throw safeError('cancelled');
    if (error instanceof OperationalError) throw error;
    throw safeError('provider');
  } finally {
    callerSignal?.removeEventListener('abort', onCallerAbort);
    timers.clearTimeout(timeoutId);
  }
}

function mimeFilename(mimeType) {
  if (mimeType.startsWith('audio/webm')) return 'audio.webm';
  if (mimeType.startsWith('audio/ogg')) return 'audio.ogg';
  return 'audio.wav';
}

function validateTranscriptionInput({ audio, mimeType, signal } = {}) {
  validateSignal(signal);
  if (!(audio instanceof Uint8Array) || audio.byteLength === 0 || !MEDIA_TYPES.has(mimeType)) {
    throw safeError('input');
  }
  return { audio, mimeType, signal };
}

function hasProviderControlSyntax(text) {
  return /\[[^\]\r\n]{1,120}\]/.test(text)
    || /<\/?[a-z][^>]*>/i.test(text)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
}

function validateCommonProfile(profile, stack) {
  return profile
    && typeof profile === 'object'
    && !Array.isArray(profile)
    && profile.status === 'reviewed'
    && Number.isInteger(profile.profileVersion)
    && profile.profileVersion > 0
    && profile.provider === stack.provider
    && profile.providerModel === stack.synthesisModel
    && nonempty(profile.voiceId)
    && profile.voiceId.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(profile.voiceId)
    && validProvenance(profile.voiceProvenance)
    && CADENCES.has(profile.cadence)
    && finiteBetween(profile.speakingRate, 0.75, 1.25)
    && profile.stageDirections === 'visual-only';
}

function reviewedVoiceSettings(profile, stack) {
  if (!validateCommonProfile(profile, stack)) throw safeError('input');

  if (stack.provider === 'openai') {
    if (
      profile.adapterMappingVersion !== 'openai-tts-1-hd-v1'
      || !OPENAI_STOCK_VOICES.has(profile.voiceId)
      || !exactKeys(profile.providerSettings, ['speed'])
      || profile.providerSettings.speed !== profile.speakingRate
    ) {
      throw safeError('input');
    }
    return Object.freeze({ speed: profile.providerSettings.speed });
  }

  const settings = profile.providerSettings;
  if (
    profile.adapterMappingVersion !== 'eleven-v3-v1'
    || !exactKeys(settings, [
      'speed',
      'stability',
      'similarity_boost',
      'style',
      'use_speaker_boost',
    ])
    || settings.speed !== profile.speakingRate
    || !finiteBetween(settings.speed, 0.7, 1.2)
    || ![0, 0.5, 1].includes(settings.stability)
    || !finiteBetween(settings.similarity_boost, 0, 1)
    || !finiteBetween(settings.style, 0, 1)
    || typeof settings.use_speaker_boost !== 'boolean'
  ) {
    throw safeError('input');
  }
  return Object.freeze({
    speed: settings.speed,
    stability: settings.stability,
    similarity_boost: settings.similarity_boost,
    style: settings.style,
    use_speaker_boost: settings.use_speaker_boost,
  });
}

function validateSynthesisInput({ text, profile, signal } = {}, stack) {
  validateSignal(signal);
  if (
    !nonempty(text)
    || [...text].length > SYNTHESIS_CODE_POINT_LIMIT
    || hasProviderControlSyntax(text)
  ) {
    throw safeError('input');
  }
  const settings = reviewedVoiceSettings(profile, stack);
  return { text, profile, settings, signal };
}

async function providerFetch(fetchImpl, url, options) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch {
    throw safeError('provider');
  }
  if (!(response instanceof Response) || !response.ok) throw safeError('provider');
  return response;
}

function mediaType(response) {
  return (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Deliberately discard provider cancellation details.
  }
}

async function readBounded(response, maximumBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await cancelBody(response);
    throw safeError('provider');
  }
  if (!response.body || typeof response.body.getReader !== 'function') throw safeError('provider');

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw safeError('provider');
      total += value.byteLength;
      if (total > maximumBytes) {
        try { await reader.cancel(); } catch { /* discard provider details */ }
        throw safeError('provider');
      }
      chunks.push(value);
    }
  } catch {
    throw safeError('provider');
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function readJson(response) {
  if (mediaType(response) !== 'application/json') {
    await cancelBody(response);
    throw safeError('provider');
  }
  const bytes = await readBounded(response, TRANSCRIPTION_JSON_LIMIT);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw safeError('provider');
  }
}

function milliseconds(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    throw safeError('provider');
  }
  const value = Math.ceil(Number((seconds * 1_000).toFixed(6)));
  if (!Number.isSafeInteger(value) || value <= 0) throw safeError('provider');
  return value;
}

function transcriptText(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw safeError('provider');
  return value;
}

function parseOpenAiTranscript(value) {
  const text = transcriptText(value.text);
  if (!nonempty(value.language)) throw safeError('provider');
  const durationMilliseconds = milliseconds(value.duration);
  let usage = null;
  if (value.usage !== undefined) {
    if (
      !exactKeys(value.usage, ['seconds', 'type'])
      || value.usage.type !== 'duration'
    ) {
      throw safeError('provider');
    }
    usage = Object.freeze({ milliseconds: milliseconds(value.usage.seconds) });
  }
  return Object.freeze({
    text,
    durationMilliseconds,
    usage,
  });
}

function parseElevenLabsTranscript(value) {
  const text = transcriptText(value.text);
  if (!Array.isArray(value.words) || value.words.length === 0) throw safeError('provider');
  let lastEnd = null;
  for (const word of value.words) {
    if (!word || typeof word !== 'object') throw safeError('provider');
    const { start, end } = word;
    if (start === null && end === null) continue;
    if (
      typeof start !== 'number'
      || !Number.isFinite(start)
      || start < 0
      || typeof end !== 'number'
      || !Number.isFinite(end)
      || end < start
    ) {
      throw safeError('provider');
    }
    lastEnd = Math.max(lastEnd ?? 0, end);
  }
  if (lastEnd === null || lastEnd <= 0) throw safeError('provider');
  return Object.freeze({ text, durationMilliseconds: milliseconds(lastEnd), usage: null });
}

function mp3Signature(bytes) {
  return bytes.byteLength >= 3
    && bytes[0] === 0x49
    && bytes[1] === 0x44
    && bytes[2] === 0x33
    || bytes.byteLength >= 2
      && bytes[0] === 0xff
      && (bytes[1] & 0xe0) === 0xe0;
}

async function readMp3(response) {
  if (mediaType(response) !== 'audio/mpeg') {
    await cancelBody(response);
    throw safeError('provider');
  }
  const bytes = await readBounded(response, SYNTHESIS_AUDIO_LIMIT);
  if (!mp3Signature(bytes)) throw safeError('provider');
  return bytes;
}

function boundedJson(value) {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > SYNTHESIS_JSON_LIMIT) throw safeError('input');
  return json;
}

function transcribeOpenAi({ fetchImpl, key, model }, input, deadline) {
  const form = new FormData();
  form.append('file', new Blob([input.audio], { type: input.mimeType }), mimeFilename(input.mimeType));
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  return deadline(async (signal) => {
    const response = await providerFetch(fetchImpl, `${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal,
    });
    return parseOpenAiTranscript(await readJson(response));
  });
}

function transcribeElevenLabs({ fetchImpl, key, model, zeroRetentionEntitled }, input, deadline) {
  const form = new FormData();
  form.append('file', new Blob([input.audio], { type: input.mimeType }), mimeFilename(input.mimeType));
  form.append('model_id', model);
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  const url = zeroRetentionEntitled
    ? `${ELEVENLABS_BASE_URL}/speech-to-text?enable_logging=false`
    : `${ELEVENLABS_BASE_URL}/speech-to-text`;
  return deadline(async (signal) => {
    const response = await providerFetch(fetchImpl, url, {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: form,
      signal,
    });
    return parseElevenLabsTranscript(await readJson(response));
  });
}

function synthesizeOpenAi({ fetchImpl, key, model }, input, deadline) {
  const body = boundedJson({
    model,
    input: input.text,
    voice: input.profile.voiceId,
    response_format: 'mp3',
    speed: input.settings.speed,
  });
  return deadline(async (signal) => {
    const response = await providerFetch(fetchImpl, `${OPENAI_BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body,
      signal,
    });
    const audio = await readMp3(response);
    return Object.freeze({
      audio,
      contentType: 'audio/mpeg',
      usage: Object.freeze({ characters: [...input.text].length }),
    });
  });
}

function synthesizeElevenLabs({ fetchImpl, key, model, zeroRetentionEntitled }, input, deadline) {
  const body = boundedJson({
    text: input.text,
    model_id: model,
    voice_settings: input.settings,
  });
  const voiceId = encodeURIComponent(input.profile.voiceId);
  const retentionQuery = zeroRetentionEntitled ? '&enable_logging=false' : '';
  return deadline(async (signal) => {
    const response = await providerFetch(
      fetchImpl,
      `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=mp3_44100_128${retentionQuery}`,
      {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': key,
        },
        body,
        signal,
      },
    );
    const audio = await readMp3(response);
    return Object.freeze({
      audio,
      contentType: 'audio/mpeg',
      usage: Object.freeze({ characters: [...input.text].length }),
    });
  });
}

export function createSpeechProvider({
  stack,
  fetchImpl,
  readApiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  timers = defaultTimers(),
} = {}) {
  const selected = validateStack(stack);
  validateFactoryDependencies({ fetchImpl, readApiKey, timeoutMs, timers });

  return Object.freeze({
    async prepare() {
      let rawKey;
      try {
        rawKey = await readApiKey(selected.provider);
      } catch {
        throw safeError('configuration');
      }
      if (!nonempty(rawKey)) throw safeError('configuration');
      const key = rawKey.trim();
      const providerInput = Object.freeze({
        fetchImpl,
        key,
        model: selected.transcriptionModel,
        zeroRetentionEntitled: selected.zeroRetentionEntitled,
      });
      const synthesisInput = Object.freeze({
        fetchImpl,
        key,
        model: selected.synthesisModel,
        zeroRetentionEntitled: selected.zeroRetentionEntitled,
      });
      const deadline = (operation, signal) => withDeadline(
        { callerSignal: signal, timeoutMs, timers },
        operation,
      );

      return Object.freeze({
        async transcribe(rawInput) {
          const input = validateTranscriptionInput(rawInput);
          const run = (operation) => deadline(operation, input.signal);
          return selected.provider === 'openai'
            ? transcribeOpenAi(providerInput, input, run)
            : transcribeElevenLabs(providerInput, input, run);
        },

        async synthesize(rawInput) {
          const input = validateSynthesisInput(rawInput, selected);
          const run = (operation) => deadline(operation, input.signal);
          return selected.provider === 'openai'
            ? synthesizeOpenAi(synthesisInput, input, run)
            : synthesizeElevenLabs(synthesisInput, input, run);
        },
      });
    },
  });
}
