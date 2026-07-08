#!/usr/bin/env python3
"""
build_status.py — regenerate the faculty status surface from surveillance artifacts.

Reads the latest dated report per job in history/, plus last_run.json,
config/citation_index.json, and 13_Faculty_Resources/reviewed.json. Writes:
  - STATUS.md   (GitHub renders this — the primary faculty view)
  - status.html (standalone dashboard; open via file:// or copy into a faculty area)

Surfaces:
  - Open P0 / P1 findings (with issue links + affected pages)
  - "Review overdue" pages: a page is overdue when a finding that affects it is
    newer than its reviewed.json attestation (or it has none). (REVIEW_RULES.md §4)
  - Per-source freshness vs. registry cadence (stale = not checked within cadence)

Runs cleanly on empty history ("no runs yet"). Stdlib + pyyaml (registry only).

Usage:  python3 build_status.py [--history-dir ...] [--out-dir ...] [--reviewed ...]
"""
import os, sys, json, glob, argparse, datetime
import lib_surveillance as L

FAC_ROOT = os.path.dirname(os.path.dirname(L.SURV_ROOT))          # 13_Faculty_Resources
DEFAULT_REVIEWED = os.path.join(FAC_ROOT, "reviewed.json")
CADENCE_DAYS = {"weekly": 7, "monthly": 31, "on_demand": 3650}
SEV_COLOR = {"P0": "#b3261e", "P1": "#b26a00", "P2": "#5f6368"}


def _load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return default


def _latest_reports(history_dir):
    findings = []
    for stem in ("guideline_delta", "link_audit", "resource_intake"):
        files = sorted(glob.glob(os.path.join(history_dir, f"{stem}_*.json")))
        if files:
            findings.extend(_load(files[-1], []))
    return findings


def _days_since(iso):
    try:
        then = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
        now = datetime.datetime.now(datetime.timezone.utc)
        return (now - then).days
    except Exception:
        return None


def compute(history_dir, reviewed_path):
    findings = _latest_reports(history_dir)
    for f in findings:
        f.setdefault("severity", "P2")
    active_findings = [f for f in findings
                       if f.get("status") not in ("dismissed", "actioned")]
    open_findings = [f for f in active_findings
                     if f["severity"] in ("P0", "P1")]
    p0 = [f for f in open_findings if f["severity"] == "P0"]
    p1 = [f for f in open_findings if f["severity"] == "P1"]
    p2 = [f for f in active_findings if f["severity"] == "P2"]

    # review-overdue: newest finding date per affected page vs reviewed.json
    reviewed = _load(reviewed_path, {})
    newest_by_page = {}
    for f in active_findings:
        d = (f.get("detected_at") or "")[:10]
        for pg in f.get("affects", []):
            if d > newest_by_page.get(pg, ""):
                newest_by_page[pg] = d
    overdue = []
    for pg, finding_date in sorted(newest_by_page.items()):
        rec = reviewed.get(os.path.basename(pg))
        reviewed_at = rec.get("at") if rec else None
        if reviewed_at is None or reviewed_at < finding_date:
            overdue.append({"page": pg, "finding_date": finding_date,
                            "reviewed_at": reviewed_at or "— never attested —"})

    # per-source freshness
    last_run = _load(os.path.join(history_dir, "last_run.json"), {})
    freshness = []
    try:
        reg = L.load_registry()
        cad = {s["id"]: s.get("cadence", "monthly") for s in reg.get("sources", [])}
        cad["link-monitor"] = "weekly"
    except Exception:
        cad = {}
    for sid, ts in sorted(last_run.items()):
        age = _days_since(ts)
        limit = CADENCE_DAYS.get(cad.get(sid, "monthly"), 31)
        stale = age is not None and age > limit
        freshness.append({"source": sid, "checked": ts[:10] if ts else "—",
                          "age_days": age, "stale": stale})

    return {"has_runs": bool(findings), "p0": p0, "p1": p1, "p2": p2,
            "overdue": overdue, "freshness": freshness, "generated": L.utcnow()}


# ------------------------------------------------------------------ renderers
def render_md(s):
    L_ = ["# Surveillance status", "",
          f"_Generated {s['generated']}._ See `REVIEW_RULES.md` for severity + SLAs.", ""]
    if not s["has_runs"]:
        L_ += ["**No surveillance runs yet.** Baseline the guideline job and let the weekly "
               "link run complete, then this page populates."]
        return "\n".join(L_)
    L_ += ["## Summary", "",
           f"- **P0 open:** {len(s['p0'])}  •  **P1 open:** {len(s['p1'])}  "
           f"•  **P2 (digest):** {len(s['p2'])}",
           f"- **Pages needing re-review:** {len(s['overdue'])}",
           f"- **Stale sources:** {sum(1 for x in s['freshness'] if x['stale'])}", ""]

    def block(title, items):
        out = [f"## {title} ({len(items)})", ""]
        if not items:
            out += ["_None._", ""]
            return out
        for f in items:
            link = f.get("github_issue")
            head = f"- **[{f['source_id']}]** {f.get('summary','')}"
            if link:
                head += f"  ([issue]({link}))"
            out.append(head)
            if f.get("affects"):
                out.append(f"  - affects: {', '.join('`'+a+'`' for a in f['affects'])}")
        out.append("")
        return out

    L_ += block("Open P0 — act now", s["p0"])
    L_ += block("Open P1", s["p1"])

    L_ += ["## Pages needing re-review", ""]
    if s["overdue"]:
        L_ += ["| Page | Change detected | Last attested |", "|---|---|---|"]
        L_ += [f"| `{o['page']}` | {o['finding_date']} | {o['reviewed_at']} |" for o in s["overdue"]]
    else:
        L_ += ["_All affected pages attested since their last change._"]
    L_ += [""]

    L_ += ["## Source freshness", "", "| Source | Last checked | Age (days) | Status |",
           "|---|---|---|---|"]
    for x in s["freshness"]:
        L_ += [f"| `{x['source']}` | {x['checked']} | {x['age_days'] if x['age_days'] is not None else '—'} "
               f"| {'⚠ stale' if x['stale'] else 'ok'} |"]
    return "\n".join(L_)


