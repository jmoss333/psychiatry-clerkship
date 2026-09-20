#!/usr/bin/env python3
"""run_citation_check.py — live citation-validity checks (Phase 2b).

Complements the lychee link-monitor. Lychee crawls links in built HTML/markdown;
this job verifies two things lychee does NOT cover:

  1. The authoritative **source URLs** projected from evidence_registry.json — the
     pages the whole guideline-surveillance pipeline depends on. The canonical
     registry is not a built link surface, so a markdown/HTML crawler never sees
     them. If FDA/APA/USPSTF move a page, we learn
     it here (and flip `verified`).
  2. **DOIs and PMIDs** cited in curriculum text — resolved against doi.org and
     NCBI eutils. A citation that no longer resolves is a retraction/typo signal.
  3. **Source integrity** (2026-09-19, WS-7): `bin/check_source_integrity.py` asks PubMed
     and Crossref whether each registry source still STANDS — retraction, erratum,
     expression of concern, newer version — and only what the registry does not already
     record becomes a finding (job "source-integrity"). A transport failure is a single P2
     "check-unavailable" finding, never silence, and the receipt for the monthly review
     (history/source_integrity_receipt.json) is written only by a determinate run.

Emits findings conforming to config/finding.schema.json (job "link-source-monitor")
to --out; the existing sync_findings.py turns them into idempotent issues, and
open_update_pr.py can route actionable ones to attestation PRs.

Stdlib only (urllib). Politeness: per-request timeout, bounded retries, throttle.

Usage:
  python3 run_citation_check.py --out findings.json                  # registry + citations
  python3 run_citation_check.py --out findings.json --skip-citations # registry only
  python3 run_citation_check.py --out findings.json --skip-integrity # no PubMed/Crossref
  python3 run_citation_check.py --self-test                          # no network, logic check
"""
import os, re, sys, json, time, argparse, urllib.request, urllib.error
import lib_surveillance as L

UA = "curriculum-surveillance-citation-check/1.0 (+education; contact faculty)"
TIMEOUT_S = 20
THROTTLE_S = 0.7
DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.I)
PMID_RE = re.compile(r"\bPMID:?\s*(\d{4,9})\b", re.I)
SOFT_404 = ("page not found", "404 error", "not be found", "no longer available",
            "has moved", "page you requested")
SCAN_EXTS = (".md", ".html")
SKIP_DIRS = {
    ".git", ".netlify", "_automation", "_build", "build", "dist",
    "node_modules", "site", "13_Faculty_Resources",
}
CITATION_SKIP_PREFIXES = ("00_START_HERE/notebooklm_upload_", "_prototypes/")
CITATION_SKIP_PARTS = ("/_source/",)
CITATION_INCLUDE_PREFIXES = (
    "01_Six_Week_Curriculum/",
    "02_Clinical_Skills/",
    "03_Core_Topics/",
    "04_Acute_and_Safety/",
    "05_Psychopharmacology/",
    "06_Family_and_Relational/",
    "07_Evidence_and_Reading/",
    "08_Cases_and_Simulation/",
    "09_Exam_Prep/",
    "10_Patient_and_Family_Education/",
    "11_AI_and_Prompts/",
    "12_Media/",
    "14_Tracks/",
)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


NO_REDIRECT_OPENER = urllib.request.build_opener(_NoRedirect)


