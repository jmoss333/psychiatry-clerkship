#!/usr/bin/env python3
"""Validate care-inserts.v1.json - the standard inserts of the Care aftercare packet.

Runs in the build gate. The file holds patient-facing helpline numbers and advice that will be
printed and sent home, so this checks what a JSON Schema cannot: that every number carries a real,
non-future verification date and an official source; that nothing is stale without saying so; that
crisis contacts are REFERENCED from crisis_resources.json (the single source) and resolve to the
two numbers the packet must always carry; that no crisis number, phone number, dose literal or
verification metadata is typed into prose; and that the inserts are present, unique, in print
order, and not empty.

Prose may say "call 911" without typing it: `{{crisis:emergency_911}}` is replaced at render time
by that resource's contact string from crisis_resources.json. Every scan runs on NORMALISED text
(NFKC, zero-width characters dropped, every dash a hyphen) so a number pasted from a web page or a
Word file cannot hide behind a non-breaking hyphen.

Freshness is a warning, not a failure: a number a day over the limit must not block a safety
deploy. `--strict` turns warnings into a failure for a deliberate pre-release check.

Exit 0 clean (warnings allowed), 1 a hard problem or, with --strict, any warning.
"""

import argparse
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

try:
    from jsonschema import Draft7Validator
except ImportError:  # pragma: no cover - only before dependency installation
    Draft7Validator = None

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "13_Faculty_Resources" / "_automation" / "site_build" / "data"
DATA = DATA_DIR / "care-inserts.v1.json"
SCHEMA = DATA_DIR / "care-inserts.v1.schema.json"
CRISIS = ROOT / "crisis_resources.json"

# A helpline number older than this was last checked too long ago to print without a re-check.
# Same window the crisis snapshot uses before its own staleness is reported.
STALE_AFTER_DAYS = 180

# No real verification predates this: it is a sentinel ("1970-01-01") standing in for "never".
EARLIEST_VERIFICATION = date(2026, 1, 1)

# Print order of the inserts. The array must contain every id exactly once, in this order.
PRINT_ORDER = ("intro", "week", "callback", "warning", "safety", "family",
               "national", "insurance", "meds", "rights", "card", "notes")

# The welcome insert carries the unit phone and is the one insert that may never be switched off.
ALWAYS_ON = ("intro",)

# Inserts whose whole job is a table of numbers; an empty one would print a heading over nothing.
TABLE_INSERTS = ("national", "insurance")

# The packet must always be able to print these two lines. Keyed by resource id in
# crisis_resources.json, with the number the resolved contact must contain, so a silent
# transcription error in the crisis source also fails here.
REQUIRED_CRISIS = {
    "lifeline_988": ("988", re.compile(r"\b988\b")),
    "maine_crisis_line": ("1-888-568-1112", re.compile(r"\b1-888-568-1112\b")),
}

# Aggregators and directories are not acceptable provenance for a helpline number.
DISALLOWED_SOURCE_HOSTS = ("wikipedia.org", "healthline.com", "webmd.com", "psychologytoday.com")

PLAIN_PLACEHOLDERS = ("unitName", "unitPhone")
PLACEHOLDER_RE = re.compile(r"\{\{([^{}]*)\}\}")
CRISIS_PLACEHOLDER_RE = re.compile(r"crisis:([a-z0-9_]+)")

# Dose literals are banned on learner surfaces (Option A). The house pattern (mg/mcg/mL with one
# optional space) is the floor; this adds the spellings an editor actually types: "5-mg",
# "five milligrams", "10 µg", "2 grams", "20 mEq", and counts of tablets, pills and capsules.
DOSE_UNITS = (r"(?:mgs?|mcgs?|[µμu]g|g|gm|grams?|mls?|cc|iu|meq|milligrams?|micrograms?|"
              r"millilit(?:er|re)s?)")
DOSE_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*-?\s*" + DOSE_UNITS + r"(?!\w)", re.I)
DOSE_WORD_RE = re.compile(r"\b(?:milligram|microgram|millilit(?:er|re))s?\b", re.I)
DOSE_COUNT_RE = re.compile(
    r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|half)\s+(?:tablets?|pills?|capsules?)\b", re.I)
