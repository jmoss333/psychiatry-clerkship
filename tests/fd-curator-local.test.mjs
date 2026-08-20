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
  readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.js', import.meta.url), 'utf8'),
  readFileSync(new URL(`${BUILD}/fd_edition_catalog.js`, import.meta.url), 'utf8').replace('__FD_CATALOG_EXPECTED_REVISION__', CATALOG_REVISION),
  ...['fd_edition_contract.js', 'fd_edition_project.js', 'fd_curator.js'].map((name) => readFileSync(new URL(`${BUILD}/${name}`, import.meta.url), 'utf8')),
].join('\n');
const CURATOR_HTML = readFileSync(new URL('../13_Faculty_Resources/Rotation_Curation/rotation-curator.html', import.meta.url), 'utf8');
const API_NAMES = [
  'fdEditionCatalogSnapshot', 'fdEditionCatalogMatchesSite', 'fdEditionCatalogSiteSnapshot', 'fdEditionPublicationEnabled', 'fdEditionCreateEnvelope', 'fdCuratorNewDraft', 'fdCuratorReduce',
  'fdCuratorImportTransactions', 'fdCuratorCandidateConfig', 'fdCuratorPreparePreview',
  'fdCuratorPreviewMarkup', 'fdCuratorCompletePreview', 'fdCuratorRestoreDraft',
  'fdCuratorImportBackup',
  'fdCuratorBuildShare', 'fdCuratorLocalCoverage', 'fdCuratorLocalMarkup',
  'fdCuratorCurriculumMarkup',
  'fdCuratorObserveCurrentSite', 'fdCuratorCatalogOptions', 'fdCuratorApplyAction',
  'fdCuratorMount',
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
function context(coreRevision = CORE_REVISION, localCatalogRevision = CATALOG_REVISION, rotationEditionV2 = 'enabled') {
  return { audience: 'ms3', pathId: 'ms3-six-week', coreRevision, localCatalogRevision, rotationEditionV2 };
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
function residentContext(rotationEditionV2 = 'enabled') {
  return { audience: 'resident', pathId: 'resident-four-week', coreRevision: CORE_REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2 };
}
function residentIndex() {
  const value = index();
  return { ...value, path: { id: 'resident-four-week', weekCount: 4 }, weeks: value.weeks.slice(0, 4) };
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function semanticConfig(config) {
  const value = structuredClone(config);
  delete value.editionNumber; delete value.changeSummary;
  delete value.createdAgainstCoreRevision; delete value.createdAgainstLocalCatalogRevision;
  return canonical(value);
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
async function makeSnapshot(gate = 'enabled', includeRecords = true, audience = 'ms3') {
  const common = { audiences: [audience], verifiedOn: '2026-08-19' }, scoped = { locationKeys: ['location.example@v1'], ...common };
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
  records.push({ key: 'choice.presentation-element-two@v1', kind: 'choice', choiceKind: 'presentationElement', label: 'presentation element two', fragment: 'next steps', ...scoped });
  for (const [name, purposeCode] of [['arrival', 'arrival-map'], ['documentation', 'documentation-policy'], ['attendance', 'attendance-policy'], ['access', 'access-training'], ['parking', 'parking-transit'], ['operational', 'reviewed-operational'], ['directory', 'directory'], ['orientation', 'orientation'], ['feedback', 'feedback-policy'], ['clinical', 'official-clinical-policy']]) {
    records.push({ key: `link.${name}@v1`, kind: 'officialLink', title: `${name} link`, url: `https://example.edu/${name}`, visibleHostname: 'example.edu', purposeCode, ...scoped });
  }
  records.push({ key: 'link.other-location@v1', kind: 'officialLink', title: 'Other location link', url: 'https://other.example.edu/other', visibleHostname: 'other.example.edu', purposeCode: 'orientation', locationKeys: ['location.other@v1'], ...common });
  records.push({ key: 'link.deprecated@v1', kind: 'officialLink', title: 'Deprecated link', url: 'https://example.edu/deprecated', visibleHostname: 'example.edu', purposeCode: 'orientation', ...scoped });
  const resolutionRecords = await Promise.all(records.map(async (record) => ({ ...record, contentDigest: await digest(record) })));
  resolutionRecords.sort((a, b) => a.key.localeCompare(b.key));
  const selected = resolutionRecords.filter((record) => record.key !== 'link.deprecated@v1');
  const projection = { schemaVersion: 1, audience, revision: CATALOG_REVISION, projectionDigest: '', rotationEditionV2: gate, selectionKeys: includeRecords ? selected.map((record) => record.key) : [], resolutionRecords: includeRecords ? resolutionRecords : [], blockedKeys: includeRecords ? ['link.blocked@v1'] : [] };
  const bare = structuredClone(projection); delete bare.projectionDigest; projection.projectionDigest = await digest(bare);
  const prepared = await fn('fdEditionCatalogSnapshot')(projection, audience, webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared)); return prepared.snapshot;
}
const SNAPSHOT = await makeSnapshot();
const DISABLED_SNAPSHOT = await makeSnapshot('disabled');
const EMPTY_DISABLED_SNAPSHOT = await makeSnapshot('disabled', false);
const RESIDENT_SNAPSHOT = await makeSnapshot('enabled', true, 'resident');
const RESIDENT_DISABLED_SNAPSHOT = await makeSnapshot('disabled', true, 'resident');
const RESIDENT_EMPTY_DISABLED_SNAPSHOT = await makeSnapshot('disabled', false, 'resident');
const CURATOR_LOCATION = { protocol: 'https:', host: 'clerkship.example', origin: 'https://clerkship.example', pathname: '/tools/rotation-curator.html', search: '', hash: '' };
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
async function preparePublication(draft, validation = { mode: 'builder', generationDate: '2026-08-19' }, site = context(), snapshot = SNAPSHOT, generationSequence = 1) {
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), snapshot, site, validation, webcrypto.subtle);
  assert.equal(candidate.ok, true, JSON.stringify(candidate));
  const receipt = { contentDigest: candidate.contentDigest, referenceSetDigest: candidate.referenceSetDigest,
    currentCoreRevision: site.coreRevision, currentCatalogRevision: site.localCatalogRevision,
    rendererRevision: 'rotation-edition-v2-r1' };
  draft.previewReceipts = { desktop: { ...receipt, previewPreset: 'desktop' }, mobile: { ...receipt, previewPreset: 'mobile-390' } };
  draft.affirmations = { publicSafe: true, officialLinks: true, previewsReviewed: true, forwardable: true };
  const generated = await fn('fdCuratorBuildShare')(draft, index(), snapshot, site, validation, webcrypto.subtle, CURATOR_LOCATION, generationSequence);
  assert.equal(generated.ok, true, JSON.stringify(generated));
  return { candidate, generated };
}
const PREVIEW_ORDER = ['First day at the location', 'Before you arrive', 'Who to contact', "Today's checklist", 'Typical day', 'Team workflow', 'Attendance and feedback', 'Official resources'];
function completePreview(prepared, candidate, preset, sequence, transactions, options = {}) {
  const markup = options.markup ?? fn('fdCuratorPreviewMarkup')(prepared, preset);
  const attributes = Object.fromEntries([...markup.matchAll(/\s(data-curator-[a-z-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
  if (options.attributes) Object.assign(attributes, options.attributes);
  const bodyMatch = markup.match(/^<div[^>]*>([\s\S]*)<\/div>$/);
  const body = options.body ?? (bodyMatch ? bodyMatch[1] : '');
  const node = {
    isConnected: options.connected !== false,
    getAttribute(name) { if (options.throwRead) throw new Error('private render read'); return attributes[name] ?? null; },
    querySelectorAll(selector) { return selector === 'h4' ? PREVIEW_ORDER.map((textContent) => ({ textContent })) : []; },
  };
  Object.defineProperty(node, 'innerHTML', { enumerable: true, get() { if (options.throwBodyRead) throw new Error('private body read'); return body; } });
  const replacement = {
    isConnected: node.isConnected,
    getAttribute: node.getAttribute,
    querySelectorAll: node.querySelectorAll,
  };
  Object.defineProperty(replacement, 'innerHTML', { enumerable: true, get() { return body; } });
  let queries = 0;
  const root = {
    querySelector() { queries += 1; if (options.throwQuery) throw new Error('private render query'); return options.replaced && queries > 1 ? replacement : node; },
    querySelectorAll() { if (options.throwQuery) throw new Error('private render query'); return options.duplicate ? [node, replacement] : [node]; },
    contains(value) { return options.contained !== false && value === node; },
  };
  return fn('fdCuratorCompletePreview')(prepared, root, preset, sequence, transactions);
}

async function importEnvelope(envelope, startingDraft = fn('fdCuratorNewDraft')(index(), context())) {
  const validation = { mode: 'builder', generationDate: '2026-08-19' };
  const transactions = fn('fdCuratorImportTransactions')();
  const sequence = transactions.begin();
  const imported = await fn('fdCuratorImportBackup')(JSON.stringify(envelope), index(), context(), SNAPSHOT, validation, webcrypto.subtle, sequence);
  assert.equal(imported.ok, true, JSON.stringify(imported));
  const applied = reduce(startingDraft, { type: 'IMPORT_SUCCEEDED', result: imported, sequence }, transactions);
  assert.notEqual(applied, startingDraft);
  return applied;
}

function replacePublicationWithDescriptorProxy(state, options = {}) {
  const publication = state.publication;
  const originalBase = publication.baseEnvelope;
  const target = {
    baseEnvelope: options.preserveBaseIdentity ? originalBase : structuredClone(originalBase),
    baseSemanticConfig: publication.baseSemanticConfig,
    lastGenerated: publication.lastGenerated,
  };
  const ledger = { ownKeys: 0, descriptors: 0, prototypes: 0, ordinaryGets: [] };
  const proxy = new Proxy(target, {
    getPrototypeOf(inner) {
      ledger.prototypes += 1;
      return Reflect.getPrototypeOf(inner);
    },
    ownKeys(inner) {
      ledger.ownKeys += 1;
      return Reflect.ownKeys(inner);
    },
    getOwnPropertyDescriptor(inner, key) {
      ledger.descriptors += 1;
      return Reflect.getOwnPropertyDescriptor(inner, key);
    },
    get(inner, key, receiver) {
      ledger.ordinaryGets.push(key);
      if (key === 'baseEnvelope') return originalBase;
      return Reflect.get(inner, key, receiver);
    },
  });
  state.publication = proxy;
  return { proxy, target, originalBase, ledger, ordinaryGets: ledger.ordinaryGets };
}

function replacePublicationWithAlternatingOwnKeysProxy(state) {
  const publication = state.publication;
  const target = {
    baseEnvelope: publication.baseEnvelope,
    baseSemanticConfig: publication.baseSemanticConfig,
    lastGenerated: publication.lastGenerated,
  };
  const ledger = { ownKeys: 0, descriptors: 0, prototypes: 0, ordinaryGets: [] };
  const proxy = new Proxy(target, {
    getPrototypeOf(inner) {
      ledger.prototypes += 1;
      return Reflect.getPrototypeOf(inner);
    },
    ownKeys(inner) {
      ledger.ownKeys += 1;
      const keys = Reflect.ownKeys(inner);
      return ledger.ownKeys === 1 ? [...keys, 'first-snapshot-only-extra'] : keys;
    },
    getOwnPropertyDescriptor(inner, key) {
      ledger.descriptors += 1;
      return Reflect.getOwnPropertyDescriptor(inner, key);
    },
    get(inner, key, receiver) {
      ledger.ordinaryGets.push(key);
      return Reflect.get(inner, key, receiver);
    },
  });
  state.publication = proxy;
  return { proxy, target, ledger };
}

function publicationSnapshotCounts(ledger) {
  return { ownKeys: ledger.ownKeys, descriptors: ledger.descriptors, prototypes: ledger.prototypes };
}

function assertOnePublicationSnapshot(ledger, before, label) {
  const after = publicationSnapshotCounts(ledger);
  assert.deepEqual({
    ownKeys: after.ownKeys - before.ownKeys,
    descriptors: after.descriptors - before.descriptors,
    prototypes: after.prototypes - before.prototypes,
  }, { ownKeys: 1, descriptors: 3, prototypes: 1 }, `${label} descriptor snapshot count`);
  assert.deepEqual(ledger.ordinaryGets, [], `${label} ordinary publication gets`);
}

function assertOneRejectedPublicationSnapshot(ledger, label) {
  assert.deepEqual(ledger, { ownKeys: 1, descriptors: 0, prototypes: 1, ordinaryGets: [] }, `${label} single rejected snapshot`);
}

function publicationLastGenerated(state) {
  const publication = Object.getOwnPropertyDescriptor(state, 'publication')?.value;
  return Object.getOwnPropertyDescriptor(publication, 'lastGenerated')?.value;
}

async function assertReimportRequired(state, validation, label, site = context(), checkGenerationArtifact = true, expectedReceipts = { desktop: null, mobile: null }) {
  const candidate = await fn('fdCuratorCandidateConfig')(state, index(), SNAPSHOT, site, validation, webcrypto.subtle);
  assert.equal(candidate.ok, false, label);
  assert.equal(candidate.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED', label);
  assert.deepEqual(state.previewReceipts, expectedReceipts, `${label} receipts`);
  if (checkGenerationArtifact) assert.equal(publicationLastGenerated(state), null, `${label} generation artifact`);
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

test('access and resource actions accept exactly every eligible reviewed official-link purpose', () => {
  const accessLinks = ['link.access@v1', 'link.operational@v1', 'link.parking@v1'];
  const allLinks = ['link.access@v1', 'link.arrival@v1', 'link.attendance@v1', 'link.clinical@v1', 'link.directory@v1', 'link.documentation@v1', 'link.feedback@v1', 'link.operational@v1', 'link.orientation@v1', 'link.parking@v1'];
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'link:access', 'location.example@v1', 'ms3').map((row) => row.key), accessLinks);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'link:any', 'location.example@v1', 'ms3').map((row) => row.key), allLinks);
  for (const linkKey of accessLinks) {
    const draft = completedDraft();
    const next = reduce(draft, { type: 'ACCESS_ADD', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint'), linkKey });
    assert.notEqual(next, draft, linkKey); assert.equal(next.config.localPlan.accessItems[0].linkKey, linkKey);
  }
  for (const linkKey of allLinks) {
    const draft = completedDraft();
    const next = reduce(draft, { type: 'RESOURCE_ADD', linkKey, priority: 'recommended', week: 1 });
    assert.notEqual(next, draft, linkKey); assert.equal(next.config.localPlan.resources[0].linkKey, linkKey);
  }
});

test('official-link selectors and actions exclude wrong kind, scope, audience, deprecated, and blocked records', () => {
  const draft = completedDraft();
  for (const linkKey of [choiceKey('role'), 'link.other-location@v1', 'link.deprecated@v1', 'link.blocked@v1']) {
    assert.equal(reduce(draft, { type: 'ACCESS_ADD', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint'), linkKey }), draft, `access ${linkKey}`);
    assert.equal(reduce(draft, { type: 'RESOURCE_ADD', linkKey, priority: 'recommended', week: 1 }), draft, `resource ${linkKey}`);
  }
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'link:access', 'location.example@v1', 'resident'), []);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'link:any', 'location.other@v1', 'ms3').map((row) => row.key), ['link.other-location@v1']);
});

test('official-link update paths and rendered selector sets match the exact reducer unions', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  let next = reduce(draft, { type: 'ACCESS_UPDATE', instanceId: 'local:access:1', field: 'linkKey', value: 'link.parking@v1' });
  assert.notEqual(next, draft); assert.equal(next.config.localPlan.accessItems[0].linkKey, 'link.parking@v1'); draft = next;
  assert.equal(reduce(draft, { type: 'ACCESS_UPDATE', instanceId: 'local:access:1', field: 'linkKey', value: 'link.arrival@v1' }), draft, 'valid official link with non-access purpose');
  next = reduce(draft, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'linkKey', value: 'link.clinical@v1' });
  assert.notEqual(next, draft); assert.equal(next.config.localPlan.resources[0].linkKey, 'link.clinical@v1'); draft = next;
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  const markup = fn('fdCuratorLocalMarkup')(draft, SNAPSHOT, candidate.displayModel);
  const access = markup.match(/id="fd-curator-accessItems"[\s\S]*?<\/article>/)[0];
  const resources = markup.match(/id="fd-curator-resources"[\s\S]*?<\/article>/)[0];
  assert.deepEqual([...new Set([...access.matchAll(/<option value="(link\.[^"]+)"/g)].map((match) => match[1]))], ['link.access@v1', 'link.operational@v1', 'link.parking@v1']);
  assert.deepEqual([...new Set([...resources.matchAll(/<option value="(link\.[^"]+)"/g)].map((match) => match[1]))], ['link.access@v1', 'link.arrival@v1', 'link.attendance@v1', 'link.clinical@v1', 'link.directory@v1', 'link.documentation@v1', 'link.feedback@v1', 'link.operational@v1', 'link.orientation@v1', 'link.parking@v1']);
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
  draft = await importEnvelope(base.envelope);
  const drift = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.deepEqual(drift.config, oldConfig); assert.equal(drift.contentDigest, base.contentDigest); assert.equal(drift.fingerprint, base.fingerprint);
  const changed = reduce(draft, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' });
  const candidate = await fn('fdCuratorCandidateConfig')(changed, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(candidate.config.editionNumber, 2); assert.equal(candidate.config.createdAgainstCoreRevision, CORE_REVISION); assert.equal(candidate.config.createdAgainstLocalCatalogRevision, CATALOG_REVISION);
  assert.deepEqual(candidate.config.changeSummary, { kindCodes: ['resources'], changedItemCount: 1 });
});

async function persistedDraftWithBase() {
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const validation = { mode: 'builder', generationDate: '2026-08-19' };
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  draft.publication.baseEnvelope = { ...structuredClone(candidate.envelopePreimage), digest: candidate.contentDigest };
  draft.publication.baseSemanticConfig = semanticConfig(candidate.config);
  const receipt = {
    contentDigest: candidate.contentDigest, referenceSetDigest: candidate.referenceSetDigest,
    currentCoreRevision: CORE_REVISION, currentCatalogRevision: CATALOG_REVISION,
    rendererRevision: 'rotation-edition-v2-r1', previewPreset: 'desktop',
  };
  draft.previewReceipts = { desktop: receipt, mobile: { ...receipt, previewPreset: 'mobile-390' } };
  draft.affirmations.previewsReviewed = true;
  return { draft, candidate, validation };
}

test('persisted prior lineage loses authority and requires explicit current-session re-import', async () => {
  const { draft, candidate, validation } = await persistedDraftWithBase();
  draft.publication.lastGenerated = { contentDigest: candidate.contentDigest, referenceSetDigest: candidate.referenceSetDigest, fingerprint: candidate.fingerprint };
  const valid = await fn('fdCuratorRestoreDraft')(JSON.stringify(draft), index(), context(), SNAPSHOT, validation, webcrypto.subtle);
  assert.equal(valid.ok, true); assert.equal(valid.code, 'CURATOR_BASE_REIMPORT_REQUIRED');
  assert.deepEqual(valid.state.publication.baseEnvelope, draft.publication.baseEnvelope);
  assert.deepEqual(valid.state.previewReceipts, { desktop: null, mobile: null });
  assert.equal(valid.state.affirmations.previewsReviewed, false);
  assert.equal(valid.state.publication.lastGenerated, null);
  const blocked = await fn('fdCuratorCandidateConfig')(valid.state, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(blocked.ok, false); assert.equal(blocked.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED');
  const transactions = fn('fdCuratorImportTransactions')(), sequence = transactions.beginPreview();
  const preview = await fn('fdCuratorPreparePreview')(valid.state, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
  assert.deepEqual(preview, { ok: false, code: 'CURATOR_BASE_REIMPORT_REQUIRED' });

  const intended = await importEnvelope(draft.publication.baseEnvelope, valid.state);
  assert.equal(canonical(intended.config), canonical(valid.state.config));
  const intendedCandidate = await fn('fdCuratorCandidateConfig')(intended, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(intendedCandidate.ok, true); assert.equal(intendedCandidate.contentDigest, candidate.contentDigest);

  const coherent = structuredClone(draft);
  coherent.publication.baseEnvelope.config.editionNumber = 2;
  coherent.publication.baseEnvelope.config.changeSummary = { kindCodes: ['resources'], changedItemCount: 1 };
  coherent.publication.baseEnvelope.config.createdAgainstCoreRevision = OLD_CORE_REVISION;
  coherent.publication.baseEnvelope.config.createdAgainstLocalCatalogRevision = OLD_CATALOG_REVISION;
  coherent.publication.baseEnvelope.digest = await digest({ format: coherent.publication.baseEnvelope.format, schemaVersion: coherent.publication.baseEnvelope.schemaVersion, config: coherent.publication.baseEnvelope.config });
  coherent.publication.baseSemanticConfig = semanticConfig(coherent.publication.baseEnvelope.config);
  coherent.config.localPlan.resources[0].priority = 'required';
  const coherentRestore = await fn('fdCuratorRestoreDraft')(JSON.stringify(coherent), index(), context(), SNAPSHOT, validation, webcrypto.subtle);
  assert.equal(coherentRestore.ok, true); assert.equal(coherentRestore.code, 'CURATOR_BASE_REIMPORT_REQUIRED');
  const coherentCandidate = await fn('fdCuratorCandidateConfig')(coherentRestore.state, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(coherentCandidate.ok, false); assert.equal(coherentCandidate.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED');
  const coherentSemantic = canonical(coherentRestore.state.config);
  const reconfirmed = await importEnvelope(draft.publication.baseEnvelope, coherentRestore.state);
  assert.equal(canonical(reconfirmed.config), coherentSemantic);
  const reconfirmedCandidate = await fn('fdCuratorCandidateConfig')(reconfirmed, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(reconfirmedCandidate.ok, true); assert.equal(reconfirmedCandidate.config.editionNumber, 2);
  assert.deepEqual(reconfirmedCandidate.config.changeSummary, { kindCodes: ['resources'], changedItemCount: 1 });
  assert.equal(reconfirmedCandidate.config.createdAgainstCoreRevision, CORE_REVISION);
  assert.equal(reconfirmedCandidate.config.createdAgainstLocalCatalogRevision, CATALOG_REVISION);
  const alternate = await importEnvelope(coherent.publication.baseEnvelope);
  const alternateCandidate = await fn('fdCuratorCandidateConfig')(alternate, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(alternateCandidate.ok, true); assert.equal(alternateCandidate.config.editionNumber, 2); assert.equal(alternateCandidate.contentDigest, coherent.publication.baseEnvelope.digest);

  let reads = 0; const accessor = {}; Object.defineProperty(accessor, 'publication', { enumerable: true, get() { reads += 1; return draft.publication; } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  assert.deepEqual(await fn('fdCuratorRestoreDraft')(accessor, index(), context(), SNAPSHOT, validation, webcrypto.subtle), { ok: false, code: 'CURATOR_DRAFT_INVALID' });
  assert.deepEqual(await fn('fdCuratorRestoreDraft')(revoked.proxy, index(), context(), SNAPSHOT, validation, webcrypto.subtle), { ok: false, code: 'CURATOR_DRAFT_INVALID' });
  assert.equal(reads, 0);
});

test('a separately validated explicit v2 import remains usable as exact candidate lineage', async () => {
  const { draft, candidate, validation } = await persistedDraftWithBase();
  const transactions = fn('fdCuratorImportTransactions')(), sequence = transactions.begin();
  const imported = await fn('fdCuratorImportBackup')(JSON.stringify(draft.publication.baseEnvelope), index(), context(), SNAPSHOT, validation, webcrypto.subtle, sequence);
  assert.equal(imported.ok, true);
  const applied = reduce(fn('fdCuratorNewDraft')(index(), context()), { type: 'IMPORT_SUCCEEDED', result: imported, sequence }, transactions);
  const continued = await fn('fdCuratorCandidateConfig')(applied, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(continued.ok, true); assert.equal(continued.contentDigest, candidate.contentDigest); assert.equal(continued.fingerprint, candidate.fingerprint);
});

test('live imported lineage brand survives reducer edits but serialization and caller cloning lose authority', async () => {
  const { draft, validation } = await persistedDraftWithBase();
  let live = await importEnvelope(draft.publication.baseEnvelope);
  const exact = await fn('fdCuratorCandidateConfig')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(exact.ok, true); assert.equal(exact.config.editionNumber, 1);
  live = reduce(live, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' });
  const changed = await fn('fdCuratorCandidateConfig')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(changed.ok, true); assert.equal(changed.config.editionNumber, 2);
  for (const untrusted of [structuredClone(live), JSON.parse(JSON.stringify(live))]) {
    const result = await fn('fdCuratorCandidateConfig')(untrusted, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
    assert.equal(result.ok, false); assert.equal(result.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED');
    const edited = reduce(untrusted, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'optional' });
    assert.notEqual(edited, untrusted);
    const editedResult = await fn('fdCuratorCandidateConfig')(edited, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
    assert.equal(editedResult.ok, false); assert.equal(editedResult.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED');
  }
  const replaced = await importEnvelope(draft.publication.baseEnvelope);
  replaced.publication.baseEnvelope = structuredClone(replaced.publication.baseEnvelope);
  const replacementResult = await fn('fdCuratorCandidateConfig')(replaced, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(replacementResult.ok, false); assert.equal(replacementResult.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED');
});

test('lineage authority stays sealed across replacement, observation, clone, valid edit, and explicit re-import transitions', async () => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  async function candidateStatus(state, label, expectedOk, expectedEdition, site = context()) {
    const result = await fn('fdCuratorCandidateConfig')(state, index(), SNAPSHOT, site, validation, webcrypto.subtle);
    assert.equal(result.ok, expectedOk, label);
    if (expectedOk) assert.equal(result.config.editionNumber, expectedEdition, label);
    else assert.equal(result.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED', label);
    return result;
  }

  let replaced = await importEnvelope(persisted.publication.baseEnvelope);
  await candidateStatus(replaced, 'import', true, 1);
  replaced.publication.baseEnvelope = structuredClone(replaced.publication.baseEnvelope);
  await candidateStatus(replaced, 'import -> replace', false);
  const replacementStep = reduce(replaced, { type: 'SET_STEP', step: 2 });
  assert.notEqual(replacementStep, replaced);
  await candidateStatus(replacementStep, 'import -> replace -> nonsemantic step clone', false);
  const replacementAffirmation = reduce(replaced, { type: 'SET_AFFIRMATION', name: 'publicSafe', value: true });
  assert.notEqual(replacementAffirmation, replaced);
  await candidateStatus(replacementAffirmation, 'import -> replace -> nonsemantic affirmation clone', false);
  const replacementEdit = reduce(replaced, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' });
  assert.notEqual(replacementEdit, replaced);
  await candidateStatus(replacementEdit, 'import -> replace -> edit', false);

  let observedSource = await importEnvelope(persisted.publication.baseEnvelope);
  observedSource.publication.baseEnvelope = structuredClone(observedSource.publication.baseEnvelope);
  observedSource.site.coreRevision = OLD_CORE_REVISION;
  await candidateStatus(observedSource, 'import -> replace before revision observation', false, undefined, context(OLD_CORE_REVISION));
  const observed = fn('fdCuratorObserveCurrentSite')(observedSource, index(), context());
  assert.notEqual(observed, observedSource);
  await candidateStatus(observed, 'import -> replace -> revision observe', false);

  for (const [label, clone] of [
    ['structured clone', structuredClone(await importEnvelope(persisted.publication.baseEnvelope))],
    ['JSON reparse', JSON.parse(JSON.stringify(await importEnvelope(persisted.publication.baseEnvelope)))],
  ]) {
    await candidateStatus(clone, `import -> ${label}`, false);
    const edit = reduce(clone, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' });
    assert.notEqual(edit, clone, label);
    await candidateStatus(edit, `import -> ${label} -> edit`, false);
  }

  const live = await importEnvelope(persisted.publication.baseEnvelope);
  const liveEdit = reduce(live, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' });
  await candidateStatus(liveEdit, 'import -> valid edit', true, 2);

  const restored = await fn('fdCuratorRestoreDraft')(JSON.stringify(persisted), index(), context(), SNAPSHOT, validation, webcrypto.subtle);
  assert.equal(restored.code, 'CURATOR_BASE_REIMPORT_REQUIRED');
  await candidateStatus(restored.state, 'persisted blocked', false);
  const reimported = await importEnvelope(persisted.publication.baseEnvelope, restored.state);
  await candidateStatus(reimported, 'persisted blocked -> explicit re-import', true, 1);
  const reimportedEdit = reduce(reimported, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' });
  await candidateStatus(reimportedEdit, 'persisted blocked -> explicit re-import -> edit', true, 2);
});

test('publication Proxy replacement cannot retain lineage through candidate or clone transitions', async (t) => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  const cases = [
    ['direct candidate', (live) => live],
    ['SET_STEP', (live) => reduce(live, { type: 'SET_STEP', step: 2 })],
    ['SET_AFFIRMATION', (live) => reduce(live, { type: 'SET_AFFIRMATION', name: 'publicSafe', value: true })],
    ['semantic resource edit through apply action', (live) => fn('fdCuratorApplyAction')(
      live,
      { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' },
      index(), context(), SNAPSHOT, '2026-08-19', fn('fdCuratorImportTransactions')(),
    ).state],
    ['revision observation', (live) => {
      live.site.coreRevision = OLD_CORE_REVISION;
      return fn('fdCuratorObserveCurrentSite')(live, index(), context());
    }],
  ];
  for (const [label, transition] of cases) await t.test(label, async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const exploit = replacePublicationWithDescriptorProxy(live);
    const transitioned = transition(live);
    assert.ok(transitioned, label);
    if (label !== 'direct candidate') assert.notEqual(transitioned, live, label);
    await assertReimportRequired(transitioned, validation, label);
    assert.deepEqual(exploit.ordinaryGets, [], `${label} ordinary publication gets`);
  });
});

test('publication object identity is required even when the exact trusted base object is retained', async () => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  const live = await importEnvelope(persisted.publication.baseEnvelope);
  const exploit = replacePublicationWithDescriptorProxy(live, { preserveBaseIdentity: true });
  assert.equal(Object.getOwnPropertyDescriptor(exploit.target, 'baseEnvelope').value, exploit.originalBase);
  const before = publicationSnapshotCounts(exploit.ledger);
  await assertReimportRequired(live, validation, 'publication-only replacement', context(), false);
  assert.equal(Object.getOwnPropertyDescriptor(exploit.target, 'lastGenerated').value, null);
  assertOnePublicationSnapshot(exploit.ledger, before, 'publication-only replacement');
});

test('each trust-sensitive operation takes one closed publication descriptor snapshot', async (t) => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  async function hostile(label, operation, setup = null) {
    await t.test(label, async () => {
      const live = await importEnvelope(persisted.publication.baseEnvelope);
      const prepared = setup ? await setup(live) : null;
      const exploit = replacePublicationWithDescriptorProxy(live);
      const before = publicationSnapshotCounts(exploit.ledger);
      await operation(live, prepared);
      assertOnePublicationSnapshot(exploit.ledger, before, label);
    });
  }
  await hostile('candidate', async (live) => {
    await assertReimportRequired(live, validation, 'candidate', context(), false);
  });
  await hostile('reduce', (live) => {
    const transitioned = reduce(live, { type: 'SET_STEP', step: 2 });
    assert.notEqual(transitioned, live);
  });
  await hostile('observe', (live) => {
    const observed = fn('fdCuratorObserveCurrentSite')(live, index(), context());
    assert.notEqual(observed, live);
  }, (live) => { live.site.coreRevision = OLD_CORE_REVISION; });
  await hostile('apply action', (live) => {
    const applied = fn('fdCuratorApplyAction')(
      live,
      { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' },
      index(), context(), SNAPSHOT, '2026-08-19', fn('fdCuratorImportTransactions')(),
    );
    assert.notEqual(applied.state, live);
  });
  await hostile('preview completion', (live, prepared) => {
    const transitioned = reduce(live, {
      type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: prepared.completion, sequence: prepared.sequence,
    }, prepared.transactions);
    assert.equal(transitioned, live);
  }, async (live) => {
    const transactions = fn('fdCuratorImportTransactions')();
    const candidate = await fn('fdCuratorCandidateConfig')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
    const sequence = transactions.beginPreview();
    const preview = await fn('fdCuratorPreparePreview')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
    return { transactions, sequence, completion: completePreview(preview, candidate, 'desktop', sequence, transactions) };
  });
  await hostile('generation completion', (live, prepared) => {
    const transitioned = reduce(live, {
      type: 'GENERATION_SUCCEEDED', result: prepared.generated, sequence: prepared.sequence,
    }, prepared.transactions);
    assert.equal(transitioned, live);
  }, async (live) => {
    const transactions = fn('fdCuratorImportTransactions')();
    const sequence = transactions.beginGeneration();
    const prepared = await preparePublication(live, validation, context(), SNAPSHOT, sequence);
    return { transactions, sequence, generated: prepared.generated };
  });
});

test('an invalid first publication snapshot is terminal for reduce, apply, and completion', async (t) => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  await t.test('reduce', async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const exploit = replacePublicationWithAlternatingOwnKeysProxy(live);
    const transitioned = reduce(live, { type: 'SET_STEP', step: 2 });
    assert.equal(transitioned, live);
    assertOneRejectedPublicationSnapshot(exploit.ledger, 'reduce');
  });
  await t.test('apply action', async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const exploit = replacePublicationWithAlternatingOwnKeysProxy(live);
    const applied = fn('fdCuratorApplyAction')(
      live,
      { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' },
      index(), context(), SNAPSHOT, '2026-08-19', fn('fdCuratorImportTransactions')(),
    );
    assert.deepEqual(applied, { state: live, changed: false, semanticChanged: false });
    assertOneRejectedPublicationSnapshot(exploit.ledger, 'apply action');
  });
  await t.test('preview completion', async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const transactions = fn('fdCuratorImportTransactions')();
    const candidate = await fn('fdCuratorCandidateConfig')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
    const sequence = transactions.beginPreview();
    const preview = await fn('fdCuratorPreparePreview')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
    const completion = completePreview(preview, candidate, 'desktop', sequence, transactions);
    assert.equal(completion.ok, true);
    const exploit = replacePublicationWithAlternatingOwnKeysProxy(live);
    const transitioned = reduce(live, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: completion, sequence }, transactions);
    assert.equal(transitioned, live);
    assert.deepEqual(live.previewReceipts, { desktop: null, mobile: null });
    assert.equal(Object.getOwnPropertyDescriptor(exploit.target, 'lastGenerated').value, null);
    assertOneRejectedPublicationSnapshot(exploit.ledger, 'preview completion');
  });
});

test('preview preparation rejects hostile publication identity without exposing an artifact', async () => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  const live = await importEnvelope(persisted.publication.baseEnvelope);
  const transactions = fn('fdCuratorImportTransactions')();
  const sequence = transactions.beginPreview();
  const exploit = replacePublicationWithDescriptorProxy(live);
  const before = publicationSnapshotCounts(exploit.ledger);
  const prepared = await fn('fdCuratorPreparePreview')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
  assert.deepEqual(prepared, { ok: false, code: 'CURATOR_BASE_REIMPORT_REQUIRED' });
  assert.equal('displayModel' in prepared, false);
  assert.equal('contentDigest' in prepared, false);
  assert.equal('fingerprint' in prepared, false);
  assertOnePublicationSnapshot(exploit.ledger, before, 'preview preparation');
});

test('untouched imported lineage survives non-semantic step and affirmation transitions', async () => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  let live = await importEnvelope(persisted.publication.baseEnvelope);
  const stepped = reduce(live, { type: 'SET_STEP', step: 2 });
  assert.notEqual(stepped, live);
  assert.equal(stepped.step, 2);
  let candidate = await fn('fdCuratorCandidateConfig')(stepped, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(candidate.ok, true);
  live = reduce(stepped, { type: 'SET_AFFIRMATION', name: 'publicSafe', value: true });
  assert.notEqual(live, stepped);
  assert.equal(live.affirmations.publicSafe, true);
  candidate = await fn('fdCuratorCandidateConfig')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(candidate.ok, true);
});

test('publication Proxy replacement cannot mint preview or generation completion artifacts', async (t) => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  await t.test('preview completion', async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const transactions = fn('fdCuratorImportTransactions')();
    const candidate = await fn('fdCuratorCandidateConfig')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
    const sequence = transactions.beginPreview();
    const prepared = await fn('fdCuratorPreparePreview')(live, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
    const completion = completePreview(prepared, candidate, 'desktop', sequence, transactions);
    assert.equal(completion.ok, true);
    const exploit = replacePublicationWithDescriptorProxy(live);
    const transitioned = reduce(live, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: completion, sequence }, transactions);
    assert.equal(transitioned, live);
    await assertReimportRequired(transitioned, validation, 'preview completion');
    assert.deepEqual(exploit.ordinaryGets, [], 'preview ordinary publication gets');
  });
  await t.test('generation completion', async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const transactions = fn('fdCuratorImportTransactions')();
    const sequence = transactions.beginGeneration();
    const generated = (await preparePublication(live, validation, context(), SNAPSHOT, sequence)).generated;
    const reviewedReceipts = structuredClone(live.previewReceipts);
    const exploit = replacePublicationWithDescriptorProxy(live);
    const transitioned = reduce(live, { type: 'GENERATION_SUCCEEDED', result: generated, sequence }, transactions);
    assert.equal(transitioned, live);
    await assertReimportRequired(transitioned, validation, 'generation completion', context(), true, reviewedReceipts);
    assert.deepEqual(exploit.ordinaryGets, [], 'generation ordinary publication gets');
  });
});

test('publication descriptor snapshots reject inconsistent and malformed replacements without ordinary reads', async (t) => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  await t.test('descriptor mutation during the one publication snapshot', async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const publication = live.publication;
    const originalBase = publication.baseEnvelope;
    const ledger = { ownKeys: 0, descriptors: 0, prototypes: 0, ordinaryGets: [] };
    live.publication = new Proxy(publication, {
      getPrototypeOf(target) { ledger.prototypes += 1; return Reflect.getPrototypeOf(target); },
      ownKeys(target) { ledger.ownKeys += 1; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) {
        ledger.descriptors += 1;
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (key === 'baseEnvelope') {
          target.baseSemanticConfig = `${target.baseSemanticConfig}#mutated`;
          return { ...descriptor, value: structuredClone(originalBase) };
        }
        return descriptor;
      },
      get(target, key, receiver) {
        ledger.ordinaryGets.push(key);
        if (key === 'baseEnvelope') return originalBase;
        return Reflect.get(target, key, receiver);
      },
    });
    await assertReimportRequired(live, validation, 'mutating descriptor publication', context(), false);
    assert.deepEqual(ledger, { ownKeys: 1, descriptors: 3, prototypes: 1, ordinaryGets: [] });
  });

  const malformed = [
    ['accessor', (publication, reads) => {
      const value = { baseSemanticConfig: publication.baseSemanticConfig, lastGenerated: null };
      Object.defineProperty(value, 'baseEnvelope', { enumerable: true, get() { reads.count += 1; return publication.baseEnvelope; } });
      return value;
    }],
    ['revoked', (publication) => {
      const target = {
        baseEnvelope: structuredClone(publication.baseEnvelope),
        baseSemanticConfig: publication.baseSemanticConfig,
        lastGenerated: null,
      };
      const value = Proxy.revocable(target, {});
      value.revoke();
      return { publication: value.proxy, artifactTarget: target };
    }],
    ['symbol', (publication) => ({ baseEnvelope: structuredClone(publication.baseEnvelope), baseSemanticConfig: publication.baseSemanticConfig, lastGenerated: null, [Symbol('extra')]: true })],
    ['extra key', (publication) => ({ baseEnvelope: structuredClone(publication.baseEnvelope), baseSemanticConfig: publication.baseSemanticConfig, lastGenerated: null, extra: true })],
    ['non-enumerable', (publication) => {
      const value = { baseSemanticConfig: publication.baseSemanticConfig, lastGenerated: null };
      Object.defineProperty(value, 'baseEnvelope', { enumerable: false, value: structuredClone(publication.baseEnvelope) });
      return value;
    }],
    ['exotic prototype', (publication) => Object.assign(Object.create({ inherited: true }), {
      baseEnvelope: structuredClone(publication.baseEnvelope), baseSemanticConfig: publication.baseSemanticConfig, lastGenerated: null,
    })],
  ];
  for (const [label, makePublication] of malformed) await t.test(label, async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const reads = { count: 0 };
    const made = makePublication(live.publication, reads);
    const artifactTarget = made && Object.hasOwn(made, 'artifactTarget') ? made.artifactTarget : null;
    live.publication = artifactTarget ? made.publication : made;
    await assertReimportRequired(live, validation, label, context(), false);
    if (artifactTarget) assert.equal(Object.getOwnPropertyDescriptor(artifactTarget, 'lastGenerated').value, null, `${label} generation artifact`);
    assert.equal(reads.count, 0, `${label} accessor reads`);
  });
});

test('publication shape validation rejects in-place mutation of the exact trusted object', async (t) => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  const cases = [
    ['extra key', (publication) => { publication.extra = true; }],
    ['symbol', (publication) => { publication[Symbol('extra')] = true; }],
    ['accessor base', (publication, reads) => {
      const base = publication.baseEnvelope;
      Object.defineProperty(publication, 'baseEnvelope', {
        configurable: true, enumerable: true,
        get() { reads.count += 1; return base; },
      });
    }],
    ['non-enumerable base', (publication) => {
      const base = publication.baseEnvelope;
      Object.defineProperty(publication, 'baseEnvelope', { configurable: true, enumerable: false, writable: true, value: base });
    }],
    ['exotic prototype', (publication) => { Object.setPrototypeOf(publication, { inherited: true }); }],
  ];
  for (const [label, mutate] of cases) await t.test(label, async () => {
    const live = await importEnvelope(persisted.publication.baseEnvelope);
    const publication = live.publication;
    const reads = { count: 0 };
    mutate(publication, reads);
    assert.equal(live.publication, publication, `${label} retained publication identity`);
    await assertReimportRequired(live, validation, `in-place ${label}`);
    assert.equal(reads.count, 0, `${label} accessor reads`);
  });
});

test('explicit re-import replaces hostile publication identity and retains semantic work', async () => {
  const { draft: persisted, validation } = await persistedDraftWithBase();
  let live = await importEnvelope(persisted.publication.baseEnvelope);
  live = reduce(live, { type: 'RESOURCE_UPDATE', instanceId: 'local:resource:1', field: 'priority', value: 'required' });
  const exploit = replacePublicationWithDescriptorProxy(live);
  await assertReimportRequired(live, validation, 'before explicit re-import');
  const recovered = await importEnvelope(exploit.originalBase, live);
  assert.equal(recovered.config.localPlan.resources[0].priority, 'required');
  const candidate = await fn('fdCuratorCandidateConfig')(recovered, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(candidate.ok, true); assert.equal(candidate.config.editionNumber, 2);
  assert.deepEqual(candidate.config.changeSummary, { kindCodes: ['resources'], changedItemCount: 1 });
  assert.deepEqual(exploit.ordinaryGets, [], 're-import ordinary publication gets');
});

test('candidate derivation rejects accessor and revoked base envelopes without touching private getters', async () => {
  const { draft, validation } = await persistedDraftWithBase(); let reads = 0;
  const accessorBase = { format: 'cw-rotation-edition', schemaVersion: 2, digest: draft.publication.baseEnvelope.digest };
  Object.defineProperty(accessorBase, 'config', { enumerable: true, get() { reads += 1; return draft.publication.baseEnvelope.config; } });
  const accessorDraft = structuredClone(draft); accessorDraft.publication.baseEnvelope = accessorBase;
  let result = await fn('fdCuratorCandidateConfig')(accessorDraft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(result.ok, false); assert.equal(result.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED'); assert.equal(reads, 0);
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); const revokedDraft = structuredClone(draft); revokedDraft.publication.baseEnvelope = revoked.proxy;
  result = await fn('fdCuratorCandidateConfig')(revokedDraft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  assert.equal(result.ok, false); assert.equal(result.errors[0].code, 'CURATOR_BASE_REIMPORT_REQUIRED');
});

test('persisted lineage mounts without rewrite, candidate, receipt, or artifact and shows fixed re-import status', async () => {
  const { draft } = await persistedDraftWithBase();
  draft.publication.lastGenerated = { contentDigest: `sha256-${'A'.repeat(43)}`, referenceSetDigest: `sha256-${'B'.repeat(43)}`, fingerprint: 'FORGED-MS3-ABCDEF' };
  const calls = [], editor = { innerHTML: '' }, status = { textContent: '' };
  const root = {
    querySelector(selector) { if (selector === '#curatorEditorMount') return editor; if (selector === '[data-curator-import-status]') return status; return null; },
    querySelectorAll() { return []; }, addEventListener(type) { calls.push(['listen', type]); },
  };
  const storage = { getItem(key) { calls.push(['get', key]); return JSON.stringify(draft); }, setItem(key) { calls.push(['set', key]); } };
  const app = await fn('fdCuratorMount')(root, index(), context(), SNAPSHOT, '2026-08-19', { storage, subtle: webcrypto.subtle });
  assert.equal(app.ok, true); assert.equal(status.textContent, 'CURATOR_BASE_REIMPORT_REQUIRED');
  assert.deepEqual(app.getState().publication.baseEnvelope, draft.publication.baseEnvelope);
  assert.deepEqual(app.getState().previewReceipts, { desktop: null, mobile: null });
  assert.equal(app.getState().affirmations.previewsReviewed, false);
  assert.equal(app.getState().publication.lastGenerated, null);
  assert.deepEqual(calls, [['get', 'cw_curator_draft_ms3_v2'], ['listen', 'click'], ['listen', 'change'], ['listen', 'input']]);
});

test('persisted no-base receipts are exact-current evidence and previewsReviewed is always derived', async () => {
  const { draft: withBase, validation } = await persistedDraftWithBase();
  const draft = structuredClone(withBase); draft.publication = { baseEnvelope: null, baseSemanticConfig: '', lastGenerated: null };
  const valid = await fn('fdCuratorRestoreDraft')(JSON.stringify(draft), index(), context(), SNAPSHOT, validation, webcrypto.subtle);
  assert.equal(valid.ok, true); assert.deepEqual(valid.state.previewReceipts, draft.previewReceipts); assert.equal(valid.state.affirmations.previewsReviewed, true);
  const storedFalse = structuredClone(draft); storedFalse.affirmations.previewsReviewed = false;
  const derivedTrue = await fn('fdCuratorRestoreDraft')(JSON.stringify(storedFalse), index(), context(), SNAPSHOT, validation, webcrypto.subtle);
  assert.equal(derivedTrue.ok, true); assert.equal(derivedTrue.state.affirmations.previewsReviewed, true);
  const invalidReceipts = [
    {},
    { ...draft.previewReceipts.desktop, extra: true },
    Object.fromEntries(Object.entries(draft.previewReceipts.desktop).filter(([key]) => key !== 'referenceSetDigest')),
    { ...draft.previewReceipts.desktop, contentDigest: `sha256-${'A'.repeat(43)}` },
    { ...draft.previewReceipts.desktop, referenceSetDigest: `sha256-${'A'.repeat(43)}` },
    { ...draft.previewReceipts.desktop, currentCoreRevision: OLD_CORE_REVISION },
    { ...draft.previewReceipts.desktop, currentCatalogRevision: OLD_CATALOG_REVISION },
    { ...draft.previewReceipts.desktop, rendererRevision: 'rotation-edition-v2-r0' },
    { ...draft.previewReceipts.desktop, previewPreset: 'mobile-390' },
  ];
  for (const [offset, receipt] of invalidReceipts.entries()) {
    const value = structuredClone(draft); value.previewReceipts.desktop = receipt; value.affirmations.previewsReviewed = offset % 2 === 0;
    const restored = await fn('fdCuratorRestoreDraft')(JSON.stringify(value), index(), context(), SNAPSHOT, validation, webcrypto.subtle);
    assert.equal(restored.ok, true, String(offset)); assert.equal(restored.state.previewReceipts.desktop, null, String(offset));
    assert.deepEqual(restored.state.previewReceipts.mobile, draft.previewReceipts.mobile, String(offset)); assert.equal(restored.state.affirmations.previewsReviewed, false, String(offset));
  }
  const forged = structuredClone(draft); forged.previewReceipts = { desktop: null, mobile: null }; forged.affirmations.previewsReviewed = true;
  const forgedResult = await fn('fdCuratorRestoreDraft')(JSON.stringify(forged), index(), context(), SNAPSHOT, validation, webcrypto.subtle);
  assert.equal(forgedResult.ok, true); assert.equal(forgedResult.state.affirmations.previewsReviewed, false);
  const drifted = structuredClone(draft); drifted.site.coreRevision = OLD_CORE_REVISION; drifted.site.localCatalogRevision = OLD_CATALOG_REVISION;
  drifted.previewReceipts.desktop.currentCoreRevision = OLD_CORE_REVISION; drifted.previewReceipts.desktop.currentCatalogRevision = OLD_CATALOG_REVISION;
  drifted.previewReceipts.mobile.currentCoreRevision = OLD_CORE_REVISION; drifted.previewReceipts.mobile.currentCatalogRevision = OLD_CATALOG_REVISION;
  const driftResult = await fn('fdCuratorRestoreDraft')(JSON.stringify(drifted), index(), context(), SNAPSHOT, validation, webcrypto.subtle);
  assert.equal(driftResult.ok, true); assert.deepEqual(driftResult.state.previewReceipts, { desktop: null, mobile: null }); assert.equal(driftResult.state.affirmations.previewsReviewed, false);
});

test('desktop and mobile receipts are independently branded, exact, stale-safe, and derived', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const transactions = fn('fdCuratorImportTransactions')(), validation = { mode: 'builder', generationDate: '2026-08-19' };
  const expectedCandidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  let sequence = transactions.beginPreview(); const desktop = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
  assert.equal(desktop.ok, true); assert.equal(reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: desktop, sequence }, transactions), draft, 'preparation is not review evidence');
  const desktopCompletion = completePreview(desktop, expectedCandidate, 'desktop', sequence, transactions);
  assert.equal(reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: { ...desktopCompletion }, sequence }, transactions), draft);
  draft = reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: desktopCompletion, sequence }, transactions);
  assert.deepEqual(Object.keys(draft.previewReceipts.desktop), ['contentDigest', 'referenceSetDigest', 'currentCoreRevision', 'currentCatalogRevision', 'rendererRevision', 'previewPreset']);
  assert.deepEqual(draft.previewReceipts.desktop, {
    contentDigest: expectedCandidate.contentDigest, referenceSetDigest: expectedCandidate.referenceSetDigest,
    currentCoreRevision: CORE_REVISION, currentCatalogRevision: CATALOG_REVISION,
    rendererRevision: 'rotation-edition-v2-r1', previewPreset: 'desktop',
  });
  assert.equal(draft.previewReceipts.mobile, null); assert.equal(draft.affirmations.previewsReviewed, false);
  sequence = transactions.beginPreview(); const staleMobile = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'mobile-390', sequence);
  const freshSequence = transactions.beginPreview(); assert.equal(completePreview(staleMobile, expectedCandidate, 'mobile-390', sequence, transactions).ok, false);
  const mobile = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'mobile-390', freshSequence);
  const mobileCompletion = completePreview(mobile, expectedCandidate, 'mobile-390', freshSequence, transactions);
  draft = reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'mobile-390', result: mobileCompletion, sequence: freshSequence }, transactions);
  assert.equal(draft.affirmations.previewsReviewed, true); draft = reduce(draft, { type: 'SET_AFFIRMATION', name: 'publicSafe', value: true }, transactions);
  assert.equal(draft.affirmations.publicSafe, true); assert.equal(draft.affirmations.previewsReviewed, true);
  const edited = reduce(draft, { type: 'CHECKLIST_UPDATE', instanceId: 'local:checklist:1', field: 'priority', value: 'required' }, transactions);
  assert.deepEqual(edited.previewReceipts, { desktop: null, mobile: null }); assert.equal(edited.affirmations.previewsReviewed, false);
});

test('preview markup and completion use only the private exact display body and fingerprint', async () => {
  const draftA = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const draftB = reduce(draftA, { type: 'CHECKLIST_UPDATE', instanceId: 'local:checklist:1', field: 'priority', value: 'required' });
  const transactions = fn('fdCuratorImportTransactions')(), validation = { mode: 'builder', generationDate: '2026-08-19' };
  const candidateA = await fn('fdCuratorCandidateConfig')(draftA, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  const sequence = transactions.beginPreview();
  const prepared = await fn('fdCuratorPreparePreview')(draftA, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
  const exactFingerprint = prepared.fingerprint;
  const renderedMarkup = fn('fdCuratorPreviewMarkup')(prepared, 'desktop');
  prepared.fingerprint = 'MUTATED-PUBLIC-FINGERPRINT';
  prepared.contentDigest = `sha256-${'A'.repeat(43)}`;
  prepared.displayModel.card.title = 'MUTATED PUBLIC MODEL';
  const markup = fn('fdCuratorPreviewMarkup')(prepared, 'desktop');
  assert.match(markup, new RegExp(`data-curator-fingerprint="${exactFingerprint}"`));
  assert.doesNotMatch(markup, /MUTATED-PUBLIC-FINGERPRINT|MUTATED PUBLIC MODEL/);
  assert.equal(fn('fdCuratorPreviewMarkup')(candidateA.displayModel, 'desktop'), '<div class="fd-curator-preview-empty">Complete the required reviewed selections to render this preview.</div>');
  const renderedCompletion = completePreview(prepared, candidateA, 'desktop', sequence, transactions, { markup: renderedMarkup });
  let reviewed = reduce(draftA, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: renderedCompletion, sequence }, transactions);
  assert.equal(reviewed.previewReceipts.desktop.contentDigest, candidateA.contentDigest);
  const failedSequence = transactions.beginPreview();
  const failedPrepared = await fn('fdCuratorPreparePreview')(reviewed, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', failedSequence);
  const failedCompletion = completePreview(failedPrepared, candidateA, 'desktop', failedSequence, transactions, { body: '<h3>mutated after capture</h3>' });
  assert.equal(reduce(reviewed, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: failedCompletion, sequence: failedSequence }, transactions), reviewed);
  assert.equal(reviewed.previewReceipts.desktop.contentDigest, candidateA.contentDigest);

  const otherSequence = transactions.beginPreview();
  const preparedB = await fn('fdCuratorPreparePreview')(draftB, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', otherSequence);
  assert.equal(fn('fdCuratorPreviewMarkup')(preparedB.displayModel, 'desktop', prepared), '<div class="fd-curator-preview-empty">Complete the required reviewed selections to render this preview.</div>');
  const crossBody = fn('fdCuratorPreviewMarkup')(preparedB, 'desktop').match(/^<div[^>]*>([\s\S]*)<\/div>$/)[1];
  const freshSequence = transactions.beginPreview();
  const fresh = await fn('fdCuratorPreparePreview')(draftA, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', freshSequence);
  assert.deepEqual(completePreview(fresh, candidateA, 'desktop', freshSequence, transactions, { body: crossBody }), { ok: false, code: 'CURATOR_PREVIEW_RENDER_INVALID' });
});

test('preview completion rejects detached, replaced, stale, wrong, throwing, or mutated canonical render evidence', async () => {
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const transactions = fn('fdCuratorImportTransactions')(), validation = { mode: 'builder', generationDate: '2026-08-19' };
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  const cases = [
    ['detached', { connected: false }], ['outside root', { contained: false }], ['replaced', { replaced: true }], ['duplicate', { duplicate: true }],
    ['query throw', { throwQuery: true }], ['read throw', { throwRead: true }], ['body read throw', { throwBodyRead: true }], ['body mismatch', { body: '<h3>replaced body</h3>' }],
    ['wrong digest', { attributes: { 'data-curator-content-digest': `sha256-${'A'.repeat(43)}` } }],
    ['wrong reference', { attributes: { 'data-curator-reference-digest': `sha256-${'A'.repeat(43)}` } }],
    ['wrong fingerprint', { attributes: { 'data-curator-fingerprint': 'BAD-BAD-BAD' } }],
    ['wrong core', { attributes: { 'data-curator-core-revision': OLD_CORE_REVISION } }],
    ['wrong catalog', { attributes: { 'data-curator-catalog-revision': OLD_CATALOG_REVISION } }],
    ['wrong renderer', { attributes: { 'data-curator-renderer-revision': 'rotation-edition-v2-r0' } }],
    ['failed render', { attributes: { 'data-curator-render-status': 'failed' } }],
  ];
  for (const [name, options] of cases) {
    const sequence = transactions.beginPreview();
    const prepared = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
    const completed = completePreview(prepared, candidate, 'desktop', sequence, transactions, options);
    assert.deepEqual(completed, { ok: false, code: 'CURATOR_PREVIEW_RENDER_INVALID' }, name);
    assert.equal(reduce(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: completed, sequence }, transactions), draft, name);
  }
  let sequence = transactions.beginPreview();
  let prepared = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', sequence);
  assert.deepEqual(completePreview(prepared, candidate, 'mobile-390', sequence, transactions), { ok: false, code: 'CURATOR_PREVIEW_RENDER_INVALID' });
  transactions.beginPreview();
  assert.deepEqual(completePreview(prepared, candidate, 'desktop', sequence, transactions), { ok: false, code: 'CURATOR_PREVIEW_RENDER_INVALID' });
});

test('revision observation clears receipts but preserves exact base edition identity', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  draft = await importEnvelope({ ...candidate.envelopePreimage, digest: candidate.contentDigest });
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
    let stored = await importEnvelope(base.envelope); stored.site.coreRevision = storedSite.coreRevision; stored.site.localCatalogRevision = storedSite.localCatalogRevision;
    stored.previewReceipts = { desktop: { stale: label }, mobile: { stale: label } }; stored.affirmations.previewsReviewed = true;
    let observed = fn('fdCuratorObserveCurrentSite')(stored, index(), context());
    assert.deepEqual(observed.previewReceipts, { desktop: null, mobile: null }, label); assert.equal(observed.affirmations.previewsReviewed, false, label);
    const candidate = await fn('fdCuratorCandidateConfig')(observed, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
    assert.equal(candidate.config.editionNumber, oldConfig.editionNumber, label); assert.equal(candidate.contentDigest, base.contentDigest, label); assert.equal(candidate.fingerprint, base.fingerprint, label);
    const transactions = fn('fdCuratorImportTransactions')();
    for (const preset of ['desktop', 'mobile-390']) {
      const sequence = transactions.beginPreview(); const result = await fn('fdCuratorPreparePreview')(observed, index(), SNAPSHOT, context(), validation, webcrypto.subtle, preset, sequence);
      const completion = completePreview(result, candidate, preset, sequence, transactions);
      observed = reduce(observed, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset, result: completion, sequence }, transactions);
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

test('Step 4 rerender binds every stored multi-select key and the saved schedule qualifier', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  draft = reduce(draft, { type: 'PRESENTATION_SET', value: {
    formatKey: choiceKey('presentationFormat'), timingKey: choiceKey('presentationTiming'),
    elementKeys: [choiceKey('presentationElement'), 'choice.presentation-element-two@v1'],
  } });
  draft = reduce(draft, { type: 'SCHEDULE_SET_BOUNDS', dayStart: '07:45', dayEnd: '17:00', endQualifierCode: 'no-later-than' });
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  const markup = fn('fdCuratorLocalMarkup')(draft, SNAPSHOT, candidate.displayModel);
  assert.match(markup, /<option value="choice\.presentation-element@v1" selected>/);
  assert.match(markup, /<option value="choice\.presentation-element-two@v1" selected>/);
  assert.match(markup, /<option value="no-later-than" selected>No later than<\/option>/);
  assert.equal(draft.config.localPlan.presentation.elementKeys.length, 2);
  assert.equal(draft.config.localPlan.schedule.endQualifierCode, 'no-later-than');
});

test('every saved repeatable row renders complete accessible field-bound UPDATE controls', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  for (const action of [
    { type: 'ACCESS_ADD', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint') },
    { type: 'CONTACT_ADD', roleKey: choiceKey('role') },
    { type: 'CHECKLIST_ADD', itemKey: choiceKey('checklist'), priority: 'optional' },
    { type: 'RESOURCE_ADD', linkKey: 'link.clinical@v1', priority: 'optional', week: 2 },
  ]) draft = reduce(draft, action);
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  const markup = fn('fdCuratorLocalMarkup')(draft, SNAPSHOT, candidate.displayModel);
  function rowEditors(category) {
    return [...markup.matchAll(new RegExp(`<fieldset[^>]*data-curator-row-editor="${category}"[\\s\\S]*?<\\/fieldset>`, 'g'))].map((match) => match[0]);
  }
  const expected = {
    SCHEDULE_EVENT_UPDATE: ['daySetKey', 'startTime', 'endTime', 'activityKey', 'placeKey', 'priority'],
    ACCESS_UPDATE: ['itemKey', 'dueKey', 'linkKey'],
    CONTACT_UPDATE: ['roleKey', 'linkKey'],
    CHECKLIST_UPDATE: ['itemKey', 'priority'],
    RESOURCE_UPDATE: ['linkKey', 'priority', 'week', 'reasonKey'],
  };
  const labels = {
    daySetKey: 'day set', startTime: 'start time', endTime: 'end time', activityKey: 'activity', placeKey: 'place', priority: 'priority',
    itemKey: 'action|access item', dueKey: 'due point', linkKey: 'official link|directory|official resource', roleKey: 'public role', week: 'week', reasonKey: 'reason',
  };
  for (const [action, fields] of Object.entries(expected)) {
    for (const field of fields) {
      assert.match(markup, new RegExp(`data-curator-row-update="${action}"[^>]*data-curator-update-field="${field}"[^>]*aria-label="[^"]+(?:${labels[field]})`, 'i'), `${action}.${field}`);
    }
  }
  const [scheduleOne, scheduleTwo] = rowEditors('schedule');
  assert.match(scheduleOne, /data-curator-update-field="startTime"[^>]*value="08:30"/);
  assert.match(scheduleOne, /data-curator-update-field="endTime"[^>]*value="09:30"/);
  assert.match(scheduleOne, /<option value="place\.workroom@v1" selected>/);
  assert.match(scheduleOne, /<option value="required" selected>/);
  const [access, accessTwo] = rowEditors('accessItems');
  assert.match(access, /<option value="choice\.access-item@v1" selected>/);
  assert.match(access, /<option value="choice\.due-point@v1" selected>/);
  assert.match(access, /<option value="link\.access@v1" selected>/);
  const [resource, resourceTwo] = rowEditors('resources');
  assert.match(resource, /data-curator-update-field="week"[^>]*value="1"/);
  assert.match(resource, /<option value="choice\.reason@v1" selected>/);
  for (const [action, rowCount] of Object.entries({ SCHEDULE_EVENT_UPDATE: 2, ACCESS_UPDATE: 2, CONTACT_UPDATE: 2, CHECKLIST_UPDATE: 2, RESOURCE_UPDATE: 2 })) {
    const names = [...markup.matchAll(new RegExp(`data-curator-row-update="${action}"[^>]*aria-label="([^"]+)"`, 'g'))].map((match) => match[1]);
    assert.equal(names.length, rowCount * expected[action].length, action); assert.equal(new Set(names).size, names.length, action);
    assert.ok(names.some((name) => /row 1, local:/.test(name)), action); assert.ok(names.some((name) => /row 2, local:/.test(name)), action);
  }
  function optionValues(fieldset, field) {
    const selectMarkup = fieldset.match(new RegExp(`<select[^>]*data-curator-update-field="${field}"[\\s\\S]*?<\\/select>`))[0];
    return [...selectMarkup.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]);
  }
  function emptyOption(fieldset, field) {
    const selectMarkup = fieldset.match(new RegExp(`<select[^>]*data-curator-update-field="${field}"[\\s\\S]*?<\\/select>`))[0];
    return [...selectMarkup.matchAll(/<option value="">([^<]*)<\/option>/g)].map((match) => match[1]);
  }
  function selectedValues(fieldset, field) {
    const selectMarkup = fieldset.match(new RegExp(`<select[^>]*data-curator-update-field="${field}"[\\s\\S]*?<\\/select>`))[0];
    const options = [...selectMarkup.matchAll(/<option value="([^"]*)"([^>]*)>/g)].map((match) => ({ value: match[1], selected: /(?:^|\s)selected(?:\s|$)/.test(match[2]) }));
    const selected = options.filter((option) => option.selected).map((option) => option.value);
    return selected.length ? selected : [options[0].value];
  }
  assert.deepEqual(optionValues(scheduleOne, 'daySetKey'), [choiceKey('daySet')]);
  assert.deepEqual(optionValues(scheduleOne, 'activityKey'), [choiceKey('activity')]);
  assert.deepEqual(optionValues(scheduleOne, 'placeKey'), ['', 'place.workroom@v1']);
  assert.deepEqual(optionValues(scheduleOne, 'priority'), ['required', 'recommended', 'optional']);
  assert.deepEqual(optionValues(access, 'itemKey'), [choiceKey('accessItem')]);
  assert.deepEqual(optionValues(access, 'dueKey'), [choiceKey('duePoint')]);
  assert.deepEqual(optionValues(access, 'linkKey'), ['', 'link.access@v1', 'link.operational@v1', 'link.parking@v1']);
  const [contact, contactTwo] = rowEditors('contacts');
  assert.deepEqual(optionValues(contact, 'roleKey'), [choiceKey('role')]);
  assert.deepEqual(optionValues(contact, 'linkKey'), ['', 'link.directory@v1']);
  const [checklist, checklistTwo] = rowEditors('checklistItems');
  assert.deepEqual(optionValues(checklist, 'itemKey'), [choiceKey('checklist')]);
  assert.deepEqual(optionValues(checklist, 'priority'), ['required', 'recommended', 'optional']);
  assert.deepEqual(optionValues(resource, 'linkKey'), ['link.access@v1', 'link.arrival@v1', 'link.attendance@v1', 'link.clinical@v1', 'link.directory@v1', 'link.documentation@v1', 'link.feedback@v1', 'link.operational@v1', 'link.orientation@v1', 'link.parking@v1']);
  assert.deepEqual(optionValues(resource, 'priority'), ['required', 'recommended', 'optional']);
  assert.deepEqual(optionValues(resource, 'reasonKey'), ['', choiceKey('reason')]);
  assert.deepEqual(emptyOption(scheduleOne, 'placeKey'), ['No place']);
  assert.deepEqual(emptyOption(access, 'linkKey'), ['No link']);
  assert.deepEqual(emptyOption(contact, 'linkKey'), ['No directory']);
  assert.deepEqual(emptyOption(resource, 'reasonKey'), ['No reason']);
  for (const [first, second, fields] of [
    [scheduleOne, scheduleTwo, [['daySetKey', [choiceKey('daySet')]], ['activityKey', [choiceKey('activity')]], ['placeKey', ['', 'place.workroom@v1']], ['priority', ['required', 'recommended', 'optional']]]],
    [access, accessTwo, [['itemKey', [choiceKey('accessItem')]], ['dueKey', [choiceKey('duePoint')]], ['linkKey', ['', 'link.access@v1', 'link.operational@v1', 'link.parking@v1']]]],
    [contact, contactTwo, [['roleKey', [choiceKey('role')]], ['linkKey', ['', 'link.directory@v1']]]],
    [checklist, checklistTwo, [['itemKey', [choiceKey('checklist')]], ['priority', ['required', 'recommended', 'optional']]]],
    [resource, resourceTwo, [['linkKey', ['link.access@v1', 'link.arrival@v1', 'link.attendance@v1', 'link.clinical@v1', 'link.directory@v1', 'link.documentation@v1', 'link.feedback@v1', 'link.operational@v1', 'link.orientation@v1', 'link.parking@v1']], ['priority', ['required', 'recommended', 'optional']], ['reasonKey', ['', choiceKey('reason')]]]],
  ]) for (const [field, expectedOptions] of fields) {
    assert.deepEqual(optionValues(first, field), expectedOptions, `row 1 ${field}`);
    assert.deepEqual(optionValues(second, field), expectedOptions, `row 2 ${field}`);
  }
  assert.deepEqual(emptyOption(scheduleTwo, 'placeKey'), ['No place']);
  assert.deepEqual(emptyOption(accessTwo, 'linkKey'), ['No link']);
  assert.deepEqual(emptyOption(contactTwo, 'linkKey'), ['No directory']);
  assert.deepEqual(emptyOption(resourceTwo, 'reasonKey'), ['No reason']);
  for (const [fieldset, field, expected, label] of [
    [scheduleOne, 'daySetKey', [choiceKey('daySet')], 'schedule 1 day'], [scheduleOne, 'activityKey', [choiceKey('activity')], 'schedule 1 activity'], [scheduleOne, 'placeKey', ['place.workroom@v1'], 'schedule 1 place'], [scheduleOne, 'priority', ['required'], 'schedule 1 priority'],
    [scheduleTwo, 'daySetKey', [choiceKey('daySet')], 'schedule 2 day'], [scheduleTwo, 'activityKey', [choiceKey('activity')], 'schedule 2 activity'], [scheduleTwo, 'placeKey', [''], 'schedule 2 place'], [scheduleTwo, 'priority', ['optional'], 'schedule 2 priority'],
    [access, 'itemKey', [choiceKey('accessItem')], 'access 1 item'], [access, 'dueKey', [choiceKey('duePoint')], 'access 1 due'], [access, 'linkKey', ['link.access@v1'], 'access 1 link'],
    [accessTwo, 'itemKey', [choiceKey('accessItem')], 'access 2 item'], [accessTwo, 'dueKey', [choiceKey('duePoint')], 'access 2 due'], [accessTwo, 'linkKey', [''], 'access 2 link'],
    [contact, 'roleKey', [choiceKey('role')], 'contact 1 role'], [contact, 'linkKey', ['link.directory@v1'], 'contact 1 link'],
    [contactTwo, 'roleKey', [choiceKey('role')], 'contact 2 role'], [contactTwo, 'linkKey', [''], 'contact 2 link'],
    [checklist, 'itemKey', [choiceKey('checklist')], 'checklist 1 item'], [checklist, 'priority', ['recommended'], 'checklist 1 priority'],
    [checklistTwo, 'itemKey', [choiceKey('checklist')], 'checklist 2 item'], [checklistTwo, 'priority', ['optional'], 'checklist 2 priority'],
    [resource, 'linkKey', ['link.orientation@v1'], 'resource 1 link'], [resource, 'priority', ['recommended'], 'resource 1 priority'], [resource, 'reasonKey', [choiceKey('reason')], 'resource 1 reason'],
    [resourceTwo, 'linkKey', ['link.clinical@v1'], 'resource 2 link'], [resourceTwo, 'priority', ['optional'], 'resource 2 priority'], [resourceTwo, 'reasonKey', [''], 'resource 2 reason'],
  ]) assert.deepEqual(selectedValues(fieldset, field), expected, label);
  assert.doesNotMatch(markup, /data-curator-row-update="[^"]+"[^>]*(?:type="text"|type="url")/);
});

test('required singleton and ADD option contracts, defaults, and exact optional labels remain faithful', async () => {
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  const markup = fn('fdCuratorLocalMarkup')(draft, SNAPSHOT, candidate.displayModel);
  function article(category) { return markup.match(new RegExp(`<article id="fd-curator-${category}"[\\s\\S]*?<\\/article>`))[0]; }
  function values(category, field) {
    const select = article(category).match(new RegExp(`<select[^>]*data-curator-field="${field}"[\\s\\S]*?<\\/select>`))[0];
    return [...select.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]);
  }
  function selectMarkup(category, field) {
    return article(category).match(new RegExp(`<select[^>]*data-curator-field="${field}"[\\s\\S]*?<\\/select>`))[0];
  }
  function selectedValues(category, field) {
    const select = selectMarkup(category, field);
    const options = [...select.matchAll(/<option value="([^"]*)"([^>]*)>/g)].map((match) => ({ value: match[1], selected: /(?:^|\s)selected(?:\s|$)/.test(match[2]) }));
    const selected = options.filter((option) => option.selected).map((option) => option.value);
    return selected.length ? selected : [options[0].value];
  }
  function emptyLabels(category, field) {
    return [...selectMarkup(category, field).matchAll(/<option value="">([^<]*)<\/option>/g)].map((match) => match[1]);
  }
  for (const [category, field, expected] of [
    ['arrival', 'checkInRoleKey', [choiceKey('role')]], ['arrival', 'placeKey', ['place.workroom@v1']], ['arrival', 'linkKey', ['', 'link.arrival@v1']],
    ['accessItems', 'itemKey', [choiceKey('accessItem')]], ['accessItems', 'dueKey', [choiceKey('duePoint')]], ['accessItems', 'linkKey', ['', 'link.access@v1', 'link.operational@v1', 'link.parking@v1']],
    ['contacts', 'roleKey', [choiceKey('role')]], ['contacts', 'linkKey', ['', 'link.directory@v1']],
    ['checklistItems', 'itemKey', [choiceKey('checklist')]], ['checklistItems', 'priority', ['required', 'recommended', 'optional']],
    ['schedule', 'daySetKey', [choiceKey('daySet')]], ['schedule', 'activityKey', [choiceKey('activity')]], ['schedule', 'placeKey', ['', 'place.workroom@v1']], ['schedule', 'priority', ['required', 'recommended', 'optional']],
    ['resources', 'linkKey', ['link.access@v1', 'link.arrival@v1', 'link.attendance@v1', 'link.clinical@v1', 'link.directory@v1', 'link.documentation@v1', 'link.feedback@v1', 'link.operational@v1', 'link.orientation@v1', 'link.parking@v1']],
    ['resources', 'priority', ['required', 'recommended', 'optional']], ['resources', 'reasonKey', ['', choiceKey('reason')]],
    ['rounds', 'preparationKey', [choiceKey('roundsPreparation')]], ['rounds', 'participationKey', [choiceKey('roundsParticipation')]], ['rounds', 'followUpKey', [choiceKey('roundsFollowUp')]],
    ['presentation', 'formatKey', [choiceKey('presentationFormat')]], ['presentation', 'timingKey', [choiceKey('presentationTiming')]], ['presentation', 'elementKeys', ['choice.presentation-element-two@v1', choiceKey('presentationElement')]],
    ['documentation', 'workflowKey', [choiceKey('documentationWorkflow')]], ['documentation', 'timingKey', [choiceKey('documentationTiming')]], ['documentation', 'policyLinkKey', ['', 'link.documentation@v1']],
    ['attendance', 'eventInstanceIds', ['local:schedule:1', 'local:schedule:2']], ['attendance', 'absenceRoleKey', [choiceKey('role')]], ['attendance', 'policyLinkKey', ['', 'link.attendance@v1']],
    ['feedback', 'cadenceKey', [choiceKey('feedbackCadence')]], ['feedback', 'initiatorKey', [choiceKey('feedbackInitiator')]], ['feedback', 'settingKey', [choiceKey('feedbackSetting')]],
  ]) assert.deepEqual(values(category, field), expected, `${category}.${field}`);
  for (const [category, field, expected] of [
    ['arrival', 'checkInRoleKey', [choiceKey('role')]], ['arrival', 'placeKey', ['place.workroom@v1']], ['arrival', 'linkKey', ['link.arrival@v1']],
    ['accessItems', 'itemKey', [choiceKey('accessItem')]], ['accessItems', 'dueKey', [choiceKey('duePoint')]], ['accessItems', 'linkKey', ['']],
    ['contacts', 'roleKey', [choiceKey('role')]], ['contacts', 'linkKey', ['']],
    ['checklistItems', 'itemKey', [choiceKey('checklist')]], ['checklistItems', 'priority', ['recommended']],
    ['schedule', 'daySetKey', [choiceKey('daySet')]], ['schedule', 'activityKey', [choiceKey('activity')]], ['schedule', 'placeKey', ['']], ['schedule', 'priority', ['recommended']],
    ['resources', 'linkKey', ['link.access@v1']], ['resources', 'priority', ['recommended']], ['resources', 'reasonKey', ['']],
    ['rounds', 'preparationKey', [choiceKey('roundsPreparation')]], ['rounds', 'participationKey', [choiceKey('roundsParticipation')]], ['rounds', 'followUpKey', [choiceKey('roundsFollowUp')]],
    ['presentation', 'formatKey', [choiceKey('presentationFormat')]], ['presentation', 'timingKey', [choiceKey('presentationTiming')]], ['presentation', 'elementKeys', [choiceKey('presentationElement')]],
    ['documentation', 'workflowKey', [choiceKey('documentationWorkflow')]], ['documentation', 'timingKey', [choiceKey('documentationTiming')]], ['documentation', 'policyLinkKey', ['link.documentation@v1']],
    ['attendance', 'eventInstanceIds', ['local:schedule:1']], ['attendance', 'absenceRoleKey', [choiceKey('role')]], ['attendance', 'policyLinkKey', ['link.attendance@v1']],
    ['feedback', 'cadenceKey', [choiceKey('feedbackCadence')]], ['feedback', 'initiatorKey', [choiceKey('feedbackInitiator')]], ['feedback', 'settingKey', [choiceKey('feedbackSetting')]],
  ]) assert.deepEqual(selectedValues(category, field), expected, `${category}.${field} selected: ${selectMarkup(category, field)}`);
  for (const [category, field, label] of [
    ['arrival', 'linkKey', 'No link'], ['accessItems', 'linkKey', 'No link'], ['contacts', 'linkKey', 'No link'],
    ['schedule', 'placeKey', 'No place'], ['resources', 'reasonKey', 'No reason'],
    ['documentation', 'policyLinkKey', 'No policy'], ['attendance', 'policyLinkKey', 'No policy'],
  ]) assert.deepEqual(emptyLabels(category, field), [label], `${category}.${field} exact blank label`);
});

test('curriculum placement required option and reviewed reason have exact blank contracts', () => {
  const draft = completedDraft();
  const markup = fn('fdCuratorCurriculumMarkup')(draft, index(), SNAPSHOT, '');
  const priorities = [...markup.matchAll(/<select data-curator-path-priority="[^"]+"[^>]*>([\s\S]*?)<\/select>/g)].map((match) => match[1]);
  const reasons = [...markup.matchAll(/<select data-curator-path-reason="[^"]+"[^>]*>([\s\S]*?)<\/select>/g)].map((match) => match[1]);
  assert.ok(priorities.length > 0); assert.equal(reasons.length, priorities.length);
  for (const options of priorities) {
    assert.deepEqual([...options.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]), ['required', 'recommended', 'optional']);
    assert.equal((options.match(/<option value="">/g) || []).length, 0);
    assert.deepEqual([...options.matchAll(/<option value="([^"]*)" selected>/g)].map((match) => match[1]), ['recommended']);
  }
  for (const options of reasons) {
    assert.deepEqual([...options.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]), ['', choiceKey('reason')]);
    assert.deepEqual([...options.matchAll(/<option value="">([^<]*)<\/option>/g)].map((match) => match[1]), ['No reviewed reason']);
    assert.equal(/<option value="" selected>/.test(options), false, 'first exact blank is selected by browser semantics');
  }
});

test('valid disabled catalogs mount useful curator drafting while malformed snapshots remain storage-dark', async () => {
  assert.equal(fn('fdEditionPublicationEnabled')(DISABLED_SNAPSHOT), false);
  assert.equal(fn('fdEditionPublicationEnabled')(EMPTY_DISABLED_SNAPSHOT), false);
  assert.equal(fn('fdEditionPublicationEnabled')(RESIDENT_DISABLED_SNAPSHOT), false);
  assert.equal(fn('fdEditionPublicationEnabled')(RESIDENT_EMPTY_DISABLED_SNAPSHOT), false);
  for (const [label, siteIndex, site, snapshot, expected, key] of [
    ['ms3 enabled', index(), context(), SNAPSHOT, /Example Unit/, 'cw_curator_draft_ms3_v2'],
    ['ms3 populated disabled', index(), context(CORE_REVISION, CATALOG_REVISION, 'disabled'), DISABLED_SNAPSHOT, /Example Unit/, 'cw_curator_draft_ms3_v2'],
    ['ms3 empty disabled', index(), context(CORE_REVISION, CATALOG_REVISION, 'disabled'), EMPTY_DISABLED_SNAPSHOT, /No reviewed catalog records are available/, 'cw_curator_draft_ms3_v2'],
    ['resident enabled', residentIndex(), residentContext(), RESIDENT_SNAPSHOT, /Example Unit/, 'rp_curator_draft_resident_v2'],
    ['resident populated disabled', residentIndex(), residentContext('disabled'), RESIDENT_DISABLED_SNAPSHOT, /Example Unit/, 'rp_curator_draft_resident_v2'],
    ['resident empty disabled', residentIndex(), residentContext('disabled'), RESIDENT_EMPTY_DISABLED_SNAPSHOT, /No reviewed catalog records are available/, 'rp_curator_draft_resident_v2'],
  ]) {
    const calls = [], editor = { innerHTML: '' };
    const root = { querySelector(selector) { return selector === '#curatorEditorMount' ? editor : null; }, querySelectorAll() { return []; }, addEventListener(type) { calls.push(['listen', type]); } };
    const storage = { getItem(key) { calls.push(['get', key]); return null; }, setItem(key) { calls.push(['set', key]); } };
    const app = await fn('fdCuratorMount')(root, siteIndex, site, snapshot, '2026-08-19', { storage, subtle: webcrypto.subtle });
    assert.equal(app.ok, true, label); assert.match(editor.innerHTML, expected, label);
    assert.deepEqual(calls, [['get', key], ['listen', 'click'], ['listen', 'change'], ['listen', 'input']], label);
    assert.deepEqual(storage.writes || [], [], label);
  }
  for (const forged of [{}, structuredClone(DISABLED_SNAPSHOT)]) {
    const calls = [], root = { innerHTML: '' }, storage = { getItem() { calls.push('get'); return null; }, setItem() { calls.push('set'); } };
    const app = await fn('fdCuratorMount')(root, index(), context(CORE_REVISION, CATALOG_REVISION, 'disabled'), forged, '2026-08-19', { storage, subtle: webcrypto.subtle });
    assert.equal(app.ok, false); assert.deepEqual(calls, []);
  }
});

test('exact branded catalog and descriptor-safe context must match before storage key derivation or load', async () => {
  const unavailable = '<section class="fd-curator-unavailable" role="alert"><h2>Rotation edition catalog unavailable</h2><p>The reviewed catalog could not be prepared. No draft was read or changed.</p></section>';
  assert.equal(fn('fdEditionCatalogMatchesSite')(SNAPSHOT, context()), true);
  assert.equal(fn('fdEditionCatalogMatchesSite')(SNAPSHOT, structuredClone(context())), true);
  const trustedSite = fn('fdEditionCatalogSiteSnapshot')(SNAPSHOT, context());
  assert.deepEqual(trustedSite, context()); assert.notEqual(trustedSite, context()); assert.equal(Object.isFrozen(trustedSite), true);
  const mismatches = [
    ['wrong audience', RESIDENT_SNAPSHOT, context()],
    ['wrong same-audience path', SNAPSHOT, { ...context(), pathId: 'resident-four-week' }],
    ['malformed core revision', SNAPSHOT, { ...context(), coreRevision: 'not-a-core-revision' }],
    ['wrong revision', SNAPSHOT, context(CORE_REVISION, OLD_CATALOG_REVISION, 'enabled')],
    ['wrong gate', DISABLED_SNAPSHOT, context(CORE_REVISION, CATALOG_REVISION, 'enabled')],
    ['snapshot clone', structuredClone(SNAPSHOT), context()],
  ];
  for (const [label, snapshot, site] of mismatches) {
    const calls = [], root = { innerHTML: '' }, storage = { getItem() { calls.push('get'); return null; }, setItem() { calls.push('set'); } };
    const mounted = await fn('fdCuratorMount')(root, index(), site, snapshot, '2026-08-19', { storage, subtle: webcrypto.subtle });
    assert.equal(mounted.ok, false, label); assert.equal(mounted.code, 'CURATOR_CATALOG_UNAVAILABLE', label);
    assert.deepEqual(calls, [], label); assert.equal(root.innerHTML, unavailable, label); assert.doesNotMatch(root.innerHTML, /Example Unit|Synthetic|location\.|@v1/, label);
  }
  let getterReads = 0;
  const hostile = { pathId: 'ms3-six-week', coreRevision: CORE_REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2: 'enabled' };
  Object.defineProperty(hostile, 'audience', { enumerable: true, get() { getterReads += 1; return 'ms3'; } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const [label, site] of [['accessor', hostile], ['revoked', revoked.proxy]]) {
    const calls = [], root = { innerHTML: '' }, storage = { getItem() { calls.push('get'); return null; }, setItem() { calls.push('set'); } };
    const mounted = await fn('fdCuratorMount')(root, index(), site, SNAPSHOT, '2026-08-19', { storage, subtle: webcrypto.subtle });
    assert.equal(mounted.ok, false, label); assert.equal(mounted.code, 'CURATOR_CATALOG_UNAVAILABLE', label); assert.deepEqual(calls, [], label);
    assert.equal(root.innerHTML, unavailable, label); assert.doesNotMatch(root.innerHTML, /Example Unit|Synthetic|location\.|@v1/, label);
  }
  assert.equal(getterReads, 0);

  let ordinaryGets = 0;
  let ownKeysCalls = 0;
  let descriptorCalls = 0;
  let prototypeCalls = 0;
  const advertised = context();
  const stateful = new Proxy(advertised, {
    ownKeys(target) { ownKeysCalls += 1; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { descriptorCalls += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
    getPrototypeOf(target) { prototypeCalls += 1; return Reflect.getPrototypeOf(target); },
    get(target, key, receiver) {
      ordinaryGets += 1;
      if (key === 'audience') return 'resident';
      if (key === 'pathId') return 'resident-four-week';
      return Reflect.get(target, key, receiver);
    },
  });
  const calls = [], editor = { innerHTML: '' };
  const root = { querySelector(selector) { return selector === '#curatorEditorMount' ? editor : null; }, querySelectorAll() { return []; }, addEventListener() {} };
  const storage = { getItem(key) { calls.push(['get', key]); return null; }, setItem(key) { calls.push(['set', key]); }, removeItem(key) { calls.push(['remove', key]); } };
  const mounted = await fn('fdCuratorMount')(root, index(), stateful, SNAPSHOT, '2026-08-19', { storage, subtle: webcrypto.subtle });
  assert.equal(mounted.ok, true);
  assert.equal(mounted.dispatch({ type: 'SET_STEP', step: 4 }).changed, true);
  assert.equal(mounted.save(), true);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ordinaryGets, 0); assert.equal(ownKeysCalls, 1); assert.equal(descriptorCalls, 5); assert.equal(prototypeCalls, 1);
  assert.deepEqual(calls, [['get', 'cw_curator_draft_ms3_v2'], ['set', 'cw_curator_draft_ms3_v2']]);
  assert.match(editor.innerHTML, /Structured local details/); assert.doesNotMatch(editor.innerHTML, /resident-four-week|rp_rotation/);
});

test('populated disabled governance permits structured drafting and exact preview but keeps publication and learner acceptance closed', async () => {
  const site = context(CORE_REVISION, CATALOG_REVISION, 'disabled');
  let draft = fn('fdCuratorNewDraft')(index(), site);
  function disabledReduce(action, transactions = null) { return fn('fdCuratorReduce')(draft, action, index(), site, DISABLED_SNAPSHOT, '2026-08-19', transactions); }
  for (const action of [
    { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' }, { type: 'SET_CURATOR_PROFILE', curatorProfileKey: 'curator.example@v1' },
    { type: 'SET_PHRASE_SET', phraseSetKey: 'phrases.example@v1' }, { type: 'SET_ROTATION_START', value: '2026-09-01' },
    { type: 'SET_ROTATION_END', value: '2026-10-12' }, { type: 'SET_EDITION_CHECKED_ON', value: '2026-08-19' },
  ]) draft = disabledReduce(action);
  const validation = { mode: 'builder', generationDate: '2026-08-19' };
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), DISABLED_SNAPSHOT, site, validation, webcrypto.subtle);
  assert.equal(candidate.ok, true);
  const transactions = fn('fdCuratorImportTransactions')(), sequence = transactions.beginPreview();
  const prepared = await fn('fdCuratorPreparePreview')(draft, index(), DISABLED_SNAPSHOT, site, validation, webcrypto.subtle, 'desktop', sequence);
  const completion = completePreview(prepared, candidate, 'desktop', sequence, transactions);
  draft = disabledReduce({ type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: completion, sequence }, transactions);
  assert.equal(draft.previewReceipts.desktop.contentDigest, candidate.contentDigest);
  assert.equal(fn('fdEditionPublicationEnabled')(DISABLED_SNAPSHOT), false);
  assert.match(CURATOR_HTML, /id="curatorGenerate" disabled aria-disabled="true"/);
});

test('generation completion accepts only its closure brand and live generation sequence', async () => {
  const draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' }), transactions = fn('fdCuratorImportTransactions')(), sequence = transactions.beginGeneration();
  const { candidate, generated: result } = await preparePublication(draft, undefined, context(), SNAPSHOT, sequence);
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result: { ...result }, sequence }, transactions), draft);
  let reads = 0; const accessor = { type: 'GENERATION_SUCCEEDED', sequence };
  Object.defineProperty(accessor, 'result', { enumerable: true, get() { reads += 1; return result; } });
  assert.equal(reduce(draft, accessor, transactions), draft); assert.equal(reads, 0);
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence: transactions.beginPreview() }, transactions), draft);
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence: transactions.begin() }, transactions), draft);
  transactions.beginGeneration();
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions), draft);
  const liveSequence = transactions.currentGeneration();
  const liveResult = (await preparePublication(draft, undefined, context(), SNAPSHOT, liveSequence)).generated;
  const applied = reduce(draft, { type: 'GENERATION_SUCCEEDED', result: liveResult, sequence: liveSequence }, transactions);
  const envelope = JSON.parse(liveResult.backupJson);
  assert.notEqual(applied, draft); assert.deepEqual(applied.publication.lastGenerated, envelope); assert.deepEqual(applied.publication.baseEnvelope, envelope);
  assert.equal(applied.publication.lastGenerated.digest, candidate.contentDigest);
});

test('already-applied preview and generation completions are exact identity no-ops', async () => {
  let draft = reduce(completedDraft(), { type: 'LOCAL_APPLY_PRESET', presetKey: 'preset.complete@v1' });
  const transactions = fn('fdCuratorImportTransactions')(), validation = { mode: 'builder', generationDate: '2026-08-19' };
  const candidate = await fn('fdCuratorCandidateConfig')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle);
  const previewSequence = transactions.beginPreview();
  const prepared = await fn('fdCuratorPreparePreview')(draft, index(), SNAPSHOT, context(), validation, webcrypto.subtle, 'desktop', previewSequence);
  const completion = completePreview(prepared, candidate, 'desktop', previewSequence, transactions);
  const previewAction = { type: 'PREVIEW_REVIEW_SUCCEEDED', preset: 'desktop', result: completion, sequence: previewSequence };
  draft = reduce(draft, previewAction, transactions);
  const previewSequences = [transactions.current(), transactions.currentPreview(), transactions.currentGeneration()];
  assert.equal(reduce(draft, previewAction, transactions), draft);
  assert.deepEqual([transactions.current(), transactions.currentPreview(), transactions.currentGeneration()], previewSequences);

  const generationSequence = transactions.beginGeneration();
  const generated = (await preparePublication(draft, validation, context(), SNAPSHOT, generationSequence)).generated;
  const generationAction = { type: 'GENERATION_SUCCEEDED', result: generated, sequence: generationSequence };
  draft = reduce(draft, generationAction, transactions);
  const generationSequences = [transactions.current(), transactions.currentPreview(), transactions.currentGeneration()];
  assert.equal(reduce(draft, generationAction, transactions), draft);
  assert.deepEqual([transactions.current(), transactions.currentPreview(), transactions.currentGeneration()], generationSequences);
});
