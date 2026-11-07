// Pure counter logic. No network, no Netlify imports — the store is injected so
// every branch is testable offline.

import { CounterWriteError } from './blobs.mjs';

const RETRIES = 3;

/** ISO-8601 week-numbering string, e.g. "2026-W36". Weeks, never timestamps. */
export function isoWeek(date) {
  // Copy to UTC midnight so DST and local offsets cannot shift the day.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weekday: Mon=1..Sun=7. Move to the Thursday of this week; the year of
  // that Thursday is the ISO week-numbering year, by definition.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** One blob per (site, week, key). Percent-encoding keeps ':' out of the path. */
export function blobKey(site, week, eventKey) {
  return `${site}/${week}/${encodeURIComponent(eventKey)}`;
}

/** A persisted cap is sticky; legacy rows at/above the configured ceiling are capped too. */
export function isCappedCounter(row, ceiling) {
  return row?.capped === true ||
    (Number.isInteger(ceiling) && ceiling > 0 && Number.isInteger(row?.n) && row.n >= ceiling);
}

/**
 * Bounded optimistic concurrency using the Blobs ETag/conditional-write contract.
 * Every write (including first creation and legacy cap normalization) is conditional:
 * a stale request cannot overwrite a newer count or erase its contamination marker.
 * Conflicts re-read strongly, at most RETRIES times; there is no unconditional fallback.
 *
 * H5: a capped counter is terminal, even if a later configuration raises/removes the ceiling.
 * Store only the existing four fields plus optional `capped`; no per-event data or timestamps.
 */
export async function increment(store, { site, week, key }, { ceiling } = {}) {
  const cap = Number.isInteger(ceiling) && ceiling > 0 ? ceiling : null;
  const path = blobKey(site, week, key);
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const snapshot = await store.getWithMetadata(path, { type: 'json', consistency: 'strong' });
      const current = snapshot?.data;
      const prev = Number.isInteger(current?.n) ? current.n : 0;
      if (current?.capped === true) return cap === null ? prev : Math.min(prev, cap);
      // An absent ETag must never turn onlyIfMatch into a truthy check's unconditional write.
      if (snapshot !== null && (typeof snapshot?.etag !== 'string' || !snapshot.etag)) {
        throw new Error('counter snapshot has no ETag');
      }
      const n = cap === null ? prev + 1 : Math.min(prev + 1, cap);
      const row = cap !== null && n >= cap
        ? { site, week, key, n, capped: true }
        : { site, week, key, n };
      const condition = snapshot === null ? { onlyIfNew: true } : { onlyIfMatch: snapshot.etag };
      const result = await store.setJSON(path, row, condition);
      if (result?.modified === true) return n;
      lastError = new Error('counter write conflict');
    } catch (err) {
      // The SDK already finished/retried this write; do not restart it on a
      // permanent HTTP failure or an uncertain transport outcome.
      if (err instanceof CounterWriteError) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
