"""Offline tests for the evidence watcher (surveillance job `evidence-watch`, F10).

No test here touches the network: every API response is a committed synthetic
fixture under fixtures/evidence_watch/, fed through the collector's injectable
`fetch`. The headline regression is the clozapine REMS elimination (2025): the
label change must file as P0 the week it appears.
"""
import datetime
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest import mock

import yaml


ROOT = Path(__file__).resolve().parents[2]
SURV = ROOT / "13_Faculty_Resources" / "_automation" / "surveillance"
BIN = SURV / "bin"
FIXTURES = Path(__file__).with_name("fixtures") / "evidence_watch"
WORKFLOW = ROOT / ".github" / "workflows" / "surveillance-evidence-watch.yml"
sys.path.insert(0, str(BIN))

import lib_surveillance as L  # noqa: E402
import run_evidence_watch as W  # noqa: E402
import sync_findings  # noqa: E402

NOW = "2025-10-27T08:00:00+00:00"
TODAY = datetime.date(2025, 10, 27)
CLOZAPINE_SET_ID = "90876802-0e3a-44c9-9ff7-1754dfbe736a"


def fixture(name):
    with open(FIXTURES / name, encoding="utf-8") as fh:
        return json.load(fh)


def config():
    return W.load_config()


class FakeFetch:
    """Route URLs to canned responses by predicate; record every URL asked for."""

    def __init__(self, routes):
        self.routes = routes
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        for predicate, response in self.routes:
            if predicate(url):
                if isinstance(response, Exception):
                    raise response
                return response() if callable(response) else response
        raise W.NoMatches(url)


def drug_item(rid="clozapine", terms=("clozapine",), set_id=CLOZAPINE_SET_ID):
    return {"id": rid, "kind": "drug", "label": rid, "terms": list(terms),
            "query": W._pubmed_term_query(list(terms)), "publication_types": None,
            "set_id": set_id, "label_version_date": "2025-06-06", "affects": ["pharmacy.json"]}


def topic_item(tid="topic-clozapine-rems", terms=("clozapine",)):
    return {"id": tid, "kind": "topic", "label": tid, "terms": list(terms),
            "query": "clozapine[tiab]", "publication_types": "any", "set_id": None,
            "label_version_date": None, "affects": []}


PAGES = {
    "03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md": "clozapine and anc monitoring",
    "04_Acute_and_Safety/agitation.md": "lorazepam or haloperidol for agitation",
    "05_Psychopharmacology/clozapine_notes.md": "Clozapine titration".lower(),
    "06_Other/unrelated.md": "nothing relevant; clozapinesque is not a word boundary hit",
}


def only(cfg, pubmed=False, label=False, recalls=False):
    cfg = json.loads(json.dumps(cfg))
    cfg["pubmed"]["enabled"] = pubmed
    cfg["openfda"]["enabled"] = label or recalls
    cfg["openfda"]["enforcement"]["enabled"] = recalls
    return cfg


def schema_errors(finding):
    """Minimal validator for config/finding.schema.json (stdlib; no jsonschema dependency)."""
    schema = json.loads((SURV / "config" / "finding.schema.json").read_text(encoding="utf-8"))
    props = schema["properties"]
    errors = [f"missing {k}" for k in schema["required"] if k not in finding]
    for key, value in finding.items():
        if key not in props:
            errors.append(f"unknown property {key}")
            continue
        spec = props[key]
        if "enum" in spec and value not in spec["enum"]:
            errors.append(f"{key}={value!r} not in enum")
        if spec.get("type") == "string" and not isinstance(value, str):
            errors.append(f"{key} not a string")
        if spec.get("type") == "array" and not isinstance(value, list):
            errors.append(f"{key} not an array")
        if key == "evidence":
            for ek in value:
                if ek not in spec["properties"]:
                    errors.append(f"unknown evidence property {ek}")
    return errors


class TempDirCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="evidence-watch-")
        self.addCleanup(tmp.cleanup)
        self.tmp = tmp.name
        self.baselines = os.path.join(self.tmp, "baselines")


