#!/usr/bin/env python3
"""Write the SP red-team receipt after a completed checklist run.

Usage (only after actually running sp-proxy/REDTEAM_CHECKLIST.md against the
LIVE deploy — this script records an attestation, it does not perform one):

  python3 13_Faculty_Resources/_automation/maintenance/record_red_team.py \
      --state passed --signed-by "Joshua Moss, MD"

Writes 13_Faculty_Resources/_automation/maintenance/receipts/sp-red-team.json
in the schema monthly_review.py audits (state, checkedAt, packSha256), plus
audit-trail fields the steward ignores. checkedAt is timezone-aware UTC and
packSha256 is computed from the canonical pack bytes at write time, so the
steward's pack-recency and pack-hash checks cannot be satisfied accidentally.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "_prototypes" / "sp-interview" / "sp-interview.pack.json"
RECEIPT = Path(__file__).resolve().parent / "receipts" / "sp-red-team.json"


def build_receipt(pack_bytes, state, signed_by, sections, now):
    pack = json.loads(pack_bytes)
    return {
        "state": state,
        "checkedAt": now.isoformat(),
        "packSha256": sha256(pack_bytes).hexdigest(),
        "packVersion": pack.get("version", ""),
        "model": pack.get("engine", {}).get("modelPinned", ""),
        "sections": sections,
        "signedBy": signed_by,
        "checklist": "sp-proxy/REDTEAM_CHECKLIST.md",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", required=True, choices=["passed", "failed"])
    parser.add_argument("--signed-by", required=True)
    parser.add_argument("--sections", nargs="+", default=["A", "B", "C", "D", "E"])
    args = parser.parse_args(argv)
    receipt = build_receipt(
        PACK.read_bytes(), args.state, args.signed_by, args.sections,
        datetime.now(timezone.utc),
    )
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(
        "wrote %s state=%s packSha256=%s"
        % (RECEIPT.relative_to(ROOT), args.state, receipt["packSha256"][:12])
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
