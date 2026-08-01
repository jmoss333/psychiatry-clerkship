"""Unit tests for common.py — the shared ms3/resident assembly logic.

Run: python3 13_Faculty_Resources/_automation/site_build/test_common.py

Before common.py existed, the assembler had essentially no test coverage: the
only test that executed build_deploy.py asserted exit-0 and that two files
landed. These tests cover the machinery that both audience builds now share,
with particular attention to the two failure classes the extraction was meant
to eliminate:

  1. Silent drift between the two sites' synonym / tool-keyword tables.
  2. HTML transforms that silently no-op on a page authored slightly
     differently (the rp-* bypass).
"""

import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402


class TestTokenizer(unittest.TestCase):
    def test_drops_stopwords_and_single_chars(self):
        self.assertEqual(common.tok("The a patient is in Bed 4"), ["patient", "bed"])

    def test_splits_on_punctuation_and_lowercases(self):
        self.assertEqual(common.tok("PHQ-9/GAD-7"), ["phq", "gad"])

    def test_handles_none_and_empty(self):
        self.assertEqual(common.tok(None), [])
        self.assertEqual(common.tok(""), [])


class TestSynonyms(unittest.TestCase):
    def test_bidirectional_within_a_group(self):
        syn = common.build_synonyms([["ss", "serotonin syndrome"]])
        self.assertIn("serotonin", syn["ss"])
        self.assertIn("ss", syn["serotonin"])

    def test_token_accumulates_across_groups_without_fusing_them(self):
        """The merge policy that keeps 'cows' from pulling in alcohol pages.

        'opioid' appears in both groups so it gains synonyms from both, but the
        groups themselves must NOT fuse — otherwise 'cows' (opioid withdrawal)
        would expand to 'alcohol', which is a real relevance regression.
        """
        syn = common.build_synonyms(
            [["sud", "alcohol", "opioid"], ["cows", "opioid withdrawal"]]
        )
        self.assertIn("alcohol", syn["opioid"])
        self.assertIn("withdrawal", syn["opioid"])
        self.assertNotIn("alcohol", syn.get("cows", []))
        self.assertNotIn("sud", syn.get("cows", []))

    def test_required_abbreviations_survive_the_merge(self):
        """Mirrors check_search_quality.py's REQUIRED_SYNONYMS."""
        syn = common.build_synonyms()
        for abbrev, expected in {
            "ss": {"serotonin", "syndrome"},
            "td": {"tardive", "dyskinesia"},
            "ama": {"against", "medical", "advice", "discharge"},
            "dts": {"delirium", "tremens"},
            "wke": {"wernicke", "encephalopathy"},
            "aws": {"alcohol", "withdrawal"},
            "eps": {"extrapyramidal", "symptoms"},
        }.items():
            self.assertTrue(
                expected.issubset(set(syn.get(abbrev, []))),
                "%s should expand to %s" % (abbrev, expected),
            )

    def test_union_preserves_both_sites_groups(self):
        """Every group either build previously carried is still represented."""
        merged = {frozenset(g) for g in common.SYNONYM_GROUPS}
        for g in common._GROUPS_MS3 + common._GROUPS_RES_ONLY:
            self.assertIn(frozenset(g), merged)

    def test_resident_originated_concepts_reach_both_sites(self):
        syn = common.build_synonyms()
        self.assertIn("neuromodulation", syn["ect"])
        self.assertIn("involuntary", syn["commitment"])
        self.assertIn("resistant", syn["trs"])


class TestToolKeywords(unittest.TestCase):
    def test_merge_is_a_token_union_not_a_replacement(self):
        merged = common._merge_keywords({"a.html": "one two"}, {"a.html": "two three"})
        self.assertEqual(merged["a.html"].split(), ["one", "two", "three"])

    def test_secondary_only_keys_are_added(self):
        merged = common._merge_keywords({"a.html": "x"}, {"b.html": "y"})
        self.assertEqual(merged["b.html"], "y")

    def test_no_keyword_lost_from_either_former_table(self):
        for table in (common._TOOLKW_MS3, common._TOOLKW_RES):
            for key, value in table.items():
                have = set(common.TOOL_KEYWORDS[key].split())
                self.assertTrue(
                    set(value.split()).issubset(have),
                    "%s lost keywords in the merge" % key,
                )

    def test_resident_only_tools_are_present(self):
        for f in ("rp-agitation.html", "rp-brief-psych.html", "rp-canon-quiz.html"):
            self.assertIn(f, common.TOOL_KEYWORDS)


class _SiteFixture(unittest.TestCase):
    """Builds a throwaway site tree so the HTML passes can be exercised."""

    TOOL = (
        "<!doctype html><html><head><title>T</title>"
        "<style>body{background:#fff}</style></head>"
        '<body><div id="root"></div></body></html>'
    )

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.dir, "tools"))
        os.makedirs(os.path.join(self.dir, "content"))
        self.tool = os.path.join(self.dir, "tools", "t.html")
        with open(self.tool, "w", encoding="utf-8") as fh:
            fh.write(self.TOOL)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def read(self):
        return open(self.tool, encoding="utf-8").read()


