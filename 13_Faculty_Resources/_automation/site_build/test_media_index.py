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
import unittest

import media_index as mi

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

    def test_guidance_is_verbatim_from_topic_meta(self):
        guidance = self.resolve(_map())["guidance"]
        self.assertEqual(guidance, {"familySay": "BOOK SAY 'quoted'", "familySafety": "BOOK SAFETY",
                                    "listenSay": "POD SAY", "listenSafety": "POD SAFETY"})

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

    # ---- the live map: contract only ---------------------------------------------------

    def test_live_map_resolves_and_a_draft_renders_nothing(self):
        for site in ("ms3", "res"):
            index = mi.build_for_site(LIB, site)
            if index["status"] != mi.APPROVED:
                self.assertEqual(index["pages"], {}, site)


if __name__ == "__main__":
    unittest.main()
