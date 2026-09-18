#!/usr/bin/env node
// Read counters for one site+week. Honors the n<5 suppression threshold so the
// CLI cannot become a back door around the reporting rule.
import { getStore } from '@netlify/blobs';

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

const store = getStore('usage-counters');
const { blobs } = await store.list({ prefix: `${site}/${week}/` });
const rows = [];
for (const blob of blobs) {
  const row = await store.get(blob.key, { type: 'json' });
  if (row) rows.push(row);
}
rows.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));

console.log(`${site} · ${week} · ${rows.length} counter(s)`);
for (const row of rows) {
  const shown = !raw && row.n < SUPPRESS_BELOW ? `<${SUPPRESS_BELOW}` : String(row.n);
  console.log(`  ${shown.padStart(5)}  ${row.key}`);
}
if (!raw) console.log(`\n(cells below ${SUPPRESS_BELOW} suppressed; --raw to override locally)`);
