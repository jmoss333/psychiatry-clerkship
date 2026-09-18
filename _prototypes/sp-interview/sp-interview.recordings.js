/* Exact, verified recordings for the localhost-only Dana conversation preview. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPInterviewRecordings = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var CASE_ID = 'sp_depression_gated_si_001';
  var MODEL = 'gpt-4o-mini-tts-2025-12-15';
  var DEFAULT_URL = '../../output/speech/dana-marin-v1/manifest.json';
  var OPENING_CASES = Object.freeze({
    sp_mania_redirect_001: {url: '../../output/speech/voice-cases-v1/marcus/manifest.json', voice: 'cedar'},
    sp_psychosis_paranoid_001: {url: '../../output/speech/voice-cases-v1/ray/manifest.json', voice: 'cedar'},
    sp_alcohol_ambivalence_001: {url: '../../output/speech/voice-cases-v1/morgan/manifest.json', voice: 'marin'}
  });
  var LOAD_TIMEOUT_MS = 15000;
  var HASH = /^[a-f0-9]{64}$/;

  function normalize(text) { return String(text == null ? '' : text).replace(/\s+/g, ' ').trim(); }
  function spoken(text) { return normalize(text.replace(/\*[^*]*\*/g, ' ').replace(/\[[^\]]*\]/g, ' ')); }
  function invalid(message) { throw new Error(message || 'Dana’s recording manifest is invalid.'); }

  function canonicalSpeech(pack, caseId, openingOnly) {
    var cases = pack && Array.isArray(pack.cases) ? pack.cases.filter(function (item) { return item.id === caseId; }) : [];
    if (cases.length !== 1) invalid('The recording catalog requires the canonical patient case.');
    var dana = cases[0], lines = new Set();
    function add(text) {
      if (typeof text !== 'string' || !normalize(text)) invalid('The Dana source catalog has missing speech.');
      lines.add(text);
    }
    add(dana.persona && dana.persona.opening);
    if (openingOnly) return lines;
    if (!dana.responses || !Array.isArray(dana.gated)) invalid('The Dana source catalog is incomplete.');
    Object.keys(dana.responses).forEach(function (intent) {
      var bank = dana.responses[intent];
      ['guarded', 'open', 'any'].forEach(function (tier) {
        if (!Object.prototype.hasOwnProperty.call(bank, tier)) return;
        if (!Array.isArray(bank[tier]) || !bank[tier].length) invalid('The Dana source catalog has an invalid response bank.');
        bank[tier].forEach(add);
      });
    });
    dana.gated.forEach(function (gate) {
      ['reveal', 'deflectLowRapport', 'deflectEuphemism', 'repeatAsk', 'deflectIfLocked'].forEach(function (field) {
        if (field === 'reveal' || Object.prototype.hasOwnProperty.call(gate, field)) add(gate[field]);
      });
    });
    if (lines.size !== 77) invalid('Dana’s recording catalog must contain all 77 scripted lines.');
    return lines;
  }

  async function loadLibrary(env, options) {
    options = options || {};
    var openingProfile = options.caseId && Object.prototype.hasOwnProperty.call(OPENING_CASES, options.caseId) ? OPENING_CASES[options.caseId] : null;
    var openingOnly = options.openingOnly === true;
    var caseId = openingProfile && openingOnly ? options.caseId : CASE_ID;
    var expectedURL = openingProfile && openingOnly ? openingProfile.url : (options.url || DEFAULT_URL);
    var expectedVoice = openingProfile && openingOnly ? openingProfile.voice : 'marin';
    function wording(danaText, openingText) { return openingOnly ? openingText : danaText; }
    if ((options.caseId || Object.prototype.hasOwnProperty.call(options, 'openingOnly')) && (!openingProfile || !openingOnly) ||
        openingProfile && openingOnly && options.url && options.url !== expectedURL) invalid('The requested patient recording mode is unavailable.');
    var URLType = env.URL || URL;
    var page = new URLType(env.location.href);
    var manifestURL = new URLType(expectedURL, page.href);
    if (['http:', 'https:'].indexOf(page.protocol) < 0 || ['localhost', '127.0.0.1', '[::1]'].indexOf(page.hostname) < 0 ||
        manifestURL.origin !== page.origin || manifestURL.username || manifestURL.password || manifestURL.hash) {
      invalid(wording('Dana recordings must load from the same local loopback origin as this preview.', 'The opening recording must load from the same local loopback origin as this preview.'));
    }
    if (!env.crypto || !env.crypto.subtle || !env.TextEncoder || !env.fetch || !env.AbortController) {
      invalid(wording('This browser cannot verify Dana’s local recordings. Choose a device voice.', 'This browser cannot verify the local opening recording. Reload in a supported browser.'));
    }
    var schedule = env.setTimeout.bind(env), unschedule = env.clearTimeout.bind(env);
    async function digest(value) {
      var bytes = typeof value === 'string' ? new env.TextEncoder().encode(value) : value;
      var result = await env.crypto.subtle.digest('SHA-256', bytes);
      return Array.prototype.map.call(new Uint8Array(result), function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    }
    var canonical = canonicalSpeech(options.pack, caseId, openingOnly);
    var manifestAbort = new env.AbortController(), manifestTimer;
    var manifest;
    try {
      manifest = await Promise.race([
        (async function () {
          var response = await env.fetch(manifestURL.href, {signal: manifestAbort.signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store'});
          if (!response.ok) invalid(wording('Dana’s recordings are not available on this computer yet. Choose a device voice.', 'The opening recording is not available on this computer yet. Check the local recordings and reload.'));
          return response.json();
        })(),
        new Promise(function (resolve, reject) {
          manifestTimer = schedule(function () {
            manifestAbort.abort();
            reject(new Error(wording('Dana’s recording manifest took too long to load. Choose a device voice or reload.', 'The opening recording manifest took too long to load. Check the local recordings and reload.')));
          }, LOAD_TIMEOUT_MS);
        })
      ]);
    } finally { unschedule(manifestTimer); }
    if (!manifest || manifest.schemaVersion !== 1 || manifest.caseId !== caseId ||
        manifest.packVersion !== options.pack.version || manifest.packHash !== await digest(JSON.stringify(options.pack))) {
      invalid('Dana’s recording manifest does not match the current case pack. Choose a device voice.');
    }
    if (manifest.voice !== expectedVoice || manifest.model !== MODEL) invalid('The patient recording manifest has an unexpected voice or model.');
    var expectedCount = openingOnly ? 1 : 77;
    if (!Array.isArray(manifest.entries) || manifest.entries.length !== expectedCount) invalid('The patient recording manifest has an unexpected entry count.');
    var entries = new Map();
    await Promise.all(manifest.entries.map(async function (entry) {
      if (!entry || typeof entry.sourceText !== 'string' || !canonical.has(entry.sourceText) ||
          entry.spokenText !== spoken(entry.sourceText)) invalid('A Dana recording does not match its canonical source text.');
      var key = normalize(entry.sourceText);
      if (entries.has(key)) invalid('Dana’s recording manifest contains a duplicate source entry.');
      // Reserve the source key before asynchronous hashing so duplicates cannot race.
      entries.set(key, null);
      var sourceHash = await digest(entry.sourceText);
      if (entry.id !== sourceHash || entry.sha256 !== sourceHash || entry.spokenHash !== await digest(entry.spokenText) ||
          entry.file !== sourceHash + '.mp3' || !HASH.test(entry.audioSha256) ||
          !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > 10 * 1024 * 1024 ||
          !Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0 || entry.durationSeconds > 90) {
        invalid('A Dana recording manifest entry has invalid hashes, file details, or duration.');
      }
      entries.set(key, Object.freeze({file: entry.file, audioSha256: entry.audioSha256, bytes: entry.bytes, durationSeconds: entry.durationSeconds}));
    }));
    if (entries.size !== canonical.size) invalid('Dana’s recording manifest is missing a scripted source line.');

    var cache = new Map(), active = new Set(), disposed = false;
    function speak(args) {
      var stopped = false, player = null, loading = null, timer = null;
      var handle = {stop: stop};
      active.add(handle);
      function release() {
        unschedule(timer); timer = null;
        if (loading) { loading.abort(); loading = null; }
        if (player) {
          player.onended = player.onerror = null;
          try { player.pause(); player.removeAttribute('src'); player.load(); } catch (_) {}
        }
        active.delete(handle);
      }
      function stop() { if (stopped) return; stopped = true; release(); }
      function finish(problem) {
        if (stopped || disposed) return;
        stopped = true; release();
        if (problem) args.onError(problem); else args.onEnded();
      }
      function fail(message) { finish(new Error(message)); }
      Promise.resolve().then(async function () {
        if (stopped) return;
        if (disposed) { stopped = true; release(); args.onError(new Error(wording('Dana’s recordings have been closed. Reload the preview.', 'The opening recording has been closed. Reload the preview.'))); return; }
        var entry = entries.get(normalize(args.text));
        if (!entry) { fail(wording('No exact recording exists for Dana’s complete reply. The reply remains visible; choose a device voice to continue.', 'No exact local recording exists for this patient reply. Reload the preview.')); return; }
        if (!env.Audio || !env.Blob || typeof URLType.createObjectURL !== 'function') {
          fail(wording('This browser cannot play Dana’s recordings. Choose a device voice.', 'This browser cannot play the local opening recording. Reload in a supported browser.')); return;
        }
        var blobURL = cache.get(entry.file);
        if (!blobURL) {
          loading = new env.AbortController();
          timer = schedule(function () { fail(wording('Dana’s recording took too long to load. The complete reply remains visible.', 'The opening recording took too long to load. Check the local recordings and reload.')); }, LOAD_TIMEOUT_MS);
          var response = await env.fetch(new URLType(entry.file, manifestURL).href, {signal: loading.signal, credentials: 'same-origin', redirect: 'error'});
          if (stopped || disposed) return;
          if (!response.ok) { fail(wording('Dana’s recording file is unavailable. The complete reply remains visible; choose a device voice to continue.', 'The opening recording file is unavailable. Check the local recordings and reload.')); return; }
          var bytes = await response.arrayBuffer();
          if (stopped || disposed) return;
          if (bytes.byteLength !== entry.bytes || await digest(bytes) !== entry.audioSha256) {
            if (!stopped && !disposed) fail(wording('Dana’s audio file did not match its verified recording. Choose a device voice to continue.', 'The opening audio file did not match its verified local recording. Check the local recordings and reload.'));
            return;
          }
          if (stopped || disposed) return;
          unschedule(timer); timer = null; loading = null;
          blobURL = cache.get(entry.file);
          if (!blobURL) {
            blobURL = URLType.createObjectURL(new env.Blob([bytes], {type: 'audio/mpeg'}));
            cache.set(entry.file, blobURL);
          }
        }
        if (stopped || disposed) return;
        player = new env.Audio();
        player.preload = 'auto';
        player.onended = function () { finish(); };
        player.onerror = function () { fail(wording('Dana’s audio could not play. The complete reply remains visible; choose a device voice to continue.', 'The opening recording could not play. Check the local recordings and reload.')); };
        player.src = blobURL;
        timer = schedule(function () { fail(wording('Dana’s audio did not finish playing. The microphone remains off.', 'The opening recording did not finish playing. The microphone remains off; reload to try again.')); }, Math.min(90000, Math.ceil(entry.durationSeconds * 1000) + 10000));
        await player.play();
      }).catch(function () {
        if (!stopped && !disposed) fail(wording('Dana’s audio could not load or play. The complete reply remains visible; choose a device voice to continue.', 'The opening recording could not load or play. Check the local recordings and reload.'));
      });
      return handle;
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      Array.from(active).forEach(function (handle) { handle.stop(); });
      cache.forEach(function (url) { URLType.revokeObjectURL(url); });
      cache.clear();
    }
    return {speak: speak, dispose: dispose, entryCount: entries.size, voice: manifest.voice, model: manifest.model};
  }
  return {loadLibrary: loadLibrary};
});
