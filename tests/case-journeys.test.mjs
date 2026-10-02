import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require = createRequire(import.meta.url);
const api = require('../08_Cases_and_Simulation/case-journeys/case-journeys.js');
const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const names = ['eli-psychosis', 'leah-depression-trauma', 'marisol-delirium-capacity'];
const cases = [read('longitudinal_case.json'), ...names.map(name => read('08_Cases_and_Simulation/case-journeys/' + name + '.json'))];

test('review provenance retains the exact approved draft bytes', () => {
  const receipt = read('docs/case-journeys/release-review.json');
  for (const name of names) {
    const bytes = fs.readFileSync(new URL('../docs/case-journeys/reviewed-snapshot/' + name + '.json', import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sources[name + '.json']);
  }
});

test('all 24 chapters preserve the reviewed learner text and every model example', () => {
  for (const [index, data] of cases.entries()) {
    api.validate(data);
    if (index) {
      const reviewed = read('docs/case-journeys/reviewed-snapshot/' + names[index-1] + '.json');
      assert.deepEqual(data.weeks, reviewed.weeks.map(({facultyNotes, ...learner}) => learner));
      assert.equal(data.learnerRelease, true);
      assert.ok(!JSON.stringify(data).includes('facultyNotes'));
    }
    for (const chapter of data.weeks) {
      const html = api.chapterMarkup(data, chapter);
      for (const text of [chapter.patientState, chapter.learnerTask, chapter.handoff,
        ...chapter.checklist.flatMap(item => [item.prompt, item.example])]) {
        assert.equal(html.split(api.escape(text)).length - 1, 1, `${chapter.id}: exact text once`);
      }
      assert.equal((html.match(/<section /g) || []).length, 4);
    }
  }
});

test('malformed or unsafe content fails closed and text is escaped', () => {
  const unreleased = structuredClone(cases[1]);
  unreleased.learnerRelease = false;
  assert.throws(() => api.validate(unreleased), /not released/i);
  const bad = structuredClone(cases[1]);
  bad.weeks[1].id = bad.weeks[0].id;
  assert.throws(() => api.validate(bad), /duplicate/i);
  bad.weeks.pop();
  assert.throws(() => api.validate(bad), /six/i);
  const unsafe = structuredClone(cases[1]);
  unsafe.weeks[0].links[0].target = 'javascript:alert(1)';
  assert.throws(() => api.validate(unsafe), /link/i);
  assert.equal(api.escape('<script>"&'), '&lt;script&gt;&quot;&amp;');
});

test('allowlisted case links and old week links retain a bounded initial selection', () => {
  assert.deepEqual(api.selection('?case=leah&chapter=6'), {slug:'leah', chapter:6, invalid:false});
  assert.deepEqual(api.selection('?week=4'), {slug:'jordan', chapter:4, invalid:false});
  assert.deepEqual(api.selection('?case=unknown&chapter=900'), {slug:'jordan', chapter:1, invalid:true});
  assert.equal(api.moveChapter(1, 'ArrowLeft'), 6);
  assert.equal(api.moveChapter(6, 'ArrowRight'), 1);
  assert.equal(api.moveChapter(3, 'Home'), 1);
  assert.equal(api.moveChapter(3, 'End'), 6);
});

test('published renderer composes the approved patient-folio journey from real case data', () => {
  const selected = api.selection('?case=eli&chapter=1');
  const html = api.pageMarkup(cases, selected);
  const eli = cases[1];
  const chapter = eli.weeks[0];

  assert.match(html, /<header class="opf-hero"/);
  assert.match(html, /<nav[^>]+aria-label="Choose a case journey"/);
  assert.match(html, /<section class="[^"]*opf-case-context/);
  assert.match(html, /<section class="[^"]*opf-workbench/);
  assert.match(html, /<ol class="opf-route" role="tablist"/);
  assert.match(html, /<article class="opf-sheet"[^>]+role="tabpanel"/);
  assert.match(html, /class="opf-note opf-note--story"/);
  assert.match(html, /class="opf-note opf-note--task"/);
  assert.match(html, /class="opf-note opf-note--language"/);
  assert.match(html, /class="opf-note opf-note--rounds"/);
  assert.match(html, /<details class="opf-model"/);
  assert.ok(html.includes(api.escape(eli.title)));
  assert.match(html, /Chapters 5–6: optional follow-through/);

  for (const text of [
    eli.patient.description,
    chapter.patientState,
    chapter.learnerTask,
    chapter.handoff,
    chapter.reflectionPrompt,
    ...chapter.checklist.flatMap(item => [item.prompt, item.example]),
    ...chapter.links.map(link => link.label),
  ]) assert.equal(html.split(api.escape(text)).length - 1, 1, text);
});

