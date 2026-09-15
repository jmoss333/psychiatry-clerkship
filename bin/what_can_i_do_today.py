#!/usr/bin/env python3
"""DEV-ONLY: rank the library work that is ACTUALLY POSSIBLE in this environment right now.

WHY: sessions in this repo keep choosing a task and only then discovering it was impossible.
Three did it in a row — the podcast/book link check, the production canary, and a handoff that
recorded "egress is blocked except web search" when in fact api.github.com answers 200. Each cost
about an hour. bin/probe_egress.py fixed half the problem by reporting which hosts are reachable;
this fixes the other half by saying which WORK that enables.

It joins two things that already ship:

  capability  python3 bin/probe_egress.py --json   which host classes are open/quota/blocked
  evidence    a cheap file-only measurement per task    how much of it is actually left

The second half is the point. A hard-coded checklist rots in a month, so every task here carries a
measurement, and a task whose remaining count reaches zero RETIRES ITSELF. Nobody has to remember
to delete the line — the repository is the source of truth about what is left to do.

The corollary matters as much: a measurement that FAILS reports `unknown`, never zero. Zero means
done and would silently retire real work, which is the one failure that would make this script
worse than no script.

    python3 bin/what_can_i_do_today.py           # ranked queue
    python3 bin/what_can_i_do_today.py --all     # include finished tasks
    python3 bin/what_can_i_do_today.py --json    # machine-readable
    python3 bin/what_can_i_do_today.py --why KEY # one task in full

Report-only. It exits 0 whatever it finds, runs no network of its own (probe_egress owns that, and
caches it), and changes nothing. Not a gate, not in CI, not in verify.sh — the same posture as
probe_egress.py and check_instrument_links.py.

Exit codes: 0 the report ran · 2 usage error.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / "bin" / "probe_egress.py"

# Capability classes, from probe_egress.py's own key strings. Joined verbatim.
READY, NEEDS_KEY, NEEDS_AUTH, BLOCKED, DONE, UNKNOWN = (
    "ready", "needs-key", "needs-auth", "blocked", "done", "unknown")

# probe status -> what it means for a task that depends on that host
STATUS_FROM_HOST = {
    "open": READY,
    "quota": NEEDS_KEY,
    "auth": NEEDS_AUTH,
    "blocked": BLOCKED,
    "slow": BLOCKED,
    "error": UNKNOWN,
}

RANK = {READY: 0, NEEDS_KEY: 1, NEEDS_AUTH: 2, BLOCKED: 3, UNKNOWN: 4, DONE: 5}

BOOKS = ROOT / "07_Evidence_and_Reading" / "Book_Summaries" / "ms3_book_library.md"
PODCAST = ROOT / "12_Media" / "psychiatry_psychotherapy_podcast_library.md"
COVERAGE = ROOT / "13_Faculty_Resources" / "_automation" / "library_coverage_scan.py"
AUTOMATION = ROOT / "13_Faculty_Resources" / "_automation"
SHIPPED = AUTOMATION / "site_build" / "shipped_pages.json"
REVIEWED = ROOT / "13_Faculty_Resources" / "reviewed.json"
RIGHTS = ROOT / "instrument_rights.json"
REGISTRY = ROOT / "evidence_registry.json"
BASELINES = AUTOMATION / "surveillance" / "history" / "baselines"
LAST_RUN = AUTOMATION / "surveillance" / "history" / "last_run.json"


# ---------------------------------------------------------------- measurements
# Each returns (remaining, total). Raising is fine — the caller reports `unknown`,
# which is deliberately NOT the same as zero.
#
# A measurement earns its place only if it can reach zero by someone doing the work.
# Two candidates were dropped for failing that test and the reasons are worth keeping:
#   · "topics with no book" counts keyword hits on the book page per topic, so it is a
#     category mismatch that no amount of curation drives to zero — a permanent 23-ish
#     number masquerading as a backlog.
#   · "unattributed claims" moves between 1, 34 and 42 depending on where you draw the
#     bibliography line, and renaming one heading retires items without touching a claim.
# A number nobody can drive to zero is a mood, not a queue.

# A route that is vendor-independent. Matched positively: a negative "not amazon.com"
# test would let an amzn.to shortlink or amazon.co.uk retire an entry falsely.
def measure_isbn_derivable(books=None):
    """Book entries the deriver would still change.

    `books` overrides the file, so a test can drive the real write/measure loop against a
    fixture instead of the tracked library. It is not decoration: the queue runner performs a
    task's `run` and then runs the whole node suite in that same checkout, so any test that
    assumed the tracked file was still un-derived broke the moment the runner did the work.
    The invariant worth pinning is "doing the work drives this to zero", which holds on any
    tree; "there is work left" does not.

    This imports bin/derive_isbn13.py's OWN notion of an unfinished line rather than
    re-deriving one. That is not tidiness — it is the difference between a task that retires
    and one that cannot. An earlier version counted "ASINs that are valid ISBN-10s", a number
    the work does not move, because the ISBN is recorded BESIDE the Amazon link rather than
    replacing it. The task reported 51/51 ready forever, and the nightly runner built on it
    would have opened an empty draft PR every night.

    The rule this encodes: when a task has a `run` script, the queue must ask THAT SCRIPT what
    is left. Two independent definitions of "done" is one too many — and the other way round,
    a predicate that a DIFFERENT task's output can satisfy retires work that never happened,
    which is how isbn-verify came to mark itself finished without querying a catalogue.

    The surprise that makes the work possible at all: every book links to
    amazon.com/dp/<ASIN>, and for a print book Amazon's ASIN IS the ISBN-10 — all of them pass
    the check digit — so ISBN-13 is arithmetic, not a lookup.
    """
    bin_dir = ROOT / "bin"
    sys.path.insert(0, str(bin_dir))
    try:
        import derive_isbn13 as deriver
    finally:
        sys.path.remove(str(bin_dir))
    lines = (BOOKS if books is None else Path(books)).read_text(
        encoding="utf-8").splitlines()
    actions = [deriver.rewrite(ln)[1] for ln in lines]
    entries = [a for a in actions if a != "skip"]
    return actions.count("add"), len(entries)


def _episodes():
    return [ln for ln in PODCAST.read_text(encoding="utf-8").splitlines()
            if ln.startswith("- Episode")]


def measure_podcast_unresolved():
    """Episodes whose only link is a channel search rather than the video.

    Counted on episode lines only. A bare `grep -c "search channel"` returns one too
    many: the page's own intro sentence explains the marker, and prose is not a link.
    """
    episodes = _episodes()
    return sum(1 for ln in episodes if "search channel" in ln), len(episodes)


def measure_podcast_canonical():
    canonical = re.compile(r"podcasts\.apple\.com|/rss|\.rss|feeds?\.", re.I)
    episodes = _episodes()
    return sum(1 for ln in episodes if not canonical.search(ln)), len(episodes)


def measure_topics_unserved():
    out = subprocess.run([sys.executable, str(COVERAGE), "--json"],
                         capture_output=True, text=True, timeout=60, cwd=str(ROOT))
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:200] or "coverage scan failed")
    rows = json.loads(out.stdout)["rows"]
    return sum(1 for r in rows if r.get("unserved_everywhere")), len(rows)


def measure_faculty_review():
    """Shipped pages not yet through faculty review.

    Reads the DERIVED listing shipped_pages.json, never the producers — ADR-002 exists
    because the console built its queue from site_manifest.json alone while 22 case pages
    shipped from a different producer, so they were invisible to review for two months.
    A page counts as outstanding if it has no entry at all, or its entry is still pending.
    """
    pages = json.loads(SHIPPED.read_text(encoding="utf-8"))["pages"]
    slugs = {p["slug"] for p in pages}
    reviewed = json.loads(REVIEWED.read_text(encoding="utf-8"))
    settled = {slug for slug, row in reviewed.items()
               if (row or {}).get("status") not in (None, "pending")}
    return len(slugs - settled), len(slugs)


def measure_instrument_routes():
    """Recorded custodian routes never confirmed by an actual fetch.

    The trap here is exact: every route's `verifiedVia` currently reads "search index,
    …; live fetch blocked by sandbox egress policy — re-run …". A naive
    `"live fetch" not in via` therefore returns ZERO — a total false negative, because
    the blocked-marker string contains the phrase it is looking for. `--stamp` writes
    "live fetch, bin/check_instrument_links.py", so the prefix is the discriminator.
    """
    rights = json.loads(RIGHTS.read_text(encoding="utf-8"))
    routes = [(e, f) for e in rights["instruments"] for f in ("formUrl", "trainingUrl")
              if (e.get("officialSource") or {}).get(f)]
    unconfirmed = sum(
        1 for e, _ in routes
        if not (e["officialSource"].get("verifiedVia") or "").startswith("live fetch,"))
    return unconfirmed, len(routes)


def measure_guideline_baselines():
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    ids = [s["id"] for s in registry["sources"]
           if (s.get("surveillance") or {}).get("job") == "guideline-surveillance"]
    have = {p.stem for p in BASELINES.glob("*.json")}
    return len([i for i in ids if i not in have]), len(ids)


def measure_citation_backlog():
    """Curriculum DOIs/PMIDs never yet resolved.

    Imports the checker's OWN scanner rather than reimplementing its scope. An earlier
    draft here globbed the root *.json files and reported 42 of 99 outstanding; the real
    scope is the curriculum source tree, where the true answer is zero. Reimplementing
    another script's definition of what counts is how two numbers drift apart silently.

    Kept in the queue at zero deliberately — it is the worked example of a task retiring
    itself by measurement.
    """
    bin_dir = AUTOMATION / "surveillance" / "bin"
    sys.path.insert(0, str(bin_dir))
    try:
        import run_citation_check as checker
    finally:
        sys.path.remove(str(bin_dir))
    # The scanner yields (kind, id, url, path) per OCCURRENCE — 934 of them for 645
    # distinct citations. last_run.json is keyed "<kind>:<id>", so build the same key
    # rather than stripping the prefix: counting occurrences would inflate the backlog
    # and comparing bare ids would never match anything.
    ids = {"%s:%s" % (kind, cid)
           for kind, cid, _url, _path in checker.scan_curriculum_citations(str(ROOT))}
    checked = set(json.loads(LAST_RUN.read_text(encoding="utf-8")))
    return len(ids - checked), len(ids)


# ---------------------------------------------------------------- the queue
# `host` is a probe_egress key, or None when the task needs no network at all.
# `do` is the command that actually starts the work: a queue that says what is possible
# without saying how to begin has moved the problem rather than solved it.

TASKS = [
    {
        "key": "isbn-derive",
        "title": "Surface an ISBN-13 for every book",
        "host": None,
        "measure": measure_isbn_derivable,
        "unit": "books whose ISBN-10 is already sitting in the page",
        "why": "Every book links to amazon.com/dp/<ASIN>, and for a print book that ASIN IS the "
               "ISBN-10 — all of them pass the check digit, which chance would manage about one "
               "time in eleven. ISBN-13 is therefore arithmetic, not a lookup: no key, no network. "
               "Until it is surfaced, a learner without an Amazon account cannot find these books "
               "in a library catalogue — the same 'a withdrawal must leave a route' principle the "
               "instrument work already follows, applied to books.",
        "do": "python3 bin/derive_isbn13.py --write && python3 bin/derive_isbn13.py --check",
        "run": "python3 bin/derive_isbn13.py --write",
        "verify": "python3 bin/derive_isbn13.py --check",
    },
    {
        "key": "faculty-review",
        "title": "Clear the faculty review backlog",
        "host": None,
        "measure": measure_faculty_review,
        "unit": "shipped pages with no review recorded",
        "why": "These are live on a learner site with nobody's name against them. The backlog is "
               "mostly Case-of-the-Week pages — exactly the class ADR-002 was written about, since "
               "they ship from a producer the console did not read and stayed invisible to the "
               "review queue for two months.",
        "do": "python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check   "
              "# then work the queue in the faculty console",
    },
    {
        "key": "coverage-unserved",
        "title": "Serve the topics that have nothing at all",
        "host": None,
        "measure": measure_topics_unserved,
        "unit": "topics with no podcast, no book and no audio",
        "why": "The real holes. A learner on one of these finds nothing on any surface. Curation, "
               "not network — which makes it the substantial piece an offline session can finish.",
        "do": "python3 13_Faculty_Resources/_automation/library_coverage_scan.py   # then curate",
    },
    {
        "key": "instrument-routes",
        "title": "Re-verify the instrument custodian routes",
        "host": "instrument-custodians",
        "measure": measure_instrument_routes,
        "unit": "recorded routes never confirmed by a live fetch",
        "why": "Under INV-IR2 a retired instrument must still leave a route to its custodian, and a "
               "rotted route turns a rights stub back into the dead end the rule exists to prevent. "
               "Every route today is attested by search index only, because this sandbox cannot "
               "reach those hosts.",
        "do": "python3 bin/check_instrument_links.py --stamp   # from a machine with real egress",
    },
    {
        "key": "guideline-baseline",
        "title": "Give every surveilled guideline a baseline",
        "host": "apify",
        "measure": measure_guideline_baselines,
        "unit": "surveillance sources with no baseline captured",
        "why": "A source with no baseline cannot be diffed, so its surveillance silently does "
               "nothing. The same P1 has appeared unchanged in four consecutive monthly delta "
               "reports — 0 characters extracted, source down or scraper broken.",
        "do": "python3 13_Faculty_Resources/_automation/surveillance/bin/run_guideline_surv.py   "
              "# needs APIFY_TOKEN",
    },
    {
        "key": "citation-check",
        "title": "Resolve unchecked curriculum citations",
        "host": "doi",
        "measure": measure_citation_backlog,
        "unit": "cited DOIs never resolved",
        "why": "Kept in the queue at zero deliberately: it is the worked example of a task retiring "
               "by measurement rather than by someone remembering to delete the line.",
        "do": "python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py",
    },
    {
        "key": "podcast-unresolved",
        "title": "Resolve the podcast page's channel-search links",
        "host": "podcast",
        "measure": measure_podcast_unresolved,
        "unit": "episodes pointing at a channel search instead of the video",
        "why": "These hand a learner a search page instead of the episode.",
        "do": "find each episode on the channel and replace the search URL in "
              "12_Media/psychiatry_psychotherapy_podcast_library.md",
    },
    {
        "key": "podcast-canonical",
        "title": "Add a durable canonical beside each YouTube link",
        "host": "podcast",
        "measure": measure_podcast_canonical,
        "unit": "episodes with no RSS/Apple canonical",
        "why": "A YouTube link is the least durable address an episode has, and not one of these "
               "episodes currently carries anything else.",
        "do": "resolve each episode against the show's feed and record the canonical alongside",
    },
]


def is_autonomous(task):
    """May an unattended agent perform this task?

    The criterion is deliberately not a per-task opinion, because opinions drift and a
    hand-set boolean is one careless edit away from letting a bot loose on curation. A task
    qualifies only if BOTH of these exist:

      run     a deterministic script that makes the change — so the diff comes from
              reviewable code, not from an agent's free-hand editing of 51 lines;
      verify  a command that proves the change afterwards and exits non-zero if it is wrong.

    Everything requiring judgement therefore fails the test by construction, which is the
    point. `coverage-unserved` is curation: what belongs in front of a learner is not
    mechanisable. `faculty-review` is an attestation — a person putting their name to a
    clinical page — and a bot advancing it would be a governance failure of a different
    order from a formatting mistake. Neither has a `run`, so neither can ever be picked up,
    and no reviewer has to remember that.
    """
    return bool(task.get("run")) and bool(task.get("verify"))


def probe_capability():
    """Ask probe_egress.py for the current capability map. Never probes the network itself.

    A missing or broken probe is reported as unknown capability rather than being treated as
    "everything works" — guessing optimistically here would recreate the exact failure this
    script exists to prevent.
    """
    if os.environ.get("CLERKSHIP_SKIP_EGRESS_PROBE"):
        # Say what actually happened. Reporting a JSON parse error for a deliberate opt-out
        # sends the reader to debug the wrong thing.
        return {}, "egress probe disabled (CLERKSHIP_SKIP_EGRESS_PROBE) — network tasks unknown"
    if not PROBE.exists():
        return {}, "bin/probe_egress.py not found — capability unknown"
    try:
        out = subprocess.run([sys.executable, str(PROBE), "--json"],
                             capture_output=True, text=True, timeout=60, cwd=str(ROOT))
        if out.returncode != 0:
            return {}, "probe failed: %s" % (out.stderr.strip()[:120] or "non-zero exit")
        blob = json.loads(out.stdout)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        return {}, "probe unavailable: %s" % exc
    note = "capability probed %s%s" % (blob.get("probed", "?"),
                                       " (cached)" if blob.get("cached") else "")
    return {k: v.get("status") for k, v in blob.get("targets", {}).items()}, note


def evaluate(task, capability):
    """Resolve one task to (status, remaining, total, detail)."""
    try:
        remaining, total = task["measure"]()
    except Exception as exc:  # a moved file must not read as "done"
        return UNKNOWN, None, None, "cannot measure: %s: %s" % (type(exc).__name__, exc)

    if remaining == 0:
        return DONE, 0, total, "nothing left"

    host = task["host"]
    if host is None:
        return READY, remaining, total, "needs no network"
    status = capability.get(host)
    if status is None:
        return UNKNOWN, remaining, total, "capability of %r unknown" % host
    return STATUS_FROM_HOST.get(status, UNKNOWN), remaining, total, "%s: %s" % (host, status)


LABEL = {
    READY: "READY",
    NEEDS_KEY: "needs a key",
    NEEDS_AUTH: "needs auth",
    BLOCKED: "blocked here",
    UNKNOWN: "unknown",
    DONE: "done",
}


def render(rows, note, show_done):
    out = ["what can I do today — %s" % note, ""]
    shown = [r for r in rows if show_done or r["status"] != DONE]
    if not shown:
        return "\n".join(out + ["Nothing open. Every measured task reports zero remaining."])

    current = None
    for row in shown:
        if row["status"] != current:
            current = row["status"]
            out.append("── %s ──" % LABEL[current].upper())
        count = "?" if row["remaining"] is None else str(row["remaining"])
        total = "" if row["total"] in (None, 0) else "/%d" % row["total"]
        out.append("  %-20s %s%s %s" % (row["key"], count, total, row["unit"]))
        out.append("        %s" % row["detail"])
        if row["status"] == READY:
            out.append("        → %s" % row["do"])
        out.append("")
    ready = [r for r in shown if r["status"] == READY]
    out.append("%d task(s) runnable right now%s."
               % (len(ready), ": " + ", ".join(r["key"] for r in ready) if ready else ""))
    out.append("Full reasoning for one: --why <key>. Capability detail: python3 bin/probe_egress.py")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--all", action="store_true", help="include tasks that report zero remaining")
    ap.add_argument("--why", metavar="KEY", help="explain one task in full")
    ap.add_argument("--next-autonomous", action="store_true",
                    help="emit the single task an unattended runner may do now, as JSON; "
                         "prints nothing and exits 0 when there is none")
    args = ap.parse_args()

    capability, note = probe_capability()
    rows = []
    for task in TASKS:
        status, remaining, total, detail = evaluate(task, capability)
        rows.append({"key": task["key"], "title": task["title"], "status": status,
                     "remaining": remaining, "total": total, "unit": task["unit"],
                     "detail": detail, "why": task["why"], "do": task["do"],
                     "host": task["host"], "autonomous": is_autonomous(task),
                     "run": task.get("run"), "verify": task.get("verify")})
    rows.sort(key=lambda r: (RANK[r["status"]], -(r["remaining"] or 0)))

    if args.next_autonomous:
        # Exactly one task, or nothing. Silence is the normal, correct answer on most
        # nights: the queue retires its own work, so a runner that finds nothing to do has
        # succeeded rather than failed.
        for row in rows:
            if row["status"] == READY and row["autonomous"]:
                print(json.dumps(row, indent=2))
                break
        return 0

    if args.why:
        match = next((r for r in rows if r["key"] == args.why), None)
        if not match:
            print("no such task: %s\nknown: %s"
                  % (args.why, ", ".join(t["key"] for t in TASKS)), file=sys.stderr)
            return 2
        print("%s — %s\n" % (match["key"], match["title"]))
        print("status    : %s (%s)" % (LABEL[match["status"]], match["detail"]))
        print("remaining : %s of %s %s" % (match["remaining"], match["total"], match["unit"]))
        print("host      : %s" % (match["host"] or "none — no network needed"))
        print("\nwhy this matters\n  %s" % match["why"])
        print("\nhow to start\n  %s" % match["do"])
        return 0

    if args.json:
        print(json.dumps({"note": note, "capability": capability, "tasks": rows}, indent=2))
    else:
        print(render(rows, note, args.all))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(2)
