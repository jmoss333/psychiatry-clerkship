from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from pcl_anki.contract import canonical_json_sha256
from pcl_anki.qbank import (
    QB_HASH_FIELDS,
    eligible_qbank_items,
    qbank_item_payload,
    qbank_item_sha256,
    resolve_primary_qbank_source,
    validate_application_qbank,
    validate_qbank_item,
    validate_question_bank,
)
from pcl_anki.sources import SourceResolutionError, load_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
QBANK_PATH = REPO_ROOT / "question_bank.json"
QBANK_SCHEMA_PATH = REPO_ROOT / "question_bank.schema.json"
MANIFEST_PATH = (
    REPO_ROOT
    / "13_Faculty_Resources"
    / "_automation"
    / "site_build"
    / "site_manifest.json"
)
RELEASE_CONFIG_PATH = (
    REPO_ROOT / "13_Faculty_Resources" / "anki" / "release_config.json"
)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def qbank() -> dict:
    return load_json(QBANK_PATH)


@pytest.fixture
def qbank_schema() -> dict:
    return load_json(QBANK_SCHEMA_PATH)


@pytest.fixture
def manifest():
    return load_manifest(MANIFEST_PATH)


@pytest.fixture
def valid_item(qbank: dict) -> dict:
    return deepcopy(next(item for item in qbank["items"] if item["id"] == "qb_psy_002"))


def issue_codes(issues) -> set[str]:
    return {issue.code for issue in issues}


def test_qbank_hash_projection_is_exact_ordered_and_includes_null_sentinels(valid_item):
    assert QB_HASH_FIELDS == (
        "id",
        "status",
        "retired",
        "stem",
        "options",
        "why",
        "pearl",
        "evidence",
        "pages",
        "link",
        "tier2",
        "category",
        "difficulty",
        "competency",
        "type",
        "hy",
    )

    payload = qbank_item_payload(valid_item)

    assert tuple(payload) == QB_HASH_FIELDS
    assert payload["retired"] is None
    assert payload["tier2"] is None
    assert payload["hy"] is None
    assert qbank_item_sha256(valid_item) == canonical_json_sha256(payload)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda item: item["options"][0].__setitem__("t", "Changed visible option"),
        lambda item: item["options"][1]["trap"].__setitem__("name", "Changed trap"),
        lambda item: item.__setitem__("status", "draft"),
        lambda item: item.__setitem__("retired", True),
        lambda item: item["pages"].reverse(),
        lambda item: item["competency"].reverse(),
    ],
)
def test_every_governed_projection_mutation_changes_item_hash(valid_item, mutate):
    before = qbank_item_sha256(valid_item)
    mutate(valid_item)
    assert qbank_item_sha256(valid_item) != before


@pytest.mark.parametrize(
    ("mutate", "expected_code"),
    [
        (lambda item: item["options"][1].__setitem__("key", "A"), "QBANK_OPTION_KEYS"),
        (lambda item: item["options"].pop(), "QBANK_OPTION_KEYS"),
        (
            lambda item: [option.pop("c", None) for option in item["options"]],
            "QBANK_CORRECT_COUNT",
        ),
        (
            lambda item: item["options"][1].__setitem__("c", True),
            "QBANK_CORRECT_COUNT",
        ),
        (
            lambda item: item["options"][1].pop("trap"),
            "QBANK_WRONG_OPTION_TRAP",
        ),
        (
            lambda item: next(option for option in item["options"] if option.get("c")).__setitem__(
                "trap", {"name": "Wrong", "note": "Wrong"}
            ),
            "QBANK_CORRECT_OPTION_TRAP",
        ),
        (
            lambda item: item.update(retired=True, retiredReason="Retired for test"),
            "QBANK_RETIRED_STATUS",
        ),
        (
            lambda item: item.update(status="draft", retired=True),
            "QBANK_RETIRED_REASON",
        ),
        (lambda item: item.__setitem__("type", "two-tier"), "QBANK_TIER2_REQUIRED"),
        (
            lambda item: item.__setitem__(
                "tier2",
                {
                    "q": "Why?",
                    "options": [
                        {"key": "A", "t": "Because A", "c": True},
                        {"key": "B", "t": "Because B"},
                        {"key": "C", "t": "Because C"},
                    ],
                    "why": "Because A.",
                },
            ),
            "QBANK_TIER2_FORBIDDEN",
        ),
        (
            lambda item: item["pages"].append(item["pages"][0]),
            "QBANK_DUPLICATE_PAGE",
        ),
        (
            lambda item: item["pages"].__setitem__(0, "not-in-manifest.md"),
            "QBANK_PAGE_NOT_IN_MANIFEST",
        ),
    ],
)
def test_qbank_cross_field_rules_are_hard_and_note_specific(
    valid_item, qbank_schema, manifest, mutate, expected_code
):
    mutate(valid_item)

    issues = validate_qbank_item(valid_item, qbank_schema, manifest)

    assert expected_code in issue_codes(issues)
    assert all(issue.severity == "hard" for issue in issues)
    assert all(valid_item["id"] in issue.subject for issue in issues)


