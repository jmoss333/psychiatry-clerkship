#!/usr/bin/env python3
"""
test_qbank.py — Test evidence for the qbank data-quality gate.

Proves the HARD gates in qbank_validate.py actually catch the failure modes
they claim to (regression guard). Run: python3 engine/test_qbank.py
Exit 0 = all pass. Uses only the stdlib + qbank_validate.
"""
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qbank_validate as V  # noqa: E402

PILOT = Path(__file__).resolve().parent.parent / "04_pilot_batch_01.json"
ITEMS = json.loads(PILOT.read_text())["items"]


def good_item():
    return copy.deepcopy(ITEMS[0])


def harderrs(items):
    h, _ = V.check_items(items)
    return h


def expect(cond, name):
    print(("PASS" if cond else "FAIL"), "-", name)
    return cond


def main():
    ok = True

    # 0. clean pilot passes hard gates
    h0, _ = V.check_items(ITEMS)
    ok &= expect(not h0, "clean pilot has zero HARD failures")

    # 1. two keyed answers -> caught
    it = good_item()
    for o in it["options"]:
        o["c"] = True
    ok &= expect(any("flagged correct" in m for _, m in harderrs([it])),
                 "detects >1 keyed answer")

    # 2. correct_option / c-flag mismatch -> caught
    it = good_item()
    it["correct_option"] = "A" if it["correct_option"] != "A" else "B"
    ok &= expect(any("correct_option" in m for _, m in harderrs([it])),
                 "detects correct_option vs c-flag mismatch")

    # 3. missing distractor explanation -> caught
    it = good_item()
    it["explanation_for_each_distractor"] = {}
    ok &= expect(any("distractor explanation missing" in m for _, m in harderrs([it])),
                 "detects missing distractor explanations")

    # 4. no references -> caught
    it = good_item()
    it["references"] = []
    ok &= expect(any("no references" in m for _, m in harderrs([it])),
                 "detects missing references")

    # 5. invalid blueprint tag -> caught
    it = good_item()
    it["blueprint"]["comat"]["presentation"] = "Made Up Cluster"
    ok &= expect(any("invalid COMAT presentation" in m for _, m in harderrs([it])),
                 "detects invalid COMAT presentation tag")

    # 6. prohibited endorsement text -> caught
    it = good_item()
    it["pearl"] = "This is an official NBME item, endorsed by the NBME."
    ok &= expect(any("branding" in m for _, m in harderrs([it])),
                 "detects prohibited/endorsement branding")

    # 7. unresolved placeholder -> caught
    it = good_item()
    it["key_takeaway"] = "TODO: write this later"
    ok &= expect(any("placeholder" in m for _, m in harderrs([it])),
                 "detects unresolved placeholder")

    # 8. duplicate id -> caught
    a, b = good_item(), good_item()
    b["id"] = a["id"]
    ok &= expect(any("duplicate id" in m for _, m in harderrs([a, b])),
                 "detects duplicate ids")

    # 9. duplicate-stem detector fires on identical stems
    a, b = good_item(), good_item()
    b["id"] = a["id"] + "_dup"
    dsoft = V.check_duplicates([a, b])
    ok &= expect(any("DUP" == t for t, _ in dsoft), "near-duplicate stem detector fires")

    # 10. coverage math: 24-item pilot is under every 180 quota
    cov = V.coverage(ITEMS, 180)
    ok &= expect(all(c["status"] == "under" for c in cov["category"].values()),
                 "coverage flags all categories under 180 quota at pilot scale")

    print("\nTOTAL:", "ALL PASS" if ok else "FAILURES PRESENT")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
