"""Synthetic cases for the approved-head guard (bin/approved_head_guard.py) and its workflow.

Every case builds a throwaway git repository in a temp dir and drives the real fingerprint
code against it; GitHub is a recording fake, so nothing touches the network.
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / "bin"))
from _git_env import scrub_inherited_git_env  # noqa: E402

# Builds git repositories: an inherited GIT_DIR (pre-push hook) would aim them at this repo.
scrub_inherited_git_env()

SCRIPT = ROOT / "bin" / "approved_head_guard.py"
WORKFLOW = ROOT / ".github" / "workflows" / "approved-head-guard.yml"

_spec = importlib.util.spec_from_file_location("approved_head_guard", SCRIPT)
guard = importlib.util.module_from_spec(_spec)
sys.modules["approved_head_guard"] = guard  # dataclasses resolve annotations via sys.modules
_spec.loader.exec_module(guard)

GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
    "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid",
    "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
}


class Repo:
    def __init__(self, path):
        self.path = str(path)
        self.git("init", "-q", "-b", "main")

    def git(self, *args):
        return subprocess.run(
            ["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
             "-C", self.path, *args],
            env=GIT_ENV, check=True, capture_output=True, text=True,
        ).stdout.strip()

    def write(self, name, text=None, data=None):
        p = Path(self.path) / name
        p.parent.mkdir(parents=True, exist_ok=True)
        if data is not None:
            p.write_bytes(data)
        else:
            p.write_text(text, encoding="utf-8")

    def commit(self, msg):
        self.git("add", "-A")
        self.git("commit", "-q", "-m", msg)
        return self.git("rev-parse", "HEAD")


def lines(n, tag="line"):
    return "".join(f"{tag} {i}\n" for i in range(1, n + 1))


class FakeGitHub(guard.GitHub):
    """Records every call; answers pulls/comments from fixtures."""

    def __init__(self, pull, comments=(), review=None):
        self.calls = []
        self._pull = pull
        self._comments = list(comments)
        self._review = review or {
            "state": "APPROVED", "commit_id": pull["head"]["sha"],
            "user": {"login": "jmoss333"},
        }
        super().__init__("owner/repo", self._run)

    def _run(self, args, stdin):
        self.calls.append((tuple(args), stdin))
        if args[:2] == ["api", "repos/owner/repo/pulls/7"]:
            return json.dumps(self._pull)
        if args[0] == "api" and "/reviews/" in args[1]:
            return json.dumps(self._review)
        if args[0] == "api" and "--paginate" in args:
            return json.dumps([self._comments])
        return "{}"

    def verbs(self):
        out = []
        for args, stdin in self.calls:
            if args[:2] == ("pr", "ready"):
                out.append("draft")
            elif "DELETE" in args:
                out.append("unlabel")
            elif any(a.endswith("/comments") for a in args) and "POST" in args:
                out.append("comment")
            elif any(a.endswith("/labels") for a in args) and "POST" in args:
                out.append("label")
            elif any("/statuses/" in a for a in args):
                out.append("status:" + json.loads(stdin)["state"])
        return out

    def posted_bodies(self):
        return [json.loads(stdin)["body"] for args, stdin in self.calls
                if stdin and any(a.endswith("/comments") for a in args)]


def pull(head, labels=(), draft=False, state="open"):
    return {"state": state, "draft": draft, "head": {"sha": head}, "base": {"ref": "main"},
            "labels": [{"name": n} for n in labels]}


def receipt_comment(head, base, fp, login="jmoss333", cid=1):
    return {"id": cid, "user": {"login": login},
            "body": guard.receipt_body(
                head, base, fp, "Josh Moss, MD",
                "chat://thread/test-session#message/test-approval", "owner/repo#7")}


class Scenario(unittest.TestCase):
    """main: a.txt (30 lines). PR branch: edits line 5 of a.txt, adds pr.md."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Repo(self.tmp.name)
        self.repo.write("a.txt", lines(30))
        self.repo.write("other.txt", "x\n")
        self.repo.commit("base")
        self.repo.git("checkout", "-q", "-b", "pr")
        text = lines(30).replace("line 5\n", "line 5 — approved wording\n")
        self.repo.write("a.txt", text)
        self.repo.write("pr.md", "# new page\n")
        self.approved_head = self.repo.commit("pr change")
        self.approved_base, self.approved_fp = guard.fingerprint(self.repo.path, "main", "pr")

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, gh, *extra):
        args = guard.build_parser().parse_args(
            ["--repo-dir", self.repo.path, "check", "--repo", "owner/repo", "--pr", "7",
             "--local-refs", "main", "pr", *extra])
        return guard.cmd_check(args, gh)

    def approved_gh(self, head, **kw):
        return FakeGitHub(pull(head, labels=[guard.LABEL], **kw),
                          [receipt_comment(self.approved_head, self.approved_base,
                                           self.approved_fp)])

    def resync_from_main(self):
        """main moves: same file, far-away line + a new file; then main is merged into pr."""
        self.repo.git("checkout", "-q", "main")
        self.repo.write("a.txt", lines(30).replace("line 25\n", "line 25 changed on main\n"))
        self.repo.write("main-only.txt", "landed on main\n")
        self.repo.commit("main moves")
        self.repo.git("checkout", "-q", "pr")
        self.repo.git("merge", "-q", "--no-edit", "main")
        return self.repo.git("rev-parse", "HEAD")


