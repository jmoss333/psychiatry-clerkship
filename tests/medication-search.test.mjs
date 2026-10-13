import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BUILD = new URL('13_Faculty_Resources/_automation/site_build/', ROOT);
const json = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const snippets = ['fd_data.js', 'fd_search.js', 'fd_today.js'].map((f) =>
  readFileSync(new URL(`frontdoor/${f}`, BUILD), 'utf8')).join('\n');
// eslint-disable-next-line no-new-func
const F = new Function('governanceBadge', `${snippets}\nreturn {fdBuildIndex,fdSearchResults};`)(() => '');

const curriculum = json('curriculum.json');
const audit = json('tests/fixtures/medication-search-audit.json');
const projections = JSON.parse(execFileSync('python3', ['-B', '-c', `
import json,sys
sys.path.insert(0,'13_Faculty_Resources/_automation/site_build')
from frontdoor_catalog import build_frontdoor_payload
from shipped_pages import load_shipped_pages
cur=json.load(open('curriculum.json')); shipped=load_shipped_pages('.')
out={}
for site,key in [('ms3','ms3'),('res','resident')]:
    nav=[{'section':'Resources','items':[{'f':p['slug'],'t':p['title'],
        'k':'tool' if p['kind']=='tool' else 'md',
        'governance':{'status':'pending','riskKind':'general','riskLevel':'low'}}
        for p in shipped['pages'] if site in p['sites']]}]
    out[site]=build_frontdoor_payload(key,cur,nav,'0'*40,shipped=shipped)
print(json.dumps(out))
`], { cwd: ROOT, encoding: 'utf8' }));
const meta = json('topic_meta.json'), tools = json('tool_registry.json');


// Removing medication vocabulary, treating it as a priority alias, or matching a
// similar-looking word must break these observable discovery/safety contracts.
const names = ['venlafaxine','Effexor','duloxetine','Cymbalta','bupropion','Wellbutrin',
  'mirtazapine','Remeron','trazodone','lithium','lamotrigine','Lamictal',
  'lurasidone','Latuda','cariprazine','Vraylar','lorazepam','Ativan','clonazepam','Klonopin',
  'hydroxyzine','Vistaril','buspirone','Buspar','naltrexone','acamprosate',
  'buprenorphine','Suboxone','methadone','esketamine','Spravato',
  'nortriptyline','phenelzine','melatonin','propranolol','benztropine','varenicline','naloxone'];
