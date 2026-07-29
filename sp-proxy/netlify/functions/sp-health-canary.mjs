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

async function readWithAbort(reader, signal) {
  if (signal.aborted) {
    cancelReaderBestEffort(reader);
    throw new CanaryFailure('timeout');
  }

  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => {
      cancelReaderBestEffort(reader);
      reject(new CanaryFailure('timeout'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([reader.read(), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function readBoundedJson(response, signal) {
  const reader = response?.body?.getReader?.();
  if (!reader) throw new CanaryFailure('invalid_json');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal);
      if (signal.aborted) throw new CanaryFailure('timeout');
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new CanaryFailure('invalid_json');
      total += value.byteLength;
      if (total > HEALTH_BODY_LIMIT) {
        cancelReaderBestEffort(reader);
        throw new CanaryFailure('contract');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof CanaryFailure) throw error;
    if (signal.aborted || error?.name === 'AbortError') throw new CanaryFailure('timeout');
    throw new CanaryFailure('invalid_json');
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
    throw new CanaryFailure('invalid_json');
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
} = {}) {
  if (typeof readEnv !== 'function'
    || typeof fetchImpl !== 'function'
    || typeof store?.setJSON !== 'function'
    || typeof now !== 'function'
    || typeof setTimeoutImpl !== 'function'
    || typeof clearTimeoutImpl !== 'function') {
    throw new Error('Invalid health canary dependencies.');
  }

  return async function healthCanary(request) {
    const checkedAt = asUtcTimestamp(now());
    let failureCode = 'configuration';
    try {
      const { studentPasscode, siteOrigin } = requireConfiguration(readEnv);
      const nextRun = await readNextRun(request);
      const controller = new AbortController();
      const timer = setTimeoutImpl(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let health;
      try {
        let response;
        try {
          response = await fetchImpl(`${siteOrigin}/api/sp`, {
            method: 'GET',
            headers: {
              Origin: CANONICAL_HEALTH_ORIGIN,
              'x-student-key': studentPasscode,
              Accept: 'application/json',
            },
            redirect: 'error',
            signal: controller.signal,
          });
        } catch (error) {
          throw new CanaryFailure(
            controller.signal.aborted || error?.name === 'AbortError' ? 'timeout' : 'transport',
          );
        }

        if (response?.status !== 200) throw new CanaryFailure('http_status');
        const contentType = response.headers?.get?.('content-type') ?? '';
        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
          throw new CanaryFailure('content_type');
        }
        const body = await readBoundedJson(response, controller.signal);
        try {
          health = validateHealth(body);
        } catch (error) {
          if (error instanceof CanaryFailure) throw error;
          throw new CanaryFailure('contract');
        }
      } catch (error) {
        if (error instanceof CanaryFailure) throw error;
        throw new CanaryFailure(
          controller.signal.aborted || error?.name === 'AbortError' ? 'timeout' : 'transport',
        );
      } finally {
        clearTimeoutImpl(timer);
      }

      const successReceipt = Object.freeze({
        schemaVersion: 1,
        state: 'success',
        learnerReady: health.learnerReady,
        caseCount: health.caseCount,
        checkedAt,
        nextRun,
        contractSha256: health.contractSha256,
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
