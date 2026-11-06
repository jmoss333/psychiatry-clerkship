#!/usr/bin/env node
// Read counters for one site+week. Honors the n<5 suppression threshold so the
// CLI cannot become a back door around the reporting rule.
//
// Store name and armed week come from the committed collection switch
// (metrics/collection.json), the same source the collector writes by. A week
// before `armedFromWeek` (or any week while unarmed) is flagged as
// NOT COUNTABLE; a cell that hit the per-counter ceiling is shown as `capped`
// and is excluded from every aggregate (metrics/HARDENING.md, H5/H6).
import { getStore } from '@netlify/blobs';

import { loadCollection, weekCounts } from '../netlify/functions/_shared/collection.mjs';

const SUPPRESS_BELOW = 5;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const site = arg('site', 'ms3');
const week = arg('week', null);
const raw = process.argv.includes('--raw');
if (!week) {
  console.error('usage: read_counters.mjs --site <ms3|res> --week <YYYY-Www> [--raw]');
  process.exit(2);
}

const collection = loadCollection();
const store = getStore(collection.store);
const { blobs } = await store.list({ prefix: `${site}/${week}/` });
const rows = [];
for (const blob of blobs) {
  const row = await store.get(blob.key, { type: 'json' });
  if (row) rows.push(row);
}
rows.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));

console.log(`${site} · ${week} · ${rows.length} counter(s) · store ${collection.store}`);
if (!weekCounts(week, collection)) {
  console.log(`  NOT COUNTABLE: armedFromWeek is ${collection.armedFromWeek ?? 'null (unarmed)'}; ` +
    'these rows are excluded from every aggregate');
}
for (const row of rows) {
  const shown = row.capped === true
    ? 'capped'
    : !raw && row.n < SUPPRESS_BELOW ? `<${SUPPRESS_BELOW}` : String(row.n);
  console.log(`  ${shown.padStart(6)}  ${row.key}`);
}
if (!raw) console.log(`\n(cells below ${SUPPRESS_BELOW} suppressed; --raw to override locally)`);
