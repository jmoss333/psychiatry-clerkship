import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build/frontdoor';
const DATA_SOURCE = new URL(`${BUILD}/fd_data.js`, import.meta.url);
const CONTRACT_SOURCE = new URL(`${BUILD}/fd_edition_contract.js`, import.meta.url);
const PROJECT_SOURCE = new URL(`${BUILD}/fd_edition_project.js`, import.meta.url);
const CURATOR_SOURCE = new URL(`${BUILD}/fd_curator.js`, import.meta.url);
const HTML_SOURCE = new URL(
  '../13_Faculty_Resources/Rotation_Curation/rotation-curator.html', import.meta.url,
);
const API_NAMES = [
  'fdCuratorNewDraft', 'fdCuratorReduce', 'fdCuratorLibraryGroups',
  'fdCuratorCurriculumMarkup', 'fdCuratorScheduleMarkup', 'fdCuratorProjectDraft',
];

function loadApi() {
  const source = [DATA_SOURCE, CONTRACT_SOURCE, PROJECT_SOURCE, CURATOR_SOURCE]
    .map((url) => readFileSync(url, 'utf8')).join('\n');
  return new Function(
    'TextEncoder', 'TextDecoder', 'atob', 'btoa',
    `${source}\nreturn {${API_NAMES.map((name) =>
      `${name}:typeof ${name}==='function'?${name}:null`).join(',')}};`,
  )(TextEncoder, TextDecoder, atob, btoa);
}

const F = loadApi();
const REVISION = 'b'.repeat(40);

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

function makeItem(ref, title, kind = 'read') {
  return {
    ref, title, kind, minutes: 5, summary: `${title} summary`, points: [],
    attested: true, toolRef: null, risk: null, governance: null,
    href: kind === 'tool' ? `?tool=${ref}` : `?page=${ref}`,
  };
}

function index(audience = 'ms3') {
  const count = audience === 'ms3' ? 6 : 4;
  const interview = makeItem('interview.md', 'Interview structure');
  const mse = makeItem('mse.html', 'Mental status exam', 'tool');
  const formulation = makeItem('formulation.md', 'Formulation guide');
  const libraryOnly = makeItem('library-only.md', 'Library only reading');
  const hiddenCurator = makeItem('rotation-curator.html', 'Faculty curator', 'tool');
  const localOnly = makeItem('local:resource:1', 'Local-only resource');
  const safetyOnly = makeItem('safety-only.md', 'Safety-only surface');
  const otherAudience = makeItem('other-audience.md', 'Other audience path');
  const byRef = Object.fromEntries([
    interview, mse, formulation, libraryOnly, hiddenCurator, localOnly,
    safetyOnly, otherAudience,
  ].map((item) => [item.ref, item]));
  const weekItems = audience === 'ms3'
    ? [[interview, mse], [formulation], [], [], [], [interview]]
    : [[interview, mse], [formulation], [], [interview]];
  return {
    path: { id: context(audience).pathId, weekCount: count },
    weeks: Array.from({ length: count }, (_, offset) => ({
      n: offset + 1,
      title: `Week ${offset + 1}`,
      theme: `Theme ${offset + 1}`,
      focusCategories: [],
      items: weekItems[offset],
    })),
    byRef,
    columns: [
      { name: 'Core skills', accent: '#174d43', items: [interview, mse, libraryOnly] },
      {
        name: 'Clinical reasoning', accent: '#9f3f2a',
        items: [formulation, interview, hiddenCurator, localOnly],
      },
    ],
    kit: [{ item: safetyOnly, sub: 'Protected safety guidance.' }],
  };
}

function reduce(draft, action, audience = 'ms3') {
  return fn('fdCuratorReduce')(draft, action, index(audience), context(audience));
}

function ids(draft) {
  return draft.config.pathItems.map((item) => item.instanceId);
}

function itemsInWeek(draft, week) {
  return draft.config.pathItems
    .filter((item) => item.week === week)
    .sort((left, right) => left.order - right.order);
}

