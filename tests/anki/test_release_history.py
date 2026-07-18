from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from pcl_anki.contract import (
    CandidateRelease,
    HistoryRegistry,
    InspectionResult,
    Issue,
    MigrationResult,
    PackageSnapshot,
    QuarantineResult,
    QuarantineFinding,
    RenderedNote,
    canonical_json_bytes,
    legacy_qbank_guid,
)
from pcl_anki.history import (
    EMPTY_HISTORY,
    LegacyBootstrapError,
    HistoryError,
    bootstrap_legacy_history,
    build_withdrawals,
    history_to_dict,
    load_history,
    prepare_history_baseline,
    preview_withdrawals,
    propose_history_append,
    validate_history,
    write_history,
)
from pcl_anki.governance import WITHDRAWAL_TEMPLATE_VERSION, reconcile_quarantines


REPO_ROOT = Path(__file__).resolve().parents[2]
STANDALONE = REPO_ROOT / "tests/anki/fixtures/legacy_qbank_2026-07-12.apkg"
COMBINED = REPO_ROOT / "tests/anki/fixtures/legacy_all_2026-07-12.apkg"
HISTORY_PATH = Path("13_Faculty_Resources/anki/release_history.json")
BOOTSTRAP = {
    "source_commit": "a96e32fe237ecf820d0cb187edfa4bac505435d6",
    "shipped_at": date(2026, 7, 12),
    "release_id": "legacy-qbank-2026-07-12",
    "release_epoch": 1783902620,
}
BOOTSTRAP_CLI = (
    REPO_ROOT / "13_Faculty_Resources/_automation/anki/bootstrap_legacy_history.py"
)
BASELINE_CLI = (
    REPO_ROOT / "13_Faculty_Resources/_automation/anki/prepare_history_baseline.py"
)


def _bootstrap(packages: dict[str, Path] | None = None) -> HistoryRegistry:
    return bootstrap_legacy_history(
        packages or {"standalone": STANDALONE, "combined": COMBINED},
        **BOOTSTRAP,
    )


def _package_snapshot(active: int = 0, withdrawn: int = 0) -> dict:
    return {
        "contentFingerprintSha256": "a" * 64,
        "activeNoteCount": active,
        "withdrawalNoteCount": withdrawn,
        "totalNoteCount": active + withdrawn,
        "scheduledCardCount": active + withdrawn,
    }


def _identity(uid: str = "qb_alpha_001", identity: str = "base") -> dict:
    return {
        "namespace": "qbank",
        "uid": uid,
        "identity": identity,
        "guid": legacy_qbank_guid(uid, identity),
        "kind": "qbank",
        "model": {"id": 1607392901, "name": "PCL Vignette (Moss)"},
        "deck": {
            "id": 2059400191,
            "name": "Psychiatry Clerkship Library (Moss)",
        },
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
        "template": {"id": None, "name": "Card 1", "ordinal": 0},
        "firstShippedReleaseId": "release-n",
        "origin": "governed",
    }


def _membership(entry: dict, *, status: str = "active", digest: str = "b") -> dict:
    return {
        "namespace": entry["namespace"],
        "uid": entry["uid"],
        "identity": entry["identity"],
        "status": status,
        "approvedCardSha256": digest * 64,
        "shippedCardSha256": digest * 64,
        "templateVersion": "pcl-qbank-legacy-v1",
        "artifacts": [
            {
                "filename": "psychiatry_clerkship_qbank.apkg",
                "deckId": entry["deck"]["id"],
                "deckName": entry["deck"]["name"],
            }
        ],
    }


def _release(
    release_id: str,
    entries: tuple[dict, ...],
    *,
    status: str = "active",
    digest: str = "b",
) -> dict:
    return {
        "releaseId": release_id,
        "releaseDate": "2026-07-14",
        "releaseEpoch": 1783987200 + (0 if release_id == "release-n" else 1),
        "governedInputSha256": "d" * 64,
        "packages": {
            "psychiatry_clerkship_ms3_core.apkg": _package_snapshot(),
            "psychiatry_clerkship_ms3_application.apkg": _package_snapshot(),
            "psychiatry_clerkship_ms3_complete.apkg": _package_snapshot(),
            "psychiatry_clerkship_qbank.apkg": _package_snapshot(active=len(entries)),
        },
        "csv": {
            "filename": "psychiatry_clerkship_ms3_cards.csv",
            "sha256": "e" * 64,
            "sizeBytes": 0,
        },
        "receiptContractSha256": "f" * 64,
        "migrationSeedReleaseId": "legacy-qbank-2026-07-12",
        "migrationContractSha256": "1" * 64,
        "memberships": [
            _membership(entry, status=status, digest=digest) for entry in entries
        ],
    }


def _registry(
    entries: tuple[dict, ...] | None = None,
    releases: tuple[dict, ...] | None = None,
) -> HistoryRegistry:
    entries = entries or (_identity(),)
    releases = releases or (_release("release-n", entries),)
    return HistoryRegistry(identity_entries=entries, releases=releases)


def _codes(issues) -> set[str]:
    return {issue.code for issue in issues}


