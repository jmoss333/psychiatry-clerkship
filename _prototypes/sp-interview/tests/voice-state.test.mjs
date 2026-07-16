import assert from 'node:assert/strict';
import test from 'node:test';

import SPInterviewVoice from '../sp-interview.voice.js';

const FOUR_MIB = 4 * 1024 * 1024;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
    pending: () => jobs.size,
  };
}

function makeHarness() {
  const clock = makeClock();
  const recorders = [];
  const transcriptions = [];
  const syntheses = [];
  const players = [];
  const devicePlayers = [];
  const urls = [];
  const revoked = [];
  let nextUrl = 1;

  const deps = {
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    createRecorder(options) {
      const session = {
        options,
        recording: false,
        starts: 0,
        stops: 0,
        cancels: 0,
        releases: 0,
        emit(chunk) {
          options.onChunk(chunk);
        },
        finish() {
          options.onStop();
        },
        fail(error) {
          options.onError(error);
        },
      };
      recorders.push(session);
      return {
        start() {
          session.starts += 1;
          session.recording = true;
        },
        stop() {
          session.stops += 1;
          session.recording = false;
          options.onStop();
        },
        cancel() {
          session.cancels += 1;
          session.recording = false;
        },
        release() {
          session.releases += 1;
          session.recording = false;
        },
      };
    },
    transcribe(args) {
      const work = deferred();
      transcriptions.push({ args, work });
      return work.promise;
    },
    synthesize(args) {
      const work = deferred();
      syntheses.push({ args, work });
      return work.promise;
    },
    createObjectURL(audio) {
      const url = `blob:voice-${nextUrl++}`;
      urls.push({ url, audio });
      return url;
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
    createPlayer(options) {
      const player = {
        options,
        playing: false,
        plays: 0,
        stops: 0,
        destroys: 0,
        end() {
          this.playing = false;
          options.onEnded();
        },
        fail(error = new Error('playback failed')) {
          this.playing = false;
          options.onError(error);
        },
      };
      players.push(player);
      return {
        play() {
          player.plays += 1;
          player.playing = true;
        },
        stop() {
          player.stops += 1;
          player.playing = false;
        },
        destroy() {
          player.destroys += 1;
          player.playing = false;
        },
      };
    },
    deviceSpeak(options) {
      const player = {
        options,
        playing: true,
        stops: 0,
        destroys: 0,
        end() {
          this.playing = false;
          options.onEnded();
        },
      };
      devicePlayers.push(player);
      return {
        stop() {
          player.stops += 1;
          player.playing = false;
        },
        destroy() {
          player.destroys += 1;
          player.playing = false;
        },
      };
    },
  };

  return {
    clock,
    deps,
    recorders,
    transcriptions,
    syntheses,
    players,
    devicePlayers,
    urls,
    revoked,
    isRecording: () => recorders.some((item) => item.recording),
    isPlaying: () => players.some((item) => item.playing) || devicePlayers.some((item) => item.playing),
  };
}

test('controller starts from the exact public snapshot and publishes the state graph', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  assert.deepEqual(controller.getSnapshot(), {
    phase: 'ready',
    mode: 'off',
    encounterId: null,
    turnId: 0,
    draft: '',
    error: null,
    notice: null,
    activePatientTurn: null,
    replayableTurnIds: [],
  });
  assert.deepEqual(Object.keys(controller.getSnapshot()), [
    'phase',
    'mode',
    'encounterId',
    'turnId',
    'draft',
    'error',
    'notice',
    'activePatientTurn',
    'replayableTurnIds',
  ]);

  const phases = [];
  const unsubscribe = controller.subscribe((snapshot) => phases.push(snapshot.phase));
  controller.beginEncounter('enc-state');
  controller.setMode('managed');

  const openingActor = deferred();
  const opening = controller.requestOpening({ runActor: () => openingActor.promise });
  assert.equal(controller.getSnapshot().phase, 'awaiting_patient');
  assert.equal(controller.getSnapshot().turnId, 0);
  openingActor.resolve({ reply: '*looks up* Hello.', ticket: 'open-ticket' });
  assert.deepEqual(await opening, {
    encounterId: 'enc-state',
    turnId: 0,
    reply: '*looks up* Hello.',
    ticket: 'open-ticket',
  });
  assert.equal(controller.getSnapshot().phase, 'reply_ready');
  assert.equal(controller.getSnapshot().activePatientTurn, 0);

  const accepted = controller.acceptPatientReply({
    encounterId: 'enc-state',
    turnId: 0,
    reply: '*looks up* Hello.',
    ticket: 'open-ticket',
  });
  await flush();
  assert.equal(controller.getSnapshot().phase, 'buffering_audio');
  h.syntheses[0].work.resolve({ audio: { size: 128 }, mimeType: 'audio/mpeg' });
  await accepted;
  assert.equal(controller.getSnapshot().phase, 'speaking');
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, [0]);
  h.players[0].end();
  assert.equal(controller.getSnapshot().phase, 'ready');

  controller.setDraft('How have you been sleeping?');
  const turnActor = deferred();
  const turn = controller.submitTurn({ runActor: () => turnActor.promise });
  assert.equal(controller.getSnapshot().phase, 'awaiting_patient');
  assert.equal(controller.getSnapshot().turnId, 1);
  assert.equal(controller.getSnapshot().draft, '');
  turnActor.resolve({ reply: 'Not much.', ticket: 'turn-ticket' });
  assert.deepEqual(await turn, {
    encounterId: 'enc-state',
    turnId: 1,
    reply: 'Not much.',
    ticket: 'turn-ticket',
  });
  assert.equal(controller.getSnapshot().phase, 'reply_ready');
  unsubscribe();
  assert.ok(phases.includes('awaiting_patient'));
  assert.ok(phases.includes('reply_ready'));
  assert.ok(phases.includes('buffering_audio'));
  assert.ok(phases.includes('speaking'));
  assert.ok(phases.includes('ready'));
});

