import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const CORE_REVISION = '5'.repeat(40);
const CATALOG_REVISION = `sha256-${'D'.repeat(43)}`;
const VENDOR_URL = new URL(`${BUILD}/vendor/qrcode-generator-1.4.4.js`, import.meta.url);
const CURATOR_HTML = readFileSync(new URL('../13_Faculty_Resources/Rotation_Curation/rotation-curator.html', import.meta.url), 'utf8');
const CURATOR_JS = readFileSync(new URL(`${BUILD}/frontdoor/fd_curator.js`, import.meta.url), 'utf8');
const SOURCE = [
  existsSync(VENDOR_URL) ? readFileSync(VENDOR_URL, 'utf8') : '',
  readFileSync(new URL(`${BUILD}/frontdoor/fd_edition_catalog.js`, import.meta.url), 'utf8')
    .replace('__FD_CATALOG_EXPECTED_REVISION__', CATALOG_REVISION),
  ...['fd_edition_contract.js', 'fd_edition_project.js', 'fd_curator.js']
    .map((name) => readFileSync(new URL(`${BUILD}/frontdoor/${name}`, import.meta.url), 'utf8')),
].join('\n');
const API = [
  'fdEditionCatalogSnapshot', 'fdEditionCreateEnvelope', 'fdEditionDecodePayload', 'fdEditionSemanticConfig',
  'fdCuratorNewDraft', 'fdCuratorReduce', 'fdCuratorImportTransactions',
  'fdCuratorCandidateConfig', 'fdCuratorHealth', 'fdCuratorStudentBaseUrl',
  'fdCuratorBuildShare', 'fdCuratorBackupJson', 'fdCuratorQrSvg', 'fdCuratorStepFiveMarkup',
  'fdCuratorPreparePreview', 'fdCuratorPreviewMarkup', 'fdCuratorCompletePreview', 'fdCuratorImportBackup',
];
function loadApiFromSource(sourceText, jsonObject = JSON, capabilities = {}) {
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa', 'JSON', 'localStorage', 'navigator', 'document', 'fetch', 'Blob', 'URL', 'Date',
    'XMLHttpRequest', 'Image', 'WebSocket', 'EventSource', 'importScripts', 'sendBeacon', 'window', 'globalThis', 'location', 'performance',
  `${sourceText}\nreturn {${API.map((name) => `${name}:typeof ${name}==='function'?${name}:null`).join(',')}};`,
  )(TextEncoder, TextDecoder, atob, btoa, jsonObject, capabilities.localStorage, capabilities.navigator,
    capabilities.document, capabilities.fetch, capabilities.Blob, capabilities.URL || URL, capabilities.Date || Date,
    capabilities.XMLHttpRequest, capabilities.Image, capabilities.WebSocket, capabilities.EventSource,
    capabilities.importScripts, capabilities.sendBeacon, capabilities.window, capabilities.globalThis,
    capabilities.location, capabilities.performance);
}
function loadApi(jsonObject = JSON, capabilities = {}) { return loadApiFromSource(SOURCE, jsonObject, capabilities); }
function loadDecodeProbeApi(probe) {
  const signature = 'function fdEditionDecodePayload(payload,coreIndex,catalogSnapshot,siteContext,validationContext,subtle,totalUrlLength){';
  const renamed = SOURCE.replace(signature, 'function fdEditionDecodePayloadUnchecked(payload,coreIndex,catalogSnapshot,siteContext,validationContext,subtle,totalUrlLength){');
  assert.notEqual(renamed, SOURCE, 'decode instrumentation signature must match exactly');
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa', 'decodeProbe', `${renamed}\nfunction fdEditionDecodePayload(payload,coreIndex,catalogSnapshot,siteContext,validationContext,subtle,totalUrlLength){return decodeProbe({payload,coreIndex,catalogSnapshot,siteContext,validationContext,subtle,totalUrlLength});}\nreturn {${API.map((name) => `${name}:typeof ${name}==='function'?${name}:null`).join(',')}};`)(TextEncoder, TextDecoder, atob, btoa, probe);
}
const F = loadApi();
function fn(name) { assert.equal(typeof F[name], 'function', `${name} must be implemented`); return F[name]; }

const TOKENS = {
  arrival: ['timing', 'time', 'place', 'role'], scheduleWindow: ['dayStart', 'dayEnd', 'endQualifier'],
  scheduleRangeWithPlace: ['daySet', 'startTime', 'endTime', 'activity', 'place', 'priority'],
  scheduleRangeWithoutPlace: ['daySet', 'startTime', 'endTime', 'activity', 'priority'],
  schedulePointWithPlace: ['daySet', 'startTime', 'activity', 'place', 'priority'],
  schedulePointWithoutPlace: ['daySet', 'startTime', 'activity', 'priority'],
  rounds: ['preparation', 'participation', 'followUp'], presentation: ['format', 'timing', 'elements'],
  documentation: ['workflow', 'timing'], attendance: ['events', 'absenceRole'],
  feedback: ['cadence', 'initiator', 'setting'], access: ['item', 'due'], contact: ['role'],
  checklist: ['item', 'priority'], resourceWithReason: ['title', 'priority', 'week', 'reason', 'hostname'],
  resourceWithoutReason: ['title', 'priority', 'week', 'hostname'], changeSummary: ['kinds', 'count'],
};
const TEXT = {
  arrival: 'Arrive {timing} {time} at {place}; check in with {role}.',
  scheduleWindow: 'The day runs from {dayStart} until {endQualifier} {dayEnd}.',
  scheduleRangeWithPlace: '{daySet}: {activity}, {startTime} to {endTime}, at {place} ({priority}).',
  scheduleRangeWithoutPlace: '{daySet}: {activity}, {startTime} to {endTime} ({priority}).',
  schedulePointWithPlace: '{daySet}: {activity} at {startTime}, at {place} ({priority}).',
  schedulePointWithoutPlace: '{daySet}: {activity} at {startTime} ({priority}).',
  rounds: 'Before rounds {preparation}; during rounds {participation}; after rounds {followUp}.',
  presentation: 'Use {format} {timing}; include {elements}.', documentation: '{workflow}; {timing}.',
  attendance: 'Attend {events}; report absences to {absenceRole}.', feedback: 'Feedback is {cadence}; {initiator} in {setting}.',
  access: '{item} {due}.', contact: 'Contact {role}.', checklist: '{item} ({priority}).',
  resourceWithReason: '{title}: {priority}, week {week}, because {reason}; {hostname}.',
  resourceWithoutReason: '{title}: {priority}, week {week}; {hostname}.', changeSummary: '{kinds}; {count} changed items.',
};
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  const bytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return `sha256-${Buffer.from(bytes).toString('base64url')}`;
}
function context(gate = 'enabled') {
  return { audience: 'ms3', pathId: 'ms3-six-week', coreRevision: CORE_REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2: gate };
}
function contractContext() {
  return { audience: 'ms3', coreRevision: CORE_REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2: 'enabled' };
}
function residentContext(gate = 'enabled') {
  return { audience: 'resident', pathId: 'resident-four-week', coreRevision: CORE_REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2: gate };
}
function index() {
  const first = { ref: 'first.md', title: 'First reviewed item' };
  return {
    path: { id: 'ms3-six-week', weekCount: 6 },
    weeks: [
      { n: 1, title: 'Week 1', items: [first] }, { n: 2, title: 'Week 2', items: [] },
      { n: 3, title: 'Week 3', items: [] }, { n: 4, title: 'Week 4', items: [] },
      { n: 5, title: 'Week 5', items: [] }, { n: 6, title: 'Week 6', items: [] },
    ],
    byRef: { 'first.md': first }, columns: [{ name: 'Library', accent: 'teal', items: [first] }],
  };
}
function residentIndex() {
  const value = index(); return { ...value, path: { id: 'resident-four-week', weekCount: 4 }, weeks: value.weeks.slice(0, 4) };
}
async function makeSnapshot(gate = 'enabled', api = F, audience = 'ms3') {
  const common = { audiences: [audience], verifiedOn: '2026-08-19' };
  const templates = Object.fromEntries(Object.entries(TOKENS).map(([name, tokens]) => [name, { text: TEXT[name], tokens }]));
  const records = [
    { key: 'location.example@v1', kind: 'trainingLocation', displayName: 'Example Unit', locationCode: 'EXU', locationTypeCode: 'inpatient', officialHostnames: ['example.edu'], ...common },
    { key: 'location.other@v1', kind: 'trainingLocation', displayName: 'Other Unit', locationCode: 'OTH', locationTypeCode: 'outpatient', officialHostnames: ['other.example.edu'], ...common },
    { key: 'choice.role@v1', kind: 'choice', choiceKind: 'role', label: 'Teaching role', fragment: 'the teaching coordinator', ...common },
    { key: 'curator.example@v1', kind: 'curatorProfile', displayName: 'Example Faculty', roleKey: 'choice.role@v1', locationKeys: ['location.example@v1'], ...common },
    { key: 'curator.other@v1', kind: 'curatorProfile', displayName: 'Other Faculty', roleKey: 'choice.role@v1', locationKeys: ['location.other@v1'], ...common },
    { key: 'phrases.example@v1', kind: 'phraseSet', displayName: 'Reviewed wording', templates, locationKeys: ['location.example@v1'], ...common },
  ];
  const resolutionRecords = await Promise.all(records.map(async (record) => ({ ...record, contentDigest: await digest(record) })));
  resolutionRecords.sort((a, b) => a.key.localeCompare(b.key));
  const projection = { schemaVersion: 1, audience, revision: CATALOG_REVISION, projectionDigest: '', rotationEditionV2: gate, selectionKeys: resolutionRecords.map((record) => record.key), resolutionRecords, blockedKeys: [] };
  const bare = structuredClone(projection); delete bare.projectionDigest; projection.projectionDigest = await digest(bare);
  const prepared = await api.fdEditionCatalogSnapshot(projection, audience, webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared)); return prepared.snapshot;
}
const SNAPSHOT = await makeSnapshot('enabled');
const DISABLED_SNAPSHOT = await makeSnapshot('disabled');
const VALIDATION = { mode: 'builder', generationDate: '2026-08-19' };
const LOCATION = { protocol: 'https:', host: 'clerkship.example', origin: 'https://clerkship.example', pathname: '/tools/rotation-curator.html', search: '', hash: '' };

