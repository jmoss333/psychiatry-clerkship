#!/usr/bin/env python3
"""Flash-card ids are positional. This pins what each position means, so a reorder cannot re-key a learner.

THE DEFECT. review.html builds every article/spine card id as `deck.id + "#" + index` over
07_Evidence_and_Reading/Landmark_Trials/quizzes.json (79 decks, 437 questions), and the SM-2
store in localStorage keys each learner's schedule on that id. review_companion_pairs.json cites
cards the same way (AR-24#5). quizzes.json had no schema, no validator and no generator, and its
questions carry no id of their own — so inserting, deleting or reordering ONE question silently
reassigns every later card's schedule in that deck to different content: a learner who had
"AR-12#3" at a 21-day interval is now being asked a question they have never seen, at a 21-day
interval, and nothing anywhere goes red. (Verified read-only on 2026-10-03.)

WHAT THIS DOES, in order, and the whole thing is exit 1 on the first class that fails:

  1. SCHEMA.   Both copies of the deck file (the shipped source and the resident Canon Quiz
               snapshot) validate against quizzes.schema.json (Draft-07, repo root — a schema is
               a governance path and 07_*/ is a content path, so it cannot live beside the data).
  2. SEMANTIC. What Draft-07 cannot say and review.html enforces at runtime by throwing:
               deckCount == len(decks), questionCount == sum(len(questions)), deck.n ==
               len(questions), deck ids unique, exactly ONE keyed option per question.
  3. PIN.      Every card's content fingerprint, per deck and per index, is pinned in
               quizzes.fingerprints.json (generated, committed; repo root beside the schema —
               see WHERE THE PIN LIVES below). The live tree is compared to the pin and every
               divergence is named as deck#index with its class:

                 MOVED      the card at index i was pinned at a different index  -> re-key
                 DELETED    the deck is shorter than its pin (orphans schedules) -> re-key
                 DECK GONE  a pinned deck id no longer exists                    -> re-key
                 EDITED     same index, same length, content revised in place    -> refresh
                 APPENDED   new cards after every pinned index, nothing moved    -> refresh
                 NEW DECK   a deck id the pin has never seen                     -> refresh

               "refresh" means `--update-fingerprints` rewrites the pin and the diff is in the
               PR. "re-key" means the pin may ONLY be rewritten with
               `--update-fingerprints --acknowledge-positional-id-breakage "<reason>"`, which appends a
               dated entry naming every shifted id to the `rekeys` log INSIDE the committed pin
               — so the decision to break learners' schedules is in the diff, with its reason,
               forever. This is an acknowledgment only: learner schedules are NOT migrated, cleared or repaired.
               Without the flag the refresh refuses and says which ids would shift.

HISTORY. The trusted PR base (--base in CI), or locally the merge-base with
CLERKSHIP_PR_BASE/origin/main, supplies the previous pin and append-only rekeys prefix.
A deleted pin is restored from that history, never treated as first generation. Normal
checks also require new dated acknowledgements naming all base-to-live positional breaks,
so manually replacing the pin cannot erase the obligation. Missing history exits 2.

WHY FINGERPRINTS AND NOT EXPLICIT IDS. An `id` field on each question would be the textbook
fix, and it is the wrong first move here. (a) It is a content edit to a shipped file inside a
governance PR, which bin/check_governance_separation.py L1 forbids in one diff — and it should.
(b) The consumer (review.html) and the committed companion pairs would have to change in the
same breath or the ids would be decorative; that is a front-door change, owned by another
session today. (c) Adding ids does not retire the positional scheme — every existing learner
store is keyed `AR-12#3`, so the day the id field ships is itself a re-key event unless the ids
are chosen to be `deck#index`, which is this pin with extra steps. (d) An id field can be typed
wrong, duplicated or left off a new question; a fingerprint cannot be forgotten because it is
computed. The pin makes the positional contract VISIBLE and ENFORCED today, without touching
content; explicit ids remain the right second move, and the `rekeys` log is where that migration
will be recorded when it happens.

WHAT THE FINGERPRINT COVERS. sha256 over [stem, [[option text, keyed?]...]], JSON-encoded with
ensure_ascii and no whitespace, first 16 hex chars. Feedback (`fb`) is deliberately OUTSIDE it:
rewording feedback does not change which question a learner is scheduled on. Rewording the stem
or an option does change the card's content and is reported as EDITED — a refresh, not a
re-key, because the id still points at the same slot in the same deck.

WHERE THE PIN LIVES, and why not bin/. The pin is gate DATA, and an EDITED or APPENDED card must
refresh it in the SAME PR as the deck edit — this gate FAILS until it does, by design, so the
diff carries the change. It first lived in bin/, which bin/check_governance_separation.py L1
treats as governance in full, and 07_*/ is content: the refresh and the edit could not share a
PR, and neither could land alone, so no in-place card edit could ever merge (found 2026-10-05
on the leaked-answer split). At the repo root it is neither a G path nor a CONTENT path to L1,
and it is content to bin/check_policy_content_separation.py like every other gate's data — so
the edit and the refresh ride one PR in separate commits. What stays governance is everything
that decides what the pin means: this script (the algorithm, the classes, the re-key rule) and
quizzes.schema.json. A re-key still cannot be written without the logged acknowledgment, and
that log is inside the pin, in the PR diff.

Exit 0 clean (schema valid, semantics hold, pin matches) · 1 a finding (schema violation,
semantic break, any drift from the pin, a refused re-key) · 2 could not check (a deck file,
the schema or the pin missing or unparsable; jsonschema not installed).

    python3 bin/check_deck_card_stability.py                       # the gate
    python3 bin/check_deck_card_stability.py --self-test           # planted defects go red
    python3 bin/check_deck_card_stability.py --update-fingerprints # refresh-class drift only
    python3 bin/check_deck_card_stability.py --update-fingerprints \\
            --acknowledge-positional-id-breakage "AR-12: Q3 withdrawn after faculty review"   # LOGGED
    python3 bin/check_deck_card_stability.py --root DIR            # another checkout / fixture
"""
from __future__ import annotations

