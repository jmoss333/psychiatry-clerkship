// Learner pool composition + draft labelling for the practice bank.
//
// Policy (WP-37: PLAN_Taplinger_Feedback_and_Therapy_Library_2026-08-20.md §A2 +
// FEEDBACK_IMPACT_Taplinger_Verbatim_2026-08-20.md §3, decided by Dr. Moss): the bank
// serves FACULTY-ATTESTED items only by default; un-attested drafts are opt-in via the
// setup-screen toggle (cw_qb_drafts_v1) and stay clearly marked when included. Retired
// items are never served under any setting.
//
// This deliberately reverses the 2026-07-15 "serve drafts, marked" decision now that an
// external course page (TUSM) links to the site. History matters here because the pool
// has silently flipped before: a04a848 gated to attested-only by ACCIDENT and nothing
// caught the pool falling 192 -> 143 (#284 restored serving). The difference this time
// is visibility — the setup screen states the exclusion and carries the toggle, and the
// tests below pin both the pool math and that UI, in both toggle states.
//
// These evaluate the real functions out of the shipped single-file tool rather than
// asserting on its text, so silently widening the default pool, dropping the opt-in
// path, or dropping either label turns them red.

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

// Storage with the draft opt-in set, exactly as setIncludeDrafts() persists it
// (lsSet JSON-stringifies, so the stored string is 'true').
function optedInStorage() {
  const ls = memStorage();
  ls.setItem('cw_qb_drafts_v1', 'true');
  return ls;
}

// The pool block starts at includeDrafts() (the opt-in reader activeItems() consults)
// and runs through the focus-mode preset builders; it needs the lsGet storage helpers.
const poolCode = `${slice('function lsGet(', 'function qbRecord(')}
  ${slice('function includeDrafts(', '/* ---- rendering helpers')}`;

// eslint-disable-next-line no-new-func
const activeItems = new Function('BANK', 'localStorage', `${poolCode}
  return activeItems();`);

const renderDraftNotice = new Function('item', `${slice('function renderDraftNotice(', 'function renderQuestion(')}
  return renderDraftNotice(item);`);

const renderMeta = new Function('item', 'CAT_LABELS', 'esc', 'diffDots',
  `${slice('function renderMeta(', 'function renderConfidence(')}
  return renderMeta(item);`);

const metaOf = (item) => renderMeta(item, {}, (s) => s, () => '');

// renderSetup is the pool preview a learner sees before starting; it needs the pool
// block (activeItems + focus presets), srsLoad for the due-count button, and CAT_LABELS.
// localStorage is an explicit parameter (not the global) so tests can seed cw_qb_v1 and
// the cw_qb_drafts_v1 opt-in without touching global state.
const renderSetup = new Function('BANK', 'CAT_LABELS', 'localStorage',
  `${slice('function srsLoad(', 'function srsSave(')}
   ${poolCode}
   ${slice('function renderSetup(', 'function renderMeta(')}
   return renderSetup();`);

// Focus-mode preset queues, same slicing approach.
const focusPresets = new Function('BANK', 'localStorage', `${poolCode}
   return { missedItems: missedItems, certWrongItems: certWrongItems };`);

const BANK = {
  items: [
    { id: 'a_attested', status: 'attested' },
    { id: 'b_draft', status: 'draft' },
    { id: 'c_retired_attested', status: 'attested', retired: true },
    { id: 'd_retired_draft', status: 'draft', retired: true },
    { id: 'e_unknown_status', status: 'draft-pending-attestation' },
    { id: 'f_missing_status' },
  ],
};

test('the default pool is attested-only: drafts, unknown statuses, and retired items are all withheld', () => {
  // Fail-safe direction: only an explicit status==='attested' reaches the default pool,
  // so a new or misspelled status is withheld rather than served as faculty-reviewed.
  const served = activeItems(BANK, memStorage()).map((it) => it.id);
  assert.deepEqual(served, ['a_attested']);
});

test('opting in (cw_qb_drafts_v1) serves drafts and unknown statuses; retired items still never serve', () => {
  const served = activeItems(BANK, optedInStorage()).map((it) => it.id);
  assert.deepEqual(served, ['a_attested', 'b_draft', 'e_unknown_status', 'f_missing_status']);
});

test('retired items are withheld regardless of attestation status or the opt-in', () => {
  for (const ls of [memStorage(), optedInStorage()]) {
    const served = activeItems(BANK, ls).map((it) => it.id);
    for (const id of ['c_retired_attested', 'd_retired_draft']) {
      assert.ok(!served.includes(id), `retired item ${id} must never reach the learner pool`);
    }
  }
  assert.equal(activeItems({ items: [{ id: 'only', retired: true }] }, optedInStorage()).length, 0);
});

