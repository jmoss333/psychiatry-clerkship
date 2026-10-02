"""bin/lean_worktrees.py on a throwaway repository. Cloning is replaced by a recording fake that
really copies bytes, so the rules (what may be shared, what must be refused) are exercised on any
file system, including Linux CI where real clones are unavailable."""
import hashlib
import importlib.util
import os
import shutil
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

# Under the pre-push hook git exports GIT_DIR and friends; scrub before any fixture runs git.
scrub_inherited_git_env()
SPEC = importlib.util.spec_from_file_location('lean_worktrees', ROOT / 'bin' / 'lean_worktrees.py')
lean = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lean)

GIT_ENV = {'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull,
           'GIT_AUTHOR_NAME': 'Fixture', 'GIT_AUTHOR_EMAIL': 'fixture@example.invalid',
           'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid'}
HOUR = 3600


def run(*args, cwd):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True)


def set_age(path, seconds):
    stamp = time.time() - seconds
    os.utime(path, (stamp, stamp))


class LeanWorktrees(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, GIT_ENV)
        self.env.start()
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name).resolve()   # macOS: /tmp is a link to /private/tmp
        self.main = base / 'repo'
        run('git', 'init', '-q', '-b', 'main', str(self.main), cwd=base)
        self.big = os.urandom(200_000)
        (self.main / 'big.bin').write_bytes(self.big)
        (self.main / 'small.txt').write_text('small\n')
        (self.main / '.gitignore').write_text('.claude/\n_build/\n.worktrees/\n')
        run('git', 'add', '.', cwd=self.main)
        run('git', 'commit', '-q', '-m', 'first', cwd=self.main)
        self.copy = self.main / '.claude' / 'worktrees' / 'w1'
        run('git', 'worktree', 'add', '-q', '-b', 'b-w1', str(self.copy), 'main', cwd=self.main)
        # A fake LFS object and a build output file with the same bytes, as _build/ holds the audio.
        self.media = os.urandom(300_000)
        self.oid = hashlib.sha256(self.media).hexdigest()
        store = self.main / '.git' / 'lfs' / 'objects' / self.oid[:2] / self.oid[2:4]
        store.mkdir(parents=True)
        self.obj = store / self.oid
        self.obj.write_bytes(self.media)
        (self.copy / '_build').mkdir()
        (self.copy / '_build' / 'audio.m4a').write_bytes(self.media)
        self.age_everything(2 * HOUR)
        self.clones = []
        self.patch = mock.patch.object(lean, 'clone_file', side_effect=self.fake_clone)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()
        self.env.stop()

    def fake_clone(self, src, dst):
        self.clones.append((Path(src), Path(dst)))
        shutil.copyfile(src, dst)
        return True

    def age_everything(self, seconds):
        for folder in (self.main, self.copy):
            for path in folder.rglob('*'):
                if '.git' not in path.parts or path.name in ('HEAD',):
                    try:
                        set_age(path, seconds)
                    except OSError:
                        pass
            set_age(folder, seconds)
        gitdir = Path((self.copy / '.git').read_text().split(':', 1)[1].strip())
        for name in ('HEAD', 'logs/HEAD'):
            if (gitdir / name).exists():
                set_age(gitdir / name, seconds)

    def test_dry_run_finds_both_kinds_and_changes_nothing(self):
        lines = lean.share(self.main, apply=False)
        self.assertIn('shareable: 2 files', lines[0])
        self.assertEqual(self.clones, [])

    def test_apply_clones_from_main_and_from_the_lfs_store_keeping_bytes_mode_and_mtime(self):
        target = self.copy / 'big.bin'
        os.chmod(target, 0o640)
        before = os.stat(target)
        folder_before = os.stat(self.copy).st_mtime_ns
        lean.share(self.main, apply=True)
        self.assertEqual(os.stat(self.copy).st_mtime_ns, folder_before, 'sharing must not make a copy look used')
        sources = sorted(str(src.relative_to(self.main)) for src, _ in self.clones)
        self.assertEqual(sources, sorted(['big.bin', str(self.obj.relative_to(self.main))]))
        self.assertEqual(target.read_bytes(), self.big)
        self.assertEqual((self.copy / '_build' / 'audio.m4a').read_bytes(), self.media)
        after = os.stat(target)
        self.assertEqual(after.st_mode & 0o7777, 0o640)
        self.assertEqual(after.st_mtime_ns, before.st_mtime_ns)
        self.assertNotEqual(after.st_ino, before.st_ino)
        self.clones.clear()
        lean.share(self.main, apply=True)              # already shared: remembered, not redone
        self.assertEqual(self.clones, [])

    def test_a_file_that_differs_from_main_is_not_shared(self):
        different = bytearray(self.big)
        different[1000] ^= 0xFF
        (self.copy / 'big.bin').write_bytes(bytes(different))
        self.age_everything(2 * HOUR)
        lean.share(self.main, apply=True)
        self.assertEqual((self.copy / 'big.bin').read_bytes(), bytes(different))
        self.assertNotIn(self.copy / 'big.bin', [dst.with_name(dst.name.split('-', 2)[-1]) for _, dst in self.clones])

    def test_a_file_changed_in_the_last_ten_minutes_is_left_alone(self):
        set_age(self.copy / 'big.bin', 60)
        lean.share(self.main, apply=True)
        self.assertEqual([s.name for s, _ in self.clones], [self.oid])

    def test_a_clone_with_different_bytes_is_refused(self):
        def bad_clone(src, dst):
            Path(dst).write_bytes(b'x' * os.path.getsize(src))
            return True
        with mock.patch.object(lean, 'clone_file', side_effect=bad_clone):
            lean.share(self.main, apply=True)
        self.assertEqual((self.copy / 'big.bin').read_bytes(), self.big)
        self.assertEqual((self.copy / '_build' / 'audio.m4a').read_bytes(), self.media)
        self.assertEqual([p.name for p in self.copy.rglob('.lean-*')], [], 'no temporary files left')

    def test_a_copy_used_in_the_last_hour_is_skipped(self):
        set_age(self.copy, 10 * 60)
        lines = lean.share(self.main, apply=True)
        self.assertTrue(any('skip   w1' in line for line in lines))
        self.assertEqual(self.clones, [])

    def test_hydrate_fills_pointers_from_the_store_and_reports_what_is_missing(self):
        pointer = self.copy / 'media.m4a'
        pointer.write_text('version https://git-lfs.github.com/spec/v1\n')
        corrupt = os.urandom(10)
        bad_oid = hashlib.sha256(b'expected').hexdigest()
        bad_store = self.main / '.git' / 'lfs' / 'objects' / bad_oid[:2] / bad_oid[2:4]
        bad_store.mkdir(parents=True)
        (bad_store / bad_oid).write_bytes(corrupt)
        (self.copy / 'corrupt.m4a').write_text('pointer\n')
        filled, missing = lean.hydrate_lfs(self.copy, [(self.oid, 'media.m4a'), ('0' * 64, 'absent.m4a'),
                                                       (bad_oid, 'corrupt.m4a')], self.main / '.git' / 'lfs' / 'objects')
        self.assertEqual(filled, ['media.m4a'])
        self.assertEqual(pointer.read_bytes(), self.media)
        self.assertEqual(sorted(missing), ['absent.m4a', 'corrupt.m4a'])
        self.assertEqual((self.copy / 'corrupt.m4a').read_text(), 'pointer\n')

    def test_new_makes_the_copy_in_the_shared_place_even_when_run_from_another_copy(self):
        lines = lean.new(self.copy, 'fresh', base='main')
        dest = self.main / '.claude' / 'worktrees' / 'fresh'
        self.assertEqual(lines[0], str(dest))
        self.assertTrue((dest / 'big.bin').exists())
        branch = subprocess.run(['git', '-C', str(dest), 'branch', '--show-current'], capture_output=True, text=True).stdout.strip()
        self.assertEqual(branch, 'worktree-fresh')
        with self.assertRaises(ValueError):
            lean.new(self.main, 'fresh', base='main')
        with self.assertRaises(ValueError):
            lean.new(self.main, '../escape', base='main')


