"""Pins bin/signoff_impact.py and its PR workflow: which sign-offs a change reopens.

Each case builds a throwaway repository with the three registries and a signed page, so the
classification is exercised through real git objects and attestation_hash.py's own digests.
"""

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin"))
from _git_env import scrub_inherited_git_env  # noqa: E402
scrub_inherited_git_env()
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))
from attestation_hash import clinical_digest, digest  # noqa: E402
from maintenance.validate_scheduled_workflows import PINNED_ACTIONS  # noqa: E402

_spec = importlib.util.spec_from_file_location("signoff_impact", ROOT / "bin" / "signoff_impact.py")
impact_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(impact_mod)

WORKFLOW = ROOT / ".github" / "workflows" / "pr-signoff-impact.yml"
PAGE = "01_Core/page.md"
PAGE_TEXT = "# Agitation\n\nOffer oral medication first.\n\nKey paper: doi:10.1000/one\n"
OTHER = "01_Core/other.md"


def _git(root, *args):
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env.update(GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@example.invalid",
               GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@example.invalid")
    out = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, env=env, check=True)
    return out.stdout.strip()


class Repo:
    """A repository with one signed page (`page.md`) and one unsigned page."""

    def __init__(self, test):
        tmp = tempfile.TemporaryDirectory()
        test.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        _git(self.root, "init", "-q", "-b", "main")
        self.shipped = {"pages": [{"slug": "page.md", "source": PAGE},
                                  {"slug": "other.md", "source": OTHER}]}
        self.meta = {"page.md": {"tldr": "one", "facultyReview": {"status": "reviewed"}}}
        self.write(PAGE, PAGE_TEXT)
        self.write(OTHER, "# Other\n")
        sources = {PAGE: PAGE_TEXT.encode()}
        self.ledger = {
            "page.md": {"status": "reviewed", "by": "Joshua Moss, MD", "at": "2026-09-26",
                        "contentHash": digest("page.md", sources, self.meta["page.md"]),
                        "clinicalHash": clinical_digest("page.md", sources, self.meta["page.md"])},
            "other.md": {"status": "pending", "by": "Pending faculty review", "at": "2026-09-01",
                         "reason": "New page awaiting first faculty review."},
        }
        self.save_registries()
        self.base = self.commit("base")

    def write(self, rel, text):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def save_registries(self):
        self.write(impact_mod.LEDGER_REL, json.dumps(self.ledger, indent=2))
        self.write(impact_mod.SHIPPED_REL, json.dumps(self.shipped, indent=2))
        self.write(impact_mod.TOPIC_META_REL, json.dumps(self.meta, indent=2))

    def commit(self, message):
        _git(self.root, "add", "-A")
        _git(self.root, "commit", "-q", "--allow-empty", "-m", message)
        return _git(self.root, "rev-parse", "HEAD")

    def impact(self, head):
        return impact_mod.impact(self.base, head, self.root)


