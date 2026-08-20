import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const FRONT = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/', import.meta.url);
const CATALOG = readFileSync(new URL('fd_edition_catalog.js', FRONT), 'utf8');
const CONTRACT = readFileSync(new URL('fd_edition_contract.js', FRONT), 'utf8');
const PROJECT = readFileSync(new URL('fd_edition_project.js', FRONT), 'utf8');
const STUDENT = readFileSync(new URL('fd_edition_student.js', FRONT), 'utf8');
const SYNTHETIC = JSON.parse(readFileSync(new URL('fixtures/rotation-editions/synthetic-core-index.json', import.meta.url), 'utf8'));
const REVISION = `sha256-${'B'.repeat(43)}`;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  const bytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return `sha256-${Buffer.from(bytes).toString('base64url')}`;
}
async function projection(audience, options = {}) {
  let records = await Promise.all(SYNTHETIC.catalogRecords.map(async (record) => ({ ...structuredClone(record), contentDigest: await digest(record) })));
  records.sort((a, b) => a.key.localeCompare(b.key));
  const blockedKeys = options.blockedKeys || [];
  records = records.filter((record) => !blockedKeys.includes(record.key));
  const value = { schemaVersion: 1, audience, revision: options.revision || REVISION, projectionDigest: '', rotationEditionV2: options.gate || 'enabled', selectionKeys: records.map((record) => record.key), resolutionRecords: records, blockedKeys };
  const bare = structuredClone(value); delete bare.projectionDigest; value.projectionDigest = await digest(bare);
  return value;
}
function load(revision = REVISION) {
  const source = `${CATALOG.replace('__FD_CATALOG_EXPECTED_REVISION__', revision)}\n${CONTRACT}\n${PROJECT}\n${STUDENT}`;
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa', `${source}\nreturn {
    fdEditionCatalogSnapshot,fdEditionStorageKeys,fdEditionResolveStartup,fdEditionTrustedSnapshot,fdEditionValidateEnvelope,
    fdEditionGenerateChangeSummary,
    fdEditionCommitAcceptance,fdEditionReadLocal,fdEditionToggleLocal,fdEditionStartupJournal,
    fdEditionStartupJournalRun,fdEditionStartupJournalRollback,fdEditionRuntimeListen,fdEditionRuntimeUnlisten,
    fdEditionRuntimeInputs,fdEditionRuntimeMountError,fdEditionRuntimeMountSwitch,
    fdEditionRuntimeFocusError:typeof fdEditionRuntimeFocusError==='function'?fdEditionRuntimeFocusError:null
  };`)(TextEncoder, TextDecoder, atob, btoa);
}
function valid(audience) { return JSON.parse(readFileSync(new URL(`fixtures/rotation-editions/valid-${audience}.json`, import.meta.url), 'utf8')); }
async function harness(audience = 'ms3', options = {}) {
  const revision = options.revision || REVISION;
  const F = load(revision);
  const prepared = await F.fdEditionCatalogSnapshot(await projection(audience, options), audience, webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  const core = structuredClone(SYNTHETIC.audiences[audience]);
  const site = { audience, coreRevision: options.coreRevision || core.coreRevision, localCatalogRevision: revision, rotationEditionV2: options.gate || 'enabled' };
  return { F, snapshot: prepared.snapshot, core, site, envelope: valid(audience), keys: F.fdEditionStorageKeys(audience) };
}
function fragment(envelope) { return `#edition=${Buffer.from(JSON.stringify(envelope)).toString('base64url')}`; }
function storage(seed = {}, behavior = {}) {
  const map = new Map(Object.entries(seed)); const operations = []; let mismatchUsed = false;
  return {
    operations,
    getItem(key) { operations.push(['get', key]); if (behavior.getThrow) throw new Error('private read'); return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { operations.push(['set', key]); if (behavior.failKey === key) throw new Error('private quota'); const mismatch = behavior.mismatchKey === key && !mismatchUsed; if (mismatch) mismatchUsed = true; map.set(key, mismatch ? `${value}x` : String(value)); },
    removeItem(key) { operations.push(['remove', key]); map.delete(key); },
    snapshot() { return Object.fromEntries(map); },
  };
}
async function replacement(H) {
  const next = structuredClone(H.envelope); next.config.editionNumber = 2;
  next.config.context.editionCheckedOn = '2026-08-18';
  next.config.changeSummary = H.F.fdEditionGenerateChangeSummary(H.envelope.config, next.config);
  next.digest = await digest({ format: next.format, schemaVersion: 2, config: next.config });
  const checked = await H.F.fdEditionValidateEnvelope(next, H.core, H.snapshot, H.site, { mode: 'learner', generationDate: '' }, webcrypto.subtle);
  assert.equal(checked.ok, true, JSON.stringify(checked.errors)); return checked;
}
const PROTECTED = {
  cw_rotation_edition_v1: '{"v1":"edition"}', cw_rotation_local_progress_v1: '{"v1":"local"}', cw_curator_draft_v1: '{"v1":"draft"}',
  cw_progress_v1: '{"core":"progress"}', cw_qbank_attest_v1: '{"core":"attestation"}', cw_plan_v1: '{"manualItems":["saved"],"history":["kept"]}',
};

test('fresh storage keys are audience-specific v2 keys only', async () => {
  const { F } = await harness();
  assert.deepEqual(F.fdEditionStorageKeys('ms3'), { edition: 'cw_rotation_edition_ms3_v2', local: 'cw_rotation_local_progress_ms3_v2', curator: 'cw_curator_draft_ms3_v2' });
  assert.deepEqual(F.fdEditionStorageKeys('resident'), { edition: 'rp_rotation_edition_resident_v2', local: 'rp_rotation_local_progress_resident_v2', curator: 'rp_curator_draft_resident_v2' });
  const changed = F.fdEditionStorageKeys('ms3'); changed.edition = 'hostile';
  assert.equal(F.fdEditionStorageKeys('ms3').edition, 'cw_rotation_edition_ms3_v2');
});

for (const audience of ['ms3', 'resident']) {
  test(`${audience} startup accepts valid incoming and stored v2 without writes`, async () => {
    const { F, snapshot, core, site, envelope } = await harness(audience);
    const incoming = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/front-door.html', fragment(envelope), null, webcrypto.subtle);
    assert.equal(incoming.mode, 'active'); assert.equal(incoming.needsCommit, true);
    assert.ok(F.fdEditionTrustedSnapshot(incoming.active)); assert.equal(incoming.index.edition.card.fingerprint, incoming.active.fingerprint);
    const stored = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/front-door.html', '', JSON.stringify(envelope), webcrypto.subtle);
    assert.equal(stored.mode, 'active'); assert.equal(stored.needsCommit, false);
    const revisit = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/front-door.html', fragment(envelope), JSON.stringify(envelope), webcrypto.subtle);
    assert.equal(revisit.mode, 'active'); assert.equal(revisit.needsCommit, false); assert.equal(revisit.candidate, null);
  });
}

test('disabled mode ignores storage; hashes reject with the fixed disabled code', async () => {
  const { F, snapshot, core, site } = await harness('ms3', { gate: 'disabled' });
  const noHash = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', '', '{unread private bytes}', { digest() { throw new Error('must not decode'); } });
  assert.equal(noHash.mode, 'core');
  const hash = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', '#edition=private', '{unread}', { digest() { throw new Error('must not decode'); } });
  assert.equal(hash.mode, 'rejected'); assert.equal(hash.receipt.code, 'EDITION_DISABLED');
});

test('unavailable or unbranded catalogs preserve core and use the fixed catalog code for a fragment', async () => {
  const { F, core, site } = await harness();
  for (const snapshot of [null, { rotationEditionV2: 'enabled' }]) {
    const coreOnly = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', '', '{unread}', webcrypto.subtle);
    assert.equal(coreOnly.mode, 'core');
    const rejected = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', '#edition=private', '{unread}', webcrypto.subtle);
    assert.equal(rejected.receipt.code, 'EDITION_CATALOG_UNAVAILABLE');
  }
});

test('v1 URL and stored envelopes reject before writes and preserve every prerelease/core byte', async () => {
  const { F, snapshot, core, site } = await harness();
  const v1 = { format: 'cw-rotation-edition', schemaVersion: 1, config: { private: 'do not echo' }, digest: 'legacy' };
  for (const [hash, stored] of [[fragment(v1), null], ['', JSON.stringify(v1)]]) {
    const store = storage(PROTECTED); const before = store.snapshot();
    const result = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', hash, stored, webcrypto.subtle);
    assert.equal(result.mode, 'rejected'); assert.equal(result.receipt.code, 'EDITION_PRERELEASE_UNSUPPORTED');
    assert.deepEqual(store.snapshot(), before); assert.deepEqual(store.operations, []);
  }
});

test('malformed and digest-mismatched v2 fragments use fixed invalid diagnostics', async () => {
  const { F, snapshot, core, site, envelope } = await harness();
  const corrupt = structuredClone(envelope); corrupt.digest = `sha256-${'A'.repeat(43)}`;
  for (const hash of ['#edition=%%%%', fragment(corrupt)]) {
    const result = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', hash, null, webcrypto.subtle);
    assert.equal(result.mode, 'rejected'); assert.equal(result.receipt.code, 'EDITION_INVALID');
    assert.doesNotMatch(JSON.stringify(result.receipt), /%%%%|private/);
  }
});

test('blocked or missing catalog records require reselection while revision-only drift remains valid', async () => {
  const blocked = await harness('ms3', { blockedKeys: ['curator.example-attending@v1'] });
  const rejected = await blocked.F.fdEditionResolveStartup(blocked.core, blocked.snapshot, blocked.site, 'https://example.edu/', fragment(blocked.envelope), null, webcrypto.subtle);
  assert.equal(rejected.receipt.code, 'EDITION_RESELECTION_REQUIRED');
  const driftRevision = `sha256-${'C'.repeat(43)}`;
  const baseline = await harness('ms3');
  const original = await baseline.F.fdEditionResolveStartup(baseline.core, baseline.snapshot, baseline.site, 'https://example.edu/', fragment(baseline.envelope), null, webcrypto.subtle);
  const drift = await harness('ms3', { revision: driftRevision });
  const accepted = await drift.F.fdEditionResolveStartup(drift.core, drift.snapshot, drift.site, 'https://example.edu/', fragment(drift.envelope), null, webcrypto.subtle);
  assert.equal(accepted.mode, 'active'); assert.equal(accepted.active.fingerprint, original.active.fingerprint);
  assert.equal(accepted.active.displayModel.revisions.catalogMatches, false);
});

test('different valid edition asks before switching; decline changes no bytes', async () => {
  const H = await harness(); const { F, snapshot, core, site, envelope } = H;
  const checked = await replacement(H);
  const result = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', `#edition=${checked.payload}`, JSON.stringify(envelope), webcrypto.subtle);
  assert.equal(result.mode, 'switch-required'); assert.ok(result.active); assert.ok(result.candidate);
  const store = storage(PROTECTED); const before = store.snapshot();
  assert.deepEqual(store.snapshot(), before); assert.deepEqual(store.operations, []);

  const local = { schemaVersion: 2, byFingerprint: { [result.active.fingerprint]: { checklist: { 'local:checklist:1': true }, resources: {} } } };
  const acceptedStore = storage({ ...PROTECTED, [F.fdEditionStorageKeys('ms3').local]: JSON.stringify(local) });
  const keys = F.fdEditionStorageKeys('ms3');
  const journal = F.fdEditionStartupJournal(acceptedStore, [keys.local, keys.edition]);
  assert.deepEqual(F.fdEditionCommitAcceptance(acceptedStore, keys, result.candidate, local, journal), { ok: true, code: 'EDITION_ACCEPTED' });
  const switched = JSON.parse(acceptedStore.snapshot()[keys.local]);
  assert.deepEqual(switched.byFingerprint[result.active.fingerprint], { checklist: { 'local:checklist:1': true }, resources: {} });
  assert.deepEqual(switched.byFingerprint[result.candidate.fingerprint], { checklist: {}, resources: {} });
});

test('acceptance uses one journaled local-first/edition-second transaction and preserves v1/core bytes', async () => {
  const { F, snapshot, core, site, envelope, keys } = await harness();
  const result = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', fragment(envelope), null, webcrypto.subtle);
  const store = storage(PROTECTED); const before = store.snapshot();
  const journal = F.fdEditionStartupJournal(store, [keys.local, keys.edition]);
  const receipt = F.fdEditionCommitAcceptance(store, keys, result.active, null, journal);
  assert.deepEqual(receipt, { ok: true, code: 'EDITION_ACCEPTED' });
  assert.deepEqual(store.operations.filter(([op]) => op === 'set').map(([, key]) => key), [keys.local, keys.edition]);
  for (const [key, value] of Object.entries(before)) assert.equal(store.snapshot()[key], value, key);
  assert.deepEqual(JSON.parse(store.snapshot()[keys.local]), { schemaVersion: 2, byFingerprint: { [result.active.fingerprint]: { checklist: {}, resources: {} } } });
  assert.deepEqual(JSON.parse(store.snapshot()[keys.edition]), envelope);
});

test('second-write throw or postwrite mismatch rolls back both values and reports storage failure', async () => {
  const { F, snapshot, core, site, envelope, keys } = await harness();
  const result = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', fragment(envelope), null, webcrypto.subtle);
  for (const behavior of [{ failKey: keys.edition }, { mismatchKey: keys.edition }]) {
    const seed = { ...PROTECTED, [keys.local]: '{"before":"local"}', [keys.edition]: '{"before":"edition"}' };
    const store = storage(seed, behavior); const journal = F.fdEditionStartupJournal(store, [keys.local, keys.edition]);
    const receipt = F.fdEditionCommitAcceptance(store, keys, result.active, null, journal);
    assert.equal(receipt.ok, false); assert.equal(receipt.code, 'EDITION_STORAGE');
    assert.deepEqual(store.snapshot(), seed);
  }
});

test('local progress is closed, bounded, fingerprint-scoped, and permits only resolved IDs', async () => {
  const { F, keys } = await harness();
  const fp = 'EXU-MS3-ZBVX4D';
  const checklistIds = [
    'local:checklist:1',
    'local:generated:arrival',
    'local:generated:access:local:access:1',
  ];
  const display = {
    card: { fingerprint: fp },
    firstDay: { checklistItems: checklistIds.map((id) => ({ id })) },
    resources: [{ id: 'local:resource:1' }],
  };
  const doc = { schemaVersion: 2, byFingerprint: { [fp]: { checklist: Object.fromEntries(checklistIds.map((id) => [id, true])), resources: {} } } };
  const store = storage({ [keys.local]: JSON.stringify(doc) });
  assert.deepEqual(F.fdEditionReadLocal(store, keys, fp, display), { checklist: Object.fromEntries(checklistIds.map((id) => [id, true])), resources: {} });
  assert.equal(F.fdEditionToggleLocal(store, keys, fp, 'resources', 'local:resource:1', display), true);
  assert.equal(F.fdEditionToggleLocal(store, keys, fp, 'checklist', 'local:checklist:99', display), false);
  assert.equal(F.fdEditionToggleLocal(store, keys, fp, 'checklist', 'local:generated:access:local:access:2', display), false);
  const hostile = storage({ [keys.local]: JSON.stringify({ ...doc, extra: true }) });
  assert.deepEqual(F.fdEditionReadLocal(hostile, keys, fp, display), { checklist: {}, resources: {} });
});

test('local progress rejects hostile, wrong-kind, noncanonical, and forged generated IDs without writes', async () => {
  const { F, keys, snapshot, core, site, envelope } = await harness();
  const validated = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', fragment(envelope), null, webcrypto.subtle);
  const fp = validated.active.fingerprint;
  const display = {
    firstDay: { checklistItems: [
      { id: 'local:checklist:1' },
      { id: 'local:generated:arrival' },
      { id: 'local:generated:access:local:access:1' },
    ] },
    resources: [{ id: 'local:resource:1' }],
  };
  const cases = [
    ['checklist', 'patient:synthetic-person-record'],
    ['checklist', 'local:resource:1'],
    ['checklist', 'local:checklist:0'],
    ['checklist', 'local:checklist:01'],
    ['checklist', 'local:checklist:-1'],
    ['checklist', 'local:checklist:text'],
    ['checklist', 'local:checklist:999'],
    ['checklist', 'local:generated:access:patient:synthetic-person-record'],
    ['checklist', 'local:generated:access:local:access:0'],
    ['checklist', 'local:generated:access:local:access:2'],
    ['resources', 'local:checklist:1'],
    ['resources', 'local:resource:0'],
    ['resources', 'local:resource:01'],
    ['resources', 'local:resource:-1'],
    ['resources', 'local:resource:text'],
    ['resources', 'local:resource:999'],
    ['resources', 'local:generated:arrival'],
  ];
  for (const [kind, id] of cases) {
    const document = { schemaVersion: 2, byFingerprint: { [fp]: { checklist: {}, resources: {} } } };
    document.byFingerprint[fp][kind][id] = true;
    const text = JSON.stringify(document);
    const store = storage({ [keys.local]: text });
    const before = store.snapshot();
    assert.deepEqual(F.fdEditionReadLocal(store, keys, fp, display), { checklist: {}, resources: {} }, `${kind}:${id}`);
    assert.equal(F.fdEditionToggleLocal(store, keys, fp, kind, id, display), false, `${kind}:${id}`);
    assert.deepEqual(store.snapshot(), before, `${kind}:${id}`);
    assert.equal(store.operations.some(([op]) => op === 'set' || op === 'remove'), false, `${kind}:${id}`);

    const commitStore = storage({ [keys.local]: text });
    const journal = F.fdEditionStartupJournal(commitStore, [keys.local, keys.edition]);
    assert.deepEqual(F.fdEditionCommitAcceptance(commitStore, keys, validated.active, document, journal), { ok: false, code: 'EDITION_STORAGE' });
    assert.equal(commitStore.operations.some(([op]) => op === 'set' || op === 'remove'), false, `${kind}:${id}`);
  }
});

test('a 129th fingerprint acceptance returns capacity and never evicts or writes', async () => {
  const { F, snapshot, core, site, envelope, keys } = await harness();
  const result = await F.fdEditionResolveStartup(core, snapshot, site, 'https://example.edu/', fragment(envelope), null, webcrypto.subtle);
  const byFingerprint = {};
  for (let i = 0; i < 128; i++) byFingerprint[`EXU-MS3-${String(i).padStart(6, '0')}`] = { checklist: {}, resources: {} };
  const local = { schemaVersion: 2, byFingerprint };
  const store = storage({ ...PROTECTED, [keys.local]: JSON.stringify(local) }); const before = store.snapshot();
  const journal = F.fdEditionStartupJournal(store, [keys.local, keys.edition]);
  assert.deepEqual(F.fdEditionCommitAcceptance(store, keys, result.active, local, journal), { ok: false, code: 'EDITION_LOCAL_CAPACITY' });
  assert.deepEqual(store.snapshot(), before); assert.equal(store.operations.some(([op]) => op === 'set'), false);
});

test('local checklist and resource completion caps reject the next resolved ID without a write', async () => {
  const { F, keys } = await harness(); const fp = 'EXU-MS3-ZBVX4D';
  const checklistItems = Array.from({ length: 25 }, (_, i) => ({ id: `local:checklist:${i + 1}` }));
  const resources = Array.from({ length: 13 }, (_, i) => ({ id: `local:resource:${i + 1}` }));
  const bucket = { checklist: {}, resources: {} };
  for (let i = 0; i < 24; i++) bucket.checklist[`local:checklist:${i + 1}`] = true;
  for (let i = 0; i < 12; i++) bucket.resources[`local:resource:${i + 1}`] = true;
  const store = storage({ [keys.local]: JSON.stringify({ schemaVersion: 2, byFingerprint: { [fp]: bucket } }) });
  const display = { card: { fingerprint: fp }, firstDay: { checklistItems }, resources };
  assert.equal(F.fdEditionToggleLocal(store, keys, fp, 'checklist', 'local:checklist:25', display), false);
  assert.equal(F.fdEditionToggleLocal(store, keys, fp, 'resources', 'local:resource:13', display), false);
  assert.equal(store.operations.some(([op]) => op === 'set'), false);
});

test('startup listener helper removes register-then-throw listeners', async () => {
  const { F } = await harness(); const active = new Map();
  const target = { addEventListener(type, handler) { active.set(type, handler); throw new Error('private'); }, removeEventListener(type, handler) { if (active.get(type) === handler) active.delete(type); } };
  const registration = F.fdEditionRuntimeListen(target, 'click', () => {}, false);
  assert.equal(registration.ok, false); assert.deepEqual([...active], []); assert.equal(F.fdEditionRuntimeUnlisten(registration), true);
});

test('runtime errors expose one bounded focus target and hardened focus never escapes it', async () => {
  const { F } = await harness();
  assert.equal(typeof F.fdEditionRuntimeFocusError, 'function');
  const selectors = []; const focusCalls = [];
  const alert = { focus(options) { focusCalls.push(options); } };
  const mount = {
    innerHTML: '',
    querySelector(selector) { selectors.push(selector); return alert; },
  };
  assert.equal(F.fdEditionRuntimeMountError(mount, { code: 'EDITION_RUNTIME' }), true);
  assert.match(mount.innerHTML,
    /^<section class="fd-edition-error" role="alert" tabindex="-1"><h2>Rotation edition unavailable<\/h2>/);
  assert.equal(F.fdEditionRuntimeFocusError(mount), true);
  assert.deepEqual(selectors, ['.fd-edition-error[role="alert"]']);
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);

  let retries = 0;
  const fallbackMount = { querySelector() { return { focus(options) {
    retries += 1; if (options) throw new Error('private focus options failure');
  } }; } };
  assert.equal(F.fdEditionRuntimeFocusError(fallbackMount), true);
  assert.equal(retries, 2);
  assert.equal(F.fdEditionRuntimeFocusError({ querySelector() { throw new Error('private query failure'); } }), false);
  assert.equal(F.fdEditionRuntimeFocusError({ querySelector() { return { focus: 'not callable' }; } }), false);
});

