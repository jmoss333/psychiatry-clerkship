// Family Conversation Simulator (F1): the scenario PICKER never shows a missed safety step as a
// safety score.
//
// Real property (F1 gate rule G-1): a safety-actions percentage shown on the scenario picker never
// comes from a run on which a required safety action was missed. Inputs: the shipped simulator
// file — its real page script (recordRun → localStorage → pickHtml), engine and render — driven
// through every complete path of every scenario from an empty store; the all-paths gate's
// independent SAFETY_MODEL reading (tests/family-meeting-sim-safety-paths.test.mjs) and the
// simulator's own gate decide "missed". Required: yes — runs in `node --test tests/*.test.mjs`
// inside `build-test-validate`, a required context in the committed ruleset fixture.
//
// Why: the debrief overrides the safety bar when a gate item is missed (W-007, "this percentage
// does not offset it"), but the picker stored max(best, pct) for every skill regardless of the
// gate and showed it with nothing beside it. On main f8ad7c90 a run that never routed the
// two-home means plan (S7 `means-both#2`) showed "Safety actions 80%" on the picker; on v1 a path
// that never brought in the attending stored S8 safety 100%.
//
// Known-miss (G-2): a test swaps the pre-fix rule back into the engine and requires this gate to
// go red, naming that S7 path at 80%.
//
// Second real property (saved progress, store v2): progress saved before this fix loses exactly the
// safety bests that may have come from a run that missed a required safety step, in any version of
// the tool that shipped to main, and nothing else — runs, dates, the other three skills, other
// scenarios and unknown keys stay byte-for-byte. Inputs: FMSEngine.migrateStore and
// LEGACY_CLEAN_SAFETY, re-derived here from tests/fixtures/family-meeting-sim/{v0-3f1a24f6,
// v1-61530b10,v2-f8ad7c90}.html (verbatim from git history) plus the shipped file; saved-state
// fixtures in tests/fixtures/family-meeting-sim/saved-state/ (synthetic: legacy-v1-mixed has unsafe
// S7 80 / S8 100 / S2 78 / unknown-scenario 100, clean S1 100 / S3 86, a scenario with no safety
// best and an unknown key; legacy-unversioned has S8 89 kept and S4 60 removed; v2-current must be
// returned unchanged). Known-miss: an identity migration (keeps S7 80) and a wipe migration (drops
// unrelated progress) must both be caught.
//
// Third (display): a run where every required step was done when first offered and no safety flag
// fired is a 'clean run'; one where a step was done only after a miss, or a flag fired, is
// 'completed after a miss'; the picker labels them differently (wording PROPOSED, not approved).
//
// FMS_SIM_FILE=<path> checks another copy. No network; storage is an in-memory stub.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const FILE = process.env.FMS_SIM_FILE
  || new URL('../08_Cases_and_Simulation/family-meeting-sim/family-meeting-sim.html', import.meta.url);
