import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SPInterviewTurns = require('../sp-interview.turns.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness(options = {}) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const inputs = [];
  const speeches = [];
  const requests = [];
  const changes = [];

  const deps = {
    opening: options.opening ?? 'Hello. What brings you in today?',
    now: () => now,
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    input(callbacks) {
      const item = { callbacks, starts: 0, stops: 0 };
      inputs.push(item);
      if (options.inputThrows) throw new Error('Speech recognition unavailable');
      return {
        start() {
          item.starts += 1;
          if (options.startThrows) throw new Error('Microphone unavailable');
          if (!options.delayedReady && typeof callbacks.onReady === 'function') callbacks.onReady();
          if (options.syncInputStart) callbacks.onStart();
        },
        stop() { item.stops += 1; },
      };
    },
    speak(args) {
      const item = { ...args, stops: 0 };
      speeches.push(item);
      if (options.speakThrows) throw new Error('Speech unavailable');
      return { stop() { item.stops += 1; } };
    },
    respond(text, requestOptions) {
      const work = deferred();
      const item = { text, options: requestOptions, work };
      requests.push(item);
      if (options.respondThrows) throw new Error('Actor unavailable');
      return work.promise;
    },
    onChange(snapshot) { changes.push(snapshot); },
  };

  function runDue() {
    let ran;
    do {
      ran = false;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      if (due.length) {
        const [id, timer] = due[0];
        timers.delete(id);
        timer.callback();
        ran = true;
      }
    } while (ran);
  }

  return {
    deps, inputs, speeches, requests, changes, timers,
    advance(ms) { now += ms; runDue(); },
    async settle() { await Promise.resolve(); await Promise.resolve(); },
  };
}

test('explicit external delivery resumes capture without inventing a single patient reply',async()=>{
  const h=harness(),c=SPInterviewTurns.createController({...h.deps,skipOpening:true,externalDelivery:true,maxTurns:2});
  c.start();h.inputs.at(-1).callbacks.onResult({text:'What matters to each of you?',final:true,resultId:'family-1'});
  c.doneSpeaking();assert.equal(c.getSnapshot().phase,'awaiting_patient');
  assert.equal(h.inputs[0].stops,1);assert.equal(h.inputs.length,1);
  h.requests[0].work.resolve({deliveryManaged:true});await h.settle();
  assert.equal(c.getSnapshot().phase,'listening');assert.equal(h.inputs.length,2);assert.equal(h.speeches.length,0);
  assert.deepEqual(c.getSnapshot().transcript,[{who:'me',text:'What matters to each of you?'}]);
  h.inputs.at(-1).callbacks.onResult({text:'What could help next?',final:true,resultId:'family-2'});c.doneSpeaking();
  h.requests[1].work.resolve({deliveryManaged:true});await h.settle();assert.equal(c.getSnapshot().phase,'ended');
});

test('external delivery may pause for completed-caption reading without opening another microphone',async()=>{
  const h=harness(),c=SPInterviewTurns.createController({...h.deps,skipOpening:true,externalDelivery:true,maxTurns:2});
  c.start();h.inputs.at(-1).callbacks.onResult({text:'What matters to each of you?',final:true,resultId:'caption-1'});c.doneSpeaking();
  h.requests[0].work.resolve({deliveryManaged:true,pauseAfterDelivery:true});await h.settle();
  assert.equal(c.getSnapshot().phase,'paused');assert.equal(h.inputs.length,1);assert.equal(h.speeches.length,0);
  assert.equal(c.resume(),true);assert.equal(c.getSnapshot().phase,'listening');assert.equal(h.inputs.length,2);
});

test('prepared alternative can start paused without opening even a transient microphone',()=>{
  const h=harness(),c=SPInterviewTurns.createController({...h.deps,skipOpening:true,initiallyPaused:true,externalDelivery:true,maxTurns:1});
  assert.equal(c.getSnapshot().phase,'paused');assert.equal(h.inputs.length,0);assert.equal(h.speeches.length,0);
  c.setThinkingTime(true);c.setHoldTurn(false);assert.equal(h.inputs.length,0);
  assert.equal(c.resume(),true);assert.equal(h.inputs.length,1);assert.equal(c.getSnapshot().phase,'listening');
});

