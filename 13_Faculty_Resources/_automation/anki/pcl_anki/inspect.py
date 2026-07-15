"""Read and verify the stable contracts inside governed Anki packages."""

from __future__ import annotations

from hashlib import sha256
import html
import json
from pathlib import Path, PurePosixPath
import re
import sqlite3
import tempfile
from typing import Mapping
from zipfile import BadZipFile, ZipFile

from pcl_anki.contract import (
    APPLICATION_ARTIFACT_FILENAME,
    APPLICATION_MODEL_ID,
    COMPLETE_ARTIFACT_FILENAME,
    CORE_ARTIFACT_FILENAME,
    CORE_BASIC_MODEL_ID,
    CORE_CLOZE_MODEL_ID,
    InspectionResult,
    Issue,
    LEGACY_QBANK_MODEL_ID,
    PackageCard,
    PackageNote,
    PackageSnapshot,
    QBANK_ARTIFACT_FILENAME,
    RELEASE_ARTIFACT_FILENAMES,
    canonical_json_bytes,
    canonical_json_sha256,
    application_guid,
    core_guid,
    legacy_qbank_guid,
)
from pcl_anki.render import TEMPLATE_CONTRACTS, TEMPLATE_CONTRACT_SHA256


CSV_ARTIFACT_FILENAME = "psychiatry_clerkship_ms3_cards.csv"
RECEIPT_ARTIFACT_FILENAME = "anki_release_receipt.json"
RELEASE_FILENAMES = {
    *RELEASE_ARTIFACT_FILENAMES,
    CSV_ARTIFACT_FILENAME,
    RECEIPT_ARTIFACT_FILENAME,
}
_COLLECTION_NAMES = {"collection.anki2", "collection.anki21"}
_MODEL_KEYS = {
    CORE_BASIC_MODEL_ID: "coreBasic",
    CORE_CLOZE_MODEL_ID: "coreCloze",
    APPLICATION_MODEL_ID: "application",
    LEGACY_QBANK_MODEL_ID: "legacyQbank",
}
_MODEL_SETS = {
    CORE_ARTIFACT_FILENAME: {CORE_BASIC_MODEL_ID, CORE_CLOZE_MODEL_ID},
    APPLICATION_ARTIFACT_FILENAME: {APPLICATION_MODEL_ID},
    COMPLETE_ARTIFACT_FILENAME: {
        CORE_BASIC_MODEL_ID,
        CORE_CLOZE_MODEL_ID,
        APPLICATION_MODEL_ID,
    },
    QBANK_ARTIFACT_FILENAME: {LEGACY_QBANK_MODEL_ID},
}
_SHA256_RE = re.compile(r"[0-9a-f]{64}")
_SOURCE_URL_RE = re.compile(r'<a href="([^"]+)">Open reviewed source</a>')
_RECEIPT_CONTRACT_KEYS = (
    "schemaVersion",
    "releaseId",
    "releaseDate",
    "releaseEpoch",
    "governedInputSha256",
    "governedInputLedger",
    "packages",
    "csv",
    "coverage",
    "quarantineSummary",
    "sourceUrls",
)
_RECEIPT_KEYS = {*_RECEIPT_CONTRACT_KEYS, "artifacts", "receiptContractSha256"}
_PAYLOAD_ARTIFACT_FILENAMES = {*RELEASE_ARTIFACT_FILENAMES, CSV_ARTIFACT_FILENAME}


class PackageInspectionError(ValueError):
    """Raised when an APKG cannot be inspected safely and completely."""


def _safe_member(name: str) -> bool:
    if not name or "\x00" in name or "\\" in name:
        return False
    member = PurePosixPath(name)
    return not member.is_absolute() and ".." not in member.parts


def _stable_model(model_id: int, raw: Mapping) -> dict:
    fields = raw.get("flds")
    templates = raw.get("tmpls")
    if not isinstance(fields, list) or not isinstance(templates, list):
        raise PackageInspectionError(f"model {model_id} has invalid field/template arrays")
    return {
        "name": raw.get("name"),
        "fields": [
            {"name": field.get("name"), "id": field.get("id")}
            for field in fields
            if isinstance(field, Mapping)
        ],
        "templates": [
            {
                "name": template.get("name"),
                "id": template.get("id"),
                "ordinal": template.get("ord"),
                "qfmt": template.get("qfmt"),
                "afmt": template.get("afmt"),
            }
            for template in templates
            if isinstance(template, Mapping)
        ],
        "css": raw.get("css"),
    }


