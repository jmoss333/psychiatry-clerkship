import assert from 'node:assert/strict';
import test from 'node:test';

import SPInterviewVoice from '../sp-interview.voice.js';

const VOICE_ENDPOINT = 'https://proxy.example.test/api/sp/voice';
const STUDENT_KEY = 'student-test-key';
const CASE_ID = 'sp_depression_gated_si_001';
const ENCOUNTER_ID = 'AAECAwQFBgcICQoLDA0ODw';
const SECOND_ENCOUNTER_ID = 'EBESExQVFhcYGRobHB0eHw';
const FIRST_CAPTURE_ID = 'ICEiIyQlJicoKSorLC0uLw';
const SECOND_CAPTURE_ID = 'MDEyMzQ1Njc4OTo7PD0-Pw';
const MIME_TYPE = 'audio/webm;codecs=opus';

function bytes(start) {
  return Uint8Array.from({ length: 16 }, (_, index) => start + index);
}

function sequenceRandom(starts) {
  const calls = [];
  let index = 0;
  return {
    calls,
    randomBytes(size) {
      calls.push(size);
      assert.equal(size, 16, 'opaque identifiers must use exactly 16 random bytes');
      if (index >= starts.length) throw new Error('random sequence exhausted');
      return bytes(starts[index++]);
    },
  };
}

function requireManagedTransport(options) {
  assert.equal(
    typeof SPInterviewVoice.createManagedTransport,
    'function',
    'SPInterviewVoice.createManagedTransport must implement the reviewed transport contract',
  );
  return SPInterviewVoice.createManagedTransport({
    voiceEndpoint: VOICE_ENDPOINT,
    getStudentKey: () => STUDENT_KEY,
    ...options,
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function headerObject(headers) {
  return Object.fromEntries(new Headers(headers).entries());
}

test('transcription sends the original allowlisted Blob with exact identity headers and caller signal', async () => {
  const calls = [];
  const random = sequenceRandom([32]);
  const transport = requireManagedTransport({
    randomBytes: random.randomBytes,
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return jsonResponse({ text: 'Could you tell me more?', durationMilliseconds: 812 });
    },
  });
  const audio = new Blob([Uint8Array.of(0x4f, 0x67, 0x67, 0x53)], { type: MIME_TYPE });
  const abort = new AbortController();

  const result = await transport.transcribe({
    audio,
    mimeType: MIME_TYPE,
    caseId: CASE_ID,
    encounterId: ENCOUNTER_ID,
    turnId: 3,
    signal: abort.signal,
  });

  assert.equal(result.text, 'Could you tell me more?');
  assert.equal(calls.length, 1, 'the transport never retries a provider operation');
  assert.equal(calls[0].url, `${VOICE_ENDPOINT}?op=transcribe`);
  assert.equal(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.body, audio, 'the finalized Blob must remain byte-identical');
  assert.equal(calls[0].init.body instanceof FormData, false);
  assert.equal(typeof calls[0].init.body, 'object', 'audio must never be base64 text');
  assert.strictEqual(calls[0].init.signal, abort.signal);
  assert.deepEqual(headerObject(calls[0].init.headers), {
    'content-type': MIME_TYPE,
    'x-sp-capture-id': FIRST_CAPTURE_ID,
    'x-sp-case-id': CASE_ID,
    'x-sp-encounter-id': ENCOUNTER_ID,
    'x-sp-turn-id': '3',
    'x-student-key': STUDENT_KEY,
  });
  assert.deepEqual(random.calls, [16]);
});

test('a caller retry reuses the same Blob capture ID while a new recording rotates it', async () => {
  const captureIds = [];
  const random = sequenceRandom([32, 48]);
  const transport = requireManagedTransport({
    randomBytes: random.randomBytes,
    async fetchImpl(url, init) {
      captureIds.push(new Headers(init.headers).get('x-sp-capture-id'));
      return jsonResponse({ text: 'editable draft', durationMilliseconds: 250 });
    },
  });
  const firstRecording = new Blob([Uint8Array.of(1, 2, 3)], { type: 'audio/wav' });
  const secondRecording = new Blob([Uint8Array.of(1, 2, 3)], { type: 'audio/wav' });
  const common = {
    mimeType: 'audio/wav',
    caseId: CASE_ID,
    encounterId: ENCOUNTER_ID,
    turnId: 1,
  };

  await transport.transcribe({ ...common, audio: firstRecording });
  await transport.transcribe({ ...common, audio: firstRecording });
  await transport.transcribe({ ...common, audio: secondRecording });

  assert.deepEqual(captureIds, [FIRST_CAPTURE_ID, FIRST_CAPTURE_ID, SECOND_CAPTURE_ID]);
  assert.deepEqual(random.calls, [16, 16], 'a WeakMap-backed same-Blob retry must not consume randomness');
  assert.notStrictEqual(firstRecording, secondRecording, 'capture identity follows the Blob object, not its bytes');
});

test('synthesis sends only reply and ticket, requests audio, and returns bytes with MIME type', async () => {
  const calls = [];
  const expectedBytes = Uint8Array.of(0x49, 0x44, 0x33, 0x04);
  const transport = requireManagedTransport({
    randomBytes: sequenceRandom([0]).randomBytes,
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return new Response(expectedBytes, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'cache-control': 'no-store',
        },
      });
    },
  });
  const abort = new AbortController();

  const result = await transport.synthesize({
    text: '*looks down* I am tired.',
    ticket: 'signed-ticket',
    caseId: CASE_ID,
    encounterId: ENCOUNTER_ID,
    turnId: 4,
    signal: abort.signal,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${VOICE_ENDPOINT}?op=speak`);
  assert.equal(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.signal, abort.signal);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    reply: '*looks down* I am tired.',
    ticket: 'signed-ticket',
  });
  assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)), ['reply', 'ticket']);
  assert.deepEqual(headerObject(calls[0].init.headers), {
    accept: 'audio/*',
    'content-type': 'application/json',
    'x-student-key': STUDENT_KEY,
  });
  assert.equal(result.mimeType, 'audio/mpeg');
  assert.ok(result.audio instanceof Uint8Array, 'the transport returns owned bytes, not a live Response');
  assert.deepEqual(result.audio, expectedBytes);
});

test('typed voice endpoint errors survive unchanged and cause no retry or provider switch', async () => {
  const calls = [];
  const transport = requireManagedTransport({
    randomBytes: sequenceRandom([32]).randomBytes,
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return jsonResponse({
        error: { code: 'voice_budget_reserved', message: 'Managed voice is temporarily reserved.' },
      }, 429);
    },
  });

  await assert.rejects(
    transport.transcribe({
      audio: new Blob([Uint8Array.of(1)], { type: 'audio/wav' }),
      mimeType: 'audio/wav',
      caseId: CASE_ID,
      encounterId: ENCOUNTER_ID,
      turnId: 1,
    }),
    (error) => {
      assert.equal(error.code, 'voice_budget_reserved');
      assert.equal(error.status, 429);
      assert.equal(error.message, 'Managed voice is temporarily reserved.');
      return true;
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${VOICE_ENDPOINT}?op=transcribe`);
});

