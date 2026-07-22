from __future__ import annotations

from copy import deepcopy
from contextlib import contextmanager
from dataclasses import replace
from datetime import date
from hashlib import sha256
from importlib.metadata import version
import json
import os
from pathlib import Path
import sqlite3
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile

from anki.collection import Collection
from anki.import_export_pb2 import IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS
import genanki
import pytest

from pcl_anki.contract import (
    APPLICATION_ARTIFACT_FILENAME,
    APPLICATION_DECK_ID,
    APPLICATION_DECK_NAME,
    APPLICATION_FIELDS,
    APPLICATION_MODEL_ID,
    APPLICATION_MODEL_NAME,
    APPLICATION_TEMPLATE_ID,
    APPLICATION_TEMPLATE_NAME,
    COMPLETE_ARTIFACT_FILENAME,
    CORE_ARTIFACT_FILENAME,
    CORE_BASIC_FIELDS,
    CORE_BASIC_MODEL_ID,
    CORE_BASIC_MODEL_NAME,
    CORE_BASIC_TEMPLATE_ID,
    CORE_BASIC_TEMPLATE_NAME,
    CORE_DECK_ID,
    CORE_DECK_NAME,
    CandidateRelease,
    HistoryRegistry,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    LEGACY_QBANK_TEMPLATE_NAME,
    MigrationResult,
    QBANK_ARTIFACT_FILENAME,
    QuarantineFinding,
    QuarantineResult,
    Withdrawal,
    application_guid,
    core_guid,
    legacy_qbank_guid,
)
from pcl_anki.governance import WITHDRAWAL_TEMPLATE_VERSION, reconcile_quarantines
from pcl_anki.history import (
    EMPTY_HISTORY,
    build_withdrawals,
    preview_withdrawals,
    propose_history_append,
)
from pcl_anki.inspect import inspect_release
from pcl_anki.migration import (
    ReleaseIdentityError,
    import_package,
    match_latest_release_rebuild,
    preflight_package_generation,
    preflight_release_identity,
)
from pcl_anki.package import write_release
from pcl_anki.qbank import (
    LEGACY_QBANK_AFMT,
    LEGACY_QBANK_CSS,
    LEGACY_QBANK_QFMT,
    qbank_item_sha256,
)
from pcl_anki.render import (
    APPLICATION_AFMT,
    APPLICATION_QFMT,
    CORE_BASIC_AFMT,
    CORE_BASIC_QFMT,
    TEMPLATE_CONTRACTS,
    TEMPLATE_CONTRACT_SHA256,
    V2_CSS,
    build_qbank_notes,
    render_card,
)


FIXTURES = Path(__file__).parent / "fixtures"
SCHEDULE = (17, 42, 12345)
PACKAGE_BY_ROLE = {
    "core": CORE_ARTIFACT_FILENAME,
    "application": APPLICATION_ARTIFACT_FILENAME,
    "complete": COMPLETE_ARTIFACT_FILENAME,
    "qbank": QBANK_ARTIFACT_FILENAME,
}


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _qbank_item(uid: str, marker: str, *, two_tier: bool) -> dict:
    item = {
        "id": uid,
        "status": "attested",
        "type": "two-tier" if two_tier else "sba",
        "category": "otherdx",
        "competency": ["dx"],
        "difficulty": 1,
        "hy": True,
        "pages": ["synthetic-source.md"],
        "stem": f"{marker} synthetic qbank base prompt for {uid}?",
        "options": [
            {"key": "A", "t": f"{marker} synthetic answer alpha", "c": True},
            {
                "key": "B",
                "t": "Synthetic answer beta",
                "trap": {"name": "Synthetic trap beta", "note": "Invented mismatch."},
            },
            {
                "key": "C",
                "t": "Synthetic answer gamma",
                "trap": {"name": "Synthetic trap gamma", "note": "Invented mismatch."},
            },
            {
                "key": "D",
                "t": "Synthetic answer delta",
                "trap": {"name": "Synthetic trap delta", "note": "Invented mismatch."},
            },
        ],
        "why": f"{marker} synthetic qbank rationale.",
        "pearl": f"{marker} synthetic qbank pearl.",
        "evidence": f"{marker} synthetic qbank evidence.",
    }
    if two_tier:
        item["tier2"] = {
            "q": f"{marker} synthetic Tier 2 mechanism for {uid}?",
            "options": [
                {"key": "A", "t": f"{marker} synthetic mechanism alpha", "c": True},
                {"key": "B", "t": "Synthetic mechanism beta"},
                {"key": "C", "t": "Synthetic mechanism gamma"},
                {"key": "D", "t": "Synthetic mechanism delta"},
            ],
            "why": f"{marker} synthetic Tier 2 rationale.",
        }
    return item


