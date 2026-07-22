#!/usr/bin/env python3
"""Write non-canonical quarantine proposals without changing faculty decisions."""

from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
from types import SimpleNamespace

from pcl_anki.governance import detect_quarantines
from pcl_anki.render import build_qbank_notes


def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def scan_repository(repo: Path, out: Path) -> dict:
    """Detect configured holds and write owner-required proposals only."""

    repo = Path(repo).resolve()
    config = _load(repo / "13_Faculty_Resources" / "anki" / "release_config.json")
    question_bank = _load(repo / "question_bank.json")
    items_by_id = {
        item["id"]: item
        for item in question_bank.get("items", ())
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    rendered = []
    for hold in config.get("knownSafetyHolds", ()):
        item = items_by_id.get(hold.get("qbankUid"))
        if item is None:
            raise ValueError(
                f"configured safety hold is missing qbank item {hold.get('qbankUid')!r}"
            )
        rendered.extend(build_qbank_notes(item))

    inputs = SimpleNamespace(
        repo_root=repo,
        release_config=config,
        cards=(),
    )
    findings = detect_quarantines(inputs, rendered, date.today())
    report = {
        "schemaVersion": 1,
        "canonical": False,
        "proposals": [
            {
                "namespace": finding.namespace,
                "uid": finding.uid,
                "identity": finding.identity,
                "reasonCode": finding.reason_code,
                "subjectSha256": finding.subject_sha256,
                "sourcePath": finding.source_path,
                "firstSeenCommit": finding.first_seen_commit,
                "reviewOwnerRequired": True,
            }
            for finding in findings
        ],
    }
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    report = scan_repository(args.repo, args.out)
    for proposal in report["proposals"]:
        print(
            f"{proposal['uid']} {proposal['reasonCode']} "
            f"first-seen={proposal['firstSeenCommit']} owner-required"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
