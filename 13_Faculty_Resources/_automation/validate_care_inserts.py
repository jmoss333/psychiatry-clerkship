#!/usr/bin/env python3
"""Validate care-inserts.v1.json - the standard inserts of the Care aftercare packet - and its unit-profile candidates.

Runs in the build gate. The file holds patient-facing helpline numbers and advice that will be
printed and sent home, so this checks what a JSON Schema cannot: that every number carries a real,
non-future verification date and an official source; that nothing is stale without saying so; that
crisis contacts are REFERENCED from crisis_resources.json (the single source) and resolve to the
two numbers the packet must always carry, every one of them governed as 24/7 (the welcome says they
answer any time); that no crisis number, phone number, dose literal or verification metadata is typed
into prose; that no sentence about the unit promises round-the-clock cover and every "the unit" carries
the unit's token; that the wallet card's crisis lines fit it; and that the inserts are present, unique,
in print order, and not empty.

care-unit-profiles.v1.json holds candidate unit facts and actual-check records, never approval.
The closed profile contract records contact purpose, staffed hours, and operational callback details.
Identity and contact need evidence; callback and branding need it exactly when those features are on.
The oldest required check starts a ninety-calendar-day window in America/New_York. Patient output
still requires an independent, authenticated owner approval of the exact candidate revision.

Prose may say "call 911" without typing it: `{{crisis:emergency_911}}` is replaced at render time
by that resource's contact string from crisis_resources.json. Every scan runs on NORMALISED text
(NFKC, zero-width characters dropped, every dash a hyphen) so a number pasted from a web page or a
Word file cannot hide behind a non-breaking hyphen.

Freshness is a warning, not a failure: a number a day over the limit must not block a safety
deploy. `--strict` turns warnings into a failure for a deliberate pre-release check.

Exit 0 clean (warnings allowed), 1 a hard problem or, with --strict, any warning.
"""

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import date, timedelta
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
PROFILES = DATA_DIR / "care-unit-profiles.v1.json"
PROFILES_SCHEMA = DATA_DIR / "care-unit-profiles.v1.schema.json"
CRISIS = ROOT / "crisis_resources.json"

# A helpline number older than this was last checked too long ago to print without a re-check.
# Same window the crisis snapshot uses before its own staleness is reported.
STALE_AFTER_DAYS = 180

# No real verification predates this: it is a sentinel ("1970-01-01") standing in for "never".
EARLIEST_VERIFICATION = date(2026, 1, 1)

# Print order of the inserts. The array must contain every id exactly once, in this order. The wallet card is not
# here: it is a separate, optional print built from the top-level `card` (packet design, direction 5).
PRINT_ORDER = ("intro", "week", "callback", "warning", "safety", "family",
               "national", "insurance", "meds", "rights", "notes")

# The welcome insert names the unit and carries both unit tokens ({{unitPhone}} in its text, {{unitName}} in its
# sign-off), and it is the one insert that may never be switched off.
ALWAYS_ON = ("intro",)

# The wallet card's crisis panel was measured to fit five lines with no wrap and less than one line of headroom
# (packet design, Revision 2: 194.5px of 204 in every face measured), so a sixth line is a data error here.
CARD_MAX_CRISIS_LINES = 5

# Candidate checks expire after ninety New York calendar days, including the actual check date.
# This policy is independent of the 180-day helpline freshness warning. Approval never renews a check.
PROFILE_USABLE_DAYS = 90
PROFILE_POLICY_VERSION = 1
PROFILE_KEYS = ("id", "label", "org", "brandingApproved", "unitName", "unitPhone", "unitPurpose", "unitHours",
                "callbackProgram", "callbackTeam", "callbackPhone", "callbackHours", "callbackFallback", "verification")
CALLBACK_FIELDS = ("callbackTeam", "callbackPhone", "callbackHours", "callbackFallback")

