// The attestation ledger's core (faculty-console/ledger.mjs, ADR-003). Every invariant in the
// ADR's §3 has a test here that turns red if its guard is removed: forge a line, edit one,
// delete one, reorder, splice, backdate, sign with an unlisted or revoked key — each must be
// refused, and a verified ledger must change governance fields only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import {
  GENESIS_PREV,
  LedgerError,
  appendEvents,
  applyLedger,
  keyIdOf,
  loadSigner,
  parseKeys,
  questionItemHash,
  verifyLedger,
} from '../faculty-console/ledger.mjs';
import { canonicalJson } from '../faculty-console/attestation-hash.mjs';

const BASE = 'b'.repeat(40);
const HASH_A = 'a'.repeat(40);
const HASH_C = 'c'.repeat(40);

function newSigner() {
  const { privateKey } = generateKeyPairSync('ed25519');
  return loadSigner(privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'));
}

function keysFor(...signers) {
  return {
    version: 1,
    keys: signers.map(signer => ({
      keyId: signer.keyId,
      algorithm: 'ed25519',
      publicKeyPem: signer.publicKey.export({ type: 'spki', format: 'pem' }),
      addedAt: '2026-09-25',
      revokedAt: null,
    })),
  };
}

function ledgerWith(signer, drafts, { ts = '2026-09-25T12:00:00.000Z', existingText = '', keysDoc } = {}) {
  return appendEvents({
    existingText,
    keysDoc: keysDoc || keysFor(signer),
    drafts,
    ts,
    by: 'Joshua Moss, MD',
    base: BASE,
    signer,
  });
}

const attest = (id, contentHash = HASH_A) => ({ type: 'attest', kind: 'content', id, contentHash });

function refusal(fn, code) {
  assert.throws(fn, (error) => error instanceof LedgerError && error.code === code,
    `expected LedgerError ${code}`);
}

// ── L-1 / L-2 / L-3: what verifies, and everything that must not ───────────────────────────

test('an appended ledger verifies, and its head is the sha256 of the last line', () => {
  const signer = newSigner();
  const { text, head } = ledgerWith(signer, [attest('t_mood.md'), attest('ddx.md')]);
  const verified = verifyLedger(text, keysFor(signer));
  assert.equal(verified.events.length, 2);
  assert.deepEqual(verified.events.map(event => event.seq), [1, 2]);
  assert.equal(verified.events[0].prev, GENESIS_PREV);
  const lines = text.trimEnd().split('\n');
  assert.equal(verified.head.hash, createHash('sha256').update(lines[1]).digest('hex'));
  assert.equal(head.seq, 2);
  assert.equal(verifyLedger('', keysFor(signer)).head, null, 'an empty ledger is valid and empty');
});

test('appending continues the chain from the existing head', () => {
  const signer = newSigner();
  const first = ledgerWith(signer, [attest('t_mood.md')]);
  const second = ledgerWith(signer, [attest('ddx.md')], { existingText: first.text, ts: '2026-09-25T12:05:00.000Z' });
  const verified = verifyLedger(second.text, keysFor(signer));
  assert.equal(verified.events.length, 2);
  assert.equal(verified.events[1].prev, first.head.hash);
});

test('L-1: a line signed by a key not in keys.json is refused', () => {
  const trusted = newSigner();
  const intruder = newSigner();
  const { text } = ledgerWith(intruder, [attest('t_mood.md')], { keysDoc: keysFor(intruder) });
  refusal(() => verifyLedger(text, keysFor(trusted)), 'ledger.unknown_key');
});

test('L-1: editing any signed field breaks the signature', () => {
  const signer = newSigner();
  const { text } = ledgerWith(signer, [attest('t_mood.md')]);
  const event = JSON.parse(text);
  for (const [field, value] of [['contentHash', HASH_C], ['id', 'ddx.md'], ['by', 'Someone Else'],
    ['ts', '2026-09-25T12:00:01.000Z'], ['base', 'e'.repeat(40)]]) {
    const forged = `${canonicalJson({ ...event, [field]: value })}\n`;
    refusal(() => verifyLedger(forged, keysFor(signer)), 'ledger.bad_signature');
  }
});

test('L-1: re-keying a forged line to the trusted keyId still fails the signature', () => {
  const trusted = newSigner();
  const intruder = newSigner();
  const { text } = ledgerWith(intruder, [attest('t_mood.md')], { keysDoc: keysFor(intruder) });
  const event = JSON.parse(text);
  const forged = `${canonicalJson({ ...event, keyId: trusted.keyId })}\n`;
  refusal(() => verifyLedger(forged, keysFor(trusted)), 'ledger.bad_signature');
});

test('L-2: deleting, reordering, duplicating or splicing a line breaks the chain', () => {
  const signer = newSigner();
  const { text } = ledgerWith(signer, [attest('a.md'), attest('b.md'), attest('c.md')]);
  const lines = text.trimEnd().split('\n');
  const keys = keysFor(signer);
  refusal(() => verifyLedger(`${[lines[0], lines[2]].join('\n')}\n`, keys), 'ledger.chain');
  refusal(() => verifyLedger(`${[lines[1], lines[0], lines[2]].join('\n')}\n`, keys), 'ledger.chain');
  refusal(() => verifyLedger(`${[lines[0], lines[0], lines[1]].join('\n')}\n`, keys), 'ledger.chain');
  refusal(() => verifyLedger(`${[lines[1], lines[2]].join('\n')}\n`, keys), 'ledger.chain');
  // A second, independently valid ledger spliced onto the first.
  const other = ledgerWith(signer, [attest('x.md')]);
  refusal(() => verifyLedger(`${lines[0]}\n${other.text}`, keys), 'ledger.chain');
});

// Each chain check must stand on its own, not only behind its neighbour: a line that is
// correctly SIGNED but carries a wrong seq, a wrong prev, or a backdated ts — built here by
// signing raw events directly, which the console's appendEvents would never produce.
function signRaw(unsigned, signer) {
  const sig = sign(null, Buffer.from(canonicalJson(unsigned), 'utf8'), signer.privateKey).toString('base64');
  return canonicalJson({ ...unsigned, sig });
}

function rawEvent(signer, fields) {
  return { v: 1, type: 'attest', kind: 'content', id: 'a.md', by: 'Joshua Moss, MD', base: BASE,
    keyId: signer.keyId, contentHash: HASH_A, ts: '2026-09-25T12:00:00.000Z', ...fields };
}

test('L-2: prev alone catches a correctly-numbered line from another ledger', () => {
  const signer = newSigner();
  const a = ledgerWith(signer, [attest('a.md'), attest('b.md')]).text.trimEnd().split('\n');
  const b = ledgerWith(signer, [attest('x.md'), attest('y.md')], { ts: '2026-09-25T12:30:00.000Z' }).text.trimEnd().split('\n');
  refusal(() => verifyLedger(`${a[0]}\n${b[1]}\n`, keysFor(signer)), 'ledger.chain');
});

test('L-2: seq alone catches a line whose prev is right but whose number is not', () => {
  const signer = newSigner();
  const first = signRaw(rawEvent(signer, { seq: 1, prev: GENESIS_PREV }), signer);
  const prev = createHash('sha256').update(first).digest('hex');
  const skipped = signRaw(rawEvent(signer, { seq: 3, prev, id: 'b.md' }), signer);
  refusal(() => verifyLedger(`${first}\n${skipped}\n`, keysFor(signer)), 'ledger.chain');
});

test('L-2: ts ordering alone catches a signed, correctly chained, backdated line', () => {
  const signer = newSigner();
  const first = signRaw(rawEvent(signer, { seq: 1, prev: GENESIS_PREV }), signer);
  const prev = createHash('sha256').update(first).digest('hex');
  const backdated = signRaw(rawEvent(signer, { seq: 2, prev, id: 'b.md', ts: '2026-09-25T11:00:00.000Z' }), signer);
  refusal(() => verifyLedger(`${first}\n${backdated}\n`, keysFor(signer)), 'ledger.chain');
  const forward = signRaw(rawEvent(signer, { seq: 2, prev, id: 'b.md', ts: '2026-09-25T13:00:00.000Z' }), signer);
  assert.equal(verifyLedger(`${first}\n${forward}\n`, keysFor(signer)).events.length, 2, 'the control case verifies');
});

test('L-2: time may not run backwards, and the console refuses to write behind the head', () => {
  const signer = newSigner();
  const first = ledgerWith(signer, [attest('a.md')], { ts: '2026-09-25T12:00:00.000Z' });
  refusal(() => ledgerWith(signer, [attest('b.md')], { existingText: first.text, ts: '2026-09-25T11:00:00.000Z' }),
    'ledger.clock');
});

test('L-3: format faults are refused, not repaired', () => {
  const signer = newSigner();
  const keys = keysFor(signer);
  const { text } = ledgerWith(signer, [attest('a.md'), attest('b.md')]);
  refusal(() => verifyLedger(text.trimEnd(), keys), 'ledger.format');
  refusal(() => verifyLedger(text.replace('\n', '\r\n'), keys), 'ledger.format');
  refusal(() => verifyLedger(text.replace('\n', '\n\n'), keys), 'ledger.format');
  refusal(() => verifyLedger(`${text}not json\n`, keys), 'ledger.format');
  const spaced = `${JSON.stringify(JSON.parse(text.split('\n')[0]), null, 1).replace(/\n/g, ' ')}\n`;
  refusal(() => verifyLedger(spaced, keys), 'ledger.not_canonical');
  const extra = `${canonicalJson({ ...JSON.parse(text.split('\n')[0]), note: 'x' })}\n`;
  refusal(() => verifyLedger(extra, keys), 'ledger.event_invalid');
});

test('a revoked key is refused from its revocation time on, and honoured before it', () => {
  const signer = newSigner();
  const early = ledgerWith(signer, [attest('a.md')], { ts: '2026-09-25T10:00:00.000Z' });
  const both = ledgerWith(signer, [attest('b.md')], { existingText: early.text, ts: '2026-09-25T14:00:00.000Z' });
  const keys = keysFor(signer);
  keys.keys[0].revokedAt = '2026-09-25T12:00:00.000Z';
  assert.equal(verifyLedger(early.text, keys).events.length, 1);
  refusal(() => verifyLedger(both.text, keys), 'ledger.revoked_key');
});

test('keys.json is strict: a mislabelled, duplicated or foreign key is refused', () => {
  const signer = newSigner();
  const other = newSigner();
  const good = keysFor(signer);
  assert.equal(parseKeys(good).size, 1);
  const mislabelled = keysFor(signer);
  mislabelled.keys[0].keyId = other.keyId;
  refusal(() => parseKeys(mislabelled), 'ledger.keys_invalid');
  refusal(() => parseKeys({ version: 1, keys: [good.keys[0], good.keys[0]] }), 'ledger.keys_invalid');
  refusal(() => parseKeys({ version: 1, keys: [{ ...good.keys[0], extra: 1 }] }), 'ledger.keys_invalid');
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  refusal(() => parseKeys({ version: 1, keys: [{ ...good.keys[0],
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }), keyId: keyIdOf(publicKey) }] }),
  'ledger.key_type');
});

