#!/usr/bin/env python3
"""Render a faculty review packet (Markdown) for pharmacy.json records. Report-only.

    python3 13_Faculty_Resources/_automation/pharmacy/render_review_packet.py [ID ...] > packet.md

Ordered for the reviewer's time, not the schema's: each drug opens with the decisions only
faculty can make (upstream discrepancies, then authored fields with no attested source),
then the label facts the script verified, then every J/E field beside the verbatim quote it
was drawn from. Deterministic: the same inputs produce byte-identical output.

When the label-drift ledger (check_label_drift.py --record) shows a drug's label moved after
the card's last review, the drug opens with section 0: the changed label sections as a word
diff against the exact text that was pinned. The packet also says when the ledger is missing
or stale, so an absent section 0 is never read as "the label did not change". Label text is
shown unmasked: this packet is faculty-only and never committed, and a dose change is often
the change.
"""

import datetime
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_pharmacy as vp  # noqa: E402
import check_label_drift as drift  # noqa: E402  (ledger, review predicate, diff rendering)

LEDGER_STALE_DAYS = 14


def cell(value):
    if value is None or value in ({}, []):
        return "—"
    if isinstance(value, list):
        if value and isinstance(value[0], dict):
            return "<br>".join(
                "**%s** — %s" % (v.get("name") or v.get("use"), "; ".join(
                    "%s: %s" % (k, v[k]) for k in v if k not in ("name", "use"))) for v in value)
        return "; ".join(str(v) for v in value)
    if isinstance(value, dict):
        return "<br>".join("%s: %s" % (k, cell(v)) for k, v in value.items())
    return str(value).replace("|", "\\|")


def ledger_line(ledger, today):
    """One honest line on whether label changes since review were checked at all."""
    if ledger is None:
        return ("**Label drift: not checked on this machine** (no ledger). Changes to a "
                "drug's DailyMed label since its review are not shown below; run "
                "`check_label_drift.py --record`.")
    last = ledger.get("lastChecked")
    if not last:
        return "**Label drift: never checked over every pinned label.** Changes may be missing below."
    age = (today - datetime.date.fromisoformat(last)).days
    if age > LEDGER_STALE_DAYS:
        return ("**Label drift: last full check %s (%d days ago).** Changes since then are "
                "not shown below." % (last, age))
    return "Label drift: last full check %s." % last


def label_changes(record, ledger):
    """Section 0: the label text that moved since this card's review, as a word diff."""
    drifts = drift.drifts_since_review(ledger, record)
    if not drifts:
        return []
    reviewed = (record.get("facultyReview") or {}).get("lastReviewed")
    out = ["### 0. Label changed since %s" % ("your review on %s" % reviewed if reviewed
                                              else "this card was drafted"), ""]
    for row in drifts:
        out.append("Label v%s (%s) → v%s (%s), observed %s. Card fields to re-review: %s." % (
            row["fromVersion"], row["fromDate"], row["toVersion"], row["toDate"],
            row["observedOn"], ", ".join(row.get("fields") or []) or "none mapped"))
        out.append("")
        if row.get("texts"):
            out += drift.render_texts(row["texts"])
        else:
            out += ["Text not captured; `check_label_drift.py --diff %s` shows it." % row["agent"], ""]
    return out


