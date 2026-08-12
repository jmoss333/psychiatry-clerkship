#!/usr/bin/env python3
"""Canonical surface-governance contract.

Owns the single source of truth for review/risk state
(13_Faculty_Resources/reviewed.json, validated against
13_Faculty_Resources/reviewed.schema.json) and the sanitized, deterministic
artifacts derived from it for each learner site:

  - load_validated_ledger()  -- read + validate the ledger (schema + dates)
  - build_site_document()    -- flatten nav + ledger into one sanitized doc
  - annotate_navigation()    -- copy governance triplets onto a nav tree
  - apply_tool_status()      -- inject a status block into shipped tool HTML
  - write_site_document()    -- deterministic, atomic JSON artifact writes

Also owns a non-mutating risk-classification review worksheet, generated
from the CURRENT (pre-migration) ledger for a human faculty reviewer to
confirm or override (see .superpowers/sdd/2026-07-26-risk-aware-publishing-
warnings/task-6-brief.md, Steps 1-2):

  - build_risk_proposal()    -- propose a risk{kind,level} for every ledger
                                 slug, plus every nav slug with no record
  - write_risk_proposal()    -- deterministic, atomic JSON artifact writes
  - CLI: --write-proposal PATH (never writes reviewed.json)

Nothing here mutates the source ledger. Applying a faculty-confirmed risk
classification to reviewed.json itself is a separate, human-gated step
(Steps 3-4 of the brief above) -- out of scope for this module's own code.
"""

import argparse
import ast
import json
import os
import re
import sys
import tempfile
from copy import deepcopy
from datetime import date
from html import escape
from pathlib import Path

from jsonschema import Draft7Validator


REVIEWED_RELATIVE = Path("13_Faculty_Resources/reviewed.json")
SCHEMA_RELATIVE = Path("13_Faculty_Resources/reviewed.schema.json")

# Fixed application copy for high-risk pending items — never paraphrase these;
# {kind} is "page" or "tool", {risk} is the risk kind (clinical/legal/formulary).
HIGH_CLINICAL = (
    "This {kind} includes high-risk {risk} teaching that has not completed "
    "faculty attestation. Verify decisions with your supervising clinician."
)
HIGH_LOCAL = (
    "This {kind} includes institution-specific teaching that has not completed "
    "faculty attestation. Verify current institutional policy or workflow before acting."
)
_HIGH_CLINICAL_KINDS = frozenset({"clinical", "legal", "formulary"})
_LEDGER_DATE_FIELDS = ("at", "evidenceThrough")

STATUS_START = "<!-- SURFACE-GOVERNANCE:START -->"
STATUS_END = "<!-- SURFACE-GOVERNANCE:END -->"
_STATUS_BLOCK_PATTERN = re.compile(
    re.escape(STATUS_START) + r".*?" + re.escape(STATUS_END), re.DOTALL
)
_STATUS_STYLE_PATTERN = re.compile(
    r'<style id="surface-governance-style">.*?</style>', re.DOTALL
)
_STATUS_SCRIPT_PATTERN = re.compile(
    r'<script id="surface-governance-script">.*?</script>', re.DOTALL
)
_HEAD_CLOSE_PATTERN = re.compile(r"</head\s*>", re.IGNORECASE)
_BODY_OPEN_PATTERN = re.compile(r"<body(?:\s[^>]*)?>", re.IGNORECASE)

# Self-contained so injection never depends on a tool already linking the
# shared clinical-warm.css — dark values follow that file's own
# [data-theme="dark"] convention rather than a prefers-color-scheme query,
# so an explicit in-page theme toggle always wins over the OS setting.
_STATUS_STYLE = (
    '<style id="surface-governance-style">'
    ".surface-governance-direct{box-sizing:border-box;margin:0;padding:.75rem 1rem;"
    "font:600 1rem/1.4 system-ui,-apple-system,sans-serif}"
    ".surface-governance-direct span{display:block;font-weight:500}"
    ".surface-governance-direct p{margin:.35rem 0 0;font-weight:500}"
    ".surface-governance-pending-high{border:3px solid #8b2f24;background:#fff2e8;"
    "color:#3d1812}"
    ".surface-governance-pending{border-bottom:2px solid #9a6b22;background:#fff8e6;"
    "color:#3f2c0d}"
    ".surface-governance-receipt{border-bottom:1px solid #5aad8e;background:#eef7f2;"
    "color:#1d3b2c;font-weight:500}"
    '[data-theme="dark"] .surface-governance-pending-high{border-color:#d46858;'
    "background:#3d1f1a;color:#f5ddd6}"
    '[data-theme="dark"] .surface-governance-pending{border-bottom-color:#c4a45c;'
    "background:#3a301c;color:#f2e6c9}"
    '[data-theme="dark"] .surface-governance-receipt{border-bottom-color:#5aad8e;'
    "background:#1e2f27;color:#cdeadd}"
    "html.governed-embed .surface-governance-direct{display:none!important}"
    "</style>"
)
# Defensive by design: a failure inside the try must never prevent the
# warning from showing. Worst case is a duplicate warning inside an iframe
# that meant to hide it — never a warning silently hidden somewhere it
# shouldn't be.
_STATUS_SCRIPT = (
    '<script id="surface-governance-script">'
    "(function(){try{"
    "var params=new URLSearchParams(window.location.search);"
    "if(window.self!==window.top&&params.get('governed')==='1'){"
    "document.documentElement.classList.add('governed-embed');"
    "}}catch(error){}})();"
    "</script>"
)