class ClassificationTests(unittest.TestCase):
    def test_editing_signed_text_reopens_the_signature(self):
        repo = Repo(self)
        repo.write(PAGE, PAGE_TEXT.replace("oral medication", "oral medication and a quiet room"))
        result = repo.impact(repo.commit("edit"))
        self.assertEqual([(r["slug"], r["why"], r["signedAt"]) for r in result["reopened"]],
                         [("page.md", "reopened", "2026-09-26")])
        self.assertEqual(result["examined"], 1)
        self.assertEqual(result["signed"], 1)

    def test_a_topic_meta_edit_reopens_it_and_the_faculty_review_block_does_not(self):
        repo = Repo(self)
        repo.meta["page.md"]["facultyReview"] = {"status": "reviewed", "reviewer": "x"}
        repo.save_registries()
        self.assertEqual(repo.impact(repo.commit("governance block"))["reopened"], [])
        repo.meta["page.md"]["tldr"] = "two"
        repo.save_registries()
        self.assertEqual([r["slug"] for r in repo.impact(repo.commit("record"))["reopened"]], ["page.md"])

    def test_an_untouched_signed_page_is_not_recomputed(self):
        repo = Repo(self)
        repo.write(OTHER, "# Other, edited\n")
        result = repo.impact(repo.commit("unsigned page only"))
        self.assertEqual(result["reopened"], [])
        self.assertEqual(result["examined"], 0)

    def test_a_citation_only_change_keeps_the_signature_and_is_reported(self):
        repo = Repo(self)
        repo.write(PAGE, PAGE_TEXT.replace("10.1000/one", "10.1000/two"))
        result = repo.impact(repo.commit("citation"))
        self.assertEqual(result["reopened"], [])
        self.assertEqual([c["slug"] for c in result["citations"]], ["page.md"])

    def test_moving_the_row_back_to_pending_is_reported_as_this_change_reopening_it(self):
        repo = Repo(self)
        repo.ledger["page.md"] = {"status": "pending", "by": "Pending faculty review", "at": "2026-09-28",
                                  "reason": "Rewritten; awaiting review."}
        repo.save_registries()
        self.assertEqual([r["why"] for r in repo.impact(repo.commit("demote"))["reopened"]], ["demoted"])

    def test_deleting_an_attested_source_or_unshipping_the_page_is_reported(self):
        repo = Repo(self)
        (repo.root / PAGE).unlink()
        self.assertEqual([r["why"] for r in repo.impact(repo.commit("delete"))["reopened"]], ["removed"])
        repo2 = Repo(self)
        repo2.shipped["pages"] = [p for p in repo2.shipped["pages"] if p["slug"] != "page.md"]
        repo2.save_registries()
        self.assertEqual([r["why"] for r in repo2.impact(repo2.commit("unship"))["reopened"]], ["removed"])

    def test_a_row_already_drifted_on_the_base_is_counted_not_blamed(self):
        repo = Repo(self)
        repo.write(PAGE, PAGE_TEXT + "\nAn earlier edit.\n")
        repo.base = repo.commit("already drifted")
        repo.write(PAGE, PAGE_TEXT + "\nAn earlier edit, edited again.\n")
        result = repo.impact(repo.commit("edit again"))
        self.assertEqual(result["reopened"], [])
        self.assertEqual(result["alreadyAwaiting"], 1)

    def test_a_re_attestation_reopens_nothing(self):
        repo = Repo(self)
        repo.write(PAGE, PAGE_TEXT + "\nNew text.\n")
        repo.ledger["page.md"]["contentHash"] = digest(
            "page.md", {PAGE: (PAGE_TEXT + "\nNew text.\n").encode()}, repo.meta["page.md"])
        repo.save_registries()
        self.assertEqual(repo.impact(repo.commit("edit and re-sign"))["reopened"], [])

    def test_an_unreadable_side_is_could_not_check_never_reopens_nothing(self):
        repo = Repo(self)
        (repo.root / impact_mod.LEDGER_REL).unlink()
        head = repo.commit("ledger gone")
        with self.assertRaises(impact_mod.CouldNotCheck):
            repo.impact(head)
        err = io.StringIO()
        from contextlib import redirect_stderr
        with redirect_stderr(err):
            code = impact_mod.main(["--root", str(repo.root), "--base", repo.base, "--head", head],
                                   stream=io.StringIO())
        self.assertEqual(code, 2)
        self.assertIn("could not check", err.getvalue())
        with self.assertRaises(impact_mod.CouldNotCheck):
            impact_mod.impact("no-such-rev", head, repo.root)


