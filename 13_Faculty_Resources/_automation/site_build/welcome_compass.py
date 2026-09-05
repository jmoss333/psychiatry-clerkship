"""Pure contract and semantic renderer for the MS3 Six-Week Compass."""

from dataclasses import dataclass
from html import escape
import json
import os
import stat


COMPASS_MARKER = "<!-- ms3-six-week-compass -->"
SAFETY_START = "<!-- single-safety-rule:start -->"
SAFETY_END = "<!-- single-safety-rule:end -->"
LFS_HEADER = b"version https://git-lfs"

SAFETY_ORIENTATION_LINK = "Open the Orientation Packet"
COMPASS_HEADING = "Six-Week Compass"
SCOPE_COPY = (
    "This map supports orientation, supervised practice, and reflection. It is not a "
    "checklist, clinical protocol, or measure of readiness. Using or viewing this map does "
    "not establish competence, entrustment, or permission to act independently."
)
PROMPT_COPY = "Choose the week or task you are preparing to discuss with your supervising team."
OPTIONAL_VIDEO_COPY = "Optional: watch the captioned orientation overview (transcript available)"


class CompassContractError(ValueError):
    pass


class CompassPreflightError(CompassContractError):
    pass


@dataclass(frozen=True)
class CompassCard:
    n: int
    title: str
    landing_ref: str


def prepare_cards(ms3_weeks, shipped_document):
    if not isinstance(ms3_weeks, list) or len(ms3_weeks) != 6:
        raise CompassContractError("MS3 Compass requires exactly six weeks")
    pages = shipped_document.get("pages") if isinstance(shipped_document, dict) else None
    if not isinstance(pages, list):
        raise CompassContractError("shipped_pages.json must contain pages")
    by_slug = {}
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get("slug"), str):
            raise CompassContractError("shipped_pages.json contains a malformed page")
        sites = page.get("sites")
        if not isinstance(sites, list) or not all(isinstance(site, str) for site in sites):
            raise CompassContractError("shipped_pages.json contains malformed sites")
        if page["slug"] in by_slug:
            raise CompassContractError(
                "shipped_pages.json contains duplicate slug %s" % page["slug"]
            )
        by_slug[page["slug"]] = page

    cards = []
    seen_refs = set()
    for expected_n, week in enumerate(ms3_weeks, start=1):
        if not isinstance(week, dict):
            raise CompassContractError("MS3 week %d must be an object" % expected_n)
        n = week.get("n")
        if isinstance(n, bool) or n != expected_n:
            raise CompassContractError("MS3 Compass week numbers must be exactly 1..6 in order")
        title = week.get("title")
        if not isinstance(title, str) or not title.strip() or title != title.strip():
            raise CompassContractError("MS3 week %d title must be a non-empty trimmed string" % n)
        landing_ref = week.get("landingRef")
        if (
            not isinstance(landing_ref, str)
            or not landing_ref.strip()
            or landing_ref != landing_ref.strip()
        ):
            raise CompassContractError(
                "MS3 week %d landingRef must be a non-empty trimmed string" % n
            )
        if landing_ref in seen_refs:
            raise CompassContractError("MS3 landingRef %s is duplicated" % landing_ref)
        seen_refs.add(landing_ref)
        page = by_slug.get(landing_ref)
        if (
            page is None
            or page.get("kind") != "page"
            or "ms3" not in page["sites"]
            or not landing_ref.endswith(".md")
        ):
            raise CompassContractError(
                "MS3 week %d landingRef %s is not a shipped MS3 Markdown page"
                % (n, landing_ref)
            )
        cards.append(CompassCard(n=n, title=title, landing_ref=landing_ref))
    return tuple(cards)


def extract_safety_rule(packet_markdown: str) -> str:
    start_count = packet_markdown.count(SAFETY_START)
    end_count = packet_markdown.count(SAFETY_END)
    first_start = packet_markdown.find(SAFETY_START)
    first_end = packet_markdown.find(SAFETY_END)
    if start_count > 1 and first_end > first_start:
        second_start = packet_markdown.find(SAFETY_START, first_start + len(SAFETY_START))
        if second_start < first_end:
            raise CompassContractError("Single Safety Rule markers are reversed or nested")
    if start_count != 1 or end_count != 1:
        raise CompassContractError(
            "Single Safety Rule requires exactly one start marker and one end marker"
        )
    start = packet_markdown.index(SAFETY_START) + len(SAFETY_START)
    end = packet_markdown.index(SAFETY_END)
    if end <= start:
        raise CompassContractError("Single Safety Rule markers are reversed or nested")
    body = packet_markdown[start:end]
    normalized = " ".join(body.split())
    if not normalized:
        raise CompassContractError("Single Safety Rule marked block is empty")
    return normalized


