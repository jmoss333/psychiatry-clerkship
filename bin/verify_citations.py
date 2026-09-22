#!/usr/bin/env python3
"""Every citation names a paper. This asks NCBI whether that is the paper.

WHY. In September 2026 PRs #640 and #672 added 85 citations to already-attested
pages and 53 of the 74 checkable ones were wrong (both reverted, #687/#688). The
shapes were: right author and year, WRONG JOURNAL (CIWA-Ar cited to Am J
Psychiatry; it is Br J Addict); right author and topic, WRONG YEAR (Marcantonio's
NEJM delirium review is 2017, not 2011); a real author in the WRONG FIELD (a
hepatologist cited for thyroid and again for OUD); an INVENTED JOURNAL ("Journal
of the American Psychiatric Association"); the WRONG PERSON behind a shared
surname; and the site owner inserted as a co-author of someone else's paper.
`surveillance/bin/run_citation_check.py` resolves identifiers and reports the ones
that 404 — a LIVENESS check. It never asks whether the record is the one being
claimed, and every one of those defects lived in that gap.

THE RULING (Joshua Moss, MD, 2026-09-21) — Option B, search and judge against
NCBI. A citation is NOT failed merely for lacking a DOI or PMID. Three verdicts
and one non-verdict:

  matched      the resolved record agrees with the claim                  -> pass
  mismatch     the resolved record CONTRADICTS the claimed title, author,
               year or journal                                            -> FAIL
  ambiguous    the search ran and could not decide                        -> see
               AMBIGUOUS_POLICY; ruled default `report`: pass, and file a
               finding for faculty adjudication
  unavailable  the search COULD NOT RUN (no egress, rate limit, NCBI
               outage). NOT a verdict and never a content finding: CLAUDE.md
               is explicit that a refused CONNECT tunnel and a host's own 403
               are different things and that reachability is a fact about the
               environment. It exits 2 and is never reported as clean.

Ambiguous does not block because grey literature, books and journals PubMed does
not index legitimately land there; blocking would hand an external index a veto
over the merge queue, which is the #642 decay pattern ("a verdict that fires on
every PR is not a verdict"). The consequence is that the number which matters is
the FALSE NEGATIVE rate on `mismatch` — a fabrication that lands in `ambiguous`
merges. Measured 2026-09-21 against the two labelled sets this repository already
holds: 0 false positives over 370 live citations plus the 26 correct-or-grey
citations in the #640/#672 set, and 29 of that set's 53 wrong citations caught,
9 of the other 24 reading as clean. The matrix, the sweep and the reasons are in
docs/superpowers/specs/2026-09-21-citation-gate-option-b.md.

DETERMINISTIC PER COMMIT. The gate never touches the network. It reads
`bin/data/citation_resolution_cache.json`, which stores what NCBI answered for
each citation (matched PMID, the resolved record, the component scores, the
resolution date) keyed by a hash of the citation's own text. Change the text and
the key changes, so only changed or uncached citations are re-searched. Refreshing
is a separate, deliberate, network-touching act: `--refresh`.

UNCACHED IS NEVER CLEAN. `bin/verify_spans.py` once printed "0 clean, 0 flagged,
49 uncached" and exited 0 because a wrong cache path made every row uncached. Here
an uncached citation, and a cached entry whose status is `unavailable`, are both
counted as NOT EXAMINED: they are named in the report, they are excluded from the
clean count, and with no mismatch present they exit 2, not 0. The coverage line
states what was examined beside the verdict and there is no exit code meaning
"did not look".

EXIT CODES. 0 every citation examined and none contradicted; 1 at least one
`mismatch` (or an `ambiguous` under a blocking policy); 2 could not check — the
corpus could not be read, the cache is unreadable, a citation is uncached or
`unavailable`, or a `--base` was named that does not resolve.

    python3 bin/verify_citations.py                 # the gate, offline
    python3 bin/verify_citations.py --json          # machine-readable
    python3 bin/verify_citations.py --findings-out F  # ambiguous queue as JSON
    python3 bin/verify_citations.py --refresh       # resolve uncached/changed (network)
    python3 bin/verify_citations.py --self-test     # every tier fires; offline

NOT WIRED IN. Deliberately absent from `bin/verify.sh` and `.github/workflows/ci.yml`:
adding a CI step trips three to five separate pin contracts (CLAUDE.md), so that is
its own PR and its own decision about what exit 2 should mean there.

Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from difflib import SequenceMatcher
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "bin" / "data" / "citation_resolution_cache.json"
ADJUDICATIONS = ROOT / "bin" / "data" / "citation_adjudications.json"

# ---------------------------------------------------------------------------------------
# THE ONE POLICY SWITCH.
#
# What an `ambiguous` verdict does. Ruled by Joshua Moss, MD on 2026-09-21: `report`.
# This is policy, not a cautious placeholder — see the header. Flipping it is this one
# line (or --ambiguous-policy for a trial run).
#
#   report          pass, and file a finding for faculty adjudication   <- RULED DEFAULT
#   block           fail
#   block-new-only  fail for citations this branch introduces, pass for the
#                   grandfathered legacy set (needs a resolvable --base)
# ---------------------------------------------------------------------------------------
AMBIGUOUS_POLICY = "report"
AMBIGUOUS_POLICIES = ("report", "block", "block-new-only")

# ---------------------------------------------------------------------------------------
# Thresholds. Calibrated 2026-09-21 against the two labelled sets the repository already
# holds — the identifier-carrying references on `main` as positives and the citations
# PRs #640/#672 added as negatives (verdicts from
# 13_Faculty_Resources/Handoffs/CITATION_AUDIT_2026-09-17.md). The matrix and how each
# number was chosen are in docs/superpowers/specs/2026-09-21-citation-gate-option-b.md.
# ---------------------------------------------------------------------------------------
# TITLE_ID_FLOOR is THE confidence floor. Two jobs, and they pull in opposite
# directions, which is why one number carries the calibration:
#   identity  — a searched candidate at or above it IS the paper being claimed, so a
#               disagreement in any other field is a contradiction rather than a miss;
#   agreement — a resolved record below it is a different paper, i.e. a contradiction.
# Raise it and real citations with title variants start failing (false positives);
# lower it and a fabricated title attached to a real record reads as the same paper
# (false negatives).
TITLE_ID_FLOOR = 0.85
CONTAINER_FLOOR = 0.80    # journal-string similarity fallback after abbreviation folding
YEAR_TOLERANCE = 1        # the online-first / print split, and nothing wider
# Reported only: the verdict is per-field (see contradictions()), because a citation
# right about everything except the journal composites too high to catch any other way.
WEIGHTS = {"title": 0.45, "author": 0.20, "year": 0.15, "container": 0.20}

# Bumped whenever extraction or resolution changes what NCBI would be ASKED. A cached
# answer is an answer to a question, and the key only hashes the citation's text: when
# the PMCID-as-PMID bug was fixed, three citations kept their old (wrong) anchored
# records because the text had not changed. An entry written by a different resolver is
# NOT examined -- it re-resolves on the next --refresh and reads as exit 2 until then.
RESOLVER_VERSION = 3

UA = ("clerkship-citation-verify/1.0 "
      "(+https://github.com/jmoss333/psychiatry-clerkship; education)")
ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
TIMEOUT_S = 20
THROTTLE_S = 0.40         # 3 req/s unkeyed; NCBI_API_KEY lifts the ceiling, not this
RETRIES = 2
MAX_CANDIDATES = 20
# How many of an author's in-window records the untitled path will actually look at.
# Beyond this it reports `ambiguous` rather than claiming a contradiction over a set it
# did not examine.
AUTHOR_WINDOW_CAP = 120
ESUMMARY_BATCH = 60

# Curriculum, as run_citation_check.py already defines it. Do NOT introduce a second
# notion of which files count — two definitions is how a page ends up governed by neither.
INCLUDE_PREFIXES = (
    "01_Six_Week_Curriculum/", "02_Clinical_Skills/", "03_Core_Topics/",
    "04_Acute_and_Safety/", "05_Psychopharmacology/", "06_Family_and_Relational/",
    "07_Evidence_and_Reading/", "08_Cases_and_Simulation/", "09_Exam_Prep/",
    "10_Patient_and_Family_Education/", "11_AI_and_Prompts/", "12_Media/", "14_Tracks/",
)
SKIP_PREFIXES = ("00_START_HERE/notebooklm_upload_", "_prototypes/")
SKIP_PARTS = ("/_source/",)
SKIP_DIRS = {".git", "_build", "build", "dist", "node_modules", ".netlify", "site",
             "13_Faculty_Resources", "99_Archive", "tests"}

DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+")
# A PMCID is NOT a PMID. "(Free full text: PMC4170907.)" on a Cochrane review resolved
# PMID 4170907 — a 1968 Lancet paper on germfree isolators — and the gate called three
# real citations fabrications. Anchoring to the wrong namespace is the worst kind of
# false positive: confident, specific and completely wrong.
PMID_RE = re.compile(r"\bPMID\s*:?\s*(\d{4,9})\b", re.I)
YEAR_RE = re.compile(r"\b(1[89]\d{2}|20[0-5]\d)\b")
HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.*)$")
NUMBERED_RE = re.compile(r"^\s*(\d{1,3})\.\s+(.+)$")
BULLET_RE = re.compile(r"^\s*[-*]\s+(.+)$")
BULLET_YEAR_RE = re.compile(
    r"^(?P<authors>[^()]{3,170}?)\s*\((?P<year>1[89]\d{2}|20[0-5]\d)\)\s*(?P<rest>.*)$")
# A bullet is a citation only when a separator or an emphasised container follows the
# year. Without this, "- The Joint Commission. Joint Commission (2018)." and every
# "**Evidence:** Kane et al. (1988): ..." teaching bullet enters the corpus as noise.
BULLET_SEP_RE = re.compile(r"^[.,:;]?\s*(?:—|–|--|-)\s*\S")
BULLET_EMPH_RE = re.compile(r"^[.,]?\s*(?:\*\*|\*|_)(?P<c>[^*_]{4,140})(?:\*\*|\*|_)")
EMPH_RE = re.compile(r"(?:\*\*|\*|_)(?P<c>[^*_\n]{4,140})(?:\*\*|\*|_)")

# Headings under which a citation lives. Anything outside one of these is only picked up
# when it carries a DOI or PMID, which is unambiguous on its own.
REF_HEADING_RE = re.compile(
    r"^\W*(references|sources|bibliography|citations|further reading|reading list|"
    r"recommended (?:books|reading)|key (?:papers|references)|"
    r"evidence[‐-― -]based resources|media resources|landmark)", re.I)

# A container string PubMed's journal index does not know is only treated as a
# contradiction when it still reads as a journal name. Without this test, every book and
# manual in a container slot ("The Body Keeps the Score", "Motivational Interviewing:
# Helping People Change", "TIP 41", DSM-5) becomes a fabrication finding, which is the
# false-positive class that would retire the gate in a week.
JOURNALISH = frozenset("""
journal journals annals archives bulletin review reviews lancet jama nejm bmj medicine
medical psychiatry psychiatric psychology psychological
quarterly proceedings reports research letters communications forum open network plos
bmc cochrane acta pediatrics paediatrics neurology neuroscience neurosciences addiction
addictive dependence abuse alcohol alcoholism drug drugs nursing healthcare
services hospital hospitals therapeutics trials trial
epidemiology geriatrics gerontology oncology surgery pharmacology pharmacotherapy
toxicology circulation endocrinology immunology genetics bioethics rehabilitation
""".split())
# Word-bounded, and matched against the CONTAINER, not the whole line. The first cut
# tested the line with plain substrings, so "press" matched inside "depression" and
# "th ed" inside "health education": three real fabrications were waved through as
# "grey literature" by the prose that described them.
NOT_LITERATURE_RE = re.compile(
    r"\b(?:handbook|textbook|guidebook|manual|casebook|workbook|"
    r"\d+(?:st|nd|rd|th)\s+ed|ed\.?\)|edition|revised|guide|press|publishing|publishers|"
    r"dsm|tip|guideline|guidelines|guidance)\b", re.I)
# Markers that can only sit in the surrounding line, never in a journal name.
LINE_NOT_LITERATURE_RE = re.compile(r"\bisbn\b|\(\s*\d+(?:st|nd|rd|th)\s+ed", re.I)
# A body, not a journal: "American Psychiatric Association", "Department of Veterans
# Affairs". Only when the string carries no journal head-word, because "Journal of the
# American Geriatrics Society" is a journal and says so.
ORGANISATION = frozenset("""
association society college academy administration department commission organization
organisation foundation institute institutes agency ministry council federation
""".split())
JOURNAL_HEADWORD = frozenset("""
journal journals annals archives bulletin review reviews proceedings letters reports
quarterly
""".split())

STOPWORDS = {"of", "the", "and", "for", "in", "a", "an", "on", "to"}

FINDING_SEVERITY = {"mismatch": "S1", "ambiguous": "S3"}


class CheckError(RuntimeError):
    """The checker could not determine the answer. Never a pass."""


# =======================================================================================
# Normalisation and comparison. Pure; the self-test drives all of it.
# =======================================================================================

_FOLD = {"‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-",
         "−": "-", "‘": "'", "’": "'", "“": '"', "”": '"',
         " ": " "}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKC", str(s or ""))
    for a, b in _FOLD.items():
        s = s.replace(a, b)
    return s


def norm_text(s: str) -> str:
    """Lower-case, drop markdown and punctuation, fold & -> and, collapse whitespace."""
    s = fold(s).lower()
    s = re.sub(r"[*_`\[\]]", "", s)
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_surname(s: str) -> str:
    return re.sub(r"[^a-z]", "", fold(s).lower())


def title_abbreviates(claimed: str, resolved: str) -> bool:
    """Is the claimed title a shortened form of the resolved one, rather than a
    different title?

    Reading-list pages cite by short title — "Good Psychiatric Management:
    foundations" for "Good Psychiatric Management of Borderline Personality Disorder:
    Foundations and Future Challenges" — and raw similarity scores those at 0.38-0.64,
    i.e. indistinguishable from a fabrication. Every content word of the claim appearing
    in the record's own title is the difference: an abbreviation borrows words, an
    invented title introduces them. Order is not required (a short title may lead with
    the subtitle), but at least three content words are, so a two-word label cannot
    match half the corpus."""
    c, r = set(_tokens(claimed)), set(_tokens(resolved))
    return len(c) >= 3 and len(r) > len(c) and c <= r


def title_similarity(a: str, b: str, abbrev: bool = True) -> float:
    """`abbrev` tolerates a short-form title. It is right when the record is ANCHORED --
    the identifier already says which paper this is, so the only question is whether the
    text disagrees. It is wrong when the title is what FINDS the paper: "Safety Planning
    Intervention: A Brief Intervention to Mitigate Suicide Risk" is a token subset of a
    longer, different paper's title, and treating that as identity 1.00 made a correct
    citation (in a journal PubMed does not index) read as a fabrication."""
    if not a or not b:
        return 0.0
    if abbrev and (title_abbreviates(a, b) or title_abbreviates(b, a)):
        return 1.0
    a, b = norm_text(a), norm_text(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    # Subtitle truncation ("Foo: the Bar trial" vs "Foo") is a real and benign variant.
    if len(a) > 20 and len(b) > 20 and (a.startswith(b) or b.startswith(a)):
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _tokens(s: str) -> list[str]:
    return [t for t in norm_text(s).split() if t and t not in STOPWORDS]


def abbrev_match(a: str, b: str) -> bool:
    """"Br J Addict" vs "British Journal of Addiction" — each token of the shorter form
    is a prefix of a token of the longer one, in order. Raw similarity cannot see this,
    and the abbreviated/expanded split is the commonest benign journal variant."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return False
    short, long = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    i = 0
    for tok in long:
        if i < len(short) and (tok.startswith(short[i]) or short[i].startswith(tok)):
            i += 1
    return i == len(short)


