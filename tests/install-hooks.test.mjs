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
import { createHash } from 'node:crypto';
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
  const remote = path.join(dir, 'remote with spaces.git');
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

// Use the real LFS clean filter and local-file transfer adapter: a Git ref arriving without
// these bytes is precisely the defect. No network, media downloads, or lfs install (which
// would replace the hook under test). The repo requires Git LFS on both host and CI.
function mediaCommit(fx, cwd, name = 'sample.mp3') {
  git(cwd, 'config', 'filter.lfs.clean', 'git-lfs clean -- %f');
  git(cwd, 'config', 'filter.lfs.required', 'true');
  write(path.join(cwd, '.gitattributes'), '*.mp3 filter=lfs diff=lfs merge=lfs -text\n');
  const bytes = Buffer.from(`Synthetic hook fixture: ${name}\n`);
  write(path.join(cwd, name), bytes);
  git(cwd, 'add', '.gitattributes', name);
  const c = run('git', ['commit', '-qm', `media ${name}`], { cwd, env: fx.env });
  assert.equal(c.status, 0, c.stderr);
  const oid = createHash('sha256').update(bytes).digest('hex');
  assert.match(git(cwd, 'show', `HEAD:${name}`), new RegExp(`oid sha256:${oid}`));
  const objectPath = path.join('lfs', 'objects', oid.slice(0, 2), oid.slice(2, 4), oid);
  return {
    bytes,
    localObject: path.join(fx.main, '.git', objectPath),
    remoteObject: path.join(fx.remote, objectPath),
  };
}

for (const checkout of ['main', 'wt']) {
  test(`pre-push uploads real LFS bytes from the ${checkout} checkout only after verification passes`, (t) => {
    const fx = fixture(t);
    const cwd = fx[checkout];
    const media = mediaCommit(fx, cwd);
    const ref = 'HEAD:refs/heads/media';
    const blocked = push(fx, cwd, ref, { VERIFY_EXIT: '1' });
    assert.notEqual(blocked.status, 0);
    assert.equal(remoteHas(fx, 'media'), false);
    assert.equal(fs.existsSync(media.remoteObject), false, 'failed checks must not upload media');
    const ok = push(fx, cwd, ref);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(remoteHas(fx, 'media'), true);
    assert.equal(fs.existsSync(media.remoteObject), true, 'Git arrived, but its LFS media did not');
    assert.deepEqual(fs.readFileSync(media.remoteObject), media.bytes);
    assert.equal(traceLines(fx).filter((line) => line.startsWith('verify ')).length, 2);
  });
}

test('pre-push preserves every ref for verification and LFS, including a later branch and tag', (t) => {
  const fx = fixture(t);
  const first = mediaCommit(fx, fx.main, 'first.mp3');
  const later = mediaCommit(fx, fx.wt, 'later.mp3');
  git(fx.wt, 'tag', 'media-tag');
  const r = run('git', ['push', 'origin', 'main', 'feat', 'refs/tags/media-tag'], { cwd: fx.wt, env: fx.env });
  assert.equal(r.status, 0, r.stderr);
  for (const media of [first, later]) {
    assert.equal(fs.existsSync(media.remoteObject), true, 'every ref must reach the LFS uploader');
    assert.deepEqual(fs.readFileSync(media.remoteObject), media.bytes);
  }
  const runs = traceLines(fx).filter((line) => line.startsWith('verify '));
  assert.equal(runs.length, 1);
  for (const ref of ['refs/heads/main', 'refs/heads/feat', 'refs/tags/media-tag']) {
    assert.ok(runs[0].includes(ref), `${ref} must also reach verification`);
  }
});

test('pre-push blocks the Git ref when a required local LFS object is missing', (t) => {
  const fx = fixture(t);
  const media = mediaCommit(fx, fx.wt);
  fs.unlinkSync(media.localObject);
  const r = push(fx, fx.wt, 'feat');
  assert.notEqual(r.status, 0, 'a Git pointer must not be published without its media');
  assert.match(r.stderr, /pre-push BLOCKED.*Git LFS/);
  assert.equal(remoteHas(fx, 'feat'), false);
  assert.equal(fs.existsSync(media.remoteObject), false);
  assert.equal(traceLines(fx).filter((line) => line.startsWith('verify ')).length, 1);
});

test('pre-push blocks the Git ref when the local LFS destination cannot accept an upload', (t) => {
  const fx = fixture(t);
  mediaCommit(fx, fx.wt);
  write(path.join(fx.remote, 'lfs'), 'a file obstructs the media storage directory\n');
  const r = push(fx, fx.wt, 'feat');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /pre-push BLOCKED.*Git LFS/);
  assert.equal(remoteHas(fx, 'feat'), false);
});

