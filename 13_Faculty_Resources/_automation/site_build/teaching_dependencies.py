"""Discover tool teaching inputs using deployed URLs, not prototype filenames.

Conservatively collect local JSON/VTT URL literals from inline scripts and
declared first-party script assets, including URLs stored in constants. This is
not a JavaScript evaluator: unresolved fetch arguments and module loaders fail
closed. Services and remote URLs are outside this file-backed contract.
Unmapped local data is an error, never an implicit attestation exemption.
"""

from html.parser import HTMLParser
from pathlib import Path
import json
import posixpath
import re
from urllib.parse import unquote, urlsplit

import site_extras


class DependencyError(ValueError):
    pass


# Deliberately scan URL-shaped literals, not arbitrary JavaScript strings: a
# quote inside a JS regexp (e.g. /'/g) must not swallow all subsequent loaders.
# This conservative scan also includes URL examples in comments, so there is
# no fragile imitation of a JavaScript parser silently dropping dependencies.
_DATA_LITERAL = re.compile(
    r"(?P<quote>['\"`])(?P<url>[^'\"`\s<>]+?\.(?:json|vtt)(?:[?#][^'\"`\s<>]*)?)(?P=quote)",
    re.IGNORECASE,
)
_LITERAL = re.compile(r"(['\"`])([^'\"`\\]*?)\1", re.DOTALL)
_FETCH = re.compile(r"(?<![\w$])fetch\s*\(\s*")

# Audited service calls, never file loaders. Scope by canonical source as well
# as expression so a new tool cannot acquire an exemption by naming a variable
# `ep`. New dynamic calls must be reviewed here or changed to a static file URL.
_SERVICE_FETCHES = {
    "_prototypes/sp-interview/sp-interview.html": {
        "this.endpoint": "live standardized-patient POST endpoint",
        "voiceEndpointFor(endpoint)": "managed voice catalog service",
        "ep": "managed voice synthesis service",
    },
}


def _first_argument(script, start):
    depth = 0
    quote = None
    escaped = False
    for end in range(start, len(script)):
        char = script[end]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in "'\"`":
            quote = char
        elif char in "([{":
            depth += 1
        elif char in ",)" and depth == 0:
            return script[start:end].strip(), script[end:]
        elif char in ")]}":
            depth -= 1
    raise DependencyError("unterminated fetch argument")


def _fetch_references(script, source):
    if re.search(r"\b(?:import\s*(?:\(|\{|\*|[\w'\"])|require\s*\(|importScripts\s*\(|XMLHttpRequest\b)", script):
        raise DependencyError(source + ": unsupported module/request loader; extend teaching dependency discovery")
    refs = set()
    service_calls = set()
    for match in _FETCH.finditer(script):
        argument, tail = _first_argument(script, match.end())
        compact = re.sub(r"\s+", "", argument)
        if compact in _SERVICE_FETCHES.get(source, {}):
            if compact in service_calls:
                raise DependencyError(source + ": duplicate exempt service fetch: " + argument)
            service_calls.add(compact)
            continue
        literal = _LITERAL.fullmatch(argument)
        if literal is None or "${" in literal[2]:
            raise DependencyError(source + ": unresolved fetch(" + argument + "); use a static full URL or declare an audited service")
        url = literal[2]
        if url == "/" and re.match(r",\s*\{\s*method\s*:\s*['\"]POST['\"]", tail):
            continue  # The existing Netlify feedback form POST, not teaching data.
        refs.add(url)
    return refs


class _ToolHTML(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.scripts = []
        self.assets = []
        self.script_assets = set()
        self.in_script = False
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script":
            if attrs.get("type", "").lower() == "module":
                raise DependencyError("module scripts require teaching dependency graph support")
            self.in_script = True
            if attrs.get("src"):
                self.assets.append(attrs["src"])
                self.script_assets.add(attrs["src"])
        elif tag == "track" and attrs.get("src"):
            self.assets.append(attrs["src"])
        elif tag == "base":
            raise DependencyError("tool <base> URLs require an explicit dependency resolver")

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts.append(data)


def references(text, html=True, source="<script>"):
    """Local data literals plus script/track src references; stable and deduplicated."""
    parsed = _ToolHTML(text) if html else None
    refs = set(parsed.assets if parsed else [])
    for script in parsed.scripts if parsed else [text]:
        refs.update(_fetch_references(script, source))
        for match in _DATA_LITERAL.finditer(script):
            value = match.group("url")
            if "${" in value or "\\" in value:
                raise DependencyError("teaching URL must be a static, unescaped path: " + value)
            refs.add(value)
    return [(ref, bool(parsed and ref in parsed.script_assets)) for ref in sorted(refs)]


def local_url(reference, page_url):
    parts = urlsplit(reference)
    if parts.scheme or parts.netloc:
        return None
    path = unquote(parts.path)
    if not path:
        return None
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(page_url), path))
    # Resolve against a deployment root (a leading / is site-relative).
    if resolved.startswith("/"):
        resolved = resolved[1:]
    if resolved == ".." or resolved.startswith("../"):
        raise DependencyError("teaching URL escapes the deployment root: " + reference)
    return resolved


