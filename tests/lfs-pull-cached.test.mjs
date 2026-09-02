// lfs-pull-cached.test.mjs — contract for the Netlify LFS cache step (2026-08-30 outage).
//
// The 2026-08-30 production outage was GitHub's per-account Git-LFS *bandwidth* quota: with
// GIT_LFS_ENABLED=true Netlify re-downloaded every LFS object on every production build of both
// sites, exhausted the 10 GB/month quota, and then checked out pointer stubs that the media gate
// (correctly) refused to publish. lfs_pull_cached.sh moves the fetch into the build step and
// backs it with Netlify's persistent per-site cache, so a build downloads only what the cache
// lacks.
//
// The pull itself is exercised against a throwaway repo with a `git-lfs` SHIM on PATH — never
// against the real checkout — so this suite can run inside a Netlify build (it does: the build
// runs tests/*.test.mjs before the pull step) without spending a byte of LFS bandwidth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_BUILD = join(ROOT, '13_Faculty_Resources', '_automation', 'site_build');
const SCRIPT = join(SITE_BUILD, 'lfs_pull_cached.sh');
const BUILD_AND_CHECK = readFileSync(join(SITE_BUILD, 'build_and_check.sh'), 'utf8');

const POINTER = 'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'ab'.repeat(32) + '\nsize 1234\n';

// Env with every Netlify / CI marker removed, so the result does not depend on where the suite
// itself runs (a laptop, GitHub Actions, or inside a Netlify build).
function scrubbedEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of ['NETLIFY', 'NETLIFY_CACHE_DIR', 'NETLIFY_BUILD_BASE', 'GITHUB_ACTIONS', 'LFS_CACHE_DIR',
    'GIT_LFS_FETCH_INCLUDE', 'LFS_SHIM_LOG', 'LFS_SHIM_FAIL']) {
    delete env[k];
  }
  return { ...env, ...extra };
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

// A throwaway repo shaped like ours: .gitattributes tracks *.m4a via LFS, two pointer stubs.
function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'lfs-repo-'));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'test@example.invalid']);
  git(repo, ['config', 'user.name', 'test']);
  // A machine with git-lfs installed has a *global* smudge/clean filter; neutralise it here so
  // the fixture's checkouts never reach a real LFS endpoint (the shim owns every `git lfs` call).
  git(repo, ['config', 'filter.lfs.smudge', 'cat']);
  git(repo, ['config', 'filter.lfs.clean', 'cat']);
  git(repo, ['config', 'filter.lfs.process', 'cat']);
  git(repo, ['config', 'filter.lfs.required', 'false']);
  writeFileSync(join(repo, '.gitattributes'), '# comment line\n*.m4a filter=lfs diff=lfs merge=lfs -text\n*.md text\n');
  mkdirSync(join(repo, 'audio'));
  writeFileSync(join(repo, 'audio', 'a.m4a'), POINTER);
  writeFileSync(join(repo, 'audio', 'b.m4a'), POINTER);
  writeFileSync(join(repo, 'README.md'), 'not media\n');
  git(repo, ['add', '.']);
  git(repo, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture']);
  return repo;
}

// `git lfs …` resolves to a `git-lfs` executable on PATH; this shim records the pull args,
// simulates a pull (pointer → bytes, one object into lfs.storage) or a failure on demand.
function makeShim() {
  const dir = mkdtempSync(join(tmpdir(), 'lfs-shim-'));
  const shim = join(dir, 'git-lfs');
  writeFileSync(shim, `#!/usr/bin/env bash
case "\${1:-}" in
  version) echo "git-lfs/0.0.0 (shim)";;
  pull)
    shift; printf '%s\\n' "$@" > "\${LFS_SHIM_LOG:?}"
    if [ -n "\${LFS_SHIM_FAIL:-}" ]; then echo "\${LFS_SHIM_FAIL}" >&2; exit 2; fi
    store="$(git config lfs.storage)"; mkdir -p "$store/objects"; head -c 2097152 /dev/zero > "$store/objects/obj"
    for f in $(git ls-files -- '*.m4a'); do printf 'REALBYTES' > "$f"; done;;
  *) exit 0;;
esac
`);
  chmodSync(shim, 0o755);
  return dir;
}

