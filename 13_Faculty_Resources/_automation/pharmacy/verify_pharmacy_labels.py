#!/usr/bin/env python3
"""DEV-ONLY (network): verify pharmacy label facts and write a committed receipt.

NOT part of the build. The build runner's egress does not reach these hosts, and a label
lookup is a fact about the world on a date, so it is captured once as a receipt that the
offline validator (validate_pharmacy.py) then holds pharmacy.json to (AC2, AC3).

    python3 13_Faculty_Resources/_automation/pharmacy/verify_pharmacy_labels.py [--only ID ...]

For each agent in label_sources.json it records:
  * RxNorm: the ingredient RxCUI and its term type (must be IN or PIN) — RxNav REST;
  * openFDA: every SPL whose generic name matches, how many carry a boxed warning (the
    agreement count), and one REFERENCE label (the configured brand with an ORAL route, else
    the most recent ORAL label) with its set id, effective date and boxed-warning lead;
  * DailyMed: that the reference set id resolves.

It writes ONLY label_receipt.json beside this file, and only the agents it checked (others
are carried over unchanged). Label text is stored as short leads with dose literals masked:
the receipt is evidence for a reviewer, not a copy of the label.

Exit: 0 all checked agents verified, 1 a check failed (unresolvable name, no label, set id
does not resolve), 2 could not check (network or config).
"""

import argparse
import datetime
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_pharmacy as vp  # noqa: E402  (one AC4' rule: vp.mask_dose_literals)

SOURCES = HERE / "label_sources.json"
RECEIPT = HERE / "label_receipt.json"

RXNAV = "https://rxnav.nlm.nih.gov/REST"
OPENFDA = "https://api.fda.gov/drug/label.json"
DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/%s/history.json"
PAGE = 100


class CouldNotCheck(Exception):
    pass


