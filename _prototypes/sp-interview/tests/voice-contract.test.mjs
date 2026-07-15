import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import SPInterviewVoice from '../sp-interview.voice.js';

const TEN_MIB = 10 * 1024 * 1024;
const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'sp-interview.voice.js',
);

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
  let nextId = 1;
  const jobs = new Map();
  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      jobs.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      jobs.delete(id);
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
  const deviceCalls = [];
  const createdUrls = [];
  const revokedUrls = [];
  let nextUrl = 1;

  const deps = {
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: () => 0,
    createRecorder(options) {
      const state = {
        options,
        active: false,
        stops: 0,
        cancels: 0,
        releases: 0,
        chunk: (value) => options.onChunk(value),
        error: (value) => options.onError(value),
      };
      recorders.push(state);
      return {
        start() {
          state.active = true;
        },
        stop() {
          state.active = false;
          state.stops += 1;
          options.onStop();
        },
        cancel() {
          state.active = false;
          state.cancels += 1;
        },
        release() {
          state.active = false;
          state.releases += 1;
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
      const url = `blob:contract-${nextUrl++}`;
      createdUrls.push({ url, audio });
      return url;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    },
    createPlayer(options) {
      const state = {
        options,
        active: false,
        stops: 0,
        destroys: 0,
        end: () => options.onEnded(),
        error: (value = new Error('player failed')) => options.onError(value),
      };
      players.push(state);
      return {
        play() {
          state.active = true;
        },
        stop() {
          state.active = false;
          state.stops += 1;
        },
        destroy() {
          state.active = false;
          state.destroys += 1;
        },
      };
    },
    deviceSpeak(options) {
      const state = {
        options,
        active: true,
        stops: 0,
        destroys: 0,
        end() {
          state.active = false;
          options.onEnded();
        },
      };
      deviceCalls.push(state);
      return {
        stop() {
          state.active = false;
          state.stops += 1;
        },
        destroy() {
          state.active = false;
          state.destroys += 1;
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
    deviceCalls,
    createdUrls,
    revokedUrls,
  };
}

async function openReply(controller, actorResult = { reply: 'Opening', ticket: 'opening-ticket' }) {
  return controller.requestOpening({ runActor: async () => actorResult });
}

async function nextReply(controller, text, actorResult) {
  controller.setDraft(text);
  return controller.submitTurn({ runActor: async () => actorResult });
}

async function acceptManaged(controller, h, result, size) {
  const pending = controller.acceptPatientReply(result);
  await flush();
  const synthesis = h.syntheses.at(-1);
  synthesis.work.resolve({ audio: { size }, mimeType: 'audio/mpeg' });
  await pending;
  return h.players.at(-1);
}

function count(values, target) {
  return values.filter((value) => value === target).length;
}

test('UMD publishes one shared API object and exposes the complete lifecycle', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const context = {
    AbortController,
    Blob,
    Uint8Array,
    ArrayBuffer,
    module: { exports: {} },
    exports: {},
    window: {},
  };
  vm.runInNewContext(source, context, { filename: sourcePath });
  assert.strictEqual(context.window.SPInterviewVoice, context.module.exports);
  assert.equal(typeof context.module.exports.createController, 'function');

  const controller = SPInterviewVoice.createController({});
  for (const method of [
    'getSnapshot',
    'subscribe',
    'beginEncounter',
    'requestOpening',
    'setMode',
    'setDraft',
    'startListening',
    'stopListening',
    'submitTurn',
    'acceptPatientReply',
    'stopPlayback',
    'replay',
    'canReplay',
    'resolveFallback',
    'cancelAll',
    'endEncounter',
    'destroy',
  ]) {
    assert.equal(typeof controller[method], 'function', method);
  }
});

test('opening is turn 0, learner turns start at 1, and only the owned draft is sent', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-contract');

  let openingArgs;
  const opening = await controller.requestOpening({
    runActor(args) {
      openingArgs = args;
      return { reply: 'Welcome.', ticket: 'ticket-0' };
    },
  });
  assert.deepEqual(
    {
      mode: openingArgs.mode,
      text: openingArgs.text,
      encounterId: openingArgs.encounterId,
      turnId: openingArgs.turnId,
    },
    { mode: 'open', text: '', encounterId: 'enc-contract', turnId: 0 },
  );
  assert.equal(openingArgs.signal.aborted, false);
  assert.deepEqual(opening, {
    encounterId: 'enc-contract',
    turnId: 0,
    reply: 'Welcome.',
    ticket: 'ticket-0',
  });
  await controller.acceptPatientReply(opening);

  controller.setDraft('  What brought you in today?  ');
  let turnArgs;
  const turnPromise = controller.submitTurn({
    text: 'must be ignored',
    runActor(args) {
      turnArgs = args;
      return { reply: 'It has been difficult.', ticket: 'ticket-1' };
    },
  });
  assert.equal(controller.getSnapshot().draft, '');
  assert.throws(() => controller.setDraft('editable next-turn draft'), { code: 'invalid_state' });
  const turn = await turnPromise;
  assert.deepEqual(
    {
      mode: turnArgs.mode,
      text: turnArgs.text,
      encounterId: turnArgs.encounterId,
      turnId: turnArgs.turnId,
    },
    {
      mode: 'converse',
      text: '  What brought you in today?  ',
      encounterId: 'enc-contract',
      turnId: 1,
    },
  );
  assert.deepEqual(turn, {
    encounterId: 'enc-contract',
    turnId: 1,
    reply: 'It has been difficult.',
    ticket: 'ticket-1',
  });
  await controller.acceptPatientReply(turn);
  controller.setDraft('editable next-turn draft');
  assert.equal(controller.getSnapshot().draft, 'editable next-turn draft');
});

test('Device and Managed playback accept only the authoritative actor reply and ticket', async () => {
  const device = makeHarness();
  const deviceController = SPInterviewVoice.createController(device.deps);
  deviceController.beginEncounter('enc-authoritative-device');
  deviceController.setMode('device');
  const deviceReply = await openReply(deviceController, {
    reply: '*nods* Authoritative device reply.',
    ticket: 'device-ticket',
  });
  await assert.rejects(
    deviceController.acceptPatientReply({ ...deviceReply, reply: 'Altered device reply.' }),
    { code: 'invalid_state' },
  );
  await assert.rejects(
    deviceController.acceptPatientReply({ ...deviceReply, ticket: 'altered-device-ticket' }),
    { code: 'invalid_state' },
  );
  assert.equal(device.deviceCalls.length, 0);
  assert.equal(deviceController.getSnapshot().phase, 'reply_ready');
  await deviceController.acceptPatientReply(deviceReply);
  assert.equal(device.deviceCalls[0].options.text, 'Authoritative device reply.');

  const managed = makeHarness();
  const managedController = SPInterviewVoice.createController(managed.deps);
  managedController.beginEncounter('enc-authoritative-managed');
  managedController.setMode('managed');
  const managedReply = await openReply(managedController, {
    reply: 'Authoritative managed reply.',
    ticket: 'managed-ticket',
  });
  await assert.rejects(
    managedController.acceptPatientReply({ ...managedReply, reply: 'Altered managed reply.' }),
    { code: 'invalid_state' },
  );
  await assert.rejects(
    managedController.acceptPatientReply({ ...managedReply, ticket: 'altered-managed-ticket' }),
    { code: 'invalid_state' },
  );
  assert.equal(managed.syntheses.length, 0);
  assert.equal(managedController.getSnapshot().phase, 'reply_ready');
  const accepted = managedController.acceptPatientReply(managedReply);
  await flush();
  assert.equal(managed.syntheses[0].args.text, 'Authoritative managed reply.');
  assert.equal(managed.syntheses[0].args.ticket, 'managed-ticket');
  managed.syntheses[0].work.resolve({ audio: { size: 16 }, mimeType: 'audio/mpeg' });
  await accepted;

  const isolated = makeHarness();
  const isolatedController = SPInterviewVoice.createController(isolated.deps);
  isolatedController.beginEncounter('enc-authoritative-alias');
  isolatedController.setMode('device');
  const isolatedReply = await openReply(isolatedController, {
    reply: 'Immutable authoritative reply.',
    ticket: { signature: 'signed-ticket' },
  });
  const authoritativeTicket = isolatedReply.ticket;
  isolatedReply.reply = 'Mutation through returned result.';
  isolatedReply.ticket = { signature: 'forged-ticket' };
  await assert.rejects(isolatedController.acceptPatientReply(isolatedReply), {
    code: 'invalid_state',
  });
  assert.equal(isolated.deviceCalls.length, 0);
  await isolatedController.acceptPatientReply({
    encounterId: isolatedReply.encounterId,
    turnId: isolatedReply.turnId,
    reply: 'Immutable authoritative reply.',
    ticket: authoritativeTicket,
  });
  assert.equal(isolated.deviceCalls[0].options.text, 'Immutable authoritative reply.');
});

test('recorder chunks remain byte-exact and failure, cancellation, and staleness preserve the draft', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-audio');
  controller.setMode('managed');
  controller.setDraft('prior draft');

  controller.startListening();
  h.recorders[0].chunk(new Uint8Array([0, 255]));
  h.recorders[0].chunk(new Uint8Array([128, 4, 9]));
  const failedTranscript = controller.stopListening();
  assert.equal(h.recorders[0].releases, 1);
  assert.deepEqual(
    [...new Uint8Array(await h.transcriptions[0].args.audio.arrayBuffer())],
    [0, 255, 128, 4, 9],
  );
  h.transcriptions[0].work.reject(Object.assign(new Error('provider down'), { code: 'speech_failed' }));
  await assert.rejects(failedTranscript, { code: 'speech_failed' });
  assert.equal(controller.getSnapshot().draft, 'prior draft');
  controller.resolveFallback('text');
  controller.setMode('managed');

  controller.startListening();
  h.recorders[1].chunk(new Uint8Array([1, 2, 3]));
  const cancelledTranscript = controller.stopListening();
  const cancelledSignal = h.transcriptions[1].args.signal;
  controller.cancelAll('voice_off');
  assert.equal(cancelledSignal.aborted, true);
  await assert.rejects(cancelledTranscript, { code: 'cancelled' });
  h.transcriptions[1].work.resolve({ text: 'late cancelled transcript' });
  await flush();
  assert.equal(controller.getSnapshot().draft, 'prior draft');

  controller.startListening();
  h.recorders[2].chunk(new Uint8Array([7]));
  const staleTranscript = controller.stopListening();
  const staleSignal = h.transcriptions[2].args.signal;
  controller.beginEncounter('enc-replacement');
  assert.equal(staleSignal.aborted, true);
  await assert.rejects(staleTranscript, { code: 'stale_operation' });
  controller.setDraft('replacement draft');
  h.transcriptions[2].work.resolve({ text: 'late stale transcript' });
  await flush();
  assert.equal(controller.getSnapshot().draft, 'replacement draft');
  assert.deepEqual(h.recorders.map((recorder) => recorder.releases), [1, 1, 1]);

  controller.setMode('managed');
  controller.startListening();
  h.recorders[3].error(Object.assign(new Error('permission denied'), { code: 'mic_denied' }));
  assert.equal(h.recorders[3].cancels, 1);
  assert.equal(h.recorders[3].releases, 1);
  assert.equal(controller.getSnapshot().draft, 'replacement draft');
  assert.equal(controller.getSnapshot().error.code, 'mic_denied');
});

test('recorder adapter requires all lifecycle methods before ownership and receives turn identity', () => {
  const valid = makeHarness();
  const validController = SPInterviewVoice.createController(valid.deps);
  validController.beginEncounter('enc-recorder-shape');
  validController.setMode('managed');
  validController.startListening();
  assert.equal(valid.recorders[0].options.encounterId, 'enc-recorder-shape');
  assert.equal(valid.recorders[0].options.turnId, 1);
  validController.cancelAll('test cleanup');

  const invalid = makeHarness();
  let starts = 0;
  let cancels = 0;
  let releases = 0;
  invalid.deps.createRecorder = () => ({
    start() { starts += 1; },
    cancel() { cancels += 1; },
    release() { releases += 1; },
  });
  const invalidController = SPInterviewVoice.createController(invalid.deps);
  invalidController.beginEncounter('enc-invalid-recorder');
  invalidController.setMode('managed');
  assert.throws(() => invalidController.startListening(), { code: 'invalid_adapter' });
  assert.equal(starts, 0, 'an invalid recorder must never start');
  assert.equal(cancels, 1);
  assert.equal(releases, 1);
  assert.equal(invalid.clock.pending(), 0);
  assert.equal(invalidController.getSnapshot().phase, 'error');
  assert.equal(invalidController.stopListening(), false);
});

test('synchronous recorder stop and error callbacks cannot orphan the 90-second timer', () => {
  for (const event of ['stop', 'error']) {
    const h = makeHarness();
    let cancels = 0;
    let releases = 0;
    h.deps.createRecorder = (options) => ({
      start() {
        if (event === 'stop') options.onStop();
        else options.onError(Object.assign(new Error('sync recorder error'), { code: 'recording_failed' }));
      },
      stop() {},
      cancel() { cancels += 1; },
      release() { releases += 1; },
    });
    const controller = SPInterviewVoice.createController(h.deps);
    controller.beginEncounter(`enc-sync-${event}`);
    controller.setMode('managed');
    assert.equal(controller.startListening(), true);
    assert.equal(h.clock.pending(), 0, `${event} must clear the timer in the same turn`);
    assert.equal(releases, 1);
    if (event === 'stop') {
      assert.equal(cancels, 0);
      assert.equal(controller.getSnapshot().phase, 'transcribing');
      controller.cancelAll('test cleanup');
    } else {
      assert.equal(cancels, 1);
      assert.equal(controller.getSnapshot().phase, 'error');
    }
  }
});

test('device speech strips only star stage directions and normalizes whitespace', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-device');
  controller.setMode('device');
  const result = await openReply(controller, {
    reply: '  *looks away* I am [still] here.\n\n**Bold** words *quietly*.  ',
    ticket: null,
  });
  await controller.acceptPatientReply(result);
  assert.equal(h.syntheses.length, 0);
  assert.equal(h.deviceCalls.length, 1);
  assert.equal(h.deviceCalls[0].options.text, 'I am [still] here. Bold words .');
  assert.equal(controller.getSnapshot().phase, 'speaking');
  assert.throws(() => controller.startListening(), { code: 'invalid_state' });
  h.deviceCalls[0].end();
  assert.equal(controller.getSnapshot().phase, 'ready');
});

