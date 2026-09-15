import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIProvider} from '../lib/openai-provider.mjs';
import {getMoment} from '../lib/moments/catalog.mjs';
import {createReviewContext} from '../lib/moments/context.mjs';
const sources=[{id:'l1',kind:'learner',speaker:'learner',text:'Hello.',turn:1,uncertain:false}];
const input=()=>createReviewContext(getMoment('moment_elena_rupture_001'),sources,{endReason:'learner_end'});
const response=report=>({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(report)}]}]});
test('review uses one bounded structured actor request with no audio',async()=>{
 let calls=[];const report={schemaVersion:1,scenarioId:'moment_elena_rupture_001',findings:[{criterionId:'E_MISMATCH',status:'not_assessable',observationId:'not_assessable',evidence:[],uncertaintyId:'insufficient_evidence',nextAttemptId:'reflect'}]};
 const p=createOpenAIProvider({env:{OPENAI_API_KEY:'fixture'},fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json(response(report));}});
 assert.deepEqual(await p.evaluateMoment(input()),report);assert.equal(calls.length,1);const b=calls[0].body;
 assert.equal(b.store,false);assert.equal(b.model,'gpt-5.4-2026-03-05');assert.equal(b.max_output_tokens,1800);assert.deepEqual(b.reasoning,{effort:'low'});assert.equal(b.text.format.type,'json_schema');assert.equal(b.text.format.strict,true);assert.equal(p.getUsage().actor.completed,1);
});
test('invalid review inputs never fetch',async()=>{
 let calls=0;const p=createOpenAIProvider({env:{OPENAI_API_KEY:'fixture'},fetchImpl:async()=>{calls++;throw Error();}});
 for(const mutate of [v=>({...v,system:'x'.repeat(24001)}),v=>({...v,system:''}),v=>({...v,sources:[...sources,{...sources[0]}]}),v=>({...v,sources:[{...sources[0],text:'x'.repeat(2001)}]}),v=>({...v,sources:[{...sources[0],extra:true}]}),v=>({...v,schema:{}}),v=>({...v,schema:JSON.parse(JSON.stringify(v.schema))})])await assert.rejects(p.evaluateMoment(mutate(input())));
 assert.equal(calls,0);
});
for(const override of [{status:'incomplete'},{output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'No'}]}]},{output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{}'},{type:'output_text',text:'{}'}]}]},{output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'x'.repeat(16385)}]}]}])test('invalid/refused/mixed review has no repair call',async()=>{
 let calls=0;const p=createOpenAIProvider({env:{OPENAI_API_KEY:'fixture'},fetchImpl:async()=>{calls++;return Response.json({...response({}),...override});}});await assert.rejects(p.evaluateMoment(input()));assert.equal(calls,1);
});

test('schema-invalid provider JSON is rejected without repair',async()=>{let calls=0;const p=createOpenAIProvider({env:{OPENAI_API_KEY:'fixture'},fetchImpl:async()=>{calls++;return Response.json(response({schemaVersion:1,scenarioId:'moment_elena_rupture_001',findings:[]}));}});await assert.rejects(p.evaluateMoment(input()));assert.equal(calls,1);});
