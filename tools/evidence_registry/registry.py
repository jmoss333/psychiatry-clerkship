#!/usr/bin/env python3
"""Offline loading, normalization, validation, and projection primitives."""

from __future__ import annotations

import argparse
import copy
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlsplit


SCHEMA_VERSION = 2
SOURCE_TYPES = {
    "primary-study",
    "systematic-review",
    "guideline",
    "instrument",
    "consensus",
    "other-authoritative",
}
IDENTITY_STATES = {"verified", "exception", "pending"}
ACCESS_LEVELS = {"metadata", "abstract", "fulltext"}
APPRAISAL_REVIEW_STATES = {"pending-faculty-review", "reviewed"}
MAPPING_STATES = {"mapped", "needs-faculty-confirmation", "citation-conflict"}
TIER1_SELECTIONS = {
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14a",
    "14b",
    "15",
    "16",
}
SURVEILLANCE_SOURCE_IDS = {
    "aacap-parameters",
    "apa-practice-guidelines",
    "clozapine-rems",
    "dsm-5-tr",
    "fda-drug-safety",
    "samhsa-guidelines",
    "spravato-rems",
    "uspstf-mental-health",
}
SURVEILLANCE_SEVERITIES = {"P0", "P1", "P2"}
SURVEILLANCE_SOURCE_TYPES = {"html", "pdf", "html+pdf", "login"}
SURVEILLANCE_MODALITIES = {"full_text", "signal_only"}
SURVEILLANCE_SOURCE_REQUIRED_FIELDS = {
    "job",
    "type",
    "modality",
    "severity_default",
    "cadence",
    "watch_for",
    "affects_hint",
    "verified",
}
SURVEILLANCE_SOURCE_OPTIONAL_FIELDS = {"notes", "legal_note", "link_check"}
FORBIDDEN_TRACKED_KEYS = {
    "attachmentKey",
    "attachmentPath",
    "filePath",
    "fullText",
    "indexedText",
    "observedAccessStatus",
}
PUBLIC_SOURCE_FIELDS = {"id", "type", "citation", "requiredAccess", "curriculum"}
PUBLIC_CITATION_FIELDS = {
    "title",
    "authors",
    "organization",
    "year",
    "journal",
    "volume",
    "pages",
    "doi",
    "pmid",
    "url",
}
PUBLIC_CURRICULUM_FIELDS = {
    "tier",
    "role",
    "weekNumbers",
    "topicSlugs",
    "pairedTools",
}

_REQUIRED_SOURCE_FIELDS = {
    "id",
    "type",
    "citation",
    "identity",
    "requiredAccess",
    "governance",
}
_APPRAISAL_FIELDS = {
    "studyDesign",
    "population",
    "comparator",
    "outcomes",
    "limitations",
}
_REFERENCE_FILES = (
    "topic_meta.json",
    "tool_registry.json",
    "communication_cases.json",
    "reasoning_cases.json",
    "reasoning_cases_resident.json",
    "family_systems_scenarios.json",
)
_STABLE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_ZOTERO_ITEM_KEY_RE = re.compile(r"^[A-Z0-9]{8}$")
_TIER1_SELECTION_RE = re.compile(r"^(\d+)([a-z]*)$")
_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "evidence_registry.schema.json"
TIER1_START = "<!-- evidence-registry:tier1:start -->"
TIER1_END = "<!-- evidence-registry:tier1:end -->"
_GENERATED_WARNING = (
    "<!-- Generated from evidence_registry.json by "
    "tools/evidence_registry/registry.py. Do not hand-edit this block. -->"
)
_DOWNLOAD_LIST_PATH = Path(
    "07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md"
)
_CURRICULUM_MAP_PATH = Path(
    "07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md"
)


@dataclass(frozen=True)
class ValidationIssue:
    """One registry problem with a machine-usable location and severity."""

    path: str
    message: str
    severity: str = "error"
    code: str | None = None


def _json_equal(left: Any, right: Any) -> bool:
    """Compare JSON values without treating booleans as integers."""

    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return set(left) == set(right) and all(
            _json_equal(left[key], right[key]) for key in left
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            _json_equal(left_item, right_item)
            for left_item, right_item in zip(left, right)
        )
    return left == right


def _schema_child_path(path: str, key: str) -> str:
    return key if path == "$" else f"{path}.{key}"


def _schema_type_matches(value: Any, expected: str) -> bool:
    checks = {
        "object": lambda candidate: isinstance(candidate, dict),
        "array": lambda candidate: isinstance(candidate, list),
        "string": lambda candidate: isinstance(candidate, str),
        "integer": lambda candidate: type(candidate) is int,
        "boolean": lambda candidate: type(candidate) is bool,
        "null": lambda candidate: candidate is None,
    }
    check = checks.get(expected)
    return bool(check and check(value))


def _schema_format_matches(value: str, format_name: str) -> bool:
    if format_name == "date":
        try:
            parsed = date.fromisoformat(value)
        except ValueError:
            return False
        return parsed.isoformat() == value
    if format_name == "uri":
        if not value or any(character.isspace() for character in value):
            return False
        try:
            parsed = urlsplit(value)
            hostname = parsed.hostname
            _ = parsed.port  # Access validates malformed and out-of-range ports.
        except (UnicodeError, ValueError):
            return False
        if not parsed.scheme:
            return False
        if parsed.scheme in {"http", "https"}:
            return bool(parsed.netloc and hostname)
        return bool(parsed.path)
    return True


def _resolve_local_ref(root_schema: dict, reference: str) -> Any:
    if not isinstance(reference, str) or not reference.startswith("#/"):
        raise ValueError("only local JSON Pointer references are supported")
    target: Any = root_schema
    for token in reference[2:].split("/"):
        key = token.replace("~1", "/").replace("~0", "~")
        if not isinstance(target, dict) or key not in target:
            raise ValueError(f"unresolved local schema reference: {reference}")
        target = target[key]
    return target