test('encounter IDs use a top-level 16-byte Web Crypto boundary and remain separate from capture IDs', async () => {
  const requests = [];
  const encounterRandom = sequenceRandom([0, 16]);
  const captureRandom = sequenceRandom([32]);
  assert.equal(
    typeof SPInterviewVoice.createEncounterId,
    'function',
    'encounter identity must remain available when managed voice is unavailable or off',
  );
  const transport = requireManagedTransport({
    randomBytes: captureRandom.randomBytes,
    async fetchImpl(url, init) {
      requests.push({ url, init });
      return jsonResponse({ text: 'draft', durationMilliseconds: 100 });
    },
  });

  const firstRoom = SPInterviewVoice.createEncounterId({ randomBytes: encounterRandom.randomBytes });
  const secondRoom = SPInterviewVoice.createEncounterId({ randomBytes: encounterRandom.randomBytes });
  assert.equal(firstRoom, ENCOUNTER_ID);
  assert.equal(secondRoom, SECOND_ENCOUNTER_ID);
  assert.match(firstRoom, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(firstRoom, secondRoom, 'every new room rotates its encounter identity');

  await transport.transcribe({
    audio: new Blob([Uint8Array.of(7)], { type: 'audio/wav' }),
    mimeType: 'audio/wav',
    caseId: CASE_ID,
    encounterId: firstRoom,
    turnId: 1,
  });
  const headers = new Headers(requests[0].init.headers);
  assert.equal(headers.get('x-sp-encounter-id'), firstRoom);
  assert.equal(headers.get('x-sp-capture-id'), FIRST_CAPTURE_ID);
  assert.notEqual(headers.get('x-sp-capture-id'), firstRoom);
  assert.deepEqual(encounterRandom.calls, [16, 16]);
  assert.deepEqual(captureRandom.calls, [16]);
});

test('invalid or unavailable randomness fails locally before any fetch', async () => {
  const invalidRandomSources = [
    null,
    () => new Uint8Array(15),
    () => new Uint8Array(17),
    () => 'sixteen random bytes',
    () => { throw new Error('random source unavailable'); },
  ];

  assert.equal(typeof SPInterviewVoice.createEncounterId, 'function');
  for (const randomBytes of invalidRandomSources) {
    let fetchCalls = 0;
    assert.throws(() => SPInterviewVoice.createEncounterId({ randomBytes }));

    let transport;
    let transportCreationError = null;
    try {
      transport = requireManagedTransport({
        randomBytes,
        async fetchImpl() {
          fetchCalls += 1;
          return jsonResponse({ text: 'must not happen' });
        },
      });
    } catch (error) {
      transportCreationError = error;
    }
    if (!transportCreationError) {
      await assert.rejects(transport.transcribe({
        audio: new Blob([Uint8Array.of(1)], { type: 'audio/wav' }),
        mimeType: 'audio/wav',
        caseId: CASE_ID,
        encounterId: ENCOUNTER_ID,
        turnId: 1,
      }));
    }
    assert.equal(fetchCalls, 0);
  }
});

function makeRecordingHarness(fetchImpl) {
  let recorderOptions;
  const recorder = { starts: 0, stops: 0, cancels: 0, releases: 0 };
  const transport = requireManagedTransport({
    randomBytes: sequenceRandom([32]).randomBytes,
    fetchImpl,
  });
  const controller = SPInterviewVoice.createController({
    mimeType: 'audio/wav',
    createRecorder(options) {
      recorderOptions = options;
      return {
        start() { recorder.starts += 1; },
        stop() {
          recorder.stops += 1;
          options.onChunk(Uint8Array.of(0x52, 0x49, 0x46, 0x46));
          options.onStop();
        },
        cancel() { recorder.cancels += 1; },
        release() { recorder.releases += 1; },
      };
    },
    transcribe(args) {
      return transport.transcribe({ ...args, caseId: CASE_ID });
    },
  });
  controller.beginEncounter(ENCOUNTER_ID);
  controller.setMode('managed');
  return { controller, recorder, getRecorderOptions: () => recorderOptions };
}

test('recording resources release after draft, rejection, timeout, and encounter cancellation', async () => {
  const successful = makeRecordingHarness(async () => jsonResponse({ text: 'editable draft' }));
  successful.controller.startListening();
  assert.equal(await successful.controller.stopListening(), 'editable draft');
  assert.equal(successful.controller.getSnapshot().draft, 'editable draft');
  assert.equal(successful.recorder.releases, 1);

  for (const [status, code] of [[502, 'speech_provider_error'], [504, 'speech_provider_timeout']]) {
    const failed = makeRecordingHarness(async () => jsonResponse({
      error: { code, message: `safe ${code}` },
    }, status));
    failed.controller.startListening();
    await assert.rejects(failed.controller.stopListening(), { code });
    assert.equal(failed.recorder.releases, 1, `${code} must release the recorder`);
  }

  let pendingSignal;
  const cancelled = makeRecordingHarness(async (url, init) => {
    pendingSignal = init.signal;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
        once: true,
      });
    });
  });
  cancelled.controller.startListening();
  const pendingDraft = cancelled.controller.stopListening();
  await Promise.resolve();
  assert.ok(pendingSignal, 'transcription must start with the controller-owned signal');
  cancelled.controller.endEncounter();
  await assert.rejects(pendingDraft, { code: 'cancelled' });
  assert.equal(pendingSignal.aborted, true);
  assert.equal(cancelled.recorder.releases, 1);
  assert.equal(cancelled.getRecorderOptions().encounterId, ENCOUNTER_ID);
});

