#!/usr/bin/env python3
"""DEV-ONLY: diff crisis_resources.json against the upstream ReConnect crisis dataset.

NOT part of the build. Netlify checks out only this repo, so the ReConnect working copy
does not exist on the build runner; this tool is run by hand on a machine that has both
repos, and its output is reviewed by a clinician before any edit is made.

    python3 13_Faculty_Resources/_automation/sync_crisis_from_reconnect.py \
        --reconnect ~/Code/reconnect-psychiatry-system

The ReConnect path is a REQUIRED ARGUMENT and is never hard-coded — CLAUDE.md forbids
hard-coded /Users paths in tracked .py, and CI lints for it.

This tool reports; it never writes. Crisis numbers change only through a human edit to
crisis_resources.json accompanied by re-verification against the official source, matching
ReConnect's own steward rule that crisis-category contradictions are escalated, not
self-edited.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "crisis_resources.json"

RECORD_REF = re.compile(r"^crisis\[(\d+)\]")


def digits(value):
    """Comparable digit-only form of a phone-ish string ('Text HOME to 741741' -> '741741').

    Strips the US country code so '1-888-568-1112' and '(888) 568-1112' compare equal —
    otherwise every toll-free number reports as drift and the report stops being read.
    """
    only = re.sub(r"\D", "", value or "")
    if len(only) == 11 and only.startswith("1"):
        only = only[1:]
    return only


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reconnect",
        required=True,
        type=Path,
        help="Path to a reconnect-psychiatry-system checkout",
    )
    args = parser.parse_args()

    upstream_path = args.reconnect.expanduser() / "databases" / "core" / "data_all.json"
    if not upstream_path.exists():
        print("upstream not found: %s" % upstream_path, file=sys.stderr)
        print("pass --reconnect <path-to-reconnect-psychiatry-system>", file=sys.stderr)
        return 2

    local = json.loads(DATA.read_text(encoding="utf-8"))
    upstream = json.loads(upstream_path.read_text(encoding="utf-8")).get("crisis", [])

    print("upstream: %s (%d crisis records)" % (upstream_path, len(upstream)))
    print("local:    %s (%d resources)\n" % (DATA.name, len(local["resources"])))

    stale, drift = [], []

    for resource in local["resources"]:
        ref = resource.get("reconnectRecord")
        if not ref:
            print("  %-22s no upstream record (local-only)" % resource["id"])
            continue
        match = RECORD_REF.match(ref)
        if not match or int(match.group(1)) >= len(upstream):
            print("  %-22s upstream record ref unresolvable: %s" % (resource["id"], ref))
            continue

        record = upstream[int(match.group(1))]
        up_phone = record.get("phone") or ""
        up_verified = record.get("last_verified_date") or "unknown"

        note = ""
        if digits(up_phone) and digits(up_phone) != digits(resource["contact"]):
            note = "  <-- DIGITS DIFFER"
            drift.append((resource["id"], resource["contact"], up_phone))
        if up_verified < resource["verifiedOn"]:
            stale.append((resource["id"], up_verified, resource["verifiedOn"]))

        print(
            "  %-22s local %r (verified %s) | upstream %r (verified %s)%s"
            % (
                resource["id"],
                resource["contact"],
                resource["verifiedOn"],
                up_phone,
                up_verified,
                note,
            )
        )

    print()
    if drift:
        print("DRIFT — review each against the official source before changing anything:")
        for rid, local_value, up_value in drift:
            print("  %s: local %r vs upstream %r" % (rid, local_value, up_value))
    else:
        print("No digit-level drift against upstream.")

    if stale:
        print(
            "\nUpstream is OLDER than this snapshot for %d record(s) — do not pull those back:"
            % len(stale)
        )
        for rid, up_verified, local_verified in stale:
            print("  %s: upstream %s < local %s" % (rid, up_verified, local_verified))

    for discrepancy in local.get("upstreamDiscrepancies", []):
        print(
            "\nKNOWN UPSTREAM DISCREPANCY — %s\n  upstream %r vs verified %r (%s)\n  %s"
            % (
                discrepancy["reconnectRecord"],
                discrepancy["upstreamValue"],
                discrepancy["verifiedValue"],
                discrepancy["verificationSource"],
                discrepancy["action"],
            )
        )

    print("\nReport only — nothing was written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
