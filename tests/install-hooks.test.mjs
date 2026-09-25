// install-hooks.test.mjs — the pre-push and pre-commit hooks bin/install-hooks.sh writes FAIL CLOSED.
//
// On 2026-09-24 a fixture that inherited GIT_DIR wrote core.bare=true into the shared
// .git/config. With extensions.worktreeConfig on (this repo has it), every linked worktree then
// failed `git rev-parse --show-toplevel`, the old hook's `[ -f "$TOP/bin/verify.sh" ] || exit 0`
// read the empty TOP as "branch predates the harness", and pushes went out ungated.
//
// Each case installs the hooks with the real bin/install-hooks.sh into a scratch repository
// shaped like ours (a primary checkout, a linked worktree, worktreeConfig on, stub gate scripts
// that record every run) and drives them through real `git push` / `git commit`. Nothing here
// touches this repository: every git call gets an environment with the inherited GIT_* removed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { scrubInheritedGitEnv } from './_git_env.mjs';

// Builds git repositories: an inherited GIT_DIR would aim them at the repo running this file.
scrubInheritedGitEnv();

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INSTALLER = path.join(ROOT, 'bin', 'install-hooks.sh');

const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
Object.assign(BASE_ENV, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull });

function run(cmd, args, { cwd, env = {}, input } = {}) {
  return spawnSync(cmd, args, { cwd, env: { ...BASE_ENV, ...env }, input, encoding: 'utf8' });
}
function git(cwd, ...args) {
  const r = run('git', args, { cwd });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
function write(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  if (mode) fs.chmodSync(file, mode);
}

// remote.git ← main (primary checkout, hooks installed) + wt (linked worktree on `feat`).
// The first commit predates the harness and is tagged, so a worktree can be opened on a branch
// that never carried bin/verify.sh.
function fixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'remote.git');
  const main = path.join(dir, 'main');
  const wt = path.join(dir, 'wt');
  const trace = path.join(dir, 'trace.log');
  git(dir, 'init', '-q', '--bare', '--initial-branch=main', remote);
  git(dir, 'init', '-q', '--initial-branch=main', main);
  git(main, 'config', 'user.name', 'Hooks fixture');
  git(main, 'config', 'user.email', 'hooks@example.invalid');
  git(main, 'config', 'extensions.worktreeConfig', 'true');
  write(path.join(main, 'README.md'), 'before the harness\n');
  git(main, 'add', '.');
  git(main, 'commit', '-qm', 'pre-harness');
  git(main, 'tag', 'pre-harness');
  write(path.join(main, 'bin', 'install-hooks.sh'), fs.readFileSync(INSTALLER, 'utf8'), 0o755);
  write(path.join(main, 'bin', 'verify.sh'),
    '#!/usr/bin/env bash\n' +
    'printf "verify GIT_DIR=%s refs=%s\\n" "${GIT_DIR-unset}" "$(cat | tr "\\n" " ")" >> "$HOOK_TRACE"\n' +
    'exit "${VERIFY_EXIT:-0}"\n', 0o755);
  write(path.join(main, '.claude', 'hooks', 'precommit_gate.py'),
    'import os\nopen(os.environ["HOOK_TRACE"], "a").write("precommit\\n")\n' +
    'raise SystemExit(int(os.environ.get("PRECOMMIT_EXIT", "0")))\n');
  git(main, 'add', '.');
  git(main, 'commit', '-qm', 'harness');
  git(main, 'remote', 'add', 'origin', remote);
  git(main, 'push', '-q', '-u', 'origin', 'main');
  const installed = run('bash', ['bin/install-hooks.sh'], { cwd: main });
  assert.equal(installed.status, 0, installed.stderr);
  git(main, 'worktree', 'add', '-q', '-b', 'feat', wt);
  const env = { HOOK_TRACE: trace };
  return { dir, remote, main, wt, trace, env };
}

function traceLines(fx) {
  return fs.existsSync(fx.trace) ? fs.readFileSync(fx.trace, 'utf8').trim().split('\n').filter(Boolean) : [];
}
function commit(fx, cwd, name, env = {}) {
  write(path.join(cwd, name), `${name}\n`);
  git(cwd, 'add', name);
  return run('git', ['commit', '-qm', name], { cwd, env: { ...fx.env, ...env } });
}
function push(fx, cwd, ref, env = {}) {
  return run('git', ['push', 'origin', ref], { cwd, env: { ...fx.env, ...env } });
}
function remoteHas(fx, ref) {
  return git(fx.dir, '--git-dir', fx.remote, 'for-each-ref', '--format=%(refname)', `refs/heads/${ref}`) !== '';
}

test('pre-push runs verify.sh with the push refs on stdin, no inherited GIT_DIR, and blocks on its failure', (t) => {
  const fx = fixture(t);
  assert.equal(commit(fx, fx.wt, 'one.txt').status, 0);
  const blocked = push(fx, fx.wt, 'feat', { VERIFY_EXIT: '1' });
  assert.notEqual(blocked.status, 0, 'a failing verify.sh must block the push');
  assert.match(blocked.stderr, /pre-push BLOCKED — bin\/verify\.sh failed/);
  assert.equal(remoteHas(fx, 'feat'), false);
  const ok = push(fx, fx.wt, 'feat');
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(remoteHas(fx, 'feat'), true);
  const runs = traceLines(fx).filter((l) => l.startsWith('verify '));
  assert.equal(runs.length, 2);
  for (const line of runs) {
    assert.match(line, /GIT_DIR=unset /, 'the hook must not hand GIT_DIR to verify.sh');
    assert.match(line, /refs=refs\/heads\/feat [0-9a-f]{40} refs\/heads\/feat /, 'verify.sh still receives the push refs');
  }
});

