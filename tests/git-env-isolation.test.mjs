// git-env-isolation.test.mjs — no test fixture can write into the repository that runs it.
//
// 2026-08-20 and 2026-09-24: suites run with an inherited GIT_DIR turned their `git init <tmp>`
// into a re-init of the REAL repository (core.bare=true in the shared .git/config), then wrote
// their fixture identity and a `filter.lfs … = cat` shim there too. tests/_git_env.mjs and
// bin/_git_env.py hold the one fix: scrub every inherited GIT_* before a fixture runs git.
//
// Two halves, and both matter:
//   * BEHAVIOUR — each helper, called the way fixtures call it, keeps the incident's exact
//     writes out of a victim repository shaped like ours (primary checkout + linked worktree,
//     extensions.worktreeConfig on, GIT_DIR = the worktree's gitdir, as a pre-push hook sets
//     it). The same writes WITHOUT the helper are run too and must corrupt the victim: that
//     control is what proves the fixture reproduces the incident, so a pass is not vacuous.
//   * COVERAGE — every tracked file that builds git repositories (spawns git AND names
//     init/clone) calls the helper. A new fixture that forgets fails here, by name. The scan's
//     own floor is pinned so a regex that stops matching cannot turn this into a pass over
//     nothing (docs/SILENT_SHRINK_CHECKLIST.md).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { scrubInheritedGitEnv } from './_git_env.mjs';

// Builds git repositories: an inherited GIT_DIR would aim them at the repo running this file.
scrubInheritedGitEnv();

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HERMETIC = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...HERMETIC } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// A victim shaped like this repository; returns the hostile GIT_DIR a hook would export.
function victim(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-env-victim-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const main = path.join(dir, 'main');
  git(dir, 'init', '-q', '--initial-branch=main', main);
  git(main, 'config', 'user.name', 'Owner');
  git(main, 'config', 'user.email', 'owner@example.invalid');
  git(main, 'config', 'extensions.worktreeConfig', 'true');
  fs.writeFileSync(path.join(main, 'a.txt'), 'a\n');
  git(main, 'add', 'a.txt');
  git(main, 'commit', '-qm', 'a');
  git(main, 'worktree', 'add', '-q', '-b', 'wt', path.join(dir, 'wt'));
  const config = path.join(main, '.git', 'config');
  return { dir, config, before: fs.readFileSync(config, 'utf8'), gitDir: path.join(main, '.git', 'worktrees', 'wt') };
}

function configKeys(file) {
  return git(os.tmpdir(), 'config', '--file', file, '--list');
}

// The incident's writes, verbatim in shape: runtime-contract / devcontainer-receipt
// (`git init <dir>` then `git config user.*` with cwd=<dir>) and lfs-pull-cached (`git init`
// with cwd=<dir>, then `git config filter.lfs.*`).
const NODE_FIXTURE = `
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scrubInheritedGitEnv } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'tests', '_git_env.mjs')).href)};
if (process.env.USE_HELPER === '1') scrubInheritedGitEnv();
const a = mkdtempSync(join(tmpdir(), 'git-env-fixture-'));
const b = mkdtempSync(join(tmpdir(), 'git-env-fixture-'));
try {
  execFileSync('git', ['init', '-q', a]);
  execFileSync('git', ['config', 'user.name', 'Synthetic Tester'], { cwd: a });
  execFileSync('git', ['config', 'user.email', 'synthetic@example.invalid'], { cwd: a });
  execFileSync('git', ['init', '-q'], { cwd: b });
  execFileSync('git', ['config', 'filter.lfs.smudge', 'cat'], { cwd: b });
  process.stdout.write(execFileSync('git', ['config', '--file', join(a, '.git', 'config'), '--get', 'user.name'], { encoding: 'utf8' }));
} finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
`;

const PY_FIXTURE = `
import os, subprocess, sys, tempfile
sys.path.append(${JSON.stringify(path.join(ROOT, 'bin'))})
from _git_env import scrub_inherited_git_env
if os.environ.get("USE_HELPER") == "1":
    scrub_inherited_git_env()
with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
    subprocess.run(["git", "init", "-q", a], check=True)
    subprocess.run(["git", "config", "user.name", "Synthetic Tester"], cwd=a, check=True)
    subprocess.run(["git", "init", "-q"], cwd=b, check=True)
    subprocess.run(["git", "config", "filter.lfs.smudge", "cat"], cwd=b, check=True)
    out = subprocess.run(["git", "config", "--file", os.path.join(a, ".git", "config"), "--get", "user.name"],
                         capture_output=True, text=True, check=True).stdout
    sys.stdout.write(out)
`;

const RUNNERS = {
  node: (env) => spawnSync(process.execPath, ['--input-type=module', '-e', NODE_FIXTURE], { encoding: 'utf8', env }),
  python: (env) => spawnSync('python3', ['-c', PY_FIXTURE], { encoding: 'utf8', env }),
};

