import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';

const SOURCE = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_catalog.js', import.meta.url);
const API = ['fdEditionCatalogSnapshot', 'fdEditionCatalogRecord', 'fdEditionCatalogResolve', 'fdEditionPublicationEnabled'];

function load() {
  const source = readFileSync(SOURCE, 'utf8').replace('__FD_CATALOG_EXPECTED_REVISION__', 'sha256-l57lmbbvaA0koAmWc_ik3g_V-RTLPJMDJaxSgRs0sAg');
  return new Function('TextEncoder', 'btoa', `${source}\nreturn {${API.join(',')}};`)(TextEncoder, btoa);
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const result = await webcrypto.subtle.digest('SHA-256', bytes);
  return `sha256-${Buffer.from(result).toString('base64url')}`;
}
async function record(value) { return { ...value, contentDigest: await digest(value) }; }

const templates = Object.fromEntries([
  ['arrival',['timing','time','place','role']], ['scheduleWindow',['dayStart','dayEnd','endQualifier']],
  ['scheduleRangeWithPlace',['daySet','startTime','endTime','activity','place','priority']], ['scheduleRangeWithoutPlace',['daySet','startTime','endTime','activity','priority']],
  ['schedulePointWithPlace',['daySet','startTime','activity','place','priority']], ['schedulePointWithoutPlace',['daySet','startTime','activity','priority']],
  ['rounds',['preparation','participation','followUp']], ['presentation',['format','timing','elements']], ['documentation',['workflow','timing']],
  ['attendance',['events','absenceRole']], ['feedback',['cadence','initiator','setting']], ['access',['item','due']], ['contact',['role']], ['checklist',['item','priority']],
  ['resourceWithReason',['title','priority','week','reason','hostname']], ['resourceWithoutReason',['title','priority','week','hostname']], ['changeSummary',['kinds','count']]
].map(([name, tokens]) => [name, { tokens, text: tokens.map((token) => `{${token}}`).join(' ') }]));

async function projection(audience = 'ms3') {
  const common = { audiences: [audience], verifiedOn: '2026-08-19' };
  const locationKey = 'location.example@v1';
  const records = await Promise.all([
    record({ key: locationKey, kind: 'trainingLocation', displayName: 'Example Unit', locationCode: 'EXU', locationTypeCode: 'inpatient', officialHostnames: ['example.edu'], ...common }),
    record({ key: 'choice.role@v1', kind: 'choice', choiceKind: 'role', label: 'Coordinator', fragment: 'the coordinator', locationKeys: [locationKey], ...common }),
    record({ key: 'choice.reason@v1', kind: 'choice', choiceKind: 'reason', label: 'Preparation', fragment: 'prepare for the service', locationKeys: [locationKey], ...common }),
    record({ key: 'profile.example@v1', kind: 'curatorProfile', displayName: 'Example Curator', roleKey: 'choice.role@v1', locationKeys: [locationKey], ...common }),
    record({ key: 'phrases.example@v1', kind: 'phraseSet', displayName: 'Example phrases', templates, ...common }),
    record({ key: 'choice.deprecated@v1', kind: 'choice', choiceKind: 'role', label: 'Prior', fragment: 'the prior coordinator', locationKeys: [locationKey], ...common }),
  ]);
  const value = { schemaVersion: 1, audience, revision: '', projectionDigest: '', rotationEditionV2: 'enabled',
    selectionKeys: records.filter((item) => item.key !== 'choice.deprecated@v1').map((item) => item.key).sort(),
    resolutionRecords: records.slice().sort((a, b) => a.key.localeCompare(b.key)), blockedKeys: ['choice.blocked@v1'] };
  value.revision = await digest({ catalog: 'synthetic', audience });
  value.projectionDigest = await digest(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'projectionDigest')));
  return value;
}

function config(audience = 'ms3') {
  return { audience, pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week', editionNumber: 1,
    createdAgainstCoreRevision: '1234567890abcdef1234567890abcdef12345678', createdAgainstLocalCatalogRevision: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    context: { trainingLocationKey: 'location.example@v1', curatorProfileKey: 'profile.example@v1', rotationStart: '2026-09-01', rotationEnd: '2026-10-12', editionCheckedOn: '2026-08-19' },
    phraseSetKey: 'phrases.example@v1', pathItems: [{ instanceId: 'core:example:1', ref: 'library/example', week: 1, order: 1, priority: 'required', reasonKey: 'choice.reason@v1' }],
    localPlan: {}, changeSummary: { kindCodes: ['initial'], changedItemCount: 0 } };
}

