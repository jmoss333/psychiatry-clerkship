import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build/frontdoor';
const REVISION = 'a'.repeat(40);
const CATALOG_REVISION = `sha256-${'B'.repeat(43)}`;
const CATALOG_SOURCE = readFileSync(new URL(`${BUILD}/fd_edition_catalog.js`, import.meta.url), 'utf8')
  .replace('__FD_CATALOG_EXPECTED_REVISION__', CATALOG_REVISION);
const SOURCE = [
  CATALOG_SOURCE,
  readFileSync(new URL(`${BUILD}/fd_edition_contract.js`, import.meta.url), 'utf8'),
  readFileSync(new URL(`${BUILD}/fd_edition_project.js`, import.meta.url), 'utf8'),
  readFileSync(new URL(`${BUILD}/fd_curator.js`, import.meta.url), 'utf8'),
].join('\n');
const API_NAMES = [
  'fdEditionCatalogSnapshot', 'fdEditionCreateEnvelope', 'fdCuratorNewDraft',
  'fdCuratorCanonicalPathItems', 'fdCuratorReduce', 'fdCuratorApplyAction',
  'fdCuratorImportBackup', 'fdCuratorReadImportFile', 'fdCuratorImportTransactions',
  'fdCuratorCatalogOptions', 'fdCuratorStepOneMarkup', 'fdCuratorLocalGenerationDate', 'fdCuratorMount',
];
const F = new Function(
  'TextEncoder', 'TextDecoder', 'atob', 'btoa',
  `${SOURCE}\nreturn {${API_NAMES.map((name) => `${name}:typeof ${name}==='function'?${name}:null`).join(',')}};`,
)(TextEncoder, TextDecoder, atob, btoa);
function fn(name) { assert.equal(typeof F[name], 'function', `${name} must be implemented`); return F[name]; }

