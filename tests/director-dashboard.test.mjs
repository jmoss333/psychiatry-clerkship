import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import '../metrics/aggregate/cohort_aggregate.js';
import { generate, serialise, SYNTHETIC_BLOCKS } from '../metrics/aggregate/synthetic_feed_generator.mjs';

// F8 cohort aggregate (D-F8-2 / D-F8-6). ONE engine — metrics/aggregate/cohort_aggregate.js —
// serves both the unshipped director dashboard and the metrics site's read-only function; it is
// tested here, once. Reads committed files only.
// Design: docs/superpowers/specs/2026-10-27-director-dashboard-design.md
// Contract: _prototypes/director-dashboard/DATA_CONTRACT.md
//
// THE DIFFERENCING PROOFS do not trust the engine's own identities. The synthetic generator draws
// disjoint VISIT ATOMS and derives the counters from them the way PR #1076's emitter does. Every
// published cell is re-derived here, from its documented meaning, as a set of atoms; a reader's
// knowledge is then the linear span of the shown cells, and the tests check that no natural
// category (any block x rotation-week range x tier range x band/key/category choice) holding
// 1..t-1 visits lies in that span — which covers every pair difference, every nested-tier
// difference and every complement — plus an explicit pairwise check.

const A = globalThis.CohortAggregate;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(repo, '_prototypes', 'director-dashboard');
const FEED_PATH = path.join(repo, 'metrics', 'aggregate', 'synthetic_feed.json');
const html = fs.readFileSync(path.join(DIR, 'director-dashboard.html'), 'utf8');
const fixtureText = fs.readFileSync(FEED_PATH, 'utf8');
const fixture = JSON.parse(fixtureText);
const clone = (o) => JSON.parse(JSON.stringify(o));
const BANDS = ['lt50', '50to79', '80up'];
const QTIERS = ['lt5', '5to9', '10to19', '20up'];
const RTIERS = ['none', '1to9', '10to24', '25up'];

// ---------------------------------------------------------------- independent auditor
function blocksOf(feed, site, gid) {
  const ids = feed.rotationBlocks.filter((b) => b.site === site).map((b) => b.id);
  return gid === 'all' ? ids : [gid];
}

/** Every published count cell with its atom predicate, its published state and its truth. */
function publishedCells(feed, pub, atoms) {
  const out = [];
  for (const [site, S] of Object.entries(pub.sites)) {
    const siteAtoms = atoms.filter((a) => a.site === site);
    for (const [gid, G] of Object.entries(S.groups)) {
      const inG = new Set(blocksOf(feed, site, gid));
      const push = (label, family, cell, pred) => {
        const idx = [];
        siteAtoms.forEach((a, i) => { if (a.family === family && inG.has(a.block) && pred(a)) idx.push(i); });
        const truth = idx.reduce((s, i) => s + siteAtoms[i].n, 0);
        out.push({ site, family, label: `${site}/${gid}/${label}`, cell, idx, truth });
      };
      for (const r of G.reach) {
        push(`reads w${r.rw}`, 'reads', r.reads, (a) => a.rw === r.rw);
        push(`tools w${r.rw}`, 'tools', r.tools, (a) => a.rw === r.rw);
      }
      for (const [f, tiers] of [['qbank', QTIERS], ['review', RTIERS]]) {
        const F = G.funnel[f];
        assert.equal(F.withheld, false, 'atom-generated feeds are always consistent');
        push(`${f} opens`, f, F.opens, () => true);
        F.tiers.forEach((t, i) => {
          assert.equal(t.tier, tiers[i]);
          push(`${f} ${t.tier}`, f, t.count, (a) => a.tier === tiers[i]);
        });
      }
      for (const row of G.bands) {
        const tenPlus = (a) => a.rw === row.rw && (a.tier === '10to19' || a.tier === '20up');
        row.cells.forEach((c, i) => push(`band w${row.rw} ${BANDS[i]}`, 'qbank', c, (a) => tenPlus(a) && a.band === BANDS[i]));
        push(`band w${row.rw} total`, 'qbank', row.total, tenPlus);
      }
      for (const t of G.topics) {
        push(`topic ${t.category} low`, 'topics', t.low, (a) => a.cat === t.category && a.band === 'lt50');
        push(`topic ${t.category} rest`, 'topics', t.rest, (a) => a.cat === t.category && a.band !== 'lt50');
        push(`topic ${t.category} total`, 'topics', t.total, (a) => a.cat === t.category);
      }
    }
  }
  return out;
}