def _card(uid: str, marker: str, *, kind: str, qbank_item: dict | None = None) -> dict:
    contract_key = "application" if kind == "application" else "coreBasic"
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
        "front": f"{marker} synthetic prompt for {uid}?",
        "answer": f"{marker} synthetic answer for {uid}.",
        "explanation": f"{marker} synthetic explanation for {uid}.",
        "caveat": "Synthetic nonclinical migration fixture only.",
        "source": {
            "path": "synthetic/source.md",
            "slug": "synthetic-source",
            "anchor": "synthetic-marker",
            "url": "https://example.invalid/?page=synthetic-source#synthetic-marker",
            "quote": f"{marker} synthetic source quote for {uid}.",
            "quoteSha256": sha256(f"{marker}:{uid}".encode()).hexdigest(),
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
        card["reinforces"] = "migration_core_copy"
        card["qbank"] = {
            "id": qbank_item["id"],
            "taskBundle": "Diagnosis",
            "primaryPage": "synthetic-source",
            "primaryAnchor": "synthetic-marker",
            "approvedItemSha256": qbank_item_sha256(qbank_item),
            "primaryTrap": "Synthetic trap beta",
            "sourceAnchorSha256": "b" * 64,
        }
    return card


def _active_notes(fixture: dict):
    marker = fixture["marker"]
    qbank_items = {
        "qb_sud_014": _qbank_item("qb_sud_014", marker, two_tier=True),
        "qb_otherdx_999": _qbank_item(
            "qb_otherdx_999", marker, two_tier=True
        ),
        "qb_pha_002": _qbank_item("qb_pha_002", marker, two_tier=False),
    }
    core = tuple(
        render_card(_card(uid, marker, kind="basic"))
        for uid in fixture["active"]["core"]
    )
    application = tuple(
        render_card(
            _card(uid, marker, kind="application", qbank_item=qbank_items["qb_sud_014"]),
            qbank_item=qbank_items["qb_sud_014"],
        )
        for uid in fixture["active"]["application"]
    )
    qbank = tuple(
        note
        for uid in fixture["active"]["qbank"]
        for note in build_qbank_notes(qbank_items[uid])
    )
    return core, application, qbank


def _candidate(
    fixture: dict,
    *,
    withdrawals: tuple[Withdrawal, ...] = (),
    quarantine: QuarantineResult | None = None,
) -> CandidateRelease:
    release = fixture["release"]
    core, application, qbank = _active_notes(fixture)
    return CandidateRelease(
        release_id=release["id"],
        release_date=date.fromisoformat(release["date"]),
        release_epoch=release["epoch"],
        governed_input_sha256=release["governedInputSha256"],
        governed_input_ledger=(
            ("synthetic/migration-fixture.json", release["governedInputSha256"]),
        ),
        evaluated_at=date.fromisoformat(release["date"]),
        core_active=core,
        application_active=application,
        qbank_active=qbank,
        withdrawals=withdrawals,
        quarantine=quarantine or QuarantineResult((), (), (), ()),
        coverage={},
        issues=(),
    )


def _migration(marker: str, seed_mode: str = "legacy") -> MigrationResult:
    return MigrationResult(
        seed_release_id="legacy-qbank-2026-07-12",
        seed_mode=seed_mode,
        contract_sha256=marker * 64,
        issues=(),
    )


def _withdrawal_reconciliation(history: HistoryRegistry, fixture: dict):
    detected = []
    decisions = []
    shipped = {
        tuple(key): disposition
        for disposition in ("withdraw", "retire")
        for key in fixture[disposition]
    }
    for key, disposition in shipped.items():
        namespace, uid, identity = key
        reason = f"SYNTHETIC_{disposition.upper()}"
        subject = sha256(":".join(key).encode()).hexdigest()
        stub = {
            "namespace": namespace,
            "uid": uid,
            "identity": identity,
            "reasonCode": reason,
            "affectedReleaseId": history.releases[-1]["releaseId"],
        }
        preview = preview_withdrawals(history, (stub,))[0]
        finding = QuarantineFinding(
            namespace=namespace,
            uid=uid,
            identity=identity,
            reason_code=reason,
            subject_sha256=subject,
            source_path=None,
            first_seen_commit="a" * 40,
            withdrawal_render_sha256=preview.render_sha256,
        )
        detected.append(finding)
        decisions.append(
            {
                "namespace": namespace,
                "uid": uid,
                "identity": identity,
                "reasonCode": reason,
                "subjectSha256": subject,
                "sourcePath": None,
                "firstSeenCommit": "a" * 40,
                "disposition": disposition,
                "reviewOwner": "Synthetic Test Owner",
                "reviewedBy": "Synthetic Test Reviewer",
                "reviewedAt": fixture["release"]["date"],
                "affectedReleaseId": history.releases[-1]["releaseId"],
                "withdrawalTemplateVersion": WITHDRAWAL_TEMPLATE_VERSION,
                "approvedWithdrawalSha256": preview.render_sha256,
            }
        )

    unshipped_findings = []
    for key in fixture["unshippedRetired"]:
        namespace, uid, identity = key
        subject = sha256(":".join(key).encode()).hexdigest()
        finding = QuarantineFinding(
            namespace=namespace,
            uid=uid,
            identity=identity,
            reason_code="SYNTHETIC_UNSHIPPED_RETIREMENT",
            subject_sha256=subject,
            source_path=None,
            first_seen_commit="b" * 40,
        )
        detected.append(finding)
        unshipped_findings.append(finding)
        decisions.append(
            {
                "namespace": namespace,
                "uid": uid,
                "identity": identity,
                "reasonCode": finding.reason_code,
                "subjectSha256": subject,
                "sourcePath": None,
                "firstSeenCommit": "b" * 40,
                "disposition": "retire",
                "reviewOwner": "Synthetic Test Owner",
                "reviewedBy": "Synthetic Test Reviewer",
                "reviewedAt": fixture["release"]["date"],
            }
        )

    result = reconcile_quarantines(
        detected,
        {"accepted": decisions},
        release_history={"releases": history.releases},
    )
    return result, tuple(unshipped_findings)


def _write_and_inspect(candidate: CandidateRelease, root: Path):
    receipt = write_release(candidate, root)
    inspection = inspect_release(root, receipt)
    assert inspection.issues == ()
    return receipt, inspection


@pytest.fixture(scope="module")
def governed_releases(tmp_path_factory):
    root = tmp_path_factory.mktemp("governed-migration-releases")
    fixture_n = _load_fixture("release_n.json")
    fixture_n1 = _load_fixture("release_n_plus_1.json")

    candidate_n = _candidate(fixture_n)
    receipt_n, inspection_n = _write_and_inspect(candidate_n, root / "release-n")
    append_n = propose_history_append(
        inspection_n, _migration("8"), candidate_n, EMPTY_HISTORY
    )
    history_n = HistoryRegistry(append_n.new_identity_entries, (append_n.release_record,))

    reconciliation, unshipped_findings = _withdrawal_reconciliation(history_n, fixture_n1)
    withdrawals = build_withdrawals(history_n, reconciliation)
    candidate_n1 = _candidate(
        fixture_n1,
        withdrawals=withdrawals,
        quarantine=reconciliation,
    )
    receipt_n1, inspection_n1 = _write_and_inspect(candidate_n1, root / "release-n1")
    append_n1 = propose_history_append(
        inspection_n1, _migration("9", "predecessor"), candidate_n1, history_n
    )
    history_n1 = HistoryRegistry(
        (*history_n.identity_entries, *append_n1.new_identity_entries),
        (*history_n.releases, append_n1.release_record),
    )

    rebuild_root = root / "release-n1-rebuild"
    _receipt_rebuild, inspection_rebuild = _write_and_inspect(candidate_n1, rebuild_root)
    rebuild_append = propose_history_append(
        inspection_rebuild,
        _migration("9", "predecessor"),
        candidate_n1,
        history_n,
    )
    return {
        "root": root,
        "fixture_n": fixture_n,
        "fixture_n1": fixture_n1,
        "candidate_n": candidate_n,
        "candidate_n1": candidate_n1,
        "receipt_n": receipt_n,
        "receipt_n1": receipt_n1,
        "inspection_n": inspection_n,
        "inspection_n1": inspection_n1,
        "history_n": history_n,
        "history_n1": history_n1,
        "release_record_n1": append_n1.release_record,
        "rebuild_record_n1": rebuild_append.release_record,
        "reconciliation": reconciliation,
        "unshipped_findings": unshipped_findings,
    }


def _compatibility_models(release_id: str) -> dict[str, genanki.Model]:
    marker = f"\n/* {release_id} */\n"
    return {
        "core": genanki.Model(
            CORE_BASIC_MODEL_ID,
            CORE_BASIC_MODEL_NAME,
            fields=[{"name": name, "id": field_id} for name, field_id in CORE_BASIC_FIELDS],
            templates=[
                {
                    "name": CORE_BASIC_TEMPLATE_NAME,
                    "id": CORE_BASIC_TEMPLATE_ID,
                    "qfmt": CORE_BASIC_QFMT,
                    "afmt": CORE_BASIC_AFMT,
                }
            ],
            css=V2_CSS + marker,
        ),
        "application": genanki.Model(
            APPLICATION_MODEL_ID,
            APPLICATION_MODEL_NAME,
            fields=[{"name": name, "id": field_id} for name, field_id in APPLICATION_FIELDS],
            templates=[
                {
                    "name": APPLICATION_TEMPLATE_NAME,
                    "id": APPLICATION_TEMPLATE_ID,
                    "qfmt": APPLICATION_QFMT,
                    "afmt": APPLICATION_AFMT,
                }
            ],
            css=V2_CSS + marker,
        ),
        "qbank": genanki.Model(
            LEGACY_QBANK_MODEL_ID,
            LEGACY_QBANK_MODEL_NAME,
            fields=[{"name": name} for name in LEGACY_QBANK_FIELDS],
            templates=[
                {
                    "name": LEGACY_QBANK_TEMPLATE_NAME,
                    "qfmt": LEGACY_QBANK_QFMT,
                    "afmt": LEGACY_QBANK_AFMT,
                }
            ],
            css=LEGACY_QBANK_CSS + marker,
        ),
    }


def _force_notetype_mod(package_path: Path, epoch: int) -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        with ZipFile(package_path) as source:
            source.extractall(root)
            members = source.namelist()
        database_path = next(
            root / name
            for name in members
            if name in {"collection.anki2", "collection.anki21"}
        )
        with sqlite3.connect(database_path) as database:
            models_raw = database.execute("select models from col").fetchone()[0]
            models = json.loads(models_raw)
            for model in models.values():
                model["mod"] = epoch
                # Anki's repeated-import identity uses the original model ID;
                # genanki's legacy package serializer omits this metadata.
                model["originalId"] = int(model["id"])
            database.execute(
                "update col set models=?", (json.dumps(models, separators=(",", ":")),)
            )
        with ZipFile(package_path, "w", ZIP_DEFLATED) as target:
            for name in members:
                target.write(root / name, name)


def _write_compatibility_packages(fixture: dict, root: Path) -> dict[str, Path]:
    release = fixture["release"]
    models = _compatibility_models(release["id"])
    core = genanki.Deck(CORE_DECK_ID, CORE_DECK_NAME)
    core.add_note(
        genanki.Note(
            model=models["core"],
            fields=[
                "migration_notetype_core",
                release["id"],
                "Answer",
                "Explanation",
                "",
                "",
                "",
                release["id"],
            ],
            guid=core_guid("migration_notetype_core"),
        )
    )
    application = genanki.Deck(APPLICATION_DECK_ID, APPLICATION_DECK_NAME)
    application.add_note(
        genanki.Note(
            model=models["application"],
            fields=[
                "migration_notetype_application",
                release["id"],
                "Answer",
                "Discriminator",
                "Trap",
                "Detail",
                "",
                "",
                "",
                release["id"],
            ],
            guid=application_guid("migration_notetype_application"),
        )
    )
    qbank = genanki.Deck(LEGACY_QBANK_DECK_ID, LEGACY_QBANK_DECK_NAME)
    qbank.add_note(
        genanki.Note(
            model=models["qbank"],
            fields=[
                "qb_migration_notetype",
                release["id"],
                "",
                "Answer",
                "",
                "",
                "",
                "",
                release["id"],
            ],
            guid=legacy_qbank_guid("qb_migration_notetype"),
        )
    )
    paths = {
        "complete": root / COMPLETE_ARTIFACT_FILENAME,
        "qbank": root / QBANK_ARTIFACT_FILENAME,
    }
    genanki.Package([core, application]).write_to_file(
        str(paths["complete"]), timestamp=float(release["epoch"])
    )
    genanki.Package(qbank).write_to_file(
        str(paths["qbank"]), timestamp=float(release["epoch"])
    )
    for path in paths.values():
        # Anki stamps the first imported notetype with the local collection time.
        # Keep both synthetic revisions newer while preserving their fixed order.
        _force_notetype_mod(path, release["epoch"] + 1_000_000)
    return paths


@pytest.fixture(scope="module")
def compatibility_packages(tmp_path_factory):
    root = tmp_path_factory.mktemp("notetype-compatibility")
    fixture_n = _load_fixture("release_n.json")
    fixture_n1 = _load_fixture("release_n_plus_1.json")
    first = root / "n"
    second = root / "n1"
    first.mkdir()
    second.mkdir()
    return (
        fixture_n,
        _write_compatibility_packages(fixture_n, first),
        fixture_n1,
        _write_compatibility_packages(fixture_n1, second),
    )


@contextmanager
def _collection(path: Path):
    collection = Collection(str(path))
    try:
        yield collection
    finally:
        collection.close()


def _ids(collection: Collection, guid: str) -> tuple[int, int]:
    note_id = collection.db.scalar("select id from notes where guid = ?", guid)
    assert note_id is not None, f"missing note GUID {guid}"
    card_id = collection.db.scalar("select id from cards where nid = ?", note_id)
    assert card_id is not None, f"missing card for GUID {guid}"
    return int(note_id), int(card_id)


def _fields(collection: Collection, guid: str) -> tuple[str, ...]:
    note_id, _ = _ids(collection, guid)
    return tuple(collection.get_note(note_id).fields)


def _schedule(collection: Collection, guid: str) -> tuple[int, int, int]:
    _, card_id = _ids(collection, guid)
    card = collection.get_card(card_id)
    return card.reps, card.ivl, card.due


def _make_locally_newer_and_scheduled(collection: Collection, guid: str) -> None:
    note_id, card_id = _ids(collection, guid)
    note = collection.get_note(note_id)
    note.fields[1] = "LOCALLY NEWER CONTENT THAT MUST NOT WIN"
    collection.update_note(note)
    collection.db.execute("update notes set mod = mod + 100000 where id = ?", note_id)
    card = collection.get_card(card_id)
    card.reps, card.ivl, card.due = SCHEDULE
    collection.update_card(card)


def _candidate_note_map(candidate: CandidateRelease):
    notes = (
        *candidate.core_active,
        *candidate.application_active,
        *candidate.qbank_active,
        *candidate.withdrawals,
    )
    return {(note.namespace, note.uid, note.identity): note for note in notes}


def _paths(governed_releases, release: str) -> dict[str, Path]:
    root = governed_releases["root"] / release
    return {role: root / filename for role, filename in PACKAGE_BY_ROLE.items()}


def test_selected_lock_is_an_exact_supported_anki_version():
    profile = os.environ["PCL_ANKI_LOCK_PROFILE"]
    assert version("anki") == {"build": "26.5", "current": "26.5", "min": "23.10.1"}[profile]


def test_import_package_sends_the_exact_cross_version_safety_options(tmp_path):
    sentinel = object()

    class RecordingCollection:
        request = None

        def import_anki_package(self, request):
            self.request = request
            return sentinel

    collection = RecordingCollection()
    assert import_package(collection, tmp_path / "candidate.apkg") is sentinel
    options = collection.request.options
    assert collection.request.package_path == str(tmp_path / "candidate.apkg")
    assert options.update_notes == IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS
    assert options.update_notetypes == IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS
    assert options.with_scheduling is False
    if "with_deck_configs" in options.DESCRIPTOR.fields_by_name:
        assert options.with_deck_configs is False


def test_release_identity_preflight_blocks_epoch_collision_before_writer(
    governed_releases,
):
    candidate = replace(
        governed_releases["candidate_n1"],
        release_id="migration-release-collision",
    )
    calls = []

    def writer():
        calls.append("called")
        return object()

    with pytest.raises(ReleaseIdentityError, match="release epoch"):
        preflight_package_generation(
            candidate,
            governed_releases["history_n1"],
            writer,
        )
    assert calls == []


def test_release_identity_preflight_allows_exact_latest_identity_rebuild(
    governed_releases,
):
    sentinel = object()
    calls = []

    def writer():
        calls.append("called")
        return sentinel

    candidate = governed_releases["candidate_n1"]
    history = governed_releases["history_n1"]
    assert preflight_release_identity(candidate, history) == "candidate_redeploy"
    assert preflight_package_generation(candidate, history, writer) is sentinel
    assert calls == ["called"]


def test_release_identity_preflight_blocks_changed_rebuild_input_before_writer(
    governed_releases,
):
    candidate = replace(
        governed_releases["candidate_n1"], governed_input_sha256="0" * 64
    )
    calls = []

    def writer():
        calls.append("called")

    with pytest.raises(ReleaseIdentityError, match="governed input"):
        preflight_package_generation(
            candidate,
            governed_releases["history_n1"],
            writer,
        )
    assert calls == []


def test_release_identity_preflight_allows_strictly_new_append(governed_releases):
    candidate = replace(
        governed_releases["candidate_n1"],
        release_id="migration-release-n-plus-2",
        release_date=date(2026, 7, 16),
        release_epoch=governed_releases["candidate_n1"].release_epoch + 100,
        governed_input_sha256="3" * 64,
    )
    assert (
        preflight_release_identity(candidate, governed_releases["history_n1"])
        == "new"
    )


@pytest.mark.parametrize(
    "mutation",
    ("older_epoch", "older_id", "changed_latest_date"),
)
def test_release_identity_preflight_rejects_non_append_identity_reuse(
    governed_releases, mutation
):
    candidate = governed_releases["candidate_n1"]
    history = governed_releases["history_n1"]
    if mutation == "older_epoch":
        candidate = replace(
            candidate,
            release_id="migration-release-future",
            release_date=date(2026, 7, 15),
            release_epoch=governed_releases["candidate_n"].release_epoch,
        )
    elif mutation == "older_id":
        candidate = replace(
            candidate,
            release_id=governed_releases["candidate_n"].release_id,
            release_date=date(2026, 7, 15),
            release_epoch=candidate.release_epoch + 100,
        )
    else:
        candidate = replace(candidate, release_date=date(2026, 7, 16))

    with pytest.raises(ReleaseIdentityError):
        preflight_release_identity(candidate, history)


def _mutate_release_projection(record: dict, projection: str) -> dict:
    mutated = deepcopy(record)
    if projection == "identity":
        mutated["releaseId"] = "migration-release-mutation"
    elif projection == "governed_input":
        mutated["governedInputSha256"] = "0" * 64
    elif projection == "packages":
        mutated["packages"] = {}
    elif projection == "csv":
        mutated["csv"] = {}
    elif projection == "receipt":
        mutated["receiptContractSha256"] = "0" * 64
    elif projection == "migration_seed":
        mutated["migrationSeedReleaseId"] = "different-seed"
    elif projection == "migration_contract":
        mutated["migrationContractSha256"] = "0" * 64
    else:
        mutated["memberships"][0]["approvedCardSha256"] = "0" * 64
    return mutated


def test_exact_latest_release_rebuild_matches_independent_production_output(
    governed_releases,
):
    assert (
        match_latest_release_rebuild(
            governed_releases["rebuild_record_n1"],
            governed_releases["history_n1"],
        )
        is None
    )


@pytest.mark.parametrize(
    "projection",
    (
        "identity",
        "governed_input",
        "packages",
        "csv",
        "receipt",
        "migration_seed",
        "migration_contract",
        "memberships",
    ),
)
def test_latest_release_rebuild_rejects_each_mutated_projection(
    governed_releases, projection
):
    mutated = _mutate_release_projection(
        governed_releases["rebuild_record_n1"], projection
    )
    with pytest.raises(ReleaseIdentityError, match="exactly match"):
        match_latest_release_rebuild(mutated, governed_releases["history_n1"])


def test_stored_notetype_contracts_update_across_real_imports(
    compatibility_packages, tmp_path
):
    fixture_n, paths_n, fixture_n1, paths_n1 = compatibility_packages
    collection_path = tmp_path / "notetype-update.anki2"
    with _collection(collection_path) as collection:
        for role in ("complete", "qbank"):
            import_package(collection, paths_n[role])
        for model_id in (CORE_BASIC_MODEL_ID, APPLICATION_MODEL_ID, LEGACY_QBANK_MODEL_ID):
            assert fixture_n["release"]["id"] in collection.models.get(model_id)["css"]

        for role in ("complete", "qbank"):
            import_package(collection, paths_n1[role])

    # The Rust import persists the change immediately, while Anki's Python
    # notetype cache can retain a model read before the import until reopen.
    with _collection(collection_path) as collection:
        for model_id in (CORE_BASIC_MODEL_ID, APPLICATION_MODEL_ID, LEGACY_QBANK_MODEL_ID):
            stored_css = collection.models.get(model_id)["css"]
            assert f"/* {fixture_n1['release']['id']} */" in stored_css
            assert f"/* {fixture_n['release']['id']} */" not in stored_css
        assert {
            model["id"]: model["name"]
            for model in collection.models.all()
            if model["id"]
            in (CORE_BASIC_MODEL_ID, APPLICATION_MODEL_ID, LEGACY_QBANK_MODEL_ID)
        } == {
            CORE_BASIC_MODEL_ID: CORE_BASIC_MODEL_NAME,
            APPLICATION_MODEL_ID: APPLICATION_MODEL_NAME,
            LEGACY_QBANK_MODEL_ID: LEGACY_QBANK_MODEL_NAME,
        }


def test_two_release_governed_import_updates_all_shipped_namespaces_in_place(
    governed_releases, tmp_path
):
    paths_n = _paths(governed_releases, "release-n")
    paths_n1 = _paths(governed_releases, "release-n1")
    first = _candidate_note_map(governed_releases["candidate_n"])
    second = _candidate_note_map(governed_releases["candidate_n1"])
    assert set(first) == set(second)

    with _collection(tmp_path / "governed-two-release.anki2") as collection:
        import_package(collection, paths_n["complete"])
        import_package(collection, paths_n["qbank"])
        original = {}
        for key, note in first.items():
            original[key] = _ids(collection, note.guid)
            assert _fields(collection, note.guid) == note.fields
            _make_locally_newer_and_scheduled(collection, note.guid)

        import_package(collection, paths_n1["complete"])
        import_package(collection, paths_n1["qbank"])
        for key, note in second.items():
            assert _ids(collection, note.guid) == original[key]
            assert _fields(collection, note.guid) == note.fields
            assert _schedule(collection, note.guid) == SCHEDULE

        for withdrawal in governed_releases["candidate_n1"].withdrawals:
            assert "WITHDRAWN SAFETY UPDATE" in " ".join(
                _fields(collection, withdrawal.guid)
            )
        assert (
            core_guid("migration_core_never_shipped")
            not in {row[0] for row in collection.db.all("select guid from notes")}
        )


def test_governed_fixture_uses_canonical_withdrawals_and_excludes_unshipped_retirement(
    governed_releases,
):
    candidate = governed_releases["candidate_n1"]
    reconciliation = governed_releases["reconciliation"]
    unshipped = governed_releases["unshipped_findings"]
    assert governed_releases["inspection_n"].issues == ()
    assert governed_releases["inspection_n1"].issues == ()
    assert candidate.withdrawals
    assert all(isinstance(value, Withdrawal) for value in candidate.withdrawals)
    assert all(finding in reconciliation.accepted for finding in unshipped)
    assert all(
        (proof.finding.namespace, proof.finding.uid, proof.finding.identity)
        != (finding.namespace, finding.uid, finding.identity)
        for finding in unshipped
        for proof in reconciliation.withdrawal_proofs
    )
    assert all(value.uid != "migration_core_never_shipped" for value in candidate.withdrawals)


@pytest.mark.parametrize(
    ("uid", "identity"),
    (("qb_sud_014", "base"), ("qb_sud_014", "tier2")),
)
def test_authentic_frozen_legacy_base_and_tier2_update_in_place(
    governed_releases, tmp_path, uid, identity
):
    expected = _candidate_note_map(governed_releases["candidate_n1"])[
        ("qbank", uid, identity)
    ]
    assert expected.fields[0] == (uid if identity == "base" else f"{uid}::t2")
    with _collection(tmp_path / f"legacy-{identity}.anki2") as collection:
        import_package(collection, FIXTURES / "legacy_qbank_2026-07-12.apkg")
        original = _ids(collection, expected.guid)
        _make_locally_newer_and_scheduled(collection, expected.guid)
        import_package(collection, _paths(governed_releases, "release-n1")["qbank"])
        assert _ids(collection, expected.guid) == original
        assert _fields(collection, expected.guid) == expected.fields
        assert _schedule(collection, expected.guid) == SCHEDULE
        assert collection.db.scalar(
            "select count(*) from notes where guid = ?", expected.guid
        ) == 1


@pytest.mark.parametrize(
    "legacy_fixture", ("legacy_qbank_2026-07-12.apkg", "legacy_all_2026-07-12.apkg")
)
def test_qb_pha_002_withdrawal_updates_frozen_legacy_import_in_place(
    governed_releases, tmp_path, legacy_fixture
):
    expected = _candidate_note_map(governed_releases["candidate_n1"])[
        ("qbank", "qb_pha_002", "base")
    ]
    with _collection(tmp_path / f"{legacy_fixture}.anki2") as collection:
        import_package(collection, FIXTURES / legacy_fixture)
        original = _ids(collection, expected.guid)
        _make_locally_newer_and_scheduled(collection, expected.guid)
        import_package(collection, _paths(governed_releases, "release-n1")["qbank"])
        assert _ids(collection, expected.guid) == original
        assert _fields(collection, expected.guid) == expected.fields
        assert _schedule(collection, expected.guid) == SCHEDULE
        assert collection.db.scalar(
            "select count(*) from notes where guid = ?", expected.guid
        ) == 1
        rendered = " ".join(expected.fields)
        assert "WITHDRAWN SAFETY UPDATE" in rendered
        assert "prior clinical content" in rendered
        assert "fluoxetine" not in rendered.lower()


@pytest.mark.parametrize(
    "order",
    (("core", "application", "complete"), ("complete", "core", "application")),
)
def test_complete_and_standalone_import_orders_create_no_duplicates(
    governed_releases, tmp_path, order
):
    expected = [
        note
        for note in _candidate_note_map(governed_releases["candidate_n"]).values()
        if note.namespace != "qbank"
    ]
    paths = _paths(governed_releases, "release-n")
    with _collection(tmp_path / f"{'-'.join(order)}.anki2") as collection:
        for role in order:
            import_package(collection, paths[role])
        assert collection.db.scalar("select count(*) from notes") == len(expected)
        for note in expected:
            assert collection.db.scalar(
                "select count(*) from notes where guid = ?", note.guid
            ) == 1
            assert _fields(collection, note.guid) == note.fields
