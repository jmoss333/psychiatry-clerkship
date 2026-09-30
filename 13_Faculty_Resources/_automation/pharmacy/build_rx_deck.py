#!/usr/bin/env python3
"""Derive the RX# retrieval deck from pharmacy.json. Deterministic; no network.

    python3 13_Faculty_Resources/_automation/pharmacy/build_rx_deck.py            # write
    python3 13_Faculty_Resources/_automation/pharmacy/build_rx_deck.py --check    # gate

Every card REVEALS only text already on an attested drug card, copied verbatim; the deck
introduces no clinical wording, which is why it needs no attestation of its own (the same
contract site_build/fam_retrieval.js states for FAM# cards). Two kinds of card:

  default  the five generic prompts in DEFAULT_PROMPTS, emitted for every record whose J-field
           review is valid (facultyReview reviewed AND reviewedFieldsHash matches). A prompt
           whose field is absent on that card is dropped, never shown empty.
  ask      one card per record.retrieval entry — an attendingAsks question answered by the
           fields it maps to. Emitted only when BOTH the J review and the mapping review
           (facultyReview.retrievalHash) are valid: which field answers which question is a
           judgment, so it has its own gate.

Asks with no mapping are listed in `unmapped` — content gaps for faculty, not cards.
Card ids are RX#<drug>#<prompt>; the prompt id is stable forever once shipped, because a
learner's schedule is keyed on it (see site_build/srs_store.js).

Exit (--check): 0 committed deck is current, 1 stale, 2 could not check.
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_pharmacy as vp  # noqa: E402

DECK = HERE / "rx_deck.json"

# Generic scaffolding, like FAM_DEFAULT_RETRIEVAL: the prompt is pedagogy, the reveal is the
# card's own attested text. Ids are stable once shipped.
DEFAULT_PROMPTS = (
    ("boxed", "What does the boxed warning cover?", ["boxedWarning.summary"]),
    ("baseline", "Name the baseline workup before the first dose.", ["monitoring.baseline"]),
    ("ongoing", "What gets monitored once it is running?", ["monitoring.ongoing"]),
    ("danger", "Name the dangerous adverse effects, and how you would recognize each.",
     ["adverseEffects.dangerous"]),
    ("traps", "Name the interaction traps.", ["interactions.keyTraps"]),
)

LABELS = {
    "boxedWarning.summary": "Boxed warning",
    "monitoring.baseline": "Baseline",
    "monitoring.ongoing": "Ongoing monitoring",
    "adverseEffects.dangerous": "Dangerous adverse effects",
    "interactions.keyTraps": "Interaction traps",
    "pearls.t1": "Pearl",
    "pearls.t2": "Pearl (resident)",
    "dosing.titration": "Titration",
    "pk.timeToEffect": "Time to effect",
    "inpatientUses": "Inpatient use",
}


def label_for(path):
    base = path.split("[")[0]
    for key, text in LABELS.items():
        if base == key or base.startswith(key + "."):
            return text
    return base


def as_lines(value):
    """A field value as display lines, verbatim. Objects render their fields in order."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(as_lines(item))
        return out
    if isinstance(value, dict):
        if "name" in value:
            parts = [value["name"]] + [value[k] for k in ("recognize", "firstMove") if value.get(k)]
            return [" — ".join(parts)]
        if "use" in value:
            return [value["use"]]
        return ["%s: %s" % (k, v) for k, v in value.items() if isinstance(v, str)]
    return [str(value)]


def reveal(record, paths):
    out = []
    for path in paths:
        value = vp.resolve(record, path)
        if value in (None, "", [], {}):
            return None
        out.append({"label": label_for(path), "from": path, "lines": as_lines(value)})
    return out


def j_review_valid(record):
    review = record.get("facultyReview", {})
    return review.get("status") == "reviewed" and review.get("reviewedFieldsHash") == vp.j_hash(record)


def build(pharmacy):
    cards, unmapped, withheld = [], [], []
    for record in sorted(pharmacy.get("records", []), key=lambda r: r["id"]):
        rid = record["id"]
        mapped = {entry["askIndex"] for entry in record.get("retrieval", [])}
        for index, ask in enumerate(record.get("attendingAsks", [])):
            if index not in mapped:
                unmapped.append({"drug": rid, "askIndex": index, "ask": ask})
        if not j_review_valid(record):
            withheld.append({"drug": rid, "reason": "J fields not reviewed (or changed since)"})
            continue
        head = {"drug": rid, "generic": record["generic"], "group": record["group"]}
        for pid, prompt, paths in DEFAULT_PROMPTS:
            body = reveal(record, paths)
            if body:
                cards.append(dict(head, id="RX#%s#%s" % (rid, pid), kind="default",
                                  prompt=prompt, reveal=body))
        if not vp.retrieval_reviewed(record):
            if record.get("retrieval"):
                withheld.append({"drug": rid, "reason": "ask mapping not reviewed (or changed since)"})
            continue
        for entry in record["retrieval"]:
            body = reveal(record, entry["revealFrom"])
            if body:
                cards.append(dict(head, id="RX#%s#%s" % (rid, entry["id"]), kind="ask",
                                  prompt=record["attendingAsks"][entry["askIndex"]], reveal=body))
    return {
        "schemaVersion": 1,
        "description": "Derived by build_rx_deck.py from pharmacy.json. Do not edit by hand.",
        "cards": cards,
        "withheld": withheld,
        "unmapped": unmapped,
    }


def render(deck):
    return json.dumps(deck, indent=2, ensure_ascii=False) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="fail if the committed deck is stale")
    parser.add_argument("--pharmacy", type=Path, default=vp.PHARMACY, help=argparse.SUPPRESS)
    parser.add_argument("--deck", type=Path, default=DECK, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    pharmacy, error = vp.load(args.pharmacy)
    if error:
        print("could not check: %s" % error, file=sys.stderr)
        return 2
    text = render(build(pharmacy))
    deck = json.loads(text)
    summary = "%d card(s) (%d default, %d ask); %d withheld; %d ask(s) with no mapped answer" % (
        len(deck["cards"]), sum(c["kind"] == "default" for c in deck["cards"]),
        sum(c["kind"] == "ask" for c in deck["cards"]), len(deck["withheld"]), len(deck["unmapped"]))
    if args.check:
        current = args.deck.read_text(encoding="utf-8") if args.deck.exists() else None
        if current != text:
            print("rx deck STALE — run build_rx_deck.py (%s)" % summary)
            return 1
        print("rx deck current — %s" % summary)
        return 0
    args.deck.write_text(text, encoding="utf-8")
    print("wrote %s — %s" % (args.deck.name, summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
