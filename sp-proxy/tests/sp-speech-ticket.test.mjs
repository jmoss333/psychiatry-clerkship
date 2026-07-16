import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';

import {
  createRedemptionLedger,
  createTicketCodec,
  spokenText,
} from '../netlify/functions/_shared/sp-speech-ticket.mjs';
import { createFakeBlobStore } from './helpers/fake-blob-store.mjs';

const SECRET = '0123456789abcdef0123456789abcdef';
const NOW_MS = Date.parse('2026-07-14T12:00:00.000Z');
const REPLY = '*looks away*  I do not know.\n\n*long pause* Please give me a moment.';

const TICKET_INPUT = Object.freeze({
  rotationId: 'rotation-2026-07-a',
  encounterId: 'encounter-7',
  turnId: 3,
  caseId: 'case-reviewed',
  packHash: 'ab'.repeat(32),
  attestationHash: 'cd'.repeat(32),
  profileHash: 'ef'.repeat(32),
  profileVersion: 2,
  provider: 'openai',
  model: 'tts-1-hd',
  voiceId: 'alloy',
  reply: REPLY,
});
const OPENING_INPUT = Object.freeze({ ...TICKET_INPUT, turnId: 0 });

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function decodedTicket(ticket) {
  return JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8'));
}

function fixedRandomBytes(size) {
  assert.equal(size, 16);
  return Buffer.from(Array.from({ length: size }, (_, index) => index));
}

function assertOperationalError(error, { status, code, message }) {
  assert.equal(error?.status, status);
  assert.equal(error?.code, code);
  assert.equal(error?.message, message);
  return true;
}

function expectedBindings(overrides = {}) {
  const { reply: _reply, ...bindings } = TICKET_INPUT;
  return { ...bindings, ...overrides };
}

function createFixedCodec(clockRef = { now: NOW_MS }) {
  return createTicketCodec({
    secret: SECRET,
    clock: () => clockRef.now,
    randomBytes: fixedRandomBytes,
  });
}

