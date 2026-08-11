// Behavioral contract for the batch-attestation tray (2026-08-04 design, sections A + B).
//
// deriveBatchEligibility() is the client's mirror of what the server demands of every
// entry in a multi-item attestation: draft status, a 'ready' gate (warnings force
// individual attestation via attest.warning_individual_only; blocked never attests),
// and a review receipt recorded at the question's EXACT current revision. These tests
// pin the accept/reject matrix, the receipt-invalidation-on-revision-change behavior
// the tray relies on, and the interaction with assessBatch() that the re-keyed draft
// cohort must now pass.
//
// Negative-control discipline (the spec's own requirement): every reason code is shown
// to independently flip the verdict — a guard that cannot go red is not a guard.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { deriveBatchEligibility } from '../faculty-console/review-model.mjs';
import { assessBatch } from '../faculty-console/qbank-rules.mjs';

const REV = 'a'.repeat(64);
const REV2 = 'b'.repeat(64);

function draft(overrides = {}) {
  return { id: 'qb_moo_901', status: 'draft', revision: REV, ...overrides };
}

test('a reviewed, ready draft is batch-eligible', () => {
  const verdict = deriveBatchEligibility(draft(), { assessmentGate: 'ready', reviewedRevision: REV });
  assert.deepEqual(verdict, { eligible: true, reasons: [] });
});

test('each requirement independently disqualifies (negative controls)', () => {
  const cases = [
    [draft({ status: 'attested' }), { assessmentGate: 'ready', reviewedRevision: REV }, 'batch.not_draft'],
    [draft({ status: 'retired' }), { assessmentGate: 'ready', reviewedRevision: REV }, 'batch.not_draft'],
    [null, { assessmentGate: 'ready', reviewedRevision: REV }, 'batch.not_draft'],
    [draft(), { assessmentGate: 'warning', reviewedRevision: REV }, 'batch.warning_individual_only'],
    [draft(), { assessmentGate: 'blocked', reviewedRevision: REV }, 'batch.blocked'],
    [draft(), { assessmentGate: undefined, reviewedRevision: REV }, 'batch.gate_unknown'],
    [draft(), { assessmentGate: 'ready', reviewedRevision: undefined }, 'batch.review_receipt_required'],
    [draft(), { assessmentGate: 'ready', reviewedRevision: REV2 }, 'batch.review_receipt_required'],
    [draft({ revision: 'not-a-sha' }), { assessmentGate: 'ready', reviewedRevision: 'not-a-sha' }, 'batch.review_receipt_required'],
  ];
  for (const [question, context, expected] of cases) {
    const verdict = deriveBatchEligibility(question, context);
    assert.equal(verdict.eligible, false, `${expected}: must be ineligible`);
    assert.ok(verdict.reasons.includes(expected),
      `${expected}: expected in ${verdict.reasons.join(', ')}`);
  }
});

test('a revision change invalidates the receipt and drops the item from a batch', () => {
  const question = draft();
  const before = deriveBatchEligibility(question, { assessmentGate: 'ready', reviewedRevision: REV });
  assert.equal(before.eligible, true);
  // A save produced a new revision; the recorded receipt still names the old one.
  const saved = { ...question, revision: REV2 };
  const after = deriveBatchEligibility(saved, { assessmentGate: 'ready', reviewedRevision: REV });
  assert.equal(after.eligible, false);
  assert.deepEqual(after.reasons, ['batch.review_receipt_required']);
});

test('warnings exclude an item from the tray even with a perfect receipt', () => {
  // The single-item flow can attest a warning item with acknowledgements; the batch
  // cannot contain it at all — mirroring the server's attest.warning_individual_only.
  const verdict = deriveBatchEligibility(draft(), { assessmentGate: 'warning', reviewedRevision: REV });
  assert.deepEqual(verdict.reasons, ['batch.warning_individual_only']);
});

function itemWithCorrect(key) {
  return {
    id: `qb_${key}`,
    options: ['A', 'B', 'C', 'D'].map(optionKey => ({ key: optionKey, t: optionKey, c: optionKey === key })),
  };
}

test('a same-key cohort of four is blocked; the re-keyed spread passes', () => {
  const skewed = assessBatch(['A', 'A', 'A', 'A'].map(itemWithCorrect));
  assert.equal(skewed.ok, false);
  assert.deepEqual(skewed.issues.map(issue => issue.code), ['batch.answer_key_balance']);

  const spread = assessBatch(['A', 'B', 'C', 'D'].map(itemWithCorrect));
  assert.equal(spread.ok, true);
  assert.deepEqual(spread.answerKeys, { A: 1, B: 1, C: 1, D: 1 });
});

test('the live bank: every per-category draft cohort of 4+ now passes assessBatch', () => {
  // The 2026-08-04 design table showed six categories blocked (all-A). After the
  // salvaged re-key pass, batching by category — the natural review unit — must work.
  const path = new URL('../question_bank.json', import.meta.url);
  const bank = JSON.parse(fs.readFileSync(path, 'utf8'));
  const drafts = bank.items.filter(item => item.status === 'draft' && !item.retired);
  const byCategory = {};
  for (const item of drafts) (byCategory[item.category] ??= []).push(item);
  for (const [category, items] of Object.entries(byCategory)) {
    if (items.length < 4) continue;
    const check = assessBatch(items);
    assert.equal(check.ok, true,
      `${category} cohort (${items.length}) blocked: ${JSON.stringify(check.answerKeys)}`);
  }
});