class SurfaceGovernanceError(ValueError):
    """Raised when surface governance data or output cannot be trusted."""


# ---------------------------------------------------------------------------
# Ledger validation
# ---------------------------------------------------------------------------

def _load_json(path: Path, label: str):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SurfaceGovernanceError(f"{label}: unreadable JSON") from error


def _error_path(error) -> list:
    """Reconstruct the exact slug/field path a jsonschema error is about.

    "required", "additionalProperties", and "not" errors are all reported
    at the *container* level (e.g. the whole record) rather than at the
    specific field that is wrong, so the raw error would only say
    '/synthetic.md' instead of '/synthetic.md/risk'. Recover the field
    deterministically so the message can point at it without ever
    including the rejected value itself.
    """
    path = list(error.absolute_path)
    if error.validator == "required" and isinstance(error.instance, dict):
        missing = sorted(set(error.validator_value) - set(error.instance))
        if missing:
            path.append(missing[0])
    elif error.validator == "additionalProperties" and isinstance(error.instance, dict):
        allowed = set(error.schema.get("properties", {}))
        unexpected = sorted(set(error.instance) - allowed)
        if unexpected:
            path.append(unexpected[0])
    elif error.validator == "not" and isinstance(error.instance, dict):
        # Two distinct "not" rules live in the schema now; tell them apart by
        # which property the failed sub-schema constrains, never by
        # inspecting the record's own values (so nothing gets echoed).
        not_properties = (
            error.validator_value.get("properties", {})
            if isinstance(error.validator_value, dict)
            else {}
        )
        if "risk" in not_properties:
            # 2026-08-12 faculty ruling: risk kind "general" at level "high"
            # is forbidden outright.
            path.append("risk")
        else:
            # "a reviewed record can't carry the pending-reviewer label" —
            # it is always about "by".
            path.append("by")
    return path


def _pointer(path) -> str:
    return "/" + "/".join(str(part).replace("~", "~0").replace("/", "~1") for part in path)


def _raise_invalid(path) -> None:
    slug = str(path[0]) if path else "<root>"
    raise SurfaceGovernanceError(f"reviewed.json: {slug} invalid at {_pointer(path)}")


def load_validated_ledger(root: Path) -> dict[str, dict]:
    """Load and validate the canonical review ledger from a repository root.

    Validates against reviewed.schema.json (Draft-07) and then, in an
    explicit second pass, that every date field is a real calendar date not
    in the future. Raises SurfaceGovernanceError (never a bare jsonschema
    exception) whose message identifies the slug and JSON-pointer field but
    never echoes the rejected value. Returns a fresh dict; the ledger itself
    is never mutated by this module.
    """
    root = Path(root)
    ledger = _load_json(root / REVIEWED_RELATIVE, "reviewed.json")
    schema = _load_json(root / SCHEMA_RELATIVE, "reviewed.schema.json")
    try:
        Draft7Validator.check_schema(schema)
    except Exception as error:
        raise SurfaceGovernanceError(
            "reviewed.schema.json: invalid Draft-07 schema"
        ) from error

    errors = sorted(
        Draft7Validator(schema).iter_errors(ledger),
        key=lambda error: tuple(str(part) for part in _error_path(error)),
    )
    if errors:
        _raise_invalid(_error_path(errors[0]))

    today = date.today()
    for slug in sorted(ledger):
        entry = ledger[slug]
        for field in _LEDGER_DATE_FIELDS:
            value = entry.get(field)
            if value is None:
                continue
            try:
                parsed = date.fromisoformat(value)
            except ValueError:
                _raise_invalid([slug, field])
            if parsed > today:
                _raise_invalid([slug, field])
    return ledger


