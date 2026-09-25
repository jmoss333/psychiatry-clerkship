import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrubInheritedGitEnv } from './_git_env.mjs';

// Builds git repositories: an inherited GIT_DIR would aim them at the repo running this file.
scrubInheritedGitEnv();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// System probes are the boundary doubles: the actual classifiers, report, Git
// topology checks, CLI and bootstrap run. No Docker mutation or real credential
// helper is executed by these tests.
const cases = String.raw`
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

root = Path.cwd()
spec = importlib.util.spec_from_file_location('preflight', root / 'bin/devcontainer-preflight.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
LFS_LIST_COMMAND = ('git', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.clean=',
                    '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.required=false', 'lfs', 'ls-files', '--json')

class Probes:
    def __init__(self, root):
        self.root = root
        self.values = {
            ('git', 'rev-parse', '--show-toplevel'): str(root),
            ('git', 'rev-parse', '--absolute-git-dir'): str(root / '.git'),
            ('git', 'rev-parse', '--path-format=absolute', '--git-common-dir'): str(root / '.git'),
            ('git', 'config', '--get', 'lfs.storage'): (1, ''),
            ('git', 'lfs', 'version'): 'git-lfs/3.7.1',
            LFS_LIST_COMMAND: json.dumps({'files': [
                {'name': 'sample.mp3', 'checkout': True, 'downloaded': True, 'size': 8}
            ]}),
            ('git', 'config', '--null', '--get-regexp', r'^credential(\..*)?\.helper$'): (1, ''),
            ('docker', 'info', '--format', '{{json .MemTotal}}'): str(8 * 1024**3),
        }
        self.calls = []
    def __call__(self, args, cwd):
        self.calls.append(tuple(args))
        value = self.values[tuple(args)]  # Unexpected commands must fail the test.
        if isinstance(value, Exception):
            raise value
        code, text = value if isinstance(value, tuple) else (0, value)
        return subprocess.CompletedProcess(args, code, text, 'PRIVATE_SENTINEL')

class Preflight(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        (self.root / '.git').mkdir()
        (self.root / '.gitattributes').write_text('*.mp3 filter=lfs diff=lfs merge=lfs -text\n')
        (self.root / 'sample.mp3').write_bytes(b'realdata')
        self.probes = Probes(self.root)
    def report(self, context='host', **kwargs):
        return p.collect(self.root, context, runner=self.probes, environ={}, **kwargs)
    def finding(self, report, name):
        return next(row for row in report['checks'] if row['id'] == name)
    def test_healthy_host_reports_measured_scope_without_writes(self):
        before = sorted(str(x.relative_to(self.root)) for x in self.root.rglob('*'))
        result = self.report()
        self.assertEqual(result['exitCode'], 0)
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(self.finding(result, 'lfs-media')['count'], 1)
        self.assertEqual(sorted(str(x.relative_to(self.root)) for x in self.root.rglob('*')), before)
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(result))
    def test_linked_git_outside_mount_is_blocked(self):
        self.probes.values[('git', 'rev-parse', '--absolute-git-dir')] = str(self.root.parent / 'outside/git')
        self.assertEqual(self.report()['exitCode'], 1)
    def test_missing_git_directory_is_blocked_not_ready(self):
        self.probes.values[('git', 'rev-parse', '--absolute-git-dir')] = str(self.root / 'missing')
        self.assertEqual(self.report()['exitCode'], 1)
    def test_git_probe_failure_is_unknown_without_republishing_stderr(self):
        self.probes.values[('git', 'rev-parse', '--show-toplevel')] = (128, '')
        result = self.report()
        self.assertEqual(result['exitCode'], 2)
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(result))
    def test_empty_or_relative_git_output_is_unknown(self):
        for value in ['', '.git']:
            with self.subTest(value=value):
                self.probes.values[('git', 'rev-parse', '--absolute-git-dir')] = value
                self.assertEqual(self.report()['exitCode'], 2)
    def test_stub_or_missing_media_blocks_setup(self):
        (self.root / 'sample.mp3').write_bytes(b'version https://git-lfs.github.com/spec/v1\noid sha256:' + b'a' * 64 + b'\nsize 8\n')
        for item in [{'name': 'sample.mp3', 'checkout': False}, {'name': 'sample.mp3', 'checkout': True},
                     {'name': 'missing.mp3', 'checkout': True}]:
            with self.subTest(item=item):
                self.probes.values[LFS_LIST_COMMAND] = json.dumps({'files': [item]})
                self.assertEqual(self.report()['exitCode'], 1)
    def test_edited_materialized_media_is_not_a_pointer(self):
        self.probes.values[LFS_LIST_COMMAND] = json.dumps({'files': [
            {'name': 'sample.mp3', 'checkout': False, 'downloaded': True, 'size': 8}
        ]})
        (self.root / 'sample.mp3').write_bytes(b'edited synthetic media bytes')
        result = self.report()
        self.assertEqual(result['exitCode'], 0)
        self.assertEqual(self.finding(result, 'lfs-media')['status'], 'pass')
    def test_unreadable_materialized_media_is_unknown_not_ready(self):
        with patch.object(Path, 'open', side_effect=PermissionError('PRIVATE_SENTINEL')):
            result = self.report()
        self.assertEqual(result['exitCode'], 2)
        self.assertEqual(self.finding(result, 'lfs-media')['status'], 'unknown')
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(result))
    def test_empty_malformed_and_wrong_type_lfs_inventory_are_unknown(self):
        for value in ['not json', '{}', '{"files": []}', '{"files": {}}', '{"files": [{"name":"sample.mp3"}]}',
                      '{"files": [{"name":"sample.mp3","checkout":"true"}]}',
                      '{"files": [{"name":"../escape.mp3","checkout":true}]}']:
            with self.subTest(value=value):
                self.probes.values[LFS_LIST_COMMAND] = value
                self.assertEqual(self.report()['exitCode'], 2)
    def test_external_lfs_storage_is_blocked_before_lfs_inspection(self):
        self.probes.values[('git', 'config', '--get', 'lfs.storage')] = str(self.root.parent / 'host-cache')
        result = self.report()
        self.assertEqual(result['exitCode'], 1)
        self.assertNotIn(LFS_LIST_COMMAND, self.probes.calls)
    def test_missing_lfs_tool_is_blocked_and_downloads_nothing(self):
        self.probes.values[('git', 'lfs', 'version')] = (1, '')
        self.assertEqual(self.report()['exitCode'], 1)
        self.assertFalse(any('pull' in call or 'fetch' in call or 'install' in call for call in self.probes.calls))
    def test_low_memory_warns_without_becoming_a_minimum_gate(self):
        self.probes.values[('docker', 'info', '--format', '{{json .MemTotal}}')] = str(2 * 1024**3)
        result = self.report()
        self.assertEqual(result['exitCode'], 0)
        self.assertEqual(result['status'], 'warnings')
        self.assertEqual(self.finding(result, 'memory')['status'], 'warn')
    def test_unavailable_docker_and_malformed_memory_do_not_pass(self):
        for value in [(1, ''), 'null', 'true', '0', '-1', 'oops']:
            with self.subTest(value=value):
                self.probes.values[('docker', 'info', '--format', '{{json .MemTotal}}')] = value
                self.assertEqual(self.report()['exitCode'], 2)
    def test_container_never_requires_docker_socket(self):
        result = self.report('container', memory_reader=lambda: 6 * 1024**3)
        self.assertEqual(result['exitCode'], 0)
        self.assertFalse(any(call[0] == 'docker' for call in self.probes.calls))
    def test_memory_timeout_is_unknown(self):
        self.probes.values[('docker', 'info', '--format', '{{json .MemTotal}}')] = subprocess.TimeoutExpired('docker', 5)
        self.assertEqual(self.report()['exitCode'], 2)
    def test_credential_values_and_ssh_socket_are_never_displayed_or_executed(self):
        key = ('git', 'config', '--null', '--get-regexp', r'^credential(\..*)?\.helper$')
        for helper in ['!/definitely-missing/PRIVATE_SENTINEL auth git-credential',
                       '!f() { echo PRIVATE_SENTINEL; }; f', 'store --file=PRIVATE_SENTINEL', '"PRIVATE_SENTINEL']:
            with self.subTest(helper=helper):
                self.probes.values[key] = 'credential.helper\n' + helper + '\0'
                report = p.collect(self.root, 'host', runner=self.probes, environ={'SSH_AUTH_SOCK': 'PRIVATE_SENTINEL'})
                self.assertEqual(report['exitCode'], 0)
                self.assertEqual(self.finding(report, 'credentials')['status'], 'warn')
                self.assertNotIn('PRIVATE_SENTINEL', json.dumps(report))
                self.assertTrue(all(call[0] in ('git', 'docker') for call in self.probes.calls))
                self.assertEqual('executable is unavailable' in self.finding(report, 'credentials')['message'], helper.startswith('!/definitely-missing/'))
    def test_credential_config_could_not_check_is_distinct(self):
        self.probes.values[('git', 'config', '--null', '--get-regexp', r'^credential(\..*)?\.helper$')] = (128, '')
        self.assertEqual(self.report()['exitCode'], 2)
    def test_linux_memory_uses_tighter_cgroup_limit(self):
        data = {'/proc/meminfo': 'MemTotal: 8388608 kB\n', '/proc/self/cgroup': '0::/\n',
                '/sys/fs/cgroup/memory.max': str(2 * 1024**3)}
        self.assertEqual(p.container_memory(read_text=lambda path: data[str(path)]), 2 * 1024**3)
        data['/sys/fs/cgroup/memory.max'] = 'max'
        self.assertEqual(p.container_memory(read_text=lambda path: data[str(path)]), 8 * 1024**3)
        data['/sys/fs/cgroup/memory.max'] = 'broken'
        with self.assertRaises(ValueError):
            p.container_memory(read_text=lambda path: data[str(path)])
    def test_nested_and_v1_cgroups_use_smallest_ancestor_limit(self):
        for group, base, filename in [('0::/child', '/sys/fs/cgroup', 'memory.max'),
                                      ('7:memory:/child', '/sys/fs/cgroup/memory', 'memory.limit_in_bytes')]:
            with self.subTest(group=group):
                data = {'/proc/meminfo': 'MemTotal: 8388608 kB\n', '/proc/self/cgroup': group,
                        base + '/child/' + filename: str(6 * 1024**3), base + '/' + filename: str(4 * 1024**3)}
                self.assertEqual(p.container_memory(read_text=lambda path: data[str(path)]), 4 * 1024**3)
    def test_real_git_layout_and_cli_no_git_root(self):
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        with patch.object(p, 'run_command', wraps=p.run_command):
            rows = []
            self.assertIsNotNone(p.git_layout(self.root, rows, p.run_command))
            self.assertEqual(rows[0]['status'], 'pass')
        empty = self.root / 'empty'
        empty.mkdir()
        # An explicit nonexistent root cannot accidentally inspect the caller repo.
        result = subprocess.run(['python3', str(root / 'bin/devcontainer-preflight.py'), '--root', str(empty / 'missing'), '--json'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(json.loads(result.stdout)['status'], 'unknown')
    def test_cli_does_not_write_bytecode_for_shared_pointer_definition(self):
        bundle = self.root / 'bundle'
        for relative in ['bin/devcontainer-preflight.py',
                         '13_Faculty_Resources/_automation/site_build/check_lfs_media.py']:
            target = bundle / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((root / relative).read_bytes())
        env = {key: value for key, value in os.environ.items()
               if key not in ('PYTHONDONTWRITEBYTECODE', 'PYTHONPYCACHEPREFIX')}
        result = subprocess.run(['python3', str(bundle / 'bin/devcontainer-preflight.py'),
                                 '--root', str(bundle / 'missing'), '--json'],
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(list(bundle.rglob('*.pyc')), [], 'read-only preflight must not write bytecode into the checkout')
    def test_real_lfs_inventory_does_not_refresh_inherited_hooks(self):
        env = {**os.environ, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': str(self.root / 'fixture-global'),
               'GIT_OPTIONAL_LOCKS': '0'}
        def runner(args, cwd):
            return subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=10)
        def git(*args):
            result = runner(['git', *args], self.root)
            self.assertEqual(result.returncode, 0, result.stderr)
            return result.stdout
        if runner(['git', 'lfs', 'version'], self.root).returncode:
            self.skipTest('real Git LFS unavailable; classifier fixtures still run')
        git('init', '-q')
        git('lfs', 'install', '--local', '--skip-repo', '--skip-smudge')
        git('add', '.gitattributes', 'sample.mp3')
        git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture')
        hooks = self.root / 'shared-hooks'
        hooks.mkdir()
        git('config', '--global', 'core.hooksPath', str(hooks))
        rows = []
        p.lfs_check(self.root, self.root / '.git', rows, runner)
        self.assertEqual(rows[0]['status'], 'pass')
        self.assertEqual(rows[0]['count'], 1)
        # A genuine edit changes ls-files.checkout to false without becoming a
        # pointer. Verify the real Git/LFS boundary, not just a made-up inventory.
        (self.root / 'sample.mp3').write_bytes(b'edited synthetic media bytes')
        inventory = json.loads(runner(list(LFS_LIST_COMMAND), self.root).stdout)
        self.assertFalse(inventory['files'][0]['checkout'])
        rows = []
        p.lfs_check(self.root, self.root / '.git', rows, runner)
        self.assertEqual(rows[0]['status'], 'pass', rows)
        self.assertEqual(list(hooks.iterdir()), [], 'read-only inventory must not invoke LFS filters that install hooks')

unittest.main(argv=['preflight-tests'], verbosity=2)
`;

test('preflight checks real classifier behavior and fails closed without repair or secret output', () => {
  const result = spawnSync('python3', ['-B', '-c', cases], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