test('garbage in cw_qb_drafts_v1 fails closed to the attested-only default', () => {
  for (const raw of ['1', 'yes', '"true"', '{}', 'null']) {
    const ls = memStorage();
    ls.setItem('cw_qb_drafts_v1', raw);
    assert.deepEqual(activeItems(BANK, ls).map((it) => it.id), ['a_attested'],
      `stored value ${raw} must not widen the pool`);
  }
});

test('every served item that is not attested carries the draft label', () => {
  // Label logic keys off "not attested" rather than an explicit 'draft' value, so an
  // opted-in learner sees every non-attested item marked, whatever its status string.
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

test('with drafts off, the pool preview counts attested only and says drafts are excluded', () => {
  const setup = renderSetup(BANK, { mood: 'Mood' }, memStorage());
  assert.match(setup, /1 items across 12 categories/);
  assert.match(setup, /1 questions match/);
  assert.match(setup, /3 draft questions are not served by default/);
  assert.match(setup, /class="setup-draft-note" role="note"/);
  assert.match(setup, /<input type="checkbox" id="draftToggle">/,
    'the opt-in toggle must render unchecked by default');
  assert.doesNotMatch(setup, /id="draftToggle" checked/);
  assert.doesNotMatch(setup, /carry this label/,
    'the opted-in copy must not appear while drafts are excluded');
});

test('with drafts on, the pool preview counts the widened pool and flags how many are drafts', () => {
  const setup = renderSetup(BANK, { mood: 'Mood' }, optedInStorage());
  assert.match(setup, /4 items across 12 categories/);
  assert.match(setup, /4 questions match/);
  assert.match(setup, /3 of these 4 questions carry this label/);
  assert.match(setup, /Draft — not yet faculty-reviewed/);
  assert.match(setup, /class="setup-draft-note" role="note"/);
  assert.match(setup, /id="draftToggle" checked/,
    'the toggle must reflect the persisted opt-in so learners can turn it back off');
});

test('the pool preview omits the draft note and toggle when the bank has no drafts at all', () => {
  // Guards against a note that is always rendered and therefore says nothing.
  for (const ls of [memStorage(), optedInStorage()]) {
    const setup = renderSetup(
      { items: [{ id: 'a', status: 'attested', category: 'mood' }] },
      { mood: 'Mood' },
      ls,
    );
    assert.doesNotMatch(setup, /setup-draft-note/);
    assert.doesNotMatch(setup, /draftToggle/);
    assert.doesNotMatch(setup, /Draft — not yet faculty-reviewed/);
  }
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

test('with drafts off, a draft record never surfaces in a preset; attested records do', () => {
  const ls = memStorage();
  ls.setItem('cw_qb_v1', JSON.stringify({
    a_attested: { correct: false, confidence: 'guess' },              // missed, not certain
    b_draft: { correct: false, confidence: 'certain', certWrong: true }, // missed AND certWrong
  }));
  const { missedItems, certWrongItems } = focusPresets(BANK, ls);
  assert.deepEqual(missedItems().map((it) => it.id), ['a_attested'],
    'the draft record must be withheld from the preset queue by default');
  assert.deepEqual(certWrongItems(), []);
});

test('with drafts on, preset queues include draft records again', () => {
  const ls = optedInStorage();
  ls.setItem('cw_qb_v1', JSON.stringify({
    a_attested: { correct: false, confidence: 'guess' },
    b_draft: { correct: false, confidence: 'certain', certWrong: true },
  }));
  const { missedItems, certWrongItems } = focusPresets(BANK, ls);
  assert.deepEqual(missedItems().map((it) => it.id), ['a_attested', 'b_draft']);
  assert.deepEqual(certWrongItems().map((it) => it.id), ['b_draft']);
});

test('a correct record never appears in either preset', () => {
  const ls = optedInStorage();
  ls.setItem('cw_qb_v1', JSON.stringify({
    a_attested: { correct: true, confidence: 'certain' },
  }));
  const { missedItems, certWrongItems } = focusPresets(BANK, ls);
  assert.deepEqual(missedItems(), []);
  assert.deepEqual(certWrongItems(), []);
});

test('a record for a retired item is never surfaced, even though it matches the preset criteria', () => {
  for (const make of [memStorage, optedInStorage]) {
    const ls = make();
    ls.setItem('cw_qb_v1', JSON.stringify({
      c_retired_attested: { correct: false, confidence: 'certain', certWrong: true },
      d_retired_draft: { correct: false, confidence: 'certain', certWrong: true },
    }));
    const { missedItems, certWrongItems } = focusPresets(BANK, ls);
    assert.deepEqual(missedItems(), [], 'retired items must not reach either preset queue');
    assert.deepEqual(certWrongItems(), [], 'retired items must not reach either preset queue');
  }
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
