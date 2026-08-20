import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build/frontdoor';
const REVISION = 'b'.repeat(40);
const CATALOG_REVISION = `sha256-${'C'.repeat(43)}`;
const CATALOG_SOURCE = readFileSync(new URL(`${BUILD}/fd_edition_catalog.js`, import.meta.url), 'utf8')
  .replace('__FD_CATALOG_EXPECTED_REVISION__', CATALOG_REVISION);
const SOURCE = [
  CATALOG_SOURCE,
  readFileSync(new URL(`${BUILD}/fd_edition_contract.js`, import.meta.url), 'utf8'),
  readFileSync(new URL(`${BUILD}/fd_edition_project.js`, import.meta.url), 'utf8'),
  readFileSync(new URL(`${BUILD}/fd_curator.js`, import.meta.url), 'utf8'),
].join('\n');
const NAMES = [
  'fdEditionCatalogSnapshot', 'fdCuratorNewDraft', 'fdCuratorReduce',
  'fdCuratorCatalogOptions', 'fdCuratorCurriculumMarkup', 'fdCuratorScheduleMarkup', 'fdCuratorProjectDraft',
];
const F = new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa',
  `${SOURCE}\nreturn {${NAMES.map((name) => `${name}:typeof ${name}==='function'?${name}:null`).join(',')}};`,
)(TextEncoder, TextDecoder, atob, btoa);
function fn(name) { assert.equal(typeof F[name], 'function', `${name} must be implemented`); return F[name]; }

