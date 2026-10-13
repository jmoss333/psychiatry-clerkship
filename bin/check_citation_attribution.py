#!/usr/bin/env python3
"""A citation must carry an identifier, and that identifier must resolve to the paper CLAIMED.

WHY THIS EXISTS. PR #672 shipped 85 citations; of the 47 that were checkable, 43 were
misattributed or fabricated. PR #640 was 50% wrong. Every gate in this repository was
green. The audit is at 13_Faculty_Resources/Handoffs/CITATION_AUDIT_2026-09-17.md.

13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py resolves the DOIs
and PMIDs it finds and reports the ones that 404. That is a LIVENESS check — "is there a
paper at the end of this string" — and #672 lived entirely in the gap beside it, because
**not one of its fabricated citations carried an identifier at all**. run_citation_check.py
found nothing to look at and passed, correctly, by its own contract.

THE RULING THIS IMPLEMENTS (2026-09-27, Josh). The design draft (PR #694,
docs/superpowers/specs/2026-09-17-citation-attribution-gate-design.md §4) left one
question open: what happens to a citation with no DOI/PMID? Option A was "require an
identifier"; Option B was "search PubMed and judge". The ruling is **A as the gate, B as a
scheduled audit**:

  A is the gate because #672's citations had NO identifiers, so A stops that entire wave
    at the door, before any comparison logic runs. B would have had to correctly
    adjudicate 47 fabrications and would have got some of them wrong.
  B is not a gate because it is heuristic and non-deterministic — the same commit can
    pass today and fail next month as PubMed's index moves. It lives in
    bin/audit_citation_allowlist.py, runs on a schedule, blocks no merge, and its job is
    working the allowlist below down. It is allowed to be wrong because nothing waits on it.

  --require-identifier is therefore ON BY DEFAULT. --no-require-identifier exists for the
  audit and for diagnosis; it is not a way to land a citation.

THE ALLOWLIST IS A RATCHET, NOT AN EXEMPTION. The legacy identifier-less references are
grandfathered one by one, by name, each with a written reason, in
bin/citation_identifier_allowlist.json — and the list is capped at its measured size by
ALLOWLIST_CAP below, which lives in THIS file (policy) and not in the JSON (data), so
raising it is a governance edit that bin/check_policy_content_separation.py forces into
its own reviewable commit. Three properties, copied from the ratchet pattern in
docs/RATCHETS.md:

  1. The debt can only shrink. An addition past the cap fails.
  2. An entry that stops reproducing is reported as STALE on every run until it is deleted.
     Entries are keyed by a hash of the citation's own text, so editing the citation retires
     its grandfather clause — which is the point: an edited citation is new work. Since
     2026-10-07 stale WARNS (exit 0) rather than fails — see WHY STALE WARNS below.
  3. It suppresses ONE finding, citation.no_identifier, and nothing else. It can never
     silence a mismatch. A contradicted citation is fixed, not adjudicated.

WHY STALE WARNS (2026-10-07; the deadlock #982 fixed for check_qbank_draft_exposure.py and
#991 for its sibling). The allowlist lives in bin/, a governance path; the three grandfathered
citations live on case-of-the-week pages (07-20, 08-10, 09-07), which are content.
bin/check_governance_separation.py L1 forbids both in one diff. With stale = FAIL, the content
PR that fixes or edits one of those citations failed this gate; adding the allowlist deletion to
that PR failed L1; and deleting the entry first, in a governance PR, left the still-unfixed
citation unlisted and failed citation.no_identifier. No PR could ever touch those three lines.
So the content PR now passes with a WARN naming the entry, and a follow-up governance PR deletes
it (a content-class commit) and lowers ALLOWLIST_CAP (a policy-class commit).
What stays FAIL: a citation with no identifier that is not listed (citation.no_identifier —
which also catches swapping one listed citation for a new unlisted one at an unchanged count);
a list longer than ALLOWLIST_CAP; a malformed entry, a hand-typed key, a cap desync (only a bin/
edit can cause those). The cost, stated: until the follow-up lands, a stale entry still occupies
a cap slot (over_cap counts every entry), and if the EXACT citation text it names reappears it is
honoured again without a FAIL — the key is a hash of that text, so nothing else can match it.

A CATEGORY EXEMPTION ("legacy citations are exempt") was rejected: a category regrows,
because nothing stops the next citation from joining it. A named, capped list cannot.

WHAT IS CHECKED, and the scope it is checked over.
  SCOPE: numbered lines under a markdown heading whose text is exactly "References", in
  curriculum markdown under CITATION_INCLUDE_PREFIXES (the list run_citation_check.py
  already defines — do NOT introduce a second notion of "curriculum"). Measured on
  origin/main 2026-09-27: 270 references in 44 files. The heading scope is what makes the
  count precise; a bare "a numbered line that looks long enough" rule collects 853 lines,
  most of them prose bullets and reading-list rows, and a gate that cries wolf at that
  volume is switched off within a week and then protects nothing.

  1. citation.no_identifier   no DOI/PMID and not on the allowlist. THE #672 DOOR.
  2. citation.uncached        an identifier absent from the committed cache. FAIL-CLOSED:
                              skipping what cannot be resolved rebuilds #672's hole,
                              because fabricated identifiers are exactly the ones that do
                              not resolve. Fix by running the refresher, not by skipping.
  3. citation.unresolved      the cache records that the service answered "no such paper".
  4. citation.title_mismatch  the identifier resolves to a DIFFERENT paper. The dominant
                              fabrication pattern, and the one a liveness check cannot see.
  5. citation.journal_mismatch / .year_mismatch / .author_mismatch  the rest of the #672
                              taxonomy: right author + wrong journal, right topic + wrong
                              year, wrong person with the same surname.
  6. citation.authors         three identical surnames in one author block — a fabricated
                              author list, detectable with no network call at all.
  7. citation.self_attribution  the site owner listed as an author of an external work.
                              #672 inserted "Moss, J." into a paper he did not write.
  8. allowlist.*              over cap, malformed, or desynchronised from the cap (FAIL);
                              stale (WARN — exit 0, printed every run until deleted).

  Every mismatch prints the claimed value and the resolved value side by side. "Citation 7
  is wrong" sends someone to guess; "claimed Am J Psychiatry, resolved Br J Addict" is
  immediately actionable.

NO NETWORK, EVER. The cache is committed; bin/refresh_citation_attribution_cache.py is the
only thing that touches the network, and it is run by a human, not by CI.

EXIT CODES (docs/RATCHETS.md): 0 clean; 1 a finding; 2 could not check — no cache, no
allowlist, or zero references found. A pass over an empty set is
docs/SILENT_SHRINK_CHECKLIST.md D4 and is not a pass.

USAGE
    python3 bin/check_citation_attribution.py              # the gate
    python3 bin/check_citation_attribution.py --self-test  # falsification; no scan, no network
    python3 bin/check_citation_attribution.py --report-only
    python3 bin/check_citation_attribution.py --json findings.json

Stdlib only.
"""
import argparse
import datetime
import fnmatch
import hashlib
import json
import os
import re
import sys
from difflib import SequenceMatcher

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_PATH = os.path.join(REPO, "bin", "data", "citation_attribution_cache.json")
ALLOWLIST_PATH = os.path.join(REPO, "bin", "citation_identifier_allowlist.json")