test('external delivery cannot restart microphone after pause or silently change ordinary patient mode',async()=>{
  const h=harness(),c=SPInterviewTurns.createController({...h.deps,skipOpening:true,externalDelivery:true});
  c.start();h.inputs.at(-1).callbacks.onResult({text:'Morgan first, please.',final:true});c.doneSpeaking();
  c.pause();assert.equal(h.requests[0].options.signal.aborted,true);
  h.requests[0].work.resolve({deliveryManaged:true});await h.settle();assert.equal(c.getSnapshot().phase,'paused');assert.equal(h.inputs.length,1);
  const ordinary=harness(),single=SPInterviewTurns.createController({...ordinary.deps,skipOpening:true});
  single.start();ordinary.inputs[0].callbacks.onResult({text:'Hello',final:true});single.doneSpeaking();
  ordinary.requests[0].work.resolve({deliveryManaged:true});await ordinary.settle();assert.equal(single.getSnapshot().phase,'error');
});

async function beginListening(controller, h) {
  controller.start();
  assert.equal(controller.getSnapshot().state, 'speaking');
  h.speeches.at(-1).onEnded();
  assert.equal(controller.getSnapshot().state, 'listening');
}

async function completeTurn(controller, h, text, reply, resultId) {
  const input = h.inputs.at(-1);
  input.callbacks.onStart();
  input.callbacks.onResult({ text, final: true, resultId });
  input.callbacks.onEnd();
  h.advance(controller.getSnapshot().pauseMs);
  assert.equal(controller.getSnapshot().state, 'awaiting_patient');
  h.requests.at(-1).work.resolve({ reply });
  await h.settle();
  assert.equal(controller.getSnapshot().state, 'speaking');
  h.speeches.at(-1).onEnded();
}

test('ten finalized utterances submit once each and automatically re-arm until the final reply ends', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);

  for (let turn = 1; turn <= 10; turn += 1) {
    await completeTurn(controller, h, `Question ${turn}?`, `Reply ${turn}.`, `result-${turn}`);
    assert.equal(controller.getSnapshot().state, turn === 10 ? 'ended' : 'listening');
  }

  const snapshot = controller.getSnapshot();
  assert.equal(h.requests.length, 10);
  assert.equal(h.inputs.length, 10);
  assert.equal(snapshot.submittedTurns, 10);
  assert.equal(snapshot.transcript.length, 21);
  assert.deepEqual(snapshot.transcript.at(-2), { who: 'me', text: 'Question 10?' });
  assert.deepEqual(snapshot.transcript.at(-1), { who: 'pt', text: 'Reply 10.', playbackStatus: 'played' });
});

test('thinking-time setting changes silence completion from 4500ms to 6000ms without reaching respond', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  assert.equal(controller.getSnapshot().thinkingTime, false);
  assert.equal(controller.getSnapshot().pauseMs, 4500);
  let input = h.inputs.at(-1);
  input.callbacks.onResult({ text: 'Normal pause', final: true, resultId: 'normal' });
  h.advance(4499);
  assert.equal(h.requests.length, 0);
  h.advance(1);
  assert.equal(h.requests.length, 1);

  controller.pause();
  controller.resume();
  controller.setThinkingTime(true);
  input = h.inputs.at(-1);
  input.callbacks.onResult({ text: 'Longer pause', final: true, resultId: 'long' });
  h.advance(5999);
  assert.equal(h.requests.length, 1);
  h.advance(1);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests.map((request) => Object.keys(request.options)), [['signal'], ['signal']]);
});

test('holding a turn prevents automatic submission and releasing gives the full selected pause', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const input = h.inputs.at(-1);
  input.callbacks.onResult({ text: 'I was wondering', final: true, resultId: 'first' });
  h.advance(2000);
  assert.equal(controller.setHoldTurn(true), true);
  assert.equal(controller.getSnapshot().holdTurn, true);
  input.callbacks.onResult({ text: 'about your sleep', final: true, resultId: 'second' });
  h.advance(60000);
  assert.equal(h.requests.length, 0);
  assert.equal(controller.getSnapshot().state, 'listening');
  controller.setThinkingTime(true);
  h.advance(60000);
  assert.equal(h.requests.length, 0);
  assert.equal(controller.setHoldTurn(false), false);
  h.advance(5999);
  assert.equal(h.requests.length, 0);
  h.advance(1);
  assert.equal(h.requests[0].text, 'I was wondering about your sleep');
});

