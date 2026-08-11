// Learner pool composition + draft labelling for the practice bank.
//
// Policy (docs/superpowers/plans/2026-07-15-audit-remediation-master.md, confirmed by
// Dr. Moss): un-attested drafts ARE served, clearly marked; only retired items are
// withheld. a04a848 gated the pool to attested-only and nothing here caught it — the
// only coverage was a Playwright count assertion in the smoke job, and the node suite
// stayed green while the pool fell 192 -> 143. Hence behavioural tests, not source greps.
//
// These evaluate the real functions out of the shipped single-file tool rather than
// asserting on its text, so re-introducing `status==='attested'` in the filter, or
// dropping either label, turns them red.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/question-bank-practice.html',
  import.meta.url,
), 'utf8');

function slice(startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  const b = source.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return source.slice(a, b);
}

// Matches tests/srs-home-counters.test.mjs's memStorage() convention.
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// eslint-disable-next-line no-new-func
const activeItems = new Function('BANK', `${slice('function activeItems(', '/* ---- rendering helpers')}
  return activeItems();`);

const renderDraftNotice = new Function('item', `${slice('function renderDraftNotice(', 'function renderQuestion(')}
  return renderDraftNotice(item);`);

const renderMeta = new Function('item', 'CAT_LABELS', 'esc', 'diffDots',
  `${slice('function renderMeta(', 'function renderConfidence(')}
  return renderMeta(item);`);

const metaOf = (item) => renderMeta(item, {}, (s) => s, () => '');

// renderSetup is the pool preview a learner sees before starting; it needs activeItems
// (hence BANK) and CAT_LABELS in scope, plus qbLoad (via lsGet) for the focus-mode
// preset counts (missedItems/certWrongItems, sliced in with activeItems below).
// localStorage is an explicit parameter (not the global) so tests can seed cw_qb_v1
// without touching global state.
const renderSetup = new Function('BANK', 'CAT_LABELS', 'localStorage',
  `${slice('function lsGet(', 'function qbRecord(')}
   ${slice('function srsLoad(', 'function srsSave(')}
   ${slice('function activeItems(', '/* ---- rendering helpers')}
   ${slice('function renderSetup(', 'function renderMeta(')}
   return renderSetup();`);

// Focus-mode preset queues, same slicing approach.
const focusPresets = new Function('BANK', 'localStorage',
  `${slice('function lsGet(', 'function qbRecord(')}
   ${slice('function activeItems(', '/* ---- rendering helpers')}
   return { missedItems: missedItems, certWrongItems: certWrongItems };`);

const BANK = {
  items: [
    { id: 'a_attested', status: 'attested' },
    { id: 'b_draft', status: 'draft' },
    { id: 'c_retired_attested', status: 'attested', retired: true },
    { id: 'd_retired_draft', status: 'draft', retired: true },
  ],
};

test('drafts are served to learners; retired items never are', () => {
  const served = activeItems(BANK).map((it) => it.id);
  assert.deepEqual(served, ['a_attested', 'b_draft']);
});

test('retired items are withheld regardless of attestation status', () => {
  // The negative half of the contract. Serving retired content is the failure this
  // guards; it must stay red even though drafts are now allowed through.
  const served = activeItems(BANK).map((it) => it.id);
  for (const id of ['c_retired_attested', 'd_retired_draft']) {
    assert.ok(!served.includes(id), `retired item ${id} must never reach the learner pool`);
  }
  assert.equal(activeItems({ items: [{ id: 'only', retired: true }] }).length, 0);
});

test('every served item that is not attested carries the draft label', () => {
  // Fail-safe direction: the label keys off "not attested" rather than an explicit
  // 'draft' value, so a new or misspelled status is labelled rather than passed off
  // as faculty-reviewed.
  for (const status of ['draft', 'draft-pending-attestation', undefined]) {
    const item = { id: 'x', status, category: 'mood', difficulty: 2 };
    assert.match(metaOf(item), /Draft — not yet faculty-reviewed/,
      `status ${String(status)} must be labelled in the meta row`);
    assert.match(renderDraftNotice(item), /not yet faculty-reviewed/,
      `status ${String(status)} must get the callout`);
  }
});

test('attested items carry no draft label', () => {
  const item = { id: 'x', status: 'attested', category: 'mood', difficulty: 2 };
  assert.doesNotMatch(metaOf(item), /Draft —/);
  assert.equal(renderDraftNotice(item), '');
});

