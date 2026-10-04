import test from 'node:test';import assert from 'node:assert/strict';
import {readEvidence, decideEvidence, DECISIONS, INBOX} from '../faculty-console/netlify/functions/evidence-review.mjs';
import {itemRevision} from '../faculty-console/netlify/functions/qbank-actions.mjs';
const q={id:'q1',why:'Old teaching.'};
function setup(){
const state={version:1,mode:'live',packets:[{revision:'p1',sourceId:'s',scanStatus:'complete',coverage:{},candidates:[{questionId:'q1',itemRevision:itemRevision(q)}],readings:[]}],failures:[]};
let decisions={version:1,decisions:[]}; const writes=[];
const repo={head:async()=> 'h1',headOf:async()=> 'r1',ensureBranchFresh:async()=>{},
 read:async(path)=>path===INBOX?{json:state,sha:'i1'}:path===DECISIONS?{json:decisions,sha:'d1'}:{json:{items:[q]},sha:'b1'},
 writeAtHead:async(path,value)=>{writes.push(path);decisions=value;return {commit:'saved'};},ensureRollingPullRequest:async()=> 'pr'};
return {repo,writes,state};
}
const body={packetRevision:'p1',expectedReportCommit:'r1',expectedDecisionRevision:'d1',dispositions:[{itemKey:'question:q1',itemRevision:itemRevision(q),outcome:'no-change',rationale:'Source applies to a different context.'}]};
test('faculty dispositions are revision bound and cannot write attestation',async()=>{
 const {repo,writes}=setup();const s=await readEvidence(repo);assert.equal(s.packets[0].status,'pending');
 await decideEvidence(repo,body,'Faculty');assert.deepEqual(writes,[DECISIONS]);
 assert.equal((await readEvidence(repo)).packets[0].status,'resolved');
});
test('stale revisions, invalid item sets and client attribution are rejected',async()=>{
 for(const override of [{expectedReportCommit:'old'},{expectedDecisionRevision:'old'},{actor:'someone'},
 {dispositions:[{...body.dispositions[0],itemRevision:'old'}]},
 {dispositions:[{...body.dispositions[0],itemKey:'question:other'}]},
 {dispositions:[{...body.dispositions[0],rationale:''}]}]){
 const {repo,writes}=setup();await assert.rejects(()=>decideEvidence(repo,{...body,...override},'Faculty'));assert.equal(writes.length,0);
 }
});
test('defer, needs-edit and incomplete examinations never resolve a packet',async()=>{
 for(const outcome of ['defer','needs-edit']){const {repo}=setup();await decideEvidence(repo,{...body,dispositions:[{...body.dispositions[0],outcome}]},'Faculty');assert.equal((await readEvidence(repo)).packets[0].status,'pending');}
 const {repo,state}=setup();state.packets[0].scanStatus='incomplete';await decideEvidence(repo,body,'Faculty');assert.equal((await readEvidence(repo)).packets[0].status,'pending');
});
test('main teaching changes invalidate decisions even when the disposition branch is behind',async()=>{
 const {repo}=setup();await decideEvidence(repo,body,'Faculty');
 const original=repo.read;repo.headOf=async branch=>branch==='main'?'main-new':'r1';
 repo.read=async(path,options)=>path==='question_bank.json'&&options.ref==='main-new'?{json:{items:[{...q,stem:'A child instead of an adult'}]},sha:'new'}:original(path,options);
 assert.equal((await readEvidence(repo)).packets[0].status,'pending');
 await assert.rejects(()=>decideEvidence(repo,body,'Faculty'),/Teaching changed/);
});
test('mapping failures cannot be resolved by no-change dispositions',async()=>{
 const {repo,state}=setup();state.packets[0].mappingStatus='unavailable';
 await decideEvidence(repo,body,'Faculty');assert.equal((await readEvidence(repo)).packets[0].status,'pending');
});
test('mapping recovery retires an incomplete packet only after its replacement is reviewed',async()=>{
 const {repo,state}=setup();state.packets[0].mappingStatus='unavailable';state.packets[0].scanStatus='incomplete';
 state.packets.push({...state.packets[0],revision:'p2',mappingStatus:'unchanged',scanStatus:'complete',supersedes:['p1']});
 assert.equal((await readEvidence(repo)).packets[0].status,'pending-replacement');
 await decideEvidence(repo,{...body,packetRevision:'p2'},'Faculty');
 assert.equal((await readEvidence(repo)).packets[0].status,'superseded');
});
test('evidence route preserves existing credential and origin enforcement',async()=>{
 const {createHandler}=await import('../faculty-console/netlify/functions/attest.mjs');
 const handler=createHandler({env:{FACULTY_ATTEST_PASSWORD:'test-key'},fetchImpl:()=>{throw new Error('Unauthorized network access');}});
 assert.equal((await handler(new Request('https://console.example/api/attest?view=evidence'))).status,401);
 assert.equal((await handler(new Request('https://console.example/api/attest?view=evidence',{headers:{Origin:'https://other.example','x-faculty-key':'test-key'}}))).status,403);
});