# ─── the ratchet pin ─────────────────────────────────────────────────────────────────────────
# The number of identifier-less references grandfathered on 2026-09-27, measured on
# origin/main by this file's own scope rule. It lives HERE, in policy, so that raising it is a
# governance edit that check_policy_content_separation.py forces into its own commit.
#
# It may only go DOWN. When the allowlist is shorter than the cap the gate prints a note
# saying so; lowering the pin then is a one-line policy commit that locks the gain in, exactly
# as --update-baseline does for the three tools in docs/RATCHETS.md.
#
# Note for the record: the design draft measured 23 identifier-less references. That number is
# not reproducible under any reference-section scope; re-measured 2026-09-27 over the ## References
# sections the real figure is 3, and it was also 3 at the draft's own base commit (69281ac). The
# cap is set from the measurement, not from the draft, because 23 would hand the next author 20
# slots of unearned headroom and a ratchet with slack in it is not a ratchet.
ALLOWLIST_CAP = 3

# Reuse run_citation_check.py's notion of "curriculum". Two definitions of which files count is
# how a page ends up governed by neither.
CITATION_INCLUDE_PREFIXES = (
    "01_Six_Week_Curriculum/", "02_Clinical_Skills/", "03_Core_Topics/",
    "04_Acute_and_Safety/", "05_Psychopharmacology/", "06_Family_and_Relational/",
    "07_Evidence_and_Reading/", "08_Cases_and_Simulation/", "09_Exam_Prep/",
    "10_Patient_and_Family_Education/", "11_AI_and_Prompts/", "12_Media/", "14_Tracks/",
)
CITATION_SKIP_PREFIXES = ("00_START_HERE/notebooklm_upload_", "_prototypes/")
CITATION_SKIP_PARTS = ("/_source/",)
SKIP_DIRS = {".git", ".github", "_build", "build", "dist", "node_modules", ".netlify",
             ".worktrees", ".claude", ".codex", ".venv", "13_Faculty_Resources", "99_Archive",
             "docs", "tests", "benchmarks", "sp-proxy", "sp-preview", "faculty-console"}

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
REFERENCE_HEADINGS = ("references",)
NUMBERED_RE = re.compile(r"^\s{0,3}(\d{1,3})\.\s+(.+)$")
MIN_REFERENCE_CHARS = 60

DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.I)
# "EAM" in "van Dis EAM" — a Vancouver initials group, never a surname.
INITIALS_TOKEN_RE = re.compile(r"[A-Z][A-Za-z]{0,3}")
# A personal-author Vancouver block contains at least one "Surname II" pair. Its absence marks
# a corporate author (NICE, ASAM, a collaborative group), where the author comparison does not
# apply — see check_attribution.
PERSONAL_AUTHORS_RE = re.compile(r"\b[A-Z][A-Za-z'’\-]{1,}\s+[A-Z]{1,3}\b")
PMID_RE = re.compile(r"\b(?:PMID|PMCID|PMC)\s*:?\s*(\d{4,9})\b", re.I)
YEAR_RE = re.compile(r"\b(1[5-9]\d{2}|20[0-4]\d)\b")

# Floors for "does the line name this?", measured over the live 270-reference corpus (all
# clean) and against the #672 defects (all fabrications). The separation is not close: genuine
# citations score 0.75-1.00 and the fabrications score 0.00-0.30, so these sit in empty space
# rather than on a boundary. Re-measure with --report-only before moving either.
TITLE_FLOOR = 0.60
CONTAINER_FLOOR = 0.70
SURNAME_RUN_ERROR = 3
SELF_ATTRIBUTION_NAMES = ("moss",)

# Words too common to carry evidence that a line names a particular paper. Kept short on
# purpose: every word removed here is a word a fabrication no longer has to match.
STOPWORDS = frozenset("""
the a an and or of in on for to with without by from as at is are was were be been
study trial review randomized randomised controlled clinical patients adults
""".split())


def today():
    return datetime.date.today().isoformat()


# ─── normalisation ───────────────────────────────────────────────────────────────────────────

def normalize_title(s):
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
    # Subtitle truncation is real and benign: "Foo: The Bar Trial" vs "Foo".
    if len(a) > 20 and len(b) > 20 and (a.startswith(b) or b.startswith(a)):
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def tokens(s, drop_stopwords=True):
    out = [t for t in normalize_title(s).split() if len(t) > 1]
    return [t for t in out if not drop_stopwords or t not in STOPWORDS]


def coverage(needle, haystack):
    """Fraction of `needle`'s content words that appear in `haystack`. 1.0 = fully named.

    This is the whole comparison strategy, and it is a deliberate replacement for parsing the
    citation into author / title / journal / year segments. Vancouver prose in this corpus does
    not survive a `". "` split: titles contain full stops ("Catatonia. I. Rating scale"),
    journals are italicised, trailing `[DOI](https://doi.org/...)` links look like segments,
    and two-word and tussenvoegsel surnames ("Bastos Maia", "van Dis") break a first-token
    rule. A first cut that parsed segments reported 37 findings against a corpus with no
    defects in it — and a gate that cries wolf at that volume is switched off within a week
    and then protects nothing.

    Asking instead "does the citation line NAME the paper this identifier resolves to" needs no
    segmentation, cannot be dodged by malformed prose, and still separates the real defects by
    a wide margin: the Pierce fabrication (a citation about racism whose DOI resolves to a paper
    on keloid cryosurgery) scores ~0.0, and a genuine citation scores 1.0.
    """
    need = tokens(needle)
    if not need:
        return 1.0                      # nothing claimed -> nothing to contradict
    have = set(tokens(haystack))
    return sum(1 for t in need if t in have) / len(need)