class ResyncOnly(Scenario):
    def test_resync_from_main_keeps_the_fingerprint(self):
        new_head = self.resync_from_main()
        self.assertNotEqual(new_head, self.approved_head)
        _mb, fp = guard.fingerprint(self.repo.path, "main", "pr")
        self.assertEqual(fp, self.approved_fp)

    def test_resync_requires_a_fresh_receipt(self):
        new_head = self.resync_from_main()
        gh = self.approved_gh(new_head)
        self.assertEqual(self.check(gh, "--apply", "--status"), 1)
        self.assertEqual(gh.verbs(), ["comment", "unlabel", "draft", "status:failure"])

    def test_main_moving_without_a_resync_also_passes(self):
        self.repo.git("checkout", "-q", "main")
        self.repo.write("other.txt", "y\n")
        self.repo.commit("main moves, pr not re-synced")
        gh = self.approved_gh(self.approved_head)
        self.assertEqual(self.check(gh, "--apply"), 0)
        self.assertEqual(gh.verbs(), [])


class ContentChange(Scenario):
    def push_content(self):
        text = (Path(self.repo.path) / "a.txt").read_text()
        self.repo.write("a.txt", text.replace("line 6\n", "line 6 — changed after approval\n"))
        return self.repo.commit("post-approval content")

    def test_content_change_trips_unlabels_drafts_comments_and_fails(self):
        head = self.push_content()
        gh = self.approved_gh(head)
        self.assertEqual(self.check(gh, "--apply", "--status"), 1)
        self.assertEqual(gh.verbs(), ["comment", "unlabel", "draft", "status:failure"])
        body = gh.posted_bodies()[-1]
        self.assertIn(guard.TRIP_SENTENCE, body.lower())
        self.assertIn(self.approved_head, body)
        self.assertIn(head, body)
        self.assertIsNone(guard.RECEIPT_RE.search(body), "a trip comment is never a receipt")

    def test_content_change_after_a_resync_still_trips(self):
        self.resync_from_main()
        head = self.push_content()
        self.assertEqual(self.check(self.approved_gh(head), "--apply"), 1)

    def test_conflict_resolution_that_rewrites_approved_lines_trips(self):
        self.repo.git("checkout", "-q", "main")
        self.repo.write("a.txt", lines(30).replace("line 5\n", "line 5 — main's wording\n"))
        self.repo.commit("main edits the same line")
        self.repo.git("checkout", "-q", "pr")
        subprocess.run(["git", "-C", self.repo.path, "merge", "-q", "main"], env=GIT_ENV,
                       capture_output=True)
        self.repo.write("a.txt", lines(30).replace("line 5\n", "line 5 — merged wording\n"))
        head = self.repo.commit("resolve")
        self.assertEqual(self.check(self.approved_gh(head)), 1)

    def test_binary_change_trips(self):
        self.repo.write("img.bin", data=b"\x00\x01\x02")
        self.repo.commit("binary before approval")
        _mb, before = guard.fingerprint(self.repo.path, "main", "pr")
        self.repo.write("img.bin", data=b"\x00\x01\x03")
        self.repo.commit("binary after approval")
        _mb, after = guard.fingerprint(self.repo.path, "main", "pr")
        self.assertNotEqual(before, after)

    def test_draft_pr_is_not_re_drafted(self):
        head = self.push_content()
        gh = self.approved_gh(head, draft=True)
        self.assertEqual(self.check(gh, "--apply"), 1)
        self.assertEqual(gh.verbs(), ["comment", "unlabel"])

    def test_without_apply_it_only_reports(self):
        head = self.push_content()
        gh = self.approved_gh(head)
        self.assertEqual(self.check(gh), 1)
        self.assertEqual(gh.verbs(), [])

    def test_moving_an_identical_substitution_to_another_hunk_trips(self):
        self.repo.git("checkout", "-q", "main")
        self.repo.write("duplicate.txt", "target\nmiddle\ntarget\n")
        self.repo.commit("add duplicate targets")
        self.repo.git("checkout", "-q", "pr")
        self.repo.git("merge", "-q", "--no-edit", "main")
        self.repo.write("duplicate.txt", "approved\nmiddle\ntarget\n")
        approved_head = self.repo.commit("approve first target")
        approved_base, approved_fp = guard.fingerprint(self.repo.path, "main", "pr")
        self.repo.write("duplicate.txt", "target\nmiddle\napproved\n")
        moved_head = self.repo.commit("move approved substitution")
        _base, moved_fp = guard.fingerprint(self.repo.path, "main", "pr")
        self.assertEqual(moved_fp, approved_fp, "the old normalized diff cannot see the move")
        gh = FakeGitHub(pull(moved_head, labels=[guard.LABEL]),
                        [receipt_comment(approved_head, approved_base, approved_fp)])
        self.assertEqual(self.check(gh), 1)


