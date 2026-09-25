#!/usr/bin/env python3
"""A content change may register and demote an attestation; only the console may promote one.

WHY THIS EXISTS: on 2026-09-16 two agent-authored PRs merged from the same head branch,
`claude/repo-issues-review-g3pqoq`. #640 (0009ad6) was a 926-line content PR that also wrote a
new governance rule into CLAUDE.md and AGENTS.md and demoted four pages; #672 (8b8ccd9) flipped
three pending pages to `reviewed` under the owner's name, re-dated three existing attestations,
and flipped and re-dated `facultyReview` blocks in topic_meta.json — all in the same diff that
added the citations later found to be 53/74 wrong. Both were reverted (#687/#688).

That is root cause 3: nothing stopped a content PR from also changing the files that govern it.
An agent editing pages could, in one commit, edit the rules it works under and sign off the very
text it had just written. Review sees one diff and reads the content; the governance lines ride
along.

It is also root cause 1. The agents run under the repository owner's GitHub account, so
"authored by jmoss333" does not distinguish a human governance act from an agent's. The one
identity that does is the Faculty Attestation Console's own commit identity —
`Faculty Attestation Console <faculty@clerkship.local>`, author AND committer — because only the
console writes it. Agent and owner commits carry `jmoss333 <…users.noreply.github.com>` with a
`GitHub` committer. So L4 asks the git identity, not the ledger's `by` field, which any writer
can type. (CONSOLE_IDENTITY is imported from attestation_hash.py; it is defined once.)

THE RULE:

    Inputs: base rev, head rev, head branch name.
    Changed = git diff --no-renames --name-only base head
    G_FILES = {13_Faculty_Resources/reviewed.json, CLAUDE.md, AGENTS.md, decisions.json,
               standards.json, instrument_rights.json, vocabulary.json, .gitattributes,
               13_Faculty_Resources/reviewed.schema.json,
               13_Faculty_Resources/_automation/attestation_hash.py,
               13_Faculty_Resources/_automation/surface_governance.py,
               13_Faculty_Resources/_automation/validate_attestation_consistency.py,
               13_Faculty_Resources/_automation/validate_curriculum.py,
               13_Faculty_Resources/_automation/validate_topic_meta.py}
               PLUS any path ending .schema.json
    G_DIRS  = {.claude/, .github/, bin/, faculty-console/,
               13_Faculty_Resources/_automation/maintenance/, tests/maintenance/}
    CONTENT(path) = a `source`/`extraSources` entry of shipped_pages.json at BASE or at HEAD
                    OR (matches ^(0\\d|1[0-4]|99)_[^/]+/ AND not under 13_Faculty_Resources/)
                    EXCEPT question_bank.json when nothing but its items' `status` changed:
                    a question's attestation IS its status, so a status-only diff moves
                    governance state, not the text a learner reads (see qbank_text()).
    PROMOTION, reviewed.json (JSON diff per key; a missing key is a value):
       status becomes reviewed; or an entry reviewed on BOTH sides changes any of
       at, by, risk, note, contentHash, claimsHash, evidenceHash, evidenceThrough;
       or a new entry born reviewed.
    PROMOTION, topic_meta.json: a facultyReview block whose status becomes reviewed/attested,
       or a block reviewed on BOTH sides whose lastReviewed or reviewer changes.
       (A demotion that deletes lastReviewed/reviewer is registration.)
    PROMOTION, question_bank.json (items identified by their `id`): an item whose status
       becomes attested, an item born attested, or an item attested on BOTH sides ANY of
       whose fields changes — the whole item is the attested text.
       (attested→draft, with or without an edit, is registration: the honest edit demotes.)
    REGISTRATION: every other reviewed.json change.
    L1  any G_FILES\\{reviewed.json} or G_DIRS path changed  AND any CONTENT changed     → FAIL
    L2  any PROMOTION                                   AND head branch != attest/pending → FAIL
    L3  any PROMOTION                                   AND any CONTENT changed           → FAIL
    L4  any commit in base..head (skipping merge commits) that introduces a reviewed.json
        PROMOTION whose author email or committer email != faculty@clerkship.local  → FAIL  (D8)
    Exit 0 clean · 1 any FAIL · 2 could not check (no base, unparsable JSON or registry
    shape, no git).

GOVERNANCE IS THE MACHINERY OF ATTESTATION, NOT ONLY THE LEDGER AND CLAUDE.md. The first
draft named the rule files and the workflow directory, and a content PR could still edit THIS
FILE, or `bin/verify.sh`, in the same diff as the pages it was changing — rewriting the gate
that judges it and the pages it judges, inside one reviewer's single glance. So `bin/` (every
gate and audit tool), `faculty-console/` (what writes an attestation), `.github/` in full (not
only `workflows/`: actions, templates, CODEOWNERS), `_automation/maintenance/` and
`tests/maintenance/` (what pins the workflows and this guard) are governance too, as is any
`*.schema.json` — a schema is the shape a registry must hold, and loosening one is a
governance act wherever the file lives.

TWO DIRECTORIES ARE DELIBERATELY NOT GOVERNANCE, because a legitimate content PR has to touch
them in the same diff as the page it ships:

  * `13_Faculty_Resources/_automation/site_build/` — REGISTRATION DATA. A new page must be
    added to the site manifest (or the case-of-the-week registry), regenerated into
    shipped_pages.json, and wired into nav inside build_deploy.py, or the QA gate's
    orphaned-source check hard-fails the build. Making that governance would forbid shipping
    a page at all. (A `*.schema.json` under it is still governance: the data may ride along,
    the contract it must satisfy may not. And the producer filenames are spelled without
    backticks on purpose: tests/shipped-pages-readers.test.mjs freezes every file carrying a
    QUOTED literal that ends in one, and a markdown backtick is a quote to that regex. This
    tool asks shipped_pages.json what ships, per ADR-002; it never reads a producer.)
  * `tests/` outside `tests/maintenance/` — panel snapshots and per-surface test rows are
    written by the PR that adds the surface; a new page legitimately brings its own test row.

Neither exclusion is a hole in L2/L3/L4: nothing under either directory can promote an
attestation. They are outside the L1 same-diff rule only.

WHAT IT DOES NOT SAY. Registration and demotion are how a content PR is *supposed* to record
that it touched attested text: a new pending row, a pending row edited, reviewed→pending, a row
deleted, a `facultyReview` demotion that drops `lastReviewed`/`reviewer`. None of those claim a
review happened, so none of them fail here. The rule forbids the claim, not the bookkeeping.

    python3 bin/check_governance_separation.py              # base = merge-base with origin/main
    python3 bin/check_governance_separation.py --base REV --head REV --head-branch NAME
    python3 bin/check_governance_separation.py --format json
    python3 bin/check_governance_separation.py --self-test              # hermetic fixture repos

ON A BRANCH STACKED ON ANOTHER PR, push with
`CLERKSHIP_PR_BASE=origin/<parent-branch> git push` so the pre-push gate compares against the
parent, not main. The default base is `merge-base origin/main HEAD`, which on a stack contains
the PARENT PR's commits — so the gate judges work this branch never wrote, and because
bin/verify.sh is the pre-push hook, it blocks every push from the stack until the parent
merges. `CLERKSHIP_PR_BASE` moves the base; `--base` still wins over both, and the header line
always says which of the three the base came from. It is not a bypass: whatever it names is
still passed to `git merge-base`, so it can only shrink the range to commits this branch owns,
and it silences no rule.

EXIT 2 IS NOT A PASS. No base, no git, an unparsable registry, a registry that parses to
something other than the shape the rule reads (a reviewed.json or topic_meta.json that is not
an object, a question_bank.json with no `items` list, a shipped_pages.json with no `pages`
list — `{"entries": {…}}` and a bare JSON list both used to coerce to `{}`, i.e. "every row
deleted", i.e. registration, over a diff that promoted every row), or a HEAD tree with no
shipped_pages.json all mean the rule cannot be evaluated — and a classifier that
cannot tell content from not-content would clear every diff it was handed. Two more doors are
exit 2 for the same reason, and both were once a clean 0: a NAMED base that resolves to the head
(`--base HEAD`, or `CLERKSHIP_PR_BASE=origin/<this branch>` after a push) makes the diff empty
and every promotion in it invisible; and a reviewed.json ABSENT AT HEAD reads as "every entry
deleted", i.e. registration, so moving the ledger to a path this tool does not read would clear
a diff that promoted every row in it. Absent at BASE still means "every entry is new".

The DEFAULT base equalling the head is the opposite case and exits 0, saying so: `merge-base
origin/main HEAD` can only equal HEAD when the branch owns no commits — a fresh worktree of
`main`, a branch before its first commit, a fully-merged branch — and a range with nothing in
it has provably nothing to hide. Failing those would redden `bin/verify.sh` on clean `main`,
which is the checkout this repo tells people to run a failing gate on to find out whose fault
it is.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from attestation_hash import CONSOLE_IDENTITY  # noqa: E402

LEDGER_REL = "13_Faculty_Resources/reviewed.json"
TOPIC_META_REL = "topic_meta.json"
QBANK_REL = "question_bank.json"
SHIPPED_REL = "13_Faculty_Resources/_automation/site_build/shipped_pages.json"
ATTEST_BRANCH = "attest/pending"

G_FILES = frozenset({
    LEDGER_REL,
    "CLAUDE.md",
    "AGENTS.md",
    "decisions.json",
    "standards.json",
    "instrument_rights.json",
    "vocabulary.json",
    # The attestation machinery's own data and code. Editing how a hash is computed, what a
    # reviewed row may contain, or what a validator accepts changes what every attestation in
    # the ledger MEANS — which is a governance act even though no ledger row moves.
    ".gitattributes",
    "13_Faculty_Resources/reviewed.schema.json",
    "13_Faculty_Resources/_automation/attestation_hash.py",
    "13_Faculty_Resources/_automation/surface_governance.py",
    "13_Faculty_Resources/_automation/validate_attestation_consistency.py",
    "13_Faculty_Resources/_automation/validate_curriculum.py",
    "13_Faculty_Resources/_automation/validate_topic_meta.py",
})
# Everything under these is governance. `.github/` in FULL, not only `workflows/`: a composite
# action, an issue template or CODEOWNERS decides how the work is reviewed just as a workflow
# does. `bin/` is every gate and audit tool INCLUDING THIS FILE — the hole this widening
# closed is a content PR that edits its own judge in the same diff as the pages being judged.
# `faculty-console/` is what writes an attestation; `_automation/maintenance/` and
# `tests/maintenance/` are what pin the workflows and this guard.
# NOT here, deliberately, and the docstring says why: `_automation/site_build/` (registration
# data a new page must edit) and `tests/` outside `tests/maintenance/` (per-surface test rows).
G_DIRS = (
    ".claude/",
    ".github/",
    "bin/",
    "faculty-console/",
    "13_Faculty_Resources/_automation/maintenance/",
    "tests/maintenance/",
)
# A schema is the shape a registry must hold; loosening one is a governance act wherever the
# file lives — including under site_build/, whose DATA rides with a page but whose CONTRACTS
# do not.
G_SUFFIX = ".schema.json"

# The numbered curriculum trees. 13_Faculty_Resources matches `1[0-4]` and is excluded by name.
CONTENT_DIR = re.compile(r"^(0\d|1[0-4]|99)_[^/]+/")
CONTENT_EXCLUDE = "13_Faculty_Resources/"

# A reviewed row's promotable fields. `reason` is deliberately absent: it explains a pending
# row, and editing it claims nothing about a review.
LEDGER_PROMOTION_KEYS = (
    "at", "by", "risk", "note", "contentHash", "claimsHash", "evidenceHash", "evidenceThrough",
)
TOPIC_META_PROMOTION_KEYS = ("lastReviewed", "reviewer")
# question_bank.json's `status` enum is draft/attested; only faculty attest tooling writes
# `attested`, and what it vouches for is the WHOLE item — stem, options, rationale, evidence.
QBANK_ATTESTED = "attested"
# The one field in a question_bank.json item that records governance state rather than text.
# `retired` is deliberately NOT here: it changes which items ship, which is content.
QBANK_GOVERNANCE_KEYS = frozenset({"status"})
# topic_meta's schema enum is draft/pending/reviewed/retired; `attested` is named by the rule
# and honoured here so a future rename cannot slip a promotion past this.
PROMOTED_STATES = frozenset({"reviewed", "attested"})

# Appended to the L2 block when every ledger promotion in range is the console's own work.
STALE_BASE_HINT = (
    "hint: every promotion here was committed by the faculty console — if these rows are "
    "already on main, your base is stale (git fetch origin main; or push with "
    "CLERKSHIP_PR_BASE=origin/<parent>)")

RULE_TEXT = {
    "L1": "a governance file and page content changed in the same diff",
    "L2": "an attestation was promoted on a branch that is not " + ATTEST_BRANCH,
    "L3": "an attestation was promoted in a diff that also changes content",
    "L4": "a reviewed.json promotion was committed by an identity other than the console",
}


class InputError(Exception):
    """An input this tool must read is unreadable — exit 2, never a pass."""


class GitError(Exception):
    """A git command this tool depends on failed — exit 2, never a pass."""


class _Missing:
    """A key that is absent. A missing key is a VALUE: #640 promoted a row by ADDING a note."""

    def __repr__(self):
        return "<missing>"


