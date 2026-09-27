import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
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

test('all linked resources are shipped and the renderer has no learner persistence', () => {
  const manifest = read('13_Faculty_Resources/_automation/site_build/site_manifest.json');
  for (const data of cases) for (const chapter of data.weeks) for (const link of chapter.links) {
    assert.ok(manifest[link.kind === 'tool' ? 'tools' : 'md'].some(row => row[1] === link.target), link.target);
  }
  const js = fs.readFileSync(new URL('../08_Cases_and_Simulation/case-journeys/case-journeys.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});