class NoLabel(Scenario):
    def test_no_label_passes_even_after_content_change(self):
        self.repo.write("pr.md", "# rewritten\n")
        head = self.repo.commit("unapproved work in progress")
        gh = FakeGitHub(pull(head, labels=["documentation"]))
        self.assertEqual(self.check(gh, "--apply", "--status"), 0)
        self.assertEqual(gh.verbs(), ["status:success"])

    def test_closed_pr_passes(self):
        gh = FakeGitHub(pull(self.approved_head, labels=[guard.LABEL], state="closed"))
        self.assertEqual(self.check(gh, "--apply"), 0)
        self.assertEqual(gh.verbs(), [])

    def test_revoked_approval_does_not_pass_after_the_label_is_removed(self):
        receipt = receipt_comment(self.approved_head, self.approved_base, self.approved_fp)
        decision = guard.Decision(False, "the approved head changed", ["unlabel", "draft", "comment"])
        revocation = {"id": 2, "user": {"login": "github-actions[bot]"},
                      "body": guard.trip_comment(decision, None, self.approved_head, self.approved_fp)}
        gh = FakeGitHub(pull(self.approved_head, draft=True), [receipt, revocation])
        self.assertEqual(self.check(gh, "--apply", "--status"), 1)
        self.assertEqual(gh.verbs(), ["status:failure"])

    def test_old_receipt_cannot_be_reused_after_revocation_on_a_label_event(self):
        receipt = receipt_comment(self.approved_head, self.approved_base, self.approved_fp)
        decision = guard.Decision(False, "the approved head changed", ["unlabel", "draft", "comment"])
        revocation = {"id": 2, "user": {"login": "github-actions[bot]"},
                      "body": guard.trip_comment(decision, None, self.approved_head, self.approved_fp)}
        gh = FakeGitHub(pull(self.approved_head, labels=[guard.LABEL]), [receipt, revocation])
        self.assertEqual(self.check(gh), 1)

    def test_untrusted_comment_cannot_forge_a_revocation(self):
        receipt = receipt_comment(self.approved_head, self.approved_base, self.approved_fp)
        forged = {"id": 2, "user": {"login": "untrusted"}, "body": guard.TRIP_MARKER}
        gh = FakeGitHub(pull(self.approved_head, labels=[guard.LABEL]), [receipt, forged])
        self.assertEqual(self.check(gh), 0)

    def test_revocation_reapplies_draft_when_the_pr_is_marked_ready(self):
        receipt = receipt_comment(self.approved_head, self.approved_base, self.approved_fp)
        decision = guard.Decision(False, "the approved head changed", ["comment", "unlabel", "draft"])
        revocation = {"id": 2, "user": {"login": "github-actions[bot]"},
                      "body": guard.trip_comment(decision, None, self.approved_head, self.approved_fp)}
        gh = FakeGitHub(pull(self.approved_head, draft=False), [receipt, revocation])
        self.assertEqual(self.check(gh, "--apply"), 1)
        self.assertEqual(gh.verbs(), ["draft"])