function reviewedDraft(audience = 'ms3') {
  let draft = fn('fdCuratorNewDraft')(index(audience), context(audience));
  draft = reduce(draft, { type: 'SET_PREVIEW_REVIEWED', viewport: 'desktop', value: true }, audience);
  draft = reduce(draft, { type: 'SET_PREVIEW_REVIEWED', viewport: 'mobile', value: true }, audience);
  for (const name of ['publicSafe', 'officialLinks', 'previewsReviewed', 'forwardable']) {
    draft = reduce(draft, { type: 'SET_AFFIRMATION', name, value: true }, audience);
  }
  return draft;
}

function assertReviewsReset(draft) {
  assert.deepEqual(draft.preview, { desktopReviewed: false, mobileReviewed: false });
  assert.deepEqual(draft.affirmations, {
    publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false,
  });
}

function fillCard(draft, audience = 'ms3') {
  const values = {
    title: 'Synthetic rotation', locationName: 'Example Unit', locationCode: 'EX1',
    curatorName: 'Example Curator', curatorRole: 'Faculty educator',
    rotationStart: '2026-09-01',
    rotationEnd: audience === 'ms3' ? '2026-10-12' : '2026-09-28',
    lastVerified: '2026-08-19',
  };
  for (const [field, value] of Object.entries(values)) {
    draft = reduce(draft, { type: 'SET_CARD_FIELD', field, value }, audience);
  }
  return draft;
}

for (const audience of ['ms3', 'resident']) {
  test(`seeds only the current ${audience} canonical path with deterministic occurrences`, () => {
    const draft = fn('fdCuratorNewDraft')(index(audience), context(audience));
    const finalWeek = audience === 'ms3' ? 6 : 4;
    assert.deepEqual(draft.config.pathItems, [
      {
        instanceId: 'core:interview.md:1', ref: 'interview.md', week: 1,
        order: 1, priority: 'recommended', rationale: '',
      },
      {
        instanceId: 'core:mse.html:1', ref: 'mse.html', week: 1,
        order: 2, priority: 'recommended', rationale: '',
      },
      {
        instanceId: 'core:formulation.md:1', ref: 'formulation.md', week: 2,
        order: 1, priority: 'recommended', rationale: '',
      },
      {
        instanceId: 'core:interview.md:2', ref: 'interview.md', week: finalWeek,
        order: 1, priority: 'recommended', rationale: '',
      },
    ]);
    assert.equal(ids(draft).some((id) => id.includes('other-audience')), false);
  });
}

