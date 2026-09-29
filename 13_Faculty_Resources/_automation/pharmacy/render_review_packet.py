#!/usr/bin/env python3
"""Render a faculty review packet (Markdown) for pharmacy.json records. Report-only.

    python3 13_Faculty_Resources/_automation/pharmacy/render_review_packet.py [ID ...] > packet.md

Ordered for the reviewer's time, not the schema's: each drug opens with the decisions only
faculty can make (upstream discrepancies, then authored fields with no attested source),
then the label facts the script verified, then every J/E field beside the verbatim quote it
was drawn from. Deterministic: the same inputs produce byte-identical output.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_pharmacy as vp  # noqa: E402


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


def render(records, receipt):
    out = ["# Pharmacy review packet", ""]
    out.append("Records: %s. Every quote below was machine-checked verbatim against the cited "
               "attested page (`validate_pharmacy.py` SPAN), and every label fact against the "
               "label receipt (AC2/AC3). What is left for you is judgment." % ", ".join(
                   r["id"] for r in records))
    out.append("")
    for record in records:
        prov = record["provenance"]
        entry = receipt["agents"].get(prov.get("labelReceipt", record["id"]), {})
        ref = entry.get("reference", {})
        out += ["---", "", "## %s (%s)" % (record["generic"], record["id"]), ""]
        out.append("Safety level **%s** · review status **%s** · J-field hash `%s`" % (
            record["safetyLevel"], record["facultyReview"]["status"], vp.j_hash(record)[:12]))
        out.append("")
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
    sys.stdout.write(render(records, receipt))
    return 0


if __name__ == "__main__":
    sys.exit(main())
