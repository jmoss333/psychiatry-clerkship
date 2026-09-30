#!/usr/bin/env python3
"""DEV-ONLY: diff crisis_resources.json against the upstream ReConnect crisis dataset.

This is NOT part of the build. Netlify checks out only this repo, so the ReConnect working
copy never exists on the build runner. Run it by hand on a machine that has both repos,
and have a clinician review its output before anything is edited.

    python3 13_Faculty_Resources/_automation/sync_crisis_from_reconnect.py \\
        --reconnect ~/Code/reconnect-psychiatry-system

Since #899 this is a thin wrapper around `sync_from_reconnect.py --dataset crisis`, kept so
existing docs and habits keep working. Its report is byte-identical to the pre-#899 output
(pinned by tests/fixtures/reconnect/crisis_report.golden.txt). One thing is new: it now
exits 1 when it finds drift.

The ReConnect path is a REQUIRED ARGUMENT and is never hard-coded. The tool reports; it never
writes. Crisis numbers change only through a human edit to crisis_resources.json, backed by
re-verification against the official source. That matches ReConnect's own steward rule:
a contradiction in the crisis category is escalated, not self-edited.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_from_reconnect import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(["--dataset", "crisis", *sys.argv[1:]]))
