import pack from '../../_prototypes/sp-interview/sp-interview.pack.json' with {type:'json'};
import localDana from '../../_prototypes/sp-interview/sp-interview.local-dana.js';
import {createContext} from '../../_prototypes/sp-interview/dana-live-context.mjs';
import {hash} from './state.mjs';

const DANA_ID='sp_depression_gated_si_001';
// Morgan is deliberately absent: it is draft-pending-attestation and lives outside
// the pack. See docs/superpowers/specs/2026-09-07-hosted-multi-case-slice-2-design.md.
const REGISTERED=[DANA_ID,'sp_mania_redirect_001','sp_psychosis_paranoid_001'];

function resolve(id){
  const found=pack.cases.find(item=>item.id===id);
  if(!found)throw new Error('hosted preview: unknown case '+id);
  // The direct-suicide-question overlay is Dana's alone.
  return id===DANA_ID?localDana.applyCase(found):found;
}

export const CASES=Object.freeze(Object.fromEntries(REGISTERED.map(id=>{
  const caseDef=resolve(id);
  return [id,Object.freeze({caseDef,binding:hash(JSON.stringify(caseDef))})];
})));
export const caseIds=Object.freeze([...REGISTERED]);
export function getCase(caseId){return Object.hasOwn(CASES,caseId)?CASES[caseId]:undefined;}

// Check every registered case's grounding for drift during startup, before any
// paid request is accepted. A drift in ANY case fails at module load.
for(const id of REGISTERED){
  const {caseDef}=CASES[id];
  createContext(caseDef,[],[{who:'pt',text:caseDef.persona.opening,playbackStatus:'pending'}]);
}
