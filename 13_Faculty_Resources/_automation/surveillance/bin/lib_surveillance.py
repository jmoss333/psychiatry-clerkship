#!/usr/bin/env python3
"""
Shared helpers for the curriculum surveillance pipeline.

Location-relative (works regardless of session mount prefix): all paths are
derived from this file's location, mirroring oe_scanner/oe_scan.py.

Stdlib-only so it runs in CI and locally with no install. (Collectors that read
the YAML registry import pyyaml separately via load_registry().)
"""
import os, re, csv, json, hashlib, datetime

HERE = os.path.dirname(os.path.abspath(__file__))            # .../surveillance/bin
SURV_ROOT = os.path.dirname(HERE)                            # .../surveillance
# up: surveillance -> _automation -> 13_Faculty_Resources -> <library root>
LIB_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(SURV_ROOT)))
CONFIG = os.path.join(SURV_ROOT, "config")
HISTORY = os.path.join(SURV_ROOT, "history")
BASELINES = os.path.join(HISTORY, "baselines")
CITATION_INDEX = os.path.join(CONFIG, "citation_index.json")
REGISTRY = os.path.join(CONFIG, "source_registry.yaml")

SEVERITY_ORDER = ["P2", "P1", "P0"]
# A finding touching these areas is escalated one level (see REVIEW_RULES.md §1).
ACUTE_PREFIXES = ("04_Acute_and_Safety/",)
# A broken link whose SOURCE page is here is P0 (see source_registry link_monitor).
HIGH_TRAFFIC_P0 = ("00_START_HERE/", "04_Acute_and_Safety/", "index.html")

# ---------------------------------------------------------------- time / hashing
def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()

def today():
    return datetime.date.today().isoformat()

def sha_full(text):
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()

def sha16(text):
    return sha_full(text)[:16]

def fingerprint(source_id, change_type, signature):
    """Stable idempotency key. Same (source, change_type, signature) => same fp."""
    return f"{source_id}::{change_type}::{sha16(signature)}"

def normalize_text(text):
    """Collapse whitespace so cosmetic churn (nav, reflow) does not diff."""
    return re.sub(r"\s+", " ", text or "").strip()

# ---------------------------------------------------------------- config loaders
def load_citation_index(path=CITATION_INDEX):
    return json.load(open(path, encoding="utf-8")).get("index", {})

def invert_citations(index):
    """source_id -> [curriculum paths that cite it]."""
    inv = {}
    for path, meta in index.items():
        for sid in meta.get("cites", []):
            inv.setdefault(sid, []).append(path)
    return {k: sorted(v) for k, v in inv.items()}

def load_registry(path=REGISTRY):
    import yaml  # only needed by collectors
    return yaml.safe_load(open(path, encoding="utf-8"))

# ---------------------------------------------------------------- finding logic
def resolve_affects(finding, inverted):
    """Fill affects[] from the citation index if the collector didn't set it."""
    if finding.get("affects"):
        return finding["affects"]
    finding["affects"] = list(inverted.get(finding.get("source_id", ""), []))
    return finding["affects"]

def _bump(sev, steps=1):
    i = min(len(SEVERITY_ORDER) - 1, SEVERITY_ORDER.index(sev) + steps)
    return SEVERITY_ORDER[i]

def escalate(finding):
    """Bump one level if any affected path is an acute/safety area."""
    affects = finding.get("affects") or []
    if any(a.startswith(ACUTE_PREFIXES) for a in affects):
        old = finding["severity"]
        new = _bump(old, 1)
        if new != old:
            finding["severity"] = new
            finding["_escalation"] = f"{old}->{new} (acute-safety path affected)"
    return finding["severity"]

def ensure_fingerprint(f):
    if not f.get("fingerprint"):
        ev = f.get("evidence") or {}
        signature = ev.get("new_hash") or ev.get("redirect_to") or f.get("source_url") or f.get("summary", "")
        f["fingerprint"] = fingerprint(f["source_id"], f["change_type"], signature)
    return f["fingerprint"]

# ---------------------------------------------------------------- GitHub rendering
FP_MARKER = "<!-- surveillance:fp={fp} -->"
FP_RE = re.compile(r"surveillance:fp=([A-Za-z0-9:_\-]+)")