@unittest.skipUnless(shutil.which('git-lfs'), 'git-lfs is not installed')
class LeanNewWithRealLfs(unittest.TestCase):
    """The regression the fakes cannot see: after an LFS-skipped checkout the index records each
    placeholder's size, and git calls the filled media 'modified' without reading them. A new
    copy must come out with a clean `git status` and the real media."""

    def setUp(self):
        self.env = mock.patch.dict(os.environ, GIT_ENV)
        self.env.start()
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name).resolve()
        self.main = base / 'repo'
        run('git', 'init', '-q', '-b', 'main', str(self.main), cwd=base)
        run('git', 'lfs', 'install', '--local', cwd=self.main)
        (self.main / '.gitattributes').write_text('*.m4a filter=lfs diff=lfs merge=lfs -text\n')
        (self.main / '.gitignore').write_text('.claude/\n')
        self.audio = os.urandom(150_000)
        (self.main / 'talk.m4a').write_bytes(self.audio)
        run('git', 'add', '.', cwd=self.main)
        run('git', 'commit', '-q', '-m', 'media', cwd=self.main)

    def tearDown(self):
        self.tmp.cleanup()
        self.env.stop()

    def test_new_copy_has_real_media_and_a_clean_status(self):
        lines = lean.new(self.main, 'light', base='main')
        dest = self.main / '.claude' / 'worktrees' / 'light'
        self.assertEqual((dest / 'talk.m4a').read_bytes(), self.audio)
        status = subprocess.run(['git', '-C', str(dest), 'status', '--porcelain'], capture_output=True, text=True).stdout
        self.assertEqual(status, '')
        staged = subprocess.run(['git', '-C', str(dest), 'diff', '--cached', '--name-only'], capture_output=True, text=True).stdout
        self.assertEqual(staged, '')
        self.assertFalse(any('warning' in line for line in lines))
        removed = subprocess.run(['git', '-C', str(self.main), 'worktree', 'remove', str(dest)], capture_output=True, text=True)
        self.assertEqual(removed.returncode, 0, removed.stderr)


if __name__ == '__main__':
    unittest.main()
