#!/usr/bin/env python3
"""Focused, dependency-free contract tests for the evidence registry library."""

import copy
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from registry import (
    TIER1_SELECTIONS,
    build_public_projection,
    collect_evidence_references,
    index_sources,
    load_evidence_registry,
    normalize_doi,
    normalize_pmid,
    normalize_title,
    tier1_sort_key,
    tier1_sources,
    validate_registry,
)


FIXTURE = Path(__file__).with_name("fixtures") / "valid_tier1_registry.json"
REGISTRY_PATH = Path(__file__).resolve().parents[2] / "evidence_registry.json"
EXISTING_IDS = {
    "cssrs-columbia-lighthouse",
    "va-dod-suicide-cpg-2024",
    "joint-commission-suicide-prevention",
    "nice-violence-aggression-ng10",
    "apa-violence-risk-assessment-2011",
    "asam-alcohol-withdrawal-2020",
    "bap-catatonia-2023",
    "nice-delirium-cg103",
    "project-beta-deescalation-2012",
    "project-beta-psychopharm-agitation-2012",
}
REFERENCE_FILES = (
    "topic_meta.json",
    "tool_registry.json",
    "communication_cases.json",
    "reasoning_cases.json",
    "reasoning_cases_resident.json",
    "family_systems_scenarios.json",
)
VALIDATE = Path(__file__).with_name("validate.py")


def test_canonical_registry_uses_v2_shape_and_preserves_existing_sources():
    registry = load_evidence_registry(REGISTRY_PATH)
    assert registry.get("schemaVersion") == 2

    source_index = index_sources(registry)
    assert EXISTING_IDS <= set(source_index)

    for source_id in EXISTING_IDS:
        source = source_index[source_id]
        assert {
            "id",
            "type",
            "citation",
            "identity",
            "requiredAccess",
            "governance",
        } <= set(source)
        assert source["identity"]["status"] == "pending"


def test_identifier_normalization():
    assert normalize_doi("https://doi.org/10.1056/NEJMoa051688.") == "10.1056/nejmoa051688"
    assert normalize_pmid("PMID: 16172203") == "16172203"
    assert normalize_pmid(None) == ""
    assert normalize_title("Effectiveness—of  Antipsychotic Drugs.") == "effectiveness of antipsychotic drugs"


def test_tier1_sort_keeps_14a_before_14b():
    rows = [
        {"curriculum": {"tier": 1, "selection": "14b"}},
        {"curriculum": {"tier": 1, "selection": "2"}},
        {"curriculum": {"tier": 1, "selection": "14a"}},
    ]
    assert [r["curriculum"]["selection"] for r in sorted(rows, key=tier1_sort_key)] == ["2", "14a", "14b"]


def test_validation_rejects_duplicate_external_identity_and_zotero_key():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    duplicate = copy.deepcopy(registry["sources"][0])
    duplicate["id"] = "different-id"
    registry["sources"].append(duplicate)
    messages = "\n".join(issue.message for issue in validate_registry(registry))
    assert "duplicate DOI" in messages
    assert "duplicate PMID" in messages
    assert "duplicate Zotero item key" in messages


def test_public_projection_strips_internal_fields():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    public = build_public_projection(registry)
    encoded = json.dumps(public)
    assert '"sources"' in encoded
    assert '"zotero"' not in encoded
    assert '"surveillance"' not in encoded
    assert '"appraisal"' not in encoded
    assert "KL5HP3MU" not in encoded


def test_valid_fixture_satisfies_contract_and_indexes_all_tier1_sources():
    registry = load_evidence_registry(FIXTURE)
    assert validate_registry(registry) == []
    assert len(index_sources(registry)) == 17
    rows = tier1_sources(registry)
    assert len(rows) == 17
    assert {row["curriculum"]["selection"] for row in rows} == TIER1_SELECTIONS
    assert rows[13]["curriculum"]["selection"] == "14a"
    assert rows[14]["curriculum"]["selection"] == "14b"


