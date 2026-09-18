import {randomBytes} from 'node:crypto';
import {hash,problem,createStateCodec,initialState,nextHistory,finalizePlayback,retryState} from '../state.mjs';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const bad=()=>problem(400,'preview_state_invalid');
export function createMomentCodec({definition,env,origin,now=Date.now}){
 // Hash the entire immutable definition: no review-affecting field is excluded.
 const base=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:`practice-moment-v1:${definition.id}:${hash(JSON.stringify(definition))}:${env.DEPLOY_ID}:${origin}:${hash(env.DANA_PREVIEW_PASSCODE)}`,now});
 return {seal:base.seal,open(token){
  const s=base.open(token),keys=['v','caseId','sid','nonce','expires','turn','history','segments','completed','moment',...(s.retried===true?['retried']:[])];
  if(!exact(s,keys)||s.caseId!==definition.id||s.turn>4||s.expires>now()+1800000||!exact(s.moment,['scenarioId','revision','phase'])||s.moment.scenarioId!==definition.id||s.moment.revision!==definition.revision||!['dialogue','closed','alternative_done'].includes(s.moment.phase)||s.retried===true!==(s.moment.phase==='alternative_done')||s.moment.phase!=='dialogue'&&s.turn<1)throw bad();
  for(let i=0;i<s.history.length;i++){
   const e=s.history[i],patient=i%2===0;
   if(!exact(e,patient?['who','text','playbackStatus',...(e.omittedTail===true?['omittedTail']:[])]:['who','text'])||e.who!==(patient?'pt':'me')||!text(e.text,patient?900:1200)||patient&&!['played','interrupted','pending'].includes(e.playbackStatus)||patient&&i<s.history.length-1&&e.playbackStatus==='pending')throw bad();
  }
  if(s.segments.some(v=>!text(v,900))||s.segments.join('').length>900)throw bad();
  return s;
 }};
}
export function initialMomentState(definition,now=Date.now){return {...initialState(definition.opening,now,definition.id),moment:{scenarioId:definition.id,revision:definition.revision,phase:'dialogue'}};}
export function nextMomentHistory(state,body){if(state.moment.phase!=='dialogue'||state.turn>=4)throw problem(409,'preview_encounter_finished');return nextHistory(state,body);}
export function closeMomentState(state,body){
 if(state.moment.phase!=='dialogue'||state.turn<1||state.turn>4||state.retried)throw problem(409,'preview_encounter_finished');
 return {...state,history:finalizePlayback(state,body),nonce:randomBytes(16).toString('hex'),moment:{...state.moment,phase:'closed'}};
}
export function retryMomentState(state,turnId,sid){
 if(state.moment.phase!=='closed'||state.retried)throw problem(409,'preview_encounter_finished');
 return {...retryState(state,turnId,sid),moment:{...state.moment,phase:'dialogue'}};
}
