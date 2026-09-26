// coordination-report.test.mjs — bin/coordination_report.py derives who else is working, what
// collides, and what is about to be lost, from git alone. Each worktree in the fixture is one
// verdict, and each has a twin that must NOT get it: a report that flags everything is as
// useless as one that flags nothing (the node_modules symlink made ~20 idle worktrees read as
// "1 uncommitted" on the real repo before it was filtered).
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
const SCRIPT = path.join(ROOT, 'bin/coordination_report.py');
const ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };
const THREE_DAYS_AGO = Math.floor(Date.now() / 1000) - 3 * 86400;

function git(cwd, args, extra = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...ENV, ...extra } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function commit(repo, file, text, epoch) {
  fs.writeFileSync(path.join(repo, file), text);
  git(repo, ['add', file]);
  const stamp = `@${epoch} +0000`;
  const when = epoch ? { GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp } : {};
  git(repo, ['commit', '-qm', `${file}: ${text.trim()}`], when);
}

/** A primary checkout plus one linked worktree per verdict; `minimal` keeps only `self`. */
function fixture(t, { minimal = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coordination-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'remote.git');
  const main = path.join(dir, 'main');
  git(dir, ['init', '-q', '--bare', '--initial-branch=main', remote]);
  git(dir, ['clone', '-q', remote, main]);
  git(main, ['config', 'user.name', 'Coordination fixture']);
  git(main, ['config', 'user.email', 'coordination@example.invalid']);
  commit(main, 'shared.txt', 'base\n');
  commit(main, 'other.txt', 'base\n');
  git(main, ['push', '-q', '-u', 'origin', 'main']);
  const wt = (name) => {
    const p = path.join(dir, 'wt', name);
    git(main, ['worktree', 'add', '-q', '-b', `feat/${name}`, p, 'origin/main']);
    return p;
  };
  const self = wt('self');
  commit(self, 'shared.txt', 'mine\n');
  if (minimal) return { dir, main, self };

  // Uncommitted edit to the file `self` changes, just now: active AND overlapping.
  const peer = wt('peer');
  fs.writeFileSync(path.join(peer, 'shared.txt'), 'theirs\n');
  // A commit nobody pushed, three days idle: at risk.
  const stale = wt('stale');
  commit(stale, 'stale.txt', 'only here\n', THREE_DAYS_AGO);
  // Squash-merged twin of `stale`: never pushed, equally idle, but main already has its content.
  const landed = wt('landed');
  commit(landed, 'other.txt', 'landed\n', THREE_DAYS_AGO);
  commit(main, 'other.txt', 'landed\n');
  git(main, ['push', '-q', 'origin', 'main']);
  // Untracked but not work, each caught by a different filter: a symlink (tests/smoke/
  // node_modules is one in every real worktree), a real node_modules directory the ignore rules
  // miss, and an LFS-phantom-shaped media file.
  const noise = wt('noise');
  fs.symlinkSync(dir, path.join(noise, 'deps-link'));
  fs.mkdirSync(path.join(noise, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(noise, 'node_modules', 'pkg', 'index.js'), 'x\n');
  fs.writeFileSync(path.join(noise, 'clip.m4a'), 'pointer\n');
  // An untracked note last touched three days ago: at risk.
  const abandoned = wt('abandoned');
  fs.writeFileSync(path.join(abandoned, 'notes.txt'), 'draft\n');
  fs.utimesSync(path.join(abandoned, 'notes.txt'), THREE_DAYS_AGO, THREE_DAYS_AGO);
  return { dir, main, self, peer, stale, landed, noise, abandoned };
}

function run(cwd, ...args) {
  const r = spawnSync('python3', [SCRIPT, ...args], { cwd, encoding: 'utf8', env: ENV });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function report(cwd, ...args) {
  const r = run(cwd, '--json', ...args);
  assert.ok(r.out.startsWith('{'), r.err || r.out);
  return { code: r.code, data: JSON.parse(r.out) };
}

const byBranch = (rows) => Object.fromEntries(rows.map((w) => [w.branch, w]));

test('derives overlap, activity and risk — and withholds each from its look-alike', (t) => {
  const fx = fixture(t);
  const { data } = report(fx.self);
  assert.equal(data.worktrees_total, 7);
  assert.equal(data.worktrees_examined, 7);
  assert.equal(data.partial, false);
  assert.deepEqual(data.self.changed, ['shared.txt']);

  assert.deepEqual(data.overlap.map((o) => [o.branch, o.shared]), [['feat/peer', ['shared.txt']]]);
  assert.deepEqual(data.active.map((w) => w.branch), ['feat/peer']);

  const risk = byBranch(data.at_risk);
  assert.deepEqual(Object.keys(risk).sort(), ['feat/abandoned', 'feat/stale']);
  assert.equal(risk['feat/stale'].unpushed, 1);
  assert.equal(risk['feat/abandoned'].dirty, 1);
  assert.ok(risk['feat/stale'].idle_hours >= 71, `idle ${risk['feat/stale'].idle_hours}`);
  assert.equal(data.prs_checked, false, 'no --prs: open PRs were not consulted and it must say so');
});

test('a squash-landed branch is neither at risk nor a source of overlap', (t) => {
  const fx = fixture(t);
  const { data } = report(fx.self, '--active-hours', '1000');
  const seen = [...data.active, ...data.at_risk].map((w) => w.branch);
  assert.ok(seen.includes('feat/stale'), 'control: its unlanded twin is seen');
  assert.ok(!seen.includes('feat/landed'), 'landed work has no activity and no risk');
  assert.ok(!data.overlap.some((o) => o.branch === 'feat/landed'));
  // Control: the same branch is really unpushed — only the content test excuses it.
  assert.equal(git(fx.main, ['rev-list', '--count', 'feat/landed', '--not', '--remotes']), '1');
});

test('dependency symlinks and media phantoms are not uncommitted work', (t) => {
  const fx = fixture(t);
  const text = run(fx.self, '--stale-hours', '0', '--active-hours', '1000').out;
  assert.doesNotMatch(text, /feat\/noise/, text);
  // Control: a real untracked file in the same worktree is reported at once.
  fs.writeFileSync(path.join(fx.noise, 'real.txt'), 'work\n');
  assert.match(run(fx.self, '--active-hours', '1000').out, /active: feat\/noise/);
});

test('report-only: nothing is fetched, moved, locked or removed', (t) => {
  const fx = fixture(t);
  const before = git(fx.main, ['worktree', 'list', '--porcelain']);
  const refs = git(fx.main, ['for-each-ref']);
  run(fx.self, '--check');
  run(fx.self, '--vitals', '--budget', '1');
  assert.equal(git(fx.main, ['worktree', 'list', '--porcelain']), before);
  assert.equal(git(fx.main, ['for-each-ref']), refs);
  assert.ok(fs.existsSync(path.join(fx.abandoned, 'notes.txt')));
});

test('suggests locking this worktree until it is locked', (t) => {
  const fx = fixture(t, { minimal: true });
  assert.match(run(fx.self).out, /git worktree lock --reason/);
  git(fx.main, ['worktree', 'lock', '--reason', 'session-under-test', fx.self]);
  const { data } = report(fx.self);
  assert.equal(data.self.locked, 'session-under-test');
  assert.doesNotMatch(run(fx.self).out, /git worktree lock --reason/);
});

test('--check: 0 clean, 1 on overlap or risk, 2 when it could not check everything', (t) => {
  const quiet = fixture(t, { minimal: true });
  const clean = run(quiet.self, '--check');
  assert.equal(clean.code, 0, clean.out + clean.err);
  assert.match(clean.out, /overlap: none — 1 changed path\(s\) vs 1 other worktree/);

  const busy = fixture(t);
  assert.equal(run(busy.self, '--check').code, 1);
  assert.equal(run(busy.self).code, 0, 'report mode never blocks');

  // A budget too small to finish: says PARTIAL, still examines this checkout, and --check
  // refuses to call a partial sweep clean.
  const cut = report(busy.self, '--budget', '0.000001');
  assert.equal(cut.data.partial, true);
  assert.ok(cut.data.worktrees_examined < 7);
  assert.deepEqual(cut.data.self.changed, ['shared.txt']);
  assert.match(run(busy.self, '--budget', '0.000001').out, /PARTIAL — examined \d\/7/);
  assert.equal(run(busy.self, '--budget', '0.000001', '--check').code, 2);

  const nobase = run(busy.self, '--base', 'origin/does-not-exist');
  assert.equal(nobase.code, 2);
  assert.match(nobase.out, /UNKNOWN — base origin\/does-not-exist does not resolve/);
});

// A stand-in `gh` on PATH: answers `pr list --state open|merged` from files, or fails.
function fakeGh(t, dir, { open, merged, fail = false }) {
  const bin = path.join(dir, 'fake-gh-bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'open.json'), JSON.stringify(open ?? []));
  fs.writeFileSync(path.join(bin, 'merged.json'), JSON.stringify(merged ?? []));
  fs.writeFileSync(path.join(bin, 'gh'), fail ? '#!/bin/sh\nexit 1\n' : [
    '#!/bin/sh',
    `case "$*" in *"--state open"*) cat "${bin}/open.json";; *) cat "${bin}/merged.json";; esac`,
    '',
  ].join('\n'), { mode: 0o755 });
  return { ...ENV, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
}

function reportWith(env, cwd, ...args) {
  const r = spawnSync('python3', [SCRIPT, '--json', ...args], { cwd, encoding: 'utf8', env });
  assert.ok(r.stdout.startsWith('{'), r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

test('--prs: open PRs overlap (never this branch\'s own), merged PR heads count as landed', (t) => {
  const fx = fixture(t);
  const staleHead = git(fx.stale, ['rev-parse', 'HEAD']);
  const env = fakeGh(t, fx.dir, {
    open: [
      { number: 900, title: 'another', headRefName: 'feat/elsewhere', isDraft: true,
        files: [{ path: 'shared.txt' }, { path: 'unrelated.txt' }] },
      { number: 901, title: 'this branch', headRefName: 'feat/self', isDraft: false,
        files: [{ path: 'shared.txt' }] },
    ],
    // The base moved on after the merge, so only the PR record can say this landed.
    merged: [{ headRefName: 'feat/stale', headRefOid: staleHead }],
  });
  const data = reportWith(env, fx.self, '--prs');
  assert.equal(data.prs_checked, true);
  assert.equal(data.merged_prs_checked, true);
  const prOverlap = data.overlap.filter((o) => o.source === 'pr');
  assert.deepEqual(prOverlap.map((o) => [o.number, o.shared]), [[900, ['shared.txt']]]);
  assert.deepEqual(data.at_risk.map((w) => w.branch), ['feat/abandoned']);
  // Control: without --prs the same branch is at risk — the PR record is what excused it.
  assert.ok(reportWith(env, fx.self).at_risk.some((w) => w.branch === 'feat/stale'));
});

test('--prs with a failing gh reports "not checked", never an empty PR list', (t) => {
  const fx = fixture(t, { minimal: true });
  const env = fakeGh(t, fx.dir, { fail: true });
  const data = reportWith(env, fx.self, '--prs');
  assert.equal(data.prs_checked, false);
  assert.equal(data.merged_prs_checked, false);
  const opts = { cwd: fx.self, encoding: 'utf8', env };
  const text = spawnSync('python3', [SCRIPT, '--prs'], opts).stdout;
  assert.match(text, /open PRs NOT checked/);
});
