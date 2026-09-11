#!/usr/bin/env python3
"""Falsification for the scoped Netlify build-ignore rule.

Two contracts are proved here, and the second one is the reason this file exists.

1. THE SCRIPT SKIPS ONLY WHEN IT IS SAFE TO. netlify_ignore_scoped.sh decides whether a
   Netlify PRODUCTION deploy happens at all, so every one of its escape hatches is exercised
   against a real throwaway git repository: a touched scope builds, an untouched scope skips,
   and every unknown -- a non-production context, a missing CACHED_COMMIT_REF, a commit that
   is not in the clone, a scope path that no longer exists -- BUILDS. The asymmetry is the
   point: a needless build costs about ten cents, a wrongly skipped one ships stale content
   to a learner.

2. THE SCOPE IS DECLARED IN EXACTLY ONE PLACE. Each satellite's scope lives in its
   netlify.toml (what Netlify obeys) and in bin/check_netlify_deploy_health.py's SITES table
   (what the alarm watches). Those two can drift silently -- someone re-homes a site, updates
   the toml, and the alarm keeps watching a path nothing builds from. So the toml is parsed
   and compared to the table, including the relative path from the site's base directory back
   to the script.
"""
from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (
    REPO_ROOT
    / "13_Faculty_Resources"
    / "_automation"
    / "site_build"
    / "netlify_ignore_scoped.sh"
)
HEALTH_TOOL = REPO_ROOT / "bin" / "check_netlify_deploy_health.py"
IGNORE_LINE = re.compile(r"^\s*ignore\s*=\s*'bash (?P<script>\S+) (?P<scope>.+)'\s*$")

SKIP = 0
BUILD = 1


def _load_sites():
    spec = importlib.util.spec_from_file_location("_deploy_health", HEALTH_TOOL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SITES


def _git(cwd, *args):
    subprocess.run(
        ["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


def _rev(cwd, ref="HEAD"):
    return subprocess.run(
        ["git", "rev-parse", ref], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


class ScopedIgnoreScriptTest(unittest.TestCase):
    """Exercise the real script against a real repository."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.repo = self.tmp / "repo"
        (self.repo / "widget").mkdir(parents=True)
        (self.repo / "elsewhere").mkdir()
        _git(self.repo.parent, "init", "-q", "-b", "main", str(self.repo))
        (self.repo / "widget" / "index.html").write_text("one\n")
        (self.repo / "elsewhere" / "notes.md").write_text("one\n")
        _git(self.repo, "add", "-A")
        _git(self.repo, "commit", "-qm", "first")
        self.base = _rev(self.repo)

    def _run(self, scope="widget", env=None, cwd=None):
        environment = dict(os.environ)
        environment.pop("CACHED_COMMIT_REF", None)
        environment.pop("COMMIT_REF", None)
        environment["CONTEXT"] = "production"
        environment["CACHED_COMMIT_REF"] = self.base
        environment["COMMIT_REF"] = _rev(self.repo)
        if env is not None:
            for key, value in env.items():
                if value is None:
                    environment.pop(key, None)
                else:
                    environment[key] = value
        return subprocess.run(
            ["bash", str(SCRIPT), scope],
            cwd=str(cwd or (self.repo / "widget")),
            env=environment,
            capture_output=True,
            text=True,
        )

    def _commit_change(self, relative):
        target = self.repo / relative
        target.write_text("two\n")
        _git(self.repo, "add", "-A")
        _git(self.repo, "commit", "-qm", "second")

    def test_untouched_scope_skips(self):
        self._commit_change("elsewhere/notes.md")
        result = self._run()
        self.assertEqual(result.returncode, SKIP, result.stdout + result.stderr)
        self.assertIn("SKIP", result.stdout)

    def test_touched_scope_builds(self):
        self._commit_change("widget/index.html")
        self.assertEqual(self._run().returncode, BUILD)

    def test_identical_commits_skip(self):
        result = self._run(env={"COMMIT_REF": self.base})
        self.assertEqual(result.returncode, SKIP, result.stdout + result.stderr)

    def test_non_production_context_builds(self):
        self._commit_change("elsewhere/notes.md")
        for context in ("deploy-preview", "branch-deploy", None):
            with self.subTest(context=context):
                result = self._run(env={"CONTEXT": context})
                self.assertEqual(result.returncode, BUILD, result.stdout)

    def test_missing_cached_commit_builds(self):
        self._commit_change("elsewhere/notes.md")
        result = self._run(env={"CACHED_COMMIT_REF": None})
        self.assertEqual(result.returncode, BUILD, result.stdout)
        self.assertIn("CACHED_COMMIT_REF", result.stdout)

    def test_unknown_commit_builds(self):
        self._commit_change("elsewhere/notes.md")
        result = self._run(env={"CACHED_COMMIT_REF": "0" * 40})
        self.assertEqual(result.returncode, BUILD, result.stdout)

    def test_missing_scope_path_builds(self):
        self._commit_change("elsewhere/notes.md")
        result = self._run(scope="no-such-directory")
        self.assertEqual(result.returncode, BUILD, result.stdout)

    def test_no_scope_argument_builds(self):
        result = subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=str(self.repo),
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, BUILD, result.stdout)

    def test_outside_a_git_worktree_builds(self):
        result = self._run(cwd=self.tmp)
        self.assertNotEqual(result.returncode, SKIP, result.stdout)


class ScopeDeclarationTest(unittest.TestCase):
    """The toml Netlify obeys and the table the alarm watches must agree."""

    def setUp(self):
        self.sites = _load_sites()

    def test_script_is_executable_and_tracked(self):
        self.assertTrue(SCRIPT.is_file(), "netlify_ignore_scoped.sh is missing")
        self.assertTrue(os.access(SCRIPT, os.X_OK), "script is not executable")

    def test_satellites_declare_a_matching_scope(self):
        satellites = [site for site in self.sites if site["scope"] is not None]
        self.assertTrue(satellites, "no satellite sites declared")
        for site in satellites:
            with self.subTest(site=site["slug"]):
                toml_path = REPO_ROOT / site["toml"]
                self.assertTrue(toml_path.is_file(), site["toml"])
                lines = [
                    IGNORE_LINE.match(line)
                    for line in toml_path.read_text().splitlines()
                ]
                matches = [match for match in lines if match]
                self.assertEqual(
                    len(matches), 1, "expected exactly one scoped ignore in %s" % site["toml"]
                )
                match = matches[0]
                self.assertEqual(match.group("scope"), site["scope"])
                resolved = (toml_path.parent / match.group("script")).resolve()
                self.assertEqual(
                    resolved,
                    SCRIPT.resolve(),
                    "%s points at %s" % (site["toml"], resolved),
                )
                self.assertTrue(
                    (REPO_ROOT / site["scope"]).exists(),
                    "declared scope %s does not exist" % site["scope"],
                )

    def test_learner_sites_still_always_build(self):
        """The two learner sites are built from the whole repo. Never scope them."""
        root = (REPO_ROOT / "netlify.toml").read_text()
        self.assertIn('ignore = "/bin/false"', root)
        for site in self.sites:
            if site["scope"] is None:
                self.assertEqual(site["toml"], "netlify.toml")

    def test_metrics_toml_is_scoped_even_though_it_has_no_project_yet(self):
        """metrics/ has a netlify.toml and no Netlify project. Keep them consistent."""
        text = (REPO_ROOT / "metrics" / "netlify.toml").read_text()
        matches = [line for line in text.splitlines() if IGNORE_LINE.match(line)]
        self.assertEqual(len(matches), 1, "metrics/netlify.toml is not scoped")


if __name__ == "__main__":
    unittest.main()