MISSING = _Missing()


# --------------------------------------------------------------------------------------
# git, with the ambient git environment scrubbed
# --------------------------------------------------------------------------------------


def _git(root, args, check=True):
    """Run git under `root`, returning the CompletedProcess with BYTES on stdout.

    Every GIT_* variable is dropped: git exports GIT_DIR into hook children and this tool's
    self-test builds throwaway repos, so an inherited GIT_DIR would point those writes at the
    real repository (bin/verify.sh:30-38 for the incident that earned this). Bytes, not text,
    because `cat-file blob` returns a registry and the locale is not the repo's business.
    """
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env["GIT_OPTIONAL_LOCKS"] = "0"
    proc = subprocess.run(["git", *args], cwd=str(root), capture_output=True, env=env)
    if check and proc.returncode != 0:
        raise GitError("git %s: %s"
                       % (" ".join(args), proc.stderr.decode("utf-8", "replace").strip()))
    return proc


def _git_text(root, args, check=True):
    return _git(root, args, check=check).stdout.decode("utf-8", "replace")


def _resolve(root, rev):
    """The full commit sha `rev` names here, or None when it names no commit."""
    proc = _git(root, ["rev-parse", "--verify", "--quiet", "%s^{commit}" % rev], check=False)
    sha = proc.stdout.decode("utf-8", "replace").strip()
    return sha if proc.returncode == 0 and sha else None


def _rev_exists(root, rev):
    return _resolve(root, rev) is not None


def _short_rev(root, rev):
    """`rev` as git's own abbreviated sha; the literal text when it resolves to nothing.

    The header used to print `rev[:7]`, which renders `origin/main~1` as `origin/` and
    `8b8ccd9~1` as `8b8ccd9` — the short sha of a DIFFERENT commit than the one compared.
    A base a reader cannot trust is a base nobody can reproduce the run from.
    """
    proc = _git(root, ["rev-parse", "--short", "%s^{commit}" % rev], check=False)
    out = proc.stdout.decode("utf-8", "replace").strip()
    return out if proc.returncode == 0 and out else rev


def _blob_at(root, rev, path):
    """The bytes of `path` at `rev`, or None when the tree there does not carry it."""
    proc = _git(root, ["rev-parse", "--verify", "--quiet", "%s:%s" % (rev, path)], check=False)
    sha = proc.stdout.decode("utf-8", "replace").strip()
    if proc.returncode != 0 or not sha:
        return None
    return _git(root, ["cat-file", "blob", sha]).stdout


def json_at(root, rev, path):
    """`path` parsed as JSON at `rev`; None when absent there.

    Absent at base means every entry is new; absent at head means every entry is deleted.
    Present-but-unparsable is exit 2: a classifier that silently reads {} would report a
    diff full of promotions as clean.
    """
    raw = _blob_at(root, rev, path)
    if raw is None:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise InputError("%s at %s is not parsable JSON: %s" % (path, rev, exc))


def _registry_at(root, rev, path):
    """`path` at `rev` as a JSON OBJECT, or None when absent there.

    Present-but-not-an-object is exit 2. `ledger_promotions` and `topic_meta_promotions`
    coerce a non-dict document to `{}` so their unit edges stay total, and that coercion at
    HEAD reads as "every row deleted", i.e. registration: a head whose ledger is
    `{"entries": {…}}` or a bare JSON list exited 0 over a diff that promoted every row in it.
    Absent is left exactly as it was — at base, every entry is new.
    """
    doc = json_at(root, rev, path)
    if doc is not None and not isinstance(doc, dict):
        raise InputError("%s at %s is a %s, not an object — the promotion set cannot be read"
                         % (path, rev, type(doc).__name__))
    return doc


def _ledger_at(root, rev, path=LEDGER_REL):
    """reviewed.json at `rev` as {slug: row}, or None when absent there.

    Stricter than `_registry_at`, because `{"entries": {…}}` IS a dict: a wrapper around the
    rows parses fine, every slug the base carried then reads as deleted — registration — and a
    diff that promoted every row in the ledger exited 0. `reviewed.schema.json` requires
    `status` on every row and sets `additionalProperties: false`, so "every value is an object
    carrying a string `status`" is this file's own contract, not a new one invented here.
    """
    doc = _registry_at(root, rev, path)
    if doc is None:
        return None
    wrong = [key for key, row in doc.items()
             if not (isinstance(row, dict) and isinstance(row.get("status"), str))]
    if wrong:
        raise InputError("%s at %s is not a map of attestation rows — %r has no `status`"
                         % (path, rev, wrong[0]))
    return doc


def changed_paths(root, base, head):
    """Every path the diff touches, with BOTH sides of a rename.

    `--no-renames` is load-bearing. Git's default rename detection collapses a moved file to
    its destination alone, so moving a shipped content source out of the content trees —
    `03_Core_Topics/x/x.md` → `docs/moved_x.md` — in the same commit as a CLAUDE.md edit
    listed only `docs/moved_x.md`, no CONTENT path was seen, and L1 and L3 both passed a diff
    that had emptied a content tree. The source side is what the CONTENT predicate has to
    read: whether a path IS content is a fact about where it was, not only where it went.
    """
    out = _git_text(root, ["diff", "--no-renames", "--name-only", base, head])
    return [line for line in out.splitlines() if line]


# --------------------------------------------------------------------------------------
# the predicates
# --------------------------------------------------------------------------------------


def shipped_sources(shipped_doc):
    """Every `source` and `extraSources` entry in shipped_pages.json.

    Read the derived listing, never the producers (ADR-002). A page can ship from a path the
    regex does not match — welcome.md's resident override lives under 13_Faculty_Resources —
    and a path the regex does match can be an unshipped draft.
    """
    if not isinstance(shipped_doc, dict):
        raise InputError("shipped_pages.json is not an object")
    pages = shipped_doc.get("pages")
    if not isinstance(pages, list):
        # `"pages": 7`, `"pages": {}`, or no `pages` key at all used to raise a TypeError out
        # of this loop — a traceback, which exits 1 and reads as a rule failure. It is not one:
        # it is the CONTENT predicate being unreadable, which is exit 2.
        raise InputError("shipped_pages.json has no `pages` list (found %s)"
                         % type(pages).__name__)
    out = set()
    for page in pages:
        if not isinstance(page, dict):
            continue
        source = page.get("source")
        if isinstance(source, str):
            out.add(source)
        for extra in page.get("extraSources") or []:
            if isinstance(extra, str):
                out.add(extra)
    return out


def is_content(path, sources):
    if path in sources:
        return True
    return bool(CONTENT_DIR.match(path)) and not path.startswith(CONTENT_EXCLUDE)


def is_governance(path):
    """A governance path other than reviewed.json — the set L1 asks about."""
    if path == LEDGER_REL:
        return False  # the ledger is L2/L3/L4's business; L1 is about everything else
    if path in G_FILES or path.endswith(G_SUFFIX):
        return True
    return any(path.startswith(prefix) for prefix in G_DIRS)


