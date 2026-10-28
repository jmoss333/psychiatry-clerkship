// Family Conversation Simulator (WP-F1-engine, v2 redesign 2026-10-27): the branching engine,
// its eight draft scenarios, and the v2 safety gate.
//
// The tool is one file: scenario data inline as <script type="application/json"
// id="fms-scenarios">, a DOM-free engine in <script id="fms-engine">, and DOM-free HTML string
// builders in <script id="fms-render">; this test evaluates the two script blocks on their own.
// Pinned here: the data's shape (every `next` resolves, every choice scores all four axes 0-2),
// the graph (acyclic, every node and ending reachable, every path terminates in 6-10 decisions,
// every path can show every skill), scoring determinism, the v2 layer — required safety actions
// per scenario (`gate`), choice flags (`flagDefs`), endings composed from the path (`addenda`),
// which skill points can never offset — and the library rules that apply to a clinical tool (no
// dose literals, crisis block by marker only, one literal cw_* storage key, no network, no free
// text). Authored choice order within a node is frozen once shipped: append, never reorder.
// Reads committed files only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const FILE = new URL('../08_Cases_and_Simulation/family-meeting-sim/family-meeting-sim.html', import.meta.url);
const html = readFileSync(FILE, 'utf8');

const dataMatch = html.match(/<script type="application\/json" id="fms-scenarios">([\s\S]*?)<\/script>/);
const engineMatch = html.match(/<script id="fms-engine">([\s\S]*?)<\/script>/);
const renderMatch = html.match(/<script id="fms-render">([\s\S]*?)<\/script>/);
const AXES = ['validation', 'structure', 'safety', 'nonblaming'];
const IDS = [
  'angry-parent-admission', 'ambivalent-spouse-discharge', 'silent-teen-guardian-present',
  'hold-disagreement-admission', 'shared-decision-household', 'siblings-late-onset-psychosis',
  'coparents-discharge-adolescent', 'parent-own-untreated-illness',
];

function data() { return JSON.parse(dataMatch[1]); }
function engine() { return new Function(`${engineMatch[1]}\nreturn FMSEngine;`)(); }
function render() { return new Function(`${engineMatch[1]}\n${renderMatch[1]}\nreturn FMSRender;`)(); }
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const byId = (d, id) => d.scenarios.find((s) => s.id === id);
const ref = (s) => `${s.node}#${s.choice}`;
// Play a path given as "node#choice" tokens, checking each token names the node the run is at.
function play(E, sc, tokens) {
  let run = E.newRun(sc);
  for (const tok of tokens) {
    const [node, idx] = tok.split('#');
    assert.equal(run.at, node, `${sc.id}: path token ${tok} is not where the run is (${run.at})`);
    run = E.choose(sc, run, Number(idx));
  }
  return run;
}
function optionZero(E, sc) { let r = E.newRun(sc); while (!r.ended) r = E.choose(sc, r, 0); return r; }
const runOf = (sc, p) => ({ scenarioId: sc.id, at: null, steps: p.steps, ended: p.ending });

// The W-table "After" strings this suite pins verbatim (F1 v2 spec, Part B).
const W = {
  W005: 'On this run a required safety step was not done, or a risk was set aside. In practice that comes before every skill below and is handled in the moment, with your supervisor — the percentages do not offset it.',
  W006: 'Owning it to the patient, the family and your supervisor is the repair; it does not undo the disclosure.',
  W007: 'A required safety step was missed on this run; this percentage does not offset it.',
  W008: 'Shown on this screen only; not saved and not sent anywhere.',
  W009: 'Each scenario takes about ten minutes and has six to ten decision points. Most missteps have a route back; some are flagged in the debrief. Choices are scored on four skills, and required safety steps are shown separately; the debrief shows bars and feedback, never a pass or fail.',
  W011: 'Draft rubric, not validated. The four skills and their scores are an authored draft that has not been tested for reliability or validity; faculty review is pending. Use the bars to notice patterns, not to judge yourself or anyone else.',
  W022: 'Thank you for saying it before I asked — that tells me something about you. Most families don\'t know that the weeks right after leaving hospital are a higher-risk time, and the simplest protection is distance between someone who isn\'t sleeping and anything that could hurt them fast. Would you talk through storage of the rifle with the team before he comes home — and could we talk with Jordan, too, about the truck and driving for now?',
  W024: ', and — I ask every family this — whether there\'s a gun in the house. Sam, which of those feel possible to you?',
  W026: 'What you tell me there stays between you and the team, unless I\'m worried about your safety or someone else\'s — and if that happened, I\'d tell you first.',
  W027: 'Thank you, Lina — I can tell you\'ve been translating for your family for a long time, and that\'s a real thing to carry. Today I\'d like you to be the person we\'re here for, so the interpreter will translate everything, both ways, and I\'ll speak with your mother and grandfather directly. Where would everyone like to sit?',
  W029: 'are kept by another adult — and I ask every family: is there a gun in the house? — and there\'s an agreed way',
  W030: 'Owen, thank you for the handgun — that\'s exactly what we need to know, not because of who she is, but because frightening beliefs can lead to frightening actions, and because the months after losing a husband can be a time when people think about not wanting to go on — that\'s something the team will ask her about directly. For the first stretch at home I\'d like the two of you to think about three things the team will then go through with her: where the handgun lives, who she calls when she\'s frightened, and what that person says — which is not \'they aren\'t real\'. The social worker and the attending will work through the specifics with you, including driving — and your mother gets a say in all of it.',
  W032: 'and anything else — and I ask every family this: is there a gun in either house? If there is, the social worker will talk through keeping it out of the home or locked away from Riley for now — is kept where Riley can\'t get to it alone',
  FIREARM: 'Ask about firearms every time; families rarely volunteer them.',
};