# The resident build rewrites these phrases EVERYWHERE in the shell it copies (resident_section.py RESIDENT_REBRAND,
# applied by common.apply_verified_replacements with str.replace), and the packet payload is inline in that shell, so
# a profile carrying one would reach the resident site rewritten. Mirrored, not imported: resident_section.py
# rebuilds a directory at import time. test_validate_care_inserts.py pins this mirror to that list.
RESIDENT_REBRAND_NEEDLES = (
    '<span class="fd-brand__name">Inpatient Psychiatry</span>',
    '<span class="fd-setup__brand-name">Inpatient Psychiatry</span>',
    "MS3 Psychiatry Clerkship",
    "MS3 Clerkship",
    "A private learning hub for the third-year inpatient psychiatry clerkship.",
)

# Inserts whose whole job is a table of numbers; an empty one would print a heading over nothing.
TABLE_INSERTS = ("national", "insurance")

# The packet must always be able to print these two lines. Keyed by resource id in
# crisis_resources.json, with the number as printed and its digits. The digits must EQUAL one of the
# numbers parsed from the resource's `contact` field: a segment of a longer number ("1-800-988-0199"
# contains 988) or a number in `alsoAvailable` (a chat address) must not satisfy it, or a wrong
# contact would render through {{crisis:<id>}}.
REQUIRED_CRISIS = {
    "lifeline_988": ("988", "988"),
    "maine_crisis_line": ("1-888-568-1112", "8885681112"),
}

# A helpline number's provenance is the operating organization's own site or a government page, so only
# these domains (and their subdomains) are accepted. This is an allowlist on purpose: a list of bad hosts
# cannot recognise a typo ("samhsa.example") or an unrelated site. A new helpline from a new organization
# means adding its domain here, after checking that it really is that organization's.
APPROVED_SOURCE_DOMAINS = (
    "211maine.org", "coverme.gov", "mainecahc.org", "maine.gov", "medicare.gov", "nami.org", "nnepc.org",
    "samhsa.gov", "thehotline.org", "thetrevorproject.org",
)

PLAIN_PLACEHOLDERS = ("unitName", "unitPhone", "unitPurpose", "unitHours", "unitContact",
                      "callbackTeam", "callbackPhone", "callbackHours", "callbackFallback", "callWindow", "callDeadline")
PLACEHOLDER_RE = re.compile(r"\{\{([^{}]*)\}\}")
CRISIS_PLACEHOLDER_RE = re.compile(r"crisis:([a-z0-9_]+)")

# Dose literals are banned on learner surfaces (Option A). The house pattern (mg/mcg/mL with one
# optional space) is the floor; this adds the spellings an editor actually types: "5-mg",
# "five milligrams", "10 µg", "2 grams", "20 mEq", and counts of tablets, pills and capsules.
DOSE_UNITS = (r"(?:mgs?|mcgs?|[µμu]g|g|gm|grams?|mls?|cc|iu|meq|milligrams?|micrograms?|"
              r"millilit(?:er|re)s?)")
DOSE_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*-?\s*" + DOSE_UNITS + r"(?!\w)", re.I)
DOSE_WORD_RE = re.compile(r"\b(?:milligram|microgram|millilit(?:er|re))s?\b", re.I)
# "five mg", "twenty-five mg", "one hundred mcg", "half a gram": a spelled-out quantity before ANY unit,
# not only the long ones DOSE_WORD_RE already bans outright.
NUMBER_WORDS = (r"(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|"
                r"sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|"
                r"hundred|thousand|half|quarter)")
DOSE_SPELLED_RE = re.compile(r"\b" + NUMBER_WORDS + r"(?:[\s-]+(?:and\s+|a\s+)?" + NUMBER_WORDS + r")*[\s-]+(?:a\s+)?"
                             + DOSE_UNITS + r"(?!\w)", re.I)
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
# A unit phone as the browser accepts one (fd_care_packet_sheet.js fdCarePacketUnitPhone): digits and phone
# punctuation only, so an extension or a word is refused rather than silently dropped.
UNIT_PHONE_CHARS_RE = re.compile(r"[0-9\s().+\-]+")

