// Faculty attestation — authenticated commit-on-save (Netlify Functions v2, ESM).
// Secrets remain server-side. The browser supplies only x-faculty-key.

import { assessBank } from '../../qbank-rules.mjs';
import {
  QbankActionError,
  itemRevision,
  prepareAttestation,
  prepareDraftSave,
} from './qbank-actions.mjs';

const DEFAULT_REPO = 'jmoss333/psychiatry-clerkship';
const DEFAULT_BRANCH = 'main';
const DEFAULT_STUDENT_SITE = 'https://une-ms3-psychiatry.netlify.app';
const DEFAULT_ATTESTER = 'Joshua Moss, MD';
const DEFAULT_ATTESTER_EMAIL = 'faculty@clerkship.local';

const REVIEWED_PATH = '13_Faculty_Resources/reviewed.json';
const MANIFEST_PATH = '13_Faculty_Resources/_automation/site_build/site_manifest.json';
const QBANK_PATH = 'question_bank.json';

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2026-03-10';
const MAX_POST_BYTES = 128 * 1024;
const MAX_BANK_BYTES = 4 * 1024 * 1024;
const GIT_OBJECT_ID_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

const ERROR_MESSAGES = Object.freeze({
  github_forbidden: 'The repository refused this request.',
  github_conflict: 'The repository changed during this request. Reload and try again.',
  github_validation_failed: 'The repository rejected the proposed update.',
  github_rate_limited: 'The repository is temporarily rate limited. Try again later.',
  github_request_failed: 'The repository request failed. Try again later.',
  github_unavailable: 'The repository is temporarily unavailable. Try again later.',
  github_response_invalid: 'The repository returned an invalid response.',
  repository_file_invalid: 'A required repository file is invalid.',
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
  constructor(code, status, { retryable = false } = {}) {
    super(code, status, ERROR_MESSAGES[code] || ERROR_MESSAGES.github_request_failed, { retryable });
    this.name = 'GithubError';
    this.conflict = status === 409;
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
  const studentValue = readEnv(env, 'STUDENT_SITE_URL').trim() || DEFAULT_STUDENT_SITE;
  const attesterEmail = readEnv(env, 'ATTESTER_EMAIL').trim() || DEFAULT_ATTESTER_EMAIL;

  if (!originPolicy.valid
      || !token
      || !key
      || typeof fetchImpl !== 'function'
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
      || !branch) {
    throw new HttpError('server_configuration', 500, 'The faculty service is not configured.');
  }

  let student;
  try {
    const parsed = new URL(studentValue);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    student = studentValue.replace(/\/+$/, '');
  } catch {
    throw new HttpError('server_configuration', 500, 'The faculty service is not configured.');
  }

  return { token, key, repo, branch, student, attesterEmail };
}

function githubStatusError(status) {
  switch (status) {
    case 403:
      return new GithubError('github_forbidden', 403);
    case 409:
      return new GithubError('github_conflict', 409, { retryable: true });
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

function repositoryUrl(settings, path, includeRef = true) {
  const base = `${GITHUB_API}/repos/${settings.repo}/contents/${encodedRepositoryPath(path)}`;
  return includeRef ? `${base}?ref=${encodeURIComponent(settings.branch)}` : base;
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

function createRepositoryGateway({ settings, fetchImpl }) {
  async function read(path, { maxBytes = 0 } = {}) {
    const objectResponse = await githubRequest(
      fetchImpl,
      repositoryUrl(settings, path),
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
        repositoryUrl(settings, path),
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
    return {
      json: parseRepositoryJson(bytes),
      sha,
      size: bytes.byteLength,
    };
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

  return { read, write };
}

function invalidRepositoryFile() {
  throw new GithubError('repository_file_invalid', 502);
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

function buildContentItems(reviewed, manifest) {
  if (!isRecord(reviewed)) invalidRepositoryFile();
  const { markdown, tools } = requireManifest(manifest);
  const items = [];
  for (const [, slug, title] of markdown) {
    const entry = isRecord(reviewed[slug]) ? reviewed[slug] : {};
    items.push({
      slug,
      title,
      kind: 'page',
      status: typeof entry.status === 'string' ? entry.status : 'unreviewed',
      at: typeof entry.at === 'string' ? entry.at : '',
      by: typeof entry.by === 'string' ? entry.by : '',
    });
  }
  for (const [, slug, title] of tools) {
    const entry = isRecord(reviewed[slug]) ? reviewed[slug] : {};
    items.push({
      slug,
      title,
      kind: 'tool',
      status: typeof entry.status === 'string' ? entry.status : 'unreviewed',
      at: typeof entry.at === 'string' ? entry.at : '',
      by: typeof entry.by === 'string' ? entry.by : '',
    });
  }
  return items;
}

async function buildState(repository, student) {
  const reviewedFile = await repository.read(REVIEWED_PATH);
  const manifestFile = await repository.read(MANIFEST_PATH);
  const qbankFile = await repository.read(QBANK_PATH, { maxBytes: MAX_BANK_BYTES });
  const items = buildContentItems(reviewedFile.json, manifestFile.json);
  const qbankPayload = buildQbankPayload(qbankFile, manifestFile.json);
  return {
    student,
    items,
    ...qbankPayload,
    counts: {
      pagesReviewed: items.filter(item => item.status === 'reviewed').length,
      pagesTotal: items.length,
      qbankAttested: qbankPayload.qbank.filter(item => item.status === 'attested').length,
      qbankTotal: qbankPayload.qbank.length,
    },
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

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

async function commitContentMutation({ repository, body, attester }) {
  const changes = requireContentChanges(body.changes);
  if (!changes.length) {
    return { ok: true, target: 'content', updated: 0, commit: null };
  }

  const at = today();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const file = await repository.read(REVIEWED_PATH);
    if (!isRecord(file.json)) invalidRepositoryFile();
    const reviewed = structuredClone(file.json);
    const effectiveChanges = changes.filter(([slug, selected]) => {
      const current = Object.hasOwn(reviewed, slug) && isRecord(reviewed[slug])
        ? reviewed[slug].status
        : '';
      return current !== (selected ? 'reviewed' : 'pending');
    });
    if (!effectiveChanges.length) {
      return { ok: true, target: 'content', updated: 0, commit: null };
    }
    for (const [slug, selected] of effectiveChanges) {
      Object.defineProperty(reviewed, slug, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: selected
          ? { status: 'reviewed', at, by: attester }
          : { status: 'pending', at, by: 'Pending faculty review' },
      });
    }

    try {
      const saved = await repository.write(
        REVIEWED_PATH,
        reviewed,
        file.sha,
        `attest: ${effectiveChanges.length} content item(s) by ${attester} (${at})`,
        1,
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

async function commitQbankMutation({ repository, action, body, attester }) {
  const manifestFile = await repository.read(MANIFEST_PATH);
  const { manifestPages } = requireManifest(manifestFile.json);
  let bankFile = await repository.read(QBANK_PATH, { maxBytes: MAX_BANK_BYTES });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    requireQbank(bankFile.json);
    let result;
    try {
      result = prepareQbankMutation(action, body, bankFile.json, manifestPages);
    } catch (error) {
      throw attempt === 1 ? normalizeRetryTargetError(error) : error;
    }
    try {
      const saved = await repository.write(
        QBANK_PATH,
        result.bank,
        bankFile.sha,
        mutationMessage(action, result, attester, today()),
        2,
      );
      return qbankSuccess(action, result, saved, manifestPages);
    } catch (error) {
      if (!(error instanceof GithubError && error.conflict) || attempt === 1) throw error;
      bankFile = await repository.read(QBANK_PATH, { maxBytes: MAX_BANK_BYTES });
    }
  }
  throw new GithubError('github_conflict', 409, { retryable: true });
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

async function handlePost({ repository, body }) {
  if (body.target === 'qbank') {
    throw new HttpError(
      'legacy_qbank_action',
      400,
      'Use an explicit question-bank save or attestation action.',
    );
  }
  const attester = attesterLabel(body.attester);
  if (body.target === 'content') {
    return commitContentMutation({ repository, body, attester });
  }
  if (body.action === 'qbank.save-draft' || body.action === 'qbank.attest') {
    return commitQbankMutation({
      repository,
      action: body.action,
      body,
      attester,
    });
  }
  throw new HttpError('unknown_action', 400, 'Choose a supported faculty action.');
}

export function createHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
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

      const repository = createRepositoryGateway({ settings, fetchImpl });
      switch (request.method.toUpperCase()) {
        case 'GET':
          return jsonResponse(context, 200, await buildState(repository, settings.student));
        case 'POST': {
          const body = await readPostBody(request);
          return jsonResponse(context, 200, await handlePost({ repository, body }));
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
