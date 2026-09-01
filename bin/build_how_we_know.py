#!/usr/bin/env python3
"""
build_how_we_know.py — regenerate the "How We Know" evidence-provenance teaching page.

The page teaches critical appraisal using this library's OWN evidence ledger and its own
corrections. Nothing in it is invented, and nothing in it is hand-maintained twice:

  - Statistics (source count, claim count, direction split, policy max age, backlog size)
    are read live from evidence_annotations.json.
  - Verbatim spans and claim text are read live from the same file, so a corrected claim
    updates the page the moment it is corrected.
  - The CORRECTION LEDGER is derived from git history: every commit touching
    evidence_annotations.json is compared to its parent, and any claimId whose claimText
    changed is recorded as a correction with its before/after text.
  - Only the teaching NARRATIVE — why a correction matters, why automation missed it, and
    the exercise — is curated, in 13_Faculty_Resources/how_we_know_teaching.json.

So the workflow is: correct a claim in the normal way, run this, and the page has taught it.

Usage:
  python3 bin/build_how_we_know.py              # write the page
  python3 bin/build_how_we_know.py --check      # exit 1 if the page on disk is out of date
  python3 bin/build_how_we_know.py --ledger     # print the derived correction ledger as JSON
  python3 bin/build_how_we_know.py --out PATH   # write somewhere else
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANNOTATIONS = ROOT / "evidence_annotations.json"
TEACHING = ROOT / "13_Faculty_Resources" / "how_we_know_teaching.json"
DEFAULT_OUT = ROOT / "_prototypes" / "how-we-know" / "how-we-know.html"

DIRECTION_ORDER = ["mixed", "positive", "descriptive", "negative"]
DIRECTION_COLOR = {
    "mixed": "var(--fd-olive)",
    "positive": "var(--fd-teal)",
    "descriptive": "var(--fd-line-hover)",
    "negative": "var(--fd-danger)",
}


# ---------------------------------------------------------------- data loading

def load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def index_annotations(doc):
    """sourceId -> annotation, and claimId -> (sourceId, claim)."""
    by_source, by_claim = {}, {}
    for ann in doc["annotations"]:
        by_source[ann["sourceId"]] = ann
        for claim in ann.get("claims", []):
            by_claim[claim["claimId"]] = (ann["sourceId"], claim)
    return by_source, by_claim


def ledger_stats(doc):
    counts = {}
    n_claims = 0
    for ann in doc["annotations"]:
        for claim in ann.get("claims", []):
            counts[claim["direction"]] = counts.get(claim["direction"], 0) + 1
            n_claims += 1
    policy = doc.get("policy", {})
    return {
        "sources": len(doc["annotations"]),
        "claims": n_claims,
        "directions": counts,
        "maxAgeDays": policy.get("maxAgeDays"),
        "backlog": len(policy.get("orphanBacklog", [])),
        "updated": doc.get("updated"),
        "owner": doc.get("owner"),
    }


# ------------------------------------------------------- correction ledger (git)

def git(*args):
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        capture_output=True, text=True, check=False,
    ).stdout


def claims_at(rev):
    """claimId -> claimText, as of a revision. {} if the file did not exist."""
    blob = git("show", f"{rev}:evidence_annotations.json")
    if not blob.strip():
        return {}
    try:
        doc = json.loads(blob)
    except json.JSONDecodeError:
        return {}
    out = {}
    for ann in doc.get("annotations", []):
        for claim in ann.get("claims", []):
            out[claim["claimId"]] = {
                "text": claim.get("claimText", ""),
                "sourceId": ann["sourceId"],
                "direction": claim.get("direction"),
            }
    return out


CORRECTION_RE = re.compile(r"\b(fix|correct|amend|mis-?sourc|misattribut|retract)", re.I)


def derive_ledger():
    """Corrections on the record, newest first.

    Two signals, because a correction does not always look the same:
      - reworded  : a claimId whose claimText changed between a commit and its parent.
                    This is what a future correction will look like now that every claim
                    is gated on a span.
      - re-sourced: a commit whose subject reads as a correction and which added sources.
                    This is what the August 2026 corrections actually looked like — the
                    claim moved to a paper that supports it, rather than being reworded.
    """
    log = git("log", "--format=%H\t%ad\t%s", "--date=short", "--",
              "evidence_annotations.json", "evidence_registry.json")
    entries = []
    for line in log.strip().splitlines():
        parts = line.split("\t", 2)
        if len(parts) == 3:
            entries.append(parts)

    ledger = []
    for sha, date, subject in entries:
        parent = git("rev-parse", f"{sha}^").strip()
        if not parent:
            continue
        before, after = claims_at(parent), claims_at(sha)

        for claim_id, now in after.items():
            was = before.get(claim_id)
            if was is not None and was["text"] != now["text"]:
                ledger.append({
                    "kind": "reworded",
                    "claimId": claim_id,
                    "sourceId": now["sourceId"],
                    "commit": sha[:7], "date": date, "subject": subject,
                    "before": was["text"], "after": now["text"],
                })

        if CORRECTION_RE.search(subject):
            added = sorted({v["sourceId"] for k, v in after.items() if k not in before})
            if added:
                ledger.append({
                    "kind": "re-sourced",
                    "claimId": None,
                    "sourceId": ", ".join(added),
                    "commit": sha[:7], "date": date, "subject": subject,
                    "before": None, "after": None,
                })
    return ledger


# ------------------------------------------------------------------- rendering

def esc(text):
    return html.escape(str(text), quote=False)


def emphasise(span, phrases):
    """Bold the curated phrases inside an escaped span."""
    out = esc(span)
    for phrase in phrases or []:
        out = out.replace(esc(phrase), "<strong>" + esc(phrase) + "</strong>")
    return out


def span_block(ann, note="", phrases=None, element_id=None, hidden=False):
    v = ann["verifiedAgainst"]
    ident = []
    if v.get("pmid"):
        ident.append("PMID " + esc(v["pmid"]))
    if v.get("doi"):
        ident.append("DOI " + esc(v["doi"]))
    ident.append("span: " + esc(v.get("spanType", "?")))
    ident.append("retrieved " + esc(v.get("retrievedAt", "?")))
    attrs = ''
    if element_id:
        attrs += f' id="{element_id}"'
    if hidden:
        attrs += " hidden"
    return (
        f'<div class="span"{attrs}>\n'
        f'  <q>{emphasise(v["sourceSpan"], phrases)}</q>\n'
        f'  <span class="src">{esc(ann["sourceId"])} · {" · ".join(ident)}'
        + (f' — {note}' if note else "")
        + "</span>\n</div>\n"
    )


def render(stats, by_source, teaching, ledger):
    d = stats["directions"]
    total = stats["claims"] or 1
    positive = d.get("positive", 0)

    bar, legend = "", ""
    for name in DIRECTION_ORDER:
        n = d.get(name, 0)
        if not n:
            continue
        bar += f'<i style="width:{n / total * 100:.2f}%;background:{DIRECTION_COLOR[name]}"></i>'
        legend += (f'<span><i class="dot" style="background:{DIRECTION_COLOR[name]}"></i> '
                   f'{name.capitalize()} — {n}</span>')

    corrections_html = ""
    for i, c in enumerate(teaching["corrections"], start=1):
        ann = by_source.get(c["sourceId"])
        if ann is None:
            continue
        fixed = ""
        for sid in c.get("fixedSourceIds", []):
            fa = by_source.get(sid)
            if fa is None:
                continue
            for claim in fa.get("claims", []):
                v = fa["verifiedAgainst"]
                who = esc(sid)
                if v.get("pmid"):
                    who += " · PMID " + esc(v["pmid"])
                fixed += (f'<div class="claim fixed"><span class="who">{who}</span>'
                          f'{esc(claim["claimText"])}</div>\n')
        corrections_html += f"""