def asset_sources(root, manifest, site):
    """The builders' file-copy routes, keyed by URL inside a single deployment.

    toolAssets and orientation media come from their existing canonical lists.
    Resident packs follow resident_section.py's sibling-pack copy rule. The root
    JSON and quizzes routes below mirror build_deploy.py; --check-build verifies
    that tools' loaded assets actually ship. Never infer a source merely because
    a similarly named file exists next to a prototype (quizzes.json is a trap).
    """
    assets = {}

    def add(source, url):
        if url in assets and assets[url] != source:
            raise DependencyError("two sources claim teaching asset " + url)
        assets[url] = source

    for source, dest in manifest.get("toolAssets", []):
        add(source, "tools/" + dest)
    for name in ("communication_cases.json", "reasoning_cases.json",
                 "family_systems_scenarios.json", "longitudinal_case.json",
                 "question_bank.json"):
        add(name, name)
    if site == "res":
        assets["reasoning_cases.json"] = "reasoning_cases_resident.json"
        for source, slug, _title in site_extras.RESIDENT_PROTO_TOOLS:
            pack = source[:-5] + ".pack.json"
            if (Path(root) / pack).is_file():
                add(pack, "tools/" + slug[:-5] + ".pack.json")
    else:
        for source, dest, _title in site_extras.MS3_ORIENT_VIDEO:
            add(source, "tools/" + dest)
    add("07_Evidence_and_Reading/Landmark_Trials/quizzes.json", "tools/quizzes.json")
    return assets


def _separately_governed(url):
    # topic_meta is already hashed per slug WITHOUT facultyReview; hashing the
    # projected whole document would make a review invalidate itself. Vendored
    # runtime libraries are not teaching material authored for a tool.
    return url in {"topic_meta.json", "tools/vendor/react.min.js", "tools/vendor/react-dom.min.js"}


def _teaching_bytes(path, url):
    raw = Path(path).read_bytes()
    if url != "tools/quizzes.json":
        return raw
    # build_deploy.py adds/replaces only these three deck-level audio fields.
    # Compare every other field so an incorrect copy or changed answer fails.
    try:
        document = json.loads(raw)
        for deck in document["decks"]:
            for key in ("audio", "audioDur", "oe"):
                deck.pop(key, None)
        return json.dumps(document, sort_keys=True, ensure_ascii=False)
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise DependencyError("invalid quiz teaching input: " + str(path)) from error


def discover(root, page, manifest, site, out_dir=None):
    """Return source paths for data/scripts loaded by a tool; optionally audit build.

    Script fetch() URLs are relative to the tool document, even for external JS.
    Reading both the source and finished page catches dependencies injected or
    changed by the builder. Each mapped source and built asset must exist.
    """
    assets = asset_sources(root, manifest, site)
    page_url = "tools/" + page["slug"]
    found = set()
    visited = set()

    def scan(path, html, source_label):
        try:
            text = Path(path).read_text(encoding="utf-8")
        except OSError as error:
            raise DependencyError("unreadable teaching input %s: %s" % (path, error)) from error
        for reference, is_script in references(text, html, source_label):
            url = local_url(reference, page_url)
            if url is None or _separately_governed(url) or url in visited:
                continue
            visited.add(url)
            source = assets.get(url)
            if source is None:
                raise DependencyError(
                    "%s loads unmapped teaching asset %s; declare its build copy route "
                    "in site_manifest.json toolAssets or teaching_dependencies.asset_sources"
                    % (page["slug"], url))
            if not (Path(root) / source).is_file():
                raise DependencyError("missing teaching source %s for %s" % (source, page["slug"]))
            found.add(source)
            if out_dir is not None:
                built = Path(out_dir) / url
                if not built.is_file():
                    raise DependencyError("%s loads teaching asset not built: %s" % (page["slug"], url))
                if _teaching_bytes(built, url) != _teaching_bytes(Path(root) / source, url):
                    raise DependencyError("%s teaching asset %s differs from %s"
                                          % (page["slug"], url, source))
            if is_script:
                scan(Path(root) / source, False, source)
                if out_dir is not None:
                    scan(Path(out_dir) / url, False, source)

    scan(Path(root) / page["source"], True, page["source"])
    if out_dir is not None:
        scan(Path(out_dir) / page_url, True, page["source"])
    return found
