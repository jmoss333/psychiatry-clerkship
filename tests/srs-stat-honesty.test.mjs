// A learner-facing number must measure what its label says (2026-10-07).
//
// Two stats on cw_srs_v1 used to overclaim. "Day streak" was a headline tile and "Retention"
// was correct/seen across every attempt, first exposures included -- a lifetime accuracy, not
// retention (which needs correct-on-REVIEW of previously-seen cards, a split the store does
// not keep). FT-3 (163a2120, 2026-09-28) took the streak off Daily Review and the dashboard now
// shows "Choices correct · since this update"; tests/review-error-correction.test.mjs and
// tests/review-recall.test.mjs pin that for review.html ONLY. A later spec pass still found the
// old wording on a stale branch, so the regression is a live risk in any OTHER shipped surface
// that reads the same store. This file pins it repo-wide, over the one derived list of what
// ships (shipped_pages.json) plus the shell and the build-injected modules.
//
// What stats.streak means, since the field is still written (removing it would change the
// stored shape): the number of consecutive LOCAL days, ending on the last study day, on which
// the learner completed at least one graded card -- any grade, a miss included, because a
// graded miss is a completed review. It is not rendered anywhere. stats.lastStudy, written by
// the same function, feeds the "Active N of the last 7 days" strip, whose label claims activity
// and nothing more.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const SB = '13_Faculty_Resources/_automation/site_build/';

function scannedFiles() {
  const listing = JSON.parse(read(`${SB}shipped_pages.json`));
  const set = new Set();
  for (const p of listing.pages) {
    for (const f of [p.source, ...(p.extraSources || [])]) {
      if (f && /\.(html|js|mjs)$/.test(f)) set.add(f);
    }
  }
  // The shell and every build-injected module ship on every page without being a "source".
  set.add(`${SB}spa_index.html`);
  for (const dir of [SB, `${SB}frontdoor/`]) {
    for (const name of readdirSync(new URL(dir, ROOT))) {
      if (/\.js$/.test(name)) set.add(dir + name);
    }
  }
  const missing = [...set].filter((f) => !existsSync(new URL(f, ROOT)));
  assert.deepEqual(missing, [], 'a shipped html/js source is missing on disk -- the scan would shrink');
  return [...set].sort();
}

// JS comments may name the retired wording on purpose (they explain why it went); UI may not.
// HTML comments are deliberately NOT stripped: none carries the wording today, and a regex
// "sanitiser" for <!-- --> is exactly what CodeQL flags (js/incomplete-multi-character-
// sanitization) -- a scan that over-reports a comment is the safe direction here anyway.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

const FILES = scannedFiles();

test('the scan covers what ships, not a shrunken set', () => {
  // 32 shipped html/js sources + the shell + 44 build-injected modules on 2026-10-07.
  assert.ok(FILES.length >= 60, `only ${FILES.length} files scanned`);
  for (const must of ['07_Evidence_and_Reading/Landmark_Trials/review.html',
    `${SB}question-bank-practice.html`, `${SB}spa_index.html`, `${SB}frontdoor/fd_today.js`]) {
    assert.ok(FILES.includes(must), `${must} missing from the scan`);
  }
});

test('no shipped surface renders stats.streak', () => {
  const hits = [];
  for (const f of FILES) {
    const src = stripComments(read(f))
      // the one writer (and its self-read) is allowed to exist; nothing may display the value
      .replace(/function bumpStreak\([^)]*\)\{[^\n]*\}/g, '');
    if (/stats\.streak(?!\s*=[^=])/.test(src)) hits.push(f);
    if (/\bday streak\b|"stat streak"/i.test(src)) hits.push(`${f} (streak label)`);
  }
  assert.deepEqual(hits, [], 'a streak is back on a learner surface');
});

test('no shipped surface labels lifetime accuracy as "Retention"', () => {
  const hits = [];
  for (const f of FILES) {
    const src = stripComments(read(f));
    if (/["'>]Retention["'<]/.test(src)) hits.push(`${f} (Retention label)`);
    // correct/seen as one figure mixes first exposures with reviews -- whatever it is called
    if (/stats\.correct[^;\n]{0,80}\/[^;\n]{0,40}stats\.seen/.test(src)) hits.push(`${f} (correct/seen ratio)`);
  }
  assert.deepEqual(hits, [], 'an accuracy figure is claiming to be retention');
});

// The stored field keeps the meaning stated at the top of this file.
function streakWorld() {
  const review = read('07_Evidence_and_Reading/Landmark_Trials/review.html');
  const pick = (name) => {
    const m = review.match(new RegExp(`function ${name}\\([^)]*\\)\\{[^\\n]*\\}`));
    assert.ok(m, `${name} not found in review.html`);
    return m[0];
  };
  let now = new Date(2026, 9, 5, 9).getTime();
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(now); }
    static now() { return now; }
  }
  // eslint-disable-next-line no-new-func
  const bump = new Function('Date', `var DAY=86400000;${pick('todayStr')}${pick('yestStr')}${pick('bumpStreak')}return bumpStreak;`)(FakeDate);
  return { bump, advanceDays: (d) => { now += d * 86400000; } };
}

test('stats.streak counts consecutive study days, once per day, and resets after a gap', () => {
  const w = streakWorld();
  const s = { stats: { streak: 0, lastStudy: '' } };
  w.bump(s); assert.equal(s.stats.streak, 1, 'first graded card starts the run');
  w.bump(s); assert.equal(s.stats.streak, 1, 'a second card the same day is not a second day');
  w.advanceDays(1); w.bump(s); assert.equal(s.stats.streak, 2, 'next day extends it');
  w.bump(s); w.bump(s); assert.equal(s.stats.streak, 2, 'more cards on day two leave it at two');
  w.advanceDays(2); w.bump(s); assert.equal(s.stats.streak, 1, 'a skipped day restarts it');
  assert.match(s.stats.lastStudy, /^\d{4}-\d{1,2}-\d{1,2}$/, 'lastStudy feeds the activity strip');
});

test('Daily Review records a study day only for a grade it accepts', () => {
  const review = read('07_Evidence_and_Reading/Landmark_Trials/review.html');
  const g = review.slice(review.indexOf('function grade(g){'), review.indexOf('function endSession()'));
  const guard = g.indexOf('if(!isRecall && g>1 && s.chosen!==correctIdx(s.card)) return;');
  const bump = g.indexOf('bumpStreak(st);');
  assert.ok(guard > -1 && bump > guard,
    'a refused Good/Easy on a miss must return before anything is recorded');
});
