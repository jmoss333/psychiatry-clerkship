import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('pending packet survives unchanged, repeated observations and failed retrieval',()=>{
const r=spawnSync('python3',['-c',`
import sys
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
from review_packets import merge_observation
base={'source_id':'s','source_url':'https://example.org','status':'first-observation','hash':'a','text':'old','passage_review':{'status':'first-observation','observations':{}}}
report={'mode':'fixture','generated_at':'t1','results':[base]}
a=merge_observation(None,report,{})
changed={**base,'status':'changed','hash':'b','text':'new'}
b=merge_observation(a,{**report,'results':[changed]}, {'s':{'status':'complete','coverage':{},'candidates':[]}})
assert len(b['packets'])==1
c=merge_observation(b,{**report,'results':[{**changed,'status':'unchanged'}]}, {})
assert c['packets']==b['packets']
assert merge_observation(b,{**report,'results':[changed]}, {})['packets']==b['packets']
d=merge_observation(c,{**report,'results':[{**base,'status':'unable-to-check'}]}, {})
assert d['latestValid']['s']['hash']=='b' and d['failures']
e=merge_observation(d,{**report,'results':[{**base,'status':'changed'}]}, {})
assert len(e['packets'])==2
try: merge_observation(e,{**report,'mode':'live'}, {})
except ValueError: pass
else: raise AssertionError('mixed live/synthetic evidence')
`],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