test('Done speaking can submit held final text but cannot submit unfinished interim text', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  controller.setHoldTurn(true);
  await beginListening(controller, h);
  const input = h.inputs.at(-1);
  assert.equal(controller.doneSpeaking(), false);
  input.callbacks.onResult({ text: 'Tell me', final: true, resultId: 'first' });
  input.callbacks.onResult({ text: 'about', final: false });
  assert.equal(controller.doneSpeaking(), false);
  input.callbacks.onResult({ text: 'about that', final: true, resultId: 'second' });
  assert.equal(controller.doneSpeaking(), true);
  assert.equal(controller.doneSpeaking(), false);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].text, 'Tell me about that');
});

test('holding survives recognition reconnects without turning a quiet pause into a submission', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  controller.setHoldTurn(true);
  await beginListening(controller, h);
  const input = h.inputs.at(-1);
  input.callbacks.onResult({ text: 'Let me think', final: true, resultId: 'first' });
  input.callbacks.onConnecting();
  h.advance(60000);
  input.callbacks.onReady();
  input.callbacks.onEnd();
  h.advance(60000);
  assert.equal(controller.getSnapshot().draft, 'Let me think');
  assert.equal(h.requests.length, 0);
});

test('interim text and silence update captions but never commit a learner turn', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const input = h.inputs.at(-1);
  input.callbacks.onStart();
  input.callbacks.onResult({ text: 'Could you', final: false });
  h.advance(5000);
  assert.equal(h.requests.length, 0);
  assert.equal(controller.getSnapshot().caption, 'Could you');
  input.callbacks.onResult({ text: 'Could you tell me', final: true, resultId: 'a' });
  input.callbacks.onResult({ text: 'about that?', final: false });
  h.advance(5000);
  assert.equal(h.requests.length, 0);
  input.callbacks.onResult({ text: '', final: false });
  h.advance(4500);
  assert.equal(h.requests[0].text, 'Could you tell me');
});

test('recognition is stopped before actor work and playback cannot be captured as learner speech', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const staleInput = h.inputs.at(-1);
  staleInput.callbacks.onResult({ text: 'How are you?', final: true, resultId: 'q1' });
  h.advance(4500);
  assert.equal(staleInput.stops, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(h.changes.some((snapshot) => snapshot.phase === 'finalizing'), true);
  assert.deepEqual(
    Object.keys(controller.getSnapshot()).sort(),
    ['caption', 'draft', 'error', 'holdTurn', 'interim', 'notice', 'pauseMs', 'phase', 'speechActive', 'speechDetected', 'state', 'submittedTurns', 'thinkingTime', 'transcript', 'turnCount'].sort(),
  );
  staleInput.callbacks.onResult({ text: 'Echo of patient', final: true, resultId: 'echo' });
  h.requests[0].work.resolve({ reply: 'I am tired.' });
  await h.settle();
  staleInput.callbacks.onResult({ text: 'I am tired.', final: true, resultId: 'echo-2' });
  h.speeches.at(-1).onEnded();
  assert.equal(h.requests.length, 1);
  assert.equal(controller.getSnapshot().transcript.filter((entry) => entry.who === 'me').length, 1);
});

test('pause and end cancel resources and ignore every stale callback', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const firstInput = h.inputs.at(-1);
  firstInput.callbacks.onResult({ text: 'Pending', final: true, resultId: 'pending' });
  controller.pause();
  firstInput.callbacks.onResult({ text: 'Stale', final: true, resultId: 'stale' });
  firstInput.callbacks.onError(new Error('late input error'));
  h.advance(5000);
  assert.equal(controller.getSnapshot().state, 'paused');
  assert.equal(h.requests.length, 0);

  controller.resume();
  const secondInput = h.inputs.at(-1);
  secondInput.callbacks.onResult({ text: 'Send this', final: true, resultId: 'send' });
  h.advance(4500);
  const pending = h.requests[0];
  controller.end();
  assert.equal(pending.options.signal.aborted, true);
  pending.work.resolve({ reply: 'Late reply' });
  secondInput.callbacks.onError(new Error('late'));
  await h.settle();
  assert.equal(controller.getSnapshot().state, 'ended');
  assert.deepEqual(controller.getSnapshot().transcript, [
    { who: 'pt', text: 'Hello. What brings you in today?', playbackStatus: 'played' },
    { who: 'me', text: 'Send this', responseStatus: 'cancelled' },
  ]);
});

