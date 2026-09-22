"""Unit tests for bin/verify_citations.py — the search-and-judge citation gate.

`--self-test` already proves every tier can fire and stays silent on its good case.
These cover what a self-test cannot, and what this particular gate can most easily get
wrong:

  * the real file and JSON boundaries, including the shapes PRs #640/#672 actually used
    (a gate that reads only numbered Vancouver references would not have seen ONE of the
    85 citations that caused the incident — docs/SILENT_SHRINK_CHECKLIST.md);
  * the red/green pair on a reconstructed #672 fabrication, including §F's step people
    skip: reverting the fix and proving the fix is what made the difference;
  * that `unavailable` never reads as clean and never collapses into `ambiguous`;
  * that the committed cache and adjudication files are the shape the tool expects.

Fixtures only. Nothing here touches the network.
"""

import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "verify_citations", ROOT / "bin" / "verify_citations.py"
)
VC = importlib.util.module_from_spec(_spec)
sys.modules["verify_citations"] = VC
_spec.loader.exec_module(VC)

# PubMed 2597811, as NCBI holds it. PR #672 cited this paper to the American Journal of
# Psychiatry; it is the British Journal of Addiction.
CIWA_RECORD = {
    "title": "Assessment of alcohol withdrawal: the revised clinical institute "
             "withdrawal assessment for alcohol scale (CIWA-Ar)",
    "container": "Br J Addict",
    "containerFull": "British journal of addiction",
    "year": 1989,
    "authors": ["Sullivan", "Sykora", "Schneiderman", "Naranjo", "Sellers"],
}

# The #672 line, verbatim in shape, reconstructed as a FIXTURE. It is deliberately not
# in any registry, page or cache that ships: the citation it names is a fabrication.
FABRICATED_BULLET = (
    "- Sullivan, J.T. et al. (1989) — *American Journal of Psychiatry* — "
    "development and validation of the CIWA-Ar (Clinical Institute Withdrawal "
    "Assessment for Alcohol Scale, revised). The CIWA-Ar remains the gold-standard, "
    "bedside-administered tool for scoring alcohol withdrawal severity."
)
CORRECTED_BULLET = FABRICATED_BULLET.replace(
    "American Journal of Psychiatry", "British Journal of Addiction")


def _corpus(tmp: Path, body: str, entries: dict, adjudications=None):
    """A minimal in-scope curriculum tree plus its cache and adjudication files."""
    page = tmp / "03_Core_Topics" / "SUD_Withdrawal" / "teaching.md"
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text("# Teaching\n\n## References\n\n" + body + "\n", encoding="utf-8")
    cache = tmp / "cache.json"
    VC.write_cache(entries, cache)
    adj = tmp / "adjudications.json"
    adj.write_text(json.dumps({"adjudications": adjudications or []}), encoding="utf-8")
    return cache, adj


def _run(tmp: Path, cache: Path, adj: Path, **kw):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code, summary = VC.gate(tmp, cache, adj, out=print, **kw)
    return code, summary, buf.getvalue()


class SelfTestPasses(unittest.TestCase):
    def test_self_test_returns_zero(self):
        """If --self-test ever fails, every other assertion here is suspect."""
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = VC.self_test()
        self.assertEqual(rc, 0, buf.getvalue())
        self.assertIn("self-test:", buf.getvalue())


