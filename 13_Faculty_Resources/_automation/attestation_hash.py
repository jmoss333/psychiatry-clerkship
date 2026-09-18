#!/usr/bin/env python3
"""The digest of a page's attested inputs — one definition, shared by every reader.

WHY THIS EXISTS: on 2026-09-16 two agent-authored PRs, #640 and #672, added 85 citations
across pages that faculty had already attested; 53 of the 74 that could be checked were
misattributed or fabricated (both PRs were reverted in #687/#688). The attestations on
those pages still said `reviewed`, by a named clinician, on a date — and stayed that way,
because nothing in the repository bound an attestation to the text it attested. A review
recorded a person, a date and a risk level, but never an answer to "reviewed WHAT?", so
rewriting the page afterwards cost nothing and showed nowhere.

THE RULE. A ledger entry's `contentHash` is the git blob SHA of a manifest naming every
input that review covered, one line each, itself a blob SHA:

    a.md 4a58007052a65fbc2fc3f910f2855f45a4058e74
    topic_meta e51494b9a628601e078505913ea6ff67d2039bad

- the source file(s) the slug ships from (`source` plus any `extraSources` in
  `site_build/shipped_pages.json`), sorted by path;
- the slug's `topic_meta.json` record, if it has one, canonicalised with `facultyReview`
  removed — governance state is not content, so attesting a page must not depend on the
  attestation block that records the attesting.

Every value is reproducible by hand, which is the point of choosing a git blob SHA over a
bare sha256: `printf '%s' "$manifest" | git hash-object --stdin` re-derives the digest, and
each line re-derives with `git hash-object --no-filters <path>` — the digest covers the bytes
on disk, so a clean filter (`core.autocrlf`, LFS) would make a plain `git hash-object <path>`
disagree with it. It also lets the faculty console
compute the whole manifest from ONE recursive-tree API call, with no file fetches.
Collision resistance is irrelevant here — the threat is drift, not forgery.

SCOPE, stated so nobody over-reads a `bound` result: the digest covers the page's own
sources and its topic_meta record. It does not cover build-time injections (the crisis
block, pairings) or anything downstream of them.

Deliberately stdlib-only, importing nothing from this repository: `surface_governance.py`
consumes it and itself imports nothing from `site_build/`, and a JS twin
(`faculty-console/attestation-hash.mjs`) must reproduce these bytes exactly.
"""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path

# The sentinel a pending entry carries in `by`; not a signature.
PENDING_SENTINEL = "Pending faculty review"

# The reason a drifted entry renders with. Byte-identical in the JS twin; parity-pinned.
STALE_REASON = "Content changed since faculty review on {at}; awaiting re-attestation."

# A git blob SHA-1, lowercase. Anything else in `contentHash` is a hand edit, not a hash.
# Matched with fullmatch(), because `$` alone also matches before a trailing newline.
HEX40 = re.compile(r"^[a-f0-9]{40}$")

# The faculty console's git identity; the only actor that may write a hash after the
# one-time 2026-09 backfill.
CONSOLE_IDENTITY = "faculty@clerkship.local"

# Reviewed rows for pages no site ships. MAY ONLY SHRINK; each needs a reason.
LEDGER_ONLY_LEGACY = {
    "learning-path.html": "retired 2026-08; row kept for the receipt history",
    "qbank-attest.html": "deprecated side-door page (PR #351); never shipped to a learner site",
    "review-attest.html": "deprecated side-door page (PR #351); never shipped to a learner site",
}

# Error classes project_effective_ledger refuses to render, in the order it reports them.
# Each is a shape only a hand edit produces; drift ("stale") is not among them, because
# drift is the normal in-flight state of any edit to a reviewed page.
_REFUSALS = (
    (
        "unbound",
        "{slug}: unbound — reviewed with no contentHash; bind it through the faculty console",
    ),
    ("malformed", "{slug}: malformed contentHash — expected a 40-hex git blob SHA"),
    ("unresolvable", "{slug}: unresolvable — an attested source is missing from the tree"),
    (
        "unshipped_unlisted",
        "{slug}: unshipped and unlisted — reviewed but no site ships it and it is not on "
        "LEDGER_ONLY_LEGACY",
    ),
)


class AttestationHashError(ValueError):
    """A ledger entry cannot be bound to the text it attests."""


def blob_sha(data: bytes) -> str:
    """The git blob SHA of `data` — identical to `git hash-object --stdin`."""
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def canonical_topic_meta_record(record: dict) -> bytes:
    """Canonical bytes of a topic_meta record: key-sorted, no whitespace, raw UTF-8.

    `facultyReview` is dropped: it records the act of attesting, so including it would
    make every attestation invalidate itself. `ensure_ascii=False` keeps non-ASCII as
    real UTF-8 rather than `\\u` escapes, which is what the JS twin produces.
    """
    body = {key: value for key, value in record.items() if key != "facultyReview"}
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def sources_for_slug(shipped_doc: dict, slug: str) -> list[str]:
    """Every source path the slug ships from: `source` first, then `extraSources`.

    Returns [] when no site ships the slug. Unlike `export_curriculum_review`'s
    `_slug_source_map`, where a resident override WINS, the digest takes the UNION: a
    change to either source of a two-source slug must drift the attestation.
    """
    paths: list[str] = []
    for page in shipped_doc.get("pages", []):
        if page.get("slug") != slug:
            continue
        source = page.get("source")
        if source and source not in paths:
            paths.append(source)
        for extra in page.get("extraSources") or []:
            if extra not in paths:
                paths.append(extra)
    return paths


