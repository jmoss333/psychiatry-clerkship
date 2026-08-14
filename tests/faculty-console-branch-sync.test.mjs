/**
 * The attestation console writes to its own branch and reaches `main` through one
 * rolling pull request.
 *
 * Why: `main` is protected, so the console's direct writes were refused for a
 * month while the UI reported "The repository changed during this request" — a
 * 409 reads as a race whether it is one or not.
 *
 * The rule these tests pin is the one with a data-loss failure mode: the branch
 * is fast-forwarded ONLY when it carries nothing of its own. A branch that is
 * behind `main` holds a stale `reviewed.json`, and merging it would revert
 * whatever landed since; a branch that is ahead holds unmerged attestations that
 * must not be discarded.
 *
 * Self-contained mock: the harness in faculty-console-handler.test.mjs hardcodes
 * `main` throughout, which is exactly the configuration these tests do not use.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../faculty-console/netlify/functions/attest.mjs';

const API_URL = 'https://faculty.example/api/attest';
const API_ORIGIN = new URL(API_URL).origin;
const FACULTY_KEY = 'synthetic-faculty-key';
const REPO = 'synthetic/faculty-console';
const BASE = 'main';
const ATTEST = 'attest/pending';

const BASE_HEAD = 'a'.repeat(40);
const BRANCH_HEAD = 'b'.repeat(40);
const REVIEWED_SHA = 'c'.repeat(40);
const WRITTEN_SHA = 'd'.repeat(40);

// Task 5 (risk-aware publishing warnings): the content-mutation handler now refuses
// to act on a slug whose current ledger record lacks a valid `risk` — this fixture
// must carry one or every attestRequest() in this file 502s instead of committing.
const REVIEWED = {
  'anki.md': {
    status: 'pending',
    at: '',
    by: 'Pending faculty review',
    risk: { kind: 'general', level: 'low' },
    reason: 'Synthetic review is pending',
  },
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * @param {object} options
 *  - branchMissing: the attestation branch does not exist yet
 *  - ahead / behind: how the branch compares to the base
 *  - openPull: an existing open rolling PR, or null
 *  - pullListResponse: an exact override for the open-PR list response
 *  - createdPull: the GitHub response after opening a rolling PR
 *  - failPullRequest: the PR housekeeping call throws
 */
function makeMock({
  branchMissing = false,
  ahead = 0,
  behind = 0,
  openPull = null,
  pullListResponse = undefined,
  createdPull = { html_url: 'https://github.example/pull/1' },
  failPullRequest = false,
} = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });

    if (method === 'GET' && url.endsWith(`/git/ref/heads/${BASE}`)) {
      return jsonResponse(200, { object: { type: 'commit', sha: BASE_HEAD } });
    }
    if (method === 'GET' && url.endsWith(`/git/ref/heads/${ATTEST}`)) {
      return branchMissing
        ? jsonResponse(404, { message: 'Not Found' })
        : jsonResponse(200, { object: { type: 'commit', sha: BRANCH_HEAD } });
    }
    if (method === 'POST' && url.endsWith('/git/refs')) {
      return jsonResponse(201, { ref: `refs/heads/${ATTEST}` });
    }
    if (method === 'PATCH' && url.endsWith(`/git/refs/heads/${ATTEST}`)) {
      return jsonResponse(200, { object: { type: 'commit', sha: BASE_HEAD } });
    }
    if (method === 'GET' && url.includes('/compare/')) {
      return jsonResponse(200, { ahead_by: ahead, behind_by: behind });
    }
    if (method === 'GET' && url.includes('/contents/')) {
      const serialized = JSON.stringify(REVIEWED);
      return jsonResponse(200, {
        sha: REVIEWED_SHA,
        size: Buffer.byteLength(serialized, 'utf8'),
        content: Buffer.from(serialized, 'utf8').toString('base64'),
        encoding: 'base64',
      });
    }
    if (method === 'PUT' && url.includes('/contents/')) {
      return jsonResponse(200, {
        content: { sha: WRITTEN_SHA },
        commit: { html_url: 'https://github.example/commit/1' },
      });
    }
    if (url.includes('/pulls')) {
      if (failPullRequest) return jsonResponse(500, { message: 'boom' });
      if (method === 'GET') {
        return jsonResponse(200, pullListResponse === undefined
          ? (openPull ? [openPull] : [])
          : pullListResponse);
      }
      return jsonResponse(201, createdPull);
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  };
  return { fetchImpl, calls };
}

function handlerWith(mock, envOverrides = {}) {
  return createHandler({
    fetchImpl: mock.fetchImpl,
    env: {
      GITHUB_TOKEN: 'synthetic-github-token',
      FACULTY_ATTEST_PASSWORD: FACULTY_KEY,
      GITHUB_REPO: REPO,
      GIT_BRANCH: ATTEST,
      GIT_BASE_BRANCH: BASE,
      STUDENT_SITE_URL: 'https://students.example/',
      ATTESTER_NAME: 'Synthetic Reviewer',
      ...envOverrides,
    },
  });
}

function attestRequest() {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('x-faculty-key', FACULTY_KEY);
  headers.set('Origin', API_ORIGIN);
  return new Request(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ target: 'content', changes: { 'anki.md': true } }),
  });
}

function called(calls, method, fragment) {
  return calls.filter((c) => c.method === method && c.url.includes(fragment));
}

