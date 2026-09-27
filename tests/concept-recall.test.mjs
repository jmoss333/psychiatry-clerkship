import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
const src=readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/concept_recall.js',import.meta.url),'utf8');
const F=new Function('crypto',src+';return {conceptCardsFromFeed,newConceptAllowed,conceptVerifyBytes,conceptIdEligible,conceptWeekReply};')(webcrypto);
const card=(id='CONCEPT#ethics-target:1@1')=>({id,q:'A […] question',reveal:'A <script> answer',page:'ethics_legal.md',source:'01/ethics.md',topic:'Ethics'});
const feed=()=>({schemaVersion:1,cards:[card(),card('CONCEPT#mse-target@2')],withheld:[{id:'CONCEPT#withdrawn@1'}]});
test('one text recall card per released cloze, no withdrawn or superseded IDs',()=>{const cards=F.conceptCardsFromFeed(feed());assert.equal(cards.length,2);assert.equal(cards[0].kind,'recall');assert.equal(cards[0].reveal,'A <script> answer');assert.equal(F.conceptIdEligible('CONCEPT#withdrawn@1',cards),false);assert.equal(F.conceptIdEligible('CONCEPT#mse-target@1',cards),false);assert.equal(F.conceptIdEligible(cards[0].id,cards),true);});
test('strict schema and unique IDs fail closed',()=>{for(const f of [{}, {...feed(),schemaVersion:2},{...feed(),cards:[card(),card()]},{...feed(),cards:[{...card(),page:'javascript:alert(1)'}]}])assert.throws(()=>F.conceptCardsFromFeed(f));});
test('All includes no-week sources; week filters new eligibility only',()=>{assert.equal(F.newConceptAllowed(card(),['mse.md'],'week'),false);assert.equal(F.newConceptAllowed(card(),['mse.md'],'all'),true);assert.equal(F.newConceptAllowed({id:'TOPIC#mse.md'},[],'week'),true);});
test('verify entire response bytes including newline before parsing',async()=>{const bytes=new TextEncoder().encode(JSON.stringify(feed())+'\n');const digest=createHash('sha256').update(bytes).digest('hex');assert.equal((await F.conceptVerifyBytes(bytes,digest)).length,2);await assert.rejects(F.conceptVerifyBytes(bytes.slice(0,-1),digest));await assert.rejects(F.conceptVerifyBytes(bytes,''));});
test('week reply is typed bounded and nonce bound',()=>{const nonce='a'.repeat(32),reply={type:'cw:concept-week-context',nonce,week:2,refs:['mse.md']};assert.deepEqual(F.conceptWeekReply(reply,nonce),['mse.md']);assert.equal(F.conceptWeekReply({...reply,nonce:'bad'},nonce),null);assert.equal(F.conceptWeekReply({...reply,refs:['../evil']},nonce),null);});

