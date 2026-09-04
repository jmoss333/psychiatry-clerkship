import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  config,
  createHandler,
} from '../faculty-console/netlify/functions/attest.mjs';
import { itemRevision } from '../faculty-console/netlify/functions/qbank-actions.mjs';

const API_URL = 'https://faculty.example/api/attest';
const API_ORIGIN = new URL(API_URL).origin;
const FACULTY_KEY = 'synthetic-faculty-key';
const TOKEN = 'synthetic-github-token';
const MAX_BANK_BYTES = 4 * 1024 * 1024;
const REVIEWED_SHA = 'a'.repeat(40);
const MANIFEST_SHA = 'b'.repeat(40);
const QBANK_SHA = 'c'.repeat(40);
const SHIPPED_SHA = '7'.repeat(40);
const FIRST_WRITE_SHA = 'd'.repeat(40);
const SECOND_WRITE_SHA = 'e'.repeat(40);
const UNRELATED_RACE_SHA = 'f'.repeat(40);
const MANIFEST_RACE_SHA = '4'.repeat(40);
const SAME_ITEM_RACE_SHA = '1'.repeat(40);
const RETIREMENT_RACE_SHA = '2'.repeat(40);
const DELETION_RACE_SHA = '3'.repeat(40);
const BRANCH_HEAD_SHA = '6'.repeat(40);
const PARENT_TREE_SHA = '7'.repeat(40);
const FIRST_TREE_SHA = '8'.repeat(40);
const SECOND_TREE_SHA = '9'.repeat(40);
const FIRST_COMMIT_SHA = '0'.repeat(40);
const SECOND_COMMIT_SHA = '5'.repeat(40);
const MANIFEST_RACE_HEAD_SHA = 'a'.repeat(64);
const UNRELATED_RACE_HEAD_SHA = 'b'.repeat(64);
const SAME_ITEM_RACE_HEAD_SHA = 'c'.repeat(64);
const RETIREMENT_RACE_HEAD_SHA = 'd'.repeat(64);
const DELETION_RACE_HEAD_SHA = 'e'.repeat(64);
const MANIFEST_RACE_TREE_SHA = '1'.repeat(64);
const UNRELATED_RACE_TREE_SHA = '2'.repeat(64);
const SAME_ITEM_RACE_TREE_SHA = '3'.repeat(64);
const RETIREMENT_RACE_TREE_SHA = '4'.repeat(64);
const DELETION_RACE_TREE_SHA = '5'.repeat(64);
const UNRELATED_REVIEWED_SHA = '6'.repeat(64);

const REVIEWED_PATH = '13_Faculty_Resources/reviewed.json';
const MANIFEST_PATH = '13_Faculty_Resources/_automation/site_build/site_manifest.json';
const SHIPPED_PAGES_PATH = '13_Faculty_Resources/_automation/site_build/shipped_pages.json';
const QBANK_PATH = 'question_bank.json';

const confirmed = {
  clinical: true,
  evidence: true,
  originalityAndNoPhi: true,
};

const stems = [
  'A fictional inpatient reports persistent sadness, anhedonia, and guilt. What diagnosis best explains this syndrome?',
  'A fictional older adult develops fluctuating inattention after surgery. What syndrome is most likely?',
  'A fictional outpatient has elevated mood, little need for sleep, and pressured speech. What diagnosis best fits?',
];

function validItem({
  id = 'qb_moo_900',
  status = 'draft',
  correctKey = 'A',
  stem = stems[0],
} = {}) {
  const options = [
    { key: 'A', t: 'Major depressive disorder' },
    { key: 'B', t: 'Delirium' },
    { key: 'C', t: 'Mania' },
    { key: 'D', t: 'Adjustment disorder' },
  ].map(option => option.key === correctKey
    ? { ...option, c: true }
    : {
      ...option,
      trap: {
        name: `${option.key} discriminator`,
        note: `${option.t} does not match the defining fictional pattern.`,
      },
    });

  return {
    id,
    status,
    type: 'sba',
    category: 'mood',
    competency: ['dx'],
    difficulty: 2,
    hy: true,
    pages: ['t_mood.md'],
    link: { label: 'Open Mood Disorders', href: '?page=t_mood.md' },
    stem,
    options,
    why: 'The sustained fictional syndrome supports the keyed diagnosis.',
    pearl: 'Name the syndrome before choosing an answer.',
    evidence: 't_mood.md — fictional syndrome discriminator.',
    v2: { reserved: { keep: true } },
  };
}

function makeBank(items = [validItem()]) {
  return {
    _note: 'Synthetic handler fixture.',
    version: 1,
    items,
  };
}

// Task 1 (reviewed.schema.json) requires every ledger record to carry a valid `risk`,
// and Task 5's content-mutation handler now refuses to act on a slug whose current
// record lacks one — so every fixture record needs one, not only the ones exercised
// by Task 5's own new assertions. Kind/level are deliberately varied across the two
// slugs (clinical/high vs. general/low) so tests can tell them apart at a glance.
function defaultFiles(bank = makeBank([
  validItem(),
  validItem({ id: 'qb_moo_901', status: 'attested', correctKey: 'B', stem: stems[1] }),
  { ...validItem({ id: 'qb_moo_902', stem: stems[2] }), retired: true, retiredReason: 'Synthetic retirement.' },
])) {
  return {
    [REVIEWED_PATH]: {
      json: {
        't_mood.md': {
          status: 'reviewed',
          at: '2026-07-01',
          by: 'Synthetic Reviewer',
          risk: { kind: 'clinical', level: 'high' },
        },
        'mse-tool': {
          status: 'pending',
          at: '2026-07-02',
          by: 'Pending faculty review',
          risk: { kind: 'general', level: 'low' },
          reason: 'Synthetic review is pending',
        },
      },
      sha: REVIEWED_SHA,
    },
    [MANIFEST_PATH]: {
      json: {
        md: [['01_Core/t_mood.md', 't_mood.md', 'Mood Disorders']],
        tools: [['04_Assessment/mse.html', 'mse-tool', 'Mental Status Examination']],
      },
      sha: MANIFEST_SHA,
    },
    // The review queue comes from here now (ADR-002), not from the manifest. It mirrors
    // the manifest above so every pre-existing assertion sees the universe it was written
    // against; the Case-of-the-Week tests below add their own entries. The file must
    // always be readable — buildState fails closed on a missing listing rather than
    // silently shipping a short queue.
    [SHIPPED_PAGES_PATH]: {
      json: {
        version: 1,
        generated_from: {},
        pages: [
          {
            slug: 't_mood.md',
            kind: 'page',
            sites: ['ms3', 'res'],
            title: 'Mood Disorders',
            source: '01_Core/t_mood.md',
            producer: 'site_manifest',
          },
          {
            slug: 'mse-tool',
            kind: 'tool',
            sites: ['ms3', 'res'],
            title: 'Mental Status Examination',
            source: '04_Assessment/mse.html',
            producer: 'site_manifest',
          },
        ],
      },
      sha: SHIPPED_SHA,
    },
    [QBANK_PATH]: {
      json: bank,
      sha: QBANK_SHA,
    },
  };
}

// A richer variant of defaultFiles() for the assertions that specifically exercise
// preservation of internal ledger fields the browser must never see: `note` and the
// three reserved future content-hash fields (Task 1 schema; not consumed by any
// behavior yet, but must round-trip through attest/reopen untouched all the same).
function governedFiles() {
  const files = defaultFiles();
  files[REVIEWED_PATH].json['t_mood.md'] = {
    ...files[REVIEWED_PATH].json['t_mood.md'],
    note: 'Internal reviewer note — never exposed to the browser.',
    contentHash: 'a'.repeat(64),
    claimsHash: 'b'.repeat(64),
    evidenceHash: 'c'.repeat(64),
    evidenceThrough: '2026-06-01',
  };
  files[REVIEWED_PATH].json['mse-tool'] = {
    ...files[REVIEWED_PATH].json['mse-tool'],
    note: 'Internal reviewer note for the pending tool.',
    contentHash: 'd'.repeat(64),
    claimsHash: 'e'.repeat(64),
    evidenceHash: 'f'.repeat(64),
    evidenceThrough: '2026-06-02',
  };
  return files;
}

function clone(value) {
  return structuredClone(value);
}

function atomicBank(mock, index = 0) {
  return JSON.parse(Buffer.from(mock.blobBodies[index].content, 'base64').toString('utf8'));
}

function assertNoQbankWrite(mock) {
  assert.equal(mock.putBodies.length, 0);
  assert.equal(mock.blobBodies.length, 0);
  assert.equal(mock.treeBodies.length, 0);
  assert.equal(mock.commitBodies.length, 0);
  assert.equal(mock.refBodies.length, 0);
  assert.equal(mock.effectiveWrites.length, 0);
}

function fileSnapshot(files) {
  return Object.fromEntries(Object.entries(files).map(([path, file]) => [path, {
    json: clone(file.json),
    sha: file.sha,
  }]));
}