def _mapping(value: object, subject: str) -> Mapping:
    if not isinstance(value, Mapping):
        raise PackageInspectionError(f"collection {subject} must be a JSON object")
    return value


def read_apkg(path: Path) -> PackageSnapshot:
    """Read exactly one collection database from an APKG without trusting paths."""

    path = Path(path)
    try:
        with ZipFile(path) as archive:
            members = archive.namelist()
            if any(not _safe_member(name) for name in members):
                raise PackageInspectionError("APKG contains an unsafe ZIP member")
            databases = [name for name in members if name in _COLLECTION_NAMES]
            if len(databases) != 1:
                raise PackageInspectionError(
                    "APKG must contain exactly one collection.anki2 or collection.anki21"
                )
            database_bytes = archive.read(databases[0])
    except PackageInspectionError:
        raise
    except (OSError, BadZipFile, KeyError, RuntimeError) as error:
        raise PackageInspectionError(f"cannot read APKG {path}: {error}") from error

    try:
        with tempfile.TemporaryDirectory(prefix="pcl-anki-inspect-") as temporary:
            database_path = Path(temporary) / "collection.anki2"
            database_path.write_bytes(database_bytes)
            connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
            try:
                col_rows = connection.execute("select models, decks from col").fetchall()
                if len(col_rows) != 1:
                    raise PackageInspectionError("collection must contain exactly one col row")
                models_raw, decks_raw = col_rows[0]
                raw_models = _mapping(json.loads(models_raw), "models")
                raw_decks = _mapping(json.loads(decks_raw), "decks")
                models = {
                    int(model_id): _stable_model(int(model_id), _mapping(model, "model"))
                    for model_id, model in raw_models.items()
                }
                decks = {
                    int(deck_id): {"name": _mapping(deck, "deck").get("name")}
                    for deck_id, deck in raw_decks.items()
                }
                notes = tuple(
                    sorted(
                        (
                            PackageNote(
                                guid=str(guid),
                                model_id=int(model_id),
                                fields=tuple(str(fields).split("\x1f")),
                                tags=tuple(sorted(str(tags).split())),
                            )
                            for guid, model_id, fields, tags in connection.execute(
                                "select guid, mid, flds, tags from notes"
                            )
                        ),
                        key=lambda note: (note.guid, note.model_id, note.fields, note.tags),
                    )
                )
                cards = tuple(
                    sorted(
                        (
                            PackageCard(
                                note_guid=str(guid),
                                deck_id=int(deck_id),
                                ordinal=int(ordinal),
                                queue=int(queue),
                            )
                            for guid, deck_id, ordinal, queue in connection.execute(
                                "select notes.guid, cards.did, cards.ord, cards.queue "
                                "from cards join notes on notes.id=cards.nid"
                            )
                        ),
                        key=lambda card: (
                            card.note_guid,
                            card.deck_id,
                            card.ordinal,
                            card.queue,
                        ),
                    )
                )
            finally:
                connection.close()
    except PackageInspectionError:
        raise
    except (OSError, sqlite3.Error, TypeError, ValueError, json.JSONDecodeError) as error:
        raise PackageInspectionError(f"cannot inspect APKG SQLite collection: {error}") from error
    return PackageSnapshot(path=path, models=models, decks=decks, notes=notes, cards=cards)


