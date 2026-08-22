import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SOURCE = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_v1_salvage.js',
  import.meta.url,
), 'utf8');

const API = new Function(
  'TextEncoder', 'atob', 'btoa',
  `${SOURCE}\nreturn {
    fdEditionV1ValidateForSalvage:typeof fdEditionV1ValidateForSalvage==='function'?fdEditionV1ValidateForSalvage:null,
    fdEditionV1Salvage:typeof fdEditionV1Salvage==='function'?fdEditionV1Salvage:null
  };`,
)(TextEncoder, atob, btoa);

const REVISION = 'a'.repeat(40);
const CATALOG_REVISION = `sha256-${'B'.repeat(43)}`;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function index(audience = 'ms3') {
  const weekCount = audience === 'ms3' ? 6 : 4;
  const refs = ['welcome.md', 'interview.md', 'safety.html'];
  return {
    path: { id: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week', weekCount },
    weeks: Array.from({ length: weekCount }, (_, offset) => ({
      n: offset + 1,
      items: offset === 0 ? refs.map((ref) => ({ ref })) : [],
    })),
    byRef: Object.fromEntries(refs.map((ref) => [ref, { ref, title: `Core ${ref}` }])),
    columns: [{ name: 'Core', accent: 'teal', items: refs.map((ref) => ({ ref })) }],
  };
}

function context(audience = 'ms3') {
  return {
    audience,
    pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week',
    coreRevision: REVISION,
    localCatalogRevision: CATALOG_REVISION,
    rotationEditionV2: 'enabled',
  };
}

function blankOrientation() {
  return {
    firstDayArrival: 'SECRET ARRIVAL', dailySchedule: 'SECRET SCHEDULE',
    roundsWorkflow: 'SECRET ROUNDS', presentationExpectations: 'SECRET PRESENTATION',
    documentationExpectations: 'SECRET DOCUMENTATION',
    attendanceExpectations: 'SECRET ATTENDANCE', feedbackProcess: 'SECRET FEEDBACK',
    accessPreparation: 'SECRET ACCESS',
    contacts: [{ role: 'SECRET PERSON', directoryUrl: 'https://secret.invalid/contact' }],
    checklist: [{ id: 'local:secret:1', label: 'SECRET CHECKLIST', priority: 'required' }],
    resources: [{
      id: 'local:resource:1', title: 'SECRET RESOURCE', url: 'https://secret.invalid/resource',
      priority: 'optional', week: 1, rationale: 'SECRET RATIONALE',
    }],
  };
}

function config(overrides = {}) {
  return {
    audience: 'ms3', pathId: 'ms3-six-week', editionNumber: 9,
    createdAgainstCoreRevision: 'c'.repeat(40),
    card: {
      title: 'SECRET TITLE', locationName: 'SECRET LOCATION', locationCode: 'SEC',
      curatorName: 'SECRET NAME', curatorRole: 'SECRET ROLE',
      rotationStart: '2027-01-04', rotationEnd: '2027-02-12', lastVerified: '2027-01-01',
    },
    pathItems: [
      { instanceId: 'old-one', ref: 'interview.md', week: 1, order: 2, priority: 'required', rationale: 'SECRET REASON' },
      { instanceId: 'old-two', ref: 'missing.md', week: 1, order: 3, priority: 'optional', rationale: 'SECRET MISSING' },
      { instanceId: 'old-three', ref: 'welcome.md', week: 1, order: 1, priority: 'recommended', rationale: '' },
      { instanceId: 'old-four', ref: 'interview.md', week: 2, order: 1, priority: 'optional', rationale: '' },
    ],
    localOrientation: blankOrientation(), changeNote: 'SECRET CHANGE NOTE', ...overrides,
  };
}

function envelope(value = config()) {
  const preimage = { format: 'cw-rotation-edition', schemaVersion: 1, config: value };
  const digest = `sha256-${createHash('sha256').update(canonical(preimage)).digest('base64url')}`;
  return { ...preimage, digest };
}

async function validate(value = envelope(), audience = 'ms3') {
  assert.equal(typeof API.fdEditionV1ValidateForSalvage, 'function');
  return API.fdEditionV1ValidateForSalvage(
    JSON.stringify(value), index(audience), context(audience), webcrypto.subtle,
  );
}

test('validates the exact v1 envelope and keeps its intermediate closure-private', async () => {
  const result = await validate();
  assert.deepEqual(result, { ok: true, code: 'V1_SALVAGE_OK' });
  assert.equal(Object.keys(result).some((key) => /config|envelope|text/i.test(key)), false);
  const copied = { ...result };
  assert.deepEqual(
    API.fdEditionV1Salvage(copied, index(), context(), '2026-08-19'),
    { ok: false, code: 'V1_SALVAGE_INVALID', draft: null, droppedReferenceCount: 0 },
  );
});

test('salvage keeps only ordered dates and current core placements and reports a numeric drop count', async () => {
  const result = await validate();
  const salvaged = API.fdEditionV1Salvage(result, index(), context(), '2026-08-19');
  assert.equal(salvaged.ok, true);
  assert.equal(salvaged.code, 'V1_SALVAGE_OK');
  assert.equal(salvaged.droppedReferenceCount, 1);
  assert.deepEqual(salvaged.draft.config.context, {
    trainingLocationKey: '', curatorProfileKey: '',
    rotationStart: '2027-01-04', rotationEnd: '2027-02-12', editionCheckedOn: '',
  });
  assert.deepEqual(salvaged.draft.config.pathItems, [
    { instanceId: 'core:welcome.md:1', ref: 'welcome.md', week: 1, order: 1, priority: 'recommended' },
    { instanceId: 'core:interview.md:1', ref: 'interview.md', week: 1, order: 2, priority: 'required' },
    { instanceId: 'core:interview.md:2', ref: 'interview.md', week: 2, order: 1, priority: 'optional' },
  ]);
  assert.equal(salvaged.draft.config.phraseSetKey, '');
  assert.deepEqual(salvaged.draft.config.localPlan, {});
  assert.deepEqual(salvaged.draft.config.changeSummary, { kindCodes: ['initial'], changedItemCount: 0 });
  assert.deepEqual(salvaged.draft.publication, {
    baseEnvelope: null, baseSemanticConfig: '', lastGenerated: null,
  });
  assert.deepEqual(salvaged.draft.previewReceipts, { desktop: null, mobile: null });
  assert.deepEqual(salvaged.draft.affirmations, {
    publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false,
  });
  const visible = JSON.stringify(salvaged);
  for (const secret of [
    'SECRET TITLE', 'SECRET LOCATION', 'SECRET NAME', 'SECRET PERSON', 'secret.invalid',
    'SECRET CHECKLIST', 'SECRET RESOURCE', 'SECRET RATIONALE', 'SECRET CHANGE NOTE',
  ]) assert.equal(visible.includes(secret), false, secret);
});

test('a real non-future lastVerified becomes editionCheckedOn while future verification never does', async () => {
  const current = config(); current.card.lastVerified = '2026-08-19';
  const currentDraft = API.fdEditionV1Salvage(
    await validate(envelope(current)), index(), context(), '2026-08-19',
  );
  assert.equal(currentDraft.draft.config.context.editionCheckedOn, '2026-08-19');

  const future = config(); future.card.lastVerified = '2026-08-20';
  const futureDraft = API.fdEditionV1Salvage(
    await validate(envelope(future)), index(), context(), '2026-08-19',
  );
  assert.equal(futureDraft.draft.config.context.editionCheckedOn, '');
});

test('digest mismatch, cross-audience, malformed, and oversize strings fail with fixed codes', async () => {
  const mismatch = envelope(); mismatch.digest = `sha256-${'A'.repeat(43)}`;
  assert.deepEqual(await validate(mismatch), { ok: false, code: 'V1_SALVAGE_DIGEST' });
  assert.deepEqual(await validate(envelope(), 'resident'), { ok: false, code: 'V1_SALVAGE_AUDIENCE' });
  assert.deepEqual(
    await API.fdEditionV1ValidateForSalvage('{', index(), context(), webcrypto.subtle),
    { ok: false, code: 'V1_SALVAGE_FORMAT' },
  );
  assert.deepEqual(
    await API.fdEditionV1ValidateForSalvage('x'.repeat(65537), index(), context(), webcrypto.subtle),
    { ok: false, code: 'V1_SALVAGE_SIZE' },
  );
});

test('direct objects, accessors, proxies, and revoked proxies reject without property access', async () => {
  let reads = 0;
  const accessor = Object.create(null, {
    toString: { get() { reads += 1; throw new Error('private'); } },
  });
  const proxy = new Proxy({}, {
    get() { reads += 1; throw new Error('private'); },
    ownKeys() { reads += 1; throw new Error('private'); },
  });
  const revocable = Proxy.revocable({}, {}); revocable.revoke();
  for (const value of [envelope(), accessor, proxy, revocable.proxy]) {
    assert.deepEqual(
      await API.fdEditionV1ValidateForSalvage(value, index(), context(), webcrypto.subtle),
      { ok: false, code: 'V1_SALVAGE_FORMAT' },
    );
  }
  assert.equal(reads, 0);
});

test('salvage returns a fresh draft and never mutates the trusted result or canonical index', async () => {
  const trusted = await validate();
  const canonicalBefore = structuredClone(index());
  const first = API.fdEditionV1Salvage(trusted, index(), context(), '2026-08-19');
  const second = API.fdEditionV1Salvage(trusted, index(), context(), '2026-08-19');
  assert.notEqual(first.draft, second.draft);
  first.draft.config.pathItems[0].priority = 'optional';
  assert.equal(second.draft.config.pathItems[0].priority, 'recommended');
  assert.deepEqual(index(), canonicalBefore);
  assert.deepEqual(trusted, { ok: true, code: 'V1_SALVAGE_OK' });
});
