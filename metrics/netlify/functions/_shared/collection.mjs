// Collection switch for the usage-analytics collector — the ONE place that decides whether the
// deployed `ev` function may write anything at all. Read by the collector (ev.mjs) and by every
// reader of the store (aggregate/cohort_function.mjs, bin/read_counters.mjs), so a writer and a
// reader can never disagree about which store or which weeks count.
//
// The switch is a COMMITTED FILE (metrics/collection.json), not an environment variable, on
// purpose: turning collection on is then a reviewed, attributable commit in the PR history —
// the same discipline as `REAL_COUNTERS_ENABLED = false` in cohort_function.mjs — and never a
// silent dashboard edit. Every field fails closed: anything malformed, missing or unexpected
// leaves writes OFF.
//
//   writes          "on" | "off". Only the exact string "on" enables writes (H1).
//   armedFromWeek   ISO week "YYYY-Www" or null. Writes need a valid week here, and no counter
//                   for an EARLIER week is ever written or read (H6). null = not armed.
//   store           Netlify Blobs store name shared by writer and readers. Switching to a new
//                   name is the clean-slate option if a period is ever found to be polluted.
//   counterCeiling  positive integer: the most any one (site, week, key) counter may reach (H5).
//
// Design and residual risk: metrics/HARDENING.md.

import { readFileSync } from 'node:fs';

const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const STORE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const DISABLED = Object.freeze({
  writesEnabled: false,
  armedFromWeek: null,
  store: 'usage-counters',
  counterCeiling: 500,
});

export function isIsoWeek(value) {
  return typeof value === 'string' && ISO_WEEK.test(value);
}

/** Normalise a raw collection.json object. Never throws; anything unexpected disables writes. */
export function parseCollection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== 1) {
    return DISABLED;
  }
  const armedFromWeek = isIsoWeek(raw.armedFromWeek) ? raw.armedFromWeek : null;
  const store = typeof raw.store === 'string' && STORE_NAME.test(raw.store) ? raw.store : null;
  const ceiling = Number.isInteger(raw.counterCeiling) && raw.counterCeiling > 0
    ? raw.counterCeiling : null;
  if (store === null || ceiling === null) return DISABLED;
  return Object.freeze({
    writesEnabled: raw.writes === 'on' && armedFromWeek !== null,
    armedFromWeek,
    store,
    counterCeiling: ceiling,
  });
}

/** True when `week` counts: armed, and not before the armed week. ISO weeks sort as strings. */
export function weekCounts(week, collection) {
  return isIsoWeek(week) && collection.armedFromWeek !== null && week >= collection.armedFromWeek;
}

/** The committed switch. A read or parse failure disables writes rather than throwing. */
export function loadCollection(url = new URL('../../../collection.json', import.meta.url)) {
  try {
    return parseCollection(JSON.parse(readFileSync(url, 'utf8')));
  } catch {
    return DISABLED;
  }
}