test('the console refuses to sign with a key the builds could not verify', () => {
  const signer = newSigner();
  refusal(() => appendEvents({ existingText: '', keysDoc: { version: 1, keys: [] }, drafts: [attest('a.md')],
    ts: '2026-09-25T12:00:00.000Z', by: 'Joshua Moss, MD', base: BASE, signer }), 'ledger.unknown_key');
});

test('loadSigner accepts the base64 DER the keygen stores, and PEM, and nothing else', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const fromDer = loadSigner(privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'));
  const fromPem = loadSigner(privateKey.export({ type: 'pkcs8', format: 'pem' }));
  assert.equal(fromDer.keyId, fromPem.keyId);
  refusal(() => loadSigner(''), 'ledger.no_signing_key');
  refusal(() => loadSigner('not a key'), 'ledger.signing_key_invalid');
  const { privateKey: ec } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  refusal(() => loadSigner(ec.export({ type: 'pkcs8', format: 'pem' })), 'ledger.key_type');
});

test('an event may not claim the pending sentinel as its signer', () => {
  const signer = newSigner();
  assert.throws(() => appendEvents({ existingText: '', keysDoc: keysFor(signer), drafts: [attest('a.md')],
    ts: '2026-09-25T12:00:00.000Z', by: 'Pending faculty review', base: BASE, signer }), LedgerError);
});

