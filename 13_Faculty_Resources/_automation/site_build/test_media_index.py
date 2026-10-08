#!/usr/bin/env python3
"""Behavior tests for media_index.py (README_MEDIA.md M1).

Fixtures only, never the live library files: a test that read the real podcast list would
change meaning whenever a curator edits it. The one live read is the last test, which asserts
the CONTRACT the live map must hold (it resolves; while it is a draft it renders nothing),
not any count or pick.

Run by build_and_check.sh (both sites), which is how it reaches CI and bin/verify.sh without
a governance edit: nothing globs site_build/test_*.py.
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

import media_index as mi
import shipped_pages

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import attestation_hash  # noqa: E402  (read-only use: the rule every signature is checked by)

LIB = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

PODCASTS = """# Podcast library

## Foundations & the psychiatric interview  (3)
- Episode 1: The Basics — [▶ YouTube](https://www.youtube.com/watch?v=AAAAAAAAAA1) · [Apple Podcasts](https://podcasts.apple.com/us/podcast/001-the-basics/id1?i=1)
- Episode 2: No Apple Link — [▶ YouTube](https://www.youtube.com/watch?v=AAAAAAAAAA2)
- Episode 3: Wrong Apple — [▶ YouTube](https://www.youtube.com/watch?v=AAAAAAAAAA3) · [Apple Podcasts](https://podcasts.apple.com/us/podcast/004-other/id1?i=4)

## Mood & bipolar; suicide  (4)
- Episode 10: Audio Only — [▶ episode audio](https://example.libsyn.com/10) · [Apple Podcasts](https://podcasts.apple.com/us/podcast/010-audio/id1?i=10)
- Episode 11: Channel Search — [▶ search channel](https://www.youtube.com/@x/search?query=11)
- Episode 12: Shares A Video — [▶ YouTube](https://www.youtube.com/watch?v=SHAREDSHAR1)
- Episode 13: Also Shares — [▶ YouTube](https://www.youtube.com/watch?v=SHAREDSHAR1)

## Psychopharmacology  (1)
- Episode 20: A Drug Episode — [▶ YouTube](https://www.youtube.com/watch?v=MEDMEDMEDM1)
"""

BOOKS = """# Book library

## Family & boundaries
- **[Family Guide](https://www.amazon.com/dp/1608822192)** — Julie Fast & John Preston. A family guide.  ISBN 9781608822195
- **[No Description Book](https://www.amazon.com/dp/0593418492)** — Jerold Kreisman & Hal Straus.  ISBN 9780593418499

## Addiction
- **[Craft Book](https://www.amazon.com/dp/1476709475)** — Jeffrey Foote et al. The CRAFT approach.  ISBN 9781476709475
- **[Initial Author](https://www.amazon.com/dp/1684039312)** — Natalie Y. Gutiérrez. Complex PTSD.  ISBN 9781684039319
- **[Bad Check Digit](https://www.amazon.com/dp/0000000000)** — Some One. Text.  ISBN 9780000000001
"""

TOPIC_META = {
    "book_library.md": {
        "relatedTools": ["family-systems.html"],
        "clinicalWorkflow": {"say": "BOOK SAY 'quoted'", "safety": "BOOK SAFETY"},
    },
    "podcast_library.md": {
        "clinicalWorkflow": {"say": "POD SAY", "safety": "POD SAFETY"},
    },
}

SHIPPED = {
    "version": 1,
    "pages": [
        {"slug": "t_mood.md", "sites": ["ms3", "res"], "source": "03_Core_Topics/Mood/m.md"},
        {"slug": "ms3_only.md", "sites": ["ms3"], "source": "14_Tracks/MS3/x.md"},
        {"slug": "pharm.md", "sites": ["ms3", "res"], "source": "05_Psychopharmacology/p.md"},
        {"slug": "family-systems.html", "sites": ["ms3", "res"], "source": "06_Family/f.html"},
    ],
}


def _map(status="approved", **week):
    entry = {"week": 2, "anchor": "t_mood.md", "pairing": None,
             "podcastCategory": "Foundations & the psychiatric interview",
             "listen": [{"episode": 1, "why": "x"}],
             "family": [{"isbn": "9781608822195", "why": "y"}]}
    entry.update(week)
    return {"_note": "fixture", "status": status, "weeks": [entry]}


class MediaIndexTests(unittest.TestCase):
    def setUp(self):
        self.episodes = mi.parse_podcast_library(PODCASTS)
        self.books = mi.parse_book_library(BOOKS)

    def resolve(self, media_map, site="ms3"):
        return mi.resolve(media_map, self.episodes, self.books, TOPIC_META, SHIPPED, site)

    def assertRejects(self, media_map, needle):
        with self.assertRaises(mi.MediaMapError) as caught:
            self.resolve(media_map)
        self.assertIn(needle, str(caught.exception))

    # ---- parsing ----------------------------------------------------------------------

    def test_podcast_line_formats(self):
        e = self.episodes
        self.assertEqual(e[1]["title"], "The Basics")
        self.assertEqual(e[1]["category"], "Foundations & the psychiatric interview")
        self.assertEqual(e[1]["url"], "https://www.youtube.com/watch?v=AAAAAAAAAA1")
        self.assertTrue(e[1]["verified"])
        self.assertTrue(e[2]["verified"], "a YouTube line with no Apple link is still eligible")
        self.assertFalse(e[3]["verified"], "Apple slug names episode 4 on episode 3's line")
        self.assertFalse(e[10]["verified"], "episode audio is not a YouTube link")
        self.assertFalse(e[11]["verified"], "search channel is never eligible")
        self.assertFalse(e[12]["verified"])
        self.assertFalse(e[13]["verified"], "both lines that share one video fail")

    def test_unreadable_episode_line_fails_rather_than_shrinking_the_set(self):
        with self.assertRaises(mi.MediaMapError):
            mi.parse_podcast_library("## Cat  (1)\n- Episode 9 missing colon — [▶ YouTube](u)\n")

    def test_book_line_formats(self):
        b = self.books
        self.assertEqual(b["9781608822195"]["author"], "Julie Fast & John Preston")
        self.assertEqual(b["9781608822195"]["description"], "A family guide.")
        self.assertEqual(b["9781608822195"]["category"], "Family & boundaries")
        self.assertEqual(b["9780593418499"]["author"], "Jerold Kreisman & Hal Straus")
        self.assertEqual(b["9780593418499"]["description"], "")
        self.assertEqual(b["9781476709475"]["author"], "Jeffrey Foote et al.")
        self.assertEqual(b["9781476709475"]["description"], "The CRAFT approach.")
        self.assertEqual(b["9781684039319"]["author"], "Natalie Y. Gutiérrez")
        self.assertFalse(b["9780000000001"]["isbnValid"])

    def test_heading_anchor_matches_the_reader_slug_rule(self):
        self.assertEqual(mi.heading_anchor("Mood & bipolar; suicide"), "mood-bipolar-suicide")
        self.assertEqual(mi.heading_anchor("Addiction (incl. Gabor Maté)"), "addiction-incl-gabor-mat")
        self.assertEqual(mi.heading_anchor("Family, codependency & boundaries"),
                         "family-codependency-boundaries")

    # ---- validation: every failure names its key -------------------------------------

    def test_search_channel_pick_fails(self):
        self.assertRejects(_map(listen=[{"episode": 11}]), "episode 11 has no verified YouTube link")

    def test_episode_audio_and_shared_video_picks_fail(self):
        self.assertRejects(_map(listen=[{"episode": 10}]), "episode 10 has no verified")
        self.assertRejects(_map(listen=[{"episode": 13}]), "episode 13 has no verified")

    def test_unknown_isbn_fails(self):
        self.assertRejects(_map(family=[{"isbn": "9780000000000"}]),
                           "ISBN 9780000000000 is not in the book library")

    def test_bad_check_digit_fails(self):
        self.assertRejects(_map(family=[{"isbn": "9780000000001"}]), "fails its ISBN-13 check digit")

    def test_fabricated_episode_fails(self):
        """The added acceptance: every shipped item resolves to a verified library entry."""
        self.assertRejects(_map(listen=[{"episode": 999}]), "episode 999 is not in the podcast library")

    def test_withheld_item_cannot_be_picked(self):
        """A key listed under "unverified" is unpickable even though the library holds it."""
        media_map = _map(family=[{"isbn": "9781608822195"}])
        media_map["unverified"] = {"items": [{"isbn": "9781608822195", "finding": "x"}]}
        self.assertRejects(media_map, "ISBN 9781608822195 is withheld under unverified")
        media_map = _map(listen=[{"episode": 1}])
        media_map["unverified"] = {"items": [{"episode": 1}]}
        self.assertRejects(media_map, "episode 1 is withheld under unverified")
        media_map = _map()
        media_map["unverified"] = {"items": [{"finding": "names nothing"}]}
        self.assertRejects(media_map, "names no isbn or episode")

    def test_non_shipped_anchor_fails(self):
        self.assertRejects(_map(anchor="not_a_page.md"), "anchor is not a shipped page")

    def test_more_than_two_per_side_fails(self):
        self.assertRejects(_map(listen=[{"episode": 1}, {"episode": 2}, {"episode": 1}]),
                           "listen has 3 items")
        self.assertRejects(_map(family=[{"isbn": "9781608822195"}, {"isbn": "9780593418499"},
                                        {"isbn": "9781476709475"}]), "family has 3 items")

    def test_duplicate_pick_within_a_week_fails(self):
        self.assertRejects(_map(listen=[{"episode": 1}, {"episode": 1}]), "episode 1 picked twice")
        self.assertRejects(_map(family=[{"isbn": "9781608822195"}, {"isbn": "9781608822195"}]),
                           "ISBN 9781608822195 picked twice")

    def test_medication_episode_and_medication_anchor_fail(self):
        self.assertRejects(_map(podcastCategory="Psychopharmacology", listen=[{"episode": 20}]),
                           "medication-workstream episode")
        self.assertRejects(_map(anchor="pharm.md"), "medication-workstream page")

    def test_unknown_category_and_keys_fail(self):
        self.assertRejects(_map(podcastCategory="Nope"), "podcastCategory 'Nope'")
        bad = _map()
        bad["weeks"][0]["title"] = "a title the map may not carry"
        self.assertRejects(bad, "unknown key 'title'")
        bad = _map()
        bad["rendered"] = True
        self.assertRejects(bad, "unknown top-level key 'rendered'")

    def test_invalid_status_fails(self):
        self.assertRejects(_map(status="live"), "status must be")

    # ---- what renders ------------------------------------------------------------------

    def test_draft_renders_nothing_but_is_still_validated(self):
        index = self.resolve(_map(status="draft"))
        self.assertEqual(index["pages"], {})
        self.assertNotIn("guidance", index)
        self.assertRejects(_map(status="draft", listen=[{"episode": 11}]), "episode 11")

    def test_approved_resolves_titles_from_the_libraries(self):
        page = self.resolve(_map())["pages"]["t_mood.md"]
        self.assertEqual(page["listen"], [{"n": 1, "title": "The Basics",
                                           "category": "Foundations & the psychiatric interview",
                                           "url": "https://www.youtube.com/watch?v=AAAAAAAAAA1"}])
        self.assertEqual(page["family"][0]["title"], "Family Guide")
        self.assertEqual(page["familyAll"], {"ref": "book_library.md", "category": "Family & boundaries",
                                             "anchor": "family-boundaries"})
        self.assertEqual(page["listenAll"]["anchor"], "foundations-the-psychiatric-interview")
        self.assertEqual(page["practiceRef"], "family-systems.html")
        self.assertNotIn("why", json.dumps(page), "curator notes are never rendered")

    def test_guidance_is_verbatim_from_topic_meta_and_only_what_renders(self):
        page = self.resolve(_map())["pages"]["t_mood.md"]
        self.assertEqual(page["guidance"], {"familySay": "BOOK SAY 'quoted'", "familySafety": "BOOK SAFETY",
                                            "listenSafety": "POD SAFETY"})
        listen_only = self.resolve(_map(family=[]))["pages"]["t_mood.md"]
        self.assertEqual(listen_only["guidance"], {"listenSafety": "POD SAFETY"})
        self.assertNotIn("guidance", self.resolve(_map()), "no unbound top-level guidance")

    def test_empty_side_is_omitted_not_padded(self):
        page = self.resolve(_map(family=[]))["pages"]["t_mood.md"]
        self.assertNotIn("family", page)
        self.assertNotIn("familyAll", page)
        page = self.resolve(_map(listen=[]))["pages"]["t_mood.md"]
        self.assertNotIn("listen", page)

    def test_anchor_missing_on_one_site_is_skipped_there(self):
        media_map = _map(anchor="ms3_only.md")
        self.assertIn("ms3_only.md", self.resolve(media_map, "ms3")["pages"])
        self.assertEqual(self.resolve(media_map, "res")["pages"], {})

    def test_output_is_deterministic(self):
        self.assertEqual(mi.serialize(self.resolve(_map())), mi.serialize(self.resolve(_map())))

    # ---- site scope ------------------------------------------------------------------

    def test_sites_scope_limits_an_entry_to_named_sites(self):
        media_map = _map(sites=["ms3"])
        self.assertEqual(self.resolve(media_map, "ms3")["pages"]["t_mood.md"]["sites"], ["ms3"])
        self.assertEqual(self.resolve(media_map, "res")["pages"], {}, "an MS3-only pick never reaches residents")
        self.assertEqual(self.resolve(_map(), "res")["pages"]["t_mood.md"]["sites"], ["ms3", "res"])

    def test_bad_sites_scope_fails(self):
        self.assertRejects(_map(sites=[]), "sites must be a non-empty list")
        self.assertRejects(_map(sites=["ms3", "ms3"]), "sites must be a non-empty list")
        self.assertRejects(_map(anchor="ms3_only.md", sites=["res"]), "is not a subset of where the anchor ships")


class SignatureBindingTests(unittest.TestCase):
    """Signature-bound activation: the complete resolved recommendation is a per-page file the
    page's signature covers. A change to what the page shows reopens that page; a curator note,
    a date or a governance field never does."""

    PAGE_SOURCE = "03_Core_Topics/Mood/m.md"

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = tmp.name
        self.write(mi.PODCAST_PATH, PODCASTS)
        self.write(mi.BOOK_PATH, BOOKS)
        self.write(mi.TOPIC_META_PATH, json.dumps(dict(TOPIC_META, **{"t_mood.md": {"tldr": "Mood"}})))
        self.write(shipped_pages.RELATIVE_PATH, json.dumps(SHIPPED))
        self.write(self.PAGE_SOURCE, "# Mood\\n")
        self.write_map(_map())

    def write(self, rel, text):
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)

    def read(self, rel):
        with open(os.path.join(self.root, rel), encoding="utf-8") as fh:
            return fh.read()

    def write_map(self, media_map):
        self.write(mi.MAP_PATH, json.dumps(media_map))

    def shipped_with_binding(self):
        doc = json.loads(json.dumps(SHIPPED))
        for page in doc["pages"]:
            if page["slug"] in mi.bound_sources(self.root):
                page["extraSources"] = [mi.bound_sources(self.root)[page["slug"]]]
        return doc

    def digest(self):
        meta = json.loads(self.read(mi.TOPIC_META_PATH))
        return attestation_hash.digest_from_tree(self.root, self.shipped_with_binding(), meta, "t_mood.md")

    def resolved(self):
        return self.read(mi.resolved_path("t_mood.md"))

    def test_a_draft_binds_nothing_and_needs_no_files(self):
        self.write_map(_map(status="draft"))
        self.assertEqual(mi.bound_sources(self.root), {})
        self.assertEqual(mi.write_resolved(self.root), [])
        self.assertEqual(mi.check_resolved(self.root), [])

    def test_approved_binds_one_file_per_rendering_page(self):
        self.assertEqual(mi.bound_sources(self.root), {"t_mood.md": "media_resolved/t_mood.md.json"})
        self.assertEqual(mi.check_resolved(self.root), ["media_resolved/t_mood.md.json is missing (an approved page renders it)"])
        self.assertEqual(mi.write_resolved(self.root), ["media_resolved/t_mood.md.json"])
        self.assertEqual(mi.check_resolved(self.root), [])
        self.write_map(_map(listen=[], family=[]))
        self.assertEqual(mi.bound_sources(self.root), {}, "an entry that picks nothing renders nothing and binds nothing")

    def test_the_record_is_the_complete_rendered_recommendation_and_nothing_else(self):
        mi.write_resolved(self.root)
        record = json.loads(self.resolved())
        self.assertEqual(sorted(record), ["_note", "family", "familyAll", "guidance", "listen", "listenAll",
                                          "page", "practiceRef", "sites"])
        self.assertEqual(record["family"][0]["description"], "A family guide.")
        self.assertEqual(record["listen"][0]["url"], "https://www.youtube.com/watch?v=AAAAAAAAAA1")
        self.assertEqual(record["guidance"]["familySay"], "BOOK SAY 'quoted'")
        text = self.resolved()
        for absent in ("why", "draftedAt", "gap", "status", "facultyReview", "lastReviewed", "reviewer", "week"):
            self.assertNotIn('"%s"' % absent, text, absent)
        index = mi.build_for_site(self.root, "ms3")
        self.assertEqual({k: v for k, v in record.items() if k != "_note"}, index["pages"]["t_mood.md"],
                         "what the page renders is byte-for-byte what it signs")

    def assert_reopens(self, change, label):
        mi.write_resolved(self.root)
        before_digest, before_bytes = self.digest(), self.resolved()
        ledger = {"t_mood.md": {"status": "reviewed", "at": "2026-10-06", "by": "Fixture",
                                "contentHash": before_digest}}
        change()
        self.assertTrue(mi.check_resolved(self.root), "%s: the build refuses the stale file" % label)
        mi.write_resolved(self.root)
        self.assertNotEqual(self.resolved(), before_bytes, label)
        meta = json.loads(self.read(mi.TOPIC_META_PATH))
        report = attestation_hash.ledger_hash_report(self.root, ledger, self.shipped_with_binding(), meta)
        self.assertIn("t_mood.md", report["stale"], "%s: the page's signature reopens" % label)
        self.assertNotEqual(self.digest(), before_digest)

    def assert_keeps(self, change, label):
        mi.write_resolved(self.root)
        before_digest, before_bytes = self.digest(), self.resolved()
        change()
        self.assertEqual(mi.check_resolved(self.root), [], label)
        self.assertEqual(mi.write_resolved(self.root), [], label)
        self.assertEqual(self.resolved(), before_bytes, label)
        self.assertEqual(self.digest(), before_digest, "%s: the signature stands" % label)

    def test_relevant_upstream_changes_reopen_the_page(self):
        self.assert_reopens(lambda: self.write(mi.PODCAST_PATH, PODCASTS.replace("The Basics", "The Basics, Revised")),
                            "episode title in the podcast library")
        self.assert_reopens(lambda: self.write(mi.PODCAST_PATH, PODCASTS.replace("watch?v=AAAAAAAAAA1", "watch?v=ZZZZZZZZZZ1")),
                            "episode link")
        self.assert_reopens(lambda: self.write(mi.BOOK_PATH, BOOKS.replace("A family guide.", "A revised family guide.")),
                            "book description in the book library")
        self.assert_reopens(lambda: self.write(mi.BOOK_PATH, BOOKS.replace("Julie Fast & John Preston", "Julie A. Fast & John Preston")),
                            "book author")
        meta = json.loads(self.read(mi.TOPIC_META_PATH))
        meta["book_library.md"]["clinicalWorkflow"]["say"] = "BOOK SAY, reworded"
        self.assert_reopens(lambda: self.write(mi.TOPIC_META_PATH, json.dumps(meta)), "offer line in topic_meta")
        meta = json.loads(self.read(mi.TOPIC_META_PATH))
        meta["podcast_library.md"]["clinicalWorkflow"]["safety"] = "POD SAFETY, reworded"
        self.assert_reopens(lambda: self.write(mi.TOPIC_META_PATH, json.dumps(meta)), "podcast safety line in topic_meta")
        self.assert_reopens(lambda: self.write_map(_map(listen=[{"episode": 2}])), "a changed pick")
        self.assert_reopens(lambda: self.write_map(_map(listen=[{"episode": 2}], sites=["ms3"])), "a narrowed site scope")

    def test_notes_dates_unrelated_lines_and_governance_never_reopen(self):
        def note():
            media_map = _map()
            media_map["weeks"][0]["listen"][0]["why"] = "a different curator note"
            media_map["weeks"][0]["family"][0]["why"] = "another note"
            media_map["weeks"][0]["gap"] = "a gap note"
            media_map["draftedAt"] = "2026-12-31"
            self.write_map(media_map)
        self.assert_keeps(note, "curator notes and dates")
        self.assert_keeps(lambda: self.write(mi.BOOK_PATH, BOOKS.replace("The CRAFT approach.", "The CRAFT approach, revised.")),
                          "an unpicked library line")
        def signing():
            meta = json.loads(self.read(mi.TOPIC_META_PATH))
            meta["book_library.md"]["facultyReview"] = {"status": "reviewed", "reviewer": "X", "lastReviewed": "2026-10-06"}
            meta["podcast_library.md"]["clinicalWorkflow"]["say"] = "POD SAY (never rendered)"
            meta["t_mood.md"]["facultyReview"] = {"status": "reviewed", "lastReviewed": "2026-10-06"}
            self.write(mi.TOPIC_META_PATH, json.dumps(meta))
        self.assert_keeps(signing, "signing a library or the page, and the unrendered podcast say line")

    def test_shipped_pages_lists_the_bound_file_as_the_anchor_pages_extra_source(self):
        with mock.patch.object(mi, "bound_sources", return_value={"t_mood.md": "media_resolved/t_mood.md.json"}):
            pages = {page["slug"]: page for page in shipped_pages.derive(LIB)["pages"]}
        self.assertIn("media_resolved/t_mood.md.json", pages["t_mood.md"]["extraSources"])
        self.assertEqual(attestation_hash.sources_for_slug({"pages": list(pages.values())}, "t_mood.md")[-1],
                         "media_resolved/t_mood.md.json", "the attestation hash covers it")
        others = [slug for slug, page in pages.items() if "media_resolved/t_mood.md.json" in page.get("extraSources", [])]
        self.assertEqual(others, ["t_mood.md"], "binding is per page")


class LiveContractTests(unittest.TestCase):
    def test_live_map_resolves_and_a_draft_renders_and_binds_nothing(self):
        for site in ("ms3", "res"):
            index = mi.build_for_site(LIB, site)
            if index["status"] != mi.APPROVED:
                self.assertEqual(index["pages"], {}, site)
        self.assertEqual(mi.check_resolved(LIB), [], "media_resolved/ is in step with the live inputs")
        live = shipped_pages.load_shipped_pages(LIB)
        bound = set(mi.bound_sources(LIB).values())
        listed = {extra for page in live["pages"] for extra in page.get("extraSources", [])
                  if extra.startswith(mi.RESOLVED_DIR + "/")}
        self.assertEqual(listed, bound, "shipped_pages.json binds exactly the approved recommendations")


if __name__ == "__main__":
    unittest.main()
