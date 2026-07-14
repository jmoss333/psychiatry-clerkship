from copy import deepcopy
from dataclasses import FrozenInstanceError
import json
from pathlib import Path
import sqlite3
from zipfile import ZipFile

from jsonschema import Draft7Validator, FormatChecker
import pytest

from pcl_anki.contract import (
    APPLICATION_DECK_ID,
    APPLICATION_DECK_NAME,
    APPLICATION_FIELDS,
    APPLICATION_GUID_NAMESPACE,
    APPLICATION_MODEL_ID,
    APPLICATION_MODEL_NAME,
    APPLICATION_TEMPLATE_ID,
    APPLICATION_TEMPLATE_NAME,
    APPLICATION_TEMPLATE_ORDINAL,
    CORE_BASIC_FIELDS,
    CORE_BASIC_MODEL_ID,
    CORE_BASIC_MODEL_NAME,
    CORE_BASIC_TEMPLATE_ID,
    CORE_BASIC_TEMPLATE_NAME,
    CORE_BASIC_TEMPLATE_ORDINAL,
    CORE_CLOZE_FIELDS,
    CORE_CLOZE_MODEL_ID,
    CORE_CLOZE_MODEL_NAME,
    CORE_CLOZE_TEMPLATE_ID,
    CORE_CLOZE_TEMPLATE_NAME,
    CORE_CLOZE_TEMPLATE_ORDINAL,
    CORE_DECK_ID,
    CORE_DECK_NAME,
    CORE_GUID_NAMESPACE,
    Issue,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    LEGACY_QBANK_TEMPLATE_NAME,
    LEGACY_QBANK_TEMPLATE_ORDINAL,
    canonical_json_bytes,
    canonical_json_sha256,
    normalize_source,
    validate_registry,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_DIR = REPO_ROOT / "13_Faculty_Resources" / "anki"
ROOT_CONTRACTS = {
    "cards": {"schemaVersion", "cards"},
    "qbank_render_reviews": {"schemaVersion", "reviews"},
    "quarantine": {"schemaVersion", "accepted"},
    "release_history": {"schemaVersion", "identityEntries", "releases"},
    "release_config": {
        "schemaVersion",
        "canonicalBaseUrl",
        "siteMode",
        "minimumSupportedDesktopAnki",
        "currentTestedAnki",
        "permanentIdentities",
        "coverage",
        "productionAllowlist",
        "releaseId",
        "releaseDate",
        "releaseEpoch",
        "templateVersions",
        "templateContractSha256",
        "knownSafetyHolds",
        "frontJaccardReviewThreshold",
        "answerJaccardReviewThreshold",
        "duplicateNormalization",
        "sequenceMapPath",
        "primaryAuthorityPathPrefixes",
        "contextOnlyPathPrefixes",
        "sequencingOnlyPaths",
    },
}

CORE_COVERAGE = {
    "W01|Diagnosis": 5,
    "W01|Psychopharmacology": 1,
    "W01|Safety": 7,
    "W01|Communication": 8,
    "W01|PsychotherapyFormulation": 2,
    "W01|DispositionHandoff": 5,
    "W02|Diagnosis": 8,
    "W02|Psychopharmacology": 10,
    "W02|Safety": 5,
    "W02|Communication": 2,
    "W02|PsychotherapyFormulation": 2,
    "W02|DispositionHandoff": 3,
    "W03|Diagnosis": 4,
    "W03|Psychopharmacology": 2,
    "W03|Safety": 4,
    "W03|Communication": 3,
    "W03|PsychotherapyFormulation": 8,
    "W03|DispositionHandoff": 1,
    "W04|Diagnosis": 1,
    "W04|Psychopharmacology": 1,
    "W04|Safety": 2,
    "W04|Communication": 7,
    "W04|PsychotherapyFormulation": 5,
    "W04|DispositionHandoff": 2,
    "W05|Diagnosis": 5,
    "W05|Psychopharmacology": 7,
    "W05|Safety": 10,
    "W05|Communication": 3,
    "W05|PsychotherapyFormulation": 1,
    "W05|DispositionHandoff": 2,
    "W06|Diagnosis": 1,
    "W06|Psychopharmacology": 1,
    "W06|Safety": 2,
    "W06|Communication": 1,
    "W06|PsychotherapyFormulation": 2,
    "W06|DispositionHandoff": 11,
}
APPLICATION_COVERAGE = {
    "W01|Diagnosis": 2,
    "W01|NextStep": 1,
    "W01|Safety": 2,
    "W01|Pharmacology": 0,
    "W01|Psychosocial": 2,
    "W01|Disposition": 1,
    "W02|Diagnosis": 4,
    "W02|NextStep": 1,
    "W02|Safety": 1,
    "W02|Pharmacology": 3,
    "W02|Psychosocial": 1,
    "W02|Disposition": 0,
    "W03|Diagnosis": 2,
    "W03|NextStep": 1,
    "W03|Safety": 1,
    "W03|Pharmacology": 1,
    "W03|Psychosocial": 2,
    "W03|Disposition": 1,
    "W04|Diagnosis": 1,
    "W04|NextStep": 1,
    "W04|Safety": 0,
    "W04|Pharmacology": 0,
    "W04|Psychosocial": 2,
    "W04|Disposition": 2,
    "W05|Diagnosis": 2,
    "W05|NextStep": 2,
    "W05|Safety": 3,
    "W05|Pharmacology": 2,
    "W05|Psychosocial": 0,
    "W05|Disposition": 1,
    "W06|Diagnosis": 1,
    "W06|NextStep": 2,
    "W06|Safety": 1,
    "W06|Pharmacology": 2,
    "W06|Psychosocial": 0,
    "W06|Disposition": 0,
}

LEGACY_QBANK_QFMT = '<div class="stem">{{Question}}</div>{{Options}}'
LEGACY_QBANK_AFMT = (
    '<div class="stem">{{Question}}</div>{{Options}}<hr id="answer">{{Answer}}'
    '{{#Why}}<div class="why">{{Why}}</div>{{/Why}}'
    '{{#Pearl}}<div class="pearl">💡 {{Pearl}}</div>{{/Pearl}}'
    '{{#Evidence}}<div class="evidence">📄 {{Evidence}}</div>{{/Evidence}}'
    '{{#Link}}<div class="link">🔗 {{Link}}</div>{{/Link}}'
    "{{#Meta}}<div>{{Meta}}</div>{{/Meta}}"
)
LEGACY_QBANK_CSS = """
.card { font-family: -apple-system, Segoe UI, Roboto, sans-serif;
        font-size: 17px; line-height: 1.5; color: #1a1a1a;
        background: #fbf7f0; text-align: left; padding: 14px 18px; }
.stem { margin-bottom: 12px; }
.opts { margin: 0 0 6px 0; padding: 0; list-style: none; }
.opts li { margin: 4px 0; }
.answer { font-weight: 700; color: #1f6f54; }
.tag { display:inline-block; font-size:12px; font-weight:600; color:#8a5a1a;
       background:#f2e6d2; border-radius:4px; padding:1px 7px; margin:2px 4px 2px 0; }
.trap { color:#8a2b2b; }
.trap b { color:#8a2b2b; }
.why { margin-top:10px; }
.pearl { margin-top:10px; padding:8px 12px; background:#eaf3ee;
         border-left:3px solid #1f6f54; border-radius:4px; }
.evidence { margin-top:10px; font-size:14px; color:#555; }
.link { margin-top:10px; font-size:14px; }
.draft { color:#8a2b2b; font-weight:700; }
hr { border:none; border-top:1px solid #d9cdb8; margin:12px 0; }
"""


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validation_errors(value: object, schema: dict) -> list:
    validator = Draft7Validator(schema, format_checker=FormatChecker())
    return sorted(validator.iter_errors(value), key=lambda error: list(error.path))


def schema_issue_codes(value: object, schema: dict) -> set[str]:
    return {
        error.schema.get("x-issue-code", "SCHEMA_VALIDATION_ERROR")
        for error in validation_errors(value, schema)
    }


def object_schemas(value: object):
    if isinstance(value, dict):
        if value.get("type") == "object":
            yield value
        for child in value.values():
            yield from object_schemas(child)
    elif isinstance(value, list):
        for child in value:
            yield from object_schemas(child)


def make_core_card(**overrides) -> dict:
    card = {
        "id": "ms3_w01_safety_001",
        "state": "draft",
        "kind": "basic",
        "family": "Escalation",
        "audience": "MS3",
        "week": 1,
        "domain": "Safety",
        "task": "Recognize",
        "risk": {"level": "High", "facets": ["Emergency"]},
        "front": "What finding should prompt immediate supervised escalation?",
        "answer": "An acute safety concern.",
        "explanation": "Immediate safety concerns require prompt team awareness.",
        "caveat": "Notify the supervising clinician and follow local emergency procedures.",
        "source": {
            "path": "04_Acute_and_Safety/Safety_Planning.md",
            "slug": "safety-planning",
            "anchor": "immediate-escalation",
            "url": "https://une-ms3-psychiatry.netlify.app/?page=safety-planning#immediate-escalation",
            "quote": "Escalate acute safety concerns immediately.",
            "quoteSha256": "a" * 64,
        },
        "render": {
            "templateVersion": "pcl-ms3-core-basic-v2",
            "templateContractSha256": "b" * 64,
        },
        "provenance": {
            "authoringMethod": "ai_assisted",
            "authoringTool": "OpenAI Codex",
        },
        "review": {"sequenceBasis": "weekly_map"},
        "reinforces": None,
        "supersedes": None,
    }
    card.update(overrides)
    return card


def make_approved_core_card(**overrides) -> dict:
    card = make_core_card(state="approved")
    card["provenance"].update(
        {"humanEditor": "Named Human Editor", "humanEditedAt": "2026-07-14"}
    )
    card["review"].update(
        {
            "cardApprovedBy": "Named Faculty Approver",
            "cardApprovedAt": "2026-07-14",
            "approvedCardSha256": "c" * 64,
            "evidenceCitation": "Reviewed evidence citation, version 2026-07-14",
            "evidenceRecord": "13_Faculty_Resources/evidence_registry.json#evidence-alpha",
            "evidenceSha256": "d" * 64,
            "evidenceReviewedBy": "Named Evidence Reviewer",
            "evidenceReviewedAt": "2026-07-14",
            "reviewDue": "2027-07-14",
        }
    )
    for key, value in overrides.items():
        card[key] = value
    return card


def make_fully_reviewed_core_card() -> dict:
    card = make_approved_core_card(
        risk={"level": "High", "facets": ["Emergency", "LocalPolicy"]}
    )
    card["review"].update(
        {
            "localPolicySource": "Named policy, owner, version 2026-07-14",
            "localPolicySha256": "e" * 64,
            "localPolicyReviewedBy": "Named Policy Owner",
            "localPolicyReviewedAt": "2026-07-14",
            "sequenceBasis": "faculty_override",
            "sequenceRationale": "Reviewed sequencing rationale.",
            "sequenceReviewedBy": "Named Faculty Reviewer",
            "sequenceReviewedAt": "2026-07-14",
        }
    )
    return card


def make_application_card(**overrides) -> dict:
    card = make_core_card(
        id="ms3_w02_application_001",
        kind="application",
        family="ApplicationVignette",
        week=2,
        domain="Diagnosis",
        task="Discriminate",
        front="A patient has Finding Alpha. What is the best diagnosis?",
        answer="Condition Alpha.",
        reinforces="ms3_w01_diagnosis_001",
    )
    card["render"]["templateVersion"] = "pcl-ms3-application-v2"
    card["qbank"] = {
        "id": "qb_neutral_001",
        "taskBundle": "Diagnosis",
        "primaryPage": "condition-alpha",
        "primaryAnchor": "diagnostic-features",
        "approvedItemSha256": "1" * 64,
        "primaryTrap": "Confusing Condition Alpha with Condition Beta",
        "sourceAnchorSha256": "2" * 64,
    }
    card["source"].update(
        {
            "path": "03_Core_Topics/Condition_Alpha.md",
            "slug": "condition-alpha",
            "anchor": "diagnostic-features",
            "url": "https://une-ms3-psychiatry.netlify.app/?page=condition-alpha#diagnostic-features",
        }
    )
    for key, value in overrides.items():
        card[key] = value
    return card


def make_legacy_template_contract() -> dict:
    return {
        "modelId": 1607392901,
        "modelName": "PCL Vignette (Moss)",
        "deckId": 2059400191,
        "deckName": "Psychiatry Clerkship Library (Moss)",
        "fields": [
            {"name": name, "id": None}
            for name in (
                "UID",
                "Question",
                "Options",
                "Answer",
                "Why",
                "Pearl",
                "Evidence",
                "Link",
                "Meta",
            )
        ],
        "templateId": None,
        "templateName": "Card 1",
        "templateOrdinal": 0,
        "qfmt": LEGACY_QBANK_QFMT,
        "afmt": LEGACY_QBANK_AFMT,
        "css": LEGACY_QBANK_CSS,
        "templateVersion": "pcl-qbank-legacy-v1",
    }


def make_qbank_render_review(**overrides) -> dict:
    review = {
        "qbankId": "qb_neutral_001",
        "identity": "base",
        "primaryPage": "condition-alpha",
        "primaryAnchor": "diagnostic-features",
        "approvedItemSha256": "3" * 64,
        "sourceAnchorSha256": "4" * 64,
        "templateVersion": "pcl-qbank-legacy-v1",
        "templateContractSha256": "5" * 64,
        "renderedNoteSha256": "6" * 64,
        "legacyTemplateContract": make_legacy_template_contract(),
        "risk": {"level": "High", "facets": ["Medication"]},
        "evidenceCitation": "Reviewed evidence citation, version 2026-07-14",
        "evidenceRecord": "13_Faculty_Resources/evidence_registry.json#evidence-alpha",
        "evidenceSha256": "7" * 64,
        "evidenceReviewedBy": "Named Evidence Reviewer",
        "evidenceReviewedAt": "2026-07-14",
        "reviewDue": "2027-07-14",
        "facultyApprovedBy": "Named Faculty Approver",
        "facultyApprovedAt": "2026-07-14",
    }
    review.update(overrides)
    return review


def make_quarantine_decision(**overrides) -> dict:
    decision = {
        "namespace": "qbank",
        "uid": "qb_neutral_001",
        "identity": "base",
        "reasonCode": "NEUTRAL_TEST_HOLD",
        "subjectSha256": "8" * 64,
        "sourcePath": "question_bank.json",
        "firstSeenCommit": "abcdef1234567890",
        "reviewOwner": "Named Review Owner",
        "disposition": "exclude",
        "reviewedBy": "Named Faculty Reviewer",
        "reviewedAt": "2026-07-14",
    }
    decision.update(overrides)
    return decision


def make_identity_entry(**overrides) -> dict:
    entry = {
        "namespace": "core",
        "uid": "ms3_w01_safety_001",
        "identity": "base",
        "guid": "neutral-guid",
        "kind": "basic",
        "model": {"id": 1740112001, "name": "PCL MS3 Core Basic v2"},
        "deck": {
            "id": 2059400201,
            "name": "Psychiatry Clerkship MS3 (Moss)::Core Recall",
        },
        "fields": [
            {"name": "UID", "id": 7715026946512367336},
            {"name": "Front", "id": 1581891087570822773},
        ],
        "template": {"id": 8777453155042897990, "name": "Card 1", "ordinal": 0},
        "firstShippedReleaseId": "release-alpha",
        "origin": "governed",
    }
    entry.update(overrides)
    return entry


def make_package_snapshot(active=1, withdrawn=0, scheduled=1) -> dict:
    return {
        "contentFingerprintSha256": "a" * 64,
        "activeNoteCount": active,
        "withdrawalNoteCount": withdrawn,
        "totalNoteCount": active + withdrawn,
        "scheduledCardCount": scheduled,
    }


def make_release_membership(**overrides) -> dict:
    membership = {
        "namespace": "core",
        "uid": "ms3_w01_safety_001",
        "identity": "base",
        "status": "active",
        "approvedCardSha256": "b" * 64,
        "shippedCardSha256": "c" * 64,
        "templateVersion": "pcl-ms3-core-basic-v2",
        "artifacts": [
            {
                "filename": "psychiatry_clerkship_ms3_core.apkg",
                "deckId": 2059400201,
                "deckName": "Psychiatry Clerkship MS3 (Moss)::Core Recall",
            }
        ],
    }
    membership.update(overrides)
    return membership


def make_release_record(**overrides) -> dict:
    release = {
        "releaseId": "release-alpha",
        "releaseDate": "2026-07-14",
        "releaseEpoch": 1783987200,
        "governedInputSha256": "d" * 64,
        "packages": {
            "psychiatry_clerkship_ms3_core.apkg": make_package_snapshot(),
            "psychiatry_clerkship_ms3_application.apkg": make_package_snapshot(
                active=0, scheduled=0
            ),
            "psychiatry_clerkship_ms3_complete.apkg": make_package_snapshot(),
            "psychiatry_clerkship_qbank.apkg": make_package_snapshot(
                active=0, scheduled=0
            ),
        },
        "csv": {
            "filename": "psychiatry_clerkship_ms3_cards.csv",
            "sha256": "e" * 64,
            "sizeBytes": 128,
        },
        "receiptContractSha256": "f" * 64,
        "migrationSeedReleaseId": "legacy-qbank-2026-07-12",
        "migrationContractSha256": "1" * 64,
        "memberships": [make_release_membership()],
    }
    release.update(overrides)
    return release


@pytest.fixture
def cards_schema() -> dict:
    return load_json(REGISTRY_DIR / "cards.schema.json")


@pytest.fixture
def qbank_reviews_schema() -> dict:
    return load_json(REGISTRY_DIR / "qbank_render_reviews.schema.json")


@pytest.fixture
def quarantine_schema() -> dict:
    return load_json(REGISTRY_DIR / "quarantine.schema.json")


@pytest.fixture
def history_schema() -> dict:
    return load_json(REGISTRY_DIR / "release_history.schema.json")


@pytest.fixture
def release_config() -> dict:
    return load_json(REGISTRY_DIR / "release_config.json")


@pytest.fixture
def release_config_schema() -> dict:
    return load_json(REGISTRY_DIR / "release_config.schema.json")


def assert_schema_valid(value: object, schema: dict) -> None:
    assert validation_errors(value, schema) == []


def assert_schema_invalid(value: object, schema: dict) -> None:
    assert validation_errors(value, schema)


def test_normalize_source_contract():
    assert normalize_source("Cafe\u0301\r\n  safety\tplan") == "Café safety plan"


def test_canonical_json_is_utf8_compact_and_sorted():
    assert canonical_json_bytes({"b": "café", "a": [2, 1]}) == (
        b'{"a":[2,1],"b":"caf\xc3\xa9"}'
    )


def test_canonical_json_is_order_independent_for_objects():
    assert canonical_json_sha256({"b": 2, "a": 1}) == canonical_json_sha256(
        {"a": 1, "b": 2}
    )


def test_canonical_json_preserves_array_order():
    assert canonical_json_sha256([1, 2]) != canonical_json_sha256([2, 1])


@pytest.mark.parametrize("non_finite", [float("nan"), float("inf"), float("-inf")])
def test_canonical_json_rejects_non_finite_numbers(non_finite):
    with pytest.raises(ValueError, match="Out of range float values"):
        canonical_json_bytes({"value": non_finite})


def test_registry_roots_are_initialized_and_validate():
    for name, expected_keys in ROOT_CONTRACTS.items():
        registry = load_json(REGISTRY_DIR / f"{name}.json")
        schema = load_json(REGISTRY_DIR / f"{name}.schema.json")
        Draft7Validator.check_schema(schema)
        assert set(registry) == expected_keys
        assert registry["schemaVersion"] == 1
        assert validation_errors(registry, schema) == []


def test_governance_registries_do_not_invent_decisions_and_history_is_bootstrapped():
    assert load_json(REGISTRY_DIR / "cards.json")["cards"] == []
    assert load_json(REGISTRY_DIR / "qbank_render_reviews.json")["reviews"] == []
    assert load_json(REGISTRY_DIR / "quarantine.json")["accepted"] == []
    history = load_json(REGISTRY_DIR / "release_history.json")
    assert len(history["identityEntries"]) == 168
    assert {entry["origin"] for entry in history["identityEntries"]} == {
        "legacy_pre_governance"
    }
    assert [release["releaseId"] for release in history["releases"]] == [
        "legacy-qbank-2026-07-12"
    ]


def test_every_governed_object_schema_is_closed():
    for name in ROOT_CONTRACTS:
        schema = load_json(REGISTRY_DIR / f"{name}.schema.json")
        governed_objects = list(object_schemas(schema))
        assert governed_objects
        assert all(obj.get("additionalProperties") is False for obj in governed_objects)


@pytest.mark.parametrize("bad_version", ["1", True])
def test_every_registry_requires_integer_schema_version_one(bad_version):
    for name in ROOT_CONTRACTS:
        registry = load_json(REGISTRY_DIR / f"{name}.json")
        schema = load_json(REGISTRY_DIR / f"{name}.schema.json")
        assert schema["properties"]["schemaVersion"]["type"] == "integer"
        registry["schemaVersion"] = bad_version
        assert_schema_invalid(registry, schema)


def test_draft_card_requires_factual_structure_but_not_human_approval(cards_schema):
    assert_schema_valid({"schemaVersion": 1, "cards": [make_core_card()]}, cards_schema)


@pytest.mark.parametrize(
    "field",
    [
        "id",
        "state",
        "kind",
        "family",
        "audience",
        "week",
        "domain",
        "task",
        "risk",
        "front",
        "answer",
        "explanation",
        "caveat",
        "source",
        "render",
        "provenance",
        "review",
        "reinforces",
        "supersedes",
    ],
)
def test_card_common_fields_are_required(cards_schema, field):
    card = make_core_card()
    del card[field]
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    ("path", "bad_value"),
    [
        (("state",), "pending"),
        (("kind",), "multiple_choice"),
        (("family",), "Unknown"),
        (("audience",), "Resident"),
        (("week",), 0),
        (("week",), 7),
        (("domain",), "Other"),
        (("task",), "Prescribe"),
        (("risk", "level"), "Low"),
        (("risk", "facets"), ["Other"]),
        (("provenance", "authoringMethod"), "generated"),
        (("review", "sequenceBasis"), "curriculum"),
    ],
)
def test_card_enumerations_are_closed(cards_schema, path, bad_value):
    card = make_core_card()
    target = card
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = bad_value
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_card_rejects_unrecognized_nested_fields(cards_schema):
    card = make_core_card()
    for field in ("risk", "source", "render", "provenance", "review"):
        mutated = deepcopy(card)
        mutated[field]["unexpected"] = True
        assert_schema_invalid({"schemaVersion": 1, "cards": [mutated]}, cards_schema)