test('pre-harness branches still upload their LFS media when no verification script is required', (t) => {
  const fx = fixture(t);
  const old = path.join(fx.dir, 'wt-old');
  git(fx.main, 'worktree', 'add', '-q', '-b', 'old', old, 'pre-harness');
  const media = mediaCommit(fx, old);
  const r = push(fx, old, 'old');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /predates the harness/);
  assert.equal(fs.existsSync(media.remoteObject), true, 'the gate exemption is not an LFS exemption');
  assert.deepEqual(fs.readFileSync(media.remoteObject), media.bytes);
  assert.equal(traceLines(fx).filter((line) => line.startsWith('verify ')).length, 0);
});

test('deleting a remote branch succeeds without trying to upload missing local media', (t) => {
  const fx = fixture(t);
  const media = mediaCommit(fx, fx.wt);
  const initial = push(fx, fx.wt, 'feat');
  assert.equal(initial.status, 0, initial.stderr);
  fs.unlinkSync(media.localObject);
  const deletion = push(fx, fx.wt, ':refs/heads/feat');
  assert.equal(deletion.status, 0, deletion.stderr);
  assert.equal(remoteHas(fx, 'feat'), false);
  assert.equal(traceLines(fx).filter((line) => line.startsWith('verify ')).length, 2);
});

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

function vitals(fx, cwd = fx.main) {
  const r = run('bash', [path.join(ROOT, '.claude', 'hooks', 'session_vitals.sh')], {
    cwd, env: { ...fx.env, CLAUDE_PROJECT_DIR: cwd, CLERKSHIP_SKIP_EGRESS_PROBE: '1' },
  });
  assert.equal(r.status, 0, `a startup warning must not block work: ${r.stderr}`);
  assert.match(r.stdout, /== end vitals ==/, 'the remaining startup report must still run');
  return r.stdout;
}

test('the SessionStart vitals flag an installed hook that predates fail-closed as outdated', (t) => {
  const fx = fixture(t);
  assert.match(vitals(fx), /git hooks: pre-commit current · pre-push current/);
  // The pre-push hook every clone carried until 2026-09-24, verbatim in its fail-open lines.
  fs.writeFileSync(path.join(fx.main, '.git', 'hooks', 'pre-push'),
    '#!/usr/bin/env bash\nset -uo pipefail\nTOP="$(git rev-parse --show-toplevel)"\n' +
    '[ -f "$TOP/bin/verify.sh" ] || exit 0\nbash "$TOP/bin/verify.sh" || exit 1\n');
  assert.match(vitals(fx), /pre-commit current · pre-push OUTDATED OR MODIFIED/);
});

test('startup catches a hook missing LFS upload, changes nothing, and normal commits and pushes still work', (t) => {
  const fx = fixture(t);
  // The existing LFS status probe initializes its format metadata on first use. Establish
  // that baseline before measuring the warning's effect on this scratch repository.
  vitals(fx, fx.wt);
  const hook = path.join(fx.main, '.git/hooks/pre-push');
  const original = fs.readFileSync(hook, 'utf8');
  const old = original.replace(/^printf .*\| git lfs pre-push.*\n/m, '');
  assert.notEqual(old, original, 'the fixture must actually remove the upload operation');
  fs.writeFileSync(hook, old);
  const config = fs.readFileSync(path.join(fx.main, '.git/config'));
  const out = vitals(fx, fx.wt);
  assert.match(out, /pre-push OUTDATED OR MODIFIED/);
  assert.match(out, /cached origin\/main/);
  assert.match(out, /update.*checkout.*bin\/install-hooks\.sh/i);
  assert.equal(fs.readFileSync(hook, 'utf8'), old, 'the warning must not reinstall the hook');
  assert.deepEqual(fs.readFileSync(path.join(fx.main, '.git/config')), config);
  assert.deepEqual(traceLines(fx), [], 'the warning must not execute either installed hook');
  assert.equal(commit(fx, fx.wt, 'ordinary.txt').status, 0);
  const pushed = push(fx, fx.wt, 'feat');
  assert.equal(pushed.status, 0, pushed.stderr);
});

test('startup recognizes current shared hooks from a linked worktree', (t) => {
  const fx = fixture(t);
  assert.match(vitals(fx, fx.wt), /pre-commit current · pre-push current/);
});

test('startup warns about missing and non-executable hooks without failing the session', (t) => {
  const fx = fixture(t);
  fs.unlinkSync(path.join(fx.main, '.git/hooks/pre-push'));
  fs.chmodSync(path.join(fx.main, '.git/hooks/pre-commit'), 0o644);
  assert.match(vitals(fx), /pre-commit NOT EXECUTABLE · pre-push MISSING/);
});

