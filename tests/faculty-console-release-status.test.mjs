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
  STALE_WAIT_HOURS,
  failedTrainRuns,
  TRAIN_LOOKBACK_HOURS,
  failedStage,
  TRAIN_PROMOTE_STEP,
  TRAIN_RECEIPT_STEP,
  trainWeek,
  trainWeekLine,
  pushedDuring,
  watchVerdict,
  REQUIRED_CHECKS,
  TRAIN_SLOTS_UTC,
} from '../faculty-console/release-status.mjs';
import {
  createHandler, loadReleaseStatus, servedRevisionReader,
} from '../faculty-console/netlify/functions/release-status.mjs';
import { main as releaseWatch } from '../bin/release_watch.mjs';

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

function fixtureFetch({
  netlifyDown = false, compareDown = false, checksDown = false, served = {},
  sitesDown = false, trainConclusion = 'failure', manifest = null, trainRuns = null, jobs = {},
  pushes = [], activityDown = false,
} = {}) {
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
      if (trainRuns) return Response.json({ workflow_runs: trainRuns });
      return Response.json({ workflow_runs: [{ run_started_at: '2026-09-27T09:21:01Z', event: 'schedule', status: 'completed', conclusion: trainConclusion, html_url: 'https://github.com/jmoss333/psychiatry-clerkship/actions/runs/1' }] });
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
    if (url.includes('/activity?')) {
      if (activityDown) return new Response('', { status: 403 });
      return Response.json(pushes.map(timestamp => ({ activity_type: 'push', ref: 'refs/heads/release', timestamp })));
    }
    const jobsMatch = url.match(/\/actions\/runs\/(\d+)\/jobs$/);
    if (jobsMatch) {
      const failing = jobs[jobsMatch[1]];
      if (failing === 'down') return new Response('', { status: 502 });
      return Response.json({ jobs: [{ steps: failing ? [{ name: failing, conclusion: 'failure' }] : [] }] });
    }
    if (url.endsWith('/tool-governance.json')) {
      if (sitesDown) return new Response('', { status: 503 });
      const [key] = Object.entries(SITES).find(([, value]) => url.startsWith(`https://${value.host}/`)) || [];
      if (!key) throw new Error(`Unexpected site request: ${url}`);
      const body = manifest || { schemaVersion: 1, items: [
        { id: 'tool-a', source: { repository: 'jmoss333/psychiatry-clerkship', revision: served[key] || LIVE } },
        { id: 'tool-b', source: { repository: 'jmoss333/psychiatry-clerkship', revision: served[key] || LIVE } },
      ] };
      return Response.json(body);
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

// ── The daily release watch (maintenance-release-watch.yml → bin/release_watch.mjs) ─────

test('merged work waiting over a day is attention, not schedule', () => {
  const at = hoursAgo => new Date(Date.parse('2026-09-28T10:05:00Z') - hoursAgo * 3_600_000).toISOString();
  const status = changes => ({
    fetchedAt: '2026-09-28T10:05:00Z', liveComplete: true, mainChecks: { verdict: 'green' }, train,
    waiting: { status: 'waiting', complete: true, changes },
  });
  const fresh = releaseHeadline(status([{ at: at(3) }, { at: at(STALE_WAIT_HOURS - 1) }]));
  assert.equal(fresh.tone, 'waiting');
  const stuck = releaseHeadline(status([{ at: at(3) }, { at: at(STALE_WAIT_HOURS + 2) }]));
  assert.equal(stuck.tone, 'attention');
  assert.match(stuck.text, /The oldest has waited 26 h/);
});

test('the watch verdict: attention 1, anything unread 2, and only a complete read passes', () => {
  const ok = { headline: { tone: 'waiting' }, liveComplete: true, gaps: [] };
  assert.equal(watchVerdict(ok), 0);
  assert.equal(watchVerdict({ ...ok, headline: { tone: 'current' } }), 0);
  assert.equal(watchVerdict({ ...ok, headline: { tone: 'attention' }, gaps: ['x'] }), 1);
  assert.equal(watchVerdict({ ...ok, headline: { tone: 'unknown' } }), 2);
  assert.equal(watchVerdict({ ...ok, liveComplete: false }), 2);
  assert.equal(watchVerdict({ ...ok, gaps: ["main's required checks: GitHub answered 403"] }), 2);
  assert.equal(watchVerdict(null), 2);
});

test('the served-revision reader takes one shared revision of this repository, or fails', async () => {
  const site = { baseUrl: `https://${SITES.ms3.host}` };
  const good = await servedRevisionReader(fixtureFetch().fetchImpl)(site);
  assert.equal(good.commitRef, LIVE);
  const mixed = { schemaVersion: 1, items: [
    { id: 'a', source: { repository: 'jmoss333/psychiatry-clerkship', revision: sha('1') } },
    { id: 'b', source: { repository: 'jmoss333/psychiatry-clerkship', revision: sha('2') } },
  ] };
  await assert.rejects(servedRevisionReader(fixtureFetch({ manifest: mixed }).fetchImpl)(site), /ambiguous/);
  const foreign = { schemaVersion: 1, items: [{ id: 'a', source: { repository: 'someone/else', revision: sha('1') } }] };
  await assert.rejects(servedRevisionReader(fixtureFetch({ manifest: foreign }).fetchImpl)(site), /ambiguous/);
  const html = async () => new Response('<html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(servedRevisionReader(html)(site), /not JSON/);
});

test('the loader reads served revisions when given that reader, and names what it could not read', async () => {
  const opts = fetchImpl => ({ now: () => Date.parse('2026-09-27T13:00:00Z'), readSite: servedRevisionReader(fetchImpl) });
  const { fetchImpl } = fixtureFetch();
  const status = await loadReleaseStatus(fetchImpl, 'synthetic', opts(fetchImpl));
  assert.equal(status.liveBasis, 'served revisions');
  assert.equal(status.liveComplete, true);
  assert.deepEqual(status.gaps, []);
  const down = fixtureFetch({ sitesDown: true }).fetchImpl;
  const partial = await loadReleaseStatus(down, 'synthetic', opts(down));
  assert.equal(partial.liveComplete, false);
  assert.ok(partial.gaps.some(gap => gap.startsWith('ms3 served revision')));
  assert.ok(partial.gaps.some(gap => gap.startsWith('live commit: no learner site could be read')));
});

async function runWatch(t, fetchOptions) {
  const logged = [];
  t.mock.method(console, 'log', line => logged.push(String(line)));
  const code = await releaseWatch({
    argv: [], env: { GITHUB_TOKEN: 'synthetic' },
    fetchImpl: fixtureFetch(fetchOptions).fetchImpl, now: () => Date.parse('2026-09-27T13:00:00Z'),
  });
  return { code, errors: logged.filter(line => line.startsWith('::error')) };
}

test('the watch is green for waiting-on-schedule, red 1 for a held train, red 2 when it cannot see', async t => {
  const green = await runWatch(t, { trainConclusion: 'success' });
  assert.equal(green.code, 0);
  assert.deepEqual(green.errors, []);

  const held = await runWatch(t, {});
  assert.equal(held.code, 1);
  // The escalation issue quotes the first "error" line of a failed run: it must be the sentence.
  assert.match(held.errors[0], /^::error title=Release watch::2 merged changes \(1 faculty sign-off\) are not live/);

  const blind = await runWatch(t, { trainConclusion: 'success', sitesDown: true });
  assert.equal(blind.code, 2);
  assert.match(blind.errors[0], /could not check: ms3 served revision/);

  const split = await runWatch(t, { trainConclusion: 'success', served: { res: sha('9') } });
  assert.equal(split.code, 1);
  assert.match(split.errors[0], /serve different commits/);
});

test('the watch workflow runs the watch after the morning publish and is on the escalation list', () => {
  const workflow = read('.github/workflows/maintenance-release-watch.yml');
  const [, minute, hour] = workflow.match(/cron:\s*"(\d+) (\d+) \* \* \*"/) || [];
  const [trainHour, trainMinute] = TRAIN_SLOTS_UTC[0];
  const after = (Number(hour) * 60 + Number(minute)) - (trainHour * 60 + trainMinute);
  // The train's 09:05 slot starts as late as 09:24 and Netlify then builds: earlier than
  // ~45 min reads a build in progress as "release unserved"; much later and the next slot
  // (15:05) is closer than the morning one.
  assert.ok(after >= 45 && after <= 120, `watch runs ${after} min after the morning slot`);
  assert.match(workflow, /run: node bin\/release_watch\.mjs --out "\$RUNNER_TEMP\/release-watch\.json"/);
  assert.match(workflow, /^name: Maintenance — Release Watch$/m);
  assert.match(read('.github/workflows/automation-failure-escalation.yml'), /- "Maintenance — Release Watch"/);
});

// ── Every train run in the lookback (Codex P1 on #864) ─────────────────────────────────

const run = (at, conclusion, extra = {}) => ({
  id: Date.parse(at) / 1000, run_started_at: at, updated_at: new Date(Date.parse(at) + 20_000).toISOString(),
  event: 'schedule', status: 'completed', conclusion,
  html_url: `https://github.com/jmoss333/psychiatry-clerkship/actions/runs/${Date.parse(at)}`, ...extra,
});

test('failed train runs are every non-success in the lookback, and the listing proves it reached back', () => {
  const now = Date.parse('2026-09-28T10:05:00Z');
  const mapped = runs => runs.map(r => ({ at: r.run_started_at, status: r.status, conclusion: r.conclusion }));
  const { failed, coveredWindow } = failedTrainRuns(mapped([
    run('2026-09-28T09:21:00Z', 'success'),
    run('2026-09-27T21:17:00Z', 'success'),
    run('2026-09-27T15:18:00Z', 'failure'),
    run('2026-09-27T09:21:00Z', 'cancelled'),
    run('2026-09-26T21:17:00Z', 'failure'), // outside 26 h
  ]), now);
  assert.deepEqual(failed.map(r => r.at), ['2026-09-27T15:18:00Z', '2026-09-27T09:21:00Z']);
  assert.equal(coveredWindow, true);
  assert.equal(TRAIN_LOOKBACK_HOURS >= 24, true, 'the daily watch must see a full day of slots');
  const inProgress = failedTrainRuns([{ at: '2026-09-28T09:21:00Z', status: 'in_progress', conclusion: null }], now);
  assert.deepEqual(inProgress.failed, []);
  assert.equal(inProgress.coveredWindow, false);
});

test('a held 15:05 run followed by a green 21:05 run still turns the next morning red', async t => {
  const logged = [];
  t.mock.method(console, 'log', line => logged.push(String(line)));
  const trainRuns = [
    run('2026-09-28T09:21:00Z', 'success'),
    run('2026-09-27T21:17:00Z', 'success'),
    run('2026-09-27T15:18:00Z', 'failure'),
  ];
  const code = await releaseWatch({
    argv: [], env: { GITHUB_TOKEN: 'synthetic' },
    fetchImpl: fixtureFetch({ trainRuns }).fetchImpl, now: () => Date.parse('2026-09-28T10:05:00Z'),
  });
  assert.equal(code, 1);
  const error = logged.find(line => line.startsWith('::error'));
  assert.match(error, /An earlier release-train run in the last 26 h did not succeed \(15:18 UTC scheduled run, failure\)/);
  assert.doesNotMatch(error, /The last release-train/);
});

test('a green day stays green, and a full page inside the window is a gap, not a pass', async t => {
  t.mock.method(console, 'log', () => {});
  // 06:00: the fixture's waiting changes (27th, 10:00 and 12:47) are under a day old, so the
  // stale-wait rule stays quiet and only the run lookback is under test.
  const now = () => Date.parse('2026-09-28T06:00:00Z');
  const calm = [
    run('2026-09-27T21:17:00Z', 'success'),
    run('2026-09-27T15:18:00Z', 'success'),
    run('2026-09-26T21:17:00Z', 'failure'), // before the 26 h window opens (27th 04:00)
  ];
  const green = await releaseWatch({ argv: [], env: { GITHUB_TOKEN: 's' }, fetchImpl: fixtureFetch({ trainRuns: calm }).fetchImpl, now });
  assert.equal(green, 0);
  const busy = Array.from({ length: 50 }, (_, i) => run(new Date(Date.parse('2026-09-28T05:30:00Z') - i * 1_800_000).toISOString(), 'success'));
  const fetchImpl = fixtureFetch({ trainRuns: busy }).fetchImpl;
  const full = await loadReleaseStatus(fetchImpl, 's', { now, readSite: servedRevisionReader(fetchImpl) });
  assert.ok(full.gaps.some(gap => gap.startsWith('release-train runs: more than 50')));
  assert.equal(watchVerdict(full), 2);
});

// ── The weekly train line ───────────────────────────────────────────────────────────────

test('the two failure steps are the release-train workflow\'s own step names', () => {
  const workflow = read('.github/workflows/production-release-train.yml');
  assert.match(workflow, new RegExp(`- name: ${TRAIN_PROMOTE_STEP}\\n`));
  assert.match(workflow, new RegExp(`- name: ${TRAIN_RECEIPT_STEP}\\n`));
});

test('a failed run is classified by the step it stopped at, and a promote failure by whether release moved', () => {
  const job = (...steps) => [{ steps: steps.map(([name, conclusion]) => ({ name, conclusion })) }];
  const promote = job(['Set up job', 'success'], [TRAIN_PROMOTE_STEP, 'failure']);
  // The promote step pushes release and THEN writes its summary and outputs, so its failure
  // is "before" only when no push happened during the run (Codex P2 on #867).
  assert.equal(failedStage(promote, false), 'before');
  assert.equal(failedStage(promote, true), 'after');
  assert.equal(failedStage(promote, null), 'unknown');
  assert.equal(failedStage(promote), 'unknown');
  assert.equal(failedStage(job([TRAIN_PROMOTE_STEP, 'success'], [TRAIN_RECEIPT_STEP, 'failure'])), 'after');
  assert.equal(failedStage(job(['actions/checkout', 'failure'])), 'unknown');
  assert.equal(failedStage(undefined), 'unknown');
});

test('pushedDuring reads the release push record, and says null rather than guess', () => {
  const runAt = { at: '2026-09-27T21:17:39Z', endedAt: '2026-09-27T21:18:01Z' };
  const t = iso => Date.parse(iso);
  assert.equal(pushedDuring({ times: [t('2026-09-27T21:17:57Z')], complete: true }, runAt), true);
  assert.equal(pushedDuring({ times: [t('2026-09-27T13:47:12Z')], complete: true }, runAt), false);
  assert.equal(pushedDuring(null, runAt), null);
  assert.equal(pushedDuring({ times: [], complete: true }, { at: runAt.at, endedAt: null }), null);
  // A full listing that stops after the run began cannot prove there was no push.
  assert.equal(pushedDuring({ times: [t('2026-09-28T09:00:00Z')], complete: false }, runAt), null);
});

test('the week counts runs by outcome, says "at least" when cut short, and names a hold pattern', () => {
  const now = Date.parse('2026-09-28T10:05:00Z');
  const at = hoursAgo => ({ at: new Date(now - hoursAgo * 3_600_000).toISOString() });
  const r = (hoursAgo, conclusion, extra = {}) => ({ ...at(hoursAgo), id: hoursAgo, event: 'schedule', status: 'completed', conclusion, ...extra });
  const runs = [
    r(1, 'success'), r(6, 'failure'), r(12, 'failure'), r(25, 'success', { event: 'workflow_dispatch' }),
    r(30, 'failure'), r(40, 'success'), r(50, 'cancelled'), r(60, 'success', { status: 'in_progress', conclusion: null }),
    r(24 * 8, 'failure'), // outside the week: proves the listing reached past it
  ];
  const week = trainWeek(runs, now, { 6: 'before', 12: 'before', 30: 'after' });
  assert.deepEqual(
    { ...week },
    { days: 7, complete: true, scheduled: 7, publishNow: 1, ok: 3, before: 2, after: 1, unknown: 1, running: 1, beforeScheduled: 2 },
  );
  assert.equal(trainWeekLine(week),
    'Release train, last 7 days: 7 scheduled runs and 1 publish-now — 3 published or had nothing new, '
    + '2 stopped before publishing (held by the spend tripwire, refused, or could not check), 1 failed after publishing, '
    + '1 failed at an unread step, 1 still running.');
  const cut = trainWeek(runs.slice(0, 3), now, {});
  assert.equal(cut.complete, false);
  assert.match(trainWeekLine(cut), /^Release train, last 7 days: At least 3 scheduled runs/);
  const held = trainWeek([r(1, 'failure'), r(9, 'failure'), r(17, 'failure'), r(25, 'success'), r(33, 'success'), r(200, 'success')], now,
    { 1: 'before', 9: 'before', 17: 'before' });
  assert.match(trainWeekLine(held), /Scheduled runs stopping before publishing are a pattern this week; .*release_train\.py may need retuning/);
  assert.doesNotMatch(trainWeekLine(week), /pattern/);
  // Publish-now is never held by cost: three failed presses beside nine green scheduled runs
  // are no evidence about the budget (Codex P2 on #867).
  const pressed = trainWeek([
    ...[1, 2, 3].map(h => r(h, 'failure', { event: 'workflow_dispatch' })),
    ...[10, 18, 26, 34, 42, 50, 58, 66, 74].map(h => r(h, 'success')),
    r(24 * 8, 'success'),
  ], now, { 1: 'before', 2: 'before', 3: 'before' });
  assert.equal(pressed.before, 3);
  assert.equal(pressed.beforeScheduled, 0);
  assert.doesNotMatch(trainWeekLine(pressed), /pattern/);
});

test('the loader reads each failed run\'s steps for the week; an unreadable one is unclassified, never a gap', async () => {
  const now = () => Date.parse('2026-09-28T06:00:00Z');
  const trainRuns = [
    run('2026-09-27T21:17:00Z', 'success'),
    run('2026-09-27T15:18:00Z', 'failure'),
    run('2026-09-27T09:21:00Z', 'failure'),
    run('2026-09-26T09:21:00Z', 'failure'),
    run('2026-09-15T09:21:00Z', 'success'),
  ];
  const jobs = {
    [Date.parse('2026-09-27T15:18:00Z') / 1000]: TRAIN_PROMOTE_STEP,
    [Date.parse('2026-09-27T09:21:00Z') / 1000]: TRAIN_RECEIPT_STEP,
    [Date.parse('2026-09-26T09:21:00Z') / 1000]: 'down',
  };
  // release was pushed during the 21:17 run only: the 15:18 promote failure published nothing.
  const pushes = ['2026-09-27T21:17:50Z'];
  const fetchImpl = fixtureFetch({ trainRuns, jobs, pushes }).fetchImpl;
  const status = await loadReleaseStatus(fetchImpl, 's', { now, readSite: servedRevisionReader(fetchImpl) });
  assert.deepEqual(
    { ...status.train.week },
    { days: 7, complete: true, scheduled: 4, publishNow: 0, ok: 1, before: 1, after: 1, unknown: 1, running: 0, beforeScheduled: 1 },
  );
  assert.ok(!status.gaps.some(gap => gap.includes('jobs')));
  // A promote failure DURING which release was pushed published: it is "after", not a hold.
  const published = fixtureFetch({ trainRuns, jobs, pushes: ['2026-09-27T15:18:10Z'] }).fetchImpl;
  const moved = await loadReleaseStatus(published, 's', { now, readSite: servedRevisionReader(published) });
  assert.equal(moved.train.week.before, 0);
  assert.equal(moved.train.week.after, 2);
  // No push record: a promote failure cannot be called a hold, so it is unclassified.
  const blind = fixtureFetch({ trainRuns, jobs, activityDown: true }).fetchImpl;
  const unread = await loadReleaseStatus(blind, 's', { now, readSite: servedRevisionReader(blind) });
  assert.equal(unread.train.week.before, 0);
  assert.equal(unread.train.week.unknown, 2);
});
