#!/usr/bin/env python3
"""PreToolUse hook for Edit | Write | MultiEdit.

Reads the pending tool call from stdin and runs the text-level guards in
clerkship_guards.py over the text that is about to land. Emits a permissionDecision:

  deny  - crisis contact outside crisis_resources.json, dose literal in an rp-*/-trainer
          tool or pack, localStorage key outside cw_*/rp_*, machine path in a .py
  ask   - PHI heuristic hit, instrument item/anchor text (governance calls)

An Edit's new_string is a bare fragment, so for .html targets the hook locates old_string in
the file on disk and skips the prose PHI pass only when the whole replaced range sits inside a
<script> block and the replacement contains no script tag of its own. Anything else, or any
internal error, allows: a broken hook must never wedge a session.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import clerkship_guards as G
except Exception:  # pragma: no cover - degrade to allow
    sys.exit(0)


def pending_text(tool_input: dict) -> str:
    if "content" in tool_input:
        return str(tool_input.get("content") or "")
    if "edits" in tool_input:
        return "\n".join(str(e.get("new_string") or "") for e in tool_input.get("edits") or [])
    return str(tool_input.get("new_string") or "")


def edit_pairs(tool_input: dict) -> list[tuple[str, str]]:
    if "content" in tool_input:
        return []  # Write replaces the whole file; the full text is scanned as-is
    if "edits" in tool_input:
        return [(str(e.get("old_string") or ""), str(e.get("new_string") or ""))
                for e in tool_input.get("edits") or []]
    return [(str(tool_input.get("old_string") or ""), str(tool_input.get("new_string") or ""))]


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    tool_input = event.get("tool_input") or {}
    file_path = tool_input.get("file_path")
    if not file_path:
        return 0
    root = G.repo_root(event)
    rel = G.relpath(file_path, root)
    text = pending_text(tool_input)
    if not text:
        return 0

    try:
        in_script = G.edit_inside_script(root, rel, edit_pairs(tool_input))
    except Exception:
        in_script = False
    findings = G.run_text_checks(text, rel, root, skip_phi=in_script)
    if not findings:
        return 0

    denies = [f for f in findings if f[0] == "deny"]
    asks = [f for f in findings if f[0] == "ask"]
    chosen = denies or asks
    decision = "deny" if denies else "ask"
    reason = "\n".join("[%s] %s" % (rule, msg) for _, rule, msg in chosen)
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": "%s: %s" % (rel, reason),
        }
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
