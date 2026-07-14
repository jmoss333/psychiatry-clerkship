"""Resolve learner-visible Anki source links to exact reviewed Markdown passages."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from hashlib import sha256
import html
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import quote, unquote

from pcl_anki.contract import (
    ManifestIndex,
    Section,
    SourceResolution,
    WeekMap,
    normalize_source,
)


ATX_HEADING = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*$")
SETEXT_HEADING = re.compile(r"^[ \t]*(=+|-+)[ \t]*$")
WEEK_HEADING = re.compile(r"^#{1,6}[ \t]+Week[ \t]+([1-6])\b", re.IGNORECASE)
ROUTE_LINK = re.compile(r"[?&](page|tool)=([^&#)\s]+)")
PENDING_REVIEW = re.compile(
    r"(?:\bpending(?:[ \t]+faculty)?[ \t]+review\b|"
    r"\breview[ \t]+status\s*:\s*pending\b|"
    r"\bawaiting(?:[ \t]+faculty)?[ \t]+(?:review|attestation)\b)",
    re.IGNORECASE,
)
SEQUENCE_REVIEW_FIELDS = (
    "sequenceBasis",
    "sequenceRationale",
    "sequenceReviewedBy",
    "sequenceReviewedAt",
)


class SourceResolutionError(ValueError):
    """A fail-closed source governance error with a stable machine code."""

    def __init__(self, code: str, subject: str, message: str):
        super().__init__(f"{code}: {subject}: {message}")
        self.code = code
        self.subject = subject
        self.message = message


def _fail(code: str, subject: str, message: str) -> None:
    raise SourceResolutionError(code, subject, message)


def _load_json_mapping(value: Mapping | Path | str, subject: str) -> Mapping:
    if isinstance(value, Mapping):
        return value
    path = Path(value)
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        _fail("SOURCE_INPUT_INVALID", subject, str(error))
    if not isinstance(loaded, Mapping):
        _fail("SOURCE_INPUT_INVALID", subject, "expected a JSON object")
    return loaded


def _visible_heading_text(text: str) -> str:
    text = re.sub(r"\s+#+\s*$", "", text.strip())
    text = re.sub(r"!?(\[([^\]]*)\])\([^)]*\)", lambda match: match.group(2), text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\\([\\`*{}\[\]()#+\-.!_>~|])", r"\1", text)
    return text.translate(str.maketrans("", "", "`*_~"))


def heading_slug(text: str) -> str:
    """Return the governed ASCII fragment for visible Markdown heading text."""

    visible = _visible_heading_text(str(text))
    decomposed = unicodedata.normalize("NFKD", visible)
    without_marks = "".join(
        character
        for character in decomposed
        if not unicodedata.combining(character)
    )
    ascii_text = without_marks.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")


def _heading_records(lines: list[str]) -> list[tuple[int, int, int, str]]:
    records: list[tuple[int, int, int, str]] = []
    index = 0
    while index < len(lines):
        atx = ATX_HEADING.match(lines[index])
        if atx:
            title = re.sub(r"[ \t]+#+[ \t]*$", "", atx.group(2)).strip()
            records.append((index, index + 1, len(atx.group(1)), title))
            index += 1
            continue
        if index + 1 < len(lines):
            setext = SETEXT_HEADING.match(lines[index + 1])
            if setext and lines[index].strip():
                level = 1 if setext.group(1).startswith("=") else 2
                records.append((index, index + 2, level, lines[index].strip()))
                index += 2
                continue
        index += 1
    return records


def parse_markdown_sections(text: str) -> tuple[Section, ...]:
    """Parse ATX/Setext headings and their equal-or-higher-level boundaries."""

    canonical = str(text).replace("\r\n", "\n").replace("\r", "\n")
    lines = canonical.splitlines()
    records = _heading_records(lines)
    sections: list[Section] = []
    for position, (start, _heading_end, level, title) in enumerate(records):
        end = len(lines)
        for later_start, _later_heading_end, later_level, _later_title in records[
            position + 1 :
        ]:
            if later_level <= level:
                end = later_start
                break
        raw_text = "\n".join(lines[start:end])
        sections.append(
            Section(
                anchor=heading_slug(title),
                title=title,
                level=level,
                start_line=start + 1,
                end_line=end,
                raw_text=raw_text,
                normalized_text=normalize_source(raw_text),
            )
        )
    return tuple(sections)


def load_manifest(path: Path | str) -> ManifestIndex:
    """Load the Markdown manifest, rejecting every duplicate path or slug."""

    manifest_path = Path(path)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        _fail("MANIFEST_INVALID", str(manifest_path), str(error))
    rows = manifest.get("md") if isinstance(manifest, Mapping) else None
    if not isinstance(rows, list):
        _fail("MANIFEST_INVALID", str(manifest_path), "md must be an array")

    path_to_slug: dict[str, str] = {}
    slug_to_path: dict[str, str] = {}
    slug_to_title: dict[str, str] = {}
    for index, row in enumerate(rows):
        if not isinstance(row, list) or len(row) != 3 or not all(
            isinstance(value, str) and value for value in row
        ):
            _fail(
                "MANIFEST_INVALID",
                f"md[{index}]",
                "expected [source path, output slug, title]",
            )
        source_path, slug, title = row
        if source_path in path_to_slug:
            _fail(
                "MANIFEST_DUPLICATE_PATH",
                source_path,
                "Markdown source path appears more than once",
            )
        if slug in slug_to_path:
            _fail(
                "MANIFEST_DUPLICATE_SLUG",
                slug,
                "Markdown output slug appears more than once",
            )
        path_to_slug[source_path] = slug
        slug_to_path[slug] = source_path
        slug_to_title[slug] = title
    return ManifestIndex(path_to_slug, slug_to_path, slug_to_title)


def load_week_map(path: Path | str, manifest: ManifestIndex) -> WeekMap:
    """Read each routed page/tool and retain its earliest declared week."""

    week_map_path = Path(path)
    try:
        text = week_map_path.read_text(encoding="utf-8")
    except OSError as error:
        _fail("WEEK_MAP_INVALID", str(week_map_path), str(error))
    current_week: int | None = None
    slug_to_first_week: dict[str, int] = {}
    tool_to_first_week: dict[str, int] = {}
    for line_number, line in enumerate(text.splitlines(), start=1):
        week = WEEK_HEADING.match(line)
        if week:
            current_week = int(week.group(1))
        if current_week is None:
            continue
        for kind, encoded in ROUTE_LINK.findall(line):
            routed_name = unquote(encoded)
            target = slug_to_first_week if kind == "page" else tool_to_first_week
            if kind == "page" and routed_name not in manifest.slug_to_path:
                _fail(
                    "WEEK_MAP_UNKNOWN_SLUG",
                    f"{week_map_path}:{line_number}",
                    f"{routed_name!r} is not a manifest Markdown slug",
                )
            target[routed_name] = min(target.get(routed_name, current_week), current_week)
    return WeekMap(slug_to_first_week, tool_to_first_week)


def sequence_review_payload(card_review: Mapping | None) -> dict[str, object]:
    """Project the sequencing decision fields included in exact card approval hashes."""

    review = card_review or {}
    return {
        field: review[field]
        for field in SEQUENCE_REVIEW_FIELDS
        if field in review
    }


def _source_sequence_context(source: SourceResolution | Mapping) -> tuple[str, int | None, str | None, Mapping | None]:
    if isinstance(source, SourceResolution):
        return source.slug, None, None, None
    if not isinstance(source, Mapping):
        _fail("SOURCE_SEQUENCE_INVALID", "source", "expected a source or card mapping")
    nested = source.get("source")
    source_value = nested if isinstance(nested, Mapping) else source
    slug = source_value.get("slug")
    if not isinstance(slug, str) or not slug:
        _fail("SOURCE_SEQUENCE_INVALID", "source.slug", "a nonempty slug is required")
    week = source.get("week")
    if week is None and source_value is source:
        week = source_value.get("week")
    if week is not None and (not isinstance(week, int) or isinstance(week, bool)):
        _fail("SOURCE_SEQUENCE_INVALID", "week", "week must be an integer")
    namespace = source.get("namespace") or source_value.get("namespace")
    kind = source.get("kind") or source_value.get("kind")
    if namespace is None and kind in {"basic", "cloze"}:
        namespace = "core"
    elif namespace is None and kind == "application":
        namespace = "application"
    review = source.get("review") if isinstance(source.get("review"), Mapping) else None
    return slug, week, namespace, review


def _validate_sequence_override(review: Mapping | None, slug: str) -> None:
    if not isinstance(review, Mapping) or review.get("sequenceBasis") != "faculty_override":
        _fail(
            "SOURCE_SEQUENCE_MISSING",
            slug,
            "Core/Application authority is absent from the weekly map",
        )
    required = ("sequenceRationale", "sequenceReviewedBy", "sequenceReviewedAt")
    if any(
        not isinstance(review.get(field), str) or not review[field].strip()
        for field in required
    ):
        _fail(
            "SEQUENCE_OVERRIDE_INCOMPLETE",
            slug,
            "faculty override requires a rationale, named reviewer, and review date",
        )
    try:
        date.fromisoformat(str(review["sequenceReviewedAt"]))
    except ValueError:
        _fail(
            "SEQUENCE_OVERRIDE_INCOMPLETE",
            slug,
            "sequenceReviewedAt must be an ISO date",
        )


def resolve_introduced_week(
    source: SourceResolution | Mapping,
    week_map: WeekMap,
    card_review: Mapping | None = None,
) -> int | None:
    """Resolve and enforce Core/Application sequencing while exempting full qbank."""

    slug, week, namespace, embedded_review = _source_sequence_context(source)
    introduced = week_map.slug_to_first_week.get(slug)
    if namespace == "qbank" or (week is None and namespace not in {"core", "application"}):
        return introduced
    review = card_review if card_review is not None else embedded_review
    if introduced is None:
        _validate_sequence_override(review, slug)
        return None
    if week is not None and week < introduced:
        _fail(
            "SOURCE_WEEK_BEFORE_INTRODUCTION",
            slug,
            f"card Week {week} precedes earliest introduced Week {introduced}",
        )
    return introduced


def _release_config(repo_root: Path) -> Mapping:
    path = repo_root / "13_Faculty_Resources" / "anki" / "release_config.json"
    return _load_json_mapping(path, str(path))


def _validate_authority_prefixes(
    repo_root: Path, manifest: ManifestIndex, config: Mapping
) -> tuple[str, ...]:
    prefixes = config.get("primaryAuthorityPathPrefixes")
    if not isinstance(prefixes, list) or not prefixes:
        _fail(
            "AUTHORITY_CONFIG_INVALID",
            "primaryAuthorityPathPrefixes",
            "at least one authority prefix is required",
        )
    for prefix in prefixes:
        if not isinstance(prefix, str) or not prefix:
            _fail(
                "AUTHORITY_CONFIG_INVALID",
                "primaryAuthorityPathPrefixes",
                "prefixes must be nonempty strings",
            )
        if not (repo_root / prefix.rstrip("/")).is_dir():
            _fail(
                "AUTHORITY_PREFIX_MISSING",
                prefix,
                "configured primary-authority directory does not exist",
            )
        if not any(path.startswith(prefix) for path in manifest.path_to_slug):
            _fail(
                "AUTHORITY_PREFIX_UNMAPPED",
                prefix,
                "configured primary-authority prefix matches no manifest Markdown path",
            )
    return tuple(prefixes)


def _reviewed_entries(reviewed: Mapping | Path | str) -> Mapping:
    value = _load_json_mapping(reviewed, "reviewed")
    items = value.get("items")
    return items if isinstance(items, Mapping) else value


def _surveillance_slugs(surveillance: Mapping | Path | str) -> set[str]:
    value = _load_json_mapping(surveillance, "surveillance")
    slugs = value.get("slugs", [])
    if not isinstance(slugs, list) or not all(isinstance(slug, str) for slug in slugs):
        _fail("SOURCE_INPUT_INVALID", "surveillance.slugs", "expected an array of slugs")
    return set(slugs)


def resolve_source(
    repo_root: Path | str,
    source: Mapping,
    manifest: ManifestIndex,
    reviewed: Mapping | Path | str,
    surveillance: Mapping | Path | str,
) -> SourceResolution:
    """Bind one declared source quote to one reviewed, governed Markdown section."""

    root = Path(repo_root)
    if not isinstance(source, Mapping):
        _fail("SOURCE_INPUT_INVALID", "source", "expected a source mapping")
    source_path = source.get("path")
    slug = source.get("slug")
    anchor = source.get("anchor")
    raw_quote = source.get("quote")
    for field, value in (
        ("path", source_path),
        ("slug", slug),
        ("anchor", anchor),
        ("quote", raw_quote),
    ):
        if not isinstance(value, str) or not value.strip():
            _fail("SOURCE_INPUT_INVALID", f"source.{field}", "a nonempty string is required")

    config = _release_config(root)
    primary_prefixes = _validate_authority_prefixes(root, manifest, config)
    if source_path not in manifest.path_to_slug:
        _fail(
            "SOURCE_PATH_NOT_IN_MANIFEST",
            source_path,
            "source path is not an exact member of manifest.md",
        )
    canonical_slug = manifest.path_to_slug[source_path]
    if slug != canonical_slug:
        _fail(
            "SOURCE_SLUG_MISMATCH",
            slug,
            f"manifest maps {source_path!r} to {canonical_slug!r}",
        )

    sequencing_only = config.get("sequencingOnlyPaths", [])
    if source_path in sequencing_only:
        _fail(
            "SOURCE_SEQUENCING_ONLY",
            source_path,
            "sequencing/index material cannot be a primary clinical authority",
        )
    context_prefixes = config.get("contextOnlyPathPrefixes", [])
    if any(source_path.startswith(prefix) for prefix in context_prefixes):
        _fail(
            "SOURCE_CONTEXT_ONLY",
            source_path,
            "case and OSCE material is context-only, not primary authority",
        )
    if not any(source_path.startswith(prefix) for prefix in primary_prefixes):
        _fail(
            "SOURCE_NOT_PRIMARY_AUTHORITY",
            source_path,
            "source is outside every configured primary-authority prefix",
        )

    review = _reviewed_entries(reviewed).get(slug)
    if not isinstance(review, Mapping) or review.get("status") != "reviewed":
        _fail(
            "SOURCE_NOT_REVIEWED",
            slug,
            "source slug does not have reviewed status",
        )
    if slug in _surveillance_slugs(surveillance):
        _fail(
            "SOURCE_NEEDS_REATTEST",
            slug,
            "source is listed for faculty re-attestation",
        )

    markdown_path = root / source_path
    try:
        markdown = markdown_path.read_text(encoding="utf-8")
    except OSError as error:
        _fail("SOURCE_FILE_UNREADABLE", source_path, str(error))
    if PENDING_REVIEW.search(markdown):
        _fail(
            "SOURCE_PENDING_REVIEW_BANNER",
            source_path,
            "source text still carries a pending-review banner",
        )

    sections = parse_markdown_sections(markdown)
    matching_sections = [section for section in sections if section.anchor == anchor]
    if not matching_sections:
        _fail(
            "SOURCE_ANCHOR_MISSING",
            anchor,
            "declared heading fragment does not exist in the source",
        )
    if len(matching_sections) != 1:
        _fail(
            "SOURCE_ANCHOR_DUPLICATED",
            anchor,
            "declared heading fragment is not unique in the source",
        )
    section = matching_sections[0]
    normalized_quote = normalize_source(raw_quote)
    section_occurrences = section.normalized_text.count(normalized_quote)
    if section_occurrences == 0:
        if normalize_source(markdown).count(normalized_quote):
            _fail(
                "SOURCE_QUOTE_OUTSIDE_SECTION",
                anchor,
                "declared quote exists, but not inside the named section",
            )
        _fail(
            "SOURCE_QUOTE_MISSING",
            anchor,
            "declared quote is absent from the source",
        )
    if section_occurrences != 1:
        _fail(
            "SOURCE_QUOTE_DUPLICATED",
            anchor,
            "declared quote appears more than once inside the named section",
        )

    reviewed_at_value = review.get("at")
    try:
        reviewed_at = date.fromisoformat(str(reviewed_at_value))
    except ValueError:
        _fail(
            "SOURCE_REVIEW_DATE_INVALID",
            slug,
            "reviewed source must have an ISO review date",
        )
    sequence_path = config.get("sequenceMapPath")
    if not isinstance(sequence_path, str) or not sequence_path:
        _fail("WEEK_MAP_INVALID", "sequenceMapPath", "configured path is required")
    week_map = load_week_map(root / sequence_path, manifest)
    introduced_week = week_map.slug_to_first_week.get(slug)
    base_url = config.get(
        "canonicalBaseUrl", "https://une-ms3-psychiatry.netlify.app/"
    )
    if not isinstance(base_url, str) or not base_url.startswith("https://"):
        _fail("SOURCE_INPUT_INVALID", "canonicalBaseUrl", "HTTPS base URL required")

    return SourceResolution(
        path=source_path,
        slug=slug,
        anchor=anchor,
        url=f"{base_url.rstrip('/')}/?page={quote(slug)}#{anchor}",
        quote=normalized_quote,
        quote_sha256=sha256(normalized_quote.encode("utf-8")).hexdigest(),
        section_sha256=sha256(section.normalized_text.encode("utf-8")).hexdigest(),
        reviewed_at=reviewed_at,
        introduced_week=introduced_week,
    )
