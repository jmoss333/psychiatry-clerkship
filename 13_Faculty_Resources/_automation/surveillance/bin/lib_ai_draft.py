#!/usr/bin/env python3
"""lib_ai_draft.py — ADVISORY AI-drafted edit suggestions for surveillance PRs.

Phase 2 of curriculum surveillance. When an actionable guideline delta opens an
attestation-routed update PR (open_update_pr.py), this helper optionally attaches
a *suggested* edit drafted by an LLM, so Dr. Moss starts from a concrete diff
instead of a blank page.

HARD GUARDRAILS (enforced by construction, not by the model's goodwill):
  * ADVISORY ONLY. This module NEVER writes a teaching .md, NEVER touches
    reviewed.json, and NEVER marks anything attested. Its sole output is text
    appended to a PR body for a human to accept, edit, or reject.
  * The draft is clearly banner-labelled and rendered inside a collapsed
    <details> block; any ``` in model output is neutralized so it cannot break
    the PR markdown (mirrors lib_surveillance.issue_body).
  * No key -> no block. If ANTHROPIC_API_KEY is unset, suggest_block() returns
    None and the PR is byte-for-byte what Phase 1 produced.
  * Failures are swallowed: a network/API error yields None (or a short
    "unavailable" note), never an exception into the PR flow.

Stdlib only (urllib) to match the pipeline's zero-install ethos.

Env:
  ANTHROPIC_API_KEY   required to actually call the API (else no-op)
  ANTHROPIC_MODEL     default "claude-3-5-haiku-latest"
  ANTHROPIC_BASE_URL  default "https://api.anthropic.com"

CLI (testing):
  python3 lib_ai_draft.py --findings f.json --page-root . --out-dir /tmp/ai
  python3 lib_ai_draft.py --findings f.json --page-root . --stub   # no API call
"""
import os, sys, json, argparse, urllib.request, urllib.error

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
BASE = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
API_VERSION = "2023-06-01"

MAX_PAGE_CHARS = 6000      # per affected page fed to the model
MAX_PAGES = 2              # cap pages per finding (cost + focus)
MAX_DIFF_CHARS = 1500      # guideline diff excerpt cap
MAX_OUT_TOKENS = 1200
TIMEOUT_S = 40

BANNER = ("> **🤖 AI-DRAFTED — ADVISORY ONLY.** Not clinically reviewed, not "
          "attested. A drafting aid, not a source of truth. Do **not** merge "
          "without faculty edit + re-attestation. May be wrong or incomplete.")

SYSTEM = (
    "You are a careful medical-education editor assisting a psychiatry clerkship "
    "director. An authoritative source (FDA/APA/DSM/USPSTF/SAMHSA/AACAP) changed, "
    "and a teaching page may need updating. You DRAFT a minimal suggested edit for "
    "faculty review. You are NOT the decision-maker and your output is advisory.\n\n"
    "Hard rules:\n"
    "1. If the source change does not actually affect the teaching content, say so "
    "plainly and propose NO edit. Over-editing is worse than under-editing.\n"
    "2. Keep any suggested edit MINIMAL and surgical — quote the smallest before/after "
    "span that must change. Do not rewrite whole sections.\n"
    "3. NEVER invent citations, numbers, dosages, or guideline text. If you are not "
    "certain the source supports a specific value, do not state it — flag the "
    "uncertainty for the faculty reviewer instead.\n"
    "4. Teaching material uses only fictional composite cases; never add real patient "
    "detail or PHI.\n"
    "5. Flag every point of uncertainty explicitly under 'Reviewer must verify'.\n\n"
    "Respond in this exact markdown skeleton and nothing else:\n"
    "**Assessment:** <one line: change needed / no change needed / uncertain>\n"
    "**Rationale:** <=2 sentences tying the source change to the page.\n"
    "**Suggested edit:** either 'None — no change needed.' or a `before:` / `after:` "
    "pair quoting the minimal span.\n"
    "**Reviewer must verify:** <bulleted, concrete checks against the primary source>"
)


def _norm(txt, n):
    return (txt or "")[:n]


def _user_content(finding, pages):
    ev = finding.get("evidence") or {}
    diff = _norm(ev.get("diff_excerpt", ""), MAX_DIFF_CHARS)
    parts = [
        "## Source change",
        "Source: %s (%s)" % (finding.get("source_name") or finding.get("source_id"),
                             finding.get("source_id")),
        "URL: %s" % (finding.get("source_url") or "(n/a)"),
        "Summary: %s" % finding.get("summary", ""),
        "Change type: %s" % finding.get("change_type", ""),
    ]
    if finding.get("recommended_action"):
        parts.append("Recommended action (from pipeline): %s" % finding["recommended_action"])
    parts.append("\nDiff excerpt (may be truncated / may be signal-only, i.e. empty):")
    parts.append("```\n%s\n```" % (diff or "(no diff text captured)"))
    parts.append("\n## Affected teaching page(s)")
    for path, text in list(pages.items())[:MAX_PAGES]:
        parts.append("\n### %s" % path)
        parts.append("```\n%s\n```" % _norm(text, MAX_PAGE_CHARS))
    parts.append("\nDraft your advisory response now, following the skeleton exactly.")
    return "\n".join(parts)


