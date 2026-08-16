// Contract for the due row and the capture triage (frontdoor/fd_due.js) -- the two Today surfaces
// the design doc marks "Port, prominent" and the swap dropped.
//
// Both functions are PURE over already-read store data, which is the whole reason this file can
// exist: the reads (cw_srs_v1 via dueBreakdown, cw_capture_v1 via capRead, the page match via
// fdSearchResults) live in fd_wire.js's fdDueState/fdCaptureState, so a zero-due day, a
// singular/plural boundary, an unmatched capture and a hostile string are all testable directly
// instead of through a synthesised localStorage.
//
// Concatenated in the same order inject_shared_snippets() uses on the built page: fd_data.js
// supplies fdEsc.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const dueSrc = read('frontdoor/fd_due.js');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('frontdoor/fd_data.js')}
  ${dueSrc}
  return { fdDueRow: fdDueRow, fdDueSubstat: fdDueSubstat, fdCaptureTriage: fdCaptureTriage,
           fdCaptureButton: fdCaptureButton };
`);
const F = make();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

const bd = (over) => Object.assign(
  { daily: { due: 0, overdue: 0 }, qb: { due: 0, overdue: 0 },
    fam: { due: 0, overdue: 0 }, other: { due: 0, overdue: 0 } }, over);

// ---- due row -------------------------------------------------------------------------

test('the due row is omitted entirely when nothing is due for daily review', () => {
  // The design point, not an edge case: promoting a zero costs a row on every caught-up day and
  // on every fresh device, and the number it promotes is "nothing to do".
  assert.equal(F.fdDueRow(bd({})), '');
  assert.equal(F.fdDueRow(bd({ qb: { due: 9, overdue: 0 } })), '',
    'question-bank cards are not servable by daily review — they are a substat, never the headline');
});

test('a missing or malformed breakdown renders nothing rather than throwing', () => {
  // fdDueState() returns null when the store read fails, and Today concatenates the result
  // unconditionally. Throwing here would degrade the whole Today surface to .fd-fallback.
  assert.equal(F.fdDueRow(null), '');
  assert.equal(F.fdDueRow(undefined), '');
  assert.equal(F.fdDueRow({}), '');
});

test('the row states the count and pluralises the noun', () => {
  const one = F.fdDueRow(bd({ daily: { due: 1, overdue: 0 } }));
  assert.match(one, /class="fd-due__n">1</);
  assert.match(one, /class="fd-due__label">card</);
  assert.doesNotMatch(one, />cards</);

  const many = F.fdDueRow(bd({ daily: { due: 12, overdue: 0 } }));
  assert.match(many, /class="fd-due__n">12</);
  assert.match(many, /class="fd-due__label">cards</);
});

test('the overdue pill appears only when something is actually overdue', () => {
  assert.doesNotMatch(F.fdDueRow(bd({ daily: { due: 4, overdue: 0 } })), /fd-due__over/);
  assert.match(F.fdDueRow(bd({ daily: { due: 4, overdue: 2 } })), /fd-due__over">2 overdue</);
});

test('the row navigates to the daily-review tool', () => {
  assert.match(F.fdDueRow(bd({ daily: { due: 1, overdue: 0 } })), /data-fd-open="review\.html"/);
});

test('the substat lists the other queues, omitting the empty ones and the daily bucket', () => {
  assert.equal(F.fdDueSubstat(bd({ daily: { due: 5, overdue: 0 } })), '',
    'the daily count is the headline one line above; restating it is how the old dashboard '
    + 'printed the same number three times');

  const some = F.fdDueSubstat(bd({ qb: { due: 3, overdue: 0 }, other: { due: 1, overdue: 0 } }));
  assert.match(some, /3 in the question bank · 1 in other practice tools/);
  assert.doesNotMatch(some, /family practice/, 'an empty queue must not print "0 in ..."');
});

// ---- capture triage ------------------------------------------------------------------

const cap = (over) => Object.assign({ items: [], matching: true, purpose: 'PURPOSE' }, over);

test('the triage list is omitted when nothing is waiting', () => {
  assert.equal(F.fdCaptureTriage(cap({})), '');
  assert.equal(F.fdCaptureTriage(null), '');
  assert.equal(F.fdCaptureTriage(undefined), '');
});

test('a waiting question renders its text, a dismiss control, and the copy-out action', () => {
  const html = F.fdCaptureTriage(cap({ items: [{ id: 'c1', text: 'why lithium here?', hit: null }] }));
  assert.match(html, /1 waiting/);
  assert.match(html, /class="fd-capture__q">why lithium here\?</);
  assert.match(html, /data-cap-drop="c1"/);
  assert.match(html, /data-cap-copy="1"/);
  assert.doesNotMatch(html, /data-cap-open/, 'nothing matched, so there is nothing to open');
});

test('a matched question offers Open, and Review only when the page has a servable quiz', () => {
  // seedSRS() refuses to schedule a page with no quiz, so offering the control there would be a
  // button that silently does nothing. Same guard the deleted card carried.
  const noQuiz = F.fdCaptureTriage(cap({
    items: [{ id: 'c1', text: 'q', hit: { ref: 'a.md', title: 'Page A', quiz: false } }] }));
  assert.match(noQuiz, /data-cap-open="c1" data-cap-f="a\.md"/);
  assert.doesNotMatch(noQuiz, /data-cap-review/);

  const withQuiz = F.fdCaptureTriage(cap({
    items: [{ id: 'c1', text: 'q', hit: { ref: 'a.md', title: 'Page A', quiz: true } }] }));
  assert.match(withQuiz, /data-cap-review="c1" data-cap-f="a\.md"/);
});

test('triage controls carry data-cap-* only, never data-fd-open', () => {
  // Each control is TWO acts — navigate (or schedule) AND mark the capture triaged. A
  // data-fd-open would ride fdDispatch and perform only the first, leaving the question in the
  // list forever. This is the contract tests/ward-capture-store.test.mjs T12a pinned for the
  // deleted card, restated for its replacement.
  const html = F.fdCaptureTriage(cap({
    items: [{ id: 'c1', text: 'q', hit: { ref: 'a.md', title: 'Page A', quiz: true } }] }));
  assert.doesNotMatch(html, /data-fd-open|data-fd-toggle|data-f="/);
});

test('the degraded branch is explicit, and only shows when matching actually failed', () => {
  const ok = F.fdCaptureTriage(cap({ items: [{ id: 'c1', text: 'q', hit: null }] }));
  assert.doesNotMatch(ok, /Matching is unavailable/,
    'nothing matched is not the same as matching is broken');

  const broken = F.fdCaptureTriage(cap({ matching: false,
    items: [{ id: 'c1', text: 'q', hit: null }] }));
  assert.match(broken, /Matching is unavailable right now — your questions are safe on this device\./);
  assert.match(broken, /data-cap-drop="c1"/, 'the questions stay listed and stay dismissible');
});

test('the purpose line is supplied by the caller, not re-declared here', () => {
  // CAP_PURPOSE is declared once in spa_index.html and tests/shell-copy.test.mjs extracts it from
  // that declaration as part of the PHI enforcement surface. A second copy in this module is a
  // second copy of copy that must never drift — and the extractor would still read the first one.
  assert.doesNotMatch(dueSrc, /Stays on this device/,
    'the purpose sentence must arrive as a parameter, never as a literal in this file');
  assert.match(F.fdCaptureTriage(cap({ purpose: 'SUPPLIED',
    items: [{ id: 'c1', text: 'q', hit: null }] })), />SUPPLIED</);
});

// ---- escaping ------------------------------------------------------------------------

test('every interpolated value is escaped — capture text, id, matched title and ref', () => {
  // Capture text is the one string on this surface a learner types. It is clamped and stored
  // verbatim (cw_capture_v1), so it reaches the renderer unsanitised by design.
  const html = F.fdCaptureTriage(cap({
    purpose: '<script>p()</script>',
    items: [{
      id: '"><script>i()</script>',
      text: '<img src=x onerror=t()>',
      hit: { ref: '"><script>r()</script>', title: '<script>h()</script>', quiz: true },
    }],
  }));
  assert.doesNotMatch(html, /<script>/, 'no unescaped tag may survive any of the four slots');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=t\(\)&gt;/);
  // The id and ref land inside double-quoted attributes, so the quote itself must be encoded or
  // the attribute closes early and everything after it becomes markup.
  assert.doesNotMatch(html, /data-cap-drop="">/);
  assert.match(html, /&quot;&gt;&lt;script&gt;i\(\)/);
});

test('the substat escapes its joined text', () => {
  // Counts are integers from the store, but the joined sentence goes through fdEsc anyway so the
  // rule "text is escaped, numbers are not" has no exception a future edit can widen.
  assert.match(F.fdDueSubstat(bd({ qb: { due: 2, overdue: 0 } })), /Also scheduled: 2 in the question bank/);
});

// ---- the capture entry point ---------------------------------------------------------

test('the capture button is omitted entirely on a faculty-preview route', () => {
  // Rule 1 of the two the deleted capWire() enforced: removed, not disabled. A capture control in
  // a reviewer's frame offers to write LEARNER state from a reviewer's seat, and a
  // disabled-but-focusable control still sits in the preview's tab order.
  assert.equal(F.fdCaptureButton(true), '');
  assert.match(F.fdCaptureButton(false), /data-fd-capture/);
  assert.match(F.fdCaptureButton(false), /aria-haspopup="dialog"/);
  assert.match(F.fdCaptureButton(false), /aria-expanded="false"/);
});

// ---- copy ----------------------------------------------------------------------------

test('no rendered string carries an audience-specific token', () => {
  // This copy ships to BOTH sites without passing through RESIDENT_REBRAND.
  const html = F.fdDueRow(bd({ daily: { due: 2, overdue: 1 }, qb: { due: 1, overdue: 0 },
    fam: { due: 1, overdue: 0 }, other: { due: 1, overdue: 0 } }))
    + F.fdCaptureTriage(cap({ matching: false, purpose: '',
      items: [{ id: 'c1', text: 'q', hit: { ref: 'a.md', title: 'Page A', quiz: true } }] }))
    + F.fdCaptureButton(false);
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});

test('fd_due.js touches no DOM, storage, or clock', () => {
  assert.doesNotMatch(dueSrc, /localStorage\.|document\.|window\.|Date\.now\(\)/,
    'the reads live in fd_wire.js; this file is a pure function of what it is handed');
});

test('fd_due.js stays ES5 — it is a build-injected snippet, not a module', () => {
  assert.doesNotMatch(dueSrc, /\bconst\s|\blet\s|=>/,
    'inject_shared_snippets() pastes this body into spa_index.html; var/function only');
  assert.doesNotMatch(dueSrc, /\bimport\s|\bexport\s/, 'snippets have no module boundary');
});

// ---- the capture matcher (fd_wire.js, the impure side) -------------------------------

// fdCaptureQuery is pure and lives in fd_wire.js beside the read it feeds. Tested here rather
// than in fd-wire.test.mjs because it is only meaningful as half of this surface.
const wireSrc = read('frontdoor/fd_wire.js');
// eslint-disable-next-line no-new-func
const captureQuery = new Function(`
  ${wireSrc.slice(wireSrc.indexOf('function fdCaptureQuery('), wireSrc.indexOf('/* The re-point'))}
  return fdCaptureQuery;
