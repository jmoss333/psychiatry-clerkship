import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';

const file=new URL('../public/practice-content.js',import.meta.url);
const CASES=['sp_depression_gated_si_001','sp_mania_redirect_001','sp_psychosis_paranoid_001','sp_alcohol_ambivalence_001','family_morgan_maya_001'];

function load(browser=true){
  assert.ok(existsSync(file),'The local practice curriculum must be implemented');
  const noExternal=()=>{throw new Error('Static coaching must not access a network or browser store');};
  const env={fetch:noExternal,localStorage:new Proxy({},{get:noExternal}),sessionStorage:new Proxy({},{get:noExternal})};
  if(browser)env.window={};else env.module={exports:{}};
  vm.runInNewContext(readFileSync(file,'utf8'),env,{filename:'practice-content.js'});
  return browser?env.window.PracticeContent:env.module.exports;
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('the public curriculum covers exactly the five full cases in browser and CommonJS consumers',()=>{
  const browser=load(),common=load(false);
  assert.deepEqual(plain(browser.ids()),CASES);
  assert.deepEqual(plain(common.ids()),CASES);
  for(const id of CASES)assert.deepEqual(plain(browser.getCase(id)),plain(common.getCase(id)));
});

test('every selectable goal has complete and distinct student/resident coaching',()=>{
  const content=load(),ids=new Set();
  for(const id of CASES){
    const entry=content.getCase(id);
    assert.deepEqual(Object.keys(entry).sort(),['goals','id','title']);assert.equal(entry.id,id);
    assert.ok(entry.title.trim());assert.equal(entry.goals.length,3,id);
    for(const goal of entry.goals){
      assert.deepEqual(Object.keys(goal).sort(),['id','resident','student','title']);
      assert.match(goal.id,/^[a-z][a-z0-9_]+$/);assert.ok(!ids.has(goal.id),'Goal IDs must remain distinct');ids.add(goal.id);
      assert.ok(goal.title.trim());assert.ok(goal.title.length<=80);
      for(const depth of ['student','resident']){
        const coach=goal[depth];
        assert.deepEqual(Object.keys(coach).sort(),['examples','hint','question','reflection']);
        for(const field of ['question','hint','reflection']){
          assert.equal(typeof coach[field],'string');assert.ok(coach[field].trim().length>=20,goal.id+' '+depth+' '+field);
          assert.ok(coach[field].length<=650,goal.id+' '+depth+' '+field+' must fit a coaching card');
        }
        assert.equal(coach.examples.length,2);
        for(const example of coach.examples){assert.equal(typeof example,'string');assert.ok(example.trim().length>=20);assert.ok(example.length<=420);}
        assert.notEqual(coach.examples[0],coach.examples[1]);
      }
      for(const field of ['question','hint','reflection'])assert.notEqual(goal.student[field],goal.resident[field],goal.id+' '+field+' needs a meaningful depth distinction');
    }
  }
  assert.equal(ids.size,15);
});

test('unknown, inherited, coercible, and moment IDs cannot expose a full-case curriculum',()=>{
  const content=load();
  for(const id of [undefined,null,'','unknown','__proto__','constructor','toString','moment_elena_rupture_001','moment_priya_formulation_001','moment_luis_teachback_001',CASES[0]+' ',{},[],[CASES[0]],{toString(){throw new Error('Must not coerce case IDs');}}])assert.equal(content.getCase(id),null);
});

test('mutating returned case, nested examples, depth fields, or IDs cannot corrupt later sessions',()=>{
  const content=load(),before=plain(content.getCase(CASES[0])),copy=content.getCase(CASES[0]);
  copy.title='changed';copy.goals[0].student.examples[0]='changed';copy.goals[0].resident.hint='changed';copy.goals.pop();
  const ids=content.ids();ids.pop();ids[0]='changed';
  assert.deepEqual(plain(content.getCase(CASES[0])),before);assert.deepEqual(plain(content.ids()),CASES);
});

// These narrow copy-review checks catch previously identified defect classes.
// They are not a semantic validator, diagnosis check, or faculty approval.
const unsafeExamples=[
  {label:'invented doctor identity',pattern:/\bI(?:['’]m| am) (?:your |the |a )?(?:doctor|psychiatrist|attending)\b/i},
  {label:'unsupported privacy assurance',pattern:/\b(?:nothing (?:is|will be) recorded|no one (?:else )?(?:will|can) hear|this (?:is|stays) (?:completely )?confidential)\b/i},
  {label:'unsupported safety or disposition assurance',pattern:/\b(?:you (?:are|['’]re) (?:definitely |completely )?safe|you can go home|I (?:will|can) discharge you)\b/i},
  {label:'pressure to promise safety',pattern:/\bpromise (?:me )?(?:you (?:will not|won['’]t)|not to) (?:hurt|harm|kill)\b/i},
  {label:'family responsibility imposed',pattern:/\bMaya,? (?:you (?:must|need to)|it is your job to) (?:monitor|watch|make sure)\b/i},
];
function assertExampleBoundaries(entry){
  for(const goal of entry.goals)for(const depth of ['student','resident'])for(const example of goal[depth].examples){
    for(const rule of unsafeExamples)assert.doesNotMatch(example,rule.pattern,rule.label);
  }
}

test('authored example wording avoids the pinned role, privacy, reassurance, and family-boundary regressions',()=>{
  const content=load();for(const id of CASES)assertExampleBoundaries(content.getCase(id));
  const titleText=CASES.flatMap(id=>content.getCase(id).goals.map(goal=>goal.title)).join(' ');
  assert.doesNotMatch(titleText,/\b(?:depression|mania|manic|psychosis|psychotic|schizophrenia|suicidal patient)\b/i,'Goal titles must not reveal a diagnosis');
  const publicText=JSON.stringify(CASES.map(id=>content.getCase(id)));
  assert.doesNotMatch(publicText,/four to six beers|fear that a limit will sound uncaring|before the fall|my dad/i,'Known private or unsupported case detail must not enter generic coaching');
});

test('the copy-review checks reject concrete unsafe substitutions rather than passing vacuously',()=>{
  const bad=['I am your psychiatrist, and I will decide what happens.','Nothing is recorded in this conversation.','You are definitely safe, so there is no need to ask further.','Promise me you will not hurt yourself.','Maya, you need to monitor Morgan.'];
  for(const example of bad){
    const entry=load().getCase(CASES[0]);entry.goals[0].student.examples[0]=example;
    assert.throws(()=>assertExampleBoundaries(entry),assert.AssertionError);
  }
});

test('direct safety and family attribution coaching retain follow-up and uncertainty boundaries',()=>{
  const content=load();
  const safety=content.getCase(CASES[0]).goals.find(goal=>goal.id==='dana_safety');assert.ok(safety);
  for(const depth of ['student','resident']){
    assert.match(safety[depth].hint,/supervis/i);assert.match(safety[depth].hint,/follow|clarif/i);
    assert.match(safety[depth].examples.join(' '),/suicide|ending your life/i);
  }
  const attribution=content.getCase(CASES[4]).goals.find(goal=>goal.id==='family_accounts');assert.ok(attribution);
  for(const depth of ['student','resident'])assert.match(attribution[depth].hint,/assume.*witness|witness.*assum/i);
  const privacy=content.getCase(CASES[2]).goals.find(goal=>goal.id==='ray_information');assert.ok(privacy);
  for(const depth of ['student','resident'])assert.match(privacy[depth].hint,/actual.*notice|notice.*actual/i);
});
