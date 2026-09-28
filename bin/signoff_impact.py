#!/usr/bin/env python3
"""Which faculty sign-offs a change reopens, said before it merges.

WHY THIS EXISTS. On 2026-09-28 #865 rewrote `sp-interview.html` under a 2026-09-26 signature.
Nothing said so until after the merge, when `bin/check_attestation_hashes.py` was run by hand
and the 09:05 release train had already published the page to learners as "awaiting
re-attestation". #884 made that visible once it is live; this makes it visible while there is
still a choice: re-sign right after the merge, hold the PR, or land an open attestation
sitting first (CLAUDE.md, "Order content merges around an open attestation sitting").

WHAT IT READS. Only git objects: the ledger, `shipped_pages.json`, `topic_meta.json` and each
attested source, at BASE and at HEAD, through `git cat-file`. It never checks out or runs the
head's code, so the PR workflow (.github/workflows/pr-signoff-impact.yml) can run it over any
PR. The hashing is attestation_hash.py's own (`digest`, `clinical_digest`); nothing here
re-derives what "bound" means.

WHAT IT REPORTS, per row REVIEWED at base and bound to the base text:
  reopened   the change edits the text the signature covers, so the row renders pending
  demoted    the change itself moves the row back to pending in reviewed.json (registration)
  removed    the change stops shipping the page, or deletes a source the signature covers
  citations  bound at head only by `clinicalHash`: the signature holds, but its citations
             changed (reported, never silent -- #672 was a citation change)
A row that was already drifted at base is not this change's doing and is counted, not listed.
A row the change does not touch -- no source, listing, topic_meta record or ledger row differs
-- cannot change state and is not recomputed.

Information, never a gate: exit 0 whatever it finds, 2 when it could not check (an input
unreadable at either side). `--check-run` also writes the "Sign-offs (advisory)" Check Run on
the head commit: success when nothing is reopened, neutral otherwise, neutral with the reason
when it could not check -- so an unread diff never reads as "reopens nothing".

    python3 bin/signoff_impact.py                       # merge-base(origin/main, HEAD)..HEAD
    python3 bin/signoff_impact.py --base REV --head REV [--format text|json|markdown]
    python3 bin/signoff_impact.py --base BASE_TIP --head MERGE --report-sha PR_HEAD --check-run

In the PR workflow the base is the base branch's tip and the head is GitHub's test merge
commit, so the answer is what merging would do to `main` -- not what the branch did against an
older merge-base, which would count a sign-off `main` has since re-attested as reopened.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from attestation_hash import (  # noqa: E402
    HEX40,
    AttestationHashError,
    clinical_digest,
    digest,
    sources_for_slug,
)

LEDGER_REL = "13_Faculty_Resources/reviewed.json"
SHIPPED_REL = "13_Faculty_Resources/_automation/site_build/shipped_pages.json"
TOPIC_META_REL = "topic_meta.json"
CHECK_NAME = "Sign-offs (advisory)"
LISTED = 25
API_VERSION = "2022-11-28"
SAFE_REPOSITORY = re.compile(r"[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}")
SAFE_SHA = re.compile(r"[0-9a-f]{40}")


class CouldNotCheck(Exception):
    """An input this report depends on is unreadable: exit 2, never "reopens nothing"."""


# --------------------------------------------------------------------------------------
# git objects, read as data
# --------------------------------------------------------------------------------------


def _git(args, root=ROOT):
    """git with every GIT_* variable dropped (bin/check_attestation_hashes.py `_git`)."""
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env["GIT_OPTIONAL_LOCKS"] = "0"
    return subprocess.run(["git", *args], cwd=str(root), capture_output=True, env=env)


def resolve(rev, root=ROOT):
    proc = _git(["rev-parse", "--verify", "--quiet", f"{rev}^{{commit}}"], root)
    sha = proc.stdout.decode().strip()
    if proc.returncode != 0 or not SAFE_SHA.fullmatch(sha):
        raise CouldNotCheck(f"cannot resolve {rev!r} to a commit")
    return sha


class Tree:
    """One side of the diff: file bytes at a commit, cached."""

    def __init__(self, sha, root=ROOT):
        self.sha, self.root, self._cache = sha, root, {}

    def blob(self, path):
        """Bytes of `path` at this commit, or None when the commit does not carry it."""
        if path not in self._cache:
            proc = _git(["cat-file", "blob", f"{self.sha}:{path}"], self.root)
            self._cache[path] = proc.stdout if proc.returncode == 0 else None
        return self._cache[path]

    def json(self, path):
        data = self.blob(path)
        if data is None:
            raise CouldNotCheck(f"{path} is absent at {self.sha[:12]}")
        try:
            return json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise CouldNotCheck(f"{path} is unparsable at {self.sha[:12]}: {exc}") from exc


def changed_paths(base, head, root=ROOT):
    proc = _git(["diff", "--name-only", "--no-renames", base, head], root)
    if proc.returncode != 0:
        raise CouldNotCheck("cannot diff %s..%s" % (base[:12], head[:12]))
    return set(filter(None, proc.stdout.decode("utf-8", "replace").splitlines()))


# --------------------------------------------------------------------------------------
# the classification
# --------------------------------------------------------------------------------------


def _inputs(tree):
    ledger, shipped, topic_meta = (tree.json(rel) for rel in (LEDGER_REL, SHIPPED_REL, TOPIC_META_REL))
    if (not isinstance(ledger, dict) or not isinstance(topic_meta, dict)
            or not isinstance(shipped, dict) or not isinstance(shipped.get("pages"), list)):
        raise CouldNotCheck(f"a registry has the wrong shape at {tree.sha[:12]}")
    return ledger, shipped, topic_meta


def binding(tree, shipped, topic_meta, slug, row):
    """How a reviewed `row` stands against the text at `tree`:

    'bound' (contentHash matches), 'clinical' (only clinicalHash matches), 'stale',
    'removed' (no site ships the slug, or an attested source is gone), or 'malformed'.
    """
    stored = row.get("contentHash")
    if not isinstance(stored, str) or not HEX40.fullmatch(stored):
        return "malformed"
    paths = sources_for_slug(shipped, slug)
    sources = {path: tree.blob(path) for path in paths}
    if not paths or any(data is None for data in sources.values()):
        return "removed"
    record = topic_meta.get(slug)
    try:
        if digest(slug, sources, record) == stored:
            return "bound"
        clinical = row.get("clinicalHash")
        if isinstance(clinical, str) and HEX40.fullmatch(clinical) \
                and clinical_digest(slug, sources, record) == clinical:
            return "clinical"
    except AttestationHashError:
        return "removed"
    return "stale"


def _touched(slug, base_in, head_in, changed):
    """Could this change have moved the row's state? Only then is it recomputed."""
    (b_ledger, b_shipped, b_meta), (h_ledger, h_shipped, h_meta) = base_in, head_in
    b_paths, h_paths = sources_for_slug(b_shipped, slug), sources_for_slug(h_shipped, slug)
    return (b_paths != h_paths or any(path in changed for path in set(b_paths) | set(h_paths))
            or b_meta.get(slug) != h_meta.get(slug) or b_ledger.get(slug) != h_ledger.get(slug))


