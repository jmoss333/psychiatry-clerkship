#!/usr/bin/env python3
"""Find code that still enforces a faculty decision nobody makes any more.

The failure this exists to catch, in the exact form it happened:

  2026-08-31  Josh decides SP_STUDENT_PASSCODE is fixed and does not rotate.
              The decision is written into sp-proxy/README.md and a plan doc.
  2026-09-01  rotation_readiness.py::MANUAL_CHECKLIST still tells the operator to
              "rotate the learner passcode and separate operations credential."
              Every validator green. Every test green. The repo is instructing a
              human to perform a step the author retired the day before.

Nothing could see it, because the decision lived in prose and its enforcement lived
in a string literal, and prose and literals do not check each other. It was found a
day later by accident during an unrelated audit.

instrument_rights.json + instrument-rights-gate.mjs already solve this for exactly
one policy: a machine-readable decision record, plus a gate that fails when a page
drifts from it. This is that pattern with the instrument-specific parts removed.

WHAT IT CHECKS (four directions, all mechanical -- no prose matching, no heuristics):

  1. Every `DECISION: <id>` marker in tracked source names an id in decisions.json.
     A typo'd or invented id is a marker that pins nothing.
  2. No marker names a decision whose status is `superseded` or `retired`.
     THIS is the rotation-checklist bug. The day passcode-fixed was recorded as
     superseding passcode-rotation-per-block, rotation_readiness.py's marker would
     have pointed at a superseded decision and this check would have gone red.
  3. Every path in a decision's `governs` list carries that decision's marker.
     Catches the opposite drift: a policy quietly stops being enforced anywhere,
     and the registry keeps claiming it is.
  4. Registry integrity: `supersededBy` and `supersedes` resolve to real ids and
     agree with each other; a superseded decision names its successor.

WHAT IT DELIBERATELY DOES NOT CHECK: whether the enforcement is CORRECT. No tool can
read MANUAL_CHECKLIST and know whether its wording matches a decision. What it can
know is that the code claims to enforce decision X and X was retired -- which is the
signal that sends a human to read the literal.

Report-only. Not a gate, not in ci.yml (adding a step there trips three separate
contracts -- see CLAUDE.md). Wiring it in is its own decision.

    python3 bin/check_decision_drift.py            # check
    python3 bin/check_decision_drift.py --list     # the registry, with marker counts
    python3 bin/check_decision_drift.py --self-test
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "decisions.json"

# `DECISION: <id>` inside a comment, in any language the repo uses. The marker is
# deliberately dumb: an id and nothing else, so it cannot drift from itself.
MARKER = re.compile(r"DECISION:\s*([a-z0-9][a-z0-9-]*)")

SEARCH_SUFFIXES = {".py", ".mjs", ".js", ".json", ".sh", ".yml", ".yaml"}
SKIP_PARTS = {"node_modules", ".git", "_build", "worktrees", ".worktrees", "99_Archive"}

DEAD_STATUSES = {"superseded", "retired"}


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.splitlines()
    for rel in out:
        p = Path(rel)
        if p.suffix not in SEARCH_SUFFIXES:
            continue
        if SKIP_PARTS & set(p.parts):
            continue
        yield rel


def load_registry(path=REGISTRY):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {d["id"]: d for d in data["decisions"]}


def scan_markers(files=None, root=ROOT):
    """rel path -> set of decision ids marked in it."""
    found = {}
    for rel in files if files is not None else tracked_files():
        if rel == "decisions.json":
            continue  # the registry names every id by definition
        try:
            text = (root / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        ids = set(MARKER.findall(text))
        if ids:
            found[rel] = ids
    return found


def check(registry, markers):
    """Returns a list of (severity, message). Empty means clean."""
    problems = []

    # 1 + 2 — every marker resolves, and none points at a dead decision.
    for rel, ids in sorted(markers.items()):
        for did in sorted(ids):
            d = registry.get(did)
            if d is None:
                problems.append(
                    ("UNKNOWN", f"{rel} marks DECISION: {did}, which is not in decisions.json")
                )
                continue
            if d.get("status") in DEAD_STATUSES:
                succ = d.get("supersededBy")
                where = f"'{succ}' replaced it" if succ else "nothing replaced it"
                problems.append(
                    (
                        "DEAD",
                        f"{rel} still enforces '{did}', which is {d['status']} — {where}. "
                        f"Read the policy text there against "
                        f"{succ or 'the current decision'} and repoint or rewrite it",
                    )
                )

    # 3 — every governed path carries its marker.
    for did, d in sorted(registry.items()):
        if d.get("status") in DEAD_STATUSES:
            continue
        for rel in d.get("governs", []):
            if not (ROOT / rel).exists():
                problems.append(
                    ("MISSING", f"decision '{did}' governs {rel}, which does not exist")
                )
            elif did not in markers.get(rel, set()):
                problems.append(
                    (
                        "UNMARKED",
                        f"decision '{did}' claims to govern {rel}, but that file carries no "
                        f"`DECISION: {did}` marker — either the policy moved or the claim is stale",
                    )
                )

    # 4 — registry integrity.
    for did, d in sorted(registry.items()):
        succ = d.get("supersededBy")
        if succ and succ not in registry:
            problems.append(("REGISTRY", f"'{did}'.supersededBy names unknown decision '{succ}'"))
        if d.get("status") in DEAD_STATUSES and not succ:
            problems.append(("REGISTRY", f"'{did}' is {d['status']} but names no supersededBy"))
        for old in d.get("supersedes", []):
            if old not in registry:
                problems.append(("REGISTRY", f"'{did}'.supersedes names unknown decision '{old}'"))
            elif registry[old].get("supersededBy") != did:
                problems.append(
                    (
                        "REGISTRY",
                        f"'{did}' supersedes '{old}', but '{old}'.supersededBy is "
                        f"{registry[old].get('supersededBy')!r} — the two must agree",
                    )
                )
    return problems


def self_test():
    """Replay the rotation-checklist drift and assert this tool sees it."""
    registry = {
        "rotate": {
            "id": "rotate",
            "status": "superseded",
            "supersededBy": "fixed",
            "governs": [],
        },
        "fixed": {"id": "fixed", "status": "active", "supersedes": ["rotate"], "governs": []},
    }
    # The 2026-09-01 world: the checklist still points at the retired decision.
    problems = check(registry, {"rotation_readiness.py": {"rotate"}})
    assert any(sev == "DEAD" for sev, _ in problems), "must flag a marker on a superseded decision"

    # The post-#444 world: the checklist points at the live one. Clean.
    assert check(registry, {"rotation_readiness.py": {"fixed"}}) == [], "must be clean once repointed"

    # A marker naming nothing.
    assert any(sev == "UNKNOWN" for sev, _ in check(registry, {"x.py": {"ghost"}}))

    # A decision claiming a file that does not carry its marker.
    r2 = {"a": {"id": "a", "status": "active", "governs": ["bin/verify.sh"]}}
    assert any(sev == "UNMARKED" for sev, _ in check(r2, {}))

    # Registry disagreement.
    r3 = {
        "old": {"id": "old", "status": "superseded", "supersededBy": "new"},
        "new": {"id": "new", "status": "active", "supersedes": []},
    }
    r3["old"]["supersededBy"] = "new"
    r3["new"]["supersedes"] = ["old"]
    assert check(r3, {}) == []
    r3["old"]["supersededBy"] = "somethingelse"
    assert any(sev == "REGISTRY" for sev, _ in check(r3, {}))

    print("decision drift self-test: OK")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="print the registry with marker counts")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    registry = load_registry()
    markers = scan_markers()

    if args.list:
        by_id = {}
        for rel, ids in markers.items():
            for did in ids:
                by_id.setdefault(did, []).append(rel)
        print(f"{'decision':32} {'status':16} marked in")
        for did, d in sorted(registry.items(), key=lambda kv: (kv[1].get("status", ""), kv[0])):
            where = by_id.get(did, [])
            print(f"{did:32} {d.get('status',''):16} {len(where)} file(s)")
            for rel in sorted(where):
                print(f"{'':49} {rel}")
        return 0

    problems = check(registry, markers)
    n_marked = sum(len(v) for v in markers.values())
    print(
        f"decision drift: {len(registry)} decision(s), {n_marked} marker(s) across "
        f"{len(markers)} file(s)"
    )
    if not problems:
        print("no drift")
        return 0
    print()
    for sev, msg in problems:
        print(f"  [{sev}] {msg}")
    print(f"\n{len(problems)} finding(s). Report-only — read the policy text, then decide.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
