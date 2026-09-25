"""What a steward receipt says, and whether its steward should go red.

Two jobs, one module, because they answer the same question about the same
object: *what is this receipt actually claiming, and is any of it mine?*

Job one — say it out loud
-------------------------
`sp_health_monitor.py` and `workflow_heartbeat.py` both used to end with

    return 0 if receipt["gate"] == "ready" else 2

and print nothing. The exit code was therefore the *entire* public signal. A red
step in the Actions log reads

    ##[error]Process completed with exit code 2

which is true of a dozen different causes: for the SP monitor alone, a non-200,
a wrong content-type, a malformed body, a contract violation, an actor timeout,
and the rotation budget cap all collapse into that one line. Finding out which
means downloading the run's JSON receipt artifact — and on 2026-09-03 the
escalation issue for a failing Interview Room monitor could say no more than
"exit code 2", because that is genuinely all the log contained.

The receipt already holds the answer. `summarize`/`report` put one line of it
where a human (or the escalation issue's "first error" row) will actually see it.

Job two — decide whose failure it is
------------------------------------
`gate` records every reason a row is not clean. That is the right thing for a
receipt to store and the wrong thing for an exit code to follow, because some of
those reasons belong to a *different* watcher. The heartbeat is the case: a
workflow that fired exactly on schedule and then failed is real, but
`automation-failure-escalation.yml` already upserts a rolling issue for it. A
heartbeat that also goes red adds nothing and goes permanently red — on
2026-09-04 the canary recovered and the heartbeat stayed red for two surveillance
monitors the escalation had been tracking for weeks. Daily red for an
already-tracked failure is how a monitor becomes wallpaper.

`classify` is the fleet's answer. Each steward declares one frozenset —
`DELEGATED_STATES`, the states another watcher owns — and gets back
`(own, delegated)`. The exit code follows `own`; `delegated` goes in a
`deferral` line so a human still sees what the other watcher is carrying.
`DELEGATED_STATES = frozenset()` is a legible "everything here is mine", not an
omission.

The classification is deliberately *subtractive*: a row is this steward's unless
it is healthy, deferred (`DEFERRED_ROW_STATES`), or delegated. So a state nobody
has taught this module about goes red rather than silently passing — the same
direction `DEFERRED_ROW_STATES` already fails in, and the reason a steward
declares only what it hands off rather than enumerating what it keeps.

Safety
------
Steward receipts are built from network responses. `sp_health_monitor` is
explicit that it normalizes "without retaining untrusted values", and the
heartbeat's workflow names come from its own `EXPECTATIONS` table — so the
fields summarized here are repo-controlled enums, not remote text. `_safe()`
enforces that anyway: anything that is not a short enum-shaped token is printed
as `?` rather than echoed. A log line is a place untrusted text must not reach,
and the guarantee should not depend on the caller having read the source — which
is also why `deferral` renders through the same helpers instead of leaving each
steward to interpolate its own rows.

Deliberately out of scope: `rotation_readiness.py`'s `return 10`. That is a
designed routing code its workflow branches on, not a failure, and it already
writes a human-readable passport alongside it.
"""

from __future__ import annotations

import re

# Enum-shaped: the states, gates and workflow filenames these receipts carry.
# Anything else is a value we did not expect and will not echo into a log.
SAFE_TOKEN = re.compile(r"[A-Za-z0-9._:-]{1,64}")

# A deferral line carries one clause of repo-authored prose ("schedule is
# alive"), so it needs a looser shape than SAFE_TOKEN. Still bounded, still
# newline-free: a caller cannot smuggle a second log line through it.
SAFE_NOTE = re.compile(r"[A-Za-z0-9 ,.;:'()-]{1,120}")

# The heartbeat marks a healthy run "success"; every other state (stale,
# missing, pending_first_run, ...) is worth naming. Listing the healthy value
# rather than the unhealthy ones means a new failure state shows up in the
# summary automatically instead of being silently omitted.
HEALTHY_ROW_STATE = "success"

# Cap the named rows so one bad morning cannot produce a 200-column log line.
MAX_ROWS = 4

