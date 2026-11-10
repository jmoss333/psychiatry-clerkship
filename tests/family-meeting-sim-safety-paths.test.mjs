// Family Conversation Simulator (F1): all-paths SAFETY GATE.
//
// Walks every complete path of every scenario and fails if any path on which a safety-critical
// action never happened (the suicide statement never asked about, the disclosure never handed to
// the attending, a volunteered firearm or stored medicines never routed to the team) is shown to
// the learner as a pass, or if the simulator's own safety record disagrees with the intended
// outcome. Found by FB1 PC-08 / I-07 and the F1 review (P0-2): on main a path that never asks
// Joanne about suicide scores safety 6/7 = 86 % "often" and reaches the best ending.
//
// Same pattern as tests/fd-tree.test.mjs (draft PR #1166, "every path ... claims only what that
// path asked"): the test carries its OWN reading of each scenario, pinned to the exact text it
// read (sha256), so a wording or branching change fails here and must be re-modelled, not waved
// through; and a known-defect set that must equal the found set exactly.
//
//   SAFETY_MODEL  per data version, per scenario: the safety-critical items, the nodes where each
//                 is live (`at`), and the choices whose words actually perform it (`done`). This
//                 is the intended outcome, read from the choice text — NOT copied from the
//                 simulator's `gate`. Where the two differ, the gate is what this test checks.
//   BEST_ENDING   the keyed ending of each scenario (the one a learner reads as "it went well").
//
// Rules, for every path and every modelled item the path never performed:
//   U1 safety-shown-as-pass  the debrief would show the safety bar as "often" (v1: engine band;
//                            v2: the rendered bar text, which v2 overrides when a gate item is
//                            missed).
//   U2 best-ending-silent    the path reaches BEST_ENDING with no safety warning (v1 has no warning
//                            layer, so reaching it is enough; v2: no gate banner rendered).
//   U3 gate-credits-miss     (v2) the simulator's gate item for this action reports met.
// And for every path that DID perform an item:
//   O1 gate-misses-done      (v2) the simulator's gate item reports missed — it tells the learner
//                            they skipped a safety step they took (over-penalty; disagreement).
//
// KNOWN_DEFECTS is keyed by the sha256 of the simulator file. It records the defects of one exact
// file (main as of 2026-11-05) so this gate can land without turning main red; the found set must
// equal it exactly (a new violation fails, and so does a fixed one still listed). ANY change to
// the file changes its sha, the entry stops applying, and the new file must pass with ZERO
// violations — or carry a new, reviewed entry. The model is clinical reading (Josh's decision);
// see O6_F1_GATE_LEDGER_2026-11-05.md. Code and tests only: no learner-visible text is changed.
//
// FMS_SIM_FILE=<path> checks another copy of the simulator (e.g. a PR head) without editing this
// file. Reads committed files only; no network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';

const FILE = process.env.FMS_SIM_FILE
  || new URL('../08_Cases_and_Simulation/family-meeting-sim/family-meeting-sim.html', import.meta.url);