function jsonResponse(status, value, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function repositoryPath(url) {
  const marker = '/contents/';
  const pathname = new URL(url).pathname;
  const index = pathname.indexOf(marker);
  return index === -1 ? '' : decodeURIComponent(pathname.slice(index + marker.length));
}

function gitPath(url) {
  const marker = '/git/';
  const pathname = new URL(url).pathname;
  const index = pathname.indexOf(marker);
  return index === -1 ? '' : decodeURIComponent(pathname.slice(index + marker.length));
}

function createGithubMock({
  files = defaultFiles(),
  beforeRequest,
  onPut,
  onRefUpdate,
  afterRefUpdate,
} = {}) {
  const calls = [];
  const putBodies = [];
  const blobBodies = [];
  const treeBodies = [];
  const commitBodies = [];
  const refBodies = [];
  const effectiveWrites = [];
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  const fileTemplates = Object.fromEntries(
    Object.entries(files).map(([path, file]) => [path, { ...file }]),
  );
  const snapshots = new Map([[BRANCH_HEAD_SHA, fileSnapshot(files)]]);
  const commitTrees = new Map([[BRANCH_HEAD_SHA, PARENT_TREE_SHA]]);
  let putAttempt = 0;
  let branchHead = BRANCH_HEAD_SHA;
  let refAttempt = 0;

  function advanceBranch(
    mutate,
    sha = MANIFEST_RACE_HEAD_SHA,
    treeSha = MANIFEST_RACE_TREE_SHA,
  ) {
    mutate?.(files);
    branchHead = sha;
    commitTrees.set(sha, treeSha);
    snapshots.set(sha, fileSnapshot(files));
  }

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    const path = repositoryPath(url);
    const git = gitPath(url);
    const call = { url, method, headers, body: init.body, path, git };
    calls.push(call);

    const intercepted = await beforeRequest?.(call, {
      files,
      calls,
      putBodies,
      blobBodies,
      treeBodies,
      commitBodies,
      refBodies,
      effectiveWrites,
      advanceBranch,
    });
    if (intercepted) return intercepted;

    if (method === 'GET' && git === 'ref/heads/main') {
      return jsonResponse(200, { object: { type: 'commit', sha: branchHead } });
    }

    if (method === 'GET' && git.startsWith('commits/')) {
      const sha = git.slice('commits/'.length);
      const treeSha = commitTrees.get(sha);
      return treeSha
        ? jsonResponse(200, { sha, tree: { sha: treeSha } })
        : jsonResponse(404, { message: 'Synthetic commit not found.' });
    }

    if (method === 'POST' && git === 'blobs') {
      const body = JSON.parse(String(init.body));
      blobBodies.push(body);
      const sha = blobBodies.length === 1 ? FIRST_WRITE_SHA : SECOND_WRITE_SHA;
      blobs.set(sha, JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')));
      return jsonResponse(201, { sha });
    }

    if (method === 'POST' && git === 'trees') {
      const body = JSON.parse(String(init.body));
      treeBodies.push(body);
      const sha = treeBodies.length === 1 ? FIRST_TREE_SHA : SECOND_TREE_SHA;
      trees.set(sha, {
        baseTree: body.base_tree,
        blob: body.tree?.[0]?.sha,
      });
      return jsonResponse(201, { sha });
    }

    if (method === 'POST' && git === 'commits') {
      const body = JSON.parse(String(init.body));
      commitBodies.push(body);
      const sha = commitBodies.length === 1 ? FIRST_COMMIT_SHA : SECOND_COMMIT_SHA;
      const tree = trees.get(body.tree);
      commits.set(sha, {
        parent: body.parents?.[0],
        blob: tree?.blob,
        tree: body.tree,
      });
      commitTrees.set(sha, body.tree);
      return jsonResponse(201, {
        sha,
        html_url: `https://github.example/commit/${sha}`,
      });
    }

    if (method === 'PATCH' && git === 'refs/heads/main') {
      refAttempt += 1;
      const body = JSON.parse(String(init.body));
      refBodies.push(body);
      const interceptedRef = await onRefUpdate?.({
        attempt: refAttempt,
        call,
        body,
        files,
        advanceBranch,
        branchHead,
      });
      if (interceptedRef) return interceptedRef;

      const proposed = commits.get(body.sha);
      if (!proposed || body.force !== false || proposed.parent !== branchHead) {
        return jsonResponse(422, { message: 'Synthetic non-fast-forward ref update.' });
      }
      const bank = blobs.get(proposed.blob);
      files[QBANK_PATH].json = clone(bank);
      files[QBANK_PATH].sha = proposed.blob;
      branchHead = body.sha;
      snapshots.set(branchHead, fileSnapshot(files));
      effectiveWrites.push({ path: QBANK_PATH, sha: proposed.blob, head: branchHead });
      const overriddenResponse = await afterRefUpdate?.({
        attempt: refAttempt,
        call,
        body,
        files,
        branchHead,
      });
      if (overriddenResponse) return overriddenResponse;
      return jsonResponse(200, { object: { type: 'commit', sha: branchHead } });
    }

    const requestedRef = new URL(url).searchParams.get('ref');
    const snapshot = requestedRef ? snapshots.get(requestedRef) : null;
    const snapshotFile = snapshot?.[path];
    const currentFile = files[path];
    const template = currentFile || fileTemplates[path];
    const file = snapshot
      ? (snapshotFile && template
        ? { ...template, json: clone(snapshotFile.json), sha: snapshotFile.sha }
        : undefined)
      : currentFile;
    if (!file) return jsonResponse(404, { message: 'Synthetic file not found.' });

    if (method === 'GET') {
      if (headers.get('Accept') === 'application/vnd.github.raw+json') {
        const rawBody = file.rawBody ?? `${JSON.stringify(file.json, null, 2)}\n`;
        return new Response(rawBody, {
          status: file.rawStatus || 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(rawBody)),
          },
        });
      }

      if (file.objectResponse) return file.objectResponse();
      const rawBody = file.rawBody ?? `${JSON.stringify(file.json, null, 2)}\n`;
      const bytes = Buffer.from(rawBody, 'utf8');
      return jsonResponse(file.objectStatus || 200, {
        sha: file.sha,
        size: file.size ?? bytes.byteLength,
        encoding: file.encoding ?? (file.inline === false ? 'none' : 'base64'),
        content: file.inline === false ? '' : bytes.toString('base64'),
      });
    }

    if (method === 'PUT') {
      putAttempt += 1;
      const body = JSON.parse(String(init.body));
      putBodies.push({ path, body });
      const interceptedPut = await onPut?.({
        attempt: putAttempt,
        call,
        body,
        files,
        putBodies,
      });
      if (interceptedPut) return interceptedPut;

      const savedText = Buffer.from(body.content, 'base64').toString('utf8');
      file.json = JSON.parse(savedText);
      file.sha = putAttempt === 1 ? FIRST_WRITE_SHA : SECOND_WRITE_SHA;
      return jsonResponse(200, {
        content: { sha: file.sha },
        commit: { html_url: `https://github.example/commit/${putAttempt}` },
      });
    }

    return jsonResponse(405, { message: 'Synthetic method not allowed.' });
  };

  return {
    fetchImpl,
    calls,
    putBodies,
    blobBodies,
    treeBodies,
    commitBodies,
    refBodies,
    effectiveWrites,
    files,
  };
}

function handlerWith(mock, envOverrides = {}) {
  return createHandler({
    fetchImpl: mock.fetchImpl,
    env: {
      GITHUB_TOKEN: TOKEN,
      FACULTY_ATTEST_PASSWORD: FACULTY_KEY,
      GITHUB_REPO: 'synthetic/faculty-console',
      GIT_BRANCH: 'main',
      STUDENT_SITE_URL: 'https://students.example/',
      ATTESTER_NAME: 'Synthetic Reviewer',
      ...envOverrides,
    },
  });
}

function apiRequest(method, {
  body,
  key = FACULTY_KEY,
  origin = API_ORIGIN,
  url = API_URL,
  headers = {},
} = {}) {
  const requestHeaders = new Headers(headers);
  if (key !== null) requestHeaders.set('x-faculty-key', key);
  if (origin !== null) requestHeaders.set('Origin', origin);
  let requestBody;
  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
    requestBody = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(url, { method, headers: requestHeaders, body: requestBody });
}

async function expectError(response, {
  status,
  code,
  message,
}) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Vary'), 'Origin');
  const payload = await response.json();
  assert.equal(payload.error.code, code);
  assert.equal(typeof payload.error.message, 'string');
  if (message) assert.equal(payload.error.message, message);
  assert.equal(Object.hasOwn(payload.error, 'stack'), false);
  return payload;
}

/* Case-of-the-Week visibility (2026-09). cotw_registry.json became a second source of
   truth for what ships in July 2026; until this change the handler read only
   site_manifest.json, so the 22 built Case-of-the-Week pages never reached the console
   even though reviewed.json called every one of them pending. */

const COTW_WEEK = {
  date: '2026-08-31',
  topic: 'catatonia',
  label: 'Catatonia (Aug 31)',
  ms3_src: '2026-08-31_catatonia_MS3.md',
  res_src: '2026-08-31_catatonia_Resident.md',
};

// The two rows shipped_pages.py derives from one registry week.
function cotwPages(week = COTW_WEEK) {
  const stamp = week.date.replace(/-/g, '');
  return [['ms3', 'MS3', 'ms3_src'], ['res', 'Resident', 'res_src']].map(([level, label, key]) => ({
    slug: `cotw_${stamp}_${week.topic}_${level}.md`,
    kind: 'page',
    sites: [level],
    title: `${week.label} — ${label}`,
    source: `08_Cases_and_Simulation/case-of-the-week/${week[key]}`,
    producer: 'cotw_registry',
  }));
}

function cotwFiles(weeks = [COTW_WEEK]) {
  const files = defaultFiles();
  files[SHIPPED_PAGES_PATH].json.pages = [
    ...files[SHIPPED_PAGES_PATH].json.pages,
    ...weeks.flatMap(week => cotwPages(week)),
  ];
  files[REVIEWED_PATH].json['cotw_20260831_catatonia_ms3.md'] = {
    status: 'pending',
    at: '2026-08-31',
    by: 'Pending faculty review',
    risk: { kind: 'clinical', level: 'moderate' },
    reason: 'New content awaiting faculty review.',
    note: 'Internal note that must never reach the browser.',
  };
  files[REVIEWED_PATH].json['cotw_20260831_catatonia_res.md'] = {
    status: 'reviewed',
    at: '2026-09-01',
    by: 'Synthetic Reviewer',
    risk: { kind: 'clinical', level: 'moderate' },
  };
  return files;
}

test('GET surfaces both Case-of-the-Week twins with the site that serves each', async () => {
  const mock = createGithubMock({ files: cotwFiles() });
  const response = await handlerWith(mock)(apiRequest('GET'));
  assert.equal(response.status, 200);
  const payload = await response.json();

  // Manifest items first, unchanged, then the registry-derived twins.
  assert.deepEqual(payload.items.map(item => item.slug), [
    't_mood.md',
    'mse-tool',
    'cotw_20260831_catatonia_ms3.md',
    'cotw_20260831_catatonia_res.md',
  ]);
  const ms3 = payload.items.find(item => item.slug === 'cotw_20260831_catatonia_ms3.md');
  const res = payload.items.find(item => item.slug === 'cotw_20260831_catatonia_res.md');
  assert.deepEqual(ms3, {
    slug: 'cotw_20260831_catatonia_ms3.md',
    title: 'Catatonia (Aug 31) — MS3',
    kind: 'page',
    site: 'ms3',
    status: 'unreviewed',
    at: '2026-08-31',
    by: 'Pending faculty review',
    risk: { kind: 'clinical', level: 'moderate' },
    reason: 'New content awaiting faculty review.',
  });
  assert.equal(res.title, 'Catatonia (Aug 31) — Resident');
  assert.equal(res.site, 'res');
  assert.equal(res.status, 'reviewed');
  // Internal ledger fields still never cross the boundary.
  assert.equal(Object.hasOwn(ms3, 'note'), false);

  // Every manifest item keeps the MS3 site, and the counts include the new pages.
  assert.equal(payload.items.filter(item => item.site === 'ms3').length, 3);
  assert.equal(payload.counts.pagesTotal, 4);
  assert.equal(payload.counts.pagesReviewed, 2);
  // The revision of the listing the queue was built from, alongside the manifest's own.
  assert.equal(payload.shippedPagesRevision, SHIPPED_SHA);
  // manifestPages stays the manifest's own list: it gates question page anchors, which
  // Case-of-the-Week pages are not part of.
  assert.deepEqual(payload.manifestPages, ['t_mood.md']);
});

