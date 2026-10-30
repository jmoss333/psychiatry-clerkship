#!/usr/bin/env python3
"""Approved-head guard: an approval receipt (G1) and a post-approval push tripwire (G2).

Why this exists. Every session here pushes as the same account, and the `main` ruleset does
not dismiss an approval when a new commit lands. On 2026-10-28 two PRs that Josh had approved
(#1115, #1119) received new content from their authoring sessions after the approval, prompted
by a Codex review. Nothing on GitHub showed it; the merging agent caught it by hand.

The two halves:

  receipt  (G1, run by the merging agent when Josh approves a PR)
           Computes a fingerprint of the PR's own change against `main`, posts a receipt
           comment carrying the head SHA, the merge base and that fingerprint, THEN adds the
           `josh-approved` label. Receipt first, label second, so a `labeled` event never sees a
           label without its receipt.

  check    (G2, run by .github/workflows/approved-head-guard.yml on every PR push)
           No `josh-approved` label            -> pass.
           Label + fingerprint matches receipt -> pass (a plain re-sync from `main` included).
           Label + fingerprint differs, or the label has no receipt
                                               -> remove the label, return the PR to draft,
                                                  comment "head changed after approval —
                                                  re-approval needed", fail.

The fingerprint. `git diff -U0 <merge-base> <head>`, normalised: per file the path, status and
new mode; then only the `+`/`-` lines of each hunk, with the hunk line numbers and the
`index <old>..<new>` blob line dropped; a binary file contributes its new blob id. With zero
context lines and no line numbers, merging `main` into the branch leaves the fingerprint alone
when `main` touched other files or other lines of the same file; it changes when the PR's own
added/removed lines change (including a conflict resolution that rewrites them). It is
deliberately conservative: if `main` absorbs part of the PR, the PR's diff shrinks and the guard
trips. A false trip costs one re-approval; a missed post-approval push is the incident above.

Limits (documented, not hidden): every agent can run `receipt` as the same account, so this is a
tripwire against an honest session pushing after approval, not a control against a session that
means to re-bless its own push. That needs the separate-identity cutover (T4) and CODEOWNERS.

Exit codes: 0 pass; 1 tripped / refused; 2 could not check (fails closed, changes nothing).
Stdlib only; talks to GitHub through the `gh` CLI. No network in `fingerprint`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Callable, Iterable, Optional, Sequence

LABEL = "josh-approved"
STATUS_CONTEXT = "approved-head-guard"
FINGERPRINT_VERSION = "approved-head-fingerprint v1"
DEFAULT_RECEIPT_AUTHORS = ("jmoss333",)
TRIP_SENTENCE = "head changed after approval — re-approval needed"
TRIP_MARKER = "<!-- approved-head-guard: tripped -->"
RECEIPT_RE = re.compile(
    r"<!-- approved-head-receipt v1 head=(?P<head>[0-9a-f]{40}) "
    r"base=(?P<base>[0-9a-f]{40}) fingerprint=(?P<fingerprint>[0-9a-f]{64}) -->"
)
SAFE_REPO = re.compile(r"[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}")
SAFE_REF = re.compile(r"[A-Za-z0-9._/-]{1,200}")
SAFE_SHA = re.compile(r"[0-9a-f]{40}")


class GuardError(RuntimeError):
    """The guard could not obtain a trustworthy answer (exit 2, no side effects)."""


# --------------------------------------------------------------------------- git + fingerprint

def git(repo: str, *args: str) -> bytes:
    proc = subprocess.run(
        ["git", "-C", repo, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise GuardError(f"git {' '.join(args[:3])} failed: {proc.stderr.decode(errors='replace').strip()}")
    return proc.stdout


def _raw_entries(repo: str, base: str, head: str) -> list[tuple[str, str, str, str]]:
    """(status, new_mode, new_blob, path) for every changed path, in git's diff order."""
    out = git(repo, "diff", "--raw", "-z", "--no-renames", "--no-abbrev", base, head)
    fields = out.split(b"\0")
    entries = []
    i = 0
    while i < len(fields) and fields[i]:
        meta = fields[i].decode()
        path = fields[i + 1].decode("utf-8", errors="surrogateescape")
        i += 2
        # ":<old_mode> <new_mode> <old_sha> <new_sha> <status>"
        _old_mode, new_mode, _old_sha, new_sha, status = meta.lstrip(":").split(" ")
        entries.append((status, new_mode, new_sha, path))
    return entries


def _split_blocks(patch: bytes) -> list[list[bytes]]:
    blocks: list[list[bytes]] = []
    for line in patch.split(b"\n"):
        if line.startswith(b"diff --git "):
            blocks.append([])
            continue
        if blocks:
            blocks[-1].append(line)
    return blocks


