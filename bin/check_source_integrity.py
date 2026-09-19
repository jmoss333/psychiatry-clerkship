#!/usr/bin/env python3
"""Every registry source with a PMID or DOI is checked for a retraction, erratum, expression of concern or update that the registry does not yet record.

WHY. `evidence_registry.json` carries `governance.correctionStatus` (none-known /
corrected / expression-of-concern / retracted) and `governance.supersededBy` on every
source, and nothing has ever verified either field against the world. Measured
2026-09-18 on main: 109 sources, 91 with a PMID or DOI, 105 `none-known`, 2 `corrected`,
0 `supersededBy`. The 8 sources under guideline surveillance are watched for page
changes; the other 101 — 46 systematic reviews and 27 primary studies among them — are
watched for nothing. A retracted paper licensing a claim in `evidence_annotations.json`
would pass every gate in this repo, because every gate checks the claim against the
paper's own words and none checks whether the paper still stands.

WHAT IT CHECKS. For each source with a PMID: PubMed's `CommentsCorrectionsList`
(`RetractionIn`, `ExpressionOfConcernIn`, `ErratumIn`, `UpdateIn`, `RepublishedIn`) and
the `Retracted Publication` publication type. For each source with a DOI: Crossref's
`updated-by` relation (retraction, correction, expression of concern, new version). The
two are independent opinions; either one raises a finding. A finding is raised only when
the world says MORE than the registry records — a source already marked `retracted`
whose PubMed record says retracted is `recorded`, not a finding.

SEVERITY. P0 a retraction of a source that licenses at least one stored claim; P1 any
other retraction, an expression of concern, an erratum on a licensing source, or an
identifier PubMed answers "no such record" to; P2 an erratum on a non-licensing source,
or an update / republication / new version (the shape a Cochrane update takes — a
supersession signal, not a defect). Severity is data for triage; this tool never edits
the registry, the ledger, or any page. Recording a correction is a faculty decision.

WHAT IT DELIBERATELY DOES NOT DO. It does not classify a source as primary / secondary /
viewpoint (that judgment failed in August 2026 and no metadata check makes it). It does
not use Retraction Watch (licensing varies; PubMed lags it by weeks, and that lag is
accepted). It does not treat a DOI Crossref has never heard of as a defect — DataCite
DOIs exist — it lists them as `doi-not-in-crossref`, informational.

COVERAGE. The verdict is printed with what was examined: sources declared, sources with
an identifier, sources answered by PubMed, sources answered by Crossref, and the
identifier-less sources listed by id. A transport failure on any batch is exit 2, never
a clean pass over fewer sources than declared — a 404 from a .gov host on a datacenter
runner is a bot-block, not a finding (see `bin/verify_findings_offrunner.py`), and NCBI
answers a 429 to an unthrottled client.

MODES
  (default)        query PubMed and Crossref for every identified source; exit 1 on findings
  --json           same, as machine-readable JSON on stdout
  --out FILE       also write the JSON report to FILE (for the surveillance inbox)
  --ids a,b,c      restrict to those registry ids (quick recheck of one finding)
  --pubmed-only    skip Crossref (halves the requests; Crossref is the second opinion)
  --self-test      prove each classification can fire and stays silent on the good case,
                   and that a transport failure is exit 2 rather than a pass

EXIT CODES. 0 clean over every declared identified source, 1 at least one finding, 2 the
checker could not determine (registry unreadable, transport failure, or fewer sources
answered than asked). There is no exit code that means "did not look".

Set NCBI_API_KEY in the environment to lift NCBI's rate limit from 3 to 10 requests per
second; the tool throttles either way. The key travels as a query parameter because that
is the only place NCBI reads it; it is a low-privilege key and must still never be
committed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "evidence_registry.json"
ANNOTATIONS = ROOT / "evidence_annotations.json"

UA = "clerkship-source-integrity/1.0 (+https://github.com/jmoss333/psychiatry-clerkship; education)"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
CROSSREF = "https://api.crossref.org/works/"
TIMEOUT_S = 20
PUBMED_BATCH = 50
PUBMED_THROTTLE_S = 0.4
CROSSREF_THROTTLE_S = 0.25
RETRIES = 2

# Everything the world can say, ranked. A finding fires when the found rank exceeds the
# recorded rank; the registry's own vocabulary is the right-hand column.
KIND_RANK = {"none": 0, "updated": 1, "erratum": 2, "expression-of-concern": 3, "retracted": 4}
RECORDED_RANK = {"none-known": 0, "corrected": 2, "expression-of-concern": 3, "retracted": 4}

PUBMED_REFTYPES = {
    "RetractionIn": "retracted",
    "ExpressionOfConcernIn": "expression-of-concern",
    "ErratumIn": "erratum",
    "UpdateIn": "updated",
    "RepublishedIn": "updated",
}
CROSSREF_UPDATE_TYPES = {
    "retraction": "retracted",
    "partial_retraction": "retracted",
    "removal": "retracted",
    "withdrawal": "retracted",
    "expression_of_concern": "expression-of-concern",
    "correction": "erratum",
    "corrigendum": "erratum",
    "erratum": "erratum",
    "new_version": "updated",
    "new_edition": "updated",
    "addendum": "updated",
    "clarification": "updated",
}


class IntegrityError(RuntimeError):
    """The checker could not determine the answer. Never a pass."""


# ---------------------------------------------------------------------------------------
# Pure logic. Everything in this section takes plain data so --self-test can drive it with
# no network. The collectors further down are the only code that touches the outside world.
# ---------------------------------------------------------------------------------------

def load_registry(path: Path = REGISTRY) -> list[dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise IntegrityError(f"cannot read registry {path}: {exc}") from exc
    sources = data.get("sources") if isinstance(data, dict) else None
    if not isinstance(sources, list):
        raise IntegrityError(f"{path} has no sources[] list")
    return sources


def licensing_ids(path: Path = ANNOTATIONS) -> set[str]:
    """Source ids that license at least one stored claim. A missing ledger is an error,
    not an empty set — 'nothing licenses anything' would demote every retraction to P1."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise IntegrityError(f"cannot read annotations {path}: {exc}") from exc
    out = set()
    for ann in data.get("annotations", []):
        if ann.get("sourceId") and ann.get("claims"):
            out.add(ann["sourceId"])
    return out


