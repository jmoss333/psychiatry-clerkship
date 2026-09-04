#!/usr/bin/env python3
"""Contract for bin/sweep_unlicensed_claims.py's two attribution rules.

The sweep is a heuristic: it flags an assertion whose attribution it cannot
see. Every loosening of what counts as "seen" trades precision for recall, so
the loosenings are pinned here. A future edit that widens ATTRIBUTION until the
detector clears a genuinely unsourced number should fail this file.

Both rules under test came from the same finding: correctly sourced pages were
being flagged, which is the failure mode that gets a detector ignored.
"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "sweep", ROOT / "bin" / "sweep_unlicensed_claims.py"
)
sweep = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sweep)


def attributed(text):
    return bool(sweep.ATTRIBUTION.search(text))


class AttributionFormTests(unittest.TestCase):
    """`Author et al., *Journal* Year` is the library's dominant prose citation."""

    def test_italicised_journal_between_author_and_year_is_attribution(self):
        self.assertTrue(attributed("Siafis et al., *Lancet Psychiatry* 2026"))
        self.assertTrue(attributed("Bot et al., *Acta Psychiatr Scand* 2026"))
        self.assertTrue(attributed("Bensken et al., *JGIM* 2021"))

    def test_underscore_italics_are_the_same_form(self):
        self.assertTrue(attributed("Tinland et al., _JAMA Psychiatry_ 2022"))

    def test_the_older_forms_still_hold(self):
        # Regression: the journal group is optional and must not displace these.
        for form in (
            "Diefenbach 2024",
            "Doupnik et al. (2020)",
            "Rodolico et al., 2022",
            "Stanley and Brown (2018)",
            "Washington v. Harper (1990)",
            "doi:10.1111/acps.70102",
            "PMID 38408360",
            "[^wesseloo-2016-postpartum-relapse]",
            "[27 ✓, 28 ✓]",
            "the CATIE trial",
        ):
            with self.subTest(form=form):
                self.assertTrue(attributed(form))

    def test_known_weakness_case_insensitivity_is_recorded_not_endorsed(self):
        """ATTRIBUTION carries re.I, so the author-year and named-trial branches
        both match lowercase text. That earns its keep on acronym citations --
        "SAHM 2022", "VA/DoD 2024" -- and leaks on ordinary prose: "multisite
        study" and "only one study" read as named trials.

        Measured 2026-09-04: 13 flagged lines corpus-wide are cleared ONLY by
        the case-insensitive match, several of them spuriously. Tightening it
        ADDS findings, so it belongs in its own change with its own review --
        it is not smuggled in here. These assertions pin today's behaviour so
        that fixing it fails loudly and deliberately rather than silently.
        """
        self.assertTrue(attributed("SAHM 2022"), "acronym-year must keep working")
        self.assertTrue(attributed("the VA/DoD 2024 guideline"))
        # Known false positives - flip these to assertFalse when the branch is tightened.
        self.assertTrue(attributed("only one study tested whether"))
        self.assertTrue(attributed("a multisite study of 1,200 admissions"))


class TableIntroTests(unittest.TestCase):
    """A table row inherits the attribution of the prose introducing its table."""

    INTRO = "A network meta-analysis (Siafis et al., *Lancet Psychiatry* 2026) compared:"
    TABLE = [
        "| Agent | Effect |",
        "| --- | --- |",
        "| Combination | OR 12.93 |",
        "| Benzodiazepine | OR 5.52 |",
        "| Other | OR 4.54 |",
        "| Haloperidol | Reference |",
    ]

    def test_span_reaches_past_the_table_to_the_intro(self):
        lines = ["# Heading", "", self.INTRO, ""] + self.TABLE
        row = len(lines) - 2
        span = sweep.table_intro_span(lines, row)
        self.assertIsNotNone(span)
        self.assertIn(self.INTRO, lines[span[0]:span[1]])

    def test_row_beyond_the_window_is_cleared_only_by_its_intro(self):
        lines = ["# Heading", "", self.INTRO, ""] + self.TABLE
        row = len(lines) - 2
        self.assertGreater(row - 2, sweep.WINDOW, "fixture must exceed WINDOW")
        context = lines[max(0, row - sweep.WINDOW):row + sweep.WINDOW + 1]
        self.assertFalse(
            any(attributed(l) for l in context), "the window alone must miss it"
        )
        span = sweep.table_intro_span(lines, row)
        self.assertTrue(any(attributed(l) for l in lines[span[0]:span[1]]))

    def test_an_unattributed_intro_clears_nothing(self):
        # Modelled on the neurodevelopmental exam-anchor table: a real table,
        # correctly introduced, citing nothing. It must stay flagged.
        intro = "**Child and adolescent exam anchors** - common discriminators:"
        lines = ["# Heading", "", intro, ""] + self.TABLE
        row = len(lines) - 2
        span = sweep.table_intro_span(lines, row)
        self.assertIsNotNone(span)
        self.assertFalse(any(attributed(l) for l in lines[span[0]:span[1]]))

    def test_a_non_table_line_gets_no_span(self):
        lines = ["# Heading", "", self.INTRO, "", "Ordinary prose with OR 12.93."]
        self.assertIsNone(sweep.table_intro_span(lines, 4))

    def test_the_previous_tables_intro_does_not_reach_this_table(self):
        # Two tables, only the first attributed. Walking up must stop at the
        # prose directly above THIS table, not run on into the earlier one.
        lines = (
            ["# Heading", "", self.INTRO, ""]
            + self.TABLE
            + ["", "Unsourced follow-up table:", ""]
            + self.TABLE
        )
        row = len(lines) - 2
        span = sweep.table_intro_span(lines, row)
        self.assertEqual(["Unsourced follow-up table:"], lines[span[0]:span[1]])
        self.assertFalse(any(attributed(l) for l in lines[span[0]:span[1]]))

    def test_a_table_with_no_prose_above_it_gets_no_span(self):
        lines = list(self.TABLE)
        self.assertIsNone(sweep.table_intro_span(lines, len(lines) - 1))


class StillFlagsTests(unittest.TestCase):
    """The detector must keep catching what it exists to catch."""

    def test_an_unsourced_statistic_is_still_an_assertion(self):
        line = "Environmental safety produced a 67% reduction in inpatient suicide."
        self.assertTrue(sweep.STAT.search(line))
        self.assertFalse(attributed(line))


if __name__ == "__main__":
    unittest.main()