def containers_agree(claimed: str, *resolved: str) -> bool:
    c = norm_text(claimed)
    if not c:
        return False
    for r in resolved:
        r = norm_text(r)
        if not r:
            continue
        if c == r or c in r or r in c:
            return True
        if abbrev_match(claimed, r):
            return True
        if SequenceMatcher(None, c, r).ratio() >= CONTAINER_FLOOR:
            return True
    return False


def looks_like_journal(container: str) -> bool:
    """Is this container string a journal claim at all, or a book / manual / TIP?

    A positive test, not a negative one. Defaulting to "journal unless it looks like a
    book" reads *Cognitive-Behavioral Treatment of Borderline Personality Disorder* as a
    journal and calls a real book a fabrication, which is the false positive that would
    retire the gate. The cost is on the other side and is stated in the calibration: a
    fabricated journal whose name uses none of these words lands in `ambiguous`."""
    if not container or NOT_LITERATURE_RE.search(fold(container)):
        return False
    tokens = set(_tokens(container))
    if tokens & ORGANISATION and not tokens & JOURNAL_HEADWORD:
        return False
    return bool(JOURNALISH & tokens)


def citation_key(raw: str) -> str:
    """Stable identity for a citation: a hash of its own normalised text. Editing the
    citation changes the key, which is exactly what makes `re-search only what changed`
    mean something."""
    return sha256(norm_text(raw).encode("utf-8")).hexdigest()[:16]


# =======================================================================================
# Extraction
# =======================================================================================

class Citation:
    __slots__ = ("key", "path", "line", "raw", "shape", "surnames", "authors_raw",
                 "year", "title", "container", "doi", "pmid", "not_literature")

    def __init__(self, **kw):
        for slot in self.__slots__:
            setattr(self, slot, kw.get(slot))

    def as_dict(self) -> dict:
        return {s: getattr(self, s) for s in self.__slots__}

    @property
    def first_surname(self) -> str:
        return (self.surnames or [""])[0]


def _surnames(author_block: str) -> list[str]:
    """"Stanley B, Brown G, Brenner L, et al" -> [Stanley, Brown, Brenner].
    "Harper, C., Matsumoto, I." -> [Harper, Matsumoto]. "Stanley & Brown" -> both."""
    block = fold(author_block or "")
    block = re.sub(r"\b(et al\.?|and others)\b.*$", "", block, flags=re.I)
    block = re.sub(r"[*_`]", "", block)
    out: list[str] = []
    for chunk in re.split(r",|;|\band\b|&", block):
        chunk = chunk.strip(" .")
        if not chunk:
            continue
        tok = chunk.split()
        if not tok:
            continue
        head = tok[0].strip(".")
        # A bare initials group ("J.T." / "AB") belongs to the previous surname.
        if len(head) <= 3 and (head.isupper() or re.fullmatch(r"(?:[A-Z]\.?){1,3}", chunk)):
            continue
        if not re.match(r"^[A-Za-z][A-Za-z'\-]{1,}$", head):
            continue
        out.append(head)
    return out


def _initials(author_block: str, surname: str) -> str:
    """The initials PubMed wants after the surname: "Sullivan, J.T." -> "JT"."""
    block = fold(author_block or "")
    m = re.search(re.escape(surname) + r"[,\s]+((?:[A-Z]\.?\s?){1,3})(?![a-z])", block)
    if not m:
        return ""
    return re.sub(r"[^A-Z]", "", m.group(1))[:3]


