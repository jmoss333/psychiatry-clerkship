(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.DanaPreview=api;if(root.document.getElementById('preview-root'))api.session=api.mount(root);}
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var MAX_AUDIO=4000000,MAX_STATE=128*1024;
  function issue(code){var error=new Error(code);error.code=code;return error;}
  function cancelled(){return issue('cancelled');}
  function normalized(text){return String(text||'').replace(/\s+/g,' ').trim();}
  function token(value){return typeof value==='string'&&value.length>0&&value.length<=MAX_STATE&&!/[\s\x00-\x1f]/.test(value);}
  function safeMessage(code){var aliases={preview_forbidden:'access_denied',preview_state_invalid:'invalid_state',preview_session_expired:'state_expired',preview_provider_unavailable:'provider_error',preview_budget_exhausted:'daily_budget_exceeded',preview_daily_starts_exhausted:'daily_starts_exceeded',preview_window_exhausted:'window_budget_exceeded',preview_input_invalid:'input_invalid',preview_encounter_finished:'encounter_finished',preview_operation_duplicate:'operation_duplicate',preview_operation_mismatch:'operation_duplicate',preview_unavailable:'unavailable',preview_budget_unavailable:'unavailable',preview_budget_contention:'rate_limited'};code=aliases[code]||code;return {
    access_denied:'That passcode was not accepted. Check the invitation and try again.',unauthorized:'That passcode was not accepted. Check the invitation and try again.',
    invalid_state:'This encounter can no longer continue. Clear and start a new encounter.',state_expired:'This encounter has expired. Clear and start again.',expired_state:'This encounter has expired. Clear and start again.',
    rate_limited:'The preview is receiving too many requests. Wait a moment before starting again.',budget_exceeded:'This preview has reached its usage limit. Please contact the person who shared it.',
    daily_starts_exceeded:'Today’s 20 encounter starts have been used. New encounters become available at midnight UTC.',daily_budget_exceeded:'The room has reached today’s shared usage allowance. It renews at midnight UTC.',window_budget_exceeded:'The room is busy and has reached its shared 30-minute allowance. Please wait before starting another encounter.',
    unavailable:'This faculty preview is unavailable right now. Please check with the person who shared it.',encounter_finished:'This encounter has reached ten questions. Clear and start again for a new conversation.',operation_duplicate:'That request already started and cannot be safely repeated. Clear and start a new encounter.',
    provider_error:'The patient’s reply could not be completed. No question was sent again automatically.',timeout:'The response took too long. No question was sent again automatically.',
    audio_failed:'The voice could not finish playing. The unfinished part will not count as heard.',playback_blocked:'Your browser blocked voice playback. The unfinished part will not count as heard.',
    microphone_denied:'The microphone was not allowed. You can type, or allow microphone access and choose Resume microphone.',microphone_unavailable:'The microphone is unavailable. Type your question, or check your input device.',
    recognition_failed:'Speech recognition stopped. Your completed words remain below; check them before sending or resume the microphone.',
    unfinished_speech:'The speech service stopped before finishing your words. Review the completed draft or repeat the unfinished portion.',
    protocol_error:'The response could not be verified. No question was sent again automatically.',text_too_long:'Keep each question to 1,200 characters or fewer.',
    no_words:'Add your question first.',still_recognizing:'Your words are still being recognized. Wait for them to finish, or edit the typed draft.',input_invalid:'The question could not be accepted. Use plain text of 1,200 characters or fewer.'
  }[code]||'The preview could not complete that action. No question was sent again automatically.';}

  function createParser(options){
    var pending='',bytes=0,reply=null,audioCount=0,complete=false;
    function state(event){if(!token(event.state))throw issue('protocol_error');if(options.onState)options.onState(event.state);}
    function line(value){
      if(!value.trim())return;if(complete)throw issue('protocol_error');var event;
      try{event=JSON.parse(value);}catch(_){throw issue('protocol_error');}
      if(!event||typeof event!=='object')throw issue('protocol_error');
      if(event.type==='error')throw issue(typeof event.code==='string'&&/^[a-z_]{1,60}$/.test(event.code)?event.code:'provider_error');
      if(event.type==='reply'){
        if(reply||typeof event.reply!=='string'||!event.reply.trim()||event.reply.length>900||!Number.isInteger(event.turn)||event.turn<0||event.turn>10||options.expectedTurn!==undefined&&event.turn!==options.expectedTurn||!Array.isArray(event.segments)||event.segments.length<1||event.segments.length>2)throw issue('protocol_error');
        if(event.segments.some(function(segment){return !segment||typeof segment.text!=='string'||!segment.text.trim()||segment.text.length>900;}))throw issue('protocol_error');
        if(event.segments.map(function(segment){return segment.text;}).join('')!==event.reply)throw issue('protocol_error');
        state(event);reply=event;if(options.onReply)options.onReply(event);
      }else if(event.type==='audio'){
        if(!reply||event.index!==audioCount||event.index>=reply.segments.length||typeof event.data!=='string'||event.data.length<136||event.data.length>Math.ceil(MAX_AUDIO/3)*4||event.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(event.data))throw issue('protocol_error');
        var padding=event.data.endsWith('==')?2:event.data.endsWith('=')?1:0,size=event.data.length/4*3-padding;
        if(size<100||size>MAX_AUDIO)throw issue('protocol_error');
        state(event);audioCount++;if(options.onAudio)options.onAudio(event);
      }else if(event.type==='complete'){
        if(!reply||audioCount!==reply.segments.length)throw issue('protocol_error');state(event);complete=true;if(options.onComplete)options.onComplete(event);
      }else throw issue('protocol_error');
    }
    return {push:function(text){bytes+=text.length;if(bytes>13*1024*1024)throw issue('protocol_error');pending+=text;var at;while((at=pending.indexOf('\n'))>=0){var value=pending.slice(0,at);pending=pending.slice(at+1);line(value);}if(pending.length>6*1024*1024)throw issue('protocol_error');},finish:function(){if(pending.trim())line(pending);pending='';if(!complete)throw issue('protocol_error');return {reply:reply,audioCount:audioCount};}};
  }
  async function readResponse(response,options,signal){
    if(!response.ok){var code=response.status===401||response.status===403?'access_denied':response.status===429?'rate_limited':'provider_error';try{var body=await response.json();if(body&&typeof body.code==='string')code=body.code;else if(body&&typeof body.error==='string')code=body.error;else if(body&&body.error&&typeof body.error.code==='string')code=body.error.code;}catch(_){}throw issue(code);}
    if(!/^application\/x-ndjson(?:;|$)/i.test(response.headers.get('content-type')||''))throw issue('protocol_error');
    var reader=response.body&&response.body.getReader();if(!reader)throw issue('protocol_error');var parser=createParser(options),decoder=new TextDecoder('utf-8',{fatal:true});
    try{while(true){if(signal.aborted)throw cancelled();var value=await reader.read();if(signal.aborted)throw cancelled();if(value.done)break;parser.push(decoder.decode(value.value,{stream:true}));}parser.push(decoder.decode());return parser.finish();}
    catch(error){try{await reader.cancel();}catch(_){}throw error;}
    finally{reader.releaseLock();}
  }

  function createCapture(env,callbacks){
    var Constructor=env.SpeechRecognition||env.webkitSpeechRecognition,current=null,active=false,timer=null,restart=null,serial=0,fruitless=0,interim='',thinking=false,hold=false,quietSince=null,voice=null,suspended=false;
    // Recognition sessions end and restart on their own. HEALTHY_RUN marks a
    // session that lived long enough to be an ordinary silence cycle rather than a
    // failure, and MAX_FRUITLESS bounds a genuine restart storm.
    // How long speech may be open with nothing reported before we stop guessing.
    // Expiry means "we do not know", never "the learner has finished".
    var VOICE_STALL=8000,HEALTHY_RUN=1000,MAX_FRUITLESS=8,TRACE_LIMIT=200,trace=[],counts=Object.create(null);
    var nativeRecognition=!!Constructor&&/\[native code\]/.test(String(Constructor));
    function clock(){return typeof env.now==='function'?env.now():env.performance&&typeof env.performance.now==='function'?env.performance.now():Date.now();}
    function note(code){counts[code]=(counts[code]||0)+1;trace.push({at:Math.round(clock()),code:code});if(trace.length>TRACE_LIMIT)trace.shift();}
    function emit(name,value){if(typeof callbacks[name]==='function')callbacks[name](value);}
    function clear(){env.clearTimeout(timer);timer=null;}
    function releaseVoice(){env.clearTimeout(voice);voice=null;}
    function quiet(){return thinking?8000:4500;}
    function blocked(){return !active?'inactive':hold?'hold':interim?'interim':suspended?'unfinished':voice?'voice':callbacks.hasDraft()?'':'nodraft';}
    // The deadline follows the latest recognized words or speech ending. A service
    // restart alone does not extend it; newly finished speech must get its own pause.
    function arm(){clear();var why=blocked();if(why){note('wait_'+why);return;}
      if(quietSince===null)quietSince=clock();
      note('armed');timer=env.setTimeout(function(){timer=null;if(blocked())return;note('submit');quietSince=null;emit('onSubmit');},Math.max(0,quietSince+quiet()-clock()));}
    function detach(){var old=current;current=null;if(!old)return;old.onstart=old.onresult=old.onerror=old.onend=old.onspeechstart=old.onspeechend=null;try{old.abort();}catch(_){}}
    function stop(){active=false;clear();releaseVoice();env.clearTimeout(restart);restart=null;detach();interim='';suspended=false;quietSince=null;note('stop');emit('onInterim','');}
    function fail(code){stop();note('fail');emit('onError',issue(code));}
    function connect(){
      if(!active)return;var recognition=new Constructor(),id=++serial,finals=Object.create(null),madeProgress=false,startedAt=clock();current=recognition;
      recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=true;
      recognition.onstart=function(){if(active&&current===recognition){note('ready');emit('onReady');}};
      // Voice activity suppresses the quiet deadline only while it might still become
      // words. Held open indefinitely it is the difference between hands-free and not.
      // speechend is the honest signal that a burst finished; a learner mid-sentence
      // does not produce one. While speech is open we do not arm — and if nothing is
      // ever reported we say so rather than sending an earlier draft over the top of
      // words the service has not delivered yet.
      recognition.onspeechstart=function(){if(!active||current!==recognition)return;note('voice_start');clear();releaseVoice();
        voice=env.setTimeout(function(){
          voice=null;note('voice_stalled');
          if(!active||interim||suspended)return;
          suspended=true;clear();emit('onNotice',issue('unfinished_speech'));
        },VOICE_STALL);};
      recognition.onspeechend=function(){if(!active||current!==recognition)return;note('voice_end');releaseVoice();quietSince=clock();arm();};
      recognition.onresult=function(event){
        if(!active||current!==recognition)return;var words=[],heard=false,finalArrived=false;
        for(var index=0;index<event.results.length;index++){
          var result=event.results[index],text=result[0]&&result[0].transcript||'';
          if(result.isFinal){if(!finals[index]){finals[index]=true;if(text.trim()){madeProgress=true;heard=true;finalArrived=true;note('words_final');emit('onFinal',text.trim());}}}
          else{if(text.trim())heard=true;words.push(text);}
          if(!active||current!==recognition)return;
        }
        if(heard){suspended=false;releaseVoice();quietSince=clock();}
        // A result list may SHRINK: the service can withdraw an interim without ever
        // replacing it with a final. Treating that as "nothing pending" would let the
        // earlier final be sent as if it were the whole question.
        var withdrawn=!!interim&&!words.join(' ').trim()&&!finalArrived;
        interim=words.join(' ').trim();emit('onInterim',interim);
        if(withdrawn){suspended=true;clear();note('withdrawn');emit('onNotice',issue('unfinished_speech'));return;}
        if(interim){note('words_interim');clear();}else arm();
      };
      function reconnect(){
        if(!active||current!==recognition)return;
        // Words the service never finished are kept but never auto-sent: recover the
        // microphone and wait for new speech or an explicit finish instead.
        if(interim){suspended=true;interim='';clear();note('unfinished');emit('onInterim','');emit('onNotice',issue('unfinished_speech'));}
        fruitless=madeProgress||clock()-startedAt>=HEALTHY_RUN?0:fruitless+1;
        if(fruitless>MAX_FRUITLESS){fail('recognition_failed');return;}
        var delay=fruitless?Math.min(2000,100*Math.pow(2,fruitless-1)):0;
        detach();note('reconnect');emit('onConnecting',{resuming:true,delayed:delay>0});
        restart=env.setTimeout(function(){restart=null;try{connect();}catch(_){fail('microphone_unavailable');}},delay);
      }
      recognition.onend=reconnect;recognition.onerror=function(event){if(!active||current!==recognition)return;if(event.error==='no-speech'||event.error==='aborted'){note('lifecycle_'+event.error);reconnect();return;}fail(event.error==='not-allowed'||event.error==='service-not-allowed'?'microphone_denied':event.error==='audio-capture'?'microphone_unavailable':'recognition_failed');};
      recognition.start();
    }
    return {start:function(){if(active)return;if(!Constructor){emit('onError',issue('microphone_unavailable'));return;}active=true;fruitless=0;suspended=false;quietSince=null;note('start');try{connect();}catch(_){fail('microphone_unavailable');}},stop:stop,
      setThinking:function(value){thinking=!!value;arm();},setHold:function(value){var released=hold&&!value;hold=!!value;note(hold?'hold_on':'hold_off');if(released)quietSince=clock();arm();},
      edited:function(){interim='';suspended=false;quietSince=clock();note('edited');emit('onInterim','');arm();},isActive:function(){return active;},
      diagnostics:function(){return {nativeRecognition:nativeRecognition,sessions:serial,counts:Object.assign({},counts),events:trace.slice()};}};
  }

  // The cases the hosted preview carries. Morgan is deliberately absent: it is
  // draft-pending-attestation and the server registry refuses it too.
  var CASE_IDS=['sp_depression_gated_si_001','sp_mania_redirect_001','sp_psychosis_paranoid_001'];
  function createController(env,options){
    options=options||{};var phase='gate',key='',receipt=null,turn=0,caseId=CASE_IDS[0],messages=[],draft='',interim='',problem='',voice=true,thinking=false,hold=false,task=null,player=null,disposed=false,ended=false,restartRequired=false,retryUsed=false;
    var previousPlayback='interrupted',previousCompletedSegments=0,generation=0;
    var tally={startRequests:0,turnRequests:0,automaticSubmissions:0,explicitSubmissions:0};
    function snapshot(){return {phase:phase,turn:turn,messages:messages.map(function(message){var copy=Object.assign({},message);if(copy.segments)copy.segments=copy.segments.slice();return copy;}),draft:draft,interim:interim,error:problem,voice:voice,thinking:thinking,hold:hold,busy:!!task,restartRequired:restartRequired,retryUsed:retryUsed,caseId:caseId};}
    function publish(){if(!disposed&&typeof options.onChange==='function')options.onChange(snapshot());}
    var capture=createCapture(env,{hasDraft:function(){return !!draft.trim();},onReady:function(){if(!task&&!disposed&&!ended){phase='listening';publish();}},onConnecting:function(info){if(!task&&!disposed&&!ended){phase=info&&info.resuming&&!info.delayed&&phase==='listening'?'listening':'connecting';publish();}},onFinal:function(text){if(task||disposed)return;draft=(draft.trim()+' '+text).trim();if(problem&&(phase==='listening'||phase==='connecting'))problem='';if(draft.length>1200){capture.stop();phase='paused';problem=safeMessage('text_too_long');}publish();},onInterim:function(text){interim=text;publish();},onSubmit:function(){send(undefined,true);},onNotice:function(error){if(disposed||ended||task)return;problem=safeMessage(error.code);publish();},onError:function(error){if(disposed)return;phase='paused';problem=safeMessage(error.code);publish();}});
    function stopPlayer(){if(player){player.stop();player=null;}}
    function play(event,operation){
      return new Promise(function(resolve,reject){
        if(disposed||task!==operation||operation.abort.signal.aborted)return reject(cancelled());
        var raw;try{raw=env.atob(event.data);}catch(_){return reject(issue('protocol_error'));}
        var bytes=new Uint8Array(raw.length);for(var index=0;index<raw.length;index++)bytes[index]=raw.charCodeAt(index);
        var url=env.URL.createObjectURL(new env.Blob([bytes],{type:'audio/mpeg'})),audio=new env.Audio(url),settled=false,audioTimer;
        function finish(error){if(settled)return;settled=true;env.clearTimeout(audioTimer);operation.abort.signal.removeEventListener('abort',abort);audio.onended=audio.onerror=null;
          try{audio.pause();audio.removeAttribute&&audio.removeAttribute('src');audio.load&&audio.load();}catch(_){}env.URL.revokeObjectURL(url);if(player&&player.audio===audio)player=null;
          if(error)reject(error);else{operation.completed++;previousCompletedSegments=operation.completed;resolve();}
        }
        function abort(){finish(cancelled());}
        player={audio:audio,stop:abort};operation.abort.signal.addEventListener('abort',abort,{once:true});audio.onended=function(){finish();};audio.onerror=function(){finish(issue('audio_failed'));};
        audioTimer=env.setTimeout(function(){finish(issue('audio_failed'));},65000);phase='speaking';publish();
        try{var started=audio.play();if(started&&started.catch)started.catch(function(){finish(issue('playback_blocked'));});}catch(_){finish(issue('playback_blocked'));}
      });
    }
    function ready(){if(disposed||ended||restartRequired||task)return;if(turn>=10){ended=true;phase='ended';publish();return;}if(voice&&!env.document.hidden){phase='connecting';publish();capture.start();}else{phase='ready';publish();}}
    async function request(body,learner){
      // A retry is the one request that legitimately follows the end of an encounter.
      if(task||disposed||restartRequired||(ended&&body.action!=='retry'))return false;capture.stop();problem='';interim='';
      if(body.action==='start')tally.startRequests++;else tally.turnRequests++;
      var operation={id:++generation,abort:new AbortController(),receivedState:false,completed:0,reply:null,error:null,cancelled:false,learner:learner};task=operation;phase='responding';publish();
      var timeout=env.setTimeout(function(){operation.error=issue('timeout');operation.abort.abort();if(task===operation)stopPlayer();},90000),queue=Promise.resolve();
      try{
        var response=await env.fetch('/api/dana-preview',{method:'POST',headers:{'Content-Type':'application/json','x-preview-key':key},body:JSON.stringify(body),signal:operation.abort.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
        await readResponse(response,{
          expectedTurn:body.action==='start'?0:body.action==='retry'?body.turnId:turn+1,
          onState:function(state){if(disposed||task!==operation||operation.abort.signal.aborted)throw cancelled();receipt=state;operation.receivedState=true;previousPlayback='interrupted';previousCompletedSegments=operation.completed;},
          onReply:function(event){if(body.action!=='retry')turn=event.turn;operation.reply={role:'dana',text:event.reply,status:'preparing',completedSegments:0,totalSegments:event.segments.length,segments:event.segments.map(function(segment){return segment.text;})};messages.push(operation.reply);if(learner)learner.status='submitted';publish();},
          onAudio:function(event){queue=queue.then(function(){return play(event,operation);});queue.catch(function(error){if(!operation.error)operation.error=error;operation.abort.abort();if(task===operation)stopPlayer();});}
        },operation.abort.signal);
        await queue;if(operation.error)throw operation.error;if(operation.abort.signal.aborted)throw cancelled();
        previousPlayback='played';previousCompletedSegments=operation.completed;if(operation.reply){operation.reply.status='played';operation.reply.completedSegments=operation.completed;}
      }catch(error){
        if(task!==operation||disposed){operation.failed=true;return false;}
        stopPlayer();try{await queue;}catch(_){}
        error=operation.error||error;previousPlayback='interrupted';previousCompletedSegments=operation.completed;
        if(operation.reply){operation.reply.status='interrupted';operation.reply.completedSegments=operation.completed;}
        if(!operation.receivedState){restartRequired=true;if(learner)learner.status='unconfirmed';}
        // A failed retry happens with ended already true; without this it would set
        // restartRequired and show the learner no reason for it.
        if(!disposed&&(!ended||body.action==='retry')){phase=restartRequired?'restart':ended?'ended':'paused';problem=operation.cancelled?'':safeMessage(error.code);if(restartRequired)problem+=(problem?' ':'')+'The last request stopped before its updated conversation receipt arrived. Its outcome is unknown. Clear and restart; it will not be sent again automatically.';}
        if(body.action==='start'&&['access_denied','preview_forbidden'].includes(error.code)){key='';receipt=null;restartRequired=false;phase='gate';problem=safeMessage('access_denied');}
        operation.failed=true;
      }finally{
        env.clearTimeout(timeout);var ownsTask=task===operation;if(ownsTask)task=null;
        if(!disposed&&ownsTask){if(ended||turn>=10){ended=true;phase='ended';}publish();if(!operation.failed&&!operation.cancelled&&!ended)ready();}
      }
      return !operation.failed;
    }
    async function start(passcode,useVoice,chosenCase){
      if(task||disposed||phase!=='gate')return false;
      if(chosenCase!==undefined){if(CASE_IDS.indexOf(chosenCase)<0)return false;caseId=chosenCase;}key=String(passcode||'').trim();if(!key||key.length>200){problem=safeMessage('access_denied');publish();return false;}
      voice=!!useVoice&&!!(env.SpeechRecognition||env.webkitSpeechRecognition);problem='';receipt=null;messages=[];turn=0;ended=false;restartRequired=false;
      return request({action:'start',caseId:caseId,requestId:env.crypto.randomUUID()},null);
    }
    async function send(text,automatic){
      if(task||disposed||ended||restartRequired||!receipt)return false;
      if(text!==undefined){draft=String(text);interim='';}
      if(interim){problem=safeMessage('still_recognizing');publish();return false;}
      var value=normalized(draft);if(!value||value.length>1200||/[\u0000-\u001f\u007f]/.test(value)){problem=safeMessage(!value?'no_words':value.length>1200?'text_too_long':'input_invalid');publish();return false;}
      if(automatic)tally.automaticSubmissions++;else tally.explicitSubmissions++;
      var learner={role:'you',text:value,status:'pending'};messages.push(learner);draft='';
      return request({action:'turn',caseId:caseId,state:receipt,text:value,previousPlayback:previousPlayback,previousCompletedSegments:previousCompletedSegments},learner);
    }
    // One spoken alternative from a finished encounter. It presents the latest,
    // unconsumed receipt: an earlier one is what the server's ledger refuses.
    async function retry(turnId,text){
      if(task||disposed||restartRequired||retryUsed||!ended||!receipt)return false;
      if(!Number.isInteger(turnId)||turnId<1||turnId>turn)return false;
      var value=normalized(text);
      if(!value||value.length>1200||/[\u0000-\u001f\u007f]/.test(value)){problem=safeMessage(!value?'no_words':value.length>1200?'text_too_long':'input_invalid');publish();return false;}
      var learner={role:'you',text:value,status:'pending'};messages.push(learner);
      var accepted=await request({action:'retry',caseId:caseId,state:receipt,turnId:turnId,text:value},learner);
      if(accepted)retryUsed=true;
      return accepted;
    }
    function pause(){capture.stop();if(task){task.cancelled=true;task.abort.abort();stopPlayer();}else if(!ended&&!restartRequired&&phase!=='gate')phase='paused';publish();}
    function end(){ended=true;capture.stop();if(task){task.cancelled=true;task.abort.abort();}stopPlayer();phase='ended';publish();}
    function resume(){if(disposed||env.document.hidden||task||ended||restartRequired||!receipt)return false;voice=true;problem='';phase='connecting';publish();capture.start();return true;}
    function setDraft(text){if(task||ended||restartRequired||disposed)return;draft=String(text).slice(0,1200);interim='';if(capture.isActive()){capture.stop();phase='paused';}problem='';publish();}
    function clear(){generation++;if(task){task.cancelled=true;task.abort.abort();task=null;}capture.stop();stopPlayer();receipt=null;key='';messages=[];draft='';interim='';problem='';turn=0;ended=false;restartRequired=false;retryUsed=false;previousPlayback='interrupted';previousCompletedSegments=0;phase='gate';publish();}
    function dispose(){if(disposed)return;disposed=true;end();clear();}
    return {start:start,send:send,retry:retry,pause:pause,interrupt:pause,end:end,resume:resume,setDraft:setDraft,clear:clear,dispose:dispose,getSnapshot:snapshot,
      getDiagnostics:function(){return Object.assign({},tally,capture.diagnostics());},
      setThinking:function(value){thinking=!!value;capture.setThinking(thinking);publish();},setHold:function(value){hold=!!value;capture.setHold(hold);publish();}};
  }

  // The patient's identity is one fact used in several places. Deriving it here
  // stops the page saying Dana while the server is talking to Marcus.
  function applyIdentity(doc,profile){
    var name=profile&&profile.displayName||'the patient',voice=profile&&profile.voice||'AI';
    doc.title=(profile&&profile.title||name)+' · The Interview Room';
    var set=function(id,text){var node=doc.getElementById(id);if(node)node.textContent=text;};
    set('door-title','Begin with '+name+'\u2019s story.');
    set('patient-name',name);
    set('voice-tag',voice+' · AI voice');
    set('door-lede','You are a medical student meeting '+name+' on an adult inpatient psychiatry service. Introduce yourself and your role, explain the purpose of the conversation, and invite an account. Close with a summary that can be corrected.');
    set('access-lede','This invitation opens a private practice encounter with '+name+'. Up to ten questions, at your pace.');
    set('voice-note',voice+'\u2019s voice is AI-generated. Recognized words and conversation context are sent to OpenAI to generate replies and speech. Your browser may send microphone audio to its speech-recognition service. Use fictional information only; never enter real-patient information.');
    set('interrupt-label','Interrupt '+name);
    set('closing-prompt','What did '+name+' want you to understand? Where would you check your understanding? What remains uncertain and should be discussed with your supervisor?');
  }
  function statusLine(phase,name){
    return {gate:'Ready',ready:'Your turn — type your question',connecting:'Connecting microphone…',
      responding:name+' is preparing a reply…',speaking:name+' is speaking',
      listening:'Listening — I\u2019ll send when you finish',paused:'Paused — microphone off',
      restart:'Restart needed — microphone off',ended:'Encounter ended — microphone off'}[phase]||'Ready';
  }
  function speakerLabel(role,name){return role==='you'?'You':name;}

  function mount(env){
    var doc=env.document,el=function(id){return doc.getElementById(id);},lastTranscript='',lastPhase='gate';
    var recognitionAvailable=!!(env.SpeechRecognition||env.webkitSpeechRecognition);
    el('voice-mode').checked=recognitionAvailable;el('voice-mode').disabled=!recognitionAvailable;
    el('voice-entry-tip').hidden=!recognitionAvailable;el('voice-mode').addEventListener('change',function(){el('voice-entry-tip').hidden=!this.checked;});
    if(!recognitionAvailable)el('voice-support').textContent='This browser does not offer speech recognition. The patient still speaks, and you can type each question.';
    var patientName='the patient';
    function previewCase(){var profile=env.DanaStationContent&&env.DanaStationContent.getProfile(el('case-choice').value);if(!profile)return;el('door-title').textContent='Begin with '+profile.displayName+'’s story.';el('door-lede').textContent='Introduce yourself and your role, invite the patient’s account, and close with a summary they can correct.';el('access-lede').textContent='Up to ten questions, at your pace.';el('case-preview-note').textContent=profile.doorNote;el('case-preview-task').textContent=profile.task;}
    previewCase();el('case-choice').addEventListener('change',previewCase);
    var followTranscript=true;
    function followLatest(){var log=el('transcript');followTranscript=log.scrollHeight-log.scrollTop-log.clientHeight<80;el('latest-message').hidden=followTranscript;}
    var transcriptSize=env.ResizeObserver?new env.ResizeObserver(function(){if(followTranscript)el('transcript').scrollTop=el('transcript').scrollHeight;followLatest();}):null;
    if(transcriptSize)transcriptSize.observe(el('transcript'));
    el('transcript').addEventListener('scroll',followLatest);
    el('latest-message').addEventListener('click',function(){el('transcript').scrollTop=el('transcript').scrollHeight;el('transcript').focus({preventScroll:true});followLatest();});
    var controller=createController(env,{onChange:render});
    // The station is a projection of the snapshot: it never calls the controller.
    var station=null;
    function mountStation(caseId){
      if(station){station.dispose();station=null;}
      if(!env.DanaStation||!env.DanaStationContent||!el('station-root'))return;
      el('station-root').replaceChildren();
      station=env.DanaStation.createStation(env,el('station-root'),{caseId:caseId,content:env.DanaStationContent,onRetry:function(turnId,text){return controller.retry(turnId,text);}});
    }
    function render(snapshot){
      var active=snapshot.phase!=='gate',canSend=active&&!snapshot.busy&&!snapshot.restartRequired&&snapshot.phase!=='ended';
      el('preview-root').setAttribute('data-phase',snapshot.phase);el('entrance').hidden=active;el('room-layout').hidden=!active;
      if(!active)el('typing-panel').open=false;
      else if(snapshot.phase!==lastPhase&&(['ready','paused'].includes(snapshot.phase)||snapshot.error))el('typing-panel').open=true;
      el('access-panel').hidden=active;el('case-choice').disabled=active;el('start').disabled=snapshot.busy;el('encounter-panel').hidden=!active;el('conversation-panel').hidden=!snapshot.messages.length;
      el('closing-panel').hidden=snapshot.phase!=='ended';el('clear').hidden=el('clear-note').hidden=!active;el('clear').disabled=snapshot.busy;
      el('turn-count').textContent=snapshot.turn+' of 10 questions';
      el('status').textContent=statusLine(snapshot.phase,patientName);
      if(snapshot.phase==='listening'&&snapshot.hold)el('status').textContent='Listening — your turn is held';
      el('hint').textContent=snapshot.restartRequired?'The last request has an uncertain outcome. Clear and restart to continue.':snapshot.phase==='speaking'||snapshot.phase==='responding'?'Choose Interrupt or press Escape to continue your thought. Completed audio segments are remembered.':snapshot.phase==='ended'?'Bring what you learned and what remains uncertain to your supervisor.':snapshot.hold?'Your turn is held. Keep speaking or thinking, then choose Done speaking when ready.':snapshot.phase==='listening'?'Just speak. Your question sends itself once you stop — no click needed. Space sends it sooner.':'Take your time. You can speak, pause, or type.';
      el('done').hidden=snapshot.phase!=='listening';el('done').disabled=!!snapshot.interim||!snapshot.draft.trim();
      el('pause').hidden=!['listening','connecting'].includes(snapshot.phase);el('resume').hidden=!recognitionAvailable||!['paused','ready'].includes(snapshot.phase)||snapshot.restartRequired;el('resume').disabled=snapshot.busy;
      el('interrupt').hidden=!snapshot.busy;el('end').hidden=snapshot.phase==='ended'||snapshot.phase==='restart';
      el('thinking-time').disabled=el('hold-turn').disabled=snapshot.phase==='ended'||snapshot.restartRequired;
      el('send').disabled=!canSend||!snapshot.draft.trim()||!!snapshot.interim;el('composer').disabled=!canSend;
      if(el('composer').value!==snapshot.draft)el('composer').value=snapshot.draft;
      el('spoken-draft').hidden=!(snapshot.draft||snapshot.interim);el('draft-text').textContent=snapshot.draft;el('interim-text').textContent=snapshot.interim;
      el('error').hidden=!snapshot.error;el('error').textContent=snapshot.error;
      var serialized=JSON.stringify(snapshot.messages);if(serialized!==lastTranscript){var log=el('transcript'),nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<80,previousScroll=log.scrollTop;lastTranscript=serialized;el('transcript').replaceChildren();snapshot.messages.forEach(function(message){var row=doc.createElement('article');row.className='message '+message.role;var name=doc.createElement('span');name.className='name';name.textContent=speakerLabel(message.role,patientName);row.appendChild(name);row.appendChild(doc.createTextNode(message.text));var delivery=doc.createElement('span');delivery.className='delivery';delivery.textContent=message.role==='you'?(message.status==='pending'?'Request in progress':message.status==='unconfirmed'?'Request outcome unknown — not sent again':'Submitted'):message.status==='played'?'Voice completed':message.status==='interrupted'?(message.completedSegments?message.completedSegments+' completed audio segment(s) remembered; the remaining text did not finish playing.':'Voice interrupted; no complete audio segment was confirmed heard.'):'Voice being prepared / played';row.appendChild(delivery);el('transcript').appendChild(row);});log.scrollTop=nearBottom?log.scrollHeight:previousScroll;followLatest();}
      if(snapshot.phase!==lastPhase&&(snapshot.phase==='restart'||snapshot.phase==='ended'))el('clear').focus();
      if(station)station.update(snapshot);
      if(active&&lastPhase==='gate'){el('encounter-title').setAttribute('tabindex','-1');el('encounter-title').focus();}
      lastPhase=snapshot.phase;
    }
    el('access-form').addEventListener('submit',function(event){event.preventDefault();var passcode=el('preview-key').value;el('preview-key').value='';var chosen=el('case-choice').value;var profile=env.DanaStationContent&&env.DanaStationContent.getProfile(chosen);if(profile){patientName=profile.displayName;applyIdentity(doc,profile);}mountStation(chosen);controller.start(passcode,el('voice-mode').checked,chosen);});
    el('composer-form').addEventListener('submit',function(event){event.preventDefault();controller.send(el('composer').value);});
    el('composer').addEventListener('input',function(){controller.setDraft(this.value);});el('done').addEventListener('click',function(){controller.send();});
    el('pause').addEventListener('click',controller.pause);el('resume').addEventListener('click',controller.resume);el('interrupt').addEventListener('click',controller.interrupt);el('end').addEventListener('click',controller.end);
    el('thinking-time').addEventListener('change',function(){controller.setThinking(this.checked);});el('hold-turn').addEventListener('change',function(){controller.setHold(this.checked);});
    el('clear').addEventListener('click',function(){controller.clear();if(station){station.dispose();station=null;}el('preview-key').value='';doc.title='The Interview Room';previewCase();el('preview-key').focus();});
    doc.addEventListener('keydown',function(event){if(event.defaultPrevented||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;var snapshot=controller.getSnapshot();if(event.code==='Escape'&&snapshot.busy){event.preventDefault();controller.interrupt();return;}if(event.code==='Space'&&snapshot.phase==='listening'&&!(event.target&&event.target.closest('input,textarea,button,select,a,summary,[contenteditable]'))){event.preventDefault();controller.send();}});
    doc.addEventListener('visibilitychange',function(){if(doc.hidden)controller.pause();});env.addEventListener('pagehide',function(){if(transcriptSize)transcriptSize.disconnect();controller.dispose();if(station){station.dispose();station=null;}});render(controller.getSnapshot());return controller;
  }
  return {createParser:createParser,readResponse:readResponse,createCapture:createCapture,createController:createController,safeMessage:safeMessage,mount:mount,applyIdentity:applyIdentity,statusLine:statusLine,speakerLabel:speakerLabel};
}));