const html = readFileSync(FILE, 'utf8');
const block = (re) => { const m = html.match(re); assert.ok(m, `block ${re} present`); return m[1]; };
const JSON_SRC = block(/<script type="application\/json" id="fms-scenarios">([\s\S]*?)<\/script>/);
const ENGINE_SRC = block(/<script id="fms-engine">([\s\S]*?)<\/script>/);
const RENDER_SRC = block(/<script id="fms-render">([\s\S]*?)<\/script>/);
const PAGE_SRC = block(/<script>\s*(\(function \(\) \{[\s\S]*?)<\/script>/);
const DATA = JSON.parse(JSON_SRC);
const E = new Function(`${ENGINE_SRC}\nreturn FMSEngine;`)();

// The independent reading, read from the gate test itself so the two can never drift apart.
const GATE_TEST = readFileSync(new URL('./family-meeting-sim-safety-paths.test.mjs', import.meta.url), 'utf8');
const MODEL_START = GATE_TEST.indexOf('const SAFETY_MODEL = ');
assert.ok(MODEL_START >= 0, 'the all-paths gate still declares SAFETY_MODEL');
const SAFETY_MODEL = new Function(`return ${GATE_TEST.slice(MODEL_START + 'const SAFETY_MODEL = '.length,
  GATE_TEST.indexOf('\n};\n', MODEL_START) + 2)}`)();

/**
 * Boot the real page script against DOM-free stubs. `engineOverride` (known-miss only) lets a
 * test replace one engine function. Returns helpers that click exactly as a learner would.
 */
function boot(engineOverride, seed) {
  const store = new Map(seed === undefined ? [] : [['cw_family_sim_v1', seed]]);
  let handler = null;
  const app = { innerHTML: '', addEventListener: (type, fn) => { if (type === 'click') handler = fn; } };
  const els = { 'fms-app': app, 'fms-live': { textContent: '' }, 'fms-scenarios': { textContent: JSON_SRC } };
  const document = { getElementById: (id) => els[id] || null };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const window = { setTimeout: () => 0 };
  const location = { search: '' };
  const run = new Function('document', 'localStorage', 'window', 'location', 'engineOverride',
    `${ENGINE_SRC}\nif (engineOverride) engineOverride(FMSEngine);\n${RENDER_SRC}\n${PAGE_SRC}`);
  run(document, localStorage, window, location, engineOverride);
  assert.ok(handler, 'page script registered its click handler');
  const click = (attrs) => handler({ target: { closest: () => ({ getAttribute: (k) => (k in attrs ? String(attrs[k]) : null) }) } });
  return {
    store, app,
    play(scId, steps, { keep = false } = {}) {
      if (!keep) store.clear();
      click({ 'data-act': 'open', 'data-id': scId });
      for (const s of steps) click({ 'data-act': 'choose', 'data-choice': s.choice });
      click({ 'data-act': 'home' });
      return app.innerHTML;
    },
  };
}

const safetyLabel = DATA.axes.find((a) => a.id === 'safety').label;
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** The safety value the picker card shows for one scenario: a number, '–', or null if absent. */
function pickerSafety(pickHtml, scId) {
  const card = pickHtml.split('<li>').find((li) => li.includes(`data-id="${scId}"`));
  assert.ok(card, `${scId}: picker card rendered`);
  const m = card.match(new RegExp(`${esc(safetyLabel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+%|–)`));
  return m ? m[1] : null;
}

/** Why a path counts as having missed a required safety action, or null. */
function missedBecause(sc, steps) {
  const refs = new Set(steps.map((s) => `${s.node}#${s.choice}`));
  const visited = new Set(steps.map((s) => s.node));
  const model = (SAFETY_MODEL[DATA.version] || {})[sc.id] || [];
  for (const it of model) {
    if (it.at.some((n) => visited.has(n)) && !it.done.some((r) => refs.has(r))) return `model ${it.id}`;
  }
  const g = E.gateStatus(sc, steps, DATA.flagDefs);
  const miss = g.items.find((it) => it.status === 'missed');
  return miss ? `gate ${miss.id}` : null;
}

function violations(page) {
  const out = [];
  let walked = 0, missedRuns = 0;
  for (const sc of DATA.scenarios) {
    for (const p of E.paths(sc)) {
      walked += 1;
      const why = missedBecause(sc, p.steps);
      if (!why) continue;
      missedRuns += 1;
      const shown = pickerSafety(page.play(sc.id, p.steps), sc.id);
      assert.notEqual(shown, null, `${sc.id}: picker shows a safety entry after a finished run`);
      if (shown !== '–') out.push(`${sc.id} (${why}) shows ${shown}: ${p.steps.map((s) => `${s.node}#${s.choice}`).join(' ')}`);
    }
  }
  return { out, walked, missedRuns };
}

test('picker: no safety percentage comes from a run that missed a required safety action', () => {
  assert.ok(DATA.version >= 2, 'the picker rule needs the v2 safety gate');
  const { out, walked, missedRuns } = violations(boot());
  assert.ok(missedRuns > 0, 'some paths miss a safety action (else this test is vacuous)');
  assert.deepEqual(out.slice(0, 10), [], `${out.length} of ${missedRuns} missed-safety runs (of ${walked} paths) show a safety %`);
});

test('picker: a clean run still records its safety best, and other skills are unaffected', () => {
  const page = boot();
  for (const sc of DATA.scenarios) {
    const main = E.paths(sc).find((p) => p.steps.every((s) => s.choice === 0));
    assert.ok(main, `${sc.id}: option-0 main line exists`);
    assert.equal(missedBecause(sc, main.steps), null, `${sc.id}: main line misses nothing`);
    assert.equal(pickerSafety(page.play(sc.id, main.steps), sc.id), '100%', `${sc.id}: clean main line shows safety 100%`);
  }
  // A missed run after a clean one keeps the clean safety best, and still counts the run and
  // updates the other skills, through the real page script.
  const s7 = DATA.scenarios.find((s) => s.id === 'coparents-discharge-adolescent');
  const clean = E.paths(s7).find((p) => p.steps.every((s) => s.choice === 0));
  const missed = E.paths(s7).find((p) => missedBecause(s7, p.steps));
  page.play(s7.id, clean.steps);
  const after = pickerSafety(page.play(s7.id, missed.steps, { keep: true }), s7.id);
  assert.equal(after, '100%', 'clean safety best survives a later missed run');
  const rec = JSON.parse(page.store.get('cw_family_sim_v1')).scenarios[s7.id];
  assert.equal(rec.runs, 2, 'both runs are counted');
  for (const a of ['validation', 'structure', 'nonblaming']) {
    const pct = E.tally(s7, missed.steps)[a].pct;
    assert.equal(rec.best[a], Math.max(100, pct ?? 0), `${a}: best updates as before`);
  }
});

test('known-miss: the pre-fix picker rule (max over every run) is caught on the real S7 path', () => {
  // The exact rule recordRun used before this fix: every skill, every run, no gate.
  const preFix = (Eng) => {
    Eng.recordProgress = function (rec, t) {
      const out = { ...((rec && rec.best) || {}) };
      Eng.AXES.forEach((a) => { if (t[a].pct !== null) out[a] = Math.max(out[a] || 0, t[a].pct); });
      return { best: out };
    };
  };
  const { out } = violations(boot(preFix));
  assert.ok(out.length > 0, 'the gate must go red on the pre-fix rule');
  const s7 = 'coparents-discharge-adolescent (model means-both-homes) shows 80%: '
    + 'open#0 riley#0 triangle#0 means-both#2 channel#0 close#0';
  assert.ok(out.includes(s7), `the recorded S7 miss is named; got e.g. ${out.slice(0, 3).join(' | ')}`);
});

// --- classification and display ----------------------------------------------------------------

test('display: a clean run and a run completed after a miss are labelled differently', () => {
  const R = new Function(`${ENGINE_SRC}\n${RENDER_SRC}\nreturn FMSRender;`)();
  const labels = R.TEXT.safetyRun;
  assert.deepEqual(Object.keys(labels).sort(), ['after-miss', 'clean', 'missed']);
  assert.equal(new Set(Object.values(labels)).size, 3, 'three distinct labels');
  const page = boot();
  const s8 = DATA.scenarios.find((s) => s.id === 'parent-own-untreated-illness');
  const by = (refs) => E.paths(s8).find((p) => p.steps.map((s) => `${s.node}#${s.choice}`).join(' ') === refs);
  const cases = [
    ['open#0 picture#0 drinking#0 worry#0 worry-answer#0 roles#0 close#0', 'clean'],
    ['open#0 picture#0 drinking#0 worry#1 repair-dismiss#0 worry-answer#0 roles#0 close#0', 'after-miss'],
    ['open#0 picture#0 drinking#0 worry#2 repair-dismiss#2 roles-unrouted#0 close#0', 'missed'],
  ];
  for (const [refs, cls] of cases) {
    const p = by(refs);
    assert.ok(p, `path exists: ${refs}`);
    assert.equal(E.runSafetyClass(E.gateStatus(s8, p.steps, DATA.flagDefs)), cls, refs);
    const html = page.play(s8.id, p.steps);
    const card = html.split('<li>').find((li) => li.includes(`data-id="${s8.id}"`));
    assert.ok(card.includes(labels[cls].replace(/&/g, '&amp;')), `${cls} label shown for ${refs}`);
    for (const other of Object.keys(labels)) if (other !== cls) assert.ok(!card.includes(labels[other]), `${cls}: not labelled ${other}`);
    if (cls === 'missed') assert.equal(pickerSafety(html, s8.id), '–');
  }
  // Over every path: the class matches its definition exactly.
  let n = 0;
  for (const sc of DATA.scenarios) for (const p of E.paths(sc)) {
    const g = E.gateStatus(sc, p.steps, DATA.flagDefs);
    const want = g.items.some((i) => i.status === 'missed') ? 'missed'
      : (g.items.some((i) => i.status === 'met-after-miss') || g.flags.some((f) => f.kind === 'safety')) ? 'after-miss' : 'clean';
    assert.equal(E.runSafetyClass(g), want); n += 1;
  }
  assert.equal(n, 30510);
});

test('display: a clean run outranks a later after-miss run, and an after-miss run outranks a missed one', () => {
  const page = boot();
  const s8 = DATA.scenarios.find((s) => s.id === 'parent-own-untreated-illness');
  const find = (refs) => E.paths(s8).find((p) => p.steps.map((s) => `${s.node}#${s.choice}`).join(' ') === refs).steps;
  const clean = find('open#0 picture#0 drinking#0 worry#0 worry-answer#0 roles#0 close#0');
  const after = find('open#0 picture#0 drinking#0 worry#1 repair-dismiss#0 worry-answer#0 roles#0 close#0');
  const missed = find('open#0 picture#0 drinking#0 worry#2 repair-dismiss#2 roles-unrouted#0 close#0');
  page.play(s8.id, missed);
  let rec = JSON.parse(page.store.get('cw_family_sim_v1')).scenarios[s8.id];
  assert.equal(rec.safetyRun, 'missed'); assert.equal(rec.best.safety, undefined);
  page.play(s8.id, after, { keep: true });
  rec = JSON.parse(page.store.get('cw_family_sim_v1')).scenarios[s8.id];
  assert.equal(rec.safetyRun, 'after-miss'); assert.equal(rec.best.safety, E.tally(s8, after).safety.pct);
  page.play(s8.id, clean, { keep: true });
  page.play(s8.id, after, { keep: true });
  rec = JSON.parse(page.store.get('cw_family_sim_v1')).scenarios[s8.id];
  assert.equal(rec.safetyRun, 'clean'); assert.equal(rec.best.safety, 100); assert.equal(rec.runs, 4);
});

// --- saved progress written before store v2 ----------------------------------------------------

const FIX = new URL('./fixtures/family-meeting-sim/', import.meta.url);
const LEGACY_FILES = {
  'v0-3f1a24f6.html': '82580da530eb8174c60e154eb7aad981d09d6c093eeb220baf39d0a0fc477e5c',
  'v1-61530b10.html': '98b52ef80fcfef8687485da05c1a3c685cf9ec8c0ae432b6ad182a5708409d9c',
  'v2-f8ad7c90.html': '61aa1211d3800962a72bed8f3359c884aa1edf948d2a2daf744e8216c5dc06e3',
};

/** Safety % values reachable by a clean run and by no other run, across every shipped version. */
function deriveLegacyClean() {
  const clean = {}, other = {};
  const add = (m, id, v) => { (m[id] = m[id] || new Set()).add(v); };
  const files = Object.keys(LEGACY_FILES).map((f) => readFileSync(new URL(f, FIX), 'utf8')).concat([html]);
  for (const src of files) {
    const b = (re) => { const m = src.match(re); return m ? m[1] : null; };
    const D = JSON.parse(b(/<script type="application\/json" id="fms-scenarios">([\s\S]*?)<\/script>/));
    const Eng = new Function(`${b(/<script id="fms-engine">([\s\S]*?)<\/script>/)}\nreturn FMSEngine;`)();
    for (const sc of D.scenarios) {
      const items = SAFETY_MODEL[D.version][sc.id];
      assert.ok(items, `${sc.id} v${D.version} is modelled`);
      for (const p of Eng.paths(sc)) {
        let cls = 'clean';
        for (const it of items) {
          let missedBefore = false, done = false;
          for (const s of p.steps) {
            if (!it.at.includes(s.node)) continue;
            if (it.done.includes(`${s.node}#${s.choice}`)) { done = true; break; }
            missedBefore = true;
          }
          if (!done && missedBefore) cls = 'missed';
          else if (done && missedBefore && cls !== 'missed') cls = 'after-miss';
        }
        if (Eng.gateStatus) {
          const g = Eng.gateStatus(sc, p.steps, D.flagDefs);
          if (g.items.some((i) => i.status === 'missed')) cls = 'missed';
          else if (cls === 'clean' && (g.items.some((i) => i.status === 'met-after-miss') || g.flags.some((f) => f.kind === 'safety'))) cls = 'after-miss';
        }
        add(cls === 'clean' ? clean : other, sc.id, Eng.tally(sc, p.steps).safety.pct);
      }
    }
  }
  const out = {};
  for (const id of Object.keys(clean).sort()) out[id] = [...clean[id]].filter((v) => !(other[id] && other[id].has(v))).sort((a, c) => a - c);
  return out;
}

test('migration table: LEGACY_CLEAN_SAFETY equals the values only a clean run can reach, in every shipped version', () => {
  for (const [f, want] of Object.entries(LEGACY_FILES)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(f, FIX), 'utf8')).digest('hex'), want, `${f} is the exact shipped file`);
  }
  assert.deepEqual(E.LEGACY_CLEAN_SAFETY, deriveLegacyClean());
});

