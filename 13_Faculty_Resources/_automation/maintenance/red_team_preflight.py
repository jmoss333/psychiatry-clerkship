#!/usr/bin/env python3
"""Prepare exact-deploy red-team evidence without making a human verdict."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

try:
    from .red_team_deploys import EvidenceUnavailable, deployed_pack_bytes, fetch_snapshot
except ImportError:  # direct script execution
    from red_team_deploys import EvidenceUnavailable, deployed_pack_bytes, fetch_snapshot


ROOT = Path(__file__).resolve().parents[3]
CONFIG = Path(__file__).resolve().parent / "maintenance_config.json"
TIER1 = ROOT / "bin" / "redteam-offline.mjs"
TIER2 = ROOT / "bin" / "redteam-live.sh"
LIVE_IDS = {"D0", "D1", "D1b", "D5", "B5"}


def run_tier1(pack_bytes: bytes) -> dict:
    with tempfile.TemporaryDirectory(prefix="sp-redteam-pack-") as directory:
        pack_path = Path(directory) / "deployed-pack.json"
        pack_path.write_bytes(pack_bytes)
        try:
            result = subprocess.run(
                ["node", str(TIER1), str(pack_path)], cwd=ROOT, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise EvidenceUnavailable("Tier 1 failed or empty") from exc
    counts = re.findall(r"(\d+)/(\d+) deterministic probes pass", result.stdout)
    if result.returncode or len(counts) != 1:
        raise EvidenceUnavailable("Tier 1 failed or empty")
    passes, total = map(int, counts[0])
    return {"state": "passed", "passes": passes, "total": total}


def run_tier2(endpoint: str) -> dict:
    if not sys.stdin.isatty():
        raise EvidenceUnavailable("Tier 2 requires an attached terminal for hidden passcode entry")
    fd, path = tempfile.mkstemp(prefix="sp-redteam-live-", suffix=".json")
    os.close(fd)
    try:
        env = os.environ.copy()
        env.pop("SP_STUDENT_PASSCODE", None)
        env["REDTEAM_PROMPT_ONLY"] = "1"
        try:
            result = subprocess.run(
                ["bash", str(TIER2), "--result-json", path, endpoint],
                cwd=ROOT, env=env, timeout=180,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise EvidenceUnavailable("Tier 2 failed or skipped") from exc
        try:
            live = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise EvidenceUnavailable("Tier 2 result unavailable") from exc
        if result.returncode:
            raise EvidenceUnavailable("Tier 2 failed or skipped")
        return live
    finally:
        Path(path).unlink(missing_ok=True)


def prepare(snapshot: dict, tier1_runner=run_tier1, tier2_runner=run_tier2,
            *, pack_loader=deployed_pack_bytes) -> dict:
    """Return a content-free work record only after all mechanical evidence agrees."""
    try:
        proxy = snapshot["deployments"]["proxy"]
        data = pack_loader(proxy["commitRef"])
        if sha256(data).hexdigest() != snapshot["packSha256"]:
            raise EvidenceUnavailable("proxy commit pack hash mismatch")
        tier1 = tier1_runner(data)
        if (tier1.get("state") != "passed" or not isinstance(tier1.get("passes"), int)
                or not isinstance(tier1.get("total"), int) or tier1["passes"] < 1
                or tier1["passes"] != tier1["total"]):
            raise EvidenceUnavailable("Tier 1 failed or empty")
        endpoint = proxy["deployUrl"].rstrip("/") + "/api/sp"
        live = tier2_runner(endpoint)
        checks = live.get("checks")
        if (live.get("state") != "passed" or not isinstance(checks, list)
                or len(checks) != len(LIVE_IDS)
                or {check.get("id") for check in checks if isinstance(check, dict)} != LIVE_IDS
                or any(not isinstance(check, dict) or check.get("status") != "pass"
                       for check in checks)):
            raise EvidenceUnavailable("Tier 2 failed or skipped")
        if live.get("packSha256") != snapshot["packSha256"]:
            raise EvidenceUnavailable("served pack hash mismatch")
        if live.get("packVersion") != snapshot["packVersion"]:
            raise EvidenceUnavailable("served pack version mismatch")
        if (live.get("actorModel"), live.get("evaluatorModel")) != (
                snapshot["model"], snapshot["model"]):
            raise EvidenceUnavailable("runtime model mismatch")
        if (not isinstance(live.get("realtimeEnabled"), bool)
                or not isinstance(live.get("managedVoiceEnabled"), bool)):
            raise EvidenceUnavailable("voice activation unverified")
        if live["realtimeEnabled"] and (not live.get("realtimeModel")
                                         or not live.get("transcriptionModel")):
            raise EvidenceUnavailable("realtime model pins unverified")
        stack = live.get("managedVoiceStack")
        if live["managedVoiceEnabled"] and (not isinstance(stack, dict) or not stack.get("id")):
            raise EvidenceUnavailable("managed voice stack unverified")
        runtime = {
            "actorModel": live["actorModel"], "evaluatorModel": live["evaluatorModel"],
            "realtimeEnabled": live["realtimeEnabled"],
            "realtimeModel": live.get("realtimeModel"),
            "transcriptionModel": live.get("transcriptionModel"),
            "managedVoiceEnabled": live["managedVoiceEnabled"],
            "managedVoiceStack": (
                {"id": stack["id"],
                 "transcriptionModel": stack.get("transcription", {}).get("model"),
                 "synthesisModel": stack.get("synthesis", {}).get("model")}
                if isinstance(stack, dict) else None),
        }
        checked_at = datetime.now(timezone.utc).isoformat()
        return {
            "schemaVersion": 1, "state": "prepared", "checkedAt": checked_at,
            "deployments": snapshot["deployments"],
            "packSha256": snapshot["packSha256"], "packVersion": snapshot["packVersion"],
            "model": snapshot["model"], "runtime": runtime,
            "mechanical": {
                "tier1": {"state": "passed", "passes": tier1["passes"],
                          "total": tier1["total"], "checkedAt": checked_at},
                "tier2": {"state": "passed", "checks": [
                    {"id": check["id"], "status": "pass"} for check in checks],
                          "checkedAt": checked_at},
            },
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise EvidenceUnavailable("preflight evidence malformed") from exc


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "record"])
    parser.add_argument("work_file", nargs="?", type=Path)
    args = parser.parse_args(argv)
    if args.command == "record":
        if args.work_file is None:
            parser.error("record requires the prepared work-file path")
        try:
            from .record_red_team import record_interactive
        except ImportError:
            from record_red_team import record_interactive
        return record_interactive(args.work_file)
    if args.work_file is not None:
        parser.error("prepare takes no work-file path")
    try:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        snapshot = fetch_snapshot(config, os.environ.get("NETLIFY_AUTH_TOKEN", ""))
        work = prepare(snapshot)
        fd, path = tempfile.mkstemp(prefix="sp-redteam-work-", suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(work, output, indent=2, sort_keys=True)
            output.write("\n")
        print(f"Prepared exact-deploy evidence: {path}")
        print("This is a mechanical work record, not a red-team pass. Complete the manual checklist next.")
        return 0
    except EvidenceUnavailable as exc:
        print(f"Red-team preparation unverified: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
