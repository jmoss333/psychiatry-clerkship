#!/usr/bin/env python3
"""bin/verify.sh must mirror every gate step in ci.yml — and every bin/check_* must be on one.

WHY (direction 1, ci.yml → verify.sh): while GitHub Actions is unavailable, verify.sh IS the
gate — but it was a hand-maintained parallel list, so it drifted silently. It carried 4 of the
job's 28 python gates, which is how #377 shipped a broken tests/maintenance and a broken tool
inventory, and how #380 shipped a broken test_longitudinal_case: none of those suites ran
locally, and CI could not run at all.

A step counts as mirrored when every script path it invokes appears in verify.sh.
Steps that genuinely cannot run locally are listed in ALLOWED with a reason, so the
exemption is a decision on the record rather than an omission nobody noticed.

WHY (direction 2, bin/check_* → anywhere): mirroring only asks whether the two gate files
agree with EACH OTHER. A checker present in NEITHER agrees perfectly and is invisible — it
looks like coverage, it is named after the contract it protects, and nothing runs it. On
2026-10-04 two of 29 `bin/check_*.py` were in that state, one of them for a month. So this
also enumerates every `bin/check_*.py` and `bin/check-*.py` and fails when one is named by
neither verify.sh nor ci.yml. Deliberate exemptions live in UNGATED with a reason, capped,
and the cap only ratchets DOWN: an entry for a script that is now wired, or no longer exists,
is a finding, so the list cannot carry stale permissions.

    python3 bin/check-verify-coverage.py              # both directions, exit 1 on a finding
    python3 bin/check-verify-coverage.py --self-test  # prove each direction can fail
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
    "Install —": "environment setup, not a gate; verify.sh installs sp-proxy and\n        sp-preview deps itself",
    "Agent docs parity": "verify.sh runs the equivalent `diff -q CLAUDE.md AGENTS.md`",
    "Build + static QA gate": "verify.sh runs both site builds as their own steps",
    "Unit — root node regression": "verify.sh runs `node --test tests/*.test.mjs`",
    "Validate — WCAG AA contrast": "verify.sh runs tests/contrast-check.mjs",
    "Test — SP Interview and managed proxy":
        "verify.sh runs sp-interview/tests/run-all.sh and the sp-proxy suite",
    "Unit — faculty export tools":
        "needs requirements-dev.txt (pypdf); CI-only by design",
}

# --- direction 2: checkers on no gate at all -----------------------------------------------
#
# THIS LIST MAY ONLY SHRINK, and UNGATED_CAP with it. An entry is a promise that the checker is
# deliberately on neither gate and the reason is written down. Wiring one in (even just its
# --self-test, which is what verify.sh does for every egress-bound guard) means deleting its
# line here AND lowering the cap — a stale entry fails the run.
UNGATED = {
    "bin/check_attestation_delivery.py":
        "reads both learner sites' live /governance.json and the GitHub API (GITHUB_TOKEN); "
        "runs daily as a step of maintenance-release-watch.yml; has no --self-test yet, so "
        "there is nothing offline to put on a gate",
}
UNGATED_CAP = 1

CHECKER_GLOBS = ("check_*.py", "check-*.py")


def gate_texts(root):
    """(verify.sh text with its $VAR= assignments expanded, ci.yml raw text)."""
    verify = (root / "bin" / "verify.sh").read_text(encoding="utf-8")
    # verify.sh abbreviates the long automation dir as $A for readability, so expand
    # its simple `NAME=value` assignments before matching or every path looks absent.
    for var, value in re.findall(r"^([A-Z]\w*)=([\w./-]+)$", verify, re.MULTILINE):
        verify = verify.replace(f"${var}/", f"{value}/")
    ci = (root / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    return verify, ci


def checkers(root):
    """Every bin/check_*.py and bin/check-*.py, as repo-relative posix paths, sorted."""
    found = set()
    for pattern in CHECKER_GLOBS:
        for path in (root / "bin").glob(pattern):
            if path.is_file():
                found.add(path.relative_to(root).as_posix())
    return sorted(found)


def ungated_findings(scripts, verify, ci, allowed, cap):
    """Direction 2 as a pure function. Returns (findings, ungated_count, exempt_count)."""
    findings = []
    present = set(scripts)
    wired = {s for s in scripts if s in verify or s in ci}
    for script in scripts:
        if script in wired:
            if script in allowed:
                findings.append((script, "listed in UNGATED but is now on a gate — delete its "
                                         "entry and lower UNGATED_CAP"))
            continue
        if script not in allowed:
            findings.append((script, "named by neither bin/verify.sh nor ci.yml — wire it (at "
                                     "least its --self-test), or add it to UNGATED with a reason"))
    for script in sorted(allowed):
        if script not in present:
            findings.append((script, "listed in UNGATED but does not exist — delete its entry "
                                     "and lower UNGATED_CAP"))
    if len(allowed) > cap:
        findings.append(("UNGATED", f"{len(allowed)} entries exceed UNGATED_CAP={cap}; the "
                                    "list only shrinks"))
    exempt = sum(1 for s in scripts if s not in wired and s in allowed)
    return findings, len(wired), exempt


def mirror_findings(workflow, verify, allowed):
    """Direction 1. Returns (missing, mirrored, exempt)."""
    steps = workflow["jobs"][JOB]["steps"]
    mirrored = exempt = 0
    missing = []

    for step in steps:
        name = step.get("name") or ""
        run = step.get("run")
        if not isinstance(run, str) or not run.strip():
            continue
        reason = next((r for p, r in allowed.items() if name.startswith(p)), None)
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
    return missing, mirrored, exempt


def main():
    errors = []
    workflow, _ = V._load(ROOT, "ci.yml", errors)
    if workflow is None:
        print(f"cannot read ci.yml: {errors}", file=sys.stderr)
        return 2

    verify, ci = gate_texts(ROOT)
    missing, mirrored, exempt = mirror_findings(workflow, verify, ALLOWED)
    rc = 0

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
        rc = 1

    scripts = checkers(ROOT)
    if not scripts:
        print("no bin/check_*.py found at all — the glob is wrong", file=sys.stderr)
        return 2
    findings, wired, ungated_exempt = ungated_findings(scripts, verify, ci, UNGATED, UNGATED_CAP)
    if findings:
        print(f"{len(findings)} checker(s) in bin/ are on NO gate (or UNGATED is stale):",
              file=sys.stderr)
        for script, detail in findings:
            print(f"  - {script}\n      {detail}", file=sys.stderr)
        rc = 1

    if rc:
        return rc
    print(
        f"verify coverage OK — {mirrored} ci.yml gate step(s) mirrored, "
        f"{exempt} exempt by explicit rule; {wired}/{len(scripts)} bin/check_* on a gate, "
        f"{ungated_exempt} exempt (cap {UNGATED_CAP})"
    )
    return 0


# --- self-test — pure functions over fixture texts; the live tree is read only at the end ----

def self_test():
    failures = []
    total = []

    def check(name, got, want):
        total.append(name)
        if got != want:
            failures.append(f"{name}: got {got!r}, want {want!r}")

    scripts = ["bin/check_a.py", "bin/check-b.py", "bin/check_c.py"]
    verify = "A=13_Faculty_Resources/_automation\nstep x python3 bin/check_a.py --self-test\n"
    ci = "      - run: python3 bin/check-b.py\n"

    # 1. The falsification: a checker in neither file is a finding, by name.
    f, wired, exempt = ungated_findings(scripts, verify, ci, {}, 0)
    check("neither-place checker is found", [s for s, _ in f], ["bin/check_c.py"])
    check("wired count counts both files", wired, 2)
    check("the finding tells the reader what to do", "wire it" in f[0][1], True)

    # 2. verify.sh-only and ci.yml-only are each enough — "neither" means neither.
    f, _, _ = ungated_findings(["bin/check_a.py"], verify, "", {}, 0)
    check("verify.sh alone suffices", f, [])
    f, _, _ = ungated_findings(["bin/check-b.py"], "", ci, {}, 0)
    check("ci.yml alone suffices", f, [])

    # 3. An UNGATED entry with a reason makes it clean…
    f, _, exempt = ungated_findings(scripts, verify, ci, {"bin/check_c.py": "why"}, 1)
    check("allowlisted checker is clean", f, [])
    check("…and counted as exempt", exempt, 1)

    # 4. …but the list is a ratchet: an entry for a checker now on a gate is stale.
    f, _, _ = ungated_findings(scripts, verify, ci, {"bin/check_a.py": "why"}, 1)
    check("stale entry (now wired) is a finding",
          [s for s, d in f if "now on a gate" in d], ["bin/check_a.py"])
    check("the unwired one is still reported beside it", "bin/check_c.py" in [s for s, _ in f], True)

    # 5. An entry for a checker that no longer exists is stale too.
    f, _, _ = ungated_findings(scripts, verify, ci, {"bin/check_gone.py": "why",
                                                     "bin/check_c.py": "why"}, 2)
    check("stale entry (deleted file) is a finding",
          [s for s, d in f if "does not exist" in d], ["bin/check_gone.py"])

    # 6. The cap binds: more entries than the cap is a finding even when each is justified.
    f, _, _ = ungated_findings(scripts, verify, ci, {"bin/check_c.py": "why"}, 0)
    check("over-cap list is a finding", [s for s, _ in f], ["UNGATED"])

    # 7. $A expansion still works, so a verify.sh step named through the variable counts.
    f, _, _ = ungated_findings(["bin/check_a.py"], "A=bin\nstep x python3 $A/check_a.py\n"
                               .replace("$A/", "bin/"), "", {}, 0)
    check("expanded $VAR path is seen", f, [])

    # 8. Direction 1 is unchanged: a ci.yml step whose script verify.sh lacks is still missing.
    wf = {"jobs": {JOB: {"steps": [
        {"name": "Validate — thing", "run": "python3 bin/thing.py"},
        {"name": "Install — deps", "run": "pip install x"},
        {"name": "Guard — inline", "run": "echo hi"},
    ]}}}
    missing, mirrored, exempt = mirror_findings(wf, "step x python3 bin/other.py\n", ALLOWED)
    check("missing script is reported", [n for n, _ in missing],
          ["Validate — thing", "Guard — inline"])
    check("Install — is exempt by prefix", exempt, 1)
    missing, mirrored, _ = mirror_findings(wf, "python3 bin/thing.py\n# inline\n", ALLOWED)
    check("present script + echoed label are mirrored", (missing, mirrored), ([], 2))

    # 9. The glob sees both spellings in the live tree and the live list is not vacuous.
    live = checkers(ROOT)
    check("live glob finds check_*.py", any(s.startswith("bin/check_") for s in live), True)
    check("live glob finds check-*.py", any(s.startswith("bin/check-") for s in live), True)
    check("this file is in its own inventory", "bin/check-verify-coverage.py" in live, True)
    check("UNGATED respects its cap in the shipped file", len(UNGATED) <= UNGATED_CAP, True)

    for line in failures:
        print("FAIL  " + line, file=sys.stderr)
    if failures:
        print(f"self-test: {len(failures)}/{len(total)} failed", file=sys.stderr)
        return 1
    print(f"self-test: {len(total)}/{len(total)} passed")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv[1:]:
        raise SystemExit(self_test())
    raise SystemExit(main())
