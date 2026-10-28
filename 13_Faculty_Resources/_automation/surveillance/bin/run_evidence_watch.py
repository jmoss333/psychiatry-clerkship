#!/usr/bin/env python3
"""
run_evidence_watch.py — the living evidence watcher (surveillance job `evidence-watch`).

Weekly, for every medication in pharmacy.json and every curated topic in
config/evidence_watch.yaml, ask two keyless public APIs what is NEW:

  * PubMed E-utilities — esearch (Entrez-date window `reldate`) filtered to
    guideline / meta-analysis / systematic-review publication types, then
    esummary for title, journal, date, publication types and DOI. A PMID not in
    the item's baseline of seen PMIDs is a finding (`change_type: new`).
  * openFDA drug/label — the exact label pharmacy.json pins (`dailymedSetId`).
    Each watched section is whitespace-normalised and hashed; a hash that differs
    from the stored baseline is a finding (`change_type: modified`). The first
    examination of a label establishes its baseline and reports nothing.
  * openFDA drug/enforcement — recalls reported inside the window whose product
    description names the medication (`change_type: new`).

Severity is CONFIG, not code (D-F10-1/D-F10-2 are owner decisions; the defaults
are the plan's recommendations): see config/evidence_watch.yaml.

What this job never does: edit a page, pharmacy.json, or any ledger; call a model;
use a key or secret; open an issue itself (sync_findings.py does, idempotently).
An API it cannot reach becomes an `environment` finding — counted and digested,
never silent — and the run writes an examination receipt (--receipt-out) that
states what it examined beside what it found (SILENT_SHRINK_CHECKLIST §D).

Stdlib + pyyaml (config), matching the sibling collectors. All network access goes
through one injectable `fetch` so the whole job runs offline in tests.

Usage (CI):
  python3 run_evidence_watch.py --out findings.json \
      --checked-out checked-sources.json --receipt-out examination.json
"""
import argparse
import datetime
import difflib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import lib_surveillance as L

JOB = "evidence-watch"
DEFAULT_CONFIG = os.path.join(L.CONFIG, "evidence_watch.yaml")
# Under history/ so report_branch.py hydrates and publishes it with the other
# baselines (its write allow-list is history/**, STATUS.md, status.html).
DEFAULT_BASELINE_DIR = os.path.join(L.BASELINES, "evidence-watch")
PHARMACY = os.path.join(L.LIB_ROOT, "pharmacy.json")
SITE_BUILD = os.path.join(L.LIB_ROOT, "13_Faculty_Resources", "_automation", "site_build")

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
OPENFDA = "https://api.fda.gov/drug/"
USER_AGENT = ("psychiatry-clerkship-evidence-watch/1.0 "
              "(+https://github.com/jmoss333/psychiatry-clerkship)")
HTTP_TIMEOUT_S = 30
SEVERITIES = ("P0", "P1", "P2")
ITEM_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
SEEN_CAP = 5000

CHANNEL_PUBMED = "evidence-watch:pubmed"
CHANNEL_LABEL = "evidence-watch:openfda-label"
CHANNEL_RECALL = "evidence-watch:openfda-enforcement"


class Unavailable(Exception):
    """The API could not be read: network, timeout, HTTP error, or a malformed body."""


class NoMatches(Exception):
    """openFDA answered 404 NOT_FOUND — a real, successful 'zero results'."""