test('the resident base is defaulted in code and overridable by RESIDENT_SITE_URL', async () => {
  const mock = createGithubMock({ files: cotwFiles() });
  const payload = await (await handlerWith(mock)(apiRequest('GET'))).json();
  assert.equal(payload.student, 'https://students.example');
  assert.equal(payload.resident, 'https://mmc-psychiatry-residents-sanford.netlify.app');

  const overridden = createGithubMock({ files: cotwFiles() });
  const custom = await (await handlerWith(overridden, {
    RESIDENT_SITE_URL: 'https://residents.example/',
  })(apiRequest('GET'))).json();
  assert.equal(custom.resident, 'https://residents.example');

  const broken = createGithubMock({ files: cotwFiles() });
  await expectError(
    await handlerWith(broken, { RESIDENT_SITE_URL: 'javascript:alert(1)' })(apiRequest('GET')),
    { status: 500, code: 'server_configuration' },
  );
});

test('a Case-of-the-Week page attests through the ordinary single-slug write path', async () => {
  const mock = createGithubMock({ files: cotwFiles() });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: { target: 'content', changes: { 'cotw_20260831_catatonia_ms3.md': true } },
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.updated, 1);

  const saved = mock.files[REVIEWED_PATH].json;
  assert.equal(saved['cotw_20260831_catatonia_ms3.md'].status, 'reviewed');
  assert.equal(saved['cotw_20260831_catatonia_ms3.md'].by, 'Synthetic Reviewer');
  // The risk classification and the internal note are preserved; the pending reason goes.
  assert.deepEqual(saved['cotw_20260831_catatonia_ms3.md'].risk, { kind: 'clinical', level: 'moderate' });
  assert.equal(saved['cotw_20260831_catatonia_ms3.md'].note, 'Internal note that must never reach the browser.');
  assert.equal(Object.hasOwn(saved['cotw_20260831_catatonia_ms3.md'], 'reason'), false);
  // Its twin is untouched: one press attests exactly one slug, unchanged rule.
  assert.equal(saved['cotw_20260831_catatonia_res.md'].status, 'reviewed');
  assert.equal(saved['cotw_20260831_catatonia_res.md'].by, 'Synthetic Reviewer');
  assert.equal(saved['cotw_20260831_catatonia_res.md'].at, '2026-09-01');
});

test('a malformed or missing shipped_pages.json fails closed, never a short queue', async () => {
  const rows = () => defaultFiles()[SHIPPED_PAGES_PATH].json.pages;
  for (const mutate of [
    document => { document.version = 2; },
    document => { delete document.pages; },
    document => { document.pages = 'not-a-list'; },
    document => { document.pages = []; },
    document => { document.pages = [{ ...rows()[0], slug: '  ' }]; },
    document => { document.pages = [{ ...rows()[0], title: '' }]; },
    document => { document.pages = [{ ...rows()[0], kind: 'media' }]; },
    document => { document.pages = [{ ...rows()[0], sites: [] }]; },
    document => { document.pages = [{ ...rows()[0], sites: ['att'] }]; },
    document => { document.pages = [rows()[0], { ...rows()[0], title: 'Duplicate' }]; },
  ]) {
    const files = defaultFiles();
    mutate(files[SHIPPED_PAGES_PATH].json);
    const mock = createGithubMock({ files });
    await expectError(await handlerWith(mock)(apiRequest('GET')), {
      status: 502,
      code: 'repository_file_invalid',
    });
  }

  const missing = defaultFiles();
  delete missing[SHIPPED_PAGES_PATH];
  const mock = createGithubMock({ files: missing });
  const response = await handlerWith(mock)(apiRequest('GET'));
  assert.equal(response.ok, false);
  assert.notEqual(response.status, 200);
});

test('exports the Netlify v2 route and per-IP/domain rate limit', () => {
  assert.deepEqual(config, {
    path: '/api/attest',
    rateLimit: {
      windowLimit: 60,
      windowSize: 60,
      aggregateBy: ['ip', 'domain'],
    },
  });
});

test('deployment configuration selects Node 24 and CI runs on pushes to main', () => {
  const netlify = readFileSync(new URL('../faculty-console/netlify.toml', import.meta.url), 'utf8');
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(netlify, /\[build\.environment\][\s\S]*?NODE_VERSION\s*=\s*"24"/);
  assert.match(ci, /on:\s*\n\s+pull_request:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]\s*\n\s+workflow_dispatch:/);
});

test('static console deployment denies framing with CSP and a legacy fallback', () => {
  const netlify = readFileSync(new URL('../faculty-console/netlify.toml', import.meta.url), 'utf8');
  const headerValues = netlify.match(/\[headers\.values\]([\s\S]*?)(?=\n\[|$)/)?.[1] || '';
  assert.match(
    headerValues,
    /^\s*Content-Security-Policy\s*=\s*"frame-ancestors 'none'"\s*$/m,
  );
  assert.match(headerValues, /^\s*X-Frame-Options\s*=\s*"DENY"\s*$/m);
});

test('learner deployment allows framing only by the exact faculty console origin', () => {
  const buildScript = readFileSync(
    new URL('../13_Faculty_Resources/_automation/site_build/build_deploy.py', import.meta.url),
    'utf8',
  );
  const literal = buildScript.match(
    /open\(OUT\+"\/_headers","w",encoding="utf-8"\)\.write\(("(?:\\.|[^"\\])*")\)/,
  )?.[1];
  assert.ok(literal, 'the learner _headers payload should remain statically inspectable');

  const learnerHeaders = JSON.parse(literal);
  const expectedLearnerHeaders = `/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(self)
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; media-src 'self' blob: https://sp-interview-proxy.netlify.app; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://sp-interview-proxy.netlify.app; frame-src 'self'; frame-ancestors 'self' https://clerkship-faculty-attest.netlify.app
/*.html
  Cache-Control: public, max-age=0, must-revalidate
/content/*
  Cache-Control: public, max-age=0, must-revalidate
/audio/*
  Cache-Control: public, max-age=604800
/audio_oe/*
  Cache-Control: public, max-age=604800
/media/*
  Cache-Control: public, max-age=604800
/tools/quizzes.json
  Cache-Control: public, max-age=86400
/search-index.json
  Cache-Control: public, max-age=86400
/evidence_registry.json
  Cache-Control: public, max-age=0, must-revalidate
/tool_registry.json
  Cache-Control: public, max-age=0, must-revalidate
/tool-governance.json
  Cache-Control: public, max-age=0, must-revalidate
/communication_cases.json
  Cache-Control: public, max-age=0, must-revalidate
/reasoning_cases.json
  Cache-Control: public, max-age=0, must-revalidate
/family_systems_scenarios.json
  Cache-Control: public, max-age=0, must-revalidate
/governance.json
  Cache-Control: public, max-age=0, must-revalidate
/favicon.svg
  Cache-Control: public, max-age=604800
/sw.js
  Cache-Control: public, max-age=0, must-revalidate
`;
  assert.equal(learnerHeaders, expectedLearnerHeaders);

  const rootHeaders = learnerHeaders.match(/^\/\*\n([\s\S]*?)(?=^\/)/m)?.[1] || '';
  assert.match(rootHeaders, /^\s*X-Content-Type-Options: nosniff\s*$/m);
  assert.match(rootHeaders, /^\s*Referrer-Policy: strict-origin-when-cross-origin\s*$/m);
  assert.match(rootHeaders, /^\s*Permissions-Policy: geolocation=\(\), camera=\(\), microphone=\(self\)\s*$/m);
  assert.match(rootHeaders, /^\s*Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\s*$/m);
  assert.doesNotMatch(rootHeaders, /^\s*X-Frame-Options:/mi);

  const csp = rootHeaders.match(/^\s*Content-Security-Policy: (.+)$/m)?.[1];
  assert.equal(
    csp,
    "default-src 'self'; img-src 'self' data:; media-src 'self' blob: https://sp-interview-proxy.netlify.app; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://sp-interview-proxy.netlify.app; frame-src 'self'; frame-ancestors 'self' https://clerkship-faculty-attest.netlify.app",
  );
  assert.doesNotMatch(csp, /frame-ancestors[^;]*\*/);
});

test('rejects header auth before reading a POST body and never accepts a body key', async () => {
  const mock = createGithubMock();
  const handler = handlerWith(mock);
  const request = apiRequest('POST', {
    key: null,
    body: { key: FACULTY_KEY, target: 'content', changes: {} },
  });

  const response = await handler(request);

  await expectError(response, { status: 401, code: 'unauthorized' });
  assert.equal(request.bodyUsed, false);
  assert.equal(mock.calls.length, 0);
});

test('accepts exact same-origin requests and rejects a foreign origin before auth', async () => {
  const acceptedMock = createGithubMock();
  const accepted = await handlerWith(acceptedMock)(apiRequest('GET'));
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('Access-Control-Allow-Origin'), API_ORIGIN);
  assert.equal(accepted.headers.get('Cache-Control'), 'no-store');

  const rejectedMock = createGithubMock();
  const rejected = await handlerWith(rejectedMock)(apiRequest('POST', {
    key: null,
    origin: 'https://foreign.example',
    body: '{ definitely not json',
  }));
  await expectError(rejected, { status: 403, code: 'origin_not_allowed' });
  assert.equal(rejectedMock.calls.length, 0);
});

test('uses an exact ALLOWED_ORIGIN override without reflecting request origins', async () => {
  const allowedOrigin = 'https://console.example';
  const acceptedMock = createGithubMock();
  const accepted = await handlerWith(acceptedMock, { ALLOWED_ORIGIN: allowedOrigin })(apiRequest('GET', {
    origin: allowedOrigin,
    url: 'https://functions.example/api/attest',
  }));
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('Access-Control-Allow-Origin'), allowedOrigin);

  const rejectedMock = createGithubMock();
  const rejected = await handlerWith(rejectedMock, { ALLOWED_ORIGIN: allowedOrigin })(apiRequest('GET', {
    origin: API_ORIGIN,
  }));
  await expectError(rejected, { status: 403, code: 'origin_not_allowed' });
  assert.equal(rejected.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(rejectedMock.calls.length, 0);
});

test('malformed ALLOWED_ORIGIN rejects a foreign origin before auth or body access', async () => {
  const mock = createGithubMock();
  const handler = handlerWith(mock, { ALLOWED_ORIGIN: 'not an origin' });
  const request = apiRequest('POST', {
    key: null,
    origin: 'https://foreign.example',
    body: '{ invalid json that must remain unread',
  });

  const response = await handler(request);

  await expectError(response, { status: 403, code: 'origin_not_allowed' });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), API_ORIGIN);
  assert.equal(request.bodyUsed, false);
  assert.equal(mock.calls.length, 0);
});

test('malformed ALLOWED_ORIGIN returns generic unauthorized for a wrong key before body access', async () => {
  const mock = createGithubMock();
  const handler = handlerWith(mock, { ALLOWED_ORIGIN: 'not an origin' });
  const request = apiRequest('POST', {
    key: 'wrong-key',
    body: '{ invalid json that must remain unread',
  });

  const response = await handler(request);

  await expectError(response, { status: 401, code: 'unauthorized' });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), API_ORIGIN);
  assert.equal(request.bodyUsed, false);
  assert.equal(mock.calls.length, 0);
});

