import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import SPInterviewRealtime from '../sp-interview.realtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(here, '..', 'sp-interview.realtime.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');
const { constants } = SPInterviewRealtime;

const ENDPOINT = 'https://proxy.example.test/api/sp/realtime';
const ENCOUNTER = 'enc-aaaaaaaaaaaaaaaaaaa';
const MINUTE = 60 * 1000;
const OPENING_LINE = 'Hi. I guess I am here.';
const OPENING_BRIEF = '[Director] Begin the encounter by saying exactly: "Hi. I guess I am here."';
const HEALTH = {
  schemaVersion: 1,
  enabled: true,
  acceptingSessions: true,
  model: 'gpt-realtime-test',
  transcriptionModel: 'gpt-transcribe-test',
  budgetBand: 'green',
  deadlineMinutes: 20,
  eagerness: ['low', 'medium'],
  cases: [{ id: 'dana', title: 'Dana', voice: 'sage' }],
};
const STATE = { intents: [], flags: [], rapport: 1, unlocked: [] };
const RESPONSE_USAGE = {
  input_tokens: 100,
  output_tokens: 40,
  input_token_details: { audio_tokens: 30, cached_tokens: 50, text_tokens: 20 },
  output_token_details: { audio_tokens: 35, text_tokens: 5 },
};

async function flush(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeClock() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) {
      const id = nextId++;
      jobs.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) {
      jobs.delete(id);
    },
    tick(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...jobs.entries()]
          .filter(([, job]) => job.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        jobs.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    jump(ms) {
      now += ms;
    },
    pending: () => jobs.size,
  };
}

function makeTrack() {
  return { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } };
}

function makeStream(constraints) {
  const tracks = [makeTrack()];
  return { constraints, tracks, getTracks: () => tracks, getAudioTracks: () => tracks };
}

function makePeer(index) {
  const dc = {
    label: null,
    readyState: 'connecting',
    sent: [],
    onopen: null,
    onmessage: null,
    onclose: null,
    send(json) {
      if (this.readyState !== 'open') throw new Error('data channel is not open');
      this.sent.push(JSON.parse(json));
    },
    close() {
      this.readyState = 'closed';
      if (this.onclose) this.onclose({});
    },
  };
  const pc = {
    index,
    dc,
    addTrackCalls: [],
    localDescription: null,
    remoteDescription: null,
    connectionState: 'new',
    closed: false,
    ontrack: null,
    onconnectionstatechange: null,
    addTrack(track, stream) { this.addTrackCalls.push({ track, stream }); },
    createDataChannel(label) { dc.label = label; return dc; },
    createOffer() { return Promise.resolve({ type: 'offer', sdp: `offer-sdp-${index}` }); },
    setLocalDescription(description) { this.localDescription = description; return Promise.resolve(); },
    setRemoteDescription(description) { this.remoteDescription = description; return Promise.resolve(); },
    close() { this.closed = true; this.connectionState = 'closed'; },
    open() { this.connectionState = 'connected'; dc.readyState = 'open'; if (dc.onopen) dc.onopen({}); },
    receive(event) { if (dc.onmessage) dc.onmessage({ data: JSON.stringify(event) }); },
    lose(state = 'failed') { this.connectionState = state; if (this.onconnectionstatechange) this.onconnectionstatechange({}); },
    track(stream) { if (this.ontrack) this.ontrack({ streams: [stream] }); },
  };
  return pc;
}

function makeResponse(result) {
  if (result instanceof Error) throw result;
  const status = result.status ?? 200;
  return { ok: status < 400, status, text: async () => JSON.stringify(result.body ?? {}) };
}

function makeHarness() {
  const clock = makeClock();
  const peers = [];
  const streams = [];
  const sinks = [];
  const calls = [];
  let ids = 0;
  const handlers = {
    health: () => ({ status: 200, body: HEALTH }),
    start: () => ({
      status: 200,
      body: {
        sdp: 'answer-sdp',
        receipt: `receipt-start-${calls.filter((call) => call.op === 'start').length - 1}`,
        deadline: clock.now() + 20 * MINUTE,
        turn: 0,
        opening: OPENING_LINE,
        brief: OPENING_BRIEF,
        state: STATE,
        model: 'gpt-realtime-test',
        voice: 'sage',
      },
    }),
    turn: () => {
      const count = calls.filter((call) => call.op === 'turn').length - 1;
      return {
        status: 200,
        body: {
          receipt: `receipt-turn-${count}`,
          turn: count,
          brief: `[Director] rapport=1. unlocked=[]. turn ${count}`,
          state: { ...STATE, rapport: count },
          deadline: clock.now() + 20 * MINUTE,
        },
      };
    },
    end: () => ({ status: 200, body: { ended: true } }),
  };
  const adapters = {
    fetch(url, init) {
      const op = new URL(url).searchParams.get('op') || 'health';
      const body = init && init.body ? JSON.parse(init.body) : null;
      const call = { op, url, init, body };
      calls.push(call);
      return Promise.resolve().then(() => handlers[op](body, call)).then(makeResponse);
    },
    getUserMedia(constraints) {
      const stream = makeStream(constraints);
      streams.push(stream);
      return Promise.resolve(stream);
    },
    createPeerConnection() {
      const pc = makePeer(peers.length);
      peers.push(pc);
      return pc;
    },
    attachRemoteAudio(stream) {
      const sink = {
        stream,
        stopped: false,
        listener: null,
        stop() { this.stopped = true; },
        onState(callback) { this.listener = callback; },
        report(state) { if (this.listener) this.listener(state); },
      };
      sinks.push(sink);
      return sink;
    },
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    randomId: () => `r${++ids}`,
  };
  return {
    clock,
    peers,
    streams,
    sinks,
    calls,
    handlers,
    adapters,
    callsFor: (op) => calls.filter((call) => call.op === op),
  };
}

function createSession(h, overrides = {}) {
  return SPInterviewRealtime.createSession({
    endpoint: ENDPOINT,
    getStudentKey: () => 'passcode-1',
    caseId: 'dana',
    encounterId: ENCOUNTER,
    adapters: h.adapters,
    ...overrides,
  });
}

async function boot(h, overrides = {}) {
  const session = createSession(h, overrides);
  const started = session.start();
  started.catch(() => {});
  await flush();
  const pc = h.peers[h.peers.length - 1];
  pc.open();
  await flush();
  return { session, pc, dc: pc.dc, started };
}

function realtimeStyleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sentTypes(dc) {
  return dc.sent.map((event) => event.type);
}

function countType(dc, type) {
  return dc.sent.filter((event) => event.type === type).length;
}

function patientReply(pc, { responseId, itemId, text, usage = RESPONSE_USAGE, finish = 'completed' }) {
  pc.receive({ type: 'response.created', response: { id: responseId } });
  pc.receive({ type: 'response.output_item.added', response_id: responseId, item: { id: itemId, role: 'assistant', type: 'message' } });
  pc.receive({ type: 'output_audio_buffer.started', response_id: responseId });
  pc.receive({ type: 'response.output_audio_transcript.delta', response_id: responseId, item_id: itemId, delta: text });
  pc.receive({ type: 'response.output_audio_transcript.done', response_id: responseId, item_id: itemId, transcript: text });
  if (finish) {
    pc.receive({ type: 'response.done', response: { id: responseId, status: finish, usage } });
    if (finish === 'completed' || finish === 'incomplete') pc.receive({ type: 'output_audio_buffer.stopped', response_id: responseId });
  }
}

function patientStarts(pc, { responseId, itemId, text }) {
  patientReply(pc, { responseId, itemId, text, finish: null });
}

async function learnerSays(h, pc, itemId, text) {
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: itemId, audio_start_ms: 0 });
  h.clock.tick(1200);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: itemId, audio_end_ms: 1200 });
  pc.receive({ type: 'input_audio_buffer.committed', item_id: itemId, previous_item_id: null });
  pc.receive({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: itemId,
    transcript: text,
    usage: { type: 'duration', seconds: 1.2 },
  });
  await flush();
}

// Boot, attach the remote sink as playing, and let the opening line finish so the room is listening.
async function live(h, overrides = {}) {
  const booted = await boot(h, overrides);
  booted.pc.track({ remote: true });
  const sink = h.sinks[h.sinks.length - 1];
  sink.report('playing');
  patientReply(booted.pc, { responseId: 'resp-open', itemId: 'item-open', text: OPENING_LINE });
  assert.equal(booted.session.getSnapshot().phase, 'listening');
  return { ...booted, sink };
}