def manifest_for_slug(slug: str, sources: dict[str, bytes], record: dict | None) -> str:
    """The manifest text for one slug: `path <blob sha>` per source, then `topic_meta`.

    `sources` maps each source path to its working-tree bytes. Refuses an empty mapping:
    a manifest over no sources would still produce a plausible-looking digest, which is
    exactly the shape of a check that reports success over nothing.
    """
    if not sources:
        raise AttestationHashError(
            f"{slug}: no attested sources — its digest would cover nothing"
        )
    lines = [f"{path} {blob_sha(sources[path])}" for path in sorted(sources)]
    if record is not None:
        lines.append(f"topic_meta {blob_sha(canonical_topic_meta_record(record))}")
    return "\n".join(lines) + "\n"


def digest(slug: str, sources: dict[str, bytes], record: dict | None) -> str:
    """The slug's `contentHash`: the blob SHA of its manifest."""
    return blob_sha(manifest_for_slug(slug, sources, record).encode("utf-8"))


def _read_sources(root: Path, paths: list[str]) -> dict[str, bytes]:
    """Working-tree bytes for each path; raises FileNotFoundError on the first absentee."""
    return {path: (Path(root) / path).read_bytes() for path in paths}


def digest_from_tree(root, shipped_doc: dict, topic_meta: dict, slug: str) -> str:
    """The slug's digest computed from the working tree under `root`.

    Raises FileNotFoundError if an attested source is missing — never a digest over the
    files that happen to still be there. Raises AttestationHashError when no site ships
    the slug at all: `sources_for_slug` returns [] and a digest over nothing would look
    exactly like a digest over something.
    """
    sources = _read_sources(Path(root), sources_for_slug(shipped_doc, slug))
    return digest(slug, sources, topic_meta.get(slug))


def ledger_hash_report(root, ledger: dict, shipped_doc: dict, topic_meta: dict) -> dict:
    """Classify every REVIEWED ledger entry against the current tree.

    Pending entries are ignored: they claim nothing about content. Returns

        {"bound": {slug: hash}, "stale": {slug: {"stored","actual","at","manifest"}},
         "unbound": [...], "malformed": [...], "unresolvable": {slug: [missing paths]},
         "legacy": [...], "unshipped_unlisted": [...]}
    """
    root = Path(root)
    report: dict = {
        "bound": {},
        "stale": {},
        "unbound": [],
        "malformed": [],
        "unresolvable": {},
        "legacy": [],
        "unshipped_unlisted": [],
    }
    for slug in sorted(ledger):
        entry = ledger[slug]
        if not isinstance(entry, dict):
            # Not a record at all — a hand edit, not drift. Classified rather than crashed,
            # so one bad row reports alongside the rest instead of aborting the whole report.
            report["malformed"].append(slug)
            continue
        if entry.get("status") != "reviewed":
            continue

        paths = sources_for_slug(shipped_doc, slug)
        if not paths:
            key = "legacy" if slug in LEDGER_ONLY_LEGACY else "unshipped_unlisted"
            report[key].append(slug)
            continue

        stored = entry.get("contentHash")
        if stored is None:
            report["unbound"].append(slug)
            continue
        # An empty string is malformed, not unbound: the key is there, so something wrote a
        # hash and got it wrong. Unbound means nobody ever bound it, which the backfill fixes;
        # these two want different responses, so they are different classes.
        if not isinstance(stored, str) or not HEX40.fullmatch(stored):
            report["malformed"].append(slug)
            continue

        missing = [path for path in paths if not (root / path).is_file()]
        if missing:
            report["unresolvable"][slug] = missing
            continue

        manifest = manifest_for_slug(slug, _read_sources(root, paths), topic_meta.get(slug))
        actual = blob_sha(manifest.encode("utf-8"))
        if actual == stored:
            report["bound"][slug] = stored
        else:
            report["stale"][slug] = {
                "stored": stored,
                "actual": actual,
                "at": entry.get("at"),
                "manifest": manifest,
            }
    return report


def project_effective_ledger(root, ledger: dict, shipped_doc: dict, topic_meta: dict):
    """The ledger as it should RENDER: a drifted entry reads pending, not reviewed.

    Returns `(effective_ledger, report)`. The input is never mutated — the source ledger
    is the faculty's record and only the console writes it. A stale entry keeps its `at`
    (the review really happened, on that date, over the older text) and its stored hash
    (the evidence of what drifted); only `status`, `by` and `reason` change.

    Raises AttestationHashError for any class a hand edit produces, naming the first
    offending slug: those are broken records rather than drift, and rendering them at all
    would be a guess about what a clinician meant. The full set — and, for an unresolvable
    entry, which paths are missing — is in the report a caller gets from
    `ledger_hash_report` directly.
    """
    report = ledger_hash_report(root, ledger, shipped_doc, topic_meta)
    for key, template in _REFUSALS:
        offenders = sorted(report[key])
        if offenders:
            raise AttestationHashError(template.format(slug=offenders[0]))

    effective = deepcopy(ledger)
    for slug, drift in report["stale"].items():
        entry = effective[slug]
        entry["status"] = "pending"
        entry["by"] = PENDING_SENTINEL
        entry["reason"] = STALE_REASON.format(at=drift["at"])
    return effective, report


def project_topic_meta_faculty_review(topic_meta: dict, stale_slugs) -> int:
    """Demote the `facultyReview` block of every stale slug IN PLACE; return how many.

    For the BUILT copy of topic_meta.json only — never the source, which is the faculty's
    own record. Per D6 `reviewer` and `lastReviewed` are kept: the review did happen, and
    `fd_data.js` reads only `status`. A slug with no `facultyReview` block is left alone.
    """
    projected = 0
    for slug in stale_slugs:
        record = topic_meta.get(slug)
        if not isinstance(record, dict):
            continue
        block = record.get("facultyReview")
        if not isinstance(block, dict):
            continue
        block["status"] = "pending"
        projected += 1
    return projected