// Exact rank arithmetic, written independently of the engine's (integers + gcd).
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
class Span {
  constructor(n) { this.n = n; this.rows = []; } // rows: { pivot, v } in echelon form
  reduce(vec) {
    const v = vec.slice();
    for (const { pivot, v: r } of this.rows) {
      if (v[pivot] === 0) continue;
      const a = r[pivot], b = v[pivot];
      for (let k = 0; k < this.n; k++) {
        v[k] = v[k] * a - r[k] * b;
        assert.ok(Number.isSafeInteger(v[k]), 'exact arithmetic stayed in range');
      }
      const g = v.reduce((s, x) => (x ? gcd(s, x) : s), 0);
      if (g > 1) for (let k = 0; k < this.n; k++) v[k] /= g;
    }
    return v;
  }
  add(vec) {
    const v = this.reduce(vec);
    const pivot = v.findIndex((x) => x !== 0);
    if (pivot >= 0) this.rows.push({ pivot, v });
  }
  contains(vec) { return this.reduce(vec).every((x) => x === 0); }
}

const ranges = (n) => { const r = []; for (let i = 0; i < n; i++) for (let j = i; j < n; j++) r.push([i, j]); return r; };
const subsets = (xs) => { const r = []; for (let m = 1; m < (1 << xs.length); m++) r.push(xs.filter((_, i) => m & (1 << i))); return r; };

/** Natural categories over one site's atoms of one family: [label, predicate]. */
function categories(feed, site, family, siteAtoms) {
  const blocks = feed.rotationBlocks.filter((b) => b.site === site);
  const blockOpts = [...blocks.map((b) => [b.id, new Set([b.id])]), ['all', new Set(blocks.map((b) => b.id))]];
  const maxW = Math.max(...blocks.map((b) => b.weeks));
  const fa = siteAtoms.filter((a) => a.family === family);
  let dims;
  if (family === 'qbank') {
    dims = ranges(4).flatMap(([i, j]) => [['any', null], ...subsets(BANDS).map((s) => [s.join('+'), s])].map(([bl, bs]) =>
      [`tiers ${QTIERS[i]}..${QTIERS[j]} bands ${bl}`, (a) => {
        const ti = QTIERS.indexOf(a.tier);
        return ti >= i && ti <= j && (bs === null || (a.band !== undefined && bs.includes(a.band)));
      }]));
  } else if (family === 'review') {
    dims = ranges(4).map(([i, j]) => [`tiers ${RTIERS[i]}..${RTIERS[j]}`, (a) => {
      const ti = RTIERS.indexOf(a.tier); return ti >= i && ti <= j;
    }]);
  } else if (family === 'topics') {
    const cats = [...new Set(fa.map((a) => a.cat))];
    dims = [null, ...cats].flatMap((c) => subsets(BANDS).map((bs) =>
      [`cat ${c ?? 'any'} bands ${bs.join('+')}`, (a) => (c === null || a.cat === c) && bs.includes(a.band)]));
  } else {
    const keys = [...new Set(fa.map((a) => a.key))];
    dims = [null, ...keys].map((k) => [`key ${k ?? 'any'}`, (a) => k === null || a.key === k]);
  }
  const out = [];
  for (const [bl, bset] of blockOpts) {
    for (const [i, j] of ranges(maxW)) {
      for (const [dl, pred] of dims) {
        out.push([`${site}/${bl}/w${i + 1}-${j + 1}/${family}/${dl}`,
          (a) => bset.has(a.block) && a.rw >= i + 1 && a.rw <= j + 1 && pred(a)]);
      }
    }
  }
  return out;
}

