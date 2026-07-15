from copy import deepcopy
import csv
from dataclasses import replace
from datetime import date
from hashlib import sha256
import io
import json
from pathlib import Path
import sqlite3
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import pytest

from pcl_anki.contract import (
    APPLICATION_ARTIFACT_FILENAME,
    APPLICATION_DECK_ID,
    APPLICATION_FIELDS,
    APPLICATION_MODEL_ID,
    COMPLETE_ARTIFACT_FILENAME,
    CORE_ARTIFACT_FILENAME,
    CORE_BASIC_FIELDS,
    CORE_BASIC_MODEL_ID,
    CORE_CLOZE_MODEL_ID,
    CORE_DECK_ID,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    CandidateRelease,
    QBANK_ARTIFACT_FILENAME,
    QuarantineResult,
    RELEASE_ARTIFACT_FILENAMES,
    Withdrawal,
    canonical_json_sha256,
    core_guid,
    legacy_qbank_guid,
)
from pcl_anki.history import withdrawal_render_sha256
from pcl_anki.inspect import (
    PackageInspectionError,
    canonical_package_fingerprint,
    inspect_release,
    read_apkg,
    receipt_contract_sha256,
)
from pcl_anki.package import (
    CSV_ARTIFACT_FILENAME,
    RECEIPT_ARTIFACT_FILENAME,
    PackageWriteError,
    write_release,
)
from pcl_anki.qbank import qbank_item_sha256
from pcl_anki.render import (
    TEMPLATE_CONTRACTS,
    TEMPLATE_CONTRACT_SHA256,
    build_qbank_notes,
    render_card,
)


ALL_FILENAMES = {
    *RELEASE_ARTIFACT_FILENAMES,
    "psychiatry_clerkship_ms3_cards.csv",
    "anki_release_receipt.json",
}
EXPECTED_CSV_FIELDS = (
    "artifactRole",
    "namespace",
    "uid",
    "identity",
    "guid",
    "deckId",
    "modelId",
    "templateOrdinal",
    "fieldsJson",
    "tagsJson",
    "templateContractSha256",
    "renderSha256",
    "sourceUrl",
)


def _qbank_item() -> dict:
    return {
        "id": "qb_synthetic_001",
        "status": "attested",
        "type": "sba",
        "category": "otherdx",
        "competency": ["dx"],
        "difficulty": 1,
        "hy": True,
        "pages": ["synthetic-source.md"],
        "stem": "A synthetic marker appears. Which invented label fits?",
        "options": [
            {"key": "A", "t": "Condition Alpha", "c": True},
            {
                "key": "B",
                "t": "Condition Beta",
                "trap": {"name": "Synthetic trap", "note": "The marker differs."},
            },
            {
                "key": "C",
                "t": "Condition Gamma",
                "trap": {"name": "Timing trap", "note": "The timing differs."},
            },
            {
                "key": "D",
                "t": "Condition Delta",
                "trap": {"name": "Pattern trap", "note": "The pattern differs."},
            },
        ],
        "why": "The invented marker supports Condition Alpha.",
        "pearl": "Use the invented discriminator.",
        "evidence": "A synthetic reviewed source passage.",
    }


def _card(uid: str, *, kind: str = "basic", qbank_item: dict | None = None) -> dict:
    contract_key = "application" if kind == "application" else (
        "coreCloze" if kind == "cloze" else "coreBasic"
    )
    card = {
        "id": uid,
        "state": "approved",
        "kind": kind,
        "family": "ApplicationVignette" if kind == "application" else "Discriminator",
        "audience": "MS3",
        "week": 1,
        "domain": "Diagnosis",
        "task": "Discriminate",
        "risk": {"level": "Routine", "facets": []},
        "front": (
            "The synthetic marker is {{c1::feature alpha}}."
            if kind == "cloze"
            else "Which invented label matches feature alpha?"
        ),
        "answer": "Condition Alpha.",
        "explanation": "Feature alpha is the decisive invented clue.",
        "caveat": "Synthetic fixture only.",
        "source": {
            "path": "synthetic/source.md",
            "slug": "synthetic-source",
            "anchor": "feature-alpha",
            "url": "https://example.invalid/?page=synthetic-source#feature-alpha",
            "quote": "Feature alpha supports the invented label.",
            "quoteSha256": "a" * 64,
        },
        "render": {
            "templateVersion": TEMPLATE_CONTRACTS[contract_key]["templateVersion"],
            "templateContractSha256": TEMPLATE_CONTRACT_SHA256[contract_key],
        },
        "provenance": {"authoringMethod": "human", "authoringTool": None},
        "review": {"sequenceBasis": "weekly_map"},
        "reinforces": None,
        "supersedes": None,
    }
    if kind == "application":
        assert qbank_item is not None
        card["qbank"] = {
            "id": qbank_item["id"],
            "taskBundle": "Diagnosis",
            "primaryPage": "synthetic-source",
            "primaryAnchor": "feature-alpha",
            "approvedItemSha256": qbank_item_sha256(qbank_item),
            "primaryTrap": "Synthetic trap",
            "sourceAnchorSha256": "b" * 64,
        }
        card["reinforces"] = "synthetic_core_basic_001"
    return card


