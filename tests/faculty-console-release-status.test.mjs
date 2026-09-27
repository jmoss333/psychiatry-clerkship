import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ATTEST_BRANCH,
  checksVerdict,
  firstParentChain,
  nextTrainSlot,
  parseMergeSubject,
  releaseHeadline,
  REQUIRED_CHECKS,
  TRAIN_SLOTS_UTC,
} from '../faculty-console/release-status.mjs';
import { createHandler } from '../faculty-console/netlify/functions/release-status.mjs';

const ROOT = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');
const sha = char => char.repeat(40);

// ── Pins: the panel restates three facts owned elsewhere; each must follow its owner. ──

test('the train slots are the release-train workflow cron', () => {
  const cron = read('.github/workflows/production-release-train.yml').match(/cron:\s*"(\d+) ([\d,]+) \* \* \*"/);
  assert.ok(cron, 'production-release-train.yml has one daily cron');
  const slots = cron[2].split(',').map(hour => [Number(hour), Number(cron[1])]);
  assert.deepEqual(TRAIN_SLOTS_UTC, slots);
});

test('the required checks are release_train.py REQUIRED_CHECKS, in order', () => {
  const tuple = read('13_Faculty_Resources/_automation/maintenance/release_train.py')
    .match(/^REQUIRED_CHECKS = \(([\s\S]*?)\n\)/m);
  assert.ok(tuple, 'release_train.py declares REQUIRED_CHECKS');
  assert.deepEqual([...REQUIRED_CHECKS], [...tuple[1].matchAll(/"([^"]+)"/g)].map(match => match[1]));
});

test('a sign-off is a merge from the governance guard\'s attestation branch', () => {
  const branch = read('bin/check_governance_separation.py').match(/^ATTEST_BRANCH = "([^"]+)"/m);
  assert.equal(ATTEST_BRANCH, branch?.[1]);
});

// ── Model ────────────────────────────────────────────────────────────────────────────

test('the next slot is strictly after now and rolls over days and months', () => {
  const at = iso => nextTrainSlot(Date.parse(iso));
  assert.equal(at('2026-09-27T09:04:59Z'), Date.parse('2026-09-27T09:05:00Z'));
  assert.equal(at('2026-09-27T09:05:00Z'), Date.parse('2026-09-27T15:05:00Z'));
  assert.equal(at('2026-09-27T21:05:01Z'), Date.parse('2026-09-28T09:05:00Z'));
  assert.equal(at('2026-09-30T23:00:00Z'), Date.parse('2026-10-01T09:05:00Z'));
});

test('merge subjects yield the PR, and only an attest/pending merge is a sign-off branch', () => {
  assert.deepEqual(parseMergeSubject('Phone dock: centre button reads "Essential" (#846)\n\nbody'),
    { pr: 846, branch: null, title: 'Phone dock: centre button reads "Essential"' });
  assert.deepEqual(parseMergeSubject('Merge pull request #781 from jmoss333/attest/pending\n\nattest: faculty review'),
    { pr: 781, branch: 'attest/pending', title: 'attest: faculty review' });
  assert.deepEqual(parseMergeSubject('Hotfix pushed straight to main'),
    { pr: null, branch: null, title: 'Hotfix pushed straight to main' });
});

function commit(id, parents, message = `change ${id}`) {
  return { sha: sha(id), parents: parents.map(parent => ({ sha: sha(parent) })), commit: { message, committer: { date: '2026-09-27T12:00:00Z' } } };
}

test('waiting changes are main\'s first-parent chain; a merged branch\'s own commits are not counted', () => {
  // live a ← b ← m(merge of side c) ← d = main
  const commits = [commit('b', ['a']), commit('c', ['b']), commit('e', ['b', 'c']), commit('d', ['e'])];
  const { chain, complete } = firstParentChain(commits, sha('d'), sha('a'));
  assert.deepEqual(chain.map(item => item.sha), [sha('d'), sha('e'), sha('b')]);
  assert.equal(complete, true);
});

test('a truncated comparison is reported as incomplete, never as the whole list', () => {
  const { chain, complete } = firstParentChain([commit('d', ['e'])], sha('d'), sha('a'));
  assert.equal(chain.length, 1);
  assert.equal(complete, false);
});

test('check verdicts follow the release train: newest re-run wins, a missing check is never green', () => {
  const [build, smoke] = REQUIRED_CHECKS;
  assert.equal(checksVerdict([
    { name: build, started_at: '2026-09-27T10:00:00Z', conclusion: 'failure' },
    { name: build, started_at: '2026-09-27T11:00:00Z', conclusion: 'success' },
    { name: smoke, started_at: '2026-09-27T10:00:00Z', conclusion: 'success' },
  ]).verdict, 'green');
  assert.equal(checksVerdict([{ name: build, conclusion: 'success' }]).verdict, 'running');
  assert.equal(checksVerdict([
    { name: build, conclusion: 'success' }, { name: smoke, conclusion: 'cancelled' },
  ]).verdict, 'failing');
  assert.equal(checksVerdict([{ name: 'some other check', conclusion: 'success' }]).verdict, 'running');
});

