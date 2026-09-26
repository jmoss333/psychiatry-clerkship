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

    Takes a mapping. Whether a given topic_meta value IS one is `manifest_for_slug`'s
    decision, made once there; do not re-decide it here or in a caller.
    """
    body = {key: value for key, value in record.items() if key != "facultyReview"}
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


# The one registry that is both page text (#783 lists it in the question tools'
# `extraSources`) and an attestation ledger (each item's `status`). Its line in a manifest
# is hashed over the bank WITHOUT any item's `status`: otherwise signing a question would
# drift the two question tools' own attestations, and a build that overlays question
# sign-offs from the attestation ledger (ADR-003) would drift them on every build.
QUESTION_BANK_PATH = "question_bank.json"
QUESTION_BANK_GOVERNANCE_KEYS = frozenset({"status"})


def canonical_question_bank(data: bytes) -> bytes:
    """Canonical bytes of question_bank.json with every item's `status` removed.

    Key-sorted, no whitespace, raw UTF-8 — the same canonical form as a topic_meta record,
    so the JS twin serialises it identically. `retired` is NOT removed: it changes which
    questions ship, which is content. Bytes that are not a JSON object with an `items`
    list are returned unchanged: a malformed bank is `validate_registry_schemas.py`'s to
    fail, and this must stay a total function or a digest would raise where it should
    merely drift.
    """
    try:
        doc = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return data
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list):
        return data
    body = dict(doc)
    body["items"] = [
        {k: v for k, v in item.items() if k not in QUESTION_BANK_GOVERNANCE_KEYS}
        if isinstance(item, dict) else item
        for item in doc["items"]
    ]
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def source_blob_sha(path: str, data: bytes) -> str:
    """The value a manifest line carries for one source: its blob SHA, canonicalised
    first when the source is the question bank (see QUESTION_BANK_PATH)."""
    if path == QUESTION_BANK_PATH:
        return blob_sha(canonical_question_bank(data))
    return blob_sha(data)


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
        # DECISION: pack-case-review-is-registration — an extraSource (the Interview Room pack among
        # them) is hashed INTO its slug's row, so a pack-case edit drifts the row; the pack's own
        # per-case facultyReview blocks are registration, never the claim of record.
        for extra in page.get("extraSources") or []:
            if extra not in paths:
                paths.append(extra)
    return paths


def manifest_for_slug(slug: str, sources: dict[str, bytes], record: dict | None) -> str:
    """The manifest text for one slug: `path <blob sha>` per source, then `topic_meta`.

    `sources` maps each source path to its working-tree bytes. Refuses an empty mapping:
    a manifest over no sources would still produce a plausible-looking digest, which is
    exactly the shape of a check that reports success over nothing.

    A `record` THAT IS NOT A MAPPING COUNTS AS NO RECORD, and this is the one place that
    decides it, so every caller inherits it. Three reasons it is "no record" rather than
    a refusal or a `malformed` classification:

      · a value that is not a mapping is not a record. There is nothing to canonicalise,
        and inventing bytes for it would produce a digest that looks authoritative over
        something nobody can read;
      · `malformed` in this module names a bad contentHash on the LEDGER row, and the
        ledger row is not the thing at fault here. `topic_meta.json` is, and its shape is
        `topic_meta.schema.json`'s to fail (every value must be an object) -- so this
        stays silent rather than misreporting where the defect is;
      · it does not freeze anything. Repairing the record into a real dict adds the
        `topic_meta` line back, which changes the manifest, which drifts the entry into
        re-attestation.

    Same posture as `ledger_hash_report`'s non-dict ledger row: classify rather than
    crash. A traceback out of here reaches `validate_attestation_consistency.py`, whose
    output `governance_digest.mjs` parses and which throws on any stderr at all.
    """
    if not sources:
        raise AttestationHashError(
            f"{slug}: no attested sources — its digest would cover nothing"
        )
    lines = [f"{path} {source_blob_sha(path, sources[path])}" for path in sorted(sources)]
    if isinstance(record, dict):
        lines.append(f"topic_meta {blob_sha(canonical_topic_meta_record(record))}")
    return "\n".join(lines) + "\n"


def digest(slug: str, sources: dict[str, bytes], record: dict | None) -> str:
    """The slug's `contentHash`: the blob SHA of its manifest."""
    return blob_sha(manifest_for_slug(slug, sources, record).encode("utf-8"))