test('interrupting Dana stops her current line, preserves its marker, and immediately starts listening', () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  controller.setHoldTurn(true);
  controller.start();
  const opening = h.speeches[0];
  assert.equal(controller.interrupt(), true);
  assert.equal(opening.stops, 1);
  assert.equal(controller.getSnapshot().state, 'listening');
  assert.equal(controller.getSnapshot().holdTurn, true);
  assert.equal(controller.getSnapshot().submittedTurns, 0);
  assert.deepEqual(controller.getSnapshot().transcript, [
    { who: 'pt', text: 'Hello. What brings you in today?', playbackStatus: 'interrupted' },
  ]);
  opening.onEnded();
  opening.onError(new Error('stale playback failure'));
  assert.equal(h.inputs.length, 1);
  assert.equal(controller.getSnapshot().state, 'listening');
  h.inputs[0].callbacks.onResult({ text: 'Can I ask about sleep?', final: true, resultId: 'interrupt-q' });
  h.advance(60000);
  assert.equal(h.requests.length, 0);
  assert.equal(controller.doneSpeaking(), true);
  assert.equal(h.requests[0].text, 'Can I ask about sleep?');
});

test('interrupting a pending response aborts it without removing or recounting the submitted question', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const firstInput = h.inputs[0];
  firstInput.callbacks.onResult({ text: 'First question', final: true, resultId: 'first' });
  controller.doneSpeaking();
  const pending = h.requests[0];
  assert.equal(controller.interrupt(), true);
  assert.equal(pending.options.signal.aborted, true);
  assert.equal(controller.getSnapshot().submittedTurns, 1);
  assert.equal(controller.getSnapshot().state, 'listening');
  assert.deepEqual(controller.getSnapshot().transcript, [
    { who: 'pt', text: 'Hello. What brings you in today?', playbackStatus: 'played' },
    { who: 'me', text: 'First question', responseStatus: 'cancelled' },
  ]);
  pending.work.resolve({ reply: 'Late patient reply' });
  firstInput.callbacks.onResult({ text: 'Stale words', final: true, resultId: 'stale' });
  await h.settle();
  assert.equal(h.speeches.length, 1);
  assert.equal(h.requests.length, 1);
  h.inputs.at(-1).callbacks.onResult({ text: 'Follow-up question', final: true, resultId: 'follow-up' });
  controller.doneSpeaking();
  assert.equal(controller.getSnapshot().submittedTurns, 2);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests.map(({ text }) => text), ['First question', 'Follow-up question']);
});

test('interrupt ignores all other phases and waits for microphone readiness after playback stops', () => {
  const h = harness({ delayedReady: true });
  const controller = SPInterviewTurns.createController(h.deps);
  assert.equal(controller.interrupt(), false);
  controller.start();
  controller.interrupt();
  assert.equal(controller.getSnapshot().state, 'starting');
  assert.equal(controller.interrupt(), false);
  h.inputs[0].callbacks.onReady();
  assert.equal(controller.getSnapshot().state, 'listening');
  assert.equal(controller.interrupt(), false);
  controller.pause();
  assert.equal(controller.interrupt(), false);
  controller.resume();
  h.inputs.at(-1).callbacks.onError(new Error('Microphone failure'));
  assert.equal(controller.interrupt(), false);
  controller.end();
  assert.equal(controller.interrupt(), false);
});

test('interrupt invalidates synchronous stop callbacks before they can start duplicate capture', () => {
  const h = harness();
  h.deps.speak = (args) => ({
    stop() {
      args.onEnded();
      args.onError(new Error('Already stopped'));
    },
  });
  const controller = SPInterviewTurns.createController(h.deps);
  controller.start();
  assert.equal(controller.interrupt(), true);
  assert.equal(controller.getSnapshot().state, 'listening');
  assert.equal(h.inputs.length, 1);
  assert.equal(controller.getSnapshot().transcript[0].playbackStatus, 'interrupted');
});