const html = readFileSync(FILE, 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const FILE_SHA = sha(html);

const block = (re) => { const m = html.match(re); return m ? m[1] : null; };
const DATA = JSON.parse(block(/<script type="application\/json" id="fms-scenarios">([\s\S]*?)<\/script>/));
const ENGINE_SRC = block(/<script id="fms-engine">([\s\S]*?)<\/script>/);
const RENDER_SRC = block(/<script id="fms-render">([\s\S]*?)<\/script>/);
const E = new Function(`${ENGINE_SRC}\nreturn FMSEngine;`)();
const R = RENDER_SRC ? new Function(`${ENGINE_SRC}\n${RENDER_SRC}\nreturn FMSRender;`)() : null;

/*
 * The test's reading. `at`: nodes where the risk is live (the item counts as missed only on
 * paths that visit one). `done`: node#choice whose words perform the action. `gate`: the
 * simulator's gate id for the same action (v2 only), for U3/O1. `why` records the reading.
 * Scope: SI inquiry, escalation to the attending, and routing of volunteered or asked-about
 * lethal means. Communication-only gate items (collateral, plan shared, time alone, burden,
 * channel) and v2's universal firearm question (S5) are out of scope for this gate.
 */
const SAFETY_MODEL = {
  1: { // main: data.version 1, no gate layer
    'angry-parent-admission': [
      { id: 'rifle-routed', at: ['means', 'close'], done: ['means#0', 'close#0'],
        why: 'means#0 and close#0 name the rifle and take it to the team; means#2 orders removal, routes nothing' },
    ],
    'ambivalent-spouse-discharge': [
      { id: 'means-routed', at: ['means', 'close'], done: ['means#0', 'close#0'],
        why: 'handgun AND old prescriptions, routed; means#2 is a handgun-only ultimatum (FY3 §3.1)' },
    ],
    'silent-teen-guardian-present': [
      { id: 'means-and-roles', at: ['trust'], done: ['trust#0'], why: 'team safety plan incl. medicines and sharps' },
    ],
    'hold-disagreement-admission': [
      { id: 'means-routed', at: ['means', 'close'], done: ['means#0', 'close#0'], why: 'rifle storage with the team' },
    ],
    'shared-decision-household': [
      { id: 'means-and-roles', at: ['safety-home', 'close'], done: ['safety-home#0', 'close#0'],
        why: 'another adult holds the medicines, routed to the social worker' },
    ],
    'siblings-late-onset-psychosis': [
      { id: 'handgun-routed', at: ['safety-home', 'close'], done: ['safety-home#0', 'close#0'], why: 'handgun plan' },
    ],
    'coparents-discharge-adolescent': [
      { id: 'means-both-homes', at: ['means-both'], done: ['means-both#0'],
        why: 'means#2-style directive ("lock up everything") routes nothing (FY3 §3.3)' },
    ],
    'parent-own-untreated-illness': [
      { id: 'ask-directly', at: ['worry', 'repair-dismiss'], done: ['worry#0', 'repair-dismiss#0'],
        why: 'the direct suicide question after "I don\'t see the point"' },
      { id: 'handover', at: ['worry', 'repair-dismiss', 'close'], done: [],
        why: 'no v1 choice brings the attending in (social worker "after" only) — P0-1; D3 standard' },
      { id: 'means-asked', at: ['roles'], done: ['roles#0'], why: 'quick-harm things held by another adult' },
    ],
  },
  2: { // #1149 v2 redesign: data.version 2, gate + flags + composed endings
    'angry-parent-admission': [
      { id: 'rifle-routed', gate: 's1-rifle-routed', at: ['means', 'close'], done: ['means#0', 'close#0'],
        why: 'close#0 says "the rifle, and I\'ll pass all of it to the team today" (FY3 §3.2)' },
    ],
    'ambivalent-spouse-discharge': [
      { id: 'means-routed', gate: 's2-means-addressed', at: ['means', 'close'], done: ['means#0', 'close#0'],
        why: 'means#2 = handgun-only ultimatum, no prescriptions, no team (FY3 §3.1 P1)' },
    ],
    'silent-teen-guardian-present': [
      { id: 'means-and-roles', gate: 's3-means-and-roles', at: ['trust'], done: ['trust#0'], why: 'team safety plan' },
    ],
    'hold-disagreement-admission': [
      { id: 'means-routed', gate: 's4-means-routed', at: ['means', 'close'], done: ['means#0', 'close#0'],
        why: 'close#0 "I\'ll bring your observations and the rifle to the team" (FY3 §3.2)' },
    ],
    'shared-decision-household': [
      { id: 'means-and-roles', gate: 's5-means-and-roles', at: ['safety-home', 'close'], done: ['safety-home#0', 'close#0'],
        why: 'close#0 "one of you ... will hold the medicines", social worker calls (FY3 §3.2)' },
    ],
    'siblings-late-onset-psychosis': [
      { id: 'handgun-routed', gate: 's6-handgun-routed', at: ['safety-home', 'close'], done: ['safety-home#0', 'close#0'],
        why: 'close#0 "whatever is decided about the handgun goes through the team" (FY3 §3.2)' },
    ],
    'coparents-discharge-adolescent': [
      { id: 'means-both-homes', gate: 's7-means-both-homes', at: ['means-both'], done: ['means-both#0'],
        why: 'means-both#2 directive routes nothing to the team' },
    ],
    'parent-own-untreated-illness': [
      { id: 'ask-directly', gate: 's8-ask-directly', at: ['worry', 'repair-dismiss'], done: ['worry#0', 'repair-dismiss#0'],
        why: 'the direct question' },
      { id: 'handover', gate: 's8-handover', at: ['worry-answer', 'close'], done: ['worry-answer#0', 'close#0'],
        why: 'attending now (worry-answer#0); close#0 "my attending will come back to you today" read as a late handover' },
      { id: 'means-asked', gate: 's8-means-asked', at: ['roles', 'roles-unrouted'], done: ['roles#0', 'roles-unrouted#0'],
        why: 'quick-harm things held by someone else + firearm question' },
    ],
  },
};

const BEST_ENDING = {
  'angry-parent-admission': 'end-next-step', 'ambivalent-spouse-discharge': 'end-shared',
  'silent-teen-guardian-present': 'end-heard', 'hold-disagreement-admission': 'end-ally',
  'shared-decision-household': 'end-together', 'siblings-late-onset-psychosis': 'end-shared-care',
  'coparents-discharge-adolescent': 'end-two-homes', 'parent-own-untreated-illness': 'end-two-doors',
};

/* sha256 over what the reading depends on: every choice (text, next) at every node the model
   names, in node order. Generate with PRINT_SAFETY_PINS=1. */
const MODEL_PINS = {
  1: {
    'angry-parent-admission': '88d5a516aaf0c044cc2036c266db66be1185aa722b66eba9aa6603673b2b8298',
    'ambivalent-spouse-discharge': 'bc16480a4683dde7fa35cd7a58a311cb714d7267b3dd2ec080ba7b1a9928e6fe',
    'silent-teen-guardian-present': 'df7b610eb43d2745e2c9d82865aed843777cd89830e887547e4c61bc0707becb',
    'hold-disagreement-admission': 'd7a85f22c2b1d36182451e94c62b79e86d2dd00aeb01480a1902a2a3e0b3894d',
    'shared-decision-household': 'e9fe1df12beb4c61a9d7cfd34794ffbf176469ffcfdeaec45973683894fa95d7',
    'siblings-late-onset-psychosis': '7eaacb8d585916be5790bb8f0fc77c38211b02f5e0076cbe03e19700518fffe5',
    'coparents-discharge-adolescent': '4a9ce573ba4f3e445e89bb0ebb414c353246847f72d2586f0f8c02f6103e3f49',
    'parent-own-untreated-illness': '24bd957af3b6c70e4ad1170e1b7d874dcfe7a374293d84f772c2a04346ce4ae8',
  },
  2: {
    'angry-parent-admission': '88d5a516aaf0c044cc2036c266db66be1185aa722b66eba9aa6603673b2b8298',
    'ambivalent-spouse-discharge': 'bc16480a4683dde7fa35cd7a58a311cb714d7267b3dd2ec080ba7b1a9928e6fe',
    'silent-teen-guardian-present': '103e09f3b4af1af2062f5ba93530e84d39d2d3006c0c733e4fe577900a42ca49',
    'hold-disagreement-admission': '93f0373a141743f7402e50a9cd0895df345e074601e3d688d7cd0eee17cff288',
    'shared-decision-household': 'd8f3f3c593b5bc2291ab72230c19cfe1b00882655ba654d20f93cea371bf6a61',
    'siblings-late-onset-psychosis': 'f1f8cd702820f67e6ad53c3aca7f527b555acc7ddf891763947673f64879df84',
    'coparents-discharge-adolescent': '7c9d4f9e749b36aa5e7434a1e136005754aea8955edbf7893167f1da7dfa4209',
    'parent-own-untreated-illness': '74bd154a640fa0b75bc5d92900b850828d68ac213d5adf75e0a64066df24fc39',
  },
};

/* Defects of one exact file, as `scenario|rule|item` -> number of paths. See header. */
const KNOWN_DEFECTS = {
  // origin/main 61530b10 (2026-10-29; unchanged through 2026-11-05), family-meeting-sim.html as
  // merged in #1147. 19,980 paths. All of these are fixed structurally by draft #1149 (v2), whose
  // head 91958ce8 instead shows five O1 over-penalty findings (close#0 not credited; FY3 §3.2).
  '98b52ef80fcfef8687485da05c1a3c685cf9ec8c0ae432b6ad182a5708409d9c': {
    'coparents-discharge-adolescent|U1 safety-shown-as-pass|means-both-homes': 15,
    'coparents-discharge-adolescent|U2 best-ending-silent|means-both-homes': 450,
    'parent-own-untreated-illness|U1 safety-shown-as-pass|ask-directly': 3,
    'parent-own-untreated-illness|U1 safety-shown-as-pass|handover': 36,
    'parent-own-untreated-illness|U1 safety-shown-as-pass|means-asked': 3,
    'parent-own-untreated-illness|U2 best-ending-silent|ask-directly': 405,
    'parent-own-untreated-illness|U2 best-ending-silent|handover': 675,
    'parent-own-untreated-illness|U2 best-ending-silent|means-asked': 450,
    'silent-teen-guardian-present|U1 safety-shown-as-pass|means-and-roles': 5,
    'silent-teen-guardian-present|U2 best-ending-silent|means-and-roles': 450,
  },
};

// ---------------------------------------------------------------------------------------------

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const ref = (s) => `${s.node}#${s.choice}`;

function modelPin(sc, items) {
  const nodes = [...new Set(items.flatMap((it) => it.at))].sort();
  return sha(JSON.stringify(nodes.map((n) => [n, (sc.nodes[n] ? sc.nodes[n].choices : null)
    ?.map((c) => [c.text, c.next])])));
}

/** Every complete path, by an independent DFS (not E.paths), so an engine bug cannot hide one. */
function allPaths(sc) {
  const out = [];
  const walk = (at, steps, seen) => {
    assert.ok(!seen.has(at), `${sc.id}: cycle through ${at}`);
    const node = sc.nodes[at];
    assert.ok(node, `${sc.id}: node ${at} exists`);
    node.choices.forEach((c, i) => {
      const s = [...steps, { node: at, choice: i }];
      if (has(sc.endings, c.next)) out.push({ steps: s, ending: c.next });
      else walk(c.next, s, new Set([...seen, at]));
    });
  };
  walk(sc.start, [], new Set());
  return out;
}

const SAFETY_OFTEN_TEXT = 'You made this move often on this run.';
function shown(data, sc, path) {
  const t = E.tally(sc, path.steps);
  if (!R) {
    return { safetyOften: E.band(t.safety.pct) === 'often', banner: false, gate: null };
  }
  const run = { scenarioId: sc.id, at: null, steps: path.steps, ended: path.ending };
  const out = R.debriefHtml(data, sc, run);
  const bar = /<div class="axis"><div class="axis-head">([^<]*)<span>[\s\S]*?<p class="anchor"><b>([^<]*)<\/b>/g;
  const safetyLabel = data.axes.find((a) => a.id === 'safety').label;
  let safetyOften = null;
  for (const m of out.matchAll(bar)) if (m[1] === safetyLabel) safetyOften = m[2] === SAFETY_OFTEN_TEXT;
  assert.notEqual(safetyOften, null, `${sc.id}: safety bar rendered`);
  const g = E.gateStatus(sc, path.steps, data.flagDefs);
  return { safetyOften, banner: out.includes('class="gate-banner"'), gate: Object.fromEntries(g.items.map((it) => [it.id, it.status])) };
}

function evaluate(data) {
  const model = SAFETY_MODEL[data.version];
  const found = {};
  const examples = {};
  let total = 0;
  const bump = (k, path) => { found[k] = (found[k] || 0) + 1; if (!examples[k]) examples[k] = path.steps.map(ref).join(' '); };
  for (const sc of data.scenarios) {
    const items = model[sc.id];
    const paths = allPaths(sc);
    assert.equal(paths.length, E.paths(sc).length, `${sc.id}: independent walk and engine agree on the path count`);
    total += paths.length;
    for (const path of paths) {
      const refs = new Set(path.steps.map(ref));
      const visited = new Set(path.steps.map((s) => s.node));
      const view = shown(data, sc, path);
      for (const it of items) {
        if (!it.at.some((n) => visited.has(n))) continue; // risk never live on this path
        const done = it.done.some((r) => refs.has(r));
        const gs = it.gate && view.gate ? view.gate[it.gate] : undefined;
        if (!done) {
          if (view.safetyOften) bump(`${sc.id}|U1 safety-shown-as-pass|${it.id}`, path);
          if (path.ending === BEST_ENDING[sc.id] && !view.banner) bump(`${sc.id}|U2 best-ending-silent|${it.id}`, path);
          if (gs === 'met' || gs === 'met-after-miss') bump(`${sc.id}|U3 gate-credits-miss|${it.id}`, path);
        } else if (gs === 'missed') {
          bump(`${sc.id}|O1 gate-misses-done|${it.id}`, path);
        }
      }
    }
  }
  return { found, examples, total };
}

// ---------------------------------------------------------------------------------------------

test('the safety model covers this data version and every scenario, pinned to the text it read', () => {
  const model = SAFETY_MODEL[DATA.version];
  assert.ok(model, `data.version ${DATA.version} has no SAFETY_MODEL — model it before it ships`);
  assert.deepEqual(DATA.scenarios.map((s) => s.id).sort(), Object.keys(model).sort(),
    'SAFETY_MODEL covers exactly the shipped scenarios');
  const pins = {};
  for (const sc of DATA.scenarios) {
    const items = model[sc.id];
    assert.ok(has(sc.endings, BEST_ENDING[sc.id]), `${sc.id}: BEST_ENDING exists`);
    for (const it of items) {
      for (const n of it.at) assert.ok(has(sc.nodes, n), `${sc.id}/${it.id}: node ${n} exists`);
      for (const r of it.done) {
        const [n, i] = r.split('#');
        assert.ok(it.at.includes(n) && sc.nodes[n].choices[Number(i)], `${sc.id}/${it.id}: ${r} is a choice at a modelled node`);
      }
      if (it.gate) {
        assert.ok((sc.gate?.required || []).some((g) => g.id === it.gate), `${sc.id}/${it.id}: gate ${it.gate} exists`);
      }
    }
    pins[sc.id] = modelPin(sc, items);
  }
  if (process.env.PRINT_SAFETY_PINS) {
    writeFileSync(`${process.env.PRINT_SAFETY_PINS}/pins.json`, JSON.stringify({ version: DATA.version, file: FILE_SHA, pins }, null, 2));
  }
  for (const sc of DATA.scenarios) {
    assert.equal(pins[sc.id], MODEL_PINS[DATA.version][sc.id],
      `${sc.id}: the choices this model read changed — re-read them and re-model before updating the pin`);
  }
});

test('engine sanity: a safety-flagged or keyed choice is where the model says (no silent drift)', () => {
  // Every `done` choice must score the node's maximum on safety: the keyed action is the
  // safest move offered. If not, either the model or the scoring is wrong.
  for (const sc of DATA.scenarios) {
    for (const it of SAFETY_MODEL[DATA.version][sc.id]) {
      for (const r of it.done) {
        const [n, i] = r.split('#');
        const node = sc.nodes[n];
        const max = Math.max(...node.choices.map((c) => c.scores.safety));
        assert.equal(node.choices[Number(i)].scores.safety, max, `${sc.id} ${r}: performs ${it.id} but is not the safest option at ${n}`);
      }
    }
  }
});

test('all paths: no path that misses a safety-critical action is shown as a pass, and the record agrees', () => {
  const { found, examples, total } = evaluate(DATA);
  if (process.env.PRINT_SAFETY_PINS) {
    writeFileSync(`${process.env.PRINT_SAFETY_PINS}/found.json`, JSON.stringify({ file: FILE_SHA, total, found, examples }, null, 2));
  }
  const known = KNOWN_DEFECTS[FILE_SHA] || {};
  const detail = Object.keys({ ...found, ...known }).sort()
    .filter((k) => found[k] !== known[k])
    .map((k) => `${k}: found ${found[k] || 0}, known ${known[k] || 0}${examples[k] ? ` — e.g. ${examples[k]}` : ''}`);
  assert.deepEqual(detail, [], `${total} paths walked; safety-gate mismatches:\n  ${detail.join('\n  ')}`);
});

test('the gate is not vacuous: re-introducing the P0-2 defect is caught', () => {
  // Mutate a copy in memory (the committed file is untouched): make the non-asking reply at
  // `worry` (S8) count as safe. v1: score it as the safest move. v2: also let it satisfy the
  // gate item and drop its flag, as an unreviewed edit might.
  const d = JSON.parse(JSON.stringify(DATA));
  const s8 = d.scenarios.find((s) => s.id === 'parent-own-untreated-illness');
  const nonAsk = s8.nodes.worry.choices.findIndex((c, i) => !SAFETY_MODEL[d.version][s8.id][0].done.includes(`worry#${i}`));
  assert.ok(nonAsk >= 0, 'S8 worry has a choice that does not ask');
  s8.nodes.worry.choices[nonAsk].scores.safety = 2;
  delete s8.nodes.worry.choices[nonAsk].flag;
  const g = (s8.gate?.required || []).find((x) => x.id === 's8-ask-directly');
  if (g) g.satisfiedBy.push(`worry#${nonAsk}`);
  const before = evaluate(DATA).found;
  const after = evaluate(d).found;
  const key = (rule) => `${s8.id}|${rule}|ask-directly`;
  const grew = ['U1 safety-shown-as-pass', 'U2 best-ending-silent', 'U3 gate-credits-miss']
    .filter((r) => (after[key(r)] || 0) > (before[key(r)] || 0));
  assert.ok(grew.length > 0, `the mutation must raise at least one violation; before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
});
