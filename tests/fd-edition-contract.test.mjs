import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const SOURCE = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js', import.meta.url);
const API_NAMES = [
  'FD_EDITION_RULES', 'fdEditionNormalizeConfig', 'fdEditionValidateConfig',
  'fdEditionCanonicalJson', 'fdEditionBase64urlEncode', 'fdEditionBase64urlDecode',
  'fdEditionDigest', 'fdEditionDigestEqual', 'fdEditionFingerprint',
  'fdEditionCreateEnvelope', 'fdEditionValidateEnvelope', 'fdEditionDecodePayload',
  'fdEditionDiagnostic'
];

function loadContract() {
  const body = readFileSync(SOURCE, 'utf8');
  return new Function('TextEncoder', 'TextDecoder', 'atob', 'btoa',
    `${body}\nreturn {${API_NAMES.join(',')}};`)(TextEncoder, TextDecoder, atob, btoa);
}

const F = loadContract();

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../tests/fixtures/rotation-editions/${name}`, import.meta.url), 'utf8'));
}

function clone(value) { return structuredClone(value); }

function context(audience, revision) {
  return {
    audience,
    pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week',
    coreRevision: revision
  };
}

function indexFor(config, extraRefs = []) {
  const refs = [...config.pathItems.map((item) => item.ref), ...extraRefs];
  return {
    byRef: Object.fromEntries(refs.map((ref) => [ref, { ref, kind: 'read', title: 'Synthetic' }])),
    path: {
      id: config.pathId,
      weekCount: config.audience === 'ms3' ? 6 : 4
    },
    weeks: Array.from({ length: config.audience === 'ms3' ? 6 : 4 }, (_, i) => ({ n: i + 1 }))
  };
}

function codes(result) { return [...result.errors, ...result.warnings].map((finding) => finding.code); }

function assertPrivateSafe(result, secret) {
  for (const finding of [...(result.errors || []), ...(result.warnings || [])]) {
    assert.deepEqual(Object.keys(finding).sort(), ['blocking', 'code', 'message', 'path']);
    assert.equal(typeof finding.blocking, 'boolean');
    assert.match(finding.path, /^\//);
    assert.doesNotMatch(finding.message, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
}

test('publishes one immutable rules object with the contract boundaries', () => {
  assert.equal(Object.isFrozen(F.FD_EDITION_RULES), true);
  assert.deepEqual(JSON.parse(JSON.stringify(F.FD_EDITION_RULES)), {
    format: 'cw-rotation-edition', schemaVersion: 1,
    maxConfigBytes: 12288, maxUrlChars: 16000, maxQrChars: 1800,
    maxChecklist: 24, maxResources: 12, maxUrl: 2048,
    maxTitle: 100, maxRationale: 280, maxOrientation: 600,
    priorities: ['required', 'recommended', 'optional'],
    paths: {
      ms3: { id: 'ms3-six-week', weeks: 6, code: 'MS3' },
      resident: { id: 'resident-four-week', weeks: 4, code: 'RES' }
    },
    patterns: {
      locationCode: '^[A-Z0-9]{2,8}$',
      revision: '^[0-9a-f]{40}$'
    }
  });
  assert.equal(Object.isFrozen(F.FD_EDITION_RULES.paths.ms3), true);
  assert.equal(Object.isFrozen(F.FD_EDITION_RULES.priorities), true);
});

test('normalizes accepted strings and rebuilds only explicitly allowed fields', () => {
  const config = fixture('valid-ms3.json').config;
  config.card.title = '  Cafe\u0301\r\nRotation  ';
  config.card.locationCode = ' bhu2 ';
  const result = F.fdEditionNormalizeConfig(config);
  assert.equal(result.ok, true);
  assert.equal(result.value.card.title, 'Caf\u00e9\nRotation');
  assert.equal(result.value.card.locationCode, 'BHU2');
  assert.notEqual(result.value, config);
  assert.notEqual(result.value.card, config.card);
});

test('rejects unknown, dangerous, and unexpected nested keys before canonicalization', () => {
  const cases = [
    () => { const c = fixture('valid-ms3.json').config; c.card.extra = 'private-value'; return c; },
    () => { const c = fixture('valid-ms3.json').config; Object.defineProperty(c.card, '__proto__', { value: 'private-value', enumerable: true }); return c; },
    () => { const c = fixture('valid-ms3.json').config; c.pathItems[0].constructor = 'private-value'; return c; },
    () => { const c = fixture('valid-ms3.json').config; c.localOrientation.checklist[0].prototype = 'private-value'; return c; },
    () => { const c = fixture('valid-ms3.json').config; c.pathItems.extra = 'private-value'; return c; }
  ];
  for (const make of cases) {
    const result = F.fdEditionNormalizeConfig(make());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((finding) => finding.code === 'EDITION_SCHEMA'));
    assertPrivateSafe(result, 'private-value');
  }
});

test('validates audience-correct MS3 and resident configs', () => {
  for (const name of ['valid-ms3.json', 'valid-resident.json']) {
    const config = fixture(name).config;
    const result = F.fdEditionValidateConfig(config, indexFor(config), context(config.audience, config.createdAgainstCoreRevision));
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.errors)}`);
    assert.ok(result.canonicalBytes > 0);
    assert.deepEqual(result.errors, []);
  }
});

