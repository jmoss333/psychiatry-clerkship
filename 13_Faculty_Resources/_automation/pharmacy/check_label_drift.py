#!/usr/bin/env python3
"""DEV-ONLY (network): tell which pharmacy cards a newer DailyMed label has moved under.

The label receipt (verify_pharmacy_labels.py) records WHICH label each card was checked
against — a set id and an effective date — and validate_pharmacy.py holds every card to it
(AC2). Nothing notices when the manufacturer then publishes a new version: the card keeps
matching its receipt while the label it cites says something else. On 2026-10-03 the
buprenorphine card's source text missed a Dec 2024 FDA labeling change for exactly that
reason. This tool closes the gap in two steps.

    --pin   [--only ID ...] [--quotes FILE]
        Fetch the CURRENT SPL for each receipt agent and write label_pins.json: its version,
        effective date, and a hash of every content section (Boxed Warning, 1, 2.4, 5.3, ...).
        Optional quotes (label sentences a card leans on) are pinned with their section, dose
        literals masked, and must be present verbatim when pinned. Refuses an agent whose
        DailyMed label is already newer than its receipt — the card was checked against an
        older text, so pinning today's would hide exactly the drift this tool exists to find.

    (default) [--only ID ...] [--json]
        Ask DailyMed for each pinned label's current version. Unchanged: nothing to do. Newer:
        fetch it, re-hash its sections, and report which sections changed, which card fields
        draw on them, and whether every pinned quote still appears in its section.

    --offline
        No network. The pins agree with the committed receipt: every receipt agent is pinned
        (or listed under "unpinned" with a reason), each pin names the receipt's set id and
        effective date, and no pinned quote carries a dose literal. CI runs this.

Exit 0 nothing for a reviewer to do, 1 a card needs re-review (a content section changed, a
quote is gone, or a pin was refused), 2 could not check (network, a receipt agent with no
pin, a pin naming another set id). A version bump that changes no content section — a new
package label, a reformatted product table — exits 0 with a note to re-pin.
"""

import argparse
import datetime
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_pharmacy as vp  # noqa: E402  (the one AC4' rule masks pinned quotes)

RECEIPT = HERE / "label_receipt.json"
PINS = HERE / "label_pins.json"
PHARMACY = vp.PHARMACY
SPL_XML = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/%s.xml"
SPL_HISTORY = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/%s/history.json"
NS = {"v3": "urn:hl7-org:v3"}
HASH_CHARS = 16

BOXED = "BW"
# Sections that carry no clinical content a card draws on: the product data table and the
# carton/package panel change with every NDC or artwork revision.
SKIP_CODES = {"48780-1", "51945-4"}
# Card fields fed by each numbered top-level section ...
SECTION_FIELDS = {
    BOXED: ("boxedWarning",),
    "1": ("fdaIndications", "inpatientUses"),
    "2": ("dosing",),
    "3": ("dosing",),
    "4": ("flags",),
    "5": ("flags", "monitoring", "adverseEffects"),
    "6": ("adverseEffects",),
    "7": ("interactions",),
    "8": ("populations",),
    "10": ("flags",),
    "12": ("mechanism", "pk"),
}
# ... and, for older unnumbered labels, by the section's LOINC code.
LOINC_SECTION = {
    "34066-1": BOXED, "34067-9": "1", "34068-7": "2", "43678-2": "3", "34070-3": "4",
    "43685-7": "5", "34071-1": "5", "42232-9": "5", "34084-4": "6", "34073-7": "7",
    "43684-0": "8", "42228-7": "8", "34080-2": "8", "34081-0": "8", "34082-8": "8",
    "34088-5": "10", "34090-1": "12", "43679-0": "12", "43681-6": "12", "43682-4": "12",
}
NUMBERED = re.compile(r"^\s*(\d+(?:\.\d+)*)\.?\s+\S")


class CouldNotCheck(Exception):
    pass


def norm(text):
    return " ".join((text or "").split())


def quote_form(text):
    """How a quote is stored and compared: whitespace-normalised, dose literals masked."""
    return vp.mask_dose_literals(norm(text))


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:HASH_CHARS]


def fetch(url, attempts=4):
    """GET bytes; 404 is None. Transient errors retry with backoff, then raise."""
    request = urllib.request.Request(url, headers={"User-Agent": "clerkship-label-drift"})
    last = "no attempt"
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
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


