import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('pending packet survives unchanged, repeated observations and failed retrieval',()=>{
const r=spawnSync('python3',['-c',`
import sys
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
from review_packets import merge_observation
base={'source_id':'s','source_url':'https://example.org','status':'first-observation','hash':'a','text':'old','passage_review':{'status':'first-observation','observations':{}}}
impact={'s':{'status':'complete','coverage':{},'candidates':[]}}
report={'mode':'fixture','generated_at':'t1','results':[base]}
a=merge_observation(None,report,{})
changed={**base,'status':'changed','hash':'b','text':'new'}
b=merge_observation(a,{**report,'results':[changed]}, impact)
assert len(b['packets'])==1
c=merge_observation(b,{**report,'results':[{**changed,'status':'unchanged'}]}, impact)
assert c['packets']==b['packets']
assert merge_observation(b,{**report,'results':[changed]}, impact)['packets']==b['packets']
d=merge_observation(c,{**report,'results':[{**base,'status':'unable-to-check'}]}, impact)
assert d['latestValid']['s']['hash']=='b' and d['failures']
e=merge_observation(d,{**report,'results':[{**base,'status':'changed'}]}, impact)
assert len(e['packets'])==2
f=merge_observation(e,{**report,'results':[changed]}, impact)
assert len(f['packets'])==3
assert f['packets'][0]['revision']!=f['packets'][2]['revision']
try: merge_observation(e,{**report,'mode':'live'}, impact)
except ValueError: pass
else: raise AssertionError('mixed live/synthetic evidence')
`],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
test('malformed packet state is rejected before it can overwrite persisted evidence',()=>{
 const r=spawnSync('python3',['-c',`
import sys
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
from review_packets import validate_state
try: validate_state({'version':1,'mode':'live','packets':'lost','latestValid':{},'failures':[]})
except ValueError: pass
else: raise AssertionError('Malformed packet state accepted')
`],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
test('a restored mapping creates a fresh complete packet retaining the failed packet targets',()=>{
 const r=spawnSync('python3',['-c',`
import sys
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
from review_packets import merge_observation
row={'source_id':'s','source_url':'https://example.org','status':'first-observation','hash':'a','text':'a','passage_review':{'status':'first-observation','observations':{}}}
report={'mode':'fixture','generated_at':'t','results':[row]}
a=merge_observation(None,report,{})
impact={'s':{'status':'complete','coverage':{},'candidates':[{'questionId':'q','fieldPath':'/why'}]}}
b=merge_observation(a,{**report,'results':[{**row,'status':'changed','hash':'b','passage_review':{'status':'unavailable','observations':{}}}]},impact)
assert b['packets'][0]['scanStatus']=='incomplete'
c=merge_observation(b,{**report,'results':[{**row,'status':'unchanged','hash':'b'}]}, {'s':{'status':'complete','coverage':{},'candidates':[]}})
assert len(c['packets'])==2
assert c['packets'][1]['supersedes']==[c['packets'][0]['revision']]
assert c['packets'][1]['candidates'][0]['questionId']=='q'
assert c['packets'][1]['scanStatus']=='complete'
`],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
