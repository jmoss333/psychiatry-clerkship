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
  'fdEditionDiagnostic', 'fdEditionTrustedSnapshot'
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

function revokedProxy(target) {
  const { proxy, revoke } = Proxy.revocable(target, {});
  revoke();
  return proxy;
}

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

test('rejects non-enumerable and symbol fields while leaving accessors uninvoked', () => {
  const hiddenCases = [
    () => {
      const c = fixture('valid-ms3.json').config;
      Object.defineProperty(c.card, 'hiddenField', { value: 'private-value', enumerable: false });
      return c;
    },
    () => {
      const c = fixture('valid-ms3.json').config;
      c.card[Symbol('hidden-field')] = 'private-value';
      return c;
    },
    () => {
      const c = fixture('valid-ms3.json').config;
      Object.defineProperty(c.pathItems, 'hiddenField', { value: 'private-value', enumerable: false });
      return c;
    },
    () => {
      const c = fixture('valid-ms3.json').config;
      c.pathItems[Symbol('hidden-field')] = 'private-value';
      return c;
    }
  ];
  for (const make of hiddenCases) {
    const result = F.fdEditionNormalizeConfig(make());
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((finding) => finding.code === 'EDITION_SCHEMA'));
    assertPrivateSafe(result, 'private-value');
  }

  let getterReads = 0;
  const accessorConfig = fixture('valid-ms3.json').config;
  Object.defineProperty(accessorConfig.card, 'title', {
    enumerable: false,
    get() { getterReads += 1; return 'Synthetic'; }
  });
  const accessorResult = F.fdEditionNormalizeConfig(accessorConfig);
  assert.equal(accessorResult.ok, false);
  assert.equal(getterReads, 0);
});

test('rejects oversized sparse arrays before attacker-sized descriptor iteration', () => {
  const config = fixture('valid-ms3.json').config;
  let descriptorReads = 0;
  const sparse = new Proxy(new Array(100_000), {
    getOwnPropertyDescriptor(target, key) {
      if (key !== 'length') descriptorReads += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });
  config.pathItems = sparse;
  const result = F.fdEditionNormalizeConfig(config);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((finding) => finding.code === 'EDITION_SIZE'));
  assert.ok(descriptorReads < 100, `descriptor reads: ${descriptorReads}`);
});

test('canonicalization rejects hidden fields, accessors, symbols, and oversized sparse arrays', () => {
  const hidden = { safe: 'value' };
  Object.defineProperty(hidden, 'hiddenField', { value: 'private-value', enumerable: false });
  assert.throws(() => F.fdEditionCanonicalJson(hidden), /canonical/i);

  const symbolic = { safe: 'value', [Symbol('hidden')]: 'private-value' };
  assert.throws(() => F.fdEditionCanonicalJson(symbolic), /canonical/i);

  let getterReads = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'safe', { enumerable: true, get() { getterReads += 1; return 'value'; } });
  assert.throws(() => F.fdEditionCanonicalJson(accessor), /canonical/i);
  assert.equal(getterReads, 0);

  let descriptorReads = 0;
  const sparse = new Proxy(new Array(100_000), {
    getOwnPropertyDescriptor(target, key) {
      if (key !== 'length') descriptorReads += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });
  assert.throws(() => F.fdEditionCanonicalJson(sparse), /canonical/i);
  assert.ok(descriptorReads < 100, `descriptor reads: ${descriptorReads}`);
});

test('normalization and validation return safe schema findings for revoked proxies', () => {
  const base = fixture('valid-ms3.json').config;
  const idx = indexFor(base);
  const ctx = context('ms3', base.createdAgainstCoreRevision);
  const cases = [
    revokedProxy({}),
    Object.assign(clone(base), { card: revokedProxy({}) }),
    Object.assign(clone(base), { pathItems: revokedProxy([]) }),
    (() => { const c = clone(base); c.pathItems[0] = revokedProxy({}); return c; })()
  ];

  for (const config of cases) {
    let normalized;
    assert.doesNotThrow(() => { normalized = F.fdEditionNormalizeConfig(config); });
    assert.equal(normalized.ok, false);
    assert.ok(normalized.errors.some((finding) => finding.code === 'EDITION_SCHEMA'));
    assertPrivateSafe(normalized, 'revoked');

    let validated;
    assert.doesNotThrow(() => { validated = F.fdEditionValidateConfig(config, idx, ctx); });
    assert.equal(validated.ok, false);
    assert.ok(validated.errors.some((finding) => finding.code === 'EDITION_SCHEMA'));
    assertPrivateSafe(validated, 'revoked');
  }
});

