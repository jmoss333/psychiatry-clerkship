// Display-only regression tests for the F1–F5 faculty decisions (approved 2026-09-04, recorded in
// docs/superpowers/plans/2026-09-04-interview-room-faculty-adjudication.md) and the D16(2) follow-up
// (docs/superpowers/plans/2026-08-31-faculty-decisions-410.md). These exercise the ACTUAL client
// script extracted from sp-interview.html — the same VM-extraction approach used by
// sp-proxy/benchmarks/interview-room/run.mjs's loadClient — so nothing here reimplements the
// matcher, the scoring rules, or the display helpers. The full benchmark corpus and harness behind
// that run.mjs are not ported by this change; the handful of scripted turns below reproduce just
// the scenarios these tests need, adapted to the pack's current vocabulary (si_behavior, added by
// the D12–D16 wave after the corpus these scenarios were drawn from was written).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { _internals } from '../netlify/functions/sp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PACK_PATH = path.join(ROOT, '_prototypes/sp-interview/sp-interview.pack.json');
const CLIENT_PATH = path.join(ROOT, '_prototypes/sp-interview/sp-interview.html');

function loadClient(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const source = scripts.find(match => match[1].includes('var e=React.createElement'))?.[1];
  assert.ok(source, 'Interview Room application script missing');
  const window = {};
  const storage = { getItem: () => null, setItem() { throw new Error('Unexpected test storage write'); }, removeItem() {} };
  const context = vm.createContext({
    window,
    document: {
      getElementById: () => ({ textContent: '', addEventListener() {}, removeEventListener() {} }),
      documentElement: { getAttribute: () => null, setAttribute() {} },
      createElement: () => ({ click() {} }),
    },
    React: { createElement: () => null, useState: v => [v, () => {}], useEffect() {}, useRef: v => ({ current: v }) },
    ReactDOM: { createRoot: () => ({ render() {} }) },
    localStorage: storage, sessionStorage: storage, fetch: () => { throw new Error('Test network access is forbidden'); },
  });
  vm.runInContext(source, context, { filename: CLIENT_PATH, timeout: 5000 });
  for (const key of ['MockProvider', 'ProxyProvider', 'computeCoverage', 'computeRubric', 'buildNarrative']) {
    assert.equal(typeof window.__SP_TEST__?.[key], 'function', `Missing actual client hook ${key}`);
  }
  return window.__SP_TEST__;
}

const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));
const hooks = loadClient(fs.readFileSync(CLIENT_PATH, 'utf8'));

const WARM_SETUP = [
  "Hi, my name is Alex, I'm the medical student on the team. Before we start, what would you most want us to understand today?",
  "Tell me more about what's been going on, in your own words.",
  "It sounds like this has been really hard.",
];

async function encounter(name, turns, warm = true) {
  const provider = new hooks.MockProvider();
  const state = provider.start(pack.cases.find(cd => cd.persona.displayName === name), { difficulty: 'supported' });
  for (const turn of [...(warm ? WARM_SETUP : []), ...turns]) await provider.respond(state, turn);
  return state;
}

test('recognized question and statement display recognition without changing coverage', async () => {
  assert.equal(typeof hooks.coverageDisplay, 'function', 'Approved display helper is missing');
  for (const name of ['Dana', 'Marcus', 'Ray']) {
    for (const question of ['Have you had thoughts of killing yourself?', 'You have had thoughts of killing yourself.']) {
      const state = await encounter(name, [question]);
      const before = JSON.stringify(state);
      const coverage = hooks.computeCoverage(state);
      const row = coverage.find(c => c.id === 'c_si');
      assert.equal(row.status, 'observed');
      assert.deepEqual(JSON.parse(JSON.stringify(hooks.coverageDisplay(row))), {
        label: 'Suicide screening', word: 'Screening language recognized',
      });
      assert.equal(JSON.stringify(state), before);
    }
  }
});

