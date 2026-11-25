#!/usr/bin/env python3
"""Check cast registration and count hospital idioms in the HTML on shipped Markdown pages."""
import argparse
import calendar
from collections import Counter, defaultdict
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = Path("13_Faculty_Resources/_automation/site_build")
sys.path.insert(0, str(ROOT / SITE))
from shipped_pages import ShippedPagesError, load_shipped_pages

CAST = SITE / "fictional_cast.json"
BASE = Path("bin/bedside_activities_baseline.json")
KEYS = ("surplus_name_uses", "idiom_hits")
TAG = re.compile(r"</?[A-Za-z][\w:-]*(?=[\s/>])[^>]*>")
WORD = re.compile(r"[^\W\d_]+", re.UNICODE)
POSSESSIVE = re.compile(r"\b([^\W\d_]+)['’]s\b")
COMMON = set(calendar.day_name) | set(calendar.month_name) | {
    "Who", "Whom", "Whose", "What", "Which", "When", "Where", "Why", "How",
}
IDIOM = re.compile(
    r"\b(?:wards?(?!\s+off\b)|trolley|ring\s+(?:if|us|me)|(?:my|your|their|his|her)\s+mobile"
    r"|(?:required|safety)\s+observations|urgent\s+clinical\s+advice|whilst|fortnight|A&E|paracetamol|GPs?|sectioned)\b",
    re.I,
)
COUNTRY = (".uk", ".au", ".ca", ".nz", ".ie")


class ActivityText(HTMLParser):
    """Strip tag attributes from language checks and read link targets from anchors only."""

    SEPARATORS = {
        "address", "article", "aside", "blockquote", "br", "button", "caption",
        "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption",
        "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
        "header", "hr", "input", "legend", "li", "main", "nav", "ol", "option",
        "p", "pre", "section", "select", "summary", "table", "td", "textarea",
        "th", "tr", "ul",
    }

    def __init__(self):
        super().__init__()
        self.words = []
        self.links = []

    def handle_data(self, data):
        self.words.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in self.SEPARATORS:
            self.words.append(" ")
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                host = urlsplit(href).hostname
                if host and host.rstrip(".").endswith(COUNTRY):
                    self.links.append((host.rstrip(".").removeprefix("www."), href))

    def handle_endtag(self, tag):
        if tag in self.SEPARATORS:
            self.words.append(" ")


def read_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def registered(path):
    data = read_json(path)
    if not isinstance(data, dict) or not isinstance(data.get("people"), list) or not data["people"]:
        raise ValueError(f"{path}: expected a nonempty people array")
    ignore = data.get("ignore")
    if not isinstance(ignore, list) or any(not isinstance(word, str) or not word for word in ignore):
        raise ValueError(f"{path}: expected an ignore array of words")
    ids = set()
    for person in data["people"]:
        if not isinstance(person, dict) or any(
            not isinstance(person.get(field), str) or not person[field].strip()
            for field in ("id", "name", "pronouns", "role")
        ):
            raise ValueError(f"{path}: invalid cast record")
        pages = person.get("pages")
        if (not isinstance(pages, list) or not pages or
                any(not isinstance(page, str) or not page for page in pages)):
            raise ValueError(f"{path}: {person['id']} needs a list of source paths")
        if person["id"] in ids or len(set(pages)) != len(pages):
            raise ValueError(f"{path}: duplicate id or repeated page for {person['id']}")
        ids.add(person["id"])
    return data["people"], set(ignore)


def measure(root, cast):
    people, ignore = registered(cast)
    names = defaultdict(set)
    counts = Counter()
    for person in people:
        names[person["name"]].update(person["pages"])
        counts[person["name"]] += 1

    paths = set()
    for entry in load_shipped_pages(root)["pages"]:
        source = entry.get("source")
        if not isinstance(source, str) or not source:
            raise ValueError(f"Missing source for shipped page {entry['slug']}")
        if source.endswith(".md"):
            paths.add(source)
    if not paths:
        raise ValueError("No shipped Markdown sources to check")

    hard = []
    for name, listed in names.items():
        for source in sorted(listed - paths):
            hard.append(f"H2 {source}: {name} lists an unshipped source")

    idioms, links = [], []
    for source in sorted(paths):
        words = Counter()
        possessives = set()
        with (root / source).open(encoding="utf-8") as handle:
            for number, line in enumerate(handle, 1):
                if not TAG.search(line):
                    continue
                html = ActivityText()
                html.feed(line)
                html.close()
                text = "".join(html.words)
                words.update(WORD.findall(text))
                possessives.update(POSSESSIVE.findall(text))
                for match in IDIOM.finditer(text):
                    idioms.append({"page": source, "line": number, "text": match.group()})
                for host, href in html.links:
                    links.append({"page": source, "line": number, "host": host, "href": href})
        for name, listed in names.items():
            if words[name] and source not in listed:
                hard.append(f"H1 {source}: {name} occurs outside its registered pages")
            if source in listed and not words[name]:
                hard.append(f"H2 {source}: no occurrence of registered name {name}")
        for word in sorted(possessives - names.keys() - ignore - COMMON):
            if word[0].isupper() and words[word] >= 3 and not words[word.lower()]:
                hard.append(f"H3 {source}: probable unregistered name {word}")

    shared = {name: n for name, n in sorted(counts.items()) if n > 1}
    return {"pages_read": len(paths), "people": len(people), "shared_names": shared,
            "surplus_name_uses": sum(n-1 for n in shared.values()), "idiom_hits": len(idioms),
            "idioms": idioms, "country_links": links, "hard_findings": hard}