`)();

test('a captured SENTENCE is reduced to words that could plausibly be the topic', () => {
  // Found by driving the page: fdSearchResults counts any expanded word longer than one character
  // as a substring hit, and merges the safety protocols FIRST. So "for" in a full sentence matched
  // half the library and this exact capture offered to open the suicide-risk card.
  assert.equal(captureQuery('why do we give lorazepam for catatonia?'), 'lorazepam catatonia');
  assert.equal(captureQuery('how do I do a capacity assessment'), 'capacity assessment');
});

test('short ALL-CAPS acronyms survive the reduction — psychiatry is full of them', () => {
  assert.equal(captureQuery('what is the CIWA cutoff'), 'CIWA cutoff');
  assert.equal(captureQuery('when do we use ECT'), 'ECT');
  assert.equal(captureQuery('MSE vs SSRI'), 'MSE SSRI');
});

test('a question with no topical word reduces to nothing, and nothing is not an empty query', () => {
  // fdSearchResults answers an EMPTY query with the whole safety kit, so "" must mean "do not
  // attempt a match" to the caller, never "search for nothing".
  assert.equal(captureQuery('why is this so hard'), '');
  assert.equal(captureQuery(''), '');
  assert.equal(captureQuery(null), '');
  assert.match(wireSrc, /var hit=null, q=fdCaptureQuery\(it\.text\);\s*\n\s*if\(q\)\{/,
    'the caller must gate on the reduced query being non-empty');
});
