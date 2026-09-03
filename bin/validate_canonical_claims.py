#!/usr/bin/env python3
"""Enforce the canonical clinical claims registry.

The library asserts the same clinical fact on many pages. When one copy is
corrected, the others silently keep the old version -- see the Modini
mis-attribution in how_we_know_teaching.json ("cited at four places in the
library; the worst of the four was a quiz answer") and PR #483, where catatonia
corrections missed copies. At 997 pages this is structural, not an oversight.

This registry inverts the maintenance model: a small set of faculty-attested
statements, each with the pages that must agree with it. Two mechanisms, because
a machine can check one kind of drift and not the other:

  guards    -- regex checks. Mechanical and exact. A corrected error becomes a
               permanent 'forbidden' pattern, so it cannot come back silently.
  appliesTo -- content hashes. A page whose hash no longer matches the one
               recorded at attestation is flagged for re-check. Semantic drift
               is not machine-checkable; turning it into change detection is.

A 'pending' slot with no appliesTo and no guards is inert by design, so the
registry ships green and starts enforcing only as faculty fill slots in.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
REGISTRY = REPO / "13_Faculty_Resources" / "canonical_claims.json"
SCHEMA = REPO / "13_Faculty_Resources" / "canonical_claims.schema.json"


def sha256_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_json(path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def validate_schema(registry, schema, failures):
    try:
        from jsonschema import Draft7Validator
    except ImportError:
        failures.append("jsonschema is not installed; cannot validate the registry shape")
        return
    Draft7Validator.check_schema(schema)
    for error in sorted(Draft7Validator(schema).iter_errors(registry), key=lambda e: list(e.path)):
        where = "/".join(str(p) for p in error.path) or "<root>"
        failures.append("schema: {}: {}".format(where, error.message))


def compile_guard(claim_id, kind, guard, failures):
    """A guard that cannot compile is a broken check, not a passing one."""
    try:
        return re.compile(guard["pattern"], re.IGNORECASE)
    except re.error as exc:
        failures.append(
            "{}: {} guard has an invalid regex ({}): {}".format(
                claim_id, kind, exc, guard["pattern"]
            )
        )
        return None


def check_claim(claim_id, claim, failures, notices):
    guards = claim.get("guards", {})
    forbidden = [(g, compile_guard(claim_id, "forbidden", g, failures)) for g in guards.get("forbidden", [])]
    required = [(g, compile_guard(claim_id, "required", g, failures)) for g in guards.get("required", [])]

    applies_to = claim.get("appliesTo", [])
    if claim.get("status") == "reviewed" and not applies_to:
        failures.append(
            "{}: status is 'reviewed' but appliesTo is empty -- an attested "
            "statement that governs no page enforces nothing".format(claim_id)
        )

    for entry in applies_to:
        rel = entry["path"]
        target = REPO / rel
        if not target.is_file():
            failures.append("{}: appliesTo path does not exist: {}".format(claim_id, rel))
            continue

        text = target.read_text(encoding="utf-8", errors="replace")

        for guard, pattern in forbidden:
            if pattern is not None and pattern.search(text):
                failures.append(
                    "{}: forbidden pattern present in {} -- {}".format(claim_id, rel, guard["why"])
                )

        for guard, pattern in required:
            if pattern is not None and not pattern.search(text):
                failures.append(
                    "{}: required pattern missing from {} -- {}".format(claim_id, rel, guard["why"])
                )

        recorded = entry.get("contentHashAtReview")
        if recorded:
            actual = sha256_text(text)
            if actual != recorded:
                notices.append(
                    "{}: {} changed since attestation -- re-check it against the "
                    "canonical statement, then update contentHashAtReview".format(claim_id, rel)
                )


def main():
    failures = []
    notices = []

    if not REGISTRY.is_file():
        print("FAIL  canonical claims registry not found: {}".format(REGISTRY))
        return 1
    if not SCHEMA.is_file():
        print("FAIL  canonical claims schema not found: {}".format(SCHEMA))
        return 1

    registry = load_json(REGISTRY)
    schema = load_json(SCHEMA)
    validate_schema(registry, schema, failures)

    claims = registry.get("claims", {})
    for claim_id in sorted(claims):
        check_claim(claim_id, claims[claim_id], failures, notices)

    pending = sum(1 for c in claims.values() if c.get("status") == "pending")
    reviewed = len(claims) - pending
    governed = sum(len(c.get("appliesTo", [])) for c in claims.values())
    guard_count = sum(
        len(c.get("guards", {}).get("forbidden", [])) + len(c.get("guards", {}).get("required", []))
        for c in claims.values()
    )

    for notice in notices:
        print("DRIFT {}".format(notice))
    for failure in failures:
        print("FAIL  {}".format(failure))

    print(
        "canonical claims: {} slots ({} attested, {} pending), "
        "{} governed pages, {} guards".format(
            len(claims), reviewed, pending, governed, guard_count
        )
    )

    if failures:
        print("canonical claims: FAILED ({} problem(s))".format(len(failures)))
        return 1
    if notices:
        print("canonical claims: OK, {} page(s) need re-check".format(len(notices)))
        return 0
    print("canonical claims OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
