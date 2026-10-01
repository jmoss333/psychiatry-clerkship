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
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

# This module builds throwaway git repositories. An inherited GIT_DIR (every hook exports one,
# and bin/verify.sh is the pre-push hook) would aim them at the repository running the test.
# See bin/_git_env.py and tests/git-env-isolation.test.mjs.
sys.path.insert(0, str(ROOT / "bin"))
from _git_env import scrub_inherited_git_env  # noqa: E402

scrub_inherited_git_env()
ENGINE = HERE / "sync_from_reconnect.py"
WRAPPER = HERE / "sync_crisis_from_reconnect.py"
FIXTURES = ROOT / "tests" / "fixtures" / "reconnect"
UPSTREAM = FIXTURES / "upstream"
LOCAL = FIXTURES / "local"
GOLDEN = FIXTURES / "crisis_report.golden.txt"
FIELDMAP = FIXTURES / "fieldmap.json"
UPSTREAM_TOKEN = "<RECONNECT>/databases/core/data_all.json"
DATA_ALL = "databases/core/data_all.json"
LOCAL_FOR = {
    "crisis": LOCAL / "crisis_resources.json",
    "meds": LOCAL / "pharmacy.json",
    "evidence": LOCAL / "evidence_registry.json",
    "screening_tools": LOCAL / "screening_tools.json",  # absent on purpose: no registry yet
    "ebp": LOCAL / "therapies.json",  # absent on purpose: no registry yet
}
SCREENING_FIELDMAP = FIXTURES / "screening_tools_fieldmap.json"
EBP_FIELDMAP = FIXTURES / "ebp_fieldmap.json"
CUSTODIAN_SOURCES = HERE / "screening_tools" / "custodian_sources.json"
CHECKER = HERE / "reconnect_fieldmap.py"
SOURCE_REPOSITORY = "https://github.com/jmoss333/reconnect-psychiatry-system.git"
GIT = shutil.which("git")
HERMETIC_ENV = {**os.environ, "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}
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


def run_engine(dataset, inventory, *, reconnect=UPSTREAM, local=None, fmt="md", fieldmap=FIELDMAP):
    return run(
        ENGINE,
        "--dataset", dataset,
        "--reconnect", reconnect,
        "--local", local or LOCAL_FOR[dataset],
        "--inventory", inventory,
        "--format", fmt,
        "--fieldmap", fieldmap,
    )


def copy_upstream(directory: Path, mutate=None) -> Path:
    """A plain (non-git) copy of the upstream fixture, optionally edited."""
    destination = directory / "reconnect"
    shutil.copytree(UPSTREAM, destination)
    if mutate is not None:
        path = destination / DATA_ALL
        data = json.loads(path.read_text(encoding="utf-8"))
        mutate(data)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return destination


def write_pharmacy(directory: Path, records) -> Path:
    path = directory / "pharmacy.json"
    path.write_text(json.dumps({"schemaVersion": 1, "records": records}), encoding="utf-8")
    return path


def name_keyed(rid, name, carried):
    """A Phase 0 / G1-shaped pharmacy record: name-keyed ref plus carried upstream values."""
    return {
        "id": rid,
        "provenance": {"reconnectRecords": ["medications[name=%s]" % name], "carried": carried},
    }


def git(cwd: Path, *args) -> str:
    result = subprocess.run(
        [GIT, *GIT_IDENTITY, "-C", str(cwd), *args],
        check=True,
        capture_output=True,
        text=True,
        env=HERMETIC_ENV,
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
        self.assertEqual(module.default_local("screening_tools"), ROOT / "screening_tools.json")
        self.assertEqual(
            module.DEFAULT_INVENTORY,
            ROOT / "13_Faculty_Resources/_automation/provenance/reconnect_snapshot_provenance.json",
        )
        self.assertEqual(
            module.DEFAULT_FIELDMAP,
            ROOT / "13_Faculty_Resources/_automation/pharmacy/reconnect_meds_fieldmap.json",
        )
        # --fieldmap defaults to "the dataset's own production map": None on the parser, the
        # G0 meds map for meds, the screening map for screening_tools, nothing for the rest.
        self.assertEqual(module.fieldmap_for("meds"), module.DEFAULT_FIELDMAP)
        self.assertEqual(
            module.fieldmap_for("screening_tools"),
            ROOT / "13_Faculty_Resources/_automation/screening_tools/"
                   "reconnect_screening_tools_fieldmap.json",
        )
        self.assertEqual(module.default_local("ebp"), ROOT / "therapies.json")
        self.assertEqual(
            module.fieldmap_for("ebp"),
            ROOT / "13_Faculty_Resources/_automation/therapies/reconnect_ebp_fieldmap.json",
        )
        self.assertIsNone(module.fieldmap_for("crisis"))
        self.assertIsNone(module.fieldmap_for("evidence"))
        self.assertEqual(module.fieldmap_for("meds", "x.json"), Path("x.json"))
        args = module.build_parser().parse_args(["--dataset", "crisis", "--reconnect", "x"])
        self.assertIsNone(args.local)
        self.assertEqual(args.inventory, module.DEFAULT_INVENTORY)
        self.assertIsNone(args.fieldmap)
        self.assertEqual(args.format, "md")

    def test_engine_and_build_validator_read_one_denylist(self):  # AC13 / BR6, single source
        module = load_engine_module()
        spec = importlib.util.spec_from_file_location(
            "validate_pharmacy", HERE / "pharmacy" / "validate_pharmacy.py")
        validator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(validator)
        self.assertEqual(module.DEFAULT_FIELDMAP.resolve(), validator.FIELDMAP.resolve())
        source = ENGINE.read_text(encoding="utf-8")
        for key in ("starting_dose", "absolute_max_dose", "goodrx_url"):
            self.assertNotIn('"%s"' % key, source, "the engine must not restate the denylist")

    def test_production_field_map_is_internally_consistent(self):
        fieldmap = json.loads(load_engine_module().DEFAULT_FIELDMAP.read_text(encoding="utf-8"))
        self.assertEqual(fieldmap["upstream"]["field"], "medications")
        self.assertEqual(fieldmap["upstream"]["keyField"], "name")
        self.assertEqual(set(fieldmap["fieldMap"]) & set(fieldmap["denylist"]), set())
        self.assertLessEqual(
            {spec["class"] for spec in fieldmap["fieldMap"].values()}, set(fieldmap["classes"]))
        roster_ids = [agent["id"] for agent in fieldmap["phase1Roster"]]
        self.assertEqual(len(roster_ids), 45)
        self.assertEqual(len(set(roster_ids)), 45)
        self.assertTrue(all(isinstance(agent["reconnectNames"], list)
                            for agent in fieldmap["phase1Roster"]))
        # An empty reconnectNames is an agent authored from the label alone (4 of 45 at G0).
        unnamed = [agent["id"] for agent in fieldmap["phase1Roster"] if not agent["reconnectNames"]]
        self.assertLessEqual(len(unnamed), 4, unnamed)
        # G-1 Option A: every dose field is denylisted, never mapped.
        for key in ("starting_dose", "typical_dose_min", "typical_dose_max", "absolute_max_dose"):
            self.assertIn(key, fieldmap["denylist"])

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


class MedsFieldMapTests(unittest.TestCase):
    """The Phase 0 meds checks: field-map coverage, Phase-1 roster, name-keyed carried drift."""

    def setUp(self):
        self._temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary.cleanup)
        self.base = Path(self._temporary.name)
        self.inventory = empty_inventory(self.base)
        self.no_local = self.base / "absent-pharmacy.json"

    def report(self, *, reconnect=UPSTREAM, local=None, fmt="json"):
        result = run_engine("meds", self.inventory, reconnect=reconnect,
                            local=local or self.no_local, fmt=fmt)
        self.assertEqual(result.stderr, "")
        return result.returncode, (json.loads(result.stdout) if fmt == "json" else result.stdout)

    def kinds(self, report):
        return [item["kind"] for item in report["conflicts"]]

    def test_roster_coverage_and_mapped_but_absent_keys(self):
        code, report = self.report()
        self.assertEqual(code, 0)
        self.assertEqual(report["roster"], {
            "size": 3,
            "covered": 2,
            "missingUpstream": ["deltanol"],
            "phase2Pool": ["Gammatrol"],
        })
        self.assertIn("mapped but absent upstream: half_life_hours", report["notes"])
        self.assertEqual(self.kinds(report), [])
        _, markdown = self.report(fmt="md")
        self.assertIn("PHASE-1 ROSTER — 2 of 3 covered upstream", markdown)
        self.assertIn("missing upstream (L fields from the label): deltanol", markdown)

    def test_unclassified_upstream_key_is_drift(self):
        def mutate(data):
            data["medications"][1]["brand_new_field"] = "x"

        code, report = self.report(reconnect=copy_upstream(self.base, mutate))
        self.assertEqual(code, 1)
        self.assertEqual(self.kinds(report), ["unclassified-upstream-key"])
        self.assertIn("'brand_new_field' (present on 1 records)", report["conflicts"][0]["detail"])

    def test_name_keyed_record_with_matching_carried_values_is_clean(self):
        # The local id deliberately differs from the upstream generic (the real Lithium case):
        # the name-keyed ref alone must mark the upstream row as covered, not "added".
        local = write_pharmacy(self.base, [name_keyed("alphazine-local-id", "Alphazine", {
            "drug_class": "Fixture Class A",
            "mechanism_of_action": "Fixture mechanism A",
            "black_box_warning": "No",
        })])
        code, report = self.report(local=local)
        self.assertEqual(code, 0)
        self.assertEqual(report["changed"], [])
        self.assertEqual(self.kinds(report), [])
        self.assertEqual([item["id"] for item in report["added"]], ["betamol", "gammatrol"])

    def test_carried_value_drift_is_reported_with_its_basis(self):
        local = write_pharmacy(self.base, [name_keyed("alphazine", "Alphazine", {
            "drug_class": "Fixture Class A (as carried)",
            "black_box_warning": "No",
        })])
        code, report = self.report(local=local)
        self.assertEqual(code, 1)
        self.assertEqual(report["changed"], [{
            "record": 0,
            "id": "alphazine",
            "field": "drug_class",
            "target": "class",
            "before": "Fixture Class A (as carried)",
            "after": "Fixture Class A",
            "basis": "carried",
        }])
        _, markdown = self.report(local=local, fmt="md")
        self.assertIn("(since carried)", markdown)

    def test_a_card_citing_several_rows_drifts_only_when_no_row_holds_the_value(self):
        # Real case: buprenorphine cites Buprenorphine and Buprenorphine/Naloxone, and each
        # carried value came from one of them.
        def card(carried):
            return {"id": "alphazine", "provenance": {
                "reconnectRecords": ["medications[name=Alphazine]", "medications[name=Betamol]"],
                "carried": carried,
            }}

        local = write_pharmacy(self.base, [card({"drug_class": "Fixture Class B"})])
        code, report = self.report(local=local)
        self.assertEqual((code, report["changed"]), (0, []))
        local = write_pharmacy(self.base, [card({"drug_class": "Neither row"})])
        code, report = self.report(local=local)
        self.assertEqual(code, 1)
        self.assertEqual(report["changed"], [{
            "record": 0,  # the first-listed row (Alphazine) is the one shown
            "id": "alphazine",
            "field": "drug_class",
            "target": "class",
            "before": "Neither row",
            "after": "Fixture Class A",
            "basis": "carried",
        }])

    def test_unresolvable_name_ref_is_a_conflict(self):
        local = write_pharmacy(self.base, [name_keyed("omegatol", "Omegatol", {})])
        code, report = self.report(local=local)
        self.assertEqual(code, 1)
        self.assertEqual(report["conflicts"], [{
            "kind": "unresolvable-ref",
            "id": "omegatol",
            "ref": "medications[name=Omegatol]",
            "detail": "no upstream record named 'Omegatol'",
        }])

    def test_denylisted_values_are_never_printed(self):  # BR6, console included
        def mutate(data):
            data["medications"][0]["absolute_max_dose"] = "987654"
            data["medications"][0]["goodrx_url"] = "https://denylisted.invalid/alphazine"

        reconnect = copy_upstream(self.base, mutate)
        local = write_pharmacy(self.base, [name_keyed("alphazine", "Alphazine", {
            "absolute_max_dose": "123456",
        })])
        for fmt in ("md", "json"):
            with self.subTest(fmt=fmt):
                code, output = self.report(reconnect=reconnect, local=local, fmt=fmt)
                text = output if fmt == "md" else json.dumps(output)
                self.assertEqual(code, 1)
                for value in ("987654", "123456", "denylisted.invalid"):
                    self.assertNotIn(value, text)
                self.assertIn("denylisted-carried-field", text)

    def test_duplicate_upstream_names_are_a_conflict(self):
        def mutate(data):
            data["medications"].append(dict(data["medications"][0]))

        code, report = self.report(reconnect=copy_upstream(self.base, mutate))
        self.assertEqual(code, 1)
        self.assertEqual(self.kinds(report), ["duplicate-upstream-name"])

    def test_upstream_dataset_that_is_not_a_list_of_records_exits_2(self):
        for shape in ({"Alphazine": {}}, ["Alphazine"], None):
            with self.subTest(shape=shape):
                directory = self.base / ("shape-%d" % id(shape))
                directory.mkdir()

                def mutate(data, shape=shape):
                    data["medications"] = shape

                reconnect = copy_upstream(directory, mutate)
                result = run_engine("meds", self.inventory, reconnect=reconnect,
                                    local=self.no_local, fmt="json")
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, "")
                self.assertIn("no 'medications' list of records", result.stderr)

    def test_missing_field_map_exits_2(self):
        result = run_engine("meds", self.inventory, local=self.no_local,
                            fieldmap=self.base / "nope.json")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "")
        self.assertIn("field map not found", result.stderr)


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
            env=HERMETIC_ENV,
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
                "basis": "pinned",
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


