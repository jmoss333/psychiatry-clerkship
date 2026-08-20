import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('..', import.meta.url);
const CONTRACT = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js', import.meta.url), 'utf8');
const CATALOG = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_catalog.js', import.meta.url), 'utf8');
const SYNTHETIC = JSON.parse(readFileSync(new URL('fixtures/rotation-editions/synthetic-core-index.json', import.meta.url), 'utf8'));
const VALID = JSON.parse(readFileSync(new URL('fixtures/rotation-editions/valid-ms3.json', import.meta.url), 'utf8'));
const REVISION = `sha256-${'B'.repeat(43)}`;
const API = [
  'FD_EDITION_RULES', 'fdEditionValidateConfig', 'fdEditionCreateEnvelope', 'fdEditionValidateEnvelope',
  'fdEditionDecodePayload', 'fdEditionSemanticConfig', 'fdEditionGenerateChangeSummary',
  'fdEditionStorageKeys', 'fdEditionTrustedSnapshot', 'fdEditionCanonicalJson', 'fdEditionFingerprint',
  'fdEditionBase64urlEncode', 'fdEditionCatalogSnapshot',
];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function digest(value) {
  const bytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return `sha256-${Buffer.from(bytes).toString('base64url')}`;
}

async function catalogProjection(audience, catalogRevision = REVISION) {
  const records = await Promise.all(SYNTHETIC.catalogRecords.map(async (record) => ({ ...structuredClone(record), contentDigest: await digest(record) })));
  records.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  const projection = {
    schemaVersion: 1, audience, revision: catalogRevision, projectionDigest: '', rotationEditionV2: 'enabled',
    selectionKeys: records.map((record) => record.key), resolutionRecords: records, blockedKeys: [],
  };
  const bare = structuredClone(projection); delete bare.projectionDigest;
  projection.projectionDigest = await digest(bare);
  return projection;
}

function load(catalogRevision = REVISION) {
  const source = `${CATALOG.replace('__FD_CATALOG_EXPECTED_REVISION__', catalogRevision)}\n${CONTRACT}`;
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa', `${source}\nreturn {${API.join(',')}};`)(TextEncoder, TextDecoder, atob, btoa);
}

async function context(audience = 'ms3', overrides = {}) {
  const catalogRevision = overrides.catalogRevision ?? REVISION;
  const F = load(catalogRevision);
  const prepared = await F.fdEditionCatalogSnapshot(await catalogProjection(audience, catalogRevision), audience, webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  const coreIndex = structuredClone(SYNTHETIC.audiences[audience]);
  const siteContext = {
    audience, coreRevision: overrides.coreRevision ?? coreIndex.coreRevision, localCatalogRevision: catalogRevision, rotationEditionV2: 'enabled',
  };
  return { F, catalogSnapshot: prepared.snapshot, coreIndex, siteContext };
}

function validationContext(mode = 'learner') {
  return { mode, generationDate: mode === 'builder' ? '2026-08-19' : '' };
}

function validFor(audience) {
  const document = JSON.parse(readFileSync(new URL(`fixtures/rotation-editions/valid-${audience === 'ms3' ? 'ms3' : 'resident'}.json`, import.meta.url), 'utf8'));
  return document;
}

test('exports the v2-only async contract and fresh audience-specific storage keys', async () => {
  const { F } = await context();
  assert.equal(F.FD_EDITION_RULES.schemaVersion, 2);
  assert.deepEqual(F.fdEditionStorageKeys('ms3'), {
    edition: 'cw_rotation_edition_ms3_v2', local: 'cw_rotation_local_progress_ms3_v2', curator: 'cw_curator_draft_ms3_v2',
  });
  assert.deepEqual(F.fdEditionStorageKeys('resident'), {
    edition: 'rp_rotation_edition_resident_v2', local: 'rp_rotation_local_progress_resident_v2', curator: 'rp_curator_draft_resident_v2',
  });
  assert.equal(F.fdEditionStorageKeys('faculty'), null);
  const first = F.fdEditionStorageKeys('ms3');
  first.edition = 'tampered';
  assert.equal(F.fdEditionStorageKeys('ms3').edition, 'cw_rotation_edition_ms3_v2');
});

for (const audience of ['ms3', 'resident']) {
  test(`validates and closure-brands a catalog-resolved ${audience} v2 envelope`, async () => {
    const { F, catalogSnapshot, coreIndex, siteContext } = await context(audience);
    const document = validFor(audience);
    const result = await F.fdEditionValidateEnvelope(
      document, coreIndex, catalogSnapshot, siteContext, validationContext(), webcrypto.subtle,
    );
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.envelope.schemaVersion, 2);
    assert.equal(result.referenceSetDigest.startsWith('sha256-'), true);
    assert.match(result.fingerprint, /^EXU-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/);
    assert.equal(result.displayModel.card.fingerprint, result.fingerprint);
    assert.equal(result.displayModel.pathItems[0].title, coreIndex.byRef['library/example'].title);
    assert.equal(result.displayModel.revisions.coreMatches, true);
    assert.equal(result.displayModel.revisions.catalogMatches, true);

    const snapshot = F.fdEditionTrustedSnapshot(result);
    assert.ok(snapshot);
    assert.equal(snapshot.envelope.digest, document.digest);
    assert.equal(snapshot.referenceSetDigest, result.referenceSetDigest);
    assert.equal(snapshot.displayModel.card.fingerprint, result.fingerprint);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.displayModel.card), true);
    assert.notStrictEqual(F.fdEditionTrustedSnapshot(result), snapshot, 'each accessor call returns a fresh snapshot');
    assert.equal(F.fdEditionTrustedSnapshot({ ...result }), null);
    assert.equal(F.fdEditionTrustedSnapshot(structuredClone(result)), null);
    assert.equal(F.fdEditionTrustedSnapshot(document), null);
  });
}

