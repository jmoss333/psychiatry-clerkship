/* One spoken alternative from a finished, in-memory Dana encounter. */
(function(root,factory){
  var localCases=null;
  if(typeof module==='object'&&module.exports){
    try{localCases=require('./sp-interview.local-cases.js');}
    catch(error){if(error.code!=='MODULE_NOT_FOUND'||error.message.indexOf("Cannot find module './sp-interview.local-cases.js'")!==0)throw error;}
  }
  var api=factory(localCases);if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SPInterviewRetry=api;
})(typeof window!=='undefined'?window:null,function(nodeLocalCases){
  'use strict';
  function moments(snapshot,eligible){
    var allowed=new Map((eligible||[]).map(function(id){return[String(id),id];})),result=[],turn=0,pending=null;
    (snapshot.transcript||[]).forEach(function(entry){
      if(entry.who==='me'){turn++;pending={turnId:allowed.get(String(turn)),question:entry.text};}
      else if(entry.who==='pt'&&pending){
        if(allowed.has(String(turn)))result.push({turnId:pending.turnId,question:pending.question,reply:entry.text,playbackStatus:entry.playbackStatus,heardText:entry.heardText||''});
        pending=null;
      }
    });
    return result.sort(function(a,b){return Number(b.playbackStatus==='played')-Number(a.playbackStatus==='played');});
  }
  function mount(options){
    var env=options.env,doc=env.document,host=options.container,choices=moments(options.originalSnapshot,options.retryTurnIds);
    var registry=env.SPInterviewLocalCases||nodeLocalCases;
    var draft=registry&&Array.isArray(registry.cases)&&registry.cases.find(function(patient){
      var profile=registry.profiles&&Object.prototype.hasOwnProperty.call(registry.profiles,patient.id)&&registry.profiles[patient.id];
      return profile&&patient.persona&&patient.persona.displayName===profile.name&&profile.name===options.displayName;
    });
    var displayName=['Dana','Marcus','Ray'].indexOf(options.displayName)>=0||draft?options.displayName:'Dana';
    function caseText(value){var words={name:displayName,possessive:draft?'their':displayName==='Dana'?'her':'his'};return value.replace(/\{(name|possessive)\}/g,function(_,key){return words[key];});}
    var disposed=false,child=null,controller=null,bridge=null,lockedTurnId=null,active=false;
    var setupInProgress=false,setupHidden=false,startDeferred=false,setupFailed=false,setupTerminal=false;
    host.innerHTML=caseText('<h2>Try one moment again</h2><p id="retry-disclosure">Try one different way of asking. {name} starts from just before your original question. Starting opens the microphone for one spoken alternative. This is not a score or a replacement for your first conversation.</p>')+
      '<label for="retry-moment">Choose a moment</label><select id="retry-moment" class="cfgin"></select>'+
      '<div class="retry-comparison" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px"><section><h3>Original moment</h3><p id="retry-original-question"></p><p id="retry-original-reply"></p><p id="retry-original-note" class="setting"></p></section><section><h3>Your alternative</h3><div id="retry-alternative" role="log" aria-live="off"></div></section></div>'+
      '<p id="retry-status" role="status" aria-live="polite" tabindex="-1">Choose a moment, then start when you are ready.</p><p id="retry-hint">You will have one spoken turn. No composer is needed.</p><p id="retry-error" role="alert" hidden></p>'+
      caseText('<button class="btn primary" id="retry-start" aria-describedby="retry-disclosure">Try that moment again</button><div id="retry-controls" hidden><div class="actions"><button class="btn" id="retry-done" aria-keyshortcuts="Space">Done speaking<span aria-hidden="true"> · Space</span></button><button class="btn" id="retry-interrupt" aria-keyshortcuts="Escape" hidden>Interrupt {name}<span aria-hidden="true"> · Esc</span></button><button class="btn" id="retry-pause">Pause</button><button class="btn" id="retry-resume" hidden>Resume</button><button class="btn ghost" id="retry-stop">Stop alternative</button></div>')+
      '<label><input id="retry-hold" type="checkbox"> Hold my turn</label><label style="display:block"><input id="retry-thinking" type="checkbox"> Give me more thinking time for this alternative</label><p id="retry-draft" aria-label="Alternative words being recognized"></p></div>'+
      '<div id="retry-reflection" hidden><label for="retry-reflection-text">What changed in your wording, and what did you notice?</label><textarea class="cfgin" id="retry-reflection-text" maxlength="1200" style="width:100%;box-sizing:border-box"></textarea><p>Compare the two moments in supervision. There is no ranking, winner, or fluency score.</p></div>';
    function el(id){return host.querySelector('#'+id);}
    var select=el('retry-moment'),start=el('retry-start'),status=el('retry-status'),hint=el('retry-hint'),error=el('retry-error');
    function setActive(value){active=value;if(options.onActive)options.onActive(value);}
    function choiceAt(turnId){return choices.find(function(choice){return String(choice.turnId)===String(turnId);});}
    function selection(){return lockedTurnId!==null?choiceAt(lockedTurnId):choices[Number(select.value)||0];}
    function availabilityAt(turnId){
      var reason=disposed?'disposed':!choiceAt(turnId)?'unavailable':lockedTurnId!==null&&String(turnId)!==String(lockedTurnId)?'locked':setupInProgress?'preparing':setupTerminal?'setup_failed_terminal':controller?'used':doc.hidden?'hidden':setupFailed?'setup_failed':'ready';
      return {canStart:reason==='ready'||reason==='setup_failed',reason:reason,selectedTurnId:lockedTurnId};
    }
    function canStartAt(turnId){return availabilityAt(turnId).canStart;}
    function availabilityChanged(){
      var selected=selection();
      select.disabled=lockedTurnId!==null||!choices.length;
      start.disabled=!selected||!canStartAt(selected.turnId);
      if(options.onAvailabilityChange)options.onAvailabilityChange();
    }
    function showOriginal(){
      var selected=selection();if(!selected)return;
      select.value=String(choices.indexOf(selected));
      el('retry-original-question').textContent='You: '+selected.question;
      el('retry-original-reply').textContent=caseText('{name}: ')+selected.reply;
      el('retry-original-note').textContent=selected.playbackStatus==='played'?'Original reply played in full.':selected.heardText?'Completed portion remembered: “'+selected.heardText+'” The full generated reply is shown above.':'The original reply did not finish playing. The full generated reply is shown above.';
    }
    choices.forEach(function(choice,index){var option=doc.createElement('option');option.value=String(index);option.textContent='Turn '+choice.turnId+' — '+choice.question.slice(0,110);select.appendChild(option);});
    select.onchange=showOriginal;showOriginal();
    if(!choices.length){select.disabled=true;start.disabled=true;status.textContent='There is no completed question-and-reply moment available to retry.';}
    function render(snapshot){
      if(disposed||setupTerminal)return;
      var phase=snapshot.phase,running=['starting','listening','finalizing','awaiting_patient','speaking'].indexOf(phase)>=0;
      var waiting=startDeferred&&phase==='idle';
      status.textContent={idle:'Ready for your alternative',starting:'Starting microphone — wait for Listening',listening:'Listening — your alternative',finalizing:'Finishing your alternative',awaiting_patient:caseText('{name} is preparing {possessive} alternative reply'),speaking:caseText('{name} is speaking'),paused:'Alternative paused — microphone off',error:'Alternative needs your attention — microphone off',ended:'Alternative complete — microphone off'}[phase]||phase;
      hint.textContent=phase==='listening'?(snapshot.holdTurn?'Your turn is held. Press Space outside a control or choose Done speaking when ready.':snapshot.thinkingTime?caseText('{name} waits 6 seconds. Press Space outside a control to finish sooner.'):caseText('{name} waits 4.5 seconds. Press Space outside a control to finish sooner.')):(phase==='speaking'||phase==='awaiting_patient')?caseText('Press Escape outside a control or choose Interrupt {name} to stop this reply.'):'You can pause before asking. One submitted alternative is available for this encounter.';
      var latestReply=(snapshot.transcript||[]).filter(function(turn){return turn.who==='pt';}).pop();
      error.hidden=!snapshot.error;error.textContent=snapshot.error?(snapshot.error+(latestReply?caseText(' {name}’s alternative reply: ')+latestReply.text:'')):'';
      el('retry-controls').hidden=phase==='ended';el('retry-done').hidden=phase!=='listening';el('retry-interrupt').hidden=phase!=='speaking'&&phase!=='awaiting_patient';
      el('retry-pause').hidden=!running;el('retry-resume').hidden=!waiting&&((phase!=='paused'&&phase!=='error')||snapshot.turnCount>=1);
      if(waiting){status.textContent='Alternative ready — microphone off';hint.textContent='You left the page while this moment was being prepared. Return to this page and choose Resume when you are ready to speak.';}
      el('retry-hold').checked=snapshot.holdTurn;el('retry-thinking').checked=snapshot.thinkingTime;el('retry-draft').textContent=snapshot.interim||snapshot.draft||'';
      var log=el('retry-alternative');log.replaceChildren();
      snapshot.transcript.forEach(function(turn){var row=doc.createElement('p');row.className='msg '+turn.who;row.textContent=(turn.who==='me'?'You: ':caseText('{name}: '))+turn.text;
        if(turn.responseStatus)row.appendChild(doc.createTextNode(' ['+({pending:caseText('{name} is preparing a reply.'),cancelled:caseText('{name}’s reply was cancelled before it started.'),failed:caseText('{name}’s reply could not be prepared.')}[turn.responseStatus]||'')+']'));
        if(turn.playbackStatus==='interrupted'||turn.playbackStatus==='failed')row.appendChild(doc.createTextNode(turn.heardText?' [Completed portion remembered: “'+turn.heardText+'”.]':' [This reply did not finish playing.]'));
        log.appendChild(row);
      });
      setActive(running||phase==='paused'||phase==='error'||waiting);
      if(phase==='ended'){el('retry-reflection').hidden=false;if(child)child.end();el('retry-reflection-text').focus();}
      else if((phase==='paused'||phase==='error')&&snapshot.turnCount>=1){el('retry-reflection').hidden=false;hint.textContent='Your submitted alternative will not be sent again. Read the comparison and reflect, or choose Stop alternative.';el('retry-reflection-text').focus();}
      else if(phase==='paused'||phase==='error')el('retry-resume').focus();
      availabilityChanged();
    }
    async function startAt(turnId){
      if(!canStartAt(turnId))return false;
      var selected=choiceAt(turnId);
      lockedTurnId=selected.turnId;setupInProgress=true;setupHidden=false;setupFailed=false;
      showOriginal();availabilityChanged();setActive(true);error.hidden=true;error.textContent='';status.textContent='Preparing exchange '+selected.turnId+'…';status.focus();
      try{
        // The parent and server retain one child. A pre-controller failure may
        // retry setup with that child, but must never delete and recreate it.
        if(!child){var result=await options.createRetry(selected.turnId);child=result.client;}
        if(disposed){child.end();return false;}
        await child.start();if(disposed){child.end();return false;}
        bridge=options.createBridge({createInput:options.createInput,speak:function(args){return child.speak(args);},interrupt:function(){controller.interrupt();}});
        controller=env.SPInterviewTurns.createController({maxTurns:1,skipOpening:true,input:bridge.input,speak:bridge.speak,
          respond:function(text,request){
            if(options.isAllowedText&&!options.isAllowedText(text))return Promise.reject(new Error('Use fictional practice only. Clear this encounter if you entered real-patient information.'));
            return child.respond(text,{signal:request.signal,turnId:1});
          },onChange:render});
        setupInProgress=false;startDeferred=setupHidden||doc.hidden;
        start.hidden=true;controller.setThinkingTime(options.originalSnapshot.thinkingTime===true);if(!startDeferred)controller.start();
        availabilityChanged();return true;
      }catch(problem){
        setupInProgress=false;setupFailed=true;if(disposed)return false;
        if(controller){
          setupTerminal=true;startDeferred=false;
          try{controller.end();}catch(ignored){}
          if(child)child.end();
          start.hidden=true;el('retry-controls').hidden=true;
          status.textContent='Alternative setup failed — microphone off';
          hint.textContent='Setup has stopped. Clear and start over to try a new encounter.';
          status.focus();
        }else{
          bridge=null;start.hidden=false;start.textContent='Retry setting up this moment';
          status.textContent='This alternative could not start';start.focus();
        }
        setActive(false);error.hidden=false;error.textContent=problem&&problem.message||'Clear and start over to try a new encounter.';
        availabilityChanged();return false;
      }
    }
    start.onclick=function(){var selected=selection();return selected?startAt(selected.turnId):Promise.resolve(false);};
    function done(){if(!controller||controller.doneSpeaking())return;var snapshot=controller.getSnapshot();if(snapshot.phase==='listening')hint.textContent=snapshot.interim?'Your words are still being recognized. Wait for them to finish, then press Space.':'Speak your alternative first, then press Space or choose Done speaking.';}
    el('retry-done').onclick=done;el('retry-interrupt').onclick=function(){if(bridge)bridge.interrupt();};
    el('retry-pause').onclick=function(){if(controller)controller.pause();};el('retry-resume').onclick=function(){if(!controller||doc.hidden)return;if(startDeferred){startDeferred=false;controller.start();}else controller.resume();};el('retry-stop').onclick=function(){if(controller)controller.end();};
    el('retry-hold').onchange=function(){if(controller)controller.setHoldTurn(this.checked);};el('retry-thinking').onchange=function(){if(controller)controller.setThinkingTime(this.checked);};
    function keydown(event){
      if(disposed||!controller||event.defaultPrevented||(event.code!=='Space'&&event.code!=='Escape')||event.repeat||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      var target=event.target;if(target&&(target.isContentEditable||(target.closest&&target.closest('input,textarea,select,button,a,[contenteditable],[role="button"],[role="textbox"],[role="combobox"],[role="checkbox"],[role="switch"],[role="slider"],[role="spinbutton"]'))))return;
      var phase=controller.getSnapshot().phase;
      if(event.code==='Space'&&phase==='listening'){event.preventDefault();done();}
      else if(phase==='speaking'||phase==='awaiting_patient'){event.preventDefault();if(event.code==='Escape')bridge.interrupt();else hint.textContent=caseText('Your alternative is already sent. {name} is responding. Press Escape only if you want to interrupt.');}
    }
    function hidden(){if(doc.hidden){if(setupInProgress)setupHidden=true;if(controller)controller.pause();}availabilityChanged();}
    doc.addEventListener('keydown',keydown);doc.addEventListener('visibilitychange',hidden);
    availabilityChanged();
    return{canStartAt:canStartAt,startAt:startAt,availabilityAt:availabilityAt,dispose:function(){if(disposed)return;disposed=true;doc.removeEventListener('keydown',keydown);doc.removeEventListener('visibilitychange',hidden);if(controller)controller.end();if(child)child.end();setActive(false);availabilityChanged();},getSnapshot:function(){return controller?controller.getSnapshot():null;}};
  }
  return{mount:mount,moments:moments};
});