def load_checker_module():
    spec = importlib.util.spec_from_file_location("reconnect_fieldmap", CHECKER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FieldMapContractTests(unittest.TestCase):
    """reconnect_fieldmap.py is the ONE statement of the field-map shape: every production map
    must pass it, and each way a map can be malformed must be a named finding."""

    def setUp(self):
        self.checker = load_checker_module()
        self.good = json.loads(SCREENING_FIELDMAP.read_text(encoding="utf-8"))

    def findings(self, mutate, rights=None):
        fieldmap = json.loads(json.dumps(self.good))
        mutate(fieldmap)
        return self.checker.check_fieldmap(fieldmap, rights=rights)

    def test_every_production_map_passes_and_the_engine_reads_the_same_table(self):
        result = run(CHECKER, "--check")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.count("OK    "), len(self.checker.PRODUCTION_FIELDMAPS))
        engine = load_engine_module()
        for dataset, path in self.checker.PRODUCTION_FIELDMAPS.items():
            self.assertEqual(engine.DATASETS[dataset]["fieldmap"], path)
            self.assertTrue(path.exists(), path)

    def test_fixture_maps_pass(self):
        for path in (FIELDMAP, SCREENING_FIELDMAP, EBP_FIELDMAP):
            self.assertEqual(
                self.checker.check_fieldmap(json.loads(path.read_text(encoding="utf-8"))), [], path)

    def test_each_malformation_is_a_named_finding(self):
        cases = {
            "overlap": lambda m: m["denylist"].update({"name": "x"}),
            "meta with target": lambda m: m["fieldMap"]["_stale"].update({"target": "x"}),
            "undeclared class": lambda m: m["fieldMap"]["name"].update({"class": "Q"}),
            "non-meta without target": lambda m: m["fieldMap"]["items"].update({"target": None}),
            "reason-less denylist": lambda m: m["denylist"].update({"item_stems": ""}),
            "duplicate roster id": lambda m: m["phase1Roster"].append(dict(m["phase1Roster"][0])),
            "non-slug roster id": lambda m: m["phase1Roster"][0].update({"id": "Not A Slug"}),
            "bad reconnectNames": lambda m: m["phase1Roster"][0].update({"reconnectNames": [""]}),
            "unknown fieldMap key": lambda m: m["fieldMap"]["name"].update({"stray": 1}),
            "empty denylist": lambda m: m.update({"denylist": {}}),
            "wrong schemaVersion": lambda m: m.update({"schemaVersion": 2}),
        }
        for label, mutate in cases.items():
            with self.subTest(label):
                self.assertNotEqual(self.findings(mutate), [], label)
        self.assertIn("missing top-level key 'classes'",
                      self.findings(lambda m: m.pop("classes")))

    def test_empty_reconnect_names_means_known_absent_and_is_allowed(self):
        # The meds map records four agents that are not upstream this way; the ENGINE reports
        # them as missing, the checker must not refuse them.
        self.assertEqual(self.findings(lambda m: m["phase1Roster"][0].update({"reconnectNames": []})), [])

    def test_rights_id_must_resolve_when_rights_are_given(self):
        mutate = lambda m: m["phase1Roster"][0].update({"rightsId": "nope"})  # noqa: E731
        self.assertEqual(self.findings(mutate), [])  # no rights file offered: not judged
        self.assertEqual(len(self.findings(mutate, rights={"cssrs"})), 1)
        self.assertEqual(self.findings(lambda m: m["phase1Roster"][0].update({"rightsId": "cssrs"}),
                                       rights={"cssrs"}), [])

    def test_production_rights_ids_resolve_against_instrument_rights(self):
        rights = self.checker.rights_ids()
        self.assertIsNotNone(rights, "instrument_rights.json must be readable")
        for dataset, path in self.checker.PRODUCTION_FIELDMAPS.items():
            fieldmap = json.loads(path.read_text(encoding="utf-8"))
            for entry in fieldmap.get("phase1Roster", []):
                if "rightsId" in entry:
                    self.assertIn(entry["rightsId"], rights, "%s: %s" % (dataset, entry["id"]))

    def test_unreadable_map_exits_2_and_a_bad_map_exits_1(self):
        with tempfile.TemporaryDirectory() as directory:
            bad = Path(directory) / "bad.json"
            bad.write_text(json.dumps({**self.good, "denylist": {}}), encoding="utf-8")
            self.assertEqual(run(CHECKER, "--check", bad).returncode, 1)
            self.assertEqual(run(CHECKER, "--check", Path(directory) / "missing.json").returncode, 2)
            self.assertEqual(run(CHECKER, "--check", bad, Path(directory) / "missing.json").returncode, 2)

    def test_screening_production_map_never_carries_instrument_text(self):
        production = json.loads(
            self.checker.PRODUCTION_FIELDMAPS["screening_tools"].read_text(encoding="utf-8"))
        for key in ("item_stems", "anchor_text", "scoring_form", "patient_profile"):
            self.assertIn(key, production["denylist"])
        self.assertEqual(production["fieldMap"]["items"]["target"], "administration.itemCount")
        self.assertEqual(production["upstream"]["field"], "screening_tools")
        roster_ids = [entry["id"] for entry in production["phase1Roster"]]
        self.assertEqual(len(roster_ids), len(set(roster_ids)))
        for rid in ("aims", "bars", "moca", "cam", "ciwa-ar", "cows", "bfcrs", "c-ssrs", "phq-9", "gad-7"):
            self.assertIn(rid, roster_ids)


