/**
 * Transport-level resilience for smoke specs that run against a remote origin.
 *
 * Why this exists: the specs were written against localhost, where a socket never resets.
 * The nightly production canary points those same specs at the public Netlify origins, where
 * a transient TCP reset is ordinary background noise. Without this helper a single reset
 * anywhere in ~350 tests fails the run, which is why the canary reported failure on 17 of 25
 * nights while production was healthy.
 *
 * The contract is deliberately narrow: retry the TRANSPORT and only the transport. An HTTP
 * status is an answer, not a failure to deliver one — a 404, a 5xx, or an LFS pointer stub
 * still fails immediately, because catching exactly those is the canary's job. A sustained
 * outage still fails too, once the bounded attempt budget is spent.
 *
 * Kept free of any `@playwright/test` import so the root `node --test tests/*.test.mjs`
 * suite can pin its behaviour without the Playwright devDependency. Contract tests live in
 * `tests/net-resilience.test.mjs`.
 */

/**
 * Failures that mean "the bytes did not get through", from every client the suite uses:
 * Node/undici (`request.get`), and Chromium (`route.fetch`, `page.goto`).
 *
 * Deliberately excluded:
 *  - `net::ERR_ABORTED` — the DOWNSTREAM symptom of a route handler throwing, not a transport
 *    failure of its own. Retrying it would paper over a genuine navigation abort.
 *  - Playwright's `Timeout Nms exceeded` — that is an expectation giving up, i.e. the site
 *    really did not render. Retrying it would mask exactly the regressions we watch for.
 *  - `Request context disposed` — the test has already ended; a retry can only hang.
 */
const TRANSIENT_SIGNATURES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETRESET',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
  'socket hang up',
  'other side closed',
  'net::ERR_CONNECTION_RESET',
  'net::ERR_CONNECTION_CLOSED',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_CONNECTION_ABORTED',
  'net::ERR_CONNECTION_FAILED',
  'net::ERR_NETWORK_CHANGED',
  'net::ERR_EMPTY_RESPONSE',
  'net::ERR_TIMED_OUT',
  'net::ERR_SOCKET_NOT_CONNECTED',
  'net::ERR_HTTP2_PROTOCOL_ERROR',
  'net::ERR_QUIC_PROTOCOL_ERROR',
  'net::ERR_ADDRESS_UNREACHABLE',
];

/**
 * Flatten an error and its `cause` chain into one searchable string. Node reports the code on
 * `error.cause.code`; Playwright folds it into a flat prefixed message ("route.fetch: read
 * ECONNRESET"), so both the codes and the messages have to be inspected.
 */
export function describeError(error) {
  if (typeof error === 'string') return error;
  const parts = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (current.code) parts.push(String(current.code));
    if (current.message) parts.push(String(current.message));
    current = current.cause;
  }
  if (!parts.length && error != null) parts.push(String(error));
  return parts.join(' | ');
}

/** True when the failure is a lost connection rather than a real answer from the origin. */
export function isTransientNetworkError(error) {
  const text = describeError(error);
  return TRANSIENT_SIGNATURES.some((signature) => text.includes(signature));
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/**
 * True when the suite is pointed at a real origin over the network rather than a local static
 * server. Derived from the base URL the run was given, so the production canary opts into the
 * remote budgets through the `MS3_BASE_URL` / `RES_BASE_URL` it already sets — no workflow
 * change, and therefore no collision with the scheduled-workflow step/digest pins.
 */
export function isRemoteTarget(url) {
  if (!url) return false;
  try {
    return !LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Run `operation`, retrying only transient transport failures with exponential backoff.
 *
 * `operation` must cover the body read as well as the request: production resets land
 * mid-transfer on the largest responses, so a unit that retried only the request call would
 * still fail on the read.
 *
 * @param {(attempt: number) => Promise<T>} operation
 * @param {{attempts?: number, baseDelayMs?: number, maxDelayMs?: number,
 *          onRetry?: (info: {attempt: number, reason: string, delayMs: number}) => void}} [options]
 * @returns {Promise<T>}
 * @template T
 */
export async function retryTransient(operation, options = {}) {
  const {
    attempts = 3,
    baseDelayMs = 250,
    maxDelayMs = 2_000,
    onRetry,
  } = options;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= attempts || !isTransientNetworkError(error)) throw error;
      // Exponential backoff with jitter: a reset often means the edge is shedding load, and
      // synchronised workers retrying in lockstep would just reproduce the burst.
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delayMs = Math.round(backoff * (0.5 + Math.random() * 0.5));
      if (onRetry) onRetry({ attempt, reason: describeError(error), delayMs });
      await sleep(delayMs);
    }
  }
}

/**
 * Default reporter: one line per retry on stderr, so a run that only survived because the
 * transport was retried still says so. Silent retries would turn a degrading origin into a
 * green run, which is the opposite of what a canary is for.
 */
function reportRetry(label) {
  return ({ attempt, reason, delayMs }) => {
    process.stderr.write(`  ↻ transient network retry (${label}) attempt ${attempt} in ${delayMs}ms — ${reason}\n`);
  };
}

/**
 * `route.fetch()` with transport retries. Used by the specs that rewrite a real production
 * response before fulfilling it — the pattern that produced most canary failures, because it
 * adds a second origin round-trip to every intercepted navigation.
 *
 * Playwright materialises the response body during `fetch()` itself (every observed production
 * stack pointed at the `route.fetch()` call, never at a later `.text()`/`.json()`), so wrapping
 * the call covers the mid-transfer resets too.
 */
export async function routeFetchWithRetry(route, options = {}) {
  const { retry, ...fetchOptions } = options;
  const url = route.request().url();
  return retryTransient(
    () => route.fetch(fetchOptions),
    { onRetry: reportRetry(`route.fetch ${url}`), ...retry },
  );
}

/**
 * `request.get()` (or `page.request.get()`) with transport retries. The status is returned
 * untouched — only a failure to deliver a response at all is retried.
 */
export async function requestGetWithRetry(request, url, options = {}) {
  const { retry, ...requestOptions } = options;
  return retryTransient(
    () => request.get(url, requestOptions),
    { onRetry: reportRetry(`request.get ${url}`), ...retry },
  );
}

/**
 * `request.head()` with transport retries. Matters more than it looks: the LFS check uses a
 * HEAD probe to decide whether the deploy is live, so an unretried reset there either errors
 * the test or, on a non-ok status, skips the media gate that is the whole point of the check.
 */
export async function requestHeadWithRetry(request, url, options = {}) {
  const { retry, ...requestOptions } = options;
  return retryTransient(
    () => request.head(url, requestOptions),
    { onRetry: reportRetry(`request.head ${url}`), ...retry },
  );
}