test('startup checks the active custom hooks directory rather than inactive default hooks', (t) => {
  const fx = fixture(t);
  const custom = path.join(fx.main, 'custom hooks');
  fs.mkdirSync(custom);
  for (const name of ['pre-commit', 'pre-push']) {
    fs.copyFileSync(path.join(fx.main, '.git/hooks', name), path.join(custom, name));
    fs.chmodSync(path.join(custom, name), 0o755);
  }
  fs.appendFileSync(path.join(custom, 'pre-push'), '\n# custom variation\n');
  git(fx.main, 'config', 'core.hooksPath', 'custom hooks');
  assert.match(vitals(fx), /pre-commit current · pre-push OUTDATED OR MODIFIED/);
});

test('startup uses cached main even when the active checkout carries an older installer', (t) => {
  const fx = fixture(t);
  fs.writeFileSync(path.join(fx.wt, 'bin/install-hooks.sh'), '# older checkout installer\n');
  assert.match(vitals(fx, fx.wt), /pre-commit current · pre-push current/);
});

test('startup labels its local-checkout fallback when no cached main exists', (t) => {
  const fx = fixture(t);
  git(fx.main, 'update-ref', '-d', 'refs/remotes/origin/main');
  const out = vitals(fx);
  assert.match(out, /pre-commit current · pre-push current/);
  assert.match(out, /this checkout; no cached origin\/main/);
});

test('startup reports unavailable when its reference cannot be parsed and never executes hook contents', (t) => {
  const fx = fixture(t);
  git(fx.main, 'update-ref', '-d', 'refs/remotes/origin/main');
  fs.writeFileSync(path.join(fx.main, 'bin/install-hooks.sh'), '# no hook definitions\n');
  const marker = path.join(fx.dir, 'hook-was-executed');
  fs.writeFileSync(path.join(fx.main, '.git/hooks/pre-push'), `#!/bin/sh\ntouch '${marker}'\n`);
  assert.match(vitals(fx), /git hooks: UNAVAILABLE/);
  assert.equal(fs.existsSync(marker), false);
});

test('startup reports unavailable when the checker crashes and still completes normally', (t) => {
  const fx = fixture(t);
  const scripts = path.join(fx.dir, 'broken-checker');
  write(path.join(scripts, 'session_vitals.sh'), fs.readFileSync(path.join(ROOT, '.claude/hooks/session_vitals.sh')));
  write(path.join(scripts, 'git_hook_health.py'), 'raise RuntimeError("synthetic checker failure")\n');
  const r = run('bash', [path.join(scripts, 'session_vitals.sh')], {
    cwd: fx.main, env: { CLAUDE_PROJECT_DIR: fx.main, CLERKSHIP_SKIP_EGRESS_PROBE: '1' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /git hooks: UNAVAILABLE/);
  assert.match(r.stdout, /== end vitals ==/);
  assert.doesNotMatch(r.stderr, /Traceback/);
});

test('the standalone hook checker is read-only even before the first startup report', (t) => {
  const fx = fixture(t);
  const config = fs.readFileSync(path.join(fx.main, '.git/config'));
  const r = run('python3', [path.join(ROOT, '.claude/hooks/git_hook_health.py')], { cwd: fx.wt });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pre-commit current · pre-push current/);
  assert.deepEqual(fs.readFileSync(path.join(fx.main, '.git/config')), config);
  assert.deepEqual(traceLines(fx), []);
});

test('startup times out a hung checker and continues the rest of the report', (t) => {
  const fx = fixture(t);
  const scripts = path.join(fx.dir, 'slow-checker');
  write(path.join(scripts, 'session_vitals.sh'), fs.readFileSync(path.join(ROOT, '.claude/hooks/session_vitals.sh')));
  write(path.join(scripts, 'git_hook_health.py'), 'import time\ntime.sleep(60)\n');
  const r = spawnSync('bash', [path.join(scripts, 'session_vitals.sh')], {
    cwd: fx.main, encoding: 'utf8', timeout: 15_000,
    env: { ...BASE_ENV, CLAUDE_PROJECT_DIR: fx.main, CLERKSHIP_SKIP_EGRESS_PROBE: '1' },
  });
  assert.equal(r.status, 0, `a hung checker must not hold startup: ${r.error || r.stderr}`);
  assert.match(r.stdout, /git hooks: UNAVAILABLE/);
  assert.match(r.stdout, /== end vitals ==/);
});