def test_bootstrap_reads_both_real_apkg_sqlite_collections_exactly():
    history = _bootstrap()
    value = history_to_dict(history)

    assert len(history.identity_entries) == 168
    assert len({(e["namespace"], e["uid"], e["identity"]) for e in history.identity_entries}) == 168
    assert sum(e["identity"] == "base" for e in history.identity_entries) == 143
    assert sum(e["identity"] == "tier2" for e in history.identity_entries) == 25
    assert {e["origin"] for e in history.identity_entries} == {"legacy_pre_governance"}
    assert len(history.releases) == 1
    release = history.releases[0]
    assert release["releaseId"] == BOOTSTRAP["release_id"]
    assert release["releaseDate"] == "2026-07-12"
    assert release["releaseEpoch"] == 1783902620
    assert len(release["memberships"]) == 168
    assert value["schemaVersion"] == 1

    by_key = {
        (entry["namespace"], entry["uid"], entry["identity"]): entry
        for entry in history.identity_entries
    }
    qb = by_key[("qbank", "qb_pha_002", "base")]
    assert qb["guid"] == "x9m9qM{_w7" == legacy_qbank_guid("qb_pha_002")
    assert qb["model"] == {"id": 1607392901, "name": "PCL Vignette (Moss)"}
    assert qb["deck"]["id"] == 2059400191
    assert [field["name"] for field in qb["fields"]] == [
        "UID", "Question", "Options", "Answer", "Why", "Pearl", "Evidence", "Link", "Meta"
    ]
    member = next(m for m in release["memberships"] if m["uid"] == "qb_pha_002")
    assert member["approvedCardSha256"] is None
    assert len(member["shippedCardSha256"]) == 64
    assert [(a["filename"], a["deckId"]) for a in member["artifacts"]] == [
        ("psychiatry_clerkship_library.apkg", 2059400191),
        ("psychiatry_clerkship_library_ALL.apkg", 2059400193),
    ]
    assert [a["artifactSha256"] for a in member["artifacts"]] == [
        "07cb14cad54454dc26e441b33058fa4778e515ba0f43cd79881101d0f3c9dfc5",
        "6dea77467f1afdde8996048b959c7d7ca5517322ae3905b4846967b7500771b3",
    ]
    assert release["packages"]["psychiatry_clerkship_qbank.apkg"]["totalNoteCount"] == 168
    assert release["packages"]["psychiatry_clerkship_ms3_complete.apkg"]["totalNoteCount"] == 309


def _mutate_apkg(source: Path, out: Path, mutation: str) -> None:
    with ZipFile(source) as archive:
        collection = archive.read("collection.anki2")
        media = archive.read("media")
    database = out.with_suffix(".anki2")
    database.write_bytes(collection)
    connection = sqlite3.connect(database)
    try:
        models_raw, decks_raw = connection.execute("select models, decks from col").fetchone()
        models, decks = json.loads(models_raw), json.loads(decks_raw)
        qmodel = models["1607392901"]
        if mutation == "model":
            qmodel["name"] += " drift"
        elif mutation == "deck":
            qdeck = "2059400191" if source == STANDALONE else "2059400193"
            decks[qdeck]["name"] += " drift"
        elif mutation == "template":
            qmodel["tmpls"][0]["qfmt"] += " drift"
        elif mutation == "field-order":
            qmodel["flds"][0], qmodel["flds"][1] = qmodel["flds"][1], qmodel["flds"][0]
        elif mutation == "guid":
            connection.execute(
                "update notes set guid = 'wrong-guid' where id = (select min(id) from notes where mid=1607392901)"
            )
        elif mutation == "overlap":
            connection.execute(
                "update notes set flds = flds || ' drift' where id = (select min(id) from notes where mid=1607392901)"
            )
        elif mutation == "package-count":
            note_id = connection.execute("select min(id) from notes where mid=1607392901").fetchone()[0]
            connection.execute("delete from cards where nid = ?", (note_id,))
            connection.execute("delete from notes where id = ?", (note_id,))
        else:
            raise AssertionError(mutation)
        connection.execute(
            "update col set models=?, decks=?", (json.dumps(models), json.dumps(decks))
        )
        connection.commit()
    finally:
        connection.close()
    with ZipFile(out, "w", compression=ZIP_DEFLATED) as archive:
        archive.write(database, "collection.anki2")
        archive.writestr("media", media)


@pytest.mark.parametrize(
    "mutation,target",
    [
        ("model", "standalone"),
        ("deck", "standalone"),
        ("template", "standalone"),
        ("field-order", "standalone"),
        ("guid", "standalone"),
        ("overlap", "combined"),
        ("package-count", "combined"),
    ],
)
def test_bootstrap_rejects_every_frozen_package_contract_mutation(tmp_path, mutation, target):
    changed = tmp_path / f"{target}.apkg"
    source = STANDALONE if target == "standalone" else COMBINED
    _mutate_apkg(source, changed, mutation)
    packages = {"standalone": STANDALONE, "combined": COMBINED}
    packages[target] = changed

    with pytest.raises(LegacyBootstrapError):
        _bootstrap(packages)


