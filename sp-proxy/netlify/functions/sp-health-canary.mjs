import { randomBytes } from 'node:crypto';

import { getStore } from '@netlify/blobs';

import {
  createFailureReceipt,
  isUtcTimestamp,
  validateHealth,
} from './_shared/sp-health-receipt.mjs';

const CANONICAL_HEALTH_ORIGIN = 'https://une-ms3-psychiatry.netlify.app';
const HEALTH_STORE_NAME = 'sp-health-canary';
const HEALTH_STORE_KEY = 'latest';
const REQUEST_TIMEOUT_MS = 8_000;
const HEALTH_BODY_LIMIT = 64 * 1_024;
const GENERIC_FAILURE = 'Interview Room health canary failed.';

// The actor leg calls a real model through the proxy, so it needs a deadline of
// its own. 20s sits above a normal pinned-Haiku turn and below sp.mjs's own
// 45s provider timeout, so an unusually slow provider is recorded as
// `actor_timeout` here rather than waiting out the upstream 504.
const ACTOR_TIMEOUT_MS = 20_000;
const ACTOR_BODY_LIMIT = 64 * 1_024;
// Deliberately neutral: a plain opening question carries none of the phrasings
// the safety screen scores, so the probe measures whether the actor answers,
// not how the gate classifies it. Do not "improve" this into clinical content.
const ACTOR_PROBE_MESSAGE = 'Hello, I am one of the doctors here. What brings you in today?';
// One probe per scheduled slot, walking the reviewed cases in sorted order, so
// a per-case pack defect surfaces within a day instead of hiding behind a
// single always-probed case.
const PROBE_SLOT_MS = 6 * 60 * 60 * 1_000;

// Latency buckets for the live turn. A pinned-Haiku reply capped at 300 output
// tokens normally lands well inside FAST; NORMAL is unremarkable; SLOW means the
// provider is degrading, throttling, or something upstream changed. Four samples
// a day is enough to see drift long before it becomes an outage, and coarse
// buckets keep the receipt free of anything that tracks reply length.
const FAST_LATENCY_MS = 3_000;
const NORMAL_LATENCY_MS = 8_000;

const HEALTH_LEG_CODES = Object.freeze({
  timeout: 'timeout',
  transport: 'transport',
  status: 'http_status',
  contentType: 'content_type',
  invalidJson: 'invalid_json',
  oversize: 'contract',
});
const ACTOR_LEG_CODES = Object.freeze({
  timeout: 'actor_timeout',
  transport: 'transport',
  status: 'actor_status',
  budget: 'actor_budget',
  contentType: 'actor_contract',
  invalidJson: 'actor_contract',
  oversize: 'actor_contract',
});

class CanaryFailure extends Error {
  constructor(code) {
    super(GENERIC_FAILURE);
    this.code = code;
  }
}

function asUtcTimestamp(value) {
  if (typeof value === 'string' && isUtcTimestamp(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  throw new CanaryFailure('configuration');
}

function parseSiteOrigin(value) {
  if (typeof value !== 'string' || value.length === 0) throw new CanaryFailure('configuration');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:'
      || url.username !== ''
      || url.password !== ''
      || (url.pathname !== '/' && url.pathname !== '')
      || url.search !== ''
      || url.hash !== '') {
      throw new CanaryFailure('configuration');
    }
    return url.origin;
  } catch (error) {
    if (error instanceof CanaryFailure) throw error;
    throw new CanaryFailure('configuration');
  }
}

function requireConfiguration(readEnv) {
  const studentPasscode = readEnv('SP_STUDENT_PASSCODE');
  const allowedOrigins = readEnv('SP_ALLOWED_ORIGINS');
  const siteOrigin = parseSiteOrigin(readEnv('URL'));
  const originSet = new Set(
    typeof allowedOrigins === 'string'
      ? allowedOrigins.split(',').map((value) => value.trim()).filter(Boolean)
      : [],
  );
  if (typeof studentPasscode !== 'string'
    || studentPasscode.length === 0
    || !originSet.has(CANONICAL_HEALTH_ORIGIN)) {
    throw new CanaryFailure('configuration');
  }
  return { studentPasscode, siteOrigin };
}

async function readNextRun(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new CanaryFailure('invalid_json');
  }
  if (!body
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.keys(body).length !== 1
    || typeof body.next_run !== 'string') {
    throw new CanaryFailure('contract');
  }
  const milliseconds = Date.parse(body.next_run);
  if (!Number.isFinite(milliseconds)) throw new CanaryFailure('contract');
  const canonical = new Date(milliseconds).toISOString();
  if (body.next_run !== canonical
    && body.next_run !== canonical.replace(/\.000Z$/, 'Z')) {
    throw new CanaryFailure('contract');
  }
  return canonical;
}

function safeLog(log, failureCode) {
  try {
    log(Object.freeze({
      event: 'sp-health-canary',
      state: 'failed',
      failureCode,
    }));
  } catch {
    // Logging must never replace the durable receipt or leak an exception.
  }
}

