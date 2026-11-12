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
// Known-miss (G-2): the last test swaps the pre-fix rule back into the engine and requires this
// gate to go red, naming that S7 path at 80%.
//
// FMS_SIM_FILE=<path> checks another copy. No network; storage is an in-memory stub.
import assert from 'node:assert/strict';
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
function boot(engineOverride) {
  const store = new Map();
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
    Eng.updateBest = function (best, t) {
      const out = { ...(best || {}) };
      Eng.AXES.forEach((a) => { if (t[a].pct !== null) out[a] = Math.max(out[a] || 0, t[a].pct); });
      return out;
    };
  };
  const { out } = violations(boot(preFix));
  assert.ok(out.length > 0, 'the gate must go red on the pre-fix rule');
  const s7 = 'coparents-discharge-adolescent (model means-both-homes) shows 80%: '
    + 'open#0 riley#0 triangle#0 means-both#2 channel#0 close#0';
  assert.ok(out.includes(s7), `the recorded S7 miss is named; got e.g. ${out.slice(0, 3).join(' | ')}`);
});