def _prefix_match(a, b, floor=4):
    """Vancouver journal abbreviation is truncation: 'Syst' for 'Systematic', 'Rev' for
    'Reviews', 'Addict' for 'Addiction'. So one token matching a prefix of the other is the
    rule, not a fuzzy fallback. The 4-character floor keeps 'psychoactive' from matching
    'psychiatry' — they diverge at character 6 — while still letting 'Rev'/'Reviews' through
    via the short-token branch below."""
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= 3 and long_.startswith(short) and (len(short) >= floor or len(long_) <= 8)


def names_container(line, variants):
    """True when the reference line names the journal under ANY form the services returned.

    Abbreviated vs expanded ("Br J Addict" vs "British Journal of Addiction") is the common
    benign variant, and no whole-string similarity handles it — which is why the cache stores
    every form Crossref and PubMed each returned, and why matching is per-token with the
    prefix rule above. Crossref alone often carries only the expansion ("Cochrane Database of
    Systematic Reviews") where the curriculum writes the abbreviation ("Cochrane Database Syst
    Rev"), and one DOI in the corpus has no PubMed record at all to supply the short form.
    """
    line_tokens = set(tokens(line))
    for variant in variants:
        if not variant:
            continue
        norm = normalize_title(variant)
        if norm and norm in normalize_title(line):
            return True
        need = tokens(variant)
        if not need:
            continue
        hit = sum(1 for t in need if any(_prefix_match(t, lt) for lt in line_tokens))
        if hit / len(need) >= CONTAINER_FLOOR:
            return True
    return False


def names_title(line, resolved_title):
    """Does the line name this paper? Full title first, then the pre-subtitle head.

    Subtitle truncation is a real and benign citation variant — "Joint Clinical Practice
    Guideline on Benzodiazepine Tapering" for a paper subtitled ": Considerations When Risks
    Outweigh Benefits" is a correct citation, and on raw word coverage it scores 0.50. So a
    line that fully names the main title counts as naming the paper, provided that main title
    is substantial enough to identify one: at least three content words, so a head like
    "Delirium" cannot stand in for a whole paper. Returns (ok, score).
    """
    score = coverage(resolved_title, line)
    if score >= TITLE_FLOOR:
        return True, score
    head = str(resolved_title).split(":")[0]
    if len(tokens(head)) >= 3 and coverage(head, line) >= 0.85:
        return True, score
    return False, score


def repeated_surname_runs(surnames):
    counts = {}
    for s in surnames:
        n = normalize_surname(s)
        if len(n) >= 2:
            counts[n] = counts.get(n, 0) + 1
    return {k: v for k, v in counts.items() if v > 1}


def citation_key(text):
    """Stable 16-hex key over the citation's own words.

    Whitespace and the leading reference number are normalised away (renumbering a list is
    not an edit to a citation); everything else is not. Editing the citation changes the key,
    which is what retires an allowlist entry the moment the citation it grandfathers changes.
    """
    body = NUMBERED_RE.match(text.strip())
    body = body.group(2) if body else text
    norm = re.sub(r"\s+", " ", body).strip()
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:16]


# ─── parsing ─────────────────────────────────────────────────────────────────────────────────

class Reference:
    __slots__ = ("path", "line", "raw", "num", "key", "authors_raw", "surnames", "title",
                 "container", "year", "doi", "pmid", "parse_flags")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))
        self.parse_flags = self.parse_flags or []

    @property
    def identifier(self):
        if self.doi:
            return ("doi", self.doi.lower())
        if self.pmid:
            return ("pmid", self.pmid)
        return (None, None)


def parse_reference(path, lineno, raw):
    m = NUMBERED_RE.match(raw)
    if not m:
        return None
    num, body = m.group(1), m.group(2).strip()
    ref = Reference(path=path, line=lineno, raw=raw.strip(), num=int(num),
                    key=citation_key(raw), parse_flags=[])

    doi = DOI_RE.search(body)
    ref.doi = doi.group(0).rstrip(".,;)]") if doi else None
    pmid = PMID_RE.search(body)
    ref.pmid = pmid.group(1) if pmid else None

    y = YEAR_RE.search(body)
    ref.year = int(y.group(1)) if y else None
    if ref.year is None:
        ref.parse_flags.append("no_year")

    # Vancouver: "<authors>. <title>. <container>. <year>;..."
    parts = [p.strip() for p in body.split(". ") if p.strip()]
    if len(parts) < 3:
        ref.parse_flags.append("too_few_segments")
        ref.authors_raw = parts[0] if parts else ""
        ref.surnames = []
        return ref

    ref.authors_raw = parts[0]
    ref.title = parts[1]
    ref.container = parts[2].split(".")[0].strip()

    surnames = []
    for chunk in ref.authors_raw.split(","):
        chunk = chunk.strip().lstrip("*_ ")
        if not chunk or chunk.lower().startswith("et al"):
            continue
        tok = chunk.split()
        if not tok:
            continue
        if len(tok) == 1 and len(tok[0]) <= 3 and tok[0].isupper():
            ref.parse_flags.append("orphan_initials")
            continue
        # The surname is everything but a trailing initials token. Taking tok[0] — the obvious
        # rule — turns "van Dis EAM", "van Veen SC" and "van den Heuvel RM" into three copies of
        # "van" and reports a real eight-author paper as a fabricated author list. It also
        # halves "Bastos Maia S". This was a live false positive on the clean corpus.
        if len(tok) > 1 and INITIALS_TOKEN_RE.fullmatch(tok[-1]):
            tok = tok[:-1]
        surnames.append(" ".join(tok))
    ref.surnames = surnames
    if not surnames:
        ref.parse_flags.append("no_surnames")
    return ref


def in_scope(rel):
    if not rel.endswith(".md"):
        return False
    if rel.startswith(CITATION_SKIP_PREFIXES) or any(p in rel for p in CITATION_SKIP_PARTS):
        return False
    return rel.startswith(CITATION_INCLUDE_PREFIXES)


def references_in_text(rel, text):
    """Numbered lines under a heading whose text is exactly 'References'."""
    out, under = [], False
    for i, line in enumerate(text.split("\n"), 1):
        head = HEADING_RE.match(line)
        if head:
            under = head.group(2).strip().lower() in REFERENCE_HEADINGS
            continue
        if not under:
            continue
        if NUMBERED_RE.match(line) and len(line.strip()) >= MIN_REFERENCE_CHARS:
            ref = parse_reference(rel, i, line)
            if ref:
                out.append(ref)
    return out


def collect_references(repo):
    refs = []
    for root, dirs, files in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in sorted(files):
            rel = os.path.relpath(os.path.join(root, fn), repo)
            if not in_scope(rel):
                continue
            try:
                with open(os.path.join(root, fn), encoding="utf-8") as fh:
                    refs.extend(references_in_text(rel, fh.read()))
            except (OSError, UnicodeDecodeError):
                continue
    return refs


