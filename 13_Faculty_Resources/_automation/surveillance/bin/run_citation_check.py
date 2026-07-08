#!/usr/bin/env python3
"""run_citation_check.py — live citation-validity checks (Phase 2b).

Complements the lychee link-monitor. Lychee crawls links in built HTML/markdown;
this job verifies two things lychee does NOT cover:

  1. The authoritative **source URLs** in config/source_registry.yaml — the pages
     the whole guideline-surveillance pipeline depends on. They live in YAML, so a
     markdown/HTML crawler never sees them. If FDA/APA/USPSTF move a page, we learn
     it here (and flip `verified`).
  2. **DOIs and PMIDs** cited in curriculum text — resolved against doi.org and
     NCBI eutils. A citation that no longer resolves is a retraction/typo signal.

Emits findings conforming to config/finding.schema.json (job "link-source-monitor")
to --out; the existing sync_findings.py turns them into idempotent issues, and
open_update_pr.py can route actionable ones to attestation PRs.

Stdlib only (urllib). Politeness: per-request timeout, bounded retries, throttle.

Usage:
  python3 run_citation_check.py --out findings.json                  # registry + citations
  python3 run_citation_check.py --out findings.json --skip-citations # registry only
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


def _browser_required_soft_failure(source, code):
    """Official sites may block stdlib/curl while resolving in a real browser.

    Treat access-denied/no-response as a checker limitation only for sources that
    explicitly opt into browser verification. Definitive not-found responses
    still emit findings.
    """
    if source.get("link_check") != "browser_required":
        return False
    return code in (401, 403) or code is None


def check_registry_sources():
    """Verify each registry source URL still resolves. Returns list of findings."""
    findings = []
    try:
        reg = L.load_registry()
    except Exception as e:
        sys.stderr.write("citation-check: cannot load registry (%s); skipping sources\n" % e)
        return findings
    for s in reg.get("sources", []):
        url = s.get("url")
        if not url:
            continue
        if s.get("type") == "login" or s.get("modality") == "signal_only":
            # copyrighted/paywalled (e.g. DSM login): reachability only, but many
            # such portals block bots — skip to avoid false positives.
            continue
        ok, ct, code, redir, detail = classify(url)
        time.sleep(THROTTLE_S)
        if ok:
            continue
        if _browser_required_soft_failure(s, code):
            continue
        action = ("Authoritative source URL for `%s` is %s. Update the `url` in "
                  "source_registry.yaml (and any citing pages), then re-run. This "
                  "source feeds guideline surveillance — fixing it restores monitoring."
                  % (s.get("id"), detail))
        f = _finding(s.get("id"), s.get("name", s.get("id")), url, ct, code, redir, [], action)
        # Seed severity from the registry (acute paths still auto-escalate in sync).
        # But a NO-RESPONSE result (code is None) is ambiguous — often bot-blocking of
        # a datacenter IP, not a real dead page — so cap it at P1 to avoid a false P0
        # page. A definitive HTTP 4xx/5xx keeps the registry severity.
        sev = s.get("severity_default", "P1")
        if code is None and sev == "P0":
            sev = "P1"
            f["recommended_action"] += (" (No HTTP response — could be bot-blocking; "
                                        "capped to P1. Verify manually before acting.)")
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
                text = open(p, encoding="utf-8", errors="replace").read()
            except Exception:
                continue
            for m in DOI_RE.finditer(text):
                doi = m.group(0).rstrip(".,);]")
                yield "doi", doi, "https://doi.org/" + doi, rel
            for m in PMID_RE.finditer(text):
                pmid = m.group(1)
                yield "pmid", pmid, ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
                                     "esummary.fcgi?db=pubmed&id=%s&retmode=json" % pmid), rel


def check_citations(root):
    """Validate unique DOIs/PMIDs found in curriculum. Returns list of findings."""
    findings, seen = [], {}
    for kind, ident, url, rel in scan_curriculum_citations(root):
        seen.setdefault((kind, ident), []).append(rel)
    for (kind, ident), files in sorted(seen.items()):
        url = ("https://doi.org/" + ident if kind == "doi"
               else "https://pubmed.ncbi.nlm.nih.gov/%s/" % ident)
        check_url = (url if kind == "doi"
                     else "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
                          "?db=pubmed&id=%s&retmode=json" % ident)
        ok, ct, code, redir, detail = classify(check_url)
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
    assert _browser_required_soft_failure({"link_check": "browser_required"}, 403)
    assert _browser_required_soft_failure({"link_check": "browser_required"}, None)
    assert not _browser_required_soft_failure({"link_check": "browser_required"}, 404)
    assert not _browser_required_soft_failure({}, 403)
    assert _skip_citation_path("00_START_HERE/notebooklm_upload_2026-07-01/a.md")
    assert _skip_citation_path("08_Cases_and_Simulation/_source/DOI_REPORT.md")
    assert _skip_citation_path("_prototypes/demo.preview.html")
    assert _skip_citation_path("MS3-Psychiatry-Site_Multidisciplinary-Audit_2026-06-28.md")
    assert not _skip_citation_path("07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md")
    # backtick neutralization happens downstream in issue_body; here just ensure
    # fingerprints are stable across runs
    assert L.fingerprint("a", "broken-link", "u") == L.fingerprint("a", "broken-link", "u")
    print("self-test: DOIs=%d PMIDs=%d, finding schema keys OK, fingerprints stable." %
          (len(dois), len(pmids)))
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="findings.json")
    ap.add_argument("--root", default=L.LIB_ROOT, help="Curriculum root to scan for DOIs/PMIDs.")
    ap.add_argument("--skip-citations", action="store_true", help="Registry source URLs only.")
    ap.add_argument("--skip-sources", action="store_true", help="DOIs/PMIDs only.")
    ap.add_argument("--self-test", action="store_true", help="No network; validate logic.")
    a = ap.parse_args()

    if a.self_test:
        sys.exit(0 if self_test() else 1)

    findings = []
    if not a.skip_sources:
        findings += check_registry_sources()
    if not a.skip_citations:
        findings += check_citations(a.root)

    # de-dup by fingerprint (a DOI cited on many pages already merged in check_citations)
    uniq, seen = [], set()
    for f in findings:
        if f["fingerprint"] in seen:
            continue
        seen.add(f["fingerprint"]); uniq.append(f)

    json.dump(uniq, open(a.out, "w", encoding="utf-8"), indent=2)
    print("citation-check: %d finding(s) -> %s" % (len(uniq), a.out))


if __name__ == "__main__":
    main()
