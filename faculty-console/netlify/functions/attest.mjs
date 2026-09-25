// Faculty attestation — authenticated commit-on-save (Netlify Functions v2, ESM).
// Secrets remain server-side. The browser supplies only x-faculty-key.

import {
  STALE_REASON,
  digestFromManifest,
  manifestForSlug,
  sourceBlobSha,
  sourcesForSlug,
} from '../../attestation-hash.mjs';
import {
  commitSummary,
  groupDriftedByChange,
  groupId,
  lineDiffHunks,
  recordDiff,
} from '../../change-history.mjs';
import { deriveContentUniverse } from '../../content-universe.mjs';
import {
  KEYS_PATH,
  LEDGER_BRANCH,
  LEDGER_FILE,
  LedgerError,
  MAX_LEDGER_BYTES,
  appendEvents,
  applyLedger,
  loadSigner,
  questionItemHash,
  verifyLedger,
} from '../../ledger.mjs';
import { parseHooks, publishLedger, readReceipt } from '../../ledger-publish.mjs';
import { assessBank } from '../../qbank-rules.mjs';
import {
  QbankActionError,
  itemRevision,
  prepareAttestation,
  prepareDraftSave,
} from './qbank-actions.mjs';

const DEFAULT_REPO = 'jmoss333/psychiatry-clerkship';
// Attestations land on their own branch and reach the base branch through one
// rolling pull request. Writing straight to a protected base branch is refused
// by GitHub — that failure was invisible for a month because a 409 reads as a
// race. Set GIT_BRANCH equal to GIT_BASE_BRANCH to restore direct writes.
const DEFAULT_BRANCH = 'attest/pending';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_STUDENT_SITE = 'https://une-ms3-psychiatry.netlify.app';
// The resident deployment. Case-of-the-Week ships MS3/resident twins, and the resident
// half only exists here — previewing it against the MS3 site would report not_found for
// a page that is live. Defaulted in code so no Netlify environment change is required;
// RESIDENT_SITE_URL overrides it. The resident build inherits the MS3 build's _headers
// via resident_section.py's copytree, so it already carries the same exact-origin
// `frame-ancestors 'self' https://clerkship-faculty-attest.netlify.app` the console needs.
const DEFAULT_RESIDENT_SITE = 'https://mmc-psychiatry-residents-sanford.netlify.app';
const DEFAULT_ATTESTER = 'Joshua Moss, MD';
const DEFAULT_ATTESTER_EMAIL = 'faculty@clerkship.local';

const DEFAULT_BASE_LAG_ALARM = 3;
const REVIEWED_PATH = '13_Faculty_Resources/reviewed.json';
// site_manifest.json is still read, but ONLY for the question bank: manifestPages gates
// which page a question may anchor to, and manifestRevision is the qbank conflict key.
// It is no longer where the review queue comes from.
const MANIFEST_PATH = '13_Faculty_Resources/_automation/site_build/site_manifest.json';
// THE source of truth for what ships, and therefore for what is reviewable here. Derived
// from every producer by site_build/shipped_pages.py and checked against the real build
// output on every build (ADR-002). The manifest alone missed the 22 Case-of-the-Week
// pages that stayed invisible to attestation from July to September 2026; the manifest
// plus the case registry still missed the resident-only pages and tools. One derived
// listing, verified against the build, ends that class of gap.
const SHIPPED_PAGES_PATH = '13_Faculty_Resources/_automation/site_build/shipped_pages.json';
// The second half of a content hash. A page's own metadata record is part of what a reviewer
// reads, so it is hashed alongside the page source — minus `facultyReview`, which records the
// attesting itself (attestation-hash.mjs).
const TOPIC_META_PATH = 'topic_meta.json';
const QBANK_PATH = 'question_bank.json';
// The Essentials selection (curriculum.json → essentials.{ms3,resident}) orders the queue;
// it is advisory and never gates a load — see readEssentials.
const CURRICULUM_PATH = 'curriculum.json';

// The three sentences a content item can carry instead of a clean `reviewed`. STALE_REASON —
// the drift case — lives in attestation-hash.mjs, because the Python projection renders the
// same words into the ledger and the two must read identically.
const UNBOUND_REASON = 'No content hash recorded; re-attest to bind this review to the page text.';
const UNVERIFIED_REASON = 'This review could not be checked against the page text for this load.';
const MISSING_SOURCE_REASON = 'An attested source file is missing from the repository tree.';

// Both files are stored 2-space indented, so every write must re-emit them that way.
// This is not cosmetic: reviewed.json was written with an indent of 1 until 2026-08-20,
// which reformatted all ~1,170 lines on every single-field attestation. That made each
// attestation commit unreviewable and guaranteed a conflict against any concurrent edit
// — a large part of why the attest/pending branch became unmergeable. Shared constant so
// the two write paths (write() positional, writeAtHead() options) cannot drift again.
const JSON_INDENT = 2;

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2026-03-10';
const MAX_POST_BYTES = 128 * 1024;
const MAX_BANK_BYTES = 4 * 1024 * 1024;
const GIT_OBJECT_ID_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

const ERROR_MESSAGES = Object.freeze({
  github_forbidden: 'The repository refused this request.',
  github_conflict: 'The repository refused this write. Either it changed during this request '
    + '— reload and try again — or the target branch is protected and cannot be written to '
    + 'directly, which reloading will never fix. Check GIT_BRANCH.',
  github_validation_failed: 'The repository rejected the proposed update.',
  github_rate_limited: 'The repository is temporarily rate limited. Try again later.',
  github_request_failed: 'The repository request failed. Try again later.',
  github_unavailable: 'The repository is temporarily unavailable. Try again later.',
  github_response_invalid: 'The repository returned an invalid response.',
  repository_file_invalid: 'A required repository file is invalid.',
  // Present so the code is registered beside its siblings; the thrown error always
  // carries the specific per-file message built by repositoryFileMissing() below.
  repository_file_missing: 'A required repository file is missing from the attestation branch.',
});

class HttpError extends Error {
  constructor(code, status, message, { issues = [], retryable = false } = {}) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = status;
    this.issues = Array.isArray(issues) ? issues : [];
    this.retryable = retryable === true;
  }
}

class GithubError extends HttpError {
  constructor(code, status, { retryable = false, notFound = false } = {}) {
    super(code, status, ERROR_MESSAGES[code] || ERROR_MESSAGES.github_request_failed, { retryable });
    this.name = 'GithubError';
    this.conflict = status === 409;
    this.notFound = notFound === true;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function requestOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

function configuredOriginPolicy(env) {
  const supplied = readEnv(env, 'ALLOWED_ORIGIN').trim();
  if (!supplied) return { origin: '', valid: true };
  try {
    const parsed = new URL(supplied);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== supplied) {
      throw new Error('not an exact origin');
    }
    return { origin: supplied, valid: true };
  } catch {
    return { origin: '', valid: false };
  }
}

function responseContext(request, env) {
  const sameOrigin = requestOrigin(request);
  const policy = configuredOriginPolicy(env);
  return { allowedOrigin: policy.origin || sameOrigin || 'null' };
}

function responseHeaders(context) {
  return {
    'Access-Control-Allow-Origin': context.allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-faculty-key',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

function jsonResponse(context, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(context),
  });
}

function errorDescriptor(error) {
  if (error instanceof QbankActionError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
      issues: error.issues,
      retryable: false,
    };
  }
  if (error instanceof HttpError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
      issues: error.issues,
      retryable: error.retryable,
    };
  }
  return {
    code: 'internal_error',
    status: 500,
    message: 'Internal server error.',
    issues: [],
    retryable: false,
  };
}

function errorResponse(context, error) {
  const normalized = errorDescriptor(error);
  const details = {
    code: normalized.code,
    message: normalized.message,
  };
  if (normalized.issues.length) details.issues = normalized.issues;
  if (normalized.retryable) details.retryable = true;
  return jsonResponse(context, normalized.status, { error: details });
}

// Constant-time comparison with respect to the supplied candidate's length/prefix.
function safeEqual(candidate, expected) {
  const left = String(candidate || '');
  const right = String(expected || '');
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function requireRequest(request) {
  if (!request
      || typeof request.method !== 'string'
      || !request.headers
      || typeof request.headers.get !== 'function'
      || !requestOrigin(request)) {
    throw new HttpError('invalid_request', 400, 'The request is malformed.');
  }
}

function requireServerSettings(env, fetchImpl, originPolicy) {
  const token = readEnv(env, 'GITHUB_TOKEN');
  const key = readEnv(env, 'FACULTY_ATTEST_PASSWORD');
  const repo = readEnv(env, 'GITHUB_REPO').trim() || DEFAULT_REPO;
  const branch = readEnv(env, 'GIT_BRANCH').trim() || DEFAULT_BRANCH;
  const baseBranch = readEnv(env, 'GIT_BASE_BRANCH').trim() || DEFAULT_BASE_BRANCH;
  const studentValue = readEnv(env, 'STUDENT_SITE_URL').trim() || DEFAULT_STUDENT_SITE;
  const residentValue = readEnv(env, 'RESIDENT_SITE_URL').trim() || DEFAULT_RESIDENT_SITE;
  const attesterEmail = readEnv(env, 'ATTESTER_EMAIL').trim() || DEFAULT_ATTESTER_EMAIL;
  const attester = attesterLabel(readEnv(env, 'ATTESTER_NAME'));

  if (!originPolicy.valid
      || !token
      || !key
      || typeof fetchImpl !== 'function'
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
      || !branch
      || !baseBranch) {
    throw new HttpError('server_configuration', 500, 'The faculty service is not configured.');
  }

  let student;
  let resident;
  try {
    const parsed = new URL(studentValue);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    student = studentValue.replace(/\/+$/, '');
    const parsedResident = new URL(residentValue);
    if (!['http:', 'https:'].includes(parsedResident.protocol)) throw new Error('unsupported protocol');
    resident = residentValue.replace(/\/+$/, '');
  } catch {
    throw new HttpError('server_configuration', 500, 'The faculty service is not configured.');
  }

  // LEDGER MODE (ADR-003). A sign-off is a signed event appended to the attestation ledger
  // (an orphan branch nobody merges), and content is read from — and hashed against — the
  // BASE branch, the text learners actually get. Nothing is ever written to the base, and
  // there is no attestation branch to sync and no rolling PR to keep. Off unless
  // ATTEST_LEDGER=on; a ledger-mode console with no usable signing key refuses to start,
  // because a console that could not sign would silently take sign-offs it cannot record.
  let ledger = null;
  if (readEnv(env, 'ATTEST_LEDGER').trim().toLowerCase() === 'on') {
    try {
      ledger = {
        branch: readEnv(env, 'LEDGER_BRANCH').trim() || LEDGER_BRANCH,
        signer: loadSigner(readEnv(env, 'LEDGER_SIGNING_KEY')),
        hooks: parseHooks(readEnv(env, 'LEDGER_BUILD_HOOKS')),
      };
    } catch {
      throw new HttpError('server_configuration', 500, 'The faculty service is not configured.');
    }
  }

  // Equal branches mean "write straight to the base" — nothing to sync, no PR to
  // keep. That is the pre-2026-08 behaviour, and how the handler tests run.
  const isolated = !ledger && branch !== baseBranch;

  // Base-lag alarm threshold (#415 aftermath): the load-time probe alarms when
  // unmerged attestations sit on a branch whose base lags the base branch by at
  // least this many commits. The August 2026 freeze reached nine behind, three
  // ahead, four days silent.
  const configuredLag = Number.parseInt(readEnv(env, 'ATTEST_BASE_LAG_ALARM').trim(), 10);
  const lagAlarmThreshold = Number.isInteger(configuredLag) && configuredLag >= 1
    ? configuredLag : DEFAULT_BASE_LAG_ALARM;

  return {
    token,
    key,
    repo,
    // In ledger mode every read is from the base branch; see above.
    branch: ledger ? baseBranch : branch,
    baseBranch,
    isolated,
    student,
    resident,
    attesterEmail,
    attester,
    lagAlarmThreshold,
    ledger,
    fetchImpl,
  };
}

function githubStatusError(status) {
  switch (status) {
    case 403:
      return new GithubError('github_forbidden', 403);
    case 409:
      return new GithubError('github_conflict', 409, { retryable: true });
    case 404:
      return new GithubError('github_request_failed', 502, { notFound: true });
    case 422:
      return new GithubError('github_validation_failed', 422);
    case 429:
      return new GithubError('github_rate_limited', 429, { retryable: true });
    default:
      return new GithubError('github_request_failed', 502, { retryable: status >= 500 });
  }
}

function githubHeaders(token, accept = 'application/vnd.github+json') {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'faculty-attest',
  };
}

