/**
 * The console's GitHub identity (R4): an installation token minted from an app JWT when the
 * three GITHUB_APP_* variables are set, GITHUB_TOKEN when none is, and a closed door when the
 * configuration is partial or broken.
 *
 * The JWT is checked the long way round: its signature is verified with the public half of a
 * key pair generated here, and the claims are read back from the payload — not compared to
 * what the module says it produced.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';

import {
  GithubAppAuthError,
  appAuthConfigured,
  githubHeaders,
  mintAppJwt,
  normalizePrivateKey,
  resetInstallationTokenCache,
  resolveGithubToken,
  withGithubIdentity,
} from '../faculty-console/github-app-auth.mjs';

const { privateKey: KEY, publicKey: PUBLIC } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = KEY.export({ type: 'pkcs8', format: 'pem' });
const NOW = Date.parse('2026-10-26T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function appEnv(overrides = {}) {
  return {
    GITHUB_TOKEN: 'personal-token-that-must-not-be-used',
    GITHUB_APP_ID: '123456',
    GITHUB_APP_INSTALLATION_ID: '98765432',
    GITHUB_APP_PRIVATE_KEY: PEM,
    ...overrides,
  };
}

/** A fetch that answers the token exchange and records every call it sees. */
function exchangeMock({ status = 201, token = 'ghs_installation_token', expiresInMs = HOUR, body } = {}) {
  const calls = [];
  let minted = 0;
  const fetchImpl = async (input, init = {}) => {
    calls.push({ url: String(input), method: init.method || 'GET', headers: init.headers || {} });
    minted += 1;
    const payload = body !== undefined
      ? body
      : { token: `${token}-${minted}`, expires_at: new Date(NOW + expiresInMs).toISOString() };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchImpl, calls, mintedCount: () => minted };
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

test('the app JWT is RS256 over the App ID with a one-minute backdate and a nine-minute life', () => {
  const jwt = mintAppJwt({ appId: '123456', privateKey: KEY, nowMs: NOW });
  const [header, payload, signature] = jwt.split('.');
  assert.deepEqual(decodeSegment(header), { alg: 'RS256', typ: 'JWT' });
  const claims = decodeSegment(payload);
  const now = Math.floor(NOW / 1000);
  assert.deepEqual(claims, { iat: now - 60, exp: now + 9 * 60, iss: '123456' });
  assert.ok(claims.exp - claims.iat <= 10 * 60, 'GitHub refuses a JWT that lives longer than ten minutes');
  const verified = createVerify('RSA-SHA256')
    .update(`${header}.${payload}`)
    .end()
    .verify(PUBLIC, Buffer.from(signature, 'base64url'));
  assert.equal(verified, true, 'the signature must verify with the public half of the key');
});

test('the private key is accepted pasted whole or flattened to literal \\n, and nothing else', () => {
  assert.ok(normalizePrivateKey(PEM));
  assert.ok(normalizePrivateKey(PEM.replace(/\n/g, '\\n')), 'a form-flattened PEM');
  assert.ok(normalizePrivateKey(`  ${PEM}\n\n`), 'surrounding whitespace');
  for (const bad of ['', 'not a key', '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----', PEM.slice(0, 200)]) {
    assert.throws(() => normalizePrivateKey(bad), (error) =>
      error instanceof GithubAppAuthError && error.code === 'app_private_key_invalid');
  }
});

test('with no App variable set, the token is GITHUB_TOKEN and GitHub is never called', async () => {
  const mock = exchangeMock();
  assert.equal(appAuthConfigured({ GITHUB_TOKEN: 'pat' }), false);
  assert.equal(await resolveGithubToken({ GITHUB_TOKEN: 'pat' }, mock.fetchImpl, { nowMs: NOW }), 'pat');
  assert.equal(await resolveGithubToken({}, mock.fetchImpl, { nowMs: NOW }), '');
  assert.equal(mock.calls.length, 0);
});

test('with the three variables set, the token comes from the installation exchange and carries the JWT', async () => {
  const mock = exchangeMock();
  const env = appEnv();
  assert.equal(appAuthConfigured(env), true);
  const token = await resolveGithubToken(env, mock.fetchImpl, { nowMs: NOW });
  assert.equal(token, 'ghs_installation_token-1');
  assert.equal(mock.calls.length, 1);
  const [call] = mock.calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url, 'https://api.github.com/app/installations/98765432/access_tokens');
  const bearer = call.headers.Authorization;
  assert.match(bearer, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'a JWT, not the personal token');
  assert.equal(decodeSegment(bearer.slice('Bearer '.length).split('.')[1]).iss, '123456');
  assert.equal(call.headers['X-GitHub-Api-Version'], '2026-03-10');
  assert.equal(call.headers['User-Agent'], 'faculty-attest');
});