APPARATUS_RE = (
    (re.compile(r"\[([^\]\n]*)\]\([^)\n]*\)"), r"\1"),          # [DOI](https://…) -> DOI
    (re.compile(r"\bdoi:\s*\S+", re.I), " "),
    (re.compile(r"\bhttps?://\S+"), " "),
    (re.compile(r"\bPMC?ID?:?\s*\d+", re.I), " "),
    (re.compile(r"\(\s*free full text[^)]*\)", re.I), " "),
    (re.compile(r"[·•|]"), " "),
)
BOLD_RE = re.compile(r"\*\*(?P<t>[^*\n]{8,300}?)\*\*")
ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(?P<c>[^*\n]{3,140}?)\*(?!\*)")
# Vancouver's "2022;17(3)" is the publication year. A year inside a TITLE ("…the 2020
# ASAM clinical practice guideline…") is not, and taking the first four digits that look
# like a year cut four real citations in the middle of their own titles.
YEAR_VOL_RE = re.compile(r"\b(1[89]\d{2}|20[0-5]\d)\s*(?=[;:])")
# A span already claimed by an emphasis marker is blanked, so the dot-split fallback
# below cannot claim it a second time. A control character was tried first and is a trap:
# Python counts \x1c-\x1f as whitespace, so `" \x1f ".strip()` is "" and
# `str.replace("", " ")` then inserts a space between every character of the title.
_SENT = " "


def _clean_field(value) -> str | None:
    # A trailing colon is NOT stripped: claims_a_title() reads it as the signature of a
    # connective fragment ("Also published as:") that the dot-split left behind.
    v = re.sub(r"\s+", " ", str(value or "")).strip(" .,*_()[]")
    return v or None


def _strip_apparatus(body: str) -> str:
    b = fold(body)
    for pat, repl in APPARATUS_RE:
        b = pat.sub(repl, b)
    return re.sub(r"\s+", " ", b).strip()


def parse_numbered(body: str, titleless_ok: bool = False) -> dict:
    """Vancouver: "<authors>. <title>. <container>. <year>;vol(iss):pp. doi:…".

    Emphasis markers are honoured when present and dot-splitting is the fallback,
    because the corpus uses both and mixes them: "Boyer EW, Shannon M. **The serotonin
    syndrome.** *N Engl J Med.* 2005;…" dot-splits into the wrong three segments (the
    title keeps the bold's own full stop, and the container comes out as the DOI link).
    Getting this wrong does not make a citation fail — it makes it unparseable, which is
    counted, not skipped.
    """
    out = {"authors_raw": "", "title": None, "container": None, "year": None}
    b = _strip_apparatus(body)

    m = YEAR_VOL_RE.search(b)
    if not m:
        matches = list(YEAR_RE.finditer(b))
        m = matches[-1] if matches else None
    if m:
        out["year"] = int(m.group(1))
        head = b[:m.start()]
    else:
        head = b
    head = head.rstrip(" .,;:")

    title = container = None
    bold = BOLD_RE.search(head)
    if bold:
        title = bold.group("t").strip(" .,")
        head = head[:bold.start()] + _SENT + head[bold.end():]
    # The LAST italic run before the year: the container is the final field, and a title
    # can carry italics of its own mid-sentence.
    for it in reversed(list(ITALIC_RE.finditer(head))):
        cand = it.group("c").strip(" .,")
        if not cand or (title and norm_text(cand) == norm_text(title)):
            continue
        container = cand
        head = head[:it.start()] + _SENT + head[it.end():]
        break

    segs = [s.strip(" *_") for s in head.split(". ")]
    segs = [s for s in segs if s]
    if title is None and container is None:
        if len(segs) >= 3:
            out["authors_raw"], title = segs[0], ". ".join(segs[1:-1])
            container = segs[-1]
        elif titleless_ok and len(segs) == 2:
            # "- Authors, et al. Journal. Year;vol:pp. doi:…" — no title at all. Only
            # admitted when the line carries an identifier, which settles what it is.
            out["authors_raw"], container = segs[0], segs[1]
    elif title is None:
        if len(segs) >= 2:
            out["authors_raw"], title = segs[0], ". ".join(segs[1:])
    elif container is None:
        if len(segs) >= 2:
            out["authors_raw"], container = segs[0], segs[-1]
    else:
        out["authors_raw"] = segs[0] if segs else ""

    if container:
        container = re.sub(r"[,;].*$", "", container)
        container = re.sub(r"\s*\d{4}.*$", "", container).strip(" .")
    out["title"] = _clean_field(title)
    out["container"] = _clean_field(container)
    return out


_ET_AL_RE = re.compile(r"(?i)^et al\.?$")


def plausible_vancouver(parsed: dict) -> bool:
    """Did the dot-split actually find a citation, or just cut prose into three pieces?

    "Sullivan, J.T. et al. (1989) - *Am J Psychiatry* - ..." splits into title "et al"
    and container "(", which is not a parse; without this the bullet shapes below never
    get their turn and the #672 corpus reads as Vancouver garbage."""
    title = (parsed.get("title") or "").strip()
    container = (parsed.get("container") or "").strip()
    if len(container) < 3 or not re.search(r"[A-Za-z]{3}", container) or len(container) > 140:
        return False
    if _ET_AL_RE.match(container) or (title and _ET_AL_RE.match(title)):
        return False
    if title and (len(title) < 12 or " " not in title):
        return False
    return True


def parse_bullet(body: str) -> dict | None:
    """"- Sullivan, J.T. et al. (1989) - *American Journal of Psychiatry* - prose".

    The shape PRs #640 and #672 actually used. A gate that reads only numbered Vancouver
    references would not have seen one of the 85 citations that caused the incident —
    docs/SILENT_SHRINK_CHECKLIST.md, a check reporting success over a smaller set than
    the one it claims to check."""
    m = BULLET_YEAR_RE.match(fold(body).strip())
    if not m:
        return None
    rest = m.group("rest")
    emph = BULLET_EMPH_RE.match(rest)
    if not emph and not BULLET_SEP_RE.match(rest):
        return None
    authors_raw = re.sub(r"^\**", "", m.group("authors")).strip(" .*")
    container = None
    if emph:
        container = emph.group("c").strip()
    else:
        after = EMPH_RE.search(rest[:160])
        if after:
            container = after.group("c").strip()
    if container:
        container = re.sub(r"\s*\(.*?\)\s*$", "", container).strip(" .,:")
    return {"authors_raw": authors_raw, "year": int(m.group("year")),
            "title": None, "container": container}


def in_scope(rel: str) -> bool:
    if not rel.endswith(".md"):
        return False
    if rel.startswith(SKIP_PREFIXES) or any(p in rel for p in SKIP_PARTS):
        return False
    return rel.startswith(INCLUDE_PREFIXES)


def extract_from_text(text: str, rel: str) -> tuple[list[Citation], list[dict]]:
    """Citations, plus the lines in a reference section that did NOT parse as one.

    The second list is the anti-shrink signal: a new citation shape shows up there as a
    rising unparsed count rather than as silence."""
    cites: list[Citation] = []
    unparsed: list[dict] = []
    in_refs, ref_level = False, 0
    for lineno, line in enumerate(fold(text).splitlines(), 1):
        head = HEADING_RE.match(line)
        if head:
            level, title = len(head.group(1)), re.sub(r"[*_`#]", "", head.group(2)).strip()
            if REF_HEADING_RE.match(title):
                in_refs, ref_level = True, level
            elif in_refs and level <= ref_level:
                in_refs = False
            continue
        stripped = line.strip()
        if len(stripped) < 60:
            continue
        doi = DOI_RE.search(stripped)
        pmid = PMID_RE.search(stripped)
        has_id = bool(doi or pmid)
        num = NUMBERED_RE.match(line)
        bul = BULLET_RE.match(line) if not num else None
        if not num and not bul:
            continue
        if not in_refs and not has_id:
            continue

        # Vancouver first, for numbered lines AND for bullets: `07_Evidence_and_Reading/
        # Inpatient_Evidence/evidence_inpatient.md` carries 132 real, DOI-bearing
        # citations as title-less Vancouver bullets ("- Authors. Journal. Year;vol:pp.
        # doi:…"), and a gate that only understood numbered lines would have reported a
        # clean 246 while never opening any of them.
        body = num.group(2) if num else bul.group(1)
        parsed = parse_numbered(body, titleless_ok=has_id)
        fields, shape = None, None
        qualifies = parsed["authors_raw"] and plausible_vancouver(parsed) and (
            (parsed["title"] and parsed["container"] and parsed["year"])
            or (has_id and parsed["container"]))
        if qualifies:
            fields, shape = parsed, "vancouver"
        elif bul:
            alt = parse_bullet(body)
            if alt:
                fields, shape = alt, "bullet"
        if fields is None:
            if in_refs:
                unparsed.append({"path": rel, "line": lineno, "raw": stripped[:180]})
            continue

        surnames = _surnames(fields["authors_raw"])
        if not surnames:
            if in_refs:
                unparsed.append({"path": rel, "line": lineno, "raw": stripped[:180]})
            continue
        cites.append(Citation(
            key=citation_key(stripped), path=rel, line=lineno, raw=stripped,
            shape=shape, surnames=surnames, authors_raw=fields["authors_raw"],
            year=fields.get("year"), title=fields.get("title"),
            container=fields.get("container"),
            doi=doi.group(0).rstrip(".,;)") if doi else None,
            pmid=pmid.group(1) if pmid else None,
            not_literature=bool(LINE_NOT_LITERATURE_RE.search(stripped))))
    return cites, unparsed


def collect(root: Path = ROOT) -> tuple[list[Citation], list[dict], int]:
    cites: list[Citation] = []
    unparsed: list[dict] = []
    files = 0
    for dirpath, dirs, filenames in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in sorted(filenames):
            rel = os.path.relpath(os.path.join(dirpath, fn), root)
            if not in_scope(rel):
                continue
            try:
                text = Path(dirpath, fn).read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as exc:
                raise CheckError(f"cannot read {rel}: {exc}") from exc
            files += 1
            c, u = extract_from_text(text, rel)
            cites.extend(c)
            unparsed.extend(u)
    if files == 0:
        raise CheckError("no curriculum markdown found in scope — a pass over an empty "
                         "corpus is not a pass (docs/SILENT_SHRINK_CHECKLIST.md D4)")
    return cites, unparsed, files


