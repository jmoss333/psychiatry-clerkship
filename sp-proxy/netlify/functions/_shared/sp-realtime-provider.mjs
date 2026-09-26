// The two OpenAI REST calls a real-time (speech-to-speech) encounter needs, and
// nothing else: the SDP exchange that answers the browser's WebRTC offer, and
// the hangup that ends the call server-side.
//
// The server key never leaves this module. The browser posts its SDP offer to
// the proxy, the proxy performs `POST /v1/realtime/calls` with the key and
// returns the answer; the browser then talks to OpenAI's media servers over the
// peer connection it holds, with no credential of its own. This is narrower
// than the provider's ephemeral client secret: a client secret is a bearer
// token the browser could use to reconfigure the session.
//
// Contract (openai-openapi `/realtime/calls`, `/realtime/calls/{call_id}/hangup`):
//   POST /v1/realtime/calls   multipart/form-data { sdp: application/sdp, session: application/json }
//                             Accept: application/sdp → 201, body = SDP answer,
//                             Location = relative URL whose LAST path segment is the call id
//   POST /v1/realtime/calls/{call_id}/hangup → 200 hung up; 404 already gone
//
// Errors are sanitised to stable codes. No error message, and no log line this
// module could feed, ever carries the key, an SDP, or the session instructions.

import { OperationalError, operationalError } from './sp-http.mjs';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const CALLS_URL = `${OPENAI_BASE_URL}/realtime/calls`;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 60_000;
const OFFER_LIMIT_BYTES = 64 * 1024;
const ANSWER_LIMIT_BYTES = 256 * 1024;
const CALL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const SAFE_ERRORS = Object.freeze({
  // The route treats invalid_configuration as fail-closed (503), like sp-voice.
  configuration: Object.freeze({ status: 503, code: 'invalid_configuration', message: 'The realtime provider is not configured.' }),
  // A malformed call INTO this module is a proxy bug, not a learner error.
  input: Object.freeze({ status: 500, code: 'invalid_configuration', message: 'The realtime provider request is invalid.' }),
  auth: Object.freeze({ status: 502, code: 'provider_auth', message: 'The realtime provider refused the server credential.' }),
  limit: Object.freeze({ status: 502, code: 'provider_limit', message: 'The realtime provider is rate limiting this account.' }),
  timeout: Object.freeze({ status: 504, code: 'provider_timeout', message: 'The realtime provider timed out.' }),
  connection: Object.freeze({ status: 502, code: 'provider_connection', message: 'The realtime provider could not be reached.' }),
  status: Object.freeze({ status: 502, code: 'provider_status', message: 'The realtime provider could not complete the request.' }),
  cancelled: Object.freeze({ status: 499, code: 'request_cancelled', message: 'The request was cancelled.' }),
});

function safeError(kind) {
  const value = SAFE_ERRORS[kind];
  return operationalError(value.status, value.code, value.message);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function defaultTimers() {
  return Object.freeze({
    setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  });
}

function validateSignal(signal) {
  if (signal === undefined) return;
  if (
    !signal
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
  ) {
    throw safeError('input');
  }
}

// One deadline per provider call. The caller's signal (the learner's request)
// aborts as 499; our own timer aborts as 504; anything else the operation
// throws is normalised to a stable provider code. Same shape as the managed
// speech provider so the two behave identically under abort.
async function withDeadline({ callerSignal, timeoutMs, timers }, operation) {
  validateSignal(callerSignal);
  if (callerSignal?.aborted) throw safeError('cancelled');

  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  let rejectBoundary;
  const boundary = new Promise((_resolve, reject) => {
    rejectBoundary = reject;
  });
  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort();
    rejectBoundary(safeError('cancelled'));
  };
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeoutId = timers.setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectBoundary(safeError('timeout'));
  }, timeoutMs);
  const providerOperation = Promise.resolve().then(() => operation(controller.signal));

  try {
    return await Promise.race([providerOperation, boundary]);
  } catch (error) {
    if (timedOut) throw safeError('timeout');
    if (callerAborted || callerSignal?.aborted) throw safeError('cancelled');
    if (error instanceof OperationalError) throw error;
    throw safeError('status');
  } finally {
    callerSignal?.removeEventListener('abort', onCallerAbort);
    timers.clearTimeout(timeoutId);
  }
}

async function cancelBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Provider cancellation detail is deliberately discarded.
  }
}

// Every non-2xx status maps to a code and nothing else: the response body is
// cancelled unread, so a provider error message can never reach a log.
async function statusError(response) {
  await cancelBody(response);
  if (response.status === 401 || response.status === 403) return safeError('auth');
  if (response.status === 429) return safeError('limit');
  return safeError('status');
}

async function providerFetch(fetchImpl, url, options) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    if (options.signal?.aborted || error?.name === 'AbortError') throw safeError('status');
    throw safeError('connection');
  }
  if (!(response instanceof Response)) throw safeError('connection');
  return response;
}

