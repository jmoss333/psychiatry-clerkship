// Family Meeting Simulator (WP-F1-engine): the branching engine and its three draft scenarios.
//
// The tool is one file: scenario data inline as <script type="application/json"
// id="fms-scenarios">, and a DOM-free engine in <script id="fms-engine"> that this test
// evaluates on its own. Pinned here: the data's shape (every `next` resolves, every choice
// scores all four axes 0-2), the graph (acyclic, every node and ending reachable, every path
// terminates in 6-10 decisions, every path can show every skill), scoring determinism, and the
// library rules that apply to a clinical tool (no dose literals, crisis block by marker only,
// one literal cw_* storage key, no network, no free text). Reads committed files only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const FILE = new URL('../08_Cases_and_Simulation/family-meeting-sim/family-meeting-sim.html', import.meta.url);
const html = readFileSync(FILE, 'utf8');

const dataMatch = html.match(/<script type="application\/json" id="fms-scenarios">([\s\S]*?)<\/script>/);
const engineMatch = html.match(/<script id="fms-engine">([\s\S]*?)<\/script>/);
const AXES = ['validation', 'structure', 'safety', 'nonblaming'];
const IDS = ['angry-parent-admission', 'ambivalent-spouse-discharge', 'silent-teen-guardian-present'];

function data() { return JSON.parse(dataMatch[1]); }
function engine() { return new Function(`${engineMatch[1]}\nreturn FMSEngine;`)(); }
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

test('the scenario block parses and carries the three draft scenarios', () => {
  assert.ok(dataMatch, 'inline scenario JSON block present');
  const d = data();
  assert.equal(d.status, 'draft', 'scenarios ship as draft until faculty attest the tool');
  for (const id of IDS) assert.ok(d.scenarios.some((s) => s.id === id), `scenario ${id} exists`);
  assert.deepEqual(d.axes.map((a) => a.id), AXES, 'four axes, in order');
  for (const a of d.axes) assert.ok(a.label && a.anchor, `axis ${a.id} has a label and rubric anchor`);
});

test('the engine accepts the shipped data', () => {
  assert.ok(engineMatch, 'engine block present');
  assert.deepEqual(engine().validate(data()), []);
});

test('every next resolves and every choice scores all four axes 0-2', () => {
  for (const sc of data().scenarios) {
    assert.ok(has(sc.nodes, sc.start), `${sc.id}: start resolves`);
    for (const [nid, node] of Object.entries(sc.nodes)) {
      assert.ok(has(sc.phases || data().phases, node.phase), `${sc.id}/${nid}: phase is a playbook phase`);
      assert.ok(node.choices.length >= 3 && node.choices.length <= 4, `${sc.id}/${nid}: 3-4 choices`);
      assert.ok(node.lines.length >= 1, `${sc.id}/${nid}: someone speaks`);
      node.choices.forEach((c, i) => {
        const at = `${sc.id}/${nid}#${i}`;
        assert.ok(has(sc.nodes, c.next) || has(sc.endings, c.next), `${at}: next "${c.next}" resolves`);
        assert.deepEqual(Object.keys(c.scores).sort(), [...AXES].sort(), `${at}: exactly the four axes`);
        for (const a of AXES) assert.ok([0, 1, 2].includes(c.scores[a]), `${at}: ${a} in 0-2`);
        assert.ok(c.text.trim() && c.feedback.trim(), `${at}: text and feedback`);
      });
    }
  }
});

test('graph: acyclic, all nodes and endings reachable, every path ends in 6-10 decisions', () => {
  const E = engine();
  for (const sc of data().scenarios) {
    // Independent DFS (not the engine's) so a bug in paths() cannot hide a dead end.
    const state = {};
    const reachedEndings = new Set();
    (function visit(id) {
      if (has(sc.endings, id)) { reachedEndings.add(id); return; }
      assert.notEqual(state[id], 'open', `${sc.id}: cycle through ${id}`);
      if (state[id] === 'done') return;
      state[id] = 'open';
      for (const c of sc.nodes[id].choices) visit(c.next);
      state[id] = 'done';
    })(sc.start);
    for (const id of Object.keys(sc.nodes)) assert.equal(state[id], 'done', `${sc.id}: node ${id} reachable`);
    for (const id of Object.keys(sc.endings)) assert.ok(reachedEndings.has(id), `${sc.id}: ending ${id} reachable`);

    const all = E.paths(sc);
    assert.ok(all.length > 0, `${sc.id}: at least one path`);
    for (const p of all) {
      assert.ok(has(sc.endings, p.ending), `${sc.id}: path terminates in an ending`);
      assert.ok(p.steps.length >= 6 && p.steps.length <= 10, `${sc.id}: ${p.steps.length} decisions on a path`);
      const t = E.tally(sc, p.steps);
      for (const a of AXES) assert.ok(t[a].max > 0, `${sc.id}: every path can show ${a}`);
    }
  }
});