# ---------------------------------------------------------------------------
# Presentation normalization
# ---------------------------------------------------------------------------

def warning_copy(kind: str, risk_kind: str, risk_level: str, reason: str) -> str:
    """The learner-facing warning for a pending item.

    High-risk clinical/legal/formulary and local-policy items get the fixed
    application copy (never paraphrased); everything else falls back to the
    ledger's own reason, which is always faculty-authored free text.
    """
    if risk_level == "high":
        if risk_kind == "local-policy":
            return HIGH_LOCAL.format(kind=kind)
        if risk_kind in _HIGH_CLINICAL_KINDS:
            return HIGH_CLINICAL.format(kind=kind, risk=risk_kind)
    # A "general" kind at "high" level would fall through to here (raw
    # reason copy, no fixed safety copy) -- but as of the 2026-08-12 faculty
    # ruling, reviewed.schema.json's cross-field "not" clause makes that
    # combination invalid, so load_validated_ledger() rejects any record
    # carrying it before this function ever sees it. This branch is
    # therefore unreachable for schema-validated records. Left in place
    # (not deleted) as defense in depth: it still fires correctly for
    # every OTHER non-high-risk combination (general/low, clinical/moderate,
    # etc.), and a caller that ever passes an unvalidated entry gets a safe
    # fallback (the raw reason) rather than a crash.
    return reason


def presentation_entry(slug: str, kind: str, entry: dict) -> dict:
    """Strip one internal ledger record down to what a learner site may show."""
    risk_kind = entry["risk"]["kind"]
    risk_level = entry["risk"]["level"]
    result = {
        "kind": kind,
        "status": entry["status"],
        "riskKind": risk_kind,
        "riskLevel": risk_level,
        "reviewer": entry["by"],
        "reviewedAt": entry["at"],
    }
    if entry["status"] == "pending":
        result["reason"] = entry["reason"]
        result["warning"] = warning_copy(kind, risk_kind, risk_level, entry["reason"])
    return result


# ---------------------------------------------------------------------------
# Site document + navigation annotation
# ---------------------------------------------------------------------------

def _iter_nav_items(value):
    """Yield every {'f': slug, 'k': kind, ...} leaf under a nav tree.

    nav.json is a list of sections, each with a flat "items" list, but this
    walks any dict/list shape so it keeps working regardless of nesting —
    it does not care whether an item or its section is "hidden": hidden
    items still ship, they are just not linked from the sidebar.
    """
    if isinstance(value, list):
        for child in value:
            yield from _iter_nav_items(child)
    elif isinstance(value, dict):
        if isinstance(value.get("f"), str) and isinstance(value.get("k"), str):
            yield value
        for child in value.values():
            if isinstance(child, (dict, list)):
                yield from _iter_nav_items(child)


def _surface_kind(nav_kind: str) -> str:
    if nav_kind == "md":
        return "page"
    if nav_kind == "tool":
        return "tool"
    raise SurfaceGovernanceError(f"surface governance: invalid navigation kind {nav_kind!r}")


def build_site_document(ledger: dict, nav: list, site: str) -> dict:
    """Build the sanitized, deterministic governance document for one site.

    Flattens every visible and hidden nav item, resolves each slug's surface
    kind ("md" -> "page", "tool" -> "tool"), and rejects:
      - an unrecognized site name;
      - the same slug appearing under two different kinds;
      - any shipped slug with no ledger record.
    Only slugs that actually appear in the nav are included — a ledger
    record for something no longer shipped is silently excluded, not an
    error. Item keys are sorted for deterministic output.
    """
    if site not in {"ms3", "resident"}:
        raise SurfaceGovernanceError("surface governance: invalid site")

    kinds: dict = {}
    for item in _iter_nav_items(nav):
        slug = item["f"]
        kind = _surface_kind(item["k"])
        prior = kinds.get(slug)
        if prior is not None and prior != kind:
            raise SurfaceGovernanceError(
                f"surface governance: {slug} has conflicting kinds"
            )
        kinds[slug] = kind

    for slug in sorted(kinds):
        if slug not in ledger:
            raise SurfaceGovernanceError(
                f"surface governance: {slug} missing ledger record"
            )

    return {
        "schemaVersion": 1,
        "site": site,
        "items": {
            slug: presentation_entry(slug, kinds[slug], ledger[slug])
            for slug in sorted(kinds)
        },
    }


