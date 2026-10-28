#!/usr/bin/env python3
"""check_agent_guide.py — the contract that keeps CLAUDE.md an index.

Since 2026-10-16 (R1 of the architecture review) `CLAUDE.md` is an INDEX and the rules live in
`docs/agent-guide/<topic>.md`, each rule under a `###` heading that carries an enforcement tag:

    ### Rule name — [gate: path; path]      a check that fails a build, a push or a PR
    ### Rule name — [report: path; path]    a tool that names the problem and blocks nothing
    ### Rule name — [judgment]              nothing enforces it; the reader has to

Why: by 2026-10-16 CLAUDE.md had grown 82 → 938 lines in eleven weeks (48 commits in the last
30 days, one bullet of 13,346 characters), every agent session read all of it before doing
anything, and nothing distinguished a rule a hook already blocks from a rule that depends on
the reader. An index that may only shrink, plus tags that name their gate, is the fix.

Hard checks (exit 1):
  G1  every docs/agent-guide/*.md is linked from CLAUDE.md, and every docs/agent-guide link in
      CLAUDE.md resolves — a page nobody can find from the index is a rule nobody reads;
  G2  every `###` heading in a guide carries exactly one tag, and every path a gate/report tag
      names exists — a tag naming a gate that is not there is the vacuity §D of
      docs/SILENT_SHRINK_CHECKLIST.md wearing a label;
  G3  every backticked path in CLAUDE.md's "Before you touch these paths" table matches at
      least one tracked file — a row that matches nothing routes nobody anywhere;
  G4  no guide exceeds GUIDE_MAX_LINES — a guide that regrows the old file defeats the split.

Ratchet (docs/RATCHETS.md): `claude_md_lines` pinned in bin/check_agent_guide_baseline.json.
  A rise exits 1. A fall prints a `note:` naming `--update-baseline`. No baseline, or a
  baseline missing the key, exits 2 — could not check is never a pass.

Modes:
  (default)              run G1–G4 and the ratchet on the live tree
  --self-test            synthetic violations exit as documented; then the live tree exits 0
  --update-baseline      rewrite the pin to the measured count (after a reviewed reduction only)
  --migration-from REV   one-off proof for a split: every rule line of REV:CLAUDE.md (non-blank,
                         not a heading, not a code fence) appears verbatim, whitespace-trimmed,
                         in CLAUDE.md or a guide at HEAD. Prints kept/total; exit 1 lists the rest.

Stdlib only. The tracked-file list and --migration-from shell out to git; when git is not
available G3 falls back to the working tree and says so in its summary line.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = "CLAUDE.md"
GUIDE_DIR = "docs/agent-guide"
BASELINE = Path(__file__).resolve().with_name("check_agent_guide_baseline.json")
PIN_KEY = "claude_md_lines"
GUIDE_MAX_LINES = 300
TABLE_HEADING = "## Before you touch these paths"
WALK_SKIP = {".git", "node_modules", "_build", ".worktrees", ".playwright-cli"}

TAG_RE = re.compile(r"\s(?:—|--)\s\[(gate|report|judgment)(?::\s*([^\]]*))?\]\s*$")
LINK_RE = re.compile(r"docs/agent-guide/([A-Za-z0-9._-]+\.md)")
TOKEN_RE = re.compile(r"`([^`]+)`")
GLOB_CHARS = set("*?[")


# ─── repository view ─────────────────────────────────────────────────────────────────────────

def tracked_files(root: Path) -> tuple[set[str], str]:
    """Every tracked path, plus every parent directory of one. (set, source-label)."""
    try:
        out = subprocess.run(["git", "-C", str(root), "ls-files"], capture_output=True,
                             text=True, check=True).stdout
        files = [p for p in out.split("\n") if p]
        label = "git ls-files"
    except (OSError, subprocess.CalledProcessError):
        files = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in WALK_SKIP]
            rel = os.path.relpath(dirpath, root)
            for f in filenames:
                files.append(f if rel == "." else f"{rel}/{f}")
        label = "working tree (git unavailable)"
    paths: set[str] = set()
    for f in files:
        paths.add(f)
        parts = f.split("/")
        for i in range(1, len(parts)):
            paths.add("/".join(parts[:i]))
    return paths, label


def path_matches(token: str, paths: set[str]) -> bool:
    token = token.strip()
    anchored = "/" in token          # `bin/` and `a/b.py` name a place; `x.json` names a file anywhere
    token = token.rstrip("/")
    if not token:
        return False
    if GLOB_CHARS & set(token):
        return any(fnmatch.fnmatchcase(p, token) or fnmatch.fnmatchcase(p.rsplit("/", 1)[-1], token)
                   for p in paths)
    if anchored:
        return token in paths
    return any(p == token or p.endswith("/" + token) for p in paths)


def is_path_token(token: str) -> bool:
    return "/" in token or "." in token


# ─── checks ──────────────────────────────────────────────────────────────────────────────────

def read(root: Path, rel: str) -> str:
    return (root / rel).read_text(encoding="utf-8")


def guide_files(root: Path) -> list[Path]:
    d = root / GUIDE_DIR
    if not d.is_dir():
        return []
    return sorted(p for p in d.glob("*.md") if not p.name.startswith("_"))


def table_tokens(index_text: str) -> list[str]:
    """Backticked path tokens from the first column of the 'Before you touch' table."""
    tokens: list[str] = []
    lines = index_text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.strip().startswith(TABLE_HEADING))
    except StopIteration:
        return tokens
    for line in lines[start + 1:]:
        if line.startswith("## "):
            break
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cells or cells[0] in ("Path", "") or set(cells[0]) <= {"-", " "}:
            continue
        tokens.extend(t for t in TOKEN_RE.findall(cells[0]) if is_path_token(t))
    return tokens


def run_checks(root: Path, baseline: Path | None = None) -> tuple[int, list[str]]:
    """Returns (exit code, report lines)."""
    out: list[str] = []
    problems: list[str] = []
    could_not = False

    if not (root / INDEX).is_file():
        return 2, [f"could not check: {INDEX} missing under {root}"]
    index_text = read(root, INDEX)
    guides = guide_files(root)
    if not guides:
        return 2, [f"could not check: no guides under {GUIDE_DIR}/"]
    paths, source = tracked_files(root)

    # G1 — every guide linked from the index; every index link resolves
    for g in guides:
        if f"{GUIDE_DIR}/{g.name}" not in index_text:
            problems.append(f"G1 {GUIDE_DIR}/{g.name} is not linked from {INDEX}")
    for name in sorted(set(LINK_RE.findall(index_text))):
        if not (root / GUIDE_DIR / name).is_file():
            problems.append(f"G1 {INDEX} links {GUIDE_DIR}/{name}, which does not exist")

    # G2 — every ### heading tagged; every tagged path exists
    counts = {"gate": 0, "report": 0, "judgment": 0}
    for g in guides:
        for n, line in enumerate(g.read_text(encoding="utf-8").splitlines(), 1):
            if not line.startswith("### "):
                continue
            m = TAG_RE.search(line)
            where = f"{GUIDE_DIR}/{g.name}:{n}"
            if not m:
                problems.append(f"G2 {where} heading has no enforcement tag: {line.strip()[:80]}")
                continue
            kind, body = m.group(1), (m.group(2) or "").strip()
            named = [p.strip() for p in body.split(";") if p.strip()]
            if kind == "judgment" and named:
                problems.append(f"G2 {where} [judgment] names paths; use [gate:] or [report:]")
            if kind != "judgment" and not named:
                problems.append(f"G2 {where} [{kind}:] names no path")
            for p in named:
                if not (root / p).exists():
                    problems.append(f"G2 {where} [{kind}: {p}] — no such file")
            counts[kind] += 1

    # G3 — every table path matches a tracked file
    tokens = table_tokens(index_text)
    if not tokens:
        problems.append(f"G3 {INDEX} has no '{TABLE_HEADING}' table with path tokens")
    for t in tokens:
        if not path_matches(t, paths):
            problems.append(f"G3 table path `{t}` matches no tracked file ({source})")

    # G4 — guide size
    for g in guides:
        n = len(g.read_text(encoding="utf-8").splitlines())
        if n > GUIDE_MAX_LINES:
            problems.append(f"G4 {GUIDE_DIR}/{g.name} is {n} lines (max {GUIDE_MAX_LINES})")

    # Ratchet — CLAUDE.md may only shrink
    measured = len(index_text.splitlines())
    pin_note = ""
    bl = baseline if baseline is not None else BASELINE
    if not bl.is_file():
        could_not = True
        problems.append(f"could not check: baseline {bl.name} missing (pin {PIN_KEY} to {measured})")
    else:
        try:
            pin = json.loads(bl.read_text(encoding="utf-8"))[PIN_KEY]
        except (ValueError, KeyError, TypeError):
            could_not = True
            problems.append(f"could not check: baseline {bl.name} has no integer {PIN_KEY}")
        else:
            if measured > pin:
                problems.append(f"RATCHET {INDEX} is {measured} lines; pin is {pin} — "
                                f"a rule goes in its topic page, not the index")
            elif measured < pin:
                pin_note = (f"note: {INDEX} is {measured} lines, below the pin of {pin} — lock it "
                            f"in with python3 bin/check_agent_guide.py --update-baseline")

    out.extend(problems)
    if pin_note:
        out.append(pin_note)
    out.append(f"agent guide: {len(guides)} pages, {sum(counts.values())} tagged rules "
               f"({counts['gate']} gate / {counts['report']} report / {counts['judgment']} judgment), "
               f"{len(tokens)} table paths checked against {source}, {INDEX} {measured} lines")
    if could_not:
        return 2, out
    return (1 if problems else 0), out


def update_baseline(root: Path, baseline: Path) -> int:
    measured = len(read(root, INDEX).splitlines())
    baseline.write_text(json.dumps({PIN_KEY: measured}, indent=2) + "\n", encoding="utf-8")
    print(f"pinned {PIN_KEY} = {measured} in {baseline.name}")
    return 0


# ─── migration proof ─────────────────────────────────────────────────────────────────────────

def rule_lines(text: str) -> list[str]:
    keep = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.startswith("```"):
            continue
        keep.append(s)
    return keep


def migration(root: Path, rev: str, old_path: str) -> int:
    try:
        old = subprocess.run(["git", "-C", str(root), "show", f"{rev}:{old_path}"],
                             capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        print(f"could not read {rev}:{old_path}: {e}")
        return 2
    new_lines: set[str] = set(rule_lines(read(root, INDEX)))
    for g in guide_files(root):
        new_lines.update(rule_lines(g.read_text(encoding="utf-8")))
    old_lines = rule_lines(old)
    missing = [l for l in old_lines if l not in new_lines]
    print(f"migration from {rev}:{old_path}: {len(old_lines) - len(missing)}/{len(old_lines)} "
          f"rule lines preserved verbatim in {INDEX} + {GUIDE_DIR}/")
    for l in missing:
        print(f"  MISSING: {l[:120]}")
    return 1 if missing else 0


# ─── self-test ───────────────────────────────────────────────────────────────────────────────

GOOD_INDEX = """# Agent Guide