# ─── findings ────────────────────────────────────────────────────────────────────────────────

def finding(code, msg, path=None, line=None):
    return {"code": code, "msg": msg, "path": path, "line": line}


def check_author_plausibility(refs, out):
    for ref in refs:
        for surname, n in sorted(repeated_surname_runs(ref.surnames or []).items()):
            if n >= SURNAME_RUN_ERROR:
                out.append(finding(
                    "citation.authors",
                    f"reference {ref.num}: surname '{surname}' repeats {n}x in one author list "
                    f"(fabricated-author signature): {(ref.authors_raw or '')[:110]}",
                    ref.path, ref.line))


def check_self_attribution(refs, out, names=SELF_ATTRIBUTION_NAMES):
    for ref in refs:
        for s in (ref.surnames or []):
            if normalize_surname(s) in names:
                out.append(finding(
                    "citation.self_attribution",
                    f"reference {ref.num}: '{s}' appears as an author of an external work "
                    f"(#672 did exactly this): {(ref.authors_raw or '')[:90]}",
                    ref.path, ref.line))


def check_identifier_door(refs, allowed_keys, out, require_identifier=True):
    """Option A. A citation with no DOI/PMID fails unless it is named on the allowlist."""
    if not require_identifier:
        return
    for ref in refs:
        kind, _ = ref.identifier
        if kind is not None or ref.key in allowed_keys:
            continue
        out.append(finding(
            "citation.no_identifier",
            f"reference {ref.num} carries no DOI or PMID, so nothing can check that it is the "
            f"paper it claims to be. Add one — every #672 fabrication had no identifier.\n"
            f"        {ref.raw[:150]}\n"
            f"        If this source genuinely has no DOI/PMID (a guideline, a book), it needs "
            f"a named allowlist entry; the list is capped at {ALLOWLIST_CAP} and is full or "
            f"nearly so, so the honest move is almost always to find an identifier.\n"
            f"        citationKey: {ref.key}",
            ref.path, ref.line))


def check_attribution(refs, cache, out):
    """THE check #672 needed: does the identifier resolve to the paper being CLAIMED?"""
    dois = (cache or {}).get("dois") or {}
    pmids = (cache or {}).get("pmids") or {}

    for ref in refs:
        kind, key = ref.identifier
        if kind is None:
            continue
        rec = (dois if kind == "doi" else pmids).get(key)
        if rec is None:
            out.append(finding(
                "citation.uncached",
                f"reference {ref.num}: {kind} {key} is not in the committed metadata cache, so "
                f"its attribution cannot be checked. Run "
                f"`python3 bin/refresh_citation_attribution_cache.py` and commit the result. "
                f"This gate fails closed on purpose: the citations that do not resolve are "
                f"exactly the fabricated ones.", ref.path, ref.line))
            continue
        if rec.get("status") != "resolved":
            out.append(finding(
                "citation.unresolved",
                f"reference {ref.num}: {kind} {key} does not resolve to any paper "
                f"(status={rec.get('status')!r}).", ref.path, ref.line))
            continue

        line = ref.raw

        if rec.get("title"):
            ok, score = names_title(line, rec["title"])
            if not ok:
                out.append(finding(
                    "citation.title_mismatch",
                    f"reference {ref.num}: {kind} {key} resolves to a paper this citation does "
                    f"not name (the line carries {score:.0%} of the resolved title's words, "
                    f"floor {TITLE_FLOOR:.0%}). A resolvable identifier on the wrong paper is "
                    f"the dominant fabrication pattern and the one a liveness check cannot see."
                    f"\n        cited:    {line[:140]}"
                    f"\n        resolves to: {str(rec['title'])[:140]}", ref.path, ref.line))

        if rec.get("container"):
            variants = [rec["container"]] + list(rec.get("containerAlt") or [])
            if not names_container(line, variants):
                out.append(finding(
                    "citation.journal_mismatch",
                    f"reference {ref.num}: the line does not name the journal this identifier "
                    f"resolves to — the single most common #672 defect (CIWA-Ar cited to "
                    f"Am J Psychiatry; it is Br J Addict).\n"
                    f"        cited:    {line[:140]}\n"
                    f"        resolves to: {' / '.join(str(v) for v in variants[:3])[:140]}",
                    ref.path, ref.line))

        if rec.get("year"):
            resolved_year = int(rec["year"])
            claimed_years = {int(y) for y in YEAR_RE.findall(line)}
            if claimed_years and not any(abs(y - resolved_year) <= 1 for y in claimed_years):
                out.append(finding(
                    "citation.year_mismatch",
                    f"reference {ref.num}: the line carries no year within 1 of the resolved "
                    f"{resolved_year} (it carries {', '.join(str(y) for y in sorted(claimed_years))}). "
                    f"#672 cited Marcantonio's NEJM delirium review to 2011; it is 2017.",
                    ref.path, ref.line))

        # Authorship is a SECONDARY net — title and journal carry the weight, and this exists
        # for the "real author, wrong field entirely" shape (#672 cited a hepatologist for
        # thyroid disparities and again for OUD). Two deliberate looseners, each paid for by a
        # false positive found on the clean corpus:
        #   - it asks whether ANY resolved author is named, not the first, because reference
        #     lists reorder and abbreviate;
        #   - it is skipped entirely when the line's author block is corporate rather than
        #     personal ("Joint Clinical Practice Guideline on Benzodiazepine Tapering (ASAM and
        #     collaborating organizations)"), because PubMed lists the twenty individuals who
        #     wrote such a document and the citation correctly names none of them.
        if rec.get("authors") and PERSONAL_AUTHORS_RE.search(ref.authors_raw or ""):
            norm_line = normalize_title(line)
            if not any(normalize_title(a) and normalize_title(a) in norm_line
                       for a in rec["authors"]):
                out.append(finding(
                    "citation.author_mismatch",
                    f"reference {ref.num}: the line names none of the authors of the paper this "
                    f"identifier resolves to ({', '.join(rec['authors'][:4])}).",
                    ref.path, ref.line))


# ─── the allowlist ratchet ───────────────────────────────────────────────────────────────────

REQUIRED_ENTRY_FIELDS = ("citationKey", "citation", "path", "reason", "by", "at")