def test_validation_aggregates_shape_enum_key_and_forbidden_field_issues():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    source = registry["sources"][0]
    source["id"] = "Bad_ID"
    source["type"] = "blog-post"
    source["identity"]["status"] = "guessed"
    source["requiredAccess"] = "streaming"
    source["zotero"]["itemKey"] = "engel1977"
    source["internal"] = {"attachmentPath": "/tmp/fixture.pdf"}
    del source["governance"]

    messages = "\n".join(issue.message for issue in validate_registry(registry))
    assert "missing required field: governance" in messages
    assert "stable id" in messages
    assert "invalid source type" in messages
    assert "invalid identity status" in messages
    assert "invalid required access" in messages
    assert "Zotero item key" in messages
    assert "forbidden tracked key" in messages


def test_zotero_item_key_rejects_numeric_value_for_general_and_tier1_rules():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    registry["sources"][0]["zotero"]["itemKey"] = 12345678

    messages = [
        issue.message
        for issue in validate_registry(registry)
        if issue.path == "sources[0].zotero.itemKey"
    ]
    assert any("8-character uppercase alphanumeric" in message for message in messages)
    assert "Tier 1 source requires a Zotero parent item key" in messages


def test_zotero_item_key_rejects_padded_value_for_general_and_tier1_rules():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    registry["sources"][0]["zotero"]["itemKey"] = " KL5HP3MU "

    messages = [
        issue.message
        for issue in validate_registry(registry)
        if issue.path == "sources[0].zotero.itemKey"
    ]
    assert any("8-character uppercase alphanumeric" in message for message in messages)
    assert "Tier 1 source requires a Zotero parent item key" in messages


def test_validation_aggregates_unhashable_enum_values():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    registry["sources"][0]["type"] = []
    registry["sources"][1]["requiredAccess"] = {}
    registry["sources"][2]["identity"]["status"] = []

    messages = "\n".join(issue.message for issue in validate_registry(registry))
    assert "invalid source type" in messages
    assert "invalid required access" in messages
    assert "invalid identity status" in messages


def test_boolean_tiers_do_not_count_as_tier1():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for source in registry["sources"]:
        source["curriculum"]["tier"] = True

    messages = "\n".join(issue.message for issue in validate_registry(registry))
    assert "Tier 1 must contain exactly 17 records; found 0" in messages


def test_missing_pmid_requires_a_verified_doi_for_tier1():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    blank_pmid_ids = {
        source["id"]
        for source in registry["sources"]
        if not source["citation"]["pmid"]
    }
    assert blank_pmid_ids == {
        "stanley-brown-2012-safety-planning",
        "wampold-1997-bona-fide-psychotherapies",
    }

    registry["sources"][2]["citation"]["pmid"] = ""
    registry["sources"][2]["citation"]["doi"] = ""
    messages = "\n".join(issue.message for issue in validate_registry(registry))
    assert "missing PMID requires a verified DOI" in messages


def test_collect_evidence_references_reads_all_six_consumers():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        for index, filename in enumerate(REFERENCE_FILES, start=1):
            payload = {
                "records": [
                    {
                        "id": f"record-{index}",
                        "nested": {"evidenceIds": [f"evidence-{index}"]},
                    }
                ]
            }
            (repo_root / filename).write_text(json.dumps(payload), encoding="utf-8")

        assert set(collect_evidence_references(repo_root)) == {
            (filename, f"evidence-{index}")
            for index, filename in enumerate(REFERENCE_FILES, start=1)
        }


def test_public_projection_is_allowlisted_and_does_not_mutate_input():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    before = copy.deepcopy(registry)
    public = build_public_projection(registry)

    assert registry == before
    assert set(public) == {"schemaVersion", "sources"}
    assert set(public["sources"][0]) == {
        "id", "type", "citation", "requiredAccess", "curriculum"
    }
    assert set(public["sources"][0]["curriculum"]) == {
        "tier", "role", "weekNumbers", "topicSlugs", "pairedTools"
    }


