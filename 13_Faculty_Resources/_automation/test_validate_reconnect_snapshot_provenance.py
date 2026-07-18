#!/usr/bin/env python3
"""Behavior tests for the offline ReConnect snapshot provenance gate."""

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = Path(__file__).with_name("validate_reconnect_snapshot_provenance.py")
INVENTORY_RELATIVE = Path(
    "13_Faculty_Resources/_automation/provenance/"
    "reconnect_snapshot_provenance.json"
)
SOURCE_REPOSITORY = "https://github.com/jmoss333/reconnect-psychiatry-system.git"
SOURCE_REVISION = "2d77469a704e9f7b06f5d085b166dcd3306d9be3"
TEST_COMMAND = (
    "python3 13_Faculty_Resources/_automation/"
    "test_validate_reconnect_snapshot_provenance.py"
)
VALIDATE_COMMAND = (
    "python3 13_Faculty_Resources/_automation/"
    "validate_reconnect_snapshot_provenance.py"
)


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def record(snapshot_path: str, value: bytes) -> dict:
    checksum = digest(value)
    return {
        "snapshotPath": snapshot_path,
        "snapshotSha256": checksum,
        "sourceRepository": SOURCE_REPOSITORY,
        "sourcePath": "synthetic/source.md",
        "sourceRevision": SOURCE_REVISION,
        "sourceSha256": checksum,
        "relation": "exact-copy",
        "clinicalReviewRequired": True,
        "syncPolicy": "manual-reviewed-only",
    }


def write_fixture(root: Path, records: list[dict], files: dict[str, bytes]) -> None:
    for relative, value in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
    inventory = root / INVENTORY_RELATIVE
    inventory.parent.mkdir(parents=True, exist_ok=True)
    inventory.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "description": "Synthetic provenance fixture only.",
                "records": records,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def run_validator(root: Path, *, forbid_socket: bool = False) -> subprocess.CompletedProcess[str]:
    if forbid_socket:
        command = [
            sys.executable,
            "-c",
            (
                "import runpy, socket, sys; "
                "socket.socket = lambda *args, **kwargs: "
                "(_ for _ in ()).throw(AssertionError('socket opened')); "
                "validator, root = sys.argv[1:]; "
                "sys.argv = [validator, '--root', root]; "
                "runpy.run_path(validator, run_name='__main__')"
            ),
            str(VALIDATOR),
            str(root),
        ]
    else:
        command = [sys.executable, str(VALIDATOR), "--root", str(root)]
    return subprocess.run(command, check=False, capture_output=True, text=True)


