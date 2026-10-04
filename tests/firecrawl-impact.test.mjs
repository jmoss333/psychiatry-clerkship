import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('impact scanner covers teaching fields, excludes incorrect answers, and reports malformed coverage',()=>{
 const r=spawnSync('python3',['-c',`
import sys
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
from question_impact import scan_impacts
bank={'items':[
 {'id':'old','stem':'Adult clozapine treatment','why':'Clozapine requires enrollment.', 'evidence':'Clozapine monitoring guidance.', 'pearl':'Monitor clozapine.', 'options':[{'t':'Enrollment is mandatory for clozapine','trap':{'note':'Clozapine requires enrollment.'}}], 'tier2':{'why':'Clozapine enrollment is required.','options':[{'t':'Monitor clozapine','c':True}]}},
 {'id':'wrong','options':[{'t':'Clozapine requires enrollment.'}]},
 {'id':'unrelated','why':'Lithium requires monitoring.'},
 {'id':'retired','retired':True,'why':'Clozapine requires enrollment.'},
 {'id':'child','stem':'Child treatment','why':'Clozapine enrollment was historically required.'}]}
passages=[{'id':'p','old':'Clozapine requires enrollment.','new':'Clozapine no longer requires enrollment.'}]
r=scan_impacts(bank,passages,{})
assert r['status']=='complete',r
assert r['coverage']['scanned']==4 and r['coverage']['retired']==1
assert any(c['questionId']=='old' and c['fieldPath']=='/options/0/trap/note' and c['kind']=='possible-contradiction' for c in r['candidates'])
assert not any(c['questionId'] in ('wrong','unrelated','retired') for c in r['candidates'])
assert any(c['fieldPath']=='/tier2/why' for c in r['candidates'])
assert any(c['questionId']=='child' and c['kind']=='related-teaching' and 'Child' in c['context'] for c in r['candidates'])
assert scan_impacts({'items':[{'id':'bad','why':42}]},passages,{})['status']=='incomplete'
assert scan_impacts({'items':[]},passages,{})['status']=='incomplete'
assert scan_impacts({'items':[{'id':'x'},{'id':'x'}]},passages,{})['status']=='incomplete'
`],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
