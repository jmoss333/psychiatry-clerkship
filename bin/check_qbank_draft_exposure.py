#!/usr/bin/env python3
"""Review-only question staging plus capped item-level flags on five other banks.

QUESTION BANK: REVIEW SOURCE AND LEARNER PUBLICATION ARE DIFFERENT SETS.
Canonical question_bank.json contains both attested questions and valid drafts for faculty
review. qbank_public.project_question_bank publishes only active, explicitly attested items.
This checker calls that same strict reader, names each source draft as STAGED, and does not
count staged or retired items as learner exposure. Missing/unknown approval, duplicate or
malformed IDs, malformed retirement and unreadable banks fail closed (exit 2).

CAPS['QB'] stays ZERO and its allowlist stays empty. No draft is grandfathered into learner
publication. check-static-site.mjs independently checks the actual bank, pretest pool, shell
and Daily Review inventories against the canonical source on every audience build. The Anki
export/parity path checks learner downloads against that projected bank. A successful source
check alone is not proof of a successful build or of what either live site serves.

A content edit demotes an attested question to draft; the existing faculty console reads
canonical drafts and records explicit approval of exact reviewed revisions. Neither this
checker nor the projection signs, promotes, retires or edits a question. Withholding a revised
draft does not retain its previous approved wording: it returns to learner publication only
after faculty approval through the existing console. Both AI pilots are independent and stay
under their disabled feature flags.

OTHER BANKS: NAMED, SHRINK-ONLY ITEM-METADATA RATCHETS.
COMM, FAM, REASON, REASON-RES and DECK retain their existing item-level metadata policy.
Their host tools also have whole-file signatures; this checker does not read those signatures
or infer that an open item-level flag means an unreviewed tool. Missing facultyReview/status
and every value other than reviewed/attested remain OPEN. Retired rows in those five banks
remain open until a separately verified consumer filters them.

  FAIL  an open item not on its named list (including a swap at the same count)
  FAIL  an open count or allowlist longer than its cap, or a duplicated listed ID
  WARN  a stale listed ID or fewer open items than the cap

A stale entry warns because content PRs cannot change governance paths such as bin/. The
content change clears the flag first; a follow-up governance change deletes the stale entry
and lowers its cap. Until then, reopening the same stale ID is still bounded by its bank's
cap. This limitation is reported, not silently described as fresh approval.

Cap increases are separate policy decisions, never repairs made to pass a content change.
This change permits faculty-only QB staging; it raises no cap and adds no allowlist entry.

HOW EACH BANK IS READ.
  QB          question_bank.json items[]           status (attested | draft), retired bool
  COMM        communication_cases.json cases[]     facultyReview.status
  FAM         family_systems_scenarios.json scenarios[]
  REASON      reasoning_cases.json cases[]         MS3 audience
  REASON-RES  reasoning_cases_resident.json cases[] resident audience; IDs are bank-scoped
  DECK        07_…/Landmark_Trials/quizzes.json decks[].questions[]; id = deck.id#index

REPORT, NEVER FIX. Reads six registries and one allowlist. --init-allowlist writes only when
no allowlist exists. Exit 0 clean/warnings; 1 policy findings; 2 could not check.

    python3 bin/check_qbank_draft_exposure.py
    python3 bin/check_qbank_draft_exposure.py --self-test
    python3 bin/check_qbank_draft_exposure.py --root DIR
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources/_automation/site_build"))
try:
    from qbank_public import project_question_bank
except ImportError as exc:
    print(f"qbank draft exposure: COULD NOT CHECK -- publication validator unavailable: {exc}")
    raise SystemExit(2) from exc

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
    "staged": "it is a review-only draft and is not published",
    None: "it is gone from the bank",
}

# POLICY. QB publishes zero unapproved questions; review-only source drafts are staged,
# not allowlisted. Other banks: item-level flags open on 2026-10-04. Lower a number when the count has
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
    For QB a retired item is 'not-shipped' and a valid draft is 'staged'; neither is public."""
    key = next(b for b in BANKS if b[0] == bank)
    _, _, list_key, how = key
    items = data.get(list_key) if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise CheckError(f"{rel}: expected a `{list_key}` list")
    if bank == "QB":
        try:
            project_question_bank(data)
        except (OSError, ValueError, TypeError) as exc:
            raise CheckError(f"{rel}: {exc}") from exc
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
                out[item["id"]] = "staged"
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
    "positional (deck#index), see quizzes.fingerprints.json. See docs/RATCHETS.md.")


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
    out("qbank draft exposure -- QB drafts are faculty-only staging; other banks count open ITEM-LEVEL "
        "review flags (cap = policy in CAPS; tool-level signatures are not read here)")
    out(f"  {'bank':<11}{'items':>6}{'clear':>7}{'draft':>7}{'pend':>6}{'miss':>6}{'retd':>6}{'other':>7}"
        f"{'OPEN':>9}{'cap':>5}{'listed':>8}")
    for bank, _, _, _ in BANKS:
        buckets = buckets_by_bank[bank]
        counts = {b: sum(1 for v in buckets.values() if v == b) for b in BUCKETS + ("clear", "not-shipped", "staged")}
        open_ids = {i for i, v in buckets.items() if v in BUCKETS}
        listed = allowlist[bank]
        cap = caps[bank]
        out(f"  {bank:<11}{len(buckets):>6}{counts['clear']:>7}{counts['draft']:>7}{counts['pending']:>6}"
            f"{counts['missing']:>6}{counts['retired']:>6}{counts['other']:>7}{len(open_ids):>9}{cap:>5}{len(listed):>8}"
            + (f"   ({counts['not-shipped']} retired QB draft(s) not shipping)" if counts["not-shipped"] else ""))
        for item_id in sorted(i for i, bucket in buckets.items() if bucket == "staged"):
            out(f"  STAGED  QB: {item_id} -- faculty review only; excluded from learner projection")
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
    def question(identifier, status, retired=False):
        return {"id": identifier, "status": status, "retired": retired, "type": "sba",
                "category": "mood", "competency": ["dx"], "difficulty": 2, "pages": ["t_mood.md"],
                "stem": "Which option completes this synthetic review fixture?",
                "options": [{"key": "A", "t": "Correct fixture choice", "c": True}] +
                    [{"key": key, "t": "Fixture alternative " + key,
                      "trap": {"name": "Fixture misconception", "note": "Synthetic explanation."}}
                     for key in ("B", "C", "D")],
                "why": "Synthetic rationale.", "pearl": "Synthetic teaching point.",
                "evidence": "t_mood.md fixture evidence."}
    files = {
        "question_bank.json": {"version": 1, "_note": "Synthetic review-policy fixture.", "items": [
            question("qb_mood_001", "attested"),
            question("qb_mood_002", "attested"),
            question("qb_sud_015", "draft", True),
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

        # QB staging changes review availability, never the publication cap or approval.
        bank = copy.deepcopy(files["question_bank.json"])
        bank["items"][0]["status"] = "draft"
        _write(root, "question_bank.json", bank)
        before = (root / "question_bank.json").read_bytes()
        rc, out = run(root, caps)
        expect("a revised QB draft is explicitly staged for faculty and does not need an exception",
               rc == 0 and "STAGED  QB: qb_mood_001 -- faculty review only" in out and "FAIL" not in out)
        expect("staging is read-only, with no approval written", before == (root / "question_bank.json").read_bytes())
        for invalid in ("approved", None):
            bank["items"][0]["status"] = invalid
            _write(root, "question_bank.json", bank)
            rc, out = run(root, caps)
            expect(f"invalid QB approval {invalid!r} fails closed", rc == 2 and "COULD NOT CHECK" in out)
        _write(root, "question_bank.json", files["question_bank.json"])
        leaked = collect(root)
        leaked["QB"]["qb_mood_001"] = "draft"
        lines = []
        rc = gate(leaked, load_allowlist(root), caps, out=lines.append)
        expect("a draft counted as published still fails the unchanged zero cap",
               rc == 1 and "QB: 1 open, cap is 0" in "\n".join(lines))

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
