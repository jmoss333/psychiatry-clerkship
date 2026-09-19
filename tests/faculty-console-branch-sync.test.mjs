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
import { createHash } from 'node:crypto';

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

// The page every fixture here ships from; `contentsFor` below serves the listing that
// names it and the tree route serves its blob sha.
const ANKI_SOURCE = 'x/anki.md';

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

// Attesting binds the row to page text, so the write path reads the shipped listing, the
// topic metadata and one recursive git tree — all from the attestation branch. Serving one
// blob for every path (what this mock did before) made every attest 400 on a missing source.
const SOURCE_BYTES = Buffer.from('# Anki\n\nSynthetic source.\n', 'utf8');

function blobShaOf(bytes) {
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

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
  let created = false;
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });

    if (method === 'GET' && url.endsWith(`/git/ref/heads/${BASE}`)) {
      return jsonResponse(200, { object: { type: 'commit', sha: BASE_HEAD } });
    }
    if (method === 'GET' && url.endsWith(`/git/ref/heads/${ATTEST}`)) {
      // Once the ref has been created the branch HAS a head, and the write path asks for
      // it to read the tree its digests come from. A mock that kept answering 404 would
      // make the created-branch case look like a repository failure.
      return branchMissing && !created
        ? jsonResponse(404, { message: 'Not Found' })
        : jsonResponse(200, { object: { type: 'commit', sha: BRANCH_HEAD } });
    }
    if (method === 'POST' && url.endsWith('/git/refs')) {
      created = true;
      return jsonResponse(201, { ref: `refs/heads/${ATTEST}` });
    }
    if (method === 'PATCH' && url.endsWith(`/git/refs/heads/${ATTEST}`)) {
      return jsonResponse(200, { object: { type: 'commit', sha: BASE_HEAD } });
    }
    if (method === 'GET' && url.includes('/compare/')) {
      return jsonResponse(200, { ahead_by: ahead, behind_by: behind });
    }
    if (method === 'GET' && url.includes('/git/trees/')) {
      return jsonResponse(200, {
        sha: BRANCH_HEAD,
        truncated: false,
        tree: [{
          path: ANKI_SOURCE,
          mode: '100644',
          type: 'blob',
          sha: blobShaOf(SOURCE_BYTES),
          size: SOURCE_BYTES.length,
        }],
      });
    }
    if (method === 'GET' && url.includes('/contents/')) {
      const serialized = JSON.stringify(contentsFor(url));
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

function ensurePrRequest() {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('x-faculty-key', FACULTY_KEY);
  headers.set('Origin', API_ORIGIN);
  return new Request(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'branch.ensure-pr' }),
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

/* ------------------------------------------------------------------------- *
 * Base-lag alarm (2026-08-28). The August freeze was silent for four days:
 * three attestations sat on attest/pending with no rolling PR while the base
 * fell nine commits behind main, and nothing surfaced it (#415 landed them).
 * These tests pin the console's load-time probe: GET reports how the branch
 * compares to the base and whether that state deserves an alarm — and a GET
 * must never mutate anything (no fast-forward, no PR creation) on the way.
 * ------------------------------------------------------------------------- */

const MANIFEST_FIXTURE = { tools: [], md: [['x/anki.md', 'anki.md', 'Anki']] };
// The review queue comes from shipped_pages.json now (ADR-002); the manifest above is
// still read for the question bank's page anchors and its conflict revision.
const SHIPPED_FIXTURE = {
  version: 1,
  generated_from: {},
  pages: [
    {
      slug: 'anki.md',
      kind: 'page',
      sites: ['ms3', 'res'],
      title: 'Anki',
      source: 'x/anki.md',
      producer: 'site_manifest',
    },
  ],
};
const QBANK_FIXTURE = { items: [] };
// The other half of a content hash. Served explicitly: before this existed the fallthrough
// handed the LEDGER back for topic_meta.json, and a digest computed over that would have
// been a hash of the attestation record rather than of the page's metadata.
const TOPIC_META_FIXTURE = { 'anki.md': { title: 'Anki' } };

function contentsFor(url) {
  if (url.includes('question_bank.json')) return QBANK_FIXTURE;
  if (url.includes('shipped_pages.json')) return SHIPPED_FIXTURE;
  if (url.includes('site_manifest.json')) return MANIFEST_FIXTURE;
  if (url.includes('topic_meta.json')) return TOPIC_META_FIXTURE;
  return REVIEWED;
}

function makeStateMock(options = {}) {
  const base = makeMock(options);
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    if (method === 'GET' && url.includes('/contents/')) {
      base.calls.push({ url, method, body: null });
      if (options.failCompare && url.includes('never-matches')) { /* unreachable */ }
      const doc = contentsFor(url);
      const serialized = JSON.stringify(doc);
      return jsonResponse(200, {
        sha: REVIEWED_SHA,
        size: Buffer.byteLength(serialized, 'utf8'),
        content: Buffer.from(serialized, 'utf8').toString('base64'),
        encoding: 'base64',
      });
    }
    if (options.failCompare && method === 'GET' && url.includes('/compare/')) {
      base.calls.push({ url, method, body: null });
      return jsonResponse(500, { message: 'compare unavailable' });
    }
    return base.fetchImpl(input, init);
  };
  return { fetchImpl, calls: base.calls };
}