test('module exports createSession and the amended constants', () => {
  assert.equal(typeof SPInterviewRealtime.createSession, 'function');
  assert.equal(constants.MAX_TEXT_CHARS, 1200);
  assert.equal(constants.TRUNCATE_JITTER_MS, 300);
  assert.equal(constants.CLEAR_WAIT_MS, 1500);
  assert.equal(constants.FLOOR_TAKE_MS, 600);
  assert.equal(constants.INTERRUPTED_MARKER, '[interrupted — delivery uncertain]');
  assert.equal(constants.NOT_HEARD_MARKER, '[not heard — playback did not start]');
  assert.equal(constants.NO_REPLY_MARKER, '[no reply]');
  assert.equal(constants.CUT_SHORT_SUFFIX, ' [cut short]');
});

test('every adapter is required and named when missing; options are validated', () => {
  const h = makeHarness();
  for (const name of Object.keys(h.adapters)) {
    const adapters = { ...h.adapters };
    delete adapters[name];
    assert.throws(() => createSession(h, { adapters }), (error) => error.code === 'invalid_adapter' && error.message.includes(name));
  }
  assert.throws(() => createSession(h, { endpoint: '' }), { code: 'invalid_argument' });
  assert.throws(() => createSession(h, { getStudentKey: 'nope' }), { code: 'invalid_argument' });
  assert.throws(() => createSession(h, { caseId: '' }), { code: 'invalid_argument' });
  assert.throws(() => createSession(h, { encounterId: '' }), { code: 'invalid_argument' });
  assert.throws(() => createSession(h, { eagerness: 'high' }), { code: 'invalid_argument' });
  assert.throws(() => createSession(h, { audioSetup: 'car' }), { code: 'invalid_argument' });
  assert.throws(() => createSession(h, { onChange: 'nope' }), { code: 'invalid_argument' });
});

test('the public API and the initial snapshot have exactly the documented shape', () => {
  const h = makeHarness();
  const session = createSession(h);
  assert.deepEqual(Object.keys(session).sort(), [
    'checkHealth', 'doneSpeaking', 'end', 'exportTurns', 'getDiagnostics', 'getSnapshot', 'learnerItems', 'pause',
    'reconnect', 'repeatPatient', 'resume', 'sendText', 'setEagerness', 'start', 'stopPatient', 'subscribe',
  ]);
  const snapshot = session.getSnapshot();
  assert.deepEqual(Object.keys(snapshot), [
    'phase', 'transcript', 'learnerInterim', 'patientInterim', 'state', 'turn', 'deadline', 'error', 'notice', 'usage',
    'connection', 'canDoneSpeaking', 'canStopPatient', 'canRepeat', 'diagnostics', 'eagerness', 'audioSetup', 'encounterId',
  ]);
  assert.deepEqual(snapshot, {
    phase: 'idle',
    transcript: [],
    learnerInterim: '',
    patientInterim: '',
    state: null,
    turn: 0,
    deadline: null,
    error: null,
    notice: null,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      inputAudioTokens: 0,
      outputAudioTokens: 0,
      cachedInputTokens: 0,
      transcriptionSeconds: 0,
      transcriptionTokens: 0,
      responses: 0,
    },
    connection: { model: null, voice: null, playback: null },
    canDoneSpeaking: false,
    canStopPatient: false,
    canRepeat: false,
    diagnostics: {
      droppedSends: 0,
      ignoredLate: 0,
      truncateErrors: 0,
      commitErrors: 0,
      backchannelsIgnored: 0,
      echoIgnored: 0,
      fragmentsJoined: 0,
      repeats: 0,
    },
    eagerness: 'low',
    audioSetup: 'headphones',
    encounterId: ENCOUNTER,
  });
  for (const value of Object.values(snapshot.diagnostics)) assert.equal(typeof value, 'number');
});

test('start(): mic constraints, peer wiring, op=start contract, answer, then opening brief + response.create', async () => {
  const h = makeHarness();
  const phases = [];
  const session = createSession(h, { onChange: (snapshot) => phases.push(snapshot.phase) });
  const started = session.start();
  await flush();
  assert.deepEqual(h.streams[0].constraints, { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const pc = h.peers[0];
  assert.equal(pc.addTrackCalls.length, 1);
  assert.equal(pc.addTrackCalls[0].stream, h.streams[0]);
  assert.equal(pc.dc.label, 'oai-events');
  assert.equal(pc.localDescription.sdp, 'offer-sdp-0');
  const start = h.callsFor('start')[0];
  assert.equal(start.init.method, 'POST');
  assert.equal(start.init.headers['x-student-key'], 'passcode-1');
  assert.equal(start.init.headers['Content-Type'], 'application/json');
  assert.equal(start.init.cache, 'no-store');
  assert.equal(start.init.credentials, 'omit');
  assert.equal(start.init.referrerPolicy, 'no-referrer');
  assert.ok(start.init.signal, 'an abort signal is attached for the 20 s timeout');
  assert.deepEqual(start.body, { caseId: 'dana', encounterId: ENCOUNTER, sdp: 'offer-sdp-0', eagerness: 'low', audioSetup: 'headphones' });
  assert.deepEqual(pc.remoteDescription, { type: 'answer', sdp: 'answer-sdp' });
  assert.equal(session.getSnapshot().phase, 'connecting');
  assert.equal(pc.dc.sent.length, 0, 'nothing is sent before the channel opens');

  pc.open();
  await flush();
  assert.deepEqual(sentTypes(pc.dc), ['conversation.item.create', 'response.create']);
  assert.deepEqual(pc.dc.sent[0].item, { type: 'message', role: 'system', content: [{ type: 'input_text', text: OPENING_BRIEF }] });
  assert.deepEqual(Object.keys(pc.dc.sent[1]).sort(), ['event_id', 'type'], 'response.create carries no overrides');
  const snapshot = await started;
  assert.equal(snapshot.phase, 'thinking');
  assert.deepEqual(snapshot.connection, { model: 'gpt-realtime-test', voice: 'sage', playback: null });
  assert.equal(snapshot.deadline, 20 * MINUTE);
  assert.deepEqual(snapshot.state, STATE);
  assert.deepEqual(snapshot.transcript, [{ who: 'pt', turnId: 0, itemId: null, text: '', status: 'pending', delivered: null, repeatOf: null }]);
  assert.ok(phases.includes('connecting') && phases.includes('thinking'));
  await assert.rejects(session.start(), { code: 'invalid_state' });
});

test('R1: one utterance → one op=turn → one response.create, triggered by transcription.completed', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  assert.equal(countType(dc, 'response.create'), 1);

  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-u1', audio_start_ms: 0 });
  h.clock.tick(1500);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-u1', audio_end_ms: 1500 });
  pc.receive({ type: 'input_audio_buffer.committed', item_id: 'item-u1', previous_item_id: 'item-open' });
  await flush();
  assert.equal(h.callsFor('turn').length, 0, 'speech_stopped does not post a turn');
  pc.receive({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'item-u1',
    transcript: 'What brings you in today?',
    usage: { type: 'tokens', input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  });
  assert.equal(session.getSnapshot().phase, 'thinking');
  await flush();
  const turns = h.callsFor('turn');
  assert.equal(turns.length, 1);
  assert.equal(turns[0].init.headers['x-student-key'], 'passcode-1');
  assert.deepEqual(turns[0].body, {
    receipt: 'receipt-start-0',
    caseId: 'dana',
    encounterId: ENCOUNTER,
    items: [{ itemId: 'item-u1', text: 'What brings you in today?' }],
    lastPatient: { itemId: 'item-open', status: 'complete' },
  });
  assert.equal(countType(dc, 'response.create'), 2);
  const systemItems = dc.sent.filter((event) => event.type === 'conversation.item.create' && event.item.role === 'system');
  assert.equal(systemItems[1].item.content[0].text, '[Director] rapport=1. unlocked=[]. turn 0');
  assert.equal(session.getSnapshot().turn, 0);
  assert.equal(session.getSnapshot().state.rapport, 0);
  assert.deepEqual(session.getSnapshot().transcript[1], {
    who: 'me', turnId: 1, itemId: 'item-u1', text: 'What brings you in today?', status: 'final', delivered: true, repeatOf: null,
  });
  assert.deepEqual(session.learnerItems(), [{ itemId: 'item-u1', text: 'What brings you in today?' }]);

  // A duplicate completed event for the same item is ignored.
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-u1', transcript: 'What brings you in today?' });
  await flush();
  assert.equal(h.callsFor('turn').length, 1);
  assert.equal(countType(dc, 'response.create'), 2);
  assert.equal(session.getDiagnostics().duplicateTranscriptions, 1);
  assert.equal(session.getSnapshot().usage.transcriptionTokens, 15);
  assert.equal(session.getSnapshot().usage.transcriptionSeconds, 0);
});

test('R1: a blank transcript creates nothing; a transcript over 1,200 chars is truncated and noted', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-blank', audio_start_ms: 0 });
  h.clock.tick(900);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-blank', audio_end_ms: 900 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-blank', transcript: '   \n ' });
  await flush();
  assert.equal(h.callsFor('turn').length, 0);
  assert.equal(countType(dc, 'response.create'), 1);
  assert.equal(session.getSnapshot().transcript.length, 1);
  assert.equal(session.getSnapshot().phase, 'listening');

  await learnerSays(h, pc, 'item-long', 'a'.repeat(1300));
  assert.equal(h.callsFor('turn').length, 1);
  assert.equal(h.callsFor('turn')[0].body.items[0].text.length, 1200);
  assert.equal(session.getSnapshot().transcript[1].text.length, 1200);
  assert.equal(session.getSnapshot().notice.code, 'transcript_truncated');
});

