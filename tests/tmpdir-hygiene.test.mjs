/**
 * A suite that makes temp directories removes them.
 *
 * By 2026-09-24 three suites that never removed anything had left ~105,000 directories in one
 * Mac's $TMPDIR, and nobody noticed until bin/preview-site.sh, started from that directory,
 * stalled on Python's import scan and turned the pre-push gate red on clean main. CI never sees
 * it: every run gets a fresh, empty /tmp.
 *
 * This is a presence check, not proof: it would have caught all three (none called rmSync at
 * all), but a file with one cleanup and a second, leaking mkdtemp still passes. The proof for a
 * given suite is to run it with TMPDIR pointed at an empty directory and list what is left.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const TESTS = path.dirname(fileURLToPath(import.meta.url));

test('every node suite that calls mkdtempSync also removes what it made', () => {
  const suites = fs.readdirSync(TESTS).filter((name) => name.endsWith('.test.mjs'));
  const making = suites.filter((name) => /\bmkdtempSync\(/.test(fs.readFileSync(path.join(TESTS, name), 'utf8')));
  // A vacuous pass is the failure this file exists for: if the scan finds nothing to check,
  // the directory or the pattern is wrong, not the suites clean.
  assert.ok(making.length >= 20, `expected ~22 suites to call mkdtempSync; scanned ${suites.length}, found ${making.length}`);
  const leaking = making.filter((name) => !/\brmSync\(/.test(fs.readFileSync(path.join(TESTS, name), 'utf8')));
  assert.deepEqual(leaking, [],
    'these suites create temp directories and never remove them; add t.after(() => fs.rmSync(dir, '
    + '{ recursive: true, force: true })), or one root removed in a top-level after()');
});
