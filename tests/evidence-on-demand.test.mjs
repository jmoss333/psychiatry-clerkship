import test from 'node:test';import assert from 'node:assert/strict';
import {readEvidence,readEvidencePage,INBOX,DECISIONS} from '../faculty-console/netlify/functions/evidence-review.mjs';
const packet=(revision,source)=>({revision,sourceId:revision,sourceName:revision,sourceUrl:'https://example.org/'+revision,observedAt:'2026-10-13',scanStatus:'complete',coverage:{active:1,scanned:1,errors:[]},candidates:[],readings:[{source,revision:'old'}],passages:[],questionSnapshots:{retained:{text:'Full original teaching'}},customAudit:{keep:true}});
function setup(){
 const state={version:1,mode:'live',generatedAt:'today',packets:[packet('p1','01_Test/a.md'),packet('p2','01_Test/b.md')],latestValid:{source:{text:'Full source evidence'}},failures:[],mappingReceiptReconciliations:[{old:'receipt',new:'receipt2'}],futureAudit:{keep:true}};
 const decisions={version:1,decisions:[{packetRevision:'p1',itemKey:'reading:01_Test/a.md',itemRevision:'prior',rationale:'Historical decision',outcome:'defer',actor:'Faculty'}]};
 const reads=[];const repo={head:async()=> 'head',headOf:async branch=>branch==='main'?'teaching':'report',read:async path=>{reads.push(path);return {json:path===INBOX?state:path===DECISIONS?decisions:{items:[]},sha:'decision'};},readRaw:async path=>{reads.push(path);return {bytes:Buffer.from('Current '+path)};}};
 return {state,decisions,reads,repo};
}
const pins={reportCommit:'report',teachingCommit:'teaching',decisionRevision:'decision'};
test('index names every retained packet without loading teaching or shipping details',async()=>{
 const {repo,reads}=setup();const index=await readEvidencePage(repo,{section:'index'});
 assert.deepEqual(index.packets.map(p=>p.revision),['p1','p2']);
 assert.deepEqual(reads.sort(),[INBOX,DECISIONS].sort());
 for(const p of index.packets){assert.equal(p.candidates,undefined);assert.equal(p.questionSnapshots,undefined);assert.equal(p.targets,undefined);assert.equal(p.status,'not-assessed');}
});
test('one packet restores its full evidence and all its historical decisions',async()=>{
 const {repo,state,decisions,reads}=setup();const full=await readEvidence(repo);reads.length=0;
 const detail=await readEvidencePage(repo,{section:'packet',packetRevision:'p1',...pins});
 assert.deepEqual(detail.packet,full.packets[0]);assert.deepEqual(detail.retainedPacket,state.packets[0]);assert.deepEqual(detail.decisions.decisions,decisions.decisions);
 assert.ok(reads.includes('01_Test/a.md'));assert.ok(!reads.includes('01_Test/b.md'));
});
test('history exposes every non-packet field and the full decision ledger without teaching reads',async()=>{
 const {repo,state,decisions,reads}=setup();const history=await readEvidencePage(repo,{section:'history',...pins});
 const {packets,...metadata}=state;
 assert.deepEqual(history.history,metadata);assert.deepEqual(history.decisions,decisions);
 assert.deepEqual(reads.sort(),[INBOX,DECISIONS].sort());
});
test('stale and unknown detail requests fail instead of mixing review versions',async()=>{
 for(const change of [{reportCommit:'old'},{teachingCommit:'old'},{decisionRevision:'old'},{}]){
  const {repo}=setup();const request={section:'packet',packetRevision:'p1',...pins,...change};if(!Object.keys(change).length)delete request.reportCommit;
  await assert.rejects(()=>readEvidencePage(repo,request),error=>error.status===409);
 }
 const {repo}=setup();await assert.rejects(()=>readEvidencePage(repo,{section:'packet',packetRevision:'missing',...pins}),error=>error.status===404);
});
test('opening superseded evidence retains replacement status and all original fields',async()=>{
 const {repo,state}=setup();state.packets[1].supersedes=['p1'];
 const full=await readEvidence(repo);const detail=await readEvidencePage(repo,{section:'packet',packetRevision:'p1',...pins});
 assert.deepEqual(detail.packet,full.packets[0]);assert.equal(detail.packet.replacementRevision,'p2');
});
