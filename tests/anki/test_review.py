import json
import base64
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import subprocess
import re
import shutil
from types import SimpleNamespace
import build_release as build_release_cli
import apply_review_patch as apply_review_patch_cli

import pytest
from jsonschema import Draft7Validator

from pcl_anki.contract import canonical_json_sha256
from pcl_anki.review import (
    ReviewPatchError,
    apply_optimistic_registry_patch,
    build_review_html,
    validate_review_patch,
    validate_nonhistory_patch,
    apply_review_patch,
)
from pcl_anki.history import history_from_dict
from pcl_anki.release import _draft_previews, ReleaseOrchestrationError
from pcl_anki.sources import load_manifest
from pcl_anki.render import TEMPLATE_CONTRACTS


def _complete_preview(**changes):
    preview = {
        "namespace": "qbank",
        "uid": "qb_synthetic_001",
        "identity": "base",
        "guid": "synthetic-guid",
        "deckId": 1,
        "modelId": 2,
        "templateOrdinal": 0,
        "fields": ["front", "back"],
        "tags": ["PsychClerkship"],
        "frontHtml": "front",
        "backHtml": "back",
        "templateContractSha256": "1" * 64,
        "renderSha256": "2" * 64,
        "active": False,
        "withdrawn": False,
        "state": "draft",
        "source": {"quote": "Synthetic quote", "url": "https://example.invalid"},
        "risk": None,
        "review": None,
        "qbank": None,
        "priorApprovedRenderSha256": None,
        "priorApprovedFrontHtml": None,
        "priorApprovedBackHtml": None,
        "priorRenderStatus": "never_approved",
        "targetRegistry": "qbank_render_reviews",
        "recordKey": "qb_synthetic_001:base",
        "baseRecordSha256": None,
        "canonicalRecord": None,
        "proposedRecordTemplate": {
            "qbankId": "qb_synthetic_001",
            "identity": "base",
            "primaryPage": "synthetic.md",
            "approvedItemSha256": "3" * 64,
            "templateVersion": "pcl-qbank-legacy-v1",
            "templateContractSha256": "1" * 64,
            "renderedNoteSha256": "2" * 64,
            "legacyTemplateContract": deepcopy(TEMPLATE_CONTRACTS["legacyQbank"]),
        },
    }
    preview.update(changes)
    return preview


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

    encoded = re.search(
        r'<script id="proposal" type="application/json" data-encoding="base64">([^<]+)</script>',
        rendered,
    )
    assert encoded is not None
    assert base64.b64decode(encoded.group(1)) == json.dumps(
        proposal, sort_keys=True, separators=(",", ":")
    ).encode()
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


def test_history_proposal_and_review_patch_reject_unknown_nested_fields():
    from pcl_anki.review import validate_history_proposal

    proposal = _history_proposal()
    invalid_proposal = deepcopy(proposal)
    invalid_proposal["context"]["unexpected"] = True
    with pytest.raises(ReviewPatchError, match="context"):
        validate_history_proposal(invalid_proposal)

    invalid_proposal = deepcopy(proposal)
    invalid_proposal["historyAppend"]["releaseRecord"]["unexpected"] = True
    with pytest.raises(ReviewPatchError, match="releaseRecord"):
        validate_history_proposal(invalid_proposal)

    patch = {
        "schemaVersion": 1,
        "targetRegistry": "release_history",
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "sourceProposalSha256": "c" * 64,
        "historyAppend": proposal["historyAppend"],
        "decisions": [
            {
                "recordKey": "release:synthetic-release",
                "baseRecordSha256": None,
                "proposedRecord": proposal["historyAppend"],
                "decision": "accept",
                "reviewer": "Synthetic Test Reviewer",
                "reviewedAt": "2026-07-14",
            }
        ],
    }
    invalid_patch = deepcopy(patch)
    invalid_patch["decisions"][0]["unexpected"] = True
    with pytest.raises(ReviewPatchError, match="decisions"):
        validate_review_patch(invalid_patch)

    invalid_patch = deepcopy(patch)
    invalid_patch["decisions"][0]["proposedRecord"]["releaseRecord"][
        "unexpected"
    ] = True
    with pytest.raises(ReviewPatchError, match="proposedRecord"):
        validate_review_patch(invalid_patch)


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
            _complete_preview(
                uid="qb_pha_002",
                recordKey="qb_pha_002:base",
                frontHtml="<b>Exact front</b>",
                backHtml="<i>Exact back</i>",
                renderSha256="1" * 64,
                templateContractSha256="2" * 64,
                source={"quote": "Exact quote", "url": "https://example.invalid"},
                qbank={
                    "stem": "Synthetic stem",
                    "answer": None,
                    "traps": [{"name": "Synthetic trap", "note": "Better reasoning"}],
                    "itemSha256": "5" * 64,
                },
                risk={"level": "High", "facets": ["Medication"]},
                priorApprovedRenderSha256="3" * 64,
                priorRenderStatus="blocking_prior_evidence_gap",
            )
        ],
        "issues": [],
        "qbankItems": [],
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
                "templateContractSha256": "5" * 64,
                "fields": ["Neutral front", "Neutral back"],
                "frontHtml": "<strong>Neutral front</strong>",
                "backHtml": "<strong>Neutral back</strong>",
            }
        ],
    }

    rendered = build_review_html(candidate)

    assert "&lt;b&gt;Exact front&lt;/b&gt;" in rendered
    assert "&lt;i&gt;Exact back&lt;/i&gt;" in rendered
    assert "Neutral front" in rendered and "Neutral back" in rendered
    assert "Exact quote" in rendered and "Synthetic trap" in rendered
    assert "targetRegistry:'quarantine'" in rendered
    assert "quarantine.review.patch.json" in rendered
    assert "historyAppend" not in rendered


