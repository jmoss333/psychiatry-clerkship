import json
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import subprocess

import pytest
from jsonschema import Draft7Validator

from pcl_anki.contract import canonical_json_sha256
from pcl_anki.review import (
    ReviewPatchError,
    apply_optimistic_registry_patch,
    build_review_html,
    validate_review_patch,
    validate_nonhistory_patch,
)
from pcl_anki.history import history_from_dict


def _history_proposal():
    package = {
        "contentFingerprintSha256": "4" * 64,
        "activeNoteCount": 0,
        "withdrawalNoteCount": 0,
        "totalNoteCount": 0,
        "scheduledCardCount": 0,
    }
    packages = {
        name: dict(package)
        for name in (
            "psychiatry_clerkship_ms3_core.apkg",
            "psychiatry_clerkship_ms3_application.apkg",
            "psychiatry_clerkship_ms3_complete.apkg",
            "psychiatry_clerkship_qbank.apkg",
        )
    }
    return {
        "schemaVersion": 1,
        "proposalType": "release_history",
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "historyAppend": {
            "newIdentityEntries": [],
            "releaseRecord": {
                "releaseId": "synthetic-release",
                "releaseDate": "2026-07-14",
                "releaseEpoch": 1784059200,
                "governedInputSha256": "b" * 64,
                "packages": packages,
                "csv": {
                    "filename": "psychiatry_clerkship_ms3_cards.csv",
                    "sha256": "5" * 64,
                    "sizeBytes": 1,
                },
                "receiptContractSha256": "6" * 64,
                "migrationSeedReleaseId": "legacy-qbank-2026-07-12",
                "migrationContractSha256": "7" * 64,
                "memberships": [],
            },
        },
        "context": {
            "candidateManifestSha256": "c" * 64,
            "inspectedFilesSha256": {
                "psychiatry_clerkship_ms3_core.apkg": "d" * 64,
                "psychiatry_clerkship_ms3_application.apkg": "d" * 64,
                "psychiatry_clerkship_ms3_complete.apkg": "d" * 64,
                "psychiatry_clerkship_qbank.apkg": "d" * 64,
                "psychiatry_clerkship_ms3_cards.csv": "d" * 64,
                "anki_release_receipt.json": "d" * 64,
            },
            "historyBaselineSha256": "e" * 64,
            "priorReleaseSeedSha256": "f" * 64,
            "migrationProofSha256": "1" * 64,
            "deterministicCsvSha256": "2" * 64,
            "receiptContractSha256": "3" * 64,
        },
    }


def test_history_clinic_embeds_complete_proposal_and_collects_named_review_only_on_export():
    proposal = _history_proposal()
    rendered = build_review_html(proposal)

    assert json.dumps(proposal, sort_keys=True, separators=(",", ":")) in rendered
    assert "Reviewer name" in rendered
    assert "Review date" in rendered
    assert "release_history.patch.json" in rendered
    assert "https://" not in rendered
    assert "COMPUTED_BY_CLINIC" not in rendered
    assert "crypto.subtle.digest" in rendered


def test_raw_history_proposal_is_not_a_review_patch():
    with pytest.raises(ReviewPatchError):
        validate_review_patch(_history_proposal())


def test_release_history_approval_requires_named_reviewer_and_iso_date():
    patch = {
        "schemaVersion": 1,
        "targetRegistry": "release_history",
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "sourceProposalSha256": "c" * 64,
        "historyAppend": _history_proposal()["historyAppend"],
        "decisions": [
            {
                "recordKey": "release:synthetic-release",
                "baseRecordSha256": None,
                "proposedRecord": _history_proposal()["historyAppend"],
                "decision": "accept",
                "reviewer": "",
                "reviewedAt": "2026-07-14",
            }
        ],
    }
    with pytest.raises(ReviewPatchError, match="reviewer"):
        validate_review_patch(patch)

    patch["decisions"][0]["reviewer"] = "Synthetic Test Reviewer"
    patch["decisions"][0]["reviewedAt"] = "not-a-date"
    with pytest.raises(ReviewPatchError, match="date"):
        validate_review_patch(patch)


def test_review_patch_rejects_duplicate_decisions():
    proposal = _history_proposal()
    decision = {
        "recordKey": "release:synthetic-release",
        "baseRecordSha256": None,
        "proposedRecord": proposal["historyAppend"],
        "decision": "accept",
        "reviewer": "Synthetic Test Reviewer",
        "reviewedAt": "2026-07-14",
    }
    patch = {
        "schemaVersion": 1,
        "targetRegistry": "release_history",
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "sourceProposalSha256": "c" * 64,
        "historyAppend": proposal["historyAppend"],
        "decisions": [decision, dict(decision)],
    }
    with pytest.raises(ReviewPatchError, match="duplicate"):
        validate_review_patch(patch)


