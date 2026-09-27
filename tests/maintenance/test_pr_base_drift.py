"""Pins the read-only PR base-drift advisory and its least-privilege workflow."""

import importlib
import json
import sys
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))
try:
    drift = importlib.import_module("maintenance.pr_base_drift")
except ModuleNotFoundError:
    drift = None
from maintenance.validate_scheduled_workflows import PINNED_ACTIONS

WORKFLOW = ROOT / ".github" / "workflows" / "pr-base-drift.yml"


class Response:
    def __init__(self, payload=None, *, status=200):
        self.raw = json.dumps(payload).encode("utf-8")
        self.status = status
        self.closed = False

    def read(self, limit):
        return self.raw

    def close(self):
        self.closed = True


class Opener:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.requests = []

    def open(self, request, *, timeout):
        self.requests.append((request, timeout))
        return next(self.responses)


def report(verdict, *, conflicts=False, behind=0, material=None):
    return {
        "verdict": verdict,
        "mergeConflicts": conflicts,
        "commitsBehindBase": behind,
        "materialDivergence": list(material or []),
        "alreadyOnBase": ["page.md"] if verdict == "SUPERSEDED" else [],
    }


class DecisionTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(drift, "the base-drift advisory module must exist")

    def test_conflict_is_neutral_and_explicitly_advisory(self):
        output = drift.build_check_output(report("DIVERGENT", conflicts=True, behind=4))
        self.assertEqual(output["conclusion"], "neutral")
        self.assertEqual(output["title"], "Merge conflict with main")
        self.assertIn("advisory", output["summary"].lower())
        self.assertIn("4 commits", output["summary"])

    def test_clean_material_drift_is_neutral_and_names_bounded_paths(self):
        paths = [f"tests/file-{n}.test.mjs" for n in range(20)]
        output = drift.build_check_output(report("DIVERGENT", behind=2, material=paths))
        self.assertEqual(output["conclusion"], "neutral")
        self.assertEqual(output["title"], "Base drift touches this PR's files or tests")
        self.assertIn("tests/file-0.test.mjs", output["text"])
        self.assertNotIn("tests/file-19.test.mjs", output["text"])
        self.assertIn("more", output["text"])

    def test_stale_without_material_overlap_stays_successful(self):
        output = drift.build_check_output(report("STALE", behind=7))
        self.assertEqual(output["conclusion"], "success")
        self.assertEqual(output["title"], "Mergeable; 7 commits behind main")
        self.assertNotIn("safe to merge", output["summary"].lower())

    def test_current_is_success_and_superseded_is_neutral(self):
        current = drift.build_check_output(report("CURRENT"))
        superseded = drift.build_check_output(report("SUPERSEDED", behind=3))
        self.assertEqual(current["conclusion"], "success")
        self.assertEqual(current["title"], "Current with main")
        self.assertEqual(superseded["conclusion"], "neutral")
        self.assertEqual(superseded["title"], "Changes may already be on main")

    def test_untrusted_paths_cannot_inject_markdown_or_control_characters(self):
        output = drift.build_check_output(
            report("DIVERGENT", material=["bad\n## forged", "tick`path", "x" * 400])
        )
        self.assertNotIn("\n## forged", output["text"])
        self.assertNotIn("tick`path", output["text"])
        self.assertLess(len(output["text"]), 1000)