test('malformed ALLOWED_ORIGIN surfaces configuration error only after successful auth', async () => {
  const mock = createGithubMock();
  const handler = handlerWith(mock, { ALLOWED_ORIGIN: 'not an origin' });
  const request = apiRequest('POST', {
    body: '{ invalid json that must remain unread',
  });

  const response = await handler(request);

  await expectError(response, { status: 500, code: 'server_configuration' });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), API_ORIGIN);
  assert.equal(request.bodyUsed, false);
  assert.equal(mock.calls.length, 0);
});

test('returns no-store CORS headers for preflight and rejects foreign preflight origins', async () => {
  const mock = createGithubMock();
  const handler = handlerWith(mock);
  const accepted = await handler(apiRequest('OPTIONS', { key: null }));
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get('Cache-Control'), 'no-store');
  assert.equal(accepted.headers.get('Vary'), 'Origin');
  assert.equal(accepted.headers.get('Access-Control-Allow-Origin'), API_ORIGIN);

  const rejected = await handler(apiRequest('OPTIONS', {
    key: null,
    origin: 'https://foreign.example',
  }));
  await expectError(rejected, { status: 403, code: 'origin_not_allowed' });
  assert.equal(mock.calls.length, 0);
});

test('measures the 128 KiB POST limit in UTF-8 bytes before parsing', async () => {
  const mock = createGithubMock();
  const requestText = JSON.stringify({ padding: 'é'.repeat(65_536) });
  assert.ok(requestText.length < 128 * 1024);
  assert.ok(Buffer.byteLength(requestText) > 128 * 1024);

  const response = await handlerWith(mock)(apiRequest('POST', { body: requestText }));

  await expectError(response, { status: 413, code: 'payload_too_large' });
  assert.equal(mock.calls.length, 0);
});

test('returns complete active qbank items, stable revisions, assessments, manifest pages, and derived counts', async () => {
  const mock = createGithubMock();
  const response = await handlerWith(mock)(apiRequest('GET'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const payload = await response.json();

  assert.equal(payload.student, 'https://students.example');
  assert.equal(payload.manifestRevision, MANIFEST_SHA);
  assert.deepEqual(payload.manifestPages, ['t_mood.md']);
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items.find(item => item.slug === 't_mood.md')?.status, 'reviewed');
  assert.equal(payload.items.find(item => item.slug === 'mse-tool')?.status, 'unreviewed');
  assert.equal(mock.files[REVIEWED_PATH].json['mse-tool'].status, 'pending');
  assert.equal(payload.qbank.length, 2);
  assert.deepEqual(payload.qbank.map(item => item.id), ['qb_moo_900', 'qb_moo_901']);
  assert.equal(payload.qbank[0].stem, stems[0]);
  assert.equal(payload.qbank[0].options.length, 4);
  assert.equal(payload.qbank[0].why, 'The sustained fictional syndrome supports the keyed diagnosis.');
  assert.deepEqual(payload.qbank[0].v2, { reserved: { keep: true } });
  assert.equal(payload.qbank[0].revision, itemRevision(mock.files[QBANK_PATH].json.items[0]));
  assert.equal(payload.qbank[0].assessment.gate, 'ready');
  assert.deepEqual(payload.qbankSummary.counts, {
    total: 2,
    draft: 1,
    attested: 1,
    ready: 2,
    warning: 0,
    blocked: 0,
  });
  assert.deepEqual(payload.qbankSummary.answerKeys, { A: 1, B: 0, C: 0, D: 0 });
  assert.deepEqual(payload.qbankSummary.categoryAnswerKeys.mood, { A: 1, B: 0, C: 0, D: 0 });
  assert.equal(payload.counts.qbankTotal, 2);
  assert.equal(payload.counts.qbankAttested, 1);
  assert.equal(payload.qbankRevision, QBANK_SHA);
});

test('GET preserves unknown nonempty content status so the browser fails closed', async () => {
  const files = defaultFiles();
  files[REVIEWED_PATH].json['mse-tool'].status = 'legacy-reviewing';
  const mock = createGithubMock({ files });

  const response = await handlerWith(mock)(apiRequest('GET'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    payload.items.find(item => item.slug === 'mse-tool')?.status,
    'legacy-reviewing',
  );
  assert.equal(mock.files[REVIEWED_PATH].json['mse-tool'].status, 'legacy-reviewing');
});

test('falls back from the Contents object response to raw media without losing the blob SHA', async () => {
  const files = defaultFiles();
  files[QBANK_PATH].inline = false;
  const mock = createGithubMock({ files });

  const response = await handlerWith(mock)(apiRequest('GET'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.qbankRevision, QBANK_SHA);
  assert.equal(payload.qbank.length, 2);
  const qbankGets = mock.calls.filter(call => call.method === 'GET' && call.path === QBANK_PATH);
  assert.equal(qbankGets.length, 2);
  assert.equal(qbankGets[0].headers.get('Accept'), 'application/vnd.github+json');
  assert.equal(qbankGets[1].headers.get('Accept'), 'application/vnd.github.raw+json');
});

test('uses raw media whenever GitHub reports encoding none even if object content is populated', async () => {
  const files = defaultFiles();
  files[QBANK_PATH].encoding = 'none';
  const mock = createGithubMock({ files });

  const response = await handlerWith(mock)(apiRequest('GET'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.qbank.length, 2);
  const qbankGets = mock.calls.filter(call => call.method === 'GET' && call.path === QBANK_PATH);
  assert.equal(qbankGets.length, 2);
  assert.equal(qbankGets[1].headers.get('Accept'), 'application/vnd.github.raw+json');
});

for (const [name, sha] of [
  ['whitespace', ' '.repeat(40)],
  ['non-hex', 'g'.repeat(40)],
  ['39-character', 'a'.repeat(39)],
  ['65-character', 'a'.repeat(65)],
]) {
  test(`rejects a GitHub Contents object with a ${name} SHA`, async () => {
    const files = defaultFiles();
    files[QBANK_PATH].sha = sha;
    const mock = createGithubMock({ files });

    const response = await handlerWith(mock)(apiRequest('GET'));

    await expectError(response, { status: 502, code: 'github_response_invalid' });
    assertNoQbankWrite(mock);
  });
}

for (const [name, sha] of [
  ['whitespace', ' '.repeat(40)],
  ['non-hex', 'g'.repeat(40)],
  ['39-character', 'a'.repeat(39)],
  ['65-character', 'a'.repeat(65)],
]) {
  test(`rejects a manifest Contents object with a ${name} SHA`, async () => {
    const files = defaultFiles();
    files[MANIFEST_PATH].sha = sha;
    const mock = createGithubMock({ files });

    const response = await handlerWith(mock)(apiRequest('GET'));

    await expectError(response, { status: 502, code: 'github_response_invalid' });
    assertNoQbankWrite(mock);
  });
}

for (const [name, sha, expected] of [
  ['uppercase SHA-1', 'A'.repeat(40), 'a'.repeat(40)],
  ['uppercase SHA-256', 'B'.repeat(64), 'b'.repeat(64)],
]) {
  test(`accepts and normalizes a valid ${name} Contents object ID`, async () => {
    const files = defaultFiles();
    files[QBANK_PATH].sha = sha;
    const mock = createGithubMock({ files });

    const response = await handlerWith(mock)(apiRequest('GET'));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.qbankRevision, expected);
  });
}

for (const [name, sha, expected] of [
  ['uppercase SHA-1', 'C'.repeat(40), 'c'.repeat(40)],
  ['uppercase SHA-256', 'D'.repeat(64), 'd'.repeat(64)],
]) {
  test(`returns a normalized manifest revision for a valid ${name}`, async () => {
    const files = defaultFiles();
    files[MANIFEST_PATH].sha = sha;
    const mock = createGithubMock({ files });

    const response = await handlerWith(mock)(apiRequest('GET'));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.manifestRevision, expected);
  });
}

test('rejects a raw source bank over 4 MiB before attempting JSON parsing', async () => {
  const files = defaultFiles();
  files[QBANK_PATH].inline = false;
  files[QBANK_PATH].size = 0;
  files[QBANK_PATH].rawBody = 'x'.repeat(MAX_BANK_BYTES + 1);
  const mock = createGithubMock({ files });

  const response = await handlerWith(mock)(apiRequest('GET'));

  await expectError(response, { status: 413, code: 'qbank_too_large' });
  assert.equal(mock.calls.filter(call => call.path === QBANK_PATH).length, 2);
});

test('sets GitHub REST API version 2026-03-10 and common safety headers on every request', async () => {
  const item = validItem({ status: 'attested' });
  const files = defaultFiles(makeBank([item]));
  files[QBANK_PATH].inline = false;
  const mock = createGithubMock({ files });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness and anhedonia. What diagnosis best fits?';

  const getResponse = await handlerWith(mock)(apiRequest('GET'));
  assert.equal(getResponse.status, 200);
  const saveResponse = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
      attester: 'Synthetic Reviewer',
    },
  }));
  assert.equal(saveResponse.status, 200);

  assert.ok(mock.calls.length >= 7);
  for (const call of mock.calls) {
    assert.equal(call.headers.get('X-GitHub-Api-Version'), '2026-03-10');
    assert.equal(call.headers.get('Authorization'), `Bearer ${TOKEN}`);
    assert.equal(call.headers.get('User-Agent'), 'faculty-attest');
  }
});

for (const [name, manifestRevision] of [
  ['missing', undefined],
  ['blank', ' '.repeat(40)],
  ['non-hex', 'g'.repeat(40)],
  ['39-character', 'a'.repeat(39)],
  ['65-character', 'a'.repeat(65)],
  ['non-string', 7],
]) {
  test(`qbank.save-draft rejects a ${name} manifest revision before repository access`, async () => {
    const item = validItem({ status: 'attested' });
    const edited = clone(item);
    edited.stem = 'A revised fictional inpatient has sustained sadness. What diagnosis best fits?';
    const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });

    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        action: 'qbank.save-draft',
        manifestRevision,
        id: item.id,
        baseRevision: itemRevision(item),
        item: edited,
      },
    }));

    await expectError(response, { status: 400, code: 'qbank.invalid_input' });
    assert.equal(mock.calls.length, 0);
    assertNoQbankWrite(mock);
  });
}

test('qbank.save-draft compares manifest revisions case-insensitively after normalization', async () => {
  const item = validItem({ status: 'attested' });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness. What diagnosis best fits?';
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA.toUpperCase(),
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(mock.blobBodies.length, 1);
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 1);
});

test('qbank.save-draft rejects a first-attempt manifest mismatch without creating Git objects', async () => {
  const item = validItem({ status: 'attested' });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness. What diagnosis best fits?';
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: '4'.repeat(40),
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.calls.filter(call => call.path === QBANK_PATH).length, 1);
  assert.equal(mock.calls.filter(call => call.path === MANIFEST_PATH).length, 1);
  assertNoQbankWrite(mock);
});