test('envelope creation and validation fail structurally for revoked top-level and nested proxies', async () => {
  const base = fixture('valid-ms3.json').config;
  const idx = indexFor(base);
  const ctx = context('ms3', base.createdAgainstCoreRevision);
  const valid = await F.fdEditionCreateEnvelope(base, idx, ctx, webcrypto.subtle);

  for (const config of [revokedProxy({}), Object.assign(clone(base), { localOrientation: revokedProxy({}) })]) {
    let created;
    await assert.doesNotReject(async () => { created = await F.fdEditionCreateEnvelope(config, idx, ctx, webcrypto.subtle); });
    assert.equal(created.ok, false);
    assert.ok(created.errors.some((finding) => finding.code === 'EDITION_SCHEMA'));
    assertPrivateSafe(created, 'revoked');
  }

  const nestedEnvelope = clone(valid.envelope);
  nestedEnvelope.config = revokedProxy({});
  for (const envelope of [revokedProxy({}), nestedEnvelope]) {
    let validated;
    await assert.doesNotReject(async () => { validated = await F.fdEditionValidateEnvelope(envelope, idx, ctx, webcrypto.subtle); });
    assert.equal(validated.ok, false);
    assert.ok(validated.errors.some((finding) => finding.code === 'EDITION_SCHEMA'));
    assertPrivateSafe(validated, 'revoked');
  }
});

test('non-structured exports do not leak revoked proxy exceptions', () => {
  const revoked = revokedProxy({});
  assert.throws(
    () => F.fdEditionCanonicalJson(revoked),
    (error) => /canonical/i.test(error.message) && !/revoked|proxy/i.test(error.message)
  );
  assert.equal(F.fdEditionFingerprint(revokedProxy({}), `sha256-${'A'.repeat(43)}`), '');
  assert.equal(F.fdEditionFingerprint({ audience: revokedProxy({}), card: { locationCode: 'BHU2' } }, `sha256-${'A'.repeat(43)}`), '');
  assert.throws(
    () => F.fdEditionBase64urlEncode(revokedProxy(new Uint8Array([1, 2, 3]))),
    (error) => /base64url/i.test(error.message) && !/revoked|proxy/i.test(error.message)
  );
  assert.deepEqual(F.fdEditionDiagnostic(revokedProxy({}), { coreRevision: '1234567890abcdef1234567890abcdef12345678' }), {
    code: 'EDITION_SCHEMA', schemaVersion: null, fingerprint: '',
    currentCoreRevision: '1234567890abcdef1234567890abcdef12345678'
  });
  assert.deepEqual(F.fdEditionDiagnostic({ errors: [{ code: revokedProxy({}) }], envelope: { schemaVersion: 1 } }, {
    coreRevision: '1234567890abcdef1234567890abcdef12345678'
  }), {
    code: 'EDITION_SCHEMA', schemaVersion: 1, fingerprint: '',
    currentCoreRevision: '1234567890abcdef1234567890abcdef12345678'
  });
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
    ['https://?x', 'EDITION_URL'],
    ['https://example..edu/private', 'EDITION_URL'],
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

test('blocks every normalized C0 and C1 control except LF while preserving multiline narrative text', () => {
  const base = fixture('valid-ms3.json').config;
  const disallowed = [
    ...Array.from({ length: 10 }, (_, code) => code),
    ...Array.from({ length: 21 }, (_, offset) => offset + 11).filter((code) => code !== 13),
    ...Array.from({ length: 33 }, (_, offset) => offset + 127)
  ];

  for (const code of disallowed) {
    const config = clone(base);
    const unsafe = `Synthetic${String.fromCharCode(code)}guidance`;
    config.localOrientation.firstDayArrival = unsafe;
    const result = F.fdEditionValidateConfig(
      config, indexFor(base), context('ms3', base.createdAgainstCoreRevision)
    );
    assert.equal(result.ok, false, `U+${code.toString(16).padStart(4, '0')}`);
    assert.ok(result.errors.some((finding) =>
      finding.code === 'EDITION_TEXT_RISK' &&
      finding.path === '/config/localOrientation/firstDayArrival'
    ));
    assertPrivateSafe(result, unsafe);
  }

  const multiline = clone(base);
  multiline.localOrientation.firstDayArrival = 'First line\r\nSecond line\rThird line\nFourth line';
  const accepted = F.fdEditionValidateConfig(
    multiline, indexFor(base), context('ms3', base.createdAgainstCoreRevision)
  );
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors));
  assert.equal(accepted.value.localOrientation.firstDayArrival,
    'First line\nSecond line\nThird line\nFourth line');
});