import argparse
import copy
import datetime as _dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover - requirements.txt pins jsonschema
    Draft7Validator = None

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "07_Evidence_and_Reading/Landmark_Trials/quizzes.json"      # what both shipped pages read
SNAPSHOT = "_prototypes/canon-quiz/quizzes.json"                      # resident Canon Quiz copy
SCHEMA = "quizzes.schema.json"
PIN = "quizzes.fingerprints.json"                                     # gate data, not bin/
SCHEMA_TARGETS = (SOURCE, SNAPSHOT)
REKEY_CLASSES = ("MOVED", "DELETED", "DECK GONE")
REFRESH_CLASSES = ("EDITED", "APPENDED", "NEW DECK")
UPDATE_HINT = "python3 bin/check_deck_card_stability.py --update-fingerprints"
REKEY_HINT = UPDATE_HINT + ' --acknowledge-positional-id-breakage "<why learners lose these schedules>"'


class CheckError(Exception):
    """Could not check (exit 2) — never a pass."""


# ------------------------------------------------------------------------------ fingerprints

def fingerprint(question):
    """Identity of one card: stem + option texts + which is keyed. Feedback is excluded on purpose."""
    options = [[o.get("t"), o.get("c")] for o in question.get("o", [])]
    raw = json.dumps([question.get("q"), options], ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def fingerprints_of(data):
    """{deck id: [fingerprint per index]} in deck order of appearance."""
    return {deck["id"]: [fingerprint(q) for q in deck["questions"]] for deck in data["decks"]}


def pin_payload(data, rekeys, source=SOURCE):
    decks = fingerprints_of(data)
    return {
        "_note": ("GENERATED by bin/check_deck_card_stability.py -- do not hand-edit. One fingerprint per "
                  "card, per deck, per index; the index IS the card id review.html keys learner schedules "
                  "on (deck.id + '#' + index). Refresh with --update-fingerprints for in-place edits and "
                  "appends; a reorder, deletion or removed deck re-keys learners and may only be written "
                  "with --acknowledge-positional-id-breakage \"<reason>\", which appends to `rekeys` below."),
        "source": source,
        "algorithm": "sha256(json [stem, [[optionText, keyed], ...]] ensure_ascii, no spaces)[:16]; fb excluded",
        "deckCount": len(decks),
        "cardCount": sum(len(v) for v in decks.values()),
        "decks": dict(sorted(decks.items())),
        "rekeys": rekeys,
    }


def write_pin(path, payload):
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


# ----------------------------------------------------------------------------------- loading

def _read_json(root, rel):
    path = Path(root) / rel
    if not path.is_file():
        raise CheckError(f"{rel} is missing")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CheckError(f"{rel} unreadable: {exc}") from exc


def load_schema(root):
    if Draft7Validator is None:
        raise CheckError("jsonschema is not installed (pip install -r requirements.txt)")
    schema = _read_json(root, SCHEMA)
    try:
        Draft7Validator.check_schema(schema)
    except Exception as exc:  # SchemaError
        raise CheckError(f"{SCHEMA} is not a valid Draft-07 schema: {exc}") from exc
    return Draft7Validator(schema)


def load_pin(root):
    return validate_pin(_read_json(root, PIN))


def validate_pin(payload):
    """Validate a public card-fingerprint snapshot (not a credential)."""
    decks = payload.get("decks") if isinstance(payload, dict) else None
    rekeys = payload.get("rekeys") if isinstance(payload, dict) else None
    if (not isinstance(decks, dict) or not isinstance(rekeys, list)
            or any(not isinstance(v, list) or any(not isinstance(h, str) for h in v) for v in decks.values())):
        raise CheckError(f"{PIN} is not the shape this tool writes (decks: {{id: [hex...]}}, rekeys: [...]); "
                         f"regenerate with `{UPDATE_HINT}`")
    return payload


def _git(root, *args):
    try:
        result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    except OSError as exc:
        raise CheckError(f"history unavailable: {exc}") from exc
    if result.returncode:
        raise CheckError(f"history unavailable: git {' '.join(args)}: {result.stderr.strip()}")
    return result.stdout.strip()


def history_pin(root, base=None):
    """Anchor to the PR base in CI; locally use the established stacked-PR convention.

    Never infer first generation from a missing working pin. Even a base without a pin
    cannot prove that positional ids were never shipped, so it requires investigation.
    """
    parent = base or os.environ.get("CLERKSHIP_PR_BASE", "").strip() or "origin/main"
    commit = _git(root, "rev-parse", "--verify", f"{parent}^{{commit}}")
    if base is None:
        commit = _git(root, "merge-base", commit, "HEAD")
    if (base or os.environ.get("CLERKSHIP_PR_BASE", "").strip()) and commit == _git(root, "rev-parse", "HEAD"):
        raise CheckError("explicit history base equals HEAD; select the trusted PR base, not this branch's tip")
    paths = _git(root, "ls-tree", "--name-only", commit, "--", PIN, "bin/" + PIN).splitlines()
    historical = PIN if PIN in paths else "bin/" + PIN
    if historical not in paths:
        raise CheckError(f"required fingerprint history missing at {commit}; cannot treat this as first generation")
    try:
        return validate_pin(json.loads(_git(root, "show", f"{commit}:{historical}")))
    except ValueError as exc:
        raise CheckError(f"unreadable fingerprint history at {commit}: {exc}") from exc


def shift_ids(drift):
    return [f"{did}#{idx}" if idx is not None else did
            for cls, did, idx, _ in drift if cls in REKEY_CLASSES]


def history_findings(base_snapshot, snapshot, live):
    old = base_snapshot["rekeys"]
    if snapshot["rekeys"][:len(old)] != old:
        return ["re-key history must preserve the trusted base's append-only prefix"], []
    added = snapshot["rekeys"][len(old):]
    for entry in added:
        if (not isinstance(entry, dict) or not isinstance(entry.get("reason"), str)
                or not entry["reason"].strip() or not isinstance(entry.get("date"), str)
                or not isinstance(entry.get("shifts"), list) or not entry["shifts"]
                or any(not isinstance(slot, str) or not slot for slot in entry["shifts"])):
            return ["new re-key acknowledgement needs a date, nonblank reason and affected ids"], []
        try:
            _dt.date.fromisoformat(entry["date"])
        except ValueError:
            return ["new re-key acknowledgement needs an ISO date"], []
    covered = {slot for entry in added for slot in entry["shifts"]}
    missing = [slot for slot in shift_ids(diff_pin(base_snapshot["decks"], live)) if slot not in covered]
    return [], missing


# ---------------------------------------------------------------------------------- findings

def schema_findings(validator, data, rel):
    out = []
    for err in sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path]):
        pointer = "/" + "/".join(str(p) for p in err.absolute_path)
        out.append(f"SCHEMA    {rel} {pointer or '/'}: {err.message}")
    return out