def test_candidate_payload_is_base64_safe_and_round_trips_exact_canonical_bytes():
    injected = "</script><script>window.PCL_INJECTED=1</script>&<>雪"
    candidate = {
        "schemaVersion": 1,
        "reportType": "anki_review_candidate",
        "generatedFromCommit": "a" * 40,
        "governedInputSha256": "b" * 64,
        "draftAndCurrentPreviews": [
            _complete_preview(
                uid="injection-probe",
                recordKey="injection-probe:base",
                frontHtml=injected,
                backHtml=injected,
            )
        ],
        "issues": [{"code": "TEST", "severity": "hard", "subject": injected, "message": injected}],
        "qbankItems": [],
        "evidenceRecords": {},
        "policyRecords": {},
        "quarantine": {"new": [], "changed": [], "accepted": [], "resolved": []},
        "quarantineBaseRecordSha256": {},
        "withdrawalPreviews": [],
    }

    rendered = build_review_html(candidate)

    assert injected not in rendered
    encoded = re.search(
        r'<script id="candidate" type="application/json" data-encoding="base64">([^<]+)</script>',
        rendered,
    )
    assert encoded is not None
    decoded = base64.b64decode(encoded.group(1))
    from pcl_anki.contract import canonical_json_bytes

    assert decoded == canonical_json_bytes(candidate)
    assert "TextDecoder" in rendered


def test_candidate_schema_rejects_unknown_top_level_property():
    candidate = {
        "schemaVersion": 1,
        "reportType": "anki_review_candidate",
        "generatedFromCommit": "a" * 40,
        "governedInputSha256": "b" * 64,
        "draftAndCurrentPreviews": [],
        "issues": [],
        "qbankItems": [],
        "evidenceRecords": {},
        "policyRecords": {},
        "quarantine": {"new": [], "changed": [], "accepted": [], "resolved": []},
        "quarantineBaseRecordSha256": {},
        "withdrawalPreviews": [],
        "unexpected": True,
    }

    with pytest.raises(ReviewPatchError, match="candidate"):
        build_review_html(candidate)


def test_candidate_schema_rejects_unknown_nested_preview_property():
    candidate = {
        "schemaVersion": 1,
        "reportType": "anki_review_candidate",
        "generatedFromCommit": "a" * 40,
        "governedInputSha256": "b" * 64,
        "draftAndCurrentPreviews": [
            {
                "namespace": "core",
                "uid": "card-1",
                "identity": "base",
                "frontHtml": "front",
                "backHtml": "back",
                "unexpected": True,
            }
        ],
        "issues": [],
        "qbankItems": [],
        "evidenceRecords": {},
        "policyRecords": {},
        "quarantine": {"new": [], "changed": [], "accepted": [], "resolved": []},
        "quarantineBaseRecordSha256": {},
        "withdrawalPreviews": [],
    }

    with pytest.raises(ReviewPatchError, match="candidate"):
        build_review_html(candidate)