const cases = [
  ['Ativan catatonia','catatonia.md'], ['lorazepam catatonia','catatonia.md'],
  ['lithium monitoring','med_monitoring.md'], ['lithium level','med_monitoring.md'],
  ['Spravato','ect_neuromodulation.md'], ['TMS','ect_neuromodulation.md']
];
for (const site of ['ms3','res']) {
  const p=projections[site], index=F.fdBuildIndex(p.curriculum,meta,tools,p.manifest);
  const results=q=>F.fdSearchResults(index,q,p.curriculum.synonyms,{});
  const oldIndex=F.fdBuildIndex({...p.curriculum,medicationTerms:{}},meta,tools,p.manifest);
  test(`${site}: literal page and tool filenames do not broaden into extension matches`,()=>{
    for (const ref of ['psychopharm_primer.md','med_monitoring.md','mse.html']) {
      assert.deepEqual(results(ref).map(r=>r.item.ref),[ref],ref);
      assert.deepEqual(results(' '+ref.toUpperCase()+' ').map(r=>r.item.ref),[ref],ref);
    }
    // A filename still retains any established safety routing; it is not an early return.
    assert.deepEqual(results('withdrawal.html').map(r=>[r.item.ref,r.kind]),
      [['t_sud.md','protocol'],['withdrawal.html','item']]);
    for (const ref of ['unknown_reading.md','unknown-tool.html']) {
      assert.deepEqual(results(ref),[],ref);
    }
  });
  test(`${site}: the documented medication audit has no unexpected empty searches`,()=>{
    assert.equal(new Set(audit.queries).size,audit.queries.length);
    const empty=audit.queries.filter(query=>results(query).length===0);
    assert.deepEqual(empty,audit.deliberateMisspellings);
  });
  for(const name of names) test(`${site}: ${name} finds a medication reading`,()=>{
    for(const query of [name, name.toUpperCase()+'?']) {
      const rows=results(query), refs=rows.map(r=>r.item.ref);
      assert.ok(refs.slice(0,3).includes('psychopharm_primer.md')||
        (name.toLowerCase()==='spravato'&&refs.slice(0,3).includes('ect_neuromodulation.md')),
        `${query}: ${refs.join(', ')||'(no results)'}`);
      assert.equal(new Set(refs).size,refs.length);
      assert.ok(rows.length<=8);
    }
  });
  for(const [query,ref] of cases) test(`${site}: ${query} retains its specific reading`,()=>{
    const rows=results(query), refs=rows.map(r=>r.item.ref);
    assert.ok(refs.indexOf(ref)>=0&&refs.indexOf(ref)<3, `${query}: ${refs}`);
    if(query.includes('catatonia')||query.includes('monitoring'))
      assert.ok(!refs.includes('psychopharm_primer.md')||refs.indexOf(ref)<refs.indexOf('psychopharm_primer.md'),`${query}: ${refs}`);
  });
  // Leaving punctuation attached to context words must fail these destination checks.
  for (const [med, context, ref] of [
    ['Ativan', 'catatonia', 'catatonia.md'],
    ['lorazepam', 'catatonia', 'catatonia.md'],
    ['lithium', 'monitoring', 'med_monitoring.md'],
    ['lithium', 'level', 'med_monitoring.md'],
  ]) test(`${site}: punctuation around ${med} ${context} keeps the specific reading ahead of the primer`,()=>{
    for (const query of [
      `${med} ${context}?`, `${med} ${context}!`, `${med}: ${context}.`,
      `(${med}) [${context}]`, `${med} "${context}"`, `“${med} ${context}”`,
      `${med}/${context}`, `${med}-${context}`, `${med}—${context}`,
      `${med}, ${context};`,
    ]) {
      const rows=results(query), refs=rows.map(r=>r.item.ref);
      assert.ok(refs.indexOf(ref)>=0&&refs.indexOf(ref)<3, `${query}: ${refs}`);
      assert.ok(!refs.includes('psychopharm_primer.md')||refs.indexOf(ref)<refs.indexOf('psychopharm_primer.md'), `${query}: ${refs}`);
      assert.equal(new Set(refs).size,refs.length);
      assert.ok(refs.length<=8);
    }
  });
  test(`${site}: recovering punctuated context does not invent or demote safety evidence`,()=>{
    for (const [query, protocols] of [
      ['Ativan catatonia?', []],
      ['lithium monitoring?', []],
      ['Ativan withdrawing from alcohol?', ['t_sud.md']],
    ]) {
      const rows=results(query);
      assert.deepEqual(rows.filter(r=>r.kind==='protocol').map(r=>r.item.ref),protocols,query);
      if(protocols.length) assert.equal(rows[0].item.ref,protocols[0],query);
    }
  });
  test(`${site}: medication vocabulary preserves all existing protocol matches and their order`,()=>{
    const phrases=['i want to kill myself','withdrawing from alcohol','confused at night',
      'violent','suicidal','overdose','catatonia','fever and rigidity'];
    for(const med of names) for(const phrase of phrases) {
      const query=med+' '+phrase;
      const old=F.fdSearchResults(oldIndex,query,p.curriculum.synonyms,{});
      const now=results(query);
      assert.deepEqual(now.filter(r=>r.kind==='protocol').map(r=>r.item.ref),
        old.filter(r=>r.kind==='protocol').map(r=>r.item.ref),query);
      const primer=now.findIndex(r=>r.item.ref==='psychopharm_primer.md');
      for(const row of old.filter(r=>r.kind==='protocol')) {
        const rank=now.findIndex(r=>r.item.ref===row.item.ref);
        assert.ok(primer<0||rank<primer,query);
      }
    }
  });
  test(`${site}: names do not silently autocorrect or match inside unrelated words`,()=>{
    for(const query of ['hydralazine','clonidine','lamotrigene','sertralien','lithiumx','notwellbutrin']) {
      assert.deepEqual(results(query).map(r=>r.item.ref),
        F.fdSearchResults(oldIndex,query,p.curriculum.synonyms,{}).map(r=>r.item.ref),query);
    }
  });
  test(`${site}: projected medication vocabulary never returns another audience's page`,()=>{
    const allowed=new Set(p.manifest.md.concat(p.manifest.tools).map(entry=>entry[1]));
    for(const query of names) for(const row of results(query)) assert.ok(allowed.has(row.item.ref),row.item.ref);
  });
}