/** Full differencing audit. Returns a list of human-readable leaks (empty = protected). */
function audit(feed, atoms, { primaryOnly = false } = {}) {
  const pub = A.publish(feed);
  const t = pub.suppressionThreshold;
  const cells = publishedCells(feed, pub, atoms);
  // Vacuity control: re-show every complementary (secondary) suppression, i.e. publish with
  // primary suppression only — exactly the v1 prototype's posture for most cells.
  if (primaryOnly) for (const c of cells) if (!c.cell.shown && c.truth >= t) Object.assign(c.cell, { shown: true, n: c.truth });
  const leaks = [];
  for (const c of cells) {
    if (c.cell.shown) {
      if (c.cell.n !== c.truth) leaks.push(`${c.label}: published ${c.cell.n} but atoms say ${c.truth}`);
      if (c.cell.n < t) leaks.push(`${c.label}: shown count ${c.cell.n} < ${t}`);
    } else if ('n' in c.cell) leaks.push(`${c.label}: hidden cell carries a value`);
  }
  for (const site of Object.keys(pub.sites)) {
    const siteAtoms = atoms.filter((a) => a.site === site);
    for (const family of ['qbank', 'review', 'reads', 'tools', 'topics']) {
      const fam = cells.filter((c) => c.site === site && c.family === family);
      const shown = fam.filter((c) => c.cell.shown);
      // (a) pairwise: nested published cells never differ by 1..t-1.
      for (const a of shown) for (const b of shown) {
        if (a === b || a.idx.length > b.idx.length) continue;
        const bs = new Set(b.idx);
        if (a.idx.every((i) => bs.has(i))) {
          const d = b.cell.n - a.cell.n;
          if (d >= 1 && d < t) leaks.push(`pair: ${b.label} - ${a.label} = ${d}`);
        }
      }
      // (b) any linear combination: no small natural category is in the span of shown cells.
      const span = new Span(siteAtoms.length);
      const vec = (idx) => { const v = new Array(siteAtoms.length).fill(0); idx.forEach((i) => { v[i] = 1; }); return v; };
      shown.forEach((c) => span.add(vec(c.idx)));
      for (const [label, pred] of categories(feed, site, family, siteAtoms)) {
        const idx = [];
        siteAtoms.forEach((a, i) => { if (pred(a)) idx.push(i); });
        const v = idx.reduce((s, i) => s + siteAtoms[i].n, 0);
        if (v >= 1 && v < t && span.contains(vec(idx))) leaks.push(`derivable small category ${label} = ${v}`);
      }
    }
  }
  return { pub, cells, leaks };
}

// ---------------------------------------------------------------- fixture + contract
test('fixture is synthetic, reproducible from its generator, and satisfies the contract', () => {
  assert.equal(fixture._synthetic, true);
  assert.match(fixture._label, /MOCK DATA/);
  assert.deepEqual([...A.validateFeed(fixture)], []);
  assert.equal(serialise(generate().feed), fixtureText, 'run: node metrics/aggregate/synthetic_feed_generator.mjs --write');
  assert.ok(fixture.counters.some((r) => r.n > 0 && r.n < 5), 'fixture holds raw cells of 1..4');
});

test('D-F8-6: the fixture publishes no differenceable small cell (pairs, nested tiers, any combination)', () => {
  const { atoms } = generate();
  const { cells, leaks } = audit(fixture, atoms);
  assert.deepEqual(leaks, []);
  assert.ok(cells.some((c) => !c.cell.shown) && cells.some((c) => c.cell.shown), 'both suppressed and shown cells occur');
  assert.ok(cells.some((c) => !c.cell.shown && c.truth >= 5), 'complementary (secondary) suppression occurred');
});

test('the auditor is not vacuous: primary-only suppression of the same fixture leaks', () => {
  const { leaks } = audit(fixture, generate().atoms, { primaryOnly: true });
  assert.ok(leaks.some((l) => l.startsWith('pair:')), 'a nested pair differs by 1..4');
  assert.ok(leaks.some((l) => l.startsWith('derivable small category')), 'a small category is derivable');
});

