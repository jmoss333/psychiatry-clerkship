// Behavioural contract for the F2 fix (2026-08-04 tools review, verified defect):
// masteryByBlueprint()'s shrinkage-to-50 score ((correct+1.5)/(n+3)) caps a PERFECT
// one-observation category at 63% — below the <70 weak threshold — so a learner who
// aced the 12-item one-per-category pretest had ALL twelve categories flagged weak.
// The fix threads the raw miss count through the mastery rows and requires miss>0 before a
// low shrunk score reads as weakness (at n>=3 a perfect record clears 70 anyway, so the
// clause only rescues tiny-n perfection — it never hides a real miss).
//
// REPOINTED (Plan 3 Task 8, bucket (a)+(b)). The original suite proved the fix through
// buildPlan(), whose per-week `focus` lists were the F2 signature; Task 3 deleted buildPlan()
// with the sidebar-era shell and Task 5 did not resurrect it (the curriculum index is now the
// single source of week structure — re-deriving a parallel one is what spec §2.2 forbids). The
// miss>0 predicate did not disappear with it: it moved to fdProgressWeak(), the Progress page's
// "Practice your weakest areas" renderer, which is now the ONLY consumer of that clause and the
// only surface a learner sees it through. So the harness swaps buildPlan for fdProgressWeak and
// asserts on rendered rows rather than on a plan object.
//
// masteryByBlueprint/blueprintOf/SHELF_ORDER/SHELF_LABEL never moved — they read four learner
// stores directly, which is why fdProgress is deliberately not a frontdoor/ module — so they are
// still extracted from spa_index.html. fdEsc comes from the real fd_data.js rather than a stub,
// so the escaping in the rendered row is the shipped escaping.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const FD_DATA = '13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js';
const source = fs.readFileSync(path.join(repo, SPA), 'utf8');
const fdDataSrc = fs.readFileSync(path.join(repo, FD_DATA), 'utf8');

function extract(re, label) {
  const m = source.match(re);
  assert.ok(m, `${label} not found in ${SPA}`);
  return m[0];
}

const shelfOrderSrc = extract(/var SHELF_ORDER=\[[^\]]*\];/, 'SHELF_ORDER literal');
const shelfLabelSrc = extract(/var SHELF_LABEL=\{[^}]*\};/, 'SHELF_LABEL literal');
const blueprintOfSrc = extract(/function blueprintOf\(file\)\{[\s\S]*?\n  \}/, 'blueprintOf()');
const masterySrc = extract(/function masteryByBlueprint\(\)\{[\s\S]*?\n  \}/, 'masteryByBlueprint()');
const weakSrc = extract(/function fdProgressWeak\(rows\)\{[\s\S]*?\n  \}/, 'fdProgressWeak()');

const CATS = ['mood', 'psychosis', 'anxiety', 'substance', 'neurocog', 'pharm',
  'safety', 'personality', 'childdev', 'otherdx', 'ethics', 'relational'];

// Runs the real sources with a synthetic cw_qb_v1 and returns {mb, weakHtml, weakCats}.
function run(qbRecords) {
  const topicMeta = {};
  for (const c of CATS) topicMeta[`t_${c}.md`] = { shelfBlueprint: [c] };
  const harness = new Function('qbJson', 'TOPIC_META', `
    var localStorage={getItem:function(k){return k==='cw_qb_v1'?qbJson:null;}};
    function srsState(){return null;}
    function LS(){return '';}
    ${fdDataSrc}
    ${shelfOrderSrc}
    ${shelfLabelSrc}
    ${blueprintOfSrc}
    ${masterySrc}
    ${weakSrc}
    var mb=masteryByBlueprint();
    return {mb:mb, weakHtml:fdProgressWeak(mb)};
  `);
  const out = harness(JSON.stringify(qbRecords), topicMeta);
  // The rendered rows carry their category in data-fd-practice — the same attribute the click
  // handler routes on — so reading it back is reading what the learner can actually act on.
  out.weakCats = [...out.weakHtml.matchAll(/data-fd-practice="([^"]*)"/g)].map((m) => m[1]);
  return out;
}

function perfectPretest() {
  const qb = {};
  for (const c of CATS) qb[`pt_${c}`] = { correct: true, pages: [`t_${c}.md`], cat: c, source: 'pretest' };
  return qb;
}

