import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotBudget} from '../lib/ai-pilot/budget.mjs';
function fixture(){let data=null,etag=0;return {async getWithMetadata(){const r=data===null?null:{data:structuredClone(data),etag:String(etag)};await Promise.resolve();return r;},async set(key,value,options){await Promise.resolve();if(options.onlyIfNew?data!==null:options.onlyIfMatch!==String(etag))return {modified:false};data=JSON.parse(value);return {modified:true,etag:String(++etag)};}};}
const req=n=>({requestId:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,contextDigest:'a'.repeat(64)});
test('CAS prevents duplicate and capacity races across instances',async()=>{
 const store=fixture(),opts={store,namespace:'pilot/reader',dailyLimit:20,windowLimit:1,now:()=>100};
 const a=createPilotBudget(opts),b=createPilotBudget(opts);
 let r=await Promise.allSettled([a.reserve(req(1)),b.reserve(req(1))]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'already_submitted');
 await assert.rejects(b.reserve(req(2)),{code:'budget_exhausted'});
 await assert.rejects(b.reserve({...req(1),contextDigest:'b'.repeat(64)}),{code:'request_conflict'});
});
test('midnight and day fourteen cannot replay reservations or reset policy',async()=>{
 let time=86400000-1;const store=fixture();const options={store,namespace:'pilot/reader',dailyLimit:20,windowLimit:5,now:()=>time};
 await createPilotBudget(options).reserve(req(1));time+=14*86400000;
 await assert.rejects(createPilotBudget(options).reserve(req(1)),{code:'already_submitted'});
 await assert.rejects(createPilotBudget({...options,dailyLimit:19}).reserve(req(2)),{code:'budget_unavailable'});
});
test('unavailable and ambiguous storage never grant reservations',async()=>{
 for(const store of [{getWithMetadata:async()=>{throw Error('secret');},set:async()=>{}},{getWithMetadata:async()=>null,set:async()=>({modified:true})}])await assert.rejects(createPilotBudget({store,namespace:'pilot/reader',dailyLimit:20,windowLimit:5}).reserve(req(1)),{code:'budget_unavailable'});
});
test('concurrent distinct operations cannot exceed the final slot',async()=>{
 const store=fixture(),options={store,namespace:'pilot/faculty',dailyLimit:10,windowLimit:1,now:()=>100};
 const results=await Promise.allSettled([createPilotBudget(options).reserve(req(1)),createPilotBudget(options).reserve(req(2))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'budget_exhausted');
});
test('rolling cap crosses midnight and daily cap renews independently',async()=>{
 let time=86400000-1;const options={store:fixture(),namespace:'pilot/reader',dailyLimit:1,windowLimit:1,now:()=>time};const b=createPilotBudget(options);
 await b.reserve(req(1));time++;
 await assert.rejects(b.reserve(req(2)),{code:'budget_exhausted'});await assert.rejects(b.reserve(req(1)),{code:'already_submitted'});
 time+=1800000;await b.reserve(req(2));time+=1800000;
 await assert.rejects(b.reserve(req(3)),{code:'budget_exhausted'});
});
