#!/usr/bin/env python3
"""lean_worktrees.py -- keep agent copies (git worktrees) of this repository light on disk.

WHY. Measured 2026-09-30: a copy is ~481 MB of tracked files, 433 MB of it the Git LFS media,
plus ~750 MB of _build output once the checks have run, most of it the same audio again. Every
one of those bytes already exists in git's own store (.git/lfs/objects) or in the main checkout.
Sixty-odd copies had filled the Mac's disk to 97%.

HOW. APFS (macOS) can clone a file: the clone shares the original's disk blocks until either
one is changed (copy-on-write). It is an ordinary file, byte-for-byte the same, so git, the
builds and the tests cannot tell the difference, but it takes almost no extra space.

  new NAME [--base REF] [--branch BRANCH]
      Makes a copy at <main checkout>/.claude/worktrees/NAME -- the one shared place, never
      inside another copy -- with LFS downloads skipped, then fills every media file by cloning
      git's stored copy. Costs ~50 MB instead of ~500 MB. Branch defaults to worktree-NAME
      (Claude Code's own naming).
  share [--apply] [--min-idle-hours H]
      For every copy (and the main checkout's media), replaces files that are byte-identical
      to one git already holds -- an LFS object, or the main checkout's copy of the same tracked
      file -- with a clone. Build output (_build) is included: its audio is the same LFS
      objects. Dry run by default.

SAFETY. A file is replaced only when ALL hold: the fresh clone is byte-identical to it (compared
after cloning, before the swap); it did not change between the check and the swap (size, mtime,
inode); it is 64 KB or larger, a regular file, outside .git and node_modules, and unchanged for
10+ minutes. A copy used within --min-idle-hours (default 1) is skipped. The swap is an atomic
rename in the same folder that keeps the file's permissions and modification time. No content
ever changes and nothing is deleted; the worst case is a file that stays a full copy. Where
cloning is not available (Linux, non-APFS disks) nothing is changed.

Exit 0 fine, 2 could not run. Stdlib only; shells out to git (and git-lfs for `new`).
"""
import argparse
import ctypes
import filecmp
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

MIN_SIZE = 64 * 1024
SETTLED_SECONDS = 10 * 60
DEFAULT_MIN_IDLE_HOURS = 1
SKIP_DIRS = {'.git', 'node_modules', '.venv', 'venv', '__pycache__'}
NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$')
STATE_FILE = 'lean-worktrees-state.json'
GB = 1024 ** 3


# ─── cloning ────────────────────────────────────────────────────────────────────────────────
def _libc_clonefile():
    if sys.platform != 'darwin':
        return None
    try:
        libc = ctypes.CDLL('/usr/lib/libSystem.dylib', use_errno=True)
        fn = libc.clonefile
        fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint32]
        fn.restype = ctypes.c_int
        return fn
    except (OSError, AttributeError):
        return None


_CLONEFILE = _libc_clonefile()


def clone_file(src, dst):
    """Copy-on-write clone of src at dst (dst must not exist). True on success. Tests replace this."""
    if _CLONEFILE is None:
        return False
    return _CLONEFILE(os.fsencode(str(src)), os.fsencode(str(dst)), 0) == 0


def replace_with_clone(dst, src, expected_stat=None):
    """Swap dst for a clone of src, only if the clone is byte-identical to dst and dst did not change.
    Returns the bytes shared, or 0 when nothing was done."""
    dst, src = Path(dst), Path(src)
    try:
        before = expected_stat or os.stat(dst, follow_symlinks=False)
    except OSError:
        return 0
    tmp = dst.with_name(f'.lean-{os.getpid()}-{dst.name}')
    # Creating the clone next to the file touches the folder's timestamp, which is how the prune
    # job tells when a copy was last used. Nothing in the folder changes, so it is put back on
    # every path out of here, a refused swap included.
    try:
        folder = os.stat(dst.parent)
    except OSError:
        return 0
    try:
        if tmp.exists() or not clone_file(src, tmp):
            return 0
        if not filecmp.cmp(tmp, dst, shallow=False):
            return 0
        now = os.stat(dst, follow_symlinks=False)
        if (now.st_size, now.st_mtime_ns, now.st_ino) != (before.st_size, before.st_mtime_ns, before.st_ino):
            return 0
        os.chmod(tmp, before.st_mode & 0o7777)
        os.utime(tmp, ns=(before.st_atime_ns, before.st_mtime_ns))
        os.replace(tmp, dst)
        return before.st_size
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
        try:
            os.utime(dst.parent, ns=(folder.st_atime_ns, folder.st_mtime_ns))
        except OSError:
            pass


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


# ─── the repository ─────────────────────────────────────────────────────────────────────────
def git(cwd, *args, env=None, timeout=600):
    return subprocess.run(['git', '--no-optional-locks', '-C', str(cwd), *args], capture_output=True,
                          text=True, timeout=timeout, env=env)