test('qbank.save-draft rejects a manifest-only branch race without an effective write', async () => {
  const item = validItem({ status: 'attested' });
  const originalBank = makeBank([item]);
  const files = defaultFiles(originalBank);
  let raced = false;
  const mock = createGithubMock({
    files,
    onRefUpdate: ({ advanceBranch }) => {
      if (raced) return undefined;
      raced = true;
      advanceBranch(mutableFiles => {
        mutableFiles[MANIFEST_PATH].json.md[0][2] = 'Mood Disorders Updated Elsewhere';
        mutableFiles[MANIFEST_PATH].sha = MANIFEST_RACE_SHA;
      });
      return undefined;
    },
  });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(raced, true);
  assert.deepEqual(mock.files[QBANK_PATH].json, originalBank);
  assert.equal(mock.files[QBANK_PATH].sha, QBANK_SHA);
  assert.equal(mock.putBodies.length, 0);
  assert.equal(mock.commitBodies.length, 1);
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
});

test('qbank.save-draft preserves a stable-head ref validation failure without retrying', async () => {
  const item = validItem({ status: 'attested' });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness. What diagnosis best fits?';
  const mock = createGithubMock({
    files: defaultFiles(makeBank([item])),
    onRefUpdate: () => jsonResponse(422, { message: 'Synthetic branch rule rejection.' }),
  });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
    },
  }));

  await expectError(response, { status: 422, code: 'github_validation_failed' });
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
});

test('qbank.save-draft maps a missing current manifest to a safe conflict without leaking internals', async () => {
  const item = validItem({ status: 'attested' });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness. What diagnosis best fits?';
  const files = defaultFiles(makeBank([item]));
  delete files[MANIFEST_PATH];
  const mock = createGithubMock({ files });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
    },
  }));
  const payload = await expectError(response, { status: 409, code: 'qbank.conflict' });

  assert.equal(JSON.stringify(payload).includes('notFound'), false);
  assert.equal(mock.calls.filter(call => call.path === QBANK_PATH).length, 1);
  assert.equal(mock.calls.filter(call => call.path === MANIFEST_PATH).length, 1);
  assertNoQbankWrite(mock);
});

test('qbank.save-draft preserves a non-404 manifest read failure', async () => {
  const item = validItem({ status: 'attested' });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness. What diagnosis best fits?';
  const mock = createGithubMock({
    files: defaultFiles(makeBank([item])),
    beforeRequest: call => (
      call.method === 'GET' && call.path === MANIFEST_PATH
        ? jsonResponse(403, { message: 'Synthetic upstream details must not escape.' })
        : undefined
    ),
  });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
    },
  }));

  await expectError(response, { status: 403, code: 'github_forbidden' });
  assertNoQbankWrite(mock);
});

test('qbank.save-draft performs one atomic Git commit and returns the saved item revision and assessment', async () => {
  const item = validItem({ status: 'attested' });
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness and anhedonia. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
      attester: 'Synthetic Reviewer',
    },
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.action, 'qbank.save-draft');
  assert.equal(payload.updated, 1);
  assert.match(payload.commit, /^https:\/\/github\.example\/commit\//);
  assert.match(payload.revision, /^[a-f0-9]{64}$/);
  assert.equal(payload.assessment.gate, 'ready');
  assert.equal(mock.putBodies.length, 0);
  assert.equal(mock.blobBodies.length, 1);
  assert.equal(mock.treeBodies.length, 1);
  assert.equal(mock.commitBodies.length, 1);
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 1);
  const saved = atomicBank(mock);
  assert.equal(saved.items[0].stem, edited.stem);
  assert.equal(saved.items[0].status, 'draft');
  assert.equal(payload.revision, itemRevision(saved.items[0]));
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === QBANK_PATH).length, 1);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === MANIFEST_PATH).length, 1);
  assert.equal(new URL(mock.calls.find(call => call.path === QBANK_PATH).url).searchParams.get('ref'), BRANCH_HEAD_SHA);
  assert.equal(new URL(mock.calls.find(call => call.path === MANIFEST_PATH).url).searchParams.get('ref'), BRANCH_HEAD_SHA);
  assert.deepEqual(mock.blobBodies[0], {
    content: mock.blobBodies[0].content,
    encoding: 'base64',
  });
  assert.deepEqual(mock.treeBodies[0], {
    base_tree: PARENT_TREE_SHA,
    tree: [{ path: QBANK_PATH, mode: '100644', type: 'blob', sha: FIRST_WRITE_SHA }],
  });
  assert.equal(mock.commitBodies[0].tree, FIRST_TREE_SHA);
  assert.deepEqual(mock.commitBodies[0].parents, [BRANCH_HEAD_SHA]);
  assert.match(mock.commitBodies[0].message, /^qbank: save draft qb_moo_900 by Synthetic Reviewer/);
  assert.deepEqual(mock.refBodies[0], { sha: FIRST_COMMIT_SHA, force: false });
});

test('qbank.attest performs one atomic Git commit and returns stable target revisions and assessments', async () => {
  const first = validItem({ id: 'qb_moo_900', stem: stems[0] });
  const second = validItem({ id: 'qb_moo_901', correctKey: 'B', stem: stems[1] });
  const firstRevision = itemRevision(first);
  const secondRevision = itemRevision(second);
  const mock = createGithubMock({ files: defaultFiles(makeBank([first, second])) });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest',
      manifestRevision: MANIFEST_SHA,
      items: [
        { id: first.id, revision: firstRevision, reviewedRevision: firstRevision },
        { id: second.id, revision: secondRevision, reviewedRevision: secondRevision },
      ],
      confirmations: confirmed,
      attester: 'Synthetic Reviewer',
    },
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.action, 'qbank.attest');
  assert.equal(payload.updated, 2);
  assert.equal(mock.putBodies.length, 0);
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 1);
  const saved = atomicBank(mock);
  assert.equal(saved.items[0].status, 'attested');
  assert.equal(saved.items[1].status, 'attested');
  assert.equal(payload.revision[first.id], itemRevision(saved.items[0]));
  assert.equal(payload.revision[second.id], itemRevision(saved.items[1]));
  assert.deepEqual(Object.keys(payload.revision), [first.id, second.id]);
  assert.equal(payload.assessment[first.id].gate, 'ready');
  assert.equal(payload.assessment[second.id].gate, 'ready');
});

test('qbank.attest rejects a legacy green request without reviewed-revision evidence', async () => {
  const item = validItem();
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest',
      manifestRevision: MANIFEST_SHA,
      items: [{ id: item.id, revision: itemRevision(item) }],
      confirmations: confirmed,
      attester: 'Synthetic Reviewer',
    },
  }));

  await expectError(response, { status: 422, code: 'attest.review_required' });
  assertNoQbankWrite(mock);
});

test('qbank.attest rejects a legacy warning request without reviewed-revision evidence', async () => {
  const item = validItem({
    stem: 'A fictional patient has sustained low mood. Which diagnosis is NOT most likely?',
  });
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest', manifestRevision: MANIFEST_SHA,
      items: [{
        id: item.id, revision: itemRevision(item),
        acknowledgedWarnings: ['stem.negative_lead_in'],
      }],
      confirmations: confirmed, attester: 'Synthetic Reviewer',
    },
  }));
  await expectError(response, { status: 422, code: 'attest.review_required' });
  assertNoQbankWrite(mock);
});

test('qbank.attest requires the loaded manifest revision before repository access', async () => {
  const item = validItem();
  const revision = itemRevision(item);
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest',
      items: [{ id: item.id, revision, reviewedRevision: revision }],
      confirmations: confirmed,
    },
  }));

  await expectError(response, { status: 400, code: 'qbank.invalid_input' });
  assert.equal(mock.calls.length, 0);
  assertNoQbankWrite(mock);
});

test('retries one atomic ref conflict after an unrelated-item race and preserves the unrelated update', async () => {
  const target = validItem({ status: 'attested' });
  const unrelated = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const files = defaultFiles(makeBank([target, unrelated]));
  const mock = createGithubMock({
    files,
    onRefUpdate: ({ attempt, advanceBranch }) => {
      if (attempt !== 1) return undefined;
      advanceBranch(mutableFiles => {
        mutableFiles[QBANK_PATH].json.items[1].pearl = 'An unrelated faculty edit won the first race.';
        mutableFiles[QBANK_PATH].sha = UNRELATED_RACE_SHA;
        mutableFiles[REVIEWED_PATH].json['t_mood.md'].by = 'Concurrent Content Reviewer';
        mutableFiles[REVIEWED_PATH].sha = UNRELATED_REVIEWED_SHA;
      }, UNRELATED_RACE_HEAD_SHA, UNRELATED_RACE_TREE_SHA);
      return undefined;
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
      attester: 'Synthetic Reviewer',
    },
  }));
  assert.equal(response.status, 200);
  assert.equal(mock.blobBodies.length, 2);
  assert.equal(mock.refBodies.length, 2);
  assert.equal(mock.effectiveWrites.length, 1);
  assert.deepEqual(mock.commitBodies[1].parents, [UNRELATED_RACE_HEAD_SHA]);
  assert.equal(mock.treeBodies[1].base_tree, UNRELATED_RACE_TREE_SHA);
  const retriedBank = atomicBank(mock, 1);
  assert.equal(retriedBank.items[0].stem, edited.stem);
  assert.equal(retriedBank.items[1].pearl, 'An unrelated faculty edit won the first race.');
  assert.equal(mock.files[REVIEWED_PATH].json['t_mood.md'].by, 'Concurrent Content Reviewer');
  assert.equal(mock.files[REVIEWED_PATH].sha, UNRELATED_REVIEWED_SHA);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === QBANK_PATH).length, 2);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === MANIFEST_PATH).length, 2);
});

test('returns a conflict with no second ref update when the manifest drifts during a qbank retry', async () => {
  const target = validItem({ status: 'attested' });
  const unrelated = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const files = defaultFiles(makeBank([target, unrelated]));
  const mock = createGithubMock({
    files,
    onRefUpdate: ({ attempt, advanceBranch }) => {
      if (attempt !== 1) return undefined;
      advanceBranch(mutableFiles => {
        mutableFiles[QBANK_PATH].json.items[1].pearl = 'An unrelated edit caused the retry.';
        mutableFiles[QBANK_PATH].sha = UNRELATED_RACE_SHA;
        mutableFiles[MANIFEST_PATH].sha = '5'.repeat(40);
      }, UNRELATED_RACE_HEAD_SHA, UNRELATED_RACE_TREE_SHA);
      return undefined;
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === QBANK_PATH).length, 2);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === MANIFEST_PATH).length, 2);
});