test('managed recording stops at 90 seconds and replaces, but never sends, the editable draft', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-record');
  controller.setMode('managed');
  controller.setDraft('draft to preserve until transcription succeeds');

  assert.equal(controller.startListening(), true);
  h.recorders[0].emit(new Uint8Array([0, 255, 1, 128]));
  h.clock.tick(89_999);
  assert.equal(controller.getSnapshot().phase, 'listening');
  assert.equal(h.recorders[0].stops, 0);
  h.clock.tick(1);
  assert.equal(h.recorders[0].stops, 1);
  assert.equal(h.recorders[0].releases, 1);
  assert.equal(controller.getSnapshot().phase, 'transcribing');
  assert.deepEqual(controller.getSnapshot().notice, {
    code: 'recording_time_limit',
    message: 'Recording stopped at the 90-second limit. The captured segment is being transcribed.',
  });
  assert.equal(h.transcriptions.length, 1);
  assert.equal(h.transcriptions[0].args.encounterId, 'enc-record');
  assert.equal(h.transcriptions[0].args.turnId, 1);
  assert.equal(h.transcriptions[0].args.mimeType, 'audio/webm');
  assert.deepEqual(
    [...new Uint8Array(await h.transcriptions[0].args.audio.arrayBuffer())],
    [0, 255, 1, 128],
  );
  h.transcriptions[0].work.resolve({ text: 'Could you tell me more?' });
  await flush();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().draft, 'Could you tell me more?');
  assert.equal(controller.getSnapshot().notice.code, 'recording_time_limit');
  assert.equal(controller.getSnapshot().turnId, 0, 'dictation must never auto-send');
  assert.equal(h.clock.pending(), 0);
});

test('the 4 MiB boundary is accepted, but crossing it discards every byte', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-size');
  controller.setMode('managed');

  controller.startListening();
  h.recorders[0].emit(new Uint8Array(FOUR_MIB));
  const exactStop = controller.stopListening();
  assert.equal(h.transcriptions.length, 1);
  assert.equal(h.transcriptions[0].args.audio.size, FOUR_MIB);
  h.transcriptions[0].work.resolve({ text: 'exact boundary' });
  assert.equal(await exactStop, 'exact boundary');

  controller.setDraft('keep this draft');
  controller.startListening();
  h.recorders[1].emit(new Uint8Array(FOUR_MIB));
  h.recorders[1].emit(new Uint8Array([1]));
  assert.equal(h.recorders[1].cancels, 1);
  assert.equal(h.recorders[1].releases, 1);
  assert.equal(h.transcriptions.length, 1, 'oversized audio must never reach transcribe');
  assert.equal(controller.getSnapshot().phase, 'error');
  assert.equal(controller.getSnapshot().error.code, 'audio_too_large');
  assert.equal(controller.getSnapshot().draft, 'keep this draft');
  assert.equal(controller.stopListening(), false);
});

