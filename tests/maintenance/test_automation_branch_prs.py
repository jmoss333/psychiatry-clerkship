import contextlib
import importlib
import io
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))
try:
    steward = importlib.import_module("maintenance.automation_branch_prs")
except ModuleNotFoundError:
    steward = None

NOW = datetime(2026, 9, 15, tzinfo=timezone.utc)
QUEUE = "automation/queue-example-2026-09-15"
SURVEILLANCE = "automation/surveillance-inbox"


def ref(branch=QUEUE):
    return {"ref": "refs/heads/" + branch}


def pull(branch=QUEUE, state="open", repository="owner/repo", **extra):
    return {"head": {"ref": branch, "repo": {"full_name": repository}}, "state": state, **extra}


class EvaluateTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(steward, "branch/PR steward must be implemented")

    def test_owned_branches_without_pr_are_sorted_exceptions(self):
        self.assertEqual(steward.evaluate([ref(SURVEILLANCE), ref()], [], checked_at=NOW, repository="owner/repo"), {
            "schemaVersion": 1, "checkedAt": "2026-09-15T00:00:00Z", "gate": "blocked",
            "branches": [{"branch": QUEUE, "state": "missing_open_pr"},
                         {"branch": SURVEILLANCE, "state": "missing_open_pr"}],
        })

    def test_exact_open_draft_head_clears_branch(self):
        result = steward.evaluate([ref()], [pull(draft=True)], checked_at=NOW, repository="owner/repo")
        self.assertEqual(result["gate"], "ready")
        self.assertEqual(result["branches"], [])

    def test_wrong_closed_and_merged_historical_heads_do_not_clear(self):
        for pr in [pull("ordinary/branch"), pull(state="closed"),
                   pull(state="closed", merged_at="2026-09-14T00:00:00Z")]:
            with self.subTest(pr=pr):
                result = steward.evaluate([ref()], [pr], checked_at=NOW, repository="owner/repo")
                self.assertEqual(result["gate"], "blocked")

    def test_unknown_valid_refs_are_discarded_not_rendered(self):
        result = steward.evaluate([ref("automation/unknown-private-text")], [], checked_at=NOW, repository="owner/repo")
        self.assertEqual(result["gate"], "ready")
        self.assertEqual(result["branches"], [])
        self.assertNotIn("private-text", json.dumps(result))

    def test_malformed_refs_fail_closed_even_when_unknown(self):
        for bad in [None, {}, "x", {"ref": 2}, ref("automation/evil\n::error::"),
                    ref("automation/../secret"), ref("automation/" + "x" * 256),
                    {"ref": "refs/tags/automation/unknown"}]:
            with self.subTest(bad=bad), self.assertRaises(steward.AutomationBranchPRError):
                steward.evaluate([bad], [], checked_at=NOW, repository="owner/repo")

    def test_every_pr_must_have_safe_head_and_recognized_state(self):
        for bad in [None, {}, {"state": "open"}, pull(state="merged"), pull(state=[]),
                    pull("evil\ntext"), {"head": [], "state": "open"}, pull(state=None)]:
            with self.subTest(bad=bad), self.assertRaises(steward.AutomationBranchPRError):
                steward.evaluate([], [bad], checked_at=NOW, repository="owner/repo")

    def test_duplicate_admitted_refs_or_open_heads_are_ambiguous(self):
        for refs, prs in [([ref(), ref()], []), ([ref()], [pull(), pull()])]:
            with self.subTest(refs=refs), self.assertRaises(steward.AutomationBranchPRError):
                steward.evaluate(refs, prs, checked_at=NOW, repository="owner/repo")

    def test_64_branch_boundary_is_bounded(self):
        refs = [ref(f"automation/queue-task-{n}-2026-09-15") for n in range(65)]
        result = steward.evaluate(refs[:64], [], checked_at=NOW, repository="owner/repo")
        self.assertEqual(len(result["branches"]), 64)
        self.assertLess(len(json.dumps(result)), 10000)
        with self.assertRaises(steward.AutomationBranchPRError):
            steward.evaluate(refs, [], checked_at=NOW, repository="owner/repo")

    def test_non_list_inputs_and_naive_timestamp_fail_closed(self):
        for refs, prs, timestamp in [(None, [], NOW), ([], {}, NOW),
                                    ([], [], NOW.replace(tzinfo=None)), ([], [], "now")]:
            with self.subTest(timestamp=timestamp), self.assertRaises(steward.AutomationBranchPRError):
                steward.evaluate(refs, prs, checked_at=timestamp, repository="owner/repo")

    def test_timestamp_normalizes_to_utc_and_metadata_never_appears(self):
        local = NOW.astimezone(timezone(timedelta(hours=-4)))
        result = steward.evaluate([ref()], [pull("other", title="INJECT", body="INJECT",
                                  number=999, url="INJECT", sha="INJECT")], checked_at=local, repository="owner/repo")
        self.assertEqual(result["checkedAt"], "2026-09-15T00:00:00Z")
        self.assertNotIn("INJECT", json.dumps(result))
        self.assertEqual(set(result), {"schemaVersion", "checkedAt", "gate", "branches"})

    def test_fork_with_identical_head_does_not_clear_owned_branch(self):
        # CLI exercises monitored-repository matching without depending on the new signature.
        code, receipt, _log = CLITests().run_cli(Opener(Response([ref()]),
                                                       Response([pull(repository="fork/repo")])))
        self.assertEqual(code, 2)
        self.assertEqual(receipt["branches"], [{"branch": QUEUE, "state": "missing_open_pr"}])

    def test_missing_or_malformed_head_repository_is_unavailable(self):
        for repo in [None, {}, {"full_name": "evil\nrepo"}, {"full_name": 4}]:
            pr = pull()
            pr["head"]["repo"] = repo
            with self.subTest(repo=repo):
                code, receipt, _log = CLITests().run_cli(Opener(Response([ref()]), Response([pr])))
                self.assertEqual(code, 2)
                self.assertEqual(receipt.get("state"), "unavailable")

    def test_evaluator_rejects_invalid_monitored_repository(self):
        with self.assertRaises(steward.AutomationBranchPRError):
            steward.evaluate([], [], checked_at=NOW, repository="invalid")


