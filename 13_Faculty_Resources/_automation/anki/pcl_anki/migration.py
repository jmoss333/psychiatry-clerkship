"""Cross-version Anki package import with update-safe defaults."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Literal, Mapping, TypeAlias, TypeVar

from anki.collection import Collection, ImportLogWithChanges
from anki.import_export_pb2 import (
    IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS,
    ImportAnkiPackageOptions,
    ImportAnkiPackageRequest,
)

from pcl_anki.contract import (
    CandidateRelease,
    HistoryRegistry,
    canonical_json_bytes,
)


ImportResult: TypeAlias = ImportLogWithChanges
ReleaseIdentityMode: TypeAlias = Literal["new", "candidate_redeploy"]
WriterResult = TypeVar("WriterResult")


class ReleaseIdentityError(ValueError):
    """Raised before package writing when a release identity is unsafe."""


def _history_release_identity(release: Mapping) -> tuple[str, str, int]:
    release_id = release.get("releaseId")
    release_date = release.get("releaseDate")
    release_epoch = release.get("releaseEpoch")
    if (
        not isinstance(release_id, str)
        or not release_id
        or not isinstance(release_date, str)
        or not release_date
        or not isinstance(release_epoch, int)
        or isinstance(release_epoch, bool)
    ):
        raise ReleaseIdentityError("release history contains an invalid identity")
    return release_id, release_date, release_epoch


def preflight_release_identity(
    candidate: CandidateRelease,
    history: HistoryRegistry,
) -> ReleaseIdentityMode:
    """Classify a new append or exact latest-identity rebuild before writing."""

    if candidate.release_id is None or candidate.release_date is None:
        raise ReleaseIdentityError("candidate release ID and date are required")
    candidate_identity = (
        candidate.release_id,
        candidate.release_date.isoformat(),
        candidate.release_epoch,
    )
    historical = tuple(_history_release_identity(value) for value in history.releases)
    if not historical:
        return "new"
    if candidate_identity == historical[-1]:
        if (
            candidate.governed_input_sha256
            != history.releases[-1].get("governedInputSha256")
        ):
            raise ReleaseIdentityError(
                "candidate rebuild changed the recorded governed input digest"
            )
        return "candidate_redeploy"

    if any(candidate.release_id == release_id for release_id, _, _ in historical):
        raise ReleaseIdentityError("candidate reuses an existing release ID")
    if any(candidate.release_epoch == epoch for _, _, epoch in historical):
        raise ReleaseIdentityError("candidate reuses an existing release epoch")
    if candidate.release_epoch <= max(epoch for _, _, epoch in historical):
        raise ReleaseIdentityError(
            "new candidate release epoch must be greater than every prior epoch"
        )
    return "new"


def preflight_package_generation(
    candidate: CandidateRelease,
    history: HistoryRegistry,
    writer: Callable[[], WriterResult],
) -> WriterResult:
    """Run a package writer only after release identity checks succeed."""

    preflight_release_identity(candidate, history)
    return writer()


def match_latest_release_rebuild(
    candidate_record: Mapping[str, object], history: HistoryRegistry
) -> None:
    """Require a rebuilt record to exactly equal the latest recorded release."""

    if not history.releases:
        raise ReleaseIdentityError("cannot match a rebuild without release history")
    if canonical_json_bytes(candidate_record) != canonical_json_bytes(
        history.releases[-1]
    ):
        raise ReleaseIdentityError(
            "candidate rebuild must exactly match the latest release record"
        )


def import_package(collection: Collection, package_path: Path) -> ImportResult:
    """Import an APKG unconditionally while retaining learner scheduling."""

    options = ImportAnkiPackageOptions(
        update_notes=IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS,
        update_notetypes=IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS,
        with_scheduling=False,
    )
    if "with_deck_configs" in options.DESCRIPTOR.fields_by_name:
        options.with_deck_configs = False

    return collection.import_anki_package(
        ImportAnkiPackageRequest(
            package_path=str(package_path),
            options=options,
        )
    )