function cancelReaderBestEffort(reader) {
  try {
    Promise.resolve(reader.cancel()).catch(() => {});
  } catch {
    // Cancellation is advisory; the timeout receipt still needs to be written.
  }
}

async function readWithAbort(reader, signal, codes) {
  if (signal.aborted) {
    cancelReaderBestEffort(reader);
    throw new CanaryFailure(codes.timeout);
  }

  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => {
      cancelReaderBestEffort(reader);
      reject(new CanaryFailure(codes.timeout));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([reader.read(), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function readBoundedJson(response, signal, codes, limit) {
  const reader = response?.body?.getReader?.();
  if (!reader) throw new CanaryFailure(codes.invalidJson);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal, codes);
      if (signal.aborted) throw new CanaryFailure(codes.timeout);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new CanaryFailure(codes.invalidJson);
      total += value.byteLength;
      if (total > limit) {
        cancelReaderBestEffort(reader);
        throw new CanaryFailure(codes.oversize);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof CanaryFailure) throw error;
    if (signal.aborted || error?.name === 'AbortError') throw new CanaryFailure(codes.timeout);
    throw new CanaryFailure(codes.invalidJson);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CanaryFailure(codes.invalidJson);
  }
}

// One request, one deadline, one vocabulary of failure codes. Both legs share
// this so a change to the abort or body-bounding behaviour can never apply to
// only one of them.
async function fetchJsonLeg({
  fetchImpl,
  url,
  init,
  codes,
  timeoutMs,
  bodyLimit,
  setTimeoutImpl,
  clearTimeoutImpl,
}) {
  const controller = new AbortController();
  const timer = setTimeoutImpl(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw new CanaryFailure(
        controller.signal.aborted || error?.name === 'AbortError'
          ? codes.timeout
          : codes.transport,
      );
    }

    if (response?.status !== 200) {
      throw new CanaryFailure(
        response?.status === 429 && codes.budget ? codes.budget : codes.status,
      );
    }
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      throw new CanaryFailure(codes.contentType);
    }
    return await readBoundedJson(response, controller.signal, codes, bodyLimit);
  } catch (error) {
    if (error instanceof CanaryFailure) throw error;
    throw new CanaryFailure(
      controller.signal.aborted || error?.name === 'AbortError'
        ? codes.timeout
        : codes.transport,
    );
  } finally {
    clearTimeoutImpl(timer);
  }
}

function selectProbeCaseId(caseIds, checkedAt) {
  const slot = Math.floor(Date.parse(checkedAt) / PROBE_SLOT_MS);
  if (!Number.isFinite(slot) || caseIds.length === 0) throw new CanaryFailure('contract');
  const index = ((slot % caseIds.length) + caseIds.length) % caseIds.length;
  return caseIds[index];
}

function defaultEncounterId() {
  return randomBytes(16).toString('base64url');
}

// An unreadable clock classifies as `slow` rather than `fast`: a broken
// measurement must not be able to report that everything is quick.
function latencyBucket(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'slow';
  if (elapsedMs < FAST_LATENCY_MS) return 'fast';
  if (elapsedMs < NORMAL_LATENCY_MS) return 'normal';
  return 'slow';
}

// Returns nothing. The actor's words are read, measured, and dropped inside
// this function — there is no return path, log line, or receipt field through
// which a patient reply can leave it (D6).
async function probeActor({
  fetchImpl,
  siteOrigin,
  studentPasscode,
  caseId,
  encounterId,
  setTimeoutImpl,
  clearTimeoutImpl,
}) {
  const body = await fetchJsonLeg({
    fetchImpl,
    url: `${siteOrigin}/api/sp`,
    init: {
      method: 'POST',
      headers: {
        Origin: CANONICAL_HEALTH_ORIGIN,
        'x-student-key': studentPasscode,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caseId,
        encounterId,
        message: ACTOR_PROBE_MESSAGE,
        mode: 'converse',
        turnId: 1,
        turns: [],
      }),
      redirect: 'error',
    },
    codes: ACTOR_LEG_CODES,
    timeoutMs: ACTOR_TIMEOUT_MS,
    bodyLimit: ACTOR_BODY_LIMIT,
    setTimeoutImpl,
    clearTimeoutImpl,
  });

  if (!body
    || typeof body !== 'object'
    || Array.isArray(body)
    || typeof body.reply !== 'string'
    || body.reply.trim().length === 0
    || !body.state
    || typeof body.state !== 'object'
    || Array.isArray(body.state)) {
    throw new CanaryFailure('actor_contract');
  }
}

