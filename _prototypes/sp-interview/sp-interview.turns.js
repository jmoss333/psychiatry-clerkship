(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPInterviewTurns = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var NORMAL_SILENCE_MS = 4500;
  var EXTENDED_SILENCE_MS = 6000;
  var MAX_TURNS = 10;
  var MAX_TEXT_LENGTH = 1200;

  function freezeTree(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freezeTree(value[key]); });
    return Object.freeze(value);
  }

  function normalizedText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function errorView(error, fallback) {
    var message = error && error.message ? error.message : String(error || fallback);
    return { message: message };
  }

  function abortController() {
    if (typeof AbortController === 'function') return new AbortController();
    var signal = { aborted: false };
    return { signal: signal, abort: function () { signal.aborted = true; } };
  }

  function createController(inputDeps) {
    var deps = inputDeps || {};
    var maxTurns = Number.isInteger(deps.maxTurns) && deps.maxTurns >= 1 && deps.maxTurns <= MAX_TURNS ? deps.maxTurns : MAX_TURNS;
    var inputFactory = deps.input;
    var speakFactory = deps.speak;
    var respond = deps.respond;
    var notify = typeof deps.onChange === 'function' ? deps.onChange : function () {};
    var schedule = typeof deps.setTimeout === 'function' ? deps.setTimeout : setTimeout;
    var unschedule = typeof deps.clearTimeout === 'function' ? deps.clearTimeout : clearTimeout;

    var state = deps.initiallyPaused === true ? 'paused' : 'idle';
    var transcript = [];
    var caption = '';
    var error = null;
    var thinkingTime = false;
    var holdTurn = false;
    var submittedTurns = 0;
    var finalSegments = [];
    var interim = '';
    var seenResultIds = Object.create(null);
    var speechActive = false;
    // Recognition may deliver its first words after speechend or reconnecting.
    // Keep capture activity latched until the learner turn is explicitly reset.
    var speechDetected = false;
    var silenceTimer = null;
    var inputHandle = null;
    var speechHandle = null;
    var activeSpeechEntry = null;
    var activeResponseEntry = null;
    var requestHandle = null;
    var generation = 0;

    function snapshot() {
      return freezeTree({
        phase: state,
        state: state,
        transcript: transcript.map(function (entry) {
          var copy = { who: entry.who, text: entry.text };
          if (entry.playbackStatus) copy.playbackStatus = entry.playbackStatus;
          if (entry.responseStatus) copy.responseStatus = entry.responseStatus;
          if (entry.heardText) copy.heardText = entry.heardText;
          return copy;
        }),
        caption: caption,
        draft: normalizedText(finalSegments.join(' ')),
        interim: interim,
        speechActive: speechActive,
        speechDetected: speechDetected,
        turnCount: submittedTurns,
        submittedTurns: submittedTurns,
        thinkingTime: thinkingTime,
        holdTurn: holdTurn,
        pauseMs: thinkingTime ? EXTENDED_SILENCE_MS : NORMAL_SILENCE_MS,
        error: error ? error.message : null,
        notice: null,
      });
    }

    function publish() {
      try { notify(snapshot()); } catch (ignored) {}
    }

    function clearSilenceTimer() {
      if (silenceTimer === null) return;
      unschedule(silenceTimer);
      silenceTimer = null;
    }

    function stopInput() {
      var handle = inputHandle;
      inputHandle = null;
      if (handle && typeof handle.stop === 'function') {
        try { handle.stop(); } catch (ignored) {}
      }
    }

    function stopSpeech() {
      var handle = speechHandle;
      speechHandle = null;
      if (activeSpeechEntry && activeSpeechEntry.playbackStatus === 'speaking') {
        activeSpeechEntry.playbackStatus = 'interrupted';
      }
      activeSpeechEntry = null;
      if (handle && typeof handle.stop === 'function') {
        try { handle.stop(); } catch (ignored) {}
      }
    }

    function abortRequest() {
      var handle = requestHandle;
      requestHandle = null;
      if (handle) {
        try { handle.abort(); } catch (ignored) {}
      }
    }

    function finishResponse(status) {
      if (activeResponseEntry && activeResponseEntry.responseStatus === 'pending') {
        if (status) activeResponseEntry.responseStatus = status;
        else delete activeResponseEntry.responseStatus;
      }
      activeResponseEntry = null;
    }

    function cancelWork() {
      generation += 1;
      finishResponse('cancelled');
      clearSilenceTimer();
      stopInput();
      stopSpeech();
      abortRequest();
    }

    function fail(reason, fallback) {
      finishResponse('failed');
      cancelWork();
      error = errorView(reason, fallback || 'Spoken conversation failed.');
      state = 'error';
      caption = '';
      publish();
    }

    function resetCaptureText() {
      finalSegments = [];
      interim = '';
      seenResultIds = Object.create(null);
      speechActive = false;
      speechDetected = false;
      caption = '';
    }

    function hasFinalText() {
      return normalizedText(finalSegments.join(' ')).length > 0;
    }

    function armSilenceTimer(captureGeneration) {
      clearSilenceTimer();
      if (state !== 'listening' || captureGeneration !== generation || holdTurn || !hasFinalText() || interim || speechActive) return;
      silenceTimer = schedule(function () {
        silenceTimer = null;
        if (state !== 'listening' || captureGeneration !== generation || holdTurn || interim || speechActive) return;
        commitTurn(captureGeneration);
      }, thinkingTime ? EXTENDED_SILENCE_MS : NORMAL_SILENCE_MS);
    }

    function listen() {
      if (state === 'ended' || state === 'error') return;
      if (typeof inputFactory !== 'function') {
        fail(new Error('Speech recognition is unavailable.'));
        return;
      }
      resetCaptureText();
      state = 'starting';
      error = null;
      generation += 1;
      var captureGeneration = generation;
      var placeholder = { stop: function () {} };
      inputHandle = placeholder;
      publish();

      var created;
      try {
        created = inputFactory({
          onConnecting: function () {
            if (captureGeneration !== generation || (state !== 'starting' && state !== 'listening')) return;
            clearSilenceTimer();
            speechActive = false;
            state = 'starting';
            publish();
          },
          onReady: function () {
            if (captureGeneration !== generation || state !== 'starting') return;
            state = 'listening';
            armSilenceTimer(captureGeneration);
            publish();
          },
          onStart: function () {
            if (captureGeneration !== generation || state !== 'listening') return;
            clearSilenceTimer();
            speechActive = true;
            speechDetected = true;
            publish();
          },
          // resultId identifies a recognition engine callback. Reusing an id means
          // the callback is a duplicate and will not add the text a second time.
          onResult: function (result) {
            if (captureGeneration !== generation || state !== 'listening') return;
            var item = result || {};
            var text = normalizedText(item.text);
            if (text) speechDetected = true;
            if (item.final === true) {
              if (item.resultId !== undefined && item.resultId !== null) {
                var resultKey = String(item.resultId);
                if (seenResultIds[resultKey]) return;
                seenResultIds[resultKey] = true;
              }
              if (text) finalSegments.push(text);
              interim = '';
              speechActive = false;
            } else {
              interim = text;
              speechActive = Boolean(text);
            }
            caption = normalizedText(finalSegments.concat(interim ? [interim] : []).join(' '));
            if (normalizedText(finalSegments.join(' ')).length > MAX_TEXT_LENGTH) {
              fail(new Error('Keep each learner turn within 1,200 characters.'));
              return;
            }
            armSilenceTimer(captureGeneration);
            publish();
          },
          onEnd: function () {
            if (captureGeneration !== generation || state !== 'listening') return;
            speechActive = false;
            armSilenceTimer(captureGeneration);
            publish();
          },
          onError: function (reason) {
            if (captureGeneration !== generation || (state !== 'starting' && state !== 'listening')) return;
            fail(reason, 'Speech recognition failed.');
          },
        });
        if (!created || typeof created.start !== 'function' || typeof created.stop !== 'function') {
          throw new Error('Speech recognition is unavailable.');
        }
        if (captureGeneration === generation && (state === 'starting' || state === 'listening')) inputHandle = created;
        created.start();
        if (captureGeneration !== generation || (state !== 'starting' && state !== 'listening')) {
          try { created.stop(); } catch (ignored) {}
        }
      } catch (reason) {
        if (captureGeneration === generation && (state === 'starting' || state === 'listening')) {
          fail(reason, 'Speech recognition failed.');
        }
      }
    }

    function speakPatient(text, isOpening) {
      if (typeof speakFactory !== 'function') {
        fail(new Error('Speech is unavailable.'));
        return;
      }
      state = 'speaking';
      caption = '';
      generation += 1;
      var speechGeneration = generation;
      var transcriptEntry = { who: 'pt', text: text, playbackStatus: 'speaking' };
      transcript.push(transcriptEntry);
      finishResponse();
      activeSpeechEntry = transcriptEntry;
      var placeholder = { stop: function () {} };
      speechHandle = placeholder;
      publish();

      var created;
      try {
        created = speakFactory({
          text: text,
          onHeardText: function (prefix) {
            if (speechGeneration !== generation || state !== 'speaking' || typeof prefix !== 'string' || !prefix || text.indexOf(prefix) !== 0 || prefix.length <= (transcriptEntry.heardText || '').length) return;
            transcriptEntry.heardText = prefix;
            publish();
          },
          onEnded: function () {
            if (speechGeneration !== generation || state !== 'speaking') return;
            speechHandle = null;
            activeSpeechEntry = null;
            transcriptEntry.playbackStatus = 'played';
            delete transcriptEntry.heardText;
            if (!isOpening && submittedTurns >= maxTurns) {
              state = 'ended';
              publish();
              return;
            }
            publish();
            listen();
          },
          onError: function (reason) {
            if (speechGeneration !== generation || state !== 'speaking') return;
            transcriptEntry.playbackStatus = 'failed';
            fail(reason, 'Speech playback failed.');
          },
        });
        if (!created || typeof created.stop !== 'function') throw new Error('Speech is unavailable.');
        if (speechGeneration === generation && state === 'speaking') speechHandle = created;
        else {
          try { created.stop(); } catch (ignored) {}
        }
      } catch (reason) {
        if (speechGeneration === generation && state === 'speaking') {
          transcriptEntry.playbackStatus = 'failed';
          fail(reason, 'Speech playback failed.');
        }
      }
    }

    function commitTurn(captureGeneration) {
      if (state !== 'listening' || captureGeneration !== generation || interim) return false;
      var learnerText = normalizedText(finalSegments.join(' '));
      if (!learnerText || submittedTurns >= maxTurns) return false;
      if (learnerText.length > MAX_TEXT_LENGTH) {
        fail(new Error('Keep each learner turn within 1,200 characters.'));
        return false;
      }

      clearSilenceTimer();
      generation += 1;
      state = 'finalizing';
      publish();
      stopInput();
      resetCaptureText();
      submittedTurns += 1;
      activeResponseEntry = { who: 'me', text: learnerText, responseStatus: 'pending' };
      transcript.push(activeResponseEntry);
      state = 'awaiting_patient';
      publish();

      if (typeof respond !== 'function') {
        fail(new Error('The patient actor is unavailable.'));
        return true;
      }
      var requestGeneration = generation;
      var controller = abortController();
      requestHandle = controller;
      var pending;
      try {
        pending = respond(learnerText, { signal: controller.signal });
      } catch (reason) {
        if (requestGeneration === generation && state === 'awaiting_patient') fail(reason, 'The patient actor failed.');
        return true;
      }
      Promise.resolve(pending).then(function (result) {
        if (requestGeneration !== generation || state !== 'awaiting_patient') return;
        requestHandle = null;
        // A multi-person room owns its ordered audio queue and delivery receipts.
        // Reuse capture/pauses without inventing a single patient transcript entry.
        if (deps.externalDelivery === true && result && result.deliveryManaged === true) {
          finishResponse();
          if (submittedTurns >= maxTurns) { state = 'ended'; publish(); }
          else if (result.pauseAfterDelivery === true) { state = 'paused'; publish(); }
          else { publish(); listen(); }
          return;
        }
        // Live audio is keyed by the validated reply, including its paragraph
        // breaks and repeated spaces. Only learner capture collapses whitespace.
        var replyValue = result && result.reply;
        var reply = String(replyValue == null ? '' : replyValue).trim();
        if (!reply) {
          fail(new Error('The patient actor returned no reply.'));
          return;
        }
        speakPatient(reply, false);
      }, function (reason) {
        if (requestGeneration !== generation || state !== 'awaiting_patient') return;
        requestHandle = null;
        fail(reason, 'The patient actor failed.');
      });
      return true;
    }

    function start() {
      if (state !== 'idle') return false;
      if (deps.skipOpening === true) { listen(); return state !== 'error'; }
      var opening = normalizedText(deps.opening);
      if (!opening) {
        fail(new Error('An opening patient line is required.'));
        return false;
      }
      speakPatient(opening, true);
      return state !== 'error';
    }

    function pause() {
      if (state === 'idle' || state === 'paused' || state === 'ended' || state === 'error') return false;
      cancelWork();
      resetCaptureText();
      state = 'paused';
      publish();
      return true;
    }

    function interrupt() {
      if (state !== 'speaking' && state !== 'awaiting_patient') return false;
      cancelWork();
      resetCaptureText();
      if (submittedTurns >= maxTurns) {
        state = 'ended';
        publish();
        return true;
      }
      listen();
      return true;
    }

    function resume() {
      if (state !== 'paused' && state !== 'error') return false;
      if (submittedTurns >= maxTurns) {
        cancelWork();
        state = 'ended';
        publish();
        return false;
      }
      error = null;
      state = 'paused';
      listen();
      return state === 'starting' || state === 'listening';
    }

    function end() {
      if (state === 'ended') return false;
      cancelWork();
      resetCaptureText();
      state = 'ended';
      publish();
      return true;
    }

    function doneSpeaking() {
      if (state !== 'listening' || interim || !hasFinalText()) return false;
      return commitTurn(generation);
    }

    function setThinkingTime(enabled) {
      thinkingTime = enabled === true;
      if (state === 'listening') armSilenceTimer(generation);
      publish();
      return thinkingTime;
    }

    function setHoldTurn(enabled) {
      holdTurn = enabled === true;
      if (state === 'listening') armSilenceTimer(generation);
      publish();
      return holdTurn;
    }

    return {
      start: start,
      pause: pause,
      interrupt: interrupt,
      resume: resume,
      end: end,
      doneSpeaking: doneSpeaking,
      setThinkingTime: setThinkingTime,
      setHoldTurn: setHoldTurn,
      getSnapshot: snapshot,
    };
  }

  return { createController: createController };
});