def get_json(url, params=None, attempts=4):
    """GET JSON; 404 is None. Transient network errors are retried with backoff, then raise."""
    if params:
        url = "%s?%s" % (url, urllib.parse.urlencode(params))
    request = urllib.request.Request(url, headers={"User-Agent": "clerkship-pharmacy-verifier"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if error.code < 500 and error.code != 429:
                raise CouldNotCheck("%s -> HTTP %s" % (url, error.code))
            last = "HTTP %s" % error.code
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = str(error)
        time.sleep(2 ** attempt)
    raise CouldNotCheck("%s -> %s (after %d attempts)" % (url, last, attempts))


def lead(text, limit=240):
    clean = " ".join((text or "").split())
    clean = vp.mask_dose_literals(clean)
    return clean[:limit]


def brands_seen(labels, generic_names):
    """Distinct brand names across every matched SPL, minus the generic names themselves."""
    generic = {g.upper() for g in generic_names}
    seen = {}
    for row in labels.values():
        for brand in row.get("openfda", {}).get("brand_name", []):
            key = brand.upper()
            if key not in generic and not any(key.startswith(g) for g in generic):
                seen.setdefault(key, brand)
    return sorted(seen.values(), key=str.upper)


def indications_lead(row):
    """Section 1 when the SPL is structured; else the first 'indicated' passage anywhere.

    Older unstructured labels (LITHOBID's, for one) carry indications inside
    spl_unclassified_section, so a structured-only read would record an empty string and
    the reviewer would see nothing to check against.
    """
    if row.get("indications_and_usage"):
        return lead(row["indications_and_usage"][0], 2000)
    for key in sorted(row):
        values = row[key]
        if not isinstance(values, list) or not values or not isinstance(values[0], str):
            continue
        text = " ".join(values)
        at = text.find("indicated")
        if at >= 0:
            return "[from %s] %s" % (key, lead(text[max(0, at - 160):], 2000))
    return ""


def rxnorm(name):
    data = get_json("%s/rxcui.json" % RXNAV, {"name": name, "search": "0"}) or {}
    ids = data.get("idGroup", {}).get("rxnormId") or []
    if len(ids) != 1:
        return {"name": name, "rxcui": None, "tty": None, "problem": "ids=%r" % ids}
    props = (get_json("%s/rxcui/%s/properties.json" % (RXNAV, ids[0])) or {}).get("properties", {})
    tty = props.get("tty")
    problem = None if tty in ("IN", "PIN") else "term type %r is not an ingredient" % tty
    return {"name": props.get("name", name), "rxcui": ids[0], "tty": tty, "problem": problem}


def labels_for(generic_names):
    found = {}
    for generic in generic_names:
        skip = 0
        while True:
            query = 'openfda.generic_name.exact:"%s"' % generic
            data = get_json(OPENFDA, {"search": query, "limit": PAGE, "skip": skip})
            if not data:
                break
            for row in data["results"]:
                found[row["set_id"]] = row
            total = data["meta"]["results"]["total"]
            skip += PAGE
            if skip >= total:
                break
    return found


def pick_reference(labels, brand, route="ORAL"):
    def oral(row):
        return route in (row.get("openfda", {}).get("route") or [])

    candidates = [row for row in labels.values() if oral(row)]
    if brand:
        branded = [
            row for row in candidates
            if brand.upper() in [b.upper() for b in row.get("openfda", {}).get("brand_name", [])]
        ]
        if branded:
            candidates = branded
    candidates.sort(key=lambda row: (row.get("effective_time", ""), row["set_id"]), reverse=True)
    return candidates[0] if candidates else None


def verify(agent_id, source):
    rx = rxnorm(source["rxnormName"])
    labels = labels_for(source["openfdaGenericNames"])
    brand = source.get("referenceBrand")
    if brand:
        # The brand label may list a salt-free generic name; fetch it by brand too.
        data = get_json(OPENFDA, {"search": 'openfda.brand_name:"%s"' % brand, "limit": PAGE})
        for row in (data or {}).get("results", []):
            labels.setdefault(row["set_id"], row)
    ref = pick_reference(labels, brand, source.get("route", "ORAL"))
    problems = [rx["problem"]] if rx["problem"] else []
    entry = {
        "rxnorm": {k: rx[k] for k in ("name", "rxcui", "tty")},
        "openfda": {
            "genericNames": source["openfdaGenericNames"],
            "labelsMatched": len(labels),
            "labelsWithBoxedWarning": sum(1 for row in labels.values() if row.get("boxed_warning")),
        },
    }
    if not ref:
        problems.append("no %s label found" % source.get("route", "ORAL"))
    else:
        effective = ref.get("effective_time", "")
        entry["reference"] = {
            "setId": ref["set_id"],
            "effectiveDate": "%s-%s-%s" % (effective[:4], effective[4:6], effective[6:8]),
            "brand": (ref.get("openfda", {}).get("brand_name") or [None])[0],
            "manufacturer": (ref.get("openfda", {}).get("manufacturer_name") or [None])[0],
            "chosenBy": "referenceBrand" if brand and brand.upper() in [
                b.upper() for b in ref.get("openfda", {}).get("brand_name", [])
            ] else "latest-oral",
            "boxedWarningPresent": bool(ref.get("boxed_warning")),
            "boxedWarningLead": lead((ref.get("boxed_warning") or [""])[0]),
            "indicationsLead": indications_lead(ref),
            "brandsSeen": brands_seen(labels, source["openfdaGenericNames"]),
            "dailymedResolves": get_json(DAILYMED % ref["set_id"]) is not None,
        }
        if not entry["reference"]["dailymedResolves"]:
            problems.append("DailyMed does not resolve set id %s" % ref["set_id"])
    entry["problems"] = problems
    return entry


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--only", nargs="*", help="agent ids to check (default: all)")
    args = parser.parse_args(argv)
    try:
        sources = json.loads(SOURCES.read_text(encoding="utf-8"))["agents"]
    except (OSError, ValueError, KeyError) as error:
        print("could not check: %s" % error, file=sys.stderr)
        return 2
    wanted = args.only or sorted(sources)
    unknown = [a for a in wanted if a not in sources]
    if unknown:
        print("could not check: not in label_sources.json: %s" % unknown, file=sys.stderr)
        return 2

    receipt = {"schemaVersion": 1, "agents": {}}
    if RECEIPT.exists():
        receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    today = datetime.date.today().isoformat()
    failed = []
    for agent_id in wanted:
        try:
            entry = verify(agent_id, sources[agent_id])
        except CouldNotCheck as error:
            print("could not check %s: %s" % (agent_id, error), file=sys.stderr)
            return 2
        entry["verifiedOn"] = today
        receipt["agents"][agent_id] = entry
        ref = entry.get("reference", {})
        print("%-12s rxcui %-7s %s | %d labels, %d boxed | ref %s %s (%s) boxed=%s dailymed=%s%s" % (
            agent_id, entry["rxnorm"]["rxcui"], entry["rxnorm"]["tty"],
            entry["openfda"]["labelsMatched"], entry["openfda"]["labelsWithBoxedWarning"],
            ref.get("brand"), ref.get("effectiveDate"), ref.get("chosenBy"),
            ref.get("boxedWarningPresent"), ref.get("dailymedResolves"),
            "  PROBLEMS: %s" % entry["problems"] if entry["problems"] else ""))
        if entry["problems"]:
            failed.append(agent_id)
    receipt["agents"] = dict(sorted(receipt["agents"].items()))
    RECEIPT.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote %s" % RECEIPT.name)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
