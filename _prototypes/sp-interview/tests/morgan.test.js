// Morgan (alcohol ambivalence, motivational interviewing) behavior suite — MockProvider.
// Mirrors smoke.test.js / marcus.test.js. Morgan entered the canonical pack 2026-09-26 with the
// pack's uniform suicide screen (morgan-pack.test.mjs pins the delta); this suite drives the
// offline engine through his MI checklist, both room modes, and the screen's three routes.
const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'sp-interview.html'),'utf8');
const m=html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/);
if(!m){console.log('FAIL: main script not found');process.exit(1);}
let src=m[0].replace(/^<script>\n/,'').replace(/\n<\/script>$/,'');
global.window={};
global.document={getElementById:()=>({addEventListener(){},removeEventListener(){},textContent:''}),documentElement:{getAttribute:()=>null,setAttribute(){}},createElement:()=>({click(){},set href(v){}}),body:{appendChild(){},removeChild(){}},querySelector:()=>null,addEventListener(){}};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.React={createElement:()=>null,useState:(v)=>[typeof v==='function'?v():v,()=>{}],useEffect:()=>{},useRef:()=>({current:null})};
global.ReactDOM={createRoot:()=>({render(){}})};
global.fetch=()=>Promise.reject(new Error('no net'));
eval(src);
const T=global.window.__SP_TEST__;
const pack=JSON.parse(fs.readFileSync(path.join(ROOT,'sp-interview.pack.json'),'utf8'));
const cd=pack.cases.find(c=>c.id==='sp_alcohol_ambivalence_001');
if(!cd){console.log('FAIL: morgan case not in pack');process.exit(1);}
const P=new T.MockProvider();
let failures=0;

async function run(name,msgs,checks,difficulty){
  const s=P.start(cd,{difficulty:difficulty||'supported'});
  const replies=[];
  for(const msg of msgs){const r=await P.respond(s,msg);replies.push(r.reply);}
  const cov=T.computeCoverage(s), rub=T.computeRubric(s,cov), nar=T.buildNarrative(s,cov,rub);
  const errs=checks(s,cov,rub,nar,replies);
  console.log((errs.length?'FAIL':'PASS')+' — '+name);
  errs.forEach(e=>console.log('   · '+e));
  if(errs.length)failures++;
}
function status(cov,id){const c=cov.find(x=>x.id===id);return c?c.status:'(absent)';}

const SKILLED=[
 "Hi, my name is Alex, I'm the medical student on the team — what would you most want to get out of this conversation?",
 "Tell me a little about what's been going on, in your own words.",
 "It sounds like drinking helps in the moment, and at the same time the mornings have been costing you.",
 "What do you get from drinking — what does it give you?",
 "And what's the downside — what does it cost you?",
 "It's up to you what happens next; I'm not here to tell you what to do.",
 "What matters most to you right now — what do you want to protect?",
 "Have you ever cut down before? What worked?",
 "Have you had thoughts of killing yourself?",
 "Where does that leave you — what small change, if any, might you try?",
];

