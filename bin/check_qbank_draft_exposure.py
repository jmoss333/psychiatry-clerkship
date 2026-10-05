#!/usr/bin/env python3
"""How much un-attested question content ships? Count it on every bank, pin it, and only let it shrink.

THE DEFECT. The attestation gate for question content exists on ONE of six banks and only at
runtime: question_bank.json items carry `status` and review.html / the console filter on it.
The other five ship whatever they hold. On 2026-10-03 every communication case, family-systems
scenario and clinical-reasoning case (both audiences) was `facultyReview.status: "draft"` and
live on both sites, and all 437 flash-card questions in quizzes.json carry no review block at
all. No gate counted any of it, so the number could only grow and nobody would see it move.

WHAT THIS DOES. Enumerates all six banks, classifies every item by its attestation state, and
compares the EXPOSED set — draft, pending, missing, or any status that is not reviewed/attested —
against a capped, NAMED allowlist (bin/qbank_draft_exposure_allowlist.json). Named, not counted:
a count cannot see one draft attested and a different one added in the same diff; a list of ids
can. The cap per bank is CAPS below, in the script, so raising it is a policy edit under its own
review (docs/RATCHETS.md, "the allowlist ratchet is shaped differently"); the list is data and
shrinking it is an ordinary change. TODAY'S COUNTS ARE THE CAPS: the gate pretends nothing is
clean, it stops the number rising unnoticed.

  FAIL  an exposed item that is not on the list        (new un-attested content shipping)
  FAIL  more exposed items than the bank's cap          (the ratchet turned the wrong way)
  FAIL  a listed id that is no longer exposed           (stale entry: attested or gone — delete it)
  FAIL  a listed id that appears twice, or a list longer than its cap
  note  a list shorter than its cap                     (name the number to lower CAPS to)

REPORT, NEVER FIX. This tool reads six registries and one allowlist and writes nothing but its
report (--init-allowlist writes the allowlist ONCE, when none exists). It never changes an item's
status or text: attesting is the console's job, under the console's identity (L4).

HOW EACH BANK IS READ.
  QB          question_bank.json items[]          `status` (attested | draft); `retired: true`
                                                  items do not ship and are reported, not exposed
  COMM        communication_cases.json cases[]    facultyReview.status
  FAM         family_systems_scenarios.json scenarios[]
  REASON      reasoning_cases.json cases[]        (MS3 audience)
  REASON-RES  reasoning_cases_resident.json cases[]  (resident audience; ids overlap REASON, so
                                                  the allowlist is keyed per bank)
  DECK        07_…/Landmark_Trials/quizzes.json decks[].questions[]  id = deck.id#index (the
                                                  positional id review.html uses; see
                                                  bin/check_deck_card_stability.py)
A `facultyReview` block that is absent, not an object, or has no `status` is MISSING. The status
values reviewed and attested are CLEAR. retired is its own bucket and counts as exposed on the
five facultyReview banks until a consumer provably filters it (none does today; none is marked).

Exit 0 clean · 1 any FAIL above · 2 could not check (a bank or the allowlist missing, unparsable
or not the shape this tool reads; an allowlist naming a bank this tool does not know).

    python3 bin/check_qbank_draft_exposure.py                  # the gate (bin/verify.sh runs it)
    python3 bin/check_qbank_draft_exposure.py --self-test      # planted rises and stale entries go red
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

# (bank, path, list key, how attestation is read)
BANKS = (
    ("QB", "question_bank.json", "items", "status"),
    ("COMM", "communication_cases.json", "cases", "facultyReview"),
    ("FAM", "family_systems_scenarios.json", "scenarios", "facultyReview"),
    ("REASON", "reasoning_cases.json", "cases", "facultyReview"),
    ("REASON-RES", "reasoning_cases_resident.json", "cases", "facultyReview"),
    ("DECK", QUIZZES, "decks", "facultyReview"),
)
CLEAR = ("reviewed", "attested")
BUCKETS = ("draft", "pending", "missing", "retired", "other")

# POLICY. Today's exposure, 2026-10-04. Lower a number here when the allowlist below it has
# shrunk (the gate prints the number); raising one is a decision that more un-attested content
# may ship, and belongs in its own commit with its reason.
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
    For QB a retired item is bucket 'not-shipped' and never exposed."""
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