def worktrees(repo):
    """[(path, gitdir)] for every registered worktree; the first is the main checkout."""
    out = git(repo, 'worktree', 'list', '--porcelain')
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or 'git worktree list failed')
    paths = [Path(line[len('worktree '):]) for line in out.stdout.splitlines() if line.startswith('worktree ')]
    result = []
    for path in paths:
        dot_git = path / '.git'
        try:
            gitdir = Path(dot_git.read_text().split(':', 1)[1].strip()) if dot_git.is_file() else dot_git
        except (OSError, IndexError):
            gitdir = None
        result.append((path, gitdir))
    return result


def common_dir(main):
    out = git(main, 'rev-parse', '--path-format=absolute', '--git-common-dir')
    return Path(out.stdout.strip()) if out.returncode == 0 else Path(main) / '.git'


def lfs_objects(common):
    """{size: {sha256: path}} for every object in git's LFS store."""
    index = {}
    root = common / 'lfs' / 'objects'
    if root.is_dir():
        for path in root.glob('??/??/*'):
            if path.is_file() and re.fullmatch(r'[0-9a-f]{64}', path.name):
                index.setdefault(path.stat().st_size, {})[path.name] = path
    return index


def last_used_hours(path, gitdir):
    """Signals a status check cannot touch: the folder, and the copy's HEAD and reflog."""
    stamps = []
    for candidate in (Path(path), *( [Path(gitdir) / 'HEAD', Path(gitdir) / 'logs' / 'HEAD'] if gitdir else [])):
        try:
            stamps.append(candidate.stat().st_mtime)
        except OSError:
            pass
    return (time.time() - max(stamps)) / 3600 if stamps else None


def load_state(gitdir):
    try:
        return json.loads((Path(gitdir) / STATE_FILE).read_text())
    except (OSError, ValueError, TypeError):
        return {}


def save_state(gitdir, state):
    try:
        (Path(gitdir) / STATE_FILE).write_text(json.dumps(state))
    except OSError:
        pass


def candidate_files(top, nested):
    """Regular files >= MIN_SIZE under top, not descending into .git, node_modules or other copies."""
    for folder, dirs, files in os.walk(top):
        here = Path(folder)
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and (here / d) not in nested
                   and not (here / d / '.git').exists()]
        for name in files:
            path = here / name
            try:
                st = os.stat(path, follow_symlinks=False)
            except OSError:
                continue
            if st.st_size >= MIN_SIZE and os.path.isfile(path) and not os.path.islink(path):
                yield path, st


# ─── share ──────────────────────────────────────────────────────────────────────────────────
def share_one(top, gitdir, *, main, lfs, tracked, nested, apply, media_only=False, now=None):
    """Share one copy's identical files. Returns (files, bytes) shared (or shareable in a dry run)."""
    now = time.time() if now is None else now
    state = load_state(gitdir) if gitdir else {}
    fresh_state, count, total = {}, 0, 0
    for path, st in candidate_files(top, nested):
        rel = str(path.relative_to(top))
        key = [st.st_size, st.st_mtime_ns, st.st_ino]
        if state.get(rel) == key:                     # already a clone, unchanged since
            fresh_state[rel] = key
            continue
        if now - st.st_mtime < SETTLED_SECONDS:
            continue
        source = None
        same_size = lfs.get(st.st_size)
        if same_size:
            digest = sha256(path)
            source = same_size.get(digest)
        if source is None and not media_only and rel in tracked:
            other = Path(main) / rel
            try:
                if other.is_file() and os.stat(other).st_size == st.st_size and filecmp.cmp(other, path, shallow=False):
                    source = other
            except OSError:
                source = None
        if source is None:
            continue
        if apply:
            shared = replace_with_clone(path, source, expected_stat=st)
            if not shared:
                continue
            new = os.stat(path, follow_symlinks=False)
            fresh_state[rel] = [new.st_size, new.st_mtime_ns, new.st_ino]
        count += 1
        total += st.st_size
    if apply and gitdir:
        save_state(gitdir, fresh_state)
    return count, total


