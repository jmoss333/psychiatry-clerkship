"""Append-only release history, legacy bootstrap, and neutral withdrawals."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
from typing import Iterable, Mapping, Sequence
from zipfile import ZipFile

from jsonschema import Draft7Validator, FormatChecker

from pcl_anki.contract import (
    APPLICATION_DECK_ID,
    APPLICATION_DECK_NAME,
    APPLICATION_FIELDS,
    APPLICATION_MODEL_ID,
    APPLICATION_MODEL_NAME,
    APPLICATION_TEMPLATE_ID,
    APPLICATION_TEMPLATE_NAME,
    APPLICATION_TEMPLATE_ORDINAL,
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
    CandidateRelease,
    HistoryAppend,
    HistoryRegistry,
    InspectionResult,
    Issue,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    LEGACY_QBANK_TEMPLATE_NAME,
    LEGACY_QBANK_TEMPLATE_ORDINAL,
    MigrationResult,
    QuarantineResult,
    RenderedNote,
    Withdrawal,
    canonical_json_bytes,
    canonical_json_sha256,
    legacy_qbank_guid,
)
from pcl_anki.governance import revalidate_quarantine_result
from pcl_anki.qbank import LEGACY_QBANK_AFMT, LEGACY_QBANK_CSS, LEGACY_QBANK_QFMT
from pcl_anki.render import TEMPLATE_CONTRACT_SHA256


HISTORY_RELATIVE_PATH = Path("13_Faculty_Resources/anki/release_history.json")
LEGACY_STANDALONE_RELATIVE_PATH = Path(
    "tests/anki/fixtures/legacy_qbank_2026-07-12.apkg"
)
LEGACY_COMBINED_RELATIVE_PATH = Path(
    "tests/anki/fixtures/legacy_all_2026-07-12.apkg"
)
LEGACY_STANDALONE_SHA256 = (
    "07cb14cad54454dc26e441b33058fa4778e515ba0f43cd79881101d0f3c9dfc5"
)
LEGACY_COMBINED_SHA256 = (
    "6dea77467f1afdde8996048b959c7d7ca5517322ae3905b4846967b7500771b3"
)
LEGACY_SOURCE_COMMIT = "a96e32fe237ecf820d0cb187edfa4bac505435d6"
LEGACY_RELEASE_ID = "legacy-qbank-2026-07-12"
LEGACY_RELEASE_DATE = date(2026, 7, 12)
LEGACY_RELEASE_EPOCH = 1783902620
LEGACY_STANDALONE_ARTIFACT = "psychiatry_clerkship_library.apkg"
LEGACY_COMBINED_ARTIFACT = "psychiatry_clerkship_library_ALL.apkg"
LEGACY_COMBINED_QBANK_DECK_ID = 2059400193
LEGACY_COMBINED_QBANK_DECK_NAME = (
    "Psychiatry Clerkship Library (Moss)::Question Bank"
)
WITHDRAWAL_TEMPLATE_VERSION = "pcl-neutral-withdrawal-v1"
EMPTY_HISTORY = HistoryRegistry(identity_entries=(), releases=())
GOVERNED_PACKAGE_NAMES = (
    "psychiatry_clerkship_ms3_core.apkg",
    "psychiatry_clerkship_ms3_application.apkg",
    "psychiatry_clerkship_ms3_complete.apkg",
    "psychiatry_clerkship_qbank.apkg",
)


class HistoryError(ValueError):
    """Raised when release history cannot be trusted or extended safely."""


class LegacyBootstrapError(HistoryError):
    """Raised when either independently shipped legacy artifact drifts."""


def history_to_dict(history: HistoryRegistry) -> dict:
    return {
        "schemaVersion": 1,
        "identityEntries": [deepcopy(value) for value in history.identity_entries],
        "releases": [deepcopy(value) for value in history.releases],
    }


def history_bytes(history: HistoryRegistry) -> bytes:
    """Return the stable human-readable registry representation used in Git."""

    return (
        json.dumps(history_to_dict(history), indent=2, ensure_ascii=False, allow_nan=False)
        + "\n"
    ).encode("utf-8")


def history_from_dict(value: Mapping) -> HistoryRegistry:
    if value.get("schemaVersion") != 1:
        raise HistoryError("release history schemaVersion must be 1")
    identities = value.get("identityEntries")
    releases = value.get("releases")
    if not isinstance(identities, list) or not isinstance(releases, list):
        raise HistoryError("release history requires identityEntries and releases arrays")
    return HistoryRegistry(
        identity_entries=tuple(deepcopy(identities)),
        releases=tuple(deepcopy(releases)),
    )


def load_history(path: Path) -> HistoryRegistry:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise HistoryError(f"cannot read release history {path}: {error}") from error
    if not isinstance(value, Mapping):
        raise HistoryError("release history root must be an object")
    return history_from_dict(value)


def write_history(path: Path, history: HistoryRegistry) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(history_bytes(history))
    return path


def _history_schema() -> dict:
    registry_dir = Path(__file__).resolve().parents[3] / "anki"
    return json.loads(
        (registry_dir / "release_history.schema.json").read_text(encoding="utf-8")
    )


def _schema_issues(history: HistoryRegistry) -> list[Issue]:
    validator = Draft7Validator(_history_schema(), format_checker=FormatChecker())
    issues = []
    for error in sorted(
        validator.iter_errors(history_to_dict(history)), key=lambda item: list(item.path)
    ):
        subject = "$" + "".join(
            f"[{part}]" if isinstance(part, int) else f".{part}"
            for part in error.absolute_path
        )
        issues.append(
            Issue(
                code="HISTORY_SCHEMA_INVALID",
                severity="hard",
                subject=subject,
                message=error.message,
            )
        )
    return issues


def _identity_key(value: Mapping) -> tuple[object, object, object]:
    return value.get("namespace"), value.get("uid"), value.get("identity")


def _issue(code: str, subject: object, message: str) -> Issue:
    return Issue(code=code, severity="hard", subject=str(subject), message=message)


def validate_history(
    current: HistoryRegistry, baseline: HistoryRegistry | None = None
) -> list[Issue]:
    """Validate closed shape, identity invariants, and a canonical append-only prefix."""

    issues = _schema_issues(current)
    if baseline is not None:
        issues.extend(_schema_issues(baseline))
        if len(current.identity_entries) < len(baseline.identity_entries):
            issues.append(
                _issue(
                    "HISTORY_IDENTITY_DELETED",
                    "identityEntries",
                    "current history deleted prior immutable identities",
                )
            )
        for index, prior in enumerate(baseline.identity_entries):
            if index >= len(current.identity_entries):
                break
            if canonical_json_bytes(prior) != canonical_json_bytes(
                current.identity_entries[index]
            ):
                issues.append(
                    _issue(
                        "HISTORY_IDENTITY_PREFIX_CHANGED",
                        f"identityEntries[{index}]",
                        "prior immutable identity changed or was reordered",
                    )
                )
        if len(current.releases) < len(baseline.releases):
            issues.append(
                _issue(
                    "HISTORY_RELEASE_DELETED",
                    "releases",
                    "current history deleted a prior release",
                )
            )
        for index, prior in enumerate(baseline.releases):
            if index >= len(current.releases):
                break
            if canonical_json_bytes(prior) != canonical_json_bytes(current.releases[index]):
                issues.append(
                    _issue(
                        "HISTORY_RELEASE_PREFIX_CHANGED",
                        f"releases[{index}]",
                        "prior release record changed or was reordered",
                    )
                )

    identities: dict[tuple[object, object, object], Mapping] = {}
    guids: dict[str, tuple[object, object, object]] = {}
    for index, entry in enumerate(current.identity_entries):
        key = _identity_key(entry)
        if key in identities:
            issues.append(
                _issue(
                    "HISTORY_IDENTITY_DUPLICATE",
                    key,
                    "an immutable namespace/UID/identity contract may appear only once",
                )
            )
        identities[key] = entry
        guid = entry.get("guid")
        if isinstance(guid, str) and guid in guids and guids[guid] != key:
            issues.append(
                _issue(
                    "HISTORY_GUID_DUPLICATE",
                    f"identityEntries[{index}].guid",
                    "one GUID cannot identify two immutable identities",
                )
            )
        elif isinstance(guid, str):
            guids[guid] = key

    release_ids: set[object] = set()
    last_epoch = -1
    statuses: dict[tuple[object, object, object], tuple[Mapping, object]] = {}
    for release_index, release in enumerate(current.releases):
        release_id = release.get("releaseId")
        if release_id in release_ids:
            issues.append(
                _issue(
                    "HISTORY_RELEASE_DUPLICATE",
                    release_id,
                    "release IDs are unique and append-only",
                )
            )
        release_ids.add(release_id)
        epoch = release.get("releaseEpoch")
        if isinstance(epoch, int):
            if epoch <= last_epoch:
                issues.append(
                    _issue(
                        "HISTORY_RELEASE_EPOCH_NONMONOTONIC",
                        release_id,
                        "a new release epoch must be strictly greater than its predecessor",
                    )
                )
            last_epoch = max(last_epoch, epoch)
        membership_keys: set[tuple[object, object, object]] = set()
        for member_index, member in enumerate(release.get("memberships", ())):
            key = _identity_key(member)
            if key in membership_keys:
                issues.append(
                    _issue(
                        "HISTORY_MEMBERSHIP_DUPLICATE",
                        f"releases[{release_index}].memberships[{member_index}]",
                        "a release may contain an identity only once",
                    )
                )
            membership_keys.add(key)
            if key not in identities:
                issues.append(
                    _issue(
                        "HISTORY_MEMBERSHIP_UNKNOWN_IDENTITY",
                        key,
                        "every shipped membership needs an immutable identity contract",
                    )
                )
                continue
            status = member.get("status")
            prior_state = statuses.get(key)
            if status == "withdrawn" and prior_state is None:
                issues.append(
                    _issue(
                        "HISTORY_WITHDRAWAL_NEVER_SHIPPED",
                        key,
                        "a withdrawal may only update an identity shipped by an earlier release",
                    )
                )
            if prior_state is not None and status == "active":
                prior_member, prior_release_id = prior_state
                if prior_member.get("status") == "withdrawn":
                    if prior_member.get("withdrawalDisposition") == "retired":
                        issues.append(
                            _issue(
                                "HISTORY_RETIRED_REACTIVATED",
                                key,
                                "a permanently retired identity can never reactivate",
                            )
                        )
                    elif (
                        member.get("reactivatesReleaseId") != prior_release_id
                        or member.get("reactivationDecisionSha256")
                        != prior_member.get("governanceDecisionSha256")
                        or member.get("approvedCardSha256") is None
                    ):
                        issues.append(
                            _issue(
                                "HISTORY_QUARANTINE_REACTIVATION_UNREVIEWED",
                                key,
                                "corrected quarantine reactivation needs the prior reviewed decision and a new approval",
                            )
                        )
                elif any(
                    name in member
                    for name in (
                        "reactivatesReleaseId",
                        "reactivationDecisionSha256",
                    )
                ):
                    issues.append(
                        _issue(
                            "HISTORY_REACTIVATION_WITHOUT_WITHDRAWAL",
                            key,
                            "reactivation metadata may only follow a quarantined withdrawal",
                        )
                    )
            if (
                prior_state is not None
                and prior_state[0].get("withdrawalDisposition") == "retired"
                and status == "withdrawn"
                and member.get("withdrawalDisposition") != "retired"
            ):
                issues.append(
                    _issue(
                        "HISTORY_RETIRED_DISPOSITION_CHANGED",
                        key,
                        "a retired disposition is permanent",
                    )
                )
            if status in {"active", "withdrawn"}:
                statuses[key] = (member, release_id)
            identity_entry = identities[key]
            bootstrap_null = (
                release_index == 0
                and release_id == LEGACY_RELEASE_ID
                and identity_entry.get("origin") == "legacy_pre_governance"
                and identity_entry.get("firstShippedReleaseId") == LEGACY_RELEASE_ID
            )
            if member.get("approvedCardSha256") is None and not bootstrap_null:
                issues.append(
                    _issue(
                        "HISTORY_GOVERNED_APPROVAL_MISSING",
                        key,
                        "only membership in the independently bootstrapped legacy release may lack approval",
                    )
                )
    return issues


def validate_identity_relationships(records: Sequence[Mapping]) -> list[Issue]:
    """Validate immutable supersession semantics on current card tombstones."""

    by_id = {
        record.get("id"): record
        for record in records
        if isinstance(record.get("id"), str)
    }
    issues = []
    for record in records:
        uid = record.get("id")
        target_id = record.get("supersedes")
        if target_id is None:
            continue
        if target_id == uid:
            issues.append(
                _issue("SUPERSEDES_SELF", uid, "an ID cannot supersede itself")
            )
            continue
        target = by_id.get(target_id)
        if target is None:
            issues.append(
                _issue(
                    "SUPERSEDED_ID_MISSING",
                    uid,
                    "supersedes must name an existing immutable tombstone",
                )
            )
        elif target.get("state") != "retired":
            issues.append(
                _issue(
                    "SUPERSEDED_ID_NOT_RETIRED",
                    uid,
                    "supersedes must point to a different retired ID",
                )
            )
    return issues


def _sha256_file(path: Path) -> str:
    digest = sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stable_model(model: Mapping) -> dict:
    return {
        "name": model.get("name"),
        "fields": [
            {"name": field.get("name"), "id": field.get("id")}
            for field in model.get("flds", ())
        ],
        "templates": [
            {
                "name": template.get("name"),
                "id": template.get("id"),
                "ordinal": template.get("ord"),
                "qfmt": template.get("qfmt"),
                "afmt": template.get("afmt"),
            }
            for template in model.get("tmpls", ())
        ],
        "css": model.get("css"),
    }


def _read_frozen_package(path: Path, label: str) -> dict:
    expected_hash = {
        "standalone": LEGACY_STANDALONE_SHA256,
        "combined": LEGACY_COMBINED_SHA256,
    }[label]
    actual_hash = _sha256_file(path)
    if actual_hash != expected_hash:
        raise LegacyBootstrapError(
            f"{label} fixture SHA-256 mismatch: expected {expected_hash}, got {actual_hash}"
        )
    try:
        with ZipFile(path) as archive:
            members = archive.namelist()
            database_members = [
                name for name in members if name in {"collection.anki2", "collection.anki21"}
            ]
            if len(database_members) != 1:
                raise LegacyBootstrapError(
                    f"{label} fixture must contain exactly one Anki collection database"
                )
            if any(Path(name).is_absolute() or ".." in Path(name).parts for name in members):
                raise LegacyBootstrapError(f"{label} fixture contains an unsafe ZIP member")
            database_bytes = archive.read(database_members[0])
    except (OSError, ValueError) as error:
        raise LegacyBootstrapError(f"cannot read {label} fixture: {error}") from error

    with tempfile.TemporaryDirectory(prefix="pcl-anki-history-") as temporary:
        database = Path(temporary) / "collection.anki2"
        database.write_bytes(database_bytes)
        connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
        try:
            models_raw, decks_raw = connection.execute(
                "select models, decks from col"
            ).fetchone()
            models = json.loads(models_raw)
            decks = json.loads(decks_raw)
            notes = tuple(
                {
                    "guid": guid,
                    "modelId": model_id,
                    "fields": tuple(fields.split("\x1f")),
                    "tags": tuple(sorted(tags.split())),
                }
                for guid, model_id, fields, tags in connection.execute(
                    "select guid, mid, flds, tags from notes order by guid"
                )
            )
            cards = tuple(
                {
                    "guid": guid,
                    "deckId": deck_id,
                    "ordinal": ordinal,
                    "queue": queue,
                }
                for guid, deck_id, ordinal, queue in connection.execute(
                    "select notes.guid, cards.did, cards.ord, cards.queue "
                    "from cards join notes on notes.id=cards.nid "
                    "order by notes.guid, cards.ord"
                )
            )
        except (sqlite3.Error, TypeError, ValueError, json.JSONDecodeError) as error:
            raise LegacyBootstrapError(
                f"cannot inspect {label} fixture collection: {error}"
            ) from error
        finally:
            connection.close()

    legacy_model = models.get(str(LEGACY_QBANK_MODEL_ID))
    if not isinstance(legacy_model, Mapping):
        raise LegacyBootstrapError(f"{label} fixture is missing the frozen qbank model")
    expected_fields = list(LEGACY_QBANK_FIELDS)
    actual_fields = [field.get("name") for field in legacy_model.get("flds", ())]
    templates = legacy_model.get("tmpls", ())
    if (
        legacy_model.get("name") != LEGACY_QBANK_MODEL_NAME
        or actual_fields != expected_fields
        or any("id" in field for field in legacy_model.get("flds", ()))
        or len(templates) != 1
        or templates[0].get("name") != LEGACY_QBANK_TEMPLATE_NAME
        or templates[0].get("ord") != LEGACY_QBANK_TEMPLATE_ORDINAL
        or "id" in templates[0]
        or templates[0].get("qfmt") != LEGACY_QBANK_QFMT
        or templates[0].get("afmt") != LEGACY_QBANK_AFMT
        or legacy_model.get("css") != LEGACY_QBANK_CSS
    ):
        raise LegacyBootstrapError(f"{label} frozen model/field/template contract drifted")

    deck_id = (
        LEGACY_QBANK_DECK_ID
        if label == "standalone"
        else LEGACY_COMBINED_QBANK_DECK_ID
    )
    deck_name = (
        LEGACY_QBANK_DECK_NAME
        if label == "standalone"
        else LEGACY_COMBINED_QBANK_DECK_NAME
    )
    if decks.get(str(deck_id), {}).get("name") != deck_name:
        raise LegacyBootstrapError(f"{label} frozen qbank deck contract drifted")

    qbank_notes = tuple(note for note in notes if note["modelId"] == LEGACY_QBANK_MODEL_ID)
    qbank_guids = {note["guid"] for note in qbank_notes}
    qbank_cards = tuple(card for card in cards if card["guid"] in qbank_guids)
    expected_total = (168, 168) if label == "standalone" else (309, 313)
    if (len(notes), len(cards)) != expected_total:
        raise LegacyBootstrapError(
            f"{label} package count drift: expected {expected_total}, got {(len(notes), len(cards))}"
        )
    if len(qbank_notes) != 168 or len(qbank_cards) != 168:
        raise LegacyBootstrapError(f"{label} qbank overlap must contain exactly 168 notes/cards")
    if any(
        card["deckId"] != deck_id or card["ordinal"] != LEGACY_QBANK_TEMPLATE_ORDINAL
        for card in qbank_cards
    ):
        raise LegacyBootstrapError(f"{label} qbank card deck/ordinal contract drifted")
    if any(len(note["fields"]) != len(LEGACY_QBANK_FIELDS) for note in qbank_notes):
        raise LegacyBootstrapError(f"{label} qbank field count drifted")

    fingerprint_payload = {
        "models": {
            model_id: _stable_model(model)
            for model_id, model in sorted(models.items(), key=lambda item: int(item[0]))
        },
        "decks": {
            deck_key: {"name": deck.get("name")}
            for deck_key, deck in sorted(decks.items(), key=lambda item: int(item[0]))
        },
        "notes": notes,
        "cards": cards,
    }
    return {
        "label": label,
        "path": Path(path),
        "artifactSha256": actual_hash,
        "contentFingerprintSha256": canonical_json_sha256(fingerprint_payload),
        "notes": notes,
        "cards": cards,
        "qbankNotes": qbank_notes,
        "qbankCards": qbank_cards,
        "deckId": deck_id,
        "deckName": deck_name,
    }


def _legacy_identity(note: Mapping, release_id: str) -> tuple[dict, tuple[str, str, str]]:
    fields = note["fields"]
    serialized_uid = fields[0]
    if not isinstance(serialized_uid, str):
        raise LegacyBootstrapError(
            f"legacy note has invalid stable UID {serialized_uid!r}"
        )
    if serialized_uid.endswith("::t2"):
        uid = serialized_uid.removesuffix("::t2")
        identity = "tier2"
    else:
        uid = serialized_uid
        identity = "base"
    if not re.fullmatch(r"[a-z][a-z0-9_]*", uid):
        raise LegacyBootstrapError(f"legacy note has invalid stable UID {serialized_uid!r}")
    if note["guid"] != legacy_qbank_guid(uid, identity):
        raise LegacyBootstrapError(f"legacy GUID formula mismatch for {uid}")
    entry = {
        "namespace": "qbank",
        "uid": uid,
        "identity": identity,
        "guid": note["guid"],
        "kind": "qbank",
        "model": {"id": LEGACY_QBANK_MODEL_ID, "name": LEGACY_QBANK_MODEL_NAME},
        "deck": {"id": LEGACY_QBANK_DECK_ID, "name": LEGACY_QBANK_DECK_NAME},
        "fields": [{"name": name, "id": None} for name in LEGACY_QBANK_FIELDS],
        "template": {
            "id": None,
            "name": LEGACY_QBANK_TEMPLATE_NAME,
            "ordinal": LEGACY_QBANK_TEMPLATE_ORDINAL,
        },
        "firstShippedReleaseId": release_id,
        "origin": "legacy_pre_governance",
    }
    return entry, ("qbank", uid, identity)


def bootstrap_legacy_history(
    packages: Mapping[str, Path],
    source_commit: str,
    shipped_at: date | str,
    release_id: str = LEGACY_RELEASE_ID,
    release_epoch: int = LEGACY_RELEASE_EPOCH,
) -> HistoryRegistry:
    """Reconstruct the one truthful legacy release from both frozen artifacts."""

    if set(packages) != {"standalone", "combined"}:
        raise LegacyBootstrapError(
            "legacy bootstrap requires exactly standalone and combined packages"
        )
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise LegacyBootstrapError("legacy source commit must be an exact 40-hex SHA")
    if isinstance(shipped_at, str):
        try:
            shipped_at = date.fromisoformat(shipped_at)
        except ValueError as error:
            raise LegacyBootstrapError("legacy release date must be ISO YYYY-MM-DD") from error
    if not isinstance(shipped_at, date):
        raise LegacyBootstrapError("legacy shipped_at must be a date")
    if not isinstance(release_epoch, int) or release_epoch < 0:
        raise LegacyBootstrapError("legacy release epoch must be a nonnegative integer")

    standalone = _read_frozen_package(Path(packages["standalone"]), "standalone")
    combined = _read_frozen_package(Path(packages["combined"]), "combined")
    standalone_by_guid = {note["guid"]: note for note in standalone["qbankNotes"]}
    combined_by_guid = {note["guid"]: note for note in combined["qbankNotes"]}
    if set(standalone_by_guid) != set(combined_by_guid):
        raise LegacyBootstrapError("legacy package GUID overlap differs")
    for guid, standalone_note in standalone_by_guid.items():
        if canonical_json_bytes(standalone_note) != canonical_json_bytes(
            combined_by_guid[guid]
        ):
            raise LegacyBootstrapError(f"legacy package note overlap differs for GUID {guid}")

    identities = []
    notes_by_key = {}
    for note in standalone["qbankNotes"]:
        entry, key = _legacy_identity(note, release_id)
        if key in notes_by_key:
            raise LegacyBootstrapError(f"duplicate legacy identity {key}")
        identities.append(entry)
        notes_by_key[key] = note
    identities.sort(key=lambda entry: _identity_key(entry))

    artifacts = (
        (
            LEGACY_STANDALONE_ARTIFACT,
            standalone["deckId"],
            standalone["deckName"],
            standalone["artifactSha256"],
        ),
        (
            LEGACY_COMBINED_ARTIFACT,
            combined["deckId"],
            combined["deckName"],
            combined["artifactSha256"],
        ),
    )
    memberships = []
    for entry in identities:
        key = _identity_key(entry)
        note = notes_by_key[key]
        shipped_hash = canonical_json_sha256(
            {
                "guid": note["guid"],
                "modelId": note["modelId"],
                "fields": note["fields"],
                "tags": note["tags"],
                "templateContractSha256": TEMPLATE_CONTRACT_SHA256["legacyQbank"],
            }
        )
        memberships.append(
            {
                "namespace": entry["namespace"],
                "uid": entry["uid"],
                "identity": entry["identity"],
                "status": "active",
                "approvedCardSha256": None,
                "shippedCardSha256": shipped_hash,
                "templateVersion": "pcl-qbank-legacy-v1",
                "artifacts": [
                    {
                        "filename": filename,
                        "deckId": deck_id,
                        "deckName": deck_name,
                        "artifactSha256": artifact_hash,
                    }
                    for filename, deck_id, deck_name, artifact_hash in artifacts
                ],
            }
        )

    empty_fingerprint = canonical_json_sha256(
        {"models": {}, "decks": {}, "notes": [], "cards": []}
    )
    packages_record = {
        "psychiatry_clerkship_ms3_core.apkg": {
            "contentFingerprintSha256": empty_fingerprint,
            "activeNoteCount": 0,
            "withdrawalNoteCount": 0,
            "totalNoteCount": 0,
            "scheduledCardCount": 0,
        },
        "psychiatry_clerkship_ms3_application.apkg": {
            "contentFingerprintSha256": empty_fingerprint,
            "activeNoteCount": 0,
            "withdrawalNoteCount": 0,
            "totalNoteCount": 0,
            "scheduledCardCount": 0,
        },
        "psychiatry_clerkship_ms3_complete.apkg": {
            "contentFingerprintSha256": combined["contentFingerprintSha256"],
            "activeNoteCount": len(combined["notes"]),
            "withdrawalNoteCount": 0,
            "totalNoteCount": len(combined["notes"]),
            "scheduledCardCount": len(combined["cards"]),
        },
        "psychiatry_clerkship_qbank.apkg": {
            "contentFingerprintSha256": standalone["contentFingerprintSha256"],
            "activeNoteCount": len(standalone["notes"]),
            "withdrawalNoteCount": 0,
            "totalNoteCount": len(standalone["notes"]),
            "scheduledCardCount": len(standalone["cards"]),
        },
    }
    bootstrap_contract = {
        "origin": "legacy_pre_governance",
        "sourceCommit": source_commit,
        "releaseId": release_id,
        "releaseDate": shipped_at.isoformat(),
        "releaseEpoch": release_epoch,
        "artifacts": {
            LEGACY_STANDALONE_ARTIFACT: standalone["artifactSha256"],
            LEGACY_COMBINED_ARTIFACT: combined["artifactSha256"],
        },
        "packages": packages_record,
    }
    release = {
        "releaseId": release_id,
        "releaseDate": shipped_at.isoformat(),
        "releaseEpoch": release_epoch,
        "governedInputSha256": canonical_json_sha256(bootstrap_contract),
        "packages": packages_record,
        "csv": {
            "filename": "psychiatry_clerkship_ms3_cards.csv",
            "sha256": sha256(b"").hexdigest(),
            "sizeBytes": 0,
        },
        "receiptContractSha256": canonical_json_sha256(
            {"bootstrap": bootstrap_contract, "memberships": memberships}
        ),
        "migrationSeedReleaseId": release_id,
        "migrationContractSha256": canonical_json_sha256(
            {
                "sourceCommit": source_commit,
                "standalone": standalone["contentFingerprintSha256"],
                "combined": combined["contentFingerprintSha256"],
                "overlapCount": len(notes_by_key),
            }
        ),
        "memberships": memberships,
    }
    history = HistoryRegistry(tuple(identities), (release,))
    issues = validate_history(history)
    if issues:
        raise LegacyBootstrapError(
            "legacy bootstrap produced invalid history: "
            + "; ".join(f"{issue.code} {issue.subject}" for issue in issues)
        )
    return history


def _model_contract(note: RenderedNote) -> dict:
    contracts = {
        CORE_BASIC_MODEL_ID: (
            "basic",
            CORE_BASIC_MODEL_NAME,
            CORE_DECK_NAME,
            CORE_BASIC_FIELDS,
            CORE_BASIC_TEMPLATE_ID,
            CORE_BASIC_TEMPLATE_NAME,
            CORE_BASIC_TEMPLATE_ORDINAL,
            "pcl-ms3-core-basic-v2",
        ),
        CORE_CLOZE_MODEL_ID: (
            "cloze",
            CORE_CLOZE_MODEL_NAME,
            CORE_DECK_NAME,
            CORE_CLOZE_FIELDS,
            CORE_CLOZE_TEMPLATE_ID,
            CORE_CLOZE_TEMPLATE_NAME,
            CORE_CLOZE_TEMPLATE_ORDINAL,
            "pcl-ms3-core-cloze-v2",
        ),
        APPLICATION_MODEL_ID: (
            "application",
            APPLICATION_MODEL_NAME,
            APPLICATION_DECK_NAME,
            APPLICATION_FIELDS,
            APPLICATION_TEMPLATE_ID,
            APPLICATION_TEMPLATE_NAME,
            APPLICATION_TEMPLATE_ORDINAL,
            "pcl-ms3-application-v2",
        ),
        LEGACY_QBANK_MODEL_ID: (
            "qbank",
            LEGACY_QBANK_MODEL_NAME,
            LEGACY_QBANK_DECK_NAME,
            tuple((name, None) for name in LEGACY_QBANK_FIELDS),
            None,
            LEGACY_QBANK_TEMPLATE_NAME,
            LEGACY_QBANK_TEMPLATE_ORDINAL,
            "pcl-qbank-legacy-v1",
        ),
    }
    try:
        (
            kind,
            model_name,
            deck_name,
            fields,
            template_id,
            template_name,
            template_ordinal,
            template_version,
        ) = contracts[note.model_id]
    except KeyError as error:
        raise HistoryError(f"unknown packaged model ID {note.model_id}") from error
    if note.template_ordinal != template_ordinal or note.deck_id not in {
        CORE_DECK_ID,
        APPLICATION_DECK_ID,
        LEGACY_QBANK_DECK_ID,
    }:
        raise HistoryError(f"rendered identity contract drifted for {note.uid}")
    return {
        "kind": kind,
        "model": {"id": note.model_id, "name": model_name},
        "deck": {"id": note.deck_id, "name": deck_name},
        "fields": [{"name": name, "id": field_id} for name, field_id in fields],
        "template": {
            "id": template_id,
            "name": template_name,
            "ordinal": template_ordinal,
        },
        "templateVersion": template_version,
    }


def _hard_issues(values: Iterable[Issue]) -> tuple[Issue, ...]:
    return tuple(issue for issue in values if issue.severity == "hard")


def propose_history_append(
    inspection: InspectionResult,
    migration: MigrationResult,
    candidate: CandidateRelease,
    current: HistoryRegistry,
) -> HistoryAppend:
    """Bind already successful inspection/migration results into one stable append."""

    hard = (*_hard_issues(inspection.issues), *_hard_issues(migration.issues))
    if hard:
        raise HistoryError(
            "history proposal refused hard upstream issue(s): "
            + "; ".join(f"{issue.code} {issue.subject}" for issue in hard)
        )
    candidate_hard = _hard_issues(candidate.issues)
    if candidate_hard:
        raise HistoryError(
            "history proposal refused hard candidate issue(s): "
            + "; ".join(issue.code for issue in candidate_hard)
        )
    if candidate.release_id is None or candidate.release_date is None:
        raise HistoryError("governed history append requires release ID and date")
    receipt = inspection.receipt
    packages = receipt.get("packages")
    csv_record = receipt.get("csv")
    receipt_contract = receipt.get("receiptContractSha256")
    if (
        not isinstance(packages, Mapping)
        or set(packages) != set(GOVERNED_PACKAGE_NAMES)
        or not isinstance(csv_record, Mapping)
        or not isinstance(receipt_contract, str)
    ):
        raise HistoryError("inspection receipt lacks stable package/CSV/receipt contracts")

    existing = {_identity_key(entry): entry for entry in current.identity_entries}
    if any(not isinstance(value, Withdrawal) for value in candidate.withdrawals):
        raise HistoryError(
            "candidate withdrawals require the verified Withdrawal representation"
        )
    candidate_notes = (
        *candidate.core_active,
        *candidate.application_active,
        *candidate.qbank_active,
        *candidate.withdrawals,
    )
    candidate_keys = {
        (note.namespace, note.uid, note.identity) for note in candidate_notes
    }
    latest_memberships: dict[tuple[object, ...], Mapping] = {}
    for historical_release in current.releases:
        for member in historical_release.get("memberships", ()):
            latest_memberships[_identity_key(member)] = member
    latest_active = {
        key
        for key, member in latest_memberships.items()
        if member.get("status") == "active"
    }
    omitted_active = latest_active - candidate_keys
    if omitted_active:
        raise HistoryError(
            "candidate omits latest-active shipped identity "
            f"{sorted(omitted_active)[0]}"
        )
    reconciled = revalidate_quarantine_result(
        candidate.quarantine,
        release_history={"releases": current.releases},
    )
    if candidate.withdrawals and reconciled is None:
        raise HistoryError(
            "candidate withdrawal lacks exact governed reconciliation inputs"
        )
    proofs = reconciled.withdrawal_proofs if reconciled is not None else ()
    proof_by_key = {
        (
            proof.finding.namespace,
            proof.finding.uid,
            proof.finding.identity,
        ): proof
        for proof in proofs
    }
    if len(proof_by_key) != len(proofs):
        raise HistoryError("candidate contains ambiguous duplicate withdrawal proofs")
    canonical_withdrawals = {
        (value.namespace, value.uid, value.identity): value
        for value in build_withdrawals(current, candidate.quarantine)
    }
    candidate_withdrawal_keys = {
        (note.namespace, note.uid, note.identity) for note in candidate.withdrawals
    }
    never_shipped = candidate_withdrawal_keys - set(existing)
    if never_shipped:
        raise HistoryError(
            f"candidate contains never-shipped withdrawal identity {sorted(never_shipped)[0]}"
        )
    if candidate_withdrawal_keys != set(canonical_withdrawals):
        raise HistoryError(
            "candidate withdrawals do not equal the canonical neutral withdrawal proof set"
        )
    accepted_findings = set(reconciled.accepted if reconciled is not None else ())
    for note in candidate.withdrawals:
        key = (note.namespace, note.uid, note.identity)
        proof = proof_by_key.get(key)
        canonical = canonical_withdrawals[key]
        if proof is None or proof.finding not in accepted_findings:
            raise HistoryError(
                f"candidate lacks corresponding accepted withdrawal proof {key}"
            )
        if note != canonical:
            raise HistoryError(
                f"candidate does not match canonical neutral withdrawal {key}"
            )
    notes = tuple(
        sorted(
            candidate_notes,
            key=lambda note: (note.namespace, note.uid, note.identity),
        )
    )
    new_entries = []
    memberships = []
    seen = set()
    for note in notes:
        key = (note.namespace, note.uid, note.identity)
        if key in seen:
            raise HistoryError(f"candidate contains duplicate packaged identity {key}")
        seen.add(key)
        contract = _model_contract(note)
        proposed_entry = {
            "namespace": note.namespace,
            "uid": note.uid,
            "identity": note.identity,
            "guid": note.guid,
            "kind": contract["kind"],
            "model": contract["model"],
            "deck": contract["deck"],
            "fields": contract["fields"],
            "template": contract["template"],
            "firstShippedReleaseId": candidate.release_id,
            "origin": "governed",
        }
        if key in existing:
            prior = existing[key]
            immutable_projection = {
                name: prior.get(name)
                for name in (
                    "namespace",
                    "uid",
                    "identity",
                    "guid",
                    "kind",
                    "model",
                    "deck",
                    "fields",
                    "template",
                )
            }
            candidate_projection = {
                name: proposed_entry[name] for name in immutable_projection
            }
            if canonical_json_bytes(immutable_projection) != canonical_json_bytes(
                candidate_projection
            ):
                raise HistoryError(f"candidate changed immutable identity contract {key}")
        else:
            if note.withdrawn:
                raise HistoryError(
                    f"candidate contains never-shipped withdrawal identity {key}"
                )
            new_entries.append(proposed_entry)
        shipped_hash = inspection.identity_fingerprints.get(key)
        if not isinstance(shipped_hash, str):
            raise HistoryError(f"inspection omitted identity fingerprint {key}")
        if note.namespace == "core":
            artifact_names = (
                "psychiatry_clerkship_ms3_core.apkg",
                "psychiatry_clerkship_ms3_complete.apkg",
            )
        elif note.namespace == "application":
            artifact_names = (
                "psychiatry_clerkship_ms3_application.apkg",
                "psychiatry_clerkship_ms3_complete.apkg",
            )
        else:
            artifact_names = ("psychiatry_clerkship_qbank.apkg",)
        membership = {
            "namespace": note.namespace,
            "uid": note.uid,
            "identity": note.identity,
            "status": "withdrawn" if note.withdrawn else "active",
            "approvedCardSha256": note.render_sha256,
            "shippedCardSha256": shipped_hash,
            "templateVersion": contract["templateVersion"],
            "artifacts": [
                {
                    "filename": filename,
                    "deckId": note.deck_id,
                    "deckName": contract["deck"]["name"],
                }
                for filename in artifact_names
            ],
        }
        if note.withdrawn:
            proof = proof_by_key[key]
            membership.update(
                withdrawalDisposition=(
                    "quarantined" if proof.disposition == "withdraw" else "retired"
                ),
                governanceDecisionSha256=proof.decision_sha256,
            )
        else:
            prior_state = _latest_membership(current, key)
            if prior_state is not None and prior_state[1].get("status") == "withdrawn":
                prior_release, prior_member = prior_state
                if prior_member.get("withdrawalDisposition") == "retired":
                    raise HistoryError(f"retired identity cannot reactivate {key}")
                if reconciled is None:
                    raise HistoryError(
                        "candidate reactivation lacks exact governed reconciliation inputs"
                    )
                resolved = next(
                    (
                        proof
                        for proof in reconciled.resolved_withdrawal_proofs
                        if (
                            proof.finding.namespace,
                            proof.finding.uid,
                            proof.finding.identity,
                        )
                        == key
                        and proof.decision_sha256
                        == prior_member.get("governanceDecisionSha256")
                        and proof.disposition == "withdraw"
                        and any(
                            resolved_finding.namespace == proof.finding.namespace
                            and resolved_finding.uid == proof.finding.uid
                            and resolved_finding.identity == proof.finding.identity
                            and resolved_finding.reason_code
                            == proof.finding.reason_code
                            and resolved_finding.subject_sha256
                            == proof.finding.subject_sha256
                            and resolved_finding.source_path
                            == proof.finding.source_path
                            and resolved_finding.first_seen_commit
                            == proof.finding.first_seen_commit
                            for resolved_finding in reconciled.resolved
                        )
                        and not any(
                            detected.namespace == proof.finding.namespace
                            and detected.uid == proof.finding.uid
                            and detected.identity == proof.finding.identity
                            and detected.reason_code == proof.finding.reason_code
                            and detected.subject_sha256
                            == proof.finding.subject_sha256
                            for detected in reconciled.detected_snapshot
                        )
                    ),
                    None,
                )
                if resolved is None:
                    raise HistoryError(
                        f"corrected quarantine lacks reviewed reactivation proof {key}"
                    )
                membership.update(
                    reactivatesReleaseId=prior_release.get("releaseId"),
                    reactivationDecisionSha256=resolved.decision_sha256,
                )
        memberships.append(membership)
    release = {
        "releaseId": candidate.release_id,
        "releaseDate": candidate.release_date.isoformat(),
        "releaseEpoch": candidate.release_epoch,
        "governedInputSha256": candidate.governed_input_sha256,
        "packages": deepcopy(dict(packages)),
        "csv": deepcopy(dict(csv_record)),
        "receiptContractSha256": receipt_contract,
        "migrationSeedReleaseId": migration.seed_release_id,
        "migrationContractSha256": migration.contract_sha256,
        "memberships": memberships,
    }
    proposed = HistoryRegistry(
        (*current.identity_entries, *new_entries), (*current.releases, release)
    )
    issues = validate_history(proposed, current)
    if issues:
        raise HistoryError(
            "proposed history append is invalid: "
            + "; ".join(f"{issue.code} {issue.subject}" for issue in issues)
        )
    return HistoryAppend(tuple(new_entries), release)


def _latest_membership(history: HistoryRegistry, key: tuple[object, ...]) -> tuple[dict, dict] | None:
    result = None
    for release in history.releases:
        for membership in release.get("memberships", ()):
            if _identity_key(membership) == key:
                result = release, membership
    return result


def _membership_in_release(
    history: HistoryRegistry, release_id: object, key: tuple[object, ...]
) -> tuple[dict, dict] | None:
    for release in history.releases:
        if release.get("releaseId") != release_id:
            continue
        for membership in release.get("memberships", ()):
            if _identity_key(membership) == key:
                return release, membership
    return None


def _neutral_fields(entry: Mapping) -> tuple[str, ...]:
    uid = str(entry["uid"])
    names = tuple(field["name"] for field in entry["fields"])
    if entry["namespace"] == "qbank":
        return (
            uid,
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
    notice = (
        '<span class="withdrawn">[WITHDRAWN SAFETY UPDATE]</span> '
        "This card is no longer active. Re-imported under the same UID to remove stale content."
    )
    answer = (
        '<div class="withdrawn">Do not use the prior clinical content. '
        "See the release notice and search this UID if manual suspension is needed.</div>"
    )
    values = []
    for name in names:
        if name == "UID":
            values.append(uid)
        elif name == "Text":
            values.append("{{c1::[WITHDRAWN SAFETY UPDATE]}} This card is no longer active.")
        elif name in {"Front", "Question"}:
            values.append(notice)
        elif name == "Answer":
            values.append(answer)
        elif name == "Meta":
            values.append("Anki safety release notice")
        else:
            values.append("")
    return tuple(values)


def _withdrawal_payload(value: Withdrawal) -> dict:
    return {
        "namespace": value.namespace,
        "uid": value.uid,
        "identity": value.identity,
        "guid": value.guid,
        "deckId": value.deck_id,
        "modelId": value.model_id,
        "templateOrdinal": value.template_ordinal,
        "fieldNames": value.field_names,
        "fieldIds": value.field_ids,
        "fields": value.fields,
        "tags": tuple(sorted(value.tags)),
        "templateContractSha256": value.template_contract_sha256,
        "withdrawalTemplateVersion": WITHDRAWAL_TEMPLATE_VERSION,
    }


def withdrawal_render_sha256(withdrawal: Withdrawal) -> str:
    """Hash exactly the neutral content plus frozen same-GUID identity contract."""

    return canonical_json_sha256(_withdrawal_payload(withdrawal))


def _preview(entry: Mapping, decision: Mapping, affected_release_id: str) -> Withdrawal:
    model_id = entry["model"]["id"]
    template_hash_key = {
        CORE_BASIC_MODEL_ID: "coreBasic",
        CORE_CLOZE_MODEL_ID: "coreCloze",
        APPLICATION_MODEL_ID: "application",
        LEGACY_QBANK_MODEL_ID: "legacyQbank",
    }.get(model_id)
    if template_hash_key is None:
        raise HistoryError(f"cannot construct withdrawal for unknown model {model_id}")
    fields = tuple(field["name"] for field in entry["fields"])
    field_ids = tuple(field.get("id") for field in entry["fields"])
    withdrawal = Withdrawal(
        namespace=entry["namespace"],
        uid=entry["uid"],
        identity=entry["identity"],
        guid=entry["guid"],
        deck_id=entry["deck"]["id"],
        deck_name=entry["deck"]["name"],
        model_id=model_id,
        model_name=entry["model"]["name"],
        template_id=entry["template"].get("id"),
        template_name=entry["template"]["name"],
        template_ordinal=entry["template"]["ordinal"],
        field_names=fields,
        field_ids=field_ids,
        fields=_neutral_fields(entry),
        tags=(
            "PsychClerkship",
            "Status::withdrawn",
            f"UID::{entry['uid']}",
        ),
        template_contract_sha256=TEMPLATE_CONTRACT_SHA256[template_hash_key],
        render_sha256="",
        reason_code=str(
            decision.get("reasonCode")
            or decision.get("retiredReason")
            or "SHIPPED_IDENTITY_MISSING"
        ),
        affected_release_id=affected_release_id,
        active=False,
        withdrawn=True,
    )
    return replace(withdrawal, render_sha256=withdrawal_render_sha256(withdrawal))


def preview_withdrawals(
    history: HistoryRegistry, decisions: Sequence[Mapping]
) -> tuple[Withdrawal, ...]:
    """Build neutral previews for decisions that name an actually shipped identity."""

    identities = {_identity_key(entry): entry for entry in history.identity_entries}
    previews = []
    seen = set()
    for decision in decisions:
        key = _identity_key(decision)
        entry = identities.get(key)
        if entry is None or key in seen:
            continue
        affected_release_id = decision.get("affectedReleaseId")
        membership = (
            _membership_in_release(history, affected_release_id, key)
            if affected_release_id
            else _latest_membership(history, key)
        )
        if membership is None:
            continue
        release, _ = membership
        previews.append(_preview(entry, decision, release["releaseId"]))
        seen.add(key)
    return tuple(sorted(previews, key=lambda item: (item.namespace, item.uid, item.identity)))


def _named(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _reviewed_withdrawal(decision: Mapping, preview: Withdrawal) -> bool:
    if decision.get("disposition") not in {"withdraw", "retire"}:
        return False
    if not all(
        _named(decision.get(name))
        for name in ("reviewOwner", "reviewedBy", "reviewedAt", "affectedReleaseId")
    ):
        return False
    try:
        date.fromisoformat(str(decision["reviewedAt"]))
    except ValueError:
        return False
    return (
        decision.get("affectedReleaseId") == preview.affected_release_id
        and decision.get("withdrawalTemplateVersion") == WITHDRAWAL_TEMPLATE_VERSION
        and decision.get("approvedWithdrawalSha256") == preview.render_sha256
    )


def build_withdrawals(
    history: HistoryRegistry, decisions: QuarantineResult
) -> tuple[Withdrawal, ...]:
    """Re-run Task 5 and build only exact neutral updates from governed inputs."""

    reconciled = revalidate_quarantine_result(
        decisions,
        release_history={"releases": history.releases},
    )
    if reconciled is None:
        return ()
    proofs = reconciled.withdrawal_proofs
    proof_keys = tuple(
        (proof.finding.namespace, proof.finding.uid, proof.finding.identity)
        for proof in proofs
    )
    if len(set(proof_keys)) != len(proof_keys):
        return ()
    preview_decisions = tuple(
        {
            "namespace": proof.finding.namespace,
            "uid": proof.finding.uid,
            "identity": proof.finding.identity,
            "reasonCode": proof.finding.reason_code,
            "affectedReleaseId": proof.affected_release_id,
        }
        for proof in proofs
    )
    proof_by_key = {
        (
            proof.finding.namespace,
            proof.finding.uid,
            proof.finding.identity,
        ): proof
        for proof in proofs
    }
    return tuple(
        preview
        for preview in preview_withdrawals(history, preview_decisions)
        if (
            (proof := proof_by_key[_identity_key(preview.__dict__)])
            and proof.withdrawal_template_version == WITHDRAWAL_TEMPLATE_VERSION
            and proof.approved_withdrawal_sha256 == preview.render_sha256
            and proof.finding.withdrawal_render_sha256 == preview.render_sha256
        )
    )


def audit_shipped_identities(
    history: HistoryRegistry,
    current_identities: set[tuple[str, str, str]],
    decisions: Sequence[Mapping],
) -> tuple[tuple[Withdrawal, ...], tuple[Issue, ...]]:
    """Expose missing shipped identities without silently authorizing their withdrawal."""

    latest: dict[tuple[object, object, object], tuple[dict, dict]] = {}
    for release in history.releases:
        for member in release.get("memberships", ()):
            latest[_identity_key(member)] = (release, member)
    decision_by_key = {_identity_key(decision): decision for decision in decisions}
    preview_decisions = []
    issues = []
    for key, (release, membership) in latest.items():
        if membership.get("status") != "active" or key in current_identities:
            continue
        issues.append(
            _issue(
                "SHIPPED_IDENTITY_MISSING",
                key,
                "a previously shipped identity is absent from canonical current inputs",
            )
        )
        decision = decision_by_key.get(key)
        if decision is None:
            decision = {
                "namespace": key[0],
                "uid": key[1],
                "identity": key[2],
                "reasonCode": "SHIPPED_IDENTITY_MISSING",
                "affectedReleaseId": release["releaseId"],
            }
        preview_decisions.append(decision)
        preview = preview_withdrawals(history, (decision,))
        if not preview or not _reviewed_withdrawal(decision, preview[0]):
            issues.append(
                _issue(
                    "WITHDRAWAL_TOMBSTONE_REQUIRED",
                    key,
                    "release waits for an explicit reviewed retired/quarantine tombstone",
                )
            )
    return preview_withdrawals(history, tuple(preview_decisions)), tuple(issues)


def _git(repo: Path, *args: str, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=text,
        check=False,
    )


def _git_show(repo: Path, revision: str, path: Path) -> bytes | None:
    result = _git(repo, "show", f"{revision}:{path.as_posix()}", text=False)
    if result.returncode == 0:
        return result.stdout
    missing = _git(repo, "cat-file", "-e", f"{revision}:{path.as_posix()}")
    if missing.returncode != 0:
        return None
    raise HistoryError(
        f"cannot read {path} at {revision}: {result.stderr.decode(errors='replace')}"
    )


def _parse_history_bytes(value: bytes, subject: str) -> HistoryRegistry:
    try:
        root = json.loads(value.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise HistoryError(f"invalid history at {subject}: {error}") from error
    if not isinstance(root, Mapping):
        raise HistoryError(f"invalid history root at {subject}")
    return history_from_dict(root)


def _expected_bootstrap(repo: Path) -> HistoryRegistry:
    try:
        return bootstrap_legacy_history(
            {
                "standalone": repo / LEGACY_STANDALONE_RELATIVE_PATH,
                "combined": repo / LEGACY_COMBINED_RELATIVE_PATH,
            },
            source_commit=LEGACY_SOURCE_COMMIT,
            shipped_at=LEGACY_RELEASE_DATE,
            release_id=LEGACY_RELEASE_ID,
            release_epoch=LEGACY_RELEASE_EPOCH,
        )
    except LegacyBootstrapError as error:
        raise HistoryError(f"cannot reproduce fresh legacy bootstrap: {error}") from error


def _first_parent_states(repo: Path) -> list[tuple[str, bytes | None]]:
    shallow = _git(repo, "rev-parse", "--is-shallow-repository")
    if shallow.returncode != 0 or shallow.stdout.strip() == "true":
        raise HistoryError(
            "history audit requires complete ancestry; fetch full history or pass an explicit reviewed base ref"
        )
    revisions = _git(repo, "rev-list", "--first-parent", "--reverse", "HEAD")
    if revisions.returncode != 0 or not revisions.stdout.strip():
        raise HistoryError("cannot enumerate complete first-parent Git history")
    return [
        (revision, _git_show(repo, revision, HISTORY_RELATIVE_PATH))
        for revision in revisions.stdout.splitlines()
    ]


def _audit_states(
    repo: Path, states: Sequence[tuple[str, bytes | None]]
) -> list[tuple[str, HistoryRegistry | None, bytes | None]]:
    expected = _expected_bootstrap(repo)
    expected_bytes = history_bytes(expected)
    parsed = []
    previous: HistoryRegistry | None = None
    seen_bootstrap = False
    for revision, raw in states:
        if raw is None:
            if previous is not None:
                raise HistoryError(
                    f"append-only history file disappeared at {revision}; fetch full history or pass an explicit reviewed base ref"
                )
            parsed.append((revision, None, raw))
            continue
        current = _parse_history_bytes(raw, revision)
        if current == EMPTY_HISTORY:
            if previous is not None and previous != EMPTY_HISTORY:
                raise HistoryError(f"append-only history was reset to empty at {revision}")
        elif not seen_bootstrap:
            if raw != expected_bytes:
                raise HistoryError(
                    f"first populated history at {revision} does not byte-match the independently reproduced bootstrap"
                )
            seen_bootstrap = True
        elif previous is not None and current != previous:
            transition_issues = validate_history(current, previous)
            if transition_issues:
                raise HistoryError(
                    f"append-only history transition failed at {revision}: "
                    + "; ".join(issue.code for issue in transition_issues)
                )
        previous = current
        parsed.append((revision, current, raw))
    if previous is not None and previous != EMPTY_HISTORY and not seen_bootstrap:
        raise HistoryError("history lineage lacks an independently reproduced bootstrap")
    return parsed


def _target_in(history: HistoryRegistry | None, release_id: str) -> bool:
    return history is not None and any(
        release.get("releaseId") == release_id for release in history.releases
    )


def _reject_ambiguous_merge(repo: Path, release_id: str, revisions: Sequence[str]) -> None:
    for revision in revisions:
        parents = _git(repo, "show", "-s", "--format=%P", revision)
        parent_ids = parents.stdout.strip().split()
        if len(parent_ids) < 2:
            continue
        containing = []
        for parent in parent_ids:
            raw = _git_show(repo, parent, HISTORY_RELATIVE_PATH)
            if raw is None:
                continue
            history = _parse_history_bytes(raw, parent)
            if _target_in(history, release_id):
                containing.append(raw)
        if len(containing) > 1 and len(set(containing)) > 1:
            raise HistoryError(
                "ambiguous multiple-branch release ancestry; fetch full history or pass an explicit reviewed base ref"
            )


def prepare_history_baseline(
    repo: Path,
    out: Path,
    base_ref: str | None = None,
    before_release_id: str | None = None,
    audit_lineage: bool = False,
) -> Path:
    """Write one reviewed baseline selected by an exclusive, fail-closed mode."""

    selectors = sum(
        (
            base_ref is not None,
            before_release_id is not None,
            bool(audit_lineage),
        )
    )
    if selectors != 1:
        raise ValueError(
            "exactly one of base_ref, before_release_id, or audit_lineage is required"
        )
    repo = Path(repo).resolve()
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    current_path = repo / HISTORY_RELATIVE_PATH
    if base_ref is not None:
        resolved = _git(repo, "rev-parse", "--verify", f"{base_ref}^{{commit}}")
        if resolved.returncode != 0:
            raise HistoryError(f"explicit base ref does not resolve to a commit: {base_ref}")
        base_commit = resolved.stdout.strip()
        ancestor = _git(repo, "merge-base", "--is-ancestor", base_commit, "HEAD")
        if ancestor.returncode != 0:
            raise HistoryError("explicit base ref is not an ancestor of HEAD")
        raw = _git_show(repo, base_commit, HISTORY_RELATIVE_PATH)
        if not current_path.exists():
            raise HistoryError("current release history file is missing")
        current_raw = current_path.read_bytes()
        current = _parse_history_bytes(current_raw, "working tree")
        if raw is None:
            expected = _expected_bootstrap(repo)
            if current_raw != history_bytes(expected):
                raise HistoryError(
                    "first-PR current history must byte-match a fresh legacy bootstrap"
                )
            out.write_bytes(history_bytes(EMPTY_HISTORY))
            return out
        baseline = _parse_history_bytes(raw, base_commit)
        issues = validate_history(current, baseline)
        if issues:
            raise HistoryError(
                "current history is not an append-only extension of explicit base ref: "
                + "; ".join(issue.code for issue in issues)
            )
        out.write_bytes(raw)
        return out

    states = _first_parent_states(repo)
    parsed = _audit_states(repo, states)
    if before_release_id is not None:
        _reject_ambiguous_merge(
            repo, before_release_id, [revision for revision, _, _ in parsed]
        )
        if not _target_in(parsed[-1][1], before_release_id):
            raise HistoryError(f"release ID {before_release_id!r} is absent from current history")
        prior = None
        for _, history, raw in parsed:
            if _target_in(history, before_release_id):
                break
            if history is not None:
                prior = raw
        if prior is None:
            prior = history_bytes(EMPTY_HISTORY)
        out.write_bytes(prior)
        baseline = _parse_history_bytes(prior, "selected prior baseline")
        current = parsed[-1][1]
        if current is None or validate_history(current, baseline):
            raise HistoryError("selected before-release baseline is not a valid prefix")
        return out

    current_raw = parsed[-1][2]
    current = parsed[-1][1]
    if current_raw is None or current is None:
        raise HistoryError("current HEAD has no release history to audit")
    out.write_bytes(current_raw)
    return out
