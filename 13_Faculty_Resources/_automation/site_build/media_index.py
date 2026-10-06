#!/usr/bin/env python3
"""Resolve media_map.json into the Reader's "Beyond this page" index.

Spec: docs/superpowers/specs/one-thread-handoff/README_MEDIA.md (M1). The map at the repo
root stores KEYS ONLY -- podcast episode numbers and book ISBNs. Every title, author,
description, link and guidance line a learner sees is read here, at build time, from the two
attested library pages and their topic_meta.json records, which this module never writes:

  12_Media/psychiatry_psychotherapy_podcast_library.md   (podcast_library.md)
  07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md   (book_library.md)

So the map cannot carry a title, an author, a link or a timestamp of its own, and a key the
libraries do not hold cannot render: it fails the build with a message naming the key.

What makes an episode ELIGIBLE ("verified"). The spec's rule is "only lines carrying
[▶ YouTube](https://www.youtube.com/watch?v=…)". Two more checks are made from the library
alone, because a "▶ YouTube" line can still point at the wrong video:
  - the video id is used by exactly ONE episode line (3473f69c recorded two lines that reuse
    another episode's video: 234 -> 239's, 247 -> 231's; both lines of each pair fail), and
  - when the line also carries its Apple Podcasts link, the episode number leading that link's
    slug equals the line's own episode number (the Apple links were joined by feed id, not by
    title, so they are an independent witness to which episode a line is).
"▶ episode audio" and "▶ search channel" lines are never eligible.

Books are eligible when their ISBN-13 is in the book library and its check digit is valid.

Draft is invisible. A map whose status is not exactly "approved" is VALIDATED in full -- a bad
key still fails the build -- but the emitted index has no pages, so nothing renders anywhere.
Only Dr. Moss flips status to "approved" (a content PR with no code).

Pure and offline: no network, no clock. Same inputs, byte-identical output.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:  # so an importer from outside site_build/ still resolves it
    sys.path.insert(0, HERE)

import shipped_pages  # noqa: E402

MAP_PATH = "media_map.json"
PODCAST_PATH = "12_Media/psychiatry_psychotherapy_podcast_library.md"
BOOK_PATH = "07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md"
TOPIC_META_PATH = "topic_meta.json"
PODCAST_SLUG = "podcast_library.md"
BOOK_SLUG = "book_library.md"
# The family side's practice link (README_MEDIA.md: "from book_library.md.relatedTools").
PRACTICE_TOOL = "family-systems.html"
# Medication workstream (README_MEDIA.md rule 6): never pick from this podcast category and
# never anchor on a page whose source lives under the psychopharmacology tree.
MEDICATION_CATEGORY = "Psychopharmacology"
MEDICATION_SOURCE_PREFIX = "05_Psychopharmacology/"
MAX_PER_SIDE = 2
INDEX_VERSION = 1
APPROVED = "approved"
MAP_KEYS = {"_note", "status", "draftedAt", "weeks", "excluded", "unverified"}
WEEK_KEYS = {"week", "anchor", "pairing", "podcastCategory", "listen", "family", "gap"}

_PODCAST_HEADING = re.compile(r"^## (?P<name>.+?)\s+\((?P<count>\d+)\)\s*$")
_BOOK_HEADING = re.compile(r"^## (?P<name>.+?)\s*$")
_EPISODE = re.compile(
    r"^- Episode (?P<n>\d+): (?P<title>.+?) — \[▶ (?P<kind>[^\]]+)\]\((?P<url>[^)\s]+)\)"
    r"(?: · \[Apple Podcasts\]\((?P<apple>[^)\s]+)\))?\s*$"
)
_YOUTUBE = re.compile(r"^https://www\.youtube\.com/watch\?v=(?P<id>[A-Za-z0-9_-]{11})$")
_APPLE_NUMBER = re.compile(r"/podcast/0*(?P<n>\d+)-")
_BOOK = re.compile(
    r"^- \*\*\[(?P<title>.+?)\]\((?P<url>[^)\s]+)\)\*\* — (?P<rest>.+?)\s+ISBN (?P<isbn>\d{13})\s*$"
)


class MediaMapError(Exception):
    """A media_map.json key the libraries cannot honour. The message names the key."""


def heading_anchor(name):
    """The category anchor: the Reader's heading-slug rule (fd_reading_place.js
    fdReadingHeadingIds: lower-case, every run of non [a-z0-9] -> '-', trimmed). The Reader's
    own DOM id adds a fingerprint over the heading's textContent, which makeCollapsible()
    prefixes with its chevron, so the link carries the bare slug and the shell resolves it
    against each heading's label (spa_index.html fdMediaArrive)."""
    slug = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return slug or "section"


