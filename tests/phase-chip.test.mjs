// Wiring contract for the home "rotation phase" chip (renderHome, spa_index.html) and the
// single-source shelf-date parsing it depends on. Mirrors the behaviour/wiring split
// tests/phase-policy.test.mjs (behaviour of phasePolicy()/shelfDaysUntil() themselves, evaluated
// from the injected snippet body) vs. tests/phase-wiring.test.mjs (review.html's wiring) already
// use for the PHASE_POLICY snippet — this file is the third leg: spa_index.html's wiring.
//
//   (a) the /*__PHASE_POLICY__*/ marker appears exactly once in spa_index.html;
//   (b) spa_index.html does not reimplement `function phasePolicy(`/`function shelfDaysUntil(`
//       locally — the canonical body lives in phase_policy.js only, arriving via marker
//       expansion at build time (never hand-typed in this consumer);
//   (c) THE DEDUP PIN: spa_index.html's SOURCE contains zero inline `+'T00:00:00'` date-parse
//       literals. Before this task, the shelf-countdown card and shelfIntensityHtml() each
//       carried their own copy of `new Date(shelf+'T00:00:00')` — two independent parses that
//       could silently disagree at a day boundary. Both are now rewired to call the single
//       shared shelfDaysUntil() helper instead. This is a plain string scan of the SOURCE file,
//       not the built output: the /*__PHASE_POLICY__*/ marker in this file is text only until
//       inject_shared_snippets() (common.py) replaces it with phase_policy.js's body (which DOES
//       contain "T00:00:00") at build time. Since that expansion never happens to this source
//       file, a source scan can never "see" the injected snippet body and false-pass — the same
//       reasoning tests/phase-wiring.test.mjs test (c) applies to review.html's literal
//       'cw_shelf_date' check;
//   (d) the phase-chip slice marker pair appears exactly once;
//   (e) behavioural coverage of the sliced chip-render fragment itself (hand-written, not
//       injected — same technique tests/phase-wiring.test.mjs's effectiveNewPerDay() coverage
//       and tests/srs-home-counters.test.mjs use: slice the real code out of the shipped source
//       and execute it via `new Function`, stubbing only the two things it closes over
//       (phasePolicy, esc) so the sliced logic itself runs unmodified): non-unset phase renders
//       the escaped label inside a `.hm-phase` pill; 'unset' phase renders the existing
//       `data-pt="start"` Start-here affordance instead (constraint: no new click-delegation
//       branch — this is the SAME data-pt="start" -> navClick('__start__') pattern
//       shelfIntensityHtml's unset case already uses).
//
// dueBreakdown and calib-panel slice regions are pinned by their own suites
// (tests/srs-home-counters.test.mjs, tests/calib-panel.test.mjs) and tests/spa-shell-a11y.test.mjs
// covers shell a11y structure — this file does not duplicate those; run all three alongside this
// one to confirm the phase-chip edit left them untouched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const MARKER = '/*__PHASE_POLICY__*/';
const CHIP_START = '/* ---- phase chip ---- */';
const CHIP_END = '/* ---- end phase chip ---- */';

const source = readFileSync(new URL(`../${SPA}`, import.meta.url), 'utf8');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

// ---- (a) marker present exactly once -----------------------------------------------

test('spa_index.html carries the PHASE_POLICY marker exactly once', () => {
  const count = source.split(MARKER).length - 1;
  assert.equal(count, 1, `expected exactly one ${MARKER} in ${SPA}, found ${count}`);
});

// ---- (b) no local reimplementation of the canonical functions ----------------------

test('spa_index.html does not reimplement phasePolicy() or shelfDaysUntil() locally', () => {
  assert.doesNotMatch(source, /function\s+phasePolicy\s*\(/,
    'phasePolicy must arrive only via the injected /*__PHASE_POLICY__*/ marker');
  assert.doesNotMatch(source, /function\s+shelfDaysUntil\s*\(/,
    'shelfDaysUntil must arrive only via the injected /*__PHASE_POLICY__*/ marker');
});

// ---- (c) THE DEDUP PIN: zero inline +'T00:00:00' literals outside the snippet ------

test("spa_index.html source contains zero inline +'T00:00:00' date-parse literals", () => {
  const needle = "+'T00:00:00'";
  const count = source.split(needle).length - 1;
  assert.equal(count, 0,
    `expected zero inline ${needle} literals in ${SPA} (both the shelf-countdown card and `
    + 'shelfIntensityHtml must call the shared shelfDaysUntil() instead), found ' + count);
});

// ---- (d) phase-chip slice marker pair appears exactly once -------------------------

test('the phase chip marker pair appears exactly once in spa_index.html', () => {
  const startCount = source.split(CHIP_START).length - 1;
  const endCount = source.split(CHIP_END).length - 1;
  assert.equal(startCount, 1, 'expected exactly one phase-chip start marker');
  assert.equal(endCount, 1, 'expected exactly one phase-chip end marker');
});

// ---- (e) behavioural coverage of the sliced chip-render fragment -------------------

const chipCode = slice(source, CHIP_START, CHIP_END);

function buildChip(phasePolicyStub, escStub) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('phasePolicy', 'esc', `
    var h = '';
    ${chipCode}
    return h;
  `);
  return fn(phasePolicyStub, escStub || ((s) => s));
}

test('non-unset phase renders the escaped label inside a .hm-phase pill', () => {
  const html = buildChip(() => ({
    phase: 'taper', daysToShelf: 5, newPerDayCap: 5,
    label: 'Exam in 5 days — taper new cards, review daily.',
  }));
  assert.equal(html, '<span class="hm-phase">Exam in 5 days — taper new cards, review daily.</span>');
});

test('the label is passed through esc(), not concatenated raw', () => {
  const html = buildChip(
    () => ({ phase: 'encode', label: 'Exam in 40 days' }),
    (s) => `ESC(${s})`,
  );
  assert.equal(html, '<span class="hm-phase">ESC(Exam in 40 days)</span>',
    'the chip must call esc(p.label), not interpolate p.label unescaped');
});

test("'unset' phase renders the existing data-pt=\"start\" Start-here button, not the label", () => {
  const html = buildChip(() => ({ phase: 'unset', daysToShelf: null, newPerDayCap: 12,
    label: 'Set an exam date on Start-here to guide pacing.' }));
  assert.match(html, /<span class="hm-phase">/, 'unset case still renders inside the .hm-phase pill');
  assert.match(html, /<button class="hm-inl" data-pt="start">Start-here<\/button>/,
    'unset case must reuse the existing hm-inl/data-pt="start" Start-here affordance — '
    + 'the SAME pattern shelfIntensityHtml() already uses — so no new click-delegation branch '
    + 'is required for the label text itself');
});

test('every other phase value (not just "unset") renders the label path', () => {
  for (const phase of ['post', 'taper', 'consolidate', 'interleave', 'encode']) {
    const html = buildChip(() => ({ phase, label: `label-for-${phase}` }));
    assert.equal(html, `<span class="hm-phase">label-for-${phase}</span>`, `phase=${phase}`);
  }
});

test('if phasePolicy() throws, the chip renders nothing rather than breaking renderHome', () => {
  const html = buildChip(() => { throw new Error('phasePolicy unavailable'); });
  assert.equal(html, '', 'a thrown phasePolicy() must not propagate into renderHome()');
});
