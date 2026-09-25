import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {createController} = require('../sp-interview.turns.js');
const modulePath = new URL('../sp-interview.live.js', import.meta.url);
const sessionId = 'dana-session-123';
const audioUrl = '/api/dana/audio/12345678-abcd-4abc-8abc-123456789012';
const reply = 'I have been having trouble getting to sleep.';
const splitReply = 'Mornings are hard. I feel stuck before I get out of bed.';
const splitSegments = [
  {audioUrl: audioUrl + '-first', text: 'Mornings are hard.'},
  {audioUrl: audioUrl + '-second', text: ' I feel stuck before I get out of bed.'},
];
const audioBytes = new Uint8Array([73, 68, 51, 4, 0, 1, 2, 3]);
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json'}});
}
function api() {
  assert.ok(fs.existsSync(modulePath), 'the local live conversation client must exist');
  return require(modulePath.pathname);
}
async function waitFor(check) {
  for (let i = 0; i < 30 && !check(); i++) await tick();
  assert.ok(check(), 'expected asynchronous client work to settle');
}

function fixture() {
  const requests = [], players = [], urls = [], revoked = [], timers = new Map();
  let nextTimer = 0, fetchOverride = null, playOverride = null, latestTurn = 1;
  class LocalURL extends URL {
    static createObjectURL(blob) { const url = 'blob:local/' + urls.length; urls.push({url, blob}); return url; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  class Audio {
    constructor(src = '') { this.src = src; this.listeners = new Map(); players.push(this); }
    play() { this.played = true; this.playCount = (this.playCount || 0) + 1; return playOverride ? playOverride() : Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { this.loads = (this.loads || 0) + 1; if (!this.src) this.released = true; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name, callback) { if (this.listeners.get(name) === callback) this.listeners.delete(name); }
    emit(name) { this['on' + name]?.(); this.listeners.get(name)?.(); }
  }
  const env = {
    location: {href: 'http://127.0.0.1:4318/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1', origin: 'http://127.0.0.1:4318'},
    AbortController, Blob, URL: LocalURL, Audio,
    crypto: {randomUUID() { return '12345678-abcd-4abc-8abc-123456789012'; }},
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, {callback, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(value, options = {}) {
      const request = {url: String(value), path: new URL(String(value), env.location.href).pathname, options};
      requests.push(request);
      if (fetchOverride) {
        const handled = fetchOverride(request);
        if (handled !== undefined) return handled;
      }
      if (request.path === '/api/dana/health') return json({configured: true});
      if (request.path === '/api/dana/session' && options.method === 'POST') return json({sessionId});
      if (request.path === '/api/dana/turn') { latestTurn = JSON.parse(options.body).turnId; return json({reply, audioUrl, turnId: latestTurn}); }
      if (request.path === audioUrl + '/status') return json({state: 'complete', turnId: latestTurn});
      if (request.path === audioUrl && options.method === 'DELETE') return json({cancelled: true});
      if (request.path.startsWith('/api/dana/session/' + sessionId + '/turn/') && options.method === 'DELETE') return json({cancelled: true});
      if (request.path === audioUrl) return new Response(audioBytes, {headers: {'content-type': 'audio/mpeg'}});
      if (request.path === '/api/dana/session/' + sessionId && options.method === 'DELETE') return json({ok: true});
      throw new Error('Unexpected fixture URL: ' + request.path);
    },
  };
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) {
    Object.defineProperty(env, name, {get() { throw new Error('Conversation must not use persistent ' + name); }});
  }
  const client = api().createClient(env);
  return {env, client, requests, players, urls, revoked, timers,
    fetchOverride(value) { fetchOverride = value; }, playOverride(value) { playOverride = value; }};
}

function installSplit(f, override) {
  f.fetchOverride(request => {
    const handled = override?.(request);
    if (handled !== undefined) return handled;
    if (request.path === '/api/dana/turn' && JSON.parse(request.options.body).turnId === 1) return json({reply: splitReply, audioSegments: splitSegments, turnId: 1});
    if (splitSegments.some(segment => request.path === segment.audioUrl + '/status')) return json({state: 'complete', turnId: 1});
  });
}

test('End completes local cleanup when session deletion stalls, even if fetch ignores abort', async () => {
  const f=fixture(), stalled=deferred();let deleteSignal;
  await f.client.start();
  f.fetchOverride(request=>{
    if(request.path==='/api/dana/session/'+sessionId && request.options.method==='DELETE'){
      deleteSignal=request.options.signal;return stalled.promise;
    }
  });
  let ended=false;const ending=f.client.end().then(()=>{ended=true;});
  await tick();
  assert.equal(ended,false);
  const deadline=[...f.timers.values()].find(timer=>timer.delay===1500);
  assert.ok(deadline,'session deletion has a bounded local wait');
  deadline.callback();await ending;
  assert.equal(deleteSignal.aborted,true);
  assert.equal(ended,true);
  assert.equal(f.timers.size,0);
  await assert.rejects(f.client.start(),{name:'AbortError'});
  stalled.resolve(json({ok:true}));await tick();
});

test('the turn controller preserves exact live reply whitespace through segmented audio lookup', async t => {
  for (const interior of ['\n\n', '  ']) {
    await t.test(interior === '\n\n' ? 'paragraph break' : 'repeated spaces', async t => {
      const f = fixture(); t.after(() => f.client.end());
      const lead = 'I have been tired.', exactReply = lead + interior + 'Nothing feels easy.';
      f.fetchOverride(request => {
        if (request.path === '/api/dana/turn') return json({reply: exactReply, turnId: 1, audioSegments: [
          {audioUrl: splitSegments[0].audioUrl, text: lead},
          {audioUrl: splitSegments[1].audioUrl, text: exactReply.slice(lead.length)},
        ]});
        if (request.path.endsWith('/status')) return json({state: 'complete', turnId: 1});
      });
      await f.client.start();
      let input;
      const controller = createController({
        opening: 'Opening question.',
        input(callbacks) { input = callbacks; return {start() { callbacks.onReady(); }, stop() {}}; },
        speak(options) {
          if (options.text === 'Opening question.') { queueMicrotask(options.onEnded); return {stop() {}}; }
          return f.client.speak(options);
        },
        respond(text, options) { return f.client.respond(text, {signal: options.signal, turnId: controller.getSnapshot().turnCount}); },
        setTimeout: f.env.setTimeout, clearTimeout: f.env.clearTimeout,
      });
      t.after(() => controller.end());
      controller.start(); await tick();
      input.onResult({text: '  What has\n\nchanged  recently? ', final: true, resultId: 'question'});
      controller.doneSpeaking();
      await waitFor(() => controller.getSnapshot().phase !== 'awaiting_patient');
      assert.equal(controller.getSnapshot().phase, 'speaking', controller.getSnapshot().error);
      assert.equal(controller.getSnapshot().transcript.at(-1).text, exactReply);
      assert.equal(JSON.parse(f.requests.find(request => request.path === '/api/dana/turn').options.body).text, 'What has changed recently?');
      assert.equal(f.players.length, 2);
      f.players[0].emit('ended'); f.players[1].emit('ended');
      await waitFor(() => controller.getSnapshot().phase === 'listening');
      assert.equal(controller.getSnapshot().transcript.at(-1).playbackStatus, 'played');
    });
  }
});

test('split audio preloads both parts, plays in order without awaiting receipts, and acknowledges only full completion', async t => {
  const f = fixture(); t.after(() => f.client.end());
  const firstReceipt = deferred();
  installSplit(f, request => request.path === splitSegments[0].audioUrl + '/status' ? firstReceipt.promise : undefined);
  await f.client.respond('What happens in the morning?', {turnId: 1});
  let ended = 0; const errors = [];
  f.client.speak({text: splitReply, onEnded() { ended++; }, onError(error) { errors.push(error); }});
  assert.deepEqual(f.players.map(player => player.src), splitSegments.map(segment => segment.audioUrl));
  assert.deepEqual(f.players.map(player => player.preload), ['auto', 'auto']);
  assert.ok(f.players.every(player => player.loads > 0), 'both media requests preload immediately');
  assert.deepEqual(f.players.map(player => !!player.played), [true, false]);
  const firstEnded = f.players[0].onended;
  firstEnded(); firstEnded();
  assert.equal(f.players[1].playCount, 1, 'the second segment starts once, before the first receipt resolves');
  assert.equal(ended, 0);
  f.players[1].emit('ended');
  await tick(); await tick();
  assert.equal(ended, 0, 'the final media event cannot substitute for every receipt');
  firstReceipt.resolve(json({state: 'complete', turnId: 1}));
  await waitFor(() => ended === 1);
  assert.deepEqual(errors, []);
  assert.equal(f.requests.filter(request => request.options.method === 'DELETE').length, 0);
  await f.client.respond('Please continue.', {turnId: 2});
  assert.equal(JSON.parse(f.requests.filter(request => request.path === '/api/dana/turn')[1].options.body).previousPlayback, 'played');
});

test('split audio failure cancels the whole turn and never acknowledges a partial reply', async t => {
  for (const failure of ['second load', 'second receipt', 'first receipt identity']) {
    await t.test(failure, async t => {
      const f = fixture(); t.after(() => f.client.end());
      installSplit(f, request => {
        if (failure === 'second receipt' && request.path === splitSegments[1].audioUrl + '/status') return json({state: 'failed', turnId: 1});
        if (failure === 'first receipt identity' && request.path === splitSegments[0].audioUrl + '/status') return json({state: 'complete', turnId: 2});
      });
      await f.client.respond('What happens in the morning?', {turnId: 1});
      let ended = 0, error;
      f.client.speak({text: splitReply, onEnded() { ended++; }, onError(problem) { error = problem; }});
      f.players[0].emit('ended');
      if (failure === 'second load') f.players[1].emit('error');
      else if (failure === 'second receipt') f.players[1].emit('ended');
      await waitFor(() => error);
      assert.equal(ended, 0);
      assert.ok(f.players.every(player => player.paused && player.src === ''));
      assert.equal(f.requests.find(request => request.options.method === 'DELETE').path, '/api/dana/session/' + sessionId + '/turn/1');
      await f.client.respond('Please continue.', {turnId: 2});
      const body = JSON.parse(f.requests.filter(request => request.path === '/api/dana/turn')[1].options.body);
      assert.equal(body.previousTurnId, 1);
      assert.equal(body.previousPlayback, 'interrupted');
    });
  }
});

test('stopping split playback or receipt verification cancels every segment and waits before the next turn', async t => {
  for (const phase of ['first segment', 'receipt']) {
    await t.test(phase, async t => {
      const f = fixture(); t.after(() => f.client.end());
      const receipt = deferred(), cancellation = deferred();
      installSplit(f, request => {
        if (request.path === splitSegments[0].audioUrl + '/status') return receipt.promise;
        if (request.path === '/api/dana/session/' + sessionId + '/turn/1' && request.options.method === 'DELETE') return cancellation.promise;
      });
      await f.client.respond('What happens in the morning?', {turnId: 1});
      let callbacks = 0;
      const handle = f.client.speak({text: splitReply, onEnded() { callbacks++; }, onError() { callbacks++; }});
      const firstEnded = f.players[0].onended, secondEnded = f.players[1].onended;
      if (phase === 'receipt') { firstEnded(); secondEnded(); }
      handle.stop();
      firstEnded(); secondEnded();
      receipt.resolve(json({state: 'complete', turnId: 1}));
      const next = f.client.respond('Please continue.', {turnId: 2});
      await tick(); await tick();
      assert.equal(callbacks, 0);
      assert.equal(!!f.players[1].played, phase === 'receipt');
      assert.ok(f.players.every(player => player.paused && player.src === ''));
      assert.equal(f.requests.filter(request => request.path === '/api/dana/turn').length, 1);
      cancellation.resolve(json({cancelled: true}));
      await next;
      assert.equal(JSON.parse(f.requests.filter(request => request.path === '/api/dana/turn')[1].options.body).previousPlayback, 'interrupted');
    });
  }
});

test('segmented metadata rejects text changes, duplicate links, empty parts, oversized arrays and ambiguous legacy fields', async t => {
  const invalid = [
    {audioSegments: []},
    {audioSegments: [...splitSegments, splitSegments[1]]},
    {audioSegments: [splitSegments[0], {...splitSegments[1], audioUrl: splitSegments[0].audioUrl}]},
    {audioSegments: [splitSegments[0], {...splitSegments[1], text: splitSegments[1].text.trim()}]},
    {audioSegments: [{...splitSegments[0], text: ' '}, {...splitSegments[1], text: splitReply}]},
    {audioSegments: [splitSegments[0], {...splitSegments[1], audioUrl: 'https://example.com/audio.mp3'}]},
    {audioSegments: splitSegments, audioUrl},
    {audioSegments: null},
  ];
  for (const metadata of invalid) {
    const f = fixture(); t.after(() => f.client.end());
    f.fetchOverride(request => request.path === '/api/dana/turn' ? json({reply: splitReply, turnId: 1, ...metadata}) : undefined);
    await assert.rejects(f.client.respond('How are mornings?', {turnId: 1}), /invalid/);
    assert.equal(f.players.length, 0);
    assert.equal(f.requests.find(request => request.options.method === 'DELETE').path, '/api/dana/session/' + sessionId + '/turn/1');
  }
});

test('a one-element audioSegments response preserves exact reply playback', async t => {
  const f = fixture(); t.after(() => f.client.end());
  f.fetchOverride(request => request.path === '/api/dana/turn' ? json({reply, turnId: 1, audioSegments: [{audioUrl, text: reply}]}) : undefined);
  assert.deepEqual(await f.client.respond('How is sleep?', {turnId: 1}), {reply});
  let ended = 0;
  f.client.speak({text: reply, onEnded() { ended++; }, onError(error) { throw error; }});
  assert.equal(f.players.length, 1);
  f.players[0].emit('ended');
  await waitFor(() => ended === 1);
});

test('live client shares one session startup and uses same-origin requests without browser credentials', async t => {
  const f = fixture(); t.after(() => f.client.end());
  assert.equal(await f.client.health(), true);
  assert.deepEqual(await Promise.all([f.client.start(), f.client.start()]), [sessionId, sessionId]);
  assert.equal(f.requests.filter(request => request.path === '/api/dana/session').length, 1);
  f.client.openingPlayed();
  const question = 'How have you been sleeping?';
  assert.deepEqual(await f.client.respond(question, {turnId: 1, previousPlayback: 'played'}), {reply});
  const turn = f.requests.find(request => request.path === '/api/dana/turn');
  const body = JSON.parse(turn.options.body);
  assert.equal(body.text, question);
  assert.equal(body.sessionId, sessionId);
  assert.equal(body.turnId, 1);
  assert.equal(body.previousTurnId, null);
  assert.equal(body.previousPlayback, 'played');
  for (const request of f.requests) {
    const url = new URL(request.url, f.env.location.href);
    assert.equal(url.origin, f.env.location.origin);
    assert.equal(url.search, '');
    const headers = new Headers(request.options.headers);
    assert.equal(headers.has('authorization'), false);
    assert.equal(headers.has('x-api-key'), false);
    if (request.options.body) assert.match(headers.get('content-type') || '', /application\/json/);
  }
});

test('respond waits for session startup and then plays only the exact returned reply', async t => {
  const f = fixture(); t.after(() => f.client.end());
  const startup = deferred();
  f.fetchOverride(request => request.path === '/api/dana/session' ? startup.promise : undefined);
  const response = f.client.respond('What happens at bedtime?', {turnId: 1});
  await waitFor(() => f.requests.length === 1);
  assert.equal(f.requests[0].path, '/api/dana/session');
  assert.equal(f.requests.some(request => request.path === '/api/dana/turn'), false);
  startup.resolve(json({sessionId}));
  assert.deepEqual(await response, {reply});
  const endings = [], errors = [];
  const handle = f.client.speak({text: reply, onEnded() { endings.push('done'); }, onError(error) { errors.push(error); }});
  assert.equal(typeof handle.stop, 'function');
  await waitFor(() => f.players.length === 1 && f.players[0].played);
  assert.equal(f.players[0].src, audioUrl);
  assert.equal(f.requests.filter(request => request.path === audioUrl).length, 0, 'media playback starts directly without a full-buffer fetch');
  assert.equal(f.urls.length, 0, 'live streaming does not create a buffered Blob URL');
  const ended = f.players[0].onended || f.players[0].listeners.get('ended');
  ended(); ended();
  await waitFor(() => endings.length === 1);
  assert.deepEqual(endings, ['done']);
  assert.deepEqual(errors, []);
  const before = f.requests.length;
  try {
    f.client.speak({text: reply + ' Added words.', onEnded() { throw new Error('Unmatched text must not play'); }, onError(error) { errors.push(error); }});
  } catch (error) { errors.push(error); }
  await waitFor(() => errors.length === 1);
  assert.equal(f.requests.length, before, 'unmatched text cannot request arbitrary speech');
  assert.equal(f.players.length, 1);
});

test('aborting a learner turn prevents a late response from supplying playable audio', async t => {
  const f = fixture(); t.after(() => f.client.end());
  const pending = deferred(), abort = new AbortController();
  f.fetchOverride(request => request.path === '/api/dana/turn' ? pending.promise : undefined);
  const response = f.client.respond('Please tell me more.', {signal: abort.signal, turnId: 1});
  const rejected = assert.rejects(response);
  await waitFor(() => f.requests.some(request => request.path === '/api/dana/turn'));
  const turn = f.requests.find(request => request.path === '/api/dana/turn');
  abort.abort();
  assert.equal(turn.options.signal.aborted, true);
  pending.resolve(json({reply, audioUrl, turnId: 1}));
  await rejected;
  let failure;
  try {
    f.client.speak({text: reply, onEnded() { throw new Error('Canceled reply must not play'); }, onError(error) { failure = error; }});
  } catch (error) { failure = error; }
  await waitFor(() => failure);
  assert.equal(f.requests.some(request => request.path === audioUrl), false);
  assert.equal(f.players.length, 0);
});

test('discarding a reply while JSON is pending cannot acknowledge that unseen turn as played', async t => {
  const f = fixture(); t.after(() => f.client.end());
  await f.client.start(); f.client.openingPlayed();
  const parsing = deferred(), cancellation = deferred(), abort = new AbortController();
  let readingJSON = false;
  f.fetchOverride(request => {
    if (request.path === '/api/dana/session/' + sessionId + '/turn/1' && request.options.method === 'DELETE') return cancellation.promise;
    return request.path === '/api/dana/turn' && JSON.parse(request.options.body).turnId === 1
      ? {ok: true, json() { readingJSON = true; return parsing.promise; }} : undefined;
  });
  const first = f.client.respond('First question.', {turnId: 1, signal: abort.signal});
  const rejected = assert.rejects(first);
  await waitFor(() => readingJSON);
  abort.abort();
  const second = f.client.respond('Second question.', {turnId: 2, previousTurnId: 1, previousPlayback: 'played'});
  await tick();
  assert.equal(f.requests.filter(request => request.path === '/api/dana/turn').length, 1, 'next request waits for known-turn cancellation even while old JSON is pending');
  assert.equal(f.requests.find(request => request.options.method === 'DELETE').path, '/api/dana/session/' + sessionId + '/turn/1');
  parsing.resolve({reply, audioUrl, turnId: 1});
  await rejected;
  cancellation.resolve(json({cancelled: true}));
  await second;
  const secondBody = JSON.parse(f.requests.filter(request => request.path === '/api/dana/turn')[1].options.body);
  assert.equal(secondBody.previousTurnId, null, 'only the heard opening is acknowledged; discarded turn 1 is not');
  assert.equal(secondBody.previousPlayback, 'played');
  assert.equal(f.requests.some(request => request.path === audioUrl), false);
  await assert.rejects(f.client.respond('Do not retry the cancelled turn.', {turnId: 1}), /cancelled/i);
  assert.equal(f.requests.filter(request => request.path === '/api/dana/turn').length, 2);
});

test('an old request signal cannot cancel a successfully accepted reply', async t => {
  const f = fixture(); t.after(() => f.client.end());
  const signal = new AbortController();
  await f.client.respond('How is sleep?', {turnId: 1, signal: signal.signal});
  signal.abort();
  await tick();
  assert.equal(f.requests.some(request => request.options.method === 'DELETE'), false);
});

test('playback acknowledgement is tied to the accepted reply and actual audio completion', async t => {
  for (const completed of [false, true]) {
    await t.test(completed ? 'completed reply' : 'interrupted reply', async t => {
      const f = fixture(); t.after(() => f.client.end());
      f.client.openingPlayed(); // A preview before a session cannot acknowledge the encounter opening.
      await f.client.respond('First question.', {turnId: 1, previousTurnId: null, previousPlayback: 'played'});
      const firstBody = JSON.parse(f.requests.find(request => request.path === '/api/dana/turn').options.body);
      assert.equal(firstBody.previousPlayback, 'interrupted');
      let finished = false;
      const audio = f.client.speak({text: reply, onEnded() { finished = true; }, onError(error) { throw error; }});
      await waitFor(() => f.players.length === 1 && f.players[0].played);
      if (completed) { f.players[0].emit('ended'); await waitFor(() => finished); }
      else audio.stop();
      f.client.openingPlayed(); // A late opening callback cannot replace a generated reply's identity.
      await f.client.respond('Second question.', {turnId: 2, previousTurnId: 99, previousPlayback: completed ? 'interrupted' : 'played'});
      const secondBody = JSON.parse(f.requests.filter(request => request.path === '/api/dana/turn')[1].options.body);
      assert.equal(secondBody.previousTurnId, 1);
      assert.equal(secondBody.previousPlayback, completed ? 'played' : 'interrupted');
    });
  }
});

test('mismatched returned turn identity is rejected and cannot become playback history', async t => {
  const f = fixture(); t.after(() => f.client.end());
  f.fetchOverride(request => request.path === '/api/dana/turn' ? json({reply, audioUrl, turnId: 99}) : undefined);
  await assert.rejects(f.client.respond('First question.', {turnId: 1}), /invalid/i);
  f.fetchOverride(null);
  await f.client.respond('Second question.', {turnId: 2});
  const secondBody = JSON.parse(f.requests.filter(request => request.path === '/api/dana/turn')[1].options.body);
  assert.equal(secondBody.previousTurnId, null);
  assert.equal(secondBody.previousPlayback, 'interrupted');
});

test('stopping before playback starts cancels its producer and next respond waits for that cancellation', async t => {
  const f = fixture(); t.after(() => f.client.end());
  await f.client.respond('How is sleep?', {turnId: 1});
  const pending = deferred(), playing = deferred();
  f.playOverride(() => playing.promise);
  f.fetchOverride(request => request.path === '/api/dana/session/' + sessionId + '/turn/1' && request.options.method === 'DELETE' ? pending.promise : undefined);
  let callbacks = 0;
  const handle = f.client.speak({text: reply, onEnded() { callbacks++; }, onError() { callbacks++; }});
  const player = f.players[0], ended = player.onended;
  handle.stop();
  assert.equal(player.paused, true);
  assert.equal(player.src, '');
  assert.equal(player.released, true);
  assert.equal(f.requests.find(request => request.path === '/api/dana/session/' + sessionId + '/turn/1').options.keepalive, true);
  const nextTurn = f.client.respond('Please continue.', {turnId: 2});
  ended(); playing.reject(new Error('Playback aborted'));
  await tick(); await tick();
  assert.equal(callbacks, 0);
  assert.equal(f.requests.filter(request => request.path === '/api/dana/turn').length, 1);
  pending.resolve(json({cancelled: true}));
  await nextTurn;
  assert.equal(f.requests.filter(request => request.path === '/api/dana/turn').length, 2);
  assert.equal(f.urls.length, 0);
});

test('ended audio is heard only after the matching successful stream receipt', async t => {
  for (const receipt of [
    {state: 'pending', turnId: 1}, {state: 'streaming', turnId: 1},
    {state: 'failed', turnId: 1}, {state: 'cancelled', turnId: 1}, {state: 'complete', turnId: 2},
  ]) {
    const f = fixture(); t.after(() => f.client.end());
    await f.client.respond('How is sleep?', {turnId: 1});
    f.fetchOverride(request => request.path === audioUrl + '/status' ? json(receipt) : undefined);
    let ended = 0, failure;
    f.client.speak({text: reply, onEnded() { ended++; }, onError(error) { failure = error; }});
    f.players[0].emit('ended');
    await waitFor(() => failure);
    assert.equal(ended, 0);
    assert.match(failure.message, /complete reply/);
    await f.client.respond('Please continue.', {turnId: 2});
    const body = JSON.parse(f.requests.filter(request => request.path === '/api/dana/turn')[1].options.body);
    assert.equal(body.previousTurnId, 1);
    assert.equal(body.previousPlayback, 'interrupted');
  }
});

test('stop cancels pending completion verification and ignores its late successful receipt', async t => {
  const f = fixture(); t.after(() => f.client.end());
  await f.client.respond('How is sleep?', {turnId: 1});
  const receipt = deferred();
  f.fetchOverride(request => request.path === audioUrl + '/status' ? receipt.promise : undefined);
  let callbacks = 0;
  const handle = f.client.speak({text: reply, onEnded() { callbacks++; }, onError() { callbacks++; }});
  f.players[0].emit('ended');
  await waitFor(() => f.requests.some(request => request.path.endsWith('/status')));
  handle.stop();
  assert.equal(f.requests.find(request => request.path.endsWith('/status')).options.signal.aborted, true);
  receipt.resolve(json({state: 'complete', turnId: 1}));
  await tick(); await tick();
  assert.equal(callbacks, 0);
  await f.client.respond('Please continue.', {turnId: 2});
  assert.equal(JSON.parse(f.requests.filter(request => request.path === '/api/dana/turn')[1].options.body).previousPlayback, 'interrupted');
});

test('stopping active playback ignores stale ended and play errors', async t => {
  const f = fixture(); t.after(() => f.client.end());
  await f.client.respond('How is sleep?', {turnId: 1});
  const playing = deferred(); f.playOverride(() => playing.promise);
  let callbacks = 0;
  const handle = f.client.speak({text: reply, onEnded() { callbacks++; }, onError() { callbacks++; }});
  await waitFor(() => f.players.length === 1 && f.players[0].played);
  const player = f.players[0], ended = player.onended || player.listeners.get('ended');
  handle.stop(); ended(); playing.reject(new Error('Late browser failure'));
  await tick();
  assert.equal(callbacks, 0);
  assert.equal(player.paused, true);
  assert.equal(player.src, '');
});

test('a reply cannot make the browser fetch remote or unrelated audio URLs', async t => {
  for (const untrusted of [
    'https://example.com/api/dana/audio/1234567890',
    'http://localhost:4318/api/dana/audio/1234567890',
    '//example.com/api/dana/audio/1234567890',
    '/api/dana/audio/../../session',
    '/api/dana/audio/1234567890?secret=abc',
    '/api/dana/other/1234567890',
    'data:audio/mpeg;base64,AAAA',
  ]) {
    const f = fixture(); t.after(() => f.client.end());
    f.fetchOverride(request => request.path === '/api/dana/turn' ? json({reply, audioUrl: untrusted, turnId: 1}) : undefined);
    await assert.rejects(f.client.respond('How is sleep?', {turnId: 1}));
    assert.equal(f.requests.filter(request => request.options.method === 'POST').length, 2);
    assert.equal(f.players.length, 0);
  }
});

test('health and turn errors stay user-facing and do not leak raw service errors', async t => {
  const f = fixture(); t.after(() => f.client.end());
  f.fetchOverride(request => request.path === '/api/dana/health' ? json({configured: false}) : undefined);
  assert.equal(await f.client.health(), false);
  const raw = 'Internal stack trace with provider_token=do-not-show';
  f.fetchOverride(request => request.path === '/api/dana/turn' ? Promise.reject(new Error(raw)) : undefined);
  await assert.rejects(f.client.respond('How is sleep?', {turnId: 1}), error => {
    assert.equal(error.message.includes(raw), false);
    assert.ok(error.message.length > 0 && error.message.length < 500);
    return true;
  });
});

test('health failure does not retry and a turn deadline aborts stalled work', async t => {
  const f = fixture(); t.after(() => f.client.end());
  f.fetchOverride(request => request.path === '/api/dana/health' ? Promise.reject(new Error('Network disconnected')) : undefined);
  assert.equal(await f.client.health(), false);
  assert.equal(f.requests.filter(request => request.path === '/api/dana/health').length, 1);
  await f.client.start();
  const pending = deferred();
  f.fetchOverride(request => request.path === '/api/dana/turn' ? pending.promise : undefined);
  const responding = f.client.respond('What has helped?', {turnId: 1});
  const rejected = assert.rejects(responding);
  await waitFor(() => f.requests.some(request => request.path === '/api/dana/turn'));
  const turn = f.requests.find(request => request.path === '/api/dana/turn');
  const deadline = [...f.timers.values()].find(timer => timer.delay > 0 && timer.delay <= 90000);
  assert.ok(deadline, 'turn work has a bounded deadline');
  deadline.callback();
  assert.equal(turn.options.signal.aborted, true);
  pending.resolve(json({reply, audioUrl, turnId: 1}));
  await rejected;
  assert.equal(f.requests.filter(request => request.path === '/api/dana/turn').length, 1);
});

test('ending an encounter cancels playback, releases URLs, deletes its session and prevents restart', async () => {
  const f = fixture();
  await f.client.respond('How is sleep?', {turnId: 1});
  let callbacks = 0;
  f.client.speak({text: reply, onEnded() { callbacks++; }, onError() { callbacks++; }});
  await waitFor(() => f.players.length === 1 && f.players[0].played);
  const player = f.players[0], ended = player.onended || player.listeners.get('ended');
  f.client.end(); f.client.end(); ended();
  await tick();
  assert.equal(player.paused, true);
  assert.equal(callbacks, 0);
  assert.ok(f.urls.every(({url}) => f.revoked.includes(url)));
  const deletions = f.requests.filter(request => request.options.method === 'DELETE');
  assert.equal(deletions.length, 1);
  assert.equal(deletions[0].path, '/api/dana/session/' + sessionId);
  assert.equal(deletions[0].options.keepalive, true);
  assert.equal(f.timers.size, 0);
  await assert.rejects(f.client.start());
});

test('ending during a patient request aborts it and prevents a late reply from reviving playback', async () => {
  const f = fixture(), pending = deferred();
  f.fetchOverride(request => request.path === '/api/dana/turn' ? pending.promise : undefined);
  const responding = f.client.respond('Tell me more.', {turnId: 1});
  const rejected = assert.rejects(responding);
  await waitFor(() => f.requests.some(request => request.path === '/api/dana/turn'));
  const turn = f.requests.find(request => request.path === '/api/dana/turn');
  await f.client.end();
  assert.equal(turn.options.signal.aborted, true);
  pending.resolve(json({reply, audioUrl, turnId: 1}));
  await rejected;
  assert.equal(f.requests.filter(request => request.options.method === 'DELETE').length, 1);
  assert.equal(f.requests.some(request => request.path === audioUrl), false);
  assert.equal(f.players.length, 0);
  assert.equal(f.timers.size, 0);
});

test('ending during startup rejects the encounter and deletes its eventual uncharged session', async () => {
  const f = fixture(), startup = deferred();
  f.fetchOverride(request => request.path === '/api/dana/session' ? startup.promise : undefined);
  const starting = f.client.start();
  const rejected = assert.rejects(starting);
  await waitFor(() => f.requests.length === 1);
  f.client.end();
  assert.equal(f.requests.some(request => request.path === '/api/dana/turn'), false);
  startup.resolve(json({sessionId}));
  await rejected;
  await waitFor(() => f.requests.some(request => request.options.method === 'DELETE'));
  assert.equal(f.requests.filter(request => request.options.method === 'DELETE').length, 1);
  assert.equal(f.timers.size, 0);
});

test('completed heard prefix is acknowledged after interruption without claiming the tail',async t=>{
  const f=fixture();t.after(()=>f.client.end());installSplit(f);
  await f.client.respond('What has been hard?',{turnId:1});const heard=[];
  const handle=f.client.speak({text:splitReply,onEnded(){throw new Error('not fully heard');},onError(error){throw error;},onHeardText(text){heard.push(text);}});
  f.players[0].emit('ended');await waitFor(()=>heard.length===1);handle.stop();
  assert.deepEqual(heard,[splitSegments[0].text]);
  await f.client.respond('Tell me about that first part.',{turnId:2,previousCompletedSegments:2});
  const input=JSON.parse(f.requests.filter(r=>r.path==='/api/dana/turn').at(-1).options.body);
  assert.equal(input.previousTurnId,1);assert.equal(input.previousCompletedSegments,1);assert.equal(input.previousPlayback,'interrupted');
});

test('late or noncontiguous segment receipts cannot become heard history after interruption',async t=>{
  for(const secondEnded of [false,true]){
    const f=fixture();t.after(()=>f.client.end());const firstReceipt=deferred(),heard=[];
    installSplit(f,r=>r.path===splitSegments[0].audioUrl+'/status'?firstReceipt.promise:undefined);
    await f.client.respond('What has been hard?',{turnId:1});
    const handle=f.client.speak({text:splitReply,onEnded(){throw new Error('not verified');},onError(){},onHeardText(text){heard.push(text);}});
    f.players[0].emit('ended');if(secondEnded)f.players[1].emit('ended');await tick();handle.stop();
    firstReceipt.resolve(json({state:'complete',turnId:1}));await tick();
    await f.client.respond('Can you repeat that?',{turnId:2});
    const input=JSON.parse(f.requests.filter(r=>r.path==='/api/dana/turn').at(-1).options.body);
    assert.deepEqual(heard,[]);assert.equal(input.previousCompletedSegments,0);assert.equal(input.previousPlayback,'interrupted');
  }
});

test('whole segmented playback acknowledges every verified segment and exact heard text',async t=>{
  const f=fixture();t.after(()=>f.client.end());installSplit(f);const heard=[];let ended=false;
  await f.client.respond('What has been hard?',{turnId:1});
  f.client.speak({text:splitReply,onEnded(){ended=true;},onError(error){throw error;},onHeardText(text){heard.push(text);}});
  f.players[0].emit('ended');await waitFor(()=>heard.length===1);f.players[1].emit('ended');await waitFor(()=>ended);
  assert.deepEqual(heard,[splitSegments[0].text,splitReply]);
  await f.client.respond('Tell me more.',{turnId:2});
  const input=JSON.parse(f.requests.filter(r=>r.path==='/api/dana/turn').at(-1).options.body);
  assert.equal(input.previousCompletedSegments,2);assert.equal(input.previousPlayback,'played');
});

const retryChildId='r'.repeat(32);
function installRetry(f,override){
  f.fetchOverride(r=>{
    const handled=override?.(r);if(handled!==undefined)return handled;
    if(r.path==='/api/dana/session/'+sessionId+'/finish')return json({finished:true,retryTurnIds:[1,2]});
    if(r.path==='/api/dana/session/'+sessionId+'/retry')return json({sessionId:retryChildId,sourceTurnId:JSON.parse(r.options.body).turnId});
    if(r.path==='/api/dana/session/'+retryChildId&&r.options.method==='DELETE')return json({ended:true});
  });
}

test('finish is idempotent, retains original session for reflection and blocks later original turns',async t=>{
  const f=fixture();t.after(()=>f.client.end());installRetry(f);await f.client.respond('First question.',{turnId:1});
  const [a,b]=await Promise.all([f.client.finish(),f.client.finish()]);assert.deepEqual(a,{finished:true,retryTurnIds:[1,2]});assert.deepEqual(a,b);
  assert.equal(f.requests.filter(r=>r.path.endsWith('/finish')).length,1);
  assert.equal(f.requests.some(r=>r.path==='/api/dana/session/'+sessionId&&r.options.method==='DELETE'),false);
  await assert.rejects(f.client.respond('No more original turns.',{turnId:2}),/cancelled/);
  assert.throws(()=>f.client.speak({text:reply}),/unavailable/);
});

test('finishing during speech stops audio and waits for cancellation before freezing the session',async t=>{
  const f=fixture();t.after(()=>f.client.end());const cancellation=deferred();
  installRetry(f,r=>r.path.includes('/turn/')&&r.options.method==='DELETE'?cancellation.promise:undefined);
  await f.client.respond('First question.',{turnId:1});f.client.speak({text:reply,onEnded(){throw new Error('cancelled');},onError(){}});
  const finishing=f.client.finish();await tick();assert.equal(f.players[0].paused,true);assert.equal(f.requests.some(r=>r.path.endsWith('/finish')),false);
  cancellation.resolve(json({state:'cancelled'}));await finishing;assert.equal(f.requests.filter(r=>r.path.endsWith('/finish')).length,1);
});

test('retry adopts one server-created child without creating a fresh opening session',async t=>{
  const f=fixture();t.after(()=>f.client.end());installRetry(f);await f.client.respond('First question.',{turnId:1});await f.client.finish();
  const [a,b]=await Promise.all([f.client.createRetry(1),f.client.createRetry(1)]);assert.equal(a.client,b.client);assert.equal(a.sourceTurnId,1);
  await a.client.start();await a.client.respond('Alternative question.',{turnId:1});
  assert.equal(f.requests.filter(r=>r.path==='/api/dana/session').length,1);
  assert.equal(f.requests.filter(r=>r.path.endsWith('/retry')).length,1);
  const input=JSON.parse(f.requests.filter(r=>r.path==='/api/dana/turn').at(-1).options.body);assert.equal(input.sessionId,retryChildId);assert.equal(input.turnId,1);
  await assert.rejects(f.client.createRetry(2),/already/);await assert.rejects(a.client.createRetry(1),/cancelled/);
});

test('ending the original closes its child and deletes both server handles',async()=>{
  const f=fixture();installRetry(f);await f.client.respond('First question.',{turnId:1});const retry=await f.client.createRetry(1);
  await f.client.end();
  const deletes=f.requests.filter(r=>r.options.method==='DELETE').map(r=>r.path);
  assert.ok(deletes.includes('/api/dana/session/'+sessionId));assert.ok(deletes.includes('/api/dana/session/'+retryChildId));
  await assert.rejects(retry.client.respond('Too late.',{turnId:1}),/cancelled/);
});

test('unavailable selections and malformed child metadata cannot become a practice session',async t=>{
  const f=fixture();t.after(()=>f.client.end());installRetry(f,r=>r.path.endsWith('/retry')?json({sessionId:'invalid',sourceTurnId:1}):undefined);
  await f.client.start();await assert.rejects(f.client.createRetry(3),/unavailable/);
  await assert.rejects(f.client.createRetry(1),/invalid/);
  assert.equal(f.requests.filter(r=>r.path.endsWith('/retry')).length,1);
  assert.equal(f.requests.filter(r=>r.path==='/api/dana/turn').length,0);
});

test('selected live case is sent once, checked against the server, and preserved for its retry',async()=>{
  const f=fixture(),caseId='sp_mania_redirect_001';
  const client=api().createClient(f.env,{caseId});
  installRetry(f,r=>{
    if(r.path==='/api/dana/session'&&r.options.method==='POST')return json({sessionId,caseId});
    if(r.path==='/api/dana/health')return json({configured:true,cases:[caseId]});
    if(r.path.endsWith('/retry'))return json({sessionId:retryChildId,sourceTurnId:1,caseId});
  });
  assert.equal(await client.health(),true);await client.respond('What matters to you?',{turnId:1});
  assert.deepEqual(JSON.parse(f.requests.find(r=>r.path==='/api/dana/session').options.body),{caseId});
  const retry=await client.createRetry(1);await retry.client.start();
  assert.equal(f.requests.filter(r=>r.path==='/api/dana/session').length,1);
  await client.end();
});

test('Morgan uses its draft identity through health, session and the single retry without becoming Dana',async()=>{
  const f=fixture(),caseId='sp_alcohol_ambivalence_001';
  const client=api().createClient(f.env,{caseId});
  assert.equal(await client.health(),false,'a Dana-only server cannot start this local draft');
  installRetry(f,r=>{
    if(r.path==='/api/dana/session'&&r.options.method==='POST')return json({sessionId,caseId});
    if(r.path==='/api/dana/health')return json({configured:true,cases:[caseId]});
    if(r.path.endsWith('/retry'))return json({sessionId:retryChildId,sourceTurnId:1,caseId});
  });
  assert.equal(await client.health(),true);await client.respond('What matters to you?',{turnId:1});
  assert.deepEqual(JSON.parse(f.requests.find(r=>r.path==='/api/dana/session').options.body),{caseId});
  const retry=await client.createRetry(1);assert.equal(await retry.client.health(),true);await retry.client.start();
  assert.equal(f.requests.filter(r=>r.path==='/api/dana/session').length,1);
  await client.end();
});

test('Morgan rejects missing or different session and retry identity instead of silently switching case',async()=>{
  const caseId='sp_alcohol_ambivalence_001';
  const f=fixture(),client=api().createClient(f.env,{caseId});
  await assert.rejects(client.start(),/Morgan could not start/);await client.end();
  const g=fixture(),other=api().createClient(g.env,{caseId});
  installRetry(g,r=>{
    if(r.path==='/api/dana/session'&&r.options.method==='POST')return json({sessionId,caseId});
    if(r.path.endsWith('/retry'))return json({sessionId:retryChildId,sourceTurnId:1,caseId:'sp_depression_gated_si_001'});
  });
  await other.start();await assert.rejects(other.createRetry(1),/wrong practice case/);
  assert.equal(g.requests.filter(r=>r.path==='/api/dana/turn').length,0);await other.end();
});

test('a browser without the optional draft registry retains canonical clients but cannot invent Morgan',()=>{
  const browser={window:{}};vm.createContext(browser);vm.runInContext(fs.readFileSync(modulePath,'utf8'),browser);
  const f=fixture();
  assert.doesNotThrow(()=>browser.window.SPInterviewLive.createClient(f.env,{caseId:'sp_mania_redirect_001'}));
  assert.throws(()=>browser.window.SPInterviewLive.createClient(f.env,{caseId:'sp_alcohol_ambivalence_001'}),/Unsupported/);
  f.env.SPInterviewLocalCases=require('../sp-interview.local-cases.js');
  assert.doesNotThrow(()=>browser.window.SPInterviewLive.createClient(f.env,{caseId:'sp_alcohol_ambivalence_001'}));
  assert.equal(f.requests.length,0,'resolving a case does not start a paid or session request');
});

test('unsupported and mismatched live cases cannot silently start Dana',async()=>{
  const f=fixture();assert.throws(()=>api().createClient(f.env,{caseId:'__proto__'}),/Unsupported/);
  const client=api().createClient(f.env,{caseId:'sp_psychosis_paranoid_001'});
  assert.equal(await client.health(),false,'an older Dana-only server is not ready for Ray');
  await assert.rejects(client.start(),/could not start/);
  assert.equal(f.requests.filter(r=>r.path==='/api/dana/turn').length,0);
  await client.end();
});

test('Dana also rejects explicitly mismatched session, retry and advertised health identities',async()=>{
  const f=fixture();
  f.fetchOverride(r=>{
    if(r.path==='/api/dana/health')return json({configured:true,cases:['sp_mania_redirect_001']});
    if(r.path==='/api/dana/session'&&r.options.method==='POST')return json({sessionId,caseId:'sp_mania_redirect_001'});
  });
  assert.equal(await f.client.health(),false);await assert.rejects(f.client.start(),/could not start/);await f.client.end();
  const g=fixture();installRetry(g,r=>r.path.endsWith('/retry')?json({sessionId:retryChildId,sourceTurnId:1,caseId:'sp_psychosis_paranoid_001'}):undefined);
  await g.client.start();await assert.rejects(g.client.createRetry(1),/wrong practice case/);await g.client.end();
});
