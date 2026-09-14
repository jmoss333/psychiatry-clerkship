#!/usr/bin/env python3
"""Answer the three questions that decide what to do about a red or stale PR.

WHY THIS EXISTS: on 2026-09-14 a draft PR was red, the diagnosis reproduced exactly, the
fix was written, verified against the full gate, and pushed — and then `main` turned out to
have carried that same fix for three days. The PR's copy of the failing file was byte
identical to the commit *before* main fixed it. An hour went into repairing a branch whose
only correct disposition was `gh pr close`.

The same session then spent a second stretch hunting a "CI false green": GitHub Actions
logged a pass for a test that failed locally and in the Netlify deploy preview on the same
PR. There was no false green. `actions/checkout` on a `pull_request` event checks out
`refs/pull/N/merge`; Netlify previews build the BRANCH HEAD. On a four-day-stale branch
those are different trees, and here they differed on exactly the failing file. Both signals
were honest reports about different code.

Neither failure is a concurrency problem, so `tools/coordination/collision_report.py` cannot
see either one: it answers "is someone else editing this", and these were "is this already
done" and "am I even looking at the tree that produced the signal". This tool answers those.

    python3 bin/pr_preflight.py 626              # text report
    python3 bin/pr_preflight.py 626 --format json
    python3 bin/pr_preflight.py 626 --no-fetch   # skip `git fetch`, use local refs
    python3 bin/pr_preflight.py --self-test      # synthetic repos, no network

ADVISORY, like the collision sentinel: it reports, it never edits. Exit 0 when it produced a
report (whatever the verdict), 2 on usage or environment failure — so a wrapper can tell
"the PR needs attention" (read the verdict) from "the tool could not run" (exit code).

Verdicts, worst first:
  SUPERSEDED   every file the PR changes already matches origin/main. Close it.
  DIVERGENT    the merge ref and the branch head differ in a way that can change THIS PR's
               signal — a test file, or a file the PR itself touches — so CI and the deploy
               previews may legitimately disagree. Usually `gh pr update-branch <n>`.
  STALE        behind main, but nothing in the gap bears on this PR's signal.
  CURRENT      nothing to flag.

CALIBRATION, and why DIVERGENT is narrow. The first cut fired DIVERGENT on 9 of 9 open PRs,
because in this repo main moves fast enough that every branch is behind by something and any
gap at all makes the two trees differ. A verdict that fires on everything carries no
information. What actually mattered in the case this was built from was not that the trees
differed, but WHERE: in `tests/derive-isbn13.test.mjs`, whose two versions were the whole
disagreement. So DIVERGENT now requires the gap to touch a test file or one of the PR's own
files; everything else is main moving ahead, which is STALE.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

VERDICT_RANK = {"CURRENT": 0, "STALE": 1, "DIVERGENT": 2, "SUPERSEDED": 3}
TEST_PATH = re.compile(r"(^|/)(tests?|__tests__)/|\.(test|spec)\.[cm]?[jt]s$|(^|/)test_[^/]+\.py$")
SAFE_SHA = re.compile(r"\A[0-9a-fA-F]{7,64}\Z")


class PreflightError(RuntimeError):
    """Something about the environment stopped the report being produced."""


def git(args, cwd, check=True):
    proc = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise PreflightError("git %s failed: %s" % (" ".join(args), proc.stderr.strip()))
    return proc.stdout.strip()


def blob_of(ref, path, cwd):
    """The blob OID of `path` at `ref`, or None when the path does not exist there."""
    out = subprocess.run(["git", "rev-parse", "%s:%s" % (ref, path)],
                         cwd=str(cwd), capture_output=True, text=True)
    return out.stdout.strip() if out.returncode == 0 else None


def merge_tree(base, head, cwd):
    """The tree `refs/pull/N/merge` would have, without checking anything out.

    Returns None when the merge conflicts — which is itself worth reporting, because a
    conflicting PR has no merge ref for CI to test.
    """
    proc = subprocess.run(["git", "merge-tree", "--write-tree", base, head],
                          cwd=str(cwd), capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    return proc.stdout.strip().splitlines()[0].strip()


def changed_files(cwd, a, b):
    out = git(["diff", "--name-only", a, b], cwd)
    return [line for line in out.splitlines() if line]


def analyse(pr_files, head, base, cwd):
    """Compare a PR head against a base. Pure git; no network, no `gh`."""
    merge_base = git(["merge-base", base, head], cwd)
    behind = int(git(["rev-list", "--count", "%s..%s" % (head, base)], cwd) or 0)

    already_on_base, still_needed = [], []
    for path in pr_files:
        if blob_of(head, path, cwd) == blob_of(base, path, cwd):
            already_on_base.append(path)
        else:
            still_needed.append(path)

    tree = merge_tree(base, head, cwd)
    conflicted = tree is None
    # Files where the tree CI tests (the merge) differs from the tree the deploy previews
    # build (the branch head). Every one is a place the two signals may disagree.
    divergent = [] if conflicted else changed_files(cwd, head, tree)

    divergent_tests = [p for p in divergent if TEST_PATH.search(p)]
    # A gap only threatens THIS PR's signal where it lands on a test, or on a file the PR
    # itself changes. Anything else is main moving ahead underneath an unrelated branch.
    divergent_pr_files = sorted(set(divergent) & set(pr_files))
    material = divergent_tests + [p for p in divergent_pr_files if p not in divergent_tests]

    if pr_files and not still_needed:
        verdict = "SUPERSEDED"
    elif conflicted:
        # No merge ref exists, so CI has nothing to test; that is divergence at its limit.
        verdict = "DIVERGENT"
    elif material:
        verdict = "DIVERGENT"
    elif behind or divergent:
        verdict = "STALE"
    else:
        verdict = "CURRENT"

    return {
        "verdict": verdict,
        "mergeBase": merge_base,
        "commitsBehindBase": behind,
        "mergeConflicts": conflicted,
        "prFiles": list(pr_files),
        "alreadyOnBase": already_on_base,
        "stillNeeded": still_needed,
        "divergentPaths": divergent,
        "divergentTestPaths": divergent_tests,
        "divergentPrFiles": divergent_pr_files,
        "materialDivergence": material,
    }


def pr_metadata(number, cwd):
    if not re.fullmatch(r"[1-9][0-9]{0,9}", str(number)):
        raise PreflightError("PR number must be a positive integer")
    proc = subprocess.run(
        ["gh", "pr", "view", str(number), "--json",
         "number,state,isDraft,headRefName,headRefOid,baseRefName,files"],
        cwd=str(cwd), capture_output=True, text=True)
    if proc.returncode != 0:
        raise PreflightError(
            "gh pr view %s failed (gh is not on the Cowork VM's PATH — run this on the "
            "machine that has an authenticated gh): %s" % (number, proc.stderr.strip()))
    data = json.loads(proc.stdout)
    if not SAFE_SHA.fullmatch(data.get("headRefOid", "")):
        raise PreflightError("gh returned an implausible head oid")
    return data


def render(report, out):
    v = report["verdict"]
    print("pr preflight: #%s %s" % (report["number"], v), file=out)
    if report.get("mergeConflicts"):
        print("  MERGE CONFLICT — there is no merge ref for CI to test", file=out)
    if v == "SUPERSEDED":
        print("  every file this PR changes already matches %s. Close it." % report["base"], file=out)
    if report["commitsBehindBase"]:
        print("  %d commit(s) behind %s" % (report["commitsBehindBase"], report["base"]), file=out)
    for path in report["alreadyOnBase"]:
        print("  already on %s   %s" % (report["base"], path), file=out)
    material = report.get("materialDivergence") or []
    if material:
        print("  the merge ref and the branch head differ where it can change this PR's",
              file=out)
        print("  signal — CI and the deploy previews may disagree. Usually "
              "`gh pr update-branch %s`:" % report["number"], file=out)
        tests = set(report["divergentTestPaths"])
        for path in material[:12]:
            print("    %s  %s" % ("TEST" if path in tests else "OWN ", path), file=out)
        if len(material) > 12:
            print("    ... and %d more" % (len(material) - 12), file=out)
    other = len(report["divergentPaths"]) - len(material)
    if other > 0:
        print("  %d other file(s) differ between the two trees — main moving ahead, not a"
              % other, file=out)
        print("  signal risk for this PR", file=out)


# --------------------------------------------------------------------------- self-test

def _repo(root):
    git(["init", "-q", "-b", "main", "."], root)
    git(["config", "user.email", "t@example.invalid"], root)
    git(["config", "user.name", "t"], root)
    return root


def _commit(root, message):
    git(["add", "-A"], root)
    git(["commit", "-q", "-m", message], root)
    return git(["rev-parse", "HEAD"], root)


def self_test():
    failures, total = [], []

    def check(name, got, want):
        total.append(name)
        if got != want:
            failures.append("%s: got %r, want %r" % (name, got, want))

    tmp = Path(tempfile.mkdtemp(prefix="pr-preflight-"))
    try:
        # A base with two files; a branch that edits one; main then edits the OTHER, which
        # is the shape that makes the merge ref and the branch head disagree.
        (tmp / "r").mkdir(parents=True, exist_ok=True)
        root = _repo(tmp / "r")
        (root / "content.md").write_text("one\n")
        (root / "tests").mkdir()
        (root / "tests" / "a.test.mjs").write_text("old\n")
        _commit(root, "base")
        git(["checkout", "-q", "-b", "feature"], root)
        (root / "content.md").write_text("two\n")
        head = _commit(root, "feature edit")
        git(["checkout", "-q", "main"], root)
        (root / "tests" / "a.test.mjs").write_text("fixed on main\n")
        _commit(root, "main fixes the test")

        r = analyse(["content.md"], head, "main", root)
        check("divergent verdict", r["verdict"], "DIVERGENT")
        check("behind by one", r["commitsBehindBase"], 1)
        check("test file flagged", r["divergentTestPaths"], ["tests/a.test.mjs"])
        check("still needed", r["stillNeeded"], ["content.md"])

        # Superseded: main independently lands byte-identical content.
        git(["checkout", "-q", "main"], root)
        (root / "content.md").write_text("two\n")
        _commit(root, "main lands the same change")
        r = analyse(["content.md"], head, "main", root)
        check("superseded verdict", r["verdict"], "SUPERSEDED")
        check("superseded listing", r["alreadyOnBase"], ["content.md"])
        check("nothing still needed", r["stillNeeded"], [])

        # Current: a branch on the tip of main, changing a file main has not touched.
        git(["checkout", "-q", "-b", "fresh"], root)
        (root / "new.md").write_text("new\n")
        fresh = _commit(root, "fresh work")
        r = analyse(["new.md"], fresh, "main", root)
        check("current verdict", r["verdict"], "CURRENT")
        check("current is not behind", r["commitsBehindBase"], 0)

        # A PR that changes nothing is not "superseded" — that verdict must need evidence.
        r = analyse([], fresh, "main", root)
        check("empty file list is not superseded", r["verdict"] == "SUPERSEDED", False)

        # THE CALIBRATION. A branch that is merely behind, where the gap touches neither a
        # test nor any file the PR changes, is STALE. Firing DIVERGENT here is what made the
        # first cut fire on 9 of 9 open PRs and mean nothing.
        git(["checkout", "-q", "main"], root)
        (root / "unrelated.md").write_text("main moved on\n")
        _commit(root, "unrelated work on main")
        git(["checkout", "-q", "-b", "quiet", "HEAD~1"], root)
        (root / "mine.md").write_text("my change\n")
        quiet = _commit(root, "my unrelated change")
        r = analyse(["mine.md"], quiet, "main", root)
        check("behind but immaterial is STALE", r["verdict"], "STALE")
        check("the gap is still reported", r["divergentPaths"], ["unrelated.md"])
        check("but nothing material", r["materialDivergence"], [])

        # ... and it becomes DIVERGENT the moment the gap lands on a file the PR owns,
        # even when the merge is clean (both sides edited different lines of it).
        git(["checkout", "-q", "main"], root)
        (root / "shared.md").write_text("head\n" + "\n".join(str(i) for i in range(20)) + "\ntail\n")
        _commit(root, "a file both sides will touch")
        git(["checkout", "-q", "-b", "owns", "main"], root)
        body = (root / "shared.md").read_text()
        (root / "shared.md").write_text(body.replace("head\n", "PR EDIT\n", 1))
        owns = _commit(root, "the PR edits the top")
        git(["checkout", "-q", "main"], root)
        body = (root / "shared.md").read_text()
        (root / "shared.md").write_text(body.replace("\ntail\n", "\nMAIN EDIT\n", 1))
        _commit(root, "main edits the bottom of the same file")
        r = analyse(["shared.md"], owns, "main", root)
        check("clean gap on the PR's own file is DIVERGENT", r["verdict"], "DIVERGENT")
        check("and names it", r["divergentPrFiles"], ["shared.md"])
        check("no conflict in that case", r["mergeConflicts"], False)

        # A conflicting merge is DIVERGENT too: CI has no merge ref to test at all.
        git(["checkout", "-q", "-b", "clash", "main~1"], root)
        (root / "shared.md").write_text("totally rewritten\n")
        clash = _commit(root, "the PR rewrites the file")
        r = analyse(["shared.md"], clash, "main", root)
        check("a conflicting merge is DIVERGENT", r["verdict"], "DIVERGENT")
        check("and says so", r["mergeConflicts"], True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        for line in failures:
            print("  FAIL %s" % line, file=sys.stderr)
        print("self-test: %d/%d failed" % (len(failures), len(total)), file=sys.stderr)
        return 1
    print("self-test: %d/%d passed" % (len(total), len(total)))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("number", nargs="?", help="pull request number")
    parser.add_argument("--repo-root", default=None)
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--no-fetch", action="store_true",
                        help="use the refs already present; do not contact the remote")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()
    if not args.number:
        parser.error("a PR number is required (or --self-test)")

    root = Path(args.repo_root or Path(__file__).resolve().parents[1])
    if not (root / ".git").exists():
        raise PreflightError("%s is not a git repository" % root)

    meta = pr_metadata(args.number, root)
    if not args.no_fetch:
        git(["fetch", "--quiet", "origin"], root)
        subprocess.run(["git", "fetch", "--quiet", "origin",
                        "pull/%s/head" % args.number], cwd=str(root), capture_output=True)

    base = "origin/%s" % meta["baseRefName"]
    report = analyse([f["path"] for f in meta["files"]], meta["headRefOid"], base, root)
    report.update({"number": meta["number"], "base": base, "state": meta["state"],
                   "isDraft": meta["isDraft"], "headRefName": meta["headRefName"],
                   "schemaVersion": 1})

    if args.format == "json":
        json.dump(report, sys.stdout, indent=1, sort_keys=True)
        sys.stdout.write("\n")
    else:
        render(report, sys.stdout)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PreflightError as exc:
        print("pr preflight: %s" % exc, file=sys.stderr)
        raise SystemExit(2)
