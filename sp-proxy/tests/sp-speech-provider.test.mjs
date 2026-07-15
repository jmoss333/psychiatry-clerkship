import assert from 'node:assert/strict';
import test from 'node:test';

import { createSpeechProvider } from '../netlify/functions/_shared/sp-speech-provider.mjs';
import { operationalError } from '../netlify/functions/_shared/sp-http.mjs';
import {
  createFakeSpeechProvider,
  createProviderBarrier,
} from './helpers/fake-speech-provider.mjs';

const JSON_LIMIT = 256 * 1024;
const AUDIO_LIMIT = 10 * 1024 * 1024;
const SENTINEL_KEY = 'sk-sentinel-must-never-leak';
const SENTINEL_BODY = 'provider-secret-body-must-never-leak';

function openAiStack() {
  return {
    id: 'openai-quality-v1',
    zeroRetentionEntitled: false,
    transcription: { provider: 'openai', model: 'whisper-1' },
    synthesis: { provider: 'openai', model: 'tts-1-hd' },
  };
}

function elevenLabsStack({ zeroRetentionEntitled = false } = {}) {
  return {
    id: 'elevenlabs-expressive-v1',
    zeroRetentionEntitled,
    transcription: {
      provider: 'elevenlabs',
      model: 'scribe_v2',
    },
    synthesis: { provider: 'elevenlabs', model: 'eleven_v3' },
  };
}

function provenance() {
  return {
    kind: 'provider-stock',
    catalogUrl: 'https://provider.example.test/stock-voices/alloy',
    verifiedBy: 'Faculty voice reviewer',
    verifiedAt: '2026-07-15',
    evidenceHash: 'ab'.repeat(32),
  };
}

function openAiProfile(overrides = {}) {
  return {
    id: 'dana-measured-v2',
    status: 'reviewed',
    profileVersion: 2,
    provider: 'openai',
    providerModel: 'tts-1-hd',
    voiceId: 'alloy',
    voiceProvenance: provenance(),
    cadence: 'measured-flat',
    speakingRate: 0.95,
    adapterMappingVersion: 'openai-tts-1-hd-v1',
    providerSettings: { speed: 0.95 },
    stageDirections: 'visual-only',
    ...overrides,
  };
}

function elevenLabsProfile(overrides = {}) {
  return {
    id: 'ray-guarded-v2',
    status: 'reviewed',
    profileVersion: 2,
    provider: 'elevenlabs',
    providerModel: 'eleven_v3',
    voiceId: 'voice /?#',
    voiceProvenance: provenance(),
    cadence: 'guarded-halting',
    speakingRate: 0.85,
    adapterMappingVersion: 'eleven-v3-v1',
    providerSettings: {
      speed: 0.85,
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.2,
      use_speaker_boost: true,
    },
    stageDirections: 'visual-only',
    ...overrides,
  };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });
}

function mp3Response(bytes = Uint8Array.of(0x49, 0x44, 0x33, 0x04, 0x00)) {
  return new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } });
}

function oneByteChunkResponse(bytes, contentType) {
  let offset = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(Uint8Array.of(bytes[offset]));
      offset += 1;
    },
  }), { headers: { 'content-type': contentType } });
}

function zeroProgressResponse(bytes, contentType) {
  let step = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (step === 0) controller.enqueue(new Uint8Array());
      else if (step === 1) controller.enqueue(bytes);
      else controller.close();
      step += 1;
    },
  }), { headers: { 'content-type': contentType } });
}

function createFetch(responses) {
  const queue = [...responses];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(url, options);
    assert.ok(next, 'unexpected provider retry');
    return next;
  };
  return { fetchImpl, calls };
}

function createTimers() {
  const pending = new Map();
  const calls = [];
  let sequence = 0;
  return {
    api: {
      setTimeout(callback, milliseconds) {
        const id = ++sequence;
        calls.push({ method: 'setTimeout', milliseconds, id });
        pending.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        calls.push({ method: 'clearTimeout', id });
        pending.delete(id);
      },
    },
    calls,
    fire() {
      for (const callback of [...pending.values()]) callback();
    },
    get pendingCount() { return pending.size; },
  };
}

async function prepared({ stack, responses, readApiKey, timeoutMs = 45_000, timers } = {}) {
  const network = createFetch(responses ?? []);
  const provider = createSpeechProvider({
    stack: stack ?? openAiStack(),
    fetchImpl: network.fetchImpl,
    readApiKey: readApiKey ?? (() => SENTINEL_KEY),
    timeoutMs,
    timers,
  });
  return { provider, adapter: await provider.prepare(), network };
}

