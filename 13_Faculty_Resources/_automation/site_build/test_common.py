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

import json
import os
import re
import shutil
import subprocess
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

    def test_a_body_only_toggle_no_longer_suppresses_the_injection(self):
        """Close the class instead of merely catching it.

        The page contract now demands a head boot, so a page carrying only a <body> toggle would
        fail the BUILD -- correct, but a poor answer for a shape that is otherwise reasonable: a
        tool owning its own light/dark button. Asking the same honest question here means such a
        page is simply given a boot, and the defect stops being reachable rather than becoming a
        red build. Measured before changing it: 0 pages in the tree are affected today, so this
        is a net for the next one, not a rewrite of the current output.
        """
        with open(self.tool, "w", encoding="utf-8") as fh:
            fh.write(
                "<html><head></head><body><div id=\"root\"></div>"
                "<script>document.documentElement.setAttribute('data-theme',"
                "localStorage.getItem('cw_theme'));</script></body></html>"
            )
        common.apply_dark_mode(self.tool)
        self.assertIsNotNone(
            common.head_theme_boot(self.read()),
            "a page whose only theme code is a body toggle must still be given a pre-paint boot",
        )

    def test_a_page_with_its_own_head_boot_is_not_given_a_second(self):
        """The other half: the guard must still skip a page that already boots properly.

        Without this, 'inject when there is no head boot' is untested in the direction that
        matters for the 17 pages that carry their own -- two boots in one <head> is not a
        cosmetic issue, it is two copies free to disagree.
        """
        with open(self.tool, "w", encoding="utf-8") as fh:
            fh.write("<html><head>" + common.THEME_INIT + "</head><body></body></html>")
        common.apply_dark_mode(self.tool)
        self.assertEqual(self.read().count("getItem('cw_theme')"), 1)

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


# The pre-paint theme boot is the one piece of theme logic that cannot be imported: it has to run
# in <head> before anything else loads, because its whole job is painting the right attribute
# before first paint. So it exists as more than one copy by necessity -- THEME_INIT here, and the
# inline <script> at the top of spa_index.html -- and two copies that nothing compares are exactly
# how these drifted: the shell learned 'system' on 2026-09-10 and THEME_INIT did not, which left a
# learner on a dark-preferring phone reading a dark shell and light tool pages. These tests pin the
# behaviour, and pin every copy in the tree to the shell's bytes so none can fall behind again.

# .../13_Faculty_Resources/_automation/site_build/test_common.py -> the repository root.
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

_SKIP_DIRS = {".git", ".claude", "_build", "node_modules", "__pycache__", ".venv"}

# The predicate lives in common.py, where the build's own page contract uses it. One definition,
# so the gate and these tests cannot drift apart -- the split-brain this whole area exists to
# prevent. Aliased under the old private names for the call sites below.
_READS_THEME_KEY = common.READS_THEME_KEY
_strip_html_comments = common.strip_html_comments
_head_theme_boot = common.head_theme_boot


def _boot_census(root):
    """Every pre-paint theme boot in the tree, as sorted (label, script body) pairs.

    THEME_INIT is a copy like any other; it is listed explicitly only because it lives in a .py
    file as a string constant, where a walk over <head> cannot see it.
    """
    boots = [("common.py:THEME_INIT", _inline_script(common.THEME_INIT))]
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for name in filenames:
            if not name.endswith(".html"):
                continue
            full = os.path.join(dirpath, name)
            with open(full, encoding="utf-8", errors="ignore") as fh:
                boot = _head_theme_boot(fh.read())
            if boot is not None:
                boots.append((os.path.relpath(full, root), boot))
    return sorted(boots)


# A FLOOR on the census, not a pin: 19 today -- THEME_INIT, spa_index.html, the 13 pages that
# carried a boot of their own until 2026-09-10, and the 4 shipped pages that carried NONE until
# 2026-09-11, whose own <body> theme code was suppressing the injection meant to give them one.
# Adding a page with a boot raises the real count and needs no edit here; only a DROP is a
# signal. Raise this when the real count rises, though: a floor left behind is a ratchet that
# stopped ratcheting, and the four pages could go back to unpainted with this still green. Its whole job is that a parity assertion over
# an empty census is green, so without it a walk that silently stops finding files would report
# success over nothing -- docs/SILENT_SHRINK_CHECKLIST.md, which is the reason this line exists.
MIN_THEME_BOOTS = 19

