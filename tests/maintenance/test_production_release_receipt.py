import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
MAINTENANCE = REPO_ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"
sys.path.insert(0, str(MAINTENANCE))

import production_release_receipt as receipt  # noqa: E402


SHA = "970d615056e880ead5722c69f1b12dad40714e33"
OTHER_SHA = "a" * 40
REPOSITORY = "jmoss333/psychiatry-clerkship"


class EvidenceSelectionTests(unittest.TestCase):
    def test_ci_requires_a_completed_successful_push_on_main_for_the_exact_sha(self):
        payload = {
            "workflow_runs": [
                {
                    "id": 8,
                    "head_sha": OTHER_SHA,
                    "head_branch": "main",
                    "event": "push",
                    "status": "completed",
                    "conclusion": "success",
                    "run_number": 80,
                    "run_attempt": 1,
                    "html_url": "https://github.example/runs/8",
                },
                {
                    "id": 9,
                    "head_sha": SHA,
                    "head_branch": "main",
                    "event": "push",
                    "status": "in_progress",
                    "conclusion": None,
                    "run_number": 81,
                    "run_attempt": 1,
                    "html_url": "https://github.example/runs/9",
                },
            ]
        }
        waiting = receipt.select_ci_evidence(payload, SHA)
        self.assertEqual(waiting["status"], "UNKNOWN")
        self.assertEqual(waiting["runId"], 9)

        payload["workflow_runs"][1].update(status="completed", conclusion="success")
        passed = receipt.select_ci_evidence(payload, SHA)
        self.assertEqual(passed["status"], "PASS")
        self.assertEqual(passed["runId"], 9)
        self.assertEqual(passed["url"], "https://github.example/runs/9")

        payload["workflow_runs"][1]["conclusion"] = "failure"
        failed = receipt.select_ci_evidence(payload, SHA)
        self.assertEqual(failed["status"], "FAIL")
        self.assertEqual(failed["conclusion"], "failure")

    def test_deploy_requires_ready_production_record_for_exact_sha(self):
        site = {
            "name": "ms3",
            "siteId": "94717a39-679b-4c78-ae02-7b19e809592e",
            "baseUrl": "https://une-ms3-psychiatry.netlify.app",
        }
        deploys = [
            {
                "id": "wrong",
                "context": "production",
                "commit_ref": OTHER_SHA,
                "state": "ready",
                "created_at": "2026-09-23T20:00:00Z",
                "published_at": "2026-09-23T20:02:00Z",
                "deploy_ssl_url": "https://wrong.example",
            },
            {
                "id": "exact",
                "context": "production",
                "commit_ref": SHA,
                "state": "ready",
                "created_at": "2026-09-23T19:50:00Z",
                "published_at": "2026-09-23T19:53:39Z",
                "deploy_ssl_url": "https://main--une-ms3-psychiatry.netlify.app",
            },
        ]
        evidence = receipt.select_deploy_evidence(site, deploys, SHA)
        self.assertEqual(evidence["status"], "PASS")
        self.assertEqual(evidence["deployId"], "exact")
        self.assertEqual(evidence["commitRef"], SHA)

        deploys[1]["state"] = "error"
        evidence = receipt.select_deploy_evidence(site, deploys, SHA)
        self.assertEqual(evidence["status"], "FAIL")

        evidence = receipt.select_deploy_evidence(site, deploys[:1], SHA)
        self.assertEqual(evidence["status"], "UNKNOWN")
        self.assertIsNone(evidence["deployId"])

    def test_served_revision_must_match_the_requested_release_not_only_the_other_site(self):
        parity = {
            "schemaVersion": 1,
            "status": "matched",
            "observations": [
                {
                    "checkedAt": "2026-09-23T20:01:16+00:00",
                    "status": "matched",
                    "sites": [
                        {"name": "ms3", "revision": OTHER_SHA},
                        {"name": "res", "revision": OTHER_SHA},
                    ],
                }
            ],
        }
        self.assertEqual(receipt.served_revision_evidence(parity, SHA)["status"], "FAIL")
        for site in parity["observations"][0]["sites"]:
            site["revision"] = SHA
        exact = receipt.served_revision_evidence(parity, SHA)
        self.assertEqual(exact["status"], "PASS")
        self.assertEqual(exact["sites"]["ms3"], SHA)
        self.assertEqual(exact["sites"]["res"], SHA)