class ConfigAndItemsTests(unittest.TestCase):
    def test_committed_config_validates_and_carries_the_plan_defaults(self):
        cfg = config()
        fda = cfg["openfda"]
        # D-F10-1 recommended default: boxed warning / contraindication / REMS = P0.
        self.assertEqual(fda["label_sections"]["boxed_warning"], "P0")
        self.assertEqual(fda["label_sections"]["contraindications"], "P0")
        self.assertEqual(fda["rems_language"], "P0")
        # D-F10-2: an allowlist exists and P2 caps everything else.
        self.assertIn("Lancet Psychiatry", cfg["pubmed"]["p1_review_journals"])
        self.assertTrue(cfg["pubmed"]["cap_at_assigned_severity"])

    def test_config_has_no_key_or_secret_field(self):
        text = (SURV / "config" / "evidence_watch.yaml").read_text(encoding="utf-8")
        body = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
        self.assertIsNone(re.search(r"api_key|apikey|token|secret|password", body, re.I))

    def test_bad_severity_is_rejected(self):
        cfg = config()
        cfg["openfda"]["label_sections"]["boxed_warning"] = "P9"
        with self.assertRaises(ValueError):
            W.validate_config(cfg)

    def test_items_derive_from_every_pharmacy_record_plus_topics(self):
        cfg = config()
        records = W.load_pharmacy()
        items = W.derive_items(cfg, records)
        drugs = [i for i in items if i["kind"] == "drug"]
        topics = [i for i in items if i["kind"] == "topic"]
        self.assertEqual(len(drugs), len(records))
        self.assertEqual(len(topics), len(cfg["topics"]))
        self.assertEqual(len({i["id"] for i in items}), len(items))
        self.assertTrue(all(d["set_id"] for d in drugs), "every drug item pins a label set id")
        self.assertTrue(all("pharmacy.json" in d["affects"] for d in drugs))
        valproate = next(d for d in drugs if d["id"] == "valproate")
        self.assertIn("valproate", valproate["terms"])

    def test_default_terms_strip_parentheticals(self):
        self.assertEqual(W.default_terms("divalproex sodium (valproate)"), ["divalproex sodium"])
        self.assertEqual(W.default_terms("clozapine"), ["clozapine"])

    def test_pubmed_query_appends_publication_types_unless_any(self):
        cfg = config()
        q = W.pubmed_query(drug_item(), cfg)
        self.assertTrue(q.startswith("((clozapine[tiab])) AND ("))
        self.assertIn("meta-analysis[pt]", q)
        self.assertEqual(W.pubmed_query(topic_item(), cfg), "clozapine[tiab]")


class AffectsMappingTests(unittest.TestCase):
    def test_word_boundary_match_explicit_first_and_cap(self):
        paths, total = W.map_affects(drug_item(), PAGES, cap=30)
        self.assertEqual(paths[0], "pharmacy.json")
        self.assertIn("03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md", paths)
        self.assertNotIn("06_Other/unrelated.md", paths)
        self.assertEqual(total, 3)
        capped, total = W.map_affects(drug_item(), PAGES, cap=1)
        self.assertEqual((capped, total), (["pharmacy.json"], 3))

    def test_mapping_reads_the_shipped_page_universe(self):
        texts = W.load_page_texts()
        self.assertTrue(texts)
        self.assertTrue(all(p.endswith((".md", ".html")) for p in texts))