test('the scenario block parses and carries the eight draft scenarios', () => {
  assert.ok(dataMatch, 'inline scenario JSON block present');
  const d = data();
  assert.equal(d.status, 'draft', 'scenarios ship as draft until faculty attest the tool');
  for (const id of IDS) assert.ok(d.scenarios.some((s) => s.id === id), `scenario ${id} exists`);
  for (const sc of d.scenarios) {
    assert.ok(sc.goals.length >= 3, `${sc.id}: at least three practice goals`);
    assert.ok(Object.values(sc.nodes).filter((n) => n.repair).length >= 2, `${sc.id}: at least two repair moments`);
    assert.ok(sc.gate && sc.gate.required.length >= 2, `${sc.id}: at least two required safety actions`);
  }
  assert.deepEqual(d.axes.map((a) => a.id), AXES, 'four axes, in order');
  for (const a of d.axes) assert.ok(a.label && a.anchor, `axis ${a.id} has a label and rubric anchor`);
  assert.equal(d.version, 2, 'data version 2 (the safety-gate redesign)');
  assert.equal(typeof d.rubricVersion, 'string');
  assert.ok(d.rubricVersion.length > 0);
  assert.deepEqual(Object.keys(d.flagDefs).sort(),
    ['disclosure-beyond-consent', 'lethal-means-dismissed', 'risk-judged-by-student', 'suicide-statement-not-asked']);
});

test('the engine accepts the shipped data', () => {
  assert.ok(engineMatch, 'engine block present');
  assert.deepEqual(engine().validate(data()), []);
});