def _withdrawal() -> Withdrawal:
    uid = "synthetic_core_withdrawn_001"
    withdrawal = Withdrawal(
        namespace="core",
        uid=uid,
        identity="base",
        guid=core_guid(uid),
        deck_id=CORE_DECK_ID,
        deck_name="Psychiatry Clerkship MS3 (Moss)::Core Recall",
        model_id=CORE_BASIC_MODEL_ID,
        model_name="PCL MS3 Core Basic v2",
        template_id=8777453155042897990,
        template_name="Card 1",
        template_ordinal=0,
        field_names=tuple(name for name, _field_id in CORE_BASIC_FIELDS),
        field_ids=tuple(field_id for _name, field_id in CORE_BASIC_FIELDS),
        fields=(
            uid,
            '<span class="withdrawn">[WITHDRAWN SAFETY UPDATE]</span> This card is no longer active.',
            '<div class="withdrawn">Do not use the prior clinical content.</div>',
            "",
            "",
            "",
            "",
            "Anki safety release notice",
        ),
        tags=("PsychClerkship", "Status::withdrawn", f"UID::{uid}"),
        template_contract_sha256=TEMPLATE_CONTRACT_SHA256["coreBasic"],
        render_sha256="",
        reason_code="SHIPPED_IDENTITY_MISSING",
        affected_release_id="synthetic-prior-release",
        active=False,
        withdrawn=True,
    )
    return replace(withdrawal, render_sha256=withdrawal_render_sha256(withdrawal))


def _qbank_tier2_withdrawal() -> Withdrawal:
    uid = "qb_synthetic_withdrawn_001"
    withdrawal = Withdrawal(
        namespace="qbank",
        uid=uid,
        identity="tier2",
        guid=legacy_qbank_guid(uid, "tier2"),
        deck_id=LEGACY_QBANK_DECK_ID,
        deck_name="Psychiatry Clerkship Library (Moss)",
        model_id=LEGACY_QBANK_MODEL_ID,
        model_name="PCL Vignette (Moss)",
        template_id=None,
        template_name="Card 1",
        template_ordinal=0,
        field_names=LEGACY_QBANK_FIELDS,
        field_ids=(None,) * len(LEGACY_QBANK_FIELDS),
        fields=(
            uid,
            '<span class="withdrawn">[WITHDRAWN SAFETY UPDATE]</span> This card is no longer active.',
            "",
            '<div class="withdrawn">Do not use the prior clinical content.</div>',
            "",
            "",
            "",
            "Anki safety release notice",
            '<div class="tag">Withdrawn</div>',
        ),
        tags=("PsychClerkship", "Status::withdrawn", f"UID::{uid}"),
        template_contract_sha256=TEMPLATE_CONTRACT_SHA256["legacyQbank"],
        render_sha256="",
        reason_code="SHIPPED_IDENTITY_MISSING",
        affected_release_id="synthetic-prior-release",
        active=False,
        withdrawn=True,
    )
    return replace(withdrawal, render_sha256=withdrawal_render_sha256(withdrawal))


@pytest.fixture
def candidate() -> CandidateRelease:
    item = _qbank_item()
    basic = render_card(_card("synthetic_core_basic_001"))
    cloze = render_card(_card("synthetic_core_cloze_001", kind="cloze"))
    application = render_card(
        _card("synthetic_application_001", kind="application", qbank_item=item),
        qbank_item=item,
    )
    qbank = build_qbank_notes(item)
    return CandidateRelease(
        release_id="synthetic-2026-07-14",
        release_date=date(2026, 7, 14),
        release_epoch=1784059200,
        governed_input_sha256="9" * 64,
        governed_input_ledger=(
            ("13_Faculty_Resources/anki/cards.json", "1" * 64),
            ("question_bank.json", "2" * 64),
        ),
        evaluated_at=date(2026, 7, 14),
        core_active=(basic, cloze),
        application_active=(application,),
        qbank_active=qbank,
        withdrawals=(_withdrawal(),),
        quarantine=QuarantineResult((), (), (), ()),
        coverage={"core": {"W01|Diagnosis": 2}, "application": {"W01|Diagnosis": 1}},
        issues=(),
    )


def _note_tuples(snapshot):
    return {
        (note.guid, note.model_id, note.fields, note.tags)
        for note in snapshot.notes
    }