def semantic_findings(data, rel):
    """Exactly what review.html's reviewVerifiedArticles() throws on, plus the keyed-option count."""
    out = []
    decks = data.get("decks") or []
    if data.get("deckCount") != len(decks):
        out.append(f"SEMANTIC  {rel}: deckCount is {data.get('deckCount')} but decks has {len(decks)}")
    total = sum(len(d.get("questions") or []) for d in decks)
    if data.get("questionCount") != total:
        out.append(f"SEMANTIC  {rel}: questionCount is {data.get('questionCount')} but the decks hold {total}")
    seen = {}
    for pos, deck in enumerate(decks):
        did = deck.get("id")
        if did in seen:
            out.append(f"SEMANTIC  {rel}: deck id {did} appears twice (decks[{seen[did]}] and decks[{pos}]) — "
                       f"both would emit the same card ids")
        seen.setdefault(did, pos)
        questions = deck.get("questions") or []
        if deck.get("n") != len(questions):
            out.append(f"SEMANTIC  {rel}: {did}.n is {deck.get('n')} but it holds {len(questions)} questions")
        for idx, q in enumerate(questions):
            keyed = sum(1 for o in (q.get("o") or []) if o.get("c") is True)
            if keyed != 1:
                out.append(f"SEMANTIC  {rel}: {did}#{idx} has {keyed} keyed options (exactly one expected)")
    return out