def normalised_diff(repo: str, base: str, head: str) -> bytes:
    """The PR's own change, independent of where `main` currently is."""
    entries = _raw_entries(repo, base, head)
    patch = git(
        repo, "-c", "core.quotePath=false", "diff", "-U0", "--no-color", "--no-ext-diff",
        "--no-textconv", "--no-renames", "--full-index", base, head,
    )
    blocks = _split_blocks(patch)
    if len(blocks) != len(entries):
        raise GuardError(f"diff has {len(blocks)} file blocks but {len(entries)} raw entries")
    out: list[bytes] = [FINGERPRINT_VERSION.encode()]
    for (status, new_mode, new_sha, path), block in zip(entries, blocks):
        out.append(b"file " + path.encode("utf-8", errors="surrogateescape")
                   + f" status={status} mode={new_mode}".encode())
        in_header = True
        binary = False
        for line in block:
            if in_header:
                if line.startswith(b"@@"):
                    in_header = False
                    out.append(b"@@")
                elif line.startswith((b"Binary files ", b"GIT binary patch")):
                    binary = True
                continue
            if line.startswith(b"@@"):
                out.append(b"@@")
            elif line[:1] in (b"+", b"-", b"\\"):
                out.append(line)
        if binary:
            out.append(f"binary {new_sha}".encode())
    return b"\n".join(out) + b"\n"


def merge_base(repo: str, base: str, head: str) -> str:
    return git(repo, "merge-base", base, head).decode().strip()


def fingerprint(repo: str, base_ref: str, head_ref: str) -> tuple[str, str]:
    """Return (merge_base_sha, fingerprint_hex) of head's change against base_ref."""
    mb = merge_base(repo, base_ref, head_ref)
    head = git(repo, "rev-parse", "--verify", f"{head_ref}^{{commit}}").decode().strip()
    return mb, hashlib.sha256(normalised_diff(repo, mb, head)).hexdigest()


# --------------------------------------------------------------------------- receipts + decision

@dataclass(frozen=True)
class Receipt:
    head: str
    base: str
    fingerprint: str
    comment_id: int = 0
    author: str = ""


def receipt_body(head: str, base: str, fp: str, approved_by: str, note: str = "") -> str:
    lines = [
        f"<!-- approved-head-receipt v1 head={head} base={base} fingerprint={fp} -->",
        f"**Approval receipt** — {approved_by} approved head `{head[:12]}`.",
        "",
        f"- Label: `{LABEL}`",
        f"- Head SHA: `{head}`",
        f"- Merge base with `main`: `{base}`",
        f"- Diff fingerprint (`{FINGERPRINT_VERSION}`): `{fp}`",
        "",
        "The approved-head guard compares every later push against this fingerprint. Merging "
        "`main` in is fine; changing this PR's own lines removes the label and returns the PR "
        "to draft. After approval the owning session does not push content here — fixes go in a "
        "follow-up PR, or it comments and asks for re-approval.",
    ]
    if note:
        lines += ["", note]
    return "\n".join(lines)


def latest_receipt(comments: Iterable[dict], authors: Sequence[str]) -> Optional[Receipt]:
    """Newest receipt comment written by an allowed author (comment order = creation order)."""
    found: Optional[Receipt] = None
    allowed = {a.lower() for a in authors}
    for c in comments:
        login = ((c.get("user") or {}).get("login") or "").lower()
        if login not in allowed:
            continue
        m = RECEIPT_RE.search(c.get("body") or "")
        if m:
            found = Receipt(m["head"], m["base"], m["fingerprint"], int(c.get("id") or 0), login)
    return found


@dataclass
class Decision:
    ok: bool
    reason: str
    actions: list = field(default_factory=list)  # subset of ["unlabel", "draft", "comment"]


def decide(labels: Iterable[str], receipt: Optional[Receipt], current_fp: str,
           head_sha: str) -> Decision:
    if LABEL not in set(labels):
        return Decision(True, f"no `{LABEL}` label — nothing to guard")
    if receipt is None:
        return Decision(False, f"`{LABEL}` is present but no approval receipt was found",
                        ["unlabel", "draft", "comment"])
    if receipt.fingerprint == current_fp:
        if receipt.head == head_sha:
            return Decision(True, "head is the approved head")
        return Decision(True, "head moved but the PR's own diff is unchanged (re-sync only)")
    return Decision(False, "the PR's own diff no longer matches the approved fingerprint",
                    ["unlabel", "draft", "comment"])


