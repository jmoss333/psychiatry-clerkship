/* Disabled localhost prototype overlay. Does not modify the reviewed case pack. */
(function (root, factory) {
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SPInterviewLocalDana=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var CASE_ID='sp_depression_gated_si_001',GATE_ID='si_active';
  var SOURCE_GATE_HASH='1b435c0d7c88d8d5384a615e50342d810ec372f2c45428f875a43ee93e36ee31';
  var SOURCE_GATE={id:'si_active',requiresIntents:['si_direct'],requiresRapport:1,blockedByRecentFlags:['judgmental','premature_reassurance'],reveal:"*long pause* ...Most nights, when I'm awake at three, I think it would be simpler if I just didn't wake up. And a couple of times I've stood in the bathroom looking at Tom's sleeping pills. I never opened the bottle. But I looked at it long enough that it scared me.",deflectLowRapport:"*looks at hands* That's a very direct question for someone I met four minutes ago.",deflectEuphemism:'Hurt myself? Like... what do you mean, hurt? *watches your reaction carefully*',repeatAsk:"It's still there. The three a.m. thing. Saying it out loud helps a little, actually. I keep waiting for you to look horrified, and you haven't.",unlocks:['si_plan','si_means','si_intent_protective','si_behavior'],ifNeverAsked:'critical_miss',euphemismIntent:'si_euphemism'};
  var OVERLAY={id:'dana-direct-si-v1',status:'reviewed',sourceGateHash:SOURCE_GATE_HASH,scope:'Correct direct suicide questions disclose the authored disclosure response regardless of rapport or earlier flags; follow-up depth gates are unchanged.'};
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function sourceGateFrom(localGate){var value=JSON.parse(JSON.stringify(localGate));value.requiresRapport=SOURCE_GATE.requiresRapport;value.blockedByRecentFlags=SOURCE_GATE.blockedByRecentFlags.slice();return value;}
  function applyCase(caseDef){
    if(!caseDef||caseDef.id!==CASE_ID)return caseDef;
    var gates=Array.isArray(caseDef.gated)&&caseDef.gated.filter(function(item){return item.id===GATE_ID;}),gate=gates&&gates[0];
    if(!gate||gates.length!==1)throw new Error('Dana’s reviewed safety gate changed; review the local draft overlay before continuing.');
    if(Object.prototype.hasOwnProperty.call(caseDef,'localDraftOverlay')){
      if(!same(caseDef.localDraftOverlay,OVERLAY)||gate.requiresRapport!==-3||!same(gate.blockedByRecentFlags,[])||!same(sourceGateFrom(gate),SOURCE_GATE))throw new Error('Dana’s local draft overlay changed; review it before continuing.');
      return caseDef;
    }
    if(!same(gate,SOURCE_GATE))throw new Error('Dana’s reviewed safety gate changed; review the local draft overlay before continuing.');
    var result=JSON.parse(JSON.stringify(caseDef)),localGate=result.gated.find(function(item){return item.id===GATE_ID;});
    // The shared engine clamps rapport at -3 and treats a missing/zero value as
    // a real threshold. -3 therefore expresses “no rapport gate” without a
    // broad engine exception.
    localGate.requiresRapport=-3;localGate.blockedByRecentFlags=[];
    result.localDraftOverlay=JSON.parse(JSON.stringify(OVERLAY));
    return result;
  }
  function assertSpeechCompatible(source,variant){
    if(!source||!variant||source.id!==CASE_ID||variant.id!==CASE_ID)throw new Error('Dana’s local speech binding is invalid.');
    function inventory(value){var lines=[value.persona.opening];Object.keys(value.responses).forEach(function(key){Object.keys(value.responses[key]).forEach(function(tier){lines=lines.concat(value.responses[key][tier]);});});value.gated.forEach(function(gate){['reveal','deflectLowRapport','deflectEuphemism','repeatAsk','deflectIfLocked'].forEach(function(key){if(gate[key])lines.push(gate[key]);});});return lines;}
    if(!same(inventory(source),inventory(variant)))throw new Error('Dana’s local overlay changed recorded speech; existing recordings cannot be reused.');
    return true;
  }
  return{caseId:CASE_ID,overlayId:'dana-direct-si-v1',sourceGateHash:SOURCE_GATE_HASH,applyCase:applyCase,assertSpeechCompatible:assertSpeechCompatible};
}));