def test_review_schemas_are_closed():
    repo_root = Path(__file__).resolve().parents[2]
    automation = repo_root / "13_Faculty_Resources" / "_automation" / "anki"
    proposal_schema = json.loads(
        (automation / "history_proposal.schema.json").read_text(encoding="utf-8")
    )
    patch_schema = json.loads(
        (automation / "review_patch.schema.json").read_text(encoding="utf-8")
    )

    from pcl_anki.review import validate_history_proposal

    validate_history_proposal(_history_proposal())
    assert proposal_schema["additionalProperties"] is False
    assert patch_schema["additionalProperties"] is False


def test_optimistic_patch_rejects_stale_input_and_applies_atomically(
    passing_release_factory, tmp_path
):
    bundle = passing_release_factory()
    record = deepcopy(bundle.quarantine)
    registry = tmp_path / "quarantine.json"
    registry.write_text(
        json.dumps({"schemaVersion": 1, "accepted": []}, indent=2) + "\n",
        encoding="utf-8",
    )
    head = "a" * 40
    input_sha = "b" * 64
    key = ":".join(
        str(record[name])
        for name in ("namespace", "uid", "identity", "reasonCode", "subjectSha256")
    )
    patch = {
        "schemaVersion": 1,
        "targetRegistry": "quarantine",
        "generatedFromCommit": head,
        "inputSha256": input_sha,
        "decisions": [
            {
                "recordKey": key,
                "baseRecordSha256": None,
                "proposedRecord": record,
                "decision": "accept",
                "reviewer": "Synthetic Test Reviewer",
                "reviewedAt": "2026-07-14",
            }
        ],
    }
    before = registry.read_bytes()

    with pytest.raises(ReviewPatchError, match="stale input"):
        apply_optimistic_registry_patch(
            registry,
            patch,
            current_head=head,
            current_input_sha256="c" * 64,
        )
    assert registry.read_bytes() == before

    changed = apply_optimistic_registry_patch(
        registry,
        patch,
        current_head=head,
        current_input_sha256=input_sha,
    )
    assert changed == (key,)
    assert json.loads(registry.read_text())["accepted"] == [record]


def test_optimistic_patch_rejects_stale_base_and_identity_change_without_write(
    passing_release_factory, tmp_path
):
    bundle = passing_release_factory()
    record = deepcopy(bundle.quarantine)
    registry = tmp_path / "quarantine.json"
    registry.write_text(
        json.dumps({"schemaVersion": 1, "accepted": [record]}, indent=2) + "\n",
        encoding="utf-8",
    )
    key = ":".join(
        str(record[name])
        for name in ("namespace", "uid", "identity", "reasonCode", "subjectSha256")
    )
    patch = {
        "schemaVersion": 1,
        "targetRegistry": "quarantine",
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "decisions": [
            {
                "recordKey": key,
                "baseRecordSha256": "0" * 64,
                "proposedRecord": {**record, "uid": "changed_identity"},
                "decision": "edit",
                "reviewer": "Synthetic Test Reviewer",
                "reviewedAt": "2026-07-14",
            }
        ],
    }
    before = registry.read_bytes()
    with pytest.raises(ReviewPatchError, match="base record|identity"):
        apply_optimistic_registry_patch(
            registry,
            patch,
            current_head="a" * 40,
            current_input_sha256="b" * 64,
        )
    assert registry.read_bytes() == before