test('managed and device players require complete lifecycle adapters before ownership', async () => {
  const managed = makeHarness();
  let managedStops = 0;
  let managedDestroys = 0;
  managed.deps.createPlayer = () => ({
    stop() { managedStops += 1; },
    destroy() { managedDestroys += 1; },
  });
  const managedController = SPInterviewVoice.createController(managed.deps);
  managedController.beginEncounter('enc-invalid-managed-player');
  managedController.setMode('managed');
  const managedReply = await openReply(managedController);
  const managedAccept = managedController.acceptPatientReply(managedReply);
  await flush();
  managed.syntheses[0].work.resolve({ audio: { size: 8 }, mimeType: 'audio/mpeg' });
  await assert.rejects(managedAccept, { code: 'invalid_adapter' });
  assert.equal(managedStops, 1);
  assert.equal(managedDestroys, 1);
  assert.equal(managedController.stopPlayback(), false);
  assert.deepEqual(managedController.getSnapshot().replayableTurnIds, []);
  assert.deepEqual(managed.revokedUrls, ['blob:contract-1']);

  const device = makeHarness();
  let deviceStops = 0;
  device.deps.deviceSpeak = () => ({
    stop() { deviceStops += 1; },
  });
  const deviceController = SPInterviewVoice.createController(device.deps);
  deviceController.beginEncounter('enc-invalid-device-player');
  deviceController.setMode('device');
  const deviceReply = await openReply(deviceController);
  await assert.rejects(deviceController.acceptPatientReply(deviceReply), {
    code: 'invalid_adapter',
  });
  assert.equal(deviceStops, 1);
  assert.equal(deviceController.stopPlayback(), false);
  assert.equal(deviceController.getSnapshot().phase, 'error');
});