def classify(url, retries=2):
    """Return (ok, change_type|None, code|None, redirect_to|None, detail).

    ok=True  -> reachable, no action.
    change_type in {broken-link, soft-404, redirect, tls-error}.
    Follows redirects but reports a *permanent* (301/308) redirect as actionable.
    429/503 are treated as transient (ok) — never flag rate-limiting as broken.
    Other 4xx/5xx responses are retried before flagging so a brief CDN edge
    miss does not immediately become a P0 source outage.
    """
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, method="GET")
            req.add_header("User-Agent", UA)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                final = r.geturl()
                body = r.read(4096).decode("utf-8", "replace").lower()
                if any(s in body for s in SOFT_404):
                    return False, "soft-404", 200, None, "200 body reads as not-found"
                return True, None, getattr(r, "status", 200), (final if final != url else None), "ok"
        except urllib.error.HTTPError as e:
            code = e.code
            if code in (429, 503):
                last = ("transient", code); time.sleep(1.5 * (attempt + 1)); continue
            if code in (301, 308):
                loc = e.headers.get("Location") if e.headers else None
                return False, "redirect", code, loc, "permanent redirect"
            if code in (302, 303, 307):
                return True, None, code, (e.headers.get("Location") if e.headers else None), "temporary redirect"
            if 400 <= code < 600 and attempt < retries:
                last = ("http", code)
                time.sleep(1.0 * (attempt + 1))
                continue
            return False, "broken-link", code, None, "http %s" % code
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            reason = getattr(e, "reason", e)
            if "certificate" in str(reason).lower() or "ssl" in str(reason).lower():
                return False, "tls-error", None, None, str(reason)
            last = ("neterr", str(reason)); time.sleep(1.0 * (attempt + 1)); continue
    # exhausted retries on a transient/network error -> flag conservatively as broken
    kind, detail = last or ("neterr", "unknown")
    if kind == "transient":
        return True, None, detail, None, "rate-limited (not flagged)"
    return False, "broken-link", None, None, "unreachable after retries: %s" % detail


def classify_doi(doi, retries=2):
    """Return DOI reachability without following into publisher bot-blocks.

    DOI.org commonly returns a temporary redirect to the publisher. That redirect
    proves the DOI resolved; a downstream publisher 403 should not become a
    broken-citation finding.
    """
    url = "https://doi.org/" + doi
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, method="GET")
            req.add_header("User-Agent", UA)
            with NO_REDIRECT_OPENER.open(req, timeout=TIMEOUT_S) as r:
                final = r.geturl()
                return True, None, getattr(r, "status", 200), (final if final != url else None), "ok"
        except urllib.error.HTTPError as e:
            code = e.code
            loc = e.headers.get("Location") if e.headers else None
            if code in (301, 302, 303, 307, 308) and loc:
                return True, None, code, loc, "doi resolved"
            if code in (429, 503):
                last = ("transient", code); time.sleep(1.5 * (attempt + 1)); continue
            if 400 <= code < 600 and attempt < retries:
                last = ("http", code); time.sleep(1.0 * (attempt + 1)); continue
            return False, "broken-link", code, None, "doi.org http %s" % code
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            reason = getattr(e, "reason", e)
            if "certificate" in str(reason).lower() or "ssl" in str(reason).lower():
                return False, "tls-error", None, None, str(reason)
            last = ("neterr", str(reason)); time.sleep(1.0 * (attempt + 1)); continue
    kind, detail = last or ("neterr", "unknown")
    if kind == "transient":
        return True, None, detail, None, "rate-limited (not flagged)"
    return False, "broken-link", None, None, "doi.org unreachable after retries: %s" % detail


def _finding(source_id, source_name, url, change_type, code, redirect_to, affects, action):
    fp = L.fingerprint(source_id, change_type, redirect_to or url)
    ev = {}
    if code is not None:
        ev["http_status"] = code if isinstance(code, int) else None
    if redirect_to:
        ev["redirect_to"] = redirect_to
    return {
        "finding_id": fp, "fingerprint": fp, "job": "link-source-monitor",
        "source_id": source_id, "source_name": source_name, "source_url": url,
        "source_type": "html", "detected_at": L.utcnow(), "change_type": change_type,
        "severity": "P1", "summary": "%s citation issue (%s) — %s"
            % (source_name, change_type, url),
        "evidence": ev, "affects": affects,
        "recommended_action": action, "status": "new",
    }


# ---------------------------------------------------------------- source integrity
INTEGRITY_CHANGE_TYPES = {
    "retracted": "retracted",
    "erratum": "erratum",
    "expression-of-concern": "expression-of-concern",
    "updated": "superseded",
    "pmid-unresolved": "identifier-unresolved",
}
INTEGRITY_RECEIPT = os.path.join(L.HISTORY, "source_integrity_receipt.json")