class TestPagePasses(_SiteFixture):
    def test_chrome_adds_skip_link_root_and_favicon(self):
        common.apply_page_chrome(self.tool)
        t = self.read()
        self.assertIn('class="skip-link"', t)
        self.assertIn("<main id=\"root\">", t)
        self.assertIn('rel="icon"', t)

    def test_chrome_gives_an_unlabelled_main_an_id(self):
        with open(self.tool, "w", encoding="utf-8") as fh:
            fh.write("<html><head></head><body><main>hi</main></body></html>")
        common.apply_page_chrome(self.tool)
        self.assertIn('<main id="root"', self.read())

    def test_chrome_does_not_duplicate_an_existing_favicon(self):
        with open(self.tool, "w", encoding="utf-8") as fh:
            fh.write(
                '<html><head><link rel="icon" href="/favicon.svg"></head>'
                '<body><main id="root"></main></body></html>'
            )
        common.apply_page_chrome(self.tool)
        self.assertEqual(self.read().count('rel="icon"'), 1)

    def test_dark_mode_adds_init_tokens_motion_and_iframe_shim(self):
        common.apply_dark_mode(self.tool)
        t = self.read()
        self.assertIn("cw_theme", t)
        self.assertIn("clinical-warm.css", t)
        self.assertIn("cc-rise", t)
        self.assertIn("<!--ifn-->", t)

    def test_dark_mode_rewrites_hardcoded_white(self):
        common.apply_dark_mode(self.tool)
        self.assertIn("background:var(--surface)", self.read())

    def test_index_does_not_get_the_iframe_shim(self):
        common.apply_dark_mode(self.tool, is_index=True)
        self.assertNotIn("<!--ifn-->", self.read())

    def test_passes_are_idempotent(self):
        common.apply_page_chrome(self.tool)
        common.apply_dark_mode(self.tool)
        once = self.read()
        common.apply_page_chrome(self.tool)
        common.apply_dark_mode(self.tool)
        self.assertEqual(once, self.read())
        self.assertEqual(once.count('class="skip-link"'), 1)
        self.assertEqual(once.count("<!--ifn-->"), 1)

    def test_cache_bust_applied_only_when_requested(self):
        with open(self.tool, "w", encoding="utf-8") as fh:
            fh.write('<html><head></head><body><script>fetch("quizzes.json")</script></body></html>')
        common.apply_dark_mode(self.tool, cache_bust="123")
        self.assertIn('quizzes.json?v=123', self.read())


class TestContentPasses(_SiteFixture):
    def test_strip_review_banners(self):
        p = os.path.join(self.dir, "content", "a.md")
        open(p, "w", encoding="utf-8").write(
            "# Title\n> **Review status:** pending\n\nBody text\n"
        )
        common.strip_review_banners(self.dir)
        t = open(p, encoding="utf-8").read()
        self.assertNotIn("Review status", t)
        self.assertIn("Body text", t)

    def test_contrast_fix(self):
        p = os.path.join(self.dir, "content", "a.md")
        open(p, "w", encoding="utf-8").write("color:#87786a")
        common.apply_contrast_fix([p])
        self.assertIn("#665a4f", open(p, encoding="utf-8").read())


class TestPageContract(_SiteFixture):
    """The gate that makes a silently-skipped transform a build failure."""

    def test_untreated_page_fails_the_contract(self):
        failures = common.page_contract_failures(self.dir)
        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0][0], os.path.join("tools", "t.html"))
        self.assertTrue(len(failures[0][1]) >= 4)

    def test_fully_treated_page_passes(self):
        common.apply_full_page_pass(self.dir)
        self.assertEqual(common.page_contract_failures(self.dir), [])

    def test_catches_the_rp_bypass_regression(self):
        """A page given only the old skip-link-only subset must still fail.

        This is the exact prior state of rp-agitation / rp-brief-psych /
        rp-canon-quiz: skip-link present, everything else missing.
        """
        with open(self.tool, "w", encoding="utf-8") as fh:
            fh.write(
                '<html><head><link rel="icon" href="/favicon.svg">'
                '<style>[data-theme="dark"]{--bg:#000}</style>'
                "<script>localStorage.getItem('cw_theme')</script></head>"
                '<body><a class="skip-link" href="#root">Skip</a>'
                '<main id="root"></main></body></html>'
            )
        failures = common.page_contract_failures(self.dir)
        self.assertEqual(len(failures), 1)
        self.assertIn("in-iframe link interceptor", failures[0][1])

    def test_assert_raises_systemexit_on_failure(self):
        with self.assertRaises(SystemExit):
            common.assert_page_contract(self.dir)


class TestSearchIndex(_SiteFixture):
    def test_indexes_markdown_and_tools_and_skips_hidden(self):
        open(os.path.join(self.dir, "content", "a.md"), "w", encoding="utf-8").write(
            "# Catatonia\nLorazepam challenge.\n"
        )
        nav = [
            {
                "section": "Sec",
                "items": [
                    {"t": "A", "f": "a.md", "k": "md"},
                    {"t": "T", "f": "t.html", "k": "tool"},
                    {"t": "H", "f": "hidden.md", "k": "md", "hidden": True},
                ],
            }
        ]
        idx = common.build_search_index(nav, self.dir, tool_keywords={"t.html": "widget"})
        self.assertEqual(idx["n"], 2)
        self.assertEqual([d["f"] for d in idx["docs"]], ["a.md", "t.html"])
        self.assertIn("lorazepam", idx["postings"])
        self.assertIn("widget", idx["postings"])

    def test_title_outweighs_body(self):
        open(os.path.join(self.dir, "content", "a.md"), "w", encoding="utf-8").write("delirium\n")
        nav = [{"section": "S", "items": [{"t": "Delirium", "f": "a.md", "k": "md"}]}]
        idx = common.build_search_index(nav, self.dir)
        # title weight 4 + body weight 1
        self.assertEqual(idx["postings"]["delirium"][0][1], 5)

    def test_writes_the_index_file(self):
        nav = [{"section": "S", "items": []}]
        common.build_search_index(nav, self.dir)
        self.assertTrue(os.path.exists(os.path.join(self.dir, "search-index.json")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