test('blocks tab-obfuscated credentials and assigned pager numbers in narrative and identifier fields without echoing values', () => {
  const base = fixture('valid-ms3.json').config;
  const fields = [
    {
      path: '/config/localOrientation/firstDayArrival',
      set(config, value) { config.localOrientation.firstDayArrival = value; }
    },
    {
      path: '/config/pathItems/0/instanceId',
      set(config, value) { config.pathItems[0].instanceId = value; }
    },
    {
      path: '/config/pathItems/0/ref',
      set(config, value) { config.pathItems[0].ref = value; }
    },
    {
      path: '/config/localOrientation/checklist/0/id',
      set(config, value) { config.localOrientation.checklist[0].id = value; }
    },
    {
      path: '/config/localOrientation/resources/0/id',
      set(config, value) { config.localOrientation.resources[0].id = value; }
    }
  ];
  const unsafeValues = [
    ['api_key\t=\tsynthetic-secret', 'synthetic-secret'],
    ['pager = 5551234', '5551234'],
    ['pager is 5551234', '5551234']
  ];

  for (const field of fields) {
    for (const [unsafe, privatePart] of unsafeValues) {
      const config = clone(base);
      field.set(config, unsafe);
      const result = F.fdEditionValidateConfig(
        config, indexFor(config), context('ms3', base.createdAgainstCoreRevision)
      );
      assert.equal(result.ok, false, `${field.path}: assigned private value`);
      assert.ok(result.errors.some((finding) =>
        finding.code === 'EDITION_TEXT_RISK' && finding.path === field.path
      ), `${field.path}: ${JSON.stringify(result.errors)}`);
      assertPrivateSafe(result, privatePart);
    }
  }
});

test('blocks controls and assigned pager numbers after each decoded URL layer without echoing values', () => {
  const base = fixture('valid-ms3.json').config;
  const cases = [
    ['https://example.edu/policy?note=synthetic%09guidance', 'synthetic\tguidance'],
    ['https://example.edu/policy?note=synthetic%C2%85guidance', 'synthetic\u0085guidance'],
    ['https://example.edu/policy?note=api_key%2509%253D%2509synthetic-secret', 'synthetic-secret'],
    ['https://example.edu/policy?note=pager%2520is%25205551234', '5551234']
  ];

  for (const field of ['contact', 'resource']) {
    for (const [unsafe, privatePart] of cases) {
      const config = clone(base);
      const path = field === 'contact'
        ? '/config/localOrientation/contacts/0/directoryUrl'
        : '/config/localOrientation/resources/0/url';
      if (field === 'contact') config.localOrientation.contacts[0].directoryUrl = unsafe;
      else config.localOrientation.resources[0].url = unsafe;
      const result = F.fdEditionValidateConfig(
        config, indexFor(base), context('ms3', base.createdAgainstCoreRevision)
      );
      assert.equal(result.ok, false, `${field}: encoded private value`);
      assert.ok(result.errors.some((finding) =>
        finding.code === 'EDITION_TEXT_RISK' && finding.path === path
      ), `${field}: ${JSON.stringify(result.errors)}`);
      assertPrivateSafe(result, privatePart);
    }
  }
});

