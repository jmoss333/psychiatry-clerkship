import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const contract = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js', import.meta.url), 'utf8');
const projector = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js', import.meta.url), 'utf8');
const synthetic = JSON.parse(readFileSync(new URL('fixtures/rotation-editions/synthetic-core-index.json', import.meta.url), 'utf8'));
const revision = `sha256-${'B'.repeat(43)}`;

function load() {
  const resolver = `
  var fdEditionCatalogResolve=async function(config){
    var audience=config.audience==='ms3'?'MS3':'Resident';
    return {ok:true,resolved:{config:config,location:{locationCode:'EXU'},curator:{},phraseSet:{}},
      referenceSetDigest:'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      displayModel:{card:{fingerprint:'',audienceLabel:audience},pathItems:config.pathItems.map(function(item){var out=Object.assign({},item,{priorityLabel:item.priority==='required'?'Required':item.priority==='recommended'?'Recommended':'Optional'});delete out.reasonKey;if(item.reasonKey)out.reasonText='Resolved catalog reason';return out;}),
        revisions:{createdAgainstCoreRevision:config.createdAgainstCoreRevision,currentCoreRevision:config.createdAgainstCoreRevision,coreMatches:true,
          createdAgainstCatalogRevision:config.createdAgainstLocalCatalogRevision,currentCatalogRevision:config.createdAgainstLocalCatalogRevision,catalogMatches:true},
        changeSummary:config.changeSummary,firstDay:{arrival:null,accessItems:[],contacts:[],checklistItems:[]},typicalDay:null,
        workflow:{rounds:null,presentation:null,documentation:null},attendanceFeedback:{attendance:null,feedback:null},resources:[],emptyLocalPlan:true},errors:[]};
  };`;
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa',
    `${resolver}\n${contract}\n${projector}\nreturn {fdEditionValidateEnvelope,fdEditionTrustedSnapshot,fdProjectEdition,fdEditionIndexFingerprint,fdEditionCoreProgressRef};`,
  )(TextEncoder, TextDecoder, atob, btoa);
}

function validDocument(audience) {
  return JSON.parse(readFileSync(new URL(`fixtures/rotation-editions/valid-${audience === 'ms3' ? 'ms3' : 'resident'}.json`, import.meta.url), 'utf8'));
}

async function trusted(audience) {
  const F = load();
  const core = structuredClone(synthetic.audiences[audience]);
  const document = validDocument(audience);
  const result = await F.fdEditionValidateEnvelope(document, core, {}, {
    audience, coreRevision: core.coreRevision, localCatalogRevision: revision, rotationEditionV2: 'enabled',
  }, { mode: 'learner', generationDate: '' }, webcrypto.subtle);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return { F, core, document, result };
}

function assertFailure(result) {
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, 'index'), false);
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0);
}

for (const audience of ['ms3', 'resident']) {
  test(`projects only closure-trusted ${audience} placements and binds the resolved display model`, async () => {
    const { F, core, result } = await trusted(audience);
    const before = structuredClone(core);
    const protectedBefore = JSON.stringify({
      byRef: core.byRef, columns: core.columns, kit: core.kit,
      singleSafetyRule: core.singleSafetyRule, supervision: core.supervision,
      learnerHistory: core.learnerHistory,
    });
    const projected = F.fdProjectEdition(core, result);
    assert.equal(projected.ok, true, JSON.stringify(projected.errors));
    const week = audience === 'ms3' ? 0 : 3;
    assert.equal(projected.index.weeks[week].items.length, 1);
    assert.deepEqual(projected.index.weeks[week].items[0], {
      ...core.byRef['library/example'], instanceId: 'core:library/example:1',
      priority: audience === 'ms3' ? 'required' : 'recommended',
    });
    assert.deepEqual(projected.index.edition, result.displayModel);
    assert.equal(projected.index.edition.card.fingerprint, result.fingerprint);
    assert.equal(F.fdEditionIndexFingerprint(projected.index), result.fingerprint);
    assert.equal(F.fdEditionCoreProgressRef(projected.index.weeks[week].items[0]), 'library/example');
    assert.equal(JSON.stringify({
      byRef: projected.index.byRef, columns: projected.index.columns, kit: projected.index.kit,
      singleSafetyRule: projected.index.singleSafetyRule, supervision: projected.index.supervision,
      learnerHistory: projected.index.learnerHistory,
    }), protectedBefore);
    assert.deepEqual(core, before, 'projection never mutates the canonical index');
  });
}

test('rejects raw envelopes, copied validation results, and trust lookalikes atomically', async () => {
  const { F, core, document, result } = await trusted('ms3');
  for (const candidate of [
    document,
    structuredClone(result),
    { ...result },
    { ok: true, envelope: result.envelope, config: result.config, fingerprint: result.fingerprint, displayModel: result.displayModel, referenceSetDigest: result.referenceSetDigest, errors: [] },
  ]) assertFailure(F.fdProjectEdition(core, candidate));
});

test('projects the existing index shape without requiring duplicated audience metadata', async () => {
  const { F, core, result } = await trusted('ms3');
  delete core.audience;
  delete core.coreRevision;
  const projected = F.fdProjectEdition(core, result);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors));
  assert.equal(projected.index.path.id, 'ms3-six-week');
});

test('preserves protected core graphs byte-equivalently and fails closed on unsafe graphs', async () => {
  const { F, core, result } = await trusted('ms3');
  core.byRef['library/example'].clinicalMetadata = { review: { state: 'reviewed' }, tags: ['safety'], active: true };
  const before = JSON.stringify(core);
  const projected = F.fdProjectEdition(core, result);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors));
  assert.equal(JSON.stringify(core), before);
  assert.deepEqual(projected.index.weeks[0].items[0].clinicalMetadata, core.byRef['library/example'].clinicalMetadata);
  assert.notStrictEqual(projected.index.weeks[0].items[0].clinicalMetadata, core.byRef['library/example'].clinicalMetadata);

  let reads = 0;
  const hostile = structuredClone(core);
  Object.defineProperty(hostile.byRef['library/example'], 'secret', { enumerable: true, get() { reads += 1; return 'must not run'; } });
  assertFailure(F.fdProjectEdition(hostile, result));
  assert.equal(reads, 0);
});

test('resolved reasons decorate placements without replacing canonical titles or governance', async () => {
  const F = load();
  const core = structuredClone(synthetic.audiences.ms3);
  const document = validDocument('ms3');
  document.config.pathItems[0].reasonKey = 'choice.reason@v1';
  document.digest = await (async () => {
    const pre = { format: document.format, schemaVersion: document.schemaVersion, config: document.config };
    const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
    const bytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(pre)));
    return `sha256-${Buffer.from(bytes).toString('base64url')}`;
  })();
  const validation = await F.fdEditionValidateEnvelope(document, core, {}, {
    audience: 'ms3', coreRevision: core.coreRevision, localCatalogRevision: revision, rotationEditionV2: 'enabled',
  }, { mode: 'learner', generationDate: '' }, webcrypto.subtle);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const projected = F.fdProjectEdition(core, validation);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors));
  assert.equal(projected.index.weeks[0].items[0].reasonText, 'Resolved catalog reason');
  assert.equal(projected.index.weeks[0].items[0].title, 'Synthetic core example');
  assert.deepEqual(projected.index.weeks[0].items[0].governance, ['clinical', 'reviewed']);
});