def _sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _stage_changed_receipt(out_dir: Path, receipt: dict, filename: str) -> dict:
    changed = deepcopy(receipt)
    path = out_dir / filename
    record = {"sha256": _sha256(path), "sizeBytes": path.stat().st_size}
    changed["artifacts"][filename] = record
    if filename == CSV_ARTIFACT_FILENAME:
        changed["csv"] = {"filename": filename, **record}
    changed["receiptContractSha256"] = receipt_contract_sha256(changed)
    (out_dir / RECEIPT_ARTIFACT_FILENAME).write_text(
        json.dumps(changed, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return changed


def test_write_release_writes_exact_six_governed_artifacts_and_real_sqlite(candidate, tmp_path):
    receipt = write_release(candidate, tmp_path)

    assert {path.name for path in tmp_path.iterdir()} == ALL_FILENAMES
    assert json.loads((tmp_path / RECEIPT_ARTIFACT_FILENAME).read_text()) == receipt
    assert receipt["releaseId"] == candidate.release_id
    assert receipt["releaseDate"] == candidate.release_date.isoformat()
    assert receipt["releaseEpoch"] == candidate.release_epoch
    assert receipt["governedInputSha256"] == candidate.governed_input_sha256
    assert receipt["governedInputLedger"] == [
        {"path": path, "sha256": digest}
        for path, digest in candidate.governed_input_ledger
    ]
    assert "gitCommit" not in receipt

    result = inspect_release(tmp_path, receipt)
    assert result.issues == ()
    assert set(result.snapshots) == set(RELEASE_ARTIFACT_FILENAMES)
    for filename, snapshot in result.snapshots.items():
        assert snapshot.notes
        assert snapshot.cards
        assert receipt["packages"][filename]["contentFingerprintSha256"] == (
            canonical_package_fingerprint(snapshot)
        )
        assert result.artifact_sha256[filename] == _sha256(tmp_path / filename)
        assert receipt["artifacts"][filename]["sha256"] == _sha256(tmp_path / filename)


def test_membership_union_identity_counts_and_no_qbank_in_complete(candidate, tmp_path):
    receipt = write_release(candidate, tmp_path)
    result = inspect_release(tmp_path, receipt)
    core = result.snapshots[CORE_ARTIFACT_FILENAME]
    application = result.snapshots[APPLICATION_ARTIFACT_FILENAME]
    complete = result.snapshots[COMPLETE_ARTIFACT_FILENAME]
    qbank = result.snapshots[QBANK_ARTIFACT_FILENAME]

    assert _note_tuples(complete) == _note_tuples(core) | _note_tuples(application)
    assert _note_tuples(core).isdisjoint(_note_tuples(application))
    assert not ({note.model_id for note in complete.notes} & {note.model_id for note in qbank.notes})
    for standalone in (core, application):
        for note in standalone.notes:
            assert next(item for item in complete.notes if item.guid == note.guid) == note
    assert receipt["packages"][CORE_ARTIFACT_FILENAME] == {
        "contentFingerprintSha256": canonical_package_fingerprint(core),
        "activeNoteCount": 2,
        "withdrawalNoteCount": 1,
        "totalNoteCount": 3,
        "scheduledCardCount": 3,
    }
    assert receipt["packages"][APPLICATION_ARTIFACT_FILENAME]["activeNoteCount"] == 1
    assert receipt["packages"][APPLICATION_ARTIFACT_FILENAME]["withdrawalNoteCount"] == 0
    assert receipt["packages"][COMPLETE_ARTIFACT_FILENAME]["totalNoteCount"] == 4
    assert receipt["packages"][QBANK_ARTIFACT_FILENAME]["activeNoteCount"] == len(
        candidate.qbank_active
    )


def test_stored_model_and_deck_sets_reject_unused_qbank_in_complete(candidate, tmp_path):
    receipt = write_release(candidate, tmp_path)
    snapshots = inspect_release(tmp_path, receipt).snapshots
    assert set(snapshots[CORE_ARTIFACT_FILENAME].models) == {
        CORE_BASIC_MODEL_ID,
        CORE_CLOZE_MODEL_ID,
    }
    assert set(snapshots[CORE_ARTIFACT_FILENAME].decks) == {1, CORE_DECK_ID}
    assert set(snapshots[APPLICATION_ARTIFACT_FILENAME].models) == {
        APPLICATION_MODEL_ID
    }
    assert set(snapshots[APPLICATION_ARTIFACT_FILENAME].decks) == {
        1,
        APPLICATION_DECK_ID,
    }
    assert set(snapshots[COMPLETE_ARTIFACT_FILENAME].models) == {
        CORE_BASIC_MODEL_ID,
        CORE_CLOZE_MODEL_ID,
        APPLICATION_MODEL_ID,
    }
    assert set(snapshots[COMPLETE_ARTIFACT_FILENAME].decks) == {
        1,
        CORE_DECK_ID,
        APPLICATION_DECK_ID,
    }
    assert set(snapshots[QBANK_ARTIFACT_FILENAME].models) == {
        LEGACY_QBANK_MODEL_ID
    }
    assert set(snapshots[QBANK_ARTIFACT_FILENAME].decks) == {
        1,
        LEGACY_QBANK_DECK_ID
    }
    assert all(snapshot.decks[1]["name"] == "Default" for snapshot in snapshots.values())

    qbank_models, qbank_decks = _raw_collection_contract(
        tmp_path / QBANK_ARTIFACT_FILENAME
    )

    def inject_unused_qbank(models, decks):
        models[str(LEGACY_QBANK_MODEL_ID)] = deepcopy(
            qbank_models[str(LEGACY_QBANK_MODEL_ID)]
        )
        decks[str(LEGACY_QBANK_DECK_ID)] = deepcopy(
            qbank_decks[str(LEGACY_QBANK_DECK_ID)]
        )

    complete_path = tmp_path / COMPLETE_ARTIFACT_FILENAME
    _rewrite_collection(complete_path, inject_unused_qbank)
    tampered = read_apkg(complete_path)
    changed_receipt = deepcopy(receipt)
    changed_receipt["packages"][COMPLETE_ARTIFACT_FILENAME] = {
        "contentFingerprintSha256": canonical_package_fingerprint(tampered),
        "activeNoteCount": 3,
        "withdrawalNoteCount": 1,
        "totalNoteCount": 4,
        "scheduledCardCount": 4,
    }
    changed_receipt = _stage_changed_receipt(
        tmp_path, changed_receipt, COMPLETE_ARTIFACT_FILENAME
    )

    result = inspect_release(tmp_path, changed_receipt)

    assert "PACKAGE_STORED_MEMBERSHIP" in {issue.code for issue in result.issues}


def test_withdrawal_is_neutral_history_backed_and_csv_is_active_core_application_only(
    candidate, tmp_path
):
    receipt = write_release(candidate, tmp_path)
    result = inspect_release(tmp_path, receipt)
    core = result.snapshots[CORE_ARTIFACT_FILENAME]
    withdrawn = next(note for note in core.notes if "Status::withdrawn" in note.tags)
    assert withdrawn.guid == candidate.withdrawals[0].guid
    assert withdrawn.fields == candidate.withdrawals[0].fields
    assert withdrawn.tags == tuple(sorted(candidate.withdrawals[0].tags))
    assert all(tag not in withdrawn.tags for tag in ("Status::active", "Audience::MS3"))

    csv_path = tmp_path / CSV_ARTIFACT_FILENAME
    rows = list(csv.DictReader(io.StringIO(csv_path.read_text(encoding="utf-8"))))
    assert len(rows) == len(candidate.core_active) + len(candidate.application_active)
    assert {row["namespace"] for row in rows} == {"core", "application"}
    assert {row["uid"] for row in rows}.isdisjoint({candidate.withdrawals[0].uid})
    assert all(row["artifactRole"] == "faculty_audit_interchange" for row in rows)
    assert receipt["csv"] == {
        "filename": CSV_ARTIFACT_FILENAME,
        "sha256": _sha256(csv_path),
        "sizeBytes": csv_path.stat().st_size,
    }


@pytest.mark.parametrize(
    "mutation",
    (
        "header",
        "reverse",
        "duplicate",
        "role",
        "namespace",
        "model",
        "fields_json",
        "fields_parity",
        "tags_json",
        "tags_parity",
        "ordinal",
        "template_hash",
        "render_hash",
        "source_url",
    ),
)
def test_inspection_rejects_self_consistently_rehashed_csv_semantic_tampering(
    candidate, tmp_path, mutation
):
    receipt = write_release(candidate, tmp_path)
    csv_path = tmp_path / CSV_ARTIFACT_FILENAME
    original = csv_path.read_text(encoding="utf-8")
    reader = csv.DictReader(io.StringIO(original))
    assert tuple(reader.fieldnames or ()) == EXPECTED_CSV_FIELDS
    rows = list(reader)

    if mutation == "header":
        changed_csv = original.replace("artifactRole,", "wrongRole,", 1)
    else:
        if mutation == "reverse":
            rows.reverse()
        elif mutation == "duplicate":
            rows.append(deepcopy(rows[0]))
        elif mutation == "role":
            rows[0]["artifactRole"] = "learner_export"
        elif mutation == "namespace":
            rows[0]["namespace"] = "qbank"
        elif mutation == "model":
            rows[0]["modelId"] = str(LEGACY_QBANK_MODEL_ID)
        elif mutation == "fields_json":
            rows[0]["fieldsJson"] = "{"
        elif mutation == "fields_parity":
            fields = json.loads(rows[0]["fieldsJson"])
            fields[1] += " tampered"
            rows[0]["fieldsJson"] = json.dumps(fields, separators=(",", ":"))
        elif mutation == "tags_json":
            rows[0]["tagsJson"] = "not-json"
        elif mutation == "tags_parity":
            tags = json.loads(rows[0]["tagsJson"])
            tags.remove("Status::active")
            rows[0]["tagsJson"] = json.dumps(tags, separators=(",", ":"))
        elif mutation == "ordinal":
            rows[0]["templateOrdinal"] = "1"
        elif mutation == "template_hash":
            rows[0]["templateContractSha256"] = "f" * 64
        elif mutation == "render_hash":
            rows[0]["renderSha256"] = "not-a-sha256"
        elif mutation == "source_url":
            rows[0]["sourceUrl"] = "https://example.invalid/wrong"
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(
            stream, fieldnames=EXPECTED_CSV_FIELDS, lineterminator="\n"
        )
        writer.writeheader()
        writer.writerows(rows)
        changed_csv = stream.getvalue()
    csv_path.write_text(changed_csv, encoding="utf-8")
    changed_receipt = _stage_changed_receipt(
        tmp_path, receipt, CSV_ARTIFACT_FILENAME
    )

    result = inspect_release(tmp_path, changed_receipt)

    assert "CSV_SEMANTIC_DRIFT" in {issue.code for issue in result.issues}


def test_qbank_tier2_withdrawal_keeps_history_guid_and_is_counted_separately(
    candidate, tmp_path
):
    withdrawal = _qbank_tier2_withdrawal()
    candidate = replace(candidate, withdrawals=(*candidate.withdrawals, withdrawal))

    receipt = write_release(candidate, tmp_path)
    result = inspect_release(tmp_path, receipt)

    assert result.issues == ()
    assert receipt["packages"][QBANK_ARTIFACT_FILENAME]["withdrawalNoteCount"] == 1
    assert ("qbank", withdrawal.uid, "tier2") in result.identity_fingerprints
    stored = next(
        note
        for note in result.snapshots[QBANK_ARTIFACT_FILENAME].notes
        if note.guid == withdrawal.guid
    )
    assert stored.fields == withdrawal.fields
    assert stored.tags == tuple(sorted(withdrawal.tags))


def test_exact_identity_fingerprints_bind_sqlite_fields_tags_and_template_contract(
    candidate, tmp_path
):
    receipt = write_release(candidate, tmp_path)
    result = inspect_release(tmp_path, receipt)
    for rendered in (
        *candidate.core_active,
        *candidate.application_active,
        *candidate.qbank_active,
        *candidate.withdrawals,
    ):
        key = (rendered.namespace, rendered.uid, rendered.identity)
        assert result.identity_fingerprints[key] == canonical_json_sha256(
            {
                "guid": rendered.guid,
                "modelId": rendered.model_id,
                "fields": rendered.fields,
                "tags": tuple(sorted(rendered.tags)),
                "templateContractSha256": rendered.template_contract_sha256,
            }
        )


def test_source_urls_in_sqlite_and_receipt_are_exact_approved_urls(candidate, tmp_path):
    receipt = write_release(candidate, tmp_path)
    result = inspect_release(tmp_path, receipt)
    expected = {"https://example.invalid/?page=synthetic-source#feature-alpha"}
    assert set(receipt["sourceUrls"]) == expected
    for filename in (CORE_ARTIFACT_FILENAME, APPLICATION_ARTIFACT_FILENAME):
        active = [
            note
            for note in result.snapshots[filename].notes
            if "Status::active" in note.tags
        ]
        assert active
        assert all(any(next(iter(expected)) in field for field in note.fields) for note in active)


def test_writer_rejects_missing_primary_tags_or_empty_packaged_faces(candidate, tmp_path):
    missing_tags = replace(candidate.core_active[0], tags=("PsychClerkship", "Status::active"))
    with pytest.raises(PackageWriteError, match="PACKAGE_ACTIVE_TAGS"):
        write_release(replace(candidate, core_active=(missing_tags, candidate.core_active[1])), tmp_path)

    empty_fields = list(candidate.core_active[0].fields)
    empty_fields[1] = ""
    empty_front = replace(candidate.core_active[0], fields=tuple(empty_fields))
    with pytest.raises(PackageWriteError, match="PACKAGE_EMPTY_FACE"):
        write_release(replace(candidate, core_active=(empty_front, candidate.core_active[1])), tmp_path)

    wrong_guid = replace(candidate.core_active[0], guid="not-the-governed-guid")
    with pytest.raises(PackageWriteError, match="PACKAGE_GUID_CONTRACT"):
        write_release(replace(candidate, core_active=(wrong_guid, candidate.core_active[1])), tmp_path)


def test_inspection_binds_receipt_source_url_set_to_actual_sqlite_fields(candidate, tmp_path):
    receipt = write_release(candidate, tmp_path)
    changed = deepcopy(receipt)
    changed["sourceUrls"] = ["https://example.invalid/wrong"]
    changed["receiptContractSha256"] = receipt_contract_sha256(changed)
    (tmp_path / RECEIPT_ARTIFACT_FILENAME).write_text(
        json.dumps(changed, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    result = inspect_release(tmp_path, changed)

    assert "PACKAGE_SOURCE_URL_DRIFT" in {issue.code for issue in result.issues}


def test_semantically_identical_builds_keep_fingerprint_and_receipt_contract(candidate, tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    first_receipt = write_release(candidate, first)
    second_receipt = write_release(candidate, second)
    changed_package = second / CORE_ARTIFACT_FILENAME
    with ZipFile(changed_package) as source:
        members = [(member.filename, source.read(member.filename)) for member in source.infolist()]
    with ZipFile(changed_package, "w", ZIP_DEFLATED) as target:
        for name, value in members:
            target.writestr(ZipInfo(name, date_time=(2020, 1, 2, 3, 4, 6)), value)
    second_receipt["artifacts"][CORE_ARTIFACT_FILENAME] = {
        "sha256": _sha256(changed_package),
        "sizeBytes": changed_package.stat().st_size,
    }
    (second / RECEIPT_ARTIFACT_FILENAME).write_text(
        json.dumps(second_receipt, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    first_result = inspect_release(first, first_receipt)
    second_result = inspect_release(second, second_receipt)
    for filename in RELEASE_ARTIFACT_FILENAMES:
        assert canonical_package_fingerprint(first_result.snapshots[filename]) == (
            canonical_package_fingerprint(second_result.snapshots[filename])
        )
        assert first_receipt["artifacts"][filename]["sha256"] == _sha256(first / filename)
        assert second_receipt["artifacts"][filename]["sha256"] == _sha256(second / filename)
    assert first_receipt["receiptContractSha256"] == second_receipt["receiptContractSha256"]
    assert any(
        first_receipt["artifacts"][name]["sha256"]
        != second_receipt["artifacts"][name]["sha256"]
        for name in RELEASE_ARTIFACT_FILENAMES
    )


def _rewrite_collection(apkg: Path, mutate) -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        with ZipFile(apkg) as archive:
            archive.extractall(root)
            members = archive.namelist()
        database_path = next(root / name for name in members if name in {"collection.anki2", "collection.anki21"})
        with sqlite3.connect(database_path) as database:
            models_raw, decks_raw = database.execute("select models, decks from col").fetchone()
            models, decks = json.loads(models_raw), json.loads(decks_raw)
            mutate(models, decks)
            database.execute(
                "update col set models=?, decks=?",
                (json.dumps(models, separators=(",", ":")), json.dumps(decks, separators=(",", ":"))),
            )
        with ZipFile(apkg, "w", ZIP_DEFLATED) as archive:
            for name in members:
                archive.write(root / name, name)


def _raw_collection_contract(apkg: Path) -> tuple[dict, dict]:
    with tempfile.TemporaryDirectory() as directory:
        database_path = Path(directory) / "collection.anki2"
        with ZipFile(apkg) as archive:
            members = [
                name
                for name in archive.namelist()
                if name in {"collection.anki2", "collection.anki21"}
            ]
            assert len(members) == 1
            database_path.write_bytes(archive.read(members[0]))
        with sqlite3.connect(database_path) as database:
            models_raw, decks_raw = database.execute(
                "select models, decks from col"
            ).fetchone()
    return json.loads(models_raw), json.loads(decks_raw)


def _rewrite_database(apkg: Path, mutate) -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        with ZipFile(apkg) as archive:
            archive.extractall(root)
            members = archive.namelist()
        database_path = next(
            root / name
            for name in members
            if name in {"collection.anki2", "collection.anki21"}
        )
        with sqlite3.connect(database_path) as database:
            mutate(database)
        with ZipFile(apkg, "w", ZIP_DEFLATED) as archive:
            for name in members:
                archive.write(root / name, name)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)].__setitem__("name", "tampered"),
        lambda models, decks: decks[str(CORE_DECK_ID)].__setitem__("name", "tampered"),
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)]["flds"][0].__setitem__("name", "tampered"),
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)]["flds"][0].__setitem__("id", 1),
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)]["tmpls"][0].__setitem__("name", "tampered"),
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)]["tmpls"][0].__setitem__("id", 1),
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)]["tmpls"][0].__setitem__("ord", 1),
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)]["tmpls"][0].__setitem__("qfmt", "tampered"),
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)]["tmpls"][0].__setitem__("afmt", "tampered"),
        lambda models, decks: models[str(CORE_BASIC_MODEL_ID)].__setitem__("css", "tampered"),
    ],
)
def test_actual_sqlite_v2_contract_tampering_changes_fingerprint_and_fails_inspection(
    candidate, tmp_path, mutate
):
    receipt = write_release(candidate, tmp_path)
    path = tmp_path / CORE_ARTIFACT_FILENAME
    before = canonical_package_fingerprint(read_apkg(path))

    _rewrite_collection(path, mutate)

    after = canonical_package_fingerprint(read_apkg(path))
    result = inspect_release(tmp_path, receipt)
    assert after != before
    assert "PACKAGE_CONTRACT_DRIFT" in {issue.code for issue in result.issues}


