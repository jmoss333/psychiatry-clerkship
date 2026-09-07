import {endEncounter} from './sp-station-helpers.js';
import {expect, test} from '@playwright/test';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import fs from 'node:fs';
import {createDanaAudioCatalog} from '../../_prototypes/sp-interview/dana-audio-catalog.mjs';

const CONVERSATION_URL = '/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1';
const LIVE_URL = CONVERSATION_URL + '&danaLive=1';
const LIBRARY_PATH = '/output/speech/dana-marin-v1/';
const SESSION_ID = 'dana-browser-session-123';
const AUDIO_ID = '12345678-abcd-4abc-8abc-123456789012';
const SEGMENTED_REPLY = 'Mornings are hard. I feel stuck before I get out of bed.';
const SEGMENTED_TEXT = ['Mornings are hard.', ' I feel stuck before I get out of bed.'];
const pack = JSON.parse(fs.readFileSync(new URL('../../_prototypes/sp-interview/sp-interview.pack.json', import.meta.url), 'utf8'));
const audioBytes = Buffer.from([73, 68, 51, 4, 0, 1, 2, 3]);
const hash = value => createHash('sha256').update(value).digest('hex');
const catalog = createDanaAudioCatalog(pack);
const manifest = {
  schemaVersion: 1, ...catalog, packHash: hash(JSON.stringify(pack)),
  voice: 'marin', model: 'gpt-4o-mini-tts-2025-12-15',
  entries: catalog.entries.map(entry => ({...entry, audioSha256: hash(audioBytes), bytes: audioBytes.length, durationSeconds: 3})),
};
const scriptedExchange = [
  {
    question: "I am glad you're here. What would make this conversation feel useful?",
    reply: 'It would help if you understood how hard mornings have become.',
  },
  {
    question: 'When you say mornings are hard, what happens after you wake up?',
    reply: 'I lie there thinking about everything I need to do, and then I feel stuck.',
  },
];