test('ticket round-trip binds every field, uses a 16-byte JTI, and expires after exactly 120 seconds', () => {
  const codec = createFixedCodec();
  const ticket = codec.issue(TICKET_INPUT);
  const authenticated = codec.authenticate({
    ticket,
    reply: REPLY,
  });
  assert.equal(Object.isFrozen(authenticated), true);
  assert.throws(() => { authenticated.caseId = 'tampered-after-auth'; }, TypeError);
  const payload = codec.assertBindings({
    payload: authenticated,
    expected: expectedBindings(),
  });
  assert.strictEqual(payload, authenticated);
  assert.deepEqual(codec.verify({
    ticket,
    reply: REPLY,
    expected: expectedBindings(),
  }), authenticated);

  assert.deepEqual(Object.keys(payload).sort(), [
    'attestationHash',
    'caseId',
    'encounterId',
    'exp',
    'iat',
    'jti',
    'model',
    'packHash',
    'profileHash',
    'profileVersion',
    'provider',
    'replyHash',
    'rotationId',
    'schemaVersion',
    'turnId',
    'voiceId',
  ]);
  assert.deepEqual(payload, {
    schemaVersion: 1,
    rotationId: TICKET_INPUT.rotationId,
    encounterId: TICKET_INPUT.encounterId,
    turnId: TICKET_INPUT.turnId,
    jti: Buffer.from(Array.from({ length: 16 }, (_, index) => index)).toString('base64url'),
    caseId: TICKET_INPUT.caseId,
    packHash: TICKET_INPUT.packHash,
    attestationHash: TICKET_INPUT.attestationHash,
    profileHash: TICKET_INPUT.profileHash,
    profileVersion: TICKET_INPUT.profileVersion,
    provider: TICKET_INPUT.provider,
    model: TICKET_INPUT.model,
    voiceId: TICKET_INPUT.voiceId,
    replyHash: sha256(REPLY),
    iat: Math.floor(NOW_MS / 1000),
    exp: Math.floor(NOW_MS / 1000) + 120,
  });
  assert.equal(Buffer.from(payload.jti, 'base64url').byteLength, 16);
  assert.match(ticket, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('stable opening tickets use the exact domain-separated HMAC identity across issue times', () => {
  const clockRef = { now: NOW_MS };
  let randomCalls = 0;
  const codec = createTicketCodec({
    secret: SECRET,
    clock: () => clockRef.now,
    randomBytes() { randomCalls += 1; throw new Error('stable opening must not use randomness'); },
  });
  const first = decodedTicket(codec.issueStableOpening(OPENING_INPUT));
  clockRef.now += 1_000;
  const second = decodedTicket(codec.issueStableOpening(OPENING_INPUT));

  const replyHash = sha256(OPENING_INPUT.reply);
  const identity = JSON.stringify({
    rotationId: OPENING_INPUT.rotationId,
    encounterId: OPENING_INPUT.encounterId,
    turnId: 0,
    caseId: OPENING_INPUT.caseId,
    packHash: OPENING_INPUT.packHash,
    attestationHash: OPENING_INPUT.attestationHash,
    profileHash: OPENING_INPUT.profileHash,
    profileVersion: OPENING_INPUT.profileVersion,
    provider: OPENING_INPUT.provider,
    model: OPENING_INPUT.model,
    voiceId: OPENING_INPUT.voiceId,
    replyHash,
  });
  const expectedJti = createHmac('sha256', SECRET)
    .update('sp-speech-ticket/opening-jti/v1\0', 'utf8')
    .update(identity, 'utf8')
    .digest()
    .subarray(0, 16)
    .toString('base64url');

  assert.equal(first.jti, expectedJti);
  assert.equal(second.jti, expectedJti);
  assert.notEqual(first.iat, second.iat);
  assert.equal(first.turnId, 0);
  assert.equal(first.replyHash, replyHash);
  assert.equal(randomCalls, 0);
  assert.equal(Buffer.from(first.jti, 'base64url').byteLength, 16);
});

test('stable opening identity rotates on every governed binding while converse JTIs stay random', () => {
  let sequence = 0;
  const codec = createTicketCodec({
    secret: SECRET,
    clock: () => NOW_MS,
    randomBytes(size) {
      assert.equal(size, 16);
      sequence += 1;
      return Buffer.alloc(size, sequence);
    },
  });
  const stable = decodedTicket(codec.issueStableOpening(OPENING_INPUT)).jti;
  const mutations = {
    rotationId: 'rotation-2026-07-b',
    encounterId: 'encounter-8',
    caseId: 'case-reviewed-second',
    packHash: '11'.repeat(32),
    attestationHash: '22'.repeat(32),
    profileHash: '33'.repeat(32),
    profileVersion: 3,
    provider: 'elevenlabs',
    model: 'eleven_v3',
    voiceId: 'another-stock-voice',
    reply: `${OPENING_INPUT.reply} Changed.`,
  };
  for (const [field, value] of Object.entries(mutations)) {
    const changed = decodedTicket(codec.issueStableOpening({
      ...OPENING_INPUT,
      [field]: value,
    })).jti;
    assert.notEqual(changed, stable, field);
  }

  const ordinaryOne = decodedTicket(codec.issue(TICKET_INPUT)).jti;
  const ordinaryTwo = decodedTicket(codec.issue(TICKET_INPUT)).jti;
  assert.notEqual(ordinaryOne, ordinaryTwo);
});

test('stable opening issuance accepts only exact turn-zero server bindings', () => {
  const codec = createFixedCodec();
  for (const invalid of [
    { ...OPENING_INPUT, turnId: 1 },
    { ...OPENING_INPUT, replyHash: sha256(OPENING_INPUT.reply) },
    { ...OPENING_INPUT, extra: true },
    { ...OPENING_INPUT, reply: null },
  ]) {
    assert.throws(
      () => codec.issueStableOpening(invalid),
      (error) => assertOperationalError(error, {
        status: 403,
        code: 'invalid_speech_ticket',
        message: 'The speech ticket is invalid.',
      }),
    );
  }
});

test('authentication precedes expected-case binding and returns no secret-bearing details', () => {
  const codec = createFixedCodec();
  const ticket = codec.issue(TICKET_INPUT);
  const payload = codec.authenticate({ ticket, reply: REPLY });
  assert.equal(payload.caseId, TICKET_INPUT.caseId);
  assert.strictEqual(
    codec.assertBindings({ payload, expected: expectedBindings() }),
    payload,
  );

  assert.throws(
    () => codec.assertBindings({
      payload,
      expected: expectedBindings({ caseId: 'different-case' }),
    }),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'invalid_speech_ticket',
      message: 'The speech ticket is invalid.',
    }),
  );

  assert.throws(
    () => codec.authenticate({ ticket, reply: `${REPLY} altered ${SECRET}` }),
    (error) => {
      assertOperationalError(error, {
        status: 403,
        code: 'invalid_speech_ticket',
        message: 'The speech ticket is invalid.',
      });
      assert.equal(error.message.includes(SECRET), false);
      assert.equal(error.message.includes(REPLY), false);
      return true;
    },
  );
});

test('ticket validity uses now < exp: exp minus one millisecond passes and equality expires', () => {
  const clockRef = { now: NOW_MS };
  const codec = createFixedCodec(clockRef);
  const ticket = codec.issue(TICKET_INPUT);
  const expMs = (Math.floor(NOW_MS / 1000) + 120) * 1000;

  clockRef.now = expMs - 1;
  assert.equal(codec.verify({
    ticket,
    reply: REPLY,
    expected: expectedBindings(),
  }).caseId, TICKET_INPUT.caseId);

  clockRef.now = expMs;
  assert.throws(
    () => codec.verify({ ticket, reply: REPLY, expected: expectedBindings() }),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'speech_ticket_expired',
      message: 'The speech ticket has expired.',
    }),
  );
});

