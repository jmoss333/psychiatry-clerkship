/* Local-only Dana conversation preview. Live replies require a separate explicit local opt-in. */
(function (root, factory) {
  var localCases = null, localDana = root && root.SPInterviewLocalDana, rhythm = root && root.SPEncounterRhythm;
  if (typeof module === 'object' && module.exports) {
    rhythm = require('./sp-encounter-rhythm.js');
    localDana = require('./sp-interview.local-dana.js');
    try { localCases = require('./sp-interview.local-cases.js'); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND' || error.message.indexOf("Cannot find module './sp-interview.local-cases.js'") !== 0) throw error; }
  }
  var api = factory(localCases, localDana, rhythm);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPInterviewConversation = api;
})(typeof window !== 'undefined' ? window : null, function (nodeLocalCases, nodeLocalDana, rhythm) {
  'use strict';

  function createSpeechInput(env, callbacks) {
    var Constructor = env.SpeechRecognition || env.webkitSpeechRecognition;
    if (!Constructor) throw new Error('Speech recognition is unavailable. Try a supported browser or use the usual Interview Room.');
    var recognition = null, active = false, connected = false, restarts = 0, generation = 0, runGeneration = 0, restartTimer = null, deadline = null;
    var schedule = env.setTimeout.bind(env), unschedule = env.clearTimeout.bind(env);
    var now = typeof env.now === 'function' ? env.now.bind(env) : Date.now;
    function emit(name, value) { if (callbacks && typeof callbacks[name] === 'function') callbacks[name](value); }
    function detach() {
      if (!recognition) return;
      var current = recognition;
      recognition = null; connected = false;
      current.onstart = current.onspeechstart = current.onspeechend = null;
      current.onresult = current.onerror = current.onend = null;
      try { current.abort(); } catch (_) {}
    }
    function stop() {
      active = false; connected = false; runGeneration += 1;
      unschedule(restartTimer); unschedule(deadline);
      restartTimer = null; deadline = null;
      detach();
    }
    function fail(message) { stop(); emit('onError', new Error(message)); }
    function connect() {
      if (!active) return;
      var current = new Constructor(), id = ++generation, finals = Object.create(null), pendingInterim = false, madeProgress = false, connectedAt = null;
      recognition = current;
      current.lang = 'en-US'; current.continuous = true; current.interimResults = true;
      current.onstart = function () {
        if (!active || recognition !== current) return;
        connected = true; connectedAt = now(); emit('onReady');
      };
      current.onspeechstart = function () { if (active && recognition === current) emit('onStart'); };
      current.onspeechend = function () { if (active && recognition === current) emit('onEnd'); };
      current.onresult = function (event) {
        if (!active || recognition !== current) return;
        var interim = [];
        for (var i = 0; i < event.results.length; i++) {
          if (!active || recognition !== current) return;
          var result = event.results[i], text = result[0] && result[0].transcript || '';
          if (result.isFinal) {
            if (!finals[i]) {
              finals[i] = true;
              if (text.trim()) madeProgress = true;
              emit('onResult', {text: text, final: true, resultId: id + ':' + i});
            }
          } else interim.push(text);
        }
        if (!active || recognition !== current) return;
        pendingInterim = interim.some(function (text) { return text.trim().length > 0; });
        if (interim.length) emit('onResult', {text: interim.join(' '), final: false});
      };
      function reconnect() {
        if (!active || recognition !== current) return;
        if (pendingInterim) { fail('The speech service stopped before finishing your question. Resume and repeat the whole question.'); return; }
        // Ordinary quiet service endings are not the end of a learner turn.
        // Limit only rapid restarts that produced no final words or useful uptime.
        if (madeProgress || (connectedAt !== null && now() - connectedAt >= 5000)) restarts = 0;
        else restarts += 1;
        if (restarts > 3) { fail('The speech service repeatedly stopped before it could listen. Resume when you are ready.'); return; }
        var run = runGeneration;
        detach();
        emit('onConnecting');
        if (!active || run !== runGeneration) return;
        var timer = schedule(function () {
          if (restartTimer !== timer) return;
          restartTimer = null;
          if (active && run === runGeneration && !recognition) {
            try { connect(); } catch (_) { fail('The microphone could not restart. Resume when ready.'); }
          }
        }, 0);
        restartTimer = timer;
      }
      current.onerror = function (event) {
        if (!active || recognition !== current) return;
        if (event.error === 'no-speech') { reconnect(); return; }
        var messages = {
          'not-allowed': 'Microphone permission was denied. Allow it in your browser, then resume.',
          'service-not-allowed': 'Your browser does not allow its speech service here.',
          'audio-capture': 'The microphone is unavailable. Check your input device, then resume.',
          'network': 'This browser reported a speech-recognition connection error. The microphone is off. Try Resume or another browser; completed turns remain on this page.'
        };
        fail(messages[event.error] || 'Speech recognition stopped. The microphone is now off; resume when ready.');
      };
      current.onend = reconnect;
      current.start();
    }
    return {
      start: function () {
        if (active) { if (connected) emit('onReady'); return; }
        active = true; restarts = 0;
        var run = ++runGeneration;
        deadline = schedule(function () { if (active && run === runGeneration) fail('This microphone turn reached its 5-minute limit. Resume and repeat the whole question to continue.'); }, 300000);
        try { connect(); } catch (error) { stop(); throw error; }
      },
      stop: stop,
      retarget: function (nextCallbacks) { callbacks = nextCallbacks || {}; }
    };
  }

  function availableVoices(list) {
    var novelty = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Ralph|Trinoids|Whisper|Wobble|Zarvox|Superstar|Junior)(\s|$)/i;
    function score(voice) {
      var name = String(voice.name || ''), rank = /^en[-_]US$/i.test(voice.lang) ? 100 : 0;
      if (/premium|enhanced|natural|neural/i.test(name)) rank += 1000;
      ['Samantha','Ava','Allison','Susan','Zoe'].some(function (candidate, index) {
        if (name.toLowerCase().indexOf(candidate.toLowerCase()) === 0) { rank += 500 - index * 20; return true; }
        return false;
      });
      return rank;
    }
    return (list || []).filter(function (voice) {
      return /^en(?:[-_]|$)/i.test(voice.lang || '') && voice.localService !== false && !novelty.test(voice.name || '');
    }).slice().sort(function (a, b) { return score(b) - score(a) || String(a.name).localeCompare(String(b.name)); });
  }

  function voiceKey(voice) { return voice.voiceURI || voice.name + '|' + voice.lang; }
  function selectVoice(list, selectedURI) {
    var choices = availableVoices(list);
    return choices.find(function (voice) { return voiceKey(voice) === selectedURI; }) || choices[0] || null;
  }

  function createSpeaker(env, options) {
    if (!env.speechSynthesis || !env.SpeechSynthesisUtterance) throw new Error('Spoken playback is unavailable in this browser.');
    var synthesis = env.speechSynthesis, stopped = false, utterance = null, waiting = false, timer = null;
    var schedule = (env.setTimeout || setTimeout).bind(env), unschedule = (env.clearTimeout || clearTimeout).bind(env);
    var text = String(options.text || '').replace(/\*[^*]*\*/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    function voices() { return typeof synthesis.getVoices === 'function' ? synthesis.getVoices() : []; }
    function clearWait() {
      unschedule(timer); timer = null;
      if (waiting) synthesis.removeEventListener('voiceschanged', voicesReady);
      waiting = false;
    }
    function fail(message) {
      if (stopped) return;
      stopped = true; clearWait(); options.onError(new Error(message));
    }
    function play(voice) {
      if (stopped || utterance) return;
      clearWait();
      utterance = new env.SpeechSynthesisUtterance(text);
      utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 1; utterance.pitch = 1;
      utterance.onend = function () { if (!stopped) { stopped = true; options.onEnded(); } };
      utterance.onerror = function () { fail('Patient audio could not play. Pause and choose another voice, then resume.'); };
      if (options.onVoice) options.onVoice(voice);
      try { synthesis.cancel(); synthesis.speak(utterance); }
      catch (_) { fail('Patient audio could not play. Pause and choose another voice, then resume.'); }
    }
    function voicesReady() { var voice = selectVoice(voices()); if (voice) play(voice); }
    var selected = options.voice || selectVoice(voices());
    if (selected) play(selected);
    else if (!voices().length && typeof synthesis.addEventListener === 'function' && typeof synthesis.removeEventListener === 'function') {
      waiting = true;
      synthesis.addEventListener('voiceschanged', voicesReady);
      timer = schedule(function () { if (waiting && !utterance) fail('No conversational device voice is available yet. Load an English voice in your system settings, then reload this preview.'); }, 1500);
      voicesReady();
    } else fail('No conversational device voice is available. Load an English voice in your system settings, then reload this preview.');
    return {stop: function () {
      stopped = true; clearWait();
      if (utterance) { utterance.onend = utterance.onerror = null; synthesis.cancel(); }
    }};
  }

  // Hands an already-running recognizer to the turn controller so an
  // interruption keeps its first words. Only enabled explicitly for headphones.
  function createSpeechBridge(options) {
    var handoff = null, monitor = null;
    function report(value) { if (options.onMonitor) options.onMonitor(value); }
    function input(callbacks) {
      if (!handoff) return options.createInput(callbacks);
      var adopted = handoff; handoff = null;
      return adopted.takeInput(callbacks) || options.createInput(callbacks);
    }
    function speak(args) {
      if (!options.enabled()) return options.speak(args);
      if (!rhythm) throw new Error('The conversation rhythm helper is unavailable. Reload the local preview.');
      var microphone = null, audio = null, closed = false, transferring = false, playing = false;
      function stop() {
        if (closed) return;
        closed = true;
        if (audio) audio.stop();
        if (!transferring && microphone) microphone.stop();
        if (monitor === current) { monitor = null; report('off'); }
      }
      function fail(problem) {
        if (closed) return;
        stop(); args.onError(problem);
      }
      function transfer(finished) {
        if (closed || transferring) return;
        transferring = true;
        handoff = microphone;
        if (finished) { closed = true; monitor = null; report('off'); args.onEnded(); }
        else options.interrupt();
        // At the ten-turn endpoint there is no next capture to adopt this input.
        if (handoff === microphone) { handoff = null; microphone.stop(); }
      }
      var current = {interrupt: function () { transfer(false); }};
      monitor = current; report('starting');
      microphone = rhythm.createListener({createInput: options.createInput,
        onReady: function () {
          if (closed) return;
          report('listening');
          if (playing) return;
          playing = true;
          try {
            var created = options.speak({text: args.text,
              onHeardText: function (prefix) { if (!closed && args.onHeardText) args.onHeardText(prefix); },
              onEnded: function () { transfer(true); }, onError: fail});
            if (closed) created.stop(); else audio = created;
          } catch (problem) { fail(problem); }
        },
        onConnecting: function () { if (!closed) report('connecting'); },
        onAcknowledgment: function (result) { if (!closed && options.onAcknowledgment) options.onAcknowledgment(result); },
        onInterrupt: function () { transfer(false); }, onError: fail
      });
      microphone.start();
      return {stop: stop};
    }
    return {input: input, speak: speak, interrupt: function () {
      if (monitor) monitor.interrupt(); else options.interrupt();
    }};
  }

  var LIVE_CASES = [
    {id:'sp_depression_gated_si_001',name:'Dana',slug:'dana',voice:'Marin',practice:'Practice opening a depression interview and asking about safety directly.'},
    {id:'sp_mania_redirect_001',name:'Marcus',slug:'marcus',voice:'Cedar',practice:'Practice calm, validating redirection while keeping a pressured conversation focused.'},
    {id:'sp_psychosis_paranoid_001',name:'Ray',slug:'ray',voice:'Cedar',practice:'Practice building trust and asking about unusual experiences without arguing with or agreeing with fearful beliefs.'}
  ];
  function selectCase(pack,core,requestedId,live,localCases) {
    var id=requestedId===null||requestedId===undefined?LIVE_CASES[0].id:requestedId;
    var profile=LIVE_CASES.find(function(item){return item.id===id;});
    // A separate local registry never grants canonical cases reviewed status.
    if(!profile){
      var registry=localCases===undefined?nodeLocalCases:localCases;
      var draft=registry&&Array.isArray(registry.cases)&&registry.cases.find(function(item){return item.id===id;});
      var draftProfile=draft&&registry.profiles&&Object.prototype.hasOwnProperty.call(registry.profiles,id)&&registry.profiles[id];
      if(!draft||!draftProfile||!draft.persona||draft.persona.displayName!==draftProfile.name)throw new Error('This practice case is not supported. Choose an available live practice case.');
      if(!live)throw new Error('This case is available only in the live local preview. The prerecorded version contains Dana only.');
      return {patient:draft,slug:draftProfile.slug,voice:draftProfile.voice==='marin'?'Marin':draftProfile.voice,practice:draftProfile.practice,localDraft:true};
    }
    if(!live&&id!==LIVE_CASES[0].id)throw new Error('This case is available only in the live local preview. The prerecorded version contains Dana only.');
    var selected=pack.cases.find(function(item){return item.id===id;});
    if(!selected||!core.isCaseReviewed(selected)||!selected.persona||selected.persona.displayName!==profile.name)throw new Error('The selected reviewed practice case is unavailable.');
    return {patient:selected,slug:profile.slug,voice:profile.voice,practice:profile.practice};
  }
  function mount(options) {
    var env = options.window, doc = env.document, core = options.core, pack = options.pack;
    var container = options.root;
    var selected;
    var localCases=env.SPInterviewLocalCases||nodeLocalCases;
    try { selected=selectCase(pack,core,new URL(env.location.href).searchParams.get('case'),options.live===true,localCases); }
    catch(problem) {
      doc.title='Practice case unavailable';container.replaceChildren();
      var unavailable=doc.createElement('p');unavailable.id='conversation-case-error';unavailable.setAttribute('role','alert');unavailable.textContent=problem.message;container.appendChild(unavailable);
      var choose=doc.createElement('a');choose.href='./sp-interview.preview.html?danaConversation=1&danaLive=1';choose.textContent='Choose a reviewed live practice case';container.appendChild(choose);return null;
    }
    var localDana=env.SPInterviewLocalDana||nodeLocalDana;
    if(selected.patient.id==='sp_depression_gated_si_001'&&localDana){var reviewedDana=selected.patient;selected=Object.assign({},selected,{patient:localDana.applyCase(reviewedDana),localDraft:true});localDana.assertSpeechCompatible(reviewedDana,selected.patient);}
    var patient=selected.patient,displayName=patient.persona.displayName,voiceName=selected.voice;
    function caseText(value) { var neutral=patient.persona.pronouns==='they/them';var words={name:displayName,voice:voiceName,possessive:neutral?'their':displayName==='Dana'?'her':'his',object:neutral?'them':displayName==='Dana'?'her':'him'};return value.replace(/\{(name|voice|possessive|object)\}/g,function(_,key){return words[key];}); }
    var live = options.live === true ? env.SPInterviewLive.createClient(env,{caseId:patient.id,displayName:displayName}) : null, liveReady = !live;
    doc.title = caseText('Talk with {name} — local conversation prototype');
    container.innerHTML = caseText('<style>#root [hidden]{display:none!important}#root .eyebrow{padding-right:32px;font-size:.75rem;letter-spacing:.04em}#root .audiorail{flex-wrap:wrap}#conversation-log .msg{overflow-wrap:anywhere}#conversation-draft{overflow-wrap:anywhere}</style><header class="hdr"><p class="eyebrow">THE INTERVIEW ROOM · LOCAL PROTOTYPE</p><h1>Talk with {name}</h1><p class="lede">Start once. Ask your questions aloud. Take the time you need.</p></header>') +
      '<section class="card" id="conversation-case-chooser" hidden><label for="conversation-case-select">Choose a practice conversation</label><select class="cfgin" id="conversation-case-select" aria-describedby="conversation-case-practice conversation-case-review-status" style="max-width:100%;min-height:44px"></select><h2 id="conversation-case-title"></h2><p id="conversation-case-review-status" hidden></p><p id="conversation-case-practice"></p><h3>Your practice goal</h3><p id="conversation-case-goal"></p><h3>Before you meet</h3><p id="conversation-case-context"></p><p class="setting">Choose before starting. Clear and start over to choose another person afterward.</p></section>' +
      caseText('<section class="card" aria-label="About this prototype"><p><strong>Fictional practice · not enabled for learners.</strong> {name} uses the existing scripted case. This preview is for trying the conversation flow; it does not assess readiness.</p><p id="conversation-local-draft-status" class="setting" hidden><strong>LOCAL DRAFT · Faculty review pending.</strong> For local testing only; not enabled for learners.</p>') +
      caseText('<p id="speech-disclosure">Starting enables your microphone and automatically sends completed questions to the scripted case. Your browser may send audio to its speech-recognition service. Patient replies use locally stored AI-generated {voice} recordings when available, or your selected device voice. Do not use real-patient information. This page does not save learner audio or conversation text.</p>') +
      caseText('<label for="dana-audio-source">Voice playback</label><select id="dana-audio-source" class="cfgin" style="max-width:100%;min-height:44px"><option id="dana-recorded-option" value="recorded" disabled>{voice} — local recordings</option><option value="device" selected>Device voice</option></select><p id="dana-recordings-status" class="setting" aria-live="polite">Checking for {name}’s local recordings…</p>') +
      caseText('<div id="dana-device-voices"><label for="dana-voice">{name}’s voice</label><select id="dana-voice" class="cfgin" style="max-width:100%;min-height:44px" aria-describedby="dana-voice-help"><option value="">Loading device voices…</option></select>') +
      '<p id="dana-voice-help" class="setting">Choose a voice, then listen before starting. These are synthetic device voices; quality depends on the voices installed on your computer.</p></div>' +
      '<div class="actions"><button class="btn" id="dana-voice-preview">Preview voice</button><button class="btn ghost" id="dana-voice-stop" hidden>Stop preview</button></div><p id="dana-voice-status" class="setting" aria-live="polite"></p>' +
      '<label style="display:flex;align-items:center;gap:12px;min-height:44px"><input id="thinking-time" type="checkbox"> Give me more thinking time</label>' +
      caseText('<p id="thinking-help" class="setting">{name} waits 4.5 seconds after your last words, or 6 seconds with extra thinking time. Pauses never affect feedback.</p>') +
      caseText('<label style="display:flex;align-items:center;gap:12px;min-height:44px"><input id="dana-spoken-interruptions" type="checkbox"> Let me interrupt {name} by speaking (use headphones)</label>') +
      caseText('<p class="setting">With headphones, the microphone can stay on while {name} speaks. Brief acknowledgments such as “mm-hmm” let {object} continue; a question or fuller response interrupts. With speakers, {possessive} voice may be picked up as yours; use Interrupt {name} instead.</p></section>') +
      '<section class="card" aria-label="Conversation controls"><div class="audiorail"><strong id="conversation-status" role="status" aria-live="polite">Ready to start</strong><span id="conversation-count">0 of 10 turns</span></div>' +
      caseText('<p id="conversation-hint">{name} will give you time to finish. You can hold your turn or interrupt {object} when you need.</p><p id="conversation-error" role="alert" hidden></p>') +
      caseText('<div class="actions"><button class="btn primary" id="conversation-start" aria-describedby="speech-disclosure">Start conversation</button><button class="btn" id="conversation-pause" hidden>Pause</button><button class="btn primary" id="conversation-resume" hidden>Resume</button><button class="btn" id="conversation-done" aria-keyshortcuts="Space" hidden>Done speaking<span aria-hidden="true"> · Space</span></button><button class="btn" id="conversation-interrupt" aria-keyshortcuts="Escape" hidden>Interrupt {name}<span aria-hidden="true"> · Esc</span></button><button class="btn ghost" id="conversation-end" hidden>End encounter</button></div>') +
      '<button class="btn" id="conversation-repair" hidden>Repair a misunderstanding</button>' +
      '<div id="conversation-bookmark-controls" hidden><div class="actions"><button class="btn" id="conversation-bookmark" aria-keyshortcuts="Alt+Shift+B" aria-describedby="conversation-bookmark-help" disabled>Bookmark an exchange</button><span id="conversation-bookmark-count">0 bookmarked</span></div><p id="conversation-bookmark-help" class="setting">Mark the latest submitted exchange for reflection afterward. This keeps the conversation going. Shortcut: Alt + Shift + B (Option + Shift + B on Mac), outside a control.</p><p id="conversation-bookmark-status" role="status" aria-live="polite" class="setting"></p></div>' +
      '<label id="conversation-hold-label" hidden style="display:flex;align-items:center;gap:12px;min-height:44px"><input id="conversation-hold" type="checkbox"> Hold my turn</label><p id="conversation-hold-help" class="setting" hidden>Keep listening without sending. Uncheck when ready, choose Done speaking, or press Space outside a control.</p>' +
      caseText('<div id="conversation-recovery" hidden><p>Voice preview only checks {name}’s playback. For microphone problems, try this link in Chrome and allow microphone access. A new tab starts a separate encounter.</p>') +
      '<label for="conversation-link">Conversation link</label><input id="conversation-link" class="cfgin" type="url" readonly style="width:100%;box-sizing:border-box">' +
      '<button class="btn" id="conversation-copy-link">Copy conversation link</button><p id="conversation-copy-status" class="setting" aria-live="polite"></p></div>' +
      '<p id="conversation-draft" aria-label="Words being recognized"></p></section>' +
      caseText('<section class="card" id="conversation-repair-card" aria-labelledby="conversation-repair-title" hidden><h2 id="conversation-repair-title" tabindex="-1">Repair a misunderstanding</h2><p>The microphone is paused. Take a moment to check what you understood.</p><h3>{name}’s completed words</h3><blockquote id="conversation-repair-heard"></blockquote><p id="conversation-repair-source" class="setting"></p><p>An example opener: <q>I think I misunderstood. Let me check…</q></p><p>Use your own words to check your understanding and invite {name} to clarify. Your next spoken turn continues this conversation as usual. This practice is not scored.</p><div class="actions"><button class="btn primary" id="conversation-repair-continue">Continue speaking</button><button class="btn" id="conversation-repair-dismiss">Dismiss repair</button></div></section>') +
      '<section class="card"><h2>Conversation</h2><div id="conversation-log" role="log" aria-live="off" aria-label="Conversation transcript"></div></section>' +
      caseText('<section class="card" id="conversation-bookmarks" aria-labelledby="conversation-bookmarks-title" hidden><h2 id="conversation-bookmarks-title" tabindex="-1">Moments you bookmarked</h2><p>Revisit what stood out before looking at the teaching points. Your reflections are optional, stay on this page, and disappear when you clear or leave it.</p><p id="conversation-bookmark-retry-help">Try this moment again opens the microphone for one spoken alternative from just before that question, using {name}’s live AI voice. Choose one exchange for this encounter. Your original conversation and notes stay unchanged; there is no score.</p><div id="conversation-bookmark-list"></div></section>') +
      caseText('<section class="card" id="conversation-reflection" hidden><h2>Before your debrief</h2><div id="conversation-self-assessment"></div><p>This timing prototype does not grade fluency, pauses, or speaking speed. Bring your reflections to supervision.</p><button class="btn" id="conversation-reflect">Show {name}’s teaching points</button><div id="conversation-teaching" hidden></div></section>') +
      '<section class="card" id="conversation-retry" hidden><p>Preparing your conversation for reflection…</p></section><div id="conversation-finished-controls" hidden><button class="btn" id="conversation-clear">Clear and start over</button><p>Clear empties this page and requests deletion of this encounter and its alternative. If the connection is unavailable, the temporary server copy expires after 30 minutes.</p></div>' +
      '<p><a href="./sp-interview.preview.html">Use the usual Interview Room with typing</a></p>';
    var element = function (id) { return doc.getElementById(id); };
    element('conversation-local-draft-status').hidden = !selected.localDraft;
    var caseSelect = element('conversation-case-select'), caseLocked = false;
    if (live) {
      element('conversation-case-chooser').hidden = false;
      LIVE_CASES.forEach(function (profile) {
        var item=pack.cases.find(function (c) {return c.id===profile.id;}), option=doc.createElement('option');
        option.value=profile.id;option.textContent=item?item.title:profile.name;option.disabled=!item||!core.isCaseReviewed(item);caseSelect.appendChild(option);
      });
      if(localCases&&Array.isArray(localCases.cases))localCases.cases.forEach(function(item){
        if(LIVE_CASES.some(function(profile){return profile.id===item.id;}))return;
        try {selectCase(pack,core,item.id,true,localCases);} catch(_){return;}
        var option=doc.createElement('option');option.value=item.id;option.textContent=item.title+' · local draft';caseSelect.appendChild(option);
      });
      caseSelect.value=patient.id;
      element('conversation-case-title').textContent=patient.title;
      element('conversation-case-goal').textContent=patient.learnerGoal;
      element('conversation-case-context').textContent=patient.persona.presentingContext;
      element('conversation-case-practice').textContent=selected.practice;
      if(selected.localDraft){element('conversation-case-review-status').hidden=false;element('conversation-case-review-status').textContent='LOCAL DRAFT · Faculty review pending. For local testing only; not enabled for learners.';}
      doc.title = caseText('Talk with {name} — live local prototype');
      container.querySelector('.eyebrow').textContent = 'THE INTERVIEW ROOM · LIVE LOCAL PROTOTYPE';
      container.querySelector('[aria-label="About this prototype"] p').textContent = caseText('Live fictional practice · not enabled for learners. {name} generates new replies from {possessive} existing case and this conversation. This experimental mode does not assess readiness.');
      element('speech-disclosure').textContent = caseText('Starting enables your microphone. Your browser may send audio to its recognition service. Recognized words and conversation context go to OpenAI for live replies, spoken with AI-generated {voice} audio. This uses API credits and adds a short response wait. The local server temporarily retains the encounter in memory for reflection and one alternative, expiring after 30 minutes. Clear or leaving this page requests deletion; if the connection is unavailable, the server copy remains until it expires. This page does not use persistent storage. Do not use real-patient information.');
      var liveOption = doc.createElement('option'); liveOption.value = 'live'; liveOption.textContent = caseText('{voice} — live generated replies');
      element('dana-audio-source').appendChild(liveOption); element('dana-audio-source').value = 'live';
      var fallback = doc.createElement('p'), fallbackLink = doc.createElement('a');
      fallbackLink.href = './sp-interview.preview.html?danaConversation=1'; fallbackLink.textContent = displayName==='Dana'?'Use the prerecorded practice version':'Use Dana’s prerecorded practice version'; fallback.appendChild(fallbackLink);
      container.querySelector('[aria-label="About this prototype"]').appendChild(fallback);
    }
    var status = element('conversation-status'), count = element('conversation-count'), hint = element('conversation-hint');
    var error = element('conversation-error'), draft = element('conversation-draft'), log = element('conversation-log');
    var start = element('conversation-start'), pause = element('conversation-pause'), resume = element('conversation-resume');
    var done = element('conversation-done'), end = element('conversation-end'), thinking = element('thinking-time');
    var hold = element('conversation-hold'), interrupt = element('conversation-interrupt'), spokenInterruptions = element('dana-spoken-interruptions');
    var micMonitor = 'off';
    var voiceSelect = element('dana-voice'), previewVoice = element('dana-voice-preview'), stopVoice = element('dana-voice-stop'), voiceStatus = element('dana-voice-status');
    var audioSource = element('dana-audio-source'), devicePanel = element('dana-device-voices'), recordingsStatus = element('dana-recordings-status');
    var recovery = element('conversation-recovery'), conversationLink = element('conversation-link'), copyStatus = element('conversation-copy-status');
    conversationLink.value = new URL('./sp-interview.preview.html?danaConversation=1' + (live ? '&danaLive=1&case='+encodeURIComponent(patient.id) : ''), env.location.href).href;
    element('conversation-copy-link').onclick = function () {
      conversationLink.focus(); conversationLink.select();
      if (!env.navigator.clipboard || !env.navigator.clipboard.writeText) { copyStatus.textContent = 'The link is selected. Copy it and paste it into Chrome.'; return; }
      env.navigator.clipboard.writeText(conversationLink.value).then(function () {
        copyStatus.textContent = 'Conversation link copied. Paste it into Chrome.';
      }).catch(function () { copyStatus.textContent = 'The link is selected. Copy it and paste it into Chrome.'; });
    };
    var chosenVoice = null, choices = [], previewHandle = null, previewGeneration = 0;
    var recordings = null, sourceChosen = false, disposed = false;
    var retryView = null, retryActive = false, finishStarted = false, retryPreparation = 'pending';
    var liveStarting = false, startupHidden = false, startWaitForResume = false;
    var repairOpen = false;
    var bookmarks = live ? env.SPInterviewBookmarks.createStore() : null;
    var bookmarkDebriefShown = false;
    var provider = live ? null : env.SPInterviewResponses.createProvider(core), session = provider ? provider.start(patient, {difficulty: 'supported'}) : null;
    var lastTranscript = '', lastPhase = 'idle';
    caseSelect.onchange = function () {
      if (!live || disposed || doc.hidden || caseLocked || liveStarting || lastPhase!=='idle') {caseSelect.value=patient.id;return;}
      try {selectCase(pack,core,caseSelect.value,true,localCases);} catch(problem) {caseSelect.value=patient.id;error.hidden=false;error.textContent=problem.message;return;}
      stopPreview();
      var next=new URL(env.location.href);next.searchParams.set('case',caseSelect.value);
      env.location.assign(next.href);
    };
    function conversationActive(phase) { return ['starting','listening','finalizing','awaiting_patient','speaking'].indexOf(phase) >= 0; }
    function hasSpeechInput() { return !!(env.SpeechRecognition || env.webkitSpeechRecognition); }
    function hasDeviceSpeech() { return !!(env.speechSynthesis && env.SpeechSynthesisUtterance); }
    function hasPlayback() { return live ? liveReady && !!recordings : audioSource.value === 'recorded' ? !!recordings : hasDeviceSpeech(); }
    function hasPreview() { return live ? !!recordings : audioSource.value === 'recorded' ? !!recordings : hasDeviceSpeech() && !!choices.length; }
    function updateVoiceControls() {
      var active = conversationActive(lastPhase) || retryActive || liveStarting || startWaitForResume || repairOpen;
      caseSelect.disabled=caseLocked||liveStarting||startWaitForResume||lastPhase!=='idle';
      devicePanel.hidden = audioSource.value !== 'device';
      audioSource.disabled = !!live || active || !!previewHandle;
      spokenInterruptions.disabled = active || !hasSpeechInput();
      thinking.disabled = retryActive;
      voiceSelect.disabled = active || !choices.length;
      previewVoice.disabled = active || !hasPreview() || !!previewHandle;
      start.disabled = liveStarting || !hasSpeechInput() || !hasPlayback();
      resume.disabled = !hasSpeechInput() || !hasPlayback();
    }
    function describeVoice() {
      voiceStatus.textContent = live ? caseText('{voice} · live AI voice. The opening preview uses the existing recording and does not start the microphone.') : audioSource.value === 'recorded' ? caseText('{voice} · prerecorded AI voice. Previewing does not start the microphone.') :
        chosenVoice ? chosenVoice.name + ' selected. Previewing does not start the microphone.' : 'Waiting for an English device voice. You may need to install one in your system settings.';
    }
    function stopPreview() {
      previewGeneration += 1;
      if (previewHandle) previewHandle.stop();
      previewHandle = null; stopVoice.hidden = true;
      updateVoiceControls();
    }
    function refreshVoices() {
      if (conversationActive(lastPhase)) return;
      var list = env.speechSynthesis && typeof env.speechSynthesis.getVoices === 'function' ? env.speechSynthesis.getVoices() : [];
      choices = availableVoices(list); chosenVoice = selectVoice(list, voiceSelect.value);
      voiceSelect.replaceChildren();
      choices.forEach(function (voice, index) {
        var option = doc.createElement('option'); option.value = voiceKey(voice);
        option.textContent = voice.name + ' — ' + voice.lang + (index === 0 ? ' · suggested' : ''); voiceSelect.appendChild(option);
      });
      if (chosenVoice) voiceSelect.value = voiceKey(chosenVoice);
      else { var pending = doc.createElement('option'); pending.textContent = 'No English device voice loaded'; voiceSelect.appendChild(pending); }
      updateVoiceControls(); describeVoice();
    }
    function render(snapshot) {
      var phase = snapshot.phase, active = conversationActive(phase);
      var names = {idle:'Ready to start',starting:'Starting microphone — wait for Listening',listening:'Listening',finalizing:'Finishing your question',awaiting_patient:caseText('{name} is responding'),speaking:caseText('{name} is speaking'),paused:'Paused — microphone off',ended:'Encounter complete — microphone off',error:'Voice needs your attention — microphone off'};
      status.textContent = names[phase] || phase;
      count.textContent = snapshot.turnCount + ' of 10 turns';
      if (phase === 'speaking' && spokenInterruptions.checked) {
        status.textContent = micMonitor === 'listening' ? caseText('{name} is speaking — listening for you') : micMonitor === 'connecting' ? caseText('{name} is speaking — reconnecting microphone') : caseText('Connecting microphone — {name} will wait');
      }
      hint.textContent = phase === 'starting' ? 'If your browser asks, allow microphone access. Wait for Listening before speaking.' :
        phase === 'listening' ? (snapshot.holdTurn ? 'Your turn is held. Keep speaking or thinking; choose Done speaking or press Space outside a control when ready.' : snapshot.thinkingTime ? caseText('Take your time. {name} waits 6 seconds after your last words. Press Space outside a control to finish sooner.') : caseText('{name} waits 4.5 seconds after your last words. Press Space outside a control to finish sooner, or hold your turn for a longer pause.')) :
        phase === 'speaking' ? (spokenInterruptions.checked ? (micMonitor === 'listening' ? caseText('Brief acknowledgments let {name} continue. Speak a question or fuller response to interrupt. Keep your headphones on. You can also press Escape outside a control.') : caseText('Waiting for microphone access. You can also choose Interrupt {name} or press Escape outside a control.')) : caseText('Choose Interrupt {name}, or press Escape outside a control, then speak when Listening appears.')) :
        phase === 'awaiting_patient' ? caseText('{name} is finding {possessive} response. To cancel {possessive} reply and continue your thought, choose Interrupt {name} or press Escape outside a control.') : 'Pause or end whenever you need. Pauses and speaking speed are never graded.';
      error.hidden = !snapshot.error; error.textContent = snapshot.error ? (snapshot.error.message || String(snapshot.error)) : '';
      recovery.hidden = phase !== 'error' && hasSpeechInput();
      draft.textContent = snapshot.interim || snapshot.draft || '';
      start.hidden = phase !== 'idle'; pause.hidden = !active; resume.hidden = phase !== 'paused' && phase !== 'error';
      if (repairOpen) resume.hidden = true;
      element('conversation-repair').hidden = !canRepair(snapshot);
      updateBookmarks(snapshot);
      done.hidden = phase !== 'listening';
      hold.checked = snapshot.holdTurn;
      element('conversation-hold-label').hidden = !active; element('conversation-hold-help').hidden = !active;
      interrupt.hidden = phase !== 'speaking' && phase !== 'awaiting_patient';
      end.hidden = phase === 'idle' || phase === 'ended';
      if (startWaitForResume && phase === 'idle') {
        status.textContent = 'Conversation ready — microphone off';
        hint.textContent = caseText('You left the page while {name} was connecting. Return to this page and choose Resume when you are ready.');
        start.hidden = true; resume.hidden = false; end.hidden = false;
      }
      var transcript = snapshot.transcript || [], serialized = JSON.stringify(transcript);
      if (serialized !== lastTranscript) {
        lastTranscript = serialized; log.replaceChildren();
        transcript.forEach(function (turn) {
          var row = doc.createElement('p'), label = doc.createElement('strong');
          row.className = 'msg ' + (turn.who === 'pt' ? 'pt' : 'me');
          label.textContent = turn.who === 'pt' ? caseText('{name}: ') : 'You: '; row.appendChild(label);
          row.appendChild(doc.createTextNode(turn.text));
          if (turn.responseStatus) {
            var responseNotices = {pending: caseText('{name} is preparing a reply.'), cancelled: caseText('{name}’s reply was cancelled before it started.'), failed: caseText('{name}’s reply could not be prepared.')};
            if (responseNotices[turn.responseStatus]) {
              var responseNotice = doc.createElement('span');
              responseNotice.className = 'response-notice';
              responseNotice.textContent = ' [' + responseNotices[turn.responseStatus] + ']';
              row.appendChild(responseNotice);
            }
          }
          if (turn.playbackStatus === 'interrupted' || turn.playbackStatus === 'failed') row.appendChild(doc.createTextNode(turn.heardText ? ' [Completed portion remembered: “' + turn.heardText + '”. The full generated reply is shown above.]' : turn.playbackStatus === 'interrupted' ? ' [Playback interrupted; complete reply shown above.]' : ' [Playback did not finish.]'));
          log.appendChild(row);
        });
      }
      if (phase === 'ended' && lastPhase !== 'ended') {
        if (live && !disposed) finishOriginal(snapshot);
        element('conversation-reflection').hidden = false;
        var assessment = element('conversation-self-assessment');
        ['What was this patient most afraid of?', 'What do you wish you had asked?', 'Your one-line problem representation.'].forEach(function (question, index) {
          var label = doc.createElement('label'), field = doc.createElement('textarea');
          field.id = 'conversation-reflection-' + index; field.className = 'cfgin'; field.maxLength = 1200;
          label.htmlFor = field.id; label.textContent = question;
          assessment.appendChild(label); assessment.appendChild(field);
        });
        element('conversation-reflect').disabled = true;
        assessment.oninput = function () {
          element('conversation-reflect').disabled = !Array.prototype.every.call(assessment.querySelectorAll('textarea'), function (field) { return field.value.trim(); });
        };
        assessment.querySelector('textarea').focus();
      }
      if (phase !== lastPhase && (phase === 'paused' || phase === 'error') && !repairOpen) resume.focus();
      var becameInactive = !active && conversationActive(lastPhase);
      lastPhase = phase;
      if (becameInactive) refreshVoices();
      updateVoiceControls();
      if (typeof options.onState === 'function') options.onState(snapshot);
    }
    function repairMoment(snapshot) {
      if (!snapshot.turnCount) return null;
      var transcript = snapshot.transcript || [];
      for (var i = transcript.length - 1; i > 0; i--) {
        var turn = transcript[i];
        if (turn.who !== 'pt') continue;
        if (turn.playbackStatus === 'played') return {text: turn.text, complete: true};
        if (turn.heardText && turn.text.indexOf(turn.heardText) === 0) return {text: turn.heardText, complete: false};
        return null;
      }
      return null;
    }
    function canRepair(snapshot) {
      return !!live && !disposed && !repairOpen && !snapshot.speechDetected && snapshot.phase === 'listening' && !snapshot.draft && !snapshot.interim && !snapshot.caption && !!repairMoment(snapshot);
    }
    function updateBookmarks(snapshot) {
      if (!bookmarks || disposed) return;
      bookmarks.sync(snapshot);
      var entries = bookmarks.entries(), candidate = bookmarks.candidate(snapshot);
      var marked = candidate && entries.some(function (entry) { return entry.id === candidate.id; });
      var button = element('conversation-bookmark');
      element('conversation-bookmark-controls').hidden = snapshot.phase === 'idle' || snapshot.phase === 'ended';
      button.disabled = !candidate || marked;
      button.textContent = !candidate ? 'Bookmark an exchange' : marked ? 'Exchange ' + candidate.id + ' bookmarked' : 'Bookmark exchange ' + candidate.id;
      element('conversation-bookmark-count').textContent = entries.length + ' bookmarked';
      if (snapshot.phase === 'ended' && entries.length && !bookmarkDebriefShown) {
        bookmarkDebriefShown = true;
        renderBookmarkDebrief();
      }
    }
    function bookmarkExchange() {
      if (!bookmarks || disposed || doc.hidden) return false;
      var snapshot = controller.getSnapshot();
      if (snapshot.phase === 'idle' || snapshot.phase === 'ended') return false;
      var result = bookmarks.add(snapshot);
      if (!result.entry) return false;
      updateBookmarks(snapshot);
      element('conversation-bookmark-status').textContent = result.added ? 'Exchange ' + result.entry.id + ' bookmarked for your debrief. Keep going.' : 'Exchange ' + result.entry.id + ' is already bookmarked.';
      return true;
    }
    function renderBookmarkDebrief() {
      var host = element('conversation-bookmarks'), list = element('conversation-bookmark-list');
      host.hidden = false; list.replaceChildren();
      var entries = bookmarks.entries();
      if (!entries.length) {
        var empty = doc.createElement('p'); empty.textContent = 'No bookmarked moments remain. Your conversation is still above.'; list.appendChild(empty);
      }
      entries.forEach(function (entry) {
        var article = doc.createElement('article'), title = doc.createElement('h3');
        article.dataset.bookmarkId = entry.id;
        article.style.cssText = 'border-top:1px solid var(--line,#ded5c9);padding-top:16px;margin-top:20px';
        title.textContent = 'Exchange ' + entry.id; article.appendChild(title);
        var learner = doc.createElement('p'), learnerLabel = doc.createElement('strong');
        learner.className = 'bookmark-learner'; learnerLabel.textContent = 'You: '; learner.appendChild(learnerLabel); learner.appendChild(doc.createTextNode(entry.learnerText)); article.appendChild(learner);
        var danaWords = doc.createElement('blockquote'); danaWords.className = 'bookmark-dana';
        danaWords.textContent = entry.danaText || 'No completed audio segment is available for this reply.'; article.appendChild(danaWords);
        var note = doc.createElement('p'); note.className = 'setting bookmark-playback-note';
        note.textContent = entry.playbackStatus === 'played' ? caseText('{name}’s reply finished playing.') : entry.danaText ? caseText('Only {name}’s verified completed words are shown. The rest did not finish playing.') : entry.playbackStatus === 'cancelled' ? caseText('{name}’s reply was cancelled. No unheard words are included.') : 'Playback did not finish a verified segment. You may have heard part of it; unheard words are not included.';
        article.appendChild(note);
        var retryButton = doc.createElement('button'), retryStatus = doc.createElement('p');
        retryButton.id = 'conversation-bookmark-retry-' + entry.id; retryButton.className = 'btn bookmark-retry'; retryButton.textContent = 'Try this moment again';
        retryButton.setAttribute('aria-label', 'Try this moment again — exchange ' + entry.id);
        retryStatus.id = 'conversation-bookmark-retry-status-' + entry.id; retryStatus.className = 'setting bookmark-retry-status';
        retryButton.setAttribute('aria-describedby', 'conversation-bookmark-retry-help ' + retryStatus.id);
        retryButton.disabled = true;
        retryButton.onclick = function () { if (!disposed && !doc.hidden && retryView) retryView.startAt(entry.id); };
        article.appendChild(retryButton); article.appendChild(retryStatus);
        var label = doc.createElement('label'), field = doc.createElement('textarea');
        field.id = 'conversation-bookmark-reflection-' + entry.id; field.className = 'cfgin'; field.maxLength = 1200;
        field.style.cssText = 'width:100%;box-sizing:border-box;min-height:96px'; field.value = entry.reflection;
        label.htmlFor = field.id; label.textContent = 'What stood out, and what might you try next time? (Optional)';
        field.oninput = function () { bookmarks.setReflection(entry.id, field.value); };
        article.appendChild(label); article.appendChild(field);
        var remove = doc.createElement('button'); remove.className = 'btn ghost'; remove.textContent = 'Remove bookmark';
        remove.setAttribute('aria-label', 'Remove bookmark for exchange ' + entry.id);
        remove.onclick = function () {
          bookmarks.remove(entry.id); renderBookmarkDebrief();
          element('conversation-bookmark-count').textContent = bookmarks.entries().length + ' bookmarked';
          element('conversation-bookmarks-title').focus();
        };
        article.appendChild(remove); list.appendChild(article);
      });
      updateBookmarkRetryAvailability();
    }
    function updateBookmarkRetryAvailability() {
      if (!bookmarks || disposed) return;
      // Availability changes must not rebuild editable notes or move their focus.
      element('conversation-bookmark-list').querySelectorAll('article[data-bookmark-id]').forEach(function (article) {
        var id = Number(article.dataset.bookmarkId), button = article.querySelector('.bookmark-retry'), notice = article.querySelector('.bookmark-retry-status');
        if (!button || !notice) return;
        var availability = retryView ? retryView.availabilityAt(id) : null;
        button.disabled = !availability || !availability.canStart;
        notice.textContent = !availability ? (retryPreparation === 'failed' ? 'The alternative could not be prepared. Clear and start over to try a new encounter.' : 'Preparing the available moments…') :
          availability.reason === 'ready' ? 'Start your one spoken alternative from exchange ' + id + '.' :
          availability.reason === 'setup_failed' ? 'Setup did not finish. You can try this same exchange again.' :
          availability.reason === 'setup_failed_terminal' ? 'Alternative setup failed and has stopped. Clear and start over to try another encounter.' :
          availability.reason === 'preparing' ? 'Preparing this exchange. Wait for the microphone status below.' :
          availability.reason === 'locked' ? 'Exchange ' + availability.selectedTurnId + ' is selected for your one alternative. Another exchange cannot be started.' :
          availability.reason === 'used' ? 'The alternative for this encounter has already been started. Continue or reflect in the practice section below.' :
          availability.reason === 'hidden' ? 'Return to this page to start your alternative.' :
          'This exchange has no eligible question-and-reply moment to retry.';
      });
    }
    function clearBookmarks() {
      if (!bookmarks) return;
      bookmarks.clear(); bookmarkDebriefShown = false;
      element('conversation-bookmark-list').replaceChildren(); element('conversation-bookmarks').hidden = true;
      element('conversation-bookmark-controls').hidden = true;
      element('conversation-bookmark-status').textContent = ''; element('conversation-bookmark-count').textContent = '0 bookmarked';
    }
    function closeRepair() {
      repairOpen = false;
      element('conversation-repair-card').hidden = true;
      element('conversation-repair-heard').textContent = '';
      element('conversation-repair-source').textContent = '';
    }
    function finishOriginal(snapshot) {
      if (finishStarted) return;
      finishStarted = true;
      element('conversation-finished-controls').hidden = false;
      var retryHost = element('conversation-retry'); retryHost.hidden = false;
      retryHost.textContent = 'Preparing your available moments…';
      live.finish().then(function (finished) {
        if (disposed) return;
        if (!env.SPInterviewRetry) throw new Error('The alternative practice view is unavailable. Clear and start over to begin another encounter.');
        retryView = env.SPInterviewRetry.mount({env: env, container: retryHost, originalSnapshot: snapshot, displayName: displayName,
          retryTurnIds: finished.retryTurnIds, createRetry: function (turnId) { return live.createRetry(turnId); },
          createInput: function (callbacks) { return createSpeechInput(env, callbacks); },
          createBridge: function (bridgeOptions) { return createSpeechBridge(Object.assign({}, bridgeOptions, {enabled: function () { return spokenInterruptions.checked; }})); },
          isAllowedText: function (text) { return !core.looksLikePhi(text); },
          onAvailabilityChange: updateBookmarkRetryAvailability,
          onActive: function (active) { retryActive = active; if (active) stopPreview(); updateVoiceControls(); if (typeof options.onRetryActive === 'function') options.onRetryActive(active); }
        });
        retryPreparation = 'ready'; updateBookmarkRetryAvailability();
      }).catch(function () { if (!disposed) { retryPreparation = 'failed'; retryHost.textContent = 'Your conversation remains available above, but the alternative could not be prepared. Clear and start over to try a new encounter.'; updateBookmarkRetryAvailability(); } });
    }
    function speakReply(args) {
      var playbackSnapshot = live && controller ? controller.getSnapshot() : null;
      var encounterPlayback = playbackSnapshot && playbackSnapshot.phase === 'speaking';
      if (live && (args.text !== patient.persona.opening || (encounterPlayback && playbackSnapshot.turnCount > 0))) { voiceStatus.textContent = caseText('{voice} · speaking {name}’s live reply'); return live.speak(args); }
      if (live || audioSource.value === 'recorded') {
        if (!recordings) throw new Error(live?caseText('{name}’s opening recording is not available. Reload after the local recording is ready.'):caseText('{name}’s local recordings are not available. Choose Device voice to continue.'));
        voiceStatus.textContent = caseText('{voice} · playing a local recording');
        if (live && encounterPlayback && playbackSnapshot.turnCount === 0) {
          return recordings.speak({text: args.text, onError: args.onError, onEnded: function () {
            var current = controller.getSnapshot();
            if (current.phase === 'speaking' && current.turnCount === 0) live.openingPlayed();
            args.onEnded();
          }});
        }
        return recordings.speak(args);
      }
      return createSpeaker(env, {text: args.text, voice: chosenVoice, onEnded: args.onEnded, onError: args.onError,
        onVoice: function (voice) { chosenVoice = voice; voiceStatus.textContent = voice.name + ' · synthetic device voice'; }});
    }
    var bridge = createSpeechBridge({
      enabled: function () { return spokenInterruptions.checked; },
      createInput: function (callbacks) { return createSpeechInput(env, callbacks); },
      speak: speakReply,
      interrupt: function () { controller.interrupt(); },
      onMonitor: function (state) { micMonitor = state; if (controller) render(controller.getSnapshot()); }
    });
    var controller = env.SPInterviewTurns.createController({
      opening: patient.persona.opening,
      input: bridge.input,
      speak: bridge.speak,
      respond: function (text, requestOptions) {
        if (core.looksLikePhi(text)) return Promise.reject(new Error('Possible real-patient information detected. End this preview and restart using fictional practice only.'));
        if (live) {
          return live.respond(text, {signal: requestOptions.signal, turnId: controller.getSnapshot().turnCount});
        }
        return provider.respond(session, text);
      },
      onChange: render
    });
    start.onclick = async function () {
      if (disposed || doc.hidden || liveStarting || startWaitForResume || controller.getSnapshot().phase!=='idle') return;
      sourceChosen = true; stopPreview();
      if (live) {
        liveStarting = true; startupHidden = doc.hidden; updateVoiceControls(); status.textContent = caseText('Connecting live {name}…');
        try { await live.start(); } catch (problem) {
          liveStarting = false;
          error.hidden = false; error.textContent = problem.message; status.textContent = caseText('Live {name} could not start'); updateVoiceControls(); return;
        }
        caseLocked=true;
        liveStarting = false;
        if (disposed) return;
        if (startupHidden || doc.hidden) { startWaitForResume = true; render(controller.getSnapshot()); return; }
      }
      controller.start();
    };
    pause.onclick = function () { stopPreview(); controller.pause(); };
    resume.onclick = function () { if (doc.hidden) return; stopPreview(); if (startWaitForResume) { startWaitForResume = false; controller.start(); } else controller.resume(); };
    function finishQuestion() {
      if (controller.doneSpeaking()) return;
      var snapshot = controller.getSnapshot();
      if (snapshot.phase !== 'listening') return;
      status.textContent = snapshot.interim ? 'Listening — finishing your words' : 'Listening — no question yet';
      hint.textContent = snapshot.interim ? 'Your words are still being recognized. Wait for them to finish, then press Space or choose Done speaking.' : 'Speak your question first, then press Space or choose Done speaking.';
    }
    done.onclick = finishQuestion;
    element('conversation-bookmark').onclick = bookmarkExchange;
    element('conversation-repair').onclick = function () {
      var snapshot = controller.getSnapshot();
      if (doc.hidden || !canRepair(snapshot)) return;
      var moment = repairMoment(snapshot);
      repairOpen = true;
      if (!controller.pause()) { closeRepair(); return; }
      element('conversation-repair-heard').textContent = moment.text;
      element('conversation-repair-source').textContent = moment.complete ? caseText('From {name}’s latest reply that finished playing.') : 'Only the verified completed portion is shown; the rest did not finish playing.';
      element('conversation-repair-card').hidden = false;
      element('conversation-repair-title').focus();
    };
    element('conversation-repair-continue').onclick = function () {
      if (disposed || doc.hidden || !repairOpen || controller.getSnapshot().phase !== 'paused') return;
      closeRepair(); controller.resume();
    };
    element('conversation-repair-dismiss').onclick = function () {
      if (!repairOpen) return;
      closeRepair(); render(controller.getSnapshot());
      hint.textContent = 'Repair card closed. The microphone remains off. Choose Resume when you are ready.';
      if (!doc.hidden) resume.focus();
    };
    hold.onchange = function () { controller.setHoldTurn(hold.checked); };
    interrupt.onclick = function () { bridge.interrupt(); };
    doc.addEventListener('keydown', function (event) {
      if (disposed || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return;
      var target = event.target;
      if (target && (target.isContentEditable || (typeof target.closest === 'function' && target.closest('input,textarea,select,button,a,[contenteditable],[role="button"],[role="textbox"],[role="combobox"],[role="checkbox"],[role="switch"],[role="slider"],[role="spinbutton"]')))) return;
      if (event.code === 'KeyB' && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
        if (bookmarkExchange()) event.preventDefault();
        return;
      }
      if ((event.code !== 'Space' && event.code !== 'Escape') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      var phase = controller.getSnapshot().phase;
      if (event.code === 'Space' && phase === 'listening') { event.preventDefault(); finishQuestion(); }
      else if (phase === 'speaking' || phase === 'awaiting_patient') {
        event.preventDefault();
        if (event.code === 'Escape') bridge.interrupt();
        else hint.textContent = phase === 'awaiting_patient' ? caseText('Your question is already sent. {name} is preparing {possessive} reply. Press Escape or choose Interrupt {name} only if you want to cancel it.') : caseText('{name} is speaking. Press Escape or choose Interrupt {name} if you want to interrupt {object}.');
      }
    });
    end.onclick = function () {
      startWaitForResume = false; closeRepair(); stopPreview();
      if (typeof options.beforeEnd === 'function' && options.beforeEnd(controller.getSnapshot()) === false) { controller.pause(); render(controller.getSnapshot()); return; }
      controller.end();
    };
    element('conversation-clear').onclick = async function () {
      if (!live || disposed) return;
      await disposeView(); env.location.reload();
    };
    audioSource.onchange = function () { sourceChosen = true; stopPreview(); updateVoiceControls(); describeVoice(); };
    voiceSelect.onchange = function () { sourceChosen = true; stopPreview(); chosenVoice = selectVoice(choices, voiceSelect.value); describeVoice(); };
    previewVoice.onclick = function () {
      sourceChosen = true; stopPreview(); var token = previewGeneration;
      voiceStatus.textContent = caseText('Playing {name}’s opening — microphone off.'); stopVoice.hidden = false; previewVoice.disabled = true;
      function finished(problem) {
        if (token !== previewGeneration) return;
        previewGeneration += 1; previewHandle = null; stopVoice.hidden = true; updateVoiceControls();
        voiceStatus.textContent = problem ? problem.message : 'Sample finished. ' + (live ? caseText('Live {voice} replies are selected.') : audioSource.value === 'recorded' ? caseText('{voice} recordings are selected.') : chosenVoice ? chosenVoice.name + ' is selected.' : '');
      }
      try {
        var handle = speakReply({text: patient.persona.opening, onEnded: function () { finished(); }, onError: finished});
        if (token === previewGeneration) { previewHandle = handle; updateVoiceControls(); }
      } catch (problem) { finished(problem); }
    };
    stopVoice.onclick = function () { stopPreview(); describeVoice(); };
    thinking.onchange = function () { controller.setThinkingTime(thinking.checked); };
    controller.setThinkingTime(thinking.checked);
    element('conversation-reflect').onclick = function () {
      var teaching = element('conversation-teaching'); teaching.hidden = false; teaching.replaceChildren();
      if (selected.localDraft && patient.id === 'sp_depression_gated_si_001') {
        var localTeaching = doc.createElement('p'); localTeaching.id = 'conversation-local-draft-teaching';
        localTeaching.textContent = 'Ask about suicide directly. A guarded response does not mean the question was wrong.';
        teaching.appendChild(localTeaching);
      }
      patient.debriefTeachingPoints.forEach(function (text) { var p = doc.createElement('p'); p.textContent = text; teaching.appendChild(p); });
      this.hidden = true;
    };
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) { if (liveStarting) startupHidden = true; if (repairOpen) { closeRepair(); render(controller.getSnapshot()); } stopPreview(); controller.pause(); } });
    function disposeView() {
      if (disposed) return;
      disposed = true; clearBookmarks(); closeRepair(); stopPreview(); if (retryView) retryView.dispose();
      if (typeof options.onDispose === 'function') options.onDispose();
      controller.end(); if (recordings) recordings.dispose();
      return live ? live.end() : undefined;
    }
    controller.dispose = disposeView;
    controller.retryAt = function (turnId) { return retryView && typeof retryView.startAt === 'function' ? retryView.startAt(Number(turnId)) : Promise.resolve(false); };
    env.addEventListener('pagehide', disposeView);
    if (env.speechSynthesis && typeof env.speechSynthesis.addEventListener === 'function') env.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    refreshVoices();
    render(controller.getSnapshot());
    if (!hasSpeechInput()) {
      start.disabled = true; error.hidden = false;
      status.textContent = 'Voice preview only — microphone input unavailable';
      error.textContent = caseText('This browser does not provide speech recognition. {name}’s voice preview still works. Open the conversation link in Chrome to try speaking, or use the usual Interview Room link below.');
    }
    if (env.SPInterviewRecordings) {
      var recordingPack=selected.localDraft&&patient.id!=='sp_depression_gated_si_001'?Object.assign({},pack,{cases:pack.cases.concat([patient])}):pack;
      var recordingOptions=live&&selected.slug!=='dana'?{pack:recordingPack,caseId:patient.id,openingOnly:true,url:'../../output/speech/voice-cases-v1/'+selected.slug+'/manifest.json'}:{pack:pack};
      env.SPInterviewRecordings.loadLibrary(env, recordingOptions).then(function (library) {
        if (disposed) { library.dispose(); return; }
        recordings = library; element('dana-recorded-option').disabled = false;
        recordingsStatus.textContent = live ? caseText('Opening recording ready. Each new reply is generated live in {voice}’s voice.') : caseText('{voice} recordings ready — ') + library.entryCount + ' scripted lines stored locally.';
        if (!live && !sourceChosen && lastPhase === 'idle' && !previewHandle) audioSource.value = 'recorded';
        updateVoiceControls(); describeVoice();
      }).catch(function () {
        if (disposed) return;
        recordingsStatus.textContent = live?caseText('{voice} opening recording is not available yet. Live conversation waits for this recording.'):caseText('{voice} recordings are not available yet. Device voice remains available.');
        updateVoiceControls();
      });
    } else recordingsStatus.textContent = live?caseText('{voice} opening recording is not available yet. Live conversation waits for this recording.'):caseText('{voice} recordings are not available yet. Device voice remains available.');
    if (live) {
      status.textContent = caseText('Checking live {name}…');
      live.health().then(function (available) {
        if (disposed) return; liveReady = available; updateVoiceControls();
        if (available) { if (lastPhase === 'idle' && !liveStarting && !startWaitForResume) status.textContent = caseText('Live {name} is ready'); }
        else { error.hidden = false; error.textContent = caseText('The live {name} server is unavailable. Reopen the live preview after the local server starts, or use the prerecorded practice link.'); status.textContent = caseText('Live {name} is unavailable'); }
      });
    }
    return controller;
  }
  return {createSpeechBridge: createSpeechBridge, createSpeechInput: createSpeechInput, createSpeaker: createSpeaker, availableVoices: availableVoices, selectVoice: selectVoice, selectCase: selectCase, mount: mount};
});
