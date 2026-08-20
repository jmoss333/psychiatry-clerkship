import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build/frontdoor';
const CORE_REVISION = '5'.repeat(40);
const OLD_CORE_REVISION = '4'.repeat(40);
const CATALOG_REVISION = `sha256-${'D'.repeat(43)}`;
const OLD_CATALOG_REVISION = `sha256-${'E'.repeat(43)}`;
const SOURCE = [
  readFileSync(new URL(`${BUILD}/fd_edition_catalog.js`, import.meta.url), 'utf8').replace('__FD_CATALOG_EXPECTED_REVISION__', CATALOG_REVISION),
  ...['fd_edition_contract.js', 'fd_edition_project.js', 'fd_curator.js'].map((name) => readFileSync(new URL(`${BUILD}/${name}`, import.meta.url), 'utf8')),
].join('\n');
const API_NAMES = [
  'fdEditionCatalogSnapshot', 'fdEditionCreateEnvelope', 'fdCuratorNewDraft', 'fdCuratorReduce',
  'fdCuratorImportTransactions', 'fdCuratorCandidateConfig', 'fdCuratorPreparePreview',
  'fdCuratorPrepareGenerationResult', 'fdCuratorLocalCoverage', 'fdCuratorLocalMarkup',
  'fdCuratorObserveCurrentSite', 'fdCuratorCatalogOptions',
];
const F = new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa',
  `${SOURCE}\nreturn {${API_NAMES.map((name) => `${name}:typeof ${name}==='function'?${name}:null`).join(',')}};`,
)(TextEncoder, TextDecoder, atob, btoa);
function fn(name) { assert.equal(typeof F[name], 'function', `${name} must be implemented`); return F[name]; }