// Everything under /api/dana is intercepted. These tests use no credentials,
// paid provider calls, real learner microphone capture, or generated live audio.
async function openLiveFixture(page, {configured = true, deferSession = false, deferFirstTurnJSON = false, deferTurnJSONAt = 0, failTurn = 0, deferTurnCancellation = false, holdAudioAtPlay = 0, segmented = false, deferSegmentReceipt = false, failedSegmentReceipt = false, missingSecondSegment = false, invalidSegments = '', safetyOverlay = false, url = LIVE_URL} = {}) {
  const network = {requests: [], external: [], clips: [], sessionRoute: null, turnCancellationRoute: null, segmentReceiptRoute: null};
  await page.route('**/*', async route => {
    const request = route.request(), target = new URL(request.url());
    if (target.hostname !== '127.0.0.1') {
      network.external.push(target.href);
      return route.abort();
    }
    if (target.pathname.startsWith('/api/dana/')) {
      network.requests.push({path: target.pathname, method: request.method(), body: request.postDataJSON(), headers: request.headers()});
      if (target.pathname === '/api/dana/health') return route.fulfill({json: {configured}});
      if (target.pathname === '/api/dana/session' && request.method() === 'POST') {
        if (deferSession) { network.sessionRoute = route; return; }
        return route.fulfill({json: {sessionId: SESSION_ID}});
      }
      if (target.pathname === '/api/dana/turn') {
        const body = request.postDataJSON(), exchange = safetyOverlay ? {reply:/thoughts of killing yourself/i.test(body.text)?"Most nights, when I'm awake at three, I think it would be simpler if I just didn't wake up.":"I don't feel heard when you say that."} : scriptedExchange[body.turnId - 1];
        if (body.turnId === failTurn) return route.fulfill({status: 502, json: {error: 'Dana could not prepare this reply.'}});
        if (!exchange) return route.fulfill({status: 400, json: {error: 'Unexpected fixture turn'}});
        if (segmented && body.turnId === 1) {
          const segments = SEGMENTED_TEXT.map((text, index) => ({text, audioUrl: '/api/dana/audio/' + AUDIO_ID + '-part-' + (index + 1) + '-1'}));
          if (invalidSegments === 'duplicate URL') segments[1].audioUrl = segments[0].audioUrl;
          if (invalidSegments === 'changed text') segments[1].text = segments[1].text.trim();
          return route.fulfill({json: {reply: SEGMENTED_REPLY, audioSegments: segments, turnId: 1}});
        }
        return route.fulfill({json: {reply: exchange.reply, audioUrl: '/api/dana/audio/' + AUDIO_ID + '-' + body.turnId, turnId: body.turnId}});
      }
      if (target.pathname.startsWith('/api/dana/audio/') && target.pathname.endsWith('/status')) {
        if (deferSegmentReceipt && target.pathname.includes('-part-1-')) { network.segmentReceiptRoute = route; return; }
        return route.fulfill({json: {state: failedSegmentReceipt && target.pathname.includes('-part-2-') ? 'failed' : 'complete', turnId: Number(target.pathname.split('/').at(-2).split('-').at(-1))}});
      }
      if (target.pathname.startsWith('/api/dana/audio/') && request.method() === 'DELETE') return route.fulfill({json: {cancelled: true}});
      if (target.pathname.startsWith('/api/dana/audio/')) return route.fulfill(missingSecondSegment && target.pathname.includes('-part-2-') ? {status: 404} : {contentType: 'audio/mpeg', body: audioBytes});
      if (target.pathname.startsWith('/api/dana/session/' + SESSION_ID + '/turn/') && request.method() === 'DELETE') {
        if (deferTurnCancellation) { network.turnCancellationRoute = route; return; }
        return route.fulfill({json: {cancelled: true}});
      }
      if (target.pathname === '/api/dana/session/' + SESSION_ID && request.method() === 'DELETE') return route.fulfill({json: {ok: true}});
      if (target.pathname === '/api/dana/session/' + SESSION_ID + '/finish') return route.fulfill({json: {finished: true, retryTurnIds: network.requests.filter(item => item.path === '/api/dana/turn').map(item => item.body.turnId)}});
      return route.fulfill({status: 404, json: {error: 'Unexpected fixture route'}});
    }
    if (target.pathname === LIBRARY_PATH + 'manifest.json') return route.fulfill({json: manifest});
    if (target.pathname.startsWith(LIBRARY_PATH) && target.pathname.endsWith('.mp3')) {
      network.clips.push(target.pathname);
      return route.fulfill({contentType: 'audio/mpeg', body: audioBytes});
    }
    if (target.pathname.includes('/.netlify/functions/')) {
      network.external.push(target.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(({deferJSON, holdPlay}) => {
    const log = window.__danaLiveLog = {players: [], recognizers: [], plays: 0, recognitionStarts: 0, preloads: [], playOrder: [], maxActivePlayers: 0};
    let releaseJSON = null, deferredTurn = false;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (resource, options) => {
      const response = await nativeFetch(resource, options);
      if (deferJSON && !deferredTurn && new URL(String(resource), window.location.href).pathname === '/api/dana/turn' && JSON.parse(options.body).turnId === deferJSON) {
        deferredTurn = true;
        const readJSON = response.json.bind(response);
        response.json = async () => {
          const result = await readJSON();
          log.jsonPending = true;
          await new Promise(resolve => { releaseJSON = resolve; });
          log.jsonPending = false;
          return result;
        };
      }
      return response;
    };
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay === 4500 ? 20 : delay === 6000 ? 40 : delay, ...args);
    class FakeAudio {
      constructor(src = '') { this.src = src; this.originalSrc = src; this.active = false; log.players.push(this); }
      incoming() {
        if (!this.loading) this.loading = this.src.startsWith('/api/dana/audio/') ? window.fetch(this.src).then(response => {
          if (!response.ok) throw new Error('Fixture audio unavailable');
        }) : Promise.resolve();
        return this.loading;
      }
      play() {
        this.active = true; log.plays++;
        log.playOrder.push(this.originalSrc); this.lateEnded = this.onended;
        log.maxActivePlayers = Math.max(log.maxActivePlayers, log.players.filter(player => player.active).length);
        return this.incoming().then(() => {
          if (log.plays !== holdPlay && !this.originalSrc.includes('-part-')) queueMicrotask(() => { if (this.active) { this.active = false; this.onended?.(); } });
        });
      }
      pause() { this.active = false; }
      removeAttribute(name) { if (name === 'src') this.src = ''; }
      load() { if (this.src.startsWith('/api/dana/audio/')) { log.preloads.push(this.src); this.incoming().catch(() => this.onerror?.()); } }
    }
    class FakeRecognition {
      constructor() { this.active = false; this.results = []; log.recognizers.push(this); }
      start() { this.active = true; log.recognitionStarts++; queueMicrotask(() => this.onstart?.()); }
      stop() { this.active = false; queueMicrotask(() => this.onend?.()); }
      abort() { this.active = false; queueMicrotask(() => this.onend?.()); }
      emit(text) {
        const result = {0: {transcript: text, confidence: 0.99}, length: 1, isFinal: true};
        this.results.push(result);
        this.onspeechstart?.();
        this.onresult?.({resultIndex: this.results.length - 1, results: this.results});
        this.onspeechend?.();
      }
    }
    window.Audio = FakeAudio;
    window.SpeechRecognition = window.webkitSpeechRecognition = FakeRecognition;
    window.SpeechSynthesisUtterance = undefined;
    Object.defineProperty(window, 'speechSynthesis', {configurable: true, value: undefined});
    window.__danaLiveTest = {
      releaseJSON() { releaseJSON?.(); },
      finishSegment(index) {
        const player = log.players.filter(item => item.originalSrc.includes('-part-'))[index];
        if (!player || !player.active) throw new Error('No active segment fixture');
        player.active = false; player.onended?.();
      },
      lateSegmentCallbacks() { log.players.filter(item => item.originalSrc.includes('-part-')).forEach(player => player.lateEnded?.()); },
      emit(text) {
        const microphone = [...log.recognizers].reverse().find(item => item.active);
        if (!microphone) throw new Error('No active microphone fixture');
        microphone.emit(text);
      },
    };
  }, {deferJSON: deferFirstTurnJSON ? 1 : deferTurnJSONAt, holdPlay: holdAudioAtPlay});
  await page.goto(url);
  await expect(page.getByRole('heading', {name: 'Talk with Dana', exact: true})).toBeVisible();
  return network;
}

async function resources(page) {
  return page.evaluate(() => ({
    plays: window.__danaLiveLog.plays,
    recognitionStarts: window.__danaLiveLog.recognitionStarts,
    activePlayers: window.__danaLiveLog.players.filter(item => item.active).length,
    activeRecognizers: window.__danaLiveLog.recognizers.filter(item => item.active).length,
  }));
}

async function nativeStreamingFixture(bytes) {
  const streamPath = '/api/dana/audio/' + AUDIO_ID;
  const requests = [], streams = new Set();
  let state = 'pending', finalChunkSent = false;
  const split = Math.floor(bytes.length * 0.6);
  const clientScript = fs.readFileSync(new URL('../../_prototypes/sp-interview/sp-interview.live.js', import.meta.url));
  const server = createServer(async (req, res) => {
    res.on('error', () => {});
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    requests.push({path: req.url, method: req.method, body});
    const sendJSON = value => { res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end(JSON.stringify(value)); };
    if (req.url === '/client.js') { res.writeHead(200, {'content-type': 'text/javascript'}); res.end(clientScript); return; }
    if (req.url === '/api/dana/session') { sendJSON({sessionId: SESSION_ID}); return; }
    if (req.url === '/api/dana/turn') { sendJSON({reply: scriptedExchange[0].reply, audioUrl: streamPath, turnId: body.turnId}); return; }
    if (req.url === streamPath + '/status') { sendJSON({state, turnId: 1}); return; }
    if (req.url === streamPath && req.method === 'GET') {
      state = 'streaming';
      res.writeHead(200, {'content-type': 'audio/mpeg', 'cache-control': 'no-store'});
      res.flushHeaders(); res.write(bytes.subarray(0, split)); streams.add(res);
      res.on('close', () => streams.delete(res));
      return;
    }
    if (req.method === 'DELETE') {
      if (state !== 'complete') state = 'cancelled';
      streams.forEach(stream => stream.destroy()); streams.clear();
      sendJSON({cancelled: true}); return;
    }
    if (req.url === '/') {
      res.writeHead(200, {'content-type': 'text/html'});
      res.end(`<!doctype html><button id="start">Play streaming reply</button><script src="/client.js"></script><script>
        window.streamLog={playing:0,mediaEnded:0,complete:0,errors:[]};
        const NativeAudio=window.Audio;
        // load() resets playbackRate to defaultPlaybackRate; keep this short fixture accelerated after preloading.
        window.Audio=function(src){const audio=new NativeAudio(src);audio.muted=true;audio.defaultPlaybackRate=2;audio.playbackRate=2;audio.addEventListener('playing',()=>streamLog.playing++);audio.addEventListener('ended',()=>streamLog.mediaEnded++);return audio;};
        window.client=SPInterviewLive.createClient(window);
        document.getElementById('start').onclick=async()=>{try{await client.start();const answer=await client.respond('How are mornings?',{turnId:1});client.speak({text:answer.reply,onEnded(){streamLog.complete++;},onError(error){streamLog.errors.push(error.message);}});}catch(error){streamLog.errors.push(error.message);}};
      </script>`); return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    requests,
    finalChunkSent() { return finalChunkSent; },
    finish(succeeded) {
      state = succeeded ? 'complete' : 'failed';
      if (succeeded) finalChunkSent = true;
      for (const stream of streams) {
        if (succeeded) stream.write(bytes.subarray(split));
        stream.end();
      }
    },
    async close() {
      streams.forEach(stream => stream.destroy());
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

for (const succeeds of [true, false]) {
  test(`native MP3 playback starts before the final chunk and ${succeeds ? 'confirms completion' : 'rejects a truncated stream'}`, async ({page}) => {
    const recordingPath = new URL('../../output/speech/dana-marin-v1/' + catalog.entries[0].file, import.meta.url);
    test.skip(!fs.existsSync(recordingPath), 'Native stream audition needs the locally generated, approved opening MP3; provider-free fixture tests still run.');
    const fixture = await nativeStreamingFixture(fs.readFileSync(recordingPath));
    try {
      await page.goto(fixture.url);
      await page.getByRole('button', {name: 'Play streaming reply'}).click();
      await expect.poll(() => page.evaluate(() => window.streamLog.playing), {timeout: 5000}).toBeGreaterThan(0);
      expect(fixture.finalChunkSent()).toBe(false);
      expect(await page.evaluate(() => window.streamLog.complete)).toBe(0);
      fixture.finish(succeeds);
      if (succeeds) {
        await expect.poll(() => page.evaluate(() => window.streamLog.complete)).toBe(1);
        expect(await page.evaluate(() => window.streamLog.errors)).toEqual([]);
      } else {
        await expect.poll(() => page.evaluate(() => window.streamLog.errors.length)).toBe(1);
        expect(await page.evaluate(() => window.streamLog.complete)).toBe(0);
      }
      await page.evaluate(() => window.client.respond('Please continue.', {turnId: 2}));
      const second = fixture.requests.filter(request => request.path === '/api/dana/turn')[1];
      expect(second.body.previousTurnId).toBe(1);
      expect(second.body.previousPlayback).toBe(succeeds ? 'played' : 'interrupted');
      await page.evaluate(() => window.client.end());
    } finally {
      await page.goto('about:blank');
      await fixture.close();
    }
  });
}

test('live mode waits for session creation, sends original turns, plays server replies and retains them on End', async ({page}) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const network = await openLiveFixture(page, {deferSession: true});
  await expect(page.locator('header .eyebrow').first()).toContainText('LIVE LOCAL PROTOTYPE');
  await expect(page.locator('#speech-disclosure')).toContainText('OpenAI');
  await expect(page.locator('#speech-disclosure')).toContainText('Marin');
  await expect(page.getByLabel('Voice playback', {exact: true})).toHaveValue('live');
  const start = page.getByRole('button', {name: 'Start conversation', exact: true});
  await expect(start).toBeEnabled();
  await start.click();
  await expect.poll(() => !!network.sessionRoute).toBe(true);
  await expect(page.locator('#conversation-status')).toContainText('Connecting live Dana');
  expect(network.clips).toEqual([]);
  expect((await resources(page)).plays).toBe(0);
  expect((await resources(page)).recognitionStarts).toBe(0);
  await network.sessionRoute.fulfill({json: {sessionId: SESSION_ID}});
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  expect(network.requests.filter(request => request.path === '/api/dana/session')).toHaveLength(1);
  expect(network.clips).toHaveLength(1);

  for (const [index, exchange] of scriptedExchange.entries()) {
    await page.evaluate(text => window.__danaLiveTest.emit(text), exchange.question);
    await expect(page.locator('#conversation-count')).toHaveText(`${index + 1} of 10 turns`);
    await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + exchange.reply);
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    expect((await resources(page)).recognitionStarts).toBe(index + 2);
  }
  const turns = network.requests.filter(request => request.path === '/api/dana/turn');
  expect(turns.map(request => request.body)).toEqual(scriptedExchange.map((exchange, index) => ({
    sessionId: SESSION_ID, turnId: index + 1, text: exchange.question, previousTurnId: index === 0 ? null : index, previousPlayback: 'played', previousCompletedSegments: index === 0 ? 0 : 1,
  })));
  expect(turns.every(request => request.headers.authorization === undefined && request.headers['x-api-key'] === undefined)).toBe(true);
  expect(network.requests.filter(request => request.path.startsWith('/api/dana/audio/') && !request.path.endsWith('/status') && request.method === 'GET')).toHaveLength(2);
  expect((await resources(page)).plays).toBe(3);
  await endEncounter(page);
  await expect.poll(() => network.requests.filter(request => request.path.endsWith('/finish')).length).toBe(1);
  expect(network.requests.filter(request => request.method === 'DELETE')).toEqual([]);
  await expect(page.getByRole('button', {name: 'Clear and start over', exact: true})).toBeVisible();
  await expect(page.locator('#conversation-status')).toContainText('Encounter complete');
  expect((await resources(page)).activePlayers).toBe(0);
  expect((await resources(page)).activeRecognizers).toBe(0);
  expect(network.external).toEqual([]);
  expect(errors).toEqual([]);
});

test('live mocked Dana keeps direct suicide disclosure available after negative history',async({page})=>{
  const network=await openLiveFixture(page,{safetyOverlay:true});await page.getByRole('button',{name:'Start conversation',exact:true}).click();await expect(page.locator('#conversation-status')).toHaveText('Listening');
  for(const [index,words] of ['You just need to snap out of it.','Have you had thoughts of killing yourself?'].entries()){
    await page.evaluate(text=>window.__danaLiveTest.emit(text),words);await expect(page.locator('#conversation-count')).toHaveText(`${index+1} of 10 turns`);await expect(page.locator('#conversation-status')).toHaveText('Listening');
  }
  await expect(page.locator('#conversation-log')).toContainText(/Most nights, when I'm awake at three/i);await expect(page.locator('#conversation-log')).not.toContainText(/very direct question for someone I met four minutes ago/i);
  expect(network.requests.filter(request=>request.path==='/api/dana/turn').map(request=>request.body.text)).toEqual(['You just need to snap out of it.','Have you had thoughts of killing yourself?']);
});

test('Escape while awaiting keeps a cancelled question visible and never acknowledges its discarded reply', async ({page}) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const network = await openLiveFixture(page, {deferFirstTurnJSON: true, deferTurnCancellation: true});
  await expect(page.getByRole('button', {name: 'Start conversation', exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
  await expect.poll(() => page.evaluate(() => window.__danaLiveLog.jsonPending)).toBe(true);
  await expect(page.locator('#conversation-status')).toHaveText('Dana is responding');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Escape');
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.locator('#conversation-log .msg.me').first()).toHaveText('You: ' + scriptedExchange[0].question + ' [Dana’s reply was cancelled before it started.]');
  await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[1].question);
  await expect.poll(() => !!network.turnCancellationRoute).toBe(true);
  await expect(page.locator('#conversation-count')).toHaveText('2 of 10 turns');
  expect(network.requests.filter(request => request.path === '/api/dana/turn')).toHaveLength(1);
  await page.evaluate(() => window.__danaLiveTest.releaseJSON());
  await network.turnCancellationRoute.fulfill({json: {cancelled: true}});
  await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[1].reply);
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  const turns = network.requests.filter(request => request.path === '/api/dana/turn');
  expect(turns).toHaveLength(2);
  expect(turns[1].body.previousTurnId).toBeNull();
  expect(turns[1].body.previousPlayback).toBe('played'); // Bound to opening, never to discarded turn 1.
  await expect(page.locator('#conversation-log')).not.toContainText(scriptedExchange[0].reply);
  await expect(page.locator('#conversation-log .msg.me').first()).toContainText('Dana’s reply was cancelled before it started.');
  expect(network.requests.filter(request => request.path.startsWith('/api/dana/audio/') && !request.path.endsWith('/status') && request.method === 'GET').map(request => request.path)).toEqual(['/api/dana/audio/' + AUDIO_ID + '-2']);
  await endEncounter(page);
  expect(network.external).toEqual([]);
  expect(errors).toEqual([]);
});

test('a second separate Space while Dana prepares question two never skips the reply', async ({page}) => {
  const network = await openLiveFixture(page, {deferTurnJSONAt: 2});
  await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.locator('#conversation-hold').check();
  await page.evaluate(() => document.activeElement.blur());
  await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
  await page.keyboard.press('Space');
  await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[0].reply);
  await expect(page.locator('#conversation-status')).toHaveText('Listening');

  const question = "Yeah if you don't mind helping me understand what's been going on recently";
  await page.evaluate(text => window.__danaLiveTest.emit(text), question);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__danaLiveLog.jsonPending)).toBe(true);
  await expect(page.locator('#conversation-log .msg.me').last()).toHaveText('You: ' + question + ' [Dana is preparing a reply.]');
  await page.keyboard.press('Space'); // A second physical keypress, not keyboard auto-repeat.
  await expect(page.locator('#conversation-status')).toHaveText('Dana is responding');
  await expect(page.locator('#conversation-hint')).toContainText('Your question is already sent.');
  expect((await resources(page)).activeRecognizers).toBe(0);
  expect(network.requests.filter(request => request.method === 'DELETE')).toEqual([]);
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {code: 'Space', key: ' ', bubbles: true, cancelable: true});
    document.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await page.evaluate(() => window.__danaLiveTest.releaseJSON());
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[1].reply);
  await expect(page.locator('#conversation-log .msg.me').last()).toHaveText('You: ' + question);
  await expect(page.locator('#conversation-log .msg.me')).toHaveCount(2);
  await expect(page.locator('#conversation-log .msg.pt')).toHaveCount(3);
  expect(network.requests.filter(request => request.path === '/api/dana/turn').map(request => request.body.text)).toEqual([scriptedExchange[0].question, question]);
  await endEncounter(page);
});

test('a failed reply remains explained beside its question after Resume and a later reply', async ({page}) => {
  const network = await openLiveFixture(page, {failTurn: 1});
  await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
  await expect(page.locator('#conversation-status')).toContainText('Voice needs your attention');
  await expect(page.locator('#conversation-log .msg.me').first()).toHaveText('You: ' + scriptedExchange[0].question + ' [Dana’s reply could not be prepared.]');
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  expect(network.requests.filter(request => request.path === '/api/dana/turn')).toHaveLength(1);
  await page.evaluate(() => window.__danaLiveTest.emit('Hello'));
  await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[1].reply);
  await expect(page.locator('#conversation-log .msg.me').first()).toContainText('Dana’s reply could not be prepared.');
  expect(network.requests.filter(request => request.path === '/api/dana/turn').map(request => request.body.text)).toEqual([scriptedExchange[0].question, 'Hello']);
  await endEncounter(page);
});