const savedState = (name) => readFileSync(new URL(`saved-state/${name}`, FIX), 'utf8');
/** Every leaf of a JSON value as path -> value. */
function leaves(o, pre = '', out = {}) {
  if (o && typeof o === 'object' && !Array.isArray(o)) { for (const k of Object.keys(o)) leaves(o[k], `${pre}/${k}`, out); }
  else out[pre] = JSON.stringify(o);
  return out;
}
/** Differences between a stored state and its migration: what was removed, added, changed. */
function migrationDiff(before, after) {
  const a = leaves(before), z = leaves(after);
  return {
    removed: Object.keys(a).filter((k) => !(k in z)).sort(),
    added: Object.keys(z).filter((k) => !(k in a)).sort(),
    changed: Object.keys(a).filter((k) => k in z && a[k] !== z[k]).sort(),
  };
}
/** Problems with a migration result: an unsafe best kept, or unrelated progress touched. */
function migrationProblems(migrate) {
  const problems = [];
  const expect = {
    'legacy-v1-mixed.json': {
      removed: ['/scenarios/ambivalent-spouse-discharge/best/safety', '/scenarios/coparents-discharge-adolescent/best/safety',
        '/scenarios/parent-own-untreated-illness/best/safety', '/scenarios/retired-scenario-x/best/safety'],
      added: ['/scenarios/angry-parent-admission/safetyRun', '/scenarios/silent-teen-guardian-present/safetyRun'],
      changed: ['/v'],
    },
    'legacy-unversioned.json': {
      removed: ['/scenarios/hold-disagreement-admission/best/safety'],
      added: ['/scenarios/parent-own-untreated-illness/safetyRun', '/v'],
      changed: [],
    },
    'v2-current.json': { removed: [], added: [], changed: [] },
  };
  for (const [name, want] of Object.entries(expect)) {
    const before = JSON.parse(savedState(name));
    const after = migrate(JSON.parse(savedState(name)));
    const d = migrationDiff(before, after);
    for (const k of ['removed', 'added', 'changed']) {
      if (JSON.stringify(d[k]) !== JSON.stringify(want[k])) problems.push(`${name} ${k}: got ${JSON.stringify(d[k])}, want ${JSON.stringify(want[k])}`);
    }
    if (after && after.v !== 2) problems.push(`${name}: not marked store v2`);
    for (const [id, r] of Object.entries((after && after.scenarios) || {})) {
      if (r.safetyRun === 'clean' && !(E.LEGACY_CLEAN_SAFETY[id] || []).includes(r.best.safety) && name !== 'v2-current.json') {
        problems.push(`${name} ${id}: kept safety ${r.best.safety} is not provably clean`);
      }
    }
  }
  return problems;
}

