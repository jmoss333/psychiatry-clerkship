import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const CONTRACT_SOURCE = new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js',
  import.meta.url,
);
const CURATOR_SOURCE = new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js',
  import.meta.url,
);
const HTML_SOURCE = new URL(
  '../13_Faculty_Resources/Rotation_Curation/rotation-curator.html',
  import.meta.url,
);
const API_NAMES = [
  'fdCuratorNewDraft', 'fdCuratorReduce', 'fdCuratorValidateStep',
  'fdCuratorBuildConfig', 'fdCuratorNextEditionNumber',
  'fdCuratorDraftStorage', 'fdCuratorImportEnvelope', 'fdCuratorReadImportFile',
];

function loadApi() {
  const contract = readFileSync(CONTRACT_SOURCE, 'utf8');
  const curator = readFileSync(CURATOR_SOURCE, 'utf8');
  return new Function(
    'TextEncoder', 'TextDecoder', 'atob', 'btoa',
    `${contract}\n${curator}\nreturn {${API_NAMES.map((name) =>
      `${name}:typeof ${name}==='function'?${name}:null`).join(',')},` +
      'fdEditionCreateEnvelope,fdEditionCanonicalJson};',
  )(TextEncoder, TextDecoder, atob, btoa);
}

const F = loadApi();
const REVISION = 'a'.repeat(40);

function fn(name) {
  assert.equal(typeof F[name], 'function', `${name} must be implemented`);
  return F[name];
}

function context(audience = 'ms3') {
  return {
    audience,
    pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week',
    coreRevision: REVISION,
  };
}

function index(audience = 'ms3') {
  const weeks = audience === 'ms3' ? 6 : 4;
  return {
    path: { id: context(audience).pathId, weekCount: weeks },
    weeks: Array.from({ length: weeks }, (_, offset) => ({ n: offset + 1 })),
    byRef: {
      'pg_interview.md': { ref: 'pg_interview.md', title: 'Synthetic interview guide' },
    },
    columns: [],
  };
}

function blankCard() {
  return {
    title: '', locationName: '', locationCode: '', curatorName: '', curatorRole: '',
    rotationStart: '', rotationEnd: '', lastVerified: '',
  };
}

function blankOrientation() {
  return {
    firstDayArrival: '', dailySchedule: '', roundsWorkflow: '',
    presentationExpectations: '', documentationExpectations: '',
    attendanceExpectations: '', feedbackProcess: '', accessPreparation: '',
    contacts: [], checklist: [], resources: [],
  };
}

function completeConfig(audience = 'ms3', editionNumber = 3) {
  return {
    audience,
    pathId: context(audience).pathId,
    editionNumber,
    createdAgainstCoreRevision: REVISION,
    card: {
      title: 'Example Unit Rotation',
      locationName: 'Example Unit',
      locationCode: 'EX1',
      curatorName: 'Example Curator',
      curatorRole: 'Attending psychiatrist',
      rotationStart: '2026-08-24',
      rotationEnd: audience === 'ms3' ? '2026-10-02' : '2026-09-18',
      lastVerified: '2026-08-19',
    },
    pathItems: [{
      instanceId: 'core:pg_interview.md:1', ref: 'pg_interview.md', week: 1,
      order: 1, priority: 'recommended', rationale: '',
    }],
    localOrientation: blankOrientation(),
    changeNote: '',
  };
}

async function envelopeFor(audience = 'ms3', editionNumber = 3) {
  const result = await F.fdEditionCreateEnvelope(
    completeConfig(audience, editionNumber), index(audience), context(audience),
    webcrypto.subtle,
  );
  assert.equal(result.ok, true);
  return result;
}

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  const calls = [];
  return {
    calls,
    getItem(key) { calls.push(['getItem', key]); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { calls.push(['setItem', key, value]); values.set(key, value); },
    removeItem(key) { calls.push(['removeItem', key]); values.delete(key); },
    raw(key) { return values.get(key); },
  };
}

function setCard(draft, field, value, audience = 'ms3') {
  return fn('fdCuratorReduce')(
    draft, { type: 'SET_CARD_FIELD', field, value }, index(audience), context(audience),
  );
}

test('creates the exact audience-locked normalized draft shape', () => {
  const draft = fn('fdCuratorNewDraft')(index(), context());
  assert.deepEqual(draft, {
    schemaVersion: 1,
    step: 1,
    site: { audience: 'ms3', pathId: 'ms3-six-week', coreRevision: REVISION },
    config: {
      card: blankCard(), pathItems: [], localOrientation: blankOrientation(), changeNote: '',
    },
    publication: { baseEnvelope: null, baseCanonicalConfig: '', lastGenerated: null },
    preview: { desktopReviewed: false, mobileReviewed: false },
    affirmations: {
      publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false,
    },
  });
});