const recovery=()=>new Function(src+';return {conceptDigestFromDocument,conceptRecoverWorker};')();
test('build digest requires exactly one valid meta tag',()=>{
 const F=recovery(),digest='a'.repeat(64),doc=values=>({querySelectorAll:()=>values.map(content=>({content}))});
 assert.equal(F.conceptDigestFromDocument(doc([digest])),digest);
 for(const values of [[],['bad'],[digest,digest],[digest,'b'.repeat(64)]])assert.throws(()=>F.conceptDigestFromDocument(doc(values)));
});
function eventTarget(extra={}){const handlers={};return Object.assign({addEventListener:(t,f)=>(handlers[t]??=new Set()).add(f),removeEventListener:(t,f)=>handlers[t]?.delete(f),emit:t=>[...(handlers[t]||[])].forEach(f=>f())},extra);}
test('Retry activates the updated waiting worker before completion without requiring clients.claim',async()=>{
 const F=recovery();let sent=null,finished=false;
 const worker=eventTarget({state:'installed',postMessage:m=>{sent=m;}});
 const old={state:'activated'};
 const reg=eventTarget({active:old,waiting:null,installing:null,update:async()=>{reg.waiting=worker;}});
 const sw=eventTarget({controller:old,getRegistration:async()=>reg});
 const promise=F.conceptRecoverWorker(sw,100).then(()=>{finished=true;});
 await new Promise(r=>setTimeout(r,0));assert.deepEqual(sent,{type:'SKIP_WAITING'});assert.equal(finished,false);
 worker.state='activated';reg.active=worker;worker.emit('statechange');await promise;assert.equal(finished,true);assert.equal(sw.controller,old,'actual worker has no clients.claim');
});
test('Retry fails visibly when no update or activation timeout occurs',async()=>{
 const F=recovery();const reg=eventTarget({waiting:null,installing:null,update:async()=>{}});
 await assert.rejects(F.conceptRecoverWorker(eventTarget({getRegistration:async()=>reg}),30),/No updated/);
 reg.waiting=eventTarget({state:'installed',postMessage:()=>{}});
 await assert.rejects(F.conceptRecoverWorker(eventTarget({getRegistration:async()=>reg}),10),/timed out/);
});
test('Retry follows an installing replacement through installed and activated',async()=>{
 const F=recovery();let sent=0;
 const worker=eventTarget({state:'installing',postMessage:m=>{assert.equal(m.type,'SKIP_WAITING');sent++;}});
 const reg=eventTarget({waiting:null,installing:worker,update:async()=>{}});
 const promise=F.conceptRecoverWorker(eventTarget({getRegistration:async()=>reg}),100);
 await new Promise(r=>setTimeout(r,0));assert.equal(sent,0);
 worker.state='installed';reg.waiting=worker;reg.installing=null;worker.emit('statechange');assert.equal(sent,1);
 worker.state='activated';worker.emit('statechange');await promise;
});

test('Concepts byte fetch is bounded even when fetch never settles',async()=>{
 let signal;
 const get=new Function('fetch','AbortController',src+';return conceptFetchBytes;')((url,options)=>{signal=options.signal;return new Promise(()=>{});},AbortController);
 await assert.rejects(get(10),/timed out/);
 assert.equal(signal.aborted,true);
});
test('Concepts byte fetch returns bytes and rejects failed HTTP status',async()=>{
 const bytes=new Uint8Array([1,2]).buffer;
 const make=fetcher=>new Function('fetch','AbortController',src+';return conceptFetchBytes;')(fetcher,AbortController);
 assert.equal(await make(async()=>({ok:true,arrayBuffer:async()=>bytes}))(100),bytes);
 await assert.rejects(make(async()=>({ok:false}))(100),/unavailable/);
});

test('Retry restores verified current-build bytes without requiring a new worker',async()=>{
 const bytes=new TextEncoder().encode(JSON.stringify(feed()));
 const digest=createHash('sha256').update(bytes).digest('hex');let updates=0;
 const reg=eventTarget({update:async()=>updates++});
 const run=new Function('crypto','fetch',src+';return conceptRetry;')(webcrypto,async()=>({ok:true,arrayBuffer:async()=>bytes}));
 const cards=await run(digest,eventTarget({getRegistration:async()=>reg}),100);
 assert.equal(cards.length,2);assert.equal(updates,0);
});
test('Retry never admits persistently mismatched bytes when worker is current',async()=>{
 const run=new Function('crypto','fetch',src+';return conceptRetry;')(webcrypto,async()=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(feed()))}));
 const reg=eventTarget({waiting:null,installing:null,update:async()=>{}});
 await assert.rejects(run('a'.repeat(64),eventTarget({getRegistration:async()=>reg}),100),/No updated/);
});
test('evidence links are structurally validated and retained by the adapter',()=>{
 const evidence=[{id:'existing-source',url:'https://doi.org/10.1234/example'}];
 assert.deepEqual(F.conceptCardsFromFeed({schemaVersion:1,cards:[{...card(),evidence}]})[0].evidence,evidence);
 for(const url of ['javascript:alert(1)','//evil.test','http://evil.test'])assert.throws(()=>F.conceptCardsFromFeed({schemaVersion:1,cards:[{...card(),evidence:[{id:'x',url}]}]}));
});