def identifiers(source: dict) -> tuple[str, str]:
    cit = source.get("citation") or {}
    pmid = str(cit.get("pmid") or "").strip()
    doi = str(cit.get("doi") or "").strip()
    if pmid and not pmid.isdigit():
        pmid = ""
    if doi and not doi.lower().startswith("10."):
        doi = ""
    return pmid, doi.lower()


def parse_pubmed_xml(text: str) -> dict[str, dict]:
    """PMID -> {pubTypes, corrections: [{kind, refType, refSource, pmid}]}. Only the
    RefTypes in PUBMED_REFTYPES are kept; CommentIn/CommentOn are conversation, not status."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise IntegrityError(f"PubMed returned unparseable XML: {exc}") from exc
    out: dict[str, dict] = {}
    for art in root.iter("PubmedArticle"):
        pmid = (art.findtext("MedlineCitation/PMID") or "").strip()
        if not pmid:
            continue
        pub_types = [p.text or "" for p in art.findall("MedlineCitation/Article/PublicationTypeList/PublicationType")]
        corrections = []
        for cc in art.findall("MedlineCitation/CommentsCorrectionsList/CommentsCorrections"):
            kind = PUBMED_REFTYPES.get(cc.get("RefType", ""))
            if kind:
                corrections.append({
                    "kind": kind,
                    "refType": cc.get("RefType"),
                    "refSource": (cc.findtext("RefSource") or "").strip(),
                    "pmid": (cc.findtext("PMID") or "").strip(),
                })
        if "Retracted Publication" in pub_types and not any(c["kind"] == "retracted" for c in corrections):
            corrections.append({"kind": "retracted", "refType": "PublicationType", "refSource": "Retracted Publication", "pmid": ""})
        out[pmid] = {"pubTypes": pub_types, "corrections": corrections}
    return out


def parse_crossref(message: dict) -> list[dict]:
    """Crossref work message -> [{kind, type, doi, updated}].

    DIRECTION MATTERS. `updated-by` lists the works that supersede or correct THIS one —
    that is the signal. `update-to` lists the works this one supersedes — reading it would
    flag every current Cochrane edition as superseded by its own predecessor, which is
    exactly what the first live run did on 2026-09-18 (five false P2s)."""
    out = []
    for upd in message.get("updated-by") or []:
        kind = CROSSREF_UPDATE_TYPES.get(str(upd.get("type", "")).lower())
        if kind:
            when = upd.get("updated") or {}
            out.append({
                "kind": kind,
                "type": upd.get("type"),
                "doi": upd.get("DOI", ""),
                "updated": (when.get("date-time") or "")[:10],
            })
    return out


def severity(kind: str, licenses_claims: bool) -> str:
    if kind == "retracted":
        return "P0" if licenses_claims else "P1"
    if kind == "expression-of-concern":
        return "P1"
    if kind == "erratum":
        return "P1" if licenses_claims else "P2"
    return "P2"  # updated / republished / new version — a supersession signal


def classify_source(source: dict, pubmed: dict | None, crossref: list[dict] | None,
                    licensing: set[str], pubmed_answered: bool) -> dict:
    """One source in, one row out. `pubmed` is the parsed record or None when PubMed
    answered the batch but had no record for this PMID; `pubmed_answered` says whether the
    PMID was asked at all. `crossref` is the parsed update list, or None when not asked."""
    sid = source.get("id", "?")
    pmid, doi = identifiers(source)
    gov = source.get("governance") or {}
    recorded = gov.get("correctionStatus", "none-known")
    recorded_rank = RECORDED_RANK.get(recorded, 0)
    superseded = bool(gov.get("supersededBy"))
    licenses = sid in licensing

    signals: list[dict] = []
    if pubmed:
        for c in pubmed["corrections"]:
            signals.append({"via": "pubmed", **c})
    for c in crossref or []:
        signals.append({"via": "crossref", **c})

    findings: list[dict] = []
    recorded_signals: list[dict] = []
    for sig in signals:
        kind = sig["kind"]
        if kind == "updated":
            if superseded:
                recorded_signals.append(sig)
            else:
                findings.append({"kind": kind, "severity": severity(kind, licenses), "signal": sig})
        elif KIND_RANK[kind] > recorded_rank:
            findings.append({"kind": kind, "severity": severity(kind, licenses), "signal": sig})
        else:
            recorded_signals.append(sig)

    if pmid and pubmed_answered and pubmed is None:
        findings.append({
            "kind": "pmid-unresolved",
            "severity": "P1",
            "signal": {"via": "pubmed", "refSource": f"PubMed returned no record for PMID {pmid}"},
        })

    # Keep the worst first so triage reads top-down.
    order = {"P0": 0, "P1": 1, "P2": 2}
    findings.sort(key=lambda f: order[f["severity"]])
    return {
        "id": sid,
        "pmid": pmid,
        "doi": doi,
        "licensesClaims": licenses,
        "recordedCorrectionStatus": recorded,
        "supersededBy": gov.get("supersededBy") or [],
        "findings": findings,
        "recordedSignals": recorded_signals,
        "worst": findings[0]["severity"] if findings else None,
    }


def summarize(rows: list[dict], declared: int, identified: int, pubmed_examined: int,
              crossref_examined: int, unverifiable: list[str], crossref_unknown: list[str]) -> dict:
    counts = {"P0": 0, "P1": 0, "P2": 0}
    for r in rows:
        for f in r["findings"]:
            counts[f["severity"]] += 1
    return {
        "schemaVersion": 1,
        "checkedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourcesDeclared": declared,
        "sourcesIdentified": identified,
        "pubmedExamined": pubmed_examined,
        "crossrefExamined": crossref_examined,
        "unverifiableById": sorted(unverifiable),
        "doiNotInCrossref": sorted(crossref_unknown),
        "findingCounts": counts,
        "sourcesWithFindings": sum(1 for r in rows if r["findings"]),
        "rows": rows,
    }


def render(summary: dict) -> str:
    lines = [
        "source integrity: %d source(s) declared, %d with a PMID or DOI, %d answered by PubMed, "
        "%d answered by Crossref, %d unverifiable by id"
        % (summary["sourcesDeclared"], summary["sourcesIdentified"], summary["pubmedExamined"],
           summary["crossrefExamined"], len(summary["unverifiableById"]))
    ]
    if summary["unverifiableById"]:
        lines.append("  unverifiable by id (no PMID, no DOI): " + ", ".join(summary["unverifiableById"]))
    if summary["doiNotInCrossref"]:
        lines.append("  doi not in crossref (informational): " + ", ".join(summary["doiNotInCrossref"]))
    flagged = [r for r in summary["rows"] if r["findings"]]
    for r in sorted(flagged, key=lambda r: r["worst"]):
        for f in r["findings"]:
            sig = f["signal"]
            where = sig.get("refSource") or sig.get("doi") or sig.get("type") or ""
            lines.append("  %s  %-28s %-22s via %-8s %s%s" % (
                f["severity"], r["id"], f["kind"], sig.get("via", "?"), where[:70],
                "  [licenses claims]" if r["licensesClaims"] else ""))
    c = summary["findingCounts"]
    if flagged:
        lines.append("source integrity: %d finding(s) across %d source(s) — P0 %d · P1 %d · P2 %d"
                     % (sum(c.values()), len(flagged), c["P0"], c["P1"], c["P2"]))
    else:
        lines.append("source integrity: clean (%d source(s) examined via PubMed, %d via Crossref)"
                     % (summary["pubmedExamined"], summary["crossrefExamined"]))
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------
# Collectors — the only code that touches the network. Replaced wholesale by the self-test.
# ---------------------------------------------------------------------------------------

def _get(url: str) -> tuple[int, bytes]:
    """GET with the house timeout and bounded retries on 429/5xx. Returns (status, body).
    A 404 is returned, not raised — the caller decides what a 404 means for its host."""
    last: Exception | None = None
    for attempt in range(RETRIES + 1):
        req = urllib.request.Request(url, method="GET")
        req.add_header("User-Agent", UA)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return 404, b""
            if exc.code in (429, 500, 502, 503, 504) and attempt < RETRIES:
                time.sleep(1.5 * (attempt + 1))
                last = exc
                continue
            raise IntegrityError(f"HTTP {exc.code} from {url.split('?')[0]}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            text = str(getattr(exc, "reason", exc))
            if "Tunnel connection failed" in text or "CONNECT" in text:
                raise IntegrityError("egress proxy denied the CONNECT tunnel to %s — reachability, not a finding"
                                     % urllib.parse.urlsplit(url).hostname) from exc
            last = exc
            if attempt < RETRIES:
                time.sleep(1.5 * (attempt + 1))
                continue
    raise IntegrityError(f"transport failure for {url.split('?')[0]}: {last}")


def fetch_pubmed(pmids: list[str]) -> dict[str, dict]:
    """Batched efetch. Every batch must answer or the whole run is undeterminable."""
    out: dict[str, dict] = {}
    key = os.environ.get("NCBI_API_KEY", "").strip()
    for i in range(0, len(pmids), PUBMED_BATCH):
        batch = pmids[i:i + PUBMED_BATCH]
        params = {"db": "pubmed", "id": ",".join(batch), "retmode": "xml", "tool": "clerkship-source-integrity"}
        if key:
            params["api_key"] = key
        status, body = _get(EUTILS + "?" + urllib.parse.urlencode(params))
        if status != 200:
            raise IntegrityError(f"PubMed efetch answered HTTP {status}")
        out.update(parse_pubmed_xml(body.decode("utf-8", errors="replace")))
        time.sleep(PUBMED_THROTTLE_S)
    return out


def fetch_crossref(doi: str) -> list[dict] | None:
    """Update list for one DOI, or None when Crossref does not know the DOI (404)."""
    status, body = _get(CROSSREF + urllib.parse.quote(doi, safe=""))
    time.sleep(CROSSREF_THROTTLE_S)
    if status == 404:
        return None
    if status != 200:
        raise IntegrityError(f"Crossref answered HTTP {status} for {doi}")
    try:
        message = json.loads(body.decode("utf-8", errors="replace")).get("message") or {}
    except ValueError as exc:
        raise IntegrityError(f"Crossref returned unparseable JSON for {doi}") from exc
    return parse_crossref(message)


def examine(sources: list[dict], licensing: set[str], *, pubmed_only: bool,
            pubmed_fetch=None, crossref_fetch=None) -> dict:
    pubmed_fetch = pubmed_fetch or fetch_pubmed
    crossref_fetch = crossref_fetch or fetch_crossref
    declared = len(sources)
    by_pmid: dict[str, list[dict]] = {}
    with_doi: list[tuple[dict, str]] = []
    unverifiable: list[str] = []
    identified = 0
    for s in sources:
        pmid, doi = identifiers(s)
        if not pmid and not doi:
            unverifiable.append(s.get("id", "?"))
            continue
        identified += 1
        if pmid:
            by_pmid.setdefault(pmid, []).append(s)
        if doi:
            with_doi.append((s, doi))

    pubmed_records = pubmed_fetch(sorted(by_pmid)) if by_pmid else {}
    crossref_results: dict[str, list[dict] | None] = {}
    if not pubmed_only:
        for s, doi in with_doi:
            if doi not in crossref_results:
                crossref_results[doi] = crossref_fetch(doi)

    rows = []
    pubmed_examined = 0
    crossref_examined = 0
    crossref_unknown: list[str] = []
    for s in sources:
        pmid, doi = identifiers(s)
        if not pmid and not doi:
            continue
        rec = pubmed_records.get(pmid) if pmid else None
        if pmid:
            pubmed_examined += 1
        cr = None
        if doi and not pubmed_only:
            cr = crossref_results.get(doi)
            if cr is None:
                crossref_unknown.append(s.get("id", "?"))
            else:
                crossref_examined += 1
        rows.append(classify_source(s, rec, cr, licensing, pubmed_answered=bool(pmid)))

    summary = summarize(rows, declared, identified, pubmed_examined, crossref_examined,
                        unverifiable, crossref_unknown)
    # Every declared source is either a row (it had an identifier and was asked) or is named
    # in the unverifiable list. Anything else is a hole, and a hole is not a pass.
    if len(rows) + len(unverifiable) != declared:
        raise IntegrityError("examined %d of %d declared sources" % (len(rows) + len(unverifiable), declared))
    return summary


# ---------------------------------------------------------------------------------------

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--json", action="store_true", help="machine-readable output on stdout")
    ap.add_argument("--out", type=Path, help="also write the JSON report to this file")
    ap.add_argument("--ids", help="comma-separated registry ids to restrict the run to")
    ap.add_argument("--pubmed-only", action="store_true", help="skip the Crossref second opinion")
    ap.add_argument("--registry", type=Path, default=REGISTRY)
    ap.add_argument("--annotations", type=Path, default=ANNOTATIONS)
    ap.add_argument("--self-test", action="store_true",
                    help="prove each classification can fire, stays silent on the good case, and that a transport failure is exit 2")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    try:
        sources = load_registry(args.registry)
        licensing = licensing_ids(args.annotations)
        if args.ids:
            wanted = {x.strip() for x in args.ids.split(",") if x.strip()}
            sources = [s for s in sources if s.get("id") in wanted]
            missing = wanted - {s.get("id") for s in sources}
            if missing:
                raise IntegrityError("unknown registry id(s): " + ", ".join(sorted(missing)))
        summary = examine(sources, licensing, pubmed_only=args.pubmed_only)
    except IntegrityError as exc:
        print(f"source integrity: COULD NOT DETERMINE — {exc}", file=sys.stderr)
        print("Refusing to report clean while examining less than was declared.", file=sys.stderr)
        return 2

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print(render(summary))
    return 1 if summary["sourcesWithFindings"] else 0


# ---------------------------------------------------------------------------------------

_RETRACTED_XML = """<?xml version="1.0"?>
<PubmedArticleSet>
 <PubmedArticle><MedlineCitation><PMID>1000001</PMID><Article>
  <PublicationTypeList><PublicationType>Journal Article</PublicationType><PublicationType>Retracted Publication</PublicationType></PublicationTypeList>
  </Article>
  <CommentsCorrectionsList>
   <CommentsCorrections RefType="CommentIn"><RefSource>Lancet. 1998</RefSource><PMID>9</PMID></CommentsCorrections>
   <CommentsCorrections RefType="RetractionIn"><RefSource>Lancet. 2010 Feb 6;375(9713):445</RefSource><PMID>20137807</PMID></CommentsCorrections>
   <CommentsCorrections RefType="ExpressionOfConcernIn"><RefSource>Eur J Gastroenterol Hepatol. 2011</RefSource><PMID>21971344</PMID></CommentsCorrections>
  </CommentsCorrectionsList>
 </MedlineCitation></PubmedArticle>
 <PubmedArticle><MedlineCitation><PMID>1000002</PMID><Article>
  <PublicationTypeList><PublicationType>Journal Article</PublicationType><PublicationType>Meta-Analysis</PublicationType></PublicationTypeList>
  </Article></MedlineCitation></PubmedArticle>
 <PubmedArticle><MedlineCitation><PMID>1000003</PMID><Article>
  <PublicationTypeList><PublicationType>Review</PublicationType></PublicationTypeList></Article>
  <CommentsCorrectionsList>
   <CommentsCorrections RefType="UpdateIn"><RefSource>Cochrane Database Syst Rev. 2024</RefSource><PMID>77</PMID></CommentsCorrections>
   <CommentsCorrections RefType="ErratumIn"><RefSource>Cochrane Database Syst Rev. 2022</RefSource><PMID>78</PMID></CommentsCorrections>
  </CommentsCorrectionsList>
 </MedlineCitation></PubmedArticle>
 <PubmedArticle><MedlineCitation><PMID>1000004</PMID><Article>
  <PublicationTypeList><PublicationType>Journal Article</PublicationType><PublicationType>Retracted Publication</PublicationType></PublicationTypeList>
  </Article></MedlineCitation></PubmedArticle>
