import { getStore } from '@netlify/blobs';

import { validateHealthReceipt } from './_shared/sp-health-receipt.mjs';

const HEALTH_STORE_NAME = 'sp-health-canary';
const HEALTH_STORE_KEY = 'latest';
const MAX_AGE_MS = 8 * 60 * 60 * 1_000;
const SCHEDULER_JITTER_MS = 10 * 60 * 1_000;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function boundedState(state) {
  return Object.freeze({ schemaVersion: 1, state });
}

export function createHealthStatus({
  store,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.get !== 'function' || typeof now !== 'function') {
    throw new Error('Invalid health status dependencies.');
  }

  return async function healthStatus(request) {
    if (request.method !== 'GET') return json(boundedState('method-not-allowed'), 405);

    let stored;
    try {
      stored = await store.get(HEALTH_STORE_KEY, { type: 'json' });
    } catch {
      return json(boundedState('unavailable'), 503);
    }
    if (stored === null) return json(boundedState('missing'), 503);

    let receipt;
    try {
      receipt = validateHealthReceipt(stored);
    } catch {
      return json(boundedState('malformed'), 503);
    }
    if (receipt.state === 'failed') return json(receipt, 503);

    const nowMs = Date.parse(now());
    const checkedAtMs = Date.parse(receipt.checkedAt);
    const nextRunMs = Date.parse(receipt.nextRun);
    if (!Number.isFinite(nowMs) || nowMs < checkedAtMs) {
      return json(boundedState('malformed'), 503);
    }
    if (nowMs > nextRunMs + SCHEDULER_JITTER_MS) {
      return json(Object.freeze({ ...receipt, state: 'late-slot' }), 503);
    }
    if (nowMs - checkedAtMs > MAX_AGE_MS) {
      return json(Object.freeze({ ...receipt, state: 'stale' }), 503);
    }
    return json(receipt, 200);
  };
}

export default async function handler(request) {
  const status = createHealthStatus({
    store: getStore({ name: HEALTH_STORE_NAME, consistency: 'strong' }),
  });
  return status(request);
}

export const config = Object.freeze({
  path: '/api/sp/health-status',
  method: ['GET'],
});
