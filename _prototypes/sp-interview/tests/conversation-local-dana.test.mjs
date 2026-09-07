import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {_internals} from '../../../sp-proxy/netlify/functions/sp.mjs';
import {createContext} from '../dana-live-context.mjs';
import {createDanaServer} from '../dana-live-server.mjs';

const require=createRequire(import.meta.url),overlay=require('../sp-interview.local-dana.js'),responses=require('../sp-interview.responses.js');
const pack=JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json',import.meta.url),'utf8'));
const canonical=pack.cases.find(item=>item.id==='sp_depression_gated_si_001'),variant=overlay.applyCase(canonical);
const html=fs.readFileSync(new URL('../sp-interview.html',import.meta.url),'utf8');
const script=html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/)[0].replace(/^<script>\n/,'').replace(/\n<\/script>$/,'');
const sandbox={window:{},React:{createElement(){},useState(){},useRef(){},useEffect(){}},ReactDOM:{createRoot(){return{render(){}};}},document:{getElementById(){return{};}},URLSearchParams};
vm.createContext(sandbox);vm.runInContext(script,sandbox);const core=sandbox.window.__SP_TEST__;

async function run(turns){const provider=responses.createProvider(core),session=provider.start(variant,{difficulty:'supported'});const results=[];for(const text of turns)results.push(await provider.respond(session,text));return{session,results};}

test('local overlay changes only the initial direct-disclosure policy and preserves recorded speech',()=>{
  const before=JSON.stringify(canonical),sourceGate=canonical.gated.find(g=>g.id==='si_active'),localGate=variant.gated.find(g=>g.id==='si_active');
  assert.equal(localGate.requiresRapport,-3);assert.deepEqual(localGate.blockedByRecentFlags,[]);
  assert.equal(localGate.reveal,sourceGate.reveal);assert.equal(localGate.repeatAsk,sourceGate.repeatAsk);
  assert.deepEqual(variant.gated.filter(g=>g.id!=='si_active'),canonical.gated.filter(g=>g.id!=='si_active'));
  assert.equal(overlay.assertSpeechCompatible(canonical,variant),true);
  assert.equal(JSON.stringify(canonical),before);assert.equal(canonical.facultyReview.status,'reviewed');
  assert.equal(variant.localDraftOverlay.status,'draft-pending-faculty-review');
  assert.equal(createHash('sha256').update(JSON.stringify(sourceGate)).digest('hex'),overlay.sourceGateHash);
});

test('source gate pin fails closed if any reviewed behavior or shape drifts',()=>{
  const mutations=[
    gate=>{gate.reveal+=' altered';},
    gate=>{gate.deflectLowRapport+=' altered';},
    gate=>{gate.repeatAsk+=' altered';},
    gate=>{gate.unlocks=['si_plan'];},
    gate=>{gate.euphemismIntent='other';},
    gate=>{gate.unexpected=true;}
  ];
  for(const mutate of mutations){
    const changed=structuredClone(canonical),gate=changed.gated.find(item=>item.id==='si_active');mutate(gate);
    assert.throws(()=>overlay.applyCase(changed),/reviewed safety gate changed/);
  }
  const duplicate=structuredClone(canonical);duplicate.gated.push(structuredClone(duplicate.gated.find(item=>item.id==='si_active')));
  assert.throws(()=>overlay.applyCase(duplicate),/reviewed safety gate changed/);
});

test('an overlay id cannot bypass validation of the policy, source text, or draft marker',()=>{
  const mutations=[
    value=>{value.gated.find(item=>item.id==='si_active').requiresRapport=0;},
    value=>{value.gated.find(item=>item.id==='si_active').blockedByRecentFlags=['judgmental'];},
    value=>{value.gated.find(item=>item.id==='si_active').reveal+=' altered';},
    value=>{value.localDraftOverlay.status='reviewed';},
    value=>{value.localDraftOverlay.sourceGateHash='tampered';},
    value=>{value.localDraftOverlay.extra=true;},
    value=>{value.localDraftOverlay.id='other-overlay';}
  ];
  for(const mutate of mutations){const changed=structuredClone(variant);mutate(changed);assert.throws(()=>overlay.applyCase(changed),/local draft overlay changed/);}
  assert.equal(overlay.applyCase(variant),variant);
});