def issue_title(f):
    return f"[{f['severity']}][{f['source_id']}] {f['summary']}"[:250]

def issue_labels(f):
    return sorted({"surveillance", f["severity"], f["job"]})

def issue_body(f):
    ev = f.get("evidence") or {}
    L = [FP_MARKER.format(fp=f["fingerprint"]), ""]
    L.append(f"**Job:** `{f['job']}`  •  **Severity:** {f['severity']}  •  **Change:** `{f['change_type']}`")
    if f.get("source_url"):
        L.append(f"**Source:** {f.get('source_name','')} — {f['source_url']}")
    L.append(f"**Detected:** {f['detected_at']}")
    if f.get("_escalation"):
        L.append(f"**Escalated:** {f['_escalation']}")
    L += ["", f"### What changed", f["summary"]]
    if ev.get("diff_excerpt"):
        ex = ev["diff_excerpt"]
        if len(ex) > 1500:
            ex = ex[:1500] + "\n…(truncated)"
        L.append(f"\n<details><summary>Diff excerpt</summary>\n\n```diff\n{ex}\n```\n</details>")
    if ev.get("http_status"):
        line = f"\n**HTTP status:** {ev['http_status']}"
        if ev.get("redirect_to"):
            line += f" → {ev['redirect_to']}"
        L.append(line)
    if ev.get("snapshot_url"):
        L.append(f"\n**Snapshot:** {ev['snapshot_url']}")
    if f.get("affects"):
        L.append("\n### Affected curriculum pages")
        L += [f"- `{a}`" for a in f["affects"]]
    if f.get("recommended_action"):
        L.append(f"\n### Recommended action\n{f['recommended_action']}")
    L.append("\n---")
    L.append("_Automated by curriculum surveillance. Resolve by updating the page (if "
             "needed) and re-stamping `13_Faculty_Resources/reviewed.json`, then close. "
             "See `REVIEW_RULES.md`._")
    return "\n".join(L)

# ---------------------------------------------------------------- outputs
_STEM = {
    "guideline-surveillance": "guideline_delta",
    "link-source-monitor": "link_audit",
    "resource-intake": "resource_intake",
}

def write_report(job, findings, when=None, base=None):
    base = base or HISTORY
    when = when or today()
    os.makedirs(base, exist_ok=True)
    stem = _STEM.get(job, job)
    jpath = os.path.join(base, f"{stem}_{when}.json")
    json.dump(findings, open(jpath, "w", encoding="utf-8"), indent=2)
    out = [jpath]
    if job in ("link-source-monitor", "resource-intake"):
        cpath = os.path.join(base, f"{stem}_{when}.csv")
        cols = ["detected_at", "severity", "source_id", "change_type",
                "summary", "source_url", "affects", "status"]
        with open(cpath, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(cols)
            for f in findings:
                row = []
                for c in cols:
                    row.append("; ".join(f.get("affects", [])) if c == "affects" else f.get(c, ""))
                w.writerow(row)
        out.append(cpath)
    return out

def append_digest(findings, when=None, base=None):
    base = base or HISTORY
    when = when or today()
    if not findings:
        return None
    os.makedirs(base, exist_ok=True)
    path = os.path.join(base, f"digest_{when[:7]}.md")   # one digest per month
    fresh = not os.path.exists(path)
    with open(path, "a", encoding="utf-8") as fh:
        if fresh:
            fh.write(f"# Surveillance digest — {when[:7]}\n\n"
                     "Low-severity (P2) items, batched. No individual issues opened.\n")
        fh.write(f"\n## {when}\n")
        for f in findings:
            line = f"- **[{f['source_id']}]** {f['summary']}"
            if f.get("source_url"):
                line += f" — {f['source_url']}"
            fh.write(line + "\n")
    return path

def update_last_run(source_ids, when=None, base=None):
    base = base or HISTORY
    when = when or utcnow()
    os.makedirs(base, exist_ok=True)
    path = os.path.join(base, "last_run.json")
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception:
        data = {}
    for sid in source_ids:
        data[sid] = when
    json.dump(data, open(path, "w", encoding="utf-8"), indent=2, sort_keys=True)
    return path
