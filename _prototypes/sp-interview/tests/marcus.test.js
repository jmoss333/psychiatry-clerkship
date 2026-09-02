// Marcus (mania) behavior suite — MockProvider. Mirrors smoke.test.js harness.
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
const cd=pack.cases.find(c=>c.id==='sp_mania_redirect_001');
if(!cd){console.log('FAIL: marcus case not in pack');process.exit(1);}
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
 "Hi, my name is Alex, I'm the medical student on the team — before we start, what would you most want from this conversation?",
 "Tell me what's been going on, in your own words.",
 "It sounds like everything sped up fast — and that must be really intense.",
 "I do want to hear about the irrigation fix — first, let's start with your sleep. How many hours are you actually getting?",
 "Are you tired at all during the day?",
 "How has your mood been — any stretches of feeling irritable, or crashing?",
 "Tell me about these big plans — what's it like from the inside?",
 "Do your thoughts feel like they're racing?",
 "That sounds really scary — thank you for telling me.",
 "What have you been spending money on lately?",
 "Any new partners, or times you weren't as careful as usual?",
 "With everything moving this fast — have you had thoughts of killing yourself, even for a second?",
 "Do you ever hear voices, or get messages meant just for you?",
 "Any stimulants at all — Adderall, cocaine — and how much are you drinking?",
 "Did the campus clinic prescribe you anything recently — what happened with those little white pills?",
 "Has anyone in your family ever had anything like this?",
 "Would it be okay if we call your roommate Jayden to hear his side?",
 "How long has the speed been building?",
 "Let me make sure I've got this right: two weeks of two-hour nights, some choices you're not proud of, and a scary hour on Tuesday — did I miss anything?"
];

(async()=>{
await run('skilled containment interview',SKILLED,(s,cov,rub,nar,replies)=>{
  const errs=[];
  ['g_fear_passenger','g_spending','g_sexual','g_si_mixed'].forEach(g=>{if(!s.unlocked[g])errs.push(g+' did not unlock');});
  if(!(replies[7]||'').includes('passenger'))errs.push('fear reveal not returned: '+replies[7]);
  if(!(replies[9]||'').includes('nine hundred'))errs.push('spending reveal not returned: '+replies[9]);
  if(!(replies[11]||'').includes('flicker'))errs.push('mixed-features SI reveal not returned: '+replies[11]);
  const missed=cov.filter(c=>c.status!=='observed');
  if(missed.length)errs.push('non-observed checklist items: '+missed.map(c=>c.id+'='+c.status).join(','));
  ['alliance','data','technique','organization'].forEach(k=>{if(rub[k]!=='observed')errs.push(k+'='+rub[k]);});
  if(s.rapport<2)errs.push('rapport low: '+s.rapport);
  return errs;
});

await run('cold direct SI answers at rapport 0 (contrast with Dana)',[
 "Have you had thoughts of killing yourself?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!s.unlocked['g_si_mixed'])errs.push('mixed SI gate should unlock at rapport 0');
  if(!(replies[0]||'').includes('flicker'))errs.push('reveal missing: '+replies[0]);
  return errs;
});

await run('"calm down" blocks the SI gate',[
 "You need to calm down, okay?",
 "Have you had thoughts of killing yourself?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!s.turns[0].flags.includes('judgmental'))errs.push('calm down not flagged');
  if(s.unlocked['g_si_mixed'])errs.push('gate unlocked despite recent judgmental flag');
  if(!(replies[1]||'').includes('swinging'))errs.push('blocked deflection wrong: '+replies[1]);
  if(s.rapport>-1)errs.push('rapport did not drop: '+s.rapport);
  return errs;
});

await run('arguing with grandiosity blocks the fear disclosure',[
 "That's not realistic — you can't possibly fix campus irrigation.",
 "Do your thoughts feel like they're racing?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!s.turns[0].flags.includes('argue_grandiosity'))errs.push('argue not flagged');
  if(s.unlocked['g_fear_passenger'])errs.push('fear gate unlocked after arguing');
  if(!(replies[1]||'').includes('EFFICIENT'))errs.push('racing deflection wrong: '+replies[1]);
  return errs;
});

await run('two gates in one message — only the first consumes the turn',[
 "What are you spending money on — and any new partners?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(s.unlocked['g_spending']||s.unlocked['g_sexual'])errs.push('gate unlocked at rapport 0');
  if(!(replies[0]||'').includes('audit energy'))errs.push('expected spending deflection first: '+replies[0]);
  if(!s.covered['spending']||!s.covered['sexual_risk'])errs.push('both intents should count as asked');
  return errs;
});

await run('flag + SI in the same message — flag wins, gate untouched',[
 "You should be honest with me — have you had thoughts of killing yourself?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!s.turns[0].flags.includes('judgmental'))errs.push('judgmental not flagged');
  if(s.unlocked['g_si_mixed'])errs.push('gate must not unlock on a flagged turn');
  if(!s.covered['si_direct'])errs.push('si_direct should still count as asked');
  return errs;
});

await run('warm redirection raises alliance and earns the focused answer',[
 "Hi, my name is Alex — I'm one of the medical students. Is this okay with you?",
 "I do want to hear about the schedule fix — first, let's start with your sleep. How many hours last night?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(s.rapport<2)errs.push('redirect did not raise rapport: '+s.rapport);
  if(!(replies[1]||'').includes('not tired'))errs.push('expected focused (open-tier) sleep answer: '+replies[1]);
  return errs;
});

// D12 (#410, ratified 2026-08-31): a euphemism is a move, not a screen — on Marcus
// too. Before this wave "hurting yourself" hit si_direct, unlocked g_si_mixed at
// rapport 0, and certified a plain screen that never happened. Modelled on
// smoke.test.js scenario 2 (the same contract, on Dana).
await run('euphemism only — gate stays locked, c_si partial, deflection in character',[
 "Why are you here?",
 "How much are you sleeping?",
 "Any changes in your energy?",
 "Have you thought about hurting yourself?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(s.unlocked['g_si_mixed'])errs.push('gate unlocked on a euphemism — D12 violation');
  if(!s.covered['si_euphemism'])errs.push('si_euphemism not counted as asked');
  if(s.covered['si_direct'])errs.push('si_direct credited for a euphemism — D12 violation');
  if(!(replies[3]||'').toLowerCase().includes('hurt myself'))errs.push('euphemism deflect not used: '+replies[3]);
  const si=cov.find(c=>c.id==='c_si');
  if(!si)errs.push('no c_si coverage row');
  else if(si.status!=='partial')errs.push('c_si = '+si.status+' (expected partial)');
  if(!nar.growth.some(g=>g.t.includes('euphemism')))errs.push('euphemism growth point missing');
  return errs;
});

// The other half of D12: the plain screen still works, and a euphemism first does
// not consume or block it.
await run('euphemism then plain screen — the plain screen still credits and unlocks',[
 "Hi, my name is Alex — I'm one of the medical students. Is this okay with you?",
 "Tell me what's been going on, in your own words.",
 "It sounds like everything sped up fast — that must be really intense.",
 "Have you thought about hurting yourself?",
 "Have you had thoughts of killing yourself?"
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!s.covered['si_euphemism'])errs.push('si_euphemism not counted as asked');
  if(!s.covered['si_direct'])errs.push('si_direct not counted after the plain screen');
  const si=cov.find(c=>c.id==='c_si');
  if(!si||si.status!=='observed')errs.push('c_si = '+(si&&si.status)+' (expected observed)');
  return errs;
});

process.exit(failures?1:0);
})().catch(e=>{console.log('CRASH',e);process.exit(1);});
