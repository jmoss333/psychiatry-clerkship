#!/usr/bin/env python3
"""Validate and present learner-facing review governance."""

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
HIGH_CLINICAL = (
    "This {kind} includes high-risk {risk} teaching that has not completed "
    "faculty attestation. Verify decisions with your supervising clinician."
)
HIGH_LOCAL = (
    "This {kind} includes institution-specific teaching that has not completed "
    "faculty attestation. Verify current institutional policy or workflow before acting."
)
STATUS_START = "<!-- SURFACE-GOVERNANCE:START -->"
STATUS_END = "<!-- SURFACE-GOVERNANCE:END -->"
STATUS_BLOCK_PATTERN = re.compile(
    r"<!-- SURFACE-GOVERNANCE:START -->.*?<!-- SURFACE-GOVERNANCE:END -->",
    re.DOTALL,
)
STATUS_STYLE_PATTERN = re.compile(
    r'<style id="surface-governance-style">.*?</style>', re.DOTALL
)
STATUS_SCRIPT_PATTERN = re.compile(
    r'<script id="surface-governance-script">.*?</script>', re.DOTALL
)
HEAD_CLOSE_PATTERN = re.compile(r"</head\s*>", re.IGNORECASE)
BODY_OPEN_PATTERN = re.compile(r"<body(?:\s[^>]*)?>", re.IGNORECASE)


class SurfaceGovernanceError(ValueError):
    """Raised when surface governance cannot be trusted."""


def _load_json(path: Path, label: str) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SurfaceGovernanceError(f"{label}: unreadable JSON") from error


def _error_path(error) -> list[object]:
    path = list(error.absolute_path)
    if error.validator == "required" and isinstance(error.instance, dict):
        missing = sorted(set(error.validator_value) - set(error.instance))
        if missing:
            path.append(missing[0])
    elif error.validator == "additionalProperties" and isinstance(
        error.instance, dict
    ):
        allowed = set(error.schema.get("properties", {}))
        unexpected = sorted(set(error.instance) - allowed)
        if unexpected:
            path.append(unexpected[0])
    elif error.validator == "not" and isinstance(error.instance, dict):
        path.append("by")
    return path


def _pointer(path: list[object]) -> str:
    return "/" + "/".join(
        str(part).replace("~", "~0").replace("/", "~1") for part in path
    )


def _raise_invalid(path: list[object]) -> None:
    slug = str(path[0]) if path else "<root>"
    raise SurfaceGovernanceError(
        f"reviewed.json: {slug} invalid at {_pointer(path)}"
    )


def load_validated_ledger(root: Path) -> dict[str, dict]:
    """Load the canonical review ledger from a repository root."""
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
    for slug, entry in sorted(ledger.items()):
        for field in ("at", "evidenceThrough"):
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


def _iter_nav_items(value):
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
    raise SurfaceGovernanceError(
        f"surface governance: invalid navigation kind {nav_kind!r}"
    )


def _warning_copy(kind: str, entry: dict) -> str:
    risk_kind = entry["risk"]["kind"]
    risk_level = entry["risk"]["level"]
    if risk_level != "high":
        return entry["reason"]
    if risk_kind == "local-policy":
        return HIGH_LOCAL.format(kind=kind)
    if risk_kind in {"clinical", "legal", "formulary"}:
        return HIGH_CLINICAL.format(kind=kind, risk=risk_kind)
    return entry["reason"]


def _presentation_entry(kind: str, entry: dict) -> dict:
    result = {
        "kind": kind,
        "status": entry["status"],
        "riskKind": entry["risk"]["kind"],
        "riskLevel": entry["risk"]["level"],
        "reviewer": entry["by"],
        "reviewedAt": entry["at"],
    }
    if entry["status"] == "pending":
        result["reason"] = entry["reason"]
        result["warning"] = _warning_copy(kind, entry)
    return result