# Verification metadata and review tiers are an internal record and are never printed. This is the
# acceptance-criterion pattern (AC5) exactly, so data that passes here cannot fail AC5 later.
METADATA_RE = re.compile(r"Verification due|verifiedDate|reviewAfter|L[1-4]\b", re.I)
# Seven or more digits joined only by separators is a phone number, in any format or script.
PHONE_RE = re.compile(r"(?<!\d)\d(?:[\s\-./()]*\d){6,}(?!\d)")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CRISIS_SHORT_CODE_MAX = 4
CRISIS_SHORT_SEPARATORS = r"[ .\-]"
# North American numbers: area code and exchange start 2-9; three-digit services are N11.
NANP_TEN_RE = re.compile(r"^[2-9]\d\d[2-9]\d\d\d{4}$")
NANP_N11_RE = re.compile(r"^[2-9]11$")


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.stats = {}


def parse_iso(text):
    """A real calendar date from YYYY-MM-DD, or None."""
    if not isinstance(text, str) or not ISO_DATE_RE.match(text):
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def normalise(text):
    """Scan-only view of prose: NFKC (full-width digits, non-breaking spaces), zero-width and other
    format characters dropped, every dash a hyphen. The stored text is never changed."""
    out = []
    for ch in unicodedata.normalize("NFKC", text):
        category = unicodedata.category(ch)
        if category == "Cf":
            continue
        out.append("-" if category == "Pd" or ch == "−" else ch)
    return "".join(out)


def core_digits(text):
    """Digits of a number with a leading North American 1 removed."""
    digits = re.sub(r"\D", "", text)
    return digits[1:] if len(digits) == 11 and digits.startswith("1") else digits


def crisis_numbers(crisis):
    """{resource id: {digit strings}} for every number registered in crisis_resources.json."""
    out = {}
    for resource in crisis.get("resources", []):
        if not isinstance(resource, dict):
            continue
        for field in ("contact", "alsoAvailable"):
            for token in re.findall(r"\d[\d\-\s().]*\d", str(resource.get(field, ""))):
                digits = core_digits(token)
                if len(digits) >= 3:
                    out.setdefault(str(resource.get("id", "?")), set()).add(digits)
    return out


def crisis_patterns(numbers):
    """(resource id, regex) for prose. Short codes (<= 4 digits) match contiguously or with ONE
    separator repeated between every digit, so "9-1-1" is caught but 19115 or 9881 is not; longer
    numbers may carry any separators and an optional leading 1."""
    out = []
    for rid, digit_set in numbers.items():
        for digits in digit_set:
            if len(digits) <= CRISIS_SHORT_CODE_MAX:
                contiguous = re.escape(digits) + r"(?!\d)"
                spaced = (
                    r"(?<!\d" + CRISIS_SHORT_SEPARATORS + r")" + re.escape(digits[0])
                    + r"(?P<sep>" + CRISIS_SHORT_SEPARATORS + r")"
                    + r"(?P=sep)".join(re.escape(d) for d in digits[1:])
                    + r"(?!(?P=sep)?\d)"
                )
                pattern = r"(?<!\d)(?:" + contiguous + r"|" + spaced + r")"
            else:
                pattern = (r"(?<!\d)(?:1[\s.\-()]*)?" + r"[\s.\-()]*".join(re.escape(d) for d in digits)
                           + r"(?!\d)")
            out.append((rid, re.compile(pattern)))
    return out