# States that mean "not fresh YET" rather than "wrong". The heartbeat does not
# block the gate on these, so they are named last and are the first thing the
# MAX_ROWS cap drops.
#
# Why the ranking exists: on 2026-09-03 the line read
#   unhealthy=ci.yml:pending_first_run,maintenance-governance-digest.yml:pending_first_run,
#             maintenance-production-canary.yml:failed,surveillance-citations.yml:failed,+1 more
# Rows are alphabetical, so two NON-blocking rows took half the cap and pushed a
# genuinely blocking row into "+1 more", where nobody could see it. The reader
# was left to guess which of the named rows actually stopped the gate.
#
# Note this list is deliberately the SMALL one. Anything not named here -- an
# unrecognised or newly added state included -- ranks as blocking and is shown
# first, so the module keeps failing toward telling you more, not less.
DEFERRED_ROW_STATES = frozenset({"pending_first_run", "armed_waiting"})

# The gate value both callers treat as healthy.
READY_GATE = "ready"

# The exit code every steward in this fleet uses for "something of mine is
# wrong". Named once so a reader does not have to infer that 2 (rather than 1)
# is a convention rather than an accident: `escalation_issue` quotes it, and
# `rotation_readiness` deliberately reserves 10 for routing.
BLOCKED_EXIT = 2

# Tabular receipts name themselves by their row key: workflow_heartbeat carries
# "workflows" keyed on a filename, stranded_prs carries "pullRequests" keyed on
# an int. Both list by exception, so once the key is known the scan is identical.
ROW_KEYS = (("workflows", "workflowFile"), ("pullRequests", "pullRequest"))

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


def _safe_row_id(value):
    """Render a row's identity. Workflow rows key on a filename; pull-request
    rows key on an integer number. An int cannot carry injected text, so it is
    rendered directly -- but only in the shape a PR number actually takes."""
    if isinstance(value, bool):
        return "?"
    if isinstance(value, int):
        return f"#{value}" if 0 < value < 1_000_000 else "?"
    return _safe(value)


def _rows(receipt):
    """Return a receipt's rows as `(row_id, state)` pairs, or None if untabular.

    None and `[]` are different answers and both are used: `[]` means "this is a
    tabular receipt and nothing is listed", which `summarize` renders as
    `unhealthy=none`, while None means "not tabular at all" and suppresses the
    field entirely. Non-dict rows are dropped rather than raising — a summary
    must never turn a steward's real exit code into a traceback.
    """
    for key, id_key in ROW_KEYS:
        value = receipt.get(key)
        if isinstance(value, list):
            return [
                (row.get(id_key), row.get("state"))
                for row in value
                if isinstance(row, dict)
            ]
    return None


def _is_deferred(state):
    # The isinstance guard is load-bearing: an unhashable value (a list, say)
    # would raise on frozenset membership, in the one module that must not raise.
    return isinstance(state, str) and state in DEFERRED_ROW_STATES


def render_rows(entries):
    """Render `(row_id, state)` pairs as a safe, capped, comma-joined list.

    A row with no id renders `?:<state>`, which is also what a flat receipt's
    single implicit row looks like — one rule, no sentinel.
    """
    rendered = [f"{_safe_row_id(row_id)}:{_safe(state)}" for row_id, state in entries]
    shown = ",".join(rendered[:MAX_ROWS])
    if len(rendered) > MAX_ROWS:
        shown += f",+{len(rendered) - MAX_ROWS} more"
    return shown


def _may_delegate(row_id, delegable):
    """Can this row be handed off at all? `None` means "every row can"."""
    if delegable is None:
        return True
    try:
        return row_id in delegable
    except TypeError:
        # An unhashable row id cannot be proven delegable, so it is not.
        return False


def classify(receipt, *, delegated=frozenset(), delegable=None):
    """Split a receipt's non-clean rows into `(own, delegated)`.

    `delegated` names the states another watcher owns; pass `frozenset()` to
    declare that everything here is this steward's. Both returned lists hold
    `(row_id, state)` pairs, in receipt order, ready for `render_rows`.

    `delegable` optionally restricts *which rows* may be handed off, by row id.
    A delegation is a claim about another watcher, and a steward may only defer
    what it can prove that watcher is holding: a row whose state is delegated
    but whose id is not in `delegable` stays in `own`. `None` — every row is
    delegable — is right only when the watcher covers this steward's whole
    subject, and is a claim worth a test either way.

    This exists because the first delegation shipped was partly false.
    `workflow_heartbeat` handed every `failed` row to
    automation-failure-escalation.yml, whose `workflow_run` list covers
    maintenance-* and surveillance-* and nothing else — so between #531 and this
    change a failed scheduled `ci.yml` run left the heartbeat green and the
    escalation silent. Nobody was watching the weekly release rehearsal.

    A row is **this steward's unless proven otherwise**: healthy, deferred and
    delegated states are subtracted, and whatever is left — including a state
    this module has never heard of — lands in `own`. That direction is the point.
    Enumerating the owned states instead would mean a state added to a steward
    later fell through both sets and exited zero, which is the silence these
    receipts exist to end.

    Flat receipts (sp_health_monitor) carry their whole verdict in `state`;
    tabular ones carry one row per watched thing. stranded_prs emits *both* — a
    row list normally, and a flat `state` when it could not look at all — so
    both are read rather than one being chosen.
    """
    if not isinstance(receipt, dict):
        return [], []
    entries = []
    if "state" in receipt:
        entries.append((None, receipt.get("state")))
    entries.extend(_rows(receipt) or [])

    own = []
    elsewhere = []
    for row_id, state in entries:
        if state == HEALTHY_ROW_STATE or _is_deferred(state):
            continue
        if (
            isinstance(state, str)
            and state in delegated
            and _may_delegate(row_id, delegable)
        ):
            elsewhere.append((row_id, state))
        else:
            own.append((row_id, state))
    return own, elsewhere


