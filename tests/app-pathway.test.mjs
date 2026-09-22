import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const CUR = readJson('curriculum.json');
const SHIPPED = readJson('13_Faculty_Resources/_automation/site_build/shipped_pages.json');
const BUILD = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const practiceSrc = readFileSync(new URL('frontdoor/fd_app_practice.js', BUILD), 'utf8');
const appSrc = readFileSync(new URL('frontdoor/fd_app.js', BUILD), 'utf8');
const dataSrc = readFileSync(new URL('frontdoor/fd_data.js', BUILD), 'utf8');

// eslint-disable-next-line no-new-func
const makeApp = new Function(`
  ${dataSrc}
  function governanceBadge(value){
    return value ? '<span data-test-governance="'+fdEsc(value.status)+'"></span>' : '';
  }
  ${practiceSrc}
  ${appSrc}
  return {
    fdAppModel: fdAppModel,
    fdAppWorkspace: fdAppWorkspace,
    fdAppPracticeStart: fdAppPracticeStart
  };
`);
const APP = makeApp();

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
const PRACTICE_IDS = [
  'training-briefing',
  'workshop-equipment-checkout',
  'community-event-handoff',
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

test('each APP activity resolves one unique nonclinical practice pack', () => {
  const { activities, practicePacks } = CUR.appPathway;
  assert.deepEqual(activities.map((activity) => activity.practiceId), PRACTICE_IDS);
  assert.deepEqual(practicePacks.map((pack) => pack.id), PRACTICE_IDS);
  assert.equal(new Set(practicePacks.map((pack) => pack.id)).size, 3);
  assert.ok(practicePacks.every((pack) =>
    pack.statements.length === 3 && pack.supervisorQuestions.length === 3));
  assert.doesNotMatch(JSON.stringify(practicePacks),
    /clinical|patient|diagnos|medicat|dose|treatment|capacity|suicide|agitation|symptom|disease|disorder|score|pass|fail|correct|answer|competent|entrust|ready/i);
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

function appIndex(pathway = CUR.appPathway) {
  const refs = [
    ...Object.values(pathway.bridges).flatMap((bridge) => bridge.refs),
    ...pathway.activities.flatMap((activity) => activity.refs),
  ];
  return { byRef: Object.fromEntries([...new Set(refs)].map((ref, index) => [ref, {
    ref, title: `Canonical ${ref}`, kind: ref.endsWith('.html') ? 'tool' : 'read',
    minutes: ref.endsWith('.html') ? null : 5,
    governance: { status: index % 2 ? 'pending' : 'reviewed' },
  }])) };
}

test('the APP renderer shows one active bridge, eight canonical resources, and both route choices', () => {
  const html = APP.fdAppWorkspace(appIndex(), CUR.appPathway, { appBridge: 'pa' });
  assert.match(html, /PA psychiatry bridge/);
  assert.equal((html.match(/data-fd-app-bridge=/g) || []).length, 2);
  assert.equal((html.match(/class="fd-app__resource"/g) || []).length, 8);
  assert.match(html, /Canonical pg_interview\.md/);
  assert.match(html, /data-test-governance="reviewed"/);
  assert.doesNotMatch(html, />pg_interview\.md</, 'the canonical title must replace the slug');
});

test('the APP renderer distinguishes prepare, rehearse, and observation on all three work tasks', () => {
  const html = APP.fdAppWorkspace(appIndex(), CUR.appPathway, { appBridge: 'pmhnp' });
  assert.equal((html.match(/data-fd-app-shift=/g) || []).length, 3);
  assert.equal((html.match(/>Prepare independently</g) || []).length, 3);
  assert.equal((html.match(/>Rehearse here</g) || []).length, 3);
  assert.equal((html.match(/>Arrange observation</g) || []).length, 3);
  assert.match(html, /This site does not record supervisor observation/);
});

test('each workplace task opens its mapped practice pack', () => {
  const html = APP.fdAppWorkspace(appIndex(), CUR.appPathway, { appBridge: 'pa' });
  assert.equal((html.match(/data-fd-app-practice-open=/g) || []).length, 3);
  for (const id of PRACTICE_IDS) {
    assert.match(html, new RegExp(`data-fd-app-practice-open="${id}"`));
  }
});

test('an active session renders once after the task grid without evaluative copy', () => {
  const session = APP.fdAppPracticeStart(CUR.appPathway.practicePacks[0]);
  const html = APP.fdAppWorkspace(appIndex(), CUR.appPathway,
    { appBridge: 'pa', appPractice: session });
  assert.equal((html.match(/<section class="fd-app-practice"/g) || []).length, 1);
  assert.ok(html.indexOf('fd-app__tasks') < html.indexOf('fd-app__practice-host'));
  const privacy = 'Private rehearsal. No score, no saved response, and nothing is sent.';
  assert.equal(html.split(privacy).length - 1, 1);
  assert.equal((html.match(/No score/g) || []).length, 1);
  assert.doesNotMatch(html, /grade|pass|fail|correct|competent|entrust/i);
});

test('an invalid mapped pack leaves resources usable and shows a scoped alert', () => {
  const pathway = structuredClone(CUR.appPathway);
  pathway.activities[0].practiceId = 'missing-pack';
  const html = APP.fdAppWorkspace(appIndex(pathway), pathway, { appBridge: 'pa' });
  assert.match(html, /Practice unavailable\. Your preparation resources are still available\./);
  assert.match(html, /Canonical pg_interview\.md/);
});

test('private reflection has only the three formative choices and no evaluative output', () => {
  const html = APP.fdAppWorkspace(appIndex(), CUR.appPathway, {
    appBridge: 'pa', appReflection: 'supervisor',
  });
  assert.equal((html.match(/data-fd-app-reflect=/g) || []).length, 3);
  assert.match(html, /Discuss with my supervisor/);
  assert.match(html, /Saved only for this visit on this device/);
  assert.match(html, /data-fd-app-reset/);
  assert.doesNotMatch(html, /score|grade|pass|fail|competent|entrust|readiness|certificate/i);
});

test('a missing configured resource is named instead of silently shortening a bridge', () => {
  const index = appIndex();
  delete index.byRef['pg_interview.md'];
  const model = APP.fdAppModel(index, CUR.appPathway, { appBridge: 'pa' });
  assert.deepEqual(model.missing, ['pg_interview.md']);
  const html = APP.fdAppWorkspace(index, CUR.appPathway, { appBridge: 'pa' });
  assert.match(html, /role="alert"/);
  assert.match(html, /Configured resource unavailable: pg_interview\.md/);
  assert.equal((html.match(/class="fd-app__resource"/g) || []).length, 7);
});

test('the APP renderer is pure ES5 with no storage, network, analytics, model, or clock access', () => {
  assert.doesNotMatch(appSrc, /\b(?:const|let)\s|=>|`/);
  assert.doesNotMatch(appSrc,
    /localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|cwAnalytics|postMessage|\bDate\s*\(|performance\.|AI service/i);
});