export function createHealthCanary({
  readEnv,
  fetchImpl,
  store,
  log = () => {},
  now = () => new Date().toISOString(),
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  newEncounterId = defaultEncounterId,
  // Separate from `now`, which produces the receipt's ISO timestamps. Durations
  // want a millisecond counter, and keeping them apart means measuring the turn
  // cannot perturb what the receipt records as its checked-at time.
  elapsedNow = () => Date.now(),
} = {}) {
  if (typeof readEnv !== 'function'
    || typeof fetchImpl !== 'function'
    || typeof store?.setJSON !== 'function'
    || typeof now !== 'function'
    || typeof setTimeoutImpl !== 'function'
    || typeof clearTimeoutImpl !== 'function'
    || typeof newEncounterId !== 'function'
    || typeof elapsedNow !== 'function') {
    throw new Error('Invalid health canary dependencies.');
  }

  return async function healthCanary(request) {
    const checkedAt = asUtcTimestamp(now());
    let failureCode = 'configuration';
    try {
      const { studentPasscode, siteOrigin } = requireConfiguration(readEnv);
      const nextRun = await readNextRun(request);

      // Leg 1 — contract. Cheap, no provider call, and it yields the reviewed
      // case IDs the actor probe needs. Running it first means a broken deploy
      // is caught without spending a turn against the rotation budget.
      const body = await fetchJsonLeg({
        fetchImpl,
        url: `${siteOrigin}/api/sp`,
        init: {
          method: 'GET',
          headers: {
            Origin: CANONICAL_HEALTH_ORIGIN,
            'x-student-key': studentPasscode,
            Accept: 'application/json',
          },
          redirect: 'error',
        },
        codes: HEALTH_LEG_CODES,
        timeoutMs: REQUEST_TIMEOUT_MS,
        bodyLimit: HEALTH_BODY_LIMIT,
        setTimeoutImpl,
        clearTimeoutImpl,
      });
      let health;
      try {
        health = validateHealth(body);
      } catch (error) {
        if (error instanceof CanaryFailure) throw error;
        throw new CanaryFailure('contract');
      }

      // Leg 2 — capability. `mode:open` returns pack copy with no provider call,
      // so reachability alone once reported a healthy Interview Room that could
      // not produce a single patient reply. This spends one real turn.
      //
      // Gated on learnerReady, which is not a nicety: sp.mjs refuses every POST
      // unless the pack status is in POST_PACK_STATUSES, and that set is exactly
      // the set that makes learnerReady true. Probing a draft pack would fail on
      // every run forever and paint the health surface red for what is correct
      // behaviour. So the canary uses a live actor POST exactly when learners
      // can, and never otherwise.
      //
      // The clock stays out here rather than inside probeActor, so that function
      // keeps returning nothing at all and the D6 argument above it holds
      // literally: it has no return path a reply could ever travel.
      let replyLatencyBucket = 'not-probed';
      if (health.learnerReady) {
        const startedAt = elapsedNow();
        await probeActor({
          fetchImpl,
          siteOrigin,
          studentPasscode,
          caseId: selectProbeCaseId(health.caseIds, checkedAt),
          encounterId: newEncounterId(),
          setTimeoutImpl,
          clearTimeoutImpl,
        });
        replyLatencyBucket = latencyBucket(elapsedNow() - startedAt);
      }

      const successReceipt = Object.freeze({
        schemaVersion: 1,
        state: 'success',
        learnerReady: health.learnerReady,
        // True only when a live turn actually completed. On a draft pack this is
        // an honest false: nothing was probed because nothing is being served.
        actorReady: health.learnerReady,
        replyLatencyBucket,
        caseCount: health.caseCount,
        checkedAt,
        nextRun,
        contractSha256: health.contractSha256,
        // Which pack content was serving. The proxy fetches the pack from
        // `main` at runtime with a 5-minute TTL, so what students get can change
        // without any deploy and without any commit to this repo's proxy code.
        // This is the only durable record of which one was live at a given hour.
        packSha256: health.packSha256,
      });
      try {
        await store.setJSON(HEALTH_STORE_KEY, successReceipt);
      } catch {
        throw new CanaryFailure('receipt_write');
      }
      return undefined;
    } catch (error) {
      failureCode = error instanceof CanaryFailure ? error.code : 'configuration';
      const failureReceipt = createFailureReceipt(failureCode, checkedAt);
      try {
        await store.setJSON(HEALTH_STORE_KEY, failureReceipt);
      } catch {
        // A failed Blob write leaves the prior receipt in place for late-slot detection.
      }
      safeLog(log, failureCode);
      throw new Error(GENERIC_FAILURE);
    }
  };
}

export function readRuntimeEnv(name) {
  return process.env[name];
}

export default async function handler(request) {
  const canary = createHealthCanary({
    readEnv: readRuntimeEnv,
    fetchImpl: globalThis.fetch,
    store: getStore({ name: HEALTH_STORE_NAME, consistency: 'strong' }),
    log(event) {
      console.error(JSON.stringify(event));
    },
  });
  return canary(request);
}

export const config = { schedule: '0 */6 * * *' };