const TOKENS = {
  arrival: ['timing', 'time', 'place', 'role'], scheduleWindow: ['dayStart', 'dayEnd', 'endQualifier'],
  scheduleRangeWithPlace: ['daySet', 'startTime', 'endTime', 'activity', 'place', 'priority'],
  scheduleRangeWithoutPlace: ['daySet', 'startTime', 'endTime', 'activity', 'priority'],
  schedulePointWithPlace: ['daySet', 'startTime', 'activity', 'place', 'priority'], schedulePointWithoutPlace: ['daySet', 'startTime', 'activity', 'priority'],
  rounds: ['preparation', 'participation', 'followUp'], presentation: ['format', 'timing', 'elements'], documentation: ['workflow', 'timing'],
  attendance: ['events', 'absenceRole'], feedback: ['cadence', 'initiator', 'setting'], access: ['item', 'due'], contact: ['role'], checklist: ['item', 'priority'],
  resourceWithReason: ['title', 'priority', 'week', 'reason', 'hostname'], resourceWithoutReason: ['title', 'priority', 'week', 'hostname'], changeSummary: ['kinds', 'count'],
};
const TEXT = {
  arrival: 'Arrive {timing} {time} at {place}; check in with {role}.', scheduleWindow: 'The day runs from {dayStart} until {endQualifier} {dayEnd}.',
  scheduleRangeWithPlace: '{daySet}: {activity}, {startTime} to {endTime}, at {place} ({priority}).', scheduleRangeWithoutPlace: '{daySet}: {activity}, {startTime} to {endTime} ({priority}).',
  schedulePointWithPlace: '{daySet}: {activity} at {startTime}, at {place} ({priority}).', schedulePointWithoutPlace: '{daySet}: {activity} at {startTime} ({priority}).',
  rounds: 'Before rounds {preparation}; during rounds {participation}; after rounds {followUp}.', presentation: 'Use {format} {timing}; include {elements}.',
  documentation: '{workflow}; {timing}.', attendance: 'Attend {events}; report absences to {absenceRole}.', feedback: 'Feedback is {cadence}; {initiator} in {setting}.',
  access: '{item} {due}.', contact: 'Contact {role}.', checklist: '{item} ({priority}).',
  resourceWithReason: '{title}: {priority}, week {week}, because {reason}; {hostname}.', resourceWithoutReason: '{title}: {priority}, week {week}; {hostname}.',
  changeSummary: '{kinds}; {count} changed items.',
};
const CHOICES = {
  role: 'the teaching coordinator', reason: 'for supervised preparation', daySet: 'weekdays', activity: 'team rounds',
  roundsPreparation: 'review assignments', roundsParticipation: 'present assignments', roundsFollowUp: 'complete follow-up',
  presentationFormat: 'a problem representation', presentationTiming: 'during rounds', presentationElement: 'assessment and plan',
  documentationWorkflow: 'use the approved record', documentationTiming: 'when the supervisor directs', feedbackCadence: 'weekly',
  feedbackInitiator: 'the learner requests it', feedbackSetting: 'a private setting', accessItem: 'complete access setup', duePoint: 'before arrival', checklist: 'bring identification',
};
function choiceKey(kind) { return `choice.${kind.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}@v1`; }
function context(coreRevision = CORE_REVISION, localCatalogRevision = CATALOG_REVISION) {
  return { audience: 'ms3', pathId: 'ms3-six-week', coreRevision, localCatalogRevision, rotationEditionV2: 'enabled' };
}
function contractContext(coreRevision = CORE_REVISION, localCatalogRevision = CATALOG_REVISION) {
  const { pathId: ignored, ...value } = context(coreRevision, localCatalogRevision); return value;
}
function index() {
  const first = { ref: 'first.md', title: 'First reviewed item' }, second = { ref: 'second.md', title: 'Second reviewed item' };
  return { path: { id: 'ms3-six-week', weekCount: 6 }, weeks: [
    { n: 1, title: 'Week 1', items: [first] }, { n: 2, title: 'Week 2', items: [second] }, { n: 3, title: 'Week 3', items: [] },
    { n: 4, title: 'Week 4', items: [] }, { n: 5, title: 'Week 5', items: [] }, { n: 6, title: 'Week 6', items: [] },
  ], byRef: { 'first.md': first, 'second.md': second }, columns: [{ name: 'Library', accent: 'teal', items: [first, second] }] };
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  const bytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return `sha256-${Buffer.from(bytes).toString('base64url')}`;
}
function fullLocalPlan() {
  return {
    arrival: { timingCode: 'by', time: '07:45', placeKey: 'place.workroom@v1', checkInRoleKey: choiceKey('role'), linkKey: 'link.arrival@v1' },
    schedule: { dayStart: '07:45', dayEnd: '17:00', endQualifierCode: 'about', events: [
      { instanceId: 'local:schedule:1', daySetKey: choiceKey('daySet'), startTime: '08:30', endTime: '09:30', activityKey: choiceKey('activity'), placeKey: 'place.workroom@v1', priority: 'required' },
      { instanceId: 'local:schedule:2', daySetKey: choiceKey('daySet'), startTime: '13:00', activityKey: choiceKey('activity'), priority: 'optional' },
    ] },
    rounds: { preparationKey: choiceKey('roundsPreparation'), participationKey: choiceKey('roundsParticipation'), followUpKey: choiceKey('roundsFollowUp') },
    presentation: { formatKey: choiceKey('presentationFormat'), timingKey: choiceKey('presentationTiming'), elementKeys: [choiceKey('presentationElement')] },
    documentation: { workflowKey: choiceKey('documentationWorkflow'), timingKey: choiceKey('documentationTiming'), policyLinkKey: 'link.documentation@v1' },
    attendance: { eventInstanceIds: ['local:schedule:1'], absenceRoleKey: choiceKey('role'), policyLinkKey: 'link.attendance@v1' },
    feedback: { cadenceKey: choiceKey('feedbackCadence'), initiatorKey: choiceKey('feedbackInitiator'), settingKey: choiceKey('feedbackSetting') },
    accessItems: [{ instanceId: 'local:access:1', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint'), linkKey: 'link.access@v1' }],
    contacts: [{ instanceId: 'local:contact:1', roleKey: choiceKey('role'), linkKey: 'link.directory@v1' }],
    checklistItems: [{ instanceId: 'local:checklist:1', itemKey: choiceKey('checklist'), priority: 'recommended' }],
    resources: [{ instanceId: 'local:resource:1', linkKey: 'link.orientation@v1', priority: 'recommended', week: 1, reasonKey: choiceKey('reason') }],
  };
}
async function makeSnapshot() {
  const common = { audiences: ['ms3'], verifiedOn: '2026-08-19' }, scoped = { locationKeys: ['location.example@v1'], ...common };
  const records = [
    { key: 'location.example@v1', kind: 'trainingLocation', displayName: 'Example Unit', locationCode: 'EXU', locationTypeCode: 'inpatient', officialHostnames: ['example.edu'], ...common },
    { key: 'location.other@v1', kind: 'trainingLocation', displayName: 'Other Unit', locationCode: 'OTH', locationTypeCode: 'outpatient', officialHostnames: ['other.example.edu'], ...common },
    { key: 'place.workroom@v1', kind: 'place', displayName: 'the unit workroom', ...scoped },
    { key: 'place.other@v1', kind: 'place', displayName: 'an ineligible place', locationKeys: ['location.other@v1'], ...common },
    { key: 'curator.example@v1', kind: 'curatorProfile', displayName: 'Example Faculty', roleKey: choiceKey('role'), ...scoped },
    { key: 'phrases.example@v1', kind: 'phraseSet', displayName: 'Reviewed wording', templates: Object.fromEntries(Object.entries(TOKENS).map(([name, tokens]) => [name, { text: TEXT[name], tokens }])), ...scoped },
    { key: 'preset.complete@v1', kind: 'localPreset', displayName: 'Complete reviewed preset', localPlan: fullLocalPlan(), phraseSetKey: 'phrases.example@v1', ...scoped },
  ];
  for (const [choiceKind, fragment] of Object.entries(CHOICES)) records.push({ key: choiceKey(choiceKind), kind: 'choice', choiceKind, label: choiceKind, fragment, ...scoped });
  for (const [name, purposeCode] of [['arrival', 'arrival-map'], ['documentation', 'documentation-policy'], ['attendance', 'attendance-policy'], ['access', 'access-training'], ['directory', 'directory'], ['orientation', 'orientation']]) {
    records.push({ key: `link.${name}@v1`, kind: 'officialLink', title: `${name} link`, url: `https://example.edu/${name}`, visibleHostname: 'example.edu', purposeCode, ...scoped });
  }
  const resolutionRecords = await Promise.all(records.map(async (record) => ({ ...record, contentDigest: await digest(record) })));
  resolutionRecords.sort((a, b) => a.key.localeCompare(b.key));
  const projection = { schemaVersion: 1, audience: 'ms3', revision: CATALOG_REVISION, projectionDigest: '', rotationEditionV2: 'enabled', selectionKeys: resolutionRecords.map((record) => record.key), resolutionRecords, blockedKeys: [] };
  const bare = structuredClone(projection); delete bare.projectionDigest; projection.projectionDigest = await digest(bare);
  const prepared = await fn('fdEditionCatalogSnapshot')(projection, 'ms3', webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared)); return prepared.snapshot;
}
const SNAPSHOT = await makeSnapshot();
function reduce(draft, action, transactions = null, site = context()) {
  return fn('fdCuratorReduce')(draft, action, index(), site, SNAPSHOT, '2026-08-19', transactions);
}
function completedDraft() {
  let draft = fn('fdCuratorNewDraft')(index(), context());
  for (const action of [
    { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' }, { type: 'SET_CURATOR_PROFILE', curatorProfileKey: 'curator.example@v1' },
    { type: 'SET_PHRASE_SET', phraseSetKey: 'phrases.example@v1' }, { type: 'SET_ROTATION_START', value: '2026-09-01' },
    { type: 'SET_ROTATION_END', value: '2026-10-12' }, { type: 'SET_EDITION_CHECKED_ON', value: '2026-08-19' },
  ]) { const next = reduce(draft, action); assert.notEqual(next, draft, action.type); draft = next; }
  return draft;
}

test('every closed local action builds the exact normalized v2 local plan', () => {
  let draft = completedDraft();
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'place', 'location.example@v1', 'ms3').map((row) => row.key), ['place.workroom@v1']);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'choice:role', 'location.example@v1', 'ms3').map((row) => row.key), [choiceKey('role')]);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'link:arrival-map', 'location.example@v1', 'ms3').map((row) => row.key), ['link.arrival@v1']);
  for (const action of [
    { type: 'ARRIVAL_SET', value: fullLocalPlan().arrival }, { type: 'SCHEDULE_SET_BOUNDS', dayStart: '07:45', dayEnd: '17:00', endQualifierCode: 'about' },
    { type: 'SCHEDULE_EVENT_ADD', daySetKey: choiceKey('daySet'), startTime: '08:30', endTime: '09:30', activityKey: choiceKey('activity'), placeKey: 'place.workroom@v1', priority: 'required' },
    { type: 'SCHEDULE_EVENT_ADD', daySetKey: choiceKey('daySet'), startTime: '13:00', activityKey: choiceKey('activity'), priority: 'optional' },
    { type: 'ROUNDS_SET', value: fullLocalPlan().rounds }, { type: 'PRESENTATION_SET', value: fullLocalPlan().presentation }, { type: 'DOCUMENTATION_SET', value: fullLocalPlan().documentation },
    { type: 'ATTENDANCE_SET', value: fullLocalPlan().attendance }, { type: 'FEEDBACK_SET', value: fullLocalPlan().feedback },
    { type: 'ACCESS_ADD', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint'), linkKey: 'link.access@v1' }, { type: 'CONTACT_ADD', roleKey: choiceKey('role'), linkKey: 'link.directory@v1' },
    { type: 'CHECKLIST_ADD', itemKey: choiceKey('checklist'), priority: 'recommended' }, { type: 'RESOURCE_ADD', linkKey: 'link.orientation@v1', priority: 'recommended', week: 1, reasonKey: choiceKey('reason') },
  ]) { const next = reduce(draft, action); assert.notEqual(next, draft, action.type); draft = next; }
  assert.deepEqual(draft.config.localPlan, fullLocalPlan());
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'place', 'location.example@v1', 'ms3').map((row) => row.key), ['place.workroom@v1']);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'choice:role', 'location.example@v1', 'ms3').map((row) => row.key), [choiceKey('role')]);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'link:directory', 'location.example@v1', 'ms3').map((row) => row.key), ['link.directory@v1']);
});