test('missing managed synthesis becomes an explicit fallback state', async () => {
  const controller = SPInterviewVoice.createController({});
  controller.beginEncounter('enc-no-synthesis');
  controller.setMode('managed');
  const result = await openReply(controller);
  await assert.rejects(controller.acceptPatientReply(result), { code: 'unavailable' });
  assert.equal(controller.getSnapshot().phase, 'error');
  assert.equal(controller.getSnapshot().activePatientTurn, 0);
  assert.equal(controller.resolveFallback('text'), true);
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().mode, 'off');
});

test('managed synthesis uses exact identifiers and replay performs no network work or refresh', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-cache');
  controller.setMode('managed');
  const opening = await openReply(controller);
  const firstPlayer = await acceptManaged(controller, h, opening, 4 * 1024 * 1024);
  assert.deepEqual(
    {
      text: h.syntheses[0].args.text,
      ticket: h.syntheses[0].args.ticket,
      encounterId: h.syntheses[0].args.encounterId,
      turnId: h.syntheses[0].args.turnId,
    },
    {
      text: 'Opening',
      ticket: 'opening-ticket',
      encounterId: 'enc-cache',
      turnId: 0,
    },
  );
  firstPlayer.end();

  for (const [text, reply, size] of [
    ['turn one', 'Reply one', 3 * 1024 * 1024],
    ['turn two', 'Reply two', 3 * 1024 * 1024],
  ]) {
    const result = await nextReply(controller, text, { reply, ticket: `${reply}-ticket` });
    const player = await acceptManaged(controller, h, result, size);
    player.end();
  }
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, [0, 1, 2]);
  assert.equal(
    h.createdUrls.reduce((sum, item) => sum + item.audio.size, 0),
    TEN_MIB,
    'the exact 10 MiB cache boundary is allowed',
  );

  const synthesisCount = h.syntheses.length;
  assert.equal(controller.replay(0), true);
  assert.equal(h.syntheses.length, synthesisCount, 'Replay must never call synthesize');
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, [0, 1, 2]);
  h.players.at(-1).end();
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, [0, 1, 2], 'Replay must not refresh FIFO');
  controller.cancelAll('no active work');
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, [0, 1, 2], 'cancelAll preserves cache');
  assert.deepEqual(h.revokedUrls, []);

  const fourth = await nextReply(controller, 'turn three', {
    reply: 'Reply three',
    ticket: 'reply-three-ticket',
  });
  const fourthPlayer = await acceptManaged(controller, h, fourth, 1);
  fourthPlayer.end();
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, [1, 2, 3]);
  assert.equal(count(h.revokedUrls, 'blob:contract-1'), 1, 'oldest URL is revoked once on eviction');
  assert.equal(controller.canReplay(0), false);
  assert.equal(controller.canReplay(1), true);
});