function stateRequest() {
  const headers = new Headers({ 'x-faculty-key': FACULTY_KEY, Origin: API_ORIGIN });
  return new Request(API_URL, { method: 'GET', headers });
}

function mutations(calls) {
  return calls.filter((c) => c.method !== 'GET');
}

test('GET reports a stranded branch with a lagging base as alarmed, with both reasons', async () => {
  const mock = makeStateMock({ ahead: 3, behind: 9 });
  const response = await handlerWith(mock)(stateRequest());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.items), 'the queue still loads');
  assert.equal(payload.branchSync.aheadBy, 3);
  assert.equal(payload.branchSync.behindBy, 9);
  assert.equal(payload.branchSync.rollingPr, null);
  assert.equal(payload.branchSync.alarmed, true);
  assert.deepEqual(payload.branchSync.reasons.sort(), ['base-lag', 'stranded-no-pr']);
  assert.deepEqual(mutations(mock.calls), [], 'a GET must never mutate refs or open a PR');
});

test('GET with a rolling PR open alarms on base lag alone', async () => {
  const openPull = { html_url: 'https://github.example/pull/9' };
  const mock = makeStateMock({ ahead: 3, behind: 9, openPull });
  const payload = await (await handlerWith(mock)(stateRequest())).json();
  assert.equal(payload.branchSync.alarmed, true);
  assert.deepEqual(payload.branchSync.reasons, ['base-lag']);
  assert.equal(payload.branchSync.rollingPr, 'https://github.example/pull/9');
});

test('GET below the lag threshold with a rolling PR open does not alarm', async () => {
  const openPull = { html_url: 'https://github.example/pull/9' };
  const mock = makeStateMock({ ahead: 1, behind: 2, openPull });
  const payload = await (await handlerWith(mock)(stateRequest())).json();
  assert.equal(payload.branchSync.alarmed, false);
  assert.deepEqual(payload.branchSync.reasons, []);
});

/* ------------------------------------------------------------------------- *
 * GET freshens when it safely can (2026-09-07). Until this change only POST
 * called ensureBranchFresh, so a branch that was merely behind stayed behind
 * until somebody attested — and on 2026-09-04 nobody could, because the file
 * the queue is derived from existed only on the base. A behind-only branch is
 * exactly the case fast-forwarding cannot lose anything in, so the read path
 * takes it too; an AHEAD branch is still left alone.
 * ------------------------------------------------------------------------- */

test('GET fast-forwards a behind-only branch before reading it', async () => {
  const mock = makeStateMock({ ahead: 0, behind: 9 });
  const response = await handlerWith(mock)(stateRequest());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.branchSync.alarmed, false, 'freshening is not an alarm');
  assert.equal(payload.branchFresh.action, 'fast-forwarded');

  const patched = called(mock.calls, 'PATCH', `/git/refs/heads/${ATTEST}`);
  assert.equal(patched.length, 1, 'a behind-only branch carries nothing to lose');
  assert.deepEqual(patched[0].body, { sha: BASE_HEAD, force: false });

  const patchIndex = mock.calls.findIndex((c) => c.method === 'PATCH');
  const readIndex = mock.calls.findIndex((c) => c.method === 'GET' && c.url.includes('/contents/'));
  assert.ok(patchIndex < readIndex, 'freshen before reading the queue, not after');
});

test('GET leaves a branch holding unmerged attestations alone', async () => {
  const mock = makeStateMock({ ahead: 2, behind: 9, openPull: { html_url: 'https://github.example/pull/9' } });
  const payload = await (await handlerWith(mock)(stateRequest())).json();
  assert.equal(payload.branchFresh.action, 'pending');
  assert.equal(called(mock.calls, 'PATCH', '/git/refs/heads/').length, 0,
    'fast-forwarding an ahead branch would discard signed-off attestations');
});

