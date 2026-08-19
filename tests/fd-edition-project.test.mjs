import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SOURCE = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js', import.meta.url);
const body = readFileSync(SOURCE, 'utf8');
const F = new Function(`${body}\nreturn {
  fdProjectEdition,fdEditionIndexFingerprint,fdEditionCoreProgressRef
};`)();

function clone(value) { return structuredClone(value); }

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

function canonicalIndex(audience) {
  const weekCount = audience === 'ms3' ? 6 : 4;
  const pathId = audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week';
  const byRef = {
    'assessment.md': {
      ref: 'assessment.md', kind: 'read', title: 'Synthetic assessment', minutes: 9,
      summary: 'Synthetic clinical summary.', points: ['Observe', 'Escalate'],
      attested: true, toolRef: 'assessment-tool.html', risk: 'high',
      governance: ['clinical', 'reviewed', 'revision-a'], href: '?page=assessment.md'
    },
    'assessment-tool.html': {
      ref: 'assessment-tool.html', kind: 'tool', title: 'Synthetic tool', minutes: null,
      summary: 'Synthetic tool summary.', points: [], attested: false, toolRef: null,
      risk: 'medium', governance: ['tool', 'pending', 'revision-b'],
      href: '?tool=assessment-tool.html'
    },
    'omitted.md': {
      ref: 'omitted.md', kind: 'read', title: 'Canonical library-only resource', minutes: 4,
      summary: 'This remains available in the Library.', points: ['Canonical'],
      attested: true, toolRef: null, risk: 'low',
      governance: ['clinical', 'reviewed', 'revision-c'], href: '?page=omitted.md'
    }
  };
  return {
    byRef,
    path: { id: pathId, weekCount },
    weeks: Array.from({ length: weekCount }, (_, offset) => ({
      n: offset + 1,
      title: `Canonical week ${offset + 1}`,
      theme: `Canonical theme ${offset + 1}`,
      focusCategories: [`focus-${offset + 1}`],
      items: offset === 0 ? [byRef['omitted.md']] : []
    })),
    columns: [{
      name: 'Canonical Library', accent: '#123456',
      items: [byRef['assessment.md'], byRef['assessment-tool.html'], byRef['omitted.md']]
    }],
    kit: [{ item: byRef['assessment.md'], sub: 'Canonical Safety Kit guidance.' }]
  };
}

function validatedEdition(audience) {
  const config = {
    audience,
    pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week',
    editionNumber: audience === 'ms3' ? 3 : 7,
    createdAgainstCoreRevision: '1234567890abcdef1234567890abcdef12345678',
    card: {
      title: 'Synthetic curated rotation', locationName: 'Example service', locationCode: 'EX1',
      curatorName: 'Sample Curator', curatorRole: 'Faculty educator',
      rotationStart: '2026-09-01', rotationEnd: '2026-10-12', lastVerified: '2026-08-19'
    },
    pathItems: [
      {
        instanceId: 'core:tool:1', ref: 'assessment-tool.html', week: 1, order: 2,
        priority: 'optional', rationale: 'Use after the core reading.'
      },
      {
        instanceId: 'core:assessment:1', ref: 'assessment.md', week: 1, order: 1,
        priority: 'required', rationale: 'Start with the core framework.'
      },
      {
        instanceId: 'core:assessment:2', ref: 'assessment.md',
        week: audience === 'ms3' ? 6 : 4, order: 1,
        priority: 'recommended', rationale: 'Revisit for integration.'
      }
    ],
    localOrientation: {
      firstDayArrival: 'Synthetic arrival guidance.', dailySchedule: '', roundsWorkflow: '',
      presentationExpectations: '', documentationExpectations: '', attendanceExpectations: '',
      feedbackProcess: '', accessPreparation: '',
      contacts: [{ role: 'Support role', directoryUrl: 'https://example.edu/directory' }],
      checklist: [{ id: 'local:check:1', label: 'Review local orientation', priority: 'required' }],
      resources: [{
        id: 'local:resource:1', title: 'Local orientation resource',
        url: 'https://example.edu/orientation', priority: 'recommended', week: 1,
        rationale: 'Local workflow only.'
      }]
    },
    changeNote: 'Synthetic edition update.'
  };
  const envelope = {
    format: 'cw-rotation-edition', schemaVersion: 1, config,
    digest: `sha256-${'A'.repeat(43)}`
  };
  return {
    ok: true, envelope, config, fingerprint: audience === 'ms3' ? 'EX1-MS3-ABC123' : 'EX1-RES-ABC123',
    errors: [], warnings: []
  };
}

function allWeekItems(index) { return index.weeks.flatMap((week) => week.items); }

function assertStructuredFailure(result) {
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, 'index'), false, 'failure must not expose a partial index');
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0);
  for (const finding of result.errors) {
    assert.deepEqual(Object.keys(finding).sort(), ['blocking', 'code', 'message', 'path']);
    assert.equal(finding.code, 'EDITION_PROJECT');
    assert.equal(finding.blocking, true);
    assert.match(finding.path, /^\//);
  }
}

