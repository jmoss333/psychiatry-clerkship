/* Learner-facing station content for the hosted encounter.
   Copied from _prototypes/sp-interview/sp-encounter-profiles.js. Actor guidance
   (portrayal) is deliberately NOT copied: it stays server-side with the rest of
   the private grounding. */
(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DanaStationContent=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var chartLimit={id:'chart-limits',title:'Information not supplied',source:'Simulation chart boundary',
    text:'No examination findings, vital signs, medication list, laboratory results, or test reports are supplied in this encounter. Ask the patient what they know and identify what you would need to verify with the clinical team. Missing information is not a normal result.'};
  var PROFILES={
    sp_depression_gated_si_001:{
      caseId:'sp_depression_gated_si_001',title:'Dana — Admission interview',
      task:'Meet Dana, establish a shared agenda, explore her account and safety concerns, and close with a summary she can correct before presenting to your supervisor.',
      doorNote:'Dana is in her 30s, admitted voluntarily to adult inpatient psychiatry last night after her husband became concerned about things she was saying. This is the first full interview after admission.',
      objectives:['Introduce your student role and negotiate the purpose of another interview.','Explore Dana’s account and ask direct, understandable safety questions with appropriate follow-up.','Invite corrections to your summary and identify what still needs discussion with the team.'],
      chartCards:[
        {id:'admission-context',title:'Admission context',source:'Authored referral information',text:'Dana was admitted voluntarily last night after her husband became concerned about things she was saying. No collateral interview is supplied.'},
        {id:'overnight-note',title:'Overnight context',source:'Authored case opening',text:'Dana slept poorly on the unit. At the opening she says that she told another doctor her story last night and asks whether this interview will take long.'},
        chartLimit
      ],
      priorities:['Have the reason for repeating the interview explained.','Have her own account heard without being rushed or judged.'],
      cues:{opening:'Dana looks toward you and pauses before speaking.',interrupted:'Dana stops mid-sentence and looks toward you.',repair:'Dana pauses, then looks back toward you.',closing:'Dana looks toward you and waits.'},
      reflectionQuestion:'Where does your wording leave room for Dana to correct you or explain what she needs from another interview?'
    }
  };
  function getProfile(caseId){var profile=PROFILES[caseId];return profile?JSON.parse(JSON.stringify(profile)):null;}
  return {getProfile:getProfile};
}));