class ReconnectSnapshotProvenanceTests(unittest.TestCase):
    def test_ci_and_both_build_targets_are_fail_closed(self) -> None:
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        build_gate = (
            ROOT
            / "13_Faculty_Resources/_automation/site_build/build_and_check.sh"
        ).read_text(encoding="utf-8")

        self.assertIn(TEST_COMMAND, workflow)
        self.assertIn(VALIDATE_COMMAND, workflow)
        self.assertLess(workflow.index(TEST_COMMAND), workflow.index(VALIDATE_COMMAND))
        build_command = f'python3 "$LIB/{VALIDATE_COMMAND.removeprefix("python3 ")}"'
        self.assertIn(build_command, build_gate)
        self.assertLess(build_gate.index(build_command), build_gate.index('case "$SITE" in'))

    def test_current_inventory_passes_offline_and_covers_confirmed_snapshots(self) -> None:
        result = run_validator(ROOT, forbid_socket=True)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "reconnect snapshot provenance OK — 32 exact-copy record(s), "
            "manual review required",
            result.stdout,
        )
        inventory = json.loads((ROOT / INVENTORY_RELATIVE).read_text(encoding="utf-8"))
        records = inventory["records"]
        self.assertEqual(len(records), 32)
        self.assertEqual(
            [item["snapshotPath"] for item in records],
            sorted(item["snapshotPath"] for item in records),
        )
        self.assertTrue(all(item["clinicalReviewRequired"] is True for item in records))
        self.assertTrue(all(item["syncPolicy"] == "manual-reviewed-only" for item in records))

    def test_synthetic_exact_copy_passes_without_a_reconnect_checkout(self) -> None:
        value = b"Synthetic educational snapshot only.\n"
        relative = "synthetic/_source/fixture.md"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_fixture(root, [record(relative, value)], {relative: value})

            result = run_validator(root, forbid_socket=True)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("socket opened", result.stdout + result.stderr)

    def test_changed_snapshot_fails_with_deterministic_hash_diagnostic(self) -> None:
        original = b"Synthetic source bytes.\n"
        changed = b"Synthetic changed bytes.\n"
        relative = "synthetic/_source/fixture.md"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_fixture(root, [record(relative, original)], {relative: changed})

            first = run_validator(root)
            second = run_validator(root)

        self.assertNotEqual(first.returncode, 0)
        self.assertEqual(first.stdout, second.stdout)
        self.assertIn(f"{relative}: SHA-256 mismatch", first.stdout)
        self.assertIn(f"expected {digest(original)}", first.stdout)
        self.assertIn(f"actual {digest(changed)}", first.stdout)
        self.assertNotIn("Traceback", first.stderr)

    def test_missing_snapshot_fails_closed(self) -> None:
        value = b"Synthetic source bytes.\n"
        relative = "synthetic/_source/missing.md"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_fixture(root, [record(relative, value)], {})

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"{relative}: MISSING", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_snapshot_path_rejects_dot_segments(self) -> None:
        value = b"Synthetic source bytes.\n"
        paths = {
            "parent segment": "synthetic/_source/../fixture.md",
            "current segment": "synthetic/_source/./fixture.md",
        }
        for label, relative in paths.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                write_fixture(root, [record(relative, value)], {relative: value})

                result = run_validator(root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("reconnect_snapshot_provenance.json: INVALID", result.stdout)
            self.assertIn("/snapshotPath", result.stdout)

    def test_symlinked_snapshot_fails_closed(self) -> None:
        value = b"Synthetic source bytes.\n"
        relative = "synthetic/_source/fixture.md"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "synthetic/_source/target.md"
            target.parent.mkdir(parents=True)
            target.write_bytes(value)
            (root / relative).symlink_to(target.name)
            write_fixture(root, [record(relative, value)], {})

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"{relative}: symbolic links are not allowed", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_source_and_snapshot_hashes_must_prove_an_exact_copy(self) -> None:
        value = b"Synthetic source bytes.\n"
        relative = "synthetic/_source/fixture.md"
        item = record(relative, value)
        item["sourceSha256"] = "f" * 64
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_fixture(root, [item], {relative: value})

            result = run_validator(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            f"{relative}: sourceSha256 must equal snapshotSha256 for relation exact-copy",
            result.stdout,
        )

    def test_schema_rejects_automatic_sync_or_optional_clinical_review(self) -> None:
        value = b"Synthetic source bytes.\n"
        relative = "synthetic/_source/fixture.md"
        mutations = {
            "automatic sync": ("syncPolicy", "automatic"),
            "optional review": ("clinicalReviewRequired", False),
            "derived relation": ("relation", "derived"),
        }
        for label, (field, replacement) in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                item = record(relative, value)
                item[field] = replacement
                write_fixture(root, [item], {relative: value})

                result = run_validator(root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("reconnect_snapshot_provenance.json: INVALID", result.stdout)
            self.assertIn(f"/{field}", result.stdout)

    def test_duplicate_or_unsorted_snapshot_paths_fail(self) -> None:
        first_value = b"First synthetic source.\n"
        second_value = b"Second synthetic source.\n"
        first_path = "synthetic/_source/a.md"
        second_path = "synthetic/_source/b.md"
        cases = {
            "duplicate": [record(first_path, first_value), record(first_path, first_value)],
            "unsorted": [record(second_path, second_value), record(first_path, first_value)],
        }
        files = {first_path: first_value, second_path: second_value}
        for label, records in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                write_fixture(root, copy.deepcopy(records), files)

                result = run_validator(root)

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("records must be sorted by unique snapshotPath", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
