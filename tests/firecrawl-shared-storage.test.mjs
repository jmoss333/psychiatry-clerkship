import {encodeEvidenceResponse} from '../faculty-console/netlify/functions/evidence-response.mjs';
import {decodeEvidenceResponse} from '../faculty-console/evidence-response.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {decodeEvidenceStorage} from '../faculty-console/netlify/functions/evidence-storage.mjs';
import {readEvidence,decideEvidence,INBOX,DECISIONS} from '../faculty-console/netlify/functions/evidence-review.mjs';
import {itemRevision} from '../faculty-console/netlify/functions/qbank-actions.mjs';
function encode(value){const r=spawnSync('python3',['-c',`import sys,json
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
from evidence_storage import encode_inbox
print(json.dumps(encode_inbox(json.load(sys.stdin)),ensure_ascii=False))`],{input:JSON.stringify(value),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}
const question={id:'q1',why:'Evidence teaching é — 😀. '.repeat(80)};
function fixture(){return {version:1,mode:'live',generatedAt:'today',latestValid:{},failures:[],mappingReceiptReconciliations:[{old:'a',new:'b'}],packets:['a','b'].map(revision=>({revision,sourceId:'s',scanStatus:'complete',coverage:{},candidates:[{questionId:'q1',itemRevision:itemRevision(question)}],readings:[],questionSnapshots:{q1:question}}))};}
test('Python storage reconstructs the complete original inbox in the faculty reader',()=>{
 const original=fixture(),stored=encode(original);assert.equal(stored.storageVersion,1);
 assert.deepEqual(decodeEvidenceStorage(stored),original);
 assert.deepEqual(decodeEvidenceStorage(original),original);
 for(const kind of ['corrupt','missing','duplicate','overwrite','path','orphan']){
  const broken=structuredClone(stored),digest=Object.keys(broken.snapshots)[0];
  if(kind==='corrupt')broken.snapshots[digest]+=' ';
  if(kind==='missing')delete broken.snapshots[digest];
  if(kind==='duplicate')broken.references.push(broken.references[0]);
  if(kind==='overwrite')broken.state.packets[0].questionSnapshots={};
  if(kind==='path')broken.references[0].path=['packets',0,'revision'];
  if(kind==='orphan')broken.references=[];
  assert.throws(()=>decodeEvidenceStorage(broken),undefined,kind);
 }
});
test('existing faculty decisions and subsequent writes retain the same packet references',async()=>{
 let stored=fixture();let decisions={version:1,decisions:[{packetRevision:'a',itemKey:'question:q1',itemRevision:itemRevision(question),outcome:'no-change',rationale:'Reviewed',actor:'Faculty',at:'yesterday'}]};
 const writes=[];const originalDecisions=structuredClone(decisions);
 const repo={head:async()=> 'h',headOf:async()=> 'r',ensureBranchFresh:async()=>{},read:async path=>({json:path===INBOX?stored:path===DECISIONS?decisions:{items:[question]},sha:'d'}),writeAtHead:async(path,value)=>{writes.push(path);decisions=value;return {commit:'saved'};},ensureRollingPullRequest:async()=> 'pr'};
 const before=await readEvidence(repo);stored=encode(stored);
 assert.deepEqual(await readEvidence(repo),before);assert.deepEqual(await decodeEvidenceResponse(encodeEvidenceResponse(await readEvidence(repo))),before);assert.deepEqual(decisions,originalDecisions);assert.deepEqual(writes,[]);
 await decideEvidence(repo,{packetRevision:'b',expectedReportCommit:'r',expectedDecisionRevision:'d',dispositions:[{itemKey:'question:q1',itemRevision:itemRevision(question),outcome:'defer',rationale:'Further review'}]},'Faculty');
 assert.deepEqual(writes,[DECISIONS]);assert.deepEqual(decisions.decisions[0],originalDecisions.decisions[0]);assert.equal(decisions.decisions[1].packetRevision,'b');
 stored.snapshots[Object.keys(stored.snapshots)[0]]+=' ';
 await assert.rejects(()=>readEvidence(repo),/integrity/);
});
