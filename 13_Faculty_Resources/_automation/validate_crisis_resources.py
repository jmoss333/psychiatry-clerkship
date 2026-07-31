#!/usr/bin/env python3
"""Validate crisis_resources.json — the single source of truth for shipped crisis contacts.

Runs in the build gate and in CI. Checks the schema contract plus safety invariants that a
JSON Schema cannot express: that the contacts a student actually needs are present, and that
every number carries an official verification source.
"""

import json
import re
import sys
from pathlib import Path

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover - only before dependency installation
    Draft7Validator = None

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "crisis_resources.json"
SCHEMA = ROOT / "crisis_resources.schema.json"

# Contacts that must never disappear from the shipped block. Keyed by resource id, with a
# pattern the contact string must match so a silent transcription error also fails.
REQUIRED_CONTACTS = {
    "lifeline_988": re.compile(r"\b988\b"),
    "crisis_text_line": re.compile(r"\b741741\b"),
    "maine_crisis_line": re.compile(r"\b1-888-568-1112\b"),
    "emergency_911": re.compile(r"\b911\b"),
}

# Aggregators and directories are not acceptable provenance for a crisis number.
DISALLOWED_SOURCE_HOSTS = ("wikipedia.org", "healthline.com", "webmd.com", "psychologytoday.com")


def fail(errors):
    print("crisis_resources.json: FAILED (%d problem(s))" % len(errors))
    for error in errors:
        print("   -", error)
    return 1


def main():
    errors = []

    for path in (DATA, SCHEMA):
        if not path.exists():
            errors.append("%s: MISSING" % path.name)
    if errors:
        return fail(errors)

    try:
        data = json.loads(DATA.read_text(encoding="utf-8"))
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return fail(["invalid JSON at line %d col %d: %s" % (error.lineno, error.colno, error.msg)])

    if Draft7Validator is None:
        return fail(["jsonschema not installed — run: python3 -m pip install -r requirements.txt"])

    for error in sorted(Draft7Validator(schema).iter_errors(data), key=lambda e: list(e.path)):
        pointer = "/" + "/".join(str(p) for p in error.path)
        errors.append("%s: %s" % (pointer or "/", error.message))

    resources = {r["id"]: r for r in data.get("resources", []) if isinstance(r, dict)}

    for rid, pattern in REQUIRED_CONTACTS.items():
        resource = resources.get(rid)
        if resource is None:
            errors.append("required resource '%s' is missing" % rid)
            continue
        if not pattern.search(resource.get("contact", "")):
            errors.append(
                "resource '%s' contact %r does not contain the expected number (%s)"
                % (rid, resource.get("contact"), pattern.pattern)
            )

    for rid, resource in resources.items():
        source = resource.get("verificationSource", "")
        for host in DISALLOWED_SOURCE_HOSTS:
            if host in source:
                errors.append(
                    "resource '%s' cites non-authoritative source %s — use the operating "
                    "organization or a government page" % (rid, host)
                )

    # The Crisis Text Line keyword is the field most likely to be copied stale from upstream
    # (ReConnect stores the outdated "HELLO"); assert the verified keyword explicitly.
    ctl = resources.get("crisis_text_line")
    if ctl and "HOME" not in ctl.get("contact", ""):
        errors.append(
            "crisis_text_line contact must use the official keyword HOME "
            "(crisistextline.org); got %r" % ctl.get("contact")
        )

    if errors:
        return fail(errors)

    print(
        "crisis_resources.json: OK — %d resource(s), verified %s"
        % (len(resources), max(r["verifiedOn"] for r in resources.values()))
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
