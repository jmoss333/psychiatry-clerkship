// Family Conversation Simulator (F1): a required safety step missed before "Try again from this
// moment" is never shown as done-first-time, scored as clean, or stored as a higher safety score.
//
// Real property (F1 gate rule G-1): within one attempt at a scenario (one opening of it; each
// rewind starts the next pass of the same attempt), once a required safety step has been offered
// and not done, no later screen of that attempt — the debrief's safety-steps line, its safety bar,
// or the scenario picker after it — says the step was done when first offered or shows a safety
// score above the pass that missed it. An item missed and then done after a rewind reads exactly
// "Done on a later try. Missed the first time it came up." (W-MISS-A, approved verbatim
// 2026-11-16). Inputs: the shipped simulator file — its real page script, engine and render —
// driven by learner clicks against DOM-free stubs and in-memory storage; the simulator's own gate
// (`gate.required`, offeredAt/satisfiedBy) decides what was offered and missed.
// Required: yes — runs in `node --test tests/*.test.mjs` inside `build-test-validate`.
//
// Why (LEDGER-MAIN, CHK-REWIND-MAIN 2026-11-15): `rewind` truncates the run and the page records
// the truncated pass as a new run. On main 127e7e3c / production, S8 `open#0 picture#0 drinking#0
// worry#1 repair-dismiss#1 roles-unrouted#0 close#0` (Joanne's suicide statement never asked
// about), rewound to decision 4 and finished `worry#0 worry-answer#0 roles#0 close#0`, showed
// "Ask Joanne directly about thoughts of suicide. Done (decision 4).", no banner, safety bar 100%
// "often", and "Safety actions 100%" on the picker.
//
// Known-miss (G-2): every check below is also run on the pre-fix file
// tests/fixtures/family-meeting-sim/v2-f8ad7c90.html (verbatim main before this fix; same bytes as
// the fixture of the same name in #1201) and must go red there.
//
// "Reload": the ledger itself lives in page memory only (nothing new is stored — the storage
// notice stays true). What must survive a reload is its effect on the one saved-progress key:
// a fresh page on the same storage must not show the rewound attempt as 100% safety, and the
// saved shape gains no new fields (no choices, no text).
//
// FMS_SIM_FILE=<path> checks another copy. No network; storage is an in-memory stub.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const FILE = process.env.FMS_SIM_FILE
  || new URL('../08_Cases_and_Simulation/family-meeting-sim/family-meeting-sim.html', import.meta.url);
const PRE_FIX = new URL('./fixtures/family-meeting-sim/v2-f8ad7c90.html', import.meta.url);
const W_MISS_A = 'Done on a later try. Missed the first time it came up.';
const S8 = 'parent-own-untreated-illness';
const S8_MISS = [['open', 0], ['picture', 0], ['drinking', 0], ['worry', 1], ['repair-dismiss', 1], ['roles-unrouted', 0], ['close', 0]];
const S8_REWIND_AT = 3; // decision 4, `worry`
const S8_RETRY = [['worry', 0], ['worry-answer', 0], ['roles', 0], ['close', 0]];

