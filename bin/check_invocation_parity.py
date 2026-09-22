#!/usr/bin/env python3
"""An optional flag that every test passes and production never passes is an untested path.

THE DEFECT CLASS. On 2026-09-19 PR #711 added an unconditional
`os.makedirs(args.out_dir, exist_ok=True)` to surveillance/bin/sync_findings.py. `--out-dir`
is documented "used by tests" and has no default, so it arrives as `None` in every other
caller. Every test passes it. **None of the four scheduled workflows does.** The whole suite
stayed green while all four production monitors crashed nightly with

    TypeError: expected str, bytes or os.PathLike object, not NoneType

Nothing was red anywhere, because the only invocations anybody had written down were the ones
that worked. `docs/SILENT_SHRINK_CHECKLIST.md` names this family in section D; only D2 was
mechanised, and judgment missed this one for three days.

WHAT THIS CHECKS. For every script a production caller runs, the flag set production passes
is diffed against the flag set `tests/` passes, and a flag ONLY tests pass is reported —
**but only when its absence is not already handled**. That last clause is the whole tool.

WHY THE NARROWING IS THE WORK, NOT THE PARSING. A plain "tests pass it, production does not"
diff reports fourteen scripts on today's main, almost all of them fine: `--explain`, `--rev`
and `--format` on bin/check_attestation_hashes.py are interactive-only by design, and a
verdict that fires on everything is not a verdict (the #642 lesson, learned here once already
with pr_preflight.py). Three conditions narrow it to the flags whose absence is a bug:

  1. argparse gives the option NO default — `default` absent, or written `default=None`.
     A flag with a sane default is fine to omit. `required=True` is likewise not a finding:
     production would already be failing loudly at the parser, not silently at runtime.
     An `action` that implies a default (store_true, store_false, count) is excluded.
  2. Production never passes it, in ANY of its invocations.
  3. The value reaches real code UNGUARDED. A read is guarded when it is the subject of an
     `if`/`while` test, sits in a branch that tested it, is `or`-defaulted, is reassigned,
     is shielded by an earlier `if not args.x: return`, or is handed to a function DEFINED IN
     THE SAME MODULE whose matching parameter carries its own default — a callee writing
     `def run_explain(root, slug, rev=None)` has declared that None is an answer.

Condition 3 is what separates `--rev` (passed straight into a `rev=None` parameter) from
`--out-dir` (passed into `os.makedirs`, which has no opinion and no default). A callee this
cannot resolve — anything from the standard library, anything in another module — counts as
UNGUARDED, on purpose: that is the loud direction, and section G of the checklist says to pay
for loudness with precision rather than to buy quiet with silence.

WHICH WAY EACH SIDE ERRS, AND WHY THEY DIFFER. A finding needs a flag on the test side and
absent on the production side, so the two errors are not symmetric:

  * Missing a PRODUCTION flag invents a finding — noisy, visible, someone fixes it. So
    production is read per-invocation and precisely: only the tokens of the command that
    actually names the script.
  * Missing a TEST flag DELETES a finding, silently — the defect this file is named for. So
    the test side is read generously: every `--flag` literal in a test file is attributed to
    every script that file references. The over-attribution that buys is bounded by the fact
    that a flag must be a declared option of that script with no default to be reported at
    all, which throws away `git --porcelain` and friends without a special case.

EXIT CODES. 0 ran and reported; 2 could not determine what to check. There is deliberately no
exit 1: this lands REPORT-ONLY, like bin/probe_egress.py and bin/what_can_i_do_today.py, and
for the same reason — a first-landing calibration that turns out wrong must not block a push
while it is being corrected. Promoting it to a gate means returning 1 from the findings
branch and wiring it into bin/verify.sh; do that after a few weeks of it being right, not in
the change that introduces it. Exit 2 stays, because "I could not tell" must never read as
"clean" — that is the whole subject.

USAGE
  python3 bin/check_invocation_parity.py            # the report
  python3 bin/check_invocation_parity.py --list     # every invocation, both sides
  python3 bin/check_invocation_parity.py --all      # the un-narrowed diff, for calibration
"""
from __future__ import annotations

