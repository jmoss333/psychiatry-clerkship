#!/usr/bin/env python3
"""Record a queue-runner branch that was pushed but never got a pull request.

Why this exists
---------------
The nightly runner pushes its branch and *then* asks GitHub to open the draft
pull request. Those two operations do not share a permission. `contents: write`
covers the push; opening a pull request is additionally gated by the repository
/organisation setting **"Allow GitHub Actions to create and approve pull
requests"**, which no workflow file can grant itself. When that setting is off,
`gh pr create` is refused with:

    pull request create failed: GraphQL: GitHub Actions is not permitted to
    create or approve pull requests (createPullRequest)

Before this module the refusal simply killed the step. The branch stayed on the
remote with the completed, verified work on it, and nothing anywhere said why it
had no pull request. Four consecutive scheduled runs failed that way
(2026-09-10 through 2026-09-13); two orphan branches survived it, one of which
needed its pull request opened by hand days later. The rolling escalation issue
did fire -- it reports *that* the workflow is red, which is true and not useful:
a reader cannot tell "the runner is broken" from "the work is done and waiting
for one click".

So the refusal is captured rather than merely fatal, and folded into one
marker-owned rolling issue naming the branch, the task, the verbatim error and
the remedy. Filing an issue works precisely because `issues: write` is an
ordinary workflow permission: it is not gated by the setting that just refused
the pull request, which is the whole reason this fallback can exist at all.

What it deliberately does NOT do
--------------------------------
It does not turn the run green. The workflow exists to deliver a reviewable
draft pull request; if there is no pull request, it did not do its job, and
reporting success over the half that worked is the exact "check reporting
success over a smaller set than it claims to check" failure that
`docs/SILENT_SHRINK_CHECKLIST.md` is a list of. The run stays red, the heartbeat
and the escalation deadman go on seeing the truth, and this issue carries the
detail neither of them can.

It never closes an issue, mirroring `escalation_issue.py`: automation records, a
person resolves. A row is settled by opening the branch's pull request or
deleting the branch -- neither of which an unattended runner may decide.

Classification is subtractive
-----------------------------
A recognised refusal gets a named remedy. Anything else is reported verbatim as
`unknown` rather than being dropped: an unrecognised failure is the case most
worth surfacing, so it must not be the case that falls through a table.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

MARKER = "<!-- automation:queue-branch-without-pull-request -->"
TITLE = "automation: queue branch pushed without a pull request"
STATE_BEGIN = "<!-- state:begin -->"
STATE_END = "<!-- state:end -->"
STATE_VERSION = 1
MAX_ERROR_CHARS = 300
MAX_BRANCHES = 64

CREATE = "create"
UPDATE = "update"

# `branch_name()` in bin/run_queue_task.py composes exactly this shape. Anything
# else means the branch did not come from the runner, and a value that reaches a
# rendered issue body and a compare URL is not somewhere to relax about input.
BRANCH = re.compile(r"^automation/queue-[a-z0-9][a-z0-9-]{0,63}-\d{4}-\d{2}-\d{2}$")
TASK_KEY = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$")

PR_CREATION_DISABLED = "actions-pr-creation-disabled"
UNKNOWN = "unknown"

# First match wins; no match is UNKNOWN. Adding a row here narrows what is
# reported as unknown -- it must never narrow what is reported at all.
REASONS = (
    (
        PR_CREATION_DISABLED,
        re.compile(
            r"not permitted to create or approve pull requests",
            re.IGNORECASE,
        ),
    ),
)

REMEDIES = {
    PR_CREATION_DISABLED: (
        "GitHub Actions is not allowed to open pull requests in this repository. "
        "A maintainer enables it at **Settings → Actions → General → Workflow "
        "permissions → Allow GitHub Actions to create and approve pull "
        "requests**. An organisation policy can force that box off, in which "
        "case it has to be changed at the organisation first. Until then every "
        "run that produces work will land here."
    ),
    UNKNOWN: (
        "The refusal is not one this module recognises. Read the verbatim error "
        "above and the linked run before assuming it is the permission setting; "
        "an unrecognised failure is reported rather than guessed at."
    ),
}


class FallbackError(RuntimeError):
    """Raised when the rolling issue or the runner's inputs cannot be trusted."""