test('interrupting the tenth pending response or spoken reply cannot open an eleventh turn', async (t) => {
  for (const phase of ['awaiting_patient', 'speaking']) {
    await t.test(phase, async () => {
      const h = harness();
      const controller = SPInterviewTurns.createController(h.deps);
      await beginListening(controller, h);
      for (let turn = 1; turn < 10; turn += 1) {
        await completeTurn(controller, h, `Question ${turn}`, `Reply ${turn}`, `q-${turn}`);
      }
      h.inputs.at(-1).callbacks.onResult({ text: 'Question 10', final: true, resultId: 'q-10' });
      controller.doneSpeaking();
      if (phase === 'speaking') {
        h.requests.at(-1).work.resolve({ reply: 'Reply 10' });
        await h.settle();
      }
      assert.equal(controller.getSnapshot().state, phase);
      assert.equal(controller.interrupt(), true);
      assert.equal(controller.getSnapshot().state, 'ended');
      assert.equal(controller.getSnapshot().submittedTurns, 10);
      assert.equal(h.inputs.length, 10);
      assert.equal(h.requests.length, 10);
      assert.equal(controller.resume(), false);
      if (phase === 'speaking') {
        assert.equal(controller.getSnapshot().transcript.at(-1).playbackStatus, 'interrupted');
        h.speeches.at(-1).onEnded();
      } else {
        h.requests.at(-1).work.resolve({ reply: 'Late final reply' });
        await h.settle();
      }
      assert.equal(controller.getSnapshot().state, 'ended');
      assert.equal(h.inputs.length, 10);
    });
  }
});

test('duplicate resultIds are ignored and distinct finalized segments accumulate once', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const input = h.inputs.at(-1);
  input.callbacks.onResult({ text: 'Tell me', final: true, resultId: 'segment-1' });
  input.callbacks.onResult({ text: 'Tell me', final: true, resultId: 'segment-1' });
  input.callbacks.onResult({ text: 'more', final: true, resultId: 'segment-2' });
  h.advance(4500);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].text, 'Tell me more');
});

test('an overlong learner turn is shown intact and rejected before submission', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const input = h.inputs.at(-1);
  const overlong = `${'x'.repeat(1200)} do not harm myself`;
  input.callbacks.onResult({ text: overlong, final: true, resultId: 'bounded' });
  assert.equal(controller.doneSpeaking(), false);
  assert.equal(h.requests.length, 0);
  assert.equal(controller.getSnapshot().turnCount, 0);
  assert.equal(controller.getSnapshot().draft, overlong);
  assert.equal(controller.getSnapshot().state, 'error');
  assert.match(controller.getSnapshot().error, /1,200 characters/);
});

test('patient replies are never silently truncated', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const reply = `${'patient '.repeat(170)}complete`;
  h.inputs.at(-1).callbacks.onResult({ text: 'Please continue.', final: true, resultId: 'continue' });
  h.advance(4500);
  h.requests[0].work.resolve({ reply });
  await h.settle();
  assert.equal(h.speeches.at(-1).text, reply);
  assert.equal(controller.getSnapshot().transcript.at(-1).text, reply);
});

test('new speech activity clears an old-final timer until speech ends or a new final arrives', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const input = h.inputs.at(-1);
  input.callbacks.onResult({ text: 'Could you explain', final: true, resultId: 'first' });
  h.advance(700);
  input.callbacks.onStart();
  h.advance(2000);
  assert.equal(h.requests.length, 0);
  assert.equal(controller.getSnapshot().state, 'listening');
  input.callbacks.onResult({ text: 'what happened?', final: true, resultId: 'second' });
  input.callbacks.onEnd();
  h.advance(4499);
  assert.equal(h.requests.length, 0);
  h.advance(1);
  assert.equal(h.requests[0].text, 'Could you explain what happened?');
});