import argparse
import ast
import os
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

WORKFLOW_DIR = Path(".github/workflows")

# Production means "a real run that is not a test". Workflows are the set the task names;
# bin/verify.sh is here too because the pre-push hook is a real caller, and leaving it out
# would report every flag verify.sh passes as test-only. Shell scripts these invoke are
# followed one level deeper (ci.yml -> build_and_check.sh -> build_deploy.py), so a script
# reached only through a wrapper is not mistaken for unreachable.
EXTRA_PRODUCTION_CALLERS = (Path("bin/verify.sh"),)

# Wrappers are followed until a script repeats, not to a fixed depth: verify.sh ->
# build_and_check.sh -> build_anki.sh is already three links, and a cap tuned to today's
# chain turns tomorrow's fourth into "could not determine". The visited set is what makes
# following safe; the cap is a backstop against pathological nesting, and it reports rather
# than assumes the wrapper ran nothing.
MAX_INDIRECTION = 8

# A test file: anything under a directory literally named tests, plus the two naming
# conventions this repo uses for a falsification. Derived from the tracked file list rather
# than from a remembered directory list (checklist A1).
TEST_NAME = re.compile(r"(?:^|/)test_[^/]*\.py$|\.test\.(?:mjs|js)$")

IGNORED_PREFIXES = ("99_Archive/", "node_modules/", "_build/", ".superpowers/")

# Actions whose absence has a defined answer, so omitting the flag cannot yield None.
ACTION_IMPLIES_DEFAULT = frozenset({"store_true", "store_false", "count", "help", "version"})

PY_RUNNERS = re.compile(r"^python3?(\.\d+)?$")
JS_RUNNERS = frozenset({"node", "npx"})
SHELL_RUNNERS = frozenset({"bash", "sh"})

_ASSIGN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
_SEPARATOR = re.compile(r"&&|\|\||;|\|")
_FLAG = re.compile(r"^--[A-Za-z0-9][A-Za-z0-9-]*$")


class Undeterminable(Exception):
    """The checker cannot establish what production or the tests run."""


# --------------------------------------------------------------------------------------- #
# The repo's own file universe
# --------------------------------------------------------------------------------------- #

def _git_env() -> dict[str, str]:
    """The environment minus git's own overrides.

    `GIT_DIR` outranks `cwd`, so a run from inside a hook — which bin/verify.sh is — would
    otherwise list the files of whatever repository invoked it rather than the one being
    read. #383 landed the same scrub after a fixture suite rewrote the real .git/config.
    """
    return {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}


def tracked_files() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True,
                         env=_git_env())
    if out.returncode != 0:
        raise Undeterminable(f"git ls-files failed: {out.stderr.strip()}")
    files = [f for f in out.stdout.splitlines() if f and not f.startswith(IGNORED_PREFIXES)]
    if not files:
        raise Undeterminable("git ls-files returned nothing")
    return files


def test_files(tracked: list[str]) -> list[str]:
    found = sorted({f for f in tracked
                    if "/tests/" in f"/{f}" or TEST_NAME.search(f)})
    if not found:
        raise Undeterminable("no test files found at all — the test-file predicate is wrong")
    return found


# --------------------------------------------------------------------------------------- #
# Shell: what command lines does a blob of shell contain, and what do they run
# --------------------------------------------------------------------------------------- #

def _expand(text: str, variables: dict[str, str]) -> str:
    for name, value in variables.items():
        text = text.replace(f"${{{name}}}", value).replace(f"${name}", value)
    return text


def _peel(parts: list[str]) -> list[str]:
    """Strip the wrappers a command arrives inside, leaving the command itself."""
    while parts:
        if parts[0] in ("-", "run:", "|", "exec", "time", "env"):
            parts = parts[1:]
            continue
        if parts[0] == "step" and len(parts) > 2:
            parts = parts[2:]                      # verify.sh's `step "<label>" <cmd...>`
            continue
        if _ASSIGN.match(parts[0]) and len(parts) > 1:
            parts = parts[1:]                      # `PYTHONHASHSEED=0 python3 x.py`
            continue
        if parts[0] in SHELL_RUNNERS and len(parts) > 2 and parts[1].startswith("-") \
                and "c" in parts[1]:
            try:
                parts = shlex.split(parts[2], comments=True)
            except ValueError:
                return parts
            continue
        break
    return parts


