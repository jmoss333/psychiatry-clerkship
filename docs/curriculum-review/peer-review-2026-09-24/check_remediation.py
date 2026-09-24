#!/usr/bin/env python3
"""check_remediation.py — machine-verifiable completion check for the 2026-09-24 peer review.

WHAT IT ANSWERS: for each finding id in a work package, "is the defect gone from the SOURCE, and
did the correction land?" — plus, for the defect classes that the 2026-09-01 cycle half-fixed,
"did any sibling copy of the same error survive?" (sibling_rules.json).

Why it exists: the prior cycle's completion check was "grep the quote in the regenerated
transcript — it must be gone". That check passed on 13 findings that were NOT fixed: the quote
was gone, but the same error lived on in the rationale / pearl / stem / overlay beside it, or the
reviewer's instruction had been pasted in as learner text. This script checks sources (not
transcripts), checks every copy the locator found (both quizzes.json files, both agitation packs,
topic_meta + prose), and runs the sibling rules.

Statuses per finding:
  FIXED     quote gone from every edit file AND correction present          (or additive
            correction present when the correction contains the quote)
  DEVIATED  quote gone, correction text not found — acceptable ONLY with a written reason in the
            PR body (e.g. the verifier's companion edit reworded it); listed, exit 0
  OPEN      quote still present in at least one edit file
  UNCHECKED an edit file is missing / the finding has no locator — exit 2, never a pass

Exit: 0 all selected findings FIXED/DEVIATED and no sibling rule matches · 1 any OPEN or any
sibling-rule match · 2 could-not-check (missing file, unknown WP, empty selection).

Usage (repo root is derived from this file's location; no machine paths):
  python3 docs/curriculum-review/peer-review-2026-09-24/check_remediation.py --wp WP-1
  python3 .../check_remediation.py --wp WP-3 --verbose
  python3 .../check_remediation.py --all --rev origin/main      # baseline: expect everything OPEN
  python3 .../check_remediation.py --ids R01-001,R01-002
"""
import argparse, json, os, re, subprocess, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as fh:
        return json.load(fh)


class Reader:
    def __init__(self, rev):
        self.rev, self.cache = rev, {}

    def text(self, path):
        if path in self.cache:
            return self.cache[path]
        t = None
        if self.rev:
            r = subprocess.run(["git", "-C", ROOT, "show", f"{self.rev}:{path}"],
                               capture_output=True, text=True)
            t = r.stdout if r.returncode == 0 else None
        else:
            p = os.path.join(ROOT, path)
            if os.path.isfile(p):
                with open(p, encoding="utf-8", errors="replace") as fh:
                    t = fh.read()
        self.cache[path] = t
        return t


def json_strings(obj):
    out = []
    def walk(x):
        if isinstance(x, str): out.append(x)
        elif isinstance(x, dict): [walk(v) for v in x.values()]
        elif isinstance(x, list): [walk(v) for v in x]
    walk(obj)
    return "\n".join(out)