<h2>Correction {i} — {esc(c['heading'])}</h2>
<div class="card">
  <span class="tag bad">Caught in faculty review · {esc(c['caughtOn'])}</span>
  <p>{c['lede']}</p>
  <div class="claim"><span class="who">{esc(c['beforeLabel'])}</span>{esc(c['before'])}</div>
  <button class="reveal" type="button" aria-expanded="false" data-target="sp{i}">{esc(c['revealLabel'])}</button>
{span_block(ann, c.get('spanNote', ''), c.get('spanEmphasis'), f'sp{i}', hidden=True)}
  <p style="margin-top:16px">{c['fixLede']}</p>
{fixed}
  <p style="margin-bottom:0">{c['closer']}</p>
</div>
"""

    rules_html = ""
    for n, (head, body) in enumerate(teaching["rules"], start=1):
        rules_html += (f'<div class="rule"><div class="n">{n}</div><div>'
                       f'<h3>{esc(head)}</h3><p style="margin:0">{body}</p></div></div>\n')

    ex = teaching["exercise"]
    ex_ann = by_source[ex["sourceId"]]
    options, feedback = "", {}
    for opt in ex["options"]:
        options += (f'<label><input type="radio" name="q1" value="{opt["key"]}"> '
                    f'{esc(opt["key"].upper())} — {esc(opt["text"])}</label>\n')
        feedback[opt["key"]] = [opt["verdict"], opt["feedback"]]

    ledger_rows = ""
    for row in ledger:
        what = esc(row["claimId"]) if row["claimId"] else esc(row["sourceId"])
        ledger_rows += (
            f'<tr><td><code>{what}</code></td>'
            f'<td>{esc(row["kind"])}</td>'
            f'<td>{esc(row["date"])}</td>'
            f'<td><code>{esc(row["commit"])}</code></td></tr>\n'
        )
    reworded = sum(1 for r in ledger if r["kind"] == "reworded")
    ledger_section = ""
    if ledger_rows:
        honest = ("" if reworded else
                  " No stored claim has yet needed rewording — every correction so far moved a "
                  "claim to a paper that actually supports it, which is the other way this goes wrong.")
        ledger_section = f"""