def impact(base, head, root=ROOT):
    """The sign-offs merging `head` onto `base` reopens. Raises CouldNotCheck."""
    base_tree, head_tree = Tree(resolve(base, root), root), Tree(resolve(head, root), root)
    base_in, head_in = _inputs(base_tree), _inputs(head_tree)
    changed = changed_paths(base_tree.sha, head_tree.sha, root)
    b_ledger, b_shipped, b_meta = base_in
    h_ledger, h_shipped, h_meta = head_in
    result = {"base": base_tree.sha, "head": head_tree.sha, "reopened": [], "citations": [],
              "signed": 0, "examined": 0, "alreadyAwaiting": 0}
    for slug in sorted(b_ledger):
        row = b_ledger[slug]
        if not isinstance(row, dict) or row.get("status") != "reviewed":
            continue
        result["signed"] += 1
        if not _touched(slug, base_in, head_in, changed):
            continue
        result["examined"] += 1
        before = binding(base_tree, b_shipped, b_meta, slug, row)
        if before not in ("bound", "clinical"):
            result["alreadyAwaiting"] += 1
            continue
        entry = {"slug": slug, "signedAt": row.get("at"), "by": row.get("by")}
        head_row = h_ledger.get(slug)
        if not isinstance(head_row, dict) or head_row.get("status") != "reviewed":
            result["reopened"].append({**entry, "why": "demoted"})
            continue
        after = binding(head_tree, h_shipped, h_meta, slug, head_row)
        if after in ("stale", "malformed"):
            result["reopened"].append({**entry, "why": "reopened"})
        elif after == "removed":
            result["reopened"].append({**entry, "why": "removed"})
        elif after == "clinical" and before == "bound":
            result["citations"].append(entry)
    return result


# --------------------------------------------------------------------------------------
# rendering
# --------------------------------------------------------------------------------------

WHY = {
    "reopened": "its text changes",
    "demoted": "this change moves it back to pending",
    "removed": "a source it covers is removed or the page stops shipping",
}


def _plural(count, word):
    return f"{count} {word}{'' if count == 1 else 's'}"


def title(result):
    reopened = result["reopened"]
    if not reopened:
        return "Reopens no faculty sign-off"
    names = ", ".join(item["slug"] for item in reopened[:3])
    more = f" +{len(reopened) - 3} more" if len(reopened) > 3 else ""
    return f"Reopens {_plural(len(reopened), 'faculty sign-off')}: {names}{more}"


