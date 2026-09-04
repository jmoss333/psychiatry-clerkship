"""Contract tests for the MS3 Six-Week Compass's pure renderer."""

from pathlib import Path
import unittest

import welcome_compass


WEEKS = [
    {"n": 1, "title": "Foundations & the MSE", "landingRef": "week1.md"},
    {"n": 2, "title": "Mood, Psychosis & Pharm", "landingRef": "week2.md"},
    {"n": 3, "title": "Psychotherapy & Personality", "landingRef": "week3.md"},
    {"n": 4, "title": "Family Systems & EE", "landingRef": "week4.md"},
    {"n": 5, "title": "Acute & Emergency", "landingRef": "week5.md"},
    {"n": 6, "title": "Integration & Exam", "landingRef": "week6.md"},
]
SHIPPED = {
    "pages": [
        *[
            {"slug": "week%d.md" % n, "kind": "page", "sites": ["ms3"]}
            for n in range(1, 7)
        ],
        {"slug": "tool.html", "kind": "tool", "sites": ["ms3"]},
        {"slug": "resident.md", "kind": "page", "sites": ["res"]},
    ]
}
SAFETY = (
    "If you are worried about immediate safety, tell the resident or attending now. "
    "Do not wait for rounds. Do not carry it alone."
)


class WelcomeCompassTests(unittest.TestCase):
    def cards(self):
        return welcome_compass.prepare_cards(WEEKS, SHIPPED)

    def assert_contract_error(self, weeks, field):
        with self.assertRaisesRegex(welcome_compass.CompassContractError, field):
            welcome_compass.prepare_cards(weeks, SHIPPED)

    def test_accepts_six_valid_ordered_cards(self):
        cards = self.cards()
        self.assertEqual(
            cards,
            tuple(
                welcome_compass.CompassCard(
                    n=week["n"], title=week["title"], landing_ref=week["landingRef"]
                )
                for week in WEEKS
            ),
        )

    def test_rejects_wrong_card_count(self):
        self.assert_contract_error(WEEKS[:-1], "exactly six")

    def test_rejects_missing_reordered_and_boolean_week_numbers(self):
        for invalid in (
            [{**week, "n": None} if week["n"] == 2 else week for week in WEEKS],
            [{**week, "n": 3} if week["n"] == 2 else week for week in WEEKS],
            [{**week, "n": True} if week["n"] == 1 else week for week in WEEKS],
        ):
            self.assert_contract_error(invalid, "week numbers")

    def test_rejects_blank_title(self):
        self.assert_contract_error([{**WEEKS[0], "title": " "}, *WEEKS[1:]], "title")

    def test_rejects_missing_blank_and_duplicate_landing_refs(self):
        cases = (
            ([{key: value for key, value in WEEKS[0].items() if key != "landingRef"}, *WEEKS[1:]]),
            ([{**WEEKS[0], "landingRef": " "}, *WEEKS[1:]]),
            ([{**WEEKS[0], "landingRef": "week2.md"}, *WEEKS[1:]]),
        )
        for invalid in cases:
            self.assert_contract_error(invalid, "landingRef")

    def test_rejects_html_tool_resident_only_and_unknown_targets(self):
        for ref in ("tool.html", "resident.md", "unknown.md"):
            self.assert_contract_error([{**WEEKS[0], "landingRef": ref}, *WEEKS[1:]], "landingRef")

    def test_extracts_one_marked_safety_rule_with_normalized_whitespace(self):
        source = "before\r\n%s\r\n%s\r\n%s\r\nafter" % (
            welcome_compass.SAFETY_START,
            "If you are worried about immediate safety, tell the resident or attending now.\n\n"
            "Do not wait for rounds.   Do not carry it alone.",
            welcome_compass.SAFETY_END,
        )
        self.assertEqual(welcome_compass.extract_safety_rule(source), SAFETY)

    def test_rejects_bad_safety_marker_shapes(self):
        bad_sources = (
            ("exactly one", "text"),
            ("exactly one", (welcome_compass.SAFETY_START + " x " + welcome_compass.SAFETY_END) * 2),
            ("reversed", welcome_compass.SAFETY_END + " text " + welcome_compass.SAFETY_START),
            ("empty", welcome_compass.SAFETY_START + " \n " + welcome_compass.SAFETY_END),
            ("nested", welcome_compass.SAFETY_START + " " + welcome_compass.SAFETY_START + " x " + welcome_compass.SAFETY_END),
        )
        for expected, source in bad_sources:
            with self.assertRaisesRegex(welcome_compass.CompassContractError, expected):
                welcome_compass.extract_safety_rule(source)

    def test_injects_one_welcome_marker_and_rejects_zero_or_two(self):
        rendered, injected = welcome_compass.inject_compass(
            "Before\n%s\nAfter" % welcome_compass.COMPASS_MARKER, "<div>Compass</div>"
        )
        self.assertEqual(rendered, "Before\n<div>Compass</div>\nAfter")
        self.assertTrue(injected)
        for source in ("no marker", welcome_compass.COMPASS_MARKER * 2):
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "Compass marker"):
                welcome_compass.inject_compass(source, "fragment")

    def test_escapes_card_titles_links_and_safety_payload(self):
        card = welcome_compass.CompassCard(1, 'A & <B> "C" \'D\'', 'week&<"\'.md')
        fragment = welcome_compass.render_compass((card,), 'Safe & <sound> "quoted" \'text\'')
        self.assertIn("A &amp; &lt;B&gt; &quot;C&quot; &#x27;D&#x27;", fragment)
        self.assertIn("week&amp;&lt;&quot;&#x27;.md", fragment)
        self.assertIn("Safe &amp; &lt;sound&gt; &quot;quoted&quot; &#x27;text&#x27;", fragment)

    def test_renders_the_exact_semantic_compass_shape(self):
        fragment = welcome_compass.render_compass(self.cards(), SAFETY)
        self.assertEqual(fragment.count("data-ms3-compass-root"), 1)
        self.assertEqual(fragment.count("data-ms3-compass-safety"), 1)
        self.assertEqual(fragment.count("data-ms3-compass-scope"), 1)
        self.assertEqual(fragment.count("aria-labelledby=\"ms3-compass-title\""), 1)
        self.assertEqual(fragment.count("<ol class=\"ms3-compass__weeks\""), 1)
        self.assertEqual(fragment.count("data-ms3-compass-week=\""), 6)
        self.assertEqual(fragment.count("data-ms3-compass-link"), 6)
        for n in range(1, 7):
            self.assertIn('href="?page=week%d.md"' % n, fragment)
        self.assertEqual(fragment.count("data-ms3-compass-prompt"), 1)
        self.assertEqual(fragment.count("data-ms3-compass-orientation"), 1)

    def test_renderer_excludes_interactive_and_media_markup(self):
        fragment = welcome_compass.render_compass(self.cards(), SAFETY)
        for forbidden in (
            "theme",
            "focusCategories",
            "items",
            "minutes",
            "progress",
            "complete",
            "score",
            "protocol steps",
            "storage",
            "<script",
            "<style",
            "<video",
            "<img",
        ):
            self.assertNotIn(forbidden, fragment)

    def test_nav_projection_accepts_each_hidden_markdown_week_once(self):
        nav = [{"section": "Compass", "items": [
            {"f": card.landing_ref, "k": "md", "hidden": True,
             "t": "Week %d — %s" % (card.n, card.title)}
            for card in self.cards()
        ]}]
        self.assertIsNone(welcome_compass.assert_nav_projection(nav, self.cards()))

    def test_nav_projection_rejects_missing_duplicate_wrong_kind_visible_or_wrong_title(self):
        good = [
            {"f": card.landing_ref, "k": "md", "hidden": True,
             "t": "Week %d — %s" % (card.n, card.title)}
            for card in self.cards()
        ]
        invalid_rows = (
            good[1:],
            [*good, good[0]],
            [{**good[0], "k": "tool"}, *good[1:]],
            [{**good[0], "hidden": False}, *good[1:]],
            [{**good[0], "t": "Week 1 — Wrong"}, *good[1:]],
        )
        for rows in invalid_rows:
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "week1.md"):
                welcome_compass.assert_nav_projection([{"section": "Compass", "items": rows}], self.cards())

    def test_renderer_module_uses_only_derived_shipped_document_governance_input(self):
        source = (Path(__file__).with_name("welcome_compass.py").read_text(encoding="utf-8")
                  if Path(__file__).with_name("welcome_compass.py").exists() else "")
        self.assertNotIn("site_manifest.json", source)
        self.assertNotIn("cotw_registry.json", source)


if __name__ == "__main__":
    unittest.main()