function audioInput() {
  return { audio: Uint8Array.of(1, 2, 3, 4), mimeType: 'audio/webm' };
}

function assertOperationalError(error, { status, code }) {
  assert.equal(error?.name, 'OperationalError');
  assert.equal(error?.status, status);
  assert.equal(error?.code, code);
  assert.doesNotMatch(error?.message ?? '', /sentinel|secret-body|sk-/i);
  return true;
}

test('construction is frozen, credential-lazy, and prepare reads only the active provider key', async () => {
  const reads = [];
  const provider = createSpeechProvider({
    stack: openAiStack(),
    fetchImpl: async () => { throw new Error('not called'); },
    readApiKey(providerName) {
      reads.push(providerName);
      return SENTINEL_KEY;
    },
    timeoutMs: 45_000,
  });

  assert.equal(Object.isFrozen(provider), true);
  assert.deepEqual(reads, []);
  const adapter = await provider.prepare();
  assert.deepEqual(reads, ['openai']);
  assert.equal(Object.isFrozen(adapter), true);
  assert.deepEqual(Object.keys(adapter).sort(), ['synthesize', 'transcribe']);
  assert.doesNotMatch(JSON.stringify(adapter), /sentinel|sk-/i);
});

test('missing or blank active credential fails safely before fetch', async () => {
  for (const value of [undefined, null, '', '   ']) {
    let fetchCalls = 0;
    const provider = createSpeechProvider({
      stack: openAiStack(),
      fetchImpl: async () => { fetchCalls += 1; },
      readApiKey: () => value,
      timeoutMs: 45_000,
    });
    await assert.rejects(
      provider.prepare(),
      (error) => assertOperationalError(error, { status: 503, code: 'invalid_configuration' }),
    );
    assert.equal(fetchCalls, 0);
  }
});