# ---------------------------------------------------------------- network
class HttpFetcher:
    """GET JSON with a per-host minimum interval. The only network code in the job."""

    def __init__(self, intervals=None, sleep=time.sleep, clock=time.monotonic):
        self.intervals = dict(intervals or {})
        self.sleep = sleep
        self.clock = clock
        self._last = {}

    def _throttle(self, host):
        gap = self.intervals.get(host, 0)
        last = self._last.get(host)
        if last is not None and gap:
            wait = gap - (self.clock() - last)
            if wait > 0:
                self.sleep(wait)
        self._last[host] = self.clock()

    def __call__(self, url):
        host = urllib.parse.urlsplit(url).hostname or ""
        self._throttle(host)
        req = urllib.request.Request(url, method="GET")
        req.add_header("User-Agent", USER_AGENT)
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
                body = resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            if exc.code == 404 and host == "api.fda.gov":
                try:
                    detail = json.loads(exc.read().decode("utf-8", "replace") or "{}")
                except ValueError:
                    detail = {}
                if (detail.get("error") or {}).get("code") == "NOT_FOUND":
                    raise NoMatches(url) from None
            raise Unavailable(f"HTTP {exc.code} from {host}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise Unavailable(f"{type(exc).__name__} reaching {host}") from None
        try:
            return json.loads(body)
        except ValueError:
            raise Unavailable(f"non-JSON body from {host}") from None


# ---------------------------------------------------------------- config + items
def load_config(path=DEFAULT_CONFIG):
    import yaml  # collectors use pyyaml; lib_surveillance stays stdlib-only
    with open(path, encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh)
    validate_config(cfg)
    return cfg


def _sev(value, where, allow_none=False):
    if value is None and allow_none:
        return
    if value not in SEVERITIES:
        raise ValueError(f"evidence_watch.yaml: {where} must be one of {SEVERITIES}")


def validate_config(cfg):
    if not isinstance(cfg, dict) or cfg.get("version") != 1:
        raise ValueError("evidence_watch.yaml: version must be 1")
    pm = cfg.get("pubmed") or {}
    if not isinstance(pm.get("reldate"), int) or not 1 <= pm["reldate"] <= 60:
        raise ValueError("evidence_watch.yaml: pubmed.reldate must be an integer 1..60")
    if not isinstance(pm.get("retmax"), int) or not 1 <= pm["retmax"] <= 500:
        raise ValueError("evidence_watch.yaml: pubmed.retmax must be an integer 1..500")
    if not pm.get("publication_types"):
        raise ValueError("evidence_watch.yaml: pubmed.publication_types must be non-empty")
    for key in ("p1_guideline_bodies", "p1_guideline_journals", "p1_review_journals"):
        if not isinstance(pm.get(key), list):
            raise ValueError(f"evidence_watch.yaml: pubmed.{key} must be a list")
    for pattern in pm["p1_guideline_bodies"]:
        re.compile(pattern)
    fda = cfg.get("openfda") or {}
    sections = fda.get("label_sections")
    if not isinstance(sections, dict) or not sections:
        raise ValueError("evidence_watch.yaml: openfda.label_sections must be a mapping")
    for name, sev in sections.items():
        _sev(sev, f"openfda.label_sections.{name}")
    _sev(fda.get("rems_language"), "openfda.rems_language")
    _sev(fda.get("revision_only"), "openfda.revision_only", allow_none=True)
    _sev(fda.get("set_id_not_found"), "openfda.set_id_not_found")
    re.compile(fda.get("rems_pattern") or "")
    enf = fda.get("enforcement") or {}
    if enf.get("enabled"):
        _sev(enf.get("class_i"), "openfda.enforcement.class_i")
        _sev(enf.get("other"), "openfda.enforcement.other")
        if not isinstance(enf.get("days"), int) or not 1 <= enf["days"] <= 60:
            raise ValueError("evidence_watch.yaml: openfda.enforcement.days must be 1..60")
    seen = set()
    for topic in cfg.get("topics") or []:
        tid = topic.get("id")
        if not isinstance(tid, str) or not ITEM_ID_RE.match(tid) or tid in seen:
            raise ValueError(f"evidence_watch.yaml: bad or duplicate topic id {tid!r}")
        if not tid.startswith("topic-"):
            raise ValueError(f"evidence_watch.yaml: topic id {tid!r} must start with 'topic-'")
        seen.add(tid)
        if not topic.get("query") or not topic.get("terms"):
            raise ValueError(f"evidence_watch.yaml: topic {tid} needs query and terms")
    return cfg


def default_terms(generic):
    """The generic name before any parenthesis: 'divalproex sodium (valproate)' ->
    ['divalproex sodium']. Anything subtler is an explicit override in the config."""
    base = re.split(r"\s*\(", str(generic or ""), maxsplit=1)[0].strip()
    return [base] if base else []


def _pubmed_term_query(terms):
    parts = []
    for term in terms:
        term = term.replace('"', "")
        parts.append(f'"{term}"[tiab]' if " " in term else f"{term}[tiab]")
    return "(" + " OR ".join(parts) + ")"


def derive_items(cfg, pharmacy_records):
    """Watch items in a stable order: pharmacy records (by id), then curated topics."""
    items = []
    ph = cfg.get("pharmacy") or {}
    overrides = ph.get("overrides") or {}
    if ph.get("enabled", True):
        for rec in sorted(pharmacy_records, key=lambda r: r.get("id", "")):
            rid = rec.get("id")
            if not isinstance(rid, str) or not ITEM_ID_RE.match(rid) or rid.startswith("topic-"):
                raise ValueError(f"pharmacy.json: record id {rid!r} is not a usable watch id")
            override = overrides.get(rid) or {}
            if override.get("skip"):
                continue
            terms = list(override.get("terms") or default_terms(rec.get("generic")))
            if not terms:
                raise ValueError(f"pharmacy.json: record {rid} has no generic name to watch")
            items.append({
                "id": rid,
                "kind": "drug",
                "label": rec.get("generic") or rid,
                "terms": terms,
                "query": _pubmed_term_query(terms),
                "publication_types": None,
                "set_id": rec.get("dailymedSetId") or None,
                "label_version_date": rec.get("labelVersionDate") or None,
                "affects": ["pharmacy.json"],
            })
    for topic in cfg.get("topics") or []:
        items.append({
            "id": topic["id"],
            "kind": "topic",
            "label": topic.get("label") or topic["id"],
            "terms": list(topic["terms"]),
            "query": topic["query"],
            "publication_types": topic.get("publication_types"),
            "set_id": None,
            "label_version_date": None,
            "affects": list(topic.get("affects") or []),
        })
    ids = [item["id"] for item in items]
    if len(ids) != len(set(ids)):
        raise ValueError("evidence watch: duplicate watch item ids")
    return items


def load_pharmacy(path=PHARMACY):
    with open(path, encoding="utf-8") as fh:
        records = json.load(fh).get("records")
    if not isinstance(records, list) or not records:
        raise ValueError("pharmacy.json: records must be a non-empty list")
    return records


# ---------------------------------------------------------------- affected pages
def load_page_texts(root=L.LIB_ROOT):
    """Lower-cased text of every shipped Markdown/HTML source, keyed by repo path.

    The universe is site_build/shipped_pages.json (ADR-002: the one reader every new
    consumer uses). Read-only: mapping never writes a page.
    """
    if SITE_BUILD not in sys.path:
        sys.path.insert(0, SITE_BUILD)
    from shipped_pages import load_shipped_pages  # noqa: E402

    document = load_shipped_pages(root)
    sources = sorted({
        page["source"] for page in document["pages"]
        if isinstance(page.get("source"), str) and page["source"].endswith((".md", ".html"))
    })
    texts = {}
    for source in sources:
        path = os.path.join(root, source)
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                texts[source] = fh.read().lower()
        except OSError:
            continue
    if not texts:
        raise ValueError("evidence watch: no shipped page text could be read")
    return texts


def map_affects(item, page_texts, cap):
    """(affected repo paths, total matched). Explicit paths first, then text matches."""
    patterns = [re.compile(r"(?<![a-z0-9])" + re.escape(t.lower()) + r"(?![a-z0-9])")
                for t in item["terms"]]
    hits = sorted(path for path, text in page_texts.items()
                  if any(p.search(text) for p in patterns))
    ordered = list(dict.fromkeys(list(item.get("affects") or []) + hits))
    return ordered[:cap], len(ordered)


# ---------------------------------------------------------------- baselines
def _read_json(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return default


def _write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(value, fh, indent=2, sort_keys=True)
        fh.write("\n")


def _capped_ids(ids):
    """Newest SEEN_CAP identifiers (numeric PMIDs sort numerically)."""
    def key(value):
        return (0, int(value)) if str(value).isdigit() else (1, str(value))
    return sorted(set(ids), key=key)[-SEEN_CAP:]


# ---------------------------------------------------------------- PubMed
def _pubmed_url(endpoint, params, cfg):
    query = dict(params)
    query["db"] = "pubmed"
    query["retmode"] = "json"
    if cfg["pubmed"].get("tool"):
        query["tool"] = cfg["pubmed"]["tool"]
    return EUTILS + endpoint + "?" + urllib.parse.urlencode(query)


def pubmed_query(item, cfg):
    types = item.get("publication_types")
    if types == "any":
        return item["query"]
    types = types or cfg["pubmed"]["publication_types"]
    pt = " OR ".join(f"{t}[pt]" for t in types)
    return f"({item['query']}) AND ({pt})"


def classify_paper(summary, cfg):
    """P1 per the D-F10-2 allowlist, else P2. Returns (severity, reason)."""
    pm = cfg["pubmed"]
    types = {str(t).strip().lower() for t in summary.get("pubtype") or []}
    journals = {str(summary.get("source") or "").strip().lower(),
                str(summary.get("fulljournalname") or "").strip().lower()} - {""}
    title = str(summary.get("title") or "")
    if types & {"guideline", "practice guideline"}:
        if journals & {j.lower() for j in pm["p1_guideline_journals"]}:
            return "P1", "guideline in an allowlisted journal"
        for pattern in pm["p1_guideline_bodies"]:
            if re.search(pattern, title):
                return "P1", "guideline from an allowlisted body"
    if types & {"meta-analysis", "systematic review"}:
        if journals & {j.lower() for j in pm["p1_review_journals"]}:
            return "P1", "review in an allowlisted journal"
    return "P2", "outside the P1 allowlist"


def _doi(summary):
    for aid in summary.get("articleids") or []:
        if isinstance(aid, dict) and aid.get("idtype") == "doi" and aid.get("value"):
            return str(aid["value"])
    return ""


def _pubmed_finding(pmid, summary, items_for_pmid, item_index, affects_by_item, now, cfg):
    first = item_index[items_for_pmid[0]]
    severity, reason = classify_paper(summary, cfg)
    title = L.sanitize_crawled_text(summary.get("title") or f"PMID {pmid}", 160)
    journal = L.sanitize_crawled_text(summary.get("source") or "", 60)
    pubdate = L.sanitize_crawled_text(summary.get("pubdate") or "", 20)
    types = ", ".join(L.sanitize_crawled_text(t, 40) for t in (summary.get("pubtype") or [])[:4])
    affects, total = [], 0
    for iid in items_for_pmid:
        paths, count = affects_by_item[iid]
        affects.extend(paths)
        total += count
    affects = list(dict.fromkeys(affects))[: cfg.get("affects_cap", 30)]
    labels = ", ".join(item_index[i]["label"] for i in items_for_pmid)
    doi = _doi(summary)
    fp = L.fingerprint("pubmed", "new", pmid)
    action = (f"Read PMID {pmid}" + (f" (doi:{L.sanitize_crawled_text(doi, 120)})" if doi else "")
              + f" — matched watch item(s): {labels}; severity {severity} ({reason}). "
              "Decide whether any affected page or the pharmacy record needs an update; if so, "
              "edit it in a normal content PR (the page drifts to pending and is re-attested). "
              "The watcher changes nothing.")
    if total > len(affects):
        action += f" {total - len(affects)} further matching page(s) not listed."
    finding = {
        "finding_id": fp,
        "fingerprint": fp,
        "job": JOB,
        "source_id": f"pubmed:{first['id']}",
        "source_name": f"PubMed — {first['label']}",
        "source_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "source_type": "api",
        "modality": "signal_only",
        "detected_at": now,
        "change_type": "new",
        "severity": severity,
        "summary": f"New {types or 'publication'}: {title} ({journal}{', ' + pubdate if pubdate else ''})",
        "affects": affects,
        "recommended_action": action,
        "status": "new",
        "disposition": "actionable",
    }
    if cfg["pubmed"].get("cap_at_assigned_severity", True):
        finding["severity_cap"] = severity
    return finding


def collect_pubmed(items, cfg, fetch, baseline_dir, affects_by_item, now):
    receipt = {"examined": 0, "failed": 0, "items": {}}
    failures = []
    new_by_pmid = {}
    seen_by_item = {}
    for item in items:
        bpath = os.path.join(baseline_dir, "pubmed", f"{item['id']}.json")
        seen = set(_read_json(bpath, {}).get("seen") or [])
        url = _pubmed_url("esearch.fcgi", {
            "term": pubmed_query(item, cfg),
            "reldate": cfg["pubmed"]["reldate"],
            "datetype": "edat",
            "retmax": cfg["pubmed"]["retmax"],
        }, cfg)
        try:
            body = fetch(url)
            result = body["esearchresult"]
            ids = [str(x) for x in result.get("idlist") or []]
            count = int(result.get("count", len(ids)))
        except (Unavailable, NoMatches, KeyError, TypeError, ValueError) as exc:
            receipt["failed"] += 1
            receipt["items"][item["id"]] = {"status": "failed", "error": str(exc)[:120]}
            failures.append(item["id"])
            continue
        receipt["examined"] += 1
        fresh = [pmid for pmid in ids if pmid not in seen]
        receipt["items"][item["id"]] = {
            "status": "ok", "count": count, "returned": len(ids), "new": len(fresh),
            "truncated": count > len(ids),
        }
        seen_by_item[item["id"]] = (bpath, seen, ids)
        for pmid in fresh:
            new_by_pmid.setdefault(pmid, []).append(item["id"])

    summaries = {}
    pmids = sorted(new_by_pmid, key=int)
    for start in range(0, len(pmids), 100):
        batch = pmids[start:start + 100]
        try:
            body = fetch(_pubmed_url("esummary.fcgi", {"id": ",".join(batch)}, cfg))
            result = body["result"]
        except (Unavailable, NoMatches, KeyError, TypeError) as exc:
            receipt["failed"] += 1
            failures.append(f"esummary:{start // 100}")
            receipt.setdefault("summary_failures", []).append(str(exc)[:120])
            continue
        for pmid in batch:
            if isinstance(result.get(pmid), dict) and not result[pmid].get("error"):
                summaries[pmid] = result[pmid]

    item_index = {item["id"]: item for item in items}
    findings = []
    for pmid in pmids:
        if pmid not in summaries:
            continue  # not marked seen below, so next week retries it
        findings.append(_pubmed_finding(pmid, summaries[pmid], new_by_pmid[pmid],
                                        item_index, affects_by_item, now, cfg))

    for iid, (bpath, seen, ids) in seen_by_item.items():
        settled = [pmid for pmid in ids if pmid in seen or pmid in summaries]
        _write_json(bpath, {"item": iid, "checked_at": now,
                            "seen": _capped_ids(seen | set(settled))})
    receipt["new_papers"] = len(findings)
    return findings, receipt, failures


# ---------------------------------------------------------------- openFDA label
def _openfda_url(endpoint, search, limit):
    return (OPENFDA + endpoint + "?search="
            + urllib.parse.quote(search, safe=':"[]')
            + f"&limit={limit}")


def label_record(label, cfg, now):
    """Baseline record for one openFDA label document (pure)."""
    fda = cfg["openfda"]
    rems = re.compile(fda.get("rems_pattern") or r"\bREMS\b")
    store = set(fda.get("store_text") or [])
    sections = {}
    for name in fda["label_sections"]:
        raw = label.get(name)
        text = L.normalize_text(" ".join(raw) if isinstance(raw, list) else (raw or ""))
        record = {"present": bool(text), "hash": L.sha_full(text), "rems": bool(rems.search(text))}
        if name in store:
            record["text"] = text
        sections[name] = record
    return {
        "set_id": label.get("set_id"),
        "version": str(label.get("version") or ""),
        "effective_time": str(label.get("effective_time") or ""),
        "sections": sections,
        "checked_at": now,
    }


def _excerpt(old, new, max_lines=30):
    a = [s.strip() for s in re.split(r"(?<=[.;])\s+", old or "") if s.strip()]
    b = [s.strip() for s in re.split(r"(?<=[.;])\s+", new or "") if s.strip()]
    lines = [ln for ln in difflib.unified_diff(a, b, lineterm="", n=0)
             if ln and ln[0] in "+-" and not ln.startswith(("+++", "---"))]
    return "\n".join(lines[:max_lines])


def _max_sev(*values):
    present = [v for v in values if v in SEVERITIES]
    return min(present, key=SEVERITIES.index) if present else None


def evaluate_label(item, prev, new, cfg):
    """Pure diff of two label records. Returns (severity, summary, evidence) or None."""
    fda = cfg["openfda"]
    changed, rems_changed, rems_involved = [], [], False
    for name, sev in fda["label_sections"].items():
        old_s = (prev.get("sections") or {}).get(name)
        new_s = new["sections"][name]
        if old_s is None:
            continue  # section newly watched: establish silently, never a false alarm
        if old_s.get("hash") != new_s["hash"]:
            changed.append(name)
            if old_s.get("rems") or new_s["rems"]:
                rems_involved = True
        if bool(old_s.get("rems")) != new_s["rems"]:
            rems_changed.append((name, new_s["rems"]))
    revised = (prev.get("version"), prev.get("effective_time")) != (
        new["version"], new["effective_time"])
    if not changed and not rems_changed:
        if revised and fda.get("revision_only"):
            return (fda["revision_only"],
                    f"{item['label']} label revised (effective {prev.get('effective_time') or '?'}"
                    f" -> {new['effective_time'] or '?'}); no watched section changed",
                    {"prev_hash": prev.get("version", ""), "new_hash": new["version"]})
        return None
    severity = _max_sev(*(fda["label_sections"][n] for n in changed),
                        fda["rems_language"] if (rems_involved or rems_changed) else None)
    parts = [f"{item['label']} label: {', '.join(n.replace('_', ' ') for n in changed) or 'REMS language'} changed"]
    for name, now_mentions in rems_changed:
        parts.append(f"REMS language {'added to' if now_mentions else 'removed from'} "
                     f"{name.replace('_', ' ')}")
    summary = "; ".join(parts) + (f" (effective {prev.get('effective_time') or '?'} -> "
                                  f"{new['effective_time'] or '?'})")
    combined_old = L.sha16("|".join((prev.get("sections") or {}).get(n, {}).get("hash", "")
                                    for n in sorted(fda["label_sections"])))
    combined_new = L.sha16("|".join(new["sections"][n]["hash"] for n in sorted(fda["label_sections"])))
    excerpts = []
    for name in changed:
        old_text = ((prev.get("sections") or {}).get(name) or {}).get("text")
        new_text = new["sections"][name].get("text")
        if old_text is not None and new_text is not None:
            ex = _excerpt(old_text, new_text)
            if ex:
                excerpts.append(f"## {name}\n{ex}")
    evidence = {"prev_hash": combined_old, "new_hash": combined_new}
    if prev.get("checked_at"):
        evidence["prev_seen_at"] = prev["checked_at"]
    if excerpts:
        evidence["diff_excerpt"] = "\n".join(excerpts)
    return severity, summary, evidence


def _label_finding(item, severity, summary, evidence, change_type, signature, affects, total, now):
    source_id = f"openfda:{item['id']}"
    fp = L.fingerprint(source_id, change_type, signature)
    action = (f"Compare the current label (DailyMed set {item['set_id']}) with pharmacy.json "
              f"record '{item['id']}' (labelVersionDate {item.get('label_version_date') or 'unset'}) "
              "and the affected pages. If teaching must change, edit it in a normal content PR "
              "(the page drifts to pending and is re-attested). The watcher changes nothing.")
    if total > len(affects):
        action += f" {total - len(affects)} further matching page(s) not listed."
    return {
        "finding_id": fp,
        "fingerprint": fp,
        "job": JOB,
        "source_id": source_id,
        "source_name": f"openFDA drug label — {item['label']}",
        "source_url": ("https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid="
                       + urllib.parse.quote(str(item["set_id"]), safe="-")),
        "source_type": "api",
        "modality": "full_text",
        "detected_at": now,
        "change_type": change_type,
        "severity": severity,
        "summary": summary,
        "evidence": evidence,
        "affects": affects,
        "recommended_action": action,
        "status": "new",
        "disposition": "actionable" if change_type == "modified" else "needs-judgment",
    }


def collect_labels(items, cfg, fetch, baseline_dir, affects_by_item, now):
    receipt = {"examined": 0, "failed": 0, "items": {}}
    failures, findings = [], []
    for item in items:
        if item["kind"] != "drug" or not item.get("set_id"):
            continue
        bpath = os.path.join(baseline_dir, "openfda-label", f"{item['id']}.json")
        prev = _read_json(bpath, None)
        url = _openfda_url("label.json", f'set_id:"{item["set_id"]}"', 1)
        affects, total = affects_by_item[item["id"]]
        try:
            body = fetch(url)
            label = body["results"][0]
        except NoMatches:
            receipt["examined"] += 1
            receipt["items"][item["id"]] = {"status": "set-id-not-found"}
            findings.append(_label_finding(
                item, cfg["openfda"]["set_id_not_found"],
                f"{item['label']}: openFDA no longer returns the pinned label set {item['set_id']}",
                {}, "identifier-unresolved", f"{item['set_id']}:not-found", affects, total, now))
            continue
        except (Unavailable, KeyError, IndexError, TypeError) as exc:
            receipt["failed"] += 1
            receipt["items"][item["id"]] = {"status": "failed", "error": str(exc)[:120]}
            failures.append(item["id"])
            continue
        receipt["examined"] += 1
        record = label_record(label, cfg, now)
        status = "baseline-established"
        if prev is not None:
            verdict = evaluate_label(item, prev, record, cfg)
            status = "unchanged"
            if verdict is not None:
                severity, summary, evidence = verdict
                status = f"changed:{severity}"
                signature = f"{record['effective_time']}|{evidence.get('new_hash')}"
                findings.append(_label_finding(item, severity, summary, evidence, "modified",
                                               signature, affects, total, now))
        receipt["items"][item["id"]] = {"status": status,
                                        "effective_time": record["effective_time"]}
        _write_json(bpath, record)
    return findings, receipt, failures


# ---------------------------------------------------------------- openFDA enforcement
def collect_recalls(items, cfg, fetch, baseline_dir, affects_by_item, now, today):
    enf = cfg["openfda"].get("enforcement") or {}
    receipt = {"examined": 0, "failed": 0, "items": {}}
    if not enf.get("enabled"):
        return [], receipt, []
    bpath = os.path.join(baseline_dir, "openfda-enforcement.json")
    seen = set(_read_json(bpath, {}).get("seen") or [])
    start = (today - datetime.timedelta(days=enf["days"])).strftime("%Y%m%d")
    end = today.strftime("%Y%m%d")
    findings, failures, settled = [], [], set()
    reported = {}
    for item in items:
        if item["kind"] != "drug":
            continue
        clauses = " OR ".join(f'product_description:"{t}"' for t in item["terms"])
        search = f"({clauses}) AND report_date:[{start} TO {end}]"
        try:
            records = fetch(_openfda_url("enforcement.json", search, 100))["results"]
        except NoMatches:
            records = []
        except (Unavailable, KeyError, TypeError) as exc:
            receipt["failed"] += 1
            receipt["items"][item["id"]] = {"status": "failed", "error": str(exc)[:120]}
            failures.append(item["id"])
            continue
        receipt["examined"] += 1
        fresh = 0
        for rec in records or []:
            number = str(rec.get("recall_number") or "").strip()
            if not number or number in seen or number in reported:
                continue
            fresh += 1
            reported[number] = (item, rec)
        receipt["items"][item["id"]] = {"status": "ok", "returned": len(records or []), "new": fresh}

    for number, (item, rec) in sorted(reported.items()):
        classification = str(rec.get("classification") or "")
        severity = enf["class_i"] if classification.strip().lower() == "class i" else enf["other"]
        product = L.sanitize_crawled_text(rec.get("product_description"), 90)
        reason = L.sanitize_crawled_text(rec.get("reason_for_recall"), 90)
        affects, total = affects_by_item[item["id"]]
        source_id = f"openfda:{item['id']}"
        fp = L.fingerprint(source_id, "new", f"recall:{number}")
        findings.append({
            "finding_id": fp,
            "fingerprint": fp,
            "job": JOB,
            "source_id": source_id,
            "source_name": f"openFDA enforcement report — {item['label']}",
            "source_url": ("https://api.fda.gov/drug/enforcement.json?search="
                           + urllib.parse.quote(f'recall_number:"{number}"', safe=':')),
            "source_type": "api",
            "modality": "full_text",
            "detected_at": now,
            "change_type": "new",
            "severity": severity,
            "summary": f"{L.sanitize_crawled_text(classification, 20) or 'Unclassified'} recall "
                       f"{L.sanitize_crawled_text(number, 30)}: {product} — {reason}",
            "affects": affects,
            "recommended_action": ("Check whether the recall changes what learners are taught "
                                   f"about {item['label']} (supply, formulation, safety). Most "
                                   "recalls need no teaching change; close with a note if so. "
                                   "The watcher changes nothing."
                                   + (f" {total - len(affects)} further matching page(s) not listed."
                                      if total > len(affects) else "")),
            "status": "new",
            "disposition": "actionable",
        })
        settled.add(number)
    if receipt["examined"]:
        _write_json(bpath, {"checked_at": now, "seen": _capped_ids(seen | settled)})
    return findings, receipt, failures


# ---------------------------------------------------------------- environment
def environment_finding(channel, name, failures, examined, now, today_iso):
    """One `environment` finding per channel with failures: counted, digested, never silent."""
    fp = L.fingerprint(channel, "check-unavailable", today_iso)
    return {
        "finding_id": fp,
        "fingerprint": fp,
        "job": JOB,
        "source_id": channel,
        "source_name": name,
        "source_type": "api",
        "detected_at": now,
        "change_type": "check-unavailable",
        "severity": "P2",
        "severity_cap": "P2",
        "summary": (f"{name} could not be read for {len(failures)} request(s) "
                    f"({examined} examined): {', '.join(failures[:8])}"
                    + (" …" if len(failures) > 8 else "")),
        "affects": [],
        "recommended_action": ("Reachability is a fact about the runner, not a content finding. "
                               "Re-run the workflow; if it persists, check the API status from a "
                               "real network before assuming anything changed."),
        "status": "new",
        "disposition": "environment",
    }


# ---------------------------------------------------------------- orchestration
def run(cfg, items, fetch, page_texts, baseline_dir=DEFAULT_BASELINE_DIR, now=None, today=None):
    """Run every enabled channel. Returns (findings, checked_channels, receipt)."""
    now = now or L.utcnow()
    today = today or datetime.datetime.now(datetime.timezone.utc).date()
    cap = int(cfg.get("affects_cap", 30))
    affects_by_item = {item["id"]: map_affects(item, page_texts, cap) for item in items}
    findings, checked = [], []
    receipt = {"job": JOB, "generatedAt": now, "items": len(items), "channels": {}}
    channels = []
    if cfg["pubmed"].get("enabled", True):
        channels.append((CHANNEL_PUBMED, "PubMed E-utilities",
                         lambda: collect_pubmed(items, cfg, fetch, baseline_dir, affects_by_item, now)))
    if cfg["openfda"].get("enabled", True):
        channels.append((CHANNEL_LABEL, "openFDA drug label API",
                         lambda: collect_labels(items, cfg, fetch, baseline_dir, affects_by_item, now)))
        channels.append((CHANNEL_RECALL, "openFDA drug enforcement API",
                         lambda: collect_recalls(items, cfg, fetch, baseline_dir,
                                                 affects_by_item, now, today)))
    for channel, name, collect in channels:
        channel_findings, channel_receipt, failures = collect()
        findings.extend(channel_findings)
        receipt["channels"][channel] = channel_receipt
        if failures:
            findings.append(environment_finding(channel, name, failures,
                                                channel_receipt["examined"], now, today.isoformat()))
        elif channel_receipt["examined"]:
            checked.append(channel)
    counts = {sev: 0 for sev in SEVERITIES}
    by_disposition = {}
    for f in findings:
        counts[f["severity"]] += 1
        by_disposition[f["disposition"]] = by_disposition.get(f["disposition"], 0) + 1
    receipt["findings"] = {"total": len(findings), "bySeverity": counts,
                           "byDisposition": by_disposition}
    return findings, L.validate_checked_sources(checked), receipt


def build_parser():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default="findings.json", help="findings JSON array")
    ap.add_argument("--checked-out", default="checked-sources.json",
                    help="channels examined with zero failures (freshness stamps)")
    ap.add_argument("--receipt-out", default="evidence-watch-examination.json",
                    help="what was examined, per item and channel, beside the verdict")
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    # Production value as the default (gates.md: a test-only flag with no default is an
    # untested production path). The workflow passes no --baseline-dir.
    ap.add_argument("--baseline-dir", default=DEFAULT_BASELINE_DIR)
    return ap


def main(argv=None):
    args = build_parser().parse_args(argv)
    cfg = load_config(args.config)
    items = derive_items(cfg, load_pharmacy())
    fetch = HttpFetcher({
        "eutils.ncbi.nlm.nih.gov": float(cfg["pubmed"].get("min_interval_s", 0.4)),
        "api.fda.gov": float(cfg["openfda"].get("min_interval_s", 0.3)),
    })
    findings, checked, receipt = run(cfg, items, fetch, load_page_texts(),
                                     baseline_dir=args.baseline_dir)
    for path, value in ((args.out, findings), (args.checked_out, checked),
                        (args.receipt_out, receipt)):
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(value, fh, indent=2)
    for channel, data in receipt["channels"].items():
        print(f"  {channel}: examined {data['examined']}, failed {data['failed']}")
    sev = receipt["findings"]["bySeverity"]
    print(f"evidence-watch: {len(items)} watch item(s); {len(findings)} finding(s) "
          f"(P0 {sev['P0']}, P1 {sev['P1']}, P2 {sev['P2']}; "
          f"{receipt['findings']['byDisposition']}); checked {checked or 'nothing cleanly'} "
          f"-> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