test('returns a conflict with no second ref update when the manifest is removed during a qbank retry', async () => {
  const target = validItem({ status: 'attested' });
  const unrelated = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const files = defaultFiles(makeBank([target, unrelated]));
  const mock = createGithubMock({
    files,
    onRefUpdate: ({ attempt, advanceBranch }) => {
      if (attempt !== 1) return undefined;
      advanceBranch(mutableFiles => {
        mutableFiles[QBANK_PATH].json.items[1].pearl = 'An unrelated edit caused the retry.';
        mutableFiles[QBANK_PATH].sha = UNRELATED_RACE_SHA;
        delete mutableFiles[MANIFEST_PATH];
      }, UNRELATED_RACE_HEAD_SHA, UNRELATED_RACE_TREE_SHA);
      return undefined;
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === QBANK_PATH).length, 2);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === MANIFEST_PATH).length, 2);
});

test('validates the retry manifest before a second atomic write', async () => {
  const target = validItem({ status: 'attested' });
  const unrelated = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const files = defaultFiles(makeBank([target, unrelated]));
  const mock = createGithubMock({
    files,
    onRefUpdate: ({ attempt, advanceBranch }) => {
      if (attempt !== 1) return undefined;
      advanceBranch(mutableFiles => {
        mutableFiles[QBANK_PATH].json.items[1].pearl = 'An unrelated edit caused the retry.';
        mutableFiles[QBANK_PATH].sha = UNRELATED_RACE_SHA;
        mutableFiles[MANIFEST_PATH].json = { md: 'not-an-array', tools: [] };
      }, UNRELATED_RACE_HEAD_SHA, UNRELATED_RACE_TREE_SHA);
      return undefined;
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
    },
  }));

  await expectError(response, { status: 502, code: 'repository_file_invalid' });
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === MANIFEST_PATH).length, 2);
});

test('preserves a non-404 manifest failure during a qbank retry', async () => {
  const target = validItem({ status: 'attested' });
  const unrelated = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const files = defaultFiles(makeBank([target, unrelated]));
  let firstRefFailed = false;
  const mock = createGithubMock({
    files,
    beforeRequest: call => (
      firstRefFailed && call.method === 'GET' && call.path === MANIFEST_PATH
        ? jsonResponse(403, { message: 'Synthetic upstream details must not escape.' })
        : undefined
    ),
    onRefUpdate: ({ attempt, advanceBranch }) => {
      if (attempt !== 1) return undefined;
      firstRefFailed = true;
      advanceBranch(mutableFiles => {
        mutableFiles[QBANK_PATH].json.items[1].pearl = 'An unrelated edit caused the retry.';
        mutableFiles[QBANK_PATH].sha = UNRELATED_RACE_SHA;
      }, UNRELATED_RACE_HEAD_SHA, UNRELATED_RACE_TREE_SHA);
      return undefined;
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
    },
  }));

  await expectError(response, { status: 403, code: 'github_forbidden' });
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === MANIFEST_PATH).length, 2);
});

test('returns a same-item conflict with no second ref update when the target changes during a race', async () => {
  const target = validItem({ status: 'attested' });
  const files = defaultFiles(makeBank([target]));
  const mock = createGithubMock({
    files,
    onRefUpdate: ({ attempt, advanceBranch }) => {
      if (attempt !== 1) return undefined;
      advanceBranch(mutableFiles => {
        mutableFiles[QBANK_PATH].json.items[0].pearl = 'A competing edit changed this same item.';
        mutableFiles[QBANK_PATH].sha = SAME_ITEM_RACE_SHA;
      }, SAME_ITEM_RACE_HEAD_SHA, SAME_ITEM_RACE_TREE_SHA);
      return undefined;
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === QBANK_PATH).length, 2);
  assert.equal(mock.calls.filter(call => call.method === 'GET' && call.path === MANIFEST_PATH).length, 2);
});

test('normalizes target retirement during a save retry to a conflict with no second ref update', async () => {
  const target = validItem({ status: 'attested' });
  const files = defaultFiles(makeBank([target]));
  const mock = createGithubMock({
    files,
    onRefUpdate: ({ attempt, advanceBranch }) => {
      if (attempt !== 1) return undefined;
      advanceBranch(mutableFiles => {
        mutableFiles[QBANK_PATH].json.items[0].retired = true;
        mutableFiles[QBANK_PATH].json.items[0].retiredReason = 'Retired during the synthetic race.';
        mutableFiles[QBANK_PATH].sha = RETIREMENT_RACE_SHA;
      }, RETIREMENT_RACE_HEAD_SHA, RETIREMENT_RACE_TREE_SHA);
      return undefined;
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
});

test('normalizes deletion of any attestation target during retry to one atomic conflict', async () => {
  const first = validItem();
  const second = validItem({ id: 'qb_moo_901', correctKey: 'B', stem: stems[1] });
  const files = defaultFiles(makeBank([first, second]));
  const mock = createGithubMock({
    files,
    onRefUpdate: ({ attempt, advanceBranch }) => {
      if (attempt !== 1) return undefined;
      advanceBranch(mutableFiles => {
        mutableFiles[QBANK_PATH].json.items = [mutableFiles[QBANK_PATH].json.items[0]];
        mutableFiles[QBANK_PATH].sha = DELETION_RACE_SHA;
      }, DELETION_RACE_HEAD_SHA, DELETION_RACE_TREE_SHA);
      return undefined;
    },
  });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest',
      manifestRevision: MANIFEST_SHA,
      items: [
        { id: first.id, revision: itemRevision(first), reviewedRevision: itemRevision(first) },
        { id: second.id, revision: itemRevision(second), reviewedRevision: itemRevision(second) },
      ],
      confirmations: confirmed,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.refBodies.length, 1);
  assert.equal(mock.effectiveWrites.length, 0);
});

for (const [name, intercept] of [
  [
    'head response missing its object',
    call => call.method === 'GET' && call.git === 'ref/heads/main'
      ? jsonResponse(200, {})
      : undefined,
  ],
  [
    'head response with a non-commit object',
    call => call.method === 'GET' && call.git === 'ref/heads/main'
      ? jsonResponse(200, { object: { type: 'blob', sha: BRANCH_HEAD_SHA } })
      : undefined,
  ],
  [
    'head response with an invalid SHA',
    call => call.method === 'GET' && call.git === 'ref/heads/main'
      ? jsonResponse(200, { object: { type: 'commit', sha: 'g'.repeat(40) } })
      : undefined,
  ],
  [
    'parent commit response with a mismatched SHA',
    call => call.method === 'GET' && call.git === `commits/${BRANCH_HEAD_SHA}`
      ? jsonResponse(200, { sha: SECOND_COMMIT_SHA, tree: { sha: PARENT_TREE_SHA } })
      : undefined,
  ],
  [
    'parent commit response missing its tree',
    call => call.method === 'GET' && call.git === `commits/${BRANCH_HEAD_SHA}`
      ? jsonResponse(200, { sha: BRANCH_HEAD_SHA })
      : undefined,
  ],
  [
    'parent commit response with an invalid tree SHA',
    call => call.method === 'GET' && call.git === `commits/${BRANCH_HEAD_SHA}`
      ? jsonResponse(200, { sha: BRANCH_HEAD_SHA, tree: { sha: 'g'.repeat(40) } })
      : undefined,
  ],
  [
    'created tree response missing its SHA',
    call => call.method === 'POST' && call.git === 'trees'
      ? jsonResponse(201, {})
      : undefined,
  ],
  [
    'created tree response with an invalid SHA',
    call => call.method === 'POST' && call.git === 'trees'
      ? jsonResponse(201, { sha: 'g'.repeat(40) })
      : undefined,
  ],
]) {
  test(`rejects a malformed Git ${name}`, async () => {
    const item = validItem({ status: 'attested' });
    const edited = clone(item);
    edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';
    const mock = createGithubMock({
      files: defaultFiles(makeBank([item])),
      beforeRequest: intercept,
    });

    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        action: 'qbank.save-draft',
        manifestRevision: MANIFEST_SHA,
        id: item.id,
        baseRevision: itemRevision(item),
        item: edited,
      },
    }));

    await expectError(response, { status: 502, code: 'github_response_invalid' });
    assert.equal(mock.refBodies.length, 0);
    assert.equal(mock.effectiveWrites.length, 0);
  });
}

for (const [name, githubPayload] of [
  ['missing commit SHA and URL', {}],
  ['missing commit URL', { sha: FIRST_COMMIT_SHA }],
  ['missing commit SHA', { html_url: 'https://github.example/commit/written' }],
  ['invalid commit SHA', { sha: 'g'.repeat(40), html_url: 'https://github.example/commit/written' }],
  ['commit SHA equal to its parent', { sha: BRANCH_HEAD_SHA, html_url: 'https://github.example/commit/written' }],
  ['non-HTTPS commit URL', { sha: FIRST_COMMIT_SHA, html_url: 'http://github.example/commit/written' }],
  ['malformed commit URL', { sha: FIRST_COMMIT_SHA, html_url: 'not a URL' }],
]) {
  test(`rejects a successful Git commit response with ${name}`, async () => {
    const item = validItem({ status: 'attested' });
    const edited = clone(item);
    edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';
    const mock = createGithubMock({
      files: defaultFiles(makeBank([item])),
      beforeRequest: call => (
        call.method === 'POST' && call.git === 'commits'
          ? jsonResponse(201, githubPayload)
          : undefined
      ),
    });

    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        action: 'qbank.save-draft',
        manifestRevision: MANIFEST_SHA,
        id: item.id,
        baseRevision: itemRevision(item),
        item: edited,
      },
    }));

    await expectError(response, { status: 502, code: 'github_response_invalid' });
    assert.equal(mock.calls.filter(call => call.method === 'POST' && call.git === 'commits').length, 1);
    assert.equal(mock.refBodies.length, 0);
    assert.equal(mock.effectiveWrites.length, 0);
  });
}

for (const [name, receiptSha] of [
  ['unchanged', QBANK_SHA],
  ['case-only unchanged', QBANK_SHA.toUpperCase()],
  ['whitespace', ' '.repeat(40)],
  ['non-hex', 'g'.repeat(40)],
  ['wrong-length', 'a'.repeat(39)],
]) {
  test(`rejects a successful Git blob response with a ${name} SHA`, async () => {
    const item = validItem({ status: 'attested' });
    const edited = clone(item);
    edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';
    const mock = createGithubMock({
      files: defaultFiles(makeBank([item])),
      beforeRequest: call => (
        call.method === 'POST' && call.git === 'blobs'
          ? jsonResponse(201, { sha: receiptSha })
          : undefined
      ),
    });

    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        action: 'qbank.save-draft',
        manifestRevision: MANIFEST_SHA,
        id: item.id,
        baseRevision: itemRevision(item),
        item: edited,
      },
    }));

    await expectError(response, { status: 502, code: 'github_response_invalid' });
    const blobCall = mock.calls.find(call => call.method === 'POST' && call.git === 'blobs');
    const blobRequest = JSON.parse(blobCall.body);
    assert.equal(blobRequest.encoding, 'base64');
    assert.equal(JSON.parse(Buffer.from(blobRequest.content, 'base64').toString('utf8')).items[0].stem, edited.stem);
    assert.equal(mock.refBodies.length, 0);
    assert.equal(mock.effectiveWrites.length, 0);
  });
}

