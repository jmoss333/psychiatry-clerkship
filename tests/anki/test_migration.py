from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from importlib.metadata import version
import json
import os
from pathlib import Path

from anki.collection import Collection
import genanki
import pytest

from pcl_anki.contract import (
    APPLICATION_DECK_ID,
    APPLICATION_DECK_NAME,
    APPLICATION_FIELDS,
    APPLICATION_MODEL_ID,
    APPLICATION_MODEL_NAME,
    APPLICATION_TEMPLATE_ID,
    APPLICATION_TEMPLATE_NAME,
    CORE_BASIC_FIELDS,
    CORE_BASIC_MODEL_ID,
    CORE_BASIC_MODEL_NAME,
    CORE_BASIC_TEMPLATE_ID,
    CORE_BASIC_TEMPLATE_NAME,
    CORE_DECK_ID,
    CORE_DECK_NAME,
    HistoryRegistry,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    LEGACY_QBANK_TEMPLATE_NAME,
    application_guid,
    core_guid,
    legacy_qbank_guid,
)
from pcl_anki.history import validate_history
from pcl_anki.migration import import_package
from pcl_anki.qbank import (
    LEGACY_QBANK_AFMT,
    LEGACY_QBANK_CSS,
    LEGACY_QBANK_QFMT,
)
from pcl_anki.render import (
    APPLICATION_AFMT,
    APPLICATION_QFMT,
    CORE_BASIC_AFMT,
    CORE_BASIC_QFMT,
    V2_CSS,
)


FIXTURES = Path(__file__).parent / "fixtures"
PACKAGE_FILENAMES = {
    "core": "psychiatry_clerkship_ms3_core.apkg",
    "application": "psychiatry_clerkship_ms3_application.apkg",
    "complete": "psychiatry_clerkship_ms3_complete.apkg",
    "qbank": "psychiatry_clerkship_qbank.apkg",
}
SCHEDULE = (17, 42, 12345)


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _guid(record: dict) -> str:
    if record["namespace"] == "core":
        return core_guid(record["uid"])
    if record["namespace"] == "application":
        return application_guid(record["uid"])
    return legacy_qbank_guid(record["uid"], record["identity"])


def _models(release_id: str) -> dict[str, genanki.Model]:
    css_marker = f"\n/* {release_id} */\n"
    return {
        "core_basic": genanki.Model(
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
            css=V2_CSS + css_marker,
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
            css=V2_CSS + css_marker,
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
            css=LEGACY_QBANK_CSS + css_marker,
        ),
    }


def _materialize(record: dict, models: dict[str, genanki.Model]) -> genanki.Note:
    tags = [
        "PsychClerkship",
        f"Status::{record['state']}",
        f"UID::{record['uid']}",
    ]
    return genanki.Note(
        model=models[record["model"]],
        fields=record["fields"],
        tags=tags,
        guid=_guid(record),
    )


def _write_packages(fixture: dict, root: Path) -> dict[str, Path]:
    release = fixture["release"]
    models = _models(release["id"])
    records = fixture["notes"]

    def make_deck(namespace: str) -> genanki.Deck:
        if namespace == "core":
            deck = genanki.Deck(CORE_DECK_ID, CORE_DECK_NAME)
        elif namespace == "application":
            deck = genanki.Deck(APPLICATION_DECK_ID, APPLICATION_DECK_NAME)
        else:
            deck = genanki.Deck(LEGACY_QBANK_DECK_ID, LEGACY_QBANK_DECK_NAME)
        for record in records:
            if record["namespace"] == namespace:
                deck.add_note(_materialize(record, models))
        return deck

    paths = {role: root / filename for role, filename in PACKAGE_FILENAMES.items()}
    genanki.Package(make_deck("core")).write_to_file(
        str(paths["core"]), timestamp=float(release["epoch"])
    )
    genanki.Package(make_deck("application")).write_to_file(
        str(paths["application"]), timestamp=float(release["epoch"])
    )
    genanki.Package([make_deck("core"), make_deck("application")]).write_to_file(
        str(paths["complete"]), timestamp=float(release["epoch"])
    )
    genanki.Package(make_deck("qbank")).write_to_file(
        str(paths["qbank"]), timestamp=float(release["epoch"])
    )
    return paths