test('segmented speech preloads both parts and starts part two before the first receipt returns', async ({page}) => {
  const network = await openLiveFixture(page, {segmented: true, deferSegmentReceipt: true});
  await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
  await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  await expect.poll(() => network.requests.filter(request => request.path.includes('-part-') && !request.path.endsWith('/status')).length).toBe(2);
  expect(await page.evaluate(() => window.__danaLiveLog.preloads.length)).toBe(2);
  expect(await page.evaluate(() => window.__danaLiveLog.playOrder.filter(src => src.includes('-part-')).length)).toBe(1);
  await page.evaluate(() => window.__danaLiveTest.finishSegment(0));
  await expect.poll(() => !!network.segmentReceiptRoute).toBe(true);
  expect(await page.evaluate(() => window.__danaLiveLog.playOrder.filter(src => src.includes('-part-')).map(src => src.split('-').slice(-3).join('-')))).toEqual(['part-1-1', 'part-2-1']);
  await page.evaluate(() => window.__danaLiveTest.finishSegment(1));
  await expect.poll(() => network.requests.filter(request => request.path.endsWith('/status')).length).toBe(2);
  await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  expect((await resources(page)).activeRecognizers).toBe(0);
  expect((await resources(page)).activePlayers).toBe(0);
  await network.segmentReceiptRoute.fulfill({json: {state: 'complete', turnId: 1}});
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  expect(await page.evaluate(() => window.__danaLiveLog.maxActivePlayers)).toBe(1);
  await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[1].question);
  await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[1].reply);
  const second = network.requests.filter(request => request.path === '/api/dana/turn')[1].body;
  expect(second.previousTurnId).toBe(1); expect(second.previousPlayback).toBe('played');
  await endEncounter(page);
});

