#!/usr/bin/env python3
"""Focused, dependency-free contract tests for the evidence registry library."""

import argparse
import copy
import builtins
import contextlib
import csv
import io
import json
import os
import subprocess
import sys
import tempfile
from collections.abc import Callable
from unittest import mock
from pathlib import Path

from registry import (
    TIER1_END,
    TIER1_SELECTIONS,
    TIER1_START,
    build_public_projection,
    collect_evidence_references,
    generated_outputs,
    index_sources,
    load_evidence_registry,
    normalize_doi,
    normalize_pmid,
    normalize_title,
    render_tier1_curriculum_map,
    render_tier1_download_block,
    replace_generated_block,
    tier1_sort_key,
    tier1_sources,
    validate_registry,
)
import registry as registry_library
from zotero_reconcile import (
    api_get,
    creator_family,
    inspect_attachment_children,
    load_snapshot,
    normalize_journal,
    publication_year,
    reconcile_registry,
    sanitize_snapshot,
    snapshot_library,
    write_reports,
)
import zotero_reconcile as zotero_bridge


FIXTURE = Path(__file__).with_name("fixtures") / "valid_tier1_registry.json"
REGISTRY_PATH = Path(__file__).resolve().parents[2] / "evidence_registry.json"
REPO_ROOT = REGISTRY_PATH.parent
SCHEMA_PATH = REGISTRY_PATH.with_name("evidence_registry.schema.json")
USAGE_NOTICE = (
    "Educational metadata only; faculty review remains required for clinical "
    "recommendations."
)
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
    "canmat-isbd-bipolar-2018",
}
TIER1_IDS = {
    "appelbaum-grisso-1988-capacity",
    "border-2019-candidate-gene",
    "brown-1972-expressed-emotion",
    "bush-1996-catatonia-rating-scale",
    "caspi-2003-5htt-stress",
    "engel-1977-biopsychosocial-model",
    "felitti-1998-ace",
    "franklin-2017-suicide-risk-meta-analysis",
    "lieberman-2005-catie",
    "linehan-1991-dbt",
    "march-2004-tads",
    "pharoah-2010-family-intervention",
    "rosenhan-1973-sane-places",
    "rush-2006-stard",
    "stanley-brown-2012-safety-planning",
    "volkow-2016-addiction-brain-disease",
    "wampold-1997-bona-fide-psychotherapies",
}
SURVEILLANCE_IDS = {
    "aacap-parameters",
    "apa-practice-guidelines",
    "clozapine-rems",
    "dsm-5-tr",
    "fda-drug-safety",
    "samhsa-guidelines",
    "spravato-rems",
    "uspstf-mental-health",
}
# Evidence added by the 2026-08-08 safety-level audit to hard-gate high-risk
# topics (see docs/SAFETY_LEVEL_AUDIT_2026-08-08.md). One set across all batches,
# kept alphabetical — per-batch constants would multiply without earning anything,
# since the union below is what actually locks the inventory.
SAFETY_GATE_IDS = {
    "apa-eating-disorders-2023",
    "boyer-shannon-2005-serotonin-syndrome",
    "cipriani-2013-lithium-suicide",
    "fda-prozac-label-maoi-switching",
    "lima-2004-betablockers-akathisia",
    "mckeith-2017-dlb-consensus",
    "nasreddine-2005-moca",
    "schneider-2005-antipsychotic-dementia-mortality",
    "strawn-2007-neuroleptic-malignant-syndrome",
    "vanderkruik-2017-postpartum-psychosis-prevalence",
    "wesseloo-2016-postpartum-relapse",
}
# Evidence promoted by the 2026-08-21 therapy-curriculum build (WP-T2; Taplinger
# request #5, closes review finding F19 for the therapy domain). Reading-list
# domains + practice-inpatient module support, one alphabetical set — the two
# rows already registered (pharoah-2010-family-intervention,
# stanley-brown-2012-safety-planning) were updated in place, not re-added.
THERAPY_WP_T2_IDS = {
    "abbass-2020",
    "appel-2026",
    "arqueros-2026",
    "bastos-maia-2025",
    "belkin-2021",
    "bohus-lancet-2021",
    "brodsky-2025",
    "camacho-gomez-2020",
    "ciharova-2021",
    "cohen-chazani-2022",
    "cuijpers-2007",
    "cuijpers-2026",
    "desalve-2025",
    "diefenbach-2024-primary",
    "diefenbach-2025",
    "difronzo-2025",
    "driessen-2023",
    "ferguson-2026",
    "fluckiger-2018",
    "goldstein-2024",
    "hajek-gross-2024",
    "hansson-2022",
    "hong-2025",
    "huggett-2022",
    "huggett-2024",
    "kearns-2025",
    "kleiman-2026",
    "leichsenring-2023",
    "linehan-2015",
    "links-ross-2025",
    "ma-2021",
    "mahon-2024",
    "man-2023",
    "modini-large-2026",
    "penzenik-2026",
    "pott-2022",
    "sall-2019",
    "saxler-2024",
    "schefft-2019",
    "schunemann-2025",
    "schwenker-2023",
    "shank-2026",
    "simmonds-buckley-2019",
    "soler-2022",
    "stanley-brown-2018",
    "statpearls-mcp-2026",
    "steeg-2025",
    "steinberg-2024",
    "tarrier-wykes-2004",
    "tetzlaff-2025",
    "tham-solomon-2024",
    "varese-2025",
    "wibbelink-2026",
    "wienicke-2023",
    "xia-2011",
}
# The registry inventory is locked to this union: a source added without being
# registered here fails the canary below, which is the point. Deriving the
# expected count from the union keeps the count assertion honest (it still
# catches duplicate ids) without making every batch a three-site magic-number edit.
# Added by the post-discharge citation correction (reference 5 cited a viewpoint for a
# time-course statistic it does not report).
POSTDISCHARGE_CORRECTION_IDS = {
    "chung-2017-postdischarge-suicide",
    "chung-2019-first-week-month",
}
# Added by curriculum-review remediation WP-5a (finding RSAF-F010): cl_reference.md put
# benzodiazepine response in catatonia at "~90%" with nothing behind it. The meta-analysis
# it now cites reports 77% response / 55% remission across 53 studies, and asserting what a
# paper found requires a stored span, so the source enters the registry with one.
CURRICULUM_REVIEW_WP5A_IDS = {
    "bot-2026-benzodiazepines-catatonia",
}
# Added by curriculum-review remediation WP-5b (finding RV11-F002): the resident TRD case said a 2025
# review supports esketamine efficacy "in the acute setting, suicidality", where that review reports the
# effect on suicidality was not significant at any time point — a claim close to the opposite of its source.
CURRICULUM_REVIEW_WP5B_IDS = {
    "fountoulakis-2025-esketamine",
}

ALL_SOURCE_IDS = (
    EXISTING_IDS | TIER1_IDS | SURVEILLANCE_IDS | SAFETY_GATE_IDS | THERAPY_WP_T2_IDS
    | POSTDISCHARGE_CORRECTION_IDS | CURRICULUM_REVIEW_WP5A_IDS | CURRICULUM_REVIEW_WP5B_IDS
)
REFERENCE_FILES = (
    "topic_meta.json",
    "tool_registry.json",
    "communication_cases.json",
    "reasoning_cases.json",
    "reasoning_cases_resident.json",
    "family_systems_scenarios.json",
)
VALIDATE = Path(__file__).with_name("validate.py")
REGISTRY_CLI = Path(__file__).with_name("registry.py")
ZOTERO_CONFIG_PATH = Path(__file__).with_name("zotero_config.json")
ZOTERO_RECONCILE = Path(__file__).with_name("zotero_reconcile.py")
ZOTERO_FIXTURES = Path(__file__).with_name("fixtures")
LOCAL_REQUIREMENTS = Path(__file__).with_name("requirements-local.txt")
EVIDENCE_README = Path(__file__).with_name("README.md")
SYNTHETIC_MACOS_USER_ROOT = "/" + "Users/example"
BUILD_DEPLOY = (
    REPO_ROOT
    / "13_Faculty_Resources"
    / "_automation"
    / "site_build"
    / "build_deploy.py"
)
TOPIC_VALIDATOR = (
    REPO_ROOT
    / "13_Faculty_Resources"
    / "_automation"
    / "validate_topic_meta.py"
)
SURVEILLANCE_BIN = (
    REPO_ROOT / "13_Faculty_Resources" / "_automation" / "surveillance" / "bin"
)
sys.path.insert(0, str(SURVEILLANCE_BIN))
import build_status as surveillance_status
import lib_surveillance as surveillance_library
import run_citation_check as citation_checker


def _zotero_config() -> dict:
    return json.loads(ZOTERO_CONFIG_PATH.read_text(encoding="utf-8"))


def _canonical_tier1_registry() -> dict:
    registry = load_evidence_registry(REGISTRY_PATH)
    registry["sources"] = tier1_sources(registry)
    return registry


def _one_source_registry(source_id: str = "engel-1977-biopsychosocial-model") -> dict:
    registry = _canonical_tier1_registry()
    registry["sources"] = [index_sources(registry)[source_id]]
    return registry


def _fixture_registry_with_canonical_surveillance() -> dict:
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    canonical = load_evidence_registry(REGISTRY_PATH)
    for source in registry["sources"]:
        source.pop("surveillance", None)
    registry["surveillance"] = copy.deepcopy(canonical["surveillance"])
    registry["sources"].extend(
        copy.deepcopy(
            [source for source in canonical["sources"] if "surveillance" in source]
        )
    )
    return registry


def test_tier1_replacement_preserves_manual_tail():
    original = "head\n<!-- evidence-registry:tier1:start -->\nold\n<!-- evidence-registry:tier1:end -->\nTAIL\n"
    updated = replace_generated_block(original, TIER1_START, TIER1_END, "new\n")
    assert updated.endswith("TAIL\n")
    assert "old" not in updated
    assert "new" in updated


def test_generated_views_have_no_timestamp_or_live_access_state():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    text = render_tier1_curriculum_map(tier1_sources(registry))
    assert "Generated:" not in text
    assert "pdf_attached" not in text
    assert "metadata_only" not in text
    assert "14a" in text and "14b" in text


def test_download_block_is_deterministic_and_uses_registry_access_requirements():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    records = list(reversed(tier1_sources(registry)))
    before = copy.deepcopy(records)

    first = render_tier1_download_block(records)
    second = render_tier1_download_block(records)

    assert first == second
    assert records == before
    assert "| Selection | Citation | Title | Read for | Required access |" in first
    assert first.index("| 14a |") < first.index("| 14b |")
    assert "https://doi.org/10.1126/science.847460" in first
    assert "https://pubmed.ncbi.nlm.nih.gov/847460/" in first
    assert "Full text" in first
    for forbidden in (
        "Generated:",
        "pdf_attached",
        "metadata_only",
        "itemKey",
        "KL5HP3MU",
        "attachment",
    ):
        assert forbidden not in first


def test_curriculum_map_uses_approved_mapping_data_and_parent_keys_only():
    registry = load_evidence_registry(REGISTRY_PATH)
    text = render_tier1_curriculum_map(tier1_sources(registry))

    assert (
        "| Selection | Evidence ID | Week | Role | Mapping status | Teaching role | Zotero parent key |"
        in text
    )
    assert "| 7 | brown-1972-expressed-emotion | Week 4 | Required | Mapped |" in text
    assert "| 12 | march-2004-tads | Week 2 | Required | Mapped |" in text
    assert "| 14a | caspi-2003-5htt-stress | Week 6 | Required | Mapped |" in text
    assert "| 14b | border-2019-candidate-gene | Week 6 | Required | Mapped |" in text
    assert "Brown 1962 remains a later contextual companion" in text
    assert "needs-faculty-confirmation" not in text
    assert "citation-conflict" not in text
    for forbidden in ("attachmentKey", "attachmentPath", "filePath"):
        assert forbidden not in text