test('updates, optional clearing, category clearing, and lowest-unused IDs preserve exact public shapes', () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  assert.deepEqual(draft.config.localPlan, fullLocalPlan()); assert.equal(canonical(draft).includes('preset.complete@v1'), false);
  draft = reduce(draft, { type: 'ACCESS_UPDATE', instanceId: 'local:access:1', field: 'linkKey', value: '' });
  assert.equal(Object.hasOwn(draft.config.localPlan.accessItems[0], 'linkKey'), false);
  draft = reduce(draft, { type: 'CONTACT_REMOVE', instanceId: 'local:contact:1' }); assert.equal(Object.hasOwn(draft.config.localPlan, 'contacts'), false);
  draft = reduce(draft, { type: 'CONTACT_ADD', roleKey: choiceKey('role') }); assert.equal(draft.config.localPlan.contacts[0].instanceId, 'local:contact:1');
  draft = reduce(draft, { type: 'CHECKLIST_UPDATE', instanceId: 'local:checklist:1', field: 'priority', value: 'required' });
  draft = reduce(draft, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'reasonKey', value: '' });
  assert.equal(draft.config.localPlan.checklistItems[0].priority, 'required'); assert.equal(Object.hasOwn(draft.config.localPlan.resources[0], 'reasonKey'), false);
  assert.equal(reduce(draft, { type: 'LOCAL_CATEGORY_CLEAR', category: 'schedule' }), draft, 'attendance blocks schedule clearing');
  draft = reduce(draft, { type: 'LOCAL_CATEGORY_CLEAR', category: 'attendance' }); draft = reduce(draft, { type: 'LOCAL_CATEGORY_CLEAR', category: 'schedule' });
  assert.equal(Object.hasOwn(draft.config.localPlan, 'schedule'), false);
});

