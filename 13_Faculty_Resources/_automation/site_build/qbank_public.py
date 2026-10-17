"""One fail-closed learner projection; canonical drafts remain available to faculty."""
import argparse
import copy
import json
from pathlib import Path
import re
from jsonschema import Draft7Validator


PUBLIC_NOTE = "Learner question bank: faculty-attested, active questions only."
ITEM_FIELDS = ("id", "status", "type", "subtype", "category", "competency", "difficulty",
               "hy", "pages", "stem", "why", "pearl", "evidence", "exam_alignment", "retired")
PRETEST_CATEGORIES = ("mood", "psychosis", "anxiety", "substance", "neurocog", "pharm",
                      "safety", "personality", "childdev", "otherdx", "ethics", "relational")


def _fields(value, fields):
    if not isinstance(value, dict):
        raise ValueError("question bank: malformed learner field object")
    return {key: copy.deepcopy(value[key]) for key in fields if key in value}


def _options(options):
    if not isinstance(options, list):
        raise ValueError("question bank: options must be an array")
    result = []
    for option in options:
        public = _fields(option, ("key", "t", "c"))
        if "trap" in option:
            public["trap"] = _fields(option["trap"], ("name", "note"))
        result.append(public)
    return result


def project_question_bank(data):
    """Return every attested, nonretired item; invalid metadata fails instead of hiding it.

    This boundary validates every record's shape and eligibility, including drafts and
    retired records. Unknown editorial fields never become learner output by accident.
    """
    if (not isinstance(data, dict) or type(data.get("version")) is not int or data["version"] != 1
            or not isinstance(data.get("_note"), str) or not isinstance(data.get("items"), list)):
        raise ValueError("question bank: expected version 1, _note string and items array")
    schema = json.loads((Path(__file__).resolve().parents[3] / "question_bank.schema.json").read_text())
    errors = list(Draft7Validator(schema).iter_errors(data))
    if errors:
        error = errors[0]
        raise ValueError("question bank: " + ".".join(map(str, error.path)) + ": " + error.message)
    released, seen = [], set()
    for item in data["items"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not re.fullmatch(r"qb_[a-z]+_[0-9]{3}", item["id"]):
            raise ValueError("question bank: missing or malformed item id")
        identifier = item["id"]
        if identifier in seen:
            raise ValueError("question bank: duplicate item id " + identifier)
        seen.add(identifier)
        if item.get("status") not in ("draft", "attested"):
            raise ValueError("question bank: unknown or missing status for " + identifier)
        if "retired" in item and type(item["retired"]) is not bool:
            raise ValueError("question bank: malformed retired flag for " + identifier)
        for field in ("stem", "why", "pearl", "evidence"):
            if not item[field].strip():
                raise ValueError("question bank: empty " + field + " for " + identifier)
        for tier, options in enumerate([item["options"]] + ([item["tier2"]["options"]] if "tier2" in item else [])):
            keys = {op["key"] for op in options}
            # The schema requires four primary choices, but permits three or four
            # second-tier choices. Both tiers still need unique keys and one answer.
            invalid_keys = len(keys) != len(options) or (tier == 0 and keys != {"A", "B", "C", "D"})
            if invalid_keys or sum(op.get("c") is True for op in options) != 1:
                raise ValueError("question bank: invalid option keys or correct-answer count for " + identifier)
            if any(not op["t"].strip() for op in options):
                raise ValueError("question bank: empty option for " + identifier)
        if item["status"] != "attested" or item.get("retired") is True:
            continue
        public = _fields(item, ITEM_FIELDS)
        if "options" in item:
            public["options"] = _options(item["options"])
        if "link" in item:
            public["link"] = _fields(item["link"], ("label", "href"))
        if "tier2" in item:
            public["tier2"] = _fields(item["tier2"], ("q", "why"))
            public["tier2"]["options"] = _options(item["tier2"].get("options"))
        # Exam blueprint metadata has no learner renderer; v2 is reserved authoring
        # material. Neither is needed to answer or export an approved question.
        released.append(public)
    return {"_note": PUBLIC_NOTE, "version": 1, "items": released}


def pretest_pool(public_bank):
    """Deterministic placement subset from the same released bank as practice/downloads."""
    bank = project_question_bank(public_bank)
    pool = []
    for category in PRETEST_CATEGORIES:
        candidates = [item for item in bank["items"] if item.get("category") == category
                      and sum(option.get("c") is True for option in item.get("options", [])) == 1]
        candidates.sort(key=lambda item: (abs((item.get("difficulty") or 2) - 2),
                                          0 if item.get("hy") else 1, item["id"]))
        if not candidates:
            continue
        item = candidates[0]
        pool.append({"id": item["id"], "cat": category, "pages": item.get("pages", []),
                     "stem": item.get("stem", ""),
                     "options": [{"key": op.get("key"), "t": op.get("t", ""), "c": op.get("c") is True}
                                 for op in item.get("options", [])],
                     "why": item.get("why", ""), "pearl": item.get("pearl", "")})
    return {"v": 1, "generated": "build", "items": pool}


def _prepost_item(item, category):
    return {"id": item["id"], "cat": category, "stem": item.get("stem", ""),
            "options": [{"key": op.get("key"), "t": op.get("t", ""), "c": op.get("c") is True}
                        for op in item.get("options", [])]}


def prepost_forms(public_bank):
    """Two parallel, disjoint pre/post forms. DRAFT (L8 outcomes design); shipped only
    when CLERKSHIP_PREPOST=on.

    One item per blueprint category per form, from the same attested projection as
    practice. Single-best-answer items only, with four options and one key. Placement
    items are excluded. In each category the two best-ranked candidates (closest to
    difficulty 2, then high-yield, then id: the placement's own rule) go one to each form,
    alternating which form gets the first-ranked item so neither form is systematically
    easier. Explanations and pearls are left out: the check shows no feedback.

    Known limit: these items stay in the practice pool, so a learner can meet them before
    the end sitting. Holding them out is a question-bank decision, not made here.
    """
    bank = project_question_bank(public_bank)
    placement = {item["id"] for item in pretest_pool(public_bank)["items"]}
    forms = {"A": [], "B": []}
    for index, category in enumerate(PRETEST_CATEGORIES):
        candidates = [item for item in bank["items"]
                      if item.get("category") == category and item.get("type") == "sba"
                      and item["id"] not in placement and len(item.get("options", [])) == 4
                      and sum(option.get("c") is True for option in item["options"]) == 1]
        candidates.sort(key=lambda item: (abs((item.get("difficulty") or 2) - 2),
                                          0 if item.get("hy") else 1, item["id"]))
        if len(candidates) < 2:
            raise ValueError("pre/post forms: fewer than two eligible items for " + category)
        first, second = candidates[0], candidates[1]
        a, b = (first, second) if index % 2 == 0 else (second, first)
        forms["A"].append(_prepost_item(a, category))
        forms["B"].append(_prepost_item(b, category))
    return {"v": 1, "status": "draft", "forms": forms}


def _read(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError("question bank publication: unavailable or invalid " + str(path)) from exc


def verify_publication(out, canonical):
    """Check emitted bytes, complete inclusion, dependent feeds and accidental raw copies.

    Called by static QA after assembly. Download archives have their own semantic
    parity gate after export; this also scans every final file for withheld IDs.
    """
    out = Path(out)
    expected = project_question_bank(canonical)
    actual = _read(out / "question_bank.json")
    if actual != expected:
        raise ValueError("question bank publication: learner JSON differs from the complete approved projection")
    if _read(out / "pretest_pool.json") != pretest_pool(expected):
        raise ValueError("question bank publication: placement questions differ from the approved projection")
    if (out / "prepost_forms.json").exists() and _read(out / "prepost_forms.json") != prepost_forms(expected):
        raise ValueError("question bank publication: pre/post forms differ from the approved projection")
    ids = sorted(item["id"] for item in expected["items"])
    shell = (out / "index.html").read_text(encoding="utf-8")
    matches = re.findall(r"var RELEASED_QB_IDS=(\[[^\]]*\]);", shell)
    if len(matches) != 1 or json.loads(matches[0]) != ids:
        raise ValueError("question bank publication: shell released IDs differ from the approved projection")
    review = (out / "tools" / "review.html").read_text(encoding="utf-8")
    matches = re.findall(r'<script\b[^>]*\bid=[\'\"]cw-review-qb-inventory[\'\"][^>]*>(.*?)</script\s*>', review, re.S)
    inventory = [{"id": item["id"], "retired": False} for item in expected["items"]]
    if len(matches) != 1 or json.loads(matches[0]) != inventory:
        raise ValueError("question bank publication: Daily Review inventory differs from the approved projection")
    withheld = {item["id"] for item in canonical["items"]} - set(ids)
    patterns = [(identifier, re.compile(rb"(?<![a-zA-Z0-9_])" + identifier.encode() + rb"(?![a-zA-Z0-9_])"))
                for identifier in sorted(withheld)]
    for path in sorted(out.rglob("*")):
        if path.is_file():
            raw = path.read_bytes()
            for identifier, pattern in patterns:
                if pattern.search(raw):
                    raise ValueError("question bank publication: withheld " + identifier + " found in " + str(path.relative_to(out)))
    return {"source": len(canonical["items"]), "released": len(ids), "withheld": len(withheld)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out")
    parser.add_argument("--bank", type=Path, default=Path(__file__).resolve().parents[3] / "question_bank.json")
    args = parser.parse_args()
    try:
        counts = verify_publication(args.out, _read(args.bank))
        print("question bank publication PASS: " + json.dumps(counts, sort_keys=True))
    except (OSError, ValueError) as error:
        parser.exit(1, str(error) + "\n")