def _integrity_module():
    """bin/check_source_integrity.py, loaded by path so the collector stays standalone."""
    import importlib.util
    path = os.path.join(L.LIB_ROOT, "bin", "check_source_integrity.py")
    spec = importlib.util.spec_from_file_location("check_source_integrity", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def integrity_findings_from_summary(summary, when=None):
    """Pure: a check_source_integrity summary -> schema-shaped findings.

    One finding per (source, kind, signal). The signature is the kind plus the citation of
    the correcting/superseding record, so the same retraction fingerprints the same way
    every week and sync_findings dedups it against its issue.
    """
    when = when or L.utcnow()
    out = []
    for row in summary.get("rows", []):
        # PubMed and Crossref are two opinions of the same event when Crossref's DOI is the
        # one PubMed's RefSource cites; file that once, under the PubMed citation.
        pubmed_cites = " ".join((f.get("signal") or {}).get("refSource") or ""
                                for f in row.get("findings", [])
                                if (f.get("signal") or {}).get("via") == "pubmed").lower()
        for f in row.get("findings", []):
            sig = f.get("signal") or {}
            if sig.get("via") == "crossref" and sig.get("doi") and sig["doi"].lower() in pubmed_cites:
                continue
            where = sig.get("refSource") or sig.get("doi") or ""
            change_type = INTEGRITY_CHANGE_TYPES.get(f["kind"], f["kind"])
            fp = L.fingerprint(row["id"], change_type, "%s|%s" % (f["kind"], where))
            licenses = bool(row.get("licensesClaims"))
            summary_text = "%s: %s%s — %s" % (
                row["id"], f["kind"].replace("-", " "),
                " (licenses stored claims)" if licenses else "", where or "no citation given")
            out.append({
                "finding_id": fp, "fingerprint": fp, "job": "source-integrity",
                "source_id": row["id"], "source_name": row["id"],
                "source_url": ("https://pubmed.ncbi.nlm.nih.gov/%s/" % row["pmid"]) if row.get("pmid")
                              else ("https://doi.org/%s" % row["doi"] if row.get("doi") else ""),
                "source_type": "html", "detected_at": when, "change_type": change_type,
                "severity": f["severity"], "summary": summary_text,
                "evidence": {"via": sig.get("via"), "kind": f["kind"], "refSource": sig.get("refSource"),
                             "doi": sig.get("doi"), "correctingPmid": sig.get("pmid"),
                             "updated": sig.get("updated"), "licensesClaims": licenses,
                             "recordedCorrectionStatus": row.get("recordedCorrectionStatus"),
                             "supersededBy": row.get("supersededBy")},
                "affects": [],
                "recommended_action": (
                    "Read the correcting/superseding record. If it changes what the library "
                    "teaches, fix the SOURCE page and its stored span and re-stamp reviewed.json; "
                    "then record governance.correctionStatus / supersededBy in evidence_registry.json. "
                    "If it changes nothing, record the status anyway so this stops re-filing."),
                "status": "new",
            })
    return out


def integrity_unavailable_finding(reason, when=None):
    """A transport failure is reported, never swallowed (silence != stability)."""
    when = when or L.utcnow()
    fp = L.fingerprint("source-integrity", "check-unavailable", "weekly")
    return {
        "finding_id": fp, "fingerprint": fp, "job": "source-integrity",
        "source_id": "source-integrity", "source_name": "Source integrity check",
        "source_url": "", "source_type": "html", "detected_at": when,
        "change_type": "check-unavailable", "severity": "P2",
        "summary": "source-integrity check could not run this week: %s" % reason,
        "evidence": {"reason": reason}, "affects": [],
        "recommended_action": "Run `python3 bin/check_source_integrity.py` from a machine with "
                              "real egress; if the runner is bot-blocked, say so in the registry note.",
        "status": "new",
    }


def integrity_receipt(summary, when=None):
    """Content-free counts for monthly_review.py. Written only by a determinate run."""
    return {
        "schemaVersion": 1,
        "state": "success",
        "checkedAt": when or L.utcnow(),
        "sourcesDeclared": summary.get("sourcesDeclared"),
        "sourcesIdentified": summary.get("sourcesIdentified"),
        "pubmedExamined": summary.get("pubmedExamined"),
        "crossrefExamined": summary.get("crossrefExamined"),
        "unverifiableById": len(summary.get("unverifiableById", [])),
        "findingCounts": summary.get("findingCounts"),
        "sourcesWithFindings": summary.get("sourcesWithFindings"),
    }


def check_source_integrity(receipt_path=INTEGRITY_RECEIPT):
    """Ask PubMed and Crossref about every identified registry source (network)."""
    try:
        SI = _integrity_module()
    except Exception as exc:  # noqa: BLE001 - a missing module is not "all sources stand"
        print("  ! source-integrity module unavailable: %s" % exc, file=sys.stderr)
        return [integrity_unavailable_finding("module unavailable: %s" % exc)]
    try:
        sources = SI.load_registry()
        licensing = SI.licensing_ids()
        summary = SI.examine(sources, licensing, pubmed_only=False)
    except SI.IntegrityError as exc:
        print("  ! source-integrity could not determine: %s" % exc, file=sys.stderr)
        return [integrity_unavailable_finding(str(exc))]
    findings = integrity_findings_from_summary(summary)
    os.makedirs(os.path.dirname(receipt_path), exist_ok=True)
    with open(receipt_path, "w", encoding="utf-8") as fh:
        json.dump(integrity_receipt(summary), fh, indent=2, sort_keys=True)
        fh.write("\n")
    c = summary["findingCounts"]
    print("source-integrity: %d declared, %d identified, %d via PubMed, %d via Crossref -> "
          "%d finding(s) (P0 %d · P1 %d · P2 %d)" % (
              summary["sourcesDeclared"], summary["sourcesIdentified"], summary["pubmedExamined"],
              summary["crossrefExamined"], len(findings), c["P0"], c["P1"], c["P2"]))
    return findings


def _capped_severity(source, code):
    """Return (severity, cap_reason|None) for a source that failed its check.

    Two results are ambiguous enough that a P0 would overstate them:

      1. NO RESPONSE (code is None) -- often bot-blocking of a datacenter IP.
      2. Any 4xx from a source marked `link_check: browser_required`. The rule
         used to be "a definitive HTTP 4xx/5xx keeps the registry severity",
         which assumes a bot-block announces itself as 401/403. fda.gov does
         not: it serves its block as a 404, indistinguishable from a deleted
         page. Confirmed 2026-09-03 -- the runner recorded 404 for both FDA
         sources at 18:29Z while a laptop got 200 for each the same minute,
         using this module's identical User-Agent, so the network path is the
         only variable.

    Capping is NOT suppression. The finding still fires and still opens an
    issue; `_browser_required_soft_failure` deliberately does not swallow a
    404, because a genuinely dead official page must not disappear. What
    changes is the confidence attached to it, and that a human is told how to
    settle it. Only a P0 is capped -- a P1/P2 is already a "read this" signal.
    """
    sev = source.get("severity_default", "P1")
    reason = None
    if code is None:
        reason = "No HTTP response — could be bot-blocking"
    elif source.get("link_check") == "browser_required" and 400 <= code < 500:
        reason = ("HTTP %s from a source marked browser_required — some official "
                  "sites serve a bot-block as a definitive 4xx" % code)
    if reason and sev == "P0":
        return "P1", reason
    return sev, None


def _browser_required_soft_failure(source, code):
    """Official sites may block stdlib/curl while resolving in a real browser.

    Treat access-denied/no-response as a checker limitation only for sources that
    explicitly opt into browser verification. Definitive not-found responses
    still emit findings.
    """
    if source.get("link_check") != "browser_required":
        return False
    return code in (401, 403) or code is None


def check_registry_sources(checked=None):
    """Verify each registry source URL still resolves. Returns list of findings."""
    findings = []
    checked = checked if checked is not None else []
    reg = L.load_registry()
    for s in reg.get("sources", []):
        url = s.get("url")
        if not url:
            continue
        if s.get("type") == "login" or s.get("modality") == "signal_only":
            # copyrighted/paywalled (e.g. DSM login): reachability only, but many
            # such portals block bots — skip to avoid false positives.
            continue
        checked.append(s.get("id"))
        ok, ct, code, redir, detail = classify(url)
        time.sleep(THROTTLE_S)
        if ok:
            continue
        if _browser_required_soft_failure(s, code):
            continue
        action = ("Authoritative source URL for `%s` is %s. Update the canonical "
                  "citation `url` in evidence_registry.json (and any citing pages), then re-run. This "
                  "source feeds guideline surveillance — fixing it restores monitoring."
                  % (s.get("id"), detail))
        f = _finding(s.get("id"), s.get("name", s.get("id")), url, ct, code, redir, [], action)
        # Seed severity from the registry (acute paths still auto-escalate in sync),
        # capping the two ambiguous results -- see _capped_severity.
        sev, cap_reason = _capped_severity(s, code)
        if cap_reason:
            f["recommended_action"] += (
                " (%s; capped to P1. Verify from a non-runner network before acting: "
                "`python3 bin/verify_findings_offrunner.py`.)" % cap_reason)
        f["severity"] = sev
        findings.append(f)
    return findings


def _skip_citation_path(rel):
    """Skip imported/source-only citation copies that should not open faculty issues."""
    return (not rel.startswith(CITATION_INCLUDE_PREFIXES)
            or rel.startswith(CITATION_SKIP_PREFIXES)
            or any(part in rel for part in CITATION_SKIP_PARTS))


def scan_curriculum_citations(root):
    """Yield (kind, ident, url, repo_relative_path) for DOIs/PMIDs in live curriculum text."""
    root = os.path.abspath(root)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if not fn.endswith(SCAN_EXTS):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, root)
            if _skip_citation_path(rel):
                continue
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except Exception:
                continue
            for m in DOI_RE.finditer(text):
                doi = m.group(0).rstrip(".,);]")
                if doi.lower().endswith("/full"):
                    doi = doi[:-5]
                yield "doi", doi, "https://doi.org/" + doi, rel
            for m in PMID_RE.finditer(text):
                pmid = m.group(1)
                yield "pmid", pmid, ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
                                     "esummary.fcgi?db=pubmed&id=%s&retmode=json" % pmid), rel