# =======================================================================================
# The judge. Pure: a claim plus what NCBI answered, in; one verdict, out.
# =======================================================================================

# "Joint Clinical Practice Guideline on Benzodiazepine Tapering (ASAM and collaborating
# organizations)" is a corporate author, and the Vancouver dot-split makes its first word
# look like a surname. A parse artifact must never become a fabrication finding.
PERSONAL_AUTHOR_RE = re.compile(
    r"(?:\b[A-Z][a-z\u00c0-\u024f'\-]+,?\s+(?:[A-Z]\.?\s?){1,3}(?![a-z])"   # Sullivan JT / Sullivan, J.T.
    r"|\bet al\b|&|\band\b\s+[A-Z][a-z])")


def authors_look_personal(block: str) -> bool:
    return bool(PERSONAL_AUTHOR_RE.search(fold(block or "")))


def claims_a_title(cit: Citation, rec: dict) -> bool:
    """Does this citation assert a title at all?

    Three shapes where the parse produced a "title" the author never claimed, each of
    which fired a mismatch on a correct citation:
      - a journal whose own name contains a full stop ("Canadian Journal of Psychiatry.
        Revue Canadienne De Psychiatrie.") dot-splits into title + container;
      - a connective fragment left behind by a corporate citation ("Also published as:");
      - anything too short to be a title.
    """
    title = (cit.title or "").strip()
    if len(title) < 12 or title.endswith(":"):
        return False
    if rec and containers_agree(title, rec.get("container", ""), rec.get("containerFull", "")):
        return False
    return True


def component_scores(cit: Citation, rec: dict) -> dict:
    comps: dict[str, float] = {}
    if cit.title and rec.get("title") and claims_a_title(cit, rec):
        comps["title"] = round(title_similarity(cit.title, rec["title"]), 4)
    if cit.surnames and rec.get("authors") and authors_look_personal(cit.authors_raw):
        resolved = {norm_surname(a) for a in rec["authors"]}
        comps["author"] = 1.0 if norm_surname(cit.first_surname) in resolved else 0.0
    if cit.year and rec.get("year"):
        d = abs(int(cit.year) - int(rec["year"]))
        comps["year"] = 1.0 if d == 0 else (0.5 if d <= YEAR_TOLERANCE else 0.0)
    if cit.container and (rec.get("container") or rec.get("containerFull")):
        comps["container"] = 1.0 if containers_agree(
            cit.container, rec.get("container", ""), rec.get("containerFull", "")) else 0.0
    return comps


def composite(comps: dict) -> float:
    """Weighted mean over the components the citation actually claims. A citation that
    claims no title is not penalised for having none; it is judged on what it asserts."""
    total = sum(WEIGHTS[k] for k in comps)
    if not total:
        return 0.0
    return round(sum(WEIGHTS[k] * v for k, v in comps.items()) / total, 4)


def contradictions(cit: Citation, comps: dict, rec: dict, skip_title: bool = False) -> list[str]:
    """Which claimed fields the resolved record CONTRADICTS, stated side by side.

    Per field, not by composite. The dominant #672 defect is a citation that is right
    about everything except the journal: title 1.00, author 1.00, year 1.00, journal 0.00
    composites to 0.80, so any composite floor low enough to spare real citations is also
    high enough to wave that one through. A contradiction in one hard field is a
    contradiction.

    "Citation 7 is wrong" sends someone to guess; "claimed Am J Psychiatry, resolved Br J
    Addict" is immediately actionable, so both values are always printed.
    """
    out = []
    if not skip_title and "title" in comps and comps["title"] < TITLE_ID_FLOOR:
        out.append(f"title: claimed {cit.title!r}, resolved {rec.get('title')!r}")
    if comps.get("author") == 0.0:
        out.append(f"first author: claimed {cit.first_surname!r}, resolved "
                   f"{', '.join(rec.get('authors', [])[:4])}")
    if comps.get("year") == 0.0:
        out.append(f"year: claimed {cit.year}, resolved {rec.get('year')}")
    if comps.get("container") == 0.0:
        out.append(f"journal: claimed {cit.container!r}, resolved "
                   f"{rec.get('container') or rec.get('containerFull')!r}")
    return out


def judge(cit: Citation, ev: dict | None) -> dict:
    """One citation, one verdict. `ev` is a cache entry, or None when uncached.

    The three tiers plus `unavailable`. Nothing here touches the network, so the same
    commit and the same cache always produce the same answer.
    """
    if ev is None:
        return {"verdict": "unavailable", "reason": "not in the resolution cache — "
                "run --refresh; an uncached citation is NOT examined and NOT clean",
                "score": None, "components": {}, "pmid": None, "mode": None}
    if ev.get("resolver") != RESOLVER_VERSION:
        return {"verdict": "unavailable",
                "reason": f"cached by resolver v{ev.get('resolver')}, this is "
                          f"v{RESOLVER_VERSION} -- re-run --refresh; a stale answer to a "
                          f"question the tool no longer asks is NOT examined",
                "score": None, "components": {}, "pmid": ev.get("pmid"),
                "mode": ev.get("mode")}
    if ev.get("status") != "resolved":
        return {"verdict": "unavailable",
                "reason": ev.get("error") or "resolution did not complete",
                "score": None, "components": {}, "pmid": ev.get("pmid"),
                "mode": ev.get("mode")}

    mode = ev.get("mode") or ""
    rec = ev.get("record") or {}
    comps = component_scores(cit, rec) if rec else {}
    score = composite(comps) if comps else None
    base = {"components": comps, "score": score, "pmid": ev.get("pmid"), "mode": mode}

    if mode.startswith("anchored"):
        if not rec:
            return {**base, "verdict": "mismatch",
                    "reason": f"the {mode.split('-')[1].upper()} in this citation resolves "
                              f"to no PubMed record"}
        bad = contradictions(cit, comps, rec)
        if not bad:
            return {**base, "verdict": "matched",
                    "reason": "the record this identifier resolves to agrees on every "
                              "field the citation claims"}
        return {**base, "verdict": "mismatch",
                "reason": "the identifier's own record contradicts the citation — "
                          + "; ".join(bad)}

    if mode == "search-title":
        if not rec:
            return {**base, "verdict": "ambiguous",
                    "reason": "no PubMed candidate for the claimed title"}
        strict = (round(title_similarity(cit.title, rec.get("title", ""), abbrev=False), 4)
                  if (cit.title and rec.get("title") and claims_a_title(cit, rec)) else 0.0)
        base = {**base, "strictTitleScore": strict}
        if strict < TITLE_ID_FLOOR:
            return {**base, "verdict": "ambiguous",
                    "reason": f"the best candidate's title scores {strict} "
                              f"(< {TITLE_ID_FLOOR}), so PubMed cannot be said to hold "
                              f"this paper either way"}
        bad = contradictions(cit, comps, rec, skip_title=True)
        if not bad:
            return {**base, "verdict": "matched",
                    "reason": "PubMed holds this paper and agrees on every other field"}
        return {**base, "verdict": "mismatch",
                "reason": "PubMed holds this paper and the citation misstates it — "
                          + "; ".join(bad)}

    if mode == "search-author":
        window = ev.get("authorWindow")
        examined = ev.get("authorExamined") or 0
        containers = ev.get("authorContainers") or []
        injournal = sum(1 for c in containers
                        if cit.container and containers_agree(cit.container, c[0], c[1]))
        base = {**base, "authorWindow": window, "authorExamined": examined}
        if cit.not_literature:
            return {**base, "verdict": "ambiguous",
                    "reason": "book, manual or grey literature — not PubMed-checkable"}
        if window in (None, 0):
            return {**base, "verdict": "ambiguous",
                    "reason": f"PubMed holds no record by {cit.first_surname} "
                              f"{_initials(cit.authors_raw, cit.first_surname)} in "
                              f"{cit.year}±1 — may be a book, a guideline, or unindexed"}
        if not cit.container:
            return {**base, "verdict": "ambiguous",
                    "reason": f"no journal claimed; {window} record(s) by this author in "
                              f"{cit.year}±1 and nothing to contradict"}
        if not looks_like_journal(cit.container):
            return {**base, "verdict": "ambiguous",
                    "reason": f"{cit.container!r} does not read as a journal (book, "
                              f"manual or guideline); nothing to check against"}
        if injournal:
            return {**base, "verdict": "matched",
                    "reason": f"{injournal} of the {examined} record(s) by "
                              f"{cit.first_surname} in {cit.year}±1 are in "
                              f"{cit.container}"}
        if examined < (window or 0):
            return {**base, "verdict": "ambiguous",
                    "reason": f"examined {examined} of {window} record(s) by "
                              f"{cit.first_surname} in {cit.year}±1 and none is in "
                              f"{cit.container!r} — too many to call it a contradiction"}
        return {**base, "verdict": "mismatch",
                "reason": f"every one of the {examined} PubMed record(s) by "
                          f"{cit.first_surname} in {cit.year}±1 was examined and none "
                          f"is in {cit.container!r}"}

    return {**base, "verdict": "unavailable", "reason": f"unknown resolution mode {mode!r}"}


# =======================================================================================
# Cache and adjudications
# =======================================================================================