class ScreeningToolsTests(unittest.TestCase):
    """The generalized adapter: everything the meds report does, for a second dataset, with the
    refs and identity keyed on that dataset."""

    def setUp(self):
        self._temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary.cleanup)
        self.base = Path(self._temporary.name)
        self.inventory = empty_inventory(self.base)
        self.no_local = self.base / "absent-screening_tools.json"

    def report(self, *, reconnect=UPSTREAM, local=None, fmt="json", fieldmap=SCREENING_FIELDMAP):
        result = run_engine("screening_tools", self.inventory, reconnect=reconnect,
                            local=local or self.no_local, fmt=fmt, fieldmap=fieldmap)
        self.assertEqual(result.stderr, "")
        return result.returncode, (json.loads(result.stdout) if fmt == "json" else result.stdout)

    def write_registry(self, records):
        path = self.base / "screening_tools.json"
        path.write_text(json.dumps({"schemaVersion": 1, "records": records}), encoding="utf-8")
        return path

    def test_without_a_registry_every_upstream_scale_is_a_candidate(self):
        code, report = self.report()
        self.assertEqual(code, 0)
        self.assertEqual([item["id"] for item in report["added"]],
                         ["fixscale-9", "fixscale-7", "fixscale-l"])
        self.assertEqual(report["roster"], {"size": 3, "covered": 2,
                                            "missingUpstream": ["fixscale-x"],
                                            "phase2Pool": ["Fixscale-L"]})
        self.assertEqual([item["id"] for item in report["stale"]], ["fixscale-9"])
        self.assertEqual(report["denylisted_upstream"], {"patient_profile": 3})
        self.assertIn("mapped but absent upstream: item_stems", report["notes"])
        self.assertEqual(report["conflicts"], [])
        _, markdown = self.report(fmt="md")
        self.assertIn("(3 screening_tools records)", markdown)
        self.assertIn("missing upstream (facts from the custodian's own page or the cited "
                      "psychometric paper): fixscale-x", markdown)
        self.assertIn("CHANGED since carried / the pinned revision", markdown)

    def test_name_keyed_carried_drift_uses_the_dataset_refs(self):
        local = self.write_registry([{
            "id": "fixscale-9",
            "provenance": {"reconnectRecords": ["screening_tools[name=Fixscale-9]"],
                           "carried": {"clinical_cutoffs": "stale bands", "items": "9"}},
        }])
        code, report = self.report(local=local)
        self.assertEqual(code, 1)
        self.assertEqual([item["id"] for item in report["added"]], ["fixscale-7", "fixscale-l"])
        self.assertEqual(len(report["changed"]), 1)
        self.assertEqual(report["changed"][0]["field"], "clinical_cutoffs")
        self.assertEqual(report["changed"][0]["target"], "scoring.cutoffs")
        self.assertEqual(report["changed"][0]["basis"], "carried")

    def test_index_refs_are_checked_against_the_dataset_identity(self):
        local = self.write_registry([
            {"id": "fixscale-7", "provenance": {"reconnectRecords": ["screening_tools[0]"]}},
            {"id": "fixscale-9", "provenance": {"reconnectRecords": ["medications[0]"]}},
        ])
        code, report = self.report(local=local)
        self.assertEqual(code, 1)
        kinds = sorted((item["kind"], item["id"]) for item in report["conflicts"])
        self.assertEqual(kinds, [("index-shift", "fixscale-7"), ("unresolvable-ref", "fixscale-9")])
        details = {item["id"]: item["detail"] for item in report["conflicts"]}
        self.assertEqual(details["fixscale-7"], "screening_tools[0] is fixscale-9, not fixscale-7")
        self.assertIn("not a screening_tools[N] or screening_tools[name=…] reference",
                      details["fixscale-9"])

    def test_a_carried_denylisted_key_is_named_but_never_printed(self):
        local = self.write_registry([{
            "id": "fixscale-9",
            "provenance": {"reconnectRecords": ["screening_tools[name=Fixscale-9]"],
                           "carried": {"patient_profile": "Fixture Persona"}},
        }])
        code, report = self.report(local=local, fmt="md")
        self.assertEqual(code, 1)
        self.assertIn("'patient_profile' is denylisted and must not be carried", report)
        self.assertNotIn("Fixture Persona", report)

    def test_unclassified_upstream_key_is_drift(self):
        def mutate(data):
            data["screening_tools"][0]["brand_new_field"] = "x"

        code, report = self.report(reconnect=copy_upstream(self.base, mutate))
        self.assertEqual(code, 1)
        self.assertEqual([item["kind"] for item in report["conflicts"]], ["unclassified-upstream-key"])

    def test_a_malformed_field_map_exits_2(self):
        bad = self.base / "bad.json"
        bad.write_text("[]", encoding="utf-8")
        result = run_engine("screening_tools", self.inventory, local=self.no_local, fieldmap=bad)
        self.assertEqual(result.returncode, 2)
        self.assertIn("not a JSON object", result.stderr)

    def test_meds_report_is_unchanged_by_the_generalization(self):
        # The meds adapter is now a thin wrapper; its fixture report must not have moved.
        result = run_engine("meds", self.inventory, local=LOCAL_FOR["meds"], fmt="json")
        report = json.loads(result.stdout)
        self.assertEqual([item["id"] for item in report["added"]], ["gammatrol"])
        self.assertEqual(report["conflicts"][0]["detail"], "medications[2] is gammatrol, not betamol")
        markdown = run_engine("meds", self.inventory, local=self.base / "absent.json").stdout
        self.assertIn("missing upstream (L fields from the label): deltanol", markdown)


