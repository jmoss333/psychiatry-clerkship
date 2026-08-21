#!/usr/bin/env python3
"""Production rotation edition must stay exactly empty and disabled.

Extracted from ci.yml's inline "Guard — production rotation edition stays exactly
empty and disabled" step so bin/verify.sh can run the same contract locally instead
of the gate existing only inside the workflow. Kept byte-exact on purpose: the point
is that these two files do not drift by so much as a space until the feature ships.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURATION = ROOT / "13_Faculty_Resources" / "Rotation_Curation"

LOCKED = {
    "rotation_edition_catalog.json": b'{"schemaVersion":1,"records":[]}\n',
    "rotation_edition_catalog_governance.json": (
        b'{"schemaVersion":1,"manifestRevision":1,'
        b'"rotationEditionV2":"disabled","dispositions":[]}\n'
    ),
}


def main():
    for name, locked in LOCKED.items():
        observed = (CURATION / name).read_bytes()
        if observed != locked:
            print(
                f"{name} must remain the exact empty/disabled production baseline",
                file=sys.stderr,
            )
            return 1
    print(f"rotation edition: {len(LOCKED)} production file(s) locked empty and disabled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
