import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createReceiptCodec,
  credentialHash,
  receiptBinding,
  validReceiptPayload,
} from '../netlify/functions/_shared/sp-realtime-receipt.mjs';

const SECRET = '0123456789abcdef0123456789abcdef';
const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const CREDENTIAL = credentialHash('student-secret');
function binding(overrides = {}) {
  return receiptBinding({
    caseId: 'sp_depression_gated_si_001',
    packHash: 'ab'.repeat(32),
    origin: 'https://learn.example.test',
    rotationId: 'rotation-2026-09',
    credentialHash: CREDENTIAL,
    ...overrides,
  });
}
const BINDING = binding();

function payload(overrides = {}) {
  return {
    v: 1,
    encounterId: 'AAAAAAAAAAAAAAAAAAAAAA',
    caseId: 'sp_depression_gated_si_001',
    callId: 'rtc_0123456789abcdef',
    sid: 'a'.repeat(32),
    turn: 0,
    startedAt: NOW,
    deadline: NOW + 15 * 60 * 1000,
    ...overrides,
  };
}

function codec(overrides = {}) {
  return createReceiptCodec({ secret: SECRET, clock: () => NOW, ...overrides });
}

test('a sealed receipt opens under its own binding and nowhere else', () => {
  const c = codec();
  const token = c.seal(payload(), { binding: BINDING });
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.deepEqual(c.open(token, { binding: BINDING }), payload());
  for (const other of [
    binding({ caseId: 'sp_mania_redirect_001' }),
    binding({ packHash: 'cd'.repeat(32) }),
    binding({ origin: 'https://evil.example.test' }),
    binding({ rotationId: 'rotation-2026-10' }),
    // An emergency passcode replacement fails every outstanding receipt closed.
    binding({ credentialHash: credentialHash('replaced-passcode') }),
  ]) {
    assert.throws(() => c.open(token, { binding: other }), { status: 400, code: 'invalid_realtime_receipt' });
  }
});

test('the receipt carries no dialogue and every byte is authenticated', () => {
  const c = codec();
  const token = c.seal(payload(), { binding: BINDING });
  const raw = Buffer.from(token, 'base64url');
  assert.ok(!raw.toString('latin1').includes('sp_depression'), 'the payload is not visible in the token');
  for (const offset of [0, 12, 30, raw.length - 1]) {
    const tampered = Buffer.from(raw);
    tampered[offset] ^= 0x01;
    assert.throws(() => c.open(tampered.toString('base64url'), { binding: BINDING }), { code: 'invalid_realtime_receipt' });
  }
  assert.throws(() => c.open('short', { binding: BINDING }), { code: 'invalid_realtime_receipt' });
  assert.throws(() => c.open(`${token}!`, { binding: BINDING }), { code: 'invalid_realtime_receipt' });
  assert.throws(() => c.open(42, { binding: BINDING }), { code: 'invalid_realtime_receipt' });
});

test('an expired receipt is 410, with the deadline inclusive', () => {
  const token = codec().seal(payload(), { binding: BINDING });
  const at = (time) => codec({ clock: () => time });
  assert.doesNotThrow(() => at(NOW + 15 * 60 * 1000 - 1).open(token, { binding: BINDING }));
  assert.throws(() => at(NOW + 15 * 60 * 1000).open(token, { binding: BINDING }), { status: 410, code: 'realtime_session_expired' });
});

test('a different secret cannot open a receipt', () => {
  const token = codec().seal(payload(), { binding: BINDING });
  const other = createReceiptCodec({ secret: 'fedcba9876543210fedcba9876543210', clock: () => NOW });
  assert.throws(() => other.open(token, { binding: BINDING }), { code: 'invalid_realtime_receipt' });
});

test('sealing refuses an invalid payload rather than minting a bad receipt', () => {
  const c = codec();
  const bad = [
    payload({ v: 2 }),
    payload({ encounterId: 'too-short' }),
    payload({ caseId: '' }),
    payload({ caseId: ' padded' }),
    payload({ callId: 'has space' }),
    payload({ sid: 'not-hex' }),
    payload({ turn: -1 }),
    payload({ turn: 41 }),
    payload({ turn: 1.5 }),
    payload({ deadline: NOW }),
    payload({ deadline: NOW + 3 * 60 * 60 * 1000 }),
    { ...payload(), extra: true },
  ];
  for (const value of bad) {
    assert.equal(validReceiptPayload(value, { maxTurns: 40 }), false);
    assert.throws(() => c.seal(value, { binding: BINDING }), { status: 500, code: 'invalid_configuration' });
  }
  assert.throws(() => c.seal(payload(), {}), { code: 'invalid_configuration' });
  assert.throws(() => c.seal(payload(), { binding: '' }), { code: 'invalid_configuration' });
});

test('the turn bound follows the codec configuration', () => {
  const c = codec({ maxTurns: 3 });
  assert.doesNotThrow(() => c.seal(payload({ turn: 3 }), { binding: BINDING }));
  assert.throws(() => c.seal(payload({ turn: 4 }), { binding: BINDING }), { code: 'invalid_configuration' });
  // A receipt minted under a looser bound is refused by a stricter reader.
  const loose = codec({ maxTurns: 40 }).seal(payload({ turn: 10 }), { binding: BINDING });
  assert.throws(() => c.open(loose, { binding: BINDING }), { code: 'invalid_realtime_receipt' });
});

test('configuration fails closed', () => {
  assert.throws(() => createReceiptCodec({ secret: 'short' }), { code: 'invalid_configuration' });
  assert.throws(() => createReceiptCodec({ secret: SECRET, clock: 'now' }), { code: 'invalid_configuration' });
  assert.throws(() => createReceiptCodec({ secret: SECRET, maxTurns: 0 }), { code: 'invalid_configuration' });
  assert.throws(() => binding({ packHash: '' }), { code: 'invalid_configuration' });
  assert.throws(() => binding({ caseId: 'x\n' }), { code: 'invalid_configuration' });
  assert.throws(() => binding({ credentialHash: 'not-a-digest' }), { code: 'invalid_configuration' });
  assert.throws(() => credentialHash(''), { code: 'invalid_configuration' });
});

test('two seals of the same payload differ (fresh IV) and both open', () => {
  const c = codec();
  const a = c.seal(payload(), { binding: BINDING });
  const b = c.seal(payload(), { binding: BINDING });
  assert.notEqual(a, b);
  assert.deepEqual(c.open(a, { binding: BINDING }), c.open(b, { binding: BINDING }));
});
