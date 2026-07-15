(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPInterviewVoice = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MAX_RECORDING_BYTES = 4 * 1024 * 1024;
  var MAX_RECORDING_MS = 90 * 1000;
  var MAX_CACHE_BYTES = 10 * 1024 * 1024;
  var MAX_CACHE_OBJECTS = 3;
  var DEFAULT_MIME_TYPE = 'audio/webm';

  function voiceError(code, message, cause) {
    var error = new Error(message || code);
    error.name = 'SPInterviewVoiceError';
    error.code = code;
    if (cause !== undefined) error.cause = cause;
    return error;
  }

  function normalizeError(error, fallbackCode) {
    if (error && typeof error === 'object' && error.code) return error;
    if (error instanceof Error) {
      error.code = fallbackCode;
      return error;
    }
    return voiceError(fallbackCode, String(error || fallbackCode), error);
  }

  function errorSnapshot(error) {
    return error ? { code: error.code || 'voice_failed', message: error.message || String(error) } : null;
  }

  function spokenText(reply) {
    return String(reply == null ? '' : reply)
      .replace(/\*[^*]*\*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function freezeTree(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freezeTree(value[key]); });
    return Object.freeze(value);
  }

  function immutableTicket(ticket) {
    if (!ticket || typeof ticket !== 'object') return ticket;
    try {
      return freezeTree(JSON.parse(JSON.stringify(ticket)));
    } catch (error) {
      throw voiceError('invalid_response', 'The actor returned an invalid speech ticket.', error);
    }
  }

  function byteLength(value) {
    if (value == null) return 0;
    if (typeof value.size === 'number') return value.size;
    if (typeof value.byteLength === 'number') return value.byteLength;
    if (typeof value.length === 'number') return value.length;
    return NaN;
  }

  function createAudio(chunks, mimeType) {
    if (typeof Blob !== 'undefined') return new Blob(chunks, { type: mimeType });
    var total = 0;
    var views = chunks.map(function (chunk) {
      var view;
      if (chunk instanceof Uint8Array) view = chunk;
      else if (chunk instanceof ArrayBuffer) view = new Uint8Array(chunk);
      else if (chunk && chunk.buffer instanceof ArrayBuffer) {
        view = new Uint8Array(chunk.buffer, chunk.byteOffset || 0, chunk.byteLength);
      } else {
        throw voiceError('invalid_audio', 'Recorder returned an unsupported audio chunk.');
      }
      total += view.byteLength;
      return view;
    });
    var output = new Uint8Array(total);
    var offset = 0;
    views.forEach(function (view) {
      output.set(view, offset);
      offset += view.byteLength;
    });
    return output;
  }

  function createWork() {
    var resolve;
    var reject;
    var promise = new Promise(function (res, rej) {
      resolve = res;
      reject = rej;
    });
    promise.catch(function () {});
    return { promise: promise, resolve: resolve, reject: reject, settled: false };
  }

  function resolveWork(work, value) {
    if (!work || work.settled) return false;
    work.settled = true;
    work.resolve(value);
    return true;
  }

  function rejectWork(work, error) {
    if (!work || work.settled) return false;
    work.settled = true;
    work.reject(error);
    return true;
  }

  function rejected(error) {
    var promise = Promise.reject(error);
    promise.catch(function () {});
    return promise;
  }

  function createController(inputDeps) {
    var deps = inputDeps || {};
    var timerSet = deps.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
    var timerClear = deps.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null);
    var mimeType = deps.mimeType || DEFAULT_MIME_TYPE;
    var listeners = [];
    var destroyed = false;
    var openingAccepted = false;
    var recorderSession = null;
    var actorOperation = null;
    var speechOperation = null;
    var playerOwner = null;
    var pendingReply = null;
    var cache = [];
    var cacheBytes = 0;

    var state = {
      phase: 'ready',
      mode: 'off',
      encounterId: null,
      turnId: 0,
      draft: '',
      error: null,
      activePatientTurn: null,
      replayableTurnIds: [],
    };

    function snapshot() {
      return {
        phase: state.phase,
        mode: state.mode,
        encounterId: state.encounterId,
        turnId: state.turnId,
        draft: state.draft,
        error: state.error ? { code: state.error.code, message: state.error.message } : null,
        activePatientTurn: state.activePatientTurn,
        replayableTurnIds: state.replayableTurnIds.slice(),
      };
    }

    function publish(patch) {
      Object.keys(patch).forEach(function (key) {
        state[key] = patch[key];
      });
      var next = snapshot();
      listeners.slice().forEach(function (listener) {
        try { listener(next); } catch (error) {}
      });
    }

    function assertAlive() {
      if (destroyed) throw voiceError('cancelled', 'The voice controller has been destroyed.');
    }

    function assertActiveEncounter() {
      assertAlive();
      if (state.encounterId == null || state.phase === 'ended') {
        throw voiceError('invalid_state', 'No active encounter is available.');
      }
    }

    function newAbortController() {
      if (typeof AbortController === 'undefined') {
        throw voiceError('unavailable', 'AbortController is unavailable.');
      }
      return new AbortController();
    }

    function safeAbort(controller) {
      if (!controller || controller.signal.aborted) return;
      try { controller.abort(); } catch (error) {}
    }

    function safeCall(target, name) {
      if (!target || typeof target[name] !== 'function') return;
      try { target[name](); } catch (error) {}
    }

    function requireAdapter(adapter, methods, label) {
      var missing = methods.filter(function (method) {
        return !adapter || typeof adapter[method] !== 'function';
      });
      if (missing.length) {
        throw voiceError('invalid_adapter', label + ' is missing ' + missing.join(', ') + '.');
      }
      return adapter;
    }

    function isContext(encounterId, turnId) {
      return !destroyed && state.encounterId === encounterId && state.turnId === turnId && state.phase !== 'ended';
    }

    function refreshReplayIds() {
      state.replayableTurnIds = cache.map(function (entry) { return entry.turnId; });
    }

    function revokeEntry(entry) {
      if (!entry || entry.revoked) return false;
      entry.revoked = true;
      if (typeof deps.revokeObjectURL === 'function') {
        try { deps.revokeObjectURL(entry.url); } catch (error) {}
      }
      return true;
    }

    function revokeLooseUrl(url) {
      if (typeof deps.revokeObjectURL !== 'function') return;
      try { deps.revokeObjectURL(url); } catch (error) {}
    }

    function clearCache() {
      cache.forEach(revokeEntry);
      cache = [];
      cacheBytes = 0;
      refreshReplayIds();
    }

    function cacheEntry(entry) {
      if (entry.size > MAX_CACHE_BYTES) return false;
      while (
        cache.length >= MAX_CACHE_OBJECTS ||
        (cache.length && cacheBytes + entry.size > MAX_CACHE_BYTES)
      ) {
        var evicted = cache.shift();
        cacheBytes -= evicted.size;
        revokeEntry(evicted);
      }
      cache.push(entry);
      cacheBytes += entry.size;
      refreshReplayIds();
      return true;
    }

    function clearRecordingTimer(session) {
      if (!session || session.timerId == null || !timerClear) return;
      timerClear(session.timerId);
      session.timerId = null;
    }

    function releaseRecorder(session, cancel) {
      if (!session) return;
      clearRecordingTimer(session);
      if (cancel && !session.cancelled && !session.stopHandled) {
        session.cancelled = true;
        safeCall(session.recorder, 'cancel');
      }
      if (!session.released) {
        session.released = true;
        safeCall(session.recorder, 'release');
      }
    }

    function cancelRecording(code, reason) {
      var session = recorderSession;
      if (!session) return false;
      recorderSession = null;
      releaseRecorder(session, true);
      session.chunks = [];
      rejectWork(session.work, voiceError(code, reason || code));
      return true;
    }

    function cancelOperation(operation, code, reason) {
      if (!operation) return false;
      restoreActorDraft(operation);
      safeAbort(operation.abortController);
      rejectWork(operation.work, voiceError(code, reason || code));
      return true;
    }

    function restoreActorDraft(operation) {
      var request = operation && operation.kind === 'actor' ? operation.request : null;
      if (
        !request ||
        request.mode !== 'converse' ||
        state.encounterId !== request.encounterId ||
        state.turnId !== request.turnId
      ) return false;
      if (state.draft === '') state.draft = request.text;
      state.turnId = request.turnId - 1;
      return true;
    }

    function releasePlayer(owner, stop) {
      if (!owner || !owner.active) return false;
      owner.active = false;
      if (playerOwner === owner) playerOwner = null;
      if (stop) safeCall(owner.player, 'stop');
      safeCall(owner.player, 'destroy');
      if (owner.oneShotEntry) revokeEntry(owner.oneShotEntry);
      return true;
    }

    function cancelPlayer() {
      return playerOwner ? releasePlayer(playerOwner, true) : false;
    }

    function cancelOwned(code, reason) {
      var changed = false;
      if (cancelRecording(code, reason)) changed = true;
      if (actorOperation) {
        var actor = actorOperation;
        actorOperation = null;
        if (cancelOperation(actor, code, reason)) changed = true;
      }
      if (speechOperation) {
        var speech = speechOperation;
        speechOperation = null;
        if (cancelOperation(speech, code, reason)) changed = true;
      }
      if (cancelPlayer()) changed = true;
      return changed;
    }

    function failState(error, activeTurn) {
      var normalized = normalizeError(error, 'voice_failed');
      publish({
        phase: 'error',
        error: errorSnapshot(normalized),
        activePatientTurn: activeTurn == null ? null : activeTurn,
        replayableTurnIds: state.replayableTurnIds.slice(),
      });
      return normalized;
    }

    function onPlayerEnded(owner) {
      if (!owner || !owner.active || playerOwner !== owner || !isContext(owner.encounterId, owner.stateTurnId)) return;
      releasePlayer(owner, false);
      pendingReply = null;
      publish({ phase: 'ready', error: null, activePatientTurn: null });
    }

    function onPlayerError(owner, error) {
      if (!owner || !owner.active || playerOwner !== owner || !isContext(owner.encounterId, owner.stateTurnId)) return;
      releasePlayer(owner, false);
      failState(normalizeError(error, 'playback_failed'), owner.turnId);
    }

    function startPlayer(config) {
      var factory = deps[config.factory];
      if (typeof factory !== 'function') throw voiceError('unavailable', config.unavailable);
      cancelPlayer();
      var owner = {
        active: true,
        encounterId: config.encounterId,
        turnId: config.turnId,
        stateTurnId: state.turnId,
        player: null,
        oneShotEntry: config.oneShotEntry || null,
      };
      var options = Object.assign({}, config.options, {
        encounterId: config.encounterId,
        turnId: config.turnId,
        onEnded: function () { onPlayerEnded(owner); },
        onError: function (error) { onPlayerError(owner, error); },
      });
      try {
        owner.player = factory(options);
        requireAdapter(
          owner.player,
          config.play ? ['play', 'stop', 'destroy'] : ['stop', 'destroy'],
          config.play ? 'Managed player adapter' : 'Device player adapter',
        );
        if (config.onValidated) config.onValidated(owner);
        playerOwner = owner;
        publish({
          phase: 'speaking',
          error: null,
          activePatientTurn: config.turnId,
          replayableTurnIds: state.replayableTurnIds.slice(),
        });
        var playResult = config.play && typeof owner.player.play === 'function' ? owner.player.play() : undefined;
        if (playResult && typeof playResult.then === 'function') {
          playResult.catch(function (error) { onPlayerError(owner, error); });
        }
      } catch (error) {
        releasePlayer(owner, true);
        throw normalizeError(error, 'playback_failed');
      }
      return true;
    }

    function startManagedPlayer(entry) {
      return startPlayer({
        factory: 'createPlayer',
        unavailable: 'Managed audio playback is unavailable.',
        encounterId: entry.encounterId,
        turnId: entry.turnId,
        oneShotEntry: entry.cached ? null : entry,
        play: true,
        options: { url: entry.url, mimeType: entry.mimeType },
        onValidated: function (owner) {
          if (!entry.cached) entry.cached = cacheEntry(entry);
          owner.oneShotEntry = entry.cached ? null : entry;
        },
      });
    }

    function startDevicePlayback(reply) {
      var text = spokenText(reply.reply);
      if (!text) {
        pendingReply = null;
        publish({ phase: 'ready', error: null, activePatientTurn: null });
        return false;
      }
      return startPlayer({
        factory: 'deviceSpeak',
        unavailable: 'Device speech is unavailable.',
        encounterId: reply.encounterId,
        turnId: reply.turnId,
        play: false,
        options: { text: text },
      });
    }

    function onRecordingChunk(session, chunk) {
      if (recorderSession !== session || session.cancelled || session.stopHandled) return;
      var size = byteLength(chunk);
      if (!Number.isFinite(size) || size < 0) {
        onRecordingError(session, voiceError('invalid_audio', 'Recorder returned an invalid audio chunk.'));
        return;
      }
      session.bytes += size;
      if (session.bytes > MAX_RECORDING_BYTES) {
        recorderSession = null;
        session.chunks = [];
        releaseRecorder(session, true);
        var error = voiceError('audio_too_large', 'Recording exceeded the 4 MiB limit.');
        rejectWork(session.work, error);
        failState(error, null);
        return;
      }
      session.chunks.push(chunk);
    }

    function finishTranscription(operation, result) {
      if (operation.work.settled) return;
      if (
        speechOperation !== operation ||
        !isContext(operation.encounterId, operation.baseTurnId) ||
        state.phase !== 'transcribing'
      ) {
        if (speechOperation === operation) speechOperation = null;
        rejectWork(operation.work, voiceError('stale_operation', 'The transcription is stale.'));
        return;
      }
      speechOperation = null;
      var text = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'text')
        ? result.text
        : result;
      text = String(text == null ? '' : text);
      publish({ phase: 'ready', draft: text, error: null, activePatientTurn: null });
      resolveWork(operation.work, text);
    }

    function failTranscription(operation, error) {
      if (operation.work.settled) return;
      if (speechOperation !== operation || !isContext(operation.encounterId, operation.baseTurnId)) {
        rejectWork(operation.work, voiceError('stale_operation', 'The transcription is stale.'));
        return;
      }
      speechOperation = null;
      var normalized = normalizeError(error, 'transcription_failed');
      failState(normalized, null);
      rejectWork(operation.work, normalized);
    }

    function startTranscription(session) {
      var audio;
      try {
        audio = createAudio(session.chunks, session.mimeType);
      } catch (error) {
        var invalid = normalizeError(error, 'invalid_audio');
        failState(invalid, null);
        rejectWork(session.work, invalid);
        return;
      }
      session.chunks = [];
      if (typeof deps.transcribe !== 'function') {
        var unavailable = voiceError('unavailable', 'Managed transcription is unavailable.');
        failState(unavailable, null);
        rejectWork(session.work, unavailable);
        return;
      }
      var operation = {
        kind: 'transcription',
        encounterId: session.encounterId,
        baseTurnId: session.baseTurnId,
        turnId: session.turnId,
        abortController: newAbortController(),
        work: session.work,
      };
      speechOperation = operation;
      var transcription;
      try {
        transcription = deps.transcribe({
          audio: audio,
          mimeType: session.mimeType,
          signal: operation.abortController.signal,
          encounterId: operation.encounterId,
          turnId: operation.turnId,
        });
      } catch (error) {
        failTranscription(operation, error);
        return;
      }
      Promise.resolve(transcription).then(
        function (result) { finishTranscription(operation, result); },
        function (error) { failTranscription(operation, error); },
      );
    }

    function onRecordingStop(session) {
      if (recorderSession !== session || session.cancelled || session.stopHandled) return;
      session.stopHandled = true;
      recorderSession = null;
      clearRecordingTimer(session);
      releaseRecorder(session, false);
      if (state.phase !== 'transcribing') publish({ phase: 'transcribing', error: null });
      startTranscription(session);
    }

    function onRecordingError(session, error) {
      if (recorderSession !== session || session.cancelled || session.stopHandled) return;
      recorderSession = null;
      session.chunks = [];
      releaseRecorder(session, true);
      var normalized = normalizeError(error, 'recording_failed');
      rejectWork(session.work, normalized);
      failState(normalized, null);
    }

    function requestRecordingStop(session) {
      if (recorderSession !== session || session.cancelled || session.stopRequested) return false;
      session.stopRequested = true;
      clearRecordingTimer(session);
      publish({ phase: 'transcribing', error: null });
      try {
        session.recorder.stop();
      } catch (error) {
        onRecordingError(session, error);
      }
      return true;
    }

    function startActor(mode, text, turnId, runActor) {
      var request = Object.freeze({
        encounterId: state.encounterId,
        turnId: turnId,
        text: text,
        mode: mode,
      });
      var operation = {
        kind: 'actor',
        request: request,
        encounterId: request.encounterId,
        turnId: request.turnId,
        abortController: newAbortController(),
        work: createWork(),
      };
      actorOperation = operation;
      pendingReply = null;
      publish({ phase: 'awaiting_patient', error: null, activePatientTurn: null });
      Promise.resolve().then(function () {
        if (operation.work.settled) return undefined;
        return runActor({
          mode: request.mode,
          text: request.text,
          signal: operation.abortController.signal,
          encounterId: request.encounterId,
          turnId: request.turnId,
        });
      }).then(function (result) {
        if (operation.work.settled) return;
        if (actorOperation !== operation || !isContext(operation.encounterId, operation.turnId)) {
          if (actorOperation === operation) actorOperation = null;
          rejectWork(operation.work, voiceError('stale_operation', 'The actor response is stale.'));
          return;
        }
        actorOperation = null;
        if (!result || typeof result.reply !== 'string') {
          var invalid = voiceError('invalid_response', 'The actor returned an invalid response.');
          restoreActorDraft(operation);
          failState(invalid, null);
          rejectWork(operation.work, invalid);
          return;
        }
        var authoritative;
        try {
          authoritative = Object.freeze({
            encounterId: operation.encounterId,
            turnId: operation.turnId,
            reply: result.reply,
            ticket: immutableTicket(result.ticket == null ? null : result.ticket),
          });
        } catch (error) {
          restoreActorDraft(operation);
          failState(error, null);
          rejectWork(operation.work, error);
          return;
        }
        pendingReply = authoritative;
        var ready = {
          encounterId: authoritative.encounterId,
          turnId: authoritative.turnId,
          reply: authoritative.reply,
          ticket: authoritative.ticket,
        };
        publish({ phase: 'reply_ready', error: null, activePatientTurn: operation.turnId });
        resolveWork(operation.work, ready);
      }, function (error) {
        if (operation.work.settled) return;
        if (actorOperation !== operation || !isContext(operation.encounterId, operation.turnId)) {
          rejectWork(operation.work, voiceError('stale_operation', 'The actor response is stale.'));
          return;
        }
        actorOperation = null;
        var normalized = normalizeError(error, 'actor_failed');
        pendingReply = null;
        restoreActorDraft(operation);
        failState(normalized, null);
        rejectWork(operation.work, normalized);
      });
      return operation.work.promise;
    }

    function finishSynthesis(operation, result) {
      var audio = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'audio')
        ? result.audio
        : result;
      var resultMime = result && result.mimeType ? result.mimeType : 'audio/mpeg';
      var size = byteLength(audio);
      var url;
      try {
        if (!Number.isFinite(size) || size < 0) throw voiceError('invalid_audio', 'Synthesis returned invalid audio.');
        if (typeof deps.createObjectURL !== 'function') throw voiceError('unavailable', 'Object URL creation is unavailable.');
        url = deps.createObjectURL(audio);
      } catch (error) {
        if (operation.work.settled) return;
        failSynthesis(operation, error);
        return;
      }

      if (
        operation.work.settled ||
        speechOperation !== operation ||
        !isContext(operation.encounterId, operation.turnId) ||
        state.phase !== 'buffering_audio'
      ) {
        revokeLooseUrl(url);
        if (!operation.work.settled) {
          if (speechOperation === operation) speechOperation = null;
          rejectWork(operation.work, voiceError('stale_operation', 'The synthesized audio is stale.'));
        }
        return;
      }

      speechOperation = null;
      var entry = {
        encounterId: operation.encounterId,
        turnId: operation.turnId,
        url: url,
        audio: audio,
        mimeType: resultMime,
        size: size,
        revoked: false,
        cached: false,
      };
      try {
        startManagedPlayer(entry);
        resolveWork(operation.work, {
          encounterId: operation.encounterId,
          turnId: operation.turnId,
          replayable: entry.cached,
        });
      } catch (error) {
        if (!entry.cached) revokeEntry(entry);
        var normalized = failState(error, operation.turnId);
        rejectWork(operation.work, normalized);
      }
    }

    function failSynthesis(operation, error) {
      if (operation.work.settled) return;
      if (speechOperation !== operation || !isContext(operation.encounterId, operation.turnId)) {
        rejectWork(operation.work, voiceError('stale_operation', 'The synthesized audio is stale.'));
        return;
      }
      speechOperation = null;
      var normalized = normalizeError(error, 'synthesis_failed');
      failState(normalized, operation.turnId);
      rejectWork(operation.work, normalized);
    }

    function beginEncounter(encounterId) {
      assertAlive();
      if (encounterId == null || String(encounterId).trim() === '') {
        throw voiceError('invalid_argument', 'encounterId is required.');
      }
      cancelOwned('stale_operation', 'The encounter was replaced.');
      clearCache();
      openingAccepted = false;
      pendingReply = null;
      publish({
        phase: 'ready',
        encounterId: encounterId,
        turnId: 0,
        draft: '',
        error: null,
        activePatientTurn: null,
        replayableTurnIds: [],
      });
      return true;
    }

    function requestOpening(options) {
      try {
        assertActiveEncounter();
        if (state.phase !== 'ready' || openingAccepted || state.turnId !== 0) {
          throw voiceError('invalid_state', 'The opening is not available in the current state.');
        }
        if (!options || typeof options.runActor !== 'function') {
          throw voiceError('invalid_argument', 'runActor must be a function.');
        }
        return startActor('open', '', 0, options.runActor);
      } catch (error) {
        return rejected(error);
      }
    }

    function setMode(mode) {
      assertAlive();
      if (mode !== 'off' && mode !== 'device' && mode !== 'managed') {
        throw voiceError('invalid_mode', 'Voice mode must be off, device, or managed.');
      }
      if (state.phase === 'ended') throw voiceError('invalid_state', 'The encounter has ended.');
      if (state.mode === mode) return false;
      cancelOwned('cancelled', 'Voice mode changed.');
      pendingReply = null;
      if (mode === 'off') clearCache();
      publish({
        phase: 'ready',
        mode: mode,
        error: null,
        activePatientTurn: null,
        replayableTurnIds: state.replayableTurnIds.slice(),
      });
      return true;
    }

    function setDraft(text) {
      assertActiveEncounter();
      if (state.phase !== 'ready') {
        throw voiceError('invalid_state', 'The draft is editable only in ready state.');
      }
      publish({ draft: String(text == null ? '' : text) });
      return state.draft;
    }

    function startListening() {
      assertActiveEncounter();
      if (state.mode !== 'managed' || state.phase !== 'ready') {
        throw voiceError('invalid_state', 'Listening is available only in managed ready state.');
      }
      if (typeof deps.createRecorder !== 'function') {
        throw voiceError('unavailable', 'Managed recording is unavailable.');
      }
      cancelPlayer();
      var session = {
        encounterId: state.encounterId,
        baseTurnId: state.turnId,
        turnId: state.turnId + 1,
        mimeType: mimeType,
        chunks: [],
        bytes: 0,
        timerId: null,
        recorder: null,
        cancelled: false,
        stopRequested: false,
        stopHandled: false,
        released: false,
        work: createWork(),
      };
      try {
        session.recorder = deps.createRecorder({
          mimeType: mimeType,
          encounterId: session.encounterId,
          turnId: session.turnId,
          onChunk: function (chunk) { onRecordingChunk(session, chunk); },
          onStop: function () { onRecordingStop(session); },
          onError: function (error) { onRecordingError(session, error); },
        });
        requireAdapter(session.recorder, ['start', 'stop', 'cancel', 'release'], 'Recorder adapter');
        recorderSession = session;
        publish({ phase: 'listening', error: null, activePatientTurn: null });
        if (timerSet) {
          session.timerId = timerSet(function () { requestRecordingStop(session); }, MAX_RECORDING_MS);
        }
        session.recorder.start();
      } catch (error) {
        if (recorderSession === session) recorderSession = null;
        releaseRecorder(session, true);
        var normalized = normalizeError(error, 'recording_failed');
        rejectWork(session.work, normalized);
        failState(normalized, null);
        throw normalized;
      }
      return true;
    }

    function stopListening() {
      if (destroyed || !recorderSession || state.phase !== 'listening') return false;
      var session = recorderSession;
      requestRecordingStop(session);
      return session.work.promise;
    }

    function submitTurn(options) {
      try {
        assertActiveEncounter();
        if (state.phase !== 'ready' || !openingAccepted || !state.draft.trim()) {
          throw voiceError('invalid_state', 'A nonempty reviewed draft is required in ready state.');
        }
        if (!options || typeof options.runActor !== 'function') {
          throw voiceError('invalid_argument', 'runActor must be a function.');
        }
        var text = state.draft;
        var turnId = state.turnId + 1;
        publish({ turnId: turnId, draft: '', error: null });
        return startActor('converse', text, turnId, options.runActor);
      } catch (error) {
        return rejected(error);
      }
    }

    function acceptPatientReply(reply) {
      try {
        assertActiveEncounter();
        if (
          state.phase !== 'reply_ready' ||
          !reply ||
          !pendingReply ||
          reply.encounterId !== state.encounterId ||
          reply.turnId !== state.turnId ||
          state.activePatientTurn !== reply.turnId ||
          reply.encounterId !== pendingReply.encounterId ||
          reply.turnId !== pendingReply.turnId ||
          reply.reply !== pendingReply.reply ||
          reply.ticket !== pendingReply.ticket
        ) {
          throw voiceError('invalid_state', 'The patient reply does not match the ready turn.');
        }
        var accepted = pendingReply;
        if (accepted.turnId === 0) openingAccepted = true;
        if (state.mode === 'off') {
          pendingReply = null;
          publish({ phase: 'ready', error: null, activePatientTurn: null });
          return Promise.resolve({ encounterId: accepted.encounterId, turnId: accepted.turnId, mode: 'text' });
        }
        if (state.mode === 'device') {
          try {
            startDevicePlayback(accepted);
            return Promise.resolve({ encounterId: accepted.encounterId, turnId: accepted.turnId, mode: 'device' });
          } catch (error) {
            var deviceError = failState(error, accepted.turnId);
            return rejected(deviceError);
          }
        }
        if (typeof deps.synthesize !== 'function') {
          var unavailable = voiceError('unavailable', 'Managed synthesis is unavailable.');
          failState(unavailable, accepted.turnId);
          return rejected(unavailable);
        }
        var operation = {
          kind: 'synthesis',
          encounterId: accepted.encounterId,
          turnId: accepted.turnId,
          abortController: newAbortController(),
          work: createWork(),
        };
        speechOperation = operation;
        publish({ phase: 'buffering_audio', error: null, activePatientTurn: accepted.turnId });
        Promise.resolve().then(function () {
          if (operation.work.settled) return undefined;
          return deps.synthesize({
            text: accepted.reply,
            ticket: accepted.ticket,
            signal: operation.abortController.signal,
            encounterId: accepted.encounterId,
            turnId: accepted.turnId,
          });
        }).then(
          function (result) { finishSynthesis(operation, result); },
          function (error) { failSynthesis(operation, error); },
        );
        return operation.work.promise;
      } catch (error) {
        return rejected(error);
      }
    }

    function stopPlayback() {
      if (destroyed || !playerOwner) return false;
      releasePlayer(playerOwner, true);
      pendingReply = null;
      publish({ phase: 'ready', error: null, activePatientTurn: null });
      return true;
    }

    function canReplay(turnId) {
      if (destroyed || state.phase !== 'ready' || state.mode === 'off' || state.encounterId == null) return false;
      return cache.some(function (entry) {
        return entry.turnId === turnId && entry.encounterId === state.encounterId && !entry.revoked;
      });
    }

    function replay(turnId) {
      assertActiveEncounter();
      if (!canReplay(turnId)) throw voiceError('invalid_state', 'That patient turn is not replayable now.');
      var entry = cache.filter(function (candidate) { return candidate.turnId === turnId; })[0];
      return startManagedPlayer(entry);
    }

    function resolveFallback(choice) {
      assertActiveEncounter();
      if (choice !== 'text' && choice !== 'device') {
        throw voiceError('invalid_mode', 'Fallback must be text or device.');
      }
      if (state.phase !== 'error') throw voiceError('invalid_state', 'There is no voice error to resolve.');
      cancelOwned('cancelled', 'Fallback selected.');
      if (choice === 'text') {
        pendingReply = null;
        clearCache();
        publish({
          phase: 'ready',
          mode: 'off',
          error: null,
          activePatientTurn: null,
          replayableTurnIds: [],
        });
        return true;
      }
      publish({ phase: 'ready', mode: 'device', error: null, activePatientTurn: null });
      if (pendingReply) {
        try {
          startDevicePlayback(pendingReply);
        } catch (error) {
          failState(error, pendingReply.turnId);
          return false;
        }
      }
      return true;
    }

    function cancelAll(reason) {
      if (destroyed || state.phase === 'ended') return false;
      var changed = !!(
        recorderSession || actorOperation || speechOperation || playerOwner ||
        state.phase !== 'ready' || state.error || state.activePatientTurn != null
      );
      cancelOwned('cancelled', reason || 'Voice work was cancelled.');
      pendingReply = null;
      if (state.encounterId != null) {
        publish({ phase: 'ready', error: null, activePatientTurn: null });
      }
      return changed;
    }

    function endEncounter() {
      assertAlive();
      if (state.phase === 'ended') return false;
      cancelOwned('cancelled', 'The encounter ended.');
      clearCache();
      pendingReply = null;
      publish({
        phase: 'ended',
        draft: '',
        error: null,
        activePatientTurn: null,
        replayableTurnIds: [],
      });
      return true;
    }

    function destroy() {
      if (destroyed) return false;
      cancelOwned('cancelled', 'The voice controller was destroyed.');
      clearCache();
      pendingReply = null;
      destroyed = true;
      publish({
        phase: 'ended',
        mode: 'off',
        encounterId: null,
        draft: '',
        error: null,
        activePatientTurn: null,
        replayableTurnIds: [],
      });
      listeners = [];
      return true;
    }

    return {
      getSnapshot: snapshot,
      subscribe: function (listener) {
        assertAlive();
        if (typeof listener !== 'function') throw voiceError('invalid_argument', 'listener must be a function.');
        listeners.push(listener);
        var active = true;
        return function () {
          if (!active) return false;
          active = false;
          listeners = listeners.filter(function (candidate) { return candidate !== listener; });
          return true;
        };
      },
      beginEncounter: beginEncounter,
      requestOpening: requestOpening,
      setMode: setMode,
      setDraft: setDraft,
      startListening: startListening,
      stopListening: stopListening,
      submitTurn: submitTurn,
      acceptPatientReply: acceptPatientReply,
      stopPlayback: stopPlayback,
      replay: replay,
      canReplay: canReplay,
      resolveFallback: resolveFallback,
      cancelAll: cancelAll,
      endEncounter: endEncounter,
      destroy: destroy,
    };
  }

  return {
    createController: createController,
    spokenText: spokenText,
  };
});
