// When the console asks the learner sites to rebuild (faculty-console/ledger-publish.mjs,
// ADR-003). The rule is stateless and must be BOUNDED: one build per burst of sign-offs plus
// two retries, never a loop, and never a production deploy spent on a site the ledger is not
// switched on for.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLISH_WINDOWS_MS,
  TICK_MS,
  decidePublish,
  lastEventOf,
  parseHooks,
  publishLedger,
  runScheduledPublish,
} from '../faculty-console/ledger-publish.mjs';

const T0 = Date.parse('2026-09-25T12:00:00.000Z');
const head = { seq: 5, ts: '2026-09-25T12:00:00.000Z' };
const minutes = n => n * 60_000;

test('parseHooks accepts Netlify build hooks only', () => {
  assert.deepEqual(parseHooks(''), {});
  assert.deepEqual(parseHooks('ms3=https://api.netlify.com/build_hooks/a1, res=https://api.netlify.com/build_hooks/b2'),
    { ms3: 'https://api.netlify.com/build_hooks/a1', res: 'https://api.netlify.com/build_hooks/b2' });
  assert.throws(() => parseHooks('ms3=https://evil.example/build_hooks/a1'));
  assert.throws(() => parseHooks('staging=https://api.netlify.com/build_hooks/a1'));
  assert.throws(() => parseHooks('https://api.netlify.com/build_hooks/a1'));
});

test('lastEventOf reads the head without trusting it', () => {
  assert.equal(lastEventOf(''), null);
  assert.deepEqual(lastEventOf('{"seq":1,"ts":"a"}\n{"seq":2,"ts":"2026-09-25T12:00:00.000Z"}\n'),
    { seq: 2, ts: '2026-09-25T12:00:00.000Z' });
  assert.equal(lastEventOf('garbage\n'), null);
});

test('a site that is current is never rebuilt, forced or not', () => {
  for (const force of [false, true]) {
    const d = decidePublish({ head, served: { ms3: 5, res: 6 }, now: T0 + minutes(12), force });
    assert.equal(d.ms3.trigger, false);
    assert.equal(d.res.trigger, false);
  }
});

test('a site that is behind rebuilds only inside a publish window', () => {
  const at = offset => decidePublish({ head, served: { ms3: 4, res: 4 }, now: T0 + offset }).ms3.trigger;
  assert.equal(at(minutes(3)), false, 'still inside the quiet period');
  assert.equal(at(minutes(10)), true, 'first window opens at 10 minutes');
  assert.equal(at(minutes(19)), true);
  assert.equal(at(minutes(20)), false, 'first window closes');
  assert.equal(at(minutes(45)), false);
  assert.equal(at(minutes(60)), true, 'retry at an hour');
  assert.equal(at(minutes(70)), false);
  assert.equal(at(minutes(24 * 60)), true, 'last retry at a day');
  assert.equal(at(minutes(24 * 60 + 10)), false, 'and then it stops');
});

test('BOUNDED: across two days of 10-minute ticks, a stuck site gets exactly three builds', () => {
  let builds = 0;
  for (let tick = 0; tick <= (48 * 60) / 10; tick += 1) {
    if (decidePublish({ head, served: { ms3: 4 }, now: T0 + tick * TICK_MS, sites: ['ms3'] }).ms3.trigger) builds += 1;
  }
  assert.equal(builds, PUBLISH_WINDOWS_MS.length);
});

test('a site with no receipt is not rebuilt by the timer, only by a forced publish', () => {
  const timer = decidePublish({ head, served: { ms3: null }, now: T0 + minutes(12), sites: ['ms3'] });
  assert.equal(timer.ms3.trigger, false);
  assert.match(timer.ms3.why, /CLERKSHIP_LEDGER=on/);
  assert.equal(decidePublish({ head, served: { ms3: null }, now: T0, force: true, sites: ['ms3'] }).ms3.trigger, true);
  assert.equal(decidePublish({ head: null, served: { ms3: null }, now: T0, force: true, sites: ['ms3'] }).ms3.trigger, false,
    'an empty ledger has nothing to publish');
});

function mockFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' });
    for (const [prefix, respond] of routes) {
      if (String(url).startsWith(prefix)) return respond(url, init);
    }
    return new Response('not found', { status: 404 });
  };
  return { impl, calls };
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('publishLedger reads both receipts and fires only the hooks the rule selects', async () => {
  const { impl, calls } = mockFetch([
    ['https://ms3.example/ledger-receipt.json', () => json({ schemaVersion: 1, status: 'applied', seq: 3 })],
    ['https://res.example/ledger-receipt.json', () => json({ schemaVersion: 1, status: 'applied', seq: 5 })],
    ['https://api.netlify.com/build_hooks/', () => new Response('', { status: 200 })],
  ]);
  const report = await publishLedger({
    head,
    sites: { ms3: { url: 'https://ms3.example', hook: 'https://api.netlify.com/build_hooks/m' },
      res: { url: 'https://res.example', hook: 'https://api.netlify.com/build_hooks/r' } },
    fetchImpl: impl,
    now: T0 + minutes(11),
  });
  assert.equal(report.sites.ms3.trigger, true);
  assert.equal(report.sites.ms3.hook.ok, true);
  assert.equal(report.sites.res.trigger, false);
  const hooks = calls.filter(call => call.method === 'POST');
  assert.equal(hooks.length, 1);
  assert.match(hooks[0].url, /build_hooks\/m\?trigger_title=attestation%20ledger%20seq%205/);
});

test('the scheduled tick is a no-op until ledger mode is on and hooks exist', async () => {
  const { impl, calls } = mockFetch([]);
  assert.deepEqual(await runScheduledPublish({ env: {}, fetchImpl: impl }), { skipped: 'ledger mode is off' });
  assert.deepEqual(await runScheduledPublish({ env: { ATTEST_LEDGER: 'on' }, fetchImpl: impl }),
    { skipped: 'no build hooks configured' });
  assert.equal(calls.length, 0, 'nothing is fetched while off');
});

test('the scheduled tick reads the ledger head from GitHub and publishes', async () => {
  const line = JSON.stringify({ seq: 5, ts: '2026-09-25T12:00:00.000Z' });
  const { impl, calls } = mockFetch([
    ['https://api.github.com/repos/o/r/contents/ledger/events.jsonl?ref=attestations', () => new Response(`${line}\n`)],
    ['https://une.example/ledger-receipt.json', () => json({ schemaVersion: 1, status: 'applied', seq: 4 })],
    ['https://res.example/ledger-receipt.json', () => json({ schemaVersion: 1, status: 'applied', seq: 4 })],
    ['https://api.netlify.com/build_hooks/', () => new Response('', { status: 200 })],
  ]);
  const report = await runScheduledPublish({
    env: { ATTEST_LEDGER: 'on', GITHUB_REPO: 'o/r', GITHUB_TOKEN: 't', STUDENT_SITE_URL: 'https://une.example',
      RESIDENT_SITE_URL: 'https://res.example',
      LEDGER_BUILD_HOOKS: 'ms3=https://api.netlify.com/build_hooks/m,res=https://api.netlify.com/build_hooks/r' },
    fetchImpl: impl,
    now: T0 + minutes(15),
  });
  assert.equal(report.head.seq, 5);
  assert.equal(report.sites.ms3.trigger, true);
  assert.equal(report.sites.res.trigger, true);
  assert.equal(calls.filter(call => call.method === 'POST').length, 2);
});
