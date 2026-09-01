#!/usr/bin/env bash
# Evidence Inbox — scan the general drop folder for new studies/documents.
#
# Thin wrapper over the OpenEvidence scanner, pointed at a second inbox with its
# own ledger. The OpenEvidence folder and its manifest are untouched.
#
#   bash bin/evidence-inbox.sh                    # scan + extract text to staging
#   bash bin/evidence-inbox.sh --list             # scan only
#   bash bin/evidence-inbox.sh --commit "X.pdf"   # mark a file triaged
#   bash bin/evidence-inbox.sh --pending          # attestation queue
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCANNER="$ROOT/13_Faculty_Resources/_automation/oe_scanner/oe_scan.py"
exec python3 "$SCANNER" \
  --folder   "$ROOT/Evidence Inbox" \
  --manifest "$ROOT/13_Faculty_Resources/_automation/oe_scanner/evidence_inbox_manifest.json" \
  "$@"