test('invalid, boundary, duplicate, dependency-blocked, and accessor actions are identity no-ops', () => {
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' }); let reads = 0;
  const accessor = { type: 'ARRIVAL_SET' }; Object.defineProperty(accessor, 'value', { enumerable: true, get() { reads += 1; return fullLocalPlan().arrival; } });
  for (const action of [accessor, { type: 'ARRIVAL_SET', value: fullLocalPlan().arrival, other: true }, { type: 'ARRIVAL_SET', value: { ...fullLocalPlan().arrival, placeKey: 'place.other@v1' } },
    { type: 'SCHEDULE_SET_BOUNDS', dayStart: '17:00', dayEnd: '07:45', endQualifierCode: 'about' },
    { type: 'SCHEDULE_EVENT_ADD', daySetKey: choiceKey('daySet'), startTime: '08:30', endTime: '09:30', activityKey: choiceKey('activity'), placeKey: 'place.workroom@v1', priority: 'required' },
    { type: 'SCHEDULE_EVENT_UPDATE', instanceId: 'local:schedule:1', field: 'endTime', value: '08:00' }, { type: 'SCHEDULE_EVENT_REMOVE', instanceId: 'local:schedule:1' },
    { type: 'LOCAL_CATEGORY_CLEAR', category: 'other' }, { type: 'SET_AFFIRMATION', name: 'previewsReviewed', value: true }, { type: 'SET_AFFIRMATION', name: 'publicSafe', value: 'true' },
  ]) assert.equal(reduce(draft, action), draft, action.type);
  assert.equal(reads, 0);
});

