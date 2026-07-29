import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import yaml


ROOT = Path(__file__).resolve().parents[2]
SURV = ROOT / "13_Faculty_Resources" / "_automation" / "surveillance"
BIN = SURV / "bin"
FIXTURES = Path(__file__).with_name("fixtures")
sys.path.insert(0, str(BIN))

import build_status
import lib_surveillance as L
import run_citation_check
import sync_findings


def load_report_branch():
    path = BIN / "report_branch.py"
    spec = importlib.util.spec_from_file_location("report_branch", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeRunner:
    def __init__(self, responses=None):
        self.responses = responses or {}
        self.calls = []

    def __call__(self, command, **kwargs):
        command = list(command)
        self.calls.append((command, kwargs))
        response = self.responses.get(tuple(command))
        if response is None:
            response = subprocess.CompletedProcess(command, 0, "", "")
        if response.returncode and kwargs.get("check", True):
            raise subprocess.CalledProcessError(
                response.returncode,
                command,
                output=response.stdout,
                stderr=response.stderr,
            )
        return response


def completed(command, returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(list(command), returncode, stdout, stderr)


class SurveillanceMaintenanceTests(unittest.TestCase):
    def setUp(self):
        self._temp = tempfile.TemporaryDirectory()
        self.temp_dir = Path(self._temp.name)

    def tearDown(self):
        self._temp.cleanup()

    def fixture_reviewed(self):
        path = self.temp_dir / "reviewed.json"
        path.write_text("{}\n", encoding="utf-8")
        return path

    def write_report_fixture(
        self,
        *,
        fingerprint,
        status,
        severity="P1",
        when="2026-07-28",
        summary="historical finding",
        stem="guideline_delta",
    ):
        finding = {
            "finding_id": fingerprint,
            "fingerprint": fingerprint,
            "job": "guideline-surveillance",
            "source_id": fingerprint.split("::", 1)[0],
            "detected_at": f"{when}T06:00:00+00:00",
            "change_type": "modified",
            "severity": severity,
            "summary": summary,
            "status": status,
            "affects": [],
        }
        path = self.temp_dir / f"{stem}_{when}.json"
        path.write_text(json.dumps([finding]), encoding="utf-8")
        return path

    def run_sync(self, *, findings, checked_sources, out_dir, job):
        findings_path = self.temp_dir / "findings.json"
        findings_path.write_text(json.dumps(findings), encoding="utf-8")
        issues_out = self.temp_dir / "issue-state.json"
        return subprocess.run(
            [
                sys.executable,
                str(BIN / "sync_findings.py"),
                "--findings",
                str(findings_path),
                "--job",
                job,
                "--checked-sources",
                str(checked_sources),
                "--issues-out",
                str(issues_out),
                "--dry-run",
                "--out-dir",
                str(out_dir),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def run_collector(self, script, *arguments):
        return subprocess.run(
            [sys.executable, str(BIN / script), *map(str, arguments)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_link_and_citation_reports_do_not_overwrite(self):
        link = L.write_report("link-source-monitor", [], when="2026-07-28", base=self.temp_dir)
        citation = L.write_report("citation-monitor", [], when="2026-07-28", base=self.temp_dir)
        self.assertEqual(
            {Path(p).name for p in link},
            {"link_audit_2026-07-28.json", "link_audit_2026-07-28.csv"},
        )
        self.assertEqual(
            {Path(p).name for p in citation},
            {"citation_audit_2026-07-28.json", "citation_audit_2026-07-28.csv"},
        )

    def test_zero_findings_stamp_every_checked_source(self):
        checked = self.temp_dir / "checked.json"
        checked.write_text(
            '["apa-practice-guidelines", "doi:10.1/example"]',
            encoding="utf-8",
        )
        result = self.run_sync(
            findings=[],
            checked_sources=checked,
            out_dir=self.temp_dir,
            job="citation-monitor",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            set(json.loads((self.temp_dir / "last_run.json").read_text(encoding="utf-8"))),
            {"apa-practice-guidelines", "doi:10.1/example"},
        )

    def test_checked_source_contract_rejects_malformed_duplicate_and_blank_values(self):
        invalid_values = (
            {"not": "an array"},
            ["duplicate", "duplicate"],
            ["blank", "  "],
            ["valid", 7],
        )
        for index, value in enumerate(invalid_values):
            with self.subTest(value=value):
                checked = self.temp_dir / f"checked-{index}.json"
                checked.write_text(json.dumps(value), encoding="utf-8")
                result = self.run_sync(
                    findings=[],
                    checked_sources=checked,
                    out_dir=self.temp_dir / f"out-{index}",
                    job="citation-monitor",
                )
                self.assertNotEqual(result.returncode, 0)

    def test_validate_checked_sources_sorts_literal_ids(self):
        self.assertEqual(
            L.validate_checked_sources(["pmid:7", "doi:10.1/example", "apa"]),
            ["apa", "doi:10.1/example", "pmid:7"],
        )

    def test_missing_empty_non_object_and_unrecognized_lychee_reports_fail(self):
        cases = {
            "missing": None,
            "empty": "",
            "non-object": "[]",
            "unrecognized": '{"links": []}',
        }
        for name, raw in cases.items():
            with self.subTest(name=name):
                report = self.temp_dir / f"{name}.json"
                if raw is not None:
                    report.write_text(raw, encoding="utf-8")
                result = self.run_collector(
                    "run_link_monitor.py",
                    "--lychee",
                    report,
                    "--out",
                    self.temp_dir / f"{name}-findings.json",
                    "--checked-out",
                    self.temp_dir / f"{name}-checked.json",
                )
                self.assertNotEqual(result.returncode, 0)

    def test_valid_empty_lychee_report_is_a_zero_finding_check(self):
        report = self.temp_dir / "lychee.json"
        out = self.temp_dir / "findings.json"
        checked = self.temp_dir / "checked.json"
        report.write_text('{"fail_map": {}}', encoding="utf-8")
        result = self.run_collector(
            "run_link_monitor.py",
            "--lychee",
            report,
            "--out",
            out,
            "--checked-out",
            checked,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(out.read_text(encoding="utf-8")), [])
        self.assertEqual(json.loads(checked.read_text(encoding="utf-8")), ["link-monitor"])

    def test_zero_finding_collectors_write_checked_receipts(self):
        intake_fixture = self.temp_dir / "intake.json"
        intake_fixture.write_text("[]", encoding="utf-8")
        intake_out = self.temp_dir / "intake-findings.json"
        intake_checked = self.temp_dir / "intake-checked.json"
        intake = self.run_collector(
            "run_resource_intake.py",
            "--fixture",
            intake_fixture,
            "--out",
            intake_out,
            "--checked-out",
            intake_checked,
        )
        self.assertEqual(intake.returncode, 0, intake.stderr)
        self.assertEqual(json.loads(intake_out.read_text(encoding="utf-8")), [])
        self.assertEqual(
            json.loads(intake_checked.read_text(encoding="utf-8")),
            ["resource-intake"],
        )

        guideline_fixture = self.temp_dir / "guideline.json"
        guideline_fixture.write_text(
            '{"apa-practice-guidelines": "unchanged baseline"}',
            encoding="utf-8",
        )
        baseline_dir = self.temp_dir / "baselines"
        baseline_dir.mkdir()
        (baseline_dir / "apa-practice-guidelines.json").write_text(
            json.dumps(
                {
                    "hash": L.sha_full("unchanged baseline"),
                    "chars": len("unchanged baseline"),
                    "checked_at": "2026-07-01T00:00:00+00:00",
                    "text": "unchanged baseline",
                }
            ),
            encoding="utf-8",
        )
        guideline_out = self.temp_dir / "guideline-findings.json"
        guideline_checked = self.temp_dir / "guideline-checked.json"
        guideline = self.run_collector(
            "run_guideline_surv.py",
            "--fixture",
            guideline_fixture,
            "--source",
            "apa-practice-guidelines",
            "--baseline-dir",
            baseline_dir,
            "--out",
            guideline_out,
            "--checked-out",
            guideline_checked,
        )
        self.assertEqual(guideline.returncode, 0, guideline.stderr)
        self.assertEqual(json.loads(guideline_out.read_text(encoding="utf-8")), [])
        self.assertEqual(
            json.loads(guideline_checked.read_text(encoding="utf-8")),
            ["apa-practice-guidelines"],
        )

        citation_root = self.temp_dir / "empty-curriculum"
        citation_root.mkdir()
        citation_out = self.temp_dir / "citation-findings.json"
        citation_checked = self.temp_dir / "citation-checked.json"
        citation = self.run_collector(
            "run_citation_check.py",
            "--skip-sources",
            "--root",
            citation_root,
            "--out",
            citation_out,
            "--checked-out",
            citation_checked,
        )
        self.assertEqual(citation.returncode, 0, citation.stderr)
        self.assertEqual(json.loads(citation_out.read_text(encoding="utf-8")), [])
        self.assertEqual(json.loads(citation_checked.read_text(encoding="utf-8")), [])

    def test_citation_receipt_names_every_attempted_identifier(self):
        page = (
            self.temp_dir
            / "07_Evidence_and_Reading"
            / "Inpatient_Evidence"
            / "evidence.md"
        )
        page.parent.mkdir(parents=True)
        page.write_text("Evidence DOI 10.1000/example.", encoding="utf-8")
        checked = []
        with (
            mock.patch.object(
                run_citation_check,
                "classify_doi",
                return_value=(True, None, 302, "https://publisher.example/article", "ok"),
            ),
            mock.patch.object(run_citation_check.time, "sleep"),
        ):
            findings = run_citation_check.check_citations(self.temp_dir, checked)
        self.assertEqual(findings, [])
        self.assertEqual(checked, ["doi:10.1000/example"])

    def test_issue_snapshot_normalization_excludes_pull_requests(self):
        raw = [
            {
                "number": 123,
                "html_url": "https://github.com/owner/repo/issues/123",
                "state": "closed",
                "closed_at": "2026-07-28T12:00:00Z",
                "body": "<!-- surveillance:fp=source::modified::abc -->",
                "labels": [{"name": "P1"}, {"name": "surveillance"}],
            },
            {
                "number": 124,
                "html_url": "https://github.com/owner/repo/issues/124",
                "state": "open",
                "closed_at": None,
                "body": "<!-- surveillance:fp=source::modified::open -->",
                "labels": [{"name": "surveillance"}, {"name": "P0"}],
            },
            {
                "number": 125,
                "html_url": "https://github.com/owner/repo/pull/125",
                "state": "open",
                "closed_at": None,
                "body": "<!-- surveillance:fp=source::modified::pull-request -->",
                "labels": [{"name": "surveillance"}],
                "pull_request": {
                    "url": "https://api.github.com/repos/owner/repo/pulls/125"
                },
            },
        ]
        snapshot = sync_findings.normalize_issue_snapshot(raw)
        self.assertEqual(
            snapshot,
            [
                {
                    "number": 123,
                    "url": "https://github.com/owner/repo/issues/123",
                    "state": "CLOSED",
                    "closedAt": "2026-07-28T12:00:00Z",
                    "fingerprint": "source::modified::abc",
                    "labels": ["P1", "surveillance"],
                },
                {
                    "number": 124,
                    "url": "https://github.com/owner/repo/issues/124",
                    "state": "OPEN",
                    "closedAt": None,
                    "fingerprint": "source::modified::open",
                    "labels": ["P0", "surveillance"],
                },
            ],
        )

    def test_closed_issue_overrides_historical_open_status(self):
        self.write_report_fixture(
            fingerprint="source::modified::abc",
            status="issue-open",
        )
        state = build_status.compute(
            self.temp_dir,
            reviewed_path=self.fixture_reviewed(),
            issues_path=FIXTURES / "issues-open-closed.json",
        )
        self.assertEqual(state["p0"], [])
        self.assertEqual(state["p1"], [])
        self.assertEqual(state["issueTruth"], "live")

    def test_open_issue_remains_active(self):
        self.write_report_fixture(
            fingerprint="source::modified::open",
            status="triaged",
            severity="P0",
        )
        state = build_status.compute(
            self.temp_dir,
            reviewed_path=self.fixture_reviewed(),
            issues_path=FIXTURES / "issues-open-closed.json",
        )
        self.assertEqual(len(state["p0"]), 1)
        self.assertEqual(
            state["p0"][0]["github_issue"],
            "https://github.com/owner/repo/issues/124",
        )

    def test_unissued_overflow_remains_active_with_live_snapshot(self):
        self.write_report_fixture(
            fingerprint="source::modified::overflow",
            status="new",
        )
        state = build_status.compute(
            self.temp_dir,
            reviewed_path=self.fixture_reviewed(),
            issues_path=FIXTURES / "issues-open-closed.json",
        )
        self.assertEqual(
            [item["fingerprint"] for item in state["p1"]],
            ["source::modified::overflow"],
        )

    def test_report_history_uses_only_newest_record_per_fingerprint(self):
        self.write_report_fixture(
            fingerprint="source::modified::repeat",
            status="new",
            severity="P0",
            when="2026-07-27",
            summary="old",
        )
        self.write_report_fixture(
            fingerprint="source::modified::repeat",
            status="new",
            severity="P1",
            when="2026-07-28",
            summary="new",
        )
        state = build_status.compute(
            self.temp_dir,
            reviewed_path=self.fixture_reviewed(),
        )
        self.assertEqual(state["p0"], [])
        self.assertEqual([item["summary"] for item in state["p1"]], ["new"])
        self.assertEqual(state["issueTruth"], "offline-report-fallback")
        self.assertIn("offline-report-fallback", build_status.render_md(state))

    def test_hydrate_rejects_inbox_diff_outside_generated_paths(self):
        report_branch = load_report_branch()
        branch = "automation/surveillance-inbox"
        responses = {
            ("git", "rev-parse", "--verify", f"refs/remotes/origin/{branch}"): completed(
                [], stdout="a" * 40 + "\n"
            ),
            (
                "gh",
                "pr",
                "list",
                "--head",
                branch,
                "--base",
                "main",
                "--state",
                "open",
                "--json",
                "number",
                "--limit",
                "2",
            ): completed([], stdout='[{"number": 9}]\n'),
            (
                "git",
                "diff",
                "--name-only",
                "origin/main",
                f"origin/{branch}",
            ): completed(
                [],
                stdout=(
                    "13_Faculty_Resources/_automation/surveillance/history/run.json\n"
                    "README.md\n"
                ),
            ),
        }
        with self.assertRaises(ValueError):
            report_branch.hydrate(
                repo_root=self.temp_dir,
                state_path=self.temp_dir / "state.json",
                base="main",
                branch=branch,
                runner=FakeRunner(responses),
            )

    def test_hydrate_persists_exact_remote_sha(self):
        report_branch = load_report_branch()
        branch = "automation/surveillance-inbox"
        sha = "8f" * 20
        responses = {
            ("git", "rev-parse", "--verify", f"refs/remotes/origin/{branch}"): completed(
                [], stdout=sha + "\n"
            ),
            (
                "gh",
                "pr",
                "list",
                "--head",
                branch,
                "--base",
                "main",
                "--state",
                "open",
                "--json",
                "number",
                "--limit",
                "2",
            ): completed([], stdout='[{"number": 19}]\n'),
            (
                "git",
                "diff",
                "--name-only",
                "origin/main",
                f"origin/{branch}",
            ): completed(
                [],
                stdout="13_Faculty_Resources/_automation/surveillance/STATUS.md\n",
            ),
        }
        state_path = self.temp_dir / "state.json"
        runner = FakeRunner(responses)
        report_branch.hydrate(
            repo_root=self.temp_dir,
            state_path=state_path,
            base="main",
            branch=branch,
            runner=runner,
        )
        commands = [call[0] for call in runner.calls]
        self.assertIn(
            [
                "git",
                "fetch",
                "origin",
                "+refs/heads/main:refs/remotes/origin/main",
            ],
            commands,
        )
        self.assertIn(
            [
                "git",
                "fetch",
                "origin",
                (
                    "+refs/heads/automation/surveillance-inbox:"
                    "refs/remotes/origin/automation/surveillance-inbox"
                ),
            ],
            commands,
        )
        self.assertEqual(
            json.loads(state_path.read_text(encoding="utf-8")),
            {
                "base": "main",
                "branch": branch,
                "expectedRemoteSha": sha,
                "openPrNumber": 19,
            },
        )

    def test_publish_stages_only_allowed_generated_paths(self):
        report_branch = load_report_branch()
        branch = "automation/surveillance-inbox"
        state_path = self.temp_dir / "state.json"
        state_path.write_text(
            json.dumps(
                {
                    "base": "main",
                    "branch": branch,
                    "expectedRemoteSha": None,
                    "openPrNumber": 4,
                }
            ),
            encoding="utf-8",
        )
        dirty = (
            " M 13_Faculty_Resources/_automation/surveillance/STATUS.md\n"
            "?? 13_Faculty_Resources/_automation/surveillance/history/new.json\n"
        )
        runner = FakeRunner(
            {
                ("git", "status", "--porcelain=v1", "--untracked-files=all"): completed(
                    [], stdout=dirty
                ),
                ("git", "diff", "--cached", "--quiet"): completed([], returncode=1),
            }
        )
        report_branch.publish(
            repo_root=self.temp_dir,
            state_path=state_path,
            runner=runner,
        )
        commands = [call[0] for call in runner.calls]
        self.assertIn(
            ["git", "add", "--", *report_branch.ALLOWED_PATHS],
            commands,
        )
        self.assertNotIn(["git", "add", "."], commands)

    def test_publish_uses_exact_force_with_lease(self):
        report_branch = load_report_branch()
        branch = "automation/surveillance-inbox"
        expected_remote_sha = "91" * 20
        state_path = self.temp_dir / "state.json"
        state_path.write_text(
            json.dumps(
                {
                    "base": "main",
                    "branch": branch,
                    "expectedRemoteSha": expected_remote_sha,
                    "openPrNumber": 4,
                }
            ),
            encoding="utf-8",
        )
        runner = FakeRunner(
            {
                ("git", "status", "--porcelain=v1", "--untracked-files=all"): completed(
                    [],
                    stdout=(
                        " M 13_Faculty_Resources/_automation/surveillance/status.html\n"
                    ),
                ),
                ("git", "diff", "--cached", "--quiet"): completed([], returncode=1),
            }
        )
        report_branch.publish(
            repo_root=self.temp_dir,
            state_path=state_path,
            runner=runner,
        )
        push = next(call[0] for call in runner.calls if call[0][:2] == ["git", "push"])
        self.assertEqual(
            push,
            [
                "git",
                "push",
                "origin",
                f"HEAD:refs/heads/{branch}",
                f"--force-with-lease=refs/heads/{branch}:{expected_remote_sha}",
            ],
        )

    def test_publish_rejects_an_unexpected_dirty_path(self):
        report_branch = load_report_branch()
        state_path = self.temp_dir / "state.json"
        state_path.write_text(
            json.dumps(
                {
                    "base": "main",
                    "branch": "automation/surveillance-inbox",
                    "expectedRemoteSha": None,
                    "openPrNumber": None,
                }
            ),
            encoding="utf-8",
        )
        runner = FakeRunner(
            {
                ("git", "status", "--porcelain=v1", "--untracked-files=all"): completed(
                    [], stdout=" M reviewed.json\n"
                ),
            }
        )
        with self.assertRaises(ValueError):
            report_branch.publish(
                repo_root=self.temp_dir,
                state_path=state_path,
                runner=runner,
            )

    def test_first_publish_creates_one_titled_pr_and_returns_to_base(self):
        report_branch = load_report_branch()
        branch = "automation/surveillance-inbox"
        state_path = self.temp_dir / "state.json"
        state_path.write_text(
            json.dumps(
                {
                    "base": "main",
                    "branch": branch,
                    "expectedRemoteSha": None,
                    "openPrNumber": None,
                }
            ),
            encoding="utf-8",
        )
        runner = FakeRunner(
            {
                ("git", "status", "--porcelain=v1", "--untracked-files=all"): completed(
                    [],
                    stdout=(
                        " M 13_Faculty_Resources/_automation/surveillance/STATUS.md\n"
                    ),
                ),
                ("git", "diff", "--cached", "--quiet"): completed([], returncode=1),
            }
        )
        report_branch.publish(
            repo_root=self.temp_dir,
            state_path=state_path,
            runner=runner,
        )
        commands = [call[0] for call in runner.calls]
        self.assertIn(
            [
                "gh",
                "pr",
                "create",
                "--base",
                "main",
                "--head",
                branch,
                "--title",
                "surveillance: refresh maintenance inbox",
                "--body",
                "Automated, content-free surveillance reports for faculty review.",
            ],
            commands,
        )
        self.assertEqual(commands[-1], ["git", "switch", "main"])

    def test_surveillance_workflows_share_truthful_pinned_publication_contract(self):
        workflows = {
            "surveillance-link-monitor.yml": "0 6 * * 1",
            "surveillance-citations.yml": "0 7 * * 1",
            "surveillance-guideline.yml": "0 6 1 * *",
            "surveillance-resource-intake.yml": None,
        }
        pins = {
            "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
            "actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97",
            "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
        }
        for filename, cron in workflows.items():
            with self.subTest(workflow=filename):
                path = ROOT / ".github" / "workflows" / filename
                model = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
                self.assertEqual(model["concurrency"]["group"], "surveillance-inbox")
                self.assertEqual(
                    model["permissions"],
                    {
                        "contents": "write",
                        "issues": "write",
                        "pull-requests": "write",
                    },
                )
                events = model["on"]
                if cron is None:
                    self.assertNotIn("schedule", events)
                else:
                    self.assertEqual(events["schedule"], [{"cron": cron}])
                steps = next(iter(model["jobs"].values()))["steps"]
                uses = {step["uses"] for step in steps if "uses" in step}
                self.assertTrue(pins.issubset(uses))
                checkout = next(step for step in steps if step.get("uses", "").startswith("actions/checkout@"))
                self.assertEqual(
                    checkout["with"],
                    {"fetch-depth": "0", "lfs": "false"},
                )
                artifact = next(step for step in steps if step.get("uses", "").startswith("actions/upload-artifact@"))
                self.assertEqual(artifact["if"], "always()")
                self.assertEqual(artifact["with"]["retention-days"], "90")
                commands = "\n".join(step.get("run", "") for step in steps)
                self.assertIn("report_branch.py hydrate", commands)
                self.assertIn("--checked-sources", commands)
                self.assertIn("--issues-out", commands)
                self.assertIn("--issues-json", commands)
                self.assertIn("report_branch.py publish", commands)
                self.assertNotIn("git push", commands)


if __name__ == "__main__":
    unittest.main()