def render_html(s):
    def chip(sev):
        return f'<span style="background:{SEV_COLOR[sev]};color:#fff;padding:1px 7px;border-radius:10px;font-size:12px">{sev}</span>'

    def rows(items):
        if not items:
            return '<tr><td colspan="3" style="color:#5f6368">None</td></tr>'
        r = ""
        for f in items:
            issue = f.get("github_issue")
            link = f' · <a href="{issue}">issue</a>' if issue else ""
            aff = "<br>".join(f"<code>{a}</code>" for a in f.get("affects", [])) or "—"
            r += (f"<tr><td>{chip(f['severity'])}</td>"
                  f"<td><b>{f['source_id']}</b><br>{f.get('summary','')}{link}</td>"
                  f"<td style='font-size:12px'>{aff}</td></tr>")
        return r

    over = "".join(f"<tr><td><code>{o['page']}</code></td><td>{o['finding_date']}</td>"
                   f"<td>{o['reviewed_at']}</td></tr>" for o in s["overdue"]) \
        or '<tr><td colspan="3" style="color:#5f6368">All affected pages attested.</td></tr>'
    fresh = "".join(f"<tr><td><code>{x['source']}</code></td><td>{x['checked']}</td>"
                    f"<td>{x['age_days'] if x['age_days'] is not None else '—'}</td>"
                    f"<td>{'⚠ stale' if x['stale'] else 'ok'}</td></tr>" for x in s["freshness"]) \
        or '<tr><td colspan="4" style="color:#5f6368">No runs yet.</td></tr>'
    banner = "" if s["has_runs"] else (
        '<p style="background:#fff3e0;padding:10px;border-radius:6px">'
        'No surveillance runs yet — baseline the guideline job and let the weekly link run complete.</p>')
    css = ("body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#202124;max-width:900px}"
           "h1{margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:8px 0 24px}"
           "th,td{border:1px solid #e0e0e0;padding:6px 8px;text-align:left;vertical-align:top}"
           "th{background:#f5f5f5}.k{display:inline-block;margin-right:18px;font-size:15px}code{font-size:12px}")
    return f"""<!doctype html><html><head><meta charset="utf-8">
<title>Surveillance status</title><style>{css}</style></head><body>
<h1>Surveillance status</h1>
<div style="color:#5f6368;font-size:13px">Generated {s['generated']} · see REVIEW_RULES.md</div>
{banner}
<p style="margin-top:14px">
<span class="k">{chip('P0')} open: <b>{len(s['p0'])}</b></span>
<span class="k">{chip('P1')} open: <b>{len(s['p1'])}</b></span>
<span class="k">{chip('P2')} digest: <b>{len(s['p2'])}</b></span>
<span class="k">Re-review: <b>{len(s['overdue'])}</b></span>
<span class="k">Stale sources: <b>{sum(1 for x in s['freshness'] if x['stale'])}</b></span></p>
<h3>Open P0 — act now</h3><table><tr><th>Sev</th><th>Finding</th><th>Affects</th></tr>{rows(s['p0'])}</table>
<h3>Open P1</h3><table><tr><th>Sev</th><th>Finding</th><th>Affects</th></tr>{rows(s['p1'])}</table>
<h3>Pages needing re-review</h3><table><tr><th>Page</th><th>Change detected</th><th>Last attested</th></tr>{over}</table>
<h3>Source freshness</h3><table><tr><th>Source</th><th>Last checked</th><th>Age (days)</th><th>Status</th></tr>{fresh}</table>
</body></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--history-dir", default=L.HISTORY)
    ap.add_argument("--out-dir", default=L.SURV_ROOT)
    ap.add_argument("--reviewed", default=DEFAULT_REVIEWED)
    args = ap.parse_args()

    s = compute(args.history_dir, args.reviewed)
    os.makedirs(args.out_dir, exist_ok=True)
    md_path = os.path.join(args.out_dir, "STATUS.md")
    html_path = os.path.join(args.out_dir, "status.html")
    open(md_path, "w", encoding="utf-8").write(render_md(s))
    open(html_path, "w", encoding="utf-8").write(render_html(s))
    print(f"status: P0={len(s['p0'])} P1={len(s['p1'])} P2={len(s['p2'])} "
          f"overdue={len(s['overdue'])} -> {os.path.basename(md_path)}, {os.path.basename(html_path)}")


if __name__ == "__main__":
    main()
