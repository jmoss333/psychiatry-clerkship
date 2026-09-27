#!/usr/bin/env python3
"""Record faculty red-team judgments for a prepared, exact-deploy work file."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from .red_team_deploys import EvidenceUnavailable, fetch_snapshot
except ImportError:  # direct script execution
    from red_team_deploys import EvidenceUnavailable, fetch_snapshot

ROOT = Path(__file__).resolve().parents[3]
RECEIPT = Path(__file__).resolve().parent / "receipts" / "sp-red-team.json"
CHECKLIST = "sp-proxy/REDTEAM_CHECKLIST.md"
REASON_CODES = ("not_tested", "unexpected_behavior", "clinical_review_needed",
                "environment_blocked", "other")
MANUAL_ROWS = {
    "A": tuple(f"A{i}" for i in range(1, 6)),
    "C": ("C1", "C2", "C4", "C5"),
    "D": ("D2", "D3", "D4", "D6", "D7"),
    "E": ("E",),
    "R": tuple(f"R{i}" for i in range(1, 17)),
    "V": tuple(f"V{i}" for i in range(1, 11)),
}


class IncompleteReview(ValueError):
    """The work cannot support a passed human receipt."""


def required_sections(runtime: dict) -> list[str]:
    if (not isinstance(runtime, dict)
            or not isinstance(runtime.get("realtimeEnabled"), bool)
            or not isinstance(runtime.get("managedVoiceEnabled"), bool)):
        raise IncompleteReview("voice activation unverified")
    sections = ["A", "B", "C", "D", "E"]
    if runtime["realtimeEnabled"]:
        if not runtime.get("realtimeModel") or not runtime.get("transcriptionModel"):
            raise IncompleteReview("realtime model pins unverified")
        sections.append("R")
    if runtime["managedVoiceEnabled"]:
        if not isinstance(runtime.get("managedVoiceStack"), dict) or not runtime["managedVoiceStack"].get("id"):
            raise IncompleteReview("managed voice stack unverified")
        sections.append("V")
    return sections


def _manual_ids(sections: list[str]) -> tuple[str, ...]:
    return tuple(row for section in sections for row in MANUAL_ROWS.get(section, ()))


def build_receipt(work: dict, manual_rows: dict, signed_by: str, now: datetime,
                  preserve_incomplete: bool = False) -> dict:
    """Build a bounded receipt. Only all-pass evidence can produce ``passed``."""
    if not isinstance(now, datetime) or now.tzinfo is None or now.utcoffset() is None:
        raise IncompleteReview("checkedAt requires a timezone")
    if not isinstance(signed_by, str) or not signed_by.strip() or len(signed_by.strip()) > 120:
        raise IncompleteReview("signedBy must name the owner")
    if not isinstance(work, dict) or work.get("state") != "prepared":
        raise IncompleteReview("prepared work evidence required")
    try:
        runtime = work["runtime"]
        sections = required_sections(runtime)
        mechanical = work["mechanical"]
        deployments = work["deployments"]
        if set(deployments) != {"proxy", "ms3", "res"}:
            raise IncompleteReview("three exact deploys required")
        for key in ("proxy", "ms3", "res"):
            if any(not deployments[key].get(field) for field in
                   ("siteId", "deployId", "commitRef", "deployUrl", "publishedAt")):
                raise IncompleteReview(f"{key} exact deploy incomplete")
        if runtime.get("actorModel") != work["model"] or runtime.get("evaluatorModel") != work["model"]:
            raise IncompleteReview("runtime model mismatch")
        if not work.get("packSha256") or not work.get("packVersion") or not work.get("model"):
            raise IncompleteReview("pack evidence incomplete")
        if (not isinstance(work.get("packSourceCommit"), str)
                or not re.fullmatch(r"[0-9a-f]{40}", work["packSourceCommit"])):
            raise IncompleteReview("pack source revision incomplete")
        tier1, tier2 = mechanical["tier1"], mechanical["tier2"]
        checks = tier2.get("checks")
        mechanical_ok = (
            all(mechanical[key].get("state") == "passed" and
                mechanical[key].get("checkedAt") for key in ("tier1", "tier2"))
            and isinstance(tier1.get("passes"), int) and tier1["passes"] > 0
            and tier1.get("total") == tier1["passes"]
            and tier1.get("sourceCommit") == deployments["proxy"]["commitRef"]
            and isinstance(checks, list) and len(checks) == 5
            and {check.get("id") for check in checks if isinstance(check, dict)} ==
                {"D0", "D1", "D1b", "D5", "B5"}
            and all(isinstance(check, dict) and check.get("status") == "pass"
                    for check in checks))
        if not mechanical_ok and not preserve_incomplete:
            raise IncompleteReview("mechanical tier incomplete")
    except (KeyError, TypeError, AttributeError) as exc:
        raise IncompleteReview("prepared evidence malformed") from exc
    if not isinstance(manual_rows, dict):
        raise IncompleteReview("manual rows malformed")
    required_ids = _manual_ids(sections)
    if set(manual_rows) - set(required_ids):
        raise IncompleteReview("manual rows include unknown IDs")
    sanitized = {}
    incomplete = []
    for row_id in required_ids:
        row = manual_rows.get(row_id)
        if row is None:
            incomplete.append(row_id)
            continue
        if not isinstance(row, dict) or set(row) != {"status", "reason"}:
            raise IncompleteReview(f"{row_id} row malformed")
        status, reason = row["status"], row["reason"]
        if status not in ("pass", "fail", "blocked"):
            raise IncompleteReview(f"{row_id} status invalid")
        if (status == "pass" and reason != "") or (status != "pass" and reason not in REASON_CODES):
            raise IncompleteReview(f"{row_id} reason must be a content-free code")
        sanitized[row_id] = {"status": status, "reason": reason}
        if status != "pass":
            incomplete.append(row_id)
    if not mechanical_ok:
        incomplete.append("mechanical")
    if incomplete and not preserve_incomplete:
        raise IncompleteReview("required manual row missing, failed, or blocked: " + ", ".join(incomplete))
    completed = [section for section in sections if
                 (section == "B" and mechanical_ok) or
                 (section != "B" and all(row not in incomplete for row in MANUAL_ROWS.get(section, ())))]
    voice_stack = runtime.get("managedVoiceStack")
    safe_runtime = {key: runtime.get(key) for key in
                    ("actorModel", "evaluatorModel", "realtimeEnabled", "realtimeModel",
                     "transcriptionModel", "managedVoiceEnabled")}
    safe_runtime["managedVoiceStack"] = (
        {key: voice_stack.get(key) for key in
         ("id", "transcriptionModel", "synthesisModel")}
        if isinstance(voice_stack, dict) else None)
    safe_mechanical = {
        "tier1": {key: tier1.get(key) for key in
                  ("state", "checkedAt", "passes", "total", "sourceCommit")},
        "tier2": {"state": tier2.get("state"), "checkedAt": tier2.get("checkedAt"),
                  "checks": [{"id": check.get("id"), "status": check.get("status")}
                             for check in (checks if isinstance(checks, list) else [])
                             if isinstance(check, dict)]},
    }
    return {
        "schemaVersion": 2, "state": "incomplete" if incomplete else "passed",
        "checkedAt": now.isoformat(), "packSha256": work["packSha256"],
        "packVersion": work["packVersion"], "model": work["model"],
        "packSourceCommit": work["packSourceCommit"],
        "deployments": {key: {field: deployments[key][field] for field in
                             ("siteId", "deployId", "commitRef", "deployUrl", "publishedAt")}
                        for key in ("proxy", "ms3", "res")},
        "runtime": safe_runtime, "requiredSections": sections,
        "completedSections": completed, "manualRows": sanitized,
        "incompleteRows": incomplete, "mechanical": safe_mechanical,
        "signedBy": signed_by.strip(), "checklist": CHECKLIST,
    }


def _current_snapshot() -> dict:
    token = os.environ.get("NETLIFY_AUTH_TOKEN", "")
    if not token:
        raise EvidenceUnavailable("Netlify token unavailable for final deploy check")
    config_path = Path(__file__).resolve().parent / "maintenance_config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    return fetch_snapshot(config, token)


def _same_deployed_evidence(work: dict, snapshot: dict) -> bool:
    try:
        if any(work[field] != snapshot[field] for field in
               ("packSha256", "packVersion", "model")):
            return False
        for key in ("proxy", "ms3", "res"):
            if any(work["deployments"][key][field] != snapshot["deployments"][key][field]
                   for field in ("siteId", "deployId", "commitRef", "deployUrl", "publishedAt")):
                return False
        return True
    except (KeyError, TypeError):
        return False


def record_interactive(work_path: Path, receipt_path: Path = RECEIPT,
                       current_snapshot=None) -> int:
    try:
        work = json.loads(work_path.read_text(encoding="utf-8"))
        sections = required_sections(work["runtime"])
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Prepared work unavailable: {exc}", file=sys.stderr)
        return 2
    print("Exact production revisions for this review:")
    for key in ("proxy", "ms3", "res"):
        deploy = work["deployments"][key]
        print(f"  {key}: {deploy['deployId']}  commit {deploy['commitRef']}  {deploy['deployUrl']}")
    print(f"Pack {work['packVersion']} · SHA-256 {work['packSha256']} · source {work['packSourceCommit']} · model {work['model']}")
    print("Read sp-proxy/REDTEAM_CHECKLIST.md while testing each row. Enter no patient text, audio, or passcode here.")
    print("Mechanical B, C3, D1, and D5 were checked in preparation. Human rows:")
    rows = {}
    for row_id in _manual_ids(sections):
        answer = input(f"{row_id} [pass/fail/blocked]: ").strip().lower()
        if answer not in ("pass", "fail", "blocked"):
            print(f"Invalid result for {row_id}; nothing written.", file=sys.stderr)
            return 2
        reason = input(f"{row_id} reason code ({'/'.join(REASON_CODES)}): ").strip() if answer != "pass" else ""
        rows[row_id] = {"status": answer, "reason": reason}
    signed_by = input("Your name and role: ").strip()
    try:
        receipt = build_receipt(work, rows, signed_by, datetime.now(timezone.utc),
                                preserve_incomplete=True)
    except IncompleteReview as exc:
        print(f"Review cannot be recorded: {exc}", file=sys.stderr)
        return 2
    print(f"Result: {receipt['state']}  completed {', '.join(receipt['completedSections'])}")
    if receipt["incompleteRows"]:
        print("Incomplete rows: " + ", ".join(receipt["incompleteRows"]))
    phrase = "I attest this complete review" if receipt["state"] == "passed" else "Preserve incomplete review"
    if input(f"Type '{phrase}' to write the receipt: ").strip() != phrase:
        print("No receipt written.")
        return 2
    if receipt["state"] == "passed":
        try:
            fresh = (current_snapshot or _current_snapshot)()
        except (EvidenceUnavailable, OSError, ValueError) as exc:
            print(f"Final production deploy check unavailable: {exc}", file=sys.stderr)
            return 2
        if not _same_deployed_evidence(work, fresh):
            print("Production deploy, pack, or model changed since preparation; no passed receipt written.",
                  file=sys.stderr)
            return 2
        receipt["checkedAt"] = datetime.now(timezone.utc).isoformat()
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(receipt_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump(receipt, output, indent=2, sort_keys=True)
        output.write("\n")
    print(f"Wrote {receipt_path}. Review and commit it separately.")
    return 0 if receipt["state"] == "passed" else 2


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-file", type=Path, required=True)
    args = parser.parse_args(argv)
    return record_interactive(args.work_file)


if __name__ == "__main__":
    sys.exit(main())
