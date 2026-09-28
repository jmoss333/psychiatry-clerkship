#!/usr/bin/env python3
"""Does every faculty signature actually reach the learners? The daily delivery check.

The owner signs a page in the faculty console. That signature is a commit on
`attest/pending`; it reaches `main` through the rolling pull request, `release` through the
release train, and the learner sites through Netlify. A break anywhere in that chain is
silent: the page keeps showing "pending faculty review" to learners while the owner believes
it is signed. On 2026-09-28 exactly that happened -- the Interview Room re-attestation sat
on `attest/pending` with no PR on the first morning of a rotation.

This compares, slug by slug, WHAT HAS BEEN SIGNED against WHAT EACH LEARNER SITE SERVES
(its own /governance.json), and names where every undelivered signature is stuck:

  stranded       on attest/pending with no open rolling PR           red after 30 min
  in-review-pr   on attest/pending, rolling PR open but not merged   red after 6 h
  unpublished    on main, not in the revision the site serves        red after 24 h
  not-shown      in the served revision, yet the site does not show  red at once
                 it as reviewed (a build/projection defect)

Only signatures that still bind to main's current text count (attestation_hash's own
ledger_hash_report decides, never re-derived here): a page whose text changed after it was
signed is SUPPOSED to show as pending, and is the owner's re-attestation work, not a
delivery failure.

Runs daily as a step of maintenance-release-watch.yml (after the morning publish), and by
hand: `python3 bin/check_attestation_delivery.py` (uses GITHUB_TOKEN, or `gh auth token`).
Read-only: it never opens a PR, merges, publishes or writes a ledger. The healing half is
faculty-console/rolling-pr-sweep.mjs (every 15 min); this is the check that the healing works.

Exit: 0 = every signature is delivered or inside its grace period; 1 = at least one is
stuck past its grace period; 2 = could not check (a site or GitHub read failed) -- never 0.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from attestation_hash import ledger_hash_report  # noqa: E402

LEDGER_PATH = "13_Faculty_Resources/reviewed.json"
SHIPPED = ROOT / "13_Faculty_Resources/_automation/site_build/shipped_pages.json"
TOPIC_META = ROOT / "topic_meta.json"
CONFIG = ROOT / "13_Faculty_Resources/_automation/maintenance/maintenance_config.json"
DEFAULT_REPO = "jmoss333/psychiatry-clerkship"
BRANCH, BASE = "attest/pending", "main"
GRACE = {
    "stranded": timedelta(minutes=30),
    "in-review-pr": timedelta(hours=6),
    "unpublished": timedelta(hours=24),
    "not-shown": timedelta(0),
}
EXPLAIN = {
    "stranded": "signed on attest/pending, but no rolling PR is open to carry it to main",
    "in-review-pr": "signed, waiting in the open rolling PR",
    "unpublished": "merged to main, not yet in the revision this site serves",
    "not-shown": "in the served revision, but the site does not show it as reviewed",
}


class CouldNotCheck(Exception):
    """A read failed; the verdict would be over a smaller set than claimed (exit 2)."""


# ---------------------------------------------------------------------------- the world
class World:
    """GitHub + the learner sites. Tests replace it."""

    def __init__(self, repo, token):
        self.repo, self.token = repo, token

    def _get(self, url, headers, timeout=20):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as err:
            return err.code, err.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise CouldNotCheck(f"{url.split('?')[0]}: {exc}") from exc

    def api(self, path, raw=False):
        headers = {"Authorization": f"Bearer {self.token}", "X-GitHub-Api-Version": "2022-11-28",
                   "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json",
                   "User-Agent": "check-attestation-delivery"}
        status, body = self._get(f"https://api.github.com/repos/{self.repo}{path}", headers)
        if status == 404:
            return None
        if status >= 400:
            raise CouldNotCheck(f"GitHub {path.split('?')[0]} answered {status}")
        return body if raw else json.loads(body)

    def served(self, url):
        status, body = self._get(url, {"Cache-Control": "no-cache", "Accept": "application/json",
                                        "User-Agent": "check-attestation-delivery"})
        if status != 200:
            raise CouldNotCheck(f"{url} answered {status}")
        try:
            return json.loads(body)
        except ValueError as exc:
            raise CouldNotCheck(f"{url} is not JSON") from exc

    def now(self):
        return datetime.now(timezone.utc)


def bound_at_main(ledger):
    """Slugs whose REVIEWED row binds to main's current text (the working tree)."""
    shipped = json.loads(SHIPPED.read_text(encoding="utf-8"))
    topic_meta = json.loads(TOPIC_META.read_text(encoding="utf-8"))
    return set(ledger_hash_report(ROOT, ledger, shipped, topic_meta)["bound"])


