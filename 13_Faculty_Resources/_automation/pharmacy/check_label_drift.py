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

    --record [--ledger PATH]
        With the default mode: append every drift that needs review to a LOCAL ledger
        (never the repository) that bin/what_needs_josh.py reads. Append-only and keyed by
        (agent, new version), so a later clean run or a re-pin never erases an observed drift:
        only a valid current faculty review bound to that exact label version and committed
        source evidence retires it there. A later date alone does not. lastChecked advances only after a run over EVERY pinned
        label -- an --only run records its drifts but never refreshes the date.

    --diff ID
        Print, for one agent whose label moved, the changed sections as a word diff: removed
        words ~~struck~~, added words **bold**, unchanged runs elided. The OLD side is the
        version that was pinned, fetched from DailyMed's labeling archive and shown only when
        its section hashes equal the pin -- the pin authenticates the archive, so the reviewer
        sees exactly the text the card was checked against. --record stores the same texts in
        the ledger, so render_review_packet.py can show the diff offline.

    --offline
        No network. The pins agree with the committed receipt: every receipt agent is pinned,
        each pin names the receipt's set id and effective date, and no pinned quote carries a
        dose literal. An agent listed under "unpinned" (its label moved past the receipt) is a
        finding, never a skip: its card needs review before the pins can be committed. CI runs
        this.