class RedGreenOn672(unittest.TestCase):
    """The gate fires on a reconstructed #672 fabrication and goes quiet when corrected.

    docs/SILENT_SHRINK_CHECKLIST.md §F: prove a guard by breaking it, and include the
    step people skip — revert the fix and show the fix is what made the difference.
    """

    def _entry(self):
        return {"status": "resolved", "resolver": VC.RESOLVER_VERSION,
                "mode": "search-author", "pmid": "2597811",
                "record": CIWA_RECORD, "authorWindow": 14, "authorExamined": 14,
                "authorContainers": [["Br J Addict", "British journal of addiction", 1989]] * 14,
                "resolvedAt": "2026-09-21"}

    def test_red_the_fabrication_fails(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            key = VC.citation_key(FABRICATED_BULLET)
            cache, adj = _corpus(tmp, FABRICATED_BULLET, {key: self._entry()})
            code, summary, text = _run(tmp, cache, adj)
            self.assertEqual(code, 1, text)
            self.assertEqual(summary["counts"]["mismatch"], 1, text)
            self.assertIn("American Journal of Psychiatry", text)

    def test_green_the_corrected_citation_passes(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            key = VC.citation_key(CORRECTED_BULLET)
            cache, adj = _corpus(tmp, CORRECTED_BULLET, {key: self._entry()})
            code, summary, text = _run(tmp, cache, adj)
            self.assertEqual(code, 0, text)
            self.assertEqual(summary["counts"]["matched"], 1, text)
            self.assertEqual(summary["counts"]["mismatch"], 0, text)

    def test_the_journal_is_what_made_the_difference(self):
        """Revert only the journal and the verdict flips back. Same cache evidence, same
        author, same year: the contradiction is the journal and nothing else."""
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            key = VC.citation_key(FABRICATED_BULLET)
            # as if PubMed did hold a Sullivan 1989 paper in that journal
            entry = {**self._entry(), "authorContainers":
                     [["Am J Psychiatry", "The American journal of psychiatry", 1989]] * 14}
            cache, adj = _corpus(tmp, FABRICATED_BULLET, {key: entry})
            code, summary, _ = _run(tmp, cache, adj)
            self.assertEqual(summary["counts"]["matched"], 1)
            self.assertEqual(code, 0)

    def test_the_anchored_shape_of_the_same_defect_also_fails(self):
        """The fabrication shape the ruling names: a real, resolvable identifier paired
        with a claim the record contradicts. Pasting a DOI in must not launder it."""
        line = ("7. Sullivan JT, Sykora K, Schneiderman J. Assessment of alcohol "
                "withdrawal: the revised clinical institute withdrawal assessment for "
                "alcohol scale. American Journal of Psychiatry. 1989;84(11):1353-7. "
                "doi:10.1111/j.1360-0443.1989.tb00737.x")
            # ^ a genuine DOI, on a journal the record does not carry
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            entry = {"status": "resolved", "resolver": VC.RESOLVER_VERSION,
                     "mode": "anchored-doi", "pmid": "2597811",
                     "record": CIWA_RECORD, "resolvedAt": "2026-09-21"}
            cache, adj = _corpus(tmp, line, {VC.citation_key(line): entry})
            code, summary, text = _run(tmp, cache, adj)
            self.assertEqual(code, 1, text)
            self.assertEqual(summary["counts"]["mismatch"], 1)
            self.assertIn("Br J Addict", text)

    def test_editing_the_citation_invalidates_its_cached_verdict(self):
        """The cache is keyed by the citation's own text, so a rewrite cannot inherit an
        old `matched`. It becomes uncached, which is exit 2, not a pass."""
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            stale_key = VC.citation_key(CORRECTED_BULLET)
            cache, adj = _corpus(tmp, FABRICATED_BULLET, {stale_key: self._entry()})
            code, summary, text = _run(tmp, cache, adj)
            self.assertEqual(code, 2, text)
            self.assertEqual(summary["counts"]["unavailable"], 1)
            self.assertEqual(summary["examined"], 0)


class UncachedNeverReadsAsClean(unittest.TestCase):
    """bin/verify_spans.py once printed "0 clean, 0 flagged, 49 uncached" and exited 0."""

    GOOD = ("1. Sullivan JT, Sykora K, Schneiderman J. Assessment of alcohol withdrawal: "
            "the revised clinical institute withdrawal assessment for alcohol scale. "
            "Br J Addict. 1989;84(11):1353-7. doi:10.1111/j.1360-0443.1989.tb00737.x")

    def test_empty_cache_is_exit_two_and_says_so(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cache, adj = _corpus(tmp, self.GOOD, {})
            code, summary, text = _run(tmp, cache, adj)
            self.assertEqual(code, 2)
            self.assertIn("COULD NOT CHECK", text)
            self.assertNotIn("OK —", text)
            self.assertEqual(summary["notExamined"], 1)
            self.assertEqual(summary["examined"], 0)

    def test_a_failed_search_is_unavailable_not_ambiguous(self):
        for error in ("egress proxy denied the CONNECT tunnel to eutils.ncbi.nlm.nih.gov",
                      "HTTP 429 from eutils.ncbi.nlm.nih.gov",
                      "transport failure for eutils.ncbi.nlm.nih.gov: timed out"):
            with self.subTest(error=error):
                with tempfile.TemporaryDirectory() as td:
                    tmp = Path(td)
                    cache, adj = _corpus(tmp, self.GOOD, {
                        VC.citation_key(self.GOOD): {"status": "unavailable", "resolver": VC.RESOLVER_VERSION,
                                                     "error": error}})
                    code, summary, _ = _run(tmp, cache, adj)
                    self.assertEqual(code, 2)
                    self.assertEqual(summary["counts"]["unavailable"], 1)
                    self.assertEqual(summary["counts"]["ambiguous"], 0)
                    self.assertEqual(summary["openAmbiguous"], 0)

    def test_a_mismatch_still_exits_one_even_with_something_unexamined(self):
        """Could-not-check must not mask a real finding."""
        bad = self.GOOD.replace("Br J Addict", "American Journal of Psychiatry")
        body = bad + "\n2. Someone A, Other B. Another paper entirely. Lancet. " \
                     "2020;395(10223):1-9. doi:10.1016/S0140-6736(20)30000-0"
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cache, adj = _corpus(tmp, body, {VC.citation_key(bad): {
                "status": "resolved", "resolver": VC.RESOLVER_VERSION, "mode": "anchored-doi", "pmid": "2597811",
                "record": CIWA_RECORD}})
            code, summary, _ = _run(tmp, cache, adj)
            self.assertEqual(code, 1)
            self.assertEqual(summary["counts"]["mismatch"], 1)
            self.assertEqual(summary["counts"]["unavailable"], 1)

    def test_an_empty_corpus_cannot_pass(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            (tmp / "03_Core_Topics").mkdir(parents=True)
            cache, adj = _corpus(tmp, self.GOOD, {})
            (tmp / "03_Core_Topics" / "SUD_Withdrawal" / "teaching.md").unlink()
            with self.assertRaises(VC.CheckError):
                with contextlib.redirect_stdout(io.StringIO()):
                    VC.gate(tmp, cache, adj, out=print)

    def test_main_returns_two_rather_than_raising(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cache, adj = _corpus(tmp, self.GOOD, {})
            cache.write_text("{ not json", encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()), \
                 contextlib.redirect_stderr(io.StringIO()):
                rc = VC.main(["--root", str(tmp), "--cache", str(cache),
                              "--adjudications", str(adj)])
            self.assertEqual(rc, 2)


class ExtractionCoversTheShapesThatCausedTheIncident(unittest.TestCase):
    def test_the_672_bullet_shape_is_in_scope(self):
        cites, _ = VC.extract_from_text(
            "## Further Reading & Evidence-Based Resources\n\n" + FABRICATED_BULLET + "\n",
            "03_Core_Topics/SUD_Withdrawal/teaching.md")
        self.assertEqual(len(cites), 1)
        self.assertEqual(cites[0].first_surname, "Sullivan")
        self.assertEqual(cites[0].year, 1989)
        self.assertEqual(cites[0].container, "American Journal of Psychiatry")
        self.assertIsNone(cites[0].title)

    def test_the_640_bullet_shape_is_in_scope(self):
        line = ("- Chung et al. (2017). *JAMA Psychiatry*. Overall post-discharge suicide "
                "rate is about 484 per 100,000 person-years, with 30-day readmission "
                "risk around 12-15 percent.")
        cites, _ = VC.extract_from_text("## Further Reading\n\n" + line + "\n", "x.md")
        self.assertEqual(len(cites), 1)
        self.assertEqual(cites[0].container, "JAMA Psychiatry")

    def test_the_titleless_vancouver_bullet_with_a_doi_is_in_scope(self):
        """evidence_inpatient.md carries 132 real citations in this shape."""
        line = ("- Runeson B, Odeberg J, Pettersson A, et al. PloS One. "
                "2017;12(7):e0180292. doi:10.1371/journal.pone.0180292.")
        cites, _ = VC.extract_from_text("### Sources\n\n" + line + "\n", "x.md")
        self.assertEqual(len(cites), 1)
        self.assertEqual(cites[0].container, "PloS One")
        self.assertEqual(cites[0].doi, "10.1371/journal.pone.0180292")
        self.assertIsNone(cites[0].title)

    def test_emphasis_marked_vancouver_parses_into_the_right_fields(self):
        line = ("1. Boyer EW, Shannon M. **The serotonin syndrome.** *N Engl J Med.* "
                "2005;352(11):1112-20. [DOI](https://doi.org/10.1056/NEJMra041867) "
                "· PMID 15784664")
        cites, _ = VC.extract_from_text("## References\n\n" + line + "\n", "x.md")
        self.assertEqual(len(cites), 1)
        self.assertEqual(cites[0].title, "The serotonin syndrome")
        self.assertEqual(cites[0].container, "N Engl J Med")
        self.assertEqual(cites[0].year, 2005)
        self.assertEqual(cites[0].pmid, "15784664")

    def test_teaching_prose_does_not_enter_the_corpus(self):
        """A gate whose ambiguous queue fills with teaching bullets is a gate nobody
        reads, which is the #642 decay pattern."""
        cites, _ = VC.extract_from_text(
            "## References\n"
            "- **Evidence:** Kane et al. (1988): 30% response to clozapine versus 4% for "
            "chlorpromazine in treatment-resistant schizophrenia, a landmark result.\n"
            "- The Joint Commission. Joint Commission (2018). A line long enough to clear "
            "the sixty character floor without being a journal citation.\n"
            "3. **Initial workup - hunt for the precipitant.** Reasonable first pass: "
            "fingerstick glucose, CBC, BMP and electrolytes, urinalysis and culture.\n",
            "x.md")
        self.assertEqual(cites, [])

    def test_an_unparsed_reference_line_is_counted_not_dropped(self):
        _cites, unparsed = VC.extract_from_text(
            "## References\n"
            "- Kaplan & Sadock's Synopsis of Psychiatry, sections on substance-related "
            "disorders, withdrawal syndromes and medication-assisted treatment.\n", "x.md")
        self.assertEqual(len(unparsed), 1)


class BooksAndGreyLiteratureAreNeverMismatches(unittest.TestCase):
    """A gate that flags real citations is worse than no gate. Every one of these is a
    real source PR #640/#672 put in a journal slot; the audit called them UNCHECKED."""

    CASES = [
        "- van der Kolk, B. (2014) — *The Body Keeps the Score: Brain, Mind, and "
        "Body in the Healing of Trauma* (ISBN 9780143127741). How trauma reshapes the "
        "nervous system.",
        "- Miller, W.R., Rollnick, S. (2013) — *Motivational Interviewing: Helping "
        "People Change* (3rd Ed.) — core teaching that meets ambivalence with "
        "curiosity rather than confrontation.",
        "- SAMHSA (2014) — *TIP 41: Substance Abuse Treatment: Group Therapy* "
        "— trauma exposure is common in substance use disorder populations and "
        "requires parallel treatment.",
        "- Linehan, M.M. (1993) — *Cognitive-Behavioral Treatment of Borderline "
        "Personality Disorder*. Validation, limits and commitment to change apply far "
        "beyond borderline personality disorder.",
        "- American Psychiatric Association (2013) — *Diagnostic and Statistical "
        "Manual of Mental Disorders* — the reference standard for psychiatric "
        "diagnosis and the source of the criteria taught here.",
    ]

    def test_none_of_them_is_a_mismatch(self):
        entry = {"status": "resolved", "resolver": VC.RESOLVER_VERSION,
                 "mode": "search-author", "pmid": None,
                 "record": None, "authorWindow": 40, "authorExamined": 40,
                 "authorContainers": []}
        for line in self.CASES:
            with self.subTest(line=line[:48]):
                cites, _ = VC.extract_from_text("## Further Reading\n\n" + line + "\n", "x.md")
                self.assertEqual(len(cites), 1, "fixture must parse to be a real test")
                verdict = VC.judge(cites[0], entry)
                self.assertEqual(verdict["verdict"], "ambiguous", verdict["reason"])


class AmbiguousPolicySwitch(unittest.TestCase):
    LINE = ("- Kennedy, G.J. (2014) — capacity assessment in older adults: "
            "depression and cognitive impairment often undermine appreciation and "
            "reasoning, so a medical workup comes first.")
    ENTRY = {"status": "resolved", "resolver": VC.RESOLVER_VERSION,
             "mode": "search-author", "pmid": None, "record": None,
             "authorWindow": 9, "authorExamined": 9, "authorContainers": [],
             "resolvedAt": "2026-09-21"}

    def test_the_ruled_default_is_report(self):
        self.assertEqual(VC.AMBIGUOUS_POLICY, "report")

    def test_report_passes_but_files_the_finding(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cache, adj = _corpus(tmp, self.LINE, {VC.citation_key(self.LINE): self.ENTRY})
            code, summary, text = _run(tmp, cache, adj, policy="report")
            self.assertEqual(code, 0)
            self.assertEqual(summary["openAmbiguous"], 1)
            queue = VC.findings(summary)
            self.assertEqual(len(queue), 1)
            self.assertIn("Kennedy", queue[0]["quote"])
            self.assertIn("citation_adjudications.json", queue[0]["toAccept"])
            self.assertIn("ambiguous", text)

    def test_block_fails_the_same_citation(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cache, adj = _corpus(tmp, self.LINE, {VC.citation_key(self.LINE): self.ENTRY})
            code, _summary, _ = _run(tmp, cache, adj, policy="block")
            self.assertEqual(code, 1)

    def test_block_new_only_without_a_base_cannot_silently_pass(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cache, adj = _corpus(tmp, self.LINE, {VC.citation_key(self.LINE): self.ENTRY})
            with self.assertRaises(VC.CheckError):
                with contextlib.redirect_stdout(io.StringIO()):
                    VC.gate(tmp, cache, adj, policy="block-new-only", out=print)

    def test_an_adjudication_closes_it_and_only_for_that_exact_text(self):
        key = VC.citation_key(self.LINE)
        row = [{"citationKey": key, "reason": "grey literature; accepted as cited",
                "by": "Joshua Moss, MD", "at": "2026-09-21"}]
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cache, adj = _corpus(tmp, self.LINE, {key: self.ENTRY}, adjudications=row)
            code, summary, _ = _run(tmp, cache, adj, policy="block")
            self.assertEqual(code, 0)
            self.assertEqual(summary["adjudicatedAmbiguous"], 1)
            self.assertEqual(summary["openAmbiguous"], 0)

            edited = self.LINE.replace("2014", "2015")
            cache2, adj2 = _corpus(tmp, edited, {VC.citation_key(edited): self.ENTRY},
                                   adjudications=row)
            code, summary, _ = _run(tmp, cache2, adj2, policy="block")
            self.assertEqual(code, 1, "an adjudication must not survive an edit")

    def test_an_adjudication_cannot_suppress_a_mismatch(self):
        key = VC.citation_key(FABRICATED_BULLET)
        row = [{"citationKey": key, "reason": "not a valid use of this list",
                "by": "someone", "at": "2026-09-21"}]
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cache, adj = _corpus(tmp, FABRICATED_BULLET, {key: {
                "status": "resolved", "resolver": VC.RESOLVER_VERSION, "mode": "search-author", "pmid": "2597811",
                "record": CIWA_RECORD, "authorWindow": 14, "authorExamined": 14,
                "authorContainers": [["Br J Addict", "British journal of addiction", 1989]] * 14}},
                adjudications=row)
            code, summary, _ = _run(tmp, cache, adj)
            self.assertEqual(code, 1)
            self.assertEqual(summary["counts"]["mismatch"], 1)


class CommittedFilesAreTheShapeTheToolExpects(unittest.TestCase):
    def test_the_cache_loads_and_every_entry_declares_a_status(self):
        entries = VC.load_cache()
        self.assertGreater(len(entries), 0, "a committed cache with no entries would "
                                            "make every citation read as unexamined")
        for key, entry in entries.items():
            self.assertIn(entry.get("status"), ("resolved", "unavailable"), key)
            if entry["status"] == "resolved":
                self.assertIn(entry.get("mode"),
                              ("anchored-pmid", "anchored-doi", "search-title",
                               "search-author"), key)

    def test_the_adjudication_file_loads(self):
        self.assertIsInstance(VC.load_adjudications(), dict)

    def test_every_adjudication_names_a_person_a_date_and_a_reason(self):
        for key, row in VC.load_adjudications().items():
            self.assertTrue(str(row.get("by") or "").strip(), key)
            self.assertTrue(str(row.get("at") or "").strip(), key)
            self.assertTrue(str(row.get("reason") or "").strip(), key)

    def test_no_machine_paths_in_the_source(self):
        source = (ROOT / "bin" / "verify_citations.py").read_text(encoding="utf-8")
        self.assertNotIn("/Users/", source)
        self.assertNotIn("/sessions/", source)

    def test_the_gate_is_not_wired_into_ci_or_verify(self):
        """Adding it is its own PR: a CI step trips three to five pin contracts."""
        for path in ("bin/verify.sh", ".github/workflows/ci.yml"):
            self.assertNotIn("verify_citations.py",
                             (ROOT / path).read_text(encoding="utf-8"), path)


if __name__ == "__main__":
    unittest.main()