</PubmedArticleSet>
"""


def _src(sid, pmid="", doi="", status="none-known", superseded=None):
    return {"id": sid, "citation": {"pmid": pmid, "doi": doi},
            "governance": {"correctionStatus": status, "supersededBy": superseded or []}}


def self_test() -> int:
    import tempfile

    checks: list[tuple[str, bool]] = []

    def expect(label: str, condition: bool) -> None:
        checks.append((label, bool(condition)))

    # --- parsing ------------------------------------------------------------------------
    recs = parse_pubmed_xml(_RETRACTED_XML)
    expect("parse: four articles", len(recs) == 4)
    kinds1 = [c["kind"] for c in recs["1000001"]["corrections"]]
    expect("parse: RetractionIn kept, CommentIn dropped", kinds1 == ["retracted", "expression-of-concern"])
    expect("parse: RetractionIn carries its RefSource", recs["1000001"]["corrections"][0]["refSource"].startswith("Lancet. 2010"))
    expect("parse: clean article has no corrections", recs["1000002"]["corrections"] == [])
    expect("parse: UpdateIn and ErratumIn both kept", [c["kind"] for c in recs["1000003"]["corrections"]] == ["updated", "erratum"])
    expect("parse: 'Retracted Publication' pubtype alone implies retracted",
           [c["kind"] for c in recs["1000004"]["corrections"]] == ["retracted"])
    try:
        parse_pubmed_xml("<not xml")
        expect("parse: malformed XML raises", False)
    except IntegrityError:
        expect("parse: malformed XML raises", True)

    cr = parse_crossref({"updated-by": [
        {"type": "retraction", "DOI": "10.1/r", "updated": {"date-time": "2024-01-02T00:00:00Z"}},
        {"type": "correction", "DOI": "10.1/c"},
        {"type": "somethingelse", "DOI": "10.1/x"},
    ]})
    expect("crossref: retraction and correction mapped, unknown type dropped",
           [c["kind"] for c in cr] == ["retracted", "erratum"] and cr[0]["updated"] == "2024-01-02")
    expect("crossref: empty message has no updates", parse_crossref({}) == [])
    expect("crossref: update-to (the works THIS one supersedes) is ignored — direction pinned",
           parse_crossref({"update-to": [{"type": "new_version", "DOI": "10.1/older"}]}) == [])
    expect("crossref: updated-by new_version is a supersession signal",
           [c["kind"] for c in parse_crossref({"updated-by": [{"type": "new_version", "DOI": "10.1/newer"}]})] == ["updated"])

    # --- identifiers ------------------------------------------------------------------
    expect("ids: pmid must be digits", identifiers(_src("a", pmid="12x")) == ("", ""))
    expect("ids: doi must start with 10.", identifiers(_src("a", doi="https://doi.org/x")) == ("", ""))
    expect("ids: doi lower-cased", identifiers(_src("a", doi="10.1016/S0140"))[1] == "10.1016/s0140")

    # --- classification, both directions ------------------------------------------------
    lic = {"lic"}
    row = classify_source(_src("lic", pmid="1000001"), recs["1000001"], None, lic, True)
    expect("classify: retraction of a licensing source is P0", row["worst"] == "P0")
    expect("classify: expression of concern also raised as P1",
           [f["severity"] for f in row["findings"]] == ["P0", "P1"])
    row = classify_source(_src("nolic", pmid="1000001"), recs["1000001"], None, lic, True)
    expect("classify: retraction of a non-licensing source is P1", row["worst"] == "P1")
    row = classify_source(_src("lic", pmid="1000001", status="retracted"), recs["1000001"], None, lic, True)
    expect("classify: retraction already recorded is not a finding",
           row["findings"] == [] and len(row["recordedSignals"]) == 2)
    row = classify_source(_src("lic", pmid="1000001", status="corrected"), recs["1000001"], None, lic, True)
    expect("classify: 'corrected' does not cover a retraction", row["worst"] == "P0")
    row = classify_source(_src("lic", pmid="1000002"), recs["1000002"], None, lic, True)
    expect("classify: clean record, no findings", row["findings"] == [] and row["worst"] is None)
    row = classify_source(_src("lic", pmid="1000003"), recs["1000003"], None, lic, True)
    expect("classify: update is P2, erratum on licensing source is P1 — worst first",
           [f["severity"] for f in row["findings"]] == ["P1", "P2"])
    row = classify_source(_src("nolic", pmid="1000003"), recs["1000003"], None, lic, True)
    expect("classify: erratum on non-licensing source is P2", {f["severity"] for f in row["findings"]} == {"P2"})
    row = classify_source(_src("lic", pmid="1000003", status="corrected", superseded=["new-2024"]),
                          recs["1000003"], None, lic, True)
    expect("classify: erratum recorded as corrected and update recorded as supersededBy → clean",
           row["findings"] == [] and len(row["recordedSignals"]) == 2)
    row = classify_source(_src("lic", pmid="4040404"), None, None, lic, True)
    expect("classify: PMID PubMed does not know is a P1 finding",
           row["worst"] == "P1" and row["findings"][0]["kind"] == "pmid-unresolved")
    row = classify_source(_src("lic", doi="10.1/r"), None, cr, lic, False)
    expect("classify: crossref retraction alone fires P0 (no pmid asked, none unresolved)",
           row["worst"] == "P0" and all(f["kind"] != "pmid-unresolved" for f in row["findings"]))
    row = classify_source(_src("lic", doi="10.1/r"), None, [], lic, False)
    expect("classify: crossref with no updates is clean", row["findings"] == [])

    # --- end-to-end main() with stubbed collectors: NEVER INERT ------------------------
    def stub_pubmed(pmids):
        return parse_pubmed_xml(_RETRACTED_XML)

    def stub_pubmed_fail(pmids):
        raise IntegrityError("simulated transport failure")

    def stub_crossref(doi):
        return None if doi == "10.9/unknown" else []

    registry = {"sources": [
        _src("s-clean", pmid="1000002", doi="10.9/clean"),
        _src("s-retracted", pmid="1000001"),
        _src("s-noid"),
        _src("s-doi-unknown", doi="10.9/unknown"),
    ]}
    annotations = {"annotations": [{"sourceId": "s-retracted", "claims": [{"claimId": "c"}]}]}

    this = sys.modules[__name__]
    real_pubmed, real_crossref = this.fetch_pubmed, this.fetch_crossref
    with tempfile.TemporaryDirectory() as td:
        reg = Path(td) / "reg.json"
        ann = Path(td) / "ann.json"
        reg.write_text(json.dumps(registry), encoding="utf-8")
        ann.write_text(json.dumps(annotations), encoding="utf-8")
        out = Path(td) / "report.json"
        base = ["--registry", str(reg), "--annotations", str(ann), "--json", "--out", str(out)]
        try:
            this.fetch_pubmed, this.fetch_crossref = stub_pubmed, stub_crossref
            import io
            import contextlib
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = main(base)
            rep = json.loads(out.read_text(encoding="utf-8"))
            expect("e2e: retraction present → exit 1", code == 1)
            expect("e2e: coverage states declared 4, identified 3, pubmed 2, crossref 1",
                   (rep["sourcesDeclared"], rep["sourcesIdentified"], rep["pubmedExamined"], rep["crossrefExamined"]) == (4, 3, 2, 1))
            expect("e2e: identifier-less source is LISTED, not skipped silently", rep["unverifiableById"] == ["s-noid"])
            expect("e2e: unknown-to-crossref DOI is informational, not a finding",
                   rep["doiNotInCrossref"] == ["s-doi-unknown"] and rep["findingCounts"] == {"P0": 1, "P1": 1, "P2": 0})
            expect("e2e: stdout JSON matches the --out file", json.loads(buf.getvalue())["findingCounts"] == rep["findingCounts"])

            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = main(base + ["--ids", "s-clean"])
            expect("e2e: --ids restricts to a clean source → exit 0", code == 0)
            with contextlib.redirect_stdout(io.StringIO()):
                code = main(base + ["--ids", "s-clean,no-such-id"])
            expect("e2e: unknown --ids is exit 2, not a silent narrowing", code == 2)

            this.fetch_pubmed = stub_pubmed_fail
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = main(base)
            expect("e2e: transport failure is exit 2, never a pass", code == 2)

            this.fetch_pubmed = stub_pubmed
            reg.write_text("{not json", encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = main(base)
            expect("e2e: unreadable registry is exit 2", code == 2)

            reg.write_text(json.dumps(registry), encoding="utf-8")
            ann.write_text("{not json", encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                code = main(base)
            expect("e2e: unreadable annotations is exit 2 (would demote every retraction)", code == 2)
        finally:
            this.fetch_pubmed, this.fetch_crossref = real_pubmed, real_crossref

    # --- render ---------------------------------------------------------------------------
    text = render(summarize([classify_source(_src("lic", pmid="1000001"), recs["1000001"], None, lic, True)],
                            1, 1, 1, 0, [], []))
    expect("render: coverage line comes first", text.splitlines()[0].startswith("source integrity: 1 source(s) declared"))
    expect("render: P0 row names the source and marks it as licensing", "P0  lic" in text and "[licenses claims]" in text)
    clean = render(summarize([], 2, 0, 0, 0, ["a", "b"], []))
    expect("render: clean verdict still lists the unverifiable ids", "unverifiable by id" in clean and "clean" in clean)

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