def _value(raw):
    if isinstance(raw, str):
        return raw
    return json.dumps(raw, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _describe(key, before, after):
    """`at 2026-07-03→2026-09-16` · `note added` · `note rewritten` — short enough to read."""
    if before is MISSING:
        return "%s added" % key
    if after is MISSING:
        return "%s removed" % key
    shown_before, shown_after = _value(before), _value(after)
    if len(shown_before) > 40 or len(shown_after) > 40:
        return "%s rewritten" % key if isinstance(after, str) else "%s changed" % key
    return "%s %s→%s" % (key, shown_before, shown_after)


def _changed_keys(before, after, keys):
    out = []
    for key in keys:
        was = before.get(key, MISSING)
        now = after.get(key, MISSING)
        if was is MISSING and now is MISSING:
            continue
        if was is MISSING or now is MISSING or was != now:
            out.append(_describe(key, was, now))
    return out


def ledger_promotions(base_doc, head_doc):
    """[(slug, what changed)] for every reviewed.json promotion between the two documents."""
    base = base_doc if isinstance(base_doc, dict) else {}
    head = head_doc if isinstance(head_doc, dict) else {}
    out = []
    for slug in sorted(set(base) | set(head)):
        after = head.get(slug)
        if not isinstance(after, dict):
            continue  # deleted, or never an object: registration, or someone else's error
        before = base.get(slug) if isinstance(base.get(slug), dict) else None
        after_status = after.get("status")
        before_status = before.get("status") if before is not None else None
        if after_status != "reviewed":
            continue  # a demotion, a pending edit, a new pending row: registration
        if before_status != "reviewed":
            out.append((slug, "%s→reviewed" % (before_status or "new")))
            continue
        for change in _changed_keys(before, after, LEDGER_PROMOTION_KEYS):
            out.append((slug, change))
    return out


def _faculty_review(record):
    if not isinstance(record, dict):
        return None
    block = record.get("facultyReview")
    return block if isinstance(block, dict) else None


def topic_meta_promotions(base_doc, head_doc):
    """[(slug, what changed)] for every topic_meta.json facultyReview promotion.

    reviewed↔attested is a rename inside the promoted set, not a promotion; any date or
    reviewer edit there is still caught by the both-sides check below.
    """
    base = base_doc if isinstance(base_doc, dict) else {}
    head = head_doc if isinstance(head_doc, dict) else {}
    out = []
    for slug in sorted(set(base) | set(head)):
        after = _faculty_review(head.get(slug))
        if after is None:
            continue  # the block went away, or never existed: registration
        before = _faculty_review(base.get(slug))
        after_status = after.get("status")
        before_status = before.get("status") if before is not None else None
        if after_status not in PROMOTED_STATES:
            continue  # a demotion, including one that deletes lastReviewed/reviewer
        if before_status not in PROMOTED_STATES:
            out.append((slug, "facultyReview %s→%s"
                        % (before_status or "new", after_status)))
            continue
        for change in _changed_keys(before, after, TOPIC_META_PROMOTION_KEYS):
            out.append((slug, "facultyReview " + change))
    return out


def qbank_items(doc):
    """{id: item} for question_bank.json, or {} when the file is absent at that rev.

    A wrong SHAPE is exit 2, never {}: `bin/run_queue_task.py` names this file beside
    reviewed.json and topic_meta.json as a registry the nightly runner may never edit, 144 of
    its items carry `status: "attested"`, and a document that coerces to nothing would read as
    "every item deleted" — registration — over a diff that attested the lot.
    """
    if doc is None:
        return {}
    if not isinstance(doc, dict):
        raise InputError("%s is not an object" % QBANK_REL)
    items = doc.get("items")
    if not isinstance(items, list):
        raise InputError("%s has no `items` list (found %s)"
                         % (QBANK_REL, type(items).__name__))
    out = {}
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            out[item["id"]] = item
    return out


def qbank_text(doc):
    """question_bank.json with each item's governance state removed — the text a learner reads.

    WHY THIS EXISTS. #783 listed question_bank.json as an `extraSources` entry of the two
    question tools (so a pack-only edit drifts their page attestations), which made the file
    CONTENT for this gate. But the file is also a ledger: the console attests a question by
    flipping its `status`, and nothing else. From #783 on, every console question sign-off
    was therefore "a promotion in a diff that also changes content" — L3 — against itself,
    on the one branch allowed to promote. The first casualty was rolling PR #781 (39 items,
    `status` the only field changed on any of them).

    The exception is exactly as wide as the ledger: two sides whose projections are equal
    changed nothing but `status`. A stem, option, rationale or evidence edit — or an item
    added, removed, reordered or retired — still differs here, so question_bank.json stays
    CONTENT and L1/L3 still fire. A shape this tool cannot read is exit 2, never "unchanged":
    `qbank_items()` holds the shape doors for both functions.
    """
    if doc is None:
        return None
    qbank_items(doc)  # raises InputError on a wrong shape
    items = [
        {key: value for key, value in item.items() if key not in QBANK_GOVERNANCE_KEYS}
        if isinstance(item, dict) else item
        for item in doc["items"]
    ]
    return dict(doc, items=items)


def qbank_promotions(base_doc, head_doc):
    """[(item id, what changed)] for every question_bank.json promotion.

    Identity is the item's `id` (stable forever per the schema: SRS cards and response records
    key on it). Unlike a ledger row, an attested ITEM has no separately attested field — the
    stem, the options, the rationale and the evidence are all the text faculty signed — so ANY
    field changing while the item is attested on both sides is a fresh claim about fresh text.
    The honest edit demotes to `draft` first, which is registration and passes here.
    """
    base = qbank_items(base_doc)
    head = qbank_items(head_doc)
    out = []
    for item_id in sorted(set(base) | set(head)):
        after = head.get(item_id)
        if after is None:
            continue  # deleted: registration
        before = base.get(item_id)
        after_status = after.get("status")
        before_status = before.get("status") if before is not None else None
        if after_status != QBANK_ATTESTED:
            continue  # a draft, a new draft item, or a demotion: registration
        if before_status != QBANK_ATTESTED:
            out.append((item_id, "%s→attested" % (before_status or "new")))
            continue
        changed = [key for key in sorted(set(before) | set(after))
                   if before.get(key, MISSING) != after.get(key, MISSING)]
        if changed:
            out.append((item_id, "attested item edited (fields: %s)" % ", ".join(changed)))
    return out


# --------------------------------------------------------------------------------------
# the four laws
# --------------------------------------------------------------------------------------


def commit_promotions(root, base, head):
    """[(sha7, author email, committer email, [(slug, change)])] for L4.

    Merge commits are skipped: a merge's diff against its first parent re-reports every
    promotion on the branch it merges, under the merger's identity, so every console
    attestation would fail the moment it reached main.
    """
    revs = _git_text(root, ["rev-list", "--no-merges", "--reverse",
                            "%s..%s" % (base, head)]).split()
    offenders = []
    for rev in revs:
        parent = "%s^" % rev
        before = json_at(root, parent, LEDGER_REL) if _rev_exists(root, parent) else None
        promotions = ledger_promotions(before, json_at(root, rev, LEDGER_REL))
        if not promotions:
            continue
        identities = _git_text(root, ["log", "-1", "--format=%ae%n%ce", rev]).splitlines()
        author = identities[0].strip() if identities else ""
        committer = identities[1].strip() if len(identities) > 1 else ""
        if author == CONSOLE_IDENTITY and committer == CONSOLE_IDENTITY:
            continue
        offenders.append((rev[:7], author, committer, promotions))
    return offenders


def classify(root, base, head, head_branch, base_source=None):
    """The whole verdict as data. Raises InputError / GitError; never guesses."""
    # An empty range is not a clean range — when somebody NAMED the base. `--base HEAD`, or
    # `CLERKSHIP_PR_BASE=origin/<own-branch>` typed after a push, makes the diff empty and
    # every promotion invisible, which would print OK over the exact diff the rule exists to
    # read. The DEFAULT base is the opposite case: `merge-base origin/main HEAD` can only
    # equal the head when the branch owns no commits — a fresh worktree of `main`, a branch
    # before its first commit, a fully-merged branch — and a range with nothing in it has
    # provably nothing to hide. Failing those would redden `bin/verify.sh` on clean `main`,
    # which CLAUDE.md tells people to run to find out whose fault a red gate is.
    base_sha = _resolve(root, base)
    source = base_source or "from --base"
    empty_range = base_sha is not None and base_sha == _resolve(root, head)
    if empty_range and source != DEFAULT_BASE_SOURCE:
        raise InputError("the named base is the head — nothing to compare")

    shipped = json_at(root, head, SHIPPED_REL)
    if shipped is None:
        raise InputError("%s is absent at %s — the CONTENT predicate cannot be evaluated"
                         % (SHIPPED_REL, head))
    # CONTENT-NESS IS READ AT BASE ∪ HEAD. Ten of the 130 shipped sources are content ONLY
    # because shipped_pages.json says so — the six `_prototypes/` tools (sp-interview.html
    # among them) and four under 13_Faculty_Resources/, all of which the regex misses. Read
    # the head side alone and a diff that DE-REGISTERS such a page and rewrites it in the same
    # commit shows no content path at all: the file stops being content exactly when it is
    # being changed. Whether a path is content is a fact about the range, not about its end.
    sources = shipped_sources(shipped)
    base_shipped = json_at(root, base, SHIPPED_REL)
    if base_shipped is not None:
        sources |= shipped_sources(base_shipped)

    changed = changed_paths(root, base, head)
    content = [path for path in changed if is_content(path, sources)]
    governance = [path for path in changed if is_governance(path)]

    # Absent at head is NOT "every entry deleted". A rename of the ledger would empty the
    # promotion set and clear a diff that carries every promotion in it, at a new path this
    # tool does not read; absent at BASE stays "every entry is new" (a repo's first commit).
    head_ledger = _ledger_at(root, head)
    if head_ledger is None:
        raise InputError("%s is absent at head" % LEDGER_REL)
    ledger = ledger_promotions(_ledger_at(root, base), head_ledger)
    topic_meta = topic_meta_promotions(_registry_at(root, base, TOPIC_META_REL),
                                       _registry_at(root, head, TOPIC_META_REL))
    base_qbank = json_at(root, base, QBANK_REL)
    head_qbank = json_at(root, head, QBANK_REL)
    qbank = qbank_promotions(base_qbank, head_qbank)
    promotions = bool(ledger) or bool(topic_meta) or bool(qbank)
    # A status-only question_bank.json diff is governance state, not content — see
    # qbank_text(). Said out loud in the report, never silently: a path leaving the content
    # set is precisely the shrink docs/SILENT_SHRINK_CHECKLIST.md is about.
    qbank_status_only = (QBANK_REL in content
                         and qbank_text(base_qbank) == qbank_text(head_qbank))
    if qbank_status_only:
        content = [path for path in content if path != QBANK_REL]

    failures = []
    if governance and content:
        failures.append("L1")
    if promotions and head_branch != ATTEST_BRANCH:
        failures.append("L2")
    if promotions and content:
        failures.append("L3")
    # L4 walks commits only when the base..head DIFF carries a ledger promotion, so a
    # promotion introduced and then reverted inside the range lands nothing, is invisible
    # here, and is treated as registration. That is by design, not an oversight: this gate
    # judges what the PR DELIVERS. A branch that promoted a row and backed it out before
    # review has claimed nothing by the time it merges, and failing it would punish the fix.
    offenders = commit_promotions(root, base, head) if ledger else []
    if offenders:
        failures.append("L4")

    # THE STALE-BASE DIAGNOSTIC. L2 firing while L4 stays silent means every ledger promotion
    # in range was committed by the console itself — which cannot happen on a branch an agent
    # or the owner wrote. It is what a base too far back looks like: a local `origin/main`
    # behind a merged console PR, or a re-run CI event carrying an older base.sha. The rows
    # are real, they are just already on main. Say so rather than letting the reader hunt.
    stale_base = bool("L2" in failures and ledger and not offenders
                      and head_branch != ATTEST_BRANCH)

    return {
        "base": base, "head": head, "headBranch": head_branch,
        "baseSource": source, "emptyRange": empty_range,
        "changed": changed, "content": content, "governance": governance,
        "ledgerPromotions": ledger, "topicMetaPromotions": topic_meta,
        "qbankPromotions": qbank, "qbankStatusOnly": qbank_status_only,
        "commitOffenders": offenders, "staleBaseHint": stale_base, "failures": failures,
    }


# --------------------------------------------------------------------------------------
# output
# --------------------------------------------------------------------------------------


def _promotion_lines(verdict, indent="    "):
    lines = []
    if verdict["ledgerPromotions"]:
        lines.append("%s%s:" % (indent, LEDGER_REL))
        for slug, change in verdict["ledgerPromotions"]:
            lines.append("%s  %s: %s" % (indent, slug, change))
    if verdict["topicMetaPromotions"]:
        lines.append("%s%s:" % (indent, TOPIC_META_REL))
        for slug, change in verdict["topicMetaPromotions"]:
            lines.append("%s  %s: %s" % (indent, slug, change))
    if verdict["qbankPromotions"]:
        lines.append("%s%s:" % (indent, QBANK_REL))
        for item_id, change in verdict["qbankPromotions"]:
            lines.append("%s  qbank %s: %s" % (indent, item_id, change))
    return lines


QBANK_STATUS_ONLY_NOTE = ("%s changed only item `status` — governance state, not content"
                          % QBANK_REL)


def report_lines(verdict):
    """One block per rule that fired, naming the offending paths, entries and commits."""
    lines = []
    if verdict.get("qbankStatusOnly") and verdict["failures"]:
        lines.append("note: %s" % QBANK_STATUS_ONLY_NOTE)
    for rule in verdict["failures"]:
        lines.append("%s FAIL: %s" % (rule, RULE_TEXT[rule]))
        if rule == "L1":
            lines.append("    governance changed:")
            lines.extend("      %s" % path for path in verdict["governance"])
            lines.append("    content changed:")
            lines.extend("      %s" % path for path in verdict["content"])
            lines.append("    split the governance edit into its own PR.")
        elif rule == "L2":
            lines.append("    head branch: %s" % verdict["headBranch"])
            lines.extend(_promotion_lines(verdict))
            lines.append("    a promotion is the console's to write, on %s." % ATTEST_BRANCH)
            if verdict["staleBaseHint"]:
                lines.append("    %s" % STALE_BASE_HINT)
        elif rule == "L3":
            if "L2" in verdict["failures"]:
                lines.append("    the promotions listed under L2 above, and:")
            else:
                lines.extend(_promotion_lines(verdict))
            lines.append("    content changed:")
            lines.extend("      %s" % path for path in verdict["content"])
            lines.append("    attest the text as it stands, in a diff that does not change it.")
        elif rule == "L4":
            for sha, author, committer, promotions in verdict["commitOffenders"]:
                lines.append("    %s authored %s, committed %s"
                             % (sha, author or "(none)", committer or "(none)"))
                for slug, change in promotions:
                    lines.append("      %s: %s" % (slug, change))
            lines.append("    only %s writes a promotion." % CONSOLE_IDENTITY)
    return lines


def run(root, base, head, head_branch, fmt="text", stream=None, base_source=None):
    stream = stream or sys.stdout
    verdict = classify(root, base, head, head_branch, base_source)
    where = "base %s (%s)" % (_short_rev(root, base), verdict["baseSource"])

    if fmt == "json":
        payload = dict(verdict, schemaVersion=1)
        payload["ledgerPromotions"] = [{"slug": s, "change": c}
                                       for s, c in verdict["ledgerPromotions"]]
        payload["topicMetaPromotions"] = [{"slug": s, "change": c}
                                          for s, c in verdict["topicMetaPromotions"]]
        payload["qbankPromotions"] = [{"id": i, "change": c}
                                      for i, c in verdict["qbankPromotions"]]
        payload["commitOffenders"] = [
            {"commit": sha, "author": author, "committer": committer,
             "promotions": [{"slug": s, "change": c} for s, c in promotions]}
            for sha, author, committer, promotions in verdict["commitOffenders"]]
        json.dump(payload, stream, indent=1)
        stream.write("\n")
        return 1 if verdict["failures"] else 0

    if verdict["failures"]:
        print("governance separation: %d rule(s) failed — %s .. %s"
              % (len(verdict["failures"]), where, head), file=sys.stderr)
        for line in report_lines(verdict):
            print(line, file=sys.stderr)
        print("  see this file's docstring for what registration and demotion may do",
              file=sys.stderr)
        return 1

    if verdict["emptyRange"]:
        # Only reachable on the DEFAULT base (a named one raised in classify). Say what
        # happened rather than printing "0 changed paths" as if a diff had been read.
        print("governance separation OK — %s is the head; this branch owns no commits"
              % where, file=stream)
        return 0

    promotions = (len(verdict["ledgerPromotions"]) + len(verdict["topicMetaPromotions"])
                  + len(verdict["qbankPromotions"]))
    print("governance separation OK — %s; %d changed path(s), %d content, %d governance, "
          "%d promotion(s) on %s"
          % (where, len(verdict["changed"]), len(verdict["content"]),
             len(verdict["governance"]), promotions, verdict["headBranch"]), file=stream)
    if verdict["qbankStatusOnly"]:
        print("  note: %s" % QBANK_STATUS_ONLY_NOTE, file=stream)
    return 0


PR_BASE_ENV = "CLERKSHIP_PR_BASE"
# The one base nobody chose. `classify` treats it differently from a NAMED base when it turns
# out to equal the head: see the empty-range guard there.
DEFAULT_BASE_SOURCE = "merge-base with origin/main"


def default_base(root, head, environ=None):
    """(base sha, where it came from) when --base was not given.

    A branch stacked on an unmerged PR has that PR's commits in `merge-base origin/main HEAD`,
    so the gate judges work its author never wrote and — because verify.sh is the pre-push
    hook — blocks every push from the stack until the parent merges. `CLERKSHIP_PR_BASE` lets
    the pusher name the parent. It is not a bypass: it MOVES the base, it does not silence a
    rule, and whatever it names is still a merge-base, so it can only ever shrink the range to
    commits the branch actually owns.
    """
    environ = os.environ if environ is None else environ
    parent = (environ.get(PR_BASE_ENV) or "").strip()
    if parent:
        proc = _git(root, ["merge-base", parent, head], check=False)
        base = proc.stdout.decode("utf-8", "replace").strip()
        if proc.returncode == 0 and base:
            return base, "from %s" % PR_BASE_ENV
        raise InputError("%s=%s does not resolve here — unset it or pass --base"
                         % (PR_BASE_ENV, parent))
    proc = _git(root, ["merge-base", "origin/main", head], check=False)
    base = proc.stdout.decode("utf-8", "replace").strip()
    if proc.returncode != 0 or not base:
        raise InputError("origin/main not resolvable — pass --base")
    return base, DEFAULT_BASE_SOURCE


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=None,
                        help="repository to check (default: this checkout)")
    parser.add_argument("--base", default=None,
                        help="the ref to compare against (default: merge-base with "
                             "$CLERKSHIP_PR_BASE when set, else with origin/main)")
    parser.add_argument("--head", default="HEAD", help="the ref to check (default: HEAD)")
    parser.add_argument("--head-branch", default=None,
                        help="the branch name the head would merge from "
                             "(default: the current branch)")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    root = Path(args.root).resolve() if args.root else ROOT
    try:
        if not (root / ".git").exists() and not _rev_exists(root, args.head):
            raise InputError("%s is not a git repository" % root)
        head_branch = args.head_branch
        if head_branch is None:
            head_branch = _git_text(root, ["rev-parse", "--abbrev-ref", "HEAD"]).strip()
        if args.base:
            base, base_source = args.base, "from --base"
        else:
            base, base_source = default_base(root, args.head)
        return run(root, base, args.head, head_branch, args.format, base_source=base_source)
    except (InputError, GitError, OSError) as exc:
        print("could not check: %s" % exc, file=sys.stderr)
        return 2