def _ts(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _row_key(row):
    row = row if isinstance(row, dict) else {}
    return (row.get("status"), row.get("contentHash"), row.get("clinicalHash"), row.get("at"))


def _ledger(world, ref):
    raw = world.api(f"/contents/{LEDGER_PATH}?ref={ref}", raw=True)
    if raw is None:
        raise CouldNotCheck(f"{LEDGER_PATH} is missing at {ref}")
    ledger = json.loads(raw)
    if not isinstance(ledger, dict):
        raise CouldNotCheck(f"{LEDGER_PATH} at {ref} is not a mapping")
    return ledger


def _served_revision(world, base_url):
    doc = world.served(f"{base_url}/tool-governance.json")
    revisions = {(i.get("source") or {}).get("revision") for i in (doc.get("items") or [])}
    revisions.discard(None)
    if len(revisions) != 1:
        raise CouldNotCheck(f"{base_url} serves no single revision ({len(revisions)} found)")
    return revisions.pop()


def check(world, sites, main_ledger, bound=bound_at_main):
    """Return the report dict. Raises CouldNotCheck when any input cannot be read."""
    now = world.now()
    owner = world.repo.split("/")[0]

    comparison = world.api(f"/compare/{BASE}...{BRANCH}")
    ahead = (comparison or {}).get("ahead_by", 0)
    branch_head_at = None
    if ahead:
        commits = comparison.get("commits") or []
        branch_head_at = _ts(((commits[-1] if commits else {}).get("commit") or {}).get("committer", {}).get("date"))
        if branch_head_at is None:
            raise CouldNotCheck("attest/pending head commit has no readable date")
    open_prs = (world.api(f"/pulls?head={owner}:{BRANCH}&base={BASE}&state=open") or []) if ahead else []
    signed = _ledger(world, BRANCH) if ahead else main_ledger
    bound_slugs = bound(signed)

    report = {"asOf": now.isoformat(timespec="seconds"), "attestPendingAhead": ahead,
              "rollingPr": (open_prs[0].get("html_url") if open_prs else None),
              "sites": {}, "gaps": [], "red": []}
    if ahead and not open_prs and now - branch_head_at > GRACE["stranded"]:
        report["red"].append(f"attest/pending is {ahead} commit(s) ahead of main with no open rolling PR "
                             f"since {branch_head_at.isoformat(timespec='minutes')}")

    for site in sites:
        base = site["baseUrl"].rstrip("/")
        revision = _served_revision(world, base)
        served = (world.served(f"{base}/governance.json").get("items") or {})
        at_r = _ledger(world, revision)
        commit = world.api(f"/commits/{revision}") or {}
        revision_at = _ts(((commit.get("commit") or {}).get("committer") or {}).get("date"))
        first_after = None
        if revision_at is not None:
            since = revision_at.isoformat().replace("+00:00", "Z")
            touches = world.api(f"/commits?sha={BASE}&path={LEDGER_PATH}&since={since}&per_page=100") or []
            dates = [d for d in (_ts(((c.get("commit") or {}).get("committer") or {}).get("date")) for c in touches)
                     if d and d > revision_at]
            first_after = min(dates) if dates else None
        checked = 0
        for slug in sorted(bound_slugs):
            if slug not in served:
                continue
            checked += 1
            row = signed[slug]
            shown = served[slug] or {}
            if shown.get("status") == "reviewed" and str(shown.get("reviewedAt") or "") >= str(row.get("at") or ""):
                continue
            if _row_key(main_ledger.get(slug)) != _row_key(row):
                stage = "in-review-pr" if open_prs else "stranded"
                since = branch_head_at
            elif _row_key(at_r.get(slug)) != _row_key(row):
                stage, since = "unpublished", first_after or revision_at
            else:
                stage, since = "not-shown", now
            # A zero grace means "at once"; an unknown start time counts as late (fail closed).
            late = since is None or not GRACE[stage] or now - since > GRACE[stage]
            gap = {"site": site["name"], "slug": slug, "stage": stage, "signedAt": row.get("at"),
                   "shown": shown.get("status"), "late": late}
            report["gaps"].append(gap)
            if late:
                report["red"].append(f"{site['name']}: {slug} — {EXPLAIN[stage]}")
        report["sites"][site["name"]] = {"servedRevision": revision[:7], "signaturesChecked": checked}
        if checked == 0 and bound_slugs:
            raise CouldNotCheck(f"{base} serves none of the {len(bound_slugs)} signed pages — wrong site or empty governance.json")
    return report


def render(report):
    lines = ["## Attestation delivery — what is signed vs what learners see", ""]
    for name, s in report["sites"].items():
        lines.append(f"- **{name}** serves `{s['servedRevision']}`; {s['signaturesChecked']} signed page(s) compared")
    lines.append(f"- attest/pending ahead of main: {report['attestPendingAhead']}"
                 + (f" · rolling PR: {report['rollingPr']}" if report["rollingPr"] else ""))
    lines.append("")
    if not report["gaps"]:
        lines.append("Every current signature is showing as reviewed on every site that ships it.")
    else:
        lines += ["| Site | Page | Stuck at | Signed | Site shows | Past grace |", "|---|---|---|---|---|---|"]
        lines += [f"| {g['site']} | `{g['slug']}` | {EXPLAIN[g['stage']]} | {g['signedAt']} | {g['shown']} | "
                  f"{'yes' if g['late'] else 'no'} |" for g in report["gaps"]]
    if report["red"]:
        lines += ["", "**Needs the owner:**", *[f"- {r}" for r in report["red"]]]
    return "\n".join(lines) + "\n"


def _token():
    for name in ("GITHUB_TOKEN", "GH_TOKEN"):
        if os.environ.get(name):
            return os.environ[name]
    try:
        out = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=20)
        return out.stdout.strip() if out.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def main(argv=None, world=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, help="write the JSON report here")
    args = parser.parse_args(argv)
    try:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        sites = [s for s in config.get("sites", []) if s.get("baseUrl") and s.get("name")]
        if len(sites) < 2:
            raise CouldNotCheck("maintenance_config.json does not name both learner sites")
        if world is None:
            token = _token()
            if not token:
                raise CouldNotCheck("no GitHub token (GITHUB_TOKEN, GH_TOKEN or `gh auth login`)")
            world = World(os.environ.get("GITHUB_REPOSITORY") or DEFAULT_REPO, token)
        main_ledger = json.loads((ROOT / LEDGER_PATH).read_text(encoding="utf-8"))
        report = check(world, sites, main_ledger)
    except (CouldNotCheck, OSError, ValueError, KeyError) as exc:
        print(f"attestation delivery: COULD NOT CHECK — {exc}", file=sys.stderr)
        return 2
    text = render(report)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(text)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 1 if report["red"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
