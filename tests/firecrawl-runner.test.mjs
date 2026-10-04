import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('scheduled runner records missing credential as incomplete without manufacturing baseline',()=>{
 const d=mkdtempSync(join(tmpdir(),'firecrawl-runner-'));try{
 const r=spawnSync('python3',['13_Faculty_Resources/_automation/surveillance/bin/run_firecrawl_review.py','--out-dir',join(d,'run'),'--state',join(d,'inbox.json')],{encoding:'utf8',env:{...process.env,FIRECRAWL_API_KEY:''}});
 assert.equal(r.status,2,r.stderr);const s=JSON.parse(readFileSync(join(d,'inbox.json'),'utf8'));assert.equal(s.failures.length,5);assert.deepEqual(s.latestValid,{});assert.equal(s.packets.length,0);
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('real scheduled CLI scans a synthetic source change and keeps its packet on the next quiet run',()=>{
 const r=spawnSync('python3',['-c',`
import json,sys,tempfile,subprocess
from pathlib import Path
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
import run_firecrawl_pilot as R,lib_surveillance as L,passage_review as P
from simulate_firecrawl_passages import fixture_markdown
with tempfile.TemporaryDirectory() as folder:
 root=Path(folder); inputs=root/'responses.json'; state=root/'inbox.json'
 sources={s['id']:s for s in L.load_registry()['sources']}
 responses={sid:{'success':True,'data':{'markdown':fixture_markdown(P.load_config()) if sid=='clozapine-rems' else ('SYNTHETIC unrelated source page for offline examination. '*10),'metadata':{'sourceURL':sources[sid]['url'],'url':sources[sid]['url'],'statusCode':200}}} for sid in R.DEFAULT_IDS}
 def run(name):
  inputs.write_text(json.dumps(responses))
  return subprocess.run([sys.executable,'13_Faculty_Resources/_automation/surveillance/bin/run_firecrawl_review.py','--responses',str(inputs),'--state',str(state),'--out-dir',str(root/name)],capture_output=True,text=True)
 first=run('first');assert first.returncode==0,first.stderr
 responses['clozapine-rems']['data']['markdown']=responses['clozapine-rems']['data']['markdown'].replace('no longer have to be enrolled','must be enrolled')
 changed=run('changed');assert changed.returncode==1,changed.stderr
 packet=json.loads(state.read_text())['packets'][0]
 assert any(c['fieldPath'].endswith('/trap/note') for c in packet['candidates'])
 assert packet['readings'] and packet['questionSnapshots']
 again=run('again');assert again.returncode==0,again.stderr
 assert len(json.loads(state.read_text())['packets'])==1
`],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});

test('complete source deltas include long and simultaneously unmapped changes',()=>{
const r=spawnSync('python3',['-c',`
import sys
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
from run_firecrawl_review import change_passages
old={'text':'Old filler. '*1000+'Lithium requires enrollment.'}
row={'source_id':'s','status':'changed','text':'New filler. '*1000+'Lithium no longer requires enrollment.','diff':'truncated display','passage_review':{'packets':[{'id':'mapped','old':'Old filler.','new':'New filler.'}]}}
p=change_passages(row,old)
assert len(p)==2
assert 'Lithium no longer requires enrollment.' in p[-1]['new']
assert p[-1]['sourceCoverage']=='complete-snapshot-delta'
`],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
});