test('stale and cancelled actor work rejects with typed errors and cannot become publishable', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-old');
  const oldActor = deferred();
  let oldSignal;
  const staleOpening = controller.requestOpening({
    runActor(args) {
      oldSignal = args.signal;
      return oldActor.promise;
    },
  });
  await flush();
  controller.beginEncounter('enc-new');
  assert.equal(oldSignal.aborted, true);
  await assert.rejects(staleOpening, { code: 'stale_operation' });
  oldActor.resolve({ reply: 'late opening', ticket: 'late' });
  await flush();
  assert.equal(controller.getSnapshot().encounterId, 'enc-new');
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().activePatientTurn, null);
  const currentOpening = await controller.requestOpening({
    runActor: async () => ({ reply: 'current opening', ticket: null }),
  });
  await controller.acceptPatientReply(currentOpening);
  controller.setDraft('A reviewed learner turn');
  const actor = deferred();
  let signal;
  const pending = controller.submitTurn({
    runActor(args) {
      signal = args.signal;
      return actor.promise;
    },
  });
  await flush();
  controller.cancelAll('case_change');
  assert.equal(signal.aborted, true);
  await assert.rejects(pending, { code: 'cancelled' });
  actor.resolve({ reply: 'late patient reply', ticket: 'late-ticket' });
  await flush();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().activePatientTurn, null);
});

test('opening retries until accepted and gates the first learner turn', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-opening-retry');
  controller.setDraft('learner turn must wait');
  await assert.rejects(
    controller.submitTurn({ runActor: async () => ({ reply: 'too early', ticket: null }) }),
    { code: 'invalid_state' },
  );
  assert.equal(controller.getSnapshot().turnId, 0);

  await assert.rejects(
    controller.requestOpening({ runActor: async () => { throw new Error('opening failed'); } }),
    { code: 'actor_failed' },
  );
  controller.cancelAll('clear opening error');

  const cancelledActor = deferred();
  const cancelled = controller.requestOpening({ runActor: () => cancelledActor.promise });
  controller.cancelAll('cancel opening');
  await assert.rejects(cancelled, { code: 'cancelled' });

  const unaccepted = await controller.requestOpening({
    runActor: async () => ({ reply: 'not yet accepted', ticket: 'retry-ticket-1' }),
  });
  controller.cancelAll('discard unaccepted opening');
  assert.equal(controller.getSnapshot().phase, 'ready');

  const accepted = await controller.requestOpening({
    runActor: async () => ({ reply: 'accepted opening', ticket: 'retry-ticket-2' }),
  });
  await controller.acceptPatientReply(accepted);
  await assert.rejects(
    controller.requestOpening({ runActor: async () => ({ reply: 'duplicate', ticket: null }) }),
    { code: 'invalid_state' },
  );

  controller.setDraft('first learner turn');
  let firstTurnId;
  const firstTurn = await controller.submitTurn({
    runActor(args) {
      firstTurnId = args.turnId;
      return { reply: 'first patient answer', ticket: null };
    },
  });
  assert.equal(firstTurnId, 1);
  assert.equal(firstTurn.turnId, 1);
  assert.equal(unaccepted.turnId, 0);
});

test('failed and immediately cancelled learner turns restore text and reuse the same turn ID', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-turn-retry');
  const opening = await controller.requestOpening({
    runActor: async () => ({ reply: 'Opening', ticket: null }),
  });
  await controller.acceptPatientReply(opening);

  controller.setDraft('reviewed text after failure');
  let failedTurnId;
  const failed = controller.submitTurn({
    runActor(args) {
      failedTurnId = args.turnId;
      throw new Error('actor unavailable');
    },
  });
  assert.throws(() => controller.setDraft('racing newer draft'), { code: 'invalid_state' });
  await assert.rejects(failed, { code: 'actor_failed' });
  assert.equal(failedTurnId, 1);
  assert.equal(controller.getSnapshot().turnId, 0);
  assert.equal(controller.getSnapshot().draft, 'reviewed text after failure');
  controller.cancelAll('retry after failure');

  let failureRetryId;
  const failureRetry = await controller.submitTurn({
    runActor(args) {
      failureRetryId = args.turnId;
      return { reply: 'failure retry reply', ticket: null };
    },
  });
  assert.equal(failureRetryId, 1);
  await controller.acceptPatientReply(failureRetry);

  controller.setDraft('reviewed text after cancellation');
  const cancelledActor = deferred();
  let cancelledTurnId;
  const cancelled = controller.submitTurn({
    runActor(args) {
      cancelledTurnId = args.turnId;
      return cancelledActor.promise;
    },
  });
  controller.cancelAll('immediate learner cancellation');
  await assert.rejects(cancelled, { code: 'cancelled' });
  assert.equal(cancelledTurnId, undefined, 'queued adapter must not start after same-turn cancellation');
  assert.equal(controller.getSnapshot().turnId, 1);
  assert.equal(controller.getSnapshot().draft, 'reviewed text after cancellation');

  let cancellationRetryId;
  const cancellationRetry = await controller.submitTurn({
    runActor(args) {
      cancellationRetryId = args.turnId;
      return { reply: 'cancellation retry reply', ticket: null };
    },
  });
  assert.equal(cancellationRetryId, 2);
  assert.equal(cancellationRetry.turnId, 2);
});