def test_bootstrap_requires_both_named_independent_packages_and_exact_hashes(tmp_path):
    with pytest.raises(LegacyBootstrapError):
        _bootstrap({"standalone": STANDALONE})
    corrupted = tmp_path / "legacy.apkg"
    corrupted.write_bytes(STANDALONE.read_bytes() + b"tampered")
    with pytest.raises(LegacyBootstrapError, match="SHA-256"):
        _bootstrap({"standalone": corrupted, "combined": COMBINED})


def test_validate_history_accepts_only_canonical_prefix_appends():
    baseline = _registry()
    copy_update = deepcopy(baseline.releases[0])
    copy_update.update(
        releaseId="release-n-plus-1",
        releaseDate="2026-07-15",
        releaseEpoch=1783987201,
    )
    copy_update["memberships"][0]["approvedCardSha256"] = "c" * 64
    copy_update["memberships"][0]["shippedCardSha256"] = "c" * 64
    current = HistoryRegistry(
        identity_entries=baseline.identity_entries,
        releases=(*baseline.releases, copy_update),
    )

    assert validate_history(current, baseline) == []
    assert len(current.identity_entries) == 1
    assert current.releases[-1]["memberships"][0]["approvedCardSha256"] == "c" * 64

    mutated = deepcopy(current)
    mutated.releases[0]["memberships"][0]["shippedCardSha256"] = "0" * 64
    assert "HISTORY_RELEASE_PREFIX_CHANGED" in _codes(validate_history(mutated, baseline))


@pytest.mark.parametrize(
    "path,value",
    [
        (("kind",), "basic"),
        (("model", "id"), 42),
        (("deck", "id"), 42),
        (("template", "ordinal"), 1),
        (("guid",), "changed-guid"),
        (("fields",), [{"name": "Question", "id": None}, {"name": "UID", "id": None}]),
    ],
)
def test_validate_history_rejects_immutable_identity_mutation(path, value):
    baseline = _registry()
    changed = deepcopy(baseline)
    target = changed.identity_entries[0]
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    assert "HISTORY_IDENTITY_PREFIX_CHANGED" in _codes(validate_history(changed, baseline))


def test_validate_history_keeps_base_and_tier2_unique_and_rejects_duplicates():
    base = _identity()
    tier2 = _identity(identity="tier2")
    valid = _registry(entries=(base, tier2), releases=(_release("release-n", (base, tier2)),))
    assert validate_history(valid) == []
    duplicate = HistoryRegistry(
        identity_entries=(*valid.identity_entries, deepcopy(base)),
        releases=valid.releases,
    )
    assert "HISTORY_IDENTITY_DUPLICATE" in _codes(validate_history(duplicate))


def test_validate_history_rejects_release_or_membership_duplicates_and_reactivation():
    entry = _identity()
    withdrawn = _release("release-n", (entry,), status="withdrawn")
    withdrawn["memberships"][0].update(
        withdrawalDisposition="quarantined",
        governanceDecisionSha256="d" * 64,
    )
    reactivated = _release("release-n-plus-1", (entry,), status="active", digest="c")
    history = _registry(entries=(entry,), releases=(withdrawn, reactivated))
    codes = _codes(validate_history(history))
    assert "HISTORY_WITHDRAWAL_NEVER_SHIPPED" in codes
    assert "HISTORY_QUARANTINE_REACTIVATION_UNREVIEWED" in codes

    duplicate_release = replace(history, releases=(withdrawn, deepcopy(withdrawn)))
    assert "HISTORY_RELEASE_DUPLICATE" in _codes(validate_history(duplicate_release))
    duplicate_member = deepcopy(withdrawn)
    duplicate_member["memberships"].append(deepcopy(duplicate_member["memberships"][0]))
    assert "HISTORY_MEMBERSHIP_DUPLICATE" in _codes(
        validate_history(_registry(entries=(entry,), releases=(duplicate_member,)))
    )


def test_null_approval_is_limited_to_the_bootstrap_release_membership():
    entry = _identity()
    entry["origin"] = "legacy_pre_governance"
    entry["firstShippedReleaseId"] = "legacy-qbank-2026-07-12"
    bootstrap = _release("release-n", (entry,))
    bootstrap["releaseId"] = "legacy-qbank-2026-07-12"
    bootstrap["memberships"][0]["approvedCardSha256"] = None
    later = deepcopy(_release("release-n-plus-1", (entry,), digest="c"))
    later["memberships"][0]["approvedCardSha256"] = None
    history = _registry(entries=(entry,), releases=(bootstrap, later))

    assert "HISTORY_GOVERNED_APPROVAL_MISSING" in _codes(validate_history(history))