test('R2: a failed op=turn keeps the learner entry as unanswered, notices the server code, sends no response.create', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  h.handlers.turn = () => ({ status: 503, body: { error: { code: 'budget_unavailable', message: 'Budget exhausted for today.' } } });
  await learnerSays(h, pc, 'item-u1', 'How have you been sleeping?');
  assert.equal(h.callsFor('turn').length, 1);
  assert.equal(countType(dc, 'response.create'), 1, 'no response.create without a successful op=turn');
  assert.deepEqual(session.getSnapshot().notice, { code: 'budget_unavailable', message: 'Budget exhausted for today.' });
  assert.equal(session.getSnapshot().phase, 'listening');
  const entry = session.getSnapshot().transcript[1];
  assert.equal(entry.status, 'unanswered');
  assert.equal(entry.delivered, false);
  assert.equal(entry.text, 'How have you been sleeping?');

  // A transport failure without a JSON body still notices, with a generic code.
  h.handlers.turn = () => { throw new Error('socket hang up'); };
  await learnerSays(h, pc, 'item-u2', 'Are you eating?');
  assert.equal(session.getSnapshot().notice.code, 'realtime_request_failed');
  assert.equal(countType(dc, 'response.create'), 1);

  // The next utterance re-sends every item, unanswered ones included, and gets its reply.
  h.handlers.turn = makeHarness().handlers.turn;
  await learnerSays(h, pc, 'item-u3', 'Tell me about your mood.');
  const turns = h.callsFor('turn');
  assert.equal(turns.length, 3);
  assert.deepEqual(turns[2].body.items.map((item) => item.itemId), ['item-u1', 'item-u2', 'item-u3']);
  assert.equal(countType(dc, 'response.create'), 2);
  assert.equal(session.exportTurns().length, 0, 'unanswered turns are not exported until a reply arrives');
});

test('R2: a late op=turn response for a superseded generation is dropped', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  const late = deferred();
  h.handlers.turn = () => late.promise;
  await learnerSays(h, pc, 'item-u1', 'What brings you in?');
  assert.equal(session.getSnapshot().phase, 'thinking');
  const sentBefore = dc.sent.length;
  session.end();
  late.resolve({ status: 200, body: { receipt: 'receipt-late', turn: 1, brief: '[Director] late', state: STATE, deadline: null } });
  await flush();
  assert.equal(dc.sent.length, sentBefore);
  assert.equal(session.getSnapshot().phase, 'ended');
  assert.equal(session.getDiagnostics().ignoredLate, 1);
});

test('R3: transcription.failed notices with the exact copy, stays listening, creates nothing', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-f', audio_start_ms: 0 });
  h.clock.tick(1000);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-f', audio_end_ms: 1000 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'item-f', error: { type: 'transcription_error', message: 'nope' } });
  await flush();
  assert.deepEqual(session.getSnapshot().notice, { code: 'transcription_failed', message: "I didn't catch that — say it again, or type it below." });
  assert.equal(session.getSnapshot().phase, 'listening');
  assert.equal(session.getSnapshot().transcript.length, 1);
  assert.equal(h.callsFor('turn').length, 0);
  assert.equal(countType(dc, 'response.create'), 1);
});

test('Floor-taking: speech that outlasts 600 ms while the patient speaks cancels, clears, then truncates on cleared', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await boot(h);
  pc.track({ remote: true });
  h.sinks[0].report('playing');
  patientStarts(pc, { responseId: 'resp-open', itemId: 'item-open', text: OPENING_LINE });
  assert.equal(session.getSnapshot().phase, 'speaking');
  h.clock.tick(2000);
  const before = dc.sent.length;
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-int', audio_start_ms: 4000 });
  h.clock.tick(599);
  assert.equal(dc.sent.length, before, 'nothing happens before the floor timer');
  assert.equal(session.getSnapshot().phase, 'speaking');
  h.clock.tick(1);
  assert.deepEqual(sentTypes(dc).slice(before), ['response.cancel', 'output_audio_buffer.clear']);
  const entry = session.getSnapshot().transcript[0];
  assert.equal(entry.status, 'interrupted');
  assert.equal(entry.delivered, null);
  assert.equal(session.getSnapshot().phase, 'listening');
  pc.receive({ type: 'output_audio_buffer.cleared', response_id: 'resp-open' });
  const truncate = dc.sent[dc.sent.length - 1];
  assert.equal(truncate.type, 'conversation.item.truncate');
  assert.deepEqual({ item_id: truncate.item_id, content_index: truncate.content_index, audio_end_ms: truncate.audio_end_ms },
    { item_id: 'item-open', content_index: 0, audio_end_ms: 2600 - 300 });
  // The provider's own cancellation and a truncate error are absorbed without notice.
  pc.receive({ type: 'response.done', response: { id: 'resp-open', status: 'cancelled', usage: RESPONSE_USAGE } });
  pc.receive({ type: 'error', error: { type: 'invalid_request_error', code: 'invalid_value', message: 'audio_end_ms too large', event_id: truncate.event_id } });
  assert.equal(session.getSnapshot().notice, null);
  assert.equal(session.getSnapshot().transcript[0].status, 'interrupted');
  assert.equal(session.getDiagnostics().truncateErrors, 1);
  assert.equal(session.getSnapshot().usage.responses, 1, 'cancelled responses still count usage');
  // The interrupting utterance itself becomes the learner's turn.
  h.clock.tick(400);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-int', audio_end_ms: 5000 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-int', transcript: 'Sorry, can I stop you there?' });
  await flush();
  assert.equal(h.callsFor('turn').length, 1);
  assert.equal(session.getSnapshot().transcript[1].text, 'Sorry, can I stop you there?');
});

test('Floor-taking: truncate audio_end_ms never goes below zero', async () => {
  const h = makeHarness();
  const { pc, dc } = await boot(h);
  patientStarts(pc, { responseId: 'resp-open', itemId: 'item-open', text: OPENING_LINE });
  h.clock.tick(100);
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-int', audio_start_ms: 0 });
  h.clock.tick(600);
  pc.receive({ type: 'output_audio_buffer.cleared', response_id: 'resp-open' });
  const truncate = dc.sent[dc.sent.length - 1];
  assert.equal(truncate.type, 'conversation.item.truncate');
  assert.equal(truncate.audio_end_ms, Math.max(0, 700 - 300));
});

test('Backchannel: a sub-600 ms utterance during patient speech leaves the patient alone and its transcript is dropped', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await boot(h);
  patientStarts(pc, { responseId: 'resp-open', itemId: 'item-open', text: OPENING_LINE });
  const before = dc.sent.length;
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-bc', audio_start_ms: 0 });
  h.clock.tick(300);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-bc', audio_end_ms: 300 });
  h.clock.tick(1000);
  assert.equal(dc.sent.length, before, 'no cancel, no clear');
  assert.equal(session.getSnapshot().phase, 'speaking');
  pc.receive({ type: 'input_audio_buffer.committed', item_id: 'item-bc', previous_item_id: null });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-bc', transcript: 'Mm-hm.' });
  await flush();
  assert.equal(h.callsFor('turn').length, 0);
  assert.equal(session.getSnapshot().transcript.length, 1);
  assert.equal(session.getSnapshot().diagnostics.backchannelsIgnored, 1);
  assert.equal(session.getSnapshot().phase, 'speaking');
  // The patient finishes normally afterwards.
  pc.receive({ type: 'response.done', response: { id: 'resp-open', status: 'completed', usage: RESPONSE_USAGE } });
  pc.receive({ type: 'output_audio_buffer.stopped', response_id: 'resp-open' });
  assert.equal(session.getSnapshot().transcript[0].status, 'complete');
});