def allowlist_payload(exposed_by_bank):
    return {
        "_note": ("Named allowlist for bin/check_qbank_draft_exposure.py: every un-attested item that ships "
                  "today, per bank. SHRINK ONLY. Delete an entry when the item is attested (the gate fails "
                  "on a stale one); never add an entry to absorb new un-attested content -- the caps live in "
                  "the script (CAPS) and are policy. DECK ids are positional (deck#index), see "
                  "bin/quizzes.fingerprints.json. See docs/RATCHETS.md."),
        "banks": {bank: sorted(ids) for bank, ids in exposed_by_bank.items()},
    }


def gate(buckets_by_bank, allowlist, caps, out=print):
    """buckets_by_bank: {bank: {id: bucket}}. The whole exit contract, in-process for --self-test."""
    failures = 0
    notes = []
    out("qbank draft exposure -- un-attested items shipping, per bank (cap = policy in CAPS)")
    out(f"  {'bank':<11}{'items':>6}{'clear':>7}{'draft':>7}{'pend':>6}{'miss':>6}{'retd':>6}{'other':>7}"
        f"{'EXPOSED':>9}{'cap':>5}{'listed':>8}")
    for bank, _, _, _ in BANKS:
        buckets = buckets_by_bank[bank]
        counts = {b: sum(1 for v in buckets.values() if v == b) for b in BUCKETS + ("clear", "not-shipped")}
        exposed = {i for i, v in buckets.items() if v in BUCKETS}
        listed = allowlist[bank]
        cap = caps[bank]
        out(f"  {bank:<11}{len(buckets):>6}{counts['clear']:>7}{counts['draft']:>7}{counts['pending']:>6}"
            f"{counts['missing']:>6}{counts['retired']:>6}{counts['other']:>7}{len(exposed):>9}{cap:>5}{len(listed):>8}"
            + (f"   ({counts['not-shipped']} retired QB draft(s) not shipping)" if counts["not-shipped"] else ""))
        seen = set()
        for i in listed:
            if i in seen:
                out(f"  FAIL  {bank}: {i} is listed twice")
                failures += 1
            seen.add(i)
        unlisted = sorted(exposed - seen)
        stale = sorted(seen - exposed)
        for i in unlisted:
            out(f"  FAIL  {bank}: {i} ships {buckets[i]} and is not on the allowlist -- attest it, or if more "
                f"un-attested content is to ship, raise CAPS[{bank!r}] in its own policy commit and list it")
            failures += 1
        for i in stale:
            out(f"  FAIL  {bank}: {i} is listed but is {buckets.get(i, 'gone')} -- stale entry, delete it from {ALLOWLIST}")
            failures += 1
        if len(exposed) > cap:
            out(f"  FAIL  {bank}: {len(exposed)} exposed, cap is {cap} -- the ratchet only turns down")
            failures += 1
        if len(seen) > cap:
            out(f"  FAIL  {bank}: allowlist has {len(seen)} entries, cap is {cap}")
            failures += 1
        if len(seen) < cap and not unlisted:
            notes.append(f"{bank}: {len(seen)} listed under a cap of {cap} -- lower CAPS[{bank!r}] to {len(seen)}")
    for note in notes:
        out(f"  note  {note}")
    total = sum(sum(1 for v in b.values() if v in BUCKETS) for b in buckets_by_bank.values())
    if failures:
        out(f"FAIL -- {failures} finding(s); {total} un-attested item(s) ship across {len(BANKS)} banks. "
            f"Nothing was changed: attest in the console, or delete stale entries.")
        return 1
    out(f"OK -- {total} un-attested item(s) ship across {len(BANKS)} banks, every one named and within cap.")
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
    exposed = {bank: sorted(i for i, v in b.items() if v in BUCKETS) for bank, b in collect(root).items()}
    (root / ALLOWLIST).write_text(json.dumps(allowlist_payload(exposed), indent=2) + "\n", encoding="utf-8")
    caps = {bank: len(ids) for bank, ids in exposed.items()}
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
        expect("the fixture exposes what it was built to expose",
               caps == {"QB": 0, "COMM": 1, "FAM": 1, "REASON": 1, "REASON-RES": 0, "DECK": 1})
        rc, out = run(root, caps)
        expect("a tree whose exposure equals the list and the caps exits 0", rc == 0 and out.endswith("within cap."))
        expect("a retired QB draft is reported and not exposed", "1 retired QB draft(s) not shipping" in out)
        expect("a missing facultyReview block counts as exposed (DECK AR-01#0)", '"AR-01#0"' in
               (root / ALLOWLIST).read_text(encoding="utf-8"))

        # RED 1: raise one count above cap -- flip an attested item to draft.
        bank = copy.deepcopy(files["communication_cases.json"])
        bank["cases"][1]["facultyReview"]["status"] = "draft"
        _write(root, "communication_cases.json", bank)
        rc, out = run(root, caps)
        expect("a new draft exits 1: unlisted AND over cap, named", rc == 1 and "comm_b ships draft" in out
               and "COMM: 2 exposed, cap is 1" in out)
        _write(root, "communication_cases.json", files["communication_cases.json"])

        # RED 2: cap below reality -- the policy number is lower than what ships (and what is listed).
        low = dict(caps, FAM=0)
        rc, out = run(root, low)
        expect("a cap below reality exits 1 the other way (stale cap)", rc == 1 and "FAM: 1 exposed, cap is 0" in out
               and "allowlist has 1 entries, cap is 0" in out)

        # RED 3: a stale entry -- the listed item was attested.
        bank = copy.deepcopy(files["family_systems_scenarios.json"])
        bank["scenarios"][0]["facultyReview"]["status"] = "reviewed"
        _write(root, "family_systems_scenarios.json", bank)
        rc, out = run(root, caps)
        expect("attesting a listed item makes its entry stale: exit 1, delete it",
               rc == 1 and "fam_a is listed but is clear -- stale entry" in out)
        _write(root, "family_systems_scenarios.json", files["family_systems_scenarios.json"])

        # RED 4: a stale entry for an id that no longer exists anywhere.
        allow = json.loads((root / ALLOWLIST).read_text(encoding="utf-8"))
        allow["banks"]["REASON"].append("reason_zzz")
        (root / ALLOWLIST).write_text(json.dumps(allow), encoding="utf-8")
        rc, out = run(root, dict(caps, REASON=2))
        expect("an entry for a vanished id is stale", rc == 1 and "reason_zzz is listed but is gone" in out)
        allow["banks"]["REASON"] = ["reason_a", "reason_a"]
        (root / ALLOWLIST).write_text(json.dumps(allow), encoding="utf-8")
        rc, out = run(root, dict(caps, REASON=2))
        expect("a duplicate entry fails", rc == 1 and "listed twice" in out)
        allow["banks"]["REASON"] = ["reason_a"]
        (root / ALLOWLIST).write_text(json.dumps(allow), encoding="utf-8")

        # GREEN after shrink: the list shrank below the cap -> a note naming the new number, exit 0.
        rc, out = run(root, dict(caps, REASON=3))
        expect("a list shorter than its cap is a note naming the number to lower the cap to",
               rc == 0 and "lower CAPS['REASON'] to 1" in out)

        # Same id in both reasoning banks is judged per bank.
        rc, out = run(root, caps)
        expect("REASON and REASON-RES share an id and are judged separately",
               rc == 0 and "REASON-RES" in out and "reason_a ships" not in out)

        # The unknown-status door: anything not reviewed/attested is exposed.
        bank = copy.deepcopy(files["reasoning_cases_resident.json"])
        bank["cases"][0]["facultyReview"]["status"] = "approved"
        _write(root, "reasoning_cases_resident.json", bank)
        rc, out = run(root, caps)
        expect("an unrecognised status is exposed as `other`, never clear", rc == 1 and "reason_a ships other" in out)
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
    print(f"self-test: {'FAIL ' + str(len(failed)) + ' case(s)' if failed else 'OK'} -- a rise, a stale cap, a stale "
          f"entry and an unknown status go red; nothing is ever written; the live tree is clean")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=None, help="checkout to judge (default: this repository)")
    ap.add_argument("--init-allowlist", action="store_true",
                    help=f"write {ALLOWLIST} from today's tree -- refuses if it already exists (shrink by hand)")
    ap.add_argument("--self-test", action="store_true", help="prove a rise, a stale cap and a stale entry go red")
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
            exposed = {bank: sorted(i for i, v in b.items() if v in BUCKETS) for bank, b in collect(root).items()}
        except CheckError as exc:
            print(f"qbank draft exposure: COULD NOT CHECK -- {exc}; allowlist not written")
            return 2
        target.write_text(json.dumps(allowlist_payload(exposed), indent=2) + "\n", encoding="utf-8")
        print(f"allowlist written to {ALLOWLIST}: " + ", ".join(f"{b}={len(v)}" for b, v in exposed.items()))
    return check(root)


if __name__ == "__main__":
    sys.exit(main())