def test_reviewed_corrected_quarantine_can_reactivate_but_retirement_cannot():
    entry = _identity()
    active = _release("release-n", (entry,))
    quarantined = _release("release-n-plus-1", (entry,), status="withdrawn", digest="c")
    quarantined["memberships"][0].update(
        withdrawalDisposition="quarantined",
        governanceDecisionSha256="d" * 64,
    )
    corrected = _release("release-n-plus-2", (entry,), digest="e")
    corrected["releaseEpoch"] = quarantined["releaseEpoch"] + 1
    corrected["memberships"][0].update(
        reactivatesReleaseId="release-n-plus-1",
        reactivationDecisionSha256="d" * 64,
    )
    reviewed = _registry(
        entries=(entry,), releases=(active, quarantined, corrected)
    )
    assert validate_history(reviewed) == []

    retired = deepcopy(reviewed)
    retired.releases[1]["memberships"][0]["withdrawalDisposition"] = "retired"
    assert "HISTORY_RETIRED_REACTIVATED" in _codes(validate_history(retired))


def _candidate_note() -> RenderedNote:
    return RenderedNote(
        namespace="core",
        uid="ms3_w01_safety_001",
        identity="base",
        guid="core-guid",
        deck_id=2059400201,
        model_id=1740112001,
        template_ordinal=0,
        fields=("ms3_w01_safety_001", "Question", "Answer", "", "", "", "", "Meta"),
        tags=("PsychClerkship", "Status::active", "UID::ms3_w01_safety_001"),
        front_html="Question",
        back_html="Answer",
        template_contract_sha256="2" * 64,
        render_sha256="3" * 64,
        active=True,
        withdrawn=False,
    )


def _proposal_inputs() -> tuple[InspectionResult, MigrationResult, CandidateRelease]:
    note = _candidate_note()
    package = _package_snapshot(active=1)
    receipt = {
        "packages": {
            "psychiatry_clerkship_ms3_core.apkg": package,
            "psychiatry_clerkship_ms3_application.apkg": _package_snapshot(),
            "psychiatry_clerkship_ms3_complete.apkg": package,
            "psychiatry_clerkship_qbank.apkg": _package_snapshot(),
        },
        "csv": {
            "filename": "psychiatry_clerkship_ms3_cards.csv",
            "sha256": "4" * 64,
            "sizeBytes": 123,
        },
        "receiptContractSha256": "5" * 64,
    }
    inspection = InspectionResult(
        snapshots={
            "psychiatry_clerkship_ms3_core.apkg": PackageSnapshot(
                path=Path("core.apkg"), models={}, decks={}, notes=(), cards=()
            )
        },
        receipt=receipt,
        identity_fingerprints={("core", note.uid, "base"): "6" * 64},
        artifact_sha256={"psychiatry_clerkship_ms3_core.apkg": "7" * 64},
        issues=(),
    )
    migration = MigrationResult(
        seed_release_id="legacy-qbank-2026-07-12",
        seed_mode="legacy",
        contract_sha256="8" * 64,
        issues=(),
    )
    candidate = CandidateRelease(
        release_id="release-alpha",
        release_date=date(2026, 7, 15),
        release_epoch=1784073600,
        governed_input_sha256="9" * 64,
        evaluated_at=date(2026, 7, 15),
        core_active=(note,),
        application_active=(),
        qbank_active=(),
        withdrawals=(),
        quarantine=QuarantineResult(new=(), changed=(), accepted=(), resolved=()),
        coverage={},
        issues=(),
    )
    return inspection, migration, candidate


def test_history_proposal_binds_stable_inspection_migration_and_governed_inputs():
    inspection, migration, candidate = _proposal_inputs()
    append = propose_history_append(
        inspection, migration, candidate, HistoryRegistry((), ())
    )

    assert len(append.new_identity_entries) == 1
    assert append.release_record["governedInputSha256"] == "9" * 64
    assert append.release_record["packages"] == inspection.receipt["packages"]
    assert append.release_record["csv"] == inspection.receipt["csv"]
    assert append.release_record["receiptContractSha256"] == "5" * 64
    assert append.release_record["migrationSeedReleaseId"] == migration.seed_release_id
    assert append.release_record["migrationContractSha256"] == migration.contract_sha256
    member = append.release_record["memberships"][0]
    assert member["approvedCardSha256"] == candidate.core_active[0].render_sha256
    assert member["shippedCardSha256"] == "6" * 64
    assert "artifactSha256" not in member["artifacts"][0]


@pytest.mark.parametrize("source", ["inspection", "migration"])
def test_history_proposal_refuses_any_upstream_hard_issue(source):
    inspection, migration, candidate = _proposal_inputs()
    issue = Issue("FAILED", "hard", source, "synthetic failure")
    if source == "inspection":
        inspection = replace(inspection, issues=(issue,))
    else:
        migration = replace(migration, issues=(issue,))
    with pytest.raises(HistoryError, match="FAILED"):
        propose_history_append(inspection, migration, candidate, HistoryRegistry((), ()))


def test_history_proposal_refuses_unverified_withdrawal_representation():
    inspection, migration, candidate = _proposal_inputs()
    withdrawal = replace(
        candidate.core_active[0], active=False, withdrawn=True, render_sha256="a" * 64
    )
    candidate = replace(candidate, core_active=(), withdrawals=(withdrawal,))
    with pytest.raises(HistoryError, match="verified Withdrawal representation"):
        propose_history_append(
            inspection, migration, candidate, HistoryRegistry((), ())
        )