def annotate_navigation(nav: list, document: dict) -> list:
    """Return a nav copy with a compact governance triplet on every item.

    Never mutates the input nav, and never touches titles, slugs, kind, or
    hidden flags — only adds a "governance" key alongside them.
    """
    items = document.get("items") if isinstance(document, dict) else None
    if not isinstance(items, dict):
        raise SurfaceGovernanceError("surface governance: invalid site document")

    annotated = deepcopy(nav)
    for item in _iter_nav_items(annotated):
        slug = item["f"]
        entry = items.get(slug)
        if entry is None:
            raise SurfaceGovernanceError(
                f"surface governance: {slug} missing site record"
            )
        item["governance"] = {
            "status": entry["status"],
            "riskKind": entry["riskKind"],
            "riskLevel": entry["riskLevel"],
        }
    return annotated


# ---------------------------------------------------------------------------
# Direct-tool HTML status injection
# ---------------------------------------------------------------------------

def _direct_status_markup(entry: dict) -> str:
    """Render the injected status block for one direct (non-embedded) tool open.

    Mirrors spa_index.html's renderGovernanceNotice() decision (regression-
    tested in tests/surface-governance-ui.test.mjs): only the two PENDING
    states carry live-region semantics. A reviewed receipt renders on
    nearly every one of the ~48 shipped tools, so giving it a role would
    make it a second, systemic announcer on almost every direct-tool
    open -- never justified for a routine low-emphasis receipt, and it
    collided in practice with tools (sp-interview.html) that own real
    live-announcer machinery of their own.

    The pending/low/moderate status div keeps role="status" (still the
    correct semantic marker for a screen-reader user browsing by role)
    but adds aria-live="off": this block is injected at BUILD time, so it
    is part of the tool's static initial markup, never a later DOM
    mutation -- there is no runtime "change" for a live region to
    announce, so leaving it live buys nothing and only risks competing
    with a tool's own dynamic announcer, exactly as it did here. This is
    the same role-stays/aria-live="off" pattern sp-interview.html itself
    already uses on its own transcript region (role="log"). Pending/high
    stays a fully live role="alert": it is the one case meant to actually
    interrupt on open, and nothing here found a reason to weaken that.
    """
    risk_label = (
        f"{entry['riskKind'].replace('-', ' ').title()} · "
        f"{entry['riskLevel'].title()} risk"
    )
    if entry["status"] == "pending" and entry["riskLevel"] == "high":
        return (
            '<section class="surface-governance-direct surface-governance-pending-high" '
            'role="alert" tabindex="-1">'
            "<strong>Pending faculty review</strong>"
            f"<span>{escape(risk_label)}</span>"
            f"<p>{escape(entry['warning'])}</p>"
            f"<p>{escape(entry['reason'])}</p>"
            "</section>"
        )
    if entry["status"] == "pending":
        return (
            '<div class="surface-governance-direct surface-governance-pending" '
            'role="status" aria-live="off">'
            "<strong>Pending faculty review</strong>"
            f"<span>{escape(risk_label)}</span>"
            f"<span>{escape(entry['reason'])}</span>"
            "</div>"
        )
    receipt = f"Reviewed by {entry['reviewer']} on {entry['reviewedAt']}"
    return (
        '<div class="surface-governance-direct surface-governance-receipt">'
        f"{escape(receipt)}"
        "</div>"
    )


def _strip_prior_injection(source: str) -> str:
    source = _STATUS_BLOCK_PATTERN.sub("", source)
    source = _STATUS_STYLE_PATTERN.sub("", source)
    return _STATUS_SCRIPT_PATTERN.sub("", source)


def _render_direct_tool(source: str, slug: str, entry: dict) -> str:
    source = _strip_prior_injection(source)
    head_match = _HEAD_CLOSE_PATTERN.search(source)
    body_match = _BODY_OPEN_PATTERN.search(source)
    if head_match is None or body_match is None:
        raise SurfaceGovernanceError(
            f"surface governance: {slug} cannot receive direct status"
        )
    source = (
        source[: head_match.start()]
        + _STATUS_STYLE
        + _STATUS_SCRIPT
        + source[head_match.start() :]
    )
    # The head insertion shifted every later offset; re-find the body tag.
    body_match = _BODY_OPEN_PATTERN.search(source)
    block = STATUS_START + _direct_status_markup(entry) + STATUS_END
    return source[: body_match.end()] + block + source[body_match.end() :]