for (const failure of ['failed receipt', 'missing audio']) {
  test(`a second segment with ${failure} stops the whole reply without marking it heard`, async ({page}) => {
    const network = await openLiveFixture(page, {segmented: true, failedSegmentReceipt: failure === 'failed receipt', missingSecondSegment: failure === 'missing audio'});
    await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
    if (failure === 'failed receipt') {
      await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
      await page.evaluate(() => window.__danaLiveTest.finishSegment(0));
      await page.evaluate(() => window.__danaLiveTest.finishSegment(1));
    }
    await expect(page.locator('#conversation-status')).toContainText('Voice needs your attention');
    await expect.poll(() => network.requests.some(request => request.method === 'DELETE' && request.path.endsWith('/turn/1'))).toBe(true);
    expect((await resources(page)).activePlayers).toBe(0);
    await page.getByRole('button', {name: 'Resume', exact: true}).click();
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[1].question);
    await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[1].reply);
    const second = network.requests.filter(request => request.path === '/api/dana/turn')[1].body;
    expect(second.previousTurnId).toBe(1); expect(second.previousPlayback).toBe('interrupted');
    expect(await page.evaluate(() => window.__danaLiveLog.maxActivePlayers)).toBe(1);
    await endEncounter(page);
  });
}

for (const phase of ['first segment', 'receipt']) {
  test(`interrupting segmented speech during ${phase} cancels all audio and ignores late completion`, async ({page}) => {
    const network = await openLiveFixture(page, {segmented: true, deferSegmentReceipt: true});
    await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
    await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
    if (phase === 'receipt') {
      await page.evaluate(() => { window.__danaLiveTest.finishSegment(0); window.__danaLiveTest.finishSegment(1); });
      await expect.poll(() => !!network.segmentReceiptRoute).toBe(true);
    }
    await page.getByRole('button', {name: 'Interrupt Dana', exact: true}).click();
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    await expect.poll(() => network.requests.some(request => request.method === 'DELETE' && request.path.endsWith('/turn/1'))).toBe(true);
    if (network.segmentReceiptRoute) await network.segmentReceiptRoute.fulfill({json: {state: 'complete', turnId: 1}});
    await page.evaluate(() => window.__danaLiveTest.lateSegmentCallbacks());
    expect((await resources(page)).activePlayers).toBe(0);
    expect(await page.evaluate(() => window.__danaLiveLog.playOrder.filter(src => src.includes('-part-')).length)).toBe(phase === 'receipt' ? 2 : 1);
    await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[1].question);
    await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[1].reply);
    const second = network.requests.filter(request => request.path === '/api/dana/turn')[1].body;
    expect(second.previousTurnId).toBe(1); expect(second.previousPlayback).toBe('interrupted');
    await endEncounter(page);
  });
}