function run(env, cwd = ROOT) {
  return spawnSync('bash', [SCRIPT], { cwd, env, encoding: 'utf8' });
}

test('lfs_pull_cached.sh parses as bash', () => {
  const r = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('build_and_check.sh runs the cached LFS pull after the node contract tests and before any site build', () => {
  // Match the invocations, not the header comment that also names these scripts.
  const pull = BUILD_AND_CHECK.indexOf('bash "$HERE/lfs_pull_cached.sh"');
  const nodeTests = BUILD_AND_CHECK.indexOf('node --test');
  const build = BUILD_AND_CHECK.indexOf('python3 "$HERE/build_deploy.py"');
  const gate = BUILD_AND_CHECK.indexOf('python3 "$HERE/check_lfs_media.py"');
  assert.ok(pull > 0, 'build_and_check.sh must invoke lfs_pull_cached.sh');
  assert.ok(nodeTests > 0 && nodeTests < pull, 'a red contract test must still abort before any network work');
  assert.ok(build > pull, 'media must be materialised before build_deploy.py copies it');
  assert.ok(gate > pull, 'check_lfs_media.py stays the gate, downstream of the pull');
  assert.match(BUILD_AND_CHECK, /bash "\$HERE\/lfs_pull_cached\.sh"/, 'invoked via $HERE like the other site_build scripts');
});

test('outside Netlify the step is a silent no-op (local builds and bin/verify.sh untouched)', () => {
  const r = run(scrubbedEnv());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^lfs-cache: not a Netlify build -> skip/m);
  assert.doesNotMatch(r.stdout, /pulling via cache/);
});

test('inside GitHub Actions the step defers to the deliberate lfs:false checkout', () => {
  const r = run(scrubbedEnv({ NETLIFY: 'true', GITHUB_ACTIONS: 'true' }));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /GitHub Actions checks out with lfs:false on purpose -> skip/);
});

test('on Netlify it pulls through lfs.storage under the persistent cache and reports the download', () => {
  const repo = makeRepo();
  const cache = mkdtempSync(join(tmpdir(), 'lfs-cache-'));
  const log = join(cache, 'shim.log');
  const env = scrubbedEnv({ NETLIFY: 'true', NETLIFY_CACHE_DIR: cache, LFS_SHIM_LOG: log, PATH: `${makeShim()}:${process.env.PATH}` });
  const r = run(env, repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 pointer stub\(s\) among 2 LFS-tracked file\(s\) -> pulling via cache/);
  assert.match(r.stdout, new RegExp(`object store: ${cache}/git-lfs`));
  assert.equal(git(repo, ['config', 'lfs.storage']).trim(), `${cache}/git-lfs`, 'objects must live in the between-builds cache');
  // The shim drops one 2 MiB object into the store; `du -sm` may round the directory up by 1.
  assert.match(r.stdout, /OK — pulled in \d+s; ~[23] MB downloaded from GitHub this build, store now [23] MB/);
  assert.equal(readFileSync(join(repo, 'audio', 'a.m4a'), 'utf8'), 'REALBYTES');
  assert.equal(readFileSync(log, 'utf8').trim(), '', 'no --include unless GIT_LFS_FETCH_INCLUDE is set');
});

test('a second build with a warm cache downloads nothing', () => {
  const repo = makeRepo();
  const cache = mkdtempSync(join(tmpdir(), 'lfs-cache-'));
  const log = join(cache, 'shim.log');
  const env = scrubbedEnv({ NETLIFY: 'true', NETLIFY_CACHE_DIR: cache, LFS_SHIM_LOG: log, PATH: `${makeShim()}:${process.env.PATH}` });
  assert.equal(run(env, repo).status, 0);
  // Next build = fresh clone: the tree is pointer stubs again, the cache dir survives.
  writeFileSync(join(repo, 'audio', 'a.m4a'), POINTER);
  writeFileSync(join(repo, 'audio', 'b.m4a'), POINTER);
  const r = run(env, repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /~0 MB downloaded from GitHub this build, store now [23] MB/);
});