def diff_pin(pinned, live):
    """Classify every divergence between the pinned fingerprints and the live ones.
    Returns a list of (class, deck, index-or-None, detail) tuples."""
    out = []
    for did, old in sorted(pinned.items()):
        if did not in live:
            out.append(("DECK GONE", did, None, f"{len(old)} pinned card(s); every schedule keyed {did}#n is orphaned"))
    for did, new in live.items():
        old = pinned.get(did)
        if old is None:
            out.append(("NEW DECK", did, None, f"{len(new)} card(s), no schedules exist for it yet"))
            continue
        where = {}
        for j, h in enumerate(old):
            where.setdefault(h, []).append(j)
        stable_prefix = all(i < len(old) and new[i] == old[i] for i in range(min(len(new), len(old))))
        if len(new) < len(old) and stable_prefix:
            for i in range(len(new), len(old)):
                out.append(("DELETED", did, i, "card removed from the end; a learner scheduled on it keeps a dangling id"))
            continue
        if len(new) > len(old) and stable_prefix:
            for i in range(len(old), len(new)):
                out.append(("APPENDED", did, i, "new card after every pinned index; no id shifts"))
            continue
        for i, h in enumerate(new):
            if i < len(old) and h == old[i]:
                continue
            if h in where:
                was = ", ".join(str(j) for j in where[h])
                out.append(("MOVED", did, i, f"holds the card pinned at index {was} — every learner's {did}#{i} "
                                              f"schedule now attaches to different content"))
            elif len(new) == len(old):
                out.append(("EDITED", did, i, "content revised in place (stem or option text); same slot"))
            else:
                out.append(("MOVED", did, i, f"new content at a shifted position (deck went {len(old)} -> {len(new)} cards)"))
        if len(new) < len(old):
            for i in range(len(new), len(old)):
                out.append(("DELETED", did, i, "pinned card no longer present at any index"))
    return out


# -------------------------------------------------------------------------------------- gate

