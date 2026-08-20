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
  'fdCuratorApplyAction', 'fdCuratorMount',
  'fdCuratorBuildConfig', 'fdCuratorNextEditionNumber',
  'fdCuratorDraftStorage', 'fdCuratorImportEnvelope', 'fdCuratorReadImportFile',
  'fdCuratorImportTransactions',
];

function loadApi() {
  const contract = readFileSync(CONTRACT_SOURCE, 'utf8');
  const curator = readFileSync(CURATOR_SOURCE, 'utf8');
  return new Function(
    'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'localStorage',
    `function fdEsc(value){return String(value);}\n${contract}\n${curator}\nreturn {${API_NAMES.map((name) =>
      `${name}:typeof ${name}==='function'?${name}:null`).join(',')},` +
      'fdEditionCreateEnvelope,fdEditionCanonicalJson,' +
      'setCuratorProjector:function(projector){fdCuratorProjectDraft=projector;}};',
  )(TextEncoder, TextDecoder, atob, btoa, null);
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
  const interview = { ref: 'pg_interview.md', title: 'Synthetic interview guide' };
  return {
    path: { id: context(audience).pathId, weekCount: weeks },
    weeks: Array.from({ length: weeks }, (_, offset) => ({
      n: offset + 1,
      items: offset === 0 ? [interview] : [],
    })),
    byRef: {
      'pg_interview.md': interview,
    },
    columns: [{ name: 'Interviewing', accent: '#174d43', items: [interview] }],
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

function draftWithCard(config, audience = 'ms3') {
  let draft = fn('fdCuratorNewDraft')(index(audience), context(audience));
  for (const [field, value] of Object.entries(config.card)) {
    draft = setCard(draft, field, value, audience);
  }
  return draft;
}

test('creates the exact audience-locked normalized draft shape', () => {
  const draft = fn('fdCuratorNewDraft')(index(), context());
  assert.deepEqual(draft, {
    schemaVersion: 1,
    step: 1,
    site: { audience: 'ms3', pathId: 'ms3-six-week', coreRevision: REVISION },
    config: {
      card: blankCard(),
      pathItems: [{
        instanceId: 'core:pg_interview.md:1', ref: 'pg_interview.md', week: 1,
        order: 1, priority: 'recommended', rationale: '',
      }],
      localOrientation: blankOrientation(), changeNote: '',
    },
    publication: { baseEnvelope: null, baseCanonicalConfig: '', lastGenerated: null },
    preview: { desktopReviewed: false, mobileReviewed: false },
    affirmations: {
      publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false,
    },
  });
});

test('the real page injects the exact locked path into the browser context used by validators', async () => {
  const source = readFileSync(HTML_SOURCE, 'utf8');
  assert.match(
    source,
    /var FD_CURATOR_CONTEXT=\{audience:FD_AUDIENCE,pathId:FD_INDEX\.path\.id,coreRevision:FD_CORE_REVISION\};/,
  );

  const browserContext = {
    audience: 'ms3', pathId: index().path.id, coreRevision: REVISION,
  };
  const validEnvelope = await envelopeFor('ms3', 3);
  const imported = await fn('fdCuratorImportEnvelope')(
    JSON.stringify(validEnvelope.envelope), index(), browserContext, webcrypto.subtle,
  );
  assert.equal(imported.ok, true);
  assert.equal(fn('fdCuratorBuildConfig')(imported.draft, index(), browserContext).ok, true);

  const storage = memoryStorage({
    cw_curator_draft_v1: JSON.stringify(imported.draft),
  });
  const restored = await fn('fdCuratorDraftStorage')(storage)
    .load(index(), browserContext, webcrypto.subtle);
  assert.equal(restored.ok, true);
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

test('a genuine local edit invalidates pending imports while its semantic no-op does not', () => {
  const apply = fn('fdCuratorApplyAction');
  const transactions = fn('fdCuratorImportTransactions')();
  let draft = fn('fdCuratorNewDraft')(index(), context());

  let token = transactions.begin();
  let applied = apply(draft, {
    type: 'LOCAL_SET_ORIENTATION', field: 'dailySchedule', value: '',
  }, index(), context());
  assert.equal(applied.changed, false);
  assert.equal(transactions.commit(token), true);

  token = transactions.begin();
  applied = apply(draft, {
    type: 'LOCAL_SET_ORIENTATION', field: 'dailySchedule', value: 'Synthetic schedule',
  }, index(), context());
  assert.equal(applied.changed, true);
  if (applied.changed) transactions.touch();
  assert.equal(transactions.commit(token), false);
  assert.deepEqual(applied.state.preview, { desktopReviewed: false, mobileReviewed: false });
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

for (const audience of ['ms3', 'resident']) {
  test(`rejects semantically invalid base-less ${audience} drafts at restore, save, and reducer entry`, async () => {
    const currentIndex = index(audience);
    const currentContext = context(audience);
    const clean = fn('fdCuratorNewDraft')(currentIndex, currentContext);
    const maxWeek = currentIndex.path.weekCount;
    const cases = [];

    const unknown = structuredClone(clean);
    unknown.config.pathItems[0].ref = 'not-in-current-library.md';
    unknown.config.pathItems[0].instanceId = 'core:not-in-current-library.md:1';
    cases.push(['unknown Library ref', unknown]);

    const mismatchedRef = structuredClone(clean);
    mismatchedRef.config.pathItems[0].instanceId = 'core:other.md:1';
    cases.push(['mismatched instance ref', mismatchedRef]);

    const badOccurrence = structuredClone(clean);
    badOccurrence.config.pathItems[0].instanceId = 'core:pg_interview.md:0';
    cases.push(['non-positive occurrence', badOccurrence]);

    const duplicateOccurrence = structuredClone(clean);
    duplicateOccurrence.config.pathItems.push({
      ...duplicateOccurrence.config.pathItems[0], order: 2,
    });
    cases.push(['duplicate occurrence', duplicateOccurrence]);

    const weekZero = structuredClone(clean);
    weekZero.config.pathItems[0].week = 0;
    cases.push(['week zero', weekZero]);

    const weekOverflow = structuredClone(clean);
    weekOverflow.config.pathItems[0].week = maxWeek + 1;
    cases.push(['week overflow', weekOverflow]);

    const brokenOrder = structuredClone(clean);
    brokenOrder.config.pathItems[0].order = 2;
    cases.push(['non-contiguous order', brokenOrder]);

    const invalidPriority = structuredClone(clean);
    invalidPriority.config.pathItems[0].priority = 'critical';
    cases.push(['invalid priority', invalidPriority]);

    const invalidRationale = structuredClone(clean);
    invalidRationale.config.pathItems[0].rationale = '<script>alert(1)</script>';
    cases.push(['unsafe rationale', invalidRationale]);

    for (const [label, hostile] of cases) {
      const raw = JSON.stringify(hostile);
      const storage = memoryStorage({ cw_curator_draft_v1: raw });
      const adapter = fn('fdCuratorDraftStorage')(storage);
      const restored = await adapter.load(currentIndex, currentContext, webcrypto.subtle);
      assert.equal(restored.ok, false, label);
      assert.equal(restored.draft, null, label);
      assert.equal(storage.raw('cw_curator_draft_v1'), raw, `${label} raw changed`);
      assert.equal(storage.calls.some((entry) => entry[0] === 'removeItem'), false, label);

      storage.calls.length = 0;
      assert.equal(adapter.save(hostile, currentIndex, currentContext), false, label);
      assert.deepEqual(storage.calls, [], `${label} reached storage write`);

      const before = structuredClone(hostile);
      const reduced = fn('fdCuratorReduce')(
        hostile,
        { type: 'SET_CARD_FIELD', field: 'title', value: 'Must not apply' },
        currentIndex,
        currentContext,
      );
      assert.deepEqual(reduced, before, `${label} reducer result changed`);
      assert.notStrictEqual(reduced, hostile, `${label} reducer returned mutable input`);
      assert.deepEqual(hostile, before, `${label} reducer mutated input`);
    }
  });
}

test('parses instance occurrences from the exact ref prefix even when refs contain punctuation', async () => {
  const specialRef = 'topic:section[1].md?view=core';
  const special = { ref: specialRef, title: 'Special punctuation resource' };
  const currentIndex = index();
  currentIndex.byRef[specialRef] = special;
  currentIndex.columns[0].items.push(special);
  let draft = fn('fdCuratorNewDraft')(currentIndex, context());
  draft = fn('fdCuratorReduce')(
    draft, { type: 'PATH_ADD_INSTANCE', ref: specialRef, week: 2 }, currentIndex, context(),
  );
  assert.ok(draft.config.pathItems.some((item) =>
    item.instanceId === `core:${specialRef}:1` && item.ref === specialRef));

  const adapter = fn('fdCuratorDraftStorage')(memoryStorage());
  assert.equal(adapter.save(draft, currentIndex, context()), true);

  draft = fn('fdCuratorReduce')(
    draft, { type: 'PATH_ADD_INSTANCE', ref: specialRef, week: 2 }, currentIndex, context(),
  );
  draft = fn('fdCuratorReduce')(
    draft, { type: 'PATH_ADD_INSTANCE', ref: specialRef, week: 2 }, currentIndex, context(),
  );
  draft = fn('fdCuratorReduce')(
    draft, { type: 'PATH_REMOVE_INSTANCE', instanceId: `core:${specialRef}:2` }, currentIndex, context(),
  );
  assert.deepEqual(
    draft.config.pathItems.filter((item) => item.ref === specialRef).map((item) => item.instanceId),
    [`core:${specialRef}:1`, `core:${specialRef}:3`],
  );
  assert.equal(adapter.save(draft, currentIndex, context()), true, 'positive occurrences may have gaps');

  for (const invalidId of [
    `core:${specialRef}:0`, `core:${specialRef}:-1`, `core:${specialRef}:1:extra`,
    'core:topic:1',
  ]) {
    const hostile = structuredClone(draft);
    hostile.config.pathItems.find((item) => item.ref === specialRef).instanceId = invalidId;
    assert.equal(adapter.save(hostile, currentIndex, context()), false, invalidId);
  }
});

test('reducer accepts only exact own-data actions and fails closed on hostile action or index inspection', () => {
  const currentIndex = index();
  const currentContext = context();
  const draft = fn('fdCuratorNewDraft')(currentIndex, currentContext);
  const before = structuredClone(draft);

  const inherited = Object.create({
    type: 'SET_CARD_FIELD', field: 'title', value: 'Inherited mutation',
  });
  const getter = {};
  Object.defineProperty(getter, 'type', { enumerable: true, get() { throw new Error('getter ran'); } });
  const target = { type: 'SET_CARD_FIELD', field: 'title', value: 'Revoked mutation' };
  const revocable = Proxy.revocable(target, {});
  revocable.revoke();
  const extra = {
    type: 'SET_CARD_FIELD', field: 'title', value: 'Extra mutation', extra: true,
  };
  const hostileActions = [inherited, getter, revocable.proxy, extra];

  for (const action of hostileActions) {
    const result = fn('fdCuratorReduce')(draft, action, currentIndex, currentContext);
    assert.deepEqual(result, before);
    assert.notStrictEqual(result, draft);
    assert.deepEqual(draft, before);
  }

  const accepted = Object.create(null);
  Object.defineProperties(accepted, {
    type: { enumerable: true, value: 'SET_CARD_FIELD' },
    field: { enumerable: true, value: 'title' },
    value: { enumerable: true, value: 'Own data action' },
  });
  assert.equal(
    fn('fdCuratorReduce')(draft, accepted, currentIndex, currentContext).config.card.title,
    'Own data action',
  );

  const inheritedIndex = Object.create(currentIndex);
  const getterIndex = { ...currentIndex };
  Object.defineProperty(getterIndex, 'columns', {
    enumerable: true, get() { throw new Error('index getter ran'); },
  });
  const revokedIndex = Proxy.revocable(currentIndex, {});
  revokedIndex.revoke();
  for (const hostileIndex of [inheritedIndex, getterIndex, revokedIndex.proxy]) {
    const result = fn('fdCuratorReduce')(
      draft,
      { type: 'SET_CARD_FIELD', field: 'title', value: 'Must not apply' },
      hostileIndex,
      currentContext,
    );
    assert.deepEqual(result, before);
    assert.notStrictEqual(result, draft);
    assert.deepEqual(draft, before);
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

test('enforces the 64 KiB file cap before reading and again before parsing returned text', async () => {
  let reads = 0;
  const file = { size: 65537, text() { reads += 1; return Promise.resolve('{}'); } };
  const result = await fn('fdCuratorReadImportFile')(
    file, index(), context(), webcrypto.subtle,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CURATOR_IMPORT_SIZE');
  assert.equal(reads, 0);

  const understated = {
    size: 1,
    text() { reads += 1; return Promise.resolve('\u00e9'.repeat(32769)); },
  };
  const postRead = await fn('fdCuratorReadImportFile')(
    understated, index(), context(), webcrypto.subtle,
  );
  assert.equal(postRead.ok, false);
  assert.equal(postRead.code, 'CURATOR_IMPORT_SIZE');
  assert.equal(reads, 1);
});

test('import transactions allow only the latest untouched request to commit', () => {
  const transactions = fn('fdCuratorImportTransactions')();
  const first = transactions.begin();
  const second = transactions.begin();
  assert.equal(transactions.commit(first), false, 'an earlier import cannot beat a newer import');
  assert.equal(transactions.commit(second), true);

  const beforeEdit = transactions.begin();
  transactions.touch();
  assert.equal(transactions.commit(beforeEdit), false, 'an intervening edit cancels a pending import');

  const current = transactions.begin();
  assert.equal(transactions.commit(current), true);
  assert.equal(transactions.commit(current), false, 'one import token can commit only once');
});

test('action application invalidates pending imports only for semantic draft changes', () => {
  const apply = fn('fdCuratorApplyAction');
  const transactions = fn('fdCuratorImportTransactions')();
  let draft = fn('fdCuratorNewDraft')(index(), context());

  function dispatch(action) {
    const result = apply(draft, action, index(), context());
    assert.equal(typeof result.changed, 'boolean');
    draft = result.state;
    if (result.changed) transactions.touch();
    return result.changed;
  }

  const untouched = transactions.begin();
  assert.equal(dispatch({ type: 'GO_TO_STEP', step: 2 }), false, 'navigation is not a draft edit');
  assert.equal(dispatch({
    type: 'PATH_SET_PRIORITY', instanceId: 'core:pg_interview.md:1', priority: 'recommended',
  }), false);
  assert.equal(dispatch({
    type: 'PATH_SET_RATIONALE', instanceId: 'core:pg_interview.md:1', value: '',
  }), false);
  assert.equal(dispatch({
    type: 'PATH_MOVE_WEEK', instanceId: 'core:pg_interview.md:1', week: 1,
  }), false);
  assert.equal(dispatch({ type: 'PATH_MOVE_UP', instanceId: 'core:pg_interview.md:1' }), false);
  assert.equal(dispatch({ type: 'PATH_MOVE_DOWN', instanceId: 'core:pg_interview.md:1' }), false);
  assert.equal(dispatch({ type: 'PATH_REMOVE_INSTANCE', instanceId: 'core:missing.md:1' }), false);
  assert.equal(dispatch({ type: 'NOT_AN_ACTION', inherited: true }), false);
  assert.equal(transactions.commit(untouched), true, 'reducer no-ops preserve the pending import');

  const edited = transactions.begin();
  assert.equal(dispatch({
    type: 'PATH_SET_PRIORITY', instanceId: 'core:pg_interview.md:1', priority: 'required',
  }), true);
  assert.equal(transactions.commit(edited), false, 'a real student-visible edit cancels the import');

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.doesNotThrow(() => dispatch(revoked.proxy));
});

test('preview sequencing invalidates older success and error work on every invocation', async () => {
  const harness = loadApi();
  const pending = [];
  harness.setCuratorProjector(draft => new Promise(resolve => {
    pending.push({ title: draft.config.card.title, resolve });
  }));
  const preview = { innerHTML: '' };
  const root = {
    querySelector(selector) { return selector === '#curatorPreviewBody' ? preview : null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const app = harness.fdCuratorMount(root, index(), context());
  const placeholder = '<p class="panel-note">Preview is read-only and updates from the validated curriculum and schedule.</p>';
  const incomplete = '<p class="panel-note">Complete the current fields to update this read-only preview.</p>';
  const staleSuccess = {
    ok: true,
    index: {
      weeks: [{ n: 1, items: [{ title: 'STALE PREVIEW', editionPriority: 'required' }] }],
      columns: [],
    },
  };

  assert.equal(preview.innerHTML, placeholder);
  app.dispatch({ type: 'GO_TO_STEP', step: 2 });
  app.dispatch({ type: 'SET_CARD_FIELD', field: 'title', value: 'Newest preview request' });
  assert.equal(pending.length, 2);
  pending[1].resolve({ ok: false, index: null });
  await Promise.resolve();
  assert.equal(preview.innerHTML, incomplete, 'the newest error result owns the preview');
  pending[0].resolve(staleSuccess);
  await Promise.resolve();
  assert.equal(preview.innerHTML, incomplete, 'an older success cannot beat the newest error');

  app.dispatch({ type: 'SET_CARD_FIELD', field: 'title', value: 'Will be imported away' });
  assert.equal(pending.length, 3);
  app.dispatch({ type: 'GO_TO_STEP', step: 1 });
  assert.equal(preview.innerHTML, placeholder);
  pending[2].resolve(staleSuccess);
  await Promise.resolve();
  assert.equal(preview.innerHTML, placeholder, 'a non-preview render invalidates pending work');
  assert.doesNotMatch(preview.innerHTML, /STALE PREVIEW/);
});

test('generation actions inspect only private trusted snapshots', async () => {
  const reduce = fn('fdCuratorReduce');
  const apply = fn('fdCuratorApplyAction');
  const draft = draftWithCard(completeConfig('ms3', 1));
  const expected = fn('fdCuratorBuildConfig')(draft, index(), context());
  const trusted = await F.fdEditionCreateEnvelope(
    expected.value, index(), context(), webcrypto.subtle,
  );
  let getterReads = 0;
  const accessorResult = {};
  Object.defineProperty(accessorResult, 'ok', {
    enumerable: true,
    get() { getterReads += 1; return true; },
  });
  const inheritedResult = Object.create(trusted);
  const extraFieldResult = { ...trusted, extra: true };
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();

  for (const hostile of [accessorResult, inheritedResult, extraFieldResult, revoked.proxy]) {
    let reduced;
    assert.doesNotThrow(() => {
      reduced = reduce(draft, { type: 'GENERATION_SUCCEEDED', result: hostile }, index(), context());
    });
    assert.deepEqual(reduced, draft);
    let applied;
    assert.doesNotThrow(() => {
      applied = apply(draft, { type: 'GENERATION_SUCCEEDED', result: hostile }, index(), context());
    });
    assert.deepEqual(applied.state, draft);
    assert.equal(applied.changed, false);
  }
  assert.equal(getterReads, 0, 'the reducer must not read result.ok or any hostile member');
});

test('accepts only the exact current full config as a successful generation', async () => {
  const nextEdition = fn('fdCuratorNextEditionNumber');
  const build = fn('fdCuratorBuildConfig');
  const reduce = fn('fdCuratorReduce');

  let fresh = draftWithCard(completeConfig('ms3', 1));
  assert.equal(nextEdition(fresh, completeConfig('ms3', 1)), 1);
  const freshExpected = build(fresh, index(), context());
  assert.equal(freshExpected.ok, true);
  assert.equal(freshExpected.value.editionNumber, 1);
  const freshGenerated = await F.fdEditionCreateEnvelope(
    freshExpected.value, index(), context(), webcrypto.subtle,
  );
  const freshAccepted = reduce(
    fresh, { type: 'GENERATION_SUCCEEDED', result: freshGenerated }, index(), context(),
  );
  assert.equal(freshAccepted.publication.baseEnvelope.config.editionNumber, 1);

  for (const invalidConfig of [
    { ...freshExpected.value, editionNumber: 99 },
    { ...freshExpected.value, createdAgainstCoreRevision: 'b'.repeat(40) },
  ]) {
    const invalidResult = await F.fdEditionCreateEnvelope(
      invalidConfig, index(), context(), webcrypto.subtle,
    );
    assert.equal(invalidResult.ok, true);
    const rejected = reduce(
      fresh, { type: 'GENERATION_SUCCEEDED', result: invalidResult }, index(), context(),
    );
    assert.deepEqual(rejected.publication, fresh.publication);
  }

  const staleResult = freshGenerated;
  const editedAfterGenerationStarted = setCard(fresh, 'title', 'Newer local edit');
  const staleRejected = reduce(
    editedAfterGenerationStarted,
    { type: 'GENERATION_SUCCEEDED', result: staleResult },
    index(), context(),
  );
  assert.deepEqual(staleRejected.publication, editedAfterGenerationStarted.publication);

  const baseResult = await envelopeFor('ms3', 3);
  let imported = (await fn('fdCuratorImportEnvelope')(
    JSON.stringify(baseResult.envelope), index(), context(), webcrypto.subtle,
  )).draft;
  const preserve = build(imported, index(), context());
  assert.equal(preserve.value.editionNumber, 3);
  const preserveResult = await F.fdEditionCreateEnvelope(
    preserve.value, index(), context(), webcrypto.subtle,
  );
  const preserved = reduce(
    imported, { type: 'GENERATION_SUCCEEDED', result: preserveResult }, index(), context(),
  );
  assert.equal(preserved.publication.baseEnvelope.config.editionNumber, 3);

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
  assert.equal(regenerated.fingerprint, generated.fingerprint);
  assert.equal(regenerated.envelope.digest, generated.envelope.digest);

  const rollbackConfig = { ...changed.value, editionNumber: 3 };
  const rollback = await F.fdEditionCreateEnvelope(
    rollbackConfig, index(), context(), webcrypto.subtle,
  );
  const rollbackRejected = reduce(
    imported, { type: 'GENERATION_SUCCEEDED', result: rollback }, index(), context(),
  );
  assert.deepEqual(rollbackRejected.publication, imported.publication);
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
