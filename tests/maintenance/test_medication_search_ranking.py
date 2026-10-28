"""Ranking reports must expose lost safety routes and gaps in comparison evidence."""
import base64
import copy
import hashlib
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "13_Faculty_Resources/_automation/maintenance"))
import medication_search_ranking as ranking

OLD = "a" * 40
NEW = "b" * 40
OLDER = "c" * 40
REPO = "jmoss333/psychiatry-clerkship"
TITLE = "production medication search verifies names, punctuation and safety priority on "


def bundle(sha=NEW):
    sites = [{"name": site, "status": "PASS", "commitRef": sha,
              "permalinkUrl": f"https://{'1' if site == 'ms3' else '2'}{'0' * 23}--{slug}.netlify.app"}
             for site, slug in [("ms3", "une-ms3-psychiatry"), ("res", "mmc-psychiatry-residents-sanford")]]
    receipt = {"repository": REPO, "releaseSha": sha, "verifierSha": NEW, "status": "PASS",
               "evidence": {"deployments": {"status": "PASS", "sites": sites},
                            "browserJourneys": {"status": "PASS"}}}
    specs = []
    for site in sites:
        for device, width in [("desktop", 1280), ("phone", 320)]:
            payload = {"project": "release-" + site["name"], "device": device,
                       "viewport": {"width": width, "height": 900 if device == "desktop" else 844},
                       "url": site["permalinkUrl"] + "/?tab=library", "releaseSha": sha,
                       "expectedQueries": 2, "completedQueries": 2, "runtimeErrors": [],
                       "observations": [
                           {"phase": "matrix", "expected": {"category": "safety priority", "query": "Ativan alcohol-withdrawal",
                             "first": {"ref": "t_sud.md", "kind": "protocol"}},
                            "rows": [{"ref": "t_sud.md", "kind": "protocol"}, {"ref": "psychopharm_primer.md", "kind": "item"}], "passed": True},
                           {"phase": "matrix", "expected": {"category": "name audit", "query": "Effexor", "topThree": "psychopharm_primer.md"},
                            "rows": [{"ref": "psychopharm_primer.md", "kind": "item"}, {"ref": "med_monitoring.md", "kind": "item"}], "passed": True},
                       ]}
            specs.append({"title": TITLE + device, "tests": [{"projectName": payload["project"], "status": "expected",
                "results": [{"status": "passed", "attachments": [{"name": "medication-search-results", "contentType": "application/json",
                    "body": base64.b64encode(json.dumps(payload).encode()).decode()}]}]}]})
    return receipt, {"suites": [{"specs": specs}], "errors": []}


def alter(report, index, change):
    attachment = report["suites"][0]["specs"][index]["tests"][0]["results"][-1]["attachments"][0]
    payload = json.loads(base64.b64decode(attachment["body"]))
    change(payload)
    attachment["body"] = base64.b64encode(json.dumps(payload).encode()).decode()


def archive(receipt, report, bad_digest=False):
    raw = json.dumps(receipt).encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("_temp/production-release-receipt.json", raw)
        z.writestr("_temp/production-release-receipt.json.sha256", ("0" * 64 if bad_digest else hashlib.sha256(raw).hexdigest()) + "  production-release-receipt.json\n")
        z.writestr("_temp/production-release-journeys.json", json.dumps(report))
    return out.getvalue()