test('creates and decodes the exact compact v2 envelope through the same catalog snapshot', async () => {
  const { F, catalogSnapshot, coreIndex, siteContext } = await context();
  const created = await F.fdEditionCreateEnvelope(
    structuredClone(VALID.config), coreIndex, catalogSnapshot, siteContext, validationContext('builder'), webcrypto.subtle,
  );
  assert.equal(created.ok, true, JSON.stringify(created.errors));
  assert.deepEqual(created.envelope, VALID);
  assert.equal(created.contentDigest, VALID.digest);
  const decoded = await F.fdEditionDecodePayload(
    created.payload, coreIndex, catalogSnapshot, siteContext, validationContext(), webcrypto.subtle,
    `https://example.edu/#edition=${created.payload}`.length,
  );
  assert.equal(decoded.ok, true, JSON.stringify(decoded.errors));
  assert.deepEqual(decoded.envelope, VALID);
  assert.equal(decoded.fingerprint, created.fingerprint);
  assert.ok(F.fdEditionTrustedSnapshot(decoded));
});

test('builder date policy is injected while learner validation is clock-independent', async () => {
  const { F, catalogSnapshot, coreIndex, siteContext } = await context();
  const candidate = structuredClone(VALID.config);
  candidate.context.editionCheckedOn = '2026-08-20';
  const builder = await F.fdEditionValidateConfig(candidate, coreIndex, catalogSnapshot, siteContext, validationContext('builder'), webcrypto.subtle);
  const learner = await F.fdEditionValidateConfig(candidate, coreIndex, catalogSnapshot, siteContext, validationContext(), webcrypto.subtle);
  assert.equal(builder.ok, false);
  assert.equal(learner.ok, true, JSON.stringify(learner.errors));
});