def render_compass(cards, safety_text: str) -> str:
    items = "".join(
        (
            '<li data-ms3-compass-week="%d"><span>Week %d</span>'
            '<h3>%s</h3><a data-ms3-compass-link href="?page=%s">Open Week %d</a></li>'
            % (
                card.n,
                card.n,
                escape(card.title, quote=True),
                escape(card.landing_ref, quote=True),
                card.n,
            )
        )
        for card in cards
    )
    return (
        '<div data-ms3-compass-root>'
        '<aside data-ms3-compass-safety role="note">'
        '<p>%s</p><a href="?page=orientation.md">%s</a></aside>'
        '<p data-ms3-compass-scope>%s</p>'
        '<section class="ms3-compass" data-ms3-compass aria-labelledby="ms3-compass-title">'
        '<h2 id="ms3-compass-title">%s</h2>'
        '<ol class="ms3-compass__weeks" data-ms3-compass-weeks>%s</ol></section>'
        '<p data-ms3-compass-prompt>%s</p>'
        '<a data-ms3-compass-orientation href="?tool=orientation-video.html">%s</a>'
        '</div>'
        % (
            escape(safety_text, quote=True),
            SAFETY_ORIENTATION_LINK,
            SCOPE_COPY,
            COMPASS_HEADING,
            items,
            PROMPT_COPY,
            OPTIONAL_VIDEO_COPY,
        )
    )


def inject_compass(welcome_markdown: str, fragment: str) -> tuple[str, bool]:
    count = welcome_markdown.count(COMPASS_MARKER)
    if count != 1:
        raise CompassContractError(
            "MS3 Welcome requires exactly one Compass marker; found %d" % count
        )
    rendered = welcome_markdown.replace(COMPASS_MARKER, fragment, 1)
    if COMPASS_MARKER in rendered:
        raise CompassContractError("MS3 Compass marker remained after injection")
    return rendered, True


def assert_nav_projection(nav, cards) -> None:
    if not isinstance(nav, list):
        raise CompassContractError("MS3 final nav must be a list")
    rows = []
    for section in nav:
        if not isinstance(section, dict) or not isinstance(section.get("items"), list):
            raise CompassContractError("MS3 final nav contains a malformed section")
        rows.extend(section["items"])
    for card in cards:
        matching = [row for row in rows if isinstance(row, dict) and row.get("f") == card.landing_ref]
        if len(matching) != 1:
            raise CompassContractError(
                "MS3 final nav must contain exactly one row for %s" % card.landing_ref
            )
        row = matching[0]
        expected_title = "Week %d — %s" % (card.n, card.title)
        if row.get("k") != "md":
            raise CompassContractError("MS3 final nav row %s must be Markdown" % card.landing_ref)
        if row.get("hidden") is not True:
            raise CompassContractError("MS3 final nav row %s must be hidden" % card.landing_ref)
        if row.get("t") != expected_title:
            raise CompassContractError(
                "MS3 final nav row %s must have title %s" % (card.landing_ref, expected_title)
            )


def require_real_files(root, relative_paths) -> None:
    invalid = []
    for relative_path in relative_paths:
        path = os.path.join(root, relative_path)
        try:
            metadata = os.stat(path)
            if (
                not stat.S_ISREG(metadata.st_mode)
                or metadata.st_size == 0
                or metadata.st_mode & 0o444 == 0
            ):
                invalid.append(relative_path)
                continue
            with open(path, "rb") as handle:
                if handle.read(len(LFS_HEADER)) == LFS_HEADER:
                    invalid.append(relative_path)
        except OSError:
            invalid.append(relative_path)
    if invalid:
        raise CompassContractError("MS3 Compass required files are invalid: " + ", ".join(invalid))


def load_ms3_preflight_sources(curriculum_path, orientation_packet_path):
    try:
        with open(curriculum_path, encoding="utf-8") as handle:
            curriculum = json.load(handle)
        with open(orientation_packet_path, encoding="utf-8") as handle:
            orientation_packet = handle.read()
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise CompassPreflightError("BUILD ABORTED — MS3 Compass: %s" % error) from error
    return curriculum, orientation_packet


def assert_ms3_output(out_dir, cards, safety_text, built_orientation_paths) -> None:
    require_real_files(out_dir, built_orientation_paths)
    try:
        with open(os.path.join(out_dir, "content", "welcome.md"), encoding="utf-8") as handle:
            welcome = handle.read()
    except OSError as error:
        raise CompassContractError("MS3 Compass built Welcome is unreadable: %s" % error) from error
    expected = render_compass(cards, safety_text)
    expected_count = welcome.count(expected)
    if expected_count != 1:
        raise CompassContractError(
            "MS3 Compass built Welcome must contain the exact rendered fragment exactly once; found %d"
            % expected_count
        )
    root_count = welcome.count("data-ms3-compass-root")
    if root_count != 1:
        raise CompassContractError(
            "MS3 Compass built Welcome must contain exactly one Compass root; found %d" % root_count
        )
    if COMPASS_MARKER in welcome:
        raise CompassContractError(
            "MS3 Compass built Welcome contains a raw Compass marker: %s" % COMPASS_MARKER
        )
    for marker in (SAFETY_START, SAFETY_END):
        if marker in welcome:
            raise CompassContractError(
                "MS3 Compass built Welcome contains a raw safety marker: %s" % marker
            )