test('Echo guard: backchannel tokens and echoes of the patient during patient speech are dropped; never when the patient was silent', async () => {
  const h = makeHarness();
  const { session, pc } = await live(h);
  const patientText = "I haven't been sleeping much at all lately, maybe three hours.";
  await learnerSays(h, pc, 'item-u1', 'How are you sleeping?');
  patientStarts(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: patientText });
  assert.equal(session.getSnapshot().phase, 'speaking');

  // A slow token set ("yeah… okay") outlasts the floor timer, so the floor is taken, but the transcript is still dropped.
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-tok', audio_start_ms: 0 });
  h.clock.tick(900);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-tok', audio_end_ms: 900 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-tok', transcript: 'Yeah... okay.' });
  await flush();
  assert.equal(h.callsFor('turn').length, 1);
  assert.equal(session.getSnapshot().diagnostics.echoIgnored, 1);
  assert.equal(session.getSnapshot().transcript.filter((entry) => entry.who === 'me').length, 1);

  // The patient's own words re-entering the microphone (speakers).
  patientStarts(pc, { responseId: 'resp-2', itemId: 'item-pt-2', text: patientText });
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-echo', audio_start_ms: 0 });
  h.clock.tick(1200);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-echo', audio_end_ms: 1200 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-echo', transcript: 'been sleeping much at all' });
  await flush();
  assert.equal(h.callsFor('turn').length, 1);
  assert.equal(session.getSnapshot().diagnostics.echoIgnored, 2);

  // Two words that appear in the patient text are not an echo (fewer than three words) — floor taken, transcript kept.
  patientStarts(pc, { responseId: 'resp-3', itemId: 'item-pt-3', text: patientText });
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-two', audio_start_ms: 0 });
  h.clock.tick(1200);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-two', audio_end_ms: 1200 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-two', transcript: 'Three hours?' });
  await flush();
  assert.equal(h.callsFor('turn').length, 2);

  // The same token set while the patient is silent is a real utterance.
  pc.receive({ type: 'response.created', response: { id: 'resp-4' } });
  pc.receive({ type: 'response.done', response: { id: 'resp-4', status: 'completed', usage: RESPONSE_USAGE } });
  assert.equal(session.getSnapshot().phase, 'listening');
  await learnerSays(h, pc, 'item-real', 'Okay.');
  assert.equal(h.callsFor('turn').length, 3);
  assert.equal(session.getSnapshot().diagnostics.echoIgnored, 2);
});

test('Continuation join: a negation after the endpoint yields one entry, one re-posted op=turn and one response.create', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  const firstTurn = deferred();
  const turnHandler = h.handlers.turn;
  h.handlers.turn = () => firstTurn.promise;
  await learnerSays(h, pc, 'item-A', 'Have you had any thoughts of dying');
  assert.equal(h.callsFor('turn').length, 1);
  assert.equal(session.getSnapshot().phase, 'thinking');

  // The learner keeps going while op=turn(A) is in flight.
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-B', audio_start_ms: 0 });
  h.handlers.turn = turnHandler;
  firstTurn.resolve({ status: 200, body: { receipt: 'receipt-turn-0', turn: 1, brief: '[Director] first', state: STATE, deadline: null } });
  await flush();
  assert.equal(countType(dc, 'response.create'), 1, 'no response.create while the learner is still talking');
  h.clock.tick(1100);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-B', audio_end_ms: 1100 });
  pc.receive({ type: 'input_audio_buffer.committed', item_id: 'item-B', previous_item_id: 'item-A' });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-B', transcript: 'no, of not waking up' });
  await flush();

  const learner = session.getSnapshot().transcript.filter((entry) => entry.who === 'me');
  assert.equal(learner.length, 1);
  assert.equal(learner[0].itemId, 'item-A');
  assert.equal(learner[0].text, 'Have you had any thoughts of dying no, of not waking up');
  const turns = h.callsFor('turn');
  assert.equal(turns.length, 2);
  assert.deepEqual(turns[1].body.items, [{ itemId: 'item-A', text: 'Have you had any thoughts of dying no, of not waking up' }]);
  assert.equal(turns[1].body.receipt, 'receipt-turn-0');
  assert.equal(countType(dc, 'response.create'), 2, 'exactly one reply for the joined thought');
  assert.equal(session.getSnapshot().diagnostics.fragmentsJoined, 1);
  assert.deepEqual(session.getDiagnostics().joinedItems, [{ itemId: 'item-A', from: ['item-A', 'item-B'] }]);
  assert.equal(session.getSnapshot().phase, 'thinking');
});

test('Continuation join: a fragment whose newer sibling is already speaking is held and joined before any op=turn', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-A', audio_start_ms: 0 });
  h.clock.tick(1000);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-A', audio_end_ms: 1000 });
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-B', audio_start_ms: 1300 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-A', transcript: 'Do you ever feel' });
  await flush();
  assert.equal(h.callsFor('turn').length, 0, 'A is held while B is still in voice activity');
  assert.equal(session.getSnapshot().transcript.length, 1);
  h.clock.tick(800);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-B', audio_end_ms: 2100 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-B', transcript: 'hopeless about things?' });
  await flush();
  assert.equal(h.callsFor('turn').length, 1);
  assert.deepEqual(h.callsFor('turn')[0].body.items, [{ itemId: 'item-A', text: 'Do you ever feel hopeless about things?' }]);
  assert.equal(countType(dc, 'response.create'), 2);
  assert.equal(session.getSnapshot().diagnostics.fragmentsJoined, 1);

  // A held fragment whose sibling fails transcription is posted on its own.
  patientReply(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'Sometimes.' });
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-C', audio_start_ms: 0 });
  h.clock.tick(1000);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-C', audio_end_ms: 1000 });
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-D', audio_start_ms: 1200 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-C', transcript: 'How long has that been?' });
  await flush();
  assert.equal(h.callsFor('turn').length, 1);
  h.clock.tick(700);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-D', audio_end_ms: 1900 });
  pc.receive({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'item-D', error: { message: 'nope' } });
  await flush();
  assert.equal(h.callsFor('turn').length, 2);
  assert.deepEqual(h.callsFor('turn')[1].body.items.map((item) => item.text), ['Do you ever feel hopeless about things?', 'How long has that been?']);
});

test('Item order: learner items follow creation order, not transcript arrival; a transcript that outlives its wait still slots into place', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-A', audio_start_ms: 0 });
  h.clock.tick(1000);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-A', audio_end_ms: 1000 });
  pc.receive({ type: 'input_audio_buffer.committed', item_id: 'item-A', previous_item_id: 'item-open' });
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-B', audio_start_ms: 1500 });
  h.clock.tick(1000);
  pc.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'item-B', audio_end_ms: 2500 });
  pc.receive({ type: 'input_audio_buffer.committed', item_id: 'item-B', previous_item_id: 'item-A' });
  // B's transcript arrives first: B is recorded, but no turn goes out while the older A is still being transcribed.
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-B', transcript: 'second thing' });
  await flush();
  assert.equal(h.callsFor('turn').length, 0, 'B waits for the older item');
  assert.deepEqual(session.getSnapshot().transcript.filter((entry) => entry.who === 'me').map((entry) => entry.itemId), ['item-B']);
  assert.equal(countType(dc, 'response.create'), 1);

  // A's transcript does not come within the wait: A is given up and B posts alone.
  const turn1 = deferred();
  const turnHandler = h.handlers.turn;
  h.handlers.turn = () => turn1.promise;
  h.clock.tick(constants.TRANSCRIPT_WAIT_MS);
  await flush();
  assert.equal(h.callsFor('turn').length, 1);
  assert.deepEqual(h.callsFor('turn')[0].body.items.map((item) => item.itemId), ['item-B']);
  assert.equal(session.getDiagnostics().transcriptTimeouts, 1);

  // A's transcript arrives after all, while B's turn is in flight: it slots in BEFORE B.
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-A', transcript: 'first thing' });
  await flush();
  const learner = session.getSnapshot().transcript.filter((entry) => entry.who === 'me');
  assert.deepEqual(learner.map((entry) => [entry.turnId, entry.itemId, entry.text]), [[1, 'item-A', 'first thing'], [2, 'item-B', 'second thing']]);
  assert.deepEqual(session.learnerItems(), [{ itemId: 'item-A', text: 'first thing' }, { itemId: 'item-B', text: 'second thing' }]);
  h.handlers.turn = turnHandler;
  turn1.resolve({ status: 200, body: { receipt: 'receipt-turn-0', turn: 1, brief: '[Director] one', state: STATE, deadline: null } });
  await flush();
  assert.equal(h.callsFor('turn').length, 2, 'the stale turn is re-posted in corrected order, without a reply in between');
  assert.deepEqual(h.callsFor('turn')[1].body.items.map((item) => item.itemId), ['item-A', 'item-B']);
  assert.equal(session.getDiagnostics().supersededTurns, 1);
  assert.equal(countType(dc, 'response.create'), 2, 'one reply once the corrected turn returns');
  assert.equal(session.getSnapshot().transcript.filter((entry) => entry.who === 'pt').length, 2);
});