class Receipts(Scenario):
    def test_label_without_receipt_trips(self):
        gh = FakeGitHub(pull(self.approved_head, labels=[guard.LABEL]), [])
        self.assertEqual(self.check(gh, "--apply"), 1)
        self.assertEqual(gh.verbs(), ["comment", "unlabel", "draft"])

    def test_receipt_from_an_unlisted_author_is_ignored(self):
        gh = FakeGitHub(pull(self.approved_head, labels=[guard.LABEL]),
                        [receipt_comment(self.approved_head, self.approved_base,
                                         self.approved_fp, login="someone-else")])
        self.assertEqual(self.check(gh), 1)

    def test_newest_receipt_wins(self):
        stale = receipt_comment("0" * 40, "0" * 40, "f" * 64, cid=1)
        fresh = receipt_comment(self.approved_head, self.approved_base, self.approved_fp, cid=2)
        self.assertEqual(guard.latest_receipt([stale, fresh], ["jmoss333"]).comment_id, 2)
        self.assertEqual(guard.latest_receipt([fresh, stale], ["jmoss333"]).comment_id, 1)

    def run_receipt(self, gh, *extra):
        args = guard.build_parser().parse_args(
            ["--repo-dir", self.repo.path, "receipt", "--repo", "owner/repo", "--pr", "7",
             "--local-refs", "main", "pr", "--expect-head", self.approved_head,
             "--chat-approval-ref", "chat://thread/test-session#message/test-approval",
             "--approval-scope", "owner/repo#7", *extra])
        return guard.cmd_receipt(args, gh)

    def test_receipt_refuses_a_short_expected_head(self):
        gh = FakeGitHub(pull(self.approved_head))
        self.assertEqual(self.run_receipt(gh, "--expect-head", self.approved_head[:12]), 1)
        self.assertEqual(gh.verbs(), [])

    def test_receipt_parser_requires_chat_reference_and_scope(self):
        subparsers = next(action for action in guard.build_parser()._actions
                          if getattr(action, "choices", None))
        help_text = subparsers.choices["receipt"].format_help()
        self.assertIn("--chat-approval-ref", help_text)
        self.assertIn("--approval-scope", help_text)

    def test_receipt_refuses_a_reference_or_scope_for_another_pr(self):
        gh = FakeGitHub(pull(self.approved_head))
        self.assertEqual(self.run_receipt(gh, "--approval-scope", "owner/repo#8"), 1)
        self.assertEqual(gh.verbs(), [])

    def test_receipt_accepts_a_shaped_chat_reference_without_review_api_access(self):
        gh = FakeGitHub(pull(self.approved_head))
        self.assertEqual(self.run_receipt(gh), 0)
        self.assertEqual(gh.verbs(), ["comment", "label"])
        self.assertFalse(any("/reviews/" in arg for call, _ in gh.calls for arg in call))
        body = gh.posted_bodies()[0]
        self.assertIn("chat://thread/test-session#message/test-approval", body)
        self.assertIsNotNone(guard.RECEIPT_RE.search(body))

    def test_legacy_v2_receipt_still_guards_its_exact_head(self):
        body = (f"<!-- approved-head-receipt v2 head={self.approved_head} "
                f"base={self.approved_base} fingerprint={self.approved_fp} "
                "review=1 scope=owner/repo#7 -->")
        gh = FakeGitHub(pull(self.approved_head, labels=[guard.LABEL]),
                        [{"id": 1, "user": {"login": "jmoss333"}, "body": body}])
        self.assertEqual(self.check(gh), 0)

    def test_receipt_refuses_an_unshaped_chat_reference(self):
        gh = FakeGitHub(pull(self.approved_head))
        self.assertEqual(self.run_receipt(gh, "--chat-approval-ref", "Josh said yes"), 1)
        self.assertEqual(gh.verbs(), [])

    def test_receipt_scope_is_rechecked_before_a_label_can_pass(self):
        body = guard.receipt_body(
            self.approved_head, self.approved_base, self.approved_fp, "Josh Moss, MD",
            "chat://thread/test-session#message/test-approval", "owner/repo#8")
        gh = FakeGitHub(pull(self.approved_head, labels=[guard.LABEL]),
                        [{"id": 1, "user": {"login": "jmoss333"}, "body": body}])
        self.assertEqual(self.check(gh), 1)

    def test_receipt_refuses_when_head_moved_since_josh_looked(self):
        gh = FakeGitHub(pull(self.approved_head))
        self.assertEqual(self.run_receipt(gh, "--expect-head", "d" * 40), 1)
        self.assertEqual(gh.verbs(), [])

    def test_dry_run_writes_nothing(self):
        gh = FakeGitHub(pull(self.approved_head))
        self.assertEqual(self.run_receipt(gh, "--expect-head", self.approved_head, "--dry-run"), 0)
        self.assertEqual(gh.verbs(), [])


