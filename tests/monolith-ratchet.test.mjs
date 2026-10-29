// The monolith ratchet (R5, 2026-10-18): attest.mjs — the only code that writes an attestation
// hash — may only shrink. bin/check_monolith_ratchet.py holds the pin and its falsification; this
// test puts both on the node suite CI already runs, because the growth it guards against arrives
// in a pull request from an agent session, the path a pre-push hook on one Mac never covers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'bin', 'check_monolith_ratchet.py');

function run(args) {
  return spawnSync('python3', [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

test('every pinned monolith is at or below its pin', () => {
  const r = run([]);
  assert.equal(r.status, 0, `check_monolith_ratchet.py exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /monolith ratchet: \d+ pinned file\(s\)/);
});

test('check_monolith_ratchet.py falsifies itself (7 synthetic cases + the live tree)', () => {
  const r = run(['--self-test']);
  assert.equal(r.status, 0, `self-test exited ${r.status}\n${r.stdout}\n${r.stderr}`);
});