def _section_key(section, top):
    """The key a section is reported under, or None when it folds into its parent.

    Keyed: the boxed warning (BW), every numbered section (by number), and an unnumbered
    TOP-LEVEL section (older labels: by its LOINC display name). An unnumbered NESTED section
    — an untitled paragraph block, "Absorption" under 12.3 — is part of its parent's text, so
    inserting one never renumbers anything else.
    """
    code_node = section.find("v3:code", NS)
    code = code_node.get("code") if code_node is not None else ""
    title_node = section.find("v3:title", NS)
    title = norm("".join(title_node.itertext())) if title_node is not None else ""
    numbered = NUMBERED.match(title)
    if code == "34066-1":
        return BOXED, code, title
    if numbered:
        return numbered.group(1), code, title
    if top:
        label = (code_node.get("displayName") if code_node is not None else "") or title
        return norm(label).upper() or "SECTION", code, title
    return None, code, title


def parse_spl(xml_bytes):
    """{setId, version, effectiveDate, sections: {key: {"code", "title", "text"}}}.

    A keyed section's text is its title plus its OWN body: a keyed child (2.4 under 2) is
    reported on its own, an unkeyed child is folded in, and the Highlights excerpt is left
    out (it restates the body and changes with it). The product data table and the package
    panel are skipped (SKIP_CODES).
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as error:
        raise CouldNotCheck("SPL does not parse: %s" % error)
    q = "{%s}" % NS["v3"]
    set_id = root.find("v3:setId", NS)
    version = root.find("v3:versionNumber", NS)
    effective = root.find("v3:effectiveTime", NS)
    body = root.find("v3:component/v3:structuredBody", NS)
    if set_id is None or version is None or effective is None or body is None:
        raise CouldNotCheck("SPL is missing setId, versionNumber, effectiveTime or a body")
    stamp = effective.get("value", "")
    sections = {}

    def own_text(node, parts):
        """Text of node's subtree, stopping at keyed sections, excerpts and titles."""
        for child in node:
            if child.tag == q + "section":
                key, code, _ = _section_key(child, top=False)
                if key is None and code not in SKIP_CODES:
                    own_text(child, parts)
            elif child.tag not in (q + "excerpt", q + "title"):
                if child.text:
                    parts.append(child.text)
                own_text(child, parts)
            if child.tail:
                parts.append(child.tail)

    def visit(section, top):
        key, code, title = _section_key(section, top)
        if code in SKIP_CODES:
            return
        if key is not None:
            parts = []
            own_text(section, parts)
            text = norm(title + " " + " ".join(parts))
            unique, n = key, 2
            while unique in sections:
                unique = "%s#%d" % (key, n)
                n += 1
            sections[unique] = {"code": code, "title": title, "text": text}
        for child in section.findall("v3:component/v3:section", NS):
            visit(child, top=False)

    for section in body.findall("v3:component/v3:section", NS):
        visit(section, top=True)
    return {
        "setId": set_id.get("root"),
        "version": int(version.get("value")),
        "effectiveDate": "%s-%s-%s" % (stamp[:4], stamp[4:6], stamp[6:8]),
        "sections": sections,
    }


def top_level(key, code=""):
    if key == BOXED:
        return BOXED
    if key[0].isdigit():
        return key.split(".")[0]
    return LOINC_SECTION.get(code)


def fields_for(keys, codes, record):
    """Card fields fed by the given section keys, limited to fields the card actually has."""
    present = set(record or {})
    fields = set()
    for key in keys:
        for field in SECTION_FIELDS.get(top_level(key, codes.get(key, "")), ()):
            if not record or field in present:
                fields.add(field)
    return sorted(fields)


def pin_entry(spl, quotes, today):
    entry = {
        "setId": spl["setId"],
        "version": spl["version"],
        "effectiveDate": spl["effectiveDate"],
        "pinnedOn": today,
        "sections": {k: digest(s["text"]) for k, s in sorted(spl["sections"].items())},
        # LOINC codes only where the key does not say which section it is (older labels)
        "codes": {k: s["code"] for k, s in sorted(spl["sections"].items())
                  if k != BOXED and not k[0].isdigit()},
        "quotes": [],
    }
    problems = []
    for quote in quotes:
        section, text = quote["section"], quote_form(quote["text"])
        body = spl["sections"].get(section)
        if body is None:
            problems.append("quote cites section %s, which this label does not have" % section)
        elif text not in quote_form(body["text"]):
            problems.append("quote not verbatim in section %s: %r" % (section, text[:70]))
        entry["quotes"].append({"section": section, "text": text})
    return entry, problems


