// Scheduled reaper for real-time (speech-to-speech) encounters.
//
// Every five minutes: hang up every active call past its deadline and mark it
// reaped. This is one of the wall-clock stops the design relies on (the others
// are the receipt deadline, the hangup on every proxy touch of an expired
// receipt, and op=end). It is deliberately independent of SP_REALTIME_ENABLED:
// sessions started before a disable must still be hung up, so the reaper runs
// whenever it has a ledger and a key, and says so when it does not.
//
// Nothing here reads dialogue. The ledger holds call ids and numbers; the log
// carries counts and stable codes.

import { getStore } from '@netlify/blobs';

import { readEnv } from './_shared/sp-http.mjs';
import { PRODUCTION_BUDGET_STORE_NAME } from './_shared/sp-budget.mjs';
import {
  PRODUCTION_REALTIME_NAMESPACE,
  createRealtimeLedger,
} from './_shared/sp-realtime-ledger.mjs';
import { createRealtimeProvider } from './_shared/sp-realtime-provider.mjs';
import { reapExpired, runtimeRealtimeConfig, validLedgerPolicy } from './sp-realtime.mjs';

export { reapExpired };

export const REAP_LIMIT = 25;
// Shorter than the route's exchange timeout: a hangup is a small request, and
// twenty-five of them in series must fit a scheduled invocation.
const HANGUP_TIMEOUT_MS = 8_000;

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function safeLog(logger, event) {
  try {
    logger(event);
  } catch {
    // Logging must never change the outcome of a reap.
  }
}

/**
 * @param {object} options
 * @param {(name:string) => string|undefined} options.readEnv
 * @param {Function} options.getStore     Netlify Blobs getStore (injected for tests)
 * @param {typeof fetch} options.fetchImpl
 * @param {(event:object) => void} [options.logger]
 * @param {() => number} [options.clock]
 */
export function createReaperHandler({
  readEnv: read,
  getStore: openStore,
  fetchImpl,
  logger = () => {},
  clock = Date.now,
} = {}) {
  if (
    typeof read !== 'function'
    || typeof openStore !== 'function'
    || typeof fetchImpl !== 'function'
    || typeof logger !== 'function'
    || typeof clock !== 'function'
  ) {
    throw new Error('Invalid reaper dependencies.');
  }

  return async function reaperHandler() {
    const runtime = runtimeRealtimeConfig(read);
    const apiKey = read('OPENAI_API_KEY');
    if (!nonempty(apiKey)) {
      safeLog(logger, { event: 'sp_realtime_reaper_skipped', reason: 'missing_api_key' });
      return jsonResponse({ reaped: 0, failed: 0, deferred: 0, skipped: 'missing_api_key' });
    }
    if (!validLedgerPolicy(runtime)) {
      safeLog(logger, { event: 'sp_realtime_reaper_skipped', reason: 'invalid_configuration' });
      return jsonResponse({ reaped: 0, failed: 0, deferred: 0, skipped: 'invalid_configuration' });
    }

    let result;
    try {
      const ledger = createRealtimeLedger({
        store: openStore({ name: PRODUCTION_BUDGET_STORE_NAME, consistency: 'strong' }),
        namespace: PRODUCTION_REALTIME_NAMESPACE,
        rotationId: runtime.rotationId,
        capMicros: runtime.capMicros,
        startLimit: runtime.startLimit,
        windowLimit: runtime.windowLimit,
        clock,
      });
      const provider = createRealtimeProvider({
        fetchImpl,
        readApiKey: () => apiKey,
        timeoutMs: HANGUP_TIMEOUT_MS,
      });
      result = await reapExpired({ ledger, provider, limit: REAP_LIMIT, logger });
    } catch (error) {
      // The ledger could not be read (or a dependency refused to build): there
      // was nothing to iterate, and the next run tries again.
      const code = typeof error?.code === 'string' ? error.code : 'internal_error';
      safeLog(logger, { event: 'sp_realtime_reaper_failed', code });
      return jsonResponse({ error: { code } }, Number.isInteger(error?.status) ? error.status : 503);
    }
    return jsonResponse({ reaped: result.reaped, failed: result.failed, deferred: result.deferred });
  };
}

let defaultHandler = null;

export default async function handler(request) {
  if (defaultHandler === null) {
    defaultHandler = createReaperHandler({
      readEnv,
      getStore,
      fetchImpl: globalThis.fetch,
      logger(event) { console.info(JSON.stringify(event)); },
    });
  }
  return defaultHandler(request);
}

export const config = { schedule: '*/5 * * * *' };