def isbn13_valid(isbn):
    if not re.fullmatch(r"\d{13}", str(isbn)):
        return False
    total = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(isbn))
    return total % 10 == 0


def _split_author(rest):
    """`<author>. <description>` -> (author, description). The author ends at the first ". "
    that does not follow a single-letter initial ("Natalie Y. Gutiérrez") or "et al" -- an
    "et al." stays with the author, whose own period it is. No boundary: the whole text minus
    one trailing period is the author and there is no description."""
    for match in re.finditer(r"\.\s+", rest):
        before = rest[: match.start()]
        last = before.split(" ")[-1] if before else ""
        if re.fullmatch(r"[A-Z]", last):
            continue
        if last == "al":
            return before + ".", rest[match.end():].strip()
        return before, rest[match.end():].strip()
    text = rest.strip()
    if text.endswith(".") and not text.endswith(" al."):
        text = text[:-1]
    return text, ""


def parse_podcast_library(text):
    """{episode number: {n, title, category, anchor, url, verified, kind}}.

    A malformed "- Episode" line raises: a line the parser cannot read is a line it would
    otherwise silently drop from the eligible set (SILENT_SHRINK_CHECKLIST)."""
    episodes, category, video_uses = {}, None, {}
    for line in text.splitlines():
        heading = _PODCAST_HEADING.match(line)
        if heading:
            category = heading.group("name")
            continue
        if not line.startswith("- Episode"):
            continue
        match = _EPISODE.match(line)
        if not match:
            raise MediaMapError("podcast library: unreadable episode line: %r" % line[:90])
        if category is None:
            raise MediaMapError("podcast library: episode before any category heading")
        n = int(match.group("n"))
        if n in episodes:
            raise MediaMapError("podcast library: episode %d listed twice" % n)
        url = match.group("url")
        youtube = _YOUTUBE.match(url) if match.group("kind") == "YouTube" else None
        apple = match.group("apple")
        apple_n = _APPLE_NUMBER.search(apple) if apple else None
        episodes[n] = {
            "n": n,
            "title": match.group("title"),
            "category": category,
            "anchor": heading_anchor(category),
            "url": url,
            "kind": match.group("kind"),
            "_video": youtube.group("id") if youtube else None,
            "_appleAgrees": (apple_n is None) or int(apple_n.group("n")) == n,
        }
        if youtube:
            video_uses[youtube.group("id")] = video_uses.get(youtube.group("id"), 0) + 1
    for episode in episodes.values():
        video = episode.pop("_video")
        agrees = episode.pop("_appleAgrees")
        episode["verified"] = bool(video) and video_uses.get(video) == 1 and agrees
    return episodes


def parse_book_library(text):
    """{isbn: {isbn, title, author, description, category, anchor}}."""
    books, category = {}, None
    for line in text.splitlines():
        heading = _BOOK_HEADING.match(line)
        if heading and not line.startswith("### "):
            category = heading.group("name")
            continue
        if not line.startswith("- **["):
            continue
        match = _BOOK.match(line)
        if not match:
            raise MediaMapError("book library: unreadable book line: %r" % line[:90])
        if category is None:
            raise MediaMapError("book library: book before any category heading")
        isbn = match.group("isbn")
        if isbn in books:
            raise MediaMapError("book library: ISBN %s listed twice" % isbn)
        author, description = _split_author(match.group("rest"))
        books[isbn] = {
            "isbn": isbn,
            "title": match.group("title"),
            "author": author,
            "description": description,
            "category": category,
            "anchor": heading_anchor(category),
            "isbnValid": isbn13_valid(isbn),
        }
    return books


