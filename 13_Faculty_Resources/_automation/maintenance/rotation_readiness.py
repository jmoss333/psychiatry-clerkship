#!/usr/bin/env python3
"""Validate privacy-safe rotation blocks and emit a readiness passport."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path


OPAQUE_ID_RE = re.compile(
    r"^rot-[0-9]{4}-hx-(?=[a-f0-9]{16}$)(?=[a-f0-9]*[a-f])"
    r"(?=[a-f0-9]*[0-9])[a-f0-9]{16}$"
)
BLOCK_KEYS = {"id", "startsOn", "endsOn", "status"}
FORBIDDEN_KEYS = {"name", "email", "learnerId", "patient", "passcode", "credential"}
STATUSES = {"planned", "active", "completed"}
MANUAL_CHECKLIST = (
    "issue a new non-identifying SP_ROTATION_ID",
    "rotate the learner passcode and separate operations credential",
    "preserve the prior content-free usage receipt",
    "run the Interview Room red-team checklist and golden transcript",
    "verify the latest production canary, release rehearsal, governance digest, and attestation gate",
    "confirm managed voice remains disabled unless all external faculty/privacy gates are recorded",
)


class RotationConfigError(ValueError):
    """Rotation configuration is malformed or violates privacy boundaries."""


def _opaque_id(value, label="block id"):
    if not isinstance(value, str) or OPAQUE_ID_RE.fullmatch(value) is None:
        raise RotationConfigError(
            f"{label} must be a non-identifying opaque rotation ID"
        )
    return value


def _utc_today():
    return datetime.now(timezone.utc).date()


def _parse_date(value, label):
    if not isinstance(value, str) or not value or value != value.strip():
        raise RotationConfigError(f"{label} must be an exact ISO date")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise RotationConfigError(f"{label} must be an exact ISO date") from exc
    if parsed.isoformat() != value:
        raise RotationConfigError(f"{label} must be an exact ISO date")
    return parsed


def validate_rotation_config(value):
    """Validate config v1 and return canonical blocks sorted by date and opaque ID."""
    if not isinstance(value, dict) or set(value) != {"schemaVersion", "blocks"}:
        raise RotationConfigError("rotation config has unexpected keys or shape")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1:
        raise RotationConfigError("rotation config schemaVersion must be 1")
    if not isinstance(value["blocks"], list):
        raise RotationConfigError("rotation config blocks must be an array")

    canonical = []
    seen_ids = set()
    for index, raw in enumerate(value["blocks"]):
        if not isinstance(raw, dict):
            raise RotationConfigError(f"block {index} must be an object")
        forbidden = FORBIDDEN_KEYS.intersection(raw)
        if forbidden:
            raise RotationConfigError(
                f"block {index} contains forbidden identity or secret keys"
            )
        if set(raw) != BLOCK_KEYS:
            raise RotationConfigError(f"block {index} contains an unexpected key")

        block_id = _opaque_id(raw["id"], f"block {index} id")
        if block_id in seen_ids:
            raise RotationConfigError("rotation config contains a duplicate block id")
        seen_ids.add(block_id)

        starts = _parse_date(raw["startsOn"], f"block {index} startsOn")
        ends = _parse_date(raw["endsOn"], f"block {index} endsOn")
        if ends < starts:
            raise RotationConfigError(f"block {index} end is before start")
        duration = (ends - starts).days + 1
        if duration < 35 or duration > 49:
            raise RotationConfigError(
                f"block {index} duration must be 35 to 49 calendar days"
            )
        status = raw["status"]
        if status not in STATUSES:
            raise RotationConfigError(f"block {index} status is invalid")
        canonical.append(
            {
                "id": block_id,
                "startsOn": starts.isoformat(),
                "endsOn": ends.isoformat(),
                "status": status,
            }
        )

    canonical.sort(key=lambda block: (block["startsOn"], block["id"]))
    open_blocks = [block for block in canonical if block["status"] != "completed"]
    for left, right in zip(open_blocks, open_blocks[1:]):
        if date.fromisoformat(right["startsOn"]) <= date.fromisoformat(left["endsOn"]):
            raise RotationConfigError("planned or active rotation blocks overlap")
    return canonical


def _passport(state, block, today):
    if block is None:
        block_id = starts_on = ends_on = days_until_start = None
    else:
        block_id = _opaque_id(block["id"])
        starts_on = block["startsOn"]
        ends_on = block["endsOn"]
        days_until_start = (date.fromisoformat(starts_on) - today).days
    return {
        "schemaVersion": 1,
        "state": state,
        "blockId": block_id,
        "startsOn": starts_on,
        "endsOn": ends_on,
        "daysUntilStart": days_until_start,
        "manualChecklist": list(MANUAL_CHECKLIST),
    }


def evaluate_rotation(blocks, today):
    """Select the relevant block and calculate its readiness routing state."""
    if not isinstance(today, date):
        raise RotationConfigError("today must be a date")
    ordered = validate_rotation_config({"schemaVersion": 1, "blocks": blocks})
    if not ordered:
        return _passport("configuration_required", None, today)

    for block in ordered:
        starts = _parse_date(block["startsOn"], "startsOn")
        ends = _parse_date(block["endsOn"], "endsOn")
        if block["status"] != "completed" and starts <= today <= ends:
            return _passport("active", block, today)

    future = [
        block
        for block in ordered
        if block["status"] != "completed"
        and date.fromisoformat(block["startsOn"]) > today
    ]
    if future:
        block = future[0]
        days_until_start = (date.fromisoformat(block["startsOn"]) - today).days
        if days_until_start > 7:
            state = "not_due"
        elif days_until_start == 7:
            state = "due"
        else:
            state = "overdue"
        return _passport(state, block, today)

    return _passport("complete", ordered[-1], today)


def rotation_exit_code(passport):
    return 10 if passport.get("state") in {"due", "overdue"} else 0


def render_rotation_markdown(passport):
    block_id = passport["blockId"]
    if block_id is not None:
        block_id = _opaque_id(block_id, "passport blockId")
    lines = [
        "# Rotation readiness passport",
        "",
        f"- State: `{passport['state']}`",
        f"- Block ID: `{block_id or 'not configured'}`",
        f"- Starts: `{passport['startsOn'] or 'not configured'}`",
        f"- Ends: `{passport['endsOn'] or 'not configured'}`",
        f"- Days until start: `{passport['daysUntilStart'] if passport['daysUntilStart'] is not None else 'unknown'}`",
        "",
        "## Manual checklist",
        "",
    ]
    lines.extend(f"- {item}" for item in passport["manualChecklist"])
    lines.extend(
        [
            "",
            "This automation does not rotate or display credentials.",
            "This automation does not authorize managed voice.",
            "",
        ]
    )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--out-json", type=Path, required=True)
    parser.add_argument("--out-md", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        value = json.loads(args.config.read_text(encoding="utf-8"))
        blocks = validate_rotation_config(value)
        passport = evaluate_rotation(blocks, today=_utc_today())
        args.out_json.parent.mkdir(parents=True, exist_ok=True)
        args.out_md.parent.mkdir(parents=True, exist_ok=True)
        args.out_json.write_text(
            json.dumps(passport, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        args.out_md.write_text(render_rotation_markdown(passport), encoding="utf-8")
        return rotation_exit_code(passport)
    except (OSError, json.JSONDecodeError, RotationConfigError) as exc:
        print(f"rotation readiness failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