for (const audience of ['ms3', 'resident']) {
  test(`projects the ordered ${audience} edition across its canonical duration with repeats kept separate`, () => {
    const canonical = canonicalIndex(audience);
    const edition = validatedEdition(audience);
    const canonicalBefore = JSON.stringify(canonical);
    const columnsBefore = JSON.stringify(canonical.columns);
    const kitBefore = JSON.stringify(canonical.kit);
    const byRefBefore = JSON.stringify(canonical.byRef);
    const editionBefore = JSON.stringify(edition);

    const result = F.fdProjectEdition(canonical, edition);

    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const projected = result.index;
    const weekCount = audience === 'ms3' ? 6 : 4;
    assert.equal(projected.weeks.length, weekCount);
    assert.deepEqual(projected.path, canonical.path);
    assert.deepEqual(projected.weeks.map(({ n, title, theme, focusCategories }) => ({
      n, title, theme, focusCategories
    })), canonical.weeks.map(({ n, title, theme, focusCategories }) => ({
      n, title, theme, focusCategories
    })));
    assert.deepEqual(projected.weeks[0].items.map((item) => item.ref),
      ['assessment.md', 'assessment-tool.html']);
    assert.deepEqual(projected.weeks[weekCount - 1].items.map((item) => item.ref),
      ['assessment.md']);
    assert.equal(projected.weeks.slice(1, -1).every((week) => week.items.length === 0), true);

    const [first, tool] = projected.weeks[0].items;
    const repeated = projected.weeks[weekCount - 1].items[0];
    assert.deepEqual(
      [first.editionInstanceId, first.editionPriority, first.editionRationale],
      ['core:assessment:1', 'required', 'Start with the core framework.']
    );
    assert.deepEqual(
      [tool.editionInstanceId, tool.editionPriority, tool.editionRationale],
      ['core:tool:1', 'optional', 'Use after the core reading.']
    );
    assert.deepEqual(
      [repeated.editionInstanceId, repeated.editionPriority, repeated.editionRationale],
      ['core:assessment:2', 'recommended', 'Revisit for integration.']
    );
    assert.notStrictEqual(first, canonical.byRef['assessment.md']);
    assert.notStrictEqual(repeated, canonical.byRef['assessment.md']);
    assert.notStrictEqual(first, repeated);
    assert.equal(F.fdEditionCoreProgressRef(first), 'assessment.md');
    assert.equal(F.fdEditionCoreProgressRef(repeated), 'assessment.md');
    assert.equal(allWeekItems(projected).some((item) => item.ref === 'omitted.md'), false);
    assert.equal(projected.byRef['omitted.md'], canonical.byRef['omitted.md']);

    assert.deepEqual(projected.edition, {
      envelope: edition.envelope,
      fingerprint: edition.fingerprint,
      card: edition.config.card,
      editionNumber: edition.config.editionNumber,
      createdAgainstCoreRevision: edition.config.createdAgainstCoreRevision,
      changeNote: edition.config.changeNote,
      localOrientation: edition.config.localOrientation
    });
    assert.equal(F.fdEditionIndexFingerprint(projected), edition.fingerprint);
    assert.equal(F.fdEditionIndexFingerprint(canonical), '');

    assert.equal(Object.hasOwn(projected.byRef, 'local:resource:1'), false);
    assert.equal(Object.hasOwn(projected.byRef, 'local:check:1'), false);
    assert.equal(JSON.stringify(projected.columns).includes('local:resource:1'), false);
    assert.equal(JSON.stringify(projected.kit).includes('local:check:1'), false);
    for (const local of [
      ...projected.edition.localOrientation.checklist,
      ...projected.edition.localOrientation.resources
    ]) {
      assert.equal(Object.hasOwn(local, 'governance'), false);
      assert.equal(Object.hasOwn(local, 'attested'), false);
    }

    assert.equal(JSON.stringify(canonical), canonicalBefore);
    assert.equal(JSON.stringify(canonical.columns), columnsBefore);
    assert.equal(JSON.stringify(canonical.kit), kitBefore);
    assert.equal(JSON.stringify(canonical.byRef), byRefBefore);
    assert.equal(JSON.stringify(edition), editionBefore);
  });
}

test('projects from a recursively frozen canonical index without changing protected surfaces', () => {
  const canonical = canonicalIndex('ms3');
  const edition = validatedEdition('ms3');
  const protectedBefore = clone({
    columns: canonical.columns, kit: canonical.kit, byRef: canonical.byRef,
    path: canonical.path,
    items: Object.values(canonical.byRef).map((item) => ({
      ref: item.ref, governance: item.governance, attested: item.attested,
      href: item.href, title: item.title, summary: item.summary,
      minutes: item.minutes, points: item.points, risk: item.risk, toolRef: item.toolRef
    }))
  });
  freezeDeep(canonical);

  const result = F.fdProjectEdition(canonical, edition);

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.strictEqual(result.index.columns, canonical.columns);
  assert.strictEqual(result.index.kit, canonical.kit);
  assert.strictEqual(result.index.byRef, canonical.byRef);
  assert.strictEqual(result.index.path, canonical.path);
  assert.deepEqual({
    columns: result.index.columns, kit: result.index.kit, byRef: result.index.byRef,
    path: result.index.path,
    items: Object.values(result.index.byRef).map((item) => ({
      ref: item.ref, governance: item.governance, attested: item.attested,
      href: item.href, title: item.title, summary: item.summary,
      minutes: item.minutes, points: item.points, risk: item.risk, toolRef: item.toolRef
    }))
  }, protectedBefore);
  assert.equal(Object.isFrozen(canonical), true);
  assert.equal(Object.isFrozen(canonical.byRef['assessment.md'].points), true);
});