test('browser capability preparation cannot read edition storage before the branded catalog gate', async () => {
  const { F, snapshot, site } = await harness(); let storageReads = 0;
  function node(tag) { return { tagName: tag, innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, showModal() {}, close() {}, focus() {}, removeAttribute() {}, setAttribute() {} }; }
  const app = node('div'); app.querySelector = (selector) => selector === '#content' ? node('main') : null;
  const mount = node('div');
  const documentValue = { createElement(tag) { return node(tag); } };
  const windowValue = { location: { href: 'https://example.edu/', hash: '', pathname: '/', search: '', reload() {} }, history: { replaceState() {} }, crypto: webcrypto };
  Object.defineProperty(windowValue, 'localStorage', { get() { storageReads += 1; throw new Error('private storage'); } });
  const unavailable = F.fdEditionRuntimeInputs(windowValue, documentValue, app, mount, { rotationEditionV2: 'enabled' }, site);
  assert.equal(unavailable.ok, false); assert.equal(unavailable.receipt.code, 'EDITION_CATALOG_UNAVAILABLE'); assert.equal(storageReads, 0);
  const gated = F.fdEditionRuntimeInputs(windowValue, documentValue, app, mount, snapshot, site);
  assert.equal(gated.ok, false); assert.equal(gated.receipt.code, 'EDITION_RUNTIME'); assert.equal(storageReads, 1);
});