test('a missing attestation branch is created from the base branch', async () => {
  const mock = makeMock({ branchMissing: true });
  const response = await handlerWith(mock)(attestRequest());
  assert.equal(response.status, 200);

  const created = called(mock.calls, 'POST', '/git/refs');
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].body, { ref: `refs/heads/${ATTEST}`, sha: BASE_HEAD });
});

test('a branch that is only behind is fast-forwarded before the write', async () => {
  const mock = makeMock({ ahead: 0, behind: 3 });
  const response = await handlerWith(mock)(attestRequest());
  assert.equal(response.status, 200);

  const patched = called(mock.calls, 'PATCH', `/git/refs/heads/${ATTEST}`);
  assert.equal(patched.length, 1, 'a stale branch must be fast-forwarded');
  assert.deepEqual(patched[0].body, { sha: BASE_HEAD, force: false });

  const patchIndex = mock.calls.findIndex((c) => c.method === 'PATCH');
  const readIndex = mock.calls.findIndex((c) => c.method === 'GET' && c.url.includes('/contents/'));
  assert.ok(patchIndex < readIndex, 'freshen before reading the file being changed');
});

test('a branch holding unmerged attestations is left alone', async () => {
  // ahead_by > 0 means the rolling PR still has work in it. Fast-forwarding
  // here would discard signed-off attestations.
  const mock = makeMock({ ahead: 2, behind: 5, openPull: { html_url: 'https://github.example/pull/9' } });
  const response = await handlerWith(mock)(attestRequest());
  assert.equal(response.status, 200);
  assert.equal(called(mock.calls, 'PATCH', '/git/refs/heads/').length, 0);
});

test('an up-to-date branch is neither compared nor moved', async () => {
  const mock = makeMock({ ahead: 0, behind: 0 });
  const response = await handlerWith(mock)(attestRequest());
  assert.equal(response.status, 200);
  assert.equal(called(mock.calls, 'PATCH', '/git/refs/heads/').length, 0);
});

test('one rolling pull request is opened, and an existing one is reused', async () => {
  const fresh = makeMock({ behind: 1 });
  const opened = await handlerWith(fresh)(attestRequest());
  assert.equal(JSON.parse(await opened.text()).pullRequest, 'https://github.example/pull/1');
  assert.equal(called(fresh.calls, 'POST', '/pulls').length, 1);

  const existing = makeMock({ behind: 1, openPull: { html_url: 'https://github.example/pull/7' } });
  const reused = await handlerWith(existing)(attestRequest());
  assert.equal(JSON.parse(await reused.text()).pullRequest, 'https://github.example/pull/7');
  assert.equal(called(existing.calls, 'POST', '/pulls').length, 0, 'never open a second PR');
});

test('a pull-request failure does not fail an attestation that already committed', async () => {
  const mock = makeMock({ behind: 1, failPullRequest: true });
  const response = await handlerWith(mock)(attestRequest());
  assert.equal(response.status, 200, 'the commit landed; housekeeping is not the attestation');
  const payload = JSON.parse(await response.text());
  assert.equal(payload.ok, true);
  assert.equal(payload.pullRequestError, true);
});

test('a malformed pull-request receipt warns without reclassifying the confirmed commit', async () => {
  for (const { mock, expectedCreates } of [
    { mock: makeMock({ behind: 1, openPull: { id: 7 } }), expectedCreates: 0 },
    { mock: makeMock({ behind: 1, createdPull: { id: 1 } }), expectedCreates: 1 },
    { mock: makeMock({ behind: 1, pullListResponse: {} }), expectedCreates: 0 },
    {
      mock: makeMock({ behind: 1, openPull: { html_url: 'http://github.example/pull/7' } }),
      expectedCreates: 0,
    },
    {
      mock: makeMock({ behind: 1, createdPull: { html_url: 'javascript:alert(1)' } }),
      expectedCreates: 1,
    },
  ]) {
    const response = await handlerWith(mock)(attestRequest());
    assert.equal(response.status, 200, 'the content commit is already durable');
    const payload = JSON.parse(await response.text());
    assert.equal(payload.ok, true);
    assert.equal(payload.pullRequest, null);
    assert.equal(payload.pullRequestError, true,
      'missing PR URL is a visible housekeeping warning');
    assert.equal(called(mock.calls, 'POST', '/pulls').length, expectedCreates,
      'a malformed list must never be mistaken for an empty list');
  }
});

test('branch equal to base restores direct writes with no sync and no pull request', async () => {
  // The pre-2026-08 configuration. Nothing to freshen, nothing to open.
  const mock = makeMock();
  const response = await handlerWith(mock, { GIT_BRANCH: BASE })(attestRequest());
  assert.equal(response.status, 200);
  assert.equal(called(mock.calls, 'GET', '/compare/').length, 0);
  assert.equal(called(mock.calls, 'GET', '/pulls').length, 0);
  assert.equal(called(mock.calls, 'PATCH', '/git/refs/heads/').length, 0);
});

test('the conflict message names branch protection, not just a race', async () => {
  // The month-long misdiagnosis: reloading cannot fix a protected branch.
  const mock = makeMock({ behind: 1 });
  const base = mock.fetchImpl;
  mock.fetchImpl = async (input, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    if (method === 'PUT' && String(input).includes('/contents/')) {
      return jsonResponse(409, { message: 'protected branch' });
    }
    return base(input, init);
  };
  const response = await handlerWith(mock)(attestRequest());
  assert.equal(response.status, 409);
  const { error } = JSON.parse(await response.text());
  assert.match(error.message, /protected/i);
  assert.match(error.message, /GIT_BRANCH/);
  assert.equal(error.code, 'github_conflict', 'the stable error code is unchanged');
});