def compare(pin, spl, record=None):
    """What moved between a pin and a newer SPL of the same set id."""
    before, after = pin["sections"], spl["sections"]
    now = {k: digest(s["text"]) for k, s in after.items()}
    changed = sorted(k for k in before if k in now and before[k] != now[k])
    removed = sorted(k for k in before if k not in now)
    added = sorted(k for k in now if k not in before)
    codes = dict(pin.get("codes", {}))
    codes.update({k: s["code"] for k, s in after.items()})
    broken = []
    for quote in pin.get("quotes", []):
        body = after.get(quote["section"])
        if body is None or quote["text"] not in quote_form(body["text"]):
            broken.append(quote)
    moved = changed + removed + added
    return {
        "fromVersion": pin["version"], "toVersion": spl["version"],
        "fromDate": pin["effectiveDate"], "toDate": spl["effectiveDate"],
        "changed": changed, "removed": removed, "added": added,
        "fields": fields_for(moved, codes, record),
        "quotesBroken": broken, "quotesPinned": len(pin.get("quotes", [])),
        "unmapped": sorted(k for k in moved if not fields_for([k], codes, None)),
        "needsReview": bool(fields_for(moved, codes, record) or broken),
    }


def latest_version(history_bytes, agent):
    """The newest spl_version in a DailyMed history.json ({"data": {"history": [...]}})."""
    try:
        data = json.loads(history_bytes).get("data")
        rows = data.get("history") if isinstance(data, dict) else None
        return max(int(row["spl_version"]) for row in rows)
    except (ValueError, TypeError, KeyError, AttributeError) as error:
        raise CouldNotCheck("%s: unreadable DailyMed history (%s)" % (agent, error))


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise CouldNotCheck("%s: %s" % (Path(path).name, error))


def records_by_id(path=PHARMACY):
    try:
        return {r["id"]: r for r in load_json(path).get("records", [])}
    except CouldNotCheck:
        return {}


def offline_check(receipt, pins):
    """(findings, could_not_check) — the pins agree with the receipt, no network."""
    findings, missing = [], []
    pinned, unpinned = pins.get("agents", {}), pins.get("unpinned", {})
    for agent, entry in sorted(receipt.get("agents", {}).items()):
        ref = entry.get("reference", {})
        if agent in unpinned:
            continue
        pin = pinned.get(agent)
        if pin is None:
            missing.append(agent)
            continue
        if pin.get("setId") != ref.get("setId"):
            missing.append("%s (pin names set id %s, receipt %s)" % (agent, pin.get("setId"), ref.get("setId")))
        elif pin.get("effectiveDate") != ref.get("effectiveDate"):
            findings.append("%s: pinned label dated %s, receipt %s — re-pin after re-verifying"
                            % (agent, pin.get("effectiveDate"), ref.get("effectiveDate")))
        for quote in pin.get("quotes", []):
            if vp.has_dose_literal(quote.get("text", "")):
                findings.append("%s: pinned quote in section %s carries a dose literal"
                                % (agent, quote.get("section")))
    for agent in sorted(set(pinned) | set(unpinned)):
        if agent not in receipt.get("agents", {}):
            findings.append("%s: pinned but not in the label receipt" % agent)
    return findings, missing