def shell_commands(text: str) -> list[list[str]]:
    """Every plausible command line in a blob of shell, as token lists.

    Line continuations are joined first: a workflow's `run: |` block writes one invocation
    across five lines, and reading them as five commands loses every flag but the first.
    """
    text = text.replace("\\\n", " ")
    variables: dict[str, str] = {}
    commands: list[list[str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        assignment = _ASSIGN.match(line)
        if assignment and " " not in assignment.group(2):
            variables[assignment.group(1)] = assignment.group(2).strip("\"'")
            continue
        line = _expand(line, variables)
        for piece in _SEPARATOR.split(line):
            piece = piece.strip()
            if not piece:
                continue
            try:
                parts = _peel(shlex.split(piece, comments=True))
            except ValueError:
                # A separator cut through a quote. Re-read the whole line rather than drop
                # the piece: dropping it would shrink what this believes production runs,
                # which is the exact defect (checklist C3).
                try:
                    parts = _peel(shlex.split(line, comments=True))
                except ValueError:
                    continue
                if parts and parts not in commands:
                    commands.append(parts)
                break
            if parts:
                commands.append(parts)
    return commands


def flags_after(parts: list[str], start: int) -> list[str]:
    """Long flags a command passes, `--name=value` normalised to `--name`."""
    seen = []
    for token in parts[start:]:
        name = token.split("=", 1)[0]
        if _FLAG.match(name) and name not in seen:
            seen.append(name)
    return seen


_SHELL_VAR_PREFIX = re.compile(r"^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/")


def _resolve_script(token: str, cwd: Path) -> str | None:
    """A script token as a repo-relative path, or None when it is not a file we ship.

    A leading `$VAR/` is peeled and the remainder tried against the repo root and against
    the invoking script's own directory. Every "where am I" variable in this repo is one of
    those two — build_and_check.sh sets `HERE` to its own dir and `LIB` to the repo root
    through a command substitution, which no simple textual expansion can follow. Peeling
    resolves both without teaching the resolver a list of variable names to remember, and an
    ambiguous peel (a remainder that exists under BOTH roots) is refused rather than
    guessed: answering wrongly about which script ran is worse than admitting it, because a
    misattributed production flag deletes a finding for the script that really ran it.
    """
    candidates = [REPO / token, cwd / token]
    peeled = _SHELL_VAR_PREFIX.sub("", token)
    if peeled != token:
        under_repo, under_cwd = REPO / peeled, cwd / peeled
        if under_repo.is_file() and under_cwd.is_file() and \
                under_repo.resolve() != under_cwd.resolve():
            return None
        candidates += [under_repo, under_cwd]
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved.is_file():
            try:
                return os.path.relpath(resolved, REPO)
            except ValueError:
                return None
    return None


@dataclass
class Invocation:
    script: str
    flags: list[str]
    source: str


def invocations(parts: list[str], cwd: Path, source: str, depth: int = 0,
                seen: frozenset[str] = frozenset()) -> tuple[list[Invocation], list[str]]:
    """(invocations, unresolvable commands) for one command line, following wrappers."""
    if not parts:
        return [], []
    found: list[Invocation] = []
    unresolved: list[str] = []
    head = os.path.basename(parts[0])

    if PY_RUNNERS.match(head):
        if "-m" in parts[:3]:
            return [], []                          # `python3 -m unittest ...` runs no script
        for index, token in enumerate(parts[1:], start=1):
            if token.startswith("-"):
                continue
            if token.endswith(".py"):
                script = _resolve_script(token, cwd)
                if script is None:
                    unresolved.append(f"{source}: python names {token}, which is not a file")
                else:
                    found.append(Invocation(script, flags_after(parts, index + 1), source))
            break
        return found, unresolved

    if head in JS_RUNNERS:
        for index, token in enumerate(parts[1:], start=1):
            if token.startswith("-"):
                continue
            if token.endswith((".mjs", ".js")) and "*" not in token:
                script = _resolve_script(token, cwd)
                if script is not None:
                    found.append(Invocation(script, flags_after(parts, index + 1), source))
            break
        return found, unresolved

    if head in SHELL_RUNNERS and len(parts) > 1 and not parts[1].startswith("-"):
        script = _resolve_script(parts[1], cwd)
        if script is None:
            return [], []                          # not a script we ship
        if script in seen:
            return [], []                          # a wrapper cycle, already walked
        if depth >= MAX_INDIRECTION:
            # Give up LOUDLY. Assuming a deeper wrapper runs nothing would quietly shrink
            # the production side, and a missing production flag invents findings.
            return [], [f"{source}: wrapper nested deeper than the resolver follows: "
                        f"{' '.join(parts)[:90]}"]
        path = REPO / script
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            return [], [f"{source}: cannot read wrapper {script}: {exc}"]
        for inner in shell_commands(text):
            a, b = invocations(inner, path.parent, f"{source} -> {script}", depth + 1,
                               seen | {script})
            found += a
            unresolved += b
        return found, unresolved

    if parts[0].endswith(".py") or parts[0].endswith((".mjs", ".js")):
        script = _resolve_script(parts[0], cwd)
        if script is not None:
            found.append(Invocation(script, flags_after(parts, 1), source))
    return found, unresolved


def production_invocations() -> tuple[list[Invocation], list[str], list[str]]:
    """(invocations, unresolvable commands, the sources examined)."""
    try:
        import yaml
    except ImportError as exc:                     # pragma: no cover - environment
        raise Undeterminable(f"PyYAML is needed to read the workflows: {exc}")

    workflow_dir = REPO / WORKFLOW_DIR
    if not workflow_dir.is_dir():
        raise Undeterminable(f"no workflow directory at {WORKFLOW_DIR}")
    workflows = sorted(p for p in workflow_dir.iterdir()
                       if p.suffix in (".yml", ".yaml") and p.is_file())
    if not workflows:
        raise Undeterminable(f"{WORKFLOW_DIR} contains no workflow files")

    found: list[Invocation] = []
    unresolved: list[str] = []
    examined: list[str] = []

    for workflow in workflows:
        label = os.path.relpath(workflow, REPO)
        examined.append(label)
        try:
            doc = yaml.safe_load(workflow.read_text(encoding="utf-8"))
        except Exception as exc:                   # noqa: BLE001 - any YAML error is fatal
            raise Undeterminable(f"cannot parse {label}: {exc}")
        if not isinstance(doc, dict):
            raise Undeterminable(f"{label} does not parse to a workflow mapping")
        for job in (doc.get("jobs") or {}).values():
            if not isinstance(job, dict):
                continue
            for step in (job.get("steps") or []):
                if not isinstance(step, dict):
                    continue
                run = step.get("run")
                if not isinstance(run, str):
                    continue
                for parts in shell_commands(run):
                    a, b = invocations(parts, REPO, label)
                    found += a
                    unresolved += b

    for extra in EXTRA_PRODUCTION_CALLERS:
        path = REPO / extra
        if not path.exists():
            raise Undeterminable(f"declared production caller is missing: {extra}")
        examined.append(str(extra))
        for parts in shell_commands(path.read_text(encoding="utf-8")):
            a, b = invocations(parts, REPO, str(extra), depth=1)
            found += a
            unresolved += b

    if not found:
        raise Undeterminable("the production callers resolve to no script invocations at all")
    return found, unresolved, examined


# --------------------------------------------------------------------------------------- #
# The test side, read generously on purpose
# --------------------------------------------------------------------------------------- #

def test_invocations(paths: list[str], scripts: set[str]) -> dict[str, dict[str, set[str]]]:
    """script -> flag -> the test files that pass it.

    Generous by design: every long flag literal in a test file is attributed to every script
    that file names. Missing a test flag deletes a finding silently, which is the failure
    this tool exists to catch, so the error is taken in the visible direction. The
    over-attribution is paid for downstream — a flag is only ever reported when it is a
    declared, defaultless option of that very script.
    """
    by_basename: dict[str, list[str]] = {}
    for script in scripts:
        by_basename.setdefault(os.path.basename(script), []).append(script)

    result: dict[str, dict[str, set[str]]] = {}
    literal = re.compile(r"""['"]([^'"\s]+)['"]""")
    for rel in paths:
        try:
            text = (REPO / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        strings = literal.findall(text)
        named = {s for token in strings
                 for s in by_basename.get(os.path.basename(token), [])}
        if not named:
            continue
        flags = {s for s in strings if _FLAG.match(s)}
        if not flags:
            continue
        for script in named:
            bucket = result.setdefault(script, {})
            for flag in flags:
                bucket.setdefault(flag, set()).add(rel)
    return result


# --------------------------------------------------------------------------------------- #
# What argparse says about an option, and what the code does with it
# --------------------------------------------------------------------------------------- #

@dataclass
class Option:
    flags: tuple[str, ...]
    dest: str
    has_default: bool
    required: bool
    action: str | None
    line: int


@dataclass
class Model:
    options: dict[str, Option] = field(default_factory=dict)     # flag -> Option
    tree: ast.Module | None = None
    namespaces: set[str] = field(default_factory=set)


def _const(node) -> object:
    return node.value if isinstance(node, ast.Constant) else ...


def option_model(rel: str) -> Model | None:
    """Every `add_argument` in a script, or None when the file is not parseable Python."""
    path = REPO / rel
    if path.suffix != ".py":
        return None
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (OSError, SyntaxError):
        return None

    model = Model(tree=tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            func = node.value.func
            if isinstance(func, ast.Attribute) and func.attr == "parse_args":
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        model.namespaces.add(target.id)
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "add_argument"):
            continue
        strings = tuple(a.value for a in node.args
                        if isinstance(a, ast.Constant) and isinstance(a.value, str)
                        and a.value.startswith("-"))
        if not strings:
            continue                                # a positional; it cannot be omitted
        kwargs = {k.arg: k.value for k in node.keywords if k.arg}
        action = _const(kwargs["action"]) if "action" in kwargs else None
        action = action if isinstance(action, str) else None
        required = _const(kwargs.get("required", ast.Constant(False))) is True
        has_default = (
            ("default" in kwargs and _const(kwargs["default"]) is not None)
            or action in ACTION_IMPLIES_DEFAULT
        )
        if "dest" in kwargs and isinstance(_const(kwargs["dest"]), str):
            dest = _const(kwargs["dest"])
        else:
            longest = max(strings, key=len)
            dest = longest.lstrip("-").replace("-", "_")
        option = Option(strings, dest, has_default, required, action, node.lineno)
        for flag in strings:
            model.options[flag] = option
    if not model.namespaces:
        model.namespaces = {"args"}
    return model


def _parents(tree: ast.AST) -> dict[ast.AST, ast.AST]:
    table: dict[ast.AST, ast.AST] = {}
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            table[child] = node
    return table


def _is_none(node) -> bool:
    return isinstance(node, ast.Constant) and node.value is None


def _reads(node, dest: str, namespaces: set[str]) -> bool:
    """Does this subtree mention `<namespace>.<dest>` at all?"""
    for inner in ast.walk(node):
        if (isinstance(inner, ast.Attribute) and inner.attr == dest
                and isinstance(inner.value, ast.Name) and inner.value.id in namespaces):
            return True
    return False


def _positively_guards(test, dest: str, namespaces: set[str]) -> bool:
    """`if args.x:` / `if args.x is not None:` — the branch below knows it is present."""
    if isinstance(test, ast.Attribute):
        return _reads(test, dest, namespaces)
    if isinstance(test, ast.Compare) and _reads(test.left, dest, namespaces):
        return any(isinstance(op, (ast.IsNot, ast.NotEq)) for op in test.ops) and \
            any(_is_none(c) for c in test.comparators)
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.And):
        return any(_positively_guards(v, dest, namespaces) for v in test.values)
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return _negatively_guards(test.operand, dest, namespaces)
    return False


def _negatively_guards(test, dest: str, namespaces: set[str]) -> bool:
    """`if not args.x:` / `if args.x is None:` — the branch below knows it is absent."""
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return _positively_guards(test.operand, dest, namespaces)
    if isinstance(test, ast.Compare) and _reads(test.left, dest, namespaces):
        return any(isinstance(op, (ast.Is, ast.Eq)) for op in test.ops) and \
            any(_is_none(c) for c in test.comparators)
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.Or):
        return any(_negatively_guards(v, dest, namespaces) for v in test.values)
    return False


def _same(left: ast.AST, right: ast.AST) -> bool:
    return ast.dump(left) == ast.dump(right)


def _shields(test: ast.AST, dest: str, namespaces: set[str],
             enclosing: list[ast.AST]) -> bool:
    """Does an earlier `if <test>: return` leave this option present below it?

    The plain case is `if not args.x: return`. The compound case is the repo's
    argument-combination idiom, `if args.output and args.site is None: return 2`, which
    shields `--site` ONLY where `--output` is known true. Treating an `and` like an `or`
    would be unsound and quiet; instead each remaining conjunct must be one of the `if`
    tests the use already sits inside, which at line 563 of validate_tool_governance.py it
    is. That is precision rather than silence: a shield that does not hold is still
    reported.
    """
    if _negatively_guards(test, dest, namespaces):
        return True
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.And):
        negative = [v for v in test.values if _negatively_guards(v, dest, namespaces)]
        if not negative:
            return False
        others = [v for v in test.values if not any(v is n for n in negative)]
        return all(any(_same(v, e) for e in enclosing) for v in others)
    return False