(async()=>{
await run('skilled MI interview — every checklist item incl. the plain suicide screen',SKILLED,(s,cov,rub,nar,replies)=>{
  const errs=[];
  ['c_open','c_ambivalence','c_reflection','c_autonomy','c_values','c_change','c_si'].forEach(id=>{if(status(cov,id)!=='observed')errs.push(id+' is '+status(cov,id));});
  if(!/\bno\b/i.test(replies[8]))errs.push('the direct screen should be answered with a plain no: '+replies[8]);
  if(/stairs|foggy mornings|not proud|wanting to be dead|haven.t wanted to be dead|not of dying/.test(replies[8])===false)errs.push('the direct-screen reply should be one of the authored lines: '+replies[8]);
  if(rub.organization!=='observed')errs.push('organization should be observed with an opening and a next step (got '+rub.organization+')');
  if(rub.alliance==='missed')errs.push('alliance should credit reflections and autonomy support');
  if(s.rapport<1)errs.push('rapport should rise with reflections and autonomy support (got '+s.rapport+')');
  if(rub.technique!=='observed')errs.push('technique should be observed: every MI technique item plus the plain screen (got '+rub.technique+')');
  return errs;
});

await run('complete MI interview without the screen — technique is partly there, never observed or missed',SKILLED.filter(m=>!/killing yourself/.test(m)),(s,cov,rub)=>{
  const errs=[];
  if(status(cov,'c_si')!=='missed')errs.push('c_si should be missed');
  if(rub.technique!=='partial')errs.push('technique should be partial when the MI items are covered but the screen is not (got '+rub.technique+')');
  if(rub.alliance==='missed')errs.push('alliance should credit the reflection and autonomy support (got '+rub.alliance+')');
  return errs;
});

await run('the coach\'s suggested phrasings are recognised — a hint never steers the learner into unscored wording',[
 "Hi, my name is Alex, I'm the medical student on the team.",
 "Where would you like to begin?",
 "What does alcohol give you?",
 "And what does it cost you?",
 "What do you most want to protect in your daily life?",
],(s,cov)=>{
  const errs=[];
  [['c_open','open_invite'],['c_ambivalence','explore_benefits'],['c_values','values']].forEach(([item,intent])=>{
    if(!s.covered[intent])errs.push(intent+' not recognised from the hint phrasing');
    if(status(cov,item)!=='observed')errs.push(item+' is '+status(cov,item)+' after saying what the hint suggests');
  });
  return errs;
});

await run('realistic mode runs (difficulty object) and stays guarded until rapport is earned',[
 "What's your drinking like?",
 "Have you had thoughts of killing yourself?",
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!replies[1]||!/\bno\b/i.test(replies[1]))errs.push('realistic-mode direct screen should still answer: '+replies[1]);
  if(status(cov,'c_si')!=='observed')errs.push('c_si should be observed after a plain screen even in realistic mode');
  return errs;
},'realistic');

await run('euphemism only — partial credit, and the reply fits any euphemism stem',[
 "Hi, my name is Alex. What would you like to focus on today?",
 "Have you had any dark thoughts?",
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(status(cov,'c_si')!=='partial')errs.push('c_si should be partial after a euphemism (got '+status(cov,'c_si')+')');
  if(!/tired of the mornings/i.test(replies[1]))errs.push('the first euphemism variant should fit a dark-thoughts stem: '+replies[1]);
  if(/suicid|kill/i.test(replies[1]))errs.push('a euphemism reply must not upgrade the question: '+replies[1]);
  return errs;
});

await run('passive-wish question — partial credit, scripted answer',[
 "Do you ever wish you wouldn't wake up?",
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(status(cov,'c_si')!=='partial')errs.push('c_si should be partial after a passive-wish question');
  if(!/tired|mornings/i.test(replies[0]))errs.push('unexpected passive reply: '+replies[0]);
  return errs;
});

await run('no screen at all — the critical item is missed, nothing else is invented',[
 "Hi, my name is Alex. What would you most want from this conversation?",
 "What do you get from drinking?",
 "What does it cost you?",
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(status(cov,'c_si')!=='missed')errs.push('c_si should be missed (got '+status(cov,'c_si')+')');
  const crit=cov.find(c=>c.id==='c_si');
  if(!crit||!crit.critical)errs.push('c_si must be the critical item');
  if(replies.some(r=>/suicid|kill(ing)? (myself|yourself)/i.test(r)))errs.push('Morgan must not raise suicide unasked');
  return errs;
});

await run('labeling and ordering abstinence lower rapport and are flagged',[
 "You have to admit you're an alcoholic.",
 "You must quit forever — it's the only choice.",
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  const flags=[].concat(...s.turns.map(t=>t.flags||[]));
  if(flags.indexOf('confront_label')<0)errs.push('confront_label not flagged');
  if(flags.indexOf('force_abstinence')<0)errs.push('force_abstinence not flagged');
  if(s.rapport>-2)errs.push('rapport should drop after two confrontations (got '+s.rapport+')');
  return errs;
});

await run('a withdrawal-safety question credits its own intent and never the suicide screen',[
 "Is it medically safe for you to stop drinking suddenly — any withdrawal or seizures before?",
],(s,cov,rub,nar,replies)=>{
  const errs=[];
  if(!s.covered['withdrawal_safety'])errs.push('withdrawal_safety not credited');
  if(status(cov,'c_si')!=='missed')errs.push('a withdrawal question must not credit the suicide screen (got '+status(cov,'c_si')+')');
  return errs;
});

// Every pack case must survive one Realistic-mode turn: the offline mock reads difficulty.realistic
// on every reply, and a case copied in with a string difficulty (Morgan, 2026-09-26) threw here.
{
  const errs=[];
  for(const c of pack.cases){
    try{const s=P.start(c,{difficulty:'realistic'});const r=await P.respond(s,"Tell me a little about what's been going on.");if(!r||typeof r.reply!=='string'||!r.reply)errs.push(c.id+': no reply');}
    catch(e){errs.push(c.id+': '+e.message);}
  }
  console.log((errs.length?'FAIL':'PASS')+' — every pack case answers a first turn in Realistic mode');
  errs.forEach(e=>console.log('   · '+e)); if(errs.length)failures++;
}
// The select card reads the persona voice for a pace label; a conversational voice is its own pace.
{
  const errs=[];
  const dana=pack.cases.find(c=>c.id==='sp_depression_gated_si_001');
  const pm=T.paceFor(cd), pd=T.paceFor(dana);
  if(pm.label!=='conversational, even')errs.push('Morgan pace label: '+pm.label);
  if(pm.label===pd.label)errs.push('Morgan must not inherit the depression cadence label');
  if(pm.rate!==0.98)errs.push('Morgan rate should follow the audition profile (0.98), got '+pm.rate);
  console.log((errs.length?'FAIL':'PASS')+' — Morgan carries a conversational pace, not the measured-flat default');
  errs.forEach(e=>console.log('   · '+e)); if(errs.length)failures++;
}
console.log(failures?('\n'+failures+' suite(s) failed'):'\nALL PASS');
process.exit(failures?1:0);
})();