class CollectionWindowTests(unittest.TestCase):
    def test_accepts_an_hour_for_serialized_main_ci_to_reach_the_exact_sha(self):
        config = receipt.production_canary._load_config(
            receipt.production_canary.DEFAULT_CONFIG_PATH
        )
        parity = {
            "schemaVersion": 1,
            "status": "matched",
            "observations": [
                {
                    "checkedAt": "2026-09-24T14:35:00+00:00",
                    "status": "matched",
                    "sites": [
                        {"name": "ms3", "revision": SHA},
                        {"name": "res", "revision": SHA},
                    ],
                }
            ],
        }
        with (
            mock.patch.object(
                receipt.production_revision_parity,
                "check",
                return_value=parity,
            ),
            mock.patch.object(
                receipt.production_canary,
                "probe",
                return_value={"sites": []},
            ),
        ):
            core = receipt.collect_core_evidence(
                release_sha=SHA,
                repository=REPOSITORY,
                config=config,
                github_token=None,
                netlify_token=None,
                wait_seconds=3600,
            )

        self.assertEqual(core["releaseSha"], SHA)
        self.assertEqual(core["servedRevision"]["status"], "PASS")


class JourneyAndReceiptTests(unittest.TestCase):
    @staticmethod
    def _playwright_report(ms3_status="expected", res_status="expected", include_res=True):
        specs = [
            {
                "title": "MS3 release journey",
                "tests": [
                    {
                        "projectName": "release-ms3",
                        "expectedStatus": "passed",
                        "status": ms3_status,
                        "results": [{"status": "passed" if ms3_status == "expected" else "failed", "duration": 120}],
                    }
                ],
            }
        ]
        if include_res:
            specs.append(
                {
                    "title": "Resident release journey",
                    "tests": [
                        {
                            "projectName": "release-res",
                            "expectedStatus": "passed",
                            "status": res_status,
                            "results": [{"status": "passed" if res_status == "expected" else "failed", "duration": 130}],
                        }
                    ],
                }
            )
        return {"suites": [{"title": "production-release.spec.js", "specs": specs}]}

    def test_journeys_require_one_passing_result_for_each_learner_site(self):
        passed = receipt.summarize_playwright(self._playwright_report())
        self.assertEqual(passed["status"], "PASS")
        self.assertEqual(passed["passed"], 2)
        self.assertEqual(passed["projects"], ["release-ms3", "release-res"])

        missing = receipt.summarize_playwright(self._playwright_report(include_res=False))
        self.assertEqual(missing["status"], "UNKNOWN")
        self.assertEqual(missing["missingProjects"], ["release-res"])

        failed = receipt.summarize_playwright(self._playwright_report(res_status="unexpected"))
        self.assertEqual(failed["status"], "FAIL")
        self.assertEqual(failed["failed"], 1)

    def test_receipt_uses_fail_before_unknown_and_binds_every_group_to_the_sha(self):
        core = {
            "schemaVersion": 1,
            "releaseSha": SHA,
            "repository": REPOSITORY,
            "collectedAt": "2026-09-23T20:04:00+00:00",
            "ci": {"status": "PASS", "runId": 100, "url": "https://github.example/runs/100"},
            "deployments": {
                "status": "PASS",
                "sites": [
                    {"name": "ms3", "status": "PASS", "siteId": "site-ms3", "deployId": "deploy-ms3", "commitRef": SHA},
                    {"name": "res", "status": "PASS", "siteId": "site-res", "deployId": "deploy-res", "commitRef": SHA},
                ],
            },
            "servedRevision": {"status": "PASS", "sites": {"ms3": SHA, "res": SHA}},
            "staticCanary": {"status": "UNKNOWN", "error": "transport unavailable"},
        }
        journeys = receipt.summarize_playwright(self._playwright_report())
        combined = receipt.build_receipt(
            core,
            journeys,
            trigger="workflow_dispatch",
            generated_at="2026-09-23T20:05:00+00:00",
        )
        self.assertEqual(combined["status"], "UNKNOWN")
        self.assertRegex(combined["evidenceSha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(combined["releaseSha"], SHA)

        core["servedRevision"]["status"] = "FAIL"
        combined = receipt.build_receipt(
            core,
            journeys,
            trigger="push",
            generated_at="2026-09-23T20:05:00+00:00",
        )
        self.assertEqual(combined["status"], "FAIL")

    def test_markdown_names_ids_links_and_the_evidence_boundary(self):
        core = {
            "schemaVersion": 1,
            "releaseSha": SHA,
            "repository": REPOSITORY,
            "collectedAt": "2026-09-23T20:04:00+00:00",
            "ci": {"status": "PASS", "runId": 100, "url": "https://github.example/runs/100"},
            "deployments": {
                "status": "PASS",
                "sites": [
                    {"name": "ms3", "status": "PASS", "siteId": "site-ms3", "deployId": "deploy-ms3", "commitRef": SHA, "url": "https://ms3.example"},
                    {"name": "res", "status": "PASS", "siteId": "site-res", "deployId": "deploy-res", "commitRef": SHA, "url": "https://res.example"},
                ],
            },
            "servedRevision": {"status": "PASS", "sites": {"ms3": SHA, "res": SHA}},
            "staticCanary": {"status": "PASS", "sites": [{"name": "ms3", "mediaChecked": 50}, {"name": "res", "mediaChecked": 50}]},
        }
        combined = receipt.build_receipt(
            core,
            receipt.summarize_playwright(self._playwright_report()),
            trigger="push",
            generated_at="2026-09-23T20:05:00+00:00",
        )
        markdown = receipt.render_markdown(combined)
        self.assertIn("Production release verification: PASS", markdown)
        self.assertIn(SHA, markdown)
        self.assertIn("deploy-ms3", markdown)
        self.assertIn("deploy-res", markdown)
        self.assertIn("https://github.example/runs/100", markdown)
        self.assertIn("does not establish faculty approval", markdown)
        self.assertIn("native VoiceOver", markdown)


class PullRequestAttachmentTests(unittest.TestCase):
    def test_comment_is_created_once_then_updated_by_marker(self):
        calls = []
        comments = []

        def request_json(method, path, payload=None):
            calls.append((method, path, payload))
            if path.endswith(f"/commits/{SHA}/pulls?per_page=100"):
                return [
                    {
                        "number": 743,
                        "html_url": "https://github.example/pull/743",
                        "merged_at": "2026-09-23T19:50:00Z",
                        "merge_commit_sha": SHA,
                        "base": {"ref": "main"},
                    }
                ]
            if path.endswith("/issues/743/comments?per_page=100&page=1"):
                return list(comments)
            if method == "POST" and path.endswith("/issues/743/comments"):
                comments.append({"id": 55, "body": payload["body"]})
                return comments[-1]
            if method == "PATCH" and path.endswith("/issues/comments/55"):
                comments[0]["body"] = payload["body"]
                return comments[0]
            raise AssertionError((method, path, payload))

        minimal = {
            "schemaVersion": 1,
            "status": "PASS",
            "releaseSha": SHA,
            "generatedAt": "2026-09-23T20:05:00+00:00",
            "repository": REPOSITORY,
        }
        created = receipt.attach_receipt_comment(
            minimal,
            artifact_url="https://github.example/artifacts/1",
            run_url="https://github.example/actions/runs/1",
            request_json=request_json,
        )
        self.assertEqual(created["status"], "created")
        self.assertIn(receipt.COMMENT_MARKER_PREFIX + SHA, comments[0]["body"])
        self.assertIn("https://github.example/artifacts/1", comments[0]["body"])

        updated = receipt.attach_receipt_comment(
            {**minimal, "status": "FAIL"},
            artifact_url="https://github.example/artifacts/2",
            run_url="https://github.example/actions/runs/2",
            request_json=request_json,
        )
        self.assertEqual(updated["status"], "updated")
        self.assertEqual(len(comments), 1)
        self.assertIn("FAIL", comments[0]["body"])
        self.assertIn("https://github.example/artifacts/2", comments[0]["body"])

    def test_no_exact_merged_pr_is_non_applicable_not_a_false_attachment(self):
        def request_json(method, path, payload=None):
            del method, payload
            if path.endswith(f"/commits/{SHA}/pulls?per_page=100"):
                return [{
                    "number": 700,
                    "merged_at": None,
                    "merge_commit_sha": SHA,
                    "base": {"ref": "main"},
                }]
            raise AssertionError(path)

        result = receipt.attach_receipt_comment(
            {
                "schemaVersion": 1,
                "status": "PASS",
                "releaseSha": SHA,
                "generatedAt": "2026-09-23T20:05:00+00:00",
                "repository": REPOSITORY,
            },
            artifact_url="https://github.example/artifacts/1",
            run_url="https://github.example/actions/runs/1",
            request_json=request_json,
        )
        self.assertEqual(result["status"], "not_applicable")

    def test_existing_marker_on_a_later_comment_page_is_updated_without_duplicate(self):
        calls = []

        def request_json(method, path, payload=None):
            calls.append((method, path, payload))
            if path.endswith(f"/commits/{SHA}/pulls?per_page=100"):
                return [{
                    "number": 743,
                    "html_url": "https://github.example/pull/743",
                    "merged_at": "2026-09-23T19:50:00Z",
                    "merge_commit_sha": SHA,
                    "base": {"ref": "main"},
                }]
            if path.endswith("/issues/743/comments?per_page=100&page=1"):
                return [{"id": number, "body": f"ordinary comment {number}"} for number in range(1, 101)]
            if path.endswith("/issues/743/comments?per_page=100&page=2"):
                return [{"id": 101, "body": receipt.COMMENT_MARKER_PREFIX + SHA + " -->\nold"}]
            if method == "PATCH" and path.endswith("/issues/comments/101"):
                return {"id": 101, "body": payload["body"]}
            raise AssertionError((method, path, payload))

        result = receipt.attach_receipt_comment(
            {
                "schemaVersion": 1,
                "status": "PASS",
                "releaseSha": SHA,
                "generatedAt": "2026-09-23T20:05:00+00:00",
                "repository": REPOSITORY,
            },
            artifact_url="https://github.example/artifacts/2",
            run_url="https://github.example/actions/runs/2",
            request_json=request_json,
        )
        self.assertEqual(result["status"], "updated")
        self.assertEqual(
            [call[1] for call in calls if call[0] == "POST"],
            [],
            "finding the marker on page two must not create a duplicate comment",
        )


class CliArtifactTests(unittest.TestCase):
    def test_finalize_writes_json_markdown_and_exact_json_digest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            core_path = root / "core.json"
            journey_path = root / "journeys.json"
            json_path = root / "receipt.json"
            markdown_path = root / "receipt.md"
            digest_path = root / "receipt.json.sha256"
            core_path.write_text(json.dumps({
                "schemaVersion": 1,
                "releaseSha": SHA,
                "repository": REPOSITORY,
                "collectedAt": "2026-09-23T20:04:00+00:00",
                "ci": {"status": "PASS", "runId": 100},
                "deployments": {"status": "PASS", "sites": []},
                "servedRevision": {"status": "PASS", "sites": {"ms3": SHA, "res": SHA}},
                "staticCanary": {"status": "PASS", "sites": []},
            }), encoding="utf-8")
            journey_path.write_text(json.dumps(JourneyAndReceiptTests._playwright_report()), encoding="utf-8")

            exit_code = receipt.main([
                "finalize",
                "--core", str(core_path),
                "--journeys", str(journey_path),
                "--trigger", "workflow_dispatch",
                "--json-out", str(json_path),
                "--markdown-out", str(markdown_path),
                "--digest-out", str(digest_path),
                "--generated-at", "2026-09-23T20:05:00+00:00",
            ])
            self.assertEqual(exit_code, 0)
            written = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(written["status"], "PASS")
            expected_digest = receipt.sha256(json_path.read_bytes()).hexdigest()
            self.assertEqual(digest_path.read_text(encoding="utf-8").split()[0], expected_digest)
            self.assertIn("Production release verification: PASS", markdown_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