test('migration: only unsafe safety bests are removed; all other saved progress is untouched', () => {
  assert.deepEqual(migrationProblems((s) => E.migrateStore(s)), []);
  // Idempotent, and a v2 store is returned as the same object.
  for (const name of ['legacy-v1-mixed.json', 'legacy-unversioned.json', 'v2-current.json']) {
    const once = E.migrateStore(JSON.parse(savedState(name)));
    assert.deepEqual(E.migrateStore(JSON.parse(JSON.stringify(once))), once, `${name}: idempotent`);
  }
  const v2 = JSON.parse(savedState('v2-current.json'));
  assert.equal(E.migrateStore(v2), v2);
  // The input object is not mutated.
  const raw = JSON.parse(savedState('legacy-v1-mixed.json'));
  const copy = JSON.stringify(raw);
  E.migrateStore(raw);
  assert.equal(JSON.stringify(raw), copy);
});

test('migration through the real page: first load rewrites the store once; the picker shows the result', () => {
  const seed = savedState('legacy-v1-mixed.json');
  const page = boot(undefined, seed);
  const stored = JSON.parse(page.store.get('cw_family_sim_v1'));
  assert.deepEqual(stored, E.migrateStore(JSON.parse(seed)), 'stored state is exactly the migration');
  const pick = page.app.innerHTML;
  assert.equal(pickerSafety(pick, 'coparents-discharge-adolescent'), '–', 'S7 80 from a missed run is gone');
  assert.equal(pickerSafety(pick, 'parent-own-untreated-illness'), '–', 'S8 100 (v1, never handed over) is gone');
  assert.equal(pickerSafety(pick, 'ambivalent-spouse-discharge'), '–', 'S2 78 (ambiguous) is gone');
  assert.equal(pickerSafety(pick, 'angry-parent-admission'), '100%', 'S1 100 (only a clean run reaches it) kept');
  assert.equal(pickerSafety(pick, 'silent-teen-guardian-present'), '86%', 'S3 86 kept');
  assert.ok(pick.includes('Played 3 times · last 2026-11-02'), 'S7 run count and date kept');
  const s7card = pick.split('<li>').find((li) => li.includes('data-id="coparents-discharge-adolescent"'));
  const lab = (id) => esc(DATA.axes.find((a) => a.id === id).label);
  for (const [id, v] of [['validation', 100], ['structure', 83], ['nonblaming', 100]]) {
    assert.ok(s7card.includes(`${lab(id)} ${v}%`), `S7 ${id} ${v}% kept`);
  }
  // A garbage or empty store is not touched and does not throw.
  for (const bad of ['{}', 'not json', 'null', '[]']) {
    const p2 = boot(undefined, bad);
    assert.equal(p2.store.get('cw_family_sim_v1'), bad, `${bad}: left as is`);
  }
});

test('known-miss: an identity migration and a wipe migration are both caught', () => {
  const identity = migrationProblems((s) => s);
  assert.ok(identity.some((p) => p.includes('legacy-v1-mixed.json removed')), `identity keeps unsafe bests: ${identity.join(' | ')}`);
  const wipe = migrationProblems(() => ({ v: 2 }));
  assert.ok(wipe.some((p) => p.includes('removed') && p.includes('/runs')), `wipe drops unrelated progress: ${wipe.join(' | ')}`);
});