test('recognition remains starting until ready and ignores capture and stale readiness callbacks', () => {
  const h = harness({ delayedReady: true });
  const controller = SPInterviewTurns.createController(h.deps);
  controller.start();
  h.speeches[0].onEnded();
  const firstInput = h.inputs[0];
  assert.equal(controller.getSnapshot().state, 'starting');
  firstInput.callbacks.onStart();
  firstInput.callbacks.onResult({ text: 'Too early', final: true, resultId: 'early' });
  h.advance(5000);
  assert.equal(h.requests.length, 0);
  assert.equal(controller.getSnapshot().draft, '');

  firstInput.callbacks.onReady();
  assert.equal(controller.getSnapshot().state, 'listening');
  controller.pause();
  firstInput.callbacks.onReady();
  assert.equal(controller.getSnapshot().state, 'paused');

  controller.resume();
  const secondInput = h.inputs[1];
  assert.equal(controller.getSnapshot().state, 'starting');
  controller.end();
  secondInput.callbacks.onReady();
  assert.equal(controller.getSnapshot().state, 'ended');
});

test('a recognizer reconnect preserves finalized text and restarts silence timing after readiness', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  const input = h.inputs[0];
  input.callbacks.onResult({ text: 'Preserve this question', final: true, resultId: 'preserved' });
  h.advance(500);
  assert.equal(typeof input.callbacks.onConnecting, 'function');
  input.callbacks.onConnecting();
  assert.equal(controller.getSnapshot().state, 'starting');
  assert.equal(controller.getSnapshot().draft, 'Preserve this question');
  h.advance(2000);
  assert.equal(h.requests.length, 0);
  input.callbacks.onReady();
  assert.equal(controller.getSnapshot().state, 'listening');
  h.advance(4499);
  assert.equal(h.requests.length, 0);
  h.advance(1);
  assert.equal(h.requests[0].text, 'Preserve this question');
});

test('actor, recognition, and unsupported speech failures enter a stable error state', async (t) => {
  await t.test('actor rejection', async () => {
    const h = harness();
    const controller = SPInterviewTurns.createController(h.deps);
    await beginListening(controller, h);
    h.inputs.at(-1).callbacks.onResult({ text: 'Hello', final: true, resultId: 'hello' });
    h.advance(4500);
    h.requests[0].work.reject(new Error('Actor failed'));
    await h.settle();
    assert.equal(controller.getSnapshot().state, 'error');
    assert.equal(controller.getSnapshot().error, 'Actor failed');
  });

  await t.test('input callback error', async () => {
    const h = harness();
    const controller = SPInterviewTurns.createController(h.deps);
    await beginListening(controller, h);
    h.inputs.at(-1).callbacks.onError(new Error('Recognition failed'));
    assert.equal(controller.getSnapshot().state, 'error');
    assert.equal(controller.resume(), true);
    assert.equal(controller.getSnapshot().state, 'listening');
    assert.equal(controller.getSnapshot().error, null);
  });

  await t.test('unsupported speech', () => {
    const h = harness({ speakThrows: true });
    const controller = SPInterviewTurns.createController(h.deps);
    assert.doesNotThrow(() => controller.start());
    assert.equal(controller.getSnapshot().state, 'error');
    assert.equal(controller.getSnapshot().error, 'Speech unavailable');
  });
});

test('a submitted question is pending until Dana has a visible reply', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  h.inputs.at(-1).callbacks.onResult({ text: 'What has been going on recently?', final: true, resultId: 'question' });
  controller.doneSpeaking();
  const pendingSnapshot = controller.getSnapshot();
  assert.deepEqual(pendingSnapshot.transcript.at(-1), { who: 'me', text: 'What has been going on recently?', responseStatus: 'pending' });
  assert.equal(controller.doneSpeaking(), false);
  assert.equal(h.requests[0].options.signal.aborted, false);
  assert.equal(h.requests.length, 1);
  h.requests[0].work.resolve({ reply: 'Mornings have been hard.' });
  await h.settle();
  assert.deepEqual(controller.getSnapshot().transcript.at(-2), { who: 'me', text: 'What has been going on recently?' });
  assert.equal(controller.getSnapshot().transcript.at(-1).text, 'Mornings have been hard.');
  assert.equal(pendingSnapshot.transcript.at(-1).responseStatus, 'pending');
});

test('failed question annotations survive Resume and End without automatically resending', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  h.inputs.at(-1).callbacks.onResult({ text: 'Help me understand.', final: true, resultId: 'question' });
  controller.doneSpeaking();
  h.requests[0].work.reject(new Error('Actor unavailable'));
  await h.settle();
  const expected = { who: 'me', text: 'Help me understand.', responseStatus: 'failed' };
  assert.deepEqual(controller.getSnapshot().transcript.at(-1), expected);
  assert.equal(controller.resume(), true);
  assert.equal(controller.getSnapshot().error, null);
  assert.deepEqual(controller.getSnapshot().transcript.at(-1), expected);
  h.advance(60000);
  assert.equal(h.requests.length, 1);
  controller.end();
  assert.deepEqual(controller.getSnapshot().transcript.at(-1), expected);
});