def check_allowlist(allowlist, refs, out, warn=None):
    """Cap, shape, and staleness. Returns the set of keys the door check may honour.

    Staleness is the half that makes this a ratchet rather than a list of excuses: an entry
    whose citation no longer appears in the tree — because it was fixed, edited or deleted —
    is reported on every run until someone removes it, and keeps occupying a cap slot until
    then. It goes to `warn`, not `out` (see WHY STALE WARNS in the module docstring): a FAIL
    here made those three content pages unfixable under L1. A caller that passes no `warn`
    list gets the old behaviour, so nothing that imports this function changes silently.
    """
    if warn is None:
        warn = out
    entries = (allowlist or {}).get("entries") or []
    declared_cap = (allowlist or {}).get("cap")

    if declared_cap != ALLOWLIST_CAP:
        out.append(finding(
            "allowlist.cap_desync",
            f"{os.path.relpath(ALLOWLIST_PATH, REPO)} declares cap={declared_cap!r} but "
            f"ALLOWLIST_CAP in {os.path.basename(__file__)} is {ALLOWLIST_CAP}. The cap lives in "
            f"the script so that changing it is a governance edit; the JSON copy exists only so "
            f"the file is readable on its own. Make them agree in a policy-only commit."))

    if len(entries) > ALLOWLIST_CAP:
        out.append(finding(
            "allowlist.over_cap",
            f"the identifier allowlist holds {len(entries)} entries; the cap is {ALLOWLIST_CAP}. "
            f"This list may only shrink. A new citation without a DOI/PMID does not get a slot — "
            f"find the identifier, or if the source genuinely has none, retire an existing entry "
            f"first and say in the PR which one and why."))

    present = {ref.key for ref in refs}
    honoured = set()
    for i, entry in enumerate(entries):
        where = f"entry {i + 1}"
        missing = [f for f in REQUIRED_ENTRY_FIELDS if not str(entry.get(f) or "").strip()]
        if missing:
            out.append(finding(
                "allowlist.malformed",
                f"{where} is missing {', '.join(missing)}. Every grandfathered citation names "
                f"itself, the page it is on, why it has no identifier, who decided, and when."))
            continue
        key = entry["citationKey"]
        if citation_key(entry["citation"]) != key:
            out.append(finding(
                "allowlist.key_mismatch",
                f"{where} ({key}): citationKey does not hash the stored citation text. The key "
                f"is derived, not chosen — recompute it with "
                f"`python3 bin/check_citation_attribution.py --key '<citation text>'`."))
            continue
        if key not in present:
            warn.append(finding(
                "allowlist.stale",
                f"{where} ({key}) no longer matches any identifier-less reference in the tree. "
                f"Either the citation was fixed, edited or removed — all good news. Remove this "
                f"entry in a follow-up governance PR (bin/ cannot ride in the content PR that "
                f"fixed the citation — L1), then lower ALLOWLIST_CAP in its own policy commit; "
                f"until then it still occupies a cap slot.\n"
                f"        was: {str(entry['citation'])[:140]}\n"
                f"        on:  {entry.get('path')}"))
            continue
        honoured.add(key)
    return honoured


# ─── report ──────────────────────────────────────────────────────────────────────────────────

def load_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh), None
    except FileNotFoundError:
        return None, f"{os.path.relpath(path, REPO)} does not exist"
    except (OSError, ValueError) as exc:
        return None, f"{os.path.relpath(path, REPO)} is unreadable: {exc}"


def run(repo=REPO, cache=None, allowlist=None, require_identifier=True, out=print,
        warnings_out=None):
    """The whole exit contract, in-process so --self-test can drive it.
    Returns (exit_code, findings). Findings are failures only; a warning (a stale allowlist
    entry) never moves the exit code and is appended to `warnings_out` when one is given."""
    refs = collect_references(repo)
    if not refs:
        out("citation attribution: NO REFERENCES FOUND. A pass over an empty set is not a pass "
            "(docs/SILENT_SHRINK_CHECKLIST.md D4) — the scope rule or the tree is wrong.")
        return 2, []

    findings, warnings = [], []
    honoured = check_allowlist(allowlist, refs, findings, warnings)
    check_author_plausibility(refs, findings)
    check_self_attribution(refs, findings)
    check_identifier_door(refs, honoured, findings, require_identifier)
    check_attribution(refs, cache, findings)

    for level, items in (("FAIL", findings), ("WARN", warnings)):
        for f in items:
            loc = f"{f['path']}:{f['line']}" if f.get("path") else ""
            out(f"  {level}  {f['code']:28s} {loc}\n        {f['msg']}" if loc
                else f"  {level}  {f['code']:28s} {f['msg']}")

    n_id = sum(1 for r in refs if r.identifier[0])
    n_allowed = len(honoured)
    out(f"citation attribution: {len(refs)} reference(s) in "
        f"{len({r.path for r in refs})} file(s); {n_id} carry an identifier "
        f"({100 * n_id / len(refs):.1f}%), {n_allowed} grandfathered of "
        f"{ALLOWLIST_CAP} allowed; {len(findings)} finding(s), {len(warnings)} warning(s)")
    if n_allowed < ALLOWLIST_CAP and not findings:
        first = (f"delete the {len(warnings)} stale entr{'y' if len(warnings) == 1 else 'ies'} "
                 f"(content-class commit), then " if warnings else "")
        out(f"  note: the allowlist is down to {n_allowed} of {ALLOWLIST_CAP}. In a follow-up "
            f"governance PR, {first}lower ALLOWLIST_CAP to {n_allowed} in a policy-only commit "
            f"to lock the gain in.")
    if warnings_out is not None:
        warnings_out.extend(warnings)
    return (1 if findings else 0), findings


# ─── self-test ───────────────────────────────────────────────────────────────────────────────