def trip_comment(decision: Decision, receipt: Optional[Receipt], head_sha: str,
                 current_fp: str) -> str:
    lines = [
        TRIP_MARKER,
        f"**{TRIP_SENTENCE[0].upper()}{TRIP_SENTENCE[1:]}.**",
        "",
        f"The approved-head guard found that {decision.reason}. It removed `{LABEL}` and "
        "returned this PR to draft. Nothing was reverted.",
        "",
        f"- Current head: `{head_sha}`",
        f"- Current fingerprint: `{current_fp}`",
    ]
    if receipt is not None:
        lines += [f"- Approved head: `{receipt.head}`",
                  f"- Approved fingerprint: `{receipt.fingerprint}`"]
    lines += [
        "",
        "To proceed: Josh re-reviews the current head; the merging agent then re-runs "
        "`approved_head_guard.py receipt`. Or move the post-approval change to a follow-up PR "
        "and restore this branch to the approved diff.",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------- GitHub (via gh)

Runner = Callable[[Sequence[str], Optional[str]], str]


def gh_runner(args: Sequence[str], stdin: Optional[str] = None) -> str:
    proc = subprocess.run(["gh", *args], input=stdin, text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        raise GuardError(f"gh {' '.join(args[:2])} failed: {proc.stderr.strip()}")
    return proc.stdout


class GitHub:
    def __init__(self, repo: str, run: Runner = gh_runner):
        if not SAFE_REPO.fullmatch(repo or ""):
            raise GuardError("repository is invalid")
        self.repo = repo
        self.run = run

    def pull(self, number: int) -> dict:
        return json.loads(self.run(["api", f"repos/{self.repo}/pulls/{number}"], None))

    def comments(self, number: int) -> list:
        out = self.run(["api", "--paginate", "--slurp",
                        f"repos/{self.repo}/issues/{number}/comments?per_page=100"], None)
        pages = json.loads(out or "[]")
        return [c for page in pages for c in (page if isinstance(page, list) else [page])]

    def comment(self, number: int, body: str) -> None:
        self.run(["api", "-X", "POST", f"repos/{self.repo}/issues/{number}/comments",
                  "--input", "-"], json.dumps({"body": body}))

    def add_label(self, number: int) -> None:
        self.run(["api", "-X", "POST", f"repos/{self.repo}/issues/{number}/labels",
                  "--input", "-"], json.dumps({"labels": [LABEL]}))

    def remove_label(self, number: int) -> None:
        try:
            self.run(["api", "-X", "DELETE",
                      f"repos/{self.repo}/issues/{number}/labels/{LABEL}"], None)
        except GuardError as exc:  # already gone is fine
            if "404" not in str(exc) and "Not Found" not in str(exc):
                raise

    def to_draft(self, number: int) -> None:
        self.run(["pr", "ready", str(number), "--undo", "-R", self.repo], None)

    def status(self, sha: str, ok: bool, description: str) -> None:
        payload = {"state": "success" if ok else "failure", "context": STATUS_CONTEXT,
                   "description": description[:139]}
        self.run(["api", "-X", "POST", f"repos/{self.repo}/statuses/{sha}", "--input", "-"],
                 json.dumps(payload))


def _fetch_pr(repo_dir: str, number: int, base_ref: str) -> tuple[str, str]:
    """Fetch PR head + base objects for analysis only. Returns local (base, head) refs."""
    if not SAFE_REF.fullmatch(base_ref) or ".." in base_ref:
        raise GuardError("base ref is invalid")
    head_local = f"refs/approved-head-guard/pr-{number}"
    base_local = "refs/approved-head-guard/base"
    git(repo_dir, "fetch", "--no-tags", "--quiet", "origin",
        f"+refs/pull/{number}/head:{head_local}", f"+refs/heads/{base_ref}:{base_local}")
    return base_local, head_local


def _labels(pull: dict) -> list:
    return [lab.get("name", "") for lab in pull.get("labels") or []]


# --------------------------------------------------------------------------- commands

def cmd_fingerprint(args) -> int:
    mb, fp = fingerprint(args.repo_dir, args.base, args.head)
    print(json.dumps({"merge_base": mb, "fingerprint": fp}))
    return 0


def cmd_receipt(args, gh: Optional[GitHub] = None) -> int:
    gh = gh or GitHub(args.repo)
    pull = gh.pull(args.pr)
    if pull.get("state") != "open":
        print(f"PR #{args.pr} is not open; no receipt written.", file=sys.stderr)
        return 1
    head = (pull.get("head") or {}).get("sha", "")
    if not SAFE_SHA.fullmatch(head):
        raise GuardError("PR head SHA is missing")
    if args.expect_head and not head.startswith(args.expect_head.lower()):
        print(f"Refusing: PR head is {head}, but Josh approved {args.expect_head}. "
              "Ask for re-approval of the current head.", file=sys.stderr)
        return 1
    base_ref = (pull.get("base") or {}).get("ref") or args.base_ref
    if args.local_refs:
        base_local, head_local = args.local_refs
    else:
        base_local, head_local = _fetch_pr(args.repo_dir, args.pr, base_ref)
    if git(args.repo_dir, "rev-parse", f"{head_local}^{{commit}}").decode().strip() != head:
        raise GuardError("fetched head does not match the PR head; retry")
    mb, fp = fingerprint(args.repo_dir, base_local, head_local)
    body = receipt_body(head, mb, fp, args.approved_by, args.note or "")
    if args.dry_run:
        print(body)
        return 0
    gh.comment(args.pr, body)     # receipt first …
    gh.add_label(args.pr)         # … label second
    print(json.dumps({"pr": args.pr, "head": head, "merge_base": mb, "fingerprint": fp,
                      "label": LABEL}))
    return 0


def cmd_check(args, gh: Optional[GitHub] = None) -> int:
    gh = gh or GitHub(args.repo)
    pull = gh.pull(args.pr)
    head = (pull.get("head") or {}).get("sha", "")
    if not SAFE_SHA.fullmatch(head):
        raise GuardError("PR head SHA is missing")
    labels = _labels(pull)
    if pull.get("state") != "open" or LABEL not in labels:
        decision = Decision(True, "PR is not open" if pull.get("state") != "open"
                            else f"no `{LABEL}` label — nothing to guard")
        current_fp, receipt = "", None
    else:
        base_ref = (pull.get("base") or {}).get("ref") or args.base_ref
        if args.local_refs:
            base_local, head_local = args.local_refs
        else:
            base_local, head_local = _fetch_pr(args.repo_dir, args.pr, base_ref)
        if git(args.repo_dir, "rev-parse", f"{head_local}^{{commit}}").decode().strip() != head:
            raise GuardError("fetched head does not match the PR head (a newer push is in flight)")
        _mb, current_fp = fingerprint(args.repo_dir, base_local, head_local)
        receipt = latest_receipt(gh.comments(args.pr), args.receipt_authors)
        decision = decide(labels, receipt, current_fp, head)

    summary = f"approved-head-guard PR #{args.pr} @ {head[:12]}: " \
              f"{'PASS' if decision.ok else 'TRIPPED'} — {decision.reason}"
    print(summary)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(summary + "\n")

    if args.apply and not decision.ok:
        if "unlabel" in decision.actions:
            gh.remove_label(args.pr)
        if "draft" in decision.actions and not pull.get("draft"):
            gh.to_draft(args.pr)
        if "comment" in decision.actions:
            gh.comment(args.pr, trip_comment(decision, receipt, head, current_fp))
    if args.status:
        gh.status(head, decision.ok, decision.reason)
    return 0 if decision.ok else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--repo-dir", default=".", help="local git checkout (default: .)")
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fingerprint", help="print merge base + fingerprint of HEAD vs BASE")
    f.add_argument("--base", default="origin/main")
    f.add_argument("--head", default="HEAD")
    f.set_defaults(func=cmd_fingerprint)

    for name, fn, helptext in (
        ("receipt", cmd_receipt, "G1: post the approval receipt, then add the label"),
        ("check", cmd_check, "G2: verify the label against the receipt"),
    ):
        s = sub.add_parser(name, help=helptext)
        s.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
        s.add_argument("--pr", type=int, required=True)
        s.add_argument("--base-ref", default="main")
        s.add_argument("--local-refs", nargs=2, metavar=("BASE", "HEAD"),
                       help=argparse.SUPPRESS)  # tests: skip the fetch
        s.set_defaults(func=fn)
        if name == "receipt":
            s.add_argument("--expect-head", default="",
                           help="the SHA (or prefix) Josh approved; refuse if the head moved")
            s.add_argument("--approved-by", default="Josh Moss, MD")
            s.add_argument("--note", default="")
            s.add_argument("--dry-run", action="store_true")
        else:
            s.add_argument("--apply", action="store_true",
                           help="on a trip: remove the label, set draft, comment")
            s.add_argument("--status", action="store_true",
                           help=f"post a `{STATUS_CONTEXT}` commit status on the head")
            s.add_argument("--receipt-authors", nargs="+", default=list(
                filter(None, os.environ.get("APPROVAL_RECEIPT_AUTHORS", "").split(",")))
                or list(DEFAULT_RECEIPT_AUTHORS))
    return p


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except GuardError as exc:
        print(f"approved-head-guard: could not check: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