test('the pool preview counts the served pool and flags how many are drafts', () => {
  const setup = renderSetup(BANK, { mood: 'Mood' });
  // 2 of 4 fixture items are non-retired (one attested, one draft).
  assert.match(setup, /2 items across 12 categories/);
  assert.match(setup, /2 questions match/);
  assert.match(setup, /1 of these 2 questions carry this label/);
  assert.match(setup, /Draft — not yet faculty-reviewed/);
  assert.match(setup, /class="setup-draft-note" role="note"/);
});

test('the pool preview omits the draft note when nothing served is a draft', () => {
  // Guards against a note that is always rendered and therefore says nothing.
  const setup = renderSetup(
    { items: [{ id: 'a', status: 'attested', category: 'mood' }] },
    { mood: 'Mood' },
  );
  assert.doesNotMatch(setup, /setup-draft-note/);
  assert.doesNotMatch(setup, /Draft — not yet faculty-reviewed/);
});

test('the draft label does not depend on colour or on the icon being announced', () => {
  const item = { id: 'x', status: 'draft', category: 'mood', difficulty: 2 };
  const notice = renderDraftNotice(item);
  // Wording alone states the status (WCAG 1.4.1 use of colour).
  assert.match(notice.replace(/<[^>]+>/g, ''), /Draft — not yet faculty-reviewed/);
  // Decorative glyph is hidden from assistive tech in both label surfaces.
  for (const html of [notice, metaOf(item)]) {
    const glyph = html.indexOf('&#9888;');
    assert.ok(glyph !== -1, 'warning glyph expected');
    assert.match(html.slice(0, glyph), /aria-hidden="true"[^<]*$/,
      'the glyph must sit inside an aria-hidden wrapper');
  }
  // The callout is exposed as its own region rather than reading as part of the stem.
  assert.match(notice, /role="note"/);
});

// ---- focus-mode presets ("Redo my misses" / "Confidently wrong") ------------------

test('missedItems/certWrongItems are empty with no cw_qb_v1 history', () => {
  const { missedItems, certWrongItems } = focusPresets(BANK, memStorage());
  assert.deepEqual(missedItems(), []);
  assert.deepEqual(certWrongItems(), []);
});

test('missedItems returns active items with a correct:false record; certWrongItems needs certWrong:true', () => {
  const ls = memStorage();
  ls.setItem('cw_qb_v1', JSON.stringify({
    a_attested: { correct: false, confidence: 'guess' },              // missed, not certain
    b_draft: { correct: false, confidence: 'certain', certWrong: true }, // missed AND certWrong
  }));
  const { missedItems, certWrongItems } = focusPresets(BANK, ls);
  assert.deepEqual(missedItems().map((it) => it.id), ['a_attested', 'b_draft']);
  assert.deepEqual(certWrongItems().map((it) => it.id), ['b_draft']);
});

test('a correct record never appears in either preset', () => {
  const ls = memStorage();
  ls.setItem('cw_qb_v1', JSON.stringify({
    a_attested: { correct: true, confidence: 'certain' },
  }));
  const { missedItems, certWrongItems } = focusPresets(BANK, ls);
  assert.deepEqual(missedItems(), []);
  assert.deepEqual(certWrongItems(), []);
});

test('a record for a retired item is never surfaced, even though it matches the preset criteria', () => {
  const ls = memStorage();
  ls.setItem('cw_qb_v1', JSON.stringify({
    c_retired_attested: { correct: false, confidence: 'certain', certWrong: true },
    d_retired_draft: { correct: false, confidence: 'certain', certWrong: true },
  }));
  const { missedItems, certWrongItems } = focusPresets(BANK, ls);
  assert.deepEqual(missedItems(), [], 'retired items must not reach either preset queue');
  assert.deepEqual(certWrongItems(), [], 'retired items must not reach either preset queue');
});

test('the setup screen renders live counts and disables a preset button at zero', () => {
  const zero = renderSetup(BANK, { mood: 'Mood' }, memStorage());
  assert.match(zero, /id="redoMissesBtn" disabled>Redo my misses \(0\)/);
  assert.match(zero, /id="certWrongBtn" disabled>Confidently wrong \(0\)/);

  const ls = memStorage();
  ls.setItem('cw_qb_v1', JSON.stringify({
    a_attested: { correct: false, confidence: 'certain', certWrong: true },
  }));
  const withHistory = renderSetup(BANK, { mood: 'Mood' }, ls);
  assert.match(withHistory, /id="redoMissesBtn">Redo my misses \(1\)/);
  assert.match(withHistory, /id="certWrongBtn">Confidently wrong \(1\)/);
});