def _short(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def load_json(path: Path, what: str) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CheckError(f"{what} {_short(path)} is unreadable: {exc}") from exc
    if not isinstance(data, dict):
        raise CheckError(f"{what} {_short(path)} is not an object")
    return data


def load_cache(path: Path = CACHE) -> dict:
    data = load_json(path, "resolution cache")
    entries = data.get("entries", {})
    if not isinstance(entries, dict):
        raise CheckError("resolution cache `entries` is not an object")
    return entries


def write_cache(entries: dict, path: Path = CACHE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "_note": "Written by bin/verify_citations.py --refresh. One entry per citation, "
                 "keyed by a hash of the citation's own text, so editing a citation "
                 "invalidates its entry and only changed or uncached citations are "
                 "re-searched. The gate reads this file and never touches the network. "
                 "An entry with status 'unavailable' means the search could not run: it "
                 "is NOT a verdict and never reads as clean.",
        "schemaVersion": 1,
        "entries": {k: entries[k] for k in sorted(entries)},
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_adjudications(path: Path = ADJUDICATIONS) -> dict:
    """The do-not-refile list, in the shape of docs/curriculum-review/findings/rejected.json.

    A faculty decision that a particular ambiguous citation is acceptable as it stands.
    Keyed by citation key, so an adjudication stops applying the moment the citation's
    text changes — which is the point."""
    data = load_json(path, "adjudications")
    rows = data.get("adjudications", [])
    if not isinstance(rows, list):
        raise CheckError("adjudications `adjudications` is not a list")
    out = {}
    for row in rows:
        if isinstance(row, dict) and row.get("citationKey"):
            out[row["citationKey"]] = row
    return out


# =======================================================================================
# The gate
# =======================================================================================

def new_keys_since(base: str, root: Path = ROOT) -> set[str]:
    """Citation keys that do NOT exist at `base`. Only `block-new-only` needs this."""
    try:
        rev = subprocess.run(["git", "-C", str(root), "rev-parse", "--verify", f"{base}^{{commit}}"],
                             capture_output=True, text=True, check=True).stdout.strip()
        listing = subprocess.run(["git", "-C", str(root), "ls-tree", "-r", "--name-only", rev],
                                 capture_output=True, text=True, check=True).stdout.splitlines()
    except (OSError, subprocess.CalledProcessError) as exc:
        raise CheckError(f"cannot resolve --base {base!r}: {exc}") from exc
    keys: set[str] = set()
    for rel in listing:
        if not in_scope(rel):
            continue
        try:
            text = subprocess.run(["git", "-C", str(root), "show", f"{rev}:{rel}"],
                                  capture_output=True, text=True, check=True).stdout
        except subprocess.CalledProcessError:
            continue
        for c, _ in [extract_from_text(text, rel)]:
            keys.update(x.key for x in c)
    return keys


def evaluate(cites: list[Citation], cache: dict, adjudged: dict) -> list[dict]:
    rows = []
    for cit in cites:
        verdict = judge(cit, cache.get(cit.key))
        rows.append({
            "key": cit.key, "path": cit.path, "line": cit.line, "shape": cit.shape,
            "quote": cit.raw, "claimed": {
                "firstAuthor": cit.first_surname, "year": cit.year,
                "title": cit.title, "container": cit.container,
                "doi": cit.doi, "pmid": cit.pmid},
            "adjudicated": cit.key in adjudged,
            "adjudication": adjudged.get(cit.key, {}).get("reason"),
            **verdict,
        })
    return rows


def summarise(rows: list[dict], unparsed: list[dict], files: int,
              policy: str, new_keys: set[str] | None) -> dict:
    counts = {"matched": 0, "mismatch": 0, "ambiguous": 0, "unavailable": 0}
    for r in rows:
        counts[r["verdict"]] += 1
    open_ambiguous = [r for r in rows if r["verdict"] == "ambiguous" and not r["adjudicated"]]
    blocking_ambiguous: list[dict] = []
    if policy == "block":
        blocking_ambiguous = list(open_ambiguous)
    elif policy == "block-new-only":
        blocking_ambiguous = [r for r in open_ambiguous
                              if new_keys is not None and r["key"] in new_keys]
    return {
        "schemaVersion": 1,
        "checkedAt": datetime.now(timezone.utc).replace(microsecond=0)
                     .isoformat().replace("+00:00", "Z"),
        "ambiguousPolicy": policy,
        "titleIdentityFloor": TITLE_ID_FLOOR,
        "containerFloor": CONTAINER_FLOOR,
        "yearTolerance": YEAR_TOLERANCE,
        "filesScanned": files,
        "citationsFound": len(rows),
        "counts": counts,
        "examined": counts["matched"] + counts["mismatch"] + counts["ambiguous"],
        "notExamined": counts["unavailable"],
        "adjudicatedAmbiguous": counts["ambiguous"] - len(open_ambiguous),
        "openAmbiguous": len(open_ambiguous),
        "blockingAmbiguous": len(blocking_ambiguous),
        "unparsedInReferenceSections": len(unparsed),
        "unparsed": unparsed[:25],
        "rows": rows,
    }


def findings(summary: dict) -> list[dict]:
    """The adjudication queue, in the shape docs/curriculum-review/findings/findings.json
    uses (id, file, locus, severity, verbatim quote, problem, verification) so a faculty
    sitting reads it the same way it reads every other finding in this repository."""
    out = []
    for r in sorted(summary["rows"], key=lambda r: (r["verdict"] != "mismatch", r["path"], r["line"])):
        if r["verdict"] not in ("mismatch", "ambiguous") or r["adjudicated"]:
            continue
        out.append({
            "id": f"CITE-{r['verdict'][:3].upper()}-{r['key']}",
            "file": r["path"],
            "line": r["line"],
            "locus": "citation",
            "severity": FINDING_SEVERITY[r["verdict"]],
            "verdict": r["verdict"],
            "quote": r["quote"],
            "problem": r["reason"],
            "resolvedPmid": r["pmid"],
            "score": r["score"],
            "verification": ("https://pubmed.ncbi.nlm.nih.gov/%s/" % r["pmid"]
                             if r["pmid"] else
                             "search PubMed for the claimed author, year and journal"),
            "toAccept": ("add {\"citationKey\": \"%s\", \"reason\": \"...\", "
                         "\"by\": \"Joshua Moss, MD\", \"at\": \"%s\"} to "
                         "bin/data/citation_adjudications.json"
                         % (r["key"], date.today().isoformat())),
        })
    return out


def render(summary: dict, queue: list[dict]) -> str:
    c = summary["counts"]
    lines = [
        "citations: %d file(s) scanned, %d citation(s) found, %d examined, %d NOT examined"
        % (summary["filesScanned"], summary["citationsFound"],
           summary["examined"], summary["notExamined"]),
        "  matched %d · mismatch %d · ambiguous %d (%d open, %d adjudicated) · "
        "unavailable %d   [ambiguous policy: %s]"
        % (c["matched"], c["mismatch"], c["ambiguous"], summary["openAmbiguous"],
           summary["adjudicatedAmbiguous"], c["unavailable"], summary["ambiguousPolicy"]),
    ]
    if summary["unparsedInReferenceSections"]:
        lines.append("  %d line(s) inside a references/further-reading section did not "
                     "parse as a citation (a new citation shape shows up here, not as "
                     "silence); first few:" % summary["unparsedInReferenceSections"])
        for u in summary["unparsed"][:5]:
            lines.append("      %s:%d  %s" % (u["path"], u["line"], u["raw"][:110]))
    for r in summary["rows"]:
        if r["verdict"] != "unavailable":
            continue
        lines.append("  NOT-EXAMINED  %s:%d  %s" % (r["path"], r["line"], r["reason"]))
        lines.append("                %s" % r["quote"][:150])
    for f in queue:
        tag = "MISMATCH" if f["verdict"] == "mismatch" else "ambiguous"
        lines.append("  %-9s %s:%d  score %s" % (tag, f["file"], f["line"], f["score"]))
        lines.append("            %s" % f["quote"][:150])
        lines.append("            %s" % f["problem"])
        if f["resolvedPmid"]:
            lines.append("            resolved record: %s" % f["verification"])
    return "\n".join(lines)


def gate(root: Path = ROOT, cache_path: Path = CACHE, adj_path: Path = ADJUDICATIONS,
         policy: str = None, base: str | None = None, out=print) -> tuple[int, dict]:
    """The whole exit contract, in-process so the self-test can drive it.
    0 clean, 1 a finding, 2 could not check."""
    policy = policy or AMBIGUOUS_POLICY
    if policy not in AMBIGUOUS_POLICIES:
        raise CheckError(f"unknown ambiguous policy {policy!r}")
    cites, unparsed, files = collect(root)
    cache = load_cache(cache_path)
    adjudged = load_adjudications(adj_path)
    new_keys = None
    if policy == "block-new-only":
        if not base:
            raise CheckError("--ambiguous-policy block-new-only needs --base; without a "
                             "base every citation reads as legacy and nothing blocks")
        known = new_keys_since(base, root)
        new_keys = {c.key for c in cites if c.key not in known}
    rows = evaluate(cites, cache, adjudged)
    summary = summarise(rows, unparsed, files, policy, new_keys)
    queue = findings(summary)
    out(render(summary, queue))

    if summary["citationsFound"] == 0:
        out("citations: NOTHING EXAMINED — no citation parsed out of %d file(s). A pass "
            "over an empty set is not a pass (docs/SILENT_SHRINK_CHECKLIST.md D4)." % files)
        return 2, summary

    fails = summary["counts"]["mismatch"] + summary["blockingAmbiguous"]
    if fails:
        out("\nFAIL — %d mismatch(es)%s. A mismatch is the resolved record contradicting "
            "the citation; fix the citation from the record, never the record from the "
            "citation." % (summary["counts"]["mismatch"],
                           "" if not summary["blockingAmbiguous"]
                           else " and %d blocking ambiguous" % summary["blockingAmbiguous"]))
        return 1, summary
    if summary["notExamined"]:
        out("\nCOULD NOT CHECK — %d citation(s) were never examined (uncached, or the "
            "search could not run). This is reachability, not a content finding, and it "
            "is not clean: run `python3 bin/verify_citations.py --refresh`."
            % summary["notExamined"])
        return 2, summary
    out("\nOK — %d citation(s) examined, 0 contradicted; %d open ambiguous filed for "
        "faculty adjudication (policy `%s`: they do not block)."
        % (summary["examined"], summary["openAmbiguous"], policy))
    return 0, summary


# =======================================================================================
# Collectors. The only code that touches the network; --refresh is the only caller.
# =======================================================================================

def _get(url: str) -> tuple[int, bytes]:
    last: Exception | None = None
    for attempt in range(RETRIES + 1):
        req = urllib.request.Request(url, method="GET")
        req.add_header("User-Agent", UA)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt < RETRIES:
                time.sleep(1.5 * (attempt + 1))
                last = exc
                continue
            raise CheckError(f"HTTP {exc.code} from {urllib.parse.urlsplit(url).hostname}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            text = str(getattr(exc, "reason", exc))
            # A refused CONNECT tunnel and a host's own 403 are not the same thing.
            if "Tunnel connection failed" in text or "CONNECT" in text:
                raise CheckError("egress proxy denied the CONNECT tunnel to %s — "
                                 "reachability, not a finding"
                                 % urllib.parse.urlsplit(url).hostname) from exc
            last = exc
            if attempt < RETRIES:
                time.sleep(1.5 * (attempt + 1))
                continue
    raise CheckError(f"transport failure for {urllib.parse.urlsplit(url).hostname}: {last}")


def _params(extra: dict) -> str:
    p = {"db": "pubmed", "retmode": "json", "tool": "clerkship-citation-verify", **extra}
    key = os.environ.get("NCBI_API_KEY", "").strip()
    if key:
        p["api_key"] = key
    return urllib.parse.urlencode(p)


def esearch(term: str, retmax: int = MAX_CANDIDATES) -> tuple[int, list[str]]:
    status, body = _get(ESEARCH + "?" + _params({"term": term, "retmax": str(retmax)}))
    time.sleep(THROTTLE_S)
    if status != 200:
        raise CheckError(f"NCBI esearch answered HTTP {status}")
    try:
        res = json.loads(body.decode("utf-8", "replace")).get("esearchresult") or {}
    except ValueError as exc:
        raise CheckError(f"NCBI esearch returned unparseable JSON: {exc}") from exc
    if "ERROR" in res:
        raise CheckError(f"NCBI esearch error: {res['ERROR']}")
    return int(res.get("count", 0)), list(res.get("idlist") or [])


def esummary(pmids: list[str]) -> dict[str, dict]:
    if not pmids:
        return {}
    status, body = _get(ESUMMARY + "?" + _params({"id": ",".join(pmids)}))
    time.sleep(THROTTLE_S)
    if status != 200:
        raise CheckError(f"NCBI esummary answered HTTP {status}")
    try:
        result = json.loads(body.decode("utf-8", "replace")).get("result") or {}
    except ValueError as exc:
        raise CheckError(f"NCBI esummary returned unparseable JSON: {exc}") from exc
    out = {}
    for pmid in result.get("uids", []):
        doc = result.get(pmid) or {}
        year = None
        m = YEAR_RE.search(str(doc.get("pubdate") or "") + " " + str(doc.get("epubdate") or ""))
        if m:
            year = int(m.group(1))
        out[pmid] = {
            "title": re.sub(r"\s+", " ", str(doc.get("title") or "")).strip().rstrip("."),
            "container": str(doc.get("source") or ""),
            "containerFull": str(doc.get("fulljournalname") or ""),
            "year": year,
            "authors": [a.get("name", "").split()[0]
                        for a in (doc.get("authors") or []) if a.get("name")],
        }
    return out


def _author_term(cit: Citation) -> str:
    ini = _initials(cit.authors_raw, cit.first_surname)
    return f"{cit.first_surname} {ini}[Author]" if ini else f"{cit.first_surname}[Author]"


def resolve(cit: Citation) -> dict:
    """Ask NCBI about one citation. Returns a cache entry. Raises CheckError on transport."""
    stamp = date.today().isoformat()
    base = {"citation": cit.raw[:400], "resolvedAt": stamp, "status": "resolved",
            "resolver": RESOLVER_VERSION}

    if cit.pmid:
        recs = esummary([cit.pmid])
        rec = recs.get(cit.pmid)
        return {**base, "mode": "anchored-pmid", "pmid": cit.pmid if rec else None,
                "record": rec, "candidates": 1 if rec else 0}

    if cit.doi:
        count, ids = esearch(f'"{cit.doi}"[AID]', retmax=5)
        if count == 1 and ids:
            rec = esummary(ids).get(ids[0])
            if rec:
                return {**base, "mode": "anchored-doi", "pmid": ids[0], "record": rec,
                        "candidates": 1}

    if cit.title:
        count, ids = esearch(f'"{norm_text(cit.title)}"[Title]')
        if not ids:
            words = " AND ".join(w for w in _tokens(cit.title)[:8])
            if words:
                count, ids = esearch(f"({words})[Title]")
        recs = esummary(ids[:MAX_CANDIDATES])
        best, best_score = None, -1.0
        for pmid, rec in recs.items():
            s = composite(component_scores(cit, rec))
            if s > best_score:
                best, best_score = (pmid, rec), s
        return {**base, "mode": "search-title", "pmid": best[0] if best else None,
                "record": best[1] if best else None, "candidates": len(recs)}

    # No title claimed: the #640/#672 bullet shape. The discriminator is whether the
    # author has any record at all in the window, and whether any of them is in the
    # journal being claimed.
    entry = {**base, "mode": "search-author", "pmid": None, "record": None,
             "authorWindow": 0, "authorExamined": 0, "authorContainers": []}
    if not cit.year:
        entry["authorWindow"] = None
        return entry
    window = f"{cit.year - 1}:{cit.year + 1}[DP]"
    wcount, wids = esearch(f"{_author_term(cit)} AND {window}", retmax=AUTHOR_WINDOW_CAP)
    entry["authorWindow"] = wcount
    if wcount == 0:
        return entry
    # The journal comparison is done HERE, against the records themselves, not by asking
    # PubMed for `"<journal>"[Journal]`. That query is exact-match against NLM's journal
    # table and answered 0 for "New England Journal of Medicine", "Cochrane Database of
    # Systematic Reviews" and "Social Science & Medicine" — three correct citations the
    # gate then called fabrications. containers_agree() folds abbreviations itself.
    recs = esummary(wids[:AUTHOR_WINDOW_CAP])
    entry["authorExamined"] = len(recs)
    seen = []
    for pmid, rec in recs.items():
        seen.append([rec.get("container", ""), rec.get("containerFull", ""), rec.get("year")])
        if (entry["record"] is None and cit.container
                and containers_agree(cit.container, rec.get("container", ""),
                                     rec.get("containerFull", ""))):
            entry["pmid"], entry["record"] = pmid, rec
    entry["authorContainers"] = seen
    if entry["record"] is None and recs:
        first = next(iter(recs))
        entry["pmid"], entry["record"] = first, recs[first]
    return entry


def refresh(root: Path = ROOT, cache_path: Path = CACHE, only_missing: bool = True,
            limit: int | None = None, out=print) -> int:
    cites, _unparsed, _files = collect(root)
    try:
        entries = load_cache(cache_path)
    except CheckError:
        entries = {}
    wanted = []
    seen = set()
    for c in cites:
        if c.key in seen:
            continue
        seen.add(c.key)
        have = entries.get(c.key)
        if (only_missing and have and have.get("status") == "resolved"
                and have.get("resolver") == RESOLVER_VERSION):
            continue
        wanted.append(c)
    if limit:
        wanted = wanted[:limit]
    out("refresh: %d citation(s) in scope, %d to resolve" % (len(seen), len(wanted)))
    done = failed = 0
    for i, c in enumerate(wanted, 1):
        try:
            entries[c.key] = resolve(c)
            done += 1
        except CheckError as exc:
            entries[c.key] = {"citation": c.raw[:400], "status": "unavailable",
                              "mode": None, "error": str(exc),
                              "resolver": RESOLVER_VERSION,
                              "resolvedAt": date.today().isoformat()}
            failed += 1
        if i % 25 == 0:
            out("  … %d/%d" % (i, len(wanted)))
            write_cache(entries, cache_path)
    # Drop entries no citation claims any more, so the cache cannot outlive the corpus.
    stale = [k for k in entries if k not in seen]
    for k in stale:
        del entries[k]
    write_cache(entries, cache_path)
    out("refresh: %d resolved, %d unavailable, %d stale entry(ies) dropped"
        % (done, failed, len(stale)))
    return 1 if failed else 0


# =======================================================================================
# Self-test. Every tier must fire, and every tier must stay silent on its good case.
# =======================================================================================

def _cit(raw: str, **kw) -> Citation:
    cites, _ = extract_from_text("## References\n\n" + raw + "\n", "x.md")
    if cites:
        return cites[0]
    raise AssertionError("fixture did not parse: " + raw[:80])


# The real CIWA-Ar record, as PubMed holds it. Used as a fixture only; the live cache is
# refreshed from NCBI.
_CIWA = {"title": "Assessment of alcohol withdrawal: the revised clinical institute "
                  "withdrawal assessment for alcohol scale (CIWA-Ar)",
         "container": "Br J Addict", "containerFull": "British journal of addiction",
         "year": 1989, "authors": ["Sullivan", "Sykora", "Schneiderman", "Naranjo", "Sellers"]}


def self_test() -> int:                                    # noqa: C901 - a checklist
    import contextlib
    import io
    import tempfile

    checks: list[tuple[str, bool]] = []

    def expect(label, cond):
        checks.append((label, bool(cond)))

    # --- comparison primitives -----------------------------------------------------
    expect("abbrev: Br J Addict == British Journal of Addiction",
           containers_agree("British Journal of Addiction", "Br J Addict"))
    expect("abbrev: N Engl J Med == The New England Journal of Medicine",
           containers_agree("The New England Journal of Medicine", "N Engl J Med"))
    expect("ampersand variant agrees",
           containers_agree("Alcohol & Alcoholism", "Alcohol and Alcoholism"))
    expect("the real #672 journal defect does NOT agree",
           not containers_agree("American Journal of Psychiatry", "Br J Addict",
                                "British journal of addiction"))
    expect("COWS journal defect does NOT agree",
           not containers_agree("Journal of Clinical Psychiatry", "J Psychoactive Drugs"))
    expect("Clegg journal defect does NOT agree",
           not containers_agree("BMJ", "Age Ageing", "Age and ageing"))
    expect("subtitle truncation is not a title mismatch",
           title_similarity("Delirium in Hospitalized Older Adults: A Review",
                            "Delirium in Hospitalized Older Adults") >= TITLE_ID_FLOOR)
    expect("a different paper entirely is far below the identity floor",
           title_similarity("Assessment of alcohol withdrawal: the revised CIWA-Ar",
                            "Cryosurgery for hypertrophic scars and keloids") < 0.5)
    expect("journal-likeness: an invented journal still reads as a journal",
           looks_like_journal("Journal of the American Psychiatric Association"))
    expect("journal-likeness: a book does not",
           not looks_like_journal("The Body Keeps the Score: Brain, Mind, and Body"))
    expect("journal-likeness: a manual does not",
           not looks_like_journal("Diagnostic and Statistical Manual of Mental Disorders"))
    expect("journal-likeness: a numbered edition does not",
           not looks_like_journal("Motivational Interviewing: Helping People Change (3rd Ed.)"))
    expect("journal-likeness: a body that publishes is not a journal",
           not looks_like_journal("American Psychiatric Association"))
    expect("journal-likeness: but a journal named after one still is",
           looks_like_journal("Journal of the American Geriatrics Society"))

    # --- extraction ----------------------------------------------------------------
    numbered = _cit("1. Stanley B, Brown G, Brenner L, et al. Comparison of the Safety "
                    "Planning Intervention With Follow-up vs Usual Care. JAMA Psychiatry. "
                    "2018;75(9):894-900. doi:10.1001/jamapsychiatry.2018.1776.")
    expect("vancouver: surnames", numbered.surnames[:3] == ["Stanley", "Brown", "Brenner"])
    expect("vancouver: year", numbered.year == 2018)
    expect("vancouver: container", numbered.container == "JAMA Psychiatry")
    expect("vancouver: doi", numbered.doi == "10.1001/jamapsychiatry.2018.1776")
    expect("vancouver: title", numbered.title.startswith("Comparison of the Safety Planning"))

    bullet = _cit("- Sullivan, J.T. et al. (1989) — *American Journal of Psychiatry* "
                  "— development and validation of the CIWA-Ar, the gold-standard "
                  "bedside tool for scoring alcohol withdrawal severity.")
    expect("bullet: the #672 shape parses at all", bullet.shape == "bullet")
    expect("bullet: surname", bullet.first_surname == "Sullivan")
    expect("bullet: initials for the PubMed author term",
           _initials(bullet.authors_raw, "Sullivan") == "JT")
    expect("bullet: year", bullet.year == 1989)
    expect("bullet: container", bullet.container == "American Journal of Psychiatry")
    expect("bullet: no title claimed", bullet.title is None)

    # The shapes that are NOT citations must stay out, or the ambiguous queue fills with
    # teaching prose and nobody reads it.
    quiet, _ = extract_from_text(
        "## References\n"
        "- The Joint Commission. Joint Commission (2018). A long enough line to clear "
        "the sixty character floor easily.\n"
        "- **Evidence:** Kane et al. (1988): 30% response to clozapine versus 4% for "
        "chlorpromazine in treatment-resistant schizophrenia.\n"
        "2. **Priorities before medication (first 5-10 min):** ensure staff and patient "
        "safety, then verbal de-escalation, then consider medication.\n", "x.md")
    expect("non-citations stay out of the corpus", quiet == [])

    outside, _ = extract_from_text(
        "## Teaching notes\n"
        "1. Xia J, Merinder L, Belgamwar M. Psychoeducation for schizophrenia. Cochrane "
        "Database Syst Rev. 2011;2011(6):CD002831. doi:10.1002/14651858.CD002831.pub2.\n",
        "x.md")
    expect("a DOI-bearing reference is picked up outside a References section",
           len(outside) == 1 and outside[0].doi.startswith("10.1002/"))

    _cites, unparsed = extract_from_text(
        "## References\n"
        "- Kaplan & Sadock's Synopsis of Psychiatry, sections on substance-related "
        "disorders, withdrawal syndromes and medication-assisted treatment.\n", "x.md")
    expect("an unparsed line in a reference section is COUNTED, not silently dropped",
           len(unparsed) == 1)

    expect("the key is a function of the text alone",
           citation_key("1. A B. T. J. 2001.") == citation_key(" 1.  A B. T. J. 2001. "))
    expect("editing the citation changes its key",
           citation_key("1. A B. T. J. 2001.") != citation_key("1. A B. T. J. 2002."))

    # --- the judge, tier by tier ----------------------------------------------------
    anchored_bad = _cit("7. Sullivan JT, Sykora K, Schneiderman J. Assessment of alcohol "
                        "withdrawal: the revised clinical institute withdrawal assessment "
                        "for alcohol scale. American Journal of Psychiatry. "
                        "1989;84(11):1353-7. doi:10.1111/j.1360-0443.1989.tb00737.x")
    v = judge(anchored_bad, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "anchored-doi",
                             "pmid": "2597811", "record": _CIWA})
    expect("ANCHORED: a real identifier on the wrong journal is a mismatch",
           v["verdict"] == "mismatch" and "journal" in v["reason"])

    anchored_ok = _cit("7. Sullivan JT, Sykora K, Schneiderman J. Assessment of alcohol "
                       "withdrawal: the revised clinical institute withdrawal assessment "
                       "for alcohol scale. Br J Addict. 1989;84(11):1353-7. "
                       "doi:10.1111/j.1360-0443.1989.tb00737.x")
    v = judge(anchored_ok, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "anchored-doi",
                            "pmid": "2597811", "record": _CIWA})
    expect("ANCHORED: the corrected citation is matched", v["verdict"] == "matched")

    v = judge(anchored_ok, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "anchored-pmid",
                            "pmid": None, "record": None})
    expect("ANCHORED: an identifier PubMed does not hold is a mismatch",
           v["verdict"] == "mismatch")

    year_bad = _cit("4. Marcantonio ER. Delirium in Hospitalized Older Adults. New England "
                    "Journal of Medicine. 2011;377(15):1456-1466. doi:10.1056/NEJMcp1605501")
    v = judge(year_bad, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "search-title", "pmid": "29020579",
                         "record": {"title": "Delirium in Hospitalized Older Adults",
                                    "container": "N Engl J Med",
                                    "containerFull": "The New England journal of medicine",
                                    "year": 2017, "authors": ["Marcantonio"]}})
    expect("SEARCHED+TITLED: the paper is found and the year is wrong -> mismatch",
           v["verdict"] == "mismatch" and "year" in v["reason"])

    v = judge(year_bad, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "search-title", "pmid": None,
                         "record": None})
    expect("SEARCHED+TITLED: no candidate at all is ambiguous, not a mismatch",
           v["verdict"] == "ambiguous")

    v = judge(bullet, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "search-author", "pmid": "2597811",
                       "record": _CIWA, "authorWindow": 12, "authorExamined": 12,
                       "authorContainers": [["Br J Addict", "British journal of addiction", 1989]] * 12})
    expect("SEARCHED+UNTITLED: every record by that author examined, journal holds "
           "none of them -> mismatch", v["verdict"] == "mismatch")

    v = judge(bullet, {"status": "resolved", "resolver": RESOLVER_VERSION,
                       "mode": "search-author", "pmid": "2597811", "record": _CIWA,
                       "authorWindow": 12, "authorExamined": 12,
                       "authorContainers": [["Am J Psychiatry",
                                             "The American journal of psychiatry", 1989]] * 12})
    expect("SEARCHED+UNTITLED: a record by that author in that journal -> matched",
           v["verdict"] == "matched")
    v = judge(bullet, {"status": "resolved", "resolver": RESOLVER_VERSION,
                       "mode": "search-author", "pmid": "2597811", "record": _CIWA,
                       "authorWindow": 277, "authorExamined": 120,
                       "authorContainers": [["Br J Addict", "British journal of addiction", 1989]] * 120})
    expect("SEARCHED+UNTITLED: a contradiction is not claimed over a set that was not "
           "fully examined", v["verdict"] == "ambiguous" and "120 of 277" in v["reason"])

    v = judge(bullet, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "search-author", "pmid": None,
                       "record": None, "authorWindow": 0, "authorExamined": 0,
                       "authorContainers": []})
    expect("SEARCHED+UNTITLED: an author PubMed does not index is ambiguous",
           v["verdict"] == "ambiguous")

    book = _cit("- van der Kolk, B. (2014) — *The Body Keeps the Score: Brain, Mind, "
                "and Body in the Healing of Trauma* (ISBN 9780143127741). Accessible "
                "review of how trauma reshapes the nervous system.")
    v = judge(book, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "search-author", "pmid": None,
                     "record": None, "authorWindow": 40, "authorExamined": 40,
                     "authorContainers": []})
    expect("a book in the container slot is ambiguous, NEVER a mismatch",
           v["verdict"] == "ambiguous")

    tip = _cit("- SAMHSA (2014) — *TIP 41: Substance Abuse Treatment: Group Therapy* "
               "— trauma exposure is common in substance use disorder populations "
               "and requires parallel treatment.")
    v = judge(tip, {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "search-author", "pmid": None,
                    "record": None, "authorWindow": 5, "authorExamined": 5,
                    "authorContainers": []})
    expect("grey literature is ambiguous, NEVER a mismatch", v["verdict"] == "ambiguous")

    # --- unavailable is not a verdict and never collapses into ambiguous -------------
    v = judge(anchored_ok, None)
    expect("uncached is `unavailable`, not `ambiguous`", v["verdict"] == "unavailable")
    v = judge(anchored_ok, {"status": "resolved", "resolver": RESOLVER_VERSION - 1,
                            "mode": "anchored-doi", "pmid": "2597811", "record": _CIWA})
    expect("an entry cached by an older resolver is `unavailable`, not a stale pass",
           v["verdict"] == "unavailable" and "re-run --refresh" in v["reason"])
    v = judge(anchored_ok, {"status": "unavailable", "resolver": RESOLVER_VERSION, "error": "egress proxy denied the "
                            "CONNECT tunnel to eutils.ncbi.nlm.nih.gov"})
    expect("a failed search is `unavailable`, not `ambiguous`",
           v["verdict"] == "unavailable" and "CONNECT" in v["reason"])

    # --- end to end, on a temporary corpus: NEVER INERT ------------------------------
    good = ("1. Sullivan JT, Sykora K, Schneiderman J. Assessment of alcohol withdrawal: "
            "the revised clinical institute withdrawal assessment for alcohol scale. "
            "Br J Addict. 1989;84(11):1353-7. doi:10.1111/j.1360-0443.1989.tb00737.x\n")
    bad = good.replace("Br J Addict", "American Journal of Psychiatry")
    ent = {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "anchored-doi",
           "pmid": "2597811", "record": _CIWA, "resolvedAt": "2026-09-21"}

    def build(tmp: Path, body: str, cache_entries: dict, adj=None):
        page = tmp / "03_Core_Topics" / "SUD" / "t.md"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("# T\n\n## References\n\n" + body, encoding="utf-8")
        cp = tmp / "cache.json"
        write_cache(cache_entries, cp)
        ap = tmp / "adj.json"
        ap.write_text(json.dumps({"adjudications": adj or []}), encoding="utf-8")
        return cp, ap

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        cp, ap = build(tmp, good, {citation_key(good.strip()): ent})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code, summary = gate(tmp, cp, ap, out=print)
        expect("e2e: the correct citation exits 0", code == 0)
        expect("e2e: it is counted as matched", summary["counts"]["matched"] == 1)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        cp, ap = build(tmp, bad, {citation_key(bad.strip()): ent})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code, summary = gate(tmp, cp, ap, out=print)
        expect("e2e: the #672 fabrication exits 1", code == 1)
        expect("e2e: it is counted as a mismatch", summary["counts"]["mismatch"] == 1)
        expect("e2e: the report prints both the claim and the resolved record",
               "American Journal of Psychiatry" in buf.getvalue()
               and "Br J Addict" in buf.getvalue())

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        cp, ap = build(tmp, good, {})                    # nothing cached at all
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code, summary = gate(tmp, cp, ap, out=print)
        expect("e2e: an uncached citation is exit 2, never 0", code == 2)
        expect("e2e: it is NOT counted as examined", summary["examined"] == 0)
        expect("e2e: the report says COULD NOT CHECK, never clean",
               "COULD NOT CHECK" in buf.getvalue() and "OK —" not in buf.getvalue())

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        unav = {"status": "unavailable", "resolver": RESOLVER_VERSION, "error": "NCBI answered HTTP 429",
                "resolvedAt": "2026-09-21"}
        cp, ap = build(tmp, good, {citation_key(good.strip()): unav})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code, summary = gate(tmp, cp, ap, out=print)
        expect("e2e: a rate-limited search is exit 2, not a clean pass", code == 2)
        expect("e2e: unavailable is reported apart from ambiguous",
               summary["counts"]["unavailable"] == 1 and summary["counts"]["ambiguous"] == 0)

    # --- the ambiguous switch, all three settings -----------------------------------
    amb_line = ("- Kennedy, G.J. (2014) — capacity assessment in older adults: "
                "depression and cognitive impairment often undermine appreciation and "
                "reasoning in ways that merit a medical workup first.\n")
    amb_ent = {"status": "resolved", "resolver": RESOLVER_VERSION, "mode": "search-author", "pmid": None, "record": None,
               "authorWindow": 9, "authorExamined": 9, "authorContainers": [],
               "resolvedAt": "2026-09-21"}
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        cp, ap = build(tmp, amb_line, {citation_key(amb_line.strip()): amb_ent})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code, summary = gate(tmp, cp, ap, policy="report", out=print)
        expect("policy report: ambiguous passes", code == 0)
        expect("policy report: but the finding is FILED, not swallowed",
               summary["openAmbiguous"] == 1 and "ambiguous" in buf.getvalue())
        expect("policy report: the finding carries the verbatim citation",
               "Kennedy" in buf.getvalue())
        with contextlib.redirect_stdout(io.StringIO()):
            code, _ = gate(tmp, cp, ap, policy="block", out=print)
        expect("policy block: the same citation fails", code == 1)
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                gate(tmp, cp, ap, policy="block-new-only", out=print)
            expect("policy block-new-only without a base is exit 2, not a silent pass", False)
        except CheckError:
            expect("policy block-new-only without a base is exit 2, not a silent pass", True)

        # an adjudication takes it off the queue, and only that exact text
        cp2, ap2 = build(tmp, amb_line, {citation_key(amb_line.strip()): amb_ent},
                         adj=[{"citationKey": citation_key(amb_line.strip()),
                               "reason": "grey literature; faculty accepts as cited",
                               "by": "Joshua Moss, MD", "at": "2026-09-21"}])
        with contextlib.redirect_stdout(io.StringIO()):
            code, summary = gate(tmp, cp2, ap2, policy="block", out=print)
        expect("an adjudicated ambiguous stops blocking even under `block`", code == 0)
        expect("and it is still counted, not hidden",
               summary["counts"]["ambiguous"] == 1 and summary["adjudicatedAmbiguous"] == 1)

    # --- the corpus itself cannot silently shrink ------------------------------------
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        (tmp / "03_Core_Topics").mkdir(parents=True)
        cp = tmp / "cache.json"
        write_cache({}, cp)
        ap = tmp / "adj.json"
        ap.write_text(json.dumps({"adjudications": []}), encoding="utf-8")
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                gate(tmp, cp, ap, out=print)
            expect("an empty corpus raises rather than passing", False)
        except CheckError:
            expect("an empty corpus raises rather than passing", True)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        page = tmp / "03_Core_Topics" / "t.md"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text("# T\n\nnothing citation-shaped here at all.\n", encoding="utf-8")
        cp = tmp / "cache.json"
        write_cache({}, cp)
        ap = tmp / "adj.json"
        ap.write_text(json.dumps({"adjudications": []}), encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()) as b:
            code, _ = gate(tmp, cp, ap, out=print)
        expect("a file with no citations is exit 2, not a clean pass over nothing",
               code == 2)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        cp, ap = build(tmp, good, {citation_key(good.strip()): ent})
        cp.write_text("{not json", encoding="utf-8")
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                gate(tmp, cp, ap, out=print)
            expect("an unreadable cache raises rather than reading as empty", False)
        except CheckError:
            expect("an unreadable cache raises rather than reading as empty", True)

    # --- findings shape ---------------------------------------------------------------
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        cp, ap = build(tmp, bad, {citation_key(bad.strip()): ent})
        with contextlib.redirect_stdout(io.StringIO()):
            _code, summary = gate(tmp, cp, ap, out=print)
        q = findings(summary)
        expect("findings: one per open finding", len(q) == 1)
        expect("findings: carry the verbatim quote the review lane expects",
               q[0]["quote"].startswith("1. Sullivan JT"))
        expect("findings: name the resolved record so a human can check it",
               q[0]["verification"].endswith("/2597811/"))
        expect("findings: say exactly how to adjudicate",
               "citation_adjudications.json" in q[0]["toAccept"])

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