test('student-visible edits are immutable and reset previews and every affirmation', () => {
  const reduce = fn('fdCuratorReduce');
  let draft = fn('fdCuratorNewDraft')(index(), context());
  draft = reduce(draft, { type: 'SET_PREVIEW_REVIEWED', viewport: 'desktop', value: true }, index(), context());
  draft = reduce(draft, { type: 'SET_PREVIEW_REVIEWED', viewport: 'mobile', value: true }, index(), context());
  for (const name of ['publicSafe', 'officialLinks', 'previewsReviewed', 'forwardable']) {
    draft = reduce(draft, { type: 'SET_AFFIRMATION', name, value: true }, index(), context());
  }
  const before = structuredClone(draft);
  const edited = setCard(draft, 'title', 'Example Unit Rotation');

  assert.deepEqual(draft, before, 'the reducer must not mutate its input');
  assert.equal(edited.config.card.title, 'Example Unit Rotation');
  assert.deepEqual(edited.preview, { desktopReviewed: false, mobileReviewed: false });
  assert.deepEqual(edited.affirmations, {
    publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false,
  });

  const navigated = reduce(before, { type: 'GO_TO_STEP', step: 2 }, index(), context());
  assert.equal(navigated.step, 2);
  assert.deepEqual(navigated.preview, before.preview);
  assert.deepEqual(navigated.affirmations, before.affirmations);
});

test('Step 1 accepts real informational dates, including past dates, and links invalid fields', () => {
  const validate = fn('fdCuratorValidateStep');
  let draft = fn('fdCuratorNewDraft')(index(), context());
  for (const [field, value] of Object.entries({
    title: 'Example Unit Rotation', locationName: 'Example Unit', locationCode: 'ex1',
    curatorName: 'Example Curator', curatorRole: 'Attending psychiatrist',
    rotationStart: '2020-01-01', rotationEnd: '2020-02-01', lastVerified: '2020-01-02',
  })) draft = setCard(draft, field, value);

  const valid = validate(draft, 1, index(), context());
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));

  const impossible = setCard(draft, 'rotationStart', '2026-02-30');
  const invalidDate = validate(impossible, 1, index(), context());
  assert.equal(invalidDate.ok, false);
  assert.ok(invalidDate.errors.some((error) =>
    error.fieldId === 'curatorRotationStart' && error.href === '#curatorRotationStart'));

  let reversed = setCard(draft, 'rotationStart', '2026-09-02');
  reversed = setCard(reversed, 'rotationEnd', '2026-09-01');
  const invalidOrder = validate(reversed, 1, index(), context());
  assert.ok(invalidOrder.errors.some((error) => error.fieldId === 'curatorRotationEnd'));
});

test('saves and restores only cw_curator_draft_v1 after structural validation', async () => {
  const storage = memoryStorage();
  const adapter = fn('fdCuratorDraftStorage')(storage);
  let draft = fn('fdCuratorNewDraft')(index(), context());
  draft = setCard(draft, 'title', 'Example Unit Rotation');

  assert.equal(adapter.save(draft, index(), context()), true);
  assert.deepEqual(storage.calls.map((entry) => entry.slice(0, 2)), [
    ['setItem', 'cw_curator_draft_v1'],
  ]);

  storage.calls.length = 0;
  const restored = await adapter.load(index(), context(), webcrypto.subtle);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.draft, draft);
  assert.deepEqual(storage.calls, [['getItem', 'cw_curator_draft_v1']]);
});

test('ignores corrupt, extra-field, and cryptographically invalid stored drafts without deleting raw data', async () => {
  const cases = [
    '{not-json',
    JSON.stringify({ ...fn('fdCuratorNewDraft')(index(), context()), extra: 'hostile' }),
    null,
  ];
  const validEnvelope = await envelopeFor();
  const based = await fn('fdCuratorImportEnvelope')(
    JSON.stringify(validEnvelope.envelope), index(), context(), webcrypto.subtle,
  );
  const tampered = structuredClone(based.draft);
  tampered.publication.baseEnvelope.digest = `sha256-${'A'.repeat(43)}`;
  cases[2] = JSON.stringify(tampered);

  for (const raw of cases) {
    const storage = memoryStorage({ cw_curator_draft_v1: raw });
    const result = await fn('fdCuratorDraftStorage')(storage)
      .load(index(), context(), webcrypto.subtle);
    assert.equal(result.ok, false);
    assert.equal(result.draft, null);
    assert.equal(storage.raw('cw_curator_draft_v1'), raw);
    assert.equal(storage.calls.some((entry) => entry[0] === 'removeItem'), false);
  }
});