@pytest.mark.parametrize(
    ("field", "word_count"),
    [("front", 36), ("answer", 46), ("explanation", 61)],
)
def test_core_word_limits_are_enforced(cards_schema, field, word_count):
    card = make_core_card()
    card[field] = " ".join(f"word{index}" for index in range(word_count))
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_explanation_is_limited_to_two_sentences(cards_schema):
    card = make_core_card()
    card["explanation"] = "First sentence. Second sentence. Third sentence."
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "front",
    [
        "In one line?",
        "High-yield pearl #2 (recall):",
        "Which statement is true?",
        "Which action is NOT appropriate?",
        "Which finding is least likely?",
        "All of the following are appropriate EXCEPT which one?",
    ],
)
def test_vague_ordinal_and_negative_lead_ins_are_rejected(cards_schema, front):
    card = make_core_card(front=front)
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize("field", ["front", "answer", "explanation", "caveat"])
@pytest.mark.parametrize(
    "raw_markdown",
    [
        "Use **bold Markdown** here.",
        "Use *italic Markdown* here.",
        "Use [linked Markdown](https://example.test) here.",
        "Use `inline code` here.",
        "## Raw heading",
    ],
)
def test_rendered_fields_reject_raw_markdown(cards_schema, field, raw_markdown):
    card = make_core_card()
    card[field] = raw_markdown
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "field", ["front", "answer", "explanation", "caveat", "qbank.primaryTrap"]
)
@pytest.mark.parametrize(
    "raw_markdown",
    [
        "Setext heading\n---",
        "Setext heading\n===",
        "- unordered item",
        "1. ordered item",
        "> blockquote",
        "Use ~~strikethrough~~ here.",
    ],
)
def test_every_learner_rendered_field_rejects_block_markdown(
    cards_schema, field, raw_markdown
):
    card = make_application_card() if field == "qbank.primaryTrap" else make_core_card()
    if field == "qbank.primaryTrap":
        card["qbank"]["primaryTrap"] = raw_markdown
    else:
        card[field] = raw_markdown
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    ("field", "safe_prose"),
    [
        ("front", "How does a -5 point change affect Condition Alpha?"),
        ("answer", "A -5 point change."),
        ("explanation", "A -5 point change preserves ordinary punctuation."),
        ("caveat", "Use supervised judgment for a -5 point change."),
        ("qbank.primaryTrap", "Confusing a -5 point change with no change."),
    ],
)
def test_markdown_filter_preserves_minus_signs_and_safe_prose(
    cards_schema, field, safe_prose
):
    card = make_application_card() if field == "qbank.primaryTrap" else make_core_card()
    if field == "qbank.primaryTrap":
        card["qbank"]["primaryTrap"] = safe_prose
    else:
        card[field] = safe_prose
    assert_schema_valid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_source_url_must_be_absolute_https(cards_schema):
    card = make_core_card()
    card["source"]["url"] = "/?page=safety-planning#immediate-escalation"
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_approved_high_risk_core_card_has_complete_named_reviews(cards_schema):
    assert_schema_valid(
        {"schemaVersion": 1, "cards": [make_approved_core_card()]}, cards_schema
    )