test('D-F8-6: adversarial random feeds (many small cells) never leak', () => {
  const layouts = [
    SYNTHETIC_BLOCKS,
    // blocks of unequal length on one site: the pooled view covers weeks only one block has
    [{ id: 'A', site: 'ms3', start: '2026-09-07', weeks: 6, size: 1 },
      { id: 'B', site: 'ms3', start: '2026-10-19', weeks: 4, size: 0.5 },
      { id: 'C', site: 'ms3', start: '2026-11-16', weeks: 3, size: 0.3 }],
  ];
  let checked = 0;
  for (const blocks of layouts) {
    for (const [k, scale] of [0.08, 0.15, 0.25, 0.4, 0.7, 1.2].entries()) {
      const { feed, atoms } = generate({ seed: 1000 + 37 * k + blocks.length, blocks, scale });
      const { leaks } = audit(feed, atoms);
      assert.deepEqual(leaks, [], `seed ${1000 + 37 * k + blocks.length} scale ${scale}`);
      checked++;
    }
  }
  assert.equal(checked, 12);
});

test('D-F8-6: cumulative thresholds are never published — the funnel is disjoint tiers', () => {
  const pub = A.publish(fixture);
  const text = JSON.stringify(pub);
  assert.doesNotMatch(text, /answered-(5|10|20)|graded-(1|10|25)/);
  for (const S of Object.values(pub.sites)) for (const G of Object.values(S.groups)) {
    assert.deepEqual(G.funnel.qbank.tiers.map((x) => x.tier), ['lt5', '5to9', '10to19', '20up']);
    const shown = G.funnel.qbank.tiers.filter((x) => x.count.shown);
    if (G.funnel.qbank.opens.shown && shown.length === 4) {
      assert.equal(shown.reduce((s, x) => s + x.count.n, 0), G.funnel.qbank.opens.n, 'tiers partition opens');
    }
  }
});

test('D-F8-6 regression: each leak of the v1 prototype is now closed', () => {
  const base = { _synthetic: true, contractVersion: 1, prepost: [],
    rotationBlocks: [{ id: 'B1', site: 'ms3', start: '2026-09-07', weeks: 1 },
      { id: 'B2', site: 'ms3', start: '2026-09-14', weeks: 1 }] };
  const rec = (week, key, n) => ({ site: 'ms3', week, key, n });
  // v1 showed answered-5 = 27 and answered-10 = 24 side by side: 3 visits by subtraction.
  const nested = { ...base, counters: [rec('2026-W37', 'page:question-bank-practice.html', 40),
    rec('2026-W37', 'tool:qbank:answered-5', 27), rec('2026-W37', 'tool:qbank:answered-10', 24),
    rec('2026-W37', 'tool:qbank:answered-20', 20)] };
  const q = A.publish(nested).sites.ms3.groups.B1.funnel.qbank;
  const byTier = Object.fromEntries(q.tiers.map((x) => [x.tier, x.count]));
  assert.equal(byTier['5to9'].shown, false);
  assert.equal(byTier['10to19'].shown, false);
  // the hidden tiers' sum (opens - shown tiers) is never 1..4
  const shownSum = q.tiers.filter((x) => x.count.shown).reduce((s, x) => s + x.count.n, 0);
  if (q.opens.shown) assert.ok(q.opens.n - shownSum === 0 || q.opens.n - shownSum >= 5);
  // v1 showed "all blocks" = 23 and B2 = 20 for the same week: B1 = 3 by subtraction.
  const pooled = { ...base, counters: [rec('2026-W37', 'page:catatonia.md', 3), rec('2026-W38', 'page:catatonia.md', 20)] };
  const S = A.publish(pooled).sites.ms3.groups;
  const shownCells = [S.B1.reach[0].reads, S.B2.reach[0].reads, S.all.reach[0].reads].filter((c) => c.shown);
  assert.ok(shownCells.length <= 1, 'block and pooled cells cannot both be shown when one block is small');
  // v1 showed reads + tools = total with one side small. There is no total column any more.
  assert.equal('total' in S.all.reach[0], false);
});

// ---------------------------------------------------------------- protect() unit cases
const P = (cells, eqs, t = 5) => A.protect(cells, eqs, t).hidden;

test('protect: one hidden part forces a complementary suppression', () => {
  const h = P({ T: 32, a: 3, b: 9, c: 20 }, [{ lhs: ['T'], rhs: ['a', 'b', 'c'] }]);
  assert.deepEqual([h.a, h.b, h.c, h.T], [true, true, false, false]);
});