# =======================================================================================

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="machine-readable summary on stdout")
    ap.add_argument("--findings-out", type=Path,
                    help="write the open findings (the faculty adjudication queue) here")
    ap.add_argument("--ambiguous-policy", choices=AMBIGUOUS_POLICIES,
                    help=f"override the ruled default ({AMBIGUOUS_POLICY})")
    ap.add_argument("--base", help="base revision for --ambiguous-policy block-new-only")
    ap.add_argument("--require-identifier", action="store_true",
                    help="Option A's door check, which the 2026-09-21 ruling did NOT "
                         "adopt: also fail any citation carrying no DOI or PMID. Off by "
                         "default and not the gate's behaviour.")
    ap.add_argument("--refresh", action="store_true",
                    help="resolve uncached or changed citations against NCBI and write "
                         "the cache (the only mode that touches the network)")
    ap.add_argument("--refresh-all", action="store_true",
                    help="with --refresh, re-resolve every citation, not only the new ones")
    ap.add_argument("--limit", type=int, help="with --refresh, stop after N citations")
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--cache", type=Path, default=CACHE)
    ap.add_argument("--adjudications", type=Path, default=ADJUDICATIONS)
    ap.add_argument("--self-test", action="store_true",
                    help="prove every tier fires and stays silent on its good case; offline")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    try:
        if args.refresh:
            return refresh(args.root, args.cache, only_missing=not args.refresh_all,
                           limit=args.limit)
        code, summary = gate(args.root, args.cache, args.adjudications,
                             policy=args.ambiguous_policy, base=args.base,
                             out=(lambda *a, **k: None) if args.json else print)
        if args.require_identifier:
            missing = [r for r in summary["rows"]
                       if not r["claimed"]["doi"] and not r["claimed"]["pmid"]]
            if missing and not args.json:
                print("\n--require-identifier (Option A, NOT the ruled behaviour): "
                      "%d citation(s) carry no DOI or PMID" % len(missing))
                for r in missing[:20]:
                    print("  %s:%d  %s" % (r["path"], r["line"], r["quote"][:120]))
            if missing:
                code = max(code, 1)
        queue = findings(summary)
        if args.findings_out:
            args.findings_out.parent.mkdir(parents=True, exist_ok=True)
            args.findings_out.write_text(json.dumps(queue, indent=1) + "\n", encoding="utf-8")
        if args.json:
            print(json.dumps(summary, indent=2, sort_keys=True))
        return code
    except CheckError as exc:
        print(f"citations: COULD NOT CHECK — {exc}", file=sys.stderr)
        print("Refusing to report clean over less than was claimed.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