@pytest.mark.parametrize("empty_name", ["", " \t\n"])
@pytest.mark.parametrize(
    ("container", "field"),
    [
        ("provenance", "authoringTool"),
        ("provenance", "humanEditor"),
        ("review", "cardApprovedBy"),
        ("review", "evidenceCitation"),
        ("review", "evidenceRecord"),
        ("review", "evidenceReviewedBy"),
        ("review", "localPolicySource"),
        ("review", "localPolicyReviewedBy"),
        ("review", "sequenceRationale"),
        ("review", "sequenceReviewedBy"),
    ],
)
def test_card_governance_names_reject_empty_or_whitespace_only(
    cards_schema, container, field, empty_name
):
    card = make_fully_reviewed_core_card()
    card[container][field] = empty_name
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize("empty_name", ["", " \t\n"])
@pytest.mark.parametrize("field", ["primaryPage", "primaryAnchor"])
def test_application_qbank_source_names_reject_empty_or_whitespace_only(
    cards_schema, field, empty_name
):
    card = make_application_card()
    card["qbank"][field] = empty_name
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize("state", ["quarantined", "retired"])
def test_quarantined_and_retired_cards_remain_factual_tombstones(cards_schema, state):
    assert_schema_valid(
        {"schemaVersion": 1, "cards": [make_core_card(state=state)]}, cards_schema
    )


