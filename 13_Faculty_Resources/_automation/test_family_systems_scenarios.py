#!/usr/bin/env python3
"""Contract checks for the Family Systems Practice scenarios and its retrieval loop."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "family_systems_scenarios.json"
SCHEMA_PATH = ROOT / "family_systems_scenarios.schema.json"
REGISTRY_PATH = ROOT / "tool_registry.json"
SNIPPET_PATH = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "fam_retrieval.js"
CONSUMERS = (
    "06_Family_and_Relational/family-systems-practice.html",
    "07_Evidence_and_Reading/Landmark_Trials/review.html",
)

ID_RE = re.compile(r"^[a-z0-9_]+$")
REVEAL_FIELDS = {"opening", "prepare", "ask", "say", "avoid", "handoff", "safety"}
DEFAULT_SOURCES = ("opening", "ask", "avoid", "handoff", "safety")


def validate_retrieval(sid, retrieval):
    """Validate a scenario's retrieval block. Raises AssertionError on any violation."""
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


def check_retrieval_contract():
    """Exercise validate_retrieval against synthetic valid and malformed blocks so the
    contract is enforced even while all shipped scenarios omit `retrieval`."""
    validate_retrieval("synthetic_ok", [
        {"id": "opening", "prompt": "Say your opening line.", "revealFrom": "opening"},
        {"id": "custom", "prompt": "Do the thing.", "revealText": "A model answer."},
    ])
    bad_cases = [
        [{"id": "Bad Id", "prompt": "x", "revealFrom": "ask"}],          # id fails pattern
        [{"id": "dup", "prompt": "x", "revealFrom": "ask"},
         {"id": "dup", "prompt": "y", "revealFrom": "avoid"}],           # duplicate id
        [{"id": "blank", "prompt": "   ", "revealFrom": "ask"}],          # blank prompt
        [{"id": "noprompt", "revealFrom": "ask"}],                       # missing prompt
        [{"id": "noreveal", "prompt": "x"}],                             # neither revealFrom nor revealText
        [{"id": "badfrom", "prompt": "x", "revealFrom": "nope"}],        # invalid revealFrom, no revealText
    ]
    for i, block in enumerate(bad_cases):
        try:
            validate_retrieval(f"synthetic_bad_{i}", block)
        except AssertionError:
            continue
        raise AssertionError(f"retrieval contract failed to reject malformed block {i}: {block!r}")


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    scenarios = data.get("scenarios")
    assert isinstance(scenarios, list) and scenarios, "scenarios must be a non-empty list"

    check_retrieval_contract()

    for sc in scenarios:
        sid = sc.get("id")
        assert isinstance(sid, str) and sid, "scenario missing id"
        # auto-derive sources must exist so every scenario yields retrieval cards
        assert isinstance(sc.get("opening"), str) and sc["opening"].strip(), f"{sid}: opening required"
        sections = sc.get("sections", {})
        for field in ("ask", "avoid", "handoff", "safety"):
            assert isinstance(sections.get(field), list) and sections[field], f"{sid}: sections.{field} required"

        # validate any explicit retrieval blocks (none required in v1)
        retrieval = sc.get("retrieval")
        if retrieval is not None:
            validate_retrieval(sid, retrieval)

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

    # The default retrieval sources must match the shared snippet's FAM_DEFAULT_RETRIEVAL, since
    # the per-scenario required-field checks above are derived from them. The list moved out of
    # family-systems-practice.html once review.html began serving the same FAM# cards in the daily
    # queue: famCardId embeds the prompt id, so a second copy could file one schedule under a
    # prompt the learner never saw. One definition, both consumers.
    js = SNIPPET_PATH.read_text(encoding="utf-8")
    block = re.search(r"var FAM_DEFAULT_RETRIEVAL=\[(.*?)\];", js, re.DOTALL)
    assert block, "fam_retrieval.js must define FAM_DEFAULT_RETRIEVAL"
    js_sources = tuple(re.findall(r"revealFrom:'([a-z_]+)'", block.group(1)))
    assert js_sources == DEFAULT_SOURCES, (
        f"shared FAM_DEFAULT_RETRIEVAL revealFrom {js_sources!r} != contract {DEFAULT_SOURCES!r} — "
        "update the required-field checks in this test to match"
    )

    # every consumer takes the prompts by injection and keeps no copy of its own
    for rel in CONSUMERS:
        src = (ROOT / rel).read_text(encoding="utf-8")
        assert src.count("/*__FAM_RETRIEVAL__*/") == 1, (
            f"{rel} must inject the shared retrieval prompts exactly once"
        )
        assert "var DEFAULT_RETRIEVAL=" not in src and "var FAM_DEFAULT_RETRIEVAL=" not in src, (
            f"{rel} must not re-declare the prompt list — the card id embeds the prompt id"
        )

    print("test_family_systems_scenarios: OK — scenarios, retrieval contract, schema, and registry")


if __name__ == "__main__":
    main()
