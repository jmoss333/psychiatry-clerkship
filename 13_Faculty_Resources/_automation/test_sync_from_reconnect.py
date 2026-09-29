#!/usr/bin/env python3
"""Behavior tests for the report-only ReConnect sync engine (#899).

Parity comes first. The crisis report has to stay byte-identical to what the
legacy script printed. The oracle for that is
tests/fixtures/reconnect/crisis_report.golden.txt, which was produced by the
pre-refactor script (see that folder's README). Every test runs offline
against synthetic fixtures. No real ReConnect checkout is needed.
"""

import ast
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ENGINE = HERE / "sync_from_reconnect.py"
WRAPPER = HERE / "sync_crisis_from_reconnect.py"
FIXTURES = ROOT / "tests" / "fixtures" / "reconnect"
UPSTREAM = FIXTURES / "upstream"
LOCAL = FIXTURES / "local"
GOLDEN = FIXTURES / "crisis_report.golden.txt"
UPSTREAM_TOKEN = "<RECONNECT>/databases/core/data_all.json"
DATA_ALL = "databases/core/data_all.json"
LOCAL_FOR = {
    "crisis": LOCAL / "crisis_resources.json",
    "meds": LOCAL / "pharmacy.json",
    "evidence": LOCAL / "evidence_registry.json",
}
SOURCE_REPOSITORY = "https://github.com/jmoss333/reconnect-psychiatry-system.git"
GIT = shutil.which("git")
GIT_IDENTITY = [
    "-c", "user.name=Fixture",
    "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false",
]


def empty_inventory(directory: Path) -> Path:
    path = directory / "inventory.json"
    path.write_text(
        json.dumps({"schemaVersion": 1, "description": "Synthetic.", "records": []}),
        encoding="utf-8",
    )
    return path


def run(script: Path, *args) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(script), *map(str, args)],
        check=False,
        capture_output=True,
        text=True,
    )


def run_engine(dataset, inventory, *, reconnect=UPSTREAM, local=None, fmt="md"):
    return run(
        ENGINE,
        "--dataset", dataset,
        "--reconnect", reconnect,
        "--local", local or LOCAL_FOR[dataset],
        "--inventory", inventory,
        "--format", fmt,
    )