Exit 0 nothing for a reviewer to do, 1 a card needs re-review (a content section changed, a
quote is gone, or a pin was refused), 2 could not check (network, a receipt agent with no
pin, a pin naming another set id). A version bump that changes no content section — a new
package label, a reformatted product table — exits 0 with a note to re-pin.
"""

import argparse
import datetime
import difflib
import hashlib
import io
import json
import os
import re
import sys
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import validate_pharmacy as vp  # noqa: E402  (the one AC4' rule masks pinned quotes)

RECEIPT = HERE / "label_receipt.json"
PINS = HERE / "label_pins.json"
PHARMACY = vp.PHARMACY
ROOT = vp.ROOT
SPL_XML = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/%s.xml"
SPL_HISTORY = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/%s/history.json"
SPL_PAGE = "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=%s"
SPL_ARCHIVE = "https://dailymed.nlm.nih.gov/dailymed/getArchivalFile.cfm?archive_id=%s"
DIFF_CONTEXT_WORDS = 12
DIFF_RUN_MAX_WORDS = 60
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


def archive_ids(page_bytes):
    """{version: archive_id} from a label page's "View Labeling Archives" table."""
    text = (page_bytes or b"").decode("utf-8", "replace")
    start = text.find('id="modal-label-archives"')
    if start < 0:
        return {}
    block = text[start:]
    end = block.find("</table>")
    block = block[:end] if end >= 0 else block
    found = {}
    for row in re.findall(r"<tr>(.*?)</tr>", block, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        link = re.search(r"getArchivalFile\.cfm\?archive_id=(\d+)", row)
        version = re.search(r"\d+", re.sub(r"<[^>]+>", " ", cells[1])) if len(cells) >= 2 else None
        if link and version:
            found[int(version.group())] = link.group(1)
    return found


def archived_spl(set_id, version, get):
    """One archived version's SPL, or None when DailyMed does not hold that version."""
    ids = archive_ids(get(SPL_PAGE % set_id))
    if version not in ids:
        return None
    raw = get(SPL_ARCHIVE % ids[version])
    try:
        bundle = zipfile.ZipFile(io.BytesIO(raw or b""))
    except zipfile.BadZipFile:
        return None
    for name in bundle.namelist():
        if not name.lower().endswith(".xml"):
            continue
        try:
            spl = parse_spl(bundle.read(name))
        except CouldNotCheck:
            continue
        if spl["setId"] == set_id and spl["version"] == version:
            return spl
    return None


def section_texts(pin, old_spl, new_spl, keys):
    """{key: {"old", "new", "oldStatus"}} for the given sections.

    oldStatus: "verified" (the archived text hashes to the pin), "absent" (the section is new),
    "unavailable" (DailyMed holds no archive of the pinned version) or "mismatch" (it does, but
    the text is not what was pinned -- never shown, because it is not what the card was
    checked against).
    """
    texts = {}
    for key in keys:
        new = new_spl["sections"].get(key)
        entry = {"old": None, "new": new["text"] if new else None}
        if key not in pin["sections"]:
            entry["oldStatus"] = "absent"
        elif old_spl is None:
            entry["oldStatus"] = "unavailable"
        else:
            old = old_spl["sections"].get(key)
            if old is not None and digest(old["text"]) == pin["sections"][key]:
                entry.update(old=old["text"], oldStatus="verified")
            else:
                entry["oldStatus"] = "mismatch"
        texts[key] = entry
    return texts


def _md(word):
    return re.sub(r"([*_~|\[\]`])", r"\\\1", word)


def _marked(words, mark, limit):
    """One removed or added run, delimiters always closed; a long run is cut INSIDE them."""
    text = " ".join(_md(w) for w in words[:limit])
    if len(words) > limit:
        return "%s%s …%s (+%d words)" % (mark, text, mark, len(words) - limit)
    return "%s%s%s" % (mark, text, mark)


def word_diff(old, new, context=DIFF_CONTEXT_WORDS, limit=DIFF_RUN_MAX_WORDS):
    """Markdown hunks: ~~removed~~ and **added** words with `context` words either side.

    Each removed or added run is capped at `limit` words on its own (Codex P2 on #961): cutting
    the formatted hunk could drop a closing ~~ or **, or the whole added half of a replacement.
    """
    a, b = (old or "").split(), (new or "").split()
    hunks = []
    for group in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_grouped_opcodes(context):
        parts = []
        for tag, i1, i2, j1, j2 in group:
            if tag == "equal":
                parts.append(" ".join(_md(w) for w in a[i1:i2]))
                continue
            if i2 > i1:
                parts.append(_marked(a[i1:i2], "~~", limit))
            if j2 > j1:
                parts.append(_marked(b[j1:j2], "**", limit))
        hunks.append(" ".join(p for p in parts if p))
    return hunks


def render_texts(texts):
    """Markdown lines for stored section texts (shared by --diff and the review packet)."""
    lines = []
    for key in sorted(texts, key=_section_order):
        entry = texts[key]
        lines.append("**§%s**%s" % (key, {
            "verified": "", "absent": " (new section)",
            "unavailable": " (old text not archived by DailyMed: showing the new text)",
            "mismatch": " (archived text does not match the pin: showing the new text)",
        }[entry["oldStatus"]]))
        if entry["oldStatus"] == "verified":
            hunks = word_diff(entry["old"], entry["new"])
            lines += ["- %s" % h for h in hunks] or ["- (whitespace only)"]
        elif entry["new"] is None:
            lines.append("- section removed")
        else:
            lines += ["- %s" % h for h in word_diff("", entry["new"])]
        lines.append("")
    return lines


def _section_order(key):
    if key == BOXED:
        return (0, ())
    if key[0].isdigit():
        return (1, tuple(int(p) for p in key.split("#")[0].split(".") if p.isdigit()))
    return (2, (key,))


def _evidence_hash(value):
    """The writer's canonical full-object hash; provenance, not authentication."""
    def supported(item):
        if item is None or isinstance(item, (str, bool)):
            return True
        if type(item) is int:
            return abs(item) <= 9007199254740991
        if isinstance(item, list):
            return all(supported(child) for child in item)
        if isinstance(item, dict):
            return all(isinstance(key, str) and supported(child) for key, child in item.items())
        return False
    if not supported(value):
        raise ValueError("source object is outside the writer's canonical JSON domain")
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def _git_evidence(root, *args):
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    result = subprocess.run(["git", "--no-optional-locks", "-C", str(root), *args],
                            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            check=True, timeout=10)
    if len(result.stdout) > 4 * 1024 * 1024:
        raise ValueError("source object exceeds the writer's read limit")
    return result.stdout.decode("utf-8")


def _source_objects(revision, root, ancestor="HEAD"):
    """Read one available ancestor commit, never working files or network fallbacks."""
    def git(*args):
        return _git_evidence(root, *args)
    if git("cat-file", "-t", revision).strip() != "commit":
        raise ValueError("sourceRevision is not a commit")
    git("merge-base", "--is-ancestor", revision, ancestor)
    paths = ("pharmacy.json", "13_Faculty_Resources/_automation/pharmacy/label_pins.json",
             "13_Faculty_Resources/_automation/pharmacy/label_receipt.json")
    return [json.loads(git("show", revision + ":" + path)) for path in paths]


def review_clears_drift(card, obligation, *, today=None, root=None,
                       ancestor="HEAD", source_cache=None):
    """A valid current review must bind THIS transition's exact committed label evidence.

    The source revision and hashes prove which bytes were bound, not who approved them.
    Authentic-review attribution and promotion restrictions remain upstream governance
    boundaries (including the existing shared-key limitation). No ledger is changed here.
    """
    try:
        if not isinstance(card, dict) or not isinstance(obligation, dict):
            return False
        review = card.get("facultyReview") or {}
        evidence = review.get("labelEvidence")
        keys = {"schemaVersion", "sourceRevision", "setId", "version", "effectiveDate",
                "pinHash", "receiptHash"}
        if not isinstance(evidence, dict) or set(evidence) != keys:
            return False
        if (type(evidence["schemaVersion"]) is not int or evidence["schemaVersion"] != 1 or
                type(evidence["version"]) is not int or not 0 < evidence["version"] <= 9007199254740991):
            return False
        for key, pattern in (("sourceRevision", r"[a-f0-9]{40}"),
                             ("pinHash", r"[a-f0-9]{64}"), ("receiptHash", r"[a-f0-9]{64}")):
            if not isinstance(evidence[key], str) or not re.fullmatch(pattern, evidence[key]):
                return False
        set_id = evidence["setId"]
        if not isinstance(set_id, str) or not set_id.strip():
            return False
        if (not isinstance(card.get("id"), str) or not card["id"] or
                obligation.get("agent") != card["id"] or obligation.get("setId") != set_id or
                type(obligation.get("toVersion")) is not int or
                obligation["toVersion"] != evidence["version"] or
                obligation.get("toDate") != evidence["effectiveDate"]):
            return False
        dates = []
        for value in (evidence["effectiveDate"], obligation.get("observedOn"), review.get("lastReviewed")):
            if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                return False
            dates.append(datetime.date.fromisoformat(value))
        effective, observed, signed = dates
        if not effective <= observed <= signed <= (today or datetime.date.today()):
            return False
        if (review.get("status") != "reviewed" or not isinstance(review.get("reviewer"), str) or
                not review["reviewer"].strip() or review.get("reviewedFieldsHash") != vp.j_hash(card)):
            return False
        if card.get("retrieval") and review.get("retrievalHash") != vp.retrieval_hash(card):
            return False
        cache = source_cache if source_cache is not None else {}
        key = (evidence["sourceRevision"], ancestor)
        if key not in cache:
            cache[key] = _source_objects(evidence["sourceRevision"], root or ROOT, ancestor)
        registry, pins, receipts = cache[key]
        source_cards = [row for row in registry["records"] if row.get("id") == card["id"]]
        if len(source_cards) != 1:
            return False
        source_card = source_cards[0]
        # The writer only changes facultyReview. Clinical or source edits since that
        # snapshot require a new review; recomputing a J hash alone cannot clear drift.
        clinical = lambda record: {key: value for key, value in record.items() if key != "facultyReview"}
        if clinical(source_card) != clinical(card):
            return False
        pin, receipt = pins["agents"][card["id"]], receipts["agents"][card["id"]]
        reference = receipt["reference"]
        if (card.get("dailymedSetId") != set_id or pin.get("setId") != set_id or
                reference.get("setId") != set_id or
                card.get("labelVersionDate") != evidence["effectiveDate"] or
                pin.get("effectiveDate") != evidence["effectiveDate"] or
                reference.get("effectiveDate") != evidence["effectiveDate"] or
                type(pin.get("version")) is not int or pin["version"] != evidence["version"]):
            return False
        sections = pin.get("sections")
        if not isinstance(sections, dict) or not sections or not all(
                isinstance(value, str) and re.fullmatch(r"[a-f0-9]{16}", value) for value in sections.values()):
            return False
        return (_evidence_hash(pin) == evidence["pinHash"] and
                _evidence_hash(receipt) == evidence["receiptHash"])
    except (KeyError, TypeError, ValueError, AttributeError, OSError, subprocess.SubprocessError):
        # Missing/malformed/unavailable evidence never turns an obligation into zero.
        return False


def unresolved_drifts(ledger, records, *, today=None, root=None):
    """Preserve verified prior resolutions without mutating the observation ledger.

    History is bounded to 100 pharmacy evidence commits. Missing/older unavailable evidence
    stays owed. A historical approval binds an ancestor of THAT approval, not a
    later source. This is provenance only; it cannot infer intentional revocation.
    """
    root = root or ROOT
    cache, history, owed = {}, None, []
    for row in (ledger or {}).get("drifts", []):
        agent = row["agent"]
        if review_clears_drift(records.get(agent), row, today=today, root=root, source_cache=cache):
            continue
        if history is None:
            history = []
            try:
                revisions = _git_evidence(
                    root, "log", "-100", '--format=%H',
                    '-G"(labelEvidence|sourceRevision)"', "HEAD", "--", "pharmacy.json").splitlines()
                for revision in revisions:
                    try:
                        snapshot = json.loads(_git_evidence(root, "show", revision + ":pharmacy.json"))
                        cards = snapshot["records"]
                        if isinstance(cards, list):
                            history.append((revision, cards))
                    except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError):
                        continue
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
        resolved = False
        for revision, cards in history:
            candidates = [card for card in cards if isinstance(card, dict) and card.get("id") == agent]
            if len(candidates) == 1 and review_clears_drift(
                    candidates[0], row, today=today, root=root, ancestor=revision, source_cache=cache):
                resolved = True
                break
        if not resolved:
            owed.append(row)
    return owed