class EbpTests(unittest.TestCase):
    """The third field-mapped dataset: the generalized adapter must need no engine change."""

    def setUp(self):
        self._temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary.cleanup)
        self.base = Path(self._temporary.name)
        self.inventory = empty_inventory(self.base)
        self.no_local = self.base / "absent-therapies.json"

    def report(self, *, reconnect=UPSTREAM, local=None, fmt="json"):
        result = run_engine("ebp", self.inventory, reconnect=reconnect,
                            local=local or self.no_local, fmt=fmt, fieldmap=EBP_FIELDMAP)
        self.assertEqual(result.stderr, "")
        return result.returncode, (json.loads(result.stdout) if fmt == "json" else result.stdout)

    def test_without_a_registry_every_modality_is_a_candidate(self):
        code, report = self.report()
        self.assertEqual(code, 0)
        self.assertEqual([item["id"] for item in report["added"]],
                         ["fixture-modality", "fixtherapy-b", "fixtherapy-c"])
        self.assertEqual(report["roster"], {"size": 3, "covered": 2,
                                            "missingUpstream": ["fixtherapy-x"],
                                            "phase2Pool": ["FixTherapy-C"]})
        self.assertEqual([item["id"] for item in report["stale"]], ["fixtherapy-b"])
        self.assertEqual(report["denylisted_upstream"],
                         {"maine_availability": 3, "patient_profile": 3})
        self.assertEqual(report["conflicts"], [])
        _, markdown = self.report(fmt="md")
        self.assertIn("(3 ebp_reference records)", markdown)
        self.assertIn("missing upstream (facts from the cited guideline (NICE / APA / VA-DoD) "
                      "or treatment manual): fixtherapy-x", markdown)

    def test_carried_guideline_drift_is_reported(self):
        local = self.base / "therapies.json"
        local.write_text(json.dumps({"schemaVersion": 1, "records": [{
            "id": "fixture-modality",
            "provenance": {"reconnectRecords": ["ebp_reference[name=Fixture Modality]"],
                           "carried": {"source": "OLD GUIDELINE", "evidence_level": "I"}},
        }]}), encoding="utf-8")
        code, report = self.report(local=local)
        self.assertEqual(code, 1)
        self.assertEqual([(c["field"], c["target"], c["after"]) for c in report["changed"]],
                         [("source", "evidence.guideline", "FIXTURE GUIDELINE 1")])

    def test_production_ebp_map_denylists_local_availability(self):
        production = json.loads(
            load_checker_module().PRODUCTION_FIELDMAPS["ebp"].read_text(encoding="utf-8"))
        self.assertEqual(production["upstream"]["field"], "ebp_reference")
        self.assertIn("maine_availability", production["denylist"])
        self.assertIn("patient_profile", production["denylist"])
        for key in ("key_components", "when_to_use", "contraindications_cautions"):
            self.assertEqual(production["fieldMap"][key]["class"], "J-seed", key)
        roster_ids = [entry["id"] for entry in production["phase1Roster"]]
        self.assertEqual(len(roster_ids), len(set(roster_ids)))
        for rid in ("cbt", "dbt", "fpe", "mi", "cbt-i", "supportive-psychotherapy",
                    "safety-planning-intervention"):
            self.assertIn(rid, roster_ids)


