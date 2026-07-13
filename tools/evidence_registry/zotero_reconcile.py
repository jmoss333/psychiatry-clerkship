#!/usr/bin/env python3
"""Read-only Zotero metadata snapshots and evidence-registry reconciliation."""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

try:
    from .registry import (
        load_evidence_registry,
        normalize_doi,
        normalize_pmid,
        normalize_title,
        tier1_sources,
    )
except ImportError:  # Direct invocation from the repository checkout.
    from registry import (
        load_evidence_registry,
        normalize_doi,
        normalize_pmid,
        normalize_title,
        tier1_sources,
    )


API_VERSION = "3"
PAGE_SIZE = 100
_ITEM_KEY_RE = r"[A-Z0-9]{8}"
_READ_ONLY_ROUTES = (
    re.compile(r"^/api/$"),
    re.compile(r"^/connector/ping$"),
    re.compile(r"^/api/users/0/collections$"),
    re.compile(r"^/api/users/0/items/top\?limit=100&start=\d+$"),
    re.compile(rf"^/api/users/0/items/{_ITEM_KEY_RE}/children$"),
    re.compile(rf"^/api/users/0/items/{_ITEM_KEY_RE}/file/view/url$"),
)
_SENSITIVE_KEYS = {
    "attachments",
    "attachmentkey",
    "attachmentpath",
    "children",
    "childkey",
    "extractedtext",
    "filepath",
    "fileurl",
    "fileviewurl",
    "fulltext",
    "indexedtext",
    "localpath",
    "storagepath",
}
_ABSOLUTE_WINDOWS_PATH = re.compile(r"^(?:[A-Za-z]:[\\/]|\\\\)")
_PMID_RE = re.compile(r"(?:^|\s)PMID\s*:\s*(\d+)(?:\s|$)", re.IGNORECASE)
_YEAR_RE = re.compile(r"(?<!\d)((?:1[5-9]|20|21)\d{2})(?!\d)")
_ATTACHMENT_MODES = {"imported_file", "linked_file"}


@dataclass(frozen=True)
class ReconciliationIssue:
    """One deterministic reconciliation error or warning."""

    code: str
    message: str
    evidence_id: str = ""


@dataclass
class ReconciliationResult:
    """Identity matches plus non-mutating reconciliation findings."""

    matches: list[dict[str, Any]] = field(default_factory=list)
    errors: list[ReconciliationIssue] = field(default_factory=list)
    warnings: list[ReconciliationIssue] = field(default_factory=list)

    @property
    def matched_count(self) -> int:
        return len(self.matches)

    def to_dict(self) -> dict[str, Any]:
        return {
            "matched": self.matches,
            "matchedCount": self.matched_count,
            "errors": [asdict(issue) for issue in self.errors],
            "warnings": [asdict(issue) for issue in self.warnings],
        }


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _validate_base_url(base_url: str) -> str:
    parsed = urllib.parse.urlsplit(base_url)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("Zotero base URL must be a loopback HTTP origin")
    if parsed.port != 23119:
        raise ValueError("Zotero local API must use port 23119")
    return base_url.rstrip("/")


def _validate_read_only_route(path: str) -> None:
    if not isinstance(path, str) or not any(
        route.fullmatch(path) for route in _READ_ONLY_ROUTES
    ):
        raise ValueError(f"route is not in the read-only Zotero allowlist: {path!r}")


