import { readFileSync } from 'node:fs';

// Side-effect import: the shared engine defines globalThis.CohortAggregate. It is the SAME file
// the director dashboard prototype loads as a classic <script> (one implementation, tested once
// in tests/director-dashboard.test.mjs).
import '../../aggregate/cohort_aggregate.js';

// F8 read-only cohort aggregate (D-F8-2, permitted by D-X-4: a function on an existing site that
// stores nothing per person).
//
// GET /api/cohort -> CohortAggregate.publish(feed): grouped, small-cell-suppressed totals only.
//
// What it never does: write anything (no Blobs writes, no files), set a cookie, log (no
// console.* at all — Netlify's platform request log is the only record), or read the request's
// body, query, headers, IP or user agent. The response is identical for every caller.
//
// REAL DATA IS HARD-DISABLED. The constant below is a literal `false`, not an environment
// variable, so flipping it needs a reviewed commit. ENABLE ONLY AFTER THE L8 D1–D3 OWNER
// DECISIONS (analytics.js build-asset fix, option choice, learner-facing footer notice) — and
// even then the real path refuses to run until a rotation calendar is wired (REAL_CALENDAR).
// Until then this function serves the committed SYNTHETIC feed and nothing else.
export const REAL_COUNTERS_ENABLED = false;
// Rotation calendar for the real path, as dashboard blocks ({ id, site, start, weeks }). null =
// not wired. Source of record: 13_Faculty_Resources/_automation/maintenance/rotation_blocks.json
// (MS3 only today; residents' block dates are not in the repository).
export const REAL_CALENDAR = null;

const syntheticPath = new URL('../../aggregate/synthetic_feed.json', import.meta.url);

function engine() {
  const A = globalThis.CohortAggregate;
  if (!A || typeof A.publish !== 'function') throw new Error('cohort engine not loaded');
  return A;
}

export function syntheticFeed() {
  return JSON.parse(readFileSync(syntheticPath, 'utf8'));
}

/**
 * Real counters from the metrics store as the aggregate contract's 4-field records. Reads only;
 * anything that is not exactly { site, week, key, n } with integer n >= 0 is dropped.
 * Reachable only through loadFeed({ realEnabled: true }), which production never passes.
 */
export async function readRealCounters(store) {
  const out = [];
  const { blobs } = await store.list();
  for (const blob of blobs) {
    const row = await store.get(blob.key, { type: 'json' });
    if (!row || typeof row !== 'object') continue;
    const { site, week, key, n } = row;
    if (typeof site !== 'string' || typeof week !== 'string' || typeof key !== 'string') continue;
    if (!Number.isInteger(n) || n < 0) continue;
    out.push({ site, week, key, n });
  }
  return out;
}

export async function loadFeed({ realEnabled = REAL_COUNTERS_ENABLED, calendar = REAL_CALENDAR, getStore } = {}) {
  if (!realEnabled) return syntheticFeed();
  if (!Array.isArray(calendar) || calendar.length === 0) {
    throw new Error('real path refused: no rotation calendar wired');
  }
  const resolveStore = getStore || (await import('@netlify/blobs')).getStore;
  const store = resolveStore('usage-counters');
  return {
    _synthetic: false,
    contractVersion: 1,
    rotationBlocks: calendar,
    counters: await readRealCounters(store),
  };
}

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};

export function createCohort({ load = () => loadFeed() } = {}) {
  return async function cohort(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    let body;
    try {
      body = JSON.stringify(engine().publish(await load()));
    } catch {
      // Fail closed and say nothing: no partial aggregate, no error detail.
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: HEADERS });
    }
    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers: HEADERS });
  };
}

export default createCohort();