<h2>Every correction on the record</h2>
<p>Derived from the commit history of the evidence files. A claim whose wording changes, or a
correction commit that re-sources a claim, lands here automatically — this table is not maintained
by hand.{honest}</p>
<div class="card" style="padding-top:8px">
<table class="ledger"><thead><tr><th>Claim or source</th><th>Kind</th><th>Corrected</th><th>Commit</th></tr></thead>
<tbody>
{ledger_rows}</tbody></table>
</div>
"""

    return TEMPLATE \
        .replace("{{BAR}}", bar) \
        .replace("{{LEGEND}}", legend) \
        .replace("{{N_SOURCES}}", str(stats["sources"])) \
        .replace("{{N_CLAIMS}}", str(stats["claims"])) \
        .replace("{{MAX_AGE}}", str(stats["maxAgeDays"])) \
        .replace("{{BACKLOG}}", str(stats["backlog"])) \
        .replace("{{N_POSITIVE}}", str(positive)) \
        .replace("{{CORRECTIONS}}", corrections_html) \
        .replace("{{LEDGER}}", ledger_section) \
        .replace("{{RULES}}", rules_html) \
        .replace("{{EX_PROMPT}}", esc(ex["prompt"])) \
        .replace("{{EX_SPAN}}", span_block(ex_ann)) \
        .replace("{{EX_OPTIONS}}", options) \
        .replace("{{FEEDBACK_JSON}}", json.dumps(feedback)) \
        .replace("{{OWNER}}", esc(stats["owner"])) \
        .replace("{{UPDATED}}", esc(stats["updated"]))


TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How We Know — Evidence Provenance</title>
<!-- GENERATED by bin/build_how_we_know.py — do not edit by hand.
     Prose lives in 13_Faculty_Resources/how_we_know_teaching.json;
     figures and spans come from evidence_annotations.json. -->
<style>
:root{
  --fd-bg:#f6f3ee; --fd-surface:#ffffff; --fd-surface-warm:#fffdf9;
  --fd-line:#ebe5da; --fd-line-strong:#ddd3c6; --fd-line-hover:#c8baa7;
  --fd-text:#3b332c; --fd-text-mid:#64574b; --fd-text-dim:#87786a;
  --fd-terracotta:#b0674e; --fd-teal:#3a7d6e; --fd-teal-deep:#2c6356; --fd-teal-wash:#edf4f2;
  --fd-success:#357160; --fd-danger:#a34132; --fd-danger-wash:#fbefec;
  --fd-olive:#8b7040; --fd-chip:#f1ece6; --fd-callout:#fbf8f3; --fd-focus:#2f6fd0;
  --fd-shadow-card:0 1px 2px rgba(59,51,44,.05),0 8px 24px rgba(59,51,44,.04);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --fd-bg:#211d1a; --fd-surface:#2a2521; --fd-surface-warm:#2f2a25;
    --fd-line:#3a332c; --fd-line-strong:#4a4139; --fd-line-hover:#5d5248;
    --fd-text:#ece5db; --fd-text-mid:#bcb0a2; --fd-text-dim:#a2968a;
    --fd-terracotta:#d08a6f; --fd-teal:#7fc0ae; --fd-teal-deep:#9ed3c3; --fd-teal-wash:#243430;
    --fd-success:#7fc0ae; --fd-danger:#e29383; --fd-danger-wash:#3a2622;
    --fd-olive:#c9ac72; --fd-chip:#332d27; --fd-callout:#2c2723;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--fd-bg);color:var(--fd-text);
  font:16px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
.wrap{max-width:940px;margin:0 auto;padding:32px 20px 80px}
header.hero{background:var(--fd-surface-warm);border:1px solid var(--fd-line);
  border-radius:14px;padding:28px 26px;box-shadow:var(--fd-shadow-card)}
.kicker{font-size:12px;letter-spacing:.10em;text-transform:uppercase;
  color:var(--fd-terracotta);font-weight:700;margin:0 0 8px}
h1{margin:0 0 10px;font-size:30px;line-height:1.2;letter-spacing:-.01em}
h2{font-size:21px;margin:44px 0 12px;letter-spacing:-.01em}
h3{font-size:16px;margin:0 0 6px}
p{margin:0 0 14px;color:var(--fd-text-mid)}
.lede{font-size:17px;color:var(--fd-text)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:12px;margin:22px 0 8px}
.stat{background:var(--fd-surface);border:1px solid var(--fd-line);border-radius:11px;padding:14px 15px}
.stat b{display:block;font-size:25px;line-height:1.1;color:var(--fd-text);font-variant-numeric:tabular-nums}
.stat span{display:block;font-size:12px;color:var(--fd-text-dim);margin-top:4px}
.bar{display:flex;height:12px;border-radius:7px;overflow:hidden;border:1px solid var(--fd-line);margin:6px 0 10px}
.bar i{display:block}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:13px;color:var(--fd-text-mid);margin-bottom:8px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.dot{width:10px;height:10px;border-radius:3px;display:inline-block}
.card{background:var(--fd-surface);border:1px solid var(--fd-line);border-radius:13px;
  padding:22px 22px 18px;margin:16px 0;box-shadow:var(--fd-shadow-card)}
.tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  padding:3px 9px;border-radius:20px;background:var(--fd-chip);color:var(--fd-text-mid);margin-bottom:10px}
.tag.bad{background:var(--fd-danger-wash);color:var(--fd-danger)}
.claim{border-left:3px solid var(--fd-danger);background:var(--fd-danger-wash);
  padding:13px 15px;border-radius:0 9px 9px 0;margin:12px 0;color:var(--fd-text)}
.claim.fixed{border-left-color:var(--fd-success);background:var(--fd-teal-wash)}
.claim .who{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--fd-text-dim);font-weight:700;margin-bottom:5px}
.span{background:var(--fd-callout);border:1px solid var(--fd-line-strong);border-radius:9px;
  padding:14px 16px;margin:12px 0;font-size:14.5px;color:var(--fd-text)}
.span q{quotes:none;font-style:italic}
.span .src{display:block;margin-top:9px;font-size:12px;color:var(--fd-text-dim);font-style:normal}
button.reveal{appearance:none;border:1px solid var(--fd-line-strong);background:var(--fd-surface-warm);
  color:var(--fd-terracotta);font:inherit;font-size:14px;font-weight:600;padding:9px 15px;
  border-radius:9px;cursor:pointer;margin:4px 0 2px}
button.reveal:hover{border-color:var(--fd-line-hover)}
button.reveal:focus-visible{outline:2px solid var(--fd-focus);outline-offset:2px}
.rule{display:flex;gap:13px;align-items:flex-start;padding:13px 0;border-bottom:1px solid var(--fd-line)}
.rule:last-child{border-bottom:0}
.rule .n{flex:0 0 27px;height:27px;border-radius:8px;background:var(--fd-teal-wash);color:var(--fd-teal-deep);
  display:grid;place-items:center;font-weight:700;font-size:13px}
table.ledger{width:100%;border-collapse:collapse;font-size:14px}
table.ledger th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--fd-text-dim);padding:8px 10px 8px 0;border-bottom:1px solid var(--fd-line)}
table.ledger td{padding:9px 10px 9px 0;border-bottom:1px solid var(--fd-line);color:var(--fd-text-mid)}
table.ledger tr:last-child td{border-bottom:0}
.quiz label{display:block;border:1px solid var(--fd-line-strong);border-radius:9px;padding:12px 14px;
  margin:8px 0;cursor:pointer;background:var(--fd-surface-warm);font-size:14.5px}
.quiz label:hover{border-color:var(--fd-line-hover)}
.quiz input{margin-right:9px}
.verdict{margin-top:12px;padding:13px 15px;border-radius:9px;font-size:14.5px;display:none}
.verdict.show{display:block}
.verdict.ok{background:var(--fd-teal-wash);color:var(--fd-teal-deep);border:1px solid var(--fd-teal)}
.verdict.no{background:var(--fd-danger-wash);color:var(--fd-danger);border:1px solid var(--fd-danger)}
footer{margin-top:46px;padding-top:20px;border-top:1px solid var(--fd-line);
  font-size:13px;color:var(--fd-text-dim)}
code{background:var(--fd-chip);padding:1px 6px;border-radius:5px;font-size:13px}
@media (max-width:560px){h1{font-size:25px}.wrap{padding:20px 15px 60px}}
</style>
</head>
<body>
<div class="wrap">

<header class="hero">
  <p class="kicker">Evidence &amp; Reading · Critical Appraisal</p>
  <h1>How We Know</h1>
  <p class="lede">Every clinical claim in this library is stored next to the source's own words.
  This page opens that ledger — including the places where we got it wrong and had to correct it.</p>
  <p style="margin-bottom:0">If you only take one thing from this page: <strong>a citation is not
  evidence.</strong> A paper can be real, peer-reviewed, correctly formatted and still not contain
  the number someone attributed to it.</p>
</header>

<h2>The ledger, at a glance</h2>
<p>Every source in <code>evidence_annotations.json</code> stores a verbatim span — the sentence the
paper itself wrote — and the claim our teaching pages make from it. A validator refuses the build if
a claim has no span, or if a positively-worded claim is licensed by a null or negative one.</p>

<div class="stats">
  <div class="stat"><b>{{N_SOURCES}}</b><span>sources with a stored verbatim span</span></div>
  <div class="stat"><b>{{N_CLAIMS}}</b><span>claims licensed by those spans</span></div>
  <div class="stat"><b>{{MAX_AGE}}</b><span>days before a span must be re-verified</span></div>
  <div class="stat"><b>{{BACKLOG}}</b><span>legacy sources still awaiting verification</span></div>
</div>

<h3 style="margin-top:26px">What the evidence actually looks like</h3>
<p>Each claim is tagged by the <em>direction</em> of what the paper found. Notice how small the
cleanly positive slice is — this is the honest shape of a clinical literature, and it is the single
best argument against reading only abstracts and conclusions.</p>
<div class="bar" role="img" aria-label="Distribution of claim directions">{{BAR}}</div>
<div class="legend">{{LEGEND}}</div>
<p style="font-size:14px">Only <strong>{{N_POSITIVE}} of {{N_CLAIMS}}</strong> claims report a clean
positive finding. The largest group is <strong>mixed</strong> — the paper found something, and also
found a reason to doubt it. Copy that drops the second half is where most citation errors are born.</p>
{{CORRECTIONS}}
{{LEDGER}}
<h2>The rules this library holds itself to</h2>
<div class="card">
{{RULES}}</div>

<h2>Your turn</h2>
<div class="card quiz">
  <p>{{EX_PROMPT}}</p>
{{EX_SPAN}}
{{EX_OPTIONS}}  <div class="verdict" id="v1" role="status"></div>
</div>

<footer>
  <p style="margin-bottom:6px"><strong>Provenance.</strong> Figures, spans and the correction ledger
  on this page are generated from <code>evidence_annotations.json</code> (faculty owner:
  {{OWNER}}; ledger last updated {{UPDATED}}) by <code>bin/build_how_we_know.py</code>.
  Corrections are derived from the repository's own commit history.</p>
  <p style="margin-bottom:0">Educational metadata only; faculty review remains required for clinical
  recommendations. All clinical content in this library is synthetic or de-identified.</p>
</footer>

</div>
<script>
document.querySelectorAll('button.reveal').forEach(function(btn){
  btn.addEventListener('click', function(){
    var el = document.getElementById(btn.dataset.target);
    var open = !el.hidden;
    el.hidden = open;
    btn.setAttribute('aria-expanded', String(!open));
    btn.textContent = open ? btn.textContent.replace('Hide', 'Show')
                           : btn.textContent.replace('Show', 'Hide');
  });
});
var FEEDBACK = {{FEEDBACK_JSON}};
document.querySelectorAll('input[name="q1"]').forEach(function(input){
  input.addEventListener('change', function(){
    var f = FEEDBACK[input.value], box = document.getElementById('v1');
    box.className = 'verdict show ' + f[0];
    box.textContent = f[1];
  });
});
</script>
</body>
</html>
"""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if the file on disk differs from what would be generated")
    ap.add_argument("--ledger", action="store_true",
                    help="print the derived correction ledger as JSON and exit")
    args = ap.parse_args(argv)

    doc = load_json(ANNOTATIONS)
    by_source, _ = index_annotations(doc)
    ledger = derive_ledger()

    if args.ledger:
        json.dump(ledger, sys.stdout, indent=2)
        print()
        return 0

    page = render(ledger_stats(doc), by_source, load_json(TEACHING), ledger)

    if args.check:
        current = args.out.read_text(encoding="utf-8") if args.out.exists() else ""
        if current != page:
            print(f"how-we-know is out of date: {args.out.relative_to(ROOT)}", file=sys.stderr)
            print("regenerate with: python3 bin/build_how_we_know.py", file=sys.stderr)
            return 1
        print("how-we-know is current")
        return 0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(page, encoding="utf-8")
    print(f"wrote {args.out.relative_to(ROOT)} "
          f"({len(doc['annotations'])} sources, {len(ledger)} corrections on the record)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