test('rejects inconsistent projector inputs atomically', () => {
  const cases = [
    ['missing canonical index', null, validatedEdition('ms3')],
    ['missing protected Library columns', (() => {
      const value = canonicalIndex('ms3'); delete value.columns; return value;
    })(), validatedEdition('ms3')],
    ['unsuccessful validation result', canonicalIndex('ms3'), {
      ...validatedEdition('ms3'), ok: false
    }],
    ['successful flag with blocking findings', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3');
      value.errors = [{
        code: 'EDITION_REF', path: '/config/pathItems/0/ref',
        message: 'A core reference is unavailable.', blocking: true
      }];
      return value;
    })()],
    ['missing envelope', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3'); delete value.envelope; return value;
    })()],
    ['path mismatch', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3'); value.config.pathId = 'resident-four-week'; return value;
    })()],
    ['duration mismatch', (() => {
      const value = canonicalIndex('ms3'); value.path.weekCount = 5; return value;
    })(), validatedEdition('ms3')],
    ['unknown ref', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3'); value.config.pathItems[0].ref = 'missing.md'; return value;
    })()],
    ['out-of-range week', canonicalIndex('resident'), (() => {
      const value = validatedEdition('resident'); value.config.pathItems[0].week = 5; return value;
    })()],
    ['duplicate instance ID', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3'); value.config.pathItems[1].instanceId = 'core:tool:1'; return value;
    })()],
    ['duplicate week order', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3'); value.config.pathItems[0].order = 1; return value;
    })()],
    ['noncontiguous week order', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3'); value.config.pathItems[0].order = 3; return value;
    })()],
    ['tampered fingerprint', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3'); value.fingerprint = ''; return value;
    })()],
    ['local checklist with core governance', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3');
      value.config.localOrientation.checklist[0].governance = ['clinical', 'reviewed', 'revision-x'];
      return value;
    })()],
    ['local resource with core attestation', canonicalIndex('ms3'), (() => {
      const value = validatedEdition('ms3');
      value.config.localOrientation.resources[0].attested = true;
      return value;
    })()]
  ];

  for (const [label, canonical, edition] of cases) {
    const canonicalBefore = canonical === null ? null : JSON.stringify(canonical);
    const editionBefore = JSON.stringify(edition);
    const result = F.fdProjectEdition(canonical, edition);
    assertStructuredFailure(result);
    assert.equal(canonical === null ? null : JSON.stringify(canonical), canonicalBefore, label);
    assert.equal(JSON.stringify(edition), editionBefore, label);
  }
});

test('progress and fingerprint helpers fail closed for malformed inputs', () => {
  assert.equal(F.fdEditionCoreProgressRef(null), '');
  assert.equal(F.fdEditionCoreProgressRef({ ref: 4, editionInstanceId: 'core:x:1' }), '');
  assert.equal(F.fdEditionIndexFingerprint(null), '');
  assert.equal(F.fdEditionIndexFingerprint({ edition: { fingerprint: 4 } }), '');
  assert.equal(F.fdEditionIndexFingerprint({ edition: { fingerprint: 'untrusted' } }), '');
});

test('rejects hostile nested edition data without invoking accessors or accepting dangerous keys', () => {
  let reads = 0;
  const accessorEdition = validatedEdition('ms3');
  Object.defineProperty(accessorEdition.config.localOrientation.resources[0], 'title', {
    enumerable: true,
    get() { reads += 1; return 'must not be read'; }
  });
  assertStructuredFailure(F.fdProjectEdition(canonicalIndex('ms3'), accessorEdition));
  assert.equal(reads, 0);

  const dangerousEdition = validatedEdition('ms3');
  Object.defineProperty(dangerousEdition.config.localOrientation.checklist[0], '__proto__', {
    enumerable: true, value: { governance: 'must not cross the boundary' }
  });
  assertStructuredFailure(F.fdProjectEdition(canonicalIndex('ms3'), dangerousEdition));

  const dangerousCanonical = canonicalIndex('ms3');
  Object.defineProperty(dangerousCanonical.byRef['assessment.md'], '__proto__', {
    enumerable: true, value: { attested: true }
  });
  assertStructuredFailure(F.fdProjectEdition(dangerousCanonical, validatedEdition('ms3')));
});
