import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';

const ROOT = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/', import.meta.url);
const source = (name) => readFileSync(new URL(name, ROOT), 'utf8');
const F = new Function(`${source('fd_edition_contract.js')}\n${source('fd_edition_project.js')}\n${source('fd_edition_student.js')}\nreturn {
  fdEditionCreateEnvelope,fdEditionResolveStartup,fdEditionAcceptFirst,fdEditionAcceptSwitch,
  fdEditionReadLocalProgress,fdEditionToggleLocalProgress,fdEditionSwitchMarkup,fdEditionErrorMarkup,
  fdEditionRuntimeListen,fdEditionRuntimeUnlisten,
  fdEditionLocalToggleAllowed:typeof fdEditionLocalToggleAllowed==='function'?fdEditionLocalToggleAllowed:null
};`)();

const REVISION = '1234567890abcdef1234567890abcdef12345678';
const EDITION_KEY = 'cw_rotation_edition_v1';
const LOCAL_KEY = 'cw_rotation_local_progress_v1';

function canonicalIndex(audience = 'ms3', options = {}) {
  const weekCount = audience === 'ms3' ? 6 : 4;
  const pathId = audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week';
  const byRef = {
    'assessment.md': { ref: 'assessment.md', kind: 'read', title: 'Synthetic assessment', minutes: 9 },
    'tool.html': { ref: 'tool.html', kind: 'tool', title: 'Synthetic tool', minutes: null }
  };
  return {
    byRef,
    path: { id: pathId, weekCount },
    weeks: Array.from({ length: weekCount }, (_, i) => ({
      n: i + 1, title: `Week ${i + 1}`, theme: 'Synthetic', focusCategories: [], items: []
    })),
    columns: options.columns === undefined ? [] : options.columns,
    kit: options.kit === undefined ? [] : options.kit
  };
}

function context(audience = 'ms3') {
  return {
    audience,
    pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week',
    coreRevision: REVISION
  };
}

function config(audience = 'ms3', editionNumber = 1) {
  const finalWeek = audience === 'ms3' ? 6 : 4;
  return {
    audience,
    pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week',
    editionNumber,
    createdAgainstCoreRevision: REVISION,
    card: {
      title: 'Synthetic curated rotation', locationName: 'Example Unit', locationCode: 'BHU2',
      curatorName: 'Example Faculty', curatorRole: 'Faculty educator',
      rotationStart: '2026-09-01', rotationEnd: '2026-10-12', lastVerified: '2026-08-19'
    },
    pathItems: [
      { instanceId: 'core:assessment:1', ref: 'assessment.md', week: 1, order: 1, priority: 'required', rationale: 'Start here.' },
      { instanceId: 'core:tool:1', ref: 'tool.html', week: finalWeek, order: 1, priority: 'optional', rationale: 'Practice later.' }
    ],
    localOrientation: {
      firstDayArrival: '', dailySchedule: '', roundsWorkflow: '', presentationExpectations: '',
      documentationExpectations: '', attendanceExpectations: '', feedbackProcess: '', accessPreparation: '',
      contacts: [],
      checklist: [{ id: 'local:check:1', label: 'Review orientation', priority: 'required' }],
      resources: [{ id: 'local:resource:1', title: 'Orientation resource', url: 'https://example.edu/orientation', priority: 'recommended', week: 1, rationale: 'Local workflow.' }]
    },
    changeNote: 'Synthetic update.'
  };
}

async function edition(audience = 'ms3', editionNumber = 1) {
  const result = await F.fdEditionCreateEnvelope(config(audience, editionNumber), canonicalIndex(audience), context(audience), webcrypto.subtle);
  assert.equal(result.ok, true);
  return result;
}

test('local toggles are authorized only by IDs in the trusted active edition snapshot', async () => {
  const selected = await edition();
  assert.equal(typeof F.fdEditionLocalToggleAllowed, 'function');
  assert.equal(F.fdEditionLocalToggleAllowed(selected, 'checklist', 'local:check:1'), true);
  assert.equal(F.fdEditionLocalToggleAllowed(selected, 'resources', 'local:resource:1'), true);
  assert.equal(F.fdEditionLocalToggleAllowed(selected, 'checklist', 'local:resource:1'), false);
  assert.equal(F.fdEditionLocalToggleAllowed(selected, 'resources', 'local:check:1'), false);
  assert.equal(F.fdEditionLocalToggleAllowed(selected, 'checklist', 'local:check:unknown'), false);
  assert.equal(F.fdEditionLocalToggleAllowed({ fingerprint: selected.fingerprint }, 'checklist', 'local:check:1'), false);
});