def test_option_array_order_is_hash_significant_but_keys_remain_structurally_valid(
    valid_item, qbank_schema, manifest
):
    before = qbank_item_sha256(valid_item)
    valid_item["options"].reverse()

    assert qbank_item_sha256(valid_item) != before
    assert "QBANK_OPTION_KEYS" not in issue_codes(
        validate_qbank_item(valid_item, qbank_schema, manifest)
    )


@pytest.fixture
def two_tier_item(qbank: dict) -> dict:
    return deepcopy(next(item for item in qbank["items"] if item["id"] == "qb_pha_011"))


@pytest.mark.parametrize(
    ("mutate", "expected_code"),
    [
        (
            lambda item: item["tier2"]["options"][1].__setitem__("key", "A"),
            "QBANK_TIER2_OPTION_KEYS",
        ),
        (
            lambda item: item["tier2"]["options"].pop(1),
            "QBANK_TIER2_OPTION_KEYS",
        ),
        (
            lambda item: [option.pop("c", None) for option in item["tier2"]["options"]],
            "QBANK_TIER2_CORRECT_COUNT",
        ),
        (
            lambda item: item["tier2"]["options"][0].__setitem__("c", True),
            "QBANK_TIER2_CORRECT_COUNT",
        ),
    ],
)
def test_tier2_requires_contiguous_unique_keys_and_one_correct_answer(
    two_tier_item, qbank_schema, manifest, mutate, expected_code
):
    mutate(two_tier_item)
    assert expected_code in issue_codes(
        validate_qbank_item(two_tier_item, qbank_schema, manifest)
    )


def test_root_validation_rejects_duplicate_item_ids(qbank, qbank_schema, manifest):
    duplicate = deepcopy(qbank)
    duplicate["items"][1]["id"] = duplicate["items"][0]["id"]

    assert "QBANK_DUPLICATE_ITEM_ID" in issue_codes(
        validate_question_bank(duplicate, qbank_schema, manifest)
    )


def test_current_qbank_is_structurally_valid_and_counts_come_from_items(
    qbank, qbank_schema, manifest
):
    assert validate_question_bank(qbank, qbank_schema, manifest) == []
    eligible = eligible_qbank_items(qbank, qbank_schema, manifest)

    assert len(qbank["items"]) == 192
    assert len(eligible) == 143
    assert sum(item["status"] == "draft" for item in qbank["items"]) == 49
    assert sum(item.get("retired") is True for item in qbank["items"]) == 3
    assert sum("tier2" in item for item in eligible) == 25
    assert len(eligible) + sum("tier2" in item for item in eligible) == 168

    stale_note = deepcopy(qbank)
    stale_note["_note"] = "There are zero eligible items."
    assert len(eligible_qbank_items(stale_note, qbank_schema, manifest)) == 143
    assert "143 active attested items" in qbank["_note"]
    assert "49 draft records" in qbank["_note"]
    assert "3 retired items" in qbank["_note"]
    assert "status" in qbank["_note"] and "retired" in qbank["_note"]


def test_only_configured_current_qbank_safety_hold_is_detected(qbank):
    config = load_json(RELEASE_CONFIG_PATH)
    current_ids = {item["id"] for item in qbank["items"]}
    detected = {
        hold["qbankUid"]: hold["reasonCode"]
        for hold in config["knownSafetyHolds"]
        if hold["qbankUid"] in current_ids
    }

    assert detected == {"qb_pha_002": "QBANK_STALE_SAFETY_WORDING"}
    assert "qb_pha_011" not in detected