def _guidance(topic_meta):
    """The four verbatim strings (README_MEDIA.md rule 5) -- read, never retyped."""
    out = {}
    for key, slug, field in (
        ("familySay", BOOK_SLUG, "say"),
        ("familySafety", BOOK_SLUG, "safety"),
        ("listenSay", PODCAST_SLUG, "say"),
        ("listenSafety", PODCAST_SLUG, "safety"),
    ):
        record = topic_meta.get(slug) if isinstance(topic_meta, dict) else None
        workflow = record.get("clinicalWorkflow") if isinstance(record, dict) else None
        value = workflow.get(field) if isinstance(workflow, dict) else None
        if not isinstance(value, str) or not value.strip():
            raise MediaMapError("topic_meta.json: %s clinicalWorkflow.%s is missing" % (slug, field))
        out[key] = value
    return out


def validate(media_map, episodes, books, shipped):
    """Every failure as one message naming its key. [] means valid."""
    errors = []
    if not isinstance(media_map, dict):
        return ["media_map.json: must be a JSON object"]
    for key in sorted(set(media_map) - MAP_KEYS):
        errors.append("media_map.json: unknown top-level key %r" % key)
    status = media_map.get("status")
    if status not in ("draft", APPROVED):
        errors.append("media_map.json: status must be \"draft\" or \"approved\", not %r" % (status,))
    weeks = media_map.get("weeks")
    if not isinstance(weeks, list):
        return errors + ["media_map.json: weeks must be a list"]
    pages = {page["slug"]: page for page in shipped["pages"]}
    seen_anchors = {}
    for index, week in enumerate(weeks):
        where = "media_map.json weeks[%d]" % index
        if not isinstance(week, dict):
            errors.append("%s: must be an object" % where)
            continue
        for key in sorted(set(week) - WEEK_KEYS):
            errors.append("%s: unknown key %r" % (where, key))
        anchor = week.get("anchor")
        where = "%s (anchor %s)" % (where, anchor)
        if not isinstance(anchor, str) or anchor not in pages:
            errors.append("%s: anchor is not a shipped page" % where)
        else:
            if anchor in seen_anchors:
                errors.append("%s: anchor already mapped by weeks[%d]" % (where, seen_anchors[anchor]))
            seen_anchors[anchor] = index
            source = str(pages[anchor].get("source") or "")
            if source.startswith(MEDICATION_SOURCE_PREFIX):
                errors.append("%s: anchor is a medication-workstream page" % where)
        category = week.get("podcastCategory")
        listen = week.get("listen", [])
        family = week.get("family", [])
        if not isinstance(listen, list) or not isinstance(family, list):
            errors.append("%s: listen and family must be lists" % where)
            continue
        if len(listen) > MAX_PER_SIDE:
            errors.append("%s: listen has %d items (at most %d)" % (where, len(listen), MAX_PER_SIDE))
        if len(family) > MAX_PER_SIDE:
            errors.append("%s: family has %d items (at most %d)" % (where, len(family), MAX_PER_SIDE))
        if listen:
            categories = {e["category"] for e in episodes.values()}
            if category not in categories:
                errors.append("%s: podcastCategory %r is not a podcast library category" % (where, category))
        seen = set()
        for pick in listen:
            n = pick.get("episode") if isinstance(pick, dict) else None
            if not isinstance(n, int) or isinstance(n, bool):
                errors.append("%s: listen item %r has no integer episode" % (where, pick))
                continue
            if n in seen:
                errors.append("%s: episode %d picked twice" % (where, n))
            seen.add(n)
            episode = episodes.get(n)
            if episode is None:
                errors.append("%s: episode %d is not in the podcast library" % (where, n))
            elif not episode["verified"]:
                errors.append("%s: episode %d has no verified YouTube link (%s)"
                              % (where, n, episode["kind"]))
            elif episode["category"] == MEDICATION_CATEGORY:
                errors.append("%s: episode %d is a medication-workstream episode" % (where, n))
        seen = set()
        for pick in family:
            isbn = pick.get("isbn") if isinstance(pick, dict) else None
            if not isinstance(isbn, str):
                errors.append("%s: family item %r has no ISBN string" % (where, pick))
                continue
            if isbn in seen:
                errors.append("%s: ISBN %s picked twice" % (where, isbn))
            seen.add(isbn)
            book = books.get(isbn)
            if book is None:
                errors.append("%s: ISBN %s is not in the book library" % (where, isbn))
            elif not book["isbnValid"]:
                errors.append("%s: ISBN %s fails its ISBN-13 check digit" % (where, isbn))
    return errors


