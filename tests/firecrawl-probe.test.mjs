import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('paired probe distinguishes changes, normalization, history and retrieval failures',()=>{
 const result=spawnSync('python3',['-c',`
import sys,copy,tempfile,json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
import run_firecrawl_probe as P
import run_firecrawl_pilot as R
source={'id':'s','url':'https://example.org','modality':'full_text'}
text='Synthetic source text with enough material for a complete examination. '*8
start='2026-10-04T10:00:00+00:00';end='2026-10-04T10:00:02+00:00'
def obs(status='new',markdown=text,previous=None):
 return {'startedAt':start,'completedAt':end,'response':{'success':True,'data':{'markdown':markdown,'metadata':{'statusCode':200,'sourceURL':source['url'],'url':source['url']},'changeTracking':{'changeStatus':status,'previousScrapeAt':previous}}}}
a=obs();b=obs('same',previous='2026-10-04T10:00:01Z')
assert P.compare_pair(source,a,b)['outcome']=='agreement'
changed=obs('changed',text+'Added synthetic sentence.', '2026-10-04T10:00:01Z')
assert P.compare_pair(source,a,changed)['outcome']=='agreement'
assert P.compare_pair(source,a,obs('same',text+'Added synthetic sentence.','2026-10-04T10:00:01Z'))['outcome']=='candidate-disagreement'
assert P.compare_pair(source,a,obs('changed',text.replace(' ','  '),'2026-10-04T10:00:01Z'))['outcome']=='normalization-difference'
for invalid in [obs(),obs('removed',previous='2026-10-04T10:00:01Z'),obs('same',previous='2026-09-01T00:00:00Z'),{'startedAt':start,'completedAt':end,'error':'Retrieval failed'},obs('error'),obs('future-status')]:
 assert P.compare_pair(source,a,invalid)['outcome']=='inconclusive'
missing=copy.deepcopy(b);del missing['response']['data']['changeTracking']
assert P.compare_pair(source,a,missing)['outcome']=='inconclusive'
missing=copy.deepcopy(b);missing['response']['data']['markdown']='Access denied'
assert P.compare_pair(source,a,missing)['outcome']=='inconclusive'
assert P.compare_pair(source,obs('same'),b)['outcome']=='inconclusive'
assert P.compare_pair(source,a,obs('removed',previous='2026-10-04T10:00:01Z'))['providerStatus']=='removed'
# Default fetch remains unchanged; only explicit probe requests get a tracking tag.
class Reply:
 def __enter__(self): return self
 def __exit__(self,*args): pass
 def read(self): return b'{"success":true}'
class Opener:
 def open(self,req,timeout):
  payload=json.loads(req.data); payloads.append(payload); return Reply()
payloads=[]
with patch.object(R.urllib.request,'build_opener',return_value=Opener()):
 R.fetch(source,'synthetic-token');R.fetch(source,'synthetic-token',tracking_tag='synthetic-probe')
assert payloads[0]['formats']==['markdown']
assert payloads[1]['formats'][1]=={'type':'changeTracking','modes':['git-diff'],'tag':'synthetic-probe'}
# Real orchestration is bounded, keeps failures visible, and writes only the new output directory.
sources=[{'id':sid,'url':'https://example.org','modality':'full_text'} for sid in R.DEFAULT_IDS]
calls=[]
def fetch(s,token,tracking_tag=None):
 calls.append((s['id'],tracking_tag))
 if s['id']==R.DEFAULT_IDS[0]: raise OSError('synthetic-token must never be logged')
 return obs()['response']
with tempfile.TemporaryDirectory() as d,patch.object(P.R,'fetch',side_effect=fetch):
 report=P.run_probe(sources,Path(d)/'probe','synthetic-token')
 assert len(calls)==10
 restricted=copy.deepcopy(sources);restricted[0]['modality']='signal_only'
 try: P.run_probe(restricted,Path(d)/'restricted','synthetic-token');assert False
 except ValueError: pass
 assert len(calls)==10
 assert report['requested']==list(R.DEFAULT_IDS)
 assert len(report['results'])==5 and report['summary']['inconclusive']==5
 assert 'synthetic-token' not in (Path(d)/'probe'/'report.json').read_text()
 assert len({tag for _,tag in calls})==5
 assert len(list(Path(d).iterdir()))==1
 try: P.run_probe(sources,Path(d)/'probe','synthetic-token');assert False
 except FileExistsError: pass
 assert len(calls)==10
 assert P.run_probe(sources,Path(d)/'no-key','')['apiRequests']==0
 assert len(calls)==10

# A stopped run retains an explicitly partial receipt, not a green partial set.
count=0
def interrupted(s,token,tracking_tag=None):
 global count
 count+=1
 if count==3: raise KeyboardInterrupt()
 return obs()['response']
with tempfile.TemporaryDirectory() as d,patch.object(P.R,'fetch',side_effect=interrupted):
 try: P.run_probe(sources,Path(d)/'partial','synthetic-token')
 except KeyboardInterrupt: pass
 partial=json.loads((Path(d)/'partial'/'report.json').read_text())
 assert partial['status']=='incomplete' and not partial['requestCountComplete']
 assert len(partial['requested'])==5 and len(partial['examined'])==1

with tempfile.TemporaryDirectory() as d,patch.object(P.R,'fetch',side_effect=KeyboardInterrupt):
 try: P.run_probe(sources,Path(d)/'early','synthetic-token')
 except KeyboardInterrupt: pass
 early=json.loads((Path(d)/'early'/'report.json').read_text())
 assert early['status']=='incomplete' and early['requested']==list(R.DEFAULT_IDS)
 assert early['examined']==[] and not early['requestCountComplete']
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