def test_legacy_null_id_sentinels_are_preserved_and_added_ids_fail(candidate, tmp_path):
    receipt = write_release(candidate, tmp_path)
    path = tmp_path / QBANK_ARTIFACT_FILENAME
    snapshot = read_apkg(path)
    model = snapshot.models[1607392901]
    assert all(field["id"] is None for field in model["fields"])
    assert model["templates"][0]["id"] is None
    before = canonical_package_fingerprint(snapshot)

    def add_legacy_ids(models, _decks):
        models["1607392901"]["flds"][0]["id"] = 1
        models["1607392901"]["tmpls"][0]["id"] = 1

    _rewrite_collection(path, add_legacy_ids)
    after = canonical_package_fingerprint(read_apkg(path))
    result = inspect_release(tmp_path, receipt)
    assert after != before
    assert "PACKAGE_CONTRACT_DRIFT" in {issue.code for issue in result.issues}
    assert "QBANK_RENDER_APPROVAL_DRIFT" in {issue.code for issue in result.issues}


@pytest.mark.parametrize(
    "mutate",
    [
        lambda models, decks: models["1607392901"].__setitem__("name", "tampered"),
        lambda models, decks: decks[str(LEGACY_QBANK_DECK_ID)].__setitem__("name", "tampered"),
        lambda models, decks: models["1607392901"]["flds"][0].__setitem__("name", "tampered"),
        lambda models, decks: models["1607392901"]["flds"][0].__setitem__("id", 1),
        lambda models, decks: models["1607392901"]["tmpls"][0].__setitem__("name", "tampered"),
        lambda models, decks: models["1607392901"]["tmpls"][0].__setitem__("id", 1),
        lambda models, decks: models["1607392901"]["tmpls"][0].__setitem__("ord", 1),
        lambda models, decks: models["1607392901"]["tmpls"][0].__setitem__("qfmt", "tampered"),
        lambda models, decks: models["1607392901"]["tmpls"][0].__setitem__("afmt", "tampered"),
        lambda models, decks: models["1607392901"].__setitem__("css", "tampered"),
    ],
)
def test_every_legacy_sqlite_contract_tamper_breaks_fingerprint_and_qbank_approval(
    candidate, tmp_path, mutate
):
    receipt = write_release(candidate, tmp_path)
    path = tmp_path / QBANK_ARTIFACT_FILENAME
    before = canonical_package_fingerprint(read_apkg(path))
    before_identity = inspect_release(tmp_path, receipt).identity_fingerprints[
        ("qbank", "qb_synthetic_001", "base")
    ]

    _rewrite_collection(path, mutate)

    after = canonical_package_fingerprint(read_apkg(path))
    result = inspect_release(tmp_path, receipt)
    assert after != before
    assert result.identity_fingerprints[("qbank", "qb_synthetic_001", "base")] != before_identity
    assert {"PACKAGE_CONTRACT_DRIFT", "QBANK_RENDER_APPROVAL_DRIFT"} <= {
        issue.code for issue in result.issues
    }