class PubMedTests(TempDirCase):
    def fetch(self, esummary=None):
        data = fixture("pubmed_responses.json")
        return FakeFetch([
            (lambda u: "esearch" in u and "topic" not in u and "AND+%28guideline" in u,
             data["esearch_a"]),
            (lambda u: "esearch" in u, data["esearch_b"]),
            (lambda u: "esummary" in u, esummary if esummary is not None else data["esummary"]),
        ])

    def run_pubmed(self, fetch):
        cfg = only(config(), pubmed=True)
        items = [drug_item(), topic_item()]
        return W.run(cfg, items, fetch, PAGES, baseline_dir=self.baselines, now=NOW, today=TODAY)

    def test_one_finding_per_pmid_with_allowlist_severity(self):
        fetch = self.fetch()
        findings, checked, receipt = self.run_pubmed(fetch)
        by_url = {f["source_url"]: f for f in findings}
        self.assertEqual(len(findings), 2, "PMID shared by two items files once")
        guideline = by_url["https://pubmed.ncbi.nlm.nih.gov/39990001/"]
        review = by_url["https://pubmed.ncbi.nlm.nih.gov/39990002/"]
        self.assertEqual(guideline["severity"], "P1")
        self.assertEqual(review["severity"], "P2")
        self.assertEqual(review["severity_cap"], "P2")
        self.assertEqual(guideline["modality"], "signal_only")
        self.assertNotIn("evidence", guideline, "no abstract text is ever carried")
        self.assertEqual(checked, [W.CHANNEL_PUBMED])
        self.assertEqual(receipt["channels"][W.CHANNEL_PUBMED]["examined"], 2)
        for f in findings:
            self.assertEqual(schema_errors(f), [])
        # Polite, keyless: tool param present, no api_key, no email.
        self.assertTrue(all("tool=psychiatry-clerkship-evidence-watch" in u for u in fetch.urls))
        self.assertFalse(any("api_key" in u or "email=" in u for u in fetch.urls))
        self.assertTrue(all("reldate=8" in u and "datetype=edat" in u
                            for u in fetch.urls if "esearch" in u))

    def test_baseline_makes_the_next_run_silent_and_fingerprints_stable(self):
        first, _, _ = self.run_pubmed(self.fetch())
        second, _, receipt = self.run_pubmed(self.fetch())
        self.assertEqual(second, [])
        self.assertEqual(receipt["channels"][W.CHANNEL_PUBMED]["items"]["clozapine"]["new"], 0)
        self.assertTrue(all(f["fingerprint"].startswith("pubmed::new::") for f in first))
        # A fresh baseline dir reproduces the same fingerprints (idempotent issues).
        self.baselines = os.path.join(self.tmp, "again")
        again, _, _ = self.run_pubmed(self.fetch())
        self.assertEqual(sorted(f["fingerprint"] for f in first),
                         sorted(f["fingerprint"] for f in again))

    def test_esummary_failure_is_environment_and_retried_next_week(self):
        fetch = self.fetch()
        fetch.routes[2] = (lambda u: "esummary" in u, W.Unavailable("HTTP 503"))
        findings, checked, _ = self.run_pubmed(fetch)
        self.assertEqual([f["disposition"] for f in findings], ["environment"])
        self.assertEqual(checked, [])
        recovered, _, _ = self.run_pubmed(self.fetch())
        self.assertEqual(len(recovered), 2, "unsummarised PMIDs were not marked seen")

    def test_classify_paper_allowlist(self):
        cfg = config()
        self.assertEqual(W.classify_paper({"pubtype": ["Practice Guideline"], "source": "X",
                                           "title": "Guideline from NICE"}, cfg)[0], "P1")
        self.assertEqual(W.classify_paper({"pubtype": ["Meta-Analysis"],
                                           "source": "JAMA Psychiatry", "title": "t"}, cfg)[0], "P1")
        self.assertEqual(W.classify_paper({"pubtype": ["Meta-Analysis"],
                                           "source": "Psychiatry Res", "title": "t"}, cfg)[0], "P2")
        self.assertEqual(W.classify_paper({"pubtype": ["Randomized Controlled Trial"],
                                           "source": "Lancet Psychiatry", "title": "t"}, cfg)[0], "P2")