const PATHS = {
  ms3: [
    ['welcome.md', 'pg_interview.md', 'pg_suicide.md', 'agitation.md', 'delirium.md', 'withdrawal.html', 'doc_oral.md', 'mse.html', 'question-bank-practice.html'],
    ['t_mood.md', 't_psychosis.md', 'psychopharm_primer.md', 'ddx.md', 'question-bank-practice.html'],
    ['t_personality.md', 'exp_tx.md', 'brief_psychotherapy.md', 'reflection.html', 'question-bank-practice.html'],
    ['exp_family.md', 'family_modalities.md', 'family_playbook.md', 'collateral_workflow.md', 'family-systems.html', 'question-bank-practice.html'],
    ['suicide.md', 'agitation.md', 'delirium.md', 'catatonia.md', 'cssrs.html', 'withdrawal.html', 'capacity.html', 'question-bank-practice.html'],
    ['shelf.md', 'osce.md', 'cases.md', 'landmark_trials.md', 'oral.html', 'one-patient-six-weeks.html', 'question-bank-practice.html'],
  ],
  resident: [
    ['pg_interview.md', 'mse.html', 'pg_suicide.md', 'agitation.md', 'violence.html', 'delirium.md', 'withdrawal.html', 'bfcrs.html', 'capacity.html'],
    ['diagnostic-reasoning.html', 't_mood.md', 't_psychosis.md', 't_sud.md', 'psychopharm_primer.md', 'adv_psychopharm.md', 'med_monitoring.md', 'interaction-cards.html'],
    ['systems_medlegal.md', 'cl_reference.md', 'exp_consult.md', 'collateral_workflow.md', 'family-systems.html', 'exp_family.md', 'doc_oral.md'],
    ['case_formulation.md', 'oral.html', 'supervision_teaching.md', 'evidence_inpatient.md', 'landmark_trials.md', 'canon_200.md', 'rp-canon-quiz.html'],
  ],
};
function pathId(audience) { return audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week'; }
function index(audience = 'ms3') {
  const refs = [...new Set(PATHS[audience].flat())];
  const byRef = Object.fromEntries(refs.map((ref) => [ref, { ref, title: `Title ${ref}` }]));
  return {
    path: { id: pathId(audience), weekCount: PATHS[audience].length },
    weeks: PATHS[audience].map((weekRefs, offset) => ({ n: offset + 1, title: `Week ${offset + 1}`, items: weekRefs.map((ref) => byRef[ref]) })),
    byRef, columns: [{ name: 'Reviewed Library', accent: 'teal', items: refs.map((ref) => byRef[ref]) }],
  };
}
function context(audience = 'ms3', gate = 'enabled') {
  return { audience, pathId: pathId(audience), coreRevision: REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2: gate };
}
function contractContext(audience = 'ms3', gate = 'enabled') {
  const { pathId: ignored, ...value } = context(audience, gate); return value;
}
function expectedPathItems(audience) {
  const occurrence = Object.create(null);
  return PATHS[audience].flatMap((refs, weekIndex) => refs.map((ref, orderIndex) => {
    occurrence[ref] = (occurrence[ref] || 0) + 1;
    return { instanceId: `core:${ref}:${occurrence[ref]}`, ref, week: weekIndex + 1, order: orderIndex + 1, priority: 'recommended' };
  }));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  const buffer = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return `sha256-${Buffer.from(buffer).toString('base64url')}`;
}
const TOKENS = {
  arrival: ['timing', 'time', 'place', 'role'], scheduleWindow: ['dayStart', 'dayEnd', 'endQualifier'],
  scheduleRangeWithPlace: ['daySet', 'startTime', 'endTime', 'activity', 'place', 'priority'],
  scheduleRangeWithoutPlace: ['daySet', 'startTime', 'endTime', 'activity', 'priority'],
  schedulePointWithPlace: ['daySet', 'startTime', 'activity', 'place', 'priority'],
  schedulePointWithoutPlace: ['daySet', 'startTime', 'activity', 'priority'],
  rounds: ['preparation', 'participation', 'followUp'], presentation: ['format', 'timing', 'elements'],
  documentation: ['workflow', 'timing'], attendance: ['events', 'absenceRole'], feedback: ['cadence', 'initiator', 'setting'],
  access: ['item', 'due'], contact: ['role'], checklist: ['item', 'priority'],
  resourceWithReason: ['title', 'priority', 'week', 'reason', 'hostname'],
  resourceWithoutReason: ['title', 'priority', 'week', 'hostname'], changeSummary: ['kinds', 'count'],
};
function phrase(key, locationKeys = ['location.example@v1'], audiences = ['ms3', 'resident']) {
  return { key, kind: 'phraseSet', displayName: key === 'phrases.example@v1' ? 'Example reviewed wording' : 'Other reviewed wording', templates: Object.fromEntries(Object.entries(TOKENS).map(([name, tokens]) => [name, { text: tokens.map((token) => `{${token}}`).join(' '), tokens }])), locationKeys, audiences, verifiedOn: '2026-08-19' };
}
async function catalog({ profiles = true } = {}) {
  const records = [
    { key: 'choice.role@v1', kind: 'choice', choiceKind: 'role', label: 'Faculty role', fragment: 'the faculty role', audiences: ['ms3', 'resident'], verifiedOn: '2026-08-19' },
    { key: 'choice.reason@v1', kind: 'choice', choiceKind: 'reason', label: 'Reviewed reason', fragment: 'reviewed reason', locationKeys: ['location.example@v1'], audiences: ['ms3', 'resident'], verifiedOn: '2026-08-19' },
    { key: 'choice.reason-other@v1', kind: 'choice', choiceKind: 'reason', label: 'Other reason', fragment: 'other reason', locationKeys: ['location.other@v1'], audiences: ['ms3'], verifiedOn: '2026-08-19' },
    { key: 'choice.deprecated@v1', kind: 'choice', choiceKind: 'reason', label: 'Deprecated reason', fragment: 'deprecated reason', locationKeys: ['location.example@v1'], audiences: ['ms3', 'resident'], verifiedOn: '2026-08-19' },
    { key: 'location.example@v1', kind: 'trainingLocation', displayName: 'Example Unit', locationCode: 'EXU', locationTypeCode: 'inpatient', audiences: ['ms3', 'resident'], officialHostnames: ['example.edu'], verifiedOn: '2026-08-19' },
    { key: 'location.other@v1', kind: 'trainingLocation', displayName: 'Other Unit', locationCode: 'OTH', locationTypeCode: 'inpatient', audiences: ['ms3'], officialHostnames: ['other.example.edu'], verifiedOn: '2026-08-19' },
    phrase('phrases.example@v1'), phrase('phrases.other@v1', ['location.other@v1'], ['ms3']),
  ];
  if (profiles) records.push(
    { key: 'curator.example@v1', kind: 'curatorProfile', displayName: 'Example Faculty', roleKey: 'choice.role@v1', locationKeys: ['location.example@v1'], audiences: ['ms3', 'resident'], verifiedOn: '2026-08-19' },
    { key: 'curator.other@v1', kind: 'curatorProfile', displayName: 'Other Faculty', roleKey: 'choice.role@v1', locationKeys: ['location.other@v1'], audiences: ['ms3'], verifiedOn: '2026-08-19' },
  );
  const digested = await Promise.all(records.map(async (record) => ({ ...record, contentDigest: await digest(record) })));
  digested.sort((left, right) => left.key.localeCompare(right.key));
  const projection = { schemaVersion: 1, audience: 'ms3', revision: CATALOG_REVISION, projectionDigest: '', rotationEditionV2: 'enabled', selectionKeys: digested.filter((record) => record.key !== 'choice.deprecated@v1').map((record) => record.key), resolutionRecords: digested, blockedKeys: ['choice.blocked@v1'] };
  const bare = structuredClone(projection); delete bare.projectionDigest; projection.projectionDigest = await digest(bare);
  const prepared = await fn('fdEditionCatalogSnapshot')(projection, 'ms3', webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared)); return prepared.snapshot;
}
const SNAPSHOT = await catalog();
const NO_PROFILE_SNAPSHOT = await catalog({ profiles: false });
function reduce(draft, action, snapshot = SNAPSHOT, generationDate = '2026-08-19', transactions = null) {
  return fn('fdCuratorReduce')(draft, action, index(), context(), snapshot, generationDate, transactions);
}
function exactState(audience) {
  return {
    schemaVersion: 2, step: 1,
    site: { audience, pathId: pathId(audience), coreRevision: REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2: 'enabled', rendererRevision: 'rotation-edition-v2-r1' },
    config: { context: { trainingLocationKey: '', curatorProfileKey: '', rotationStart: '', rotationEnd: '', editionCheckedOn: '' }, phraseSetKey: '', pathItems: expectedPathItems(audience), localPlan: {}, changeSummary: { kindCodes: ['initial'], changedItemCount: 0 } },
    publication: { baseEnvelope: null, baseSemanticConfig: '', lastGenerated: null },
    previewReceipts: { desktop: null, mobile: null },
    affirmations: { publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false },
  };
}

