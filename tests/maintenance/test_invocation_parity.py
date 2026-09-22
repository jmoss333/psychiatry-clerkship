"""The falsification for bin/check_invocation_parity.py.

Every case here is section F of docs/SILENT_SHRINK_CHECKLIST.md applied to the checker
itself: the fixture PASSES, exactly one thing is broken, the run must go red and name what
broke, restoring must go quiet — and then each half of the narrowing is reverted in turn, so
the finding is demonstrably caused by the condition it claims to test rather than by the
weather. The fixture reproduces PR #711's shape exactly: an `--out-dir` with no default,
passed by every test and by none of the scheduled workflows, handed straight to
`os.makedirs`.

Nothing here touches the live surveillance script. The repository-level cases only assert
that both sides of the comparison are non-empty (checklist B3) — never a finding count,
which would freeze today's debt and turn fixing the bug red (B4).

unittest rather than bare pytest functions on purpose: both bin/verify.sh and ci.yml run
this directory through `python3 -m unittest discover`, which collects TestCase subclasses
and nothing else. A pytest-style module here would be a test that never executes, i.e. the
D2 defect, inside the falsification for a D-class checker.
"""

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

_spec = importlib.util.spec_from_file_location(
    "check_invocation_parity", ROOT / "bin" / "check_invocation_parity.py")
parity = importlib.util.module_from_spec(_spec)
sys.modules["check_invocation_parity"] = parity          # dataclasses need the registration
_spec.loader.exec_module(parity)


WORKFLOW = """\
name: nightly monitor
on:
  schedule:
    - cron: "0 6 * * 1"
jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Sync findings
        run: >-
          python3 collector.py
          --findings /tmp/findings.json{extra}
"""

COLLECTOR = """\
import argparse
import os


def write_report(payload, base=None):
    return payload, base


def demand_base(payload, base):
    return payload, base


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--findings", required=True)
    ap.add_argument("--must-have", required=True)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--out-dir"{default})
    args = ap.parse_args()
{body}


main()
"""

BODY = {
    # #711 itself: straight into a stdlib call that has no opinion about None.
    "unguarded": "    os.makedirs(args.out_dir, exist_ok=True)",
    "guarded": ("    if args.out_dir:\n"
                "        os.makedirs(args.out_dir, exist_ok=True)"),
    "or_default": '    os.makedirs(args.out_dir or "history", exist_ok=True)',
    "early_exit": ("    if not args.out_dir:\n"
                   "        return 1\n"
                   "    os.makedirs(args.out_dir, exist_ok=True)"),
    # The callee declares the argument optional, so passing None is the documented case.
    "callee_default": "    write_report('x', base=args.out_dir)",
    # The callee does NOT, so None is being forced on something that wants a value.
    "callee_required": "    demand_base('x', args.out_dir)",
}

TEST_FILE = """\
import subprocess
import sys


def test_collector(tmp_path):
    subprocess.run(
        [
            sys.executable,
            "collector.py",
            "--findings", "findings.json",
            "--must-have", "yes",
            "--verbose",
            "--site", "ms3",
            "--out-dir", str(tmp_path),
        ],
        check=True,
    )
"""

VERIFY = "#!/usr/bin/env bash\nstep() { shift; \"$@\"; }\nstep \"noop\" echo ok\n"


def _git(root: Path, *args: str) -> None:
    # GIT_DIR outranks cwd, so a run from inside the pre-push hook would otherwise write
    # into the real repository (#383). Scrub git's own environment before every call.
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    done = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, env=env)
    if done.returncode:
        raise AssertionError(f"git {' '.join(args)} failed: {done.stderr}")


class Fixture:
    """A miniature repository: one workflow, one collector, one test, one verify.sh."""

    def __init__(self, *, default: str = "", body: str = "unguarded",
                 production_passes: bool = False, test_passes: bool = True,
                 workflow: str | None = None):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name) / "repo"
        (root / ".github" / "workflows").mkdir(parents=True)
        (root / "bin").mkdir()
        (root / "tests").mkdir()
        extra = "\n          --out-dir /tmp/out" if production_passes else ""
        (root / ".github" / "workflows" / "nightly.yml").write_text(
            WORKFLOW.format(extra=extra) if workflow is None else workflow, encoding="utf-8")
        (root / "collector.py").write_text(
            COLLECTOR.format(default=default, body=BODY[body]), encoding="utf-8")
        test_text = TEST_FILE if test_passes else \
            TEST_FILE.replace('            "--out-dir", str(tmp_path),\n', "")
        (root / "tests" / "test_collector.py").write_text(test_text, encoding="utf-8")
        (root / "bin" / "verify.sh").write_text(VERIFY, encoding="utf-8")
        _git(root, "init", "-q")
        _git(root, "add", "-A")
        self.root = root.resolve()

    def __enter__(self):
        self._previous = parity.REPO
        parity.REPO = self.root
        return self

    def __exit__(self, *exc):
        parity.REPO = self._previous
        self._tmp.cleanup()
        return False

    def flags(self, narrow: bool = True) -> list[str]:
        findings, unresolved, _ = parity.audit(narrow=narrow)
        assert not unresolved, f"fixture should be fully resolvable: {unresolved}"
        return sorted(f"{f.script} {f.flag}" for f in findings)

    def finding(self, narrow: bool = True):
        findings, _, _ = parity.audit(narrow=narrow)
        return findings