test('Delivery evidence: delivered is true only when the audio sink reported playing during the reply', async () => {
  const h = makeHarness();
  const { session, pc } = await boot(h);
  pc.track({ remote: true });
  const sink = h.sinks[0];
  // Autoplay blocked: the opening completes on the provider side but was not heard.
  sink.report('blocked');
  assert.equal(session.getSnapshot().connection.playback, 'blocked');
  patientReply(pc, { responseId: 'resp-open', itemId: 'item-open', text: OPENING_LINE });
  assert.equal(session.getSnapshot().transcript[0].status, 'complete');
  assert.equal(session.getSnapshot().transcript[0].delivered, false);

  await learnerSays(h, pc, 'item-u1', 'Can you hear me?');
  patientReply(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'Yes.' });
  assert.deepEqual(session.exportTurns(), [{ me: 'Can you hear me?', pt: '[not heard — playback did not start]' }]);

  // Once the element plays, replies are evidenced as delivered.
  sink.report('playing');
  assert.equal(session.getSnapshot().connection.playback, 'playing');
  await learnerSays(h, pc, 'item-u2', 'And now?');
  patientReply(pc, { responseId: 'resp-2', itemId: 'item-pt-2', text: 'Loud and clear.' });
  const last = session.getSnapshot().transcript[session.getSnapshot().transcript.length - 1];
  assert.equal(last.status, 'complete');
  assert.equal(last.delivered, true);
  assert.deepEqual(session.exportTurns()[1], { me: 'And now?', pt: 'Loud and clear.' });

  // A sink that never reports at all yields no evidence.
  const h2 = makeHarness();
  const second = await boot(h2);
  second.pc.track({ remote: true });
  patientReply(second.pc, { responseId: 'resp-open', itemId: 'item-open', text: OPENING_LINE });
  assert.equal(second.session.getSnapshot().transcript[0].delivered, false);
});

test('repeatPatient(): allowed after an interrupted or cut-short reply, sends one director item + response.create, folds into the turn', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  assert.equal(session.getSnapshot().canRepeat, false);
  assert.equal(session.repeatPatient(), false);
  await learnerSays(h, pc, 'item-u1', 'What happened last week?');
  patientStarts(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'It started when my sister called and' });
  h.clock.tick(1500);
  assert.equal(session.stopPatient(), true);
  pc.receive({ type: 'response.done', response: { id: 'resp-1', status: 'cancelled', usage: RESPONSE_USAGE } });
  pc.receive({ type: 'output_audio_buffer.cleared', response_id: 'resp-1' });
  assert.equal(session.getSnapshot().phase, 'listening');
  assert.equal(session.getSnapshot().canRepeat, true);
  const turnsBefore = h.callsFor('turn').length;
  const sentBefore = dc.sent.length;
  assert.equal(session.repeatPatient(), true);
  assert.deepEqual(sentTypes(dc).slice(sentBefore), ['conversation.item.create', 'response.create']);
  assert.deepEqual(dc.sent[sentBefore].item, {
    type: 'message',
    role: 'system',
    content: [{ type: 'input_text', text: '[Director] The interviewer asked you to repeat what you were just saying. Say it again in full, then stop.' }],
  });
  await flush();
  assert.equal(h.callsFor('turn').length, turnsBefore, 'a repeat posts no op=turn');
  const transcript = session.getSnapshot().transcript;
  assert.equal(transcript.filter((entry) => entry.who === 'me').length, 1, 'a repeat creates no learner entry');
  const repeat = transcript[transcript.length - 1];
  assert.equal(repeat.who, 'pt');
  assert.equal(repeat.status, 'pending');
  assert.equal(repeat.repeatOf, 1);
  assert.equal(repeat.turnId, 1);
  assert.equal(session.getSnapshot().diagnostics.repeats, 1);
  assert.equal(session.getSnapshot().phase, 'thinking');
  assert.equal(session.getSnapshot().canRepeat, false);
  assert.deepEqual(session.exportTurns(), [{ me: 'What happened last week?', pt: '[interrupted — delivery uncertain]' }]);

  patientReply(pc, { responseId: 'resp-2', itemId: 'item-pt-2', text: 'It started when my sister called and told me about Dad.' });
  assert.deepEqual(session.exportTurns(), [{ me: 'What happened last week?', pt: 'It started when my sister called and told me about Dad.' }]);
  assert.equal(session.getSnapshot().canRepeat, false, 'a complete reply cannot be repeated');
});

test('R5: stopPatient() sends response.cancel, output_audio_buffer.clear, then truncates on cleared or after 1500 ms', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await boot(h);
  patientStarts(pc, { responseId: 'resp-open', itemId: 'item-open', text: OPENING_LINE });
  h.clock.tick(1000);
  assert.equal(session.getSnapshot().canStopPatient, true);
  let before = dc.sent.length;
  assert.equal(session.stopPatient(), true);
  assert.deepEqual(sentTypes(dc).slice(before), ['response.cancel', 'output_audio_buffer.clear']);
  assert.equal(session.getSnapshot().transcript[0].status, 'interrupted');
  assert.equal(session.getSnapshot().transcript[0].delivered, null);
  assert.equal(session.getSnapshot().phase, 'listening');
  assert.equal(session.stopPatient(), false, 'nothing left to stop');
  pc.receive({ type: 'output_audio_buffer.cleared', response_id: 'resp-open' });
  assert.deepEqual(sentTypes(dc).slice(before), ['response.cancel', 'output_audio_buffer.clear', 'conversation.item.truncate']);
  assert.equal(dc.sent[dc.sent.length - 1].audio_end_ms, 1000 - 300);
  pc.receive({ type: 'response.done', response: { id: 'resp-open', status: 'cancelled', usage: RESPONSE_USAGE } });

  // Timeout path: cleared never arrives.
  await learnerSays(h, pc, 'item-u1', 'Go on.');
  patientStarts(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'Well…' });
  h.clock.tick(700);
  before = dc.sent.length;
  session.stopPatient();
  h.clock.tick(1499);
  assert.deepEqual(sentTypes(dc).slice(before), ['response.cancel', 'output_audio_buffer.clear']);
  h.clock.tick(1);
  assert.deepEqual(sentTypes(dc).slice(before), ['response.cancel', 'output_audio_buffer.clear', 'conversation.item.truncate']);
  assert.equal(dc.sent[dc.sent.length - 1].item_id, 'item-pt-1');
  // Stopping while the patient is only thinking cancels without a truncate.
  pc.receive({ type: 'response.done', response: { id: 'resp-1', status: 'cancelled', usage: RESPONSE_USAGE } });
  await learnerSays(h, pc, 'item-u2', 'Take your time.');
  pc.receive({ type: 'response.created', response: { id: 'resp-2' } });
  assert.equal(session.getSnapshot().phase, 'thinking');
  before = dc.sent.length;
  assert.equal(session.stopPatient(), true);
  h.clock.tick(2000);
  assert.deepEqual(sentTypes(dc).slice(before), ['response.cancel', 'output_audio_buffer.clear']);
});

test('R6: doneSpeaking() commits once, only inside voice activity, and commit errors are silent', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  assert.equal(session.getSnapshot().canDoneSpeaking, false);
  assert.equal(session.doneSpeaking(), false);
  assert.equal(countType(dc, 'input_audio_buffer.commit'), 0);
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-u1', audio_start_ms: 0 });
  assert.equal(session.getSnapshot().canDoneSpeaking, true);
  assert.equal(session.doneSpeaking(), true);
  assert.equal(session.getSnapshot().canDoneSpeaking, false);
  assert.equal(session.doneSpeaking(), false);
  assert.equal(countType(dc, 'input_audio_buffer.commit'), 1);
  const commit = dc.sent[dc.sent.length - 1];
  pc.receive({ type: 'error', error: { type: 'invalid_request_error', code: 'input_audio_buffer_commit_empty', message: 'buffer too small', event_id: commit.event_id } });
  assert.equal(session.getSnapshot().notice, null);
  assert.equal(session.getDiagnostics().commitErrors, 1);
  pc.receive({ type: 'input_audio_buffer.committed', item_id: 'item-u1', previous_item_id: 'item-open' });
  assert.equal(session.getSnapshot().canDoneSpeaking, false);
  pc.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-u1', transcript: 'Right.' });
  await flush();
  assert.equal(h.callsFor('turn').length, 1, 'a committed utterance while the patient was silent is a real turn');
});