class LabelTests(TempDirCase):
    def run_labels(self, response):
        cfg = only(config(), label=True)
        fetch = FakeFetch([(lambda u: "label.json" in u, response)])
        result = W.run(cfg, [drug_item()], fetch, PAGES, baseline_dir=self.baselines,
                       now=NOW, today=TODAY)
        return result + (fetch,)

    def test_clozapine_rems_end_2025_is_caught_as_p0(self):
        """Regression: the clozapine REMS ended 2025-06-13. Replayed from a synthetic openFDA
        fixture, the label change must surface the week it appears, as P0."""
        before = fixture("openfda_label_clozapine_before_rems_end.json")
        after = fixture("openfda_label_clozapine_after_rems_end.json")
        established, checked, receipt, fetch = self.run_labels(before)
        self.assertEqual(established, [], "first look establishes a baseline, reports nothing")
        self.assertEqual(receipt["channels"][W.CHANNEL_LABEL]["items"]["clozapine"]["status"],
                         "baseline-established")
        self.assertIn(W.CHANNEL_LABEL, checked)
        self.assertIn(f'set_id:"{CLOZAPINE_SET_ID}"',
                      urllib.parse.unquote(fetch.urls[0]))

        findings, _, receipt, _ = self.run_labels(after)
        self.assertEqual(len(findings), 1)
        f = findings[0]
        self.assertEqual(f["severity"], "P0")
        self.assertEqual(f["change_type"], "modified")
        self.assertEqual(f["disposition"], "actionable")
        self.assertEqual(f["source_id"], "openfda:clozapine")
        self.assertIn("REMS language removed from boxed warning", f["summary"])
        self.assertIn("20250115 -> 20250827", f["summary"])
        self.assertIn("-Because of the risk of severe neutropenia", f["evidence"]["diff_excerpt"])
        self.assertIn("pharmacy.json", f["affects"])
        self.assertEqual(schema_errors(f), [])
        self.assertEqual(receipt["channels"][W.CHANNEL_LABEL]["items"]["clozapine"]["status"],
                         "changed:P0")
        # Routing keeps it an issue, never the digest.
        issues, digest, unfiled = sync_findings.partition_by_disposition([dict(f)])
        self.assertEqual((len(issues), len(digest), len(unfiled)), (1, 0, 0))
        self.assertIn("[P0][openfda:clozapine]", L.issue_title(f))
        # Re-running against the new label is silent (the issue already carries it).
        quiet, _, _, _ = self.run_labels(after)
        self.assertEqual(quiet, [])

    def test_warnings_only_change_without_rems_is_p1_and_revision_only_is_p2(self):
        before = fixture("openfda_label_clozapine_after_rems_end.json")
        self.run_labels(before)
        warn = json.loads(json.dumps(before))
        warn["results"][0]["warnings_and_cautions"] = ["Seizures: use caution. New syncope text."]
        warn["results"][0]["effective_time"] = "20251001"
        findings, _, _, _ = self.run_labels(warn)
        self.assertEqual([f["severity"] for f in findings], ["P1"])
        revised = json.loads(json.dumps(warn))
        revised["results"][0]["version"] = "99"
        revised["results"][0]["effective_time"] = "20251020"
        findings, _, _, _ = self.run_labels(revised)
        self.assertEqual([f["severity"] for f in findings], ["P2"])
        self.assertIn("no watched section changed", findings[0]["summary"])

    def test_pinned_set_id_missing_routes_to_a_person(self):
        findings, checked, _, _ = self.run_labels(W.NoMatches("gone"))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["change_type"], "identifier-unresolved")
        self.assertEqual(findings[0]["disposition"], "needs-judgment")
        self.assertIn(W.CHANNEL_LABEL, checked)

    def test_unreachable_api_is_environment_never_silent(self):
        findings, checked, receipt, _ = self.run_labels(W.Unavailable("URLError reaching api.fda.gov"))
        self.assertEqual(len(findings), 1)
        env = findings[0]
        self.assertEqual(env["disposition"], "environment")
        self.assertEqual(env["change_type"], "check-unavailable")
        self.assertEqual(env["source_id"], W.CHANNEL_LABEL)
        self.assertNotIn(W.CHANNEL_LABEL, checked)
        self.assertEqual(receipt["channels"][W.CHANNEL_LABEL]["failed"], 1)
        self.assertEqual(schema_errors(env), [])
        issues, digest, unfiled = sync_findings.partition_by_disposition([env])
        self.assertEqual((issues, digest, len(unfiled)), ([], [], 1))
        self.assertFalse(os.path.exists(
            os.path.join(self.baselines, "openfda-label", "clozapine.json")),
            "a failed read never overwrites a baseline")


class RecallTests(TempDirCase):
    def test_class_i_is_p1_other_p2_and_seen_recalls_do_not_repeat(self):
        cfg = only(config(), recalls=True)
        items = [drug_item("lorazepam", ("lorazepam",), set_id=None),
                 drug_item("haloperidol", ("haloperidol",), set_id=None)]
        response = fixture("openfda_enforcement_lorazepam.json")
        fetch = FakeFetch([(lambda u: "enforcement.json" in u and "lorazepam" in u, response)])
        findings, checked, receipt = W.run(cfg, items, fetch, PAGES,
                                           baseline_dir=self.baselines, now=NOW, today=TODAY)
        self.assertEqual(sorted(f["severity"] for f in findings), ["P1", "P2"])
        self.assertEqual(receipt["channels"][W.CHANNEL_RECALL]["examined"], 2,
                         "a 404 NOT_FOUND is a successful zero, not a failure")
        self.assertEqual(checked, [W.CHANNEL_RECALL])
        self.assertTrue(any("report_date:[20251019%20TO%2020251027]" in u for u in fetch.urls))
        for f in findings:
            self.assertEqual(schema_errors(f), [])
        again, _, _ = W.run(cfg, items, fetch, PAGES, baseline_dir=self.baselines,
                            now=NOW, today=TODAY)
        self.assertEqual(again, [])


