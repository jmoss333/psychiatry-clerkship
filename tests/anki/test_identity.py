from hashlib import sha256
from importlib.metadata import version
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from zipfile import ZipFile

import anki
import genanki
import pytest

import pcl_anki.contract as contract
from pcl_anki.contract import (
    APPLICATION_ARTIFACT_FILENAME,
    APPLICATION_DECK_ID,
    APPLICATION_DECK_NAME,
    APPLICATION_FIELDS,
    APPLICATION_MODEL_ID,
    APPLICATION_MODEL_NAME,
    APPLICATION_TEMPLATE_ID,
    APPLICATION_TEMPLATE_NAME,
    APPLICATION_TEMPLATE_ORDINAL,
    COMPLETE_ARTIFACT_FILENAME,
    CORE_ARTIFACT_FILENAME,
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
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    LEGACY_QBANK_TEMPLATE_NAME,
    LEGACY_QBANK_TEMPLATE_ORDINAL,
    QBANK_ARTIFACT_FILENAME,
    RELEASE_ARTIFACT_FILENAMES,
    application_guid,
    core_guid,
    legacy_qbank_guid,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
RUN_PYTHON = REPO_ROOT / "13_Faculty_Resources" / "_automation" / "anki" / "run_python.sh"


EXPECTED_CORE_BASIC_FIELDS = (
    ("UID", 7715026946512367336),
    ("Front", 1581891087570822773),
    ("Answer", 3648809565985408987),
    ("Explanation", 2174348647067507977),
    ("Caveat", 3436125447725103097),
    ("SourceQuote", 2553051568381521149),
    ("SourceLink", 2854218784170519640),
    ("Meta", 1744796410914045706),
)

EXPECTED_CORE_CLOZE_FIELDS = (
    ("UID", 1799494823268918589),
    ("Text", 7771538009428565766),
    ("Answer", 4332612271198974114),
    ("Explanation", 7364136103503060308),
    ("Caveat", 7788919485417581378),
    ("SourceQuote", 1452385292661756254),
    ("SourceLink", 6557169000714987829),
    ("Meta", 5637910376665094000),
)

EXPECTED_APPLICATION_FIELDS = (
    ("UID", 1131999658638281388),
    ("Question", 3636781603027082657),
    ("Answer", 9202232928613487235),
    ("Discriminator", 403813941556652594),
    ("Trap", 3236073075272291878),
    ("Detail", 5987568621819550144),
    ("Caveat", 3260351373777911252),
    ("SourceQuote", 8755104689011360910),
    ("SourceLink", 1306800255169644962),
    ("Meta", 14791453266034096),
)


def _model_json_from_package(package_path: Path, tmp_path: Path) -> dict[str, dict]:
    database_path = tmp_path / f"{package_path.stem}.anki2"
    with ZipFile(package_path) as package:
        database_path.write_bytes(package.read("collection.anki2"))

    with sqlite3.connect(database_path) as database:
        models_json = database.execute("SELECT models FROM col").fetchone()[0]
    return json.loads(models_json)


def _add_note(deck: genanki.Deck, model: genanki.Model) -> None:
    fields = ["{{c1::neutral}}" if field["name"] == "Text" else "neutral" for field in model.fields]
    deck.add_note(genanki.Note(model=model, fields=fields))


def _write_executable(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


@pytest.fixture
def v2_fixture_path(tmp_path: Path) -> Path:
    core_deck = genanki.Deck(CORE_DECK_ID, CORE_DECK_NAME)
    application_deck = genanki.Deck(APPLICATION_DECK_ID, APPLICATION_DECK_NAME)

    core_basic_model = genanki.Model(
        CORE_BASIC_MODEL_ID,
        CORE_BASIC_MODEL_NAME,
        fields=[{"name": name, "id": field_id} for name, field_id in CORE_BASIC_FIELDS],
        templates=[
            {
                "name": CORE_BASIC_TEMPLATE_NAME,
                "id": CORE_BASIC_TEMPLATE_ID,
                "qfmt": "{{UID}}",
                "afmt": "{{FrontSide}}",
            }
        ],
    )
    core_cloze_model = genanki.Model(
        CORE_CLOZE_MODEL_ID,
        CORE_CLOZE_MODEL_NAME,
        fields=[{"name": name, "id": field_id} for name, field_id in CORE_CLOZE_FIELDS],
        templates=[
            {
                "name": CORE_CLOZE_TEMPLATE_NAME,
                "id": CORE_CLOZE_TEMPLATE_ID,
                "qfmt": "{{cloze:Text}}",
                "afmt": "{{cloze:Text}}",
            }
        ],
        model_type=genanki.Model.CLOZE,
    )
    application_model = genanki.Model(
        APPLICATION_MODEL_ID,
        APPLICATION_MODEL_NAME,
        fields=[{"name": name, "id": field_id} for name, field_id in APPLICATION_FIELDS],
        templates=[
            {
                "name": APPLICATION_TEMPLATE_NAME,
                "id": APPLICATION_TEMPLATE_ID,
                "qfmt": "{{UID}}",
                "afmt": "{{FrontSide}}",
            }
        ],
    )

    _add_note(core_deck, core_basic_model)
    _add_note(core_deck, core_cloze_model)
    _add_note(application_deck, application_model)

    package_path = tmp_path / "v2_identity_fixture.apkg"
    genanki.Package([core_deck, application_deck]).write_to_file(package_path, timestamp=0)
    return package_path


def test_default_runner_uses_production_anki():
    assert os.environ["PCL_ANKI_LOCK_PROFILE"] == "build"
    assert version("anki") == "26.5"


def test_runner_rejects_non_cpython_311(tmp_path):
    fake_pypy = tmp_path / "pypy3.11"
    _write_executable(
        fake_pypy,
        """#!/usr/bin/env bash
case "${2:-}" in
  *sys.implementation*) exit 1 ;;
  *realpath*) printf '%s\\n' "$0"; exit 0 ;;
  *platform.python_version*) printf '3.11.8\\n'; exit 0 ;;
esac
if [[ "${1:-}" == "-m" && "${2:-}" == "venv" ]]; then
  exit 73
fi
exit 0
""",
    )
    environment = os.environ.copy()
    environment.pop("ANKI_LOCK", None)
    environment["PCL_ANKI_PYTHON"] = str(fake_pypy)

    result = subprocess.run(
        ["bash", str(RUN_PYTHON), "-c", "pass"],
        env=environment,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 2
    assert "Rejected interpreter" in result.stderr
    assert "CPython 3.11 is required" in result.stderr


def test_runner_accepts_explicit_cpython_path_containing_spaces(tmp_path):
    wrapper_directory = tmp_path / "python wrappers"
    wrapper_directory.mkdir()
    wrapper = wrapper_directory / "cpython 3.11"
    _write_executable(
        wrapper,
        """#!/usr/bin/env bash
exec "$PCL_REAL_CPYTHON" "$@"
""",
    )
    environment = os.environ.copy()
    environment.pop("ANKI_LOCK", None)
    environment["PCL_ANKI_PYTHON"] = str(wrapper)
    environment["PCL_REAL_CPYTHON"] = sys.executable

    result = subprocess.run(
        ["bash", str(RUN_PYTHON), "-c", "print('space-path-ok')"],
        env=environment,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "space-path-ok"


def test_legacy_qbank_identity_is_frozen():
    assert LEGACY_QBANK_MODEL_ID == 1607392901
    assert LEGACY_QBANK_MODEL_NAME == "PCL Vignette (Moss)"
    assert LEGACY_QBANK_DECK_ID == 2059400191
    assert LEGACY_QBANK_DECK_NAME == "Psychiatry Clerkship Library (Moss)"
    assert LEGACY_QBANK_FIELDS == (
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
    assert LEGACY_QBANK_TEMPLATE_NAME == "Card 1"
    assert LEGACY_QBANK_TEMPLATE_ORDINAL == 0
    assert legacy_qbank_guid("qb_pha_002") == "x9m9qM{_w7"
    assert legacy_qbank_guid("qb_pha_002", "tier2") == genanki.guid_for(
        "qb_pha_002::t2"
    )


def test_v2_identity_is_frozen():
    assert contract.CORE_GUID_NAMESPACE == "pcl-ms3-core-v2"
    assert contract.APPLICATION_GUID_NAMESPACE == "pcl-ms3-application-v2"
    assert (CORE_DECK_ID, CORE_DECK_NAME) == (
        2059400201,
        "Psychiatry Clerkship MS3 (Moss)::Core Recall",
    )
    assert (APPLICATION_DECK_ID, APPLICATION_DECK_NAME) == (
        2059400202,
        "Psychiatry Clerkship MS3 (Moss)::Clinical Application",
    )
    assert (CORE_BASIC_MODEL_ID, CORE_BASIC_MODEL_NAME) == (
        1740112001,
        "PCL MS3 Core Basic v2",
    )
    assert (CORE_CLOZE_MODEL_ID, CORE_CLOZE_MODEL_NAME) == (
        1740112002,
        "PCL MS3 Core Cloze v2",
    )
    assert (APPLICATION_MODEL_ID, APPLICATION_MODEL_NAME) == (
        1740112003,
        "PCL MS3 Clinical Application v2",
    )
    assert CORE_BASIC_FIELDS == EXPECTED_CORE_BASIC_FIELDS
    assert CORE_CLOZE_FIELDS == EXPECTED_CORE_CLOZE_FIELDS
    assert APPLICATION_FIELDS == EXPECTED_APPLICATION_FIELDS
    assert (CORE_BASIC_TEMPLATE_ID, CORE_BASIC_TEMPLATE_NAME, CORE_BASIC_TEMPLATE_ORDINAL) == (
        8777453155042897990,
        "Card 1",
        0,
    )
    assert (CORE_CLOZE_TEMPLATE_ID, CORE_CLOZE_TEMPLATE_NAME, CORE_CLOZE_TEMPLATE_ORDINAL) == (
        3287951719162080235,
        "Cloze",
        0,
    )
    assert (APPLICATION_TEMPLATE_ID, APPLICATION_TEMPLATE_NAME, APPLICATION_TEMPLATE_ORDINAL) == (
        29615640114988655,
        "Card 1",
        0,
    )


def test_v2_guid_helpers_consume_exported_namespaces(monkeypatch):
    monkeypatch.setattr(contract, "CORE_GUID_NAMESPACE", "test-core-namespace")
    monkeypatch.setattr(
        contract, "APPLICATION_GUID_NAMESPACE", "test-application-namespace"
    )

    assert contract.core_guid("neutral-001") == genanki.guid_for(
        "test-core-namespace", "neutral-001"
    )
    assert contract.application_guid("neutral-002") == genanki.guid_for(
        "test-application-namespace", "neutral-002"
    )


def test_release_artifact_names_are_frozen():
    assert CORE_ARTIFACT_FILENAME == "psychiatry_clerkship_ms3_core.apkg"
    assert APPLICATION_ARTIFACT_FILENAME == "psychiatry_clerkship_ms3_application.apkg"
    assert COMPLETE_ARTIFACT_FILENAME == "psychiatry_clerkship_ms3_complete.apkg"
    assert QBANK_ARTIFACT_FILENAME == "psychiatry_clerkship_qbank.apkg"
    assert RELEASE_ARTIFACT_FILENAMES == (
        CORE_ARTIFACT_FILENAME,
        APPLICATION_ARTIFACT_FILENAME,
        COMPLETE_ARTIFACT_FILENAME,
        QBANK_ARTIFACT_FILENAME,
    )


def test_v2_guids_do_not_change_when_wording_changes():
    core_before = {"id": "core-neutral-001", "wording": "first wording"}
    core_after = {"id": "core-neutral-001", "wording": "revised wording"}
    application_before = {"id": "application-neutral-001", "wording": "first wording"}
    application_after = {"id": "application-neutral-001", "wording": "revised wording"}

    assert core_guid(core_before["id"]) == genanki.guid_for(
        "pcl-ms3-core-v2", core_before["id"]
    )
    assert core_guid(core_before["id"]) == core_guid(core_after["id"])
    assert application_guid(application_before["id"]) == genanki.guid_for(
        "pcl-ms3-application-v2", application_before["id"]
    )
    assert application_guid(application_before["id"]) == application_guid(
        application_after["id"]
    )


def test_fixture_is_the_independent_shipped_package(legacy_qbank_path):
    assert sha256(legacy_qbank_path.read_bytes()).hexdigest() == (
        "07cb14cad54454dc26e441b33058fa4778e515ba0f43cd79881101d0f3c9dfc5"
    )


def test_combined_fixture_is_the_independent_shipped_package(legacy_all_path):
    assert sha256(legacy_all_path.read_bytes()).hexdigest() == (
        "6dea77467f1afdde8996048b959c7d7ca5517322ae3905b4846967b7500771b3"
    )


def test_legacy_fixture_keeps_field_and_template_ids_absent(legacy_qbank_path, tmp_path):
    model = _model_json_from_package(legacy_qbank_path, tmp_path)[str(LEGACY_QBANK_MODEL_ID)]

    assert [field["name"] for field in model["flds"]] == list(LEGACY_QBANK_FIELDS)
    assert all("id" not in field for field in model["flds"])
    assert [(template["name"], template["ord"]) for template in model["tmpls"]] == [
        (LEGACY_QBANK_TEMPLATE_NAME, LEGACY_QBANK_TEMPLATE_ORDINAL)
    ]
    assert all("id" not in template for template in model["tmpls"])


def test_v2_fixture_serializes_explicit_field_and_template_ids(v2_fixture_path, tmp_path):
    models = _model_json_from_package(v2_fixture_path, tmp_path)

    expected_models = (
        (CORE_BASIC_MODEL_ID, EXPECTED_CORE_BASIC_FIELDS, CORE_BASIC_TEMPLATE_ID),
        (CORE_CLOZE_MODEL_ID, EXPECTED_CORE_CLOZE_FIELDS, CORE_CLOZE_TEMPLATE_ID),
        (APPLICATION_MODEL_ID, EXPECTED_APPLICATION_FIELDS, APPLICATION_TEMPLATE_ID),
    )
    for model_id, expected_fields, expected_template_id in expected_models:
        model = models[str(model_id)]
        assert [(field["name"], field["id"]) for field in model["flds"]] == list(
            expected_fields
        )
        assert model["tmpls"][0]["id"] == expected_template_id