def test_zip_member_timestamps_do_not_affect_canonical_fingerprint(candidate, tmp_path):
    receipt = write_release(candidate, tmp_path)
    original = tmp_path / CORE_ARTIFACT_FILENAME
    changed = tmp_path / "timestamp-only.apkg"
    with ZipFile(original) as source, ZipFile(changed, "w", ZIP_DEFLATED) as target:
        for member in source.infolist():
            info = ZipInfo(member.filename, date_time=(2020, 1, 2, 3, 4, 6))
            target.writestr(info, source.read(member.filename))
    assert _sha256(original) != _sha256(changed)
    assert canonical_package_fingerprint(read_apkg(original)) == canonical_package_fingerprint(
        read_apkg(changed)
    )


def test_database_timestamps_and_scheduling_metadata_do_not_affect_fingerprint(
    candidate, tmp_path
):
    write_release(candidate, tmp_path)
    path = tmp_path / CORE_ARTIFACT_FILENAME
    before = canonical_package_fingerprint(read_apkg(path))

    def alter_volatile_metadata(database):
        database.execute("update col set crt=crt+1, mod=mod+1, scm=scm+1, usn=usn+1")
        database.execute("update notes set mod=mod+1, usn=usn+1")
        database.execute(
            "update cards set mod=mod+1, usn=usn+1, due=due+7, ivl=ivl+3, "
            "reps=reps+2, lapses=lapses+1, queue=-1"
        )

    _rewrite_database(path, alter_volatile_metadata)

    assert canonical_package_fingerprint(read_apkg(path)) == before


