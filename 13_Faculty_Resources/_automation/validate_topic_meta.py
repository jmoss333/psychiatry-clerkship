#!/usr/bin/env python3
"""Validate topic_meta.json against the ReConnect topic-template contract.

Enforces the rules the renderer + rubric assume, so a shape error can't ship:
  - each topic is an object; 'read'/'tldr' are strings; 'points' is a list
  - 'ruleOut' (if present) is a non-empty list of strings
  - 'firstMove' NEVER appears without 'ruleOut'   (TOPIC_META_RUBRIC.md)
  - 'quiz' (if present) has 'q' (str), 'o' (>=2 options each with 't'),
    exactly ONE correct option (c:true), and 'why' (str)

Exits non-zero and prints every violation.
Usage:  python3 validate_topic_meta.py [path/to/topic_meta.json]
"""
import json, os, sys

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "topic_meta.json")

if not os.path.exists(path):
    print("topic_meta.json not found at %s — nothing to validate (skipping)." % path)
    sys.exit(0)

d = json.load(open(path, encoding="utf-8"))
errs = []
def bad(k, msg): errs.append("%s: %s" % (k, msg))

for k, v in d.items():
    if k == "_note":
        continue
    if not isinstance(v, dict):
        bad(k, "not an object"); continue
    if "read" in v and not isinstance(v["read"], (int, str)): bad(k, "'read' must be an integer (minutes) or string")
    if not isinstance(v.get("tldr", ""), str): bad(k, "'tldr' must be a string")
    if "points" in v and not isinstance(v["points"], list): bad(k, "'points' must be a list")
    if "ruleOut" in v:
        ro = v["ruleOut"]
        if not (isinstance(ro, list) and ro and all(isinstance(x, str) for x in ro)):
            bad(k, "'ruleOut' must be a non-empty list of strings")
    if "firstMove" in v and "ruleOut" not in v:
        bad(k, "'firstMove' without 'ruleOut' (rubric: never emit firstMove alone)")
    if "quiz" in v:
        q = v["quiz"]
        if not isinstance(q, dict):
            bad(k, "'quiz' must be an object")
        else:
            if not isinstance(q.get("q", ""), str) or not q.get("q"): bad(k, "quiz missing 'q'")
            o = q.get("o")
            if not (isinstance(o, list) and len(o) >= 2):
                bad(k, "quiz needs >=2 options in 'o'")
            else:
                nc = sum(1 for x in o if isinstance(x, dict) and x.get("c") is True)
                if nc != 1: bad(k, "quiz must have exactly one correct option (found %d)" % nc)
                if any(not isinstance(x, dict) or not x.get("t") for x in o):
                    bad(k, "a quiz option is missing 't'")
            if not isinstance(q.get("why", ""), str) or not q.get("why"): bad(k, "quiz missing 'why'")

topics = [k for k in d if k != "_note"]
if errs:
    print("topic_meta.json INVALID — %d issue(s) across %d topics:" % (len(errs), len(topics)))
    for e in errs: print("  -", e)
    sys.exit(1)
print("topic_meta.json OK — %d topics, contract satisfied." % len(topics))