def test_authoring_clinic_renders_exact_note_context_and_exports_quarantine_patch():
    finding = {
        "namespace": "qbank",
        "uid": "qb_pha_002",
        "identity": "base",
        "reasonCode": "QBANK_STALE_SAFETY_WORDING",
        "subjectSha256": "1" * 64,
        "sourcePath": "question_bank.json",
        "firstSeenCommit": "abcdef1",
        "withdrawalRenderSha256": "2" * 64,
    }
    candidate = {
        "schemaVersion": 1,
        "reportType": "anki_review_candidate",
        "generatedFromCommit": "a" * 40,
        "governedInputSha256": "b" * 64,
        "draftAndCurrentPreviews": [
            {
                "namespace": "qbank",
                "uid": "qb_pha_002",
                "identity": "base",
                "frontHtml": "<b>Exact front</b>",
                "backHtml": "<i>Exact back</i>",
                "renderSha256": "1" * 64,
                "templateContractSha256": "2" * 64,
                "source": {"quote": "Exact quote", "url": "https://example.invalid"},
                "qbank": {"stem": "Synthetic stem", "trap": "Synthetic trap"},
                "risk": {"level": "High", "facets": ["Medication"]},
                "review": {"approvedCardSha256": "3" * 64},
                "priorApprovedRenderSha256": "3" * 64,
            }
        ],
        "issues": [],
        "qbankItems": [{"id": "qb_pha_002", "stem": "Synthetic stem"}],
        "evidenceRecords": {"sources": []},
        "policyRecords": {},
        "quarantine": {"new": [finding], "changed": [], "accepted": [], "resolved": []},
        "quarantineBaseRecordSha256": {},
        "withdrawalPreviews": [
            {
                "namespace": "qbank",
                "uid": "qb_pha_002",
                "identity": "base",
                "reasonCode": "QBANK_STALE_SAFETY_WORDING",
                "affectedReleaseId": "legacy-qbank-2026-07-12",
                "withdrawalTemplateVersion": "pcl-neutral-withdrawal-v1",
                "approvedWithdrawalSha256": "4" * 64,
                "frontHtml": "<strong>Neutral front</strong>",
                "backHtml": "<strong>Neutral back</strong>",
            }
        ],
    }

    rendered = build_review_html(candidate)

    assert "<b>Exact front</b>" in rendered
    assert "<i>Exact back</i>" in rendered
    assert "Neutral front" in rendered and "Neutral back" in rendered
    assert "Exact quote" in rendered and "Synthetic trap" in rendered
    assert "targetRegistry:'quarantine'" in rendered
    assert "quarantine.review.patch.json" in rendered
    assert "historyAppend" not in rendered


def test_quarantine_live_recomputation_rejects_forged_finding(
    passing_release_factory,
):
    bundle = passing_release_factory()
    record = deepcopy(bundle.quarantine)
    key = ":".join(
        str(record[name])
        for name in ("namespace", "uid", "identity", "reasonCode", "subjectSha256")
    )
    patch = {
        "schemaVersion": 1,
        "targetRegistry": "quarantine",
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "decisions": [
            {
                "recordKey": key,
                "baseRecordSha256": None,
                "proposedRecord": record,
                "decision": "accept",
                "reviewer": record["reviewedBy"],
                "reviewedAt": record["reviewedAt"],
            }
        ],
    }
    validate_review_patch(patch)
    from types import SimpleNamespace

    unreviewed_inputs = SimpleNamespace(**{**vars(bundle.inputs), "quarantine": ()})
    validate_nonhistory_patch(
        unreviewed_inputs, history_from_dict(bundle.inputs.release_history), patch
    )

    with pytest.raises(ReviewPatchError, match="live exact finding"):
        validate_nonhistory_patch(
            bundle.inputs, history_from_dict(bundle.inputs.release_history), patch
        )

    forged = deepcopy(patch)
    forged_record = forged["decisions"][0]["proposedRecord"]
    forged_record["subjectSha256"] = "0" * 64
    forged["decisions"][0]["recordKey"] = ":".join(
        str(forged_record[name])
        for name in ("namespace", "uid", "identity", "reasonCode", "subjectSha256")
    )
    with pytest.raises(ReviewPatchError, match="live exact finding"):
        validate_nonhistory_patch(
            unreviewed_inputs, history_from_dict(bundle.inputs.release_history), forged
        )


@pytest.mark.parametrize("target", ("cards", "qbank_render_reviews"))
def test_nonhistory_patch_recomputes_card_and_qbank_approval_hashes(
    passing_release_factory, target
):
    bundle = passing_release_factory()
    if target == "cards":
        proposed = deepcopy(bundle.core_cards[0])
        proposed["review"]["approvedCardSha256"] = "0" * 64
        reviewer = proposed["review"]["cardApprovedBy"]
        reviewed_at = proposed["review"]["cardApprovedAt"]
        record_key = proposed["id"]
    else:
        proposed = deepcopy(bundle.qbank_review)
        proposed["renderedNoteSha256"] = "0" * 64
        reviewer = proposed["facultyApprovedBy"]
        reviewed_at = proposed["facultyApprovedAt"]
        record_key = f"{proposed['qbankId']}:{proposed['identity']}"
    patch = {
        "schemaVersion": 1,
        "targetRegistry": target,
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "decisions": [
            {
                "recordKey": record_key,
                "baseRecordSha256": None,
                "proposedRecord": proposed,
                "decision": "accept",
                "reviewer": reviewer,
                "reviewedAt": reviewed_at,
            }
        ],
    }

    with pytest.raises(ReviewPatchError, match="recomputation failed"):
        validate_nonhistory_patch(
            bundle.inputs, history_from_dict(bundle.inputs.release_history), patch
        )