for (const [lang, runFixture] of Object.entries(RUNNERS)) {
  test(`${lang}: with the helper, the incident's fixture writes stay in the fixture`, (t) => {
    const v = victim(t);
    const r = runFixture({ ...process.env, ...HERMETIC, GIT_DIR: v.gitDir, USE_HELPER: '1' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'Synthetic Tester', 'the fixture repository got its own identity');
    assert.equal(fs.readFileSync(v.config, 'utf8'), v.before, 'the victim config must be byte-identical');
  });

  test(`${lang}: without the helper, the same writes corrupt the victim (the control)`, (t) => {
    const v = victim(t);
    runFixture({ ...process.env, ...HERMETIC, GIT_DIR: v.gitDir });
    const keys = configKeys(v.config);
    assert.match(keys, /^core\.bare=true$/m, 'the 2026-09-24 signature: core.bare flipped in the shared config');
    assert.match(keys, /^user\.name=Synthetic Tester$/m);
  });
}

// ---------------------------------------------------------------- coverage

const SPAWNS_GIT = /(['"])git\1\s*[,\])]|\bgit\s+(init|clone)\b/;
const BUILDS_REPO = /(['"])(init|clone)\1|\bgit\s+(init|clone)\b/;
const NODE_CALL = /^scrubInheritedGitEnv\(\);/m;            // module scope: column 0
const PY_MODULE_CALL = /^scrub_inherited_git_env\(\)/m;     // module scope: column 0
const PY_SELF_TEST_CALL = /^def self_test\(\):[^\n]*\n(?:(?:[ \t]+[^\n]*|)\n)*?[ \t]+scrub_inherited_git_env\(\)/m;
const HELPERS = new Set(['tests/_git_env.mjs', 'bin/_git_env.py', 'tests/git-env-isolation.test.mjs']);

function trackedSources() {
  const out = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard',
    '*.mjs', '*.js', '*.cjs', '*.py'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout.split('\0').filter((f) => f && !f.includes('node_modules/') && !f.startsWith('tests/smoke/'));
}

function repoBuilders() {
  return trackedSources().filter((file) => {
    if (HELPERS.has(file)) return false;
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return SPAWNS_GIT.test(text) && BUILDS_REPO.test(text);
  }).sort();
}

function isolated(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (!file.endsWith('.py')) return NODE_CALL.test(text);
  if (PY_MODULE_CALL.test(text)) return true;
  if (file.startsWith('bin/')) return PY_SELF_TEST_CALL.test(text);
  // pytest loads a directory's conftest.py before any module in it.
  const conftest = path.join(ROOT, path.dirname(file), 'conftest.py');
  return fs.existsSync(conftest) && PY_MODULE_CALL.test(fs.readFileSync(conftest, 'utf8'));
}

test('every file that builds git repositories scrubs the inherited git environment first', () => {
  const builders = repoBuilders();
  // Floor + known members: a scan that silently matched less would otherwise pass over nothing.
  assert.ok(builders.length >= 18, `the scan found only ${builders.length} repo-building files:\n${builders.join('\n')}`);
  for (const known of [
    'tests/runtime-contract.test.mjs', 'tests/devcontainer-receipt.test.mjs', 'tests/lfs-pull-cached.test.mjs',
    'tests/maintenance/test_workflow_heartbeat.py', 'tests/anki/conftest.py', 'bin/pr_preflight.py',
  ]) assert.ok(builders.includes(known), `the scan no longer sees ${known}`);
  const bare = builders.filter((file) => !isolated(file));
  assert.deepEqual(bare, [], 'these files build git repositories without scrubbing an inherited GIT_DIR. '
    + 'Node: import { scrubInheritedGitEnv } from tests/_git_env.mjs and call it at module scope. '
    + 'Python: scrub_inherited_git_env() from bin/_git_env.py at module scope (a bin/ tool: first thing in '
    + 'self_test()). See tests/_git_env.mjs for why.');
});

test('the coverage scan recognises each accepted form, and rejects a call that is not at module scope', () => {
  const cases = [
    ['scrubInheritedGitEnv();\n', NODE_CALL, true],
    ['function f() {\n  scrubInheritedGitEnv();\n}\n', NODE_CALL, false],
    ['scrub_inherited_git_env()\n', PY_MODULE_CALL, true],
    ['def helper():\n    scrub_inherited_git_env()\n', PY_MODULE_CALL, false],
    ['def self_test():\n    # why\n\n    from _git_env import scrub_inherited_git_env\n    scrub_inherited_git_env()\n', PY_SELF_TEST_CALL, true],
    ['def self_test():\n    return 0\n\ndef main():\n    scrub_inherited_git_env()\n', PY_SELF_TEST_CALL, false],
  ];
  for (const [text, rule, want] of cases) assert.equal(rule.test(text), want, `${rule} on ${JSON.stringify(text)}`);
});