def api_get(path: str, base_url: str, timeout: float = 5.0) -> object:
    """GET one explicitly allowlisted Zotero Desktop local-API route."""

    _validate_read_only_route(path)
    origin = _validate_base_url(base_url)
    request = urllib.request.Request(
        origin + path,
        headers={"Zotero-API-Version": API_VERSION},
        method="GET",
    )
    opener = urllib.request.build_opener(_NoRedirect())
    try:
        response = opener.open(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        if (
            path.endswith("/file/view/url")
            and 300 <= exc.code < 400
            and exc.headers.get("Location")
        ):
            return {"url": exc.headers["Location"]}
        if 300 <= exc.code < 400:
            raise ValueError("unexpected redirect from Zotero metadata route") from exc
        raise
    with response:
        payload = response.read()
    if not payload:
        return {}
    decoded = payload.decode("utf-8", errors="strict")
    try:
        return json.loads(decoded)
    except json.JSONDecodeError:
        return decoded


def fetch_all(path: str, base_url: str) -> list[dict]:
    """Read all top-level Zotero items in stable pages of 100."""

    if path.rstrip("/") != "/api/users/0/items/top":
        raise ValueError("fetch_all only supports the top-level items route")
    rows: list[dict] = []
    start = 0
    while True:
        page = api_get(
            f"/api/users/0/items/top?limit={PAGE_SIZE}&start={start}", base_url
        )
        if not isinstance(page, list) or not all(isinstance(row, dict) for row in page):
            raise ValueError("Zotero top-level item response must be a list of objects")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def _project_collection(collection: dict) -> dict:
    data = collection.get("data") if isinstance(collection.get("data"), dict) else {}
    return {
        "key": collection.get("key", ""),
        "data": {
            "name": data.get("name", ""),
            "parentCollection": data.get("parentCollection", False),
        },
    }


def _project_parent_item(item: dict) -> dict:
    data = item.get("data") if isinstance(item.get("data"), dict) else {}
    meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
    projected_data = {
        key: copy.deepcopy(data.get(key, default))
        for key, default in (
            ("itemType", ""),
            ("title", ""),
            ("creators", []),
            ("date", ""),
            ("publicationTitle", ""),
            ("DOI", ""),
            ("archiveLocation", ""),
            ("tags", []),
            ("collections", []),
        )
    }
    return {
        "key": item.get("key", ""),
        "data": projected_data,
        "meta": {"numChildren": meta.get("numChildren", 0)},
    }


def snapshot_library(config: dict) -> dict:
    """Collect a metadata-only snapshot; never enumerate attachment children."""

    _validate_config(config)
    base_url = config["baseUrl"]
    collections = api_get("/api/users/0/collections", base_url)
    if not isinstance(collections, list) or not all(
        isinstance(row, dict) for row in collections
    ):
        raise ValueError("Zotero collection response must be a list of objects")
    items = fetch_all("/api/users/0/items/top", base_url)
    snapshot = {
        "snapshotVersion": 1,
        "library": copy.deepcopy(config["library"]),
        "collections": [_project_collection(row) for row in collections],
        "items": [_project_parent_item(row) for row in items],
    }
    return sanitize_snapshot(snapshot)


def _normalized_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).casefold())


def _unsafe_string(value: str) -> bool:
    stripped = value.strip()
    lowered = stripped.casefold()
    return bool(
        lowered.startswith("file:")
        or lowered.startswith("zotero://open-pdf")
        or stripped.startswith(("/", "~/"))
        or _ABSOLUTE_WINDOWS_PATH.match(stripped)
    )


def sanitize_snapshot(snapshot: dict) -> dict:
    """Return a detached snapshot copy or fail closed on local/full-text data."""

    if not isinstance(snapshot, dict):
        raise ValueError("snapshot must be a JSON object")

    def visit(value: Any, trail: tuple[str, ...]) -> Any:
        if isinstance(value, dict):
            cleaned: dict[str, Any] = {}
            for key, nested in value.items():
                normalized = _normalized_key(key)
                if normalized in _SENSITIVE_KEYS or normalized.endswith("filepath"):
                    location = ".".join((*trail, str(key)))
                    raise ValueError(f"unsafe snapshot field: {location}")
                cleaned[str(key)] = visit(nested, (*trail, str(key)))
            return cleaned
        if isinstance(value, list):
            return [visit(nested, (*trail, str(index))) for index, nested in enumerate(value)]
        if isinstance(value, str) and _unsafe_string(value):
            location = ".".join(trail)
            raise ValueError(f"unsafe local location in snapshot field: {location}")
        return copy.deepcopy(value)

    return visit(snapshot, ())


def load_snapshot(path: Path | str) -> dict:
    """Load a fixture or local snapshot without contacting Zotero."""

    with Path(path).expanduser().open(encoding="utf-8") as handle:
        snapshot = json.load(handle)
    if not isinstance(snapshot, dict):
        raise ValueError("snapshot must be a JSON object")
    return snapshot