test('OpenAI transcription sends exact Whisper multipart fields and converts display and usage seconds', async () => {
  const { adapter, network } = await prepared({
    responses: [jsonResponse({
      text: 'What brings you in?',
      language: 'en',
      duration: 8.47,
      usage: { type: 'duration', seconds: 9 },
    })],
  });

  const result = await adapter.transcribe(audioInput());

  assert.deepEqual(result, {
    text: 'What brings you in?',
    durationMilliseconds: 8_470,
    usage: { milliseconds: 9_000 },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(network.calls.length, 1);
  const [{ url, options }] = network.calls;
  assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(options.method, 'POST');
  assert.deepEqual([...new Headers(options.headers)], [['authorization', `Bearer ${SENTINEL_KEY}`]]);
  assert.equal(options.body instanceof FormData, true);
  assert.deepEqual([...options.body.keys()], ['file', 'model', 'response_format']);
  assert.equal(options.body.get('model'), 'whisper-1');
  assert.equal(options.body.get('response_format'), 'verbose_json');
  assert.equal(options.body.get('file') instanceof Blob, true);
  assert.equal(options.body.get('file').type, 'audio/webm');
  assert.equal(network.calls.length, 1, 'provider calls are never retried');
});

test('OpenAI synthesis sends only the reviewed TTS fields and returns exact character usage', async () => {
  const { adapter, network } = await prepared({ responses: [mp3Response()] });
  const text = 'I have not been sleeping.';

  const result = await adapter.synthesize({ text, profile: openAiProfile() });

  assert.equal(result.contentType, 'audio/mpeg');
  assert.deepEqual(result.audio, Uint8Array.of(0x49, 0x44, 0x33, 0x04, 0x00));
  assert.deepEqual(result.usage, { characters: [...text].length });
  assert.equal(Object.isFrozen(result), true);
  const [{ url, options }] = network.calls;
  assert.equal(url, 'https://api.openai.com/v1/audio/speech');
  assert.deepEqual([...new Headers(options.headers)], [
    ['authorization', `Bearer ${SENTINEL_KEY}`],
    ['content-type', 'application/json'],
  ]);
  assert.deepEqual(JSON.parse(options.body), {
    model: 'tts-1-hd',
    input: text,
    voice: 'alloy',
    response_format: 'mp3',
    speed: 0.95,
  });
  assert.equal(JSON.stringify(options.body).includes('cadence'), false);
  assert.equal(JSON.stringify(options.body).includes('provenance'), false);
});

test('provider media allowlist accepts Ogg Opus exactly and rejects unvetted MP4 before fetch', async () => {
  const ogg = await prepared({
    responses: [jsonResponse({ text: 'Test.', language: 'en', duration: 1 })],
  });
  await ogg.adapter.transcribe({
    audio: Uint8Array.of(1, 2, 3),
    mimeType: 'audio/ogg;codecs=opus',
  });
  const file = ogg.network.calls[0].options.body.get('file');
  assert.equal(file.type, 'audio/ogg;codecs=opus');
  assert.equal(file.name, 'audio.ogg');

  const mp4 = await prepared({ responses: [] });
  await assert.rejects(
    mp4.adapter.transcribe({ audio: Uint8Array.of(1), mimeType: 'audio/mp4' }),
    (error) => assertOperationalError(error, { status: 400, code: 'invalid_speech_request' }),
  );
  assert.equal(mp4.network.calls.length, 0);
});

test('OpenAI synthesis counts Unicode code points and bounds the 16 KiB request JSON', async () => {
  const { adapter, network } = await prepared({ responses: [mp3Response()] });
  await assert.rejects(
    adapter.synthesize({ text: 'a'.repeat(4_097), profile: openAiProfile() }),
    (error) => assertOperationalError(error, { status: 400, code: 'invalid_speech_request' }),
  );
  await assert.rejects(
    adapter.synthesize({ text: '😀'.repeat(4_096), profile: openAiProfile() }),
    (error) => assertOperationalError(error, { status: 400, code: 'invalid_speech_request' }),
  );
  assert.equal(network.calls.length, 0);
});

test('ElevenLabs transcription sends the exact Scribe v2 fields without unreviewed logging options', async () => {
  const { adapter, network } = await prepared({
    stack: elevenLabsStack(),
    responses: [jsonResponse({
      text: 'I feel safe right now.',
      words: [
        { text: 'I', start: 0, end: 0.2, type: 'word' },
        { text: 'safe', start: 1.25, end: 1.75, type: 'word' },
      ],
    })],
  });

  const result = await adapter.transcribe({ ...audioInput(), mimeType: 'audio/ogg' });

  assert.deepEqual(result, {
    text: 'I feel safe right now.',
    durationMilliseconds: 1_750,
    usage: null,
  });
  const [{ url, options }] = network.calls;
  assert.equal(url, 'https://api.elevenlabs.io/v1/speech-to-text');
  assert.deepEqual([...new Headers(options.headers)], [['xi-api-key', SENTINEL_KEY]]);
  assert.deepEqual([...options.body.keys()], ['file', 'model_id', 'tag_audio_events', 'diarize']);
  assert.equal(options.body.get('model_id'), 'scribe_v2');
  assert.equal(options.body.get('tag_audio_events'), 'false');
  assert.equal(options.body.get('diarize'), 'false');
  assert.equal(options.body.has('enable_logging'), false);
  assert.equal(options.body.has('webhook'), false);
  assert.equal(options.body.has('num_speakers'), false);
});

test('ElevenLabs sends enable_logging=false only with an explicit reviewed entitlement pin', async () => {
  const { adapter, network } = await prepared({
    stack: elevenLabsStack({ zeroRetentionEntitled: true }),
    responses: [
      jsonResponse({ text: 'Test.', words: [{ start: 0, end: 0.5, text: 'Test.' }] }),
      mp3Response(Uint8Array.of(0xff, 0xfb, 0x90, 0x64)),
    ],
  });
  await adapter.transcribe(audioInput());
  await adapter.synthesize({ text: 'Test.', profile: elevenLabsProfile() });
  assert.deepEqual([...network.calls[0].options.body.keys()], [
    'file',
    'model_id',
    'tag_audio_events',
    'diarize',
  ]);
  assert.equal(
    network.calls[0].url,
    'https://api.elevenlabs.io/v1/speech-to-text?enable_logging=false',
  );
  assert.equal(network.calls[0].options.body.has('enable_logging'), false);
  assert.equal(
    network.calls[1].url,
    'https://api.elevenlabs.io/v1/text-to-speech/voice%20%2F%3F%23?output_format=mp3_44100_128&enable_logging=false',
  );
});

test('Eleven v3 synthesis encodes the voice ID and sends only exact reviewed settings', async () => {
  const { adapter, network } = await prepared({
    stack: elevenLabsStack(),
    responses: [mp3Response(Uint8Array.of(0xff, 0xfb, 0x90, 0x64))],
  });

  const result = await adapter.synthesize({ text: 'Could you ask that again?', profile: elevenLabsProfile() });

  assert.deepEqual(result.usage, { characters: 25 });
  const [{ url, options }] = network.calls;
  assert.equal(
    url,
    'https://api.elevenlabs.io/v1/text-to-speech/voice%20%2F%3F%23?output_format=mp3_44100_128',
  );
  assert.deepEqual([...new Headers(options.headers)], [
    ['accept', 'audio/mpeg'],
    ['content-type', 'application/json'],
    ['xi-api-key', SENTINEL_KEY],
  ]);
  assert.deepEqual(JSON.parse(options.body), {
    text: 'Could you ask that again?',
    model_id: 'eleven_v3',
    voice_settings: {
      speed: 0.85,
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.2,
      use_speaker_boost: true,
    },
  });
});

test('profile validation rejects mismatches, non-stock provenance, unsupported settings, and speed above 1.2', async () => {
  const invalidProfiles = [
    openAiProfile({ provider: 'elevenlabs' }),
    openAiProfile({ providerModel: 'eleven_v3' }),
    openAiProfile({ voiceId: '' }),
    openAiProfile({ voiceId: 'custom-voice-id' }),
    openAiProfile({ voiceId: 'alloy\nforged-header' }),
    openAiProfile({ cadence: 'melodramatic' }),
    openAiProfile({ adapterMappingVersion: 'unreviewed-v9' }),
    openAiProfile({ voiceProvenance: { ...provenance(), kind: 'cloned' } }),
    openAiProfile({ providerSettings: { speed: 0.95, pitch: 2 } }),
    openAiProfile({ speakingRate: 1, providerSettings: { speed: 0.95 } }),
  ];
  const openai = await prepared({ responses: [] });
  for (const profile of invalidProfiles) {
    await assert.rejects(
      openai.adapter.synthesize({ text: 'Safe text.', profile }),
      (error) => assertOperationalError(error, { status: 400, code: 'invalid_speech_request' }),
    );
  }

  const eleven = await prepared({ stack: elevenLabsStack(), responses: [] });
  for (const profile of [
    elevenLabsProfile({ speakingRate: 1.21, providerSettings: { ...elevenLabsProfile().providerSettings, speed: 1.21 } }),
    elevenLabsProfile({ providerSettings: { ...elevenLabsProfile().providerSettings, stability: 0.2 } }),
    elevenLabsProfile({ providerSettings: { ...elevenLabsProfile().providerSettings, extra: true } }),
  ]) {
    await assert.rejects(
      eleven.adapter.synthesize({ text: 'Safe text.', profile }),
      (error) => assertOperationalError(error, { status: 400, code: 'invalid_speech_request' }),
    );
  }
  assert.equal(openai.network.calls.length + eleven.network.calls.length, 0);
});

test('provider control syntax, bracketed directions, SSML-like tags, and blank text fail before fetch', async () => {
  const { adapter, network } = await prepared({ responses: [] });
  for (const text of ['', '   ', '[sighs] I am okay.', '[patient pauses]', '<speak>I am okay.</speak>', 'Wait <break time="1s"/> now.']) {
    await assert.rejects(
      adapter.synthesize({ text, profile: openAiProfile() }),
      (error) => assertOperationalError(error, { status: 400, code: 'invalid_speech_request' }),
    );
  }
  assert.equal(network.calls.length, 0);
});

test('unsupported provider/model pairs and mixed-provider stacks fail closed without reading a key', () => {
  const stacks = [
    { ...openAiStack(), id: 'unknown-stack-v1' },
    { ...openAiStack(), transcription: { provider: 'openai', model: 'gpt-4o-transcribe' } },
    { ...openAiStack(), synthesis: { provider: 'openai', model: 'tts-1' } },
    { ...openAiStack(), synthesis: { provider: 'elevenlabs', model: 'eleven_v3' } },
    { ...openAiStack(), zeroRetentionEntitled: true },
    { ...openAiStack(), zeroRetentionEntitled: 'false' },
    { ...openAiStack(), unexpected: 'must fail closed' },
    { ...openAiStack(), transcription: { ...openAiStack().transcription, unexpected: true } },
    (() => { const stack = elevenLabsStack(); delete stack.zeroRetentionEntitled; return stack; })(),
    { ...elevenLabsStack(), synthesis: { provider: 'elevenlabs', model: 'eleven_multilingual_v3' } },
  ];
  for (const stack of stacks) {
    let reads = 0;
    assert.throws(
      () => createSpeechProvider({
        stack,
        fetchImpl: async () => {},
        readApiKey: () => { reads += 1; return SENTINEL_KEY; },
        timeoutMs: 45_000,
      }),
      (error) => assertOperationalError(error, { status: 500, code: 'invalid_configuration' }),
    );
    assert.equal(reads, 0);
  }
});

test('caller abort and the single internal deadline compose without retry and always clear the timer', async () => {
  for (const mode of ['caller', 'timeout']) {
    const timers = createTimers();
    const network = createFetch([
      (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    ]);
    const provider = createSpeechProvider({
      stack: openAiStack(),
      fetchImpl: network.fetchImpl,
      readApiKey: () => SENTINEL_KEY,
      timeoutMs: 45_000,
      timers: timers.api,
    });
    const adapter = await provider.prepare();
    const caller = new AbortController();
    const pending = adapter.transcribe({ ...audioInput(), signal: caller.signal });
    if (mode === 'caller') caller.abort(new Error(SENTINEL_BODY));
    else timers.fire();
    await assert.rejects(
      pending,
      (error) => assertOperationalError(error, {
        status: mode === 'caller' ? 499 : 504,
        code: mode === 'caller' ? 'request_cancelled' : 'speech_provider_timeout',
      }),
    );
    assert.equal(network.calls.length, 1);
    assert.deepEqual(timers.calls[0], { method: 'setTimeout', milliseconds: 45_000, id: 1 });
    assert.equal(timers.calls.at(-1).method, 'clearTimeout');
    assert.equal(timers.pendingCount, 0);
  }
});

test('caller abort and timeout win even when injected fetch ignores the abort signal', async () => {
  for (const mode of ['caller', 'timeout']) {
    const timers = createTimers();
    let resolveFetch;
    const network = createFetch([
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    ]);
    const provider = createSpeechProvider({
      stack: openAiStack(),
      fetchImpl: network.fetchImpl,
      readApiKey: () => SENTINEL_KEY,
      timeoutMs: 45_000,
      timers: timers.api,
    });
    const adapter = await provider.prepare();
    const caller = new AbortController();
    const pending = adapter.transcribe({ ...audioInput(), signal: caller.signal });
    await Promise.resolve();
    if (mode === 'caller') caller.abort();
    else timers.fire();
    resolveFetch(jsonResponse({ text: 'must not succeed', language: 'en', duration: 1 }));
    await assert.rejects(
      pending,
      (error) => assertOperationalError(error, {
        status: mode === 'caller' ? 499 : 504,
        code: mode === 'caller' ? 'request_cancelled' : 'speech_provider_timeout',
      }),
    );
    assert.equal(network.calls.length, 1);
    assert.equal(timers.pendingCount, 0);
  }
});

test('successful calls clear the internal deadline', async () => {
  const timers = createTimers();
  const { adapter } = await prepared({
    responses: [jsonResponse({
      text: 'Test.',
      language: 'en',
      duration: 1,
      usage: { type: 'duration', seconds: 1 },
    })],
    timers: timers.api,
  });
  await adapter.transcribe(audioInput());
  assert.deepEqual(timers.calls.map(({ method }) => method), ['setTimeout', 'clearTimeout']);
  assert.equal(timers.pendingCount, 0);
});

test('non-2xx and network failures are one safe provider error with no key, body, transcript, or URL detail', async () => {
  for (const response of [
    new Response(SENTINEL_BODY, { status: 429, headers: { 'content-type': 'text/plain' } }),
    new Error(`${SENTINEL_KEY} ${SENTINEL_BODY} https://secret.example`),
    operationalError(500, 'unsafe_injected_error', `${SENTINEL_KEY} ${SENTINEL_BODY}`),
    new Response(new ReadableStream({
      start(controller) {
        controller.error(operationalError(500, 'unsafe_stream_error', SENTINEL_BODY));
      },
    }), { headers: { 'content-type': 'application/json' } }),
  ]) {
    const { adapter, network } = await prepared({ responses: [response] });
    await assert.rejects(
      adapter.transcribe(audioInput()),
      (error) => {
        assertOperationalError(error, { status: 502, code: 'speech_provider_error' });
        assert.doesNotMatch(error.message, /openai|eleven|https?:|transcript/i);
        return true;
      },
    );
    assert.equal(network.calls.length, 1);
  }
});

test('non-2xx provider responses cancel unread bodies without leaking provider content', async () => {
  let cancelCalls = 0;
  let pulls = 0;
  const response = new Response(new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode(SENTINEL_BODY));
    },
    cancel() {
      cancelCalls += 1;
    },
  }), {
    status: 500,
    headers: { 'content-type': 'text/plain' },
  });
  const { adapter } = await prepared({ responses: [response] });
  await assert.rejects(
    adapter.transcribe(audioInput()),
    (error) => {
      assertOperationalError(error, { status: 502, code: 'speech_provider_error' });
      assert.doesNotMatch(error.message, /provider-secret|secret-body/i);
      return true;
    },
  );
  assert.equal(cancelCalls, 1);
  assert.equal(pulls <= 1, true);
  assert.equal(response.body.locked, false);
});