// ── the overlay: L-5, L-7, L-8 ─────────────────────────────────────────────────────────────

function baseline() {
  return {
    reviewed: {
      't_mood.md': { status: 'pending', risk: { kind: 'clinical', level: 'high' }, at: '2026-09-20',
        by: 'Pending faculty review', reason: 'New page.', note: 'keep me' },
      'ddx.md': { status: 'reviewed', risk: { kind: 'clinical', level: 'moderate' }, at: '2026-09-21',
        by: 'Joshua Moss, MD', contentHash: HASH_C },
    },
    topicMeta: {
      't_mood.md': { tldr: 'mood', facultyReview: { status: 'pending', reviewer: 'Pending faculty review' } },
    },
    qbank: {
      version: 1,
      items: [
        { id: 'qb_1', status: 'draft', stem: 'Stem one', options: [{ key: 'A', t: 'a' }] },
        { id: 'qb_2', status: 'draft', stem: 'Stem two', retired: true },
      ],
    },
  };
}

test('a content attest sets status/at/by/contentHash, drops reason, and keeps everything else', () => {
  const signer = newSigner();
  const { events } = verifyLedger(ledgerWith(signer, [attest('t_mood.md')]).text, keysFor(signer));
  const input = baseline();
  const { reviewed, topicMeta, qbank, report } = applyLedger({ ...input, events, shippedSlugs: new Set(['t_mood.md', 'ddx.md']) });
  assert.deepEqual(reviewed['t_mood.md'], {
    status: 'reviewed', risk: { kind: 'clinical', level: 'high' }, at: '2026-09-25',
    by: 'Joshua Moss, MD', note: 'keep me', contentHash: HASH_A,
  });
  assert.deepEqual(reviewed['ddx.md'], input.reviewed['ddx.md'], 'untouched rows are untouched');
  assert.deepEqual(topicMeta['t_mood.md'], {
    tldr: 'mood', facultyReview: { status: 'reviewed', reviewer: 'Joshua Moss, MD', lastReviewed: '2026-09-25' },
  });
  assert.deepEqual(qbank, input.qbank);
  assert.deepEqual(report.content.attested, ['t_mood.md']);
  assert.deepEqual(input, baseline(), 'the inputs are never mutated');
});

