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
const FIRST_WRITE_SHA = 'd'.repeat(40);
const SECOND_WRITE_SHA = 'e'.repeat(40);
const UNRELATED_RACE_SHA = 'f'.repeat(40);
const SAME_ITEM_RACE_SHA = '1'.repeat(40);
const RETIREMENT_RACE_SHA = '2'.repeat(40);
const DELETION_RACE_SHA = '3'.repeat(40);

const REVIEWED_PATH = '13_Faculty_Resources/reviewed.json';
const MANIFEST_PATH = '13_Faculty_Resources/_automation/site_build/site_manifest.json';
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

function defaultFiles(bank = makeBank([
  validItem(),
  validItem({ id: 'qb_moo_901', status: 'attested', correctKey: 'B', stem: stems[1] }),
  { ...validItem({ id: 'qb_moo_902', stem: stems[2] }), retired: true, retiredReason: 'Synthetic retirement.' },
])) {
  return {
    [REVIEWED_PATH]: {
      json: {
        't_mood.md': { status: 'reviewed', at: '2026-07-01', by: 'Synthetic Reviewer' },
        'mse-tool': { status: 'pending', at: '2026-07-02', by: 'Pending faculty review' },
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
    [QBANK_PATH]: {
      json: bank,
      sha: QBANK_SHA,
    },
  };
}

function clone(value) {
  return structuredClone(value);
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

function createGithubMock({
  files = defaultFiles(),
  beforeRequest,
  onPut,
} = {}) {
  const calls = [];
  const putBodies = [];
  let putAttempt = 0;

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    const path = repositoryPath(url);
    const call = { url, method, headers, body: init.body, path };
    calls.push(call);

    const intercepted = await beforeRequest?.(call, { files, calls, putBodies });
    if (intercepted) return intercepted;

    const file = files[path];
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

  return { fetchImpl, calls, putBodies, files };
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
  assert.deepEqual(payload.manifestPages, ['t_mood.md']);
  assert.equal(payload.items.length, 2);
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
    assert.equal(mock.putBodies.length, 0);
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

test('qbank.save-draft performs exactly one successful PUT and returns the saved item revision and assessment', async () => {
  const item = validItem({ status: 'attested' });
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });
  const edited = clone(item);
  edited.stem = 'A revised fictional inpatient has sustained sadness and anhedonia. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
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
  assert.equal(mock.putBodies.length, 1);
  assert.equal(mock.putBodies[0].path, QBANK_PATH);
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  assert.equal(saved.items[0].stem, edited.stem);
  assert.equal(saved.items[0].status, 'draft');
  assert.equal(payload.revision, itemRevision(saved.items[0]));
});

test('qbank.attest performs exactly one successful PUT and returns stable target revisions and assessments', async () => {
  const item = validItem();
  const revision = itemRevision(item);
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest',
      items: [{ id: item.id, revision, reviewedRevision: revision }],
      confirmations: confirmed,
      attester: 'Synthetic Reviewer',
    },
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.action, 'qbank.attest');
  assert.equal(payload.updated, 1);
  assert.equal(mock.putBodies.length, 1);
  const saved = JSON.parse(Buffer.from(mock.putBodies[0].body.content, 'base64').toString('utf8'));
  assert.equal(saved.items[0].status, 'attested');
  assert.equal(payload.revision[item.id], itemRevision(saved.items[0]));
  assert.equal(payload.assessment[item.id].gate, 'ready');
});

test('qbank.attest rejects a legacy green request without reviewed-revision evidence', async () => {
  const item = validItem();
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest',
      items: [{ id: item.id, revision: itemRevision(item) }],
      confirmations: confirmed,
      attester: 'Synthetic Reviewer',
    },
  }));

  await expectError(response, { status: 422, code: 'attest.review_required' });
  assert.equal(mock.putBodies.length, 0);
});

test('retries one GitHub 409 after an unrelated-item race and preserves the unrelated update', async () => {
  const target = validItem({ status: 'attested' });
  const unrelated = validItem({ id: 'qb_moo_901', stem: stems[1] });
  const files = defaultFiles(makeBank([target, unrelated]));
  const mock = createGithubMock({
    files,
    onPut: ({ attempt, files: mutableFiles }) => {
      if (attempt !== 1) return undefined;
      mutableFiles[QBANK_PATH].json.items[1].pearl = 'An unrelated faculty edit won the first race.';
      mutableFiles[QBANK_PATH].sha = UNRELATED_RACE_SHA;
      return jsonResponse(409, { message: 'Synthetic SHA conflict.' });
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
      attester: 'Synthetic Reviewer',
    },
  }));
  assert.equal(response.status, 200);
  assert.equal(mock.putBodies.length, 2);
  assert.equal(mock.putBodies[1].body.sha, UNRELATED_RACE_SHA);
  const retriedBank = JSON.parse(Buffer.from(mock.putBodies[1].body.content, 'base64').toString('utf8'));
  assert.equal(retriedBank.items[0].stem, edited.stem);
  assert.equal(retriedBank.items[1].pearl, 'An unrelated faculty edit won the first race.');
});