def _validate_schema_value(
    value: Any,
    schema: Any,
    root_schema: dict,
    path: str,
) -> list[ValidationIssue]:
    """Validate one value against the Draft 7 subset published by this repo."""

    issues: list[ValidationIssue] = []
    if not isinstance(schema, dict):
        return [
            ValidationIssue(
                path,
                "published schema node must be an object",
                code="schema-validation",
            )
        ]

    reference = schema.get("$ref")
    if reference is not None:
        try:
            target = _resolve_local_ref(root_schema, reference)
        except ValueError as exc:
            return [ValidationIssue(path, str(exc), code="schema-validation")]
        return _validate_schema_value(value, target, root_schema, path)

    expected_type = schema.get("type")
    if isinstance(expected_type, str) and not _schema_type_matches(value, expected_type):
        issues.append(
            ValidationIssue(
                path,
                f"must be of type {expected_type}",
                code="schema-validation",
            )
        )
        return issues

    if "const" in schema and not _json_equal(value, schema["const"]):
        issues.append(
            ValidationIssue(
                path,
                f"must equal {schema['const']!r}",
                code="schema-validation",
            )
        )
    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and not any(
        _json_equal(value, option) for option in enum_values
    ):
        issues.append(
            ValidationIssue(
                path,
                f"must be one of {enum_values!r}",
                code="schema-validation",
            )
        )

    if isinstance(value, dict):
        required = schema.get("required")
        if isinstance(required, list):
            for key in required:
                if isinstance(key, str) and key not in value:
                    issues.append(
                        ValidationIssue(
                            _schema_child_path(path, key),
                            "is required by the published schema",
                            code="schema-validation",
                        )
                    )
        properties = schema.get("properties")
        properties = properties if isinstance(properties, dict) else {}
        for key, child_schema in properties.items():
            if key in value:
                issues.extend(
                    _validate_schema_value(
                        value[key],
                        child_schema,
                        root_schema,
                        _schema_child_path(path, key),
                    )
                )
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    issues.append(
                        ValidationIssue(
                            _schema_child_path(path, key),
                            "unexpected property under the published schema",
                            code="schema-validation",
                        )
                    )

    if isinstance(value, list):
        minimum_items = schema.get("minItems")
        if type(minimum_items) is int and len(value) < minimum_items:
            issues.append(
                ValidationIssue(
                    path,
                    f"must contain at least {minimum_items} item(s)",
                    code="schema-validation",
                )
            )
        if schema.get("uniqueItems") is True:
            for index, item in enumerate(value):
                if any(_json_equal(item, prior) for prior in value[:index]):
                    issues.append(
                        ValidationIssue(
                            f"{path}[{index}]",
                            "must be unique within the array",
                            code="schema-validation",
                        )
                    )
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                issues.extend(
                    _validate_schema_value(
                        item, item_schema, root_schema, f"{path}[{index}]"
                    )
                )

    if isinstance(value, str):
        minimum_length = schema.get("minLength")
        if type(minimum_length) is int and len(value) < minimum_length:
            issues.append(
                ValidationIssue(
                    path,
                    f"must contain at least {minimum_length} character(s)",
                    code="schema-validation",
                )
            )
        pattern = schema.get("pattern")
        if isinstance(pattern, str):
            try:
                matches = re.search(pattern, value) is not None
            except re.error as exc:
                issues.append(
                    ValidationIssue(
                        path,
                        f"published schema has an invalid pattern: {exc}",
                        code="schema-validation",
                    )
                )
            else:
                if not matches:
                    issues.append(
                        ValidationIssue(
                            path,
                            f"must match pattern {pattern}",
                            code="schema-validation",
                        )
                    )
        format_name = schema.get("format")
        if isinstance(format_name, str) and not _schema_format_matches(
            value, format_name
        ):
            issues.append(
                ValidationIssue(
                    path,
                    f"must be a valid {format_name}",
                    code="schema-validation",
                )
            )

    if type(value) in {int, float}:
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if type(minimum) in {int, float} and value < minimum:
            issues.append(
                ValidationIssue(
                    path,
                    f"must be at least {minimum}",
                    code="schema-validation",
                )
            )
        if type(maximum) in {int, float} and value > maximum:
            issues.append(
                ValidationIssue(
                    path,
                    f"must be at most {maximum}",
                    code="schema-validation",
                )
            )

    any_of = schema.get("anyOf")
    if isinstance(any_of, list) and not any(
        not _validate_schema_value(value, branch, root_schema, path)
        for branch in any_of
    ):
        issues.append(
            ValidationIssue(
                path,
                "must satisfy at least one published anyOf alternative",
                code="schema-validation",
            )
        )
    all_of = schema.get("allOf")
    if isinstance(all_of, list):
        for branch in all_of:
            issues.extend(_validate_schema_value(value, branch, root_schema, path))
    condition = schema.get("if")
    then_schema = schema.get("then")
    if isinstance(condition, dict) and isinstance(then_schema, dict):
        if not _validate_schema_value(value, condition, root_schema, path):
            issues.extend(
                _validate_schema_value(value, then_schema, root_schema, path)
            )
    return issues


def validate_against_published_schema(
    registry: Any, schema_path: Path | None = None
) -> list[ValidationIssue]:
    """Apply the repository's published schema without third-party packages."""

    schema_path = _SCHEMA_PATH if schema_path is None else Path(schema_path)
    try:
        with schema_path.open(encoding="utf-8") as handle:
            schema = json.load(handle)
    except (OSError, ValueError) as exc:
        return [
            ValidationIssue(
                "$schema",
                f"could not load published evidence schema: {exc}",
                code="schema-validation",
            )
        ]
    if not isinstance(schema, dict):
        return [
            ValidationIssue(
                "$schema",
                "published evidence schema must be a JSON object",
                code="schema-validation",
            )
        ]
    return _validate_schema_value(registry, schema, schema, "$")


def load_evidence_registry(path: Path) -> dict:
    """Load a registry JSON object from disk without contacting any service."""

    with Path(path).open(encoding="utf-8") as handle:
        registry = json.load(handle)
    if not isinstance(registry, dict):
        raise ValueError("evidence registry must be a JSON object")
    return registry


def index_sources(registry: dict) -> dict[str, dict]:
    """Return stable source IDs mapped to records, rejecting an unsafe index."""

    sources = registry.get("sources")
    if not isinstance(sources, list):
        raise ValueError("evidence registry sources must be a list")

    index: dict[str, dict] = {}
    for position, source in enumerate(sources):
        if not isinstance(source, dict):
            raise ValueError(f"evidence registry source {position} must be an object")
        source_id = source.get("id")
        if not isinstance(source_id, str) or not source_id.strip():
            raise ValueError(f"evidence registry source {position} has no stable id")
        if source_id in index:
            raise ValueError(f"duplicate evidence source id: {source_id}")
        index[source_id] = source
    return index