def check_citations(root, checked=None):
    """Validate unique DOIs/PMIDs found in curriculum. Returns list of findings."""
    findings, seen = [], {}
    checked = checked if checked is not None else []
    for kind, ident, url, rel in scan_curriculum_citations(root):
        seen.setdefault((kind, ident), []).append(rel)
    for (kind, ident), files in sorted(seen.items()):
        checked.append("%s:%s" % (kind, ident))
        url = ("https://doi.org/" + ident if kind == "doi"
               else "https://pubmed.ncbi.nlm.nih.gov/%s/" % ident)
        check_url = (url if kind == "doi"
                     else "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
                          "?db=pubmed&id=%s&retmode=json" % ident)
        ok, ct, code, redir, detail = (classify_doi(ident) if kind == "doi"
                                       else classify(check_url))
        time.sleep(THROTTLE_S)
        if ok:
            continue
        sid = "%s:%s" % (kind, ident)
        action = ("Cited %s `%s` no longer resolves (%s). Verify the reference is "
                  "correct / not retracted; fix the citation on the page(s) and re-attest."
                  % (kind.upper(), ident, detail))
        findings.append(_finding(sid, "%s %s" % (kind.upper(), ident), url,
                                 ct, code, redir, sorted(files), action))
    return findings


def self_test():
    """No-network checks of the parsing/classification wiring."""
    ok = True
    sample = ("See doi:10.1001/jama.2020.12345 and https://doi.org/10.1176/appi.ajp.2019.176 . "
              "Also PMID: 31234567 and (PMID 9988776).")
    dois = DOI_RE.findall(sample)
    pmids = PMID_RE.findall(sample)
    assert any("10.1001/jama.2020.12345" in d for d in dois), dois
    assert "31234567" in pmids and "9988776" in pmids, pmids
    # _finding shape conforms to the required schema keys
    f = _finding("doi:10.x/y", "DOI 10.x/y", "https://doi.org/10.x/y",
                 "broken-link", 404, None, ["a.md"], "fix it")
    for k in ("finding_id", "fingerprint", "job", "source_id", "detected_at",
              "change_type", "severity", "summary", "status"):
        assert k in f, "missing %s" % k
    assert f["job"] == "link-source-monitor"
    # source-integrity conversion: pure, schema-shaped, stable fingerprints, no network
    fake = {"sourcesDeclared": 2, "sourcesIdentified": 1, "pubmedExamined": 1, "crossrefExamined": 1,
            "unverifiableById": ["x"], "findingCounts": {"P0": 1, "P1": 0, "P2": 1}, "sourcesWithFindings": 1,
            "rows": [{"id": "s1", "pmid": "123", "doi": "10.1/a", "licensesClaims": True,
                      "recordedCorrectionStatus": "none-known", "supersededBy": [],
                      "findings": [
                          {"kind": "retracted", "severity": "P0",
                           "signal": {"via": "pubmed", "refSource": "Lancet. 2010", "pmid": "9"}},
                          {"kind": "updated", "severity": "P2",
                           "signal": {"via": "crossref", "doi": "10.1/a.pub4", "updated": "2026-05-28"}}]}]}
    conv = integrity_findings_from_summary(fake, when="2026-09-19T00:00:00+00:00")
    assert [c["change_type"] for c in conv] == ["retracted", "superseded"], conv
    assert all(c["job"] == "source-integrity" and c["status"] == "new" for c in conv)
    for c in conv:
        for k in ("finding_id", "fingerprint", "job", "source_id", "detected_at",
                  "change_type", "severity", "summary", "status"):
            assert k in c, "integrity finding missing %s" % k
    assert conv[0]["severity"] == "P0" and "licenses stored claims" in conv[0]["summary"]
    assert conv[0]["source_url"].endswith("/123/")
    again = integrity_findings_from_summary(fake, when="2026-09-20T00:00:00+00:00")
    assert [c["fingerprint"] for c in again] == [c["fingerprint"] for c in conv], "fingerprint must not depend on the run date"
    assert integrity_findings_from_summary({"rows": []}) == []
    dup = {"rows": [{"id": "s2", "pmid": "1", "doi": "10.1/b", "licensesClaims": False,
                     "findings": [
                         {"kind": "erratum", "severity": "P2",
                          "signal": {"via": "pubmed", "refSource": "J Am Geriatr Soc. 2019;67(9):1991. doi: 10.1111/jgs.15925."}},
                         {"kind": "erratum", "severity": "P2",
                          "signal": {"via": "crossref", "doi": "10.1111/jgs.15925"}},
                         {"kind": "erratum", "severity": "P2",
                          "signal": {"via": "crossref", "doi": "10.1111/other"}}]}]}
    d = integrity_findings_from_summary(dup)
    assert len(d) == 2 and d[0]["evidence"]["via"] == "pubmed" and d[1]["evidence"]["doi"] == "10.1111/other", \
        "a Crossref erratum PubMed already cites is the same event, filed once"
    u = integrity_unavailable_finding("simulated")
    assert u["change_type"] == "check-unavailable" and u["severity"] == "P2" and "simulated" in u["summary"]
    r = integrity_receipt(fake, when="2026-09-19T00:00:00+00:00")
    assert r["state"] == "success" and r["sourcesDeclared"] == 2 and r["findingCounts"]["P0"] == 1
    assert "rows" not in r and "summary" not in r, "receipt must stay content-free"
    assert _browser_required_soft_failure({"link_check": "browser_required"}, 403)
    assert _browser_required_soft_failure({"link_check": "browser_required"}, None)
    assert not _browser_required_soft_failure({"link_check": "browser_required"}, 404)
    assert not _browser_required_soft_failure({}, 403)
    # A browser_required source's 404 still FIRES (above) but no longer claims P0.
    BR = {"severity_default": "P0", "link_check": "browser_required"}
    assert _capped_severity(BR, 404)[0] == "P1"
    assert "browser_required" in _capped_severity(BR, 404)[1]
    assert _capped_severity(BR, None)[0] == "P1"
    # 5xx is a server fault, not a bot-block shape: not capped.
    assert _capped_severity(BR, 503) == ("P0", None)
    # An unmarked source keeps its registry severity on a definitive 404.
    assert _capped_severity({"severity_default": "P0"}, 404) == ("P0", None)
    # Only a P0 is capped; a P1 is already a "read this" signal.
    assert _capped_severity({"severity_default": "P1", "link_check": "browser_required"}, 404) \
        == ("P1", None)
    # The two FDA sources are marked, so the P0 that has mis-fired weekly is now capped.
    _reg_by_id = {x["id"]: x for x in L.load_registry()["sources"]}
    assert _reg_by_id["fda-drug-safety"].get("link_check") == "browser_required"
    assert _reg_by_id["clozapine-rems"].get("link_check") == "browser_required"
    assert _capped_severity(_reg_by_id["fda-drug-safety"], 404)[0] == "P1"
    sample_frontiers = "[article](https://www.frontiersin.org/articles/10.3389/fmed.2024.1358529/full)"
    assert DOI_RE.search(sample_frontiers).group(0).rstrip(".,);]").endswith("/full")
    assert _skip_citation_path("00_START_HERE/notebooklm_upload_2026-07-01/a.md")
    assert _skip_citation_path("08_Cases_and_Simulation/_source/DOI_REPORT.md")
    assert _skip_citation_path("_prototypes/demo.preview.html")
    assert _skip_citation_path("MS3-Psychiatry-Site_Multidisciplinary-Audit_2026-06-28.md")
    assert not _skip_citation_path("07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md")
    registry = L.load_registry()
    assert len(registry["sources"]) == 8
    assert registry["link_monitor"]["cadence"] == "weekly"
    assert registry["resource_intake"]["max_candidates_per_run"] == 25
    # backtick neutralization happens downstream in issue_body; here just ensure
    # fingerprints are stable across runs
    assert L.fingerprint("a", "broken-link", "u") == L.fingerprint("a", "broken-link", "u")
    print("self-test: DOIs=%d PMIDs=%d, finding schema keys OK, fingerprints stable; canonical registry projection OK." %
          (len(dois), len(pmids)))
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="findings.json")
    ap.add_argument("--checked-out", default="checked-sources.json")
    ap.add_argument("--root", default=L.LIB_ROOT, help="Curriculum root to scan for DOIs/PMIDs.")
    ap.add_argument("--skip-citations", action="store_true", help="Registry source URLs only.")
    ap.add_argument("--skip-sources", action="store_true", help="DOIs/PMIDs only.")
    ap.add_argument("--skip-integrity", action="store_true",
                    help="Do not ask PubMed/Crossref whether registry sources still stand.")
    ap.add_argument("--self-test", action="store_true", help="No network; validate logic.")
    a = ap.parse_args()

    if a.self_test:
        sys.exit(0 if self_test() else 1)

    findings, checked = [], []
    if not a.skip_sources:
        findings += check_registry_sources(checked)
    if not a.skip_citations:
        findings += check_citations(a.root, checked)
    # Integrity rides with the registry-source pass: --skip-sources (the offline test path)
    # skips it too, so no test reaches the network by accident.
    if not a.skip_sources and not a.skip_integrity:
        findings += check_source_integrity()

    # de-dup by fingerprint (a DOI cited on many pages already merged in check_citations)
    uniq, seen = [], set()
    for f in findings:
        if f["fingerprint"] in seen:
            continue
        seen.add(f["fingerprint"]); uniq.append(f)

    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(uniq, fh, indent=2)
    with open(a.checked_out, "w", encoding="utf-8") as fh:
        json.dump(L.validate_checked_sources(checked), fh, indent=2)
    print("citation-check: %d finding(s) -> %s" % (len(uniq), a.out))


if __name__ == "__main__":
    main()