test('recording compatibility rejects spoken-inventory drift',()=>{
  const changed=structuredClone(variant);changed.gated.find(item=>item.id==='si_active').repeatAsk+=' altered';
  assert.throws(()=>overlay.assertSpeechCompatible(canonical,changed),/changed recorded speech/);
});

test('A: a first-turn direct suicide question receives the authored active-ideation disclosure',async()=>{
  const {session,results}=await run(['Have you had thoughts of killing yourself?']);
  assert.equal(results[0].reply,variant.gated[0].reveal);assert.equal(session.unlocked.si_active,true);
});

test('C2: one earlier reassurance does not suppress a later correct direct question',async()=>{
  const turns=['Hi, my name is Alex. Is this okay?','Tell me more about what brought you here.','It sounds like this has been very difficult.',"Don't worry, everything will be okay.",'Have you had thoughts of killing yourself?'];
  const {session,results}=await run(turns);
  assert.equal(results.at(-1).reply,variant.gated[0].reveal);assert.equal(session.unlocked.si_active,true);
});

test('D and E: an earlier judgment cannot block disclosure and a direct re-ask uses authored continuation',async()=>{
  let result=await run(['You just need to snap out of it.','Have you had thoughts of killing yourself?']);
  assert.equal(result.results.at(-1).reply,variant.gated[0].reveal);
  result=await run(['Have you had thoughts of killing yourself?','Have you had thoughts of killing yourself?']);
  assert.equal(result.results[0].reply,variant.gated[0].reveal);assert.equal(result.results[1].reply,variant.gated[0].repeatAsk);
});

test('follow-up depth gates remain locked until active ideation was directly disclosed',async()=>{
  let result=await run(['Do you have a plan?']);assert.equal(result.results[0].reply,variant.gated.find(g=>g.id==='si_plan_detail').deflectIfLocked);
  result=await run(['Have you had thoughts of killing yourself?','Do you have a plan?']);
  assert.equal(result.results[1].reply,variant.gated.find(g=>g.id==='si_plan_detail').reveal);
});

test('live local context derives the same disclosure without changing production derivation',()=>{
  const question='Have you had thoughts of killing yourself?',history=[{who:'pt',text:variant.persona.opening,playbackStatus:'played'},{who:'me',text:question}];
  const local=createContext(variant,[question],history);
  assert.equal(local.state.unlocked.si_active,true);assert.match(local.system,/Most nights/);
  assert.equal(_internals.deriveState(canonical,[question]).unlocked.si_active,undefined);
  assert.equal(_internals.deriveState(variant,[question]).unlocked.si_active,true);
});

test('live context full-source hash rejects local gate and response tampering',()=>{
  const history=[{who:'pt',text:variant.persona.opening,playbackStatus:'played'}];
  const gateChange=structuredClone(variant);gateChange.gated.find(item=>item.id==='si_active').repeatAsk+=' altered';
  assert.throws(()=>createContext(gateChange,[],history),/grounding sources changed/);
  const responseChange=structuredClone(variant);responseChange.responses.mood.guarded[0]+=' altered';
  assert.throws(()=>createContext(responseChange,[],history),/grounding sources changed/);
});

test('default loopback server uses the local disclosure variant',async t=>{
  const calls=[];const provider={configured:true,async reply(input){calls.push(input);return 'I have been feeling tired.';},async speak(){return Buffer.from('ID3-test-audio');}};
  const server=createDanaServer({provider});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,request=(route,body)=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const session=await (await request('/api/dana/session',{})).json();
  const response=await request('/api/dana/turn',{sessionId:session.sessionId,turnId:1,text:'Have you had thoughts of killing yourself?',previousPlayback:'played'});
  assert.equal(response.status,200);assert.equal(calls.length,1);
  assert.match(calls[0].system,/Most nights, when I'm awake at three/);
});