function encodedRepositoryPath(path) {
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function repositoryUrl(settings, path, includeRef = true, ref = settings.branch) {
  const base = `${GITHUB_API}/repos/${settings.repo}/contents/${encodedRepositoryPath(path)}`;
  return includeRef ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

function gitRepositoryUrl(settings, path) {
  return `${GITHUB_API}/repos/${settings.repo}/git/${encodedRepositoryPath(path)}`;
}

// Its own builder, deliberately: gitRepositoryUrl percent-encodes every path segment, which
// would turn `trees/<sha>?recursive=1` into a literal path with an escaped `?` in it.
function gitTreeUrl(settings, commitSha) {
  return `${GITHUB_API}/repos/${settings.repo}/git/trees/`
    + `${encodeURIComponent(commitSha)}?recursive=1`;
}

/**
 * One recursive tree per commit, remembered for as long as the container lives.
 *
 * THE KEY IS `repo@commit`, and that is the whole of it. A commit sha names an immutable
 * tree, so a hit can never be stale, and a warm Netlify container reuses the listing across
 * loads instead of re-fetching every path in the repository on each one.
 *
 * The outer WeakMap is NOT a credential boundary, and saying so would be a comfortable lie:
 * in production every invocation of a container shares the one `globalThis.fetch`, so the
 * effective key is exactly `repo@commit`. What it does buy is that distinct transports —
 * in practice test mocks — never share entries. The token is deliberately not in the key:
 * it is fixed per deployment, so it cannot vary between invocations of one container, and
 * the repository already is in the key, so the memo never crosses repositories.
 */
const TREE_CACHE = new WeakMap();
const TREE_CACHE_LIMIT = 4;

function treeCacheFor(fetchImpl) {
  if (typeof fetchImpl !== 'function') return new Map();
  let cache = TREE_CACHE.get(fetchImpl);
  if (!cache) {
    cache = new Map();
    TREE_CACHE.set(fetchImpl, cache);
  }
  return cache;
}

async function githubRequest(fetchImpl, input, init) {
  let response;
  try {
    response = await fetchImpl(input, init);
  } catch {
    throw new GithubError('github_unavailable', 502, { retryable: true });
  }
  if (!response || typeof response.status !== 'number' || typeof response.ok !== 'boolean') {
    throw new GithubError('github_response_invalid', 502);
  }
  if (!response.ok) throw githubStatusError(response.status);
  return response;
}

async function githubJson(response) {
  try {
    const value = await response.json();
    if (!isRecord(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new GithubError('github_response_invalid', 502);
  }
}

function githubHttpsUrl(value) {
  if (typeof value !== 'string' || !value) {
    throw new GithubError('github_response_invalid', 502);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') throw new Error('unsafe protocol');
    return parsed.href;
  } catch {
    throw new GithubError('github_response_invalid', 502);
  }
}

function qbankSizeError() {
  return new HttpError(
    'qbank_too_large',
    413,
    'The question bank exceeds the 4 MiB safety limit.',
  );
}

function enforceByteLimit(byteLength, maxBytes) {
  if (maxBytes && byteLength > maxBytes) throw qbankSizeError();
}

function normalizeGitObjectId(value) {
  if (typeof value !== 'string' || !GIT_OBJECT_ID_PATTERN.test(value)) {
    throw new GithubError('github_response_invalid', 502);
  }
  return value.toLowerCase();
}

function decodeBase64(content) {
  const compact = content.replace(/\s+/g, '');
  if (compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new GithubError('github_response_invalid', 502);
  }
  try {
    return Buffer.from(compact, 'base64');
  } catch {
    throw new GithubError('github_response_invalid', 502);
  }
}

function parseRepositoryJson(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    throw new GithubError('repository_file_invalid', 502);
  }
}

function createRepositoryGateway({ settings, fetchImpl, treeCache }) {
  // The cross-request tree memo, or `null` for none. Injectable for two honest reasons: a
  // test cannot otherwise count how many times readTree is INVOKED (with a memo on, a correct
  // implementation and one that hashes per item both make exactly one network call), and a
  // deployment that must not hold repository listings in container memory between requests
  // can turn it off. `undefined` means "the shared default".
  const trees = treeCache === undefined ? treeCacheFor(fetchImpl) : treeCache;

  /**
   * One file's bytes at `ref`, size-limited. `read` parses them as JSON; the attestation ledger
   * (JSON Lines) and the canonical question-bank hash need the bytes themselves.
   */
  async function readRaw(path, { maxBytes = 0, ref = settings.branch } = {}) {
    const objectResponse = await githubRequest(
      fetchImpl,
      repositoryUrl(settings, path, true, ref),
      { headers: githubHeaders(settings.token) },
    );
    const object = await githubJson(objectResponse);
    const sha = normalizeGitObjectId(object.sha);
    if (!Number.isInteger(object.size) || object.size < 0) {
      throw new GithubError('github_response_invalid', 502);
    }
    enforceByteLimit(object.size, maxBytes);

    let bytes;
    if (typeof object.content === 'string'
        && object.content.trim()
        && object.encoding === 'base64') {
      bytes = decodeBase64(object.content);
    } else if (object.encoding === 'none'
        || object.content == null
        || (typeof object.content === 'string' && !object.content.trim())) {
      const rawResponse = await githubRequest(
        fetchImpl,
        repositoryUrl(settings, path, true, ref),
        { headers: githubHeaders(settings.token, 'application/vnd.github.raw+json') },
      );
      const contentLength = Number(rawResponse.headers?.get?.('Content-Length'));
      if (Number.isFinite(contentLength) && contentLength >= 0) {
        enforceByteLimit(contentLength, maxBytes);
      }
      try {
        bytes = new Uint8Array(await rawResponse.arrayBuffer());
      } catch {
        throw new GithubError('github_unavailable', 502, { retryable: true });
      }
    } else {
      throw new GithubError('github_response_invalid', 502);
    }

    enforceByteLimit(bytes.byteLength, maxBytes);
    return { bytes, sha, size: bytes.byteLength };
  }

  async function read(path, options = {}) {
    const { bytes, sha, size } = await readRaw(path, options);
    return { json: parseRepositoryJson(bytes), sha, size };
  }

  /**
   * A UTF-8 text file at `ref`, or null when the file (or the branch) does not exist yet.
   * The attestation ledger starts life absent, and absent is an empty ledger, not a fault.
   */
  async function readText(path, { maxBytes = 0, ref } = {}) {
    let raw;
    try {
      raw = await readRaw(path, { maxBytes, ref });
    } catch (error) {
      if (error instanceof GithubError && error.notFound) return null;
      throw error;
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(raw.bytes);
    } catch {
      throw new GithubError('repository_file_invalid', 502);
    }
    return { text, sha: raw.sha };
  }

  /**
   * Create or replace one text file on `branch` in one commit, as the console identity.
   * `sha` is the blob being replaced (null to create): GitHub answers 409/422 when the file
   * moved underneath us, which the caller turns into a re-read and a retry — the same
   * optimistic concurrency every other console write uses.
   */
  async function writeText({ path, text, sha, message, branch }) {
    const bytes = Buffer.from(text, 'utf8');
    const submittedSha = sha ? normalizeGitObjectId(sha) : null;
    const response = await githubRequest(
      fetchImpl,
      repositoryUrl(settings, path, false),
      {
        method: 'PUT',
        headers: githubHeaders(settings.token),
        body: JSON.stringify({
          message,
          content: bytes.toString('base64'),
          ...(submittedSha ? { sha: submittedSha } : {}),
          branch,
          committer: {
            name: 'Faculty Attestation Console',
            email: settings.attesterEmail,
          },
        }),
      },
    );
    const payload = await githubJson(response);
    const revision = normalizeGitObjectId(payload.content?.sha);
    let commitUrl;
    try {
      commitUrl = new URL(payload.commit?.html_url);
    } catch {
      throw new GithubError('github_response_invalid', 502);
    }
    if (commitUrl.protocol !== 'https:' || revision === submittedSha) {
      throw new GithubError('github_response_invalid', 502);
    }
    return { commit: commitUrl.href, revision };
  }

  async function write(path, value, sha, message, indent) {
    const serialized = `${JSON.stringify(value, null, indent)}\n`;
    const bytes = Buffer.from(serialized, 'utf8');
    if (path === QBANK_PATH) enforceByteLimit(bytes.byteLength, MAX_BANK_BYTES);

    const submittedSha = normalizeGitObjectId(sha);
    const response = await githubRequest(
      fetchImpl,
      repositoryUrl(settings, path, false),
      {
        method: 'PUT',
        headers: githubHeaders(settings.token),
        body: JSON.stringify({
          message,
          content: bytes.toString('base64'),
          sha: submittedSha,
          branch: settings.branch,
          committer: {
            name: 'Faculty Attestation Console',
            email: settings.attesterEmail,
          },
        }),
      },
    );
    const payload = await githubJson(response);
    const commit = typeof payload.commit?.html_url === 'string' ? payload.commit.html_url : null;
    const revision = normalizeGitObjectId(payload.content?.sha);
    let commitUrl;
    try {
      commitUrl = new URL(commit);
    } catch {
      throw new GithubError('github_response_invalid', 502);
    }
    if (commitUrl.protocol !== 'https:' || revision === submittedSha) {
      throw new GithubError('github_response_invalid', 502);
    }
    return { commit, revision };
  }

  /**
   * Every file's blob sha at one commit, in ONE call — the whole read side of content hashes.
   *
   * The digest is a hash OF blob shas precisely so staleness costs no page fetches: this
   * listing answers for the entire review queue at once. A TRUNCATED listing is refused
   * rather than used, because it is a short listing: every path it omits would read as
   * "source missing", and a digest over what did come back would cover less than the page.
   */
  async function readTree(commitSha) {
    const sha = normalizeGitObjectId(commitSha);
    const key = `${settings.repo}@${sha}`;
    const cached = trees ? trees.get(key) : null;
    if (cached) return cached;

    const response = await githubRequest(fetchImpl, gitTreeUrl(settings, sha), {
      headers: githubHeaders(settings.token),
    });
    const payload = await githubJson(response);
    if (!Array.isArray(payload.tree) || payload.truncated === true) {
      throw new GithubError('github_response_invalid', 502);
    }
    const blobs = new Map();
    for (const entry of payload.tree) {
      if (isRecord(entry) && entry.type === 'blob' && typeof entry.path === 'string') {
        blobs.set(entry.path, normalizeGitObjectId(entry.sha));
      }
    }
    if (trees) {
      trees.set(key, blobs);
      while (trees.size > TREE_CACHE_LIMIT) trees.delete(trees.keys().next().value);
    }
    return blobs;
  }

  async function headOf(branch) {
    const response = await githubRequest(
      fetchImpl,
      gitRepositoryUrl(settings, `ref/heads/${branch}`),
      { headers: githubHeaders(settings.token) },
    );
    const payload = await githubJson(response);
    if (payload.object?.type !== 'commit') {
      throw new GithubError('github_response_invalid', 502);
    }
    return normalizeGitObjectId(payload.object.sha);
  }

  async function head() {
    return headOf(settings.branch);
  }

  /**
   * Commits reachable from `sha` (a branch or commit), newest first, optionally only those
   * touching `path` and inside [since, until). Read-only; used by the Re-sign by change view.
   */
  async function listCommits({ sha, path = '', since = '', until = '', perPage = 100 } = {}) {
    const query = new URLSearchParams({ sha, per_page: String(perPage) });
    if (path) query.set('path', path);
    if (since) query.set('since', since);
    if (until) query.set('until', until);
    const response = await githubRequest(
      fetchImpl,
      `${GITHUB_API}/repos/${settings.repo}/commits?${query}`,
      { headers: githubHeaders(settings.token) },
    );
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new GithubError('github_response_invalid', 502);
    }
    if (!Array.isArray(payload)) throw new GithubError('github_response_invalid', 502);
    return payload.filter(isRecord);
  }

  /** One commit's metadata (parents, message) from the git data API — no file list or patches. */
  async function gitCommit(sha) {
    const response = await githubRequest(
      fetchImpl,
      gitRepositoryUrl(settings, `commits/${normalizeGitObjectId(sha)}`),
      { headers: githubHeaders(settings.token) },
    );
    return githubJson(response);
  }

  /**
   * Keep the attestation branch from drifting behind the base branch.
   *
   * A stale branch is the one failure mode that loses data: its reviewed.json
   * predates whatever landed on the base since, so merging the rolling PR would
   * revert those entries. Fast-forwarding is only safe when the branch carries
   * nothing of its own, so this moves the ref exactly when `ahead_by === 0`.
   * With unmerged attestations present it leaves the branch alone — merging the
   * PR is then the operation that reconciles the two.
   *
   * No-op when the branch IS the base branch.
   */
  async function ensureBranchFresh() {
    if (!settings.isolated) return { action: 'skipped' };
    const baseHead = await headOf(settings.baseBranch);

    let branchHead;
    try {
      branchHead = await headOf(settings.branch);
    } catch (error) {
      if (!(error instanceof GithubError && error.notFound)) throw error;
      await githubRequest(fetchImpl, gitRepositoryUrl(settings, 'refs'), {
        method: 'POST',
        headers: githubHeaders(settings.token),
        body: JSON.stringify({ ref: `refs/heads/${settings.branch}`, sha: baseHead }),
      });
      return { action: 'created', head: baseHead };
    }

    if (branchHead === baseHead) return { action: 'current', head: branchHead };

    const compareResponse = await githubRequest(
      fetchImpl,
      `${GITHUB_API}/repos/${settings.repo}/compare/`
        + `${encodeURIComponent(settings.baseBranch)}...${encodeURIComponent(settings.branch)}`,
      { headers: githubHeaders(settings.token) },
    );
    const comparison = await githubJson(compareResponse);
    if (typeof comparison.ahead_by !== 'number' || typeof comparison.behind_by !== 'number') {
      throw new GithubError('github_response_invalid', 502);
    }
    if (comparison.ahead_by > 0) {
      // Unmerged attestations are waiting in the rolling PR. Do not touch them.
      return { action: 'pending', head: branchHead, ahead: comparison.ahead_by };
    }
    if (comparison.behind_by === 0) return { action: 'current', head: branchHead };

    await githubRequest(
      fetchImpl,
      gitRepositoryUrl(settings, `refs/heads/${settings.branch}`),
      {
        method: 'PATCH',
        headers: githubHeaders(settings.token),
        body: JSON.stringify({ sha: baseHead, force: false }),
      },
    );
    return { action: 'fast-forwarded', head: baseHead, behind: comparison.behind_by };
  }

  /**
   * One rolling pull request, not one per attestation.
   *
   * Housekeeping: a failure here must never lose an attestation that already
   * committed, so callers treat a thrown error as non-fatal.
   */
  /** Read-only half of the rolling-PR housekeeping: the open PR's URL, or null. */
  async function findRollingPullRequest() {
    const owner = settings.repo.split('/')[0];
    const query = `head=${encodeURIComponent(`${owner}:${settings.branch}`)}`
      + `&base=${encodeURIComponent(settings.baseBranch)}&state=open`;
    const listResponse = await githubRequest(
      fetchImpl,
      `${GITHUB_API}/repos/${settings.repo}/pulls?${query}`,
      { headers: githubHeaders(settings.token) },
    );
    // githubJson() requires an object; the pulls list is an array, so read it directly.
    let open;
    try {
      open = await listResponse.json();
    } catch {
      throw new GithubError('github_response_invalid', 502);
    }
    if (!Array.isArray(open)) throw new GithubError('github_response_invalid', 502);
    return open.length ? githubHttpsUrl(open[0]?.html_url) : null;
  }

  /**
   * Read-only probe behind the load-time base-lag alarm. The August 2026 freeze
   * was silent precisely because nothing looked at this state between writes:
   * three attestations sat on the branch with no rolling PR while the base fell
   * nine commits behind, for four days (#415 landed them). This reports the
   * comparison and whether it deserves an alarm — and, being a probe, it never
   * touches a ref and never opens a PR.
   */
  async function describeBranchSync() {
    if (!settings.isolated) return { isolated: false, alarmed: false, reasons: [] };
    const threshold = settings.lagAlarmThreshold;
    const baseHead = await headOf(settings.baseBranch);

    let branchHead;
    try {
      branchHead = await headOf(settings.branch);
    } catch (error) {
      if (!(error instanceof GithubError && error.notFound)) throw error;
      // No branch yet: the next write creates it from the base. Nothing to alarm.
      return {
        isolated: true, branchMissing: true, aheadBy: 0, behindBy: 0,
        rollingPr: null, rollingPrChecked: false, threshold, reasons: [], alarmed: false,
        branch: settings.branch, baseBranch: settings.baseBranch,
      };
    }

    let aheadBy = 0;
    let behindBy = 0;
    if (branchHead !== baseHead) {
      const compareResponse = await githubRequest(
        fetchImpl,
        `${GITHUB_API}/repos/${settings.repo}/compare/`
          + `${encodeURIComponent(settings.baseBranch)}...${encodeURIComponent(settings.branch)}`,
        { headers: githubHeaders(settings.token) },
      );
      const comparison = await githubJson(compareResponse);
      if (typeof comparison.ahead_by !== 'number' || typeof comparison.behind_by !== 'number') {
        throw new GithubError('github_response_invalid', 502);
      }
      aheadBy = comparison.ahead_by;
      behindBy = comparison.behind_by;
    }

    // Only an AHEAD branch can strand: a merely-behind branch fast-forwards on
    // the next write. Two alarm signatures, both requiring unmerged attestations:
    // no route to main at all, or a base lag deep enough that the queue below is
    // meaningfully stale (#380's failure mode).
    // One list call, and only when something could actually be stranded: an
    // ahead_by of 0 has nothing waiting for a route to the base. rollingPrChecked
    // keeps "looked, found none" distinguishable from "never looked".
    const rollingPrChecked = aheadBy > 0;
    const rollingPr = rollingPrChecked ? await findRollingPullRequest() : null;
    const reasons = [];
    if (aheadBy > 0 && !rollingPr) reasons.push('stranded-no-pr');
    if (aheadBy > 0 && behindBy >= threshold) reasons.push('base-lag');
    return {
      isolated: true, aheadBy, behindBy, rollingPr, rollingPrChecked, threshold,
      reasons, alarmed: reasons.length > 0,
      branch: settings.branch, baseBranch: settings.baseBranch,
    };
  }

  async function ensureRollingPullRequest() {
    if (!settings.isolated) return null;
    const existing = await findRollingPullRequest();
    if (existing) return existing;

    const createResponse = await githubRequest(
      fetchImpl,
      `${GITHUB_API}/repos/${settings.repo}/pulls`,
      {
        method: 'POST',
        headers: githubHeaders(settings.token),
        body: JSON.stringify({
          title: 'attest: faculty review from the attestation console',
          head: settings.branch,
          base: settings.baseBranch,
          body: 'Rolling pull request for faculty attestations.\n\n'
            + 'Each sign-off in the console appends a commit here. Merge when the '
            + 'review session is done; the console fast-forwards this branch from '
            + `\`${settings.baseBranch}\` once it has been merged.`,
          maintainer_can_modify: true,
        }),
      },
    );
    const created = await githubJson(createResponse);
    return githubHttpsUrl(created.html_url);
  }

  async function writeAtHead(path, value, {
    expectedBlobSha,
    message,
    indent,
    parentHead,
  }) {
    const submittedBlobSha = normalizeGitObjectId(expectedBlobSha);
    const submittedParentHead = normalizeGitObjectId(parentHead);
    const serialized = `${JSON.stringify(value, null, indent)}\n`;
    const bytes = Buffer.from(serialized, 'utf8');
    if (path === QBANK_PATH) enforceByteLimit(bytes.byteLength, MAX_BANK_BYTES);

    const parentResponse = await githubRequest(
      fetchImpl,
      gitRepositoryUrl(settings, `commits/${submittedParentHead}`),
      { headers: githubHeaders(settings.token) },
    );
    const parent = await githubJson(parentResponse);
    const parentTree = normalizeGitObjectId(parent.tree?.sha);
    if (normalizeGitObjectId(parent.sha) !== submittedParentHead) {
      throw new GithubError('github_response_invalid', 502);
    }

    const blobResponse = await githubRequest(
      fetchImpl,
      gitRepositoryUrl(settings, 'blobs'),
      {
        method: 'POST',
        headers: githubHeaders(settings.token),
        body: JSON.stringify({
          content: bytes.toString('base64'),
          encoding: 'base64',
        }),
      },
    );
    const blob = await githubJson(blobResponse);
    const revision = normalizeGitObjectId(blob.sha);
    if (revision === submittedBlobSha) {
      throw new GithubError('github_response_invalid', 502);
    }

    const treeResponse = await githubRequest(
      fetchImpl,
      gitRepositoryUrl(settings, 'trees'),
      {
        method: 'POST',
        headers: githubHeaders(settings.token),
        body: JSON.stringify({
          base_tree: parentTree,
          tree: [{
            path,
            mode: '100644',
            type: 'blob',
            sha: revision,
          }],
        }),
      },
    );
    const tree = await githubJson(treeResponse);
    const treeSha = normalizeGitObjectId(tree.sha);

    const commitResponse = await githubRequest(
      fetchImpl,
      gitRepositoryUrl(settings, 'commits'),
      {
        method: 'POST',
        headers: githubHeaders(settings.token),
        body: JSON.stringify({
          message,
          tree: treeSha,
          parents: [submittedParentHead],
          committer: {
            name: 'Faculty Attestation Console',
            email: settings.attesterEmail,
          },
        }),
      },
    );
    const commitPayload = await githubJson(commitResponse);
    const commitSha = normalizeGitObjectId(commitPayload.sha);
    const commit = typeof commitPayload.html_url === 'string' ? commitPayload.html_url : null;
    let commitUrl;
    try {
      commitUrl = new URL(commit);
    } catch {
      throw new GithubError('github_response_invalid', 502);
    }
    if (commitUrl.protocol !== 'https:' || commitSha === submittedParentHead) {
      throw new GithubError('github_response_invalid', 502);
    }

    let refResponse;
    try {
      refResponse = await githubRequest(
        fetchImpl,
        gitRepositoryUrl(settings, `refs/heads/${settings.branch}`),
        {
          method: 'PATCH',
          headers: githubHeaders(settings.token),
          body: JSON.stringify({ sha: commitSha, force: false }),
        },
      );
    } catch (error) {
      if (error instanceof GithubError && error.conflict) {
        throw new GithubError('github_conflict', 409, { retryable: true });
      }
      if (error instanceof GithubError && error.code === 'github_validation_failed') {
        let branchAdvanced = false;
        try {
          branchAdvanced = await head() !== submittedParentHead;
        } catch {
          // Preserve the original ref validation result when classification is unavailable.
        }
        if (branchAdvanced) {
          throw new GithubError('github_conflict', 409, { retryable: true });
        }
      }
      throw error;
    }
    const ref = await githubJson(refResponse);
    if (ref.object?.type !== 'commit'
        || normalizeGitObjectId(ref.object.sha) !== commitSha) {
      throw new GithubError('github_response_invalid', 502);
    }
    return { commit, revision };
  }

  return {
    read, readRaw, readText, readTree, write, writeText, head, headOf, writeAtHead,
    listCommits, gitCommit,
    // Identity for per-deployment memo caches (the Re-sign by change diffs): the fetch
    // implementation, exactly as the tree cache is keyed.
    cacheIdentity: typeof fetchImpl === 'function' ? fetchImpl : null,
    ensureBranchFresh, ensureRollingPullRequest, describeBranchSync,
  };
}

function invalidRepositoryFile() {
  throw new GithubError('repository_file_invalid', 502);
}

/**
 * A required file that is simply not on the branch is not a transport failure.
 *
 * 2026-09-04: shipped_pages.json landed on `main` while `attest/pending` sat five
 * attestations ahead, so every console load 404'd reading it from the attestation
 * branch. GitHub's 404 became `github_request_failed` — "The repository request
 * failed. Try again later." — and the console was dark for three days while the
 * only true statement was that a file was missing from one branch and a merge
 * would fix it. `github_request_failed` stays for genuine transport failures;
 * this names the file, the branch, and the move that ends it.
 */
function repositoryFileMissing(path, branch) {
  return new HttpError(
    'repository_file_missing',
    502,
    `\`${path}\` is not on branch \`${branch}\`. `
      + 'Update or merge the rolling review request, then retry.',
  );
}

// Reclassify only a genuine notFound; every other failure keeps its own code.
function missingIfNotFound(error, path, branch) {
  return error instanceof GithubError && error.notFound
    ? repositoryFileMissing(path, branch)
    : error;
}

async function readRequired(repository, path, branch, options = {}) {
  try {
    return await repository.read(path, options);
  } catch (error) {
    throw missingIfNotFound(error, path, options.ref || branch);
  }
}

/**
 * The one file GET may read from somewhere other than the attestation branch.
 *
 * shipped_pages.json is a DERIVED listing — the console never writes it, and the
 * build regenerates it from every producer (ADR-002). Reading it from the base
 * branch when the attestation branch has not caught up yields exactly the queue
 * the next merge would produce, so a lagging branch costs a notice rather than
 * the whole console. reviewed.json and question_bank.json are deliberately NOT
 * given this treatment: they are the ledger and its conflict keys, and reading
 * them from anywhere but the branch the writes land on is how a merge silently
 * reverts an attestation.
 */
async function readShippedPages(repository, settings) {
  try {
    return { file: await repository.read(SHIPPED_PAGES_PATH), source: 'branch' };
  } catch (error) {
    if (!settings.isolated || !(error instanceof GithubError && error.notFound)) throw error;
  }
  return {
    file: await repository.read(SHIPPED_PAGES_PATH, { ref: settings.baseBranch }),
    source: 'base',
  };
}

/**
 * The Essentials selection, read for queue ORDER only.
 *
 * `curriculum.json.essentials.{ms3,resident}` is the list of pages a learner sees first on
 * either site (validated by validate_curriculum.py E1–E6 on main). Putting those items at
 * the top of the review queue means the faculty attestations that most learners actually
 * see get signed first. It is derived, never written here, and the same branch-then-base
 * rule as shipped_pages.json applies — with one extra step: a branch copy of the file that
 * predates the key falls through to the base too, because a queue ordered by an absent
 * list is the same queue as before, not a failure.
 *
 * Advisory in both directions: any read or shape problem yields `null` and
 * `essentialsSource: 'unavailable'`, never a failed load and never an exception. An item
 * that cannot be placed is simply not flagged; nothing about attestation depends on it.
 */
function essentialSlugsFrom(json) {
  if (!isRecord(json) || !isRecord(json.essentials)) return null;
  const bySite = { ms3: new Set(), res: new Set() };
  const audiences = [['ms3', 'ms3'], ['resident', 'res']];
  let any = false;
  for (const [key, site] of audiences) {
    const sections = json.essentials[key];
    if (!Array.isArray(sections)) continue;
    for (const section of sections) {
      if (!isRecord(section) || !Array.isArray(section.refs)) continue;
      for (const ref of section.refs) {
        if (typeof ref === 'string' && ref.trim()) { bySite[site].add(ref.trim()); any = true; }
      }
    }
  }
  return any ? bySite : null;
}

async function readEssentials(repository, settings) {
  const attempts = [{ ref: undefined, source: 'branch' }];
  if (settings.isolated) attempts.push({ ref: settings.baseBranch, source: 'base' });
  for (const attempt of attempts) {
    let file;
    try {
      file = await repository.read(CURRICULUM_PATH, attempt.ref ? { ref: attempt.ref } : {});
    } catch {
      continue;
    }
    const slugs = essentialSlugsFrom(file?.json);
    if (slugs) return { slugs, source: attempt.source };
  }
  return { slugs: null, source: 'unavailable' };
}

function requireManifest(manifest) {
  if (!isRecord(manifest)) invalidRepositoryFile();
  const markdown = manifest.md ?? [];
  const tools = manifest.tools ?? [];
  if (!Array.isArray(markdown) || !Array.isArray(tools)) invalidRepositoryFile();
  for (const entry of [...markdown, ...tools]) {
    if (!Array.isArray(entry)
        || entry.length < 3
        || entry.slice(0, 3).some(value => typeof value !== 'string')) {
      invalidRepositoryFile();
    }
  }
  const manifestPages = markdown.map(([, slug]) => slug);
  if (!manifestPages.length || manifestPages.some(slug => !slug)) invalidRepositoryFile();
  return { markdown, tools, manifestPages };
}

function requireQbank(bank) {
  if (!isRecord(bank)
      || !Array.isArray(bank.items)
      || bank.items.some(item => !isRecord(item))) {
    invalidRepositoryFile();
  }
  const ids = new Set();
  for (const item of bank.items) {
    if ((Object.hasOwn(item, 'retired') && typeof item.retired !== 'boolean')
        || typeof item.id !== 'string'
        || ids.has(item.id)) {
      invalidRepositoryFile();
    }
    ids.add(item.id);
  }
  return bank;
}

function buildQbankPayload(bankFile, manifest) {
  const bank = requireQbank(bankFile.json);
  const { manifestPages } = requireManifest(manifest);
  const active = bank.items.filter(item => item.retired !== true);
  let bankAssessment;
  let qbank;
  try {
    bankAssessment = assessBank(active, { manifestPages, activeItems: active });
    qbank = active.map(item => ({
      ...item,
      revision: itemRevision(item),
      assessment: bankAssessment.byId[item.id],
    }));
  } catch {
    invalidRepositoryFile();
  }
  return {
    qbankRevision: bankFile.sha,
    manifestPages,
    qbank,
    qbankSummary: bankAssessment,
  };
}

// Mirrors 13_Faculty_Resources/reviewed.schema.json (Task 1). This handler never loads
// that schema file directly (it is Python/ajv tooling's job to fully validate the
// ledger) — these two Sets are the minimal, exact enums it needs to recognize a risk
// record as safe to surface to the browser or to preserve during a mutation.
const RISK_KINDS = new Set(['general', 'clinical', 'legal', 'formulary', 'local-policy']);
const RISK_LEVELS = new Set(['low', 'moderate', 'high']);
const MAX_REOPEN_REASON_LENGTH = 240;

// Fails soft to null: GET already renders a ledger entry defensively (a missing
// manifest slug becomes `{}`), so a malformed risk on one record must not take down
// the whole response. Content mutation below applies its own, fail-closed gate.
function validRisk(value) {
  if (!isRecord(value)) return null;
  const { kind, level } = value;
  return RISK_KINDS.has(kind) && RISK_LEVELS.has(level) ? { kind, level } : null;
}

function contentApiStatus(entry) {
  if (typeof entry.status !== 'string') return 'unreviewed';
  return entry.status === 'pending' ? 'unreviewed' : entry.status;
}

/**
 * The slug's content hash from one tree listing, or null when it cannot be computed.
 *
 * Null covers two situations with the same consequence: no site ships the slug, and an
 * attested source is absent from the tree. Neither may yield a digest, because a hash over
 * the sources that happen to be present is indistinguishable from a hash over all of them —
 * the write path refuses (400) and the read path reports the item as unverified.
 *
 * `shipped` is the RAW shipped_pages document: deriveContentUniverse drops `source` and
 * `extraSources`, so a universe entry knows the page's title and not its text.
 */
function digestForSlug(slug, { shipped, tree, topicMeta }) {
  const paths = sourcesForSlug(shipped, slug);
  if (!paths.length) return null;
  const sources = {};
  for (const path of paths) {
    const blob = tree.get(path);
    if (!blob) return null;
    sources[path] = blob;
  }
  // Own properties only: `topicMeta.constructor` would otherwise hand a function to a rule
  // whose "is this a record?" test is about what topic_meta.json actually contains.
  const record = isRecord(topicMeta) && Object.hasOwn(topicMeta, slug) ? topicMeta[slug] : null;
  return digestFromManifest(manifestForSlug(slug, sources, record));
}

/**
 * Everything a content hash is computed from, all read at the SAME ref.
 *
 * The tree is read at the attestation branch's head and the metadata from that same branch:
 * a digest whose source list came from one ref while its bytes came from another describes a
 * tree that never existed. That is also why buildState refuses to verify at all when
 * shipped_pages.json came from the base-branch fallback.
 */
async function readDigestInputs(repository, shipped, branch) {
  const head = await repository.head();
  const listed = await repository.readTree(head);
  // readRequired, not read: on the write path a topic_meta.json that is simply absent from
  // this branch must say so and name the branch, rather than reaching the reviewer as
  // "the repository request failed, try again later" — the 2026-09-04 misdiagnosis.
  const topicMetaFile = await readRequired(repository, TOPIC_META_PATH, branch);
  if (!isRecord(topicMetaFile.json)) invalidRepositoryFile();
  // The question bank is the one source whose manifest line is NOT its git blob sha: it is
  // hashed over its canonical form without any item's `status` (attestation-hash.mjs,
  // canonicalQuestionBank), or signing a question would drift the question tools. Fetched
  // only when a shipped page lists it, and written into a COPY of the listing: the memoised
  // tree is keyed by commit and must stay exactly what git said.
  let tree = listed;
  if (listed.has(QBANK_PATH) && shipsQuestionBank(shipped)) {
    const bank = await repository.readRaw(QBANK_PATH, { maxBytes: MAX_BANK_BYTES, ref: head });
    tree = new Map(listed);
    tree.set(QBANK_PATH, sourceBlobSha(QBANK_PATH, bank.bytes));
  }
  return { tree, shipped, topicMeta: topicMetaFile.json, head };
}

function shipsQuestionBank(shipped) {
  const pages = isRecord(shipped) && Array.isArray(shipped.pages) ? shipped.pages : [];
  return pages.some(page => isRecord(page)
    && (page.source === QBANK_PATH
      || (Array.isArray(page.extraSources) && page.extraSources.includes(QBANK_PATH))));
}

/**
 * What a reviewed row can still be told about the text it attested, or null when it is clean.
 *
 * The rule this encodes: a check that could not run reports that it could not run. It never
 * reports "reviewed" — "the tree call failed" and "the page is unchanged" are different
 * facts, and collapsing them is how a badge stays green through an edit nobody reviewed.
 * Only REVIEWED rows are assessed; a pending row claims nothing about page text.
 */
function contentFreshness(entry, slug, verification) {
  if (entry.status !== 'reviewed') return null;
  if (verification.freshness !== 'verified') return { reason: UNVERIFIED_REASON };
  const stored = entry.contentHash;
  if (typeof stored !== 'string' || !stored) return { reason: UNBOUND_REASON };
  let actual;
  try {
    actual = digestForSlug(slug, verification);
  } catch {
    return { reason: UNVERIFIED_REASON };
  }
  if (actual === null) return { reason: MISSING_SOURCE_REASON };
  if (actual === stored) return null;
  // Drift, and only drift, changes what the item IS: the page was reviewed and then edited,
  // so it needs review again. The ledger keeps saying `reviewed` — a read never writes it —
  // `attestation_hash.py`'s `project_effective_ledger` WILL apply the same projection to the
  // built site once PR 1b wires it into the builds; today nothing renders drift to a learner.
  const at = typeof entry.at === 'string' ? entry.at : '';
  return { drifted: true, reason: STALE_REASON.replace('{at}', at) };
}

// The console's content universe is exactly what shipped_pages.json lists — every page
// and tool either learner site publishes, whichever producer put it there (see
// faculty-console/content-universe.mjs). deriveContentUniverse throws TypeError on a
// malformed listing; that becomes the same repository_file_invalid 502 requireManifest
// already returns, because a content universe that is silently short is precisely the
// failure this change exists to end.
function buildContentItems(reviewed, shipped, verification, essentials = null) {
  if (!isRecord(reviewed)) invalidRepositoryFile();
  let universe;
  try {
    universe = deriveContentUniverse({ shipped });
  } catch {
    invalidRepositoryFile();
  }
  return universe.map(({ slug, title, kind, site, sites }) => {
    const entry = isRecord(reviewed[slug]) ? reviewed[slug] : {};
    const freshness = contentFreshness(entry, slug, verification);
    // Which learner deployments list this item in The Essentials — the pages a learner
    // sees first. Empty when it is not in either selection, or when the selection could
    // not be read (essentialsSource says which). Order only; never an attestation input.
    const essentialSites = essentials
      ? ['ms3', 'res'].filter(candidate => essentials[candidate].has(slug))
      : [];
    return {
      slug,
      title,
      kind,
      essentialSites,
      // Which learner deployment serves this item, so the console previews the resident
      // half of a Case-of-the-Week pair against the resident site.
      site,
      // EVERY deployment that publishes it — the audience the reviewer is attesting it
      // suitable for, which is not the same fact as `site` above and must be sent
      // separately. Dropping it here is what left the browser with nothing to say but
      // "third-year student" on all 22 resident-only pages (2026-09-14 review).
      sites,
      // A drifted item IS unreviewed: it was reviewed, and then the text changed.
      status: freshness?.drifted ? 'unreviewed' : contentApiStatus(entry),
      at: typeof entry.at === 'string' ? entry.at : '',
      by: typeof entry.by === 'string' ? entry.by : '',
      risk: validRisk(entry.risk),
      // Absent, not `false`, when the item is clean: a reader that forgets to check cannot
      // mistake a missing flag for a positive "verified fresh" the server never claimed.
      ...(freshness ? { stale: true } : {}),
      // "Pending reason" only: note/contentHash/claimsHash/evidenceHash/evidenceThrough
      // are internal ledger fields and must never reach the browser. A freshness finding
      // is not a ledger field — it is computed for this load — so it may be said here.
      reason: freshness?.reason
        ?? (entry.status === 'pending' && typeof entry.reason === 'string' ? entry.reason : ''),
    };
  });
}

async function buildState(repository, settings, branchSync) {
  const { student, resident, attester, branch, baseBranch } = settings;
  const reviewedFile = await readRequired(repository, REVIEWED_PATH, branch);
  const manifestFile = await readRequired(repository, MANIFEST_PATH, branch);
  let shipped;
  try {
    shipped = await readShippedPages(repository, settings);
  } catch (error) {
    throw missingIfNotFound(error, SHIPPED_PAGES_PATH, branch);
  }
  const shippedFile = shipped.file;
  const qbankFile = await readRequired(repository, QBANK_PATH, branch, {
    maxBytes: MAX_BANK_BYTES,
  });

  // Freshness is advisory to the LOAD and fail-closed to the ITEMS: a GitHub hiccup on the
  // tree call must not turn a working console into a failed load, but it also must not let a
  // single item render as reviewed-and-current when nothing checked it. `unknown` is the
  // honest third answer, and the queue banner says so.
  let verification = { freshness: 'unknown' };
  if (shipped.source === 'branch') {
    try {
      const inputs = await readDigestInputs(repository, shippedFile.json, branch);
      verification = { freshness: 'verified', ...inputs };
    } catch {
      verification = { freshness: 'unknown' };
    }
  }
  const essentials = await readEssentials(repository, settings);
  // Ledger mode: the queue is the git baseline WITH the signed sign-offs applied, exactly as
  // the learner-site build applies them — same function, same rules (ledger.mjs applyLedger).
  let reviewedDoc = reviewedFile.json;
  let effectiveQbankFile = qbankFile;
  let ledgerState = null;
  if (settings.ledger) {
    const ledger = await readLedger(repository, settings);
    const shippedSlugs = new Set((isRecord(shippedFile.json) && Array.isArray(shippedFile.json.pages)
      ? shippedFile.json.pages : []).filter(isRecord).map(page => page.slug));
    const applied = applyLedger({
      reviewed: isRecord(reviewedDoc) ? reviewedDoc : {},
      qbank: qbankFile.json,
      events: ledger.events,
      shippedSlugs,
    });
    reviewedDoc = applied.reviewed;
    effectiveQbankFile = { ...qbankFile, json: applied.qbank };
    ledgerState = {
      mode: 'on',
      branch: settings.ledger.branch,
      head: ledger.head ? { seq: ledger.head.seq, ts: ledger.head.ts } : null,
      events: ledger.events.length,
      skipped: applied.report.skipped,
      questionDrift: applied.report.questionDrift,
      published: await readPublishState(settings),
    };
  }
  const items = buildContentItems(reviewedDoc, shippedFile.json, verification, essentials.slugs);
  // The qbank half still needs the manifest itself: requireManifest both validates it and
  // yields manifestPages, the list a question may anchor to.
  requireManifest(manifestFile.json);
  const qbankPayload = buildQbankPayload(effectiveQbankFile, manifestFile.json);
  return {
    student,
    resident,
    attester,
    // manifestRevision stays the SITE MANIFEST's blob sha: it is the qbank conflict key
    // (commitQbankMutation re-reads the manifest at parent head and compares), so it must
    // keep tracking the file that gates question anchors.
    manifestRevision: manifestFile.sha,
    // The revision of the listing the review queue was built from, replacing the old
    // registryRevision. It is the blob sha ON shippedPagesBranch — which is the
    // attestation branch normally and the base branch after a fallback, never a blend
    // of the two — so a support question about a stale queue can be answered from the
    // payload alone. shippedPagesSource says which of the two it was.
    shippedPagesRevision: shippedFile.sha,
    shippedPagesSource: shipped.source,
    shippedPagesBranch: shipped.source === 'base' ? baseBranch : branch,
    // 'verified' means every reviewed item below was compared against the text it attests;
    // 'unknown' means none of them was, and no item is reported clean.
    freshness: verification.freshness,
    // Where the queue's Essentials ordering came from: 'branch', 'base', or 'unavailable'
    // (no readable selection — the queue is then ordered as before, nothing is flagged).
    essentialsSource: essentials.source,
    // How far the attestation branch trails the base. A content hash compares the page to
    // the ledger, both read from the same branch — so a branch that is behind can be
    // internally consistent and still be showing a queue that main moved past.
    branchLag: Number.isInteger(branchSync?.behindBy) && branchSync.behindBy > 0
      ? branchSync.behindBy
      : 0,
    items,
    ...qbankPayload,
    ...(ledgerState ? { ledger: ledgerState } : {}),
    counts: {
      pagesReviewed: items.filter(item => item.status === 'reviewed').length,
      pagesTotal: items.length,
      qbankAttested: qbankPayload.qbank.filter(item => item.status === 'attested').length,
      qbankTotal: qbankPayload.qbank.length,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────────────────
// Re-sign by change (read-only). Which correction changed which signed page, and what it
// said. These views never write, never sign, and never touch the branch: they answer the
// reviewer's first question about a drifted page — "what changed?" — so that re-signing is
// a review of the change rather than a re-read of the whole page. One press still signs one
// page, in the existing flow.
// ───────────────────────────────────────────────────────────────────────────────────────

const DRIFT_PREFIX = STALE_REASON.split('{at}')[0];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VIEW_SLUG = /^[A-Za-z0-9_.-]{1,200}$/;
const MAX_CHANGE_QUERIES = 160;
const CHANGE_QUERY_CONCURRENCY = 10;
const MAX_DIFF_FILE_BYTES = 1024 * 1024;
// Keyed by fetch implementation, like TREE_CACHE: a warm container reuses answers across
// requests, and each test's mock GitHub gets a cache of its own. A diff between two fixed
// commits never changes, so a hit can never be stale.
const DIFF_CACHES = new WeakMap();
const DIFF_CACHE_LIMIT = 40;

function diffCacheFor(repository) {
  let cache = DIFF_CACHES.get(repository.cacheIdentity);
  if (!cache) {
    cache = new Map();
    if (repository.cacheIdentity) DIFF_CACHES.set(repository.cacheIdentity, cache);
  }
  return cache;
}

async function mapLimit(values, limit, fn) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await fn(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

/** Pages whose signature no longer fits their text — drift, not "never bound" or "unverified". */
function driftedItems(state) {
  return state.items.filter(item => item.stale === true
    && typeof item.reason === 'string'
    && item.reason.startsWith(DRIFT_PREFIX)
    && ISO_DATE.test(item.at));
}

/**
 * Every drifted page, grouped by the commit (PR) that changed one of its source files on or
 * after the day it was signed. "On or after the day" is the honest bound for a row that only
 * records a date: it can include a same-day change the reviewer had already seen, never omit
 * one they had not. Bounded: at most MAX_CHANGE_QUERIES file histories per load; a page
 * whose history was not read is reported as unchecked, never as unchanged.
 */
async function buildChangeView(repository, settings) {
  const state = await buildState(repository, settings, null);
  const shipped = (await readShippedPages(repository, settings)).file.json;
  const drifted = driftedItems(state);
  const queries = new Map();
  const perPage = drifted.map((item) => {
    const sources = sourcesForSlug(shipped, item.slug);
    for (const path of sources) queries.set(`${path}\u0000${item.at}`, { path, at: item.at });
    return { item, sources };
  });
  const wanted = [...queries.entries()];
  const asked = wanted.slice(0, MAX_CHANGE_QUERIES);
  const histories = new Map();
  await mapLimit(asked, CHANGE_QUERY_CONCURRENCY, async ([key, { path, at }]) => {
    const commits = await repository.listCommits({
      sha: settings.baseBranch,
      path,
      since: `${at}T00:00:00Z`,
    });
    histories.set(key, commits.map(commitSummary));
  });

  const pages = [];
  const unchecked = [];
  for (const { item, sources } of perPage) {
    const keys = sources.map(path => `${path}\u0000${item.at}`);
    if (!keys.every(key => histories.has(key))) {
      unchecked.push(item.slug);
      continue;
    }
    const seen = new Set();
    const commits = [];
    for (const key of keys) {
      for (const summary of histories.get(key)) {
        if (seen.has(summary.sha)) continue;
        seen.add(summary.sha);
        commits.push(summary);
      }
    }
    pages.push({ slug: item.slug, title: item.title, kind: item.kind, at: item.at, commits });
  }
  const { groups, unexplained } = groupDriftedByChange(pages);
  return {
    view: 'changes',
    branch: settings.baseBranch,
    generatedAt: new Date().toISOString(),
    drifted: drifted.length,
    partial: unchecked.length > 0,
    groups,
    unexplained,
    unchecked: unchecked.sort(),
    // `sameDay`: the change landed on the calendar day the page was signed. A row records
    // only a date, so such a change may predate the signature and already have been read;
    // the view says so rather than guessing either way.
    pages: Object.fromEntries(pages.map(page => {
      const changes = new Map();
      for (const summary of page.commits) {
        const id = groupId(summary);
        const sameDay = summary.date.slice(0, 10) === page.at;
        changes.set(id, changes.has(id) ? changes.get(id) && sameDay : sameDay);
      }
      return [page.slug, {
        title: page.title,
        kind: page.kind,
        at: page.at,
        changes: [...changes].map(([id, sameDay]) => ({ id, sameDay })),
      }];
    })),
  };
}

async function readAt(repository, path, ref) {
  if (!ref) return { bytes: null };
  try {
    const { bytes } = await repository.readRaw(path, { ref, maxBytes: MAX_DIFF_FILE_BYTES });
    return { bytes: Buffer.from(bytes) };
  } catch (error) {
    if (error instanceof GithubError && error.notFound) return { bytes: null };
    if (error instanceof HttpError && error.code === 'qbank_too_large') return { tooLarge: true };
    throw error;
  }
}

async function fileChange(repository, path, base, head) {
  const [before, after] = await Promise.all([readAt(repository, path, base), readAt(repository, path, head)]);
  if (before.tooLarge || after.tooLarge) return { path, status: 'modified', hunks: [], tooLarge: true };
  if (before.bytes && after.bytes && before.bytes.equals(after.bytes)) return { path, status: 'unchanged', hunks: [] };
  if (!before.bytes && !after.bytes) return { path, status: 'missing', hunks: [] };
  if (before.bytes?.includes(0) || after.bytes?.includes(0)) return { path, status: 'binary', hunks: [] };
  const status = !before.bytes ? 'added' : !after.bytes ? 'removed' : 'modified';
  return {
    path,
    status,
    ...lineDiffHunks(before.bytes ? before.bytes.toString('utf8') : '', after.bytes ? after.bytes.toString('utf8') : ''),
  };
}

async function recordAt(repository, slug, ref) {
  if (!ref) return null;
  try {
    const file = await repository.read(TOPIC_META_PATH, { ref });
    return isRecord(file.json) && isRecord(file.json[slug]) ? file.json[slug] : null;
  } catch (error) {
    if (error instanceof GithubError && error.notFound) return null;
    throw error;
  }
}

/**
 * What changed on one page: either everything since the day it was signed (no `sha`), or
 * exactly what one commit changed (`sha`). Word-level hunks per source file, plus the page's
 * topic_meta record key by key (quiz, key points…) — everything its fingerprint covers.
 */
async function buildDiffView(repository, settings, slug, sha) {
  if (!VIEW_SLUG.test(slug)) throw new HttpError('changes.invalid_slug', 400, 'That page name is not valid.');
  const shipped = (await readShippedPages(repository, settings)).file.json;
  const sources = sourcesForSlug(shipped, slug);
  if (!sources.length) throw new HttpError('changes.not_shipped', 404, 'No learner site ships that page.');

  let base;
  let head;
  let commit = null;
  let since = null;
  if (sha) {
    let info;
    try {
      info = await repository.gitCommit(sha);
    } catch (error) {
      if (error instanceof GithubError && (error.notFound || error.code === 'github_response_invalid')) {
        throw new HttpError('changes.unknown_commit', 404, 'That change could not be found.');
      }
      throw error;
    }
    const parent = Array.isArray(info.parents) ? info.parents[0]?.sha : null;
    if (typeof parent !== 'string') throw new HttpError('changes.no_parent', 400, 'That change has no earlier version to compare with.');
    base = parent;
    head = normalizeGitObjectId(info.sha || sha);
    commit = commitSummary({ sha: head, commit: { message: info.message, committer: info.committer }, html_url: info.html_url });
  } else {
    const reviewedFile = await readRequired(repository, REVIEWED_PATH, settings.branch);
    let reviewed = isRecord(reviewedFile.json) ? reviewedFile.json : {};
    if (settings.ledger) {
      const ledger = await readLedger(repository, settings);
      reviewed = applyLedger({ reviewed, events: ledger.events }).reviewed;
    }
    const row = Object.hasOwn(reviewed, slug) && isRecord(reviewed[slug]) ? reviewed[slug] : null;
    if (!row || !ISO_DATE.test(row.at || '')) {
      throw new HttpError('changes.no_signature', 404, 'That page has no signing date to compare against.');
    }
    since = row.at;
    const before = await repository.listCommits({ sha: settings.baseBranch, until: `${row.at}T00:00:00Z`, perPage: 1 });
    base = typeof before[0]?.sha === 'string' ? before[0].sha : null;
    head = await repository.headOf(settings.baseBranch);
  }

  // The mode is part of the key: one commit's change and "since the day you signed" can
  // compare the same two versions yet describe themselves differently (commit vs. since).
  const cacheKey = `${settings.repo}|${sha ? 'commit' : 'since'}|${slug}|${base}|${head}`;
  const cache = diffCacheFor(repository);
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const [files, recordBefore, recordAfter] = await Promise.all([
    mapLimit(sources, 3, path => fileChange(repository, path, base, head)),
    recordAt(repository, slug, base),
    recordAt(repository, slug, head),
  ]);
  const result = {
    view: 'diff',
    slug,
    since,
    base,
    head,
    commit,
    compareUrl: base ? `https://github.com/${settings.repo}/compare/${base}...${head}` : null,
    files,
    record: recordDiff(recordBefore, recordAfter),
  };
  cache.set(cacheKey, result);
  while (cache.size > DIFF_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return result;
}

async function handleView(repository, settings, url) {
  const view = url.searchParams.get('view');
  if (view === 'changes') return buildChangeView(repository, settings);
  if (view === 'diff') {
    const sha = url.searchParams.get('sha') || '';
    if (sha && !/^[a-f0-9]{40}$/i.test(sha)) throw new HttpError('changes.invalid_commit', 400, 'That change id is not valid.');
    return buildDiffView(repository, settings, url.searchParams.get('slug') || '', sha);
  }
  throw new HttpError('unknown_view', 400, 'Choose a supported view.');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Attribution is server-derived only (ATTESTER_NAME env, cleaned here); any
// `attester` field in a request body is ignored so identity cannot be
// self-declared from the browser.
function attesterLabel(value) {
  if (typeof value !== 'string') return DEFAULT_ATTESTER;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 80);
  return cleaned || DEFAULT_ATTESTER;
}

function requireContentChanges(value) {
  if (value === undefined) return [];
  if (!isRecord(value)) {
    throw new HttpError('content.invalid_changes', 400, 'Content changes must be an object.');
  }
  const entries = Object.entries(value);
  for (const [slug, selected] of entries) {
    if (!/^[A-Za-z0-9_.-]+$/.test(slug) || typeof selected !== 'boolean') {
      throw new HttpError('content.invalid_changes', 400, 'Content changes are malformed.');
    }
  }
  return entries;
}

// Reopening is the one content mutation that carries free-text input, so — unlike
// `requireContentChanges`, whose slugs/booleans are either well-shaped or not — a
// missing reason and a malformed one are distinguishable, actionable failures for the
// console to show. Same `content.*` naming and HttpError shape as `content.invalid_changes`.
function requireReopenReason(value) {
  if (value === undefined) {
    throw new HttpError(
      'content.reason_required',
      400,
      'A reason is required to reopen this item for review.',
    );
  }
  if (typeof value !== 'string') {
    throw new HttpError('content.invalid_reason', 400, 'The reopen reason must be text.');
  }
  const reason = value.trim();
  if (!reason) {
    throw new HttpError(
      'content.reason_required',
      400,
      'A reason is required to reopen this item for review.',
    );
  }
  if (reason.length > MAX_REOPEN_REASON_LENGTH) {
    throw new HttpError(
      'content.invalid_reason',
      400,
      `The reopen reason must be ${MAX_REOPEN_REASON_LENGTH} characters or fewer.`,
    );
  }
  return reason;
}

// Fails closed, and deliberately returns nothing: risk classification belongs to a
// later queue, so this function's only job is to refuse to act on a record that does
// not already carry a valid one — never to invent or repair one. A missing or invalid
// classification is an actionable request problem (classify first), not repository
// corruption, so it gets its own code instead of the generic 502.
function requireCurrentRisk(current) {
  // No record at all = ledger/manifest drift — genuine repository corruption.
  if (!isRecord(current)) invalidRepositoryFile();
  if (!validRisk(current.risk)) {
    throw new HttpError(
      'content.missing_risk',
      400,
      'This item has no valid risk classification yet. Classify it before changing its review status.',
    );
  }
}

/**
 * The digest inputs for a WRITE, read from the attestation branch and nowhere else.
 *
 * No base-branch fallback here, unlike the read path's shipped_pages listing: the hash being
 * written is the evidence of what a clinician just reviewed, so it is computed from the same
 * ref the ledger row lands on or it is not computed at all.
 */
async function readMutationDigestInputs(repository, branch) {
  const shippedFile = await readRequired(repository, SHIPPED_PAGES_PATH, branch);
  return readDigestInputs(repository, shippedFile.json, branch);
}

function noSourceError(slug) {
  return new HttpError(
    'content.no_source',
    400,
    `\`${slug}\` has no source file in the repository tree, so a review of it cannot be `
      + 'bound to the page text. Rebuild shipped_pages.json or merge the branch, then retry.',
  );
}

async function commitContentMutation({ repository, settings, body, attester }) {
  const changes = requireContentChanges(body.changes);
  if (!changes.length) {
    return { ok: true, target: 'content', updated: 0, commit: null };
  }

  const at = today();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const file = await repository.read(REVIEWED_PATH);
    if (!isRecord(file.json)) invalidRepositoryFile();
    const reviewed = structuredClone(file.json);

    // The digest inputs are read BEFORE the no-op filter, because for an attest the filter
    // needs them. Read once per attempt, and only when something is actually being attested:
    // a reopen writes no hash and needs no tree. A retry re-reads because the branch may have
    // moved under it; the tree is memoized per commit, so a retry at the same head is free.
    const digestInputs = changes.some(([, selected]) => selected)
      ? await readMutationDigestInputs(repository, settings.branch)
      : null;
    const digests = new Map();
    const digestOf = (slug) => {
      if (!digests.has(slug)) digests.set(slug, digestForSlug(slug, digestInputs));
      return digests.get(slug);
    };

    /*
     * What counts as a change — and why status alone is the wrong question for an attest.
     *
     * A drifted row's STORED status is still `reviewed`: a read never rewrites the ledger, it
     * projects. So a status-only filter drops the one press that repairs it — the console
     * shows the item as needing review, faculty confirm, the server answers `updated: 0` with
     * no commit, and the browser reports "This content review was not saved." Re-attesting is
     * the remediation this whole feature exists to provide, so a reviewed row is a no-op only
     * while it is still BOUND: its stored hash equals the digest of today's text.
     */
    const effectiveChanges = changes.filter(([slug, selected]) => {
      const current = Object.hasOwn(reviewed, slug) && isRecord(reviewed[slug])
        ? reviewed[slug]
        : null;
      const status = current ? current.status : '';
      if (!selected) return status !== 'pending';
      if (status !== 'reviewed') return true;
      // `undefined` (never bound) and a stale value are both real work. So is `null` from
      // digestOf — the digest cannot be computed, which the write below refuses outright
      // rather than passing off as "nothing to do".
      return current.contentHash !== digestOf(slug);
    });
    if (!effectiveChanges.length) {
      return { ok: true, target: 'content', updated: 0, commit: null };
    }

    // Per-record preserve pattern (Task 1 ledger contract), applied per batch entry:
    // spread the CURRENT record forward rather than replacing it, so risk/note/hashes
    // — everything this handler does not itself own — survive attest and reopen alike.
    // The one exception is `contentHash` on an attest: the act of attesting is precisely
    // the act of binding this review to today's text, so a preserved hash there would
    // record a review of whatever the page said the last time somebody bound it.
    for (const [slug, selected] of effectiveChanges) {
      const current = reviewed[slug];
      requireCurrentRisk(current);
      const next = { ...current, status: selected ? 'reviewed' : 'pending', at };
      if (selected) {
        next.by = attester;
        delete next.reason;
        // Refused rather than written partially: a digest over the sources that happen to
        // be in the tree would look exactly like a digest over all of them.
        const digest = digestOf(slug);
        if (!digest) throw noSourceError(slug);
        next.contentHash = digest;
      } else {
        next.by = 'Pending faculty review';
        next.reason = requireReopenReason(body.reasons?.[slug]);
      }
      // Not a plain `reviewed[slug] = next`: a slug of literally "__proto__" would
      // otherwise reassign the object's prototype instead of setting an own property.
      // requireContentChanges()'s slug pattern does not exclude that string.
      Object.defineProperty(reviewed, slug, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: next,
      });
    }

    try {
      const saved = await repository.write(
        REVIEWED_PATH,
        reviewed,
        file.sha,
        `attest: ${effectiveChanges.length} content item(s) by ${attester} (${at})`,
        JSON_INDENT,
      );
      return {
        ok: true,
        target: 'content',
        updated: effectiveChanges.length,
        commit: saved.commit,
      };
    } catch (error) {
      if (!(error instanceof GithubError && error.conflict) || attempt === 1) throw error;
    }
  }
  throw new GithubError('github_conflict', 409, { retryable: true });
}

function mutationMessage(action, result, attester, at) {
  if (action === 'qbank.save-draft') {
    return `qbank: save draft ${result.item.id} by ${attester} (${at})`;
  }
  return `attest: ${result.ids.length} question(s) by ${attester} (${at})`;
}

function prepareQbankMutation(action, body, bank, manifestPages) {
  if (action === 'qbank.save-draft') {
    return prepareDraftSave({
      bank,
      manifestPages,
      id: body.id,
      baseRevision: body.baseRevision,
      editedItem: body.item,
    });
  }
  return prepareAttestation({
    bank,
    manifestPages,
    entries: body.items,
    confirmations: body.confirmations,
  });
}

function qbankSuccess(action, result, saved, manifestPages) {
  if (action === 'qbank.save-draft') {
    return {
      ok: true,
      action,
      updated: 1,
      commit: saved.commit,
      revision: itemRevision(result.item),
      assessment: result.assessment,
    };
  }

  const active = result.bank.items.filter(item => item.retired !== true);
  const summary = assessBank(active, { manifestPages, activeItems: active });
  const revision = {};
  const assessment = {};
  for (const id of result.ids) {
    const item = active.find(candidate => candidate.id === id);
    revision[id] = itemRevision(item);
    assessment[id] = summary.byId[id];
  }
  return {
    ok: true,
    action,
    updated: result.ids.length,
    commit: saved.commit,
    revision,
    assessment,
  };
}

function normalizeRetryTargetError(error) {
  if (error instanceof QbankActionError
      && (error.code === 'qbank.conflict' || error.code === 'qbank.unknown_item')) {
    return new QbankActionError(
      'qbank.conflict',
      'A selected question changed after you loaded it.',
      409,
    );
  }
  return error;
}

function requireManifestRevision(value) {
  if (typeof value !== 'string' || !GIT_OBJECT_ID_PATTERN.test(value)) {
    throw new QbankActionError(
      'qbank.invalid_input',
      'The loaded source manifest revision is required.',
      400,
    );
  }
  return value.toLowerCase();
}

function manifestConflict() {
  return new QbankActionError(
    'qbank.conflict',
    'The question source manifest changed after you loaded it.',
    409,
  );
}

async function commitQbankMutation({ repository, action, body, attester }) {
  const expectedManifestRevision = requireManifestRevision(body.manifestRevision);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parentHead = await repository.head();
    const bankFile = await repository.read(QBANK_PATH, {
      maxBytes: MAX_BANK_BYTES,
      ref: parentHead,
    });
    let manifestFile;
    try {
      manifestFile = await repository.read(MANIFEST_PATH, { ref: parentHead });
    } catch (error) {
      if (error instanceof GithubError && error.notFound) throw manifestConflict();
      throw error;
    }
    const { manifestPages } = requireManifest(manifestFile.json);
    if (manifestFile.sha !== expectedManifestRevision) throw manifestConflict();
    requireQbank(bankFile.json);
    let result;
    try {
      result = prepareQbankMutation(action, body, bankFile.json, manifestPages);
    } catch (error) {
      throw attempt === 1 ? normalizeRetryTargetError(error) : error;
    }
    try {
      const saved = await repository.writeAtHead(
        QBANK_PATH,
        result.bank,
        {
          expectedBlobSha: bankFile.sha,
          message: mutationMessage(action, result, attester, today()),
          indent: JSON_INDENT,
          parentHead,
        },
      );
      return qbankSuccess(action, result, saved, manifestPages);
    } catch (error) {
      if (!(error instanceof GithubError && error.conflict) || attempt === 1) throw error;
    }
  }
  throw new GithubError('github_conflict', 409, { retryable: true });
}

// ───────────────────────────────────────────────────────────────────────────────────────
// Ledger mode (ADR-003): sign, append, publish. Nothing below writes the base branch.
// ───────────────────────────────────────────────────────────────────────────────────────

const LEDGER_INVALID_MESSAGE = 'The attestation ledger failed verification, so nothing can be '
  + 'signed on top of it until it is repaired.';

/**
 * The ledger as it stands: its text, the blob sha to write over, and the VERIFIED events.
 * Verification is the same all-or-nothing check the build runs; a ledger that fails it
 * cannot be read from or appended to (a forged history must never be extended).
 */
async function readLedger(repository, settings) {
  let keysDoc = { version: 1, keys: [] };
  try {
    keysDoc = (await repository.read(KEYS_PATH)).json;
  } catch (error) {
    if (!(error instanceof GithubError && error.notFound)) throw error;
  }
  const file = await repository.readText(LEDGER_FILE, {
    ref: settings.ledger.branch,
    maxBytes: MAX_LEDGER_BYTES,
  });
  const text = file ? file.text : '';
  try {
    return { text, sha: file ? file.sha : null, keysDoc, ...verifyLedger(text, keysDoc) };
  } catch (error) {
    if (error instanceof LedgerError) {
      throw new HttpError('ledger_invalid', 502, `${LEDGER_INVALID_MESSAGE} (${error.message})`);
    }
    throw error;
  }
}

/** Which ledger seq each learner site serves right now; advisory, never fatal. */
async function readPublishState(settings) {
  const [ms3, res] = await Promise.all([
    readReceipt(settings.student, settings.fetchImpl),
    readReceipt(settings.resident, settings.fetchImpl),
  ]);
  return { ms3, res };
}

function signLedger({ ledger, drafts, attester, base, settings }) {
  try {
    return appendEvents({
      existingText: ledger.text,
      keysDoc: ledger.keysDoc,
      drafts,
      ts: new Date().toISOString(),
      by: attester,
      base,
      signer: settings.ledger.signer,
    });
  } catch (error) {
    if (error instanceof LedgerError) {
      // The one expected case: the console's key is not (yet) published in keys.json.
      throw new HttpError('ledger_unavailable', 503,
        `This sign-off could not be recorded: ${error.message}. See 13_Faculty_Resources/ledger/ACTIVATION.md.`);
    }
    throw error;
  }
}

function ledgerCommitMessage(appended, what, attester) {
  const first = appended.head.seq - appended.events.length + 1;
  const range = first === appended.head.seq ? `#${first}` : `#${first}–${appended.head.seq}`;
  return `ledger ${range}: ${what} by ${attester}`;
}

// Two rules in validate_attestation_consistency.py read the PAGE SOURCE, not the ledger, and
// a sign-off cannot change the source (the source is what is being signed). Signing across
// either would turn the next learner-site build red, so refuse here, with the reason, before
// anything is recorded:
//   · a signed manifest page whose first eight lines still announce it as unreviewed;
//   · a manifest tool whose source metadata marker states a review status that disagrees with
//     the one being recorded (today only The Interview Room and Interaction Cards carry one,
//     and both say "reviewed" — so re-signing them works and reopening them is refused).
//     Whether that marker rule should become one-way, like the resident tools', is an open
//     governance decision (ADR-003 §6), deliberately not taken here.
const PENDING_BANNER = /pending.*review|pending.*attestation|AI-drafted/i;
const TOOL_MARKER = /<!--\s*\[(?:CLERKSHIP-META v1|RC-META)\]\s*([\s\S]*?)-->/;
const MARKER_REVIEWED = new Set(['reviewed', 'attested']);

function markerStatus(text) {
  const marker = text.match(TOOL_MARKER);
  if (!marker) return null;
  const status = marker[1].match(/(?:^|\s)status="([^"\r\n]*)"/);
  return status ? status[1] : null;
}

async function refuseSourceConflicts(repository, settings, drafts, head) {
  if (!drafts.length) return;
  const manifestFile = await readRequired(repository, MANIFEST_PATH, settings.branch);
  const pages = new Map();
  const tools = new Map();
  for (const entry of Array.isArray(manifestFile.json?.md) ? manifestFile.json.md : []) {
    if (Array.isArray(entry) && typeof entry[0] === 'string') pages.set(entry[1], entry[0]);
  }
  for (const entry of Array.isArray(manifestFile.json?.tools) ? manifestFile.json.tools : []) {
    if (Array.isArray(entry) && typeof entry[0] === 'string') tools.set(entry[1], entry[0]);
  }
  for (const draft of drafts) {
    const source = draft.type === 'attest' ? (pages.get(draft.id) || tools.get(draft.id)) : tools.get(draft.id);
    if (!source) continue;
    const { bytes } = await repository.readRaw(source, { ref: head });
    const text = bytes.toString('utf8');
    if (draft.type === 'attest' && pages.has(draft.id)
        && PENDING_BANNER.test(text.split('\n').slice(0, 8).join('\n'))) {
      throw new HttpError('content.pending_banner', 400,
        `\`${draft.id}\` still says it is unreviewed in its first lines (${source}). Remove that `
          + 'banner in a content change first; a signed page whose source says it is unreviewed '
          + 'fails the learner-site build.');
    }
    if (!tools.has(draft.id)) continue;
    const status = markerStatus(text);
    if (!status) continue;
    const markerSaysReviewed = MARKER_REVIEWED.has(status);
    if ((draft.type === 'attest' && !markerSaysReviewed) || (draft.type === 'reopen' && markerSaysReviewed)) {
      throw new HttpError('content.marker_conflict', 409,
        `\`${draft.id}\` carries its own review label in its source, and it disagrees with this `
          + `${draft.type === 'attest' ? 'sign-off' : 'reopen'}. The learner-site build requires the two `
          + 'to match, and changing the label is a content change. This needs a governance decision '
          + '(ADR-003 §6) before the ledger can change this tool\'s review state.');
    }
  }
}

async function commitContentLedger({ repository, settings, body, attester }) {
  const changes = requireContentChanges(body.changes);
  if (!changes.length) return { ok: true, target: 'content', updated: 0, commit: null };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reviewedFile = await readRequired(repository, REVIEWED_PATH, settings.branch);
    if (!isRecord(reviewedFile.json)) invalidRepositoryFile();
    const ledger = await readLedger(repository, settings);
    const reviewed = applyLedger({ reviewed: reviewedFile.json, events: ledger.events }).reviewed;

    const digestInputs = changes.some(([, selected]) => selected)
      ? await readMutationDigestInputs(repository, settings.branch)
      : null;
    const digests = new Map();
    const digestOf = (slug) => {
      if (!digests.has(slug)) digests.set(slug, digestForSlug(slug, digestInputs));
      return digests.get(slug);
    };
    // Same no-op rule as the git path: a reviewed row is a no-op only while still BOUND.
    const effectiveChanges = changes.filter(([slug, selected]) => {
      const current = Object.hasOwn(reviewed, slug) && isRecord(reviewed[slug]) ? reviewed[slug] : null;
      const status = current ? current.status : '';
      if (!selected) return status !== 'pending';
      if (status !== 'reviewed') return true;
      return current.contentHash !== digestOf(slug);
    });
    if (!effectiveChanges.length) return { ok: true, target: 'content', updated: 0, commit: null };

    const base = digestInputs ? digestInputs.head : await repository.head();
    const drafts = [];
    for (const [slug, selected] of effectiveChanges) {
      requireCurrentRisk(Object.hasOwn(reviewed, slug) ? reviewed[slug] : null);
      if (selected) {
        const digest = digestOf(slug);
        if (!digest) throw noSourceError(slug);
        drafts.push({ type: 'attest', kind: 'content', id: slug, contentHash: digest });
      } else {
        drafts.push({ type: 'reopen', kind: 'content', id: slug, reason: requireReopenReason(body.reasons?.[slug]) });
      }
    }
    await refuseSourceConflicts(repository, settings, drafts, base);

    const appended = signLedger({ ledger, drafts, attester, base, settings });
    try {
      const saved = await repository.writeText({
        path: LEDGER_FILE,
        text: appended.text,
        sha: ledger.sha,
        message: ledgerCommitMessage(appended, `${drafts.length} content item(s)`, attester),
        branch: settings.ledger.branch,
      });
      return {
        ok: true,
        target: 'content',
        updated: drafts.length,
        commit: saved.commit,
        ledger: { seq: appended.head.seq },
      };
    } catch (error) {
      if (!(error instanceof GithubError && error.conflict) || attempt === 1) throw error;
    }
  }
  throw new GithubError('github_conflict', 409, { retryable: true });
}

async function commitQbankLedger({ repository, settings, body, attester }) {
  const expectedManifestRevision = requireManifestRevision(body.manifestRevision);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const head = await repository.head();
    const bankFile = await repository.read(QBANK_PATH, { maxBytes: MAX_BANK_BYTES, ref: head });
    let manifestFile;
    try {
      manifestFile = await repository.read(MANIFEST_PATH, { ref: head });
    } catch (error) {
      if (error instanceof GithubError && error.notFound) throw manifestConflict();
      throw error;
    }
    const { manifestPages } = requireManifest(manifestFile.json);
    if (manifestFile.sha !== expectedManifestRevision) throw manifestConflict();
    requireQbank(bankFile.json);
    const ledger = await readLedger(repository, settings);
    const bank = applyLedger({ reviewed: {}, qbank: bankFile.json, events: ledger.events }).qbank;
    let result;
    try {
      result = prepareAttestation({
        bank,
        manifestPages,
        entries: body.items,
        confirmations: body.confirmations,
      });
    } catch (error) {
      throw attempt === 1 ? normalizeRetryTargetError(error) : error;
    }
    const drafts = result.ids.map((id) => ({
      type: 'attest',
      kind: 'question',
      id,
      itemHash: questionItemHash(result.bank.items.find(item => item?.id === id)),
    }));
    const appended = signLedger({ ledger, drafts, attester, base: head, settings });
    try {
      const saved = await repository.writeText({
        path: LEDGER_FILE,
        text: appended.text,
        sha: ledger.sha,
        message: ledgerCommitMessage(appended, `${drafts.length} question(s)`, attester),
        branch: settings.ledger.branch,
      });
      return { ...qbankSuccess('qbank.attest', result, saved, manifestPages), ledger: { seq: appended.head.seq } };
    } catch (error) {
      if (!(error instanceof GithubError && error.conflict) || attempt === 1) throw error;
    }
  }
  throw new GithubError('github_conflict', 409, { retryable: true });
}

async function publishNow(repository, settings) {
  const ledger = await readLedger(repository, settings);
  return publishLedger({
    head: ledger.head ? { seq: ledger.head.seq, ts: ledger.head.ts } : null,
    sites: {
      ms3: { url: settings.student, hook: settings.ledger.hooks.ms3 },
      res: { url: settings.resident, hook: settings.ledger.hooks.res },
    },
    fetchImpl: settings.fetchImpl,
    force: true,
  });
}

async function handleLedgerPost({ repository, settings, body, attester }) {
  if (body.action === 'branch.ensure-pr') {
    // There is no rolling PR in ledger mode; say so rather than fail an old console tab.
    return { ok: true, pullRequest: null, ledger: true };
  }
  if (body.action === 'ledger.publish') {
    return { ok: true, publish: await publishNow(repository, settings) };
  }
  if (body.target === 'content') {
    return commitContentLedger({ repository, settings, body, attester });
  }
  if (body.action === 'qbank.attest') {
    return commitQbankLedger({ repository, settings, body, attester });
  }
  if (body.action === 'qbank.save-draft') {
    throw new HttpError('ledger.drafts_disabled', 409,
      'With the attestation ledger on, the console signs questions but does not edit them. '
        + 'Change the wording in a content pull request; it can be signed here once it merges.');
  }
  throw new HttpError('unknown_action', 400, 'Choose a supported faculty action.');
}

async function readPostBody(request) {
  const contentLengthValue = request.headers.get('Content-Length');
  if (contentLengthValue && /^\d+$/.test(contentLengthValue)) {
    const contentLength = Number(contentLengthValue);
    if (Number.isSafeInteger(contentLength) && contentLength > MAX_POST_BYTES) {
      throw new HttpError('payload_too_large', 413, 'The request body exceeds the 128 KiB safety limit.');
    }
  }

  let text;
  try {
    text = await request.text();
  } catch {
    throw new HttpError('invalid_request_body', 400, 'The request body could not be read.');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_POST_BYTES) {
    throw new HttpError('payload_too_large', 413, 'The request body exceeds the 128 KiB safety limit.');
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError('invalid_json', 400, 'The request body must be valid JSON.');
  }
  if (!isRecord(body)) {
    throw new HttpError('invalid_request', 400, 'The request body must be a JSON object.');
  }
  return body;
}

async function handlePost({ repository, settings, body, attester }) {
  if (body.target === 'qbank') {
    throw new HttpError(
      'legacy_qbank_action',
      400,
      'Use an explicit question-bank save or attestation action.',
    );
  }

  if (settings.ledger) return handleLedgerPost({ repository, settings, body, attester });

  // Reopening the rolling review request on demand. The console's own housekeeping
  // is best-effort and silent by design (an attestation that committed must not be
  // reported as failed because a PR call hiccuped) — which is how five attestations
  // reached 2026-09-04 with no route to main and nothing saying so. This is the
  // deliberate, faculty-pressed repair for exactly that state: no file is written,
  // so there is nothing to freshen first and nothing to lose if it fails.
  if (body.action === 'branch.ensure-pr') {
    return { ok: true, pullRequest: await repository.ensureRollingPullRequest() };
  }

  let mutate;
  if (body.target === 'content') {
    mutate = () => commitContentMutation({ repository, settings, body, attester });
  } else if (body.action === 'qbank.save-draft' || body.action === 'qbank.attest') {
    mutate = () => commitQbankMutation({ repository, action: body.action, body, attester });
  } else {
    throw new HttpError('unknown_action', 400, 'Choose a supported faculty action.');
  }

  // Freshen BEFORE the write: the mutation reads the file it is about to change,
  // and reading a stale branch is how a merge silently reverts newer entries.
  // This is allowed to fail the request — losing that guarantee is worse than
  // losing the attempt.
  await repository.ensureBranchFresh();
  const result = await mutate();

  // Housekeeping AFTER the write, and never fatal: the attestation is already
  // committed, so a PR hiccup must not report it as failed.
  if (result?.ok && result.commit) {
    try {
      const pullRequest = await repository.ensureRollingPullRequest();
      if (pullRequest) return { ...result, pullRequest };
    } catch {
      return { ...result, pullRequest: null, pullRequestError: true };
    }
  }
  return result;
}

export function createHandler({
  env = process.env,
  fetchImpl = globalThis.fetch,
  treeCache,
} = {}) {
  return async function facultyAttestHandler(request) {
    const context = responseContext(request, env);
    try {
      requireRequest(request);
      const originPolicy = configuredOriginPolicy(env);
      const allowedOrigin = originPolicy.origin || requestOrigin(request);
      context.allowedOrigin = allowedOrigin;
      const suppliedOrigin = request.headers.get('Origin');
      if (suppliedOrigin && suppliedOrigin !== allowedOrigin) {
        throw new HttpError('origin_not_allowed', 403, 'This origin is not allowed.');
      }

      if (request.method.toUpperCase() === 'OPTIONS') {
        return new Response(null, { status: 204, headers: responseHeaders(context) });
      }

      const facultyKey = readEnv(env, 'FACULTY_ATTEST_PASSWORD');
      if (!facultyKey) {
        throw new HttpError('server_configuration', 500, 'The faculty service is not configured.');
      }
      if (!safeEqual(request.headers.get('x-faculty-key'), facultyKey)) {
        throw new HttpError('unauthorized', 401, 'Unauthorized.');
      }
      const settings = requireServerSettings(env, fetchImpl, originPolicy);

      const repository = createRepositoryGateway({ settings, fetchImpl, treeCache });
      switch (request.method.toUpperCase()) {
        case 'GET': {
          // The read-only change views return before anything that could move a branch:
          // they are asked while a reviewer reads, and must never freshen or write.
          const url = new URL(request.url);
          if (url.searchParams.has('view')) {
            return jsonResponse(context, 200, await handleView(repository, settings, url));
          }
          // Freshen before reading, exactly where it is safe to: a branch that is
          // only BEHIND fast-forwards here, so the queue below is read from a branch
          // that already carries everything on the base — which is the state the
          // 2026-09-04 outage needed and never got, because only POST freshened.
          // A branch that is AHEAD is left alone ('pending'), same rule as the write
          // path. Advisory like the probe: freshening is an improvement to the read,
          // never a precondition for it, so a GitHub hiccup here must not turn a
          // working console into a failed load.
          let branchFresh;
          try {
            branchFresh = await repository.ensureBranchFresh();
          } catch {
            branchFresh = { action: 'error' };
          }
          // The alarm is advisory; the queue is the payload. A GitHub hiccup on
          // the probe must never turn a working console into a failed load. It runs
          // BEFORE the queue is built so the state can carry the lag it reports:
          // content hashes compare a page to the ledger, both read from the same
          // branch, so a branch trailing the base is stale in a way no hash can see.
          let branchSync;
          try {
            branchSync = await repository.describeBranchSync();
          } catch {
            branchSync = { error: true };
          }
          const state = await buildState(repository, settings, branchSync);
          return jsonResponse(context, 200, { ...state, branchSync, branchFresh });
        }
        case 'POST': {
          const body = await readPostBody(request);
          return jsonResponse(context, 200, await handlePost({
            repository,
            settings,
            body,
            attester: settings.attester,
          }));
        }
        default:
          throw new HttpError('method_not_allowed', 405, 'Method not allowed.');
      }
    } catch (error) {
      return errorResponse(context, error);
    }
  };
}

export default async function handler(request) {
  return createHandler({ env: process.env, fetchImpl: globalThis.fetch })(request);
}

export const config = {
  path: '/api/attest',
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