def creator_family(creators: list[dict]) -> str:
    """Return the first author family/corporate name from Zotero creators."""

    if not isinstance(creators, list):
        return ""
    for creator in creators:
        if not isinstance(creator, dict) or creator.get("creatorType") != "author":
            continue
        family = creator.get("lastName")
        if isinstance(family, str) and family.strip():
            return family.strip()
        name = creator.get("name")
        if isinstance(name, str) and name.strip():
            return name.strip()
    return ""


def publication_year(value: str | int | None) -> str:
    """Extract a four-digit publication year from Zotero's flexible date field."""

    if value is None or isinstance(value, bool):
        return ""
    match = _YEAR_RE.search(str(value))
    return match.group(1) if match else ""


def _item_data(item: dict) -> dict:
    data = item.get("data")
    return data if isinstance(data, dict) else {}


def _item_pmid(item: dict) -> str:
    archive_location = _item_data(item).get("archiveLocation")
    if not isinstance(archive_location, str):
        return ""
    match = _PMID_RE.search(archive_location)
    return normalize_pmid(match.group(1)) if match else ""


def _source_first_author(source: dict) -> str:
    citation = source.get("citation")
    if not isinstance(citation, dict):
        return ""
    authors = citation.get("authors")
    if not isinstance(authors, list):
        return ""
    for author in authors:
        if not isinstance(author, dict):
            continue
        family = author.get("family")
        if isinstance(family, str) and family.strip():
            return family.strip()
    return ""


def _identity_differences(source: dict, item: dict) -> list[str]:
    citation = source.get("citation")
    citation = citation if isinstance(citation, dict) else {}
    data = _item_data(item)
    comparisons = (
        ("DOI", normalize_doi(citation.get("doi")), normalize_doi(data.get("DOI"))),
        ("PMID", normalize_pmid(citation.get("pmid")), _item_pmid(item)),
        ("title", normalize_title(citation.get("title")), normalize_title(data.get("title"))),
        (
            "first author",
            normalize_title(_source_first_author(source)),
            normalize_title(creator_family(data.get("creators", []))),
        ),
        ("year", publication_year(citation.get("year")), publication_year(data.get("date"))),
        (
            "journal",
            normalize_title(citation.get("journal")),
            normalize_title(data.get("publicationTitle")),
        ),
    )
    return [name for name, expected, observed in comparisons if expected and expected != observed]


def _title_author_year(source: dict) -> tuple[str, str, str]:
    citation = source.get("citation")
    citation = citation if isinstance(citation, dict) else {}
    return (
        normalize_title(citation.get("title")),
        normalize_title(_source_first_author(source)),
        publication_year(citation.get("year")),
    )


def _item_title_author_year(item: dict) -> tuple[str, str, str]:
    data = _item_data(item)
    return (
        normalize_title(data.get("title")),
        normalize_title(creator_family(data.get("creators", []))),
        publication_year(data.get("date")),
    )


def _bibliographic_parents(snapshot: dict) -> list[dict]:
    items = snapshot.get("items")
    if not isinstance(items, list):
        return []
    return [
        item
        for item in items
        if isinstance(item, dict)
        and _item_data(item).get("itemType") not in {"attachment", "note"}
    ]


def _find_fallback(source: dict, items: list[dict]) -> tuple[dict | None, str, bool]:
    citation = source.get("citation")
    citation = citation if isinstance(citation, dict) else {}
    stages: list[tuple[str, str, Any]] = []
    doi = normalize_doi(citation.get("doi"))
    if doi:
        stages.append(("doi", doi, lambda row: normalize_doi(_item_data(row).get("DOI"))))
    pmid = normalize_pmid(citation.get("pmid"))
    if pmid:
        stages.append(("pmid", pmid, _item_pmid))
    title_key = _title_author_year(source)
    if all(title_key):
        stages.append(("title-author-year", title_key, _item_title_author_year))

    for method, expected, getter in stages:
        candidates = [item for item in items if getter(item) == expected]
        if len(candidates) > 1:
            return None, method, True
        if len(candidates) == 1:
            return candidates[0], method, False
    return None, "", False


def _tag_values(item: dict) -> set[str]:
    values: set[str] = set()
    tags = _item_data(item).get("tags")
    if not isinstance(tags, list):
        return values
    for tag in tags:
        if isinstance(tag, str) and tag.strip():
            values.add(tag.strip())
        elif isinstance(tag, dict):
            value = tag.get("tag")
            if isinstance(value, str) and value.strip():
                values.add(value.strip())
    return values


