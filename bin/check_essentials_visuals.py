#!/usr/bin/env python3
"""Count Essentials reading pages that carry no table and no figure.

WHY (site review, 2026-11-09). The Essentials are the short list a learner actually reads.
On 2026-11-09 not one of the library's 266 curriculum pages carried a figure, and most
Essentials readings were bold-lead paragraphs with no table: a comparison such as NMS versus
serotonin syndrome ran as one 150-word paragraph. A page whose content is a comparison, a
timeline or a short list of can't-miss causes teaches faster with that content laid out.

THE METRIC. Every `.md` ref in `curriculum.json` `essentials` (both audiences), resolved to
its source through the ONE derived listing, `site_build/shipped_pages.json` (ADR-002: never
the producers). A page HAS A VISUAL when its source carries a Markdown table (a header
separator row) or a figure (`![`, `<img`, `<figure`, `<svg`). The count pinned is the number
of Essentials reading pages WITHOUT one.

A RATCHETING GATE (docs/RATCHETS.md): the count is pinned in
bin/essentials_visuals_baseline.json. A rise fails -- a new Essentials page arrives with no
visual, or an edit strips the only table from one. A fall prints a note and
--update-baseline lowers the pin. Nobody has to drive it to zero: some pages (a welcome
note) are honestly prose.

WHAT IT DOES NOT CHECK. Whether the table is any good, or accurate. That is the faculty
read at attestation. A table added to an attested page drifts its signature like any other
edit (docs/agent-guide/attestation-hashes.md), which is the intended review gate.

Exit 0 clean (at or below the pin), 1 a rise, 2 could not check: a registry missing or
unparsable, no Essentials reading resolved, a listed source missing, or no baseline.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "bin", "essentials_visuals_baseline.json")
SHIPPED = os.path.join("13_Faculty_Resources", "_automation", "site_build", "shipped_pages.json")
KEY = "pages_without_visual"

_TABLE_RE = re.compile(r"(?m)^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$")
_FIGURE_RE = re.compile(r"!\[|<img\b|<figure\b|<svg\b", re.IGNORECASE)


class CannotCheck(Exception):
    pass


def has_visual(text: str) -> bool:
    return bool(_TABLE_RE.search(text) or _FIGURE_RE.search(text))


def _load(path: str):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        raise CannotCheck("cannot read %s: %s" % (path, exc))


def essentials_refs(curriculum) -> list:
    ess = curriculum.get("essentials") if isinstance(curriculum, dict) else None
    if not isinstance(ess, dict):
        raise CannotCheck("curriculum.json has no essentials object")
    refs = []

    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key.startswith("_"):
                    continue
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
        elif isinstance(node, str) and node.endswith(".md") and node not in refs:
            refs.append(node)

    walk(ess)
    return refs


def measure(root: str) -> dict:
    curriculum = _load(os.path.join(root, "curriculum.json"))
    shipped = _load(os.path.join(root, SHIPPED))
    pages = shipped.get("pages") if isinstance(shipped, dict) else None
    if not isinstance(pages, list):
        raise CannotCheck("shipped_pages.json has no pages list")
    by_slug = {}
    for page in pages:
        if isinstance(page, dict) and isinstance(page.get("slug"), str):
            by_slug.setdefault(page["slug"], page)
    refs = essentials_refs(curriculum)
    without, audited = [], 0
    for ref in refs:
        page = by_slug.get(ref)
        if page is None:
            raise CannotCheck("Essentials ref %s is not in shipped_pages.json" % ref)
        source = page.get("source")
        path = os.path.join(root, source) if isinstance(source, str) else None
        if not path or not os.path.isfile(path):
            raise CannotCheck("source for %s is missing: %r" % (ref, source))
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        audited += 1
        if not has_visual(text):
            without.append(ref)
    if audited == 0:
        raise CannotCheck("no Essentials reading page resolved; nothing was audited")
    return {"audited": audited, KEY: len(without), "pages": sorted(without)}


def gate(result: dict, baseline_path: str) -> int:
    try:
        with open(baseline_path, encoding="utf-8") as fh:
            pin = json.load(fh)[KEY]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("COULD NOT CHECK  no usable baseline at %s (%s)" % (baseline_path, exc))
        return 2
    if not isinstance(pin, int) or isinstance(pin, bool):
        print("COULD NOT CHECK  baseline %s is not an integer" % KEY)
        return 2
    count = result[KEY]
    print("essentials visuals: %d of %d Essentials reading page(s) carry no table or figure (pin %d)"
          % (count, result["audited"], pin))
    for ref in result["pages"]:
        print("   - %s" % ref)
    if count > pin:
        print("FAIL  %d > %d: an Essentials reading lost its only table or figure, or a new one "
              "arrived without any. Add one, or justify the rise in a reviewed baseline edit." % (count, pin))
        return 1
    if count < pin:
        print("note: improved %d -> %d — run python3 bin/check_essentials_visuals.py "
              "--update-baseline to lock the gain in." % (pin, count))
    return 0


def self_test() -> int:
    with contextlib.redirect_stdout(io.StringIO()):
        checks = _self_test_checks()
    failed = [name for name, ok in checks if not ok]
    for name in failed:
        print("SELF-TEST FAIL  %s" % name)
    if failed:
        return 1
    print("self-test: OK — %d/%d checks passed (detection, dedupe, rise=1, fall=0, could-not-check=2)"
          % (len(checks), len(checks)))
    return 0


def _self_test_checks() -> list:
    checks = []

    def check(name, ok):
        checks.append((name, bool(ok)))

    check("pipe table detected", has_visual("a\n\n| A | B |\n|---|---|\n| 1 | 2 |\n"))
    check("aligned table detected", has_visual("| A | B |\n|:--|--:|\n| 1 | 2 |"))
    check("image detected", has_visual("text ![alt](x.png)"))
    check("inline svg detected", has_visual("<svg viewBox='0 0 1 1'></svg>"))
    check("prose is not a visual", not has_visual("**Lead** — prose only.\n\n- a list\n- of things\n"))
    check("a horizontal rule is not a table", not has_visual("above\n\n---\n\nbelow"))
    check("a pipe in prose is not a table", not has_visual("choose A | B and move on"))

    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, os.path.dirname(SHIPPED)))
        os.makedirs(os.path.join(tmp, "bin"))

        def write(rel, text):
            with open(os.path.join(tmp, rel), "w", encoding="utf-8") as fh:
                fh.write(text)

        write("curriculum.json", json.dumps({"essentials": {
            "_note": "ignored.md", "ms3": [{"refs": ["a.md", "tool.html"]}],
            "resident": [{"refs": ["a.md", "b.md"]}]}}))
        write(SHIPPED, json.dumps({"pages": [
            {"slug": "a.md", "source": "a_src.md"}, {"slug": "b.md", "source": "b_src.md"}]}))
        write("a_src.md", "| A | B |\n|---|---|\n| 1 | 2 |\n")
        write("b_src.md", "prose only\n")
        base = os.path.join(tmp, "bin", "baseline.json")

        result = measure(tmp)
        check("refs are deduplicated across audiences and tools are skipped", result["audited"] == 2)
        check("the prose page is counted", result[KEY] == 1 and result["pages"] == ["b.md"])
        write("bin/baseline.json", json.dumps({KEY: 1}))
        check("at the pin exits 0", gate(result, base) == 0)
        write("a_src.md", "the table was stripped\n")
        check("a rise exits 1", gate(measure(tmp), base) == 1)
        write("a_src.md", "| A | B |\n|---|---|\n| 1 | 2 |\n")
        write("b_src.md", "![fig](f.png)\n")
        check("a fall exits 0", gate(measure(tmp), base) == 0)
        check("no baseline exits 2", gate(result, os.path.join(tmp, "bin", "absent.json")) == 2)
        write("bin/baseline.json", json.dumps({"other": 1}))
        check("a baseline missing the key exits 2", gate(result, base) == 2)
        os.remove(os.path.join(tmp, "b_src.md"))
        try:
            measure(tmp)
            check("a missing source cannot be checked", False)
        except CannotCheck:
            check("a missing source cannot be checked", True)
        write("curriculum.json", json.dumps({"essentials": {"ms3": [{"refs": ["tool.html"]}]}}))
        try:
            measure(tmp)
            check("nothing audited cannot be checked", False)
        except CannotCheck:
            check("nothing audited cannot be checked", True)

    return checks


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--update-baseline", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return self_test()
    try:
        result = measure(ROOT)
    except CannotCheck as exc:
        print("COULD NOT CHECK  %s" % exc)
        return 2
    if args.json:
        print(json.dumps(result, indent=2))
        return 0
    if args.update_baseline:
        with open(BASELINE, "w", encoding="utf-8") as fh:
            json.dump({KEY: result[KEY]}, fh, indent=2)
            fh.write("\n")
        print("baseline written: %s = %d" % (KEY, result[KEY]))
        return 0
    return gate(result, BASELINE)


if __name__ == "__main__":
    sys.exit(main())
