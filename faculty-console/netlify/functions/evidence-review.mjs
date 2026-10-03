// Used only behind attest.mjs authentication; no public function handler.
import {createHash} from 'node:crypto';
import {itemRevision} from './qbank-actions.mjs';
export const INBOX='13_Faculty_Resources/_automation/surveillance/history/firecrawl/inbox.json';
export const DECISIONS='13_Faculty_Resources/evidence_review_decisions.json';
export const REPORT_BRANCH='automation/surveillance-inbox';
export class EvidenceError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const fail=(message,status=400)=>{throw new EvidenceError(message,status);};
function validState(state){
 if(state?.version!==1||!Array.isArray(state.packets)||!Array.isArray(state.failures))fail('Evidence inbox unavailable',503);
 if(state.mode!=='live')fail('Only live evidence is available in faculty review',503);
 const ids=new Set();
 for(const p of state.packets){
  if(!p.revision||ids.has(p.revision)||!Array.isArray(p.candidates)||!Array.isArray(p.readings))fail('Evidence packet invalid',503);
  ids.add(p.revision);
 }
}
export async function readEvidence(repository){
 const reportCommit=await repository.headOf(REPORT_BRANCH);
 const head=await repository.head();
 const teachingCommit=await repository.headOf('main');
 const [{json:state},{json:decisions,sha:decisionRevision},{json:bank}]=await Promise.all([
  repository.read(INBOX,{ref:reportCommit,maxBytes:8_000_000}),
  repository.read(DECISIONS,{ref:head,maxBytes:2_000_000}),
  repository.read('question_bank.json',{ref:teachingCommit,maxBytes:4_000_000})]);
 validState(state);
 if(decisions?.version!==1||!Array.isArray(decisions.decisions)||!Array.isArray(bank.items))fail('Review records unavailable',503);
 const items=new Map(bank.items.filter(q=>!q.retired&&!q.retiredReason).map(q=>[q.id,q]));
 const readings=new Map();
 for(const p of state.packets)for(const reading of p.readings){
  if(typeof reading.source!=='string'||!/^\d\d_[A-Za-z0-9_/-]+\/[A-Za-z0-9_./-]+\.md$/.test(reading.source)||reading.source.split('/').includes('..'))fail('Reading path invalid',503);
  if(!readings.has(reading.source)){
   const {bytes}=await repository.readRaw(reading.source,{ref:teachingCommit,maxBytes:1_000_000});
   readings.set(reading.source,{revision:createHash('sha256').update(bytes).digest('hex'),text:Buffer.from(bytes).toString('utf8')});
  }
 }
 const packets=state.packets.map(packet=>{
  const targets=[];
  for(const id of new Set(packet.candidates.map(c=>c.questionId))){
   const q=items.get(id);targets.push({itemKey:'question:'+id,revision:q?itemRevision(q):null,current:q||null});
  }
  for(const r of packet.readings){const current=readings.get(r.source);targets.push({itemKey:'reading:'+r.source,revision:current.revision,current:current.text});}
  // A source without localized items still needs a faculty source-level disposition.
  if(!targets.length)targets.push({itemKey:'source:'+packet.sourceId,revision:packet.revision,current:null});
  const unique=[...new Map(targets.map(t=>[t.itemKey,t])).values()];
  const assessed=unique.map(t=>({...t,decision:decisions.decisions.findLast(d=>d.packetRevision===packet.revision&&d.itemKey===t.itemKey&&d.itemRevision===t.revision)||null}));
  const resolved=packet.scanStatus==='complete'&&packet.mappingStatus!=='unavailable'&&assessed.every(t=>t.revision&&t.decision?.outcome==='no-change');
  return {...packet,targets:assessed,status:resolved?'resolved':'pending'};
 });
 for(const packet of [...packets].reverse()){
  const replacement=packets.find(p=>(p.supersedes||[]).includes(packet.revision));
  if(replacement){packet.replacementRevision=replacement.revision;packet.status=['resolved','superseded'].includes(replacement.status)?'superseded':'pending-replacement';}
 }
 return {version:1,reportCommit,head,teachingCommit,decisionRevision,generatedAt:state.generatedAt,failures:state.failures,packets,decisions};
}
export async function decideEvidence(repository,body,actor){
 const keys=['action','packetRevision','expectedReportCommit','expectedDecisionRevision','dispositions'];
 if(!body||Object.keys(body).some(k=>!keys.includes(k))||!actor)fail('Invalid disposition request');
 if(!Array.isArray(body.dispositions)||!body.dispositions.length||body.dispositions.length>100)fail('Choose review items');
 await repository.ensureBranchFresh();
 const state=await readEvidence(repository);
 if(body.expectedReportCommit!==state.reportCommit||body.expectedDecisionRevision!==state.decisionRevision)fail('Evidence changed. Reload before deciding.',409);
 const packet=state.packets.find(p=>p.revision===body.packetRevision);
 if(!packet||packet.replacementRevision)fail('Packet changed. Review its replacement before deciding.',409);
 const seen=new Set();
 const additions=body.dispositions.map(d=>{
  if(!d||Object.keys(d).some(k=>!['itemKey','itemRevision','outcome','rationale'].includes(k)))fail('Invalid item decision');
  const target=packet.targets.find(t=>t.itemKey===d.itemKey);
  if(!target||seen.has(d.itemKey))fail('Unknown or duplicated review item');seen.add(d.itemKey);
  if(!target.revision||d.itemRevision!==target.revision)fail('Teaching changed. Reload before deciding.',409);
  if(!['no-change','needs-edit','defer'].includes(d.outcome)||typeof d.rationale!=='string'||!d.rationale.trim()||d.rationale.length>2000)fail('Choose a disposition and enter a brief rationale');
  return {...d,rationale:d.rationale.trim(),packetRevision:packet.revision,reportCommit:state.reportCommit,actor,at:new Date().toISOString()};
 });
 if(await repository.headOf('main')!==state.teachingCommit)fail('Teaching changed during review. Reload.',409);
 if(await repository.headOf(REPORT_BRANCH)!==state.reportCommit)fail('Evidence changed during review. Reload.',409);
 const result=await repository.writeAtHead(DECISIONS,{version:1,decisions:[...state.decisions.decisions,...additions]},
  {expectedBlobSha:state.decisionRevision,parentHead:state.head,message:'evidence: record faculty dispositions (not attestations)',indent:2});
 let pullRequest=null;try{pullRequest=await repository.ensureRollingPullRequest();}catch{/* Saved receipt remains authoritative. */}
 return {ok:true,...result,pullRequest,pullRequestError:!pullRequest};
}
