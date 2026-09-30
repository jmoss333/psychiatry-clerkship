#!/usr/bin/env python3
"""prune_worktrees.py -- remove the agent worktrees that are provably safe to delete, and warn when
the Mac's disk is nearly full.

WHY. Every agent session works in its own `git worktree` under .claude/worktrees/, and each one
carries its own checkout of the LFS media (~450 MB). Nothing removed them after their work merged:
on 2026-09-29 there were 99 of them holding 81 GB and the disk was 97% full, which is how builds
and the pre-push verify start failing for reasons that look like anything but a full disk.

SAFE means ALL of these, and anything else is kept and listed with its reason:
  inside      a registered worktree under <repo>/.claude/worktrees/ -- never the main checkout,
              never a path outside that folder
  unlocked    not `git worktree lock`ed
  clean       `git status --porcelain` is empty: nothing modified, staged or untracked (ignored
              files such as node_modules do not count; git ignores them too)
  merged      its commit is already in origin/main, OR it is exactly the head commit of a MERGED
              pull request (a squash merge leaves no ancestry, so the PR is the proof)
  idle        no git activity there for --min-idle-hours (default 12): a fresh worktree may belong
              to a session that is still running
Removal is `git worktree remove` WITHOUT --force, so git itself refuses a dirty worktree a second
time. The main checkout, branches and remote branches are never touched.

Usage:
  python3 bin/prune_worktrees.py                     # dry run: what would go, what stays and why
  python3 bin/prune_worktrees.py --apply             # remove the safe ones
  python3 bin/prune_worktrees.py --apply --notify    # the weekly job (bin/install_worktree_prune.sh)
  python3 bin/prune_worktrees.py --self-test

Exit 0 fine, 1 free space is below --warn-below-gb after pruning, 2 could not check.
Stdlib only; shells out to git and (optionally) gh and osascript.
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

WORKTREES_DIR = Path('.claude') / 'worktrees'
MAIN_REF = 'origin/main'
DEFAULT_MIN_IDLE_HOURS = 12
DEFAULT_WARN_BELOW_GB = 50
GB = 1024 ** 3


def parse_worktrees(text):
    """`git worktree list --porcelain` -> [{path, head, branch, detached, locked, prunable}]."""
    items, current = [], {}
    for line in text.splitlines() + ['']:
        if not line.strip():
            if current:
                items.append(current)
                current = {}
            continue
        key, _, value = line.partition(' ')
        if key == 'worktree':
            current['path'] = value
        elif key == 'HEAD':
            current['head'] = value
        elif key == 'branch':
            current['branch'] = value[len('refs/heads/'):] if value.startswith('refs/heads/') else value
        elif key in ('detached', 'bare'):
            current[key] = True
        elif key in ('locked', 'prunable'):
            current[key] = value or True
    return items


def classify(wt, *, inside, dirty, in_main, merged_pr, last_active, now, min_idle_hours):
    """(safe, reason) for one worktree. Pure: every fact is passed in, so --self-test can prove
    each rule refuses on its own."""
    if not inside:
        return False, 'not an agent worktree (outside .claude/worktrees)'
    if wt.get('prunable'):
        return False, 'its folder is already gone (git worktree prune tidies the record)'
    if wt.get('locked'):
        return False, 'locked'
    if dirty is None:
        return False, 'could not read its status'
    if dirty:
        return False, 'has uncommitted or untracked files'
    if not in_main and not merged_pr:
        return False, 'holds commits that are not in main or in a merged pull request'
    if last_active is None:
        return False, 'could not tell when it was last used'
    idle_hours = (now - last_active) / 3600
    if idle_hours < min_idle_hours:
        return False, f'used {idle_hours:.1f} h ago (a session may still be working in it)'
    if in_main:
        return True, 'clean, and its commit is in main'
    return True, f'clean, and its commit is the head of merged PR #{merged_pr}'


# ─── the facts, from git / gh / the file system ─────────────────────────────────────────────
def git(repo, *args, timeout=300):
    return subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True, timeout=timeout)


def merged_pr_heads(repo):
    """{head commit sha: PR number} for every merged PR, or None when gh cannot be asked."""
    try:
        out = subprocess.run(
            ['gh', 'pr', 'list', '--state', 'merged', '--limit', '3000', '--json', 'number,headRefOid'],
            cwd=repo, capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    try:
        return {pr['headRefOid']: pr['number'] for pr in json.loads(out.stdout) if pr.get('headRefOid')}
    except (ValueError, KeyError, TypeError):
        return None


def is_dirty(path):
    try:
        # --no-optional-locks: a status check must not refresh (rewrite) the index, which would
        # make an old worktree look freshly used.
        out = subprocess.run(['git', '--no-optional-locks', '-C', str(path), 'status', '--porcelain'],
                             capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return None
    return None if out.returncode != 0 else bool(out.stdout.strip())


def in_main(repo, sha):
    if not sha:
        return False
    return git(repo, 'merge-base', '--is-ancestor', sha, MAIN_REF).returncode == 0


def last_activity(path):
    """Newest mtime among the folder itself and its git record (HEAD, index, reflog)."""
    candidates = [Path(path)]
    try:
        gitfile = (Path(path) / '.git').read_text()
        if gitfile.startswith('gitdir:'):
            admin = Path(gitfile.split(':', 1)[1].strip())
            candidates += [admin / 'HEAD', admin / 'index', admin / 'logs' / 'HEAD']
    except OSError:
        pass
    stamps = []
    for candidate in candidates:
        try:
            stamps.append(candidate.stat().st_mtime)
        except OSError:
            pass
    return max(stamps) if stamps else None


def free_gb(repo):
    return shutil.disk_usage(repo).free / GB


def notify(title, message):
    script = f'display notification {json.dumps(message)} with title {json.dumps(title)}'
    try:
        subprocess.run(['osascript', '-e', script], capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        pass


# ─── the run ─────────────────────────────────────────────────────────────────────────────────
def survey(repo, *, min_idle_hours, now=None, pr_heads=None):
    """Every registered worktree except the main checkout, judged. Returns (rows, notes).
    `pr_heads` ({sha: PR number}) is asked of GitHub when not given; tests pass it in."""
    repo = Path(repo).resolve()
    now = time.time() if now is None else now
    notes = []
    fetched = git(repo, 'fetch', '-q', 'origin', 'main')
    if fetched.returncode != 0:
        notes.append('could not fetch origin/main; judged against the local copy of it')
    merged = merged_pr_heads(repo) if pr_heads is None else pr_heads
    if merged is None:
        notes.append('GitHub could not be asked for merged pull requests; only commits already in main count as merged')
        merged = {}
    listing = git(repo, 'worktree', 'list', '--porcelain')
    if listing.returncode != 0:
        raise RuntimeError(f'git worktree list failed: {listing.stderr.strip()}')
    root = (repo / WORKTREES_DIR).resolve()
    rows = []
    for wt in parse_worktrees(listing.stdout):
        path = Path(wt.get('path', ''))
        if not wt.get('path') or path.resolve() == repo:
            continue                                   # the main checkout is never a candidate
        inside = root in path.resolve().parents
        present = path.is_dir()
        head = wt.get('head', '')
        last_active = last_activity(path) if present else None      # read before any git call
        safe, reason = classify(
            wt, inside=inside,
            dirty=is_dirty(path) if inside and present and not wt.get('prunable') else None,
            in_main=in_main(repo, head),
            merged_pr=merged.get(head),
            last_active=last_active,
            now=now, min_idle_hours=min_idle_hours)
        rows.append({'path': str(path), 'name': path.name, 'branch': wt.get('branch') or '(detached)',
                     'safe': safe, 'reason': reason})
    return rows, notes


def remove(repo, rows):
    """git worktree remove (never --force) on each safe row; returns (removed, refused)."""
    removed, refused = [], []
    for row in rows:
        if not row['safe']:
            continue
        out = git(repo, 'worktree', 'remove', row['path'])
        if out.returncode == 0:
            removed.append(row)
        else:
            refused.append({**row, 'reason': f"git refused: {out.stderr.strip().splitlines()[-1] if out.stderr.strip() else 'unknown'}"})
    git(repo, 'worktree', 'prune')
    return removed, refused


def report(rows, notes, *, applied, removed=(), refused=(), before_gb=None, after_gb=None, warn_below_gb):
    lines = []
    safe = [r for r in rows if r['safe']]
    kept = [r for r in rows if not r['safe']]
    verb = 'removed' if applied else 'would remove'
    lines.append(f'agent worktrees: {len(rows)} found · {verb} {len(removed) if applied else len(safe)} · kept {len(kept) + len(refused)}')
    for note in notes:
        lines.append(f'  note: {note}')
    for row in (removed if applied else safe):
        lines.append(f'  {"REMOVED" if applied else "REMOVE "}  {row["name"]}  [{row["branch"]}]  {row["reason"]}')
    by_reason = {}
    for row in [*kept, *refused]:
        key = 'used recently (a session may still be working in it)' if row['reason'].startswith('used ') else row['reason']
        by_reason.setdefault(key, []).append(row)
    for reason, group in sorted(by_reason.items(), key=lambda item: -len(item[1])):
        lines.append(f'  KEEP ({len(group)}) {reason}:')
        for row in group:
            lines.append(f'      {row["name"]}  [{row["branch"]}]' + (f'  {row["reason"]}' if row['reason'] != reason else ''))
    if before_gb is not None and after_gb is not None:
        lines.append(f'disk: {before_gb:.1f} GB free before, {after_gb:.1f} GB after ({after_gb - before_gb:+.1f} GB)')
    elif after_gb is not None:
        lines.append(f'disk: {after_gb:.1f} GB free')
    if after_gb is not None and after_gb < warn_below_gb:
        lines.append(f'WARNING: under {warn_below_gb} GB free')
    return lines


# ─── falsification ──────────────────────────────────────────────────────────────────────────
def self_test():
    failures = []

    def check(name, actual, expected):
        if actual != expected:
            failures.append(f'{name}: expected {expected!r}, got {actual!r}')

    now = 1_000_000.0
    old = now - 48 * 3600
    base = dict(inside=True, dirty=False, in_main=True, merged_pr=None, last_active=old, now=now, min_idle_hours=12)
    judge = lambda wt=None, **over: classify(wt or {}, **{**base, **over})[0]
    check('clean, merged into main, idle -> safe', judge(), True)
    check('clean, head of a merged PR (squash), idle -> safe', judge(in_main=False, merged_pr=896), True)
    check('outside .claude/worktrees -> kept', judge(inside=False), False)
    check('locked -> kept', judge({'locked': True}), False)
    check('folder already gone -> kept (prune handles it)', judge({'prunable': True}), False)
    check('uncommitted or untracked files -> kept', judge(dirty=True), False)
    check('status unreadable -> kept', judge(dirty=None), False)
    check('commits in neither main nor a merged PR -> kept', judge(in_main=False, merged_pr=None), False)
    check('used 2 h ago -> kept', judge(last_active=now - 2 * 3600), False)
    check('last use unknown -> kept', judge(last_active=None), False)
    sample = ('worktree /r\nHEAD aaa\nbranch refs/heads/main\n\n'
              'worktree /r/.claude/worktrees/x\nHEAD bbb\nbranch refs/heads/claude/x\nlocked\n\n'
              'worktree /r/.claude/worktrees/y\nHEAD ccc\ndetached\nprunable gitdir file points to non-existent location\n')
    parsed = parse_worktrees(sample)
    check('porcelain parse: three entries', len(parsed), 3)
    check('porcelain parse: branch name', parsed[1].get('branch'), 'claude/x')
    check('porcelain parse: locked', parsed[1].get('locked'), True)
    check('porcelain parse: detached + prunable', (parsed[2].get('detached'), bool(parsed[2].get('prunable'))), (True, True))
    return failures


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--repo', default=str(Path(__file__).resolve().parent.parent),
                        help='the main checkout (default: the checkout this script is in)')
    parser.add_argument('--apply', action='store_true', help='remove the safe worktrees (default: dry run)')
    parser.add_argument('--notify', action='store_true', help='macOS notification with the result')
    parser.add_argument('--min-idle-hours', type=float, default=DEFAULT_MIN_IDLE_HOURS)
    parser.add_argument('--warn-below-gb', type=float, default=DEFAULT_WARN_BELOW_GB)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args(argv)

    if args.self_test:
        failures = self_test()
        for failure in failures:
            print(f'  FAIL {failure}')
        print(f'self-test: {len(failures)} failure(s)' if failures else 'self-test: OK -- every rule refuses on its own')
        return 1 if failures else 0

    repo = Path(args.repo).resolve()
    stamp = time.strftime('%Y-%m-%d %H:%M')
    try:
        before = free_gb(repo)
        rows, notes = survey(repo, min_idle_hours=args.min_idle_hours)
        removed, refused = remove(repo, rows) if args.apply else ([], [])
        after = free_gb(repo)
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'{stamp} could not check: {error}')
        if args.notify:
            notify('Clerkship repo cleanup', f'Could not check the worktrees: {error}')
        return 2
    print(f'{stamp} {"apply" if args.apply else "dry run"} in {repo}')
    for line in report(rows, notes, applied=args.apply, removed=removed, refused=refused,
                       before_gb=before if args.apply else None, after_gb=after, warn_below_gb=args.warn_below_gb):
        print(line)
    low = after < args.warn_below_gb
    if args.notify and (removed or low):
        message = (f'Removed {len(removed)} old copies; ' if removed else '') + f'{after:.0f} GB free.'
        if low:
            message += f' Under {args.warn_below_gb:.0f} GB — ask Claude to look at what is using the disk.'
        notify('Clerkship repo cleanup', message)
    return 1 if low else 0


if __name__ == '__main__':
    sys.exit(main())