def _fingerprint_payload(snapshot: PackageSnapshot) -> dict:
    return {
        "models": {
            str(model_id): model
            for model_id, model in sorted(snapshot.models.items())
        },
        "decks": {
            str(deck_id): deck
            for deck_id, deck in sorted(snapshot.decks.items())
        },
        "notes": [
            {
                "guid": note.guid,
                "modelId": note.model_id,
                "fields": note.fields,
                "tags": tuple(sorted(note.tags)),
            }
            for note in sorted(
                snapshot.notes,
                key=lambda item: (item.guid, item.model_id, item.fields, item.tags),
            )
        ],
        "cards": [
            {
                "guid": card.note_guid,
                "deckId": card.deck_id,
                "ordinal": card.ordinal,
            }
            for card in sorted(
                snapshot.cards,
                key=lambda item: (item.note_guid, item.deck_id, item.ordinal),
            )
        ],
    }


def canonical_package_fingerprint(snapshot: PackageSnapshot) -> str:
    """Hash only stored identity/content contracts, excluding timing/scheduling data."""

    return canonical_json_sha256(_fingerprint_payload(snapshot))


def receipt_contract_sha256(receipt: Mapping[str, object]) -> str:
    """Hash the stable receipt projection, excluding per-build APKG byte hashes."""

    return canonical_json_sha256(
        {key: receipt.get(key) for key in _RECEIPT_CONTRACT_KEYS}
    )


def _template_contract(snapshot: PackageSnapshot, model_id: int) -> dict | None:
    model = snapshot.models.get(model_id)
    key = _MODEL_KEYS.get(model_id)
    if model is None or key is None:
        return None
    expected = TEMPLATE_CONTRACTS[key]
    deck_id = int(expected["deckId"])
    deck = snapshot.decks.get(deck_id)
    templates = model.get("templates", ())
    if deck is None or len(templates) != 1:
        return None
    template = templates[0]
    return {
        "modelId": model_id,
        "modelName": model.get("name"),
        "deckId": deck_id,
        "deckName": deck.get("name"),
        "fields": list(model.get("fields", ())),
        "templateId": template.get("id"),
        "templateName": template.get("name"),
        "templateOrdinal": template.get("ordinal"),
        "qfmt": template.get("qfmt"),
        "afmt": template.get("afmt"),
        "css": model.get("css"),
        "templateVersion": expected["templateVersion"],
    }


def _issue(code: str, subject: object, message: str) -> Issue:
    return Issue(code=code, severity="hard", subject=str(subject), message=message)


def _valid_receipt_ledger(value: object) -> bool:
    if not isinstance(value, list) or not value:
        return False
    pairs = []
    for entry in value:
        if not isinstance(entry, Mapping) or set(entry) != {"path", "sha256"}:
            return False
        path, digest = entry["path"], entry["sha256"]
        if (
            not isinstance(path, str)
            or not path
            or "\\" in path
            or "\x00" in path
            or PurePosixPath(path).is_absolute()
            or path != PurePosixPath(path).as_posix()
            or ".." in PurePosixPath(path).parts
            or not isinstance(digest, str)
            or _SHA256_RE.fullmatch(digest) is None
        ):
            return False
        pairs.append((path, digest))
    paths = [path for path, _digest in pairs]
    return paths == sorted(paths) and len(paths) == len(set(paths))


