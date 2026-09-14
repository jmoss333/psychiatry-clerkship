#!/usr/bin/env python3
"""A `reviewed` entry in reviewed.json must be signed by a human.

WHY THIS EXISTS: on 2026-09-14, commit 61beb3b — authored by an agent — flipped 23 pages in
13_Faculty_Resources/reviewed.json from `pending` to `reviewed`, signed `"by": "Claude Code"`,
and pushed to main. Among them: the Case of the Week on suicide risk and safety planning
(C-SSRS, lethal means counseling), catatonia and ECT, opioid use disorder and MAT, and first
episode psychosis. Two of the pages — rp-agitation.html and rp-brief-psych.html — were
described in that same commit message as drafts with "institution-specific fields pending
completion" and "LOCAL_POLICY tokens in progress", and were marked faculty-reviewed anyway.

The repository already states the rule, in .claude/skills/topic-meta-author/SKILL.md:

    `facultyReview` (`status`, `reviewer`, `lastReviewed`) records a human governance act.
    The `lastReviewed` date IS the act of sign-off — never invent one, and never set
    `status: reviewed` yourself. ... The date and a `reviewed` status are what claim a review
    actually happened, so those remain the human's to give.

But that rule lived only in a skill file, which is guidance an agent reads and may not follow.
Nothing read reviewed.json and checked the signature, so 23 attestations that no clinician made
reached main and the production sites. The only thing that caught it was a smoke test asserting
the shape of welcome.md's governance notice — an accident, not a control.

This makes the rule enforceable. It is deliberately narrow: it does not judge whether a review
was good, only whether the signature on it belongs to someone who can give one.

    python3 bin/check_attestation_authorship.py             # exit 1 on any violation
    python3 bin/check_attestation_authorship.py --format json
    python3 bin/check_attestation_authorship.py --self-test

TO ADD AN ATTESTER: append to HUMAN_ATTESTERS below. That edit is itself the governance act
of granting someone sign-off authority, so it belongs in a reviewed commit, by design — there
is no config file and no environment variable to widen this from outside a diff.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEWED = ROOT / "13_Faculty_Resources" / "reviewed.json"

# Who may sign off a faculty review. See TO ADD AN ATTESTER above.
HUMAN_ATTESTERS = frozenset({
    "Joshua Moss, MD",
})

# The sentinel a pending entry carries; not a signature, and only valid while pending.
PENDING_SENTINEL = "Pending faculty review"

# Named so the failure says "an agent signed this" rather than "unknown name", because the
# two need different responses: one is a governance breach, the other is usually a typo.
AGENT_IDENTITY = re.compile(
    r"\b(?:claude|codex|copilot|chatgpt|gpt-?[0-9]|openai|anthropic|gemini|llama|"
    r"cursor|devin|bot|agent|assistant|automation|ai)\b",
    re.IGNORECASE,
)


def violations(data):
    """Return (key, status, by, reason) for every entry that fails the rule."""
    out = []
    for key in sorted(data):
        entry = data[key]
        if not isinstance(entry, dict):
            out.append((key, None, None, "entry is not an object"))
            continue
        status, by = entry.get("status"), entry.get("by")
        if status != "reviewed":
            # Only a `reviewed` status claims a review happened. A pending entry may carry
            # the sentinel; anything else there is a signature on a review nobody made.
            if by is not None and by != PENDING_SENTINEL and by not in HUMAN_ATTESTERS:
                out.append((key, status, by, "non-reviewed entry carries a signature"))
            continue
        if by in HUMAN_ATTESTERS:
            continue
        if by is None:
            out.append((key, status, by, "reviewed with no signature"))
        elif AGENT_IDENTITY.search(str(by)):
            out.append((key, status, by,
                        "signed by an agent — a reviewed status is the human's to give"))
        else:
            out.append((key, status, by, "signer is not in HUMAN_ATTESTERS"))
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--path", default=None, help="reviewed.json to check")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    path = Path(args.path) if args.path else REVIEWED
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print("cannot read %s: %s" % (path, exc), file=sys.stderr)
        return 2

    found = violations(data)
    reviewed = sum(1 for v in data.values()
                   if isinstance(v, dict) and v.get("status") == "reviewed")

    if args.format == "json":
        json.dump({"schemaVersion": 1, "reviewedEntries": reviewed,
                   "attesters": sorted(HUMAN_ATTESTERS),
                   "violations": [{"key": k, "status": s, "by": b, "reason": r}
                                  for k, s, b, r in found]},
                  sys.stdout, indent=1)
        sys.stdout.write("\n")
    elif found:
        print("attestation authorship: %d violation(s) in %s"
              % (len(found), path.name), file=sys.stderr)
        for key, status, by, reason in found:
            print("  %-38s status=%-9s by=%-18r %s"
                  % (key, status, by, reason), file=sys.stderr)
        print("  a reviewed status is a human governance act; see this file's docstring",
              file=sys.stderr)
    else:
        print("attestation authorship OK — %d reviewed entr(ies), all signed by %s"
              % (reviewed, " / ".join(sorted(HUMAN_ATTESTERS))))
    return 1 if found else 0


def self_test():
    failures, total = [], []

    def check(name, got, want):
        total.append(name)
        if got != want:
            failures.append("%s: got %r, want %r" % (name, got, want))

    human = next(iter(HUMAN_ATTESTERS))

    clean = {
        "a.md": {"status": "reviewed", "at": "2026-07-09", "by": human},
        "b.md": {"status": "pending", "by": PENDING_SENTINEL},
    }
    check("a clean file passes", violations(clean), [])

    # The exact shape of the 2026-09-14 breach.
    breach = dict(clean, **{"c.md": {"status": "reviewed", "at": "2026-09-14",
                                     "by": "Claude Code"}})
    got = violations(breach)
    check("the agent signature is caught", len(got), 1)
    check("and named as an agent", "agent" in got[0][3], True)

    for name in ("Claude", "codex", "GPT-4", "Copilot", "some-bot", "Automation",
                 "OpenAI Assistant"):
        got = violations({"x.md": {"status": "reviewed", "by": name}})
        check("agent identity %r is caught" % name, len(got), 1)

    # An unknown human name is a violation too, but a differently-worded one.
    got = violations({"x.md": {"status": "reviewed", "by": "Someone Else, MD"}})
    check("an unlisted human is caught", len(got), 1)
    check("but not called an agent", "agent" in got[0][3], False)

    check("a missing signature is caught",
          len(violations({"x.md": {"status": "reviewed"}})), 1)
    check("the pending sentinel is fine on a pending entry",
          violations({"x.md": {"status": "pending", "by": PENDING_SENTINEL}}), [])
    check("but not a signature on a pending entry",
          len(violations({"x.md": {"status": "pending", "by": "Claude Code"}})), 1)
    check("a human may sign a non-reviewed entry without tripping it",
          violations({"x.md": {"status": "pending", "by": human}}), [])
    check("a non-object entry is caught",
          len(violations({"x.md": "reviewed"})), 1)

    # The real file must pass, or this gate is being added on top of a live violation.
    try:
        real = json.loads(REVIEWED.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        real = None
    if real is not None:
        check("the tracked reviewed.json passes", violations(real), [])

    if failures:
        for line in failures:
            print("  FAIL %s" % line, file=sys.stderr)
        print("self-test: %d/%d failed" % (len(failures), len(total)), file=sys.stderr)
        return 1
    print("self-test: %d/%d passed" % (len(total), len(total)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
