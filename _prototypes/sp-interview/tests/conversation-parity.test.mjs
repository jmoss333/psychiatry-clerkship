import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {_internals} from '../../../sp-proxy/netlify/functions/sp.mjs';
const require=createRequire(import.meta.url);
const {createController}=require('../sp-interview.turns.js');
const html=fs.readFileSync(new URL('../sp-interview.html',import.meta.url),'utf8');
const script=html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/)[0].replace(/^<script>\n/,'').replace(/\n<\/script>$/,'');
const context={window:{},React:{createElement(){},useState(){},useRef(){},useEffect(){}},ReactDOM:{createRoot(){return{render(){}};}},document:{getElementById(){return{};}},URLSearchParams};
vm.createContext(context); vm.runInContext(script,context);
const core=context.window.__SP_TEST__;
const pack=JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json',import.meta.url),'utf8'));
const dana=pack.cases.find(c=>c.id==='sp_depression_gated_si_001');
const questions=[
  'Hi, my name is Alex, a medical student. Is this okay?',
  'Tell me more about what brought you here.',
  'It sounds like this has been very difficult.',
  'How has your sleep been?',
  'How is your appetite?',
  'What has your energy been like?',
  'Have you had thoughts of killing yourself?',
  'Do you have a plan?',
  'Do you have access to those pills?',
  'What has kept you going?'
];
function comparable(state){return{rapport:state.rapport,covered:Object.keys(state.covered).sort(),unlocked:Object.keys(state.unlocked).sort()};}
async function runConversation(thinkingTime){
  const provider=new core.MockProvider(), session=provider.start(dana,{difficulty:'supported'});
  let input,clock=0,next=0;const timers=new Map();const texts=[];const audio=[];
  const controller=createController({
    opening:dana.persona.opening,
    setTimeout(callback,delay){const id=++next;timers.set(id,{callback,at:clock+delay});return id;},
    clearTimeout(id){timers.delete(id);},
    input(callbacks){input=callbacks;return{start(){callbacks.onReady();},stop(){}};},
    speak(options){audio.push(options.text);queueMicrotask(options.onEnded);return{stop(){}};},
    respond(text){texts.push(text);return provider.respond(session,text);}
  });
  controller.setThinkingTime(thinkingTime);controller.start();await new Promise(resolve=>setImmediate(resolve));
  for(const question of questions){
    assert.equal(controller.getSnapshot().phase,'listening');
    input.onResult({text:question,final:true,resultId:'recognition-result'});
    input.onResult({text:question,final:true,resultId:'recognition-result'});
    clock+=thinkingTime?6000:4500;
    for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.callback();}
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.deepEqual(texts,questions);
  assert.equal(audio.length,11);
  assert.equal(controller.getSnapshot().phase,'ended');
  assert.equal(controller.getSnapshot().transcript.length,21);
  return comparable(session);
}
test('ten speech turns preserve Dana server/client state and thinking time never changes it',async()=>{
  const expected=comparable(_internals.deriveState(dana,questions));
  const normal=await runConversation(false),reflective=await runConversation(true);
  assert.deepEqual(normal,expected);assert.deepEqual(reflective,expected);
});