class Response:
    def __init__(self, payload=None, *, raw=None, status=200):
        self.raw = json.dumps(payload).encode() if raw is None else raw
        self.status = status
        self.closed = False

    def read(self, limit):
        # Return all bytes to ensure the production cap is independently checked.
        return self.raw

    def close(self):
        self.closed = True


class Opener:
    def __init__(self, *responses):
        self.responses = iter(responses)
        self.requests = []

    def open(self, request, *, timeout):
        self.requests.append((request, timeout))
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response


class FetchTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(getattr(steward, "fetch_automation_refs", None)),
                        "bounded remote reads must be implemented")

    def test_both_endpoints_paginate_get_only_and_close_responses(self):
        for function, path, entry in [
            (steward.fetch_automation_refs, "git/matching-refs/heads/automation/?", ref),
            (steward.fetch_open_pulls, "pulls?state=open&", pull),
        ]:
            with self.subTest(path=path):
                pages = [Response([entry(f"other-{n}") for n in range(100)]), Response([])]
                client = Opener(*pages)
                result = function("owner/repo", token="token", opener=client)
                self.assertEqual(len(result), 100)
                self.assertTrue(all(page.closed for page in pages))
                self.assertEqual(len(client.requests), 2)
                for page, (request, timeout) in enumerate(client.requests, 1):
                    self.assertEqual(request.full_url, f"https://api.github.com/repos/owner/repo/{path}per_page=100&page={page}")
                    self.assertEqual(request.get_method(), "GET")
                    self.assertIsNone(request.data)
                    self.assertEqual(timeout, 20)
                    self.assertEqual(request.get_header("Authorization"), "Bearer token")
                    self.assertEqual(request.get_header("X-github-api-version"), "2022-11-28")

    def test_tenth_full_page_is_unavailable_not_truncated_success(self):
        client = Opener(*(Response([ref(f"other-{n}") for n in range(100)]) for _ in range(10)))
        with self.assertRaises(steward.AutomationBranchPRError):
            steward.fetch_automation_refs("owner/repo", token="t", opener=client)
        self.assertEqual(len(client.requests), 10)

    def test_incomplete_second_page_aborts_whole_scan(self):
        client = Opener(Response([ref(f"other-{n}") for n in range(100)]), OSError("INJECT"))
        with self.assertRaises(steward.AutomationBranchPRError):
            steward.fetch_automation_refs("owner/repo", token="t", opener=client)

    def test_bad_configuration_never_calls_network(self):
        for repository, token in [(None, "t"), ("not a repo", "t"), ("owner/repo", ""),
                                  ("owner/repo", None), ("owner/repo", "evil\nheader")]:
            with self.subTest(repository=repository, token=token):
                client = Opener()
                with self.assertRaises(steward.AutomationBranchPRError):
                    steward.fetch_open_pulls(repository, token=token, opener=client)
                self.assertEqual(client.requests, [])

    def test_response_and_entry_failures_are_unavailable(self):
        for response in [Response([], status=302), Response([], status=403), OSError("INJECT"),
                         Response(raw="not bytes"), Response(raw=b"x" * 2_000_001),
                         Response(raw=b"\xff"), Response(raw=b"{"), Response({}),
                         Response([None]), Response([ref()] * 101)]:
            with self.subTest(response=response), self.assertRaises(steward.AutomationBranchPRError):
                steward.fetch_automation_refs("owner/repo", token="t", opener=Opener(response))

    def test_pull_entries_are_validated_before_return(self):
        with self.assertRaises(steward.AutomationBranchPRError):
            steward.fetch_open_pulls("owner/repo", token="t", opener=Opener(Response([{"state": "open"}])))

    def test_ambiguous_duplicate_json_keys_and_non_json_constants_are_rejected(self):
        for raw in [b'[{"ref":"refs/heads/automation/unknown","ref":"refs/heads/automation/other"}]',
                    b'[{"ref":"refs/heads/automation/unknown","extra":NaN}]']:
            with self.subTest(raw=raw), self.assertRaises(steward.AutomationBranchPRError):
                steward.fetch_automation_refs("owner/repo", token="t", opener=Opener(Response(raw=raw)))


