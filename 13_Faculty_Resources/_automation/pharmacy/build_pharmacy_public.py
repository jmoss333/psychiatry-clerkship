#!/usr/bin/env python3
"""Build the learner-facing pharmacy projection: pharmacy_public.json.

    python3 13_Faculty_Resources/_automation/pharmacy/build_pharmacy_public.py --out PATH
    python3 13_Faculty_Resources/_automation/pharmacy/build_pharmacy_public.py --summary

pharmacy.json is the internal registry, like reviewed.json. It carries every drug card,
reviewed or not, together with its provenance and its review hashes, and it never ships.
What ships is this projection, which build_deploy.py writes at deploy time (never committed,
so it cannot go stale). The rule it enforces is the one the pharmacy page and Daily Review
rely on:

    A drug appears only when its faculty review is VALID NOW: status "reviewed" AND the
    stored reviewedFieldsHash equals the hash of its J fields as they stand. A card edited
    after sign-off drops out on the next build, with no human needing to notice.

The RX# retrieval cards come from build_rx_deck.build() over the same admitted records, so
the ask cards keep their second gate (a valid retrievalHash). Each admitted drug exposes only
its display fields (the paths listed in provenance.fieldClasses) plus a review stamp. Hashes,
provenance, the ask-to-field mapping and the withheld list stay internal.
"""

import argparse
import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_rx_deck as deck  # noqa: E402
import validate_pharmacy as vp  # noqa: E402

SCHEMA_VERSION = 1
IDENTITY = ("id", "generic", "group", "safetyLevel")
LINKS = ("evidenceIds", "qbankIds")


def review_valid(record):
    """The one admission rule. Shared with build_rx_deck so the page and the deck agree."""
    return deck.j_review_valid(record)


def set_path(target, dotted, value):
    parts = dotted.split(".")
    for part in parts[:-1]:
        target = target.setdefault(part, {})
    target[parts[-1]] = copy.deepcopy(value)


def public_record(record):
    """Identity + every classified display field + a review stamp. Nothing else."""
    out = {key: record[key] for key in IDENTITY if key in record}
    for path in sorted(record.get("provenance", {}).get("fieldClasses", {})):
        value = vp.get_path(record, path)
        if value is not None:
            set_path(out, path, value)
    for key in LINKS:
        if record.get(key):
            out[key] = list(record[key])
    review = record["facultyReview"]
    out["review"] = {"reviewer": review["reviewer"], "lastReviewed": review["lastReviewed"]}
    return out


def project(pharmacy):
    records = sorted(pharmacy.get("records", []), key=lambda r: r["id"])
    admitted = [r for r in records if review_valid(r)]
    cards = deck.build({"records": admitted})["cards"]
    agents = [public_record(r) for r in admitted]
    projection = {
        "schemaVersion": SCHEMA_VERSION,
        "description": "Derived at build time by build_pharmacy_public.py from pharmacy.json. "
                       "Only drugs whose faculty review is valid appear. Do not edit.",
        "agents": agents,
        "cards": cards,
        "pendingCount": len(records) - len(admitted),
    }
    problems = verify(projection, pharmacy)
    if problems:
        raise ValueError("pharmacy projection failed its own check: " + "; ".join(problems))
    return projection


def verify(projection, pharmacy):
    """Re-derive admission from the source and prove the projection honours it.

    Called by project() on every build and by the tests; build_deploy.py also calls it on
    the bytes it wrote. Returns a list of problems (empty = sound)."""
    source = {r["id"]: r for r in pharmacy.get("records", [])}
    agents = {a.get("id"): a for a in projection.get("agents", [])}
    problems = []
    for aid in agents:
        record = source.get(aid)
        if record is None:
            problems.append("%s is not in pharmacy.json" % aid)
        elif not review_valid(record):
            problems.append("%s is shown but its review is not valid" % aid)
    for card in projection.get("cards", []):
        drug = card.get("drug")
        if drug not in agents:
            problems.append("%s belongs to a drug that is not shown" % card.get("id"))
        elif card.get("kind") == "ask" and not vp.retrieval_reviewed(source[drug]):
            problems.append("%s is an ask card without a valid mapping review" % card.get("id"))
    text = json.dumps(projection, ensure_ascii=False)
    for leaked in ("reviewedFieldsHash", "retrievalHash", "provenance", "fieldClasses"):
        if leaked in text:
            problems.append("internal field %s leaked into the projection" % leaked)
    if vp.DOSE_RE.search(text):
        problems.append("dose literal in the projection")
    return problems


def feed_bytes(root=None):
    """The exact bytes build_deploy.py ships, from the registry at `root` (default: this repo).
    teaching_dependencies.py compares a finished build against this, byte for byte."""
    path = Path(root) / "pharmacy.json" if root is not None else vp.PHARMACY
    pharmacy = json.loads(path.read_text(encoding="utf-8"))
    text = json.dumps(project(pharmacy), ensure_ascii=False, indent=1) + "\n"
    return text.encode("utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", help="write the projection here")
    parser.add_argument("--summary", action="store_true", help="print what would ship")
    args = parser.parse_args(argv)
    pharmacy = json.loads(vp.PHARMACY.read_text(encoding="utf-8"))
    projection = project(pharmacy)
    if args.out:
        Path(args.out).write_bytes(feed_bytes())
    print("pharmacy_public: %d drug(s) shown, %d card(s), %d pending review" % (
        len(projection["agents"]), len(projection["cards"]), projection["pendingCount"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