class SnapshotTests(unittest.TestCase):
    def test_extracts_all_four_site_device_groups_and_keeps_punctuation(self):
        receipt, report = bundle()
        snap = ranking.extract_snapshot(receipt, report)
        self.assertEqual(len(snap["cases"]), 8)
        self.assertEqual({(c["project"], c["device"]) for c in snap["cases"]},
                         {("release-ms3", "desktop"), ("release-ms3", "phone"), ("release-res", "desktop"), ("release-res", "phone")})
        self.assertEqual(snap["cases"][0]["expected"]["query"], "Ativan alcohol-withdrawal")

    def test_missing_duplicate_partial_wrong_revision_or_wrong_site_is_not_usable(self):
        mutations = [
            lambda r: r["suites"][0]["specs"].pop(),
            lambda r: r["suites"][0]["specs"].append(copy.deepcopy(r["suites"][0]["specs"][0])),
            lambda r: alter(r, 0, lambda p: p.update(completedQueries=1)),
            lambda r: alter(r, 0, lambda p: p.update(releaseSha=OLD)),
            lambda r: alter(r, 0, lambda p: p.update(url="https://une-ms3-psychiatry.netlify.app/")),
            lambda r: alter(r, 0, lambda p: p["observations"].append(copy.deepcopy(p["observations"][0]))),
            lambda r: r.update(errors=[{"message": "interrupted"}]),
            lambda r: alter(r, 0, lambda p: p.update(observations="invalid")),
            lambda r: alter(r, 0, lambda p: p["observations"][0]["expected"].update(first={"kind": "protocol"})),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                receipt, report = bundle()
                mutate(report)
                with self.assertRaises(ranking.RankingUnavailable):
                    ranking.extract_snapshot(receipt, report)

    def test_only_final_retry_is_compared_and_failed_queries_remain_visible(self):
        receipt, report = bundle()
        test = report["suites"][0]["specs"][0]["tests"][0]
        test["results"].insert(0, copy.deepcopy(test["results"][0]))
        alter(report, 0, lambda p: p["observations"][0].update(rows=[], passed=False))
        snapshot = ranking.extract_snapshot(receipt, report)
        self.assertEqual(len(snapshot["cases"]), 8)
        self.assertFalse(snapshot["cases"][0]["passed"])


class ComparisonTests(unittest.TestCase):
    def compare(self, mutate=None):
        old, before = bundle(OLD)
        new, after = bundle()
        if mutate:
            mutate(after)
        return ranking.compare_snapshots(ranking.extract_snapshot(old, before), ranking.extract_snapshot(new, after),
                                         {"releaseSha": OLD, "verifierSha": NEW, "runId": 7, "artifactId": 9})

    def test_unchanged_complete_coverage_is_explicit_for_both_sites(self):
        result = self.compare()
        self.assertEqual(result["status"], "COMPARED")
        self.assertEqual(result["comparedQueries"], 8)
        self.assertEqual(result["changes"], [])
        self.assertEqual(result["sites"]["release-ms3"]["comparedQueries"], 4)
        self.assertEqual(result["sites"]["release-res"]["comparedQueries"], 4)

    def test_safety_demotions_removals_and_lost_protocol_actions_are_highlighted(self):
        for rows, note in [
            ([{"ref": "psychopharm_primer.md", "kind": "item"}, {"ref": "t_sud.md", "kind": "protocol"}], "demoted"),
            ([{"ref": "psychopharm_primer.md", "kind": "item"}], "missing"),
            ([{"ref": "t_sud.md", "kind": "item"}, {"ref": "psychopharm_primer.md", "kind": "item"}], "ordinary"),
        ]:
            with self.subTest(note=note):
                result = self.compare(lambda r: alter(r, 3, lambda p: p["observations"][0].update(rows=rows, passed=False)))
                self.assertEqual(result["safetyRegressions"], 1)
                change = result["changes"][0]
                self.assertEqual((change["project"], change["device"]), ("release-res", "phone"))
                self.assertIn(note, " ".join(change["notes"]))
                self.assertEqual(change["movements"][0]["beforeRank"], 1)
                self.assertIn("Safety-priority regressions", ranking.render_markdown(result))

    def test_regular_rank_changes_do_not_become_safety_alarms(self):
        result = self.compare(lambda r: alter(r, 0, lambda p: p["observations"][1]["rows"].reverse()))
        self.assertEqual(result["safetyRegressions"], 0)
        self.assertEqual(len(result["changes"]), 1)
        self.assertEqual(result["changes"][0]["movements"][0]["afterRank"], 2)

    def test_removed_safety_query_is_a_coverage_gap_not_no_changes(self):
        def remove(p):
            p["observations"].pop(0)
            p.update(expectedQueries=1, completedQueries=1)
        result = self.compare(lambda r: alter(r, 1, remove))
        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(result["removedQueries"], 1)
        self.assertEqual(result["safetyRegressions"], 0)
        self.assertEqual(result["safetyCoverageGaps"], 1)
        self.assertIn("coverage", " ".join(result["changes"][0]["notes"]))
        self.assertNotIn("missing from results", " ".join(result["changes"][0]["notes"]))

    def test_changed_expectations_and_viewports_are_not_silent_stability(self):
        result = self.compare(lambda r: alter(r, 0, lambda p: p["observations"][1]["expected"].update(topThree="med_monitoring.md")))
        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(result["changedExpectations"], 1)
        result = self.compare(lambda r: alter(r, 0, lambda p: p["viewport"].update(width=1440)))
        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(result["addedQueries"], 2)
        self.assertEqual(result["removedQueries"], 2)

    def test_new_safety_expectation_failure_is_not_an_observed_ranking_regression(self):
        result = self.compare(lambda r: alter(r, 0, lambda p: p["observations"][0]["expected"].update(
            first={"ref": "agitation.md", "kind": "protocol"})))
        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(result["safetyRegressions"], 0)
        self.assertEqual(result["safetyExpectationFailures"], 1)

    def test_markup_is_escaped_and_safety_changes_sort_before_ordinary_changes(self):
        def change(r):
            alter(r, 0, lambda p: p["observations"][1]["rows"].reverse())
            alter(r, 3, lambda p: p["observations"][0]["rows"].reverse())
        result = self.compare(change)
        self.assertTrue(result["changes"][0]["safetyRegression"])
        self.assertFalse(result["changes"][1]["safetyAffected"])
        result["changes"][1]["query"] = "<script>|injection\nline"
        rendered = ranking.render_markdown(result)
        self.assertNotIn("<script>", rendered)
        self.assertIn("\\|", rendered)


class BaselineTests(unittest.TestCase):
    def test_ancient_run_history_cannot_permanently_disable_retained_comparisons(self):
        run = {"id": 1, "head_branch": "main", "event": "workflow_dispatch", "status": "completed", "conclusion": "success"}
        def metadata(path):
            if "/workflows/" in path:
                if "created=%3E%3D" not in path:
                    return {"total_count": 1000, "workflow_runs": [run] * 100}
                return {"total_count": 1, "workflow_runs": [run]}
            return {"total_count": 1, "artifacts": [{"id": 2, "name": f"production-release-{OLD}-1", "expired": False}]}
        baseline = ranking.find_baseline(REPO, NEW, [NEW, OLD], metadata, lambda n: archive(*bundle(OLD)))
        self.assertEqual(baseline["provenance"]["releaseSha"], OLD)

    def test_failed_baseline_browser_attempt_is_rejected_even_if_query_rows_say_passed(self):
        receipt, report = bundle(OLD)
        report["suites"][0]["specs"][0]["tests"][0]["status"] = "flaky"
        with self.assertRaises(ranking.RankingUnavailable):
            ranking.read_artifact(archive(receipt, report), REPO, OLD)

    def test_artifact_requires_receipt_digest_repository_and_release_binding(self):
        receipt, report = bundle(OLD)
        self.assertEqual(ranking.read_artifact(archive(receipt, report), REPO, OLD)["releaseSha"], OLD)
        for raw, repo, sha in [(archive(receipt, report, True), REPO, OLD), (archive(receipt, report), "other/repo", OLD), (archive(receipt, report), REPO, NEW)]:
            with self.assertRaises(ranking.RankingUnavailable):
                ranking.read_artifact(raw, repo, sha)

    def test_nearest_ancestor_wins_over_newer_historical_recheck_and_same_release(self):
        runs = [{"id": n, "head_branch": "main", "event": "workflow_dispatch", "status": "completed", "conclusion": "success"}
                for n in (101, 102, 103)]
        shas = {101: OLD, 102: OLDER, 103: NEW}
        def metadata(path):
            if "/workflows/" in path:
                return {"total_count": 3, "workflow_runs": runs}
            n = int(path.split("/runs/")[1].split("/")[0])
            return {"total_count": 1, "artifacts": [{"id": n, "name": f"production-release-{shas[n]}-{n}", "expired": False}]}
        def download(n):
            return archive(*bundle(shas[n]))
        result = ranking.find_baseline(REPO, NEW, [NEW, OLD, OLDER], metadata, download)
        self.assertEqual(result["provenance"]["releaseSha"], OLD)
        self.assertEqual(result["provenance"]["runId"], 101)

    def test_missing_credentials_and_old_coverage_are_explicit_not_false_no_change(self):
        receipt, report = bundle()
        with mock.patch.dict("os.environ", {}, clear=True):
            ranking.add_report(receipt, report)
        self.assertEqual(receipt["medicationSearchRanking"]["status"], "BASELINE_UNAVAILABLE")
        self.assertEqual(receipt["status"], "PASS", "comparison is advisory; existing release gates remain authoritative")
        self.assertEqual(len(receipt["medicationSearch"]["cases"]), 8)
        old, missing = bundle(OLD)
        missing["suites"] = []
        with self.assertRaises(ranking.RankingUnavailable):
            ranking.read_artifact(archive(old, missing), REPO, OLD)

    def test_history_pagination_expiry_and_malformed_results_are_not_silent_fallbacks(self):
        good = {"id": 1, "head_branch": "main", "event": "workflow_dispatch", "status": "completed", "conclusion": "success"}
        for mode in ("bound", "malformed", "expired", "artifact-list-partial", "non-main"):
            with self.subTest(mode=mode):
                def metadata(path):
                    if "/workflows/" in path:
                        if mode == "bound":
                            return {"total_count": 1000, "workflow_runs": [good] * 100}
                        if mode == "malformed":
                            return {"total_count": 1, "workflow_runs": [None]}
                        return {"total_count": 1, "workflow_runs": [{**good, "head_branch": "feature" if mode == "non-main" else "main"}]}
                    return {"total_count": 2 if mode == "artifact-list-partial" else 1,
                            "artifacts": [{"id": 2, "name": f"production-release-{OLD}-1", "expired": mode == "expired"}]}
                with self.assertRaises(ranking.RankingUnavailable):
                    ranking.find_baseline(REPO, NEW, [NEW, OLD], metadata,
                                          lambda n: self.fail("untrusted or expired artifacts must not be downloaded"))

    def test_complete_default_flow_uses_discovered_baseline(self):
        old, report = bundle(OLD)
        receipt, current = bundle()
        baseline = {"snapshot": ranking.extract_snapshot(old, report), "provenance": {"releaseSha": OLD, "runId": 1}}
        with mock.patch.object(ranking, "discover_baseline", return_value=baseline):
            ranking.add_report(receipt, current)
        self.assertEqual(receipt["medicationSearchRanking"]["status"], "COMPARED")
        self.assertEqual(receipt["medicationSearchRanking"]["comparedQueries"], 8)

    def test_finalize_serializes_comparison_markdown_snapshot_and_digest_together(self):
        import production_release_receipt as release_receipt
        old, previous = bundle(OLD)
        current, report = bundle()
        baseline = {"snapshot": ranking.extract_snapshot(old, previous), "provenance": {"releaseSha": OLD, "runId": 1}}
        core = {"releaseSha": NEW, "verifierSha": NEW, "repository": REPO, **current["evidence"],
                "ci": {"status": "PASS"}, "servedRevision": {"status": "PASS"}, "staticCanary": {"status": "PASS"}}
        # This fixture has only medication journeys, so the established release
        # gate must remain UNKNOWN even though the comparison itself is complete.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "core.json").write_text(json.dumps(core))
            (root / "journeys.json").write_text(json.dumps(report))
            with mock.patch.object(ranking, "discover_baseline", return_value=baseline):
                code = release_receipt.main(["finalize", "--core", str(root / "core.json"), "--journeys", str(root / "journeys.json"),
                    "--trigger", "workflow_dispatch", "--json-out", str(root / "receipt.json"),
                    "--markdown-out", str(root / "receipt.md"), "--digest-out", str(root / "receipt.sha256")])
            self.assertEqual(code, 2)
            raw = (root / "receipt.json").read_bytes()
            written = json.loads(raw)
            self.assertEqual(written["status"], "UNKNOWN")
            self.assertEqual(written["medicationSearchRanking"]["status"], "COMPARED")
            self.assertEqual(written["medicationSearchRanking"]["comparedQueries"], 8)
            self.assertEqual(len(written["medicationSearch"]["cases"]), 8)
            self.assertIn("No ranking changes", (root / "receipt.md").read_text())
            self.assertEqual((root / "receipt.sha256").read_text().split()[0], hashlib.sha256(raw).hexdigest())


if __name__ == "__main__":
    unittest.main()