@pytest.mark.parametrize("field", ["humanEditor", "humanEditedAt"])
def test_approved_card_requires_named_human_editor(cards_schema, field):
    card = make_approved_core_card()
    del card["provenance"][field]
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "field", ["cardApprovedBy", "cardApprovedAt", "approvedCardSha256"]
)
def test_approved_card_requires_exact_render_approval(cards_schema, field):
    card = make_approved_core_card()
    del card["review"][field]
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "field",
    [
        "evidenceCitation",
        "evidenceRecord",
        "evidenceSha256",
        "evidenceReviewedBy",
        "evidenceReviewedAt",
        "reviewDue",
    ],
)
def test_approved_high_risk_card_requires_current_evidence_review(cards_schema, field):
    card = make_approved_core_card()
    del card["review"][field]
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_approved_routine_card_does_not_invent_evidence_review(cards_schema):
    card = make_approved_core_card(risk={"level": "Routine", "facets": []})
    for field in (
        "evidenceCitation",
        "evidenceRecord",
        "evidenceSha256",
        "evidenceReviewedBy",
        "evidenceReviewedAt",
        "reviewDue",
    ):
        card["review"].pop(field)
    assert_schema_valid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "field",
    [
        "localPolicySource",
        "localPolicySha256",
        "localPolicyReviewedBy",
        "localPolicyReviewedAt",
        "reviewDue",
    ],
)
def test_approved_local_policy_card_requires_named_policy_review(cards_schema, field):
    card = make_approved_core_card(
        risk={"level": "Routine", "facets": ["LocalPolicy"]}
    )
    for evidence_field in (
        "evidenceCitation",
        "evidenceRecord",
        "evidenceSha256",
        "evidenceReviewedBy",
        "evidenceReviewedAt",
    ):
        card["review"].pop(evidence_field)
    card["review"].update(
        {
            "localPolicySource": "Named policy, owner, version 2026-07-14",
            "localPolicySha256": "e" * 64,
            "localPolicyReviewedBy": "Named Policy Owner",
            "localPolicyReviewedAt": "2026-07-14",
        }
    )
    del card["review"][field]
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_approved_local_policy_card_accepts_complete_named_policy_review(cards_schema):
    card = make_approved_core_card(
        risk={"level": "Routine", "facets": ["LocalPolicy"]}
    )
    for evidence_field in (
        "evidenceCitation",
        "evidenceRecord",
        "evidenceSha256",
        "evidenceReviewedBy",
        "evidenceReviewedAt",
    ):
        card["review"].pop(evidence_field)
    card["review"].update(
        {
            "localPolicySource": "Named policy, owner, version 2026-07-14",
            "localPolicySha256": "e" * 64,
            "localPolicyReviewedBy": "Named Policy Owner",
            "localPolicyReviewedAt": "2026-07-14",
        }
    )
    assert_schema_valid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "field", ["sequenceRationale", "sequenceReviewedBy", "sequenceReviewedAt"]
)
def test_faculty_sequence_override_requires_named_review(cards_schema, field):
    card = make_core_card()
    card["review"] = {
        "sequenceBasis": "faculty_override",
        "sequenceRationale": "Reviewed sequencing rationale.",
        "sequenceReviewedBy": "Named Faculty Reviewer",
        "sequenceReviewedAt": "2026-07-14",
    }
    del card["review"][field]
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_faculty_sequence_override_accepts_complete_named_review(cards_schema):
    card = make_core_card()
    card["review"] = {
        "sequenceBasis": "faculty_override",
        "sequenceRationale": "Reviewed sequencing rationale.",
        "sequenceReviewedBy": "Named Faculty Reviewer",
        "sequenceReviewedAt": "2026-07-14",
    }
    assert_schema_valid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    ("kind", "family", "template_version"),
    [
        ("basic", "Discriminator", "pcl-ms3-core-basic-v2"),
        ("cloze", "Monitor", "pcl-ms3-core-cloze-v2"),
    ],
)
def test_core_kind_family_and_template_contract(
    cards_schema, kind, family, template_version
):
    front = "Which finding supports {{c1::Condition Alpha}}?" if kind == "cloze" else "Which finding supports Condition Alpha?"
    card = make_core_card(kind=kind, family=family, front=front)
    card["render"]["templateVersion"] = template_version
    assert_schema_valid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_core_family_cannot_be_application_family(cards_schema):
    card = make_core_card(family="ApplicationVignette")
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_core_template_version_matches_kind(cards_schema):
    card = make_core_card()
    card["render"]["templateVersion"] = "pcl-ms3-core-cloze-v2"
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "front",
    [
        "Which finding supports Condition Alpha?",
        "Which finding supports {{c1::Condition Alpha}} and {{c1::Condition Beta}}?",
        "Which finding supports {{c2::Condition Alpha}}?",
    ],
)
def test_cloze_has_exactly_one_scheduled_c1_deletion(cards_schema, front):
    card = make_core_card(kind="cloze", family="Monitor", front=front)
    card["render"]["templateVersion"] = "pcl-ms3-core-cloze-v2"
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_basic_card_forbids_cloze_markup(cards_schema):
    card = make_core_card(front="Which finding supports {{c1::Condition Alpha}}?")
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_application_card_requires_complete_qbank_contract(cards_schema):
    assert_schema_valid(
        {"schemaVersion": 1, "cards": [make_application_card()]}, cards_schema
    )


