from pathlib import Path
import sys

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
ANKI_AUTOMATION = REPO_ROOT / "13_Faculty_Resources" / "_automation" / "anki"
sys.path.insert(0, str(ANKI_AUTOMATION))


@pytest.fixture
def legacy_qbank_path() -> Path:
    return Path(__file__).parent / "fixtures" / "legacy_qbank_2026-07-12.apkg"


@pytest.fixture
def legacy_all_path() -> Path:
    return Path(__file__).parent / "fixtures" / "legacy_all_2026-07-12.apkg"