test('a failed freshen on GET is advisory and still serves the queue', async () => {
  const mock = makeStateMock({ ahead: 0, behind: 9 });
  const base = mock.fetchImpl;
  const failing = {
    calls: mock.calls,
    fetchImpl: async (input, init = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (method === 'PATCH' && String(input).includes(`/git/refs/heads/${ATTEST}`)) {
        mock.calls.push({ url: String(input), method, body: null });
        return jsonResponse(500, { message: 'ref update unavailable' });
      }
      return base(input, init);
    },
  };
  const response = await handlerWith(failing)(stateRequest());
  assert.equal(response.status, 200, 'a freshen is an improvement to the read, not a gate on it');
  const payload = await response.json();
  assert.ok(Array.isArray(payload.items) && payload.items.length, 'the queue still loads');
  assert.deepEqual(payload.branchFresh, { action: 'error' });
});

test('GET flags attestations stranded with no open review request', async () => {
  // The 2026-09-04 state: five attestations on the branch, no rolling PR, and
  // nothing in the payload that said so until the console could load at all.
  const mock = makeStateMock({ ahead: 5, behind: 0 });
  const payload = await (await handlerWith(mock)(stateRequest())).json();
  assert.equal(payload.branchSync.aheadBy, 5);
  assert.equal(payload.branchSync.rollingPr, null);
  assert.equal(payload.branchSync.rollingPrChecked, true,
    '"looked, found none" must be distinguishable from "never looked"');
  assert.equal(payload.branchSync.branch, ATTEST);
  assert.equal(payload.branchSync.baseBranch, BASE);
  assert.deepEqual(payload.branchSync.reasons, ['stranded-no-pr']);
  assert.equal(called(mock.calls, 'GET', '/pulls').length, 1, 'one list call for the probe');
  assert.equal(called(mock.calls, 'POST', '/pulls').length, 0, 'a GET never opens one');
});

test('branch.ensure-pr opens the rolling review request on demand', async () => {
  const mock = makeMock({ ahead: 4, behind: 0 });
  const response = await handlerWith(mock)(ensurePrRequest());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.pullRequest, 'https://github.example/pull/1');
  assert.equal(called(mock.calls, 'POST', '/pulls').length, 1);
  assert.equal(called(mock.calls, 'PATCH', '/git/refs/heads/').length, 0, 'no ref is moved');
  assert.equal(called(mock.calls, 'PUT', '/contents/').length, 0, 'no file is written');
});

test('branch.ensure-pr reuses an open review request rather than opening a second', async () => {
  const mock = makeMock({ ahead: 4, openPull: { html_url: 'https://github.example/pull/7' } });
  const payload = await (await handlerWith(mock)(ensurePrRequest())).json();
  assert.equal(payload.pullRequest, 'https://github.example/pull/7');
  assert.equal(called(mock.calls, 'POST', '/pulls').length, 0);
});

test('ATTEST_BASE_LAG_ALARM overrides the lag threshold', async () => {
  const openPull = { html_url: 'https://github.example/pull/9' };
  const mock = makeStateMock({ ahead: 1, behind: 1, openPull });
  const payload = await (await handlerWith(mock, { ATTEST_BASE_LAG_ALARM: '1' })(stateRequest())).json();
  assert.equal(payload.branchSync.alarmed, true);
  assert.deepEqual(payload.branchSync.reasons, ['base-lag']);
  assert.equal(payload.branchSync.threshold, 1);
});

test('a failed probe degrades to an error marker without failing the load', async () => {
  const mock = makeStateMock({ ahead: 3, behind: 9, failCompare: true });
  const response = await handlerWith(mock)(stateRequest());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.items), 'the queue still loads');
  assert.deepEqual(payload.branchSync, { error: true });
});

test('GET carries the base lag as branchLag and verifies freshness at the branch head', async () => {
  const openPull = { html_url: 'https://github.example/pull/9' };
  const mock = makeStateMock({ ahead: 2, behind: 4, openPull });
  const payload = await (await handlerWith(mock)(stateRequest())).json();

  // A content hash compares a page to the ledger, both read from the attestation branch —
  // so an internally consistent queue can still be four commits behind what main ships.
  // That is a fact only the probe knows, and the payload has to carry it to the banner.
  assert.equal(payload.branchLag, 4);
  assert.equal(payload.freshness, 'verified');
  const item = payload.items.find(entry => entry.slug === 'anki.md');
  assert.equal(item.status, 'unreviewed', 'the pending fixture row is unchanged');
  assert.equal(Object.hasOwn(item, 'stale'), false, 'a pending row claims nothing about text');
});

test('a branch level with the base reports no lag', async () => {
  const mock = makeStateMock({ ahead: 0, behind: 0 });
  const payload = await (await handlerWith(mock)(stateRequest())).json();
  assert.equal(payload.branchLag, 0);
});

/* The UI half: a pure notice model the shell renders as a load-time banner.
 * Pinned here beside the probe so the wire format and its presentation cannot
 * drift apart. */
