// git-config-health.test.mjs — the shared-.git/config guard is wired where it can catch damage.
//
// bin/check_git_config_health.py (its own --self-test covers the detection rules) is only useful
// if it runs at the two moments that matter: when a session starts, where a corrupted config
// must be the first thing said and said loudly, and around every bin/verify.sh run — FIRST, so a
// broken config is named before forty steps fail for no stated reason, and LAST, so a suite that
// corrupts the config during the run fails that run (the 2026-09-24 incident did exactly that and
// nothing noticed). These pins keep both wirings from drifting.
//
// The fixture's .git is written by hand: the guard reads .git files, never asks git, so no git
// repository has to be built for it (and none is).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOL = path.join(ROOT, 'bin', 'check_git_config_health.py');
const VITALS = path.join(ROOT, '.claude', 'hooks', 'session_vitals.sh');

function fakeCheckout(t, configText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-config-health-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'config'), configText);
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.copyFileSync(TOOL, path.join(dir, 'bin', 'check_git_config_health.py'));
  return dir;
}

function vitals(dir) {
  const r = spawnSync('bash', [VITALS], {
    cwd: dir, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLERKSHIP_SKIP_EGRESS_PROBE: '1' },
  });
  assert.equal(r.status, 0, `the vitals hook must never fail the session: ${r.stderr}`);
  return r.stdout;
}

const INCIDENT = '[core]\n\tbare = true\n[user]\n\temail = synthetic@example.invalid\n\tname = Synthetic Tester\n'
  + '[filter "lfs"]\n\tclean = cat\n\tsmudge = cat\n\tprocess = cat\n\trequired = false\n';

test('SessionStart vitals shout about a corrupted shared config, right after the branch line', (t) => {
  const out = vitals(fakeCheckout(t, INCIDENT)).split('\n');
  const at = out.findIndex((line) => line.startsWith('!!! GIT CONFIG CORRUPTED'));
  assert.ok(at > 0, `no corruption banner in:\n${out.join('\n')}`);
  assert.ok(out[at - 1].startsWith('branch:'), 'the banner comes before every other probe');
  const report = out.slice(at).join('\n');
  for (const key of ['core.bare', 'user.email', 'user.name', 'filter.lfs.smudge', 'filter.lfs.required']) {
    assert.match(report, new RegExp(key.replace('.', '\\.')), `${key} is named`);
  }
  assert.match(report, /repair: git config --file .* core\.bare false/);
});

test('SessionStart vitals report a healthy shared config in one quiet line', (t) => {
  const out = vitals(fakeCheckout(t, '[core]\n\tbare = false\n[user]\n\tname = jmoss333\n'));
  assert.match(out, /^git config: healthy /m);
  assert.doesNotMatch(out, /CORRUPTED/);
});

test('bin/verify.sh checks the shared config first and again last', () => {
  const steps = fs.readFileSync(path.join(ROOT, 'bin', 'verify.sh'), 'utf8')
    .split('\n').filter((line) => /^\s*step "/.test(line)).map((line) => line.trim());
  assert.match(steps[0], /^step "unit — git config health"\s+python3 bin\/check_git_config_health\.py --self-test$/);
  assert.match(steps[1], /^step "git config health \(before the run\)"\s+python3 bin\/check_git_config_health\.py$/);
  assert.match(steps.at(-1), /^step "git config health \(after the run\)"\s+python3 bin\/check_git_config_health\.py$/);
});