def render(records, receipt, ledger=None, today=None):
    out = ["# Pharmacy review packet", ""]
    out.append("Records: %s. Every quote below was machine-checked verbatim against the cited "
               "attested page (`validate_pharmacy.py` SPAN), and every label fact against the "
               "label receipt (AC2/AC3). What is left for you is judgment." % ", ".join(
                   r["id"] for r in records))
    out.append("")
    out.append(ledger_line(ledger, today or datetime.date.today()))
    out.append("")
    for record in records:
        prov = record["provenance"]
        entry = receipt["agents"].get(prov.get("labelReceipt", record["id"]), {})
        ref = entry.get("reference", {})
        out += ["---", "", "## %s (%s)" % (record["generic"], record["id"]), ""]
        out.append("Safety level **%s** · review status **%s** · J-field hash `%s`" % (
            record["safetyLevel"], record["facultyReview"]["status"], vp.j_hash(record)[:12]))
        out.append("")
        out += label_changes(record, ledger)
        out.append("### 1. Decide")
        out.append("")
        if prov.get("upstreamDiscrepancies"):
            out.append("| ReConnect field | Upstream says | Card uses | Basis |")
            out.append("|---|---|---|---|")
            for d in prov["upstreamDiscrepancies"]:
                out.append("| %s | %s | %s | %s |" % (
                    d["field"], cell(d["upstreamValue"]), cell(d["usedValue"]), cell(d["basis"])))
            out.append("")
        out.append("**Authored with no attested source (read these closely):** %s" % ", ".join(
            "`%s`" % a for a in prov.get("authoredFields", [])))
        out.append("")
        out.append("### 2. Label facts (script-verified %s)" % entry.get("verifiedOn", "?"))
        out.append("")
        out.append("| Item | Value |")
        out.append("|---|---|")
        out.append("| RxNorm | %s (%s, %s) |" % (
            entry.get("rxnorm", {}).get("rxcui"), entry.get("rxnorm", {}).get("name"),
            entry.get("rxnorm", {}).get("tty")))
        out.append("| Reference label | [%s · %s](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=%s) — %s, chosen by %s |" % (
            ref.get("brand"), ref.get("effectiveDate"), ref.get("setId"),
            ref.get("manufacturer"), ref.get("chosenBy")))
        out.append("| Boxed warning | present on reference; %d of %d matched labels carry one |" % (
            entry.get("openfda", {}).get("labelsWithBoxedWarning", 0),
            entry.get("openfda", {}).get("labelsMatched", 0)))
        out.append("| Brands seen in openFDA | %s |" % cell(ref.get("brandsSeen")))
        out.append("")
        out.append("> **Label indications (lead):** %s" % ref.get("indicationsLead", "")[:900])
        out.append("")
        out.append("### 3. Card fields")
        out.append("")
        out.append("| Field | Class | Value | Drawn from |")
        out.append("|---|---|---|---|")
        sources = prov.get("jSources", {})
        for path, cls in sorted(prov["fieldClasses"].items()):
            value = vp.get_path(record, path)
            if value is None:
                continue
            quotes = [s for key, group in sources.items()
                      if path == key or path.startswith(key + ".") for s in group]
            authored = [a for a in prov.get("authoredFields", [])
                        if a.split("[")[0] == path or a.split("[")[0].startswith(path + ".")
                        or path.startswith(a.split("[")[0] + ".")]
            parts = ["*%s*: “%s”" % (s["page"].split("/")[-1], cell(s["quote"])[:220]) for s in quotes]
            if authored:
                parts.append("**authored:** %s" % ", ".join("`%s`" % a for a in authored))
            drawn = "<br>".join(parts) or {"L": "label receipt", "R": "ReConnect (hash-pinned)"}.get(cls, "—")
            out.append("| `%s` | %s | %s | %s |" % (path, cls, cell(value), drawn))
        out.append("")
        if record.get("retrieval") is not None or record.get("attendingAsks"):
            out.append("### 4. Flashcard mapping (gate G1b: which approved field answers each ask)")
            out.append("")
            out.append("| Ask | Revealed from | Card back (verbatim) |")
            out.append("|---|---|---|")
            by_index = {e["askIndex"]: e for e in record.get("retrieval", [])}
            for index, ask in enumerate(record.get("attendingAsks", [])):
                entry = by_index.get(index)
                if not entry:
                    out.append("| %s | **unmapped — no approved answer on the card** | — |" % cell(ask))
                    continue
                back = "<br>".join(cell(vp.resolve(record, p)) for p in entry["revealFrom"])
                out.append("| %s | %s | %s |" % (cell(ask), ", ".join("`%s`" % p for p in entry["revealFrom"]), back))
            out.append("")
            out.append("Mapping hash `%s` · %s" % (vp.retrieval_hash(record)[:12],
                "reviewed" if vp.retrieval_reviewed(record) else "pending"))
            out.append("")
        out.append("Linked: evidence %s · questions %s" % (
            ", ".join(record.get("evidenceIds", [])) or "—",
            ", ".join(record.get("qbankIds", [])) or "—"))
        out.append("")
    return "\n".join(out) + "\n"


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    pharmacy = json.loads(vp.PHARMACY.read_text(encoding="utf-8"))
    receipt = json.loads(vp.RECEIPT.read_text(encoding="utf-8"))
    records = [r for r in pharmacy["records"] if not argv or r["id"] in argv]
    try:
        ledger = json.loads(drift.ledger_path().read_text(encoding="utf-8"))
    except FileNotFoundError:
        ledger = None
    sys.stdout.write(render(records, receipt, ledger))
    return 0


if __name__ == "__main__":
    sys.exit(main())