def classify(stderr):
    """Return the reason code for a `gh pr create` failure. Never raises."""
    text = stderr if isinstance(stderr, str) else ""
    for reason, pattern in REASONS:
        if pattern.search(text):
            return reason
    return UNKNOWN


# `gh`'s stderr is echoed into an issue body, which on a public repository is world
# readable. Nothing observed has ever carried a credential, but "has not yet" is not a
# property of an error string, and the cost of being wrong once is a leaked token.
SECRET = re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})")


def clean_error(text):
    """First meaningful line of the captured stderr, single-line, bounded, redacted."""
    if not isinstance(text, str):
        return ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        line = re.sub(r"^\S+Z\s+", "", line)
        line = SECRET.sub("[redacted]", line)
        if not line:
            continue
        if len(line) > MAX_ERROR_CHARS:
            line = line[: MAX_ERROR_CHARS - 1] + "…"
        return line
    return ""


def has_ownership_marker(body):
    """True when ``body``'s first line is exactly this module's marker."""
    return isinstance(body, str) and body.splitlines()[:1] == [MARKER]


def select_issue(issues):
    """Return the single open issue owned by this module, or ``None``.

    Fails closed on an ambiguous match, mirroring ``escalation_issue.py``: two
    owned issues means something else is writing this marker, and picking one
    would silently split the record across both.
    """
    owned = [
        issue
        for issue in issues
        if isinstance(issue, dict) and has_ownership_marker(issue.get("body"))
    ]
    if len(owned) > 1:
        raise FallbackError("ambiguous queue branch issue marker")
    return owned[0] if owned else None


def parse_state(body):
    """Recover the machine-readable branch table from an issue body."""
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
    branches = state.get("branches")
    return branches if isinstance(branches, dict) else {}


def apply_event(branches, event):
    """Fold one refused pull-request creation into the tracked branch table."""
    branch = event["branch"]
    if BRANCH.fullmatch(branch) is None:
        raise FallbackError("branch is not a queue-runner branch")
    if TASK_KEY.fullmatch(event["task"]) is None:
        raise FallbackError("task key is not a safe identifier")
    if len(branches) >= MAX_BRANCHES and branch not in branches:
        raise FallbackError("too many stranded branches to record safely")

    previous = branches.get(branch) if isinstance(branches.get(branch), dict) else {}
    seen = previous.get("occurrences", 0)
    branches[branch] = {
        "task": event["task"],
        "occurrences": seen + 1 if isinstance(seen, int) and seen > 0 else 1,
        "first_seen_at": previous.get("first_seen_at") or event["at"],
        "last_seen_at": event["at"],
        "run_url": event["run_url"],
        "reason": classify(event.get("error", "")),
        "error": clean_error(event.get("error", "")),
    }
    return branches


def _cell(value):
    return str(value).replace("|", "\\|")


def compare_url(repository, base, branch):
    """A pre-filled pull-request form for the branch.

    The remedy a reader wants is one click, not a git incantation: this URL is
    the pull request the runner was refused, ready for a person to submit.
    """
    if REPOSITORY.fullmatch(repository or "") is None:
        return ""
    if BRANCH.fullmatch(branch or "") is None:
        return ""
    if not re.fullmatch(r"[A-Za-z0-9._/-]{1,100}", base or ""):
        return ""
    return "https://github.com/%s/compare/%s...%s?expand=1" % (repository, base, branch)


