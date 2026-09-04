#!/usr/bin/env python3
"""Behavior tests for the week-page pairing block renderer.

Wired explicitly into ci.yml and bin/verify.sh: nothing in this repo globs
site_build/test_*.py, so a test file dropped here would never run and could regress in
silence. See the pairings implementation plan §9.
"""

import json
import unittest
from pathlib import Path

import pairings_block


LIB = Path(__file__).resolve().parents[3]


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


if __name__ == "__main__":
    unittest.main()
