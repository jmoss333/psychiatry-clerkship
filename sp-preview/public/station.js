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

  // The ported station and bookmark logic speak the local prototype's shape.
  // Translating once here keeps that logic, and its tests, unedited.
  function stationSnapshot(hosted){
    hosted=hosted||{};
    var phase=PHASES[hosted.phase]||'idle';
    var transcript=(hosted.messages||[]).map(function(message){
      if(message.role==='you'){
        var learner={who:'me',text:message.text},status=LEARNER[message.status];
        if(status)learner.responseStatus=status;
        return learner;
      }
      var entry={who:'pt',text:message.text,playbackStatus:message.status==='preparing'?'pending':message.status};
      // Only whole completed segments were heard; the tail is never quoted.
      var segments=message.segments||[],completed=message.completedSegments||0;
      if(entry.playbackStatus!=='played'&&completed>0)entry.heardText=segments.slice(0,completed).join('');
      return entry;
    });
    return {phase:phase,state:phase,transcript:transcript,draft:hosted.draft||'',interim:hosted.interim||'',turn:hosted.turn||0,ended:phase==='ended'};
  }

  // Encounter-local bookmarks, ported unchanged from
  // _prototypes/sp-interview/sp-interview.bookmarks.js. No persistence, no
  // capture controls, no provider call. The two rules that must not drift:
  // sync() refuses a moment whose learner text differs, so a turn number from
  // another encounter cannot supply a quote; and playback() uses the full
  // patient text only when it played in full, otherwise a genuine heard prefix.
  function validId(id){return Number.isInteger(id)&&id>=1&&id<=10;}
  function copy(entry){
    return {id:entry.id,learnerText:entry.learnerText,danaText:entry.danaText,playbackStatus:entry.playbackStatus,reflection:entry.reflection};
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
      latest={id:id,learnerText:row.text};
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
    return {danaText:text,playbackStatus:status};
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
        if(!moment||moment.learner.text!==entry.learnerText)return;
        var heard=playback(moment,snapshot);
        entry.danaText=heard.danaText;
        entry.playbackStatus=heard.playbackStatus;
      });
      return entries();
    }
    function add(snapshot){
      sync(snapshot);
      var latest=candidate(snapshot);
      if(!latest)return {added:false,entry:null};
      if(marked[latest.id])return {added:false,entry:copy(marked[latest.id])};
      marked[latest.id]={id:latest.id,learnerText:latest.learnerText,danaText:'',playbackStatus:'pending',reflection:''};
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

  return {stationSnapshot:stationSnapshot,createBookmarkStore:createBookmarkStore};
}));
