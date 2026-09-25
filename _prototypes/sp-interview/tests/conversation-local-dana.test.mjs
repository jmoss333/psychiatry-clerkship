import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {_internals} from '../../../sp-proxy/netlify/functions/sp.mjs';
import {createContext} from '../dana-live-context.mjs';
import {createDanaServer} from '../dana-live-server.mjs';

// The local draft overlay (dana-direct-si-v1) used to carry one policy on top of the reviewed pack:
// a correct direct suicide question discloses at any rapport, and an earlier flag never blocks it.
// On 2026-09-17 (#565) that policy was promoted INTO the reviewed pack, so the overlay is now an
// identity that only guards the reviewed gate against drift. These tests pin both halves.

const require=createRequire(import.meta.url),overlay=require('../sp-interview.local-dana.js'),responses=require('../sp-interview.responses.js');
const pack=JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json',import.meta.url),'utf8'));
const canonical=pack.cases.find(item=>item.id==='sp_depression_gated_si_001');
const html=fs.readFileSync(new URL('../sp-interview.html',import.meta.url),'utf8');
const script=html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/)[0].replace(/^<script>\n/,'').replace(/\n<\/script>$/,'');
const sandbox={window:{},React:{createElement(){},useState(){},useRef(){},useEffect(){}},ReactDOM:{createRoot(){return{render(){}};}},document:{getElementById(){return{};}},URLSearchParams};
vm.createContext(sandbox);vm.runInContext(script,sandbox);const core=sandbox.window.__SP_TEST__;
const gate=canonical.gated.find(g=>g.id==='si_active');
const QUESTION='Have you had thoughts of killing yourself?';

async function run(turns,caseDef=canonical){const provider=responses.createProvider(core),session=provider.start(caseDef,{difficulty:'supported'});const results=[];for(const text of turns)results.push(await provider.respond(session,text));return{session,results};}

test('the reviewed pack carries the direct-disclosure policy and the overlay is an identity',()=>{
  assert.equal(gate.requiresRapport,-3,'the engine clamps rapport at -3, so -3 means "no rapport gate"');
  assert.deepEqual(gate.blockedByRecentFlags,[]);
  assert.equal(overlay.applyCase(canonical),canonical,'applyCase returns the very same object');
  assert.equal(Object.hasOwn(canonical,'localDraftOverlay'),false);
  assert.equal(canonical.facultyReview.status,'reviewed');
  assert.equal(overlay.promoted.issue,565);
  assert.equal(createHash('sha256').update(JSON.stringify(gate)).digest('hex'),overlay.sourceGateHash);
});

test('source gate pin fails closed if any reviewed behavior or shape drifts',()=>{
  const mutations=[
    g=>{g.reveal+=' altered';},
    g=>{g.deflectLowRapport+=' altered';},
    g=>{g.repeatAsk+=' altered';},
    g=>{g.unlocks=['si_plan'];},
    g=>{g.euphemismIntent='other';},
    g=>{g.unexpected=true;},
    g=>{g.requiresRapport=1;},
    g=>{g.blockedByRecentFlags=['judgmental'];}
  ];
  for(const mutate of mutations){
    const changed=structuredClone(canonical);mutate(changed.gated.find(item=>item.id==='si_active'));
    assert.throws(()=>overlay.applyCase(changed),/reviewed safety gate changed/);
  }
  const duplicate=structuredClone(canonical);duplicate.gated.push(structuredClone(gate));
  assert.throws(()=>overlay.applyCase(duplicate),/reviewed safety gate changed/);
});

test('a case still carrying the retired overlay marker is rejected as stale',()=>{
  const stale=structuredClone(canonical);stale.localDraftOverlay={id:'dana-direct-si-v1',status:'reviewed'};
  assert.throws(()=>overlay.applyCase(stale),/promoted into the reviewed pack/);
});

test('recording compatibility rejects spoken-inventory drift',()=>{
  const changed=structuredClone(canonical);changed.gated.find(item=>item.id==='si_active').repeatAsk+=' altered';
  assert.throws(()=>overlay.assertSpeechCompatible(canonical,changed),/changed recorded speech/);
  assert.equal(overlay.assertSpeechCompatible(canonical,canonical),true);
});