for (const audience of ['ms3', 'resident']) {
  test(`same-ref ${audience} placements have unique accessible schedule controls after moves`, () => {
    let draft = fn('fdCuratorNewDraft')(index(audience), context(audience));
    draft = reduce(draft, {
      type: 'PATH_ADD_INSTANCE', ref: 'interview.md', week: 1,
    }, audience);

    function labels(markup, action) {
      return [...markup.matchAll(new RegExp(
        `data-curator-path-${action}="core:interview\\.md:[^"]+"[^>]+aria-label="([^"]+)"`,
        'g',
      ))].map((match) => match[1]);
    }

    let markup = fn('fdCuratorScheduleMarkup')(draft, index(audience));
    for (const action of ['up', 'down', 'week', 'remove']) {
      const names = labels(markup, action);
      assert.ok(names.length >= 2, `${action} names missing`);
      assert.equal(new Set(names).size, names.length, `${action} names must be unique`);
      assert.ok(names.every((name) => /placement \d+/.test(name)), `${action} lacks occurrence`);
      assert.ok(names.every((name) => /position \d+ of \d+/.test(name)), `${action} lacks position`);
    }
    const curriculum = fn('fdCuratorCurriculumMarkup')(draft, index(audience), 'Interview');
    for (const control of ['priority', 'rationale']) {
      const names = [...curriculum.matchAll(new RegExp(
        `data-curator-path-${control}="core:interview\\.md:[^"]+"[^>]+aria-label="([^"]+)"`,
        'g',
      ))].map((match) => match[1]);
      assert.equal(names.length, 3, `${control} names missing`);
      assert.equal(new Set(names).size, names.length, `${control} names must be unique`);
      assert.ok(names.every((name) => /placement \d+/.test(name)), `${control} lacks occurrence`);
      assert.ok(names.every((name) => /position \d+ of \d+ in Week \d+/.test(name)),
        `${control} lacks current week position`);
    }

    draft = reduce(draft, {
      type: 'PATH_MOVE_UP', instanceId: 'core:interview.md:3',
    }, audience);
    draft = reduce(draft, {
      type: 'PATH_MOVE_WEEK', instanceId: 'core:interview.md:1', week: 2,
    }, audience);
    markup = fn('fdCuratorScheduleMarkup')(draft, index(audience));
    for (const action of ['up', 'down', 'week', 'remove']) {
      const names = labels(markup, action);
      assert.equal(new Set(names).size, names.length, `${action} names collided after moves`);
    }
    assert.match(markup, /placement 3, position 1 of \d+ in Week 1/);
    assert.match(markup, /placement 1, position \d+ of \d+ in Week 2/);
    const rerenderedCurriculum = fn('fdCuratorCurriculumMarkup')(
      draft, index(audience), 'Interview',
    );
    assert.match(rerenderedCurriculum,
      /Local priority for Interview structure placement 3, position 1 of 2 in Week 1/);
    assert.match(rerenderedCurriculum,
      /Why I selected Interview structure placement 1, position 2 of 2 in Week 2/);
  });
}

