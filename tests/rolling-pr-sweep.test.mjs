// faculty-console/rolling-pr-sweep.mjs -- the scheduled backstop that keeps the rolling
// attestation PR open with auto-merge armed. Pinned here, against a fake GitHub:
//   * it acts only when attest/pending carries something main does not;
//   * it opens the PR under the console's own title, and survives the open-race with the console;
//   * auto-merge is a MERGE commit, never a squash (L4 reads the console identity per commit);
//   * a PR whose checks already passed is merged directly, one whose checks are not green is not;
//   * it never throws, never writes a file, and is inert in ledger mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROLLING_PR_TITLE,
  runRollingPrSweep,
  sweepSettings,
} from '../faculty-console/rolling-pr-sweep.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'synthetic/clerkship';
const ENV = { GITHUB_TOKEN: 'synthetic-token', GITHUB_REPO: REPO };

function fakeGitHub({ aheadBy = 1, open = [], compareStatus = 200, createStatus = 201,
  graphqlErrors = null, mergeableState = 'clean', raceCreatesPr = false } = {}) {
  const calls = [];
  const prs = [...open];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const reply = (status, payload) => ({ ok: status < 400, status, json: async () => payload });
    if (url.includes('/compare/')) {
      if (compareStatus !== 200) return reply(compareStatus, { message: 'x' });
      return reply(200, { ahead_by: aheadBy, behind_by: 0 });
    }
    if (method === 'GET' && /\/pulls\?/.test(url)) return reply(200, prs);
    if (method === 'POST' && url.endsWith('/pulls')) {
      if (raceCreatesPr) {
        prs.push({ number: 9, html_url: 'https://github.com/x/pull/9', node_id: 'PR_9', auto_merge: null });
        return reply(422, { message: 'A pull request already exists' });
      }
      if (createStatus !== 201) return reply(createStatus, {});
      const pr = { number: 7, html_url: 'https://github.com/x/pull/7', node_id: 'PR_7', auto_merge: null };
      prs.push(pr);
      return reply(201, pr);
    }
    if (url.endsWith('/graphql')) {
      return reply(200, graphqlErrors ? { errors: graphqlErrors } : { data: { enablePullRequestAutoMerge: { pullRequest: { number: 7 } } } });
    }
    if (method === 'GET' && /\/pulls\/\d+$/.test(url)) {
      return reply(200, { mergeable_state: mergeableState, head: { sha: 'e'.repeat(40) } });
    }
    if (method === 'PUT' && /\/pulls\/\d+\/merge$/.test(url)) return reply(200, { merged: true });
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { fetchImpl, calls };
}

const writes = calls => calls.filter(c => c.method !== 'GET');

test('inert in ledger mode, without a token, and when the branch IS the base', async () => {
  for (const env of [{ ...ENV, ATTEST_LEDGER: 'on' }, { GITHUB_REPO: REPO }, { ...ENV, GIT_BRANCH: 'main' }]) {
    const gh = fakeGitHub();
    const report = await runRollingPrSweep({ env, fetchImpl: gh.fetchImpl });
    assert.equal(report.action, 'skipped');
    assert.equal(gh.calls.length, 0, 'a skipped tick makes no GitHub call at all');
  }
  assert.equal(sweepSettings({ ...ENV, ATTEST_LEDGER: 'on' }).skip, 'ledger-mode');
});

test('nothing waiting: the branch is not ahead of main, or does not exist yet', async () => {
  for (const options of [{ aheadBy: 0 }, { compareStatus: 404 }]) {
    const gh = fakeGitHub(options);
    const report = await runRollingPrSweep({ env: ENV, fetchImpl: gh.fetchImpl });
    assert.equal(report.action, 'nothing-waiting');
    assert.deepEqual(writes(gh.calls), []);
  }
});

test('stranded signatures: opens the rolling PR under the console title and arms a MERGE-commit auto-merge', async () => {
  const gh = fakeGitHub({ aheadBy: 1 });
  const report = await runRollingPrSweep({ env: ENV, fetchImpl: gh.fetchImpl });
  assert.equal(report.action, 'pr-opened');
  assert.equal(report.autoMerge, 'armed');
  const create = gh.calls.find(c => c.method === 'POST' && c.url.endsWith('/pulls'));
  assert.equal(create.body.title, ROLLING_PR_TITLE);
  assert.equal(create.body.head, 'attest/pending');
  assert.equal(create.body.base, 'main');
  const gql = gh.calls.find(c => c.url.endsWith('/graphql'));
  assert.match(gql.body.query, /mergeMethod: MERGE\b/);
  assert.doesNotMatch(gql.body.query, /SQUASH|REBASE/);
  assert.equal(gql.body.variables.id, 'PR_7');
});

