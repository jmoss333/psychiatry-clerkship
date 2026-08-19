import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';

const SOURCE = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js', import.meta.url);
const body = readFileSync(SOURCE, 'utf8');
const F = new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa', `${body}\nreturn {
  FD_EDITION_RULES,fdEditionCanonicalJson,fdEditionDigest,fdEditionValidateEnvelope
};`)(TextEncoder, TextDecoder, atob, btoa);

const schema = JSON.parse(readFileSync(new URL('../rotation_edition.schema.json', import.meta.url), 'utf8'));
const python = String.raw`
import json,sys
from jsonschema import Draft7Validator
data=json.load(sys.stdin)
schema=data['schema']; document=data['document']
Draft7Validator.check_schema(schema)
sys.exit(0 if not list(Draft7Validator(schema).iter_errors(document)) else 1)
`;

function schemaAccepts(document) {
  const run = spawnSync('python3', ['-c', python], {
    input: JSON.stringify({ schema, document }), encoding: 'utf8'
  });
  assert.ok(run.status === 0 || run.status === 1, run.stderr);
  return run.status === 0;
}

function baseDocument() {
  return {
    format: 'cw-rotation-edition', schemaVersion: 1,
    config: {
      audience: 'ms3', pathId: 'ms3-six-week', editionNumber: 1,
      createdAgainstCoreRevision: '1234567890abcdef1234567890abcdef12345678',
      card: {
        title: 'Synthetic edition', locationName: 'Example Unit', locationCode: 'BHU2',
        curatorName: 'Sample Curator', curatorRole: 'Faculty educator',
        rotationStart: '2026-09-01', rotationEnd: '2026-10-12', lastVerified: '2026-08-19'
      },
      pathItems: [{
        instanceId: 'core:guide:1', ref: 'guide', week: 6, order: 1,
        priority: 'required', rationale: 'Synthetic rationale.'
      }],
      localOrientation: {
        firstDayArrival: 'Synthetic guidance.', dailySchedule: '', roundsWorkflow: '',
        presentationExpectations: '', documentationExpectations: '', attendanceExpectations: '',
        feedbackProcess: '', accessPreparation: '',
        contacts: [{ role: 'Support role', directoryUrl: 'https://example.edu/directory' }],
        checklist: [{ id: 'local:check:1', label: 'Synthetic task', priority: 'recommended' }],
        resources: [{ id: 'local:resource:1', title: 'Synthetic resource', url: 'https://example.edu/resource', priority: 'optional', week: 6, rationale: '' }]
      },
      changeNote: ''
    },
    digest: `sha256-${'A'.repeat(43)}`
  };
}

function clone(value) { return structuredClone(value); }

function indexAndContext(document) {
  const { config } = document;
  const expected = F.FD_EDITION_RULES.paths[config.audience] || F.FD_EDITION_RULES.paths.ms3;
  return {
    index: {
      byRef: { guide: { ref: 'guide', kind: 'read', title: 'Synthetic' } },
      path: { id: expected.id, weekCount: expected.weeks },
      weeks: Array.from({ length: expected.weeks }, (_, i) => ({ n: i + 1 }))
    },
    context: {
      audience: config.audience,
      pathId: expected.id,
      coreRevision: config.createdAgainstCoreRevision
    }
  };
}

async function sign(document) {
  const signed = clone(document);
  if (signed.format === 'cw-rotation-edition' && signed.schemaVersion === 1) {
    signed.digest = await F.fdEditionDigest({
      format: signed.format, schemaVersion: signed.schemaVersion, config: signed.config
    }, webcrypto.subtle);
  }
  return signed;
}

async function browserAccepts(document) {
  const { index, context } = indexAndContext(document);
  return (await F.fdEditionValidateEnvelope(document, index, context, webcrypto.subtle)).ok;
}

test('public browser boundaries match the Draft 7 schema decisions', () => {
  assert.equal(F.FD_EDITION_RULES.schemaVersion, schema.properties.schemaVersion.const);
  assert.deepEqual(F.FD_EDITION_RULES.priorities, schema.definitions.priority.enum);
  assert.equal(F.FD_EDITION_RULES.maxChecklist, schema.definitions.localOrientation.properties.checklist.maxItems);
  assert.equal(F.FD_EDITION_RULES.maxResources, schema.definitions.localOrientation.properties.resources.maxItems);
  assert.equal(F.FD_EDITION_RULES.maxUrl, schema.definitions.url.maxLength);
  assert.equal(F.FD_EDITION_RULES.maxTitle, schema.definitions.label.maxLength);
  assert.equal(F.FD_EDITION_RULES.maxRationale, schema.definitions.rationale.maxLength);
  assert.equal(F.FD_EDITION_RULES.maxOrientation, schema.definitions.orientationText.maxLength);
  assert.equal(F.FD_EDITION_RULES.patterns.locationCode, schema.definitions.card.properties.locationCode.pattern);
  assert.equal(F.FD_EDITION_RULES.patterns.revision, schema.properties.config.properties.createdAgainstCoreRevision.pattern);
  assert.deepEqual(
    Object.fromEntries(schema.properties.config.oneOf.map((branch) => [
      branch.properties.audience.const,
      {
        id: branch.properties.pathId.const,
        weeks: branch.properties.pathItems.items.$ref.includes('ms3') ? 6 : 4
      }
    ])),
    { ms3: { id: 'ms3-six-week', weeks: 6 }, resident: { id: 'resident-four-week', weeks: 4 } }
  );
});

test('hand-authored valid and boundary-invalid documents have schema/browser parity', async () => {
  const cases = [
    ['valid maximum boundaries', (d) => {
      d.config.card.title = 'x'.repeat(100);
      d.config.pathItems[0].rationale = 'x'.repeat(280);
      d.config.localOrientation.firstDayArrival = 'x'.repeat(600);
      d.config.localOrientation.contacts[0].directoryUrl = `https://e.co/${'x'.repeat(2035)}`;
      d.config.localOrientation.checklist = Array.from({ length: 24 }, (_, i) => ({ id: `local:check:${i}`, label: 'Synthetic', priority: 'required' }));
      d.config.localOrientation.resources = Array.from({ length: 12 }, (_, i) => ({ id: `local:resource:${i}`, title: 'Synthetic', url: 'https://example.edu/r', priority: 'optional', week: 1, rationale: '' }));
    }, true],
    ['resident path and week four', (d) => {
      d.config.audience = 'resident'; d.config.pathId = 'resident-four-week';
      d.config.pathItems[0].week = 4; d.config.localOrientation.resources[0].week = 4;
    }, true],
    ['unsupported version', (d) => { d.schemaVersion = 2; }, false],
    ['wrong audience/path pairing', (d) => { d.config.pathId = 'resident-four-week'; }, false],
    ['MS3 week above six', (d) => { d.config.pathItems[0].week = 7; }, false],
    ['resident week above four', (d) => {
      d.config.audience = 'resident'; d.config.pathId = 'resident-four-week';
      d.config.pathItems[0].week = 5; d.config.localOrientation.resources[0].week = 4;
    }, false],
    ['unknown priority', (d) => { d.config.pathItems[0].priority = 'urgent'; }, false],
    ['25 checklist items', (d) => { d.config.localOrientation.checklist = Array.from({ length: 25 }, (_, i) => ({ id: `local:check:${i}`, label: 'Synthetic', priority: 'required' })); }, false],
    ['13 resources', (d) => { d.config.localOrientation.resources = Array.from({ length: 13 }, (_, i) => ({ id: `local:resource:${i}`, title: 'Synthetic', url: 'https://example.edu/r', priority: 'optional', week: 1, rationale: '' })); }, false],
    ['title above maximum', (d) => { d.config.card.title = 'x'.repeat(101); }, false],
    ['rationale above maximum', (d) => { d.config.changeNote = 'x'.repeat(281); }, false],
    ['orientation above maximum', (d) => { d.config.localOrientation.firstDayArrival = 'x'.repeat(601); }, false],
    ['URL above maximum', (d) => { d.config.localOrientation.contacts[0].directoryUrl = `https://e.co/${'x'.repeat(2036)}`; }, false],
    ['unsafe URL', (d) => { d.config.localOrientation.contacts[0].directoryUrl = 'http://example.edu/directory'; }, false],
    ['location code mismatch', (d) => { d.config.card.locationCode = 'TOO-LONG-9'; }, false],
    ['revision mismatch', (d) => { d.config.createdAgainstCoreRevision = 'abc'; }, false]
  ];

  for (const [label, mutate, expected] of cases) {
    const document = baseDocument();
    mutate(document);
    const signed = await sign(document);
    const schemaResult = schemaAccepts(signed);
    const browserResult = await browserAccepts(signed);
    assert.equal(schemaResult, expected, `${label}: schema`);
    assert.equal(browserResult, expected, `${label}: browser`);
    assert.equal(browserResult, schemaResult, `${label}: validators drifted`);
  }
});
