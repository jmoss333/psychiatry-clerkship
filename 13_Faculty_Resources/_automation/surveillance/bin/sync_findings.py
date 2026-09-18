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
  6. Write a dated report, checked-source freshness stamps, and issue snapshot.

Stdlib only (urllib). Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo).

Examples:
  # Real run in CI:
  GITHUB_TOKEN=*** python3 sync_findings.py --findings findings.json \
      --checked-sources checked-sources.json --issues-out issue-state.json \
      --job link-source-monitor
  # Local dry run (no network); simulate existing issues via a fingerprint fixture:
  python3 sync_findings.py --findings f.json --job guideline-surveillance \
      --checked-sources checked-sources.json --issues-out /tmp/issue-state.json \
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


def normalize_issue_snapshot(items):
    """Project GitHub issue responses into a content- and secret-free live ledger."""
    snapshot = []
    for item in items or []:
        if not isinstance(item, dict) or item.get("pull_request"):
            continue
        match = L.FP_RE.search(item.get("body") or "")
        if not match:
            continue
        labels = []
        for label in item.get("labels") or []:
            name = label.get("name") if isinstance(label, dict) else label
            if isinstance(name, str) and name:
                labels.append(name)
        snapshot.append({
            "number": item.get("number"),
            "url": item.get("html_url"),
            "state": str(item.get("state") or "").upper(),
            "closedAt": item.get("closed_at"),
            "fingerprint": match.group(1),
            "labels": sorted(set(labels)),
        })
    return sorted(snapshot, key=lambda item: (item["number"] is None, item["number"] or 0))


def fetch_issue_snapshot(repo, token):
    """Return every surveillance issue as a normalized live-state snapshot."""
    raw = []
    url = f"{API}/repos/{repo}/issues?state=all&per_page=100"
    while url:
        items, headers = _gh("GET", url, token)
        raw.extend(items or [])
        url = _next_link(headers.get("Link", ""))
    return normalize_issue_snapshot(raw)


def partition_by_disposition(findings):
    """Split findings into (opens an issue, P2 digest, deferred-with-evidence).

    Only `actionable` opens an issue. `environment` is a real detection this runner
    cannot verify and `needs-judgment` needs a person -- neither is a defect an issue
    can chase, so both go to the digest WITH their evidence rather than as a P0/P1.
    Neither is ever dropped: silencing them is how a monitored set shrinks unnoticed.

    This is a named function rather than three comprehensions inside main() because a
    test that reimplements the filter proves nothing -- the first version of
    test_only_actionable_findings_open_issues did exactly that and passed while the
    real filter was reverted.
    """
    def actionable(finding):
        return finding.get("disposition", "actionable") == "actionable"

    unfiled = [f for f in findings if not actionable(f)]
    issues = [f for f in findings if actionable(f) and f["severity"] in ("P0", "P1")]
    digest = [f for f in findings if actionable(f) and f["severity"] == "P2"]
    return issues, digest, unfiled


def suppressed_fingerprints(issue_snapshot, dismissed):
    """Fingerprints that must NOT open a new issue, and why each is suppressed.

    An OPEN issue already tracks the condition -- a second issue is a duplicate.
    A REGISTERED dismissal (config/dismissed.json) is a recorded human decision.
    A CLOSED issue is neither: it means the condition was fixed, so detecting it
    again is a recurrence and deserves a new issue. Suppressing on closure is how
    the monitored set shrinks invisibly -- one URL per closure, no signal.
    """
    suppressed = {}
    for item in issue_snapshot or []:
        if str(item.get("state") or "").upper() == "OPEN":
            suppressed[item["fingerprint"]] = "open issue #%s" % item.get("number")
    for fp, record in (dismissed or {}).items():
        suppressed.setdefault(fp, "dismissed: %s" % (record.get("reason") or "").strip())
    return suppressed