class CLITests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(getattr(steward, "main", None)), "CLI must be implemented")

    def run_cli(self, client, *, out=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "receipt.json" if out is None else out
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch.dict("os.environ", {"GITHUB_REPOSITORY": "owner/repo", "GITHUB_TOKEN": "t"}), \
                 contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = steward.main(["--out", str(path)], opener=client, now=lambda: NOW)
            source = path.read_text() if path.is_file() else None
            return code, json.loads(source) if source else None, stdout.getvalue() + stderr.getvalue()

    def test_ready_and_missing_pr_exit_contract(self):
        for prs, expected in [([pull(draft=True)], 0), ([], 2)]:
            with self.subTest(prs=prs):
                code, receipt, log = self.run_cli(Opener(Response([ref()]), Response(prs)))
                self.assertEqual(code, expected)
                self.assertEqual(receipt["gate"], "ready" if expected == 0 else "blocked")
                self.assertNotIn(QUEUE, log)

    def test_fetch_and_evaluation_failures_write_bounded_unavailable(self):
        for client in [Opener(OSError("INJECT SECRET")),
                       Opener(Response([ref(), ref()]), Response([])),
                       Opener(Response([ref("automation/INJECT\n::error::")]))]:
            with self.subTest(client=client):
                code, receipt, log = self.run_cli(client)
                self.assertEqual(code, 2)
                self.assertEqual(receipt, {"schemaVersion": 1, "checkedAt": "2026-09-15T00:00:00Z",
                                          "gate": "blocked", "state": "unavailable", "branches": []})
                self.assertNotIn("INJECT", json.dumps(receipt) + log)
                self.assertLess(len(log), 150)

    def test_output_write_failure_returns_two_without_path_leak(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "INJECT" / "missing" / "receipt.json"
            code, receipt, log = self.run_cli(Opener(Response([]), Response([])), out=out)
            self.assertEqual(code, 2)
            self.assertIsNone(receipt)
            self.assertNotIn("INJECT", log)


if __name__ == "__main__":
    unittest.main()