function fragment(result) { return `#edition=${result.payload}`; }

function recordingStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push([key, value]); values.set(key, value); },
    snapshot() { return Object.fromEntries(values); },
    writes
  };
}

function protectedSnapshot(storage) {
  const snapshot = storage.snapshot();
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) =>
    key === 'cw_progress_v1' || key === 'cw_pretest_v1' || key === 'cw_qb_v1' || key === 'cw_unrelated_v1' || key.startsWith('rp_')));
}

function seededStorage() {
  return recordingStorage({
    cw_progress_v1: '{"assessment.md":true}', cw_pretest_v1: '{"complete":true}',
    cw_qb_v1: '{"question":7}', cw_unrelated_v1: 'preserve exactly', rp_progress_v1: '{"resident":true}'
  });
}

test('runtime listener registration removes a handler when the host registers and then throws', () => {
  const active = new Map();
  const removals = [];
  const target = {
    addEventListener(type, handler) {
      active.set(type, handler);
      throw new Error('private post-registration failure');
    },
    removeEventListener(type, handler) {
      removals.push([type, handler]);
      if (active.get(type) === handler) active.delete(type);
    },
  };
  const handler = () => assert.fail('a failed startup handler must not remain dispatchable');
  const registration = F.fdEditionRuntimeListen(target, 'click', handler, false);
  assert.equal(registration.ok, false);
  assert.deepEqual([...active.keys()], []);
  assert.deepEqual(removals, [['click', handler]]);
  assert.equal(F.fdEditionRuntimeUnlisten(registration), true);
  assert.deepEqual(removals, [['click', handler]], 'failed registration cleanup is idempotent');
});

function writeFailingStorage(initial, failKey) {
  const values = new Map(Object.entries(initial));
  const attempts = [];
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      attempts.push(key);
      if (key === failKey) throw new Error('adapter failure');
      values.set(key, value);
    },
    snapshot() { return Object.fromEntries(values); },
    attempts
  };
}

test('first valid edition resolves without writes and explicit acceptance writes only the two edition keys', async () => {
  const incoming = await edition();
  const storage = seededStorage();
  const before = protectedSnapshot(storage);
  const result = await F.fdEditionResolveStartup(canonicalIndex(), context(), 'https://example.edu/front-door.html', fragment(incoming), null, webcrypto.subtle);
  assert.equal(result.mode, 'active');
  assert.equal(result.needsCommit, true);
  assert.equal(result.active.fingerprint, incoming.fingerprint);
  assert.equal(storage.writes.length, 0);
  assert.equal(F.fdEditionAcceptFirst(storage, result.active), true);
  assert.deepEqual(storage.writes.map(([key]) => key), [LOCAL_KEY, EDITION_KEY]);
  assert.deepEqual(protectedSnapshot(storage), before);
  assert.deepEqual(JSON.parse(storage.snapshot()[LOCAL_KEY]), { schemaVersion: 1, byFingerprint: {
    [incoming.fingerprint]: { checklist: {}, resources: {} }
  } });
});

test('same incoming edition and a stored edition without a fragment stay active without storage churn', async () => {
  const selected = await edition();
  const stored = JSON.stringify(selected.envelope);
  for (const incomingHash of [fragment(selected), '']) {
    const storage = seededStorage();
    const result = await F.fdEditionResolveStartup(canonicalIndex(), context(), 'https://example.edu/front-door.html', incomingHash, stored, webcrypto.subtle);
    assert.equal(result.mode, 'active');
    assert.equal(result.needsCommit, false);
    assert.equal(result.active.fingerprint, selected.fingerprint);
    assert.equal(result.candidate, null);
    assert.equal(storage.writes.length, 0);
  }
});