async function readBounded(response, maximumBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await cancelBody(response);
    throw safeError('status');
  }
  if (!response.body || typeof response.body.getReader !== 'function') throw safeError('status');

  const reader = response.body.getReader();
  const combined = new Uint8Array(maximumBytes);
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) {
        try { await reader.cancel(); } catch { /* discard provider details */ }
        throw safeError('status');
      }
      if (value.byteLength > maximumBytes - total) {
        try { await reader.cancel(); } catch { /* discard provider details */ }
        throw safeError('status');
      }
      combined.set(value, total);
      total += value.byteLength;
    }
  } catch {
    throw safeError('status');
  } finally {
    reader.releaseLock();
  }
  return combined.slice(0, total);
}

/**
 * The call id is the LAST path segment of the Location header. The contract
 * says "relative URL containing the call ID", which in practice has been both
 * `/v1/realtime/calls/rtc_abc` and a bare `rtc_abc`; an absolute URL is parsed
 * the same way. Query and fragment are ignored. Exported for the tests.
 */
export function parseCallId(location) {
  if (typeof location !== 'string' || location.length === 0 || location.length > 2048) return null;
  let pathname;
  try {
    pathname = new URL(location, `${OPENAI_BASE_URL}/`).pathname;
  } catch {
    return null;
  }
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  let callId;
  try {
    callId = decodeURIComponent(segments[segments.length - 1]);
  } catch {
    return null;
  }
  // `/v1/realtime/calls/` names the collection, not a call.
  if (callId === 'calls') return null;
  return CALL_ID.test(callId) ? callId : null;
}

function validateExchangeInput({ sdp, session, signal } = {}) {
  validateSignal(signal);
  if (
    typeof sdp !== 'string'
    || !sdp.startsWith('v=')
    || Buffer.byteLength(sdp, 'utf8') > OFFER_LIMIT_BYTES
    || !session
    || typeof session !== 'object'
    || Array.isArray(session)
    || session.type !== 'realtime'
    || !nonempty(session.model)
  ) {
    throw safeError('input');
  }
  return { sdp, session, signal };
}

function validateHangupInput({ callId, signal } = {}) {
  validateSignal(signal);
  if (typeof callId !== 'string' || !CALL_ID.test(callId)) throw safeError('input');
  return { callId, signal };
}

// Node 22's FormData builds the multipart body and its boundary; each part
// carries the content type the contract names. Blob parts always carry a
// filename, which the provider ignores.
function exchangeForm({ sdp, session }) {
  const form = new FormData();
  form.append('sdp', new Blob([sdp], { type: 'application/sdp' }), 'offer.sdp');
  form.append('session', new Blob([JSON.stringify(session)], { type: 'application/json' }), 'session.json');
  return form;
}

async function readAnswer(response) {
  const bytes = await readBounded(response, ANSWER_LIMIT_BYTES);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw safeError('status');
  }
  if (!text.startsWith('v=')) throw safeError('status');
  return text;
}

/**
 * @param {object} options
 * @param {typeof fetch} options.fetchImpl
 * @param {() => string|undefined} options.readApiKey   the server key, read at call time, never stored
 * @param {number} [options.timeoutMs]
 * @param {{setTimeout:Function, clearTimeout:Function}} [options.timers]
 */
export function createRealtimeProvider({
  fetchImpl,
  readApiKey,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  timers = defaultTimers(),
} = {}) {
  if (
    typeof fetchImpl !== 'function'
    || typeof readApiKey !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS
    || !timers
    || typeof timers.setTimeout !== 'function'
    || typeof timers.clearTimeout !== 'function'
  ) {
    throw operationalError(500, 'invalid_configuration', 'The realtime provider factory is not configured.');
  }

  function requireKey() {
    let rawKey;
    try {
      rawKey = readApiKey();
    } catch {
      throw safeError('configuration');
    }
    if (!nonempty(rawKey)) throw safeError('configuration');
    return rawKey.trim();
  }

  const deadline = (signal, operation) => withDeadline({ callerSignal: signal, timeoutMs, timers }, operation);

  async function exchange(rawInput) {
    const input = validateExchangeInput(rawInput);
    const key = requireKey();
    const form = exchangeForm(input);
    return deadline(input.signal, async (signal) => {
      const response = await providerFetch(fetchImpl, CALLS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/sdp' },
        body: form,
        signal,
      });
      if (!response.ok) throw await statusError(response);
      const callId = parseCallId(response.headers.get('location'));
      if (callId === null) {
        await cancelBody(response);
        throw safeError('status');
      }
      const sdp = await readAnswer(response);
      return Object.freeze({ sdp, callId });
    });
  }

  async function hangup(rawInput) {
    const input = validateHangupInput(rawInput);
    const key = requireKey();
    return deadline(input.signal, async (signal) => {
      const response = await providerFetch(fetchImpl, `${CALLS_URL}/${encodeURIComponent(input.callId)}/hangup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, Accept: '*/*' },
        signal,
      });
      // 404 is a call that already ended (the learner's peer connection closed,
      // the provider's own maximum, an earlier hangup): the outcome we wanted.
      if (response.ok || response.status === 404) {
        await cancelBody(response);
        return Object.freeze({ hungUp: true });
      }
      throw await statusError(response);
    });
  }

  return Object.freeze({ exchange, hangup });
}