test('the token is cached until five minutes before expiry, then re-minted', async () => {
  const mock = exchangeMock({ expiresInMs: HOUR });
  const env = appEnv();
  assert.equal(await resolveGithubToken(env, mock.fetchImpl, { nowMs: NOW }), 'ghs_installation_token-1');
  assert.equal(await resolveGithubToken(env, mock.fetchImpl, { nowMs: NOW + 30 * 60 * 1000 }), 'ghs_installation_token-1');
  assert.equal(await resolveGithubToken(env, mock.fetchImpl, { nowMs: NOW + 54 * 60 * 1000 }), 'ghs_installation_token-1',
    'six minutes before expiry the cached token still serves');
  assert.equal(mock.mintedCount(), 1);
  assert.equal(await resolveGithubToken(env, mock.fetchImpl, { nowMs: NOW + 56 * 60 * 1000 }), 'ghs_installation_token-2',
    'inside the five-minute margin a fresh token is minted');
  assert.equal(mock.mintedCount(), 2);
  resetInstallationTokenCache(mock.fetchImpl);
  assert.equal(await resolveGithubToken(env, mock.fetchImpl, { nowMs: NOW }), 'ghs_installation_token-3');
});

test('concurrent callers in one process share a single exchange', async () => {
  const mock = exchangeMock();
  const env = appEnv();
  const tokens = await Promise.all([1, 2, 3].map(() => resolveGithubToken(env, mock.fetchImpl, { nowMs: NOW })));
  assert.deepEqual(tokens, ['ghs_installation_token-1', 'ghs_installation_token-1', 'ghs_installation_token-1']);
  assert.equal(mock.mintedCount(), 1);
});

test('each fetch implementation has its own cache — one test\'s token never serves another', async () => {
  const first = exchangeMock({ token: 'first' });
  const second = exchangeMock({ token: 'second' });
  assert.equal(await resolveGithubToken(appEnv(), first.fetchImpl, { nowMs: NOW }), 'first-1');
  assert.equal(await resolveGithubToken(appEnv(), second.fetchImpl, { nowMs: NOW }), 'second-1');
});

test('a partial configuration fails closed instead of falling back to GITHUB_TOKEN', async () => {
  const mock = exchangeMock();
  const partials = [
    { GITHUB_APP_INSTALLATION_ID: '', GITHUB_APP_PRIVATE_KEY: '' },
    { GITHUB_APP_ID: '' },
    { GITHUB_APP_PRIVATE_KEY: '   ' },
    { GITHUB_APP_INSTALLATION_ID: 'not-a-number' },
    { GITHUB_APP_ID: 'has space' },
  ];
  for (const partial of partials) {
    const env = appEnv(partial);
    assert.equal(appAuthConfigured(env), true, `${JSON.stringify(partial)} is configured-and-broken, not absent`);
    await assert.rejects(resolveGithubToken(env, mock.fetchImpl, { nowMs: NOW }), (error) =>
      error instanceof GithubAppAuthError && error.code === 'app_auth_incomplete');
  }
  assert.equal(mock.calls.length, 0, 'nothing reaches GitHub on a partial configuration');
});

test('a refused or malformed exchange is an error, and the failure is not cached', async () => {
  const refused = exchangeMock({ status: 401, body: { message: 'Bad credentials' } });
  await assert.rejects(resolveGithubToken(appEnv(), refused.fetchImpl, { nowMs: NOW }), (error) =>
    error instanceof GithubAppAuthError && error.code === 'app_token_exchange_failed' && error.detail === 401);
  await assert.rejects(resolveGithubToken(appEnv(), refused.fetchImpl, { nowMs: NOW }));
  assert.equal(refused.calls.length, 2, 'a failed exchange is retried on the next request, not remembered');

  for (const body of [{ token: '' }, { token: 'x' }, { expires_at: '2026-10-26T13:00:00Z' }, 'nonsense', null]) {
    const malformed = exchangeMock({ body });
    await assert.rejects(resolveGithubToken(appEnv(), malformed.fetchImpl, { nowMs: NOW }), (error) =>
      error instanceof GithubAppAuthError && error.code === 'app_token_response_invalid');
  }

  const unreachable = { fetchImpl: async () => { throw new Error('ECONNRESET'); } };
  await assert.rejects(resolveGithubToken(appEnv(), unreachable.fetchImpl, { nowMs: NOW }), (error) =>
    error instanceof GithubAppAuthError && error.code === 'app_token_exchange_failed' && error.detail === 'unreachable');
});

test('withGithubIdentity leaves token-only settings alone and maps App failures to the handler\'s error', async () => {
  const mock = exchangeMock();
  const configurationError = (cause) => Object.assign(new Error('server_configuration'), { cause });
  const plain = { token: 'pat', appAuth: false };
  assert.equal(await withGithubIdentity(plain, { GITHUB_TOKEN: 'pat' }, mock.fetchImpl, configurationError), plain);
  assert.equal(mock.calls.length, 0);

  const resolved = await withGithubIdentity({ token: '', appAuth: true }, appEnv(), mock.fetchImpl, configurationError);
  assert.equal(resolved.token, 'ghs_installation_token-1');
  assert.equal(resolved.appAuth, true);

  await assert.rejects(
    withGithubIdentity({ token: '', appAuth: true }, appEnv({ GITHUB_APP_PRIVATE_KEY: 'garbage' }), mock.fetchImpl, configurationError),
    (error) => error.message === 'server_configuration' && error.cause.code === 'app_private_key_invalid',
  );
});

test('githubHeaders carries the identity, the pinned API version and the console user agent', () => {
  assert.deepEqual(githubHeaders('abc'), {
    Authorization: 'Bearer abc',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'faculty-attest',
  });
  assert.equal(githubHeaders('abc', 'application/vnd.github.raw+json').Accept, 'application/vnd.github.raw+json');
});