def git(cwd: Path, *args) -> str:
    result = subprocess.run(
        [GIT, *GIT_IDENTITY, "-C", str(cwd), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def make_repo(source: Path, destination: Path) -> str:
    shutil.copytree(source, destination)
    git(destination, "init", "-q")
    git(destination, "add", "-A")
    git(destination, "commit", "-q", "-m", "fixture")
    return git(destination, "rev-parse", "HEAD")


def load_engine_module():
    spec = importlib.util.spec_from_file_location("sync_from_reconnect", ENGINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CrisisParityTests(unittest.TestCase):
    """The refactor must not change a byte of the crisis report."""

    def assert_golden(self, result):
        self.assertEqual(result.stderr, "")
        actual = result.stdout.replace(str(UPSTREAM / DATA_ALL), UPSTREAM_TOKEN)
        self.assertEqual(actual, GOLDEN.read_text(encoding="utf-8"))

    def test_legacy_wrapper_matches_the_golden_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            inventory = empty_inventory(Path(temporary))
            result = run(
                WRAPPER,
                "--reconnect", UPSTREAM,
                "--local", LOCAL_FOR["crisis"],
                "--inventory", inventory,
            )
        self.assert_golden(result)
        # New contract: digit drift or an unresolvable ref exits 1 (the legacy script always exited 0).
        self.assertEqual(result.returncode, 1)

    def test_engine_crisis_markdown_is_the_legacy_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            result = run_engine("crisis", empty_inventory(Path(temporary)))
        self.assert_golden(result)


class ContractTests(unittest.TestCase):
    def test_production_defaults_are_pinned(self):
        # A test-only flag takes the production value as its default (CLAUDE.md, #711).
        module = load_engine_module()
        self.assertEqual(module.default_local("crisis"), ROOT / "crisis_resources.json")
        self.assertEqual(module.default_local("meds"), ROOT / "pharmacy.json")
        self.assertEqual(module.default_local("evidence"), ROOT / "evidence_registry.json")
        self.assertEqual(
            module.DEFAULT_INVENTORY,
            ROOT / "13_Faculty_Resources/_automation/provenance/reconnect_snapshot_provenance.json",
        )
        args = module.build_parser().parse_args(["--dataset", "crisis", "--reconnect", "x"])
        self.assertIsNone(args.local)
        self.assertEqual(args.inventory, module.DEFAULT_INVENTORY)
        self.assertEqual(args.format, "md")

    def test_reconnect_path_is_required(self):  # BR2
        result = run(ENGINE, "--dataset", "crisis")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--reconnect", result.stderr)

    def test_missing_upstream_exits_2_without_a_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            inventory = empty_inventory(Path(temporary))
            for dataset in ("crisis", "meds", "evidence"):
                with self.subTest(dataset=dataset):
                    result = run_engine(dataset, inventory, reconnect=Path(temporary) / "nope")
                    self.assertEqual(result.returncode, 2)
                    self.assertEqual(result.stdout, "")
                    self.assertIn("upstream not found", result.stderr)

    def test_no_machine_paths_in_source(self):  # BR2
        for path in (ENGINE, WRAPPER):
            source = path.read_text(encoding="utf-8")
            self.assertNotIn("/Users/", source, path.name)
            self.assertNotIn("/sessions/", source, path.name)

    def test_build_path_never_invokes_the_sync(self):  # BR3
        names = ("sync_from_reconnect", "sync_crisis_from_reconnect")
        site_build = HERE / "site_build"
        offenders = []
        for path in sorted(site_build.rglob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                modules = []
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and node.module:
                    modules = [node.module]
                if any(module.split(".")[-1] in names for module in modules):
                    offenders.append(str(path.relative_to(ROOT)))
        scripts = [*site_build.rglob("*.sh"), ROOT / "netlify.toml"]
        for path in sorted(scripts):
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.lstrip().startswith("#"):
                    continue
                if any(name in line for name in names):
                    offenders.append(f"{path.relative_to(ROOT)}: {line.strip()}")
        self.assertEqual(offenders, [], "the build must never depend on a ReConnect checkout (C4)")


class ReportTests(unittest.TestCase):
    def setUp(self):
        self._temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary.cleanup)
        self.inventory = empty_inventory(Path(self._temporary.name))

    def report(self, dataset, **kwargs):
        result = run_engine(dataset, self.inventory, fmt="json", **kwargs)
        self.assertEqual(result.stderr, "")
        return result.returncode, json.loads(result.stdout)

    def test_crisis_json_sections(self):
        code, report = self.report("crisis")
        self.assertEqual(code, 1)
        self.assertEqual(
            [(item["kind"], item["id"]) for item in report["conflicts"]],
            [("digits-differ", "fixture_regional"), ("unresolvable-ref", "fixture_bad_ref")],
        )
        self.assertEqual([item["id"] for item in report["stale"]], ["fixture_national", "fixture_text"])
        self.assertEqual(len(report["known_discrepancies"]), 1)
        self.assertIn("local-only: fixture_local_only", report["notes"])
        self.assertTrue(report["drift"])

    def test_meds_sections(self):
        code, report = self.report("meds")
        self.assertEqual(code, 1)
        self.assertEqual([item["id"] for item in report["added"]], ["gammatrol"])
        self.assertEqual(
            report["conflicts"],
            [{
                "kind": "index-shift",
                "id": "betamol",
                "ref": "medications[2]",
                "detail": "medications[2] is gammatrol, not betamol",
            }],
        )
        self.assertEqual([item["id"] for item in report["stale"]], ["alphazine", "gammatrol"])
        self.assertEqual(
            sorted(report["denylisted_upstream"]),
            [
                "MaineCare Status", "absolute_max_dose", "cost_plus_price", "goodrx_url",
                "pharmacy_options", "pregnancy_category", "starting_dose",
                "typical_dose_max", "typical_dose_min",
            ],
        )
        self.assertIsNone(report["pinned"])

    def test_meds_without_a_local_registry_lists_candidates_only(self):
        missing = Path(self._temporary.name) / "pharmacy.json"
        code, report = self.report("meds", local=missing)
        self.assertEqual(code, 0)
        self.assertEqual([item["id"] for item in report["added"]], ["alphazine", "betamol", "gammatrol"])
        self.assertFalse(report["local"]["exists"])
        self.assertFalse(report["drift"])
        markdown = run_engine("meds", self.inventory, local=missing)
        self.assertIn("not found — treated as empty", markdown.stdout)

    def test_evidence_sections(self):
        code, report = self.report("evidence")
        self.assertEqual(code, 1)
        self.assertEqual([item["pmid"] for item in report["added"]], ["90000003"])
        self.assertEqual(
            report["conflicts"],
            [{
                "kind": "doi-mismatch",
                "id": "fixture-two",
                "pmid": "90000002",
                "upstream_doi": "10.9999/fixture.2",
                "local_doi": "10.9999/fixture.2-conflicting",
            }],
        )
        self.assertIn("matched: 1", report["notes"])

    def test_reports_are_deterministic(self):  # BR7
        for dataset in ("crisis", "meds", "evidence"):
            for fmt in ("md", "json"):
                with self.subTest(dataset=dataset, fmt=fmt):
                    first = run_engine(dataset, self.inventory, fmt=fmt)
                    second = run_engine(dataset, self.inventory, fmt=fmt)
                    self.assertEqual(first.stdout, second.stdout)
                    self.assertTrue(first.stdout)


@unittest.skipIf(GIT is None, "git is required for revision-pinned tests")
class GitBackedTests(unittest.TestCase):
    def setUp(self):
        self._temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary.cleanup)
        base = Path(self._temporary.name)
        self.upstream = base / "reconnect"
        self.clerkship = base / "clerkship"
        self.pinned = make_repo(UPSTREAM, self.upstream)
        make_repo(LOCAL, self.clerkship)
        self.inventory = base / "inventory.json"
        self.write_inventory([])

    def write_inventory(self, records):
        self.inventory.write_text(
            json.dumps({"schemaVersion": 1, "description": "Synthetic.", "records": records}),
            encoding="utf-8",
        )

    def derived_record(self, **overrides):
        source = subprocess.run(
            [GIT, "-C", str(self.upstream), "show", f"{self.pinned}:{DATA_ALL}"],
            check=True,
            capture_output=True,
        ).stdout
        record = {
            "derivedPath": "pharmacy.json",
            "dataset": "medications",
            "sourceRepository": SOURCE_REPOSITORY,
            "sourcePath": DATA_ALL,
            "sourceRevision": self.pinned,
            "sourceSha256": hashlib.sha256(source).hexdigest(),
            "sourceRecords": [0, 1, 2],
            "fieldMap": {"class": "drug_class", "mechanism.t1": "mechanism_of_action"},
            "relation": "derived",
            "clinicalReviewRequired": True,
            "syncPolicy": "manual-reviewed-only",
        }
        record.update(overrides)
        return record

    def edit_upstream(self, mutate):
        path = self.upstream / DATA_ALL
        data = json.loads(path.read_text(encoding="utf-8"))
        mutate(data)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        git(self.upstream, "commit", "-q", "-am", "edit")

    def meds_report(self):
        result = run_engine(
            "meds", self.inventory,
            reconnect=self.upstream, local=self.clerkship / "pharmacy.json", fmt="json",
        )
        self.assertEqual(result.stderr, "")
        return result.returncode, json.loads(result.stdout)

    def test_a_run_leaves_both_worktrees_clean(self):  # BR1
        self.write_inventory([self.derived_record()])
        for dataset in ("crisis", "meds", "evidence"):
            local = self.clerkship / LOCAL_FOR[dataset].name
            for fmt in ("md", "json"):
                run_engine(dataset, self.inventory, reconnect=self.upstream, local=local, fmt=fmt)
        for repo in (self.upstream, self.clerkship):
            status = git(repo, "status", "--porcelain", "--untracked-files=all")
            self.assertEqual(status, "", repo.name)

    def test_pinned_revision_reports_changed_and_removed_fields(self):
        self.write_inventory([self.derived_record()])

        def mutate(data):
            data["medications"][0]["drug_class"] = "Fixture Class A2"
            del data["medications"][2]

        self.edit_upstream(mutate)
        code, report = self.meds_report()
        self.assertEqual(code, 1)
        self.assertEqual(report["pinned"]["revision"], self.pinned)
        self.assertEqual(
            report["changed"],
            [{
                "record": 0,
                "id": "alphazine",
                "field": "drug_class",
                "target": "class",
                "before": "Fixture Class A",
                "after": "Fixture Class A2",
            }],
        )
        self.assertEqual(report["removed"], [{"record": 2, "id": "gammatrol"}])

    def test_unchanged_pinned_revision_reports_no_field_drift(self):
        self.write_inventory([self.derived_record()])
        code, report = self.meds_report()
        self.assertEqual(report["changed"], [])
        self.assertEqual(report["removed"], [])
        # The fixture's betamol ref still points at gammatrol, so the index-shift conflict remains.
        self.assertEqual(code, 1)

    def test_pinned_hash_mismatch_is_a_conflict_not_a_diff(self):
        self.write_inventory([self.derived_record(sourceSha256="f" * 64)])
        code, report = self.meds_report()
        self.assertEqual(code, 1)
        self.assertIn("pinned-hash-mismatch", [item["kind"] for item in report["conflicts"]])
        self.assertEqual(report["changed"], [])

    def test_unknown_pinned_revision_is_a_conflict(self):
        self.write_inventory([self.derived_record(sourceRevision="0" * 40)])
        code, report = self.meds_report()
        self.assertEqual(code, 1)
        self.assertIn("pinned-revision-missing", [item["kind"] for item in report["conflicts"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