test('screens raw and decoded URL content for blocking privacy risks', () => {
  const base = fixture('valid-ms3.json').config;
  const cases = [
    ['https://example.edu/policy?contact=person%40example.edu', 'person@example.edu'],
    ['https://example.edu/policy?phone=207-555-0100', '207-555-0100'],
    ['https://example.edu/policy?api_key%3Dexample-only', 'example-only'],
    ['https://example.edu/policy?note=door%20code%20is%204321', '4321'],
    ['https://example.edu/policy?dose=5%20milligrams', '5 milligrams']
  ];
  for (const [unsafe, privatePart] of cases) {
    const config = clone(base);
    config.localOrientation.resources[0].url = unsafe;
    const result = F.fdEditionValidateConfig(config, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
    assert.equal(result.ok, false, unsafe);
    assert.ok(result.errors.some((finding) => finding.code === 'EDITION_TEXT_RISK'));
    assertPrivateSafe(result, privatePart);
  }
});

test('fails closed on malformed URL encoding and preserves benign and advisory URLs', () => {
  const base = fixture('valid-ms3.json').config;
  const malformed = clone(base);
  malformed.localOrientation.resources[0].url = 'https://example.edu/policy?note=%E0%A4%A';
  const malformedResult = F.fdEditionValidateConfig(malformed, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
  assert.equal(malformedResult.ok, false);
  assert.ok(malformedResult.errors.some((finding) => finding.code === 'EDITION_URL'));
  assertPrivateSafe(malformedResult, '%E0%A4%A');

  const advisory = clone(base);
  advisory.localOrientation.resources[0].url = 'https://example.edu/policy?note=review%20password%20handling';
  const advisoryResult = F.fdEditionValidateConfig(advisory, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
  assert.equal(advisoryResult.ok, true);
  assert.ok(advisoryResult.warnings.some((finding) => finding.code === 'EDITION_TEXT_RISK'));

  const benign = clone(base);
  benign.localOrientation.resources[0].url = 'https://example.edu/policies/orientation?audience=ms3#week-1';
  const benignResult = F.fdEditionValidateConfig(benign, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
  assert.equal(benignResult.ok, true, JSON.stringify(benignResult.errors));
  assert.deepEqual(benignResult.warnings, []);
});

test('iteratively screens double-encoded privacy risks in both URL-bearing fields', () => {
  const base = fixture('valid-ms3.json').config;
  const cases = [
    ['resource', 'https://example.edu/policy?contact=person%2540example.edu', 'person@example.edu'],
    ['contact', 'https://example.edu/directory?api_key%253Dexample-only', 'example-only'],
    ['resource', 'https://example.edu/policy?phone=207%252D555%252D0100', '207-555-0100'],
    ['contact', 'https://example.edu/directory?note=door%2520code%2520is%25204321', '4321'],
    ['contact', 'https://example.edu/directory?note=door%252Bcode%252Bis%252B4321', '4321'],
    ['resource', 'https://example.edu/policy?dose=5%2520milligrams', '5 milligrams']
  ];
  for (const [field, unsafe, privatePart] of cases) {
    const config = clone(base);
    if (field === 'contact') config.localOrientation.contacts[0].directoryUrl = unsafe;
    else config.localOrientation.resources[0].url = unsafe;
    const result = F.fdEditionValidateConfig(config, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
    assert.equal(result.ok, false, unsafe);
    assert.ok(result.errors.some((finding) => finding.code === 'EDITION_TEXT_RISK'));
    assertPrivateSafe(result, privatePart);
  }
});

test('accepts benign percent encoding and fails closed on excessive URL encoding layers', () => {
  const base = fixture('valid-ms3.json').config;
  const benign = clone(base);
  benign.localOrientation.contacts[0].directoryUrl = 'https://example.edu/directory/faculty%2Dsupport';
  benign.localOrientation.resources[0].url = 'https://example.edu/policy/orientation%20guide';
  const benignResult = F.fdEditionValidateConfig(benign, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
  assert.equal(benignResult.ok, true, JSON.stringify(benignResult.errors));
  assert.deepEqual(benignResult.warnings, []);

  for (const field of ['contact', 'resource']) {
    const config = clone(base);
    const excessive = 'https://example.edu/policy?contact=person%2525252540example.edu';
    if (field === 'contact') config.localOrientation.contacts[0].directoryUrl = excessive;
    else config.localOrientation.resources[0].url = excessive;
    const result = F.fdEditionValidateConfig(config, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
    assert.equal(result.ok, false, field);
    assert.ok(result.errors.some((finding) => finding.code === 'EDITION_URL'));
    assertPrivateSafe(result, 'person@example.edu');
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

test('blocks assignment verbs and broad medication dose units without echoing synthetic values', () => {
  const base = fixture('valid-ms3.json').config;
  for (const unsafe of ['door code is 4321', 'password is example-only', 'Take 5 milligrams now']) {
    const config = clone(base);
    config.localOrientation.firstDayArrival = unsafe;
    const result = F.fdEditionValidateConfig(config, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
    assert.equal(result.ok, false, unsafe);
    assert.ok(result.errors.some((finding) => finding.code === 'EDITION_TEXT_RISK'));
    assertPrivateSafe(result, unsafe);
  }
});

test('advises on ambiguous credential, access, and dose terms', () => {
  const base = fixture('valid-ms3.json').config;
  for (const ambiguous of [
    'Review password handling with a supervisor.',
    'Review the access code process with a supervisor.',
    'Review dose guidance with a supervisor.'
  ]) {
    const config = clone(base);
    config.changeNote = ambiguous;
    const result = F.fdEditionValidateConfig(config, indexFor(base), context('ms3', base.createdAgainstCoreRevision));
    assert.equal(result.ok, true, ambiguous);
    assert.ok(result.warnings.some((finding) => finding.code === 'EDITION_TEXT_RISK'), ambiguous);
    assertPrivateSafe(result, ambiguous);
  }
});

test('screens every identifier field with the common privacy policy and preserves benign IDs', () => {
  const base = fixture('valid-ms3.json').config;
  const identifierFields = [
    {
      label: 'path item instance ID', path: '/config/pathItems/0/instanceId',
      set(config, value) { config.pathItems[0].instanceId = value; }
    },
    {
      label: 'path item core ref', path: '/config/pathItems/0/ref',
      set(config, value) { config.pathItems[0].ref = value; }
    },
    {
      label: 'local checklist ID', path: '/config/localOrientation/checklist/0/id',
      set(config, value) { config.localOrientation.checklist[0].id = value; }
    },
    {
      label: 'local resource ID', path: '/config/localOrientation/resources/0/id',
      set(config, value) { config.localOrientation.resources[0].id = value; }
    }
  ];
  const blockingValues = [
    'person@example.edu',
    '207-555-0100',
    'api_key=example-only',
    'door-code=4321',
    '5mg',
    '<img>',
    'onload=alert(1)'
  ];

  for (const field of identifierFields) {
    for (const unsafe of blockingValues) {
      const config = clone(base);
      field.set(config, unsafe);
      const result = F.fdEditionValidateConfig(
        config, indexFor(config), context('ms3', base.createdAgainstCoreRevision)
      );
      assert.equal(result.ok, false, `${field.label}: ${unsafe}`);
      assert.ok(result.errors.some((finding) =>
        finding.code === 'EDITION_TEXT_RISK' && finding.path === field.path
      ), `${field.label}: ${JSON.stringify(result.errors)}`);
      assertPrivateSafe(result, unsafe);
      assert.doesNotMatch(JSON.stringify([...result.errors, ...result.warnings]),
        new RegExp(unsafe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }

    const advisory = clone(base);
    field.set(advisory, 'local:password-policy');
    const advisoryResult = F.fdEditionValidateConfig(
      advisory, indexFor(advisory), context('ms3', base.createdAgainstCoreRevision)
    );
    assert.equal(advisoryResult.ok, true, field.label);
    assert.ok(advisoryResult.warnings.some((finding) =>
      finding.code === 'EDITION_TEXT_RISK' && finding.path === field.path
    ), field.label);
    assertPrivateSafe(advisoryResult, 'local:password-policy');

    const benign = clone(base);
    field.set(benign, `benign:${field.label.replace(/\s+/g, '-').toLowerCase()}:2`);
    const benignResult = F.fdEditionValidateConfig(
      benign, indexFor(benign), context('ms3', base.createdAgainstCoreRevision)
    );
    assert.equal(benignResult.ok, true, `${field.label}: ${JSON.stringify(benignResult.errors)}`);
    assert.deepEqual(benignResult.warnings, [], field.label);

    for (const [identifier, valid] of [['a'.repeat(160), true], ['a'.repeat(161), false], ['has space', false]]) {
      const boundary = clone(base);
      field.set(boundary, identifier);
      const boundaryResult = F.fdEditionValidateConfig(
        boundary, indexFor(boundary), context('ms3', base.createdAgainstCoreRevision)
      );
      assert.equal(boundaryResult.ok, valid, `${field.label}: ${identifier.length} characters`);
      if (!valid) assert.ok(boundaryResult.errors.some((finding) =>
        finding.code === 'EDITION_SCHEMA' && finding.path === field.path
      ), field.label);
    }
  }
});

test('advises on sensitive multiword separator variants in every identifier field', () => {
  const base = fixture('valid-ms3.json').config;
  const identifierFields = [
    {
      label: 'path item instance ID', path: '/config/pathItems/0/instanceId',
      set(config, value) { config.pathItems[0].instanceId = value; }
    },
    {
      label: 'path item core ref', path: '/config/pathItems/0/ref',
      set(config, value) { config.pathItems[0].ref = value; }
    },
    {
      label: 'local checklist ID', path: '/config/localOrientation/checklist/0/id',
      set(config, value) { config.localOrientation.checklist[0].id = value; }
    },
    {
      label: 'local resource ID', path: '/config/localOrientation/resources/0/id',
      set(config, value) { config.localOrientation.resources[0].id = value; }
    }
  ];
  const phrases = [['access', 'code'], ['patient', 'identifier']];

  for (const field of identifierFields) {
    for (const separator of [' ', '-', '_']) {
      for (const [first, second] of phrases) {
        const identifier = `${first}${separator}${second}`;
        const config = clone(base);
        field.set(config, identifier);
        const result = F.fdEditionValidateConfig(
          config, indexFor(config), context('ms3', base.createdAgainstCoreRevision)
        );
        assert.ok(result.warnings.some((finding) =>
          finding.code === 'EDITION_TEXT_RISK' && finding.path === field.path && finding.blocking === false
        ), `${field.label}: ${identifier}`);
        assertPrivateSafe(result, identifier);
      }
    }

    const benign = clone(base);
    field.set(benign, 'local:orientation-guide_2');
    const benignResult = F.fdEditionValidateConfig(
      benign, indexFor(benign), context('ms3', base.createdAgainstCoreRevision)
    );
    assert.equal(benignResult.ok, true, field.label);
    assert.deepEqual(benignResult.warnings, [], field.label);
  }
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

test('brands only exact validated envelopes and preserves an immutable canonical storage snapshot', async () => {
  const config = fixture('valid-ms3.json').config;
  const idx = indexFor(config);
  const ctx = context('ms3', config.createdAgainstCoreRevision);
  const created = await F.fdEditionCreateEnvelope(config, idx, ctx, webcrypto.subtle);
  const validated = await F.fdEditionValidateEnvelope(created.envelope, idx, ctx, webcrypto.subtle);
  for (const result of [created, validated]) {
    const snapshot = F.fdEditionTrustedSnapshot(result);
    assert.ok(snapshot);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(snapshot.envelope), true);
    assert.equal(snapshot.canonicalEnvelope, F.fdEditionCanonicalJson(snapshot.envelope));
    assert.equal(Reflect.set(result.envelope.config.card, 'locationCode', 'MMC'), false);
    assert.equal(F.fdEditionTrustedSnapshot(result).canonicalEnvelope, snapshot.canonicalEnvelope);
  }
  const fabricated = structuredClone(created);
  fabricated.envelope.format = 'other-format';
  assert.equal(F.fdEditionTrustedSnapshot(fabricated), null);
  assert.equal(F.fdEditionTrustedSnapshot({ ...created }), null);
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

test('normalizes synchronous, rejected, and malformed crypto outcomes to safe digest failures', async () => {
  const config = fixture('valid-ms3.json').config;
  const idx = indexFor(config);
  const ctx = context('ms3', config.createdAgainstCoreRevision);
  const valid = await F.fdEditionCreateEnvelope(config, idx, ctx, webcrypto.subtle);
  const failures = [
    { digest() { throw new Error('synthetic failure detail'); } },
    { digest() { return Promise.reject(new Error('synthetic failure detail')); } },
    { digest() { return Promise.resolve(new ArrayBuffer(31)); } },
    { digest() { return Promise.resolve('malformed fulfillment'); } }
  ];

  for (const subtle of failures) {
    let digestPromise;
    assert.doesNotThrow(() => {
      digestPromise = F.fdEditionDigest({ format: 'synthetic' }, subtle);
    });
    await assert.rejects(digestPromise, (error) => {
      assert.equal(error.message, 'SHA-256 digest failed.');
      assert.doesNotMatch(error.message, /synthetic failure detail/i);
      return true;
    });

    const created = await F.fdEditionCreateEnvelope(config, idx, ctx, subtle);
    assert.equal(created.ok, false);
    assert.ok(created.errors.some((finding) => finding.code === 'EDITION_DIGEST'));
    assertPrivateSafe(created, 'synthetic failure detail');

    const validated = await F.fdEditionValidateEnvelope(valid.envelope, idx, ctx, subtle);
    assert.equal(validated.ok, false);
    assert.ok(validated.errors.some((finding) => finding.code === 'EDITION_DIGEST'));
    assertPrivateSafe(validated, 'synthetic failure detail');
  }
});

test('direct digest masks every hostile provider-result inspection and coercion trap', async () => {
  const privateDetail = 'provider-private-detail';
  const hostileFulfillments = [
    new Proxy(new ArrayBuffer(32), {
      getPrototypeOf() { throw new Error(privateDetail); }
    }),
    new Proxy(new ArrayBuffer(32), {
      get(target, key, receiver) {
        if (key === 'byteLength') throw new Error(privateDetail);
        return Reflect.get(target, key, receiver);
      }
    }),
    new Proxy(new ArrayBuffer(32), {
      get(target, key, receiver) {
        if (key === 'byteLength') return 32;
        if (key === 'length') throw new Error(privateDetail);
        return Reflect.get(target, key, receiver);
      }
    }),
    Object.create(ArrayBuffer.prototype)
  ];

  for (const fulfillment of hostileFulfillments) {
    await assert.rejects(
      F.fdEditionDigest({ format: 'synthetic' }, { digest() { return Promise.resolve(fulfillment); } }),
      (error) => {
        assert.equal(error.message, 'SHA-256 digest failed.');
        assert.doesNotMatch(error.message, /provider-private-detail|proxy|receiver/i);
        return true;
      }
    );
  }

  const coercionTraps = [
    { get digest() { throw new Error(privateDetail); } },
    { digest() { return { get then() { throw new Error(privateDetail); } }; } }
  ];
  for (const subtle of coercionTraps) {
    await assert.rejects(F.fdEditionDigest({ format: 'synthetic' }, subtle), (error) => {
      assert.equal(error.message, 'SHA-256 digest failed.');
      assert.doesNotMatch(error.message, /provider-private-detail|proxy|receiver/i);
      return true;
    });
  }
});

test('digest equality requires exact 32-byte digests and fingerprints use first 30 bits', () => {
  const abc = 'sha256-ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0';
  assert.equal(F.fdEditionDigestEqual(abc, abc), true);
  assert.equal(F.fdEditionDigestEqual(abc, abc.slice(0, -1) + 'A'), false);
  assert.equal(F.fdEditionDigestEqual('sha256-short', 'sha256-short'), false);
  assert.equal(F.fdEditionFingerprint({ audience: 'ms3', card: { locationCode: 'bhu2' } }, abc), 'BHU2-MS3-Q9W1DF');
});

test('fingerprints normalize valid location codes and reject invalid or hostile public prefixes', () => {
  const digest = 'sha256-ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0';
  for (const [locationCode, prefix] of [
    ['ab', 'AB'],
    ['abcd1234', 'ABCD1234'],
    [' bhu2 ', 'BHU2']
  ]) {
    assert.equal(
      F.fdEditionFingerprint({ audience: 'ms3', card: { locationCode } }, digest),
      `${prefix}-MS3-Q9W1DF`,
      locationCode
    );
  }

  for (const locationCode of [
    '', 'A', 'ABCDEFGHI', 'AB-CD', 'AB_CD', 'AB CD', 'BH\u00dc2',
    'private@example.edu', 'patient-identifier'
  ]) {
    assert.equal(
      F.fdEditionFingerprint({ audience: 'ms3', card: { locationCode } }, digest),
      '',
      locationCode
    );
  }

  let getterReads = 0;
  const accessorConfig = { audience: 'ms3', card: {} };
  Object.defineProperty(accessorConfig.card, 'locationCode', {
    enumerable: true,
    get() { getterReads += 1; return 'private@example.edu'; }
  });
  const accessorAudience = { card: { locationCode: 'BHU2' } };
  Object.defineProperty(accessorAudience, 'audience', {
    enumerable: true,
    get() { getterReads += 1; return 'ms3'; }
  });
  const hostileCard = new Proxy({}, {
    getOwnPropertyDescriptor() { throw new Error('private-wrapper-detail'); }
  });
  const hostileLocation = new Proxy(new String('BHU2'), {
    get() { throw new Error('private-wrapper-detail'); },
    getOwnPropertyDescriptor() { throw new Error('private-wrapper-detail'); }
  });

  for (const config of [
    accessorConfig,
    accessorAudience,
    { audience: 'ms3', card: hostileCard },
    { audience: 'ms3', card: { locationCode: hostileLocation } }
  ]) {
    let fingerprint;
    assert.doesNotThrow(() => { fingerprint = F.fdEditionFingerprint(config, digest); });
    assert.equal(fingerprint, '');
    assert.doesNotMatch(fingerprint, /private/i);
  }
  assert.equal(getterReads, 0);
});

test('payload decoding rejects malformed UTF-8, trailing parameters, oversize URLs, and bad envelopes', async () => {
  const config = fixture('valid-ms3.json').config;
  const idx = indexFor(config);
  const ctx = context('ms3', config.createdAgainstCoreRevision);
  const made = await F.fdEditionCreateEnvelope(config, idx, ctx, webcrypto.subtle);
  assert.equal((await F.fdEditionDecodePayload(made.payload, idx, ctx, webcrypto.subtle, 16000)).ok, true);

  const cases = [
    [made.payload, 16001, 'EDITION_URL'],
    [made.payload, -1, 'EDITION_URL'],
    [made.payload, 1.5, 'EDITION_URL'],
    [made.payload, made.payload.length - 1, 'EDITION_URL'],
    ['A'.repeat(16001), 1, 'EDITION_URL'],
    [`${made.payload}&other=1`, made.payload.length + 20, 'EDITION_SCHEMA'],
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

test('diagnostics expose only bounded integer schema versions without invoking accessors', () => {
  const ctx = { coreRevision: '1234567890abcdef1234567890abcdef12345678' };
  const privateValue = 'synthetic-private-version';
  const malformed = [
    privateValue,
    { privateValue },
    NaN,
    Infinity,
    1.5,
    -1,
    2147483648
  ];
  for (const schemaVersion of malformed) {
    const diagnostic = F.fdEditionDiagnostic({ envelope: { schemaVersion }, errors: [] }, ctx);
    assert.equal(diagnostic.schemaVersion, null);
    assert.doesNotMatch(JSON.stringify(diagnostic), /synthetic-private-version/);
  }

  let getterReads = 0;
  const envelope = {};
  Object.defineProperty(envelope, 'schemaVersion', {
    enumerable: true,
    get() { getterReads += 1; return privateValue; }
  });
  const accessorDiagnostic = F.fdEditionDiagnostic({ envelope, errors: [] }, ctx);
  assert.equal(accessorDiagnostic.schemaVersion, null);
  assert.equal(getterReads, 0);
  assert.doesNotMatch(JSON.stringify(accessorDiagnostic), /synthetic-private-version/);

  assert.equal(F.fdEditionDiagnostic({ envelope: { schemaVersion: 2 }, errors: [] }, ctx).schemaVersion, 2);
  assert.equal(F.fdEditionDiagnostic({ errors: [] }, ctx).schemaVersion, null);
});
