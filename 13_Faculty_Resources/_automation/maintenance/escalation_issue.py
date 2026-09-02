#!/usr/bin/env python3
"""Render the rolling automation-failure escalation issue.

A deadman for the deadman. Every scheduled maintenance and surveillance
workflow reports here through ``workflow_run``; this module folds one such
event into the rolling issue's state and renders the next body.

Deliberately shares no code path with ``maintenance_issue.py``: the whole
point is to keep reporting when that path is the thing that broke.

Governance: this module never closes an issue and emits no ``close``
decision. Recovery is *recorded* — a person closes the row when the
underlying automation is genuinely healthy again. See the "Review issue
lifecycles" section of the maintenance README.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

MARKER = "<!-- automation:failure-escalation -->"
TITLE = "automation: scheduled job failures"
STATE_BEGIN = "<!-- state:begin -->"
STATE_END = "<!-- state:end -->"
STATE_VERSION = 1
MAX_ERROR_CHARS = 300

FAILING = "failing"
RECOVERED = "recovered"

CREATE = "create"
UPDATE = "update"
NONE = "none"


class EscalationError(RuntimeError):
    """Raised when the rolling issue cannot be interpreted safely."""


def has_ownership_marker(body):
    """True when ``body``'s first line is exactly this module's marker."""
    return isinstance(body, str) and body.splitlines()[:1] == [MARKER]


def select_issue(issues):
    """Return the single open issue owned by this module, or ``None``.

    Fails closed on an ambiguous match, mirroring ``maintenance_issue.py``.
    """
    owned = [
        issue
        for issue in issues
        if isinstance(issue, dict) and has_ownership_marker(issue.get("body"))
    ]
    if len(owned) > 1:
        raise EscalationError("ambiguous automation escalation issue marker")
    return owned[0] if owned else None


def parse_state(body):
    """Recover the machine-readable state block from an issue body."""
    if not isinstance(body, str):
        return {}
    match = re.search(
        rf"{re.escape(STATE_BEGIN)}\s*```json\s*(.*?)\s*```\s*{re.escape(STATE_END)}",
        body,
        re.DOTALL,
    )
    if not match:
        return {}
    try:
        state = json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}
    if not isinstance(state, dict):
        return {}
    workflows = state.get("workflows")
    return workflows if isinstance(workflows, dict) else {}


def _clean_error(text):
    """First meaningful line of a failure log, truncated and single-line."""
    if not isinstance(text, str):
        return ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        # Strip the runner's leading ISO timestamp when present.
        line = re.sub(r"^\S+Z\s+", "", line)
        if not line:
            continue
        if len(line) > MAX_ERROR_CHARS:
            line = line[: MAX_ERROR_CHARS - 1] + "…"
        return line
    return ""


def apply_event(workflows, event):
    """Fold one ``workflow_run`` completion into the tracked state."""
    name = event["workflow"]
    previous = workflows.get(name) if isinstance(workflows.get(name), dict) else {}
    was_failing = previous.get("status") == FAILING

    if event["conclusion"] == "failure":
        streak = previous.get("consecutive_failures", 0)
        streak = streak + 1 if isinstance(streak, int) and streak > 0 else 1
        workflows[name] = {
            "status": FAILING,
            "consecutive_failures": streak,
            "first_failed_at": previous.get("first_failed_at") or event["at"],
            "last_event_at": event["at"],
            "run_url": event["run_url"],
            "error": _clean_error(event.get("error", "")),
        }
        return workflows

    if was_failing:
        workflows[name] = {
            "status": RECOVERED,
            "consecutive_failures": 0,
            "recovered_after": previous.get("consecutive_failures", 0),
            "last_event_at": event["at"],
            "run_url": event["run_url"],
        }
    elif name in workflows:
        # A success on an already-green row carries no new information.
        workflows[name]["last_event_at"] = event["at"]
    return workflows


def failing(workflows):
    return {
        name: row
        for name, row in sorted(workflows.items())
        if isinstance(row, dict) and row.get("status") == FAILING
    }


def render_body(workflows):
    """Render the full issue body, marker first, state block last."""
    red = failing(workflows)
    recovered = {
        name: row
        for name, row in sorted(workflows.items())
        if isinstance(row, dict) and row.get("status") == RECOVERED
    }

    lines = [MARKER, "", "# Scheduled automation failures", ""]
    if red:
        lines.append(
            f"{len(red)} scheduled workflow(s) are failing. "
            "Each row shows the consecutive-failure count."
        )
        lines.extend(["", "| Workflow | Consecutive | Latest run | First error |", "| --- | --- | --- | --- |"])
        for name, row in red.items():
            error = str(row.get("error") or "—").replace("|", "\\|")
            lines.append(
                f"| {name} | {row.get('consecutive_failures', 1)} "
                f"| [run]({row.get('run_url', '')}) | {error} |"
            )
    else:
        lines.append("Every watched workflow has reported green since its last failure.")

    if recovered:
        lines.extend(["", "## Recovered since the last failure", ""])
        for name, row in recovered.items():
            after = row.get("recovered_after", 0)
            lines.append(
                f"- **{name}** — green again at [this run]({row.get('run_url', '')}) "
                f"after {after} consecutive failure(s)."
            )

    lines.extend(
        [
            "",
            "---",
            "",
            "Automation records recovery here but never resolves this row. "
            "Close it by hand once the underlying job is genuinely healthy.",
            "",
            STATE_BEGIN,
            "```json",
            json.dumps(
                {"version": STATE_VERSION, "workflows": workflows},
                indent=2,
                sort_keys=True,
                ensure_ascii=False,
            ),
            "```",
            STATE_END,
            "",
        ]
    )
    return "\n".join(lines)


def decide(existing, workflows, event):
    """Choose the upsert action. Never returns a close."""
    if existing is None:
        return CREATE if failing(workflows) else NONE
    if event["conclusion"] == "failure":
        return UPDATE
    # Success: only worth a write when it actually flipped a row green.
    row = workflows.get(event["workflow"])
    if isinstance(row, dict) and row.get("status") == RECOVERED:
        return UPDATE
    return NONE


def build(issues, event):
    """Full pipeline: pick the issue, fold the event, render, decide."""
    existing = select_issue(issues)
    workflows = parse_state(existing.get("body")) if existing else {}
    workflows = apply_event(dict(workflows), event)
    return {
        "decision": decide(existing, workflows, event),
        "issue_number": existing.get("number") if existing else None,
        "body": render_body(workflows),
        "title": TITLE,
    }


def _read_json(path, default):
    if not path:
        return default
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return default


def _read_text(path):
    if not path:
        return ""
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return ""


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issues", help="JSON array from `gh issue list --json`")
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--conclusion", required=True)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--at", required=True)
    parser.add_argument("--log", help="failure log excerpt; best effort")
    parser.add_argument("--body-out", required=True)
    parser.add_argument("--output", help="GITHUB_OUTPUT file to append to")
    args = parser.parse_args(argv)

    event = {
        "workflow": args.workflow,
        "conclusion": args.conclusion,
        "run_url": args.run_url,
        "at": args.at,
        "error": _read_text(args.log),
    }
    try:
        result = build(_read_json(args.issues, []), event)
    except EscalationError as exc:
        print(f"escalation: {exc}", file=sys.stderr)
        return 1

    with open(args.body_out, "w", encoding="utf-8") as handle:
        handle.write(result["body"])

    if args.output:
        with open(args.output, "a", encoding="utf-8") as handle:
            handle.write(f"decision={result['decision']}\n")
            handle.write(f"issue_number={result['issue_number'] or ''}\n")
    print(f"escalation: decision={result['decision']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
