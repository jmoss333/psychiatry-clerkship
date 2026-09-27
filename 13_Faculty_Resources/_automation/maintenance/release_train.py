#!/usr/bin/env python3
"""Promote the newest fully-green main commit to the `release` branch.

WHY THIS EXISTS. Netlify bills every production deploy (15 credits, ~$0.10) no
matter how small the change, and the two learner sites (une-ms3-psychiatry,
mmc-psychiatry-residents-sanford) used to publish from `main` -- so every merge
cost two deploys. 135 merges in the fortnight to 2026-09-24 = ~270 deploys,
~4,000 credits against a 3,000/month plan. Both sites now publish from
`release`, and this script moves `release` forward on a schedule (3x/day) or on
demand ("publish now"). Production deploys are capped by the schedule, not by
the merge rate. Plan: 13_Faculty_Resources/_automation/NETLIFY_COST_REDUCTION_PLAN.md B1.

WHAT IT PROMOTES. Only a FIRST-PARENT commit of origin/main whose required
checks both concluded `success` on the post-merge (push) run. If the newest
commit's CI is still running, cancelled or red, it walks back to the newest
green one, so a half-tested or failing tree is never published. It only ever
FAST-FORWARDS `release`; if `release` is not an ancestor of the target it
refuses rather than rewrite what learners were served.

THE SPEND TRIPWIRE. Netlify's auto-recharge has no ceiling -- only on or off --
and "off" can take the learner sites offline mid-rotation when credits run
out. So the cap lives here instead: before a SCHEDULED promotion, the train
counts billable production deploys on each of the five Netlify sites in the
last 24 hours and holds (exit 1, a red run that emails the owner) if publishing
would pass either budget: LEARNER_BUDGET_24H over the two sites the train
publishes, or ACCOUNT_BUDGET_24H over all five, a runaway ceiling. Steady state
is at most 6 learner deploys a day; the satellites deploy per merge, so a busy
day there is normal and is not the train's to hold. The pre-train pattern was
24+ per learner site on a busy merge day. A MANUAL
"publish now" is never blocked by cost -- a safety fix outranks $0.10 -- it
only records a warning. The guard does not see AI-inference or bandwidth
credits; those show only on the Netlify billing page.

Exit codes: 0 promoted, or nothing new to publish (also 0 -- no deploy, no
cost); 1 refused (no green commit in the window, not a fast-forward, or held
by the spend tripwire); 2 could not check (API/git failure, bad input, or a
scheduled run that could not read Netlify's deploy count).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REQUIRED_CHECKS = (
    "build-test-validate",
    "Smoke tests (nav crawl · faculty console · LFS · visual)",
)
RELEASE_BRANCH = "release"
MAIN_BRANCH = "main"
WINDOW = 40  # first-parent commits of main examined, newest first
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")

# The two sites the train publishes. They build from the whole repo, which is why
# check_netlify_deploy_health.SITES gives them no scope; the tests pin the two
# lists together.
LEARNER_SLUGS = ("une-ms3-psychiatry", "mmc-psychiatry-residents-sanford")
LEARNER_SITES = len(LEARNER_SLUGS)  # one promotion = one production deploy on each

# Two budgets over the trailing 24 hours, both checked before a SCHEDULED promotion.
# LEARNER: what the train itself controls. GitHub's cron drifts by minutes, so the
# window can hold all three previous slots; 10 = those 3 + one publish-now + this
# promotion, 2 deploys each. More than that means something other than the train is
# publishing the learner sites (the 2026-09-25 pattern: 25 each, per merge).
# ACCOUNT: a runaway anywhere, satellites included. The train cannot stop a
# satellite storm, but a held run is red and emails the owner, the only alarm short
# of the invoice. It sits well above the learner budget because the satellites
# deploy per merge: until 2026-09-27 a single all-sites budget of 12 was used, and
# an ordinary day of Interview Room work (8 satellite deploys) held the 09:05 slot
# with 14 green merges waiting. 24 x 15 credits = 360 credits/day at the ceiling.
LEARNER_BUDGET_24H = 10
ACCOUNT_BUDGET_24H = 24
SCHEDULE_HOURS_UTC = (9, 15, 21)
SCHEDULE_MINUTE_UTC = 5
REPO_ROOT = Path(__file__).resolve().parents[3]
DEPLOY_HEALTH = REPO_ROOT / "bin" / "check_netlify_deploy_health.py"


class CouldNotCheck(RuntimeError):
    """A fact the decision depends on could not be read."""


def _deploy_health_module():
    """bin/check_netlify_deploy_health.py owns the site list and the paginated,
    window-proving deploy fetch; reuse both rather than keep a second copy."""
    spec = importlib.util.spec_from_file_location("netlify_deploy_health", DEPLOY_HEALTH)
    if spec is None or spec.loader is None:
        raise CouldNotCheck(f"cannot load {DEPLOY_HEALTH.name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def is_billable(deploy) -> bool:
    """A production deploy that published or is on its way to publishing.

    Netlify bills production deploys only; previews, branch deploys and
    skipped/cancelled/failed builds (state "error") are free.
    """
    return (isinstance(deploy, dict)
            and deploy.get("context") == "production"
            and deploy.get("state") != "error")


def billable_deploy_snapshot_24h(token: str, now=None, fetch=None, sites=None) -> dict:
    """Return bounded counts and timestamps for billable deploys in 24 hours."""
    if not token:
        raise CouldNotCheck("NETLIFY_AUTH_TOKEN is not set")
    health = None
    if fetch is None or sites is None:
        health = _deploy_health_module()
    sites = sites if sites is not None else health.SITES
    now = now or datetime.now(timezone.utc)
    horizon = now - timedelta(hours=24)
    if fetch is None:
        def fetch(site_id, tok, since):
            try:
                return health._fetch(site_id, tok, since)
            except health.CheckerError as exc:
                raise CouldNotCheck(str(exc)) from exc
    if not sites:
        raise CouldNotCheck("no Netlify sites declared")
    counts = {}
    created_at = {}
    for site in sites:
        times = []
        for deploy in fetch(site["siteId"], token, horizon):
            created = _parse_time(deploy.get("created_at")) if isinstance(deploy, dict) else None
            if (
                created is not None
                and horizon <= created <= now
                and is_billable(deploy)
            ):
                times.append(created)
        times.sort()
        counts[site["slug"]] = len(times)
        created_at[site["slug"]] = times
    return {"counts": counts, "createdAt": created_at}


def billable_deploys_24h(token: str, now=None, fetch=None, sites=None) -> dict:
    """Return {site slug: billable production deploys created in the last 24 h}."""
    return billable_deploy_snapshot_24h(
        token,
        now=now,
        fetch=fetch,
        sites=sites,
    )["counts"]


def _parse_time(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _read_full_counts(read_counts) -> dict:
    counts = read_counts()
    missing = [slug for slug in LEARNER_SLUGS if slug not in counts]
    if missing:
        # A partial count reads as "learner sites quiet" -- the one answer that
        # would wave through the storm the learner budget exists to catch.
        raise CouldNotCheck(f"deploy count has no entry for {', '.join(missing)}")
    return counts


def _next_train_slots(now):
    """Yield future configured release-train slots in UTC."""
    now = _as_utc_datetime(now)
    for day_offset in range(0, 8):
        day = now + timedelta(days=day_offset)
        for hour in SCHEDULE_HOURS_UTC:
            candidate = day.replace(
                hour=hour,
                minute=SCHEDULE_MINUTE_UTC,
                second=0,
                microsecond=0,
            )
            if candidate > now:
                yield candidate


def _as_utc_datetime(value):
    if not isinstance(value, datetime):
        raise CouldNotCheck("deploy time is malformed")
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _snapshot_counts_at(snapshot, candidate):
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("createdAt"), dict):
        raise CouldNotCheck("deploy history is malformed")
    candidate = _as_utc_datetime(candidate)
    horizon = candidate - timedelta(hours=24)
    counts = {}
    for slug, values in snapshot["createdAt"].items():
        if not isinstance(slug, str) or not isinstance(values, list):
            raise CouldNotCheck("deploy history is malformed")
        parsed = [_as_utc_datetime(value) for value in values]
        counts[slug] = sum(horizon <= value <= candidate for value in parsed)
    _read_full_counts(lambda: counts)
    return counts


def next_eligible_publish_at(
    snapshot,
    *,
    now,
    learner_budget=LEARNER_BUDGET_24H,
    account_budget=ACCOUNT_BUDGET_24H,
):
    """First future train slot that fits, assuming no additional deploys."""
    for candidate in _next_train_slots(now):
        counts = _snapshot_counts_at(snapshot, candidate)
        learner = sum(counts[slug] for slug in LEARNER_SLUGS)
        total = sum(counts.values())
        if (
            learner + LEARNER_SITES <= learner_budget
            and total + LEARNER_SITES <= account_budget
        ):
            return candidate
    raise CouldNotCheck("no eligible release-train slot found in the projection window")


def protective_hold_receipt(
    snapshot,
    *,
    now,
    learner_budget=LEARNER_BUDGET_24H,
    account_budget=ACCOUNT_BUDGET_24H,
):
    """Bounded explanation of a spend hold for the heartbeat receipt."""
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("counts"), dict):
        raise CouldNotCheck("deploy snapshot is malformed")
    counts = _read_full_counts(lambda: snapshot["counts"])
    observed = _as_utc_datetime(now)
    projected_counts = _snapshot_counts_at(snapshot, observed)
    if counts != projected_counts:
        raise CouldNotCheck("deploy counts do not match deploy history")
    learner = sum(counts[slug] for slug in LEARNER_SLUGS)
    total = sum(counts.values())
    triggered = []
    if learner + LEARNER_SITES > learner_budget:
        triggered.append("learnerSites")
    if total + LEARNER_SITES > account_budget:
        triggered.append("allSites")
    if not triggered:
        raise CouldNotCheck("spend snapshot does not describe a protective hold")
    eligible = next_eligible_publish_at(
        snapshot,
        now=observed,
        learner_budget=learner_budget,
        account_budget=account_budget,
    )
    return {
        "reason": "spend_tripwire",
        "observedAt": observed.isoformat(timespec="seconds"),
        "nextEligiblePublishAt": eligible.isoformat(timespec="seconds"),
        "observedDeploys": {"learnerSites": learner, "allSites": total},
        "projectedDeploys": {
            "learnerSites": learner + LEARNER_SITES,
            "allSites": total + LEARNER_SITES,
        },
        "budgets": {
            "learnerSites": learner_budget,
            "allSites": account_budget,
        },
        "triggeredBudgets": triggered,
    }


def spend_gate(event_name: str, read_counts,
               learner_budget: int = LEARNER_BUDGET_24H,
               account_budget: int = ACCOUNT_BUDGET_24H):
    """Decide whether a promotion may proceed on cost grounds.

    Returns (proceed, lines). Scheduled (and local) runs are strict: over either
    budget holds, and an unreadable or partial count raises CouldNotCheck. A
    manual publish-now always proceeds and only records what it saw.
    """
    manual = event_name == "workflow_dispatch"
    try:
        counts = _read_full_counts(read_counts)
    except CouldNotCheck as exc:
        if manual:
            return True, [f"- WARNING: spend tripwire could not read Netlify ({exc}); "
                          "publishing anyway because this is a manual publish-now"]
        raise
    learner = sum(counts[slug] for slug in LEARNER_SLUGS)
    total = sum(counts.values())
    busy = ", ".join(f"{slug} {n}" for slug, n in counts.items() if n)
    lines = [f"- Netlify production deploys in the last 24 h: learner sites {learner} of "
             f"{learner_budget}, all five sites {total} of {account_budget}"
             + (f" ({busy})" if busy else "")]
    held = []
    if learner + LEARNER_SITES > learner_budget:
        held.append(f"- HELD by the spend tripwire: this publish would make it "
                    f"{learner + LEARNER_SITES} learner-site deploys in 24 h, over the budget "
                    f"of {learner_budget}. The train allows three slots a day, so something "
                    "else is publishing the learner sites -- check their Netlify deploy list "
                    "and which branch each site builds from.")
    if total + LEARNER_SITES > account_budget:
        held.append(f"- HELD by the spend tripwire: this publish would make it "
                    f"{total + LEARNER_SITES} production deploys across all five sites in "
                    f"24 h, over the runaway ceiling of {account_budget}. Look at the busiest "
                    "site above.")
    if not held:
        return True, lines
    if manual:
        lines.append("- WARNING: over the deploy budget; publishing anyway because this "
                     "is a manual publish-now")
        print(f"::warning title=Spend tripwire::learner sites {learner}/{learner_budget}, "
              f"all sites {total}/{account_budget} production deploys in 24 h; "
              "manual publish went ahead")
        return True, lines
    lines.extend(held)
    lines.append("- The next slot retries automatically; Run workflow publishes now regardless.")
    return False, lines


def git(*args: str) -> str:
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise CouldNotCheck(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def check_conclusions(repository: str, sha: str, token: str, fetch=None) -> dict:
    """Return {check name: conclusion} for the required checks on `sha`.

    When a check ran more than once on the same commit (a re-run), the newest
    run wins. A missing check maps to None, never to success.
    """
    fetch = fetch or _fetch_json
    url = f"https://api.github.com/repos/{repository}/commits/{sha}/check-runs?per_page=100"
    payload = fetch(url, token)
    runs = payload.get("check_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list):
        raise CouldNotCheck(f"check-runs for {sha[:7]} unreadable")
    newest: dict = {}
    for run in runs:
        name = run.get("name")
        if name not in REQUIRED_CHECKS:
            continue
        started = run.get("started_at") or ""
        if name not in newest or started > newest[name][0]:
            newest[name] = (started, run.get("conclusion"))
    return {name: newest.get(name, (None, None))[1] for name in REQUIRED_CHECKS}


def is_green(conclusions: dict) -> bool:
    return all(conclusions.get(name) == "success" for name in REQUIRED_CHECKS)


def choose_target(candidates, conclusions_for):
    """Newest candidate (newest-first list) whose required checks are all success.

    Returns (sha, skipped) where skipped lists (sha, conclusions) for the newer
    commits passed over, so the log says WHY the newest merge did not ship.
    """
    skipped = []
    for sha in candidates:
        conclusions = conclusions_for(sha)
        if is_green(conclusions):
            return sha, skipped
        skipped.append((sha, conclusions))
    return None, skipped


def _fetch_json(url: str, token: str):
    request = Request(url, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "psychiatry-clerkship-release-train/1",
    })
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read(4_000_000))
    except (HTTPError, URLError, OSError, ValueError) as exc:
        raise CouldNotCheck(f"GitHub API read failed: {exc}") from exc


def _emit(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"{key}={value}\n")


def _summary(lines) -> None:
    text = "\n".join(lines)
    print(text)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")


def run(repository: str, token: str, *, dry_run: bool, reason: str,
        event_name: str = "", netlify_token: str = "", read_counts=None,
        read_snapshot=None, receipt=None, now=None) -> int:
    receipt = receipt if isinstance(receipt, dict) else {}
    observed_at = _as_utc_datetime(now or datetime.now(timezone.utc))
    if not REPO_RE.fullmatch(repository or ""):
        raise CouldNotCheck("repository must be owner/name")
    if not token:
        raise CouldNotCheck("GITHUB_TOKEN is required to read check runs")
    git("fetch", "--quiet", "origin",
        f"+refs/heads/{MAIN_BRANCH}:refs/remotes/origin/{MAIN_BRANCH}",
        f"+refs/heads/{RELEASE_BRANCH}:refs/remotes/origin/{RELEASE_BRANCH}")
    release_sha = git("rev-parse", f"origin/{RELEASE_BRANCH}")
    receipt["releaseSha"] = release_sha
    candidates = git("rev-list", "--first-parent", f"--max-count={WINDOW}",
                     f"origin/{MAIN_BRANCH}").split()
    if not candidates or not all(SHA_RE.fullmatch(sha) for sha in candidates):
        raise CouldNotCheck("could not list main's first-parent commits")

    target, skipped = choose_target(
        candidates, lambda sha: check_conclusions(repository, sha, token))
    lines = [f"## Release train{' (dry run)' if dry_run else ''}",
             f"- release is at `{release_sha[:7]}`"]
    if reason:
        lines.append(f"- reason given: {reason}")
    for sha, conclusions in skipped:
        state = ", ".join(f"{k.split(' ')[0]}={v}" for k, v in conclusions.items())
        lines.append(f"- passed over `{sha[:7]}` (not fully green: {state})")
    if target is None:
        lines.append(f"- REFUSED: no fully green commit among main's last {WINDOW}")
        _summary(lines)
        _emit("promoted", "false")
        receipt["outcome"] = "refused"
        return 1
    receipt["targetSha"] = target
    if target == release_sha or subprocess.run(
            ["git", "merge-base", "--is-ancestor", target, release_sha]).returncode == 0:
        lines.append(f"- nothing new to publish (newest green `{target[:7]}` is already live)")
        _summary(lines)
        _emit("promoted", "false")
        receipt["outcome"] = "nothing_to_publish"
        return 0
    if subprocess.run(["git", "merge-base", "--is-ancestor", release_sha, target]).returncode != 0:
        lines.append(f"- REFUSED: `{target[:7]}` does not fast-forward `{release_sha[:7]}`")
        _summary(lines)
        _emit("promoted", "false")
        receipt["outcome"] = "refused"
        return 1
    snapshot = None
    try:
        if read_snapshot is not None:
            snapshot = read_snapshot()
            if not isinstance(snapshot, dict) or not isinstance(snapshot.get("counts"), dict):
                raise CouldNotCheck("deploy snapshot is malformed")
            current_counts = snapshot["counts"]
        elif read_counts is not None:
            current_counts = _read_full_counts(read_counts)
        else:
            snapshot = billable_deploy_snapshot_24h(
                netlify_token,
                now=observed_at,
            )
            current_counts = snapshot["counts"]
        proceed, spend_lines = spend_gate(event_name, lambda: current_counts)
    except CouldNotCheck as exc:
        lines.append(f"- NOT PUBLISHED: the spend tripwire could not read Netlify ({exc}); "
                     "a scheduled publish never goes ahead blind. Run workflow publishes now.")
        _summary(lines)
        _emit("promoted", "false")
        receipt["outcome"] = "could_not_check"
        return 2
    lines.extend(spend_lines)
    if not proceed:
        try:
            if snapshot is None:
                raise CouldNotCheck("deploy history is unavailable")
            receipt["protectiveHold"] = protective_hold_receipt(
                snapshot,
                now=observed_at,
            )
        except CouldNotCheck as exc:
            lines.append(f"- Hold receipt unavailable: {exc}")
            receipt["outcome"] = "could_not_check"
            _summary(lines)
            _emit("promoted", "false")
            return 2
        receipt["outcome"] = "held"
        _summary(lines)
        _emit("promoted", "false")
        return 1
    count = git("rev-list", "--count", "--first-parent", f"{release_sha}..{target}")
    lines.append(f"- promoting `{target[:7]}` ({count} merge(s) since the last publish)")
    if not dry_run:
        git("push", "origin", f"{target}:refs/heads/{RELEASE_BRANCH}")
        lines.append("- pushed; Netlify now builds both learner sites once")
    _summary(lines)
    _emit("promoted", "false" if dry_run else "true")
    _emit("sha", target)
    receipt["outcome"] = "dry_run" if dry_run else "promoted"
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reason", default=os.environ.get("RELEASE_REASON", ""))
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    observed_at = datetime.now(timezone.utc)
    raw_run_id = os.environ.get("GITHUB_RUN_ID", "")
    run_id = int(raw_run_id) if raw_run_id.isdigit() and int(raw_run_id) > 0 else None
    receipt = {
        "schemaVersion": 1,
        "workflowFile": "production-release-train.yml",
        "runId": run_id,
        "generatedAt": observed_at.isoformat(timespec="seconds"),
        "outcome": "could_not_check",
    }
    try:
        code = run(args.repository, os.environ.get("GITHUB_TOKEN", ""),
                   dry_run=args.dry_run, reason=args.reason.strip()[:200],
                   event_name=os.environ.get("GITHUB_EVENT_NAME", ""),
                   netlify_token=os.environ.get("NETLIFY_AUTH_TOKEN", ""),
                   receipt=receipt, now=observed_at)
    except CouldNotCheck as exc:
        print(f"release train: could not check -- {exc}", file=sys.stderr)
        _emit("promoted", "false")
        code = 2
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except OSError as exc:
        print(f"release train: receipt write failed -- {exc}", file=sys.stderr)
        return 2
    return code


if __name__ == "__main__":
    sys.exit(main())