test('a reopen sets pending with the reason, and demotes facultyReview', () => {
  const signer = newSigner();
  const { events } = verifyLedger(ledgerWith(signer,
    [{ type: 'reopen', kind: 'content', id: 'ddx.md', reason: 'New DSM wording to check.' }]).text, keysFor(signer));
  const input = baseline();
  input.topicMeta['ddx.md'] = { facultyReview: { status: 'reviewed', reviewer: 'Joshua Moss, MD', lastReviewed: '2026-09-21' } };
  const { reviewed, topicMeta } = applyLedger({ ...input, events });
  assert.equal(reviewed['ddx.md'].status, 'pending');
  assert.equal(reviewed['ddx.md'].by, 'Pending faculty review');
  assert.equal(reviewed['ddx.md'].reason, 'New DSM wording to check.');
  assert.equal(topicMeta['ddx.md'].facultyReview.status, 'pending');
});

test('the latest event per item wins', () => {
  const signer = newSigner();
  const text = ledgerWith(signer, [attest('ddx.md', HASH_A),
    { type: 'reopen', kind: 'content', id: 'ddx.md', reason: 'Recheck.' }, attest('ddx.md', HASH_C)]).text;
  const { reviewed } = applyLedger({ reviewed: baseline().reviewed, events: verifyLedger(text, keysFor(signer)).events });
  assert.equal(reviewed['ddx.md'].status, 'reviewed');
  assert.equal(reviewed['ddx.md'].contentHash, HASH_C);
});