def _terminates(body: list[ast.stmt]) -> bool:
    """Does this block leave — so that code after the `if` knows the guard held?"""
    if not body:
        return False
    last = body[-1]
    if isinstance(last, (ast.Return, ast.Raise, ast.Continue, ast.Break)):
        return True
    if isinstance(last, ast.Expr) and isinstance(last.value, ast.Call):
        func = last.value.func
        name = func.attr if isinstance(func, ast.Attribute) else \
            func.id if isinstance(func, ast.Name) else ""
        return name in ("exit", "error")
    return False


def _callee_declares_optional(call: ast.Call, child: ast.AST,
                              functions: dict[str, ast.FunctionDef]) -> bool:
    """`run_explain(root, slug, rev=None)` — the callee itself says None is an answer.

    Only same-module callees resolve. Anything else — os.makedirs, json.load, a helper in
    another file — counts as unguarded, which is the loud direction and the one that caught
    #711: `os.makedirs(args.out_dir)` has no opinion about None and no default to fall back
    on, and that is exactly the crash.
    """
    func = call.func
    name = func.id if isinstance(func, ast.Name) else None
    if name is None or name not in functions:
        return False
    spec = functions[name].args
    positional = spec.posonlyargs + spec.args
    defaults = dict(zip([a.arg for a in positional][-len(spec.defaults):] if spec.defaults
                        else [], spec.defaults))
    for keyword in call.keywords:
        # `child` may be the ast.keyword itself: iter_child_nodes puts the keyword between
        # the Call and its value, so the climb reaches the Call carrying the keyword node.
        # Matching only on `.value` silently missed EVERY keyword argument, which reported
        # `validate_tool_governance.py --revision` although its callees both declare
        # `revision: str | None = None`.
        if (keyword is child or keyword.value is child) and keyword.arg:
            if keyword.arg in defaults:
                return True
            for arg, default in zip(spec.kwonlyargs, spec.kw_defaults):
                if arg.arg == keyword.arg and default is not None:
                    return True
            return False
    for index, argument in enumerate(call.args):
        if argument is child and index < len(positional):
            return positional[index].arg in defaults
    return False