def evaluate(result, pins):
    if not isinstance(pins, dict) or any(type(pins.get(key)) is not int or pins[key] < 0 for key in KEYS):
        raise ValueError("Missing or invalid numeric baseline")
    return int(bool(result["hard_findings"]) or any(result[key] > pins[key] for key in KEYS))


def report(result, pins):
    print(f"Read {result['pages_read']} shipped Markdown pages; {result['people']} people")
    print("Shared names:", ", ".join(f"{name} ×{n}" for name, n in result["shared_names"].items()) or "none")
    for key in KEYS:
        print(f"{key}: {result[key]} (pin {pins[key]})")
        if result[key] < pins[key]:
            print("  note: use --update-baseline after review to lock the gain")
    for hit in result["idioms"]:
        print(f"  {hit['page']}:{hit['line']}: {hit['text']}")
    for finding in result["hard_findings"]:
        print(finding)
    print(f"{len(result['country_links'])} country-domain links (report only)")
    for link in result["country_links"]:
        print(f"  {link['page']}:{link['line']}: {link['href']}")


def run(root, cast, base, *, update=False, json_output=False):
    try:
        result = measure(root, cast)
        pins = read_json(base)
        rc = evaluate(result, pins)
        if update and not rc:
            pins = {key: result[key] for key in KEYS}
            base.write_text(json.dumps(pins, indent=2) + "\n", encoding="utf-8")
        if json_output:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            report(result, pins)
        return rc
    except (OSError, ValueError, ShippedPagesError) as exc:
        print(f"COULD NOT CHECK: {exc}", file=sys.stderr)
        return 2


def self_test():
    import contextlib
    import io

    checks = []
    def check(label, condition):
        checks.append(label)
        if not condition:
            raise AssertionError(label)

    phrases = [
        "ward", "wards", "trolley", "Ring if", "Ring us", "Ring me", "their mobile",
        "Required observations", "safety observations", "urgent clinical advice",
        "whilst", "fortnight", "A&E", "paracetamol", "GPs", "sectioned",
    ]
    for phrase in phrases:
        check("detect " + phrase, bool(IDIOM.fullmatch(phrase)))
    check("word boundaries and ward off", not IDIOM.search("ward off, wards off, reward, mobile unit, GPO"))

    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / SITE).mkdir(parents=True)
        (root / BASE).parent.mkdir()
        cast, base = root / CAST, root / BASE
        person = {"id": "kit", "name": "Kit", "role": "patient", "pronouns": "they", "pages": ["a.md", "b.md"]}
        cast.write_text(json.dumps({"people": [person], "ignore": ["Brand"]}))
        base.write_text(json.dumps({"surplus_name_uses": 0, "idiom_hits": 1}))
        manifest = {"version": 1, "pages": [
            {"slug": s, "sites": ["res"], "source": s} for s in ("a.md", "b.md", "x.html")]}
        (root / SITE / "shipped_pages.json").write_text(json.dumps(manifest))
        b = root / "b.md"
        b.write_text("<p>Kit</p>")
        a = root / "a.md"
        a.write_text(
            "Kit is named in prose only. Trolley trolley. Professor Ellis.\n"
            '<p id="ward">Kit saw the w<em>ar</em>d. <a href="https://www.example.ca/a">Link</a></p>\n'
            '<p>Friday Friday Friday’s. What What What’s. Brand Brand Brand’s. '
            "Rose Rose Rose's rose. Zed Zed Zed. Pat Pat’s.</p>\n")
        result = measure(root, cast)
        check("only shipped Markdown, all pages read", result["pages_read"] == 2)
        check("one person across pages", result["surplus_name_uses"] == 0)
        check("count visible text only", result["idiom_hits"] == 1)
        check("report a country link", [x["host"] for x in result["country_links"]] == ["example.ca"])
        check("exempt terms and non-names", not result["hard_findings"])
        pins = read_json(base)
        check("at pin", evaluate(result, pins) == 0)
        check("fall", evaluate(result, dict(pins, idiom_hits=2)) == 0)
        check("rise", evaluate(result, dict(pins, idiom_hits=0)) == 1)
        second = dict(person, id="kit-2", pages=["b.md"])
        cast.write_text(json.dumps({"people": [person, second], "ignore": []}))
        check("distinct people sharing a name", measure(root, cast)["surplus_name_uses"] == 1)
        cast.write_text(json.dumps({"people": [dict(person,pages=["a.md","missing.md"])], "ignore": []}))
        # Distinct controls need boundaries. Inline emphasis can split a single word.
        b.write_text("<button>Kit</button><button>Jo</button>")
        a.write_text("<summary>Newby’s</summary><button>Newby</button><button>New<em>by</em></button>")
        broken = measure(root, cast)
        check("H1 unlisted use", any(f.startswith("H1 b.md: Kit") for f in broken["hard_findings"]))
        check("H2 missing name and unshipped page", sum(f.startswith("H2 ") for f in broken["hard_findings"]) == 2)
        check("H3 curly possessive", any(f.startswith("H3 a.md: probable unregistered name Newby") for f in broken["hard_findings"]))
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            check("pins cannot waive hard findings", run(root, cast, base, update=True) == 1 and read_json(base) == pins)
            base.unlink()
            check("missing pin cannot pass", run(root, cast, base) == 2)
    print(f"self-test: {len(checks)}/{len(checks)} passed")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="checkout whose shipped pages to check")
    parser.add_argument("--cast", type=Path, help="cast registry (defaults to the checked tree)")
    parser.add_argument("--baseline", type=Path, help="baseline (defaults to the checked tree)")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--self-test", action="store_true")
    modes.add_argument("--update-baseline", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    return run(args.root, args.cast or args.root / CAST, args.baseline or args.root / BASE,
               update=args.update_baseline, json_output=args.json)


if __name__ == "__main__":
    sys.exit(main())
