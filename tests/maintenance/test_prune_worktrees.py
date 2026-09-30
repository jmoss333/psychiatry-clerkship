"""bin/prune_worktrees.py end to end, on a throwaway repository with one worktree of every kind.

The script's --self-test proves each rule refuses on its own; this proves the facts it reads from
real git are the right ones: a worktree whose commit is in main and one that is exactly a merged
PR's head are removed, and a dirty, unmerged, recently used, locked or outside worktree is not.
"""
import importlib.util
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / 'bin'))
from _git_env import scrub_inherited_git_env  # noqa: E402

# Under the pre-push hook git exports GIT_DIR and friends; a fixture that ran git with them
# would act on the real repository. Scrub first, then set only what the fixtures need.
scrub_inherited_git_env()
SPEC = importlib.util.spec_from_file_location('prune_worktrees', ROOT / 'bin' / 'prune_worktrees.py')
prune = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prune)

GIT_ENV = {
    'GIT_CONFIG_NOSYSTEM': '1',
    'GIT_CONFIG_GLOBAL': os.devnull,
    'GIT_AUTHOR_NAME': 'Fixture', 'GIT_AUTHOR_EMAIL': 'fixture@example.invalid',
    'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid',
}


def run(*args, cwd):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True)


def age(path, hours):
    """Make a worktree look last used `hours` ago: its folder and its git record."""
    stamp = time.time() - hours * 3600
    targets = [path]
    gitdir = (path / '.git').read_text().split(':', 1)[1].strip()
    targets += [Path(gitdir) / name for name in ('HEAD', 'index', 'logs/HEAD')]
    for target in targets:
        if target.exists():
            os.utime(target, (stamp, stamp))


class PruneWorktreesEndToEnd(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, GIT_ENV)
        self.env.start()
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        origin, self.repo = base / 'origin.git', base / 'repo'
        run('git', 'init', '-q', '--bare', '-b', 'main', str(origin), cwd=base)
        run('git', 'clone', '-q', str(origin), str(self.repo), cwd=base)
        (self.repo / 'a.txt').write_text('a\n')
        run('git', 'add', 'a.txt', cwd=self.repo)
        run('git', 'commit', '-q', '-m', 'first', cwd=self.repo)
        run('git', 'push', '-q', 'origin', 'HEAD:main', cwd=self.repo)
        trees = self.repo / '.claude' / 'worktrees'
        self.paths = {}
        for name in ('merged', 'squash', 'unmerged', 'dirty', 'fresh', 'locked'):
            self.paths[name] = trees / name
            run('git', 'worktree', 'add', '-q', '-b', f'b-{name}', str(self.paths[name]), 'origin/main', cwd=self.repo)
        self.paths['outside'] = base / 'outside'
        run('git', 'worktree', 'add', '-q', '-b', 'b-outside', str(self.paths['outside']), 'origin/main', cwd=self.repo)
        for name in ('squash', 'unmerged'):
            (self.paths[name] / f'{name}.txt').write_text(name)
            run('git', 'add', '.', cwd=self.paths[name])
            run('git', 'commit', '-q', '-m', name, cwd=self.paths[name])
        self.squash_head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=self.paths['squash'],
                                          capture_output=True, text=True, check=True).stdout.strip()
        (self.paths['dirty'] / 'notes.txt').write_text('unsaved work')
        run('git', 'worktree', 'lock', str(self.paths['locked']), cwd=self.repo)
        for name, path in self.paths.items():
            age(path, 0.5 if name == 'fresh' else 48)

    def tearDown(self):
        self.tmp.cleanup()
        self.env.stop()

    def test_only_merged_clean_idle_agent_worktrees_are_removed(self):
        rows, notes = prune.survey(self.repo, min_idle_hours=12, pr_heads={self.squash_head: 42})
        verdicts = {Path(row['path']).name: (row['safe'], row['reason']) for row in rows}
        self.assertEqual(notes, [])
        self.assertEqual(verdicts['merged'], (True, 'clean, and its commit is in main'))
        self.assertEqual(verdicts['squash'], (True, 'clean, and its commit is the head of merged PR #42'))
        self.assertEqual(verdicts['unmerged'][0], False)
        self.assertIn('not in main', verdicts['unmerged'][1])
        self.assertEqual(verdicts['dirty'], (False, 'has uncommitted or untracked files'))
        self.assertEqual(verdicts['fresh'][0], False)
        self.assertTrue(verdicts['fresh'][1].startswith('used 0.5 h ago'))
        self.assertEqual(verdicts['locked'], (False, 'locked'))
        self.assertEqual(verdicts['outside'][0], False)
        self.assertNotIn('repo', verdicts, 'the main checkout is never a candidate')

        removed, refused = prune.remove(self.repo, rows)
        self.assertEqual(sorted(Path(row['path']).name for row in removed), ['merged', 'squash'])
        self.assertEqual(refused, [])
        for name, path in self.paths.items():
            self.assertEqual(path.exists(), name not in ('merged', 'squash'), name)
        self.assertEqual((self.paths['dirty'] / 'notes.txt').read_text(), 'unsaved work')
        self.assertTrue((self.repo / 'a.txt').exists())

    def test_reading_status_does_not_make_an_old_worktree_look_used(self):
        prune.is_dirty(self.paths['merged'])
        idle = (time.time() - prune.last_activity(self.paths['merged'])) / 3600
        self.assertGreater(idle, 40)

    def test_without_github_only_commits_in_main_count_as_merged(self):
        rows, notes = prune.survey(self.repo, min_idle_hours=12, pr_heads={})
        safe = sorted(Path(row['path']).name for row in rows if row['safe'])
        self.assertEqual(safe, ['merged'])

    def test_self_test_passes(self):
        self.assertEqual(prune.self_test(), [])


if __name__ == '__main__':
    unittest.main()
