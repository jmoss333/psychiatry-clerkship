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

Nothing here mutates the source ledger. A faculty-confirmed migration path
for changing reviewed.json itself lives elsewhere (out of scope here).
"""

import json
import os
import re
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
        # The only "not" rule in the schema is "a reviewed record can't carry
        # the pending-reviewer label" — it is always about "by".
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
    application copy (never paraphrased); everything else — including a
    "general" kind that is somehow marked high — falls back to the ledger's
    own reason, which is always faculty-authored free text.
    """
    if risk_level == "high":
        if risk_kind == "local-policy":
            return HIGH_LOCAL.format(kind=kind)
        if risk_kind in _HIGH_CLINICAL_KINDS:
            return HIGH_CLINICAL.format(kind=kind, risk=risk_kind)
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
            'role="status">'
            "<strong>Pending faculty review</strong>"
            f"<span>{escape(risk_label)}</span>"
            f"<span>{escape(entry['reason'])}</span>"
            "</div>"
        )
    receipt = f"Reviewed by {entry['reviewer']} on {entry['reviewedAt']}"
    return (
        '<div class="surface-governance-direct surface-governance-receipt" '
        'role="status">'
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

def write_site_document(output_path: Path, document: dict) -> None:
    """Write a deterministic (sorted-key) JSON artifact atomically."""
    rendered = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    _write_atomic_text(Path(output_path), rendered)