function reduceWith(api, draft, action, transactions = null, snapshot = SNAPSHOT, site = context()) {
  assert.equal(typeof api.fdCuratorReduce, 'function', 'fdCuratorReduce must be implemented');
  return api.fdCuratorReduce(draft, action, index(), site, snapshot, '2026-08-19', transactions);
}
function reduce(draft, action, transactions = null) { return reduceWith(F, draft, action, transactions); }
function completedDraft(api = F, snapshot = SNAPSHOT, site = context()) {
  assert.equal(typeof api.fdCuratorNewDraft, 'function', 'fdCuratorNewDraft must be implemented');
  let draft = api.fdCuratorNewDraft(index(), site);
  for (const action of [
    { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' },
    { type: 'SET_CURATOR_PROFILE', curatorProfileKey: 'curator.example@v1' },
    { type: 'SET_PHRASE_SET', phraseSetKey: 'phrases.example@v1' },
    { type: 'SET_ROTATION_START', value: '2026-09-01' }, { type: 'SET_ROTATION_END', value: '2026-10-12' },
    { type: 'SET_EDITION_CHECKED_ON', value: '2026-08-19' },
  ]) draft = reduceWith(api, draft, action, null, snapshot, site);
  return draft;
}
async function candidateFor(draft, site = context(), subtle = webcrypto.subtle, api = F, snapshot = SNAPSHOT) {
  assert.equal(typeof api.fdCuratorCandidateConfig, 'function', 'fdCuratorCandidateConfig must be implemented');
  return api.fdCuratorCandidateConfig(draft, index(), snapshot, site, VALIDATION, subtle);
}
const PREVIEW_ORDER = ['First day at the location', 'Before you arrive', 'Who to contact', "Today's checklist", 'Typical day', 'Team workflow', 'Attendance and feedback', 'Official resources'];
function completePreview(prepared, preset, sequence, transactions, api = F) {
  const markup = api.fdCuratorPreviewMarkup(prepared, preset);
  const attributes = Object.fromEntries([...markup.matchAll(/\s(data-curator-[a-z-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
  const body = markup.match(/^<div[^>]*>([\s\S]*)<\/div>$/)?.[1] || '';
  const node = { isConnected: true, innerHTML: body, getAttribute(name) { return attributes[name] ?? null; }, querySelectorAll(selector) { return selector === 'h4' ? PREVIEW_ORDER.map((textContent) => ({ textContent })) : []; } };
  const root = { querySelector() { return node; }, querySelectorAll() { return [node]; }, contains(value) { return value === node; } };
  return api.fdCuratorCompletePreview(prepared, root, preset, sequence, transactions);
}
async function reviewedDraft(draft = null, api = F, snapshot = SNAPSHOT, site = context(), subtle = webcrypto.subtle) {
  if (draft === null) draft = completedDraft(api, snapshot, site);
  const transactions = api.fdCuratorImportTransactions();
  let candidate = await candidateFor(draft, site, subtle, api, snapshot); assert.equal(candidate.ok, true, JSON.stringify(candidate));
  for (const preset of ['desktop', 'mobile-390']) {
    const sequence = transactions.beginPreview();
    const prepared = await api.fdCuratorPreparePreview(draft, index(), snapshot, site, VALIDATION, subtle, preset, sequence);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const completion = completePreview(prepared, preset, sequence, transactions, api);
    assert.equal(completion.ok, true, JSON.stringify(completion));
    draft = reduceWith(api, draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset, result: completion, sequence }, transactions, snapshot, site);
  }
  for (const name of ['publicSafe', 'officialLinks', 'forwardable']) draft = reduceWith(api, draft, { type: 'SET_AFFIRMATION', name, value: true }, transactions, snapshot, site);
  candidate = await candidateFor(draft, site, subtle, api, snapshot); assert.equal(candidate.ok, true, JSON.stringify(candidate));
  assert.equal(draft.affirmations.previewsReviewed, true);
  return { draft, candidate };
}
function assertExactKeys(value, expected) { assert.deepEqual(Object.keys(value).sort(), [...expected].sort()); }
function assertBlocked(result) {
  assertExactKeys(result, ['ok', 'code']); assert.equal(result.ok, false); assert.equal(typeof result.code, 'string');
  for (const key of ['url', 'backupJson', 'filename', 'qr', 'envelope', 'contentDigest', 'fingerprint']) assert.equal(Object.hasOwn(result, key), false, key);
}

test('Step 5 source contains the fixed affirmations, governance status, provenance labels, and forwarding disclosure', () => {
  const copy = `${CURATOR_HTML}\n${CURATOR_JS}`;
  for (const statement of [
    'I confirm this edition contains no PHI, learner data, evaluations, credentials, private contact details, or access codes.',
    'I confirm every linked local clinical protocol is an official HTTPS institutional source.',
    'I reviewed both the desktop and 390 px mobile student previews.',
    'I understand anyone may forward this account-free link and I cannot revoke this edition from the link.',
  ]) assert.equal(copy.includes(statement), true, statement);
  for (const label of ['Destination site', 'Audience', 'Fingerprint', 'Core revision', 'Catalog revision', 'Reference set digest', 'Renderer revision', 'Desktop preview', '390 px mobile preview']) assert.equal(copy.includes(label), true, label);
  assert.match(copy, /operator identity is not digitally verified/i); assert.match(copy, /publication governance[^<]*(?:disabled|enabled)/i);
  assert.match(copy, /public operational guidance only/i); assert.match(copy, /fragment is not intentionally sent to the host/i);
  for (const risk of ['browser history', 'clipboard tools', 'extensions', 'screenshots', 'recipients', 'forwarded messages']) assert.equal(copy.toLowerCase().includes(risk), true, risk);
  assert.match(CURATOR_HTML, /id="curatorGenerate" disabled aria-disabled="true"/);
});

test('Step 5 resolved card distinguishes self-attestation from every exact catalog verification row', async () => {
  const reviewed = await reviewedDraft();
  const evidence = {
    contentDigest: reviewed.candidate.contentDigest, referenceSetDigest: reviewed.candidate.referenceSetDigest,
    fingerprint: reviewed.candidate.fingerprint, currentCoreRevision: CORE_REVISION,
    currentCatalogRevision: CATALOG_REVISION, rendererRevision: 'rotation-edition-v2-r1',
  };
  const markup = fn('fdCuratorStepFiveMarkup')(reviewed.draft, reviewed.candidate.displayModel, evidence, null, LOCATION, '');
  assert.match(markup, /data-curator-edition-checked-on[^>]*>[^<]*Self-attested/);
  assert.match(markup, /Catalog verification provenance/);
  const rows = [...markup.matchAll(/<li data-curator-provenance-row><span data-curator-provenance-kind>([^<]+)<\/span><span data-curator-provenance-label>([^<]+)<\/span><time data-curator-provenance-verified-on datetime="([^"]+)">([^<]+)<\/time><\/li>/g)]
    .map((match) => [match[1], match[2], match[3], match[4]]);
  assert.deepEqual(rows, [
    ['trainingLocation', 'Example Unit', '2026-08-19', '2026-08-19'],
    ['curatorProfile', 'Example Faculty', '2026-08-19', '2026-08-19'],
    ['phraseSet', 'Reviewed wording', '2026-08-19', '2026-08-19'],
  ]);
});

test('Step 5 renders exact created-against/current revision comparisons for both match and drift', async () => {
  function value(markup, attribute) {
    const match = markup.match(new RegExp(`data-curator-${attribute}[^>]*>([^<]+)<`));
    assert.ok(match, attribute); return match[1];
  }
  function assertRevisions(markup, expected) {
    for (const [attribute, exact] of Object.entries(expected)) assert.equal(value(markup, attribute), exact, attribute);
  }
  const reviewed = await reviewedDraft();
  const evidence = {
    contentDigest: reviewed.candidate.contentDigest, referenceSetDigest: reviewed.candidate.referenceSetDigest,
    fingerprint: reviewed.candidate.fingerprint, currentCoreRevision: CORE_REVISION,
    currentCatalogRevision: CATALOG_REVISION, rendererRevision: 'rotation-edition-v2-r1',
  };
  let markup = fn('fdCuratorStepFiveMarkup')(reviewed.draft, reviewed.candidate.displayModel, evidence, null, LOCATION, '');
  for (const label of [
    'Created-against Core revision', 'Current Core revision', 'Core revision status',
    'Created-against Catalog revision', 'Current Catalog revision', 'Catalog revision status',
  ]) assert.equal(markup.includes(label), true, label);
  assertRevisions(markup, {
    'created-core-revision': CORE_REVISION, 'current-core-revision': CORE_REVISION, 'core-revision-status': 'Matches current',
    'created-catalog-revision': CATALOG_REVISION, 'current-catalog-revision': CATALOG_REVISION, 'catalog-revision-status': 'Matches current',
  });

  const oldCore = '4'.repeat(40); const oldCatalog = `sha256-${'E'.repeat(43)}`;
  const oldConfig = structuredClone(reviewed.candidate.config);
  oldConfig.createdAgainstCoreRevision = oldCore; oldConfig.createdAgainstLocalCatalogRevision = oldCatalog;
  const made = await fn('fdEditionCreateEnvelope')(oldConfig, index(), SNAPSHOT, contractContext(), VALIDATION, webcrypto.subtle);
  assert.equal(made.ok, true, JSON.stringify(made));
  const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.begin();
  const imported = await fn('fdCuratorImportBackup')(JSON.stringify(made.envelope), index(), context(), SNAPSHOT, VALIDATION, webcrypto.subtle, sequence);
  assert.equal(imported.ok, true, JSON.stringify(imported));
  const live = reduce(completedDraft(), { type: 'IMPORT_SUCCEEDED', result: imported, sequence }, transactions);
  const drift = await candidateFor(live); assert.equal(drift.ok, true, JSON.stringify(drift));
  markup = fn('fdCuratorStepFiveMarkup')(live, drift.displayModel, {
    contentDigest: drift.contentDigest, referenceSetDigest: drift.referenceSetDigest, fingerprint: drift.fingerprint,
    currentCoreRevision: CORE_REVISION, currentCatalogRevision: CATALOG_REVISION, rendererRevision: 'rotation-edition-v2-r1',
  }, null, LOCATION, '');
  assertRevisions(markup, {
    'created-core-revision': oldCore, 'current-core-revision': CORE_REVISION, 'core-revision-status': 'Drift detected',
    'created-catalog-revision': oldCatalog, 'current-catalog-revision': CATALOG_REVISION, 'catalog-revision-status': 'Drift detected',
  });
});

test('health fails closed for disabled and forged projections, incomplete/ineligible drafts, and every missing review gate', async () => {
  const health = fn('fdCuratorHealth');
  const base = await reviewedDraft();
  const disabled = await health(base.draft, index(), DISABLED_SNAPSHOT, context('disabled'), VALIDATION, webcrypto.subtle);
  assert.deepEqual(disabled, { ok: false, code: 'CURATOR_PUBLICATION_DISABLED' });
  assertBlocked(await health(base.draft, index(), structuredClone(SNAPSHOT), context(), VALIDATION, webcrypto.subtle));
  assertBlocked(await health(fn('fdCuratorNewDraft')(index(), context()), index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle));
  const ineligible = structuredClone(base.draft); ineligible.config.context.curatorProfileKey = 'curator.other@v1';
  assertBlocked(await health(ineligible, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle));

  for (const [label, mutate] of [
    ['desktop missing', (d) => { d.previewReceipts.desktop = null; }],
    ['mobile missing', (d) => { d.previewReceipts.mobile = null; }],
    ['content stale', (d) => { d.previewReceipts.desktop.contentDigest = `sha256-${'A'.repeat(43)}`; }],
    ['reference stale', (d) => { d.previewReceipts.desktop.referenceSetDigest = `sha256-${'B'.repeat(43)}`; }],
    ['core stale', (d) => { d.previewReceipts.desktop.currentCoreRevision = '4'.repeat(40); }],
    ['catalog stale', (d) => { d.previewReceipts.desktop.currentCatalogRevision = `sha256-${'E'.repeat(43)}`; }],
    ['renderer stale', (d) => { d.previewReceipts.desktop.rendererRevision = 'rotation-edition-v2-old'; }],
    ['desktop preset stale', (d) => { d.previewReceipts.desktop.previewPreset = 'mobile-390'; }],
    ['mobile preset stale', (d) => { d.previewReceipts.mobile.previewPreset = 'desktop'; }],
    ['malformed receipt', (d) => { d.previewReceipts.mobile = []; }],
    ['extra receipt field', (d) => { d.previewReceipts.desktop.unreviewed = true; }],
  ]) {
    const draft = structuredClone(base.draft); mutate(draft);
    const result = await health(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle);
    assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED', label);
  }
  {
    const draft = structuredClone(base.draft); let reads = 0;
    Object.defineProperty(draft.previewReceipts.desktop, 'contentDigest', { enumerable: true, get() { reads += 1; return base.candidate.contentDigest; } });
    const result = await health(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle);
    assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED'); assert.equal(reads, 0, 'receipt accessors are never invoked');
  }
  for (const name of ['publicSafe', 'officialLinks', 'previewsReviewed', 'forwardable']) {
    const draft = structuredClone(base.draft); draft.affirmations[name] = false;
    const result = await health(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle);
    assertBlocked(result); assert.equal(result.code, name === 'previewsReviewed' ? 'CURATOR_REVIEW_REQUIRED' : 'CURATOR_AFFIRMATION_REQUIRED', name);
  }
});

test('health takes one closed current-site snapshot and rejects every mismatch or hostile shape', async () => {
  const health = fn('fdCuratorHealth'); const { draft } = await reviewedDraft();
  for (const [label, site] of [
    ['audience', { ...context(), audience: 'resident' }],
    ['path', { ...context(), pathId: 'resident-four-week' }],
    ['core', { ...context(), coreRevision: '4'.repeat(40) }],
    ['catalog', { ...context(), localCatalogRevision: `sha256-${'E'.repeat(43)}` }],
    ['gate', { ...context(), rotationEditionV2: 'disabled' }],
    ['extra', { ...context(), unreviewed: true }],
    ['malformed', { audience: 'ms3' }],
  ]) assertBlocked(await health(draft, index(), SNAPSHOT, site, VALIDATION, webcrypto.subtle), label);

  let reads = 0; const accessor = { ...context() };
  Object.defineProperty(accessor, 'coreRevision', { enumerable: true, get() { reads += 1; return CORE_REVISION; } });
  assertBlocked(await health(draft, index(), SNAPSHOT, accessor, VALIDATION, webcrypto.subtle)); assert.equal(reads, 0);
  const revoked = Proxy.revocable(context(), {}); revoked.revoke();
  assertBlocked(await health(draft, index(), SNAPSHOT, revoked.proxy, VALIDATION, webcrypto.subtle));

  let snapshots = 0; const stable = context();
  const stateful = new Proxy(stable, {
    ownKeys(target) { snapshots += 1; return snapshots <= 2 ? Reflect.ownKeys(target) : [...Reflect.ownKeys(target), 'changed']; },
    getOwnPropertyDescriptor(target, key) { return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  const result = await health(draft, index(), SNAPSHOT, stateful, VALIDATION, webcrypto.subtle);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(snapshots, 2, 'health performs one validation observation and one late-freshness observation');
});

test('health re-observes live core and catalog context after delayed validation before accepting receipts', async () => {
  const health = fn('fdCuratorHealth');
  for (const [label, mutate, expectedCode] of [
    ['core', (site) => { site.coreRevision = '4'.repeat(40); }, 'CURATOR_REVIEW_REQUIRED'],
    ['catalog', (site) => { site.localCatalogRevision = `sha256-${'E'.repeat(43)}`; }, 'CURATOR_SITE_INVALID'],
  ]) {
    const reviewed = await reviewedDraft(); const target = canonical(reviewed.candidate.envelopePreimage); const liveSite = context();
    let enter; let release; let held = false;
    const entered = new Promise((resolve) => { enter = resolve; }); const gate = new Promise((resolve) => { release = resolve; });
    const subtle = {
      digest(algorithm, bytes) {
        const real = () => webcrypto.subtle.digest(algorithm, bytes);
        if (!held && new TextDecoder().decode(bytes) === target) { held = true; enter(); return gate.then(real); }
        return real();
      },
    };
    const pending = health(reviewed.draft, index(), SNAPSHOT, liveSite, VALIDATION, subtle);
    await entered; mutate(liveSite); release();
    const result = await pending; assertBlocked(result); assert.equal(result.code, expectedCode, label);
    assert.equal(reviewed.draft.publication.lastGenerated, null); assert.equal(reviewed.draft.publication.baseEnvelope, null);
  }
});

test('health revalidates with Web Crypto and exposes only a closed non-envelope receipt', async () => {
  const { draft, candidate } = await reviewedDraft();
  let calls = 0;
  const subtle = { digest(...args) { calls += 1; return webcrypto.subtle.digest(...args); } };
  const result = await fn('fdCuratorHealth')(draft, index(), SNAPSHOT, context(), VALIDATION, subtle);
  assert.equal(result.ok, true); assert.equal(result.code, 'CURATOR_HEALTHY'); assert.ok(calls >= 3, calls);
  assertExactKeys(result, ['ok', 'code', 'contentDigest', 'referenceSetDigest', 'fingerprint', 'currentCoreRevision', 'currentCatalogRevision', 'rendererRevision', 'displayModel']);
  assert.equal(result.contentDigest, candidate.contentDigest); assert.equal(Object.hasOwn(result, 'envelope'), false);
  const rejected = await fn('fdCuratorHealth')(draft, index(), SNAPSHOT, context(), VALIDATION, { digest() { return Promise.reject(new Error('crypto unavailable')); } });
  assertBlocked(rejected);
});

test('student base URL accepts only a descriptor-safe same-origin curator location snapshot', () => {
  const base = fn('fdCuratorStudentBaseUrl');
  assert.equal(base(LOCATION), 'https://clerkship.example/');
  assert.equal(base({ ...LOCATION, protocol: 'http:', host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173' }), 'http://127.0.0.1:4173/');
  assert.equal(base({ ...LOCATION, unreviewed: true }), '');
  assert.equal(base({ ...LOCATION, origin: 'https://other.example' }), '');
  assert.equal(base({ ...LOCATION, pathname: '/wrong.html' }), '');
  assert.equal(base({ ...LOCATION, search: '?next=other' }), '');
  assert.equal(base({ ...LOCATION, hash: '#edition=old' }), '');
  let reads = 0; const hostile = { ...LOCATION }; Object.defineProperty(hostile, 'origin', { enumerable: true, get() { reads += 1; return LOCATION.origin; } });
  assert.equal(base(hostile), ''); assert.equal(reads, 0);
  const revoked = Proxy.revocable({ ...LOCATION }, {}); revoked.revoke(); assert.equal(base(revoked.proxy), '');
  let snapshots = 0; const stateful = new Proxy({ ...LOCATION }, {
    ownKeys(target) { snapshots += 1; return snapshots === 1 ? Reflect.ownKeys(target) : [...Reflect.ownKeys(target), 'changed']; },
    getOwnPropertyDescriptor(target, key) { return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  assert.equal(base(stateful), 'https://clerkship.example/'); assert.equal(snapshots, 1);
});

test('blocking share failures yield no artifact and cannot change state', async () => {
  const build = fn('fdCuratorBuildShare');
  const { draft } = await reviewedDraft();
  const before = canonical(draft);
  for (const [label, badDraft, snapshot, site, location, subtle] of [
    ['disabled', draft, DISABLED_SNAPSHOT, context('disabled'), LOCATION, webcrypto.subtle],
    ['wrong origin', draft, SNAPSHOT, context(), { ...LOCATION, origin: 'https://other.example' }, webcrypto.subtle],
    ['wrong path', draft, SNAPSHOT, context(), { ...LOCATION, pathname: '/index.html' }, webcrypto.subtle],
    ['crypto', draft, SNAPSHOT, context(), LOCATION, { digest() { return Promise.reject(new Error('no crypto')); } }],
  ]) {
    const result = await build(badDraft, index(), snapshot, site, VALIDATION, subtle, location);
    assertBlocked(result); assert.equal(canonical(draft), before, label);
  }
});

test('BuildShare independently enforces every health gate without trusting a prior health result', async () => {
  const build = fn('fdCuratorBuildShare'); const base = await reviewedDraft();
  const incomplete = F.fdCuratorNewDraft(index(), context());
  assertBlocked(await build(incomplete, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION));
  assertBlocked(await build(base.draft, index(), structuredClone(SNAPSHOT), context(), VALIDATION, webcrypto.subtle, LOCATION));
  {
    const draft = structuredClone(base.draft); draft.config.context.curatorProfileKey = 'curator.other@v1';
    assertBlocked(await build(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION));
  }
  for (const [label, mutate] of [
    ['desktop missing', (d) => { d.previewReceipts.desktop = null; }],
    ['mobile missing', (d) => { d.previewReceipts.mobile = null; }],
    ['content stale', (d) => { d.previewReceipts.desktop.contentDigest = `sha256-${'A'.repeat(43)}`; }],
    ['reference stale', (d) => { d.previewReceipts.mobile.referenceSetDigest = `sha256-${'B'.repeat(43)}`; }],
    ['core stale', (d) => { d.previewReceipts.desktop.currentCoreRevision = '4'.repeat(40); }],
    ['catalog stale', (d) => { d.previewReceipts.mobile.currentCatalogRevision = `sha256-${'E'.repeat(43)}`; }],
    ['renderer stale', (d) => { d.previewReceipts.desktop.rendererRevision = 'rotation-edition-v2-old'; }],
    ['desktop preset stale', (d) => { d.previewReceipts.desktop.previewPreset = 'mobile-390'; }],
    ['mobile preset stale', (d) => { d.previewReceipts.mobile.previewPreset = 'desktop'; }],
    ['malformed', (d) => { d.previewReceipts.desktop = {}; }],
    ['extra', (d) => { d.previewReceipts.mobile.extra = true; }],
  ]) {
    const draft = structuredClone(base.draft); mutate(draft);
    const result = await build(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION);
    assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED', label);
  }
  {
    const draft = structuredClone(base.draft); let reads = 0;
    Object.defineProperty(draft.previewReceipts.mobile, 'previewPreset', { enumerable: true, get() { reads += 1; return 'mobile-390'; } });
    assertBlocked(await build(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION)); assert.equal(reads, 0);
  }
  for (const name of ['publicSafe', 'officialLinks', 'previewsReviewed', 'forwardable']) {
    const draft = structuredClone(base.draft); draft.affirmations[name] = false;
    assertBlocked(await build(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION));
  }
  for (const site of [
    { ...context(), audience: 'resident' }, { ...context(), pathId: 'resident-four-week' },
    { ...context(), coreRevision: '4'.repeat(40) }, { ...context(), localCatalogRevision: `sha256-${'E'.repeat(43)}` },
    { ...context(), rotationEditionV2: 'disabled' }, { ...context(), extra: true }, { audience: 'ms3' },
  ]) assertBlocked(await build(base.draft, index(), SNAPSHOT, site, VALIDATION, webcrypto.subtle, LOCATION));

  let siteReads = 0; const accessorSite = { ...context() };
  Object.defineProperty(accessorSite, 'audience', { enumerable: true, get() { siteReads += 1; return 'ms3'; } });
  assertBlocked(await build(base.draft, index(), SNAPSHOT, accessorSite, VALIDATION, webcrypto.subtle, LOCATION)); assert.equal(siteReads, 0);
  const revokedSite = Proxy.revocable(context(), {}); revokedSite.revoke();
  assertBlocked(await build(base.draft, index(), SNAPSHOT, revokedSite.proxy, VALIDATION, webcrypto.subtle, LOCATION));

  let locationReads = 0; const accessorLocation = { ...LOCATION };
  Object.defineProperty(accessorLocation, 'origin', { enumerable: true, get() { locationReads += 1; return LOCATION.origin; } });
  assertBlocked(await build(base.draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, accessorLocation)); assert.equal(locationReads, 0);
  const revokedLocation = Proxy.revocable({ ...LOCATION }, {}); revokedLocation.revoke();
  assertBlocked(await build(base.draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, revokedLocation.proxy));
});

test('Health and BuildShare use only descriptor-captured receipt and affirmation evidence at every level', async () => {
  function masquerade(descriptorValues, ordinaryValues) {
    const stats = { gets: 0 };
    const proxy = new Proxy(descriptorValues, {
      get(_target, key) { stats.gets += 1; return ordinaryValues[key]; },
    });
    return { proxy, stats };
  }
  const reviewed = await reviewedDraft();
  const invalidReceipt = (preset) => ({
    contentDigest: `sha256-${'A'.repeat(43)}`, referenceSetDigest: `sha256-${'B'.repeat(43)}`,
    currentCoreRevision: '4'.repeat(40), currentCatalogRevision: `sha256-${'E'.repeat(43)}`,
    rendererRevision: 'rotation-edition-v2-old', previewPreset: preset,
  });
  const outerReceipts = masquerade({ desktop: null, mobile: null }, reviewed.draft.previewReceipts);
  const outerAffirmations = masquerade({ publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false }, reviewed.draft.affirmations);
  const desktopReceipt = masquerade(invalidReceipt('desktop'), reviewed.draft.previewReceipts.desktop);
  const mobileReceipt = masquerade(invalidReceipt('mobile-390'), reviewed.draft.previewReceipts.mobile);
  const cases = [
    {
      label: 'container descriptors',
      state: { ...reviewed.draft, previewReceipts: outerReceipts.proxy, affirmations: outerAffirmations.proxy },
      stats: [outerReceipts.stats, outerAffirmations.stats],
    },
    {
      label: 'receipt descriptors',
      state: { ...reviewed.draft, previewReceipts: { desktop: desktopReceipt.proxy, mobile: mobileReceipt.proxy } },
      stats: [desktopReceipt.stats, mobileReceipt.stats],
    },
  ];
  for (const item of cases) {
    const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.beginGeneration();
    const health = await fn('fdCuratorHealth')(item.state, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle);
    const share = await fn('fdCuratorBuildShare')(item.state, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION, sequence);
    const applied = reduce(item.state, { type: 'GENERATION_SUCCEEDED', result: share, sequence }, transactions);
    assert.deepEqual({ health: health.ok, share: share.ok, installed: applied !== item.state }, {
      health: false, share: false, installed: false,
    }, item.label);
    for (const stats of item.stats) assert.equal(stats.gets, 0, `${item.label}: zero ordinary Proxy gets`);
    assert.equal(item.state.publication.baseEnvelope, null, item.label);
    assert.equal(item.state.publication.lastGenerated, null, item.label);
  }
});

test('Health evaluates one closed full draft rather than a later review or config view', async () => {
  function alternating(invalid, valid) {
    const stats = { snapshots: 0, gets: 0 };
    const proxy = new Proxy(invalid, {
      ownKeys() { stats.snapshots += 1; return Reflect.ownKeys(stats.snapshots === 2 ? valid : invalid); },
      getOwnPropertyDescriptor(_target, key) { return Reflect.getOwnPropertyDescriptor(stats.snapshots === 2 ? valid : invalid, key); },
      get(_target, key) { stats.gets += 1; return valid[key]; },
    });
    return { proxy, stats };
  }
  const reviewed = await reviewedDraft();
  const receipts = alternating({ desktop: null, mobile: null }, reviewed.draft.previewReceipts);
  const affirmations = alternating(
    { publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false },
    reviewed.draft.affirmations,
  );
  let result = await fn('fdCuratorHealth')(
    { ...reviewed.draft, previewReceipts: receipts.proxy, affirmations: affirmations.proxy },
    index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle,
  );
  assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED');
  assert.deepEqual([receipts.stats, affirmations.stats], [{ snapshots: 1, gets: 0 }, { snapshots: 1, gets: 0 }]);

  const descriptorConfig = structuredClone(reviewed.draft.config); descriptorConfig.context.rotationEnd = '2026-10-13';
  const config = alternating(descriptorConfig, reviewed.draft.config);
  result = await fn('fdCuratorHealth')(
    { ...reviewed.draft, config: config.proxy }, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle,
  );
  assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED');
  assert.deepEqual(config.stats, { snapshots: 1, gets: 0 });
});

test('BuildShare cannot alternate invalid signature evidence with valid Health review evidence', async () => {
  function alternatingReview(invalid, valid) {
    const stats = { snapshots: 0, gets: 0 };
    const proxy = new Proxy(invalid, {
      ownKeys() { stats.snapshots += 1; return Reflect.ownKeys(stats.snapshots === 2 || stats.snapshots === 3 ? valid : invalid); },
      getOwnPropertyDescriptor(_target, key) {
        return Reflect.getOwnPropertyDescriptor(stats.snapshots === 2 || stats.snapshots === 3 ? valid : invalid, key);
      },
      get(_target, key) { stats.gets += 1; return valid[key]; },
    });
    return { proxy, stats };
  }
  const reviewed = await reviewedDraft();
  const receipts = alternatingReview({ desktop: null, mobile: null }, reviewed.draft.previewReceipts);
  const affirmations = alternatingReview(
    { publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false },
    reviewed.draft.affirmations,
  );
  const draft = { ...reviewed.draft, previewReceipts: receipts.proxy, affirmations: affirmations.proxy };
  const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.beginGeneration();
  const result = await fn('fdCuratorBuildShare')(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION, sequence);
  assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED');
  assert.deepEqual({ receipts: receipts.stats, affirmations: affirmations.stats }, {
    receipts: { snapshots: 1, gets: 0 }, affirmations: { snapshots: 1, gets: 0 },
  });
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions), draft);
  assert.equal(draft.publication.baseEnvelope, null); assert.equal(draft.publication.lastGenerated, null);
});

test('BuildShare validates and publishes only one descriptor-captured full draft snapshot', async () => {
  const reviewed = await reviewedDraft();
  const descriptorConfig = structuredClone(reviewed.draft.config);
  descriptorConfig.context.rotationEnd = '2026-10-13';
  const stats = { snapshots: 0, gets: 0 };
  const config = new Proxy(descriptorConfig, {
    ownKeys(target) { stats.snapshots += 1; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { return Reflect.getOwnPropertyDescriptor(target, key); },
    get(_target, key) { stats.gets += 1; return reviewed.draft.config[key]; },
  });
  const draft = { ...reviewed.draft, config };
  const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.beginGeneration();
  const result = await fn('fdCuratorBuildShare')(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION, sequence);
  assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED');
  assert.equal(stats.snapshots, 1); assert.equal(stats.gets, 0);
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions), draft);
  assert.equal(draft.publication.baseEnvelope, null); assert.equal(draft.publication.lastGenerated, null);
});

test('action reducer executes one exact descriptor-captured action instead of a get-trap type switch', () => {
  const stats = { ownKeys: 0, descriptors: Object.create(null), gets: 0 };
  const action = new Proxy({ type: 'SET_STEP', step: 2 }, {
    ownKeys(target) { stats.ownKeys += 1; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) {
      stats.descriptors[key] = (stats.descriptors[key] || 0) + 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get(_target, key) {
      stats.gets += 1;
      if (key === 'type') return 'SET_AFFIRMATION';
      if (key === 'name') return 'publicSafe';
      if (key === 'value') return true;
      return undefined;
    },
  });
  const draft = fn('fdCuratorNewDraft')(index(), context());
  const applied = reduce(draft, action);
  assert.notEqual(applied, draft); assert.equal(applied.step, 2); assert.equal(applied.affirmations.publicSafe, false);
  assert.equal(stats.ownKeys, 1); assert.deepEqual({ ...stats.descriptors }, { type: 1, step: 1 }); assert.equal(stats.gets, 0);
});

test('an old branded import result cannot be relabeled under a fresh import sequence', async () => {
  const reviewed = await reviewedDraft();
  const envelope = { ...reviewed.candidate.envelopePreimage, digest: reviewed.candidate.contentDigest };
  assert.deepEqual(await fn('fdCuratorImportBackup')(
    JSON.stringify(envelope), index(), context(), SNAPSHOT, VALIDATION, webcrypto.subtle,
  ), { ok: false, code: 'CURATOR_IMPORT_INVALID' }, 'the legacy six-argument path cannot mint reducer authority');
  const transactions = fn('fdCuratorImportTransactions')(); const oldSequence = transactions.begin();
  const imported = await fn('fdCuratorImportBackup')(
    JSON.stringify(envelope), index(), context(), SNAPSHOT, VALIDATION, webcrypto.subtle, oldSequence,
  );
  assert.equal(imported.ok, true, JSON.stringify(imported));
  transactions.cancel(); const freshSequence = transactions.begin();
  const draft = fn('fdCuratorNewDraft')(index(), context());
  const applied = reduce(draft, { type: 'IMPORT_SUCCEEDED', result: imported, sequence: freshSequence }, transactions);
  assert.equal(applied, draft); assert.equal(applied.publication.baseEnvelope, null); assert.equal(applied.publication.lastGenerated, null);
});

test('BuildShare snapshots untrusted site and location descriptors once, then uses only closed captured values', async () => {
  const { draft } = await reviewedDraft(); let siteSnapshots = 0; let locationSnapshots = 0;
  const site = new Proxy(context(), {
    ownKeys(target) { siteSnapshots += 1; return siteSnapshots === 1 ? Reflect.ownKeys(target) : [...Reflect.ownKeys(target), 'changed']; },
    getOwnPropertyDescriptor(target, key) { return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  const location = new Proxy({ ...LOCATION }, {
    ownKeys(target) { locationSnapshots += 1; return locationSnapshots === 1 ? Reflect.ownKeys(target) : [...Reflect.ownKeys(target), 'changed']; },
    getOwnPropertyDescriptor(target, key) { return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  const result = await fn('fdCuratorBuildShare')(draft, index(), SNAPSHOT, site, VALIDATION, webcrypto.subtle, location, 1);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(siteSnapshots, 1); assert.equal(locationSnapshots, 1);
});

test('BuildShare detects draft mutation during delayed crypto and never publishes the stale candidate', async () => {
  const reviewed = await reviewedDraft(); const target = canonical(reviewed.candidate.envelopePreimage);
  const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.beginGeneration();
  let enter; let release; let held = false;
  const entered = new Promise((resolve) => { enter = resolve; }); const gate = new Promise((resolve) => { release = resolve; });
  const subtle = {
    digest(algorithm, bytes) {
      const real = () => webcrypto.subtle.digest(algorithm, bytes);
      if (!held && new TextDecoder().decode(bytes) === target) { held = true; enter(); return gate.then(real); }
      return real();
    },
  };
  const pending = fn('fdCuratorBuildShare')(reviewed.draft, index(), SNAPSHOT, context(), VALIDATION, subtle, LOCATION);
  await entered; reviewed.draft.config.context.rotationEnd = '2026-10-13'; release();
  const result = await pending; assertBlocked(result); assert.equal(result.code, 'CURATOR_STATE_CHANGED');
  assert.equal(reviewed.draft.publication.lastGenerated, null); assert.equal(reviewed.draft.publication.baseEnvelope, null);
  assert.equal(reduce(reviewed.draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions), reviewed.draft);
});

test('BuildShare uses its one closed current-site snapshot throughout delayed crypto', async () => {
  const reviewed = await reviewedDraft(); const target = canonical(reviewed.candidate.envelopePreimage); const liveSite = context();
  let enter; let release; let held = false;
  const entered = new Promise((resolve) => { enter = resolve; }); const gate = new Promise((resolve) => { release = resolve; });
  const subtle = {
    digest(algorithm, bytes) {
      const real = () => webcrypto.subtle.digest(algorithm, bytes);
      if (!held && new TextDecoder().decode(bytes) === target) { held = true; enter(); return gate.then(real); }
      return real();
    },
  };
  const pending = fn('fdCuratorBuildShare')(reviewed.draft, index(), SNAPSHOT, liveSite, VALIDATION, subtle, LOCATION, 1);
  await entered; liveSite.coreRevision = '4'.repeat(40); liveSite.rotationEditionV2 = 'disabled'; release();
  const result = await pending; assert.equal(result.ok, true, JSON.stringify(result));
});

test('a semantic edit after both reviews is revalidated and blocked before sharing', async () => {
  const reviewed = await reviewedDraft(); const edited = reduce(reviewed.draft, { type: 'SET_ROTATION_END', value: '2026-10-13' });
  assert.notEqual(edited, reviewed.draft); assert.equal(edited.previewReceipts.desktop, null); assert.equal(edited.previewReceipts.mobile, null);
  const result = await fn('fdCuratorBuildShare')(edited, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION);
  assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED');
});

function capabilityPoison() {
  const empty = { storage: 0, clipboard: 0, network: 0, blob: 0, url: 0, dom: 0, clock: 0 };
  const ledger = { ...empty };
  function poisonObject(bucket) {
    return new Proxy({}, {
      get() { ledger[bucket] += 1; throw new Error(`${bucket} capability accessed`); },
      set() { ledger[bucket] += 1; throw new Error(`${bucket} capability changed`); },
      ownKeys() { ledger[bucket] += 1; throw new Error(`${bucket} capability inspected`); },
      getOwnPropertyDescriptor() { ledger[bucket] += 1; throw new Error(`${bucket} capability inspected`); },
    });
  }
  function poisonCallable(bucket) {
    return new Proxy(function PoisonedCapability() {}, { apply() { ledger[bucket] += 1; throw new Error(`${bucket} called`); }, construct() { ledger[bucket] += 1; throw new Error(`${bucket} constructed`); }, get() { ledger[bucket] += 1; throw new Error(`${bucket} accessed`); } });
  }
  const clipboard = poisonObject('clipboard'); const capabilities = {
    localStorage: poisonObject('storage'), navigator: new Proxy({ clipboard }, { get(target, key) { if (key === 'clipboard') return target.clipboard; ledger.clipboard += 1; throw new Error('navigator accessed'); } }),
    document: poisonObject('dom'), fetch() { ledger.network += 1; throw new Error('network accessed'); },
    Blob: poisonCallable('blob'), URL: poisonCallable('url'), XMLHttpRequest: poisonCallable('network'), Image: poisonCallable('network'),
    WebSocket: poisonCallable('network'), EventSource: poisonCallable('network'), importScripts: poisonCallable('network'), sendBeacon: poisonCallable('network'),
    window: poisonObject('network'), globalThis: poisonObject('network'), location: poisonObject('network'), performance: poisonObject('clock'),
    Date: class SafeDate extends Date { static now() { ledger.clock += 1; throw new Error('clock accessed'); } },
  };
  return { ledger, empty, capabilities, reset() { for (const key of Object.keys(ledger)) ledger[key] = 0; } };
}

test('blocking share is capability-pure: no storage, clipboard, network, blob, URL, DOM, download, or clock access', async () => {
  const poison = capabilityPoison(); const { ledger, empty } = poison; const api = loadApi(JSON, poison.capabilities);
  const snapshot = await makeSnapshot('enabled', api); const reviewed = await reviewedDraft(null, api, snapshot);
  reviewed.draft.previewReceipts.mobile.previewPreset = 'desktop';
  poison.reset();
  const before = canonical(reviewed.draft);
  const result = await api.fdCuratorBuildShare(reviewed.draft, index(), snapshot, context(), VALIDATION, webcrypto.subtle, LOCATION);
  assertBlocked(result); assert.equal(result.code, 'CURATOR_REVIEW_REQUIRED'); assert.equal(canonical(reviewed.draft), before);
  assert.deepEqual(ledger, empty);
});

test('every blocking gate is artifact-free, capability-pure, input-pure, and reducer-untrusted', async () => {
  const poison = capabilityPoison(); const api = loadApi(JSON, poison.capabilities);
  const snapshot = await makeSnapshot('enabled', api); const disabledSnapshot = await makeSnapshot('disabled', api);
  const reviewed = await reviewedDraft(null, api, snapshot); const base = reviewed.draft;
  function changed(mutate) { const draft = structuredClone(base); mutate(draft); return draft; }
  const receiptCases = [
    ['desktop missing', (d) => { d.previewReceipts.desktop = null; }], ['mobile missing', (d) => { d.previewReceipts.mobile = null; }],
    ['content', (d) => { d.previewReceipts.desktop.contentDigest = `sha256-${'A'.repeat(43)}`; }],
    ['reference', (d) => { d.previewReceipts.mobile.referenceSetDigest = `sha256-${'B'.repeat(43)}`; }],
    ['core', (d) => { d.previewReceipts.desktop.currentCoreRevision = '4'.repeat(40); }],
    ['catalog', (d) => { d.previewReceipts.mobile.currentCatalogRevision = `sha256-${'E'.repeat(43)}`; }],
    ['renderer', (d) => { d.previewReceipts.desktop.rendererRevision = 'old'; }],
    ['desktop preset', (d) => { d.previewReceipts.desktop.previewPreset = 'mobile-390'; }],
    ['mobile preset', (d) => { d.previewReceipts.mobile.previewPreset = 'desktop'; }],
    ['malformed', (d) => { d.previewReceipts.desktop = []; }], ['extra', (d) => { d.previewReceipts.mobile.extra = true; }],
  ].map(([label, mutate]) => ({ label: `receipt ${label}`, draft: changed(mutate) }));
  const affirmationCases = ['publicSafe', 'officialLinks', 'previewsReviewed', 'forwardable'].map((name) => ({ label: `affirmation ${name}`, draft: changed((d) => { d.affirmations[name] = false; }) }));
  const ineligible = changed((d) => { d.config.context.curatorProfileKey = 'curator.other@v1'; });
  const longFixture = findLengthDraft(16001, 17000); const longReviewed = await reviewedDraft(longFixture, api, snapshot);
  const revokedSite = Proxy.revocable(context(), {}); revokedSite.revoke(); const revokedLocation = Proxy.revocable({ ...LOCATION }, {}); revokedLocation.revoke();
  const cases = [
    { label: 'disabled', draft: base, snapshot: disabledSnapshot, site: context('disabled') },
    { label: 'forged snapshot', draft: base, snapshot: structuredClone(snapshot) },
    { label: 'incomplete', draft: api.fdCuratorNewDraft(index(), context()) }, { label: 'ineligible', draft: ineligible },
    ...receiptCases, ...affirmationCases,
    { label: 'audience', draft: base, site: { ...context(), audience: 'resident' } },
    { label: 'path', draft: base, site: { ...context(), pathId: 'resident-four-week' } },
    { label: 'site core', draft: base, site: { ...context(), coreRevision: '4'.repeat(40) } },
    { label: 'site catalog', draft: base, site: { ...context(), localCatalogRevision: `sha256-${'E'.repeat(43)}` } },
    { label: 'site gate', draft: base, site: { ...context(), rotationEditionV2: 'disabled' } },
    { label: 'site extra', draft: base, site: { ...context(), extra: true } },
    { label: 'site malformed', draft: base, site: { audience: 'ms3' } }, { label: 'site revoked', draft: base, site: revokedSite.proxy },
    { label: 'origin', draft: base, location: { ...LOCATION, origin: 'https://other.example' } },
    { label: 'path location', draft: base, location: { ...LOCATION, pathname: '/other.html' } },
    { label: 'location extra', draft: base, location: { ...LOCATION, extra: true } }, { label: 'location revoked', draft: base, location: revokedLocation.proxy },
    { label: 'crypto', draft: base, subtle: { digest() { return Promise.reject(new Error('crypto failed')); } } },
    { label: 'URL cap', draft: longReviewed.draft },
  ];
  for (const item of cases) {
    const draft = item.draft; const before = canonical(draft); const transactions = api.fdCuratorImportTransactions(); const sequence = transactions.beginGeneration(); poison.reset();
    const result = await api.fdCuratorBuildShare(draft, index(), item.snapshot || snapshot, item.site || context(), VALIDATION, item.subtle || webcrypto.subtle, item.location || LOCATION);
    assertBlocked(result); assert.equal(canonical(draft), before, item.label); assert.deepEqual(poison.ledger, poison.empty, item.label);
    const applied = reduceWith(api, draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions, snapshot, context());
    assert.equal(applied, draft, `${item.label}: blocker must carry no reducer authority`);
    assert.equal(draft.publication.lastGenerated, null, item.label); assert.equal(draft.publication.baseEnvelope, null, item.label);
  }
});

test('successful share and local QR generation never touch browser network, image, script, DOM, storage, download, or clock capabilities', async () => {
  const poison = capabilityPoison(); const { ledger, empty } = poison; const api = loadApi(JSON, poison.capabilities);
  const snapshot = await makeSnapshot('enabled', api); const { draft } = await reviewedDraft(null, api, snapshot);
  poison.reset();
  const result = await api.fdCuratorBuildShare(draft, index(), snapshot, context(), VALIDATION, webcrypto.subtle, LOCATION, 1);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.qr.ok, true); assert.match(result.qr.svg, /^<svg /);
  assert.deepEqual(ledger, empty);
});

test('BuildShare performs a distinct learner-mode decode after its fresh builder validation', async () => {
  let learnerCalls = 0; let learnerContext = null;
  const api = loadDecodeProbeApi(({ validationContext }) => {
    learnerCalls += 1; learnerContext = structuredClone(validationContext);
    return Promise.resolve({ ok: false, errors: [{ code: 'TEST_LEARNER_REJECTED' }] });
  });
  const snapshot = await makeSnapshot('enabled', api); const reviewed = await reviewedDraft(null, api, snapshot);
  const transactions = api.fdCuratorImportTransactions(); const sequence = transactions.beginGeneration();
  const target = canonical(reviewed.candidate.envelopePreimage); let builderDigests = 0;
  const subtle = {
    digest(algorithm, bytes) {
      if (new TextDecoder().decode(bytes) === target) builderDigests += 1;
      return webcrypto.subtle.digest(algorithm, bytes);
    },
  };
  const result = await api.fdCuratorBuildShare(reviewed.draft, index(), snapshot, context(), VALIDATION, subtle, LOCATION);
  assertBlocked(result); assert.equal(builderDigests, 1, 'BuildShare recomputes the exact builder envelope once');
  assert.equal(learnerCalls, 1); assert.deepEqual(learnerContext, { mode: 'learner', generationDate: '' });
  assert.equal(reduceWith(api, reviewed.draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions, snapshot, context()), reviewed.draft);
  assert.equal(reviewed.draft.publication.lastGenerated, null); assert.equal(reviewed.draft.publication.baseEnvelope, null);
});

test('BuildShare fails closed when exact backup serialization fails inside the transaction', async () => {
  let backupAttempts = 0; const poison = capabilityPoison();
  const trappedJson = {
    parse: JSON.parse,
    stringify(value) {
      if (String(new Error().stack).includes('fdCuratorBackupJson')) { backupAttempts += 1; throw new Error('backup serializer failed'); }
      return JSON.stringify(value);
    },
  };
  const api = loadApi(trappedJson, poison.capabilities); const snapshot = await makeSnapshot('enabled', api); const { draft } = await reviewedDraft(null, api, snapshot);
  const transactions = api.fdCuratorImportTransactions(); const sequence = transactions.beginGeneration(); const before = canonical(draft); poison.reset();
  const result = await api.fdCuratorBuildShare(draft, index(), snapshot, context(), VALIDATION, webcrypto.subtle, LOCATION);
  assertBlocked(result); assert.equal(backupAttempts, 1); assert.equal(canonical(draft), before); assert.deepEqual(poison.ledger, poison.empty);
  assert.equal(reduceWith(api, draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions, snapshot, context()), draft);
  assert.equal(draft.publication.lastGenerated, null); assert.equal(draft.publication.baseEnvelope, null);
});

test('successful share is recomputed, learner-revalidated, exact, same-root, and reducer-committed once', async () => {
  const { draft } = await reviewedDraft();
  const transactions = fn('fdCuratorImportTransactions')(); const sequence = transactions.beginGeneration();
  let digestCalls = 0; const subtle = { digest(...args) { digestCalls += 1; return webcrypto.subtle.digest(...args); } };
  const original = canonical(draft);
  const result = await fn('fdCuratorBuildShare')(draft, index(), SNAPSHOT, context(), VALIDATION, subtle, LOCATION, sequence);
  assert.equal(canonical(draft), original, 'pure transaction before reducer commit'); assert.ok(digestCalls >= 6, digestCalls);
  assertExactKeys(result, ['ok', 'code', 'url', 'backupJson', 'filename', 'qr']);
  assert.equal(result.ok, true); assert.equal(result.code, 'GENERATION_SUCCEEDED'); assert.match(result.url, /^https:\/\/clerkship\.example\/#edition=[A-Za-z0-9_-]+$/);
  assert.equal(result.url.split('#').length, 2, 'transport has one fragment delimiter'); assert.equal(result.url.includes('?'), false);
  assert.equal(result.url.includes('%'), false, 'transport is unescaped base64url, not percent encoding'); assert.doesNotMatch(result.url, /(?:gzip|deflate|compress)/i);
  assert.equal(result.filename, 'EXU-ms3-rotation-edition-1.json'); assert.equal(result.url.length <= 16000, true);
  assertExactKeys(result.qr, ['ok', 'code', 'svg']); assert.equal(result.qr.ok, true); assert.equal(result.qr.code, 'QR_READY');
  const envelope = JSON.parse(result.backupJson); assert.equal(result.backupJson, canonical(envelope)); assert.equal(envelope.config.editionNumber, 1);
  const payload = result.url.split('#edition=')[1];
  assert.equal(Buffer.from(payload, 'base64url').toString('utf8'), result.backupJson, 'fragment is the exact canonical envelope bytes');
  const learner = await fn('fdEditionDecodePayload')(payload, index(), SNAPSHOT, contractContext(), { mode: 'learner', generationDate: '' }, webcrypto.subtle, result.url.length);
  assert.equal(learner.ok, true, JSON.stringify(learner)); assert.deepEqual(learner.envelope, envelope);

  const publicClone = { ...result, qr: { ...result.qr } };
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result: publicClone, sequence }, transactions), draft, 'public share clones carry no reducer authority');
  result.url = 'https://attacker.invalid/#edition=forged'; result.backupJson = '{}'; result.filename = 'forged.json'; result.qr = { ok: false, code: 'QR_TOO_LONG' };
  const applied = reduce(draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions);
  assert.notEqual(applied, draft); assert.deepEqual(applied.publication.baseEnvelope, envelope); assert.deepEqual(applied.publication.lastGenerated, envelope);
  assert.equal(applied.publication.baseSemanticConfig, fn('fdEditionSemanticConfig')(envelope.config));
  const replay = reduce(applied, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions); assert.equal(replay, applied);
  const next = await candidateFor(applied); assert.equal(next.ok, true); assert.equal(next.contentDigest, envelope.digest); assert.equal(next.config.editionNumber, 1);
  const health = await fn('fdCuratorHealth')(applied, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle);
  assert.equal(health.ok, true, JSON.stringify(health));
  const regenerated = await fn('fdCuratorBuildShare')(applied, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION, transactions.currentGeneration());
  assert.equal(regenerated.ok, true, JSON.stringify(regenerated)); assert.equal(regenerated.backupJson, canonical(envelope));
});

test('generation authority is state-bound and canceled or stale completions cannot install a base', async () => {
  const { draft } = await reviewedDraft(); const transactions = fn('fdCuratorImportTransactions')();
  const staleSequence = transactions.beginGeneration();
  const staleResult = await fn('fdCuratorBuildShare')(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION, staleSequence);
  transactions.cancelGeneration();
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result: staleResult, sequence: staleSequence }, transactions), draft);
  assert.equal(draft.publication.baseEnvelope, null); assert.equal(draft.publication.lastGenerated, null);

  const liveSequence = transactions.beginGeneration();
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result: staleResult, sequence: liveSequence }, transactions), draft, 'an old branded result cannot be relabeled with a fresh generation sequence');
  assert.equal(draft.publication.baseEnvelope, null); assert.equal(draft.publication.lastGenerated, null);
  const liveResult = await fn('fdCuratorBuildShare')(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION, liveSequence);
  const changed = reduce(draft, { type: 'SET_ROTATION_END', value: '2026-10-13' });
  assert.notEqual(changed, draft); assert.equal(reduce(changed, { type: 'GENERATION_SUCCEEDED', result: liveResult, sequence: liveSequence }, transactions), changed, 'share authority is bound to the reviewed draft');
  const cloned = structuredClone(liveResult);
  assert.equal(reduce(draft, { type: 'GENERATION_SUCCEEDED', result: cloned, sequence: transactions.currentGeneration() }, transactions), draft, 'serialization cannot clone authority');
});

test('the shared publication boundary supports a reviewed resident projection and rejects an audience-crossed snapshot', async () => {
  const site = residentContext(); const sourceIndex = residentIndex(); const snapshot = await makeSnapshot('enabled', F, 'resident');
  const reduceResident = (draft, action, transactions = null) => F.fdCuratorReduce(draft, action, sourceIndex, site, snapshot, '2026-08-19', transactions);
  let draft = F.fdCuratorNewDraft(sourceIndex, site);
  for (const action of [
    { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' },
    { type: 'SET_CURATOR_PROFILE', curatorProfileKey: 'curator.example@v1' },
    { type: 'SET_PHRASE_SET', phraseSetKey: 'phrases.example@v1' },
    { type: 'SET_ROTATION_START', value: '2026-09-01' }, { type: 'SET_ROTATION_END', value: '2026-09-28' },
    { type: 'SET_EDITION_CHECKED_ON', value: '2026-08-19' },
  ]) draft = reduceResident(draft, action);
  const transactions = F.fdCuratorImportTransactions();
  for (const preset of ['desktop', 'mobile-390']) {
    const sequence = transactions.beginPreview();
    const prepared = await F.fdCuratorPreparePreview(draft, sourceIndex, snapshot, site, VALIDATION, webcrypto.subtle, preset, sequence);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const completion = completePreview(prepared, preset, sequence, transactions);
    assert.equal(completion.ok, true, JSON.stringify(completion));
    draft = reduceResident(draft, { type: 'PREVIEW_REVIEW_SUCCEEDED', preset, result: completion, sequence }, transactions);
  }
  for (const name of ['publicSafe', 'officialLinks', 'forwardable']) draft = reduceResident(draft, { type: 'SET_AFFIRMATION', name, value: true }, transactions);
  const generationSequence = transactions.beginGeneration();
  const result = await fn('fdCuratorBuildShare')(draft, sourceIndex, snapshot, site, VALIDATION, webcrypto.subtle, LOCATION, generationSequence);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.filename, 'EXU-resident-rotation-edition-1.json');
  assert.match(result.url, /^https:\/\/clerkship\.example\/#edition=[A-Za-z0-9_-]+$/); assert.equal(result.qr.ok, true);
  const payload = result.url.split('#edition=')[1];
  assert.equal(Buffer.from(payload, 'base64url').toString('utf8'), result.backupJson);
  const learnerSite = { audience: 'resident', coreRevision: CORE_REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2: 'enabled' };
  const decoded = await fn('fdEditionDecodePayload')(payload, sourceIndex, snapshot, learnerSite, { mode: 'learner', generationDate: '' }, webcrypto.subtle, result.url.length);
  assert.equal(decoded.ok, true, JSON.stringify(decoded)); assert.equal(decoded.envelope.config.audience, 'resident');
  assertBlocked(await fn('fdCuratorBuildShare')(draft, sourceIndex, SNAPSHOT, site, VALIDATION, webcrypto.subtle, LOCATION));
  const disabledSnapshot = await makeSnapshot('disabled', F, 'resident');
  const disabled = await fn('fdCuratorBuildShare')(draft, sourceIndex, disabledSnapshot, residentContext('disabled'), VALIDATION, webcrypto.subtle, LOCATION);
  assert.deepEqual(disabled, { ok: false, code: 'CURATOR_PUBLICATION_DISABLED' });
});

function expandedDraft(count, padding) {
  const draft = completedDraft();
  draft.config.pathItems = Array.from({ length: count }, (_, offset) => ({
    instanceId: `core:first.md:${offset + 1}-${'x'.repeat(padding)}`, ref: 'first.md', week: 1,
    order: offset + 1, priority: 'recommended',
  }));
  return draft;
}
function predictedUrlLength(draft) {
  const config = { audience: 'ms3', pathId: 'ms3-six-week', editionNumber: 1, createdAgainstCoreRevision: CORE_REVISION,
    createdAgainstLocalCatalogRevision: CATALOG_REVISION, context: structuredClone(draft.config.context),
    phraseSetKey: draft.config.phraseSetKey, pathItems: structuredClone(draft.config.pathItems), localPlan: {},
    changeSummary: { kindCodes: ['initial'], changedItemCount: 0 } };
  const envelope = { format: 'cw-rotation-edition', schemaVersion: 2, config, digest: `sha256-${'A'.repeat(43)}` };
  return { configBytes: Buffer.byteLength(canonical(config)), urlLength: 'https://clerkship.example/#edition='.length + Buffer.from(canonical(envelope)).toString('base64url').length };
}
function findLengthDraft(minimum, maximum) {
  for (let count = 8; count <= 96; count += 1) for (let padding = 0; padding <= 130; padding += 1) {
    const draft = expandedDraft(count, padding); const size = predictedUrlLength(draft);
    if (size.configBytes <= 12288 && size.urlLength >= minimum && size.urlLength <= maximum) return draft;
  }
  throw new Error(`no valid ${minimum}-${maximum} draft fixture`);
}

test('a valid 1,801-16,000 character share keeps its link and backup but omits QR', async () => {
  const fixture = findLengthDraft(1801, 16000); const { draft } = await reviewedDraft(fixture);
  const result = await fn('fdCuratorBuildShare')(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION, 1);
  assert.equal(result.ok, true); assert.equal(result.code, 'GENERATION_SUCCEEDED'); assert.equal(result.url.length > 1800, true); assert.equal(result.url.length <= 16000, true);
  assertExactKeys(result.qr, ['ok', 'code']); assert.deepEqual(result.qr, { ok: false, code: 'QR_TOO_LONG' });
  assert.equal(typeof result.backupJson, 'string'); assert.equal(typeof result.filename, 'string');
});

test('a valid configuration whose final URL exceeds 16,000 is blocked without generation artifacts', async () => {
  const fixture = findLengthDraft(16001, 17000); const { draft } = await reviewedDraft(fixture);
  const result = await fn('fdCuratorBuildShare')(draft, index(), SNAPSHOT, context(), VALIDATION, webcrypto.subtle, LOCATION);
  assertBlocked(result); assert.equal(result.code, 'CURATOR_URL_TOO_LONG'); assert.equal(draft.publication.lastGenerated, null);
});

test('the 12 KiB canonical-config cap blocks before and independently of the 16,000-character URL cap', async () => {
  assert.match(CURATOR_JS, /var FD_CURATOR_MAX_CONFIG_BYTES=12\*1024;/, 'the independent publication cap must remain in curator code');
  const relaxedSource = SOURCE.replace('var MAX_CONFIG_BYTES=12*1024;', 'var MAX_CONFIG_BYTES=20000;').replace('maxConfigBytes:12288', 'maxConfigBytes:20000');
  assert.notEqual(relaxedSource, SOURCE, 'test-only relaxed contract must replace the canonical caps');
  assert.equal(relaxedSource.includes('var MAX_CONFIG_BYTES=12*1024;'), false); assert.equal(relaxedSource.includes('maxConfigBytes:12288'), false);
  const api = loadApiFromSource(relaxedSource); const snapshot = await makeSnapshot('enabled', api);
  const fixture = expandedDraft(96, 100); const predicted = predictedUrlLength(fixture);
  assert.equal(predicted.configBytes > 12288, true, predicted.configBytes); assert.equal(predicted.configBytes <= 20000, true, predicted.configBytes);
  const reviewed = await reviewedDraft(fixture, api, snapshot);
  assert.equal(Buffer.byteLength(canonical(reviewed.candidate.config)) > 12288, true, 'real branded reviews cover the oversized candidate');
  const transactions = api.fdCuratorImportTransactions(); const sequence = transactions.beginGeneration();
  const result = await api.fdCuratorBuildShare(reviewed.draft, index(), snapshot, context(), VALIDATION, webcrypto.subtle, LOCATION);
  assertBlocked(result); assert.deepEqual(result, { ok: false, code: 'CURATOR_CONFIG_TOO_LARGE' });
  assert.equal(reduceWith(api, reviewed.draft, { type: 'GENERATION_SUCCEEDED', result, sequence }, transactions, snapshot, context()), reviewed.draft);
  assert.equal(reviewed.draft.publication.lastGenerated, null); assert.equal(reviewed.draft.publication.baseEnvelope, null);
});

test('backup serialization is exact and rejects hostile/unserializable envelopes without echo', async () => {
  const { candidate } = await reviewedDraft();
  const envelope = { ...candidate.envelopePreimage, digest: candidate.contentDigest };
  const backup = fn('fdCuratorBackupJson'); assert.equal(backup(envelope), canonical(envelope));
  const cycle = {}; cycle.self = cycle; assert.equal(backup(cycle), null);
  let reads = 0; const accessor = {}; Object.defineProperty(accessor, 'format', { enumerable: true, get() { reads += 1; return 'cw-rotation-edition'; } });
  assert.equal(backup(accessor), null); assert.equal(reads, 0);
});

test('location and backup helpers capture one descriptor snapshot and never ordinary-read changing Proxies', async () => {
  function proxied(descriptorValues, ordinaryValue) {
    const stats = { ownKeys: 0, descriptors: Object.create(null), gets: 0, getsByKey: Object.create(null) };
    const proxy = new Proxy(descriptorValues, {
      ownKeys(target) { stats.ownKeys += 1; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) {
        stats.descriptors[key] = (stats.descriptors[key] || 0) + 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      get(target, key) {
        stats.gets += 1; stats.getsByKey[key] = (stats.getsByKey[key] || 0) + 1;
        return ordinaryValue(target, key, stats.getsByKey[key]);
      },
    });
    return { proxy, stats };
  }
  function assertOneSnapshot(stats, keys, label) {
    assert.equal(stats.ownKeys, 1, `${label}: one own-key snapshot`);
    assert.deepEqual({ ...stats.descriptors }, Object.fromEntries(keys.map((key) => [key, 1])), `${label}: one descriptor read per key`);
    assert.equal(stats.gets, 0, `${label}: zero ordinary gets`);
  }

  const location = proxied({ ...LOCATION }, (target, key, count) => (
    key === 'origin' && count >= 3 ? 'https://evil.example' : Reflect.get(target, key)
  ));
  assert.equal(fn('fdCuratorStudentBaseUrl')(location.proxy), 'https://clerkship.example/');
  assertOneSnapshot(location.stats, ['protocol', 'host', 'origin', 'pathname', 'search', 'hash'], 'location');

  const { candidate } = await reviewedDraft();
  const safeEnvelope = { ...candidate.envelopePreimage, digest: candidate.contentDigest };
  const capturedBackup = proxied(safeEnvelope, (target, key, count) => {
    if (key === 'format' && count > 1) return 'evil-format';
    if (key === 'schemaVersion' && count > 1) return 1;
    if (key === 'digest' && count > 2) return 'evil-digest';
    return Reflect.get(target, key);
  });
  assert.equal(fn('fdCuratorBackupJson')(capturedBackup.proxy), canonical(safeEnvelope));
  assertOneSnapshot(capturedBackup.stats, ['format', 'schemaVersion', 'config', 'digest'], 'safe backup');

  const evilDescriptors = { ...safeEnvelope, format: 'evil-format', schemaVersion: 1, digest: 'evil-digest' };
  const disguisedBackup = proxied(evilDescriptors, (_target, key) => safeEnvelope[key]);
  assert.equal(fn('fdCuratorBackupJson')(disguisedBackup.proxy), null);
  assertOneSnapshot(disguisedBackup.stats, ['format', 'schemaVersion', 'config', 'digest'], 'hostile backup');
});