# --------------------------------------------------------------------------------------
# FINGERPRINT v2 — the clinical text (`clinicalHash`)
# --------------------------------------------------------------------------------------
#
# THE RULING (Joshua Moss, MD, 2026-09-26): a change to a page's CITATIONS that leaves its
# clinical claims unchanged keeps the signature. A reviewed row may therefore carry a second
# hash beside `contentHash`: `clinicalHash`, the digest of the same inputs with citation
# apparatus and pure formatting removed. The row is BOUND when either hash matches today's
# text. `contentHash` is unchanged and still checked first, so a row without `clinicalHash`
# behaves exactly as before; only the faculty console writes the new field, at a press.
#
# MEASURED BEFORE IT WAS BUILT (2026-09-26): of the 205 signatures voided on main since
# 2026-09-16, this fingerprint would have kept 3 — three "Key paper" swaps in #813. Every
# correction wave (WP-1..WP-11) changed clinical text and still voids. The value is future
# citation maintenance, not the past.
#
# WHAT COUNTS AS A CITATION — only what can be identified with confidence, so every error is
# "voided when it need not have been", never "kept when it should not have been":
#
#   · a `**Key paper:**` / `**Key papers:**` line (the page's own label for citation apparatus);
#   · a `References` / `Reference` / `Sources` / `Bibliography` / `Works cited` /
#     `Citations` heading, and inside that section a LIST ITEM that carries a year. Everything
#     else in that section
#     stays — the 2026-09-26 survey found crisis-block markers, disclaimers and signature
#     lines trailing reference lists, and an unlabelled line there is not a citation;
#   · a DOI, a PMID/PMCID, a link TARGET or bare URL on doi.org / PubMed / PMC / Europe PMC;
#     every other link target stays (a changed referral, video or `tel:` link is content);
#   · a numeric anchor `[1]`, `[2,3]`, `[4–6 ✓]` and a footnote marker `[^key]`. Footnote
#     DEFINITIONS stay: their text can carry a claim;
#   · a parenthetical author–year citation, `(Smith 2020; Jones et al., 2019)` — piece by
#     piece, and only pieces that are nothing but a citation;
#   · emphasis and heading markers, runs of whitespace, and a space left before punctuation
#     where an inline citation was removed ("risk (Smith 2020)." reads as "risk.");
#   · in the topic_meta record, `evidenceIds` (registry keys — which paper, not what it says)
#     besides `facultyReview`.
#
# Non-Markdown sources (tool HTML/JS, JSON packs, the question bank) hash exactly as in v1:
# their clinical text cannot be separated from their code with the same confidence.
#
# THE RISK THIS ACCEPTS, stated so nobody over-reads a clinical binding: the fingerprint
# exists because of #672, which put fabricated citations on attested pages. A citation-only
# change no longer voids a signature, and the machine citation gate (#694, ruled 2026-09-22)
# is not built yet. So a row bound ONLY by `clinicalHash` is reported separately
# (`bound_clinical`: "citations changed since signing") by check_attestation_hashes.py and the
# console, until that gate can check the citations themselves.
#
# PARITY: faculty-console/attestation-hash.mjs reproduces every rule below byte for byte
# (tests/attestation-hash-parity.test.mjs). Hence the deliberately plain regex dialect:
# explicit ASCII classes instead of \w \d \s, `[^\n]` instead of `.`, no case-insensitive
# flag, and every anchored rule applied to one line at a time — each of those differs
# between Python's `re` and JavaScript's RegExp in some corner, and a corner is enough.

CLINICAL_FINGERPRINT = "fingerprint clinical/1"
CLINICAL_RECORD_EXCLUDED_KEYS = frozenset({"facultyReview", "evidenceIds"})