def _collection_name(collection: dict) -> str:
    data = collection.get("data")
    if isinstance(data, dict) and isinstance(data.get("name"), str):
        return data["name"]
    name = collection.get("name")
    return name if isinstance(name, str) else ""


def _validate_config(config: dict) -> None:
    if not isinstance(config, dict):
        raise ValueError("Zotero configuration must be an object")
    _validate_base_url(config.get("baseUrl", ""))
    if str(config.get("apiVersion")) != API_VERSION:
        raise ValueError("Zotero API version must be 3")
    library = config.get("library")
    if library != {"type": "user", "id": 0}:
        raise ValueError("only Zotero user library 0 is supported")
    if not isinstance(config.get("rootCollection"), dict):
        raise ValueError("rootCollection configuration is required")
    if not isinstance(config.get("weekCollections"), list):
        raise ValueError("weekCollections configuration is required")
    expected_tags = config.get("expectedTier1Tags")
    if not isinstance(expected_tags, list) or not all(
        isinstance(tag, str) and tag for tag in expected_tags
    ):
        raise ValueError("expectedTier1Tags must be a list of nonempty strings")


def _collection_findings(
    snapshot: dict, config: dict
) -> tuple[list[ReconciliationIssue], list[ReconciliationIssue]]:
    collections = snapshot.get("collections")
    collections = collections if isinstance(collections, list) else []
    by_key = {
        row.get("key"): row
        for row in collections
        if isinstance(row, dict) and isinstance(row.get("key"), str)
    }
    errors: list[ReconciliationIssue] = []
    warnings: list[ReconciliationIssue] = []
    configured = [config["rootCollection"], *config["weekCollections"]]
    for expected in configured:
        key = expected.get("key")
        observed = by_key.get(key)
        if observed is None:
            errors.append(
                ReconciliationIssue(
                    "collection-config-error", f"configured Zotero collection is missing: {key}"
                )
            )
        elif _collection_name(observed) != expected.get("name"):
            errors.append(
                ReconciliationIssue(
                    "collection-config-error",
                    f"configured Zotero collection name mismatch: {key}",
                )
            )

    items = _bibliographic_parents(snapshot)
    for week in config["weekCollections"]:
        key = week.get("key")
        occupied = any(
            key in _item_data(item).get("collections", [])
            for item in items
            if isinstance(_item_data(item).get("collections", []), list)
        )
        if not occupied:
            warnings.append(
                ReconciliationIssue(
                    "week-collection-advisory",
                    f"Zotero week collection is empty; registry mapping remains authoritative: {key}",
                )
            )
    return errors, warnings


def reconcile_registry(
    registry: dict, snapshot: dict, config: dict
) -> ReconciliationResult:
    """Compare Tier 1 registry authority with one detached Zotero snapshot."""

    _validate_config(config)
    snapshot = sanitize_snapshot(snapshot)
    result = ReconciliationResult()
    collection_errors, collection_warnings = _collection_findings(snapshot, config)
    result.errors.extend(collection_errors)
    result.warnings.extend(collection_warnings)
    items = _bibliographic_parents(snapshot)
    by_key = {
        item.get("key"): item
        for item in items
        if isinstance(item.get("key"), str) and item.get("key")
    }
    expected_tags = set(config["expectedTier1Tags"])
    prior_statuses = snapshot.get("attachmentStatuses", {})
    prior_statuses = prior_statuses if isinstance(prior_statuses, dict) else {}

    for source in tier1_sources(registry):
        evidence_id = source.get("id", "")
        zotero = source.get("zotero")
        zotero = zotero if isinstance(zotero, dict) else {}
        stored_key = zotero.get("itemKey")
        item: dict | None = None
        method = ""
        if isinstance(stored_key, str) and stored_key:
            item = by_key.get(stored_key)
            method = "stored-key"
            if item is None:
                result.errors.append(
                    ReconciliationIssue(
                        "stored-key-missing",
                        f"stored Zotero parent key is absent: {stored_key}",
                        evidence_id,
                    )
                )
                continue
        else:
            item, method, ambiguous = _find_fallback(source, items)
            if ambiguous:
                result.errors.append(
                    ReconciliationIssue(
                        "ambiguous",
                        f"multiple Zotero candidates at {method}; no identity was guessed",
                        evidence_id,
                    )
                )
                continue
            if item is None:
                result.errors.append(
                    ReconciliationIssue(
                        "not-found", "no unique Zotero identity candidate", evidence_id
                    )
                )
                continue

        differences = _identity_differences(source, item)
        if differences:
            result.errors.append(
                ReconciliationIssue(
                    "identity-conflict",
                    "Zotero parent identity differs in: " + ", ".join(differences),
                    evidence_id,
                )
            )
            continue

        missing_tags = sorted(expected_tags - _tag_values(item))
        if missing_tags:
            result.errors.append(
                ReconciliationIssue(
                    "missing-tier1-tag",
                    "Zotero parent is missing expected tags: " + ", ".join(missing_tags),
                    evidence_id,
                )
            )

        item_key = item.get("key", "")
        attachment = prior_statuses.get(item_key)
        if not isinstance(attachment, dict):
            attachment = {"state": None}
        result.matches.append(
            {
                "evidenceId": evidence_id,
                "itemKey": item_key,
                "method": method,
                "attachment": copy.deepcopy(attachment),
            }
        )
    return result


