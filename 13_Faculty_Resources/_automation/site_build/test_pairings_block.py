#!/usr/bin/env python3
"""Behavior tests for the week-page pairing block renderer.

Wired explicitly into ci.yml and bin/verify.sh: nothing in this repo globs
site_build/test_*.py, so a test file dropped here would never run and could regress in
silence. See the pairings implementation plan §9.
"""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import audio_transcripts
import pairings_block


LIB = Path(__file__).resolve().parents[3]
MEDIA_MANIFEST = LIB / "media_manifest.json"
OE_KIND = "paper-overview-audio"


def _data():
    return pairings_block.resolve(pairings_block.load(LIB), LIB)


class PairingBlockTests(unittest.TestCase):
    def setUp(self):
        self.data = _data()

    # ---- marker contract -------------------------------------------------------------

    def test_absent_marker_leaves_text_untouched(self):
        text = "# Week 5\n\nNo marker here.\n"
        out, injected = pairings_block.inject_markdown(text, self.data, "week5.md", "ms3")
        self.assertFalse(injected)
        self.assertEqual(out, text)

    def test_marker_is_replaced_exactly_once_and_consumed(self):
        text = "# Week 5\n\n%s\n\ntail\n" % pairings_block.MARKER
        out, injected = pairings_block.inject_markdown(text, self.data, "week5.md", "ms3")
        self.assertTrue(injected)
        self.assertNotIn(pairings_block.MARKER, out)
        self.assertEqual(out.count("<details class=\"pairing-block\">"), 1)
        self.assertIn("tail", out)

    def test_resident_second_pass_is_a_noop_on_an_already_injected_page(self):
        """The resident site is copytree(MS3), so its week pages arrive pre-injected.

        The whole audience-scoping correction in the plan rests on marker consumption
        making the second pass inert; if this ever stopped holding, residents would get
        two blocks.
        """
        text = "# Week 5\n\n%s\n" % pairings_block.MARKER
        once, first = pairings_block.inject_markdown(text, self.data, "week5.md", "ms3")
        twice, second = pairings_block.inject_markdown(once, self.data, "week5.md", "res")
        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(once, twice)

    def test_marker_on_a_non_week_page_is_a_build_error(self):
        text = "# Delirium\n\n%s\n" % pairings_block.MARKER
        with self.assertRaises(SystemExit):
            pairings_block.inject_markdown(text, self.data, "delirium.md", "ms3")

    # ---- determinism -----------------------------------------------------------------

    def test_render_is_byte_identical_across_calls(self):
        """Byte-reproducibility is what keeps tests/smoke/ visual baselines stable."""
        for week in range(1, 7):
            pairing = pairings_block.pairing_for(self.data, week, "ms3")
            first = pairings_block.render_markdown(pairing, "collapsible")
            second = pairings_block.render_markdown(pairing, "collapsible")
            self.assertEqual(first, second)

    def test_resolve_does_not_mutate_its_input(self):
        raw = pairings_block.load(LIB)
        before = json.dumps(raw, sort_keys=True)
        pairings_block.resolve(raw, LIB)
        self.assertEqual(json.dumps(raw, sort_keys=True), before)

    def test_render_does_not_depend_on_registry_item_order(self):
        pairing = dict(pairings_block.pairing_for(self.data, 5, "ms3"))
        forward = pairings_block.render_markdown(pairing, "collapsible")
        shuffled = dict(pairing)
        shuffled["items"] = list(reversed(pairing["items"]))
        self.assertEqual(forward, pairings_block.render_markdown(shuffled, "collapsible"))

    # ---- reference resolution --------------------------------------------------------

    def test_unknown_audio_brief_raises(self):
        raw = pairings_block.load(LIB)
        raw["pairings"][0]["items"] = [{"role": "listen", "kind": "audio_oe", "ref": "999"}]
        with self.assertRaises(SystemExit):
            pairings_block.resolve(raw, LIB)

    def test_unknown_page_reference_raises(self):
        raw = pairings_block.load(LIB)
        raw["pairings"][0]["items"] = [{"role": "read", "kind": "page", "ref": "nope.md"}]
        with self.assertRaises(SystemExit):
            pairings_block.resolve(raw, LIB)

    def test_audio_item_points_at_a_file_that_exists_on_disk(self):
        """The listen leg is the reason this block exists — a dead audio src defeats it."""
        for week in range(1, 7):
            pairing = pairings_block.pairing_for(self.data, week, "ms3")
            for item in pairing["items"]:
                if item.get("kind") == "audio_oe":
                    path = LIB / pairings_block.AUDIO_DIR / item["_filename"]
                    self.assertTrue(path.exists(), "missing audio file: %s" % path)

    # ---- rendered shape --------------------------------------------------------------

    def test_collapsible_mode_emits_details_collapsed_by_default(self):
        """Faculty decision 2026-09-04: collapsed, with the topic still named in the summary."""
        pairing = pairings_block.pairing_for(self.data, 5, "ms3")
        html = pairings_block.render_markdown(pairing, "collapsible")
        self.assertTrue(html.startswith('<details class="pairing-block">'))
        self.assertNotIn("<details open", html)
        self.assertIn("<summary>", html)
        self.assertIn(pairing["topic"], html)

    def test_open_mode_emits_a_plain_section(self):
        pairing = pairings_block.pairing_for(self.data, 5, "ms3")
        html = pairings_block.render_markdown(pairing, "open")
        self.assertTrue(html.startswith('<section class="pairing-block">'))
        self.assertNotIn("<details", html)

    def test_every_week_and_audience_renders_something(self):
        for week in range(1, 7):
            for audience in ("ms3", "res"):
                pairing = pairings_block.pairing_for(self.data, week, audience)
                self.assertIsNotNone(pairing, "week %d / %s has no pairing" % (week, audience))
                html = pairings_block.render_markdown(pairing, "collapsible")
                self.assertIn("Suggested, not required", html)

    def test_p1_registry_carries_no_external_items(self):
        """P1's whole safety property: no external link, therefore no verification debt."""
        external = {"book", "audiobook", "podcast"}
        for pairing in self.data["pairings"]:
            for item in pairing["items"]:
                self.assertNotIn(
                    item["kind"], external,
                    "%s ships an external item before the link check" % pairing["id"],
                )

    # ---- transcripts (WP-16 step 2) ------------------------------------------------------

    def _audio_items(self):
        for week in range(1, 7):
            for audience in ("ms3", "res"):
                pairing = pairings_block.pairing_for(self.data, week, audience)
                for item in pairing["items"]:
                    if item.get("kind") == "audio_oe":
                        yield pairing, item

    def test_every_audio_player_links_its_transcript(self):
        """WCAG 1.2.1: the text alternative sits beside the player, in the same <li>."""
        seen = 0
        for pairing, item in self._audio_items():
            tid = audio_transcripts.transcript_id(item["ref"])
            html = pairings_block.render_markdown(pairing, "collapsible")
            li = [line for line in html.splitlines() if "<audio" in line]
            self.assertEqual(len(li), 1, pairing["id"])
            self.assertIn(
                '<a class="pairing-transcript" href="audio_oe/transcripts/%s.html" '
                'target="_blank" rel="noopener" aria-label="Transcript: ' % tid,
                li[0],
            )
            self.assertTrue(li[0].rstrip().endswith(">Transcript</a></li>"), li[0])
            self.assertTrue(audio_transcripts.exists(LIB, tid), "no sidecar for %s" % tid)
            seen += 1
        self.assertGreater(seen, 0, "no audio item rendered — the check examined nothing")

    def test_a_paired_brief_without_a_transcript_is_a_build_error(self):
        with tempfile.TemporaryDirectory() as empty:
            with mock.patch.object(audio_transcripts, "SOURCE_DIR", os.path.relpath(empty, LIB)):
                with self.assertRaises(SystemExit) as caught:
                    pairings_block.resolve(pairings_block.load(LIB), LIB)
        self.assertIn("has no transcript", str(caught.exception))

    def test_media_manifest_claims_a_text_alternative_exactly_where_a_player_links_one(self):
        """The manifest must not claim a transcript a learner cannot reach, and must not
        miss one it can. Reachable = linked from a pairing block (review.html plays every
        brief but is attested and deliberately unedited, so it links none)."""
        manifest = json.loads(MEDIA_MANIFEST.read_text(encoding="utf-8"))
        oe = {e["file"]: e for e in manifest["audio"] if e.get("kind") == OE_KIND}
        self.assertEqual(len(oe), 50)
        paired = {"audio_oe/" + item["_filename"] for _pairing, item in self._audio_items()}
        self.assertTrue(paired)
        for served, entry in sorted(oe.items()):
            tid = audio_transcripts.transcript_id(served.split("/")[1][3:5])
            self.assertEqual(
                entry.get("transcriptSource"), audio_transcripts.source_path("", tid), served
            )
            self.assertTrue((LIB / entry["transcriptSource"]).is_file(), served)
            self.assertIn("NotebookLM", entry.get("generatedBy", ""), served)
            if served in paired:
                self.assertIsInstance(entry.get("textAlt"), str, served)
                self.assertIn(audio_transcripts.served_path(tid), entry["textAlt"], served)
            else:
                self.assertIsNone(entry.get("textAlt"), "claims an unreachable transcript: %s" % served)
            # monthly_review.py counts `transcript`/`transcriptPath` as an accessible record;
            # the sidecar path is recorded under a key it does not read, so an unlinked
            # transcript cannot quietly clear the accessibility debt.
            self.assertNotIn("transcript", entry, served)
            self.assertNotIn("transcriptPath", entry, served)