test('rejects over-limit dense, sparse, and fallible index arrays before reading elements', () => {
  const groups = fn('fdCuratorLibraryGroups');
  const tooMany = 12289;
  const base = index();
  const dense = Array.from({ length: tooMany }, () => ({
    name: 'Unused', accent: '#174d43', items: [],
  }));
  assert.deepEqual(groups({ ...base, columns: dense }), []);

  let ownKeysReads = 0;
  let elementReads = 0;
  const sparse = new Proxy(new Array(tooMany), {
    ownKeys() { ownKeysReads += 1; throw new Error('must not enumerate'); },
    getOwnPropertyDescriptor(target, key) {
      if (key !== 'length') elementReads += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.doesNotThrow(() => groups({ ...base, columns: sparse }));
  assert.deepEqual(groups({ ...base, columns: sparse }), []);
  assert.equal(ownKeysReads, 0, 'over-limit arrays are rejected before key enumeration');
  assert.equal(elementReads, 0, 'over-limit arrays are rejected before element inspection');

  const revoked = Proxy.revocable([], {});
  revoked.revoke();
  assert.doesNotThrow(() => groups({ ...base, columns: revoked.proxy }));
  assert.deepEqual(groups({ ...base, columns: revoked.proxy }), []);
});

test('omits, re-adds, adds Library-only resources, and creates deliberate repeats', () => {
  let draft = reviewedDraft();
  const original = structuredClone(draft);

  draft = reduce(draft, { type: 'PATH_TOGGLE', ref: 'mse.html' });
  assert.equal(draft.config.pathItems.some((item) => item.ref === 'mse.html'), false);
  assert.deepEqual(original.config.pathItems[0], draft.config.pathItems[0]);
  assertReviewsReset(draft);

  draft = reduce(draft, { type: 'PATH_TOGGLE', ref: 'mse.html' });
  assert.deepEqual(draft.config.pathItems.find((item) => item.ref === 'mse.html'), {
    instanceId: 'core:mse.html:1', ref: 'mse.html', week: 1,
    order: 2, priority: 'recommended', rationale: '',
  });

  draft = reduce(draft, { type: 'PATH_TOGGLE', ref: 'library-only.md' });
  assert.deepEqual(draft.config.pathItems.find((item) => item.ref === 'library-only.md'), {
    instanceId: 'core:library-only.md:1', ref: 'library-only.md', week: 1,
    order: 3, priority: 'recommended', rationale: '',
  });

  draft = reduce(draft, { type: 'PATH_ADD_INSTANCE', ref: 'interview.md', week: 3 });
  assert.ok(ids(draft).includes('core:interview.md:3'));
  draft = reduce(draft, { type: 'PATH_REMOVE_INSTANCE', instanceId: 'core:interview.md:2' });
  draft = reduce(draft, { type: 'PATH_ADD_INSTANCE', ref: 'interview.md', week: 4 });
  assert.ok(ids(draft).includes('core:interview.md:2'), 'the next unused positive occurrence is reused');
  assert.equal(new Set(ids(draft)).size, ids(draft).length);
});

test('moves up and down with stable IDs, contiguous order, and boundary no-ops', () => {
  let draft = fn('fdCuratorNewDraft')(index(), context());
  const initialIds = ids(draft);
  const firstBoundary = reduce(draft, { type: 'PATH_MOVE_UP', instanceId: 'core:interview.md:1' });
  assert.deepEqual(firstBoundary, draft);

  draft = reduce(draft, { type: 'PATH_MOVE_UP', instanceId: 'core:mse.html:1' });
  assert.deepEqual(itemsInWeek(draft, 1).map((item) => [item.instanceId, item.order]), [
    ['core:mse.html:1', 1], ['core:interview.md:1', 2],
  ]);
  assert.deepEqual(new Set(ids(draft)), new Set(initialIds));

  draft = reduce(draft, { type: 'PATH_MOVE_DOWN', instanceId: 'core:mse.html:1' });
  assert.deepEqual(itemsInWeek(draft, 1).map((item) => [item.instanceId, item.order]), [
    ['core:interview.md:1', 1], ['core:mse.html:1', 2],
  ]);
  const lastBoundary = reduce(draft, { type: 'PATH_MOVE_DOWN', instanceId: 'core:mse.html:1' });
  assert.deepEqual(lastBoundary, draft);
});

test('moves between weeks, appends in the target week, deletes, and normalizes both weeks', () => {
  let draft = fn('fdCuratorNewDraft')(index(), context());
  draft = reduce(draft, {
    type: 'PATH_MOVE_WEEK', instanceId: 'core:mse.html:1', week: 2,
  });
  assert.deepEqual(itemsInWeek(draft, 1).map((item) => item.order), [1]);
  assert.deepEqual(itemsInWeek(draft, 2).map((item) => [item.instanceId, item.order]), [
    ['core:formulation.md:1', 1], ['core:mse.html:1', 2],
  ]);
  assert.equal(draft.config.pathItems.find((item) => item.instanceId === 'core:mse.html:1').week, 2);

  draft = reduce(draft, { type: 'PATH_REMOVE_INSTANCE', instanceId: 'core:formulation.md:1' });
  assert.deepEqual(itemsInWeek(draft, 2).map((item) => item.order), [1]);
  assert.equal(ids(draft).includes('core:formulation.md:1'), false);
});

test('sets only valid priorities and safe bounded rationale text', () => {
  let draft = reviewedDraft();
  draft = reduce(draft, {
    type: 'PATH_SET_PRIORITY', instanceId: 'core:interview.md:1', priority: 'required',
  });
  assert.equal(draft.config.pathItems[0].priority, 'required');
  assertReviewsReset(draft);

  draft = reduce(draft, {
    type: 'PATH_SET_RATIONALE', instanceId: 'core:interview.md:1',
    value: 'Use this structure for the first supervised interview.',
  });
  assert.equal(
    draft.config.pathItems[0].rationale,
    'Use this structure for the first supervised interview.',
  );
});

for (const audience of ['ms3', 'resident']) {
  test(`rejects invalid ${audience} path actions inside the reducer without mutation`, () => {
    const maxWeek = index(audience).path.weekCount;
    const draft = reviewedDraft(audience);
    const firstId = draft.config.pathItems[0].instanceId;
    const invalidActions = [
      { type: 'PATH_TOGGLE', ref: 'other-audience.md' },
      { type: 'PATH_TOGGLE', ref: 'rotation-curator.html' },
      { type: 'PATH_TOGGLE', ref: 'local:resource:1' },
      { type: 'PATH_ADD_INSTANCE', ref: 'safety-only.md', week: 1 },
      { type: 'PATH_ADD_INSTANCE', ref: 'missing.md', week: 1 },
      { type: 'PATH_ADD_INSTANCE', ref: 'interview.md', week: 0 },
      { type: 'PATH_ADD_INSTANCE', ref: 'interview.md', week: maxWeek + 1 },
      { type: 'PATH_ADD_INSTANCE', ref: 'interview.md', week: 1.5 },
      { type: 'PATH_REMOVE_INSTANCE', instanceId: 'missing-instance' },
      { type: 'PATH_MOVE_UP', instanceId: 'missing-instance' },
      { type: 'PATH_MOVE_DOWN', instanceId: 'missing-instance' },
      { type: 'PATH_MOVE_WEEK', instanceId: firstId, week: 0 },
      { type: 'PATH_MOVE_WEEK', instanceId: firstId, week: maxWeek + 1 },
      { type: 'PATH_MOVE_WEEK', instanceId: firstId, week: 2.5 },
      { type: 'PATH_SET_PRIORITY', instanceId: firstId, priority: 'universal' },
      { type: 'PATH_SET_RATIONALE', instanceId: firstId, value: 42 },
      { type: 'PATH_SET_RATIONALE', instanceId: firstId, value: 'x'.repeat(281) },
      { type: 'PATH_SET_RATIONALE', instanceId: firstId, value: '<script>alert(1)</script>' },
      { type: 'PATH_SET_RATIONALE', instanceId: firstId, value: 'unsafe\u0000text' },
    ];
    for (const action of invalidActions) {
      const before = structuredClone(draft);
      const result = reduce(draft, action, audience);
      assert.deepEqual(result, before, JSON.stringify(action));
      assert.deepEqual(draft, before, `input mutated for ${JSON.stringify(action)}`);
    }
  });
}

test('fails closed when a structurally restored path contains unknown refs or broken identity/order', () => {
  const base = fn('fdCuratorNewDraft')(index(), context());
  const cases = [];

  const unknown = structuredClone(base);
  unknown.config.pathItems[0].ref = 'safety-only.md';
  cases.push([
    unknown,
    { type: 'PATH_SET_PRIORITY', instanceId: unknown.config.pathItems[0].instanceId, priority: 'required' },
  ]);

  const duplicateId = structuredClone(base);
  duplicateId.config.pathItems[1].instanceId = duplicateId.config.pathItems[0].instanceId;
  cases.push([
    duplicateId,
    { type: 'PATH_MOVE_WEEK', instanceId: duplicateId.config.pathItems[0].instanceId, week: 2 },
  ]);

  const brokenOrder = structuredClone(base);
  brokenOrder.config.pathItems[1].order = 7;
  cases.push([
    brokenOrder,
    { type: 'PATH_SET_RATIONALE', instanceId: brokenOrder.config.pathItems[0].instanceId, value: 'Safe text.' },
  ]);

  const invalidWeek = structuredClone(base);
  invalidWeek.config.pathItems[0].week = 7;
  cases.push([
    invalidWeek,
    { type: 'PATH_SET_PRIORITY', instanceId: invalidWeek.config.pathItems[0].instanceId, priority: 'required' },
  ]);

  for (const [draft, action] of cases) {
    const before = structuredClone(draft);
    assert.deepEqual(reduce(draft, action), before);
    assert.deepEqual(draft, before);
  }
});

test('builds searchable semantic Library groups without cross-surface choices', () => {
  const groups = fn('fdCuratorLibraryGroups')(index());
  assert.deepEqual(groups.map((group) => group.name), ['Core skills', 'Clinical reasoning']);
  assert.deepEqual(groups.flatMap((group) => group.items.map((item) => item.ref)), [
    'interview.md', 'mse.html', 'library-only.md', 'formulation.md',
  ]);

  const draft = fn('fdCuratorNewDraft')(index(), context());
  const markup = fn('fdCuratorCurriculumMarkup')(draft, index(), '');
  const filteredMarkup = fn('fdCuratorCurriculumMarkup')(draft, index(), 'library only');
  assert.match(markup, /<section[^>]+aria-labelledby=/);
  assert.match(markup, /<ul[^>]*>/);
  assert.match(filteredMarkup, /Library only reading/);
  assert.doesNotMatch(filteredMarkup, /Interview structure|Mental status exam|Formulation guide/);
  assert.match(markup, /Include in curated Path/);
  assert.match(markup, /Add another placement/);
  assert.match(markup, /required/);
  assert.match(markup, /recommended/);
  assert.match(markup, /optional/);
  assert.match(markup, /maxlength="280"/);
  assert.match(markup, /0 of 280 characters/);
  assert.doesNotMatch(markup, /Faculty curator|Local-only resource|Safety-only surface|Other audience path/);
});

for (const audience of ['ms3', 'resident']) {
  test(`renders one keyboard-complete semantic schedule list for each ${audience} week`, () => {
    const draft = fn('fdCuratorNewDraft')(index(audience), context(audience));
    const markup = fn('fdCuratorScheduleMarkup')(draft, index(audience));
    const weekCount = index(audience).path.weekCount;
    assert.equal((markup.match(/data-curator-week="/g) || []).length, weekCount);
    assert.equal((markup.match(/<ol class="curator-week-list"/g) || []).length, weekCount);
    assert.match(markup, /Week 1 · Week 1/);
    assert.match(markup, /aria-label="Move Interview structure placement 1, position 1 of 2 in Week 1 up"[^>]*disabled/);
    assert.match(markup, /aria-label="Move Mental status exam placement 1, position 2 of 2 in Week 1 down"[^>]*disabled/);
    assert.match(markup, /aria-label="Move Interview structure placement 1, position 1 of 2 in Week 1 to another week"/);
    assert.match(markup, new RegExp(`<option value="${weekCount}">Week ${weekCount}</option>`));
    assert.doesNotMatch(markup, /draggable=/);
  });
}

test('projects the draft preview through the existing pure edition projector', async () => {
  const canonical = index();
  let draft = fillCard(fn('fdCuratorNewDraft')(canonical, context()));
  draft = reduce(draft, { type: 'PATH_TOGGLE', ref: 'mse.html' });
  draft = reduce(draft, { type: 'PATH_ADD_INSTANCE', ref: 'library-only.md', week: 3 });
  const result = await fn('fdCuratorProjectDraft')(
    draft, canonical, context(), webcrypto.subtle,
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.index.weeks[0].items.some((item) => item.ref === 'mse.html'), false);
  assert.deepEqual(result.index.weeks[2].items.map((item) => item.ref), ['library-only.md']);
  assert.strictEqual(result.index.columns, canonical.columns);
  assert.deepEqual(result.index.kit, canonical.kit);
});

test('the page exposes real Step 2 and Step 3 mounts and keeps publication disabled', () => {
  const source = readFileSync(HTML_SOURCE, 'utf8');
  assert.match(source, /id="curatorStepTwo"/);
  assert.match(source, /id="curatorLibrarySearch"[^>]+type="search"/);
  assert.match(source, /Required means required by this local rotation only/);
  assert.match(source, /Omitting a core resource removes it only from this curated Path/);
  assert.match(source, /id="curatorCurriculumGroups"/);
  assert.match(source, /id="curatorStepThree"/);
  assert.match(source, /id="curatorScheduleWeeks"/);
  assert.match(source, /Every schedule action is available without drag and drop/);
  assert.match(source, /id="curatorGenerate" disabled aria-disabled="true"/);
});
