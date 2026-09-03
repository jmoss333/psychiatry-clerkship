/* Family retrieval prompts — the one definition of what a FAM# card ASKS and what it reveals.

   Injected via the shared-snippet marker into BOTH consumers: family-systems-practice.html,
   which authors these cards and grades them beside their scenario, and review.html, which
   serves the due ones in the daily queue. It has to be shared rather than copied because the
   card id embeds the prompt id (famCardId) — two drifting copies of this list would file one
   schedule under a prompt the learner never saw, which is exactly the silent id-collision
   failure the repo's storage rule warns about.

   Reveal content is always the scenario's own authored text — its opening line or one of its
   authored sections. This file introduces no clinical wording of its own, so nothing here
   needs faculty attestation that family_systems_scenarios.json has not already had.

   Pure: no DOM, no storage, no clock, no escaping (each consumer escapes for its own renderer).
   ES5 only, matching the other injected snippets. */
var FAM_DEFAULT_RETRIEVAL=[
  {id:'opening',prompt:'Say your opening line for this family out loud.',revealFrom:'opening'},
  {id:'ask',prompt:'Name the collateral questions you would ask — out loud or on scratch.',revealFrom:'ask'},
  {id:'avoid',prompt:'Name the trap here: what would you deliberately NOT do?',revealFrom:'avoid'},
  {id:'handoff',prompt:'Say the rounds handoff for this family — what must it separate?',revealFrom:'handoff'},
  {id:'safety',prompt:'When do you stop ordinary information-gathering and escalate — and to whom?',revealFrom:'safety'}
];

/* The card id both tools schedule under. Scenario id and prompt id are joined with the same
   separator the QB#/TOPIC# namespaces use, so srsBucket keeps reading FAM# as the family bucket. */
function famCardId(scenarioId,promptId){return 'FAM#'+scenarioId+'#'+promptId;}

/* What a prompt reveals: an explicit revealText when the scenario authors one, else the
   scenario's opening line, else the named section. null means the scenario cannot answer this
   prompt, and famRetrievalFor drops it rather than showing an empty panel. */
function famRevealContent(it,rp){
  if(!it||!rp)return null;
  if(rp.revealText)return rp.revealText;
  if(rp.revealFrom==='opening')return it.opening||null;
  var sec=(it.sections||{})[rp.revealFrom];
  return (sec&&sec.length)?sec:null;
}

/* The prompts a given scenario actually supports, in authored order. A scenario may carry its
   own `retrieval` array to override the defaults wholesale. */
function famRetrievalFor(it){
  if(!it)return [];
  if(Object.prototype.toString.call(it.retrieval)==='[object Array]'&&it.retrieval.length)return it.retrieval;
  var out=[],i;
  for(i=0;i<FAM_DEFAULT_RETRIEVAL.length;i++){
    if(famRevealContent(it,FAM_DEFAULT_RETRIEVAL[i])!=null) out.push(FAM_DEFAULT_RETRIEVAL[i]);
  }
  return out;
}
