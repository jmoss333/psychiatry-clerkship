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
# TWO SHAPES, because this repo uses two. A standalone file (test_*.py, *.test.mjs) is one.
# The other is a tool's own `--self-test` mode, which verify.sh runs as a separate `unit — X`
# step beside the guard. Inventorying only the first was this checker's own blind spot: four
# tools carried a --self-test that no gate invoked, and because no FILE was missing, the run
# printed OK over them (Codex P2 on #548). A falsification is a falsification.
FALSIFIER = re.compile(r"(?:^|/)test_[^/]*\.py$|\.test\.(?:mjs|js)$")
SELF_TEST_FLAG = '"--self-test"'


def declares_self_test(path: str) -> bool:
    """True when a tracked .py file offers a --self-test mode of its own."""
    if not path.endswith(".py") or FALSIFIER.search(path):
        return False
    try:
        return SELF_TEST_FLAG in (REPO / path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False


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
    """Every artifact whose job is to fail: test files AND tools with a --self-test mode."""
    found = sorted(f for f in files if FALSIFIER.search(f) or declares_self_test(f))
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


_SEPARATOR = re.compile(r"(&&|\|\||;)")


def _tokens(text: str) -> list[tuple[list[str], bool]]:
    """Every plausible command line in a gate file, as (tokens, fail_soft).

    Unwrapping and variable expansion matter because verify.sh names half its steps through
    `step "<label>" $A/...` and ci.yml through `run:`; splitting on separators matters because
    the sp-interview runner is a column of `echo "── name ──"; node thing.test.js`.

    FAIL-SOFT IS TRACKED, NOT DISCARDED (Codex P2 on #548). An earlier version split on `||`
    and threw the operator away, so `python3 test_guard.py || true` read as "this test is on a
    gate" when its failure can never fail anything — a gate that cannot fail, counted as
    coverage, by the checker built to find gates that cannot fail. Both sides of a `||` are
    marked: the left because its failure is swallowed, the right because it runs only when the
    left fails. This repo really does use the form — build_and_check.sh:84 wraps an entire
    sub-script in `|| true` — so a wrapper's fail-softness propagates to everything it runs.
    """
    variables: dict[str, str] = {}
    lines: list[tuple[list[str], bool]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        assignment = _ASSIGN.match(line)
        if assignment and " " not in assignment.group(2):
            variables[assignment.group(1)] = assignment.group(2).strip('"\'')
            continue
        line = _expand(line, variables)
        pieces = _SEPARATOR.split(line)
        for index in range(0, len(pieces), 2):
            piece = pieces[index].strip()
            if not piece:
                continue
            before = pieces[index - 1] if index else None
            after = pieces[index + 1] if index + 1 < len(pieces) else None
            fail_soft = before == "||" or after == "||"
            try:
                parts = _peel(shlex.split(piece, comments=True))
            except ValueError:
                # Splitting cut through a quote — ANY separator inside `bash -c "..."` does
                # that, not just `||`. Dropping the piece would silently shrink what this
                # checker believes runs, which is the defect it exists to find, so re-read
                # the WHOLE line instead.
                #
                # Handed off as fail_soft=False deliberately. Marking the whole line soft was
                # the conservative reading only for `||`; for a quoted `&&` or `;` it demoted
                # a REAL gate to "runs where a failure is swallowed" — which is a false
                # orphan, the same wrong answer in the other direction. Separators survive
                # into the peeled token list, and _resolve_command re-splits there and marks
                # fail-softness PER SEGMENT, so a quoted `|| true` is still caught exactly.
                try:
                    whole = _peel(shlex.split(line, comments=True))
                except ValueError:
                    continue
                if whole and (whole, False) not in lines:
                    lines.append((whole, False))
                break
            if parts:
                lines.append((parts, fail_soft))
    return lines


def _resolve_command(parts: list[str], cwd: Path, depth: int = 0,
                     fail_soft: bool = False) -> tuple[set[str], set[str], bool]:
    """(hard, soft, understood) — files this command runs, split by whether a failure counts.

    `hard` is real coverage: the file runs and its failure fails the gate. `soft` is a file
    reached only through a fail-soft invocation, which is NOT coverage — it is the appearance
    of coverage, which is worse. `understood` is False only for a command that LOOKS like it
    runs tests but that the resolver cannot classify — reported, never ignored.
    """
    def split(hits: set[str]) -> tuple[set[str], set[str]]:
        return (set(), hits) if fail_soft else (hits, set())

    if not parts:
        return set(), set(), True

    # Separators can survive INSIDE a token list: `bash -c "python3 x.py --self-test || true"`
    # is peeled to its payload, and the payload still carries the `||`. Splitting here as well
    # as in _tokens is what stops a quoted fail-soft invocation from reading as real coverage.
    if any(tok in ("||", "&&", ";") for tok in parts):
        hard, soft, understood = set(), set(), True
        segment: list[str] = []
        prev = None
        # `cd DIR && node --test GLOB` runs the glob in DIR. Resolving it against the
        # original cwd does not fail — it MATCHES THE WRONG FILES (the root suite), which
        # reads as coverage for files the step never runs while the real ones look orphaned.
        # A resolver that answers wrongly is worse than one that admits it cannot classify,
        # so an unusable `cd` gives up loudly instead of guessing.
        seg_cwd = cwd
        for tok in parts + [";"]:
            if tok in ("||", "&&", ";"):
                if segment and segment[0] == "cd":
                    target = (seg_cwd / segment[1]) if len(segment) == 2 else None
                    if target is not None and target.is_dir():
                        seg_cwd = target
                    else:
                        understood = False
                elif segment:
                    a, b, ok = _resolve_command(
                        segment, seg_cwd, depth, fail_soft or prev == "||" or tok == "||")
                    hard |= a
                    soft |= b
                    understood = understood and ok
                segment, prev = [], tok
                continue
            segment.append(tok)
        return hard, soft, understood

    if depth > MAX_INDIRECTION:
        # Give up LOUDLY. Returning "understood, runs nothing" here would let a deeply nested
        # runner silently drop out of the covered set — and the resolver's whole claim is that
        # it knows what runs. Deeper nesting than this means teaching it, not assuming.
        return set(), set(), False
    joined = " ".join(parts)
    hits: set[str] = set()

    # node --test <glob> ... / node <file>
    if parts[0] in ("node", "npx"):
        for arg in (p for p in parts[1:] if not p.startswith("-")):
            if ".test." in arg or arg.endswith((".mjs", ".js")):
                hits |= _glob(arg, cwd)
        return (*split(hits), True)

    # python3 -m unittest discover -s DIR -p PATTERN  |  python3 <file> [--self-test]
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
            return (*split(hits), True)
        selftest = "--self-test" in parts
        for arg in parts[1:]:
            if not arg.endswith(".py"):
                continue
            for path in _glob(arg, cwd):
                # A test file counts however it is invoked. Any OTHER script counts only when
                # run with --self-test: running a guard is not running its falsification.
                if FALSIFIER.search(path) or selftest:
                    hits.add(path)
        return (*split(hits), True)

    # npm --prefix DIR test  ->  that package's own test script
    if parts[0] == "npm" and "test" in parts:
        prefix = parts[parts.index("--prefix") + 1] if "--prefix" in parts else "."
        pkg = cwd / prefix / "package.json"
        if not pkg.exists():
            return set(), set(), False
        script = json.loads(pkg.read_text(encoding="utf-8")).get("scripts", {}).get("test")
        if not script:
            return set(), set(), False
        hard, soft = set(), set()
        for line, inner_soft in _tokens(script):
            a, b, ok = _resolve_command(line, cwd / prefix, depth + 1, fail_soft or inner_soft)
            hard |= a
            soft |= b
            if not ok:
                return hard, soft, False
        return hard, soft, True

    # bash <script> / sh <script>  ->  read it and resolve what IT runs. A wrapper invoked
    # fail-soft makes everything inside it fail-soft: build_and_check.sh:84 does exactly that.
    if parts[0] in ("bash", "sh") and len(parts) > 1 and parts[1] not in ("-c", "-eu"):
        script = cwd / parts[1]
        if not script.exists():
            return set(), set(), True       # not a runner we ship; nothing to resolve
        hard, soft = set(), set()
        for line, inner_soft in _tokens(script.read_text(encoding="utf-8")):
            a, b, ok = _resolve_command(line, script.parent, depth + 1, fail_soft or inner_soft)
            hard |= a
            soft |= b
            if not ok:
                return hard, soft, False
        return hard, soft, True

    # Shell furniture. These can NAME a test path — build_and_check.sh announces each phase
    # with `echo "── Node contract tests: tests/*.test.mjs"` — without running anything. They
    # are listed rather than pattern-matched so the unknown-command fallback below stays sharp:
    # a mention is not a run, and a runner this resolver has never seen must still be loud.
    if parts[0] in NON_RUNNERS:
        return set(), set(), True

    # Anything that names a falsification artifact but is not a shape we understand.
    if FALSIFIER.search(joined):
        return set(), set(), False
    return set(), set(), True


def covered_by_gates() -> tuple[set[str], set[str], list[str]]:
    """(hard-covered, fail-soft-only, gate commands the resolver could not classify)."""
    hard: set[str] = set()
    soft: set[str] = set()
    unresolved: list[str] = []
    for gate in GATES:
        path = REPO / gate
        if not path.exists():
            raise Undeterminable(f"gate file is missing: {gate}")
        for parts, fail_soft in _tokens(path.read_text(encoding="utf-8")):
            a, b, ok = _resolve_command(parts, REPO, fail_soft=fail_soft)
            hard |= a
            soft |= b
            if not ok:
                unresolved.append(f"{gate}: {' '.join(parts)[:110]}")
    if not hard:
        raise Undeterminable("the gates resolve to no test files at all — the resolver is broken")
    return hard, soft - hard, unresolved


def exempt_reason(path: str) -> str | None:
    for prefix, reason in EXEMPT.items():
        if path.startswith(prefix):
            return reason
    return None


def orphans(files: list[str] | None = None) -> tuple[list[str], list[str], list[str], int]:
    """(never run, run only fail-soft, unresolved gate commands, how many were checked)."""
    tracked = files if files is not None else tracked_files()
    every = falsifiers(tracked)
    hard, soft, unresolved = covered_by_gates()
    missed = [f for f in every
              if f not in hard and f not in soft and not exempt_reason(f)]
    toothless = [f for f in every if f in soft and not exempt_reason(f)]
    return missed, toothless, unresolved, len(every)


def self_test() -> int:
    """Prove this checker can fail. A vacuity checker that cannot go red is the joke."""
    cases = []

    hard, soft, unresolved = covered_by_gates()
    every = falsifiers(tracked_files())
    cases.append((f"the gates resolve to real test files ({len(hard)})", len(hard) > 0))
    cases.append((f"falsification artifacts are found at all ({len(every)})", len(every) > 10))
    cases.append((f"every gate command is understood ({len(unresolved)} unresolved)",
                  not unresolved))

    # Both shapes of falsification are inventoried. Counting only files was this checker's own
    # blind spot: a tool's --self-test could go unwired and nothing would say so (Codex, #548).
    selftesters = [f for f in every if declares_self_test(f)]
    cases.append((f"tools with a --self-test are inventoried too ({len(selftesters)})",
                  len(selftesters) >= 5 and "bin/check_vacuity.py" in selftesters))
    cases.append(("running a guard is not running its falsification",
                  not _resolve_command(["python3", "bin/check_vacuity.py"], REPO)[0]))
    cases.append(("running it WITH --self-test is",
                  "bin/check_vacuity.py" in
                  _resolve_command(["python3", "bin/check_vacuity.py", "--self-test"], REPO)[0]))

    # The indirections that made the naive version cry wolf.
    for probe, how in (("sp-proxy/tests/", "npm --prefix sp-proxy test"),
                       ("_prototypes/sp-interview/tests/", "tests/run-all.sh"),
                       ("tests/", "node --test tests/*.test.mjs")):
        reached = [f for f in hard if f.startswith(probe)]
        cases.append((f"{probe}* is reached through {how} ({len(reached)} files)", len(reached) > 0))

    # `bash -c "cd DIR && node --test GLOB"` runs the glob in DIR, not at the repo root.
    # Resolving it at the root silently matched the ROOT suite instead, so metrics/tests/*
    # read as orphaned while verify.sh was running them all along (#542 landing on #548,
    # 2026-09-06). A misresolved cwd is worse than an unclassified command: this one
    # answered, and answered wrong.
    _cd_parts = _tokens(
        'step "x" bash -c "cd metrics && node --test tests/*.test.mjs"')[0][0]
    _cd_ran, _cd_soft, _cd_ok = _resolve_command(_cd_parts, REPO)
    cases.append((f"`cd DIR &&` moves the glob into DIR ({len(_cd_ran)} files)",
                  _cd_ok and bool(_cd_ran)
                  and all(f.startswith("metrics/tests/") for f in _cd_ran)))

    # A separator inside `bash -c "..."` cuts the quote and forces the whole-line re-read.
    # That path used to assume fail-soft, so a plain `&&` demoted a real gate to "runs where
    # a failure is swallowed". Only a surviving `||` may do that, and _resolve_command
    # attributes it per segment — so the `&&` form must come back HARD...
    _hard_line, _soft_line_, _ = _resolve_command(
        *_tokens('step "x" bash -c "cd metrics && node --test tests/*.test.mjs"')[0][:1],
        REPO, fail_soft=_tokens(
            'step "x" bash -c "cd metrics && node --test tests/*.test.mjs"')[0][1])
    cases.append(("a quoted `&&` does not demote a real gate to fail-soft",
                  bool(_hard_line) and not _soft_line_))
    # ...while a quoted `|| true` must STILL be fail-soft. This is the half the old
    # blanket assumption got right, and the fix must not trade one error for the other.
    _q = _tokens('step "x" bash -c "python3 13_Faculty_Resources/_automation/'
                 'test_validate_curriculum.py || true"')[0]
    _qh, _qs, _ = _resolve_command(_q[0], REPO, fail_soft=_q[1])
    cases.append(("a quoted `|| true` is still fail-soft", bool(_qs) and not _qh))
    _bad_ran, _bad_soft, _bad_ok = _resolve_command(
        _tokens('step "x" bash -c "cd no_such_dir && node --test tests/*.test.mjs"')[0][0], REPO)
    cases.append(("a `cd` into a missing directory gives up LOUDLY", not _bad_ok))

    # A file no gate runs must be REPORTED, not absorbed.
    ghost = "13_Faculty_Resources/_automation/test_ghost_never_wired.py"
    missed, _, _, _ = orphans(files=tracked_files() + [ghost])
    cases.append(("an unwired falsification is reported", ghost in missed))

    cases.append(("an exempt path is not reported",
                  exempt_reason("tests/anki/test_render.py") is not None))
    cases.append(("a non-exempt path is not silently excused",
                  exempt_reason("tests/hooks.test.mjs") is None))

    # FAIL-SOFT. `python3 test_x.py || true` runs the test and swallows its verdict, so it is
    # not on a gate in any sense that matters. Counting it was counting a gate that cannot
    # fail — inside the checker for gates that cannot fail (Codex, #548).
    soft_line = ('step "x"  python3 13_Faculty_Resources/_automation/'
                 'test_validate_curriculum.py || true')
    parsed = _tokens(soft_line)
    cases.append((f"`|| true` is parsed as fail-soft, not discarded ({len(parsed)} segments)",
                  bool(parsed) and parsed[0][1] is True))
    h, sft, _ok = _resolve_command(parsed[0][0], REPO, fail_soft=parsed[0][1])
    cases.append(("a fail-soft test invocation is NOT counted as covered", not h))
    cases.append(("...and is not lost either — it lands in the fail-soft bucket", bool(sft)))
    h2, _s2, _ok2 = _resolve_command(parsed[0][0], REPO, fail_soft=False)
    cases.append(("the same invocation without `|| true` IS covered", bool(h2)))

    _h, _s, understood = _resolve_command(["mystery-runner", "tests/thing.test.mjs"], REPO)
    cases.append(("an unclassifiable command naming a test is reported, not assumed covered",
                  not understood))
    _h, _s, understood = _resolve_command(["node", "--test", "x.test.mjs"], REPO,
                                          depth=MAX_INDIRECTION + 1)
    cases.append(("indirection deeper than the resolver handles gives up LOUDLY", not understood))
    _h, _s, understood = _resolve_command(["echo", "hello"], REPO)
    cases.append(("an ordinary command is not mistaken for an unresolved gate", understood))

    # Naming a test is not running it, and getting either half wrong is silent.
    ran, _s, _ok = _resolve_command(["echo", "── Node contract tests: tests/*.test.mjs"], REPO)
    cases.append(("naming a test in an echo is not counted as running it", not ran))
    ran, _s, _ok = _resolve_command(["node", "--test", "tests/*.test.mjs"], REPO)
    cases.append((f"a real node --test glob IS counted ({len(ran)} files)", len(ran) > 10))

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
        missed, toothless, unresolved, total = orphans()
    except Undeterminable as exc:
        print(f"CANNOT CHECK — {exc}")
        print("Refusing to report PASS while checking nothing.")
        return 2

    if args.list:
        hard, soft, _ = covered_by_gates()
        for path in sorted(hard):
            print(f"  runs      {path}")
        for path in sorted(soft):
            print(f"  FAIL-SOFT {path}")

    if unresolved:
        print(f"{len(unresolved)} gate command(s) name a test but could not be resolved:")
        for line in unresolved:
            print(f"   - {line}")
        print("\nThe resolver must understand every gate command or it cannot say what runs.\n"
              "Teach it the new shape in _resolve_command(); do NOT assume the files are covered.")
        return 2

    if toothless:
        print(f"\n{len(toothless)} falsification(s) run only where a failure is swallowed:")
        for path in toothless:
            print(f"   - {path}")
        print("\nA `|| true` around a test — or around a wrapper that runs it — means its\n"
              "verdict can never fail anything. That is the appearance of a gate, which is\n"
              "worse than none. Run it for real or record why it cannot be.")

    if missed:
        print(f"\n{len(missed)} falsification(s) that no gate runs:")
        for path in missed:
            kind = "--self-test mode" if declares_self_test(path) else "test file"
            print(f"   - {path}  ({kind})")
        print("\nEach of these exists to fail when a contract breaks, and cannot: nothing\n"
              "executes it. Wire it into bin/verify.sh (and ci.yml if it belongs there), or\n"
              "record it in EXEMPT with a reason a reader can check. A red one is a reason to\n"
              "FIX it, never to exempt it.")

    if missed or toothless:
        return 1

    exempted = sum(1 for f in falsifiers(tracked_files()) if exempt_reason(f))
    print(f"OK — {total - exempted} falsification(s) are executed by a gate"
          + (f", {exempted} exempt with a recorded reason." if exempted else "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