def do_pin(args, receipt, pins, get):
    today = datetime.date.today().isoformat()
    extra = load_json(args.quotes) if args.quotes else {}
    agents = receipt["agents"]
    wanted = args.only or sorted(agents)
    refused = []
    for agent in wanted:
        if agent not in agents:
            raise CouldNotCheck("not in the label receipt: %s" % agent)
        ref = agents[agent].get("reference", {})
        raw = get(SPL_XML % ref.get("setId"))
        if raw is None:
            raise CouldNotCheck("%s: DailyMed has no SPL for set id %s" % (agent, ref.get("setId")))
        spl = parse_spl(raw)
        if spl["setId"] != ref.get("setId"):
            raise CouldNotCheck("%s: DailyMed answered with set id %s" % (agent, spl["setId"]))
        if spl["effectiveDate"] != ref.get("effectiveDate"):
            reason = ("DailyMed label is dated %s, receipt %s: run verify_pharmacy_labels.py "
                      "--only %s, review the card against the new label, then pin"
                      % (spl["effectiveDate"], ref.get("effectiveDate"), agent))
            pins.setdefault("unpinned", {})[agent] = reason
            pins.get("agents", {}).pop(agent, None)
            refused.append(agent)
            print("REFUSED %-16s %s" % (agent, reason))
            continue
        quotes = extra.get(agent, [])
        if not quotes and agent in pins.get("agents", {}):
            quotes = pins["agents"][agent].get("quotes", [])
        entry, problems = pin_entry(spl, quotes, today)
        if problems:
            refused.append(agent)
            print("REFUSED %-16s %s" % (agent, "; ".join(problems)))
            continue
        pins.setdefault("agents", {})[agent] = entry
        pins.get("unpinned", {}).pop(agent, None)
        print("pinned  %-16s v%-3d %s  %d sections, %d quote(s)" % (
            agent, entry["version"], entry["effectiveDate"], len(entry["sections"]), len(entry["quotes"])))
        time.sleep(args.pause)
    pins["agents"] = dict(sorted(pins.get("agents", {}).items()))
    if pins.get("unpinned"):
        pins["unpinned"] = dict(sorted(pins["unpinned"].items()))
    else:
        pins.pop("unpinned", None)
    pins["schemaVersion"] = 1
    args.pins.write_text(json.dumps(pins, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote %s: %d pinned, %d unpinned" % (args.pins.name, len(pins["agents"]), len(pins.get("unpinned", {}))))
    return 1 if refused else 0


def do_check(args, receipt, pins, get):
    records = records_by_id()
    pinned = pins.get("agents", {})
    findings, missing = offline_check(receipt, pins)
    if missing:
        raise CouldNotCheck("receipt agent(s) with no usable pin: %s" % ", ".join(missing))
    wanted = args.only or sorted(pinned)
    report, review = [], []
    for agent in wanted:
        if agent not in pinned:
            raise CouldNotCheck("not pinned: %s" % agent)
        pin = pinned[agent]
        history = get(SPL_HISTORY % pin["setId"])
        if history is None:
            raise CouldNotCheck("%s: DailyMed has no history for set id %s" % (agent, pin["setId"]))
        current = latest_version(history, agent)
        if current == pin["version"]:
            report.append({"agent": agent, "status": "current", "version": current})
            continue
        spl = parse_spl(get(SPL_XML % pin["setId"]) or b"")
        result = compare(pin, spl, records.get(agent))
        result.update({"agent": agent, "status": "review" if result["needsReview"] else "moved"})
        report.append(result)
        if result["needsReview"]:
            review.append(agent)
        time.sleep(args.pause)
    for line in findings:
        print("NOTE " + line)
    if args.json:
        print(json.dumps({"examined": len(wanted), "needsReview": review, "agents": report}, indent=1))
    else:
        for row in report:
            if row["status"] == "current":
                continue
            print("%-8s %-16s v%d -> v%d (%s -> %s)" % (
                row["status"].upper(), row["agent"], row["fromVersion"], row["toVersion"],
                row["fromDate"], row["toDate"]))
            for name in ("changed", "added", "removed"):
                if row[name]:
                    print("           %-8s %s" % (name, ", ".join(row[name])))
            if row["fields"]:
                print("           re-review fields: %s" % ", ".join(row["fields"]))
            if row["quotesPinned"]:
                print("           quotes intact: %d/%d" % (row["quotesPinned"] - len(row["quotesBroken"]),
                                                       row["quotesPinned"]))
            if row["status"] == "moved":
                print("           no content section changed: re-pin with --pin --only %s" % row["agent"])
        print("label drift: examined %d/%d pinned label(s); %d current, %d to re-review, %d moved without content change"
              % (len(wanted), len(pinned), sum(r["status"] == "current" for r in report), len(review),
                 sum(r["status"] == "moved" for r in report)))
    return 1 if review or findings else 0


def main(argv=None, get=fetch):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--pin", action="store_true", help="pin the current label of each agent")
    mode.add_argument("--offline", action="store_true", help="check pins against the receipt, no network")
    parser.add_argument("--only", nargs="*", help="agent ids (default: all)")
    parser.add_argument("--quotes", type=Path, help="--pin: JSON {agent: [{section, text}]} to pin")
    parser.add_argument("--json", action="store_true", help="machine-readable report")
    parser.add_argument("--pause", type=float, default=0.3, help=argparse.SUPPRESS)
    parser.add_argument("--receipt", type=Path, default=RECEIPT, help=argparse.SUPPRESS)
    parser.add_argument("--pins", type=Path, default=PINS, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        receipt = load_json(args.receipt)
        pins = load_json(args.pins) if args.pins.exists() else {"schemaVersion": 1, "agents": {}}
        if args.pin:
            return do_pin(args, receipt, pins, get)
        if args.offline:
            findings, missing = offline_check(receipt, pins)
            for line in findings:
                print("FAIL " + line)
            if missing:
                print("could not check: receipt agent(s) with no usable pin: %s" % ", ".join(missing),
                      file=sys.stderr)
                return 2
            print("label pins: %d pinned, %d unpinned, %d receipt agent(s) — %s" % (
                len(pins.get("agents", {})), len(pins.get("unpinned", {})),
                len(receipt.get("agents", {})), "%d finding(s)" % len(findings) if findings else "OK"))
            return 1 if findings else 0
        return do_check(args, receipt, pins, get)
    except CouldNotCheck as error:
        print("could not check: %s" % error, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