test('bundled and separate follow-up keep their grades but do not claim answers obtained', async () => {
  assert.equal(typeof hooks.coverageDisplay, 'function', 'Approved display helper is missing');
  // Every follow-up topic (plan, means, protective, and — since the D12–D16 wave — past
  // behavior/preparations) must be covered for c_si_followup to read "observed", whether the
  // learner bundles them into one reply or asks them one at a time.
  const scenarios = {
    'compound-one-reply': ['Have you had thoughts of killing yourself?',
      'Do you have a plan, do you have access to the pills, have you ever tried anything like this before, and what keeps you going?'],
    'sequential-followup': ['Have you had thoughts of killing yourself?', 'Do you have a plan?',
      'Do you have access to the pills?', 'Have you ever tried to hurt yourself before?', 'What keeps you going?'],
  };
  for (const [id, turns] of Object.entries(scenarios)) {
    const state = await encounter('Dana', turns);
    const row = hooks.computeCoverage(state).find(c => c.id === 'c_si_followup');
    assert.equal(row.status, 'observed', `${id}: c_si_followup`);
    const display = hooks.coverageDisplay(row);
    assert.equal(display.label, 'Suicide follow-up');
    assert.equal(display.word, 'Follow-up language recognized');
    assert.ok(!/answered|complete|safe/i.test(display.word));
  }
});

test('unrecognized phrasing and indirect phrasing do not become claims that no question occurred', async () => {
  assert.equal(typeof hooks.criticalFeedback, 'function', 'Approved critical feedback helper is missing');
  const scenarios = {
    'unfamiliar-plain-question': { turns: ['Have you been considering deliberately bringing your own life to an end?'], status: 'missed' },
    euphemism: { turns: ['Have you thought about hurting yourself?'], status: 'partial' },
  };
  for (const [id, scenario] of Object.entries(scenarios)) {
    const state = await encounter('Dana', scenario.turns);
    const cov = hooks.computeCoverage(state);
    const row = cov.find(c => c.id === 'c_si');
    assert.equal(row.status, scenario.status, id);
    const critical = hooks.criticalFeedback(row);
    assert.match(critical.heading, /language.*recognized/i);
    assert.match(critical.body, /does not establish whether/);
    const narrative = hooks.buildNarrative(state, cov, hooks.computeRubric(state, cov));
    assert.ok(narrative.growth.every(item => !/never came up|never asked|instead of answering|tested you/i.test(item.t)));
  }
});

test('critical command feedback names the right topic and preserves unavailable follow-up', async () => {
  assert.equal(typeof hooks.criticalFeedback, 'function', 'Approved critical feedback helper is missing');
  const ray = await encounter('Ray', [], false);
  const critical = hooks.computeCoverage(ray).find(c => c.critical);
  assert.equal(critical.id, 'c_command');
  const notice = hooks.criticalFeedback(critical);
  assert.match(notice.heading, /Command content/);
  assert.doesNotMatch(notice.heading + notice.opener + notice.body, /suicide|killing yourself/i);
  const dana = await encounter('Dana', [], false);
  const row = hooks.computeCoverage(dana).find(c => c.id === 'c_si_followup');
  assert.equal(row.status, 'na');
  assert.equal(hooks.coverageDisplay(row).word, 'Follow-up not available under current rules');
});

test('live reflection rating agrees with the recognized turns and narrative', () => {
  const provider = new hooks.ProxyProvider('https://synthetic.example.test/api/sp', 'synthetic-test-key', {
    rapportMin: pack.engine.rapportMin, rapportMax: pack.engine.rapportMax,
  });
  const state = provider.start(pack.cases[0], { difficulty: 'supported' });
  for (const text of ['It sounds like this has been hard.', 'That sounds exhausting.']) {
    provider._applyState(state, { reply: 'That captures what I meant.', ticket: null,
      state: { intents: ['reflection'], flags: [], rapport: 2, unlocked: [] } }, text);
  }
  assert.equal(state.reflections, 2, 'Each accepted reflection turn counts once');
  const before = JSON.stringify(state);
  const cov = hooks.computeCoverage(state);
  assert.equal(hooks.computeRubric(state, cov).alliance, 'observed');
  const narrative = hooks.buildNarrative(state, cov, hooks.computeRubric(state, cov));
  assert.ok(narrative.strengths.some(line => line.includes('more than one reflection')));
  assert.ok(narrative.growth.every(item => !item.t.includes('fewer than two reflections')));
  assert.equal(JSON.stringify(state), before);
});