test('a perfect one-item-per-category pretest flags ZERO categories weak', () => {
  const { mb, weakHtml, weakCats } = run(perfectPretest());
  for (const row of mb) {
    assert.equal(row.n, 1, `${row.c}: expected exactly one observation`);
    assert.equal(row.miss, 0, `${row.c}: perfect record must carry miss:0`);
    assert.equal(row.score, 63, `${row.c}: shrunk score of a perfect single observation is 63`);
  }
  // The F2 signature was: every category flagged. Now: none, so the section does not render at all.
  assert.deepEqual(weakCats, [],
    `perfect pretest must surface no weak areas, got: ${weakCats.join(', ')}`);
  assert.equal(weakHtml, '',
    'with nothing weak the whole "Practice your weakest areas" section is omitted, heading included');
  // And the raw predicate the renderer applies (score<70 && miss>0) matches nothing either.
  assert.deepEqual(mb.filter((x) => x.score != null && x.score < 70 && x.miss > 0), []);
});

test('a missed pretest item still flags exactly that category weak', () => {
  const qb = perfectPretest();
  qb.pt_mood.correct = false;
  const { mb, weakCats } = run(qb);
  const mood = mb.find((x) => x.c === 'mood');
  assert.equal(mood.miss, 1);
  assert.ok(mood.score < 70, `missed mood item must stay below the weak threshold, got ${mood.score}`);
  assert.deepEqual(weakCats, ['mood'],
    'exactly the missed category is offered for practice — an aced one must not be');
});

// REPOINTED, and the expectation is INVERTED on purpose. buildPlan() gave a never-answered
// category a focus slot (score===null passed its filter); fdProgressWeak() does not — its filter
// is `score!=null && score<70 && miss>0`. That is not a regression sneaking through: "practise
// your weakest areas" is a claim about measured weakness, and a category with no observations has
// none. The learner still sees it — fdProgressBars renders it as a "not started" bar in the row
// above, which is what an unanswered category actually is.
test('an unstarted category is NOT offered as a weak area (it has no measurement to be weak on)', () => {
  const qb = perfectPretest();
  delete qb.pt_safety; // never answered anything in safety
  const { mb, weakCats } = run(qb);
  const safety = mb.find((x) => x.c === 'safety');
  assert.equal(safety.score, null);
  assert.equal(safety.n, 0);
  assert.ok(!weakCats.includes('safety'),
    'a null-score category must not be presented as a measured weakness');
});

test('volume converges to the score-based flag: 2/6 in a category reads weak', () => {
  const qb = perfectPretest();
  for (let i = 0; i < 5; i++) {
    qb[`extra_${i}`] = { correct: i < 1, pages: ['t_pharm.md'], cat: 'pharm' };
  }
  // pharm now: pretest 1 correct + 1 extra correct + 4 wrong = 2/6.
  const { mb, weakCats } = run(qb);
  const pharm = mb.find((x) => x.c === 'pharm');
  assert.equal(pharm.n, 6);
  assert.equal(pharm.miss, 4);
  assert.ok(pharm.score < 70 && pharm.miss > 0, 'a genuinely weak category still flags');
  assert.deepEqual(weakCats, ['pharm'], 'and it is the one the Progress page offers to practise');
});

// The renderer's own two rules, which only exist on this surface and nothing else covers:
// weakest first, and at most three. Four weak categories with distinct scores make both
// observable at once — a stable sort or a missing slice would each show up here.
test('weak areas render weakest-first and are capped at three', () => {
  const qb = perfectPretest();
  // Drive four categories to different sub-70 scores by giving each a different miss ratio.
  const misses = { mood: 5, psychosis: 4, anxiety: 3, substance: 2 };
  for (const [cat, n] of Object.entries(misses)) {
    for (let i = 0; i < n; i++) {
      qb[`m_${cat}_${i}`] = { correct: false, pages: [`t_${cat}.md`], cat };
    }
  }
  const { mb, weakCats } = run(qb);
  const scoreOf = (c) => mb.find((x) => x.c === c).score;
  assert.ok(scoreOf('mood') < scoreOf('psychosis'), 'fixture sanity: mood must be the weakest');
  assert.ok(scoreOf('psychosis') < scoreOf('anxiety'));
  assert.ok(scoreOf('anxiety') < scoreOf('substance'));
  assert.equal(weakCats.length, 3, 'at most three practice rows');
  assert.deepEqual(weakCats, ['mood', 'psychosis', 'anxiety'],
    'weakest first, and the fourth-weakest is dropped rather than the strongest kept');
});