# Unit wording (packet design, direction 3 and Revision 2): a sentence that refers to the unit may not carry an
# availability phrase, because the unit does not give round-the-clock crisis cover (only the crisis lines do).
UNIT_REF_RE = re.compile(r"\b(?:us|we|our|ours|the\s+unit|our\s+team)\b|\{\{unit(?:Name|Phone|Purpose|Hours|Contact)\}\}", re.I)
AVAILABILITY_RE = re.compile(
    r"\bany[\s-]?time\b|(?<!\d)24\s*/\s*7(?!\d)|(?<!\d)24[\s-]hours?\b|\bday\s+or\s+night\b"
    r"|\b(?:a)?round[\s-]the[\s-]clock\b|\ball\s+hours\b", re.I)
# Any sentence that says "the unit" must carry the unit's token, so the confirmed-phone rule (which reads tokens) can
# see that the sentence names the unit or promises contact. Titles and headings are exempt.
THE_UNIT_RE = re.compile(r"\bthe\s+unit\b", re.I)
UNIT_TOKEN_RE = re.compile(r"\{\{unit(?:Name|Phone|Purpose|Hours|Contact)\}\}")
SENTENCE_SPLIT_RE = re.compile(r"[.!?\n]+")
# The printed sheet refuses every "verif-" word on paper (fd_care_packet_sheet.js FD_CARE_PACKET_FORBIDDEN).
VERIF_RE = re.compile(r"\bverif\w*", re.I)


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
        if category == "Nd":
            out.append(str(unicodedata.digit(ch)))  # Arabic-Indic, Devanagari ... digits: the same number to a reader
            continue
        out.append("-" if category == "Pd" or ch == "−" else ch)
    return "".join(out)


def core_digits(text):
    """Digits of a number with a leading North American 1 removed."""
    digits = re.sub(r"\D", "", text)
    return digits[1:] if len(digits) == 11 and digits.startswith("1") else digits


def contact_numbers(resource):
    """Digit strings (leading North American 1 removed) of the numbers in a resource's `contact` only."""
    return {core_digits(token) for token in re.findall(r"\d[\d\-\s().]*\d", str(resource.get("contact", "")))}


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


def registered_crisis_digits(crisis):
    """Every registered crisis number (`contact` AND `alsoAvailable`, every resource, three digits or more), as sorted
    digit strings. Shipped as the payload's `crisisNumbers`, so the browser refuses the same numbers this scans for."""
    return sorted({digits for numbers in crisis_numbers(crisis).values() for digits in numbers})


def helpline_digits(data):
    """Digits of every helpline-table number in a care-inserts document (tolerates a malformed one)."""
    out = set()
    inserts = data.get("inserts") if isinstance(data, dict) else None
    for item in inserts if isinstance(inserts, list) else []:
        table = item.get("table") if isinstance(item, dict) else None
        for entry in table if isinstance(table, list) else []:
            if isinstance(entry, dict) and isinstance(entry.get("number"), str):
                out.add(core_digits(entry["number"]))
    return out


def unit_phone_digits(value):
    """The ten digits of a unit phone, or None. The browser's rule (fd_care_packet_sheet.js fdCarePacketUnitPhone):
    digits and phone punctuation only; a leading North American 1 dropped; ten digits whose area code and exchange
    both start 2-9 and neither of which is a three-digit service code (second and third digit both 1)."""
    raw = value.strip() if isinstance(value, str) else ""
    if not raw or not UNIT_PHONE_CHARS_RE.fullmatch(raw):
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if not NANP_TEN_RE.match(digits) or digits[1:3] == "11" or digits[4:6] == "11":
        return None
    return digits


