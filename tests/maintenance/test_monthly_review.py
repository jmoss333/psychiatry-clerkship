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
# Imported explicitly rather than leaning on monthly_review putting bin/ on the path:
# the cross-tool test's whole value is comparing two modules, so it must name both.
sys.path.insert(0, str(ROOT / "bin"))

import check_review_cadence

import maintenance.monthly_review as monthly_review
from maintenance.monthly_review import (
    MonthlyReviewError,
    _utc_today,
    build_monthly_review,
    render_monthly_markdown,
)

SURVEILLANCE_HISTORY = Path("13_Faculty_Resources/_automation/surveillance/history")


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
                "rulesetBypass": {
                    "path": "receipts/ruleset-bypass.json",
                    "maxAgeDays": 35,
                },
                "staleClaims": {
                    "path": "receipts/stale-claims.json",
                    "maxAgeDays": 35,
                },
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

    def write_baseline(self, source_id, checked_at):
        """A successful examination on the surveillance job's own record."""
        path = self.root / SURVEILLANCE_HISTORY / "baselines" / f"{source_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"checked_at": checked_at}), encoding="utf-8")

    def write_delta(self, stamp, findings):
        path = self.root / SURVEILLANCE_HISTORY / f"guideline_delta_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(findings), encoding="utf-8")

    def surveil(self, source_id):
        """Declare a fixture source as run by the credited surveillance job."""
        for source in self.registry["sources"]:
            if source["id"] == source_id:
                source["surveillance"] = {"job": "guideline-surveillance"}
        self.write_json("evidence_registry.json", self.registry)

    def cadence_tool_counts(self, today=date(2026, 7, 15)):
        """The same registry, judged by bin/check_review_cadence.py itself.

        Its six buckets collapse to this report's four: due-30d and due-90d are
        lookahead queues, which the monthly report has never had and does not gain
        here -- they are simply not yet due, i.e. current.
        """
        sources = json.loads(
            (self.root / "evidence_registry.json").read_text(encoding="utf-8")
        )["sources"]
        surveillance = check_review_cadence.load_surveillance(
            self.root / SURVEILLANCE_HISTORY
        )
        report = check_review_cadence.examine(sources, today, surveillance)
        counts = report["counts"]
        return {
            "current": counts["current"] + counts["due-30d"] + counts["due-90d"],
            "due": counts["due"],
            "overdue": counts["overdue"],
            "unknown": counts["unknown"],
        }

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
                "surveillanceCredit": {
                    "historyPresent": False,
                    "baselines": 0,
                    "openChangeFindings": 0,
                    "sourcesCredited": 0,
                },
            },
        )
        self.assertEqual(report["gate"], "review")

    def test_green_surveillance_examination_counts_as_the_review(self):
        """The 2026-09-19 policy, as this gate now sees it.

        `due-source` is due today on the faculty date alone. A successful examination
        on 2026-07-10 -- the surveillance job's own record, not a stamp anyone wrote --
        moves the effective review forward, so the next one falls 2026-08-10.
        """
        self.surveil("due-source")
        self.write_baseline("due-source", "2026-07-10T06:08:48+00:00")

        report = self.build_report()

        self.assertEqual(
            report["evidence"]["cadence"],
            {"current": 2, "due": 0, "overdue": 1, "unknown": 1},
        )
        self.assertEqual(
            report["evidence"]["surveillanceCredit"],
            {
                "historyPresent": True,
                "baselines": 1,
                "openChangeFindings": 0,
                "sourcesCredited": 1,
            },
        )

    def test_an_unactioned_change_finding_withholds_credit(self):
        """A detected change is exactly where a person must look, so the gate waits."""
        self.surveil("due-source")
        self.write_baseline("due-source", "2026-07-10T06:08:48+00:00")
        self.write_delta(
            "2026-07-10",
            [
                {
                    "source_id": "due-source",
                    "change_type": "modified",
                    "detected_at": "2026-07-10T06:08:48+00:00",
                    "status": "new",
                    "severity": "P2",
                    "fingerprint": "fp-due-source-1",
                }
            ],
        )

        report = self.build_report()

        self.assertEqual(
            report["evidence"]["cadence"],
            {"current": 1, "due": 1, "overdue": 1, "unknown": 1},
        )
        credit = report["evidence"]["surveillanceCredit"]
        self.assertEqual(credit["sourcesCredited"], 0)
        self.assertEqual(credit["openChangeFindings"], 1)

    def test_a_baseline_alone_never_credits_a_source_the_job_does_not_run(self):
        """Credit is gated on the registry declaring the job, not on a file existing.

        Without this, dropping a stray `<id>.json` into the history directory would
        silently retire a source's review.
        """
        self.write_baseline("due-source", "2026-07-10T06:08:48+00:00")

        report = self.build_report()

        self.assertEqual(
            report["evidence"]["cadence"],
            {"current": 1, "due": 1, "overdue": 1, "unknown": 1},
        )
        credit = report["evidence"]["surveillanceCredit"]
        self.assertEqual(credit["baselines"], 1)
        self.assertEqual(credit["sourcesCredited"], 0)

    def test_absent_surveillance_history_is_named_and_credits_nothing(self):
        """No record is reported as no record -- never as a clean examination."""
        self.surveil("due-source")

        report = self.build_report()

        self.assertEqual(
            report["evidence"]["surveillanceCredit"],
            {
                "historyPresent": False,
                "baselines": 0,
                "openChangeFindings": 0,
                "sourcesCredited": 0,
            },
        )
        self.assertEqual(
            report["evidence"]["cadence"],
            {"current": 1, "due": 1, "overdue": 1, "unknown": 1},
        )
        self.assertIn(
            '"historyPresent": false',
            render_monthly_markdown(report),
        )

    def test_monthly_cadence_can_never_disagree_with_the_cadence_tool(self):
        """WS-7's real contract: the gate and the work list are one judgement.

        Checked across the three states that matter -- no surveillance at all, a green
        examination, and an examination with an unactioned change -- because agreement
        on a single fixture is the easiest kind of accident.
        """
        scenarios = {"no surveillance record": lambda: None}

        def credited():
            self.surveil("due-source")
            self.write_baseline("due-source", "2026-07-10T06:08:48+00:00")

        def withheld():
            credited()
            self.write_delta(
                "2026-07-10",
                [
                    {
                        "source_id": "due-source",
                        "change_type": "modified",
                        "detected_at": "2026-07-10T06:08:48+00:00",
                        "status": "new",
                        "severity": "P2",
                        "fingerprint": "fp-due-source-1",
                    }
                ],
            )

        scenarios["green examination"] = credited
        scenarios["unactioned change"] = withheld

        for name, arrange in scenarios.items():
            with self.subTest(scenario=name):
                arrange()
                report = self.build_report()
                self.assertEqual(
                    report["evidence"]["cadence"],
                    self.cadence_tool_counts(),
                )

    def test_an_unavailable_shared_credit_rule_is_a_hard_error(self):
        """Fail closed. A faculty-only fallback is stricter, and so looks harmless --
        but it is the silent contradiction this work exists to remove, and it would
        render as an ordinary `review` gate with nothing naming the cause."""
        with mock.patch.object(
            monthly_review,
            "_CREDIT_IMPORT_ERROR",
            ImportError("no module named check_review_cadence"),
        ):
            with self.assertRaises(MonthlyReviewError) as caught:
                self.build_report()
        self.assertIn("check_review_cadence", str(caught.exception))

    def test_the_credit_summary_never_counts_the_rules_own_meta_entry(self):
        """Forward-compatible with the richer map the shared rule is growing.

        `load_surveillance` returns a `_meta` entry alongside the per-source records to
        carry its own coverage line. Nothing on main emits one yet, so without this test
        the exclusion would be an untested branch that silently inflates every figure the
        day it starts arriving -- a vacuous guard, which is worse than no guard.
        """
        summary = monthly_review._credit_summary(
            {
                "real-source": {
                    "examinedAt": date(2026, 7, 10),
                    "openChanges": [{"detectedAt": "2026-07-10"}],
                },
                "_meta": {
                    "baselines": 99,
                    "examinedAt": "2026-07-10",
                    "openChanges": [{"detectedAt": "2026-07-10"}],
                },
            },
            True,
            1,
        )
        self.assertEqual(
            summary,
            {
                "historyPresent": True,
                "baselines": 1,
                "openChangeFindings": 1,
                "sourcesCredited": 1,
            },
        )

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

    def test_ruleset_bypass_receipt_ages_and_is_a_review_item(self):
        """The bypass list cannot be checked from Actions -- GitHub returns
        bypass_actors only to a caller with ruleset WRITE access. This receipt's
        freshness is therefore the only signal that a human ran
        `check_ruleset_drift.py --check-bypass`, so an absent or stale one must
        surface as a review item rather than passing quietly."""
        report = self.build_report()
        self.assertEqual(report["operations"]["rulesetBypassReceipt"], "missing")
        self.assertEqual(report["gate"], "review")

        # Fresh: verified five days before the review runs (fixture date 2026-07-15).
        self.write_json(
            "receipts/ruleset-bypass.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-10T00:00:00+00:00",
                "state": "success",
                "actorCount": 1,
                "bypassSha256": "0" * 64,
            },
        )
        self.assertEqual(
            self.build_report()["operations"]["rulesetBypassReceipt"], "current"
        )

        # Older than maxAgeDays: nobody has looked in over a month.
        self.write_json(
            "receipts/ruleset-bypass.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-05-01T00:00:00+00:00",
                "state": "success",
                "actorCount": 1,
                "bypassSha256": "0" * 64,
            },
        )
        report = self.build_report()
        self.assertEqual(report["operations"]["rulesetBypassReceipt"], "stale")
        self.assertEqual(report["gate"], "review")

        # A receipt that did not record success is not evidence of anything.
        self.write_json(
            "receipts/ruleset-bypass.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-10T00:00:00+00:00",
                "state": "drifted",
            },
        )
        self.assertEqual(
            self.build_report()["operations"]["rulesetBypassReceipt"], "failed"
        )

        # A receipt dated after the review is not trustworthy either.
        self.write_json(
            "receipts/ruleset-bypass.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-08-01T00:00:00+00:00",
                "state": "success",
            },
        )
        self.assertEqual(
            self.build_report()["operations"]["rulesetBypassReceipt"], "invalid"
        )

    def test_stale_claims_receipt_ages_and_is_a_review_item(self):
        """The stale-claims sweep needs `gh`, `npm audit --include=dev` and every
        local worktree, none of which exist on a fresh Actions runner -- a runner
        would report a confident clean sweep of nothing. So, exactly like the ruleset
        bypass list, this receipt's freshness is the only signal that a human ran
        `bin/check_stale_claims.py --write-receipt`, and an absent or stale one must
        surface as a review item rather than passing quietly."""
        report = self.build_report()
        self.assertEqual(report["operations"]["staleClaimsReceipt"], "missing")
        self.assertEqual(report["gate"], "review")

        # Fresh: swept five days before the review runs (fixture date 2026-07-15).
        self.write_json(
            "receipts/stale-claims.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-10T00:00:00+00:00",
                "state": "success",
                "skillFilesScanned": 2,
                "suppressedBlocks": 1,
                "manifestsAudited": 4,
                "branchesScanned": 107,
                "worktreesScanned": 33,
            },
        )
        self.assertEqual(
            self.build_report()["operations"]["staleClaimsReceipt"], "current"
        )

        # Older than maxAgeDays: a quarter of silent decay is exactly the window
        # that let `clerkship-deploy` trap 3 mislead every session for two months.
        self.write_json(
            "receipts/stale-claims.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-05-01T00:00:00+00:00",
                "state": "success",
                "skillFilesScanned": 2,
                "suppressedBlocks": 1,
                "manifestsAudited": 4,
                "branchesScanned": 107,
                "worktreesScanned": 33,
            },
        )
        report = self.build_report()
        self.assertEqual(report["operations"]["staleClaimsReceipt"], "stale")
        self.assertEqual(report["gate"], "review")

        # check_stale_claims.py writes a receipt ONLY on a clean run, so a receipt
        # that did not record success cannot be evidence of a clean sweep.
        self.write_json(
            "receipts/stale-claims.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-07-10T00:00:00+00:00",
                "state": "findings",
            },
        )
        self.assertEqual(
            self.build_report()["operations"]["staleClaimsReceipt"], "failed"
        )

        # A receipt dated after the review is not trustworthy either.
        self.write_json(
            "receipts/stale-claims.json",
            {
                "schemaVersion": 1,
                "checkedAt": "2026-08-01T00:00:00+00:00",
                "state": "success",
            },
        )
        self.assertEqual(
            self.build_report()["operations"]["staleClaimsReceipt"], "invalid"
        )

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
