// COWS practice series, objective-sign readout and note line — C1 / C2 / C8.
//
// Approved 2026-10-21 (decision S5, docs/superpowers/plans/2026-10-21-scales-and-cognitive-
// screening-audit.md §3). What this pins, and why each pin exists:
//
//   · the series is stored under a literal cw_* key, pruned to seven days, and holds nothing but
//     a timestamp, a total and item scores — the no-PHI bar (CLAUDE.md invariant 7) is kept by
//     construction, not by a banner alone;
//   · the no-PHI banner renders before the only control that can write an entry;
//   · the page still has no field a person could type an identifier into;
//   · Δ per hour is computed correctly across midnight (the spec's fixture, WP-21 acceptance);
//   · the objective-sign count uses exactly the eight OBSERVED items — ASKED and ASKED/OBSERVED
//     items never count, because the gate line is "COWS ≥ 8 with one objective sign";
//   · the note line names what a resident charts and nothing else.
//
// Trust model: the helpers block is executed straight out of the tracked html, the same way
// tests/cows-legal-values.test.mjs executes the COWS array. The only input is this repo.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, '03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html');
const html = readFileSync(FILE, 'utf8');

const KEY = 'cw_cows_series_v1';
const DAY = 24 * 60 * 60 * 1000;

function helpers() {
  const m = html.match(/\/\* COWS_SERIES_HELPERS_BEGIN[\s\S]*?\*\/\n([\s\S]*?)\/\* COWS_SERIES_HELPERS_END \*\//);
  assert.ok(m, 'COWS_SERIES helpers block not found — locate it by its sentinels, not by line');
  // eslint-disable-next-line no-new-func
  return new Function(`${m[1]}\nreturn COWS_SERIES;`)();
}

function cowsItems() {
  const m = html.match(/var COWS=\[[\s\S]*?\n\];/);
  assert.ok(m, 'COWS array not found');
  // eslint-disable-next-line no-new-func
  return new Function(`${m[0]}\nreturn COWS;`)();
}

// ---------- storage discipline ----------

test('the series lives under one literal cw_* key, read and written through the wrappers only', () => {
  const calls = [...html.matchAll(/localStorage\.(getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)];
  assert.ok(calls.length >= 3, 'getItem, setItem and removeItem all name the key literally');
  for (const [, , key] of calls) assert.equal(key, KEY, `unexpected storage key ${key}`);
  assert.doesNotMatch(html, /localStorage\.(?:getItem|setItem|removeItem)\(\s*(?!['"])/,
    'a computed key cannot be verified against the cw_* namespace');
  assert.equal(helpers().KEY, KEY);
});

test('the key is registered on the tool and nowhere else', () => {
  const registry = JSON.parse(readFileSync(path.join(ROOT, 'tool_registry.json'), 'utf8'));
  const mine = registry.tools.find((t) => t.file === 'withdrawal.html');
  assert.deepEqual(mine.storageKeys, [KEY]);
  for (const t of registry.tools) {
    if (t.file === 'withdrawal.html') continue;
    assert.ok(!(t.storageKeys || []).includes(KEY), `${t.file} must not share the series key`);
  }
});

test('retention is seven days and the sparkline shows at most eight points', () => {
  const H = helpers();
  assert.equal(H.RETENTION_MS, 7 * DAY);
  assert.equal(H.MAX_POINTS, 8);
  assert.equal(H.TRACK, 48, 'COWS maximum');
});

// ---------- no PHI, by construction ----------

test('the page has no field a person could type into', () => {
  assert.doesNotMatch(html, /<textarea|<input\b/i);
  assert.doesNotMatch(html, /e\(\s*['"](?:textarea|input)['"]/, 'no React-rendered text field either');
  assert.doesNotMatch(html, /contentEditable/i);
});

test('the no-PHI banner renders before the only control that can write an entry', () => {
  const banner = html.indexOf('Never enter data from a real patient');
  const logButton = html.indexOf("'Log this score (");
  assert.ok(banner > 0, 'banner text present');
  assert.ok(logButton > 0, 'log control present');
  assert.ok(banner < logButton, 'banner is rendered above the log control');
  assert.match(html, /Practice tool\. /);
  assert.match(html, /clears itself after 7 days/);
});

test('an entry is a timestamp, a total and item scores — nothing else survives prune', () => {
  const H = helpers();
  const now = Date.parse('2026-10-21T12:00:00Z');
  const kept = H.prune([{ t: '2026-10-21T11:00:00Z', total: 9, items: { pulse: 2 }, note: 'Mr X, room 4', mrn: '123' }], now);
  assert.equal(kept.length, 1);
  assert.deepEqual(Object.keys(kept[0]).sort(), ['items', 't', 'total']);
});

// ---------- prune ----------

test('prune drops stale, malformed, future and out-of-range entries and sorts ascending', () => {
  const H = helpers();
  const now = Date.parse('2026-10-21T12:00:00Z');
  const out = H.prune([
    { t: new Date(now - 6 * DAY).toISOString(), total: 4, items: {} },         // kept
    { t: new Date(now - 8 * DAY).toISOString(), total: 10, items: {} },        // stale
    { total: 7, items: {} },                                                   // no timestamp
    { t: 'yesterday', total: 7, items: {} },                                   // unparsable
    { t: new Date(now + 2 * 60 * 60 * 1000).toISOString(), total: 7 },         // clock set forward
    { t: new Date(now - DAY).toISOString(), total: 49, items: {} },            // above the track
    { t: new Date(now - DAY).toISOString(), total: -1, items: {} },            // below zero
    { t: new Date(now - 2 * DAY).toISOString(), total: 12, items: { tremor: 2 } }, // kept
    null, 'junk',
  ], now);
  assert.deepEqual(out.map((x) => x.total), [4, 12], 'oldest first, only the two valid points');
  assert.deepEqual(H.prune('not an array', now), []);
  assert.deepEqual(H.prune([{ t: new Date(now - 7 * DAY + 1000).toISOString(), total: 1 }], now).length, 1,
    'a point just inside seven days is kept');
  assert.deepEqual(H.prune([{ t: new Date(now - 7 * DAY - 1000).toISOString(), total: 1 }], now).length, 0,
    'a point just outside seven days is dropped');
});

// ---------- Δ per hour, across midnight (WP-21 acceptance) ----------

test('delta per hour is computed across a spanning-midnight fixture', () => {
  const H = helpers();
  const d = H.delta({ t: '2026-10-21T23:30:00Z', total: 6 }, { t: '2026-10-22T01:30:00Z', total: 14 });
  assert.equal(d.points, 8);
  assert.equal(d.hours, 2);
  assert.equal(d.perHour, 4);
  assert.equal(H.perHourLabel(d), '+4 per hour');
  assert.equal(H.read([{ t: '2026-10-21T23:30:00Z', total: 6 }, { t: '2026-10-22T01:30:00Z', total: 14 }]),
    'Rising 8 points in 2 h.');
});

test('the one-line read names rising, falling and plateau, and asks the falling question', () => {
  const H = helpers();
  const a = { t: '2026-10-21T08:00:00Z', total: 15 };
  assert.match(H.read([a, { t: '2026-10-21T08:45:00Z', total: 12 }]), /^Falling 3 points in 45 min — what does a falling score oblige you to do\?$/);
  assert.equal(H.read([a, { t: '2026-10-21T10:00:00Z', total: 15 }]), 'Plateau — unchanged over 2 h.');
  assert.equal(H.read([a, { t: '2026-10-21T08:00:20Z', total: 16 }]), 'Rising 1 point in under a minute.');
  assert.equal(H.read([a]), 'One point logged — a trend needs a second.');
  assert.equal(H.read([]), '');
  const same = H.delta(a, { t: '2026-10-21T08:00:20Z', total: 16 });
  assert.equal(H.perHourLabel(same), 'logged within the same minute', 'no per-hour rate from seconds');
  const down = H.delta(a, { t: '2026-10-21T11:00:00Z', total: 9 });
  assert.equal(H.perHourLabel(down), '-2 per hour');
});

// ---------- objective signs and the gate line (C2) ----------

test('exactly the eight OBSERVED items are objective signs', () => {
  const H = helpers();
  const items = cowsItems();
  const observed = items.filter((i) => i.tag === 'OBSERVED').map((i) => i.k).sort();
  assert.deepEqual(observed, ['goose', 'nose', 'pulse', 'pupil', 'rest', 'sweat', 'tremor', 'yawn']);
  const none = H.objective(items, {});
  assert.deepEqual(none, { count: 0, max: 8, names: [] });
  const asked = H.objective(items, { aches: 4, gi: 5, anx: 4 });
  assert.equal(asked.count, 0, 'ASKED and ASKED/OBSERVED items never count as objective signs');
  const some = H.objective(items, { pulse: 2, tremor: 2, aches: 4, anx: 1 });
  assert.equal(some.count, 2);
  assert.deepEqual(some.names, ['Resting pulse rate', 'Tremor']);
});

test('the gate is COWS ≥ 8 with at least one objective sign', () => {
  const H = helpers();
  assert.equal(H.GATE_TOTAL, 8);
  assert.equal(H.gateMet(8, 1), true);
  assert.equal(H.gateMet(20, 1), true);
  assert.equal(H.gateMet(12, 0), false, 'a subjective-only 12 does not meet it');
  assert.equal(H.gateMet(7, 3), false, 'objective signs below the total threshold do not meet it');
});

test('the gate line on the page carries the canonical wording and its source, and says it is teaching', () => {
  assert.match(html, /COWS ≥ 8 with at least one objective sign/);
  assert.match(html, /Teaching, not an order/);
  assert.match(html, /PMID 37934520/, 'Weimer 2023 — asam-hpso-bup-2023 in the registry');
  assert.match(html, /threshold your team starts on is in its protocol/);
});

test('the gate claim is bound to this page in evidence_annotations.json and the registry entry', () => {
  const ann = JSON.parse(readFileSync(path.join(ROOT, 'evidence_annotations.json'), 'utf8'));
  const row = ann.annotations.find((a) => a.sourceId === 'asam-hpso-bup-2023');
  assert.ok(row, 'asam-hpso-bup-2023 annotation exists');
  const claim = row.claims.find((c) => c.claimId === 'hpso-cows-8-standard-or-high-dose-initiation');
  assert.ok(claim.usedBy.includes('withdrawal.html'));
  assert.ok(claim.claimTerms.includes('COWS ≥8 with 1 objective sign of opioid withdrawal'));
  const registry = JSON.parse(readFileSync(path.join(ROOT, 'tool_registry.json'), 'utf8'));
  const mine = registry.tools.find((t) => t.file === 'withdrawal.html');
  assert.ok(mine.evidenceIds.includes('asam-hpso-bup-2023'));
});

// ---------- the note line (C8) ----------

test('the note line is total, band, the scored items, the objective-sign count and the gate — nothing else', () => {
  const H = helpers();
  const items = cowsItems();
  const line = H.noteLine(items, { pulse: 2, sweat: 2, gi: 3, yawn: 0 }, 'Mild');
  assert.equal(line,
    'COWS 7 (Mild) — GI upset 3, Resting pulse rate 2, Sweating 2; objective signs 2/8 '
    + '(Resting pulse rate, Sweating); COWS ≥ 8 with ≥ 1 objective sign: not met. '
    + 'Practice entry — no patient identifiers.');
  assert.doesNotMatch(line, /Yawning/, 'items scored 0 are not named');
  const met = H.noteLine(items, { pulse: 4, rest: 5, gi: 3 }, 'Mild');
  assert.match(met, /^COWS 12 \(Mild\)/);
  assert.match(met, /objective signs 2\/8 \(Resting pulse rate, Restlessness\)/);
  assert.match(met, /: met\. Practice entry/);
  assert.equal(H.noteLine(items, {}, 'Minimal'),
    'COWS 0 (Minimal) — no items scored; objective signs 0/8; COWS ≥ 8 with ≥ 1 objective sign: not met. Practice entry — no patient identifiers.');
});

// ---------- what did not change ----------

test('the COWS array, the Reset control and the route survive (keep-guards)', () => {
  assert.equal(cowsItems().length, 11);
  assert.match(html, /e\('button',\{className:'btn',onClick:function\(\)\{setV\(\{\}\)\}\},'Reset'\)/, 'Reset clears item scores only');
  assert.match(html, /https:\/\/nida\.nih\.gov\/sites\/default\/files\/ClinicalOpiateWithdrawalScale\.pdf/);
  // The gate's own dose regex (check-static-site.mjs §5): a number followed by a dose unit.
  assert.doesNotMatch(html, /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i, 'no dose literal rode in with the series');
});