test('protect: two hidden parts that sum to 1..4 are not enough (the "all but 3" leak)', () => {
  const h = P({ T: 23, a: 1, b: 2, c: 20 }, [{ lhs: ['T'], rhs: ['a', 'b', 'c'] }]);
  assert.equal(h.c || h.T, true, 'T - c = 3 must not be readable');
});

test('protect: zeros may be implied (they disclose absence, not a person)', () => {
  const h = P({ T: 20, a: 0, b: 0, c: 20 }, [{ lhs: ['T'], rhs: ['a', 'b', 'c'] }]);
  assert.deepEqual([h.a, h.b, h.c, h.T], [true, true, false, false]);
});

test('protect: a hidden cell recoverable only by combining identities is caught', () => {
  // 2x2 table with margins where row/column rules alone pass but the grand total pins x.
  const cells = { x: 3, y: 40, z: 40, w: 7, r1: 43, r2: 47, c1: 43, c2: 47, G: 90 };
  const eqs = [
    { lhs: ['r1'], rhs: ['x', 'y'] }, { lhs: ['r2'], rhs: ['z', 'w'] },
    { lhs: ['c1'], rhs: ['x', 'z'] }, { lhs: ['c2'], rhs: ['y', 'w'] },
    { lhs: ['G'], rhs: ['r1', 'r2'] }, { lhs: ['G'], rhs: ['c1', 'c2'] },
  ];
  const h = P(cells, eqs);
  const hiddenIds = Object.keys(h).filter((k) => h[k]);
  assert.ok(hiddenIds.includes('x'));
  assert.deepEqual(A.determinable(cells, eqs, h).filter((d) => d.value !== 0), []);
});

test('threshold is configurable upward only; at 10 nothing below 10 is shown', () => {
  const feed = clone(fixture);
  feed.suppressionThreshold = 10;
  assert.deepEqual([...A.validateFeed(feed)], []);
  const { cells, leaks } = audit(feed, generate().atoms);
  assert.deepEqual(leaks, []);
  for (const c of cells) if (c.cell.shown) assert.ok(c.cell.n >= 10);
  const low = clone(fixture);
  low.suppressionThreshold = 3;
  assert.ok(A.validateFeed(low).some((e) => /policy floor/.test(e)));
  assert.equal(A.threshold(low), 5, 'falls back to the floor even if called directly');
});

test('inconsistent counters withhold the funnel instead of guessing', () => {
  const feed = clone(fixture);
  feed.counters.push({ site: 'ms3', week: '2026-W37', key: 'tool:qbank:answered-20', n: 999 });
  const S = A.publish(feed).sites.ms3.groups;
  assert.deepEqual(S.all.funnel.qbank, { withheld: true });
});

test('feasibility rates: suppressed on small n, lower bound on small complement', () => {
  assert.equal(A.rate(3, 40, 5).state, 'suppressed');
  assert.equal(A.rate(4, 4, 5).state, 'suppressed');
  assert.equal(A.rate(10, 40, 5).text, '25%');
  const b = A.rate(18, 21, 5);
  assert.equal(b.state, 'bounded');
  assert.ok(!('value' in b));
  assert.equal(A.meetsBar(b, 0.8), true);
  assert.equal(A.meetsBar(A.rate(3, 40, 5), 0.7), null);
  const res = A.publish(fixture).sites.res.feasibility;
  assert.equal(res.consent.rate.state, 'suppressed', 'a 4-learner block reveals no rate');
});

test('ISO week maps to rotation week through the block calendar', () => {
  const placed = A.placeCounters(fixture);
  const b1 = placed.filter((r) => r.block === 'MS3-B1');
  const raw = fixture.counters.filter((r) => r.site === 'ms3');
  assert.equal(b1.filter((r) => r.rw === 1).length, raw.filter((r) => r.week === '2026-W37').length, '2026-09-07 starts in 2026-W37');
  assert.equal(b1.filter((r) => r.rw === 6).length, raw.filter((r) => r.week === '2026-W42').length);
  assert.ok(!b1.some((r) => r.rw > 6));
});