def unguarded_reads(model: Model, dest: str) -> list[int]:
    """Lines where this option's value reaches real code with nothing catching a None."""
    tree = model.tree
    assert tree is not None
    parents = _parents(tree)
    namespaces = model.namespaces
    functions = {n.name: n for n in ast.walk(tree)
                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    blocks: list[list[ast.stmt]] = []
    for node in ast.walk(tree):
        for attribute in ("body", "orelse", "finalbody"):
            value = getattr(node, attribute, None)
            if isinstance(value, list) and value and isinstance(value[0], ast.stmt):
                blocks.append(value)

    hits: list[int] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Attribute) and node.attr == dest
                and isinstance(node.value, ast.Name) and node.value.id in namespaces):
            continue
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            return []                               # `args.x = ...` supplies its own default
        if _guarded(node, dest, namespaces, parents, functions, blocks):
            continue
        hits.append(node.lineno)
    return sorted(set(hits))


def _guarded(node: ast.AST, dest: str, namespaces: set[str],
             parents: dict[ast.AST, ast.AST],
             functions: dict[str, ast.FunctionDef],
             blocks: list[list[ast.stmt]]) -> bool:
    child: ast.AST = node
    parent = parents.get(child)
    enclosing: list[ast.AST] = []                   # `if` tests this use already sits under
    while parent is not None:
        if isinstance(parent, (ast.If, ast.While, ast.IfExp)) and child is parent.test:
            return True                             # testing it is not consuming it
        if isinstance(parent, ast.Assert):
            return True
        if isinstance(parent, ast.Compare) and (
                any(_is_none(c) for c in parent.comparators) or _is_none(parent.left)):
            return True
        if isinstance(parent, ast.BoolOp):
            try:
                index = parent.values.index(child)  # type: ignore[arg-type]
            except ValueError:
                index = -1
            if index >= 0:
                if isinstance(parent.op, ast.Or) and index < len(parent.values) - 1:
                    return True                     # `args.x or DEFAULT`
                if any(_reads(v, dest, namespaces) for v in parent.values[:index]):
                    return True                     # an earlier operand already tested it
        if isinstance(parent, ast.If):
            if child in parent.body:
                if _positively_guards(parent.test, dest, namespaces):
                    return True
                enclosing.append(parent.test)
            if child in parent.orelse and _negatively_guards(parent.test, dest, namespaces):
                return True
        if isinstance(parent, ast.IfExp):
            if child is parent.body and _positively_guards(parent.test, dest, namespaces):
                return True
            if child is parent.orelse and _negatively_guards(parent.test, dest, namespaces):
                return True
        if isinstance(parent, ast.Call) and _callee_declares_optional(parent, child, functions):
            return True
        if isinstance(child, ast.stmt):
            for block in blocks:
                if child not in block:
                    continue
                for earlier in block[:block.index(child)]:
                    if (isinstance(earlier, ast.If)
                            and _shields(earlier.test, dest, namespaces, enclosing)
                            and _terminates(earlier.body)):
                        return True                 # `if not args.x: return` upstream
        child, parent = parent, parents.get(parent)
    return False