test('R7: sendText() validates, stops the patient first, sends the user item before op=turn, then brief + response.create', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  assert.equal(session.sendText('   '), false);
  assert.equal(session.getSnapshot().notice.code, 'text_invalid');
  assert.equal(session.sendText('x'.repeat(1201)), false);
  assert.equal(h.callsFor('turn').length, 0);
  await learnerSays(h, pc, 'item-u1', 'Hello.');
  patientStarts(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'Hello back.' });
  h.clock.tick(800);
  const before = dc.sent.length;
  assert.equal(session.sendText('  Can you say more about the sleep?  '), true);
  assert.deepEqual(sentTypes(dc).slice(before), ['response.cancel', 'output_audio_buffer.clear', 'conversation.item.create']);
  assert.deepEqual(dc.sent[before + 2].item, {
    type: 'message', role: 'user', id: 'typed-1', content: [{ type: 'input_text', text: 'Can you say more about the sleep?' }],
  });
  assert.equal(session.getSnapshot().transcript[2].status, 'interrupted');
  assert.equal(session.getSnapshot().phase, 'thinking');
  await flush();
  const turns = h.callsFor('turn');
  assert.equal(turns.length, 2);
  assert.deepEqual(turns[1].body.items, [{ itemId: 'item-u1', text: 'Hello.' }, { itemId: 'typed-1', text: 'Can you say more about the sleep?' }]);
  assert.deepEqual(turns[1].body.lastPatient, { itemId: 'item-pt-1', status: 'interrupted' });
  assert.deepEqual(sentTypes(dc).slice(before + 3), ['conversation.item.create', 'response.create']);
  const typed = session.getSnapshot().transcript[3];
  assert.equal(typed.status, 'typed');
  assert.equal(typed.itemId, 'typed-1');
  assert.equal(typed.turnId, 2);
  pc.receive({ type: 'output_audio_buffer.cleared', response_id: 'resp-1' });
  assert.equal(dc.sent[dc.sent.length - 1].type, 'conversation.item.truncate');
});

test('R8: pause() disables the mic and stops the patient; resume() re-enables; end() tears everything down and posts op=end once', async () => {
  const h = makeHarness();
  const { session, pc, dc, sink } = await live(h);
  const track = h.streams[0].tracks[0];
  await learnerSays(h, pc, 'item-u1', 'Hello.');
  patientStarts(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'Hi.' });
  assert.equal(session.pause(), true);
  assert.equal(track.enabled, false);
  assert.equal(session.getSnapshot().phase, 'paused');
  assert.equal(session.getSnapshot().transcript[2].status, 'interrupted');
  assert.ok(sentTypes(dc).includes('response.cancel'));
  assert.equal(session.pause(), false);
  assert.equal(session.sendText('typing while paused'), false);
  assert.equal(session.getSnapshot().notice.code, 'text_unavailable');
  assert.equal(session.resume(), true);
  assert.equal(track.enabled, true);
  assert.equal(session.getSnapshot().phase, 'listening');
  assert.equal(session.resume(), false);

  assert.equal(session.end(), true);
  assert.equal(track.stopped, true);
  assert.equal(dc.readyState, 'closed');
  assert.equal(pc.closed, true);
  assert.equal(sink.stopped, true);
  assert.equal(session.getSnapshot().phase, 'ended');
  await flush();
  const ends = h.callsFor('end');
  assert.equal(ends.length, 1);
  assert.equal(ends[0].init.keepalive, true);
  assert.equal(ends[0].init.method, 'POST');
  assert.deepEqual(ends[0].body, { receipt: 'receipt-turn-0', caseId: 'dana', encounterId: ENCOUNTER });
  assert.equal(session.end(), false);
  await flush();
  assert.equal(h.callsFor('end').length, 1);
  // Late callbacks are ignored and cannot revive the session.
  const before = session.getDiagnostics().ignoredLate;
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'late', audio_start_ms: 0 });
  pc.lose('failed');
  assert.equal(session.getSnapshot().phase, 'ended');
  assert.equal(session.getDiagnostics().ignoredLate, before + 1);
  assert.equal(session.pause(), false);
  assert.equal(session.doneSpeaking(), false);
  assert.equal(session.stopPatient(), false);
  await assert.rejects(session.reconnect(), { code: 'invalid_state' });
  assert.equal(h.clock.pending(), 0, 'no timers survive end()');
});

test('R9: response.done statuses map to complete / interrupted / incomplete / failed and usage accumulates for all', async () => {
  const h = makeHarness();
  const { session, pc } = await live(h);
  const usageAfterOpening = session.getSnapshot().usage;
  assert.equal(usageAfterOpening.responses, 1);
  assert.equal(usageAfterOpening.inputTokens, 100);
  assert.equal(usageAfterOpening.cachedInputTokens, 50);
  assert.equal(usageAfterOpening.outputAudioTokens, 35);

  // completed: done first, then stopped → complete only once audio has drained.
  await learnerSays(h, pc, 'item-u1', 'One.');
  patientStarts(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'One back.' });
  pc.receive({ type: 'response.done', response: { id: 'resp-1', status: 'completed', usage: RESPONSE_USAGE } });
  assert.equal(session.getSnapshot().transcript[2].status, 'pending');
  assert.equal(session.getSnapshot().phase, 'speaking');
  pc.receive({ type: 'output_audio_buffer.stopped', response_id: 'resp-1' });
  assert.equal(session.getSnapshot().transcript[2].status, 'complete');
  assert.equal(session.getSnapshot().transcript[2].delivered, true);
  assert.equal(session.getSnapshot().phase, 'listening');

  // completed: stopped first, then done → complete on done.
  await learnerSays(h, pc, 'item-u2', 'Two.');
  patientStarts(pc, { responseId: 'resp-2', itemId: 'item-pt-2', text: 'Two back.' });
  pc.receive({ type: 'output_audio_buffer.stopped', response_id: 'resp-2' });
  assert.equal(session.getSnapshot().transcript[4].status, 'pending');
  pc.receive({ type: 'response.done', response: { id: 'resp-2', status: 'completed', usage: RESPONSE_USAGE } });
  assert.equal(session.getSnapshot().transcript[4].status, 'complete');

  // cancelled → interrupted.
  await learnerSays(h, pc, 'item-u3', 'Three.');
  patientStarts(pc, { responseId: 'resp-3', itemId: 'item-pt-3', text: 'Three back.' });
  pc.receive({ type: 'response.done', response: { id: 'resp-3', status: 'cancelled', usage: RESPONSE_USAGE } });
  assert.equal(session.getSnapshot().transcript[6].status, 'interrupted');
  assert.equal(session.getSnapshot().transcript[6].delivered, null);

  // incomplete → notice reply_cut_short.
  await learnerSays(h, pc, 'item-u4', 'Four.');
  patientReply(pc, { responseId: 'resp-4', itemId: 'item-pt-4', text: 'Four ba', finish: 'incomplete' });
  assert.equal(session.getSnapshot().transcript[8].status, 'incomplete');
  assert.equal(session.getSnapshot().transcript[8].delivered, false);
  assert.equal(session.getSnapshot().notice.code, 'reply_cut_short');
  assert.equal(session.getSnapshot().phase, 'listening');

  // failed → notice reply_failed.
  await learnerSays(h, pc, 'item-u5', 'Five.');
  pc.receive({ type: 'response.created', response: { id: 'resp-5' } });
  pc.receive({ type: 'response.done', response: { id: 'resp-5', status: 'failed', status_details: { type: 'failed', error: { message: 'server_error' } }, usage: RESPONSE_USAGE } });
  assert.equal(session.getSnapshot().transcript[10].status, 'failed');
  assert.equal(session.getSnapshot().transcript[10].delivered, false);
  assert.equal(session.getSnapshot().notice.code, 'reply_failed');
  assert.equal(session.getSnapshot().phase, 'listening');

  const usage = session.getSnapshot().usage;
  assert.equal(usage.responses, 6);
  assert.equal(usage.inputTokens, 600);
  assert.equal(usage.outputTokens, 240);
  assert.equal(usage.inputAudioTokens, 180);
  assert.equal(usage.outputAudioTokens, 210);
  assert.equal(usage.cachedInputTokens, 300);
  assert.equal(usage.transcriptionSeconds, 6);
  assert.deepEqual(session.exportTurns(), [
    { me: 'One.', pt: 'One back.' },
    { me: 'Two.', pt: 'Two back.' },
    { me: 'Three.', pt: '[interrupted — delivery uncertain]' },
    { me: 'Four.', pt: 'Four ba [cut short]' },
    { me: 'Five.', pt: '[no reply]' },
  ]);
});

