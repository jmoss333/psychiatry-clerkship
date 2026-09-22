import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const CUR = readJson('curriculum.json');
const SHIPPED = readJson('13_Faculty_Resources/_automation/site_build/shipped_pages.json');

const PA_REFS = [
  'pg_interview.md', 'case_formulation.md', 'communication-practice.html',
  'psychopharm_primer.md', 'adv_psychopharm.md', 'one-patient-six-weeks.html',
  'systems_medlegal.md', 'oral.html',
];
const PMHNP_REFS = [
  'medical_workup.md', 'ddx.md', 'diagnostic-reasoning.html', 'med_monitoring.md',
  'interaction-cards.html', 'exp_consult.md', 'toxidromes.md', 'exp_family.md',
];
const ACTIVITY_IDS = ['initial-evaluation', 'medication-follow-through', 'collateral-transition'];
const ACTIVITY_NAMES = [
  'Initial psychiatric evaluation and presentation',
  'Medication plan and follow-through',
  'Collateral and safe transition',
];

test('the canonical APP pathway has the two approved bridge names and exact resource sequences', () => {
  const pathway = CUR.appPathway;
  assert.deepEqual(Object.keys(pathway.bridges), ['pa', 'pmhnp']);
  assert.equal(pathway.bridges.pa.name, 'PA psychiatry bridge');
  assert.equal(pathway.bridges.pmhnp.name, 'PMHNP medical-systems bridge');
  assert.deepEqual(pathway.bridges.pa.refs, PA_REFS);
  assert.deepEqual(pathway.bridges.pmhnp.refs, PMHNP_REFS);
  assert.deepEqual(pathway.bridges.pa.selfCheck.actions, ['revisit', 'supervisor', 'another']);
  assert.deepEqual(pathway.bridges.pmhnp.selfCheck.actions, ['revisit', 'supervisor', 'another']);
});

test('the shared On shift structure has exactly three stable preparation activities', () => {
  const activities = CUR.appPathway.activities;
  assert.deepEqual(activities.map((activity) => activity.id), ACTIVITY_IDS);
  assert.deepEqual(activities.map((activity) => activity.name), ACTIVITY_NAMES);
  assert.ok(activities.every((activity) => activity.refs.length > 0));
  assert.ok(activities.every((activity) =>
    JSON.stringify(activity.actions) === JSON.stringify(['prepare', 'rehearse', 'observe'])));
});

test('every APP resource resolves on the resident preview without duplicating clinical metadata', () => {
  const residentRefs = new Set(SHIPPED.pages
    .filter((page) => page.sites.includes('res'))
    .map((page) => page.slug));
  const configured = [
    ...CUR.appPathway.bridges.pa.refs,
    ...CUR.appPathway.bridges.pmhnp.refs,
    ...CUR.appPathway.activities.flatMap((activity) => activity.refs),
  ];
  for (const ref of configured) assert.ok(residentRefs.has(ref), `${ref} is not resident-shipped`);
  const serialized = JSON.stringify(CUR.appPathway);
  for (const forbidden of ['governance', 'facultyReview', 'clinicalSummary', 'answerKey', 'score', 'threshold']) {
    assert.doesNotMatch(serialized, new RegExp(`"${forbidden}"`, 'i'));
  }
});

test('APP navigation copy does not claim readiness, authority, or entrustment', () => {
  assert.doesNotMatch(JSON.stringify(CUR.appPathway),
    /competent|entrusted|safe independently|pass|fail|ready for independent|supervisor approved/i);
});
