/* Student station for the hosted encounter. A projection of the controller
   snapshot: no network call, no browser storage, no provider work. */
(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DanaStation=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var PHASES={gate:'idle',ready:'paused',connecting:'starting',listening:'listening',responding:'awaiting_patient',speaking:'speaking',paused:'paused',restart:'error',ended:'ended'};
  var LEARNER={pending:'pending',unconfirmed:'failed'};
  var FAMILY_NAMES={morgan:'Morgan',maya:'Maya'};
  function attributed(value,source){
    if(Object.prototype.hasOwnProperty.call(FAMILY_NAMES,source.targetRoleId)){value.targetRoleId=source.targetRoleId;value.targetName=FAMILY_NAMES[source.targetRoleId];}
    if(Object.prototype.hasOwnProperty.call(FAMILY_NAMES,source.speakerId)){value.speakerId=source.speakerId;value.speakerName=FAMILY_NAMES[source.speakerId];}
    return value;
  }

  // The station and bookmark logic use the local prototype's shape. Family
  // identity travels as metadata; raw speech and heard prefixes stay unchanged.
  function stationSnapshot(hosted){
    hosted=hosted||{};
    var phase=PHASES[hosted.phase]||'idle';
    var transcript=(hosted.messages||[]).map(function(message){
      if(message.role==='you'){
        var learner={who:'me',text:message.text},status=LEARNER[message.status];
        if(status)learner.responseStatus=status;
        return attributed(learner,message);
      }
      var entry={who:'pt',text:message.text,playbackStatus:message.status==='preparing'?'pending':message.status};
      // Only whole completed segments were heard; the tail is never quoted.
      var segments=message.segments||[],completed=message.completedSegments||0;
      if(entry.playbackStatus!=='played'&&completed>0)entry.heardText=segments.slice(0,completed).join('');
      return attributed(entry,message);
    });
    return {phase:phase,state:phase,transcript:transcript,draft:hosted.draft||'',interim:hosted.interim||'',turn:hosted.turn||0,ended:phase==='ended'};
  }

  // Encounter-local bookmarks, ported from
  // _prototypes/sp-interview/sp-interview.bookmarks.js with family attribution. No persistence, no
  // capture controls, no provider call. The two rules that must not drift:
  // sync() refuses a moment whose learner text differs, so a turn number from
  // another encounter cannot supply a quote; and playback() uses the full
  // patient text only when it played in full, otherwise a genuine heard prefix.
  function validId(id){return Number.isInteger(id)&&id>=1&&id<=10;}
  function copy(entry){
    return attributed({id:entry.id,learnerText:entry.learnerText,danaText:entry.danaText,playbackStatus:entry.playbackStatus,reflection:entry.reflection},entry);
  }
  function submitted(snapshot){
    var transcript=snapshot&&Array.isArray(snapshot.transcript)?snapshot.transcript:[];
    var indexed=Object.create(null),latest=null,id=0;
    transcript.forEach(function(row,index){
      if(!row||row.who!=='me')return;
      id++;
      latest=null;
      if(!validId(id)||typeof row.text!=='string'||!row.text.trim())return;
      var next=transcript[index+1];
      latest=attributed({id:id,learnerText:row.text},row);
      indexed[id]={learner:row,patient:next&&next.who==='pt'?next:null};
    });
    return {latest:latest,indexed:indexed};
  }
  function playback(moment,snapshot){
    var ended=!!snapshot&&(snapshot.phase==='ended'||snapshot.state==='ended');
    var patient=moment.patient,status=patient?patient.playbackStatus:moment.learner.responseStatus;
    var allowed=patient?['pending','played','speaking','interrupted','failed','cancelled']:['pending','failed','cancelled'];
    if(allowed.indexOf(status)<0)status='pending';
    if(ended&&status==='pending')status='cancelled';
    if(ended&&status==='speaking')status='interrupted';
    var text='';
    if(patient&&typeof patient.text==='string'){
      if(status==='played')text=patient.text;
      else if(typeof patient.heardText==='string'&&patient.heardText&&patient.text.indexOf(patient.heardText)===0)text=patient.heardText;
    }
    return attributed({danaText:text,playbackStatus:status},patient||{});
  }
  function createBookmarkStore(){
    var marked=Object.create(null);
    function entries(){
      return Object.keys(marked).map(Number).sort(function(a,b){return a-b;}).map(function(id){return copy(marked[id]);});
    }
    function candidate(snapshot){return submitted(snapshot).latest;}
    function sync(snapshot){
      var moments=submitted(snapshot).indexed;
      Object.keys(marked).forEach(function(id){
        var entry=marked[id],moment=moments[id];
        // A turn number from a different encounter must not replace this moment.
        if(!moment||moment.learner.text!==entry.learnerText||moment.learner.targetRoleId!==entry.targetRoleId)return;
        var heard=playback(moment,snapshot);
        entry.danaText=heard.danaText;
        entry.playbackStatus=heard.playbackStatus;
        entry.speakerId=heard.speakerId;entry.speakerName=heard.speakerName;
      });
      return entries();
    }
    function add(snapshot){
      sync(snapshot);
      var latest=candidate(snapshot);
      if(!latest)return {added:false,entry:null};
      if(marked[latest.id])return {added:false,entry:copy(marked[latest.id])};
      marked[latest.id]=attributed({id:latest.id,learnerText:latest.learnerText,danaText:'',playbackStatus:'pending',reflection:''},latest);
      sync(snapshot);
      return {added:true,entry:copy(marked[latest.id])};
    }
    function setReflection(id,text){
      if(!validId(id)||!marked[id]||typeof text!=='string')return false;
      marked[id].reflection=text.slice(0,1200);
      return true;
    }
    function remove(id){
      if(!validId(id)||!marked[id])return false;
      delete marked[id];
      return true;
    }
    function clear(){marked=Object.create(null);}
    return {sync:sync,candidate:candidate,add:add,entries:entries,setReflection:setReflection,remove:remove,clear:clear};
  }


  function retryMoments(snapshot){
    var moments=[],turnId=0,pending=null;
    (snapshot.transcript||[]).forEach(function(entry){
      if(entry.who==='me'){turnId++;pending=attributed({turnId:turnId,question:entry.text},entry);}
      else if(pending){
        // Only a completed exchange can be returned to, and it is described by
        // what was heard, never by the generated tail.
        var moment=attributed(attributed({turnId:pending.turnId,question:pending.question,reply:entry.text,playbackStatus:entry.playbackStatus},pending),entry);
        if(entry.heardText)moment.heardText=entry.heardText;
        if(entry.playbackStatus!=='pending')moments.push(moment);
        pending=null;
      }
    });
    var played=moments.filter(function(m){return m.playbackStatus==='played';});
    return played.concat(moments.filter(function(m){return m.playbackStatus!=='played';}));
  }

  // The station is a projection of the snapshot. It never calls fetch, never
  // touches the controller, and never reads or writes browser storage.
  function createStation(env,host,options){
    options=options||{};
    var doc=env&&env.document,content=options.content,profile=content&&content.getProfile&&content.getProfile(options.caseId);
    if(!doc||!host||!profile)return null;
    var family=Array.isArray(profile.participants)&&profile.participants.length>1;
    function respondentName(moment){return moment.speakerName||(family?'Speaker not identified':profile.displayName);}
    function learnerName(moment){return moment.targetName?'You, to '+moment.targetName:'You';}
    var disposed=false,store=createBookmarkStore(),notes=Object.create(null),presentation='',requested=Object.create(null),lastCue='';
    function el(tag,text,parent,attrs){
      var node=doc.createElement(tag);
      if(text!==null&&text!==undefined)node.textContent=text;
      var names=Object.keys(attrs||{});for(var i=0;i<names.length;i++)node.setAttribute(names[i],attrs[names[i]]);
      if(parent)parent.appendChild(node);return node;
    }
    if(host.classList&&host.classList.add)host.classList.add('sp-station');

    var before=el('details',null,host,{class:'panel station-brief',open:''});
    el('summary','Case brief',before);
    var door=el('div',null,before,{class:'station-inset','data-station':'door-note'});
    el('p',profile.doorNote,door);
    el('p',profile.task,door);
    var goalDetails=el('details',null,door,{class:'station-goals'});
    el('summary','Practice objectives',goalDetails);
    var goals=el('ul',null,goalDetails);
    profile.objectives.forEach(function(objective){el('li',objective,goals);});

    var chart=el('details',null,before,{'data-station':'chart'});
    el('summary','Available chart information',chart);
    el('p','Open only what you want to review. Unavailable information stays unknown; you can identify what you would seek from the clinical team.',chart,{class:'fine'});
    var chartItems=el('div',null,chart,{class:'station-grid'});
    profile.chartCards.forEach(function(card){
      var box=el('div',null,chartItems,{class:'station-inset'});
      var chartId='chart-'+profile.caseId+'-'+card.id;
      var open=el('button',card.title,box,{type:'button','aria-expanded':'false','aria-controls':chartId});
      var body=el('p','',box,{id:chartId,hidden:''});
      open.addEventListener('click',function(){requested[card.id]=true;body.textContent=card.source+' — '+card.text;body.hidden=!body.hidden;open.setAttribute('aria-expanded',String(!body.hidden));});
    });

    var priorities=el('section',null,host,{class:'panel'});
    var priorityDetails=el('details',null,priorities);
    el('summary',family?'What matters to each person':'What matters to this patient',priorityDetails);
    var list=el('ul',null,priorityDetails);
    profile.priorities.forEach(function(item){el('li',item,list);});
    var cue=el('p','',priorities,{class:'station-cue','data-station':'cue','aria-live':'polite'});

    var marks=el('section',null,host,{class:'panel','data-station':'bookmarks'});
    el('h2','Moments you marked',marks);
    el('p','Mark a moment to come back to it. Quotes show only what you actually heard.',marks,{class:'fine'});
    var markButton=el('button','Mark this moment',marks,{type:'button','data-station':'mark'});
    var markList=el('div',null,marks);
    markButton.addEventListener('click',function(){if(latest){store.add(latest);draw();}});

    var closing=el('section',null,host,{class:'panel','data-station':'closing',hidden:''});
    el('h2','Present to your attending',closing);
    el('p',family?'Give a brief presentation in your own words: who you met and why, each person’s priorities, whose account each finding came from, what remains uncertain, and what you would ask your supervisor to help decide.':'Give a brief presentation in your own words: who you met and why, the patient’s priorities, key findings and uncertainties, your working formulation, and what you would ask your supervisor to help decide.',closing);
    el('p','This presentation stays on this page. It is never sent as part of any reply request.',closing,{class:'fine'});
    var handoff=el('textarea','',closing,{id:'station-presentation',maxlength:'4000','aria-label':'Attending presentation'});
    handoff.addEventListener('input',function(){presentation=String(handoff.value||'').slice(0,4000);});
    el('p',profile.reflectionQuestion,closing,{class:'fine'});

    var retryBox=el('div',null,closing,{'data-station':'retry'});
    el('h3','Try one moment again',retryBox);
    el('p','Ask one earlier moment a different way. The original respondent answers again from just before your question, using only what you had heard by then. This is not a score and does not replace your first conversation.',retryBox,{class:'fine'});
    var retrySelect=el('select',null,retryBox,{'aria-label':'Moment to try again'});
    var retryOriginal=el('blockquote','',retryBox);
    var retryText=el('textarea','',retryBox,{maxlength:'1200','aria-label':'Your alternative question'});
    var retryButton=el('button','Ask this moment again',retryBox,{type:'button'});
    var retryNote=el('p','',retryBox,{class:'fine',role:'status'});
    function showMoment(){
      var moments=latest?retryMoments(latest):[],chosen=moments[Number(retrySelect.value)||0];
      retryOriginal.textContent=chosen?learnerName(chosen)+': '+chosen.question+' \u2014 '+respondentName(chosen)+': '+(chosen.heardText||(chosen.playbackStatus==='played'?chosen.reply:'nothing confirmed heard')):'';
    }
    retrySelect.addEventListener('change',showMoment);
    retryButton.addEventListener('click',function(){
      var moments=latest?retryMoments(latest):[],chosen=moments[Number(retrySelect.value)||0];
      if(!chosen)return;
      retryButton.hidden=true;retryNote.textContent='Asking that moment again…';
      Promise.resolve(typeof options.onRetry==='function'?options.onRetry(chosen.turnId,String(retryText.value||'')):false)
        .then(function(accepted){retryNote.textContent=accepted?'Your alternative was asked. Compare the two in supervision.':'That alternative could not be asked. It will not be sent again.';if(!accepted)retryButton.hidden=false;});
    });

    var latest=null;
    function draw(){
      store.entries().forEach(function(entry){
        var box=Array.prototype.find.call(markList.children,function(row){return row.getAttribute('data-moment')===String(entry.id);});
        // Speech snapshots arrive while learners are editing notes. Keep the
        // editor mounted and its value untouched so focus and selection survive.
        if(!box){
          box=el('div',null,markList,{class:'station-inset','data-moment':String(entry.id)});
          el('p',learnerName(entry)+': '+entry.learnerText,box);
          el('blockquote','',box);
          el('p','',box,{class:'fine'});
          var note=el('textarea',null,box,{maxlength:'1200','aria-label':'Reflection on moment '+entry.id});
          note.value=notes[entry.id]||'';
          note.addEventListener('input',function(){notes[entry.id]=String(note.value||'').slice(0,1200);store.setReflection(entry.id,notes[entry.id]);});
        }
        var quote=box.children[1],status=box.children[2];
        quote.textContent=entry.danaText?respondentName(entry)+': '+entry.danaText:'';
        quote.hidden=!entry.danaText;
        status.textContent=entry.danaText?'':entry.playbackStatus==='cancelled'?'No reply was confirmed heard for this moment.':'Nothing has been confirmed heard for this moment yet.';
        status.hidden=!!entry.danaText;
      });
    }
    function update(hostedSnapshot){
      if(disposed)return;
      latest=stationSnapshot(hostedSnapshot);
      store.sync(latest);
      // An interruption cue is a behavioural claim about the patient. It belongs to an
      // actual interruption, not to every moment of normal speech.
      var lastPatient=null;
      (latest.transcript||[]).forEach(function(entry){if(entry.who==='pt')lastPatient=entry;});
      var interrupted=!!lastPatient&&lastPatient.playbackStatus==='interrupted';
      var next=latest.phase==='ended'?profile.cues.closing:interrupted?profile.cues.interrupted:profile.cues.opening;
      if(next!==lastCue){lastCue=next;cue.textContent=next;}
      markButton.hidden=!store.candidate(latest);
      closing.hidden=latest.phase!=='ended';
      if(latest.phase==='ended'&&!retrySelect.children.length){
        retryMoments(latest).forEach(function(moment,index){el('option','Turn '+moment.turnId+(moment.targetName?' · '+moment.targetName:'')+' — '+moment.question.slice(0,80),retrySelect,{value:String(index)});});
        showMoment();
      }
      retryBox.hidden=!!hostedSnapshot.retryUsed;
      draw();
    }
    update({phase:'gate',messages:[]});
    return {update:update,
      getRetryMoments:function(){return latest?retryMoments(latest):[];},
      requestRetry:function(turnId,text){return typeof options.onRetry==='function'?options.onRetry(turnId,text):false;},
      dispose:function(){
        disposed=true;
        store.clear();notes=Object.create(null);presentation='';requested=Object.create(null);latest=null;lastCue='';
        if(handoff)handoff.value='';
        if(retryText)retryText.value='';
        host.replaceChildren();
        if(host.classList&&host.classList.remove)host.classList.remove('sp-station');
      },
      getPresentation:function(){return presentation;},
      getReflections:function(){return Object.assign({},notes);},
      getBookmarks:function(){return store.entries();},
      getRequestedChart:function(){return Object.keys(requested);}};
  }

  return {stationSnapshot:stationSnapshot,createBookmarkStore:createBookmarkStore,createStation:createStation};
}));