def text_fields(data):
    """Every string a patient could read, as (JSON pointer, text, kind). kind is "text",
    "row" (a handwriting label, which may be blank) or "number" (a table dial string)."""
    out = []

    def add(pointer, value, kind="text"):
        if isinstance(value, str):
            out.append((pointer, value, kind))

    def add_list(pointer, values, kind="text"):
        for i, value in enumerate(values or []):
            add("%s/%d" % (pointer, i), value, kind)

    for key in ("heading", "cardHeading", "note"):
        add("/crisisCopy/" + key, data.get("crisisCopy", {}).get(key))
    for i, line in enumerate(data.get("crisis", [])):
        for key in ("label", "when"):
            add("/crisis/%d/%s" % (i, key), line.get(key))
    for i, item in enumerate(data.get("inserts", [])):
        base = "/inserts/%d" % i
        for key in ("title", "body", "tip", "signoff"):
            add("%s/%s" % (base, key), item.get(key))
        add_list(base + "/bullets", item.get("bullets"))
        add_list(base + "/rows", item.get("rows"), "row")
        for j, group in enumerate(item.get("groups", []) or []):
            gbase = "%s/groups/%d" % (base, j)
            for key in ("heading", "body"):
                add("%s/%s" % (gbase, key), group.get(key))
            add_list(gbase + "/bullets", group.get("bullets"))
            add_list(gbase + "/rows", group.get("rows"), "row")
        for j, entry in enumerate(item.get("table", []) or []):
            tbase = "%s/table/%d" % (base, j)
            add(tbase + "/who", entry.get("who"))
            add(tbase + "/what", entry.get("what"))
            add(tbase + "/number", entry.get("number"), "number")
    return out


def has_content(block):
    return any(block.get(key) for key in ("body", "bullets", "groups", "rows", "table"))


def host_is_disallowed(url):
    host = (urlparse(url).hostname or "").rstrip(".")
    return host if any(host == bad or host.endswith("." + bad) for bad in DISALLOWED_SOURCE_HOSTS) else None


def check_date(label, text, today, errors, field):
    """Parse a date field: error if unreal or future, return the date (or None)."""
    parsed = parse_iso(text)
    if parsed is None:
        errors.append("%s: %s '%s' is not a real calendar date" % (label, field, text))
    elif parsed > today:
        errors.append("%s: %s %s is in the future" % (label, field, text))
    else:
        return parsed
    return None


