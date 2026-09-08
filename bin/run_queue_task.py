#!/usr/bin/env python3
"""Run exactly one autonomous queue task and stage its draft pull request.

`what_can_i_do_today.py --next-autonomous` decides WHAT an unattended runner may do.
This decides nothing; it does that one thing, once, and proves it.

Why it exists as a script rather than as a prompt
-------------------------------------------------
The first scheduled firing of the autonomous runner (2026-09-08 04:08 UTC) reported
SUCCEEDED and produced nothing at all -- no branch, no pull request -- with the queue
still offering 51 books of work. The fired session had `sources: []`, `mcp_servers: []`
and `allowed_push_branches: []`: the repository was never cloned, so `run`, `verify`,
branch and pull request each had nothing to act on, and even the runbook's degraded
"push the branch anyway" path was unreachable. A session that cannot see the repository
also cannot see that it cannot see the repository, so no better prompt fixes this.

The fix follows from how autonomy is defined. A task qualifies only by carrying a
deterministic `run` and a `verify` that can fail -- which is precisely the property that
makes a model unnecessary to execute it. So the deterministic half moves onto a runner
that starts from a checkout and holds a push credential. This module is that half.

Four guards, each earned by a defect that reached main or nearly did
-------------------------------------------------------------------
  G1  no-op run          The queue offered work and the run changed no file. That is the
                         empty nightly pull request the runbook warned about, and it is a
                         failure, not a quiet success.
  G2  inert measurement  The run succeeded, verify passed, and the queue still reports the
                         same count. The measurement does not track the work, so the task
                         can never retire and the runner would re-open the same pull
                         request every night forever. This is exactly the `isbn-derive`
                         defect (measured by "ASINs that are valid ISBN-10s", a number the
                         work cannot move), caught days before the first firing.
  G3  out-of-scope write A changed path outside the blast radius: the attestation ledger or
                         a clinical registry, Git-LFS media, or anything reached by `..`.
                         `validate_scheduled_workflows.py` forbids the same registry names
                         inside a workflow's `run:` text; this enforces the rule against the
                         diff, which is where it actually matters.
  G4  silent staleness   An automated edit to an attested page leaves the ledger
                         byte-identical, so nothing downstream announces that the faculty
                         attestation went stale. `post_edit_validate.py` catches this only
                         for Edit/Write/MultiEdit and these tasks write through Bash. The
                         pull-request body has to say it, so this computes it.

Exit codes are distinct on purpose: a red run should name which guard tripped without
anyone reading the log.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / "bin"
QUEUE = BIN / "what_can_i_do_today.py"

# The attestation ledger and the clinical registries. A bot advancing a faculty
# signature is a governance failure of a different order from a formatting mistake.
FORBIDDEN_PATHS = (
    "13_Faculty_Resources/reviewed.json",
    "question_bank.json",
    "topic_meta.json",
)
# Git LFS tracks these. Never stage one: without git-lfs installed they read as modified
# when nothing changed, and a committed pointer stub fails the deploy's LFS gate.
LFS_SUFFIXES = (".mp3", ".m4a", ".wav", ".mp4")

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_NO_CHANGE = 3
EXIT_INERT_MEASUREMENT = 4
EXIT_OUT_OF_SCOPE = 5
EXIT_VERIFY_FAILED = 6

COMMIT_NAME = "clerkship-queue-runner"
COMMIT_EMAIL = "clerkship-queue-runner@users.noreply.github.com"


# ------------------------------------------------------------------ queue access
def select_task(env=None):
    """Ask the queue for the one task an unattended runner may do now.

    Selection stays in `what_can_i_do_today.py` rather than being reimplemented here.
    Two rankings that agree today and drift tomorrow would be the worst outcome: the
    runner would execute a task the queue did not offer.

    Returns the parsed row, or None when the queue offers nothing -- which is the normal
    answer on most nights and is a success, not an error.
    """
    proc = subprocess.run(
        [sys.executable, str(QUEUE), "--next-autonomous"],
        cwd=str(ROOT), capture_output=True, text=True, timeout=300,
        env=env if env is not None else os.environ.copy(),
    )
    if proc.returncode != 0:
        raise RuntimeError("queue failed (exit %d): %s"
                           % (proc.returncode, proc.stderr.strip()[:400]))
    body = proc.stdout.strip()
    if not body:
        return None
    return json.loads(body)


def remeasure(key):
    """Re-run one task's own measurement. Raises when it cannot be measured.

    A measurement that fails must never read as zero -- zero means done and would retire
    real work. The caller therefore treats an exception as "cannot prove the work landed",
    not as "the work is finished".
    """
    if str(BIN) not in sys.path:
        sys.path.insert(0, str(BIN))
    import what_can_i_do_today as queue  # noqa: E402  (path set above)

    task = next((t for t in queue.TASKS if t["key"] == key), None)
    if task is None:
        raise LookupError("task %r is no longer in the queue" % key)
    remaining, total = task["measure"]()
    return remaining, total


# ------------------------------------------------------------------ git helpers
def git(args, check=True, repo=ROOT):
    proc = subprocess.run(["git", *args], cwd=str(repo), capture_output=True, text=True)
    if check and proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError("git %s failed (exit %d)%s"
                           % (" ".join(args), proc.returncode,
                              ("\n  " + "\n  ".join(detail.splitlines())) if detail else ""))
    return proc


def changed_paths(porcelain):
    """Parse `git status --porcelain=v1` into repository-relative paths.

    Rename entries carry `old -> new`; both sides count, because staging only the new
    side would leave the delete unstaged and the commit would silently duplicate a file.
    """
    paths = []
    for line in porcelain.splitlines():
        if not line.strip():
            continue
        value = line[3:] if len(line) >= 4 else ""
        paths.extend(part.strip().strip('"') for part in value.split(" -> ") if part.strip())
    return paths


# ------------------------------------------------------------------ guards
def scope_violations(paths):
    """G3. Return a human-readable reason per path that must never be committed here."""
    problems = []
    for path in paths:
        if path.startswith("/") or ".." in Path(path).parts:
            problems.append("%s escapes the repository root" % path)
            continue
        if path in FORBIDDEN_PATHS or Path(path).name in FORBIDDEN_PATHS:
            problems.append("%s is an attestation or clinical registry; a runner may never "
                            "edit one" % path)
            continue
        if path.lower().endswith(LFS_SUFFIXES):
            problems.append("%s is Git-LFS media; a runner may never stage one" % path)
    return problems


def staleness_notices(paths, root=ROOT):
    """G4. Which changed sources are attested pages whose attestation this edit stales.

    Reads the ONE derived listing of what ships (`shipped_pages.json`) rather than any
    single producer. A Case-of-the-Week page, or a resident-only overlay, is just as
    attestable as a hand-registered one, and consulting a single producer is the exact
    defect ADR-002 exists to end -- which is also why this docstring does not name one.

    Degrades to an explicit "could not determine" line rather than to silence. Silence
    here reads as "nothing went stale", which is the failure this guard is for.
    """
    root = Path(root)
    site_build = root / "13_Faculty_Resources" / "_automation" / "site_build"
    if str(site_build) not in sys.path:
        sys.path.insert(0, str(site_build))
    try:
        import shipped_pages  # noqa: E402  (path set above)
        pages = shipped_pages.load_shipped_pages(root)["pages"]
        ledger = json.loads((root / "13_Faculty_Resources" / "reviewed.json")
                            .read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 -- any failure must be reported, never hidden
        return ["could not determine attestation impact (%s: %s) -- check by hand before "
                "merging" % (type(exc).__name__, exc)]

    by_source = {page.get("source"): page for page in pages if page.get("source")}
    notices = []
    for path in sorted(set(paths)):
        page = by_source.get(path)
        if page is None:
            continue
        row = ledger.get(page["slug"])
        status = row.get("status") if isinstance(row, dict) else None
        if status in ("reviewed", "attested"):
            notices.append(
                "`%s` ships as `%s`, currently **%s** (%s, %s). This edit makes that "
                "attestation stale: faculty must re-attest in the console, or the ledger "
                "row must move to pending. The ledger is byte-identical in this diff -- "
                "nothing else will say so."
                % (path, page["slug"], status,
                   (row or {}).get("by", "unknown"), (row or {}).get("at", "undated")))
    return notices


# ------------------------------------------------------------------ rendering
def branch_name(key, today=None):
    return "automation/queue-%s-%s" % (key, (today or date.today()).isoformat())


def commit_message(row, before, after):
    return (
        "chore(queue): %s\n"
        "\n"
        "Autonomous queue task `%s`, executed by the nightly runner.\n"
        "\n"
        "  run    : %s\n"
        "  verify : %s\n"
        "\n"
        "%s remaining: %s -> %s\n"
        % (row["title"], row["key"], row["run"], row["verify"],
           row["unit"], before, after)
    )


def render_pr_body(row, before, after, paths, notices):
    retired = "retired itself (nothing left)" if after == 0 else "%s remaining" % after
    lines = [
        "Opened by the nightly autonomous queue runner "
        "(`.github/workflows/maintenance-queue-runner.yml`).",
        "",
        "## What ran",
        "",
        "| | |",
        "| --- | --- |",
        "| task | `%s` — %s |" % (row["key"], row["title"]),
        "| run | `%s` |" % row["run"],
        "| verify | `%s` (passed) |" % row["verify"],
        "| measurement | %s: %s → %s, %s |" % (row["unit"], before, after, retired),
        "",
        "## Why this task is safe to run unattended",
        "",
        row["why"],
        "",
        "Autonomy here is derived, never declared: a task is eligible only because it "
        "carries both a deterministic `run` and a `verify` that can fail. Curation and "
        "attestation carry neither and are therefore excluded by construction.",
        "",
        "## Files changed",
        "",
    ]
    lines += ["- `%s`" % path for path in sorted(set(paths))]
    lines += [""]
    if notices:
        lines += ["## ⚠️ Attestation went stale", ""]
        lines += ["- %s" % notice for notice in notices]
        lines += [""]
    lines += [
        "## What a reviewer still has to do",
        "",
        "- Read the diff. The runner proves the change is *self-consistent*; it cannot "
        "prove it is *right*.",
        "- This pull request was opened with `GITHUB_TOKEN`, so GitHub does not start "
        "`ci.yml` on it. The runner ran the repository's own validators and the root node "
        "suite before pushing — the log is the evidence — but a human push (or close and "
        "reopen) is what gets a CI run on the pull request itself.",
        "- The runner never marks a pull request ready, never merges, and never edits the "
        "attestation ledger.",
        "",
    ]
    return "\n".join(lines)


def write_output(path, pairs):
    """Append `key=value` lines for GitHub Actions. Multi-line values are not used."""
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in pairs:
            handle.write("%s=%s\n" % (key, value))


# ------------------------------------------------------------------ main
def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--out-dir", help="where to write plan.json and pr-body.md")
    parser.add_argument("--dry-run", action="store_true",
                        help="report the selected task and change nothing")
    parser.add_argument("--no-commit", action="store_true",
                        help="run and verify, leave the tree dirty (local use)")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT"),
                        help="file to append Actions outputs to")
    args = parser.parse_args(argv)

    out_dir = Path(args.out_dir).resolve() if args.out_dir else None
    if out_dir and (out_dir == ROOT or ROOT in out_dir.parents):
        # Evidence must not land in the commit. An out-dir inside the checkout would be
        # picked up by the same `git status` that decides what to stage, so the plan and
        # the pull-request body would ride along in the diff they describe.
        print("queue-runner: --out-dir must sit outside the repository (%s)" % out_dir,
              file=sys.stderr)
        return EXIT_USAGE
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)

    # Before anything is written: an already-dirty tree means someone else's edit would
    # ride along in the commit, and the run/verify result could not be attributed.
    dirty = changed_paths(git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout)
    if dirty:
        print("queue-runner: refusing to run with a dirty tree: %s" % ", ".join(dirty[:8]),
              file=sys.stderr)
        return EXIT_USAGE

    try:
        row = select_task()
    except (RuntimeError, ValueError) as exc:
        print("queue-runner: %s" % exc, file=sys.stderr)
        return EXIT_USAGE

    if row is None:
        # The normal answer on most nights. The queue retires its own work, so a runner
        # that finds nothing has succeeded.
        print("queue-runner: nothing autonomous to do")
        write_output(args.github_output, [("task", ""), ("committed", "false")])
        return EXIT_OK

    key = row["key"]
    before = row["remaining"]
    print("queue-runner: selected %s — %s (%s %s remaining)"
          % (key, row["title"], before, row["unit"]))
    if out_dir:
        (out_dir / "plan.json").write_text(json.dumps(row, indent=2) + "\n", encoding="utf-8")

    if args.dry_run:
        print("queue-runner: --dry-run, nothing executed")
        write_output(args.github_output, [("task", key), ("committed", "false")])
        return EXIT_OK

    for label, command, failure in (
        ("run", row["run"], EXIT_USAGE),
        ("verify", row["verify"], EXIT_VERIFY_FAILED),
    ):
        print("queue-runner: %s -> %s" % (label, command))
        proc = subprocess.run(command, cwd=str(ROOT), shell=True, text=True)
        if proc.returncode != 0:
            print("queue-runner: %s failed (exit %d)" % (label, proc.returncode),
                  file=sys.stderr)
            return failure

    paths = changed_paths(git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout)

    # G1 -- the queue offered work and the run changed nothing.
    if not paths:
        print("queue-runner: %s offered %s %s of work and the run changed no file. That is "
              "an empty pull request, so it fails here instead."
              % (key, before, row["unit"]), file=sys.stderr)
        return EXIT_NO_CHANGE

    # G3 -- before anything is staged.
    problems = scope_violations(paths)
    if problems:
        for problem in problems:
            print("queue-runner: out of scope: %s" % problem, file=sys.stderr)
        return EXIT_OUT_OF_SCOPE

    # G2 -- the measurement has to track the work, or the task can never retire.
    try:
        after, _total = remeasure(key)
    except Exception as exc:  # noqa: BLE001 -- unmeasurable is not "done"
        print("queue-runner: cannot re-measure %s after the run (%s: %s), so the work "
              "cannot be proven to have landed" % (key, type(exc).__name__, exc),
              file=sys.stderr)
        return EXIT_INERT_MEASUREMENT
    if after >= before:
        print("queue-runner: %s still reports %s of %s %s after a successful run and "
              "verify. The measurement does not track the work, so this task can never "
              "retire and the runner would re-open this pull request every night. Fix the "
              "measurement before the task." % (key, after, before, row["unit"]),
              file=sys.stderr)
        return EXIT_INERT_MEASUREMENT
    print("queue-runner: %s %s -> %s" % (row["unit"], before, after))

    notices = staleness_notices(paths)
    body = render_pr_body(row, before, after, paths, notices)
    if out_dir:
        (out_dir / "pr-body.md").write_text(body, encoding="utf-8")

    if args.no_commit:
        print("queue-runner: --no-commit, leaving %d changed path(s) unstaged" % len(paths))
        write_output(args.github_output, [("task", key), ("committed", "false")])
        return EXIT_OK

    branch = branch_name(key)
    git(["switch", "-c", branch])
    # Stage BY NAME. `git add -A` would sweep in the Git-LFS phantoms that appear whenever
    # git-lfs is not installed on the runner.
    git(["add", "--", *sorted(set(paths))])
    git(["-c", "user.name=%s" % COMMIT_NAME, "-c", "user.email=%s" % COMMIT_EMAIL,
         "commit", "-m", commit_message(row, before, after)])

    print("queue-runner: committed %d path(s) on %s" % (len(paths), branch))
    write_output(args.github_output, [
        ("task", key),
        ("branch", branch),
        ("title", "chore(queue): %s" % row["title"]),
        ("body_file", str((out_dir / "pr-body.md") if out_dir else "")),
        ("committed", "true"),
    ])
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