function context(audience = 'ms3') {
  return { audience, pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week', coreRevision: REVISION, localCatalogRevision: CATALOG_REVISION, rotationEditionV2: 'enabled' };
}
function item(ref, title) { return { ref, title }; }
function index(audience = 'ms3') {
  const count = audience === 'ms3' ? 6 : 4;
  const interview = item('interview.md', 'Interview structure');
  const mse = item('mse.html', 'Mental status exam');
  const formulation = item('formulation.md', 'Formulation guide');
  const library = item('library-only.md', 'Library only reading');
  const byRef = Object.fromEntries([interview, mse, formulation, library].map((row) => [row.ref, row]));
  const placements = audience === 'ms3'
    ? [[interview, mse], [formulation], [], [], [], [interview]]
    : [[interview, mse], [formulation], [], [interview]];
  return {
    path: { id: context(audience).pathId, weekCount: count },
    weeks: placements.map((items, offset) => ({ n: offset + 1, title: `Week ${offset + 1}`, items })),
    byRef, columns: [{ name: 'Core', accent: 'teal', items: [interview, mse, formulation, library] }],
  };
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
async function snapshot(audience) {
  const records = [
    { key: 'choice.reason@v1', kind: 'choice', choiceKind: 'reason', label: 'Reviewed reason', fragment: 'reviewed reason', locationKeys: ['location.example@v1'], audiences: [audience], verifiedOn: '2026-08-19' },
    { key: 'location.example@v1', kind: 'trainingLocation', displayName: 'Example Unit', locationCode: 'EXU', locationTypeCode: 'inpatient', audiences: [audience], officialHostnames: ['example.edu'], verifiedOn: '2026-08-19' },
  ];
  const resolved = await Promise.all(records.map(async (record) => ({ ...record, contentDigest: await digest(record) })));
  resolved.sort((left, right) => left.key.localeCompare(right.key));
  const projection = { schemaVersion: 1, audience, revision: CATALOG_REVISION, projectionDigest: '', rotationEditionV2: 'enabled', selectionKeys: resolved.map((record) => record.key), resolutionRecords: resolved, blockedKeys: [] };
  const bare = structuredClone(projection); delete bare.projectionDigest; projection.projectionDigest = await digest(bare);
  const prepared = await fn('fdEditionCatalogSnapshot')(projection, audience, webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared)); return prepared.snapshot;
}
const SNAPSHOTS = { ms3: await snapshot('ms3'), resident: await snapshot('resident') };
function reduce(draft, action, audience = 'ms3') {
  return fn('fdCuratorReduce')(draft, action, index(audience), context(audience), SNAPSHOTS[audience], '2026-08-19', null);
}
function weekItems(draft, week) { return draft.config.pathItems.filter((row) => row.week === week).sort((a, b) => a.order - b.order); }

for (const audience of ['ms3', 'resident']) {
  test(`${audience} include, repeat, remove, week, order, priority, and reason actions stay in bounds`, () => {
    const lastWeek = audience === 'ms3' ? 6 : 4;
    let draft = fn('fdCuratorNewDraft')(index(audience), context(audience));
    const original = draft;
    draft = reduce(draft, { type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.example@v1' }, audience);
    assert.equal(reduce(draft, { type: 'PATH_INCLUDE', ref: 'interview.md', week: 1 }, audience), draft);
    assert.equal(reduce(draft, { type: 'PATH_REPEAT', ref: 'interview.md', week: lastWeek + 1 }, audience), draft);
    assert.equal(reduce(draft, { type: 'PATH_REPEAT', ref: 'unknown.md', week: 1 }, audience), draft);

    draft = reduce(draft, { type: 'PATH_REPEAT', ref: 'interview.md', week: 1 }, audience);
    assert.equal(draft.config.pathItems.some((row) => row.instanceId === 'core:interview.md:3'), true);
    assert.deepEqual(weekItems(draft, 1).map((row) => row.order), [1, 2, 3]);
    const repeated = draft;
    assert.equal(reduce(draft, { type: 'PATH_MOVE_ORDER', instanceId: 'core:interview.md:1', direction: 'up' }, audience), draft);
    assert.equal(reduce(draft, { type: 'PATH_MOVE_ORDER', instanceId: 'core:interview.md:3', direction: 'down' }, audience), draft);
    assert.equal(reduce(draft, { type: 'PATH_MOVE_WEEK', instanceId: 'core:interview.md:3', week: 1 }, audience), draft);

    draft = reduce(draft, { type: 'PATH_MOVE_ORDER', instanceId: 'core:interview.md:3', direction: 'up' }, audience);
    assert.deepEqual(weekItems(draft, 1).map((row) => row.instanceId), ['core:interview.md:1', 'core:interview.md:3', 'core:mse.html:1']);
    draft = reduce(draft, { type: 'PATH_MOVE_WEEK', instanceId: 'core:interview.md:3', week: 2 }, audience);
    assert.equal(weekItems(draft, 2).at(-1).instanceId, 'core:interview.md:3');
    draft = reduce(draft, { type: 'PATH_SET_PRIORITY', instanceId: 'core:interview.md:3', priority: 'required' }, audience);
    assert.deepEqual(fn('fdCuratorCatalogOptions')(SNAPSHOTS[audience], 'reason', 'location.example@v1', audience).map((row) => row.key), ['choice.reason@v1']);
    draft = reduce(draft, { type: 'PATH_SET_REASON', instanceId: 'core:interview.md:3', reasonKey: 'choice.reason@v1' }, audience);
    assert.deepEqual(draft.config.pathItems.find((row) => row.instanceId === 'core:interview.md:3'), {
      instanceId: 'core:interview.md:3', ref: 'interview.md', week: 2, order: 2,
      priority: 'required', reasonKey: 'choice.reason@v1',
    });
    assert.equal(reduce(draft, { type: 'PATH_SET_REASON', instanceId: 'core:interview.md:3', reasonKey: 'missing@v1' }, audience), draft);
    draft = reduce(draft, { type: 'PATH_REMOVE', instanceId: 'core:interview.md:3' }, audience);
    assert.equal(draft.config.pathItems.some((row) => row.instanceId === 'core:interview.md:3'), false);
    assert.deepEqual(weekItems(draft, 2).map((row) => row.order), [1]);
    assert.deepEqual(original.config.pathItems, fn('fdCuratorNewDraft')(index(audience), context(audience)).config.pathItems);
    assert.notEqual(repeated, original);
  });
}

test('lowest unused occurrence allocation is stable after removal and include restores only an absent ref', () => {
  let draft = fn('fdCuratorNewDraft')(index(), context());
  draft = reduce(draft, { type: 'PATH_REMOVE', instanceId: 'core:interview.md:2' });
  draft = reduce(draft, { type: 'PATH_REPEAT', ref: 'interview.md', week: 3 });
  assert.equal(draft.config.pathItems.some((row) => row.instanceId === 'core:interview.md:2' && row.week === 3), true);
  draft = reduce(draft, { type: 'PATH_REMOVE', instanceId: 'core:formulation.md:1' });
  assert.equal(draft.config.pathItems.some((row) => row.ref === 'formulation.md'), false);
  draft = reduce(draft, { type: 'PATH_INCLUDE', ref: 'formulation.md', week: 4 });
  assert.equal(draft.config.pathItems.some((row) => row.instanceId === 'core:formulation.md:1' && row.week === 4), true);
});

for (const audience of ['ms3', 'resident']) {
  test(`${audience} repeated placement controls have unique complete accessible names`, () => {
    let draft = fn('fdCuratorNewDraft')(index(audience), context(audience));
    draft.config.context.trainingLocationKey = 'location.example@v1';
    draft = reduce(draft, { type: 'PATH_REPEAT', ref: 'interview.md', week: 1 }, audience);
    const curriculum = fn('fdCuratorCurriculumMarkup')(draft, index(audience), SNAPSHOTS[audience], '');
    const schedule = fn('fdCuratorScheduleMarkup')(draft, index(audience));
    const labels = [...`${curriculum}${schedule}`.matchAll(/aria-label="([^"]*Interview structure[^"]*)"/g)].map((match) => match[1]);
    assert.ok(labels.length >= 15);
    assert.equal(new Set(labels).size, labels.length);
    for (const name of labels) {
      assert.match(name, /occurrence [1-9][0-9]*/);
      assert.match(name, /position \d+ of \d+ in Week \d+/);
      assert.match(name, /^(?:Include|Repeat|Remove|Move|Set|Clear|Choose)/);
    }
    assert.match(curriculum, /Reviewed reason/);
    assert.match(curriculum, /data-curator-path-priority/);
    assert.match(curriculum, /data-curator-path-reason/);
    assert.match(schedule, /data-curator-path-move-order/);
    assert.match(schedule, /data-curator-path-move-week/);
    assert.match(schedule, /<button[^>]+type="button"/);
    assert.match(schedule, /<select[^>]+aria-label=/);
  });
}

test('Step 2 library never offers noncanonical, local, or other-audience references', () => {
  const current = index();
  current.byRef['local:resource:1'] = item('local:resource:1', 'Local');
  current.byRef['other.md'] = item('other.md', 'Other audience');
  current.columns[0].items.push(current.byRef['local:resource:1']);
  const draft = fn('fdCuratorNewDraft')(index(), context());
  const markup = fn('fdCuratorCurriculumMarkup')(draft, current, SNAPSHOTS.ms3, '');
  assert.doesNotMatch(markup, /local:resource:1|other\.md|Other audience/);
  assert.match(markup, /library-only\.md/);
});

test('preview delegates only a trusted validation result to the Task 3 projector', async () => {
  let draft = fn('fdCuratorNewDraft')(index(), context());
  const result = await fn('fdCuratorProjectDraft')(
    draft, index(), SNAPSHOTS.ms3, context(), { mode: 'builder', generationDate: '2026-08-19' }, webcrypto.subtle,
  );
  assert.equal(result.ok, false); assert.equal(result.code, 'CURATOR_INCOMPLETE');
});
