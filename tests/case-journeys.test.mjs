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
      const pharmacy = read('pharmacy.json');
      const attested = new Set(pharmacy.records.filter(r => (r.facultyReview || {}).status === 'reviewed').map(r => r.id));
      assert.deepEqual(
        data.weeks.map(({residentExtension, commonMisstep, sourceIds, ...learner}) => learner),
        reviewed.weeks.map(({facultyNotes, ...learner}) => ({...learner,
          links: learner.links.filter(l => !l.anchor || attested.has(l.anchor))})));
      for (const [i, chapter] of data.weeks.entries()) {
        const notes = reviewed.weeks[i].facultyNotes;
        assert.equal(chapter.residentExtension, notes.advancedPrompt, chapter.id);
        assert.equal(chapter.commonMisstep, notes.pitfall, chapter.id);
        assert.deepEqual(chapter.sourceIds, notes.sourceIds, chapter.id);
      }
      assert.equal(data.learnerRelease, true);
      assert.ok(!JSON.stringify(data).includes('facultyNotes'));
      assert.ok(!JSON.stringify(data).includes('teachingPoint'));
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
      ...(chapter.residentExtension ? [chapter.residentExtension, chapter.commonMisstep] : []),
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
      const outbound = chapter.links.length + (data.sources || []).filter(s => (chapter.sourceIds || []).includes(s.id)).length;
      assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, outbound, chapter.id + ': every outbound link is noopener');
      assert.doesNotMatch(html, /<details[^>]* open|<input|<textarea|facultyNotes/);
      for (const link of chapter.links) assert.ok(html.includes('../?' + link.kind + '=' + encodeURIComponent(link.target)));
    }
  }
});