test('OpenAI transcription accepts absent optional usage but requires language and duration-typed usage', async () => {
  const withoutUsage = await prepared({
    responses: [jsonResponse({ text: 'Test.', language: 'en', duration: 8.47 })],
  });
  assert.deepEqual(await withoutUsage.adapter.transcribe(audioInput()), {
    text: 'Test.',
    durationMilliseconds: 8_470,
    usage: null,
  });

  for (const value of [
    { text: 'Test.', duration: 1 },
    { text: 'Test.', language: '', duration: 1 },
    { text: 'Test.', language: 'en', duration: 1, usage: { type: 'tokens', seconds: 1 } },
    { text: 'Test.', language: 'en', duration: 1, usage: { seconds: 1 } },
    {
      text: 'Test.',
      language: 'en',
      duration: 1,
      usage: { type: 'duration', seconds: 1, extra: 'must fail closed' },
    },
  ]) {
    const { adapter } = await prepared({ responses: [jsonResponse(value)] });
    await assert.rejects(
      adapter.transcribe(audioInput()),
      (error) => assertOperationalError(error, { status: 502, code: 'speech_provider_error' }),
    );
  }
});

test('transcription requires bounded JSON and validated text, duration, and usage', async () => {
  const invalid = [
    new Response('not-json', { headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify({ text: 'x', language: 'en', duration: 1, usage: { type: 'duration', seconds: 1 } }), { headers: { 'content-type': 'text/plain' } }),
    jsonResponse({ text: '', language: 'en', duration: 1, usage: { type: 'duration', seconds: 1 } }),
    jsonResponse({ text: SENTINEL_BODY, language: 'en', duration: 0, usage: { type: 'duration', seconds: 1 } }),
    jsonResponse({ text: SENTINEL_BODY, language: 'en', duration: 1, usage: { type: 'duration', seconds: Number.NaN } }),
    new Response(`{"text":"${'x'.repeat(JSON_LIMIT)}"}`, { headers: { 'content-type': 'application/json' } }),
  ];
  for (const response of invalid) {
    const { adapter } = await prepared({ responses: [response] });
    await assert.rejects(
      adapter.transcribe(audioInput()),
      (error) => assertOperationalError(error, { status: 502, code: 'speech_provider_error' }),
    );
  }
});

test('200,000 one-byte JSON chunks stay within a 64 MiB heap through the full adapter', async () => {
  const value = {
    text: 'Tiny chunks still produce one transcript.',
    language: 'en',
    duration: 8.47,
    usage: { type: 'duration', seconds: 9 },
  };
  const json = JSON.stringify(value).padEnd(200_000, ' ');
  const response = oneByteChunkResponse(new TextEncoder().encode(json), 'application/json');
  const { adapter } = await prepared({ responses: [response] });
  assert.deepEqual(await adapter.transcribe(audioInput()), {
    text: value.text,
    durationMilliseconds: 8_470,
    usage: { milliseconds: 9_000 },
  });
});

test('ElevenLabs transcription rejects malformed word timing and never treats it as trusted usage', async () => {
  for (const words of [[], [{ start: 1, end: 0.5 }], [{ start: 0, end: 'secret' }]]) {
    const { adapter } = await prepared({
      stack: elevenLabsStack(),
      responses: [jsonResponse({ text: SENTINEL_BODY, words })],
    });
    await assert.rejects(
      adapter.transcribe(audioInput()),
      (error) => assertOperationalError(error, { status: 502, code: 'speech_provider_error' }),
    );
  }
});

test('synthesis streams at most 10 MiB and validates type, nonempty body, and MP3 signature', async () => {
  let cancelled = false;
  const oversized = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(6 * 1024 * 1024));
      controller.enqueue(new Uint8Array(5 * 1024 * 1024));
    },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'audio/mpeg' } });
  const invalid = [
    new Response(Uint8Array.of(0x49, 0x44, 0x33), { headers: { 'content-type': 'application/octet-stream' } }),
    new Response(new Uint8Array(), { headers: { 'content-type': 'audio/mpeg' } }),
    new Response(Uint8Array.of(1, 2, 3), { headers: { 'content-type': 'audio/mpeg' } }),
    oversized,
  ];
  for (const response of invalid) {
    const { adapter } = await prepared({ responses: [response] });
    await assert.rejects(
      adapter.synthesize({ text: 'Safe text.', profile: openAiProfile() }),
      (error) => assertOperationalError(error, { status: 502, code: 'speech_provider_error' }),
    );
  }
  assert.equal(cancelled, true);
  assert.equal(AUDIO_LIMIT, 10_485_760);
});