test('R10: a lost connection offers reconnect; reconnect replays the transcript, never re-speaks the opening, re-posts the same items silently', async () => {
  const h = makeHarness();
  const { session, pc } = await live(h);
  await learnerSays(h, pc, 'item-u1', 'What brings you in?');
  patientReply(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'My sister made me come.' });
  await learnerSays(h, pc, 'item-u2', 'How do you feel about that?');
  patientStarts(pc, { responseId: 'resp-2', itemId: 'item-pt-2', text: 'Annoyed, I' });
  const itemsBefore = session.learnerItems();

  pc.lose('disconnected');
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.phase, 'error');
  assert.equal(snapshot.error.code, 'connection_lost');
  assert.equal(snapshot.transcript[4].status, 'interrupted', 'a reply cut by the drop is uncertain, not invented');
  assert.equal(h.streams[0].tracks[0].stopped, true);
  await flush();
  assert.equal(h.callsFor('end').length, 1, 'the abandoned call is hung up');
  assert.equal(h.callsFor('end')[0].body.receipt, 'receipt-turn-1');
  assert.equal(h.peers.length, 1, 'no automatic reconnect');
  assert.equal(session.end(), true);
  await flush();
  assert.equal(h.callsFor('end').length, 1, 'end() after a hang-up does not post op=end again');

  const h2 = makeHarness();
  const second = await live(h2);
  await learnerSays(h2, second.pc, 'item-u1', 'What brings you in?');
  patientReply(second.pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'My sister made me come.' });
  await learnerSays(h2, second.pc, 'item-u2', 'How do you feel about that?');
  patientStarts(second.pc, { responseId: 'resp-2', itemId: 'item-pt-2', text: 'Annoyed, I' });
  second.pc.lose('failed');
  await flush();
  const reconnecting = second.session.reconnect();
  await flush();
  assert.equal(h2.peers.length, 2);
  assert.equal(h2.callsFor('start').length, 2);
  assert.equal(h2.callsFor('start')[1].body.encounterId, ENCOUNTER);
  const pc2 = h2.peers[1];
  pc2.open();
  await flush();
  await reconnecting;
  const replayed = pc2.dc.sent.filter((event) => event.type === 'conversation.item.create').map((event) => [event.item.role, event.item.content[0].type, event.item.content[0].text]);
  assert.deepEqual(replayed, [
    ['assistant', 'output_text', OPENING_LINE],
    ['user', 'input_text', 'What brings you in?'],
    ['assistant', 'output_text', 'My sister made me come.'],
    ['user', 'input_text', 'How do you feel about that?'],
    ['system', 'input_text', '[Director] rapport=1. unlocked=[]. turn 2'],
  ], 'interrupted replies are omitted, learner turns are replayed, the brief follows');
  assert.equal(countType(pc2.dc, 'response.create'), 0, 'the patient waits for the learner; the opening is never spoken twice');
  assert.ok(!pc2.dc.sent.some((event) => event.type === 'conversation.item.create' && event.item.content[0].text === OPENING_BRIEF));
  const turns = h2.callsFor('turn');
  assert.equal(turns.length, 3);
  assert.deepEqual(turns[2].body.items, itemsBefore);
  assert.equal(turns[2].body.receipt, 'receipt-start-1');
  assert.deepEqual(second.session.learnerItems(), itemsBefore);
  assert.equal(second.session.getSnapshot().phase, 'listening');
  assert.equal(second.session.getSnapshot().error, null);
  assert.equal(second.session.getSnapshot().turn, 2);
  // The next utterance is an ordinary turn on the new receipt.
  await learnerSays(h2, pc2, 'item-u3', 'Annoyed how?');
  assert.equal(h2.callsFor('turn').length, 4);
  assert.equal(h2.callsFor('turn')[3].body.receipt, 'receipt-turn-2');
  assert.equal(countType(pc2.dc, 'response.create'), 1);
});

test('R10: reconnect before the opening was heard speaks the opening once; after it was heard with no learner turns it only replays', async () => {
  const h = makeHarness();
  const { session, pc } = await boot(h);
  pc.lose('failed');
  assert.equal(session.getSnapshot().transcript[0].status, 'failed');
  const reconnecting = session.reconnect();
  await flush();
  h.peers[1].open();
  await flush();
  await reconnecting;
  const sent = h.peers[1].dc.sent;
  assert.deepEqual(sent.map((event) => event.type), ['conversation.item.create', 'response.create']);
  assert.equal(sent[0].item.content[0].text, OPENING_BRIEF);
  assert.equal(h.callsFor('turn').length, 0);

  const h2 = makeHarness();
  const second = await live(h2);
  second.pc.lose('failed');
  const again = second.session.reconnect();
  await flush();
  h2.peers[1].open();
  await flush();
  await again;
  const replay = h2.peers[1].dc.sent;
  assert.deepEqual(replay.map((event) => [event.type, event.item && event.item.role]), [['conversation.item.create', 'assistant']]);
  assert.equal(h2.callsFor('turn').length, 0);
  assert.equal(second.session.getSnapshot().phase, 'listening');
});

test('R11: turn_cap_reached and session_expired end the encounter like end()', async () => {
  for (const [status, code, notice] of [[429, 'turn_cap_reached', 'turn_cap_reached'], [410, 'realtime_session_expired', 'session_expired']]) {
    const h = makeHarness();
    const { session, pc, dc, sink } = await live(h);
    h.handlers.turn = () => ({ status, body: { error: { code, message: 'stop' } } });
    await learnerSays(h, pc, 'item-u1', 'One more thing.');
    assert.equal(session.getSnapshot().phase, 'ended');
    assert.equal(session.getSnapshot().notice.code, notice);
    assert.equal(h.streams[0].tracks[0].stopped, true);
    assert.equal(dc.readyState, 'closed');
    assert.equal(pc.closed, true);
    assert.equal(sink.stopped, true);
    assert.equal(countType(dc, 'response.create'), 1);
    await flush();
    assert.equal(h.callsFor('end').length, 1);
    assert.equal(h.callsFor('end')[0].body.receipt, 'receipt-start-0');
  }
});

