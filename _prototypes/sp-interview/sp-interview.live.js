/* Explicit local live Dana preview. Credentials and actor history stay on the server. */
(function(root,factory){
  var localCases=null;
  if(typeof module==='object'&&module.exports){
    try{localCases=require('./sp-interview.local-cases.js');}
    catch(error){if(error.code!=='MODULE_NOT_FOUND'||error.message.indexOf("Cannot find module './sp-interview.local-cases.js'")!==0)throw error;}
  }
  var api=factory(localCases);if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SPInterviewLive=api;
})(typeof window!=='undefined'?window:null,function(nodeLocalCases){
  'use strict';
  function createClient(env,initial){
    var names={sp_depression_gated_si_001:'Dana',sp_mania_redirect_001:'Marcus',sp_psychosis_paranoid_001:'Ray'};
    var registry=env.SPInterviewLocalCases||nodeLocalCases;
    if(registry&&Array.isArray(registry.cases))registry.cases.forEach(function(patient){
      var profile=registry.profiles&&Object.prototype.hasOwnProperty.call(registry.profiles,patient.id)&&registry.profiles[patient.id];
      if(!Object.prototype.hasOwnProperty.call(names,patient.id)&&profile&&patient.persona&&patient.persona.displayName===profile.name)names[patient.id]=profile.name;
    });
    var caseId=initial&&initial.caseId||'sp_depression_gated_si_001';
    if(!Object.prototype.hasOwnProperty.call(names,caseId))throw new Error('Unsupported local conversation case.');
    var displayName=names[caseId],newCase=caseId!=='sp_depression_gated_si_001';
    function patientMessage(text){return text.replace(/Dana/g,displayName);}
    var closed=false,finished=false,sessionId=initial&&initial.sessionId||null,sessionPromise=null,finishPromise=null,retryPromise=null,retrySelection=null,children=new Set(),requests=new Set(),players=new Set(),recordings=new Map(),cancellations=new Set(),cancelledTurns=new Set(),cancellationError=null;
    var openingPlayback={turnId:null,playbackStatus:'interrupted',completedSegments:0},lastPlayback=openingPlayback;
    var fetcher=env.fetch.bind(env),schedule=env.setTimeout.bind(env),unschedule=env.clearTimeout.bind(env);
    var Abort=env.AbortController || AbortController;
    function cancelled(){var e=new Error('The live encounter was cancelled.');e.name='AbortError';return e;}
    function validAudioUrl(value){return typeof value==='string'&&/^\/api\/dana\/audio\/[A-Za-z0-9_-]{8,128}$/.test(value);}
    function replySegments(value,turnId){
      if(!value||value.turnId!==turnId||typeof value.reply!=='string'||!value.reply.trim()||value.reply.length>900)return null;
      if(Object.prototype.hasOwnProperty.call(value,'audioSegments')){
        if(Object.prototype.hasOwnProperty.call(value,'audioUrl')||!Array.isArray(value.audioSegments)||value.audioSegments.length<1||value.audioSegments.length>2)return null;
        var seen=new Set(),text='';
        for(var index=0;index<value.audioSegments.length;index++){
          var segment=value.audioSegments[index];
          if(!segment||!validAudioUrl(segment.audioUrl)||seen.has(segment.audioUrl)||typeof segment.text!=='string'||!segment.text.trim())return null;
          seen.add(segment.audioUrl);text+=segment.text;
        }
        if(text!==value.reply)return null;
        return value.audioSegments.map(function(segment){return{audioUrl:segment.audioUrl,text:segment.text};});
      }
      return validAudioUrl(value.audioUrl)?[{audioUrl:value.audioUrl,text:value.reply}]:null;
    }
    async function json(path,body,signal){
      if(closed)throw cancelled();
      var abort=new Abort(),timer=schedule(function(){abort.abort();},body===undefined?5000:70000);
      var cancel=function(){abort.abort();};
      if(signal&&signal.aborted){unschedule(timer);throw cancelled();}
      if(signal)signal.addEventListener('abort',cancel,{once:true});
      requests.add(abort);
      try{
        var response=await fetcher(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:abort.signal,cache:'no-store'});
        if(!response.ok)throw new Error(patientMessage('Live Dana could not respond. Try Resume, or start a new encounter if the session has expired.'));
        var value=await response.json();
        if(closed||abort.signal.aborted)throw cancelled();
        return value;
      }catch(error){
        if(closed||(signal&&signal.aborted))throw cancelled();
        if(abort.signal.aborted)throw new Error(patientMessage('Live Dana took too long to respond. Try Resume.'));
        throw new Error(patientMessage('Live Dana could not connect or respond. Check the local server, then try Resume.'));
      }finally{unschedule(timer);requests.delete(abort);if(signal)signal.removeEventListener('abort',cancel);}
    }
    function removeSession(id){
      // Remote deletion is best effort; a stalled server must not trap Clear.
      // Server expiry remains the fallback if navigation or the network fails.
      return new Promise(function(resolve){
        var abort=new Abort(),settled=false;
        var timer=schedule(function(){abort.abort();done();},1500);
        function done(){if(settled)return;settled=true;unschedule(timer);resolve();}
        Promise.resolve().then(function(){return fetcher('/api/dana/session/'+encodeURIComponent(id),{method:'DELETE',keepalive:true,cache:'no-store',signal:abort.signal});}).then(done,done);
      });
    }
    function start(){
      if(closed)return Promise.reject(cancelled());
      if(sessionPromise)return sessionPromise;
      if(sessionId)return Promise.resolve(sessionId);
      if(finished)return Promise.reject(cancelled());
      // Session creation is small and uncharged; keep its request alive if End
      // happens so the returned session can immediately be deleted.
      sessionPromise=(async function(){
        var startingAbort=new Abort(),startingTimer=schedule(function(){startingAbort.abort();},10000);
        try {
        var response=await fetcher('/api/dana/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newCase?{caseId:caseId}:{}),cache:'no-store',signal:startingAbort.signal});
        if(!response.ok)throw new Error(patientMessage('Live Dana could not start. Check the local server.'));
        var value=await response.json();
        if(typeof value.sessionId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(value.sessionId))throw new Error(patientMessage('Live Dana returned an invalid session.'));
        if((newCase||Object.prototype.hasOwnProperty.call(value,'caseId'))&&value.caseId!==caseId) { await removeSession(value.sessionId); throw new Error('The server returned the wrong practice case.'); }
        sessionId=value.sessionId;
        if(closed){await removeSession(sessionId);sessionId=null;throw cancelled();}
        return sessionId;
        } finally {unschedule(startingTimer);}
      })().catch(function(error){sessionPromise=null;if(closed)throw cancelled();throw new Error(patientMessage('Live Dana could not start. Check the local server.'));});
      return sessionPromise;
    }
    async function respond(text,options){
      options=options||{};
      await Promise.all(Array.from(cancellations));
      if(cancellationError)throw cancellationError;
      if(closed||finished||(options.signal&&options.signal.aborted))throw cancelled();
      var id=await start();
      if(closed||finished||(options.signal&&options.signal.aborted)||cancelledTurns.has(String(options.turnId)))throw cancelled();
      var abortTurn=function(){cancelTurn(id,options.turnId);};
      if(options.signal)options.signal.addEventListener('abort',abortTurn,{once:true});
      try{
        var value=await json('/api/dana/turn',{sessionId:id,turnId:options.turnId,text:text,previousTurnId:lastPlayback.turnId,previousPlayback:lastPlayback.playbackStatus,previousCompletedSegments:lastPlayback.completedSegments},options.signal);
        if(closed||finished||(options.signal&&options.signal.aborted))throw cancelled();
        var segments=replySegments(value,options.turnId);
        if(!segments)throw new Error(patientMessage('Live Dana returned an invalid reply or audio link.'));
        var recording={sessionId:id,turnId:value.turnId,segments:segments,playbackStatus:'interrupted',completedSegments:0};
        recordings.set(value.reply,recording);lastPlayback=recording;
        return{reply:value.reply};
      }catch(error){cancelTurn(id,options.turnId);throw error;}
      finally{if(options.signal)options.signal.removeEventListener('abort',abortTurn);}
    }
    function openingPlayed(){
      if(!closed&&sessionId&&lastPlayback===openingPlayback)openingPlayback.playbackStatus='played';
    }
    function queueCancellation(path){
      if(closed)return;
      var abort=new Abort(),timer=schedule(function(){abort.abort();},5000);
      requests.add(abort);
      var pending=(async function(){
        try{
          var response=await fetcher(path,{method:'DELETE',keepalive:true,cache:'no-store',signal:abort.signal});
          if(!response.ok)throw new Error();
        }catch(error){if(!closed)cancellationError=new Error(patientMessage('Dana’s previous audio could not stop cleanly. End this encounter and start a new one.'));}
        finally{unschedule(timer);requests.delete(abort);}
      })();
      cancellations.add(pending);
      pending.then(function(){cancellations.delete(pending);});
    }
    function cancelTurn(id,turnId){
      var key=String(turnId);
      if(closed||cancelledTurns.has(key))return;
      cancelledTurns.add(key);
      queueCancellation('/api/dana/session/'+encodeURIComponent(id)+'/turn/'+encodeURIComponent(turnId));
    }
    function cancelAudio(recording){
      if(closed||recording.cancelled)return;
      recording.cancelled=true;cancelTurn(recording.sessionId,recording.turnId);
    }
    function speak(options){
      var recording=recordings.get(options.text);
      if(closed||finished||!recording||recording.cancelled)throw new Error('Live audio for this reply is unavailable.');
      var receiptAbort=new Abort(),audio=[],stopped=false,activeIndex=-1,endedCount=0,completeCount=0;
      var timer=schedule(function(){finish(new Error(patientMessage('Dana’s live audio took too long to play.')));},75000);
      function clean(cancelProducer){
        unschedule(timer);receiptAbort.abort();
        audio.forEach(function(part){part.player.onended=part.player.onerror=null;part.player.pause();if(part.player.removeAttribute)part.player.removeAttribute('src');if(part.player.load)part.player.load();});
        if(cancelProducer)cancelAudio(recording);
        players.delete(handle);
      }
      function finish(problem){if(stopped)return;stopped=true;if(!problem)recording.playbackStatus='played';clean(!!problem);if(problem)options.onError(problem);else options.onEnded();}
      var handle={stop:function(){if(stopped)return;stopped=true;clean(true);}};players.add(handle);
      function playPart(index){
        if(stopped)return;
        activeIndex=index;
        try{
          var playing=audio[index].player.play();
          if(playing&&typeof playing.catch==='function')playing.catch(function(){if(!stopped)finish(new Error(patientMessage('Dana’s live audio was blocked. Try Resume.')));});
        }catch(error){finish(new Error(patientMessage('Dana’s live audio could not load or play. Try Resume.')));}
      }
      function partEnded(index){
        var part=audio[index];
        if(stopped||activeIndex!==index||part.ended)return;
        part.ended=true;endedCount++;
        // Start the next preloaded part immediately. Receipt verification runs
        // independently, so the network cannot add a pause between sentences.
        if(index+1<audio.length)playPart(index+1);
        if(stopped)return;
        json(recording.segments[index].audioUrl+'/status',undefined,receiptAbort.signal).then(function(receipt){
          if(stopped||closed)return;
          if(!receipt||receipt.state!=='complete'||receipt.turnId!==recording.turnId){finish(new Error(patientMessage('Dana’s audio stopped before the complete reply was delivered. Try Resume.')));return;}
          part.verified=true;
          var prefix=0;
          while(prefix<audio.length&&audio[prefix].ended&&audio[prefix].verified)prefix++;
          if(prefix>recording.completedSegments){
            recording.completedSegments=prefix;
            if(typeof options.onHeardText==='function')options.onHeardText(recording.segments.slice(0,prefix).map(function(segment){return segment.text;}).join(''));
          }
          completeCount++;
          if(endedCount===audio.length&&completeCount===audio.length)finish();
        }).catch(function(){if(!stopped)finish(new Error(patientMessage('Dana’s complete audio could not be confirmed. Try Resume.')));});
      }
      try{
        recording.segments.forEach(function(segment,index){
          var player=new env.Audio(segment.audioUrl);player.preload='auto';
          audio.push({player:player,ended:false,verified:false});
          player.onended=function(){partEnded(index);};
          player.onerror=function(){finish(new Error(patientMessage('Dana’s live audio could not load or play. Try Resume.')));};
        });
        audio.forEach(function(part){if(!stopped&&part.player.load)part.player.load();});
        playPart(0);
      }catch(error){finish(new Error(patientMessage('Dana’s live audio could not load. Try Resume.')));}
      return handle;
    }
    function finishEncounter(){
      if(closed)return Promise.reject(cancelled());
      if(finishPromise)return finishPromise;
      finished=true;
      Array.from(players).forEach(function(player){player.stop();});
      finishPromise=(async function(){
        if(sessionPromise)await sessionPromise;
        if(closed)throw cancelled();
        if(!sessionId)return{finished:true,retryTurnIds:[]};
        await Promise.all(Array.from(cancellations));
        var value=await json('/api/dana/session/'+encodeURIComponent(sessionId)+'/finish',{});
        if(!value||value.finished!==true||!Array.isArray(value.retryTurnIds)||value.retryTurnIds.length>10
          ||value.retryTurnIds.some(function(id){return !(typeof id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(id)||Number.isInteger(id)&&id>0&&id<=10);})
          ||new Set(value.retryTurnIds.map(String)).size!==value.retryTurnIds.length)throw new Error(patientMessage('Dana could not prepare this encounter for reflection.'));
        return{finished:true,retryTurnIds:value.retryTurnIds.slice()};
      })().catch(function(error){finishPromise=null;throw error;});
      return finishPromise;
    }
    function createRetry(turnId){
      if(closed||initial&&initial.retry)return Promise.reject(cancelled());
      if(!(typeof turnId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(turnId)||Number.isInteger(turnId)&&turnId>0&&turnId<=10))return Promise.reject(new Error('Choose a question from this encounter.'));
      var selection=String(turnId);
      if(retrySelection!==null&&retrySelection!==selection)return Promise.reject(new Error('This encounter already has a practice moment selected.'));
      if(retryPromise)return retryPromise;
      retrySelection=selection;
      var retrySent=false;
      retryPromise=(async function(){
        var result=await finishEncounter();
        if(closed||!result.retryTurnIds.some(function(id){return String(id)===selection;}))throw new Error('That practice moment is unavailable.');
        retrySent=true;
        var value=await json('/api/dana/session/'+encodeURIComponent(sessionId)+'/retry',{turnId:turnId});
        if(!value||typeof value.sessionId!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(value.sessionId)||String(value.sourceTurnId)!==selection)throw new Error(patientMessage('Dana returned an invalid practice moment.'));
        if(closed){await removeSession(value.sessionId);throw cancelled();}
        if((newCase||Object.prototype.hasOwnProperty.call(value,'caseId'))&&value.caseId!==caseId){await removeSession(value.sessionId);throw new Error('The server returned the wrong practice case.');}
        var child=createClient(env,{sessionId:value.sessionId,retry:true,caseId:caseId});children.add(child);
        return{client:child,sourceTurnId:value.sourceTurnId};
      })().catch(function(error){retryPromise=null;if(!retrySent)retrySelection=null;throw error;});
      return retryPromise;
    }
    function end(){
      if(closed)return Promise.resolve();closed=true;
      requests.forEach(function(abort){abort.abort();});requests.clear();
      Array.from(players).forEach(function(player){player.stop();});recordings.clear();
      var pending=Array.from(children).map(function(child){return child.end();});children.clear();
      var id=sessionId;sessionId=null;if(id)pending.push(removeSession(id));return Promise.all(pending).then(function(){});
    }
    return{health:async function(){try{var value=await json('/api/dana/health');return value.configured===true&&((!newCase&&!Object.prototype.hasOwnProperty.call(value,'cases'))||Array.isArray(value.cases)&&value.cases.includes(caseId));}catch(error){return false;}},start:start,respond:respond,speak:speak,openingPlayed:openingPlayed,finish:finishEncounter,createRetry:createRetry,end:end};
  }
  return{createClient:createClient};
});