test('mode cancellation preserves a restored draft while begin, end, and destroy discard it', async () => {
  async function controllerWithOpening(id) {
    const h = makeHarness();
    const controller = SPInterviewVoice.createController(h.deps);
    controller.beginEncounter(id);
    const opening = await controller.requestOpening({
      runActor: async () => ({ reply: 'Opening', ticket: null }),
    });
    await controller.acceptPatientReply(opening);
    return controller;
  }

  const modeController = await controllerWithOpening('enc-mode-preserve');
  modeController.setDraft('preserve on mode cancellation');
  const modeActor = deferred();
  const modePending = modeController.submitTurn({ runActor: () => modeActor.promise });
  modeController.setMode('device');
  await assert.rejects(modePending, { code: 'cancelled' });
  assert.equal(modeController.getSnapshot().turnId, 0);
  assert.equal(modeController.getSnapshot().draft, 'preserve on mode cancellation');

  for (const lifecycle of ['begin', 'end', 'destroy']) {
    const controller = await controllerWithOpening(`enc-discard-${lifecycle}`);
    controller.setDraft(`discard on ${lifecycle}`);
    const actor = deferred();
    const pending = controller.submitTurn({ runActor: () => actor.promise });
    if (lifecycle === 'begin') controller.beginEncounter('replacement');
    if (lifecycle === 'end') controller.endEncounter();
    if (lifecycle === 'destroy') controller.destroy();
    await assert.rejects(pending, {
      code: lifecycle === 'begin' ? 'stale_operation' : 'cancelled',
    });
    assert.equal(controller.getSnapshot().draft, '', lifecycle);
  }
});

test('illegal actions and post-destroy calls return stable errors', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  assert.throws(() => controller.setMode('automatic'), { code: 'invalid_mode' });
  assert.throws(() => controller.startListening(), { code: 'invalid_state' });
  controller.beginEncounter('enc-rules');
  await assert.rejects(controller.requestOpening({}), { code: 'invalid_argument' });
  const validOpening = await controller.requestOpening({
    runActor: async () => ({ reply: 'Opening after invalid adapter', ticket: null }),
  });
  await controller.acceptPatientReply(validOpening);
  await assert.rejects(controller.submitTurn({ runActor: async () => ({}) }), {
    code: 'invalid_state',
  });
  controller.setDraft('draft survives invalid adapter');
  await assert.rejects(controller.submitTurn({}), { code: 'invalid_argument' });
  assert.equal(controller.getSnapshot().draft, 'draft survives invalid adapter');
  assert.equal(controller.getSnapshot().turnId, 0);
  controller.beginEncounter('enc-rules');
  controller.setMode('managed');

  const openingActor = deferred();
  const opening = controller.requestOpening({ runActor: () => openingActor.promise });
  await assert.rejects(controller.requestOpening({ runActor: async () => ({}) }), {
    code: 'invalid_state',
  });
  assert.throws(() => controller.startListening(), { code: 'invalid_state' });
  controller.cancelAll('user_cancelled');
  await assert.rejects(opening, { code: 'cancelled' });
  controller.setMode('off');
  const retriedOpening = await controller.requestOpening({
    runActor: async () => ({ reply: 'retried opening', ticket: null }),
  });
  await controller.acceptPatientReply(retriedOpening);

  controller.setDraft('question');
  const actor = deferred();
  const turn = controller.submitTurn({ runActor: () => actor.promise });
  await assert.rejects(controller.submitTurn({ runActor: async () => ({}) }), {
    code: 'invalid_state',
  });
  await assert.rejects(
    controller.acceptPatientReply({
      encounterId: 'enc-rules',
      turnId: 1,
      reply: 'too soon',
      ticket: 'x',
    }),
    { code: 'invalid_state' },
  );
  actor.resolve({ reply: 'answer', ticket: 'ticket' });
  await turn;
  await assert.rejects(
    controller.acceptPatientReply({
      encounterId: 'enc-rules',
      turnId: 2,
      reply: 'wrong turn',
      ticket: 'x',
    }),
    { code: 'invalid_state' },
  );

  controller.destroy();
  assert.equal(controller.getSnapshot().phase, 'ended');
  assert.throws(() => controller.beginEncounter('after-destroy'), { code: 'cancelled' });
  assert.throws(() => controller.setDraft('after-destroy'), { code: 'cancelled' });
  assert.equal(controller.stopListening(), false);
  assert.equal(controller.stopPlayback(), false);
  assert.equal(controller.cancelAll('again'), false);
});