def _write_atomic_text(output_path: Path, content: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=output_path.parent,
            prefix=f".{output_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(content)
            temporary_path = Path(handle.name)
        os.replace(temporary_path, output_path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def apply_tool_status(tools_directory: Path, document: dict) -> None:
    """Inject one standardized status block into every shipped direct tool.

    Only "tool" kind entries are touched — "page" entries (rendered
    markdown) are a different pipeline and are silently skipped. Fails
    closed: an invalid slug, an unreadable/missing built tool, or a tool
    missing a `<head>`/`<body>` to inject into all raise rather than
    shipping a tool with no governance status.
    """
    tools_directory = Path(tools_directory)
    items = document.get("items", {}) if isinstance(document, dict) else {}
    for slug in sorted(items):
        entry = items[slug]
        if not isinstance(entry, dict) or entry.get("kind") != "tool":
            continue
        if Path(slug).name != slug or not slug.endswith(".html"):
            raise SurfaceGovernanceError(f"surface governance: {slug} invalid tool slug")
        tool_path = tools_directory / slug
        try:
            source = tool_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise SurfaceGovernanceError(
                f"surface governance: {slug} built tool unavailable"
            ) from error
        rendered = _render_direct_tool(source, slug, entry)
        _write_atomic_text(tool_path, rendered)


# ---------------------------------------------------------------------------
# Deterministic writes
# ---------------------------------------------------------------------------

def _write_json_document(output_path: Path, document: dict) -> None:
    """Serialize any JSON-able dict deterministically (sorted keys) and
    write it atomically. Shared by write_site_document() and
    write_risk_proposal() so both artifact types get the identical
    byte-for-byte guarantee from one implementation.
    """
    rendered = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    _write_atomic_text(Path(output_path), rendered)


def write_site_document(output_path: Path, document: dict) -> None:
    """Write a deterministic (sorted-key) JSON artifact atomically."""
    _write_json_document(output_path, document)


# ---------------------------------------------------------------------------
# Risk-classification review worksheet (--write-proposal)
# ---------------------------------------------------------------------------
# Non-mutating: proposes a risk{kind,level} for every CURRENT reviewed.json
# slug so a faculty reviewer has something concrete to confirm or override
# (.superpowers/sdd/2026-07-26-risk-aware-publishing-warnings/task-6-brief.md,
# Steps 1-2). Deliberately reads reviewed.json with _load_json() rather than
# load_validated_ledger(): the live ledger has no "risk" field on any record
# yet, so the strict schema check that function runs would reject every
# single row -- that gap is exactly the problem this worksheet exists to
# help close, not a bug to route around.

TOPIC_META_RELATIVE = Path("topic_meta.json")
SITE_MANIFEST_RELATIVE = Path("13_Faculty_Resources/_automation/site_build/site_manifest.json")
BUILD_DEPLOY_RELATIVE = Path("13_Faculty_Resources/_automation/site_build/build_deploy.py")
RESIDENT_SECTION_RELATIVE = Path("13_Faculty_Resources/_automation/site_build/resident_section.py")
COTW_REGISTRY_RELATIVE = Path("08_Cases_and_Simulation/case-of-the-week/cotw_registry.json")

# Tool sources shipped outside site_manifest.json's shared "tools" list --
# mirrors validate_tool_governance.py's SITE_EXTRAS. Duplicated here in
# miniature rather than imported: that module already imports FROM this one
# (SurfaceGovernanceError, load_validated_ledger), so importing back would
# be a circular import. Keep the two lists in sync by hand if either changes.
_ADDITIONAL_TOOL_SOURCES = {
    "learning-path.html": "01_Six_Week_Curriculum/learning-path.html",
    "orientation-video.html": "_prototypes/orientation-video/orientation-video.html",
    "rp-agitation.html": "_prototypes/agitation-trainer/rp-agitation.html",
    "rp-brief-psych.html": "_prototypes/brief-psych/rp-brief-psych.html",
    "rp-canon-quiz.html": "_prototypes/canon-quiz/rp-canon-quiz.html",
}

# The conservative fallback the brief specifies for anything without an
# explicit signal. 2026-08-12 faculty ruling: risk kind "general" at level
# "high" is forbidden outright (reviewed.schema.json now carries a
# cross-field "not" clause rejecting it) -- "general" denotes non-clinical
# material while "high" implies safety/legal/medication/local-policy
# consequence, which is inherently contradictory. The conservative default
# therefore assumes the worst under a kind that DOES carry fixed,
# non-paraphrased supervision copy (warning_copy()'s HIGH_CLINICAL branch)
# instead of falling back to raw reason text. Every row that lands here is
# still always routed to individual faculty attention below, never silently
# bulk-approvable -- unlike a *signaled* clinical/high row (e.g.
# topic_meta.json safetyLevel=high), which shares this exact {kind, level}
# pair but must never be routed the same way. See _propose_risk()'s
# docstring for why that means the routing decision can no longer be made
# by comparing risk dicts for equality.
CONSERVATIVE_RISK = {"kind": "clinical", "level": "high"}
CONSERVATIVE_RISK_NOTE = (
    "no explicit signal found for this slug -- proposed clinical/high as an "
    "assume-the-worst conservative default (a kind that carries fixed, "
    "non-paraphrased supervision copy), not a real classification; needs "
    "individual faculty review of the correct risk kind and level"
)


def _load_text(path: Path, label: str) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise SurfaceGovernanceError(f"{label}: unreadable") from error


def _tool_source_paths(root: Path) -> dict:
    """Return every known built tool slug -> tracked source path.

    Combines site_manifest.json's shared "tools" list with the small
    per-site extras above -- together, every tool slug that can possibly
    appear in reviewed.json or a site nav.
    """
    manifest = _load_json(root / SITE_MANIFEST_RELATIVE, "site_manifest.json")
    sources: dict = {}
    tools = manifest.get("tools") if isinstance(manifest, dict) else None
    if isinstance(tools, list):
        for entry in tools:
            if isinstance(entry, list) and len(entry) == 3:
                source_relative, built_slug, _title = entry
                if isinstance(source_relative, str) and isinstance(built_slug, str):
                    sources[built_slug] = root / source_relative
    for slug, source_relative in _ADDITIONAL_TOOL_SOURCES.items():
        sources.setdefault(slug, root / source_relative)
    return sources


def _local_policy_basis(tool_sources: dict, slug: str) -> str | None:
    """A basis string if slug's built tool has a sibling *.pack.json
    declaring one or more LOCAL_POLICY tokens (pack["localPolicies"]) --
    the same field check-static-site.mjs already reads to report unfilled
    tokens. Presence of the token TYPE is the signal, independent of
    whether any individual token's value has been filled in: a
    LOCAL_POLICY token marks institution-specific content regardless of
    fill state (see rp-agitation.pack.json, whose 8 tokens already carry
    teaching-safe placeholder values but are still institution-specific by
    kind -- fill status is an attestation-readiness concern, not a risk-
    classification one). Returns None when there is no signal.
    """
    source_path = tool_sources.get(slug)
    if source_path is None or source_path.suffix != ".html":
        return None
    pack_path = source_path.with_name(source_path.name[: -len(".html")] + ".pack.json")
    if not pack_path.exists():
        return None
    try:
        pack = json.loads(pack_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    tokens = pack.get("localPolicies") if isinstance(pack, dict) else None
    if not isinstance(tokens, list) or not tokens:
        return None
    return "tool pack declares %d LOCAL_POLICY token(s) (%s)" % (len(tokens), pack_path.name)


def _topic_meta_high_basis(topic_meta: dict, slug: str) -> str | None:
    """A basis string if topic_meta.json marks slug safetyLevel=high,
    else None."""
    entry = topic_meta.get(slug) if isinstance(topic_meta, dict) else None
    if isinstance(entry, dict) and entry.get("safetyLevel") == "high":
        return "topic_meta.json safetyLevel=high"
    return None


def _propose_risk(
    tool_sources: dict, topic_meta: dict, slug: str
) -> tuple[dict, str, bool, "str | None"]:
    """Return (risk, basis, faculty_confirmation_required, note) for slug.

    Explicit signals are "mechanically obvious" (design doc, Risk
    semantics): a whole GROUP of rows sharing one is safe for faculty to
    bulk-approve, so those rows do not individually force
    facultyConfirmationRequired. The conservative fallback has no
    mechanical basis, so it always does -- every such row needs a human's
    individual attention (Step 3 of the brief), never a rubber stamp.

    confirmation_required/note are decided PER BRANCH below, not by
    comparing the resulting risk dict against CONSERVATIVE_RISK for
    equality: since the 2026-08-12 ruling, the conservative default
    (clinical/high) and the topic_meta.json safetyLevel=high explicit
    signal can produce the identical {kind, level} pair, so only the
    origin -- which branch actually ran -- can tell a real signal apart
    from a guess. (Pre-ruling, the conservative default was general/high,
    a combination no signal branch could ever also produce, so a single
    post-hoc equality check used to be sufficient; it no longer is.)
    """
    basis = _local_policy_basis(tool_sources, slug)
    if basis is not None:
        risk = {"kind": "local-policy", "level": "high"}
        confirmation_required = False
        note = None
    else:
        basis = _topic_meta_high_basis(topic_meta, slug)
        if basis is not None:
            risk = {"kind": "clinical", "level": "high"}
            confirmation_required = False
            note = None
        else:
            risk = dict(CONSERVATIVE_RISK)
            basis = (
                "no explicit signal found (no tool-pack LOCAL_POLICY token, "
                "no topic_meta.json safetyLevel=high) -- conservative default"
            )
            confirmation_required = True
            note = CONSERVATIVE_RISK_NOTE
    return risk, basis, confirmation_required, note


def _extract_literal_nav_slugs(source_text: str, label: str) -> dict:
    """Statically extract {slug: nav-kind} pairs from a nav-building
    module's source, WITHOUT executing it.

    build_deploy.py and resident_section.py both have heavy import-time
    side effects (file copies, directory deletion, hard requires on OE
    audio/media assets) and, more fundamentally, both end by calling
    load_validated_ledger() against reviewed.json -- exactly what does not
    validate yet against the live, unmigrated ledger. That gap is the
    whole reason this worksheet exists, so executing either module here
    would always raise before nav was even built.

    Recognizes the two literal shapes both files actually use for nav
    items: {"f": "<slug>", "k": "<kind>", ...} dict literals (resident_
    section.py's inline nav, and the "_HIDDEN_INHERITED" list it folds in)
    and _md("title", "<slug>", ...) / _tool("<slug>", ...) calls with
    literal string arguments (build_deploy.py's nav). Items built from a
    computed slug -- the Case of the Week comprehension's
    _cotw_slug(w, level) call in both files, and build_deploy.py's
    week1..week6 comprehension -- are not literal, so they are
    deliberately invisible here and are supplied separately by
    _cotw_nav_slugs() and _MS3_WEEK_SLUGS below.
    """
    try:
        tree = ast.parse(source_text)
    except (SyntaxError, ValueError) as error:
        raise SurfaceGovernanceError(f"{label}: unparseable") from error
    found: dict = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            keys = {
                key.value: value
                for key, value in zip(node.keys, node.values)
                if isinstance(key, ast.Constant) and isinstance(key.value, str)
            }
            slug_node, kind_node = keys.get("f"), keys.get("k")
            if (
                isinstance(slug_node, ast.Constant)
                and isinstance(slug_node.value, str)
                and isinstance(kind_node, ast.Constant)
                and isinstance(kind_node.value, str)
            ):
                found[slug_node.value] = kind_node.value
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id == "_md" and len(node.args) >= 2:
                slug_arg = node.args[1]
                if isinstance(slug_arg, ast.Constant) and isinstance(slug_arg.value, str):
                    found[slug_arg.value] = "md"
            elif node.func.id == "_tool" and len(node.args) >= 1:
                slug_arg = node.args[0]
                if isinstance(slug_arg, ast.Constant) and isinstance(slug_arg.value, str):
                    found[slug_arg.value] = "tool"
    return found


def _cotw_nav_slugs(root: Path) -> dict:
    """Return {"ms3": {slug: "md"}, "resident": {slug: "md"}} for every
    Case of the Week page, using the identical formula build_deploy.py's
    and resident_section.py's own _cotw_slug() helpers use:
    f"cotw_{date-without-dashes}_{topic}_{level}.md".
    """
    registry = _load_json(root / COTW_REGISTRY_RELATIVE, "cotw_registry.json")
    weeks = registry.get("weeks") if isinstance(registry, dict) else None
    slugs = {"ms3": {}, "resident": {}}
    if not isinstance(weeks, list):
        return slugs
    for week in weeks:
        if not isinstance(week, dict):
            continue
        date_value, topic = week.get("date"), week.get("topic")
        if not isinstance(date_value, str) or not isinstance(topic, str):
            continue
        stem = "cotw_%s_%s" % (date_value.replace("-", ""), topic)
        slugs["ms3"]["%s_ms3.md" % stem] = "md"
        slugs["resident"]["%s_res.md" % stem] = "md"
    return slugs


# build_deploy.py's Welcome section prepends six hidden week pages built
# from "week%d.md" % i inside a list comprehension -- a computed slug, so
# _extract_literal_nav_slugs() cannot see it (see that function's
# docstring). resident_section.py does not need this: its own
# _HIDDEN_INHERITED list spells week1.md..week6.md out as literal dicts,
# which the extractor already recognizes on its own.
_MS3_WEEK_SLUGS = {"week%d.md" % i: "md" for i in range(1, 7)}


def _nav_slugs_by_site(root: Path) -> dict:
    """Return {"ms3": {slug: kind}, "resident": {slug: kind}} for every
    slug the real nav-building source ships, using only static analysis
    (see _extract_literal_nav_slugs()'s docstring for why).
    """
    build_deploy_source = _load_text(root / BUILD_DEPLOY_RELATIVE, "build_deploy.py")
    resident_source = _load_text(root / RESIDENT_SECTION_RELATIVE, "resident_section.py")
    cotw = _cotw_nav_slugs(root)
    ms3 = {
        **_extract_literal_nav_slugs(build_deploy_source, "build_deploy.py"),
        **cotw["ms3"],
        **_MS3_WEEK_SLUGS,
    }
    resident = {
        **_extract_literal_nav_slugs(resident_source, "resident_section.py"),
        **cotw["resident"],
    }
    return {"ms3": ms3, "resident": resident}


def build_risk_proposal(root: Path) -> dict:
    """Build the non-mutating risk-classification review worksheet.

    Covers every slug currently in reviewed.json (the required "proposals"
    list) plus every nav slug shipped by either site with no ledger record
    at all (the "navMissing" list -- add-with-pending candidates per the
    brief's Step 4 intent). Never writes reviewed.json. Deterministic: rows
    sorted by slug, no wall-clock timestamp, so an unchanged repository
    always reproduces identical bytes.
    """
    root = Path(root)
    ledger = _load_json(root / REVIEWED_RELATIVE, "reviewed.json")
    if not isinstance(ledger, dict):
        raise SurfaceGovernanceError("reviewed.json: must be an object")
    topic_meta = _load_json(root / TOPIC_META_RELATIVE, "topic_meta.json")
    tool_sources = _tool_source_paths(root)

    counts: dict = {}
    for entry in ledger.values():
        status = entry.get("status") if isinstance(entry, dict) else None
        counts[status] = counts.get(status, 0) + 1

    proposals = []
    for slug in sorted(ledger):
        entry = ledger[slug]
        status = entry.get("status") if isinstance(entry, dict) else None
        risk, basis, confirmation_required, note = _propose_risk(tool_sources, topic_meta, slug)
        row = {
            "slug": slug,
            "status": status,
            "risk": risk,
            "basis": basis,
            "facultyConfirmationRequired": confirmation_required,
        }
        if note:
            row["note"] = note
        proposals.append(row)

    nav_slugs = _nav_slugs_by_site(root)
    all_nav_slugs = set(nav_slugs["ms3"]) | set(nav_slugs["resident"])
    nav_missing = []
    for slug in sorted(all_nav_slugs - set(ledger)):
        sites = [site for site in ("ms3", "resident") if slug in nav_slugs[site]]
        kind = _surface_kind(nav_slugs[sites[0]][slug])
        risk, basis, _confirmation_required, note = _propose_risk(tool_sources, topic_meta, slug)
        row = {
            "slug": slug,
            "status": "missing",
            "sites": sites,
            "kind": kind,
            "proposedStatus": "pending",
            "risk": risk,
            "basis": basis
            + " -- shipped in %s nav (%s) with no reviewed.json entry" % (", ".join(sites), kind),
            # Always individual attention, regardless of the row's own
            # signal: a brand-new surface with zero governance history
            # always needs a human to create its first record.
            "facultyConfirmationRequired": True,
        }
        if note:
            row["note"] = note
        nav_missing.append(row)

    return {
        "schemaVersion": 1,
        "source": REVIEWED_RELATIVE.as_posix(),
        "measuredInventory": {"entries": len(ledger), "statuses": counts},
        "proposals": proposals,
        "navMissing": nav_missing,
    }


def write_risk_proposal(output_path: Path, proposal: dict) -> None:
    """Write the risk-classification review worksheet deterministically.

    Same atomic/sorted-key guarantee as write_site_document() -- a
    distinct name because a risk proposal is not a per-site governance
    document; no learner site build ever consumes it.
    """
    _write_json_document(output_path, proposal)


def _parse_proposal_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate the risk-classification review worksheet proposing a "
            "risk{kind,level} for every 13_Faculty_Resources/reviewed.json "
            "record. Never writes reviewed.json."
        )
    )
    parser.add_argument(
        "--write-proposal",
        required=True,
        type=Path,
        metavar="PATH",
        help="write the review worksheet (JSON) to PATH",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="repository root (default: derived from this file's location)",
    )
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_proposal_args(argv)
    try:
        proposal = build_risk_proposal(args.root)
        write_risk_proposal(args.write_proposal, proposal)
    except SurfaceGovernanceError as error:
        print(f"surface governance INVALID — {error}")
        return 1
    print(
        "risk proposal written to %s — %d ledger row(s), %d nav-missing row(s)"
        % (args.write_proposal, len(proposal["proposals"]), len(proposal["navMissing"]))
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
