import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// F8 director-dashboard PROTOTYPE (unshipped). Pins the aggregate-only contract and the
// small-cell suppression rule (n<5, configurable upward only). Reads committed files only.
// Design: docs/superpowers/specs/2026-10-27-director-dashboard-design.md
// Contract: _prototypes/director-dashboard/DATA_CONTRACT.md

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(repo, '_prototypes', 'director-dashboard');
const html = fs.readFileSync(path.join(DIR, 'director-dashboard.html'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(DIR, 'director-dashboard.fixture.json'), 'utf8'));

function loadEngine() {
  const m = html.match(/<script id="dd-engine">([\s\S]*?)<\/script>/);
  assert.ok(m, 'engine script block present');
  const ctx = {};
  vm.runInNewContext(`${m[1]}\nthis.DD = DD;`, ctx);
  return ctx.DD;
}
const DD = loadEngine();
const clone = (o) => JSON.parse(JSON.stringify(o));
const SELECTIONS = [];
for (const b of fixture.rotationBlocks) SELECTIONS.push({ site: b.site, block: b.id });
SELECTIONS.push({ site: 'ms3', block: 'all' }, { site: 'res', block: 'all' });

// Every displayed count, from every panel, for every selection.
function allCells(feed) {
  const cells = [];
  for (const sel of SELECTIONS) {
    const r = DD.reach(feed, sel);
    for (const row of r.rows) cells.push(row.reads, row.tools, row.total);
    const f = DD.funnel(feed, sel);
    for (const part of [f.qbank, f.review]) {
      cells.push(part.opens);
      for (const st of part.steps) cells.push(st.count);
    }
    for (const row of DD.bands(feed, sel).rows) cells.push(row.total, ...row.cells);
    for (const row of DD.topics(feed, sel).rows) cells.push(row.total);
  }
  return cells;
}

test('fixture is labelled synthetic and satisfies the aggregate-only contract', () => {
  assert.equal(fixture._synthetic, true);
  assert.match(fixture._label, /MOCK DATA/);
  assert.deepEqual([...DD.validateFeed(fixture)], []);
});

test('fixture exercises suppression: it holds raw cells between 1 and 4', () => {
  assert.ok(fixture.counters.some((r) => r.n > 0 && r.n < 5));
});

test('cell(): every n below the threshold renders "<5"; at or above renders the number', () => {
  for (const n of [0, 1, 2, 3, 4]) {
    const c = DD.cell(n, 5);
    assert.equal(c.shown, false);
    assert.equal(c.text, '<5');
  }
  assert.deepEqual({ ...DD.cell(5, 5) }, { n: 5, shown: true, text: '5' });
});

test('no panel ever displays a count below the threshold (default 5)', () => {
  const cells = allCells(fixture);
  assert.ok(cells.length > 100);
  for (const c of cells) {
    if (c.shown) assert.ok(c.n >= 5, `shown cell ${c.n} < 5`);
    else assert.match(c.text, /^(<5|—\*)$/);
  }
  assert.ok(cells.some((c) => !c.shown), 'the synthetic feed produces suppressed cells');
  assert.ok(cells.some((c) => c.shown), 'and shown cells');
});

test('threshold is configurable upward: at 10 no displayed count is below 10', () => {
  const feed = clone(fixture);
  feed.suppressionThreshold = 10;
  assert.deepEqual([...DD.validateFeed(feed)], []);
  assert.equal(DD.threshold(feed), 10);
  for (const c of allCells(feed)) {
    if (c.shown) assert.ok(c.n >= 10);
    else assert.match(c.text, /^(<10|—\*)$/);
  }
});

test('threshold cannot be lowered below the n>=5 policy floor', () => {
  const feed = clone(fixture);
  feed.suppressionThreshold = 3;
  assert.ok(DD.validateFeed(feed).some((e) => /policy floor/.test(e)));
  assert.equal(DD.threshold(feed), 5, 'renderer falls back to the floor even if called directly');
});