def self_test():
    """Falsification. Every positive case is a real defect from the #672 audit or from the
    four failure classes the 2026-09-27 ruling requires this gate to have teeth against."""
    failures, checks = [], []

    def ck(label, got, want):
        checks.append(label)
        if got != want:
            failures.append(f"{label}: got {got!r}, want {want!r}")

    # -- real #672 journal misattributions must be caught --
    ck("CIWA journal mismatch",
       names_container("7. Sullivan JT. Assessment of alcohol withdrawal. American Journal of "
                       "Psychiatry. 1989;84(11):1353-7.", ["Br J Addict",
                                                           "British Journal of Addiction"]), False)
    ck("COWS journal mismatch",
       names_container("2. Wesson DR. Clinical opiate withdrawal scale. Journal of Clinical "
                       "Psychiatry. 2003;35(2):253-9.", ["J Psychoactive Drugs"]), False)
    ck("Clegg journal mismatch",
       names_container("4. Clegg A. Which medications to avoid. BMJ. 2011;40(1):23-9.",
                       ["Age Ageing", "Age and Ageing"]), False)
    ck("invented journal",
       names_container("3. Someone A. A paper. Journal of the American Psychiatric Association. "
                       "2019;12(3):1-9.", ["J Natl Black Nurses Assoc"]), False)
    # -- benign variants must NOT be flagged --
    ck("ampersand variant",
       names_container("1. X Y. A paper. *Alcohol & Alcoholism.* 2015;50(1):1-9.",
                       ["Alcohol and Alcoholism"]), True)
    ck("abbrev in line, expansion in record",
       names_container("1. Sullivan JT. Assessment. *Br J Addict.* 1989;84:1353-7.",
                       ["British Journal of Addiction", "Br J Addict"]), True)
    ck("expansion in line, abbrev in record",
       names_container("1. Sullivan JT. Assessment. *British Journal of Addiction.* 1989.",
                       ["Br J Addict", "British Journal of Addiction"]), True)
    # -- coverage: a genuine line names its paper; a fabrication does not --
    ck("subtitle truncation still names the paper",
       coverage("Delirium in Hospitalized Older Adults",
                "2. Marcantonio ER. Delirium in hospitalized older adults: a review. "
                "*N Engl J Med.* 2017;377(15):1456-66.") >= TITLE_FLOOR, True)
    ck("title containing a full stop is not truncated away",
       coverage("Catatonia. I. Rating scale and standardized examination",
                "3. Bush G, Fink M, Petrides G. Catatonia. I. Rating scale and standardized "
                "examination. *Acta Psychiatr Scand.* 1996;93(2):129-36.") >= TITLE_FLOOR, True)
    ck("Pierce CM vs Pierce HE — a resolvable id on the wrong paper",
       coverage("Cryosurgery for hypertrophic scars and keloids",
                "3. Pierce CM. Psychiatric problems of the Black minority. *Am J Psychiatry.* "
                "1974;131(5):512-23.") < TITLE_FLOOR, True)
    ck("3x surname is the fabrication signature",
       repeated_surname_runs(["Sherlock", "Sherwood", "Sherlock", "Sherlock"]).get("sherlock"), 3)
    ck("distinct authors clean", repeated_surname_runs(["Stanley", "Brown", "Brenner"]), {})

    # -- scope: only numbered lines under a References heading --
    doc = ("# Page\n"
           "## Workup & management\n"
           "1. Start with a physical exam and a full set of vitals, then reassess in an hour.\n"
           "## References\n"
           "1. Xia J, Merinder L, Belgamwar M. Psychoeducation for schizophrenia. "
           "Cochrane Database Syst Rev. 2011;2011(6):CD002831. doi:10.1002/14651858.CD002831.pub2.\n")
    found = references_in_text("x.md", doc)
    ck("prose bullets are out of scope", len(found), 1)
    e = found[0]
    ck("author block read", e.surnames, ["Xia", "Merinder", "Belgamwar"])
    ck("doi extracted", e.doi, "10.1002/14651858.CD002831.pub2")
    ck("identifier reported", e.identifier, ("doi", "10.1002/14651858.cd002831.pub2"))
    ck("a bracketed DOI link is extracted",
       references_in_text("x.md", "## References\n1. A B. A paper with a link title here. "
                                  "*J Test.* 2020;1:1-9. "
                                  "[DOI](https://doi.org/10.1056/NEJMcp1605501)\n")[0].doi.lower(),
       "10.1056/nejmcp1605501")
    ck("a PMID-only reference is identified",
       references_in_text("x.md", "## References\n1. A B. A paper with a long enough title to "
                                  "count. *J Test.* 2020;1:1-9. PMID 22563571.\n")[0].identifier,
       ("pmid", "22563571"))

    # -- key is stable under renumbering, unstable under editing --
    ck("renumbering does not change the key",
       citation_key("1. Foo B. A paper. J Test. 2020;1:1.")
       == citation_key("7. Foo B. A paper. J Test. 2020;1:1."), True)
    ck("editing the citation changes the key",
       citation_key("1. Foo B. A paper. J Test. 2020;1:1.")
       != citation_key("1. Foo B. A paper. J Test. 2021;1:1."), True)

    # ── FAILURE CLASS 1: a reference with no identifier ──────────────────────────────────
    noid = references_in_text("x.md", "## References\n9. Hogan AM, Dillon C, Owens R. First "
                                      "episode psychosis workup. Front Psychiatry. 2020;11:1-8.\n")
    out = []
    check_identifier_door(noid, set(), out)
    ck("C1 no-identifier fails by default", [f["code"] for f in out], ["citation.no_identifier"])
    out = []
    check_identifier_door(noid, {noid[0].key}, out)
    ck("C1 an allowlisted citation passes the door", out, [])
    out = []
    check_identifier_door(noid, set(), out, require_identifier=False)
    ck("C1 --no-require-identifier silences the door", out, [])

    # ── FAILURE CLASS 2: a real identifier resolving to a different paper (#672's shape) ──
    bad = references_in_text("x.md", "## References\n7. Sullivan JT, Sykora K, Schneiderman J. "
                                     "Assessment of alcohol withdrawal. American Journal of "
                                     "Psychiatry. 1989;84(11):1353-7. "
                                     "doi:10.1111/j.1360-0443.1989.tb00737.x\n")
    cache = {"dois": {"10.1111/j.1360-0443.1989.tb00737.x": {
        "status": "resolved", "title": "Assessment of alcohol withdrawal",
        "container": "Br J Addict", "containerAlt": ["British Journal of Addiction"],
        "year": 1989, "authors": ["Sullivan", "Sykora", "Schneiderman"]}}, "pmids": {}}
    out = []
    check_attribution(bad, cache, out)
    ck("C2 journal mismatch caught end to end",
       [f["code"] for f in out], ["citation.journal_mismatch"])
    wrongpaper = references_in_text(
        "x.md", "## References\n3. Pierce CM. Psychiatric problems of the Black minority. "
                "*Am J Psychiatry.* 1974;131(5):512-23. doi:10.1000/fake.1974\n")
    out = []
    check_attribution(wrongpaper, {"dois": {"10.1000/fake.1974": {
        "status": "resolved", "title": "Cryosurgery for hypertrophic scars and keloids",
        "container": "J Natl Med Assoc", "containerAlt": ["Journal of the National Medical "
                                                          "Association"],
        "year": 1974, "authors": ["Pierce"]}}, "pmids": {}}, out)
    ck("C2 title mismatch caught end to end (the #672 signature)",
       sorted({f["code"] for f in out}), ["citation.journal_mismatch", "citation.title_mismatch"])
    # -- a genuine, correctly-cited reference produces nothing --
    good = references_in_text(
        "x.md", "## References\n2. Marcantonio ER. Delirium in hospitalized older adults. "
                "*N Engl J Med.* 2017;377(15):1456-1466. "
                "[DOI](https://doi.org/10.1056/NEJMcp1605501)\n")
    out = []
    check_attribution(good, {"dois": {"10.1056/nejmcp1605501": {
        "status": "resolved", "title": "Delirium in Hospitalized Older Adults",
        "container": "N Engl J Med", "containerAlt": ["The New England journal of medicine"],
        "year": 2017, "authors": ["Marcantonio"]}}, "pmids": {}}, out)
    ck("a correct citation produces no finding", [f["code"] for f in out], [])
    # -- the wrong-year defect, with the real #672 example --
    out = []
    wrongyear = references_in_text(
        "x.md", "## References\n2. Marcantonio ER. Delirium in hospitalized older adults. "
                "*N Engl J Med.* 2011;377(15):1456-1466. "
                "[DOI](https://doi.org/10.1056/NEJMcp1605501)\n")
    check_attribution(wrongyear, {"dois": {"10.1056/nejmcp1605501": {
        "status": "resolved", "title": "Delirium in Hospitalized Older Adults",
        "container": "N Engl J Med", "year": 2017, "authors": ["Marcantonio"]}}, "pmids": {}}, out)
    ck("C2 wrong year caught", [f["code"] for f in out], ["citation.year_mismatch"])
    # -- tussenvoegsel and two-word surnames must not read as author mismatches --
    out = []
    dutch = references_in_text(
        "x.md", "## References\n8. van Dis EAM, van Veen SC, Hagenaars MA, van den Heuvel RM. "
                "Long-term outcomes of cognitive behavioral therapy for anxiety-related "
                "disorders. *JAMA Psychiatry.* 2020;77(3):265-273. doi:10.1000/dutch\n")
    check_attribution(dutch, {"dois": {"10.1000/dutch": {
        "status": "resolved",
        "title": "Long-term Outcomes of Cognitive Behavioral Therapy for Anxiety-Related "
                 "Disorders",
        "container": "JAMA Psychiatry", "year": 2020,
        "authors": ["van Dis", "van Veen", "Hagenaars", "van den Heuvel"]}}, "pmids": {}}, out)
    ck("a tussenvoegsel surname is not an author mismatch", [f["code"] for f in out], [])
    ck("three 'van ...' surnames are not a fabricated author list",
       repeated_surname_runs(dutch[0].surnames), {})
    ck("a corporate author block skips the author comparison",
       PERSONAL_AUTHORS_RE.search("Joint Clinical Practice Guideline on Benzodiazepine Tapering "
                                  "(ASAM and collaborating organizations)") is None, True)
    ck("Vancouver abbreviation matches the expansion Crossref returns",
       names_container("27. Pharoah F, Mari J. Family intervention for schizophrenia. "
                       "Cochrane Database Syst Rev. 2010;(12):CD000088.",
                       ["Cochrane Database of Systematic Reviews"]), True)
    ck("subtitle truncation on a substantial main title is not a mismatch",
       names_title("13. Joint Clinical Practice Guideline on Benzodiazepine Tapering (ASAM and "
                   "collaborating organizations), 2025. *J Gen Intern Med.* 2025;40(12):2814.",
                   "Joint Clinical Practice Guideline on Benzodiazepine Tapering: "
                   "Considerations When Risks Outweigh Benefits")[0], True)
    ck("a one-word main title cannot stand in for a whole paper",
       names_title("4. Someone A. Delirium in a completely different sense entirely. "
                   "*J Test.* 2020;1:1-9.",
                   "Delirium: diagnosis, prevention and treatment in the intensive care unit")[0],
       False)
    out = []
    check_attribution(bad, {"dois": {}, "pmids": {}}, out)
    ck("C2 an uncached identifier fails closed", [f["code"] for f in out], ["citation.uncached"])
    out = []
    check_attribution(bad, {"dois": {"10.1111/j.1360-0443.1989.tb00737.x":
                                     {"status": "not-found"}}, "pmids": {}}, out)
    ck("C2 a not-found identifier fails", [f["code"] for f in out], ["citation.unresolved"])

    # ── FAILURE CLASS 3: an allowlist addition beyond the cap ────────────────────────────
    def entry(text, path="x.md"):
        return {"citationKey": citation_key(text), "citation": text, "path": path,
                "reason": "guideline with no DOI", "by": "Josh Moss", "at": "2026-09-27"}

    texts = [f"{i}. Org {i}. *Some guidance {i}.* 2024. [Guidance](https://example.org/{i})"
             for i in range(1, ALLOWLIST_CAP + 2)]
    refs = references_in_text("x.md", "## References\n" + "\n".join(texts) + "\n")
    ck("C3 fixture parsed", len(refs), ALLOWLIST_CAP + 1)
    over = {"cap": ALLOWLIST_CAP, "entries": [entry(t) for t in texts]}
    out = []
    check_allowlist(over, refs, out)
    ck("C3 over-cap fails", [f["code"] for f in out], ["allowlist.over_cap"])
    at_cap = {"cap": ALLOWLIST_CAP, "entries": [entry(t) for t in texts[:ALLOWLIST_CAP]]}
    out = []
    honoured = check_allowlist(at_cap, refs, out)
    ck("C3 exactly at the cap passes", out, [])
    ck("C3 at-cap entries are honoured", len(honoured), ALLOWLIST_CAP)

    # ── FAILURE CLASS 4: a stale entry that no longer reproduces ─────────────────────────
    stale = {"cap": ALLOWLIST_CAP,
             "entries": [entry("1. Nobody N. A citation that is no longer anywhere in the tree. "
                               "Some Journal. 2019;1:1-2.")]}
    out, warned = [], []
    check_allowlist(stale, refs, out, warned)
    ck("C4 a stale entry warns, not fails", ([f["code"] for f in out], [f["code"] for f in warned]),
       ([], ["allowlist.stale"]))
    ck("C4 the warning names the follow-up governance PR",
       "follow-up governance PR" in warned[0]["msg"], True)
    out = []
    check_allowlist(stale, refs, out)
    ck("C4 a caller passing no warn list keeps the old FAIL", [f["code"] for f in out],
       ["allowlist.stale"])

    # ── the deadlock this replaced, end to end, through run()'s exit code ────────────────
    # A content PR fixes a grandfathered citation (adds a PMID). The allowlist (bin/, governance)
    # cannot ride in that PR under L1, so its entry goes stale in the same diff.
    import tempfile
    page = "08_Cases_and_Simulation/case-of-the-week/x.md"
    guide = "1. Org A. *Guidance A.* 2024. [Guidance](https://example.org/a)"
    other = "2. Org B. *Guidance B.* 2024. [Guidance](https://example.org/b)"
    fixed = "1. Org A. *Guidance A.* 2024. PMID: 12345678"
    unlisted = "3. Org C. *Guidance C.* 2024. [Guidance](https://example.org/c)"
    allow = {"cap": ALLOWLIST_CAP, "entries": [entry(guide, page), entry(other, page)]}
    cache_fixed = {"dois": {}, "pmids": {"12345678": {"status": "resolved", "title":
                   "Guidance A", "container": "", "year": 2024, "authors": []}}}

    def tree(*lines):
        d = tempfile.mkdtemp(prefix="cca-selftest-")
        os.makedirs(os.path.join(d, os.path.dirname(page)))
        with open(os.path.join(d, page), "w", encoding="utf-8") as fh:
            fh.write("# Case\n\n## References\n" + "\n".join(lines) + "\n")
        return d

    import shutil
    for label, lines, allowlist_, expect_code, expect_fail, expect_warn in (
        ("baseline: both grandfathered", (guide, other), allow, 0, [], []),
        ("stale (citation fixed, entry not yet removed) -> WARN, exit 0",
         (fixed, other), allow, 0, [], ["allowlist.stale"]),
        ("new unlisted identifier-less citation -> FAIL",
         (guide, other, unlisted), allow, 1, ["citation.no_identifier"], []),
        ("swap a listed citation for an unlisted one at the same count -> FAIL",
         (fixed, unlisted), allow, 1, ["citation.no_identifier"], ["allowlist.stale"]),
        ("over cap -> FAIL",
         (guide, other, unlisted),
         {"cap": ALLOWLIST_CAP, "entries": [entry(t, page) for t in
                                            (guide, other, unlisted, "4. Org D. *D.* 2024.")]},
         1, ["allowlist.over_cap"], ["allowlist.stale"]),
    ):
        d = tree(*lines)
        try:
            warned = []
            code, found = run(repo=d, cache=cache_fixed, allowlist=allowlist_,
                              out=lambda *_: None, warnings_out=warned)
        finally:
            shutil.rmtree(d, ignore_errors=True)
        ck(f"E2E {label}", (code, sorted({f["code"] for f in found}),
                            sorted({w["code"] for w in warned})),
           (expect_code, expect_fail, expect_warn))

    # -- the allowlist may never silence a mismatch --
    out = []
    check_attribution(bad, cache, out)
    check_identifier_door(bad, {bad[0].key}, out)
    ck("an allowlisted citation is still attribution-checked",
       [f["code"] for f in out], ["citation.journal_mismatch"])

    # -- allowlist shape --
    out = []
    check_allowlist({"cap": ALLOWLIST_CAP, "entries": [{"citationKey": "x", "citation": "y"}]},
                    refs, out)
    ck("a malformed entry fails", [f["code"] for f in out], ["allowlist.malformed"])
    out = []
    check_allowlist({"cap": ALLOWLIST_CAP + 9, "entries": []}, refs, out)
    ck("a desynced cap fails", [f["code"] for f in out], ["allowlist.cap_desync"])
    out = []
    bogus = entry(texts[0])
    bogus["citationKey"] = "0000000000000000"
    check_allowlist({"cap": ALLOWLIST_CAP, "entries": [bogus]}, refs, out)
    ck("a hand-typed key fails", [f["code"] for f in out], ["allowlist.key_mismatch"])

    # -- self-attribution --
    out = []
    check_self_attribution(references_in_text(
        "x.md", "## References\n3. Ackerman-Barger K, Moss J, Smith A. Structural racism in "
                "formulation. J Am Psychiatr Assoc. 2019;12(3):1-9.\n"), out)
    ck("self-attribution caught", [f["code"] for f in out], ["citation.self_attribution"])

    # -- the empty-set guard: a pass over nothing is not a pass --
    code, _ = run(repo=os.path.join(REPO, "bin", "data"), cache={}, allowlist={}, out=lambda *_: None)
    ck("an empty scan exits 2, not 0", code, 2)

    # -- and the live tree is clean, which is what certifies the pins are current --
    cache_live, cache_err = load_json(CACHE_PATH)
    allow_live, allow_err = load_json(ALLOWLIST_PATH)
    if cache_err or allow_err:
        failures.append(f"live tree: {cache_err or ''} {allow_err or ''}".strip())
    else:
        code, live = run(cache=cache_live, allowlist=allow_live, out=lambda *_: None)
        ck("the live tree passes the gate", (code, [f['code'] for f in live]), (0, []))

    if failures:
        print("SELF-TEST FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print(f"self-test: OK — {len(checks)}/{len(checks)} checks passed, covering the four failure "
          f"classes the 2026-09-27 ruling requires (no identifier; identifier on a different "
          f"paper; allowlist over cap; stale allowlist entry, which warns), the stale/unlisted/"
          f"swap/over-cap exit codes end to end, the real #672 defects, and the "
          f"live tree against the committed cache and allowlist")
    return 0