test('all linked resources are shipped and the renderer has no learner persistence', () => {
  const manifest = read('13_Faculty_Resources/_automation/site_build/site_manifest.json');
  for (const data of cases) for (const chapter of data.weeks) for (const link of chapter.links) {
    assert.ok(manifest[link.kind === 'tool' ? 'tools' : 'md'].some(row => row[1] === link.target), link.target);
  }
  const js = fs.readFileSync(new URL('../08_Cases_and_Simulation/case-journeys/case-journeys.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test('curriculum review follows every shipped case asset and refuses missing data', () => {
  const result = JSON.parse(execFileSync('python3', ['-B', '-c', `
import sys,json,tempfile,shutil
from pathlib import Path
sys.path.insert(0,'13_Faculty_Resources/_automation')
from export_curriculum_review import Doc, render_case_journeys
with tempfile.TemporaryDirectory() as directory:
    build=Path(directory); (build/'tools').mkdir()
    shutil.copyfile('08_Cases_and_Simulation/one-patient-six-weeks.html',build/'tools/one-patient-six-weeks.html')
    shutil.copyfile('longitudinal_case.json',build/'longitudinal_case.json')
    for source in Path('08_Cases_and_Simulation/case-journeys').iterdir():
        shutil.copyfile(source,build/'tools'/source.name)
    doc=Doc('cases.md','Cases'); counts=render_case_journeys(doc,build)
    transcript=doc.text
    # A future declared case joins automatically, without an exporter filename list.
    extra=json.loads((build/'longitudinal_case.json').read_text());extra['id']='test_future_case'
    (build/'tools/future-case.json').write_text(json.dumps(extra))
    script=build/'tools/case-journeys.js'
    script.write_text(script.read_text()+"\\nfetch('future-case.json');\\n")
    future=render_case_journeys(Doc('future.md','Future'),build)
    (build/'tools/leah-depression-trauma.json').unlink()
    missing=False
    try: render_case_journeys(Doc('missing.md','Missing'),build)
    except FileNotFoundError: missing=True
    print(json.dumps({'counts':counts,'text':transcript,'future':future,'missing':missing}))
`], {cwd:new URL('../',import.meta.url),encoding:'utf8'}));
  assert.deepEqual(result.counts, {cases:4,chapters:24});
  assert.deepEqual(result.future, {cases:5,chapters:30});
  assert.equal(result.missing,true);
  for (const data of cases) for (const chapter of data.weeks) {
    for (const text of [chapter.patientState,chapter.learnerTask,chapter.handoff,chapter.reflectionPrompt,
      ...chapter.checklist.flatMap(item=>[item.prompt,item.example])]) {
      assert.equal(result.text.split(text).length-1,1,chapter.id);
    }
  }
});


test('Eli pilot exposes read/practice/discuss without changing later or other-case presentation', () => {
  for (const [caseIndex, data] of cases.entries()) for (const [i, chapter] of data.weeks.entries()) {
    const html = api.chapterMarkup(data, chapter);
    const pilot = caseIndex === 1 && i < 4;
    assert.equal(html.includes('Read · What changed'), pilot);
    assert.equal(html.includes('Practice · learner’s supervised task'), pilot);
    assert.equal(html.includes('Discuss · carry it to rounds'), pilot);
    assert.equal(html.includes('<details class="opf-model">'), pilot);
    assert.equal(html.includes('<details class="opf-reflection">'), !pilot);
    if (pilot) {
      assert.ok(html.includes(api.escape(chapter.reflectionPrompt)));
      assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, chapter.links.length);
      assert.doesNotMatch(html, /<details[^>]* open|<input|<textarea|facultyNotes/);
      for (const link of chapter.links) assert.ok(html.includes('../?' + link.kind + '=' + encodeURIComponent(link.target)));
    }
  }
});
