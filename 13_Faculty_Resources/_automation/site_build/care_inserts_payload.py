#!/usr/bin/env python3
"""Build-time payload for the Care aftercare packet (docs/superpowers/plans/2026-10-12-care-packet-print.md §1).

The browser renders the packet from two sources of truth: the standard inserts
(data/care-inserts.v1.json) and the crisis contacts they reference (crisis_resources.json, the ONLY
place a crisis number may live). Nothing is resolved here. The payload is the validated inserts plus a
`contacts` map copied verbatim from the governed record, so the renderer can fill `{{crisis:<id>}}` and
build the patient crisis block without a single crisis id or number ever being typed in a front-door
module (the edit hook, the pre-commit gate and tests/crisis-block.test.mjs all reject that).

`required` carries the ids whose digit-exact contacts validate_care_inserts.py already pins. The sheet
checks the OUTPUT it renders against this list, so a payload that never arrived, or lost a line, fails
closed at the one place that can stop a page going home without its crisis lines.

What is deliberately NOT shipped: each helpline row's `source` and `alsoSources` URLs and its
`verifiedDate` (an internal provenance record: "neither is ever printed", so a browser that never
receives them cannot print them), and the governed record's `alsoAvailable`, notes, sources and review
dates (further numbers and internal notes).

The payload is built from the validator's own loader and `check()`; there is no second token scanner to
drift from it. `check()` is given the data's own `generatedAt` as "today" so the build stays
byte-reproducible; freshness against the real clock is the validator's own gate (build_and_check.sh).

Injection follows the Front Door's verified-needle convention (FD_CASE_ARC, FD_PAIRINGS): the shell
declares `var FD_CARE_INSERTS=null;`, the build swaps that exact line once, and a payload that never
arrived is simply null. The resident build rebrands this MS3-built shell and inherits the payload.
"""

import os
import re
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
AUTOMATION = os.path.dirname(HERE)
for _directory in (AUTOMATION, HERE):
    if _directory not in sys.path:
        sys.path.insert(0, _directory)

import json  # noqa: E402  (after the path set-up so a sibling json.py can never shadow it)

import frontdoor_catalog  # noqa: E402  (its _inline_json is the single escaper for inline shell data)
import validate_care_inserts as _validator  # noqa: E402

NEEDLE = "var FD_CARE_INSERTS=null;"
DECLARATION = "var FD_CARE_INSERTS="
CRISIS_TOKEN = re.compile(r"\{\{crisis:([a-z0-9_]+)\}\}")


class PayloadError(ValueError):
    """The packet cannot be built safely. The build aborts rather than ship a hole."""


def _load(path, label):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise PayloadError("%s: cannot be read (%s)" % (label, error))


def referenced_ids(data):
    """Crisis ids the packet prints, in `crisis` order, then any only named inside prose."""
    ids = [line["ref"] for line in data["crisis"]]
    blob = json.dumps([data["crisisCopy"], data["inserts"]], ensure_ascii=False)
    for token in CRISIS_TOKEN.findall(blob):
        if token not in ids:
            ids.append(token)
    return ids


def _printable(insert):
    """An insert as the browser may see it: a helpline row keeps only who, number and what."""
    if "table" not in insert:
        return insert
    rows = [{"who": row["who"], "number": row["number"], "what": row["what"]} for row in insert["table"]]
    return dict(insert, table=rows)


def build_payload(data_path=None, schema_path=None, crisis_path=None, today=None):
    """The validated payload, or PayloadError. Paths default to the real files (tests pass copies)."""
    if _validator.Draft7Validator is None:
        raise PayloadError("jsonschema is not installed - run: python3 -m pip install -r requirements.txt")
    data = _load(data_path or _validator.DATA, "care-inserts.v1.json")
    schema = _load(schema_path or _validator.SCHEMA, "care-inserts.v1.schema.json")
    crisis = _load(crisis_path or _validator.CRISIS, "crisis_resources.json")
    when = today or _validator.parse_iso(data.get("generatedAt") if isinstance(data, dict) else None)
    if when is None:
        raise PayloadError("care-inserts.v1.json: generatedAt is not a calendar date")

    report = _validator.check(data, schema, crisis, when)
    if report.errors:
        raise PayloadError("care-inserts.v1.json failed validation:\n   - " + "\n   - ".join(report.errors))

    resources = {resource["id"]: resource for resource in crisis["resources"]}
    contacts = {}
    for rid in referenced_ids(data):
        resource = resources[rid]  # the validator proved every reference resolves
        contact = str(resource.get("contact", "")).strip()
        if not contact:
            raise PayloadError("crisis_resources.json '%s' has a blank contact; the packet cannot print it" % rid)
        contacts[rid] = {
            "name": resource["name"],
            "contact": resource["contact"],
            "availability": resource.get("availability", ""),
        }
    missing = [rid for rid in _validator.REQUIRED_CRISIS if rid not in contacts]
    if missing:
        raise PayloadError("the packet must carry %s; `crisis` does not reference it" % ", ".join(sorted(missing)))

    return {
        "generatedAt": data["generatedAt"],
        "crisisCopy": data["crisisCopy"],
        "crisis": data["crisis"],
        "inserts": [_printable(insert) for insert in data["inserts"]],
        "contacts": contacts,
        "required": sorted(_validator.REQUIRED_CRISIS),
    }


def inject(text, payload):
    """Swap the shell's null declaration for the payload. Exactly one needle or ValueError."""
    found = text.count(NEEDLE)
    if found != 1:
        raise PayloadError(
            "FD_CARE_INSERTS needle missing or duplicated in the shell (found %d of %r)" % (found, NEEDLE)
        )
    return text.replace(NEEDLE, DECLARATION + frontdoor_catalog._inline_json(payload) + ";")


def assert_injected(text):
    """Postcondition for every built shell: the null declaration is gone and one payload is declared."""
    if NEEDLE in text:
        raise PayloadError("FD_CARE_INSERTS still has its null declaration; the payload never reached the shell")
    declared = text.count(DECLARATION)
    if declared != 1:
        raise PayloadError("FD_CARE_INSERTS must be declared exactly once in the built shell (found %d)" % declared)


if __name__ == "__main__":
    try:
        print(json.dumps(build_payload(), indent=2))
    except PayloadError as error:
        print("care_inserts_payload: %s" % error, file=sys.stderr)
        raise SystemExit(1)