// ---------------------------------------------------------------------------
// r2 acceptance criteria (docs/case-journeys/README.md, project doc 17 §3)
// ---------------------------------------------------------------------------
const journeys = cases.slice(1);
const snapshotOf = name => read('docs/case-journeys/reviewed-snapshot/' + name + '.json');
const sourceMap = read('docs/case-journeys/sources.json');
const flesch = text => {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const words = text.match(/[A-Za-z'’-]+/g) || [];
  const syllables = words.reduce((n, w) => {
    const v = (w.toLowerCase().replace(/[^a-z]/g, '').match(/[aeiouy]+/g) || []).length;
    return n + Math.max(1, v - (/e$/.test(w.toLowerCase()) && v > 1 ? 1 : 0));
  }, 0);
  return 0.39 * words.length / sentences + 11.8 * syllables / Math.max(1, words.length) - 15.59;
};

test('AC0: shipped learner files are exactly the projection of the reviewed snapshot', () => {
  const out = execFileSync('python3', ['13_Faculty_Resources/_automation/case_journeys/project_case_journeys.py', '--check'],
    {cwd:new URL('../',import.meta.url), encoding:'utf8'});
  assert.match(out, /projection check: OK/);
});

test('AC1: every chapter cites at least one source and every id resolves to the shipped source list', () => {
  const known = new Set(sourceMap.sources.map(s => s.id));
  for (const data of journeys) {
    assert.ok(Array.isArray(data.sources) && data.sources.length, data.id);
    const shipped = new Set(data.sources.map(s => s.id));
    for (const s of data.sources) assert.ok(known.has(s.id) && /^https:\/\//.test(s.url), s.id);
    for (const chapter of data.weeks) {
      assert.ok(chapter.sourceIds.length >= 1, chapter.id);
      for (const id of chapter.sourceIds) assert.ok(shipped.has(id), `${chapter.id}: ${id}`);
    }
  }
});

test('AC2: the audience label claims resident coverage only when every chapter ships a resident extension and a common misstep', () => {
  for (const data of journeys) {
    const claims = /resident/i.test(data.audience);
    const ships = data.weeks.every(w => typeof w.residentExtension === 'string' && w.residentExtension.trim() &&
      typeof w.commonMisstep === 'string' && w.commonMisstep.trim());
    assert.equal(claims, ships, data.id);
    for (const chapter of data.weeks) {
      const html = api.chapterMarkup(data, chapter);
      assert.equal(html.split(api.escape(chapter.residentExtension)).length - 1, 1, chapter.id + ': resident extension once');
      assert.equal(html.split(api.escape(chapter.commonMisstep)).length - 1, 1, chapter.id + ': common misstep once');
      assert.match(html, /<details class="opf-misstep"/);
      assert.match(html, /<details class="opf-resident"/);
      assert.match(html, /aria-label="Sources for this chapter"/);
    }
  }
});

test('AC5: no shipped id or snapshot id carries a draft marker', () => {
  for (const data of journeys) assert.doesNotMatch(data.id, /draft/i);
  for (const name of names) assert.doesNotMatch(snapshotOf(name).id, /draft/i);
});

test('AC6: Leah asks about firearms where access and means safety are assessed', () => {
  const leah = journeys[1];
  const chapter = id => leah.weeks.find(w => w.id === id);
  assert.match(chapter('leah-01-safety').learnerTask, /firearm/i);
  assert.match(chapter('leah-05-transition').learnerTask, /firearm/i);
  assert.match(chapter('leah-05-transition').patientState, /firearm/i);
  assert.match(chapter('leah-05-transition').patientState, /antidepressant started/i);
});

test('AC6b: Leah-02 names thiamine and CIWA-Ar as recognition points, never a dose', () => {
  const chapter = journeys[1].weeks.find(w => w.id === 'leah-02-withdrawal');
  assert.match(chapter.handoff, /thiamine/i);
  assert.match(chapter.learnerTask, /CIWA-Ar/);
  for (const data of journeys) assert.doesNotMatch(JSON.stringify(data), /\b\d+(\.\d+)?\s?(mg|mcg|µg|g|mL|units?)\b/);
});

test('AC6c: Eli names risperidone without a dose and links its drug card from the akathisia and weight chapters', () => {
  const eli = journeys[0];
  const chapter = id => eli.weeks.find(w => w.id === id);
  assert.match(chapter('eli-03-restlessness').patientState, /risperidone/);
  assert.match(chapter('eli-05-early-change').patientState, /risperidone/);
  const pharmacy = read('pharmacy.json');
  const attested = (pharmacy.records.find(r => r.id === 'risperidone') || {}).facultyReview?.status === 'reviewed';
  const snapshot = snapshotOf('eli-psychosis');
  for (const id of ['eli-03-restlessness', 'eli-05-early-change']) {
    const approved = snapshot.weeks.find(w => w.id === id).links.find(l => l.anchor === 'risperidone');
    assert.ok(approved && approved.kind === 'tool' && approved.target === 'pharmacy.html', id + ': approved snapshot link');
    const shipped = chapter(id).links.find(l => l.anchor === 'risperidone');
    assert.equal(Boolean(shipped), attested, id + ': the drug-card link ships iff the risperidone card is attested (re-run project_case_journeys.py --write after attesting)');
    assert.equal(/pharmacy\.html#risperidone/.test(api.chapterMarkup(eli, chapter(id))), attested, id);
  }
});

test('AC7: spoken model lines use American spoken register', () => {
  for (const data of journeys) for (const chapter of data.weeks) for (const item of chapter.checklist) {
    assert.doesNotMatch(item.example, /\bLet us\b|\bin hospital\b|\bwhom\b/, chapter.id);
  }
});

test('AC8: learner-task readability regression guard (FK grade; tighten to 12.5 when C9 lands)', () => {
  for (const data of journeys) for (const chapter of data.weeks) {
    assert.ok(flesch(chapter.learnerTask) <= 17, `${chapter.id}: FK ${flesch(chapter.learnerTask).toFixed(1)}`);
  }
});

test('AC9: every learning objective is covered by a chapter and every chapter maps to an objective', () => {
  for (const data of journeys) {
    const covered = new Set();
    for (const chapter of data.weeks) {
      assert.ok(Array.isArray(chapter.objectiveIds) && chapter.objectiveIds.length, chapter.id);
      for (const n of chapter.objectiveIds) {
        assert.ok(Number.isInteger(n) && n >= 1 && n <= data.learningObjectives.length, `${chapter.id}: objective ${n}`);
        covered.add(n);
      }
    }
    assert.equal(covered.size, data.learningObjectives.length, data.id + ': objectives covered');
  }
});

// The human gate is strict on GitHub Actions (so the PR check stays red and merge is blocked until
// Josh attests) and on demand locally (CASE_JOURNEYS_RELEASE_GATE=1). Elsewhere it is skipped with
// the pending items named, so the pre-push hook (bin/verify.sh) does not block pushing the review PR.
const gateStrict = Boolean(process.env.GITHUB_ACTIONS || process.env.CASE_JOURNEYS_RELEASE_GATE);
const pendingReceipt = read('docs/case-journeys/release-review.json');
const gateMode = gateStrict || !/PENDING/.test(String(pendingReceipt.authorization)) ? {} :
  {skip: 'release-review.json authorization is PENDING — strict on GitHub Actions or with CASE_JOURNEYS_RELEASE_GATE=1'};
test('AC3/AC4/AC10 (merge-day human gate): release authorization, source review, and anchored drug cards are attested', gateMode, () => {
  const receipt = read('docs/case-journeys/release-review.json');
  assert.equal(receipt.revision, 'r2');
  assert.ok(typeof receipt.authorization === 'string' && !/PENDING/.test(receipt.authorization), 'release-review.json authorization is still PENDING');
  assert.match(String(receipt.reviewDate), /^\d{4}-\d{2}-\d{2}$/, 'release-review.json reviewDate not set');
  assert.equal(sourceMap.status, 'faculty-reviewed', 'sources.json still ' + sourceMap.status);
  for (const s of sourceMap.sources) if (s.scopeLimit) assert.ok(s.resolution, s.id + ': scopeLimit without resolution');
  const pharmacy = read('pharmacy.json');
  for (const data of journeys) for (const chapter of data.weeks) for (const link of chapter.links) if (link.anchor) {
    const card = pharmacy.records.find(r => r.id === link.anchor);
    assert.ok(card, chapter.id + ': no pharmacy card ' + link.anchor);
    assert.equal(card.facultyReview && card.facultyReview.status, 'reviewed', chapter.id + ': shipped link to unattested card ' + link.anchor + ' — the projection should have held it back');
  }
});

// ---------------------------------------------------------------------------
// Objective × practice-task coverage gate (docs/case-journeys/practice-coverage.json)
// ---------------------------------------------------------------------------
test('AC11: every learning objective reaches every connected-practice task, or the gap is an accepted gap with a reason', () => {
  const coverage = read('docs/case-journeys/practice-coverage.json');
  const html = fs.readFileSync(new URL('../08_Cases_and_Simulation/one-patient-six-weeks.html', import.meta.url), 'utf8');
  const pack = JSON.parse(html.match(/<script[^>]*id="case-practice-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(coverage.tasks, Object.keys(pack.tasks), 'coverage tasks must be exactly the shipped practice tasks');
  const byCase = name => journeys.find(d => /eli|leah|marisol/.exec(d.id)[0] === name.split('-')[0]);
  const matrix = {};
  for (const data of journeys) {
    const slug = names.find(n => n.startsWith(/eli|leah|marisol/.exec(data.id)[0]));
    const reach = Object.fromEntries(data.learningObjectives.map((_, i) => [i + 1, new Set()]));
    const anchored = new Set();
    for (const chapter of data.weeks) {
      const tasks = coverage.chapters[chapter.id];
      assert.ok(Array.isArray(tasks) && tasks.length, chapter.id + ': no practice tasks declared');
      for (const t of tasks) { assert.ok(coverage.tasks.includes(t), chapter.id + ': unknown task ' + t); anchored.add(t); }
      for (const o of chapter.objectiveIds) tasks.forEach(t => reach[o].add(t));
    }
    for (const t of coverage.tasks) assert.ok(anchored.has(t), slug + ': task ' + t + ' is anchored on no chapter');
    const accepted = new Set(coverage.acceptedGaps.filter(g => g.case === slug).map(g => g.objective + ':' + g.task));
    for (const g of coverage.acceptedGaps.filter(g => g.case === slug)) {
      assert.ok(typeof g.reason === 'string' && g.reason.length > 20, slug + ': accepted gap without a reason');
      assert.ok(!reach[g.objective].has(g.task), slug + `: accepted gap ${g.objective}:${g.task} is no longer a gap — remove it`);
    }
    for (const o of Object.keys(reach)) for (const t of coverage.tasks) {
      assert.ok(reach[o].has(t) || accepted.has(o + ':' + t), slug + `: objective ${o} never reaches task ${t}`);
    }
    matrix[slug] = Object.fromEntries(Object.entries(reach).map(([o, s]) => [o, [...s].sort()]));
  }
  assert.equal(Object.keys(coverage.chapters).length, journeys.reduce((n, d) => n + d.weeks.length, 0), 'coverage must map exactly the shipped chapters');
  assert.equal(Object.keys(matrix).length, 3);
});

test('AC11b: the faculty review export prints the objective × task matrix and the accepted gaps', () => {
  const text = execFileSync('python3', ['-B', '-c', `
import sys,tempfile,shutil
from pathlib import Path
sys.path.insert(0,'13_Faculty_Resources/_automation')
from export_curriculum_review import Doc, render_case_journeys
with tempfile.TemporaryDirectory() as directory:
    build=Path(directory); (build/'tools').mkdir()
    shutil.copyfile('08_Cases_and_Simulation/one-patient-six-weeks.html',build/'tools/one-patient-six-weeks.html')
    shutil.copyfile('longitudinal_case.json',build/'longitudinal_case.json')
    for source in Path('08_Cases_and_Simulation/case-journeys').iterdir(): shutil.copyfile(source,build/'tools'/source.name)
    doc=Doc('cases.md','Cases'); render_case_journeys(doc,build); print(doc.text)
`], {cwd:new URL('../',import.meta.url),encoding:'utf8'});
  const coverage = read('docs/case-journeys/practice-coverage.json');
  assert.match(text, /Objective × practice-task coverage/);
  assert.ok(text.includes('`' + coverage.status + '`'), 'mapping status printed verbatim');
  for (const g of coverage.acceptedGaps) assert.ok(text.includes(g.reason), 'accepted gap reason printed: ' + g.reason.slice(0, 40));
  for (const data of journeys) for (const [i] of data.learningObjectives.entries()) assert.match(text, new RegExp(`\\| ${i + 1} \\| `));
});
