"""One-line, enum-only summaries of a steward receipt, for the Actions log.

Why this exists
---------------
`sp_health_monitor.py` and `workflow_heartbeat.py` both end with

    return 0 if receipt["gate"] == "ready" else 2

and print nothing. The exit code is therefore the *entire* public signal. A red
step in the Actions log reads

    ##[error]Process completed with exit code 2

which is true of a dozen different causes: for the SP monitor alone, a non-200,
a wrong content-type, a malformed body, a contract violation, an actor timeout,
and the rotation budget cap all collapse into that one line. Finding out which
means downloading the run's JSON receipt artifact — and on 2026-09-03 the
escalation issue for a failing Interview Room monitor could say no more than
"exit code 2", because that is genuinely all the log contained.

The receipt already holds the answer. This module puts one line of it where a
human (or the escalation issue's "first error" row) will actually see it.

Safety
------
Steward receipts are built from network responses. `sp_health_monitor` is
explicit that it normalizes "without retaining untrusted values", and the
heartbeat's workflow names come from its own `EXPECTATIONS` table — so the
fields summarized here are repo-controlled enums, not remote text. `_safe()`
enforces that anyway: anything that is not a short enum-shaped token is printed
as `?` rather than echoed. A log line is a place untrusted text must not reach,
and the guarantee should not depend on the caller having read the source.

Deliberately out of scope: `rotation_readiness.py`'s `return 10`. That is a
designed routing code its workflow branches on, not a failure, and it already
writes a human-readable passport alongside it.
"""

from __future__ import annotations

import re

# Enum-shaped: the states, gates and workflow filenames these receipts carry.
# Anything else is a value we did not expect and will not echo into a log.
SAFE_TOKEN = re.compile(r"[A-Za-z0-9._:-]{1,64}")

# The heartbeat marks a healthy run "success"; every other state (stale,
# missing, pending_first_run, ...) is worth naming. Listing the healthy value
# rather than the unhealthy ones means a new failure state shows up in the
# summary automatically instead of being silently omitted.
HEALTHY_ROW_STATE = "success"

# Cap the named rows so one bad morning cannot produce a 200-column log line.
MAX_ROWS = 4

# The gate value both callers treat as healthy.
READY_GATE = "ready"

# A blocked line must contain one of the words the escalation workflow greps for:
#   gh run view --log-failed | grep -aiE "error|Traceback|failed" | head -n 5
# and escalation_issue._clean_error takes the FIRST match. The runner appends its
# own "##[error]Process completed with exit code 2" at step end, so a summary
# without a matching word loses the race and the escalation issue keeps quoting
# the bare exit code — exactly the uninformative row this module exists to
# replace. "failed" is the honest word for a blocked gate, so saying it here
# costs nothing and needs no change to the pinned workflow.
FAILED_MARKER = "failed"


def _safe(value):
    """Return `value` only if it is an enum-shaped token, else a placeholder."""
    if not isinstance(value, str) or SAFE_TOKEN.fullmatch(value) is None:
        return "?"
    return value


def summarize(receipt, label):
    """Render one stderr line describing why a steward is about to exit.

    `label` names the steward (repo-controlled, e.g. "sp-health"). The line is
    intentionally greppable and stable: `<label>: gate=<gate> ...`.
    """
    safe_label = _safe(label)
    if not isinstance(receipt, dict):
        # Unreadable is a failure, and must be greppable as one.
        return f"{safe_label} {FAILED_MARKER}: receipt is unreadable"

    gate = _safe(receipt.get("gate"))
    lead = safe_label if gate == READY_GATE else f"{safe_label} {FAILED_MARKER}"
    parts = [f"{lead}: gate={gate}"]

    # Flat receipts (sp_health_monitor) carry the cause in `state`.
    if "state" in receipt:
        parts.append(f"state={_safe(receipt.get('state'))}")

    # Tabular receipts (workflow_heartbeat) carry one row per watched workflow.
    rows = receipt.get("workflows")
    if isinstance(rows, list):
        unhealthy = [
            f"{_safe(row.get('workflowFile'))}:{_safe(row.get('state'))}"
            for row in rows
            if isinstance(row, dict) and row.get("state") != HEALTHY_ROW_STATE
        ]
        if unhealthy:
            shown = ",".join(unhealthy[:MAX_ROWS])
            if len(unhealthy) > MAX_ROWS:
                shown += f",+{len(unhealthy) - MAX_ROWS} more"
            parts.append(f"unhealthy={shown}")
        else:
            parts.append("unhealthy=none")

    return " ".join(parts)


def report(receipt, label, *, stream):
    """Write `summarize(...)` to `stream`. Never raises: a summary must not be
    able to turn a steward's real exit code into a traceback."""
    try:
        print(summarize(receipt, label), file=stream)
    except Exception:  # pragma: no cover - defensive
        pass