test('live ratings agree with offline and server reflection counts across representative scenarios', async () => {
  // Representative multi-turn scripts across all three personas (drawn from the same conversations
  // parity.test.mjs already pins) — not the full benchmark corpus, which this change does not port.
  const scenarios = [
    { name: 'Dana', turns: ["Tell me more about what's been going on, in your own words.", "It sounds like everything has felt really heavy for a while.", "When you say burden — have you had thoughts of killing yourself?", "Do you have a plan?", "Are the pills still at home — do you have access to them?", "What has kept you going?"] },
    { name: 'Marcus', turns: ["Tell me what's been going on, in your own words.", "It sounds like everything sped up fast — and that must be really intense.", "Do your thoughts feel like they're racing?", "What have you been spending money on lately?"] },
    { name: 'Ray', turns: ["We can stop whenever you want. What has this been like for you, these last few weeks?", "That sounds really frightening — living like that.", "Have you been hearing anything — like sounds or voices — that other people don't seem to?", "When the voice talks, does it ever tell you to do anything?"] },
  ];
  for (const scenario of scenarios) {
    const cd = pack.cases.find(c => c.persona.displayName === scenario.name);
    const live = new hooks.ProxyProvider('', '', { rapportMin: -3, rapportMax: 4 });
    const offline = new hooks.MockProvider();
    const ls = live.start(cd, { difficulty: 'supported' });
    const os = offline.start(cd, { difficulty: 'supported' });
    const history = [];
    for (const text of scenario.turns) {
      history.push(text);
      const result = await offline.respond(os, text);
      const server = _internals.deriveState(cd, history);
      live._applyState(ls, { reply: result.reply, ticket: null, state: {
        intents: server.lastIntents, flags: server.lastFlags, rapport: server.rapport,
        unlocked: Object.keys(server.unlocked),
      } }, text);
      assert.equal(ls.reflections, server.reflections, `${scenario.name}: live/server reflections`);
      assert.equal(ls.reflections, os.reflections, `${scenario.name}: live/offline reflections`);
      assert.equal(JSON.stringify(hooks.computeRubric(ls)), JSON.stringify(hooks.computeRubric(os)), `${scenario.name}: ratings`);
    }
  }
});

test('evidence pairs exact matching learner words with the actual patient reply, including refusal', async () => {
  assert.equal(typeof hooks.coverageEvidence, 'function', 'Evidence lookup is missing');
  const s = await encounter('Dana', ['Have you had thoughts of killing yourself?']);
  s.turns[s.turns.length - 1].pt = 'I do not want to answer that.';
  const before = JSON.stringify(s);
  const evidence = hooks.coverageEvidence(s, 'c_si');
  assert.equal(evidence.turns.length, 1);
  assert.equal(evidence.turns[0].number, 4);
  assert.equal(evidence.turns[0].learner, 'Have you had thoughts of killing yourself?');
  assert.equal(evidence.turns[0].patient, 'I do not want to answer that.');
  assert.deepEqual(Array.from(evidence.recognized), ['si_direct']);
  assert.equal(JSON.stringify(s), before, 'Evidence lookup cannot change encounter state');
});

test('missing and partial evidence never cite unrelated turns as proof', async () => {
  assert.equal(typeof hooks.coverageEvidence, 'function', 'Evidence lookup is missing');
  const missing = await encounter('Dana', ['Have you been considering deliberately bringing your own life to an end?']);
  const absent = hooks.coverageEvidence(missing, 'c_si');
  assert.equal(absent.turns.length, 0);
  assert.deepEqual(Array.from(absent.unrecognized), ['si_direct']);
  const indirect = await encounter('Dana', ['Have you thought about hurting yourself?']);
  const partial = hooks.coverageEvidence(indirect, 'c_si');
  assert.equal(partial.turns.length, 1);
  assert.deepEqual(Array.from(partial.recognized), ['si_euphemism']);
  assert.deepEqual(Array.from(partial.unrecognized), ['si_direct']);
  const unavailable = hooks.coverageEvidence(missing, 'c_si_followup');
  assert.equal(unavailable.unavailable, true);
});

