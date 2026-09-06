#!/usr/bin/env python3
"""open_update_pr.py — the last hop of curriculum surveillance.

Turns an *actionable* guideline delta (P0/P1, a page we teach changed) into an
attestation-routed pull request instead of a bare issue. Each PR:

  1. Flags the affected topic slug(s) in `config/needs_reattest.json`, which
     build_attest.py unions into the Review & Attest tool's "changed" list — so the
     page's "Reviewed by" badge is queued for re-confirmation.
  2. Logs the proposal in `PENDING_UPDATES.md` (clean, revertible diff).
  3. Carries the full context in the PR body (source, diff excerpt, recommended
     action, affected pages) + an attestation checklist — for Dr. Moss to confirm the
     edit and re-stamp reviewed.json.

Idempotent: one PR per finding fingerprint (branch `surveillance/update-<fp8>`); a
re-run that sees the branch/PR does nothing. Stdlib + `gh` (auto-authed in Actions).

Usage:
  # CI, after sync_findings (needs `pull-requests: write`):
  python3 open_update_pr.py --findings findings.json
  # Local dry run (no git/gh; writes intended PR bodies to --out-dir):
  python3 open_update_pr.py --findings f.json --dry-run --out-dir /tmp/surv_pr
"""
import os, sys, json, argparse, subprocess, re
import lib_surveillance as L
try:
    import lib_ai_draft            # Phase 2: advisory AI-drafted edit (optional)
except Exception:
    lib_ai_draft = None

NEEDS   = os.path.join(L.CONFIG, "needs_reattest.json")
PENDING = os.path.join(L.SURV_ROOT, "PENDING_UPDATES.md")
BUILD_DEPLOY = os.path.join(L.LIB_ROOT, "13_Faculty_Resources", "_automation", "site_build", "build_deploy.py")


def path_to_slug_map():
    """Authoritative content-path -> topic_meta slug map, parsed from build_deploy.py's md[]."""
    txt = open(BUILD_DEPLOY, encoding="utf-8").read()
    pairs = re.findall(r'\(\s*"([^"]+\.md)"\s*,\s*"([^"]+\.md)"\s*,\s*"[^"]*"\s*\)', txt)
    return {src: slug for src, slug in pairs}


def actionable(f):
    return (f.get("severity") in ("P0", "P1")
            and f.get("change_type") in ("new", "modified", "removed")
            and f.get("affects"))


def fp8(f):
    return f["fingerprint"].split("::")[-1][:8]


def build_ai_block(f, stub=False):
    """Advisory AI-drafted suggestion block, or None. Never raises into the PR flow."""
    if lib_ai_draft is None:
        return None
    if not stub and not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        pages = lib_ai_draft.load_pages(f.get("affects", []), L.LIB_ROOT)
        return lib_ai_draft.suggest_block(f, pages, stub=stub)
    except Exception as e:
        print("WARN: AI draft skipped for %s: %s" % (fp8(f), e), file=sys.stderr)
        return None


def pr_body(f, slugs, ai_block=None):
    body = L.issue_body(f)   # reuse exact rendering: FP marker, source, diff, affects, action
    extra = [
        "", "### Attestation checklist",
        "- [ ] Reviewed the source change against the affected page(s)",
        "- [ ] Edited the teaching content if it needs to change (fictional composites only, no PHI)",
        "- [ ] Re-attested in the Review & Attest tool (updates `reviewed.json`)",
        "- [ ] Removed the slug(s) below from `13_Faculty_Resources/_automation/surveillance/config/needs_reattest.json`",
    ]
    if slugs:
        extra.append("\n**Flagged for re-attestation:** " + ", ".join(f"`{s}`" for s in slugs))
    else:
        extra.append("\n_(Affected page(s) have no topic_meta card; review the path(s) above.)_")
    out = body + "\n" + "\n".join(extra)
    if ai_block:
        out += "\n" + ai_block
    return out


def load_needs():
    try:
        return json.load(open(NEEDS, encoding="utf-8"))
    except Exception:
        return {"_note": "Topic slugs flagged by curriculum surveillance for faculty re-attestation. "
                         "build_attest.py unions these into the Review & Attest 'changed' list. "
                         "Remove a slug after re-attesting its page.",
                "slugs": []}


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, cwd=L.LIB_ROOT, **kw)