test('a baseline row dated LATER than the event keeps the baseline; the same day, the ledger wins', () => {
  const signer = newSigner();
  const { events } = verifyLedger(ledgerWith(signer, [attest('ddx.md', HASH_A)], { ts: '2026-09-20T09:00:00.000Z' }).text, keysFor(signer));
  const later = applyLedger({ reviewed: baseline().reviewed, events });
  assert.equal(later.reviewed['ddx.md'].contentHash, HASH_C, 'baseline 2026-09-21 is newer than a 2026-09-20 event');
  assert.match(later.report.skipped[0].why, /baseline row is newer/);
  const sameDay = verifyLedger(ledgerWith(signer, [attest('ddx.md', HASH_A)], { ts: '2026-09-21T23:00:00.000Z' }).text, keysFor(signer));
  assert.equal(applyLedger({ reviewed: baseline().reviewed, events: sameDay.events }).reviewed['ddx.md'].contentHash, HASH_A);
});

test('the ledger can sign what exists, never create it', () => {
  const signer = newSigner();
  const { events } = verifyLedger(ledgerWith(signer, [attest('ghost.md'), attest('ddx.md')]).text, keysFor(signer));
  const { reviewed, report } = applyLedger({ reviewed: baseline().reviewed, events, shippedSlugs: new Set(['t_mood.md', 'ghost.md']) });
  assert.equal(Object.hasOwn(reviewed, 'ghost.md'), false);
  assert.deepEqual(report.skipped.map(skip => skip.why).sort(), ['no registration row in reviewed.json', 'not shipped']);
});

test('L-7: a question attest binds to its text without status; an edited question is not promoted', () => {
  const signer = newSigner();
  const input = baseline();
  const itemHash = questionItemHash(input.qbank.items[0]);
  assert.equal(itemHash, questionItemHash({ ...input.qbank.items[0], status: 'attested' }), 'status is not part of the hash');
  const { events } = verifyLedger(ledgerWith(signer, [
    { type: 'attest', kind: 'question', id: 'qb_1', itemHash },
    { type: 'attest', kind: 'question', id: 'qb_2', itemHash: questionItemHash(input.qbank.items[1]) },
  ]).text, keysFor(signer));
  const { qbank, report } = applyLedger({ reviewed: {}, qbank: input.qbank, events });
  assert.equal(qbank.items[0].status, 'attested');
  assert.equal(qbank.items[1].status, 'draft', 'a retired question is never promoted');
  assert.deepEqual(report.skipped, [{ kind: 'question', id: 'qb_2', why: 'retired' }]);

  const edited = structuredClone(input.qbank);
  edited.items[0].stem = 'Stem one, reworded after signing';
  const drifted = applyLedger({ reviewed: {}, qbank: edited, events });
  assert.equal(drifted.qbank.items[0].status, 'draft');
  assert.deepEqual(drifted.report.questionDrift, ['qb_1']);
});

test('L-8: applying a ledger touches governance fields only', () => {
  const signer = newSigner();
  const input = baseline();
  const { events } = verifyLedger(ledgerWith(signer, [
    attest('t_mood.md'),
    { type: 'reopen', kind: 'content', id: 'ddx.md', reason: 'Recheck.' },
    { type: 'attest', kind: 'question', id: 'qb_1', itemHash: questionItemHash(input.qbank.items[0]) },
  ]).text, keysFor(signer));
  const out = applyLedger({ ...input, events });
  const strip = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
  const ROW = ['status', 'at', 'by', 'contentHash', 'reason'];
  for (const slug of Object.keys(input.reviewed)) {
    assert.deepEqual(strip(out.reviewed[slug], ROW), strip(input.reviewed[slug], ROW), slug);
  }
  assert.deepEqual(strip(out.topicMeta['t_mood.md'], ['facultyReview']), strip(input.topicMeta['t_mood.md'], ['facultyReview']));
  out.qbank.items.forEach((item, index) => {
    assert.deepEqual(strip(item, ['status']), strip(input.qbank.items[index], ['status']));
  });
});