def unit_wording_problems(text, kind):
    """Why a patient-readable string breaks the unit-wording rules, one message per offending sentence.
    Titles and headings are exempt from the token rule only ("Reaching the unit and your rights")."""
    problems = []
    seen = normalise(text)
    # Per sentence on purpose: the check cannot follow who "it" or "someone" is, and "Call us. The crisis lines answer any time." is
    # honest. A promise two sentences after "the unit" is therefore a wording-review matter, not something this rule can see.
    for sentence in SENTENCE_SPLIT_RE.split(seen):
        sentence = " ".join(sentence.split())
        if not sentence:
            continue
        unit_ref = UNIT_REF_RE.search(sentence)
        availability = AVAILABILITY_RE.search(sentence)
        if unit_ref and availability:
            problems.append("\"%s\" refers to the unit ('%s') and carries an availability phrase ('%s'); the unit "
                            "must never sound like round-the-clock crisis cover, which only the crisis lines give"
                            % (sentence, unit_ref.group(0), availability.group(0)))
        if kind != "title" and THE_UNIT_RE.search(sentence) and not UNIT_TOKEN_RE.search(sentence):
            problems.append("\"%s\" says 'the unit' without {{unitPhone}} or {{unitName}} in the same sentence; the "
                            "confirmed-phone rule can only see a promise that carries the unit's token" % sentence)
    return problems


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
    """Every string a patient could read, as (JSON pointer, text, kind). kind is "text", "title" (a title or
    heading: scanned like text, exempt only from the unit-token rule), "row" (a handwriting label, which may be
    blank) or "number" (a table dial string). A crisis line contributes only `when`: its name, contact and
    availability come from crisis_resources.json."""
    out = []

    def add(pointer, value, kind="text"):
        if isinstance(value, str):
            out.append((pointer, value, kind))

    def add_list(pointer, values, kind="text"):
        for i, value in enumerate(values or []):
            add("%s/%d" % (pointer, i), value, kind)

    crisis_copy = data.get("crisisCopy", {})
    add("/crisisCopy/heading", crisis_copy.get("heading"), "title")
    add("/crisisCopy/cardHeading", crisis_copy.get("cardHeading"), "title")
    add("/crisisCopy/note", crisis_copy.get("note"))
    for i, line in enumerate(data.get("crisis", [])):
        add("/crisis/%d/when" % i, line.get("when"))
    card = data.get("card", {})
    add("/card/title", card.get("title"), "title")
    add("/card/body", card.get("body"))
    add("/card/mineTitle", card.get("mineTitle"), "title")
    add_list("/card/rows", card.get("rows"), "row")
    for i, item in enumerate(data.get("inserts", [])):
        base = "/inserts/%d" % i
        add(base + "/title", item.get("title"), "title")
        for key in ("body", "tip", "signoff"):
            add("%s/%s" % (base, key), item.get(key))
        add_list(base + "/bullets", item.get("bullets"))
        add_list(base + "/rows", item.get("rows"), "row")
        for j, group in enumerate(item.get("groups", []) or []):
            gbase = "%s/groups/%d" % (base, j)
            add(gbase + "/heading", group.get("heading"), "title")
            add(gbase + "/body", group.get("body"))
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