# ─── main ────────────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true", help="falsification; no scan, no network")
    ap.add_argument("--report-only", action="store_true", help="print findings, exit 0")
    ap.add_argument("--json", metavar="PATH", help="also write findings as JSON")
    ap.add_argument("--key", metavar="TEXT", help="print the citationKey for a citation and exit")
    ap.add_argument("--no-require-identifier", dest="require_identifier", action="store_false",
                    help="Option B's diagnostic mode: skip the identifier door. NOT a way to "
                         "land a citation — the gate runs with the door on.")
    ap.set_defaults(require_identifier=True)
    args = ap.parse_args()

    if args.key:
        print(citation_key(args.key))
        return 0
    if args.self_test:
        return self_test()

    cache, cache_err = load_json(CACHE_PATH)
    allowlist, allow_err = load_json(ALLOWLIST_PATH)
    for err in (cache_err, allow_err):
        if err:
            print(f"citation attribution: CANNOT CHECK — {err}. This gate is fail-closed; "
                  f"a missing input is exit 2, not a pass.")
            return 2

    warnings = []
    code, findings = run(cache=cache, allowlist=allowlist,
                         require_identifier=args.require_identifier, warnings_out=warnings)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({"generatedAt": today(), "findings": findings, "warnings": warnings},
                      fh, indent=2)
            fh.write("\n")
    return 0 if args.report_only else code


if __name__ == "__main__":
    sys.exit(main())