for (const [name, refPayload] of [
  ['missing object', {}],
  ['wrong object type', { object: { type: 'blob', sha: FIRST_COMMIT_SHA } }],
  ['wrong commit SHA', { object: { type: 'commit', sha: SECOND_COMMIT_SHA } }],
]) {
  test(`rejects a successful Git ref response with ${name}`, async () => {
    const item = validItem({ status: 'attested' });
    const edited = clone(item);
    edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';
    const mock = createGithubMock({
      files: defaultFiles(makeBank([item])),
      afterRefUpdate: () => jsonResponse(200, refPayload),
    });

    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        action: 'qbank.save-draft',
        manifestRevision: MANIFEST_SHA,
        id: item.id,
        baseRevision: itemRevision(item),
        item: edited,
      },
    }));

    await expectError(response, { status: 502, code: 'github_response_invalid' });
    assert.equal(mock.refBodies.length, 1);
    assert.equal(mock.effectiveWrites.length, 1);
    assert.equal(mock.files[QBANK_PATH].json.items[0].stem, edited.stem);
  });
}

test('rejects the legacy qbank status-toggle target without reading repository data', async () => {
  const mock = createGithubMock();
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: { target: 'qbank', changes: { qb_moo_900: true } },
  }));

  await expectError(response, { status: 400, code: 'legacy_qbank_action' });
  assert.equal(mock.calls.length, 0);
});

for (const [status, code] of [
  [403, 'github_forbidden'],
  [409, 'github_conflict'],
  [422, 'github_validation_failed'],
  [429, 'github_rate_limited'],
]) {
  test(`maps GitHub ${status} to stable ${code} JSON without upstream details`, async () => {
    const mock = createGithubMock({
      beforeRequest: () => new Response(`upstream secret for ${status}`, { status }),
    });
    const response = await handlerWith(mock)(apiRequest('GET'));
    const payload = await expectError(response, { status, code });
    assert.equal(JSON.stringify(payload).includes('upstream secret'), false);
    assert.equal(JSON.stringify(payload).includes(TOKEN), false);
  });
}

test('maps network exceptions to a generic stable JSON error without secrets or stacks', async () => {
  const mock = createGithubMock({
    beforeRequest: () => {
      throw new Error(`socket failed with ${TOKEN}`);
    },
  });
  const response = await handlerWith(mock)(apiRequest('GET'));
  const payload = await expectError(response, { status: 502, code: 'github_unavailable' });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes('socket failed'), false);
});

test('qbank and content no-op requests perform no commit', async () => {
  const item = validItem();
  const qbankMock = createGithubMock({ files: defaultFiles(makeBank([item])) });
  const qbankResponse = await handlerWith(qbankMock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: item.id,
      baseRevision: itemRevision(item),
      item: clone(item),
    },
  }));
  await expectError(qbankResponse, { status: 422, code: 'qbank.no_changes' });
  assertNoQbankWrite(qbankMock);

  const contentMock = createGithubMock();
  const contentResponse = await handlerWith(contentMock)(apiRequest('POST', {
    body: { target: 'content', changes: {}, attester: 'Synthetic Reviewer' },
  }));
  assert.equal(contentResponse.status, 200);
  assert.deepEqual(await contentResponse.json(), {
    ok: true,
    target: 'content',
    updated: 0,
    commit: null,
  });
  assert.equal(contentMock.calls.length, 0);

  const semanticMock = createGithubMock();
  const semanticResponse = await handlerWith(semanticMock)(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': true, 'mse-tool': false },
      attester: 'Different Synthetic Reviewer',
    },
  }));
  assert.equal(semanticResponse.status, 200);
  assert.deepEqual(await semanticResponse.json(), {
    ok: true,
    target: 'content',
    updated: 0,
    commit: null,
  });
  assert.equal(semanticMock.putBodies.length, 0);
  assert.equal(semanticMock.calls.filter(call => call.method === 'GET').length, 1);
});

test('reopen preserves legacy pending storage and returns canonical unreviewed state', async () => {
  const mock = createGithubMock();
  const handler = handlerWith(mock);
  const response = await handler(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': false, 'mse-tool': true },
      reasons: { 't_mood.md': 'Routine periodic re-review.' },
      attester: 'Synthetic Reviewer',
    },
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    target: 'content',
    updated: 2,
    commit: 'https://github.example/commit/1',
  });
  assert.equal(mock.putBodies.length, 1);
  assert.equal(mock.putBodies[0].path, REVIEWED_PATH);
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  assert.equal(saved['t_mood.md'].status, 'pending');
  assert.equal(saved['t_mood.md'].reason, 'Routine periodic re-review.');
  assert.deepEqual(saved['t_mood.md'].risk, { kind: 'clinical', level: 'high' });
  assert.equal(saved['mse-tool'].status, 'reviewed');
  assert.equal(saved['mse-tool'].by, 'Synthetic Reviewer');
  assert.deepEqual(saved['mse-tool'].risk, { kind: 'general', level: 'low' });
  assert.equal(Object.hasOwn(saved['mse-tool'], 'reason'), false);
  assert.equal(mock.files[REVIEWED_PATH].json['t_mood.md'].status, 'pending');

  const refreshed = await handler(apiRequest('GET'));
  const refreshedPayload = await refreshed.json();
  assert.equal(refreshed.status, 200);
  assert.equal(
    refreshedPayload.items.find(item => item.slug === 't_mood.md')?.status,
    'unreviewed',
  );
  assert.equal(mock.files[REVIEWED_PATH].json['t_mood.md'].status, 'pending');
});

test('GET returns risk and pending reason but never internal note or hash fields', async () => {
  const mock = createGithubMock({ files: governedFiles() });
  const response = await handlerWith(mock)(apiRequest('GET'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  const page = payload.items.find(item => item.slug === 't_mood.md');
  const tool = payload.items.find(item => item.slug === 'mse-tool');
  assert.deepEqual(page.risk, { kind: 'clinical', level: 'high' });
  assert.equal(page.reason, '', 'a reviewed record carries no pending reason');
  assert.deepEqual(tool.risk, { kind: 'general', level: 'low' });
  assert.equal(tool.reason, 'Synthetic review is pending');
  for (const item of [page, tool]) {
    assert.equal(Object.hasOwn(item, 'note'), false);
    assert.equal(Object.hasOwn(item, 'contentHash'), false);
    assert.equal(Object.hasOwn(item, 'claimsHash'), false);
    assert.equal(Object.hasOwn(item, 'evidenceHash'), false);
    assert.equal(Object.hasOwn(item, 'evidenceThrough'), false);
    assert.equal(JSON.stringify(item).includes('Internal reviewer note'), false);
  }
});

test('GET treats a malformed risk value as absent rather than failing the whole response', async () => {
  const files = defaultFiles();
  files[REVIEWED_PATH].json['mse-tool'].risk = { kind: 'not-a-real-kind', level: 'high' };
  const mock = createGithubMock({ files });

  const response = await handlerWith(mock)(apiRequest('GET'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items.find(item => item.slug === 'mse-tool')?.risk, null);
});

test('attesting a pending item preserves risk, note, and hash fields exactly and removes its reason', async () => {
  const mock = createGithubMock({ files: governedFiles() });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: { target: 'content', changes: { 'mse-tool': true } },
  }));

  assert.equal(response.status, 200);
  assert.equal(mock.putBodies.length, 1);
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  const record = saved['mse-tool'];
  assert.equal(record.status, 'reviewed');
  assert.equal(record.by, 'Synthetic Reviewer');
  assert.match(record.at, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(record.risk, { kind: 'general', level: 'low' });
  assert.equal(record.note, 'Internal reviewer note for the pending tool.');
  assert.equal(record.contentHash, 'd'.repeat(64));
  assert.equal(record.claimsHash, 'e'.repeat(64));
  assert.equal(record.evidenceHash, 'f'.repeat(64));
  assert.equal(record.evidenceThrough, '2026-06-02');
  assert.equal(Object.hasOwn(record, 'reason'), false, 'attesting removes the pending reason');
  // {...current, status:'reviewed', at, by} exactly — nothing invented, nothing lost.
  assert.deepEqual(
    Object.keys(record).sort(),
    ['at', 'by', 'claimsHash', 'contentHash', 'evidenceHash', 'evidenceThrough', 'note', 'risk', 'status'],
  );
});

test('reopening a reviewed item preserves risk, note, and hash fields, sets the pending reviewer, and stores the supplied reason', async () => {
  const mock = createGithubMock({ files: governedFiles() });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': false },
      reasons: { 't_mood.md': 'New evidence changes the recommendation.' },
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(mock.putBodies.length, 1);
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  const record = saved['t_mood.md'];
  assert.equal(record.status, 'pending');
  assert.equal(record.by, 'Pending faculty review');
  assert.match(record.at, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(record.risk, { kind: 'clinical', level: 'high' });
  assert.equal(record.note, 'Internal reviewer note — never exposed to the browser.');
  assert.equal(record.contentHash, 'a'.repeat(64));
  assert.equal(record.claimsHash, 'b'.repeat(64));
  assert.equal(record.evidenceHash, 'c'.repeat(64));
  assert.equal(record.evidenceThrough, '2026-06-01');
  assert.equal(record.reason, 'New evidence changes the recommendation.');
  assert.deepEqual(
    Object.keys(record).sort(),
    ['at', 'by', 'claimsHash', 'contentHash', 'evidenceHash', 'evidenceThrough', 'note', 'reason', 'risk', 'status'],
  );
});

test('reopening without a reason returns content.reason_required and writes nothing', async () => {
  const mock = createGithubMock({ files: governedFiles() });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: { target: 'content', changes: { 't_mood.md': false } },
  }));
  await expectError(response, { status: 400, code: 'content.reason_required' });
  assert.equal(mock.putBodies.length, 0);
});

test('reopening with a blank or whitespace-only reason returns content.reason_required and writes nothing', async () => {
  for (const reason of ['', '   ', '\n\t']) {
    const mock = createGithubMock({ files: governedFiles() });
    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        target: 'content',
        changes: { 't_mood.md': false },
        reasons: { 't_mood.md': reason },
      },
    }));
    await expectError(response, { status: 400, code: 'content.reason_required' });
    assert.equal(mock.putBodies.length, 0, JSON.stringify(reason));
  }
});

test('a malformed or oversized reopen reason returns content.invalid_reason and writes nothing', async () => {
  const cases = [
    ['a number', 42],
    ['an array', ['not a string']],
    ['an object', { text: 'not a string' }],
    ['241 characters', 'x'.repeat(241)],
  ];
  for (const [label, reason] of cases) {
    const mock = createGithubMock({ files: governedFiles() });
    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        target: 'content',
        changes: { 't_mood.md': false },
        reasons: { 't_mood.md': reason },
      },
    }));
    await expectError(response, { status: 400, code: 'content.invalid_reason' });
    assert.equal(mock.putBodies.length, 0, label);
  }
});