def test_history_proposal_reconstructs_neutral_withdrawal_and_rejects_old_content():
    inspection, migration, candidate = _proposal_inputs()
    first = propose_history_append(
        inspection, migration, candidate, HistoryRegistry((), ())
    )
    current = HistoryRegistry(first.new_identity_entries, (first.release_record,))
    old_clinical_content = replace(
        candidate.core_active[0],
        fields=(
            "ms3_w01_safety_001",
            "OLD CLINICAL CONTENT",
            "OLD CLINICAL ANSWER",
            "",
            "",
            "",
            "",
            "Meta",
        ),
        tags=(
            "PsychClerkship",
            "Status::withdrawn",
            "UID::ms3_w01_safety_001",
        ),
        front_html="OLD CLINICAL CONTENT",
        back_html="OLD CLINICAL ANSWER",
        render_sha256="a" * 64,
        active=False,
        withdrawn=True,
    )
    candidate = replace(
        candidate,
        release_id="release-beta",
        release_date=date(2026, 7, 16),
        release_epoch=candidate.release_epoch + 1,
        core_active=(),
        withdrawals=(old_clinical_content,),
    )

    with pytest.raises(HistoryError, match="verified Withdrawal representation"):
        propose_history_append(inspection, migration, candidate, current)


def _reviewed_withdrawal_setup():
    inspection, migration, candidate = _proposal_inputs()
    first = propose_history_append(
        inspection, migration, candidate, HistoryRegistry((), ())
    )
    current = HistoryRegistry(first.new_identity_entries, (first.release_record,))
    decision = {
        "namespace": "core",
        "uid": candidate.core_active[0].uid,
        "identity": "base",
        "reasonCode": "SYNTHETIC_SAFETY_WITHDRAWAL",
        "subjectSha256": "a" * 64,
        "sourcePath": "synthetic/source.md",
        "firstSeenCommit": "ad7dd2851f4621a4177cd4ce34438af3751620d6",
        "reviewOwner": "Named Faculty Owner",
        "disposition": "withdraw",
        "reviewedBy": "Named Faculty Reviewer",
        "reviewedAt": "2026-07-16",
        "affectedReleaseId": "release-alpha",
        "withdrawalTemplateVersion": WITHDRAWAL_TEMPLATE_VERSION,
    }
    preview = preview_withdrawals(current, (decision,))[0]
    decision["approvedWithdrawalSha256"] = preview.render_sha256
    finding = QuarantineFinding(
        namespace="core",
        uid=candidate.core_active[0].uid,
        identity="base",
        reason_code=decision["reasonCode"],
        subject_sha256=decision["subjectSha256"],
        source_path=decision["sourcePath"],
        first_seen_commit=decision["firstSeenCommit"],
        withdrawal_render_sha256=preview.render_sha256,
    )
    reconciled = reconcile_quarantines(
        (finding,),
        {"accepted": [decision]},
        release_history={"releases": current.releases},
    )
    canonical = build_withdrawals(current, reconciled)[0]
    rendered = RenderedNote(
        namespace=canonical.namespace,
        uid=canonical.uid,
        identity=canonical.identity,
        guid=canonical.guid,
        deck_id=canonical.deck_id,
        model_id=canonical.model_id,
        template_ordinal=canonical.template_ordinal,
        fields=canonical.fields,
        tags=canonical.tags,
        front_html=canonical.fields[1],
        back_html=canonical.fields[2],
        template_contract_sha256=canonical.template_contract_sha256,
        render_sha256=canonical.render_sha256,
        active=False,
        withdrawn=True,
    )
    return (
        inspection,
        migration,
        candidate,
        current,
        decision,
        finding,
        reconciled,
        canonical,
        rendered,
    )


def test_shipped_retire_requires_exact_neutral_overwrite_approval():
    inspection, migration, candidate, current, decision, finding, _, _, _ = (
        _reviewed_withdrawal_setup()
    )
    retirement = {
        key: value
        for key, value in decision.items()
        if key
        not in {
            "affectedReleaseId",
            "withdrawalTemplateVersion",
            "approvedWithdrawalSha256",
        }
    }
    retirement["disposition"] = "retire"

    result = reconcile_quarantines(
        (finding,),
        {"accepted": [retirement]},
        release_history={"releases": current.releases},
    )

    assert result.accepted == ()
    assert result.changed == (finding,)
    assert result.withdrawal_proofs == ()
    omitted = replace(
        candidate,
        release_id="release-beta",
        release_date=date(2026, 7, 16),
        release_epoch=candidate.release_epoch + 1,
        core_active=(),
        quarantine=result,
    )
    with pytest.raises(HistoryError, match="latest-active shipped identity"):
        propose_history_append(inspection, migration, omitted, current)


def test_history_proposal_rejects_omitted_latest_active_shipped_identity():
    inspection, migration, candidate, current, *_ = _reviewed_withdrawal_setup()
    omitted = replace(
        candidate,
        release_id="release-beta",
        release_date=date(2026, 7, 16),
        release_epoch=candidate.release_epoch + 1,
        core_active=(),
    )

    with pytest.raises(HistoryError, match="latest-active shipped identity"):
        propose_history_append(inspection, migration, omitted, current)


