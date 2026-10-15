"""A release cannot pass by dropping a dialog, a site, or failed attempts."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "13_Faculty_Resources/_automation/maintenance"))
import dialog_focus_report as dialogs

SHA = "a" * 40
ORIGINS = {"ms3": "https://" + "1" * 24 + "--une-ms3-psychiatry.netlify.app",
           "res": "https://" + "2" * 24 + "--mmc-psychiatry-residents-sanford.netlify.app"}


def fixture(sha=SHA):
    # Independent inventory of the existing browser cases, including the closed-dialog control.
    specs = []
    def add(file, project, title):
        specs.append({"file": file, "title": "delayed dialog focus: " + title,
                      "tests": [{"projectName": project, "expectedStatus": "passed", "status": "expected",
                                 "results": [{"status": "passed", "retry": 0, "duration": 20, "errors": [], "attachments": []}]}]})
    for site in ["ms3", "res"]:
        for width in [320, 1280]:
            for name in ["search", "settings", "safety kit", "protocol pg_suicide.md", "protocol agitation.md",
                         "protocol exp_consult.md", "protocol t_sud.md", "protocol delirium.md", "capture",
                         "email review", "patient-details warning", "retained item preview"]:
                for source in ["reading and guide arrival", "high-risk ledger arrival"]:
                    add("dialog-loading-focus.spec.js", "nav-" + site, f"{name} / {source} / {width}px")
            for name in ["optional Care Quick Share", "optional clear-packet confirmation"]:
                add("dialog-loading-focus.spec.js", "nav-" + site, f"{name} / directory arrival / {width}px")
            add("rotation-edition-v2.spec.js", "nav-" + site, f"optional edition switch / high-risk ledger arrival / {width}px")
            for name in ["spoken consent", "Chart", "Step out", "typed patient-details alert", "spoken patient-details alert"]:
                add("interview-room.spec.js", "interview-room", f"Interview Room {name} / {site} / {width}px")
        for state in ["open", "closed"]:
            add("dialog-loading-focus.spec.js", "nav-" + site,
                f"embedded Communication Practice case browser {state} / high-risk ledger arrival")
    core = {"releaseSha": sha, "deployments": {"sites": [
        {"name": site, "status": "PASS", "commitRef": sha, "permalinkUrl": url} for site, url in ORIGINS.items()]}}
    proof = {"releaseSha": sha, "sites": {site: {"url": url, **{
        phase: {"shellRevision": sha, "governanceRevisions": [sha], "observedAt": "2026-10-15T01:00:00Z"}
        for phase in ["before", "after"]}} for site, url in ORIGINS.items()}}
    report = {"config": {"metadata": {"releaseSha": sha, "origins": ORIGINS}}, "suites": [{"specs": specs}], "errors": []}
    return core, report, proof


class DialogFocusReportTests(unittest.TestCase):
    def test_full_inventory_has_66_per_site_and_phone_desktop_counts(self):
        summary = dialogs.summarize(*fixture())
        self.assertEqual(summary["status"], "PASS")
        self.assertEqual(summary["expected"], 132)
        self.assertEqual(summary["passed"], 132)
        for site in ["ms3", "res"]:
            self.assertEqual(summary["sites"][site]["passed"], 66)
            self.assertEqual(summary["sites"][site]["screens"]["phone"]["passed"], 34)
            self.assertEqual(summary["sites"][site]["screens"]["desktop"]["passed"], 32)

    def test_missing_duplicate_unexpected_skipped_or_wrong_file_is_not_a_pass(self):
        for mutation in [
            lambda r: r["suites"][0]["specs"].pop(),
            lambda r: r["suites"][0]["specs"].append(copy.deepcopy(r["suites"][0]["specs"][0])),
            lambda r: r["suites"][0]["specs"][0].update(title="delayed dialog focus: new uncounted dialog"),
            lambda r: r["suites"][0]["specs"][0].update(file="unrelated.spec.js"),
            lambda r: r["suites"][0]["specs"][0]["tests"][0].update(status="skipped", results=[]),
            lambda r: r.update(suites=[]),
        ]:
            with self.subTest(mutation=mutation):
                core, report, proof = fixture()
                mutation(report)
                self.assertEqual(dialogs.summarize(core, report, proof)["status"], "UNKNOWN")

    def test_malformed_attempt_arrays_cannot_count_as_passed(self):
        for field in ("errors", "attachments"):
            for value in ({}, None, "invalid", [None]):
                core, report, proof = fixture()
                report["suites"][0]["specs"][0]["tests"][0]["results"][0][field] = value
                self.assertEqual(dialogs.summarize(core, report, proof)["status"], "UNKNOWN")
            core, report, proof = fixture()
            report["suites"][0]["specs"][0]["tests"][0]["results"][0].pop(field)
            self.assertEqual(dialogs.summarize(core, report, proof)["status"], "UNKNOWN")
        core, report, proof = fixture()
        report.pop("errors")
        self.assertEqual(dialogs.summarize(core, report, proof)["status"], "UNKNOWN")

    def test_empty_spec_and_invalid_or_reversed_probe_times_cannot_pass(self):
        core, report, proof = fixture()
        report["suites"][0]["specs"].append({"file": "extra.spec.js", "title": "uncounted", "tests": []})
        self.assertEqual(dialogs.summarize(core, report, proof)["status"], "UNKNOWN")
        for timestamp in ["not a timestamp", "2026-10-15T01:00:00", "2026-10-14T01:00:00Z"]:
            core, report, proof = fixture()
            proof["sites"]["ms3"]["after"]["observedAt"] = timestamp
            self.assertEqual(dialogs.summarize(core, report, proof)["status"], "UNKNOWN")

    def test_failure_keeps_site_case_and_trace_and_is_not_hidden_by_later_pass(self):
        core, report, proof = fixture()
        test = report["suites"][0]["specs"][0]["tests"][0]
        test["results"].insert(0, {"status": "failed", "retry": 0, "errors": [{"message": "focus left search"}],
                                   "attachments": [{"name": "trace", "path": "artifacts/search/trace.zip"}]})
        test["results"][-1]["retry"] = 1
        summary = dialogs.summarize(core, report, proof)
        self.assertEqual(summary["status"], "FAIL")
        self.assertEqual(summary["sites"]["ms3"]["failed"], 1)
        self.assertEqual(summary["sites"]["res"]["passed"], 66)
        self.assertIn("focus left search", summary["findings"][0]["errors"])
        self.assertEqual(summary["findings"][0]["attachments"][0]["name"], "trace")

    def test_wrong_revision_origin_missing_end_check_or_malformed_evidence_is_unknown(self):
        for mutate in [
            lambda c, r, p: p.update(releaseSha="b" * 40),
            lambda c, r, p: p["sites"]["res"]["after"].update(shellRevision="b" * 40),
            lambda c, r, p: p["sites"]["ms3"]["before"].update(governanceRevisions=[]),
            lambda c, r, p: p["sites"]["ms3"].pop("after"),
            lambda c, r, p: p["sites"]["res"].update(url=ORIGINS["ms3"]),
            lambda c, r, p: r["config"]["metadata"].update(origins={}),
            lambda c, r, p: c["deployments"]["sites"].append(c["deployments"]["sites"][0]),
            lambda c, r, p: r.update(suites="broken"),
        ]:
            core, report, proof = fixture()
            mutate(core, report, proof)
            self.assertEqual(dialogs.summarize(core, report, proof)["status"], "UNKNOWN")
        self.assertEqual(dialogs.summarize(fixture()[0], None, None)["status"], "UNKNOWN")

    def test_runner_error_is_fail_and_malformed_rows_do_not_crash_finalization(self):
        core, report, proof = fixture()
        report["errors"] = [{"message": "worker terminated"}]
        self.assertEqual(dialogs.summarize(core, report, proof)["status"], "FAIL")
        report["suites"][0]["specs"][0]["tests"] = [None]
        self.assertNotEqual(dialogs.summarize(core, report, proof)["status"], "PASS")

    def test_markdown_shows_both_sites_limits_and_incomplete_cases(self):
        core, report, proof = fixture()
        report["suites"][0]["specs"].pop()
        summary = dialogs.summarize(core, report, proof)
        markdown = dialogs.render_markdown(summary)
        for text in ["Dialog-focus regression results", "MS3", "Resident", "phone", "desktop", "UNKNOWN",
                     "controlled-response", "VoiceOver", "missing", "Communication Practice"]:
            self.assertIn(text, markdown)


if __name__ == "__main__":
    unittest.main()
