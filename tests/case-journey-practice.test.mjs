import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const api=createRequire(import.meta.url)('../08_Cases_and_Simulation/case-journeys/case-journeys.js');
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const html=fs.readFileSync(new URL('../08_Cases_and_Simulation/one-patient-six-weeks.html',import.meta.url),'utf8');
const cases=[read('longitudinal_case.json'),...['eli-psychosis','leah-depression-trauma','marisol-delirium-capacity'].map(name=>read('08_Cases_and_Simulation/case-journeys/'+name+'.json'))];
function definitions(){const match=html.match(/<script id="case-practice-data" type="application\/json">([\s\S]*?)<\/script>/);assert.ok(match,'structured teaching prompts exist');return JSON.parse(match[1]);}

test('practice requires both explicit choices and rejects coercion or malformed teaching',()=>{
 const defs=definitions(),blank=api.practiceInitial();
 assert.equal(api.validatePractice({...defs,version:true}),false);
 assert.equal(api.practiceReduce(defs,blank,{type:'start'}).step,'choose');
 for(const [task,minutes] of [['other',5],['note','15'],['note',10],[null,5]]){
  const state=api.practiceReduce(defs,{...blank,task,minutes},{type:'start'});assert.equal(state.step,'choose');assert.ok(state.error);
 }
 for(const field of ['prompt','example','card']){
  const broken=structuredClone(defs);delete broken.tasks.note.routes['15'][field];
  assert.equal(api.validatePractice(broken),false);
  assert.match(api.practiceMarkup(broken,cases[0],cases[0].weeks[0],blank),/Practice is unavailable/);
 }
});

test('all 24 selected chapters support all six private practice routes without inventing facts',()=>{
 const defs=definitions();assert.equal(api.validatePractice(defs),true);
 for(const data of cases)for(const chapter of data.weeks)for(const task of ['interview','rounds','note'])for(const minutes of [5,15]){
  let state=api.practiceInitial();
  state=api.practiceReduce(defs,state,{type:'task',value:task});state=api.practiceReduce(defs,state,{type:'minutes',value:minutes});
  state=api.practiceReduce(defs,state,{type:'start'});assert.equal(state.step,'read');
  const reading=api.practiceMarkup(defs,data,chapter,state);assert.ok(reading.includes(api.escape(data.patient.displayName)));assert.ok(reading.includes(api.escape(chapter.label)));assert.match(reading,/href="#case-panel-title"/);
  assert.ok(!reading.includes(api.escape(chapter.patientState)),'supplied story remains in its original section, not a generated clinical note');
  state=api.practiceReduce(defs,state,{type:'next'});assert.equal(state.step,'rehearse');
  let markup=api.practiceMarkup(defs,data,chapter,state);assert.doesNotMatch(markup,/<details[^>]* open|<input|<textarea|contenteditable/);
  state=api.practiceReduce(defs,state,{type:'example'});markup=api.practiceMarkup(defs,data,chapter,state);assert.match(markup,/<details[^>]* open/);assert.ok(markup.includes(api.escape(defs.tasks[task].routes[minutes].example)));
  for(const item of chapter.checklist)assert.ok(!markup.includes(api.escape(item.example)),'existing hypothetical model details do not become facts');
  state=api.practiceReduce(defs,state,{type:'next'});assert.equal(state.step,'card');
  markup=api.practiceMarkup(defs,data,chapter,state);for(const key of ['try','notice','ask'])assert.ok(markup.includes(api.escape(defs.tasks[task].routes[minutes].card[key])));
  state=api.practiceReduce(defs,state,{type:'next'});assert.equal(state.step,'done');assert.match(api.practiceMarkup(defs,data,chapter,state),/Practice finished/);
  assert.deepEqual(api.practiceReduce(defs,state,{type:'reset'}),api.practiceInitial());
 }
});

test('optional interview to rounds to note continuity retains time and clears the example',()=>{
 const defs=definitions();let state={...api.practiceInitial(),task:'interview',minutes:15,step:'card',exampleOpen:true};
 for(const next of ['rounds','note']){state=api.practiceReduce(defs,state,{type:'follow'});assert.equal(state.task,next);assert.equal(state.minutes,15);assert.equal(state.step,'read');assert.equal(state.exampleOpen,false);state.step='card';}
 assert.equal(api.practiceReduce(defs,state,{type:'follow'}).task,'note');
 const premature={...state,task:'interview',step:'choose'};assert.deepEqual(api.practiceReduce(defs,premature,{type:'follow'}),premature);
});