@pytest.mark.parametrize(
    "field",
    [
        "id",
        "taskBundle",
        "primaryPage",
        "primaryAnchor",
        "approvedItemSha256",
        "primaryTrap",
        "sourceAnchorSha256",
    ],
)
def test_application_requires_every_qbank_field(cards_schema, field):
    card = make_application_card()
    del card["qbank"][field]
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "task_bundle",
    [
        "Diagnosis",
        "NextStep",
        "Safety",
        "Pharmacology",
        "Psychosocial",
        "Disposition",
    ],
)
def test_application_task_bundle_enumeration(cards_schema, task_bundle):
    card = make_application_card()
    card["qbank"]["taskBundle"] = task_bundle
    assert_schema_valid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_application_rejects_unknown_task_bundle(cards_schema):
    card = make_application_card()
    card["qbank"]["taskBundle"] = "Other"
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_application_requires_non_null_reinforces(cards_schema):
    card = make_application_card(reinforces=None)
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_application_front_allows_at_most_ninety_words(cards_schema):
    card = make_application_card()
    card["front"] = " ".join(f"word{index}" for index in range(91))
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


@pytest.mark.parametrize(
    "front",
    [
        "A patient has Finding Alpha. A. Condition Alpha B. Condition Beta",
        "A patient has Finding Alpha. (A) Condition Alpha (B) Condition Beta",
    ],
)
def test_application_front_forbids_answer_choices(cards_schema, front):
    card = make_application_card(front=front)
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_application_kind_fixes_family_and_template(cards_schema):
    for field, value in (
        ("family", "Discriminator"),
        ("render", {"templateVersion": "pcl-ms3-core-basic-v2", "templateContractSha256": "b" * 64}),
    ):
        card = make_application_card()
        card[field] = value
        assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_core_forbids_qbank_fields(cards_schema):
    card = make_core_card()
    card["qbank"] = deepcopy(make_application_card()["qbank"])
    assert_schema_invalid({"schemaVersion": 1, "cards": [card]}, cards_schema)


def test_qbank_render_review_binds_exact_legacy_render(qbank_reviews_schema):
    assert_schema_valid(
        {"schemaVersion": 1, "reviews": [make_qbank_render_review()]},
        qbank_reviews_schema,
    )


