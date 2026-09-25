import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = path.join(root, 'bin/sync_status.py');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull });
function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-status-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const remote = path.join(dir, 'remote.git'), local = path.join(dir, 'local');
  git(dir, 'init', '--bare', '--initial-branch=main', remote);
  git(dir, 'clone', remote, local);
  git(local, 'config', 'user.name', 'Sync fixture');
  git(local, 'config', 'user.email', 'sync@example.invalid');
  commit(local, 'initial');
  git(local, 'push', '-u', 'origin', 'main');
  const peer = path.join(dir, 'peer');
  git(dir, 'clone', remote, peer);
  git(peer, 'config', 'user.name', 'Sync fixture');
  git(peer, 'config', 'user.email', 'sync@example.invalid');
  return { dir, remote, local, peer };
}
function commit(repo, name) {
  fs.writeFileSync(path.join(repo, name), name);
  git(repo, 'add', name);
  git(repo, 'commit', '-m', name);
}
function report(repo, ...args) {
  const result = spawnSync('python3', [script, '--repo', repo, '--json', ...args], { env, encoding: 'utf8' });
  assert.ok(result.stdout.startsWith('{'), result.stderr || result.stdout);
  return { code: result.status, data: JSON.parse(result.stdout) };
}

test('reports cached equality honestly and verifies the remote only on refresh', t => {
  const { local } = fixture(t);
  const cached = report(local);
  assert.equal(cached.code, 0);
  assert.equal(cached.data.state, 'in-sync');
  assert.equal(cached.data.remote_evidence, 'cached');
  const fresh = report(local, '--refresh');
  assert.equal(fresh.data.remote_evidence, 'refreshed');
  assert.equal(fresh.data.head, fresh.data.remote_head);
});

test('detects ahead, behind, and divergence without changing checkout or untracked work', t => {
  const { local, peer } = fixture(t);
  commit(peer, 'remote-work');
  git(peer, 'push');
  assert.equal(report(local).data.state, 'in-sync', 'cached knowledge may be stale');
  assert.equal(report(local, '--refresh').data.state, 'behind');
  commit(local, 'local-work');
  fs.writeFileSync(path.join(local, 'unsaved'), 'keep me');
  fs.appendFileSync(path.join(local, 'initial'), ' edited');
  const before = git(local, 'rev-parse', 'HEAD');
  const divergent = report(local, '--check');
  assert.equal(divergent.code, 1);
  assert.equal(divergent.data.state, 'diverged');
  assert.equal(divergent.data.ahead, 1);
  assert.equal(divergent.data.behind, 1);
  assert.equal(divergent.data.tracked_changes, 1);
  assert.equal(divergent.data.untracked_files, 1);
  assert.equal(git(local, 'rev-parse', 'HEAD'), before);
  assert.equal(fs.readFileSync(path.join(local, 'unsaved'), 'utf8'), 'keep me');
  assert.equal(report(local).code, 0, 'report-only mode does not block work');
  assert.equal(report(peer).data.state, 'in-sync');
  commit(peer, 'ahead-work');
  assert.equal(report(peer).data.state, 'ahead');
});

test('handles detached HEAD, staged renames, and filenames with newlines', t => {
  const { local } = fixture(t);
  git(local, 'switch', '--detach');
  git(local, 'mv', 'initial', 'renamed\nfile');
  fs.writeFileSync(path.join(local, 'new\nfile'), 'keep');
  const result = report(local, '--check');
  assert.equal(result.data.branch, null);
  assert.equal(result.data.tracked_changes, 2, 'both changed paths are counted');
  assert.equal(result.data.untracked_files, 1);
  assert.equal(result.code, 1);
});

test('missing reference and failed refresh cannot masquerade as synchronized', t => {
  const { local, remote } = fixture(t);
  assert.equal(report(local, '--branch', 'missing').code, 2);
  fs.renameSync(remote, `${remote}.away`);
  const failed = report(local, '--refresh');
  assert.equal(failed.code, 2);
  assert.equal(failed.data.state, 'unknown');
  assert.equal(failed.data.remote_evidence, 'refresh-failed');
  assert.ok(failed.data.error);
});

test('shallow history is unknown rather than an incomplete ahead/behind count', t => {
  const { dir, remote } = fixture(t);
  const shallow = path.join(dir, 'shallow');
  git(dir, 'clone', '--depth=1', `file://${remote}`, shallow);
  const result = report(shallow);
  assert.equal(result.code, 2);
  assert.equal(result.data.state, 'unknown');
  assert.match(result.data.error, /shallow/i);
});

test('unrelated histories are unknown even though rev-list can count both sides', t => {
  const { local } = fixture(t);
  git(local, 'switch', '--orphan', 'unrelated');
  commit(local, 'different-root');
  const result = report(local);
  assert.equal(result.code, 2);
  assert.equal(result.data.state, 'unknown');
  assert.match(result.data.error, /merge-base/);
});

test('session startup invokes the report without a network refresh', () => {
  const hook = fs.readFileSync(path.join(root, '.claude/hooks/session_vitals.sh'), 'utf8');
  assert.match(hook, /python3 bin\/sync_status\.py/);
  assert.doesNotMatch(hook.split('\n').find(line => line.includes('python3 bin/sync_status.py')), /--refresh/);
});
