import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBenchmark } from '../benchmarks/interview-room/run.mjs';
import { _internals } from '../netlify/functions/sp.mjs';

const runtime = await loadBenchmark();
async function encounter(name, turns, warm = true) {
  const provider = new runtime.hooks.MockProvider();
  const state = provider.start(runtime.pack.cases.find(cd => cd.persona.displayName === name), { difficulty: 'supported' });
  for (const turn of [...(warm ? runtime.corpus.setups.warm : []), ...turns]) await provider.respond(state, turn);
  return state;
}

test('recognized question and statement display recognition without changing coverage', async () => {
  assert.equal(typeof runtime.hooks.coverageDisplay, 'function', 'Approved display helper is missing');
  for (const name of ['Dana', 'Marcus', 'Ray']) {
    for (const question of ['Have you had thoughts of killing yourself?', 'You have had thoughts of killing yourself.']) {
      const state = await encounter(name, [question]);
      const before = JSON.stringify(state);
      const coverage = runtime.hooks.computeCoverage(state);
      const row = coverage.find(c => c.id === 'c_si');
      assert.equal(row.status, 'observed');
      assert.deepEqual(JSON.parse(JSON.stringify(runtime.hooks.coverageDisplay(row))), {
        label: 'Suicide screening', word: 'Screening language recognized',
      });
      assert.equal(JSON.stringify(state), before);
    }
  }
});

test('bundled and separate follow-up keep their grades but do not claim answers obtained', async () => {
  assert.equal(typeof runtime.hooks.coverageDisplay, 'function', 'Approved display helper is missing');
  for (const id of ['compound-one-reply', 'sequential-followup']) {
    const state = await encounter('Dana', runtime.corpus.scenarios.find(s => s.id === id).turns);
    const row = runtime.hooks.computeCoverage(state).find(c => c.id === 'c_si_followup');
    assert.equal(row.status, 'observed');
    const display = runtime.hooks.coverageDisplay(row);
    assert.equal(display.label, 'Suicide follow-up');
    assert.equal(display.word, 'Follow-up language recognized');
    assert.ok(!/answered|complete|safe/i.test(display.word));
  }
});

test('unrecognized phrasing and indirect phrasing do not become claims that no question occurred', async () => {
  assert.equal(typeof runtime.hooks.criticalFeedback, 'function', 'Approved critical feedback helper is missing');
  for (const [id, status] of [['unfamiliar-plain-question', 'missed'], ['euphemism', 'partial']]) {
    const scenario = runtime.corpus.scenarios.find(s => s.id === id);
    const state = await encounter('Dana', scenario.turns);
    const cov = runtime.hooks.computeCoverage(state);
    const row = cov.find(c => c.id === 'c_si');
    assert.equal(row.status, status);
    const critical = runtime.hooks.criticalFeedback(row);
    assert.match(critical.heading, /language.*recognized/i);
    assert.match(critical.body, /does not establish whether/);
    const narrative = runtime.hooks.buildNarrative(state, cov, runtime.hooks.computeRubric(state, cov));
    assert.ok(narrative.growth.every(item => !/never came up|never asked|instead of answering|tested you/i.test(item.t)));
  }
});

test('critical command feedback names the right topic and preserves unavailable follow-up', async () => {
  assert.equal(typeof runtime.hooks.criticalFeedback, 'function', 'Approved critical feedback helper is missing');
  const ray = await encounter('Ray', [], false);
  const critical = runtime.hooks.computeCoverage(ray).find(c => c.critical);
  assert.equal(critical.id, 'c_command');
  const notice = runtime.hooks.criticalFeedback(critical);
  assert.match(notice.heading, /Command content/);
  assert.doesNotMatch(notice.heading + notice.body, /suicide|killing yourself/i);
  const dana = await encounter('Dana', [], false);
  const row = runtime.hooks.computeCoverage(dana).find(c => c.id === 'c_si_followup');
  assert.equal(row.status, 'na');
  assert.equal(runtime.hooks.coverageDisplay(row).word, 'Follow-up not available under current rules');
});

test('live reflection rating agrees with the recognized turns and narrative', () => {
  const provider = new runtime.hooks.ProxyProvider('https://synthetic.example.test/api/sp', 'synthetic-test-key', {
    rapportMin: runtime.pack.engine.rapportMin, rapportMax: runtime.pack.engine.rapportMax,
  });
  const state = provider.start(runtime.pack.cases[0], { difficulty: 'supported' });
  for (const text of ['It sounds like this has been hard.', 'That sounds exhausting.']) {
    provider._applyState(state, { reply: 'That captures what I meant.', ticket: null,
      state: { intents: ['reflection'], flags: [], rapport: 2, unlocked: [] } }, text);
  }
  assert.equal(state.reflections, 2, 'Each accepted reflection turn counts once');
  const before = JSON.stringify(state);
  const cov = runtime.hooks.computeCoverage(state);
  assert.equal(runtime.hooks.computeRubric(state, cov).alliance, 'observed');
  const narrative = runtime.hooks.buildNarrative(state, cov, runtime.hooks.computeRubric(state, cov));
  assert.ok(narrative.strengths.some(line => line.includes('more than one reflection')));
  assert.ok(narrative.growth.every(item => !item.t.includes('fewer than two reflections')));
  assert.equal(JSON.stringify(state), before);
});

