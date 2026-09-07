import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../sp-interview.conversation.js');

const voice = (name, extra = {}) => ({name, voiceURI: `voice:${name}`, lang: 'en-US', localService: true, ...extra});

function speechHarness(initialVoices = []) {
  let voices = initialVoices;
  const spoken = [], timers = new Map(), listeners = new Set();
  let nextTimer = 0, cancelled = 0;
  class Utterance { constructor(text) { this.text = text; } }
  const env = {
    SpeechSynthesisUtterance: Utterance,
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, {callback, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    speechSynthesis: {
      getVoices() { return voices; },
      speak(utterance) { spoken.push(utterance); },
      cancel() { cancelled++; },
      addEventListener(name, callback) { assert.equal(name, 'voiceschanged'); listeners.add(callback); },
      removeEventListener(name, callback) { assert.equal(name, 'voiceschanged'); listeners.delete(callback); }
    }
  };
  return {
    env, spoken, timers, listeners,
    get cancelled() { return cancelled; },
    setVoices(next) { voices = next; },
    notifyVoices() { [...listeners].forEach(callback => callback()); },
    expire() {
      for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); }
    }
  };
}

test('voice choices keep ordinary local English voices and rank natural quality first', () => {
  const noveltyNames = ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Ralph', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Superstar', 'Junior'];
  const preferred = ['Samantha', 'Ava', 'Allison', 'Susan', 'Zoe'].map(name => voice(name));
  const premium = voice('Serena (Premium)', {lang: 'en-GB'});
  const ordinary = voice('Alex'), otherEnglish = voice('Daniel', {lang: 'en_GB'});
  const unspecifiedLocal = voice('Karen', {lang: 'en-AU', localService: undefined});
  const input = [otherEnglish, ordinary, ...preferred.slice().reverse(), unspecifiedLocal,
    ...noveltyNames.map(name => voice(name)), voice('Remote natural', {localService: false}),
    voice('Amelie', {lang: 'fr-FR'}), premium];
  const result = api.availableVoices(input);
  assert.deepEqual(result.slice(0, 7), [premium, ...preferred, ordinary]);
  assert.deepEqual(new Set(result.slice(7)), new Set([otherEnglish, unspecifiedLocal]));
  assert.equal(input[0], otherEnglish, 'ranking must not mutate the browser voice list');
});

test('enhanced, natural and neural voices outrank ordinary voices without replacing explicit choices', () => {
  for (const label of ['Enhanced', 'Natural', 'Neural']) {
    const ordinary = voice('Samantha'), upgraded = voice(`Other ${label}`);
    assert.equal(api.availableVoices([ordinary, upgraded])[0], upgraded);
    assert.equal(api.selectVoice([ordinary, upgraded], ordinary.voiceURI), ordinary);
    assert.equal(api.selectVoice([ordinary, upgraded], 'missing'), upgraded);
  }
  const ordinary = voice('Samantha'), remote = voice('Remote', {localService: false}), novelty = voice('Boing');
  assert.equal(api.selectVoice([remote, ordinary, novelty], remote.voiceURI), ordinary);
  assert.equal(api.selectVoice([remote, ordinary, novelty], novelty.voiceURI), ordinary);
  assert.equal(api.selectVoice([remote, novelty]), null);
  assert.equal(api.selectVoice([]), null);
});

test('speaker uses the chosen voice at a normal pace and omits written stage directions', () => {
  const defaultVoice = voice('Samantha'), selected = voice('Serena', {lang: 'en-GB'});
  const harness = speechHarness([defaultVoice, selected]), actualVoices = [];
  const speaker = api.createSpeaker(harness.env, {
    text: '[Looks down.] *sighs* I have been tired. [Quietly.]', voice: selected,
    onVoice(value) { actualVoices.push(value); }, onEnded() {}, onError(error) { throw error; }
  });
  assert.equal(harness.spoken.length, 1);
  const utterance = harness.spoken[0];
  assert.equal(utterance.text, 'I have been tired.');
  assert.equal(utterance.voice, selected);
  assert.equal(utterance.lang, 'en-GB');
  assert.equal(utterance.rate, 1);
  assert.equal(utterance.pitch, 1);
  assert.deepEqual(actualVoices, [selected]);
  assert.equal(harness.timers.size, 0);
  speaker.stop();
});