# --------------------------------------------------------------------------------------
# self-test — hermetic: throwaway git repos only, never the live tree
# --------------------------------------------------------------------------------------

FIXTURE_EMAIL = "fixture@example.invalid"
ATTESTER = "Joshua Moss, MD"
PENDING_BY = "Pending faculty review"

# w.md's second source is deliberately OUTSIDE the numbered-tree regex and under the
# directory the regex excludes: it is content only because shipped_pages.json says so.
X_SOURCE = "03_Core_Topics/x/x.md"
W_SOURCE = "03_Core_Topics/w/w.md"
W_EXTRA = "13_Faculty_Resources/Outreach/w_resident.md"
UNSHIPPED = "05_Therapeutics/draft/notes.md"          # content by regex, shipped by nothing
NOT_CONTENT = "docs/design/notes.md"                  # neither


def _fixture_shipped():
    return {
        "version": 1,
        "pages": [
            {"slug": "x.md", "kind": "page", "producer": "site_manifest",
             "sites": ["ms3"], "source": X_SOURCE, "title": "X"},
            {"slug": "w.md", "kind": "page", "producer": "site_manifest",
             "sites": ["ms3", "res"], "source": W_SOURCE, "extraSources": [W_EXTRA],
             "title": "W"},
        ],
    }


def _reviewed(at="2026-07-03", **extra):
    entry = {"status": "reviewed", "risk": {"kind": "clinical", "level": "moderate"},
             "at": at, "by": ATTESTER}
    entry.update(extra)
    return entry


def _pending(at="2026-07-03", **extra):
    entry = {"status": "pending", "risk": {"kind": "clinical", "level": "moderate"},
             "at": at, "by": PENDING_BY}
    entry.update(extra)
    return entry


def _fixture_ledger():
    return {"x.md": _pending(), "w.md": _reviewed()}


def _fixture_qbank():
    """Two items: one draft, one attested. `id` is the identity; the whole item is the text."""
    return {
        "_note": "fixture",
        "version": 1,
        "items": [
            {"id": "qb_mood_001", "status": "draft", "stem": "draft stem",
             "options": [{"key": "A", "t": "a"}], "pearl": "p"},
            {"id": "qb_sud_001", "status": QBANK_ATTESTED, "stem": "attested stem",
             "options": [{"key": "A", "t": "a"}], "pearl": "p"},
        ],
    }


def _fixture_topic_meta():
    return {
        "_note": "fixture",
        "x.md": {"tldr": "x", "facultyReview": {"status": "pending"}},
        "w.md": {"tldr": "w", "facultyReview": {"status": "reviewed", "reviewer": ATTESTER,
                                                "lastReviewed": "2026-07-03"}},
    }