def _contract_issues(filename: str, snapshot: PackageSnapshot) -> list[Issue]:
    issues = []
    note_models = {note.model_id for note in snapshot.notes}
    allowed_models = _MODEL_SETS[filename]
    if not note_models <= allowed_models:
        issues.append(
            _issue(
                "PACKAGE_MEMBERSHIP_MODEL",
                filename,
                f"package contains disallowed model IDs {sorted(note_models - allowed_models)}",
            )
        )
    for model_id in sorted(note_models):
        key = _MODEL_KEYS.get(model_id)
        actual = _template_contract(snapshot, model_id)
        if key is None or actual != TEMPLATE_CONTRACTS[key]:
            issues.append(
                _issue(
                    "PACKAGE_CONTRACT_DRIFT",
                    f"{filename}:{model_id}",
                    "stored model/deck/field/template bytes do not match the fixed contract",
                )
            )
            if model_id == LEGACY_QBANK_MODEL_ID:
                issues.append(
                    _issue(
                        "QBANK_RENDER_APPROVAL_DRIFT",
                        filename,
                        "stored qbank template contract no longer matches its reviewed hash",
                    )
                )
    note_guids = {note.guid for note in snapshot.notes}
    if len(note_guids) != len(snapshot.notes):
        issues.append(_issue("PACKAGE_DUPLICATE_GUID", filename, "GUIDs must be unique"))
    if any(card.note_guid not in note_guids for card in snapshot.cards):
        issues.append(_issue("PACKAGE_ORPHAN_CARD", filename, "card lacks its note GUID"))
    if any(
        tag in {"Status::draft", "Status::retired", "Status::quarantined"}
        for note in snapshot.notes
        for tag in note.tags
    ):
        issues.append(
            _issue(
                "PACKAGE_INELIGIBLE_STATUS",
                filename,
                "draft, retired, or quarantined content reached a learner package",
            )
        )
    cards_by_guid: dict[str, list[PackageCard]] = {}
    for card in snapshot.cards:
        cards_by_guid.setdefault(card.note_guid, []).append(card)
    for note in snapshot.notes:
        withdrawn = "Status::withdrawn" in note.tags
        if withdrawn and set(note.tags) != {
            "PsychClerkship",
            "Status::withdrawn",
            f"UID::{note.fields[0]}",
        }:
            issues.append(
                _issue(
                    "PACKAGE_WITHDRAWAL_TAGS",
                    f"{filename}:{note.guid}",
                    "withdrawals must carry only the neutral maintenance tags",
                )
            )
            continue
        expected_field_count = {
            CORE_BASIC_MODEL_ID: 8,
            CORE_CLOZE_MODEL_ID: 8,
            APPLICATION_MODEL_ID: 10,
            LEGACY_QBANK_MODEL_ID: 9,
        }.get(note.model_id)
        if expected_field_count is None or len(note.fields) != expected_field_count:
            issues.append(
                _issue(
                    "PACKAGE_FIELD_COUNT",
                    f"{filename}:{note.guid}",
                    "stored note fields do not match the fixed ordered model",
                )
            )
        elif not note.fields[1].strip() or not note.fields[2 if note.model_id != LEGACY_QBANK_MODEL_ID else 3].strip():
            issues.append(
                _issue(
                    "PACKAGE_EMPTY_FACE",
                    f"{filename}:{note.guid}",
                    "packaged prompt and direct-answer fields must be nonempty",
                )
            )
        if note.fields:
            serialized_uid = note.fields[0]
            if note.model_id in {CORE_BASIC_MODEL_ID, CORE_CLOZE_MODEL_ID}:
                valid_guid = note.guid == core_guid(serialized_uid)
            elif note.model_id == APPLICATION_MODEL_ID:
                valid_guid = note.guid == application_guid(serialized_uid)
            elif withdrawn:
                valid_guid = note.guid in {
                    legacy_qbank_guid(serialized_uid, "base"),
                    legacy_qbank_guid(serialized_uid, "tier2"),
                }
            else:
                identity = "tier2" if serialized_uid.endswith("::t2") else "base"
                valid_guid = note.guid == legacy_qbank_guid(
                    serialized_uid.removesuffix("::t2"), identity
                )
            if not valid_guid:
                issues.append(
                    _issue(
                        "PACKAGE_GUID_CONTRACT",
                        f"{filename}:{note.guid}",
                        "stored GUID does not match the permanent namespace formula",
                    )
                )
        if not withdrawn:
            tags = set(note.tags)
            uid_tag = f"UID::{note.fields[0]}" if note.fields else "UID::"
            if note.model_id in {CORE_BASIC_MODEL_ID, CORE_CLOZE_MODEL_ID}:
                exact = {
                    "PsychClerkship",
                    "Status::active",
                    "Audience::MS3",
                    "Deck::Core",
                    uid_tag,
                    "Kind::basic"
                    if note.model_id == CORE_BASIC_MODEL_ID
                    else "Kind::cloze",
                }
                prefix_counts = {
                    "Week::": 1,
                    "Domain::": 1,
                    "Task::": 1,
                    "Family::": 1,
                    "Risk::": 1,
                }
            elif note.model_id == APPLICATION_MODEL_ID:
                exact = {
                    "PsychClerkship",
                    "Status::active",
                    "Audience::MS3",
                    "Deck::Application",
                    uid_tag,
                    "Kind::application",
                }
                prefix_counts = {
                    "Week::": 1,
                    "Domain::": 1,
                    "Task::": 1,
                    "Family::": 1,
                    "Risk::": 1,
                    "TaskBundle::": 1,
                    "QBank::": 1,
                    "Trap::": 1,
                    "Reinforces::": 1,
                }
            else:
                exact = {"PsychClerkship", "Status::attested"}
                prefix_counts = {
                    "Psychiatry::": 1,
                    "Difficulty::": 1,
                    "Type::": 1,
                    "Source::": None,
                }
            if not exact <= tags or any(
                (
                    sum(tag.startswith(prefix) for tag in note.tags) != count
                    if count is not None
                    else sum(tag.startswith(prefix) for tag in note.tags) < 1
                )
                for prefix, count in prefix_counts.items()
            ):
                issues.append(
                    _issue(
                        "PACKAGE_ACTIVE_TAGS",
                        f"{filename}:{note.guid}",
                        "active note is missing a required primary tag",
                    )
                )
        note_cards = cards_by_guid.get(note.guid, ())
        contract_key = _MODEL_KEYS.get(note.model_id)
        if contract_key is None:
            continue
        expected_deck = int(TEMPLATE_CONTRACTS[contract_key]["deckId"])
        expected_ordinal = int(
            TEMPLATE_CONTRACTS[contract_key]["templateOrdinal"]
        )
        if (
            len(note_cards) != 1
            or note_cards[0].deck_id != expected_deck
            or note_cards[0].ordinal != expected_ordinal
        ):
            issues.append(
                _issue(
                    "PACKAGE_CARD_CONTRACT",
                    f"{filename}:{note.guid}",
                    "each governed note must schedule exactly one fixed-deck/card ordinal",
                )
            )
    return issues


