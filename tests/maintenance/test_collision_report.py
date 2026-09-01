import json
import os
import unittest
from io import StringIO
from pathlib import Path
from subprocess import CompletedProcess
from tempfile import TemporaryDirectory
from unittest.mock import patch


from tools.coordination.collision_report import (
    EvidenceSnapshot,
    LocalEvidence,
    ProbeFailure,
    PullRequestEvidence,
    ReadOnlyRunner,
    build_report,
    collect_evidence,
    exit_code,
    main,
    normalize_repo_path,
    paths_overlap,
    render_text,
)


OBSERVED_AT = "2026-09-01T14:30:00Z"
HEAD_A = "0123456789abcdef0123456789abcdef01234567"
HEAD_B = "0123456789ab0000000000000000000000000000"


class FixtureRunner:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def run(self, argv, *, cwd):
        key = tuple(argv)
        self.calls.append((key, str(cwd)))
        response = self.responses[key]
        if isinstance(response, Exception):
            raise response
        return response


def pr(number, head_oid=HEAD_A, *paths):
    return PullRequestEvidence(
        number=number,
        head_oid=head_oid,
        base_ref="main",
        paths=tuple(paths),
    )


class CollisionReportTests(unittest.TestCase):
    def test_normalize_repo_path_canonicalizes_relative_posix_paths(self):
        cases = (
            ("README.md", "README.md"),
            ("./docs//plans/./next.md", "docs/plans/next.md"),
            ("docs/plans/", "docs/plans"),
            ("Docs/Plan.md", "Docs/Plan.md"),
        )
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(normalize_repo_path(raw), expected)

    def test_normalize_repo_path_rejects_paths_that_can_escape_or_expose_a_checkout(self):
        unsafe_paths = (
            "",
            ".",
            "..",
            "../outside.md",
            "docs/../README.md",
            "docs/../../outside.md",
            "/Users/alice/private.md",
            "C:\\Users\\Alice\\private.md",
            ".git/config",
            "docs/\x00plan.md",
        )
        for raw in unsafe_paths:
            with self.subTest(raw=repr(raw)):
                with self.assertRaises(ValueError):
                    normalize_repo_path(raw)

    def test_paths_overlap_only_at_whole_path_component_boundaries(self):
        overlapping = (
            ("docs", "docs"),
            ("docs", "docs/plan.md"),
            ("docs/plan.md", "docs"),
            ("docs/plan.md", "./docs//plan.md"),
        )
        separate = (
            ("docs", "docs-old/plan.md"),
            ("docs/plan.md", "docs/plan.md.bak"),
            ("tools/a", "tools/ab"),
        )
        for left, right in overlapping:
            with self.subTest(left=left, right=right):
                self.assertTrue(paths_overlap(left, right))
        for left, right in separate:
            with self.subTest(left=left, right=right):
                self.assertFalse(paths_overlap(left, right))

    def test_paths_overlap_case_folding_is_explicit(self):
        self.assertFalse(paths_overlap("Docs/Plan.md", "docs/plan.md"))
        self.assertTrue(
            paths_overlap(
                "Docs/Plan.md",
                "docs/plan.md",
                case_insensitive=True,
            )
        )

    def test_each_evidence_class_maps_to_its_required_status_and_reason(self):
        cases = (
            (
                "dirty",
                EvidenceSnapshot(
                    dirty=(LocalEvidence("docs", "wt1"),),
                ),
                "OCCUPIED",
                ["local_dirty_overlap"],
            ),
            (
                "active branch",
                EvidenceSnapshot(
                    active_branch=(LocalEvidence("docs", "wt2"),),
                ),
                "OCCUPIED",
                ["active_branch_overlap"],
            ),
            (
                "inactive branch",
                EvidenceSnapshot(
                    inactive_branch=(LocalEvidence("docs", "wt3"),),
                ),
                "COORDINATE",
                ["inactive_branch_overlap"],
            ),
            (
                "active agent scope",
                EvidenceSnapshot(
                    active_scopes=(LocalEvidence("docs", "wt4"),),
                ),
                "COORDINATE",
                ["active_agent_scope"],
            ),
            (
                "open pull request",
                EvidenceSnapshot(
                    pull_requests=(pr(17, HEAD_A, "docs"),),
                ),
                "COORDINATE",
                ["open_pr_overlap"],
            ),
            (
                "degraded evidence",
                EvidenceSnapshot(degraded_sources=("github",)),
                "COORDINATE",
                ["incomplete_evidence"],
            ),
            (
                "complete and clear",
                EvidenceSnapshot(),
                "SAFE",
                ["no_collision"],
            ),
        )
        for label, snapshot, expected_status, expected_reasons in cases:
            with self.subTest(label=label):
                report = build_report(
                    ["docs/plan.md"],
                    snapshot,
                    observed_at=OBSERVED_AT,
                )
                self.assertEqual(report["overall"], expected_status)
                self.assertEqual(report["paths"][0]["status"], expected_status)
                self.assertEqual(
                    report["paths"][0]["reasonCodes"],
                    expected_reasons,
                )

    def test_classification_preserves_all_reasons_in_priority_order(self):
        snapshot = EvidenceSnapshot(
            dirty=(LocalEvidence("docs", "wt1"),),
            active_branch=(LocalEvidence("docs", "wt2"),),
            inactive_branch=(LocalEvidence("docs", "wt3"),),
            active_scopes=(LocalEvidence("docs", "wt4"),),
            pull_requests=(
                pr(19, HEAD_A, "docs"),
                pr(7, HEAD_A, "docs"),
            ),
            degraded_sources=("github",),
        )

        report = build_report(
            ["docs/plan.md"],
            snapshot,
            observed_at=OBSERVED_AT,
        )

        self.assertFalse(report["evidenceComplete"])
        self.assertEqual(report["overall"], "OCCUPIED")
        self.assertEqual(
            report["paths"],
            [
                {
                    "path": "docs/plan.md",
                    "status": "OCCUPIED",
                    "reasonCodes": [
                        "local_dirty_overlap",
                        "active_branch_overlap",
                        "inactive_branch_overlap",
                        "active_agent_scope",
                        "open_pr_overlap",
                        "duplicate_open_pr_head",
                        "incomplete_evidence",
                    ],
                    "matchedPaths": ["docs"],
                    "prNumbers": [7, 19],
                    "worktreeIds": [
                        "wt1",
                        "wt2",
                        "wt3",
                        "wt4",
                    ],
                }
            ],
        )

    def test_snapshot_case_insensitive_mode_applies_to_report_classification(self):
        evidence = (LocalEvidence("docs", "wt1"),)
        sensitive = build_report(
            ["Docs/Plan.md"],
            EvidenceSnapshot(active_branch=evidence),
            observed_at=OBSERVED_AT,
        )
        insensitive = build_report(
            ["Docs/Plan.md"],
            EvidenceSnapshot(active_branch=evidence, case_insensitive=True),
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(sensitive["paths"][0]["status"], "SAFE")
        self.assertEqual(insensitive["paths"][0]["status"], "OCCUPIED")

    def test_active_agent_at_worktree_root_coordinates_every_proposed_path(self):
        report = build_report(
            ["anywhere/file.md"],
            EvidenceSnapshot(active_scopes=(LocalEvidence(".", "wt1"),)),
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(report["overall"], "COORDINATE")
        self.assertEqual(
            report["paths"][0]["reasonCodes"],
            ["active_agent_scope"],
        )
        self.assertEqual(report["paths"][0]["matchedPaths"], ["."])

    def test_duplicate_pr_heads_compare_full_oids_but_report_only_a_short_prefix(self):
        snapshot = EvidenceSnapshot(
            pull_requests=(
                pr(11, HEAD_A, "docs"),
                pr(3, HEAD_B, "docs"),
                pr(7, HEAD_A, "docs"),
            )
        )

        report = build_report(
            ["docs/plan.md"],
            snapshot,
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(
            report["duplicateOpenPrHeads"],
            [{"headOid": "0123456789ab", "prNumbers": [7, 11]}],
        )
        self.assertEqual(report["paths"][0]["prNumbers"], [3, 7, 11])
        self.assertIn(
            "duplicate_open_pr_head",
            report["paths"][0]["reasonCodes"],
        )
        serialized = json.dumps(report, sort_keys=True)
        self.assertNotIn(HEAD_A, serialized)
        self.assertNotIn(HEAD_B, serialized)

    def test_report_and_text_are_deterministic_and_omit_unneeded_branch_metadata(self):
        first = EvidenceSnapshot(
            inactive_branch=(
                LocalEvidence("zeta", "wt2"),
                LocalEvidence("alpha", "wt1"),
            ),
            pull_requests=(
                PullRequestEvidence(
                    number=20,
                    head_oid="f" * 40,
                    base_ref="users/alice/private-topic",
                    paths=("zeta",),
                ),
                PullRequestEvidence(
                    number=4,
                    head_oid="e" * 40,
                    base_ref="users/alice/private-topic",
                    paths=("alpha",),
                ),
            ),
            degraded_sources=("github", "local_git"),
        )
        second = EvidenceSnapshot(
            inactive_branch=tuple(reversed(first.inactive_branch)),
            pull_requests=tuple(reversed(first.pull_requests)),
            degraded_sources=tuple(reversed(first.degraded_sources)),
        )

        report_one = build_report(
            ["zeta/file.md", "alpha/file.md"],
            first,
            observed_at=OBSERVED_AT,
        )
        report_two = build_report(
            ["alpha/file.md", "zeta/file.md"],
            second,
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(report_one, report_two)
        self.assertEqual(render_text(report_one), render_text(report_two))
        self.assertEqual(
            [entry["path"] for entry in report_one["paths"]],
            ["alpha/file.md", "zeta/file.md"],
        )
        self.assertEqual(report_one["degradedSources"], ["github", "local_git"])
        serialized_outputs = json.dumps(report_one, sort_keys=True) + render_text(
            report_one
        )
        self.assertNotIn("users/alice/private-topic", serialized_outputs)
        self.assertNotIn("f" * 40, serialized_outputs)
        self.assertNotIn("e" * 40, serialized_outputs)

    def test_build_report_rejects_unsafe_evidence_without_echoing_private_path(self):
        private_path = "/Users/alice/Private/notes.md"
        snapshot = EvidenceSnapshot(
            dirty=(LocalEvidence(private_path, "wt1"),),
        )

        with self.assertRaises(ValueError) as caught:
            build_report(
                ["docs/plan.md"],
                snapshot,
                observed_at=OBSERVED_AT,
            )

        self.assertNotIn(private_path, str(caught.exception))

    def test_build_report_rejects_unsanitized_metadata_without_echoing_it(self):
        private_value = "/Users/alice/Private/session-token"
        snapshots = (
            EvidenceSnapshot(
                dirty=(LocalEvidence("docs/plan.md", private_value),),
            ),
            EvidenceSnapshot(degraded_sources=(private_value,)),
            EvidenceSnapshot(
                pull_requests=(
                    pr(1, private_value, "docs/plan.md"),
                    pr(2, private_value, "docs/plan.md"),
                )
            ),
        )

        for snapshot in snapshots:
            with self.subTest(snapshot=snapshot):
                with self.assertRaises(ValueError) as caught:
                    build_report(
                        ["docs/plan.md"],
                        snapshot,
                        observed_at=OBSERVED_AT,
                    )
                self.assertNotIn(private_value, str(caught.exception))

    def test_text_rendering_escapes_terminal_control_characters_in_paths(self):
        unsafe_for_terminal = "docs/line\nbreak\t\x1b-\udcff.md"
        report = build_report(
            [unsafe_for_terminal],
            EvidenceSnapshot(
                dirty=(LocalEvidence(unsafe_for_terminal, "wt1"),),
            ),
            observed_at=OBSERVED_AT,
        )

        rendered = render_text(report)

        self.assertNotIn(unsafe_for_terminal, rendered)
        self.assertNotIn("\x1b", rendered)
        self.assertIn(r'"docs/line\nbreak\t\u001b-\udcff.md"', rendered)

    def test_report_schema_and_exit_codes_distinguish_report_from_check_mode(self):
        safe = build_report(
            ["docs/plan.md"],
            EvidenceSnapshot(),
            observed_at=OBSERVED_AT,
        )
        coordinate = build_report(
            ["docs/plan.md"],
            EvidenceSnapshot(degraded_sources=("github",)),
            observed_at=OBSERVED_AT,
        )
        occupied = build_report(
            ["docs/plan.md"],
            EvidenceSnapshot(
                dirty=(LocalEvidence("docs", "wt1"),),
            ),
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(
            safe,
            {
                "schemaVersion": 1,
                "observedAt": OBSERVED_AT,
                "evidenceComplete": True,
                "overall": "SAFE",
                "degradedSources": [],
                "duplicateOpenPrHeads": [],
                "paths": [
                    {
                        "path": "docs/plan.md",
                        "status": "SAFE",
                        "reasonCodes": ["no_collision"],
                        "matchedPaths": [],
                        "prNumbers": [],
                        "worktreeIds": [],
                    }
                ],
            },
        )
        for report in (safe, coordinate, occupied):
            with self.subTest(mode="report", overall=report["overall"]):
                self.assertEqual(exit_code(report, check=False), 0)
        self.assertEqual(exit_code(safe, check=True), 0)
        self.assertEqual(exit_code(coordinate, check=True), 3)
        self.assertEqual(exit_code(occupied, check=True), 3)


class CollisionCollectorTests(unittest.TestCase):
    def fixture_runner(self, *, changed_files=3, file_records=None):
        repo = "/repo"
        feature = "/repo/.worktrees/feature"
        if file_records is None:
            file_records = [
                {
                    "filename": "src/pr-new.py",
                    "previous_filename": "src/pr-old.py",
                    "status": "renamed",
                },
                {"filename": "docs/pr.md", "status": "modified"},
                {"filename": "tests/pr.test.py", "status": "added"},
            ]
        responses = {
            ("git", "worktree", "list", "--porcelain"): (
                b"worktree /repo\nHEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
                b"branch refs/heads/main\n\n"
                b"worktree /repo/.worktrees/feature\n"
                b"HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n"
                b"branch refs/heads/feature\n\n"
            ),
            (
                "git",
                "symbolic-ref",
                "--quiet",
                "--short",
                "refs/remotes/origin/HEAD",
            ): b"origin/main\n",
            ("git", "config", "--bool", "core.ignorecase"): b"true\n",
            (
                "git",
                "-C",
                repo,
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
            ): (
                b"?? shared/new file.md\0"
                b"R  docs/new-name.md\0docs/old-name.md\0"
            ),
            (
                "git",
                "-C",
                repo,
                "diff",
                "--name-status",
                "-z",
                "--find-renames",
                "origin/main...HEAD",
            ): b"",
            (
                "git",
                "-C",
                feature,
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
            ): b"",
            (
                "git",
                "-C",
                feature,
                "diff",
                "--name-status",
                "-z",
                "--find-renames",
                "origin/main...HEAD",
            ): (
                b"M\0src/feature.py\0"
                b"R100\0docs/branch-old.md\0docs/branch-new.md\0"
            ),
            ("claude", "agents", "--json"): json.dumps(
                [
                    {
                        "kind": "interactive",
                        "pid": 321,
                        "cwd": feature,
                        "name": "private-session-name",
                    }
                ]
            ).encode(),
            ("gh", "repo", "view", "--json", "nameWithOwner"): json.dumps(
                {"nameWithOwner": "example/repo"}
            ).encode(),
            (
                "gh",
                "api",
                "--paginate",
                "--slurp",
                "repos/example/repo/pulls?state=open&per_page=100",
            ): json.dumps(
                [
                    [
                        {
                            "number": 17,
                            "head": {"sha": HEAD_A},
                            "base": {"ref": "main"},
                            "title": "PRIVATE TITLE",
                        }
                    ]
                ]
            ).encode(),
            (
                "gh",
                "api",
                "repos/example/repo/pulls/17",
            ): json.dumps(
                {
                    "number": 17,
                    "changed_files": changed_files,
                    "head": {"sha": HEAD_A},
                    "base": {"ref": "main"},
                    "title": "PRIVATE TITLE",
                }
            ).encode(),
            (
                "gh",
                "api",
                "--paginate",
                "--slurp",
                "repos/example/repo/pulls/17/files?per_page=100",
            ): json.dumps([file_records]).encode(),
        }
        return FixtureRunner(responses)

    def test_collect_evidence_includes_dirty_rename_branch_agent_and_pr_rename_paths(self):
        runner = self.fixture_runner()

        snapshot = collect_evidence(Path("/repo"), runner=runner)

        self.assertTrue(snapshot.case_insensitive)
        self.assertEqual(snapshot.degraded_sources, ())
        self.assertEqual(
            {(item.path, item.worktree_id) for item in snapshot.dirty},
            {
                ("shared/new file.md", "wt1"),
                ("docs/new-name.md", "wt1"),
                ("docs/old-name.md", "wt1"),
            },
        )
        self.assertEqual(
            {(item.path, item.worktree_id) for item in snapshot.active_branch},
            {
                ("src/feature.py", "wt2"),
                ("docs/branch-old.md", "wt2"),
                ("docs/branch-new.md", "wt2"),
            },
        )
        self.assertEqual(snapshot.inactive_branch, ())
        self.assertEqual(snapshot.active_scopes, (LocalEvidence(".", "wt2"),))
        self.assertEqual(
            snapshot.pull_requests,
            (
                PullRequestEvidence(
                    number=17,
                    head_oid=HEAD_A,
                    base_ref="main",
                    paths=(
                        "docs/pr.md",
                        "src/pr-new.py",
                        "src/pr-old.py",
                        "tests/pr.test.py",
                    ),
                ),
            ),
        )

    def test_collect_evidence_fails_closed_but_keeps_stronger_local_evidence(self):
        runner = self.fixture_runner()
        runner.responses[("claude", "agents", "--json")] = ProbeFailure(
            "private process error"
        )
        runner.responses[("gh", "repo", "view", "--json", "nameWithOwner")] = (
            ProbeFailure("secret github error")
        )

        snapshot = collect_evidence(Path("/repo"), runner=runner)
        report = build_report(
            ["shared/new file.md"],
            snapshot,
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(snapshot.degraded_sources, ("claude_agents", "github"))
        self.assertEqual(report["overall"], "OCCUPIED")
        serialized = json.dumps(report, sort_keys=True)
        self.assertNotIn("private process error", serialized)
        self.assertNotIn("secret github error", serialized)

    def test_collect_evidence_marks_github_incomplete_when_file_count_disagrees(self):
        runner = self.fixture_runner(changed_files=4)

        snapshot = collect_evidence(Path("/repo"), runner=runner)

        self.assertIn("github", snapshot.degraded_sources)
        self.assertEqual(snapshot.pull_requests[0].number, 17)

    def test_collect_evidence_fails_closed_for_malformed_claude_agent_records(self):
        runner = self.fixture_runner()
        runner.responses[("claude", "agents", "--json")] = json.dumps(
            [{"kind": "interactive", "name": "missing-cwd"}]
        ).encode()

        snapshot = collect_evidence(Path("/repo"), runner=runner)

        self.assertIn("claude_agents", snapshot.degraded_sources)
        self.assertEqual(snapshot.active_scopes, ())

    def test_collect_evidence_rejects_a_partial_worktree_listing(self):
        runner = self.fixture_runner()
        runner.responses[("git", "worktree", "list", "--porcelain")] = (
            b"worktree /repo\nHEAD " + b"a" * 40 + b"\nbranch refs/heads/main\n\n"
            b"HEAD " + b"b" * 40 + b"\nbranch refs/heads/missing-root\n\n"
        )

        with self.assertRaises(ProbeFailure):
            collect_evidence(Path("/repo"), runner=runner)

    def test_read_only_runner_rejects_mutating_or_unknown_commands_before_execution(self):
        runner = ReadOnlyRunner()
        unsafe = (
            ("git", "fetch"),
            ("git", "checkout", "main"),
            (
                "git",
                "-C",
                "/repo",
                "diff",
                "--name-status",
                "-z",
                "--find-renames",
                "--output=/tmp/leak",
                "origin/main...HEAD",
            ),
            ("gh", "pr", "comment", "17", "--body", "hello"),
            (
                "gh",
                "api",
                "--method=DELETE",
                "repos/example/repo/pulls/17",
            ),
            ("rm", "-rf", "docs"),
        )

        for argv in unsafe:
            with self.subTest(argv=argv):
                with self.assertRaises(ValueError):
                    runner.run(argv, cwd=Path("/repo"))

    def test_read_only_runner_accepts_only_the_intended_probe_shapes(self):
        safe = (
            ("git", "worktree", "list", "--porcelain"),
            (
                "git",
                "-C",
                "/repo",
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
            ),
            (
                "git",
                "-C",
                "/repo",
                "diff",
                "--name-status",
                "-z",
                "--find-renames",
                "origin/main...HEAD",
            ),
            (
                "gh",
                "api",
                "repos/example/repo/pulls/17",
            ),
            (
                "gh",
                "api",
                "--paginate",
                "--slurp",
                "repos/example/repo/pulls?state=open&per_page=100",
            ),
            (
                "gh",
                "api",
                "--paginate",
                "--slurp",
                "repos/example/repo/pulls/17/files?per_page=100",
            ),
        )

        for argv in safe:
            with self.subTest(argv=argv):
                self.assertTrue(ReadOnlyRunner._allowed(argv))

    def test_read_only_runner_scrubs_git_overrides_and_disables_locks(self):
        runner = ReadOnlyRunner()
        command = ("git", "worktree", "list", "--porcelain")
        inherited = {
            "GIT_DIR": "/private/repository",
            "GIT_WORK_TREE": "/private/worktree",
            "GIT_TRACE2_EVENT": "/private/trace.json",
            "GIT_CONFIG_COUNT": "1",
            "GIT_CONFIG_KEY_0": "core.hooksPath",
            "GIT_CONFIG_VALUE_0": "/private/hooks",
            "KEEP_ME": "yes",
        }

        with patch.dict(os.environ, inherited, clear=True), patch(
            "tools.coordination.collision_report.subprocess.run",
            return_value=CompletedProcess(command, 0, stdout=b"ok", stderr=b""),
        ) as run:
            self.assertEqual(runner.run(command, cwd=Path("/repo")), b"ok")

        passed_env = run.call_args.kwargs["env"]
        self.assertNotIn("GIT_DIR", passed_env)
        self.assertNotIn("GIT_WORK_TREE", passed_env)
        self.assertNotIn("GIT_TRACE2_EVENT", passed_env)
        self.assertNotIn("GIT_CONFIG_COUNT", passed_env)
        self.assertNotIn("GIT_CONFIG_KEY_0", passed_env)
        self.assertNotIn("GIT_CONFIG_VALUE_0", passed_env)
        self.assertEqual(passed_env["GIT_OPTIONAL_LOCKS"], "0")
        self.assertEqual(passed_env["KEEP_ME"], "yes")


class CollisionCliTests(unittest.TestCase):
    def fixture_runner(self):
        return CollisionCollectorTests().fixture_runner()

    def test_main_emits_stable_json_and_check_mode_uses_exit_three(self):
        stdout = StringIO()
        stderr = StringIO()

        result = main(
            [
                "--repo-root",
                "/repo",
                "--path",
                "src/pr-new.py",
                "--format",
                "json",
                "--check",
            ],
            runner=self.fixture_runner(),
            stdout=stdout,
            stderr=stderr,
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(result, 3)
        self.assertEqual(stderr.getvalue(), "")
        self.assertTrue(stdout.getvalue().endswith("\n"))
        report = json.loads(stdout.getvalue())
        self.assertEqual(report["overall"], "COORDINATE")
        self.assertEqual(report["observedAt"], OBSERVED_AT)
        self.assertEqual(report["paths"][0]["prNumbers"], [17])

    def test_main_redacts_probe_failures_and_returns_one(self):
        runner = self.fixture_runner()
        private_error = "/Users/alice/private token"
        runner.responses[("git", "worktree", "list", "--porcelain")] = (
            ProbeFailure(private_error)
        )
        stdout = StringIO()
        stderr = StringIO()

        result = main(
            ["--repo-root", "/repo", "--path", "docs/plan.md"],
            runner=runner,
            stdout=stdout,
            stderr=stderr,
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(result, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(
            stderr.getvalue(),
            "collision sentinel: unable to produce a valid report\n",
        )
        self.assertNotIn(private_error, stderr.getvalue())

    def test_main_reads_nonempty_paths_file_lines_in_report_mode(self):
        stdout = StringIO()
        stderr = StringIO()
        with TemporaryDirectory() as temporary:
            paths_file = Path(temporary, "proposed.txt")
            paths_file.write_text("\ndocs/pr.md\n", encoding="utf-8")

            result = main(
                [
                    "--repo-root",
                    "/repo",
                    "--paths-file",
                    str(paths_file),
                ],
                runner=self.fixture_runner(),
                stdout=stdout,
                stderr=stderr,
                observed_at=OBSERVED_AT,
            )

        self.assertEqual(result, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertIn('COORDINATE "docs/pr.md"', stdout.getvalue())

    def test_main_rejects_unsafe_proposed_path_without_echoing_it(self):
        stdout = StringIO()
        stderr = StringIO()
        private_path = "../private-plan.md"

        result = main(
            ["--repo-root", "/repo", "--path", private_path],
            runner=self.fixture_runner(),
            stdout=stdout,
            stderr=stderr,
            observed_at=OBSERVED_AT,
        )

        self.assertEqual(result, 2)
        self.assertEqual(stdout.getvalue(), "")
        self.assertNotIn(private_path, stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
