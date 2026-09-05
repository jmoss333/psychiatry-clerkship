"""Pure contract and semantic renderer for the MS3 Six-Week Compass."""

from dataclasses import dataclass
from copy import deepcopy
from html import escape
from html.parser import HTMLParser
import json
import os
import stat
import subprocess

from check_lfs_media import LFS_HEADER, MEDIA_EXTS, is_soft_context
from site_extras import MS3_ORIENT_VIDEO, RESIDENT_ONBOARDING_MEDIA


COMPASS_MARKER = "<!-- ms3-six-week-compass -->"
SAFETY_START = "<!-- single-safety-rule:start -->"
SAFETY_END = "<!-- single-safety-rule:end -->"
RETIRED_INTRO_FILENAMES = ("intro-trailer.mp4", "intro-trailer-poster.jpg")
# Both packages are declared once, in site_extras.py, and projected into built paths
# here: this module's gates and the two build scripts must agree on the same set, and
# before 2026-09-05 each package was typed out in three separate places.
MS3_OPTIONAL_ORIENTATION_PATHS = tuple(
    os.path.join("tools", built) for _src, built, _title in MS3_ORIENT_VIDEO
)
RESIDENT_ONBOARDING_PATHS = tuple(
    os.path.join("media", built) for _src, built in RESIDENT_ONBOARDING_MEDIA
)

COMPASS_ROOT_OPENER = '<div data-fd-compass-root>'
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


class _ResidentWelcomeVideoParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.videos = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "video":
            self.videos.append(attrs)


VOID_ELEMENTS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
})


class _CompassStructureParser(HTMLParser):
    """Record real element/text events; comments and escaped code cannot supply a root."""

    def __init__(self):
        super().__init__()
        self.compasses = []
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        is_root = any(name == "data-fd-compass-root" for name, _ in attrs)
        if is_root:
            self.compasses.append([])
            self.depth = 0
        if self.compasses and (self.depth or is_root):
            self.compasses[-1].append(("start", tag, attrs))
            if tag not in VOID_ELEMENTS:
                self.depth += 1

    def handle_endtag(self, tag):
        if tag in VOID_ELEMENTS:
            return
        if self.depth:
            self.compasses[-1].append(("end", tag))
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.compasses[-1].append(("text", data))