test('every rupture has a repair route back to the main line', () => {
  for (const sc of data().scenarios) {
    const repairs = Object.entries(sc.nodes).filter(([, n]) => n.repair);
    assert.ok(repairs.length >= 1, `${sc.id}: at least one repair moment`);
    for (const [nid, n] of repairs) {
      assert.ok(n.choices.every((c) => has(sc.nodes, c.next)), `${sc.id}/${nid}: a repair node never ends the scenario`);
      assert.ok(n.choices.some((c) => AXES.every((a) => c.scores[a] >= 1) || c.scores.validation === 2),
        `${sc.id}/${nid}: offers a genuine repair`);
    }
  }
});

test('scoring is deterministic and normalised to the path actually taken', () => {
  const E = engine();
  for (const sc of data().scenarios) {
    for (const p of E.paths(sc)) {
      const a = E.tally(sc, p.steps), b = E.tally(sc, p.steps);
      assert.deepEqual(a, b);
      for (const ax of AXES) {
        assert.ok(a[ax].earned <= a[ax].max && a[ax].pct >= 0 && a[ax].pct <= 100);
        const max = p.steps.reduce((s, st) => s + Math.max(...sc.nodes[st.node].choices.map((c) => c.scores[ax])), 0);
        assert.equal(a[ax].max, max, `${sc.id}: max is per visited node`);
      }
    }
  }
  // A hand-checked path: the authored first option at every node of the angry-parent scenario.
  const sc = data().scenarios.find((s) => s.id === 'angry-parent-admission');
  let run = E.newRun(sc);
  const before = JSON.stringify(run);
  while (!run.ended) run = E.choose(sc, run, 0);
  assert.equal(JSON.stringify(E.newRun(sc)), before, 'choose() does not mutate');
  assert.equal(run.ended, 'end-next-step');
  assert.equal(run.steps.length, 6);
  assert.deepEqual(Object.fromEntries(AXES.map((a) => [a, E.tally(sc, run.steps)[a].pct])),
    { validation: 100, structure: 100, safety: 100, nonblaming: 100 });
  assert.equal(E.band(100), 'often');
  assert.equal(E.band(50), 'sometimes');
  assert.equal(E.band(10), 'rarely');
  assert.equal(E.band(null), 'untested');
});

test('rewind replays from a moment without touching the steps before it', () => {
  const E = engine();
  const sc = data().scenarios.find((s) => s.id === 'silent-teen-guardian-present');
  let run = E.newRun(sc);
  while (!run.ended) run = E.choose(sc, run, 1);
  const back = E.rewind(sc, run, 2);
  assert.equal(back.ended, null);
  assert.equal(back.steps.length, 2);
  assert.deepEqual(back.steps, run.steps.slice(0, 2));
  assert.equal(back.at, run.steps[2].node);
  assert.throws(() => E.choose(sc, run, 0), /ended/);
});

test('display order is a deterministic permutation that does not always lead with the strongest option', () => {
  const E = engine();
  let ledWithStrongest = 0, nodes = 0;
  for (const sc of data().scenarios) {
    for (const [nid, n] of Object.entries(sc.nodes)) {
      const o = E.displayOrder(sc.id, nid, n.choices.length);
      assert.deepEqual([...o].sort(), n.choices.map((_, i) => i));
      assert.deepEqual(E.displayOrder(sc.id, nid, n.choices.length), o);
      nodes += 1;
      if (o[0] === E.strongest(n)) ledWithStrongest += 1;
    }
  }
  assert.ok(ledWithStrongest < nodes, 'the best answer is not always the first button');
});

test('library rules: no doses, crisis block by marker, one literal cw_* key, no network, no free text', () => {
  const DOSE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i;
  html.split('\n').forEach((line, i) => assert.doesNotMatch(line, DOSE, `dose literal on line ${i + 1}`));
  assert.match(html, /<!-- crisis-block-html -->/, 'crisis contacts opt in by marker');
  assert.doesNotMatch(html, /\b988\b/, 'no hard-coded crisis number');
  const keys = [...html.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(keys.length >= 2);
  for (const k of keys) assert.equal(k, "'cw_family_sim_v1'", 'only the literal cw_family_sim_v1 key');
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/, 'no network calls');
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'no external scripts');
  assert.doesNotMatch(html, /<textarea|<input\b/i, 'no free-text fields');
  assert.match(html, /Fictional practice\. Do not enter real patient or family details\./, 'no-PHI banner');
  assert.match(html, /<!-- \[CLERKSHIP-META v1\] tool="Family Meeting Simulator"/, 'metadata marker');
  assert.match(html, /<h1>Family Meeting Simulator<\/h1>/, 'the tool titles itself');
  assert.doesNotMatch(html, /name="cw-frame"/, 'content-height frame (no cw-frame=viewport)');
});
