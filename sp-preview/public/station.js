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

  return {stationSnapshot:stationSnapshot};
}));