test('live ratings agree with offline and server reflection counts after every benchmark turn', async () => {
  for (const scenario of runtime.corpus.scenarios) {
    for (const name of scenario.cases) {
      const cd = runtime.pack.cases.find(c => c.persona.displayName === name);
      const live = new runtime.hooks.ProxyProvider('', '', { rapportMin: -3, rapportMax: 4 });
      const offline = new runtime.hooks.MockProvider();
      const ls = live.start(cd, { difficulty: 'supported' });
      const os = offline.start(cd, { difficulty: 'supported' });
      const history = [];
      for (const text of [...runtime.corpus.setups[scenario.setup], ...scenario.turns]) {
        history.push(text);
        const result = await offline.respond(os, text);
        const server = _internals.deriveState(cd, history);
        live._applyState(ls, { reply: result.reply, ticket: null, state: {
          intents: server.lastIntents, flags: server.lastFlags, rapport: server.rapport,
          unlocked: Object.keys(server.unlocked),
        } }, text);
        assert.equal(ls.reflections, server.reflections, `${scenario.id}/${name}: live/server reflections`);
        assert.equal(ls.reflections, os.reflections, `${scenario.id}/${name}: live/offline reflections`);
        assert.equal(JSON.stringify(runtime.hooks.computeRubric(ls)), JSON.stringify(runtime.hooks.computeRubric(os)), `${scenario.id}/${name}: ratings`);
      }
    }
  }
});

test('evidence pairs exact matching learner words with the actual patient reply, including refusal', async () => {
  assert.equal(typeof runtime.hooks.coverageEvidence, 'function', 'Evidence lookup is missing');
  const s = await encounter('Dana', ['Have you had thoughts of killing yourself?']);
  s.turns[s.turns.length - 1].pt = 'I do not want to answer that.';
  const before = JSON.stringify(s);
  const evidence = runtime.hooks.coverageEvidence(s, 'c_si');
  assert.equal(evidence.turns.length, 1);
  assert.equal(evidence.turns[0].number, 4);
  assert.equal(evidence.turns[0].learner, 'Have you had thoughts of killing yourself?');
  assert.equal(evidence.turns[0].patient, 'I do not want to answer that.');
  assert.deepEqual(Array.from(evidence.recognized), ['si_direct']);
  assert.equal(JSON.stringify(s), before, 'Evidence lookup cannot change encounter state');
});

test('missing and partial evidence never cite unrelated turns as proof', async () => {
  assert.equal(typeof runtime.hooks.coverageEvidence, 'function', 'Evidence lookup is missing');
  const missing = await encounter('Dana', ['Have you been considering deliberately bringing your own life to an end?']);
  const absent = runtime.hooks.coverageEvidence(missing, 'c_si');
  assert.equal(absent.turns.length, 0);
  assert.deepEqual(Array.from(absent.unrecognized), ['si_direct']);
  const indirect = await encounter('Dana', ['Have you thought about hurting yourself?']);
  const partial = runtime.hooks.coverageEvidence(indirect, 'c_si');
  assert.equal(partial.turns.length, 1);
  assert.deepEqual(Array.from(partial.recognized), ['si_euphemism']);
  assert.deepEqual(Array.from(partial.unrecognized), ['si_direct']);
  const unavailable = runtime.hooks.coverageEvidence(missing, 'c_si_followup');
  assert.equal(unavailable.unavailable, true);
});

test('narrative references follow the selected observations, not the first transcript turns', async () => {
  const s = await encounter('Dana', ['Have you had thoughts of killing yourself?']);
  const cov = runtime.hooks.computeCoverage(s);
  const nar = runtime.hooks.buildNarrative(s, cov, runtime.hooks.computeRubric(s));
  assert.ok(Array.isArray(nar.strengthIntents), 'Narrative evidence references are missing');
  const i = nar.strengths.findIndex(line => line.includes('Screening language recognized'));
  assert.deepEqual(Array.from(nar.strengthIntents[i]), ['si_direct']);
  const closing = nar.growth.find(item => item.t.includes('summary'));
  if (closing) assert.deepEqual(Array.from(closing.intents), ['summary_close']);
});

test('rating evidence includes both reflection turns and the later turn that lowers rapport', async () => {
  assert.equal(typeof runtime.hooks.rubricEvidence, 'function', 'Rating evidence is missing');
  const s = await encounter('Dana', ['It sounds like this is exhausting.', 'That sounds hard.', 'You should just snap out of it.'], false);
  const before = JSON.stringify(s);
  const evidence = runtime.hooks.rubricEvidence(s, 'alliance');
  assert.deepEqual(Array.from(evidence.turns, t => t.number), [1, 2, 3]);
  assert.match(evidence.note, /reflection turns \(2\)/);
  assert.match(evidence.note, /rapport value \(0\)/);
  assert.equal(JSON.stringify(s), before);
});

test('data and organization explanations select their own evidence instead of safety turns', async () => {
  assert.equal(typeof runtime.hooks.rubricEvidence, 'function', 'Rating evidence is missing');
  const s = await encounter('Dana', ['How has your sleep been?', 'Have you had thoughts of killing yourself?', 'To summarize what I heard.'], false);
  assert.deepEqual(Array.from(runtime.hooks.rubricEvidence(s, 'data').turns, t => t.number), [1]);
  assert.deepEqual(Array.from(runtime.hooks.rubricEvidence(s, 'organization').turns, t => t.number), [3]);
});
