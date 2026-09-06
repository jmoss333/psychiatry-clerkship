#!/usr/bin/env python3
"""A falsification that never runs is worth nothing. This proves every one of them runs.

THE DEFECT CLASS. This repo already has a strong convention: a guard ships with a paired
falsification — `--self-test` on the tool, or a `test_<guard>.py` beside it — because a gate
that cannot fail is not a gate. bin/verify.sh is full of `unit — X` steps that exist for
exactly that reason. The convention is real and it works.

It is also remembered, not enforced. Nothing checks that a falsification is WIRED IN, and an
unwired one is invisible in the worst way: it exists, it looks like coverage, it is named
after the contract it is supposed to protect, and it never executes. So it rots, silently,
against a guard that keeps getting stricter — and the day someone finally runs it, it is red
for reasons that have nothing to do with the change in front of them.

That is not hypothetical. Two files were orphaned when this checker was written:

  test_validate_topic_meta_safety.py   6 passing tests for topic_meta's safetyLevel contract,
                                       run by nothing. Its own docstring says it exists
                                       because "validate_topic_meta.py has no existing
                                       harness" — and then no gate ever ran the harness.
  test_validate_curriculum.py          51 tests, SEVEN of them failing. Every failure was an
                                       accept-case whose fixture had gone stale against a
                                       contract the validator gained on 2026-08-28: safetyKit
                                       entries must carry `triggers`, the field added when
                                       "i want to kill myself" was found to reach
                                       pg_suicide.md only through the stopword "to". The test
                                       that proves that routing bites had been red ever since,
                                       and nobody could know.

WHAT THIS ENFORCES. Every falsification artifact tracked in git is executed by some gate.
Gates are bin/verify.sh, .github/workflows/ci.yml and site_build/build_and_check.sh — the
three things that actually run on a push. An artifact no gate reaches is a finding, unless it
is in EXEMPT with a reason, and EXEMPT MAY ONLY SHRINK.

WHY IT RESOLVES COMMANDS INSTEAD OF GREPPING FOR NAMES. A first cut matched file names
against the gate text and reported 40 findings, 38 of them wrong: sp-proxy's suite runs via
`npm test`, the sp-interview suite via a run-all.sh. A checker that cries wolf is abandoned,
and an abandoned checker is worse than none. So each gate command is resolved to the files it
actually runs, following one level of indirection — npm scripts, shell runners, unittest
discover, node --test globs.

AND WHY AN UNRESOLVABLE COMMAND IS LOUD. The resolver could be wrong in two directions.
Failing to understand a step would invent orphans; assuming an unknown step covers everything
would make the whole check vacuous — the exact defect this file is named for. So a gate
command the resolver cannot classify is reported as its OWN failure (exit 2), never quietly
skipped in either direction.

USAGE
  python3 bin/check_vacuity.py             # exit 1 if a falsification is never run
  python3 bin/check_vacuity.py --self-test # prove this checker can fail
  python3 bin/check_vacuity.py --list      # show what each gate resolves to

EXIT CODES. 0 clean, 1 an orphaned falsification, 2 the checker could not determine what runs
(a missing gate file, an unresolvable command). Exit 2 is not pedantry: a checker that cannot
read the gates must say so rather than pass over an empty set.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

GATES = (
    Path("bin/verify.sh"),
    Path(".github/workflows/ci.yml"),
    Path("13_Faculty_Resources/_automation/site_build/build_and_check.sh"),
)

# Paths whose contents are not live contracts.
IGNORED_PREFIXES = ("99_Archive/", "docs/", ".superpowers/", "node_modules/", "_build/")

# A falsification artifact: something whose entire job is to fail when a contract is broken.
FALSIFIER = re.compile(r"(?:^|/)test_[^/]*\.py$|\.test\.(?:mjs|js)$")


# Commands that never execute a test file, however much their arguments look like one.
NON_RUNNERS = frozenset({
    "echo", "printf", "cd", "set", "export", "local", "if", "then", "else", "fi", "for",
    "while", "do", "done", "return", "exit", "true", "false", "cat", "mkdir", "rm", "cp",
    "mv", "git", "diff", "grep", "sed", "awk", "ls", "test", "[",
})


# verify.sh -> build_and_check.sh -> node --test is the deepest chain the gates use today.
MAX_INDIRECTION = 2


class Undeterminable(Exception):
    """The checker cannot establish what the gates run."""


# --- recorded exemptions -------------------------------------------------------------------
#
# THIS LIST MAY ONLY SHRINK. An entry is a promise that the artifact is deliberately not on a
# gate and that the reason is written down somewhere a reader can check — never "it was red so
# we stopped running it". Wiring one in means deleting its line here.
EXEMPT = {
    # Deferred in the repo's own words: 13_Faculty_Resources/_automation/anki/CI_INTEGRATION.md
    # documents the suite as needing anki==26.5 + genanki, which CI does not install. The
    # decision is recorded, the reason is checkable, and the file names the ignores it needs.
    "tests/anki/": "deferred: needs anki==26.5 + genanki (anki/CI_INTEGRATION.md)",
}


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True)
    if out.returncode != 0:
        raise Undeterminable(f"git ls-files failed: {out.stderr.strip()}")
    files = [f for f in out.stdout.splitlines()
             if f and not f.startswith(IGNORED_PREFIXES)]
    if not files:
        raise Undeterminable("git ls-files returned nothing")
    return files


def falsifiers(files: list[str]) -> list[str]:
    found = sorted(f for f in files if FALSIFIER.search(f))
    if not found:
        raise Undeterminable("no falsification artifacts found at all — the pattern is wrong")
    return found


# --- resolving what a gate actually runs ----------------------------------------------------

def _glob(pattern: str, cwd: Path) -> set[str]:
    """Files matching a shell glob, as repo-relative paths.

    Only the final component may be a glob, which is every pattern the gates actually use. A
    pattern this cannot expand yields nothing, so its files look UNCOVERED — the check then
    reports an orphan that is really a resolver gap. That direction is deliberate: a wrong
    answer here is loud and gets fixed, where the opposite default would quietly widen the
    covered set and make the whole check vacuous.
    """
    base = (cwd / pattern).parent
    hits = set()
    for path in base.glob(Path(pattern).name) if base.exists() else []:
        if path.is_file():
            hits.add(os.path.relpath(path, REPO))
    return hits


# Prefixes a gate command hides behind. Each is a wrapper this repo really uses, and each
# has to be peeled or the command underneath is invisible: verify.sh runs everything through
# a `step "<label>" <cmd>` helper, ci.yml through YAML `run:`.
_ASSIGN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.+)$")


def _expand(text: str, variables: dict[str, str]) -> str:
    """Substitute the gate file's own `A=...` style assignments. verify.sh names half its
    steps through $A, so a resolver that does not expand them sees no commands at all."""
    for name, value in variables.items():
        text = text.replace(f"${{{name}}}", value).replace(f"${name}", value)
    return text


def _peel(parts: list[str]) -> list[str]:
    """Strip the wrappers a gate command arrives inside, leaving the command itself."""
    while parts:
        if parts[0] in ("-", "run:", "|"):
            parts = parts[1:]
            continue
        if parts[0] == "step" and len(parts) > 2:
            parts = parts[2:]           # `step "<label>" <cmd...>`
            continue
        if parts[0] in ("bash", "sh") and len(parts) > 2 and parts[1] in ("-c", "-eu", "-euc"):
            try:
                parts = shlex.split(parts[2], comments=True)
            except ValueError:
                return parts
            continue
        break
    return parts


def _tokens(text: str) -> list[list[str]]:
    """Every plausible command line in a gate file, tokenised, unwrapped and variable-expanded.

    Splitting on `;` and `&&` matters as much as the unwrapping: the sp-interview runner is a
    column of `echo "── name ──"; node thing.test.js` lines, and a resolver reading only the
    first word of each sees thirteen echoes and no tests."""
    variables: dict[str, str] = {}
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        assignment = _ASSIGN.match(line)
        if assignment and " " not in assignment.group(2):
            variables[assignment.group(1)] = assignment.group(2).strip('"\'')
            continue
        line = _expand(line, variables)
        for piece in re.split(r"&&|\|\||;", line):
            piece = piece.strip()
            if not piece:
                continue
            try:
                parts = _peel(shlex.split(piece, comments=True))
            except ValueError:
                continue
            if parts:
                lines.append(parts)
    return lines


def _resolve_command(parts: list[str], cwd: Path, depth: int = 0) -> tuple[set[str], bool]:
    """(files this command runs, understood?). `understood` is False only for a command that
    LOOKS like it runs tests but that the resolver cannot classify — reported, never ignored."""
    if not parts:
        return set(), True
    if depth > MAX_INDIRECTION:
        # Give up LOUDLY. Returning "understood, runs nothing" here would let a deeply nested
        # runner silently drop out of the covered set — and the resolver's whole claim is that
        # it knows what runs. Deeper nesting than this means teaching it, not assuming.
        return set(), False
    joined = " ".join(parts)
    hits: set[str] = set()

    # node --test <glob> ... / node <file>
    if parts[0] in ("node", "npx"):
        args = [p for p in parts[1:] if not p.startswith("-")]
        for arg in args:
            if ".test." in arg or arg.endswith((".mjs", ".js")):
                hits |= _glob(arg, cwd)
        return hits, True

    # python3 -m unittest discover -s DIR -p PATTERN  |  python3 <file>
    if parts[0].startswith("python"):
        if "unittest" in parts:
            directory = pattern = None
            for flag, value in zip(parts, parts[1:]):
                if flag == "-s":
                    directory = value
                elif flag == "-p":
                    pattern = value
            if directory:
                hits |= _glob(f"{directory.rstrip('/')}/{pattern or 'test*.py'}", cwd)
            return hits, True
        for arg in parts[1:]:
            if arg.endswith(".py"):
                hits |= _glob(arg, cwd)
        return hits, True

    # npm --prefix DIR test  ->  that package's own test script
    if parts[0] == "npm" and "test" in parts:
        prefix = parts[parts.index("--prefix") + 1] if "--prefix" in parts else "."
        pkg = cwd / prefix / "package.json"
        if not pkg.exists():
            return set(), False
        script = json.loads(pkg.read_text(encoding="utf-8")).get("scripts", {}).get("test")
        if not script:
            return set(), False
        for line in _tokens(script):
            more, ok = _resolve_command(line, cwd / prefix, depth + 1)
            hits |= more
            if not ok:
                return hits, False
        return hits, True

    # bash <script> / sh <script>  ->  read it and resolve what IT runs
    if parts[0] in ("bash", "sh") and len(parts) > 1 and parts[1] not in ("-c", "-eu"):
        script = (cwd / parts[1])
        if not script.exists():
            return set(), True          # not a runner we ship; nothing to resolve
        for line in _tokens(script.read_text(encoding="utf-8")):
            more, ok = _resolve_command(line, script.parent, depth + 1)
            hits |= more
            if not ok:
                return hits, False
        return hits, True

    # Shell furniture. These can NAME a test path — build_and_check.sh announces each phase
    # with `echo "── Node contract tests: tests/*.test.mjs"` — without running anything. They
    # are listed rather than pattern-matched so the unknown-command fallback below stays sharp:
    # a mention is not a run, and a runner this resolver has never seen must still be loud.
    if parts[0] in NON_RUNNERS:
        return set(), True

    # Anything that names a falsification artifact but is not a shape we understand.
    if FALSIFIER.search(joined):
        return set(), False
    return set(), True


def covered_by_gates() -> tuple[set[str], list[str]]:
    """(files the gates run, gate commands the resolver could not classify)."""
    covered: set[str] = set()
    unresolved: list[str] = []
    for gate in GATES:
        path = REPO / gate
        if not path.exists():
            raise Undeterminable(f"gate file is missing: {gate}")
        for parts in _tokens(path.read_text(encoding="utf-8")):
            hits, ok = _resolve_command(parts, REPO)
            covered |= hits
            if not ok:
                unresolved.append(f"{gate}: {' '.join(parts)[:110]}")
    if not covered:
        raise Undeterminable("the gates resolve to no test files at all — the resolver is broken")
    return covered, unresolved


def exempt_reason(path: str) -> str | None:
    for prefix, reason in EXEMPT.items():
        if path.startswith(prefix):
            return reason
    return None


def orphans(files: list[str] | None = None) -> tuple[list[str], list[str], int]:
    """(orphaned falsifications, unresolved gate commands, how many were checked)."""
    tracked = files if files is not None else tracked_files()
    every = falsifiers(tracked)
    covered, unresolved = covered_by_gates()
    missed = [f for f in every if f not in covered and not exempt_reason(f)]
    return missed, unresolved, len(every)


def self_test() -> int:
    """Prove this checker can fail. A vacuity checker that cannot go red is the joke.

    Each case below breaks one thing and asserts the breakage is REPORTED. The resolver is
    exercised on the real gates, because a resolver that only works on fixtures would invent
    orphans on the repo it is meant to guard.
    """
    cases = []

    covered, unresolved = covered_by_gates()
    every = falsifiers(tracked_files())
    cases.append((f"the gates resolve to real test files ({len(covered)})", len(covered) > 0))
    cases.append((f"falsification artifacts are found at all ({len(every)})", len(every) > 10))
    cases.append((f"every gate command is understood ({len(unresolved)} unresolved)",
                  not unresolved))

    # The indirections that made the naive version cry wolf. Each is named, so if a suite
    # stops being reachable through its runner this says WHICH runner, not just "orphaned".
    for probe, how in (("sp-proxy/tests/", "npm --prefix sp-proxy test"),
                       ("_prototypes/sp-interview/tests/", "tests/run-all.sh"),
                       ("tests/", "node --test tests/*.test.mjs")):
        reached = [f for f in covered if f.startswith(probe)]
        cases.append((f"{probe}* is reached through {how} ({len(reached)} files)", len(reached) > 0))

    # A file no gate runs must be REPORTED, not absorbed. Falsified with a path that cannot
    # be covered by construction, so the case cannot pass by accident.
    ghost = "13_Faculty_Resources/_automation/test_ghost_never_wired.py"
    missed, _, _ = orphans(files=tracked_files() + [ghost])
    cases.append(("an unwired falsification is reported", ghost in missed))

    # ...and the exemption list must actually be consulted, or its entries are decoration.
    cases.append(("an exempt path is not reported",
                  exempt_reason("tests/anki/test_render.py") is not None))
    cases.append(("a non-exempt path is not silently excused",
                  exempt_reason("tests/hooks.test.mjs") is None))

    # The resolver's honesty guarantee: a command it cannot classify is a failure, not a pass.
    _, understood = _resolve_command(["mystery-runner", "tests/thing.test.mjs"], REPO)
    cases.append(("an unclassifiable command naming a test is reported, not assumed covered",
                  not understood))
    _, understood = _resolve_command(["node", "--test", "x.test.mjs"], REPO,
                                     depth=MAX_INDIRECTION + 1)
    cases.append(("indirection deeper than the resolver handles gives up LOUDLY", not understood))

    _, understood = _resolve_command(["echo", "hello"], REPO)
    cases.append(("an ordinary command is not mistaken for an unresolved gate", understood))

    # The boundary the whole resolver turns on: NAMING a test is not RUNNING it. Both halves
    # are pinned, because getting either wrong is silent — a mention counted as a run hides a
    # real orphan, and a run counted as a mention invents one.
    ran, _ = _resolve_command(["echo", "── Node contract tests: tests/*.test.mjs"], REPO)
    cases.append(("naming a test in an echo is not counted as running it", not ran))
    ran, _ = _resolve_command(["node", "--test", "tests/*.test.mjs"], REPO)
    cases.append((f"a real node --test glob IS counted ({len(ran)} files)", len(ran) > 10))

    # A missing gate file must raise rather than shrink the covered set into silence.
    real = globals()["GATES"]
    try:
        globals()["GATES"] = real + (Path("bin/no_such_gate.sh"),)
        try:
            covered_by_gates()
            cases.append(("a missing gate file raises instead of checking less", False))
        except Undeterminable:
            cases.append(("a missing gate file raises instead of checking less", True))
    finally:
        globals()["GATES"] = real

    for label, ok in cases:
        print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    failed = [label for label, ok in cases if not ok]
    print(f"self-test: {len(cases) - len(failed)}/{len(cases)} passed")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--self-test", action="store_true", help="prove this checker can fail")
    ap.add_argument("--list", action="store_true", help="show what the gates resolve to")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    try:
        missed, unresolved, total = orphans()
    except Undeterminable as exc:
        print(f"CANNOT CHECK — {exc}")
        print("Refusing to report PASS while checking nothing.")
        return 2

    if args.list:
        covered, _ = covered_by_gates()
        for path in sorted(covered):
            print(f"  runs  {path}")

    if unresolved:
        print(f"{len(unresolved)} gate command(s) name a test but could not be resolved:")
        for line in unresolved:
            print(f"   - {line}")
        print("\nThe resolver must understand every gate command or it cannot say what runs.\n"
              "Teach it the new shape in _resolve_command(); do NOT assume the files are covered.")
        return 2

    if missed:
        print(f"\n{len(missed)} falsification(s) that no gate runs:")
        for path in missed:
            print(f"   - {path}")
        print("\nEach of these exists to fail when a contract breaks, and cannot: nothing\n"
              "executes it. Wire it into bin/verify.sh (and ci.yml if it belongs there), or\n"
              "record it in EXEMPT with a reason a reader can check. A red one is a reason to\n"
              "FIX it, never to exempt it.")
        return 1

    exempted = sum(1 for f in falsifiers(tracked_files()) if exempt_reason(f))
    print(f"OK — {total - exempted} falsification(s) are executed by a gate"
          + (f", {exempted} exempt with a recorded reason." if exempted else "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
