import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';

const body = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js', import.meta.url), 'utf8');
const schema = JSON.parse(readFileSync(new URL('../rotation_edition.schema.json', import.meta.url), 'utf8'));
const catalogSchema = JSON.parse(readFileSync(new URL('../13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.schema.json', import.meta.url), 'utf8'));
const valid = JSON.parse(readFileSync(new URL('fixtures/rotation-editions/valid-ms3.json', import.meta.url), 'utf8'));
const synthetic = JSON.parse(readFileSync(new URL('fixtures/rotation-editions/synthetic-core-index.json', import.meta.url), 'utf8'));

const resolver = `
var fdEditionCatalogResolve=async function(config){
  return {ok:true,resolved:{config:config,location:{locationCode:'EXU'},curator:{},phraseSet:{}},
    referenceSetDigest:'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    displayModel:{card:{fingerprint:''},pathItems:config.pathItems.map(function(item){var out=Object.assign({},item,{priorityLabel:'Required'});delete out.reasonKey;if(item.reasonKey)out.reasonText='Resolved reason';return out;}),
      revisions:{},changeSummary:config.changeSummary},errors:[]};
};`;
const F = new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa',
  `${resolver}\n${body}\nreturn {validate:typeof fdEditionValidateConfig==='function'?fdEditionValidateConfig:null};`,
)(TextEncoder, TextDecoder, atob, btoa);

const python = String.raw`
import json,sys
from jsonschema import Draft7Validator
data=json.load(sys.stdin)
Draft7Validator.check_schema(data['schema'])
sys.exit(0 if not list(Draft7Validator(data['schema']).iter_errors(data['document'])) else 1)
`;

function schemaAccepts(document) {
  const run = spawnSync('python3', ['-c', python], { input: JSON.stringify({ schema, document }), encoding: 'utf8' });
  assert.ok(run.status === 0 || run.status === 1, run.stderr);
  return run.status === 0;
}

async function browserAccepts(config) {
  if (!F.validate) return false;
  const result = await F.validate(
    config, synthetic.audiences.ms3, {},
    { audience: 'ms3', coreRevision: valid.config.createdAgainstCoreRevision, localCatalogRevision: valid.config.createdAgainstLocalCatalogRevision, rotationEditionV2: 'enabled' },
    { mode: 'learner', generationDate: '' }, webcrypto.subtle,
  );
  return result.ok === true;
}

function documentWith(config) {
  return { format: 'cw-rotation-edition', schemaVersion: 2, config, digest: `sha256-${'A'.repeat(43)}` };
}

test('public localPlanV2 is canonically byte-equal to the catalog preset definition', () => {
  assert.equal(JSON.stringify(schema.definitions.localPlanV2), JSON.stringify(catalogSchema.definitions.localPlanV2));
});

test('Draft-7 and the browser contract agree on the closed v2 public shape matrix', async () => {
  const cases = [
    ['minimal v2', () => {}, true],
    ['v1 version', (value) => { value.schemaVersion = 1; }, false],
    ['extra config prose', (value) => { value.config.title = 'legacy'; }, false],
    ['extra path rationale', (value) => { value.config.pathItems[0].rationale = 'legacy'; }, false],
    ['empty path', (value) => { value.config.pathItems = []; }, false],
    ['97 path items', (value) => { value.config.pathItems = Array.from({ length: 97 }, (_, index) => ({ ...value.config.pathItems[0], instanceId: `core:x:${index}`, order: index + 1 })); }, false],
    ['bad audience path pair', (value) => { value.config.pathId = 'resident-four-week'; }, false],
    ['edition zero', (value) => { value.config.editionNumber = 0; }, false],
    ['edition max', (value) => { value.config.editionNumber = 2147483647; value.config.changeSummary = { kindCodes: ['resources'], changedItemCount: 1 }; }, true],
    ['edition above max', (value) => { value.config.editionNumber = 2147483648; value.config.changeSummary = { kindCodes: ['resources'], changedItemCount: 1 }; }, false],
    ['bad priority', (value) => { value.config.pathItems[0].priority = 'urgent'; }, false],
    ['reason key accepted', (value) => { value.config.pathItems[0].reasonKey = 'choice.reason@v1'; }, true],
    ['raw reason prose rejected', (value) => { value.config.pathItems[0].reason = 'legacy'; }, false],
    ['empty repeatable rejected', (value) => { value.config.localPlan.contacts = []; }, false],
    ['contacts cap accepted', (value) => { value.config.localPlan.contacts = Array.from({ length: 8 }, (_, index) => ({ instanceId: `local:contact:${index + 1}`, roleKey: 'choice.role@v1' })); }, true],
    ['contacts over cap', (value) => { value.config.localPlan.contacts = Array.from({ length: 9 }, (_, index) => ({ instanceId: `local:contact:${index + 1}`, roleKey: 'choice.role@v1' })); }, false],
    ['arrival exact variant', (value) => { value.config.localPlan.arrival = { timingCode: 'by', time: '08:00', placeKey: 'place.example@v1', checkInRoleKey: 'choice.role@v1' }; }, true],
    ['arrival raw text rejected', (value) => { value.config.localPlan.arrival = { timingCode: 'by', time: '08:00', placeKey: 'place.example@v1', checkInRoleKey: 'choice.role@v1', text: 'legacy' }; }, false],
    ['schedule empty events', (value) => { value.config.localPlan.schedule = { dayStart: '08:00', dayEnd: '17:00', endQualifierCode: 'about', events: [] }; }, false],
    ['presentation duplicate elements', (value) => { value.config.localPlan.presentation = { formatKey: 'choice.format@v1', timingKey: 'choice.timing@v1', elementKeys: ['choice.element@v1', 'choice.element@v1'] }; }, false],
    ['unknown local category', (value) => { value.config.localPlan.orientationDetails = {}; }, false],
    ['summary authored text rejected', (value) => { value.config.changeSummary.text = 'legacy'; }, false],
  ];

  for (const [label, mutate, expected] of cases) {
    const document = structuredClone(valid);
    mutate(document);
    const schemaResult = schemaAccepts(document);
    const browserResult = document.schemaVersion === 2 && await browserAccepts(document.config);
    assert.equal(schemaResult, expected, `schema: ${label}`);
    assert.equal(browserResult, expected, `browser: ${label}`);
  }
});

test('no arbitrary public prose or URL leaf exists outside closed catalog keys and identifiers', async () => {
  const fields = ['text', 'title', 'label', 'rationale', 'note', 'changeNote', 'name', 'role', 'url', 'firstDayArrival', 'typicalDay', 'attendanceFeedback'];
  for (const field of fields) {
    const config = structuredClone(valid.config);
    config.localPlan[field] = 'not public';
    assert.equal(schemaAccepts(documentWith(config)), false, field);
    assert.equal(await browserAccepts(config), false, field);
  }
});
