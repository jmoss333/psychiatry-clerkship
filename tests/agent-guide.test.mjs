// The agent-guide contract (R1, 2026-10-16): CLAUDE.md is an index that may only shrink; the
// rules live in docs/agent-guide/<topic>.md under tagged headings. bin/check_agent_guide.py holds
// the checks (G1–G4 + the line-count ratchet) and its own falsification; this test puts both on
// the one gate CI already runs (`node --test tests/*.test.mjs`) without touching ci.yml — the
// defect it guards against (an agent PR that regrows the index or tags a gate that is not
// there) arrives in a pull request, which is the path a pre-push hook on one Mac never covers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'bin', 'check_agent_guide.py');

function run(args) {
  return spawnSync('python3', [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
}

test('CLAUDE.md is an index: every guide linked, every tag resolves, the line pin holds', () => {
  const r = run([]);
  assert.equal(r.status, 0, `check_agent_guide.py exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /agent guide: \d+ pages, \d+ tagged rules/);
});

test('check_agent_guide.py falsifies itself (13 synthetic violations + the migration proof)', () => {
  const r = run(['--self-test']);
  assert.equal(r.status, 0, `self-test exited ${r.status}\n${r.stdout}\n${r.stderr}`);
});