def render_body(branches, repository, base):
    """Render the full issue body, marker first, state block last."""
    rows = {
        name: row
        for name, row in sorted(branches.items())
        if isinstance(row, dict)
    }
    lines = [MARKER, "", "# Queue branches pushed without a pull request", ""]
    if rows:
        lines.append(
            "%d branch(es) carry completed, verified queue-runner work that has no "
            "pull request. The commits are safe on the remote; only the pull "
            "request was refused." % len(rows)
        )
        lines.extend(
            [
                "",
                "| Branch | Task | Times | Latest run | Refusal |",
                "| --- | --- | --- | --- | --- |",
            ]
        )
        for name, row in rows.items():
            link = compare_url(repository, base, name)
            shown = "[`%s`](%s)" % (_cell(name), link) if link else "`%s`" % _cell(name)
            lines.append(
                "| %s | `%s` | %s | [run](%s) | %s |"
                % (
                    shown,
                    _cell(row.get("task", "unknown")),
                    _cell(row.get("occurrences", 1)),
                    _cell(row.get("run_url", "")),
                    _cell(row.get("error") or "—"),
                )
            )
        lines.extend(["", "## Why the pull request was refused", ""])
        for reason in sorted({row.get("reason", UNKNOWN) for row in rows.values()}):
            lines.append("- **%s** — %s" % (reason, REMEDIES.get(reason, REMEDIES[UNKNOWN])))
        lines.extend(
            [
                "",
                "## What to do with a row",
                "",
                "- Open its pull request (the branch link above is a pre-filled form), "
                "or delete the branch if the work is no longer wanted.",
                "- The run that produced it stays red on purpose. The workflow's job is "
                "to deliver a reviewable draft pull request; half of that is not a pass.",
            ]
        )
    else:
        lines.append("No queue-runner branch is currently waiting for a pull request.")

    lines.extend(
        [
            "",
            "---",
            "",
            "Automation records these rows but never resolves them. Close this issue "
            "by hand once every branch above has a pull request or is gone.",
            "",
            STATE_BEGIN,
            "```json",
            json.dumps(
                {"version": STATE_VERSION, "branches": branches},
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


def build(issues, event):
    """Full pipeline: pick the issue, fold the event, render, decide.

    There is no "nothing to do" decision. This module is only ever called
    because a branch was pushed and its pull request refused, and that is always
    worth a row -- an unrecognised refusal most of all.
    """
    existing = select_issue(issues)
    branches = parse_state(existing.get("body")) if existing else {}
    branches = apply_event(dict(branches), event)
    return {
        "decision": UPDATE if existing else CREATE,
        "issue_number": existing.get("number") if existing else None,
        "body": render_body(branches, event.get("repository", ""), event.get("base", "")),
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
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--issues", help="JSON array from `gh issue list --json`")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--task", required=True)
    parser.add_argument("--repository", default="", help="owner/name, for the compare link")
    parser.add_argument("--base", default="", help="default branch, for the compare link")
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--at", required=True)
    parser.add_argument("--error", help="captured `gh pr create` stderr")
    parser.add_argument("--body-out", required=True)
    parser.add_argument("--output", help="GITHUB_OUTPUT file to append to")
    args = parser.parse_args(argv)

    event = {
        "branch": args.branch,
        "task": args.task,
        "repository": args.repository,
        "base": args.base,
        "run_url": args.run_url,
        "at": args.at,
        "error": _read_text(args.error),
    }
    try:
        result = build(_read_json(args.issues, []), event)
    except FallbackError as exc:
        print("queue-pr-fallback: %s" % exc, file=sys.stderr)
        return 1

    with open(args.body_out, "w", encoding="utf-8") as handle:
        handle.write(result["body"])

    if args.output:
        with open(args.output, "a", encoding="utf-8") as handle:
            handle.write("decision=%s\n" % result["decision"])
            handle.write("issue_number=%s\n" % (result["issue_number"] or ""))
    print("queue-pr-fallback: decision=%s reason=%s"
          % (result["decision"], classify(event["error"])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