def render_markdown(result):
    lines = [f"**{title(result)}.**", ""]
    reopened = result["reopened"]
    if reopened:
        lines += [
            "Once this merges and the release train publishes it, learners see "
            + ("this page" if len(reopened) == 1 else "these pages")
            + " as awaiting your re-signature until you re-attest in the faculty console "
              "(Needs review). If an `attest/pending` sign-off PR is open, land it first.",
            "",
            "| Page | Signed | Why |",
            "| --- | --- | --- |",
        ]
        for item in reopened[:LISTED]:
            lines.append(f"| `{item['slug']}` | {item.get('signedAt') or '?'} | {WHY[item['why']]} |")
        if len(reopened) > LISTED:
            lines.append(f"| … | | +{len(reopened) - LISTED} more |")
        lines.append("")
    if result["citations"]:
        names = ", ".join(f"`{item['slug']}`" for item in result["citations"])
        lines += [f"Citations change under a signature that still holds (clinical text unchanged): {names}.", ""]
    lines.append(
        f"Examined {result['examined']} of {result['signed']} signed rows this change touches"
        + (f"; {result['alreadyAwaiting']} of those were already awaiting re-signature on the base"
           if result["alreadyAwaiting"] else "")
        + f". Base `{result['base'][:12]}`, head `{result['head'][:12]}`. Information only: this "
          "check never blocks a merge."
    )
    return "\n".join(lines) + "\n"


def render_text(result):
    out = [title(result) + "."]
    for item in result["reopened"]:
        out.append(f"  REOPENS {item['slug']} (signed {item.get('signedAt') or '?'}): {WHY[item['why']]}")
    for item in result["citations"]:
        out.append(f"  CITATIONS CHANGED {item['slug']} (signature holds)")
    out.append(f"examined {result['examined']} of {result['signed']} signed rows; "
               f"{result['alreadyAwaiting']} already awaiting re-signature on the base "
               f"({result['base'][:12]}..{result['head'][:12]})")
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------------------
# the Check Run (PR workflow only)
# --------------------------------------------------------------------------------------


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def check_output(result=None, error=None):
    """The Check Run body: success only for a complete read that reopens nothing."""
    if error is not None:
        return {"conclusion": "neutral",
                "title": "Could not check which sign-offs this change reopens",
                "summary": f"Could not check: {error}. Nothing is known about sign-offs for this "
                           "head; it is not a clean result."}
    return {"conclusion": "neutral" if result["reopened"] else "success",
            "title": title(result)[:240], "summary": render_markdown(result)[:60000]}


def write_check_run(repository, token, head_sha, output, opener=None):
    if SAFE_REPOSITORY.fullmatch(repository or "") is None or SAFE_SHA.fullmatch(head_sha or "") is None:
        raise ValueError("repository or head sha is invalid")
    body = {"name": CHECK_NAME, "head_sha": head_sha, "status": "completed",
            "conclusion": output["conclusion"],
            "output": {"title": output["title"], "summary": output["summary"]}}
    request = Request(
        f"https://api.github.com/repos/{repository}/check-runs",
        data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}",
                 "Content-Type": "application/json", "X-GitHub-Api-Version": API_VERSION,
                 "User-Agent": "signoff-impact"},
    )
    response = (opener or build_opener(_NoRedirect)).open(request, timeout=20)
    try:
        if response.status not in (200, 201):
            raise OSError(f"check run write answered {response.status}")
    finally:
        response.close()


def main(argv=None, stream=None):
    stream = stream or sys.stdout
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default=None, help="default: merge-base of origin/main and HEAD")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--root", default=str(ROOT), help=argparse.SUPPRESS)
    parser.add_argument("--format", choices=("text", "json", "markdown"), default="text")
    parser.add_argument("--check-run", action="store_true",
                        help="also write the advisory Check Run (GITHUB_TOKEN, GITHUB_REPOSITORY)")
    parser.add_argument("--report-sha", default=None,
                        help="the commit the Check Run is attached to (the PR head); default --head")
    args = parser.parse_args(argv)

    result, error = None, None
    root = Path(args.root)
    try:
        base = args.base
        if base is None:
            proc = _git(["merge-base", "origin/main", args.head], root)
            base = proc.stdout.decode().strip()
            if proc.returncode != 0 or not base:
                raise CouldNotCheck("no merge-base with origin/main; pass --base")
        result = impact(base, args.head, root)
    except CouldNotCheck as exc:
        error = str(exc)

    if error is not None:
        print(f"signoff-impact: could not check: {error}", file=sys.stderr)
    elif args.format == "json":
        stream.write(json.dumps(result, indent=2) + "\n")
    elif args.format == "markdown":
        stream.write(render_markdown(result))
    else:
        stream.write(render_text(result))

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if args.check_run:
        output = check_output(result, error)
        if summary_path:
            with open(summary_path, "a", encoding="utf-8") as handle:
                handle.write(f"## {CHECK_NAME}\n\n{output['summary']}\n")
        try:
            write_check_run(os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_TOKEN", ""),
                            args.report_sha or resolve(args.head, root), output)
        except (OSError, ValueError, CouldNotCheck) as exc:
            # A fork PR's token is read-only. The step summary above still carries the result.
            print(f"::warning title={CHECK_NAME}::check run not written: {exc}", file=sys.stderr)
    return 2 if error is not None else 0


if __name__ == "__main__":
    sys.exit(main())