def drifts_since_review(ledger, record):
    """Every unresolved transition, including older ones not covered by any review."""
    agent = (record or {}).get("id")
    selected = {"drifts": [row for row in (ledger or {}).get("drifts", []) if row["agent"] == agent]}
    return unresolved_drifts(selected, {agent: record})


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
        "setId": spl["setId"],
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


LEDGER_NAME = "label_drift_ledger.json"


def ledger_path():
    """Where --record writes and what_needs_josh.py reads: per machine, outside the repo.

    CLERKSHIP_LABEL_DRIFT_LEDGER overrides; else $XDG_STATE_HOME/clerkship/, else
    ~/.local/state/clerkship/. State, not cache: the ledger is the only record that a drift
    was ever seen, so it must survive a reboot and a cache purge.
    """
    override = os.environ.get("CLERKSHIP_LABEL_DRIFT_LEDGER")
    if override:
        return Path(override)
    base = os.environ.get("XDG_STATE_HOME") or str(Path.home() / ".local" / "state")
    return Path(base) / "clerkship" / LEDGER_NAME


def record(ledger_file, report, examined_all, today, records=None):
    """Append this run's needs-review drifts to the ledger; returns how many were new.

    Each entry keeps the card's review date AS OF the observation (cardReviewedOn), so a card
    that was reviewed when its label moved stays owed even if a later content fix demotes it
    to pending (Codex P1 on #955). The write is atomic: the ledger is the only record that a
    drift was ever seen, so an interrupted run must leave the old file whole (Codex P2).
    """
    try:
        ledger = json.loads(Path(ledger_file).read_text(encoding="utf-8"))
    except FileNotFoundError:
        ledger = {"schemaVersion": 1, "lastChecked": None, "drifts": []}
    except ValueError as error:
        raise CouldNotCheck("ledger %s is unreadable (%s); move it aside, never overwrite it"
                            % (ledger_file, error))
    def identity(row):
        return (row["agent"], row.get("setId"), row["toVersion"], row.get("toDate"))
    # Versions are scoped to a label set. Legacy rows retain their unknown identity
    # and cannot suppress a new observation whose exact identity is now available.
    seen = {identity(d) for d in ledger.get("drifts", [])}
    added = 0
    for row in report:
        if row.get("status") != "review" or identity(row) in seen:
            continue
        ledger.setdefault("drifts", []).append({
            "agent": row["agent"], "setId": row.get("setId"), "observedOn": today,
            "fromVersion": row["fromVersion"], "toVersion": row["toVersion"],
            "fromDate": row["fromDate"], "toDate": row["toDate"],
            "sections": row["changed"] + row["added"] + row["removed"],
            "fields": row["fields"], "quotesBroken": len(row["quotesBroken"]),
            "cardReviewedOn": _reviewed_on((records or {}).get(row["agent"])),
            "texts": row.get("texts", {}),
        })
        seen.add(identity(row))
        added += 1
    if examined_all:
        ledger["lastChecked"] = today
    target = Path(ledger_file)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=target.name + ".", suffix=".tmp", dir=str(target.parent))
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write(json.dumps(ledger, indent=1) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
    return added


def _reviewed_on(card):
    """The card's lastReviewed when it is reviewed now, else None (pending or unknown)."""
    review = (card or {}).get("facultyReview") or {}
    return review.get("lastReviewed") if review.get("status") == "reviewed" else None


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
            # Never a pass (Codex P1 on #954): an unpinned agent is one whose label already
            # moved past its receipt, i.e. a card known to need review. Skipping it would let
            # --offline pass CI and drop it from every later network check.
            findings.append("%s: unpinned -- %s" % (agent, unpinned[agent]))
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
        if result["needsReview"]:
            try:
                old_spl = archived_spl(pin["setId"], pin["version"], get)
            except CouldNotCheck:
                old_spl = None  # the diff is a convenience; the drift itself is already proven
            result["texts"] = section_texts(pin, old_spl, spl,
                                            result["changed"] + result["added"] + result["removed"])
        report.append(result)
        if result["needsReview"]:
            review.append(agent)
        time.sleep(args.pause)
    for line in findings:
        print("NOTE " + line)
    if args.record:
        examined_all = set(wanted) == set(pinned)
        added = record(args.ledger, report, examined_all, datetime.date.today().isoformat(), records)
        print("recorded %d new drift(s) in %s%s" % (
            added, args.ledger, "" if examined_all else " (partial run: lastChecked unchanged)"),
            file=sys.stderr)
    if args.json:
        slim = [{k: v for k, v in row.items() if k != "texts"} for row in report]
        print(json.dumps({"examined": len(wanted), "needsReview": review, "agents": slim}, indent=1))
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


def do_diff(args, pins, get):
    agent = args.diff
    pin = pins.get("agents", {}).get(agent)
    if pin is None:
        raise CouldNotCheck("not pinned: %s" % agent)
    history = get(SPL_HISTORY % pin["setId"])
    if history is None:
        raise CouldNotCheck("%s: DailyMed has no history for set id %s" % (agent, pin["setId"]))
    if latest_version(history, agent) == pin["version"]:
        print("%s: label current (v%d, %s); nothing has changed since the pin"
              % (agent, pin["version"], pin["effectiveDate"]))
        return 0
    spl = parse_spl(get(SPL_XML % pin["setId"]) or b"")
    result = compare(pin, spl, records_by_id().get(agent))
    keys = result["changed"] + result["added"] + result["removed"]
    print("## %s: label v%d (%s) -> v%d (%s)" % (agent, result["fromVersion"], result["fromDate"],
                                                 result["toVersion"], result["toDate"]))
    if not keys:
        print("\nNo content section changed; re-pin with --pin --only %s" % agent)
        return 0
    if result["fields"]:
        print("\nCard fields to re-review: %s" % ", ".join(result["fields"]))
    print("")
    print("\n".join(render_texts(section_texts(pin, archived_spl(pin["setId"], pin["version"], get),
                                               spl, keys))))
    return 1 if result["needsReview"] else 0


def main(argv=None, get=fetch):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--pin", action="store_true", help="pin the current label of each agent")
    mode.add_argument("--offline", action="store_true", help="check pins against the receipt, no network")
    mode.add_argument("--diff", metavar="ID", help="word diff of one agent's changed sections")
    parser.add_argument("--only", nargs="*", help="agent ids (default: all)")
    parser.add_argument("--quotes", type=Path, help="--pin: JSON {agent: [{section, text}]} to pin")
    parser.add_argument("--json", action="store_true", help="machine-readable report")
    parser.add_argument("--record", action="store_true",
                        help="append needs-review drifts to the local ledger what_needs_josh.py reads")
    parser.add_argument("--ledger", type=Path, default=ledger_path(), help=argparse.SUPPRESS)
    parser.add_argument("--pause", type=float, default=0.3, help=argparse.SUPPRESS)
    parser.add_argument("--receipt", type=Path, default=RECEIPT, help=argparse.SUPPRESS)
    parser.add_argument("--pins", type=Path, default=PINS, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        receipt = load_json(args.receipt)
        pins = load_json(args.pins) if args.pins.exists() else {"schemaVersion": 1, "agents": {}}
        if args.pin:
            return do_pin(args, receipt, pins, get)
        if args.diff:
            return do_diff(args, pins, get)
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