def _name_for(email):
    return "Faculty Attestation Console" if email == CONSOLE_IDENTITY else "Fixture"


def _fixture_git_env(email=None, committer=None):
    """Author and committer are set SEPARATELY: #672 was authored by one and committed by
    another (jmoss333 / GitHub), and L4 must reject either half being wrong."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    author = email or FIXTURE_EMAIL
    committer = committer or author
    env.update({
        "GIT_AUTHOR_NAME": _name_for(author), "GIT_AUTHOR_EMAIL": author,
        "GIT_COMMITTER_NAME": _name_for(committer), "GIT_COMMITTER_EMAIL": committer,
        "GIT_AUTHOR_DATE": "2026-09-16T12:00:00+00:00",
        "GIT_COMMITTER_DATE": "2026-09-16T12:00:00+00:00",
    })
    return env


def _fixture_git(root, args, email=None, committer=None):
    proc = subprocess.run(["git", *args], cwd=str(root), capture_output=True, text=True,
                          env=_fixture_git_env(email, committer))
    if proc.returncode != 0:
        raise GitError("fixture git %s failed: %s" % (" ".join(args), proc.stderr.strip()))
    return proc.stdout


def _write(root, rel, payload):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(payload, (dict, list)):
        payload = json.dumps(payload, indent=2) + "\n"
    path.write_text(payload, encoding="utf-8")


def _commit(root, message, email=None, committer=None):
    _fixture_git(root, ["add", "-A"])
    _fixture_git(root, ["commit", "-q", "--no-verify", "-m", message],
                 email=email, committer=committer)
    return _fixture_git(root, ["rev-parse", "HEAD"]).strip()


def _fixture_repo(root):
    """A seeded repo on `main`: registries, governance files, content, a skill."""
    root.mkdir(parents=True, exist_ok=True)
    _fixture_git(root, ["init", "-q", "-b", "main"])
    _fixture_git(root, ["config", "user.name", "Fixture"])
    _fixture_git(root, ["config", "user.email", FIXTURE_EMAIL])
    _fixture_git(root, ["config", "commit.gpgsign", "false"])
    _write(root, SHIPPED_REL, _fixture_shipped())
    _write(root, LEDGER_REL, _fixture_ledger())
    _write(root, TOPIC_META_REL, _fixture_topic_meta())
    _write(root, QBANK_REL, _fixture_qbank())
    _write(root, "CLAUDE.md", "# Agent Guide\n\nrule one\n")
    _write(root, "AGENTS.md", "# Agent Guide\n\nrule one\n")
    _write(root, "decisions.json", {"D1": "decided"})
    _write(root, ".claude/skills/s/SKILL.md", "---\nname: s\n---\n\nbody\n")
    for rel in (X_SOURCE, W_SOURCE, W_EXTRA, UNSHIPPED, NOT_CONTENT):
        _write(root, rel, "# page\n\noriginal\n")
    _commit(root, "seed")
    return root


def _branch(root, name):
    _fixture_git(root, ["checkout", "-q", "-b", name, "main"])


def _run(argv):
    """Run the CLI, capturing both streams. A crash is a failure, not a traceback."""
    out, err = io.StringIO(), io.StringIO()
    try:
        with redirect_stdout(out), redirect_stderr(err):
            code = main(argv)
    except SystemExit as exc:  # argparse
        code = exc.code
    except Exception as exc:  # noqa: BLE001 — a crash must read as a failed case
        return -1, "%s: %s" % (type(exc).__name__, exc)
    return code, out.getvalue() + err.getvalue()


def _case(root, name, mutate, email=None, head_branch=None, committer=None):
    """Branch from main, apply `mutate`, commit, and run the tool over base..branch.

    `head_branch` is what the PR would merge FROM, which is the branch name unless a case
    needs a second branch carrying the same name to the rule (c2 and d both do).
    """
    _branch(root, name)
    mutate()
    _commit(root, name, email=email, committer=committer)
    code, text = _run(["--root", str(root), "--base", "main", "--head", name,
                       "--head-branch", head_branch or name])
    _fixture_git(root, ["checkout", "-q", "main"])
    return code, text


def _rules(text):
    """The rule names the report actually printed, in order."""
    return [rule for rule in ("L1", "L2", "L3", "L4") if ("%s FAIL" % rule) in text]


class _env:
    """Set environment variables for a block, restoring what was there afterwards."""

    def __init__(self, **values):
        self.values, self.previous = values, {}

    def __enter__(self):
        for key, value in self.values.items():
            self.previous[key] = os.environ.get(key)
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        return self

    def __exit__(self, *exc):
        for key, value in self.previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        return False


def self_test():  # noqa: C901 — a flat list of cases reads better than helpers here
    failures, total = [], []

    def check(name, got, want):
        total.append(name)
        if got != want:
            failures.append("%s: got %r, want %r" % (name, got, want))

    def raises(call):
        """True when `call` raises InputError — the exit-2 shape doors, away from git."""
        try:
            call()
        except InputError:
            return True
        return False

    def verdict(name, got, want_code, want_rules):
        code, text = got
        check("%s exits %d" % (name, want_code), code, want_code)
        check("%s fires %s" % (name, want_rules or "nothing"), _rules(text), want_rules)

    holder = tempfile.TemporaryDirectory()
    # The whole suite runs with the ambient CLERKSHIP_PR_BASE cleared: a value in the caller's
    # shell must not reach into a hermetic case and move a base out from under it.
    ambient = _env(CLERKSHIP_PR_BASE=None)
    ambient.__enter__()
    try:
        root = _fixture_repo(Path(holder.name) / "repo")
        ledger, meta = _fixture_ledger(), _fixture_topic_meta()

        def touch_content():
            _write(root, X_SOURCE, "# page\n\nrevised\n")

        def promote_ledger():
            data = json.loads(json.dumps(ledger))
            data["x.md"] = _reviewed(at="2026-09-16")
            _write(root, LEDGER_REL, data)

        # (a) a content PR that also rewrites the rules it works under — the #640 shape.
        def a():
            touch_content()
            _write(root, "CLAUDE.md", "# Agent Guide\n\nrule one\nrule two\n")
        verdict("(a) content + CLAUDE.md on a feature branch",
                _case(root, "feature-a", a), 1, ["L1"])

        # (a2) governance is a directory too: a skill is an instruction an agent obeys.
        def a2():
            touch_content()
            _write(root, ".claude/skills/s/SKILL.md", "---\nname: s\n---\n\nrewritten\n")
        verdict("(a2) content + .claude/skills/s/SKILL.md",
                _case(root, "feature-a2", a2), 1, ["L1"])

        # (b) a promotion on a feature branch, by a non-console identity.
        verdict("(b) promotion only on a feature branch",
                _case(root, "feature-b", promote_ledger), 1, ["L2", "L4"])

        # (c) the same promotion, on attest/pending, committed by the console: the clean path.
        verdict("(c) promotion on attest/pending as the console",
                _case(root, ATTEST_BRANCH, promote_ledger, email=CONSOLE_IDENTITY), 0, [])

        # (c2) same branch name, same diff, wrong hands. L4 is the whole point: the branch is
        # not a credential, and the agents commit under the owner's own account.
        verdict("(c2) promotion on attest/pending as the fixture identity",
                _case(root, "attest/pending-2", promote_ledger, head_branch=ATTEST_BRANCH),
                1, ["L4"])

        # Both halves of the identity are load-bearing. #672 was AUTHORED by jmoss333 and
        # COMMITTED by GitHub; a squash-merge rewrites the committer, so checking one half
        # would clear the exact commit this tool was built for.
        verdict("a console author with a foreign committer still fails",
                _case(root, "attest/pending-author-only", promote_ledger,
                      email=CONSOLE_IDENTITY, committer=FIXTURE_EMAIL,
                      head_branch=ATTEST_BRANCH), 1, ["L4"])
        verdict("a console committer with a foreign author still fails",
                _case(root, "attest/pending-committer-only", promote_ledger,
                      email=FIXTURE_EMAIL, committer=CONSOLE_IDENTITY,
                      head_branch=ATTEST_BRANCH), 1, ["L4"])

        # (d) the console's own branch and identity cannot launder a content edit.
        def d():
            promote_ledger()
            touch_content()
        verdict("(d) promotion + content on attest/pending as the console",
                _case(root, "attest/pending-3", d, email=CONSOLE_IDENTITY,
                      head_branch=ATTEST_BRANCH), 1, ["L3"])

        # (e) the supported way to record that a content PR touched an unattested page.
        def e():
            data = json.loads(json.dumps(ledger))
            data["new.md"] = _pending(at="2026-09-16", reason="New content awaiting review.")
            _write(root, LEDGER_REL, data)
            touch_content()
        verdict("(e) new pending row + content", _case(root, "feature-e", e), 0, [])

        # (f) demotion is the honest move when a content PR rewrites attested text.
        def f():
            data = json.loads(json.dumps(ledger))
            data["w.md"] = _pending(at="2026-09-16", reason="Content changed; re-review.")
            _write(root, LEDGER_REL, data)
            _write(root, W_SOURCE, "# page\n\nrevised\n")
        verdict("(f) reviewed→pending + content", _case(root, "feature-f", f), 0, [])

        # (g) the #640 exp_consult.md shape: a note ADDED to a row already reviewed. A missing
        # key is a value, or this diff reads as "nothing changed on a reviewed row".
        def g():
            data = json.loads(json.dumps(ledger))
            data["w.md"] = _reviewed(note="Content enhanced with Further Reading (Phase 2).")
            _write(root, LEDGER_REL, data)
        code, text = _case(root, "feature-g", g)
        check("(g) note added to a reviewed row exits 1", code, 1)
        check("(g) fires L2 and L4", _rules(text), ["L2", "L4"])
        check("(g) names the entry and the change", "w.md: note added" in text, True)

        # (h) the #672 shape: an attestation re-dated in place, everything else identical.
        def h():
            data = json.loads(json.dumps(ledger))
            data["w.md"] = _reviewed(at="2026-09-16")
            _write(root, LEDGER_REL, data)
        code, text = _case(root, "feature-h", h)
        check("(h) at re-dated on a reviewed row exits 1", code, 1)
        check("(h) names the dates", "w.md: at 2026-07-03→2026-09-16" in text, True)

        # (i) topic_meta carries the same claim; L4 does not reach it (no per-commit identity
        # rule was ever defined for topic_meta), so a feature branch trips L2 alone.
        def i():
            data = json.loads(json.dumps(meta))
            data["x.md"]["facultyReview"] = {"status": "reviewed", "reviewer": ATTESTER,
                                             "lastReviewed": "2026-09-16"}
            _write(root, TOPIC_META_REL, data)
        code, text = _case(root, "feature-i", i)
        check("(i) topic_meta pending→reviewed exits 1", code, 1)
        check("(i) fires L2 only", _rules(text), ["L2"])

        # (j) the #640 case_formulation.md shape: a demotion that deletes the date and the
        # reviewer. It claims LESS than before, so it is registration.
        def j():
            data = json.loads(json.dumps(meta))
            data["w.md"]["facultyReview"] = {"status": "pending"}
            _write(root, TOPIC_META_REL, data)
            touch_content()
        verdict("(j) topic_meta demotion dropping lastReviewed/reviewer",
                _case(root, "feature-j", j), 0, [])

        # (k) re-dating a block reviewed on both sides is a fresh claim about fresh text.
        def k():
            data = json.loads(json.dumps(meta))
            data["w.md"]["facultyReview"]["lastReviewed"] = "2026-09-16"
            _write(root, TOPIC_META_REL, data)
        code, text = _case(root, "feature-k", k)
        check("(k) topic_meta lastReviewed re-dated exits 1", code, 1)
        check("(k) names the block and the dates",
              "w.md: facultyReview lastReviewed 2026-07-03→2026-09-16" in text, True)

        # (l) a governance file alone is fine: L1 is about the COMBINATION.
        def l_case():
            _write(root, "decisions.json", {"D1": "decided", "D2": "decided"})
        verdict("(l) decisions.json alone", _case(root, "feature-l", l_case), 0, [])

        # (n)-(q) THE QUESTION BANK IS AN ATTESTATION LEDGER TOO. 144 of its items carry
        # `status: "attested"`; `bin/run_queue_task.py` names the file beside reviewed.json
        # and topic_meta.json as a registry the nightly runner may never touch, and until this
        # landed nothing in the gate reached it. L4 stays reviewed.json-only (D3/D8 as
        # written: the console does not write question_bank.json, so no console-identity rule
        # could be defined for it) — so a qbank promotion on a feature branch is L2 alone.
        qb = _fixture_qbank()

        def attest_item():
            data = json.loads(json.dumps(qb))
            data["items"][0]["status"] = QBANK_ATTESTED
            _write(root, QBANK_REL, data)
        code, text = _case(root, "feature-qbank-promote", attest_item)
        check("(n) a qbank item flipped to attested exits 1", code, 1)
        check("(n) fires L2 only — L4 is reviewed.json's rule", _rules(text), ["L2"])
        check("(n) names the item and the flip",
              "qbank qb_mood_001: draft→attested" in text, True)

        # An attested item has no separately-attested field: the stem, the options and the
        # rationale are all the text faculty signed, so ANY edit is a fresh claim.
        def edit_attested_item():
            data = json.loads(json.dumps(qb))
            data["items"][1]["stem"] = "a different stem entirely"
            _write(root, QBANK_REL, data)
        code, text = _case(root, "feature-qbank-edit", edit_attested_item)
        check("(o) editing an item attested on both sides exits 1", code, 1)
        check("(o) fires L2", _rules(text), ["L2"])
        check("(o) names the item and the field",
              "qbank qb_sud_001: attested item edited (fields: stem)" in text, True)

        # ...and the honest way to make that edit: demote first. That is registration.
        def demote_then_edit():
            data = json.loads(json.dumps(qb))
            data["items"][1]["status"] = "draft"
            data["items"][1]["stem"] = "a different stem entirely"
            _write(root, QBANK_REL, data)
        verdict("(p) attested→draft plus the edit is registration",
                _case(root, "feature-qbank-demote", demote_then_edit), 0, [])

        verdict("(q) the same qbank promotion on attest/pending as the console",
                _case(root, "attest/pending-qbank", attest_item, email=CONSOLE_IDENTITY,
                      head_branch=ATTEST_BRANCH), 0, [])

        # (q2)-(q5) THE #783 SHAPE. question_bank.json registered as a tool's extraSources is
        # CONTENT — and the console's status flip must still pass on attest/pending, because
        # a question's attestation IS its status. Registered in the same diff: content-ness
        # is read at BASE ∪ HEAD, so that is enough for the file to count.
        def register_qbank_as_content():
            shipped = _fixture_shipped()
            shipped["pages"][0]["extraSources"] = [QBANK_REL]
            _write(root, SHIPPED_REL, shipped)

        def attest_item_registered():
            register_qbank_as_content()
            attest_item()
        code, text = _case(root, "attest/pending-qbank-783", attest_item_registered,
                           email=CONSOLE_IDENTITY, head_branch=ATTEST_BRANCH)
        check("(q2) a console status flip on a registered question bank exits 0", code, 0)
        check("(q2) and says why the question bank was not content",
              QBANK_STATUS_ONLY_NOTE in text, True)

        def attest_and_edit_registered():
            register_qbank_as_content()
            data = json.loads(json.dumps(qb))
            data["items"][0]["status"] = QBANK_ATTESTED
            data["items"][0]["stem"] = "a stem nobody reviewed"
            _write(root, QBANK_REL, data)
        code, text = _case(root, "attest/pending-qbank-783-edit", attest_and_edit_registered,
                           email=CONSOLE_IDENTITY, head_branch=ATTEST_BRANCH)
        check("(q3) attest + edit the same item on a registered bank exits 1", code, 1)
        check("(q3) fires L3", _rules(text), ["L3"])
        check("(q3) lists question_bank.json as content changed",
              "content changed:\n      %s" % QBANK_REL in text, True)
        check("(q3) does not claim the change was status-only",
              QBANK_STATUS_ONLY_NOTE in text, False)

        def attest_one_edit_other_registered():
            # The flip is clean on item 0, but item 1 (already attested) gains an edit —
            # the projection differs, so the file is content and L3 fires.
            register_qbank_as_content()
            data = json.loads(json.dumps(qb))
            data["items"][0]["status"] = QBANK_ATTESTED
            data["items"][1]["pearl"] = "a pearl nobody reviewed"
            _write(root, QBANK_REL, data)
        verdict("(q4) a clean flip beside an edit elsewhere in the bank",
                _case(root, "attest/pending-qbank-783-mixed", attest_one_edit_other_registered,
                      email=CONSOLE_IDENTITY, head_branch=ATTEST_BRANCH), 1, ["L3"])

        def retire_registered():
            # `retired` changes which items ship: content, not governance state.
            register_qbank_as_content()
            data = json.loads(json.dumps(qb))
            data["items"][0]["retired"] = True
            _write(root, QBANK_REL, data)
            _write(root, "CLAUDE.md", "# Agent Guide\n\nrule one\nrule two\n")
        verdict("(q5) retiring an item beside a CLAUDE.md edit is still L1",
                _case(root, "feature-qbank-783-retire", retire_registered), 1, ["L1"])

        # A content-only PR is the common case and must stay silent.
        verdict("content alone", _case(root, "feature-content", touch_content), 0, [])

        # The header must name the commit it actually compared. `rev[:7]` printed `origin/`
        # for `origin/main~1` and, worse, a VALID-LOOKING short sha for `8b8ccd9~1` — the
        # parent's run reported under the child's name.
        resolved = _fixture_git(root, ["rev-parse", "--short", "main"]).strip()
        code, text = _run(["--root", str(root), "--base", "main", "--head", "feature-content",
                           "--head-branch", "feature-content"])
        check("a symbolic base still exits 0", code, 0)
        check("and the header names the resolved sha, not the ref text",
              "base %s (from --base)" % resolved in text, True)
        check("and does not print the ref text as if it were a sha",
              "base main (" in text, False)

        # An empty range is not a clean range — when somebody NAMED the base.
        code, text = _run(["--root", str(root), "--base", "main", "--head", "main",
                           "--head-branch", "main"])
        check("a NAMED base that resolves to the head exits 2", code, 2)
        check("and says nothing to compare", "the named base is the head" in text, True)

        # The regex half of CONTENT: shipped_pages.json has never heard of this path.
        def unshipped():
            _write(root, UNSHIPPED, "# draft\n\nrevised\n")
            _write(root, "CLAUDE.md", "# Agent Guide\n\nrule one\nrule three\n")
        verdict("a numbered-tree path shipped_pages does not list is still content",
                _case(root, "feature-regex", unshipped), 1, ["L1"])

        # The shipped_pages half: W_EXTRA is under 13_Faculty_Resources/, which the regex
        # excludes; it is content because the derived listing says the site ships it.
        def extra_source():
            _write(root, W_EXTRA, "# page\n\nrevised\n")
            _write(root, "AGENTS.md", "# Agent Guide\n\nrule one\nrule four\n")
        verdict("an extraSources path under 13_Faculty_Resources is content",
                _case(root, "feature-extra", extra_source), 1, ["L1"])

        # THE GOVERNANCE SET IS THE MACHINERY OF ATTESTATION, not only the ledger and the
        # rule files. Until this widened, a content PR could edit the gate that judges it —
        # this very file, or bin/verify.sh — in the same diff as the pages being judged, and
        # `bin/ + content` exited 0. Each of these is a different clause of is_governance.
        governance_paths = (
            ("bin/x.py", "#!/usr/bin/env python3\nprint('a gate')\n"),          # G_DIRS
            ("faculty-console/x.mjs", "export const x = 1;\n"),                  # G_DIRS
            ("foo.schema.json", '{"type": "object"}\n'),                         # G_SUFFIX
            (".gitattributes", "*.bin binary\n"),                                # G_FILES
        )
        for index, (rel, body) in enumerate(governance_paths):
            def governance_plus_content(rel=rel, body=body):
                touch_content()
                _write(root, rel, body)
            verdict("%s in the same diff as content" % rel,
                    _case(root, "feature-gov-%d" % index, governance_plus_content), 1, ["L1"])

        # ...and the two exclusions, each of which a legitimate content PR must touch. A new
        # page is REGISTERED in site_build/ — added to the manifest, regenerated into
        # shipped_pages.json, wired into build_deploy.py's nav — or the build's
        # orphaned-source check fails it, and it brings its own panel snapshot under tests/.
        # Making either governance would forbid shipping a page at all.
        # (The regenerated listing stands in for the manifest here rather than that file's
        # own name: tests/shipped-pages-readers.test.mjs freezes every file
        # carrying a quoted literal that ends in a producer filename, and this fixture path
        # would read as this tool going around the single source. It is the stronger case
        # anyway — the listing is what a new page MUST regenerate.)
        not_governance_paths = (
            (SHIPPED_REL, json.dumps(_fixture_shipped(), indent=2) + "\n"),
            ("13_Faculty_Resources/_automation/site_build/build_deploy.py",
             "NAV = ['x.md', 'w.md']\n"),
            ("tests/__panels__/x.html", "<!doctype html>\n<p>panel</p>\n"),
        )
        for index, (rel, body) in enumerate(not_governance_paths):
            def registration_plus_content(rel=rel, body=body):
                touch_content()
                _write(root, rel, body)
            verdict("%s rides with content" % rel,
                    _case(root, "feature-notgov-%d" % index, registration_plus_content), 0, [])

        # CONTENT-NESS IS READ AT BASE ∪ HEAD. Ten of the 130 shipped sources are content
        # ONLY because shipped_pages.json says so, W_EXTRA's shape among them. Read the head
        # side alone and de-registering such a page in the same commit that rewrites it makes
        # it stop being content exactly when it is being changed — no CONTENT path, L1 silent.
        def deregister_and_edit():
            shipped = _fixture_shipped()
            shipped["pages"][1].pop("extraSources")
            _write(root, SHIPPED_REL, shipped)
            _write(root, W_EXTRA, "# page\n\nrewritten on the way out of the listing\n")
            _write(root, "CLAUDE.md", "# Agent Guide\n\nrule one\nrule seven\n")
        verdict("a source de-registered at head is still content in that diff",
                _case(root, "feature-deregister", deregister_and_edit), 1, ["L1"])

        # ...and a path that is neither is neither.
        def not_content():
            _write(root, NOT_CONTENT, "# notes\n\nrevised\n")
            _write(root, "CLAUDE.md", "# Agent Guide\n\nrule one\nrule five\n")
        verdict("a path outside both halves is not content",
                _case(root, "feature-noncontent", not_content), 0, [])

        # A RENAME HAS TWO SIDES. Git's default rename detection lists a moved file at its
        # destination only, so moving a shipped source OUT of the content trees alongside a
        # CLAUDE.md edit showed no CONTENT path at all and cleared L1 and L3 — on the one diff
        # that had emptied a content tree. Whether a path is content is a fact about where it
        # WAS, so the diff is taken with --no-renames.
        moved = "docs/moved_x.md"

        def renamed_out():
            (root / X_SOURCE).unlink()
            _write(root, moved, "# page\n\noriginal\n")
            _write(root, "CLAUDE.md", "# Agent Guide\n\nrule one\nrule six\n")
        verdict("a content source renamed out of the tree still counts as content",
                _case(root, "feature-rename", renamed_out), 1, ["L1"])
        listed = changed_paths(root, "main", "feature-rename")
        check("the diff lists the source side of the rename", X_SOURCE in listed, True)
        check("and the destination side", moved in listed, True)

        # L4 skips merges: a merge re-reports the branch's promotions under the merger's
        # identity, so without this every console attestation would fail on reaching main.
        _fixture_git(root, ["checkout", "-q", "-b", "merge-main", "main"])
        _fixture_git(root, ["merge", "-q", "--no-ff", "--no-verify", "-m", "merge",
                            ATTEST_BRANCH], email=FIXTURE_EMAIL)
        code, text = _run(["--root", str(root), "--base", "main", "--head", "merge-main",
                           "--head-branch", ATTEST_BRANCH])
        check("a merge of the console's branch exits 0", code, 0)
        check("and fires nothing", _rules(text), [])
        _fixture_git(root, ["checkout", "-q", "main"])

        # A STACKED BRANCH MUST BE ABLE TO NAME ITS BASE. `stack-child` owns a harmless
        # content edit; its parent carries a promotion. Against main the child is judged for
        # the parent's work — and verify.sh is the pre-push hook, so that blocks every push
        # off the stack until the parent merges.
        _fixture_git(root, ["checkout", "-q", "-b", "stack-parent", "main"])
        promote_ledger()
        _commit(root, "parent PR: a promotion")
        _fixture_git(root, ["checkout", "-q", "-b", "stack-child", "stack-parent"])
        _write(root, W_SOURCE, "# page\n\nchild edit\n")
        _commit(root, "child PR: content only")
        _fixture_git(root, ["checkout", "-q", "main"])

        code, text = _run(["--root", str(root), "--base", "main", "--head", "stack-child",
                           "--head-branch", "stack-child"])
        check("a stacked branch judged against main inherits the parent's finding", code, 1)
        check("which is the parent's promotion", _rules(text), ["L2", "L3", "L4"])
        check("and the header names --base as the source", "(from --base)" in text, True)

        with _env(CLERKSHIP_PR_BASE="stack-parent"):
            code, text = _run(["--root", str(root), "--head", "stack-child",
                               "--head-branch", "stack-child"])
        check("CLERKSHIP_PR_BASE narrows the range to the branch's own commits", code, 0)
        check("and the header says where the base came from",
              "(from CLERKSHIP_PR_BASE)" in text, True)

        # It moves the base; it does not silence a rule. Pointed at the grandparent, the
        # parent's promotion is back in range.
        with _env(CLERKSHIP_PR_BASE="main"):
            code, text = _run(["--root", str(root), "--head", "stack-child",
                               "--head-branch", "stack-child"])
        check("pointed at main it finds the promotion again", code, 1)
        check("with the same rules", _rules(text), ["L2", "L3", "L4"])

        # --base wins over the env var.
        with _env(CLERKSHIP_PR_BASE="stack-parent"):
            code, text = _run(["--root", str(root), "--base", "main", "--head", "stack-child",
                               "--head-branch", "stack-child"])
        check("--base wins over CLERKSHIP_PR_BASE", code, 1)
        check("and says so", "(from --base)" in text, True)

        # A name that does not resolve is exit 2, not a silent fall back to origin/main:
        # a typo in a push command must not quietly widen the range it was set to narrow.
        with _env(CLERKSHIP_PR_BASE="origin/no-such-branch"):
            code, text = _run(["--root", str(root), "--head", "stack-child",
                               "--head-branch", "stack-child"])
        check("an unresolvable CLERKSHIP_PR_BASE exits 2", code, 2)
        check("and names the variable", "CLERKSHIP_PR_BASE=origin/no-such-branch" in text, True)

        # The shape that gets typed after a push: the variable names the branch's OWN remote
        # tip, merge-base returns the head, and the diff is empty. Exit 2, not a clean 0.
        with _env(CLERKSHIP_PR_BASE="stack-child"):
            code, text = _run(["--root", str(root), "--head", "stack-child",
                               "--head-branch", "stack-child"])
        check("CLERKSHIP_PR_BASE naming the branch's own tip exits 2", code, 2)
        check("and says the base is the head", "the named base is the head" in text, True)

        # THE STALE-BASE DIAGNOSTIC. `stale-main` carries a promotion the console really
        # committed; `stale-child` is cut from it and edits a non-content file. Judged against
        # a base BEFORE the console commit — a local origin/main behind a merged console PR,
        # or a re-run CI event carrying an older base.sha — L2 fires over rows this branch
        # never wrote while L4 stays silent, because the console is exactly who committed
        # them. That combination is the signature; without the hint the reader has no way to
        # tell a stale base from a breach, and the honest fix is a fetch, not an edit.
        _fixture_git(root, ["checkout", "-q", "-b", "stale-main", "main"])
        promote_ledger()
        console_tip = _commit(root, "console: attest x.md", email=CONSOLE_IDENTITY,
                              committer=CONSOLE_IDENTITY)
        _fixture_git(root, ["checkout", "-q", "-b", "stale-child", "stale-main"])
        _write(root, NOT_CONTENT, "# notes\n\nchild edit\n")
        _commit(root, "child: a note — no content, no promotion")
        _fixture_git(root, ["checkout", "-q", "main"])

        code, text = _run(["--root", str(root), "--base", "main", "--head", "stale-child",
                           "--head-branch", "stale-child"])
        check("a stale base drags a merged console promotion into range", code, 1)
        check("as L2 alone — L4 is silent because the console did commit it",
              _rules(text), ["L2"])
        check("and the report names the likely cause", "your base is stale" in text, True)
        check("and gives the two ways out",
              "git fetch origin main" in text and "CLERKSHIP_PR_BASE" in text, True)

        code, text = _run(["--root", str(root), "--base", console_tip, "--head",
                           "stale-child", "--head-branch", "stale-child"])
        check("and with the right base the same branch is clean", code, 0)
        check("with no hint to give", "your base is stale" in text, False)

        # (m) no base and no origin/main: could not check, never a pass.
        with _env(CLERKSHIP_PR_BASE=None):
            code, text = _run(["--root", str(root), "--head", "main"])
        check("(m) an unresolvable base exits 2", code, 2)
        check("(m) says why", "origin/main not resolvable" in text, True)

        # ...but the DEFAULT base equalling the head is the opposite finding, and failing it
        # reddened verify.sh on every checkout that owns no commits of its own — including a
        # clean `main`, the checkout CLAUDE.md tells people to run a failing gate on. The
        # range is empty because the branch wrote nothing, which hides nothing.
        # (This ref must be created AFTER case (m), which asserts origin/main is absent.)
        _fixture_git(root, ["update-ref", "refs/remotes/origin/main", "main"])
        with _env(CLERKSHIP_PR_BASE=None):
            code, text = _run(["--root", str(root), "--head", "main", "--head-branch", "main"])
        check("the DEFAULT base equalling the head exits 0", code, 0)
        check("and says the branch owns no commits",
              "is the head; this branch owns no commits" in text, True)
        check("and names it as the default base", "(%s)" % DEFAULT_BASE_SOURCE in text, True)
        # The named doors are unaffected: same repo, same empty range, named base → 2.
        with _env(CLERKSHIP_PR_BASE="main"):
            code, text = _run(["--root", str(root), "--head", "main", "--head-branch", "main"])
        check("CLERKSHIP_PR_BASE naming that same commit still exits 2", code, 2)
        check("and still says the named base is the head",
              "the named base is the head" in text, True)

        # The other exit-2 doors.
        _branch(root, "feature-unparsable")
        (root / LEDGER_REL).write_text("{not json", encoding="utf-8")
        _commit(root, "unparsable ledger")
        code, text = _run(["--root", str(root), "--base", "main", "--head",
                           "feature-unparsable", "--head-branch", "feature-unparsable"])
        check("an unparsable reviewed.json exits 2", code, 2)
        check("and says which file", LEDGER_REL in text, True)
        _fixture_git(root, ["checkout", "-q", "main"])

        _branch(root, "feature-no-shipped")
        (root / SHIPPED_REL).unlink()
        _commit(root, "drop shipped_pages")
        code, text = _run(["--root", str(root), "--base", "main", "--head",
                           "feature-no-shipped", "--head-branch", "feature-no-shipped"])
        check("a HEAD without shipped_pages.json exits 2", code, 2)
        check("and says the predicate cannot be evaluated", "CONTENT predicate" in text, True)
        _fixture_git(root, ["checkout", "-q", "main"])

        # MOVING THE LEDGER IS NOT DELETING EVERY ROW. Absent-at-head used to read as "every
        # entry deleted" — registration — so this diff, which promotes x.md on the way past,
        # exited 0 and the promotion left no trace anywhere the tool looks.
        _branch(root, "feature-moved-ledger")
        moved_ledger = "13_Faculty_Resources/reviewed.moved.json"
        promoted_rows = json.loads(json.dumps(ledger))
        promoted_rows["x.md"] = _reviewed(at="2026-09-16")
        (root / LEDGER_REL).unlink()
        _write(root, moved_ledger, promoted_rows)
        _commit(root, "move the ledger, promoting on the way past")
        code, text = _run(["--root", str(root), "--base", "main", "--head",
                           "feature-moved-ledger", "--head-branch", "feature-moved-ledger"])
        check("a ledger renamed away at head exits 2, not 0", code, 2)
        check("and names the file it could not read",
              "%s is absent at head" % LEDGER_REL in text, True)
        _fixture_git(root, ["checkout", "-q", "main"])

        # A PRESENT-BUT-WRONG-SHAPED REGISTRY AT HEAD IS COULD-NOT-CHECK, NOT A PASS. Both
        # of these promote every row in the ledger on the way past, and both exited 0: a bare
        # JSON list coerced to {} — "every row deleted", i.e. registration — and
        # `{"entries": {…}}` IS a dict, so the wrapper parsed and every slug the base carried
        # read as deleted. reviewed.schema.json requires `status` on every row; that is the
        # contract, and it is the file's own, not one invented here.
        every_row_reviewed = {slug: _reviewed(at="2026-09-16") for slug in ledger}
        for index, (shape, payload) in enumerate((
                ("a bare JSON list", list(every_row_reviewed.values())),
                ("an object wrapping the rows", {"entries": every_row_reviewed}))):
            branch = "feature-ledger-shape-%d" % index
            _branch(root, branch)
            _write(root, LEDGER_REL, payload)
            _commit(root, "reshape the ledger while promoting every row")
            code, text = _run(["--root", str(root), "--base", "main", "--head", branch,
                               "--head-branch", branch])
            check("a reviewed.json that is %s exits 2" % shape, code, 2)
            check("and names the ledger (%s)" % shape, LEDGER_REL in text, True)
            _fixture_git(root, ["checkout", "-q", "main"])

        # The same door for the other two registries the rule reads.
        _branch(root, "feature-meta-shape")
        _write(root, TOPIC_META_REL,
               [{"slug": "x.md", "facultyReview": {"status": "reviewed"}}])
        _commit(root, "reshape topic_meta")
        code, text = _run(["--root", str(root), "--base", "main", "--head",
                           "feature-meta-shape", "--head-branch", "feature-meta-shape"])
        check("a topic_meta.json that is not an object exits 2", code, 2)
        check("and names it", TOPIC_META_REL in text, True)
        _fixture_git(root, ["checkout", "-q", "main"])

        _branch(root, "feature-qbank-shape")
        _write(root, QBANK_REL, {"_note": "fixture", "version": 1, "items": {"a": 1}})
        _commit(root, "reshape question_bank")
        code, text = _run(["--root", str(root), "--base", "main", "--head",
                           "feature-qbank-shape", "--head-branch", "feature-qbank-shape"])
        check("a question_bank.json with no `items` list exits 2", code, 2)
        check("and says which list it wanted", "has no `items` list" in text, True)
        _fixture_git(root, ["checkout", "-q", "main"])

        # A malformed shipped_pages.json used to raise TypeError out of the loop — a
        # traceback, which exits 1 and reads as a rule failure. It is the CONTENT predicate
        # being unreadable, which is exit 2.
        _branch(root, "feature-shipped-shape")
        _write(root, SHIPPED_REL, {"version": 1, "pages": 7})
        _commit(root, "malform shipped_pages")
        code, text = _run(["--root", str(root), "--base", "main", "--head",
                           "feature-shipped-shape", "--head-branch", "feature-shipped-shape"])
        check("a shipped_pages.json whose `pages` is not a list exits 2", code, 2)
        check("and says so rather than tracebacking",
              "has no `pages` list" in text and "Traceback" not in text, True)
        _fixture_git(root, ["checkout", "-q", "main"])

        # --format json carries the same verdict a machine can read.
        code, text = _run(["--root", str(root), "--base", "main", "--head", "feature-b",
                           "--head-branch", "feature-b", "--format", "json"])
        check("--format json exits 1 on the same case", code, 1)
        payload = json.loads(text)
        check("--format json names the rules", payload["failures"], ["L2", "L4"])
        check("--format json names the entry",
              payload["ledgerPromotions"], [{"slug": "x.md", "change": "pending→reviewed"}])
        check("--format json names the commit's identities",
              [payload["commitOffenders"][0]["author"],
               payload["commitOffenders"][0]["committer"]], [FIXTURE_EMAIL, FIXTURE_EMAIL])

        # The classifier's own unit edges, away from git.
        check("a deleted reviewed row is registration",
              ledger_promotions({"a.md": _reviewed()}, {}), [])
        check("a new row born reviewed is a promotion",
              ledger_promotions({}, {"a.md": _reviewed()}), [("a.md", "new→reviewed")])
        check("a pending row edited is registration",
              ledger_promotions({"a.md": _pending()}, {"a.md": _pending(at="2026-09-16")}), [])
        check("`reason` is not a promotable key",
              ledger_promotions({"a.md": _reviewed()},
                                {"a.md": _reviewed(reason="why")}), [])
        check("a removed note on a reviewed row is still a promotion",
              ledger_promotions({"a.md": _reviewed(note="n")}, {"a.md": _reviewed()}),
              [("a.md", "note removed")])
        check("contentHash rebinding is a promotion",
              [c for _, c in ledger_promotions({"a.md": _reviewed()},
                                               {"a.md": _reviewed(contentHash="a" * 40)})],
              ["contentHash added"])
        check("a topic_meta block that vanishes is registration",
              topic_meta_promotions({"a.md": {"facultyReview": {"status": "reviewed"}}},
                                    {"a.md": {}}), [])
        check("a record without facultyReview is ignored",
              topic_meta_promotions({"a.md": {}}, {"a.md": {"tldr": "x"}}), [])
        check("is_content honours the exclusion",
              is_content("13_Faculty_Resources/_automation/x.py", set()), False)
        check("is_content honours the regex", is_content("99_Archive/a/b.md", set()), True)
        # The two entry points must agree about what an unlabelled base is called: the
        # header read differently depending on which one produced it, and `baseSource` now
        # also decides whether an empty range is exit 0 or exit 2.
        check("classify's baseSource default is the CLI's label",
              classify(root, "main", "feature-content", "feature-content")["baseSource"],
              "from --base")
        check("and is not the default-base label",
              classify(root, "main", "feature-content",
                       "feature-content")["baseSource"] == DEFAULT_BASE_SOURCE, False)
        check("is_governance excludes reviewed.json", is_governance(LEDGER_REL), False)
        check("is_governance covers .github/workflows",
              is_governance(".github/workflows/ci.yml"), True)
        # The widened set, clause by clause, and the two deliberate exclusions.
        check("is_governance covers bin/", is_governance("bin/verify.sh"), True)
        check("is_governance covers this gate itself",
              is_governance("bin/check_governance_separation.py"), True)
        check("is_governance covers .github outside workflows/",
              is_governance(".github/CODEOWNERS"), True)
        check("is_governance covers faculty-console/",
              is_governance("faculty-console/netlify/functions/attest.mjs"), True)
        check("is_governance covers _automation/maintenance/",
              is_governance("13_Faculty_Resources/_automation/maintenance/"
                            "validate_scheduled_workflows.py"), True)
        check("is_governance covers tests/maintenance/",
              is_governance("tests/maintenance/test_governance_guard_pins.py"), True)
        check("is_governance covers any .schema.json, wherever it lives",
              is_governance("13_Faculty_Resources/_automation/site_build/"
                            "shipped_pages.schema.json"), True)
        check("is_governance covers the attestation machinery's own modules",
              is_governance("13_Faculty_Resources/_automation/attestation_hash.py"), True)
        check("is_governance excludes site_build registration DATA", is_governance(SHIPPED_REL),
              False)
        check("is_governance excludes the build's own nav wiring",
              is_governance("13_Faculty_Resources/_automation/site_build/build_deploy.py"),
              False)
        check("is_governance excludes tests outside tests/maintenance/",
              is_governance("tests/front-door.test.mjs"), False)
        # question_bank's classifier edges, away from git.
        check("a deleted qbank item is registration",
              qbank_promotions({"items": [{"id": "a", "status": QBANK_ATTESTED}]},
                               {"items": []}), [])
        check("an item born attested is a promotion",
              qbank_promotions({"items": []},
                               {"items": [{"id": "a", "status": QBANK_ATTESTED}]}),
              [("a", "new→attested")])
        check("a draft item edited is registration",
              qbank_promotions({"items": [{"id": "a", "status": "draft", "stem": "x"}]},
                               {"items": [{"id": "a", "status": "draft", "stem": "y"}]}), [])
        check("a field ADDED to an attested item is a promotion",
              qbank_promotions({"items": [{"id": "a", "status": QBANK_ATTESTED}]},
                               {"items": [{"id": "a", "status": QBANK_ATTESTED,
                                           "pearl": "p"}]}),
              [("a", "attested item edited (fields: pearl)")])
        check("a question_bank.json with no `items` list raises",
              raises(lambda: qbank_items({"items": {}})), True)
        # qbank_text's edges: exactly `status` is dropped, nothing else, order kept.
        check("qbank_text drops status and nothing else",
              qbank_text({"v": 1, "items": [{"id": "a", "status": "draft", "stem": "s"}]}),
              {"v": 1, "items": [{"id": "a", "stem": "s"}]})
        check("qbank_text: a status flip projects equal",
              qbank_text({"items": [{"id": "a", "status": "draft", "stem": "s"}]})
              == qbank_text({"items": [{"id": "a", "status": QBANK_ATTESTED, "stem": "s"}]}),
              True)
        check("qbank_text: a reorder is not equal",
              qbank_text({"items": [{"id": "a"}, {"id": "b"}]})
              == qbank_text({"items": [{"id": "b"}, {"id": "a"}]}), False)
        check("qbank_text: a top-level key change is not equal",
              qbank_text({"v": 1, "items": []}) == qbank_text({"v": 2, "items": []}), False)
        check("qbank_text: absent stays absent", qbank_text(None), None)
        check("qbank_text raises on a wrong shape",
              raises(lambda: qbank_text({"items": {}})), True)
        check("a shipped_pages.json with a non-list `pages` raises",
              raises(lambda: shipped_sources({"version": 1, "pages": 7})), True)
    finally:
        ambient.__exit__(None, None, None)
        holder.cleanup()

    if failures:
        for line in failures:
            print("  FAIL %s" % line, file=sys.stderr)
        print("self-test: %d/%d failed" % (len(failures), len(total)), file=sys.stderr)
        return 1
    print("self-test: %d/%d passed" % (len(total), len(total)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
