#!/usr/bin/env python3
"""Item-level review flags on six question banks: count the open ones, name them, and only let them shrink.

WHAT IS MEASURED, AND ONLY THIS. Every question-bank item carries (or lacks) an ITEM-LEVEL
review flag: `status` on question_bank.json items, `facultyReview.status` on the other five
banks. This tool counts, per bank, the items whose item-level flag is OPEN -- draft, pending,
missing, or any value that is not reviewed/attested -- and compares that set, by name, to a
capped allowlist. "Exposure" in this tool's name means exactly that: an item in a bank file
the sites ship (all six were shipped sources in shipped_pages.json on 2026-10-05; this tool
does not re-check that) whose own flag is open. It is NOT a claim that the item reached
learners without a faculty signature -- see WHAT THIS DOES NOT ESTABLISH.

THE GAP IT CLOSES. Item-level flags were enforced on one bank and counted on none.
question_bank.json is the only bank whose per-item status is the claim of record: the faculty
console attests its items one at a time, and the attestation hash strips per-item status before
hashing the file (13_Faculty_Resources/_automation/attestation_hash.py, canonical_question_bank).
The other five banks are attested at TOOL level instead: each file is an extraSource of a host
tool in shipped_pages.json, and that tool's signature hashes the whole file, item-level flags
included (attestation_hash.py, sources_for_slug). On 2026-10-03 every communication case,
family-systems scenario and clinical-reasoning case (both audiences) had
`facultyReview.status: "draft"`, and none of the 437 flash-card questions in quizzes.json carried
a block at all. No gate counted that item-level metadata, so the number of items whose own flag
says draft could grow and nobody would see it move.

WHAT THIS DOES NOT ESTABLISH. It does not read tool-level attestation; bin/check_attestation_hashes.py
does. On 2026-10-05 every host tool of the five facultyReview banks (communication-practice.html,
family-systems.html, diagnostic-reasoning.html, review.html, rp-canon-quiz.html) was signed and
still hash-bound to the bytes counted here. So an open item on those banks is item-level metadata
that says draft (or is absent) INSIDE content covered by a tool-level signature. Whether that
signature reflected a full read of every item is the signer's judgment, which no gate can
establish: if it did, the open flags are bookkeeping; if it did not, the remedy is Reopen on the
host tool's row in the faculty console, not anything this tool does. For QB the item-level status
IS the claim of record, so an open QB item is one the console has not attested.

THE RATCHET. Named, not counted: a count cannot see one item's flag cleared and a different
item's opened in the same diff; a list of ids can. The cap per bank is CAPS below, in the
script, so raising it is a policy edit under its own review (docs/RATCHETS.md, "the allowlist
ratchet is shaped differently"); the list is data. TODAY'S COUNTS ARE THE CAPS: the gate does
not pretend any flag is cleared, it stops the number rising unnoticed.

  FAIL  an open item that is not on the list            (a new open flag, or a swap)
  FAIL  more open items than the bank's cap             (the ratchet turned the wrong way)
  FAIL  a listed id that appears twice, or a list longer than its cap   (only a bin/ edit can do either)
  WARN  a listed id that is no longer open              (stale: cleared, retired or gone)
  WARN  fewer open items than the bank's cap            (names the number to lower CAPS to)

WHY A STALE ENTRY WARNS HERE, when check_citation_attribution.py's stale entry FAILS. The
allowlist lives in bin/, a governance path; the banks are content (shipped extraSources).
bin/check_governance_separation.py L1 forbids both in one diff. If a stale entry failed, the
content PR that clears an item's flag would fail this gate; adding the allowlist deletion to that
PR would fail L1; and deleting the entry first, in a governance PR, would leave the still-open
item unlisted. No PR could ever clear a flag. So the content PR clears the flag and passes with a
WARN, and a follow-up governance PR deletes the entry (a content-class commit) and lowers CAPS (a
policy-class commit; bin/check_policy_content_separation.py keeps them apart). The cost, stated:
until that follow-up lands, a stale id whose flag opens again -- reopened, or deleted and re-added
under the same id -- passes without a FAIL. The cap still bounds the total, and every run prints
the stale entry.

REPORT, NEVER FIX. This tool reads six registries and one allowlist and writes nothing but its
report (--init-allowlist writes the allowlist ONCE, when none exists). It never changes an item's
flag or text: QB items are attested in the console, under the console's identity (L4); the other
banks' flags change in content PRs.

HOW EACH BANK IS READ.
  QB          question_bank.json items[]          `status` (attested | draft); `retired: true`
                                                  items do not ship and are reported, not counted
  COMM        communication_cases.json cases[]    facultyReview.status
  FAM         family_systems_scenarios.json scenarios[]
  REASON      reasoning_cases.json cases[]        (MS3 audience)
  REASON-RES  reasoning_cases_resident.json cases[]  (resident audience; ids overlap REASON, so
                                                  the allowlist is keyed per bank)
  DECK        07_…/Landmark_Trials/quizzes.json decks[].questions[]  id = deck.id#index (the
                                                  positional id review.html uses; see
                                                  bin/check_deck_card_stability.py)
A `facultyReview` block that is absent, not an object, or has no `status` is MISSING. The status
values reviewed and attested are CLEAR. retired is its own bucket and counts as open on the
five facultyReview banks until a consumer provably filters it (none does today; none is marked).

Exit 0 clean, or warnings only · 1 any FAIL above · 2 could not check (a bank or the allowlist
missing, unparsable or not the shape this tool reads; an allowlist naming a bank this tool does
not know).

    python3 bin/check_qbank_draft_exposure.py                  # the gate (bin/verify.sh runs it)
    python3 bin/check_qbank_draft_exposure.py --self-test      # planted rises go red, stale entries warn
    python3 bin/check_qbank_draft_exposure.py --init-allowlist # write the allowlist ONCE from today's tree
    python3 bin/check_qbank_draft_exposure.py --root DIR       # another checkout / fixture
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWLIST = "bin/qbank_draft_exposure_allowlist.json"
QUIZZES = "07_Evidence_and_Reading/Landmark_Trials/quizzes.json"

# (bank, path, list key, how the item-level flag is read)
BANKS = (
    ("QB", "question_bank.json", "items", "status"),
    ("COMM", "communication_cases.json", "cases", "facultyReview"),
    ("FAM", "family_systems_scenarios.json", "scenarios", "facultyReview"),
    ("REASON", "reasoning_cases.json", "cases", "facultyReview"),
    ("REASON-RES", "reasoning_cases_resident.json", "cases", "facultyReview"),
    ("DECK", QUIZZES, "decks", "facultyReview"),
)
CLEAR = ("reviewed", "attested")
# The buckets that count as an OPEN item-level flag.
BUCKETS = ("draft", "pending", "missing", "retired", "other")
# What a stale entry's item is now, in the WARN line.
STALE_STATE = {
    "clear": "its item-level flag is now reviewed/attested",
    "not-shipped": "it is now retired and not shipping",
    None: "it is gone from the bank",
}

# POLICY. Item-level flags open on 2026-10-04. Lower a number here when the open count has
# shrunk (the gate prints the number, and the stale entries to delete first); raising one is a
# decision that more items may carry an open item-level flag, and belongs in its own commit
# with its reason.
CAPS = {"QB": 0, "COMM": 16, "FAM": 8, "REASON": 4, "REASON-RES": 5, "DECK": 437}


class CheckError(Exception):
    """Could not check (exit 2) — never a pass."""


def _read_json(root, rel):
    path = Path(root) / rel
    if not path.is_file():
        raise CheckError(f"{rel} is missing")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CheckError(f"{rel} unreadable: {exc}") from exc


def _bucket_of_review(block):
    if not isinstance(block, dict) or not isinstance(block.get("status"), str):
        return "missing"
    status = block["status"]
    if status in CLEAR:
        return "clear"
    return status if status in BUCKETS else "other"


def classify(bank, data, rel):
    """-> {id: bucket} over every item in the bank; bucket is clear | draft | pending | missing | retired | other.
    For QB a retired item is bucket 'not-shipped' and never counted as open."""
    key = next(b for b in BANKS if b[0] == bank)
    _, _, list_key, how = key
    items = data.get(list_key) if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise CheckError(f"{rel}: expected a `{list_key}` list")
    out = {}
    if bank == "DECK":
        for deck in items:
            if not isinstance(deck, dict) or not isinstance(deck.get("id"), str) or not isinstance(deck.get("questions"), list):
                raise CheckError(f"{rel}: a deck without an id or a questions list")
            for idx, q in enumerate(deck["questions"]):
                out[f"{deck['id']}#{idx}"] = _bucket_of_review(q.get("facultyReview") if isinstance(q, dict) else None)
        return out
    for pos, item in enumerate(items):
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise CheckError(f"{rel}: {list_key}[{pos}] has no string id")
        if item["id"] in out:
            raise CheckError(f"{rel}: id {item['id']} appears twice")
        if how == "status":
            if item.get("retired") is True:
                out[item["id"]] = "not-shipped"
            elif item.get("status") == "attested":
                out[item["id"]] = "clear"
            elif item.get("status") == "draft":
                out[item["id"]] = "draft"
            elif isinstance(item.get("status"), str):
                out[item["id"]] = "other"
            else:
                out[item["id"]] = "missing"
        else:
            out[item["id"]] = _bucket_of_review(item.get("facultyReview"))
    return out


def load_allowlist(root):
    raw = _read_json(root, ALLOWLIST)
    banks = raw.get("banks") if isinstance(raw, dict) else None
    if not isinstance(banks, dict):
        raise CheckError(f"{ALLOWLIST}: expected {{\"banks\": {{bank: [ids]}}}}")
    known = {b[0] for b in BANKS}
    for bank, ids in banks.items():
        if bank not in known:
            raise CheckError(f"{ALLOWLIST} names a bank this tool does not read: {bank}")
        if not isinstance(ids, list) or any(not isinstance(i, str) for i in ids):
            raise CheckError(f"{ALLOWLIST}: banks.{bank} must be a list of ids")
    return {b[0]: list(banks.get(b[0], [])) for b in BANKS}


ALLOWLIST_NOTE = (
    "Named allowlist for bin/check_qbank_draft_exposure.py: every item whose ITEM-LEVEL review flag "
    "(QB `status`; elsewhere `facultyReview.status`) was open -- draft, pending or missing -- when the "
    "list was written, per bank. Item metadata only: the five non-QB bank files are also hashed whole "
    "into their host tools' tool-level signatures, which this gate does not read. SHRINK ONLY, and only "
    "in a governance PR (bin/ is a governance path): when a content PR clears an item's flag, its entry "
    "goes stale and the gate WARNS until a follow-up governance PR deletes it. Never add an entry to "
    "absorb a new open flag -- the caps live in the script (CAPS) and are policy. DECK ids are "
    "positional (deck#index), see bin/quizzes.fingerprints.json. See docs/RATCHETS.md.")


def allowlist_payload(open_by_bank):
    return {
        "_note": ALLOWLIST_NOTE,
        "banks": {bank: sorted(ids) for bank, ids in open_by_bank.items()},
    }


def _plural(n, one, many):
    return one if n == 1 else many


def gate(buckets_by_bank, allowlist, caps, out=print):
    """buckets_by_bank: {bank: {id: bucket}}. The whole exit contract, in-process for --self-test."""
    failures = 0
    warnings = []
    out("qbank draft exposure -- items whose ITEM-LEVEL review flag is open, per bank (cap = policy in CAPS; "
        "tool-level signatures are not read here)")
    out(f"  {'bank':<11}{'items':>6}{'clear':>7}{'draft':>7}{'pend':>6}{'miss':>6}{'retd':>6}{'other':>7}"
        f"{'OPEN':>9}{'cap':>5}{'listed':>8}")
    for bank, _, _, _ in BANKS:
        buckets = buckets_by_bank[bank]
        counts = {b: sum(1 for v in buckets.values() if v == b) for b in BUCKETS + ("clear", "not-shipped")}
        open_ids = {i for i, v in buckets.items() if v in BUCKETS}
        listed = allowlist[bank]
        cap = caps[bank]
        out(f"  {bank:<11}{len(buckets):>6}{counts['clear']:>7}{counts['draft']:>7}{counts['pending']:>6}"
            f"{counts['missing']:>6}{counts['retired']:>6}{counts['other']:>7}{len(open_ids):>9}{cap:>5}{len(listed):>8}"
            + (f"   ({counts['not-shipped']} retired QB draft(s) not shipping)" if counts["not-shipped"] else ""))
        seen = set()
        for i in listed:
            if i in seen:
                out(f"  FAIL  {bank}: {i} is listed twice")
                failures += 1
            seen.add(i)
        unlisted = sorted(open_ids - seen)
        stale = sorted(seen - open_ids)
        for i in unlisted:
            out(f"  FAIL  {bank}: {i} has item-level flag `{buckets[i]}` and is not on the allowlist -- clear the "
                f"flag once the item is reviewed, or, if more open flags are to ship, raise CAPS[{bank!r}] in its "
                f"own policy commit and list it")
            failures += 1
        if len(open_ids) > cap:
            out(f"  FAIL  {bank}: {len(open_ids)} open, cap is {cap} -- the ratchet only turns down")
            failures += 1
        if len(seen) > cap:
            out(f"  FAIL  {bank}: allowlist has {len(seen)} entries, cap is {cap} -- the list may not outgrow the cap "
                f"(raise CAPS in its own policy commit, or delete stale entries before lowering it)")
            failures += 1
        for i in stale:
            warnings.append(f"{bank}: {i} is listed but is no longer open ({STALE_STATE.get(buckets.get(i))}) -- "
                            f"stale entry; delete it from {ALLOWLIST} in a follow-up governance PR (bin/ may not "
                            f"share a diff with the bank change that cleared it, L1)")
        if len(open_ids) < cap and not unlisted:
            after = (f", after deleting its {len(stale)} stale {_plural(len(stale), 'entry', 'entries')}"
                     if stale else "")
            warnings.append(f"{bank}: {len(open_ids)} open under a cap of {cap} -- lower CAPS[{bank!r}] to "
                            f"{len(open_ids)} in a follow-up governance PR{after}")
    for warning in warnings:
        out(f"  WARN  {warning}")
    total = sum(sum(1 for v in b.values() if v in BUCKETS) for b in buckets_by_bank.values())
    tail = (f" {len(warnings)} {_plural(len(warnings), 'warning', 'warnings')} above, for a follow-up governance PR."
            if warnings else "")
    if failures:
        out(f"FAIL -- {failures} finding(s); {total} item(s) across {len(BANKS)} banks have an open item-level "
            f"review flag. Nothing was changed.{tail}")
        return 1
    out(f"OK -- {total} item(s) across {len(BANKS)} banks have an open item-level review flag, every one named and "
        f"within cap (item metadata only; tool-level signatures are bin/check_attestation_hashes.py's).{tail}")
    return 0


def collect(root):
    return {bank: classify(bank, _read_json(root, rel), rel) for bank, rel, _, _ in BANKS}


def check(root, caps=None, out=print):
    try:
        buckets = collect(root)
        allowlist = load_allowlist(root)
    except CheckError as exc:
        out(f"qbank draft exposure: COULD NOT CHECK -- {exc}")
        return 2
    return gate(buckets, allowlist, caps or CAPS, out=out)


# --------------------------------------------------------------------------------- self-test

def _fixture(td):
    root = Path(td)
    rv = {"status": "draft", "reviewer": "", "lastReviewed": ""}
    ok = {"status": "reviewed", "reviewer": "Faculty", "lastReviewed": "2026-10-01"}
    files = {
        "question_bank.json": {"items": [
            {"id": "qb_mood_001", "status": "attested"},
            {"id": "qb_mood_002", "status": "attested"},
            {"id": "qb_sud_015", "status": "draft", "retired": True},
        ]},
        "communication_cases.json": {"cases": [{"id": "comm_a", "facultyReview": rv}, {"id": "comm_b", "facultyReview": ok}]},
        "family_systems_scenarios.json": {"scenarios": [{"id": "fam_a", "facultyReview": rv}]},
        "reasoning_cases.json": {"cases": [{"id": "reason_a", "facultyReview": {"status": "pending"}}]},
        "reasoning_cases_resident.json": {"cases": [{"id": "reason_a", "facultyReview": ok}]},
        QUIZZES: {"decks": [{"id": "AR-01", "questions": [{"q": "s0", "o": []}, {"q": "s1", "o": [], "facultyReview": ok}]}]},
    }
    for rel, body in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(body), encoding="utf-8")
    (root / "bin").mkdir(exist_ok=True)
    open_by_bank = {bank: sorted(i for i, v in b.items() if v in BUCKETS) for bank, b in collect(root).items()}
    (root / ALLOWLIST).write_text(json.dumps(allowlist_payload(open_by_bank), indent=2) + "\n", encoding="utf-8")
    caps = {bank: len(ids) for bank, ids in open_by_bank.items()}
    return root, files, caps


def _write(root, rel, body):
    (root / rel).write_text(json.dumps(body), encoding="utf-8")


def self_test():
    failed = []

    def expect(name, ok):
        print(f"  {'ok  ' if ok else 'FAIL'} {name}")
        if not ok:
            failed.append(name)

    def run(root, caps):
        lines = []
        rc = check(root, caps=caps, out=lines.append)
        return rc, "\n".join(lines)

    with tempfile.TemporaryDirectory(prefix="draft-exposure-selftest.") as td:
        root, files, caps = _fixture(td)
        expect("the fixture has the open flags it was built to have",
               caps == {"QB": 0, "COMM": 1, "FAM": 1, "REASON": 1, "REASON-RES": 0, "DECK": 1})
        rc, out = run(root, caps)
        expect("a tree whose open set equals the list and the caps exits 0, no warning",
               rc == 0 and "within cap" in out and "WARN" not in out)
        expect("a retired QB draft is reported and not counted as open", "1 retired QB draft(s) not shipping" in out)
        expect("a missing facultyReview block counts as open (DECK AR-01#0)", '"AR-01#0"' in
               (root / ALLOWLIST).read_text(encoding="utf-8"))

        # RED 1: a new open flag -- flip a cleared item to draft: unlisted AND over cap.
        bank = copy.deepcopy(files["communication_cases.json"])
        bank["cases"][1]["facultyReview"]["status"] = "draft"
        _write(root, "communication_cases.json", bank)
        rc, out = run(root, caps)
        expect("a new draft exits 1: unlisted AND over cap, named",
               rc == 1 and "comm_b has item-level flag `draft` and is not on the allowlist" in out
               and "COMM: 2 open, cap is 1" in out)
        _write(root, "communication_cases.json", files["communication_cases.json"])

        # RED 2: cap below reality -- the policy number is lower than what is open (and listed).
        low = dict(caps, FAM=0)
        rc, out = run(root, low)
        expect("a cap below reality exits 1", rc == 1 and "FAM: 1 open, cap is 0" in out
               and "allowlist has 1 entries, cap is 0" in out)

        # RED 3: the swap -- clear one listed item and open an unlisted one in the same tree. The
        # count does not move; the named list still fails it. This is why a stale WARN is safe.
        bank = copy.deepcopy(files["communication_cases.json"])
        bank["cases"][0]["facultyReview"]["status"] = "reviewed"
        bank["cases"][1]["facultyReview"]["status"] = "draft"
        _write(root, "communication_cases.json", bank)
        rc, out = run(root, caps)
        expect("a swap (one cleared, a different one opened) exits 1, naming the new one",
               rc == 1 and "comm_b has item-level flag `draft` and is not on the allowlist" in out
               and "comm_a is listed but is no longer open" in out and "COMM: 1 open, cap is 1" not in out)
        _write(root, "communication_cases.json", files["communication_cases.json"])

        # WARN 1: a stale entry -- the listed item's flag was cleared (a content PR). Exit 0, and
        # name the follow-up governance PR: delete the entry, then lower the cap.
        bank = copy.deepcopy(files["family_systems_scenarios.json"])
        bank["scenarios"][0]["facultyReview"]["status"] = "reviewed"
        _write(root, "family_systems_scenarios.json", bank)
        rc, out = run(root, caps)
        expect("clearing a listed item's flag leaves a stale entry: WARN, exit 0, follow-up governance PR named",
               rc == 0 and "WARN  FAM: fam_a is listed but is no longer open (its item-level flag is now "
               "reviewed/attested) -- stale entry" in out and "follow-up governance PR" in out
               and "FAIL" not in out)
        expect("... and the cap warning says to delete the stale entry before lowering",
               "lower CAPS['FAM'] to 0 in a follow-up governance PR, after deleting its 1 stale entry" in out)
        rc, out = run(root, dict(caps, FAM=0))
        expect("lowering the cap without deleting the stale entry is a FAIL (only a bin/ edit can do it)",
               rc == 1 and "FAM: allowlist has 1 entries, cap is 0" in out)
        _write(root, "family_systems_scenarios.json", files["family_systems_scenarios.json"])

        # WARN 2: a stale entry for an id that no longer exists anywhere.
        allow = json.loads((root / ALLOWLIST).read_text(encoding="utf-8"))
        allow["banks"]["REASON"].append("reason_zzz")
        (root / ALLOWLIST).write_text(json.dumps(allow), encoding="utf-8")
        rc, out = run(root, dict(caps, REASON=2))
        expect("an entry for a vanished id is stale: WARN, exit 0",
               rc == 0 and "reason_zzz is listed but is no longer open (it is gone from the bank)" in out)
        allow["banks"]["REASON"] = ["reason_a", "reason_a"]
        (root / ALLOWLIST).write_text(json.dumps(allow), encoding="utf-8")
        rc, out = run(root, dict(caps, REASON=2))
        expect("a duplicate entry fails", rc == 1 and "listed twice" in out)
        allow["banks"]["REASON"] = ["reason_a"]
        (root / ALLOWLIST).write_text(json.dumps(allow), encoding="utf-8")

        # WARN 3: reality below the cap, list already shrunk -> exit 0, a warning naming the number.
        rc, out = run(root, dict(caps, REASON=3))
        expect("fewer open items than the cap is a WARN naming the number to lower the cap to, exit 0",
               rc == 0 and "WARN  REASON: 1 open under a cap of 3 -- lower CAPS['REASON'] to 1 in a follow-up "
               "governance PR" in out and "stale" not in out)

        # Same id in both reasoning banks is judged per bank.
        rc, out = run(root, caps)
        expect("REASON and REASON-RES share an id and are judged separately",
               rc == 0 and "REASON-RES" in out and "reason_a has item-level flag" not in out)

        # The unknown-status door: anything not reviewed/attested is open.
        bank = copy.deepcopy(files["reasoning_cases_resident.json"])
        bank["cases"][0]["facultyReview"]["status"] = "approved"
        _write(root, "reasoning_cases_resident.json", bank)
        rc, out = run(root, caps)
        expect("an unrecognised status is open as `other`, never clear",
               rc == 1 and "reason_a has item-level flag `other`" in out)
        _write(root, "reasoning_cases_resident.json", files["reasoning_cases_resident.json"])

        # Could-not-check doors.
        (root / ALLOWLIST).rename(root / "bin" / "gone.json")
        rc, out = run(root, caps)
        expect("a missing allowlist exits 2", rc == 2 and "missing" in out)
        (root / "bin" / "gone.json").rename(root / ALLOWLIST)
        allow["banks"]["PHARM"] = []
        (root / ALLOWLIST).write_text(json.dumps(allow), encoding="utf-8")
        rc, out = run(root, caps)
        expect("an allowlist naming an unknown bank exits 2", rc == 2 and "PHARM" in out)
        del allow["banks"]["PHARM"]
        (root / ALLOWLIST).write_text(json.dumps(allow), encoding="utf-8")
        (root / "reasoning_cases.json").write_text("[]", encoding="utf-8")
        rc, out = run(root, caps)
        expect("a bank of the wrong shape exits 2, never a pass over nothing", rc == 2 and "cases" in out)
        _write(root, "reasoning_cases.json", files["reasoning_cases.json"])
        (root / QUIZZES).unlink()
        rc, out = run(root, caps)
        expect("a missing bank exits 2", rc == 2)

    rc, out = run(ROOT, CAPS)
    expect("the LIVE tree exits 0 against the committed allowlist and CAPS", rc == 0)
    if rc != 0:
        print(out)
    print(f"self-test: {'FAIL ' + str(len(failed)) + ' case(s)' if failed else 'OK'} -- a rise, a cap below reality, "
          f"a swap and an unknown status go red; a stale entry and a cap above reality warn and exit 0; nothing is "
          f"ever written; the live tree is clean")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=None, help="checkout to judge (default: this repository)")
    ap.add_argument("--init-allowlist", action="store_true",
                    help=f"write {ALLOWLIST} from today's tree -- refuses if it already exists (shrink by hand)")
    ap.add_argument("--self-test", action="store_true",
                    help="prove a rise, a cap below reality and a swap go red, and a stale entry only warns")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    root = Path(a.root).resolve() if a.root else ROOT
    if a.init_allowlist:
        target = root / ALLOWLIST
        if target.exists():
            print(f"{ALLOWLIST} exists; it only shrinks, and by hand. Not written.")
            return 1
        try:
            open_by_bank = {bank: sorted(i for i, v in b.items() if v in BUCKETS) for bank, b in collect(root).items()}
        except CheckError as exc:
            print(f"qbank draft exposure: COULD NOT CHECK -- {exc}; allowlist not written")
            return 2
        target.write_text(json.dumps(allowlist_payload(open_by_bank), indent=2) + "\n", encoding="utf-8")
        print(f"allowlist written to {ALLOWLIST}: " + ", ".join(f"{b}={len(v)}" for b, v in open_by_bank.items()))
    return check(root)


if __name__ == "__main__":
    sys.exit(main())
