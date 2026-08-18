// Behavioural contract for the F2 fix (2026-08-04 tools review, verified defect):
// masteryByBlueprint()'s shrinkage-to-50 score ((correct+1.5)/(n+3)) caps a PERFECT
// one-observation category at 63% — below the <70 weak threshold — so a learner who
// aced the 12-item one-per-category pretest had ALL twelve categories flagged weak,
// and buildPlan() marked every week's focus list accordingly. The fix threads the raw
// miss count through the mastery rows and requires miss>0 before a low shrunk score
// reads as weakness (at n>=3 a perfect record clears 70 anyway, so the clause only
// rescues tiny-n perfection — it never hides a real miss).
//
// Method mirrors the repo's other renderHome-adjacent suites: extract the REAL
// function sources from spa_index.html (no hand-copied logic to drift) and execute
// them under stubbed localStorage / TOPIC_META / srsState.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const source = fs.readFileSync(path.join(repo, SPA), 'utf8');

function extract(re, label) {
  const m = source.match(re);
  assert.ok(m, `${label} not found in ${SPA}`);
  return m[0];
}

const shelfOrderSrc = extract(/var SHELF_ORDER=\[[^\]]*\];/, 'SHELF_ORDER literal');
const shelfLabelSrc = extract(/var SHELF_LABEL=\{[^}]*\};/, 'SHELF_LABEL literal');
const blueprintOfSrc = extract(/function blueprintOf\(file\)\{[\s\S]*?\n  \}/, 'blueprintOf()');
const masterySrc = extract(/function masteryByBlueprint\(\)\{[\s\S]*?\n  \}/, 'masteryByBlueprint()');
const planFromMasterySrc = extract(/function fdPlanFromMastery\(index,masteryRows,generatedAt,shelfDate\)\{[\s\S]*?\n  \}/, 'fdPlanFromMastery()');

const CATS = ['mood', 'psychosis', 'anxiety', 'substance', 'neurocog', 'pharm',
  'safety', 'personality', 'childdev', 'otherdx', 'ethics', 'relational'];
const INDEX = {
  path: { id: 'ms3-six-week', weekCount: 6 },
  weeks: [
    { n: 1, title: 'Foundations & the MSE', focusCategories: ['safety'] },
    { n: 2, title: 'Mood, Psychosis & Pharm',
      focusCategories: ['mood', 'psychosis', 'pharm', 'neurocog'] },
    { n: 3, title: 'Psychotherapy & Personality',
      focusCategories: ['personality', 'anxiety', 'relational'] },
    { n: 4, title: 'Family Systems & EE', focusCategories: ['relational'] },
    { n: 5, title: 'Acute & Emergency',
      focusCategories: ['safety', 'neurocog', 'substance'] },
    { n: 6, title: 'Integration & Exam', focusCategories: ['otherdx', 'ethics'] },
  ],
};

// Runs the real sources with a synthetic cw_qb_v1 and returns {mb, plan}.
function run(qbRecords) {
  const topicMeta = {};
  for (const c of CATS) topicMeta[`t_${c}.md`] = { shelfBlueprint: [c] };
  const harness = new Function('qbJson', 'TOPIC_META', 'INDEX', `
    var localStorage={getItem:function(k){return k==='cw_qb_v1'?qbJson:null;}};
    function srsState(){return null;}
    function LS(){return '';}
    ${shelfOrderSrc}
    ${shelfLabelSrc}
    ${blueprintOfSrc}
    ${masterySrc}
    ${planFromMasterySrc}
    var mb=masteryByBlueprint();
    return {mb:mb, plan:fdPlanFromMastery(INDEX,mb,'2026-08-18T12:00:00.000Z','')};
  `);
  return harness(JSON.stringify(qbRecords), topicMeta, INDEX);
}

function perfectPretest() {
  const qb = {};
  for (const c of CATS) qb[`pt_${c}`] = { correct: true, pages: [`t_${c}.md`], cat: c, source: 'pretest' };
  return qb;
}

test('a perfect one-item-per-category pretest flags ZERO categories weak', () => {
  const { mb, plan } = run(perfectPretest());
  for (const row of mb) {
    assert.equal(row.n, 1, `${row.c}: expected exactly one observation`);
    assert.equal(row.miss, 0, `${row.c}: perfect record must carry miss:0`);
    assert.equal(row.score, 63, `${row.c}: shrunk score of a perfect single observation is 63`);
  }
  // The F2 signature was: every week's focus list populated. Now: none.
  const focused = plan.weeks.flatMap((w) => w.focus);
  assert.deepEqual(focused, [],
    `perfect pretest must produce an empty focus plan, got: ${focused.join(', ')}`);
  // And the Progress "weakest areas" predicate (score<70 && miss>0) matches nothing.
  const weakCats = mb.filter((x) => x.score != null && x.score < 70 && x.miss > 0);
  assert.deepEqual(weakCats, []);
  assert.equal(plan.pathId, 'ms3-six-week');
  assert.equal(plan.weekCount, 6);
  assert.equal(plan.weeks[0].title, 'Week 1 — Foundations & the MSE');
  assert.deepEqual(plan.weeks[1].allCats, ['mood', 'psychosis', 'pharm', 'neurocog']);
});

test('a missed pretest item still flags exactly that category weak', () => {
  const qb = perfectPretest();
  qb.pt_mood.correct = false;
  const { mb, plan } = run(qb);
  const mood = mb.find((x) => x.c === 'mood');
  assert.equal(mood.miss, 1);
  assert.ok(mood.score < 70, `missed mood item must stay below the weak threshold, got ${mood.score}`);
  const focusedCats = new Set(plan.weeks.flatMap((w) => w.focus));
  assert.ok(focusedCats.has('mood'), 'mood must be focused after a miss');
  assert.ok(!focusedCats.has('psychosis'), 'an aced category must not be focused');
});

test('an unstarted category is still planned as focus (score null path unchanged)', () => {
  const qb = perfectPretest();
  delete qb.pt_safety; // never answered anything in safety
  const { mb, plan } = run(qb);
  const safety = mb.find((x) => x.c === 'safety');
  assert.equal(safety.score, null);
  const focusedCats = new Set(plan.weeks.flatMap((w) => w.focus));
  assert.ok(focusedCats.has('safety'), 'a category with no data keeps its focus slot in the plan');
});

test('volume converges to the score-based flag: 2/6 in a category reads weak', () => {
  const qb = perfectPretest();
  for (let i = 0; i < 5; i++) {
    qb[`extra_${i}`] = { correct: i < 1, pages: ['t_pharm.md'], cat: 'pharm' };
  }
  // pharm now: pretest 1 correct + 1 extra correct + 4 wrong = 2/6.
  const { mb } = run(qb);
  const pharm = mb.find((x) => x.c === 'pharm');
  assert.equal(pharm.n, 6);
  assert.equal(pharm.miss, 4);
  assert.ok(pharm.score < 70 && pharm.miss > 0, 'a genuinely weak category still flags');
});