class RenderingTests(unittest.TestCase):
    RESULT = {"base": "a" * 40, "head": "b" * 40, "signed": 132, "examined": 2, "alreadyAwaiting": 0,
              "reopened": [{"slug": "sp-interview.html", "signedAt": "2026-09-26", "by": "x", "why": "reopened"}],
              "citations": []}

    def test_titles_and_conclusions(self):
        out = impact_mod.check_output(self.RESULT)
        self.assertEqual(out["conclusion"], "neutral")
        self.assertEqual(out["title"], "Reopens 1 faculty sign-off: sp-interview.html")
        self.assertIn("| `sp-interview.html` | 2026-09-26 | its text changes |", out["summary"])
        self.assertIn("never blocks a merge", out["summary"])
        clean = impact_mod.check_output({**self.RESULT, "reopened": []})
        self.assertEqual((clean["conclusion"], clean["title"]), ("success", "Reopens no faculty sign-off"))
        blind = impact_mod.check_output(error="topic_meta.json is absent at abc")
        self.assertEqual(blind["conclusion"], "neutral")
        self.assertIn("not a clean result", blind["summary"])

    def test_the_check_run_is_one_post_on_the_pr_head_and_nothing_else(self):
        sent = []

        class Opener:
            def open(self, request, timeout):
                sent.append(request)

                class R:
                    status = 201

                    def close(self):
                        pass
                return R()

        impact_mod.write_check_run("jmoss333/psychiatry-clerkship", "t", "c" * 40,
                                   impact_mod.check_output(self.RESULT), opener=Opener())
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0].get_method(), "POST")
        self.assertTrue(sent[0].full_url.endswith("/repos/jmoss333/psychiatry-clerkship/check-runs"))
        body = json.loads(sent[0].data)
        self.assertEqual((body["name"], body["head_sha"], body["conclusion"]),
                         (impact_mod.CHECK_NAME, "c" * 40, "neutral"))
        with self.assertRaises(ValueError):
            impact_mod.write_check_run("jmoss333/psychiatry-clerkship", "t", "HEAD", {}, opener=Opener())


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.document = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
        self.triggers = self.document.get("on", self.document.get(True))
        self.steps = self.document["jobs"]["signoff-impact"]["steps"]

    def test_pull_request_is_the_only_trigger_never_pull_request_target(self):
        self.assertEqual(set(self.triggers), {"pull_request"})
        self.assertNotIn("pull_request_target", self.triggers)

    def test_permissions_are_read_only_except_the_advisory_check(self):
        self.assertEqual(self.document["permissions"], {"contents": "read", "checks": "write"})

    def test_it_compares_the_base_tip_with_the_test_merge_and_reports_on_the_head(self):
        step = [s for s in self.steps if "signoff_impact.py" in str(s.get("run", ""))]
        self.assertEqual(len(step), 1)
        env, run = step[0]["env"], step[0]["run"]
        self.assertEqual(env["BASE_SHA"], "${{ github.event.pull_request.base.sha }}")
        self.assertEqual(env["MERGE_SHA"], "${{ github.sha }}")
        self.assertEqual(env["HEAD_SHA"], "${{ github.event.pull_request.head.sha }}")
        for flag in ('--base "$BASE_SHA"', '--head "$MERGE_SHA"', '--report-sha "$HEAD_SHA"', "--check-run"):
            self.assertIn(flag, run)

    def test_actions_are_pinned_and_the_checkout_holds_no_credential(self):
        checkout = [s for s in self.steps if str(s.get("uses", "")).startswith("actions/checkout@")]
        self.assertEqual(len(checkout), 1)
        self.assertEqual(checkout[0]["with"]["fetch-depth"], 0)
        self.assertIs(checkout[0]["with"]["persist-credentials"], False)
        for step in self.steps:
            if step.get("uses"):
                action, _, revision = step["uses"].partition("@")
                self.assertEqual(PINNED_ACTIONS.get(action), revision)

    def test_neither_the_workflow_nor_the_reporter_mutates_a_branch_or_comments(self):
        source = (ROOT / "bin" / "signoff_impact.py").read_text(encoding="utf-8")
        run = "\n".join(str(step.get("run", "")) for step in self.steps)
        for text in (source, run):
            for forbidden in ("git push", "git rebase", "gh pr comment", "/comments", "/merge"):
                self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()
