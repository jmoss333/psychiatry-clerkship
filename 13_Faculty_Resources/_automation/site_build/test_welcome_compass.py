"""Contract tests for the MS3 Six-Week Compass's pure renderer."""

from pathlib import Path
import tempfile
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
EXPECTED_FRAGMENT = (
    '<div data-ms3-compass-root>'
    '<aside data-ms3-compass-safety role="note">'
    '<p>If you are worried about immediate safety, tell the resident or attending now. '
    'Do not wait for rounds. Do not carry it alone.</p>'
    '<a href="?page=orientation.md">Open the Orientation Packet</a></aside>'
    '<p data-ms3-compass-scope>This map supports orientation, supervised practice, and reflection. '
    'It is not a checklist, clinical protocol, or measure of readiness. Using or viewing this map '
    'does not establish competence, entrustment, or permission to act independently.</p>'
    '<section class="ms3-compass" data-ms3-compass aria-labelledby="ms3-compass-title">'
    '<h2 id="ms3-compass-title">Six-Week Compass</h2>'
    '<ol class="ms3-compass__weeks" data-ms3-compass-weeks>'
    '<li data-ms3-compass-week="1"><span>Week 1</span><h3>Foundations &amp; the MSE</h3>'
    '<a data-ms3-compass-link href="?page=week1.md">Open Week 1</a></li>'
    '<li data-ms3-compass-week="2"><span>Week 2</span><h3>Mood, Psychosis &amp; Pharm</h3>'
    '<a data-ms3-compass-link href="?page=week2.md">Open Week 2</a></li>'
    '<li data-ms3-compass-week="3"><span>Week 3</span><h3>Psychotherapy &amp; Personality</h3>'
    '<a data-ms3-compass-link href="?page=week3.md">Open Week 3</a></li>'
    '<li data-ms3-compass-week="4"><span>Week 4</span><h3>Family Systems &amp; EE</h3>'
    '<a data-ms3-compass-link href="?page=week4.md">Open Week 4</a></li>'
    '<li data-ms3-compass-week="5"><span>Week 5</span><h3>Acute &amp; Emergency</h3>'
    '<a data-ms3-compass-link href="?page=week5.md">Open Week 5</a></li>'
    '<li data-ms3-compass-week="6"><span>Week 6</span><h3>Integration &amp; Exam</h3>'
    '<a data-ms3-compass-link href="?page=week6.md">Open Week 6</a></li>'
    '</ol></section>'
    '<p data-ms3-compass-prompt>Choose the week or task you are preparing to discuss with your '
    'supervising team.</p>'
    '<a data-ms3-compass-orientation href="?tool=orientation-video.html">Optional: watch the '
    'captioned orientation overview (transcript available)</a>'
    '</div>'
)
BUILT_ORIENTATION_PATHS = [
    "tools/orientation-video.html",
    "tools/Inpatient_Psych_Orientation.mp4",
    "tools/Inpatient_Psych_Orientation.vtt",
    "tools/poster.jpg",
]