test('GIT_LFS_FETCH_INCLUDE is honoured and files it excludes are reported, not failed', () => {
  const repo = makeRepo();
  const cache = mkdtempSync(join(tmpdir(), 'lfs-cache-'));
  const log = join(cache, 'shim.log');
  const env = scrubbedEnv({ NETLIFY: 'true', NETLIFY_CACHE_DIR: cache, LFS_SHIM_LOG: log, GIT_LFS_FETCH_INCLUDE: '*.mp4', PATH: `${makeShim()}:${process.env.PATH}` });
  const r = run(env, repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(log, 'utf8').trim(), '--include=*.mp4');
  assert.match(r.stdout, /honouring GIT_LFS_FETCH_INCLUDE=\*\.mp4/);
});

test('when the clone already materialised real bytes it does nothing and says why (legacy env var)', () => {
  const repo = makeRepo();
  writeFileSync(join(repo, 'audio', 'a.m4a'), 'REALBYTES');
  writeFileSync(join(repo, 'audio', 'b.m4a'), 'REALBYTES');
  const cache = mkdtempSync(join(tmpdir(), 'lfs-cache-'));
  const env = scrubbedEnv({ NETLIFY: 'true', NETLIFY_CACHE_DIR: cache, PATH: `${makeShim()}:${process.env.PATH}` });
  const r = run(env, repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /all 2 LFS-tracked file\(s\) are already real bytes -> nothing to do/);
  assert.match(r.stdout, /Remove GIT_LFS_ENABLED and/);
});

test('a quota refusal from GitHub fails the build early and names the cause', () => {
  const repo = makeRepo();
  const cache = mkdtempSync(join(tmpdir(), 'lfs-cache-'));
  const log = join(cache, 'shim.log');
  const env = scrubbedEnv({
    NETLIFY: 'true', NETLIFY_CACHE_DIR: cache, LFS_SHIM_LOG: log, PATH: `${makeShim()}:${process.env.PATH}`,
    LFS_SHIM_FAIL: 'batch response: This repository is over its data quota. Account responsible for LFS bandwidth should purchase more data packs to restore access.',
  });
  const r = run(env, repo);
  assert.equal(r.status, 1, 'must fail the build, not hand a stub tree to the gate silently');
  assert.match(r.stdout, /ERROR git lfs pull failed \(exit 2\)/);
  assert.match(r.stdout, /over its data quota/);
  assert.match(r.stdout, /GitHub Git-LFS BANDWIDTH QUOTA/);
  assert.match(r.stdout, /github\.com\/settings\/billing/);
});

test('without git-lfs on PATH it steps aside and leaves the failure to the media gate', () => {
  const repo = makeRepo();
  const cache = mkdtempSync(join(tmpdir(), 'lfs-cache-'));
  // A shim that reports no git-lfs at all: `git lfs version` must fail.
  const dir = mkdtempSync(join(tmpdir(), 'lfs-noshim-'));
  const shim = join(dir, 'git-lfs');
  writeFileSync(shim, '#!/usr/bin/env bash\nexit 1\n');
  chmodSync(shim, 0o755);
  const env = scrubbedEnv({ NETLIFY: 'true', NETLIFY_CACHE_DIR: cache, PATH: `${dir}:${process.env.PATH}` });
  const r = run(env, repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /git-lfs is not available/);
});

test('the media gate names the bandwidth quota as the first thing to check', () => {
  const gate = readFileSync(join(SITE_BUILD, 'check_lfs_media.py'), 'utf8');
  assert.match(gate, /BANDWIDTH QUOTA/);
  assert.match(gate, /Incident pattern 2/);
});