test('300,000 one-byte MP3 chunks stay within a 64 MiB heap through the full adapter', async () => {
  const audio = new Uint8Array(300_000);
  audio.set(Uint8Array.of(0x49, 0x44, 0x33), 0);
  const response = oneByteChunkResponse(audio, 'audio/mpeg');
  const { adapter } = await prepared({ responses: [response] });
  const result = await adapter.synthesize({ text: 'Safe text.', profile: openAiProfile() });
  assert.equal(result.audio.byteLength, 300_000);
  assert.deepEqual(result.audio.subarray(0, 3), Uint8Array.of(0x49, 0x44, 0x33));
  assert.deepEqual(result.usage, { characters: 10 });
});

test('zero-progress provider JSON and audio chunks fail closed', async () => {
  const transcript = new TextEncoder().encode(JSON.stringify({
    text: 'This must not be accepted after an empty chunk.',
    language: 'en',
    duration: 1,
  }));
  const transcriber = await prepared({
    responses: [zeroProgressResponse(transcript, 'application/json')],
  });
  await assert.rejects(
    transcriber.adapter.transcribe(audioInput()),
    (error) => assertOperationalError(error, { status: 502, code: 'speech_provider_error' }),
  );

  const synthesizer = await prepared({
    responses: [zeroProgressResponse(
      Uint8Array.of(0x49, 0x44, 0x33, 0x04, 0x00),
      'audio/mpeg',
    )],
  });
  await assert.rejects(
    synthesizer.adapter.synthesize({ text: 'Safe text.', profile: openAiProfile() }),
    (error) => assertOperationalError(error, { status: 502, code: 'speech_provider_error' }),
  );
});

