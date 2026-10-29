#!/usr/bin/env python3
"""check_monolith_ratchet.py — a line-count ceiling on files that may only shrink.

DECISION: attest-mjs-shrink-only (decisions.json, 2026-10-18). `faculty-console/netlify/functions/
attest.mjs` is the only code allowed to write an attestation hash and it was 4,075 lines in one
serverless function file (124 function declarations) when the 2026-10-17 architecture review
measured it (finding F4, recommendation R5). The owner chose a shrinking-only pin over headroom:
every change to the hash writer that adds net lines must first extract something — a pure module
with its parity test, the pattern `press-forecast.mjs` and `attestation-hash.mjs` already follow.

A ratchet in the repo's own sense (docs/RATCHETS.md): the pin lives in
bin/check_monolith_ratchet_baseline.json, a rise exits 1, a fall prints a `note:` naming
`--update-baseline`, and could-not-check — no baseline, a pinned file missing, a non-integer pin —
exits 2, never 0. Lower a pin only after a reviewed reduction, JSON diff in the same PR. Adding a
file to the baseline pins the next monolith (`app.mjs` at 6,485 lines and `spa_index.html` at
3,999 are the candidates the review named). The baseline is gate DATA and therefore content, like
every other ratchet baseline here; the rule that a pin may only fall lives in this file.

    python3 bin/check_monolith_ratchet.py               # check
    python3 bin/check_monolith_ratchet.py --self-test   # falsify it
    python3 bin/check_monolith_ratchet.py --update-baseline
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = Path(__file__).resolve().with_name("check_monolith_ratchet_baseline.json")


def count_lines(p: Path) -> int:
    return len(p.read_text(encoding="utf-8").splitlines())


def run(root: Path, baseline: Path) -> tuple[int, list[str]]:
    out: list[str] = []
    if not baseline.is_file():
        return 2, [f"could not check: baseline {baseline.name} missing"]
    try:
        pins = json.loads(baseline.read_text(encoding="utf-8"))
        assert isinstance(pins, dict) and pins
    except (ValueError, AssertionError):
        return 2, [f"could not check: baseline {baseline.name} is not a non-empty object"]
    code = 0
    for rel, pin in sorted(pins.items()):
        p = root / rel
        if not isinstance(pin, int):
            out.append(f"could not check: pin for {rel} is not an integer")
            code = 2
            continue
        if not p.is_file():
            out.append(f"could not check: pinned file {rel} is missing — delete its pin if it was removed on purpose")
            code = 2
            continue
        n = count_lines(p)
        if n > pin:
            out.append(f"RATCHET {rel}: {n} lines, pin {pin} (+{n - pin}) — extract a module before adding; "
                       f"this file may only shrink")
            code = max(code, 1)
        elif n < pin:
            out.append(f"note: {rel}: {n} lines, below the pin of {pin} — lock it in with "
                       f"python3 bin/check_monolith_ratchet.py --update-baseline")
            out.append(f"  ok  {rel}: {n} ≤ {pin}")
        else:
            out.append(f"  ok  {rel}: {n} = {pin}")
    out.append(f"monolith ratchet: {len(pins)} pinned file(s)")
    return code, out


def update_baseline(root: Path, baseline: Path) -> int:
    pins = json.loads(baseline.read_text(encoding="utf-8"))
    new = {rel: count_lines(root / rel) for rel in pins}
    baseline.write_text(json.dumps(new, indent=2) + "\n", encoding="utf-8")
    for rel, n in new.items():
        print(f"pinned {rel} = {n}")
    return 0


def self_test() -> int:
    failures: list[str] = []

    def case(label, lines, pin_json, want, mention=""):
        with tempfile.TemporaryDirectory(prefix="monolith-selftest.") as tmp:
            root = Path(tmp)
            (root / "fn").mkdir()
            if lines is not None:
                (root / "fn" / "big.mjs").write_text("x\n" * lines)
            bl = root / "baseline.json"
            if pin_json is not None:
                bl.write_text(pin_json)
            code, out = run(root, bl)
            text = "\n".join(out)
            if code != want:
                failures.append(f"{label}: exit {code}, want {want}\n{text}")
            elif mention and mention not in text:
                failures.append(f"{label}: report lacks {mention!r}\n{text}")

    case("at the pin passes", 100, '{"fn/big.mjs": 100}', 0, "ok")
    case("one line over fails", 101, '{"fn/big.mjs": 100}', 1, "RATCHET")
    case("below the pin passes with a note", 90, '{"fn/big.mjs": 100}', 0, "note:")
    case("pinned file missing is could-not-check", None, '{"fn/big.mjs": 100}', 2, "could not check")
    case("no baseline is could-not-check", 100, None, 2, "could not check")
    case("non-integer pin is could-not-check", 100, '{"fn/big.mjs": "100"}', 2, "could not check")
    case("empty baseline is could-not-check", 100, "{}", 2, "could not check")
    # the live tree
    code, out = run(ROOT, BASELINE)
    if code != 0:
        failures.append("live tree does not pass:\n" + "\n".join(out))
    if failures:
        print("SELF-TEST FAILED")
        for f in failures:
            print(" -", f)
        return 1
    print("self-test OK: 7 synthetic cases + live tree")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="line-count ceiling on files that may only shrink")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--update-baseline", action="store_true")
    a = ap.parse_args(argv)
    if a.self_test:
        return self_test()
    if a.update_baseline:
        return update_baseline(ROOT, BASELINE)
    code, out = run(ROOT, BASELINE)
    print("\n".join(out))
    print({0: "PASS", 1: "FAIL", 2: "COULD NOT CHECK"}[code])
    return code


if __name__ == "__main__":
    sys.exit(main())
