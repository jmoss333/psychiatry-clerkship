// Behavioural tests for the ward question-capture store (cw_capture_v1).
// Pattern follows tests/srs-home-counters.test.mjs: slice the real functions out of the
// shipped single-file source and execute them. Runs BEFORE the build in build_and_check.sh,
// so everything here reads source — never _build/ — and never touches a browser API.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html',
  import.meta.url,
), 'utf8');
const phi = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/phi_heuristic.js',
  import.meta.url,
), 'utf8');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

function memStorage(throwOnWrite = false) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (throwOnWrite) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
  };
}

const storeCode = slice(shell, 'var CAP_MAX=', '/* ---- end ward capture store ---- */');

function makeStore({ throwOnWrite = false, currentItem = { k: 'page', f: 't_mood.md' } } = {}) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'currentItem', `
    ${phi}
    ${storeCode}
    return { capRead: capRead, capWrite: capWrite, capAdd: capAdd, capRemove: capRemove,
      capMarkTriaged: capMarkTriaged, capEraseAll: capEraseAll, capRisky: capRisky,
      capClipboardText: capClipboardText, capCtx: capCtx, CAP_MAX: CAP_MAX, CAP_LIMIT: CAP_LIMIT };
  `);
  return factory(memStorage(throwOnWrite), currentItem);
}

test('T4a: text is hard-capped at 280 characters on write', () => {
  const s = makeStore();
  s.capAdd('x'.repeat(400));
  const items = s.capRead().items;
  assert.equal(items.length, 1);
  assert.equal(items[0].text.length, 280);
});

test('T4b: text is re-clamped on read, so a hand-edited store cannot widen the cap', () => {
  const ls = memStorage();
  ls.setItem('cw_capture_v1', JSON.stringify({
    v: 1, items: [{ id: 'c_x', text: 'y'.repeat(900), at: 1, ctx: null, triaged: false }],
  }));
  // eslint-disable-next-line no-new-func
  const s = new Function('localStorage', 'currentItem', `${phi}\n${storeCode}\nreturn {capRead:capRead};`)(ls, null);
  assert.equal(s.capRead().items[0].text.length, 280);
});

test('T4c: the store caps at 50 items and evicts triaged entries first', () => {
  const s = makeStore();
  for (let i = 0; i < 50; i += 1) s.capAdd(`question ${i}`);
  // mark an early one triaged; it must be the first evicted, not the oldest untriaged
  const early = s.capRead().items[3];
  s.capMarkTriaged(early.id);
  s.capAdd('the fifty-first question');
  const items = s.capRead().items;
  assert.equal(items.length, 50, 'FIFO cap holds at CAP_LIMIT');
  assert.ok(!items.some((it) => it.id === early.id), 'the triaged item was evicted first');
  assert.ok(items.some((it) => it.text === 'question 0'), 'the oldest untriaged item survived');
  assert.ok(items.some((it) => it.text === 'the fifty-first question'));
});

test('T4d: a corrupt or non-object store resets instead of throwing past the reader', () => {
  for (const bad of ['not json at all', '{"v":1}', '[]', 'null', '{"v":1,"items":"nope"}']) {
    const ls = memStorage();
    ls.setItem('cw_capture_v1', bad);
    // eslint-disable-next-line no-new-func
    const s = new Function('localStorage', 'currentItem', `${phi}\n${storeCode}\nreturn {capRead:capRead};`)(ls, null);
    assert.deepEqual(s.capRead(), { v: 1, items: [] }, `reset on: ${bad}`);
  }
});

test('T4e: a failed write reports false rather than dropping the capture silently', () => {
  const s = makeStore({ throwOnWrite: true });
  assert.equal(s.capAdd('why clozapine here'), false);
});

test('T4f: ctx is null on special routes, never a stale cw_last slug', () => {
  assert.equal(makeStore({ currentItem: { k: 'special', f: '__home__' } }).capCtx(), null);
  assert.equal(makeStore({ currentItem: null }).capCtx(), null);
  assert.equal(makeStore({ currentItem: { k: 'page', f: 't_mood.md' } }).capCtx(), 't_mood.md');
});

test('T4g: capRisky adds ward-local location detection on top of the shared heuristic', () => {
  const s = makeStore();
  // shared PHI_PATTERNS still apply
  assert.equal(s.capRisky('MRN 4482913'), true);
  assert.equal(s.capRisky('dob 3/14/1990'), true);
  // capture-local rule the shared file deliberately does not carry
  assert.equal(s.capRisky('the guy in room 302'), true);
  assert.equal(s.capRisky('bed 4 is refusing meds'), true);
  assert.equal(s.capRisky('rm7 patient'), true);
  // legitimate clinical questions full of numbers must NOT trip it
  assert.equal(s.capRisky('why do we stop at QTc over 500'), false);
  assert.equal(s.capRisky('lithium level 1.2 — is that toxic'), false);
  assert.equal(s.capRisky('why clozapine and not another antipsychotic'), false);
});