def inspect_attachment_children(
    parent_key: str, children: list[dict], explicit: bool
) -> dict:
    """Reduce transient child/probe data to a path-free attachment observation."""

    del parent_key  # Parent keys are intentionally absent from the returned status.
    if not explicit:
        for child in children if isinstance(children, list) else []:
            if isinstance(child, dict) and isinstance(child.get("priorObserved"), dict):
                return sanitize_snapshot(child["priorObserved"])
        return {"state": None}

    best: dict[str, Any] = {"state": "metadata_only"}
    rank = {
        "metadata_only": 0,
        "pdf_invalid": 1,
        "pdf_attached": 2,
        "pdf_verified": 3,
        "pdf_indexed": 4,
    }
    for child in children if isinstance(children, list) else []:
        if not isinstance(child, dict):
            continue
        data = _item_data(child)
        if (
            data.get("itemType") != "attachment"
            or data.get("linkMode") not in _ATTACHMENT_MODES
            or str(data.get("contentType", "")).casefold() != "application/pdf"
        ):
            continue
        candidate: dict[str, Any] = {
            "state": "pdf_attached",
            "contentType": "application/pdf",
        }
        probe = child.get("_fileProbe")
        if isinstance(probe, dict):
            byte_count = probe.get("byteCount")
            signature = probe.get("signature")
            if (
                probe.get("exists") is not True
                or not isinstance(byte_count, int)
                or isinstance(byte_count, bool)
                or byte_count <= 0
                or not isinstance(signature, str)
                or not signature.startswith("%PDF-")
            ):
                candidate["state"] = "pdf_invalid"
            else:
                candidate["state"] = (
                    "pdf_indexed" if probe.get("indexed") is True else "pdf_verified"
                )
            if isinstance(byte_count, int) and not isinstance(byte_count, bool):
                candidate["byteCount"] = byte_count
            for timestamp in ("modifiedAt", "verifiedAt", "checkedAt"):
                value = probe.get(timestamp)
                if isinstance(value, str) and value:
                    candidate[timestamp] = value
        if rank[candidate["state"]] > rank[best["state"]]:
            best = candidate
    return sanitize_snapshot(best)


def _probe_file_url(value: object) -> dict[str, Any]:
    """Read only a file URL returned by Zotero and retain no location data."""

    if not isinstance(value, str):
        return {"exists": False, "verifiedAt": ""}
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "file" or parsed.netloc not in {"", "localhost"}:
        return {"exists": False, "verifiedAt": ""}
    path = Path(urllib.parse.unquote(parsed.path))
    try:
        size = path.stat().st_size
        with path.open("rb") as handle:
            signature = handle.read(5).decode("ascii", errors="replace")
    except OSError:
        return {"exists": False, "verifiedAt": ""}
    return {"exists": True, "byteCount": size, "signature": signature, "indexed": False}


