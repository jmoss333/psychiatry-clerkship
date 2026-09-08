(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.FamilyVisit = api; if (root.document.getElementById('family-root')) api.mount(root); }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var CASE_ID = 'family_morgan_maya_001';
  var ROLES = ['morgan', 'maya'], CHANNELS = ['public', 'morgan-private', 'maya-private'];
  var names = {morgan:'Morgan',maya:'Maya',learner:'You'};
  function aborted() { return new DOMException('Cancelled', 'AbortError'); }
  function identifier(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
  function createClient(env) {
    var caseHash = null, known = new Set();
    function validateRoom(room, expected) {
      if (!room || !identifier(room.sessionId) || expected && room.sessionId !== expected || room.caseId !== CASE_ID || room.caseHash !== caseHash || !CHANNELS.includes(room.channel) || !Array.isArray(room.events) || !Number.isInteger(room.turnCount) || !Number.isInteger(room.maxTurns)) throw new Error('The family room returned an inconsistent visit. Clear and start again.');
      for (var event of room.events) {
        if (!event || !identifier(event.id) || !['learner','segment','transition'].includes(event.kind) || event.text !== undefined && (typeof event.text !== 'string' || event.text.length > 2400) || event.roleId && !ROLES.concat('learner').includes(event.roleId)) throw new Error('The family room returned an invalid conversation event.');
      }
      return room;
    }
    async function fetchResponse(path, body, signal, method) {
      var response = await env.fetch('/api/family/' + path, {method:method || 'POST',headers:body === undefined ? {} : {'Content-Type':'application/json'},body:body === undefined ? undefined : JSON.stringify(body),credentials:'omit',cache:'no-store',signal:signal});
      if (!response.ok) {
        var message = 'The family room could not complete that action. No question was sent again automatically.';
        try { var error = await response.json(); error=error.error||error; if (typeof error.message === 'string' && error.message.length < 260) message = error.message; } catch (_) {}
        throw new Error(message);
      }
      return response;
    }
    async function json(path, body, signal, method) { return (await fetchResponse(path,body,signal,method)).json(); }
    async function stream(path, body, onSegment, signal, expectedRole) {
      if (!known.has(body.sessionId)) throw new Error('Start a family visit first.');
      var response = await fetchResponse(path,body,signal), reader = response.body && response.body.getReader();
      if (!reader) throw new Error('This browser could not read the family response.');
      var decoder = new TextDecoder(), pending = '', bytes = 0, complete = null, groupId = null, roleId = null, issued = new Set();
      function receive(line) {
        if (!line.trim()) return;
        if (complete) throw new Error('The family response continued after completion.');
        var event = JSON.parse(line);
        if (event.type === 'error') throw new Error(typeof event.message === 'string' && event.message.length < 260 ? event.message : 'The family response stopped. Pause, then resume when ready.');
        if (event.type === 'segment') {
          var segment = event.segment;
          if(body.groupId && event.groupId!==body.groupId || expectedRole && segment && segment.roleId!==expectedRole)throw new Error('The queued family speaker did not match this exchange.');
          if (!identifier(event.groupId) || groupId && groupId !== event.groupId || !segment || !identifier(segment.id) || issued.has(segment.id) || issued.size >= 2 || !ROLES.includes(segment.roleId) || roleId && roleId !== segment.roleId || body.targetRoleId && body.targetRoleId !== 'both' && body.targetRoleId !== segment.roleId || typeof segment.text !== 'string' || !segment.text.trim() || segment.text.length > 900 || typeof segment.audioUrl !== 'string' || !/^\/api\/family\/audio\/[A-Za-z0-9_-]{1,128}$/.test(segment.audioUrl)) throw new Error('The family response contained an invalid speaker or audio segment.');
          groupId=event.groupId;roleId=segment.roleId;issued.add(segment.id);onSegment(event);
        } else if (event.type === 'complete') {
          if (!issued.size || event.groupId !== groupId || event.roleId !== roleId || !Array.isArray(event.remainingRoles) || event.remainingRoles.some(function (id) { return !ROLES.includes(id); })) throw new Error('The family response did not finish consistently.');
          validateRoom(event.room,body.sessionId);complete=event;
        } else throw new Error('The family response was not recognized.');
      }
      try {
        while (true) {
          var next = await reader.read(); if (next.done) break;
          bytes += next.value.length; if (bytes > 150000) throw new Error('The family response was too large.');
          pending += decoder.decode(next.value,{stream:true});
          var lines = pending.split('\n');pending=lines.pop();for (var line of lines) receive(line);
        }
        pending+=decoder.decode();if(pending.trim())receive(pending);
        if(!complete)throw new Error('The family response ended before completion.');
        return complete;
      } catch (error) { try { await reader.cancel(); } catch (_) {} throw error; }
      finally { reader.releaseLock(); }
    }
    return {
      async health() {
        var value=await json('health',undefined,undefined,'GET');
        if(value.localOnly!==true || value.configured!==true || value.caseId!==CASE_ID || typeof value.caseHash!=='string' || !/^[a-f0-9]{64}$/.test(value.caseHash) || !Array.isArray(value.participants) || value.participants.length!==2 || value.participants.some(function(p,i){return p.id!==ROLES[i] || p.name!==names[p.id];}))throw new Error('The local family server is not ready. Start the family server, then reload this page.');
        caseHash=value.caseHash;return value;
      },
      async start() { var room=validateRoom(await json('session',{}));known.add(room.sessionId);return room; },
      stream:stream,
      async receipt(body) { var value=await json('receipt',body);validateRoom(value.room,body.sessionId);return value; },
      async action(path,body) { return validateRoom(await json(path,body),body.sessionId); },
      async retry(body) { var room=validateRoom(await json('retry',body));if(room.sessionId===body.sessionId || room.sourceTurnId!==body.turnId)throw new Error('The alternative visit does not match that moment.');known.add(room.sessionId);return room; },
      async remove(id,keepalive) { var response=await env.fetch('/api/family/session/'+encodeURIComponent(id),{method:'DELETE',credentials:'omit',keepalive:!!keepalive});if(!response.ok && response.status!==404)throw new Error('The visit deletion could not be confirmed.');known.delete(id); },
    };
  }

  function mount(env) {
    var doc=env.document, el=function(id){return doc.getElementById('family-'+id);};
    if(env.location.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(env.location.hostname)) { el('status').textContent='Open the local family server to practice';return; }
    var client=createClient(env), rooms=new Map(), originalId=null, currentId=null, capture=null, captureState=null;
    var ready=false, busy=false, switching=false, finishing=false, disposed=false, blocked=false, target='both', speaker=null, work=null, activeAudio=null;
    var bookmarks=new Map(), retryUsed=false, retryBase=new Set(), transient=[], reviewChannel='public', announcedSegments=new Set();
    var informationReplay=null;
    var station=null,backchannel=null,handoffInput=null,floorRequest=null;
    var floorManager=env.SPEncounterRhythm&&env.SPEncounterRhythm.createFloorRequests({participants:[{id:'morgan',name:'Morgan'},{id:'maya',name:'Maya'}]});
    function stationState(){var room=current();if(!room)return {caseId:CASE_ID,phase:'idle',transcript:[],events:[],channel:'public'};return {caseId:CASE_ID,phase:ended(room)?'ended':phase(),turnCount:room.turnCount,maxTurns:room.maxTurns,transcript:room.events.filter(function(e){return e.kind==='learner'||e.kind==='segment';}).map(function(e){return {who:e.kind==='learner'?'me':'pt',text:e.text,roleId:e.roleId,turnId:e.turnId,channel:e.channel,playbackStatus:e.status==='completed'?'played':e.status};}),events:room.events,channel:room.channel,retryActive:!!isRetry(),thinkingTime:el('thinking').checked,holdTurn:el('hold').checked};}
    function stopBackchannel(){if(backchannel){backchannel.stop();backchannel=null;}if(handoffInput){handoffInput.stop();handoffInput=null;}}
    function prepareBackchannel(task){
      if(!el('headphones').checked||!env.SPEncounterRhythm)return Promise.resolve();
      return new Promise(function(resolve,reject){
        var settled=false,listener;function fail(problem){if(!settled){settled=true;reject(new Error('The headphone microphone could not start. Uncheck the setting and Resume.'));}else{error('The headphone microphone stopped. The room is paused.');pause();}}
        listener=env.SPEncounterRhythm.createListener({createInput:function(callbacks){return env.SPInterviewConversation.createSpeechInput(env,callbacks);},onReady:function(){if(!settled){env.clearTimeout(timer);settled=true;resolve();}},onAcknowledgment:function(){notice('Acknowledgment heard. The speaker can continue.');},onInterrupt:function(){if(task===work&&!task.signal.aborted)interrupt(listener);},onError:fail});
        backchannel=listener;task.listener=listener;var timer=env.setTimeout(function(){fail();listener.stop();},8000);
        function abort(){env.clearTimeout(timer);if(!settled){settled=true;reject(aborted());}}task.signal.addEventListener('abort',abort,{once:true});
        task.stopListenerWait=function(){env.clearTimeout(timer);task.signal.removeEventListener('abort',abort);};
        listener.start();
      });
    }
    function renderFloor(){
      var room=current(),allowed=room&&!ended(room)&&room.channel==='public'&&!isRetry()&&!busy&&!switching&&!blocked&&!(captureState&&(captureState.draft||captureState.interim));
      if(!allowed){el('floor').hidden=true;return;}
      if(floorManager)floorRequest=floorManager.next(room.events,room.channel);
      el('floor').hidden=!floorRequest;
      if(floorRequest){el('floor-copy').textContent=floorRequest.prompt||names[floorRequest.roleId]+' would like a turn when you are ready.';el('floor-invite').textContent='Invite '+names[floorRequest.roleId]+' next';}
    }
    function current(){return currentId&&rooms.get(currentId);}
    function original(){return originalId&&rooms.get(originalId);}
    function isRetry(){return currentId&&currentId!==originalId;}
    function ended(room){return room && ['finished','ended'].includes(room.status);}
    function notice(text){el('live').textContent=text;}
    function error(message){el('error').textContent=message;el('error').hidden=false;}
    function clearError(){el('error').hidden=true;el('error').textContent='';}
    function put(room){if(disposed)return;rooms.set(room.sessionId,room);renderLog();renderControls();}
    function phase(){return captureState?captureState.phase:'idle';}
    function controlTarget(value){if(!ROLES.concat('both').includes(value)||busy||switching||isRetry())return;var room=current();if(room&&room.channel!=='public'&&value!==room.channel.split('-')[0])return;target=value;renderControls();}
    function renderControls(){
      if(disposed)return;
      var room=current(), inRetry=isRetry(), done=ended(room), state=phase(), locked=busy||switching||finishing||blocked, started=!!room;
      el('start').hidden=started;el('start').disabled=!ready||locked;
      el('done').hidden=!started||done||!['starting','listening'].includes(state);el('done').disabled=state!=='listening'||!!(captureState&&captureState.interim)||!(captureState&&captureState.draft)||locked;
      el('pause').hidden=!started||done||['paused','error','ended'].includes(state);el('pause').disabled=switching||finishing;
      el('resume').hidden=!started||done||!['paused','error'].includes(state);el('resume').disabled=locked;
      el('repair-resume').disabled=locked||done;
      el('interrupt').hidden=!busy||done;el('interrupt').disabled=switching;
      el('end').hidden=!started||done;el('end').disabled=finishing||switching;
      el('repair').hidden=!started||done||inRetry;el('repair').disabled=locked||!room||!room.events.some(function(e){return e.kind==='segment'&&['played','completed'].includes(e.status);});
      el('hold').disabled=locked||done;el('thinking').disabled=done;
      doc.querySelectorAll('[data-target]').forEach(function(button){var id=button.dataset.target;button.setAttribute('aria-pressed',String(target===id));button.disabled=locked||done||inRetry||!!(room&&room.channel!=='public'&&room.channel.split('-')[0]!==id);});
      var hasDraft=!!(captureState&&(captureState.draft||captureState.interim));
      if(hasDraft||captureState&&captureState.speechDetected)el('repair').disabled=true;
      ['private-morgan','private-maya'].forEach(function(id){el(id).hidden=!!(room&&room.channel!=='public');el(id).disabled=!started||done||locked||inRetry||hasDraft;});
      el('rejoin').hidden=!room||room.channel==='public';el('rejoin').disabled=done||locked||inRetry||hasDraft;
      var channel=room?room.channel:'public';el('channel-label').textContent=channel==='public'?'Together · Morgan and Maya':'Private check-in · '+names[channel.split('-')[0]];
      el('channel-help').textContent=channel==='public'?'One person speaks at a time. Interrupting stops the current voice and any queued reply.':'Only you and '+names[channel.split('-')[0]]+' are in this check-in. Its dialogue will stay private when you rejoin.';
      ROLES.forEach(function(id){var present=channel==='public'||channel.split('-')[0]===id;el('person-'+id).classList.toggle('active',speaker===id);el('voice-'+id).textContent=!present?'Outside this check-in':speaker===id?'Speaking':'In the room';});
      el('draft').textContent=captureState?captureState.caption:'';
      el('count').textContent=(room?room.turnCount:0)+' of '+(room?room.maxTurns:10)+(inRetry?' alternative turns':' turns');
      var status=!ready?'Checking the family room…':!started?'Family room ready':done?inRetry?'Alternative complete — microphone off':'Visit ended — microphone off':switching?'Changing rooms — microphone off':speaker?names[speaker]+' is speaking':busy?'Listening to your question…':state==='listening'?'Listening':state==='starting'?'Connecting microphone…':state==='paused'?'Paused — microphone off':state==='error'?'Microphone off — check the message':'Ready';
      if(finishing)status='Closing the visit — microphone off';el('status').textContent=status;
      el('retry-banner').hidden=!inRetry;el('alternative').hidden=!retryUsed;
      el('back-original').hidden=!inRetry||!done;
      el('bookmark').disabled=!started||inRetry||!original()||!original().events.some(function(e){return e.kind==='learner';});
      el('reflection').hidden=!original()||!ended(original());
      doc.querySelectorAll('[data-information-turn]').forEach(function(button){button.hidden=!!inRetry;button.disabled=locked||!!inRetry||!ended(original());});
      if(inRetry&&informationReplay)closeInformation(false);
      el('clear').hidden=!started;el('clear').disabled=busy||switching||finishing;
      el('headphones').disabled=started&&(!['paused','error'].includes(state)||locked)||done;
      el('caption-reading').disabled=started&&(!['paused','error'].includes(state)||locked)||done;
      renderFloor();if(station)station.update(stationState());
    }
    function makeMessage(event){
      var item=doc.createElement('article');item.className='message';var role=event.kind==='learner'?'learner':event.roleId;item.dataset.role=role;
      var line=doc.createElement('div');line.className='byline';var who=doc.createElement('span');who.textContent=names[role]||'You';line.appendChild(who);
      var delivery=doc.createElement('span');delivery.className='delivery';var s=event.status;
      delivery.textContent=event.kind==='learner'?(event.targetRoleId?'to '+(event.targetRoleId==='both'?'both':names[event.targetRoleId]):''):['played','completed'].includes(s)?'Completed':s==='speaking'?'Speaking':s==='interrupted'||s==='cancelled'||s==='failed'?'Interrupted / not confirmed heard':'Preparing';line.appendChild(delivery);item.appendChild(line);
      var text=doc.createElement('div');text.textContent=event.text||'';item.appendChild(text);return item;
    }
    function eventsFor(room){
      if(!room)return[];var events=room.events.slice();
      if(room.sessionId===currentId)transient.forEach(function(e){var at=events.findIndex(function(x){return x.segmentId===e.segmentId;});if(at<0)events.push(e);else events[at]=Object.assign({},events[at],e);});
      return events;
    }
    function drawLog(node,events,channel,exclude){
      node.replaceChildren();var shown=events.filter(function(e){return e.kind!=='transition'&&e.channel===channel&&(!exclude||!exclude.has(e.id));});
      shown.forEach(function(e){node.appendChild(makeMessage(e));});
      if(!shown.length){var p=doc.createElement('p');p.className='empty';p.textContent=channel==='public'?'You can begin by hearing each person’s agenda.':'This private check-in has no dialogue yet.';node.appendChild(p);}
    }
    function renderLog(){
      var room=current(), parent=original();if(!parent)return;
      var channel=isRetry()?reviewChannel:room.channel;el('log-title').textContent=channel==='public'?'In the room':'Private check-in with '+names[channel.split('-')[0]];
      drawLog(el('log'),eventsFor(parent),channel);
      if(isRetry())drawLog(el('alternative-log'),eventsFor(room),room.channel,retryBase);
    }
    function announceCompleted(room,groupId){
      if(!el('caption-reading').checked||!room)return;
      var fresh=room.events.filter(function(event){return event.kind==='segment'&&event.groupId===groupId&&event.status==='completed'&&!announcedSegments.has(event.segmentId||event.id);});
      if(!fresh.length)return;fresh.forEach(function(event){announcedSegments.add(event.segmentId||event.id);});
      notice(fresh.map(function(event){return names[event.roleId]+': '+event.text;}).join(' ')+' Completed caption. Choose Resume when you are ready to speak.');
      el('log').focus({preventScroll:true});
    }
    function stopAudio(){if(activeAudio){activeAudio.stop();activeAudio=null;}speaker=null;}
    function wait(ms,signal){return new Promise(function(resolve,reject){var id=env.setTimeout(finish,ms);function abort(){env.clearTimeout(id);signal&&signal.removeEventListener('abort',abort);reject(aborted());}function finish(){signal&&signal.removeEventListener('abort',abort);resolve();}if(signal){signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();}});}
    function play(segment,task){
      return new Promise(function(resolve,reject){
        if(task.signal.aborted||task.cancelled||task!==work)return reject(aborted());
        var player=new env.Audio(segment.audioUrl), settled=false,timer;
        var event={id:'pending-'+segment.id,kind:'segment',roleId:segment.roleId,text:segment.text,channel:task.channel,turnId:task.turnId,groupId:task.groupId,segmentId:segment.id,status:'speaking'};
        transient.push(event);speaker=segment.roleId;renderLog();renderControls();notice(names[speaker]+' is speaking.');
        function finish(problem){if(settled)return;settled=true;env.clearTimeout(timer);task.signal.removeEventListener('abort',cancel);player.onended=player.onerror=null;if(activeAudio&&activeAudio.player===player)activeAudio=null;
          if(problem){event.status='interrupted';try{player.pause();player.removeAttribute&&player.removeAttribute('src');player.load&&player.load();}catch(_){}reject(problem);}else{event.status='played';task.completed.push(segment.id);resolve();}speaker=null;renderLog();renderControls();}
        function cancel(){finish(aborted());}
        activeAudio={player:player,stop:cancel};task.signal.addEventListener('abort',cancel,{once:true});
        player.onended=function(){finish();};player.onerror=function(){finish(new Error('Audio stopped before finishing. The room is paused; the unfinished part is not treated as heard.'));};
        timer=env.setTimeout(function(){finish(new Error('Audio took too long to finish. Resume when you are ready.'));},65000);
        try{var result=player.play();if(result&&result.catch)result.catch(function(){finish(new Error('The browser blocked voice playback. Resume to try a fresh turn.'));});}catch(_){finish(new Error('This browser could not play the family voice.'));}
      });
    }
    function cancelServer(task){
      if(!task)return Promise.resolve();task.cancelled=true;if(task.cancelPromise)return task.cancelPromise;
      var body={sessionId:task.sessionId,completedSegmentIds:task.completed.slice()};if(task.groupId)body.groupId=task.groupId;
      task.cancelPromise=client.action('cancel',body).then(function(room){put(room);transient=[];renderLog();}).catch(function(){blocked=true;error('The stop request could not be confirmed. Clear this visit before starting another question.');throw new Error('The room could not confirm that it stopped.');});
      task.cancelPromise.catch(function(){});return task.cancelPromise;
    }
    async function respond(text,options){
      var room=current(),task={sessionId:room.sessionId,turnId:room.turnCount+1,channel:room.channel,signal:options.signal,completed:[],groupId:null,cancelPromise:null};
      work=task;busy=true;clearError();renderControls();
      function cancel(){stopAudio();cancelServer(task);}
      task.signal.addEventListener('abort',cancel,{once:true});
      var path='turn',expectedRole=target==='both'?'morgan':target,body={sessionId:task.sessionId,turnId:task.turnId,text:text,targetRoleId:target,channel:task.channel};
      try{
        await prepareBackchannel(task);if(task.signal.aborted)throw aborted();
        while(true){
          var queue=Promise.resolve(),audioError=null;
          var result=await client.stream(path,body,function(event){
            task.groupId=event.groupId;
            queue=queue.then(function(){return play(event.segment,task);});queue.catch(function(problem){audioError=problem;});
          },task.signal,expectedRole);
          await queue;if(audioError)throw audioError;if(task.signal.aborted)throw aborted();
          put(result.room);
          var receipt=await client.receipt({sessionId:task.sessionId,groupId:task.groupId,completedSegmentIds:task.completed.slice(),status:'played'});
          if(task.signal.aborted)throw aborted();put(receipt.room);transient=[];renderLog();announceCompleted(receipt.room,task.groupId);
          if(!receipt.canContinue)break;
          speaker=null;el('status').textContent=names[result.remainingRoles[0]]+' can respond next…';await wait(650,task.signal);
          expectedRole=result.remainingRoles[0];path='continue';body={sessionId:task.sessionId,groupId:task.groupId};
        }
        // Preserve words begun at the end of playback rather than closing and
        // reopening a recognizer between the patient and learner turns.
        if(backchannel===task.listener&&backchannel){handoffInput=backchannel;backchannel=null;}
        return {deliveryManaged:true,pauseAfterDelivery:el('caption-reading').checked};
      }catch(problem){stopAudio();await cancelServer(task);throw problem;}
      finally{task.signal.removeEventListener('abort',cancel);task.stopListenerWait&&task.stopListenerWait();if(backchannel===task.listener){backchannel.stop();backchannel=null;}if(work===task){work=null;busy=false;speaker=null;renderControls();}}
    }
    function createCapture(initiallyPaused){
      capture=env.SPInterviewTurns.createController({skipOpening:true,externalDelivery:true,initiallyPaused:!!initiallyPaused,maxTurns:current().maxTurns,
        input:function(callbacks){if(handoffInput){var listener=handoffInput;handoffInput=null;return listener.takeInput(callbacks);}return env.SPInterviewConversation.createSpeechInput(env,callbacks);},respond:respond,
        setTimeout:env.setTimeout.bind(env),clearTimeout:env.clearTimeout.bind(env),
        onChange:function(snapshot){captureState=snapshot;renderControls();if(snapshot.error)error(snapshot.error);if(snapshot.phase==='ended'&&current()&&!ended(current())&&!finishing&&!switching)finishVisit();}
      });
      capture.setThinkingTime(el('thinking').checked);capture.setHoldTurn(el('hold').checked);
    }
    async function stopCapture(mode){
      var task=work;stopBackchannel();if(capture)capture.pause();stopAudio();
      if(task)await cancelServer(task);if(mode==='end'&&capture)capture.end();
    }
    async function start(){
      if(!ready||busy||switching||current())return;switching=true;clearError();renderControls();
      try{var room=await client.start();if(disposed){client.remove(room.sessionId,true);return;}originalId=currentId=room.sessionId;put(room);createCapture(doc.hidden);switching=false;if(!doc.hidden)capture.start();}
      catch(problem){error(problem.message);}finally{switching=false;renderControls();}
    }
    async function pause(){if(!capture||switching||finishing)return;switching=true;try{await stopCapture();}catch(_){}finally{switching=false;renderControls();}}
    async function interrupt(listener){if(disposed||!capture||!busy||switching)return;switching=true;clearError();var task=work;try{if(listener&&typeof listener.takeInput==='function'){if(backchannel===listener)backchannel=null;capture.pause();stopAudio();if(task)await cancelServer(task);if(!disposed&&!doc.hidden){handoffInput=listener;capture.resume();}else listener.stop();}else{await stopCapture();if(!disposed&&!doc.hidden)capture.resume();}}catch(_){listener&&listener.stop&&listener.stop();}finally{switching=false;renderControls();}}
    async function changeChannel(channel){
      if(!current()||switching||busy||finishing||isRetry()||ended(current())||captureState&&(captureState.draft||captureState.interim))return;
      switching=true;clearError();renderControls();
      try{await stopCapture();if(disposed)return;var room=await client.action('channel',{sessionId:currentId,channel:channel});if(disposed)return;put(room);target=channel==='public'?'both':channel.split('-')[0];el('repair-panel').hidden=true;notice(channel==='public'?'The family has rejoined.':'Private check-in with '+names[target]+'.');if(!doc.hidden)capture.resume();}
      catch(problem){error(problem.message);}finally{switching=false;renderControls();}
    }
    async function finishVisit(){
      if(!current()||finishing||ended(current()))return;finishing=true;renderControls();
      try{await stopCapture('end');put(await client.action('finish',{sessionId:currentId}));if(!isRetry()&&!bookmarks.size){var last=current().events.filter(function(e){return e.kind==='learner';}).at(-1);if(last)bookmarks.set(last.turnId,{turnId:last.turnId,note:''});}renderBookmarks();if(!isRetry())el('reflection-title').focus();}
      catch(problem){error(problem.message);}finally{finishing=false;renderControls();}
    }
    function bookmark(){
      var room=original();if(!room||isRetry())return;var last=room.events.filter(function(e){return e.kind==='learner';}).at(-1);if(!last)return;
      var duplicate=bookmarks.has(last.turnId);if(!duplicate)bookmarks.set(last.turnId,{turnId:last.turnId,note:''});
      el('bookmark-status').textContent='Exchange '+last.turnId+(duplicate?' is already bookmarked.':' bookmarked for reflection.');if(ended(room))renderBookmarks();
    }
    function renderBookmarks(){
      var room=original();if(!room||!ended(room))return;closeInformation(false);var container=el('bookmarks');container.replaceChildren();
      if(!bookmarks.size){var empty=doc.createElement('p');empty.className='fine';empty.textContent='No submitted exchanges to revisit yet.';container.appendChild(empty);}
      bookmarks.forEach(function(mark){
        var question=room.events.find(function(e){return e.kind==='learner'&&e.turnId===mark.turnId;});if(!question)return;
        var article=doc.createElement('article');article.className='bookmark';var title=doc.createElement('h3');title.textContent='Exchange '+mark.turnId;article.appendChild(title);
        var context=doc.createElement('p');context.className='fine';context.textContent=(question.channel==='public'?'Together':'Private with '+names[question.channel.split('-')[0]])+' · addressed to '+(question.targetRoleId==='both'?'both':names[question.targetRoleId]);article.appendChild(context);
        var quote=doc.createElement('blockquote');quote.textContent=question.text;article.appendChild(quote);
        var label=doc.createElement('label');label.htmlFor='family-note-'+mark.turnId;label.textContent='What would you like to try differently? (optional)';article.appendChild(label);
        var note=doc.createElement('textarea');note.id=label.htmlFor;note.value=mark.note;note.maxLength=1200;note.addEventListener('input',function(){mark.note=note.value;});article.appendChild(note);
        var information=doc.createElement('button');information.id='family-information-'+mark.turnId;information.dataset.informationTurn=String(mark.turnId);information.textContent='What information was available?';information.setAttribute('aria-expanded','false');information.hidden=!!isRetry();information.disabled=busy||switching||!!isRetry();information.addEventListener('click',function(){openInformation(mark.turnId,information);});article.appendChild(information);
        var button=doc.createElement('button');button.id='family-retry-'+mark.turnId;button.textContent=retryUsed?'One alternative already opened':'Try this moment again';button.disabled=retryUsed||busy||switching||!Array.isArray(room.retryEligibleTurnIds)||!room.retryEligibleTurnIds.includes(mark.turnId);button.addEventListener('click',function(){retryFrom(mark.turnId);});article.appendChild(button);container.appendChild(article);
      });
    }
    function replayText(parent,tag,text,id,className){
      var node=doc.createElement(tag);node.textContent=text;if(id)node.id='family-information-'+id;if(className)node.className=className;parent.appendChild(node);return node;
    }
    function closeInformation(restoreFocus){
      if(!informationReplay)return;
      var trigger=doc.getElementById(informationReplay.triggerId);informationReplay.panel.remove();informationReplay=null;
      if(trigger){trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');if(restoreFocus)trigger.focus();}
    }
    function showInformationPerson(id,moveFocus){
      if(!informationReplay)return;var replay=informationReplay,view=replay.data.views.find(function(item){return item.id===id;});if(!view)return;
      replay.panel.querySelectorAll('[role="tab"]').forEach(function(tab){var selected=tab.dataset.person===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(selected&&moveFocus)tab.focus();});
      replay.panel.querySelectorAll('[role="tabpanel"]').forEach(function(node){node.hidden=node.dataset.person!==id;node.replaceChildren();});
      var body=doc.getElementById('family-information-panel-'+id),person=id==='learner'?'you':names[id];
      function entries(title,values,empty){
        replayText(body,'h3',title);if(!values.length){replayText(body,'p',empty,null,'fine');return;}
        values.forEach(function(entry){
          var item=doc.createElement('div');item.className='information-entry';
          var speaker=entry.kind==='learner'?'You → '+(entry.targetRoleId==='both'?'Morgan and Maya':names[entry.targetRoleId]):names[entry.roleId];
          replayText(item,'p','Exchange '+entry.turnId+' · '+speaker+(entry.channel==='public'?' · shared':' · private with '+names[entry.channel.split('-')[0]]),null,'fine');
          replayText(item,'blockquote',entry.text);body.appendChild(item);
        });
      }
      entries('Shared conversation',view.shared,'No earlier shared dialogue before this question.');
      entries(id==='learner'?'Your private conversations':'Private conversations with you',view.private,'No earlier completed private dialogue in this conversation record.');
      if(view.excludedPrivateCount)replayText(body,'p',view.excludedPrivateCount+' earlier private conversation '+(view.excludedPrivateCount===1?'entry was':'entries were')+' not part of the conversation record available to '+person+'. Those words are not included in this view.',null,'information-boundary');
      if(view.unconfirmedCount)replayText(body,'p',view.unconfirmedCount+' earlier audio '+(view.unconfirmedCount===1?'segment was':'segments were')+' interrupted or unconfirmed. Those words are not included as completed dialogue.',null,'information-boundary');
      replayText(body,'p','This shows the conversation record, not proof of what '+person+' heard or understood. It does not establish permission to share a private exchange.',null,'fine');
      if(moveFocus)notice('Showing '+(id==='learner'?'your':names[id]+'’s')+' earlier conversation record before exchange '+replay.data.turnId+'.');
    }
    function openInformation(turnId,trigger){
      if(disposed||isRetry()||busy||switching||finishing||!ended(original())||!bookmarks.has(turnId))return;
      var data=env.FamilyInformationReplay&&env.FamilyInformationReplay.buildReplay(original(),turnId);
      if(!data){notice('This moment could not be reconstructed from the visit record.');return;}
      closeInformation(false);
      var panel=doc.createElement('section');panel.id='family-information-replay';panel.className='information-replay';panel.setAttribute('aria-labelledby','family-information-title');
      var top=doc.createElement('div');top.className='information-top';panel.appendChild(top);
      var heading=replayText(top,'h2','Before exchange '+data.turnId,'title');heading.tabIndex=-1;
      var close=replayText(top,'button','Close replay','close');close.type='button';close.addEventListener('click',function(){closeInformation(true);});
      var question=data.question;
      replayText(panel,'p','Immediately before your question · '+(question.channel==='public'?'Together':'Private check-in with '+names[question.channel.split('-')[0]])+' · addressed to '+(question.targetRoleId==='both'?'Morgan and Maya':names[question.targetRoleId]),'context','fine');
      replayText(panel,'blockquote',question.text,'question');
      replayText(panel,'p','Earlier conversation only. Unspoken case background is not shown. Switch people to compare their records; the original visit stays unchanged.',null,'fine');
      var tabs=doc.createElement('div');tabs.className='information-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Whose conversation record?');panel.appendChild(tabs);
      ['learner','morgan','maya'].forEach(function(id){
        var tab=replayText(tabs,'button',id==='learner'?'You, the student':names[id],'tab-'+id);tab.type='button';tab.dataset.person=id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','family-information-panel-'+id);tab.addEventListener('click',function(){showInformationPerson(id,true);});
        var body=doc.createElement('div');body.id='family-information-panel-'+id;body.dataset.person=id;body.setAttribute('role','tabpanel');body.setAttribute('aria-labelledby',tab.id);body.tabIndex=0;body.hidden=true;panel.appendChild(body);
      });
      replayText(panel,'p','What might you check about the other person’s understanding before asking your next question?',null,'information-prompt');
      panel.addEventListener('keydown',function(event){
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeInformation(true);return;}
        var tab=event.target.closest('[role="tab"]');if(!tab||event.ctrlKey||event.altKey||event.metaKey)return;
        var ids=['learner','morgan','maya'],at=ids.indexOf(tab.dataset.person),next={ArrowRight:(at+1)%3,ArrowLeft:(at+2)%3,Home:0,End:2}[event.key];
        if(next!==undefined){event.preventDefault();showInformationPerson(ids[next],true);}
      });
      informationReplay={data:data,triggerId:trigger.id,panel:panel};trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',panel.id);trigger.closest('.bookmark').appendChild(panel);
      showInformationPerson(question.targetRoleId==='both'?'learner':question.targetRoleId,false);heading.focus();panel.scrollIntoView({block:'nearest',behavior:'auto'});
    }
    async function retryFrom(turnId){
      if(retryUsed||busy||switching||!ended(original()))return;closeInformation(false);switching=true;clearError();renderControls();
      try{var child=await client.retry({sessionId:originalId,turnId:turnId});if(disposed){client.remove(child.sessionId,true).catch(function(){});return;}retryUsed=true;reviewChannel=child.channel;currentId=child.sessionId;retryBase=new Set(child.events.map(function(e){return e.id;}));target=child.targetRoleId;transient=[];put(child);captureState=null;createCapture(true);el('alternative-context').textContent='Before original exchange '+turnId+' · '+(child.channel==='public'?'Together':'Private with '+names[child.channel.split('-')[0]])+'. One alternative; the original remains above.';renderBookmarks();switching=false;
        // Preparing a retry never silently opens a microphone; Resume is explicit.
        el('alternative').scrollIntoView({block:'nearest',behavior:'auto'});notice('Alternative ready. Choose Resume when you are ready to speak.');
      }catch(problem){error(problem.message);}finally{switching=false;renderControls();}
    }
    async function clear(){
      if(switching||finishing)return;closeInformation(false);switching=true;
      try{await stopCapture('end');}catch(_){}
      try{if(originalId)await client.remove(originalId);}catch(_){error('The deletion request could not be confirmed. The server copy expires after 30 minutes.');}
      rooms.clear();bookmarks.clear();announcedSegments.clear();originalId=currentId=null;capture=null;captureState=null;retryUsed=false;retryBase.clear();transient=[];speaker=null;busy=false;blocked=false;target='both';work=null;floorRequest=null;floorManager=env.SPEncounterRhythm&&env.SPEncounterRhythm.createFloorRequests({participants:[{id:'morgan',name:'Morgan'},{id:'maya',name:'Maya'}]});if(station){station.dispose();station=null;mountStation();}el('bookmarks').replaceChildren();el('alternative-log').replaceChildren();el('log').replaceChildren();el('log-title').textContent='In the room';el('repair-panel').hidden=true;el('bookmark-status').textContent='';el('teaching').hidden=true;switching=false;renderControls();notice('Visit cleared.');
    }
    el('start').addEventListener('click',start);el('done').addEventListener('click',function(){capture&&capture.doneSpeaking();});el('pause').addEventListener('click',pause);el('resume').addEventListener('click',function(){if(!switching&&!busy&&!blocked&&capture){clearError();el('repair-panel').hidden=true;capture.resume();}});el('interrupt').addEventListener('click',function(){interrupt();});el('end').addEventListener('click',function(){if(!station||station.requestClose()!==false)finishVisit();});
    el('floor-invite').addEventListener('click',function(){if(!floorRequest||busy||switching)return;var role=floorRequest.roleId;floorManager.invite(floorRequest);floorRequest=null;controlTarget(role);notice('Addressing '+names[role]+'. Invite them to speak in your own words.');renderControls();});
    el('floor-defer').addEventListener('click',function(){if(floorRequest&&floorManager)floorManager.defer(floorRequest);floorRequest=null;renderControls();});
    doc.querySelectorAll('[data-target]').forEach(function(button){button.addEventListener('click',function(){controlTarget(button.dataset.target);});});
    el('thinking').addEventListener('change',function(){capture&&capture.setThinkingTime(this.checked);});el('hold').addEventListener('change',function(){capture&&capture.setHoldTurn(this.checked);});
    ['log','alternative-log'].forEach(function(id){var log=el(id);log.addEventListener('focusin',function(){if(capture)capture.setHoldTurn(true);});log.addEventListener('focusout',function(event){if(capture&&!log.contains(event.relatedTarget))capture.setHoldTurn(el('hold').checked);});});
    el('private-morgan').addEventListener('click',function(){changeChannel('morgan-private');});el('private-maya').addEventListener('click',function(){changeChannel('maya-private');});el('rejoin').addEventListener('click',function(){changeChannel('public');});
    el('bookmark').addEventListener('click',bookmark);el('clear').addEventListener('click',clear);el('teaching-toggle').addEventListener('click',function(){el('teaching').hidden=!el('teaching').hidden;});
    el('repair').addEventListener('click',async function(){if(disposed||busy||switching||captureState&&(captureState.draft||captureState.interim||captureState.speechDetected))return;await pause();if(disposed)return;var room=current(),last=room&&room.events.filter(function(e){return e.kind==='segment'&&e.channel===room.channel&&['played','completed'].includes(e.status);}).at(-1);el('repair-quote').textContent=last?names[last.roleId]+': '+last.text:'No completed words were confirmed.';el('repair-panel').hidden=false;el('repair-title').focus();if(station&&last){var person=env.SPEncounterProfiles.getProfile(CASE_ID).participants.find(function(p){return p.id===last.roleId;});if(person)station.update(Object.assign({},stationState(),{cue:{text:person.cues.repair,channel:room.channel}}));}});
    el('repair-resume').addEventListener('click',function(){if(!busy&&!switching&&!blocked&&capture){el('repair-panel').hidden=true;clearError();capture.resume();}});
    el('back-original').addEventListener('click',function(){if(isRetry()&&ended(current())){currentId=originalId;capture=null;captureState=null;target=original().targetRoleId||'both';renderLog();renderControls();renderBookmarks();}});
    doc.addEventListener('keydown',function(event){var element=event.target;if(event.repeat||element&&element.closest&&element.closest('input,textarea,select,button,a,summary,[role="log"],[contenteditable="true"]'))return;
      if(event.code==='Space'&&capture&&!busy&&!switching){event.preventDefault();capture.doneSpeaking();}
      else if(event.code==='Escape'&&busy){event.preventDefault();interrupt();}
      else if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&['Digit1','Digit2','Digit3'].includes(event.code)){event.preventDefault();controlTarget({Digit1:'morgan',Digit2:'maya',Digit3:'both'}[event.code]);}
      else if(event.altKey&&event.shiftKey&&event.code==='KeyB'){event.preventDefault();bookmark();}
    });
    doc.addEventListener('visibilitychange',function(){if(doc.hidden&&capture&&!ended(current()))pause();});
    env.addEventListener('pagehide',function(){disposed=true;closeInformation(false);stopBackchannel();station&&station.dispose();if(capture)capture.pause();stopAudio();if(originalId)client.remove(originalId,true).catch(function(){});});
    client.health().then(function(){if(disposed)return;ready=true;renderControls();}).catch(function(problem){el('status').textContent='Family server unavailable';error(problem.message);});
    function mountStation(){if(env.SPEncounterUI&&env.SPEncounterProfiles)station=env.SPEncounterUI.mount(el('station'),{window:env,caseId:CASE_ID,profiles:env.SPEncounterProfiles,afterHost:el('reflection'),createSpeechInput:function(callbacks){return env.SPInterviewConversation.createSpeechInput(env,callbacks);},onPause:pause,onResume:function(){if(!blocked&&!busy&&!switching&&capture)capture.resume();},onEnd:finishVisit,onRepair:function(){el('repair').click();},onRetry:function(turnId){return retryFrom(Number(turnId));}});}
    mountStation();renderControls();return {client:client,getRoom:current};
  }
  return {createClient:createClient,mount:mount};
});
