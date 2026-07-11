#!/usr/bin/env python3
"""Contract checks for the One Patient, Six Weeks simulation data."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CASE_PATH = ROOT / "longitudinal_case.json"
MANIFEST_PATH = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "site_manifest.json"
META_PATH = ROOT / "tool_registry.json"
REVIEWED_PATH = ROOT / "13_Faculty_Resources" / "reviewed.json"


def main():
    assert CASE_PATH.exists(), "longitudinal_case.json is required"
    case = json.loads(CASE_PATH.read_text(encoding="utf-8"))
    assert case["id"] == "one_patient_six_weeks_001"
    assert case["storageKey"] == "cw_longitudinal_v1"

    weeks = case.get("weeks")
    assert isinstance(weeks, list) and len(weeks) == 6, "case must contain six weeks"
    assert [week["id"] for week in weeks] == [f"week{i}" for i in range(1, 7)]

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    tool_rows = [row for row in manifest["tools"] if row[1] == "one-patient-six-weeks.html"]
    assert tool_rows, "simulation tool must be registered in site_manifest.json"

    registry = json.loads(META_PATH.read_text(encoding="utf-8"))
    tool = next((item for item in registry["tools"] if item["file"] == "one-patient-six-weeks.html"), None)
    assert tool, "simulation tool must be registered in tool_registry.json"
    assert tool["storageKeys"] == ["cw_longitudinal_v1"]

    reviewed = json.loads(REVIEWED_PATH.read_text(encoding="utf-8"))
    assert reviewed["one-patient-six-weeks.html"]["status"] == "pending"

    known_pages = {row[1] for row in manifest["md"]}
    known_tools = {row[1] for row in manifest["tools"]}
    for week in weeks:
        for key in ("title", "focus", "patientState", "learnerTask", "checklist", "links"):
            assert key in week, f"{week['id']} missing {key}"
        assert len(week["checklist"]) >= 2, f"{week['id']} needs checklist items"
        for link in week["links"]:
            assert link["kind"] in ("page", "tool")
            target = link["target"]
            assert target in (known_pages if link["kind"] == "page" else known_tools), (
                f"{week['id']} links to unknown {link['kind']} {target}"
            )

    print("test_longitudinal_case: OK — six weeks, registered links, review metadata, and anonymous storage contract")


if __name__ == "__main__":
    main()
