// Pure counter logic. No network, no Netlify imports — the store is injected so
// every branch is testable offline.

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

/**
 * Read-modify-write with bounded retries. Netlify Blobs has no atomic
 * increment; at cohort sizes of 4-10 a lost update costs one count, which is
 * cheaper than a transaction. Deliberate — see the plan's design note.
 */
export async function increment(store, { site, week, key }) {
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const path = blobKey(site, week, key);
      const current = await store.get(path, { type: 'json' });
      const n = (Number.isInteger(current?.n) ? current.n : 0) + 1;
      await store.setJSON(path, { site, week, key, n });
      return n;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
