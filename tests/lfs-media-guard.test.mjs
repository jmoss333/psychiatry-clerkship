import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { lfsStubReason } from './_lfs_media.mjs';

// Unit tests for the shared Git-LFS guard that lets build-spawning suites SKIP instead of
// reporting a failure nobody can act on.
//
// WHY IT EXISTS: _prototypes/sp-interview/tests/ci-build-contract.test.mjs spawns
// build_deploy.py. That build refuses Git-LFS pointer stubs outside the soft contexts
// check_lfs_media.is_soft_context() names, so on a machine without git-lfs installed --
// where the smudge filter never ran and every tracked file IS its pointer -- three
// contract tests failed with "MS3 Compass required files are invalid: <an .mp4>". Nothing
// in any source could fix that, and a standing red trains readers to discount the whole
// suite and reach for --no-verify.
//
// WHAT MUST NOT BREAK: a skip guard is a silent shrink waiting to happen -- if it ever
// returns a reason on a HEALTHY tree, three real contracts stop running and the suite
// still reads green. So the dangerous direction here is the permissive one, and these
// tests pin it from both sides: stubs present => skip, everything else => RUN.
//
// These drive the real predicate through its CLI rather than a stand-in, so what they pin
// is the code the guard actually executes.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = path.join(ROOT, '13_Faculty_Resources/_automation/site_build/check_lfs_media.py');
const PYTHON = process.env.CLERKSHIP_META_PYTHON || 'python3';

const POINTER = 'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'ab'.repeat(32) + '\nsize 1234\n';
const LFS_ATTRIBUTES = '*.mp3 filter=lfs diff=lfs merge=lfs -text\n*.mp4 filter=lfs diff=lfs merge=lfs -text\n';

function tmpTree(t, { attributes = LFS_ATTRIBUTES, files = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfs-guard-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (attributes !== null) fs.writeFileSync(path.join(dir, '.gitattributes'), attributes);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return dir;
}

// Ask the predicate itself, with the soft-context variables cleared unless a case sets them.
function ask(tree, env = {}) {
  const clean = { ...process.env };
  delete clean.GITHUB_ACTIONS;
  delete clean.CONTEXT;
  const r = spawnSync(PYTHON, [CHECKER, '--worktree-stubs', tree], {
    encoding: 'utf8',
    env: { ...clean, ...env },
  });
  return { status: r.status, out: (r.stdout || '').trim(), err: r.stderr };
}

test('a tracked media file that is a pointer stub reports the file and the remedy', (t) => {
  const tree = tmpTree(t, { files: { 'audio/talk.mp3': POINTER } });
  const r = ask(tree);
  assert.equal(r.status, 1, r.err);
  assert.match(r.out, /audio\/talk\.mp3/, 'names the offending file');
  assert.match(r.out, /git lfs install && git lfs pull/, 'names the remedy');
});

test('real media on a healthy tree runs the assertions rather than skipping them', (t) => {
  const tree = tmpTree(t, { files: { 'audio/talk.mp3': 'real audio bytes, not a pointer' } });
  const r = ask(tree);
  assert.equal(r.status, 0, `a healthy tree must not skip anything: ${r.out}`);
  assert.equal(r.out, '');
});

test('a soft context runs them too: there the build downgrades a stub to a warning', (t) => {
  const tree = tmpTree(t, { files: { 'audio/talk.mp3': POINTER } });
  for (const env of [{ GITHUB_ACTIONS: 'true' }, { CONTEXT: 'deploy-preview' }]) {
    const r = ask(tree, env);
    assert.equal(r.status, 0, `${JSON.stringify(env)} must RUN: ${r.out}`);
  }
});

test('an untracked extension is not mistaken for a stub', (t) => {
  // Same pointer bytes, but .txt is not routed through LFS, so the build never gates it.
  const tree = tmpTree(t, { files: { 'notes/readme.txt': POINTER } });
  assert.equal(ask(tree).status, 0);
});

test('a tree tracking nothing through LFS runs loudly instead of skipping', (t) => {
  // "Cannot tell" must never read as "skip" -- that would retire the contracts silently.
  const stubs = { 'audio/talk.mp3': POINTER };
  assert.equal(ask(tmpTree(t, { attributes: '*.md text\n', files: stubs })).status, 0);
  assert.equal(ask(tmpTree(t, { attributes: null, files: stubs })).status, 0);
});

test('build output and vendored trees do not decide whether SOURCE was materialised', (t) => {
  const tree = tmpTree(t, {
    files: { '_build/ms3/audio/talk.mp3': POINTER, 'node_modules/pkg/demo.mp4': POINTER },
  });
  assert.equal(ask(tree).status, 0, 'a stub under _build/ or node_modules/ is not the signal');
});

// --- the JS wrapper's half: how it reads the predicate's exit codes -------------------

function fakeChecker(t, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfs-guard-wrap-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const abs = path.join(dir, '13_Faculty_Resources/_automation/site_build/check_lfs_media.py');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return dir;
}

test('the wrapper treats exit 1 as the skip signal and passes the reason through', (t) => {
  const repo = fakeChecker(t, 'import sys\nprint("stub: media/x.mp4")\nsys.exit(1)\n');
  assert.equal(lfsStubReason(repo), 'stub: media/x.mp4');
});

test('the wrapper treats every non-1 outcome as RUN, never as skip', (t) => {
  // A usage error, a crash, and a checker that is not there at all: each means "could not
  // tell", and an unknown must send the caller down the loud path.
  const usage = fakeChecker(t, 'import sys\nprint("usage", file=sys.stderr)\nsys.exit(2)\n');
  const crash = fakeChecker(t, 'raise SystemExit(3)\n');
  const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'lfs-guard-none-'));
  t.after(() => fs.rmSync(missing, { recursive: true, force: true }));

  assert.equal(lfsStubReason(usage), null);
  assert.equal(lfsStubReason(crash), null);
  assert.equal(lfsStubReason(missing), null);
});

test('an exit 1 with no reason text still does not skip: a skip must say why', (t) => {
  const silent = fakeChecker(t, 'import sys\nsys.exit(1)\n');
  assert.equal(lfsStubReason(silent), null);
});