for (const audience of ['ms3', 'resident']) test(`creates the exact v2 ${audience} state with the pinned current canonical path`, () => {
  assert.deepEqual(fn('fdCuratorNewDraft')(index(audience), context(audience)), exactState(audience));
});

test('reducer changes are deeply immutable while semantic no-ops preserve object identity and review state', () => {
  const original = fn('fdCuratorNewDraft')(index(), context());
  original.previewReceipts.desktop = { contentDigest: 'keep' }; original.previewReceipts.mobile = { contentDigest: 'keep-mobile' }; original.affirmations.publicSafe = true;
  const before = structuredClone(original);
  assert.equal(reduce(original, { type: 'SET_STEP', step: 1 }), original);
  assert.equal(reduce(original, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: '' }), original);
  const changed = reduce(original, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' });
  assert.notEqual(changed, original); assert.deepEqual(original, before);
  assert.deepEqual(changed.previewReceipts, { desktop: null, mobile: null });
  assert.deepEqual(changed.affirmations, { publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false });
  assert.equal(reduce(changed, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' }), changed);
});

test('closed descriptor-safe actions reject extras, symbols, accessors, inheritance, and revoked proxies as identity no-ops', () => {
  const draft = fn('fdCuratorNewDraft')(index(), context()); let reads = 0;
  const inherited = Object.create({ trainingLocationKey: 'location.example@v1' }); inherited.type = 'SET_TRAINING_LOCATION';
  const accessor = { type: 'SET_TRAINING_LOCATION' }; Object.defineProperty(accessor, 'trainingLocationKey', { enumerable: true, get() { reads += 1; return 'location.example@v1'; } });
  const symbol = { type: 'SET_STEP', step: 2 }; symbol[Symbol('private')] = true;
  const revoked = Proxy.revocable({ type: 'SET_STEP', step: 2 }, {}); revoked.revoke();
  for (const action of [{ type: 'SET_STEP', step: 2, extra: true }, symbol, inherited, accessor, revoked.proxy, { type: 'GO_TO_STEP', step: 2 }, { type: 'PATH_MOVE_ORDER', instanceId: 'x', direction: 'left' }]) assert.equal(reduce(draft, action), draft);
  assert.equal(reads, 0);
});

test('hostile nested persisted values fail closed before reducer cloning', () => {
  const draft = fn('fdCuratorNewDraft')(index(), context());
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  draft.publication.lastGenerated = revoked.proxy;
  assert.doesNotThrow(() => {
    assert.equal(reduce(draft, { type: 'SET_STEP', step: 2 }), draft);
    assert.equal(reduce(draft, { type: 'SET_ROTATION_START', value: '2027-01-04' }), draft);
  });
});

test('dates preserve future rotations but enforce real values, order, and checked-date bounds', () => {
  let draft = fn('fdCuratorNewDraft')(index(), context());
  draft = reduce(draft, { type: 'SET_ROTATION_START', value: '2027-01-04' });
  draft = reduce(draft, { type: 'SET_ROTATION_END', value: '2027-02-12' });
  assert.equal(draft.config.context.rotationStart, '2027-01-04'); assert.equal(draft.config.context.rotationEnd, '2027-02-12');
  assert.equal(reduce(draft, { type: 'SET_ROTATION_END', value: '2027-01-03' }), draft);
  assert.equal(reduce(draft, { type: 'SET_EDITION_CHECKED_ON', value: '2026-08-20' }), draft);
  draft = reduce(draft, { type: 'SET_EDITION_CHECKED_ON', value: '2026-08-19' });
  assert.equal(draft.config.context.editionCheckedOn, '2026-08-19');
  assert.equal(reduce(draft, { type: 'SET_ROTATION_START', value: '2026-02-30' }), draft);
  assert.equal(reduce(draft, { type: 'SET_ROTATION_START', value: '' }).config.context.rotationStart, '');
});

test('local generation date uses injected local getters, zero pads, and fails closed', () => {
  const value = { getFullYear: () => 2026, getMonth: () => 7, getDate: () => 9 };
  assert.equal(fn('fdCuratorLocalGenerationDate')(value), '2026-08-09');
  assert.equal(fn('fdCuratorLocalGenerationDate')({ ...value, getDate: () => 32 }), '');
  assert.equal(fn('fdCuratorLocalGenerationDate')({ ...value, getMonth() { throw new Error('private'); } }), '');
});

test('only reviewed location-dependent profiles, phrase sets, and reasons are eligible', () => {
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'trainingLocation', '', 'ms3').map((x) => x.key), ['location.example@v1', 'location.other@v1']);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'curatorProfile', 'location.example@v1', 'ms3').map((x) => x.key), ['curator.example@v1']);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'phraseSet', 'location.example@v1', 'ms3').map((x) => x.key), ['phrases.example@v1']);
  assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOT, 'reason', 'location.example@v1', 'ms3').map((x) => x.key), ['choice.reason@v1']);
  assert.deepEqual(fn('fdCuratorCatalogOptions')({}, 'trainingLocation', '', 'ms3'), []);
  let draft = fn('fdCuratorNewDraft')(index(), context());
  draft = reduce(draft, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' });
  draft = reduce(draft, { type: 'SET_CURATOR_PROFILE', curatorProfileKey: 'curator.example@v1' });
  draft = reduce(draft, { type: 'SET_PHRASE_SET', phraseSetKey: 'phrases.example@v1' });
  assert.equal(reduce(draft, { type: 'SET_CURATOR_PROFILE', curatorProfileKey: 'curator.other@v1' }), draft);
  const moved = reduce(draft, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.other@v1' });
  assert.equal(moved.config.context.curatorProfileKey, ''); assert.equal(moved.config.phraseSetKey, '');
});