test('different newer and older valid links require confirmation and preserve the stored active edition', async () => {
  const selected = await edition('ms3', 2);
  for (const number of [1, 3]) {
    const incoming = await edition('ms3', number);
    const storage = seededStorage();
    const before = storage.snapshot();
    const result = await F.fdEditionResolveStartup(canonicalIndex(), context(), 'https://example.edu/front-door.html', fragment(incoming), JSON.stringify(selected.envelope), webcrypto.subtle);
    assert.equal(result.mode, 'switch-required');
    assert.equal(result.needsCommit, false);
    assert.equal(result.active.fingerprint, selected.fingerprint);
    assert.equal(result.candidate.fingerprint, incoming.fingerprint);
    assert.equal(result.index.edition.fingerprint, selected.fingerprint);
    assert.deepEqual(storage.snapshot(), before, 'declining the switch leaves all values byte-for-byte unchanged');
    assert.equal(storage.writes.length, 0);
  }
});

test('explicit switch writes only edition and local progress while preserving core and unrelated values byte-for-byte', async () => {
  const selected = await edition('ms3', 1);
  const replacement = await edition('ms3', 2);
  const storage = seededStorage();
  storage.setItem(LOCAL_KEY, JSON.stringify({ schemaVersion: 1, byFingerprint: {
    [selected.fingerprint]: { checklist: { 'local:check:1': true }, resources: {} },
    'BHU2-MS3-4F7C2Q': { checklist: {}, resources: { 'local:resource:1': true } }
  } }));
  storage.writes.length = 0;
  const before = protectedSnapshot(storage);
  assert.equal(F.fdEditionAcceptSwitch(storage, replacement), true);
  assert.deepEqual(storage.writes.map(([key]) => key), [LOCAL_KEY, EDITION_KEY]);
  assert.deepEqual(protectedSnapshot(storage), before);
  const local = JSON.parse(storage.snapshot()[LOCAL_KEY]);
  assert.deepEqual(local.byFingerprint[selected.fingerprint], { checklist: { 'local:check:1': true }, resources: {} });
  assert.deepEqual(local.byFingerprint[replacement.fingerprint], { checklist: {}, resources: {} });
});

test('corrupt stored data and malformed, wrong-audience, wrong-path, or oversized incoming links reject without writes or content echo', async () => {
  const good = await edition();
  const wrongAudience = await edition('resident');
  const wrongPath = structuredClone(good.envelope);
  wrongPath.config.pathId = 'resident-four-week';
  const incomingCases = [
    ['malformed', '#edition=%%%%'],
    ['wrong audience', fragment(wrongAudience)],
    ['wrong path', `#edition=${Buffer.from(JSON.stringify(wrongPath)).toString('base64url')}`],
    ['oversized', `#edition=${'A'.repeat(16001)}`]
  ];
  for (const [label, incomingHash] of incomingCases) {
    const storage = seededStorage();
    const before = storage.snapshot();
    const result = await F.fdEditionResolveStartup(canonicalIndex(), context(), 'https://example.edu/front-door.html', incomingHash, '{bad json <script>alert(1)</script>', webcrypto.subtle);
    assert.equal(result.mode, 'rejected', label);
    assert.equal(result.index.path.id, 'ms3-six-week', label);
    assert.equal(storage.writes.length, 0, label);
    assert.deepEqual(storage.snapshot(), before, label);
    const markup = F.fdEditionErrorMarkup(result.receipt);
    assert.match(markup, /role="alert"/);
    assert.equal(markup.includes('<script>'), false);
    assert.equal(markup.includes('bad json'), false);
  }
});

test('a projection failure rejects the candidate without changing an otherwise valid storage snapshot', async () => {
  const incoming = await edition();
  const storage = seededStorage();
  const before = storage.snapshot();
  const result = await F.fdEditionResolveStartup(canonicalIndex('ms3', { columns: null }), context(), 'https://example.edu/front-door.html', fragment(incoming), null, webcrypto.subtle);
  assert.equal(result.mode, 'rejected');
  assert.equal(result.active, null);
  assert.equal(result.index.path.id, 'ms3-six-week');
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(storage.snapshot(), before);
});

