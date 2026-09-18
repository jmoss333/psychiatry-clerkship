#!/usr/bin/env python3
"""check_citation_attribution.py — DRAFT. Does the identifier resolve to the paper CLAIMED?

STATUS: DRAFT, deliberately not wired into bin/verify.sh or .github/workflows/ci.yml.
One design question is unresolved — see docs/_planning/2026-09-17-citation-attribution-gate-design.md
§4. Wiring this in before that ruling would ship a policy decision disguised as a script.

WHY THIS EXISTS, and why the existing check is not it.
  13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py resolves DOIs and PMIDs
  and reports the ones that 404. That is a LIVENESS check: "is there a paper at the end of this
  string". It never asks "is it the paper being claimed", and PR #672 lived entirely in that gap —
  85 citations, 43 of 47 checkable ones misattributed or fabricated, every gate green. Not one of
  them carried an identifier, so run_citation_check.py had nothing to look at and passed. It is
  not broken; it answers a different question.

THE DEFECT CLASS, from 13_Faculty_Resources/Handoffs/CITATION_AUDIT_2026-09-17.md:
  - right author, right year, WRONG JOURNAL   (CIWA-Ar cited to Am J Psychiatry; it is Br J Addict)
  - right author, right topic, WRONG YEAR     (Marcantonio NEJM delirium review is 2017, not 2011)
  - real author, WRONG FIELD ENTIRELY         (a hepatologist cited for thyroid and for OUD)
  - INVENTED JOURNAL                          ("Journal of the American Psychiatric Association")
  - WRONG PERSON, SAME SURNAME                (Pierce CM vs the real Pierce HE)
  - SELF-ATTRIBUTION                          ("Moss, J." inserted as co-author of someone's paper)

DESIGN, inherited from the ReConnect precedent (rssm-manual/scripts/appendix_f_checks.py), which
was built against this same defect class. Four properties copied deliberately:

  1. THE CACHE IS COMMITTED AND THIS SCRIPT NEVER TOUCHES THE NETWORK. CI cannot flake on a
     Crossref timeout and a run reproduces months later. A citation gate that fails randomly gets
     marked continue-on-error within a week and then it protects nothing.
  2. A MISSING CACHE ENTRY FAILS — it does not skip. Fail-closed. "Skip what you cannot resolve"
     rebuilds the exact hole #672 walked through, because the fabricated citations are precisely
     the ones that will not resolve.
  3. THRESHOLDED SIMILARITY, NOT EQUALITY. Real variants (subtitle punctuation, & vs and, British
     spelling, online-first pagination) score ~0.7-1.0. Equality would cry wolf constantly.
  4. AUTHOR-LIST PLAUSIBILITY IS AN INDEPENDENT, NETWORK-FREE SIGNAL. Three identical surnames in
     one author block is a fabrication signature no lookup is needed to see.

  Refreshing the cache is a separate, deliberate, network-touching act — mirroring
  rssm-manual/scripts/refresh_citation_cache.py. It is NOT part of this script on purpose.

  @jmoss333: a concurrent session left five working resolver/comparator scripts proven against
  this incident, in its own (unreachable) outputs folder. If you drop them in, rebase this onto
  them — this file reimplements the approach so the design is reviewable now, not because
  reimplementing was better.

Usage:
  python3 bin/check_citation_attribution.py --self-test    # no network, no repo scan, logic only
  python3 bin/check_citation_attribution.py                # scan curriculum against the cache
  python3 bin/check_citation_attribution.py --report-only  # never exit non-zero (soak mode)

Stdlib only.
"""
import argparse
import json
import os
import re
import sys
from difflib import SequenceMatcher

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CACHE_PATH = os.path.join(
    REPO, "13_Faculty_Resources", "_automation", "surveillance", "config",
    "citation_attribution_cache.json")

# Reuse run_citation_check.py's notion of "curriculum". Do NOT introduce a second one — two
# definitions of which files count is how a page ends up governed by neither.
CITATION_INCLUDE_PREFIXES = (
    "01_Six_Week_Curriculum/", "02_Clinical_Skills/", "03_Core_Topics/",
    "04_Acute_and_Safety/", "05_Psychopharmacology/", "06_Family_and_Relational/",
    "07_Evidence_and_Reading/", "08_Cases_and_Simulation/", "09_Exam_Prep/",
    "10_Patient_and_Family_Education/", "11_AI_and_Prompts/", "12_Media/", "14_Tracks/",
)
CITATION_SKIP_PREFIXES = ("00_START_HERE/notebooklm_upload_", "_prototypes/")
CITATION_SKIP_PARTS = ("/_source/",)

DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.I)
PMID_RE = re.compile(r"\b(?:PMID|PMC)\s*:?\s*(\d{4,9})\b", re.I)
# A numbered Vancouver reference: "12. Surname AB, Surname CD. Title. Journal. 2019;44(2):100-8."
REF_RE = re.compile(r"^\s*(\d{1,3})\.\s+(.+)$")
YEAR_RE = re.compile(r"\b(1[89]\d{2}|20[0-4]\d)\b")

# Thresholds. Tuned in the ReConnect corpus against genuine variants, which score ~0.7-1.0.
TITLE_FLOOR = 0.72
CONTAINER_FLOOR = 0.70
# Three or more identical surnames in one author block is the fabricated-author signature.
SURNAME_RUN_ERROR = 3

# Names that must never appear as an author of an EXTERNAL work. #672 inserted the site owner as
# a co-author of a paper he did not write. Configurable, not hardcoded into the logic.
SELF_ATTRIBUTION_NAMES = ("moss",)


# ─── normalisation ───────────────────────────────────────────────────────────────────────────

def normalize_title(s):
    """Lowercase, strip markdown/punctuation, fold & -> and, collapse whitespace."""
    s = re.sub(r"[*_`\[\]]", "", str(s or "")).lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_surname(s):
    return re.sub(r"[^a-z]", "", str(s or "").lower())


def title_similarity(a, b):
    a, b = normalize_title(a), normalize_title(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    # Subtitle truncation is a real and benign variant: "Foo: The Bar Trial" vs "Foo". Containment
    # of a substantial prefix should not read as a mismatch.
    if len(a) > 20 and len(b) > 20 and (a.startswith(b) or b.startswith(a)):
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def containers_agree(claimed, resolved):
    """Journal comparison, tolerant of the variants that are not defects.

    Abbreviated vs expanded ("Br J Addict" vs "British Journal of Addiction") is the common case
    and is NOT handled by raw similarity — it needs the abbreviation map in the cache entry. Where
    the cache supplies `container_alt`, any alternative matching is enough.
    """
    a, b = normalize_title(claimed), normalize_title(resolved)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    return title_similarity(a, b) >= CONTAINER_FLOOR


def repeated_surname_runs(surnames):
    """Return {surname: count} for surnames occurring more than once in one author block."""
    counts = {}
    for s in surnames:
        n = normalize_surname(s)
        if len(n) >= 2:
            counts[n] = counts.get(n, 0) + 1
    return {k: v for k, v in counts.items() if v > 1}


# ─── parsing ─────────────────────────────────────────────────────────────────────────────────

class Entry:
    __slots__ = ("path", "line", "raw", "num", "authors_raw", "surnames", "title",
                 "container", "year", "doi", "pmid", "parse_flags")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))
        self.parse_flags = self.parse_flags or []


def parse_reference(path, lineno, raw):
    """Parse one numbered Vancouver reference. Returns an Entry, possibly with parse_flags."""
    m = REF_RE.match(raw)
    if not m:
        return None
    num, body = m.group(1), m.group(2).strip()

    e = Entry(path=path, line=lineno, raw=raw.strip(), num=int(num), parse_flags=[])

    doi = DOI_RE.search(body)
    e.doi = doi.group(0).rstrip(".,;)") if doi else None
    pmid = PMID_RE.search(body)
    e.pmid = pmid.group(1) if pmid else None

    y = YEAR_RE.search(body)
    e.year = int(y.group(1)) if y else None
    if e.year is None:
        e.parse_flags.append("no_year")

    # Vancouver: "<authors>. <title>. <container>. <year>;..."
    parts = [p.strip() for p in body.split(". ") if p.strip()]
    if len(parts) < 3:
        e.parse_flags.append("too_few_segments")
        e.authors_raw = parts[0] if parts else ""
        e.surnames = []
        return e

    e.authors_raw = parts[0]
    e.title = parts[1]
    e.container = parts[2].split(".")[0].strip()

    # Author block -> surnames. "Stanley B, Brown G, Brenner L, et al" -> [Stanley, Brown, Brenner]
    sn = []
    for chunk in e.authors_raw.split(","):
        chunk = chunk.strip()
        if not chunk or chunk.lower().startswith("et al"):
            continue
        tok = chunk.split()
        if not tok:
            continue
        if len(tok) == 1 and len(tok[0]) <= 3 and tok[0].isupper():
            e.parse_flags.append("orphan_initials")   # bare initials with no surname
            continue
        sn.append(tok[0])
    e.surnames = sn
    if not sn:
        e.parse_flags.append("no_surnames")
    return e