class TranscriptTests(unittest.TestCase):
    """audio_transcripts.py — the build-time renderer. Lives here because nothing globs
    site_build/test_*.py (see the module docstring above)."""

    SIDECAR = (
        "<!-- transcript-status: machine -->\n"
        "<!-- audio-file: 12_Media/audio_oe/OE-07_x.m4a -->\n\n"
        "# Transcript: Divalproex & Lithium: The Bowden Trial\n\n"
        "- **Machine transcript** — pending faculty spot-check.\n\n"
        "---\n\n"
        "First paragraph.\n\nSecond paragraph.\n"
    )

    def _lib(self, files):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        directory = os.path.join(root.name, audio_transcripts.SOURCE_DIR)
        os.makedirs(directory)
        for name, text in files.items():
            with open(os.path.join(directory, name), "w", encoding="utf-8") as handle:
                handle.write(text)
        return root.name

    def test_ids_and_paths(self):
        self.assertEqual(audio_transcripts.transcript_id("7"), "OE-07")
        self.assertEqual(audio_transcripts.transcript_id("07"), "OE-07")
        self.assertEqual(audio_transcripts.served_path("OE-07"), "audio_oe/transcripts/OE-07.html")
        with self.assertRaises(SystemExit):
            audio_transcripts.transcript_id("x7")

    def test_publish_renders_a_readable_standalone_page(self):
        lib = self._lib({"OE-07.md": self.SIDECAR})
        with tempfile.TemporaryDirectory() as out:
            self.assertEqual(audio_transcripts.publish(lib, out), ["OE-07"])
            page = Path(out, "audio_oe", "transcripts", "OE-07.html").read_text(encoding="utf-8")
        self.assertTrue(page.startswith("<!doctype html>\n<html lang=\"en\">"))
        self.assertIn('<meta name="viewport"', page)
        self.assertIn("<title>Transcript: Divalproex &amp; Lithium: The Bowden Trial</title>", page)
        self.assertIn("<h1>Transcript: Divalproex &amp; Lithium: The Bowden Trial</h1>", page)
        self.assertIn("<!-- transcript-status: machine -->", page)
        self.assertIn("pending faculty spot-check", page)
        self.assertIn("<p>First paragraph.</p>", page)
        self.assertIn("<p>Second paragraph.</p>", page)

    def test_publish_is_byte_identical_across_runs(self):
        lib = self._lib({"OE-07.md": self.SIDECAR, "OE-08.md": self.SIDECAR})
        pages = []
        for _ in range(2):
            with tempfile.TemporaryDirectory() as out:
                audio_transcripts.publish(lib, out)
                pages.append(
                    [Path(out, "audio_oe", "transcripts", n).read_bytes() for n in ("OE-07.html", "OE-08.html")]
                )
        self.assertEqual(pages[0], pages[1])

    def test_malformed_sidecars_abort_the_build(self):
        for name, text in (
            ("OE-07.md", self.SIDECAR.replace("<!-- transcript-status: machine -->\n", "")),
            ("OE-07.md", self.SIDECAR.replace("# Transcript", "Transcript")),
            ("OE-7.md", self.SIDECAR),
            ("notes.txt", "draft"),
        ):
            lib = self._lib({name: text})
            with tempfile.TemporaryDirectory() as out:
                with self.assertRaises(SystemExit, msg=name):
                    audio_transcripts.publish(lib, out)

    def test_every_committed_sidecar_publishes_and_names_its_status(self):
        """The real set: one sidecar per OE brief, each a valid page, none silently skipped."""
        ids = audio_transcripts.discover(LIB)
        self.assertEqual(ids, ["OE-%02d" % n for n in range(1, 51)])
        with tempfile.TemporaryDirectory() as out:
            self.assertEqual(audio_transcripts.publish(LIB, out), ids)
            written = sorted(os.listdir(os.path.join(out, audio_transcripts.OUT_DIR)))
        self.assertEqual(written, [tid + ".html" for tid in ids])
        for tid in ids:
            text = Path(audio_transcripts.source_path(str(LIB), tid)).read_text(encoding="utf-8")
            state = audio_transcripts.status(text)
            self.assertIn(state, ("machine", "reviewed"), tid)
            if state == "machine":
                self.assertIn("pending faculty spot-check", text, tid)
            self.assertIn("AI-generated", text, tid)


if __name__ == "__main__":
    unittest.main()
