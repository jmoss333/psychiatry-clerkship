import copy
import json
import sys
import tempfile
import unittest
from datetime import date, datetime, timezone
from hashlib import sha256
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
AUTOMATION = ROOT / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))

from maintenance.monthly_review import (
    MonthlyReviewError,
    _utc_today,
    build_monthly_review,
    render_monthly_markdown,
)


class MonthlyReviewTests(unittest.TestCase):
    def setUp(self):
        self._temp = tempfile.TemporaryDirectory()
        self.root = Path(self._temp.name)
        (self.root / "docs").mkdir()
        (self.root / "receipts").mkdir()
        (self.root / "_prototypes" / "sp-interview").mkdir(parents=True)
        (self.root / "docs" / "runbook.md").write_text(
            "Synthetic operations runbook",
            encoding="utf-8",
        )
        self.pack_bytes = b'{"version":"1.0.0","engine":{"modelPinned":"fixture-model"}}'
        (
            self.root / "_prototypes" / "sp-interview" / "sp-interview.pack.json"
        ).write_bytes(self.pack_bytes)
        self.registry = {
            "schemaVersion": 2,
            "owner": "Synthetic Faculty Reviewer",
            "usageNotice": "fixture",
            "updated": "2026-07-01",
            "surveillance": {},
            "sources": [
                {
                    "id": "due-source",
                    "citation": {
                        "title": "PRIVATE CITATION TEXT MUST NOT LEAK",
                        "attachmentPath": "/private/licensed/article.pdf",
                    },
                    "identity": {"status": "pending"},
                    "governance": {
                        "facultyReviewStatus": "reviewed",
                        "lastReviewed": "2026-06-15",
                        "reviewCadence": "monthly",
                        "localPolicyDependent": True,
                    },
                },
                {
                    "id": "overdue-source",
                    "citation": {"title": "Second private citation"},
                    "identity": {"status": "verified"},
                    "governance": {
                        "facultyReviewStatus": "pending",
                        "lastReviewed": "2025-07-14",
                        "reviewCadence": "annual",
                        "localPolicyDependent": False,
                    },
                },
                {
                    "id": "current-source",
                    "citation": {"title": "Third private citation"},
                    "identity": {"status": "exception"},
                    "governance": {
                        "facultyReviewStatus": "reviewed",
                        "lastReviewed": "2026-07-01",
                        "reviewCadence": "monthly",
                    },
                },
                {
                    "id": "unknown-source",
                    "citation": {"title": "Fourth private citation"},
                    "identity": {},
                    "governance": {},
                },
            ],
        }
        self.media = {
            "_note": "fixture",
            "audio": [
                {
                    "file": "audio_oe/existing.m4a",
                    "served": True,
                    "captions": False,
                    "textAlt": None,
                }
            ],
            "video": [],
        }
        self.write_json("evidence_registry.json", self.registry)
        self.write_json("media_manifest.json", self.media)
        self.config = {
            "operationalDocs": [{"path": "docs/runbook.md", "maxAgeDays": 30}],
            "accessibilityDebtBaseline": ["audio_oe/existing.m4a"],
            "receipts": {
                "openEvidence": {
                    "path": "receipts/openevidence.json",
                    "maxAgeDays": 35,
                },
                "redTeam": {"path": "receipts/red-team.json"},
            },
            "apaCrosswalk": "metadata/library_crosswalk.csv",
            "evidenceGeneratedViewsValid": True,
        }
        self.git_calls = []
        self.git_dates = {
            "docs/runbook.md": "2026-07-01T12:00:00+00:00",
            "_prototypes/sp-interview/sp-interview.pack.json": (
                "2026-07-01T12:00:00+00:00"
            ),
        }

    def tearDown(self):
        self._temp.cleanup()

    def write_json(self, relative_path, value):
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")

    def git_last_changed(self, argv):
        self.git_calls.append(list(argv))
        return self.git_dates.get(argv[-1])

    def build_report(self, *, config=None):
        return build_monthly_review(
            self.root,
            copy.deepcopy(config or self.config),
            date(2026, 7, 15),
            self.git_last_changed,
        )

    def test_existing_accessibility_debt_is_review_only_but_new_debt_blocks(self):
        self.media["audio"].append(
            {
                "file": "audio_oe/new.m4a",
                "served": True,
                "captions": False,
                "textAlt": None,
            }
        )
        self.write_json("media_manifest.json", self.media)
        report = self.build_report()
        self.assertEqual(report["media"]["existingDebt"], ["audio_oe/existing.m4a"])
        self.assertEqual(report["media"]["newRegressions"], ["audio_oe/new.m4a"])
        self.assertEqual(report["gate"], "blocked")

    def test_accessible_and_unserved_media_are_not_debt(self):
        self.media["audio"].extend(
            [
                {
                    "file": "audio_oe/transcript.m4a",
                    "served": True,
                    "transcript": "content-free transcript record",
                },
                {
                    "file": "audio_oe/text-alt.m4a",
                    "served": True,
                    "textAlt": "recorded",
                },
                {
                    "file": "audio_oe/not-served.m4a",
                    "served": False,
                    "textAlt": None,
                },
            ]
        )
        self.write_json("media_manifest.json", self.media)
        report = self.build_report()
        self.assertEqual(report["media"]["servedMissingCount"], 1)
        self.assertEqual(report["media"]["newRegressions"], [])

    def test_evidence_identity_review_cadence_and_local_policy_are_counts_only(self):
        report = self.build_report()
        self.assertEqual(
            report["evidence"],
            {
                "total": 4,
                "identity": {
                    "verified": 1,
                    "pending": 1,
                    "exception": 1,
                    "unknown": 1,
                },
                "facultyReview": {"reviewed": 2, "pending": 1, "unknown": 1},
                "cadence": {"current": 1, "due": 1, "overdue": 1, "unknown": 1},
                "localPolicyDependent": 1,
                "generatedViewsValid": True,
            },
        )
        self.assertEqual(report["gate"], "review")

    def test_generated_evidence_view_failure_is_blocking(self):
        config = copy.deepcopy(self.config)
        config["evidenceGeneratedViewsValid"] = False
        report = self.build_report(config=config)
        self.assertEqual(report["evidence"]["generatedViewsValid"], False)
        self.assertEqual(report["gate"], "blocked")

    def test_runbook_git_argv_is_exact_and_staleness_is_counted(self):
        report = self.build_report()
        self.assertIn(
            ["git", "log", "-1", "--format=%cI", "--", "docs/runbook.md"],
            self.git_calls,
        )
        self.assertEqual(
            report["operations"]["runbooks"],
            {"total": 1, "current": 1, "stale": 0, "unknown": 0},
        )

        self.git_dates["docs/runbook.md"] = "2026-05-01T12:00:00+00:00"
        report = self.build_report()
        self.assertEqual(report["operations"]["runbooks"]["stale"], 1)
        self.assertEqual(report["gate"], "review")

    def test_missing_runbook_is_unknown_even_when_git_has_history(self):
        (self.root / "docs" / "runbook.md").unlink()
        report = self.build_report()
        self.assertEqual(
            report["operations"]["runbooks"],
            {"total": 1, "current": 0, "stale": 0, "unknown": 1},
        )
        self.assertEqual(report["gate"], "review")

    def test_future_evidence_and_receipt_timestamps_fail_closed(self):
        self.registry["sources"][2]["governance"]["lastReviewed"] = "2026-07-16"
        self.write_json("evidence_registry.json", self.registry)
        self.git_dates["docs/runbook.md"] = "2026-07-16T00:00:00+00:00"
        self.write_json(
            "receipts/openevidence.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-16T00:00:00+00:00",
                "state": "success",
            },
        )
        self.write_json(
            "receipts/red-team.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-16T00:00:00+00:00",
                "state": "passed",
                "packSha256": sha256(self.pack_bytes).hexdigest(),
            },
        )

        report = self.build_report()

        self.assertEqual(
            report["evidence"]["cadence"],
            {"current": 0, "due": 1, "overdue": 1, "unknown": 2},
        )
        self.assertEqual(
            report["operations"]["runbooks"],
            {"total": 1, "current": 0, "stale": 0, "unknown": 1},
        )
        self.assertEqual(report["operations"]["openEvidenceReceipt"], "invalid")
        self.assertEqual(report["operations"]["redTeamReceipt"], "invalid")
        self.assertEqual(report["gate"], "review")

    def test_future_sp_pack_git_timestamp_is_not_treated_as_known_recency(self):
        self.git_dates[
            "_prototypes/sp-interview/sp-interview.pack.json"
        ] = "2026-07-16T00:00:00+00:00"
        self.write_json(
            "receipts/red-team.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-14T00:00:00+00:00",
                "state": "passed",
                "packSha256": sha256(self.pack_bytes).hexdigest(),
            },
        )
        report = self.build_report()
        self.assertEqual(
            report["operations"]["redTeamReceipt"],
            "unknown_pack_change",
        )

    def test_symlinked_receipt_cannot_escape_repository_root(self):
        with tempfile.TemporaryDirectory() as outside:
            outside_receipt = Path(outside) / "openevidence.json"
            outside_receipt.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "checkedAt": "2026-07-14T00:00:00+00:00",
                        "state": "success",
                    }
                ),
                encoding="utf-8",
            )
            (self.root / "receipts" / "openevidence.json").symlink_to(
                outside_receipt
            )
            with self.assertRaisesRegex(MonthlyReviewError, "repository"):
                self.build_report()

    def test_cli_clock_uses_utc_date(self):
        class FakeDateTime:
            @classmethod
            def now(cls, tz):
                self.assertIs(tz, timezone.utc)
                return datetime(2026, 7, 29, 0, 5, tzinfo=timezone.utc)

        with mock.patch(
            "maintenance.monthly_review.datetime",
            FakeDateTime,
        ):
            self.assertEqual(_utc_today(), date(2026, 7, 29))

    def test_missing_apa_and_absent_or_old_openevidence_are_review_items(self):
        report = self.build_report()
        self.assertFalse(report["operations"]["apaCrosswalkPresent"])
        self.assertEqual(report["operations"]["openEvidenceReceipt"], "missing")

        self.write_json(
            "receipts/openevidence.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-05-01T00:00:00+00:00",
                "state": "success",
                "credential": "super-secret-value",
            },
        )
        report = self.build_report()
        self.assertEqual(report["operations"]["openEvidenceReceipt"], "stale")
        self.assertEqual(report["gate"], "review")

    def test_expected_sp_hash_changes_and_red_team_recency_use_pack_git_time(self):
        pack_hash = sha256(self.pack_bytes).hexdigest()
        model_hash = sha256(b"fixture-model").hexdigest()
        self.write_json(
            "receipts/red-team.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-02T12:00:00+00:00",
                "state": "passed",
                "packSha256": "0" * 64,
                "passcode": "super-secret-value",
            },
        )
        report = self.build_report()
        self.assertEqual(
            report["expectedSp"],
            {"packSha256": pack_hash, "modelSha256": model_hash},
        )
        self.assertEqual(report["operations"]["redTeamReceipt"], "pack_mismatch")
        self.assertIn(
            [
                "git",
                "log",
                "-1",
                "--format=%cI",
                "--",
                "_prototypes/sp-interview/sp-interview.pack.json",
            ],
            self.git_calls,
        )

        self.write_json(
            "receipts/red-team.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-06-30T12:00:00+00:00",
                "state": "passed",
                "packSha256": pack_hash,
            },
        )
        report = self.build_report()
        self.assertEqual(report["operations"]["redTeamReceipt"], "stale")

        self.write_json(
            "receipts/red-team.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-02T12:00:00+00:00",
                "state": "passed",
                "packSha256": pack_hash,
            },
        )
        report = self.build_report()
        self.assertEqual(report["operations"]["redTeamReceipt"], "current")

    def test_output_is_deterministic_content_free_and_makes_no_deploy_claim(self):
        first = self.build_report()
        second = self.build_report()
        self.assertEqual(first, second)
        serialized = json.dumps(first, sort_keys=True)
        forbidden = (
            "PRIVATE CITATION TEXT",
            "/private/licensed/article.pdf",
            "Synthetic Faculty Reviewer",
            "super-secret-value",
        )
        for value in forbidden:
            self.assertNotIn(value, serialized)
        self.assertNotIn("deployRecency", serialized)
        self.assertNotIn("attachment", serialized.lower())
        markdown = render_monthly_markdown(first)
        self.assertIn("does not assess authenticated Netlify deploy recency", markdown)

    def test_operational_and_receipt_paths_must_be_safe_relative_paths(self):
        unsafe = (
            "/absolute/runbook.md",
            "../escape.md",
            "docs/runbook.md?query=1",
            "docs/runbook.md#fragment",
        )
        for path in unsafe:
            with self.subTest(path=path):
                config = copy.deepcopy(self.config)
                config["operationalDocs"][0]["path"] = path
                with self.assertRaises(MonthlyReviewError):
                    self.build_report(config=config)


if __name__ == "__main__":
    unittest.main()