class DecideTable(unittest.TestCase):
    R = guard.Receipt("a" * 40, "b" * 40, "c" * 64)

    def test_table(self):
        L = [guard.LABEL]
        self.assertTrue(guard.decide([], None, "x", "h").ok)
        self.assertTrue(guard.decide(L, self.R, "c" * 64, "a" * 40).ok)
        self.assertFalse(guard.decide(L, self.R, "c" * 64, "d" * 40).ok)
        self.assertTrue(guard.decide(L, self.R, "e" * 64, "a" * 40).ok)
        self.assertFalse(guard.decide(L, None, "c" * 64, "a" * 40).ok)


class WorkflowContract(unittest.TestCase):
    def setUp(self):
        self.doc = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
        self.on = self.doc.get("on") or self.doc.get(True)

    def test_runs_trusted_base_code_on_every_push(self):
        self.assertEqual(set(self.on), {"pull_request_target"})
        self.assertIn("synchronize", self.on["pull_request_target"]["types"])
        self.assertIn("ready_for_review", self.on["pull_request_target"]["types"])

    def test_least_privilege(self):
        self.assertEqual(self.doc["permissions"], {})
        job = self.doc["jobs"]["guard"]
        self.assertEqual(job["permissions"],
                         {"contents": "read", "pull-requests": "write", "statuses": "write"})

    def test_hosted_runner_only(self):
        for job in self.doc["jobs"].values():
            self.assertEqual(job["runs-on"], "ubuntu-latest")

    def test_never_checks_out_or_runs_pr_code(self):
        steps = self.doc["jobs"]["guard"]["steps"]
        checkout = [s for s in steps if str(s.get("uses", "")).startswith("actions/checkout@")]
        self.assertEqual(len(checkout), 1)
        self.assertNotIn("ref", checkout[0].get("with", {}))
        for s in steps:
            self.assertNotIn("${{", s.get("run", ""), "no expression interpolation in run:")

    def test_actions_are_pinned_to_the_repo_allowlist(self):
        sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))
        from maintenance.validate_scheduled_workflows import PINNED_ACTIONS
        for job in self.doc["jobs"].values():
            for s in job["steps"]:
                if "uses" in s:
                    action, _, rev = s["uses"].partition("@")
                    self.assertEqual(PINNED_ACTIONS.get(action), rev, s["uses"])


if __name__ == "__main__":
    unittest.main()