def share(repo, *, apply, min_idle_hours=DEFAULT_MIN_IDLE_HOURS):
    trees = worktrees(repo)
    main = trees[0][0]
    lfs = lfs_objects(common_dir(main))
    all_paths = {p.resolve() for p, _ in trees}
    lines, grand = [], [0, 0]
    before = shutil.disk_usage(main).free / GB
    for index, (path, gitdir) in enumerate(trees):
        if not path.is_dir():
            continue
        is_main = index == 0
        used = last_used_hours(path, gitdir)
        if not is_main and (used is None or used < min_idle_hours):
            lines.append(f'  skip   {path.name}  (used {used:.1f} h ago)' if used is not None else f'  skip   {path.name}')
            continue
        nested = {p for p in all_paths if p != path.resolve() and path.resolve() in p.parents}
        listed = git(path, 'ls-files', '-z')
        tracked = set(listed.stdout.split('\0')) if listed.returncode == 0 else set()
        files, size = share_one(path, gitdir, main=main, lfs=lfs, tracked=tracked, nested=nested,
                                apply=apply, media_only=is_main)
        grand[0] += files
        grand[1] += size
        if files:
            lines.append(f"  {'shared' if apply else 'would '} {path.name}{' (main checkout, media only)' if is_main else ''}: "
                         f'{files} files, {size / GB:.2f} GB')
    after = shutil.disk_usage(main).free / GB
    verb = 'shared' if apply else 'shareable'
    lines.insert(0, f'lean worktrees: {len(trees)} checkouts · {verb}: {grand[0]} files, {grand[1] / GB:.1f} GB')
    if apply:
        lines.append(f'disk: {before:.1f} GB free before, {after:.1f} GB after ({after - before:+.1f} GB)')
    elif _CLONEFILE is None:
        lines.append('note: this file system cannot clone files, so --apply would change nothing here')
    return lines


# ─── new ────────────────────────────────────────────────────────────────────────────────────
def hydrate_lfs(dest, entries, store):
    """Replace LFS pointer files with clones of git's stored objects. entries: [(oid, relpath)].
    Returns (filled paths, missing paths) -- missing objects stay pointers until `git lfs pull`."""
    filled, missing = [], []
    for oid, rel in entries:
        obj = store / oid[:2] / oid[2:4] / oid
        target = Path(dest) / rel
        if not obj.is_file() or not target.is_file():
            missing.append(rel)
            continue
        st = os.stat(target, follow_symlinks=False)
        if st.st_size == obj.stat().st_size:
            continue                                   # already the real file
        tmp = target.with_name(f'.lean-{os.getpid()}-{target.name}')
        try:
            if not clone_file(obj, tmp):
                shutil.copyfile(obj, tmp)              # no clone support: an ordinary copy
            if sha256(tmp) != oid:
                missing.append(rel)
                continue
            os.chmod(tmp, st.st_mode & 0o7777)
            os.replace(tmp, target)
            filled.append(rel)
        finally:
            if tmp.exists():
                tmp.unlink()
    return filled, missing


def new(repo, name, *, base='origin/main', branch=None):
    if not NAME.match(name):
        raise ValueError('name: letters, digits, dot, dash or underscore, up to 80 characters')
    main = worktrees(repo)[0][0]
    dest = main / '.claude' / 'worktrees' / name
    if dest.exists():
        raise ValueError(f'{dest} already exists')
    branch = branch or f'worktree-{name}'
    env = {**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1'}
    out = git(main, 'worktree', 'add', '-b', branch, str(dest), base, env=env)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or 'git worktree add failed')
    listing = git(dest, 'lfs', 'ls-files', '-l')
    entries = []
    for line in listing.stdout.splitlines():
        parts = line.split(' ', 2)
        if len(parts) == 3 and re.fullmatch(r'[0-9a-f]{64}', parts[0]):
            entries.append((parts[0], parts[2]))
    filled, missing = hydrate_lfs(dest, entries, common_dir(main) / 'lfs' / 'objects')
    # The index still records each placeholder's size, and git treats a size change as a
    # modification without reading the file. Re-adding the filled files stores the same blob
    # (the clean filter turns the media back into the identical pointer) and records the new size.
    for start in range(0, len(filled), 200):
        added = git(dest, 'add', '--', *filled[start:start + 200])
        if added.returncode != 0:
            raise RuntimeError(f'could not record the media files: {added.stderr.strip()}')
    leftover = git(dest, 'status', '--porcelain').stdout.strip()
    lines = [str(dest), f'  branch {branch} from {base}; {len(filled)} media files cloned from git\'s store']
    if leftover:
        lines.append(f'  warning: git reports changes right after creation:\n{leftover[:500]}')
    if missing:
        lines.append(f'  {len(missing)} media files are not in the local store yet: run `git -C {dest} lfs pull`')
    return lines


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--repo', default=str(Path(__file__).resolve().parent.parent))
    sub = parser.add_subparsers(dest='command', required=True)
    p_new = sub.add_parser('new', help='make a light copy in the one shared place')
    p_new.add_argument('name')
    p_new.add_argument('--base', default='origin/main')
    p_new.add_argument('--branch')
    p_share = sub.add_parser('share', help='share identical files between copies (dry run by default)')
    p_share.add_argument('--apply', action='store_true')
    p_share.add_argument('--min-idle-hours', type=float, default=DEFAULT_MIN_IDLE_HOURS)
    args = parser.parse_args(argv)
    try:
        if args.command == 'new':
            lines = new(args.repo, args.name, base=args.base, branch=args.branch)
        else:
            lines = share(args.repo, apply=args.apply, min_idle_hours=args.min_idle_hours)
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print(f'could not run: {error}', file=sys.stderr)
        return 2
    print(time.strftime('%Y-%m-%d %H:%M'), *lines, sep='\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