test('Pause, End, and Interrupt preserve a cancelled question despite late request errors', async (t) => {
  for (const action of ['pause', 'end', 'interrupt']) {
    await t.test(action, async () => {
      const h = harness();
      const controller = SPInterviewTurns.createController(h.deps);
      await beginListening(controller, h);
      h.inputs.at(-1).callbacks.onResult({ text: 'Please explain.', final: true, resultId: 'question' });
      controller.doneSpeaking();
      controller[action]();
      h.requests[0].work.reject(new Error('Late request failure'));
      await h.settle();
      assert.deepEqual(controller.getSnapshot().transcript.at(-1), { who: 'me', text: 'Please explain.', responseStatus: 'cancelled' });
      assert.equal(controller.getSnapshot().error, null);
      assert.equal(h.requests.length, 1);
    });
  }
});

test('playback failure stays on the visible Dana reply, not the answered question', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  h.inputs.at(-1).callbacks.onResult({ text: 'How are you?', final: true, resultId: 'question' });
  controller.doneSpeaking();
  h.requests[0].work.resolve({ reply: 'I have been tired.' });
  await h.settle();
  h.speeches.at(-1).onError(new Error('Audio unavailable'));
  assert.deepEqual(controller.getSnapshot().transcript.at(-2), { who: 'me', text: 'How are you?' });
  assert.deepEqual(controller.getSnapshot().transcript.at(-1), { who: 'pt', text: 'I have been tired.', playbackStatus: 'failed' });
});

test('an error after the tenth submission cannot be resumed into an eleventh turn', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  for (let turn = 1; turn < 10; turn += 1) {
    await completeTurn(controller, h, `Question ${turn}`, `Reply ${turn}`, `q-${turn}`);
  }
  const inputCountBeforeTenth = h.inputs.length;
  const input = h.inputs.at(-1);
  input.callbacks.onResult({ text: 'Question 10', final: true, resultId: 'q-10' });
  h.advance(4500);
  h.requests.at(-1).work.reject(new Error('Final actor failure'));
  await h.settle();
  assert.equal(controller.getSnapshot().turnCount, 10);
  assert.equal(controller.getSnapshot().state, 'error');
  assert.equal(controller.resume(), false);
  assert.equal(controller.getSnapshot().state, 'ended');
  assert.equal(h.inputs.length, inputCountBeforeTenth);
});

test('synchronous adapter callbacks are safe and snapshots are detached from controller state', () => {
  const h = harness({ syncInputStart: true });
  const controller = SPInterviewTurns.createController(h.deps);
  controller.start();
  h.speeches[0].onEnded();
  assert.equal(controller.getSnapshot().state, 'listening');
  const snapshot = controller.getSnapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.transcript), true);
  assert.throws(() => snapshot.transcript.push({ who: 'me', text: 'mutation' }));
});

test('a one-turn retry starts listening without repeating an opening and ends after its single reply', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController({...h.deps, maxTurns: 1, skipOpening: true});
  controller.start();
  assert.equal(controller.getSnapshot().phase, 'listening');
  assert.equal(h.speeches.length, 0);
  controller.setHoldTurn(true);
  h.inputs[0].callbacks.onResult({text: 'What has this been like for you?', final: true, resultId: 'alternative'});
  h.advance(60000);
  assert.equal(h.requests.length, 0);
  controller.doneSpeaking();
  h.requests[0].work.resolve({reply: 'It has been hard.'}); await h.settle();
  h.speeches[0].onEnded();
  assert.equal(controller.getSnapshot().phase, 'ended');
  assert.equal(controller.getSnapshot().turnCount, 1);
  assert.equal(controller.getSnapshot().transcript.length, 2);
  assert.equal(h.inputs.length, 1);
  assert.equal(controller.resume(), false);
});

