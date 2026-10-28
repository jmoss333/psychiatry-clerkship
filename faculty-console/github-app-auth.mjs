// The faculty console's GitHub identity (architecture review R4; decision
// console-identity-github-app).
//
// DECISION: console-identity-github-app
//
// Two ways to authenticate, chosen by what the environment holds:
//
//   GITHUB_APP_ID + GITHUB_APP_INSTALLATION_ID + GITHUB_APP_PRIVATE_KEY
//     An installation access token, minted from an RS256 app JWT and cached until five
//     minutes before its hour is up. The commits still name `faculty@clerkship.local` (the
//     Contents API takes an explicit committer), so attestation_hash.py's CONSOLE_IDENTITY
//     and gate L4 are untouched; what changes is who can hold the credential. Once a ruleset
//     on `attest/pending` lists the App as its only bypass actor, "the committer email is a
//     string anyone with push rights can set" becomes "only the App's private key can land a
//     commit there" — and that key lives in one place, the console site's environment.
//
//   none of the three
//     GITHUB_TOKEN, as every console deployment ran before the App existed and as the handler
//     tests run. Nothing changes until the three variables are set.
//
// Some of the three but not all, a key that does not parse, or an exchange GitHub refuses:
// the console FAILS CLOSED (`server_configuration`, before any repository call). A
// half-configured identity must never silently fall back to the personal token it was meant
// to replace — that would be the forgeable identity back, with a dashboard that says otherwise.
//
// No dependency: node:crypto signs the JWT. The module owns the request headers too, so the
// identity has exactly one place to be read from and attest.mjs stays within its ratchet.

import { createPrivateKey, createSign } from 'node:crypto';

export const GITHUB_API_VERSION = '2026-03-10';
const GITHUB_API = 'https://api.github.com';
// GitHub caps an app JWT at ten minutes and tolerates a minute of clock skew backwards.
const JWT_LIFETIME_SECONDS = 9 * 60;
const JWT_BACKDATE_SECONDS = 60;
// An installation token lives one hour; a request that starts inside the last five minutes
// mints a fresh one rather than racing the expiry mid-write.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const APP_VARIABLES = Object.freeze([
  'GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID', 'GITHUB_APP_PRIVATE_KEY',
]);

export class GithubAppAuthError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = 'GithubAppAuthError';
    this.code = code;
    this.detail = detail;
  }
}

function readEnv(env, name) {
  if (!env || typeof env !== 'object') return '';
  try {
    const value = env[name];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

/** The headers every console request to GitHub carries; the token is the identity. */
export function githubHeaders(token, accept = 'application/vnd.github+json') {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'faculty-attest',
  };
}

/**
 * True when ANY of the three App variables is set. A partial configuration is configured and
 * broken, not absent — it must fail closed, never fall back.
 */
export function appAuthConfigured(env) {
  return APP_VARIABLES.some(name => readEnv(env, name).trim() !== '');
}

/**
 * The PEM as Netlify hands it back: pasted whole (real newlines) or flattened into literal
 * `\n` by a form or a CLI. Anything that is not a PEM private key is `app_private_key_invalid`.
 */
export function normalizePrivateKey(raw) {
  const text = String(raw || '').trim().replace(/\\n/g, '\n');
  if (!/^-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(text)) {
    throw new GithubAppAuthError('app_private_key_invalid');
  }
  try {
    return createPrivateKey(text);
  } catch {
    throw new GithubAppAuthError('app_private_key_invalid');
  }
}

function base64url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** RS256 app JWT: `iss` is the App ID, `iat` a minute back, `exp` nine minutes ahead. */
export function mintAppJwt({ appId, privateKey, nowMs = Date.now() }) {
  const now = Math.floor(nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iat: now - JWT_BACKDATE_SECONDS,
    exp: now + JWT_LIFETIME_SECONDS,
    iss: String(appId),
  }));
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .end()
    .sign(privateKey, 'base64url');
  return `${header}.${payload}.${signature}`;
}

function appSettings(env) {
  const appId = readEnv(env, 'GITHUB_APP_ID').trim();
  const installationId = readEnv(env, 'GITHUB_APP_INSTALLATION_ID').trim();
  const keyText = readEnv(env, 'GITHUB_APP_PRIVATE_KEY');
  if (!/^[A-Za-z0-9._-]+$/.test(appId) || !/^\d+$/.test(installationId) || !keyText.trim()) {
    throw new GithubAppAuthError('app_auth_incomplete');
  }
  return { appId, installationId, privateKey: normalizePrivateKey(keyText) };
}

// One cache per fetch implementation: a warm Netlify function keeps its token across
// invocations, and a test's mock never sees another test's token.
const CACHES = new WeakMap();

function cacheFor(fetchImpl) {
  let cache = CACHES.get(fetchImpl);
  if (!cache) {
    cache = new Map();
    CACHES.set(fetchImpl, cache);
  }
  return cache;
}

/** Tests only: forget every minted token. */
export function resetInstallationTokenCache(fetchImpl) {
  if (fetchImpl) CACHES.delete(fetchImpl);
}

async function exchange({ appId, installationId, privateKey }, fetchImpl, nowMs) {
  const jwt = mintAppJwt({ appId, privateKey, nowMs });
  let response;
  try {
    response = await fetchImpl(
      `${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      { method: 'POST', headers: githubHeaders(jwt) },
    );
  } catch {
    throw new GithubAppAuthError('app_token_exchange_failed', 'unreachable');
  }
  if (!response || response.status !== 201) {
    throw new GithubAppAuthError('app_token_exchange_failed', response?.status);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new GithubAppAuthError('app_token_response_invalid');
  }
  const expiresAt = Date.parse(body?.expires_at);
  if (!body || typeof body.token !== 'string' || !body.token || !Number.isFinite(expiresAt)) {
    throw new GithubAppAuthError('app_token_response_invalid');
  }
  return { token: body.token, expiresAt };
}

/**
 * The token the console should present right now. GITHUB_TOKEN when no App variable is set;
 * otherwise a cached installation token, re-minted inside the five-minute margin. Concurrent
 * callers in one process share a single exchange.
 */
export async function resolveGithubToken(env, fetchImpl, { nowMs = Date.now() } = {}) {
  if (!appAuthConfigured(env)) return readEnv(env, 'GITHUB_TOKEN');
  const app = appSettings(env);
  const cache = cacheFor(fetchImpl);
  const key = `${app.appId}:${app.installationId}`;
  const cached = cache.get(key);
  if (cached?.token && cached.expiresAt - nowMs > REFRESH_MARGIN_MS) return cached.token;
  if (cached?.pending) return cached.pending;
  const pending = exchange(app, fetchImpl, nowMs).then(
    (minted) => {
      cache.set(key, minted);
      return minted.token;
    },
    (error) => {
      cache.delete(key);
      throw error;
    },
  );
  cache.set(key, { ...(cached || {}), pending });
  return pending;
}

/**
 * attest.mjs's one call: settings built from the environment come back with `token` resolved
 * through the App when `settings.appAuth` says so. `configurationError(error)` returns the
 * HttpError the handler should throw — the module does not know the handler's error class.
 */
export async function withGithubIdentity(settings, env, fetchImpl, configurationError) {
  if (!settings.appAuth) return settings;
  try {
    return { ...settings, token: await resolveGithubToken(env, fetchImpl) };
  } catch (error) {
    if (error instanceof GithubAppAuthError) throw configurationError(error);
    throw error;
  }
}