def check(data, schema, crisis, today):
    """Validate a parsed document. Pure: no I/O, no clock (today is passed in)."""
    report = Report()
    errors, warnings = report.errors, report.warnings

    for error in sorted(Draft7Validator(schema).iter_errors(data), key=lambda e: [str(p) for p in e.path]):
        pointer = "/" + "/".join(str(p) for p in error.path)
        errors.append("%s: %s" % (pointer, error.message))
    if errors:  # shape is wrong, so semantic checks would only report noise
        return report

    check_date("generatedAt", data["generatedAt"], today, errors, "generatedAt")

    # ---- inserts: present, unique, in print order, not empty -------------------------------
    inserts = data["inserts"]
    seen = {}
    for item in inserts:
        seen[item["id"]] = seen.get(item["id"], 0) + 1
    for insert_id, count in seen.items():
        if count > 1:
            errors.append("insert '%s' appears twice" % insert_id)
    for insert_id in PRINT_ORDER:
        if insert_id not in seen:
            errors.append("insert '%s' is missing" % insert_id)
    present = [item["id"] for item in inserts]
    first_seen = [i for n, i in enumerate(present) if i not in present[:n]]
    if first_seen != [i for i in PRINT_ORDER if i in seen]:
        errors.append("inserts are out of print order; expected %s" % ", ".join(PRINT_ORDER))

    for item in inserts:
        insert_id = item["id"]
        if item["core"] and not item["defaultOn"]:
            errors.append("core insert '%s' cannot default off" % insert_id)
        if insert_id in ALWAYS_ON and not (item["core"] and item["defaultOn"]):
            errors.append("insert '%s' must be core and on by default (it carries the unit phone)" % insert_id)
        if not has_content(item):
            errors.append("insert '%s' has no content (body, bullets, groups, rows or table)" % insert_id)
        for n, group in enumerate(item.get("groups", []) or []):
            if not has_content(group):
                errors.append("insert '%s' group %d ('%s') has no content" % (insert_id, n, group["heading"]))
        if insert_id in TABLE_INSERTS and not item.get("table"):
            errors.append("insert '%s' needs a table of verified numbers" % insert_id)

    # ---- crisis references: single source, always carries both required numbers ----------
    resource_list = crisis.get("resources") if isinstance(crisis, dict) else None
    resources = {}
    if not isinstance(resource_list, list):
        errors.append("crisis_resources.json has no `resources` list; nothing to resolve `crisis` against")
    else:
        resources = {r.get("id"): r for r in resource_list if isinstance(r, dict)}
    refs = [c["ref"] for c in data["crisis"]]
    resolved = []
    dates = []
    for ref in refs:
        if ref in resolved:
            errors.append("crisis ref '%s' is listed twice" % ref)
            continue
        resource = resources.get(ref)
        if resource is None:
            errors.append("crisis ref '%s' does not exist in crisis_resources.json" % ref)
            continue
        resolved.append(ref)
        label = "crisis_resources.json '%s'" % ref
        verified = check_date(label, resource.get("verifiedOn"), today, errors, "verifiedOn")
        if verified is not None:
            dates.append(verified)
            age = (today - verified).days
            if age > STALE_AFTER_DAYS:
                warnings.append("%s: last verified %s, %d days ago (limit %d)"
                                % (label, resource["verifiedOn"], age, STALE_AFTER_DAYS))
    for rid, (number, pattern) in REQUIRED_CRISIS.items():
        if rid not in refs:
            errors.append("`crisis` must reference '%s' (the packet always carries %s)" % (rid, number))
        elif rid in resources and not pattern.search(str(resources[rid].get("contact", ""))):
            errors.append("crisis_resources.json '%s' contact %r does not contain %s"
                          % (rid, resources[rid].get("contact"), number))

    # ---- prose hygiene, on normalised text with placeholders resolved or rejected ---------
    registered = crisis_numbers(crisis)
    patterns = crisis_patterns(registered)
    for pointer, value, kind in text_fields(data):
        if kind != "row" and not value.strip():
            errors.append("%s: blank text" % pointer)
        if "<" in value or ">" in value:
            errors.append("%s: contains markup (< or >); text is escaped, never HTML" % pointer)
        for inner in PLACEHOLDER_RE.findall(value):
            crisis_ref = CRISIS_PLACEHOLDER_RE.fullmatch(inner)
            if inner in PLAIN_PLACEHOLDERS:
                continue
            if not crisis_ref:
                errors.append("%s: unknown or malformed placeholder {{%s}}; allowed are {{unitName}}, "
                              "{{unitPhone}} and {{crisis:<id>}}" % (pointer, inner))
            elif crisis_ref.group(1) not in resources:
                errors.append("%s: placeholder {{%s}} names a line that does not exist in "
                              "crisis_resources.json" % (pointer, inner))
            elif crisis_ref.group(1) not in refs:
                errors.append("%s: placeholder {{%s}} needs '%s' listed in `crisis`"
                              % (pointer, inner, crisis_ref.group(1)))
        stripped = PLACEHOLDER_RE.sub(" ", value)
        if "{" in stripped or "}" in stripped:
            errors.append("%s: stray brace; this is not a valid placeholder" % pointer)
        scan = normalise(stripped)
        if kind == "number":
            hit = sorted(rid for rid, numbers in registered.items() if core_digits(scan) in numbers)
        else:
            hit = sorted({rid for rid, pattern in patterns if pattern.search(scan)})
        if hit:
            errors.append("%s: contains a crisis number registered in crisis_resources.json (%s); "
                          "reference it from `crisis` or use {{crisis:<id>}}, never type it"
                          % (pointer, ", ".join(hit)))
        if DOSE_RE.search(scan) or DOSE_WORD_RE.search(scan) or DOSE_COUNT_RE.search(scan):
            errors.append("%s: dose literal; the packet teaches the decision, not the number" % pointer)
        if METADATA_RE.search(scan):
            errors.append("%s: verification metadata or a review tier in patient-facing text" % pointer)
        if kind != "number" and PHONE_RE.search(scan):
            errors.append("%s: contains a phone number; every number must be a table row carrying "
                          "its own verifiedDate and source" % pointer)

    # ---- helpline rows: format, dates, sources, consistency ---------------------------------
    numbers = 0
    by_number = {}
    by_who = {}
    for item in inserts:
        for n, entry in enumerate(item.get("table", []) or []):
            numbers += 1
            where = "%s '%s' row %d (%s)" % (item["id"], entry["who"], n, entry["number"])
            digits = core_digits(entry["number"])
            if not (NANP_TEN_RE.match(digits) or NANP_N11_RE.match(digits)):
                errors.append("%s: not a valid North American number" % where)
            verified = check_date(where, entry["verifiedDate"], today, errors, "verifiedDate")
            if verified is not None:
                if verified < EARLIEST_VERIFICATION:
                    errors.append("%s: verifiedDate %s is before %s; that is a placeholder, not a "
                                  "verification" % (where, entry["verifiedDate"], EARLIEST_VERIFICATION))
                else:
                    dates.append(verified)
                    age = (today - verified).days
                    if age > STALE_AFTER_DAYS:
                        warnings.append("%s: last verified %s, %d days ago (limit %d) - re-check before "
                                        "the next release" % (where, entry["verifiedDate"], age, STALE_AFTER_DAYS))
            for url in [entry["source"]] + entry.get("alsoSources", []):
                bad = host_is_disallowed(url)
                if bad:
                    errors.append("%s: source host %s is not authoritative; use the operating "
                                  "organization or a government page" % (where, bad))
            who_key = entry["who"].strip().casefold()
            earlier = by_number.setdefault(digits, (who_key, entry["source"], entry["who"]))
            if earlier[:2] != (who_key, entry["source"]):
                errors.append("%s: number is listed twice with a different name or source "
                              "(first as '%s')" % (where, earlier[2]))
            earlier = by_who.setdefault(who_key, (digits, entry["source"], entry["number"]))
            if earlier[:2] != (digits, entry["source"]):
                errors.append("%s: '%s' is listed twice with a different number or source "
                              "(first as %s)" % (where, entry["who"], earlier[2]))

    report.stats = {
        "inserts": len(inserts),
        "onByDefault": sum(1 for item in inserts if item["defaultOn"]),
        "numbers": numbers,
        "crisisRefs": len(refs),
        "crisisResolved": resolved,
        "oldestVerified": min(dates).isoformat() if dates else None,
        "oldestAgeDays": (today - min(dates)).days if dates else None,
    }
    return report