def _candidate_shell(previews, *, qbank_items=()):
    return {
        "schemaVersion": 1,
        "reportType": "anki_review_candidate",
        "generatedFromCommit": "a" * 40,
        "governedInputSha256": "b" * 64,
        "draftAndCurrentPreviews": list(previews),
        "issues": [],
        "qbankItems": list(qbank_items),
        "evidenceRecords": {},
        "policyRecords": {},
        "quarantine": {"new": [], "changed": [], "accepted": [], "resolved": []},
        "quarantineBaseRecordSha256": {},
        "withdrawalPreviews": [],
    }


def test_candidate_schema_rejects_empty_and_wrong_typed_previews():
    with pytest.raises(ReviewPatchError, match="candidate"):
        build_review_html(_candidate_shell([{}]))

    wrong = {
        "namespace": 123,
        "uid": False,
        "identity": [],
        "guid": {},
        "deckId": "not-an-integer",
        "modelId": None,
        "templateOrdinal": 1.5,
        "fields": "not-an-array",
        "tags": {},
        "frontHtml": [],
        "backHtml": {},
        "templateContractSha256": "not-a-hash",
        "renderSha256": 7,
        "active": "yes",
        "withdrawn": 0,
    }
    with pytest.raises(ReviewPatchError, match="candidate"):
        build_review_html(_candidate_shell([wrong]))


def test_candidate_schema_allows_nullable_canonical_only_with_qbank_template():
    qbank_without_template = _complete_preview()
    del qbank_without_template["proposedRecordTemplate"]
    with pytest.raises(ReviewPatchError, match="candidate"):
        build_review_html(_candidate_shell([qbank_without_template]))

    card_without_record = _complete_preview(
        namespace="core",
        uid="card-1",
        targetRegistry="cards",
        recordKey="card-1",
    )
    del card_without_record["proposedRecordTemplate"]
    with pytest.raises(ReviewPatchError, match="candidate"):
        build_review_html(_candidate_shell([card_without_record]))


def test_real_generated_authoring_candidate_validates_for_clinic(
    passing_release_factory, tmp_path
):
    from pcl_anki.contract import HistoryRegistry
    from pcl_anki.release import run_profile

    bundle = passing_release_factory()
    inputs = type(bundle.inputs)(
        **{
            **vars(bundle.inputs),
            "governed_input_sha256": "a" * 64,
            "governed_input_ledger": (("synthetic/input.json", "b" * 64),),
        }
    )
    review = tmp_path / "review"
    run_profile(
        inputs,
        profile="authoring",
        out=tmp_path / "out",
        review_out=review,
        baseline_history=HistoryRegistry((), ()),
    )
    candidate = json.loads((review / "review_candidate.json").read_text())

    required_preview_fields = (
        "namespace",
        "uid",
        "identity",
        "guid",
        "deckId",
        "modelId",
        "templateOrdinal",
        "fields",
        "tags",
        "frontHtml",
        "backHtml",
        "templateContractSha256",
        "renderSha256",
        "active",
        "withdrawn",
        "state",
        "source",
        "risk",
        "review",
        "qbank",
        "priorApprovedRenderSha256",
        "priorApprovedFrontHtml",
        "priorApprovedBackHtml",
        "priorRenderStatus",
        "targetRegistry",
        "recordKey",
        "baseRecordSha256",
        "canonicalRecord",
    )
    for field in required_preview_fields:
        missing = deepcopy(candidate)
        del missing["draftAndCurrentPreviews"][0][field]
        with pytest.raises(ReviewPatchError, match="candidate"):
            build_review_html(missing)

    rendered = build_review_html(candidate)

    assert 'data-encoding="base64"' in rendered

    realistic = deepcopy(candidate)
    withdrawn = {
        **realistic["notes"][0],
        "reasonCode": "SOURCE_REMOVED",
        "affectedReleaseId": "anki-2026-07-13.1",
    }
    realistic["withdrawals"] = [withdrawn]
    realistic["withdrawalPreviews"] = [
        {
            "namespace": withdrawn["namespace"],
            "uid": withdrawn["uid"],
            "identity": withdrawn["identity"],
            "reasonCode": withdrawn["reasonCode"],
            "affectedReleaseId": withdrawn["affectedReleaseId"],
            "withdrawalTemplateVersion": "pcl-neutral-withdrawal-v1",
            "approvedWithdrawalSha256": "1" * 64,
            "templateContractSha256": "2" * 64,
            "fields": ["Withdrawn", "See current curriculum"],
            "frontHtml": "Withdrawn",
            "backHtml": "See current curriculum",
        }
    ]
    realistic["quarantine"]["new"] = [
        {
            "namespace": withdrawn["namespace"],
            "uid": withdrawn["uid"],
            "identity": withdrawn["identity"],
            "reasonCode": "SOURCE_REMOVED",
            "subjectSha256": "3" * 64,
            "sourcePath": None,
            "firstSeenCommit": "abcdef1",
            "withdrawalRenderSha256": "4" * 64,
        }
    ]

    assert 'data-encoding="base64"' in build_review_html(realistic)

    shared_withdrawal_types = {
        "namespace": 123,
        "uid": False,
        "guid": [],
        "deckId": "not-an-integer",
        "fields": "not-an-array",
        "frontHtml": [],
        "templateContractSha256": "not-a-hash",
        "active": "yes",
    }
    for field, value in shared_withdrawal_types.items():
        malformed = deepcopy(realistic)
        malformed["withdrawals"][0][field] = value
        with pytest.raises(ReviewPatchError, match="candidate"):
            build_review_html(malformed)