test('the engine rejects data that breaks the v2 rules', () => {
  const E = engine();
  const broken = (mutate) => { const d = data(); mutate(d); return E.validate(d); };
  assert.ok(broken((d) => { delete d.rubricVersion; }).some((e) => /rubricVersion/.test(e)));
  assert.ok(broken((d) => { byId(d, 'angry-parent-admission').nodes.open.choices[1].flag = 'nope'; }).some((e) => /unknown flag/.test(e)));
  assert.ok(broken((d) => { byId(d, 'angry-parent-admission').gate.required = []; }).some((e) => /non-empty/.test(e)));
  assert.ok(broken((d) => { byId(d, 'angry-parent-admission').endings['end-promise'].text += ' The rifle is gone.'; })
    .some((e) => /base text claims s1-rifle-routed/.test(e)), 'ending lint catches an unconditioned claim');
  assert.ok(broken((d) => { byId(d, 'angry-parent-admission').nodes.means.choices[1].scores.safety = 1; })
    .some((e) => /safety-flagged choice must score safety 0/.test(e)));
  assert.ok(broken((d) => { byId(d, 'angry-parent-admission').gate.required[1].offeredAt = ['visit']; byId(d, 'angry-parent-admission').gate.required[1].satisfiedBy = ['visit#0']; })
    .length === 0, 'moving an item to another always-visited node is still valid');
  assert.ok(broken((d) => { const sc = byId(d, 'ambivalent-spouse-discharge'); sc.gate.required[0].offeredAt = ['repair-verdict']; sc.gate.required[0].satisfiedBy = ['repair-verdict#0']; })
    .some((e) => /never offers s2-plan-shared/.test(e)), 'I-3: an item offered only off the main line is rejected');
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

test('graph: acyclic, reachable, 6-10 decisions, every axis testable', () => {
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
    let longest = 0;
    const onPath = new Set();
    for (const p of all) {
      assert.ok(has(sc.endings, p.ending), `${sc.id}: path terminates in an ending`);
      assert.ok(p.steps.length >= 6 && p.steps.length <= 10, `${sc.id}: ${p.steps.length} decisions on a path`);
      longest = Math.max(longest, p.steps.length);
      p.steps.forEach((s) => onPath.add(s.node));
      const t = E.tally(sc, p.steps);
      for (const a of AXES) assert.ok(t[a].max > 0, `${sc.id}: every path can show ${a}`);
    }
    assert.ok(longest <= 10, `${sc.id}: longest path ${longest} <= 10`);
    for (const [nid, n] of Object.entries(sc.nodes)) if (n.repair) assert.ok(onPath.has(nid), `${sc.id}/${nid}: repair node lies on a complete path`);
  }
});

// I-7 (P3-1) is enforced as a ratchet. The spec's literal form — every choice scoring 0 on two or
// more axes routes to a repair node or carries a flag — holds for none of the authored scenarios
// (99 choices, most of them ordinary weak moves at main-line nodes and repair-node misfires), and
// meeting it would mean authoring new learner-visible repair nodes and flags that are not in the
// approved wording table. So the choices that predate v2 are listed here, and the list may only
// shrink: a new or rescored choice that breaks I-7 fails, and so does a listed choice that no
// longer breaks it (delete its entry). Faculty decide whether to close the gap.
const I7_KNOWN = {
  'angry-parent-admission': 'repair-rules#1 repair-rules#2 share-limits#2 repair-disclosure#1 repair-disclosure#2 collateral#1 collateral#2 means#2 visit#1 visit#2 close#1 close#2',
  'ambivalent-spouse-discharge': 'open#2 repair-ready#1 repair-ready#2 feelings#1 feelings#2 plan-review#1 limits#1 repair-verdict#1 repair-verdict#2 means#2 close#1 close#2',
  'silent-teen-guardian-present': 'open#2 repair-pressure#1 repair-pressure#2 story#1 repair-why#1 repair-why#2 privacy#1 privacy#2 trust#1 trust#2 response#1 response#2 close#1 close#2',
  'hold-disagreement-admission': 'repair-defend#1 repair-defend#2 what-you-can#2 repair-disclosure#1 repair-disclosure#2 rights#2 repair-law#1 repair-law#2 observations#1 means#2 close#1 close#2',
  'shared-decision-household': 'repair-interpreter#1 repair-interpreter#2 decisions#1 decisions#2 privacy#2 repair-disclosure#1 repair-disclosure#2 repair-assume#1 repair-assume#2 safety-home#1 close#1 close#2',
  'siblings-late-onset-psychosis': 'repair-open#1 repair-open#2 workup#2 repair-certainty#1 repair-certainty#2 split#2 repair-sides#1 repair-sides#2 burden#1 safety-home#2 close#1 close#2',
  'coparents-discharge-adolescent': 'open#1 open#2 riley#2 repair-over-riley#1 repair-over-riley#2 triangle#2 repair-sided#1 repair-sided#2 means-both#1 means-both#2 channel#1 close#1 close#2',
  'parent-own-untreated-illness': 'open#1 open#2 picture#2 repair-disclosure#1 repair-disclosure#2 drinking#2 repair-diagnose#1 repair-diagnose#2 roles#1 roles#2 close#1 close#2',
};

test('every rupture has a repair route back, or is flagged', () => {
  for (const sc of data().scenarios) {
    const repairs = Object.entries(sc.nodes).filter(([, n]) => n.repair);
    assert.ok(repairs.length >= 1, `${sc.id}: at least one repair moment`);
    for (const [nid, n] of repairs) {
      assert.ok(n.choices.every((c) => has(sc.nodes, c.next)), `${sc.id}/${nid}: a repair node never ends the scenario`);
      assert.ok(n.choices.some((c) => AXES.every((a) => c.scores[a] >= 1) || c.scores.validation === 2),
        `${sc.id}/${nid}: offers a genuine repair`);
    }
    const known = new Set(I7_KNOWN[sc.id].split(' '));
    for (const [nid, n] of Object.entries(sc.nodes)) {
      n.choices.forEach((c, i) => {
        const at = `${nid}#${i}`;
        const zeros = AXES.filter((a) => c.scores[a] === 0).length;
        const routed = (has(sc.nodes, c.next) && sc.nodes[c.next].repair === true) || c.flag !== undefined;
        const breaks = zeros >= 2 && !routed;
        if (breaks) assert.ok(known.has(at), `${sc.id}/${at}: scores 0 on ${zeros} axes and neither routes to a repair node nor carries a flag`);
        else assert.ok(!known.has(at), `${sc.id}/${at}: no longer breaks I-7 — remove it from I7_KNOWN`);
      });
    }
  }
});

test('authored choice order is frozen: no node loses choices', () => {
  // v2 baseline. Item ids are `${scenarioId}/${nodeId}#${index}`; the rubric-validation study keys
  // on them, so a node may gain choices (appended) but never shrink or reorder.
  const BASE = {
    'angry-parent-admission': 'open:3 repair-rules:3 share-limits:3 repair-disclosure:3 collateral:3 means:3 visit:3 close:3',
    'ambivalent-spouse-discharge': 'open:3 repair-ready:3 feelings:3 plan-review:3 limits:3 repair-verdict:3 means:3 close:3',
    'silent-teen-guardian-present': 'open:3 repair-pressure:3 story:3 repair-why:3 privacy:3 trust:3 response:3 close:3',
    'hold-disagreement-admission': 'open:3 repair-defend:3 what-you-can:3 repair-disclosure:3 rights:3 repair-law:3 observations:3 means:3 close:3',
    'shared-decision-household': 'open:3 repair-interpreter:3 decisions:3 privacy:3 repair-disclosure:3 meaning:3 repair-assume:3 safety-home:3 close:3',
    'siblings-late-onset-psychosis': 'open:3 repair-open:3 workup:3 repair-certainty:3 split:3 repair-sides:3 burden:3 safety-home:3 close:3',
    'coparents-discharge-adolescent': 'open:3 riley:3 repair-over-riley:3 triangle:3 repair-sided:3 means-both:3 channel:3 close:3',
    'parent-own-untreated-illness': 'open:3 picture:3 repair-disclosure:3 drinking:3 repair-diagnose:3 worry:3 repair-dismiss:3 worry-answer:3 roles:3 close:3',
  };
  const E = engine();
  for (const sc of data().scenarios) {
    for (const pair of BASE[sc.id].split(' ')) {
      const [nid, n] = pair.split(':');
      assert.ok(has(sc.nodes, nid), `${sc.id}/${nid}: node still exists`);
      assert.ok(sc.nodes[nid].choices.length >= Number(n), `${sc.id}/${nid}: choice count shrank`);
    }
    assert.equal(E.itemId(sc, 'open', 0), `${sc.id}/open#0`);
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

test('the option-0 path is the main line, satisfies every gate item and scores 100%', () => {
  // The authoring convention: option 0 is the strongest authored move at each main-line node, so
  // playing it throughout visits every non-repair node once (six moments in S1-S7, seven in S8),
  // scores 100% on every axis and does every required safety step. A rescore that breaks this
  // is a rubric change and should be deliberate.
  const E = engine();
  for (const s of data().scenarios) {
    const r = optionZero(E, s);
    const mainLine = Object.values(s.nodes).filter((n) => !n.repair).length;
    assert.equal(r.steps.length, mainLine, `${s.id}: option-0 path visits every main-line node`);
    assert.ok(r.steps.length === 6 || r.steps.length === 7, `${s.id}: 6 or 7 decisions`);
    if (s.id === 'parent-own-untreated-illness') assert.equal(r.steps.length, 7);
    assert.ok(r.steps.every((st) => !s.nodes[st.node].repair), `${s.id}: option-0 path stays on the main line`);
    assert.deepEqual(Object.fromEntries(AXES.map((a) => [a, E.tally(s, r.steps)[a].pct])),
      { validation: 100, structure: 100, safety: 100, nonblaming: 100 }, `${s.id}: option 0 throughout scores 100%`);
    const g = E.gateStatus(s, r.steps);
    for (const it of g.items) assert.equal(it.status, 'met', `${s.id}: ${it.id} met on the option-0 path`);
    assert.deepEqual(g.flags, [], `${s.id}: no flags on the option-0 path`);
    // I-2: at every main-line node, option 0 is the max on every axis.
    for (const [nid, n] of Object.entries(s.nodes)) {
      if (n.repair) continue;
      for (const a of AXES) {
        assert.equal(n.choices[0].scores[a], Math.max(...n.choices.map((c) => c.scores[a])), `${s.id}/${nid}#0: max on ${a}`);
      }
    }
  }
});

test('gate status is pure and deterministic', () => {
  const E = engine();
  const d = data();
  for (const sc of d.scenarios) {
    for (const p of E.paths(sc)) {
      const a = E.gateStatus(sc, p.steps, d.flagDefs), b = E.gateStatus(sc, p.steps, d.flagDefs);
      assert.deepEqual(a, b);
      for (const it of a.items) {
        assert.ok(['met', 'met-after-miss', 'missed'].includes(it.status));
        if (it.satisfiedAt !== null) assert.ok(it.satisfiedAt >= 0 && it.satisfiedAt < p.steps.length);
        for (const m of it.missedAt) assert.ok(m >= 0 && m < p.steps.length);
      }
      for (const f of a.flags) assert.ok(['safety', 'consent'].includes(f.kind) && f.at < p.steps.length);
    }
  }
  // The repair route gets credit for the repair while the record keeps the miss (spec §4).
  const s8 = byId(d, 'parent-own-untreated-illness');
  const run = play(E, s8, ['open#0', 'picture#0', 'drinking#0', 'worry#1', 'repair-dismiss#0', 'worry-answer#1', 'roles#0', 'close#0']);
  const st = Object.fromEntries(E.gateStatus(s8, run.steps).items.map((it) => [it.id, it]));
  assert.equal(st['s8-ask-directly'].status, 'met-after-miss');
  assert.deepEqual([st['s8-ask-directly'].missedAt, st['s8-ask-directly'].satisfiedAt], [[3], 4], 'missed at 4, done at 5 (1-based)');
  assert.equal(st['s8-handover'].status, 'met-after-miss');
});

test('a missed required safety action cannot be offset by skill points', () => {
  const E = engine(), R = render(), d = data();
  const s8 = byId(d, 'parent-own-untreated-illness');
  const run = play(E, s8, ['open#0', 'picture#0', 'drinking#0', 'worry#2', 'repair-dismiss#2', 'roles#0', 'close#0']);
  assert.equal(E.gateStatus(s8, run.steps).items.find((it) => it.id === 's8-ask-directly').status, 'missed');
  const out = R.debriefHtml(d, s8, run);
  assert.ok(out.includes(W.W005), 'gate banner (W-005)');
  assert.ok(out.includes(W.W007), 'safety-bar override (W-007)');
  assert.ok(out.includes('Not done on this run.'));
  assert.ok(out.indexOf(W.W005) < out.indexOf('Four skills on this run'), 'the gate renders above the bars');
  // I-4, across every path of every scenario.
  for (const sc of d.scenarios) {
    for (const p of E.paths(sc)) {
      const g = E.gateStatus(sc, p.steps, d.flagDefs);
      const missed = g.items.some((it) => it.status === 'missed');
      const safetyFlag = g.flags.some((f) => f.kind === 'safety');
      const h = R.debriefHtml(d, sc, runOf(sc, p));
      assert.ok(h.includes('Safety steps on this run'), `${sc.id}: the safety section always renders`);
      assert.equal(h.includes(W.W005), missed || safetyFlag, `${sc.id} ${p.steps.map(ref).join(' ')}: banner iff missed or safety flag`);
      assert.equal(h.includes(W.W007), missed, `${sc.id}: safety-bar override iff an item was missed`);
    }
  }
});

test('firearm question is required where no relative volunteers a gun', () => {
  const d = data();
  const keyed = { 'silent-teen-guardian-present': 'trust', 'shared-decision-household': 'safety-home',
    'coparents-discharge-adolescent': 'means-both', 'parent-own-untreated-illness': 'roles' };
  for (const [id, nid] of Object.entries(keyed)) {
    const sc = byId(d, id);
    assert.match(sc.nodes[nid].choices[0].text, /gun in (the|either) house/i, `${id}/${nid}#0 asks about a gun`);
    assert.ok(sc.gate.required.some((g) => /gun/.test(g.label) && g.satisfiedBy.includes(`${nid}#0`)), `${id}: a gun item is satisfied by ${nid}#0`);
  }
  const volunteered = { 'angry-parent-admission': 'means', 'ambivalent-spouse-discharge': 'means',
    'hold-disagreement-admission': 'means', 'siblings-late-onset-psychosis': 'safety-home' };
  for (const [id, nid] of Object.entries(volunteered)) {
    const sc = byId(d, id);
    const item = sc.gate.required.find((g) => g.offeredAt.includes(nid));
    assert.ok(item && item.satisfiedBy.length >= 2, `${id}: the means item at ${nid} has at least two satisfiers`);
    assert.equal(sc.nodes[nid].choices[1].flag, 'lethal-means-dismissed', `${id}/${nid}#1 is flagged`);
  }
});

test('every scenario offers each gate item on every path', () => {
  // I-3 via an independent DFS (not the engine's paths()).
  for (const sc of data().scenarios) {
    for (const g of sc.gate.required) {
      (function walk(at, seenOffered) {
        if (has(sc.endings, at)) { assert.ok(seenOffered, `${sc.id}: a path to ${at} never offers ${g.id}`); return; }
        const offered = seenOffered || g.offeredAt.includes(at);
        for (const c of sc.nodes[at].choices) walk(c.next, offered);
      })(sc.start, false);
    }
  }
});

test('ending text never claims safety work that did not occur', () => {
  // I-END-1, as implemented: an item's claimTerms never appear in an ending's base text, and
  // appear in an addendum only when that addendum's `when` names the item (met: the claim is
  // conditioned on it; notMet: the addendum states its absence). See the PR for why the spec's
  // stricter form could not hold against the spec's own negative addenda.
  for (const sc of data().scenarios) {
    const ids = new Set(sc.gate.required.map((g) => g.id));
    for (const [eid, e] of Object.entries(sc.endings)) {
      for (const g of sc.gate.required) {
        for (const t of g.claimTerms) assert.ok(!e.text.toLowerCase().includes(t), `${sc.id}/${eid}: base text contains "${t}" (${g.id})`);
      }
      (e.addenda || []).forEach((a, k) => {
        const named = [...(a.when.met || []), ...(a.when.notMet || [])];
        assert.ok(named.length > 0, `${sc.id}/${eid} addendum ${k}: names a gate item`);
        for (const id of named) assert.ok(ids.has(id), `${sc.id}/${eid} addendum ${k}: ${id} resolves`);
        for (const g of sc.gate.required) {
          if (named.includes(g.id)) continue;
          for (const t of g.claimTerms) assert.ok(!a.text.toLowerCase().includes(t), `${sc.id}/${eid} addendum ${k}: "${t}" without naming ${g.id}`);
        }
      });
    }
  }
});

test('composed endings are truthful on every path', () => {
  const E = engine();
  for (const sc of data().scenarios) {
    for (const p of E.paths(sc)) {
      const items = Object.fromEntries(E.gateStatus(sc, p.steps).items.map((it) => [it.id, it.status]));
      const e = sc.endings[p.ending];
      const composed = E.composeEnding(sc, p.steps, p.ending);
      assert.equal(composed.title, e.title);
      assert.ok(composed.text.startsWith(e.text), `${sc.id}: composed text starts with the base text`);
      // Independent re-derivation of which addenda apply.
      const expected = [e.text];
      for (const a of e.addenda || []) {
        const ok = (a.when.met || []).every((id) => E.itemMet(items[id])) && (a.when.notMet || []).every((id) => items[id] === 'missed');
        if (ok) {
          expected.push(a.text);
          for (const id of a.when.met || []) assert.ok(E.itemMet(items[id]), `${sc.id}: a rendered claim about ${id} holds`);
        }
      }
      assert.equal(composed.text, expected.join(' '), `${sc.id} ${p.steps.map(ref).join(' ')}`);
      // A claim term in the composed text belongs to a rendered addendum that names its item.
      for (const g of sc.gate.required) {
        if (!g.claimTerms.some((t) => composed.text.toLowerCase().includes(t))) continue;
        const backing = (e.addenda || []).filter((a) => composed.text.includes(a.text) && [...(a.when.met || []), ...(a.when.notMet || [])].includes(g.id));
        assert.ok(backing.length > 0, `${sc.id}/${p.ending}: claim about ${g.id} is not backed by its own addendum`);
        if (!E.itemMet(items[g.id])) assert.ok(backing.every((a) => (a.when.notMet || []).includes(g.id)), `${sc.id}: ${g.id} not met, yet a met-claim rendered`);
      }
    }
  }
});

test('validation and consent choices do not score safety', () => {
  const LIST = [
    ['angry-parent-admission', 'share-limits', 0], ['angry-parent-admission', 'repair-disclosure', 0], ['angry-parent-admission', 'repair-disclosure', 2],
    ['ambivalent-spouse-discharge', 'feelings', 0],
    ['silent-teen-guardian-present', 'story', 0], ['silent-teen-guardian-present', 'repair-why', 0], ['silent-teen-guardian-present', 'privacy', 0],
    ['silent-teen-guardian-present', 'trust', 2], ['silent-teen-guardian-present', 'response', 0],
    ['hold-disagreement-admission', 'what-you-can', 0],
    ['shared-decision-household', 'privacy', 0], ['shared-decision-household', 'meaning', 0],
    ['siblings-late-onset-psychosis', 'workup', 0], ['siblings-late-onset-psychosis', 'split', 0],
    ['coparents-discharge-adolescent', 'riley', 0], ['coparents-discharge-adolescent', 'repair-over-riley', 0],
    ['parent-own-untreated-illness', 'picture', 0], ['parent-own-untreated-illness', 'roles', 2],
    ['parent-own-untreated-illness', 'worry', 2], ['parent-own-untreated-illness', 'repair-dismiss', 2],
  ];
  const d = data();
  for (const [id, nid, i] of LIST) assert.equal(byId(d, id).nodes[nid].choices[i].scores.safety, 0, `${id}/${nid}#${i}: safety 0`);
  for (const sc of d.scenarios) {
    for (const [nid, n] of Object.entries(sc.nodes)) {
      n.choices.forEach((c, i) => {
        if (!c.flag) return;
        if (c.flag === 'disclosure-beyond-consent') {
          assert.deepEqual(AXES.map((a) => c.scores[a]), [0, 0, 0, 0], `${sc.id}/${nid}#${i}: a breach scores zero`);
          assert.equal(sc.nodes[c.next] && sc.nodes[c.next].repair, true, `${sc.id}/${nid}#${i}: a breach routes to repair`);
        }
        if (d.flagDefs[c.flag].kind === 'safety') assert.equal(c.scores.safety, 0, `${sc.id}/${nid}#${i}: safety-flagged choice scores safety 0`);
      });
    }
  }
});

test('breaches have repair paths', () => {
  const d = data();
  const breaches = [];
  for (const sc of d.scenarios) {
    for (const [nid, n] of Object.entries(sc.nodes)) {
      n.choices.forEach((c, i) => {
        if (c.flag !== 'disclosure-beyond-consent') return;
        breaches.push(`${sc.id}/${nid}#${i}`);
        const rep = sc.nodes[c.next];
        assert.equal(rep.repair, true, `${sc.id}/${nid}#${i}: routes to a repair node`);
        // "I said more than" is S1's existing, unchanged keyed repair (W-019 keeps its text).
        assert.ok(rep.choices.some((x) => x.scores.validation === 2 && x.scores.structure === 2 &&
          /I'm sorry|I shouldn't have|I didn't|I said more than/.test(x.text) && /attending/.test(x.text)),
        `${sc.id}/${c.next}: a keyed repair owns the breach and names the attending`);
      });
    }
  }
  assert.deepEqual(breaches.sort(), [
    'angry-parent-admission/share-limits#1', 'hold-disagreement-admission/what-you-can#1',
    'parent-own-untreated-illness/picture#1', 'shared-decision-household/privacy#1',
  ]);
  const E = engine(), R = render();
  const s1 = byId(d, 'angry-parent-admission');
  const run = play(E, s1, ['open#0', 'share-limits#1', 'repair-disclosure#0', 'collateral#0', 'means#0', 'visit#0', 'close#0']);
  const h = R.debriefHtml(d, s1, run);
  assert.ok(h.includes('<div class="consent-notice">On this run more was shared than the patient agreed to (decision 2). ' + W.W006), 'consent notice (W-006)');
  assert.ok(!h.includes(W.W005), 'a consent breach alone is not a missed safety step');
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
  assert.match(html, /<!-- \[CLERKSHIP-META v1\] tool="Family Conversation Simulator"/, 'metadata marker');
  assert.match(html, /<h1>Family Conversation Simulator<\/h1>/, 'the tool titles itself');
  assert.doesNotMatch(html, /name="cw-frame"/, 'content-height frame (no cw-frame=viewport)');
});

test('no hard-coded crisis numbers', () => {
  const crisis = JSON.parse(readFileSync(new URL('../crisis_resources.json', import.meta.url), 'utf8'));
  // Same signatures tests/crisis-block.test.mjs builds (canonicalContactSignatures, digitRunPattern).
  const compact = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const digitRun = (digits) => new RegExp(`(?<!\\d)${digits.split('').join('[^a-z0-9]*')}(?![^a-z0-9]*\\d)`, 'i');
  const source = html.replace(/<!--[\s\S]*?-->/g, '');
  const compactSource = compact(source);
  for (const r of crisis.resources) {
    for (const field of ['contact', 'alsoAvailable']) {
      if (typeof r[field] !== 'string' || !r[field].trim()) continue;
      const sigs = new Set([compact(r[field])]);
      for (const m of r[field].match(/\d(?:[\d\s()+.\-/]*\d)?/g) || []) {
        const digits = m.replace(/\D/g, '');
        if (digits.length >= 3) sigs.add(digits);
      }
      for (const sig of [...sigs].filter((x) => x.length >= 3)) {
        const leak = /^\d+$/.test(sig) ? digitRun(sig).test(source) : compactSource.includes(sig);
        assert.ok(!leak, `${r.id}.${field}: crisis contact "${sig}" appears in the tool`);
      }
    }
  }
  assert.doesNotMatch(html, /\b988\b/);
  assert.doesNotMatch(html, /\b741741\b|1-800-\d/);
  assert.equal(html.split('<!-- crisis-block-html -->').length - 1, 1, 'the marker appears exactly once');
});

test('no doses', () => {
  const block = dataMatch[1];
  const strings = [];
  for (const sc of data().scenarios) {
    for (const n of Object.values(sc.nodes)) {
      n.lines.forEach((l) => strings.push(l.text));
      if (n.cue) strings.push(n.cue);
      n.choices.forEach((c) => strings.push(c.text, c.feedback));
    }
    for (const e of Object.values(sc.endings)) { strings.push(e.text); (e.addenda || []).forEach((a) => strings.push(a.text)); }
    strings.push(...sc.goals, sc.note || '', sc.learnerRole);
  }
  for (const s of [block, ...strings]) {
    assert.doesNotMatch(s, /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i);
    assert.doesNotMatch(s, /\d.{0,12}?\b(?:mg|mcg|milligram|microgram|units?)\b/i, 'no unit within 12 characters after a digit');
    assert.doesNotMatch(s, /\d+\s?(?:tablets?|pills?|capsules?)\b/i);
  }
});

test('professional interpreter is stated, never negotiated; relatives never interpret', () => {
  const d = data();
  const s5 = byId(d, 'shared-decision-household');
  assert.equal(s5.nodes.open.choices[0].text, W.W027);
  for (const sc of d.scenarios) {
    for (const [nid, n] of Object.entries(sc.nodes)) {
      n.choices.forEach((c, i) => assert.doesNotMatch(c.text, /is that (all right|ok(ay)?) with you[^.]*interpreter/i, `${sc.id}/${nid}#${i}`));
    }
  }
  assert.ok(s5.participants.some((p) => /Professional medical interpreter/.test(p.role)));
  const accept = s5.nodes.open.choices[1];
  assert.equal(accept.scores.validation, 0);
  assert.equal(accept.scores.structure, 0);
  assert.equal(s5.nodes[accept.next].repair, true);
});

test('unvalidated-rubric statement and draft labels render', () => {
  const E = engine(), R = render(), d = data();
  const pick = R.pickHtml(d, {});
  assert.ok(pick.includes(W.W009), 'picker sentence (W-009)');
  const cards = pick.split('<button type="button" class="pick"').slice(1);
  assert.equal(cards.length, d.scenarios.length);
  for (const c of cards) assert.match(c, /<\/strong><span class="pill draft">Draft<\/span>/, 'Draft pill after each card title');
  // Every string authored in the scenario data, escaped as the page renders it, so the check below
  // reads only the tool's own framing (the learner may say "pass on anything"; that is not a grade).
  const authored = [];
  (function collect(v) {
    if (typeof v === 'string') authored.push(R.esc(v));
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  })(d);
  authored.sort((a, b) => b.length - a.length);
  for (const sc of d.scenarios) {
    const h = R.debriefHtml(d, sc, optionZero(E, sc));
    assert.ok(h.includes(W.W011), `${sc.id}: unvalidated statement (W-011)`);
    let frame = h;
    for (const s of authored) if (s.length > 3) frame = frame.split(s).join(' ');
    frame = frame.replace(/<[^>]+>/g, ' ').replace(/not a grade/g, ' ');
    assert.doesNotMatch(frame, /\b(pass|fail|failed|grade)\b/i, `${sc.id}: the debrief frames no pass, fail or grade`);
  }
});

test('F1 never links the withheld F7 pages; every noteLink is shipped', () => {
  assert.doesNotMatch(html, /maine_law\.md/);
  assert.doesNotMatch(html, /maine-law-navigator/);
  const shipped = JSON.parse(readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/shipped_pages.json', import.meta.url), 'utf8'));
  const slugs = new Set(shipped.pages.map((p) => p.slug));
  const d = data();
  for (const sc of d.scenarios) if (sc.noteLink) assert.ok(slugs.has(sc.noteLink.page), `${sc.id}: noteLink ${sc.noteLink.page} is shipped`);
  assert.equal(byId(d, 'siblings-late-onset-psychosis').noteLink.page, 'capacity.html');
  for (const id of ['silent-teen-guardian-present', 'hold-disagreement-admission', 'coparents-discharge-adolescent']) {
    assert.equal(byId(d, id).noteLink.page, 'ethics_legal.md');
  }
});

test('no "three scenarios" copy survives', () => {
  // Reads the tool, curriculum.json and common.py. The sign-off ledger's reason line is checked by
  // review, not here: reading the ledger would make this a live-governance-state test.
  const THREE = /\bthree (draft )?(fictional )?scenarios\b/i;
  assert.doesNotMatch(html, THREE);
  const cur = JSON.parse(readFileSync(new URL('../curriculum.json', import.meta.url), 'utf8'));
  const found = [];
  (function walk(v) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'family-meeting-sim.html') found.push(x); walk(x); }
  })(cur);
  assert.ok(found.length >= 2, 'curriculum.json carries the tool blurb and aliases');
  for (const x of found) assert.doesNotMatch(JSON.stringify(x), THREE);
  assert.ok(found.some((x) => x === 'Rehearse eight family conversations, then debrief four conversation skills. Draft, pending faculty review.'));
  const common = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/common.py', import.meta.url), 'utf8');
  const line = common.split('\n').find((l) => l.includes('"family-meeting-sim.html":'));
  assert.ok(line && /struggling parent/.test(line) && /firearm/.test(line));
  assert.doesNotMatch(line, THREE);
});

test('per-scenario wording pins', () => {
  const d = data();
  const c = (id, nid, i) => byId(d, id).nodes[nid].choices[i];
  // S1
  assert.ok(c('angry-parent-admission', 'share-limits', 0).text.startsWith('Alex is on the unit, and staff are checking on him closely.'));
  assert.equal(c('angry-parent-admission', 'share-limits', 1).flag, 'disclosure-beyond-consent');
  // S2
  assert.equal(byId(d, 'ambivalent-spouse-discharge').endings['end-shared'].text, 'Robin and Casey leave with a summary they can repeat and a clear sense of who decides what.');
  // S3
  assert.ok(c('silent-teen-guardian-present', 'close', 0).text.includes(W.W026));
  assert.ok(c('silent-teen-guardian-present', 'privacy', 0).feedback.endsWith('The team will also see Sam alone, to ask about safety at home.'));
  assert.ok(c('silent-teen-guardian-present', 'repair-why', 0).text.includes('what you say there stays with the team unless I\'m worried about your safety, and I\'d tell you first?'));
  // S4
  assert.ok(c('hold-disagreement-admission', 'rights', 0).text.includes('I\'ll ask the attending to tell you where things stand tonight if she can.'));
  assert.ok(c('hold-disagreement-admission', 'close', 0).text.includes('I\'ll ask the attending to see you tonight if she can, I\'ll make sure you get the written information'));
  assert.equal(c('hold-disagreement-admission', 'what-you-can', 1).next, 'repair-disclosure');
  // S5
  assert.equal(c('shared-decision-household', 'privacy', 1).next, 'repair-disclosure');
  // S6
  assert.ok(c('siblings-late-onset-psychosis', 'close', 0).text.includes('a plan for the handgun that the team will go through with you and with her'));
  assert.ok(c('siblings-late-onset-psychosis', 'close', 0).text.includes('and the plan with her, too. Did I get it right?'));
  assert.equal(byId(d, 'siblings-late-onset-psychosis').note, 'This scenario rehearses communication. Whether a relative can decide anything for a patient depends on a capacity determination and on law — ask your attending.');
  // S7
  assert.ok(c('coparents-discharge-adolescent', 'open', 0).text.includes('the night their kid was in danger'));
  assert.ok(!/nearly died/.test(c('coparents-discharge-adolescent', 'open', 0).text));
  assert.ok(c('coparents-discharge-adolescent', 'means-both', 0).text.includes('there\'s nothing — like a court order — that changes who we share what with'));
  assert.ok(c('coparents-discharge-adolescent', 'riley', 0).text.includes('one of the most important things anyone\'s said today'));
  assert.ok(c('coparents-discharge-adolescent', 'channel', 2).feedback.startsWith('Sometimes a professional in the middle is exactly right'));
  assert.ok(c('coparents-discharge-adolescent', 'close', 0).text.includes('and some time for you with the team on your own before you go.'));
  // S8 — the P0 rewrite.
  const s8 = byId(d, 'parent-own-untreated-illness');
  assert.ok(has(s8.nodes, 'worry-answer') && !s8.nodes['worry-answer'].repair, 'worry-answer is on the main line');
  assert.equal(s8.nodes.worry.choices[0].next, 'worry-answer');
  assert.equal(s8.nodes['repair-dismiss'].choices[0].next, 'worry-answer');
  assert.equal(s8.nodes.worry.choices[2].next, 'repair-dismiss');
  assert.ok(s8.nodes['worry-answer'].choices.every((x) => x.next === 'roles'));
  assert.ok(s8.nodes['worry-answer'].choices[0].text.includes('I\'d like my attending to talk with you now, before we go on'));
  assert.equal(s8.nodes['worry-answer'].choices[1].flag, 'risk-judged-by-student');
  assert.equal(s8.nodes['worry-answer'].choices[2].flag, 'risk-judged-by-student');
  assert.equal(s8.nodes['repair-dismiss'].choices[1].flag, 'suicide-statement-not-asked');
  assert.equal(s8.nodes['repair-dismiss'].choices[2].flag, 'suicide-statement-not-asked');
  assert.ok(s8.nodes.close.choices[1].text.startsWith('Joanne, let\'s stop Kai\'s plan here'));
  assert.ok(s8.nodes.close.choices[0].text.includes('my attending is going to talk with you today about what you said earlier'));
  assert.match(s8.nodes.roles.choices[0].text, /is there a gun in the house/);
  assert.ok(s8.nodes.drinking.choices[0].feedback.includes('If she seems intoxicated now, tell your attending before the meeting goes on'));
  assert.ok(s8.nodes.picture.choices[0].text.includes('he\'s been improving, the plan we\'re working toward is for him to come home'));
  assert.ok(s8.note.includes('tell your supervising attending immediately, and do not leave the person alone'));
  // No student-side risk formulation on the keyed path: the student never asks plan/method/means.
  assert.doesNotMatch(s8.nodes['worry-answer'].choices[0].text, /plan\?|how would you|anything at home/i);
});

test('lethal-means wording pins', () => {
  const d = data();
  const c = (id, nid, i) => byId(d, id).nodes[nid].choices[i];
  assert.ok(c('silent-teen-guardian-present', 'trust', 0).text.includes(W.W024));
  assert.ok(c('shared-decision-household', 'safety-home', 0).text.includes(W.W029));
  assert.ok(c('coparents-discharge-adolescent', 'means-both', 0).text.includes(W.W032));
  assert.ok(c('siblings-late-onset-psychosis', 'safety-home', 0).text.endsWith(W.W030));
  assert.equal(c('hold-disagreement-admission', 'means', 0).text, W.W022);
  for (const [id, nid] of [['silent-teen-guardian-present', 'trust'], ['shared-decision-household', 'safety-home'],
    ['coparents-discharge-adolescent', 'means-both'], ['parent-own-untreated-illness', 'roles']]) {
    assert.ok(c(id, nid, 0).feedback.includes(W.FIREARM), `${id}/${nid}#0 feedback`);
  }
});

test('run record is on-screen only', () => {
  const E = engine(), R = render(), d = data();
  const sc = byId(d, 'parent-own-untreated-illness');
  const run = optionZero(E, sc);
  const h = R.debriefHtml(d, sc, run);
  assert.ok(h.includes('<summary>Run record (for your own notes)</summary>'));
  assert.ok(h.includes(W.W008));
  const rec = E.runRecord(d, sc, run);
  assert.ok(rec.startsWith(`tool ${E.TOOL_VERSION} · rubric ${d.rubricVersion} · scenario ${sc.id} · path open#0 picture#0`));
  assert.match(rec, /gate s8-ask-directly=met@4 s8-handover=met@5 s8-means-asked=met@6 · flags none$/);
  assert.match(html, new RegExp(`version="${E.TOOL_VERSION.replace('.', '\\.')}"`), 'CLERKSHIP-META version matches the engine');
  assert.doesNotMatch(html, /navigator\.clipboard|download=|Blob\(|\bfetch\(/);
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