def norm(s):
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    s = re.sub(r"\\(?=['\"])", "", s)
    s = re.sub(r"</?[A-Za-z][A-Za-z0-9]*(\s[^<>]*)?/?>", "", s)   # real inline HTML tags only
    s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&nbsp;", " ")
    s = re.sub(r"\[\^[^\]]+\]", "", s)             # markdown footnote refs [^id]
    s = re.sub(r"[*`]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_line(l):
    l = l.strip()
    l = re.sub(r"^([-+>]\s*)+", "", l)
    l = re.sub(r"^\d{1,2}[a-z]?[.)]\s+", "", l)          # ordered-list markers ("6.", "6a.")
    l = re.sub(r"^\*\*[^*]{1,40}:\*\*\s*", "", l)          # **Label:** (transcript rendering)
    l = re.sub(r"^\*[^*]{1,40}[.:]\*\s*", "", l)             # *Rationale:* / *Prompt.*
    l = re.sub(r"^\*\*\([a-z0-9]\)\*\*\s*", "", l)          # **(a)** option labels
    l = norm(l)
    l = re.sub(r"^(Setting|Learner goal|Prompt|Rationale|Answer|Pearl|Why|Stem|Feedback):\s*", "", l)
    return l.strip('"').strip()


def probe(s):
    """The longest meaningful line of a quote/correction, normalised — robust to the transcript's
    markdown rendering of JSON fields (list bullets, blockquotes, bold labels)."""
    lines = [clean_line(l) for l in s.split("\n")]
    lines = [l for l in lines if len(l) >= 12] or [norm(s)]
    return max(lines, key=len)


def haystacks(reader, path):
    t = reader.text(path)
    if t is None:
        return None
    hs = [norm(t)]
    if path.endswith(".json"):
        try:
            hs.append(norm(json_strings(json.loads(t))))
        except Exception:
            pass
    return hs


def scoped_text(reader, path, scope):
    t = reader.text(path)
    if t is None:
        return None
    if scope == "*":
        if path.endswith(".json"):
            try:
                return norm(json_strings(json.loads(t)))
            except Exception:
                return norm(t)
        return norm(t)
    kind, key = scope.split(":", 1)
    d = json.loads(t)
    if kind == "deck":
        hit = [x for x in d.get("decks", []) if x.get("id") == key]
    elif kind == "qb":
        hit = [x for x in d.get("items", []) if x.get("id") == key]
    else:
        raise ValueError(scope)
    if not hit:
        return None
    return norm(json_strings(hit))


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--wp")
    g.add_argument("--ids")
    g.add_argument("--all", action="store_true")
    ap.add_argument("--rev", help="read sources at a git rev instead of the working tree")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--waivers", default=os.path.join(HERE, "waivers.json"),
                    help="JSON {finding_id: {file: reason}} — a located copy that is legitimately "
                         "different context and must NOT change. Every waiver is printed; keep the list short.")
    a = ap.parse_args()

    findings = {f["id"]: f for f in load("findings.json")}
    manifest, wpmap, rules = load("locator_manifest.json"), load("wp_map.json"), load("sibling_rules.json")
    if a.all:
        sel = sorted(findings)
    elif a.ids:
        sel = [i.strip() for i in a.ids.split(",") if i.strip()]
    else:
        sel = sorted(i for i, w in wpmap.items() if w == a.wp)
    if not sel or any(i not in findings for i in sel):
        print(f"UNCHECKED: empty or unknown selection ({[i for i in sel if i not in findings]})")
        return 2

    waivers = {}
    if os.path.exists(a.waivers):
        with open(a.waivers, encoding="utf-8") as fh:
            waivers = json.load(fh)
    reader = Reader(a.rev)
    results, unchecked = {}, []
    for fid in sel:
        f, m = findings[fid], manifest.get(fid) or {}
        files = [p for p in (m.get("editFiles") or []) if p not in waivers.get(fid, {})]
        if m.get("ruleOnly"):
            rule = next(r for r in rules if r["rule"] == m["ruleOnly"])
            t = reader.text(rule["files"][0])
            if t is None:
                results[fid] = ("UNCHECKED", f"{rule['files'][0]} missing"); unchecked.append(fid); continue
            hit = re.search(rule["pattern"], t)
            results[fid] = ("OPEN", f"{m['ruleOnly']} still matches") if hit else ("FIXED", f"{m['ruleOnly']} clear")
            continue
        if not files:
            results[fid] = ("UNCHECKED", "no edit file located — resolve by hand and note it in the PR")
            unchecked.append(fid); continue
        q, c = probe(f["quote"]), probe(f["correction"]) if f["correction"].strip() else ""
        additive = bool(c) and q in norm(f["correction"])
        added = []
        if additive:
            # probe the ADDED text, not the retained quote — otherwise an untouched page reads FIXED
            rest = norm(f["correction"]).replace(q, " ")
            c = probe(rest) if len(norm(rest)) >= 8 else norm(f["correction"])
            # ...and each added LINE on its own. A correction written as list lines ("- A\n- B")
            # joins to "A - B" above, which can exist in markdown but never across separate JSON
            # array elements (M05-001: a topic_meta ruleOut list). Requiring EVERY added line is
            # stricter than the joined probe, so this accepts no fix the joined probe would reject
            # on content grounds; it only stops a list-shaped fix reading OPEN for its container.
            added = [clean_line(l) for l in f["correction"].split("\n")]
            added = [l for l in added if len(l) >= 8 and q not in l]
        q_in, c_in, missing = [], False, []
        added_seen = set()
        for p in files:
            hs = haystacks(reader, p)
            if hs is None:
                missing.append(p); continue
            if c and any(c in h for h in hs):
                c_in = True
            added_seen.update(l for l in added if any(l in h for h in hs))
            if not additive and any(q in h for h in hs):
                q_in.append(p)
        if missing and len(missing) == len(files):
            results[fid] = ("UNCHECKED", f"edit files missing: {missing}"); unchecked.append(fid); continue
        if additive:
            every_line = bool(added) and len(added_seen) == len(added)
            st = (("FIXED", "additive correction present") if c_in else
                  ("FIXED", f"additive correction present (all {len(added)} added line(s))") if every_line else
                  ("OPEN", "additive correction not found"))
        elif q_in:
            st = ("OPEN", f"quote still in {q_in}")
        elif c_in:
            st = ("FIXED", "")
        else:
            st = ("DEVIATED", "quote gone; correction text not found verbatim — justify in PR body")
        results[fid] = st

    wps = {wpmap[i] for i in sel}
    rule_hits = []
    for r in rules:
        if not (a.all or r["wp"] in wps):
            continue
        for p in r["files"]:
            t = reader.text(p) if r.get("raw") else scoped_text(reader, p, r["scope"])
            if t is None:
                continue
            n = len(re.findall(r["pattern"], t))
            if n:
                rule_hits.append((r["rule"], p, r["scope"], n, r["why"]))

    cnt = Counter(s for s, _ in results.values())
    if a.json:
        print(json.dumps({"examined": len(sel), "counts": cnt, "results": results,
                          "siblingRuleHits": rule_hits}, indent=1))
    else:
        label = a.wp or ("ALL" if a.all else "ids")
        print(f"check_remediation · {label} · source={'git:' + a.rev if a.rev else 'working tree'}")
        print(f"examined {len(sel)} findings: " + " · ".join(f"{k} {v}" for k, v in sorted(cnt.items())))
        for fid in sel:
            s, why = results[fid]
            if a.verbose or s != "FIXED":
                print(f"  {s:9} {fid:8} {findings[fid]['surface'][:48]:48} {why}")
        for fid in sel:
            for p, why in waivers.get(fid, {}).items():
                print(f"  WAIVED    {fid:8} {p} — {why}")
        print(f"sibling rules: {len(rule_hits)} match(es)")
        for h in rule_hits:
            print(f"  MATCH {h[0]} {h[1]} [{h[2]}] ×{h[3]} — {h[4]}")
    if unchecked:
        return 2
    if cnt.get("OPEN") or rule_hits:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