test('imports one valid backup as the base and rejects wrong-audience or invalid envelopes', async () => {
  const importEnvelope = fn('fdCuratorImportEnvelope');
  const validEnvelope = await envelopeFor('ms3', 3);
  const imported = await importEnvelope(
    JSON.stringify(validEnvelope.envelope), index(), context(), webcrypto.subtle,
  );
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.draft.config.card, validEnvelope.config.card);
  assert.deepEqual(imported.draft.publication.baseEnvelope, validEnvelope.envelope);

  const current = fn('fdCuratorNewDraft')(index(), context());
  const snapshot = structuredClone(current);
  const residentEnvelope = await envelopeFor('resident', 2);
  const wrongAudience = await importEnvelope(
    JSON.stringify(residentEnvelope.envelope), index(), context(), webcrypto.subtle,
  );
  assert.equal(wrongAudience.ok, false);
  assert.deepEqual(current, snapshot, 'a rejected import cannot mutate the current draft');

  const invalid = structuredClone(validEnvelope.envelope);
  invalid.config.card.extra = 'hostile';
  const rejected = await importEnvelope(
    JSON.stringify(invalid), index(), context(), webcrypto.subtle,
  );
  assert.equal(rejected.ok, false);
});

test('enforces the 64 KiB file cap before reading or parsing file text', async () => {
  let reads = 0;
  const file = { size: 65537, text() { reads += 1; return Promise.resolve('{}'); } };
  const result = await fn('fdCuratorReadImportFile')(
    file, index(), context(), webcrypto.subtle,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CURATOR_IMPORT_SIZE');
  assert.equal(reads, 0);
});

test('uses deterministic edition numbers for new, unchanged, changed, and generated drafts', async () => {
  const nextEdition = fn('fdCuratorNextEditionNumber');
  const build = fn('fdCuratorBuildConfig');
  const reduce = fn('fdCuratorReduce');

  let fresh = fn('fdCuratorNewDraft')(index(), context());
  assert.equal(nextEdition(fresh, completeConfig('ms3', 1)), 1);

  const baseResult = await envelopeFor('ms3', 3);
  let imported = (await fn('fdCuratorImportEnvelope')(
    JSON.stringify(baseResult.envelope), index(), context(), webcrypto.subtle,
  )).draft;
  assert.equal(build(imported, index(), context()).value.editionNumber, 3);

  imported = setCard(imported, 'title', 'Changed Example Unit Rotation');
  const changed = build(imported, index(), context());
  assert.equal(changed.ok, true, JSON.stringify(changed.errors));
  assert.equal(changed.value.editionNumber, 4);

  const generated = await F.fdEditionCreateEnvelope(
    changed.value, index(), context(), webcrypto.subtle,
  );
  assert.equal(generated.ok, true);
  const afterSuccess = reduce(
    imported, { type: 'GENERATION_SUCCEEDED', result: generated }, index(), context(),
  );
  const unchanged = build(afterSuccess, index(), context());
  assert.equal(unchanged.value.editionNumber, 4);
  const regenerated = await F.fdEditionCreateEnvelope(
    unchanged.value, index(), context(), webcrypto.subtle,
  );
  assert.equal(regenerated.digest, generated.digest);
  assert.equal(regenerated.fingerprint, generated.fingerprint);
  assert.equal(regenerated.envelope.digest, generated.envelope.digest);
});

test('Step 1 HTML has native labeled fields, descriptions, limits, linked errors, save/import copy, and disabled Generate', () => {
  const source = readFileSync(HTML_SOURCE, 'utf8');
  const fields = [
    ['curatorTitle', 'Edition title', '100'],
    ['curatorLocationName', 'Training-location display name', '100'],
    ['curatorLocationCode', 'Short location code', '8'],
    ['curatorName', 'Curator display name', '100'],
    ['curatorRole', 'Curator professional role', '100'],
  ];
  for (const [id, label, maxlength] of fields) {
    assert.match(source, new RegExp(`<label[^>]+for="${id}"[^>]*>${label}<`));
    assert.match(source, new RegExp(`id="${id}"[^>]+maxlength="${maxlength}"[^>]+aria-describedby=`));
  }
  for (const [id, label] of [
    ['curatorRotationStart', 'Rotation start date'],
    ['curatorRotationEnd', 'Rotation end date'],
    ['curatorLastVerified', 'Informational last-verified date'],
  ]) {
    assert.match(source, new RegExp(`<label[^>]+for="${id}"[^>]*>${label}<`));
    assert.match(source, new RegExp(`id="${id}"[^>]+type="date"[^>]+aria-describedby=`));
  }
  assert.match(source, /id="curatorErrorSummary"[^>]+tabindex="-1"/);
  assert.match(source, /id="curatorSaveDraft"/);
  assert.match(source, /Saved on this device/);
  assert.doesNotMatch(source, /\bPublished\b/);
  assert.match(source, /id="curatorImportFile"[^>]+type="file"[^>]+accept="application\/json,\.json"/);
  assert.match(source, /Audience, canonical path, and duration are locked by this site/);
  assert.match(source, /id="curatorGenerate" disabled aria-disabled="true"/);
});