test('complementary suppression: one hidden cell in a totalled row hides the next smallest', () => {
  const row = DD.suppressRow([3, 9, 20], 5);
  assert.deepEqual([...row].map((c) => c.shown), [false, false, true]);
  assert.equal(row[1].secondary, true);
  const two = DD.suppressRow([3, 4, 20], 5);
  assert.deepEqual([...two].map((c) => c.shown), [false, false, true]);
  assert.ok(!two.some((c) => c.secondary), 'two primary suppressions need no secondary');
  assert.deepEqual([...DD.suppressRow([6, 9, 20], 5)].map((c) => c.shown), [true, true, true]);
});

test('band rows with a shown total never expose exactly one hidden cell', () => {
  for (const sel of SELECTIONS) {
    for (const row of DD.bands(fixture, sel).rows) {
      if (!row.total.shown) continue;
      const hidden = row.cells.filter((c) => !c.shown).length;
      assert.notEqual(hidden, 1, `rotation week ${row.rw} of ${sel.site}/${sel.block}`);
    }
  }
});

test('rate(): suppressed on small numerator or denominator; lower bound on small complement', () => {
  assert.equal(DD.rate(3, 40, 5).state, 'suppressed');
  assert.equal(DD.rate(4, 4, 5).state, 'suppressed');
  const ok = DD.rate(10, 40, 5);
  assert.equal(ok.state, 'ok');
  assert.equal(ok.text, '25%');
  const b = DD.rate(18, 21, 5); // 3 outside the numerator: never print the exact share
  assert.equal(b.state, 'bounded');
  assert.ok(!('value' in b));
  assert.ok(b.lower <= 18 / 21);
  assert.equal(DD.meetsBar(b, 0.8), true);
  assert.equal(DD.meetsBar(DD.rate(3, 40, 5), 0.7), null);
});

test('ISO week maps to rotation week through the block calendar', () => {
  const placed = DD.placeCounters(fixture);
  const b1 = placed.filter((r) => r.block === 'MS3-B1');
  assert.ok(b1.length > 0);
  const raw = fixture.counters.filter((r) => r.site === 'ms3');
  const w37 = raw.filter((r) => r.week === '2026-W37').length;
  assert.equal(b1.filter((r) => r.rw === 1).length, w37, '2026-09-07 starts in 2026-W37');
  assert.equal(b1.filter((r) => r.rw === 6).length, raw.filter((r) => r.week === '2026-W42').length);
  assert.ok(!b1.some((r) => r.rw > 6));
  assert.ok(placed.every((r) => r.rw >= 1));
});

test('validateFeed rejects identifiers, non-integers and overlapping blocks', () => {
  const withName = clone(fixture);
  withName.counters[0].student = 'x';
  assert.ok(DD.validateFeed(withName).some((e) => /"student" is not in the aggregate-only contract/.test(e)));
  const withTop = clone(fixture);
  withTop.learners = [];
  assert.ok(DD.validateFeed(withTop).some((e) => /"learners"/.test(e)));
  const withPp = clone(fixture);
  withPp.prepost[0].studyCode = 'PP-ABC123';
  assert.ok(DD.validateFeed(withPp).some((e) => /"studyCode"/.test(e)));
  const frac = clone(fixture);
  frac.counters[0].n = 2.5;
  assert.ok(DD.validateFeed(frac).some((e) => /non-negative integer/.test(e)));
  const overlap = clone(fixture);
  overlap.rotationBlocks[1].start = '2026-10-05';
  assert.ok(DD.validateFeed(overlap).some((e) => /overlap/.test(e)));
  const noFlag = clone(fixture);
  delete noFlag._synthetic;
  assert.ok(DD.validateFeed(noFlag).length > 0);
});

test('page: persistent MOCK banner, no storage, no network beyond the fixture, no external URLs', () => {
  assert.match(html, /MOCK DATA — no learner data has been collected/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest/);
  const fetches = html.match(/fetch\(([^)]*)\)/g) || [];
  assert.deepEqual(fetches, ['fetch(FIXTURE)']);
  assert.match(html, /var FIXTURE = 'director-dashboard\.fixture\.json';/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test('prototype is not registered to ship', () => {
  const shipped = fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/shipped_pages.json'), 'utf8');
  const extras = fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/site_extras.py'), 'utf8');
  assert.doesNotMatch(shipped, /director-dashboard/);
  assert.doesNotMatch(extras, /director-dashboard/);
});