# --------------------------------------------------------------------------------------- #
# The verdict
# --------------------------------------------------------------------------------------- #

@dataclass
class Finding:
    script: str
    flag: str
    option: Option
    tests: set[str]
    production_calls: int
    lines: list[int]


def audit(narrow: bool = True) -> tuple[list[Finding], list[str], dict[str, object]]:
    prod, unresolved, examined = production_invocations()
    scripts = sorted({inv.script for inv in prod})

    prod_flags: dict[str, set[str]] = {s: set() for s in scripts}
    prod_calls: dict[str, int] = {s: 0 for s in scripts}
    for inv in prod:
        prod_flags[inv.script].update(inv.flags)
        prod_calls[inv.script] += 1

    tracked = tracked_files()
    tests = test_files(tracked)
    test_flags = test_invocations(tests, set(scripts))

    findings: list[Finding] = []
    unparsed: list[str] = []
    # Scripts there is no option model for. Stated beside the verdict rather than folded
    # into the pass: a script that hand-rolls its CLI out of sys.argv (check_lfs_media.py,
    # validate_topic_meta.py) is genuinely not compared, and the report has to say so.
    # It is NOT exit 2, because there is no flag set to diff — nothing was skipped, the
    # comparison does not apply. A file that is Python and will not PARSE is different,
    # and stays loud.
    no_model: list[str] = []
    for script in scripts:
        passed_by_tests = test_flags.get(script, {})
        only_tests = {f: who for f, who in passed_by_tests.items()
                      if f not in prod_flags[script]}
        if not only_tests:
            continue
        model = option_model(script)
        if model is None:
            if script.endswith(".py"):
                unparsed.append(f"{script}: is Python that will not parse, and tests pass "
                                f"flags to it")
            else:
                no_model.append(f"{script} (not Python)")
            continue
        if not model.options:
            no_model.append(f"{script} (no add_argument; any options are hand-read "
                            f"from sys.argv)")
            continue
        for flag, who in sorted(only_tests.items()):
            option = model.options.get(flag)
            if option is None:
                continue                            # not this script's flag at all
            if narrow and (option.has_default or option.required):
                continue
            lines = unguarded_reads(model, option.dest)
            if narrow and not lines:
                continue
            findings.append(Finding(script, flag, option, who, prod_calls[script], lines))

    stats = {
        "sources": examined,
        "invocations": len(prod),
        "scripts": len(scripts),
        "test_files": len(tests),
        "test_files_naming_a_script": len(test_flags),
        "no_model": sorted(set(no_model)),
    }
    return findings, sorted(set(unresolved)) + sorted(set(unparsed)), stats


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--list", action="store_true",
                    help="print every production and test invocation the checker resolved")
    ap.add_argument("--all", action="store_true",
                    help="skip the narrowing — the raw diff, for calibration")
    args = ap.parse_args()

    try:
        findings, unresolved, stats = audit(narrow=not args.all)
    except Undeterminable as exc:
        print(f"CANNOT CHECK — {exc}")
        print("Refusing to report parity while unable to read what production runs.")
        return 2

    print("Invocation parity — flags only the tests pass, on options with no default\n")
    print(f"examined: {len(stats['sources'])} production caller(s) -> "
          f"{stats['invocations']} invocation(s) of {stats['scripts']} script(s)")
    print(f"          {stats['test_files']} test file(s); "
          f"{stats['test_files_naming_a_script']} script(s) are named by one")
    if stats["no_model"]:
        print(f"not compared: {len(stats['no_model'])} script(s) the tests pass a flag to "
              "have no argparse option model —")
        for entry in stats["no_model"]:
            print(f"          {entry}")

    if args.list:
        prod, _, _ = production_invocations()
        print("\nproduction invocations:")
        for inv in sorted(prod, key=lambda i: (i.script, i.source)):
            print(f"  {inv.script}  {' '.join(inv.flags) or '(no flags)'}   [{inv.source}]")
        tracked = tracked_files()
        found = test_invocations(test_files(tracked), {i.script for i in prod})
        print("\ntest invocations:")
        for script in sorted(found):
            for flag in sorted(found[script]):
                print(f"  {script}  {flag}   [{len(found[script][flag])} test file(s)]")

    if findings:
        print(f"\n{len(findings)} flag(s) that only the tests pass, "
              "whose absence is unhandled:\n")
        for finding in findings:
            option = finding.option
            shape = "no default" if not option.has_default else "has a default"
            if option.required:
                shape += ", required=True"
            if option.action:
                shape += f", action={option.action}"
            print(f"  {finding.script}  {finding.flag}")
            print(f"      declared at line {option.line} ({shape})")
            print(f"      production: {finding.production_calls} invocation(s), none pass it")
            print(f"      tests: {', '.join(sorted(finding.tests))}")
            print(f"      reaches code unguarded at line(s) "
                  f"{', '.join(str(n) for n in finding.lines) if finding.lines else 'none'}")
            print()
        print("Each of these arrives as None in every production run. Give the option a\n"
              "default, guard the read, or pass the flag from the caller that needs it.\n"
              "Report-only: this exits 0 and fails nothing.")
    else:
        print("\nOK — every defaultless flag the tests pass is either passed by a production "
              "caller too, or handled when absent.")

    if unresolved:
        # Printed AFTER the findings, never instead of them: an input the checker could not
        # read is a reason to distrust the count, not a reason to hide it.
        print(f"\n{len(unresolved)} thing(s) the checker could not determine:")
        for line in unresolved:
            print(f"   - {line}")
        print("\nA classifier that cannot read an input must say so rather than clear it,\n"
              "so this run is exit 2 — the verdict above covers less than it claims to.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