def _live_attachment_statuses(
    item_keys: list[str], config: dict
) -> dict[str, dict[str, Any]]:
    statuses: dict[str, dict[str, Any]] = {}
    base_url = config["baseUrl"]
    for parent_key in item_keys:
        children = api_get(f"/api/users/0/items/{parent_key}/children", base_url)
        if not isinstance(children, list):
            raise ValueError(f"Zotero child response is not a list: {parent_key}")
        transient = copy.deepcopy(children)
        for child in transient:
            if not isinstance(child, dict):
                continue
            data = _item_data(child)
            child_key = child.get("key")
            if (
                data.get("itemType") == "attachment"
                and data.get("linkMode") in _ATTACHMENT_MODES
                and str(data.get("contentType", "")).casefold() == "application/pdf"
                and isinstance(child_key, str)
                and re.fullmatch(_ITEM_KEY_RE, child_key)
            ):
                location = api_get(
                    f"/api/users/0/items/{child_key}/file/view/url", base_url
                )
                url = location.get("url") if isinstance(location, dict) else location
                child["_fileProbe"] = _probe_file_url(url)
        statuses[parent_key] = inspect_attachment_children(
            parent_key, transient, explicit=True
        )
    return statuses


def _load_config(path: Path) -> dict:
    with path.expanduser().open(encoding="utf-8") as handle:
        config = json.load(handle)
    _validate_config(config)
    return config


def _load_registry(path: Path) -> dict:
    return load_evidence_registry(path.expanduser().resolve())


def _print_result(result: ReconciliationResult) -> None:
    for issue in result.errors:
        print(f"error [{issue.code}] {issue.evidence_id}: {issue.message}")
    for issue in result.warnings:
        print(f"warning [{issue.code}] {issue.evidence_id}: {issue.message}")
    print(f"matched: {result.matched_count}")
    print(f"errors: {len(result.errors)}")
    print(f"warnings: {len(result.warnings)}")


def _common_snapshot_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--snapshot", type=Path, help="read a detached JSON snapshot")
    parser.add_argument(
        "--attachments",
        action="store_true",
        help="explicitly inspect matched attachment children and local PDF signatures",
    )


def _parser() -> argparse.ArgumentParser:
    module_dir = Path(__file__).resolve().parent
    repo_root = module_dir.parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config", type=Path, default=module_dir / "zotero_config.json"
    )
    parser.add_argument(
        "--registry", type=Path, default=repo_root / "evidence_registry.json"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("status", help="probe the local read-only API")
    subparsers.add_parser("snapshot", help="print a metadata-only library snapshot")
    check = subparsers.add_parser("check", help="reconcile registry and Zotero metadata")
    _common_snapshot_arguments(check)
    report = subparsers.add_parser("report", help="print a sanitized JSON reconciliation")
    _common_snapshot_arguments(report)
    return parser


def _snapshot_for_check(args: argparse.Namespace, config: dict, registry: dict) -> dict:
    if args.snapshot is not None:
        snapshot = sanitize_snapshot(load_snapshot(args.snapshot))
    else:
        snapshot = snapshot_library(config)
    if args.attachments and args.snapshot is None:
        first = reconcile_registry(registry, snapshot, config)
        matched_keys = [
            row["itemKey"]
            for row in first.matches
            if isinstance(row.get("itemKey"), str)
            and re.fullmatch(_ITEM_KEY_RE, row["itemKey"])
        ]
        snapshot = copy.deepcopy(snapshot)
        snapshot["attachmentStatuses"] = _live_attachment_statuses(
            matched_keys, config
        )
    return sanitize_snapshot(snapshot)


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        config = _load_config(args.config)
        if args.command == "status":
            api_status = api_get("/api/", config["baseUrl"])
            connector_status = api_get("/connector/ping", config["baseUrl"])
            print(f"api: {api_status}")
            print(f"connector: {connector_status}")
            return 0
        if args.command == "snapshot":
            print(json.dumps(snapshot_library(config), indent=2, sort_keys=True))
            return 0

        registry = _load_registry(args.registry)
        snapshot = _snapshot_for_check(args, config, registry)
        result = reconcile_registry(registry, snapshot, config)
        if args.command == "report":
            print(json.dumps(sanitize_snapshot(result.to_dict()), indent=2, sort_keys=True))
        else:
            _print_result(result)
        return 1 if result.errors else 0
    except (OSError, ValueError, urllib.error.URLError) as exc:
        print(f"api_unavailable: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