class HttpFetcherTests(unittest.TestCase):
    def http_error(self, code, body):
        return urllib.error.HTTPError("https://api.fda.gov/x", code, "x", {}, io.BytesIO(body))

    def test_openfda_not_found_is_no_matches_other_errors_unavailable(self):
        fetcher = W.HttpFetcher(sleep=lambda s: None)
        with mock.patch("urllib.request.urlopen",
                        side_effect=self.http_error(404, b'{"error":{"code":"NOT_FOUND"}}')):
            with self.assertRaises(W.NoMatches):
                fetcher("https://api.fda.gov/drug/label.json?search=x")
        with mock.patch("urllib.request.urlopen", side_effect=self.http_error(429, b"{}")):
            with self.assertRaises(W.Unavailable):
                fetcher("https://api.fda.gov/drug/label.json?search=x")
        with mock.patch("urllib.request.urlopen",
                        side_effect=urllib.error.URLError("blocked")):
            with self.assertRaises(W.Unavailable):
                fetcher("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi")

    def test_requests_to_one_host_are_spaced(self):
        slept, clock = [], iter([0.0, 0.1, 0.5])
        fetcher = W.HttpFetcher({"eutils.ncbi.nlm.nih.gov": 0.4},
                                sleep=slept.append, clock=lambda: next(clock))
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"{}"
        with mock.patch("urllib.request.urlopen", return_value=response):
            fetcher("https://eutils.ncbi.nlm.nih.gov/a")
            fetcher("https://eutils.ncbi.nlm.nih.gov/b")
        self.assertEqual(len(slept), 1)
        self.assertAlmostEqual(slept[0], 0.3)


class WiringTests(TempDirCase):
    def test_baseline_default_is_the_production_path_and_the_workflow_takes_it(self):
        self.assertEqual(W.build_parser().get_default("baseline_dir"),
                         os.path.join(L.BASELINES, "evidence-watch"))
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn("--baseline-dir", text)
        self.assertIn("--job evidence-watch", text)

    def test_workflow_uses_github_token_only(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertEqual(set(re.findall(r"secrets\.([A-Za-z0-9_]+)", text)), {"GITHUB_TOKEN"})
        model = yaml.load(text, Loader=yaml.BaseLoader)
        self.assertEqual(model["on"]["schedule"], [{"cron": "0 8 * * 1"}])
        self.assertEqual(model["on"]["repository_dispatch"]["types"], ["surveillance-evidence"])

    def test_job_is_known_to_schema_sync_and_reports(self):
        schema = json.loads((SURV / "config" / "finding.schema.json").read_text(encoding="utf-8"))
        self.assertIn("evidence-watch", schema["properties"]["job"]["enum"])
        self.assertIn("evidence-watch", sync_findings.MANAGED_JOB_LABELS)
        self.assertIn("evidence-watch", sync_findings.build_parser()._option_string_actions[
            "--job"].choices)
        self.assertEqual(L._STEM["evidence-watch"], "evidence_watch")

    def test_sync_dry_run_files_the_rems_finding_as_a_p0_issue(self):
        before = fixture("openfda_label_clozapine_before_rems_end.json")
        after = fixture("openfda_label_clozapine_after_rems_end.json")
        cfg = only(config(), label=True)
        for response in (before, after):
            findings, checked, _ = W.run(cfg, [drug_item()],
                                         FakeFetch([(lambda u: True, response)]), PAGES,
                                         baseline_dir=self.baselines, now=NOW, today=TODAY)
        paths = {}
        for name, value in (("findings", findings), ("checked", checked), ("existing", [])):
            paths[name] = os.path.join(self.tmp, f"{name}.json")
            with open(paths[name], "w", encoding="utf-8") as fh:
                json.dump(value, fh)
        out_dir = os.path.join(self.tmp, "history")
        result = subprocess.run(
            [sys.executable, str(BIN / "sync_findings.py"), "--findings", paths["findings"],
             "--job", "evidence-watch", "--checked-sources", paths["checked"],
             "--issues-out", os.path.join(self.tmp, "issues.json"), "--dry-run",
             "--existing-fixture", paths["existing"], "--out-dir", out_dir],
            capture_output=True, text=True, check=True, cwd=str(ROOT))
        self.assertIn("[dry-run] CREATE  [P0][openfda:clozapine]", result.stdout)
        reports = sorted(os.listdir(out_dir))
        self.assertTrue(any(r.startswith("evidence_watch_") and r.endswith(".json") for r in reports))
        with open(os.path.join(out_dir, "last_run.json"), encoding="utf-8") as fh:
            self.assertEqual(list(json.load(fh)), [W.CHANNEL_LABEL])


if __name__ == "__main__":
    unittest.main()