def create_issue(repo, token, f):
    data = {"title": L.issue_title(f), "body": L.issue_body(f), "labels": L.issue_labels(f)}
    res, _ = _gh("POST", f"{API}/repos/{repo}/issues", token, data)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--findings", required=True, help="JSON array of findings")
    ap.add_argument("--job", required=True,
                    choices=["guideline-surveillance", "link-source-monitor",
                             "citation-monitor", "resource-intake"])
    ap.add_argument("--checked-sources", required=True,
                    help="JSON array of source IDs the collector actually checked")
    ap.add_argument("--issues-out", required=True,
                    help="Write normalized live GitHub issue state here")
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPO))
    ap.add_argument("--dry-run", action="store_true", help="No GitHub calls; print intended actions")
    ap.add_argument("--existing-fixture", help="(dry-run) JSON array of fingerprints to treat as already-issued")
    ap.add_argument("--out-dir", help="Override history/ output dir (used by tests)")
    args = ap.parse_args()

    with open(args.findings, encoding="utf-8") as fh:
        findings = json.load(fh)
    with open(args.checked_sources, encoding="utf-8") as fh:
        checked_sources = L.validate_checked_sources(json.load(fh))
    inv = L.invert_citations(L.load_citation_index())

    for f in findings:
        f.setdefault("status", "new")
        L.resolve_affects(f, inv)
        L.escalate(f)
        L.ensure_fingerprint(f)

    issue_findings, digest_findings, unfiled = partition_by_disposition(findings)

    dismissed = L.load_dismissed()
    token = os.environ.get("GITHUB_TOKEN")
    if args.dry_run:
        if args.existing_fixture:
            with open(args.existing_fixture, encoding="utf-8") as fh:
                fixture = json.load(fh)
            if fixture and isinstance(fixture[0], dict):
                issue_snapshot = normalize_issue_snapshot(fixture)
                existing = suppressed_fingerprints(issue_snapshot, dismissed)
            else:
                issue_snapshot = []
                existing = {fp: "fixture" for fp in fixture}
        else:
            issue_snapshot, existing = [], {}
    else:
        if not token:
            sys.exit("ERROR: GITHUB_TOKEN required (or use --dry-run)")
        issue_snapshot = fetch_issue_snapshot(args.repo, token)
        existing = suppressed_fingerprints(issue_snapshot, dismissed)

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
            existing[f["fingerprint"]] = "created this run"
            continue
        if stop_creating or len(created) >= max_new:   # cap: rest -> digest
            f["status"] = "new"
            overflow.append(f)
            continue
        try:
            created_issue = create_issue(args.repo, token, f)
        except Exception as e:   # e.g. GitHub secondary rate limit (HTTP 403)
            print(f"WARN: issue create failed ({e}); routing remaining findings to digest.",
                  file=sys.stderr)
            stop_creating = True
            f["status"] = "new"
            overflow.append(f)
            continue
        f["github_issue"] = created_issue.get("html_url")
        print(f"CREATED {f['github_issue']}  {L.issue_title(f)}")
        f["status"] = "issue-open"
        created.append(f)
        existing[f["fingerprint"]] = "created this run"
        normalized = normalize_issue_snapshot([created_issue])
        if normalized:
            issue_snapshot.extend(normalized)
        time.sleep(1.5)   # throttle: stay under GitHub's secondary rate limit

    reports = L.write_report(args.job, findings, base=args.out_dir)
    digest = L.append_digest(digest_findings + overflow + unfiled, base=args.out_dir)
    L.update_last_run(checked_sources, base=args.out_dir)
    with open(args.issues_out, "w", encoding="utf-8") as fh:
        json.dump(
            sorted(issue_snapshot, key=lambda item: (item["number"] is None, item["number"] or 0)),
            fh,
            indent=2,
        )

    print(f"\nSummary [{args.job}]: {len(created)} created, {len(deduped)} deduped, "
          f"{len(digest_findings)} P2 digested, {len(overflow)} overflow->digest.")
    print(f"Suppression: {len(dismissed)} registered dismissal(s) in config/dismissed.json; "
          f"a closed issue no longer suppresses its fingerprint.")
    by_disposition = {}
    for f in unfiled:
        by_disposition[f["disposition"]] = by_disposition.get(f["disposition"], 0) + 1
    if by_disposition:
        print("Not filed as issues (reported in the digest, not silenced): "
              + ", ".join(f"{n} {k}" for k, n in sorted(by_disposition.items())))
    unreachable = L.load_ci_unreachable()
    if unreachable:
        age = L.oldest_verification_age(unreachable)
        print(f"CI-unreachable hosts: {len(unreachable)} recorded; oldest verification "
              f"{'unknown' if age is None else str(age) + ' day(s)'} old "
              f"(re-verify from a real network, or an entry rots into a lie).")
    print("Reports: " + ", ".join(os.path.basename(r) for r in reports)
          + (f", {os.path.basename(digest)}" if digest else ""))


if __name__ == "__main__":
    main()