test('T4h: every clipboard payload carries the supervised-draft stamp', () => {
  const s = makeStore();
  s.capAdd('why clozapine here');
  const out = s.capClipboardText();
  assert.match(out, /^Questions from the unit, brought to supervision\./);
  assert.match(out, /contains no patient information\./);
  assert.match(out, /- why clozapine here/);
});

test('T4i: triaged captures are excluded from the clipboard payload', () => {
  const s = makeStore();
  s.capAdd('first question');
  s.capAdd('second question');
  s.capMarkTriaged(s.capRead().items[0].id);
  const out = s.capClipboardText();
  assert.ok(!out.includes('first question'));
  assert.ok(out.includes('second question'));
});

test('T5: the study export allow-list does not carry the capture key', () => {
  // Static assertion over the payload literal — exportStudy needs Blob/URL/document, none of
  // which exist under bare `node --test`, and this suite runs before the build anyway.
  const payload = slice(shell, 'var payload={ study_id:studyId()', '};');
  assert.match(payload, /schema:'clerkship-study-v2'/, 'anchor still points at the export payload');
  assert.ok(!payload.includes('cw_capture_v1'),
    'captures are free text and must never enter the study export');
});

test('T11: the point-of-entry warning ships the approved copy', () => {
  assert.ok(shell.includes('<strong>The question, not the patient.</strong>'));
  assert.ok(shell.includes('No names, initials, room or bed numbers, dates, or MRNs'));
  assert.ok(shell.includes('Saved on this device only, never sent anywhere.'));
  assert.ok(shell.includes('<b>This may contain patient details.</b>'));
  assert.ok(shell.includes('No patient details — save'));
  assert.match(shell, /aria-label="Your question, no patient identifiers"/);
});

test('T11b: focus return is guarded on the recorded invoker still being connected and visible', () => {
  const close = slice(shell, 'function capClose(', 'function capListHtml(');
  assert.match(close, /inv\s*&&\s*inv\.isConnected\s*&&\s*inv\.offsetParent!==null/,
    'two mount points + a viewport that can cross 820px mid-dialog means the invoker may be gone');
  assert.match(close, /contentEl\.focus\(\{preventScroll:true\}\)/,
    'falls back to #content rather than leaving focus on <body>');
  assert.match(close, /aria-expanded','false'/, 'both invokers are reset on close');
});

test('T12a: the triage card offers Review only for quiz-bearing pages', () => {
  const card = slice(shell, 'function capTriageHtml(', 'function capTriageClick(');
  assert.match(card, /topicHasQuiz\(hit\.f\)/,
    'a quizless page would make seedSRS a silent no-op — do not render the control');
  assert.ok(!/data-f="/.test(card),
    'triage controls must use data-cap-* only; data-f would hit the generic .hm-li branch and '
    + 'navigate without marking the capture triaged');
});

test('T12b: the triage card degrades explicitly when the search index is unavailable', () => {
  const card = slice(shell, 'function capTriageHtml(', 'function capTriageClick(');
  assert.match(card, /if\(!SI\)/);
  assert.match(card, /Matching is unavailable right now/);
});

test('the search-index fetch re-renders home, so the degraded state cannot stick', () => {
  const fetchLine = shell.split('\n').find((l) => l.includes("fetch('search-index.json')"));
  assert.ok(fetchLine, 'search-index fetch still present');
  // specialRefresh() is the dual-root successor of capHomeRefresh() (Today/Progress split) —
  // same contract: re-render the live special view so the degraded triage state corrects.
  assert.match(fetchLine, /specialRefresh\(\)/,
    'SI===null also means "not yet resolved" — without this the triage card paints its degraded '
    + 'state on every cold load and never corrects');
});

test('the capture key is a string literal at every call site', () => {
  // The QA gate classifies non-literal keys as computed-key and hard-fails when the count exceeds
  // qa-baseline.json. Literals also let the namespace scan verify cw_* statically.
  const calls = [...shell.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([^)]*)/g)]
    .map((m) => m[1].trim())
    .filter((arg) => arg.includes('cw_capture_v1'));
  assert.equal(calls.length, 3, 'read, write, erase — and no others');
  for (const arg of calls) assert.match(arg, /^'cw_capture_v1'/);
});

test('the capture mounts are removed entirely in a faculty preview', () => {
  const wire = slice(shell, '(function capWire(', '/* ---------- Search');
  assert.match(wire, /facultyPreviewRequest/,
    'preview is a reviewer surface, not a learner session — it must not offer to write learner state');
  assert.match(wire, /removeChild/,
    'remove rather than disable, so nothing focusable is left in the preview tab order');
});