def check(root, out=print, update=False, rekey_reason=None, base=None):
    """The whole exit contract, in-process so --self-test can drive it. 0 / 1 / 2 as documented."""
    try:
        validator = load_schema(root)
        datasets = {rel: _read_json(root, rel) for rel in SCHEMA_TARGETS}
    except CheckError as exc:
        out(f"deck card stability: COULD NOT CHECK -- {exc}")
        return 2

    findings = []
    for rel, data in datasets.items():
        findings += schema_findings(validator, data, rel)
    if findings:
        for line in findings:
            out(line)
        out(f"FAIL -- {len(findings)} schema violation(s) across {len(datasets)} deck file(s); fix the entry, "
            f"never the schema (a schema edit is a governance act, see {SCHEMA}).")
        return 1
    for rel, data in datasets.items():
        findings += semantic_findings(data, rel)
    if findings:
        for line in findings:
            out(line)
        out(f"FAIL -- {len(findings)} semantic break(s); review.html would refuse this feed at runtime.")
        return 1

    live = fingerprints_of(datasets[SOURCE])
    cards = sum(len(v) for v in live.values())
    pin_path = Path(root) / PIN
    try:
        trusted = history_pin(root, base)
        # Deletion is recoverable, but regeneration still compares to trusted history.
        pin = trusted if update and not pin_path.exists() else load_pin(root)
    except CheckError as exc:
        out(f"deck card stability: COULD NOT CHECK -- {exc}")
        return 2
    errors, missing = history_findings(trusted, pin, live)
    if errors:
        out("FAIL -- " + "; ".join(errors))
        return 1

    drift = diff_pin(pin["decks"], live)
    rekey = [d for d in drift if d[0] in REKEY_CLASSES]
    refresh = [d for d in drift if d[0] in REFRESH_CLASSES]
    for cls, did, idx, detail in drift:
        slot = did if idx is None else f"{did}#{idx}"
        out(f"{cls:<9} {slot:<10} {detail}")

    if update:
        required = sorted(set(shift_ids(rekey) + missing))
        if required and not (rekey_reason and rekey_reason.strip()):
            out(f"REFUSED -- {len(required)} shift(s) above would re-key learner schedules. Regenerate ONLY if you "
                f"intend to re-key them: {REKEY_HINT}")
            return 1
        rekeys = list(pin["rekeys"])
        if required:
            rekeys.append({
                "date": _dt.date.today().isoformat(),
                "reason": rekey_reason,
                "shifts": required,
            })
            out(f"OVERRIDE LOGGED -- {len(required)} positional id(s) changed; learner schedules were NOT migrated; reason recorded in {PIN}")
        write_pin(pin_path, pin_payload(datasets[SOURCE], rekeys))
        out(f"pin written to {PIN}: {len(live)} decks, {cards} cards; {len(refresh)} refreshed, {len(required)} positional breakage(s) acknowledged; learner schedules were NOT migrated")
        return 0

    if missing and not rekey:
        out(f"FAIL -- new acknowledgement required for positional changes since trusted base: {', '.join(missing)}. {REKEY_HINT}")
        return 1
    if rekey:
        out(f"FAIL -- {len(rekey)} positional id(s) would shift (deck#index above). This re-keys every learner's "
            f"SM-2 schedule on those ids. If that is intended, {REKEY_HINT}")
        return 1
    if refresh:
        out(f"FAIL -- {len(refresh)} card(s) changed without shifting any id (above). Refresh the pin so the diff "
            f"carries it: {UPDATE_HINT}")
        return 1
    out(f"OK -- {cards} cards in {len(live)} decks match {PIN}; schema + semantics hold on {len(datasets)} files "
        f"({len(pin['rekeys'])} logged re-key(s) in history).")
    return 0


# --------------------------------------------------------------------------------- self-test

def _fixture(td):
    """A minimal tree with the REAL schema and a synthetic two-deck feed, pin generated."""
    root = Path(td)
    shutil.copy2(ROOT / SCHEMA, root / SCHEMA)

    def q(stem, keyed=2):
        return {"q": stem, "o": [{"t": f"option {k}", "c": k == keyed, "fb": f"fb {k}"} for k in range(4)]}
    decks = [
        {"id": "AR-01", "art": 1, "title": "Deck one", "n": 3,
         "questions": [q("first stem"), q("second stem"), q("third stem")]},
        {"id": "SP-09", "title": "Deck two", "n": 2, "questions": [q("spine one"), q("spine two")]},
    ]
    data = {"generated": "2026-10-04", "source": "fixture", "deckCount": 2, "questionCount": 5, "decks": decks}
    for rel in SCHEMA_TARGETS:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data), encoding="utf-8")
    (root / PIN).parent.mkdir(parents=True, exist_ok=True)
    write_pin(root / PIN, pin_payload(data, []))
    _git(root, "init", "-q")
    _git(root, "add", ".")
    _git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "trusted base")
    _git(root, "update-ref", "refs/remotes/origin/main", "HEAD")
    return root, data


def _write(root, data):
    (root / SOURCE).write_text(json.dumps(data), encoding="utf-8")


