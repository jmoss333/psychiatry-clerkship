#!/usr/bin/env python3
"""Unit tests for analytics_events.derive()."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import analytics_events as ae  # noqa: E402


class DeriveTests(unittest.TestCase):
    def test_every_page_key_names_a_shipped_slug(self):
        doc = ae.derive()
        import shipped_pages as sp
        shipped = sp.load_shipped_pages()
        for site in ("ms3", "res"):
            allowed = sp.slugs_for_site(shipped, site)
            for key in doc["keys"][site]:
                if key.startswith("page:"):
                    self.assertIn(key[len("page:"):], allowed, key)

    def test_tool_keys_appear_on_both_sites(self):
        doc = ae.derive()
        tools = {k for k in doc["keys"]["ms3"] if k.startswith("tool:")}
        self.assertTrue(tools, "expected at least one tool key")
        self.assertEqual(tools, {k for k in doc["keys"]["res"] if k.startswith("tool:")})

    def test_keys_are_sorted_and_unique(self):
        doc = ae.derive()
        for site in ("ms3", "res"):
            keys = doc["keys"][site]
            self.assertEqual(keys, sorted(keys))
            self.assertEqual(len(keys), len(set(keys)))

    def test_rejects_a_tool_step_with_illegal_characters(self):
        with self.assertRaises(ae.AnalyticsEventsError):
            ae._tool_keys({"tools": {"bad tool": ["open"]}})


if __name__ == "__main__":
    unittest.main()