def test_legacy_template_projection_matches_independent_fixture(
    legacy_qbank_path, tmp_path
):
    database_path = tmp_path / "legacy.anki2"
    with ZipFile(legacy_qbank_path) as package:
        database_path.write_bytes(package.read("collection.anki2"))
    with sqlite3.connect(database_path) as database:
        models = json.loads(database.execute("SELECT models FROM col").fetchone()[0])
    model = models[str(LEGACY_QBANK_MODEL_ID)]
    template = model["tmpls"][0]
    projection = make_legacy_template_contract()

    assert projection["qfmt"] == template["qfmt"]
    assert projection["afmt"] == template["afmt"]
    assert projection["css"] == model["css"]
    assert [field["id"] for field in projection["fields"]] == [None] * 9
    assert projection["templateId"] is None


@pytest.mark.parametrize("field", ["qfmt", "afmt", "css"])
def test_legacy_template_projection_rejects_byte_drift(
    qbank_reviews_schema, field
):
    review = make_qbank_render_review()
    review["legacyTemplateContract"][field] += " "
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


@pytest.mark.parametrize("empty_name", ["", " \t\n"])
@pytest.mark.parametrize(
    "field",
    [
        "primaryPage",
        "primaryAnchor",
        "evidenceCitation",
        "evidenceRecord",
        "evidenceReviewedBy",
        "localPolicySource",
        "localPolicyReviewedBy",
        "facultyApprovedBy",
    ],
)
def test_qbank_governance_names_reject_empty_or_whitespace_only(
    qbank_reviews_schema, field, empty_name
):
    review = make_qbank_render_review(
        risk={"level": "High", "facets": ["Medication", "LocalPolicy"]}
    )
    review.update(
        {
            "localPolicySource": "Named policy, owner, version 2026-07-14",
            "localPolicySha256": "a" * 64,
            "localPolicyReviewedBy": "Named Policy Owner",
            "localPolicyReviewedAt": "2026-07-14",
        }
    )
    review[field] = empty_name
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


@pytest.mark.parametrize(
    "field",
    [
        "qbankId",
        "identity",
        "primaryPage",
        "primaryAnchor",
        "approvedItemSha256",
        "sourceAnchorSha256",
        "templateVersion",
        "templateContractSha256",
        "renderedNoteSha256",
        "legacyTemplateContract",
        "risk",
        "facultyApprovedBy",
        "facultyApprovedAt",
    ],
)
def test_qbank_render_review_requires_governed_fields(qbank_reviews_schema, field):
    review = make_qbank_render_review()
    del review[field]
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


@pytest.mark.parametrize("identity", ["base", "tier2"])
def test_qbank_render_review_identity_is_base_or_tier2(
    qbank_reviews_schema, identity
):
    review = make_qbank_render_review(identity=identity)
    assert_schema_valid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


def test_qbank_render_review_rejects_unknown_identity(qbank_reviews_schema):
    review = make_qbank_render_review(identity="copy")
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


def test_legacy_template_projection_requires_null_field_ids(qbank_reviews_schema):
    review = make_qbank_render_review()
    review["legacyTemplateContract"]["fields"][0]["id"] = 123
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


def test_legacy_template_projection_requires_null_template_id(qbank_reviews_schema):
    review = make_qbank_render_review()
    review["legacyTemplateContract"]["templateId"] = 123
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


def test_legacy_template_projection_rejects_new_serialized_id_key(
    qbank_reviews_schema,
):
    review = make_qbank_render_review()
    review["legacyTemplateContract"]["fields"][0]["serializedId"] = 123
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


@pytest.mark.parametrize(
    "field",
    [
        "evidenceCitation",
        "evidenceRecord",
        "evidenceSha256",
        "evidenceReviewedBy",
        "evidenceReviewedAt",
        "reviewDue",
    ],
)
def test_high_risk_qbank_render_requires_evidence_review(
    qbank_reviews_schema, field
):
    review = make_qbank_render_review()
    del review[field]
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


def test_routine_qbank_render_does_not_invent_evidence_review(qbank_reviews_schema):
    review = make_qbank_render_review(risk={"level": "Routine", "facets": []})
    for field in (
        "evidenceCitation",
        "evidenceRecord",
        "evidenceSha256",
        "evidenceReviewedBy",
        "evidenceReviewedAt",
        "reviewDue",
    ):
        review.pop(field)
    assert_schema_valid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


@pytest.mark.parametrize(
    "field",
    [
        "localPolicySource",
        "localPolicySha256",
        "localPolicyReviewedBy",
        "localPolicyReviewedAt",
        "reviewDue",
    ],
)
def test_local_policy_qbank_render_requires_policy_review(
    qbank_reviews_schema, field
):
    review = make_qbank_render_review(
        risk={"level": "Routine", "facets": ["LocalPolicy"]}
    )
    for evidence_field in (
        "evidenceCitation",
        "evidenceRecord",
        "evidenceSha256",
        "evidenceReviewedBy",
        "evidenceReviewedAt",
    ):
        review.pop(evidence_field)
    review.update(
        {
            "localPolicySource": "Named policy, owner, version 2026-07-14",
            "localPolicySha256": "a" * 64,
            "localPolicyReviewedBy": "Named Policy Owner",
            "localPolicyReviewedAt": "2026-07-14",
        }
    )
    del review[field]
    assert_schema_invalid(
        {"schemaVersion": 1, "reviews": [review]}, qbank_reviews_schema
    )


def test_quarantine_acceptance_is_named_and_closed(quarantine_schema):
    assert_schema_valid(
        {"schemaVersion": 1, "accepted": [make_quarantine_decision()]},
        quarantine_schema,
    )


@pytest.mark.parametrize("empty_name", ["", " \t\n"])
@pytest.mark.parametrize("field", ["reviewOwner", "reviewedBy"])
def test_quarantine_owner_and_reviewer_reject_empty_or_whitespace_only(
    quarantine_schema, field, empty_name
):
    decision = make_quarantine_decision()
    decision[field] = empty_name
    assert_schema_invalid(
        {"schemaVersion": 1, "accepted": [decision]}, quarantine_schema
    )


@pytest.mark.parametrize(
    "field",
    [
        "namespace",
        "uid",
        "identity",
        "reasonCode",
        "subjectSha256",
        "sourcePath",
        "firstSeenCommit",
        "reviewOwner",
        "disposition",
        "reviewedBy",
        "reviewedAt",
    ],
)
def test_accepted_quarantine_requires_complete_decision(quarantine_schema, field):
    decision = make_quarantine_decision()
    del decision[field]
    assert_schema_invalid(
        {"schemaVersion": 1, "accepted": [decision]}, quarantine_schema
    )


@pytest.mark.parametrize(
    "field",
    ["affectedReleaseId", "withdrawalTemplateVersion", "approvedWithdrawalSha256"],
)
def test_withdrawal_decision_requires_exact_neutral_render_approval(
    quarantine_schema, field
):
    decision = make_quarantine_decision(
        disposition="withdraw",
        affectedReleaseId="legacy-qbank-2026-07-12",
        withdrawalTemplateVersion="pcl-qbank-withdrawal-v1",
        approvedWithdrawalSha256="9" * 64,
    )
    del decision[field]
    assert_schema_invalid(
        {"schemaVersion": 1, "accepted": [decision]}, quarantine_schema
    )


