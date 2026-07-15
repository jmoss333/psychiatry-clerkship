"""Write the six governed Anki release artifacts from one validated candidate."""

from __future__ import annotations

import csv
from copy import deepcopy
from datetime import date
import html
from hashlib import sha256
import io
import json
from pathlib import Path, PurePosixPath
import re
import tempfile
from typing import Iterable, Mapping, Sequence

import genanki

from pcl_anki.contract import (
    APPLICATION_ARTIFACT_FILENAME,
    APPLICATION_DECK_ID,
    APPLICATION_DECK_NAME,
    APPLICATION_MODEL_ID,
    COMPLETE_ARTIFACT_FILENAME,
    CORE_ARTIFACT_FILENAME,
    CORE_BASIC_MODEL_ID,
    CORE_CLOZE_MODEL_ID,
    CORE_DECK_ID,
    CORE_DECK_NAME,
    CandidateRelease,
    Issue,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_MODEL_ID,
    QBANK_ARTIFACT_FILENAME,
    QuarantineResult,
    RELEASE_ARTIFACT_FILENAMES,
    RenderedNote,
    Withdrawal,
)
from pcl_anki.inspect import (
    CSV_FIELDS,
    canonical_package_fingerprint,
    inspect_release,
    read_apkg,
    receipt_contract_sha256,
)
from pcl_anki.render import build_withdrawal_note, to_genanki_note


CSV_ARTIFACT_FILENAME = "psychiatry_clerkship_ms3_cards.csv"
RECEIPT_ARTIFACT_FILENAME = "anki_release_receipt.json"
RELEASE_FILENAMES = {
    *RELEASE_ARTIFACT_FILENAMES,
    CSV_ARTIFACT_FILENAME,
    RECEIPT_ARTIFACT_FILENAME,
}
_SHA256_RE = re.compile(r"[0-9a-f]{64}")
_SOURCE_URL_RE = re.compile(r'<a href="([^"]+)">Open reviewed source</a>')


class PackageWriteError(ValueError):
    """Raised before any candidate can become learner-facing files."""


def _hard_issues(issues: Iterable[Issue]) -> tuple[Issue, ...]:
    return tuple(issue for issue in issues if getattr(issue, "severity", None) == "hard")


def _valid_repo_relative_path(value: object) -> bool:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        return False
    path = PurePosixPath(value)
    return not path.is_absolute() and value == path.as_posix() and ".." not in path.parts


def _validate_ledger(candidate: CandidateRelease) -> None:
    ledger = candidate.governed_input_ledger
    if not isinstance(ledger, tuple) or not ledger:
        raise PackageWriteError("candidate requires a non-empty governed input ledger")
    if any(
        not isinstance(entry, tuple)
        or len(entry) != 2
        or not _valid_repo_relative_path(entry[0])
        or not isinstance(entry[1], str)
        or _SHA256_RE.fullmatch(entry[1]) is None
        for entry in ledger
    ):
        raise PackageWriteError("governed input ledger entries require repo-relative path/SHA-256 pairs")
    paths = tuple(path for path, _digest in ledger)
    if paths != tuple(sorted(paths)) or len(set(paths)) != len(paths):
        raise PackageWriteError("governed input ledger paths must be sorted and unique")


def _validate_candidate(candidate: CandidateRelease) -> tuple[RenderedNote, ...]:
    if not isinstance(candidate, CandidateRelease):
        raise PackageWriteError("write_release requires a CandidateRelease")
    if _hard_issues(candidate.issues):
        raise PackageWriteError("candidate contains hard governance issues")
    if not isinstance(candidate.release_id, str) or not candidate.release_id.strip():
        raise PackageWriteError("candidate requires a governed release ID")
    if not isinstance(candidate.release_date, date):
        raise PackageWriteError("candidate requires a governed release date")
    if (
        not isinstance(candidate.release_epoch, int)
        or isinstance(candidate.release_epoch, bool)
        or candidate.release_epoch < 0
    ):
        raise PackageWriteError("candidate release epoch must be a nonnegative integer")
    if (
        not isinstance(candidate.governed_input_sha256, str)
        or _SHA256_RE.fullmatch(candidate.governed_input_sha256) is None
    ):
        raise PackageWriteError("candidate requires a governed input SHA-256")
    _validate_ledger(candidate)
    if not isinstance(candidate.quarantine, QuarantineResult):
        raise PackageWriteError("candidate requires the reconciled QuarantineResult")

    active_groups = (
        (candidate.core_active, "core", {CORE_BASIC_MODEL_ID, CORE_CLOZE_MODEL_ID}),
        (candidate.application_active, "application", {APPLICATION_MODEL_ID}),
        (candidate.qbank_active, "qbank", {LEGACY_QBANK_MODEL_ID}),
    )
    active: list[RenderedNote] = []
    for values, namespace, models in active_groups:
        if not isinstance(values, tuple):
            raise PackageWriteError(f"candidate {namespace} active notes must be a tuple")
        for note in values:
            if (
                not isinstance(note, RenderedNote)
                or note.namespace != namespace
                or note.model_id not in models
                or not note.active
                or note.withdrawn
                or not note.front_html
                or not note.back_html
            ):
                raise PackageWriteError(f"candidate contains invalid active {namespace} note")
            active.append(note)
    if not isinstance(candidate.withdrawals, tuple) or any(
        not isinstance(value, Withdrawal) for value in candidate.withdrawals
    ):
        raise PackageWriteError("candidate withdrawals require verified Withdrawal objects")
    try:
        withdrawals = tuple(build_withdrawal_note(value) for value in candidate.withdrawals)
    except (TypeError, ValueError) as error:
        raise PackageWriteError(f"candidate withdrawal proof failed: {error}") from error
    all_notes = (*active, *withdrawals)
    keys = [(note.namespace, note.uid, note.identity) for note in all_notes]
    guids = [note.guid for note in all_notes]
    if len(set(keys)) != len(keys) or len(set(guids)) != len(guids):
        raise PackageWriteError("candidate contains duplicate identities or GUIDs")
    return withdrawals