test('a reopen reason at exactly the 240-character limit is accepted and stored verbatim', async () => {
  const reason = `${'x'.repeat(239)}!`;
  const mock = createGithubMock({ files: governedFiles() });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': false },
      reasons: { 't_mood.md': reason },
    },
  }));
  assert.equal(response.status, 200);
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  assert.equal(saved['t_mood.md'].reason, reason);
  assert.equal(reason.length, 240);
});

test('a reopen reason is trimmed before the 1-240 character reason is validated and stored', async () => {
  const mock = createGithubMock({ files: governedFiles() });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': false },
      reasons: { 't_mood.md': '  Needs another look.  ' },
    },
  }));
  assert.equal(response.status, 200);
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  assert.equal(saved['t_mood.md'].reason, 'Needs another look.');
});

test('a conflict retry re-reads the ledger and retains the exact requested reason and preserved fields', async () => {
  let putAttempts = 0;
  const mock = createGithubMock({
    files: governedFiles(),
    beforeRequest: call => {
      if (call.method !== 'PUT' || call.path !== REVIEWED_PATH) return undefined;
      putAttempts += 1;
      return putAttempts === 1
        ? jsonResponse(409, { message: 'Synthetic conflict for retry test.' })
        : undefined;
    },
  });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': false },
      reasons: { 't_mood.md': 'Retry must keep this exact reason.' },
    },
  }));

  assert.equal(response.status, 200);
  assert.equal(putAttempts, 2, 'the write must have been retried exactly once');
  assert.equal(
    mock.calls.filter(call => call.method === 'GET' && call.path === REVIEWED_PATH).length,
    2,
    'the retry must re-read the ledger rather than reuse the stale copy',
  );
  assert.equal(mock.putBodies.length, 1, 'only the successful attempt reaches the default handler');
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  const record = saved['t_mood.md'];
  assert.equal(record.status, 'pending');
  assert.equal(record.reason, 'Retry must keep this exact reason.');
  assert.deepEqual(record.risk, { kind: 'clinical', level: 'high' });
  assert.equal(record.note, 'Internal reviewer note — never exposed to the browser.');
  assert.equal(record.contentHash, 'a'.repeat(64));
});

test('content mutation rejects a slug whose current ledger record lacks valid risk, without inventing one', async () => {
  const files = defaultFiles();
  delete files[REVIEWED_PATH].json['t_mood.md'].risk;
  const mock = createGithubMock({ files });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': false },
      reasons: { 't_mood.md': 'Needs another look.' },
    },
  }));
  await expectError(response, { status: 400, code: 'content.missing_risk' });
  assert.equal(mock.putBodies.length, 0);
});

for (const [label, badRisk] of [
  ['an unknown kind', { kind: 'not-a-real-kind', level: 'high' }],
  ['an unknown level', { kind: 'clinical', level: 'severe' }],
  ['a missing level', { kind: 'clinical' }],
  ['a non-object risk', 'clinical'],
  ['a null risk', null],
]) {
  test(`content mutation rejects a slug with ${label} in its current risk`, async () => {
    const files = defaultFiles();
    files[REVIEWED_PATH].json['mse-tool'].risk = badRisk;
    const mock = createGithubMock({ files });
    const response = await handlerWith(mock)(apiRequest('POST', {
      body: { target: 'content', changes: { 'mse-tool': true } },
    }));
    await expectError(response, { status: 400, code: 'content.missing_risk' });
    assert.equal(mock.putBodies.length, 0);
  });
}

test('content mutation rejects a slug entirely absent from the ledger rather than inventing a default risk', async () => {
  const files = defaultFiles();
  files[MANIFEST_PATH].json.md.push(['01_Core/brand-new.md', 'brand-new.md', 'Brand New Page']);
  const mock = createGithubMock({ files });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: { target: 'content', changes: { 'brand-new.md': true } },
  }));
  await expectError(response, { status: 502, code: 'repository_file_invalid' });
  assert.equal(mock.putBodies.length, 0);
});

test('a slug with a __proto__-shaped key is stored as an own property, never as a prototype mutation', async () => {
  const files = defaultFiles();
  // Object.defineProperty (not `json.__proto__ = ...`) so this line creates a genuine
  // own data property literally named "__proto__" instead of tripping the accessor
  // Object.prototype already defines under that name.
  Object.defineProperty(files[REVIEWED_PATH].json, '__proto__', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: { status: 'pending', at: '2026-07-03', by: 'Pending faculty review', risk: { kind: 'general', level: 'low' }, reason: 'Synthetic' },
  });
  files[MANIFEST_PATH].json.md.push(['01_Core/__proto__', '__proto__', 'Synthetic proto-named page']);
  const mock = createGithubMock({ files });
  const response = await handlerWith(mock)(apiRequest('POST', {
    // Computed key, not a `{ __proto__: true }` literal: the literal form is
    // special-cased by the language to set an object's [[Prototype]] instead of
    // creating an own property, which would silently make `changes` empty.
    body: { target: 'content', changes: { ['__proto__']: true } },
  }));

  assert.equal(response.status, 200);
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  assert.equal(Object.hasOwn(saved, '__proto__'), true);
  assert.equal(saved.__proto__.status, 'reviewed');
  assert.equal(Object.getPrototypeOf(saved), Object.prototype);
});

test('malformed JSON and missing server configuration fail with stable non-secret responses', async () => {
  const mock = createGithubMock();
  const malformed = await handlerWith(mock)(apiRequest('POST', { body: '{ nope' }));
  await expectError(malformed, { status: 400, code: 'invalid_json' });
  assert.equal(mock.calls.length, 0);

  const unconfigured = createHandler({
    fetchImpl: mock.fetchImpl,
    env: { FACULTY_ATTEST_PASSWORD: FACULTY_KEY },
  });
  const response = await unconfigured(apiRequest('GET'));
  const payload = await expectError(response, { status: 500, code: 'server_configuration' });
  assert.equal(JSON.stringify(payload).includes('GITHUB_TOKEN'), false);
  assert.equal(mock.calls.length, 0);
});

test('returns generic unauthorized before exposing a missing GitHub configuration or reading POST data', async () => {
  const mock = createGithubMock();
  const handler = createHandler({
    fetchImpl: mock.fetchImpl,
    env: { FACULTY_ATTEST_PASSWORD: FACULTY_KEY },
  });
  const request = apiRequest('POST', {
    key: 'wrong-key',
    body: { target: 'content', changes: { 't_mood.md': true } },
  });

  const response = await handler(request);

  await expectError(response, { status: 401, code: 'unauthorized' });
  assert.equal(request.bodyUsed, false);
  assert.equal(mock.calls.length, 0);
});

test('attribution is server-derived: GET exposes it, body.attester is ignored, default applies', async () => {
  // (a) GET state carries the server-configured attribution label for display.
  const stateMock = createGithubMock();
  const stateResponse = await handlerWith(stateMock)(apiRequest('GET'));
  assert.equal(stateResponse.status, 200);
  const statePayload = await stateResponse.json();
  assert.equal(statePayload.attester, 'Synthetic Reviewer');

  // (b) A client-supplied attester never overrides the server label.
  const spoofMock = createGithubMock();
  const spoofResponse = await handlerWith(spoofMock)(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 'mse-tool': true },
      attester: 'Spoofed Reviewer',
    },
  }));
  assert.equal(spoofResponse.status, 200);
  assert.equal(spoofMock.putBodies.length, 1);
  const spoofSaved = JSON.parse(
    Buffer.from(spoofMock.putBodies[0].body.content, 'base64').toString('utf8'),
  );
  assert.equal(spoofSaved['mse-tool'].by, 'Synthetic Reviewer');
  assert.match(spoofMock.putBodies[0].body.message, /by Synthetic Reviewer/);
  assert.doesNotMatch(spoofMock.putBodies[0].body.message, /Spoofed Reviewer/);

  // (c) With no ATTESTER_NAME configured, the label falls back to the default.
  const defaultMock = createGithubMock();
  const defaultResponse = await handlerWith(defaultMock, { ATTESTER_NAME: '' })(
    apiRequest('POST', {
      body: { target: 'content', changes: { 'mse-tool': true } },
    }),
  );
  assert.equal(defaultResponse.status, 200);
  const defaultSaved = JSON.parse(
    Buffer.from(defaultMock.putBodies[0].body.content, 'base64').toString('utf8'),
  );
  assert.equal(defaultSaved['mse-tool'].by, 'Joshua Moss, MD');
});

test('both repository writes re-emit 2-space JSON so a one-field change is a one-field diff', async () => {
  // reviewed.json was written with an indent of 1 until 2026-08-20 while the file on
  // disk is 2-space indented, so every content attestation rewrote all ~1,170 lines.
  // That is what made each attestation commit unreviewable and conflict-prone. These
  // assertions are on the raw serialized bytes, not the parsed object, because parsing
  // is exactly what hid the defect from every other test in this file.
  const contentMock = createGithubMock();
  const contentResponse = await handlerWith(contentMock)(apiRequest('POST', {
    body: { target: 'content', changes: { 'mse-tool': true } },
  }));
  assert.equal(contentResponse.status, 200);
  const contentText = Buffer.from(contentMock.putBodies[0].body.content, 'base64')
    .toString('utf8');
  assert.equal(contentText, `${JSON.stringify(JSON.parse(contentText), null, 2)}\n`);

  // Teeth: the round-trip above re-serializes whatever it just parsed, so it passes for
  // ANY indent the writer happens to use. Pin the real leading whitespace at two depths
  // to fix the unit at 2 — a slug key is depth 1, its "status" is depth 2.
  const indentOf = predicate => {
    const line = contentText.split('\n').find(predicate);
    assert.ok(line, 'expected line not found in serialized ledger');
    return line.match(/^ */)[0].length;
  };
  assert.equal(indentOf(line => line.startsWith(' ') && line.includes('"mse-tool":')), 2);
  assert.equal(indentOf(line => line.includes('"status":')), 4);

  // The qbank path already used 2 and must stay there — both now read one constant.
  const item = validItem({ status: 'attested' });
  const edited = clone(item);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';
  const bankMock = createGithubMock({ files: defaultFiles(makeBank([item])) });
  const bankResponse = await handlerWith(bankMock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      manifestRevision: MANIFEST_SHA,
      id: item.id,
      baseRevision: itemRevision(item),
      item: edited,
    },
  }));
  assert.equal(bankResponse.status, 200);
  const blobCall = bankMock.calls.find(call => call.method === 'POST' && call.git === 'blobs');
  const bankText = Buffer.from(JSON.parse(blobCall.body).content, 'base64').toString('utf8');
  assert.equal(bankText, `${JSON.stringify(JSON.parse(bankText), null, 2)}\n`);
});
