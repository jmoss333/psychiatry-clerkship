#!/usr/bin/env python3
"""Contract checks for the Family Systems Practice scenarios and its retrieval loop."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "family_systems_scenarios.json"
SCHEMA_PATH = ROOT / "family_systems_scenarios.schema.json"
REGISTRY_PATH = ROOT / "tool_registry.json"

ID_RE = re.compile(r"^[a-z0-9_]+$")
REVEAL_FIELDS = {"opening", "prepare", "ask", "say", "avoid", "handoff", "safety"}
DEFAULT_SOURCES = ("opening", "ask", "avoid")


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    scenarios = data.get("scenarios")
    assert isinstance(scenarios, list) and scenarios, "scenarios must be a non-empty list"

    for sc in scenarios:
        sid = sc["id"]
        # auto-derive sources must exist so every scenario yields retrieval cards
        assert isinstance(sc.get("opening"), str) and sc["opening"].strip(), f"{sid}: opening required"
        sections = sc.get("sections", {})
        for field in ("ask", "avoid"):
            assert isinstance(sections.get(field), list) and sections[field], f"{sid}: sections.{field} required"

        # validate any explicit retrieval blocks (none required in v1)
        retrieval = sc.get("retrieval")
        if retrieval is not None:
            assert isinstance(retrieval, list), f"{sid}: retrieval must be a list"
            seen = set()
            for entry in retrieval:
                assert isinstance(entry, dict), f"{sid}: retrieval entry must be an object"
                eid = entry.get("id")
                assert isinstance(eid, str) and ID_RE.match(eid), f"{sid}: bad retrieval id {eid!r}"
                assert eid not in seen, f"{sid}: duplicate retrieval id {eid!r}"
                seen.add(eid)
                assert isinstance(entry.get("prompt"), str) and entry["prompt"].strip(), f"{sid}:{eid} needs a prompt"
                rf, rt = entry.get("revealFrom"), entry.get("revealText")
                assert (rf in REVEAL_FIELDS) or (isinstance(rt, str) and rt.strip()), (
                    f"{sid}:{eid} needs revealFrom in {sorted(REVEAL_FIELDS)} or a revealText"
                )

    # schema must permit the retrieval property (strict additionalProperties:false)
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    props = schema["properties"]["scenarios"]["items"]["properties"]
    assert "retrieval" in props, "schema must define the optional retrieval property"

    # registry must declare the shared SRS store the Practice loop now writes
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    tool = next((t for t in registry["tools"] if t["file"] == "family-systems.html"), None)
    assert tool, "family-systems.html must be registered in tool_registry.json"
    assert tool["storageKeys"] == ["cw_family_v1", "cw_srs_v1"], (
        f"storageKeys must be ['cw_family_v1','cw_srs_v1'], got {tool['storageKeys']!r}"
    )

    # the default retrieval sources are the three fields the renderer derives from
    assert DEFAULT_SOURCES == ("opening", "ask", "avoid")

    print("test_family_systems_scenarios: OK — scenarios, retrieval contract, schema, and registry")


if __name__ == "__main__":
    main()