test('speaker waits for voices to load and ignores repeated readiness signals', () => {
  const harness = speechHarness(), actualVoices = [];
  const speaker = api.createSpeaker(harness.env, {
    text: 'Hello.', onVoice(value) { actualVoices.push(value); }, onEnded() {}, onError(error) { throw error; }
  });
  assert.equal(harness.spoken.length, 0, 'do not lock the first reply to an unloaded default voice');
  assert.equal(harness.listeners.size, 1);
  const staleReadiness = [...harness.listeners][0], staleTimeout = [...harness.timers.values()][0].callback;
  harness.notifyVoices();
  assert.equal(harness.spoken.length, 0, 'an empty voiceschanged event is not ready');
  const selected = voice('Samantha (Enhanced)'); harness.setVoices([selected]);
  harness.notifyVoices(); staleReadiness(); staleTimeout();
  assert.equal(harness.spoken.length, 1);
  assert.equal(harness.spoken[0].voice, selected);
  assert.deepEqual(actualVoices, [selected]);
  assert.equal(harness.listeners.size, 0);
  assert.equal(harness.timers.size, 0);
  speaker.stop();
});

test('voice loading has a 1500 ms ceiling and then reports missing voices without default playback', () => {
  const harness = speechHarness(), errors = [];
  const speaker = api.createSpeaker(harness.env, {text: 'Hello.', onEnded() {}, onError(error) { errors.push(error); }});
  assert.equal(harness.spoken.length, 0);
  assert.deepEqual([...harness.timers.values()].map(timer => timer.delay), [1500]);
  harness.expire();
  assert.equal(harness.spoken.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /voice/i);
  assert.equal(harness.listeners.size, 0);
  speaker.stop();
});

test('unavailable or ineligible voices fail visibly instead of silently using a novelty or remote voice', () => {
  for (const voices of [[], [voice('Albert'), voice('Remote', {localService: false})]]) {
    const harness = speechHarness(voices), errors = [];
    delete harness.env.speechSynthesis.addEventListener;
    delete harness.env.speechSynthesis.removeEventListener;
    const speaker = api.createSpeaker(harness.env, {text: 'Hello.', onEnded() {}, onError(error) { errors.push(error); }});
    assert.equal(harness.spoken.length, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /voice/i);
    assert.equal(harness.timers.size, 0);
    speaker.stop();
  }
});

test('stopping during voice loading prevents late readiness or timeout from starting audio', () => {
  const harness = speechHarness();
  const speaker = api.createSpeaker(harness.env, {text: 'Hello.', onEnded() { assert.fail('stopped audio ended'); }, onError() { assert.fail('stopped audio errored'); }});
  const staleReadiness = [...harness.listeners][0], staleTimeout = [...harness.timers.values()][0].callback;
  speaker.stop();
  assert.equal(harness.listeners.size, 0);
  assert.equal(harness.timers.size, 0);
  harness.setVoices([voice('Samantha')]); staleReadiness(); staleTimeout();
  assert.equal(harness.spoken.length, 0);
});

test('playback reports only one completion or error and detaches stopped callbacks', () => {
  const harness = speechHarness([voice('Samantha')]); let completed = 0, failed = 0;
  const speaker = api.createSpeaker(harness.env, {text: 'Hello.', onEnded() { completed++; }, onError() { failed++; }});
  const utterance = harness.spoken[0], end = utterance.onend, error = utterance.onerror;
  error(); end(); error();
  assert.equal(failed, 1);
  assert.equal(completed, 0);
  speaker.stop();
  assert.equal(utterance.onend, null);
  assert.equal(utterance.onerror, null);
  end(); error();
  assert.equal(failed, 1);
  assert.equal(completed, 0);
});
