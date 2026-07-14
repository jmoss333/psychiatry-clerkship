from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from pcl_anki.contract import (
    APPLICATION_DECK_ID,
    APPLICATION_DECK_NAME,
    APPLICATION_FIELDS,
    APPLICATION_MODEL_ID,
    APPLICATION_MODEL_NAME,
    APPLICATION_TEMPLATE_NAME,
    APPLICATION_TEMPLATE_ORDINAL,
    CORE_BASIC_FIELDS,
    CORE_BASIC_MODEL_ID,
    CORE_BASIC_MODEL_NAME,
    CORE_BASIC_TEMPLATE_NAME,
    CORE_BASIC_TEMPLATE_ORDINAL,
    CORE_CLOZE_FIELDS,
    CORE_CLOZE_MODEL_ID,
    CORE_CLOZE_MODEL_NAME,
    CORE_CLOZE_TEMPLATE_NAME,
    CORE_CLOZE_TEMPLATE_ORDINAL,
    CORE_DECK_ID,
    CORE_DECK_NAME,
    HistoryRegistry,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    LEGACY_QBANK_TEMPLATE_NAME,
    LEGACY_QBANK_TEMPLATE_ORDINAL,
    QuarantineFinding,
    legacy_qbank_guid,
)
from pcl_anki.governance import (
    WITHDRAWAL_TEMPLATE_VERSION,
    reconcile_quarantines,
)
from pcl_anki.history import (
    audit_shipped_identities,
    bootstrap_legacy_history,
    build_withdrawals,
    preview_withdrawals,
    validate_identity_relationships,
    withdrawal_render_sha256,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
PROHIBITED = (
    "mandatory ANC",
    "mandated monitoring",
    "most critical ongoing monitoring parameter",
    "Wrong monitoring target",
    "Treat the number, not the patient",
)


def _legacy_history() -> HistoryRegistry:
    return bootstrap_legacy_history(
        {
            "standalone": REPO_ROOT / "tests/anki/fixtures/legacy_qbank_2026-07-12.apkg",
            "combined": REPO_ROOT / "tests/anki/fixtures/legacy_all_2026-07-12.apkg",
        },
        source_commit="a96e32fe237ecf820d0cb187edfa4bac505435d6",
        shipped_at=date(2026, 7, 12),
        release_id="legacy-qbank-2026-07-12",
        release_epoch=1783902620,
    )


def _entry(
    namespace: str,
    uid: str,
    *,
    identity: str = "base",
    model_id: int,
    model_name: str,
    deck_id: int,
    deck_name: str,
    fields,
    template_name: str,
    template_ordinal: int,
    guid: str,
) -> dict:
    kind = {
        CORE_BASIC_MODEL_ID: "basic",
        CORE_CLOZE_MODEL_ID: "cloze",
        APPLICATION_MODEL_ID: "application",
        LEGACY_QBANK_MODEL_ID: "qbank",
    }[model_id]
    return {
        "namespace": namespace,
        "uid": uid,
        "identity": identity,
        "guid": guid,
        "kind": kind,
        "model": {"id": model_id, "name": model_name},
        "deck": {"id": deck_id, "name": deck_name},
        "fields": [
            {"name": name, "id": field_id}
            for name, field_id in (
                fields
                if fields and isinstance(fields[0], tuple)
                else tuple((name, None) for name in fields)
            )
        ],
        "template": {"id": None, "name": template_name, "ordinal": template_ordinal},
        "firstShippedReleaseId": "release-n",
        "origin": "governed",
    }


def _history(entries: tuple[dict, ...], *, shipped: bool = True) -> HistoryRegistry:
    memberships = []
    if shipped:
        for entry in entries:
            memberships.append(
                {
                    "namespace": entry["namespace"],
                    "uid": entry["uid"],
                    "identity": entry["identity"],
                    "status": "active",
                    "approvedCardSha256": "a" * 64,
                    "shippedCardSha256": "a" * 64,
                    "templateVersion": "synthetic-active-v1",
                    "artifacts": [
                        {
                            "filename": "psychiatry_clerkship_qbank.apkg"
                            if entry["namespace"] == "qbank"
                            else "psychiatry_clerkship_ms3_core.apkg",
                            "deckId": entry["deck"]["id"],
                            "deckName": entry["deck"]["name"],
                        }
                    ],
                }
            )
    release = {"releaseId": "release-n", "memberships": memberships}
    return HistoryRegistry(entries, (release,))


def _decision(history: HistoryRegistry, entry: dict, **overrides) -> dict:
    preview = preview_withdrawals(
        history,
        (
            {
                "namespace": entry["namespace"],
                "uid": entry["uid"],
                "identity": entry["identity"],
                "reasonCode": "SYNTHETIC_SAFETY_WITHDRAWAL",
                "affectedReleaseId": "release-n",
            },
        ),
    )[0]
    decision = {
        "namespace": entry["namespace"],
        "uid": entry["uid"],
        "identity": entry["identity"],
        "reasonCode": "SYNTHETIC_SAFETY_WITHDRAWAL",
        "subjectSha256": "e" * 64,
        "sourcePath": None,
        "firstSeenCommit": "ad7dd2851f4621a4177cd4ce34438af3751620d6",
        "disposition": "withdraw",
        "reviewOwner": "Named Faculty Owner",
        "reviewedBy": "Named Faculty Reviewer",
        "reviewedAt": "2026-07-14",
        "affectedReleaseId": "release-n",
        "withdrawalTemplateVersion": WITHDRAWAL_TEMPLATE_VERSION,
        "approvedWithdrawalSha256": preview.render_sha256,
    }
    decision.update(overrides)
    return decision


def _proof(history: HistoryRegistry, entry: dict):
    decision = _decision(history, entry)
    finding = QuarantineFinding(
        namespace=entry["namespace"],
        uid=entry["uid"],
        identity=entry["identity"],
        reason_code=decision["reasonCode"],
        subject_sha256=decision["subjectSha256"],
        source_path=decision["sourcePath"],
        first_seen_commit=decision["firstSeenCommit"],
        withdrawal_render_sha256=decision["approvedWithdrawalSha256"],
    )
    result = reconcile_quarantines(
        (finding,),
        {"accepted": [decision]},
        release_history={"releases": history.releases},
    )
    assert result.accepted == (finding,)
    assert len(result.withdrawal_proofs) == 1
    return result.withdrawal_proofs[0]


def _all_entries() -> tuple[dict, ...]:
    return (
        _entry(
            "core",
            "ms3_core_basic_001",
            model_id=CORE_BASIC_MODEL_ID,
            model_name=CORE_BASIC_MODEL_NAME,
            deck_id=CORE_DECK_ID,
            deck_name=CORE_DECK_NAME,
            fields=CORE_BASIC_FIELDS,
            template_name=CORE_BASIC_TEMPLATE_NAME,
            template_ordinal=CORE_BASIC_TEMPLATE_ORDINAL,
            guid="core-basic-guid",
        ),
        _entry(
            "core",
            "ms3_core_cloze_001",
            model_id=CORE_CLOZE_MODEL_ID,
            model_name=CORE_CLOZE_MODEL_NAME,
            deck_id=CORE_DECK_ID,
            deck_name=CORE_DECK_NAME,
            fields=CORE_CLOZE_FIELDS,
            template_name=CORE_CLOZE_TEMPLATE_NAME,
            template_ordinal=CORE_CLOZE_TEMPLATE_ORDINAL,
            guid="core-cloze-guid",
        ),
        _entry(
            "application",
            "ms3_application_001",
            model_id=APPLICATION_MODEL_ID,
            model_name=APPLICATION_MODEL_NAME,
            deck_id=APPLICATION_DECK_ID,
            deck_name=APPLICATION_DECK_NAME,
            fields=APPLICATION_FIELDS,
            template_name=APPLICATION_TEMPLATE_NAME,
            template_ordinal=APPLICATION_TEMPLATE_ORDINAL,
            guid="application-guid",
        ),
        _entry(
            "qbank",
            "qb_alpha_001",
            model_id=LEGACY_QBANK_MODEL_ID,
            model_name=LEGACY_QBANK_MODEL_NAME,
            deck_id=LEGACY_QBANK_DECK_ID,
            deck_name=LEGACY_QBANK_DECK_NAME,
            fields=LEGACY_QBANK_FIELDS,
            template_name=LEGACY_QBANK_TEMPLATE_NAME,
            template_ordinal=LEGACY_QBANK_TEMPLATE_ORDINAL,
            guid=legacy_qbank_guid("qb_alpha_001"),
        ),
        _entry(
            "qbank",
            "qb_alpha_001",
            identity="tier2",
            model_id=LEGACY_QBANK_MODEL_ID,
            model_name=LEGACY_QBANK_MODEL_NAME,
            deck_id=LEGACY_QBANK_DECK_ID,
            deck_name=LEGACY_QBANK_DECK_NAME,
            fields=LEGACY_QBANK_FIELDS,
            template_name=LEGACY_QBANK_TEMPLATE_NAME,
            template_ordinal=LEGACY_QBANK_TEMPLATE_ORDINAL,
            guid=legacy_qbank_guid("qb_alpha_001", "tier2"),
        ),
    )


def test_unshipped_quarantine_or_retired_tombstone_emits_no_note():
    entry = _all_entries()[0]
    history = _history((entry,), shipped=False)
    assert preview_withdrawals(history, (_decision(_history((entry,)), entry),)) == ()
    assert build_withdrawals(history, (_decision(_history((entry,)), entry),)) == ()


@pytest.mark.parametrize("index", range(5))
def test_shipped_core_application_qbank_base_and_tier2_keep_original_identity(index):
    entry = _all_entries()[index]
    history = _history((entry,))
    withdrawal = build_withdrawals(history, (_proof(history, entry),))[0]

    assert withdrawal.namespace == entry["namespace"]
    assert withdrawal.uid == entry["uid"]
    assert withdrawal.identity == entry["identity"]
    assert withdrawal.guid == entry["guid"]
    assert withdrawal.model_id == entry["model"]["id"]
    assert withdrawal.deck_id == entry["deck"]["id"]
    assert withdrawal.template_ordinal == entry["template"]["ordinal"]
    assert withdrawal.field_names == tuple(field["name"] for field in entry["fields"])
    assert withdrawal.tags == (
        "PsychClerkship",
        "Status::withdrawn",
        f"UID::{entry['uid']}",
    )
    assert withdrawal.active is False
    assert withdrawal.withdrawn is True
    assert withdrawal.render_sha256 == withdrawal_render_sha256(withdrawal)


@pytest.mark.parametrize(
    "missing",
    [
        "reviewOwner",
        "reviewedBy",
        "reviewedAt",
        "affectedReleaseId",
        "withdrawalTemplateVersion",
        "approvedWithdrawalSha256",
    ],
)
def test_shipped_withdrawal_without_named_exact_render_approval_is_not_releasable(missing):
    entry = _all_entries()[0]
    history = _history((entry,))
    decision = _decision(history, entry)
    decision.pop(missing)
    assert len(preview_withdrawals(history, (decision,))) == 1
    assert build_withdrawals(history, (decision,)) == ()


def test_wrong_or_stale_render_hash_is_not_releasable():
    entry = _all_entries()[0]
    history = _history((entry,))
    decision = _decision(history, entry, approvedWithdrawalSha256="f" * 64)
    assert build_withdrawals(history, (decision,)) == ()


def test_raw_ledger_decision_is_preview_only_even_when_exact():
    entry = _all_entries()[0]
    history = _history((entry,))
    decision = _decision(history, entry)

    assert len(preview_withdrawals(history, (decision,))) == 1
    assert build_withdrawals(history, (decision,)) == ()


def test_multiple_withdrawal_proofs_for_one_identity_fail_closed():
    entry = _all_entries()[0]
    history = _history((entry,))
    proof = _proof(history, entry)

    assert build_withdrawals(history, (proof, proof)) == ()


def test_task5_rejected_stale_raw_decision_cannot_become_task6_withdrawal():
    entry = _all_entries()[0]
    history = _history((entry,))
    decision = _decision(history, entry, subjectSha256="f" * 64)
    finding = QuarantineFinding(
        namespace=entry["namespace"],
        uid=entry["uid"],
        identity=entry["identity"],
        reason_code=decision["reasonCode"],
        subject_sha256="e" * 64,
        source_path=None,
        first_seen_commit="ad7dd2851f4621a4177cd4ce34438af3751620d6",
        withdrawal_render_sha256=decision["approvedWithdrawalSha256"],
    )
    decision.update(
        sourcePath=finding.source_path,
        firstSeenCommit=finding.first_seen_commit,
    )

    result = reconcile_quarantines(
        (finding,), {"accepted": [decision]}, release_history={"releases": history.releases}
    )

    assert result.accepted == ()
    assert result.changed == (finding,)
    assert build_withdrawals(history, (decision,)) == ()


def test_neutral_render_hash_excludes_non_rendered_reason_and_release_metadata():
    entry = _all_entries()[0]
    history = _history((entry,))
    preview = preview_withdrawals(history, (_decision(history, entry),))[0]
    metadata_changed = replace(
        preview,
        reason_code="DIFFERENT_GOVERNANCE_REASON",
        affected_release_id="different-release-metadata",
    )
    assert withdrawal_render_sha256(metadata_changed) == preview.render_sha256


def test_qb_pha_002_neutral_withdrawal_preserves_nine_fields_and_exact_guid():
    history = _legacy_history()
    entry = next(
        e for e in history.identity_entries if e["uid"] == "qb_pha_002" and e["identity"] == "base"
    )
    decision_history = HistoryRegistry(
        history.identity_entries,
        (
            {**history.releases[0], "releaseId": "release-n"},
        ),
    )
    withdrawal = build_withdrawals(
        decision_history, (_proof(decision_history, entry),)
    )[0]

    assert withdrawal.guid == "x9m9qM{_w7"
    assert withdrawal.model_id == LEGACY_QBANK_MODEL_ID
    assert withdrawal.deck_id == LEGACY_QBANK_DECK_ID
    assert withdrawal.template_ordinal == LEGACY_QBANK_TEMPLATE_ORDINAL
    assert withdrawal.field_names == LEGACY_QBANK_FIELDS
    assert withdrawal.fields == (
        "qb_pha_002",
        '<span class="withdrawn">[WITHDRAWN SAFETY UPDATE]</span> '
        "This card is no longer active. Re-imported under the same UID to remove stale content.",
        "",
        '<div class="withdrawn">Do not use the prior clinical content. '
        "See the release notice and search this UID if manual suspension is needed.</div>",
        "",
        "",
        "",
        "Anki safety release notice",
        '<div class="tag">Withdrawn</div>',
    )
    rendered = "\n".join(withdrawal.fields)
    assert all(text not in rendered for text in PROHIBITED)


def test_missing_canonical_shipped_identity_has_hard_issue_and_preview_until_tombstoned():
    entries = _all_entries()
    history = _history(entries)
    previews, issues = audit_shipped_identities(
        history,
        current_identities={(e["namespace"], e["uid"], e["identity"]) for e in entries[1:]},
        decisions=(),
    )
    assert len(previews) == 1
    assert previews[0].uid == entries[0]["uid"]
    assert {issue.code for issue in issues} == {
        "SHIPPED_IDENTITY_MISSING",
        "WITHDRAWAL_TOMBSTONE_REQUIRED",
    }

    decision = _decision(history, entries[0])
    _, reviewed_issues = audit_shipped_identities(
        history,
        current_identities={(e["namespace"], e["uid"], e["identity"]) for e in entries[1:]},
        decisions=(decision,),
    )
    assert {issue.code for issue in reviewed_issues} == {"SHIPPED_IDENTITY_MISSING"}


def test_identity_relationships_require_retired_different_superseded_target():
    records = (
        {"id": "card_old", "state": "retired", "supersedes": None},
        {"id": "card_new", "state": "approved", "supersedes": "card_old"},
    )
    assert validate_identity_relationships(records) == []
    same = deepcopy(records)
    same[1]["supersedes"] = "card_new"
    assert "SUPERSEDES_SELF" in {i.code for i in validate_identity_relationships(same)}
    live = deepcopy(records)
    live[0]["state"] = "approved"
    assert "SUPERSEDED_ID_NOT_RETIRED" in {
        i.code for i in validate_identity_relationships(live)
    }


def test_withdrawals_are_distinct_from_active_notes_and_csv_inputs():
    entry = _all_entries()[0]
    history = _history((entry,))
    withdrawals = build_withdrawals(history, (_proof(history, entry),))
    active_notes = tuple(note for note in withdrawals if note.active)
    csv_rows = tuple(note for note in withdrawals if note.active and note.namespace != "qbank")
    assert active_notes == ()
    assert csv_rows == ()