test('an open PR that already has auto-merge is left exactly as it is', async () => {
  const open = [{ number: 5, html_url: 'https://github.com/x/pull/5', node_id: 'PR_5', auto_merge: { merge_method: 'merge' } }];
  const gh = fakeGitHub({ open });
  const report = await runRollingPrSweep({ env: ENV, fetchImpl: gh.fetchImpl });
  assert.equal(report.action, 'pr-open');
  assert.equal(report.autoMerge, 'already-armed');
  assert.deepEqual(writes(gh.calls), []);
});

test('checks already green ("clean status"): merged directly with a merge commit', async () => {
  const open = [{ number: 5, html_url: 'https://github.com/x/pull/5', node_id: 'PR_5', auto_merge: null }];
  const gh = fakeGitHub({ open, graphqlErrors: [{ message: 'Pull request Pull request is in clean status' }] });
  const report = await runRollingPrSweep({ env: ENV, fetchImpl: gh.fetchImpl });
  assert.equal(report.autoMerge, 'merged');
  const merge = gh.calls.find(c => c.method === 'PUT');
  assert.equal(merge.body.merge_method, 'merge');
  assert.equal(merge.body.sha, 'e'.repeat(40), 'merges only the head it inspected');
});

test('checks not green: never merged, reported as waiting', async () => {
  const open = [{ number: 5, html_url: 'https://github.com/x/pull/5', node_id: 'PR_5', auto_merge: null }];
  const gh = fakeGitHub({ open, graphqlErrors: [{ message: 'Pull request is in clean status' }], mergeableState: 'blocked' });
  const report = await runRollingPrSweep({ env: ENV, fetchImpl: gh.fetchImpl });
  assert.equal(report.autoMerge, 'waiting:blocked');
  assert.equal(gh.calls.filter(c => c.method === 'PUT').length, 0);
});

test('the console opening the PR between our list and our create is not an error', async () => {
  const gh = fakeGitHub({ raceCreatesPr: true });
  const report = await runRollingPrSweep({ env: ENV, fetchImpl: gh.fetchImpl });
  assert.equal(report.pullRequest, 'https://github.com/x/pull/9');
  assert.equal(report.autoMerge, 'armed');
});

test('ATTEST_ROLLING_PR_AUTOMERGE=off opens the PR and leaves the merge to a person', async () => {
  const gh = fakeGitHub();
  const report = await runRollingPrSweep({ env: { ...ENV, ATTEST_ROLLING_PR_AUTOMERGE: 'off' }, fetchImpl: gh.fetchImpl });
  assert.equal(report.action, 'pr-opened');
  assert.equal(report.autoMerge, 'off');
  assert.equal(gh.calls.filter(c => c.url.endsWith('/graphql')).length, 0);
});

test('a GitHub failure is reported, never thrown', async () => {
  const gh = fakeGitHub({ compareStatus: 500 });
  const report = await runRollingPrSweep({ env: ENV, fetchImpl: gh.fetchImpl });
  assert.deepEqual(report, { action: 'error', error: 'github_500' });
});

test('the sweep is wired: same PR title as the console, scheduled every 15 minutes, wrapper present', () => {
  const console = fs.readFileSync(path.join(ROOT, 'faculty-console/netlify/functions/attest.mjs'), 'utf8');
  assert.ok(console.includes(`title: '${ROLLING_PR_TITLE}'`), 'the console and the sweep name the rolling PR identically');
  const toml = fs.readFileSync(path.join(ROOT, 'faculty-console/netlify.toml'), 'utf8');
  assert.match(toml, /\[functions\."rolling-pr-sweep"\]\s*\n\s*schedule = "\*\/15 \* \* \* \*"/);
  const wrapper = fs.readFileSync(path.join(ROOT, 'faculty-console/netlify/functions/rolling-pr-sweep.mjs'), 'utf8');
  assert.match(wrapper, /runRollingPrSweep\(\{ env: process\.env, fetchImpl: globalThis\.fetch \}\)/);
  const source = fs.readFileSync(path.join(ROOT, 'faculty-console/rolling-pr-sweep.mjs'), 'utf8');
  assert.doesNotMatch(source, /writeFile|reviewed\.json['"]\s*,|contents\/13_Faculty/, 'the sweep never writes repository content');
});
