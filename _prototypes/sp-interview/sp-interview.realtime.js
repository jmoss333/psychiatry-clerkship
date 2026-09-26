(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPInterviewRealtime = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Browser-side controller for the real-time (speech-to-speech) standardized-patient encounter.
  // Design: docs/superpowers/specs/2026-09-26-interview-room-realtime-voice-design.md §5, §7, §8,
  // as amended by the adversarial design review. Every browser capability is injected through
  // the adapters object so node:test drives the whole state machine with a fake peer connection,
  // a fake data channel, a fake transport and a manual clock. The proxy contract (op=start / op=turn /
  // op=end) and the provider's data-channel contract are coded here exactly. Nothing is written to
  // browser storage; the passcode is read only through getStudentKey().
  //
  // Floor-taking (the server pins interrupt_response:false): the provider never cancels the
  // patient on its own. A learner utterance that outlasts FLOOR_TAKE_MS while the patient is
  // speaking takes the floor (response.cancel → output_audio_buffer.clear → truncate); a shorter
  // one is a backchannel and its transcript is dropped. A transcript that is a backchannel token
  // or an echo of the patient's own words (speakers) is dropped too. Fragments split by VAD are
  // joined into one learner entry before op=turn; a fragment that arrives while an earlier turn
  // is in flight joins that turn's entry and the turn is re-posted once, so one thought yields one
  // response.create.

  var MAX_TEXT_CHARS = 1200;
  var REQUEST_TIMEOUT_MS = 20 * 1000;
  var CHANNEL_OPEN_TIMEOUT_MS = 20 * 1000;
  var TRUNCATE_JITTER_MS = 300;
  var CLEAR_WAIT_MS = 1500;
  var FLOOR_TAKE_MS = 600;
  var TRANSCRIPT_WAIT_MS = 8 * 1000;
  var DEADLINE_POLL_MS = 1000;
  var DATA_CHANNEL_LABEL = 'oai-events';
  var EAGERNESS_VALUES = ['low', 'medium'];
  var AUDIO_SETUP_VALUES = ['headphones', 'speakers'];
  var REQUIRED_ADAPTERS = [
    'fetch', 'getUserMedia', 'createPeerConnection', 'attachRemoteAudio', 'now', 'setTimeout', 'clearTimeout', 'randomId',
  ];
  var INTERRUPTED_MARKER = '[interrupted — delivery uncertain]';
  var NOT_HEARD_MARKER = '[not heard — playback did not start]';
  var CUT_SHORT_SUFFIX = ' [cut short]';
  var NO_REPLY_MARKER = '[no reply]';
  var REPEAT_BRIEF = '[Director] The interviewer asked you to repeat what you were just saying. Say it again in full, then stop.';
  var LOST_STATES = ['failed', 'disconnected', 'closed'];
  // Backchannel tokens after normalisation (lower-case, letters and spaces only, multi-word
  // tokens collapsed): the review's list plus its obvious transcription spellings.
  var BACKCHANNEL_WORDS = [
    'mmhm', 'mmhmm', 'mhm', 'mhmm', 'mm', 'hm', 'hmm', 'uhhuh', 'uhhum', 'okay', 'ok', 'yeah', 'yes', 'right',
    'isee', 'goon', 'sure',
  ];
  var BACKCHANNEL_PHRASES = [[/\bi see\b/g, 'isee'], [/\bgo on\b/g, 'goon']];
  var ECHO_MIN_WORDS = 3;
  var BACKCHANNEL_MAX_WORDS = 3;

  var NOTICE_COPY = {
    transcription_failed: "I didn't catch that — say it again, or type it below.",
    transcript_truncated: 'That ran past 1,200 characters; the patient heard the first 1,200.',
    reply_cut_short: "The patient's reply was cut short.",
    reply_failed: "The patient's reply failed. Say it again, or type it below.",
    turn_failed: "The patient didn't get that. Say it again, or type it below.",
    turn_cap_reached: "You've reached this encounter's turn limit.",
    session_expired: "This encounter's time is up.",
    text_invalid: 'Type something to send — up to 1,200 characters.',
    text_unavailable: 'Typing is available once the encounter is live and not paused.',
    connection_lost: 'The connection to the patient dropped. Reconnect to continue, or continue by typing.',
    provider_error: 'The patient service reported a problem.',
  };

  var SNAPSHOT_DIAGNOSTICS = [
    'droppedSends', 'ignoredLate', 'truncateErrors', 'commitErrors', 'backchannelsIgnored', 'echoIgnored',
    'fragmentsJoined', 'repeats',
  ];

  function realtimeError(code, message, cause) {
    var error = new Error(message || code);
    error.name = 'SPInterviewRealtimeError';
    error.code = code;
    if (cause !== undefined) error.cause = cause;
    return error;
  }

  function normalizeError(error, fallbackCode) {
    if (error && typeof error === 'object' && typeof error.code === 'string' && error.code) return error;
    if (error && error.name === 'AbortError') {
      return realtimeError('request_timeout', 'The request to the patient service timed out.', error);
    }
    if (error instanceof Error) {
      var normalized = realtimeError(fallbackCode, error.message || fallbackCode, error);
      if (error.status !== undefined) normalized.status = error.status;
      return normalized;
    }
    return realtimeError(fallbackCode, String(error || fallbackCode), error);
  }

  // getUserMedia rejections arrive as DOMExceptions whose code is a number and whose message is
  // the browser's. Every one of them means the same thing to a learner: no microphone for this
  // room, typing still works. An error that already carries a string code is passed through.
  var MICROPHONE_DENIED_NAMES = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'];
  function microphoneError(error) {
    if (error && typeof error === 'object' && typeof error.code === 'string' && error.code) return error;
    var name = error && typeof error.name === 'string' ? error.name : '';
    var message = MICROPHONE_DENIED_NAMES.indexOf(name) >= 0
      ? 'Microphone access was not allowed. Allow the microphone in your browser to talk, or continue by typing.'
      : 'No working microphone was found for this room. Check your audio device to talk, or continue by typing.';
    return realtimeError('microphone_unavailable', message, error);
  }

  function httpError(response, payload, fallbackCode) {
    var status = response && typeof response.status === 'number' ? response.status : 0;
    var body = payload && typeof payload === 'object' ? payload : {};
    var detail = body.error && typeof body.error === 'object' ? body.error : body;
    var code = typeof detail.code === 'string' && detail.code ? detail.code : (status ? 'http_' + status : fallbackCode);
    var message = typeof detail.message === 'string' && detail.message
      ? detail.message
      : 'The patient service could not complete the request.';
    var error = realtimeError(code, message);
    error.status = status;
    return error;
  }

  function readJson(response) {
    if (!response) return Promise.resolve(null);
    if (typeof response.text === 'function') {
      return Promise.resolve(response.text()).then(function (text) {
        if (!text) return null;
        try { return JSON.parse(text); } catch (error) { return null; }
      });
    }
    if (typeof response.json === 'function') {
      return Promise.resolve(response.json()).then(null, function () { return null; });
    }
    return Promise.resolve(null);
  }

  function isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function zeroUsage() {
    return {
      inputTokens: 0,
      outputTokens: 0,
      inputAudioTokens: 0,
      outputAudioTokens: 0,
      cachedInputTokens: 0,
      transcriptionSeconds: 0,
      transcriptionTokens: 0,
      responses: 0,
    };
  }

  function copyNumbers(source, keys) {
    var copy = {};
    keys.forEach(function (key) { copy[key] = source[key]; });
    return copy;
  }

  function safeCall(target, name) {
    if (!target || typeof target[name] !== 'function') return;
    try { target[name](); } catch (error) {}
  }

  function deferred() {
    var settled = false;
    var resolveFn;
    var rejectFn;
    var promise = new Promise(function (resolve, reject) {
      resolveFn = resolve;
      rejectFn = reject;
    });
    return {
      promise: promise,
      resolve: function (value) { if (settled) return; settled = true; resolveFn(value); },
      reject: function (error) { if (settled) return; settled = true; rejectFn(error); },
    };
  }

  function validateAdapters(input) {
    var adapters = input && typeof input === 'object' ? input : {};
    REQUIRED_ADAPTERS.forEach(function (name) {
      if (typeof adapters[name] !== 'function') {
        throw realtimeError('invalid_adapter', 'adapters.' + name + ' must be a function.');
      }
    });
    return adapters;
  }

  function requireString(payload, key, label) {
    var value = payload[key];
    if (typeof value !== 'string' || !value) {
      throw realtimeError('invalid_response', 'The ' + label + ' response is missing ' + key + '.');
    }
    return value;
  }

  function optionalString(value) {
    return typeof value === 'string' ? value : null;
  }

  function validateStart(payload) {
    if (!payload || typeof payload !== 'object') throw realtimeError('invalid_response', 'The start response is invalid.');
    return {
      sdp: requireString(payload, 'sdp', 'start'),
      receipt: requireString(payload, 'receipt', 'start'),
      brief: requireString(payload, 'brief', 'start'),
      opening: typeof payload.opening === 'string' ? payload.opening : '',
      turn: isNumber(payload.turn) ? payload.turn : 0,
      state: payload.state && typeof payload.state === 'object' ? payload.state : null,
      deadline: payload.deadline === undefined ? null : payload.deadline,
      model: optionalString(payload.model),
      voice: optionalString(payload.voice),
    };
  }

  function validateTurn(payload) {
    if (!payload || typeof payload !== 'object') throw realtimeError('invalid_response', 'The turn response is invalid.');
    return {
      receipt: requireString(payload, 'receipt', 'turn'),
      brief: requireString(payload, 'brief', 'turn'),
      turn: isNumber(payload.turn) ? payload.turn : null,
      state: payload.state && typeof payload.state === 'object' ? payload.state : null,
      deadline: payload.deadline === undefined ? null : payload.deadline,
    };
  }

  function parseDeadline(value) {
    if (isNumber(value)) return value;
    if (typeof value === 'string' && value) {
      var parsed = Date.parse(value);
      return isNumber(parsed) ? parsed : null;
    }
    return null;
  }

  function normalizeWords(text) {
    var lowered = String(text == null ? '' : text).toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return lowered;
  }

  function isBackchannelText(text) {
    var normalized = normalizeWords(text);
    if (!normalized) return false;
    BACKCHANNEL_PHRASES.forEach(function (pair) { normalized = normalized.replace(pair[0], pair[1]); });
    var words = normalized.split(' ');
    if (words.length > BACKCHANNEL_MAX_WORDS) return false;
    return words.every(function (word) { return BACKCHANNEL_WORDS.indexOf(word) >= 0; });
  }

  function isEchoOf(text, patientText) {
    var learner = normalizeWords(text);
    var patient = normalizeWords(patientText);
    if (!learner || !patient) return false;
    if (learner.split(' ').length < ECHO_MIN_WORDS) return false;
    return (' ' + patient + ' ').indexOf(' ' + learner + ' ') >= 0;
  }

  function publicEntry(entry) {
    return {
      who: entry.who,
      turnId: entry.turnId,
      itemId: entry.itemId,
      text: entry.text,
      status: entry.status,
      delivered: entry.delivered,
      repeatOf: entry.repeatOf === undefined ? null : entry.repeatOf,
    };
  }

  function exportedPatientText(entry) {
    if (entry.status === 'complete') return entry.delivered ? entry.text : NOT_HEARD_MARKER;
    if (entry.status === 'interrupted') return INTERRUPTED_MARKER;
    if (entry.status === 'incomplete') return (String(entry.text || '') + CUT_SHORT_SUFFIX).replace(/^\s+/, '');
    return NO_REPLY_MARKER;
  }

  function createSession(inputOptions) {
    var options = inputOptions || {};
    var adapters = validateAdapters(options.adapters);
    var endpoint = String(options.endpoint == null ? '' : options.endpoint).trim().replace(/[?&]+$/, '');
    if (!endpoint) throw realtimeError('invalid_argument', 'endpoint is required.');
    if (typeof options.getStudentKey !== 'function') {
      throw realtimeError('invalid_argument', 'getStudentKey must be a function.');
    }
    var caseId = String(options.caseId == null ? '' : options.caseId).trim();
    if (!caseId) throw realtimeError('invalid_argument', 'caseId is required.');
    var encounterId = String(options.encounterId == null ? '' : options.encounterId).trim();
    if (!encounterId) throw realtimeError('invalid_argument', 'encounterId is required.');
    var eagerness = options.eagerness === undefined ? 'low' : options.eagerness;
    if (EAGERNESS_VALUES.indexOf(eagerness) < 0) {
      throw realtimeError('invalid_argument', "eagerness must be 'low' or 'medium'.");
    }
    var audioSetup = options.audioSetup === undefined ? 'headphones' : options.audioSetup;
    if (AUDIO_SETUP_VALUES.indexOf(audioSetup) < 0) {
      throw realtimeError('invalid_argument', "audioSetup must be 'headphones' or 'speakers'.");
    }
    if (options.onChange !== undefined && typeof options.onChange !== 'function') {
      throw realtimeError('invalid_argument', 'onChange must be a function.');
    }

    var listeners = typeof options.onChange === 'function' ? [options.onChange] : [];
    var mode = 'idle'; // idle | connecting | live | error | ended
    var paused = false;
    var generation = 0;
    var eventCounter = 0;
    var conn = null;
    var receipt = null;
    var endPostedFor = null;
    var deadlineValue = null;
    var deadlineAt = null;
    var deadlineTimer = null;
    var timers = [];
    var transcript = [];
    var voiceItems = {};
    var itemOrder = [];
    var typedCount = 0;
    var seenTranscriptions = {};
    var voiceActive = false;
    var voiceItemId = null;
    var commitSentFor = null;
    var turnInFlight = null;
    var needsTurn = false;
    var heldBrief = null;
    var activeResponse = null;
    var audioEntry = null;
    var stopSequence = null;
    var sinkPlaying = false;
    var responsesById = {};
    var pendingTruncate = {};
    var pendingCommit = {};
    var pendingCancel = {};
    var pendingClear = {};
    var pendingCreate = {};
    var diagnostics = {
      droppedSends: 0,
      ignoredLate: 0,
      truncateErrors: 0,
      commitErrors: 0,
      backchannelsIgnored: 0,
      echoIgnored: 0,
      fragmentsJoined: 0,
      repeats: 0,
      malformedEvents: 0,
      cancelErrors: 0,
      clearErrors: 0,
      providerErrors: 0,
      supersededTurns: 0,
      duplicateTranscriptions: 0,
      blankTranscriptions: 0,
      transcriptTimeouts: 0,
      truncations: 0,
    };
    var joinedItems = [];
    var view = {
      learnerInterim: '',
      patientInterim: '',
      state: null,
      turn: 0,
      error: null,
      notice: null,
      usage: zeroUsage(),
      connection: { model: null, voice: null, playback: null },
    };

    // ------------------------------------------------------------------ snapshot

    function derivedPhase() {
      if (mode !== 'live') return mode;
      if (paused) return 'paused';
      if (audioEntry) return 'speaking';
      if (activeResponse && !activeResponse.interrupted) return 'thinking';
      if (turnInFlight && !turnInFlight.suppressed) return turnInFlight.silent ? 'connecting' : 'thinking';
      return 'listening';
    }

    function canDoneSpeaking() {
      return mode === 'live' && !paused && voiceActive && commitSentFor !== (voiceItemId || '*');
    }

    function canStopPatient() {
      if (mode !== 'live' || paused) return false;
      var phase = derivedPhase();
      return phase === 'speaking' || phase === 'thinking';
    }

    function lastPatientEntry() {
      for (var index = transcript.length - 1; index >= 0; index -= 1) {
        if (transcript[index].who === 'pt') return transcript[index];
      }
      return null;
    }

    function canRepeat() {
      if (mode !== 'live' || paused || turnInFlight || heldBrief || needsTurn || learnerBusy()) return false;
      if ((activeResponse && !activeResponse.interrupted) || audioEntry) return false;
      var last = lastPatientEntry();
      return !!last && repeatable(last);
    }

    // What "say that again" may target: a reply cut off, cut short, or finished by the model but
    // never played to the learner. A reply that played in full is not repeatable from the room —
    // the learner can ask the patient, as they would a person.
    function repeatable(entry) {
      return entry.status === 'interrupted' || entry.status === 'incomplete'
        || (entry.status === 'complete' && entry.delivered === false);
    }

    function snapshot() {
      return {
        phase: derivedPhase(),
        transcript: transcript.map(publicEntry),
        learnerInterim: view.learnerInterim,
        patientInterim: view.patientInterim,
        state: view.state,
        turn: view.turn,
        deadline: deadlineValue,
        error: view.error ? { code: view.error.code, message: view.error.message } : null,
        notice: view.notice ? { code: view.notice.code, message: view.notice.message } : null,
        usage: copyNumbers(view.usage, Object.keys(view.usage)),
        connection: { model: view.connection.model, voice: view.connection.voice, playback: view.connection.playback },
        canDoneSpeaking: canDoneSpeaking(),
        canStopPatient: canStopPatient(),
        canRepeat: canRepeat(),
        diagnostics: copyNumbers(diagnostics, SNAPSHOT_DIAGNOSTICS),
        eagerness: eagerness,
        audioSetup: audioSetup,
        encounterId: encounterId,
      };
    }

    function publish() {
      var next = snapshot();
      listeners.slice().forEach(function (listener) {
        try { listener(next); } catch (error) {}
      });
    }

    function setNotice(code, message) {
      view.notice = { code: code, message: message || NOTICE_COPY[code] || code };
    }

    // ------------------------------------------------------------------ timers

    function armTimer(fn, ms) {
      var record = { handle: null, done: false };
      record.handle = adapters.setTimeout(function () {
        if (record.done) return;
        record.done = true;
        removeTimer(record);
        fn();
      }, ms);
      timers.push(record);
      return record;
    }

    function removeTimer(record) {
      var index = timers.indexOf(record);
      if (index >= 0) timers.splice(index, 1);
    }

    function disarmTimer(record) {
      if (!record || record.done) return;
      record.done = true;
      try { adapters.clearTimeout(record.handle); } catch (error) {}
      removeTimer(record);
    }

    function clearAllTimers() {
      timers.slice().forEach(disarmTimer);
    }

    // ------------------------------------------------------------------ proxy requests

    function operationUrl(op) {
      return endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'op=' + op;
    }

    function studentKey() {
      var value = options.getStudentKey();
      return String(value == null ? '' : value);
    }

    function apiRequest(op, body, requestOptions) {
      var settings = requestOptions || {};
      var aborter = null;
      var timer = null;
      function finish() {
        if (timer) { disarmTimer(timer); timer = null; }
      }
      return Promise.resolve().then(function () {
        var url = op ? operationUrl(op) : endpoint;
        var init = {
          method: body === undefined ? 'GET' : 'POST',
          headers: { 'x-student-key': studentKey() },
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        };
        if (body !== undefined) {
          init.headers['Content-Type'] = 'application/json';
          init.body = JSON.stringify(body);
        }
        if (settings.keepalive) init.keepalive = true;
        if (!settings.keepalive && typeof AbortController === 'function') {
          aborter = new AbortController();
          init.signal = aborter.signal;
          timer = armTimer(function () {
            timer = null;
            try { aborter.abort(); } catch (error) {}
          }, REQUEST_TIMEOUT_MS);
        }
        return adapters.fetch(url, init);
      }).then(function (response) {
        return readJson(response).then(function (payload) {
          if (!response || !response.ok) throw httpError(response, payload, 'realtime_request_failed');
          if (payload === null) throw realtimeError('invalid_response', 'The patient service returned invalid JSON.');
          return payload;
        });
      }).then(function (payload) {
        finish();
        return payload;
      }, function (error) {
        finish();
        throw normalizeError(error, 'realtime_request_failed');
      });
    }

    function postEnd() {
      if (!receipt || endPostedFor === receipt) return false;
      var closing = receipt;
      endPostedFor = closing;
      receipt = null;
      apiRequest('end', { receipt: closing, caseId: caseId, encounterId: encounterId }, { keepalive: true })
        .then(null, function () {});
      return true;
    }

    // ------------------------------------------------------------------ data channel

    function send(event) {
      eventCounter += 1;
      event.event_id = 'c' + eventCounter + '-' + String(adapters.randomId());
      var channel = conn && conn.dc;
      if (!channel || conn.closed || !conn.open || channel.readyState !== 'open') {
        diagnostics.droppedSends += 1;
        return null;
      }
      try {
        channel.send(JSON.stringify(event));
      } catch (error) {
        diagnostics.droppedSends += 1;
        return null;
      }
      return event.event_id;
    }

    function sendMessageItem(role, contentType, text, itemId) {
      var item = { type: 'message', role: role, content: [{ type: contentType, text: text }] };
      if (itemId) item.id = itemId;
      return send({ type: 'conversation.item.create', item: item });
    }

    // ------------------------------------------------------------------ deadline (R14)

    function setDeadline(value) {
      if (value === undefined) return;
      deadlineValue = value;
      deadlineAt = parseDeadline(value);
    }

    function checkDeadline() {
      if (mode === 'ended' || deadlineAt == null) return false;
      if (adapters.now() >= deadlineAt) {
        endSession('session_expired');
        return true;
      }
      return false;
    }

    function armDeadlineTimer() {
      disarmTimer(deadlineTimer);
      deadlineTimer = null;
      if (mode !== 'live' || deadlineAt == null) return;
      deadlineTimer = armTimer(function () {
        deadlineTimer = null;
        if (!checkDeadline()) armDeadlineTimer();
      }, DEADLINE_POLL_MS);
    }

    // ------------------------------------------------------------------ learner items and order

    function itemRecord(itemId) {
      var id = String(itemId == null ? '' : itemId) || '*';
      if (!voiceItems[id]) {
        voiceItems[id] = {
          id: id,
          startedAt: null,
          stoppedAt: null,
          duringPatient: false,
          patientEntry: null,
          backchannel: false,
          floorTimer: null,
          awaitTimer: null,
          transcript: null,
          transcribed: false,
          dropped: false,
          consumed: false,
        };
        itemOrder.push(id);
      }
      return voiceItems[id];
    }

    function orderIndex(itemId) {
      var index = itemOrder.indexOf(itemId);
      return index < 0 ? itemOrder.length : index;
    }

    function placeAfter(itemId, previousItemId) {
      itemRecord(itemId);
      if (typeof previousItemId !== 'string' || !voiceItems[previousItemId] || previousItemId === itemId) return;
      var current = itemOrder.indexOf(itemId);
      var previous = itemOrder.indexOf(previousItemId);
      if (current === previous + 1) return;
      itemOrder.splice(current, 1);
      previous = itemOrder.indexOf(previousItemId);
      itemOrder.splice(previous + 1, 0, itemId);
    }

    function recordPending(record) {
      return !!record && !record.consumed && !record.dropped && !record.transcribed;
    }

    function learnerBusy() {
      if (voiceActive) return true;
      return itemOrder.some(function (id) {
        var record = voiceItems[id];
        return !!record && !record.consumed && !record.dropped;
      });
    }

    function clearItemTimers() {
      itemOrder.forEach(function (id) {
        var record = voiceItems[id];
        if (!record) return;
        disarmTimer(record.floorTimer);
        record.floorTimer = null;
        disarmTimer(record.awaitTimer);
        record.awaitTimer = null;
      });
    }

    function dropOpenRecords() {
      itemOrder.forEach(function (id) {
        var record = voiceItems[id];
        if (record && !record.consumed) record.dropped = true;
      });
    }

    function armAwaitTimer(record) {
      disarmTimer(record.awaitTimer);
      record.awaitTimer = armTimer(function () {
        record.awaitTimer = null;
        if (record.transcribed || record.consumed || record.dropped) return;
        record.dropped = true;
        record.timedOut = true;
        diagnostics.transcriptTimeouts += 1;
        settleFragments();
        publish();
      }, TRANSCRIPT_WAIT_MS);
    }

    function learnerEntries() {
      return transcript.filter(function (entry) { return entry.who === 'me'; });
    }

    function orderedLearnerEntries() {
      return learnerEntries().map(function (entry, index) {
        return { entry: entry, index: index, order: orderIndex(entry.itemId) };
      }).sort(function (a, b) {
        return a.order - b.order || a.index - b.index;
      }).map(function (wrapped) { return wrapped.entry; });
    }

    function postedItems() {
      return orderedLearnerEntries().map(function (entry) { return { itemId: entry.itemId, text: entry.text }; });
    }

    function openEntries() {
      return learnerEntries().filter(function (entry) { return entry.open; });
    }

    function renumber() {
      var count = 0;
      transcript.forEach(function (entry) {
        if (entry.who === 'me') {
          count += 1;
          entry.turnId = count;
        } else if (entry.answers && entry.answers.length) {
          entry.turnId = entry.answers[entry.answers.length - 1].turnId;
        } else if (entry.original) {
          entry.turnId = entry.original.turnId;
        } else {
          entry.turnId = count;
        }
        if (entry.who === 'pt' && entry.original) entry.repeatOf = entry.original.turnId;
      });
    }

    function insertLearnerEntry(entry) {
      var order = orderIndex(entry.itemId);
      var at = transcript.length;
      for (var index = 0; index < transcript.length; index += 1) {
        var candidate = transcript[index];
        if (candidate.who === 'me' && orderIndex(candidate.itemId) > order) {
          at = index;
          break;
        }
      }
      transcript.splice(at, 0, entry);
      renumber();
      return entry;
    }

    function clampText(text) {
      if (text.length <= MAX_TEXT_CHARS) return text;
      setNotice('transcript_truncated');
      return text.slice(0, MAX_TEXT_CHARS);
    }

    function newLearnerEntry(itemId, text, status) {
      return insertLearnerEntry({
        who: 'me',
        turnId: 0,
        itemId: itemId,
        text: text,
        status: status,
        delivered: true,
        repeatOf: null,
        open: true,
        joinedFrom: [itemId],
      });
    }

    function joinableEntry() {
      var entries = learnerEntries();
      var last = entries.length ? entries[entries.length - 1] : null;
      if (!last || !last.open) return null;
      var awaitingReply = needsTurn || heldBrief || (turnInFlight && !turnInFlight.silent && !turnInFlight.suppressed);
      return awaitingReply ? last : null;
    }

    function settleFragments() {
      var ready = [];
      var newestReady = -1;
      var newestConsumed = -1;
      itemOrder.forEach(function (id, index) {
        var record = voiceItems[id];
        if (!record) return;
        if (record.consumed) newestConsumed = index;
        if (record.transcript !== null && !record.consumed && !record.dropped) {
          ready.push(record);
          newestReady = index;
        }
      });
      if (!ready.length) {
        afterLearnerSilence();
        return;
      }
      for (var index = newestReady + 1; index < itemOrder.length; index += 1) {
        if (recordPending(voiceItems[itemOrder[index]])) return; // a newer utterance is still coming
      }
      var texts = ready.map(function (record) { return record.transcript; });
      var ids = ready.map(function (record) { return record.id; });
      ready.forEach(function (record) { record.consumed = true; });
      var joinedText = texts.join(' ');
      var late = newestReady < newestConsumed;
      var target = late ? null : joinableEntry();
      if (target) {
        target.text = clampText(target.text + ' ' + joinedText);
        target.joinedFrom = target.joinedFrom.concat(ids);
        diagnostics.fragmentsJoined += ids.length;
        joinedItems.push({ itemId: target.itemId, from: target.joinedFrom.slice() });
        needsTurn = true;
        postTurn();
        return;
      }
      var entry = newLearnerEntry(ids[0], clampText(joinedText), 'final');
      if (ids.length > 1) {
        entry.joinedFrom = ids.slice();
        diagnostics.fragmentsJoined += ids.length - 1;
        joinedItems.push({ itemId: entry.itemId, from: ids.slice() });
      }
      if (late && !openEntries().some(function (open) { return open !== entry; })) {
        // Nothing is awaiting a reply: the late item rides the next op=turn in corrected order.
        return;
      }
      needsTurn = true;
      postTurn();
    }

    function afterLearnerSilence() {
      if (mode !== 'live' || paused || learnerBusy()) return;
      if (needsTurn) {
        postTurn();
        return;
      }
      if (heldBrief && !turnInFlight && !activeResponse) {
        var held = heldBrief;
        heldBrief = null;
        speakBrief(held.brief, held.answers);
      }
    }

    // ------------------------------------------------------------------ patient entries

    function newPatientEntry(answers, original) {
      var entry = {
        who: 'pt',
        turnId: 0,
        itemId: null,
        text: '',
        status: 'pending',
        delivered: null,
        repeatOf: null,
        answers: answers || [],
        original: original || null,
        responseId: null,
        outputStarted: false,
        outputStartedAt: 0,
        stoppedSeen: false,
        doneStatus: null,
        truncated: false,
        heard: false,
      };
      entry.answers.forEach(function (learner) { learner.open = false; });
      transcript.push(entry);
      renumber();
      return entry;
    }

    function finalizePatient(entry, status) {
      if (entry.status !== 'pending') return false;
      entry.status = status;
      if (status === 'complete') entry.delivered = !!entry.heard;
      else if (status === 'interrupted') entry.delivered = null;
      else entry.delivered = false;
      if (status !== 'incomplete' && audioEntry === entry) audioEntry = null;
      if (activeResponse && activeResponse.entry === entry && status !== 'complete') activeResponse.interrupted = true;
      view.patientInterim = '';
      return true;
    }

    function finalizePendingReplies() {
      transcript.forEach(function (entry) {
        if (entry.who !== 'pt' || entry.status !== 'pending') return;
        finalizePatient(entry, entry.outputStarted ? 'interrupted' : 'failed');
      });
    }

    function entryByItemId(itemId) {
      if (!itemId) return null;
      for (var index = transcript.length - 1; index >= 0; index -= 1) {
        if (transcript[index].who === 'pt' && transcript[index].itemId === itemId) return transcript[index];
      }
      return null;
    }

    function entryForResponse(responseId) {
      if (responseId && responsesById[responseId]) return responsesById[responseId];
      if (activeResponse && (!activeResponse.id || activeResponse.id === responseId)) return activeResponse.entry;
      return null;
    }

    function lastPatientSummary() {
      for (var index = transcript.length - 1; index >= 0; index -= 1) {
        var entry = transcript[index];
        if (entry.who === 'pt' && entry.status !== 'pending') {
          return { itemId: entry.itemId || null, status: entry.status };
        }
      }
      return { itemId: null, status: 'none' };
    }

    function openingHeard() {
      return transcript.some(function (entry) {
        return entry.who === 'pt' && !entry.original && entry.answers.length === 0
          && (entry.status === 'complete' || entry.status === 'interrupted' || entry.status === 'incomplete');
      });
    }

    function forgetPendingCreate(entry) {
      Object.keys(pendingCreate).forEach(function (key) {
        if (pendingCreate[key] === entry) delete pendingCreate[key];
      });
    }

    function truncateEntry(entry) {
      if (!entry || !entry.outputStarted || !entry.itemId || entry.truncated) return false;
      var elapsed = adapters.now() - entry.outputStartedAt;
      var audioEndMs = Math.max(0, Math.floor(elapsed - TRUNCATE_JITTER_MS));
      entry.truncated = true;
      var id = send({
        type: 'conversation.item.truncate',
        item_id: entry.itemId,
        content_index: 0,
        audio_end_ms: audioEndMs,
      });
      if (id) pendingTruncate[id] = true;
      return !!id;
    }

    function clearStopSequence() {
      if (!stopSequence) return;
      disarmTimer(stopSequence.timer);
      stopSequence = null;
    }

    // ------------------------------------------------------------------ patient reply lifecycle

    function speakBrief(brief, answers) {
      var entry = newPatientEntry(answers, null);
      sendMessageItem('system', 'input_text', brief);
      // The response is expected before the create is sent: a channel that delivered events
      // re-entrantly would otherwise read response.created as unsolicited.
      activeResponse = { entry: entry, id: null, interrupted: false };
      var createId = send({ type: 'response.create' });
      if (createId) pendingCreate[createId] = entry;
      view.patientInterim = '';
      return entry;
    }

    // response.cancel → output_audio_buffer.clear → (cleared | CLEAR_WAIT_MS) conversation.item.truncate
    function stopPatientAudio() {
      var target = null;
      if (activeResponse && !activeResponse.interrupted) {
        target = activeResponse.entry;
        activeResponse.interrupted = true;
        var cancelId = send({ type: 'response.cancel' });
        if (cancelId) pendingCancel[cancelId] = true;
      } else if (audioEntry) {
        target = audioEntry;
      }
      if (!target) return false;
      var clearId = send({ type: 'output_audio_buffer.clear' });
      if (clearId) pendingClear[clearId] = true;
      finalizePatient(target, 'interrupted');
      audioEntry = null;
      if (target.outputStarted && !target.stoppedSeen && !target.truncated) {
        clearStopSequence();
        stopSequence = {
          entry: target,
          timer: armTimer(function () {
            stopSequence = null;
            truncateEntry(target);
            publish();
          }, CLEAR_WAIT_MS),
        };
      }
      return true;
    }

    function stopPatientInternal() {
      var did = stopPatientAudio();
      if (turnInFlight && !turnInFlight.silent && !turnInFlight.suppressed) {
        turnInFlight.suppressed = true;
        did = true;
      }
      if (heldBrief) {
        heldBrief = null;
        did = true;
      }
      return did;
    }

    function takeFloor(record) {
      record.floorTimer = null;
      if (record.stoppedAt !== null || mode !== 'live') return;
      record.tookFloor = true;
      stopPatientAudio();
    }

    // ------------------------------------------------------------------ op=turn

    function postTurn(turnOptions) {
      var settings = turnOptions || {};
      if (mode !== 'live' || turnInFlight || !needsTurn) return false;
      if (!settings.force && learnerBusy()) return false;
      if ((activeResponse && !activeResponse.interrupted) || audioEntry) stopPatientAudio();
      needsTurn = false;
      heldBrief = null;
      var token = {
        gen: generation,
        covers: openEntries(),
        silent: !!settings.silent,
        suppressed: false,
      };
      turnInFlight = token;
      apiRequest('turn', {
        receipt: receipt,
        caseId: caseId,
        encounterId: encounterId,
        items: postedItems(),
        lastPatient: lastPatientSummary(),
      }).then(function (payload) {
        onTurnSuccess(token, payload);
      }, function (error) {
        onTurnFailure(token, error);
      });
      return true;
    }

    function turnIsCurrent(token) {
      return turnInFlight === token && token.gen === generation && mode === 'live';
    }

    function onTurnSuccess(token, payload) {
      if (!turnIsCurrent(token)) {
        diagnostics.ignoredLate += 1;
        return;
      }
      turnInFlight = null;
      var turn;
      try {
        turn = validateTurn(payload);
      } catch (error) {
        failTurn(token, error);
        publish();
        return;
      }
      receipt = turn.receipt;
      setDeadline(turn.deadline);
      if (turn.turn !== null) view.turn = turn.turn;
      if (turn.state) view.state = turn.state;
      if (checkDeadline()) return;
      var answers = openEntries();
      if (token.suppressed) {
        if (needsTurn) postTurn();
      } else if (token.silent) {
        sendMessageItem('system', 'input_text', turn.brief);
        if (needsTurn) postTurn();
      } else if (needsTurn) {
        diagnostics.supersededTurns += 1;
        postTurn();
      } else if (learnerBusy()) {
        heldBrief = { brief: turn.brief, answers: answers };
      } else {
        speakBrief(turn.brief, answers);
      }
      armDeadlineTimer();
      publish();
    }

    function onTurnFailure(token, error) {
      if (!turnIsCurrent(token)) {
        diagnostics.ignoredLate += 1;
        return;
      }
      turnInFlight = null;
      failTurn(token, error);
      publish();
    }

    function failTurn(token, error) {
      var failure = normalizeError(error, 'turn_failed');
      if (failure.code === 'turn_cap_reached') {
        endSession('turn_cap_reached');
        return;
      }
      if (failure.code === 'realtime_session_expired' || failure.status === 410) {
        endSession('session_expired');
        return;
      }
      if (!token.silent) {
        token.covers.forEach(function (entry) {
          entry.status = 'unanswered';
          entry.delivered = false;
          entry.open = false;
        });
      }
      heldBrief = null;
      setNotice(failure.code || 'turn_failed', failure.message || NOTICE_COPY.turn_failed);
      if (needsTurn) postTurn();
    }

    // ------------------------------------------------------------------ connection lifecycle

    function teardownConnection() {
      var local = conn;
      if (!local) return;
      conn = null;
      local.closed = true;
      disarmTimer(local.openTimer);
      local.openTimer = null;
      local.tracks.forEach(function (track) { safeCall(track, 'stop'); });
      if (local.stream && typeof local.stream.getTracks === 'function') {
        try {
          local.stream.getTracks().forEach(function (track) { safeCall(track, 'stop'); });
        } catch (error) {}
      }
      if (local.dc) safeCall(local.dc, 'close');
      if (local.pc) safeCall(local.pc, 'close');
      if (local.sink) safeCall(local.sink, 'stop');
    }

    function resetLiveState() {
      clearStopSequence();
      clearItemTimers();
      dropOpenRecords();
      voiceActive = false;
      voiceItemId = null;
      commitSentFor = null;
      turnInFlight = null;
      needsTurn = false;
      heldBrief = null;
      activeResponse = null;
      audioEntry = null;
      sinkPlaying = false;
      view.connection.playback = null;
      view.learnerInterim = '';
      view.patientInterim = '';
    }

    function audioTracks(stream) {
      if (!stream) return [];
      var tracks = [];
      try {
        if (typeof stream.getAudioTracks === 'function') tracks = stream.getAudioTracks();
        else if (typeof stream.getTracks === 'function') tracks = stream.getTracks();
      } catch (error) {
        tracks = [];
      }
      return Array.isArray(tracks) ? tracks.slice() : [];
    }

    function stopStream(stream) {
      audioTracks(stream).forEach(function (track) { safeCall(track, 'stop'); });
    }

    function onSinkState(name) {
      var label = typeof name === 'string' ? name : null;
      view.connection.playback = label;
      sinkPlaying = label === 'playing';
      if (sinkPlaying && audioEntry) audioEntry.heard = true;
      publish();
    }

    function connect(kind) {
      generation += 1;
      var gen = generation;
      teardownConnection();
      resetLiveState();
      mode = 'connecting';
      paused = false;
      view.error = null;
      view.notice = null;
      var local = {
        gen: gen,
        kind: kind,
        pc: null,
        dc: null,
        stream: null,
        tracks: [],
        sink: null,
        open: false,
        closed: false,
        openTimer: null,
        brief: null,
        opening: null,
        session: null,
        deferred: deferred(),
      };
      conn = local;
      publish();

      function stale() {
        return gen !== generation || conn !== local || local.closed;
      }

      function superseded() {
        return realtimeError('superseded', 'The connection attempt was superseded.');
      }

      Promise.resolve().then(function () {
        return Promise.resolve(adapters.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })).then(null, function (error) { throw microphoneError(error); });
      }).then(function (stream) {
        if (stale()) {
          stopStream(stream);
          throw superseded();
        }
        local.stream = stream;
        local.tracks = audioTracks(stream);
        if (!local.tracks.length) throw realtimeError('microphone_unavailable', 'No microphone track was provided.');
        var pc = adapters.createPeerConnection();
        local.pc = pc;
        local.tracks.forEach(function (track) { pc.addTrack(track, stream); });
        var dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
        local.dc = dc;
        pc.ontrack = function (event) {
          if (stale()) return;
          var remote = event && event.streams && event.streams[0];
          if (!remote) return;
          if (local.sink) safeCall(local.sink, 'stop');
          var sink = adapters.attachRemoteAudio(remote);
          local.sink = sink || null;
          if (sink && typeof sink.onState === 'function') {
            try {
              sink.onState(function (name) {
                if (stale()) return;
                onSinkState(name);
              });
            } catch (error) {}
          }
        };
        pc.onconnectionstatechange = function () {
          if (stale()) return;
          if (LOST_STATES.indexOf(pc.connectionState) >= 0) connectionLost(local);
        };
        dc.onopen = function () {
          if (stale()) return;
          channelOpened(local);
        };
        dc.onmessage = function (event) {
          if (stale()) {
            diagnostics.ignoredLate += 1;
            return;
          }
          var parsed;
          try {
            parsed = JSON.parse(event && event.data);
          } catch (error) {
            diagnostics.malformedEvents += 1;
            return;
          }
          handleEvent(local, parsed);
        };
        dc.onclose = function () {
          if (stale()) return;
          connectionLost(local);
        };
        return Promise.resolve(pc.createOffer()).then(function (offer) {
          return Promise.resolve(pc.setLocalDescription(offer)).then(function () { return offer; });
        });
      }).then(function (offer) {
        if (stale()) throw superseded();
        var description = local.pc.localDescription;
        var sdp = (description && description.sdp) || (offer && offer.sdp);
        if (typeof sdp !== 'string' || !sdp) throw realtimeError('sdp_unavailable', 'The local SDP offer is unavailable.');
        return apiRequest('start', {
          caseId: caseId,
          encounterId: encounterId,
          sdp: sdp,
          eagerness: eagerness,
          audioSetup: audioSetup,
        });
      }).then(function (payload) {
        if (stale()) throw superseded();
        var start = validateStart(payload);
        receipt = start.receipt;
        setDeadline(start.deadline);
        view.turn = start.turn;
        view.state = start.state;
        view.connection.model = start.model;
        view.connection.voice = start.voice;
        local.brief = start.brief;
        local.opening = start.opening;
        publish();
        return local.pc.setRemoteDescription({ type: 'answer', sdp: start.sdp });
      }).then(function () {
        if (stale()) throw superseded();
        if (local.open) return;
        local.openTimer = armTimer(function () {
          local.openTimer = null;
          if (stale() || local.open) return;
          failConnection(local, realtimeError('connection_timeout', 'The patient connection did not open in time.'));
        }, CHANNEL_OPEN_TIMEOUT_MS);
      }).then(null, function (error) {
        if (stale()) {
          local.deferred.reject(normalizeError(error, 'superseded'));
          return;
        }
        failConnection(local, normalizeError(error, 'connection_failed'));
      });

      return local.deferred.promise;
    }

    function failConnection(local, error) {
      if (local.gen !== generation || conn !== local) return;
      generation += 1;
      teardownConnection();
      resetLiveState();
      postEnd();
      mode = 'error';
      view.error = { code: error.code || 'connection_failed', message: error.message || 'The connection failed.' };
      publish();
      local.deferred.reject(error);
    }

    function connectionLost(local) {
      if (local.gen !== generation || conn !== local || mode === 'ended') return;
      generation += 1;
      finalizePendingReplies();
      teardownConnection();
      resetLiveState();
      disarmTimer(deadlineTimer);
      deadlineTimer = null;
      postEnd();
      mode = 'error';
      view.error = { code: 'connection_lost', message: NOTICE_COPY.connection_lost };
      publish();
      local.deferred.reject(realtimeError('connection_lost', NOTICE_COPY.connection_lost));
    }

    function replayTranscript() {
      var ordered = orderedLearnerEntries();
      var emitted = {};
      transcript.forEach(function (entry) {
        if (entry.who === 'me') {
          // Learner text is replayed in item order, once, at the position of the first entry.
          if (emitted.me) return;
          emitted.me = true;
          ordered.forEach(function (learner) {
            var beforeReply = transcript.indexOf(learner) < transcript.indexOf(entry) || learner === entry;
            if (!emitted[learner.itemId] && beforeReply) {
              emitted[learner.itemId] = true;
              sendMessageItem('user', 'input_text', learner.text);
            }
          });
          return;
        }
        if (entry.status === 'complete' && entry.text) {
          ordered.forEach(function (learner) {
            if (!emitted[learner.itemId] && transcript.indexOf(learner) < transcript.indexOf(entry)) {
              emitted[learner.itemId] = true;
              sendMessageItem('user', 'input_text', learner.text);
            }
          });
          sendMessageItem('assistant', 'output_text', entry.text);
        }
      });
      ordered.forEach(function (learner) {
        if (!emitted[learner.itemId]) {
          emitted[learner.itemId] = true;
          sendMessageItem('user', 'input_text', learner.text);
        }
      });
    }

    function channelOpened(local) {
      local.open = true;
      disarmTimer(local.openTimer);
      local.openTimer = null;
      mode = 'live';
      if (local.kind === 'reconnect') {
        replayTranscript();
        if (learnerEntries().length > 0) {
          needsTurn = true;
          postTurn({ silent: true, force: true });
        } else if (!openingHeard()) {
          speakBrief(local.brief, []);
        }
      } else {
        speakBrief(local.brief, []);
      }
      armDeadlineTimer();
      publish();
      local.deferred.resolve(snapshot());
    }

    function endSession(noticeCode) {
      if (mode === 'ended') return false;
      generation += 1;
      finalizePendingReplies();
      teardownConnection();
      resetLiveState();
      paused = false;
      postEnd();
      clearAllTimers();
      deadlineTimer = null;
      mode = 'ended';
      if (noticeCode) setNotice(noticeCode);
      publish();
      return true;
    }

    // ------------------------------------------------------------------ provider events

    function handleEvent(local, msg) {
      if (local.gen !== generation || conn !== local || mode !== 'live') {
        diagnostics.ignoredLate += 1;
        return;
      }
      if (checkDeadline()) return;
      var type = msg && typeof msg.type === 'string' ? msg.type : '';
      switch (type) {
        case 'session.created':
        case 'session.updated':
          local.session = msg.session || null;
          break;
        case 'input_audio_buffer.speech_started':
          onSpeechStarted(msg);
          break;
        case 'input_audio_buffer.speech_stopped':
          onSpeechStopped(msg);
          break;
        case 'input_audio_buffer.committed':
          onCommitted(msg);
          break;
        case 'conversation.item.input_audio_transcription.delta':
          view.learnerInterim += String(msg.delta == null ? '' : msg.delta);
          break;
        case 'conversation.item.input_audio_transcription.completed':
          onTranscriptionCompleted(msg);
          break;
        case 'conversation.item.input_audio_transcription.failed':
          onTranscriptionFailed(msg);
          break;
        case 'conversation.item.added':
        case 'conversation.item.done':
          onItemEvent(msg);
          break;
        case 'response.created':
          onResponseCreated(msg);
          break;
        case 'response.output_item.added':
          onOutputItemAdded(msg);
          break;
        case 'response.output_audio_transcript.delta':
          onPatientTranscriptDelta(msg);
          break;
        case 'response.output_audio_transcript.done':
          onPatientTranscriptDone(msg);
          break;
        case 'output_audio_buffer.started':
          onOutputStarted(msg);
          break;
        case 'output_audio_buffer.stopped':
          onOutputStopped(msg);
          break;
        case 'output_audio_buffer.cleared':
          onOutputCleared(msg);
          break;
        case 'response.done':
          onResponseDone(msg);
          break;
        case 'conversation.item.truncated':
          diagnostics.truncations += 1;
          break;
        case 'error':
          onProviderError(msg);
          break;
        case 'rate_limits.updated':
        default:
          break;
      }
      if (mode !== 'ended') publish();
    }

    function onSpeechStarted(msg) {
      voiceActive = true;
      voiceItemId = typeof msg.item_id === 'string' ? msg.item_id : null;
      commitSentFor = null;
      view.learnerInterim = '';
      var record = itemRecord(voiceItemId);
      record.startedAt = adapters.now();
      record.duringPatient = !!audioEntry;
      record.patientEntry = audioEntry || null;
      var responseLive = (activeResponse && !activeResponse.interrupted) || audioEntry;
      if (responseLive) {
        disarmTimer(record.floorTimer);
        record.floorTimer = armTimer(function () {
          takeFloor(record);
          publish();
        }, FLOOR_TAKE_MS);
      }
    }

    function onSpeechStopped(msg) {
      voiceActive = false;
      var record = itemRecord(typeof msg.item_id === 'string' ? msg.item_id : voiceItemId);
      record.stoppedAt = adapters.now();
      if (record.floorTimer) {
        disarmTimer(record.floorTimer);
        record.floorTimer = null;
        if (record.duringPatient) record.backchannel = true;
      }
      if (!record.transcribed) armAwaitTimer(record);
    }

    function onCommitted(msg) {
      voiceActive = false;
      commitSentFor = null;
      var itemId = typeof msg.item_id === 'string' ? msg.item_id : voiceItemId;
      var record = itemRecord(itemId);
      placeAfter(record.id, msg.previous_item_id);
      if (record.floorTimer) {
        disarmTimer(record.floorTimer);
        record.floorTimer = null;
        if (record.duringPatient) record.backchannel = true;
      }
      if (record.stoppedAt === null) record.stoppedAt = adapters.now();
      if (!record.transcribed) armAwaitTimer(record);
    }

    function addTranscriptionUsage(usage) {
      if (!usage || typeof usage !== 'object') return;
      if (usage.type === 'duration') {
        if (isNumber(usage.seconds)) view.usage.transcriptionSeconds += usage.seconds;
        return;
      }
      if (isNumber(usage.total_tokens)) {
        view.usage.transcriptionTokens += usage.total_tokens;
      } else {
        if (isNumber(usage.input_tokens)) view.usage.transcriptionTokens += usage.input_tokens;
        if (isNumber(usage.output_tokens)) view.usage.transcriptionTokens += usage.output_tokens;
      }
    }

    function addResponseUsage(usage) {
      view.usage.responses += 1;
      if (!usage || typeof usage !== 'object') return;
      if (isNumber(usage.input_tokens)) view.usage.inputTokens += usage.input_tokens;
      if (isNumber(usage.output_tokens)) view.usage.outputTokens += usage.output_tokens;
      var inputDetails = usage.input_token_details && typeof usage.input_token_details === 'object'
        ? usage.input_token_details : {};
      var outputDetails = usage.output_token_details && typeof usage.output_token_details === 'object'
        ? usage.output_token_details : {};
      if (isNumber(inputDetails.audio_tokens)) view.usage.inputAudioTokens += inputDetails.audio_tokens;
      if (isNumber(inputDetails.cached_tokens)) view.usage.cachedInputTokens += inputDetails.cached_tokens;
      if (isNumber(outputDetails.audio_tokens)) view.usage.outputAudioTokens += outputDetails.audio_tokens;
    }

    function patientTextFor(record) {
      if (record.patientEntry && record.patientEntry.text) return record.patientEntry.text;
      for (var index = transcript.length - 1; index >= 0; index -= 1) {
        if (transcript[index].who === 'pt' && transcript[index].text) return transcript[index].text;
      }
      return '';
    }

    function onTranscriptionCompleted(msg) {
      addTranscriptionUsage(msg.usage);
      var itemId = String(msg.item_id == null ? '' : msg.item_id) || '*';
      if (seenTranscriptions[itemId]) {
        diagnostics.duplicateTranscriptions += 1;
        return;
      }
      seenTranscriptions[itemId] = true;
      var record = itemRecord(itemId);
      record.transcribed = true;
      if (record.timedOut) {
        // The item was given up on; its transcript still slots into place (item order, not arrival order).
        record.timedOut = false;
        record.dropped = false;
      }
      disarmTimer(record.awaitTimer);
      record.awaitTimer = null;
      if (record.floorTimer) {
        disarmTimer(record.floorTimer);
        record.floorTimer = null;
      }
      view.learnerInterim = '';
      var text = String(msg.transcript == null ? '' : msg.transcript).trim();
      if (!text) {
        diagnostics.blankTranscriptions += 1;
        record.dropped = true;
      } else if (record.backchannel) {
        diagnostics.backchannelsIgnored += 1;
        record.dropped = true;
      } else if (record.duringPatient && isBackchannelText(text)) {
        diagnostics.echoIgnored += 1;
        record.dropped = true;
      } else if (record.duringPatient && isEchoOf(text, patientTextFor(record))) {
        diagnostics.echoIgnored += 1;
        record.dropped = true;
      } else {
        record.transcript = text;
      }
      settleFragments();
    }

    function onTranscriptionFailed(msg) {
      var record = itemRecord(typeof msg.item_id === 'string' ? msg.item_id : voiceItemId);
      record.transcribed = true;
      record.dropped = true;
      disarmTimer(record.awaitTimer);
      record.awaitTimer = null;
      if (record.floorTimer) {
        disarmTimer(record.floorTimer);
        record.floorTimer = null;
      }
      view.learnerInterim = '';
      if (!record.backchannel) setNotice('transcription_failed');
      settleFragments();
    }

    function onItemEvent(msg) {
      var item = msg.item;
      if (!item || typeof item.id !== 'string' || !item.id) return;
      if (item.role === 'user') {
        if (voiceItems[item.id] || item.id.indexOf('typed-') === 0) placeAfter(item.id, msg.previous_item_id);
        return;
      }
      if (item.role !== 'assistant') return;
      var entry = entryByItemId(item.id);
      if (!entry && activeResponse && !activeResponse.entry.itemId) {
        entry = activeResponse.entry;
        entry.itemId = item.id;
      }
      if (!entry) return;
      if (msg.type === 'conversation.item.done' && !entry.text && Array.isArray(item.content)) {
        item.content.forEach(function (part) {
          if (!entry.text && part && typeof part.transcript === 'string') entry.text = part.transcript;
          if (!entry.text && part && typeof part.text === 'string') entry.text = part.text;
        });
      }
    }

    function onResponseCreated(msg) {
      var response = msg.response && typeof msg.response === 'object' ? msg.response : {};
      var id = typeof response.id === 'string' ? response.id : null;
      var entry;
      if (activeResponse && activeResponse.id === null) {
        entry = activeResponse.entry;
        activeResponse.id = id;
        forgetPendingCreate(entry);
      } else {
        // An unsolicited response (the server pins create_response:false, so this is defensive):
        // track it so its audio can still be interrupted, cancelled and accounted for.
        entry = newPatientEntry([], null);
        activeResponse = { entry: entry, id: id, interrupted: false };
      }
      entry.responseId = id;
      if (id) responsesById[id] = entry;
    }

    function onOutputItemAdded(msg) {
      var entry = entryForResponse(msg.response_id);
      var item = msg.item;
      if (!entry || !item || item.role !== 'assistant' || typeof item.id !== 'string' || !item.id) return;
      if (!entry.itemId) entry.itemId = item.id;
    }

    function onPatientTranscriptDelta(msg) {
      var entry = entryForResponse(msg.response_id) || entryByItemId(msg.item_id);
      if (!entry) return;
      if (!entry.itemId && typeof msg.item_id === 'string') entry.itemId = msg.item_id;
      entry.text += String(msg.delta == null ? '' : msg.delta);
      if (entry.status === 'pending') view.patientInterim = entry.text;
    }

    function onPatientTranscriptDone(msg) {
      var entry = entryForResponse(msg.response_id) || entryByItemId(msg.item_id);
      if (!entry) return;
      if (!entry.itemId && typeof msg.item_id === 'string') entry.itemId = msg.item_id;
      if (typeof msg.transcript === 'string') entry.text = msg.transcript;
      if (entry.status === 'pending') view.patientInterim = entry.text;
    }

    function onOutputStarted(msg) {
      var entry = entryForResponse(msg.response_id);
      if (!entry) return;
      entry.outputStarted = true;
      entry.outputStartedAt = adapters.now();
      entry.stoppedSeen = false;
      if (sinkPlaying) entry.heard = true;
      if (entry.status === 'pending') audioEntry = entry;
    }

    function onOutputStopped(msg) {
      var entry = entryForResponse(msg.response_id) || audioEntry;
      if (!entry) return;
      entry.stoppedSeen = true;
      if (audioEntry === entry) audioEntry = null;
      if (entry.status === 'pending' && entry.doneStatus === 'completed') finalizePatient(entry, 'complete');
    }

    function onOutputCleared(msg) {
      var entry = entryForResponse(msg.response_id) || audioEntry;
      if (entry && entry.status === 'pending' && entry.doneStatus === 'completed') {
        // The audio of a finished reply was cut off while draining: delivery is uncertain.
        finalizePatient(entry, 'interrupted');
      }
      if (!entry || audioEntry === entry) audioEntry = null;
      if (stopSequence && (!entry || stopSequence.entry === entry)) {
        var target = stopSequence.entry;
        clearStopSequence();
        truncateEntry(target);
      }
    }

    function onResponseDone(msg) {
      var response = msg.response && typeof msg.response === 'object' ? msg.response : {};
      addResponseUsage(response.usage);
      var id = typeof response.id === 'string' ? response.id : null;
      var entry = entryForResponse(id);
      if (entry && id && !entry.responseId) {
        entry.responseId = id;
        responsesById[id] = entry;
      }
      if (activeResponse && (!entry || activeResponse.entry === entry)) activeResponse = null;
      if (!entry) return;
      forgetPendingCreate(entry);
      var status = typeof response.status === 'string' ? response.status : '';
      entry.doneStatus = status;
      if (status === 'completed') {
        if (entry.status === 'pending' && (!entry.outputStarted || entry.stoppedSeen)) finalizePatient(entry, 'complete');
      } else if (status === 'cancelled') {
        finalizePatient(entry, 'interrupted');
        if (audioEntry === entry) audioEntry = null;
      } else if (status === 'incomplete') {
        if (finalizePatient(entry, 'incomplete')) setNotice('reply_cut_short');
        if ((!entry.outputStarted || entry.stoppedSeen) && audioEntry === entry) audioEntry = null;
      } else if (status === 'failed') {
        if (finalizePatient(entry, 'failed')) setNotice('reply_failed');
        if (audioEntry === entry) audioEntry = null;
      }
    }

    function onProviderError(msg) {
      var error = msg.error && typeof msg.error === 'object' ? msg.error : {};
      var ref = typeof error.event_id === 'string' ? error.event_id : null;
      if (ref && pendingTruncate[ref]) {
        delete pendingTruncate[ref];
        diagnostics.truncateErrors += 1;
        return;
      }
      if (ref && pendingCommit[ref]) {
        delete pendingCommit[ref];
        diagnostics.commitErrors += 1;
        return;
      }
      if (ref && pendingCancel[ref]) {
        delete pendingCancel[ref];
        diagnostics.cancelErrors += 1;
        return;
      }
      if (ref && pendingClear[ref]) {
        delete pendingClear[ref];
        diagnostics.clearErrors += 1;
        return;
      }
      if (ref && pendingCreate[ref]) {
        var entry = pendingCreate[ref];
        delete pendingCreate[ref];
        if (activeResponse && activeResponse.entry === entry) activeResponse = null;
        if (finalizePatient(entry, 'failed')) setNotice('reply_failed');
        return;
      }
      diagnostics.providerErrors += 1;
      setNotice('provider_error', typeof error.message === 'string' && error.message ? error.message : NOTICE_COPY.provider_error);
    }

    // ------------------------------------------------------------------ public API

    function start() {
      if (mode !== 'idle') {
        return Promise.reject(realtimeError('invalid_state', 'start() is only available before the encounter begins.'));
      }
      return connect('start');
    }

    function reconnect() {
      if (mode !== 'error') {
        return Promise.reject(realtimeError('invalid_state', 'reconnect() is only available after a connection failure.'));
      }
      return connect('reconnect');
    }

    function pause() {
      if (mode !== 'live' || paused) return false;
      paused = true;
      if (conn) conn.tracks.forEach(function (track) { track.enabled = false; });
      stopPatientInternal();
      voiceActive = false;
      commitSentFor = null;
      clearItemTimers();
      dropOpenRecords();
      view.learnerInterim = '';
      publish();
      return true;
    }

    function resume() {
      if (mode !== 'live' || !paused) return false;
      paused = false;
      if (conn) conn.tracks.forEach(function (track) { track.enabled = true; });
      publish();
      return true;
    }

    function end() {
      return endSession(null);
    }

    function doneSpeaking() {
      if (!canDoneSpeaking()) return false;
      var key = voiceItemId || '*';
      var id = send({ type: 'input_audio_buffer.commit' });
      if (!id) return false;
      pendingCommit[id] = true;
      commitSentFor = key;
      publish();
      return true;
    }

    function sendText(input) {
      var text = String(input == null ? '' : input).trim();
      if (!text || text.length > MAX_TEXT_CHARS) {
        setNotice('text_invalid');
        publish();
        return false;
      }
      if (mode !== 'live' || paused || !conn || !conn.open) {
        setNotice('text_unavailable');
        publish();
        return false;
      }
      if ((activeResponse && !activeResponse.interrupted) || audioEntry || turnInFlight || heldBrief) stopPatientInternal();
      typedCount += 1;
      var itemId = 'typed-' + typedCount;
      var record = itemRecord(itemId);
      record.transcribed = true;
      record.consumed = true;
      record.transcript = text;
      newLearnerEntry(itemId, text, 'typed');
      sendMessageItem('user', 'input_text', text, itemId);
      needsTurn = true;
      postTurn({ force: true });
      publish();
      return true;
    }

    function stopPatient() {
      if (!canStopPatient()) return false;
      var did = stopPatientInternal();
      publish();
      return did;
    }

    function repeatPatient() {
      if (!canRepeat()) return false;
      var last = lastPatientEntry();
      var original = last.original || last;
      var entry = newPatientEntry([], original);
      sendMessageItem('system', 'input_text', REPEAT_BRIEF);
      activeResponse = { entry: entry, id: null, interrupted: false };
      var createId = send({ type: 'response.create' });
      if (createId) pendingCreate[createId] = entry;
      view.patientInterim = '';
      diagnostics.repeats += 1;
      publish();
      return true;
    }

    function setEagerness(value) {
      // The session's VAD is pinned server-side at op=start; a new value only reaches the
      // provider on the NEXT start() or reconnect(), never the live session.
      if (EAGERNESS_VALUES.indexOf(value) < 0) return false;
      eagerness = value;
      publish();
      return true;
    }

    function checkHealth() {
      return apiRequest(null, undefined).then(function (payload) {
        if (!payload || typeof payload !== 'object'
          || typeof payload.enabled !== 'boolean' || typeof payload.acceptingSessions !== 'boolean') {
          throw realtimeError('invalid_response', 'The health response is invalid.');
        }
        return payload;
      });
    }

    function exportTurns() {
      var out = [];
      transcript.forEach(function (entry) {
        if (entry.who !== 'pt' || entry.original || entry.status === 'pending' || !entry.answers.length) return;
        var said = entry.answers.map(function (learner) { return learner.text; }).join('\n');
        var spoken = exportedPatientText(entry);
        if (repeatable(entry)) {
          transcript.forEach(function (repeat) {
            if (repeat.who === 'pt' && repeat.original === entry && repeat.status === 'complete' && repeat.delivered) {
              spoken = repeat.text;
            }
          });
        }
        out.push({ me: said, pt: spoken });
      });
      return out;
    }

    function learnerItems() {
      return postedItems();
    }

    function getDiagnostics() {
      var copy = copyNumbers(diagnostics, Object.keys(diagnostics));
      copy.joinedItems = joinedItems.map(function (join) { return { itemId: join.itemId, from: join.from.slice() }; });
      return copy;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') throw realtimeError('invalid_argument', 'listener must be a function.');
      listeners.push(listener);
      var active = true;
      return function () {
        if (!active) return false;
        active = false;
        listeners = listeners.filter(function (candidate) { return candidate !== listener; });
        return true;
      };
    }

    return {
      start: start,
      pause: pause,
      resume: resume,
      end: end,
      doneSpeaking: doneSpeaking,
      sendText: sendText,
      stopPatient: stopPatient,
      repeatPatient: repeatPatient,
      reconnect: reconnect,
      setEagerness: setEagerness,
      checkHealth: checkHealth,
      exportTurns: exportTurns,
      learnerItems: learnerItems,
      getSnapshot: snapshot,
      getDiagnostics: getDiagnostics,
      subscribe: subscribe,
    };
  }

  return {
    createSession: createSession,
    constants: {
      MAX_TEXT_CHARS: MAX_TEXT_CHARS,
      REQUEST_TIMEOUT_MS: REQUEST_TIMEOUT_MS,
      TRUNCATE_JITTER_MS: TRUNCATE_JITTER_MS,
      CLEAR_WAIT_MS: CLEAR_WAIT_MS,
      FLOOR_TAKE_MS: FLOOR_TAKE_MS,
      TRANSCRIPT_WAIT_MS: TRANSCRIPT_WAIT_MS,
      DATA_CHANNEL_LABEL: DATA_CHANNEL_LABEL,
      INTERRUPTED_MARKER: INTERRUPTED_MARKER,
      NOT_HEARD_MARKER: NOT_HEARD_MARKER,
      CUT_SHORT_SUFFIX: CUT_SHORT_SUFFIX,
      NO_REPLY_MARKER: NO_REPLY_MARKER,
      REPEAT_BRIEF: REPEAT_BRIEF,
      NOTICE_COPY: NOTICE_COPY,
    },
  };
});