test('local progress is fingerprint-scoped, toggle-only, and safe against hostile storage', async () => {
  const selected = await edition();
  const storage = recordingStorage({ [LOCAL_KEY]: JSON.stringify({ schemaVersion: 1, byFingerprint: {
    'BHU2-MS3-4F7C2Q': { checklist: { 'old:item': true }, resources: {} }
  } }) });
  assert.deepEqual(JSON.parse(JSON.stringify(F.fdEditionReadLocalProgress(storage, selected.fingerprint))), { checklist: {}, resources: {} });
  assert.equal(F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'checklist', 'local:check:1'), true);
  assert.equal(F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'checklist', 'local:check:1'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(F.fdEditionReadLocalProgress(storage, selected.fingerprint))), { checklist: {}, resources: {} });
  assert.equal(F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'not-a-kind', 'local:check:1'), false);
  assert.equal(F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'checklist', '<img src=x>'), false);
  const hostile = { getItem() { throw new Error('stored secret'); }, setItem() { throw new Error('write secret'); } };
  assert.deepEqual(JSON.parse(JSON.stringify(F.fdEditionReadLocalProgress(hostile, selected.fingerprint))), { checklist: {}, resources: {} });
  assert.equal(F.fdEditionToggleLocalProgress(hostile, selected.fingerprint, 'checklist', 'local:check:1'), false);
  const unreadable = { writes: 0, getItem() { throw new Error('stored secret'); }, setItem() { this.writes += 1; } };
  assert.equal(F.fdEditionAcceptFirst(unreadable, selected), false);
  assert.equal(F.fdEditionToggleLocalProgress(unreadable, selected.fingerprint, 'checklist', 'local:check:1'), false);
  assert.equal(unreadable.writes, 0, 'an unreadable local bucket must never be overwritten');
});

test('corrupt or structurally invalid existing local progress blocks accept and toggle without overwriting it', async () => {
  const selected = await edition();
  const invalidDocuments = [
    '{bad json',
    JSON.stringify({ schemaVersion: 1, byFingerprint: { [selected.fingerprint]: { checklist: {}, resources: {}, extra: true } } }),
    JSON.stringify({ schemaVersion: 1, byFingerprint: { [selected.fingerprint]: { checklist: { 'invalid key': true }, resources: {} } } })
  ];
  for (const text of invalidDocuments) {
    const storage = seededStorage();
    storage.setItem(LOCAL_KEY, text);
    storage.writes.length = 0;
    const before = storage.snapshot();
    assert.equal(F.fdEditionAcceptFirst(storage, selected), false);
    assert.equal(F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'checklist', 'local:check:1'), false);
    assert.deepEqual(storage.snapshot(), before);
    assert.deepEqual(storage.writes, []);
  }
});

test('accept writes prepared local progress before the edition commit marker and handles each write failure safely', async () => {
  const selected = await edition('ms3', 1);
  const replacement = await edition('ms3', 2);
  const initial = {
    [EDITION_KEY]: JSON.stringify(selected.envelope),
    [LOCAL_KEY]: JSON.stringify({ schemaVersion: 1, byFingerprint: { [selected.fingerprint]: { checklist: {}, resources: {} } } }),
    cw_progress_v1: 'core progress', cw_pretest_v1: 'pretest', cw_qb_v1: 'qbank', cw_unrelated_v1: 'other', rp_progress_v1: 'resident'
  };
  for (const failedKey of [LOCAL_KEY, EDITION_KEY]) {
    const storage = writeFailingStorage(initial, failedKey);
    const before = protectedSnapshot({ snapshot: () => initial });
    assert.equal(F.fdEditionAcceptSwitch(storage, replacement), false, failedKey);
    assert.deepEqual(protectedSnapshot(storage), before, failedKey);
    assert.equal(storage.snapshot()[EDITION_KEY], initial[EDITION_KEY], `${failedKey} keeps the old active edition`);
    assert.equal(storage.attempts[0], LOCAL_KEY, `${failedKey} prepares local state first`);
    if (failedKey === LOCAL_KEY) assert.deepEqual(storage.attempts, [LOCAL_KEY]);
    else {
      assert.deepEqual(storage.attempts, [LOCAL_KEY, EDITION_KEY]);
      assert.deepEqual(JSON.parse(storage.snapshot()[LOCAL_KEY]).byFingerprint[replacement.fingerprint], { checklist: {}, resources: {} });
    }
  }
});

test('commit and switch markup require a coherent success-shaped validated edition rather than a regex-shaped fingerprint', async () => {
  const selected = await edition('ms3', 1);
  const forgedCases = [
    ['unbranded exact copy', () => {}],
    ['format', (value) => { value.envelope.format = 'other-format'; }],
    ['token', (value) => { value.fingerprint = 'BHU2-MS3-000000'; }],
    ['location', (value) => { value.config.card.locationCode = 'MMC'; }],
    ['audience', (value) => { value.config.audience = 'resident'; }],
    ['digest', (value) => { value.envelope.digest = `sha256-${'B'.repeat(43)}`; }],
    ['blocking errors', (value) => { value.errors = [{ blocking: true }]; }]
  ];
  for (const [label, mutate] of forgedCases) {
    const forged = structuredClone(selected);
    mutate(forged);
    const storage = seededStorage();
    const before = storage.snapshot();
    assert.equal(F.fdEditionAcceptFirst(storage, forged), false, label);
    assert.equal(F.fdEditionSwitchMarkup(selected, forged), '', label);
    assert.deepEqual(storage.snapshot(), before, label);
    assert.deepEqual(storage.writes, [], label);
  }
});