const train = { nextSlot: '2026-09-27T15:05:00.000Z', lastRun: null };

test('an unread comparison never reads as up to date', () => {
  const headline = releaseHeadline({ waiting: { status: 'unknown', changes: [], complete: false }, train });
  assert.equal(headline.tone, 'unknown');
  assert.doesNotMatch(headline.text, /Learners see everything/);
});

test('up to date is claimed only when every learner site was read; a partial read is a minimum', () => {
  const current = { status: 'current', changes: [], complete: true };
  for (const liveComplete of [false, undefined]) {
    const headline = releaseHeadline({ waiting: current, liveComplete, train });
    assert.equal(headline.tone, 'unknown');
    assert.doesNotMatch(headline.text, /Learners see everything/);
  }
  const partial = releaseHeadline({
    waiting: { status: 'waiting', complete: true, changes: [{}, {}] }, liveComplete: false, train,
  });
  assert.match(partial.text, /^At least 2 merged changes are not live/);
});

test('headlines: current, waiting with sign-offs, and the states that need the owner', () => {
  assert.deepEqual(releaseHeadline({ waiting: { status: 'current', changes: [], complete: true }, liveComplete: true, train }),
    { tone: 'current', text: 'Learners see everything merged to main.' });

  const waiting = releaseHeadline({
    waiting: { status: 'waiting', complete: true, changes: [{ signoff: true }, { signoff: false }] },
    liveComplete: true,
    mainChecks: { verdict: 'running' },
    train,
  });
  assert.equal(waiting.tone, 'waiting');
  assert.match(waiting.text, /^2 merged changes \(1 faculty sign-off\) are not live for learners yet\./);
  assert.match(waiting.text, /next scheduled publish is 15:05 UTC; main's newest merge is still being tested/);

  const held = releaseHeadline({
    waiting: { status: 'waiting', complete: false, changes: [{ signoff: false }] },
    mainChecks: { verdict: 'green' },
    train: { ...train, lastRun: { at: '2026-09-27T09:21:01Z', event: 'schedule', status: 'completed', conclusion: 'failure' } },
  });
  assert.equal(held.tone, 'attention');
  assert.match(held.text, /^At least 1 merged change is not live/);
  assert.match(held.text, /last release-train scheduled run \(09:21 UTC\) ended in failure/);
  // A red run is not proof of no publish (the receipt step runs after the push).
  assert.doesNotMatch(held.text, /did not go out|not published/);

  for (const status of [
    { waiting: { status: 'diverged', changes: [], complete: true }, train },
    { waiting: { status: 'current', changes: [], complete: true }, sitesDisagree: true, train },
    { waiting: { status: 'current', changes: [], complete: true }, releaseUnserved: true, train },
    { waiting: { status: 'waiting', changes: [{}], complete: true }, mainChecks: { verdict: 'failing' }, train },
  ]) assert.equal(releaseHeadline(status).tone, 'attention', JSON.stringify(status));
});

// ── Handler ──────────────────────────────────────────────────────────────────────────

const LIVE = sha('1');
const MAIN = sha('3');
const SIGNOFF = sha('2');
const SITES = {
  ms3: { siteId: 'ms3-site', host: 'ms3.example.netlify.app', deployId: '2'.repeat(24) },
  res: { siteId: 'res-site', host: 'res.example.netlify.app', deployId: '3'.repeat(24) },
};
const CONFIG = {
  sites: Object.entries(SITES).map(([name, site]) => ({ name, siteId: site.siteId, baseUrl: `https://${site.host}` })),
};

function fixtureFetch({ netlifyDown = false, compareDown = false, checksDown = false, served = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: MAIN } });
    if (url.endsWith('/git/ref/heads/release')) return Response.json({ object: { sha: LIVE } });
    if (url.includes('/contents/')) {
      return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify(CONFIG)).toString('base64') });
    }
    if (url.includes('/check-runs')) {
      if (checksDown) return new Response('', { status: 403 });
      return Response.json({ check_runs: REQUIRED_CHECKS.map(name => ({ name, conclusion: 'success', started_at: '2026-09-27T12:00:00Z' })) });
    }
    if (url.includes('/actions/workflows/production-release-train.yml/runs')) {
      return Response.json({ workflow_runs: [{ run_started_at: '2026-09-27T09:21:01Z', event: 'schedule', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/jmoss333/psychiatry-clerkship/actions/runs/1' }] });
    }
    if (url.includes('/compare/')) {
      if (compareDown) return new Response('', { status: 502 });
      return Response.json({
        status: 'ahead',
        total_commits: 2,
        commits: [
          { sha: SIGNOFF, parents: [{ sha: LIVE }], commit: { message: 'Merge pull request #781 from jmoss333/attest/pending\n\nattest: faculty review', committer: { date: '2026-09-27T10:00:00Z' } } },
          { sha: MAIN, parents: [{ sha: SIGNOFF }], commit: { message: 'Phone dock label (#846)', committer: { date: '2026-09-27T12:47:46Z' } } },
        ],
      });
    }
    if (url.startsWith('https://api.netlify.com/')) {
      if (netlifyDown) return new Response('', { status: 503 });
      const [key, site] = Object.entries(SITES).find(([, value]) => url.includes(value.siteId) || url.includes(value.deployId)) || [];
      if (!site) throw new Error(`Unexpected Netlify request: ${url}`);
      const record = {
        id: site.deployId, site_id: site.siteId, context: 'production', state: 'ready',
        commit_ref: served[key] || LIVE, published_at: '2026-09-26T21:18:00.000Z',
      };
      return Response.json(url.includes('/deploys/') && !url.includes('/sites/') ? record : [record]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { fetchImpl, calls };
}

function handler(fetchImpl, env = {}) {
  const values = { FACULTY_ATTEST_PASSWORD: 'synthetic-faculty-key', GITHUB_TOKEN: 'synthetic-github-token', ...env };
  return createHandler({ fetchImpl, getEnv: key => values[key] || '', now: () => Date.parse('2026-09-27T13:00:00Z') });
}

function request(key = 'synthetic-faculty-key') {
  return new Request('https://faculty.example.netlify.app/api/release-status', { headers: { 'x-faculty-key': key } });
}

test('the endpoint rejects a wrong key before any upstream call', async () => {
  const { fetchImpl, calls } = fixtureFetch();
  const response = await handler(fetchImpl)(request('wrong-key'));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('the endpoint reports the served commit, the waiting changes and the held train', async () => {
  const { fetchImpl } = fixtureFetch();
  const response = await handler(fetchImpl)(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.state, 'complete');
  assert.deepEqual(body.gaps, []);
  assert.equal(body.live, LIVE);
  assert.equal(body.liveBasis, 'published deploys');
  assert.equal(body.liveComplete, true);
  assert.equal(body.sites.ms3.commitRef, LIVE);
  assert.equal(body.sites.res.deployUrl, `https://${SITES.res.deployId}--${SITES.res.host}`);
  assert.deepEqual(body.waiting.changes.map(change => [change.pr, change.signoff]), [[846, false], [781, true]]);
  assert.equal(body.mainChecks.verdict, 'green');
  assert.equal(body.train.nextSlot, '2026-09-27T15:05:00.000Z');
  assert.equal(body.headline.tone, 'attention');
  assert.match(body.headline.text, /^2 merged changes \(1 faculty sign-off\) are not live for learners yet\./);
  assert.equal(body.ledgerMode, false);
});

test('an unreadable Netlify falls back to the release branch and says so', async () => {
  const { fetchImpl } = fixtureFetch({ netlifyDown: true, checksDown: true });
  const body = await (await handler(fetchImpl)(request())).json();
  assert.equal(body.state, 'partial');
  assert.equal(body.liveBasis, 'release branch');
  assert.equal(body.liveComplete, false);
  assert.match(body.headline.text, /^At least 2 merged changes/);
  assert.equal(body.live, LIVE);
  assert.equal(body.mainChecks, null);
  assert.ok(body.gaps.some(gap => gap.startsWith('ms3 published deploy')));
  assert.ok(body.gaps.some(gap => gap.startsWith("main's required checks")));
  assert.equal(body.waiting.changes.length, 2);
});

test('an unread comparison is a gap and an unknown headline, never zero waiting', async () => {
  const { fetchImpl } = fixtureFetch({ compareDown: true });
  const body = await (await handler(fetchImpl)(request())).json();
  assert.equal(body.state, 'partial');
  assert.equal(body.waiting.status, 'unknown');
  // The fixture's held train outranks it (attention), but the answer is never "up to date".
  assert.notEqual(body.headline.tone, 'current');
  assert.match(body.headline.text, /^Could not tell which merged changes are live/);
  assert.ok(body.gaps.some(gap => gap.startsWith('waiting changes')));
});

test('sites serving different commits are flagged, and release ahead of both is flagged', async () => {
  const { fetchImpl } = fixtureFetch({ served: { res: sha('9') } });
  const body = await (await handler(fetchImpl)(request())).json();
  assert.equal(body.sitesDisagree, true);
  assert.equal(body.headline.tone, 'attention');
  assert.match(body.headline.text, /serve different commits/);
});

test('ledger mode is reported so sign-offs are not expected in the list', async () => {
  const { fetchImpl } = fixtureFetch();
  const body = await (await handler(fetchImpl, { ATTEST_LEDGER: 'on' })(request())).json();
  assert.equal(body.ledgerMode, true);
});

test('main unreadable is a 503 with no partial claim', async () => {
  const fetchImpl = async () => new Response('', { status: 500 });
  const response = await handler(fetchImpl)(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).state, 'unavailable');
});