def write_apkg(decks, path: Path, build_epoch: int) -> None:
    """Write a real APKG using the candidate's explicit monotonic epoch."""

    genanki.Package(decks).write_to_file(str(path), timestamp=float(build_epoch))


def _deck(deck_id: int, deck_name: str, notes: Sequence[RenderedNote]) -> genanki.Deck:
    deck = genanki.Deck(deck_id, deck_name)
    for note in notes:
        deck.add_note(to_genanki_note(note))
    return deck


def _file_record(path: Path) -> dict[str, object]:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"sha256": digest.hexdigest(), "sizeBytes": path.stat().st_size}


def _source_url(note: RenderedNote) -> str:
    matches = [match for field in note.fields for match in _SOURCE_URL_RE.findall(field)]
    if len(matches) > 1:
        raise PackageWriteError(f"active note {note.uid} contains multiple reviewed source URLs")
    return html.unescape(matches[0]) if matches else ""


def _csv_bytes(notes: Sequence[RenderedNote]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    for note in sorted(notes, key=lambda value: (value.namespace, value.uid, value.identity)):
        writer.writerow(
            {
                "artifactRole": "faculty_audit_interchange",
                "namespace": note.namespace,
                "uid": note.uid,
                "identity": note.identity,
                "guid": note.guid,
                "deckId": note.deck_id,
                "modelId": note.model_id,
                "templateOrdinal": note.template_ordinal,
                "fieldsJson": json.dumps(
                    note.fields, ensure_ascii=False, separators=(",", ":")
                ),
                "tagsJson": json.dumps(
                    tuple(sorted(note.tags)), ensure_ascii=False, separators=(",", ":")
                ),
                "templateContractSha256": note.template_contract_sha256,
                "renderSha256": note.render_sha256,
                "sourceUrl": _source_url(note),
            }
        )
    return stream.getvalue().encode("utf-8")


def _package_record(path: Path, active: int, withdrawals: int) -> dict[str, object]:
    snapshot = read_apkg(path)
    return {
        "contentFingerprintSha256": canonical_package_fingerprint(snapshot),
        "activeNoteCount": active,
        "withdrawalNoteCount": withdrawals,
        "totalNoteCount": len(snapshot.notes),
        "scheduledCardCount": len(snapshot.cards),
    }


def _quarantine_summary(candidate: CandidateRelease) -> dict[str, int]:
    result = candidate.quarantine
    return {
        "newCount": len(result.new),
        "changedCount": len(result.changed),
        "acceptedCount": len(result.accepted),
        "resolvedCount": len(result.resolved),
        "withdrawalProofCount": len(result.withdrawal_proofs),
        "resolvedWithdrawalProofCount": len(result.resolved_withdrawal_proofs),
    }


def _write_release_in(candidate: CandidateRelease, withdrawals: tuple[RenderedNote, ...], root: Path) -> dict:
    core_withdrawals = tuple(note for note in withdrawals if note.namespace == "core")
    application_withdrawals = tuple(
        note for note in withdrawals if note.namespace == "application"
    )
    qbank_withdrawals = tuple(note for note in withdrawals if note.namespace == "qbank")
    core_notes = (*candidate.core_active, *core_withdrawals)
    application_notes = (*candidate.application_active, *application_withdrawals)
    qbank_notes = (*candidate.qbank_active, *qbank_withdrawals)

    core_deck = _deck(CORE_DECK_ID, CORE_DECK_NAME, core_notes)
    application_deck = _deck(
        APPLICATION_DECK_ID, APPLICATION_DECK_NAME, application_notes
    )
    qbank_deck = _deck(
        LEGACY_QBANK_DECK_ID, LEGACY_QBANK_DECK_NAME, qbank_notes
    )
    write_apkg(core_deck, root / CORE_ARTIFACT_FILENAME, candidate.release_epoch)
    write_apkg(
        application_deck,
        root / APPLICATION_ARTIFACT_FILENAME,
        candidate.release_epoch,
    )
    write_apkg(
        [core_deck, application_deck],
        root / COMPLETE_ARTIFACT_FILENAME,
        candidate.release_epoch,
    )
    write_apkg(qbank_deck, root / QBANK_ARTIFACT_FILENAME, candidate.release_epoch)

    active_csv_notes = (*candidate.core_active, *candidate.application_active)
    csv_path = root / CSV_ARTIFACT_FILENAME
    csv_path.write_bytes(_csv_bytes(active_csv_notes))
    package_records = {
        CORE_ARTIFACT_FILENAME: _package_record(
            root / CORE_ARTIFACT_FILENAME,
            len(candidate.core_active),
            len(core_withdrawals),
        ),
        APPLICATION_ARTIFACT_FILENAME: _package_record(
            root / APPLICATION_ARTIFACT_FILENAME,
            len(candidate.application_active),
            len(application_withdrawals),
        ),
        COMPLETE_ARTIFACT_FILENAME: _package_record(
            root / COMPLETE_ARTIFACT_FILENAME,
            len(candidate.core_active) + len(candidate.application_active),
            len(core_withdrawals) + len(application_withdrawals),
        ),
        QBANK_ARTIFACT_FILENAME: _package_record(
            root / QBANK_ARTIFACT_FILENAME,
            len(candidate.qbank_active),
            len(qbank_withdrawals),
        ),
    }
    artifact_records = {
        filename: _file_record(root / filename)
        for filename in (*RELEASE_ARTIFACT_FILENAMES, CSV_ARTIFACT_FILENAME)
    }
    csv_record = {
        "filename": CSV_ARTIFACT_FILENAME,
        **artifact_records[CSV_ARTIFACT_FILENAME],
    }
    source_urls = sorted(
        {
            url
            for note in active_csv_notes
            if (url := _source_url(note))
        }
    )
    receipt: dict[str, object] = {
        "schemaVersion": 1,
        "releaseId": candidate.release_id,
        "releaseDate": candidate.release_date.isoformat(),
        "releaseEpoch": candidate.release_epoch,
        "governedInputSha256": candidate.governed_input_sha256,
        "governedInputLedger": [
            {"path": path, "sha256": digest}
            for path, digest in candidate.governed_input_ledger
        ],
        "packages": package_records,
        "artifacts": artifact_records,
        "csv": csv_record,
        "coverage": deepcopy(dict(candidate.coverage)),
        "quarantineSummary": _quarantine_summary(candidate),
        "sourceUrls": source_urls,
    }
    receipt["receiptContractSha256"] = receipt_contract_sha256(receipt)
    (root / RECEIPT_ARTIFACT_FILENAME).write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return receipt


def write_release(candidate: CandidateRelease, out_dir: Path) -> dict:
    """Write exactly four APKGs, active-only CSV, and a governed receipt."""

    withdrawals = _validate_candidate(candidate)
    out_dir = Path(out_dir)
    if out_dir.exists() and any(out_dir.iterdir()):
        raise PackageWriteError("release output directory must be empty")
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".pcl-anki-release-", dir=out_dir.parent) as temporary:
        staged = Path(temporary)
        try:
            receipt = _write_release_in(candidate, withdrawals, staged)
            inspection = inspect_release(staged, receipt)
        except (OSError, ValueError) as error:
            raise PackageWriteError(f"could not write governed release: {error}") from error
        hard = _hard_issues(inspection.issues)
        if hard:
            raise PackageWriteError(
                "written release failed SQLite inspection: "
                + "; ".join(f"{issue.code} {issue.subject}" for issue in hard)
            )
        if {path.name for path in staged.iterdir()} != RELEASE_FILENAMES:
            raise PackageWriteError("writer did not produce the exact six-artifact set")
        try:
            if out_dir.exists():
                out_dir.rmdir()
            staged.replace(out_dir)
        except OSError as error:
            raise PackageWriteError(
                f"could not publish the inspected release atomically: {error}"
            ) from error
    return receipt