@pytest.mark.parametrize("decision_name", ("accept", "edit"))
def test_new_qbank_preview_exports_applicable_named_review_patch(
    passing_release_factory, tmp_path, decision_name
):
    bundle = passing_release_factory()
    inputs = SimpleNamespace(**{**vars(bundle.inputs), "qbank_reviews": ()})
    preview = next(
        value
        for value in _draft_previews(inputs)
        if value["namespace"] == "qbank" and value["identity"] == "base"
    )

    assert preview["canonicalRecord"] is None
    assert preview["baseRecordSha256"] is None
    template = preview["proposedRecordTemplate"]
    assert "risk" not in template
    assert "facultyApprovedBy" not in template
    section = next(
        value
        for value in preview["source"]["sections"]
        if value["anchor"] == bundle.qbank_review["primaryAnchor"]
    )
    proposed = {
        **template,
        "primaryAnchor": section["anchor"],
        "sourceAnchorSha256": section["sourceAnchorSha256"],
        "risk": {"level": "Routine", "facets": []},
        "facultyApprovedBy": "Named Faculty Reviewer",
        "facultyApprovedAt": "2026-07-14",
    }
    patch = {
        "schemaVersion": 1,
        "targetRegistry": "qbank_render_reviews",
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "decisions": [
            {
                "recordKey": preview["recordKey"],
                "baseRecordSha256": None,
                "proposedRecord": proposed,
                "decision": decision_name,
                "reviewer": "Named Faculty Reviewer",
                "reviewedAt": "2026-07-14",
            }
        ],
    }
    validate_review_patch(patch)
    validate_nonhistory_patch(
        inputs, history_from_dict(inputs.release_history), patch
    )

    registry = tmp_path / "qbank_render_reviews.json"
    registry.write_text('{"schemaVersion":1,"reviews":[]}\n', encoding="utf-8")
    changed = apply_optimistic_registry_patch(
        registry,
        patch,
        current_head="a" * 40,
        current_input_sha256="b" * 64,
    )
    assert changed == (preview["recordKey"],)
    assert json.loads(registry.read_text())["reviews"] == [proposed]

    stale_registry = tmp_path / "stale-qbank_render_reviews.json"
    stale_registry.write_text(
        json.dumps({"schemaVersion": 1, "reviews": [proposed]}, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    stale_before = stale_registry.read_bytes()
    with pytest.raises(ReviewPatchError, match="stale base"):
        apply_optimistic_registry_patch(
            stale_registry,
            patch,
            current_head="a" * 40,
            current_input_sha256="b" * 64,
        )
    assert stale_registry.read_bytes() == stale_before

    candidate = _candidate_shell([preview], qbank_items=[bundle.qbank_item])
    rendered = build_review_html(candidate)
    controls = re.search(
        rf'<div class="note-controls" data-note-key="{re.escape(preview["recordKey"])}">(.*?)</div>',
        rendered,
    )
    assert controls is not None and " disabled" not in controls.group(1)
    assert "Select faculty risk" in rendered
    assert "proposedRecord:null" in rendered
    assert ".rejection.patch.json" in rendered


@pytest.mark.parametrize("target", ("cards", "qbank_render_reviews"))
@pytest.mark.parametrize("existing", (False, True))
def test_reject_is_stale_checked_successful_no_write(
    passing_release_factory, tmp_path, target, existing
):
    bundle = passing_release_factory()
    if target == "cards":
        record = deepcopy(bundle.core_cards[0])
        key = record["id"]
        collection = "cards"
    else:
        record = deepcopy(bundle.qbank_review)
        key = f"{record['qbankId']}:{record['identity']}"
        collection = "reviews"
    records = [record] if existing else []
    registry = tmp_path / f"{target}.json"
    registry.write_text(
        json.dumps({"schemaVersion": 1, collection: records}, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    before = registry.read_bytes()
    patch = {
        "schemaVersion": 1,
        "targetRegistry": target,
        "generatedFromCommit": "a" * 40,
        "inputSha256": "b" * 64,
        "decisions": [
            {
                "recordKey": key,
                "baseRecordSha256": canonical_json_sha256(record) if existing else None,
                "proposedRecord": None,
                "decision": "reject",
                "reviewer": "Named Faculty Reviewer",
                "reviewedAt": "2026-07-14",
            }
        ],
    }
    validate_review_patch(patch)
    validate_nonhistory_patch(
        bundle.inputs, history_from_dict(bundle.inputs.release_history), patch
    )
    assert (
        apply_optimistic_registry_patch(
            registry,
            patch,
            current_head="a" * 40,
            current_input_sha256="b" * 64,
        )
        == ()
    )
    assert registry.read_bytes() == before

    stale = deepcopy(patch)
    stale["decisions"][0]["baseRecordSha256"] = "0" * 64
    with pytest.raises(ReviewPatchError, match="stale base|missing base"):
        apply_optimistic_registry_patch(
            registry,
            stale,
            current_head="a" * 40,
            current_input_sha256="b" * 64,
        )
    assert registry.read_bytes() == before


def test_frozen_prior_qbank_bytes_render_as_escaped_red_green_diff():
    repo = Path(__file__).resolve().parents[2]
    question_bank = json.loads((repo / "question_bank.json").read_text())
    original_item = next(
        item for item in question_bank["items"] if item["id"] == "qb_pha_002"
    )
    changed_item = deepcopy(original_item)
    changed_item["stem"] += " Current changed render marker."
    manifest = load_manifest(
        repo
        / "13_Faculty_Resources"
        / "_automation"
        / "site_build"
        / "site_manifest.json"
    )
    reviewed = json.loads((repo / "13_Faculty_Resources" / "reviewed.json").read_text())
    prior_package_paths = (
        repo / "tests/anki/fixtures/legacy_qbank_2026-07-12.apkg",
    )
    original_inputs = SimpleNamespace(
        repo_root=repo,
        cards=(),
        question_bank={"items": [original_item]},
        qbank_reviews=(),
        manifest=manifest,
        reviewed=reviewed,
        prior_package_paths=prior_package_paths,
    )
    original_preview = next(
        value
        for value in _draft_previews(original_inputs)
        if value["identity"] == "base"
    )
    source_section = original_preview["source"]["sections"][0]
    existing_approval = {
        **original_preview["proposedRecordTemplate"],
        "primaryAnchor": source_section["anchor"],
        "sourceAnchorSha256": source_section["sourceAnchorSha256"],
        "risk": {"level": "Routine", "facets": []},
        "facultyApprovedBy": "Named Faculty Reviewer",
        "facultyApprovedAt": "2026-07-14",
    }
    inputs = SimpleNamespace(
        **{
            **vars(original_inputs),
            "question_bank": {"items": [changed_item]},
            "qbank_reviews": (existing_approval,),
        }
    )
    preview = next(value for value in _draft_previews(inputs) if value["identity"] == "base")

    assert preview["priorRenderStatus"] == "changed_exact_prior"
    assert preview["priorApprovedRenderSha256"] == existing_approval["renderedNoteSha256"]
    assert "Current changed render marker" not in preview["priorApprovedFrontHtml"]
    assert "Current changed render marker" in preview["frontHtml"]
    assert preview["priorApprovedBackHtml"]

    rendered = build_review_html(
        _candidate_shell([preview], qbank_items=[changed_item])
    )
    assert "diff-prior-red" in rendered and "diff-current-green" in rendered
    assert "Current changed render marker" in rendered
    assert "Absolute neutrophil count monitoring" in rendered


def test_prior_render_status_distinguishes_never_approved_from_blocking_gap(
    passing_release_factory,
):
    bundle = passing_release_factory()
    never = SimpleNamespace(**{**vars(bundle.inputs), "qbank_reviews": (), "prior_package_paths": ()})
    never_preview = next(
        value for value in _draft_previews(never) if value["namespace"] == "qbank"
    )
    assert never_preview["priorRenderStatus"] == "never_approved"

    claimed = deepcopy(bundle.qbank_review)
    claimed["renderedNoteSha256"] = "0" * 64
    blocked = SimpleNamespace(
        **{**vars(bundle.inputs), "qbank_reviews": (claimed,), "prior_package_paths": ()}
    )
    blocked_preview = next(
        value for value in _draft_previews(blocked) if value["namespace"] == "qbank"
    )
    assert blocked_preview["priorRenderStatus"] == "blocking_prior_evidence_gap"


def test_real_shaped_qb_pha_002_preview_resolves_exact_governed_source():
    repo = Path(__file__).resolve().parents[2]
    question_bank = json.loads((repo / "question_bank.json").read_text())
    reviewed = json.loads(
        (repo / "13_Faculty_Resources" / "reviewed.json").read_text()
    )
    manifest = load_manifest(
        repo
        / "13_Faculty_Resources"
        / "_automation"
        / "site_build"
        / "site_manifest.json"
    )
    from types import SimpleNamespace

    previews = _draft_previews(
        SimpleNamespace(
            repo_root=repo,
            cards=(),
            question_bank=question_bank,
            qbank_reviews=(),
            manifest=manifest,
            reviewed=reviewed,
        )
    )
    preview = next(
        value
        for value in previews
        if value["namespace"] == "qbank"
        and value["uid"] == "qb_pha_002"
        and value["identity"] == "base"
    )

    source = preview["source"]
    assert source["path"] == (
        "05_Psychopharmacology/Student_Primer_Top10/"
        "psychopharmacology_primer_inpatient.md"
    )
    assert source["url"].startswith("https://")
    assert source["status"]["status"] == "reviewed"
    assert "Clozapine" in source["quote"]
    source_text = (repo / source["path"]).read_text()
    assert source["quote"] in source_text
    assert source["quoteSha256"] == sha256(source["quote"].encode()).hexdigest()
    assert source["fileSha256"] == sha256((repo / source["path"]).read_bytes()).hexdigest()


def test_candidate_clinic_has_per_note_actions_and_visible_prior_current_status():
    candidate = {
        "schemaVersion": 1,
        "reportType": "anki_review_candidate",
        "generatedFromCommit": "a" * 40,
        "governedInputSha256": "b" * 64,
        "draftAndCurrentPreviews": [
            _complete_preview(
                uid="qb_card_1",
                recordKey="qb_card_1:base",
                frontHtml="Current front",
                backHtml="Current back",
                renderSha256="1" * 64,
                priorApprovedRenderSha256="2" * 64,
                priorRenderStatus="blocking_prior_evidence_gap",
            )
        ],
        "issues": [],
        "qbankItems": [],
        "evidenceRecords": {},
        "policyRecords": {},
        "quarantine": {"new": [], "changed": [], "accepted": [], "resolved": []},
        "quarantineBaseRecordSha256": {},
        "withdrawalPreviews": [],
    }

    rendered = build_review_html(candidate)

    for action in ("accept", "edit", "reject", "quarantine"):
        assert f'data-action="{action}"' in rendered
    assert "Current approved-render comparison" in rendered
    assert "Blocking prior-render evidence gap" in rendered
    assert "diff-changed" in rendered and "diff-exact" in rendered
    assert "targetRegistry:note.targetRegistry" in rendered


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


def test_prepare_named_history_apply_tamper_matrix_and_release_end_to_end(
    passing_release_factory, tmp_path, monkeypatch
):
    from datetime import date
    from types import SimpleNamespace
    from pcl_anki.contract import HistoryRegistry, canonical_json_sha256
    from pcl_anki.history import history_bytes, history_to_dict
    from pcl_anki.package import write_release
    from pcl_anki.release import evaluate_release, run_profile
    import pcl_anki.release as release_module

    bundle = passing_release_factory()
    repo = bundle.inputs.repo_root
    registry = repo / "13_Faculty_Resources" / "anki"
    history_path = registry / "release_history.json"
    empty = HistoryRegistry((), ())
    empty_bytes = history_bytes(empty)
    history_path.write_bytes(empty_bytes)
    config = deepcopy(bundle.inputs.release_config)
    config.update(
        releaseId="synthetic-task9-e2e",
        releaseDate="2026-07-14",
        releaseEpoch=1784059200,
    )
    inputs = SimpleNamespace(
        **{
            **vars(bundle.inputs),
            "release_config": config,
            "release_history": history_to_dict(empty),
            "governed_input_sha256": "a" * 64,
            "governed_input_ledger": (("synthetic/input.json", "b" * 64),),
        }
    )
    candidate = evaluate_release(
        inputs,
        build_epoch=1784059200,
        evaluation_date=date(2026, 7, 14),
        profile="prepare",
        baseline_history=empty,
    )
    seed_source = tmp_path / "seed-source"
    write_release(candidate, seed_source)
    prior = tmp_path / "prior"
    prior.mkdir()
    qbank = prior / "legacy_qbank_2026-07-12.apkg"
    combined = prior / "legacy_all_2026-07-12.apkg"
    shutil.copy2(seed_source / "psychiatry_clerkship_qbank.apkg", qbank)
    shutil.copy2(seed_source / "psychiatry_clerkship_ms3_complete.apkg", combined)
    monkeypatch.setattr(
        release_module,
        "_LEGACY_FIXTURE_SHA256",
        {
            qbank.name: sha256(qbank.read_bytes()).hexdigest(),
            combined.name: sha256(combined.read_bytes()).hexdigest(),
        },
    )
    baseline_path = tmp_path / "baseline.json"
    baseline_path.write_bytes(empty_bytes)
    candidate_dir = tmp_path / "candidate"
    review_dir = tmp_path / "review"
    run_profile(
        inputs,
        profile="prepare",
        out=candidate_dir,
        review_out=review_dir,
        baseline_history=empty,
        history_baseline_path=baseline_path,
        prior_release_dir=prior,
        evaluation_date=date(2026, 7, 14),
    )
    proposal_path = review_dir / "release_history.proposal.json"
    proposal = json.loads(proposal_path.read_text())
    append = proposal["historyAppend"]
    patch = {
        "schemaVersion": 1,
        "targetRegistry": "release_history",
        "generatedFromCommit": proposal["generatedFromCommit"],
        "inputSha256": proposal["inputSha256"],
        "sourceProposalSha256": canonical_json_sha256(proposal),
        "historyAppend": append,
        "decisions": [
            {
                "recordKey": "release:synthetic-task9-e2e",
                "baseRecordSha256": None,
                "proposedRecord": append,
                "decision": "accept",
                "reviewer": "Synthetic Release Reviewer",
                "reviewedAt": "2026-07-14",
            }
        ],
    }
    patch_path = review_dir / "release_history.patch.json"
    patch_path.write_text(json.dumps(patch), encoding="utf-8")
    monkeypatch.setattr(release_module, "load_release_inputs", lambda unused: inputs)

    tampered_candidate = tmp_path / "tampered-candidate"
    shutil.copytree(candidate_dir, tampered_candidate)
    (tampered_candidate / "psychiatry_clerkship_ms3_cards.csv").write_bytes(b"tampered")
    wrong_baseline = tmp_path / "wrong-baseline.json"
    wrong_baseline.write_text(
        json.dumps({"schemaVersion": 1, "identityEntries": [], "releases": [{"releaseId": "bad"}]}),
        encoding="utf-8",
    )
    wrong_prior = tmp_path / "wrong-prior"
    shutil.copytree(prior, wrong_prior)
    (wrong_prior / qbank.name).write_bytes(b"tampered")
    missing_candidate = tmp_path / "missing-candidate"
    shutil.copytree(candidate_dir, missing_candidate)
    (missing_candidate / "psychiatry_clerkship_qbank.apkg").unlink()
    extra_candidate = tmp_path / "extra-candidate"
    shutil.copytree(candidate_dir, extra_candidate)
    (extra_candidate / "unexpected.txt").write_text("unexpected", encoding="utf-8")
    for label, candidate_arg, baseline_arg, prior_arg in (
        ("candidate", tampered_candidate, baseline_path, prior),
        ("missing candidate", missing_candidate, baseline_path, prior),
        ("extra candidate", extra_candidate, baseline_path, prior),
        ("baseline", candidate_dir, wrong_baseline, prior),
        ("prior", candidate_dir, baseline_path, wrong_prior),
    ):
        history_path.write_bytes(empty_bytes)
        with pytest.raises((ReviewPatchError, ValueError, OSError), match="candidate|baseline|prior|history|context|migration|artifact|schema"):
            apply_review_patch(
                repo,
                patch_path,
                candidate_dir=candidate_arg,
                history_baseline=baseline_arg,
                prior_release_dir=prior_arg,
            )
        assert history_path.read_bytes() == empty_bytes, label

    proposal_bytes = proposal_path.read_bytes()
    forged_proposal = deepcopy(proposal)
    forged_proposal["context"]["migrationProofSha256"] = "0" * 64
    proposal_path.write_text(json.dumps(forged_proposal), encoding="utf-8")
    with pytest.raises(ReviewPatchError, match="proposal|source|context|forged"):
        apply_review_patch(
            repo,
            patch_path,
            candidate_dir=candidate_dir,
            history_baseline=baseline_path,
            prior_release_dir=prior,
        )
    assert history_path.read_bytes() == empty_bytes
    proposal_path.write_bytes(proposal_bytes)

    changed = apply_review_patch(
        repo,
        patch_path,
        candidate_dir=candidate_dir,
        history_baseline=baseline_path,
        prior_release_dir=prior,
    )
    assert changed == ("release:synthetic-task9-e2e",)
    reviewed = json.loads(history_path.read_text())
    release_inputs = SimpleNamespace(
        **{**vars(inputs), "release_history": reviewed}
    )
    run_profile(
        release_inputs,
        profile="release",
        out=tmp_path / "release",
        review_out=tmp_path / "release-review",
        baseline_history=empty,
        history_baseline_path=baseline_path,
        prior_release_dir=prior,
        evaluation_date=date(2026, 7, 14),
    )


def test_public_release_and_patch_cli_main_profile_and_context_behavior(
    passing_release_factory, tmp_path, monkeypatch
):
    calls = []

    def clean(repo):
        calls.append(("clean", repo))

    def blocked_load(repo):
        calls.append(("load", repo))
        raise ReleaseOrchestrationError("synthetic loader stop")

    monkeypatch.setattr(build_release_cli, "require_clean_tracked_worktree", clean)
    monkeypatch.setattr(build_release_cli, "load_release_inputs", blocked_load)
    assert build_release_cli.main(
        [
            "--profile", "prepare", "--repo", str(Path(__file__).resolve().parents[2]),
            "--out", str(tmp_path / "out"), "--review-out", str(tmp_path / "review"),
        ]
    ) == 1
    assert [value[0] for value in calls] == ["clean", "load"]

    patch_path = tmp_path / "patch.json"
    patch_path.write_text("{}", encoding="utf-8")
    recorded = {}

    def apply(repo, patch, **context):
        recorded.update(repo=repo, patch=patch, **context)
        if any(value is None for value in context.values()):
            raise ReviewPatchError("history context required")
        return ()

    monkeypatch.setattr(apply_review_patch_cli, "apply_review_patch", apply)
    assert apply_review_patch_cli.main(
        ["--repo", str(tmp_path), "--patch", str(patch_path)]
    ) == 1
    assert apply_review_patch_cli.main(
        [
            "--repo", str(tmp_path), "--patch", str(patch_path),
            "--candidate-dir", str(tmp_path / "candidate"),
            "--history-baseline", str(tmp_path / "baseline.json"),
            "--prior-release-dir", str(tmp_path / "prior"),
        ]
    ) == 0
    assert recorded["candidate_dir"] == tmp_path / "candidate"
