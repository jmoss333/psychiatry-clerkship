import pack from '../../_prototypes/sp-interview/sp-interview.pack.json' with {type:'json'};
import localDana from '../../_prototypes/sp-interview/sp-interview.local-dana.js';
import localCases from '../../_prototypes/sp-interview/sp-interview.local-cases.js';
import {createContext} from '../../_prototypes/sp-interview/dana-live-context.mjs';
import {hash} from './state.mjs';
import {FAMILY_CASE_ID,familyCaseDef,familyBinding,familyContext} from './family.mjs';

const DANA_ID='sp_depression_gated_si_001';
const MORGAN_ID='sp_alcohol_ambivalence_001';
// Hosting a case does not, by itself, change its faculty-review status. Morgan
// and the family meeting were separately attested by Joshua Moss, MD on
// 2026-09-09; hosting them here did not attest them.
const REGISTERED=[DANA_ID,'sp_mania_redirect_001','sp_psychosis_paranoid_001',MORGAN_ID,FAMILY_CASE_ID];

function resolve(id){
  if(id===FAMILY_CASE_ID)return familyCaseDef;
  const found=(id===MORGAN_ID?localCases.cases:pack.cases).find(item=>item.id===id);
  if(!found)throw new Error('hosted preview: unknown case '+id);
  // The direct-suicide-question overlay is Dana's alone.
  return id===DANA_ID?localDana.applyCase(found):found;
}

export const CASES=Object.freeze(Object.fromEntries(REGISTERED.map(id=>{
  const caseDef=resolve(id);
  return [id,Object.freeze({caseDef,binding:id===FAMILY_CASE_ID?familyBinding:hash(JSON.stringify(caseDef))})];
})));
export const caseIds=Object.freeze([...REGISTERED]);
export function getCase(caseId){return Object.hasOwn(CASES,caseId)?CASES[caseId]:undefined;}

// Check every registered case's grounding for drift during startup, before any
// paid request is accepted. A drift in ANY case fails at module load.
for(const id of REGISTERED){
  const {caseDef}=CASES[id];
  const opening={who:'pt',text:caseDef.persona.opening,playbackStatus:'pending'};
  if(id===FAMILY_CASE_ID){
    for(const role of ['morgan','maya'])familyContext([{...opening,speakerId:'morgan'}],role);
  }else createContext(caseDef,[],[opening]);
}
