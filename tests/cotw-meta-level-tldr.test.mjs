/**
 * A Case-of-the-Week week has TWO patients, one per level, so its summary may need two texts.
 *
 * cotw_meta.py derives each COTW page's topic_meta entry (TL;DR, and the "Shelf-level" /
 * "Teaching takeaway" exam card) from one registry row. Until 2026-09-24 that row carried a
 * single `tldr`, and the 2026-07-27 OUD pair showed why that is wrong: the MS3 case is
 * naloxone-precipitated withdrawal, the resident case buprenorphine-precipitated, and the one
 * shared summary described only the resident patient (peer-review finding M11-001). A row may
 * now carry `tldr_ms3` / `tldr_res`; a level without its own key falls back to `tldr`.
 *
 * Fixture rows only — this pins the derivation rule, not the live registry's wording.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_BUILD = path.join(ROOT, '13_Faculty_Resources', '_automation', 'site_build');

function derive(week) {
  const code = [
    'import json, sys, cotw_meta',
    'w = json.loads(sys.argv[1])',
    'print(json.dumps({lv: {"tldr": e["tldr"], "exam": e["clinicalWorkflow"]["exam"]}',
    '                  for lv in ("ms3", "res") for e in [cotw_meta.entry_for(w, lv)]}))',
  ].join('\n');
  const r = spawnSync('python3', ['-c', code, JSON.stringify(week)], { cwd: SITE_BUILD, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const BASE = { date: '2026-01-05', topic: 'demo', label: 'Demo (Jan 5)' };

test('a per-level tldr wins for its level, and the exam card follows it', () => {
  const out = derive({ ...BASE, tldr: 'Shared.', tldr_ms3: 'MS3 patient.', tldr_res: 'Resident patient.' });
  assert.equal(out.ms3.tldr, 'MS3 patient.');
  assert.equal(out.res.tldr, 'Resident patient.');
  assert.match(out.ms3.exam, /^Shelf-level takeaway: MS3 patient\./);
  assert.match(out.res.exam, /^Teaching takeaway: Resident patient\./);
});

test('a level without its own key falls back to the shared tldr', () => {
  const out = derive({ ...BASE, tldr: 'Shared.', tldr_ms3: 'MS3 patient.' });
  assert.equal(out.ms3.tldr, 'MS3 patient.');
  assert.equal(out.res.tldr, 'Shared.');
});

test('a row written the old way is unchanged', () => {
  const out = derive({ ...BASE, tldr: 'Shared.' });
  assert.equal(out.ms3.tldr, 'Shared.');
  assert.equal(out.res.tldr, 'Shared.');
});

test('a blank per-level key does not blank the summary', () => {
  const out = derive({ ...BASE, tldr: 'Shared.', tldr_res: '   ' });
  assert.equal(out.res.tldr, 'Shared.');
});