def deferral(label, entries, *, watcher, note=None):
    """One line naming blockers this steward deliberately does not fail on.

    Without it a deferral is indistinguishable from not noticing. The shape is
    uniform across the fleet so it stays greppable; `note` carries whatever the
    steward can say that the shared wording cannot ("schedule is alive").

    Returns "" for an empty list, so a caller can `if line: print(line)`.

    The rendered states may themselves read `…:failed`, which the escalation's
    grep matches — harmless, because a steward that only defers exits zero and
    the escalation greps a run's log only when its conclusion is `failure`. On a
    run that *is* failing, `summarize`'s line is printed first and wins the race.
    """
    if not entries:
        return ""
    prefix = f"{_safe(label)}:"
    if isinstance(note, str) and SAFE_NOTE.fullmatch(note) is not None:
        prefix = f"{prefix} {note};"
    return (
        f"{prefix} {len(entries)} blocked row(s) tracked by {_safe(watcher)}, "
        f"not by this gate ({render_rows(entries)})."
    )


def summarize(receipt, label, *, failed=None):
    """Render one stderr line describing why a steward is about to exit.

    `label` names the steward (repo-controlled, e.g. "sp-health"). The line is
    intentionally greppable and stable: `<label>: gate=<gate> ...`.

    `failed` overrides the verdict for a steward whose exit code is not simply
    `gate != "ready"`. The heartbeat is the case: a blocked gate there can mean
    either "a watched schedule stopped firing" (its own failure) or "a watched
    run fired on time and failed" (the escalation's, not its). Only the first
    exits non-zero, so only the first may lead with FAILED_MARKER, which is what
    makes the lead an honest summary of the exit code.

    Note the marker governs the LEAD only. A row's own state may still read
    `…:failed`, truthfully, on a line whose lead is clean — and that is safe:
    the escalation greps a run's log only when that run's conclusion is
    `failure` (see automation-failure-escalation.yml, "Capture the first error
    line"), so a green steward's log is never scanned at all.

    Defaults to the gate, which is right for every flat receipt.
    """
    safe_label = _safe(label)
    if not isinstance(receipt, dict):
        # Unreadable is a failure, and must be greppable as one.
        return f"{safe_label} {FAILED_MARKER}: receipt is unreadable"

    gate = _safe(receipt.get("gate"))
    is_failure = (gate != READY_GATE) if failed is None else bool(failed)
    lead = f"{safe_label} {FAILED_MARKER}" if is_failure else safe_label
    parts = [f"{lead}: gate={gate}"]

    # Flat receipts (sp_health_monitor) carry the cause in `state`.
    if "state" in receipt:
        parts.append(f"state={_safe(receipt.get('state'))}")

    # Tabular receipts (workflow_heartbeat, stranded_prs) carry one row per
    # watched thing and list by exception.
    rows = _rows(receipt)
    if rows is not None:
        blocking = []
        deferred = []
        for entry in rows:
            state = entry[1]
            if state == HEALTHY_ROW_STATE:
                continue
            (deferred if _is_deferred(state) else blocking).append(entry)
        # Blocking rows first, each group otherwise keeping the receipt's order.
        unhealthy = blocking + deferred
        parts.append(f"unhealthy={render_rows(unhealthy) if unhealthy else 'none'}")

    return " ".join(parts)


def report(receipt, label, *, stream, failed=None):
    """Write `summarize(...)` to `stream`. Never raises: a summary must not be
    able to turn a steward's real exit code into a traceback."""
    try:
        print(summarize(receipt, label, failed=failed), file=stream)
    except Exception:  # pragma: no cover - defensive
        pass