def _public_episode(episode):
    return {key: episode[key] for key in ("n", "title", "category", "url")}


def _public_book(book):
    return {key: book[key] for key in ("isbn", "title", "author", "description", "category", "anchor")}


def resolve(media_map, episodes, books, topic_meta, shipped, site):
    """The index one site serves. Raises MediaMapError listing every failure."""
    errors = validate(media_map, episodes, books, shipped)
    if errors:
        raise MediaMapError("\n".join(errors))
    index = {"version": INDEX_VERSION, "site": site, "status": media_map["status"], "pages": {}}
    if media_map["status"] != APPROVED:
        return index
    on_site = shipped_pages.slugs_for_site(shipped, site)
    book_meta = topic_meta.get(BOOK_SLUG) if isinstance(topic_meta, dict) else {}
    related = (book_meta or {}).get("relatedTools") or []
    practice = PRACTICE_TOOL if (PRACTICE_TOOL in related and PRACTICE_TOOL in on_site) else None
    index["guidance"] = _guidance(topic_meta)
    for week in media_map["weeks"]:
        anchor = week["anchor"]
        if anchor not in on_site:
            continue  # README_MEDIA.md: an anchor that does not ship on this site is skipped
        listen = [_public_episode(episodes[p["episode"]]) for p in week.get("listen", [])]
        family = [_public_book(books[p["isbn"]]) for p in week.get("family", [])]
        if not listen and not family:
            continue
        entry = {"week": week.get("week")}
        if listen:
            category = week["podcastCategory"]
            entry["listen"] = listen
            entry["listenAll"] = {"ref": PODCAST_SLUG, "category": category,
                                  "anchor": heading_anchor(category)}
        if family:
            entry["family"] = family
            entry["familyAll"] = {"ref": BOOK_SLUG, "category": family[0]["category"],
                                  "anchor": family[0]["anchor"]}
            if practice:
                entry["practiceRef"] = practice
        index["pages"][anchor] = entry
    return index


def _read(lib_root, rel):
    with open(os.path.join(os.fspath(lib_root), rel), encoding="utf-8") as fh:
        return fh.read()


def load_inputs(lib_root, map_path=None):
    """(map, episodes, books, topic_meta, shipped) from the live tree."""
    try:
        media_map = json.loads(_read(lib_root, map_path or MAP_PATH))
    except (OSError, ValueError) as error:
        raise MediaMapError("media_map.json: cannot read: %s" % error)
    episodes = parse_podcast_library(_read(lib_root, PODCAST_PATH))
    books = parse_book_library(_read(lib_root, BOOK_PATH))
    topic_meta = json.loads(_read(lib_root, TOPIC_META_PATH))
    shipped = shipped_pages.load_shipped_pages(lib_root)
    return media_map, episodes, books, topic_meta, shipped


def build_for_site(lib_root, site):
    media_map, episodes, books, topic_meta, shipped = load_inputs(lib_root)
    return resolve(media_map, episodes, books, topic_meta, shipped, site)


def serialize(index):
    return json.dumps(index, ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def build_or_abort(lib_root, site):
    """For the build scripts: the index, or BUILD ABORTED with every named failure."""
    try:
        return build_for_site(lib_root, site)
    except (MediaMapError, shipped_pages.ShippedPagesError) as error:
        print("BUILD ABORTED — media_map.json does not resolve against the libraries:")
        for line in str(error).splitlines():
            print("   - " + line)
        raise SystemExit(1)


def main(argv=None):
    """`python3 media_index.py` -- validate the live map for both sites and print a summary."""
    lib = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
    for site in ("ms3", "res"):
        index = build_or_abort(lib, site)
        print("media index %s: status=%s, %d page(s) render" % (site, index["status"], len(index["pages"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