def test_generated_outputs_preserve_the_download_list_outside_the_tier1_block():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        landmark = repo_root / "07_Evidence_and_Reading" / "Landmark_Library"
        landmark.mkdir(parents=True)
        (repo_root / "evidence_registry.json").write_text(
            REGISTRY_PATH.read_text(encoding="utf-8"), encoding="utf-8"
        )
        original = (
            "manual preamble\n\n"
            "## TIER 1 — old\nold generated rows\n\n"
            "---\n\n## TIER 2 — manual tail\nTAIL BYTE SENTINEL\n"
        )
        download_path = landmark / "Primary_Source_Download_List.md"
        download_path.write_text(original, encoding="utf-8")

        outputs = generated_outputs(repo_root)
        updated = outputs[download_path]

    assert updated.startswith("manual preamble\n\n" + TIER1_START)
    assert updated.endswith("---\n\n## TIER 2 — manual tail\nTAIL BYTE SENTINEL\n")
    assert updated.count(TIER1_START) == 1
    assert updated.count(TIER1_END) == 1
    assert set(path.name for path in outputs) == {
        "Primary_Source_Download_List.md",
        "Tier1_Primary_Source_Curriculum_Map.md",
    }


def test_generate_check_reports_stale_paths_without_writing():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        landmark = repo_root / "07_Evidence_and_Reading" / "Landmark_Library"
        landmark.mkdir(parents=True)
        (repo_root / "evidence_registry.json").write_text(
            REGISTRY_PATH.read_text(encoding="utf-8"), encoding="utf-8"
        )
        download_path = landmark / "Primary_Source_Download_List.md"
        download_path.write_text(
            "preamble\n## TIER 1 — old\nold\n\n---\n\n## TIER 2 — tail\n",
            encoding="utf-8",
        )
        before = download_path.read_bytes()

        result = subprocess.run(
            [
                sys.executable,
                str(REGISTRY_CLI),
                "generate",
                "--check",
                "--repo-root",
                str(repo_root),
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        assert download_path.read_bytes() == before
        assert not (landmark / "Tier1_Primary_Source_Curriculum_Map.md").exists()

    assert result.returncode == 1
    assert "07_Evidence_and_Reading/Landmark_Library/Primary_Source_Download_List.md" in result.stdout
    assert "07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md" in result.stdout


def test_canonical_usage_notice_is_required_and_preserved():
    registry = load_evidence_registry(REGISTRY_PATH)
    assert registry.get("usageNotice") == USAGE_NOTICE

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert "usageNotice" in schema["required"]
    assert schema["properties"]["usageNotice"] == {"const": USAGE_NOTICE}


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


def test_canonical_registry_preserves_all_prior_ids_when_surveillance_is_added():
    registry = load_evidence_registry(REGISTRY_PATH)
    source_ids = set(index_sources(registry))

    assert len(registry["sources"]) == len(ALL_SOURCE_IDS)
    assert ALL_SOURCE_IDS == source_ids


def test_note_history_tail_must_equal_the_current_note():
    """The load-bearing rule: editing identity.note without appending is a failure.

    lastReviewed records that somebody looked; it cannot record what they
    concluded differently. Without this, a revised note overwrites its
    predecessor silently — and those revisions are the most interesting thing
    the registry knows (see the Lima entry).
    """
    registry = load_evidence_registry(REGISTRY_PATH)
    registry["sources"][0]["identity"]["note"] = "rewritten without appending history"
    errors = [
        issue
        for issue in validate_registry(registry)
        if issue.severity == "error" and issue.path.endswith(".governance.noteHistory")
    ]
    assert errors, "a silently rewritten note must fail the build"


def test_note_history_must_run_forward_in_time():
    registry = load_evidence_registry(REGISTRY_PATH)
    history = registry["sources"][0]["governance"]["noteHistory"]
    history.append(
        {
            "date": "1999-01-01",
            "note": registry["sources"][0]["identity"]["note"],
            "reason": "backdated entry",
        }
    )
    errors = [
        issue
        for issue in validate_registry(registry)
        if issue.severity == "error" and "out of order" in issue.message
    ]
    assert errors


def test_every_canonical_source_carries_a_note_history():
    registry = load_evidence_registry(REGISTRY_PATH)
    for position, source in enumerate(registry["sources"]):
        history = source["governance"]["noteHistory"]
        assert isinstance(history, list) and history, position
        for entry in history:
            assert set(entry) == {"date", "note", "reason"}, position
            assert all(str(entry[field]).strip() for field in entry), position
        assert history[-1]["note"] == source["identity"]["note"], position


def test_lima_history_records_what_verification_found():
    """The entry this field exists for: a citation that meant the opposite."""
    registry = load_evidence_registry(REGISTRY_PATH)
    source = index_sources(registry)["lima-2004-betablockers-akathisia"]
    reason = source["governance"]["noteHistory"][-1]["reason"]
    assert "opposite" in reason
    assert "insufficient data" in reason


def test_published_schema_governance_is_required_for_every_canonical_source():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    required = set(schema["definitions"]["governance"]["required"])
    assert {"supersededBy", "correctionStatus", "noteHistory"} <= required

    # Sources with a PUBLISHED erratum (correction, not retraction) — verified via the
    # 2026-08-21 Scholar Sidekick canonical pass and recorded in each entry's noteHistory.
    # Anything else claiming a correction status (or any expression-of-concern/retracted
    # source) still fails: the allow-list is the record of what faculty knowingly kept.
    CORRECTED_IDS = {"abbass-2020", "linehan-2015"}

    registry = load_evidence_registry(REGISTRY_PATH)
    assert len(registry["sources"]) == len(ALL_SOURCE_IDS)
    for position, source in enumerate(registry["sources"]):
        assert source["governance"]["supersededBy"] == [], position
        expected_status = (
            "corrected" if source["id"] in CORRECTED_IDS else "none-known"
        )
        assert source["governance"]["correctionStatus"] == expected_status, position
        assert registry_library._STABLE_ID_RE.fullmatch(source["id"]), position


def test_tier1_governance_cannot_omit_supersession_or_correction_status():
    for field in ("supersededBy", "correctionStatus"):
        registry = load_evidence_registry(REGISTRY_PATH)
        del tier1_sources(registry)[0]["governance"][field]
        errors = [
            issue
            for issue in validate_registry(registry)
            if issue.severity == "error" and issue.path.endswith(f".governance.{field}")
        ]
        assert errors, field


def test_surveillance_projection_excludes_governance_without_changing_p0_shape():
    registry = load_evidence_registry(REGISTRY_PATH)
    projection = registry_library.build_surveillance_projection(registry)
    encoded = json.dumps(projection, sort_keys=True)

    assert "supersededBy" not in encoded
    assert "correctionStatus" not in encoded
    assert "noteHistory" not in encoded
    assert {source["id"] for source in projection["sources"]} == SURVEILLANCE_IDS
    assert projection["link_monitor"]["high_traffic_paths_P0"] == [
        "00_START_HERE/**",
        "04_Acute_and_Safety/**",
        "index.html",
    ]


def _schema_mutation_cases() -> list[tuple[str, Callable[[dict], object], str]]:
    def change(path, value):
        def mutate(registry):
            target = registry
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
        return mutate

    def remove(path):
        def mutate(registry):
            target = registry
            for key in path[:-1]:
                target = target[key]
            del target[path[-1]]
        return mutate

    return [
        ("wrong schema const", change(("schemaVersion",), 3), "schemaVersion"),
        ("missing title", remove(("sources", 0, "citation", "title")), "citation.title"),
        ("blank title", change(("sources", 0, "citation", "title"), ""), "citation.title"),
        (
            "empty authors and organization",
            lambda registry: (
                registry["sources"][0]["citation"].__setitem__("authors", []),
                registry["sources"][0]["citation"].__setitem__("organization", ""),
            ),
            "citation",
        ),
        ("blank Tier 1 journal", change(("sources", 10, "citation", "journal"), ""), "citation.journal"),
        ("year below minimum", change(("sources", 0, "citation", "year"), 0), "citation.year"),
        ("year wrong type", change(("sources", 0, "citation", "year"), "2024"), "citation.year"),
        ("boolean year", change(("sources", 0, "citation", "year"), True), "citation.year"),
        ("empty sources", change(("sources",), []), "sources"),
        ("unexpected citation key", change(("sources", 0, "citation", "editionGuess"), "first"), "citation.editionGuess"),
        ("unexpected author key", change(("sources", 10, "citation", "authors", 0, "orcid"), "0000"), "citation.authors[0].orcid"),
        ("unexpected source key", change(("sources", 0, "shadowAuthority"), True), "sources[0].shadowAuthority"),
        ("unexpected governance key", change(("sources", 0, "governance", "reviewedByGuess"), "nobody"), "governance.reviewedByGuess"),
        ("malformed URL", change(("sources", 0, "citation", "url"), "https://["), "citation.url"),
        ("malformed date", change(("sources", 0, "governance", "lastReviewed"), "2026-02-30"), "governance.lastReviewed"),
        ("missing citation object", remove(("sources", 0, "citation")), "sources[0].citation"),
        ("missing identity object", remove(("sources", 0, "identity")), "sources[0].identity"),
        ("missing governance object", remove(("sources", 0, "governance")), "sources[0].governance"),
        ("invalid stable source ID", change(("sources", 0, "id"), "Bad_ID"), "sources[0].id"),
        ("wrong source enum", change(("sources", 0, "type"), "blog-post"), "sources[0].type"),
        ("wrong array type", change(("sources", 0, "governance", "supersededBy"), "none"), "governance.supersededBy"),
        ("wrong array item", change(("sources", 0, "governance", "supersededBy"), ["Bad_ID"]), "governance.supersededBy[0]"),
        ("duplicate array item", change(("sources", 10, "curriculum", "weekNumbers"), [1, 1]), "curriculum.weekNumbers[1]"),
        ("array item above maximum", change(("sources", 10, "curriculum", "weekNumbers"), [7]), "curriculum.weekNumbers[0]"),
        ("Tier 1 conditional const", change(("sources", 10, "requiredAccess"), "abstract"), "sources[10].requiredAccess"),
        ("Tier 1 conditional required object", remove(("sources", 10, "zotero")), "sources[10].zotero"),
    ]


def test_published_schema_mutation_matrix_fails_normal_validate_registry():
    for name, mutate, expected_path in _schema_mutation_cases():
        registry = load_evidence_registry(REGISTRY_PATH)
        mutate(registry)
        paths = {
            issue.path
            for issue in validate_registry(registry)
            if issue.severity == "error" and issue.code == "schema-validation"
        }
        assert any(expected_path in path for path in paths), (name, paths)


def test_published_schema_mutation_matrix_fails_normal_cli_without_tracebacks():
    for name, mutate, expected_path in _schema_mutation_cases():
        registry = load_evidence_registry(REGISTRY_PATH)
        mutate(registry)
        with tempfile.TemporaryDirectory() as directory:
            repo_root = Path(directory)
            _write_canonical_repo(repo_root, registry=registry)
            result = subprocess.run(
                [sys.executable, str(VALIDATE), "--repo-root", str(repo_root)],
                check=False,
                capture_output=True,
                text=True,
            )
        assert result.returncode == 1, (name, result.stdout, result.stderr)
        assert expected_path in result.stdout, (name, result.stdout)
        assert "Traceback" not in result.stdout + result.stderr, name


def test_evidence_readmes_name_registry_as_sole_authority_and_views_as_derived():
    tools_text = EVIDENCE_README.read_text(encoding="utf-8")
    section_text = (
        REPO_ROOT / "07_Evidence_and_Reading" / "README.md"
    ).read_text(encoding="utf-8")
    for text in (tools_text, section_text):
        assert "evidence_registry.json alone is the canonical evidence authority" in text
        assert "derived review views" in text


def test_tools_readme_documents_representative_faculty_deep_link_check():
    text = EVIDENCE_README.read_text(encoding="utf-8")
    assert "open 'zotero://select/library/items/KL5HP3MU'" in text
    assert "manual faculty-workstation check" in text


def test_surveillance_projection_preserves_the_legacy_consumer_contract():
    registry = load_evidence_registry(REGISTRY_PATH)
    projection = registry_library.build_surveillance_projection(registry)

    assert {source["id"] for source in projection["sources"]} == SURVEILLANCE_IDS
    assert projection["link_monitor"]["cadence"] == "weekly"
    assert projection["resource_intake"]["max_candidates_per_run"] == 25


def test_surveillance_projection_rejects_missing_monitored_sources_or_cadence():
    registry = load_evidence_registry(REGISTRY_PATH)
    without_sources = copy.deepcopy(registry)
    without_sources["sources"] = [
        source for source in without_sources["sources"] if "surveillance" not in source
    ]
    without_cadence = copy.deepcopy(registry)
    del without_cadence["surveillance"]["link_monitor"]["cadence"]

    for broken in (without_sources, without_cadence):
        try:
            registry_library.build_surveillance_projection(broken)
        except ValueError as exc:
            assert "surveillance projection" in str(exc)
        else:
            raise AssertionError("incomplete surveillance authority was projected")


def _surveillance_source(registry: dict, source_id: str = "fda-drug-safety") -> dict:
    return index_sources(registry)[source_id]


def _surveillance_issue_text(registry: dict) -> str:
    return "\n".join(
        f"{issue.path}: {issue.message}" for issue in validate_registry(registry)
    )


def _assert_surveillance_contract_rejected(registry: dict, fragment: str) -> None:
    issue_text = _surveillance_issue_text(registry)
    assert fragment in issue_text, issue_text
    try:
        registry_library.build_surveillance_projection(registry)
    except ValueError as exc:
        assert "surveillance" in str(exc)
    else:
        raise AssertionError("malformed surveillance authority was projected")


def test_surveillance_source_contract_rejects_missing_misspelled_and_invalid_fields():
    cases = []

    missing_job = load_evidence_registry(REGISTRY_PATH)
    del _surveillance_source(missing_job)["surveillance"]["job"]
    cases.append((missing_job, "missing required field: job"))

    misspelled_job = load_evidence_registry(REGISTRY_PATH)
    _surveillance_source(misspelled_job)["surveillance"]["job"] = (
        "guidelines-surveillance"
    )
    cases.append((misspelled_job, "must equal guideline-surveillance"))

    invalid_type = load_evidence_registry(REGISTRY_PATH)
    _surveillance_source(invalid_type)["surveillance"]["type"] = "api"
    cases.append((invalid_type, "invalid monitored source type"))

    missing_watch = load_evidence_registry(REGISTRY_PATH)
    del _surveillance_source(missing_watch)["surveillance"]["watch_for"]
    cases.append((missing_watch, "missing required field: watch_for"))

    bad_boolean = load_evidence_registry(REGISTRY_PATH)
    _surveillance_source(bad_boolean)["surveillance"]["verified"] = "true"
    cases.append((bad_boolean, "verified must be a boolean"))

    bad_url = load_evidence_registry(REGISTRY_PATH)
    _surveillance_source(bad_url)["citation"]["url"] = "not-a-url"
    cases.append((bad_url, "monitoring URL must be an absolute HTTPS URL"))

    unexpected = load_evidence_registry(REGISTRY_PATH)
    _surveillance_source(unexpected)["surveillance"]["watch_forr"] = []
    cases.append((unexpected, "unexpected field: watch_forr"))

    for registry, fragment in cases:
        _assert_surveillance_contract_rejected(registry, fragment)


def test_global_surveillance_contract_rejects_bad_default_link_and_resource_settings():
    cases = []

    bad_default = load_evidence_registry(REGISTRY_PATH)
    bad_default["surveillance"]["defaults"]["proxy"] = "unbounded-proxy"
    cases.append((bad_default, "invalid proxy"))

    missing_default = load_evidence_registry(REGISTRY_PATH)
    del missing_default["surveillance"]["defaults"]["snapshot"]
    cases.append((missing_default, "missing required field: snapshot"))

    bad_link_job = load_evidence_registry(REGISTRY_PATH)
    bad_link_job["surveillance"]["link_monitor"]["job"] = "link-monitor"
    cases.append((bad_link_job, "must equal link-source-monitor"))

    bad_link_nested = load_evidence_registry(REGISTRY_PATH)
    del bad_link_nested["surveillance"]["link_monitor"]["treat_as_finding"][
        "tls_error"
    ]
    cases.append((bad_link_nested, "missing required field: tls_error"))

    bad_resource_job = load_evidence_registry(REGISTRY_PATH)
    bad_resource_job["surveillance"]["resource_intake"]["job"] = (
        "resources-intake"
    )
    cases.append((bad_resource_job, "must equal resource-intake"))

    bad_resource_nested = load_evidence_registry(REGISTRY_PATH)
    bad_resource_nested["surveillance"]["resource_intake"]["inclusion"][
        "require_domains"
    ] = "psychiatry.org"
    cases.append((bad_resource_nested, "require_domains must be a list"))

    unexpected = load_evidence_registry(REGISTRY_PATH)
    unexpected["surveillance"]["resource_intake"]["maximum_candidates"] = 25
    cases.append((unexpected, "unexpected field: maximum_candidates"))

    for registry, fragment in cases:
        _assert_surveillance_contract_rejected(registry, fragment)


def test_surveillance_severity_contract_matches_finding_schema_and_rejects_p3():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    finding_schema = json.loads(
        (
            REPO_ROOT
            / "13_Faculty_Resources"
            / "_automation"
            / "surveillance"
            / "config"
            / "finding.schema.json"
        ).read_text(encoding="utf-8")
    )
    finding_severities = set(finding_schema["properties"]["severity"]["enum"])
    canonical_severities = {
        name: set(schema["definitions"][name]["properties"]["severity_default"]["enum"])
        for name in ("sourceSurveillance", "linkMonitor", "resourceIntake")
    }

    assert finding_severities == {"P0", "P1", "P2"}
    assert all(values == finding_severities for values in canonical_severities.values())
    assert all("P3" not in values for values in canonical_severities.values())

    for location in ("source", "link", "resource"):
        registry = load_evidence_registry(REGISTRY_PATH)
        if location == "source":
            _surveillance_source(registry)["surveillance"]["severity_default"] = "P3"
        elif location == "link":
            registry["surveillance"]["link_monitor"]["severity_default"] = "P3"
        else:
            registry["surveillance"]["resource_intake"]["severity_default"] = "P3"
        _assert_surveillance_contract_rejected(registry, "invalid severity_default")


def test_surveillance_validator_aggregates_unhashable_enum_values():
    registry = load_evidence_registry(REGISTRY_PATH)
    source_config = _surveillance_source(registry)["surveillance"]
    source_config["type"] = []
    source_config["modality"] = {}
    source_config["severity_default"] = []
    registry["surveillance"]["defaults"]["proxy"] = []

    messages = _surveillance_issue_text(registry)
    assert "invalid monitored source type" in messages
    assert "invalid modality" in messages
    assert "invalid severity_default" in messages
    assert "invalid proxy" in messages


def test_surveillance_url_validation_aggregates_malformed_authorities():
    registry = load_evidence_registry(REGISTRY_PATH)
    invalid_urls = {
        "fda-drug-safety": "https://[",
        "clozapine-rems": "https://example.com:99999/path",
        "spravato-rems": "https:///missing-host?topic=mental-health",
        "apa-practice-guidelines": "https://user:secret@example.com/path",
        "dsm-5-tr": "http://www.appi.org/products/dsm",
        "samhsa-guidelines": "https://?topic=mental-health",
        "aacap-parameters": "https://#practice-parameters",
    }
    for source_id, url in invalid_urls.items():
        _surveillance_source(registry, source_id)["citation"]["url"] = url

    issues = [
        issue
        for issue in validate_registry(registry)
        if issue.path.endswith(".citation.url")
        and issue.message == "monitoring URL must be an absolute HTTPS URL"
    ]

    assert len(issues) == len(invalid_urls)
    assert _surveillance_source(registry, "uspstf-mental-health")["citation"][
        "url"
    ].endswith("?topic_status=P")


def test_invalid_ipv6_and_port_fail_closed_in_cli_projection_and_loader():
    for invalid_url in ("https://[", "https://example.com:99999/path"):
        registry = load_evidence_registry(REGISTRY_PATH)
        _surveillance_source(registry)["citation"]["url"] = invalid_url

        try:
            registry_library.build_surveillance_projection(registry)
        except ValueError as exc:
            assert "monitoring URL must be an absolute HTTPS URL" in str(exc)
        else:
            raise AssertionError("projection accepted an invalid monitoring URL")

        with tempfile.TemporaryDirectory() as directory:
            repo_root = Path(directory)
            _write_canonical_repo(repo_root, registry=registry)
            result = subprocess.run(
                [sys.executable, str(VALIDATE), "--repo-root", str(repo_root)],
                check=False,
                capture_output=True,
                text=True,
            )
            try:
                surveillance_library.load_registry(
                    repo_root / "evidence_registry.json"
                )
            except ValueError as exc:
                loader_error = str(exc)
            else:
                raise AssertionError("load_registry accepted an invalid monitoring URL")

        assert result.returncode == 1, result.stdout + result.stderr
        assert "monitoring URL must be an absolute HTTPS URL" in result.stdout
        assert "monitoring URL must be an absolute HTTPS URL" in loader_error


def test_normal_cli_and_loader_hard_fail_on_malformed_surveillance_contract():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        registry = load_evidence_registry(REGISTRY_PATH)
        del _surveillance_source(registry)["surveillance"]["job"]
        _write_canonical_repo(repo_root, registry=registry)

        result = subprocess.run(
            [sys.executable, str(VALIDATE), "--repo-root", str(repo_root)],
            check=False,
            capture_output=True,
            text=True,
        )
        try:
            surveillance_library.load_registry(repo_root / "evidence_registry.json")
        except ValueError as exc:
            loader_error = str(exc)
        else:
            raise AssertionError("load_registry accepted malformed surveillance")

    assert result.returncode == 1, result.stdout + result.stderr
    assert "missing required field: job" in result.stdout
    assert "surveillance" in loader_error


def test_surveillance_schema_requires_the_migrated_authority_metadata():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    surveillance = schema["definitions"]["globalSurveillance"]

    assert set(surveillance["required"]) == {
        "version",
        "updated",
        "owner",
        "defaults",
        "link_monitor",
        "resource_intake",
    }
    assert surveillance["properties"]["version"] == {"const": 1}
    assert surveillance["properties"]["updated"] == {"$ref": "#/definitions/date"}
    assert surveillance["properties"]["owner"] == {
        "type": "string",
        "minLength": 1,
    }


def test_surveillance_loader_preserves_interface_and_reads_canonical_json():
    assert Path(surveillance_library.REGISTRY).resolve() == REGISTRY_PATH.resolve()

    projection = surveillance_library.load_registry()
    assert {source["id"] for source in projection["sources"]} == SURVEILLANCE_IDS
    assert projection["link_monitor"]["cadence"] == "weekly"
    assert projection["resource_intake"]["max_candidates_per_run"] == 25


def test_citation_checker_propagates_canonical_registry_load_failure():
    with mock.patch.object(
        citation_checker.L,
        "load_registry",
        side_effect=RuntimeError("canonical registry unavailable"),
    ):
        try:
            citation_checker.check_registry_sources()
        except RuntimeError as exc:
            assert str(exc) == "canonical registry unavailable"
        else:
            raise AssertionError("citation checker silently skipped a registry failure")


def test_status_builder_propagates_canonical_registry_load_failure():
    with tempfile.TemporaryDirectory() as directory, mock.patch.object(
        surveillance_status.L,
        "load_registry",
        side_effect=RuntimeError("canonical registry unavailable"),
    ):
        try:
            surveillance_status.compute(Path(directory), Path(directory) / "reviewed.json")
        except RuntimeError as exc:
            assert str(exc) == "canonical registry unavailable"
        else:
            raise AssertionError("status builder silently defaulted registry cadence")


def test_citation_self_test_proves_canonical_projection():
    result = subprocess.run(
        [
            sys.executable,
            str(SURVEILLANCE_BIN / "run_citation_check.py"),
            "--self-test",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "DOIs=2 PMIDs=2" in result.stdout
    assert "fingerprints stable" in result.stdout
    assert "canonical registry projection OK" in result.stdout


def test_canonical_tier1_contract():
    registry = load_evidence_registry(REGISTRY_PATH)
    rows = tier1_sources(registry)
    assert len(rows) == 17
    assert {row["curriculum"]["selection"] for row in rows} == TIER1_SELECTIONS
    assert len({row["zotero"]["itemKey"] for row in rows}) == 17
    assert all(row["identity"]["status"] == "verified" for row in rows)
    assert all(row["appraisal"]["reviewStatus"] == "reviewed" for row in rows)
    assert all(row["appraisal"]["reviewedAt"] == "2026-07-12" for row in rows)
    assert all("expectedTags" not in row["zotero"] for row in rows)


def test_canonical_pharoah_appraisal_preserves_review_uncertainty():
    source = index_sources(load_evidence_registry(REGISTRY_PATH))[
        "pharoah-2010-family-intervention"
    ]
    outcomes = source["appraisal"]["outcomes"].lower()
    limitations = source["appraisal"]["limitations"].lower()
    assert "may reduce relapse" in outcomes
    assert "reduced relapse" not in outcomes
    assert "poor trial methods may overestimate effects" in limitations


def test_canonical_pharoah_identity_records_faculty_settled_pub3_version():
    """Faculty decision 2026-08-21 supersedes the 2026-07-12 retain-.pub2 exception.

    The Cochrane Library version history was checked directly: .pub3 is the 2010
    Dec 8 update that PMID 21154340 identifies; the .pub2 DOI carried by PubMed and
    Europe PMC is a metadata error. Both decisions must remain visible in the
    noteHistory — the identity pins the CURRENT understanding, the history keeps
    the record of what was previously believed and why it changed.
    """
    source = index_sources(load_evidence_registry(REGISTRY_PATH))[
        "pharoah-2010-family-intervention"
    ]
    identity = source["identity"]
    note = identity["note"].lower()
    assert "cochrane-library-version-history" in identity["source"]
    assert "supersedes the 2026-07-12 exception" in note
    assert "metadata error" in note
    assert ".pub2" in note
    assert ".pub3" in note
    assert "2026-08-21" in note
    assert identity["status"] == "verified"
    assert source["citation"]["doi"] == "10.1002/14651858.cd000088.pub3"
    assert source["citation"]["pmid"] == "21154340"
    assert source["zotero"]["itemKey"] == "P4M5H9VM"
    # The superseded exception must survive in the append-only history.
    history_notes = " ".join(
        entry["note"].lower() for entry in source["governance"]["noteHistory"]
    )
    assert "faculty-approved exception recorded 2026-07-12" in history_notes


def test_canonical_tads_appraisal_preserves_safety_exclusions_and_power_limit():
    source = index_sources(load_evidence_registry(REGISTRY_PATH))["march-2004-tads"]
    population = source["appraisal"]["population"].lower()
    limitations = source["appraisal"]["limitations"].lower()
    assert "high suicide risk" in population and "excluded" in population
    assert "primary substance-use disorders" in population
    assert "seven suicide attempts" in limitations
    assert "inadequately powered for statistical safety comparison" in limitations


def test_canonical_felitti_appraisal_distinguishes_respondents_from_analysis_set():
    source = index_sources(load_evidence_registry(REGISTRY_PATH))["felitti-1998-ace"]
    population = source["appraisal"]["population"]
    assert "9,508 respondents" in population
    assert "8,056 complete cases analyzed" in population


def test_canonical_franklin_appraisal_limits_acute_bedside_generalization():
    source = index_sources(load_evidence_registry(REGISTRY_PATH))[
        "franklin-2017-suicide-risk-meta-analysis"
    ]
    limitations = source["appraisal"]["limitations"].lower()
    assert "mean follow-up was nearly 10 years" in limitations
    assert "median 5 years" in limitations
    assert "fewer than 1%" in limitations and "one month or less" in limitations
    assert "short-term dynamic signals" in limitations
    assert "acute bedside" in limitations
    assert source["curriculum"]["teachingRole"] == "We can't predict; document reasoning"


def test_canonical_gate_a_mapping_decisions_are_recorded_without_warnings():
    registry = load_evidence_registry(REGISTRY_PATH)
    source_index = index_sources(registry)

    decisions = {
        "brown-1972-expressed-emotion": ([4], "Brown 1962"),
        "march-2004-tads": ([2], "faculty approved"),
        "caspi-2003-5htt-stress": ([6], "faculty approved"),
        "border-2019-candidate-gene": ([6], "faculty approved"),
    }
    for source_id, (week_numbers, note_fragment) in decisions.items():
        curriculum = source_index[source_id]["curriculum"]
        assert curriculum["weekNumbers"] == week_numbers
        assert curriculum["mappingStatus"] == "mapped"
        assert note_fragment.lower() in curriculum["mappingNote"].lower()

    brown_note = source_index["brown-1972-expressed-emotion"]["curriculum"][
        "mappingNote"
    ].lower()
    assert "canonical tier 1" in brown_note
    assert "later contextual companion" in brown_note
    assert "teaching-page reconciliation" in brown_note

    warnings = [
        issue for issue in validate_registry(registry) if issue.severity == "warning"
    ]
    assert warnings == []


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
    registry = _fixture_registry_with_canonical_surveillance()
    assert [issue for issue in validate_registry(registry) if issue.severity == "error"] == []
    assert len(index_sources(registry)) == 25
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


def test_missing_appraisal_review_status_is_rejected():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    del registry["sources"][0]["appraisal"]["reviewStatus"]

    messages = [
        issue.message
        for issue in validate_registry(registry)
        if issue.path == "sources[0].appraisal.reviewStatus"
        and issue.code != "schema-validation"
    ]
    assert messages == [
        "Tier 1 appraisal reviewStatus must be one of: pending-faculty-review, reviewed"
    ]


def test_bogus_appraisal_review_status_is_rejected():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    registry["sources"][0]["appraisal"]["reviewStatus"] = "self-approved"

    messages = [
        issue.message
        for issue in validate_registry(registry)
        if issue.path == "sources[0].appraisal.reviewStatus"
        and issue.code != "schema-validation"
    ]
    assert messages == [
        "Tier 1 appraisal reviewStatus must be one of: pending-faculty-review, reviewed"
    ]


def test_reviewed_appraisal_requires_reviewed_at():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    appraisal = registry["sources"][0]["appraisal"]
    appraisal["reviewStatus"] = "reviewed"
    appraisal.pop("reviewedAt", None)

    messages = [
        issue.message
        for issue in validate_registry(registry)
        if issue.path == "sources[0].appraisal.reviewedAt"
        and issue.code != "schema-validation"
    ]
    assert messages == ["Tier 1 reviewed appraisal requires a valid reviewedAt date"]


def test_reviewed_appraisal_rejects_invalid_reviewed_at_date():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    appraisal = registry["sources"][0]["appraisal"]
    appraisal["reviewStatus"] = "reviewed"
    appraisal["reviewedAt"] = "2026-02-30"

    messages = [
        issue.message
        for issue in validate_registry(registry)
        if issue.path == "sources[0].appraisal.reviewedAt"
        and issue.code != "schema-validation"
    ]
    assert messages == ["Tier 1 reviewed appraisal requires a valid reviewedAt date"]


def test_reviewed_appraisal_accepts_valid_reviewed_at_date():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    appraisal = registry["sources"][0]["appraisal"]
    appraisal["reviewStatus"] = "reviewed"
    appraisal["reviewedAt"] = "2026-07-12"

    assert not any(
        issue.path in {
            "sources[0].appraisal.reviewStatus",
            "sources[0].appraisal.reviewedAt",
        }
        for issue in validate_registry(registry)
    )


def test_bogus_mapping_status_is_rejected():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    registry["sources"][0]["curriculum"]["mappingStatus"] = "silently-assigned"

    messages = [
        issue.message
        for issue in validate_registry(registry)
        if issue.path == "sources[0].curriculum.mappingStatus"
        and issue.code != "schema-validation"
    ]
    assert messages == [
        "Tier 1 mappingStatus must be one of: mapped, needs-faculty-confirmation, citation-conflict"
    ]


def test_synthetic_unresolved_week_mapping_emits_stable_warning_contract():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for row in tier1_sources(registry):
        row["curriculum"]["mappingStatus"] = "mapped"
    source_id = "march-2004-tads"
    source = index_sources(registry)[source_id]
    source["curriculum"]["mappingStatus"] = "needs-faculty-confirmation"

    warnings = [
        issue
        for issue in validate_registry(registry)
        if issue.code == "tier1-week-needs-faculty-confirmation"
    ]
    assert len(warnings) == 1
    warning = warnings[0]
    assert warning.severity == "warning"
    assert warning.path.endswith(".curriculum.mappingStatus")
    assert warning.message == (
        f"Tier 1 week assignment needs faculty confirmation: {source_id}"
    )


def test_synthetic_citation_conflict_emits_stable_warning_contract():
    registry = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for row in tier1_sources(registry):
        row["curriculum"]["mappingStatus"] = "mapped"
    source_id = "engel-1977-biopsychosocial-model"
    source = index_sources(registry)[source_id]
    source["curriculum"]["mappingStatus"] = "citation-conflict"

    warnings = [
        issue
        for issue in validate_registry(registry)
        if issue.code == "tier1-citation-conflict"
    ]
    assert len(warnings) == 1
    warning = warnings[0]
    assert warning.severity == "warning"
    assert warning.path.endswith(".curriculum.mappingStatus")
    assert warning.message == (
        f"Tier 1 citation conflict requires faculty resolution: {source_id}"
    )


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


def _recursive_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from _recursive_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from _recursive_keys(child)


def _run_site_build(output_dir: Path, working_directory: Path) -> subprocess.CompletedProcess:
    environment = os.environ.copy()
    environment["OUT_DIR"] = str(output_dir)
    return subprocess.run(
        [sys.executable, str(BUILD_DEPLOY)],
        check=False,
        capture_output=True,
        text=True,
        cwd=working_directory,
        env=environment,
    )


def test_site_build_writes_deterministic_safe_public_registry():
    with tempfile.TemporaryDirectory() as directory:
        temporary = Path(directory)
        first_output = temporary / "first"
        second_output = temporary / "second"
        first = _run_site_build(first_output, temporary)
        second = _run_site_build(second_output, temporary)

        assert first.returncode == 0, first.stdout + first.stderr
        assert second.returncode == 0, second.stdout + second.stderr
        first_bytes = (first_output / "evidence_registry.json").read_bytes()
        second_bytes = (second_output / "evidence_registry.json").read_bytes()

    assert first_bytes == second_bytes
    assert first_bytes.endswith(b"\n")

    public = json.loads(first_bytes)
    canonical = load_evidence_registry(REGISTRY_PATH)
    assert set(public) == {"schemaVersion", "sources"}
    assert len(public["sources"]) == len(ALL_SOURCE_IDS)
    assert {source["id"] for source in public["sources"]} == set(
        index_sources(canonical)
    )

    allowed_source_fields = {
        "id", "type", "citation", "requiredAccess", "curriculum"
    }
    allowed_citation_fields = {
        "title", "authors", "organization", "year", "journal", "volume",
        "pages", "doi", "pmid", "url",
    }
    allowed_curriculum_fields = {
        "tier", "role", "weekNumbers", "topicSlugs", "pairedTools"
    }
    for source in public["sources"]:
        assert set(source) <= allowed_source_fields
        assert {"id", "type", "citation", "requiredAccess"} <= set(source)
        assert set(source["citation"]) <= allowed_citation_fields
        for author in source["citation"].get("authors", []):
            assert set(author) <= {"family", "given"}
        if "curriculum" in source:
            assert set(source["curriculum"]) <= allowed_curriculum_fields

    keys = set(_recursive_keys(public))
    forbidden_keys = {
        "itemKey", "expectedTags", "surveillance", "appraisal", "governance",
        "attachment", "attachmentKey", "attachmentPath", "attachmentState",
        "mappingNotes", "mappingStatus", "filePath", "localPath", "fullText",
        "indexedText", "secret", "token", "password", "apiKey",
    }
    assert keys.isdisjoint(forbidden_keys)

    encoded = first_bytes.decode("utf-8")
    zotero_parent_keys = {
        source["zotero"]["itemKey"]
        for source in canonical["sources"]
        if isinstance(source.get("zotero"), dict)
        and isinstance(source["zotero"].get("itemKey"), str)
    }
    assert zotero_parent_keys
    assert all(parent_key not in encoded for parent_key in zotero_parent_keys)


def _run_topic_validator_fixture(sources: list[dict], evidence_id: str):
    directory = tempfile.TemporaryDirectory()
    repo_root = Path(directory.name)
    automation = repo_root / "13_Faculty_Resources" / "_automation"
    evidence_tools = repo_root / "tools" / "evidence_registry"
    outside = repo_root / "outside"
    automation.mkdir(parents=True)
    evidence_tools.mkdir(parents=True)
    outside.mkdir()
    (automation / "validate_topic_meta.py").write_bytes(TOPIC_VALIDATOR.read_bytes())
    (evidence_tools / "registry.py").write_bytes(
        (REGISTRY_PATH.parent / "tools" / "evidence_registry" / "registry.py").read_bytes()
    )
    (outside / "registry.py").write_text(
        'raise AssertionError("validator imported registry from cwd")\n',
        encoding="utf-8",
    )
    (repo_root / "evidence_registry.json").write_text(
        json.dumps({"schemaVersion": 2, "sources": sources}),
        encoding="utf-8",
    )
    (repo_root / "topic_meta.json").write_text(
        json.dumps({"fixture-topic": {"evidenceIds": [evidence_id]}}),
        encoding="utf-8",
    )
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(outside)
    result = subprocess.run(
        [sys.executable, str(automation / "validate_topic_meta.py")],
        check=False,
        capture_output=True,
        text=True,
        cwd=outside,
        env=environment,
    )
    directory.cleanup()
    return result


def test_topic_validator_rejects_empty_canonical_registry():
    result = _run_topic_validator_fixture([], "missing-evidence-id")
    assert result.returncode == 1, result.stdout + result.stderr
    assert "evidence registry contains no sources" in result.stdout


def test_topic_validator_still_rejects_unknown_evidence_foreign_key():
    result = _run_topic_validator_fixture(
        [{"id": "known-evidence-id"}], "missing-evidence-id"
    )
    assert result.returncode == 1, result.stdout + result.stderr
    assert "evidenceIds references unknown source 'missing-evidence-id'" in result.stdout


def test_topic_validator_uses_repository_relative_registry_import():
    result = _run_topic_validator_fixture(
        [{"id": "known-evidence-id"}], "known-evidence-id"
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "topic_meta.json OK — 1 topics, contract satisfied." in result.stdout


def test_zotero_valid_snapshot_matches_all_tier1_with_advisory_empty_weeks():
    result = reconcile_registry(
        _canonical_tier1_registry(),
        load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json"),
        _zotero_config(),
    )

    assert result.matched_count == 17
    assert result.errors == []
    assert {warning.code for warning in result.warnings} == {
        "week-collection-advisory"
    }
    assert len(result.warnings) == 6


def test_zotero_stored_key_identity_drift_is_hard_error_without_relinking():
    result = reconcile_registry(
        _one_source_registry(),
        load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_identity_drift.json"),
        _zotero_config(),
    )

    assert "identity-conflict" in {error.code for error in result.errors}
    assert result.matched_count == 0


def test_zotero_stored_key_verifies_every_required_identity_field():
    snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    item = next(item for item in snapshot["items"] if item["key"] == "KL5HP3MU")
    mutations = (
        ("DOI", "10.0000/not-the-registered-doi"),
        ("archiveLocation", "PMID:99999999"),
        ("title", "A different title"),
        ("creators", [{"creatorType": "author", "lastName": "NotEngel"}]),
        ("date", "1978"),
        ("publicationTitle", "A Different Journal"),
    )

    for field, value in mutations:
        changed = copy.deepcopy(snapshot)
        changed_item = next(
            row for row in changed["items"] if row["key"] == "KL5HP3MU"
        )
        changed_item["data"][field] = value
        result = reconcile_registry(_one_source_registry(), changed, _zotero_config())
        assert "identity-conflict" in {
            error.code for error in result.errors
        }, field
        assert result.matched_count == 0, field


def test_zotero_missing_expected_tag_is_error_but_extra_tags_are_allowed():
    snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    one_item = next(item for item in snapshot["items"] if item["key"] == "KL5HP3MU")
    one_item["data"]["tags"].append({"tag": "faculty-local"})
    assert reconcile_registry(
        _one_source_registry(), snapshot, _zotero_config()
    ).errors == []

    one_item["data"]["tags"] = [
        tag for tag in one_item["data"]["tags"] if tag["tag"] != "landmark"
    ]
    result = reconcile_registry(_one_source_registry(), snapshot, _zotero_config())
    assert "missing-tier1-tag" in {error.code for error in result.errors}


def test_zotero_config_is_only_expected_tag_authority():
    config = _zotero_config()
    assert set(config["expectedTier1Tags"]) == {
        "Tier 1",
        "MS3-required",
        "landmark",
    }
    assert all(
        "expectedTags" not in row.get("zotero", {})
        for row in tier1_sources(load_evidence_registry(REGISTRY_PATH))
    )


def test_zotero_fallback_order_is_doi_then_pmid_then_unique_bibliography():
    valid = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    item = next(row for row in valid["items"] if row["key"] == "KL5HP3MU")

    doi_registry = _one_source_registry()
    doi_registry["sources"][0]["zotero"].pop("itemKey")
    doi_result = reconcile_registry(
        doi_registry, {**valid, "items": [item]}, _zotero_config()
    )
    assert doi_result.matches[0]["method"] == "doi"

    pmid_registry = copy.deepcopy(doi_registry)
    pmid_registry["sources"][0]["citation"]["doi"] = ""
    pmid_result = reconcile_registry(
        pmid_registry, {**valid, "items": [item]}, _zotero_config()
    )
    assert pmid_result.matches[0]["method"] == "pmid"

    title_registry = copy.deepcopy(pmid_registry)
    title_registry["sources"][0]["citation"]["pmid"] = ""
    title_result = reconcile_registry(
        title_registry, {**valid, "items": [item]}, _zotero_config()
    )
    assert title_result.matches[0]["method"] == "title-author-year"


def test_zotero_fallback_never_guesses_between_two_title_candidates():
    registry = _one_source_registry()
    registry["sources"][0]["zotero"].pop("itemKey")
    registry["sources"][0]["citation"]["doi"] = ""
    registry["sources"][0]["citation"]["pmid"] = ""
    result = reconcile_registry(
        registry,
        load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_ambiguous.json"),
        _zotero_config(),
    )

    assert "ambiguous" in {error.code for error in result.errors}
    assert result.matched_count == 0


def test_zotero_week_observations_never_rewrite_registry_mapping():
    registry = _one_source_registry()
    before = copy.deepcopy(registry)
    snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    item = next(row for row in snapshot["items"] if row["key"] == "KL5HP3MU")
    item["data"]["collections"] = ["ZD6GBSYZ", "LUUFRIE9"]

    reconcile_registry(registry, snapshot, _zotero_config())
    assert registry == before
    assert registry["sources"][0]["curriculum"]["weekNumbers"] == [1]


def test_zotero_attachment_state_transition_matrix():
    fixture = load_snapshot(
        ZOTERO_FIXTURES / "zotero_snapshot_attachment_states.json"
    )
    expected_states = {
        "noteOnly": "metadata_only",
        "linkedUrl": "metadata_only",
        "htmlSnapshot": "metadata_only",
        "importedPdf": "pdf_attached",
        "linkedPdf": "pdf_attached",
        "missingFilePdf": "broken_attachment",
        "incompleteProbePdf": "broken_attachment",
        "invalidByteCountPdf": "broken_attachment",
        "invalidSignatureTypePdf": "broken_attachment",
        "malformedProbePdf": "broken_attachment",
        "zeroBytePdf": "broken_attachment",
        "invalidSignaturePdf": "broken_attachment",
        "validScannedPdf": "pdf_verified",
        "validIndexedPdf": "pdf_indexed",
    }
    for case, expected_state in expected_states.items():
        status = inspect_attachment_children(
            "KL5HP3MU", fixture[case], explicit=True
        )
        assert status["state"] == expected_state, case
        if expected_state == "metadata_only":
            assert "contentType" not in status, case
        else:
            assert status["contentType"] == "application/pdf", case


def test_zotero_skipped_file_verification_keeps_unknown_or_prior_state():
    fixture = load_snapshot(
        ZOTERO_FIXTURES / "zotero_snapshot_attachment_states.json"
    )
    assert inspect_attachment_children(
        "KL5HP3MU", fixture["importedPdf"], explicit=False
    ) == {"state": None}
    assert inspect_attachment_children(
        "KL5HP3MU", fixture["priorVerified"], explicit=False
    ) == fixture["priorVerified"][0]["priorObserved"]


def test_old_invalid_attachment_terms_are_absent_from_live_code_and_design():
    paths = [
        Path(__file__),
        Path(zotero_bridge.__file__),
        REPO_ROOT / "docs" / "superpowers" / "specs" / "2026-07-12-evidence-reliability-zotero-design.md",
    ]
    old_terms = ("pdf" + "_invalid", "attachment" + "-invalid")
    for path in paths:
        text = path.read_text(encoding="utf-8")
        assert all(term not in text for term in old_terms), path


def test_zotero_scanned_pdf_can_be_verified_without_indexed_text():
    fixture = load_snapshot(
        ZOTERO_FIXTURES / "zotero_snapshot_attachment_states.json"
    )
    status = inspect_attachment_children(
        "KL5HP3MU", fixture["validScannedPdf"], explicit=True
    )

    assert status["state"] == "pdf_verified"
    assert status["byteCount"] == 4096
    assert set(status) == {
        "state", "contentType", "byteCount", "modifiedAt", "verifiedAt"
    }


def test_zotero_indexed_pdf_reports_indexed_state_separately():
    fixture = load_snapshot(
        ZOTERO_FIXTURES / "zotero_snapshot_attachment_states.json"
    )
    status = inspect_attachment_children(
        "KL5HP3MU", fixture["validIndexedPdf"], explicit=True
    )

    assert status["state"] == "pdf_indexed"
    assert status["byteCount"] == 8192


def test_zotero_snapshot_sanitization_rejects_sensitive_data_recursively():
    unsafe_values = (
        {"nested": {"filePath": f"{SYNTHETIC_MACOS_USER_ROOT}/paper.pdf"}},
        {"records": [{"attachmentKey": "ABCD1234"}]},
        {"nested": {"url": f"file://{SYNTHETIC_MACOS_USER_ROOT}/paper.pdf"}},
        {"deep": [{"extractedText": "licensed article text"}]},
        {"deep": [{"fullText": "licensed article text"}]},
        {"path": "/private/tmp/article.pdf"},
    )
    for unsafe in unsafe_values:
        try:
            sanitize_snapshot(unsafe)
        except ValueError:
            pass
        else:
            raise AssertionError(f"unsafe snapshot was accepted: {unsafe!r}")

    safe = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    assert sanitize_snapshot(safe) == safe
    assert sanitize_snapshot(safe) is not safe


def test_zotero_snapshot_sanitization_rejects_generic_key_in_child_context():
    unsafe = {
        "items": [],
        "children": [
            {"key": "CHLD1234", "data": {"itemType": "attachment"}}
        ],
    }
    try:
        sanitize_snapshot(unsafe)
    except ValueError:
        pass
    else:
        raise AssertionError("attachment child keys must never enter a snapshot")


def test_zotero_transport_accepts_only_exact_configured_origin():
    for base_url in (
        "http://localhost:23119",
        "http://[::1]:23119",
        "http://127.0.0.1:23119/",
        "http://127.0.0.1:23120",
        "https://127.0.0.1:23119",
    ):
        try:
            api_get("/api/", base_url)
        except ValueError:
            pass
        else:
            raise AssertionError(f"non-canonical Zotero origin accepted: {base_url}")


def test_zotero_transport_disables_environment_proxies_and_remains_get_only():
    captured: dict = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b"{}"

    class FakeOpener:
        def open(self, request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return FakeResponse()

    with mock.patch.dict(
        os.environ,
        {"HTTP_PROXY": "http://malicious.example:8080", "NO_PROXY": ""},
        clear=False,
    ), mock.patch.object(
        zotero_bridge.urllib.request,
        "build_opener",
        return_value=FakeOpener(),
    ) as build_opener:
        assert api_get("/api/", "http://127.0.0.1:23119") == {}

    handlers = build_opener.call_args.args
    proxy_handlers = [
        handler
        for handler in handlers
        if isinstance(handler, zotero_bridge.urllib.request.ProxyHandler)
    ]
    assert len(proxy_handlers) == 1
    assert proxy_handlers[0].proxies == {}
    assert captured["request"].get_method() == "GET"
    assert captured["request"].get_header("Zotero-api-version") == "3"


def test_zotero_status_never_prints_server_payload_or_exception_details():
    malicious = {
        "message": f"file://{SYNTHETIC_MACOS_USER_ROOT}/secret.pdf"
    }
    stdout = io.StringIO()
    stderr = io.StringIO()
    with mock.patch.object(zotero_bridge, "api_get", return_value=malicious), \
         contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        exit_code = zotero_bridge.main(["status"])

    assert exit_code == 0
    assert stdout.getvalue() == "api: reachable\nconnector: reachable\n"
    assert stderr.getvalue() == ""
    assert "Users" not in stdout.getvalue()

    stdout = io.StringIO()
    stderr = io.StringIO()
    with tempfile.TemporaryDirectory() as directory, mock.patch.object(
        zotero_bridge,
        "api_get",
        side_effect=zotero_bridge.urllib.error.URLError(
            ConnectionRefusedError(61, "Connection refused")
        ),
    ), mock.patch.object(zotero_bridge, "write_reports") as report_writer, \
         mock.patch.object(zotero_bridge, "_write_current_snapshot") as snapshot_writer, \
         contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        before = set(Path(directory).iterdir())
        exit_code = zotero_bridge.main(["status"])
        after = set(Path(directory).iterdir())

    assert exit_code == 2
    assert stdout.getvalue() == ""
    assert stderr.getvalue() == "api_unavailable\n"
    assert "Users" not in stderr.getvalue()
    assert before == after == set()
    report_writer.assert_not_called()
    snapshot_writer.assert_not_called()


def test_zotero_snapshot_library_filters_top_level_children_before_projection():
    config = _zotero_config()
    fixture = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    parent = copy.deepcopy(fixture["items"][0])
    attachment = copy.deepcopy(parent)
    attachment["key"] = "ATCH1234"
    attachment["data"]["itemType"] = "Attachment"
    attachment["data"]["title"] = (
        f"file://{SYNTHETIC_MACOS_USER_ROOT}/private.pdf"
    )
    note = copy.deepcopy(parent)
    note["key"] = "NOTE1234"
    note["data"]["itemType"] = "nOtE"
    note["data"]["title"] = "OCR LICENSED TEXT SENTINEL"

    with mock.patch.object(
        zotero_bridge,
        "api_get",
        return_value=fixture["collections"],
    ), mock.patch.object(
        zotero_bridge,
        "fetch_all",
        return_value=[parent, attachment, note],
    ):
        snapshot = snapshot_library(config)

    assert [row["key"] for row in snapshot["items"]] == ["KL5HP3MU"]
    encoded = json.dumps(snapshot)
    assert "ATCH1234" not in encoded
    assert "NOTE1234" not in encoded
    assert "Users" not in encoded
    assert "LICENSED TEXT" not in encoded


def test_zotero_sanitizer_rejects_reviewer_privacy_payloads():
    valid = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    payloads: list[tuple[str, dict]] = []

    standalone_attachment = copy.deepcopy(valid)
    attachment = copy.deepcopy(standalone_attachment["items"][0])
    attachment["key"] = "ATCH1234"
    attachment["data"]["itemType"] = "Attachment"
    standalone_attachment["items"].append(attachment)
    payloads.append(("standalone attachment row key", standalone_attachment))

    for label, field, value in (
        (
            "embedded file URL",
            "title",
            f"prefix file://{SYNTHETIC_MACOS_USER_ROOT}/a.pdf suffix",
        ),
        (
            "embedded local path",
            "title",
            f"failed at {SYNTHETIC_MACOS_USER_ROOT}/a.pdf",
        ),
        (
            "tight embedded local path",
            "title",
            f"failed:{SYNTHETIC_MACOS_USER_ROOT}/a.pdf",
        ),
        ("attachment identifier", "attachmentID", "ATCH1234"),
        ("OCR sentinel", "ocr", "LICENSED OCR SENTINEL"),
        ("relative path", "relativePath", "storage/article.pdf"),
        ("indexed text", "indexedTextContent", "LICENSED INDEXED TEXT"),
        ("encoded file URL", "title", "file%3A%2F%2F%2FUsers%2Fexample%2Fa.pdf"),
        ("quadruple encoded file URL", "title", "file%2525253Asecret"),
        ("embedded home path", "title", "failed at ~/Library/item.pdf"),
        (
            "macOS library path",
            "title",
            "failed:/Library/Application Support/Zotero/item.pdf",
        ),
        ("generic POSIX root", "title", "failed:/opt/zotero/item.pdf"),
        ("custom POSIX root", "title", "failed:/custom/root/item.pdf"),
        ("double-slash POSIX root", "title", "//custom/place/private.pdf"),
        ("backtick-delimited POSIX root", "title", "`/custom/place/private.pdf`"),
        ("hyphen-delimited POSIX root", "title", "failed-/custom/place/private.pdf"),
        ("Unicode POSIX root", "title", "failed=/秘密/private.pdf"),
        ("embedded UNC path", "title", r"failed:\\server\share\item.pdf"),
    ):
        payload = copy.deepcopy(valid)
        payload["items"][0]["data"][field] = value
        payloads.append((label, payload))

    error_report = {
        "matched": [],
        "matchedCount": 0,
        "records": [],
        "errors": [
            {
                "code": "unsafe",
                "message": (
                    f"could not read {SYNTHETIC_MACOS_USER_ROOT}/private.pdf"
                ),
                "evidence_id": "engel-1977-biopsychosocial-model",
            }
        ],
        "warnings": [],
    }
    payloads.append(("error path", error_report))

    for label, payload in payloads:
        try:
            sanitize_snapshot(payload)
        except ValueError:
            pass
        else:
            raise AssertionError(f"unsafe {label} payload was accepted")


def test_zotero_sanitizer_allowlists_parent_and_attachment_status_schemas():
    valid = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    valid["attachmentStatuses"] = {
        "KL5HP3MU": {
            "state": "pdf_verified",
            "contentType": "application/pdf",
            "byteCount": 4096,
            "modifiedAt": "2026-07-11T09:30:00Z",
            "verifiedAt": "2026-07-12T12:00:00Z",
        }
    }
    sanitized = sanitize_snapshot(valid)
    assert sanitized["items"][0]["key"] == "KL5HP3MU"
    assert sanitized["attachmentStatuses"]["KL5HP3MU"]["state"] == "pdf_verified"

    for unsafe_status in (
        {"state": "guessed"},
        {"state": "pdf_verified", "byteCount": "4096"},
        {"state": "pdf_verified", "attachmentID": "ATCH1234"},
        {
            "state": "pdf_verified",
            "error": f"{SYNTHETIC_MACOS_USER_ROOT}/private.pdf",
        },
    ):
        try:
            sanitize_snapshot(unsafe_status)
        except ValueError:
            pass
        else:
            raise AssertionError(f"unsafe attachment status accepted: {unsafe_status}")


def test_zotero_attachment_status_keys_must_be_snapshot_parent_keys():
    snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    snapshot["attachmentStatuses"] = {
        "CHILD123": {"state": "pdf_attached", "contentType": "application/pdf"}
    }
    try:
        sanitize_snapshot(snapshot)
    except ValueError as exc:
        assert str(exc) == (
            "attachment status key must identify a sanitized bibliographic parent"
        )
    else:
        raise AssertionError("non-parent attachment status key was accepted")


def test_zotero_config_must_exactly_match_the_task5_authority():
    valid_snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    registry = _canonical_tier1_registry()
    boolean_weeks = copy.deepcopy(_zotero_config()["weekCollections"])
    boolean_weeks[0]["week"] = True
    mutations = (
        ("baseUrl", "http://localhost:23119"),
        ("apiVersion", "4"),
        ("library", {"type": "user", "id": 1}),
        ("library", {"type": "user", "id": False}),
        ("rootCollection", {"key": "ZD6GBSYZ", "name": "REVIEWER_SENTINEL"}),
        (
            "weekCollections",
            [{"week": 1, "key": "BADK1234", "name": "REVIEWER_SENTINEL"}],
        ),
        ("weekCollections", boolean_weeks),
        ("expectedTier1Tags", ["Tier 1", "MS3-required", "REVIEWER_SENTINEL"]),
    )
    for field, value in mutations:
        config = _zotero_config()
        config[field] = value
        try:
            reconcile_registry(registry, valid_snapshot, config)
        except ValueError:
            pass
        else:
            raise AssertionError(f"non-canonical configuration accepted: {field}")

    extra = _zotero_config()
    extra["unexpected"] = "REVIEWER_SENTINEL"
    try:
        reconcile_registry(registry, valid_snapshot, extra)
    except ValueError:
        pass
    else:
        raise AssertionError("configuration with extra fields was accepted")


def test_zotero_config_failure_cannot_echo_arbitrary_text_from_cli():
    config = _zotero_config()
    config["rootCollection"]["name"] = "REVIEWER_SENTINEL"
    with tempfile.TemporaryDirectory() as directory:
        config_path = Path(directory) / "zotero_config.json"
        config_path.write_text(json.dumps(config), encoding="utf-8")
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exit_code = zotero_bridge.main(
                [
                    "--config",
                    str(config_path),
                    "check",
                    "--snapshot",
                    str(ZOTERO_FIXTURES / "zotero_snapshot_valid.json"),
                ]
            )

    assert exit_code == 2
    assert stdout.getvalue() == ""
    assert stderr.getvalue() == "api_unavailable\n"
    assert "REVIEWER_SENTINEL" not in stdout.getvalue() + stderr.getvalue()


def test_zotero_report_rejects_arbitrary_issue_code_and_message():
    issues = (
        {
            "code": "arbitrary-safe-slug",
            "message": "REVIEWER_SENTINEL",
            "evidence_id": "engel-1977-biopsychosocial-model",
        },
        {
            "code": "collection-config-error",
            "message": "configured Zotero collection is missing: ZZZZ9999",
            "evidence_id": "",
        },
    )
    for issue in issues:
        payload = {
            "matched": [],
            "matchedCount": 0,
            "records": [],
            "errors": [issue],
            "warnings": [],
        }
        try:
            sanitize_snapshot(payload)
        except ValueError:
            pass
        else:
            raise AssertionError(f"arbitrary report issue was accepted: {issue}")


def test_zotero_normal_bibliographic_parent_keys_survive_type_whitelist():
    snapshot = sanitize_snapshot(
        load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    )
    assert len(snapshot["items"]) == 17
    assert {row["data"]["itemType"] for row in snapshot["items"]} == {
        "journalArticle"
    }
    assert "KL5HP3MU" in {row["key"] for row in snapshot["items"]}


def test_zotero_sanitizer_allows_legitimate_citation_urls_and_identifiers():
    snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    snapshot["items"][0]["data"]["title"] = (
        "Citation https://example.org/articles/123 with DOI 10.1002/example.1"
    )
    sanitized = sanitize_snapshot(snapshot)
    assert sanitized["items"][0]["key"] == "KL5HP3MU"


def test_zotero_identity_helpers_are_stable_for_api_shapes():
    assert creator_family(
        [{"creatorType": "editor", "lastName": "Ignore"},
         {"creatorType": "author", "lastName": "Engel"}]
    ) == "Engel"
    assert creator_family([{"creatorType": "author", "name": "WHO"}]) == "WHO"
    assert publication_year("Published online 2004-08-18") == "2004"
    assert publication_year(1977) == "1977"
    assert publication_year(None) == ""


def test_zotero_journal_normalization_accepts_only_gate_b_aliases():
    accepted = {
        "Science (New York, N.Y.)": "science",
        "The American journal of psychiatry": "american journal of psychiatry",
        "The British journal of psychiatry : the journal of mental science": (
            "the british journal of psychiatry"
        ),
        "The Cochrane database of systematic reviews": (
            "cochrane database of systematic reviews"
        ),
        "The New England journal of medicine": (
            "new england journal of medicine"
        ),
    }
    for observed, expected in accepted.items():
        assert normalize_journal(observed) == expected

    assert normalize_journal("Science Translational Medicine") == (
        "science translational medicine"
    )
    assert normalize_journal("BJPsych Open") == "bjpsych open"
    assert normalize_journal("The American Journal of Psychiatry Supplement") == (
        "the american journal of psychiatry supplement"
    )
    assert normalize_journal("A Genuinely Different Journal") == (
        "a genuinely different journal"
    )


def test_zotero_gate_b_journal_aliases_resolve_current_eight_but_not_near_misses():
    registry = _canonical_tier1_registry()
    snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    observed = {
        "KL5HP3MU": "Science (New York, N.Y.)",
        "TSN2F24F": "Science (New York, N.Y.)",
        "LGJ9CSR3": "The American journal of psychiatry",
        "E8BCCFSN": (
            "The British journal of psychiatry : the journal of mental science"
        ),
        "P4M5H9VM": "The Cochrane database of systematic reviews",
        "ZTWERT6K": "Science (New York, N.Y.)",
        "XRADQ2TY": "The American journal of psychiatry",
        "9FCMTHM2": "The New England journal of medicine",
    }
    for item in snapshot["items"]:
        if item["key"] in observed:
            item["data"]["publicationTitle"] = observed[item["key"]]

    result = reconcile_registry(registry, snapshot, _zotero_config())
    assert result.matched_count == 17
    assert result.errors == []
    assert all(record.status == "matched" for record in result.records)

    near_misses = (
        "Science Translational Medicine",
        "BJPsych Open",
        "A Genuinely Different Journal",
    )
    for journal in near_misses:
        changed = copy.deepcopy(snapshot)
        engel = next(row for row in changed["items"] if row["key"] == "KL5HP3MU")
        engel["data"]["publicationTitle"] = journal
        drift = reconcile_registry(registry, changed, _zotero_config())
        engel_record = next(
            row
            for row in drift.records
            if row.evidence_id == "engel-1977-biopsychosocial-model"
        )
        assert engel_record.status == "identity-conflict", journal
        assert engel_record.identity_differences == [
            {"field": "journal", "expected": "Science", "observed": journal}
        ]


def test_zotero_fixture_cli_reports_17_matches_and_advisory_weeks():
    result = subprocess.run(
        [
            sys.executable,
            str(ZOTERO_RECONCILE),
            "check",
            "--snapshot",
            str(ZOTERO_FIXTURES / "zotero_snapshot_valid.json"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "matched: 17" in result.stdout
    assert "errors: 0" in result.stdout
    assert "week-collection-advisory" in result.stdout


def test_zotero_reports_are_sanitized_and_contain_only_parent_linkage():
    result = reconcile_registry(
        _canonical_tier1_registry(),
        load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json"),
        _zotero_config(),
    )
    with tempfile.TemporaryDirectory() as directory:
        paths = write_reports(result, Path(directory))
        assert {path.name for path in paths} == {
            "reconciliation_report.json",
            "reconciliation_report.md",
            "Tier1_Primary_Source_Download_Checklist.csv",
        }
        encoded = "\n".join(path.read_text(encoding="utf-8") for path in paths)

    assert "engel-1977-biopsychosocial-model" in encoded
    assert "KL5HP3MU" in encoded
    for forbidden in (
        "/Users/",
        "file://",
        "attachmentKey",
        "fullText",
        "indexedText",
        "licensed article text",
    ):
        assert forbidden not in encoded


def test_zotero_gate_b_reports_all_17_records_with_safe_identity_differences():
    registry = _canonical_tier1_registry()
    snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    drift_keys = {
        "KL5HP3MU",
        "TSN2F24F",
        "LGJ9CSR3",
        "E8BCCFSN",
        "P4M5H9VM",
        "ZTWERT6K",
        "XRADQ2TY",
        "9FCMTHM2",
    }
    for item in snapshot["items"]:
        if item["key"] in drift_keys:
            item["data"]["publicationTitle"] = f"Observed Journal {item['key']}"

    result = reconcile_registry(registry, snapshot, _zotero_config())
    assert result.matched_count == 9
    with tempfile.TemporaryDirectory() as directory:
        paths = write_reports(result, Path(directory))
        report = json.loads(
            next(path for path in paths if path.suffix == ".json").read_text(
                encoding="utf-8"
            )
        )
        csv_path = next(path for path in paths if path.suffix == ".csv")
        with csv_path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        markdown = next(path for path in paths if path.suffix == ".md").read_text(
            encoding="utf-8"
        )

    assert len(report["records"]) == 17
    assert len(rows) == 17
    engel = next(
        row
        for row in report["records"]
        if row["evidenceId"] == "engel-1977-biopsychosocial-model"
    )
    assert engel["itemKey"] == "KL5HP3MU"
    assert engel["status"] == "identity-conflict"
    assert engel["attachment"]["state"] is None
    assert engel["identityDifferences"] == [
        {
            "field": "journal",
            "expected": "Science",
            "observed": "Observed Journal KL5HP3MU",
        }
    ]
    engel_csv = next(
        row for row in rows if row["evidence_id"] == engel["evidenceId"]
    )
    assert engel_csv["zotero_parent_item_key"] == "KL5HP3MU"
    assert engel_csv["reconciliation_status"] == "identity-conflict"
    assert "journal" in engel_csv["identity_differences"]
    assert "Science" in engel_csv["identity_differences"]
    assert "Observed Journal KL5HP3MU" in engel_csv["identity_differences"]
    assert "Observed Journal KL5HP3MU" in markdown


def test_zotero_local_workbook_requirement_is_exact_and_isolated():
    assert LOCAL_REQUIREMENTS.read_text(encoding="utf-8") == "openpyxl>=3.1,<4\n"
    assert "openpyxl" not in ZOTERO_RECONCILE.read_text(encoding="utf-8").split(
        "def _render_report_xlsx", 1
    )[0]


def test_zotero_xlsx_dependency_failure_is_exact_and_writes_nothing():
    result = reconcile_registry(
        _canonical_tier1_registry(),
        load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json"),
        _zotero_config(),
    )
    original_import = builtins.__import__

    def reject_openpyxl(name, *args, **kwargs):
        if name == "openpyxl":
            raise ImportError("test dependency refusal")
        return original_import(name, *args, **kwargs)

    with tempfile.TemporaryDirectory() as directory:
        output_dir = Path(directory) / "reports"
        with mock.patch("builtins.__import__", side_effect=reject_openpyxl):
            try:
                write_reports(result, output_dir, include_xlsx=True)
            except RuntimeError as exc:
                assert str(exc) == (
                    "XLSX output requires: python3 -m pip install -r "
                    "tools/evidence_registry/requirements-local.txt"
                )
            else:
                raise AssertionError("missing openpyxl must fail actionably")
        assert not output_dir.exists()


def test_zotero_xlsx_cli_emits_only_the_actionable_dependency_error():
    original_import = builtins.__import__

    def reject_openpyxl(name, *args, **kwargs):
        if name == "openpyxl":
            raise ImportError("test dependency refusal")
        return original_import(name, *args, **kwargs)

    with tempfile.TemporaryDirectory() as directory:
        output_dir = Path(directory) / "reports"
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch("builtins.__import__", side_effect=reject_openpyxl), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exit_code = zotero_bridge.main(
                [
                    "report",
                    "--snapshot",
                    str(ZOTERO_FIXTURES / "zotero_snapshot_valid.json"),
                    "--output-dir",
                    str(output_dir),
                    "--xlsx",
                ]
            )

        assert not output_dir.exists()

    assert exit_code == 2
    assert stdout.getvalue() == ""
    assert stderr.getvalue() == (
        "XLSX output requires: python3 -m pip install -r "
        "tools/evidence_registry/requirements-local.txt\n"
    )


def test_zotero_fixture_report_cli_writes_only_ignored_local_artifacts():
    with tempfile.TemporaryDirectory() as directory:
        output_dir = Path(directory) / "evidence_registry"
        result = subprocess.run(
            [
                sys.executable,
                str(ZOTERO_RECONCILE),
                "report",
                "--snapshot",
                str(ZOTERO_FIXTURES / "zotero_snapshot_valid.json"),
                "--output-dir",
                str(output_dir),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        names = {path.name for path in output_dir.iterdir()} if output_dir.exists() else set()
        encoded = "\n".join(
            path.read_text(encoding="utf-8")
            for path in output_dir.iterdir()
            if path.suffix in {".json", ".md", ".csv"}
        ) if output_dir.exists() else ""

    assert result.returncode == 0, result.stdout + result.stderr
    assert names == {
        "current_snapshot.json",
        "reconciliation_report.json",
        "reconciliation_report.md",
        "Tier1_Primary_Source_Download_Checklist.csv",
    }
    assert "current_snapshot.json" in result.stdout
    assert "reconciliation_report.md" in result.stdout
    assert "/Users/" not in encoded
    assert "file://" not in encoded
    assert "attachmentKey" not in encoded
    assert "fullText" not in encoded


def test_zotero_fresh_metadata_preserves_prior_sanitized_attachment_states():
    prior = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    prior["attachmentStatuses"] = {
        "KL5HP3MU": {
            "state": "pdf_verified",
            "contentType": "application/pdf",
            "byteCount": 4096,
            "verifiedAt": "2026-07-12T12:00:00Z",
        }
    }
    fresh = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    with tempfile.TemporaryDirectory() as directory:
        output_dir = Path(directory)
        (output_dir / "current_snapshot.json").write_text(
            json.dumps(prior), encoding="utf-8"
        )
        args = argparse.Namespace(
            snapshot=None,
            attachments=False,
            output_dir=output_dir,
        )
        with mock.patch.object(
            zotero_bridge, "snapshot_library", return_value=fresh
        ):
            observed = zotero_bridge._snapshot_for_check(
                args, _zotero_config(), _canonical_tier1_registry()
            )

    assert observed["attachmentStatuses"] == prior["attachmentStatuses"]


def test_zotero_attachment_check_preserves_prior_state_for_identity_blocked_parent():
    prior = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    prior["attachmentStatuses"] = {
        "KL5HP3MU": {
            "state": "pdf_verified",
            "contentType": "application/pdf",
            "byteCount": 4096,
            "verifiedAt": "2026-07-12T12:00:00Z",
        }
    }
    fresh = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    engel = next(row for row in fresh["items"] if row["key"] == "KL5HP3MU")
    engel["data"]["publicationTitle"] = "Identity drift sentinel"
    with tempfile.TemporaryDirectory() as directory:
        output_dir = Path(directory)
        (output_dir / "current_snapshot.json").write_text(
            json.dumps(prior), encoding="utf-8"
        )
        args = argparse.Namespace(
            snapshot=None,
            attachments=True,
            output_dir=output_dir,
        )
        with mock.patch.object(
            zotero_bridge, "snapshot_library", return_value=fresh
        ), mock.patch.object(
            zotero_bridge, "_live_attachment_statuses", return_value={}
        ):
            observed = zotero_bridge._snapshot_for_check(
                args, _zotero_config(), _canonical_tier1_registry()
            )

    assert observed["attachmentStatuses"]["KL5HP3MU"] == prior[
        "attachmentStatuses"
    ]["KL5HP3MU"]


def test_zotero_writer_accepts_large_snapshots_after_field_level_sanitization():
    snapshot = load_snapshot(ZOTERO_FIXTURES / "zotero_snapshot_valid.json")
    snapshot["items"] = snapshot["items"] * 3
    assert len(json.dumps(snapshot)) > 16_384
    assert sanitize_snapshot(snapshot) == snapshot

    with tempfile.TemporaryDirectory() as directory:
        path = zotero_bridge._write_current_snapshot(snapshot, Path(directory))
        written = json.loads(path.read_text(encoding="utf-8"))

    assert len(written["items"]) == 51
    assert "KL5HP3MU" in {row["key"] for row in written["items"]}


def test_zotero_local_workflow_documents_authority_privacy_and_commands():
    assert "/outputs/evidence_registry/" in (REPO_ROOT / ".gitignore").read_text(
        encoding="utf-8"
    )
    text = EVIDENCE_README.read_text(encoding="utf-8")
    for command in (
        "validate.py --check-generated",
        "zotero_reconcile.py status",
        "zotero_reconcile.py snapshot",
        "zotero_reconcile.py check",
        "zotero_reconcile.py check --attachments",
        "zotero_reconcile.py report --xlsx",
    ):
        assert command in text
    for statement in (
        "evidence_registry.json alone is the canonical evidence authority",
        "derived review views",
        "read-only",
        "BibTeX",
        "zotero://select/library/items/<parentKey>",
        "outputs/evidence_registry/",
    ):
        assert statement in text


def test_zotero_output_directory_boundary_rejects_tracked_repo_paths():
    message = (
        "output_dir must be outside the repository or under "
        "outputs/evidence_registry/"
    )
    for unsafe in (
        REPO_ROOT,
        REPO_ROOT / "tools",
        REPO_ROOT / "outputs" / "other-report",
    ):
        try:
            zotero_bridge._validated_output_dir(unsafe)
        except ValueError as exc:
            assert str(exc) == message
        else:
            raise AssertionError(f"tracked repository output was accepted: {unsafe}")

    allowed = REPO_ROOT / "outputs" / "evidence_registry" / "nested"
    assert zotero_bridge._validated_output_dir(allowed) == allowed.resolve()
    with tempfile.TemporaryDirectory() as directory:
        external = Path(directory) / "reports"
        assert zotero_bridge._validated_output_dir(external) == external.resolve()


def test_zotero_snapshot_and_report_cli_reject_tracked_output_directories():
    message = (
        "output_dir must be outside the repository or under "
        "outputs/evidence_registry/\n"
    )
    cases = (
        ["snapshot", "--output-dir", str(REPO_ROOT)],
        [
            "report",
            "--snapshot",
            str(ZOTERO_FIXTURES / "zotero_snapshot_valid.json"),
            "--output-dir",
            str(REPO_ROOT / "tools"),
        ],
    )
    for arguments in cases:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch.object(
            zotero_bridge,
            "snapshot_library",
            return_value=load_snapshot(
                ZOTERO_FIXTURES / "zotero_snapshot_valid.json"
            ),
        ) as snapshot_reader, contextlib.redirect_stdout(
            stdout
        ), contextlib.redirect_stderr(stderr):
            exit_code = zotero_bridge.main(arguments)

        assert exit_code == 2
        assert stdout.getvalue() == ""
        assert stderr.getvalue() == message
        snapshot_reader.assert_not_called()


def _write_fixture_repo(repo_root: Path, evidence_id: str) -> None:
    (repo_root / "evidence_registry.json").write_text(
        json.dumps(_fixture_registry_with_canonical_surveillance()), encoding="utf-8"
    )
    (repo_root / "evidence_registry.schema.json").write_bytes(
        SCHEMA_PATH.read_bytes()
    )
    for filename in REFERENCE_FILES:
        (repo_root / filename).write_text(
            json.dumps({"evidenceIds": [evidence_id]}), encoding="utf-8"
        )


def _write_canonical_repo(repo_root: Path, registry: dict | None = None) -> None:
    registry_text = (
        REGISTRY_PATH.read_text(encoding="utf-8")
        if registry is None
        else json.dumps(registry)
    )
    (repo_root / "evidence_registry.json").write_text(
        registry_text, encoding="utf-8"
    )
    (repo_root / "evidence_registry.schema.json").write_bytes(
        SCHEMA_PATH.read_bytes()
    )
    for filename in REFERENCE_FILES:
        (repo_root / filename).write_text("{}\n", encoding="utf-8")


def _write_json_yaml_shim(directory: Path) -> None:
    (directory / "yaml.py").write_text(
        "import json\n"
        "def safe_load(stream):\n"
        "    return json.load(stream)\n",
        encoding="utf-8",
    )


def test_compare_legacy_surveillance_cli_reports_exact_match():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        _write_canonical_repo(repo_root)
        projection = registry_library.build_surveillance_projection(
            load_evidence_registry(REGISTRY_PATH)
        )
        legacy_path = repo_root / "legacy-surveillance.json"
        legacy_path.write_text(json.dumps(projection), encoding="utf-8")
        _write_json_yaml_shim(repo_root)
        environment = os.environ.copy()
        environment["PYTHONPATH"] = str(repo_root)
        result = subprocess.run(
            [
                sys.executable,
                str(VALIDATE),
                "--repo-root",
                str(repo_root),
                "--compare-legacy-surveillance",
                str(legacy_path),
            ],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "legacy surveillance projection matches canonical registry" in result.stdout


def test_compare_legacy_surveillance_cli_prints_sorted_unified_diff():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        _write_canonical_repo(repo_root)
        projection = registry_library.build_surveillance_projection(
            load_evidence_registry(REGISTRY_PATH)
        )
        projection["resource_intake"]["max_candidates_per_run"] = 24
        legacy_path = repo_root / "legacy-surveillance.json"
        legacy_path.write_text(json.dumps(projection), encoding="utf-8")
        _write_json_yaml_shim(repo_root)
        environment = os.environ.copy()
        environment["PYTHONPATH"] = str(repo_root)
        result = subprocess.run(
            [
                sys.executable,
                str(VALIDATE),
                "--repo-root",
                str(repo_root),
                "--compare-legacy-surveillance",
                str(legacy_path),
            ],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    assert result.returncode == 1
    assert "--- legacy surveillance" in result.stdout
    assert "+++ canonical surveillance" in result.stdout
    assert '-    "max_candidates_per_run": 24' in result.stdout
    assert '+    "max_candidates_per_run": 25' in result.stdout


def test_offline_cli_never_imports_yaml_during_normal_validation():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        _write_fixture_repo(repo_root, "engel-1977-biopsychosocial-model")
        (repo_root / "yaml.py").write_text(
            'raise AssertionError("normal validation imported yaml")\n',
            encoding="utf-8",
        )
        environment = os.environ.copy()
        environment["PYTHONPATH"] = str(repo_root)
        result = subprocess.run(
            [sys.executable, str(VALIDATE), "--repo-root", str(repo_root)],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "normal validation imported yaml" not in result.stdout + result.stderr


def test_offline_cli_validates_against_the_repo_local_published_schema():
    with tempfile.TemporaryDirectory() as directory:
        repo_root = Path(directory)
        _write_canonical_repo(repo_root)
        schema = json.loads(
            (repo_root / "evidence_registry.schema.json").read_text(encoding="utf-8")
        )
        schema["properties"]["owner"]["minLength"] = 100
        (repo_root / "evidence_registry.schema.json").write_text(
            json.dumps(schema), encoding="utf-8"
        )
        result = subprocess.run(
            [sys.executable, str(VALIDATE), "--repo-root", str(repo_root)],
            check=False,
            capture_output=True,
            text=True,
        )

    assert result.returncode == 1, result.stdout + result.stderr
    assert "owner" in result.stdout
    assert "at least 100 character" in result.stdout


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
    assert "25 sources, 17 Tier 1 articles, 16 numbered selections" in result.stdout
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
    assert "25 sources, 17 Tier 1 articles, 16 numbered selections" in result.stdout


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
