import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBenchmark } from '../benchmarks/interview-room/run.mjs';

const runtime = await loadBenchmark();
const T = runtime.hooks;
const plain = value => JSON.parse(JSON.stringify(value));
async function original(name = 'Dana') {
  const provider = new T.MockProvider();
  const caseDef = runtime.pack.cases.find(c => c.persona.displayName === name);
  const session = provider.start(caseDef, { difficulty: 'realistic' });
  const msgs = [{ who: 'pt', text: caseDef.persona.opening, offline: true }];
  const words = [...runtime.corpus.setups.warm, 'Have you had thoughts of killing yourself?', 'Do you have a plan?', 'Do you have access to the pills?'];
  for (const text of words) {
    const { reply } = await provider.respond(session, text);
    msgs.push({ who: 'me', text }, { who: 'pt', text: reply, offline: true });
  }
  return { provider, session, msgs };
}
function requireRetry() {
  assert.equal(typeof T.createRetryMoment, 'function', 'Offline retry prototype is missing');
  assert.equal(typeof T.retryMomentRespond, 'function');
}

test('retry rebuilds only the past and preserves the original encounter', async () => {
  requireRetry();
  const encounter = await original();
  const before = JSON.stringify(encounter);
  const retry = await T.createRetryMoment(encounter, 3);
  assert.equal(retry.session.turns.length, 3);
  assert.equal(retry.session.covered.si_direct, undefined, 'Future screening must not leak into the retry');
  assert.equal(retry.session.unlocked.si_active, undefined, 'Future disclosures must not leak into the retry');
  assert.equal(retry.session.opts.difficulty, 'realistic');
  assert.notEqual(retry.session, encounter.session);
  assert.notEqual(retry.session.covered, encounter.session.covered);
  await T.retryMomentRespond(retry, 'Have you thought about hurting yourself?');
  assert.equal(retry.session.covered.si_euphemism, true);
  assert.equal(retry.session.covered.si_direct, undefined);
  assert.equal(JSON.stringify(encounter), before);
});

test('same line from the same point reproduces the original offline reply for every persona', async () => {
  requireRetry();
  for (const name of ['Dana', 'Marcus', 'Ray']) {
    const encounter = await original(name);
    for (const index of [0, 3, 5]) {
      const retry = await T.createRetryMoment(encounter, index);
      await T.retryMomentRespond(retry, encounter.session.turns[index].me);
      assert.equal(retry.session.turns.at(-1).pt, encounter.session.turns[index].pt, `${name}/${index}`);
      assert.deepEqual(plain(retry.original), plain(encounter.session.turns.slice(index, index + 3).map(t => ({ me: t.me, pt: t.pt }))));
    }
  }
});

test('three-exchange limit and invalid drafts leave both histories unchanged', async () => {
  requireRetry();
  const encounter = await original();
  const retry = await T.createRetryMoment(encounter, 0);
  for (const text of ['', '   ', 'x'.repeat(1201), 'My patient has MRN 12345678']) {
    const before = JSON.stringify(retry.session);
    await assert.rejects(T.retryMomentRespond(retry, text));
    assert.equal(JSON.stringify(retry.session), before);
  }
  for (const text of ['Hello.', 'That sounds hard.', 'Tell me more.']) await T.retryMomentRespond(retry, text);
  const before = JSON.stringify(retry.session);
  await assert.rejects(T.retryMomentRespond(retry, 'One more question?'), /three|ended/i);
  assert.equal(JSON.stringify(retry.session), before);
});

test('live, mixed, empty, and invalid-index encounters cannot enter offline retry', async () => {
  requireRetry();
  const encounter = await original();
  for (const index of [-1, 0.5, 6, NaN]) await assert.rejects(T.createRetryMoment(encounter, index));
  const live = { ...encounter, provider: new T.ProxyProvider('', '', { rapportMin: -3, rapportMax: 4 }) };
  assert.equal(T.canRetryEncounter(live), false);
  await assert.rejects(T.createRetryMoment(live, 0));
  const mixed = { ...encounter, msgs: encounter.msgs.map((m, i) => i === 0 ? { ...m, offline: false } : m) };
  assert.equal(T.canRetryEncounter(mixed), false);
  await assert.rejects(T.createRetryMoment(mixed, 0));
  assert.equal(T.canRetryEncounter({ ...encounter, session: { ...encounter.session, turns: [] } }), false);
});

test('retry fails explicitly when the recorded prefix cannot be reconstructed', async () => {
  requireRetry();
  const encounter = await original();
  encounter.session.turns[0].pt = 'A different recorded response.';
  const before = JSON.stringify(encounter);
  await assert.rejects(T.createRetryMoment(encounter, 3), /reconstruct|reproduce/i);
  assert.equal(JSON.stringify(encounter), before);
});