_REFERENCE_SECTION_NAMES = frozenset(
    {"references", "reference", "sources", "bibliography", "works cited", "citations"}
)
_HEADING = re.compile(r"^(#{1,6})[ \t]+([^\n]*)$")
_HEADING_MARKER = re.compile(r"^[ \t]*#{1,6}[ \t]+")
_LIST_ITEM = re.compile(r"^[ \t]*(?:[-*+]|[0-9]+[.)])[ \t]+")
_YEAR = re.compile(r"(?:^|[^0-9])(?:19|20)[0-9][0-9](?![0-9])")
_KEY_PAPER_LINE = re.compile(r"^[ \t]*(?:[-*+][ \t]+)?\*\*[Kk]ey [Pp]apers?:\*\*")
_FOOTNOTE_REF = re.compile(r"\[\^[^\]\n]+\]")
_CITATION_HOST = (
    r"https?://(?:(?:dx\.)?doi\.org/|(?:pubmed|pmc)\.ncbi\.nlm\.nih\.gov/"
    r"|www\.ncbi\.nlm\.nih\.gov/(?:pmc|pubmed)/|europepmc\.org/)"
)
_CITATION_LINK_TARGET = re.compile(r"\]\(" + _CITATION_HOST + r"[^) \t\n]*(?:[ \t]+\"[^\"\n]*\")?\)")
_CITATION_URL = re.compile(r"<?" + _CITATION_HOST + r"[^ \t\n<>)\]]*>?")
_DOI = re.compile(r"(?<![A-Za-z0-9_])[Dd][Oo][Ii]:[ \t]*10\.[0-9]{4,9}/[^ \t\n;,)\]]+")
_PMID = re.compile(
    r"(?<![A-Za-z0-9_])(?:PMID:?[ \t]*[0-9]+|PMCID:?[ \t]*PMC[0-9]+|PMC[0-9]{4,})(?![A-Za-z0-9_])"
)
_NUMERIC_ANCHOR = re.compile(r"\[[0-9]+(?:[ \t]*[,–-][ \t]*[0-9]+)*(?:[ \t]*✓)?\](?!\()")
_PAREN = re.compile(r"\(([^()\n]*)\)")
_NAME_LETTERS = "A-Za-zÀ-ÖØ-öø-ÿ"
_NAME = "[A-Z][" + _NAME_LETTERS + "'’-]+"
_CITE_PIECE = re.compile(
    r"^(?:see(?: also)?|e\.g\.,?|cf\.)?[ \t]*" + _NAME
    + r"(?:[ \t]+(?:et al\.?|(?:and|&)[ \t]+" + _NAME + r"))?,?"
    + r"(?:[ \t]+[*_]?[A-Z][" + _NAME_LETTERS + r"0-9 .&:-]*[*_]?,?)?"
    + r"[ \t]+(?:19|20)[0-9][0-9][a-z]?$"
)
_STRONG = re.compile(r"\*\*|__")
_EM_OPEN = re.compile(r"(?<![A-Za-z0-9_*])[*_](?=[^ \t\n*_])")
_EM_CLOSE = re.compile(r"(?<=[^ \t\n*_])[*_](?![A-Za-z0-9_*])")
_EMPTY_PARENS = re.compile(r"\([ \t]*[;,]?[ \t]*\)")
_WHITESPACE = re.compile(r"[ \t\n\r\f\v]+")
_SPACE_BEFORE_PUNCTUATION = re.compile(r" +(?=[.,;:!?)])")
_EDGE_BLANKS = re.compile(r"^[ \t]+|[ \t]+$")


def _strip_blanks(text: str) -> str:
    """Trim spaces and tabs only — str.strip() and String.trim() disagree on the rest."""
    return _EDGE_BLANKS.sub("", text)


def _section_name(heading_text: str) -> str:
    """A heading's text as a section name: markers off, ASCII-lowercased, numbering off."""
    name = _strip_blanks(re.sub(r"[*_`]", "", heading_text))
    name = _strip_blanks(re.sub(r"[ \t#]*$", "", name))
    name = _strip_blanks(re.sub(r":+$", "", name))
    name = re.sub(r"[A-Z]", lambda m: m.group(0).lower(), name)
    return re.sub(r"^[0-9]+[.)]?[ \t]+", "", name)


def _clinical_lines(text: str) -> str:
    """The line-anchored rules: reference-list entries, Key-paper lines, heading markers."""
    kept, section_level = [], 0
    for line in text.split("\n"):
        heading = _HEADING.match(line)
        if heading:
            level = len(heading.group(1))
            if section_level and level <= section_level:
                section_level = 0
            if not section_level and _section_name(heading.group(2)) in _REFERENCE_SECTION_NAMES:
                section_level = level
                continue
        elif section_level and _LIST_ITEM.match(line) and _YEAR.search(line):
            continue
        if _KEY_PAPER_LINE.match(line):
            continue
        kept.append(_HEADING_MARKER.sub("", line))
    return "\n".join(kept)


def _strip_parenthetical_citations(text: str) -> str:
    def replace(match):
        pieces = [_strip_blanks(piece) for piece in match.group(1).split(";")]
        pieces = [piece for piece in pieces if piece]
        kept = [piece for piece in pieces if not _CITE_PIECE.match(piece)]
        if len(kept) == len(pieces):
            return match.group(0)
        return "(" + "; ".join(kept) + ")" if kept else ""

    return _PAREN.sub(replace, text)