def _note_tuple(note: PackageNote) -> tuple:
    return note.guid, note.model_id, note.fields, tuple(sorted(note.tags))


def _card_tuple(card: PackageCard) -> tuple:
    return card.note_guid, card.deck_id, card.ordinal


def _file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _identity_key(note: PackageNote) -> tuple[str, str, str] | None:
    if not note.fields:
        return None
    serialized_uid = note.fields[0]
    if note.model_id == LEGACY_QBANK_MODEL_ID:
        uid = serialized_uid.removesuffix("::t2")
        identity = (
            "tier2"
            if note.guid == legacy_qbank_guid(uid, "tier2")
            else "base"
        )
        return "qbank", uid, identity
    if note.model_id == APPLICATION_MODEL_ID:
        return "application", serialized_uid, "base"
    if note.model_id in {CORE_BASIC_MODEL_ID, CORE_CLOZE_MODEL_ID}:
        return "core", serialized_uid, "base"
    return None


def _identity_fingerprint(snapshot: PackageSnapshot, note: PackageNote) -> str | None:
    key = _MODEL_KEYS.get(note.model_id)
    actual_contract = _template_contract(snapshot, note.model_id)
    if key is None or actual_contract is None:
        return None
    return canonical_json_sha256(
        {
            "guid": note.guid,
            "modelId": note.model_id,
            "fields": note.fields,
            "tags": tuple(sorted(note.tags)),
            "templateContractSha256": canonical_json_sha256(actual_contract),
        }
    )


