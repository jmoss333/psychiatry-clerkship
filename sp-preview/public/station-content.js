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
    },
    sp_mania_redirect_001:{
      caseId:'sp_mania_redirect_001',title:'Marcus — A focused interview',
      task:'Establish a shared agenda with Marcus, gather his account while redirecting respectfully, and summarize both his priorities and the questions you need to bring to the team.',
      doorNote:'Marcus is a college junior in his 20s on adult inpatient psychiatry after an overnight admission. His roommate called campus security after finding him redesigning the quad irrigation system with a shovel at 4 a.m.',
      objectives:['Explain your student role and establish a manageable shared agenda.','Use warm redirection while exploring the history, functioning, and safety concerns within the case.','Check Marcus’s understanding of your summary and clearly separate his priorities from unresolved team decisions.'],
      chartCards:[
        {id:'referral-context',title:'Reason for referral',source:'Authored referral information',text:'The roommate called campus security after finding Marcus at 4 a.m. with a shovel, describing plans to redesign the quad irrigation system.'},
        {id:'presenting-context',title:'Available presenting information',source:'Authored case brief',text:'Marcus is a college junior in engineering. The brief reports about two hours of sleep a night for two weeks. A direct collateral account is not supplied.'},
        chartLimit
      ],
      priorities:['Have his ideas and his account of the admission taken seriously.','Understand who can discuss his wish to leave and his upcoming plans.'],
      cues:{opening:'Marcus leans forward as you introduce yourself.',interrupted:'Marcus stops speaking and lifts one hand briefly.',repair:'Marcus lowers his hand and looks toward you.',closing:'Marcus shifts in his seat and looks toward you.'},
      reflectionQuestion:'How does your wording acknowledge Marcus’s agenda while making the next topic clear?'
    },
    sp_psychosis_paranoid_001:{
      caseId:'sp_psychosis_paranoid_001',title:'Ray — Establishing a working conversation',
      task:'Introduce yourself honestly, address Ray’s question about recording, explore his account without confirming or dismissing its explanation, and bring unresolved concerns to your supervisor.',
      doorNote:'Ray is a young adult in his 20s on day two of an adult inpatient psychiatry admission. An older sibling brought him in after weeks of not leaving his apartment, covering vents, and stopping meals. This is the first sit-down interview.',
      objectives:['Explain your role and the actual information-handling arrangements without promises you cannot make.','Give Ray time to describe his experiences and ask direct, understandable follow-up questions about safety.','Distinguish observed behavior and reported experience from interpretation when summarizing and handing over.'],
      chartCards:[
        {id:'referral-context',title:'Reason for referral',source:'Authored referral information',text:'An older sibling brought Ray in after weeks of withdrawal from usual activity, not leaving the apartment, covering vents, and stopping meals. No direct collateral interview is supplied.'},
        {id:'opening-context',title:'Opening context',source:'Authored case opening',text:'Ray sits angled toward the door with his arms crossed. His first question is whether the conversation is being recorded.'},
        chartLimit
      ],
      priorities:['Understand what is being recorded or shared and who is listening.','Describe his experience at his own pace without having its explanation immediately dismissed or confirmed.'],
      cues:{opening:'Ray sits angled toward the door, with his arms crossed.',interrupted:'Ray stops speaking and looks toward the door.',repair:'Ray pauses and turns his gaze back toward you.',closing:'Ray glances toward the door, then toward you.'},
      reflectionQuestion:'Does your wording explain what you can honestly offer while leaving Ray room to describe his experience?'
    }
  };
  function getProfile(caseId){var profile=PROFILES[caseId];return profile?JSON.parse(JSON.stringify(profile)):null;}
  return {getProfile:getProfile};
}));
