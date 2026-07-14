// Ray (paranoid psychosis) behavior suite — MockProvider. Mirrors smoke.test.js harness.
const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'sp-interview.html'),'utf8');
const m=html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/);
if(!m){console.log('FAIL: main script not found');process.exit(1);}
let src=m[0].replace(/^<script>\n/,'').replace(/\n<\/script>$/,'');
global.window={};
global.document={getElementById:()=>({addEventListener(){},removeEventListener(){},textContent:''}),documentElement:{getAttribute:()=>null,setAttribute(){}},createElement:()=>({click(){},set href(v){},set download(v){}})};
global.localStorage={getItem:()=>null,setItem(){}};
global.React={createElement:()=>null,useState:(v)=>[v,()=>{}],useEffect:()=>{},useRef:()=>({current:null})};
global.ReactDOM={createRoot:()=>({render(){}})};
global.fetch=()=>Promise.reject(new Error('no net'));
eval(src);
const T=global.window.__SP_TEST__;
const pack=JSON.parse(fs.readFileSync(path.join(ROOT,'sp-interview.pack.json'),'utf8'));
const cd=pack.cases.find(c=>c.id==='sp_psychosis_paranoid_001');
if(!cd){console.log('FAIL: ray case not in pack');process.exit(1);}
const P=new T.MockProvider();
let failures=0;
async function run(name,msgs,checks){
  const s=P.start(cd,{difficulty:'supported'});
  const replies=[];
  for(const msg of msgs){const r=await P.respond(s,msg);replies.push(r.reply);}
  const cov=T.computeCoverage(s), rub=T.computeRubric(s,cov), nar=T.buildNarrative(s,cov,rub);
  const errs=checks(s,cov,rub,nar,replies);
  console.log((errs.length?'FAIL':'PASS')+' — '+name);
  errs.forEach(e=>console.log('   · '+e));
  if(errs.length)failures++;
}

const SKILLED=[
 "Hi, I'm Alex, one of the medical students — and no, this isn't being recorded. You're in control of what we talk about.",
 "We can stop whenever you want. What has this been like for you, these last few weeks?",
 "That sounds really frightening — living like that.",
 "Help me understand what you've noticed at home.",
 "That sounds exhausting — carrying all of this by yourself.",
 "Have you been hearing anything — like sounds or voices — that other people don't seem to?",
 "When the voice talks, does it ever tell you to do anything?",
 "Have you had any thoughts of killing yourself?",
 "Have you had thoughts of hurting the people you're afraid of?",
 "When did you last eat or drink something?",
 "Any alcohol or drugs at all — I want to rule that out with you?",
 "Any medications, head injuries, or fevers recently?",
 "When did all this start, and how were things before — school or work?",
 "Has anyone in your family been through something like this?",
 "Would it be okay if I talked with your sister who brought you in?",
 "Let me make sure I understand what you told me — and can we talk about what would help you feel safer tonight?"
];

(async()=>{
await run('skilled non-threatening interview',SKILLED,(s,cov,rub,nar,replies)=>{
  const errs=[];
  ['g_command','g_not_eating','g_target'].forEach(g=>{if(!s.unlocked[g])errs.push(g+' did not unlock');});
  if(!(replies[6]||'').includes('make them stop before they finish'))errs.push('command reveal missing: '+replies[5]);
  if(!(replies[9]||'').includes("seal's still on"))errs.push('food-refusal reveal missing: '+replies[8]);
  if(!(replies[8]||'').includes('voice wants that'))errs.push('target reveal missing: '+replies[7]);
  const missed=cov.filter(c=>c.status!=='observed');
  if(missed.length)errs.push('non-observed checklist: '+missed.map(c=>c.id+'='+c.status).join(','));
  ['alliance','data','technique','organization'].forEach(k=>{if(rub[k]!=='observed')errs.push(k+'='+rub[k]);});
  if(s.rapport<2)errs.push('rapport low: '+s.rapport);
  return errs;
});

await run('command screen at rapport 0 → deflected, gate locked (contrast with skilled)',[
 "Do the voices tell you to do anything?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(s.unlocked['g_command'])errs.push('command gate should NOT unlock at rapport 0');
  if(!(replies[0]||'').includes('put me somewhere'))errs.push('low-rapport deflect wrong: '+replies[0]);
  return errs;
});

await run('challenging the delusion shuts Ray down and blocks the command gate',[
 "No one is poisoning you — that's not real.",
 "Okay, but do the voices tell you to do anything?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!s.turns[0].flags.includes('challenge_delusion'))errs.push('challenge not flagged');
  if(s.unlocked['g_command'])errs.push('command gate unlocked despite recent challenge flag');
  if(!(replies[0]||'').includes('done here'))errs.push('challenge deflection wrong: '+replies[0]);
  if(s.rapport>-1)errs.push('rapport did not drop: '+s.rapport);
  return errs;
});

await run('colluding with the delusion inflames Ray and is flagged',[
 "You're right, they really are after you — we need to stop them."
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!s.turns[0].flags.includes('collude_delusion'))errs.push('collude not flagged');
  if(!(replies[0]||'').toLowerCase().includes('listening')&&!(replies[0]||'').toLowerCase().includes('who told you')&&!(replies[0]||'').toLowerCase().includes('with them'))errs.push('collude escalation wrong: '+replies[0]);
  if(s.rapport>-1)errs.push('rapport did not drop from collusion: '+s.rapport);
  return errs;
});

await run('target gate locked until command gate opens',[
 "Have you thought about hurting the neighbors?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(s.unlocked['g_target'])errs.push('target sub-gate unlocked without command gate');
  if(!(replies[0]||'').includes("getting at"))errs.push('locked sub-gate deflect wrong: '+replies[0]);
  if(!s.covered['violence_screen'])errs.push('violence_screen should count as asked');
  return errs;
});

await run('command screen never asked → critical miss surfaces in coverage',[
 "Hi, I'm Alex, no recording here, you're in control.",
 "What have the last few weeks been like?",
 "That sounds terrifying.",
 "Have you had any thoughts of killing yourself?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  const crit=cov.filter(c=>c.critical)[0];
  if(!crit||crit.id!=='c_command')errs.push('critical item should be c_command');
  if(crit.status==='observed')errs.push('c_command should be missed (never asked)');
  return errs;
});

process.exit(failures?1:0);
})().catch(e=>{console.log('CRASH',e);process.exit(1);});