def test_exact_shipped_retirement_records_permanent_disposition():
    (
        inspection,
        migration,
        candidate,
        current,
        decision,
        finding,
        _,
        _,
        _,
    ) = _reviewed_withdrawal_setup()
    retirement = {**decision, "disposition": "retire"}
    reconciled = reconcile_quarantines(
        (finding,),
        {"accepted": [retirement]},
        release_history={"releases": current.releases},
    )
    canonical = build_withdrawals(current, reconciled)[0]
    retired = replace(
        candidate,
        release_id="release-beta",
        release_date=date(2026, 7, 16),
        release_epoch=candidate.release_epoch + 1,
        core_active=(),
        withdrawals=(canonical,),
        quarantine=reconciled,
    )

    append = propose_history_append(inspection, migration, retired, current)

    assert append.release_record["memberships"][0]["withdrawalDisposition"] == "retired"


def test_fabricated_nominal_proof_without_governed_inputs_cannot_withdraw():
    (
        inspection,
        migration,
        candidate,
        current,
        _,
        finding,
        reconciled,
        canonical,
        _,
    ) = _reviewed_withdrawal_setup()
    forged = replace(reconciled.withdrawal_proofs[0], decision_sha256="f" * 64)
    fabricated = QuarantineResult(
        new=(),
        changed=(),
        accepted=(finding,),
        resolved=(),
        withdrawal_proofs=(forged,),
    )
    candidate = replace(
        candidate,
        release_id="release-beta",
        release_date=date(2026, 7, 16),
        release_epoch=candidate.release_epoch + 1,
        core_active=(),
        withdrawals=(canonical,),
        quarantine=fabricated,
    )

    with pytest.raises(HistoryError, match="governed reconciliation inputs"):
        propose_history_append(inspection, migration, candidate, current)


def test_current_proof_cannot_be_reused_as_forged_resolved_reactivation():
    (
        inspection,
        migration,
        candidate,
        current,
        _,
        finding,
        reconciled,
        canonical,
        _,
    ) = _reviewed_withdrawal_setup()
    withdrawal_candidate = replace(
        candidate,
        release_id="release-beta",
        release_date=date(2026, 7, 16),
        release_epoch=candidate.release_epoch + 1,
        core_active=(),
        withdrawals=(canonical,),
        quarantine=reconciled,
    )
    withdrawal_append = propose_history_append(
        inspection, migration, withdrawal_candidate, current
    )
    withdrawn_history = HistoryRegistry(
        current.identity_entries,
        (*current.releases, withdrawal_append.release_record),
    )
    forged_resolved = QuarantineResult(
        new=(),
        changed=(),
        accepted=(),
        resolved=(finding,),
        resolved_withdrawal_proofs=reconciled.withdrawal_proofs,
    )
    corrected = replace(
        candidate,
        release_id="release-gamma",
        release_date=date(2026, 7, 17),
        release_epoch=candidate.release_epoch + 2,
        quarantine=forged_resolved,
    )

    with pytest.raises(HistoryError, match="governed reconciliation inputs"):
        propose_history_append(inspection, migration, corrected, withdrawn_history)


def test_withdrawal_rendered_note_cannot_hide_old_front_or_back_content():
    (
        inspection,
        migration,
        candidate,
        current,
        _,
        _,
        reconciled,
        _,
        rendered,
    ) = _reviewed_withdrawal_setup()
    old_preview = replace(
        rendered,
        front_html="OLD CLINICAL CONTENT",
        back_html="OLD CLINICAL ANSWER",
    )
    candidate = replace(
        candidate,
        release_id="release-beta",
        release_date=date(2026, 7, 16),
        release_epoch=candidate.release_epoch + 1,
        core_active=(),
        withdrawals=(old_preview,),
        quarantine=reconciled,
    )

    with pytest.raises(HistoryError, match="verified Withdrawal representation"):
        propose_history_append(inspection, migration, candidate, current)


def test_history_proposal_records_task5_proof_and_allows_reviewed_correction():
    (
        inspection,
        migration,
        candidate,
        current,
        decision,
        _,
        reconciled,
        canonical,
        _,
    ) = _reviewed_withdrawal_setup()
    withdrawal_candidate = replace(
        candidate,
        release_id="release-beta",
        release_date=date(2026, 7, 16),
        release_epoch=candidate.release_epoch + 1,
        core_active=(),
        withdrawals=(canonical,),
        quarantine=reconciled,
    )
    withdrawal_append = propose_history_append(
        inspection, migration, withdrawal_candidate, current
    )
    member = withdrawal_append.release_record["memberships"][0]
    assert member["withdrawalDisposition"] == "quarantined"
    assert (
        member["governanceDecisionSha256"]
        == reconciled.withdrawal_proofs[0].decision_sha256
    )

    withdrawn_history = HistoryRegistry(
        current.identity_entries,
        (*current.releases, withdrawal_append.release_record),
    )
    resolved = reconcile_quarantines(
        (),
        {"accepted": [decision]},
        release_history={"releases": withdrawn_history.releases},
    )
    corrected = replace(
        candidate,
        release_id="release-gamma",
        release_date=date(2026, 7, 17),
        release_epoch=candidate.release_epoch + 2,
        quarantine=resolved,
    )
    corrected_append = propose_history_append(
        inspection, migration, corrected, withdrawn_history
    )
    corrected_member = corrected_append.release_record["memberships"][0]
    assert corrected_member["reactivatesReleaseId"] == "release-beta"
    assert (
        corrected_member["reactivationDecisionSha256"]
        == member["governanceDecisionSha256"]
    )