def host_if_unapproved(url):
    """The URL's host when it is not an approved source domain (or a subdomain of one), else None.
    urlparse().hostname drops userinfo and port, so "https://samhsa.gov@evil.com/" is judged as evil.com."""
    host = (urlparse(url).hostname or "").rstrip(".")
    approved = any(host == good or host.endswith("." + good) for good in APPROVED_SOURCE_DOMAINS)
    return None if approved else (host or url)


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
        if insert_id in ALWAYS_ON and not UNIT_TOKEN_RE.search(json.dumps(item, ensure_ascii=False)):
            errors.append("insert '%s' must carry {{unitPhone}} or {{unitName}}: that token is what makes a Final copy "
                          "need a confirmed unit profile, so the always-on page may never lose it" % insert_id)
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
        # The welcome tells patients the lines in the box "answer any time, day or night", so every line the box
        # prints must be governed as round the clock.
        availability = resource.get("availability")
        if not normalise(str(availability or "")).strip().casefold().startswith("24/7"):
            errors.append("%s: availability %r does not begin '24/7'; the welcome tells patients every line in the "
                          "crisis box answers any time" % (label, availability))
        verified = check_date(label, resource.get("verifiedOn"), today, errors, "verifiedOn")
        if verified is not None:
            dates.append(verified)
            age = (today - verified).days
            if age > STALE_AFTER_DAYS:
                warnings.append("%s: last verified %s, %d days ago (limit %d)"
                                % (label, resource["verifiedOn"], age, STALE_AFTER_DAYS))
    for rid, (number, digits) in REQUIRED_CRISIS.items():
        if rid not in refs:
            errors.append("`crisis` must reference '%s' (the packet always carries %s)" % (rid, number))
        elif rid in resources and digits not in contact_numbers(resources[rid]):
            errors.append("crisis_resources.json '%s' contact %r is not exactly %s"
                          % (rid, resources[rid].get("contact"), number))
    if len(refs) > CARD_MAX_CRISIS_LINES:
        errors.append("`crisis` lists %d lines; the wallet card holds at most %d without a wrap"
                      % (len(refs), CARD_MAX_CRISIS_LINES))

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
                              "{{unitPhone}}, approved unit/callback fields, labelled call blanks and {{crisis:<id>}}" % (pointer, inner))
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
        if (DOSE_RE.search(scan) or DOSE_SPELLED_RE.search(scan) or DOSE_WORD_RE.search(scan)
                or DOSE_COUNT_RE.search(scan)):
            errors.append("%s: dose literal; the packet teaches the decision, not the number" % pointer)
        if METADATA_RE.search(scan):
            errors.append("%s: verification metadata or a review tier in patient-facing text" % pointer)
        if kind != "number" and PHONE_RE.search(scan):
            errors.append("%s: contains a phone number; every number must be a table row carrying "
                          "its own verifiedDate and source" % pointer)
        if kind != "number":
            errors.extend("%s: %s" % (pointer, problem) for problem in unit_wording_problems(value, kind))

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
                bad = host_if_unapproved(url)
                if bad:
                    errors.append("%s: source host %s is not an approved source; use the operating "
                                  "organization's own site or a government page, and add a new domain to "
                                  "APPROVED_SOURCE_DOMAINS only after checking it" % (where, bad))
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


def name_problems(value, patterns):
    """Patient-facing profile text must be plain, free of phone/dose literals and unsupported availability claims."""
    problems = []
    if not value.strip():
        problems.append("is blank")
    if any(unicodedata.category(ch) in ("Cc", "Cf", "Cs") for ch in value):
        problems.append("contains a control or invisible character")
    if "<" in value or ">" in value:
        problems.append("contains markup (< or >)")
    if "{" in value or "}" in value:
        problems.append("contains a brace; a profile is plain text, never a placeholder")
    scan = normalise(value)
    if PHONE_RE.search(scan):
        problems.append("contains a phone number; the unit's number goes in unitPhone")
    hit = sorted({rid for rid, pattern in patterns if pattern.search(scan)})
    if hit:
        problems.append("contains a crisis number registered in crisis_resources.json (%s)" % ", ".join(hit))
    if DOSE_RE.search(scan) or DOSE_SPELLED_RE.search(scan) or DOSE_WORD_RE.search(scan) or DOSE_COUNT_RE.search(scan):
        problems.append("contains a dose literal")
    if METADATA_RE.search(scan):
        problems.append("contains verification metadata or a review tier")
    if VERIF_RE.search(scan):
        problems.append("uses a 'verif-' word, which the printed sheet forbids")
    if AVAILABILITY_RE.search(scan):
        problems.append("carries an availability phrase; a unit's name must not promise round-the-clock cover")
    folded = scan.casefold()
    for needle in RESIDENT_REBRAND_NEEDLES:
        if needle.casefold() in folded:
            problems.append("contains '%s', which the resident build rewrites everywhere in the shell" % needle)
    return problems