# Drives a boot script the way a browser would: fake storage, a fake documentElement that records
# what got painted, and a window whose matchMedia answers the scenario. Mirrors the harness in
# tests/theme-boot.test.mjs so the two copies are measured identically.
_BOOT_DRIVER = """
const boot = process.argv[1];
const out = {};
for (const sc of JSON.parse(process.argv[2])) {
  let painted = null;
  const localStorage = { getItem: (k) => {
    if (sc.storageThrows) throw new Error('site data blocked');
    return k === 'cw_theme' ? sc.stored : null;
  } };
  const document = { documentElement: { setAttribute: (_, v) => { painted = v; } } };
  const window = sc.matchMedia === false ? {}
    : { matchMedia: (q) => ({ matches: /dark/.test(q) && sc.prefersDark }) };
  new Function('localStorage', 'document', 'window', boot)(localStorage, document, window);
  out[sc.name] = painted;
}
process.stdout.write(JSON.stringify(out));
"""

# matchMedia exists unless a scenario opts out, and storage answers unless a scenario makes it
# throw. The last three cases are the ones about an ABSENT capability rather than a stored value:
# a browser with no matchMedia, and a browser that throws on any localStorage access at all
# (Chrome with site data blocked). The OS must still be consulted in the latter -- resolving it
# inside the storage try meant a storage-blocked learner on a dark OS got no attribute, and
# clinical-warm.css scopes the dark palette to [data-theme="dark"], so no attribute is a white
# page they cannot opt out of.
_SCENARIOS = [
    {"name": "unset_on_a_dark_os", "stored": None, "prefersDark": True},
    {"name": "unset_on_a_light_os", "stored": None, "prefersDark": False},
    {"name": "stored_light_on_a_dark_os", "stored": "light", "prefersDark": True},
    {"name": "stored_dark_on_a_light_os", "stored": "dark", "prefersDark": False},
    {"name": "stored_system_on_a_dark_os", "stored": "system", "prefersDark": True},
    {"name": "stored_junk_on_a_dark_os", "stored": "banana", "prefersDark": True},
    {"name": "no_matchmedia_at_all", "stored": None, "prefersDark": True, "matchMedia": False},
    {"name": "storage_blocked_on_a_dark_os", "stored": None, "prefersDark": True,
     "storageThrows": True},
    {"name": "storage_blocked_on_a_light_os", "stored": None, "prefersDark": False,
     "storageThrows": True},
]

EXPECTED_PAINT = {
    "unset_on_a_dark_os": "dark",
    "unset_on_a_light_os": "light",
    "stored_light_on_a_dark_os": "light",
    "stored_dark_on_a_light_os": "dark",
    "stored_system_on_a_dark_os": "dark",
    "stored_junk_on_a_dark_os": "dark",
    "no_matchmedia_at_all": "light",
    "storage_blocked_on_a_dark_os": "dark",
    "storage_blocked_on_a_light_os": "light",
}


def _inline_script(markup):
    """The JS inside the first bare <script>...</script>, with the tags stripped."""
    m = re.search(r"<script>([\s\S]*?)</script>", markup)
    assert m, "no inline <script> found"
    return m.group(1)


