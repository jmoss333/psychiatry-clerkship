#!/usr/bin/env python3
"""Offline loading, normalization, validation, and projection primitives."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator


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


@dataclass(frozen=True)
class ValidationIssue:
    """One registry problem with a machine-usable location and severity."""

    path: str
    message: str
    severity: str = "error"


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


def validate_registry(registry: dict) -> list[ValidationIssue]:
    """Aggregate every offline registry-contract issue without short-circuiting."""

    issues: list[ValidationIssue] = []
    if not isinstance(registry, dict):
        return [ValidationIssue("$", "registry must be a JSON object")]

    if registry.get("schemaVersion") != SCHEMA_VERSION:
        issues.append(
            ValidationIssue(
                "schemaVersion",
                f"schemaVersion must equal {SCHEMA_VERSION}",
            )
        )

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
            if not _nonempty_text(mapping_status):
                issues.append(
                    ValidationIssue(
                        f"{source_path}.curriculum.mappingStatus",
                        "Tier 1 mapping status must be non-empty",
                    )
                )
            elif mapping_status == "needs-faculty-confirmation":
                issues.append(
                    ValidationIssue(
                        f"{source_path}.curriculum.mappingStatus",
                        f"Tier 1 week assignment needs faculty confirmation: {source_id}",
                        severity="warning",
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