def looks_like_reference(line):
    """Cheap pre-filter: a numbered line long enough to be a real reference."""
    return bool(REF_RE.match(line)) and len(line.strip()) > 60


# ─── checks ──────────────────────────────────────────────────────────────────────────────────

def finding(level, code, msg, path=None, line=None):
    return {"level": level, "code": code, "msg": msg, "path": path, "line": line}


def check_parse_coverage(entries, out):
    """A line that looks like a citation but will not parse is an ERROR, never a silent skip.

    Without this, every check below can be dodged by writing a malformed citation.
    """
    for e in entries:
        for flag in e.parse_flags:
            level = "error" if flag in ("too_few_segments", "no_surnames", "orphan_initials") else "warn"
            out.append(finding(level, "citation.parse",
                               f"reference {e.num} did not parse ({flag}): {e.raw[:110]}",
                               e.path, e.line))


def check_author_plausibility(entries, out):
    """Fabricated author lists, detectable with no network call at all."""
    for e in entries:
        for surname, n in sorted((repeated_surname_runs(e.surnames or [])).items()):
            if n >= SURNAME_RUN_ERROR:
                out.append(finding(
                    "error", "citation.authors",
                    f"reference {e.num}: surname '{surname}' repeats {n}x in one author list "
                    f"(fabricated-author signature): {(e.authors_raw or '')[:110]}",
                    e.path, e.line))
            else:
                out.append(finding(
                    "warn", "citation.authors",
                    f"reference {e.num}: surname '{surname}' appears twice in one author list — "
                    f"verify against the primary source", e.path, e.line))


def check_self_attribution(entries, out, names=SELF_ATTRIBUTION_NAMES):
    """#672 listed the site owner as a co-author of a paper he did not write."""
    for e in entries:
        for s in (e.surnames or []):
            if normalize_surname(s) in names:
                out.append(finding(
                    "error", "citation.self_attribution",
                    f"reference {e.num}: '{s}' appears as an author of an external work. "
                    f"If this citation is genuinely self-authored, add it to the allowlist "
                    f"explicitly: {(e.authors_raw or '')[:90]}", e.path, e.line))


def check_attribution(entries, cache, out, require_identifier=False):
    """THE check #672 needed: does the identifier resolve to the paper being CLAIMED?

    require_identifier is Option A from the design doc's open question and is OFF by default —
    turning it on is a policy ruling, not a default.
    """
    dois = (cache or {}).get("dois", {})
    pmids = (cache or {}).get("pmids", {})

    for e in entries:
        key, table, kind = None, None, None
        if e.doi:
            key, table, kind = e.doi.lower(), dois, "doi"
        elif e.pmid:
            key, table, kind = e.pmid, pmids, "pmid"

        if key is None:
            if require_identifier:
                out.append(finding(
                    "error", "citation.no_identifier",
                    f"reference {e.num} carries no DOI or PMID, so its attribution cannot be "
                    f"verified: {e.raw[:110]}", e.path, e.line))
            continue

        rec = table.get(key) or table.get(key.lower())
        if rec is None:
            # FAIL-CLOSED. Skipping here rebuilds the hole #672 walked through.
            out.append(finding(
                "error", "citation.uncached",
                f"reference {e.num}: {kind} {key} is not in the resolved-metadata cache. "
                f"Refresh the cache; do not skip.", e.path, e.line))
            continue

        if rec.get("status") != "resolved":
            out.append(finding(
                "error", "citation.unresolved",
                f"reference {e.num}: {kind} {key} did not resolve "
                f"(status={rec.get('status')!r})", e.path, e.line))
            continue

        # --- title ---
        if e.title and rec.get("title"):
            score = title_similarity(e.title, rec["title"])
            if score < TITLE_FLOOR:
                out.append(finding(
                    "error", "citation.title_mismatch",
                    f"reference {e.num}: {kind} {key} resolves to a different paper "
                    f"(similarity {score:.2f} < {TITLE_FLOOR}).\n"
                    f"        claimed:  {e.title[:120]}\n"
                    f"        resolved: {str(rec['title'])[:120]}", e.path, e.line))

        # --- container / journal --- the single most common #672 defect
        if e.container and rec.get("container"):
            alts = [rec["container"]] + list(rec.get("container_alt") or [])
            if not any(containers_agree(e.container, alt) for alt in alts):
                out.append(finding(
                    "error", "citation.journal_mismatch",
                    f"reference {e.num}: journal does not match the resolved record.\n"
                    f"        claimed:  {e.container[:90]}\n"
                    f"        resolved: {str(rec['container'])[:90]}", e.path, e.line))

        # --- year --- +/-1 only, for the online-first/print split
        if e.year and rec.get("year"):
            if abs(int(e.year) - int(rec["year"])) > 1:
                out.append(finding(
                    "error", "citation.year_mismatch",
                    f"reference {e.num}: claimed year {e.year}, resolved {rec['year']}",
                    e.path, e.line))

        # --- first author ---
        if e.surnames and rec.get("authors"):
            claimed = normalize_surname(e.surnames[0])
            resolved = [normalize_surname(a) for a in rec["authors"]]
            if claimed and resolved and claimed not in resolved:
                out.append(finding(
                    "error", "citation.author_mismatch",
                    f"reference {e.num}: first author '{e.surnames[0]}' is not among the "
                    f"resolved authors ({', '.join(rec['authors'][:4])})", e.path, e.line))