def test_read_apkg_rejects_unsafe_members_and_multiple_collections(tmp_path):
    unsafe = tmp_path / "unsafe.apkg"
    with ZipFile(unsafe, "w") as archive:
        archive.writestr("../escape", b"x")
        archive.writestr("collection.anki2", b"not a database")
    with pytest.raises(PackageInspectionError, match="unsafe"):
        read_apkg(unsafe)

    multiple = tmp_path / "multiple.apkg"
    with ZipFile(multiple, "w") as archive:
        archive.writestr("collection.anki2", b"one")
        archive.writestr("collection.anki21", b"two")
    with pytest.raises(PackageInspectionError, match="exactly one"):
        read_apkg(multiple)


@pytest.mark.parametrize(
    "candidate_change",
    [
        lambda value: replace(value, release_id=None),
        lambda value: replace(value, release_date=None),
        lambda value: replace(value, governed_input_sha256="not-a-digest"),
        lambda value: replace(value, quarantine={}),
        lambda value: replace(value, governed_input_ledger=()),
        lambda value: replace(
            value,
            governed_input_ledger=(("question_bank.json", "2" * 64), ("a.json", "1" * 64)),
        ),
        lambda value: replace(
            value,
            governed_input_ledger=(("../outside.json", "1" * 64),),
        ),
        lambda value: replace(
            value,
            governed_input_ledger=(("question_bank.json", "not-a-digest"),),
        ),
        lambda value: replace(
            value,
            governed_input_ledger=(
                ("question_bank.json", "1" * 64),
                ("question_bank.json", "2" * 64),
            ),
        ),
        lambda value: replace(value, issues=(type("RawIssue", (), {"severity": "hard", "code": "X"})(),)),
        lambda value: replace(value, withdrawals=(value.withdrawals[0].__dict__,)),
    ],
)
def test_writer_refuses_unvalidated_candidate_metadata_and_raw_withdrawals(
    candidate, tmp_path, candidate_change
):
    with pytest.raises(PackageWriteError):
        write_release(candidate_change(candidate), tmp_path)
    assert not tmp_path.exists() or not tuple(tmp_path.iterdir())