test('tampered payloads and signatures fail with the stable invalid ticket error', () => {
  const codec = createFixedCodec();
  const ticket = codec.issue(TICKET_INPUT);
  const [encodedPayload, signature] = ticket.split('.');
  const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  parsed.turnId += 1;
  const tamperedPayload = `${Buffer.from(JSON.stringify(parsed)).toString('base64url')}.${signature}`;
  const tamperedSignature = `${encodedPayload}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;

  for (const candidate of [tamperedPayload, tamperedSignature, 'not-a-ticket', '', null]) {
    assert.throws(
      () => codec.verify({ ticket: candidate, reply: REPLY, expected: expectedBindings() }),
      (error) => assertOperationalError(error, {
        status: 403,
        code: 'invalid_speech_ticket',
        message: 'The speech ticket is invalid.',
      }),
    );
  }
});

test('non-canonical base64url aliases of the same HMAC are rejected', () => {
  const codec = createFixedCodec();
  const ticket = codec.issue(TICKET_INPUT);
  const [encodedPayload, signature] = ticket.split('.');
  const decoded = Buffer.from(signature, 'base64url');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const alias = [...alphabet]
    .map((character) => `${signature.slice(0, -1)}${character}`)
    .find((candidate) => candidate !== signature && Buffer.from(candidate, 'base64url').equals(decoded));
  assert.ok(alias, 'fixture must find an alternate encoding of the same HMAC bytes');

  assert.throws(
    () => codec.verify({
      ticket: `${encodedPayload}.${alias}`,
      reply: REPLY,
      expected: expectedBindings(),
    }),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'invalid_speech_ticket',
      message: 'The speech ticket is invalid.',
    }),
  );
});

test('the reply digest covers exact UTF-8 actor text before stage stripping', () => {
  const codec = createFixedCodec();
  const ticket = codec.issue(TICKET_INPUT);
  for (const alteredReply of [
    spokenText(REPLY),
    REPLY.replace('  ', ' '),
    `${REPLY} `,
    REPLY.replace('*looks away*', '*looks down*'),
  ]) {
    assert.throws(
      () => codec.verify({
        ticket,
        reply: alteredReply,
        expected: expectedBindings(),
      }),
      (error) => assertOperationalError(error, {
        status: 403,
        code: 'invalid_speech_ticket',
        message: 'The speech ticket is invalid.',
      }),
    );
  }
});

test('wrong rotation, encounter, turn, case, pack, attestation, profile, provider, model, or voice fails', () => {
  const codec = createFixedCodec();
  const ticket = codec.issue(TICKET_INPUT);
  const changes = {
    rotationId: 'another-rotation',
    encounterId: 'another-encounter',
    turnId: 4,
    caseId: 'another-case',
    packHash: '11'.repeat(32),
    attestationHash: '22'.repeat(32),
    profileHash: '33'.repeat(32),
    profileVersion: 3,
    provider: 'another-provider',
    model: 'another-model',
    voiceId: 'another-voice',
  };

  for (const [field, value] of Object.entries(changes)) {
    assert.throws(
      () => codec.verify({
        ticket,
        reply: REPLY,
        expected: expectedBindings({ [field]: value }),
      }),
      (error) => assertOperationalError(error, {
        status: 403,
        code: 'invalid_speech_ticket',
        message: 'The speech ticket is invalid.',
      }),
      field,
    );
  }
});

test('ticket hash bindings must be primitive strings when tickets are issued and verified', () => {
  const hashFields = ['packHash', 'attestationHash', 'profileHash'];
  const wrappedHash = (value) => ({
    toString: () => value,
    toJSON: () => value,
  });
  const codec = createFixedCodec();
  const ticket = codec.issue(TICKET_INPUT);

  for (const field of hashFields) {
    for (const value of [[TICKET_INPUT[field]], wrappedHash(TICKET_INPUT[field])]) {
      assert.throws(
        () => codec.issue({ ...TICKET_INPUT, [field]: value }),
        (error) => assertOperationalError(error, {
          status: 403,
          code: 'invalid_speech_ticket',
          message: 'The speech ticket is invalid.',
        }),
        `issue ${field}`,
      );
    }

    assert.throws(
      () => codec.verify({
        ticket,
        reply: REPLY,
        expected: expectedBindings({ [field]: wrappedHash(TICKET_INPUT[field]) }),
      }),
      (error) => assertOperationalError(error, {
        status: 403,
        code: 'invalid_speech_ticket',
        message: 'The speech ticket is invalid.',
      }),
      `verify ${field}`,
    );
  }
});

test('ticket secrets require at least 32 UTF-8 bytes', () => {
  assert.throws(
    () => createTicketCodec({
      secret: 'x'.repeat(31),
      clock: () => NOW_MS,
      randomBytes: fixedRandomBytes,
    }),
    (error) => assertOperationalError(error, {
      status: 500,
      code: 'invalid_configuration',
      message: 'The speech ticket secret must contain at least 32 bytes.',
    }),
  );
  assert.doesNotThrow(() => createTicketCodec({
    secret: '🙂'.repeat(8),
    clock: () => NOW_MS,
    randomBytes: fixedRandomBytes,
  }));
});

test('spokenText removes only complete asterisk-delimited spans and normalizes whitespace', () => {
  assert.equal(
    spokenText('*looks away*  I do not know.\n\n*long pause* Please give me a moment.'),
    'I do not know. Please give me a moment.',
  );
  assert.equal(spokenText('  Keep punctuation — exactly, please!  '), 'Keep punctuation — exactly, please!');
  assert.equal(spokenText('The value is 2 * 3 and the marker stays.'), 'The value is 2 * 3 and the marker stays.');
  assert.equal(spokenText('*silence* *looks down*'), '');
});

test('ten concurrent claims use strong reads to yield one owner and nine stable in-progress errors', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const fake = createFakeBlobStore({ nonStrongReadsReturnNull: true });
  const ledger = createRedemptionLedger({
    store: fake.store,
    namespace: 'test',
    clock: () => NOW_MS,
    maxCasAttempts: 5,
  });

  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => ledger.claim({
      ...payload,
      ticket: 'must-not-persist',
      reply: 'must-not-persist',
      audio: 'must-not-persist',
      transcript: 'must-not-persist',
      error: 'must-not-persist',
    })),
  );
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 9);
  for (const result of rejected) {
    assertOperationalError(result.reason, {
      status: 409,
      code: 'speech_in_progress',
      message: 'Speech generation is already in progress.',
    });
  }

  const expectedKey = `test/speech-redemptions/${sha256(payload.jti)}`;
  assert.deepEqual(fulfilled[0].value, {
    key: expectedKey,
    etag: fake.etag(expectedKey),
    status: 'in_progress',
    expiresAt: payload.exp,
  });
  assert.equal(expectedKey.includes(payload.jti), false);
  assert.deepEqual(fake.read(expectedKey), {
    schemaVersion: 1,
    status: 'in_progress',
    expiresAt: payload.exp,
    claimedAt: Math.floor(NOW_MS / 1000),
    completedAt: null,
    usage: null,
  });
  const newWrites = fake.calls.filter((call) => call.method === 'set');
  assert.equal(newWrites.length, 10);
  assert.equal(newWrites.every((call) => call.options.onlyIfNew === true), true);
  assert.equal(newWrites.every((call) => typeof call.value === 'string'), true);
  assert.equal(fake.calls.filter((call) => call.method === 'getWithMetadata').every((call) => (
    call.options.consistency === 'strong'
  )), true);
});

test('completion uses the claim ETag, stores only content-free metadata, and makes later claims terminal', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const fake = createFakeBlobStore();
  let nowMs = NOW_MS;
  const ledger = createRedemptionLedger({
    store: fake.store,
    namespace: 'test',
    clock: () => nowMs,
    maxCasAttempts: 5,
  });
  const claim = await ledger.claim(payload);
  nowMs += 5_000;
  const completed = await ledger.complete(claim, {
    status: 'succeeded',
    usage: { unit: 'synthesis_characters', quantity: 64 },
  });

  assert.deepEqual(completed, {
    key: claim.key,
    etag: fake.etag(claim.key),
    status: 'succeeded',
    expiresAt: payload.exp,
  });
  const stored = fake.read(claim.key);
  assert.deepEqual(Object.keys(stored).sort(), [
    'claimedAt',
    'completedAt',
    'expiresAt',
    'schemaVersion',
    'status',
    'usage',
  ]);
  assert.deepEqual(stored, {
    schemaVersion: 1,
    status: 'succeeded',
    expiresAt: payload.exp,
    claimedAt: Math.floor(NOW_MS / 1000),
    completedAt: Math.floor(nowMs / 1000),
    usage: { unit: 'synthesis_characters', quantity: 64 },
  });
  const serialized = JSON.stringify(stored);
  for (const prohibited of [
    payload.jti,
    'must-not-persist',
    payload.replyHash,
    payload.caseId,
    payload.encounterId,
    REPLY,
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }

  const completionWrite = fake.calls.filter((call) => (
    call.method === 'set' && call.options.onlyIfMatch !== undefined
  ));
  assert.equal(completionWrite.length, 1);
  assert.equal(completionWrite[0].options.onlyIfMatch, claim.etag);

  const laterClaims = await Promise.allSettled(
    Array.from({ length: 10 }, () => ledger.claim(payload)),
  );
  assert.equal(laterClaims.every((result) => result.status === 'rejected'), true);
  for (const result of laterClaims) {
    assertOperationalError(result.reason, {
      status: 409,
      code: 'speech_already_redeemed',
      message: 'This speech ticket has already been redeemed.',
    });
  }
});

test('completion retries transient conflicts only while the owning ETag is unchanged', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const fake = createFakeBlobStore({
    onlyIfMatchConflicts: 2,
    nonStrongReadsReturnNull: true,
  });
  const ledger = createRedemptionLedger({
    store: fake.store,
    namespace: 'test',
    clock: () => NOW_MS,
    maxCasAttempts: 5,
  });
  const claim = await ledger.claim(payload);
  const first = await ledger.complete(claim, { status: 'provider_failed', usage: null });
  assert.equal(first.status, 'provider_failed');
  assert.equal(fake.calls.filter((call) => (
    call.method === 'set' && call.options.onlyIfMatch !== undefined
  )).length, 3);

  const again = await ledger.complete(claim, {
    status: 'succeeded',
    usage: { unit: 'synthesis_characters', quantity: 12 },
  });
  assert.deepEqual(again, {
    key: claim.key,
    etag: fake.etag(claim.key),
    status: 'provider_failed',
    expiresAt: payload.exp,
  });
  const conditionalWrites = fake.calls.filter((call) => (
    call.method === 'set' && call.options.onlyIfMatch !== undefined
  ));
  assert.equal(conditionalWrites.every((call) => call.options.onlyIfMatch === claim.etag), true);
});

test('a forged or stale claim ETag cannot terminalize a real in-progress claim', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const fake = createFakeBlobStore();
  const ledger = createRedemptionLedger({
    store: fake.store,
    namespace: 'test',
    clock: () => NOW_MS,
    maxCasAttempts: 5,
  });
  const claim = await ledger.claim(payload);

  await assert.rejects(
    ledger.complete({ ...claim, etag: 'forged-stale-etag' }, {
      status: 'succeeded',
      usage: { unit: 'synthesis_characters', quantity: 64 },
    }),
    (error) => assertOperationalError(error, {
      status: 503,
      code: 'redemption_unavailable',
      message: 'Speech ticket redemption is temporarily unavailable.',
    }),
  );
  assert.equal(fake.read(claim.key).status, 'in_progress');
  assert.equal(fake.etag(claim.key), claim.etag);
});

test('bounded conditional-write conflicts and unavailable storage fail with redemption_unavailable', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const conflictFake = createFakeBlobStore({ onlyIfMatchConflicts: 5 });
  const conflictLedger = createRedemptionLedger({
    store: conflictFake.store,
    namespace: 'test',
    clock: () => NOW_MS,
    maxCasAttempts: 5,
  });
  const claim = await conflictLedger.claim(payload);
  await assert.rejects(
    conflictLedger.complete(claim, {
      status: 'succeeded',
      usage: { unit: 'synthesis_characters', quantity: 1 },
    }),
    (error) => assertOperationalError(error, {
      status: 503,
      code: 'redemption_unavailable',
      message: 'Speech ticket redemption is temporarily unavailable.',
    }),
  );
  assert.equal(conflictFake.calls.filter((call) => (
    call.method === 'set' && call.options.onlyIfMatch !== undefined
  )).length, 5);

  const unavailable = createFakeBlobStore({ unavailable: true });
  const unavailableLedger = createRedemptionLedger({
    store: unavailable.store,
    namespace: 'test',
    clock: () => NOW_MS,
    maxCasAttempts: 5,
  });
  await assert.rejects(
    unavailableLedger.claim(payload),
    (error) => assertOperationalError(error, {
      status: 503,
      code: 'redemption_unavailable',
      message: 'Speech ticket redemption is temporarily unavailable.',
    }),
  );
});

test('a terminal write discovered on the final allowed conflict is returned idempotently', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const fake = createFakeBlobStore({
    onlyIfMatchConflicts: 5,
    terminalOnMatchConflict: 5,
    nonStrongReadsReturnNull: true,
  });
  const ledger = createRedemptionLedger({
    store: fake.store,
    namespace: 'test',
    clock: () => NOW_MS,
    maxCasAttempts: 5,
  });
  const claim = await ledger.claim(payload);

  const completed = await ledger.complete(claim, {
    status: 'succeeded',
    usage: { unit: 'synthesis_characters', quantity: 32 },
  });
  assert.deepEqual(completed, {
    key: claim.key,
    etag: fake.etag(claim.key),
    status: 'succeeded',
    expiresAt: payload.exp,
  });
  assert.equal(fake.calls.filter((call) => (
    call.method === 'set' && call.options.onlyIfMatch !== undefined
  )).length, 5);
});

test('redemption rejects expired or malformed tickets and unsafe usage metadata before writes', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const fake = createFakeBlobStore();
  let nowMs = NOW_MS;
  const ledger = createRedemptionLedger({
    store: fake.store,
    namespace: 'test',
    clock: () => nowMs,
    maxCasAttempts: 5,
  });

  nowMs = payload.exp * 1000;
  await assert.rejects(
    ledger.claim(payload),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'speech_ticket_expired',
      message: 'The speech ticket has expired.',
    }),
  );
  await assert.rejects(
    ledger.claim({ ...payload, jti: '../unsafe' }),
    (error) => assertOperationalError(error, {
      status: 403,
      code: 'invalid_speech_ticket',
      message: 'The speech ticket is invalid.',
    }),
  );
  assert.equal(fake.calls.filter((call) => call.method === 'set').length, 0);

  nowMs = NOW_MS;
  const claim = await ledger.claim(payload);
  await assert.rejects(
    ledger.complete(claim, {
      status: 'succeeded',
      usage: { unit: 'synthesis_characters', quantity: 10, reply: REPLY },
    }),
    (error) => assertOperationalError(error, {
      status: 500,
      code: 'invalid_usage_metadata',
      message: 'Redemption usage metadata must be content-free.',
    }),
  );
  assert.equal(fake.read(claim.key).status, 'in_progress');
});

test('redemption usage permits only nonnegative integer synthesis character counts', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const invalidUsages = [
    null,
    { unit: 'characters', quantity: 10 },
    { unit: 'transcript', quantity: 10 },
    { unit: 'transcript_words', quantity: 10 },
    { unit: 'synthesis_characters', quantity: -1 },
    { unit: 'synthesis_characters', quantity: 0.5 },
    { unit: 'synthesis_characters', quantity: '10' },
    { unit: 'synthesis_characters', quantity: 10, transcript: REPLY },
  ];

  for (const usage of invalidUsages) {
    const fake = createFakeBlobStore();
    const ledger = createRedemptionLedger({
      store: fake.store,
      namespace: 'test',
      clock: () => NOW_MS,
      maxCasAttempts: 5,
    });
    const claim = await ledger.claim(payload);
    await assert.rejects(
      ledger.complete(claim, { status: 'succeeded', usage }),
      (error) => assertOperationalError(error, {
        status: 500,
        code: 'invalid_usage_metadata',
        message: 'Redemption usage metadata must be content-free.',
      }),
      JSON.stringify(usage),
    );
    assert.equal(fake.read(claim.key).status, 'in_progress');
    assert.equal(fake.calls.some((call) => call.options?.onlyIfMatch), false);
  }
});

test('corrupt or contentful stored records fail before redemption classification', async () => {
  const codec = createFixedCodec();
  const payload = codec.verify({
    ticket: codec.issue(TICKET_INPUT),
    reply: REPLY,
    expected: expectedBindings(),
  });
  const corruptions = [
    ['claim timestamp at expiry', (record) => ({ ...record, claimedAt: record.expiresAt })],
    ['in-progress completion timestamp', (record) => ({ ...record, completedAt: record.claimedAt })],
    ['in-progress usage', (record) => ({
      ...record,
      usage: { unit: 'synthesis_characters', quantity: 1 },
    })],
    ['succeeded without completion', (record) => ({
      ...record,
      status: 'succeeded',
      usage: { unit: 'synthesis_characters', quantity: 1 },
    })],
    ['succeeded before claim', (record) => ({
      ...record,
      status: 'succeeded',
      completedAt: record.claimedAt - 1,
      usage: { unit: 'synthesis_characters', quantity: 1 },
    })],
    ['succeeded without usage', (record) => ({
      ...record,
      status: 'succeeded',
      completedAt: record.claimedAt,
      usage: null,
    })],
    ['transcript-like usage', (record) => ({
      ...record,
      status: 'provider_failed',
      completedAt: record.claimedAt,
      usage: { unit: 'transcript_words', quantity: 1 },
    })],
    ['contentful nested usage', (record) => ({
      ...record,
      status: 'provider_failed',
      completedAt: record.claimedAt,
      usage: { unit: 'synthesis_characters', quantity: 1, transcript: REPLY },
    })],
  ];

  for (const [label, corrupt] of corruptions) {
    const fake = createFakeBlobStore();
    const ledger = createRedemptionLedger({
      store: fake.store,
      namespace: 'test',
      clock: () => NOW_MS,
      maxCasAttempts: 5,
    });
    const claim = await ledger.claim(payload);
    fake.replace(claim.key, corrupt(fake.read(claim.key)), { etag: claim.etag });
    await assert.rejects(
      ledger.claim(payload),
      (error) => assertOperationalError(error, {
        status: 503,
        code: 'redemption_unavailable',
        message: 'Speech ticket redemption is temporarily unavailable.',
      }),
      label,
    );
  }
});

// F5 — the actor endpoint mints iat; the voice endpoint authenticates on a
// separate function clock. A sub-lease skew where the verifier lags the issuer
// must not reject an otherwise-valid fresh ticket, but a far-future iat still must.
test('authenticate tolerates small clock skew where the verifier lags the issuer, within a bound', () => {
  const clockRef = { now: NOW_MS + 3_000 };
  const codec = createFixedCodec(clockRef);
  const ticket = codec.issue(TICKET_INPUT); // iat three seconds ahead of the verifier
  clockRef.now = NOW_MS;
  const authenticated = codec.authenticate({ ticket, reply: REPLY });
  assert.equal(authenticated.iat, Math.floor((NOW_MS + 3_000) / 1000));

  // Beyond the tolerance, a future-dated ticket is still rejected.
  const farClock = { now: NOW_MS + 60_000 };
  const farCodec = createFixedCodec(farClock);
  const farTicket = farCodec.issue(TICKET_INPUT);
  farClock.now = NOW_MS;
  assert.throws(
    () => farCodec.authenticate({ ticket: farTicket, reply: REPLY }),
    (error) => error?.code === 'invalid_speech_ticket',
  );
});
