#!/usr/bin/env python3
"""What is waiting on the author, ranked, measured, and impossible to leave stale.

The mirror of bin/what_can_i_do_today.py. That one answers "what can an unattended
agent do here"; this one answers the question nothing answered: **what can only Josh
do**. Attestation, a red-team signature, a rights decision, a merge — none of it is
delegable, and until now it lived scattered across memory files and handoff notes,
which is how the WP-5m red-team receipt survived four sessions without being written.

Same three contracts as the queue, for the same reasons:

  a row that reaches zero RETIRES itself, because nobody prunes a checklist;

  a measurement that FAILS reports `unknown`, never zero -- zero means done and
  would silently retire real work;

  a row's predicate must be satisfiable ONLY by the human act. This is the trap the
  queue learned the hard way: "isbn-verify" was measured by whether a line carried
  an ISBN-13, so the moment a DIFFERENT task wrote them it reported 0 of 51 and
  retired, having confirmed nothing. Here the same trap would read "the red-team
  script ran" as "the red team ran". It does not: the receipt carries the sha256 of
  the pack bytes it was signed against, so a receipt that does not match today's
  pack is not a receipt.

Report-only. Exits 0 always. Not a gate, not in CI, not in verify.sh -- a report that
fails a push is a report nobody keeps.
"""
import argparse
import json
import os
import subprocess
import sys
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHIPPED = ROOT / "13_Faculty_Resources/_automation/site_build/shipped_pages.json"
REVIEWED = ROOT / "13_Faculty_Resources/reviewed.json"
RIGHTS = ROOT / "instrument_rights.json"
PACK = ROOT / "_prototypes/sp-interview/sp-interview.pack.json"
RECEIPT = ROOT / "13_Faculty_Resources/_automation/maintenance/receipts/sp-red-team.json"

UNKNOWN = "unknown"


# ------------------------------------------------------------------ measurements
# Each returns (remaining, total). Raising is fine -- the caller reports `unknown`.

def measure_attestation():
    """Shipped pages with nobody's name against them.

    Reads the DERIVED listing (ADR-002), never the producers. Only the author can
    move this: #645 had to revert 23 attestations an agent signed, and
    check_attestation_authorship.py now gates the signature.
    """
    slugs = {p["slug"] for p in json.loads(SHIPPED.read_text(encoding="utf-8"))["pages"]}
    reviewed = json.loads(REVIEWED.read_text(encoding="utf-8"))
    settled = {slug for slug, row in reviewed.items()
               if (row or {}).get("status") not in (None, "pending")}
    return len(slugs - settled), len(slugs)


def measure_red_team():
    """Is there a red-team receipt for the pack that is actually shipping?

    Not "did a script run". record_red_team.py stores packSha256 from the canonical
    pack bytes, so a receipt signed against an older pack does not answer for this
    one. Missing receipt and stale receipt are the same answer: still owed.
    """
    pack_sha = sha256(PACK.read_bytes()).hexdigest()
    if not RECEIPT.exists():
        return 1, 1
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    signed = str(receipt.get("signedBy") or "").strip()
    matches = receipt.get("packSha256") == pack_sha and receipt.get("state") == "passed"
    return (0 if (matches and signed) else 1), 1


def measure_instrument_decisions():
    """Instruments still published under a provisional rights decision.

    An instrument is settled only once its status is recorded in the audit's decision
    table. `provisional` is the COWS shape: permission real, scope wrong, published
    under a recorded interim waiver. An agent must never narrow or lift that.
    """
    instruments = json.loads(RIGHTS.read_text(encoding="utf-8"))["instruments"]
    provisional = [i for i in instruments if i.get("status") == "provisional"]
    return len(provisional), len(instruments)


def _gh_json(args):
    out = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError((out.stderr or "gh failed").strip().splitlines()[0])
    return json.loads(out.stdout or "null")


def measure_merge_decisions():
    """Open pull requests that are green and waiting on a yes.

    Not drafts (still being written) and not conflicting (someone has work to do
    first) -- only the ones where the sole remaining step is the author's call.
    """
    rows = _gh_json(["pr", "list", "--state", "open", "--limit", "60",
                     "--json", "number,isDraft,mergeStateStatus"]) or []
    waiting = [r for r in rows
               if not r["isDraft"] and r.get("mergeStateStatus") == "CLEAN"]
    return len(waiting), len(rows)


def measure_stale_review_issues():
    """Issues carrying a P0/P1 that nobody has touched in three weeks.

    Ranked here rather than in the agent queue because triage is a judgement about
    clinical priority, and an unattended agent closing a P0 is the failure mode.
    """
    rows = _gh_json(["issue", "list", "--state", "open", "--limit", "100",
                     "--json", "number,updatedAt,labels"]) or []
    import datetime as dt
    now = dt.datetime.now(dt.timezone.utc)
    def idle_days(row):
        stamp = dt.datetime.fromisoformat(row["updatedAt"].replace("Z", "+00:00"))
        return (now - stamp).days
    urgent = [r for r in rows
              if any(l["name"] in ("P0", "P1", "priority:P1") for l in r["labels"])]
    return len([r for r in urgent if idle_days(r) >= 21]), len(urgent)