def test_inspection_rejects_extra_or_missing_artifacts(candidate, tmp_path):
    receipt = write_release(candidate, tmp_path)
    (tmp_path / "extra.txt").write_text("unexpected")
    result = inspect_release(tmp_path, receipt)
    assert "RELEASE_ARTIFACT_SET" in {issue.code for issue in result.issues}
    (tmp_path / "extra.txt").unlink()
    (tmp_path / APPLICATION_ARTIFACT_FILENAME).unlink()
    result = inspect_release(tmp_path, receipt)
    assert "RELEASE_ARTIFACT_SET" in {issue.code for issue in result.issues}


def test_release_publication_uses_one_atomic_full_directory_replace(
    candidate, tmp_path, monkeypatch
):
    out_dir = tmp_path / "published"
    real_replace = Path.replace
    observed = []

    def recording_replace(source, target):
        if Path(target) == out_dir:
            observed.append({path.name for path in source.iterdir()})
        return real_replace(source, target)

    monkeypatch.setattr(Path, "replace", recording_replace)

    write_release(candidate, out_dir)

    assert observed == [ALL_FILENAMES]
    assert {path.name for path in out_dir.iterdir()} == ALL_FILENAMES


def test_atomic_publish_failure_never_exposes_a_partial_release(
    candidate, tmp_path, monkeypatch
):
    out_dir = tmp_path / "published"
    out_dir.mkdir()
    real_replace = Path.replace

    def failing_replace(source, target):
        if Path(target) == out_dir:
            raise OSError("simulated atomic publish failure")
        return real_replace(source, target)

    monkeypatch.setattr(Path, "replace", failing_replace)

    with pytest.raises(PackageWriteError, match="publish"):
        write_release(candidate, out_dir)

    assert not out_dir.exists() or not tuple(out_dir.iterdir())
    assert not tuple(tmp_path.glob(".pcl-anki-release-*"))


def test_atomic_publisher_preserves_preexisting_nonempty_destination(candidate, tmp_path):
    out_dir = tmp_path / "published"
    out_dir.mkdir()
    sentinel = out_dir / "owner.txt"
    sentinel.write_text("preexisting", encoding="utf-8")

    with pytest.raises(PackageWriteError, match="must be empty"):
        write_release(candidate, out_dir)

    assert sentinel.read_text(encoding="utf-8") == "preexisting"
    assert {path.name for path in out_dir.iterdir()} == {"owner.txt"}
    assert not tuple(tmp_path.glob(".pcl-anki-release-*"))
