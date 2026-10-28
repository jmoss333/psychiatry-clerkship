#!/usr/bin/env node
// SYNTHETIC feed generator for the cohort aggregate (F8). No learner data exists or is read.
//
// It draws disjoint VISIT ATOMS (e.g. "question-bank visits in block B, rotation week w, that
// answered 10-19 questions and scored <50% on the first ten") from a seeded PRNG and derives the
// metrics site's counters from them exactly the way PR #1076's emitter would (answered-5/10/20
// are cumulative; answered-10 and one first10 band fire in the same visit). Tests use the atoms
// to audit the published aggregate independently of the engine's own identities.
//
//   node metrics/aggregate/synthetic_feed_generator.mjs --write   # rewrite synthetic_feed.json
//   node metrics/aggregate/synthetic_feed_generator.mjs --check   # exit 1 if it differs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SYNTHETIC_SEED = 20261027;
export const FIXTURE_URL = new URL('./synthetic_feed.json', import.meta.url);

const DAY = 86400000;
const READ_KEYS = ['page:core_readings.md', 'page:catatonia.md', 'page:agitation.md',
  'page:rapid_review.md', 'page:case_formulation.md'];
const TOOL_KEYS = ['page:capacity.html', 'page:mse.html', 'page:shelf-mode.html'];
const CATS = ['mood', 'psychosis', 'substance-use', 'anxiety', 'neurocognitive', 'safety'];
const BANDS = ['lt50', '50to79', '80up'];

