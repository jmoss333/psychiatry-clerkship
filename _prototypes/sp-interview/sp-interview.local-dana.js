/* Retired local overlay. The policy it carried -- a correct direct suicide question discloses at any
   rapport, and an earlier flag never blocks it -- was promoted into the reviewed case pack on
   2026-09-17 (#565, approved by Joshua Moss, MD). applyCase now only guards that the reviewed gate has
   not drifted from the pinned shape and returns the case unchanged; the recording-compatibility
   check is unchanged. Does not modify the reviewed case pack. */
(function (root, factory) {
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SPInterviewLocalDana=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var CASE_ID='sp_depression_gated_si_001',GATE_ID='si_active';
  var SOURCE_GATE_HASH='077c2596ed4c4624cdd8d41abcb2975af7e0d31d69c44bb1ec9293fef5dbed2e';
  var SOURCE_GATE={"id":"si_active","requiresIntents":["si_direct"],"requiresRapport":-3,"blockedByRecentFlags":[],"reveal":"*long pause* ...Most nights, when I'm awake at three, I think it would be simpler if I just didn't wake up. And a couple of times I've stood in the bathroom looking at Tom's sleeping pills. I never opened the bottle. But I looked at it long enough that it scared me.","deflectLowRapport":"*looks at hands* That's a very direct question for someone I met four minutes ago.","deflectEuphemism":"Hurt myself? Like... what do you mean, hurt? *watches your reaction carefully*","repeatAsk":"It's still there. The three a.m. thing. Saying it out loud helps a little, actually. I keep waiting for you to look horrified, and you haven't.","unlocks":["si_plan","si_means","si_intent_protective","si_behavior"],"ifNeverAsked":"critical_miss","euphemismIntent":"si_euphemism"};
  var PROMOTED={id:'dana-direct-si-v1',promotedOn:'2026-09-17',issue:565,scope:'Correct direct suicide questions disclose the authored disclosure response regardless of rapport or earlier flags; follow-up depth gates are unchanged. Now the reviewed policy of the case pack itself.'};
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function applyCase(caseDef){
    if(!caseDef||caseDef.id!==CASE_ID)return caseDef;
    var gates=Array.isArray(caseDef.gated)&&caseDef.gated.filter(function(item){return item.id===GATE_ID;}),gate=gates&&gates[0];
    if(!gate||gates.length!==1)throw new Error('Dana’s reviewed safety gate changed; review it before continuing.');
    if(Object.prototype.hasOwnProperty.call(caseDef,'localDraftOverlay'))throw new Error('Dana’s local draft overlay was promoted into the reviewed pack (#565); a case still carrying localDraftOverlay is stale.');
    if(!same(gate,SOURCE_GATE))throw new Error('Dana’s reviewed safety gate changed; review it before continuing.');
    return caseDef;
  }
  function assertSpeechCompatible(source,variant){
    if(!source||!variant||source.id!==CASE_ID||variant.id!==CASE_ID)throw new Error('Dana’s local speech binding is invalid.');
    function inventory(value){var lines=[value.persona.opening];Object.keys(value.responses).forEach(function(key){Object.keys(value.responses[key]).forEach(function(tier){lines=lines.concat(value.responses[key][tier]);});});value.gated.forEach(function(gate){['reveal','deflectLowRapport','deflectEuphemism','repeatAsk','deflectIfLocked'].forEach(function(key){if(gate[key])lines.push(gate[key]);});});return lines;}
    if(!same(inventory(source),inventory(variant)))throw new Error('Dana’s local overlay changed recorded speech; existing recordings cannot be reused.');
    return true;
  }
  return{caseId:CASE_ID,overlayId:'dana-direct-si-v1',sourceGateHash:SOURCE_GATE_HASH,promoted:PROMOTED,applyCase:applyCase,assertSpeechCompatible:assertSpeechCompatible};
}));