test('pre-push BLOCKS when core.bare=true in the shared config (the 2026-09-24 fail-open)', (t) => {
  const fx = fixture(t);
  assert.equal(commit(fx, fx.wt, 'one.txt').status, 0);
  git(fx.dir, 'config', '--file', path.join(fx.main, '.git', 'config'), 'core.bare', 'true');
  const r = push(fx, fx.wt, 'feat');
  assert.notEqual(r.status, 0, `the push must be blocked, not waved through:\n${r.stderr}`);
  assert.match(r.stderr, /pre-push BLOCKED — cannot locate the work tree/);
  assert.match(r.stderr, /core\.bare=true in the shared config/);
  assert.equal(remoteHas(fx, 'feat'), false);
  assert.deepEqual(traceLines(fx), ['precommit'], 'verify.sh never ran, so nothing may pass as gated');
});

test('pre-push BLOCKS when verify.sh is missing but the branch history carries it', (t) => {
  const fx = fixture(t);
  assert.equal(commit(fx, fx.wt, 'one.txt').status, 0);
  fs.rmSync(path.join(fx.wt, 'bin', 'verify.sh'));
  const r = push(fx, fx.wt, 'feat');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /bin\/verify\.sh is missing .* history carries it: the gate is gone, not absent/);
  assert.equal(remoteHas(fx, 'feat'), false);
});

test('a branch that predates the harness is still let through, by both hooks — but not a harness branch pushed from it', (t) => {
  const fx = fixture(t);
  const old = path.join(fx.dir, 'wt-old');
  git(fx.main, 'worktree', 'add', '-q', '-b', 'old', old, 'pre-harness');
  const c = commit(fx, old, 'legacy.txt');
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stderr, /pre-commit: no \.claude\/hooks\/precommit_gate\.py, and this branch never carried one/);
  const r = push(fx, old, 'old');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /predates the harness/);
  assert.equal(remoteHas(fx, 'old'), true);
  // The same gate-less worktree pushing a branch whose history DOES carry verify.sh is blocked.
  assert.equal(commit(fx, fx.wt, 'one.txt').status, 0);
  const harness = push(fx, old, 'feat');
  assert.notEqual(harness.status, 0);
  assert.match(harness.stderr, /history carries it: the gate is gone, not absent/);
  assert.equal(remoteHas(fx, 'feat'), false);
});

test('pre-commit runs the gate and blocks on its failure', (t) => {
  const fx = fixture(t);
  const blocked = commit(fx, fx.wt, 'one.txt', { PRECOMMIT_EXIT: '1' });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /pre-commit BLOCKED — fix the findings above/);
  const ok = run('git', ['commit', '-qm', 'one'], { cwd: fx.wt, env: fx.env });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(traceLines(fx), ['precommit', 'precommit']);
});

test('pre-commit BLOCKS when the gate is missing but the branch history carries it', (t) => {
  const fx = fixture(t);
  fs.rmSync(path.join(fx.wt, '.claude', 'hooks', 'precommit_gate.py'));
  const r = commit(fx, fx.wt, 'one.txt');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /precommit_gate\.py is missing .* history carries it: the gate is gone, not absent/);
});

test('both hooks BLOCK when git cannot locate any repository', (t) => {
  const fx = fixture(t);
  const hooks = path.join(fx.main, '.git', 'hooks');
  const lost = { GIT_DIR: path.join(fx.dir, 'no-such-repository') };
  for (const hook of ['pre-push', 'pre-commit']) {
    const r = run(path.join(hooks, hook), ['origin', fx.remote], { cwd: fx.dir, env: lost, input: '' });
    assert.notEqual(r.status, 0, `${hook} exited 0 without a repository`);
    assert.match(r.stderr, new RegExp(`${hook} BLOCKED — cannot locate the work tree`));
  }
  assert.deepEqual(traceLines(fx), []);
});

test('the SessionStart vitals flag an installed hook that predates fail-closed as STALE', (t) => {
  const fx = fixture(t);
  const vitals = () => {
    const r = run('bash', [path.join(ROOT, '.claude', 'hooks', 'session_vitals.sh')], {
      cwd: fx.main, env: { CLAUDE_PROJECT_DIR: fx.main, CLERKSHIP_SKIP_EGRESS_PROBE: '1' },
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.split('\n').find((l) => l.startsWith('git hooks:')) ?? '';
  };
  assert.match(vitals(), /^git hooks: pre-commit installed · pre-push installed /);
  // The pre-push hook every clone carried until 2026-09-24, verbatim in its fail-open lines.
  fs.writeFileSync(path.join(fx.main, '.git', 'hooks', 'pre-push'),
    '#!/usr/bin/env bash\nset -uo pipefail\nTOP="$(git rev-parse --show-toplevel)"\n' +
    '[ -f "$TOP/bin/verify.sh" ] || exit 0\nbash "$TOP/bin/verify.sh" || exit 1\n');
  assert.match(vitals(), /pre-commit installed · pre-push installed but STALE \(fails open\)/);
});