DEFECT = "collector.py --out-dir"


class FalsifyTheChecker(unittest.TestCase):
    """Section F, step by step. Each case breaks exactly one thing."""

    def test_step_1_the_baseline_passes(self):
        """A default makes omitting the flag harmless, so nothing fires."""
        with Fixture(default=', default="history"') as fixture:
            self.assertEqual(fixture.flags(), [])

    def test_step_2_removing_the_default_makes_it_red(self):
        """#711's exact shape, and the report must NAME the flag and the crash line."""
        with Fixture(default="") as fixture:
            findings = fixture.finding()
            self.assertEqual([f"{f.script} {f.flag}" for f in findings], [DEFECT])
            self.assertEqual(findings[0].production_calls, 1)
            self.assertTrue(findings[0].lines, "must name the line the value reaches")
            self.assertEqual({"tests/test_collector.py"}, findings[0].tests)

    def test_step_4_restoring_the_default_goes_quiet_again(self):
        """Proves the run measured the change and not the weather."""
        with Fixture(default="") as fixture:
            self.assertEqual(fixture.flags(), [DEFECT])
        with Fixture(default=', default="history"') as fixture:
            self.assertEqual(fixture.flags(), [])

    def test_step_5_each_half_of_the_narrowing_is_load_bearing(self):
        """Revert the fix, one half at a time; the finding must come back each time."""
        with Fixture(default="", body="guarded") as fixture:
            self.assertEqual(fixture.flags(), [], "an `if args.x:` guard handles absence")
        with Fixture(default="", body="unguarded") as fixture:
            self.assertEqual(fixture.flags(), [DEFECT], "...and removing it returns the red")

        with Fixture(default="", production_passes=True) as fixture:
            self.assertEqual(fixture.flags(), [], "production passing it is not a finding")
        with Fixture(default="", production_passes=False) as fixture:
            self.assertEqual(fixture.flags(), [DEFECT], "...and dropping it returns the red")

        with Fixture(default="", test_passes=False) as fixture:
            self.assertEqual(fixture.flags(), [], "no test passes it either: not a parity gap")
        with Fixture(default="", test_passes=True) as fixture:
            self.assertEqual(fixture.flags(), [DEFECT], "...and restoring it returns the red")


class TheNarrowingRule(unittest.TestCase):
    """The conditions that took today's main from 32 raw diffs to one real finding."""

    def test_default_none_written_explicitly_is_still_no_default(self):
        with Fixture(default=", default=None") as fixture:
            self.assertEqual(fixture.flags(), [DEFECT])

    def test_required_true_is_not_a_finding(self):
        """--must-have is passed by the test and by nothing else, and is required=True.

        Production would fail at the parser with a message naming the flag, which is the
        loud failure this tool exists to distinguish itself from.
        """
        with Fixture(default="") as fixture:
            self.assertNotIn("collector.py --must-have", fixture.flags())
            self.assertIn("collector.py --must-have", fixture.flags(narrow=False))

    def test_store_true_is_not_a_finding(self):
        """--verbose is test-only, but its absence is False, not None."""
        with Fixture(default="") as fixture:
            self.assertNotIn("collector.py --verbose", fixture.flags())
            self.assertIn("collector.py --verbose", fixture.flags(narrow=False))

    def test_or_default_handles_the_absence(self):
        with Fixture(default="", body="or_default") as fixture:
            self.assertEqual(fixture.flags(), [])

    def test_an_early_exit_shields_the_reads_below_it(self):
        with Fixture(default="", body="early_exit") as fixture:
            self.assertEqual(fixture.flags(), [])

    def test_a_callee_with_its_own_default_declares_none_an_answer(self):
        """`write_report(payload, base=None)` — this is what spares --rev and --format.

        The keyword form is the one that regressed while this was being written: the AST
        puts an ast.keyword between the Call and its value, so matching only on the value
        missed EVERY keyword argument and reported two flags that were perfectly handled.
        """
        with Fixture(default="", body="callee_default") as fixture:
            self.assertEqual(fixture.flags(), [])

    def test_a_callee_without_a_default_does_not(self):
        """The same shape with `demand_base(payload, base)` must still be reported."""
        with Fixture(default="", body="callee_required") as fixture:
            self.assertEqual(fixture.flags(), [DEFECT])

    def test_the_narrowing_actually_narrows(self):
        """Non-vacuity: --all must see strictly more than the narrowed run, or the
        narrowing is doing nothing and the verdict is the raw diff under another name."""
        with Fixture(default="") as fixture:
            self.assertLess(len(fixture.flags()), len(fixture.flags(narrow=False)))


