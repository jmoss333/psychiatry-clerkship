import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('passage review localizes changes and refuses stale or incomplete mappings', () => {
  const result = spawnSync('python3', ['-c', `
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0,'13_Faculty_Resources/_automation/surveillance/bin')
import passage_review as P
import run_firecrawl_pilot as R
source={'id':'source','url':'https://example.org/source'}
question={'id':'q1','pages':['lesson.md'],'stem':'A question','evidence':'Exact dependency.'}
index=R.build_question_index({'items':[question,{'id':'unrelated','pages':['other.md']}]},
 [{'slug':'lesson.md','source':'reading.md'},{'slug':'other.md','source':'other.md'}])
config={'version':1,'links':[{'id':'passage','source_id':'source','source_url':source['url'],
 'status':'proposed','heading':'Guidance','paragraph':0,'source_quote':'Original source passage.',
 'questions':[{'id':'q1','field':'/evidence','quote':'Exact dependency.','reason':'Candidate dependency'}],
 'readings':[{'page':'lesson.md','source':'reading.md','quote':'Exact reading phrase.'}]}]}
raw='## Guidance\\n\\nOriginal source passage.\\n\\n## Elsewhere\\n\\nUnrelated source text.'
row={'status':'first-observation','source_url':source['url'],'extractor':R.EXTRACTOR,'hash':'one'}
with tempfile.TemporaryDirectory() as folder:
 root=Path(folder); (root/'reading.md').write_text('Exact reading phrase.')
 def evaluate(text=raw, previous=None, mapping=config, bank=index, current=row):
  return P.evaluate(source,current,text,previous,mapping,bank,root)
 first=evaluate()
 assert first['status']=='first-observation' and not first['packets']
 previous={**row,'passage_review':first}
 changed=evaluate(raw.replace('Original source passage.','SIMULATED CHANGE; not clinical guidance.'),previous,
                  current={**row,'status':'changed'})
 assert changed['status']=='changed'
 assert [q['id'] for p in changed['packets'] for q in p['questions']]==['q1']
 assert changed['packets'][0]['old']=='Original source passage.'
 assert 'SIMULATED' in changed['packets'][0]['new']
 assert changed['packets'][0]['readings'][0]['source']=='reading.md'
 assert evaluate(previous=previous)['status']=='unchanged'
 outside=evaluate(raw+'\\n\\nChanged footer',previous,current={**row,'status':'changed'})
 assert outside['status']=='outside-mapped-passages' and outside['packets']==[]
 assert evaluate('## Wrong heading\\n\\nMissing passage.',previous)['status']=='unavailable'
 assert evaluate(raw+'\\n\\n## Guidance\\n\\nDuplicate heading',previous)['status']=='unavailable'
 assert evaluate(current={**row,'status':'unable-to-check'})['status']=='unavailable'
 assert evaluate(current={**row,'modality':'signal_only'})['status']=='unavailable'
 bad=json.loads(json.dumps(config)); bad['links'][0]['questions'][0]['quote']='Stale question text'
 assert evaluate(mapping=bad)['status']=='unavailable'
 (root/'reading.md').write_text('Reading changed')
 assert evaluate(previous=previous)['status']=='unavailable'
 (root/'reading.md').write_text('Exact reading phrase.')
 altered=json.loads(json.dumps(config)); altered['links'][0]['questions'][0]['reason']='Changed mapping'
 assert evaluate(previous=previous,mapping=altered)['status']=='unavailable'
 bad_prior={**previous,'source_url':'https://example.org/another'}
 assert evaluate(previous=bad_prior)['status']=='unavailable'
 assert P.evaluate({'id':'other','url':'https://example.org/other'},row,raw,None,config,index,root)['status']=='not-configured'
 assert evaluate(mapping={'version':1,'links':[]})['status']=='unavailable'
 moved=json.loads(json.dumps(config)); moved['links'][0]['source_id']='typo'
 assert evaluate(previous=previous,mapping=moved)['status']=='unavailable'
 with_extra=json.loads(json.dumps(config)); extra=json.loads(json.dumps(config['links'][0])); extra['id']='second'; with_extra['links'].append(extra)
 two=evaluate(mapping=with_extra)
 assert two['status']=='first-observation'
 assert evaluate(previous={**row,'passage_review':two})['status']=='unavailable'
 assert evaluate(mapping={'version':1,'links':[config['links'][0],config['links'][0]]})['status']=='unavailable'
 assert 'Proposed passage review' in P.render(changed)
 print('passage change, isolation, drift, ambiguity, coverage, and rendering checks passed')
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('the real CLI passes all five synthetic passage-routing scenarios', () => {
  const folder = mkdtempSync(join(tmpdir(), 'firecrawl-passage-test-'));
  try {
    const output = join(folder, 'run');
    const result = spawnSync('python3', [
      '13_Faculty_Resources/_automation/surveillance/bin/simulate_firecrawl_passages.py',
      '--out-dir', output,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(readFileSync(join(output, 'anc-change/report.json'), 'utf8'));
    assert.equal(report.mode, 'fixture');
    const packet = report.results[0].passage_review.packets[0];
    assert.deepEqual(packet.questions.map(q => q.id), ['qb_pha_002', 'qb_pha_011', 'qb_psy_007']);
    assert.ok(!packet.questions.some(q => q.id === 'qb_psy_012'));
    assert.match(readFileSync(join(output, 'SUMMARY.md'), 'utf8'), /All five scenarios passed/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