class APITests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(drift, "the base-drift advisory module must exist")

    def test_open_pull_listing_is_get_only_paginated_and_bounded(self):
        first = [
            {"number": n + 1, "state": "open", "base": {"ref": "main"},
             "head": {"sha": f"{n + 1:040x}"}}
            for n in range(100)
        ]
        second = [
            {"number": 101, "state": "open", "base": {"ref": "main"},
             "head": {"sha": "f" * 40}}
        ]
        pages = [Response(first), Response(second)]
        opener = Opener(*pages)
        pulls = drift.fetch_open_pulls("owner/repo", "token", opener=opener)
        self.assertEqual(len(pulls), 101)
        self.assertTrue(all(page.closed for page in pages))
        self.assertEqual([request.get_method() for request, _ in opener.requests], ["GET", "GET"])
        self.assertTrue(opener.requests[0][0].full_url.endswith("state=open&base=main&per_page=100&page=1"))
        self.assertTrue(opener.requests[1][0].full_url.endswith("state=open&base=main&per_page=100&page=2"))

    def test_invalid_or_oversized_pull_inventory_fails_closed(self):
        bad = {"number": 1, "state": "open", "base": {"ref": "main"},
               "head": {"sha": "not-a-sha"}}
        with self.assertRaises(drift.DriftError):
            drift.fetch_open_pulls("owner/repo", "token", opener=Opener(Response([bad])))

        full = [
            {"number": n + 1, "state": "open", "base": {"ref": "main"},
             "head": {"sha": f"{n + 1:040x}"}}
            for n in range(100)
        ]
        with self.assertRaises(drift.DriftError):
            drift.fetch_open_pulls(
                "owner/repo", "token", opener=Opener(Response(full), Response(full), Response([full[0]]))
            )

    def test_upsert_updates_latest_matching_check_without_comments(self):
        existing = Response({"total_count": 1, "check_runs": [{"id": 42, "name": drift.CHECK_NAME}]})
        updated = Response({"id": 42})
        opener = Opener(existing, updated)
        drift.upsert_check(
            "owner/repo", "a" * 40, 7,
            {"conclusion": "neutral", "title": "Merge conflict with main",
             "summary": "Advisory only.", "text": "Update the branch."},
            "token", opener=opener, completed_at="2026-09-27T12:00:00Z",
        )
        first, second = [request for request, _ in opener.requests]
        self.assertEqual(first.get_method(), "GET")
        self.assertIn("/commits/", first.full_url)
        self.assertEqual(second.get_method(), "PATCH")
        self.assertTrue(second.full_url.endswith("/check-runs/42"))
        self.assertNotIn("comments", second.full_url)
        body = json.loads(second.data)
        self.assertEqual(body["conclusion"], "neutral")
        self.assertEqual(body["external_id"], "pr-base-drift:7")

    def test_upsert_creates_when_no_prior_check_exists(self):
        opener = Opener(Response({"total_count": 0, "check_runs": []}), Response({"id": 99}))
        drift.upsert_check(
            "owner/repo", "b" * 40, 8,
            {"conclusion": "success", "title": "Current with main",
             "summary": "No drift.", "text": ""},
            "token", opener=opener, completed_at="2026-09-27T12:00:00Z",
        )
        create = opener.requests[1][0]
        self.assertEqual(create.get_method(), "POST")
        self.assertTrue(create.full_url.endswith("/check-runs"))
        body = json.loads(create.data)
        self.assertEqual(body["head_sha"], "b" * 40)
        self.assertEqual(body["name"], drift.CHECK_NAME)


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(WORKFLOW.is_file(), "the base-drift workflow must exist")
        self.document = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
        self.triggers = self.document.get("on", self.document.get(True))

    def test_main_moves_and_manual_refresh_are_the_only_triggers(self):
        self.assertEqual(set(self.triggers), {"push", "workflow_dispatch"})
        self.assertEqual(self.triggers["push"]["branches"], ["main"])
        self.assertNotIn("pull_request_target", self.triggers)

    def test_permissions_are_read_only_except_advisory_checks(self):
        self.assertEqual(
            self.document["permissions"],
            {"contents": "read", "pull-requests": "read", "checks": "write"},
        )

    def test_workflow_runs_the_trusted_reporter_without_branch_mutation(self):
        steps = self.document["jobs"]["base-drift"]["steps"]
        checkout = [step for step in steps if str(step.get("uses", "")).startswith("actions/checkout@")]
        self.assertEqual(len(checkout), 1)
        self.assertEqual(checkout[0]["with"].get("fetch-depth"), 0)
        run = "\n".join(str(step.get("run", "")) for step in steps)
        self.assertIn("maintenance/pr_base_drift.py", run)
        for forbidden in ("git push", "git rebase", "gh pr comment", "/comments"):
            self.assertNotIn(forbidden, run)

    def test_every_action_is_pinned_to_the_repository_approved_sha(self):
        steps = self.document["jobs"]["base-drift"]["steps"]
        for step in steps:
            uses = step.get("uses")
            if not uses:
                continue
            action, _, revision = uses.partition("@")
            self.assertEqual(PINNED_ACTIONS.get(action), revision)

    def test_reporter_source_contains_no_branch_or_comment_mutation(self):
        source = (ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"
                  / "pr_base_drift.py").read_text(encoding="utf-8")
        for forbidden in ("git push", "git rebase", "gh pr comment", "/comments"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