def _git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=repo, text=True, capture_output=True, check=check
    )


def _commit(repo: Path, message: str) -> str:
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", message)
    return _git(repo, "rev-parse", "HEAD").stdout.strip()


def _init_git_repo(path: Path) -> tuple[Path, str, HistoryRegistry, str]:
    path.mkdir(parents=True)
    _git(path, "init", "-b", "main")
    _git(path, "config", "user.email", "anki-test@example.invalid")
    _git(path, "config", "user.name", "Anki Test")
    fixture_dir = path / "tests/anki/fixtures"
    fixture_dir.mkdir(parents=True)
    shutil.copy2(STANDALONE, fixture_dir / STANDALONE.name)
    shutil.copy2(COMBINED, fixture_dir / COMBINED.name)
    (path / "README.md").write_text("synthetic history repository\n", encoding="utf-8")
    absent_base = _commit(path, "base without history")
    history = bootstrap_legacy_history(
        {
            "standalone": fixture_dir / STANDALONE.name,
            "combined": fixture_dir / COMBINED.name,
        },
        **BOOTSTRAP,
    )
    write_history(path / HISTORY_PATH, history)
    bootstrap_commit = _commit(path, "bootstrap legacy history")
    return path, absent_base, history, bootstrap_commit


def _append_synthetic_release(history: HistoryRegistry, release_id: str, marker: str = "a") -> HistoryRegistry:
    release = deepcopy(history.releases[-1])
    release.update(
        releaseId=release_id,
        releaseDate="2026-07-15",
        releaseEpoch=history.releases[-1]["releaseEpoch"] + 1,
        governedInputSha256=marker * 64,
        receiptContractSha256=("b" if marker != "b" else "c") * 64,
        migrationContractSha256=("c" if marker != "c" else "d") * 64,
    )
    for membership in release["memberships"]:
        membership["approvedCardSha256"] = marker * 64
        membership["shippedCardSha256"] = marker * 64
    return HistoryRegistry(history.identity_entries, (*history.releases, release))


def test_first_pr_base_ref_requires_exact_independent_bootstrap(tmp_path):
    repo, absent_base, expected, _ = _init_git_repo(tmp_path / "repo")
    out = tmp_path / "baseline.json"

    assert prepare_history_baseline(repo, out, base_ref=absent_base) == out
    assert load_history(out) == HistoryRegistry((), ())

    current = repo / HISTORY_PATH
    value = json.loads(current.read_text(encoding="utf-8"))
    value["identityEntries"][0]["guid"] = "hand-edited"
    current.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    with pytest.raises(HistoryError, match="fresh legacy bootstrap"):
        prepare_history_baseline(repo, out, base_ref=absent_base)

    write_history(current, expected)
    assert prepare_history_baseline(repo, out, base_ref=absent_base) == out


@pytest.mark.parametrize("shape", ["squash", "merge", "rebase"])
def test_before_release_discovers_same_prior_registry_across_real_git_shapes(tmp_path, shape):
    repo, _, bootstrap, bootstrap_commit = _init_git_repo(tmp_path / shape)
    candidate = _append_synthetic_release(bootstrap, "release-alpha")

    if shape == "squash":
        write_history(repo / HISTORY_PATH, candidate)
        _commit(repo, "squashed release")
    elif shape == "merge":
        _git(repo, "checkout", "-b", "release")
        write_history(repo / HISTORY_PATH, candidate)
        _commit(repo, "release append")
        _git(repo, "checkout", "main")
        _git(repo, "merge", "--no-ff", "release", "-m", "merge release")
    else:
        _git(repo, "checkout", "-b", "release", bootstrap_commit)
        write_history(repo / HISTORY_PATH, candidate)
        _commit(repo, "release append")
        _git(repo, "checkout", "main")
        (repo / "README.md").write_text("rebased main\n", encoding="utf-8")
        _commit(repo, "advance main")
        _git(repo, "checkout", "release")
        _git(repo, "rebase", "main")

    out = tmp_path / f"{shape}-baseline.json"
    prepare_history_baseline(repo, out, before_release_id="release-alpha")
    assert load_history(out) == bootstrap

    lineage = tmp_path / f"{shape}-lineage.json"
    prepare_history_baseline(repo, lineage, audit_lineage=True)
    assert load_history(lineage) == candidate