# ─── scan ────────────────────────────────────────────────────────────────────────────────────

def in_scope(rel):
    if not rel.endswith(".md"):
        return False
    if rel.startswith(CITATION_SKIP_PREFIXES) or any(p in rel for p in CITATION_SKIP_PARTS):
        return False
    return rel.startswith(CITATION_INCLUDE_PREFIXES)


def collect(repo):
    entries = []
    for root, dirs, files in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in
                   (".git", "_build", "node_modules", ".netlify", "13_Faculty_Resources")]
        for fn in files:
            rel = os.path.relpath(os.path.join(root, fn), repo)
            if not in_scope(rel):
                continue
            try:
                with open(os.path.join(root, fn), encoding="utf-8") as fh:
                    for i, line in enumerate(fh, 1):
                        if looks_like_reference(line):
                            e = parse_reference(rel, i, line)
                            if e:
                                entries.append(e)
            except (OSError, UnicodeDecodeError):
                continue
    return entries


def load_cache(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        print(f"citation cache is not valid JSON: {exc}", file=sys.stderr)
        sys.exit(2)


# ─── self-test ───────────────────────────────────────────────────────────────────────────────

def self_test():
    """Exercises the comparison logic on the ACTUAL #672 defects. No network, no repo scan.

    Every positive case below is a real citation from CITATION_AUDIT_2026-09-17.md.
    """
    failures = []

    def ck(label, got, want):
        if got != want:
            failures.append(f"{label}: got {got!r}, want {want!r}")

    # -- the real #672 journal misattributions must be caught --
    ck("CIWA journal mismatch",
       containers_agree("American Journal of Psychiatry", "British Journal of Addiction"), False)
    ck("COWS journal mismatch",
       containers_agree("Journal of Clinical Psychiatry", "Journal of Psychoactive Drugs"), False)
    ck("Clegg journal mismatch", containers_agree("BMJ", "Age and Ageing"), False)
    ck("invented journal",
       containers_agree("Journal of the American Psychiatric Association",
                        "J Natl Black Nurses Assoc"), False)

    # -- benign variants must NOT be flagged --
    ck("ampersand variant",
       containers_agree("Alcohol & Alcoholism", "Alcohol and Alcoholism"), True)
    ck("exact container", containers_agree("N Engl J Med", "N Engl J Med"), True)
    ck("subtitle truncation",
       title_similarity("Delirium in Hospitalized Older Adults: A Review",
                        "Delirium in Hospitalized Older Adults") >= TITLE_FLOOR, True)
    ck("british spelling",
       title_similarity("Behaviour observation of noise", "Behavior observation of noise")
       >= TITLE_FLOOR, True)

    # -- a resolvable identifier on the WRONG paper: the dominant fabrication pattern --
    ck("different paper entirely",
       title_similarity("Assessment of alcohol withdrawal: the revised CIWA-Ar",
                        "Cryosurgery for hypertrophic scars and keloids") < TITLE_FLOOR, True)

    # -- fabricated author list --
    ck("3x surname is error",
       repeated_surname_runs(["Sherlock", "Sherwood", "Sherlock", "Sherlock"]).get("sherlock"), 3)
    ck("distinct authors clean",
       repeated_surname_runs(["Stanley", "Brown", "Brenner"]), {})

    # -- parsing --
    e = parse_reference("x.md", 1,
                        "4. Xia J, Merinder L, Belgamwar M. Psychoeducation for schizophrenia. "
                        "Cochrane Database Syst Rev. 2011;2011(6):CD002831. "
                        "doi:10.1002/14651858.CD002831.pub2.")
    ck("parsed num", e.num, 4)
    ck("parsed surnames", e.surnames, ["Xia", "Merinder", "Belgamwar"])
    ck("parsed year", e.year, 2011)
    ck("parsed doi", e.doi, "10.1002/14651858.CD002831.pub2")
    ck("parsed container", e.container, "Cochrane Database Syst Rev")

    # -- fail-closed: an uncached DOI is an error, not a skip --
    out = []
    check_attribution([e], {"dois": {}, "pmids": {}}, out)
    ck("uncached fails closed", [f["code"] for f in out], ["citation.uncached"])

    # -- the journal mismatch is caught end to end --
    out = []
    bad = parse_reference("x.md", 1,
                          "7. Sullivan JT, Sykora K, Schneiderman J. Assessment of alcohol "
                          "withdrawal. American Journal of Psychiatry. 1989;84(11):1353-7. "
                          "doi:10.1111/j.1360-0443.1989.tb00737.x")
    check_attribution([bad], {"dois": {"10.1111/j.1360-0443.1989.tb00737.x": {
        "status": "resolved", "title": "Assessment of alcohol withdrawal",
        "container": "British Journal of Addiction", "year": 1989,
        "authors": ["Sullivan", "Sykora", "Schneiderman"]}}, "pmids": {}}, out)
    ck("journal mismatch caught end-to-end",
       [f["code"] for f in out], ["citation.journal_mismatch"])

    # -- self-attribution --
    out = []
    check_self_attribution([parse_reference(
        "x.md", 1, "3. Ackerman-Barger K, Moss J, Smith A. Structural racism in formulation. "
                   "Journal of the American Psychiatric Association. 2019;12(3):1-9.")], out)
    ck("self-attribution caught", [f["code"] for f in out], ["citation.self_attribution"])

    # -- Option A door check, off by default --
    out = []
    noid = parse_reference("x.md", 1, "9. Hogan AM, Dillon C, Owens R. First episode psychosis "
                                      "workup. Frontiers in Psychiatry. 2020;11:1-8.")
    check_attribution([noid], {"dois": {}, "pmids": {}}, out, require_identifier=False)
    ck("no-identifier silent by default", out, [])
    out = []
    check_attribution([noid], {"dois": {}, "pmids": {}}, out, require_identifier=True)
    ck("no-identifier fails under Option A", [f["code"] for f in out], ["citation.no_identifier"])

    if failures:
        print("SELF-TEST FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print("self-test: OK -- 20/20 checks passed (cases drawn from the real #672 defects)")
    return 0


# ─── main ────────────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true", help="logic check; no network, no scan")
    ap.add_argument("--report-only", action="store_true", help="never exit non-zero")
    ap.add_argument("--require-identifier", action="store_true",
                    help="Option A: fail any citation with no DOI/PMID (see the design doc)")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    cache = load_cache(CACHE_PATH)
    if cache is None:
        print(f"DRAFT: no resolved-metadata cache at {os.path.relpath(CACHE_PATH, REPO)}.\n"
              f"This gate is fail-closed by design, so it cannot run without one. Populate it "
              f"with a refresher (see the ReConnect precedent, "
              f"rssm-manual/scripts/refresh_citation_cache.py) before wiring this in.")
        return 0 if args.report_only else 3

    entries = collect(REPO)
    out = []
    check_parse_coverage(entries, out)
    check_author_plausibility(entries, out)
    check_self_attribution(entries, out)
    check_attribution(entries, cache, out, require_identifier=args.require_identifier)

    errors = [f for f in out if f["level"] == "error"]
    warns = [f for f in out if f["level"] == "warn"]
    for f in out:
        loc = f"{f['path']}:{f['line']}" if f.get("path") else ""
        print(f"  {f['level'].upper():5s} {f['code']:32s} {loc} {f['msg']}")
    print(f"citation attribution: {len(entries)} reference(s) checked, "
          f"{len(errors)} error(s), {len(warns)} warning(s)")

    if args.report_only:
        return 0
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