test('validateFeed rejects identifiers, non-integers and overlapping blocks', () => {
  const withName = clone(fixture); withName.counters[0].student = 'x';
  assert.ok(A.validateFeed(withName).some((e) => /"student" is not in the aggregate-only contract/.test(e)));
  const withTop = clone(fixture); withTop.learners = [];
  assert.ok(A.validateFeed(withTop).some((e) => /"learners"/.test(e)));
  const withPp = clone(fixture); withPp.prepost[0].studyCode = 'PP-ABC123';
  assert.ok(A.validateFeed(withPp).some((e) => /"studyCode"/.test(e)));
  const frac = clone(fixture); frac.counters[0].n = 2.5;
  assert.ok(A.validateFeed(frac).some((e) => /non-negative integer/.test(e)));
  const overlap = clone(fixture); overlap.rotationBlocks[1].start = '2026-10-05';
  assert.ok(A.validateFeed(overlap).some((e) => /overlap/.test(e)));
  const noFlag = clone(fixture); delete noFlag._synthetic;
  assert.ok(A.validateFeed(noFlag).length > 0);
  assert.throws(() => A.publish(withName), /feed rejected/);
});

test('the published aggregate is closed: no raw counters, pre/post rows or hidden values', () => {
  const pub = A.publish(fixture);
  assert.deepEqual(Object.keys(pub).sort(),
    ['_synthetic', 'aggregateVersion', 'contractVersion', 'generatedOn', 'sites', 'suppressionThreshold']);
  const text = JSON.stringify(pub);
  assert.doesNotMatch(text, /"counters"|"prepost"|"eligible"|"consented"|"week":/);
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.shown === false) assert.deepEqual(Object.keys(o), ['shown']);
    Object.values(o).forEach(walk);
  })(pub);
});

// ---------------------------------------------------------------- D-F8-3 rotation calendar
test('D-F8-3: the committed rotation calendar converts to dashboard blocks (dates only)', () => {
  const cfgPath = path.join(repo, '13_Faculty_Resources/_automation/maintenance/rotation_blocks.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  for (const b of cfg.blocks) assert.deepEqual(Object.keys(b).sort(), ['endsOn', 'id', 'startsOn', 'status']);
  const { blocks, errors } = A.blocksFromRotationConfig(cfg, 'ms3');
  assert.deepEqual(errors, []);
  assert.equal(blocks.length, cfg.blocks.length);
  for (const b of blocks) {
    assert.equal(new Date(`${b.start}T00:00:00Z`).getUTCDay(), 1, `${b.id} starts on a Monday`);
    assert.equal(b.weeks, 6);
  }
  const feed = { _synthetic: true, contractVersion: 1, rotationBlocks: blocks, counters: [] };
  assert.deepEqual([...A.validateFeed(feed)], [], 'real calendar is a valid (non-overlapping) feed calendar');
  assert.deepEqual(A.blocksFromRotationConfig({ blocks: [{ id: 'x', startsOn: '2026-01-05', endsOn: '2026-01-14' }] }, 'ms3').errors.length, 1);
});

// ---------------------------------------------------------------- the page
test('page: shares the engine, MOCK banner, no storage, no network beyond the synthetic feed', () => {
  assert.match(html, /MOCK DATA — no learner data has been collected/);
  assert.match(html, /<script src="\.\.\/\.\.\/metrics\/aggregate\/cohort_aggregate\.js"><\/script>/);
  assert.doesNotMatch(html, /function protect|function validateFeed/, 'no second copy of the engine');
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest/);
  assert.deepEqual(html.match(/fetch\(([^)]*)\)/g) || [], ['fetch(FEED)']);
  assert.match(html, /var FEED = '\.\.\/\.\.\/metrics\/aggregate\/synthetic_feed\.json';/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test('prototype is not registered to ship', () => {
  const shipped = fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/shipped_pages.json'), 'utf8');
  const extras = fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/site_extras.py'), 'utf8');
  assert.doesNotMatch(shipped, /director-dashboard|cohort_aggregate/);
  assert.doesNotMatch(extras, /director-dashboard/);
});