def test_before_release_rejects_ambiguous_merge_ancestry(tmp_path):
    repo, _, bootstrap, bootstrap_commit = _init_git_repo(tmp_path / "ambiguous")
    _git(repo, "checkout", "-b", "side", bootstrap_commit)
    write_history(repo / HISTORY_PATH, _append_synthetic_release(bootstrap, "release-alpha", "a"))
    _commit(repo, "side release")
    _git(repo, "checkout", "main")
    write_history(repo / HISTORY_PATH, _append_synthetic_release(bootstrap, "release-alpha", "b"))
    _commit(repo, "main release")
    _git(repo, "merge", "-s", "ours", "--no-ff", "side", "-m", "ambiguous merge")

    with pytest.raises(HistoryError, match="ambiguous"):
        prepare_history_baseline(
            repo, tmp_path / "out.json", before_release_id="release-alpha"
        )


def test_lineage_rejects_non_prefix_transition_and_shallow_repository(tmp_path):
    repo, _, bootstrap, _ = _init_git_repo(tmp_path / "source")
    broken = replace(
        bootstrap, identity_entries=tuple(reversed(bootstrap.identity_entries))
    )
    write_history(repo / HISTORY_PATH, broken)
    _commit(repo, "rewrite history")
    with pytest.raises(HistoryError, match="append-only"):
        prepare_history_baseline(repo, tmp_path / "broken.json", audit_lineage=True)

    shallow = tmp_path / "shallow"
    _git(
        tmp_path,
        "clone",
        "--depth",
        "1",
        f"file://{repo}",
        str(shallow),
    )
    with pytest.raises(HistoryError, match="fetch full history"):
        prepare_history_baseline(shallow, tmp_path / "shallow.json", audit_lineage=True)


def test_baseline_requires_exactly_one_selector(tmp_path):
    repo, absent_base, _, _ = _init_git_repo(tmp_path / "selectors")
    out = tmp_path / "out.json"
    with pytest.raises(ValueError, match="exactly one"):
        prepare_history_baseline(repo, out)
    with pytest.raises(ValueError, match="exactly one"):
        prepare_history_baseline(
            repo,
            out,
            base_ref=absent_base,
            before_release_id="legacy-qbank-2026-07-12",
        )


def test_bootstrap_serialization_is_deterministic_and_schema_valid(tmp_path):
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    history = _bootstrap()
    write_history(first, history)
    write_history(second, _bootstrap())
    assert first.read_bytes() == second.read_bytes()
    assert canonical_json_bytes(history_to_dict(load_history(first))) == canonical_json_bytes(
        history_to_dict(history)
    )


def test_exact_bootstrap_cli_writes_the_same_registry(tmp_path):
    out = tmp_path / "release_history.json"
    result = subprocess.run(
        [
            sys.executable,
            str(BOOTSTRAP_CLI),
            "--package",
            f"standalone={STANDALONE}",
            "--package",
            f"combined={COMBINED}",
            "--source-commit",
            BOOTSTRAP["source_commit"],
            "--release-id",
            BOOTSTRAP["release_id"],
            "--released-at",
            BOOTSTRAP["shipped_at"].isoformat(),
            "--release-epoch",
            str(BOOTSTRAP["release_epoch"]),
            "--out",
            str(out),
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
    )
    assert result.returncode == 0, result.stderr
    assert load_history(out) == _bootstrap()
    assert "168 unique identities" in result.stdout


def test_baseline_cli_rejects_zero_or_combined_selectors_and_maps_all_modes(tmp_path):
    repo, absent_base, bootstrap, _ = _init_git_repo(tmp_path / "cli")
    out = tmp_path / "cli-baseline.json"

    zero = subprocess.run(
        [sys.executable, str(BASELINE_CLI), "--repo", str(repo), "--out", str(out)],
        text=True,
        capture_output=True,
    )
    assert zero.returncode == 2
    combined = subprocess.run(
        [
            sys.executable,
            str(BASELINE_CLI),
            "--repo",
            str(repo),
            "--out",
            str(out),
            "--base-ref",
            absent_base,
            "--audit-lineage",
        ],
        text=True,
        capture_output=True,
    )
    assert combined.returncode == 2

    base = subprocess.run(
        [
            sys.executable,
            str(BASELINE_CLI),
            "--repo",
            str(repo),
            "--out",
            str(out),
            "--base-ref",
            absent_base,
        ],
        text=True,
        capture_output=True,
    )
    assert base.returncode == 0, base.stderr
    assert load_history(out) == EMPTY_HISTORY

    candidate = _append_synthetic_release(bootstrap, "release-alpha")
    write_history(repo / HISTORY_PATH, candidate)
    _commit(repo, "candidate release")
    before = subprocess.run(
        [
            sys.executable,
            str(BASELINE_CLI),
            "--repo",
            str(repo),
            "--out",
            str(out),
            "--before-release-id",
            "release-alpha",
        ],
        text=True,
        capture_output=True,
    )
    assert before.returncode == 0, before.stderr
    assert load_history(out) == bootstrap

    lineage = subprocess.run(
        [
            sys.executable,
            str(BASELINE_CLI),
            "--repo",
            str(repo),
            "--out",
            str(out),
            "--audit-lineage",
        ],
        text=True,
        capture_output=True,
    )
    assert lineage.returncode == 0, lineage.stderr
    assert load_history(out) == candidate