test('oversized one-shot audio is not cached and every URL is revoked exactly once', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-revoke');
  controller.setMode('managed');
  const opening = await openReply(controller);
  const cachedPlayer = await acceptManaged(controller, h, opening, 64);
  cachedPlayer.end();

  const hugeResult = await nextReply(controller, 'next', {
    reply: 'A long answer',
    ticket: 'huge-ticket',
  });
  const hugePlayer = await acceptManaged(controller, h, hugeResult, TEN_MIB + 1);
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, [0]);
  assert.equal(controller.canReplay(1), false);
  hugePlayer.end();
  assert.equal(count(h.revokedUrls, 'blob:contract-2'), 1);

  controller.beginEncounter('enc-replaced');
  assert.equal(count(h.revokedUrls, 'blob:contract-1'), 1, 'replacement clears cached URLs once');

  controller.setMode('managed');
  const staleOpening = await openReply(controller, { reply: 'Stale audio', ticket: 'stale-ticket' });
  const staleSynthesis = controller.acceptPatientReply(staleOpening);
  await flush();
  controller.beginEncounter('enc-after-stale');
  await assert.rejects(staleSynthesis, { code: 'stale_operation' });
  h.syntheses.at(-1).work.resolve({ audio: { size: 9 }, mimeType: 'audio/mpeg' });
  await flush();
  assert.equal(count(h.revokedUrls, 'blob:contract-3'), 1, 'late stale synthesis URL is revoked once');

  controller.setMode('managed');
  const endOpening = await openReply(controller, { reply: 'End me', ticket: 'end-ticket' });
  const endPlayer = await acceptManaged(controller, h, endOpening, 10);
  endPlayer.end();
  controller.endEncounter();
  assert.equal(count(h.revokedUrls, 'blob:contract-4'), 1, 'end clears cached URLs once');

  controller.beginEncounter('enc-destroy');
  controller.setMode('managed');
  const destroyOpening = await openReply(controller, {
    reply: 'Destroy me',
    ticket: 'destroy-ticket',
  });
  await acceptManaged(controller, h, destroyOpening, 11);
  controller.destroy();
  assert.equal(count(h.revokedUrls, 'blob:contract-5'), 1, 'destroy clears cached URLs once');
  assert.equal(new Set(h.revokedUrls).size, h.revokedUrls.length);
});

