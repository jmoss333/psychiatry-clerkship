#!/usr/bin/env python3
"""What is waiting on the author, ranked, measured, and impossible to leave stale.

The mirror of bin/what_can_i_do_today.py. That one answers "what can an unattended
agent do here"; this one answers the question nothing answered: **what can only Josh
do**. Attestation, a rights decision, a merge — none of it is delegable, and until
now it lived scattered across memory files and handoff notes.

Same three contracts as the queue, for the same reasons:

  a row that reaches zero RETIRES itself, because nobody prunes a checklist;

  a measurement that FAILS reports `unknown`, never zero -- zero means done and
  would silently retire real work;

  a row's predicate must be satisfiable ONLY by the human act. This is the trap the
  queue learned the hard way: "isbn-verify" was measured by whether a line carried
  an ISBN-13, so the moment a DIFFERENT task wrote them it reported 0 of 51 and
  retired, having confirmed nothing. Here the same trap would read "the console
  ran" as "the page was re-attested"; each row below is measured on the record the
  human act writes, never on a script having run.

The Interview Room red-team signature was a row here until 2026-09-27.
DECISION: sp-redteam-signoff-retired -- the live checklist is optional, so it is no
longer owner work, and it must not come back as a row.

Report-only. Exits 0 always. Not a gate, not in CI, not in verify.sh -- a report that
fails a push is a report nobody keeps.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHIPPED = ROOT / "13_Faculty_Resources/_automation/site_build/shipped_pages.json"
REVIEWED = ROOT / "13_Faculty_Resources/reviewed.json"
TOPIC_META = ROOT / "topic_meta.json"
RIGHTS = ROOT / "instrument_rights.json"
PACK = ROOT / "_prototypes/sp-interview/sp-interview.pack.json"
PHARMACY = ROOT / "pharmacy.json"
PHARMACY_TOOLS = ROOT / "13_Faculty_Resources" / "_automation" / "pharmacy"
# The weekly label check runs every 7 days; one missed run is tolerated, two are not.
LABEL_DRIFT_MAX_AGE_DAYS = 14

sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from attestation_hash import ledger_hash_report  # noqa: E402

UNKNOWN = "unknown"

# How many items a row's detail line names before it says "and N more".
NAMED_LIMIT = 8


# ------------------------------------------------------------------ measurements
# Each returns (remaining, total). Raising is fine -- the caller reports `unknown`.

def _hash_report():
    """Every reviewed row classified against today's tree.

    The three inputs are read as data and the classification is attestation_hash's,
    never re-derived here.
    """
    shipped = json.loads(SHIPPED.read_text(encoding="utf-8"))
    ledger = json.loads(REVIEWED.read_text(encoding="utf-8"))
    topic_meta = json.loads(TOPIC_META.read_text(encoding="utf-8"))
    return ledger_hash_report(ROOT, ledger, shipped, topic_meta)


def stale_attestations():
    """Reviewed slugs whose inputs no longer hash to the recorded contentHash.

    A drifted row is the author's work by construction: the console is the only writer
    of a hash, and re-attesting is the human act.
    """
    return sorted(_hash_report()["stale"])


def measure_attestation():
    """Shipped pages with nobody's name against them.

    Reads the DERIVED listing (ADR-002), never the producers. Only the author can
    move this: #645 had to revert 23 attestations an agent signed, and
    check_attestation_authorship.py now gates the signature.

    A reviewed row whose text has since changed is NOT settled. Before contentHash
    existed the row stayed `reviewed` through any rewrite, which is precisely how
    #640/#672 rewrote attested pages and left every badge reading green.
    """
    slugs = {p["slug"] for p in json.loads(SHIPPED.read_text(encoding="utf-8"))["pages"]}
    reviewed = json.loads(REVIEWED.read_text(encoding="utf-8"))
    settled = {slug for slug, row in reviewed.items()
               if (row or {}).get("status") not in (None, "pending")}
    settled -= set(stale_attestations())
    return len(slugs - settled), len(slugs)


def measure_reattestation():
    """Attestations bound to text the repository no longer contains.

    The total is every reviewed row this can actually check -- bound plus drifted --
    not the whole ledger: a row nothing ships, or one whose source is missing, is a
    different problem and validate_attestation_consistency.py fails on it.
    """
    report = _hash_report()
    return len(report["stale"]), len(report["bound"]) + len(report["stale"])


def describe_reattestation():
    """The drifted pages, named. A count alone cannot be acted on.

    Capped at NAMED_LIMIT: today's backlog is 94 slugs, and a paragraph-long line is a
    line nobody reads. The full list is `python3 bin/check_attestation_hashes.py`.
    """
    stale = stale_attestations()
    noun = "page" if len(stale) == 1 else "pages"
    rest = len(stale) - NAMED_LIMIT
    named = ", ".join(stale[:NAMED_LIMIT])
    if rest > 0:
        named += " … and %d more" % rest
    return "Re-attest %d %s whose inputs changed since review: %s" % (
        len(stale), noun, named)


def _pack_cases_not_reviewed():
    pack = json.loads(PACK.read_text(encoding="utf-8"))
    cases = pack.get("cases")
    if not isinstance(cases, list):
        raise ValueError("pack.cases is not a list")
    # Literal `reviewed` only. The tool (sp-interview.html isCaseReviewed), the proxy
    # (sp-governance.mjs reviewedCase(), which sp.mjs, sp-voice.mjs and sp-realtime.mjs resolve
    # every case through; it also wants a reviewer and a review date not in the future, which
    # this row deliberately does not mirror -- a reviewed case with a bad date is a data error,
    # not an unread case) and the gate-integrity runner (bin/redteam-offline.mjs) select a case
    # on exactly that spelling; the attestation validator also lets `attested` into a reviewed
    # pack, but no surface offers such a case and the runner refuses it (FAIL PACK). Counting `attested`
    # as done retired this row over a case learners could not select (Codex P2 on #855).
    not_reviewed = [
        str(c.get("id") or "?") for c in cases
        if (c.get("facultyReview") or {}).get("status") != "reviewed"
    ]
    return not_reviewed, len(cases)


def measure_pack_cases():
    """Interview Room cases that are in the pack but not yet reviewed.

    DECISION: pack-case-review-is-registration (amended 2026-09-27, #844) -- a case may sit
    in the reviewed pack as
    `pending` ahead of the owner's read. It is unselectable, but its text ships in the
    built pack, and once the console re-signs the drifted sp-interview.html row nothing else
    names it. Only the owner's read flips it, so it is owner work until the flip lands, and
    the row retires itself at zero. "Not reviewed" is any status but the literal `reviewed`
    every selecting surface filters on -- `pending`, `attested`, a typo or a missing block.
    """
    not_reviewed, total = _pack_cases_not_reviewed()
    return len(not_reviewed), total


def describe_pack_cases():
    not_reviewed, _ = _pack_cases_not_reviewed()
    named = ", ".join(not_reviewed[:NAMED_LIMIT])
    if len(not_reviewed) > NAMED_LIMIT:
        named += " and %d more" % (len(not_reviewed) - NAMED_LIMIT)
    return "Read and flip to reviewed: %s" % named


def measure_instrument_decisions():
    """Instruments still published under a provisional rights decision.

    An instrument is settled only once its status is recorded in the audit's decision
    table. `provisional` means the recorded disposition is still awaiting an author
    decision; it does not imply an interim waiver. COWS anchors retired under
    cows-anchors-retired (2026-09-10); PHQ-9/GAD-7 is the remaining provisional entry.
    """
    instruments = json.loads(RIGHTS.read_text(encoding="utf-8"))["instruments"]
    provisional = [i for i in instruments if i.get("status") == "provisional"]
    return len(provisional), len(instruments)


def _today():
    import datetime as dt
    stamp = os.environ.get("CLERKSHIP_TODAY", "")
    try:
        return dt.date.fromisoformat(stamp)
    except ValueError:
        return dt.date.today()


def _label_drift_owed():
    """(owed drifts, the cards it can be measured against) -- from check_label_drift.py --record.

    The predicate is the human act and nothing else. A drift is owed while the card was
    reviewed when the drift was observed (cardReviewedOn in the ledger) and its
    facultyReview.lastReviewed is still BEFORE the day the drift was observed -- whatever its
    status is now, so demoting the card to pending does not retire it.
    Re-running the check, re-verifying the receipt, or re-pinning the label never retires
    one: the ledger is append-only and keyed by (agent, new version), so a later clean run
    cannot erase it -- only your review, dated on or after the observation, can. A missing
    ledger, or one whose last FULL run is older than LABEL_DRIFT_MAX_AGE_DAYS, is a failed
    measurement (unknown), never zero: "no drift" from a check nobody ran is not no drift.
    """
    import datetime as dt
    sys.path.insert(0, str(PHARMACY_TOOLS))
    import check_label_drift  # noqa: E402  (one definition of where the ledger lives)
    path = check_label_drift.ledger_path()
    if not path.is_file():
        raise FileNotFoundError("never recorded here: run check_label_drift.py --record "
                                "(ledger %s)" % path)
    ledger = json.loads(path.read_text(encoding="utf-8"))
    last = ledger.get("lastChecked")
    if not last:
        raise ValueError("label drift has never been checked over every pinned label")
    age = (_today() - dt.date.fromisoformat(last)).days
    if age > LABEL_DRIFT_MAX_AGE_DAYS:
        raise ValueError("label drift last checked %s (%d days ago, limit %d)"
                         % (last, age, LABEL_DRIFT_MAX_AGE_DAYS))
    records = {r["id"]: r for r in json.loads(PHARMACY.read_text(encoding="utf-8"))["records"]}
    reviewed = sorted(rid for rid, r in records.items()
                      if (r.get("facultyReview") or {}).get("status") == "reviewed")
    owed = {}
    for drift in ledger.get("drifts", []):
        agent = drift["agent"]
        if agent not in records:
            continue                          # a card that no longer exists has nothing to review
        # Was the card reviewed WHEN the drift was observed? The ledger records it, so a later
        # demotion to pending cannot hide the drift (Codex P1 on #955). Entries written before
        # that field existed fall back to the card's status now.
        was_reviewed = (drift["cardReviewedOn"] is not None) if "cardReviewedOn" in drift \
            else agent in reviewed
        if not was_reviewed:
            continue
        signed = (records[agent].get("facultyReview") or {}).get("lastReviewed") or ""
        if signed < drift["observedOn"]:
            owed[agent] = drift              # the newest observation per card wins
    return [owed[a] for a in sorted(owed)], sorted(set(reviewed) | set(owed))


def measure_label_drift():
    """Reviewed pharmacy cards whose DailyMed label changed after the review."""
    owed, reviewed = _label_drift_owed()
    return len(owed), len(reviewed)


def describe_label_drift():
    owed, _ = _label_drift_owed()
    named = ["%s (label v%s, %s: %s)" % (d["agent"], d["toVersion"], d["toDate"],
                                         ", ".join(d.get("fields") or d.get("sections") or ["quotes"]))
             for d in owed[:NAMED_LIMIT]]
    text = "; ".join(named)
    if len(owed) > NAMED_LIMIT:
        text += " … and %d more" % (len(owed) - NAMED_LIMIT)
    return "Re-review against the new label: %s" % text


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
        "unit": "shipped pages with no faculty review of their current text",
        "why": "These are live in front of learners with nobody's name against what they "
               "say TODAY -- never reviewed, or reviewed and since rewritten. An agent "
               "cannot do this and must not: #645 reverted 23 attestations a bot signed, "
               "and the authorship gate now refuses them. The `re-attest` row is the "
               "second group on its own.",
        "do": "open the faculty console and work the queue",
    },
    {
        "key": "re-attest",
        "title": "Re-attest the pages whose text changed after you signed them",
        "needs": None,
        "measure": measure_reattestation,
        "detail": describe_reattestation,
        "unit": "attestations bound to text the repository no longer contains",
        "why": "Until 2026-09 a reviewed row named a person, a date and a risk level and "
               "never the text, so #640/#672 could rewrite attested pages and every badge "
               "went on reading green. Each row now carries the digest of what was "
               "reviewed; these no longer match. Only you can re-attest, and an agent "
               "must not: check_attestation_authorship.py refuses the signature.",
        "do": "open the faculty console and re-attest each; "
              "python3 bin/check_attestation_hashes.py --explain <slug> names the inputs",
    },
    {
        "key": "pack-cases",
        "title": "Read the Interview Room cases that are in the pack but not yet reviewed",
        "needs": None,
        "measure": measure_pack_cases,
        "detail": describe_pack_cases,
        "unit": "pack cases learners cannot select yet",
        "why": "A case may land in the reviewed pack as `pending` ahead of your read "
               "(decision pack-case-review-is-registration, amended 2026-09-27). It is "
               "unselectable, but its text ships "
               "in the built pack, and once the console re-signs the drifted sp-interview.html "
               "row nothing else names it. Only your read flips it to reviewed -- the literal "
               "spelling the tool, the proxy and the gate-integrity runner select on; `attested` "
               "passes the validator but no surface offers it, so it counts here too.",
        "do": "read the case's lines, then a content PR sets its facultyReview.status to "
              "reviewed with the read recorded on the PR; the console re-attests the drifted row",
    },
    {
        "key": "label-drift",
        "title": "Re-review the pharmacy cards whose label changed after you signed them",
        "needs": None,
        "measure": measure_label_drift,
        "detail": describe_label_drift,
        "unit": "reviewed pharmacy cards whose DailyMed label changed after your review",
        "why": "A reviewed card is bound to the label it was checked against (receipt set id "
               "and date, AC2), and nothing noticed when the manufacturer published a new "
               "version: the card kept matching its receipt while the label said something "
               "else (the buprenorphine draft missed a 2024 FDA change exactly this way). The "
               "weekly check_label_drift.py --record run names the changed sections and the "
               "card fields that draw on them. Only your review retires a row -- re-running "
               "the check or re-pinning the label does not.",
        "do": "check_label_drift.py --only <id> names the sections; update the card, "
              "verify_pharmacy_labels.py --only <id>, review it, then check_label_drift.py "
              "--pin --only <id>",
    },
    {
        "key": "instrument-rights",
        "title": "Settle the instruments still published provisionally",
        "needs": None,
        "measure": measure_instrument_decisions,
        "unit": "instruments with a provisional rights disposition",
        "why": "A provisional status awaits the author's recorded disposition. Official "
               "permission evidence can be verified without claiming that a final rights "
               "decision or faculty review happened. A provisional entry is not an "
               "interim waiver; retired instruments are not counted here.",
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


def describe(row):
    """A waiting row's specific items, or "" when it names none / cannot name them."""
    describer = row.get("detail")
    if not callable(describer):
        return ""
    try:
        return describer()
    except Exception:                             # noqa: BLE001 - a detail is not a gate
        return ""


def render(rows, show_done):
    out = []
    waiting = [r for r in rows if r["status"] == "waiting"]
    unknown = [r for r in rows if r["status"] == UNKNOWN]
    if waiting:
        out.append("\n── WAITING ON YOU ──")
        for r in sorted(waiting, key=lambda r: -r["remaining"]):
            out.append("  %-18s %s/%s %s" % (r["key"], r["remaining"], r["total"], r["unit"]))
            if r.get("detail"):
                out.append("        %s" % r["detail"])
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
        rows.append({**{k: v for k, v in row.items() if k not in ("measure", "detail")},
                     "status": status, "remaining": remaining, "total": total, "note": note,
                     # A row may name its specific items. Computed only when the row is
                     # waiting, and from the SAME inputs the measurement just read, so a
                     # detail cannot contradict the count it sits under.
                     "detail": describe(row) if status == "waiting" else ""})

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