function load(file) {
  const html = readFileSync(file, 'utf8');
  const block = (re) => { const m = html.match(re); assert.ok(m, `block ${re} present`); return m[1]; };
  const JSON_SRC = block(/<script type="application\/json" id="fms-scenarios">([\s\S]*?)<\/script>/);
  const ENGINE_SRC = block(/<script id="fms-engine">([\s\S]*?)<\/script>/);
  const RENDER_SRC = block(/<script id="fms-render">([\s\S]*?)<\/script>/);
  const PAGE_SRC = block(/<script>\s*(\(function \(\) \{[\s\S]*?)<\/script>/);
  const DATA = JSON.parse(JSON_SRC);
  const E = new Function(`${ENGINE_SRC}\nreturn FMSEngine;`)();
  /** Boot the real page script on `store` (a Map shared across boots = the same device). */
  function boot(store) {
    let handler = null;
    const app = { innerHTML: '', addEventListener: (type, fn) => { if (type === 'click') handler = fn; } };
    const els = { 'fms-app': app, 'fms-live': { textContent: '' }, 'fms-scenarios': { textContent: JSON_SRC } };
    const localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    new Function('document', 'localStorage', 'window', 'location', `${ENGINE_SRC}\n${RENDER_SRC}\n${PAGE_SRC}`)(
      { getElementById: (id) => els[id] || null }, localStorage, { setTimeout: () => 0 }, { search: '' });
    assert.ok(handler, 'page script registered its click handler');
    const click = (a) => handler({ target: { closest: () => ({ getAttribute: (k) => (k in a ? String(a[k]) : null) }) } });
    return {
      app,
      open: (id) => click({ 'data-act': 'open', 'data-id': id }),
      choose: (c) => click({ 'data-act': 'choose', 'data-choice': c }),
      rewind: (i) => click({ 'data-act': 'rewind', 'data-step': i }),
      home: () => click({ 'data-act': 'home' }),
    };
  }
  return { DATA, E, boot };
}

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** Map item label → status text, from the debrief's first gate list. */
function gateLines(html) {
  const m = html.match(/<ul class="gate-list">([\s\S]*?)<\/ul>/);
  assert.ok(m, 'debrief renders the safety-steps list');
  const out = {};
  for (const li of m[1].split('<li>').slice(1)) {
    const b = li.match(/<b>([\s\S]*?)\.<\/b>\s*([\s\S]*?)<\/li>/);
    if (b) out[strip(b[1])] = strip(b[2]);
  }
  return out;
}
/** [shown text, band text] of the safety bar. */
function safetyBar(DATA, html) {
  const label = DATA.axes.find((a) => a.id === 'safety').label;
  const m = html.match(new RegExp(`<div class="axis-head">${label}<span>([^<]*)</span>[\\s\\S]*?<p class="anchor"><b>([^<]*)</b>`));
  assert.ok(m, 'debrief renders the safety bar');
  return [strip(m[1]), strip(m[2])];
}
function pickerSafety(DATA, html, scId) {
  const label = DATA.axes.find((a) => a.id === 'safety').label;
  const card = strip(html.split('<li>').find((li) => li.includes(`data-id="${scId}"`)) || '');
  const m = card.match(new RegExp(`${label} (\\d+%|–)`));
  return m ? m[1] : null;
}

/** Play the exact S8 rewind attempt; return what the learner sees. */
function s8Rewind(lib, store = new Map()) {
  const p = lib.boot(store);
  p.open(S8);
  for (const [, c] of S8_MISS) p.choose(c);
  const pass1 = p.app.innerHTML;
  p.rewind(S8_REWIND_AT);
  for (const [, c] of S8_RETRY) p.choose(c);
  const pass2 = p.app.innerHTML;
  p.home();
  return { pass1, pass2, picker: p.app.innerHTML, store };
}
const ASK = 'Ask Joanne directly about thoughts of suicide';

function s8Violations(lib) {
  const v = [];
  const { pass1, pass2, picker } = s8Rewind(lib);
  if (gateLines(pass1)[ASK] !== 'Not done on this run.') v.push(`pass 1 ask-directly reads "${gateLines(pass1)[ASK]}"`);
  const line = gateLines(pass2)[ASK];
  if (line !== W_MISS_A) v.push(`after rewind ask-directly reads "${line}"`);
  if (!pass2.includes('gate-banner')) v.push('after rewind the safety banner is gone');
  const [shown, band] = safetyBar(lib.DATA, pass2);
  if (/100%/.test(shown)) v.push(`after rewind safety bar shows "${shown}"`);
  if (/often/.test(band)) v.push(`after rewind safety bar band "${band}"`);
  const pk = pickerSafety(lib.DATA, picker, S8);
  if (pk === '100%') v.push(`picker shows Safety actions ${pk}`);
  if (/Safety steps: clean run/.test(strip(picker))) v.push('picker labels the rewound miss a clean run');
  return v;
}

test('known-miss: the exact S8 rewind path — missed suicide inquiry is never shown as done first time', () => {
  assert.deepEqual(s8Violations(load(FILE)), []);
  const pre = s8Violations(load(PRE_FIX));
  assert.ok(pre.length >= 4, `the pre-fix file must fail this check (got: ${pre.join('; ')})`);
  assert.ok(pre.some((x) => x.includes('Done (decision 4)')), 'pre-fix shows "Done (decision 4)"');
});

test('a truly clean run stays clean: no ledger line, no banner, unchanged scores', () => {
  const lib = load(FILE);
  const pre = load(PRE_FIX);
  let checked = 0;
  const pages = new Map([[lib, { store: new Map() }], [pre, { store: new Map() }]]);
  for (const [L, pg] of pages) pg.p = L.boot(pg.store);
  for (const sc of lib.DATA.scenarios) {
    for (const path of lib.E.paths(sc)) {
      const g = lib.E.gateStatus(sc, path.steps, lib.DATA.flagDefs);
      if (g.items.some((it) => it.status !== 'met') || g.flags.length) continue;
      checked += 1;
      // One pass, then a rewind at every decision and the same choices again: still clean.
      for (const rewindAt of [null, ...path.steps.map((_, i) => i)]) {
        const runOnce = (L) => {
          const { p, store } = pages.get(L);
          store.clear();
          p.open(sc.id);
          path.steps.forEach((s) => p.choose(s.choice));
          if (rewindAt !== null) { p.rewind(rewindAt); path.steps.slice(rewindAt).forEach((s) => p.choose(s.choice)); }
          const d = p.app.innerHTML; p.home();
          return { d, pick: pickerSafety(L.DATA, p.app.innerHTML, sc.id) };
        };
        const now = runOnce(lib), before = runOnce(pre);
        assert.ok(!now.d.includes(W_MISS_A), `${sc.id}: clean path shows the later-try line`);
        assert.equal(now.d.includes('gate-banner'), false, `${sc.id}: clean path shows the banner`);
        assert.deepEqual(gateLines(now.d), gateLines(before.d), `${sc.id}: clean path gate lines changed`);
        assert.deepEqual(safetyBar(lib.DATA, now.d), safetyBar(pre.DATA, before.d), `${sc.id}: clean path safety bar changed`);
        assert.equal(now.pick, before.pick, `${sc.id}: clean path picker changed`);
      }
    }
  }
  assert.ok(checked > 0, 'some paths are clean (else this test is vacuous)');
});

test('reload: a fresh page on the same device does not show the rewound miss as 100%, and stores nothing new', () => {
  const run = (lib) => {
    const { store } = s8Rewind(lib);
    const page = lib.boot(store); // reload: new page script, same storage
    return { shown: pickerSafety(lib.DATA, page.app.innerHTML, S8), saved: JSON.parse(store.get('cw_family_sim_v1')) };
  };
  const now = run(load(FILE));
  assert.notEqual(now.shown, '100%', 'after reload the picker shows the rewound miss as 100%');
  assert.equal(now.shown, '56%', 'after reload the picker keeps the safety result of the pass that missed');
  // Saved shape is unchanged: only the pre-existing keys, no choices, no text.
  assert.deepEqual(Object.keys(now.saved).sort(), ['scenarios', 'v']);
  // Store v2 (#1201) adds `safetyRun`; nothing else. After a rewound miss it is never 'clean'.
  const allowed = ['best', 'last', 'runs', ...(now.saved.v === 2 ? ['safetyRun'] : [])];
  assert.deepEqual(Object.keys(now.saved.scenarios[S8]).sort(), allowed);
  if (now.saved.v === 2) assert.equal(now.saved.scenarios[S8].safetyRun, 'after-miss', 'rewound miss stored as after-miss, never clean');
  assert.deepEqual(Object.keys(now.saved.scenarios[S8].best).sort(), ['nonblaming', 'safety', 'structure', 'validation']);
  assert.equal(JSON.stringify(now.saved).includes('#'), false, 'no choice refs stored');
  assert.equal(run(load(PRE_FIX)).shown, '100%', 'known-miss: the pre-fix file shows 100% after reload');
});

/** Strongest authored option at each node from `at` to an ending. */
function finishStrongest(lib, sc, p, at) {
  let node = at;
  while (node && sc.nodes[node]) {
    const best = lib.E.strongest(sc.nodes[node]);
    p.choose(best);
    node = sc.nodes[node].choices[best].next;
  }
}

// Pinned exception (stated in the PR for Josh): S3 `s3-time-alone` (time alone with the teen) is
// a required step with no safety-axis score. On 90 S3 paths it is missed then repaired in the
// same pass and that pass already scores safety 3/3 = 100% (shown with the W-007 "this percentage
// does not offset it" override; the picker storing it is defect O-1, fixed in #1201). A rewind
// does not raise it; it can only carry it. Any other item reaching 100% here is a violation.
const PASS_OWN_100 = new Set(['s3-time-alone']);

function rewoundMissViolations(lib) {
  const out = [];
  let cases = 0, exempt = 0;
  for (const sc of lib.DATA.scenarios) {
    const store = new Map();
    const p = lib.boot(store);
    for (const path of lib.E.paths(sc)) {
      const g = lib.E.gateStatus(sc, path.steps, lib.DATA.flagDefs);
      const missedAt = new Set();
      g.items.forEach((it) => it.missedAt.forEach((m) => { if (it.satisfiedAt === null || m < it.satisfiedAt) missedAt.add(m); }));
      for (const m of missedAt) {
        cases += 1;
        store.clear();
        p.open(sc.id);
        path.steps.forEach((s) => p.choose(s.choice));
        const pass1Safety = lib.E.tally(sc, path.steps).safety.pct;
        p.rewind(m);
        finishStrongest(lib, sc, p, path.steps[m].node);
        const d = p.app.innerHTML;
        const lines = gateLines(d);
        const tag = `${sc.id} rewind@${m + 1} ${path.steps.map((s) => `${s.node}#${s.choice}`).join(' ')}`;
        for (const it of g.items) {
          const missedEarlier = it.missedAt.some((x) => it.satisfiedAt === null || x < it.satisfiedAt);
          if (missedEarlier && /^Done \(decision \d+\)\.$/.test(lines[it.label] || '')) out.push(`${tag}: ${it.id} "${lines[it.label]}"`);
        }
        // 100% is tolerated only where the pass that missed itself scored safety 100% AND every
        // missed item is in PASS_OWN_100 (an item that carries no safety-axis score; see header).
        const missedIds = g.items.filter((it) => it.missedAt.some((x) => it.satisfiedAt === null || x < it.satisfiedAt)).map((it) => it.id);
        const own100 = pass1Safety === 100 && missedIds.every((id) => PASS_OWN_100.has(id));
        if (own100) exempt += 1;
        const [shown] = safetyBar(lib.DATA, d);
        const pct = Number((shown.match(/(\d+)%/) || [])[1]);
        if ((shown.includes('100%') && !own100) || (pass1Safety !== null && pct > pass1Safety)) out.push(`${tag}: safety bar "${shown}" (missed pass ${pass1Safety}%)`);
        p.home();
        const pk = pickerSafety(lib.DATA, p.app.innerHTML, sc.id);
        if (pk === '100%' && !own100) out.push(`${tag}: picker ${pk}`);
      }
    }
  }
  return { out, cases, exempt };
}

test('safety bar and picker never show 100% (or above the missing pass) after any rewound miss', () => {
  const { out, cases, exempt } = rewoundMissViolations(load(FILE));
  assert.ok(cases > 0, 'some rewound-miss attempts exist (else vacuous)');
  assert.deepEqual(out.slice(0, 10), [], `${out.length} violations in ${cases} rewound-miss attempts`);
  assert.ok(exempt < cases / 100, `the pinned exception stays narrow (${exempt} of ${cases})`);
  console.log(`# rewound-miss attempts: ${cases}; pinned own-100 exception: ${exempt}`);
  const pre = rewoundMissViolations(load(PRE_FIX));
  assert.ok(pre.out.length > 0, `known-miss: the pre-fix file must show violations (0 of ${pre.cases})`);
});