test('rejects semantic mismatches, invalid schedules, duplicate IDs, and invalid dates', () => {
  const base = fixture('valid-ms3.json').config;
  const cases = [
    ['audience', (c) => { c.audience = 'resident'; }, 'EDITION_AUDIENCE'],
    ['path', (c) => { c.pathId = 'resident-four-week'; }, 'EDITION_AUDIENCE'],
    ['week', (c) => { c.pathItems[0].week = 7; }, 'EDITION_WEEK'],
    ['ref', (c) => { c.pathItems[0].ref = 'missing-ref'; }, 'EDITION_REF'],
    ['priority', (c) => { c.pathItems[0].priority = 'urgent'; }, 'EDITION_SCHEMA'],
    ['duplicate instance ID', (c) => { c.pathItems.push({ ...c.pathItems[0], order: 2 }); }, 'EDITION_SCHEMA'],
    ['duplicate order', (c) => { c.pathItems.push({ ...c.pathItems[0], instanceId: 'core:synthetic-guide:2' }); }, 'EDITION_SCHEMA'],
    ['non-contiguous order', (c) => { c.pathItems[0].order = 2; }, 'EDITION_SCHEMA'],
    ['duplicate local ID', (c) => { c.localOrientation.resources[0].id = c.localOrientation.checklist[0].id; }, 'EDITION_SCHEMA'],
    ['date order', (c) => { c.card.rotationEnd = '2026-08-31'; }, 'EDITION_SCHEMA'],
    ['impossible date', (c) => { c.card.rotationStart = '2026-02-30'; }, 'EDITION_SCHEMA']
  ];
  for (const [label, mutate, code] of cases) {
    const config = clone(base);
    mutate(config);
    const result = F.fdEditionValidateConfig(config, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
    assert.equal(result.ok, false, label);
    assert.ok(codes(result).includes(code), `${label}: ${JSON.stringify(result.errors)}`);
  }
});

test('requires the exact current audience path and duration from the index', () => {
  const config = fixture('valid-ms3.json').config;
  for (const mutate of [
    (i) => { i.path.id = 'resident-four-week'; },
    (i) => { i.path.weekCount = 5; },
    (i) => { i.weeks.pop(); },
    (i) => { i.weeks[0].n = 2; }
  ]) {
    const index = indexFor(config);
    mutate(index);
    const result = F.fdEditionValidateConfig(config, index, context('ms3', config.createdAgainstCoreRevision));
    assert.equal(result.ok, false);
    assert.ok(codes(result).includes('EDITION_AUDIENCE'));
  }
});

test('enforces count, text, URL, and canonical byte boundaries', () => {
  const base = fixture('valid-ms3.json').config;
  const cases = [
    ['checklist count', (c) => { c.localOrientation.checklist = Array.from({ length: 25 }, (_, i) => ({ id: `local:check:${i}`, label: 'Synthetic', priority: 'optional' })); }],
    ['resource count', (c) => { c.localOrientation.resources = Array.from({ length: 13 }, (_, i) => ({ id: `local:resource:${i}`, title: 'Synthetic', url: 'https://example.edu/a', priority: 'optional', week: 1, rationale: '' })); }],
    ['title length', (c) => { c.card.title = 'x'.repeat(101); }],
    ['rationale length', (c) => { c.changeNote = 'x'.repeat(281); }],
    ['orientation length', (c) => { c.localOrientation.firstDayArrival = 'x'.repeat(601); }],
    ['URL length', (c) => { c.localOrientation.resources[0].url = `https://example.edu/${'x'.repeat(2030)}`; }]
  ];
  for (const [label, mutate] of cases) {
    const config = clone(base);
    mutate(config);
    const result = F.fdEditionValidateConfig(config, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
    assert.equal(result.ok, false, label);
    assert.ok(codes(result).some((code) => code === 'EDITION_SIZE' || code === 'EDITION_SCHEMA' || code === 'EDITION_URL'));
  }

  const oversized = clone(base);
  oversized.pathItems = Array.from({ length: 60 }, (_, i) => ({
    instanceId: `core:ref-${i}:1`, ref: `ref-${i}`, week: 1, order: i + 1,
    priority: 'required', rationale: 'x'.repeat(280)
  }));
  const result = F.fdEditionValidateConfig(
    oversized, indexFor(oversized), context('ms3', oversized.createdAgainstCoreRevision)
  );
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('EDITION_SIZE'));
  assert.ok(result.canonicalBytes > 12288);
});

test('blocks unsafe URLs and sensitive or executable text without echoing it', () => {
  const base = fixture('valid-ms3.json').config;
  const cases = [
    ['http://unsafe.example/private', 'EDITION_URL'],
    ['https://example.edu/private\u0007', 'EDITION_URL'],
    ['https://person@example.edu/private', 'EDITION_URL'],
    ['javascript:alert(1)', 'EDITION_TEXT_RISK'],
    ['person@example.edu', 'EDITION_TEXT_RISK'],
    ['Call 207-555-1212', 'EDITION_TEXT_RISK'],
    ['pager 5551234', 'EDITION_TEXT_RISK'],
    ['password = hidden-secret', 'EDITION_TEXT_RISK'],
    ['api_key = hidden-secret', 'EDITION_TEXT_RISK'],
    ['door code: 4321', 'EDITION_TEXT_RISK'],
    ['give 5 mg now', 'EDITION_TEXT_RISK'],
    ['<img src=x onerror=alert(1)>', 'EDITION_TEXT_RISK'],
    ['onload = alert(1)', 'EDITION_TEXT_RISK'],
    ['bad\u0007text', 'EDITION_TEXT_RISK']
  ];
  for (const [unsafe, expectedCode] of cases) {
    const config = clone(base);
    if (/^https?:/.test(unsafe)) config.localOrientation.resources[0].url = unsafe;
    else config.localOrientation.firstDayArrival = unsafe;
    const result = F.fdEditionValidateConfig(config, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
    assert.equal(result.ok, false, unsafe);
    assert.ok(codes(result).includes(expectedCode), JSON.stringify(result.errors));
    assertPrivateSafe(result, unsafe);
  }
});

test('advises on ambiguous sensitive topics without claiming privacy clearance', () => {
  const config = fixture('valid-ms3.json').config;
  config.changeNote = 'Review the patient identifier protocol and dosing guidance with your supervisor.';
  const result = F.fdEditionValidateConfig(config, indexFor(config), context('ms3', config.createdAgainstCoreRevision));
  assert.equal(result.ok, true);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.every((finding) => finding.blocking === false));
  assert.doesNotMatch(JSON.stringify(result.warnings), /PHI[- ]free|verified identity|signature/i);
});

test('canonical JSON sorts recursive object keys and preserves array order', () => {
  assert.equal(F.fdEditionCanonicalJson({ z: 1, a: { d: 4, b: 2 }, list: [3, 1] }), '{"a":{"b":2,"d":4},"list":[3,1],"z":1}');
  assert.notEqual(F.fdEditionCanonicalJson({ list: [3, 1] }), F.fdEditionCanonicalJson({ list: [1, 3] }));
  assert.equal(F.fdEditionCanonicalJson({ toString: 'safe data key' }), '{"toString":"safe data key"}');
  assert.throws(() => F.fdEditionCanonicalJson({ safe: 1, constructor: 2 }), /canonical/i);
});

test('creates deterministic envelopes and fingerprints from pre-digest bytes only', async () => {
  const ms3 = fixture('valid-ms3.json').config;
  ms3.card.locationCode = ' bhu2 ';
  const idx = indexFor(ms3);
  const ctx = context('ms3', ms3.createdAgainstCoreRevision);
  const first = await F.fdEditionCreateEnvelope(ms3, idx, ctx, webcrypto.subtle);
  assert.equal(first.ok, true, JSON.stringify(first.errors));
  assert.equal(first.envelope.digest, 'sha256-0yNYx0YDtseTmaoXY9tA343Ox3bLlFn85aN-9O1xKls');
  assert.equal(first.fingerprint, 'BHU2-MS3-TCHNHH');
  assert.deepEqual(Object.keys(first.envelope), ['format', 'schemaVersion', 'config', 'digest']);
  assert.equal(first.payload, F.fdEditionBase64urlEncode(new TextEncoder().encode(F.fdEditionCanonicalJson(first.envelope))));

  const reordered = {
    changeNote: ms3.changeNote, localOrientation: ms3.localOrientation, pathItems: ms3.pathItems,
    card: ms3.card, createdAgainstCoreRevision: ms3.createdAgainstCoreRevision,
    editionNumber: ms3.editionNumber, pathId: ms3.pathId, audience: ms3.audience
  };
  const again = await F.fdEditionCreateEnvelope(reordered, idx, ctx, webcrypto.subtle);
  assert.equal(again.envelope.digest, first.envelope.digest);
  assert.equal(again.fingerprint, first.fingerprint);
  assert.equal(F.fdEditionCanonicalJson(again.envelope.config), F.fdEditionCanonicalJson(first.envelope.config));

  const edited = clone(ms3);
  edited.card.title = 'A student-visible edit';
  const changed = await F.fdEditionCreateEnvelope(edited, idx, ctx, webcrypto.subtle);
  assert.notEqual(changed.envelope.digest, first.envelope.digest);
  assert.notEqual(changed.fingerprint, first.fingerprint);
});

test('array reordering changes the digest and resident prefix is normalized exactly', async () => {
  const config = fixture('valid-resident.json').config;
  config.card.locationCode = ' mmc ';
  config.localOrientation.checklist.push({ id: 'local:check:2', label: 'Second synthetic task', priority: 'optional' });
  const idx = indexFor(config);
  const ctx = context('resident', config.createdAgainstCoreRevision);
  const first = await F.fdEditionCreateEnvelope(config, idx, ctx, webcrypto.subtle);
  const reordered = clone(config);
  reordered.localOrientation.checklist.reverse();
  const second = await F.fdEditionCreateEnvelope(reordered, idx, ctx, webcrypto.subtle);
  assert.equal(first.ok, true);
  assert.equal(first.fingerprint, 'MMC-RES-NYQ83B');
  assert.notEqual(first.envelope.digest, second.envelope.digest);
  assert.notEqual(first.fingerprint, second.fingerprint);
});

test('base64url codec round-trips exact unpadded bytes and rejects alternate forms', () => {
  const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
  assert.deepEqual(F.fdEditionBase64urlDecode(F.fdEditionBase64urlEncode(bytes), 6), bytes);
  for (const value of ['AA==', 'AA+_', 'AA/_', 'A', 'AA&x=1', '', 'not valid']) {
    assert.throws(() => F.fdEditionBase64urlDecode(value, 100), /base64url/i, value);
  }
  assert.throws(() => F.fdEditionBase64urlDecode('AAAA', 2), /base64url/i);
});

test('validates envelope digest, audience, schema version, and missing crypto safely', async () => {
  const config = fixture('valid-ms3.json').config;
  const idx = indexFor(config);
  const ctx = context('ms3', config.createdAgainstCoreRevision);
  const made = await F.fdEditionCreateEnvelope(config, idx, ctx, webcrypto.subtle);
  assert.equal((await F.fdEditionValidateEnvelope(made.envelope, idx, ctx, webcrypto.subtle)).ok, true);

  const wrongDigest = clone(made.envelope);
  wrongDigest.digest = `sha256-${'A'.repeat(43)}`;
  assert.ok(codes(await F.fdEditionValidateEnvelope(wrongDigest, idx, ctx, webcrypto.subtle)).includes('EDITION_DIGEST'));

  const wrongAudience = context('resident', config.createdAgainstCoreRevision);
  assert.ok(codes(await F.fdEditionValidateEnvelope(made.envelope, idx, wrongAudience, webcrypto.subtle)).includes('EDITION_AUDIENCE'));

  const wrongVersion = clone(made.envelope);
  wrongVersion.schemaVersion = 2;
  assert.ok(codes(await F.fdEditionValidateEnvelope(wrongVersion, idx, ctx, webcrypto.subtle)).includes('EDITION_SCHEMA'));

  const noCrypto = await F.fdEditionCreateEnvelope(config, idx, ctx, undefined);
  assert.equal(noCrypto.ok, false);
  assert.ok(codes(noCrypto).includes('EDITION_DIGEST'));
  const noSubtle = await F.fdEditionValidateEnvelope(made.envelope, idx, ctx, null);
  assert.equal(noSubtle.ok, false);
  assert.ok(codes(noSubtle).includes('EDITION_DIGEST'));
});

test('digest equality requires exact 32-byte digests and fingerprints use first 30 bits', () => {
  const abc = 'sha256-ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0';
  assert.equal(F.fdEditionDigestEqual(abc, abc), true);
  assert.equal(F.fdEditionDigestEqual(abc, abc.slice(0, -1) + 'A'), false);
  assert.equal(F.fdEditionDigestEqual('sha256-short', 'sha256-short'), false);
  assert.equal(F.fdEditionFingerprint({ audience: 'ms3', card: { locationCode: 'bhu2' } }, abc), 'BHU2-MS3-Q9W1DF');
});

test('payload decoding rejects malformed UTF-8, trailing parameters, oversize URLs, and bad envelopes', async () => {
  const config = fixture('valid-ms3.json').config;
  const idx = indexFor(config);
  const ctx = context('ms3', config.createdAgainstCoreRevision);
  const made = await F.fdEditionCreateEnvelope(config, idx, ctx, webcrypto.subtle);
  assert.equal((await F.fdEditionDecodePayload(made.payload, idx, ctx, webcrypto.subtle, 16000)).ok, true);

  const cases = [
    [made.payload, 16001, 'EDITION_URL'],
    [`${made.payload}&other=1`, 100, 'EDITION_SCHEMA'],
    [F.fdEditionBase64urlEncode(new Uint8Array([0xc3, 0x28])), 100, 'EDITION_SCHEMA'],
    [F.fdEditionBase64urlEncode(new TextEncoder().encode('{"schemaVersion":1} trailing')), 100, 'EDITION_SCHEMA']
  ];
  for (const [payload, length, code] of cases) {
    const result = await F.fdEditionDecodePayload(payload, idx, ctx, webcrypto.subtle, length);
    assert.equal(result.ok, false);
    assert.ok(codes(result).includes(code), JSON.stringify(result.errors));
  }
});

test('diagnostics disclose only stable comparison fields', async () => {
  const config = fixture('valid-ms3.json').config;
  const ctx = context('ms3', config.createdAgainstCoreRevision);
  const made = await F.fdEditionCreateEnvelope(config, indexFor(config), ctx, webcrypto.subtle);
  assert.deepEqual(F.fdEditionDiagnostic(made, ctx), {
    code: 'EDITION_OK', schemaVersion: 1,
    fingerprint: 'EXAMPLE-MS3-439G4E',
    currentCoreRevision: config.createdAgainstCoreRevision
  });
  assert.doesNotMatch(JSON.stringify(F.fdEditionDiagnostic(made, ctx)), /verified identity|signature/i);
});