def iso_date_arg(text):
    parsed = parse_iso(text)
    if parsed is None:
        raise argparse.ArgumentTypeError("%r is not a YYYY-MM-DD date" % text)
    return parsed


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", type=Path, default=DATA)
    parser.add_argument("--schema", type=Path, default=SCHEMA)
    parser.add_argument("--crisis", type=Path, default=CRISIS)
    parser.add_argument("--strict", action="store_true",
                        help="exit 1 on any freshness warning, not only on a hard problem")
    parser.add_argument("--today", type=iso_date_arg, default=None,
                        help="YYYY-MM-DD; for tests only - production reads the clock")
    return parser


def fail(problems, label):
    print("%s: FAILED (%d problem(s))" % (label, len(problems)))
    for problem in problems:
        print("   -", problem)
    return 1


def main(argv=None):
    args = build_parser().parse_args(argv)
    label = args.data.name

    missing = ["%s: MISSING" % path.name for path in (args.data, args.schema, args.crisis)
               if not path.exists()]
    if missing:
        return fail(missing, label)
    try:
        data = json.loads(args.data.read_text(encoding="utf-8"))
        schema = json.loads(args.schema.read_text(encoding="utf-8"))
        crisis = json.loads(args.crisis.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return fail(["invalid JSON at line %d col %d: %s" % (error.lineno, error.colno, error.msg)], label)
    if Draft7Validator is None:
        return fail(["jsonschema not installed - run: python3 -m pip install -r requirements.txt"], label)

    report = check(data, schema, crisis, args.today or date.today())
    if report.errors:
        return fail(report.errors, label)

    for warning in report.warnings:
        print("WARNING: " + warning)
    stats = report.stats
    print("%s: OK - %d inserts (%d on by default), %d numbers, %d crisis references; oldest verified %s "
          "(%d days ago)" % (label, stats["inserts"], stats["onByDefault"], stats["numbers"],
                             stats["crisisRefs"], stats["oldestVerified"], stats["oldestAgeDays"]))
    if args.strict and report.warnings:
        print("%s: FAILED (--strict): %d number(s) past the %d-day limit"
              % (label, len(report.warnings), STALE_AFTER_DAYS))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