for (const invalid of ['duplicate URL', 'changed text']) {
  test(`segmented ${invalid} metadata is rejected before creating audio players`, async ({page}) => {
    const network = await openLiveFixture(page, {segmented: true, invalidSegments: invalid});
    await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
    await expect(page.locator('#conversation-status')).toContainText('Voice needs your attention');
    await expect(page.locator('#conversation-log .msg.me')).toContainText('Dana’s reply could not be prepared.');
    expect(await page.evaluate(() => window.__danaLiveLog.players.filter(player => player.originalSrc.includes('-part-')).length)).toBe(0);
    expect(network.requests.filter(request => request.path.includes('-part-'))).toEqual([]);
    await endEncounter(page);
  });
}

test('voice preview does not mark an interrupted encounter opening as heard', async ({page}) => {
  const network = await openLiveFixture(page, {holdAudioAtPlay: 2});
  await expect(page.getByRole('button', {name: 'Preview voice', exact: true})).toBeEnabled();
  await page.getByRole('button', {name: 'Preview voice', exact: true}).click();
  await expect.poll(async () => (await resources(page)).plays).toBe(1);
  await expect(page.getByRole('button', {name: 'Preview voice', exact: true})).toBeEnabled();
  expect(network.requests.some(request => request.path === '/api/dana/session')).toBe(false);
  await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
  await expect.poll(async () => (await resources(page)).plays).toBe(2);
  await page.getByRole('button', {name: 'Interrupt Dana', exact: true}).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
  await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[0].reply);
  const turn = network.requests.find(request => request.path === '/api/dana/turn');
  expect(turn.body.previousTurnId).toBeNull();
  expect(turn.body.previousPlayback).toBe('interrupted');
  await endEncounter(page);
  expect(network.external).toEqual([]);
});