def check_profiles(profiles_doc, profiles_schema, crisis, inserts_data, today):
    """Validate candidate facts and their actual-check evidence. This never creates owner approval."""
    report = Report()
    errors, warnings = report.errors, report.warnings
    for error in sorted(Draft7Validator(profiles_schema).iter_errors(profiles_doc),
                        key=lambda e: [str(p) for p in e.path]):
        pointer = "/" + "/".join(str(p) for p in error.path)
        errors.append("%s: %s" % (pointer, error.message))
    if errors:
        return report

    profiles = profiles_doc["profiles"]
    patterns = crisis_patterns(crisis_numbers(crisis))
    crisis_digits = set(registered_crisis_digits(crisis))
    helplines = helpline_digits(inserts_data)
    seen, dates = set(), []
    for n, profile in enumerate(profiles):
        where = "profile %d ('%s')" % (n, profile["id"])
        if profile["id"] in seen:
            errors.append("%s: id is listed twice" % where)
        seen.add(profile["id"])
        for key in ("label", "org", "unitName", "unitPurpose", "unitHours", "callbackTeam", "callbackHours", "callbackFallback"):
            value = profile[key]
            if value is not None and (not key.startswith("callback") or profile["callbackProgram"]):
                errors.extend("%s: %s %s" % (where, key, problem) for problem in name_problems(value, patterns))
        if profile["brandingApproved"] and profile["org"] is None:
            errors.append("%s: brandingApproved is true but org is null; the checked branding needs its organization" % where)
        if not profile["brandingApproved"] and profile["org"] is not None:
            errors.append("%s: brandingApproved is false so org must be null; unapproved branding must not ship" % where)
        if not profile["callbackProgram"]:
            for key in CALLBACK_FIELDS:
                if profile[key] != "":
                    errors.append("%s: %s must be empty when callbackProgram is false" % (where, key))
        elif profile["callbackFallback"].rstrip().endswith((".", "!", "?")):
            errors.append("%s: callbackFallback is a clause without terminal punctuation; the template supplies its full stop" % where)

        for key in ("unitPhone", "callbackPhone"):
            if key == "callbackPhone" and not profile["callbackProgram"]:
                continue
            digits = unit_phone_digits(profile[key])
            if digits is None:
                errors.append("%s: %s %r is not a ten-digit North American number a patient can dial (digits and "
                              "phone punctuation only; area code and exchange start 2-9 and neither is a service code "
                              "such as 411)" % (where, key, profile[key]))
            elif digits in crisis_digits:
                errors.append("%s: %s %r is a crisis number registered in crisis_resources.json; use the unit's own contact" % (where, key, profile[key]))
            elif digits in helplines:
                errors.append("%s: %s %r is a helpline-table number; use the unit's own contact" % (where, key, profile[key]))

        required = {"identity", "contact"}
        if profile["callbackProgram"]:
            required.add("callback")
        if profile["brandingApproved"]:
            required.add("branding")
        fields, actual_dates = set(), []
        for entry in profile["verification"]:
            field = entry["field"]
            label = "%s verification %s" % (where, field)
            if field in fields:
                errors.append("%s: verification field %s appears twice" % (where, field))
            fields.add(field)
            checked = check_date(label, entry["checkedOn"], today, errors, "checkedOn")
            if checked is not None:
                if checked < EARLIEST_VERIFICATION:
                    errors.append("%s: checkedOn %s is before %s; that is a placeholder, not an actual check" % (label, checked, EARLIEST_VERIFICATION))
                else:
                    actual_dates.append(checked)
            role, evidence = entry["checkedBy"], entry["evidence"]
            if (not role.strip() or re.search(r"\d", normalise(role)) or "@" in normalise(role)
                    or any(unicodedata.category(ch) in ("Cc", "Cf", "Cs") for ch in role)):
                errors.append("%s: checkedBy must name a role, never a number, an email or blank" % label)
            if (not evidence.strip() or any(unicodedata.category(ch) in ("Cc", "Cf", "Cs") for ch in evidence)
                    or any(char in evidence for char in "<>{}")):
                errors.append("%s: evidence must be nonblank plain text without markup, placeholders or control characters" % label)
        for field in sorted(required - fields):
            errors.append("%s: verification is missing required field %s" % (where, field))
        for field in sorted(fields - required):
            errors.append("%s: verification field %s is not applicable to this profile" % (where, field))
        if actual_dates:
            oldest = min(actual_dates)
            dates.append(oldest)
            age = (today - oldest).days
            if age >= PROFILE_USABLE_DAYS:
                warnings.append("%s: oldest actual verification %s, %d days ago (limit %d); suspended for patient output "
                                "from %s in America/New_York until reverified and independently approved" %
                                (where, oldest, age, PROFILE_USABLE_DAYS, expires_on(oldest)))
    report.stats = {"profiles": len(profiles), "oldestConfirmed": min(dates).isoformat() if dates else None,
                    "oldestAgeDays": (today - min(dates)).days if dates else None}
    return report


