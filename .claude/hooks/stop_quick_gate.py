#!/usr/bin/env python3
"""Stop hook: do not leave the tree red.

When the agent is about to stop with uncommitted, non-media changes, run the cheap local
checks that CI would run first and that a red state would otherwise hide:

  * CLAUDE.md / AGENTS.md byte parity (if either changed)
  * the validator for every changed root registry (clerkship_guards.REGISTRY_VALIDATORS)
  * node --test tests/*.test.mjs when anything the node suite covers changed — a red node test
    silently aborts build_and_check.sh and leaves _build/ serving stale output

Failures block the stop once (stop_hook_active guards the loop) with the failing output as
the reason, so the agent fixes or explains them before ending. A clean tree, or a tree with
only media phantoms, passes silently. Set CLERKSHIP_STOP_GATE=off to disable.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import clerkship_guards as G
except Exception:  # pragma: no cover
    sys.exit(0)

NODE_SCOPE_PREFIXES = (
    "tests/", "tools/", "_prototypes/", "faculty-console/", "sp-proxy/",
    G.TOOLING_PREFIX + "site_build/", ".github/workflows/", ".claude/", "bin/",
)
NODE_SCOPE_SUFFIXES = (".mjs", ".js", ".html", ".json", ".css", ".yml", ".md")


def run(cmd: list[str], root: Path, timeout: int) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, cwd=root, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "timed out after %ss" % timeout
    except OSError as exc:
        return 127, str(exc)
    return proc.returncode, (proc.stdout + proc.stderr)


def changed_files(root: Path) -> list[str]:
    code, out = run(["git", "status", "--porcelain"], root, 20)
    if code != 0:
        return []
    files = []
    for line in out.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].split(" -> ")[-1].strip()
        if Path(path).suffix.lower() in G.MEDIA_EXTS:
            continue
        files.append(path)
    return files


def main() -> int:
    if os.environ.get("CLERKSHIP_STOP_GATE", "").lower() == "off":
        return 0
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    if event.get("stop_hook_active"):
        return 0
    root = G.repo_root(event)
    changed = changed_files(root)
    if not changed:
        return 0

    failures: list[str] = []

    if "CLAUDE.md" in changed or "AGENTS.md" in changed:
        try:
            same = (root / "CLAUDE.md").read_bytes() == (root / "AGENTS.md").read_bytes()
        except OSError:
            same = True
        if not same:
            failures.append("CLAUDE.md and AGENTS.md differ. Run: cp CLAUDE.md AGENTS.md")

    seen = set()
    for rel in changed:
        for validator in G.REGISTRY_VALIDATORS.get(rel, []):
            if validator in seen or not (root / validator).exists():
                continue
            seen.add(validator)
            code, out = run([sys.executable, str(root / validator)], root, 150)
            if code != 0:
                failures.append("%s failed (exit %d):\n%s" % (validator, code, "\n".join(out.splitlines()[-15:])))

    node_scope = any(
        rel.startswith(NODE_SCOPE_PREFIXES) or (("/" not in rel) and rel.endswith(NODE_SCOPE_SUFFIXES))
        for rel in changed
    )
    if node_scope and (root / "tests").is_dir():
        code, out = run(["node", "--test"] + sorted(str(p) for p in (root / "tests").glob("*.test.mjs")), root, 240)
        if code != 0:
            not_ok = [line for line in out.splitlines() if line.startswith("not ok")]
            summary = [line for line in out.splitlines() if line.startswith(("# pass", "# fail"))]
            failures.append(
                "node --test tests/*.test.mjs is red (%s). Failing: %s. A red node test silently "
                "aborts build_and_check.sh, so fix it before stopping — or say why it cannot be fixed "
                "here (e.g. a missing Python dep in the sandbox)."
                % (", ".join(summary) or "exit %d" % code, "; ".join(not_ok[:6]) or "see output")
            )

    if failures:
        print(json.dumps({
            "decision": "block",
            "reason": "Uncommitted changes leave the tree red:\n\n" + "\n\n".join(failures),
        }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