def self_test():
    failed = []

    def expect(name, ok):
        print(f"  {'ok  ' if ok else 'FAIL'} {name}")
        if not ok:
            failed.append(name)

    def run(root, **kw):
        lines = []
        parent = os.environ.pop("CLERKSHIP_PR_BASE", None)
        try:
            rc = check(root, out=lines.append, **kw)
        finally:
            if parent is not None:
                os.environ["CLERKSHIP_PR_BASE"] = parent
        return rc, "\n".join(lines)

    with tempfile.TemporaryDirectory(prefix="deck-stability-selftest.") as td:
        root, clean = _fixture(td)
        rc, out = run(root)
        expect("a clean fixture exits 0", rc == 0 and out.startswith("OK"))

        bad = copy.deepcopy(clean)
        del bad["decks"][0]["questions"][1]["o"][0]["c"]
        _write(root, bad)
        rc, out = run(root)
        expect("a malformed entry (option without `c`) is a schema violation, exit 1, located",
               rc == 1 and "SCHEMA" in out and "/decks/0/questions/1/o/0" in out)

        bad = copy.deepcopy(clean)
        bad["decks"][0]["questions"][1]["o"][1]["c"] = True
        _write(root, bad)
        rc, out = run(root)
        expect("two keyed options is a semantic break naming the card", rc == 1 and "AR-01#1 has 2 keyed" in out)

        bad = copy.deepcopy(clean)
        bad["decks"][1]["n"] = 7
        _write(root, bad)
        rc, out = run(root)
        expect("deck.n disagreeing with questions is a semantic break", rc == 1 and "SP-09.n is 7" in out)

        swapped = copy.deepcopy(clean)
        qs = swapped["decks"][0]["questions"]
        qs[0], qs[2] = qs[2], qs[0]
        _write(root, swapped)
        rc, out = run(root)
        expect("swapping two questions exits 1 and names deck + index of both shifted ids",
               rc == 1 and "MOVED     AR-01#0" in out and "MOVED     AR-01#2" in out and "AR-01#1" not in out)
        expect("the swap says which index each card was pinned at",
               "pinned at index 2" in out and "pinned at index 0" in out)
        rc, out = run(root, update=True)
        expect("--update-fingerprints REFUSES to absorb a shift without the re-key flag",
               rc == 1 and "REFUSED" in out and "--acknowledge-positional-id-breakage" in out)
        rc, out = run(root, update=True, rekey_reason="self-test: deliberate swap")
        pin = json.loads((root / PIN).read_text(encoding="utf-8"))
        expect("with the flag the pin is rewritten and the re-key is logged with reason and ids",
               rc == 0 and len(pin["rekeys"]) == 1 and pin["rekeys"][0]["reason"] == "self-test: deliberate swap"
               and pin["rekeys"][0]["shifts"] == ["AR-01#0", "AR-01#2"])
        rc, out = run(root)
        expect("after the logged re-key the swapped tree is clean and the log count is reported",
               rc == 0 and "1 logged re-key" in out)
        write_pin(root / PIN, pin_payload(clean, []))
        _write(root, clean)

        inserted = copy.deepcopy(clean)
        inserted["decks"][0]["questions"].insert(0, {"q": "a new first stem",
                                                     "o": clean["decks"][0]["questions"][0]["o"]})
        inserted["decks"][0]["n"] = 4
        inserted["questionCount"] = 6
        _write(root, inserted)
        rc, out = run(root)
        expect("inserting at index 0 shifts every later id and exits 1 naming AR-01#1..#3",
               rc == 1 and "MOVED     AR-01#1" in out and "MOVED     AR-01#3" in out and "SP-09" not in out)

        deleted = copy.deepcopy(clean)
        del deleted["decks"][0]["questions"][1]
        deleted["decks"][0]["n"] = 2
        deleted["questionCount"] = 4
        _write(root, deleted)
        rc, out = run(root)
        expect("deleting a middle question exits 1 as a shift (MOVED + DELETED), not a refresh",
               rc == 1 and "MOVED     AR-01#1" in out and "DELETED   AR-01#2" in out and "re-key" in out)

        gone = copy.deepcopy(clean)
        del gone["decks"][1]
        gone["deckCount"] = 1
        gone["questionCount"] = 3
        _write(root, gone)
        rc, out = run(root)
        expect("a removed deck is DECK GONE and a re-key", rc == 1 and "DECK GONE SP-09" in out)

        edited = copy.deepcopy(clean)
        edited["decks"][0]["questions"][1]["q"] = "second stem, reworded"
        _write(root, edited)
        rc, out = run(root)
        expect("an in-place rewording is EDITED, exit 1, and asks for a plain refresh",
               rc == 1 and "EDITED    AR-01#1" in out and "--rekey" not in out.split("FAIL")[-1])
        rc, out = run(root, update=True)
        expect("the plain refresh accepts EDITED without the re-key flag", rc == 0 and "0 positional breakage(s) acknowledged" in out)
        write_pin(root / PIN, pin_payload(clean, []))

        fb_only = copy.deepcopy(clean)
        fb_only["decks"][0]["questions"][1]["o"][0]["fb"] = "reworded feedback"
        _write(root, fb_only)
        rc, out = run(root)
        expect("rewording feedback alone changes no fingerprint", rc == 0)

        appended = copy.deepcopy(clean)
        appended["decks"][1]["questions"].append({"q": "spine three", "o": clean["decks"][1]["questions"][0]["o"]})
        appended["decks"][1]["n"] = 3
        appended["questionCount"] = 6
        _write(root, appended)
        rc, out = run(root)
        expect("appending after the last pinned index is APPENDED, a refresh not a re-key",
               rc == 1 and "APPENDED  SP-09#2" in out and "MOVED" not in out)
        _write(root, clean)

        (root / PIN).unlink()
        rc, out = run(root)
        expect("a missing pin exits 2, never a pass", rc == 2 and "missing" in out)
        rc, out = run(root, update=True)
        expect("--update-fingerprints restores a deleted pin from trusted history", rc == 0 and (root / PIN).exists())
        (root / PIN).write_text('{"decks": []}', encoding="utf-8")
        rc, out = run(root)
        expect("a pin of the wrong shape exits 2", rc == 2)
        write_pin(root / PIN, pin_payload(clean, []))

        (root / SOURCE).write_text("{not json", encoding="utf-8")
        rc, out = run(root)
        expect("an unparsable deck file exits 2", rc == 2)
        _write(root, clean)
        (root / SNAPSHOT).unlink()
        rc, out = run(root)
        expect("a missing snapshot copy exits 2 (a lint that skips a file it was told to read is not a pass)",
               rc == 2)

    # The live sanity check needs only current bytes, as before. Netlify may have a
    # shallow release checkout with no origin/main; history enforcement belongs to
    # the direct verify.sh gate and CI's trusted PR-base invocation, not self-test.
    try:
        validator = load_schema(ROOT)
        live_data = {rel: _read_json(ROOT, rel) for rel in SCHEMA_TARGETS}
        errors = [line for rel, data in live_data.items()
                  for line in schema_findings(validator, data, rel) + semantic_findings(data, rel)]
        expect("the LIVE tree agrees with the committed pin",
               not errors and not diff_pin(load_pin(ROOT)["decks"], fingerprints_of(live_data[SOURCE])))
    except CheckError as exc:
        expect(f"the LIVE tree is readable: {exc}", False)
    print(f"self-test: {'FAIL ' + str(len(failed)) + ' case(s)' if failed else 'OK'} -- planted schema, semantic "
          f"and positional defects go red; a re-key needs the logged flag; the live tree is clean")
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=None, help="checkout to judge (default: this repository)")
    ap.add_argument("--update-fingerprints", action="store_true",
                    help=f"rewrite {PIN} from the current tree; refuses shifts unless --acknowledge-positional-id-breakage")
    ap.add_argument("--acknowledge-positional-id-breakage", metavar="REASON", default=None,
                    help="with --update-fingerprints: acknowledge MOVED/DELETED/DECK GONE and log the reason; does NOT migrate learner schedules")
    ap.add_argument("--base", help="trusted PR base commit; otherwise merge-base with CLERKSHIP_PR_BASE or origin/main")
    ap.add_argument("--self-test", action="store_true", help="prove every planted defect goes red")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if a.acknowledge_positional_id_breakage is not None and not a.update_fingerprints:
        print("--acknowledge-positional-id-breakage only means something with --update-fingerprints")
        return 2
    if a.acknowledge_positional_id_breakage is not None and not a.acknowledge_positional_id_breakage.strip():
        print("--acknowledge-positional-id-breakage needs a reason; it is written into the committed pin")
        return 2
    root = Path(a.root).resolve() if a.root else ROOT
    return check(root, update=a.update_fingerprints, rekey_reason=a.acknowledge_positional_id_breakage, base=a.base)


if __name__ == "__main__":
    sys.exit(main())
