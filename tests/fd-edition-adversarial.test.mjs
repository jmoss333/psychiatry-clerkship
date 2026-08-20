import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const contract = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_catalog.js', import.meta.url), 'utf8');
const projector = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js', import.meta.url), 'utf8');
const valid = JSON.parse(readFileSync(new URL('fixtures/rotation-editions/valid-ms3.json', import.meta.url), 'utf8'));
const synthetic = JSON.parse(readFileSync(new URL('fixtures/rotation-editions/synthetic-core-index.json', import.meta.url), 'utf8'));
const revision = `sha256-${'B'.repeat(43)}`;

function loadRealCatalog() {
  const source = `${catalog.replace('__FD_CATALOG_EXPECTED_REVISION__', revision)}\n${contract}\n${projector}`;
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa', `${source}\nreturn {fdEditionValidateConfig,fdEditionValidateEnvelope,fdEditionDecodePayload,fdEditionTrustedSnapshot,fdProjectEdition};`)(TextEncoder, TextDecoder, atob, btoa);
}

function loadStub() {
  const resolver = `
  var __resolverCalls=0;
  var fdEditionCatalogResolve=async function(config){__resolverCalls+=1;return {ok:true,resolved:{config:config,location:{locationCode:'EXU'},curator:{},phraseSet:{}},referenceSetDigest:'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',displayModel:{card:{fingerprint:''},pathItems:config.pathItems.map(function(item){var out=Object.assign({},item,{priorityLabel:'Required'});delete out.reasonKey;if(item.reasonKey)out.reasonText='Resolved reason';return out;}),revisions:{},changeSummary:config.changeSummary},errors:[]};};`;
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa', `${resolver}\n${contract}\n${projector}\nreturn {fdEditionValidateConfig,fdEditionValidateEnvelope,fdEditionDecodePayload,fdEditionTrustedSnapshot,fdProjectEdition,calls:function(){return __resolverCalls;}};`)(TextEncoder, TextDecoder, atob, btoa);
}

function args(F, config, subtle = webcrypto.subtle) {
  const core = structuredClone(synthetic.audiences.ms3);
  const site = { audience: 'ms3', coreRevision: core.coreRevision, localCatalogRevision: revision, rotationEditionV2: 'enabled' };
  return F.fdEditionValidateConfig(config, core, {}, site, { mode: 'learner', generationDate: '' }, subtle);
}

test('requires the actual Task 2 closure-branded catalog snapshot', async () => {
  const F = loadRealCatalog();
  const result = await args(F, structuredClone(valid.config));
  assert.equal(result.ok, false);
  assert.equal(result.resolved ?? null, null);
  assert.equal(F.fdEditionTrustedSnapshot(result), null);
});

test('rejects accessors, symbols, exotic prototypes, sparse arrays, cycles, and revoked proxies before resolver use', async () => {
  const makers = [
    ['accessor', () => { let reads = 0; const value = structuredClone(valid.config); Object.defineProperty(value.context, 'rotationStart', { enumerable: true, get() { reads += 1; return '2026-09-01'; } }); return [value, () => assert.equal(reads, 0)]; }],
    ['symbol', () => { const value = structuredClone(valid.config); value[Symbol('hidden')] = 'secret'; return [value]; }],
    ['custom prototype', () => { const value = structuredClone(valid.config); Object.setPrototypeOf(value.context, { inherited: true }); return [value]; }],
    ['sparse array', () => { const value = structuredClone(valid.config); value.pathItems.length = 2; return [value]; }],
    ['cycle', () => { const value = structuredClone(valid.config); value.localPlan.self = value.localPlan; return [value]; }],
    ['revoked proxy', () => { const revoked = Proxy.revocable({}, {}); revoked.revoke(); return [revoked.proxy]; }],
  ];
  for (const [label, make] of makers) {
    const F = loadStub();
    const [candidate, after = () => {}] = make();
    const result = await args(F, candidate);
    assert.equal(result.ok, false, label);
    assert.equal(F.calls(), 0, label);
    after();
  }
});

test('never accepts arbitrary public prose or URL fields hidden at nested boundaries', async () => {
  for (const [path, field] of [
    [['context'], 'name'], [['pathItems', 0], 'rationale'], [['localPlan'], 'orientationDetails'],
    [['changeSummary'], 'text'],
  ]) {
    const F = loadStub();
    const candidate = structuredClone(valid.config);
    let target = candidate;
    for (const part of path) target = target[part];
    target[field] = 'private legacy content';
    const result = await args(F, candidate);
    assert.equal(result.ok, false, `${path.join('/')}/${field}`);
    assert.equal(JSON.stringify(result.errors).includes('private legacy content'), false);
    assert.equal(F.calls(), 0);
  }
});

test('fails closed for hostile digest providers without issuing partial trust', async () => {
  const providers = [
    null,
    {},
    { digest() { throw new Error('synthetic secret'); } },
    { digest() { return Promise.reject(new Error('synthetic secret')); } },
    { digest() { return Promise.resolve({ byteLength: 32 }); } },
    { digest() { return Promise.resolve(new ArrayBuffer(31)); } },
  ];
  for (const subtle of providers) {
    const F = loadStub();
    const core = structuredClone(synthetic.audiences.ms3);
    const site = { audience: 'ms3', coreRevision: core.coreRevision, localCatalogRevision: revision, rotationEditionV2: 'enabled' };
    const result = await F.fdEditionValidateEnvelope(structuredClone(valid), core, {}, site, { mode: 'learner', generationDate: '' }, subtle);
    assert.equal(result.ok, false);
    assert.equal(F.fdEditionTrustedSnapshot(result), null);
    assert.equal(JSON.stringify(result.errors).includes('synthetic secret'), false);
  }
});

test('payload and projector boundaries reject oversize input and copied trust lookalikes atomically', async () => {
  const F = loadStub();
  const core = structuredClone(synthetic.audiences.ms3);
  const site = { audience: 'ms3', coreRevision: core.coreRevision, localCatalogRevision: revision, rotationEditionV2: 'enabled' };
  const decoded = await F.fdEditionDecodePayload('A'.repeat(16001), core, {}, site, { mode: 'learner', generationDate: '' }, webcrypto.subtle, 16001);
  assert.equal(decoded.ok, false);
  const fake = { ok: true, envelope: valid, config: valid.config, fingerprint: 'EXU-MS3-ZBVX4D', referenceSetDigest: revision, displayModel: { card: { fingerprint: 'EXU-MS3-ZBVX4D' } }, errors: [] };
  const projected = F.fdProjectEdition(core, fake);
  assert.equal(projected.ok, false);
  assert.equal(Object.hasOwn(projected, 'index'), false);
});