test('returns a same-item conflict with no second PUT when the target changes during a GitHub 409 race', async () => {
  const target = validItem({ status: 'attested' });
  const files = defaultFiles(makeBank([target]));
  const mock = createGithubMock({
    files,
    onPut: ({ attempt, files: mutableFiles }) => {
      if (attempt !== 1) return undefined;
      mutableFiles[QBANK_PATH].json.items[0].pearl = 'A competing edit changed this same item.';
      mutableFiles[QBANK_PATH].sha = SAME_ITEM_RACE_SHA;
      return jsonResponse(409, { message: 'Synthetic SHA conflict.' });
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.putBodies.length, 1);
});

test('normalizes target retirement during a save retry to a conflict with no second PUT', async () => {
  const target = validItem({ status: 'attested' });
  const files = defaultFiles(makeBank([target]));
  const mock = createGithubMock({
    files,
    onPut: ({ attempt, files: mutableFiles }) => {
      if (attempt !== 1) return undefined;
      mutableFiles[QBANK_PATH].json.items[0].retired = true;
      mutableFiles[QBANK_PATH].json.items[0].retiredReason = 'Retired during the synthetic race.';
      mutableFiles[QBANK_PATH].sha = RETIREMENT_RACE_SHA;
      return jsonResponse(409, { message: 'Synthetic SHA conflict.' });
    },
  });
  const edited = clone(target);
  edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.save-draft',
      id: target.id,
      baseRevision: itemRevision(target),
      item: edited,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.putBodies.length, 1);
});

test('normalizes deletion of any attestation target during retry to one atomic conflict', async () => {
  const first = validItem();
  const second = validItem({ id: 'qb_moo_901', correctKey: 'B', stem: stems[1] });
  const files = defaultFiles(makeBank([first, second]));
  const mock = createGithubMock({
    files,
    onPut: ({ attempt, files: mutableFiles }) => {
      if (attempt !== 1) return undefined;
      mutableFiles[QBANK_PATH].json.items = [mutableFiles[QBANK_PATH].json.items[0]];
      mutableFiles[QBANK_PATH].sha = DELETION_RACE_SHA;
      return jsonResponse(409, { message: 'Synthetic SHA conflict.' });
    },
  });

  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest',
      items: [
        { id: first.id, revision: itemRevision(first), reviewedRevision: itemRevision(first) },
        { id: second.id, revision: itemRevision(second), reviewedRevision: itemRevision(second) },
      ],
      confirmations: confirmed,
    },
  }));

  await expectError(response, { status: 409, code: 'qbank.conflict' });
  assert.equal(mock.putBodies.length, 1);
});

for (const [name, githubPayload] of [
  ['missing commit and content receipts', {}],
  ['missing commit receipt', { content: { sha: FIRST_WRITE_SHA } }],
  ['missing content receipt', { commit: { html_url: 'https://github.example/commit/written' } }],
]) {
  test(`rejects a successful GitHub PUT response with ${name}`, async () => {
    const item = validItem({ status: 'attested' });
    const edited = clone(item);
    edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';
    const mock = createGithubMock({
      files: defaultFiles(makeBank([item])),
      onPut: () => jsonResponse(200, githubPayload),
    });

    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        action: 'qbank.save-draft',
        id: item.id,
        baseRevision: itemRevision(item),
        item: edited,
      },
    }));

    await expectError(response, { status: 502, code: 'github_response_invalid' });
    assert.equal(mock.putBodies.length, 1);
  });
}

for (const [name, receiptSha] of [
  ['unchanged', QBANK_SHA],
  ['case-only unchanged', QBANK_SHA.toUpperCase()],
  ['whitespace', ' '.repeat(40)],
  ['non-hex', 'g'.repeat(40)],
  ['wrong-length', 'a'.repeat(39)],
]) {
  test(`rejects a successful GitHub PUT response with a ${name} content SHA`, async () => {
    const item = validItem({ status: 'attested' });
    const edited = clone(item);
    edited.stem = 'A revised fictional patient has persistent sadness. What diagnosis best fits?';
    const mock = createGithubMock({
      files: defaultFiles(makeBank([item])),
      onPut: () => jsonResponse(200, {
        content: { sha: receiptSha },
        commit: { html_url: 'https://github.example/commit/written' },
      }),
    });

    const response = await handlerWith(mock)(apiRequest('POST', {
      body: {
        action: 'qbank.save-draft',
        id: item.id,
        baseRevision: itemRevision(item),
        item: edited,
      },
    }));

    await expectError(response, { status: 502, code: 'github_response_invalid' });
    assert.equal(mock.putBodies.length, 1);
    assert.match(mock.putBodies[0].body.sha, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
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
      id: item.id,
      baseRevision: itemRevision(item),
      item: clone(item),
    },
  }));
  await expectError(qbankResponse, { status: 422, code: 'qbank.no_changes' });
  assert.equal(qbankMock.putBodies.length, 0);

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

test('preserves the legacy content review write path with header-only auth', async () => {
  const mock = createGithubMock();
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': false, 'mse-tool': true },
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
  assert.equal(saved['mse-tool'].status, 'reviewed');
  assert.equal(saved['mse-tool'].by, 'Synthetic Reviewer');
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
