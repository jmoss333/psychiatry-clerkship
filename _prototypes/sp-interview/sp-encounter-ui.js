/* Local standardized-patient station tools. No storage and no patient/provider requests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPEncounterUI = api;
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function createClock(now) {
    var duration = 0, elapsed = 0, running = false, last = now();
    function settle() { var current = now(); if (running) elapsed += Math.max(0, current - last); last = current; }
    return {
      setMinutes: function (minutes) { settle(); duration = Math.max(0, Number(minutes) || 0) * 60000; },
      setRunning: function (value) { settle(); running = !!value && duration > 0; },
      extend: function (minutes) { settle(); if (duration) duration += Math.max(0, Number(minutes) || 0) * 60000; },
      reset: function () { elapsed = 0; running = false; last = now(); },
      read: function () { settle(); return {duration: duration, elapsed: elapsed, remaining: Math.max(0, duration - elapsed), running: running, expired: !!duration && elapsed >= duration}; }
    };
  }
  function clockText(clock) {
    if (!clock.duration) return 'Untimed practice';
    if (clock.expired) return 'Practice time reached — continue at your pace';
    var seconds = Math.ceil(clock.remaining / 1000);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' remaining';
  }
  function exchangesFrom(snapshot) {
    var result = [];
    if (Array.isArray(snapshot.events)) {
      snapshot.events.forEach(function (event) {
        if (event.kind === 'learner' && typeof event.text === 'string') result.push({id: String(event.turnId), learnerText: event.text, channel: event.channel || 'public', replies: []});
        if (event.kind === 'segment' && typeof event.text === 'string') {
          var exchange = result.find(function (item) { return item.id === String(event.turnId); });
          if (exchange && event.status === 'completed') {
            var prior = exchange.replies.find(function (reply) { return reply.roleId === event.roleId; });
            if (prior) prior.text += ' ' + event.text;
            else exchange.replies.push({roleId: event.roleId, text: event.text, status: 'completed'});
          }
        }
      });
      return result;
    }
    (snapshot.transcript || []).forEach(function (turn, index) {
      if (turn.who === 'me') result.push({id: String(turn.turnId === undefined ? result.length + 1 : turn.turnId), learnerText: String(turn.text || ''), channel: 'public', replies: []});
      else if ((turn.who === 'pt' || turn.who === 'sp') && result.length) {
        var completed = turn.playbackStatus === 'played' || turn.playbackStatus === 'completed';
        var heard = completed ? turn.text : typeof turn.heardText === 'string' && String(turn.text || '').indexOf(turn.heardText) === 0 ? turn.heardText : '';
        if (heard) result[result.length - 1].replies.push({roleId: turn.roleId || snapshot.roleId || 'patient', text: heard, status: 'completed'});
      }
    });
    return result;
  }
  function exchangesForReview(snapshot, channel) {
    return exchangesFrom(snapshot).filter(function (exchange) { return !Array.isArray(snapshot.events) || exchange.channel === (channel || 'public'); });
  }
  function channelLabel(channel) { return channel === 'morgan-private' ? 'Private check-in with Morgan' : channel === 'maya-private' ? 'Private check-in with Maya' : 'Public conversation'; }
  function interruptedFamilyEvent(snapshot) {
    return (snapshot.events || []).filter(function (event) { return event.kind === 'segment' && event.status === 'interrupted' && event.channel === (snapshot.channel || 'public'); }).slice(-1)[0] || null;
  }

  function mount(host, options) {
    options = options || {};
    var env = options.window || window, doc = env.document, profiles = options.profiles || env.SPEncounterProfiles;
    var profile = profiles && profiles.getProfile(options.caseId);
    if (!host || !profile) return null;
    var instance = 'sp-station-' + (++mount.counter), disposed = false, latest = {phase: 'idle', transcript: []}, original = null;
    var closeOpen = false, closePause = Promise.resolve(), closeGeneration = 0, manualTimerPause = false, extraTime = false, expiredAnnounced = false, selectedId = '', reflectionUnlocked = false;
    var clock = createClock(function () { return env.performance && env.performance.now ? env.performance.now() : Date.now(); });
    var handoffClock = createClock(function () { return env.performance && env.performance.now ? env.performance.now() : Date.now(); });
    var handoffInput = null, handoffActive = false, handoffGeneration = 0, handoffExpired = false, snapshotFingerprint = '';
    var notes = Object.create(null), requestedChart = Object.create(null), lastCueKey = '', lastCueEvent = '', closingShown = false, lastChannel = 'public', selectedReviewChannel = null, lastExternalReviewChannel = null;
    function el(tag, text, parent, attrs) { var node = doc.createElement(tag); if (text !== null && text !== undefined) node.textContent = text; Object.keys(attrs || {}).forEach(function (name) { node.setAttribute(name, attrs[name]); }); if (parent) parent.appendChild(node); return node; }
    function button(text, parent, callback) { var node = el('button', text, parent, {type: 'button', class: 'btn'}); node.addEventListener('click', callback); return node; }
    function field(labelText, parent, suffix) { var id = instance + '-' + suffix; el('label', labelText, parent, {for: id}); return el('textarea', '', parent, {id: id, rows: '4', maxlength: '4000', class: 'cfgin'}); }
    function call(name) { if (typeof options[name] === 'function') return options[name](); }
    host.classList.add('sp-station');
    var style = el('style', '.sp-station [hidden]{display:none!important}.sp-station{min-width:0}.sp-station .station-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.sp-station button,.sp-station select{min-height:44px;max-width:100%}.sp-station .station-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px}.sp-station .station-inset{padding:16px;border:1px solid var(--border,#ded6ca);border-radius:12px;margin-block:14px}.sp-station textarea{display:block;width:100%;box-sizing:border-box;min-height:100px;margin-block:8px 16px;font:inherit}.sp-station blockquote{margin:14px 0;padding:12px 16px;border-left:3px solid #2d726c;overflow-wrap:anywhere}.sp-station .station-small{font-size:.9rem;line-height:1.5}.sp-station .station-status{font-weight:600}.sp-station summary{cursor:pointer;padding:8px 0;min-height:28px}.sp-station h2{scroll-margin-top:20px}.sp-station .station-cue{border-left:4px solid #847359;padding-left:16px}.sp-station select{font:inherit;padding:8px}.sp-station li{margin-block:6px}.sp-station .station-after{margin-top:24px}', host);
    var before = el('section', null, host, {class: 'card', 'aria-labelledby': instance + '-title'});
    el('p', 'YOUR STANDARDIZED-PATIENT STATION', before, {class: 'eyebrow'});
    var title = el('h2', 'Before you enter', before, {id: instance + '-title'});
    el('p', 'Practice the same patient-centered encounter skills whether you are training for an MD or DO degree. This fictional station provides practice, not a readiness judgment.', before, {class: 'station-small'});
    var door = el('div', null, before, {class: 'station-inset', 'data-station': 'door-note'});
    var doorTitle = el('h3', 'Door note', door), doorText = el('p', '', door), taskText = el('p', '', door), goals = el('ul', null, door);
    var chart = el('details', null, before, {'data-station': 'chart'});
    el('summary', 'Request available chart information', chart);
    el('p', 'Open only what you want to review. Unavailable information stays unknown; you can identify what you would seek from the clinical team.', chart, {class: 'station-small'});
    var chartItems = el('div', null, chart, {class: 'station-grid'});
    var timerBox = el('details', null, before);
    el('summary', 'Optional practice timer and accommodations', timerBox);
    var timerRow = el('div', null, timerBox, {class: 'station-row'});
    el('label', 'Practice length', timerRow, {for: instance + '-timer'});
    var timerSelect = el('select', null, timerRow, {id: instance + '-timer'});
    [['0', 'Untimed'], ['8', '8 minutes'], ['10', '10 minutes']].forEach(function (item) { el('option', item[1], timerSelect, {value: item[0]}); });
    var timerDisplay = el('span', 'Untimed practice', timerRow, {class: 'station-status', 'data-station': 'timer'});
    var pauseTimer = button('Pause timer', timerRow, function () { manualTimerPause = !manualTimerPause; refreshTimer(); });
    var extendTimer = button('Add 2 minutes', timerRow, function () { clock.extend(2); expiredAnnounced = false; refreshTimer(); });
    var extraLabel = el('label', null, timerBox, {class: 'station-row'}), extra = el('input', null, extraLabel, {type: 'checkbox'}); extraLabel.appendChild(doc.createTextNode(' Double my practice time'));
    el('p', 'The timer pauses when the encounter pauses, while a reply is being prepared, during a repair or alternative, and when this page is hidden. It never stops the encounter. Speaking speed and reflective pauses are not graded.', timerBox, {class: 'station-small'});
    var cueSection = el('section', null, host, {class: 'card', 'aria-labelledby': instance + '-cue-title'});
    el('h2', 'What you can observe', cueSection, {id: instance + '-cue-title'});
    var cueText = el('p', '', cueSection, {class: 'station-cue', 'data-station': 'cue', 'aria-live': 'polite'});
    el('p', 'These are authored simulation cues. Explore their meaning with the patient; an observation alone does not establish an emotion or diagnosis.', cueSection, {class: 'station-small'});
    var closingPrompt = el('p', 'When you are ready, leave room to summarize, invite corrections, and ask what remains important before the visit ends. There is no penalty for taking your time.', cueSection, {hidden: '', 'data-station': 'closing-prompt', role: 'status'});
    var closeBox = el('section', null, host, {class: 'card', hidden: '', role: 'dialog', 'aria-labelledby': instance + '-close-title'});
    var closeTitle = el('h2', 'Close the visit with the patient', closeBox, {id: instance + '-close-title', tabindex: '-1'});
    el('p', 'The microphone is paused. Before leaving, consider summarizing what you understood, inviting corrections and remaining questions, and agreeing on the next conversation with the supervising team.', closeBox);
    var closeRow = el('div', null, closeBox, {class: 'station-row'});
    var returnToPatient = button('Return to patient and summarize', closeRow, async function () {
      var generation = closeGeneration; returnToPatient.disabled = true;
      try { await closePause; if (disposed || generation !== closeGeneration || !closeOpen) return; closeOpen = false; closeBox.hidden = true; if (!doc.hidden) call('onResume'); refreshTimer(); }
      catch (_) { if (!disposed) live.textContent = 'The room is still paused. Check its status before resuming.'; }
      finally { if (!disposed) returnToPatient.disabled = false; }
    });
    button('Finish visit and give handoff', closeRow, function () { closeOpen = false; closeBox.hidden = true; call('onEnd'); });
    button('Keep encounter paused', closeRow, function () { closeOpen = false; closeBox.hidden = true; refreshTimer(); });
    var after = el('section', null, options.afterHost || host, {class: 'sp-station station-after', hidden: '', 'aria-labelledby': instance + '-handoff-title'});
    var handoff = el('section', null, after, {class: 'card'});
    var handoffTitle = el('h2', 'Present to your attending', handoff, {id: instance + '-handoff-title', tabindex: '-1'});
    el('p', 'Give a brief presentation in your own words: who you met and why, the patient’s priorities, key findings and uncertainties, your working formulation, and what you would ask your supervisor to help decide.', handoff);
    var handoffPrompts = el('details', null, handoff); el('summary', 'Presentation prompts for this station', handoffPrompts); var handoffPromptList = el('ul', null, handoffPrompts); (profile.handoffPrompts || []).forEach(function (prompt) { el('li', prompt, handoffPromptList); });
    el('p', 'Aim for about one minute if useful, or take longer. You may speak, type, or skip. This presentation is separate from the patient conversation and is never sent to the patient or reply API. Browser dictation may use its speech-recognition service.', handoff, {class: 'station-small'});
    var handoffText = field('Your presentation to the attending', handoff, 'handoff');
    var handoffRow = el('div', null, handoff, {class: 'station-row'});
    var dictate = button('Dictate presentation', handoffRow, startHandoff);
    var stopDictation = button('Stop dictation', handoffRow, function () { stopHandoff('Dictation stopped. Edit your presentation or continue when ready.'); }); stopDictation.hidden = true;
    var handoffTimeButton = button('Start optional 60-second timer', handoffRow, function () { handoffClock.setMinutes(1); handoffClock.reset(); handoffClock.setRunning(true); handoffExpired = false; refreshHandoff(); });
    var handoffPause = button('Pause presentation timer', handoffRow, function () { handoffClock.setRunning(!handoffClock.read().running); refreshHandoff(); }); handoffPause.hidden = true;
    var handoffMore = button('Add 1 minute', handoffRow, function () { handoffClock.extend(1); handoffExpired = false; refreshHandoff(); }); handoffMore.hidden = true;
    var handoffTime = el('span', 'Untimed presentation', handoffRow, {'data-station': 'handoff-timer'});
    var handoffStatus = el('p', '', handoff, {role: 'status', 'data-station': 'handoff-status'});
    var handoffInterim = el('p', '', handoff, {'aria-label': 'Presentation words being recognized'});
    var reflect = el('section', null, after, {class: 'card', 'aria-labelledby': instance + '-reflection-title'});
    el('h2', 'Revisit one moment', reflect, {id: instance + '-reflection-title'});
    el('p', 'Choose your actual words, reflect first, then consider possible patient perspectives. Only replies confirmed as completed are included.', reflect, {class: 'station-small'});
    var reviewContext = el('div', null, reflect, {hidden: ''});
    el('label', 'Review conversation context', reviewContext, {for: instance + '-review-context'});
    var reviewSelect = el('select', null, reviewContext, {id: instance + '-review-context'});
    el('p', 'This changes only your private review of the original encounter. It does not change the room, share a private check-in, or send a request.', reviewContext, {class: 'station-small'});
    var reflectionChannel = el('p', '', reflect, {class: 'station-status', 'data-station': 'reflection-channel'});
    el('label', 'Exchange to reflect on', reflect, {for: instance + '-exchange'});
    var exchangeSelect = el('select', null, reflect, {id: instance + '-exchange', style: 'width:100%'});
    var selectedQuote = el('blockquote', '', reflect, {'data-station': 'selected-quote'});
    var heardReplies = el('div', null, reflect, {'data-station': 'completed-replies'});
    var learnerReflection = field('What were you trying to convey, and how might it have landed?', reflect, 'reflection');
    var perspectiveButton = button('Explore possible patient perspectives', reflect, showPerspectives);
    var perspectives = el('div', null, reflect, {hidden: '', 'data-station': 'perspectives'});
    var retryButton = button('Try this exchange again', reflect, function () {
      stopHandoff('Presentation dictation stopped before the alternative.');
      if (typeof options.onRetry !== 'function') return;
      Promise.resolve(options.onRetry(selectedId)).then(function (started) {
        if (disposed) return;
        if (started === false) retryNotice.textContent = 'This exchange cannot start an alternative right now. Check the existing alternative panel below for availability; your original encounter is unchanged.';
      }).catch(function () { if (!disposed) retryNotice.textContent = 'The alternative could not start. Your original encounter and reflections remain here.'; });
    });
    var retryNotice = el('p', 'The existing alternative keeps your original encounter and notes unchanged. It is practice, not a score.', reflect, {class: 'station-small'});
    var live = el('p', '', host, {role: 'status', class: 'station-small'});

    function profileDoor() {
      var note = profile.doorNote || {};
      doorText.textContent = typeof note === 'string' ? note : note.context || note.setting || profile.context || '';
      taskText.textContent = note.task || profile.task || '';
      (note.objectives || profile.objectives || profile.learningObjectives || []).forEach(function (item) { el('li', item, goals); });
      var items = profile.chartCards || profile.chart || profile.chartItems || [];
      if (!Array.isArray(items)) items = Object.keys(items).map(function (key) { return {id: key, label: key, text: items[key]}; });
      items.forEach(function (item, index) {
        var id = item.id || String(index), itemBox = el('div', null, chartItems, {class: 'station-inset'}), result = el('p', '', itemBox, {hidden: ''});
        var request = button(item.label || item.title || 'Request chart information', itemBox, function () {
          requestedChart[id] = true; result.hidden = false; result.textContent = item.text || item.content || item.value || 'This information is not established in this case.'; request.disabled = true; request.textContent = 'Reviewed: ' + (item.label || item.title || 'chart information');
          if (item.source) el('p', 'Source: ' + item.source, itemBox, {class: 'station-small'});
        }); itemBox.insertBefore(request, result);
      });
      if (!items.length) el('p', 'No additional chart results are established. Ask the clinical team rather than infer results.', chartItems);
      var opening = profile.openingCue || (profile.cues && profile.cues.opening) || (profile.participants || []).map(function (person) { return person.cues && person.cues.opening; }).filter(Boolean).join(' ');
      cueText.textContent = typeof opening === 'string' ? opening : opening && opening.text || 'Listen to the patient’s words and leave room for pauses. Additional case cues appear here when available.';
    }
    function refreshTimer() {
      var phase = latest.phase;
      clock.setRunning(!disposed && !manualTimerPause && !doc.hidden && !closeOpen && !latest.isRetry && ['starting', 'listening', 'finalizing', 'speaking'].indexOf(phase) >= 0);
      var read = clock.read(); timerDisplay.textContent = clockText(read); pauseTimer.hidden = extendTimer.hidden = !read.duration;
      pauseTimer.textContent = manualTimerPause ? 'Resume timer' : 'Pause timer';
      timerSelect.disabled = phase !== 'idle'; extra.disabled = phase !== 'idle';
      if (read.expired && !expiredAnnounced) { expiredAnnounced = true; live.textContent = 'Your optional practice time has elapsed. Continue or close when ready; there is no time penalty.'; }
    }
    function refreshHandoff() {
      var read = handoffClock.read(); handoffTime.textContent = read.duration ? clockText(read) : 'Untimed presentation';
      handoffPause.hidden = handoffMore.hidden = !read.duration;
      handoffPause.textContent = read.running ? 'Pause presentation timer' : 'Resume presentation timer';
      if (read.expired && !handoffExpired) { handoffExpired = true; handoffStatus.textContent = 'One-minute target reached. Continue if you need more time; nothing was cut off.'; }
    }
    function stopHandoff(message) {
      handoffGeneration += 1; handoffActive = false;
      if (handoffInput) handoffInput.stop(); handoffInput = null; dictate.hidden = false; stopDictation.hidden = true;
      handoffInterim.textContent = ''; if (message) handoffStatus.textContent = message;
      handoffClock.setRunning(false); refreshHandoff();
    }
    function startHandoff() {
      if (disposed || doc.hidden || handoffActive || latest.phase !== 'ended' || latest.isRetry) return;
      if (typeof options.createSpeechInput !== 'function') { handoffStatus.textContent = 'Dictation is unavailable in this browser. Type your presentation instead.'; return; }
      var generation = ++handoffGeneration, seen = Object.create(null);
      try {
        handoffActive = true; dictate.hidden = true; stopDictation.hidden = false;
        handoffInput = options.createSpeechInput({
          onReady: function () { if (generation === handoffGeneration) handoffStatus.textContent = 'Listening to your attending presentation. This does not go to the patient.'; },
          onResult: function (result) {
            if (generation !== handoffGeneration || !handoffActive) return;
            if (result.final) {
              if (result.resultId && seen[result.resultId]) return;
              if (result.resultId) seen[result.resultId] = true;
              var text = String(result.text || '').trim();
              if (text) handoffText.value = (handoffText.value.trim() + ' ' + text).trim().slice(0, 4000);
              handoffInterim.textContent = '';
            } else handoffInterim.textContent = String(result.text || '');
          },
          onError: function (error) { if (generation === handoffGeneration) stopHandoff((error && error.message || 'Dictation stopped.') + ' Your completed presentation remains available for typing.'); }
        });
        handoffInput.start();
      } catch (_) { stopHandoff('Dictation is unavailable. Type your presentation instead.'); }
    }
    function reflectionResult() {
      if (!profiles || typeof profiles.buildReflection !== 'function') return null;
      return profiles.buildReflection(profile, {exchanges: reviewExchanges(), selectedId: selectedId});
    }
    function reviewChannel() { return selectedReviewChannel || latest.reviewChannel || latest.channel || 'public'; }
    function reviewExchanges() { return exchangesForReview(original || latest, reviewChannel()); }
    function chooseExchange() {
      selectedId = exchangeSelect.value; reflectionUnlocked = false; perspectives.hidden = true; perspectives.replaceChildren();
      learnerReflection.value = notes[selectedId] || ''; perspectiveButton.disabled = !learnerReflection.value.trim();
      var result = reflectionResult(), exchange = reviewExchanges().find(function (item) { return item.id === selectedId; });
      selectedQuote.textContent = result && result.quote || exchange && exchange.learnerText || 'Complete an exchange to revisit your words here.';
      heardReplies.replaceChildren();
      ((result && result.completedReplies) || (exchange && exchange.replies) || []).forEach(function (reply) { el('p', (reply.name ? reply.name + ': ' : '') + reply.text, heardReplies); });
      if (!heardReplies.childElementCount) el('p', 'No completed patient reply is available for this moment. Do not infer what an unheard response would have been.', heardReplies);
      retryButton.hidden = typeof options.onRetry !== 'function' || !exchange || !exchange.replies.length;
    }
    function showPerspectives() {
      if (!learnerReflection.value.trim()) { learnerReflection.focus(); return; }
      notes[selectedId] = learnerReflection.value; reflectionUnlocked = true; perspectives.replaceChildren(); perspectives.hidden = false;
      var result = reflectionResult();
      el('p', 'Possible interpretations, not the patient’s proven thoughts. Discuss these with your supervisor and compare them with the patient’s actual response.', perspectives, {class: 'station-small'});
      if (!result) { el('p', 'Consider what was said, what remains uncertain, and how you might check your understanding directly.', perspectives); return; }
      var grid = el('div', null, perspectives, {class: 'station-grid'});
      (result.perspectives || []).forEach(function (item) { var card = el('div', null, grid, {class: 'station-inset'}); el('h3', item.name + '’s possible perspective', card); el('p', item.possibleInterpretation, card); el('p', item.question, card); });
      if (!(result.perspectives || []).length) el('p', 'There is no completed response from a participant in this exchange. Ask how your words landed before inferring a reaction.', perspectives);
      el('h3', 'Bring to supervision', perspectives);
      var questions = el('ul', null, perspectives); (result.teachingQuestions || []).forEach(function (question) { el('li', question, questions); });
    }
    function renderReflection() {
      var exchanges = reviewExchanges(), fingerprint = JSON.stringify({channel: reviewChannel(), exchanges: exchanges});
      if (fingerprint === snapshotFingerprint) return;
      snapshotFingerprint = fingerprint; exchangeSelect.replaceChildren();
      var familyReview = Array.isArray((original || latest).events);
      reviewContext.hidden = !familyReview;
      if (familyReview) {
        reviewSelect.replaceChildren();
        var channels = exchangesFrom(original || latest).map(function (exchange) { return exchange.channel; }).filter(function (channel, index, all) { return ['public', 'morgan-private', 'maya-private'].indexOf(channel) >= 0 && all.indexOf(channel) === index; });
        if (channels.indexOf(reviewChannel()) < 0) channels.push(reviewChannel());
        channels.forEach(function (channel) { el('option', channelLabel(channel), reviewSelect, {value: channel}); });
        reviewSelect.value = reviewChannel();
      }
      reflectionChannel.textContent = familyReview ? channelLabel(reviewChannel()) + ' — other channels are not shown here.' : '';
      exchanges.forEach(function (exchange) { el('option', 'Exchange ' + exchange.id + (Array.isArray((original || latest).events) ? ' · ' + channelLabel(exchange.channel) : '') + ' — ' + exchange.learnerText.slice(0, 110), exchangeSelect, {value: exchange.id}); });
      if (!exchanges.some(function (exchange) { return exchange.id === selectedId; })) selectedId = exchanges.length ? exchanges[exchanges.length - 1].id : '';
      exchangeSelect.value = selectedId; exchangeSelect.disabled = !exchanges.length; learnerReflection.disabled = !exchanges.length; chooseExchange();
    }
    function renderCues(snapshot) {
      var channel = snapshot.channel || 'public', familyInterruption = Array.isArray(snapshot.events) ? interruptedFamilyEvent(snapshot) : null;
      var familyInterruptionKey = familyInterruption && 'family-interrupted:' + (familyInterruption.id || familyInterruption.segmentId);
      if (channel !== lastChannel) {
        lastChannel = channel; lastCueKey = ''; lastCueEvent = familyInterruptionKey || '';
        var resetCues = (profile.participants || []).filter(function (person) { return channel === 'public' || person.id + '-private' === channel; }).map(function (person) { return person.cues && (channel === 'public' ? person.cues.opening : person.cues.privateOpening || person.cues.opening); }).filter(Boolean);
        cueText.textContent = resetCues.join(' ') || 'No additional observation is supplied for this moment.';
      }
      var cues = snapshot.observableCues || snapshot.cues || [], single = snapshot.cue;
      if (single) cues = Array.isArray(cues) ? cues.concat([single]) : [single];
      if (!Array.isArray(cues)) cues = [];
      if (cues.length && familyInterruptionKey) lastCueEvent = familyInterruptionKey;
      if (!cues.length && familyInterruptionKey && familyInterruptionKey !== lastCueEvent) {
        var familyPerson = (profile.participants || []).find(function (person) { return person.id === familyInterruption.roleId; });
        lastCueEvent = familyInterruptionKey;
        if (familyPerson && familyPerson.cues && familyPerson.cues.interrupted) cues = [{text: familyPerson.cues.interrupted, roleId: familyPerson.id, channel: channel}];
      }
      if (!cues.length && !Array.isArray(snapshot.events)) {
        var transcript = snapshot.transcript || [], interrupted = null;
        transcript.forEach(function (turn, index) { if ((turn.who === 'pt' || turn.who === 'sp') && turn.playbackStatus === 'interrupted') interrupted = {turn: turn, index: index}; });
        if (interrupted && ('interrupted:' + interrupted.index) !== lastCueEvent) {
          var person = (profile.participants || []).find(function (person) { return !interrupted.turn.roleId || person.id === interrupted.turn.roleId; });
          if (person && person.cues && person.cues.interrupted) { lastCueEvent = 'interrupted:' + interrupted.index; cues = [{text: person.cues.interrupted}]; }
        }
        if (!cues.length) return;
      }
      var visible = cues.filter(function (cue) { return typeof cue === 'string' || ((!cue.channel || cue.channel === channel) && (channel === 'public' || !cue.roleId || cue.roleId + '-private' === channel)); });
      if (!visible.length) return;
      var cue = visible[visible.length - 1], text = typeof cue === 'string' ? cue : cue.text;
      if (!text || text === lastCueKey) return;
      lastCueKey = text; cueText.textContent = text;
    }
    function update(snapshot) {
      if (disposed || !snapshot) return;
      if (snapshot.caseId && snapshot.caseId !== options.caseId) return;
      var priorPhase = latest.phase;
      latest = Object.assign({roleId: profile.participants && profile.participants[0] && profile.participants[0].id}, snapshot, {isRetry: !!(snapshot.isRetry || snapshot.retryActive)});
      if (latest.reviewChannel && latest.reviewChannel !== lastExternalReviewChannel) { selectedReviewChannel = latest.reviewChannel; lastExternalReviewChannel = latest.reviewChannel; }
      renderCues(latest); refreshTimer();
      if (!closingShown && !latest.isRetry && latest.turnCount >= 8 && latest.phase !== 'ended') { closingShown = true; closingPrompt.hidden = false; }
      var finished = latest.phase === 'ended' && !latest.isRetry;
      if (finished) {
        if (!original) original = JSON.parse(JSON.stringify(latest));
        after.hidden = false; closeBox.hidden = true; closeOpen = false; renderReflection();
        if (priorPhase !== 'ended') Promise.resolve().then(function () {
          if (!disposed && !doc.hidden && latest.phase === 'ended' && !latest.isRetry && handoffTitle.isConnected) handoffTitle.focus();
        });
      }
      if (latest.isRetry && handoffActive) stopHandoff('Presentation dictation paused during the alternative.');
      dictate.disabled = latest.isRetry;
      if (snapshot.phase !== 'ended' && handoffActive) stopHandoff('Presentation dictation stopped.');
    }
    function requestClose() {
      if (disposed || latest.phase === 'ended') return true;
      closeGeneration += 1; closePause = Promise.resolve(call('onPause')); closePause.catch(function () {}); closeOpen = true; closeBox.hidden = false;
      if (!latest.events) {
        var person = profile.participants && profile.participants[0];
        if (person && person.cues && person.cues.closing) renderCues({cue: person.cues.closing});
      }
      refreshTimer(); closeTitle.focus(); return false;
    }
    function visibility() { if (doc.hidden) { stopHandoff('Dictation paused because this page is hidden. Resume explicitly when ready.'); handoffClock.setRunning(false); } refreshTimer(); }
    function dispose() {
      if (disposed) return; disposed = true; stopHandoff(); clock.setRunning(false); handoffClock.setRunning(false); env.clearInterval(ticker);
      doc.removeEventListener('visibilitychange', visibility); env.removeEventListener('pagehide', dispose);
      handoffText.value = ''; learnerReflection.value = ''; notes = Object.create(null); original = null;
      after.remove(); host.replaceChildren();
    }
    timerSelect.addEventListener('change', function () { clock.setMinutes(Number(timerSelect.value) * (extraTime ? 2 : 1)); expiredAnnounced = false; refreshTimer(); });
    extra.addEventListener('change', function () { extraTime = extra.checked; clock.setMinutes(Number(timerSelect.value) * (extraTime ? 2 : 1)); refreshTimer(); });
    exchangeSelect.addEventListener('change', chooseExchange);
    reviewSelect.addEventListener('change', function () { selectedReviewChannel = reviewSelect.value; selectedId = ''; renderReflection(); });
    learnerReflection.addEventListener('input', function () { notes[selectedId] = learnerReflection.value; perspectiveButton.disabled = !learnerReflection.value.trim(); });
    doc.addEventListener('visibilitychange', visibility); env.addEventListener('pagehide', dispose);
    var ticker = env.setInterval(function () { refreshTimer(); refreshHandoff(); }, 500);
    profileDoor(); update(latest); perspectiveButton.disabled = true;
    return {update: update, requestClose: requestClose, dispose: dispose, getPresentation: function () { return handoffText.value; }, getReflections: function () { return Object.assign({}, notes); }};
  }
  mount.counter = 0;
  return {mount: mount, createClock: createClock, clockText: clockText, exchangesFrom: exchangesFrom, exchangesForReview: exchangesForReview, interruptedFamilyEvent: interruptedFamilyEvent};
}));