test('the adapter never falls through to global network access', async () => {
  const originalFetch = globalThis.fetch;
  let globalCalls = 0;
  globalThis.fetch = async () => {
    globalCalls += 1;
    throw new Error('network deny');
  };
  try {
    const { adapter, network } = await prepared({
      responses: [jsonResponse({
        text: 'Test.',
        language: 'en',
        duration: 1,
        usage: { type: 'duration', seconds: 1 },
      })],
    });
    await adapter.transcribe(audioInput());
    assert.equal(network.calls.length, 1);
    assert.equal(globalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fake provider supports deterministic counts, barriers, and errors without retaining content', async () => {
  const barrier = createProviderBarrier();
  const fake = createFakeSpeechProvider({ barriers: { transcribe: barrier.promise } });
  const adapter = await fake.provider.prepare();
  const pending = adapter.transcribe({ audio: Uint8Array.of(7), text: SENTINEL_BODY });
  assert.deepEqual(fake.calls, { prepare: 1, transcribe: 1, synthesize: 0 });
  assert.doesNotMatch(JSON.stringify(fake), /sentinel|secret-body|Deterministic test transcript/i);
  barrier.release();
  assert.equal((await pending).text, 'Deterministic test transcript.');
  await adapter.synthesize({ text: SENTINEL_BODY });
  assert.deepEqual(fake.calls, { prepare: 1, transcribe: 1, synthesize: 1 });

  const expected = new Error('controlled fake failure');
  const failing = createFakeSpeechProvider({ synthesizeError: expected });
  await assert.rejects((await failing.provider.prepare()).synthesize({}), expected);
});