def build_site_document(ledger: dict, nav: list, site: str) -> dict:
    """Build a sanitized, deterministic document for one learner site."""
    if site not in {"ms3", "resident"}:
        raise SurfaceGovernanceError("surface governance: invalid site")
    kinds = {}
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
            slug: _presentation_entry(kinds[slug], ledger[slug])
            for slug in sorted(kinds)
        },
    }


def annotate_navigation(nav: list, document: dict) -> list:
    """Return a navigation copy with compact governance triplets."""
    annotated = deepcopy(nav)
    for item in _iter_nav_items(annotated):
        slug = item["f"]
        try:
            entry = document["items"][slug]
        except (KeyError, TypeError) as error:
            raise SurfaceGovernanceError(
                f"surface governance: {slug} missing site record"
            ) from error
        item["governance"] = {
            "status": entry["status"],
            "riskKind": entry["riskKind"],
            "riskLevel": entry["riskLevel"],
        }
    return annotated


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
    receipt = (
        f"Reviewed by {entry['reviewer']} on {entry['reviewedAt']}"
    )
    return (
        '<div class="surface-governance-direct surface-governance-receipt" '
        'role="status">'
        f"{escape(receipt)}"
        "</div>"
    )


def _strip_direct_status(source: str) -> str:
    source = STATUS_BLOCK_PATTERN.sub("", source)
    source = STATUS_STYLE_PATTERN.sub("", source)
    return STATUS_SCRIPT_PATTERN.sub("", source)


def _render_direct_tool(source: str, slug: str, entry: dict) -> str:
    source = _strip_direct_status(source)
    head_match = HEAD_CLOSE_PATTERN.search(source)
    body_match = BODY_OPEN_PATTERN.search(source)
    if head_match is None or body_match is None:
        raise SurfaceGovernanceError(
            f"surface governance: {slug} cannot receive direct status"
        )
    style = (
        '<style id="surface-governance-style">'
        ".surface-governance-direct{box-sizing:border-box;margin:0;padding:.75rem 1rem;"
        "font:600 1rem/1.4 system-ui,sans-serif}"
        ".surface-governance-direct span{display:block;font-weight:500}"
        ".surface-governance-direct p{margin:.35rem 0 0;font-weight:500}"
        ".surface-governance-pending-high{border:3px solid #8b2f24;background:#fff2e8;"
        "color:#3d1812}"
        ".surface-governance-pending{border-bottom:2px solid #9a6b22;background:#fff8e6;"
        "color:#3f2c0d}"
        ".surface-governance-receipt{border-bottom:1px solid #70867a;background:#f1f6f2;"
        "color:#213c30;font-weight:500}"
        "html.governed-embed .surface-governance-direct{display:none!important}"
        "</style>"
    )
    script = (
        '<script id="surface-governance-script">'
        "(function(){try{var params=new URLSearchParams(window.location.search);"
        "if(window.self!==window.top&&params.get('governed')==='1'){"
        "document.documentElement.classList.add('governed-embed');}}catch(error){}})();"
        "</script>"
    )
    source = source[: head_match.start()] + style + script + source[head_match.start() :]
    body_match = BODY_OPEN_PATTERN.search(source)
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
    """Inject one standardized status block into every shipped direct tool."""
    tools_directory = Path(tools_directory)
    for slug, entry in sorted(document.get("items", {}).items()):
        if entry.get("kind") != "tool":
            continue
        if Path(slug).name != slug or not slug.endswith(".html"):
            raise SurfaceGovernanceError(
                f"surface governance: {slug} invalid tool slug"
            )
        tool_path = tools_directory / slug
        try:
            source = tool_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise SurfaceGovernanceError(
                f"surface governance: {slug} built tool unavailable"
            ) from error
        rendered = _render_direct_tool(source, slug, entry)
        _write_atomic_text(tool_path, rendered)


def write_site_document(output_path: Path, document: dict) -> None:
    """Write a deterministic JSON artifact without exposing partial output."""
    rendered = json.dumps(
        document, ensure_ascii=False, indent=2, sort_keys=True
    ) + "\n"
    _write_atomic_text(Path(output_path), rendered)