def test_qb_pha_002_is_detected_but_not_accepted():
    assert load_json(REGISTRY_DIR / "quarantine.json")["accepted"] == []


def test_release_history_separates_identity_contracts_from_membership(history_schema):
    history = {
        "schemaVersion": 1,
        "identityEntries": [make_identity_entry()],
        "releases": [make_release_record()],
    }
    assert_schema_valid(history, history_schema)


@pytest.mark.parametrize(
    "field",
    [
        "namespace",
        "uid",
        "identity",
        "guid",
        "kind",
        "model",
        "deck",
        "fields",
        "template",
        "firstShippedReleaseId",
        "origin",
    ],
)
def test_immutable_identity_contract_requires_every_field(history_schema, field):
    entry = make_identity_entry()
    del entry[field]
    history = {"schemaVersion": 1, "identityEntries": [entry], "releases": []}
    assert_schema_invalid(history, history_schema)


@pytest.mark.parametrize("origin", ["legacy_pre_governance", "governed"])
def test_identity_origin_is_closed(history_schema, origin):
    entry = make_identity_entry(origin=origin)
    history = {"schemaVersion": 1, "identityEntries": [entry], "releases": []}
    assert_schema_valid(history, history_schema)


def test_identity_contract_never_stores_mutable_approval_hash(history_schema):
    entry = make_identity_entry()
    entry["approvedCardSha256"] = "2" * 64
    history = {"schemaVersion": 1, "identityEntries": [entry], "releases": []}
    assert_schema_invalid(history, history_schema)


@pytest.mark.parametrize(
    "field",
    [
        "releaseId",
        "releaseDate",
        "releaseEpoch",
        "governedInputSha256",
        "packages",
        "csv",
        "receiptContractSha256",
        "migrationSeedReleaseId",
        "migrationContractSha256",
        "memberships",
    ],
)
def test_release_record_requires_canonical_outputs_and_migration(history_schema, field):
    release = make_release_record()
    del release[field]
    history = {"schemaVersion": 1, "identityEntries": [], "releases": [release]}
    assert_schema_invalid(history, history_schema)


def test_release_packages_are_exactly_the_four_governed_packages(history_schema):
    release = make_release_record()
    del release["packages"]["psychiatry_clerkship_qbank.apkg"]
    history = {"schemaVersion": 1, "identityEntries": [], "releases": [release]}
    assert_schema_invalid(history, history_schema)


def test_release_history_uses_content_fingerprint_not_archive_hash(history_schema):
    release = make_release_record()
    release["packages"]["psychiatry_clerkship_ms3_core.apkg"]["archiveSha256"] = (
        "3" * 64
    )
    history = {"schemaVersion": 1, "identityEntries": [], "releases": [release]}
    assert_schema_invalid(history, history_schema)


@pytest.mark.parametrize(
    "field",
    [
        "namespace",
        "uid",
        "identity",
        "status",
        "approvedCardSha256",
        "shippedCardSha256",
        "templateVersion",
        "artifacts",
    ],
)
def test_release_membership_requires_exact_render_and_artifacts(history_schema, field):
    membership = make_release_membership()
    del membership[field]
    release = make_release_record(memberships=[membership])
    history = {"schemaVersion": 1, "identityEntries": [], "releases": [release]}
    assert_schema_invalid(history, history_schema)


def test_legacy_pre_governance_active_membership_may_have_null_approval(history_schema):
    membership = make_release_membership(approvedCardSha256=None)
    release = make_release_record(memberships=[membership])
    history = {"schemaVersion": 1, "identityEntries": [], "releases": [release]}
    assert_schema_valid(history, history_schema)


def test_withdrawal_membership_requires_non_null_neutral_render_approval(
    history_schema,
):
    membership = make_release_membership(
        status="withdrawn", approvedCardSha256=None
    )
    release = make_release_record(memberships=[membership])
    history = {"schemaVersion": 1, "identityEntries": [], "releases": [release]}
    assert_schema_invalid(history, history_schema)


def test_release_config_contains_exact_crosswalks(release_config):
    assert release_config["coverage"]["core"] == CORE_COVERAGE
    assert release_config["coverage"]["application"] == APPLICATION_COVERAGE
    assert len(release_config["coverage"]["core"]) == 36
    assert len(release_config["coverage"]["application"]) == 36
    assert sum(release_config["coverage"]["core"].values()) == 144
    assert sum(release_config["coverage"]["application"].values()) == 48


def test_release_config_contains_exact_platform_contract(release_config):
    assert release_config["canonicalBaseUrl"] == (
        "https://une-ms3-psychiatry.netlify.app/"
    )
    assert release_config["minimumSupportedDesktopAnki"] == "23.10"
    assert release_config["currentTestedAnki"] == "26.5"
    assert release_config["templateVersions"] == {
        "coreBasic": "pcl-ms3-core-basic-v2",
        "coreCloze": "pcl-ms3-core-cloze-v2",
        "application": "pcl-ms3-application-v2",
        "legacyQbank": "pcl-qbank-legacy-v1",
    }
    assert release_config["productionAllowlist"] == [
        "psychiatry_clerkship_ms3_core.apkg",
        "psychiatry_clerkship_ms3_application.apkg",
        "psychiatry_clerkship_ms3_complete.apkg",
        "psychiatry_clerkship_qbank.apkg",
        "psychiatry_clerkship_ms3_cards.csv",
        "anki_release_receipt.json",
    ]