def _render_markdown(markdown):
    """Use the same bundled Marked parser as the learner reader, never a regex approximation."""
    parser_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "marked.min.js")
    try:
        result = subprocess.run(
            ["node", "-e", "const fs=require('fs');const marked=require(process.argv[1]);"
             "process.stdout.write(marked.parse(fs.readFileSync(0,'utf8')));", parser_path],
            input=markdown, text=True, capture_output=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise CompassContractError("built Welcome Markdown could not be rendered") from error
    return result.stdout


def project_resident_welcome(topic_meta, governance):
    """Scope the shared Welcome route in generated resident data; retain the faculty ledger.

    Only the known Compass pending explanation is made audience-neutral. Review status,
    risk, reviewer and date are never changed, nor is any other pending reason rewritten.
    """
    meta, document = deepcopy(topic_meta), deepcopy(governance)
    meta["welcome.md"].update({
        "tldr": "Start with the four-week Rotation Plan, then use the core references and Resident Depth pages to prepare for patient care and supervision.",
        "points": [
            "Start with the 4-Week Rotation Plan.",
            "Use Resident Depth for advanced psychopharmacology, systems and med-legal work, supervision, and teaching.",
            "Bring an agenda to supervision and expect frequent, specific, behavior-based feedback.",
        ],
    })
    entry = document["items"]["welcome.md"]
    if (entry.get("status") == "pending" and entry.get("reason") ==
            "Six-Week Compass and onboarding hierarchy awaiting faculty review."):
        entry["reason"] = entry["warning"] = "Welcome awaiting faculty review."
    return meta, document


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
            '<li class="fd-compass__week" data-fd-compass-week="%d">'
            '<h3 class="fd-compass__heading"><span class="fd-compass__kicker">Week %d</span> %s</h3>'
            '<a class="fd-compass__link" data-fd-compass-link href="?page=%s">Open Week %d</a></li>'
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
        COMPASS_ROOT_OPENER
        + '<aside data-fd-compass-safety role="note">'
        '<p>%s</p><a href="?page=orientation.md">%s</a></aside>'
        '<p data-fd-compass-scope>%s</p>'
        '<section class="fd-compass" data-fd-compass aria-labelledby="fd-compass-title">'
        '<h2 class="fd-compass__title" id="fd-compass-title">%s</h2>'
        '<ol class="fd-compass__weeks" data-fd-compass-weeks>%s</ol></section>'
        '<p data-fd-compass-prompt>%s</p>'
        '<a data-fd-compass-orientation href="?tool=orientation-video.html">%s</a>'
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
    """Every path must be a real, non-empty, readable regular file.

    A Git-LFS pointer stub is an error in production and a printed warning in the soft
    contexts check_lfs_media.is_soft_context() names (GitHub Actions' lfs:false checkout,
    Netlify deploy previews): those contexts ship stubs on purpose and the site-wide LFS
    gate is already soft there. Missing, empty, directory, symlink and unreadable paths
    always fail.
    """
    invalid, stubs = [], []
    for relative_path in relative_paths:
        path = os.path.join(root, relative_path)
        try:
            metadata = os.lstat(path)
            if (
                stat.S_ISLNK(metadata.st_mode)
                or not stat.S_ISREG(metadata.st_mode)
                or metadata.st_size == 0
                or metadata.st_mode & 0o444 == 0
            ):
                invalid.append(relative_path)
                continue
            with open(path, "rb") as handle:
                if handle.read(len(LFS_HEADER)) == LFS_HEADER:
                    stubs.append(relative_path)
        except OSError:
            invalid.append(relative_path)
    if stubs and is_soft_context():
        print("WARN (soft LFS context): Git-LFS pointer stub(s) among required Compass files: "
              + ", ".join(stubs))
    else:
        invalid.extend(stubs)
    if invalid:
        raise CompassContractError("MS3 Compass required files are invalid: " + ", ".join(invalid))


def _iter_completed_output_files(out_dir):
    try:
        root_metadata = os.lstat(out_dir)
    except OSError as error:
        raise CompassContractError("built output root is unreadable: %s" % out_dir) from error
    if stat.S_ISLNK(root_metadata.st_mode) or not stat.S_ISDIR(root_metadata.st_mode):
        raise CompassContractError("built output root must be a real directory: %s" % out_dir)
    def onerror(error):
        path = error.filename or str(error)
        raise CompassContractError("built output traversal is unreadable: " + path) from error

    for directory, dirnames, filenames in os.walk(out_dir, followlinks=False, onerror=onerror):
        for dirname in dirnames:
            path = os.path.join(directory, dirname)
            try:
                metadata = os.lstat(path)
            except OSError as error:
                raise CompassContractError("built output directory is unreadable: %s" % path) from error
            if stat.S_ISLNK(metadata.st_mode):
                raise CompassContractError("built output contains a symlinked directory: " + path)
        for filename in filenames:
            path = os.path.join(directory, filename)
            try:
                metadata = os.lstat(path)
            except OSError as error:
                raise CompassContractError("built output file is unreadable: %s" % path) from error
            if stat.S_ISLNK(metadata.st_mode):
                raise CompassContractError("built output contains a symlinked file: " + path)
            if not stat.S_ISREG(metadata.st_mode):
                raise CompassContractError("built output contains a non-regular file: " + path)
            yield path, os.path.relpath(path, out_dir)


def _retired_needles():
    return {name.encode("utf-8"): "retired intro reference " + name for name in RETIRED_INTRO_FILENAMES}


def _scan_completed_output(out_dir, forbidden):
    """Walk every built file once as bytes; return the relative paths seen.

    `forbidden` maps a byte needle to the label reported when a file contains it. No
    decoding: the served tree holds audio, fonts, archives and suffix-less files, and an
    isolation scan must not fail on a file merely for being binary. Media files
    (check_lfs_media.MEDIA_EXTS) are still walked for names but not searched — they cannot
    carry a markup or filename reference.
    """
    files = set()
    for path, relative_path in _iter_completed_output_files(out_dir):
        files.add(relative_path)
        if os.path.basename(path) in RETIRED_INTRO_FILENAMES:
            raise CompassContractError("built output contains retired intro file: " + relative_path)
        if os.path.splitext(path)[1].lower() in MEDIA_EXTS:
            continue
        try:
            with open(path, "rb") as handle:
                data = handle.read()
        except OSError as error:
            raise CompassContractError("built output file is unreadable: %s" % path) from error
        for needle, label in forbidden.items():
            if needle in data:
                raise CompassContractError("built output contains %s: %s" % (label, relative_path))
    return files


def _assert_resident_welcome_video(welcome) -> None:
    parser = _ResidentWelcomeVideoParser()
    parser.feed(_render_markdown(welcome))
    parser.close()
    if len(parser.videos) != 1:
        raise CompassContractError(
            "resident built Welcome must contain exactly one video with the resident onboarding src and poster"
        )
    attrs = parser.videos[0]
    src_values = [value for name, value in attrs if name == "src"]
    poster_values = [value for name, value in attrs if name == "poster"]
    if src_values != [RESIDENT_ONBOARDING_PATHS[0]] or poster_values != [RESIDENT_ONBOARDING_PATHS[1]]:
        raise CompassContractError(
            "resident built Welcome must contain exactly one video with the resident onboarding src and poster"
        )


def validate_media_manifest(manifest) -> None:
    """The WP-13 accessibility manifest may describe the orientation package (caption and
    transcript status are exactly what it exists to record) but may not mark it served:
    production_canary.py probes every served entry and accepts media only under /audio/,
    /audio_oe/ or /media/, while this package ships under /tools/. Widening the canary's
    scope is a separate decision; until then a served:true row would fail every canary run.
    """
    if not isinstance(manifest, dict):
        raise CompassContractError("media manifest must be an object")
    identities = set()
    for source_path, built_name, _title in MS3_ORIENT_VIDEO:
        identities.update((source_path, os.path.join("tools", built_name)))
    for group in ("audio", "video"):
        entries = manifest.get(group)
        if not isinstance(entries, list):
            raise CompassContractError("media manifest must contain a %s list" % group)
        for entry in entries:
            if not isinstance(entry, dict):
                raise CompassContractError("media manifest %s entries must be objects" % group)
            if entry.get("served") is not True:
                continue
            for value in entry.values():
                if isinstance(value, str) and value in identities:
                    raise CompassContractError(
                        "media manifest marks the MS3 orientation package as served, "
                        "outside the canary's media scope: " + value
                    )


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
    _scan_completed_output(out_dir, _retired_needles())
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
    root_count = welcome.count("data-fd-compass-root")
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
    rendered, expected_structure = _CompassStructureParser(), _CompassStructureParser()
    rendered.feed(_render_markdown(welcome))
    expected_structure.feed(expected)
    rendered.close()
    expected_structure.close()
    if rendered.compasses != expected_structure.compasses:
        raise CompassContractError("MS3 Compass built Welcome must contain the exact rendered Compass structure")


def assert_resident_output(out_dir) -> None:
    require_real_files(out_dir, RESIDENT_ONBOARDING_PATHS)
    forbidden = dict(_retired_needles())
    for copy in (COMPASS_ROOT_OPENER, SCOPE_COPY, PROMPT_COPY, COMPASS_HEADING, OPTIONAL_VIDEO_COPY):
        forbidden[copy.encode("utf-8")] = "MS3 Compass copy: " + copy
    files = _scan_completed_output(out_dir, forbidden)
    for relative_path in MS3_OPTIONAL_ORIENTATION_PATHS:
        if relative_path in files:
            raise CompassContractError(
                "resident built output contains MS3 optional orientation package: " + relative_path
            )
    try:
        with open(os.path.join(out_dir, "content", "welcome.md"), encoding="utf-8") as handle:
            welcome = handle.read()
    except (OSError, UnicodeError) as error:
        raise CompassContractError("resident built Welcome is unreadable: content/welcome.md") from error
    _assert_resident_welcome_video(welcome)