test('a location with no reviewed profiles renders onboarding and no custom-name fallback', () => {
  let draft = fn('fdCuratorNewDraft')(index(), context());
  draft = fn('fdCuratorReduce')(draft, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' }, index(), context(), NO_PROFILE_SNAPSHOT, '2026-08-19', null);
  const markup = fn('fdCuratorStepOneMarkup')(draft, NO_PROFILE_SNAPSHOT, '2026-08-19');
  assert.match(markup, /A reviewed catalog proposal is required/);
  assert.doesNotMatch(markup, /custom name|curatorName|type="text"[^>]+name="curator/i);
});

async function validEnvelope() {
  let draft = fn('fdCuratorNewDraft')(index(), context());
  for (const action of [
    { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' },
    { type: 'SET_CURATOR_PROFILE', curatorProfileKey: 'curator.example@v1' },
    { type: 'SET_PHRASE_SET', phraseSetKey: 'phrases.example@v1' },
    { type: 'SET_ROTATION_START', value: '2026-09-01' }, { type: 'SET_ROTATION_END', value: '2026-10-12' },
    { type: 'SET_EDITION_CHECKED_ON', value: '2026-08-19' },
  ]) draft = reduce(draft, action);
  const config = { audience: 'ms3', pathId: 'ms3-six-week', editionNumber: 1, createdAgainstCoreRevision: REVISION, createdAgainstLocalCatalogRevision: CATALOG_REVISION, context: draft.config.context, phraseSetKey: draft.config.phraseSetKey, pathItems: draft.config.pathItems, localPlan: {}, changeSummary: draft.config.changeSummary };
  const made = await fn('fdEditionCreateEnvelope')(config, index(), SNAPSHOT, contractContext(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle);
  assert.equal(made.ok, true); return made.envelope;
}

test('v2 backup import is branded, builder-resolved, bounded, and applies only at the live sequence', async () => {
  const envelope = await validEnvelope();
  const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.begin();
  const imported = await fn('fdCuratorImportBackup')(JSON.stringify(envelope), index(), context(), SNAPSHOT, { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle, sequence);
  assert.equal(imported.ok, true); assert.equal(imported.code, 'CURATOR_IMPORT_OK');
  const current = fn('fdCuratorNewDraft')(index(), context());
  assert.equal(fn('fdCuratorReduce')(current, { type: 'IMPORT_SUCCEEDED', result: imported, sequence: sequence + 1 }, index(), context(), SNAPSHOT, '2026-08-19', transactions), current);
  const applied = fn('fdCuratorReduce')(current, { type: 'IMPORT_SUCCEEDED', result: imported, sequence }, index(), context(), SNAPSHOT, '2026-08-19', transactions);
  assert.equal(applied.config.context.trainingLocationKey, 'location.example@v1'); assert.deepEqual(applied.publication.baseEnvelope, envelope);
  const forged = { ...imported };
  const nested = new Proxy({}, { get() { throw new Error('nested result must not be read'); } });
  assert.equal(fn('fdCuratorReduce')(current, { type: 'IMPORT_SUCCEEDED', result: forged, sequence }, index(), context(), SNAPSHOT, '2026-08-19', transactions), current);
  assert.equal(fn('fdCuratorReduce')(current, { type: 'IMPORT_SUCCEEDED', result: nested, sequence }, index(), context(), SNAPSHOT, '2026-08-19', transactions), current);
});

test('builder import rejects deprecated, blocked, unknown, and location-ineligible references without aliases', async () => {
  const base = await validEnvelope();
  for (const reasonKey of [
    'choice.deprecated@v1', 'choice.blocked@v1', 'choice.unknown@v1', 'choice.reason-other@v1',
  ]) {
    const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.begin();
    const value = structuredClone(base);
    value.config.pathItems[0].reasonKey = reasonKey;
    value.digest = await digest({ format: value.format, schemaVersion: value.schemaVersion, config: value.config });
    const result = await fn('fdCuratorImportBackup')(
      JSON.stringify(value), index(), context(), SNAPSHOT,
      { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle, sequence,
    );
    assert.deepEqual(result, { ok: false, code: 'CURATOR_IMPORT_RESELECTION_REQUIRED' }, reasonKey);
    assert.equal(JSON.stringify(result).includes(reasonKey), false);
  }
});

test('import size failures occur before parsing or file reads and never mutate a draft', async () => {
  let textCalls = 0; const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.begin();
  assert.deepEqual(await fn('fdCuratorImportBackup')('x'.repeat(65537), index(), context(), SNAPSHOT, { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle, sequence), { ok: false, code: 'CURATOR_IMPORT_SIZE' });
  assert.deepEqual(await fn('fdCuratorReadImportFile')({ size: 65537, text() { textCalls += 1; return Promise.resolve('{}'); } }, index(), context(), SNAPSHOT, { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle, sequence), { ok: false, code: 'CURATOR_IMPORT_SIZE' });
  assert.equal(textCalls, 0);
  assert.deepEqual(await fn('fdCuratorReadImportFile')({ size: 0, text() { textCalls += 1; return Promise.resolve('x'.repeat(65537)); } }, index(), context(), SNAPSHOT, { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle, sequence), { ok: false, code: 'CURATOR_IMPORT_SIZE' });
  assert.equal(textCalls, 1);
});

test('pending imports cancel only after a semantic action and no-ops preserve them', () => {
  const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.begin();
  const draft = fn('fdCuratorNewDraft')(index(), context());
  let result = fn('fdCuratorApplyAction')(draft, { type: 'SET_STEP', step: 1 }, index(), context(), SNAPSHOT, '2026-08-19', transactions);
  assert.equal(result.changed, false); assert.equal(transactions.current(), sequence);
  result = fn('fdCuratorApplyAction')(draft, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'missing@v1' }, index(), context(), SNAPSHOT, '2026-08-19', transactions);
  assert.equal(result.changed, false); assert.equal(transactions.current(), sequence);
  result = fn('fdCuratorApplyAction')(draft, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' }, index(), context(), SNAPSHOT, '2026-08-19', transactions);
  assert.equal(result.changed, true); assert.equal(transactions.current(), sequence + 1);
  assert.equal(fn('fdCuratorApplyAction')(result.state, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' }, index(), context(), SNAPSHOT, '2026-08-19', transactions).state, result.state);
  assert.equal(transactions.current(), sequence + 1);
});

test('unbranded catalog mount renders fixed unavailable state before curator storage read', async () => {
  const calls = []; const root = { innerHTML: '' };
  const app = await fn('fdCuratorMount')(root, index(), context(), {}, '2026-08-19', { storage: { getItem(key) { calls.push(['get', key]); return null; }, setItem() { calls.push(['set']); } } });
  assert.equal(app.ok, false); assert.equal(app.code, 'CURATOR_CATALOG_UNAVAILABLE');
  assert.match(root.innerHTML, /Rotation edition catalog unavailable/); assert.deepEqual(calls, []);
});

test('branded mount reads only the v2 draft key before registering structured controls', async () => {
  const calls = []; const editor = { innerHTML: '' };
  const root = {
    querySelector(selector) { return selector === '#curatorEditorMount' ? editor : null; },
    querySelectorAll() { return []; },
    addEventListener(type) { calls.push(['listen', type]); },
  };
  const storage = {
    getItem(key) { calls.push(['get', key]); return null; },
    setItem(key) { calls.push(['set', key]); },
  };
  const app = await fn('fdCuratorMount')(root, index(), context(), SNAPSHOT, '2026-08-19', { storage, subtle: webcrypto.subtle });
  assert.equal(app.ok, true);
  assert.deepEqual(calls, [
    ['get', 'cw_curator_draft_ms3_v2'], ['listen', 'click'], ['listen', 'change'], ['listen', 'input'],
  ]);
  assert.match(editor.innerHTML, /data-curator-step-panel="1"/);
});

test('mounted dispatch executes only its first descriptor-captured action snapshot', async () => {
  const editor = { innerHTML: '' };
  const root = {
    querySelector(selector) { return selector === '#curatorEditorMount' ? editor : null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const storage = { getItem() { return null; }, setItem() {} };
  const app = await fn('fdCuratorMount')(root, index(), context(), SNAPSHOT, '2026-08-19', { storage, subtle: webcrypto.subtle });
  let snapshot = 0; let gets = 0;
  const action = new Proxy({}, {
    ownKeys() { snapshot += 1; return snapshot === 1 ? ['type', 'step'] : ['type', 'name', 'value']; },
    getOwnPropertyDescriptor(_target, key) {
      const first = { type: 'SET_STEP', step: 2 };
      const later = { type: 'SET_AFFIRMATION', name: 'publicSafe', value: true };
      return { configurable: true, enumerable: true, writable: true, value: (snapshot === 1 ? first : later)[key] };
    },
    get() { gets += 1; throw new Error('ordinary action reads are forbidden'); },
  });
  const result = app.dispatch(action);
  assert.equal(result.changed, true);
  assert.equal(app.getState().step, 2);
  assert.equal(app.getState().affirmations.publicSafe, false);
  assert.equal(snapshot, 1);
  assert.equal(gets, 0);
});