def test_public_projection_omits_malformed_nested_containers():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    registry["sources"][0]["citation"] = [
        {"zotero": {"itemKey": "SECRET-CITATION"}}
    ]
    registry["sources"][0]["curriculum"] = [
        {"appraisal": "SECRET-CURRICULUM"}
    ]
    before = copy.deepcopy(registry)

    encoded = json.dumps(build_public_projection(registry))
    assert registry == before
    assert "SECRET-CITATION" not in encoded
    assert "SECRET-CURRICULUM" not in encoded
    assert '"zotero"' not in encoded
    assert '"appraisal"' not in encoded


def test_public_projection_recursively_filters_nested_secret_fields():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    source = registry["sources"][0]
    author = source["citation"]["authors"][0]
    author["given"] = {"itemKey": "SECRET-GIVEN"}
    author["zotero"] = {"itemKey": "SECRET-AUTHOR"}
    author["surveillance"] = "SECRET-AUTHOR-SURVEILLANCE"
    source["curriculum"]["pairedTools"].append(
        {"zotero": {"itemKey": "SECRET-TOOL"}}
    )
    source["curriculum"]["topicSlugs"].append(
        {"surveillance": "SECRET-TOPIC"}
    )
    before = copy.deepcopy(registry)

    public = build_public_projection(registry)
    encoded = json.dumps(public)
    assert registry == before
    for forbidden_key in ('"itemKey"', '"zotero"', '"surveillance"'):
        assert forbidden_key not in encoded
    for sentinel in (
        "SECRET-GIVEN",
        "SECRET-AUTHOR",
        "SECRET-AUTHOR-SURVEILLANCE",
        "SECRET-TOOL",
        "SECRET-TOPIC",
    ):
        assert sentinel not in encoded
    assert public["sources"][0]["citation"]["authors"] == [{"family": "Engel"}]
    assert public["sources"][0]["curriculum"]["pairedTools"] == []
    assert public["sources"][0]["curriculum"]["topicSlugs"] == ["fixture-one"]


def _write_fixture_repo(repo_root: Path, evidence_id: str) -> None:
    (repo_root / "evidence_registry.json").write_text(
        FIXTURE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    for filename in REFERENCE_FILES:
        (repo_root / filename).write_text(
            json.dumps({"evidenceIds": [evidence_id]}), encoding="utf-8"
        )


def test_offline_cli_accepts_valid_foreign_keys_without_zotero_import():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        _write_fixture_repo(repo_root, "engel-1977-biopsychosocial-model")
        result = subprocess.run(
            [sys.executable, str(VALIDATE), "--repo-root", str(repo_root)],
            check=False,
            capture_output=True,
            text=True,
        )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "17 sources, 17 Tier 1 articles, 16 numbered selections" in result.stdout
    assert "zotero_reconcile" not in VALIDATE.read_text(encoding="utf-8")


def test_offline_cli_expands_literal_home_directory():
    with tempfile.TemporaryDirectory() as directory:
        home = Path(directory)
        repo_root = home / "fixture-repo"
        repo_root.mkdir()
        _write_fixture_repo(repo_root, "engel-1977-biopsychosocial-model")
        environment = os.environ.copy()
        environment["HOME"] = str(home)
        result = subprocess.run(
            [sys.executable, str(VALIDATE), "--repo-root", "~/fixture-repo"],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "17 sources, 17 Tier 1 articles, 16 numbered selections" in result.stdout


def test_offline_cli_rejects_unknown_foreign_key():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        _write_fixture_repo(repo_root, "missing-evidence-id")
        result = subprocess.run(
            [sys.executable, str(VALIDATE), "--repo-root", str(repo_root)],
            check=False,
            capture_output=True,
            text=True,
        )

    assert result.returncode == 1, result.stdout + result.stderr
    assert "unknown evidence id: missing-evidence-id" in result.stdout


def main() -> int:
    for name, test in sorted(globals().items()):
        if name.startswith("test_") and callable(test):
            test()
    print("test_registry: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
