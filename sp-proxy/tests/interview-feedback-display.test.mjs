import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBenchmark } from '../benchmarks/interview-room/run.mjs';

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

test('live fallback counts recognized reflection turns without changing the scoring counter', () => {
  const provider = new runtime.hooks.ProxyProvider('https://synthetic.example.test/api/sp', 'synthetic-test-key', {
    rapportMin: runtime.pack.engine.rapportMin, rapportMax: runtime.pack.engine.rapportMax,
  });
  const state = provider.start(runtime.pack.cases[0], { difficulty: 'supported' });
  for (const text of ['It sounds like this has been hard.', 'That sounds exhausting.']) {
    provider._applyState(state, { reply: 'That captures what I meant.', ticket: null,
      state: { intents: ['reflection'], flags: [], rapport: 2, unlocked: [] } }, text);
  }
  assert.equal(state.reflections, 0, 'The existing live scoring counter stays untouched');
  const before = JSON.stringify(state);
  const cov = runtime.hooks.computeCoverage(state);
  const narrative = runtime.hooks.buildNarrative(state, cov, runtime.hooks.computeRubric(state, cov));
  assert.ok(narrative.strengths.some(line => line.includes('more than one reflection')));
  assert.ok(narrative.growth.every(item => !item.t.includes('fewer than two reflections')));
  assert.equal(JSON.stringify(state), before);
});