ROWS = [
    {
        "key": "attestation",
        "title": "Put your name to the pages that ship without it",
        "needs": None,
        "measure": measure_attestation,
        "unit": "shipped pages with no faculty review recorded",
        "why": "These are live in front of learners with nobody's name against them. "
               "An agent cannot do this and must not: #645 reverted 23 attestations a "
               "bot signed, and the authorship gate now refuses them.",
        "do": "open the faculty console and work the queue",
    },
    {
        "key": "red-team",
        "title": "Sign the SP red-team receipt for the shipping pack",
        "needs": None,
        "measure": measure_red_team,
        "unit": "receipt missing or signed against a different pack",
        "why": "sp-proxy/REDTEAM_CHECKLIST.md is run against the LIVE deploy and needs "
               "the passcode, so only you can run it. No receipt has ever been written. "
               "Measured by packSha256, not by whether the recorder script ran -- a "
               "receipt for an older pack does not answer for this one.",
        "do": "run sp-proxy/REDTEAM_CHECKLIST.md, then "
              "python3 13_Faculty_Resources/_automation/maintenance/record_red_team.py "
              "--state passed --signed-by 'Joshua Moss, MD'",
    },
    {
        "key": "instrument-rights",
        "title": "Settle the instruments still published provisionally",
        "needs": None,
        "measure": measure_instrument_decisions,
        "unit": "instruments on a recorded interim waiver",
        "why": "Scope is a governance decision, not an agent decision. COWS is published "
               "under an interim waiver pending the Taylor & Francis letter, and that "
               "waiver is the one thing still blocking Wave 4. An agent may not narrow "
               "or lift it.",
        "do": "record the outcome in the audit decision table "
              "(docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md)",
    },
    {
        "key": "merge-decisions",
        "title": "Say yes or no to the green pull requests",
        "needs": "gh",
        "measure": measure_merge_decisions,
        "unit": "open PRs that are green and waiting on your call",
        "why": "Drafts and conflicting branches are somebody's work in progress. These "
               "are finished, passing, and the only remaining step is your decision.",
        "do": "gh pr list --state open  # then gh pr merge <n> --squash",
    },
    {
        "key": "stale-priorities",
        "title": "Triage the P0/P1 issues nobody has touched in three weeks",
        "needs": "gh",
        "measure": measure_stale_review_issues,
        "unit": "P0/P1 issues idle 21+ days",
        "why": "Deciding what a clinical priority actually is cannot be delegated, and a "
               "real P0 losing itself among stale ones is how the signal dies.",
        "do": "gh issue list --state open --label P0 --label P1",
    },
]


def evaluate(row):
    try:
        remaining, total = row["measure"]()
    except Exception as exc:                      # noqa: BLE001 - unknown, never zero
        return UNKNOWN, None, None, str(exc).strip()[:120]
    if remaining == 0:
        return "done", remaining, total, ""
    return "waiting", remaining, total, ""


def render(rows, show_done):
    out = []
    waiting = [r for r in rows if r["status"] == "waiting"]
    unknown = [r for r in rows if r["status"] == UNKNOWN]
    if waiting:
        out.append("\n── WAITING ON YOU ──")
        for r in sorted(waiting, key=lambda r: -r["remaining"]):
            out.append("  %-18s %s/%s %s" % (r["key"], r["remaining"], r["total"], r["unit"]))
            out.append("        → %s" % r["do"])
    if unknown:
        out.append("\n── COULD NOT MEASURE ──")
        for r in unknown:
            out.append("  %-18s unknown — %s" % (r["key"], r["note"]))
            out.append("        (unknown is NOT zero: this row is not retired)")
    if show_done:
        for r in rows:
            if r["status"] == "done":
                out.append("  %-18s clear" % r["key"])
    if not waiting and not unknown:
        out.append("\nNothing is waiting on you that this can see.")
    else:
        out.append("\n%d item(s) need you. Why one of them: --why <key>" % len(waiting))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--why", help="explain one row")
    ap.add_argument("--all", action="store_true", help="include rows that are clear")
    ap.add_argument("--json", action="store_true", help="machine-readable")
    args = ap.parse_args(argv)

    rows = []
    for row in ROWS:
        status, remaining, total, note = evaluate(row)
        rows.append({**{k: v for k, v in row.items() if k != "measure"},
                     "status": status, "remaining": remaining, "total": total, "note": note})

    if args.json:
        print(json.dumps(rows, indent=2))
        return 0
    if args.why:
        match = next((r for r in rows if r["key"] == args.why), None)
        if not match:
            print("no such row: %r (have: %s)" % (args.why, ", ".join(r["key"] for r in rows)),
                  file=sys.stderr)
            return 0
        print("%s — %s\n" % (match["key"], match["title"]))
        print(match["why"])
        print("\n  status: %s" % match["status"])
        if match["status"] == "waiting":
            print("  %s of %s %s" % (match["remaining"], match["total"], match["unit"]))
        print("  do: %s" % match["do"])
        return 0

    print("what needs Josh — %s" % os.environ.get("CLERKSHIP_TODAY", "today"))
    print(render(rows, args.all))
    return 0


if __name__ == "__main__":
    sys.exit(main())
