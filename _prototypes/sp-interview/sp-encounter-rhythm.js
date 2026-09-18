/* Local encounter rhythm. No audio analysis, inferred emotion, or speed scoring. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPEncounterRhythm = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // Only whole utterances qualify. A question mark, negation, or continuation
  // makes these words a learner interruption, not a disposable acknowledgment.
  function isAcknowledgment(text) {
    var value = String(text || '').trim().toLowerCase().replace(/[‐‑–—]/g, '-');
    if (value.indexOf('?') !== -1) return false;
    value = value.replace(/[.!]+$/, '').trim().replace(/\s+/g, ' ');
    return /^(?:m+h+m+|m+-h+m+|mm hmm|uh-huh|uh huh|okay|ok|yes|yeah|yep|right|i see)$/.test(value);
  }
  function isUnfinishedAcknowledgment(result) {
    return result && !result.final && /^(?:m+|uh|i)$/i.test(String(result.text || '').trim());
  }

  // The owner explicitly enables this only with headphones. It keeps the same
  // running recognizer through an interruption so that cancellation latency
  // cannot lose the first words. It never opens a microphone on construction.
  function createListener(options) {
    var input = null, active = false, closed = false, transferred = false, interrupted = false;
    var started = false, connected = false, pending = null, buffer = [], error = null;
    var limit = 80, characterLimit = 12000, characterCount = 0;
    function emit(name, value) { if (typeof options[name] === 'function') options[name](value); }
    function stop() {
      if (closed) return;
      closed = true; active = false; buffer = []; pending = null;
      if (input && !transferred) input.stop();
    }
    function fail(problem) { if (closed) return; error = problem; stop(); emit('onError', problem); }
    function remember(result) {
      if (!result || !String(result.text || '').trim()) return;
      // Interim recognition replaces the previous interim hypothesis, while
      // finalized chunks remain in order, including a leading "No".
      if (buffer.length && !buffer[buffer.length - 1].final) characterCount -= buffer.pop().text.length;
      var value = {text: String(result.text), final: result.final === true};
      if (result.resultId !== undefined) value.resultId = result.resultId;
      buffer.push(value); characterCount += value.text.length;
      if (buffer.length > limit || characterCount > characterLimit) fail(new Error('The interruption became too long while the room was stopping. Resume and repeat your whole question.'));
    }
    function onResult(result) {
      if (closed || !active || !result || !String(result.text || '').trim()) return;
      if (interrupted) { remember(result); return; }
      if (isAcknowledgment(result.text) || isUnfinishedAcknowledgment(result)) {
        if (result.final) { pending = null; started = false; emit('onAcknowledgment', result); }
        else pending = result;
        return;
      }
      pending = null; remember(result);
      if (closed) return;
      interrupted = true;
      emit('onInterrupt', {started: started, result: result});
    }
    function takeInput(callbacks) {
      if (!input || closed || transferred) return null;
      transferred = true; active = false;
      var carryAcknowledgment = !interrupted && !!(pending || started), delivered = false, sinkStarted = false, ownedStopped = false;
      var initial = buffer.slice(), hadStarted = started, ready = connected;
      buffer = []; pending = null;
      function deliver(name, value) { if (!ownedStopped && typeof callbacks[name] === 'function') callbacks[name](value); }
      var sink = {
        onReady: function () {
          deliver('onReady');
          if (delivered) return;
          delivered = true;
          if (hadStarted && !carryAcknowledgment) { sinkStarted = true; deliver('onStart'); }
          var queued = initial; initial = [];
          queued.forEach(function (result) { deliver('onResult', result); });
        },
        onConnecting: function () { deliver('onConnecting'); },
        onStart: function () { if (!carryAcknowledgment) { sinkStarted = true; deliver('onStart'); } },
        onEnd: function () { if (!carryAcknowledgment) deliver('onEnd'); },
        onResult: function (result) {
          if (ownedStopped) return;
          // A backchannel begun during playback can finalize just after audio
          // ends. Finish classifying that utterance before normal learner input.
          if (carryAcknowledgment) {
            if (isAcknowledgment(result && result.text) || isUnfinishedAcknowledgment(result)) {
              if (result.final) { carryAcknowledgment = false; emit('onAcknowledgment', result); }
              return;
            }
            carryAcknowledgment = false;
            if (!sinkStarted) { sinkStarted = true; deliver('onStart'); }
          }
          if (!delivered) { initial.push(result); return; }
          deliver('onResult', result);
        },
        onError: function (problem) { deliver('onError', problem); }
      };
      input.retarget(sink);
      return {source: input, start: function () {
        if (ownedStopped) return;
        if (error) { deliver('onError', error); return; }
        input.start();
        // Some test/custom inputs do not re-emit readiness on an active start.
        if (ready && !delivered) sink.onReady();
      }, stop: function () { if (ownedStopped) return; ownedStopped = true; initial = []; input.stop(); }};
    }
    return {
      start: function () {
        if (active || closed || transferred) return;
        active = true;
        try {
          input = options.createInput({
            onReady: function () { if (!closed && active) { connected = true; emit('onReady'); } },
            onConnecting: function () { if (!closed && active) { connected = false; emit('onConnecting'); } },
            onStart: function () { if (!closed && active) started = true; },
            onEnd: function () {}, onResult: onResult, onError: fail
          });
          input.start();
        } catch (problem) { fail(problem); }
      }, stop: stop, takeInput: takeInput
    };
  }

  // Floor requests depend only on completed shared exchanges. Private dialogue,
  // typing speed, microphone silence, and unplayed text never trigger a request.
  function createFloorRequests(options) {
    var people = (options && options.participants || [{id:'morgan',name:'Morgan'},{id:'maya',name:'Maya'}]).slice();
    var resolvedThrough = 0, pending = null;
    if (people.length !== 2 || people.some(function (person) { return !person.id || !person.name; })) throw new Error('A family floor request needs exactly two named participants.');
    function completedTurns(events) {
      return (events || []).filter(function (item) {
        if (item.kind !== 'learner' || item.channel !== 'public' || item.status !== 'completed' || !Number.isInteger(item.turnId)) return false;
        var replies = events.filter(function (reply) { return reply.kind === 'segment' && reply.channel === 'public' && reply.groupId === item.groupId; });
        return replies.length > 0 && replies.every(function (reply) { return reply.status === 'completed'; });
      });
    }
    function resolve(request) {
      if (!pending || !request || request.id !== pending.id) return false;
      resolvedThrough = Math.max(resolvedThrough, pending.throughTurnId); pending = null; return true;
    }
    return {
      next: function (events, channel) {
        if (channel !== 'public') return null;
        var turns = completedTurns(events), latest = turns[turns.length - 1];
        if (pending && latest && latest.turnId > pending.throughTurnId && (latest.targetRoleId === pending.roleId || latest.targetRoleId === 'both')) {
          resolvedThrough = latest.turnId; pending = null;
        }
        if (pending) return Object.assign({}, pending);
        var available = turns.filter(function (turn) { return turn.turnId > resolvedThrough; });
        if (available.length < 2) return null;
        var first = available[available.length - 2], last = available[available.length - 1];
        if (first.targetRoleId !== last.targetRoleId || !people.some(function (person) { return person.id === last.targetRoleId; })) return null;
        var person = people.find(function (participant) { return participant.id !== last.targetRoleId; });
        pending = {id: person.id + ':' + last.turnId, roleId: person.id, throughTurnId: last.turnId, prompt: person.name + ': “Could I add something?”'};
        return Object.assign({}, pending);
      }, defer: resolve, invite: resolve
    };
  }
  return {isAcknowledgment:isAcknowledgment,createListener:createListener,createFloorRequests:createFloorRequests};
});