test('all cancellation paths synchronously abort and release owned work; late callbacks are inert', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-cancel');
  const initialOpening = await openReply(controller);
  await controller.acceptPatientReply(initialOpening);
  controller.setMode('managed');

  controller.startListening();
  assert.equal(h.clock.pending(), 1);
  controller.cancelAll('explicit');
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(h.recorders[0].cancels, 1);
  assert.equal(h.recorders[0].releases, 1);
  assert.equal(h.clock.pending(), 0);
  h.recorders[0].options.onStop();
  assert.equal(h.transcriptions.length, 0, 'late recorder callbacks are ignored');

  controller.setDraft('actor request');
  const actor = deferred();
  let actorSignal;
  const actorRequest = controller.submitTurn({
    runActor(args) {
      actorSignal = args.signal;
      return actor.promise;
    },
  });
  await flush();
  controller.cancelAll('explicit');
  assert.equal(actorSignal.aborted, true);
  assert.equal(controller.getSnapshot().phase, 'ready');
  await assert.rejects(actorRequest, { code: 'cancelled' });
  actor.resolve({ reply: 'late', ticket: 'late' });
  await flush();
  assert.equal(controller.getSnapshot().activePatientTurn, null);

  controller.setDraft('next actor request');
  const result = await controller.submitTurn({
    runActor: async () => ({ reply: 'Patient audio', ticket: 'audio-ticket' }),
  });
  const synthesis = controller.acceptPatientReply(result);
  await flush();
  const speechSignal = h.syntheses.at(-1).args.signal;
  controller.endEncounter();
  assert.equal(speechSignal.aborted, true);
  assert.equal(controller.getSnapshot().phase, 'ended');
  await assert.rejects(synthesis, { code: 'cancelled' });
  h.syntheses.at(-1).work.resolve({ audio: { size: 20 }, mimeType: 'audio/mpeg' });
  await flush();
  assert.equal(controller.getSnapshot().phase, 'ended');

  controller.beginEncounter('enc-playback-cancel');
  controller.setMode('managed');
  const opening = await openReply(controller, { reply: 'Playing', ticket: 'playing-ticket' });
  await acceptManaged(controller, h, opening, 21);
  const activePlayer = h.players.at(-1);
  controller.setMode('off');
  assert.equal(activePlayer.stops, 1);
  assert.equal(activePlayer.destroys, 1);
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().mode, 'off');
  assert.deepEqual(controller.getSnapshot().replayableTurnIds, []);
  activePlayer.options.onEnded();
  assert.equal(controller.getSnapshot().phase, 'ready', 'late player callbacks are ignored');
});

test('immediate cancellation prevents queued actor and synthesis adapters from starting', async () => {
  const h = makeHarness();
  const controller = SPInterviewVoice.createController(h.deps);
  controller.beginEncounter('enc-preflight-cancel');
  let actorCalls = 0;
  const opening = controller.requestOpening({
    runActor() {
      actorCalls += 1;
      return { reply: 'must not run', ticket: null };
    },
  });
  controller.cancelAll('same-turn cancel');
  await assert.rejects(opening, { code: 'cancelled' });
  await flush();
  assert.equal(actorCalls, 0);

  controller.beginEncounter('enc-preflight-synthesis');
  controller.setMode('managed');
  const result = await openReply(controller);
  const synthesis = controller.acceptPatientReply(result);
  controller.cancelAll('same-turn cancel');
  await assert.rejects(synthesis, { code: 'cancelled' });
  await flush();
  assert.equal(h.syntheses.length, 0);
});