test('original chapter sections and exact reviewed clinical strings remain unchanged',()=>{
 const defs=definitions();
 for(const [i,data] of cases.entries())for(let n=1;n<=6;n++){
  const markup=api.pageMarkup(cases,{slug:['jordan','eli','leah','marisol'][i],chapter:n,invalid:false});
  assert.match(markup,/id="case-practice"/);
  const chapter=data.weeks[n-1],original=api.chapterMarkup(data,chapter);
  assert.equal((original.match(/<section /g)||[]).length,4);
  for(const text of [chapter.patientState,chapter.learnerTask,chapter.handoff,...chapter.checklist.flatMap(x=>[x.prompt,x.example])])assert.equal(markup.split(api.escape(text)).length-1,1);
  assert.doesNotMatch(api.practiceMarkup(defs,data,chapter,api.practiceInitial()),/scor(?:e|ing)|ready for independent/);
 }
});

test('practice strings are escaped and invalid definitions preserve the case context',()=>{
 const defs=definitions();defs.tasks.note.routes['5'].prompt='<img src=x onerror="alert(1)">';
 const markup=api.practiceMarkup(defs,cases[0],cases[0].weeks[0],{...api.practiceInitial(),task:'note',minutes:5,step:'rehearse'});
 assert.doesNotMatch(markup,/<img/);assert.match(markup,/&lt;img/);
 assert.match(api.practiceMarkup(null,cases[0],cases[0].weeks[0],api.practiceInitial()),/existing case chapter remains available/);
});

test('every new authored teaching passage reaches the clinical review export exactly once',()=>{
 const defs=definitions();
 const exported=execFileSync('python3',['-B','-c',`
import sys,tempfile,shutil
from pathlib import Path
sys.path.insert(0,'13_Faculty_Resources/_automation')
from export_curriculum_review import Doc,render_case_journeys
with tempfile.TemporaryDirectory() as directory:
 b=Path(directory);(b/'tools').mkdir()
 shutil.copyfile('08_Cases_and_Simulation/one-patient-six-weeks.html',b/'tools/one-patient-six-weeks.html')
 shutil.copyfile('longitudinal_case.json',b/'longitudinal_case.json')
 for p in Path('08_Cases_and_Simulation/case-journeys').iterdir():shutil.copyfile(p,b/'tools'/p.name)
 doc=Doc('cases.md','Cases');render_case_journeys(doc,b);print(doc.text)
`],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
 const passages=[defs.boundary,defs.reading,defs.exampleBoundary,defs.finishText,...Object.values(defs.tasks).flatMap(task=>Object.values(task.routes).flatMap(route=>[route.prompt,route.example,...Object.values(route.card)]))];
 for(const text of passages)assert.equal(exported.split(text).length-1,1,text);
});

test('clinical review refuses absent, duplicated or incomplete practice teaching',()=>{
 const result=JSON.parse(execFileSync('python3',['-B','-c',`
import sys,json,re
from pathlib import Path
sys.path.insert(0,'13_Faculty_Resources/_automation')
from export_curriculum_review import Doc,render_case_journey_practice
raw=Path('08_Cases_and_Simulation/one-patient-six-weeks.html').read_text()
block=re.search(r'<script id="case-practice-data" type="application/json">([\\s\\S]*?)</script>',raw)
data=json.loads(block.group(1));del data['tasks']['note']['routes']['15']['card']['ask']
broken=raw[:block.start(1)]+json.dumps(data)+raw[block.end(1):]
boolean_version=raw[:block.start(1)]+json.dumps({**json.loads(block.group(1)), 'version': True})+raw[block.end(1):]
refused=[]
for bad in [raw.replace('id="case-practice-data"','id="removed"'),raw+block.group(0),broken,boolean_version]:
 try:render_case_journey_practice(Doc('cases.md','Cases'),bad)
 except ValueError:refused.append(True)
 else:refused.append(False)
print(json.dumps(refused))
`],{cwd:new URL('../',import.meta.url),encoding:'utf8'}));
 assert.deepEqual(result,[true,true,true,true]);
});