def _call_anthropic(system, user, api_key):
    """POST /v1/messages via stdlib. Returns concatenated text or raises."""
    payload = {
        "model": MODEL,
        "max_tokens": MAX_OUT_TOKENS,
        "temperature": 0,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(BASE + "/v1/messages",
                                 data=json.dumps(payload).encode(), method="POST")
    req.add_header("x-api-key", api_key)
    req.add_header("anthropic-version", API_VERSION)
    req.add_header("content-type", "application/json")
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        data = json.loads(r.read().decode() or "{}")
    chunks = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "".join(chunks).strip()


def _fence_safe(txt):
    # Neutralize ``` so model output cannot close the PR's code fence early
    # (zero-width space between the backticks; same trick as issue_body).
    return (txt or "").replace("```", "``​`")


def _wrap(finding, body_md, stubbed=False):
    fp = (finding.get("fingerprint") or "").split("::")[-1][:8]
    tag = " (stub)" if stubbed else ""
    return "\n".join([
        "", "### 🤖 AI-drafted suggestion%s" % tag, "", BANNER, "",
        "<details><summary>Advisory draft edit — expand</summary>", "",
        _fence_safe(body_md), "",
        "_Model: `%s` · finding `%s` · advisory, unverified._" % (MODEL, fp),
        "</details>",
    ])


def suggest_block(finding, pages, stub=False):
    """Return a markdown advisory block, or None.

    finding: a surveillance finding dict.
    pages:   {repo_relative_path: full_markdown_text} for affected teaching pages.
    stub:    if True, skip the API and emit a canned block (offline testing).
    Never raises; any failure returns None.
    """
    try:
        if stub:
            demo = ("**Assessment:** uncertain — offline stub, no model call.\n"
                    "**Rationale:** Stub mode: wiring/format check only.\n"
                    "**Suggested edit:** None — no change needed.\n"
                    "**Reviewer must verify:** confirm the source change against the "
                    "affected page(s) listed above.")
            return _wrap(finding, demo, stubbed=True)
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return None
        if not pages:
            return None
        text = _call_anthropic(SYSTEM, _user_content(finding, pages), api_key)
        if not text:
            return None
        return _wrap(finding, text)
    except Exception as e:
        sys.stderr.write("lib_ai_draft: suggestion unavailable (%s)\n" % e)
        return None


def load_pages(affects, root, max_pages=MAX_PAGES):
    """Read affected teaching pages (repo-relative) from `root`.

    Only regular text files under root are read; missing/binary/oversized paths
    are skipped. Returns {path: text}. Path traversal outside root is refused.
    """
    pages, root_abs = {}, os.path.abspath(root)
    for rel in (affects or [])[:max_pages]:
        p = os.path.abspath(os.path.join(root_abs, rel))
        if not p.startswith(root_abs + os.sep):
            continue
        try:
            if os.path.getsize(p) > 400_000:   # skip huge files
                continue
            with open(p, encoding="utf-8", errors="replace") as fh:
                pages[rel] = fh.read()
        except Exception:
            continue
    return pages


def main():
    ap = argparse.ArgumentParser(description="Draft advisory edit suggestions for findings.")
    ap.add_argument("--findings", required=True)
    ap.add_argument("--page-root", default=".", help="Repo root to resolve affects[] paths.")
    ap.add_argument("--out-dir", help="Write one <fp8>.md block per finding here.")
    ap.add_argument("--stub", action="store_true", help="No API call; emit canned blocks.")
    a = ap.parse_args()

    findings = json.load(open(a.findings, encoding="utf-8"))
    if a.out_dir:
        os.makedirs(a.out_dir, exist_ok=True)
    n = 0
    for f in findings:
        pages = load_pages(f.get("affects", []), a.page_root)
        block = suggest_block(f, pages, stub=a.stub)
        if not block:
            continue
        n += 1
        fp8 = (f.get("fingerprint") or "f%d" % n).split("::")[-1][:8]
        if a.out_dir:
            open(os.path.join(a.out_dir, "%s.md" % fp8), "w", encoding="utf-8").write(block)
        print("---- suggestion for %s (%s) ----" % (fp8, ", ".join(f.get("affects", [])) or "no pages"))
        print(block)
    print("\nlib_ai_draft: %d suggestion block(s)%s." % (n, " [stub]" if a.stub else ""))


if __name__ == "__main__":
    main()