def normalize_doi(value: str | None) -> str:
    """Normalize a DOI for comparison while preserving its identifier content."""

    if value is None:
        return ""
    normalized = str(value).strip()
    normalized = re.sub(
        r"^(?:https?://(?:dx\.)?doi\.org/|doi\s*:\s*)",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    return normalized.rstrip(" \t\r\n.,;:)]}").lower()


def normalize_pmid(value: str | int | None) -> str:
    """Normalize a PMID label or PubMed URL to its comparison value."""

    if value is None:
        return ""
    normalized = str(value).strip()
    normalized = re.sub(
        r"^https?://pubmed\.ncbi\.nlm\.nih\.gov/",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"^pmid\s*:?\s*", "", normalized, flags=re.IGNORECASE)
    return normalized.strip().rstrip("/.,;:)")


def normalize_title(value: str | None) -> str:
    """Normalize title case, spacing, accents, and punctuation for comparison."""

    if value is None:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(value)).casefold()
    characters = [
        character if character.isalnum() else " "
        for character in decomposed
        if not unicodedata.combining(character)
    ]
    return " ".join("".join(characters).split())


def tier1_sort_key(source: dict) -> tuple[int, str]:
    """Sort numeric selections naturally, including the independent 14a/14b pair."""

    curriculum = source.get("curriculum") if isinstance(source, dict) else None
    selection = curriculum.get("selection") if isinstance(curriculum, dict) else ""
    match = _TIER1_SELECTION_RE.fullmatch(str(selection))
    if match is None:
        return (10**9, str(selection))
    return (int(match.group(1)), match.group(2))


def tier1_sources(registry: dict) -> list[dict]:
    """Return Tier 1 records in deterministic curriculum-selection order."""

    sources = registry.get("sources", [])
    if not isinstance(sources, list):
        return []
    rows = [
        source
        for source in sources
        if _is_tier1_source(source)
    ]
    return sorted(rows, key=tier1_sort_key)


def _markdown_cell(value: Any) -> str:
    return " ".join(str(value).split()).replace("|", "\\|")