test('R12 / A9 / fetch audit: the source holds no storage, no loaders, one audited fetch, no session.update, ES5 only', () => {
  for (const banned of ['localStorage', 'sessionStorage', 'indexedDB', 'XMLHttpRequest', 'importScripts(', 'require(', 'import(', 'console.']) {
    assert.equal(SOURCE.includes(banned), false, `source must not contain ${banned}`);
  }
  const fetchCalls = [...SOURCE.matchAll(/(?<![\w$])fetch\s*\(\s*([^,)]*)/g)];
  assert.equal(fetchCalls.length, 1, 'exactly one fetch( call site');
  assert.equal(fetchCalls[0][1].replace(/\s+/g, ''), 'url');
  assert.match(SOURCE, /adapters\.fetch\(url, init\)/);
  assert.equal(/['"]session\.update['"]/.test(SOURCE), false, 'the controller never sends session.update');
  assert.equal(/=>/.test(SOURCE), false, 'no arrow functions');
  assert.equal(/`/.test(SOURCE), false, 'no template literals');
  assert.equal(/\b(const|let|class|async|await)\b/.test(SOURCE), false, 'no ES2015+ keywords');
  assert.equal(/\?\./.test(SOURCE), false, 'no optional chaining');
  assert.match(SOURCE, /root\.SPInterviewRealtime = api/);
});

test('A9: response.create never carries overrides and every data-channel event has a unique event_id', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  await learnerSays(h, pc, 'item-u1', 'Hello.');
  patientStarts(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'Hi.' });
  h.clock.tick(500);
  session.stopPatient();
  pc.receive({ type: 'output_audio_buffer.cleared', response_id: 'resp-1' });
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-u2', audio_start_ms: 0 });
  session.doneSpeaking();
  for (const event of dc.sent) {
    assert.equal(typeof event.event_id, 'string');
    assert.ok(event.event_id.length > 0);
    if (event.type === 'response.create') assert.deepEqual(Object.keys(event).sort(), ['event_id', 'type']);
  }
  const ids = dc.sent.map((event) => event.event_id);
  assert.equal(new Set(ids).size, ids.length, 'event ids are unique');
  assert.ok(dc.sent.length >= 7);
});

test('R13: a send on a channel that is not open is dropped silently and counted', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-u1', audio_start_ms: 0 });
  dc.readyState = 'closing';
  assert.equal(session.doneSpeaking(), false);
  assert.equal(session.getSnapshot().diagnostics.droppedSends, 1);
  assert.equal(session.getSnapshot().notice, null);
  assert.equal(session.getSnapshot().phase, 'listening');
});

test('R14: the deadline ends the session from the timer and from any event', async () => {
  const shortDeadline = (harness) => () => ({
    status: 200,
    body: { sdp: 'answer-sdp', receipt: 'receipt-short', deadline: harness.clock.now() + 5000, turn: 0, opening: OPENING_LINE, brief: OPENING_BRIEF, state: STATE, model: 'm', voice: 'v' },
  });
  const h = makeHarness();
  h.handlers.start = shortDeadline(h);
  const { session } = await live(h);
  assert.equal(session.getSnapshot().deadline, 5000);
  h.clock.tick(4999);
  assert.equal(session.getSnapshot().phase, 'listening');
  h.clock.tick(1);
  assert.equal(session.getSnapshot().phase, 'ended');
  assert.equal(session.getSnapshot().notice.code, 'session_expired');
  await flush();
  assert.equal(h.callsFor('end').length, 1);

  const h2 = makeHarness();
  h2.handlers.start = shortDeadline(h2);
  const second = await live(h2);
  h2.clock.jump(6000);
  second.pc.receive({ type: 'input_audio_buffer.speech_started', item_id: 'item-u1', audio_start_ms: 0 });
  assert.equal(second.session.getSnapshot().phase, 'ended');
  assert.equal(second.session.getSnapshot().notice.code, 'session_expired');
  assert.equal(second.session.getSnapshot().transcript.length, 1);
});

test('checkHealth() GETs the endpoint with the passcode header and validates the two booleans', async () => {
  const h = makeHarness();
  const session = createSession(h);
  const health = await session.checkHealth();
  assert.deepEqual(health, HEALTH);
  const call = h.callsFor('health')[0];
  assert.equal(call.url, ENDPOINT);
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers['x-student-key'], 'passcode-1');
  assert.equal(call.init.cache, 'no-store');
  assert.equal(call.init.credentials, 'omit');
  h.handlers.health = () => ({ status: 200, body: { ...HEALTH, enabled: 'yes' } });
  await assert.rejects(session.checkHealth(), { code: 'invalid_response' });
  h.handlers.health = () => ({ status: 503, body: { error: { code: 'realtime_disabled', message: 'off' } } });
  await assert.rejects(session.checkHealth(), { code: 'realtime_disabled' });
  assert.equal(session.getSnapshot().phase, 'idle');
});

test('a refused or missing microphone is a microphone_unavailable error in plain words, before any call is opened', async () => {
  for (const [name, expectDenied] of [['NotAllowedError', true], ['NotFoundError', false], ['NotReadableError', false]]) {
    const h = makeHarness();
    h.adapters.getUserMedia = () => {
      const error = new Error('browser wording that must not reach the learner');
      error.name = name;
      error.code = 8; // DOMException-style numeric code
      return Promise.reject(error);
    };
    const session = createSession(h);
    await assert.rejects(session.start(), { code: 'microphone_unavailable' });
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.phase, 'error');
    assert.equal(snapshot.error.code, 'microphone_unavailable');
    assert.match(snapshot.error.message, expectDenied ? /not allowed/ : /No working microphone/);
    assert.match(snapshot.error.message, /continue by typing/);
    assert.ok(!snapshot.error.message.includes('browser wording'));
    assert.equal(h.peers.length, 0, 'no peer connection without a microphone');
    assert.equal(h.callsFor('start').length, 0, 'no op=start without a microphone');
  }
  // An adapter that already speaks the controller's language is passed through unchanged.
  const h = makeHarness();
  h.adapters.getUserMedia = () => Promise.reject(realtimeStyleError('microphone_unavailable', 'Microphone access is unavailable in this browser.'));
  const session = createSession(h);
  await assert.rejects(session.start(), { code: 'microphone_unavailable', message: 'Microphone access is unavailable in this browser.' });
});

test('repeatPatient(): a completed reply the learner never heard can be asked for again, and the repeat stands in for the not-heard marker', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await boot(h);
  pc.track({ remote: true });
  const sink = h.sinks[0];
  sink.report('blocked');
  patientReply(pc, { responseId: 'resp-open', itemId: 'item-open', text: OPENING_LINE });
  assert.equal(session.getSnapshot().canRepeat, true, 'the unheard opening is repeatable');
  await learnerSays(h, pc, 'item-u1', 'Can you hear me?');
  patientReply(pc, { responseId: 'resp-1', itemId: 'item-pt-1', text: 'Yes, I can.' });
  assert.deepEqual(session.exportTurns(), [{ me: 'Can you hear me?', pt: '[not heard — playback did not start]' }]);
  assert.equal(session.getSnapshot().canRepeat, true);
  sink.report('playing');
  const sentBefore = dc.sent.length;
  assert.equal(session.repeatPatient(), true);
  assert.deepEqual(sentTypes(dc).slice(sentBefore), ['conversation.item.create', 'response.create']);
  patientReply(pc, { responseId: 'resp-2', itemId: 'item-pt-2', text: 'Yes, I can.' });
  const transcript = session.getSnapshot().transcript;
  const repeat = transcript[transcript.length - 1];
  assert.equal(repeat.repeatOf, 1);
  assert.equal(repeat.delivered, true);
  assert.deepEqual(session.exportTurns(), [{ me: 'Can you hear me?', pt: 'Yes, I can.' }]);
  assert.equal(session.getSnapshot().canRepeat, false, 'a heard reply is not repeatable from the room');
  assert.equal(h.callsFor('turn').length, 1, 'a repeat posts no op=turn');
});

test('a failed op=start leaves the session in error with the server code and releases the microphone', async () => {
  const h = makeHarness();
  h.handlers.start = () => ({ status: 503, body: { error: { code: 'realtime_disabled', message: 'Spoken sessions are off today.' } } });
  const session = createSession(h);
  await assert.rejects(session.start(), { code: 'realtime_disabled' });
  assert.equal(session.getSnapshot().phase, 'error');
  assert.deepEqual(session.getSnapshot().error, { code: 'realtime_disabled', message: 'Spoken sessions are off today.' });
  assert.equal(h.streams[0].tracks[0].stopped, true);
  assert.equal(h.peers[0].closed, true);
  await flush();
  assert.equal(h.callsFor('end').length, 0, 'no receipt, nothing to end');
  assert.equal(h.clock.pending(), 0);
});

test('a channel that never opens times out into error and hangs the reserved call up', async () => {
  const h = makeHarness();
  const session = createSession(h);
  const started = session.start();
  started.catch(() => {});
  await flush();
  h.clock.tick(20 * 1000);
  await assert.rejects(started, { code: 'connection_timeout' });
  assert.equal(session.getSnapshot().phase, 'error');
  await flush();
  assert.equal(h.callsFor('end').length, 1);
});

test('setEagerness() only changes the next start/reconnect and never touches the live session', async () => {
  const h = makeHarness();
  const session = createSession(h);
  assert.equal(session.setEagerness('high'), false);
  assert.equal(session.setEagerness('medium'), true);
  assert.equal(session.getSnapshot().eagerness, 'medium');
  const started = session.start();
  await flush();
  assert.equal(h.callsFor('start')[0].body.eagerness, 'medium');
  h.peers[0].open();
  await flush();
  await started;
  const sentBefore = h.peers[0].dc.sent.length;
  const callsBefore = h.calls.length;
  assert.equal(session.setEagerness('low'), true);
  assert.equal(session.getSnapshot().eagerness, 'low');
  assert.equal(h.peers[0].dc.sent.length, sentBefore);
  assert.equal(h.calls.length, callsBefore);
  assert.equal(h.callsFor('start')[0].body.eagerness, 'medium');
});

test('provider errors that reference no client event surface as a provider_error notice; a failed response.create fails the reply', async () => {
  const h = makeHarness();
  const { session, pc, dc } = await live(h);
  pc.receive({ type: 'error', error: { type: 'server_error', code: null, message: 'Something odd happened.', event_id: null } });
  assert.deepEqual(session.getSnapshot().notice, { code: 'provider_error', message: 'Something odd happened.' });
  assert.equal(session.getSnapshot().phase, 'listening');
  await learnerSays(h, pc, 'item-u1', 'Hello?');
  const create = dc.sent.filter((event) => event.type === 'response.create').pop();
  pc.receive({ type: 'error', error: { type: 'invalid_request_error', code: 'conversation_already_has_active_response', message: 'busy', event_id: create.event_id } });
  assert.equal(session.getSnapshot().transcript[2].status, 'failed');
  assert.equal(session.getSnapshot().notice.code, 'reply_failed');
  assert.equal(session.getSnapshot().phase, 'listening');
  assert.deepEqual(session.exportTurns(), [{ me: 'Hello?', pt: '[no reply]' }]);
});

test('subscribe() delivers snapshots and unsubscribe stops them; listener errors never break the controller', async () => {
  const h = makeHarness();
  const session = createSession(h);
  const seen = [];
  const unsubscribe = session.subscribe((snapshot) => seen.push(snapshot.phase));
  session.subscribe(() => { throw new Error('listener boom'); });
  const started = session.start();
  await flush();
  h.peers[0].open();
  await flush();
  await started;
  assert.deepEqual(seen.slice(0, 2), ['connecting', 'connecting']);
  assert.equal(seen[seen.length - 1], 'thinking');
  assert.equal(unsubscribe(), true);
  assert.equal(unsubscribe(), false);
  const count = seen.length;
  session.end();
  assert.equal(seen.length, count);
  assert.throws(() => session.subscribe('nope'), { code: 'invalid_argument' });
});