def write_complete_ms3_output(root, welcome):
    content = Path(root, "content")
    tools = Path(root, "tools")
    content.mkdir()
    tools.mkdir()
    (content / "welcome.md").write_text(welcome, encoding="utf-8")
    for relative_path in BUILT_ORIENTATION_PATHS:
        Path(root, relative_path).write_bytes(b"completed build asset")


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
            [{key: value for key, value in week.items() if key != "n"} if week["n"] == 2 else week for week in WEEKS],
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

    def test_rejects_malformed_shipped_page_sites_with_a_contract_error(self):
        malformed = {"pages": [{**SHIPPED["pages"][0], "sites": 7}, *SHIPPED["pages"][1:]]}
        with self.assertRaisesRegex(welcome_compass.CompassContractError, "sites"):
            welcome_compass.prepare_cards(WEEKS, malformed)

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
        self.assertEqual(fragment, EXPECTED_FRAGMENT)

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

    def test_requires_each_nonempty_regular_readable_non_lfs_source_file(self):
        with tempfile.TemporaryDirectory() as root:
            relative_paths = ["orientation.html", "orientation.mp4", "orientation.vtt", "poster.jpg"]
            for relative_path in relative_paths:
                Path(root, relative_path).write_bytes(b"real package asset")

            self.assertIsNone(welcome_compass.require_real_files(root, relative_paths))

    def test_reports_every_invalid_orientation_source_file(self):
        with tempfile.TemporaryDirectory() as root:
            empty = Path(root, "empty.mp4")
            empty.touch()
            directory = Path(root, "directory.vtt")
            directory.mkdir()
            unreadable = Path(root, "unreadable.jpg")
            unreadable.write_bytes(b"poster")
            unreadable.chmod(0o000)
            pointer = Path(root, "pointer.html")
            pointer.write_bytes(welcome_compass.LFS_HEADER + b" oid sha256:abc")
            relative_paths = [
                "missing.html",
                "empty.mp4",
                "directory.vtt",
                "unreadable.jpg",
                "pointer.html",
            ]
            try:
                with self.assertRaises(welcome_compass.CompassContractError) as raised:
                    welcome_compass.require_real_files(root, relative_paths)
            finally:
                unreadable.chmod(0o644)

            for relative_path in relative_paths:
                self.assertIn(relative_path, str(raised.exception))

    def test_accepts_one_exact_rendered_compass_and_complete_orientation_package(self):
        with tempfile.TemporaryDirectory() as root:
            write_complete_ms3_output(root, "Before\n" + EXPECTED_FRAGMENT + "\nAfter\n")
            self.assertIsNone(
                welcome_compass.assert_ms3_output(
                    root, self.cards(), SAFETY, BUILT_ORIENTATION_PATHS
                )
            )

    def test_rejects_missing_built_orientation_file(self):
        with tempfile.TemporaryDirectory() as root:
            write_complete_ms3_output(root, EXPECTED_FRAGMENT)
            Path(root, "tools", "poster.jpg").unlink()
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "poster.jpg"):
                welcome_compass.assert_ms3_output(
                    root, self.cards(), SAFETY, BUILT_ORIENTATION_PATHS
                )

    def test_rejects_two_identical_rendered_compass_fragments(self):
        with tempfile.TemporaryDirectory() as root:
            write_complete_ms3_output(root, EXPECTED_FRAGMENT + EXPECTED_FRAGMENT)
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "exactly once"):
                welcome_compass.assert_ms3_output(
                    root, self.cards(), SAFETY, BUILT_ORIENTATION_PATHS
                )

    def test_rejects_a_stale_compass_root_beside_the_expected_fragment(self):
        with tempfile.TemporaryDirectory() as root:
            stale = '<div data-ms3-compass-root>stale output</div>'
            write_complete_ms3_output(root, EXPECTED_FRAGMENT + stale)
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "exactly one Compass root"):
                welcome_compass.assert_ms3_output(
                    root, self.cards(), SAFETY, BUILT_ORIENTATION_PATHS
                )

    def test_rejects_a_raw_compass_marker_in_built_welcome(self):
        with tempfile.TemporaryDirectory() as root:
            write_complete_ms3_output(root, EXPECTED_FRAGMENT + welcome_compass.COMPASS_MARKER)
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "raw Compass marker"):
                welcome_compass.assert_ms3_output(
                    root, self.cards(), SAFETY, BUILT_ORIENTATION_PATHS
                )

    def test_rejects_a_raw_safety_start_marker_in_built_welcome(self):
        with tempfile.TemporaryDirectory() as root:
            write_complete_ms3_output(root, EXPECTED_FRAGMENT + welcome_compass.SAFETY_START)
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "raw safety marker"):
                welcome_compass.assert_ms3_output(
                    root, self.cards(), SAFETY, BUILT_ORIENTATION_PATHS
                )

    def test_rejects_a_raw_safety_end_marker_in_built_welcome(self):
        with tempfile.TemporaryDirectory() as root:
            write_complete_ms3_output(root, EXPECTED_FRAGMENT + welcome_compass.SAFETY_END)
            with self.assertRaisesRegex(welcome_compass.CompassContractError, "raw safety marker"):
                welcome_compass.assert_ms3_output(
                    root, self.cards(), SAFETY, BUILT_ORIENTATION_PATHS
                )

    def test_missing_curriculum_uses_the_targeted_compass_preflight_path(self):
        with tempfile.TemporaryDirectory() as root:
            packet = Path(root, "orientation.md")
            packet.write_text("packet", encoding="utf-8")
            with self.assertRaisesRegex(
                welcome_compass.CompassPreflightError, "BUILD ABORTED — MS3 Compass:"
            ):
                welcome_compass.load_ms3_preflight_sources(
                    Path(root, "curriculum.json"), packet
                )

    def test_missing_orientation_packet_uses_the_targeted_compass_preflight_path(self):
        with tempfile.TemporaryDirectory() as root:
            curriculum = Path(root, "curriculum.json")
            curriculum.write_text('{"learningPaths": {}}', encoding="utf-8")
            with self.assertRaisesRegex(
                welcome_compass.CompassPreflightError, "BUILD ABORTED — MS3 Compass:"
            ):
                welcome_compass.load_ms3_preflight_sources(
                    curriculum, Path(root, "orientation.md")
                )

    def test_renderer_module_uses_only_derived_shipped_document_governance_input(self):
        source = (Path(__file__).with_name("welcome_compass.py").read_text(encoding="utf-8")
                  if Path(__file__).with_name("welcome_compass.py").exists() else "")
        self.assertNotIn("site_manifest.json", source)
        self.assertNotIn("cotw_registry.json", source)


if __name__ == "__main__":
    unittest.main()