class CustodianSourcesTests(unittest.TestCase):
    """screening_tools/custodian_sources.json is where the scales' V-class facts get verified:
    one entry per roster scale, PMIDs well-formed, nothing invented in place of a null."""

    def setUp(self):
        self.sources = json.loads(CUSTODIAN_SOURCES.read_text(encoding="utf-8"))
        self.fieldmap = json.loads(
            load_checker_module().PRODUCTION_FIELDMAPS["screening_tools"].read_text(encoding="utf-8"))

    def test_one_entry_per_roster_scale_and_no_strays(self):
        roster = {entry["id"] for entry in self.fieldmap["phase1Roster"]}
        listed = [entry["id"] for entry in self.sources["entries"]]
        self.assertEqual(len(listed), len(set(listed)), "duplicate source entries")
        self.assertEqual(set(listed), roster)

    def test_pmids_are_well_formed_and_citations_accompany_them(self):
        for entry in self.sources["entries"]:
            for key in ("primaryPmid", "cutoffPmid"):
                pmid = entry.get(key)
                self.assertTrue(pmid is None or (isinstance(pmid, str) and pmid.isdigit()),
                                "%s %s=%r" % (entry["id"], key, pmid))
            citation = entry.get("primaryCitation") or {}
            if entry.get("primaryPmid"):
                self.assertTrue(citation.get("firstAuthor") and citation.get("year") and citation.get("title"),
                                "%s: a PMID needs its citation copied from PubMed" % entry["id"])
            else:
                self.assertTrue(entry.get("notes"), "%s: a null PMID must say why" % entry["id"])
            self.assertIn(entry.get("urlStatus"), ("verified", "unverified"), entry["id"])
            self.assertTrue(entry.get("custodianUrl", "").startswith("http"), entry["id"])

    def test_rights_bound_scales_point_at_their_rights_entry(self):
        rights = load_checker_module().rights_ids()
        by_id = {entry["id"]: entry for entry in self.fieldmap["phase1Roster"]}
        for entry in self.sources["entries"]:
            rights_id = by_id[entry["id"]].get("rightsId")
            if rights_id:
                self.assertIn(rights_id, rights, entry["id"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
