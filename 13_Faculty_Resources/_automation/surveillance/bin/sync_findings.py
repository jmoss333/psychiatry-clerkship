#!/usr/bin/env python3
"""
sync_findings.py — turn surveillance findings into idempotent GitHub issues + reports.

Pipeline:
  1. Load findings (array conforming to config/finding.schema.json).
  2. Resolve affects[] via citation_index.json; escalate severity (acute paths).
  3. Ensure a stable fingerprint on each finding.
  4. Dedup: fetch fingerprints already present in ANY surveillance issue
     (state=all — open or closed), so re-runs never open duplicates and a
     dismissed fingerprint is never reopened.
  5. P0/P1 with a NEW fingerprint -> open an issue. P2 -> monthly digest.
  6. Write a dated report + last_run stamp under history/.

Stdlib only (urllib). Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo).

Examples:
  # Real run in CI:
  GITHUB_TOKEN=*** python3 sync_findings.py --findings findings.json --job link-source-monitor
  # Local dry run (no network); simulate existing issues via a fingerprint fixture:
  python3 sync_findings.py --findings f.json --job guideline-surveillance \
      --dry-run --existing-fixture existing_fps.json --out-dir /tmp/surv
"""
import os, sys, json, time, argparse, urllib.request, urllib.error
import lib_surveillance as L

API = "https://api.github.com"
DEFAULT_REPO = "jmoss333/psychiatry-clerkship"


def _gh(method, url, token, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "curriculum-surveillance")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode() or "null"), dict(r.headers)


def _next_link(link_header):
    for part in (link_header or "").split(","):
        seg = part.split(";")
        if len(seg) >= 2 and 'rel="next"' in seg[1]:
            return seg[0].strip().strip("<>")
    return None


def fetch_existing_fingerprints(repo, token):
    """Fingerprints already present in any surveillance-labelled issue (state=all)."""
    fps = set()
    url = f"{API}/repos/{repo}/issues?state=all&labels=surveillance&per_page=100"
    while url:
        items, headers = _gh("GET", url, token)
        for it in items or []:
            m = L.FP_RE.search(it.get("body") or "")
            if m:
                fps.add(m.group(1))
        url = _next_link(headers.get("Link", ""))
    return fps


def create_issue(repo, token, f):
    data = {"title": L.issue_title(f), "body": L.issue_body(f), "labels": L.issue_labels(f)}
    res, _ = _gh("POST", f"{API}/repos/{repo}/issues", token, data)
    return res.get("html_url")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--findings", required=True, help="JSON array of findings")
    ap.add_argument("--job", required=True,
                    choices=["guideline-surveillance", "link-source-monitor", "resource-intake"])
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPO))
    ap.add_argument("--dry-run", action="store_true", help="No GitHub calls; print intended actions")
    ap.add_argument("--existing-fixture", help="(dry-run) JSON array of fingerprints to treat as already-issued")
    ap.add_argument("--out-dir", help="Override history/ output dir (used by tests)")
    args = ap.parse_args()

    findings = json.load(open(args.findings, encoding="utf-8"))
    inv = L.invert_citations(L.load_citation_index())

    for f in findings:
        f.setdefault("status", "new")
        L.resolve_affects(f, inv)
        L.escalate(f)
        L.ensure_fingerprint(f)

    issue_findings = [f for f in findings if f["severity"] in ("P0", "P1")]
    digest_findings = [f for f in findings if f["severity"] == "P2"]

    token = os.environ.get("GITHUB_TOKEN")
    if args.dry_run:
        existing = set(json.load(open(args.existing_fixture))) if args.existing_fixture else set()
    else:
        if not token:
            sys.exit("ERROR: GITHUB_TOKEN required (or use --dry-run)")
        existing = fetch_existing_fingerprints(args.repo, token)

    max_new = int(os.environ.get("MAX_NEW_ISSUES", "25"))
    created, deduped, overflow = [], [], []
    stop_creating = False
    for f in issue_findings:
        if f["fingerprint"] in existing:
            f["status"] = "triaged"
            deduped.append(f)
            continue
        if args.dry_run:
            print(f"[dry-run] CREATE  {L.issue_title(f)}")
            f["status"] = "issue-open"
            created.append(f)
            existing.add(f["fingerprint"])
            continue
        if stop_creating or len(created) >= max_new:   # cap: rest -> digest
            f["status"] = "new"
            overflow.append(f)
            continue
        try:
            f["github_issue"] = create_issue(args.repo, token, f)
        except Exception as e:   # e.g. GitHub secondary rate limit (HTTP 403)
            print(f"WARN: issue create failed ({e}); routing remaining findings to digest.",
                  file=sys.stderr)
            stop_creating = True
            f["status"] = "new"
            overflow.append(f)
            continue
        print(f"CREATED {f['github_issue']}  {L.issue_title(f)}")
        f["status"] = "issue-open"
        created.append(f)
        existing.add(f["fingerprint"])
        time.sleep(1.5)   # throttle: stay under GitHub's secondary rate limit

    reports = L.write_report(args.job, findings, base=args.out_dir)
    digest = L.append_digest(digest_findings + overflow, base=args.out_dir)
    L.update_last_run(sorted({f["source_id"] for f in findings}), base=args.out_dir)

    print(f"\nSummary [{args.job}]: {len(created)} created, {len(deduped)} deduped, "
          f"{len(digest_findings)} P2 digested, {len(overflow)} overflow->digest.")
    print("Reports: " + ", ".join(os.path.basename(r) for r in reports)
          + (f", {os.path.basename(digest)}" if digest else ""))


if __name__ == "__main__":
    main()