def branch_or_pr_exists(branch):
    r = run(["gh", "pr", "list", "--head", branch, "--state", "all", "--json", "number"])
    if r.returncode == 0:
        try:
            return bool(json.loads(r.stdout or "[]"))
        except Exception:
            pass
    return run(["git", "ls-remote", "--exit-code", "--heads", "origin", branch]).returncode == 0


def open_pr(f, slugs, ai_block=None):
    branch = "surveillance/update-" + fp8(f)
    if branch_or_pr_exists(branch):
        return None, "exists"
    if run(["git", "checkout", "-B", branch, "origin/main"]).returncode != 0:
        return None, "checkout-failed"
    nd = load_needs()
    nd["slugs"] = sorted(set(nd.get("slugs", [])) | set(slugs))
    # Trailing newline matters: the committed file ends "}\n", and json.dump does not
    # write one. Without it every surveillance PR carries a spurious "\ No newline at end
    # of file" diff — and for a finding that maps to no topic (slugs empty) that strip was
    # the ENTIRE diff, producing "flag re-attestation" commits that flagged nothing.
    with open(NEEDS, "w", encoding="utf-8") as fh:
        json.dump(nd, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    with open(PENDING, "a", encoding="utf-8") as fh:
        fh.write("\n- %s · **[%s]** %s → %s (fp `%s`)\n"
                 % (L.today(), f["source_id"], f["summary"], ", ".join(slugs) or "(no topic_meta)", fp8(f)))
    run(["git", "add", NEEDS, PENDING])
    run(["git", "commit", "-m", "surveillance: flag re-attestation — %s (%s)" % (f["source_id"], fp8(f))])
    if run(["git", "push", "-u", "origin", branch, "--force-with-lease"]).returncode != 0:
        return None, "push-failed"
    title = ("surveillance: review %s — %s changed"
             % (", ".join(slugs) or f["source_id"], f["source_id"]))[:250]
    pr = run(["gh", "pr", "create", "--base", "main", "--head", branch,
              "--title", title, "--body", pr_body(f, slugs, ai_block),
              "--label", "surveillance", "--label", f["severity"], "--label", "needs-attestation"])
    return (pr.stdout.strip() or None), (None if pr.returncode == 0 else pr.stderr.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--findings", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out-dir")
    ap.add_argument("--max-prs", type=int, default=int(os.environ.get("MAX_NEW_PRS", "10")))
    ap.add_argument("--ai-stub", action="store_true",
                    help="Attach a canned (no-API) advisory block — offline wiring test.")
    ap.add_argument("--no-ai", action="store_true",
                    help="Never attach an AI draft even if ANTHROPIC_API_KEY is set.")
    a = ap.parse_args()

    findings = json.load(open(a.findings, encoding="utf-8"))
    inv = L.invert_citations(L.load_citation_index())
    p2s = path_to_slug_map()

    opened, skipped = [], []
    for f in findings:
        f.setdefault("status", "new")
        L.resolve_affects(f, inv)
        L.escalate(f)
        L.ensure_fingerprint(f)
        if not actionable(f):
            continue
        slugs = sorted({p2s[p] for p in f["affects"] if p in p2s})
        branch = "surveillance/update-" + fp8(f)
        if len(opened) >= a.max_prs:
            skipped.append((branch, "max-prs")); continue
        ai_block = None if a.no_ai else build_ai_block(f, stub=a.ai_stub)
        if a.dry_run:
            outd = a.out_dir or "."
            os.makedirs(outd, exist_ok=True)
            open(os.path.join(outd, "PR_%s.md" % fp8(f)), "w", encoding="utf-8").write(pr_body(f, slugs, ai_block))
            print("[dry-run] PR on %s | affects slugs: %s | ai_draft: %s"
                  % (branch, slugs or "(none with topic_meta)", "yes" if ai_block else "no"))
            opened.append(branch); continue
        try:
            url, err = open_pr(f, slugs, ai_block)
        except Exception as e:
            url, err = None, str(e)
        if url and not err:
            print("OPENED %s" % url); opened.append(branch)
        elif err == "exists":
            print("exists, skip: %s" % branch); skipped.append((branch, "exists"))
        else:
            print("WARN: PR failed for %s: %s" % (branch, err), file=sys.stderr)
            skipped.append((branch, err or "error"))

    if not a.dry_run:
        run(["git", "checkout", "main"])   # restore the workflow's checkout
    print("\nopen_update_pr: %d PR(s), %d skipped." % (len(opened), len(skipped)))


if __name__ == "__main__":
    main()