export const SYNTHETIC_BLOCKS = [
  { id: 'MS3-B1', site: 'ms3', start: '2026-09-07', weeks: 6, size: 1.0 },
  { id: 'MS3-B2', site: 'ms3', start: '2026-10-19', weeks: 6, size: 0.8 },
  // A 4-learner resident block, so small cells occur everywhere.
  { id: 'RES-B1', site: 'res', start: '2026-09-14', weeks: 4, size: 0.25 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoWeekOf(t) {
  const d = new Date(t);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Generate { feed, atoms }. `scale` multiplies every mean (small scale = many small cells).
 * Atom: { site, block, rw, family, n, ...attrs } with family qbank|review|reads|tools|topics.
 */
export function generate({ seed = SYNTHETIC_SEED, blocks = SYNTHETIC_BLOCKS, scale = 1 } = {}) {
  const rnd = mulberry32(seed);
  const draw = (mean) => Math.max(0, Math.round(mean * (0.35 + 1.3 * rnd())));
  const atoms = [];
  for (const b of blocks) {
    for (let rw = 1; rw <= b.weeks; rw++) {
      // Use rises toward the final (pre-shelf) week.
      const m = scale * b.size * (0.6 + rw / b.weeks);
      const base = { site: b.site, block: b.id, rw };
      READ_KEYS.forEach((key, i) => atoms.push({ ...base, family: 'reads', key, n: draw(m * (3 + 2 * i)) }));
      TOOL_KEYS.forEach((key, i) => atoms.push({ ...base, family: 'tools', key, n: draw(m * (2 + 2 * i)) }));
      atoms.push({ ...base, family: 'qbank', tier: 'lt5', n: draw(m * 6) });
      atoms.push({ ...base, family: 'qbank', tier: '5to9', n: draw(m * 4) });
      for (const tier of ['10to19', '20up']) {
        BANDS.forEach((band, i) => atoms.push({ ...base, family: 'qbank', tier, band, n: draw(m * [2, 3.5, 2.5][i] * (tier === '20up' ? 1.2 : 1)) }));
      }
      [['none', 3], ['1to9', 5], ['10to24', 4], ['25up', 2]].forEach(([tier, k]) =>
        atoms.push({ ...base, family: 'review', tier, n: draw(m * k) }));
      for (const cat of CATS) {
        BANDS.forEach((band, i) => atoms.push({ ...base, family: 'topics', cat, band, n: draw(m * [0.6, 0.9, 0.7][i]) }));
      }
    }
  }
  const byBlock = Object.fromEntries(blocks.map((b) => [b.id, b]));
  const counts = new Map();
  const add = (a, key, n) => {
    const b = byBlock[a.block];
    const week = isoWeekOf(Date.parse(`${b.start}T00:00:00Z`) + (a.rw - 1) * 7 * DAY);
    const k = `${a.site}\u0000${week}\u0000${key}`;
    counts.set(k, (counts.get(k) || 0) + n);
  };
  for (const a of atoms) {
    if (a.family === 'reads' || a.family === 'tools') add(a, a.key, a.n);
    if (a.family === 'qbank') {
      add(a, 'page:question-bank-practice.html', a.n);
      if (a.tier !== 'lt5') add(a, 'tool:qbank:answered-5', a.n);
      if (a.tier === '10to19' || a.tier === '20up') {
        add(a, 'tool:qbank:answered-10', a.n);
        add(a, `tool:qbank:first10-${a.band}`, a.n);
      }
      if (a.tier === '20up') add(a, 'tool:qbank:answered-20', a.n);
    }
    if (a.family === 'review') {
      add(a, 'page:review.html', a.n);
      if (a.tier !== 'none') add(a, 'tool:daily-review:graded-1', a.n);
      if (a.tier === '10to24' || a.tier === '25up') add(a, 'tool:daily-review:graded-10', a.n);
      if (a.tier === '25up') add(a, 'tool:daily-review:graded-25', a.n);
    }
    if (a.family === 'topics') add(a, `tool:qbank:cat:${a.cat}:first10-${a.band}`, a.n);
  }
  // The metrics store only holds keys that were incremented: no zero records.
  const counters = [...counts.entries()].filter(([, n]) => n > 0).map(([k, n]) => {
    const [site, week, key] = k.split('\u0000');
    return { site, week, key, n };
  });
  const feed = {
    _synthetic: true,
    _label: 'MOCK DATA — every number is synthetic, derived from seeded random visit atoms '
      + '(metrics/aggregate/synthetic_feed_generator.mjs). No learner data has been collected. '
      + 'Category counters use a PROPOSED key family that no producer emits.',
    contractVersion: 1,
    generatedOn: '2026-10-27',
    suppressionThreshold: 5,
    rotationBlocks: blocks.map(({ id, site, start, weeks }) => ({ id, site, start, weeks })),
    counters,
    prepost: [
      { block: 'MS3-B1', eligible: 14, consented: 11, paired: 9, facultyHours: 1.5, privacyIncidents: 0 },
      { block: 'MS3-B2', eligible: 13, consented: 10, paired: 9, facultyHours: 1, privacyIncidents: 0 },
      { block: 'RES-B1', eligible: 4, consented: 3, paired: 3, facultyHours: 0.5, privacyIncidents: 0 },
    ].filter((p) => byBlock[p.block]),
  };
  return { feed, atoms };
}

export function serialise(feed) {
  const head = JSON.stringify({ ...feed, counters: [], prepost: [] }, null, 2);
  const rows = (list) => list.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
  return head
    .replace('"counters": []', `"counters": [\n${rows(feed.counters)}\n  ]`)
    .replace('"prepost": []', `"prepost": [\n${rows(feed.prepost)}\n  ]`)
    .replace(/"rotationBlocks": \[[\s\S]*?\n  \]/, `"rotationBlocks": [\n${rows(feed.rotationBlocks)}\n  ]`) + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = serialise(generate().feed);
  if (process.argv.includes('--write')) writeFileSync(FIXTURE_URL, text);
  else if (process.argv.includes('--check')) {
    const same = readFileSync(FIXTURE_URL, 'utf8') === text;
    process.stdout.write(same ? 'synthetic_feed.json is current\n' : 'synthetic_feed.json is stale\n');
    process.exitCode = same ? 0 : 1;
  } else process.stdout.write(text);
}