def _shell_boot():
    """The shell's own pre-paint boot script, read from spa_index.html."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spa_index.html")
    with open(path, encoding="utf-8") as fh:
        return _inline_script(fh.read())


# The literal apply_dark_mode() uses to decide whether to inject THEME_INIT. It is a PROXY for
# "this page already boots the theme", and a click handler in <body> satisfies it exactly as well
# as a boot in <head> -- which is the whole defect the test below exists for. Kept as the literal
# because this test's subject IS that literal; deriving it would measure something else.
_SUPPRESSES_INJECTION = "cw_theme"


def _pages_suppressing_injection_without_a_boot(root):
    """Source pages that switch the THEME_INIT injection off and put nothing in its place.

    Each one ships with NO pre-paint theme at all. The build skips the injection because the page
    mentions cw_theme; the page's own mention is a toggle handler that runs long after first
    paint. A learner with a stored dark mode opens it and reads a light page.
    """
    offenders = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for name in filenames:
            if not name.endswith(".html"):
                continue
            full = os.path.join(dirpath, name)
            with open(full, encoding="utf-8", errors="ignore") as fh:
                markup = fh.read()
            if _SUPPRESSES_INJECTION not in markup:
                continue  # the build gives this one a boot; not this test's subject
            if _head_theme_boot(markup) is None:
                offenders.append(os.path.relpath(full, root))
    return sorted(offenders)


def _storage_reads_outside_the_boot(markup):
    """How many times this page reads cw_theme out of storage other than in its head boot."""
    stripped = _strip_html_comments(markup)
    boot = _head_theme_boot(markup) or ""
    return len(_READS_THEME_KEY.findall(stripped)) - len(_READS_THEME_KEY.findall(boot))


def _pages_re_deriving_the_theme(root):
    """Pages that read the stored mode again after the boot already resolved it.

    Storage holds the MODE (system/light/dark); data-theme holds the RESOLVED attribute
    (light/dark). A second read gets the mode where the reader almost always wants the
    resolution -- and a reader that then persists what it computed writes 'dark' over 'system',
    silently converting a learner's follow-the-OS setting into a pin they never chose.
    """
    offenders = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for name in filenames:
            if not name.endswith(".html"):
                continue
            full = os.path.join(dirpath, name)
            with open(full, encoding="utf-8", errors="ignore") as fh:
                markup = fh.read()
            if _storage_reads_outside_the_boot(markup) > 0:
                offenders.append(os.path.relpath(full, root))
    return sorted(offenders)


class TestThemeInit(unittest.TestCase):
    def _paint(self, boot_js):
        """What each scenario paints onto documentElement, by running the real script in node."""
        result = subprocess.run(
            ["node", "-e", _BOOT_DRIVER, boot_js, json.dumps(_SCENARIOS)],
            check=True, capture_output=True, text=True,
        )
        return json.loads(result.stdout)

    def test_theme_init_resolves_system_and_unset_through_the_media_query(self):
        self.assertEqual(self._paint(_inline_script(common.THEME_INIT)), EXPECTED_PAINT)

    def test_theme_init_is_byte_identical_to_the_shell_boot_script(self):
        self.assertEqual(
            _inline_script(common.THEME_INIT), _shell_boot(),
            "THEME_INIT and spa_index.html's boot script are one behaviour in two copies; "
            "change both or neither",
        )

    def test_the_shell_and_the_injection_agree_scenario_for_scenario(self):
        """Byte-equality above is the guard; this proves the bytes they share are the right ones."""
        self.assertEqual(self._paint(_shell_boot()), EXPECTED_PAINT)

    def test_every_pre_paint_theme_boot_in_the_tree_carries_the_shell_bytes(self):
        """One assertion for both directions of drift, because both are the same defect.

        FORWARD (the unguarded one, and why this replaced its predecessor): fifteen copies of
        this boot exist and only two of them -- THEME_INIT and spa_index.html -- were pinned to
        each other. Teach the shell a fourth mode and the other thirteen fall silently behind,
        which is precisely the split-brain retired on 2026-09-10, recurring with nothing red.

        BACKWARD: a page that adopts the retired two-state boot is caught by the same comparison,
        because the retired boot is not equal to the current one. It no longer matters how the
        reintroduced copy spells its variables -- the predecessor keyed on a literal and a rename
        defeated it.

        WHAT THIS DOES NOT SEE, stated so nobody mistakes green for coverage:
          * A theme read placed outside <head>. That is the exact shape
            question-bank-practice.html carried until 2026-09-10 -- a deferred read at the bottom
            of <body> -- and the literal needle this replaced did catch it. The scope is the
            price of not firing on the four tools that legitimately own their theme from <body>;
            a boot down there is not a pre-paint boot at all, and the build's page contract is
            what is supposed to require one.
          * A page with NO boot. Parity over a census cannot speak about a page that is not in
            it, and four shipped pages are in exactly that position today -- apply_dark_mode()
            skips THEME_INIT wherever 'cw_theme' already appears, which their own <body> theme
            code trips. Reported with this change; remediating them is not this test's job.
        """
        census = _boot_census(REPO_ROOT)
        self.assertGreaterEqual(
            len(census), MIN_THEME_BOOTS,
            "the theme-boot census shrank to %d (floor %d): the walk stopped finding boots it "
            "used to find, so the parity check below is now passing over a smaller set than it "
            "claims to check. Fix the walk, or lower the floor deliberately if pages really "
            "went away. Found: %s" % (
                len(census), MIN_THEME_BOOTS, [label for label, _ in census]),
        )
        shell = _shell_boot()
        drifted = [label for label, body in census if body != shell]
        self.assertEqual(
            drifted, [],
            "these theme boots are not byte-identical to spa_index.html's: %s. Every copy paints "
            "before first paint and they must agree -- a copy left behind is a learner reading a "
            "dark shell and a light page. Change them all or none." % drifted,
        )


    def test_a_document_with_no_head_boundary_is_not_credited_with_a_boot(self):
        """Fail closed when the document cannot say where its head ends.

        The predicate answers "is this script before the end of <head>?". A document with neither
        </head> nor <body> cannot answer, and the permissive reading -- scan the whole file --
        credits a toggle at the very bottom as a pre-paint boot. Harmless while this was only a
        census; as a build GATE it is a hole, and it is the same shape as every other defect in
        this area: a check reporting success over something it cannot actually see.

        74 of the tree's .html files have no </head> today (the tests/__panels__ fragments), so
        this is not a hypothetical parse.
        """
        headless = ("<html><body><script>document.documentElement.setAttribute("
                    "'data-theme',localStorage.getItem('cw_theme'));</script></body></html>")
        self.assertIsNone(common.head_theme_boot(headless))

    def test_an_implicitly_closed_head_still_yields_its_boot(self):
        """...and do not over-correct into the opposite defect.

        HTML5 lets a document omit </head> entirely; <body> closes it. Returning None whenever
        </head> is missing would drop a perfectly good boot on such a page. The boundary is the
        FIRST of </head> or <body>, not </head> alone.
        """
        implicit = ("<html><head><script>var s=localStorage.getItem('cw_theme');"
                    "document.documentElement.setAttribute('data-theme',s);</script>"
                    "<body><p>hi</p></html>")
        self.assertIsNotNone(common.head_theme_boot(implicit))

    def test_a_page_that_suppresses_the_injection_brings_its_own_head_boot(self):
        """The hole the census parity check cannot see, closed from the other side.

        Parity can only speak about boots that EXIST; a page with none is simply absent from the
        census. That is how four shipped pages sat with no pre-paint theme at all while every
        theme test was green -- the exact shape docs/SILENT_SHRINK_CHECKLIST.md is about, a check
        reporting success over a set smaller than the one it claims to cover.

        This asks the complementary question -- which pages switched the injection OFF -- and it
        is derived, not a list: a page added tomorrow that writes cw_theme from <body> and
        carries no boot in <head> reds here on the day it lands, with no edit to this file.
        """
        self.assertEqual(
            _pages_suppressing_injection_without_a_boot(REPO_ROOT), [],
            "these pages mention cw_theme, so apply_dark_mode() skips THEME_INIT for them, and "
            "they carry no boot in <head> of their own -- so they ship with NO pre-paint theme "
            "and render light for a learner whose stored mode is dark. Give each one the shell's "
            "boot script (spa_index.html line 4, byte for byte): %s"
            % _pages_suppressing_injection_without_a_boot(REPO_ROOT),
        )

    def test_only_the_boot_reads_the_stored_mode(self):
        """Storage holds the MODE; data-theme holds the RESOLUTION. Nothing re-derives.

        The boot turns the stored mode into an attribute before first paint, so a page that wants
        a THEME should read the attribute. A page that reads storage again is re-deriving, and it
        gets 'system' where it expects 'light' or 'dark'; the ones that persist what they computed
        write the resolved value back over the mode, turning follow-the-OS into a pin the learner
        never chose. Invisible in a two-mode world, which is why it arrives with the third mode.

        NOT every second read is this bug. Reading the stored mode BECAUSE you want the mode is
        correct and necessary -- the shell's settings panel does exactly that in fd_wire.js's
        currentTheme(), since the attribute cannot tell "system that resolved to dark" from
        "explicitly dark". This walks .html only and says nothing about the frontdoor modules;
        an inline re-derivation on a page is the shape it is here to catch.

        ALSO NOT SEEN: a page reading through an alias built elsewhere, and a page that writes
        without reading. The write side has no honest static check; the reads give it away.
        """
        self.assertEqual(
            _pages_re_deriving_the_theme(REPO_ROOT), [],
            "these pages read cw_theme out of storage again after the head boot already resolved "
            "it: %s. Seed from document.documentElement.getAttribute('data-theme') instead -- "
            "review.html is the worked example -- and persist only in response to a click."
            % _pages_re_deriving_the_theme(REPO_ROOT),
        )


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

    def test_a_body_only_theme_read_no_longer_satisfies_the_contract(self):
        """The four-page defect, stated as the contract's own question.

        A page whose only mention of cw_theme is a toggle handler in <body> ships with no
        pre-paint boot; under the old contract ("cw_theme appears anywhere") it passed, which is
        how interview-circle, review, feedback and decision-aids shipped unpainted.

        Deliberately NOT run through apply_full_page_pass: that pass now injects a boot into this
        exact shape (see test_a_body_only_toggle_no_longer_suppresses_the_injection), so routing
        the fixture through it would rescue the page and leave this asserting nothing. The
        contract is the last line for output the pass did not produce -- a hand-authored page, a
        future producer -- so it is tested on its own terms.
        """
        with open(self.tool, "w", encoding="utf-8") as fh:
            fh.write(
                '<html><head><link rel="icon" href="/favicon.svg">'
                '<style>[data-theme="dark"]{--bg:#000}</style></head>'
                '<body><a class="skip-link" href="#root">Skip</a><main id="root"></main>'
                "<!--ifn--><script>document.documentElement.setAttribute('data-theme',"
                "localStorage.getItem('cw_theme'));</script></body></html>"
            )
        built = self.read()
        # The old contract's question -- answer yes, which is precisely the bug.
        self.assertIn("cw_theme", built)
        # The honest question.
        self.assertIsNone(common.head_theme_boot(built))
        failures = common.page_contract_failures(self.dir)
        self.assertEqual(len(failures), 1)
        self.assertEqual(
            failures[0][1],
            ["pre-paint theme init (inline <script> in <head> reading cw_theme)"],
            "everything else on the fixture is present, so this must be the ONLY complaint -- an "
            "extra one means the fixture drifted and the assertion is no longer about the theme",
        )

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

    def test_indexes_a_hidden_item_that_is_reachable(self):
        """A Library-placed page must be searchable even when nav hides it.

        The regression this pins: `hidden` meant "not in the sidebar", the sidebar
        was replaced by the Library tab, and this function kept reading hidden as
        "do not index" — so 19 resident pages the Library displayed were absent
        from search entirely.
        """
        for name in ("a.md", "hidden.md", "excluded.md"):
            open(os.path.join(self.dir, "content", name), "w", encoding="utf-8").write(
                "# Sleep\nSleep-wake disorders.\n"
            )
        nav = [
            {
                "section": "Sec",
                "items": [
                    {"t": "A", "f": "a.md", "k": "md"},
                    {"t": "H", "f": "hidden.md", "k": "md", "hidden": True},
                    {"t": "X", "f": "excluded.md", "k": "md", "hidden": True},
                ],
            }
        ]
        idx = common.build_search_index(nav, self.dir, reachable_refs={"a.md", "hidden.md"})
        self.assertEqual([d["f"] for d in idx["docs"]], ["a.md", "hidden.md"])

    def test_hidden_and_unreachable_stays_out(self):
        """week1..week6.md and rotation-curator.html are hidden AND deliberately
        outside the Library (curriculum.json libraryExclude). Widening the rule to
        'index everything hidden' would ship those; the reachable set is the line."""
        open(os.path.join(self.dir, "content", "week1.md"), "w", encoding="utf-8").write("wk\n")
        nav = [{"section": "S", "items": [
            {"t": "W", "f": "week1.md", "k": "md", "hidden": True}]}]
        idx = common.build_search_index(nav, self.dir, reachable_refs={"a.md"})
        self.assertEqual(idx["docs"], [])

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


class TestCopyRequiredSources(unittest.TestCase):
    def test_copies_all_pairs(self):
        lib = tempfile.mkdtemp()
        dest = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(lib, "14_Tracks"))
            with open(os.path.join(lib, "14_Tracks", "a.md"), "w", encoding="utf-8") as fh:
                fh.write("# resident welcome")
            n = common.copy_required_sources([("14_Tracks/a.md", "welcome.md")], lib, dest)
            self.assertEqual(n, 1)
            with open(os.path.join(dest, "welcome.md"), encoding="utf-8") as fh:
                self.assertEqual(fh.read(), "# resident welcome")
        finally:
            shutil.rmtree(lib)
            shutil.rmtree(dest)

    def test_missing_source_aborts_with_exit_1(self):
        """Audit repro 2026-08-01: renaming resident_welcome.md produced a GREEN
        resident build that shipped MS3 welcome content under the resident nav
        title. A missing required source must abort the build."""
        lib = tempfile.mkdtemp()
        dest = tempfile.mkdtemp()
        try:
            with self.assertRaises(SystemExit) as ctx:
                common.copy_required_sources(
                    [("14_Tracks/RENAMED.md", "welcome.md"),
                     ("14_Tracks/also_gone.md", "rotation.md")],
                    lib, dest, label="resident content",
                )
            self.assertEqual(ctx.exception.code, 1)
        finally:
            shutil.rmtree(lib)
            shutil.rmtree(dest)


class TestApplyVerifiedReplacements(unittest.TestCase):
    def test_applies_substitutions_in_order(self):
        out = common.apply_verified_replacements(
            "MS3 Clerkship hub",
            [("MS3 Clerkship", "Resident Rotation"), ("hub", "library")],
        )
        self.assertEqual(out, "Resident Rotation library")

    def test_stale_needle_aborts(self):
        """A reworded spa_index header must FAIL the resident build, not
        silently revert resident branding to MS3 text (audit finding: six
        unverified ix.replace() calls)."""
        with self.assertRaises(SystemExit) as ctx:
            common.apply_verified_replacements(
                "the header was reworded",
                [("old header copy", "resident copy")],
                label="resident index rebrand",
            )
        self.assertEqual(ctx.exception.code, 1)


class TestReproducibility(unittest.TestCase):
    def test_quiz_cache_bust_stable_for_identical_content(self):
        d = tempfile.mkdtemp()
        try:
            qp = os.path.join(d, "quizzes.json")
            with open(qp, "w", encoding="utf-8") as fh:
                fh.write('{"decks":[]}')
            first = common.quiz_cache_bust(qp)
            second = common.quiz_cache_bust(qp)
            self.assertEqual(first, second)
            self.assertEqual(len(first), 12)
        finally:
            shutil.rmtree(d)

    def test_quiz_cache_bust_changes_when_content_changes(self):
        d = tempfile.mkdtemp()
        try:
            qp = os.path.join(d, "quizzes.json")
            with open(qp, "w", encoding="utf-8") as fh:
                fh.write('{"decks":[]}')
            first = common.quiz_cache_bust(qp)
            with open(qp, "w", encoding="utf-8") as fh:
                fh.write('{"decks":[{"t":"new"}]}')
            self.assertNotEqual(first, common.quiz_cache_bust(qp))
        finally:
            shutil.rmtree(d)

    def test_synonym_keys_sorted_for_reproducible_index(self):
        """The synonyms dict was populated by iterating Python sets, so JSON key
        order varied with hash randomization — one of the two sources that made
        identical builds byte-differ."""
        syn = common.build_synonyms()
        self.assertEqual(list(syn.keys()), sorted(syn.keys()))


class TestSharedSnippets(unittest.TestCase):
    MARKER = "/*__SM2_APPLY_GRADE__*/"

    def _page(self, body):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        p = os.path.join(d, "t.html")
        open(p, "w", encoding="utf-8").write(body)
        return p

    def test_marker_is_replaced_with_snippet_body(self):
        p = self._page("<script>var DAY=86400000;\n" + self.MARKER + "\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("function applyGrade(card, grade, opts)", t)
        self.assertNotIn(self.MARKER, t)

    def test_injection_is_idempotent(self):
        p = self._page("<script>var DAY=86400000;\n" + self.MARKER + "\n</script>")
        common.inject_shared_snippets(p)
        first = open(p, encoding="utf-8").read()
        self.assertFalse(common.inject_shared_snippets(p))
        self.assertEqual(open(p, encoding="utf-8").read(), first)

    def test_phi_snippet_expands_with_short_signature(self):
        p = self._page("<script>\n/*__PHI_HEURISTIC__*/\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("function looksLikePhi(t){", t)
        self.assertNotIn("/*__PHI_HEURISTIC__*/", t)

    def test_sw_register_snippet_expands_with_short_signature(self):
        p = self._page("<script>\n/*__SW_REGISTER__*/\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("function registerClerkshipSW(){", t)
        self.assertNotIn("/*__SW_REGISTER__*/", t)

    def test_calib_log_snippet_expands_with_short_signature(self):
        p = self._page("<script>\n/*__CALIB_LOG__*/\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("function calibLog(evt){", t)
        self.assertNotIn("/*__CALIB_LOG__*/", t)

    def test_phase_policy_snippet_expands_with_short_signature(self):
        p = self._page("<script>\n/*__PHASE_POLICY__*/\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("function shelfDaysUntil(shelfStr, nowMs){", t)
        self.assertNotIn("/*__PHASE_POLICY__*/", t)

    def test_sess_capsule_snippet_expands_with_short_signature(self):
        p = self._page("<script>\n/*__SESS_CAPSULE__*/\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("function sessLoad(tool, nowMs){", t)
        self.assertNotIn("/*__SESS_CAPSULE__*/", t)

    def test_fd_state_snippet_expands_with_short_signature(self):
        p = self._page("<script>\n/*__FD_STATE__*/\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("var FD_STORE='cw_frontdoor_v1';", t)
        self.assertNotIn("/*__FD_STATE__*/", t)

    def test_qr_generator_marker_expands_to_the_exact_local_curator_only_vendor(self):
        marker = "/*__QR_GENERATOR_1_4_4__*/"
        p = self._page("<script>\n%s\n</script>" % marker)
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("QR Code Generator for JavaScript", t)
        self.assertIn("var qrcode = function()", t)
        self.assertNotIn(marker, t)

    def test_every_frontdoor_snippet_expands(self):
        """All Front Door markers resolve through the frontdoor subdirectory."""
        markers = [
            ("/*__FD_DATA__*/", "function fdEsc("),
            ("/*__FD_EDITION_CATALOG__*/", "var FD_EDITION_CATALOG="),
            ("/*__FD_EDITION_V1_SALVAGE__*/", "var fdEditionV1ValidateForSalvage;"),
            ("/*__FD_TODAY__*/", "function fdTodayProgress("),
            ("/*__FD_DUE__*/", "function fdDueRow("),
            ("/*__FD_SHELL__*/", "function fdKeyAction("),
            ("/*__FD_PATH__*/", "function fdPath("),
            ("/*__FD_LIBRARY__*/", "function fdLibrary("),
            ("/*__FD_READER__*/", "function fdReaderNeighbours("),
            ("/*__FD_SEARCH__*/", "function fdExpandQuery("),
            ("/*__FD_SHEET__*/", "function fdSheet("),
        ]
        for marker, needle in markers:
            p = self._page("<script>\n%s\n</script>" % marker)
            self.assertTrue(common.inject_shared_snippets(p), marker)
            t = open(p, encoding="utf-8").read()
            self.assertIn(needle, t, marker)
            self.assertNotIn(marker, t, marker)

    def test_all_snippet_signatures_are_short_and_unique(self):
        # Whole-line signatures are exact-substring dup-probes (common.py _snippet_signature);
        # long ones silently degrade to no-ops when the file is rewrapped. Cap them.
        sigs = []
        for fname in common.SNIPPET_MARKERS.values():
            body = open(os.path.join(os.path.dirname(common.__file__), fname), encoding="utf-8").read()
            sig = common._snippet_signature(body)
            self.assertIsNotNone(sig, fname)
            self.assertLess(len(sig), 60, "%s signature too long: %r" % (fname, sig))
            sigs.append(sig)
        self.assertEqual(len(sigs), len(set(sigs)), "duplicate snippet signatures")

    def test_snippet_signature_skips_a_long_function_for_a_short_later_one(self):
        long_function = "function unwieldy(" + ("argument," * 12) + "){"
        short_function = "function stableProbe(){}"
        body = "%s\n%s\n" % (long_function, short_function)

        self.assertGreaterEqual(len(long_function), 60)
        self.assertEqual(common._snippet_signature(body), short_function)

    def test_unexpanded_marker_fails_the_page_contract(self):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        os.makedirs(os.path.join(d, "tools"))
        page = (
            '<a class="skip-link">s</a><div id="root"></div><script>cw_theme'
            + self.MARKER
            + '</script><style>[data-theme="dark"]{}</style>'
            + '<link rel="icon"><!--ifn-->'
        )
        open(os.path.join(d, "tools", "t.html"), "w", encoding="utf-8").write(page)
        failures = common.page_contract_failures(d)
        self.assertTrue(
            any("unexpanded shared-snippet marker" in m for _, ms in failures for m in ms)
        )

    def test_duplicated_marker_fails_the_page_contract(self):
        """A consumer that pastes the marker twice gets two live copies of
        applyGrade() silently defined — worse than the unexpanded-marker case,
        since nothing about it looks broken at a glance. Must hard-fail too.
        """
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        os.makedirs(os.path.join(d, "tools"))
        page = (
            '<a class="skip-link">s</a><div id="root"></div>'
            "<script>cw_theme;var DAY=86400000;\n"
            + self.MARKER + "\n" + self.MARKER
            + '\n</script><style>[data-theme="dark"]{}</style>'
            '<link rel="icon"><!--ifn-->'
        )
        p = os.path.join(d, "tools", "t.html")
        open(p, "w", encoding="utf-8").write(page)
        self.assertTrue(common.inject_shared_snippets(p))

        failures = common.page_contract_failures(d)
        self.assertTrue(
            any("injected more than once" in m for _, ms in failures for m in ms),
            failures,
        )


class TestServiceWorkerEmission(unittest.TestCase):
    def _site(self):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        os.makedirs(os.path.join(d, "tools"))
        os.makedirs(os.path.join(d, "audio"))
        open(os.path.join(d, "index.html"), "w").write("<!doctype html>x")
        open(os.path.join(d, "nav.json"), "w").write("[]")
        open(os.path.join(d, "tools", "t.html"), "w").write("<!doctype html>t")
        open(os.path.join(d, "audio", "a.m4a"), "w").write("fake-lfs-bytes")
        open(os.path.join(d, "tool-governance.json"), "w").write(
            '{"revision": "aaaaaaa"}'
        )
        return d

    def test_emits_precache_excluding_media_with_root_mapping(self):
        d = self._site()
        common.emit_service_worker(d)
        sw = open(os.path.join(d, "sw.js"), encoding="utf-8").read()
        pre = json.loads(sw.split("/*__PRECACHE_START__*/")[1].split("/*__PRECACHE_END__*/")[0])
        self.assertIn("/", pre)
        self.assertNotIn("/index.html", pre)
        self.assertIn("/nav.json", pre)
        self.assertIn("/tools/t.html", pre)
        self.assertTrue(all("/audio/" not in p for p in pre))
        self.assertNotIn("/sw.js", pre)

    def test_version_is_deterministic_and_media_independent(self):
        d = self._site()
        common.emit_service_worker(d)
        v1 = open(os.path.join(d, "sw.js")).read().split("VERSION='")[1].split("'")[0]
        open(os.path.join(d, "audio", "a.m4a"), "w").write("different-bytes")
        common.emit_service_worker(d)
        v2 = open(os.path.join(d, "sw.js")).read().split("VERSION='")[1].split("'")[0]
        self.assertEqual(v1, v2)
        open(os.path.join(d, "nav.json"), "w").write("[1]")
        common.emit_service_worker(d)
        v3 = open(os.path.join(d, "sw.js")).read().split("VERSION='")[1].split("'")[0]
        self.assertNotEqual(v1, v3)

    def test_budget_failure_and_kill_mode(self):
        d = self._site()
        open(os.path.join(d, "big.json"), "wb").write(b"0" * (11 * 1024 * 1024))
        with self.assertRaises(SystemExit):
            common.emit_service_worker(d)
        os.remove(os.path.join(d, "big.json"))
        common.emit_service_worker(d, kill=True)
        self.assertIn("var KILL=true;", open(os.path.join(d, "sw.js")).read())

    def test_tool_governance_excluded_and_version_stable_across_revision_changes(self):
        """tool-governance.json embeds current_revision() = git rev-parse HEAD, so
        every commit (docs-only included) would otherwise change its bytes and
        churn VERSION for every learner. It must be excluded from PRECACHE and
        from the VERSION hash — same treatment as sw.js/robots.txt/404.html. It
        is already served max-age=0,must-revalidate via _headers, so precaching
        it buys no offline value anyway."""
        d = self._site()
        common.emit_service_worker(d)
        sw1 = open(os.path.join(d, "sw.js"), encoding="utf-8").read()
        v1 = sw1.split("VERSION='")[1].split("'")[0]
        pre1 = json.loads(sw1.split("/*__PRECACHE_START__*/")[1].split("/*__PRECACHE_END__*/")[0])
        self.assertNotIn("/tool-governance.json", pre1)

        open(os.path.join(d, "tool-governance.json"), "w").write(
            '{"revision": "bbbbbbb"}'
        )
        common.emit_service_worker(d)
        sw2 = open(os.path.join(d, "sw.js"), encoding="utf-8").read()
        v2 = sw2.split("VERSION='")[1].split("'")[0]
        pre2 = json.loads(sw2.split("/*__PRECACHE_START__*/")[1].split("/*__PRECACHE_END__*/")[0])
        self.assertEqual(v1, v2)
        self.assertNotIn("/tool-governance.json", pre2)

    def test_template_anchor_repeated_fails_loudly(self):
        """A future template edit that repeats a substitution anchor (e.g. two
        `VERSION='__VERSION__';` lines) must fail loudly rather than silently
        substituting only the first occurrence and shipping a broken sw.js."""
        d = self._site()
        template_path = os.path.join(
            os.path.dirname(os.path.abspath(common.__file__)), common.SW_TEMPLATE_NAME
        )
        original = open(template_path, encoding="utf-8").read()
        self.addCleanup(lambda: open(template_path, "w", encoding="utf-8").write(original))
        open(template_path, "w", encoding="utf-8").write(
            original + "\nvar VERSION='__VERSION__';\n"
        )
        with self.assertRaises(AssertionError):
            common.emit_service_worker(d)


if __name__ == "__main__":
    unittest.main(verbosity=2)