test('unbranded nested error proxies cannot make switch markup inspect hostile array properties', async () => {
  const selected = await edition();
  const forged = structuredClone(selected);
  forged.errors = new Proxy([], { get(target, property) {
    if (property === 'length') throw new Error('nested markup secret');
    return Reflect.get(target, property);
  } });
  assert.doesNotThrow(() => F.fdEditionSwitchMarkup(selected, forged));
  assert.equal(F.fdEditionSwitchMarkup(selected, forged), '');
});

test('hostile storage descriptors and markup proxies fail closed without exception text or writes', async () => {
  const selected = await edition();
  const storage = { writes: 0 };
  Object.defineProperty(storage, 'getItem', { get() { throw new Error('read secret'); } });
  Object.defineProperty(storage, 'setItem', { get() { throw new Error('write secret'); } });
  assert.doesNotThrow(() => F.fdEditionReadLocalProgress(storage, selected.fingerprint));
  assert.doesNotThrow(() => F.fdEditionAcceptFirst(storage, selected));
  assert.doesNotThrow(() => F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'checklist', 'local:check:1'));
  assert.equal(storage.writes, 0);
  const hostile = new Proxy({}, { get() { throw new Error('markup secret'); }, getPrototypeOf() { throw new Error('markup secret'); } });
  assert.doesNotThrow(() => F.fdEditionSwitchMarkup(hostile, selected));
  assert.equal(F.fdEditionSwitchMarkup(hostile, selected), '');
  assert.doesNotThrow(() => F.fdEditionErrorMarkup(hostile));
  assert.equal(F.fdEditionErrorMarkup(hostile).includes('markup secret'), false);
  const hostileReceipt = { code: { toString() { throw new Error('receipt secret'); } } };
  assert.doesNotThrow(() => F.fdEditionErrorMarkup(hostileReceipt));
  assert.equal(F.fdEditionErrorMarkup(hostileReceipt).includes('receipt secret'), false);
});

test('local completion supports every printable contract ID without prototype pollution', async () => {
  const selected = await edition();
  const storage = recordingStorage();
  const printable = 'UPPER.ID+@[x]:/!?';
  assert.equal(F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'resources', printable), true);
  const progress = F.fdEditionReadLocalProgress(storage, selected.fingerprint);
  assert.equal(Object.getPrototypeOf(progress.resources), null);
  assert.equal(progress.resources[printable], true);
  for (const id of ['toString', 'hasOwnProperty', '__proto__', 'constructor', 'prototype']) {
    assert.equal(F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'resources', id), true, id);
    assert.equal(Object.getOwnPropertyDescriptor(F.fdEditionReadLocalProgress(storage, selected.fingerprint).resources, id).value, true, id);
  }
  for (const id of ['space id', 'line\nbreak', '']) {
    assert.equal(F.fdEditionToggleLocalProgress(storage, selected.fingerprint, 'resources', id), false, id);
  }
});

test('switch and error markup use only escaped privacy-safe diagnostic fields', async () => {
  const active = await edition('ms3', 1);
  const candidate = await edition('ms3', 2);
  const switchMarkup = F.fdEditionSwitchMarkup(active, candidate);
  assert.match(switchMarkup, /<dialog[^>]*aria-labelledby=/);
  assert.match(switchMarkup, new RegExp(active.fingerprint));
  assert.match(switchMarkup, new RegExp(candidate.fingerprint));
  const errorMarkup = F.fdEditionErrorMarkup({ code: 'EDITION_SCHEMA', schemaVersion: 1, fingerprint: '<unsafe>', currentCoreRevision: REVISION });
  assert.match(errorMarkup, /role="alert"/);
  assert.equal(errorMarkup.includes('<unsafe>'), false);
  assert.equal(errorMarkup.includes(REVISION), true);
});
