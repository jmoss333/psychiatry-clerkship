import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Firecrawl pilot fails closed and preserves comparison evidence', () => {
  const result = spawnSync('python3', ['-c', `
import sys, tempfile, json, subprocess, os
from pathlib import Path
sys.path.insert(0, '13_Faculty_Resources/_automation/surveillance/bin')
import run_firecrawl_pilot as P
s = {'id':'test', 'name':'Test', 'url':'https://example.org/guidance'}
def response(text='Guidance. ' * 30, **meta):
 return {'success':True, 'data':{'markdown':text, 'metadata':{'statusCode':200, 'sourceURL':s['url'], **meta}}}
with tempfile.TemporaryDirectory() as d:
 path = Path(d)
 a = P.assess(s, response(), None)
 assert a['status']=='first-observation'
 b = P.assess(s, response(), a)
 assert b['status']=='unchanged'
 c = P.assess(s, response('Updated recommendation. '*30), a)
 assert c['status']=='changed' and c['diff']
 for bad in [None, {}, {'success':False}, response(''), response(statusCode=403), response(cachedAt='2026-01-01'), response(url='https://example.org/login'), response('Access denied. '*30)]:
  assert P.assess(s,bad,a)['status']=='unable-to-check', bad
 assert P.assess({**s,'url':'https://example.org/new'}, response(),a)['status']=='unable-to-check'
 restricted = P.assess({**s,'modality':'signal_only'},response(),None)
 assert 'text' not in restricted and 'diff' not in restricted
 restricted_change = P.assess({**s,'modality':'signal_only'},response('New text. '*30),restricted)
 assert restricted_change['status']=='changed' and 'diff' not in restricted_change
 assert P.assess(s,response(),{'source_url':s['url'],'status':'unable-to-check'})['status']=='first-observation'
 assert P.assess(s,response('Guidance content. '*200 + ' Protected by reCAPTCHA.'),None)['status']=='first-observation'
 assert P.exit_code([a,b])==0 and P.exit_code([c])==1
 assert P.exit_code([{**b,'passage_review':{'status':'changed'}}])==1
 assert P.exit_code([{**b,'passage_review':{'status':'unavailable'}}])==2
 assert P.exit_code([])==2 and P.exit_code([c,P.assess(s,None,None)])==2
 assert P.select_sources([s], ['missing']) is None
 assert P.select_sources([s], ['test','test']) is None
 brief=P.render_brief({'generated_at':'now','mode':'fixture','results':[{**c,'affects':[], 'mapping_status':'no recorded citations'}]})
 assert 'no recorded citations' in brief and 'clinical' in brief
 # Exercise the real CLI, including production default selection and persistent outputs.
 script='13_Faculty_Resources/_automation/surveillance/bin/run_firecrawl_pilot.py'
 targets=P.select_sources(P.L.load_registry()['sources'],P.DEFAULT_IDS)
 payload={item['id']:{'success':True,'data':{'markdown':'Synthetic guideline text. '*30,
          'metadata':{'statusCode':200,'sourceURL':item['url'],'creditsUsed':1}}} for item in targets}
 from simulate_firecrawl_passages import fixture_markdown
 payload['clozapine-rems']['data']['markdown']=fixture_markdown(P.P.load_config())
 inputs=path/'input.json'
 inputs.write_text(json.dumps(payload))
 def run(name, *extra):
  return subprocess.run([sys.executable,script,'--responses',str(inputs),'--fixture',
      '--out-dir',str(path/name),*extra],capture_output=True,text=True)
 assert run('first').returncode==0
 first=path/'first'/'report.json'
 original=first.read_bytes()
 assert len(json.loads(original)['results'])==5
 assert run('second','--previous',str(first)).returncode==0
 assert all(r['status']=='unchanged' for r in json.loads((path/'second'/'report.json').read_text())['results'])
 payload.pop(targets[0]['id'])
 inputs.write_text(json.dumps(payload))
 assert run('missing','--previous',str(first)).returncode==2
 assert first.read_bytes()==original
 assert run('first').returncode!=0 and first.read_bytes()==original
 assert run('invalid','--source','not-registered').returncode==2
 live=subprocess.run([sys.executable,script,'--responses',str(inputs),'--previous',str(first),
      '--out-dir',str(path/'live')],capture_output=True,text=True)
 assert live.returncode==2 and not (path/'live').exists()
 # Auth contract: secret is header-only and live requests disable cache.
 from unittest.mock import patch
 import io
 def open_request(req, timeout):
  assert 'secret' not in req.full_url and req.get_header('Authorization')=='Bearer secret'
  body=json.loads(req.data)
  assert body['maxAge']==0 and body['storeInCache'] is False
  return io.BytesIO(json.dumps(response()).encode())
 def build_opener(*handlers):
  assert len(handlers)==1 and isinstance(handlers[0],P.NoRedirect)
  class Opener:
   open=staticmethod(open_request)
  return Opener()
 req=P.urllib.request.Request('https://api.firecrawl.dev/v2/scrape',headers={'Authorization':'Bearer secret'})
 assert P.NoRedirect().redirect_request(req,None,302,'Found',{},'http://other.example/') is None
 with patch.object(P.urllib.request,'build_opener',side_effect=build_opener):
  assert P.fetch(s,'secret')['success']
 # Exact recorded question dependencies, including extra sources and retired items.
 pages=[{'slug':'lesson.md','source':'content/main.md','extraSources':['content/extra.md']},
        {'slug':'other.md','source':'content/other.md'}]
 items=[{'id':'q1','pages':['lesson.md','lesson.md'],'stem':'Question one'},
        {'id':'q2','pages':['other.md'],'stem':'Question two','evidence':s['url']},
        {'id':'q3','pages':['missing.md'],'stem':'Unknown reading'},
        {'id':'q4','pages':['lesson.md'],'stem':'Retired','retired':True},
        {'id':'q5','pages':['other.md'],'stem':'Different URL','evidence':s['url']+'-other'}]
 mapping=P.build_question_index({'items':items},pages)
 links=P.question_links(mapping,s,['content/extra.md'])
 assert [(r['id'],r['connection']) for r in links]==[('q1','via reading'),('q2','direct source URL')]
 assert links[0]['via']==[{'page':'lesson.md','source':'content/extra.md'}]
 assert mapping['coverage']['active_items']==4 and mapping['coverage']['retired_items']==1
 assert mapping['coverage']['unresolved']==[{'id':'q3','pages':['missing.md']}]
 assert P.question_links(mapping,{**s,'url':'https://different.example/'},[])==[]
 for bad in [{}, {'items':[]}, {'items':[items[0],items[0]]}, {'items':[{'id':'x','pages':'lesson.md'}]}]:
  try: P.build_question_index(bad,pages)
  except ValueError: pass
  else: raise AssertionError('invalid question mapping accepted')
 report={'generated_at':'now','mode':'fixture','question_coverage':mapping['coverage'],
         'results':[{**c,'affects':['content/extra.md'],'mapping_status':'recorded citations',
                     'questions':links,'question_mapping_status':'available'}]}
 brief=P.render_brief(report)
 assert 'q1' in brief and 'via reading' in brief and 'q3' in brief
 # Repeated fixtures through the real CLI also include question mapping.
 saved=json.loads(first.read_text())
 assert saved['question_coverage']['active_items']>0
 assert all('questions' in r for r in saved['results'])
 with patch.object(P,'load_questions',side_effect=ValueError('unavailable')):
  with patch.object(sys,'argv',[script,'--responses',str(inputs),'--fixture','--out-dir',str(path/'unavailable')]):
   assert P.main()==2
 unavailable=json.loads((path/'unavailable'/'report.json').read_text())
 assert unavailable['question_coverage'] is None
 assert len(unavailable['results'])==5
 assert all(r['question_mapping_status']=='unavailable' for r in unavailable['results'])
 print('failure, comparison, copyright, coverage and rendering contracts passed')
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