test('history failure after the branded gate reads but never writes edition storage', async () => {
  const { F, snapshot, site, keys } = await harness();
  function node(tag) { return { tagName: tag, innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, showModal() {}, close() {}, focus() {}, removeAttribute() {}, setAttribute() {} }; }
  const app = node('div'); app.querySelector = (selector) => selector === '#content' ? node('main') : null;
  const store = storage({ [keys.edition]: null, [keys.local]: JSON.stringify({ schemaVersion: 2, byFingerprint: {} }) });
  const windowValue = { location: { href: 'https://example.edu/#edition=x', hash: '#edition=x', pathname: '/', search: '', reload() {} },
    history: { replaceState() { throw new Error('private history'); } }, localStorage: store, crypto: webcrypto };
  const result = F.fdEditionRuntimeInputs(windowValue, { createElement: node }, app, node('div'), snapshot, site);
  assert.equal(result.ok, false); assert.equal(result.receipt.code, 'EDITION_RUNTIME');
  assert.equal(store.operations.some(([op]) => op === 'set' || op === 'remove'), false);
});

test('reload failure rolls back a switch; dialog failure performs zero writes', async () => {
  const H = await harness(); const candidate = await replacement(H); const active = await H.F.fdEditionValidateEnvelope(
    H.envelope, H.core, H.snapshot, H.site, { mode: 'learner', generationDate: '' }, webcrypto.subtle,
  );
  const local = { schemaVersion: 2, byFingerprint: { [active.fingerprint]: { checklist: {}, resources: {} } } };
  const seed = { [H.keys.edition]: JSON.stringify(active.envelope), [H.keys.local]: JSON.stringify(local), ...PROTECTED };
  function dialogHarness(showThrows = false) {
    const handlers = {}; const button = (value) => ({ value, disabled: false, addEventListener(type, handler) { handlers[`${value}:${type}`] = handler; }, focus() {} });
    const keep = button('decline'), accept = button('accept');
    let errorFocusCount = 0; const error = { focus() { errorFocusCount += 1; } };
    const dialog = { addEventListener(type, handler) { handlers[`dialog:${type}`] = handler; }, querySelector(selector) { return selector.includes('decline') ? keep : accept; },
      showModal() { if (showThrows) throw new Error('private dialog'); }, close() {} };
    const mount = { innerHTML: '', querySelector(selector) {
      return selector === '.fd-edition-error[role="alert"]' ? error : dialog;
    } };
    return { mount, accept() { handlers['accept:click']({ preventDefault() {} }); },
      errorFocusCount() { return errorFocusCount; } };
  }
  const store = storage(seed); const ui = dialogHarness(); let recovered = 0;
  const journal = H.F.fdEditionStartupJournal(store, [H.keys.local, H.keys.edition]);
  assert.equal(H.F.fdEditionRuntimeMountSwitch(ui.mount, { active, candidate }, store, H.keys, local, journal,
    { reload() { throw new Error('private reload'); } }, true, () => { recovered += 1; return true; }), true);
  ui.accept(); assert.deepEqual(store.snapshot(), seed); assert.equal(recovered, 0); assert.match(ui.mount.innerHTML, /EDITION_RUNTIME/);
  assert.equal(ui.errorFocusCount(), 1);

  const untouched = storage(seed); const broken = dialogHarness(true);
  assert.equal(H.F.fdEditionRuntimeMountSwitch(broken.mount, { active, candidate }, untouched, H.keys, local,
    H.F.fdEditionStartupJournal(untouched, [H.keys.local, H.keys.edition]), { reload() {} }, true, () => true), false);
  assert.equal(untouched.operations.some(([op]) => op === 'set' || op === 'remove'), false);
});
