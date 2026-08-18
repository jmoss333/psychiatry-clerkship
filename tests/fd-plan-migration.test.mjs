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
const planFromMasterySrc = extract(/function fdPlanFromMastery\(index,masteryRows,generatedAt,shelfDate\)\{[\s\S]*?\n  \}/, 'fdPlanFromMastery()');
const sameStringsSrc = extract(/function fdSameStrings\(a,b\)\{[\s\S]*?\n  \}/, 'fdSameStrings()');
const planMatchesSrc = extract(/function fdPlanMatches\(index,plan\)\{[\s\S]*?\n  \}/, 'fdPlanMatches()');
const placementUsableSrc = extract(/function fdPlacementUsable\(record\)\{[\s\S]*?\n  \}/, 'fdPlacementUsable()');
const buildPlanSrc = extract(/function buildPlan\(\)\{[\s\S]*?\n  \}/, 'buildPlan()');
const loadPlanSrc = extract(/function fdLoadPlan\(index\)\{[\s\S]*?\n  \}/, 'fdLoadPlan()');

function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function make(localStorage, FD_INDEX, masteryRows) {
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', 'FD_INDEX', 'masteryRows', `
    function LS(k){ return localStorage.getItem(k); }
    function masteryByBlueprint(){ return masteryRows; }
    ${shelfOrderSrc}
    ${planFromMasterySrc}
    ${sameStringsSrc}
    ${planMatchesSrc}
    ${placementUsableSrc}
    ${buildPlanSrc}
    ${loadPlanSrc}
    return {buildPlan:buildPlan,fdPlanFromMastery:fdPlanFromMastery,
      fdPlanMatches:fdPlanMatches,fdPlacementUsable:fdPlacementUsable,fdLoadPlan:fdLoadPlan};
  `)(localStorage, FD_INDEX, masteryRows);
}

function planHarness(seed, index, masteryRows) {
  const storage = memStorage(seed);
  return { storage, F: make(storage, index, masteryRows) };
}

const NOW = '2026-08-18T12:00:00.000Z';
const rows = [
  { c: 'safety', score: 20, miss: 1 },
  { c: 'mood', score: 100, miss: 0 },
  { c: 'ethics', score: null, miss: 0 },
];
const RES_INDEX = {
  path: { id: 'resident-four-week', weekCount: 4 },
  weeks: [
    { n: 1, title: 'Foundations and safety',
      focusCategories: ['safety', 'neurocog', 'substance'] },
    { n: 2, title: 'Diagnosis and psychopharmacology',
      focusCategories: ['mood', 'psychosis', 'pharm', 'substance'] },
    { n: 3, title: 'Systems, med-legal, and disposition',
      focusCategories: ['ethics', 'relational'] },
    { n: 4, title: 'Integration, supervision, and scholarship',
      focusCategories: ['otherdx', 'ethics', 'relational'] },
  ],
};

test('resident plan carries four canonical weeks and path identity', () => {
  const { F } = planHarness({}, RES_INDEX, rows);
  const plan = F.fdPlanFromMastery(RES_INDEX, rows, NOW, '');
  assert.equal(plan.pathId, 'resident-four-week');
  assert.equal(plan.weekCount, 4);
  assert.deepEqual(plan.weeks.map((w) => w.week), [1, 2, 3, 4]);
  assert.deepEqual(plan.weeks[0].allCats, ['safety', 'neurocog', 'substance']);
});

test('plan validation rejects legacy, wrong-path, wrong-count, reordered and foreign categories', () => {
  const { F } = planHarness({}, RES_INDEX, rows);
  const valid = F.fdPlanFromMastery(RES_INDEX, rows, NOW, '');
  const legacyWithoutPathId = structuredClone(valid);
  delete legacyWithoutPathId.pathId;
  const wrongPath = structuredClone(valid);
  wrongPath.pathId = 'ms3-six-week';
  const wrongCount = structuredClone(valid);
  wrongCount.weekCount = 6;
  const reorderedWeeks = structuredClone(valid);
  reorderedWeeks.weeks.reverse();
  const foreignAllCats = structuredClone(valid);
  foreignAllCats.weeks[0].allCats.push('anxiety');
  const foreignFocus = structuredClone(valid);
  foreignFocus.weeks[0].focus.push('anxiety');
  for (const plan of [legacyWithoutPathId, wrongPath, wrongCount, reorderedWeeks,
    foreignAllCats, foreignFocus]) {
    assert.equal(F.fdPlanMatches(RES_INDEX, plan), false);
  }
});

test('legacy plan plus valid placement regenerates only cw_plan_v1', () => {
  const progress = JSON.stringify({ 'pg_interview.md': { done: true, at: '2026-08-17' } });
  const pretest = JSON.stringify({
    takenAt: NOW,
    answers: [{ id: 'pt_safety', cat: 'safety', correct: false }],
    byCat: { safety: { n: 1, correct: 0 } },
  });
  const qbank = JSON.stringify({ pt_safety: { correct: false, cat: 'safety' } });
  const { storage, F } = planHarness({
    cw_plan_v1: JSON.stringify({ generatedAt: NOW, shelfDate: '', weeks: [] }),
    cw_pretest_v1: pretest,
    cw_progress_v1: progress,
    cw_qb_v1: qbank,
  }, RES_INDEX, rows);
  const plan = F.fdLoadPlan(RES_INDEX);
  assert.equal(plan.pathId, 'resident-four-week');
  assert.equal(plan.weekCount, 4);
  assert.equal(storage.getItem('cw_progress_v1'), progress);
  assert.equal(storage.getItem('cw_pretest_v1'), pretest);
  assert.equal(storage.getItem('cw_qb_v1'), qbank);
  assert.deepEqual(JSON.parse(storage.getItem('cw_plan_v1')), plan);
});

test('corrupt plan without usable placement returns null and preserves progress', () => {
  const progress = JSON.stringify({ 'pg_interview.md': { done: true, at: '2026-08-17' } });
  const { storage, F } = planHarness({
    cw_plan_v1: '{broken',
    cw_progress_v1: progress,
  }, RES_INDEX, rows);
  assert.equal(F.fdLoadPlan(RES_INDEX), null);
  assert.equal(storage.getItem('cw_plan_v1'), null);
  assert.equal(storage.getItem('cw_progress_v1'), progress);
});

test('placement usability rejects corrupt, empty, and malformed records', () => {
  const { F } = planHarness({}, RES_INDEX, rows);
  assert.equal(F.fdPlacementUsable(null), false);
  assert.equal(F.fdPlacementUsable({ answers: [], byCat: {} }), false);
  assert.equal(F.fdPlacementUsable({
    answers: [{ id: '', cat: 'safety', correct: false }], byCat: {},
  }), false);
  assert.equal(F.fdPlacementUsable({
    answers: [{ id: 'pt', cat: 'not-a-category', correct: false }], byCat: {},
  }), false);
  assert.equal(F.fdPlacementUsable({
    answers: [{ id: 'pt', cat: 'safety', correct: 'false' }], byCat: {},
  }), false);
});