test('transport operations do not persist learner content', async () => {
  const writes = [];
  const priorLocalStorage = globalThis.localStorage;
  const priorSessionStorage = globalThis.sessionStorage;
  globalThis.localStorage = { setItem(...args) { writes.push(['local', ...args]); } };
  globalThis.sessionStorage = { setItem(...args) { writes.push(['session', ...args]); } };
  try {
    const transport = requireManagedTransport({
      randomBytes: sequenceRandom([32]).randomBytes,
      async fetchImpl(url) {
        if (url.endsWith('?op=speak')) {
          return new Response(Uint8Array.of(1), { headers: { 'content-type': 'audio/mpeg' } });
        }
        return jsonResponse({ text: 'private transcript' });
      },
    });
    await transport.transcribe({
      audio: new Blob([Uint8Array.of(1)], { type: 'audio/wav' }),
      mimeType: 'audio/wav',
      caseId: CASE_ID,
      encounterId: ENCOUNTER_ID,
      turnId: 1,
    });
    await transport.synthesize({
      text: 'private patient reply',
      ticket: 'signed-ticket',
      caseId: CASE_ID,
      encounterId: ENCOUNTER_ID,
      turnId: 1,
    });
  } finally {
    if (priorLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorLocalStorage;
    if (priorSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = priorSessionStorage;
  }
  assert.deepEqual(writes, []);
});