import {
  branchLagNotice,
  branchSyncNotice,
  freshnessNotice,
  shippedPagesNotice,
} from '../faculty-console/app.mjs';

test('the branch-lag banner names the branch, the base and the number of commits', () => {
  assert.equal(branchLagNotice(null), null);
  assert.equal(branchLagNotice({ branchLag: 0 }), null, 'a branch in sync says nothing');
  const notice = branchLagNotice({
    branchLag: 4,
    branchSync: { branch: ATTEST, baseBranch: BASE },
  });
  assert.equal(notice.tone, 'alert');
  assert.equal(
    notice.message,
    'attest/pending is 4 commits behind main — sync before re-attesting',
  );
  const single = branchLagNotice({
    branchLag: 1,
    branchSync: { branch: ATTEST, baseBranch: BASE },
  });
  assert.match(single.message, /is 1 commit behind/);
});

test('the freshness banner appears exactly when nothing could be checked', () => {
  assert.equal(freshnessNotice(null), null);
  assert.equal(freshnessNotice({ freshness: 'verified' }), null);
  const notice = freshnessNotice({ freshness: 'unknown' });
  assert.equal(notice.tone, 'muted');
  assert.equal(notice.message, 'Freshness unknown — reload');
});

test('no notice when the probe is absent, healthy, or non-isolated', () => {
  assert.equal(branchSyncNotice(undefined), null);
  assert.equal(branchSyncNotice(null), null);
  assert.equal(branchSyncNotice({ isolated: false, alarmed: false, reasons: [] }), null);
  assert.equal(branchSyncNotice({
    isolated: true, aheadBy: 1, behindBy: 2, rollingPr: 'https://github.example/pull/9',
    threshold: 3, reasons: [], alarmed: false,
  }), null);
});

test('a failed probe yields a quiet staleness caveat, not an alarm', () => {
  const notice = branchSyncNotice({ error: true });
  assert.equal(notice.tone, 'muted');
  assert.match(notice.message, /unavailable/i);
  assert.equal(notice.href, null);
});

test('the stranded-no-pr alarm names the branch and offers the repair', () => {
  const notice = branchSyncNotice({
    isolated: true, aheadBy: 3, behindBy: 9, rollingPr: null, rollingPrChecked: true,
    threshold: 3, reasons: ['stranded-no-pr', 'base-lag'], alarmed: true,
    branch: ATTEST, baseBranch: BASE,
  });
  assert.equal(notice.tone, 'alert');
  assert.match(notice.message, /3 attestations are on `attest\/pending`/);
  assert.match(notice.message, /no open review request/i);
  assert.match(notice.message, /press Reopen review request/);
  assert.match(notice.message, /9 commits behind main/);
  assert.match(notice.message, /queue below may be stale/i);
  assert.match(notice.message, /merge commit, not squash/i);
  assert.equal(notice.href, null);
  assert.equal(notice.action, 'ensure-pr', 'the alarm carries its own repair');
});

test('one stranded attestation reads in the singular and still offers the repair', () => {
  const notice = branchSyncNotice({
    isolated: true, aheadBy: 1, behindBy: 0, rollingPr: null, rollingPrChecked: true,
    threshold: 3, reasons: ['stranded-no-pr'], alarmed: true,
    branch: ATTEST, baseBranch: BASE,
  });
  assert.match(notice.message, /1 attestation is on `attest\/pending`/);
  assert.equal(notice.action, 'ensure-pr');
});

test('the derived-listing fallback is a one-line notice, not an alarm', () => {
  assert.equal(shippedPagesNotice(null), null);
  assert.equal(shippedPagesNotice({ shippedPagesSource: 'branch' }), null,
    'the ordinary case says nothing');
  const notice = shippedPagesNotice({
    shippedPagesSource: 'base',
    shippedPagesBranch: BASE,
  });
  assert.equal(notice.tone, 'muted');
  assert.match(notice.message, /Review queue derived from `main`/);
  assert.match(notice.message, /missing shipped_pages\.json/);
  assert.match(notice.message, /merge the rolling review request/i);
});

test('the base-lag alarm links the rolling pull request, https only', () => {
  const alarmed = {
    isolated: true, aheadBy: 1, behindBy: 4, rollingPr: 'https://github.example/pull/9',
    threshold: 3, reasons: ['base-lag'], alarmed: true,
  };
  const notice = branchSyncNotice(alarmed);
  assert.equal(notice.tone, 'alert');
  assert.match(notice.message, /1 unmerged attestation /);
  assert.equal(notice.href, 'https://github.example/pull/9');
  const insecure = branchSyncNotice({ ...alarmed, rollingPr: 'http://github.example/pull/9' });
  assert.equal(insecure.href, null, 'a non-https PR URL must not become a link');
});