test('100 seeded operation sequences never overlap learner recording and patient playback', async () => {
  async function runSeededSequence(seed) {
    let value = seed >>> 0;
    const random = () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x1_0000_0000;
    };
    const h = makeHarness();
    const controller = SPInterviewVoice.createController(h.deps);
    controller.beginEncounter(`seed-${seed}`);
    controller.setMode('managed');
    const opening = controller.requestOpening({
      runActor: async () => ({ reply: 'Seeded reply', ticket: `ticket-${seed}` }),
    });
    const result = await opening;
    const accepted = controller.acceptPatientReply(result);
    await flush();
    h.syntheses[0].work.resolve({ audio: { size: 32 }, mimeType: 'audio/mpeg' });
    await accepted;
    h.players[0].end();

    const trace = [];
    for (let step = 0; step < 40; step++) {
      const action = Math.floor(random() * 8);
      try {
        if (action === 0) controller.replay(0);
        if (action === 1) controller.stopPlayback();
        if (action === 2) controller.startListening();
        if (action === 3) controller.stopListening();
        if (action === 4) controller.cancelAll('seeded');
        if (action === 5) controller.setMode('managed');
        if (action === 6) controller.setMode('device');
        if (action === 7) controller.setMode('off');
      } catch (error) {
        assert.ok(['invalid_state', 'cancelled'].includes(error.code));
      }
      trace.push({ recording: h.isRecording(), playing: h.isPlaying() });
      if (controller.getSnapshot().phase === 'error') controller.resolveFallback('text');
    }
    controller.destroy();
    return trace;
  }

  for (let seed = 1; seed <= 100; seed++) {
    const trace = await runSeededSequence(seed);
    assert.equal(trace.some((step) => step.recording && step.playing), false, `seed ${seed}`);
  }
});

// F22 — replay() calls startManagedPlayer unwrapped. startPlayer publishes
// phase:'speaking' before play(); a synchronous play() throw would otherwise
// leave the controller stuck in 'speaking'. It must fail to 'error' like the
// reply-arrival path does.
test('a replay whose playback throws surfaces error state, not a phantom speaking state', async () => {
  const h = makeHarness();
  let failPlay = false;
  const baseCreatePlayer = h.deps.createPlayer;
  h.deps.createPlayer = (options) => {
    const adapter = baseCreatePlayer(options);
    return Object.assign({}, adapter, {
      play() {
        if (failPlay) throw new Error('play boom');
        return adapter.play();
      },
    });
  };
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-replay');
  controller.setMode('managed');

  const openingActor = deferred();
  const opening = controller.requestOpening({ runActor: () => openingActor.promise });
  openingActor.resolve({ reply: 'Hello.', ticket: 'open-ticket' });
  await opening;
  const accepted = controller.acceptPatientReply({
    encounterId: 'enc-replay',
    turnId: 0,
    reply: 'Hello.',
    ticket: 'open-ticket',
  });
  await flush();
  h.syntheses[0].work.resolve({ audio: { size: 128 }, mimeType: 'audio/mpeg' });
  await accepted;
  assert.equal(controller.getSnapshot().phase, 'speaking');
  h.players[0].end();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, [0]);

  failPlay = true;
  assert.throws(() => controller.replay(0));
  assert.equal(
    controller.getSnapshot().phase,
    'error',
    'a replay playback failure must not leave a phantom speaking state',
  );
});