def _display_enum(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    if value == "fulltext":
        return "Full text"
    return value.replace("-", " ").capitalize()


def _author_summary(citation: dict) -> str:
    authors = citation.get("authors")
    families = [
        author.get("family", "").strip()
        for author in authors
        if isinstance(author, dict) and isinstance(author.get("family"), str)
        and author.get("family", "").strip()
    ] if isinstance(authors, list) else []
    if not families:
        organization = citation.get("organization")
        return organization.strip() if isinstance(organization, str) else ""
    if len(families) == 1:
        return families[0]
    if len(families) == 2:
        return f"{families[0]} & {families[1]}"
    return f"{families[0]} et al."


def _citation_display(citation: dict) -> str:
    components = []
    author = _author_summary(citation)
    if author:
        components.append(author)
    year = citation.get("year")
    if type(year) is int:
        components.append(str(year))
    journal = citation.get("journal")
    if isinstance(journal, str) and journal.strip():
        journal_details = f"*{journal.strip()}*"
        volume = citation.get("volume")
        pages = citation.get("pages")
        if isinstance(volume, str) and volume.strip():
            journal_details += f" {volume.strip()}"
        if isinstance(pages, str) and pages.strip():
            journal_details += f":{pages.strip()}"
        components.append(journal_details)

    doi = normalize_doi(citation.get("doi"))
    pmid = normalize_pmid(citation.get("pmid"))
    if doi:
        components.append(f"[DOI](https://doi.org/{doi})")
    if pmid:
        components.append(f"[PubMed](https://pubmed.ncbi.nlm.nih.gov/{pmid}/)")
    return " · ".join(components)


def render_tier1_download_block(records: list[dict]) -> str:
    """Render the deterministic, metadata-only Tier 1 download-list block."""

    lines = [
        _GENERATED_WARNING,
        "## TIER 1 — The rotation core (17 articles across 16 numbered selections)",
        "",
        (
            "Every trainee reads these articles; they anchor the 6-week curriculum "
            "and the Journal Club packets. Access requirements are curricular targets, "
            "not live observations of local PDF availability."
        ),
        "",
        "| Selection | Citation | Title | Read for | Required access |",
        "|---|---|---|---|---|",
    ]
    for source in sorted(records, key=tier1_sort_key):
        citation = source.get("citation")
        curriculum = source.get("curriculum")
        citation = citation if isinstance(citation, dict) else {}
        curriculum = curriculum if isinstance(curriculum, dict) else {}
        cells = (
            curriculum.get("selection", ""),
            _citation_display(citation),
            citation.get("title", ""),
            curriculum.get("teachingRole", ""),
            _display_enum(source.get("requiredAccess")),
        )
        lines.append("| " + " | ".join(_markdown_cell(cell) for cell in cells) + " |")
    return "\n".join(lines) + "\n"


def _week_display(curriculum: dict) -> str:
    week_numbers = curriculum.get("weekNumbers")
    if not isinstance(week_numbers, list) or not week_numbers:
        return "Unassigned"
    return ", ".join(f"Week {week}" for week in week_numbers if type(week) is int)


def render_tier1_curriculum_map(records: list[dict]) -> str:
    """Render the deterministic faculty-only curriculum and Zotero parent map."""

    sorted_records = sorted(records, key=tier1_sort_key)
    lines = [
        "# Tier 1 Primary Source Curriculum Map",
        "",
        _GENERATED_WARNING,
        "",
        (
            "Faculty-facing map from the canonical evidence registry. Zotero values "
            "identify parent items only; attachment details and live access state are excluded."
        ),
        "",
        "| Selection | Evidence ID | Week | Role | Mapping status | Teaching role | Zotero parent key |",
        "|---|---|---|---|---|---|---|",
    ]
    for source in sorted_records:
        curriculum = source.get("curriculum")
        zotero = source.get("zotero")
        curriculum = curriculum if isinstance(curriculum, dict) else {}
        zotero = zotero if isinstance(zotero, dict) else {}
        cells = (
            curriculum.get("selection", ""),
            source.get("id", ""),
            _week_display(curriculum),
            _display_enum(curriculum.get("role")),
            _display_enum(curriculum.get("mappingStatus")),
            curriculum.get("teachingRole", ""),
            zotero.get("itemKey", ""),
        )
        lines.append("| " + " | ".join(_markdown_cell(cell) for cell in cells) + " |")

    notes = []
    for source in sorted_records:
        curriculum = source.get("curriculum")
        if not isinstance(curriculum, dict):
            continue
        note = curriculum.get("mappingNote")
        if isinstance(note, str) and note.strip():
            notes.append(
                f"- **{_markdown_cell(curriculum.get('selection', ''))}:** "
                f"{_markdown_cell(note)}"
            )
    if notes:
        lines.extend(["", "## Mapping notes", "", *notes])
    return "\n".join(lines) + "\n"


def replace_generated_block(
    text: str,
    start: str,
    end: str,
    replacement: str,
) -> str:
    """Replace only the content between one matched pair of sentinel markers."""

    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError("generated block must contain exactly one start and one end marker")
    start_index = text.index(start)
    end_index = text.index(end, start_index + len(start))
    inner = replacement.rstrip("\n")
    return (
        text[: start_index + len(start)]
        + "\n"
        + inner
        + "\n"
        + text[end_index:]
    )


def _seed_tier1_block(text: str, replacement: str) -> str:
    heading = re.search(r"^## TIER 1\b.*$", text, flags=re.MULTILINE)
    tail = re.search(r"^---\n\n## TIER 2\b", text, flags=re.MULTILINE)
    if heading is None or tail is None or tail.start() <= heading.start():
        raise ValueError(
            "download list has neither Tier 1 sentinels nor the expected Tier 1/Tier 2 headings"
        )
    bounded = (
        TIER1_START
        + "\n"
        + replacement.rstrip("\n")
        + "\n"
        + TIER1_END
        + "\n\n"
    )
    return text[: heading.start()] + bounded + text[tail.start():]


def generated_outputs(repo_root: Path) -> dict[Path, str]:
    """Compute tracked generated evidence views in memory without writing files."""

    repo_root = Path(repo_root).expanduser().absolute()
    registry = load_evidence_registry(repo_root / "evidence_registry.json")
    records = tier1_sources(registry)
    download_path = repo_root / _DOWNLOAD_LIST_PATH
    curriculum_map_path = repo_root / _CURRICULUM_MAP_PATH
    current_download = download_path.read_text(encoding="utf-8")
    download_block = render_tier1_download_block(records)
    if TIER1_START in current_download or TIER1_END in current_download:
        generated_download = replace_generated_block(
            current_download,
            TIER1_START,
            TIER1_END,
            download_block,
        )
    else:
        generated_download = _seed_tier1_block(current_download, download_block)
    return {
        download_path: generated_download,
        curriculum_map_path: render_tier1_curriculum_map(records),
    }


def _is_tier1_source(source: Any) -> bool:
    if not isinstance(source, dict):
        return False
    curriculum = source.get("curriculum")
    if not isinstance(curriculum, dict):
        return False
    tier = curriculum.get("tier")
    return type(tier) is int and tier == 1


def _nonempty_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_iso_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return False
    return parsed.isoformat() == value


def _record_unique(
    issues: list[ValidationIssue],
    seen: dict[str, str],
    value: str,
    label: str,
    path: str,
) -> None:
    if not value:
        return
    first_path = seen.get(value)
    if first_path is not None:
        issues.append(
            ValidationIssue(path, f"duplicate {label}: {value} (first used at {first_path})")
        )
    else:
        seen[value] = path


def _find_forbidden_keys(value: Any, path: str = "$") -> Iterator[tuple[str, str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key in FORBIDDEN_TRACKED_KEYS:
                yield child_path, key
            yield from _find_forbidden_keys(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _find_forbidden_keys(child, f"{path}[{index}]")


def _selection_root(selection: str) -> str:
    return "14" if selection in {"14a", "14b"} else selection


def _validate_exact_object(
    value: Any,
    path: str,
    required: set[str],
    optional: set[str],
    issues: list[ValidationIssue],
) -> dict:
    if not isinstance(value, dict):
        issues.append(ValidationIssue(path, "must be an object"))
        return {}
    for field in sorted(required - set(value)):
        issues.append(ValidationIssue(path, f"missing required field: {field}"))
    for field in sorted(set(value) - required - optional):
        issues.append(ValidationIssue(path, f"unexpected field: {field}"))
    return value


def _validate_string_list(
    value: Any, path: str, label: str, issues: list[ValidationIssue]
) -> None:
    if not isinstance(value, list):
        issues.append(ValidationIssue(path, f"{label} must be a list"))
        return
    if any(not _nonempty_text(item) for item in value):
        issues.append(
            ValidationIssue(path, f"{label} entries must be non-empty strings")
        )


def _validate_severity(
    value: Any, path: str, issues: list[ValidationIssue]
) -> None:
    if not isinstance(value, str) or value not in SURVEILLANCE_SEVERITIES:
        issues.append(
            ValidationIssue(
                path,
                f"invalid severity_default: {value!r}; expected P0, P1, or P2",
            )
        )


def _valid_https_monitoring_url(value: Any) -> bool:
    if not isinstance(value, str) or not value or any(
        character.isspace() for character in value
    ):
        return False
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
        username = parsed.username
        password = parsed.password
    except (UnicodeError, ValueError):
        return False
    if parsed.scheme != "https" or not parsed.netloc or not hostname:
        return False
    if username is not None or password is not None:
        return False
    if port is not None and not 1 <= port <= 65535:
        return False
    if parsed.netloc.endswith(":"):
        return False
    return True


def _validate_surveillance_source(
    source: dict, position: int, issues: list[ValidationIssue]
) -> None:
    source_path = f"sources[{position}]"
    surveillance_path = f"{source_path}.surveillance"
    config = _validate_exact_object(
        source.get("surveillance"),
        surveillance_path,
        SURVEILLANCE_SOURCE_REQUIRED_FIELDS,
        SURVEILLANCE_SOURCE_OPTIONAL_FIELDS,
        issues,
    )

    source_id = source.get("id")
    if not isinstance(source_id, str) or source_id not in SURVEILLANCE_SOURCE_IDS:
        issues.append(
            ValidationIssue(
                f"{source_path}.id",
                f"unexpected surveillance source id: {source_id!r}",
            )
        )
    citation = source.get("citation")
    citation = citation if isinstance(citation, dict) else {}
    if not _nonempty_text(citation.get("title")):
        issues.append(
            ValidationIssue(
                f"{source_path}.citation.title",
                "monitoring source name must be a non-empty string",
            )
        )
    url = citation.get("url")
    if not _valid_https_monitoring_url(url):
        issues.append(
            ValidationIssue(
                f"{source_path}.citation.url",
                "monitoring URL must be an absolute HTTPS URL",
            )
        )

    if config.get("job") != "guideline-surveillance":
        issues.append(
            ValidationIssue(
                f"{surveillance_path}.job",
                "job must equal guideline-surveillance",
            )
        )
    if not isinstance(config.get("type"), str) or (
        config.get("type") not in SURVEILLANCE_SOURCE_TYPES
    ):
        issues.append(
            ValidationIssue(
                f"{surveillance_path}.type",
                f"invalid monitored source type: {config.get('type')!r}",
            )
        )
    if not isinstance(config.get("modality"), str) or (
        config.get("modality") not in SURVEILLANCE_MODALITIES
    ):
        issues.append(
            ValidationIssue(
                f"{surveillance_path}.modality",
                f"invalid modality: {config.get('modality')!r}",
            )
        )
    _validate_severity(
        config.get("severity_default"),
        f"{surveillance_path}.severity_default",
        issues,
    )
    if config.get("cadence") != "monthly":
        issues.append(
            ValidationIssue(
                f"{surveillance_path}.cadence",
                "cadence must equal monthly",
            )
        )
    _validate_string_list(
        config.get("watch_for"),
        f"{surveillance_path}.watch_for",
        "watch_for",
        issues,
    )
    _validate_string_list(
        config.get("affects_hint"),
        f"{surveillance_path}.affects_hint",
        "affects_hint",
        issues,
    )
    if type(config.get("verified")) is not bool:
        issues.append(
            ValidationIssue(
                f"{surveillance_path}.verified",
                "verified must be a boolean",
            )
        )
    for field in ("notes", "legal_note"):
        if field in config and not isinstance(config[field], str):
            issues.append(
                ValidationIssue(
                    f"{surveillance_path}.{field}", f"{field} must be a string"
                )
            )
    if "link_check" in config and config["link_check"] != "browser_required":
        issues.append(
            ValidationIssue(
                f"{surveillance_path}.link_check",
                "link_check must equal browser_required",
            )
        )


def validate_surveillance_contract(registry: dict) -> list[ValidationIssue]:
    """Validate the complete dependency-free surveillance authority contract."""

    issues: list[ValidationIssue] = []
    settings = _validate_exact_object(
        registry.get("surveillance") if isinstance(registry, dict) else None,
        "surveillance",
        {"version", "updated", "owner", "defaults", "link_monitor", "resource_intake"},
        set(),
        issues,
    )
    if settings.get("version") != 1 or type(settings.get("version")) is not int:
        issues.append(ValidationIssue("surveillance.version", "version must equal 1"))
    if not _valid_iso_date(settings.get("updated")):
        issues.append(
            ValidationIssue("surveillance.updated", "updated must be an ISO date")
        )
    if not _nonempty_text(settings.get("owner")):
        issues.append(
            ValidationIssue("surveillance.owner", "owner must be a non-empty string")
        )

    defaults = _validate_exact_object(
        settings.get("defaults"),
        "surveillance.defaults",
        {"proxy", "retry_before_flag", "snapshot", "respect_robots"},
        set(),
        issues,
    )
    if not isinstance(defaults.get("proxy"), str) or (
        defaults.get("proxy") not in {"datacenter", "residential"}
    ):
        issues.append(
            ValidationIssue(
                "surveillance.defaults.proxy",
                f"invalid proxy: {defaults.get('proxy')!r}",
            )
        )
    retry_count = defaults.get("retry_before_flag")
    if type(retry_count) is not int or retry_count < 0:
        issues.append(
            ValidationIssue(
                "surveillance.defaults.retry_before_flag",
                "retry_before_flag must be a non-negative integer",
            )
        )
    for field in ("snapshot", "respect_robots"):
        if type(defaults.get(field)) is not bool:
            issues.append(
                ValidationIssue(
                    f"surveillance.defaults.{field}", f"{field} must be a boolean"
                )
            )

    link_monitor = _validate_exact_object(
        settings.get("link_monitor"),
        "surveillance.link_monitor",
        {
            "job",
            "cadence",
            "engine",
            "treat_as_finding",
            "severity_default",
            "high_traffic_paths_P0",
        },
        set(),
        issues,
    )
    exact_link_values = {
        "job": "link-source-monitor",
        "cadence": "weekly",
        "engine": "github_action_lychee",
    }
    for field, expected in exact_link_values.items():
        if link_monitor.get(field) != expected:
            issues.append(
                ValidationIssue(
                    f"surveillance.link_monitor.{field}",
                    f"{field} must equal {expected}",
                )
            )
    _validate_severity(
        link_monitor.get("severity_default"),
        "surveillance.link_monitor.severity_default",
        issues,
    )
    _validate_string_list(
        link_monitor.get("high_traffic_paths_P0"),
        "surveillance.link_monitor.high_traffic_paths_P0",
        "high_traffic_paths_P0",
        issues,
    )
    treatments = _validate_exact_object(
        link_monitor.get("treat_as_finding"),
        "surveillance.link_monitor.treat_as_finding",
        {
            "hard_404",
            "soft_404",
            "permanent_redirect_301",
            "temporary_redirect_302",
            "rate_limited_429",
            "tls_error",
        },
        set(),
        issues,
    )
    for field in (
        "hard_404",
        "soft_404",
        "permanent_redirect_301",
        "temporary_redirect_302",
        "rate_limited_429",
        "tls_error",
    ):
        if type(treatments.get(field)) is not bool:
            issues.append(
                ValidationIssue(
                    f"surveillance.link_monitor.treat_as_finding.{field}",
                    f"{field} must be a boolean",
                )
            )

    resource_intake = _validate_exact_object(
        settings.get("resource_intake"),
        "surveillance.resource_intake",
        {
            "job",
            "cadence",
            "engine",
            "inclusion",
            "max_candidates_per_run",
            "severity_default",
            "notes",
        },
        set(),
        issues,
    )
    exact_resource_values = {
        "job": "resource-intake",
        "cadence": "on_demand",
        "engine": "apify_website_content_crawler",
    }
    for field, expected in exact_resource_values.items():
        if resource_intake.get(field) != expected:
            issues.append(
                ValidationIssue(
                    f"surveillance.resource_intake.{field}",
                    f"{field} must equal {expected}",
                )
            )
    _validate_severity(
        resource_intake.get("severity_default"),
        "surveillance.resource_intake.severity_default",
        issues,
    )
    max_candidates = resource_intake.get("max_candidates_per_run")
    if type(max_candidates) is not int or max_candidates < 1:
        issues.append(
            ValidationIssue(
                "surveillance.resource_intake.max_candidates_per_run",
                "max_candidates_per_run must be a positive integer",
            )
        )
    if not isinstance(resource_intake.get("notes"), str):
        issues.append(
            ValidationIssue(
                "surveillance.resource_intake.notes", "notes must be a string"
            )
        )
    inclusion = _validate_exact_object(
        resource_intake.get("inclusion"),
        "surveillance.resource_intake.inclusion",
        {"require_domains", "exclude_if_present_in"},
        set(),
        issues,
    )
    _validate_string_list(
        inclusion.get("require_domains"),
        "surveillance.resource_intake.inclusion.require_domains",
        "require_domains",
        issues,
    )
    if not _nonempty_text(inclusion.get("exclude_if_present_in")):
        issues.append(
            ValidationIssue(
                "surveillance.resource_intake.inclusion.exclude_if_present_in",
                "exclude_if_present_in must be a non-empty string",
            )
        )

    sources = registry.get("sources") if isinstance(registry, dict) else None
    surveillance_sources: list[tuple[int, dict]] = []
    if isinstance(sources, list):
        surveillance_sources = [
            (position, source)
            for position, source in enumerate(sources)
            if isinstance(source, dict) and "surveillance" in source
        ]
    source_ids = [source.get("id") for _, source in surveillance_sources]
    if (
        len(source_ids) != len(SURVEILLANCE_SOURCE_IDS)
        or not all(isinstance(source_id, str) for source_id in source_ids)
        or set(source_ids) != SURVEILLANCE_SOURCE_IDS
    ):
        issues.append(
            ValidationIssue(
                "sources",
                "surveillance authority must contain exactly the eight monitored source IDs",
            )
        )
    for position, source in surveillance_sources:
        _validate_surveillance_source(source, position, issues)

    return issues


def validate_registry(
    registry: dict, schema_path: Path | None = None
) -> list[ValidationIssue]:
    """Aggregate every offline registry-contract issue without short-circuiting."""

    issues = validate_against_published_schema(registry, schema_path)
    if not isinstance(registry, dict):
        issues.append(ValidationIssue("$", "registry must be a JSON object"))
        return issues

    if registry.get("schemaVersion") != SCHEMA_VERSION:
        issues.append(
            ValidationIssue(
                "schemaVersion",
                f"schemaVersion must equal {SCHEMA_VERSION}",
            )
        )

    issues.extend(validate_surveillance_contract(registry))

    for path, key in _find_forbidden_keys(registry):
        issues.append(ValidationIssue(path, f"forbidden tracked key: {key}"))

    sources = registry.get("sources")
    if not isinstance(sources, list):
        issues.append(ValidationIssue("sources", "sources must be a non-empty list"))
        return issues
    if not sources:
        issues.append(ValidationIssue("sources", "sources must be a non-empty list"))

    seen_ids: dict[str, str] = {}
    seen_dois: dict[str, str] = {}
    seen_pmids: dict[str, str] = {}
    seen_zotero_keys: dict[str, str] = {}
    tier1_entries: list[tuple[int, dict]] = []

    for position, source in enumerate(sources):
        source_path = f"sources[{position}]"
        if not isinstance(source, dict):
            issues.append(ValidationIssue(source_path, "source must be an object"))
            continue

        for field in sorted(_REQUIRED_SOURCE_FIELDS):
            if field not in source:
                issues.append(
                    ValidationIssue(source_path, f"missing required field: {field}")
                )

        source_id = source.get("id")
        if not _nonempty_text(source_id):
            issues.append(ValidationIssue(f"{source_path}.id", "stable id must be non-empty"))
        else:
            if _STABLE_ID_RE.fullmatch(source_id) is None:
                issues.append(
                    ValidationIssue(
                        f"{source_path}.id",
                        "stable id must match ^[a-z0-9][a-z0-9-]*$",
                    )
                )
            _record_unique(
                issues,
                seen_ids,
                source_id,
                "stable id",
                f"{source_path}.id",
            )

        source_type = source.get("type")
        if "type" in source and (
            not isinstance(source_type, str) or source_type not in SOURCE_TYPES
        ):
            issues.append(
                ValidationIssue(
                    f"{source_path}.type",
                    f"invalid source type: {source_type!r}",
                )
            )

        required_access = source.get("requiredAccess")
        if "requiredAccess" in source and (
            not isinstance(required_access, str)
            or required_access not in ACCESS_LEVELS
        ):
            issues.append(
                ValidationIssue(
                    f"{source_path}.requiredAccess",
                    f"invalid required access: {required_access!r}",
                )
            )

        citation = source.get("citation")
        if not isinstance(citation, dict):
            if "citation" in source:
                issues.append(
                    ValidationIssue(f"{source_path}.citation", "citation must be an object")
                )
            citation = {}

        doi = normalize_doi(citation.get("doi"))
        pmid = normalize_pmid(citation.get("pmid"))
        _record_unique(
            issues,
            seen_dois,
            doi,
            "DOI",
            f"{source_path}.citation.doi",
        )
        _record_unique(
            issues,
            seen_pmids,
            pmid,
            "PMID",
            f"{source_path}.citation.pmid",
        )

        identity = source.get("identity")
        if not isinstance(identity, dict):
            if "identity" in source:
                issues.append(
                    ValidationIssue(f"{source_path}.identity", "identity must be an object")
                )
            identity = {}
        identity_status = identity.get("status")
        if isinstance(source.get("identity"), dict) and (
            not isinstance(identity_status, str)
            or identity_status not in IDENTITY_STATES
        ):
            issues.append(
                ValidationIssue(
                    f"{source_path}.identity.status",
                    f"invalid identity status: {identity_status!r}",
                )
            )

        governance = source.get("governance")
        if "governance" in source and not isinstance(governance, dict):
            issues.append(
                ValidationIssue(
                    f"{source_path}.governance", "governance must be an object"
                )
            )

        zotero = source.get("zotero")
        if zotero is not None and not isinstance(zotero, dict):
            issues.append(
                ValidationIssue(f"{source_path}.zotero", "zotero must be an object")
            )
            zotero = {}
        if isinstance(zotero, dict):
            raw_item_key = zotero.get("itemKey")
            if raw_item_key not in (None, ""):
                if not isinstance(raw_item_key, str) or _ZOTERO_ITEM_KEY_RE.fullmatch(
                    raw_item_key
                ) is None:
                    issues.append(
                        ValidationIssue(
                            f"{source_path}.zotero.itemKey",
                            "Zotero item key must be an 8-character uppercase alphanumeric parent key, not a BibTeX key",
                        )
                    )
                else:
                    _record_unique(
                        issues,
                        seen_zotero_keys,
                        raw_item_key,
                        "Zotero item key",
                        f"{source_path}.zotero.itemKey",
                    )

        if _is_tier1_source(source):
            tier1_entries.append((position, source))

    selections = [
        source.get("curriculum", {}).get("selection")
        for _, source in tier1_entries
        if isinstance(source.get("curriculum"), dict)
    ]
    selection_set = {
        selection for selection in selections if isinstance(selection, str)
    }
    if len(tier1_entries) != 17:
        issues.append(
            ValidationIssue(
                "sources",
                f"Tier 1 must contain exactly 17 records; found {len(tier1_entries)}",
            )
        )
    if selection_set != TIER1_SELECTIONS:
        missing = sorted(TIER1_SELECTIONS - selection_set, key=_selection_sort_value)
        extra = sorted(selection_set - TIER1_SELECTIONS, key=_selection_sort_value)
        issues.append(
            ValidationIssue(
                "sources",
                "Tier 1 selections must exactly match the required set"
                f"; missing={missing}; extra={extra}",
            )
        )
    roots = {_selection_root(selection) for selection in selection_set}
    if len(roots) != 16:
        issues.append(
            ValidationIssue(
                "sources",
                f"Tier 1 must represent 16 numbered selection roots; found {len(roots)}",
            )
        )

    for position, source in tier1_entries:
        source_path = f"sources[{position}]"
        source_id = source.get("id")
        citation = source.get("citation") if isinstance(source.get("citation"), dict) else {}
        identity = source.get("identity") if isinstance(source.get("identity"), dict) else {}
        curriculum = source.get("curriculum")
        zotero = source.get("zotero")
        appraisal = source.get("appraisal")
        governance = source.get("governance")

        item_key = zotero.get("itemKey") if isinstance(zotero, dict) else None
        if not isinstance(item_key, str) or _ZOTERO_ITEM_KEY_RE.fullmatch(
            item_key
        ) is None:
            issues.append(
                ValidationIssue(
                    f"{source_path}.zotero.itemKey",
                    "Tier 1 source requires a Zotero parent item key",
                )
            )
        if identity.get("status") != "verified":
            issues.append(
                ValidationIssue(
                    f"{source_path}.identity.status",
                    "Tier 1 identity must be verified",
                )
            )
        if source.get("requiredAccess") != "fulltext":
            issues.append(
                ValidationIssue(
                    f"{source_path}.requiredAccess",
                    'Tier 1 requiredAccess must be "fulltext"',
                )
            )

        if not isinstance(appraisal, dict):
            issues.append(
                ValidationIssue(
                    f"{source_path}.appraisal",
                    "Tier 1 source requires a five-field appraisal",
                )
            )
        else:
            for field in sorted(_APPRAISAL_FIELDS):
                if not _nonempty_text(appraisal.get(field)):
                    issues.append(
                        ValidationIssue(
                            f"{source_path}.appraisal.{field}",
                            f"Tier 1 appraisal field must be non-empty: {field}",
                        )
                    )
            review_status = appraisal.get("reviewStatus")
            if not isinstance(review_status, str) or (
                review_status not in APPRAISAL_REVIEW_STATES
            ):
                issues.append(
                    ValidationIssue(
                        f"{source_path}.appraisal.reviewStatus",
                        "Tier 1 appraisal reviewStatus must be one of: pending-faculty-review, reviewed",
                    )
                )
            elif review_status == "reviewed" and not _valid_iso_date(
                appraisal.get("reviewedAt")
            ):
                issues.append(
                    ValidationIssue(
                        f"{source_path}.appraisal.reviewedAt",
                        "Tier 1 reviewed appraisal requires a valid reviewedAt date",
                    )
                )

        if isinstance(curriculum, dict):
            if not _nonempty_text(curriculum.get("role")):
                issues.append(
                    ValidationIssue(
                        f"{source_path}.curriculum.role",
                        "Tier 1 curriculum role must be non-empty",
                    )
                )
            if not _nonempty_text(curriculum.get("teachingRole")):
                issues.append(
                    ValidationIssue(
                        f"{source_path}.curriculum.teachingRole",
                        "Tier 1 teachingRole must be non-empty",
                    )
                )
            week_numbers = curriculum.get("weekNumbers")
            if not isinstance(week_numbers, list) or any(
                not isinstance(week, int) or isinstance(week, bool) or not 1 <= week <= 6
                for week in week_numbers if isinstance(week_numbers, list)
            ):
                issues.append(
                    ValidationIssue(
                        f"{source_path}.curriculum.weekNumbers",
                        "Tier 1 weekNumbers must be a list containing only weeks 1 through 6",
                    )
                )
            mapping_status = curriculum.get("mappingStatus")
            if not isinstance(mapping_status, str) or mapping_status not in MAPPING_STATES:
                issues.append(
                    ValidationIssue(
                        f"{source_path}.curriculum.mappingStatus",
                        "Tier 1 mappingStatus must be one of: mapped, needs-faculty-confirmation, citation-conflict",
                    )
                )
            elif mapping_status == "needs-faculty-confirmation":
                issues.append(
                    ValidationIssue(
                        f"{source_path}.curriculum.mappingStatus",
                        f"Tier 1 week assignment needs faculty confirmation: {source_id}",
                        severity="warning",
                        code="tier1-week-needs-faculty-confirmation",
                    )
                )
            elif mapping_status == "citation-conflict":
                message = (
                    "Brown 1962/1972 citation conflict requires faculty resolution"
                    if source_id == "brown-1972-expressed-emotion"
                    else f"Tier 1 citation conflict requires faculty resolution: {source_id}"
                )
                issues.append(
                    ValidationIssue(
                        f"{source_path}.curriculum.mappingStatus",
                        message,
                        severity="warning",
                        code="tier1-citation-conflict",
                    )
                )
        else:
            issues.append(
                ValidationIssue(
                    f"{source_path}.curriculum",
                    "Tier 1 source requires a curriculum record",
                )
            )

        if not isinstance(governance, dict) or not governance:
            issues.append(
                ValidationIssue(
                    f"{source_path}.governance",
                    "Tier 1 source requires a governance record",
                )
            )

        if not normalize_pmid(citation.get("pmid")) and not (
            normalize_doi(citation.get("doi")) and identity.get("status") == "verified"
        ):
            issues.append(
                ValidationIssue(
                    f"{source_path}.citation.pmid",
                    "Tier 1 missing PMID requires a verified DOI",
                )
            )

    return issues


def _selection_sort_value(selection: str) -> tuple[int, str]:
    match = _TIER1_SELECTION_RE.fullmatch(selection)
    if match is None:
        return (10**9, selection)
    return (int(match.group(1)), match.group(2))


def _walk_evidence_ids(value: Any, path: str) -> Iterator[str]:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key == "evidenceIds":
                if not isinstance(child, list) or not all(
                    isinstance(item, str) for item in child
                ):
                    raise ValueError(f"{child_path} must be a list of strings")
                yield from child
            else:
                yield from _walk_evidence_ids(child, child_path)
    elif isinstance(value, list):
        for position, child in enumerate(value):
            yield from _walk_evidence_ids(child, f"{path}[{position}]")


def collect_evidence_references(repo_root: Path) -> list[tuple[str, str]]:
    """Enumerate evidence foreign keys from every supported registry consumer."""

    repo_root = Path(repo_root)
    references: list[tuple[str, str]] = []
    for filename in _REFERENCE_FILES:
        path = repo_root / filename
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        references.extend(
            (filename, evidence_id)
            for evidence_id in _walk_evidence_ids(payload, filename)
        )
    return references


def _copy_string_fields(mapping: dict, allowed_fields: set[str]) -> dict:
    return {
        field: mapping[field]
        for field in sorted(allowed_fields)
        if isinstance(mapping.get(field), str)
    }


def _build_public_citation(citation: dict) -> dict:
    projected = _copy_string_fields(
        citation, PUBLIC_CITATION_FIELDS - {"authors", "year"}
    )
    year = citation.get("year")
    if type(year) is int:
        projected["year"] = year

    authors = citation.get("authors")
    if isinstance(authors, list):
        projected_authors = []
        for author in authors:
            if not isinstance(author, dict):
                continue
            projected_author = _copy_string_fields(author, {"family", "given"})
            if projected_author:
                projected_authors.append(projected_author)
        projected["authors"] = projected_authors
    return projected


def _build_public_curriculum(curriculum: dict) -> dict:
    projected = _copy_string_fields(curriculum, {"role"})
    tier = curriculum.get("tier")
    if type(tier) is int:
        projected["tier"] = tier

    list_types = {
        "weekNumbers": int,
        "topicSlugs": str,
        "pairedTools": str,
    }
    for field, item_type in list_types.items():
        values = curriculum.get(field)
        if not isinstance(values, list):
            continue
        if item_type is int:
            projected[field] = [value for value in values if type(value) is int]
        else:
            projected[field] = [value for value in values if isinstance(value, str)]
    return projected


def build_public_projection(registry: dict) -> dict:
    """Build a detached, allow-listed learner-safe view of the registry."""

    projected_sources: list[dict] = []
    sources = registry.get("sources", [])
    if isinstance(sources, list):
        for source in sources:
            if not isinstance(source, dict):
                continue
            projected = _copy_string_fields(
                source, PUBLIC_SOURCE_FIELDS - {"citation", "curriculum"}
            )
            citation = source.get("citation")
            if isinstance(citation, dict):
                projected["citation"] = _build_public_citation(citation)
            curriculum = source.get("curriculum")
            if isinstance(curriculum, dict):
                projected["curriculum"] = _build_public_curriculum(curriculum)
            projected_sources.append(projected)

    schema_version = registry.get("schemaVersion")
    return {
        "schemaVersion": schema_version if type(schema_version) is int else None,
        "sources": projected_sources,
    }


def build_surveillance_projection(registry: dict) -> dict:
    """Build the detached legacy-shaped configuration used by collectors."""

    contract_issues = validate_surveillance_contract(registry)
    if contract_issues:
        first_issue = contract_issues[0]
        raise ValueError(
            f"surveillance projection contract invalid at {first_issue.path}: "
            f"{first_issue.message}"
        )

    settings = registry.get("surveillance")
    settings = settings if isinstance(settings, dict) else {}
    required_settings = {
        "version",
        "updated",
        "owner",
        "defaults",
        "link_monitor",
        "resource_intake",
    }
    missing_settings = required_settings - set(settings)
    if missing_settings:
        raise ValueError(
            "surveillance projection is missing settings: "
            + ", ".join(sorted(missing_settings))
        )
    link_monitor = settings.get("link_monitor")
    if not isinstance(link_monitor, dict) or not isinstance(
        link_monitor.get("cadence"), str
    ):
        raise ValueError("surveillance projection requires link_monitor.cadence")

    projected_sources: list[dict] = []
    sources = registry.get("sources")
    if isinstance(sources, list):
        for source in sources:
            if not isinstance(source, dict) or not isinstance(
                source.get("surveillance"), dict
            ):
                continue
            citation = source.get("citation")
            citation = citation if isinstance(citation, dict) else {}
            projected = {
                "id": source.get("id"),
                "name": citation.get("title"),
                "url": citation.get("url"),
            }
            projected.update(copy.deepcopy(source["surveillance"]))
            projected_sources.append(projected)

    projected_ids = [source.get("id") for source in projected_sources]
    if len(projected_ids) != len(SURVEILLANCE_SOURCE_IDS) or set(
        projected_ids
    ) != SURVEILLANCE_SOURCE_IDS:
        raise ValueError(
            "surveillance projection must contain exactly the eight monitored source IDs"
        )

    return {
        "version": settings.get("version"),
        "updated": settings.get("updated"),
        "owner": settings.get("owner"),
        "defaults": copy.deepcopy(settings.get("defaults")),
        "sources": projected_sources,
        "link_monitor": copy.deepcopy(settings.get("link_monitor")),
        "resource_intake": copy.deepcopy(settings.get("resource_intake")),
    }


def _cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    generate = subparsers.add_parser(
        "generate", help="generate deterministic Tier 1 evidence views"
    )
    generate.add_argument(
        "--check",
        action="store_true",
        help="report stale generated views without writing them",
    )
    generate.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="repository root containing evidence_registry.json",
    )
    return parser


def _generate_cli(repo_root: Path, check: bool) -> int:
    repo_root = Path(repo_root).expanduser().resolve()
    outputs = generated_outputs(repo_root)
    stale = [
        path
        for path, expected_text in outputs.items()
        if not path.exists() or path.read_text(encoding="utf-8") != expected_text
    ]
    if check:
        if stale:
            for path in stale:
                print(f"stale generated evidence view: {path.relative_to(repo_root)}")
            return 1
        print("generated evidence views are current")
        return 0

    for path in stale:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(outputs[path], encoding="utf-8")
        print(f"wrote generated evidence view: {path.relative_to(repo_root)}")
    if not stale:
        print("generated evidence views are current")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _cli_parser().parse_args(argv)
    if args.command == "generate":
        return _generate_cli(args.repo_root, args.check)
    raise AssertionError(f"unhandled command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