def clinical_markdown(text: str) -> str:
    """The clinical text of a Markdown page: its words with citation apparatus removed.

    Total over any str. Every rule is listed, with its reason, above CLINICAL_FINGERPRINT.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _clinical_lines(text)
    text = _FOOTNOTE_REF.sub("", text)
    text = _CITATION_LINK_TARGET.sub("]", text)
    text = _CITATION_URL.sub("", text)
    text = _DOI.sub("", text)
    text = _PMID.sub("", text)
    text = _NUMERIC_ANCHOR.sub("", text)
    text = _strip_parenthetical_citations(text)
    text = _STRONG.sub("", text)
    text = _EM_OPEN.sub("", text)
    text = _EM_CLOSE.sub("", text)
    text = _EMPTY_PARENS.sub("", text)
    text = _WHITESPACE.sub(" ", text)
    return _strip_blanks(_SPACE_BEFORE_PUNCTUATION.sub("", text))


def is_clinical_markdown_source(path: str) -> bool:
    """Whether a source is hashed over its clinical text (Markdown) rather than its bytes."""
    return path.endswith(".md")


def clinical_source_sha(path: str, data: bytes) -> str:
    """A clinical manifest line's value for one source.

    Markdown: the blob sha of its clinical text. Anything else — and Markdown that is not
    valid UTF-8, which has no text to normalise — exactly the v1 value (`source_blob_sha`).
    """
    if is_clinical_markdown_source(path):
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            return source_blob_sha(path, data)
        return blob_sha(clinical_markdown(text).encode("utf-8"))
    return source_blob_sha(path, data)


def canonical_clinical_record(record: dict) -> bytes:
    """A topic_meta record's canonical bytes without `facultyReview` or `evidenceIds`."""
    body = {key: value for key, value in record.items()
            if key not in CLINICAL_RECORD_EXCLUDED_KEYS}
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def clinical_manifest_for_slug(slug: str, sources: dict[str, bytes], record: dict | None) -> str:
    """The clinical manifest: a version line, then v1's shape over the clinical values.

    The first line keeps a clinical digest from ever equalling a v1 digest. The same
    refusals and the same "not a mapping is no record" decision as `manifest_for_slug`.
    """
    if not sources:
        raise AttestationHashError(
            f"{slug}: no attested sources — its digest would cover nothing"
        )
    lines = [CLINICAL_FINGERPRINT]
    lines += [f"{path} {clinical_source_sha(path, sources[path])}" for path in sorted(sources)]
    if isinstance(record, dict):
        lines.append(f"topic_meta {blob_sha(canonical_clinical_record(record))}")
    return "\n".join(lines) + "\n"


def clinical_digest(slug: str, sources: dict[str, bytes], record: dict | None) -> str:
    """The slug's `clinicalHash`: the blob SHA of its clinical manifest."""
    return blob_sha(clinical_manifest_for_slug(slug, sources, record).encode("utf-8"))


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
         "bound_clinical": {slug: {"stored","actual","clinical","at"}},
         "unbound": [...], "malformed": [...], "unresolvable": {slug: [missing paths]},
         "legacy": [...], "unshipped_unlisted": [...]}

    A row is bound when its `contentHash` matches today's inputs, OR when it carries a
    `clinicalHash` that matches today's clinical text (fingerprint v2, above). A row bound
    only the second way is in `bound` AND in `bound_clinical`, so every consumer that asks
    "is it bound?" is unchanged while the ones that must say "its citations changed since it
    was signed" can. A `clinicalHash` that is present but not 40-hex is `malformed`, like a
    bad `contentHash`: only the console writes either, so a bad one is a hand edit.
    """
    root = Path(root)
    report: dict = {
        "bound": {},
        "bound_clinical": {},
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
        clinical_stored = entry.get("clinicalHash")
        if clinical_stored is not None and (
            not isinstance(clinical_stored, str) or not HEX40.fullmatch(clinical_stored)
        ):
            report["malformed"].append(slug)
            continue

        missing = [path for path in paths if not (root / path).is_file()]
        if missing:
            report["unresolvable"][slug] = missing
            continue

        sources = _read_sources(root, paths)
        manifest = manifest_for_slug(slug, sources, topic_meta.get(slug))
        actual = blob_sha(manifest.encode("utf-8"))
        clinical_actual = (
            clinical_digest(slug, sources, topic_meta.get(slug))
            if clinical_stored is not None and actual != stored else None
        )
        if actual == stored:
            report["bound"][slug] = stored
        elif clinical_stored is not None and clinical_actual == clinical_stored:
            report["bound"][slug] = stored
            report["bound_clinical"][slug] = {
                "stored": stored,
                "actual": actual,
                "clinical": clinical_stored,
                "at": entry.get("at"),
            }
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