test('every local action is an exact own-data object and every closed field enum rejects unknown values', () => {
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const actions = [
    { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' }, { type: 'ARRIVAL_SET', value: fullLocalPlan().arrival }, { type: 'ARRIVAL_CLEAR' },
    { type: 'SCHEDULE_SET_BOUNDS', dayStart: '07:45', dayEnd: '17:00', endQualifierCode: 'about' },
    { type: 'SCHEDULE_EVENT_ADD', daySetKey: choiceKey('daySet'), startTime: '10:00', activityKey: choiceKey('activity'), priority: 'optional' },
    { type: 'SCHEDULE_EVENT_UPDATE', instanceId: 'local:schedule:2', field: 'placeKey', value: '' }, { type: 'SCHEDULE_EVENT_REMOVE', instanceId: 'local:schedule:2' },
    { type: 'ROUNDS_SET', value: fullLocalPlan().rounds }, { type: 'PRESENTATION_SET', value: fullLocalPlan().presentation }, { type: 'DOCUMENTATION_SET', value: fullLocalPlan().documentation },
    { type: 'ATTENDANCE_SET', value: fullLocalPlan().attendance }, { type: 'FEEDBACK_SET', value: fullLocalPlan().feedback },
    { type: 'ACCESS_ADD', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint') }, { type: 'ACCESS_UPDATE', instanceId: 'local:access:1', field: 'linkKey', value: '' }, { type: 'ACCESS_REMOVE', instanceId: 'local:access:1' },
    { type: 'CONTACT_ADD', roleKey: choiceKey('role') }, { type: 'CONTACT_UPDATE', instanceId: 'local:contact:1', field: 'linkKey', value: '' }, { type: 'CONTACT_REMOVE', instanceId: 'local:contact:1' },
    { type: 'CHECKLIST_ADD', itemKey: choiceKey('checklist'), priority: 'optional' }, { type: 'CHECKLIST_UPDATE', instanceId: 'local:checklist:1', field: 'priority', value: 'required' }, { type: 'CHECKLIST_REMOVE', instanceId: 'local:checklist:1' },
    { type: 'RESOURCE_ADD', linkKey: 'link.orientation@v1', priority: 'optional', week: 2 }, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'reasonKey', value: '' }, { type: 'RESOURCE_REMOVE', instanceId: 'local:resource:1' },
    ...['arrival', 'schedule', 'rounds', 'presentation', 'documentation', 'attendance', 'feedback', 'accessItems', 'contacts', 'checklistItems', 'resources'].map((category) => ({ type: 'LOCAL_CATEGORY_CLEAR', category })),
    { type: 'SET_AFFIRMATION', name: 'publicSafe', value: true },
  ];
  for (const action of actions) assert.equal(reduce(draft, { ...action, unexpected: true }), draft, action.type);
  const nested = [
    { type: 'ARRIVAL_SET', value: { ...fullLocalPlan().arrival, extra: true } }, { type: 'ROUNDS_SET', value: { ...fullLocalPlan().rounds, extra: true } },
    { type: 'PRESENTATION_SET', value: { ...fullLocalPlan().presentation, extra: true } }, { type: 'DOCUMENTATION_SET', value: { ...fullLocalPlan().documentation, extra: true } },
    { type: 'ATTENDANCE_SET', value: { ...fullLocalPlan().attendance, extra: true } }, { type: 'FEEDBACK_SET', value: { ...fullLocalPlan().feedback, extra: true } },
  ];
  for (const action of nested) assert.equal(reduce(draft, action), draft, action.type);
  for (const action of [
    { type: 'SCHEDULE_EVENT_UPDATE', instanceId: 'local:schedule:1', field: 'other', value: '' }, { type: 'ACCESS_UPDATE', instanceId: 'local:access:1', field: 'other', value: '' },
    { type: 'CONTACT_UPDATE', instanceId: 'local:contact:1', field: 'other', value: '' }, { type: 'CHECKLIST_UPDATE', instanceId: 'local:checklist:1', field: 'other', value: '' },
    { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'other', value: '' }, { type: 'LOCAL_CATEGORY_CLEAR', category: 'other' },
    { type: 'SET_AFFIRMATION', name: 'previewsReviewed', value: true },
  ]) assert.equal(reduce(draft, action), draft, action.type);
});

test('semantic local no-ops preserve pending sequences, receipts, and affirmations byte-for-byte', () => {
  const transactions = fn('fdCuratorImportTransactions')(); transactions.begin(); transactions.beginPreview(); transactions.beginGeneration();
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  draft.previewReceipts = { desktop: { keep: 'desktop' }, mobile: { keep: 'mobile' } };
  draft.affirmations = { publicSafe: true, officialLinks: true, previewsReviewed: true, forwardable: true };
  const before = canonical(draft), sequences = [transactions.current(), transactions.currentPreview(), transactions.currentGeneration()];
  const next = reduce(draft, { type: 'ARRIVAL_SET', value: fullLocalPlan().arrival }, transactions);
  assert.equal(next, draft); assert.equal(canonical(next), before);
  assert.deepEqual([transactions.current(), transactions.currentPreview(), transactions.currentGeneration()], sequences);
});

test('collection limits and the combined generated checklist ceiling fail closed', () => {
  let draft = completedDraft();
  for (let i = 0; i < 12; i += 1) draft = reduce(draft, { type: 'ACCESS_ADD', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint') });
  assert.equal(draft.config.localPlan.accessItems.length, 12); assert.equal(reduce(draft, { type: 'ACCESS_ADD', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint') }), draft);
  draft = reduce(draft, { type: 'ARRIVAL_SET', value: fullLocalPlan().arrival });
  for (let i = 0; i < 11; i += 1) draft = reduce(draft, { type: 'CHECKLIST_ADD', itemKey: choiceKey('checklist'), priority: 'optional' });
  assert.equal(draft.config.localPlan.checklistItems.length, 11); assert.equal(reduce(draft, { type: 'CHECKLIST_ADD', itemKey: choiceKey('checklist'), priority: 'optional' }), draft);
});

test('coverage uses only the five frozen advisory predicates', () => {
  assert.deepEqual(fn('fdCuratorLocalCoverage')({}), { where: false, when: false, prepare: false, help: false, first: false });
  assert.deepEqual(fn('fdCuratorLocalCoverage')({ arrival: { timingCode: 'by', time: '07:45', placeKey: 'x', checkInRoleKey: 'x' }, accessItems: [{}], contacts: [{}], schedule: { events: [{}] } }),
    { where: true, when: true, prepare: true, help: true, first: true });
});

test('each coverage predicate is independent and missing coverage remains candidate-valid advisory evidence', async () => {
  const plans = {
    where: { arrival: { placeKey: 'x' } }, when: { arrival: { timingCode: 'by', time: '07:45' } },
    prepare: { accessItems: [{}] }, help: { contacts: [{}] }, first: { checklistItems: [{}] },
  };
  for (const [name, plan] of Object.entries(plans)) {
    const result = fn('fdCuratorLocalCoverage')(plan);
    assert.equal(result[name], true, name);
    assert.equal(Object.values(result).filter(Boolean).length, 1, name);
  }
  const candidate = await fn('fdCuratorCandidateConfig')(completedDraft(), index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  assert.equal(candidate.ok, true); assert.deepEqual(fn('fdCuratorLocalCoverage')({}), { where: false, when: false, prepare: false, help: false, first: false });
});

test('candidate is async and exact, preserves identity on drift, and increments genuine curation once', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' }); const validation = { mode: 'builder', generationDate: '2026-08-19' };
  const initial = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.deepEqual(Object.keys(initial), ['ok', 'config', 'envelopePreimage', 'contentDigest', 'referenceSetDigest', 'fingerprint', 'displayModel', 'errors']);
  assert.equal(initial.ok, true); assert.equal(initial.config.editionNumber, 1); assert.deepEqual(initial.envelopePreimage, { format: 'cw-rotation-edition', schemaVersion: 2, config: initial.config });
  assert.equal(initial.contentDigest, await digest(initial.envelopePreimage));
  const oldConfig = structuredClone(initial.config); oldConfig.createdAgainstCoreRevision = OLD_CORE_REVISION; oldConfig.createdAgainstLocalCatalogRevision = OLD_CATALOG_REVISION;
  const base = await fn('fdEditionCreateEnvelope')(oldConfig, index(), SNAPSHOT, contractContext(), validation, webcrypto.subtle); assert.equal(base.ok, true);
  draft.publication.baseEnvelope = base.envelope; draft.publication.baseSemanticConfig = canonical(oldConfig);
  const drift = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.deepEqual(drift.config, oldConfig); assert.equal(drift.contentDigest, base.contentDigest); assert.equal(drift.fingerprint, base.fingerprint);
  const changed = reduce(draft, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' });
  const candidate = await fn('fdCuratorCandidateConfig')(changed, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(candidate.config.editionNumber, 2); assert.equal(candidate.config.createdAgainstCoreRevision, CORE_REVISION); assert.equal(candidate.config.createdAgainstLocalCatalogRevision, CATALOG_REVISION);
  assert.deepEqual(candidate.config.changeSummary, { kindCodes: ['resources'], changedItemCount: 1 });
});

test('desktop and mobile receipts are independently branded, exact, stale-safe, and derived', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const transactions = fn('fdCuratorImportTransactions')(), validation = { mode: 'builder', generationDate: '2026-08-19' };
  const expectedCandidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  let sequence = transactions.beginPreview(); const desktop = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
  assert.equal(desktop.ok, true); assert.equal(reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: { ...desktop }, sequence }, transactions), draft);
  draft = reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: desktop, sequence }, transactions);
  assert.deepEqual(Object.keys(draft.previewReceipts.desktop), ['contentDigest', 'referenceSetDigest', 'currentCoreRevision', 'currentCatalogRevision', 'rendererRevision', 'previewPreset']);
  assert.deepEqual(draft.previewReceipts.desktop, {
    contentDigest: expectedCandidate.contentDigest, referenceSetDigest: expectedCandidate.referenceSetDigest,
    currentCoreRevision: CORE_REVISION, currentCatalogRevision: CATALOG_REVISION,
    rendererRevision: 'rotation-edition-v2-r1', previewPreset: 'desktop',
  });
  assert.equal(draft.previewReceipts.mobile, null); assert.equal(draft.affirmations.previewsReviewed, false);
  sequence = transactions.beginPreview(); const staleMobile = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'mobile-390', sequence);
  const freshSequence = transactions.beginPreview(); assert.equal(reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'mobile-390', result: staleMobile, sequence }, transactions), draft);
  const mobile = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'mobile-390', freshSequence);
  draft = reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'mobile-390', result: mobile, sequence: freshSequence }, transactions);
  assert.equal(draft.affirmations.previewsReviewed, true); draft = reduce(draft, { type: 'SET_AFFIRMATION', name: 'publicSafe', value: true }, transactions);
  assert.equal(draft.affirmations.publicSafe, true); assert.equal(draft.affirmations.previewsReviewed, true);
  const edited = reduce(draft, { type: 'CHECKLIST_UPDATE', instanceId: 'local:checklist:1', field: 'priority', value: 'required' }, transactions);
  assert.deepEqual(edited.previewReceipts, { desktop: null, mobile: null }); assert.equal(edited.affirmations.previewsReviewed, false);
});