test('narrative references follow the selected observations, not the first transcript turns', async () => {
  const s = await encounter('Dana', ['Have you had thoughts of killing yourself?']);
  const cov = hooks.computeCoverage(s);
  const nar = hooks.buildNarrative(s, cov, hooks.computeRubric(s));
  assert.ok(Array.isArray(nar.strengthIntents), 'Narrative evidence references are missing');
  const i = nar.strengths.findIndex(line => line.includes('Screening language recognized'));
  assert.deepEqual(Array.from(nar.strengthIntents[i]), ['si_direct']);
  const closing = nar.growth.find(item => item.t.includes('summary'));
  if (closing) assert.deepEqual(Array.from(closing.intents), ['summary_close']);
});

test('rating evidence includes both reflection turns and the later turn that lowers rapport', async () => {
  assert.equal(typeof hooks.rubricEvidence, 'function', 'Rating evidence is missing');
  const s = await encounter('Dana', ['It sounds like this is exhausting.', 'That sounds hard.', 'You should just snap out of it.'], false);
  const before = JSON.stringify(s);
  const evidence = hooks.rubricEvidence(s, 'alliance');
  assert.deepEqual(Array.from(evidence.turns, t => t.number), [1, 2, 3]);
  assert.match(evidence.note, /reflection turns \(2\)/);
  assert.match(evidence.note, /rapport value \(0\)/);
  assert.equal(JSON.stringify(s), before);
});

test('data and organization explanations select their own evidence instead of safety turns', async () => {
  assert.equal(typeof hooks.rubricEvidence, 'function', 'Rating evidence is missing');
  const s = await encounter('Dana', ['How has your sleep been?', 'Have you had thoughts of killing yourself?', 'To summarize what I heard.'], false);
  assert.deepEqual(Array.from(hooks.rubricEvidence(s, 'data').turns, t => t.number), [1]);
  assert.deepEqual(Array.from(hooks.rubricEvidence(s, 'organization').turns, t => t.number), [3]);
});

// D16(2)b — "I did ask — show me": the self-report affordance is client-only React state that is
// never exposed on window.__SP_TEST__, so this exercises the actual coverageDisplay override the
// JSX applies (Object.assign({}, row, {status:'self-reported'})) rather than reimplementing it.
test('a self-reported row never renders Observed and leaves engine state untouched (D16(2)b)', async () => {
  const s = await encounter('Dana', ['How has your sleep been?']);
  const cov = hooks.computeCoverage(s);
  const row = cov.find(c => c.id === 'c_si');
  assert.equal(row.status, 'missed', 'Precondition: the real engine did not recognize a screen');
  const before = JSON.stringify(s);
  const rapportBefore = s.rapport;
  const overridden = Object.assign({}, row, { status: 'self-reported' });
  const display = hooks.coverageDisplay(overridden);
  assert.equal(display.word, 'Self-reported · not recognized');
  assert.notEqual(display.word, hooks.coverageDisplay(Object.assign({}, row, { status: 'observed' })).word);
  assert.doesNotMatch(display.word, /^Language recognized$/);
  assert.doesNotMatch(display.word, /Follow-up language recognized/);
  // Self-reporting is a display override on a cloned row — it must not mutate the session,
  // the real coverage row, or any engine field a self-report could otherwise be mistaken for.
  assert.equal(JSON.stringify(s), before, 'Self-reporting must not mutate session state');
  assert.equal(row.status, 'missed', 'The underlying engine status is untouched by a display override');
  assert.equal(s.covered.si_direct, undefined, 'Self-reporting must not mark the intent covered');
  assert.equal(s.unlocked.si_active, undefined, 'Self-reporting must not unlock any gate');
  assert.equal(s.rapport, rapportBefore, 'Self-reporting must not change rapport');
});