## Before you touch these paths, read this page

| Path | Read first |
|---|---|
| `bin/`; `tools/a.html` | alpha |

## The topic pages

| Page | What |
|---|---|
| [alpha](docs/agent-guide/alpha.md) | a |
| [beta](docs/agent-guide/beta.md) | b |
"""
GOOD_ALPHA = """# Alpha

### Rule one — [gate: bin/gate.py]
- rule one text

### Rule two — [judgment]
- rule two text
"""
GOOD_BETA = """# Beta

### Rule three — [report: bin/gate.py; tools/a.html]
- rule three text
"""


def _tree(tmp: str) -> Path:
    root = Path(tmp)
    (root / "bin").mkdir()
    (root / "tools").mkdir()
    (root / GUIDE_DIR).mkdir(parents=True)
    (root / "bin" / "gate.py").write_text("# gate\n")
    (root / "tools" / "a.html").write_text("<p>a</p>\n")
    (root / INDEX).write_text(GOOD_INDEX)
    (root / GUIDE_DIR / "alpha.md").write_text(GOOD_ALPHA)
    (root / GUIDE_DIR / "beta.md").write_text(GOOD_BETA)
    bl = root / "bin" / "check_agent_guide_baseline.json"
    bl.write_text(json.dumps({PIN_KEY: len(GOOD_INDEX.splitlines())}))
    return root


def self_test() -> int:
    failures: list[str] = []

    def case(label: str, mutate, want: int, must_mention: str = ""):
        with tempfile.TemporaryDirectory(prefix="agent-guide-selftest.") as tmp:
            root = _tree(tmp)
            mutate(root)
            code, lines = run_checks(root, root / "bin" / "check_agent_guide_baseline.json")
            text = "\n".join(lines)
            if code != want:
                failures.append(f"{label}: exit {code}, want {want}\n{text}")
            elif must_mention and must_mention not in text:
                failures.append(f"{label}: report lacks {must_mention!r}\n{text}")

    case("clean tree exits 0", lambda r: None, 0)
    case("index grows past the pin", lambda r: (r / INDEX).write_text(GOOD_INDEX + "\nextra rule\n"),
         1, "RATCHET")
    case("index below the pin is a note, exit 0",
         lambda r: (r / "bin" / "check_agent_guide_baseline.json").write_text(json.dumps({PIN_KEY: 999})),
         0, "note:")
    case("unlinked guide", lambda r: (r / GUIDE_DIR / "gamma.md").write_text("# G\n\n### x — [judgment]\n"),
         1, "G1")
    case("index links a missing guide",
         lambda r: (r / INDEX).write_text(GOOD_INDEX + "| [delta](docs/agent-guide/delta.md) | d |\n"),
         1, "G1")
    case("heading without a tag",
         lambda r: (r / GUIDE_DIR / "alpha.md").write_text(GOOD_ALPHA + "\n### Untagged rule\n- text\n"),
         1, "G2")
    case("tag names a file that does not exist",
         lambda r: (r / GUIDE_DIR / "alpha.md").write_text(GOOD_ALPHA.replace("bin/gate.py", "bin/nope.py")),
         1, "no such file")
    case("judgment that names a path",
         lambda r: (r / GUIDE_DIR / "alpha.md").write_text(GOOD_ALPHA.replace("[judgment]", "[judgment: bin/gate.py]")),
         1, "G2")
    case("gate that names no path",
         lambda r: (r / GUIDE_DIR / "alpha.md").write_text(GOOD_ALPHA.replace("[gate: bin/gate.py]", "[gate:]")),
         1, "names no path")
    case("table path matches nothing",
         lambda r: (r / INDEX).write_text(GOOD_INDEX.replace("`tools/a.html`", "`tools/zzz.html`")),
         1, "G3")
    case("guide too long",
         lambda r: (r / GUIDE_DIR / "beta.md").write_text(GOOD_BETA + "- filler\n" * GUIDE_MAX_LINES),
         1, "G4")
    case("no baseline is could-not-check (2)",
         lambda r: (r / "bin" / "check_agent_guide_baseline.json").unlink(), 2, "could not check")
    case("baseline without the key is could-not-check (2)",
         lambda r: (r / "bin" / "check_agent_guide_baseline.json").write_text("{}"), 2, "could not check")

    # the migration proof on a synthetic split: heading and fence lines are structure, not rules
    new_union = set(rule_lines(GOOD_INDEX)) | set(rule_lines(GOOD_ALPHA)) | set(rule_lines(GOOD_BETA))
    old_kept = "# Old\n\n## Section\n- rule one text\n- rule two text\n- rule three text\n"
    if not set(rule_lines(old_kept)) <= new_union:
        failures.append("migration: a synthetic split that kept every rule line reads as lossy")
    old_lost = old_kept + "```bash\nrun thing\n```\n"
    if set(rule_lines(old_lost)) <= new_union:
        failures.append("migration: a dropped code line should be reported as missing")

    # the live tree
    if (ROOT / INDEX).is_file() and (ROOT / GUIDE_DIR).is_dir():
        code, lines = run_checks(ROOT)
        if code != 0:
            failures.append("live tree does not pass:\n" + "\n".join(lines))

    if failures:
        print("SELF-TEST FAILED")
        for f in failures:
            print(" -", f)
        return 1
    print("self-test OK: 13 synthetic cases + migration proof + live tree")
    return 0


# ─── main ────────────────────────────────────────────────────────────────────────────────────

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--update-baseline", action="store_true")
    ap.add_argument("--migration-from", metavar="REV")
    ap.add_argument("--old-path", default=INDEX)
    a = ap.parse_args(argv)
    root = Path(a.root).resolve()
    if a.self_test:
        return self_test()
    if a.update_baseline:
        return update_baseline(root, BASELINE)
    if a.migration_from:
        return migration(root, a.migration_from, a.old_path)
    code, lines = run_checks(root)
    print("\n".join(lines))
    print({0: "PASS", 1: "FAIL", 2: "COULD NOT CHECK"}[code])
    return code


if __name__ == "__main__":
    sys.exit(main())