test('prepares a branded immutable snapshot and applies lifecycle rules without exposing record references', async () => {
  const F = load(); const input = await projection(); const before = structuredClone(input);
  const prepared = await F.fdEditionCatalogSnapshot(input, 'ms3', webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  assert.deepEqual(input, before); assert.equal(Object.isFrozen(input), false); assert.equal(Object.isFrozen(prepared.snapshot), true);
  const reviewed = F.fdEditionCatalogRecord(prepared.snapshot, 'choice.role@v1', 'builder', 'choice', 'location.example@v1');
  assert.equal(reviewed.ok, true); assert.equal(Object.isFrozen(reviewed.record), true); assert.notStrictEqual(reviewed.record, prepared.snapshot.resolutionRecords[0]);
  assert.equal(F.fdEditionCatalogRecord(prepared.snapshot, 'choice.deprecated@v1', 'builder', 'choice', 'location.example@v1').error, 'CATALOG_RESELECTION_REQUIRED');
  assert.equal(F.fdEditionCatalogRecord(prepared.snapshot, 'choice.deprecated@v1', 'learner', 'choice', 'location.example@v1').ok, true);
  assert.equal(F.fdEditionCatalogRecord(prepared.snapshot, 'choice.blocked@v1', 'learner', 'choice', 'location.example@v1').error, 'CATALOG_BLOCKED');
  assert.equal(F.fdEditionPublicationEnabled(prepared.snapshot), true);
  assert.equal(F.fdEditionCatalogRecord(structuredClone(prepared.snapshot), 'choice.role@v1', 'learner', 'choice', 'location.example@v1').ok, false);
});

test('rejects hostile projections without executing accessors or echoing attacker values', async () => {
  const F = load(); const hostile = await projection(); let reads = 0;
  Object.defineProperty(hostile, 'revision', { enumerable: true, get() { reads += 1; return 'private-value'; } });
  const result = await F.fdEditionCatalogSnapshot(hostile, 'ms3', webcrypto.subtle);
  assert.equal(result.ok, false); assert.equal(reads, 0);
  assert.equal(JSON.stringify(result.errors).includes('private-value'), false);
  assert.equal(F.fdEditionCatalogRecord(result.snapshot, 'choice.role@v1', 'learner', 'choice', 'location.example@v1').ok, false);
});

test('resolves the closed v2 model with fixed labels and revision comparisons', async () => {
  const F = load(); const prepared = await F.fdEditionCatalogSnapshot(await projection(), 'ms3', webcrypto.subtle);
  const result = await F.fdEditionCatalogResolve(config(), prepared.snapshot, 'learner', {
    audience: 'ms3', localCatalogRevision: prepared.snapshot.revision, rotationEditionV2: 'enabled', coreRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  }, webcrypto.subtle);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.displayModel.card.audienceLabel, 'MS3'); assert.equal(result.displayModel.card.durationLabel, '6 weeks');
  assert.equal(result.displayModel.card.fingerprint, ''); assert.equal(result.displayModel.pathItems[0].reasonText, 'prepare for the service');
  assert.equal(result.displayModel.changeSummary.text, 'Initial edition 0');
  assert.equal(result.displayModel.revisions.coreMatches, false); assert.equal(result.displayModel.revisions.catalogMatches, false);
  assert.match(result.referenceSetDigest, /^sha256-[A-Za-z0-9_-]{43}$/);
});

test('rejects extra or impossible v2 config fields while preserving an optional path reason', async () => {
  const F = load(); const prepared = await F.fdEditionCatalogSnapshot(await projection(), 'ms3', webcrypto.subtle);
  const context = { audience: 'ms3', localCatalogRevision: prepared.snapshot.revision, rotationEditionV2: 'enabled', coreRevision: '1234567890abcdef1234567890abcdef12345678' };
  const optionalReason = config(); delete optionalReason.pathItems[0].reasonKey;
  const valid = await F.fdEditionCatalogResolve(optionalReason, prepared.snapshot, 'learner', context, webcrypto.subtle);
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
  assert.equal(Object.hasOwn(valid.displayModel.pathItems[0], 'reasonText'), false);
  for (const mutate of [
    (value) => { value.privateValue = 'do-not-echo'; },
    (value) => { value.context.rotationStart = '2026-02-30'; },
    (value) => { value.pathItems[0].week = 99; },
    (value) => { value.changeSummary.kindCodes = ['unreviewed-value']; },
    (value) => { value.localPlan = { unknown: 'do-not-echo' }; },
  ]) {
    const invalid = config(); mutate(invalid);
    const result = await F.fdEditionCatalogResolve(invalid, prepared.snapshot, 'learner', context, webcrypto.subtle);
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result.errors).includes('do-not-echo'), false);
  }
});

test('rejects malformed Web Crypto digest results without partially trusting a projection', async () => {
  const F = load();
  for (const subtle of [null, { digest() { return Promise.resolve({ byteLength: 32 }); } }, { digest() { return Promise.resolve(new Uint8Array(32)); } }, { digest() { return Promise.resolve(new ArrayBuffer(31)); } }]) {
    const result = await F.fdEditionCatalogSnapshot(await projection(), 'ms3', subtle);
    assert.equal(result.ok, false);
    assert.equal(F.fdEditionPublicationEnabled(result.snapshot), false);
  }
});