test('A: a first-turn direct suicide question receives the authored active-ideation disclosure (#565)',async()=>{
  const {session,results}=await run([QUESTION]);
  assert.equal(results[0].reply,gate.reveal);assert.equal(session.unlocked.si_active,true);
  assert.notEqual(results[0].reply,gate.deflectLowRapport);
});

test('C2: one earlier reassurance does not suppress a later correct direct question (#565)',async()=>{
  const turns=['Hi, my name is Alex. Is this okay?','Tell me more about what brought you here.','It sounds like this has been very difficult.',"Don't worry, everything will be okay.",QUESTION];
  const {session,results}=await run(turns);
  assert.equal(results.at(-1).reply,gate.reveal);assert.equal(session.unlocked.si_active,true);
  assert.match(results[3].reply,/don't actually know that|Sure\. Fine/,'the reassurance turn itself gets the pushback -- the friction belongs there');
});

test('D and E: an earlier judgment cannot block disclosure and a direct re-ask uses the authored continuation (#565)',async()=>{
  let result=await run(['You just need to snap out of it.',QUESTION]);
  assert.equal(result.results.at(-1).reply,gate.reveal);
  result=await run([QUESTION,QUESTION]);
  assert.equal(result.results[0].reply,gate.reveal);assert.equal(result.results[1].reply,gate.repeatAsk);
});

test('no reply in the direct-question sequences attributes friction to the question itself',async()=>{
  const sequences=[[QUESTION],['You just need to snap out of it.',QUESTION],["Don't worry, everything will be okay.",QUESTION],[QUESTION,QUESTION]];
  for(const turns of sequences){
    const {results}=await run(turns);
    for(const r of results) assert.doesNotMatch(String(r.reply),/very direct question|four minutes/,turns.join(' | '));
  }
});

test('follow-up depth gates remain locked until active ideation was directly disclosed',async()=>{
  let result=await run(['Do you have a plan?']);assert.equal(result.results[0].reply,canonical.gated.find(g=>g.id==='si_plan_detail').deflectIfLocked);
  result=await run([QUESTION,'Do you have a plan?']);
  assert.equal(result.results[1].reply,canonical.gated.find(g=>g.id==='si_plan_detail').reveal);
});

test('live local context and production derivation agree: the first-turn question discloses',()=>{
  const history=[{who:'pt',text:canonical.persona.opening,playbackStatus:'played'},{who:'me',text:QUESTION}];
  const local=createContext(canonical,[QUESTION],history);
  assert.equal(local.state.unlocked.si_active,true);assert.match(local.system,/Most nights/);
  assert.equal(_internals.deriveState(canonical,[QUESTION]).unlocked.si_active,true);
  assert.equal(_internals.deriveState(canonical,['You just need to snap out of it.',QUESTION]).unlocked.si_active,true);
});

test('live context full-source hash rejects gate and response tampering',()=>{
  const history=[{who:'pt',text:canonical.persona.opening,playbackStatus:'played'}];
  const gateChange=structuredClone(canonical);gateChange.gated.find(item=>item.id==='si_active').repeatAsk+=' altered';
  assert.throws(()=>createContext(gateChange,[],history),/grounding sources changed/);
  const responseChange=structuredClone(canonical);responseChange.responses.mood.guarded[0]+=' altered';
  assert.throws(()=>createContext(responseChange,[],history),/grounding sources changed/);
});

test('default loopback server discloses on a first-turn direct question',async t=>{
  const calls=[];const provider={configured:true,async reply(input){calls.push(input);return 'I have been feeling tired.';},async speak(){return Buffer.from('ID3-test-audio');}};
  const server=createDanaServer({provider});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,request=(route,body)=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const session=await (await request('/api/dana/session',{})).json();
  const response=await request('/api/dana/turn',{sessionId:session.sessionId,turnId:1,text:QUESTION,previousPlayback:'played'});
  assert.equal(response.status,200);assert.equal(calls.length,1);
  assert.match(calls[0].system,/Most nights, when I'm awake at three/);
});
