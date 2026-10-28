/**
 * R4 at the handler: when the three GITHUB_APP_* variables are set, every request attest.mjs
 * makes to GitHub carries the installation token and never the personal GITHUB_TOKEN; with
 * none set, GITHUB_TOKEN serves exactly as before; with a broken configuration the request
 * fails `server_configuration` before any repository call.
 *
 * `branch.ensure-pr` is the probe: it reaches GitHub (the open-PR list, then the PR create)
 * through the same settings.token every write path uses, without needing the tree fixture
 * the full handler harness carries.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import { createHandler } from '../faculty-console/netlify/functions/attest.mjs';

const API_URL = 'https://faculty.example/api/attest';
const API_ORIGIN = new URL(API_URL).origin;
const FACULTY_KEY = 'synthetic-faculty-key';
const PERSONAL_TOKEN = 'synthetic-personal-token';
const INSTALLATION_TOKEN = 'ghs_synthetic_installation_token';
const REPO = 'synthetic/faculty-console';
const INSTALLATION_ID = '4242';

const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs8', format: 'pem' });

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** GitHub as `branch.ensure-pr` sees it, plus the App's token exchange. */
function makeMock() {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url, method, authorization: init.headers?.Authorization || '' });
    if (method === 'POST' && url === `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`) {
      return jsonResponse(201, { token: INSTALLATION_TOKEN, expires_at: new Date(Date.now() + 3600e3).toISOString() });
    }
    if (url.includes('/pulls')) {
      if (method === 'GET') return jsonResponse(200, []);
      return jsonResponse(201, { html_url: 'https://github.example/pull/1' });
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  };
  return { fetchImpl, calls };
}

function handlerWith(mock, env) {
  return createHandler({
    fetchImpl: mock.fetchImpl,
    env: {
      FACULTY_ATTEST_PASSWORD: FACULTY_KEY,
      GITHUB_REPO: REPO,
      GIT_BRANCH: 'attest/pending',
      GIT_BASE_BRANCH: 'main',
      STUDENT_SITE_URL: 'https://students.example/',
      ...env,
    },
  });
}

function ensurePrRequest() {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('x-faculty-key', FACULTY_KEY);
  headers.set('Origin', API_ORIGIN);
  return new Request(API_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'branch.ensure-pr' }) });
}

const APP_ENV = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_INSTALLATION_ID: INSTALLATION_ID,
  GITHUB_APP_PRIVATE_KEY: PEM,
};

test('with the App configured, every repository call carries the installation token and never GITHUB_TOKEN', async () => {
  const mock = makeMock();
  const response = await handlerWith(mock, { GITHUB_TOKEN: PERSONAL_TOKEN, ...APP_ENV })(ensurePrRequest());
  assert.equal(response.status, 200, await response.text());

  const exchange = mock.calls.filter(call => call.url.includes('/app/installations/'));
  const repository = mock.calls.filter(call => !call.url.includes('/app/installations/'));
  assert.equal(exchange.length, 1, 'one token exchange per cold request');
  assert.match(exchange[0].authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'the exchange presents the app JWT');
  assert.ok(repository.length >= 2, 'the PR list and the PR create both reached GitHub');
  for (const call of repository) {
    assert.equal(call.authorization, `Bearer ${INSTALLATION_TOKEN}`, `${call.method} ${call.url}`);
  }
  assert.ok(mock.calls.every(call => !call.authorization.includes(PERSONAL_TOKEN)),
    'the personal token must not appear in any request once the App is configured');
});

test('the App needs no GITHUB_TOKEN at all', async () => {
  const mock = makeMock();
  const response = await handlerWith(mock, APP_ENV)(ensurePrRequest());
  assert.equal(response.status, 200, await response.text());
  assert.ok(mock.calls.filter(call => call.url.includes('/pulls')).every(call => call.authorization === `Bearer ${INSTALLATION_TOKEN}`));
});

test('with no App variable set, GITHUB_TOKEN serves exactly as before', async () => {
  const mock = makeMock();
  const response = await handlerWith(mock, { GITHUB_TOKEN: PERSONAL_TOKEN })(ensurePrRequest());
  assert.equal(response.status, 200, await response.text());
  assert.equal(mock.calls.filter(call => call.url.includes('/app/installations/')).length, 0, 'no exchange');
  assert.ok(mock.calls.length >= 2);
  for (const call of mock.calls) assert.equal(call.authorization, `Bearer ${PERSONAL_TOKEN}`);
});

test('neither a token nor an App is server_configuration', async () => {
  const mock = makeMock();
  const response = await handlerWith(mock, {})(ensurePrRequest());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'server_configuration');
  assert.equal(mock.calls.length, 0);
});

test('a broken or partial App configuration fails closed before any repository call — even with GITHUB_TOKEN present', async () => {
  const broken = [
    { ...APP_ENV, GITHUB_APP_PRIVATE_KEY: 'not a pem' },
    { GITHUB_APP_ID: '123456' },
    { GITHUB_APP_ID: '123456', GITHUB_APP_INSTALLATION_ID: INSTALLATION_ID },
    { ...APP_ENV, GITHUB_APP_INSTALLATION_ID: 'four-two' },
  ];
  for (const env of broken) {
    const mock = makeMock();
    const response = await handlerWith(mock, { GITHUB_TOKEN: PERSONAL_TOKEN, ...env })(ensurePrRequest());
    assert.equal(response.status, 500, JSON.stringify(Object.keys(env)));
    assert.equal((await response.json()).error.code, 'server_configuration');
    assert.equal(mock.calls.length, 0, `nothing reaches GitHub: ${JSON.stringify(Object.keys(env))}`);
  }
});

test('a refused exchange is server_configuration, and the repository is never touched with the personal token', async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    calls.push({ url: String(input), authorization: init.headers?.Authorization || '' });
    if (String(input).includes('/app/installations/')) return jsonResponse(401, { message: 'Bad credentials' });
    throw new Error(`unexpected request: ${input}`);
  };
  const response = await handlerWith({ fetchImpl }, { GITHUB_TOKEN: PERSONAL_TOKEN, ...APP_ENV })(ensurePrRequest());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'server_configuration');
  assert.equal(calls.length, 1, 'only the exchange was attempted');
  assert.ok(!calls[0].authorization.includes(PERSONAL_TOKEN));
});

test('the faculty key is still checked before the identity is resolved', async () => {
  const mock = makeMock();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('x-faculty-key', 'wrong');
  headers.set('Origin', API_ORIGIN);
  const response = await handlerWith(mock, APP_ENV)(
    new Request(API_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'branch.ensure-pr' }) }),
  );
  assert.equal(response.status, 401);
  assert.equal(mock.calls.length, 0, 'an unauthorized caller never triggers a token exchange');
});
