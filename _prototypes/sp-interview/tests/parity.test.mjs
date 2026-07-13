import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const { _internals } = await import(path.join(REPO,'sp-proxy/netlify/functions/sp.mjs'));
const pack = JSON.parse(fs.readFileSync(path.join(REPO,'_prototypes/sp-interview/sp-interview.pack.json'),'utf8'));
const cd = pack.cases[0];
const html = fs.readFileSync(path.join(REPO,'_prototypes/sp-interview/sp-interview.html'),'utf8');
const m = html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/);
let src = m[0].replace(/^<script>\n/,'').replace(/\n<\/script>$/,'');
global.window={}; global.document={getElementById:()=>({addEventListener(){},removeEventListener(){},textContent:''}),documentElement:{getAttribute:()=>null,setAttribute(){}},createElement:()=>({click(){}})};
global.localStorage={getItem:()=>null,setItem(){}};
global.React={createElement:()=>null,useState:(v)=>[v,()=>{}],useEffect:()=>{},useRef:()=>({current:null})};
global.ReactDOM={createRoot:()=>({render(){}})}; global.fetch=()=>Promise.reject(new Error('no net'));
eval(src);
const T=global.window.__SP_TEST__;
const scenarios = {
  skilled: ["Hi, my name is Alex, I'm the medical student on the team. Before we start — what would you most want us to understand today?","Tell me more about what's been going on, in your own words.","It sounds like everything has felt really heavy for a while.","When you say burden — have you had thoughts of killing yourself?","Do you have a plan?","Are the pills still at home — do you have access to them?","What has kept you going?"],
  cold_si_first: ["Have you had thoughts of killing yourself?","Do you have a plan?"],
  judgmental_block: ["You should just snap out of it.","Have you had thoughts of killing yourself?"],
  euphemism: ["Tell me what's been going on.","It sounds like that's been really hard.","Do you ever think about hurting yourself?"],
  // Compound / flagged single-turn inputs — the client replies once per turn (flag OR SI OR one
  // secondary gate), so these must NOT advance extra gates. Guards server/client cascade parity.
  flag_plus_si_same_turn: ["Tell me more about what's been going on, in your own words.","What's the diagnosis? Have you had thoughts of killing yourself?"],
  si_direct_plus_secondary: ["Hi, my name is Alex, I'm the medical student on the team. Before we start — what would you most want us to understand today?","Tell me more about what's been going on, in your own words.","It sounds like everything has felt really heavy.","Have you thought about killing yourself, and do you have a plan?"],
  compound_secondary: ["Hi, my name is Alex, I'm the medical student on the team. Before we start — what would you most want us to understand today?","Tell me more about what's been going on, in your own words.","It sounds like everything has felt really heavy.","Have you had thoughts of killing yourself?","Do you have a plan, and access to any means at home?"]
};
let fails=0;
for (const [name,msgs] of Object.entries(scenarios)) {
  const sv = _internals.deriveState(cd, msgs);
  const P = new T.MockProvider(); const cs = P.start(cd,{difficulty:'supported'});
  for (const msg of msgs) await P.respond(cs,msg);
  const svU=Object.keys(sv.unlocked).sort().join(','), clU=Object.keys(cs.unlocked).sort().join(',');
  const svC=Object.keys(sv.covered).sort().join(','), clC=Object.keys(cs.covered).sort().join(',');
  const ok = svU===clU && sv.rapport===cs.rapport && svC===clC;
  console.log((ok?'PASS':'FAIL')+' parity — '+name+' (rapport '+sv.rapport+'/'+cs.rapport+', unlocked ['+svU+'] vs ['+clU+'])');
  if(!ok){fails++; if(svC!==clC)console.log('  server covered:',svC,'\n  client covered:',clC);}
}
// (locked-content leak checks live in leak.test.mjs with gate-unique probe phrases)
process.exit(fails?1:0);