test('unavailable live health disables Start and offers an explicit prerecorded fallback', async ({page}) => {
  const network = await openLiveFixture(page, {configured: false});
  await expect(page.locator('#conversation-status')).toHaveText('Live Dana is unavailable');
  await expect(page.getByRole('button', {name: 'Start conversation', exact: true})).toBeDisabled();
  await expect(page.locator('#conversation-error')).toContainText('prerecorded practice link');
  const fallback = page.getByRole('link', {name: 'Use the prerecorded practice version', exact: true});
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('href', './sp-interview.preview.html?danaConversation=1');
  expect(network.requests.map(request => request.path)).toEqual(['/api/dana/health']);
  expect((await resources(page)).recognitionStarts).toBe(0);
  expect(network.external).toEqual([]);
});

test('Space dispatches a finalized held turn without the automatic pause timer', async ({page}) => {
  const network = await openLiveFixture(page);
  await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.locator('#conversation-hold').check();
  await page.evaluate(text => window.__danaLiveTest.emit(text), scriptedExchange[0].question);
  await page.waitForTimeout(100); // Exceeds both accelerated pause timers; Hold must not submit.
  expect(network.requests.filter(request => request.path === '/api/dana/turn')).toHaveLength(0);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Space');
  await expect(page.locator('#conversation-log .msg.pt').last()).toHaveText('Dana: ' + scriptedExchange[0].reply);
  const turns = network.requests.filter(request => request.path === '/api/dana/turn');
  expect(turns).toHaveLength(1);
  expect(turns[0].body.text).toBe(scriptedExchange[0].question);
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await endEncounter(page);
});

for (const flag of ['', '&danaLive=0', '&danaLive=true']) {
  test(`prerecorded mode makes no live API requests when the strict flag is ${flag || 'absent'}`, async ({page}) => {
    const network = await openLiveFixture(page, {url: CONVERSATION_URL + flag});
    await expect(page.locator('#dana-audio-source')).toHaveValue('recorded');
    await expect(page.locator('header .eyebrow').first()).not.toContainText('LIVE');
    await page.getByRole('button', {name: 'Start conversation', exact: true}).click();
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    await page.evaluate(() => window.__danaLiveTest.emit('How have you been sleeping?'));
    await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    expect(network.requests).toEqual([]);
    expect(network.external).toEqual([]);
    await endEncounter(page);
  });
}