test('a submitted one-turn retry cannot gain a second attempt by interruption or recovery', async () => {
  for (const action of ['interrupt', 'pause', 'failure']) {
    const h = harness();
    const controller = SPInterviewTurns.createController({...h.deps, maxTurns: 1, skipOpening: true});
    controller.start();
    h.inputs[0].callbacks.onResult({text: 'Another wording.', final: true, resultId: 'alternative'});
    controller.doneSpeaking();
    if (action === 'failure') { h.requests[0].work.reject(new Error('Unavailable')); await h.settle(); }
    else controller[action]();
    assert.equal(controller.resume(), false);
    assert.equal(controller.getSnapshot().phase, 'ended');
    assert.equal(h.requests.length, 1);
    assert.equal(h.inputs.length, 1);
  }
});

test('only confirmed growing reply prefixes survive interruption; successful playback removes the extra marker', async () => {
  const h = harness();
  const controller = SPInterviewTurns.createController(h.deps);
  await beginListening(controller, h);
  h.inputs[0].callbacks.onResult({text: 'How are you?', final: true, resultId: 'question'});
  controller.doneSpeaking();
  h.requests[0].work.resolve({reply: 'I am tired. Nothing feels easy.'}); await h.settle();
  const speech = h.speeches.at(-1);
  speech.onHeardText('Unrelated words');
  assert.equal(controller.getSnapshot().transcript.at(-1).heardText, undefined);
  speech.onHeardText('I am tired.');
  const recorded = controller.getSnapshot();
  controller.interrupt();
  speech.onHeardText('I am tired. Nothing feels easy.');
  assert.equal(controller.getSnapshot().transcript.at(-1).heardText, 'I am tired.');
  assert.equal(recorded.transcript.at(-1).heardText, 'I am tired.');
  h.inputs.at(-1).callbacks.onResult({text: 'Tell me more.', final: true, resultId: 'second'});
  controller.doneSpeaking(); h.requests[1].work.resolve({reply: 'Getting out of bed is hard.'}); await h.settle();
  h.speeches.at(-1).onHeardText('Getting out of bed is hard.');
  h.speeches.at(-1).onEnded();
  assert.deepEqual(controller.getSnapshot().transcript.at(-1), {who: 'pt', text: 'Getting out of bed is hard.', playbackStatus: 'played'});
});

test('snapshots expose existing speech activity before words arrive and clear it when capture stops',async()=>{
  const h=harness(),controller=SPInterviewTurns.createController(h.deps);await beginListening(controller,h);
  const input=h.inputs[0];assert.equal(controller.getSnapshot().speechActive,false);
  input.callbacks.onStart();assert.equal(controller.getSnapshot().speechActive,true);assert.equal(controller.getSnapshot().draft,'');
  const speaking=controller.getSnapshot();controller.pause();assert.equal(controller.getSnapshot().speechActive,false);assert.equal(speaking.speechActive,true);
  input.callbacks.onStart();assert.equal(controller.getSnapshot().speechActive,false);
});

test('speech detection remains latched after speechend and reconnect until the learner capture resets',async()=>{
  const h=harness(),controller=SPInterviewTurns.createController(h.deps);await beginListening(controller,h);
  const input=h.inputs[0];assert.equal(controller.getSnapshot().speechDetected,false);
  input.callbacks.onStart();assert.equal(controller.getSnapshot().speechDetected,true);
  input.callbacks.onEnd();assert.equal(controller.getSnapshot().speechActive,false);assert.equal(controller.getSnapshot().speechDetected,true);
  input.callbacks.onConnecting();input.callbacks.onReady();
  input.callbacks.onResult({text:'',final:false});
  assert.equal(controller.getSnapshot().speechDetected,true);assert.equal(controller.getSnapshot().draft,'');
  const detected=controller.getSnapshot();
  input.callbacks.onResult({text:'I did not mean that.',final:true,resultId:'delayed'});
  assert.equal(controller.getSnapshot().draft,'I did not mean that.');assert.equal(controller.getSnapshot().speechDetected,true);
  controller.pause();assert.equal(controller.getSnapshot().speechDetected,false);assert.equal(detected.speechDetected,true);
  input.callbacks.onStart();assert.equal(controller.getSnapshot().speechDetected,false);
  controller.resume();h.inputs.at(-1).callbacks.onResult({text:'Words without a speechstart event',final:false});
  assert.equal(controller.getSnapshot().speechDetected,true);
});
