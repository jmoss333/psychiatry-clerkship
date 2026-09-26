// session-vitals.test.mjs — the SessionStart vitals must not report "nothing" when a probe
// never ran. Until 2026-09-26 every bounded probe was wrapped in a bare `timeout`, which macOS
// does not ship: on the Mac each exited 127 before starting, and the hook printed "open PRs for
// this branch: none", an empty scheduled-runs list and "egress: probe unavailable" as findings.
// `bounded` (defined in the hook) falls back to perl's alarm, which every image here has.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOOK = path.join(ROOT, '.claude/hooks/session_vitals.sh');
const source = fs.readFileSync(HOOK, 'utf8');

/** The hook's own bounded() definition, verbatim, so the test runs the shipped function. */
function boundedDefinition() {
  const match = source.match(/^bounded\(\) \{\n[\s\S]*?\n\}\n/m);
  assert.ok(match, 'session_vitals.sh no longer defines bounded()');
  return match[0];
}

/** A PATH holding only what the Mac has: perl, sleep, true — and no timeout/gtimeout. */
function macLikePath(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-path-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const tool of ['perl', 'sleep', 'true']) {
    // Resolve on disk: `command -v true` answers with the shell builtin, not a file.
    const found = (process.env.PATH || '').split(path.delimiter).map((d) => path.join(d, tool))
      .find((candidate) => fs.existsSync(candidate));
    assert.ok(found, `${tool} not found on this machine`);
    fs.symlinkSync(found, path.join(dir, tool));
  }
  return dir;
}

test('no probe in the hook calls a bare timeout', () => {
  const body = source.replace(boundedDefinition(), '');
  const bare = body.split('\n').filter((line) => /(^|[\s;&|(])g?timeout\s+\d/.test(line)
    && !line.trimStart().startsWith('#'));
  assert.deepEqual(bare, [], 'wrap time-limited probes in bounded, not timeout');
  assert.match(body, /bounded \d+ python3 bin\/coordination_report\.py --vitals --budget \d+/);
});

test('bounded enforces its limit with no timeout on PATH, and passes success through', (t) => {
  const bin = macLikePath(t);
  const script = `${boundedDefinition()}PATH='${bin}'
command -v timeout >/dev/null 2>&1 && { echo "timeout leaked onto PATH"; exit 99; }
start=$SECONDS; bounded 1 sleep 6; rc=$?; echo "slow rc=$rc took=$((SECONDS - start))"
bounded 5 true; echo "fast rc=$?"`;
  const r = spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const slow = r.stdout.match(/slow rc=(\d+) took=(\d+)/);
  assert.ok(slow, r.stdout + r.stderr);
  assert.notEqual(Number(slow[1]), 0, 'a command past its limit must not report success');
  assert.notEqual(Number(slow[1]), 127, 'exit 127 means the wrapper itself was not found');
  assert.ok(Number(slow[2]) <= 3, `limit not enforced: took ${slow[2]}s`);
  assert.match(r.stdout, /fast rc=0/);
});