def test_release_config_contains_task1_permanent_identities(release_config):
    identities = release_config["permanentIdentities"]
    legacy = identities["legacyQbank"]
    assert (legacy["modelId"], legacy["modelName"]) == (
        LEGACY_QBANK_MODEL_ID,
        LEGACY_QBANK_MODEL_NAME,
    )
    assert (legacy["deckId"], legacy["deckName"]) == (
        LEGACY_QBANK_DECK_ID,
        LEGACY_QBANK_DECK_NAME,
    )
    assert legacy["fields"] == [
        {"name": name, "id": None} for name in LEGACY_QBANK_FIELDS
    ]
    assert (legacy["templateId"], legacy["templateName"], legacy["templateOrdinal"]) == (
        None,
        LEGACY_QBANK_TEMPLATE_NAME,
        LEGACY_QBANK_TEMPLATE_ORDINAL,
    )
    assert legacy["baseGuidFormula"] == "genanki.guid_for(item_id)"
    assert legacy["tier2GuidFormula"] == "genanki.guid_for(item_id + '::t2')"

    expected = {
        "coreBasic": (
            CORE_BASIC_MODEL_ID,
            CORE_BASIC_MODEL_NAME,
            CORE_BASIC_FIELDS,
            CORE_BASIC_TEMPLATE_ID,
            CORE_BASIC_TEMPLATE_NAME,
            CORE_BASIC_TEMPLATE_ORDINAL,
            CORE_GUID_NAMESPACE,
        ),
        "coreCloze": (
            CORE_CLOZE_MODEL_ID,
            CORE_CLOZE_MODEL_NAME,
            CORE_CLOZE_FIELDS,
            CORE_CLOZE_TEMPLATE_ID,
            CORE_CLOZE_TEMPLATE_NAME,
            CORE_CLOZE_TEMPLATE_ORDINAL,
            CORE_GUID_NAMESPACE,
        ),
        "application": (
            APPLICATION_MODEL_ID,
            APPLICATION_MODEL_NAME,
            APPLICATION_FIELDS,
            APPLICATION_TEMPLATE_ID,
            APPLICATION_TEMPLATE_NAME,
            APPLICATION_TEMPLATE_ORDINAL,
            APPLICATION_GUID_NAMESPACE,
        ),
    }
    for key, (
        model_id,
        model_name,
        fields,
        template_id,
        template_name,
        template_ordinal,
        namespace,
    ) in expected.items():
        identity = identities[key]
        assert (identity["modelId"], identity["modelName"]) == (
            model_id,
            model_name,
        )
        assert identity["fields"] == [
            {"name": name, "id": field_id} for name, field_id in fields
        ]
        assert (
            identity["templateId"],
            identity["templateName"],
            identity["templateOrdinal"],
        ) == (template_id, template_name, template_ordinal)
        assert identity["guidNamespace"] == namespace

    for key in ("coreBasic", "coreCloze"):
        assert (identities[key]["deckId"], identities[key]["deckName"]) == (
            CORE_DECK_ID,
            CORE_DECK_NAME,
        )
    assert (
        identities["application"]["deckId"],
        identities["application"]["deckName"],
    ) == (APPLICATION_DECK_ID, APPLICATION_DECK_NAME)


def test_maintenance_config_has_no_release_identity(release_config):
    assert release_config["siteMode"] == "maintenance"
    assert release_config["releaseId"] is None
    assert release_config["releaseDate"] is None
    assert release_config["releaseEpoch"] is None


def test_release_config_schema_requires_release_identity(
    release_config, release_config_schema
):
    candidate = {**release_config, "siteMode": "release"}
    assert schema_issue_codes(candidate, release_config_schema) == {
        "RELEASE_ID_REQUIRED",
        "RELEASE_DATE_REQUIRED",
        "RELEASE_EPOCH_REQUIRED",
    }


def test_release_config_detects_hold_without_accepting_it(release_config):
    assert release_config["knownSafetyHolds"] == [
        {
            "qbankUid": "qb_pha_002",
            "reasonCode": "QBANK_STALE_SAFETY_WORDING",
        }
    ]
    assert load_json(REGISTRY_DIR / "quarantine.json")["accepted"] == []


def test_duplicate_normalization_contract_is_exact(release_config):
    assert release_config["frontJaccardReviewThreshold"] == 0.80
    assert release_config["answerJaccardReviewThreshold"] == 0.80
    assert release_config["duplicateNormalization"] == {
        "unicodeNormalization": "NFKC",
        "caseFold": True,
        "removeHtml": True,
        "removeMarkdown": True,
        "removeNonAlphanumericPunctuation": True,
        "collapseWhitespace": True,
        "exactEqualityAction": "hard_duplicate",
        "jaccardAtOrAboveThresholdAction": "faculty_review_quarantine",
        "reinforcesWaiver": "exact_live_approved_target_only",
    }


def test_release_config_source_roles_are_exact(release_config):
    assert release_config["sequenceMapPath"] == (
        "14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/"
        "week_by_week_reading_map.md"
    )
    assert release_config["primaryAuthorityPathPrefixes"] == [
        "02_Clinical_Skills/",
        "03_Core_Topics/",
        "04_Acute_and_Safety/",
        "05_Psychopharmacology/",
        "06_Family_and_Relational/",
        "07_Evidence_and_Reading/",
        "14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/",
        "14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/",
        "14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/",
    ]
    assert release_config["contextOnlyPathPrefixes"] == [
        "14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/",
        "14_Tracks/MS3/Student_Ready_Pack/08_synthetic_cases/",
    ]
    assert release_config["sequencingOnlyPaths"] == [
        "14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md",
        "09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md",
        "14_Tracks/MS3/Student_Ready_Pack/core_reading_list.md",
        "14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md",
        "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md",
    ]


def test_release_config_schema_closes_exact_coverage_cells(
    release_config, release_config_schema
):
    candidate = deepcopy(release_config)
    candidate["coverage"]["core"]["W01|Other"] = 1
    assert_schema_invalid(candidate, release_config_schema)


def test_release_config_schema_freezes_permanent_identity_values(
    release_config, release_config_schema
):
    candidate = deepcopy(release_config)
    candidate["permanentIdentities"]["coreBasic"]["modelId"] += 1
    assert_schema_invalid(candidate, release_config_schema)


def test_release_config_schema_freezes_allowlist_and_safety_hold(
    release_config, release_config_schema
):
    allowlist_candidate = deepcopy(release_config)
    allowlist_candidate["productionAllowlist"].append("unexpected.apkg")
    assert_schema_invalid(allowlist_candidate, release_config_schema)

    hold_candidate = deepcopy(release_config)
    hold_candidate["knownSafetyHolds"].append(
        {"qbankUid": "qb_neutral_001", "reasonCode": "UNREVIEWED_HOLD"}
    )
    assert_schema_invalid(hold_candidate, release_config_schema)


def test_issue_contract_is_frozen():
    issue = Issue(
        code="SCHEMA_VALIDATION_ERROR",
        severity="hard",
        subject="$.cards[0]",
        message="invalid",
    )
    with pytest.raises(FrozenInstanceError):
        issue.code = "CHANGED"


def test_validate_registry_returns_structured_issues(tmp_path, release_config_schema):
    candidate = load_json(REGISTRY_DIR / "release_config.json")
    candidate["siteMode"] = "release"
    candidate_path = tmp_path / "release_config.json"
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
    schema_path = tmp_path / "release_config.schema.json"
    schema_path.write_text(json.dumps(release_config_schema), encoding="utf-8")

    issues = validate_registry(candidate_path, schema_path)

    assert {issue.code for issue in issues} == {
        "RELEASE_ID_REQUIRED",
        "RELEASE_DATE_REQUIRED",
        "RELEASE_EPOCH_REQUIRED",
    }
    assert all(issue.severity == "hard" for issue in issues)


def test_validate_registry_accepts_committed_empty_registries():
    for name in ("cards", "qbank_render_reviews", "quarantine", "release_history"):
        assert validate_registry(
            REGISTRY_DIR / f"{name}.json",
            REGISTRY_DIR / f"{name}.schema.json",
        ) == []


def test_anchor_vectors_cover_shared_cross_language_cases():
    vectors = load_json(Path(__file__).parent / "fixtures" / "anchor_vectors.json")
    assert {vector["style"] for vector in vectors} == {"atx", "setext"}
    assert {vector["expected"] for vector in vectors} >= {
        "safety-capacity-follow-up",
        "cafe-deja-vu",
        "medication-monitoring",
    }
    assert any("  " in vector["heading"] for vector in vectors)