@pytest.fixture
def releases(tmp_path):
    release_n = _load_fixture("release_n.json")
    release_n_plus_1 = _load_fixture("release_n_plus_1.json")
    first = tmp_path / "release-n"
    second = tmp_path / "release-n-plus-1"
    first.mkdir()
    second.mkdir()
    return (
        release_n,
        _write_packages(release_n, first),
        release_n_plus_1,
        _write_packages(release_n_plus_1, second),
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


def _record_by_key(fixture: dict) -> dict[tuple[str, str, str], dict]:
    return {
        (record["namespace"], record["uid"], record["identity"]): record
        for record in fixture["notes"]
    }


def _all_note_guids(collection: Collection) -> list[str]:
    return [row[0] for row in collection.db.all("select guid from notes")]


def _empty_package_snapshot(marker: str) -> dict:
    return {
        "contentFingerprintSha256": marker * 64,
        "activeNoteCount": 0,
        "withdrawalNoteCount": 0,
        "totalNoteCount": 0,
        "scheduledCardCount": 0,
    }


def _history_release(fixture: dict, marker: str) -> dict:
    release = fixture["release"]
    return {
        "releaseId": release["id"],
        "releaseDate": release["date"],
        "releaseEpoch": release["epoch"],
        "governedInputSha256": release["governedInputSha256"],
        "packages": {
            filename: _empty_package_snapshot(marker)
            for filename in PACKAGE_FILENAMES.values()
        },
        "csv": {
            "filename": "psychiatry_clerkship_ms3_cards.csv",
            "sha256": marker * 64,
            "sizeBytes": 0,
        },
        "receiptContractSha256": marker * 64,
        "migrationSeedReleaseId": "legacy-qbank-2026-07-12",
        "migrationContractSha256": marker * 64,
        "memberships": [],
    }


def test_selected_lock_is_an_exact_supported_anki_version():
    profile = os.environ["PCL_ANKI_LOCK_PROFILE"]
    expected = {"build": "26.5", "current": "26.5", "min": "23.10.1"}
    assert version("anki") == expected[profile]


def test_two_release_import_updates_every_shipped_namespace_in_place(releases, tmp_path):
    release_n, paths_n, release_n_plus_1, paths_n_plus_1 = releases
    expected_n = _record_by_key(release_n)
    expected_n_plus_1 = _record_by_key(release_n_plus_1)

    with _collection(tmp_path / "two-release.anki2") as collection:
        import_package(collection, paths_n["complete"])
        import_package(collection, paths_n["qbank"])
        original = {}
        for key, first_record in expected_n.items():
            guid = _guid(first_record)
            original[key] = _ids(collection, guid)
            assert _fields(collection, guid) == tuple(first_record["fields"])
            _make_locally_newer_and_scheduled(collection, guid)

        import_package(collection, paths_n_plus_1["complete"])
        import_package(collection, paths_n_plus_1["qbank"])

        assert set(expected_n) == set(expected_n_plus_1)
        for key, second_record in expected_n_plus_1.items():
            guid = _guid(second_record)
            assert _ids(collection, guid) == original[key]
            assert _fields(collection, guid) == tuple(second_record["fields"])
            assert _schedule(collection, guid) == SCHEDULE

        for key in (
            ("core", "migration_core_quarantine", "base"),
            ("application", "migration_application_quarantine", "base"),
            ("core", "migration_core_retired", "base"),
            ("application", "migration_application_retired", "base"),
            ("qbank", "qb_migration_retired", "base"),
            ("qbank", "qb_migration_retired", "tier2"),
        ):
            record = expected_n_plus_1[key]
            assert record["state"] == "withdrawn"
            assert "WITHDRAWN SAFETY UPDATE" in " ".join(_fields(collection, _guid(record)))

        physical_guids = set(_all_note_guids(collection))
        for record in release_n_plus_1["unshippedRetired"]:
            assert _guid(record) not in physical_guids


@pytest.mark.parametrize(
    "legacy_fixture",
    ("legacy_qbank_2026-07-12.apkg", "legacy_all_2026-07-12.apkg"),
)
def test_qb_pha_002_withdrawal_updates_frozen_legacy_import_in_place(
    releases, tmp_path, legacy_fixture
):
    _, _, release_n_plus_1, paths_n_plus_1 = releases
    withdrawal = _record_by_key(release_n_plus_1)[("qbank", "qb_pha_002", "base")]
    guid = legacy_qbank_guid("qb_pha_002")

    with _collection(tmp_path / f"{legacy_fixture}.anki2") as collection:
        import_package(collection, FIXTURES / legacy_fixture)
        original_ids = _ids(collection, guid)
        _make_locally_newer_and_scheduled(collection, guid)

        import_package(collection, paths_n_plus_1["qbank"])

        assert _ids(collection, guid) == original_ids
        assert _fields(collection, guid) == tuple(withdrawal["fields"])
        assert _schedule(collection, guid) == SCHEDULE
        assert _all_note_guids(collection).count(guid) == 1
        rendered = " ".join(_fields(collection, guid))
        assert "WITHDRAWN SAFETY UPDATE" in rendered
        assert "prior clinical content" in rendered
        assert "fluoxetine" not in rendered.lower()


@pytest.mark.parametrize(
    "order",
    (
        ("core", "application", "complete"),
        ("complete", "core", "application"),
    ),
)
def test_complete_and_standalone_import_orders_create_no_duplicates(
    releases, tmp_path, order
):
    release_n, paths_n, _, _ = releases
    expected = [record for record in release_n["notes"] if record["namespace"] != "qbank"]

    with _collection(tmp_path / f"{'-'.join(order)}.anki2") as collection:
        for role in order:
            import_package(collection, paths_n[role])

        assert len(_all_note_guids(collection)) == len(expected)
        for record in expected:
            guid = _guid(record)
            assert _all_note_guids(collection).count(guid) == 1
            assert _fields(collection, guid) == tuple(record["fields"])


@pytest.mark.parametrize("reused_epoch", (1784000000, 1784000100))
def test_new_release_id_reusing_any_shipped_epoch_fails_history_preflight(reused_epoch):
    release_n = _load_fixture("release_n.json")
    release_n_plus_1 = _load_fixture("release_n_plus_1.json")
    first = _history_release(release_n, "1")
    second = _history_release(release_n_plus_1, "2")
    baseline = HistoryRegistry((), (first, second))
    proposed = deepcopy(second)
    proposed["releaseId"] = f"different-release-for-{reused_epoch}"
    proposed["releaseDate"] = "2026-07-16"
    proposed["releaseEpoch"] = reused_epoch

    issues = validate_history(HistoryRegistry((), (first, second, proposed)), baseline)

    assert "HISTORY_RELEASE_EPOCH_NONMONOTONIC" in {issue.code for issue in issues}


@pytest.mark.parametrize(
    ("field", "changed"),
    (
        ("releaseId", "different-release-id"),
        ("releaseDate", "2026-07-16"),
        ("releaseEpoch", 1784000101),
        ("governedInputSha256", "f" * 64),
        ("receiptContractSha256", "e" * 64),
        ("migrationContractSha256", "d" * 64),
    ),
)
def test_latest_release_epoch_is_reusable_only_for_an_exact_idempotent_rebuild(
    field, changed
):
    release_n = _load_fixture("release_n.json")
    release_n_plus_1 = _load_fixture("release_n_plus_1.json")
    baseline = HistoryRegistry(
        (),
        (
            _history_release(release_n, "1"),
            _history_release(release_n_plus_1, "2"),
        ),
    )
    exact_rebuild = deepcopy(baseline)
    assert validate_history(exact_rebuild, baseline) == []

    changed_rebuild = deepcopy(baseline)
    changed_rebuild.releases[-1][field] = changed

    assert "HISTORY_RELEASE_PREFIX_CHANGED" in {
        issue.code for issue in validate_history(changed_rebuild, baseline)
    }