class CompoundGuards(unittest.TestCase):
    """The argument-combination idiom, which is real code in validate_tool_governance.py."""

    COMPOUND = """\
import argparse


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--findings", required=True)
    ap.add_argument("--out-dir")
    ap.add_argument("--site")
    args = ap.parse_args()
    if args.out_dir and args.site is None:
        return 2
    if args.out_dir:
        print(args.site.upper())


main()
"""

    def _run(self, source: str) -> list[str]:
        with Fixture(default="") as fixture:
            (fixture.root / "collector.py").write_text(source, encoding="utf-8")
            _git(fixture.root, "add", "-A")
            return fixture.flags()

    def test_a_compound_early_exit_shields_inside_the_branch_it_names(self):
        """`if --out-dir and --site is None: return` shields --site under `if --out-dir:`.

        Paired with the next case on purpose: an assertNotIn passes for free when the flag
        was never a candidate, and this one did exactly that until the fixture was made to
        pass --site at all (checklist B2 — an assertion empty by construction).
        """
        self.assertNotIn("collector.py --site", self._run(self.COMPOUND))

    def test_but_not_outside_it(self):
        """Move the use out from under `if args.out_dir:` and the shield no longer holds."""
        loosened = self.COMPOUND.replace(
            "    if args.out_dir:\n        print(args.site.upper())",
            "    print(args.site.upper())")
        self.assertIn("collector.py --site", self._run(loosened))


class CannotCheckIsNotClean(unittest.TestCase):
    """Checklist C4: a checker that cannot find its inputs must never pass vacuously."""

    def test_a_missing_workflow_directory_raises(self):
        with Fixture(default="") as fixture:
            for entry in (fixture.root / ".github" / "workflows").iterdir():
                entry.unlink()
            with self.assertRaises(parity.Undeterminable):
                parity.audit()

    def test_unparsable_yaml_raises_rather_than_being_skipped(self):
        with Fixture(default="") as fixture:
            (fixture.root / ".github" / "workflows" / "nightly.yml").write_text(
                "jobs: [unbalanced\n", encoding="utf-8")
            with self.assertRaises(parity.Undeterminable):
                parity.audit()

    def test_a_declared_production_caller_that_vanished_raises(self):
        with Fixture(default="") as fixture:
            (fixture.root / "bin" / "verify.sh").unlink()
            with self.assertRaises(parity.Undeterminable):
                parity.audit()

    def test_a_repository_with_no_test_files_raises(self):
        with Fixture(default="") as fixture:
            (fixture.root / "tests" / "test_collector.py").unlink()
            _git(fixture.root, "add", "-A")
            with self.assertRaises(parity.Undeterminable):
                parity.audit()


class AgainstTheRealRepository(unittest.TestCase):
    """B3: both sides of the comparison must be non-empty, or a clean run proves nothing.

    Deliberately no assertion on the finding COUNT. Pinning it here would freeze today's
    debt and turn the fix for a reported flag red (checklist B4); the tool is report-only
    for the same reason.
    """

    @classmethod
    def setUpClass(cls):
        cls.invocations, cls.unresolved, cls.examined = parity.production_invocations()
        cls.tracked = parity.tracked_files()
        cls.tests = parity.test_files(cls.tracked)

    def test_the_production_side_is_not_empty(self):
        self.assertGreater(len(self.examined), 5, "workflows should have been read")
        self.assertGreater(len(self.invocations), 50)
        self.assertGreater(len({i.script for i in self.invocations}), 20)

    def test_the_test_side_is_not_empty(self):
        self.assertGreater(len(self.tests), 50)
        named = parity.test_invocations(self.tests, {i.script for i in self.invocations})
        self.assertGreater(len(named), 5, "some scripts must be driven from tests/")

    def test_the_four_surveillance_monitors_are_all_seen(self):
        """The defect was that all four omitted the flag. Seeing only one would hide it."""
        callers = {i.source for i in self.invocations
                   if i.script.endswith("surveillance/bin/sync_findings.py")}
        self.assertEqual(len(callers), 4, f"expected four monitors, saw {sorted(callers)}")

    def test_option_models_are_read_for_real_scripts(self):
        model = parity.option_model("bin/check_attestation_hashes.py")
        self.assertIsNotNone(model)
        self.assertIn("--explain", model.options)
        self.assertFalse(model.options["--explain"].has_default)
        self.assertTrue(model.options["--format"].has_default)
        self.assertTrue(model.options["--strict"].has_default, "store_true defaults to False")

    def test_the_interactive_only_flags_are_not_reported(self):
        """The calibration contract: these three must stay silent, or nobody trusts it."""
        model = parity.option_model("bin/check_attestation_hashes.py")
        for flag in ("--explain", "--rev", "--format"):
            option = model.options[flag]
            if option.has_default:
                continue
            self.assertEqual(
                parity.unguarded_reads(model, option.dest), [],
                f"{flag} reaches code unguarded; the narrowing would report it")

    def test_the_live_run_does_not_collapse(self):
        findings, unresolved, stats = parity.audit()
        self.assertEqual(unresolved, [], f"unresolved inputs on main: {unresolved}")
        self.assertGreater(stats["scripts"], 20)
        raw, _, _ = parity.audit(narrow=False)
        self.assertGreater(len(raw), len(findings),
                           "the narrowing must be doing work on the real repository")


if __name__ == "__main__":
    unittest.main()