def inspect_release(out_dir: Path, receipt: Mapping[str, object]) -> InspectionResult:
    """Inspect staged bytes and their real SQLite contracts without mutating them."""

    out_dir = Path(out_dir)
    issues: list[Issue] = []
    snapshots: dict[str, PackageSnapshot] = {}
    actual_names = {path.name for path in out_dir.iterdir()} if out_dir.is_dir() else set()
    if actual_names != RELEASE_FILENAMES:
        issues.append(
            _issue(
                "RELEASE_ARTIFACT_SET",
                out_dir,
                f"expected exactly {sorted(RELEASE_FILENAMES)}, got {sorted(actual_names)}",
            )
        )
    if set(receipt) != _RECEIPT_KEYS:
        issues.append(
            _issue(
                "RECEIPT_KEYS",
                "receipt",
                "receipt fields do not match the governed schema-version-1 contract",
            )
        )
    if receipt.get("receiptContractSha256") != receipt_contract_sha256(receipt):
        issues.append(
            _issue(
                "RECEIPT_CONTRACT_DRIFT",
                "receiptContractSha256",
                "stable receipt contract hash does not match its canonical projection",
            )
        )
    if not _valid_receipt_ledger(receipt.get("governedInputLedger")):
        issues.append(
            _issue(
                "RECEIPT_INPUT_LEDGER",
                "governedInputLedger",
                "receipt requires a non-empty sorted unique repo-relative path/SHA-256 ledger",
            )
        )
    artifact_sha256 = {
        filename: _file_sha256(out_dir / filename)
        for filename in sorted(RELEASE_FILENAMES & actual_names)
    }
    for filename in RELEASE_ARTIFACT_FILENAMES:
        path = out_dir / filename
        if not path.is_file():
            continue
        try:
            snapshot = read_apkg(path)
        except PackageInspectionError as error:
            issues.append(_issue("PACKAGE_UNREADABLE", filename, str(error)))
            continue
        snapshots[filename] = snapshot
        issues.extend(_contract_issues(filename, snapshot))

    receipt_path = out_dir / RECEIPT_ARTIFACT_FILENAME
    if receipt_path.is_file():
        try:
            stored_receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            issues.append(_issue("RECEIPT_UNREADABLE", receipt_path, str(error)))
        else:
            if canonical_json_bytes(stored_receipt) != canonical_json_bytes(receipt):
                issues.append(
                    _issue("RECEIPT_ARGUMENT_DRIFT", receipt_path, "receipt argument differs from staged receipt")
                )

    receipt_packages = receipt.get("packages") if isinstance(receipt, Mapping) else None
    receipt_artifacts = receipt.get("artifacts") if isinstance(receipt, Mapping) else None
    if not isinstance(receipt_packages, Mapping) or set(receipt_packages) != set(
        RELEASE_ARTIFACT_FILENAMES
    ):
        issues.append(_issue("RECEIPT_PACKAGES", "packages", "receipt package records are incomplete"))
        receipt_packages = {}
    if not isinstance(receipt_artifacts, Mapping) or set(receipt_artifacts) != (
        _PAYLOAD_ARTIFACT_FILENAMES
    ):
        issues.append(_issue("RECEIPT_ARTIFACTS", "artifacts", "receipt artifact ledger is missing"))
        receipt_artifacts = {}

    for filename, snapshot in snapshots.items():
        active = sum("Status::withdrawn" not in note.tags for note in snapshot.notes)
        withdrawals = len(snapshot.notes) - active
        expected_record = {
            "contentFingerprintSha256": canonical_package_fingerprint(snapshot),
            "activeNoteCount": active,
            "withdrawalNoteCount": withdrawals,
            "totalNoteCount": len(snapshot.notes),
            "scheduledCardCount": len(snapshot.cards),
        }
        if receipt_packages.get(filename) != expected_record:
            issues.append(
                _issue(
                    "RECEIPT_PACKAGE_DRIFT",
                    filename,
                    "receipt counts or canonical package fingerprint differ from SQLite",
                )
            )
        artifact = receipt_artifacts.get(filename)
        expected_artifact = {
            "sha256": artifact_sha256.get(filename),
            "sizeBytes": (out_dir / filename).stat().st_size,
        }
        if artifact != expected_artifact:
            issues.append(
                _issue("RECEIPT_ARTIFACT_DRIFT", filename, "receipt byte hash/size differs from staged file")
            )

    if all(name in snapshots for name in RELEASE_ARTIFACT_FILENAMES):
        core = snapshots[CORE_ARTIFACT_FILENAME]
        application = snapshots[APPLICATION_ARTIFACT_FILENAME]
        complete = snapshots[COMPLETE_ARTIFACT_FILENAME]
        qbank = snapshots[QBANK_ARTIFACT_FILENAME]
        if {_note_tuple(note) for note in complete.notes} != {
            *(_note_tuple(note) for note in core.notes),
            *(_note_tuple(note) for note in application.notes),
        } or {_card_tuple(card) for card in complete.cards} != {
            *(_card_tuple(card) for card in core.cards),
            *(_card_tuple(card) for card in application.cards),
        }:
            issues.append(
                _issue(
                    "COMPLETE_UNION_DRIFT",
                    COMPLETE_ARTIFACT_FILENAME,
                    "Complete must be the exact Core and Application union",
                )
            )
        if any(note.model_id == LEGACY_QBANK_MODEL_ID for note in complete.notes):
            issues.append(
                _issue("COMPLETE_QBANK_MODEL", COMPLETE_ARTIFACT_FILENAME, "Complete may not contain qbank")
            )
        if {_note_tuple(note) for note in qbank.notes} & {
            _note_tuple(note) for note in complete.notes
        }:
            issues.append(_issue("QBANK_COMPLETE_OVERLAP", "packages", "qbank leaked into Complete"))

    stored_source_urls = set()
    source_shape_valid = True
    for filename in (CORE_ARTIFACT_FILENAME, APPLICATION_ARTIFACT_FILENAME):
        snapshot = snapshots.get(filename)
        if snapshot is None:
            continue
        for note in snapshot.notes:
            if "Status::withdrawn" in note.tags:
                continue
            field_index = 8 if note.model_id == APPLICATION_MODEL_ID else 6
            matches = (
                _SOURCE_URL_RE.findall(note.fields[field_index])
                if len(note.fields) > field_index
                else []
            )
            if len(matches) != 1:
                source_shape_valid = False
            else:
                stored_source_urls.add(html.unescape(matches[0]))
    receipt_source_urls = receipt.get("sourceUrls")
    if (
        not source_shape_valid
        or not isinstance(receipt_source_urls, list)
        or receipt_source_urls != sorted(set(receipt_source_urls))
        or set(receipt_source_urls) != stored_source_urls
    ):
        issues.append(
            _issue(
                "PACKAGE_SOURCE_URL_DRIFT",
                "sourceUrls",
                "receipt source URLs must equal the unique reviewed links stored in active SQLite notes",
            )
        )

    identity_fingerprints: dict[tuple[str, str, str], str] = {}
    canonical_sources = (
        snapshots.get(CORE_ARTIFACT_FILENAME),
        snapshots.get(APPLICATION_ARTIFACT_FILENAME),
        snapshots.get(QBANK_ARTIFACT_FILENAME),
    )
    for snapshot in (value for value in canonical_sources if value is not None):
        for note in snapshot.notes:
            key = _identity_key(note)
            fingerprint = _identity_fingerprint(snapshot, note)
            if key is None or fingerprint is None:
                continue
            if key in identity_fingerprints:
                issues.append(_issue("RELEASE_DUPLICATE_IDENTITY", key, "identity appears more than once"))
            else:
                identity_fingerprints[key] = fingerprint

    csv_path = out_dir / CSV_ARTIFACT_FILENAME
    csv_record = receipt.get("csv") if isinstance(receipt, Mapping) else None
    if csv_path.is_file():
        expected_csv = {
            "filename": CSV_ARTIFACT_FILENAME,
            "sha256": artifact_sha256.get(CSV_ARTIFACT_FILENAME),
            "sizeBytes": csv_path.stat().st_size,
        }
        if csv_record != expected_csv:
            issues.append(_issue("RECEIPT_CSV_DRIFT", CSV_ARTIFACT_FILENAME, "CSV receipt record differs"))
        if receipt_artifacts.get(CSV_ARTIFACT_FILENAME) != {
            "sha256": expected_csv["sha256"],
            "sizeBytes": expected_csv["sizeBytes"],
        }:
            issues.append(_issue("RECEIPT_ARTIFACT_DRIFT", CSV_ARTIFACT_FILENAME, "CSV byte ledger differs"))

    return InspectionResult(
        snapshots=snapshots,
        receipt=receipt,
        identity_fingerprints=identity_fingerprints,
        artifact_sha256=artifact_sha256,
        issues=tuple(issues),
    )