@pytest.fixture
def qbank_source_repo(tmp_path: Path):
    source_path = "03_Core_Topics/Condition_Alpha.md"
    slug = "condition-alpha.md"
    anchor = "decisive-answer"
    quote = "Finding Alpha supports the decisive answer."
    source_file = tmp_path / source_path
    source_file.parent.mkdir(parents=True)
    source_file.write_text(
        "# Condition Alpha\n\n## Decisive answer\n\n"
        + quote
        + "\n\n### Detail\n\nSecondary detail.\n",
        encoding="utf-8",
    )
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        json.dumps({"md": [[source_path, slug, "Condition Alpha"]]}),
        encoding="utf-8",
    )
    config_path = tmp_path / "13_Faculty_Resources" / "anki" / "release_config.json"
    config_path.parent.mkdir(parents=True)
    config_path.write_text(
        json.dumps(
            {
                "canonicalBaseUrl": "https://une-ms3-psychiatry.netlify.app/",
                "sequenceMapPath": "week.md",
                "primaryAuthorityPathPrefixes": ["03_Core_Topics/"],
                "contextOnlyPathPrefixes": [],
                "sequencingOnlyPaths": [],
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "week.md").write_text(
        "# Sequence\n\n## Week 1\n\n- [Alpha](?page=condition-alpha.md)\n",
        encoding="utf-8",
    )
    inputs = SimpleNamespace(
        repo_root=tmp_path,
        manifest=load_manifest(manifest_path),
        reviewed={
            slug: {"status": "reviewed", "at": "2026-07-14", "by": "Reviewer"}
        },
        surveillance={"slugs": []},
    )
    item = {
        "id": "qb_neutral_001",
        "pages": [slug],
        "evidence": f"{slug} 'Decisive answer' — {quote}",
        "options": [
            {"key": "A", "t": "Correct", "c": True},
            {"key": "B", "t": "Wrong", "trap": {"name": "Alpha trap", "note": "No."}},
            {"key": "C", "t": "Wrong", "trap": {"name": "Beta trap", "note": "No."}},
            {"key": "D", "t": "Wrong", "trap": {"name": "Gamma trap", "note": "No."}},
        ],
    }
    return inputs, item, source_file, slug, anchor


def test_primary_qbank_source_uses_exact_reviewed_full_section(qbank_source_repo):
    inputs, item, _source_file, slug, anchor = qbank_source_repo

    resolved = resolve_primary_qbank_source(item, slug, anchor, inputs)

    assert resolved.slug == slug
    assert resolved.anchor == anchor
    assert resolved.quote == "Finding Alpha supports the decisive answer."
    assert resolved.section_sha256 == sha256(
        (
            "## Decisive answer Finding Alpha supports the decisive answer. "
            "### Detail Secondary detail."
        ).encode("utf-8")
    ).hexdigest()


@pytest.mark.parametrize(
    ("page", "anchor", "expected_code"),
    [
        ("other.md", "decisive-answer", "QBANK_PRIMARY_PAGE_MISSING"),
        ("condition-alpha.md", "other-anchor", "SOURCE_ANCHOR_MISSING"),
    ],
)
def test_primary_qbank_source_rejects_page_or_anchor_drift(
    qbank_source_repo, page, anchor, expected_code
):
    inputs, item, _source_file, _slug, _anchor = qbank_source_repo
    with pytest.raises(SourceResolutionError) as raised:
        resolve_primary_qbank_source(item, page, anchor, inputs)
    assert raised.value.code == expected_code


def test_application_qbank_reconciliation_binds_page_slug_anchor_trap_and_section(
    qbank_source_repo,
):
    inputs, item, _source_file, slug, anchor = qbank_source_repo
    resolved = resolve_primary_qbank_source(item, slug, anchor, inputs)
    card = {
        "id": "ms3_w01_application_001",
        "source": {"slug": slug, "anchor": anchor},
        "qbank": {
            "id": item["id"],
            "primaryPage": slug,
            "primaryAnchor": anchor,
            "approvedItemSha256": qbank_item_sha256(item),
            "primaryTrap": "Alpha trap",
            "sourceAnchorSha256": resolved.section_sha256,
        },
    }
    assert validate_application_qbank(card, item, resolved) == []

    mutations = (
        ("id", "qb_other_001", "QBANK_ID_MISMATCH"),
        ("primaryPage", "other.md", "QBANK_PRIMARY_PAGE_MISSING"),
        ("source.slug", "other.md", "QBANK_SOURCE_SLUG_MISMATCH"),
        ("primaryAnchor", "other-anchor", "QBANK_SOURCE_ANCHOR_MISMATCH"),
        ("approvedItemSha256", "0" * 64, "QBANK_APPROVED_ITEM_DRIFT"),
        ("primaryTrap", "Not a named wrong option", "QBANK_PRIMARY_TRAP_MISMATCH"),
        ("sourceAnchorSha256", "0" * 64, "QBANK_SOURCE_ANCHOR_DRIFT"),
    )
    for field, value, expected_code in mutations:
        changed = deepcopy(card)
        if field.startswith("source."):
            changed["source"][field.split(".", 1)[1]] = value
        else:
            changed["qbank"][field] = value
        assert expected_code in issue_codes(
            validate_application_qbank(changed, item, resolved)
        )
