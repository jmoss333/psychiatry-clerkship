#!/usr/bin/env python3
"""bin/verify.sh must mirror every gate step in ci.yml's build-test-validate job.

WHY: while GitHub Actions is unavailable, verify.sh IS the gate — but it was a
hand-maintained parallel list, so it drifted silently. It carried 4 of the job's 28
python gates, which is how #377 shipped a broken tests/maintenance and a broken tool
inventory, and how #380 shipped a broken test_longitudinal_case: none of those suites
ran locally, and CI could not run at all.

A step counts as mirrored when every script path it invokes appears in verify.sh.
Steps that genuinely cannot run locally are listed in ALLOWED with a reason, so the
exemption is a decision on the record rather than an omission nobody noticed.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation" / "maintenance"))

import validate_scheduled_workflows as V  # noqa: E402

JOB = "build-test-validate"

# name-prefix -> why verify.sh does not run it.
ALLOWED = {
    "Install —": "environment setup, not a gate; verify.sh installs sp-proxy deps itself",
    "Agent docs parity": "verify.sh runs the equivalent `diff -q CLAUDE.md AGENTS.md`",
    "Build + static QA gate": "verify.sh runs both site builds as their own steps",
    "Unit — root node regression": "verify.sh runs `node --test tests/*.test.mjs`",
    "Validate — WCAG AA contrast": "verify.sh runs tests/contrast-check.mjs",
    "Test — SP Interview and managed proxy":
        "verify.sh runs sp-interview/tests/run-all.sh and the sp-proxy suite",
    "Unit — faculty export tools":
        "needs requirements-dev.txt (pypdf); CI-only by design",
}


def main():
    errors = []
    workflow, _ = V._load(ROOT, "ci.yml", errors)
    if workflow is None:
        print(f"cannot read ci.yml: {errors}", file=sys.stderr)
        return 2

    verify = (ROOT / "bin" / "verify.sh").read_text(encoding="utf-8")
    # verify.sh abbreviates the long automation dir as $A for readability, so expand
    # its simple `NAME=value` assignments before matching or every path looks absent.
    for var, value in re.findall(r"^([A-Z]\w*)=([\w./-]+)$", verify, re.MULTILINE):
        verify = verify.replace(f"${var}/", f"{value}/")
    steps = workflow["jobs"][JOB]["steps"]
    mirrored = exempt = 0
    missing = []

    for step in steps:
        name = step.get("name") or ""
        run = step.get("run")
        if not isinstance(run, str) or not run.strip():
            continue
        reason = next((r for p, r in ALLOWED.items() if name.startswith(p)), None)
        if reason:
            exempt += 1
            continue
        scripts = {
            match for match in re.findall(r"[\w][\w./-]*\.(?:py|mjs)", run)
            if "/" in match
        }
        # An inline step (heredoc, git grep) names no script; require that verify.sh
        # carries a step whose label echoes it, so it cannot vanish unnoticed.
        if not scripts:
            token = name.split("—")[-1].strip().split()[0].lower()
            if token and token in verify.lower():
                mirrored += 1
            else:
                missing.append((name, "inline step with no counterpart in verify.sh"))
            continue
        absent = sorted(s for s in scripts if s not in verify)
        if absent:
            missing.append((name, ", ".join(absent)))
        else:
            mirrored += 1

    if missing:
        print(
            f"verify.sh does not mirror {len(missing)} ci.yml gate step(s) in {JOB!r}.",
            file=sys.stderr,
        )
        print(
            "Add the step to bin/verify.sh, or add it to ALLOWED in this file with a "
            "reason it cannot run locally.",
            file=sys.stderr,
        )
        for name, detail in missing:
            print(f"  - {name}\n      {detail}", file=sys.stderr)
        return 1

    print(
        f"verify coverage OK — {mirrored} ci.yml gate step(s) mirrored, "
        f"{exempt} exempt by explicit rule"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