test('revision observation clears receipts but preserves exact base edition identity', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  draft.publication.baseEnvelope = { ...candidate.envelopePreimage, digest: candidate.contentDigest }; draft.publication.baseSemanticConfig = canonical(candidate.config);
  draft.site.coreRevision = OLD_CORE_REVISION; draft.site.localCatalogRevision = OLD_CATALOG_REVISION;
  draft.previewReceipts = { desktop: { contentDigest: 'old' }, mobile: { contentDigest: 'old' } }; draft.affirmations.previewsReviewed = true;
  for (const site of [context(CORE_REVISION, OLD_CATALOG_REVISION), context(OLD_CORE_REVISION, CATALOG_REVISION), context()]) {
    const observed = fn('fdCuratorObserveCurrentSite')(draft, index(), site); assert.equal(observed.publication.baseEnvelope.digest, candidate.contentDigest);
    assert.equal(observed.publication.baseEnvelope.config.editionNumber, 1); assert.deepEqual(observed.previewReceipts, { desktop: null, mobile: null }); assert.equal(observed.affirmations.previewsReviewed, false);
  }
});

test('core-only, catalog-only, and combined drift preserve identity and two-mode recapture restores health', async () => {
  let original = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const validation = { mode: 'builder', generationDate: '2026-08-19' };
  const current = await fn('fdCuratorCandidateConfig')(original, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  const oldConfig = structuredClone(current.config); oldConfig.createdAgainstCoreRevision = OLD_CORE_REVISION; oldConfig.createdAgainstLocalCatalogRevision = OLD_CATALOG_REVISION;
  const base = await fn('fdEditionCreateEnvelope')(oldConfig, index(), SNAPSHOT, contractContext(), validation, webcrypto.subtle); assert.equal(base.ok, true);
  for (const [label, storedSite] of [
    ['core', context(OLD_CORE_REVISION, CATALOG_REVISION)], ['catalog', context(CORE_REVISION, OLD_CATALOG_REVISION)], ['combined', context(OLD_CORE_REVISION, OLD_CATALOG_REVISION)],
  ]) {
    let stored = structuredClone(original); stored.site.coreRevision = storedSite.coreRevision; stored.site.localCatalogRevision = storedSite.localCatalogRevision;
    stored.publication.baseEnvelope = structuredClone(base.envelope); stored.publication.baseSemanticConfig = canonical(oldConfig);
    stored.previewReceipts = { desktop: { stale: label }, mobile: { stale: label } }; stored.affirmations.previewsReviewed = true;
    let observed = fn('fdCuratorObserveCurrentSite')(stored, index(), context());
    assert.deepEqual(observed.previewReceipts, { desktop: null, mobile: null }, label); assert.equal(observed.affirmations.previewsReviewed, false, label);
    const candidate = await fn('fdCuratorCandidateConfig')(observed, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
    assert.equal(candidate.config.editionNumber, oldConfig.editionNumber, label); assert.equal(candidate.contentDigest, base.contentDigest, label); assert.equal(candidate.fingerprint, base.fingerprint, label);
    const transactions = fn('fdCuratorImportTransactions')();
    for (const preset of ['desktop', 'mobile-390']) {
      const sequence = transactions.beginPreview(); const result = await fn('fdCuratorPreparePreview')(observed, index(), SNAPSHOT, context(), validation, webcrypto.subtle, preset, sequence);
      observed = reduce(observed, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset, result, sequence }, transactions);
    }
    assert.equal(observed.affirmations.previewsReviewed, true, label);
  }
});

test('Step 4 markup has progressive groups, trusted sentences, coverage links, and no prose or URL authoring', async () => {
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  const markup = fn('fdCuratorLocalMarkup')(draft, SNAPSHOT, candidate.displayModel);
  assert.match(markup, /First-day essentials/); assert.match(markup, /How this rotation works/); assert.match(markup, /Students will see/);
  assert.match(markup, /Where do I go\?/); assert.match(markup, /What do I do first\?/); assert.match(markup, /Review desktop preview/); assert.match(markup, /Review 390 px mobile preview/);
  assert.doesNotMatch(markup, /<textarea|type=["']url["']|type=["']text["']|>\s*Other\s*</i);
});

test('generation completion accepts only its closure brand and live generation sequence', async () => {
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' }), transactions = fn('fdCuratorImportTransactions')(), sequence = transactions.beginGeneration();
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  const result = fn('fdCuratorPrepareGenerationResult')(candidate, sequence);
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result: { ...result }, sequence }, transactions), draft);
  let reads = 0; const accessor = { type: 'GENERATION_SUCCEEDED', sequence };
  Object.defineProperty(accessor, 'result', { enumerable: true, get() { reads += 1; return result; } });
  assert.equal(reduce(draft, accessor, transactions), draft); assert.equal(reads, 0);
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence: transactions.beginPreview() }, transactions), draft);
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence: transactions.begin() }, transactions), draft);
  transactions.beginGeneration();
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions), draft);
  const liveSequence = transactions.currentGeneration();
  const liveResult = fn('fdCuratorPrepareGenerationResult')(candidate, liveSequence);
  const applied = reduce(draft, { type: 'GENERATION_SUCCEEDED', result: liveResult, sequence: liveSequence }, transactions);
  assert.notEqual(applied, draft); assert.equal(applied.publication.lastGenerated.contentDigest, candidate.contentDigest);
});
