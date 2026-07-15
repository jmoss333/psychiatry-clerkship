"""Cross-version Anki package import with update-safe defaults."""

from __future__ import annotations

from pathlib import Path
from typing import TypeAlias

from anki.collection import Collection, ImportLogWithChanges
from anki.import_export_pb2 import (
    IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS,
    ImportAnkiPackageOptions,
    ImportAnkiPackageRequest,
)


ImportResult: TypeAlias = ImportLogWithChanges


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