def profile_revision(profile):
    """Exact candidate identity, not approval: SHA256 of the policy-versioned canonical UTF-8 JSON."""
    if set(profile) != set(PROFILE_KEYS):
        raise ValueError("profile fields do not match the closed candidate contract")
    covered = dict(profile, verification=sorted(profile["verification"], key=lambda entry: entry["field"]))
    canonical = json.dumps({"policyVersion": PROFILE_POLICY_VERSION, "profile": covered},
                           sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def oldest_verification(profile):
    """Called after validation: the oldest actual required check, never the build or approval date."""
    return min(parse_iso(entry["checkedOn"]) for entry in profile["verification"])


def expires_on(checked):
    """First invalid calendar date in America/New_York (the browser/server applies that timezone)."""
    return (checked + timedelta(days=PROFILE_USABLE_DAYS)).isoformat()


def usable_through(checked):
    """Last valid New York calendar date; ninety dates including the actual verification day."""
    return (checked + timedelta(days=PROFILE_USABLE_DAYS - 1)).isoformat()


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
    parser.add_argument("--profiles", type=Path, default=PROFILES)
    parser.add_argument("--profiles-schema", type=Path, default=PROFILES_SCHEMA)
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
    profiles_label = args.profiles.name

    paths = (args.data, args.schema, args.crisis, args.profiles, args.profiles_schema)
    missing = ["%s: MISSING" % path.name for path in paths if not path.exists()]
    if missing:
        return fail(missing, label)
    loaded = []
    for path in paths:
        try:
            loaded.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError as error:
            return fail(["%s: invalid JSON at line %d col %d: %s" % (path.name, error.lineno, error.colno, error.msg)],
                        label)
    data, schema, crisis, profiles, profiles_schema = loaded
    if Draft7Validator is None:
        return fail(["jsonschema not installed - run: python3 -m pip install -r requirements.txt"], label)

    today = args.today or date.today()
    report = check(data, schema, crisis, today)
    profile_report = check_profiles(profiles, profiles_schema, crisis, data, today)
    if report.errors or profile_report.errors:
        if report.errors:
            fail(report.errors, label)
        if profile_report.errors:
            fail(profile_report.errors, profiles_label)
        return 1

    warnings = report.warnings + profile_report.warnings
    for warning in warnings:
        print("WARNING: " + warning)
    stats = report.stats
    print("%s: OK - %d inserts (%d on by default), %d numbers, %d crisis references; oldest verified %s "
          "(%d days ago)" % (label, stats["inserts"], stats["onByDefault"], stats["numbers"],
                             stats["crisisRefs"], stats["oldestVerified"], stats["oldestAgeDays"]))
    pstats = profile_report.stats
    print("%s: OK - %d candidate unit profile(s)%s" % (
        profiles_label, pstats["profiles"],
        "; oldest actual verification %s (%d days ago)" % (pstats["oldestConfirmed"], pstats["oldestAgeDays"])
        if pstats["oldestConfirmed"] else ""))
    if args.strict and warnings:
        print("%s: FAILED (--strict): %d check(s) past their validity limit" % (label, len(warnings)))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
