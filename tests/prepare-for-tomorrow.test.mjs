import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const html = readFileSync(new URL('../14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html', import.meta.url),'utf8');
const engine = html.match(/<script id="pft-engine">([\s\S]*?)<\/script>/);
assert.ok(engine, 'pure engine exists');
const P = new Function(engine[1]+';return {valid:pftValidSelection,parse:pftParseSelection,reduce:pftReduce,render:pftRender};')();
const data = JSON.parse(html.match(/<script id="pft-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const blank = () => ({task:null,minutes:null,step:'choose',exampleOpen:false,error:''});
test('all explicit pairs work and coercion is rejected',()=>{
  for(const task of ['interview','rounds','note']) for(const minutes of [5,15]) assert.equal(P.valid(task,minutes),true);
  for(const pair of [['other',5],['note','15'],['note',10],[null,5],['note',NaN]]) assert.equal(P.valid(...pair),false);
});
test('URLs accept one literal pair, empty is clean, malformed is a useful chooser',()=>{
  assert.deepEqual(P.parse(''),{task:null,minutes:null,error:''});
  assert.deepEqual(P.parse('?prepareTask=note&prepareMinutes=15'),{task:'note',minutes:15,error:''});
  for(const query of ['?prepareTask=note','?prepareMinutes=15','?prepareTask=note&prepareTask=rounds&prepareMinutes=15','?prepareTask=note&prepareMinutes=15&prepareMinutes=5','?prepareTask=note&prepareMinutes=015','?prepareTask=other&prepareMinutes=5']) assert.deepEqual(P.parse(query),{task:null,minutes:null,error:'Choose a task and time to begin.'});
});
test('no implicit choice and rejected starts preserve chooser',()=>{
  const state=P.reduce(data,blank(),{type:'start'});
  assert.equal(state.step,'choose'); assert.ok(state.error); assert.equal(state.task,null);
  assert.equal(P.reduce(data,{...state,task:'note'},{type:'start'}).step,'choose');
});
test('six independently complete journeys, private rehearsal, deliberate reveal and neutral finish',()=>{
  for(const task of ['interview','rounds','note']) for(const minutes of [5,15]) {
    let state=P.reduce(data,blank(),{type:'task',value:task});
    state=P.reduce(data,state,{type:'minutes',value:minutes});
    state=P.reduce(data,state,{type:'start'}); assert.equal(state.step,'read');
    assert.ok(P.render(data,state).includes(data.tasks[task].routes[minutes].reading.heading));
    state=P.reduce(data,state,{type:'next'}); assert.equal(state.step,'rehearse');
    assert.equal(state.exampleOpen,false); assert.doesNotMatch(P.render(data,state),/<details[^>]* open/);
    state=P.reduce(data,state,{type:'example'}); assert.equal(state.exampleOpen,true);
    assert.match(P.render(data,state),/<details[^>]* open/);
    state=P.reduce(data,state,{type:'next'}); assert.equal(state.step,'card');
    for(const key of ['try','notice','ask']) assert.ok(P.render(data,state).replace(/&#39;/g,"'").includes(data.tasks[task].routes[minutes].card[key]));
    state=P.reduce(data,state,{type:'next'}); assert.equal(state.step,'done');
    assert.match(P.render(data,state),/Preparation finished/);
    assert.deepEqual(Object.keys(state).sort(),['error','exampleOpen','minutes','step','task']);
    assert.deepEqual(P.reduce(data,state,{type:'reset'}),blank());
  }
});
test('changing task or duration closes example and returns to choice',()=>{
  for(const action of [{type:'task',value:'rounds'},{type:'minutes',value:5}]) {
    const state=P.reduce(data,{...blank(),task:'note',minutes:15,step:'rehearse',exampleOpen:true},action);
    assert.equal(state.step,'choose'); assert.equal(state.exampleOpen,false);
  }
});
test('missing teaching fields reject starting rather than silently shrinking the exercise',()=>{
  for(const path of [['reading','heading'],['reading','paragraphs'],['reading','sourceRef'],['reading','sourceSection'],['rehearsal','snapshot'],['rehearsal','prompt'],['rehearsal','example'],['rehearsal','reflection'],['card','try'],['card','notice'],['card','ask']]) {
    const broken=structuredClone(data); delete broken.tasks.note.routes['15'][path[0]][path[1]];
    const state=P.reduce(broken,{...blank(),task:'note',minutes:15},{type:'start'});
    assert.equal(state.step,'choose'); assert.match(state.error,/unavailable/i);
  }
});
test('teaching strings are rendered as text',()=>{
  const modified=structuredClone(data); modified.tasks.note.routes['5'].rehearsal.example='<img src=x onerror="alert(1)"> & \'quoted\'';
  const rendered=P.render(modified,{...blank(),task:'note',minutes:5,step:'rehearse',exampleOpen:true});
  assert.doesNotMatch(rendered,/<img/); assert.match(rendered,/&lt;img/); assert.match(rendered,/&amp;/);
});

test('standalone presentation distinguishes published root, subdirectory and repository source preview',()=>{
  const context=new Function(engine[1]+';return pftPresentationContext;')();
  assert.deepEqual(context('/tools/prepare-for-tomorrow.html'),{sourcePreview:false,homePath:'/'});
  assert.deepEqual(context('/student-site/tools/prepare-for-tomorrow.html'),{sourcePreview:false,homePath:'/student-site/'});
  assert.deepEqual(context('/14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html'),{sourcePreview:true,homePath:'/_build/ms3/'});
  assert.deepEqual(context('/other/prepare-for-tomorrow.html'),{sourcePreview:false,homePath:'/'});
});

function preparationExportChecks() {
 return JSON.parse(execFileSync('python3',['-B','-c',`
import sys,json,re,copy,tempfile
from pathlib import Path
sys.path.insert(0,'13_Faculty_Resources/_automation')
from export_curriculum_review import Doc,render_prepare_for_tomorrow,tool_text
raw=Path('14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html').read_text()
block=re.search(r'<script id="pft-data" type="application/json">([\\s\\S]*?)</script>',raw)
data=json.loads(block.group(1))
def pack(value):return raw[:block.start(1)]+json.dumps(value)+raw[block.end(1):]
doc=Doc('prepare.md','Preparation');routes=render_prepare_for_tomorrow(doc,raw)
with tempfile.TemporaryDirectory() as directory:
 p=Path(directory)/'prepare-for-tomorrow.html';p.write_text(raw)
 visible,js=tool_text(p,exclude_script_ids=('pft-data',))
refused=[]
bad=[raw.replace('id="pft-data"','id="removed"'),raw+block.group(0),raw[:block.start(1)]+'{not JSON}'+raw[block.end(1):],pack({**data,'version':True}),pack({**data,'tasks':None})]
for field in ('orientation','reading','rehearsal','card'):
 d=copy.deepcopy(data);del d['tasks']['note']['routes']['15'][field];bad.append(pack(d))
for parent,field in [('reading','heading'),('reading','paragraphs'),('reading','sourceRef'),('reading','sourceSection'),('rehearsal','snapshot'),('rehearsal','prompt'),('rehearsal','example'),('rehearsal','reflection'),('card','try'),('card','notice'),('card','ask')]:
 d=copy.deepcopy(data);del d['tasks']['note']['routes']['15'][parent][field];bad.append(pack(d))
for parent,field in [('reading','paragraphs'),('rehearsal','reflection')]:
 d=copy.deepcopy(data);d['tasks']['note']['routes']['15'][parent][field]=[];bad.append(pack(d))
d=copy.deepcopy(data);del d['tasks']['rounds']['routes']['5'];bad.append(pack(d))
d=copy.deepcopy(data);d['tasks']['note']['routes']['15']['unhandledTeaching']='New teaching must not disappear';bad.append(pack(d))
for value in bad:
 try:render_prepare_for_tomorrow(Doc('bad.md','Bad'),value)
 except ValueError:refused.append(True)
 else:refused.append(False)
print(json.dumps({'text':doc.text,'routes':routes,'runtime':js,'refused':refused}))
`],{cwd:new URL('../',import.meta.url),encoding:'utf8'}));
}

function preparationTeaching(route) {
 return [route.orientation,route.reading.heading,...route.reading.paragraphs,route.rehearsal.snapshot,route.rehearsal.prompt,route.rehearsal.example,...route.rehearsal.reflection,...Object.values(route.card)];
}
function assertPreparationTranscript(text) {
 const tasks=text.split(/^##### /m).slice(1);
 for(const task of Object.values(data.tasks)) {
  const matches=tasks.filter(section=>section.startsWith(task.title+'\n'));assert.equal(matches.length,1,task.title);
  const sections=matches[0].split(/^###### About /m);
  assert.ok(sections[0].includes('Resources: '+task.resources.map(ref=>'`'+ref+'`').join(', ')));
  for(const [minutes,route] of Object.entries(task.routes)) {
   const routes=sections.slice(1).filter(section=>section.startsWith(minutes+' minutes\n'));assert.equal(routes.length,1,task.title+' '+minutes);
   const counts=new Map();for(const value of preparationTeaching(route))counts.set(value,(counts.get(value)||0)+1);
   for(const [value,count] of counts)assert.equal(routes[0].split(value).length-1,count,task.title+' '+minutes+': '+value);
   assert.ok(routes[0].includes('Source: `'+route.reading.sourceRef+'` · '+route.reading.sourceSection));
  }
 }
}
test('faculty transcript includes all preparation teaching and attribution without prose filters',()=>{
 const exported=preparationExportChecks();assert.equal(exported.routes,6);assertPreparationTranscript(exported.text);
 for(const task of Object.values(data.tasks))for(const route of Object.values(task.routes))for(const text of preparationTeaching(route))assert.ok(!exported.runtime.includes(text),'structured teaching must not be heuristically re-extracted: '+text);
});
test('faculty transcript refuses missing, duplicated and incomplete preparation packs',()=>{
 const {refused}=preparationExportChecks();assert.ok(refused.length>=20);assert.ok(refused.every(Boolean));
});

test('complete CLI exports preserve all preparation fields in MS3 only',()=>{
 const exported=JSON.parse(execFileSync('python3',['-B','-c',`
import sys,json,tempfile,shutil,subprocess
from pathlib import Path
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);build=root/'build';out=root/'out'
 for site in ('ms3','res'):
  b=build/site;(b/'tools').mkdir(parents=True)
  nav=[{'section':'Preparation','items':[{'f':'prepare-for-tomorrow.html','k':'tool','t':'Prepare for tomorrow'}]}] if site=='ms3' else []
  (b/'nav.json').write_text(json.dumps(nav))
  shutil.copyfile('08_Cases_and_Simulation/one-patient-six-weeks.html',b/'tools/one-patient-six-weeks.html')
  shutil.copyfile('longitudinal_case.json',b/'longitudinal_case.json')
  for p in Path('08_Cases_and_Simulation/case-journeys').iterdir():shutil.copyfile(p,b/'tools'/p.name)
 shutil.copyfile('14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html',build/'ms3/tools/prepare-for-tomorrow.html')
 subprocess.run([sys.executable,'-B','13_Faculty_Resources/_automation/export_curriculum_review.py','--audience','all','--build-root',str(build),'--out',str(out)],check=True,capture_output=True)
 print(json.dumps({a:'\\n'.join(p.read_text() for p in (out/a).glob('02_CURRICULUM*.md')) for a in ('ms3','resident')}))
`],{cwd:new URL('../',import.meta.url),encoding:'utf8'}));
 assertPreparationTranscript(exported.ms3);
 for(const task of Object.values(data.tasks))for(const route of Object.values(task.routes))for(const text of [task.title,...preparationTeaching(route)])assert.equal(exported.resident.split(text).length-1,0,text);
});

// Review state is the governance layer's to say, never this guide's own copy (2026-10-09).
// The boundary hard-coded "Draft teaching guide · Pending faculty review." and every reading's
// attribution appended "This new wording awaits faculty review." Both kept saying so after the
// guide was attested on 2026-10-04. The shell already states the live state from the ledger
// (reviewed.json → governance.json → the shared governance notice when the row is pending or
// drifted; nothing extra when it is reviewed), so a fixed phrase here can only be redundant or
// false. Same rule and shape as tests/case-journey-practice.test.mjs for Case Journeys (#1006).
const REVIEW_CLAIM=/pending|faculty review|attest|reviewed by|approved|awaits? (?:faculty )?review/i;
test('authored guide copy makes no claim about faculty review state',()=>{
 const visible=html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ');
 assert.doesNotMatch(visible,REVIEW_CLAIM,'static page copy (boundary, intro, footer)');
 const strings=[];(function walk(v){if(typeof v==='string')strings.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);})(data);
 assert.ok(strings.length>=100,`every pft-data string is checked (${strings.length})`);
 for(const text of strings)assert.doesNotMatch(text,REVIEW_CLAIM,text);
 // The renderer appended the phrase to every reading's attribution, so check its literals too.
 const scripts=[...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 assert.ok(scripts.length>=2,'pft-engine and pft-dom are both checked');
 const code=scripts.join('\n').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/[^\n]*/gm,'');
 const claims=(code.match(/'[^'\n]*'|"[^"\n]*"/g)||[]).filter(literal=>REVIEW_CLAIM.test(literal));
 assert.deepEqual(claims,[],'the renderer adds no review-state string either');
});