test('validates the existing current-audience index shape via the explicit site context', async () => {
  const { F, catalogSnapshot, coreIndex, siteContext } = await context();
  delete coreIndex.audience;
  delete coreIndex.coreRevision;
  const result = await F.fdEditionValidateEnvelope(
    structuredClone(VALID), coreIndex, catalogSnapshot, siteContext,
    validationContext(), webcrypto.subtle,
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('semantic identity excludes exactly edition number, summary, and both created-against revisions', async () => {
  const { F } = await context();
  const base = structuredClone(VALID.config);
  const coreDrift = structuredClone(base);
  coreDrift.createdAgainstCoreRevision = 'a'.repeat(40);
  const catalogDrift = structuredClone(base);
  catalogDrift.createdAgainstLocalCatalogRevision = `sha256-${'C'.repeat(43)}`;
  const combined = structuredClone(coreDrift);
  combined.createdAgainstLocalCatalogRevision = `sha256-${'C'.repeat(43)}`;
  combined.editionNumber = 44;
  combined.changeSummary = { kindCodes: ['resources'], changedItemCount: 9 };
  const exact = F.fdEditionSemanticConfig(base);
  assert.equal(F.fdEditionSemanticConfig(coreDrift), exact, 'core-only revision drift preserves identity');
  assert.equal(F.fdEditionSemanticConfig(catalogDrift), exact, 'catalog-only revision drift preserves identity');
  assert.equal(F.fdEditionSemanticConfig(combined), exact, 'combined revision-only drift preserves identity');

  const edited = structuredClone(combined);
  edited.context.editionCheckedOn = '2026-08-18';
  assert.notEqual(F.fdEditionSemanticConfig(edited), exact);
  const summary = F.fdEditionGenerateChangeSummary(base, edited);
  assert.deepEqual(summary, { kindCodes: ['edition-context'], changedItemCount: 1 });
  edited.editionNumber = base.editionNumber + 1;
  edited.createdAgainstCoreRevision = 'a'.repeat(40);
  edited.createdAgainstLocalCatalogRevision = `sha256-${'C'.repeat(43)}`;
  assert.equal(edited.editionNumber, 2, 'the first genuine edit increments exactly once');
  assert.equal(edited.createdAgainstCoreRevision, 'a'.repeat(40));
  assert.equal(edited.createdAgainstLocalCatalogRevision, `sha256-${'C'.repeat(43)}`);
});

test('core-only, catalog-only, and combined revision drift preserve exact identity until one genuine edit', async () => {
  const baselineContext = await context();
  const baseline = await baselineContext.F.fdEditionValidateEnvelope(
    structuredClone(VALID), baselineContext.coreIndex, baselineContext.catalogSnapshot,
    baselineContext.siteContext, validationContext(), webcrypto.subtle,
  );
  assert.equal(baseline.ok, true, JSON.stringify(baseline.errors));
  const driftCases = [
    ['core only', { coreRevision: 'a'.repeat(40) }, false, true],
    ['catalog only', { catalogRevision: `sha256-${'C'.repeat(43)}` }, true, false],
    ['combined', { coreRevision: 'a'.repeat(40), catalogRevision: `sha256-${'C'.repeat(43)}` }, false, false],
  ];
  for (const [label, overrides, coreMatches, catalogMatches] of driftCases) {
    const drift = await context('ms3', overrides);
    const result = await drift.F.fdEditionValidateEnvelope(
      structuredClone(VALID), drift.coreIndex, drift.catalogSnapshot, drift.siteContext,
      validationContext(), webcrypto.subtle,
    );
    assert.equal(result.ok, true, `${label}: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(result.envelope, VALID, label);
    assert.equal(result.config.editionNumber, 1, label);
    assert.equal(result.config.createdAgainstCoreRevision, VALID.config.createdAgainstCoreRevision, label);
    assert.equal(result.config.createdAgainstLocalCatalogRevision, VALID.config.createdAgainstLocalCatalogRevision, label);
    assert.deepEqual(result.config.changeSummary, VALID.config.changeSummary, label);
    assert.equal(result.fingerprint, baseline.fingerprint, label);
    assert.equal(result.displayModel.revisions.coreMatches, coreMatches, label);
    assert.equal(result.displayModel.revisions.catalogMatches, catalogMatches, label);
    assert.equal(result.displayModel.revisions.currentCoreRevision, drift.siteContext.coreRevision, label);
    assert.equal(result.displayModel.revisions.currentCatalogRevision, drift.siteContext.localCatalogRevision, label);
  }

  const drift = await context('ms3', { coreRevision: 'a'.repeat(40), catalogRevision: `sha256-${'C'.repeat(43)}` });
  const edited = structuredClone(VALID.config);
  edited.context.editionCheckedOn = '2026-08-18';
  edited.editionNumber = 2;
  edited.changeSummary = drift.F.fdEditionGenerateChangeSummary(VALID.config, edited);
  edited.createdAgainstCoreRevision = drift.siteContext.coreRevision;
  edited.createdAgainstLocalCatalogRevision = drift.siteContext.localCatalogRevision;
  const changed = await drift.F.fdEditionCreateEnvelope(
    edited, drift.coreIndex, drift.catalogSnapshot, drift.siteContext,
    validationContext('builder'), webcrypto.subtle,
  );
  assert.equal(changed.ok, true, JSON.stringify(changed.errors));
  assert.equal(changed.config.editionNumber, 2);
  assert.deepEqual(changed.config.changeSummary, { kindCodes: ['edition-context'], changedItemCount: 1 });
  assert.equal(changed.config.createdAgainstCoreRevision, 'a'.repeat(40));
  assert.equal(changed.config.createdAgainstLocalCatalogRevision, `sha256-${'C'.repeat(43)}`);
  assert.notEqual(changed.fingerprint, baseline.fingerprint);
});

test('generates ordered code-owned change summaries and counts changed high-level units once', async () => {
  const { F } = await context();
  const base = structuredClone(VALID.config);
  const current = structuredClone(base);
  current.context.rotationStart = '2026-09-02';
  current.pathItems[0].priority = 'optional';
  current.pathItems[0].week = 2;
  current.localPlan.arrival = { timingCode: 'by', time: '08:00', placeKey: 'place.example@v1', checkInRoleKey: 'choice.role@v1' };
  current.localPlan.accessItems = [{ instanceId: 'local:access:1', itemKey: 'choice.access-item@v1', dueKey: 'choice.due-point@v1' }];
  assert.deepEqual(F.fdEditionGenerateChangeSummary(null, current), { kindCodes: ['initial'], changedItemCount: 0 });
  assert.deepEqual(F.fdEditionGenerateChangeSummary(base, current), {
    kindCodes: ['edition-context', 'curriculum-priority', 'schedule', 'arrival', 'access'], changedItemCount: 4,
  });
});

test('pins the 30-bit Crockford fingerprint vector independently of envelope base64', async () => {
  const { F } = await context();
  const fingerprint = await F.fdEditionFingerprint(
    'EXU', 'ms3',
    'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    webcrypto.subtle,
  );
  assert.equal(fingerprint, 'EXU-MS3-ZBVX4D');
  assert.equal(
    createHash('sha256').update('{"contentDigest":"sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","referenceSetDigest":"sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}').digest('hex'),
    'faf7d2342ab986807811b00b5285958e36aa8f99d97b9c0692c0d0c8ee5037f0',
  );
});
