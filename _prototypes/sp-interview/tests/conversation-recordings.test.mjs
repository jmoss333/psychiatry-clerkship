import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {createDanaAudioCatalog} from '../dana-audio-catalog.mjs';

const require = createRequire(import.meta.url);
const modulePath = new URL('../sp-interview.recordings.js', import.meta.url);
const localCasesPath = new URL('../sp-interview.local-cases.js', import.meta.url);
const pack = JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const audioBytes = new Uint8Array([73, 68, 51, 4, 0, 1, 2, 3]);
const opening = createDanaAudioCatalog(pack).entries[0].sourceText;
const morganCase = require(localCasesPath.pathname).cases[0];
const tick = () => new Promise(resolve => setImmediate(resolve));
function api() {
  assert.ok(fs.existsSync(modulePath), 'the local recording adapter must exist');
  return require(modulePath.pathname);
}
function fixture() {
  const manifest = {schemaVersion: 1, ...createDanaAudioCatalog(pack), packHash: hash(JSON.stringify(pack)),
    voice: 'marin', model: 'gpt-4o-mini-tts-2025-12-15'};
  manifest.entries = manifest.entries.map(entry => ({...entry, audioSha256: hash(audioBytes), bytes: audioBytes.length, durationSeconds: 3}));
  const requests = [], players = [], urls = [], revoked = [], timers = new Map();
  let nextTimer = 0, audioResponse = null, playResponse = null;
  class LocalURL extends URL {
    static createObjectURL(blob) { const url = 'blob:local/' + urls.length; urls.push({url, blob}); return url; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  class Audio {
    constructor() { players.push(this); this.src = ''; }
    play() { this.played = true; return playResponse ? playResponse() : Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { this.released = true; }
  }
  const env = {location: {href: 'http://127.0.0.1:4318/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1'},
    crypto: webcrypto, TextEncoder, AbortController, Blob, URL: LocalURL, Audio,
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, {callback, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) {
      requests.push({url, options});
      if (url.endsWith('manifest.json')) return {ok: true, json: async () => manifest};
      if (audioResponse) return audioResponse(url, options);
      return {ok: true, arrayBuffer: async () => audioBytes.buffer.slice(0)};
    }};
  return {env, manifest, requests, players, urls, revoked, timers,
    audioResponse(value) { audioResponse = value; }, playResponse(value) { playResponse = value; }};
}
function openingFixture(caseId, slug, extraCase = null) {
  const f = fixture();
  const casePack = extraCase ? {...pack, cases: [...pack.cases, extraCase]} : pack;
  const caseDef = casePack.cases.find(item => item.id === caseId);
  assert.ok(caseDef, `missing case fixture ${caseId}`);
  const sourceText = caseDef.persona.opening;
  const spokenText = sourceText.replace(/\*[^*]*\*/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const sourceHash = hash(sourceText);
  f.manifest.caseId = caseId;
  f.manifest.packHash = hash(JSON.stringify(casePack));
  f.manifest.voice = caseId === 'sp_alcohol_ambivalence_001' ? 'marin' : 'cedar';
  f.manifest.entries = [{
    id: sourceHash,
    sourceText,
    spokenText,
    spokenHash: hash(spokenText),
    file: sourceHash + '.mp3',
    sha256: sourceHash,
    audioSha256: hash(audioBytes),
    bytes: audioBytes.length,
    durationSeconds: 3,
  }];
  return {f, caseDef, options: {pack: casePack, caseId, openingOnly: true, url: `../../output/speech/voice-cases-v1/${slug}/manifest.json`}};
}
async function loaded(t, f = fixture()) {
  const library = await api().loadLibrary(f.env, {pack});
  t.after(() => library.dispose());
  return {library, ...f};
}
async function waitFor(check) { for (let i = 0; i < 30 && !check(); i++) await tick(); assert.ok(check(), 'expected asynchronous adapter work to settle'); }

test('validates all 75 canonical lines and serves exact recordings through a reusable verified cache', async t => {
  const f = await loaded(t); const endings = [], errors = [];
  assert.equal(f.library.entryCount, 75);
  assert.equal(f.library.voice, 'marin');
  assert.equal(f.requests.length, 1, 'loading the library must not download all recordings');
  const handle = f.library.speak({text: '  ' + opening.replace(/ /g, '  ') + ' ', onEnded() { endings.push('done'); }, onError(e) { errors.push(e); }});
  assert.equal(typeof handle.stop, 'function', 'speak immediately returns cancellation');
  await waitFor(() => f.players.length === 1 && f.players[0].played);
  assert.match(f.requests[1].url, /\/output\/speech\/dana-marin-v1\/[a-f0-9]{64}\.mp3$/);
  assert.equal(f.players[0].src, 'blob:local/0');
  const ended = f.players[0].onended; ended(); ended();
  assert.deepEqual(endings, ['done']); assert.deepEqual(errors, []);
  f.library.speak({text: opening, onEnded() {}, onError(e) { throw e; }});
  await waitFor(() => f.players.length === 2 && f.players[1].played);
  assert.equal(f.requests.length, 2, 'verified recordings are not fetched again');
  f.library.dispose();
  assert.deepEqual(f.revoked, ['blob:local/0']);
  assert.equal(f.players[1].paused, true);
  assert.equal(f.players[1].onended, null);
  assert.equal(f.timers.size, 0);
});

test('loads the exact Marcus, Ray, and draft Morgan openings only with their explicit case-bound options', async t => {
  for (const [caseId, slug, extraCase] of [['sp_mania_redirect_001', 'marcus'], ['sp_psychosis_paranoid_001', 'ray'], ['sp_alcohol_ambivalence_001', 'morgan', morganCase]]) {
    const {f, caseDef, options} = openingFixture(caseId, slug, extraCase);
    const library = await api().loadLibrary(f.env, options);
    t.after(() => library.dispose());
    assert.equal(library.entryCount, 1);
    assert.equal(library.voice, caseId === 'sp_alcohol_ambivalence_001' ? 'marin' : 'cedar');
    library.speak({text: caseDef.persona.opening, onEnded() {}, onError(error) { throw error; }});
    await waitFor(() => f.players.length === 1 && f.players[0].played);
    assert.match(f.requests[1].url, new RegExp(`/output/speech/voice-cases-v1/${slug}/[a-f0-9]{64}\\.mp3$`));
  }
});

test('opening-only recordings reject unsupported cases, modes, voices, and noncanonical entries', async () => {
  const valid = () => openingFixture('sp_mania_redirect_001', 'marcus');
  for (const mutate of [
    ({options}) => { options.caseId = 'sp_depression_gated_si_001'; },
    ({options}) => { options.caseId = '__proto__'; },
    ({options}) => { options.openingOnly = false; },
    ({options}) => { delete options.openingOnly; },
    ({f}) => { f.manifest.voice = 'marin'; },
    ({f}) => { f.manifest.caseId = 'sp_psychosis_paranoid_001'; },
    ({f}) => { f.manifest.entries.push({...f.manifest.entries[0]}); },
    ({f}) => { f.manifest.entries[0].sourceText += ' Changed.'; },
  ]) {
    const value = valid(); mutate(value);
    await assert.rejects(api().loadLibrary(value.f.env, value.options), /manifest|recording|case|opening|voice|mode|entry|source/i);
  }
});

test('opening-only playback failures identify the opening and never suggest a device fallback', async t => {
  const value = openingFixture('sp_psychosis_paranoid_001', 'ray');
  value.f.audioResponse(async () => ({ok: false, status: 404}));
  const library = await api().loadLibrary(value.f.env, value.options);
  t.after(() => library.dispose());
  let problem;
  library.speak({text: value.caseDef.persona.opening, onEnded() { throw new Error('must not complete'); }, onError(error) { problem = error; }});
  await waitFor(() => problem);
  assert.match(problem.message, /opening recording|local recording/i);
  assert.doesNotMatch(problem.message, /Dana|device voice/i);
});

test('rejects remote manifest URLs and manifests for stale or altered source text', async () => {
  for (const url of ['https://example.com/manifest.json', 'http://localhost:4318/manifest.json', 'file:///tmp/manifest.json']) {
    const f = fixture();
    await assert.rejects(api().loadLibrary(f.env, {pack, url}), /local|origin|loopback/i);
    assert.equal(f.requests.length, 0);
  }
  for (const mutate of [
    m => { m.packHash = 'a'.repeat(64); },
    m => { m.entries.pop(); },
    m => { m.entries[0] = {...m.entries[1]}; },
    m => { m.entries[0].sourceText += ' Changed.'; },
    m => { m.entries[0].spokenText += ' Changed.'; },
    m => { m.entries[0].file = '../different.mp3'; },
    m => { m.voice = 'different'; },
    m => { m.model = 'different'; },
  ]) {
    const f = fixture(); mutate(f.manifest);
    await assert.rejects(api().loadLibrary(f.env, {pack}), /manifest|pack|recording|source|voice|model|entry|catalog|75/i);
  }
});

test('missing exact reply never fetches another line or completes silently', async t => {
  const f = await loaded(t); const errors = []; let endings = 0;
  const handle = f.library.speak({text: opening + ' Almost the same.', onEnded() { endings++; }, onError(e) { errors.push(e); }});
  assert.equal(typeof handle.stop, 'function');
  await waitFor(() => errors.length === 1);
  assert.match(errors[0].message, /recording|exact/i);
  assert.equal(f.requests.length, 1); assert.equal(f.players.length, 0); assert.equal(endings, 0);
});

test('corrupt, missing and wrong-length audio fail before creating a player or caching bytes', async t => {
  for (const response of [
    {ok: false, status: 404},
    {ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer},
    {ok: true, arrayBuffer: async () => new Uint8Array(audioBytes.length).buffer},
  ]) {
    const f = fixture(); f.audioResponse(async () => response);
    const {library} = await loaded(t, f); let problem;
    library.speak({text: opening, onEnded() { throw new Error('must not complete'); }, onError(e) { problem = e; }});
    await waitFor(() => problem);
    assert.match(problem.message, /recording|audio|file/i);
    assert.equal(f.players.length, 0); assert.equal(f.urls.length, 0);
  }
});

test('stopping during download aborts it and suppresses delayed audio and callbacks', async t => {
  const f = fixture(); let resolveAudio;
  f.audioResponse(() => new Promise(resolve => { resolveAudio = resolve; }));
  const {library} = await loaded(t, f); let callbacks = 0;
  const handle = library.speak({text: opening, onEnded() { callbacks++; }, onError() { callbacks++; }});
  await waitFor(() => resolveAudio);
  handle.stop(); assert.equal(f.requests[1].options.signal.aborted, true);
  resolveAudio({ok: true, arrayBuffer: async () => audioBytes.buffer.slice(0)});
  await tick(); await tick();
  assert.equal(callbacks, 0); assert.equal(f.players.length, 0); assert.equal(f.urls.length, 0);
});

test('stopping playback releases the player and ignores late ended and play rejection', async t => {
  const f = fixture(); let rejectPlay;
  f.playResponse(() => new Promise((resolve, reject) => { rejectPlay = reject; }));
  const {library} = await loaded(t, f); let callbacks = 0;
  const handle = library.speak({text: opening, onEnded() { callbacks++; }, onError() { callbacks++; }});
  await waitFor(() => rejectPlay);
  const player = f.players[0], ended = player.onended, failed = player.onerror;
  handle.stop(); ended(); failed(); rejectPlay(new Error('blocked after cancellation'));
  await tick();
  assert.equal(callbacks, 0); assert.equal(player.paused, true); assert.equal(player.released, true);
  assert.equal(player.src, ''); assert.equal(player.onended, null); assert.equal(f.timers.size, 0);
});

test('blocked playback fails once and never signals a completed patient turn', async t => {
  const f = fixture(); f.playResponse(() => Promise.reject(new Error('NotAllowedError')));
  const {library} = await loaded(t, f); let failures = 0, ended = 0;
  library.speak({text: opening, onEnded() { ended++; }, onError() { failures++; }});
  await waitFor(() => failures);
  assert.equal(failures, 1); assert.equal(ended, 0); assert.equal(f.players[0].paused, true);
  assert.equal(f.timers.size, 0);
});

test('download and playback deadlines leave no active resources', async t => {
  const f = fixture(); f.audioResponse(() => new Promise(() => {}));
  const {library} = await loaded(t, f); let problem;
  library.speak({text: opening, onEnded() {}, onError(e) { problem = e; }});
  await waitFor(() => f.requests.length === 2);
  const downloading = [...f.timers.values()].find(timer => timer.delay === 15000);
  assert.ok(downloading); downloading.callback();
  await waitFor(() => problem);
  assert.equal(f.requests[1].options.signal.aborted, true);
  assert.match(problem.message, /time|recording|load/i);
  assert.equal(f.timers.size, 0);

  const g = await loaded(t); let playbackProblem;
  g.library.speak({text: opening, onEnded() {}, onError(e) { playbackProblem = e; }});
  await waitFor(() => g.players.length === 1 && g.players[0].played);
  const playing = [...g.timers.values()].find(timer => timer.delay === 13000);
  assert.ok(playing); playing.callback();
  await waitFor(() => playbackProblem);
  assert.equal(g.players[0].paused, true); assert.equal(g.timers.size, 0);
});

test('unavailable or timed-out manifests leave device-mode recovery possible', async () => {
  const missing = fixture(); missing.env.fetch = async () => ({ok: false, status: 404});
  await assert.rejects(api().loadLibrary(missing.env, {pack}), /not available|device voice/i);
  assert.equal(missing.timers.size, 0);

  const stalled = fixture(); let request;
  stalled.env.fetch = (url, options) => { request = options; return new Promise(() => {}); };
  const result = api().loadLibrary(stalled.env, {pack});
  const timer = [...stalled.timers.values()].find(item => item.delay === 15000);
  assert.ok(timer); timer.callback();
  await assert.rejects(result, /too long|device voice/i);
  assert.equal(request.signal.aborted, true); assert.equal(stalled.timers.size, 0);
});

test('disposing an in-progress load suppresses callbacks and prevents new playback', async t => {
  const f = fixture(); let resolveAudio;
  f.audioResponse(() => new Promise(resolve => { resolveAudio = resolve; }));
  const {library} = await loaded(t, f); let staleCallbacks = 0, closedError;
  library.speak({text: opening, onEnded() { staleCallbacks++; }, onError() { staleCallbacks++; }});
  await waitFor(() => resolveAudio);
  library.dispose(); library.dispose();
  resolveAudio({ok: true, arrayBuffer: async () => audioBytes.buffer.slice(0)});
  library.speak({text: opening, onEnded() { throw new Error('must stay closed'); }, onError(e) { closedError = e; }});
  await waitFor(() => closedError);
  assert.match(closedError.message, /closed|reload/i);
  assert.equal(staleCallbacks, 0); assert.equal(f.players.length, 0); assert.equal(f.urls.length, 0);
  assert.equal(f.requests.length, 2); assert.equal(f.timers.size, 0);
});
