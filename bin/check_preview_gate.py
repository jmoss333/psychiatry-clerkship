#!/usr/bin/env python3
"""Every Netlify preview that main REQUIRES must be one Netlify can actually BUILD.

THE INCIDENT (2026-09-25). #802 moved the two learner sites' production branch from `main` to
`release` (the release train) and set their branch deploys to `release` only. Netlify builds a
Deploy Preview only for a pull request whose BASE branch is the site's production branch or one
of its branch-deploy branches, and every PR here targets `main`. So from ~04:37Z no PR received
a learner-site preview -- while main's ruleset still REQUIRED
`netlify/une-ms3-psychiatry/deploy-preview` and `netlify/mmc-psychiatry-residents-sanford/
deploy-preview`. Every PR sat BLOCKED with all its own checks green, and nothing said why.
It surfaced seven hours later, on the next PR anyone tried to land (#805). Fixed at 13:05Z by
adding `main` as a branch-deploy branch on both sites (free: previews and branch deploys cost
0 credits).

Neither existing guard could see it. check_ruleset_drift.py pins what main REQUIRES -- and the
ruleset had not changed. check_netlify_deploy_health.py reads PRODUCTION deploys -- and
production was fine. The break lived in the gap between the two: a requirement one system
holds that another system has silently stopped being able to meet.

WHAT THIS CHECKS, two independent ways, because either alone can be fooled:

  1. SETTINGS (predictive -- rings before any PR is stuck). For every required status check
     named `netlify/<site>/deploy-preview` in main's ruleset, the site must
       - be one this repository tracks (SITES in check_netlify_deploy_health.py),
       - be git-linked to this repository,
       - not have builds stopped (`stop_builds`),
       - not have Deploy Previews switched off (`skip_prs`),
       - accept a PR whose base is the protected branch: it is the production branch
         (`repo_branch`), or a branch-deploy branch (`allowed_branches` names it or a
         matching `prefix*`, or is empty -- which is Netlify's "All").
     The ruleset is read from the committed fixture, not the API: check_ruleset_drift.py
     already fails the daily heartbeat whenever that fixture and the live ruleset differ, so
     "the fixture's requirements" and "main's requirements" are the same set on any green day,
     and this check needs no GitHub token.
     Field meanings follow Netlify's own Terraform provider
     (internal/provider/site_build_settings_resource.go): an empty or null `allowed_branches`
     is "Branch deploys: All"; `skip_prs` true is "Deploy Previews: None".

  2. EVIDENCE (catches causes no setting shows -- an uninstalled GitHub App, a dead webhook, a
     field whose meaning Netlify changes). The sibling sites build a preview for every PR into
     main. So a PR that got a preview on any sibling more than GRACE ago must have a preview
     record -- in ANY state, since a failed build is the PR's problem, not the gate's -- on
     every required site. A missing one is exactly the symptom of 2026-09-25.

HOW IT RUNS. Inside bin/check_netlify_deploy_health.py, the daily steward
(maintenance-production-canary.yml, 09:20 UTC), which already holds NETLIFY_AUTH_TOKEN and
already pages every deploy -- previews included -- for the lookback window. So this adds five
site reads and no workflow change. A failure makes that step fail, which the automation-failure
escalation issue reports.

EXIT CODES (standalone): 0 every required preview can be built and none is missing; 1 a
required preview cannot be built or is missing; 2 could not determine (no token, transport,
unreadable ruleset, or a required site whose settings could not be read). Never a quiet pass.

USAGE
  python3 bin/check_preview_gate.py                # standalone; reads NETLIFY_AUTH_TOKEN
  python3 bin/check_preview_gate.py --self-test    # offline; replays the 2026-09-25 settings
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
RULESET_FIXTURE = (
    REPO_ROOT / "13_Faculty_Resources" / "_automation" / "maintenance" / "fixtures" / "ruleset-main.json"
)
REPOSITORY = "jmoss333/psychiatry-clerkship"
DEFAULT_BRANCH = "main"
API_ROOT = "https://api.netlify.com/api/v1"
TIMEOUT_SECONDS = 20
DEFAULT_LOOKBACK_HOURS = 36
# A preview record appears the moment Netlify accepts the webhook, long before the build
# finishes, so an hour is generous. Inside it a missing record is "not yet", not "never".
GRACE_MINUTES = 60
REQUIRED_PREVIEW = re.compile(r"^netlify/(?P<site>[A-Za-z0-9-]+)/deploy-preview$")


class GateError(RuntimeError):
    """The check could not determine the answer. Never a pass."""


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


def load_ruleset(path=RULESET_FIXTURE):
    try:
        ruleset = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GateError("cannot read the ruleset fixture %s: %s" % (path, exc)) from exc
    if not isinstance(ruleset, dict):
        raise GateError("the ruleset fixture is not an object")
    return ruleset


def protected_branches(ruleset):
    """The concrete branch names the ruleset protects. A pattern we cannot resolve raises:
    guessing which branches a PR may target is how a check ends up checking the wrong one."""
    include = (((ruleset.get("conditions") or {}).get("ref_name") or {}).get("include"))
    if not isinstance(include, list) or not include:
        raise GateError("the ruleset names no branches (conditions.ref_name.include)")
    branches = []
    for ref in include:
        if ref == "~DEFAULT_BRANCH":
            branches.append(DEFAULT_BRANCH)
        elif isinstance(ref, str) and ref.startswith("refs/heads/") and not any(c in ref for c in "*?["):
            branches.append(ref[len("refs/heads/"):])
        else:
            raise GateError("cannot resolve the ruleset branch pattern %r" % (ref,))
    return sorted(set(branches))


def required_preview_sites(ruleset):
    """Site names from every required status check shaped netlify/<site>/deploy-preview."""
    if ruleset.get("enforcement") not in ("active", "evaluate", "disabled"):
        raise GateError("the ruleset has no recognised enforcement value")
    if ruleset.get("enforcement") != "active":
        return []  # a ruleset that is not enforced requires nothing of anyone
    contexts = []
    for rule in ruleset.get("rules") or []:
        if not isinstance(rule, dict) or rule.get("type") != "required_status_checks":
            continue
        checks = (rule.get("parameters") or {}).get("required_status_checks")
        if not isinstance(checks, list):
            raise GateError("a required_status_checks rule has no check list")
        for check in checks:
            context = check.get("context") if isinstance(check, dict) else None
            if not isinstance(context, str):
                raise GateError("a required status check has no context")
            contexts.append(context)
    sites = []
    for context in contexts:
        match = REQUIRED_PREVIEW.match(context)
        if match and match.group("site") not in sites:
            sites.append(match.group("site"))
    return sites


def base_is_deployable(build_settings, base):
    """(True, why) when Netlify will build a Deploy Preview for a PR whose base is `base`."""
    production = build_settings.get("repo_branch")
    allowed = build_settings.get("allowed_branches")
    if production == base:
        return True, "%r is its production branch" % base
    if allowed is None or (isinstance(allowed, list) and not allowed):
        return True, "its branch deploys are 'All'"
    if not isinstance(allowed, list):
        return False, "its branch-deploy list is unreadable (%r)" % (allowed,)
    for entry in allowed:
        if not isinstance(entry, str):
            continue
        if entry == base or (entry.endswith("*") and base.startswith(entry[:-1])):
            return True, "%r is a branch-deploy branch (%s)" % (base, entry)
    return False, "its production branch is %r and its branch deploys are only %s" % (
        production, ", ".join(repr(e) for e in allowed) or "none")


def describe(build_settings):
    allowed = build_settings.get("allowed_branches")
    branches = "All" if not allowed else ", ".join(str(e) for e in allowed)
    return "production %r; branch deploys %s; previews %s" % (
        build_settings.get("repo_branch"), branches,
        "off" if build_settings.get("skip_prs") is True else "on")


def settings_findings(slug, site, bases, repository=REPOSITORY):
    """Why this site cannot produce the preview main requires. Empty list = it can."""
    check = "netlify/%s/deploy-preview" % slug
    fix = ("Netlify > %s > Project configuration > Build & deploy > Branches and deploy contexts"
           % slug)
    if not isinstance(site, dict):
        return [{"site": slug, "kind": "site_unreadable", "check": check,
                 "detail": "Netlify returned no site record"}]
    build = site.get("build_settings")
    if not isinstance(build, dict) or not build.get("repo_url"):
        return [{"site": slug, "kind": "not_git_linked", "check": check,
                 "detail": "the site is not linked to a repository, so no PR can build a preview"}]
    findings = []
    repo_url = str(build.get("repo_url")).rstrip("/")
    if not repo_url.lower().endswith("/" + repository.lower()):
        findings.append({"site": slug, "kind": "linked_to_other_repo", "check": check,
                         "detail": "the site builds %s, not %s" % (repo_url, repository)})
    if build.get("stop_builds") is True:
        findings.append({"site": slug, "kind": "builds_stopped", "check": check,
                         "detail": "builds are stopped on this site, so no preview is ever built. "
                                   "Fix: %s > Build settings > Activate builds" % slug})
    if build.get("skip_prs") is True:
        findings.append({"site": slug, "kind": "previews_disabled", "check": check,
                         "detail": "Deploy Previews are switched off. Fix: %s > Deploy Previews" % fix})
    for base in bases:
        ok, why = base_is_deployable(build, base)
        if not ok:
            findings.append({
                "site": slug, "kind": "base_branch_not_deployable", "check": check, "base": base,
                "detail": ("PRs into %s get no preview here: %s. %s requires %s, so every PR "
                           "into %s will wait on it forever. Fix (free): %s > Branch deploys > "
                           "add %r -- or drop the check from the ruleset."
                           % (base, why, base, check, base, fix, base)),
            })
    return findings


def evidence(required, deploys_by_site, deployable_siblings, now,
             lookback_hours=DEFAULT_LOOKBACK_HOURS, grace_minutes=GRACE_MINUTES):
    """PRs that got a preview on a sibling but none on a required site.

    `deploys_by_site` maps slug -> the deploy records already fetched for the window.
    `deployable_siblings` are the non-required sites whose own settings accept PRs into the
    protected branch -- only their previews prove a PR existed that the gate should have seen.
    Returns (findings, summary).
    """
    horizon = now - timedelta(hours=lookback_hours)
    cutoff = now - timedelta(minutes=grace_minutes)
    seen = {}  # PR number -> earliest sibling preview time
    for slug in deployable_siblings:
        for deploy in deploys_by_site.get(slug) or []:
            if not isinstance(deploy, dict) or deploy.get("context") != "deploy-preview":
                continue
            number = deploy.get("review_id")
            created = _parse_time(deploy.get("created_at"))
            if not isinstance(number, int) or created is None:
                continue
            if horizon <= created <= cutoff:
                seen[number] = min(created, seen.get(number, created))
    findings = []
    for slug in required:
        previewed = {
            d.get("review_id") for d in deploys_by_site.get(slug) or []
            if isinstance(d, dict) and d.get("context") == "deploy-preview"
        }
        missing = sorted(number for number in seen if number not in previewed)
        if missing:
            findings.append({
                "site": slug, "kind": "preview_missing",
                "check": "netlify/%s/deploy-preview" % slug, "pullRequests": missing,
                "detail": ("PR%s %s got previews on other sites but none here, so %s cannot "
                           "report and %s cannot merge. Something outside the settings stopped "
                           "this site building PR previews (GitHub App, webhook, or a setting "
                           "this check does not know)."
                           % ("s" if len(missing) > 1 else "",
                              ", ".join("#%d" % n for n in missing),
                              "netlify/%s/deploy-preview" % slug,
                              "they" if len(missing) > 1 else "it")),
            })
    summary = {
        "pullRequestsSeen": len(seen),
        "siblingsUsed": sorted(deployable_siblings),
        "graceMinutes": grace_minutes,
        "lookbackHours": lookback_hours,
    }
    return findings, summary


def evaluate(ruleset, site_records, tracked_slugs, now, deploys_by_site=None,
             lookback_hours=DEFAULT_LOOKBACK_HOURS):
    """Pure: ruleset + site settings (+ deploy records) in, verdict out. No network, no clock.

    `site_records` maps every tracked slug to its Netlify site record. A tracked site with no
    record means it was never read -- that is "could not determine", never a pass.
    Returns a report dict whose `status` is "success" or "failed".
    """
    bases = protected_branches(ruleset)
    required = required_preview_sites(ruleset)
    unread = [slug for slug in tracked_slugs if slug not in site_records]
    if unread:
        raise GateError("settings were not read for %s" % ", ".join(unread))
    # A record with no build_settings object at all is what Netlify returns to a caller that
    # cannot see the site's configuration (observed 2026-09-25 with an unauthenticated read):
    # the settings were not SEEN, which is "could not determine" -- not "not linked", which
    # would send the reader to fix a repository link that is fine.
    unseen = [slug for slug in tracked_slugs
              if isinstance(site_records[slug], dict)
              and not isinstance(site_records[slug].get("build_settings"), dict)]
    if unseen:
        raise GateError("Netlify returned no build settings for %s -- does the token have "
                        "access to these sites?" % ", ".join(unseen))

    findings = []
    sites = []
    for slug in required:
        if slug not in tracked_slugs:
            findings.append({
                "site": slug, "kind": "untracked_required_site",
                "check": "netlify/%s/deploy-preview" % slug,
                "detail": ("%s requires a preview from %s, which is not in SITES "
                           "(bin/check_netlify_deploy_health.py), so nothing reads its settings. "
                           "Add it there." % ("/".join(bases), slug)),
            })
            continue
        site_findings = settings_findings(slug, site_records[slug], bases)
        findings.extend(site_findings)
        build = (site_records[slug] or {}).get("build_settings") or {}
        sites.append({"slug": slug, "required": True, "buildable": not site_findings,
                      "settings": describe(build)})

    siblings = []
    for slug in tracked_slugs:
        if slug in required:
            continue
        build = (site_records[slug] or {}).get("build_settings") or {}
        usable = not settings_findings(slug, site_records[slug], bases)
        if usable:
            siblings.append(slug)
        sites.append({"slug": slug, "required": False, "buildable": usable,
                      "settings": describe(build)})

    evidence_summary = None
    if deploys_by_site is not None:
        found, evidence_summary = evidence(
            [s for s in required if s in tracked_slugs], deploys_by_site, siblings, now,
            lookback_hours)
        findings.extend(found)

    return {
        "schemaVersion": 1,
        "status": "failed" if findings else "success",
        "checkedAt": now.isoformat(),
        "protectedBranches": bases,
        "requiredPreviewSites": required,
        # What this run looked at, so "clean" is never inferred from silence.
        "sitesDeclared": len(tracked_slugs),
        "sitesExamined": len(site_records),
        "sites": sites,
        "evidence": evidence_summary,
        "findings": findings,
    }


def fetch_site(site_id, token):
    url = "%s/sites/%s" % (API_ROOT, site_id)
    request = Request(url, headers={"Authorization": "Bearer %s" % token})
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise GateError("HTTP %s from %s" % (response.status, url))
            payload = response.read()
    except HTTPError as exc:  # pragma: no cover - network
        raise GateError("HTTP %s from %s" % (exc.code, url)) from exc
    except (URLError, TimeoutError, OSError) as exc:  # pragma: no cover - network
        raise GateError("transport failure for %s: %s" % (url, exc)) from exc
    try:
        record = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GateError("unparseable JSON from %s: %s" % (url, exc)) from exc
    if not isinstance(record, dict):
        raise GateError("expected a site object from %s" % url)
    return record


def check(token, now, tracked_sites, deploys_by_site=None, lookback_hours=DEFAULT_LOOKBACK_HOURS,
          ruleset_path=RULESET_FIXTURE, fetch=None):
    """The network half: read the ruleset and every tracked site's settings, then evaluate.

    `tracked_sites` is SITES from check_netlify_deploy_health.py (slug + siteId). Raises
    GateError when anything could not be read. `fetch` defaults to fetch_site, looked up at
    call time so a harness can substitute it.
    """
    fetch = fetch or fetch_site
    ruleset = load_ruleset(ruleset_path)
    records = {site["slug"]: fetch(site["siteId"], token) for site in tracked_sites}
    return evaluate(ruleset, records, [site["slug"] for site in tracked_sites], now,
                    deploys_by_site, lookback_hours)


def print_report(report, out=sys.stdout, err=sys.stderr):
    required = report["requiredPreviewSites"]
    print("preview-gate: %s requires %d Netlify preview(s)%s" % (
        "/".join(report["protectedBranches"]), len(required),
        (": " + ", ".join(required)) if required else ""), file=out)
    for site in report["sites"]:
        if site["required"]:
            print("  %-34s %s  (%s)" % (site["slug"], "buildable" if site["buildable"] else "CANNOT BUILD",
                                        site["settings"]), file=out)
    ev = report.get("evidence")
    if ev is not None:
        print("  evidence: %d PR(s) with sibling previews in the last %dh (siblings: %s)"
              % (ev["pullRequestsSeen"], ev["lookbackHours"], ", ".join(ev["siblingsUsed"]) or "none"),
              file=out)
    if report["status"] == "success":
        print("preview-gate: clean (%d required site(s) buildable; %d of %d site(s) read)" % (
            len(required), report["sitesExamined"], report["sitesDeclared"]), file=out)
        return
    print("preview-gate: %d finding(s)" % len(report["findings"]), file=err)
    for finding in report["findings"]:
        print("  %s  %s  %s" % (finding["site"], finding["kind"], finding["detail"]), file=err)


def _health():
    """check_netlify_deploy_health.py owns SITES and the paged deploy fetch. Imported lazily
    because that tool imports this one for its daily run."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import check_netlify_deploy_health as health  # noqa: E402
    return health


def _collect(token, now, lookback_hours):
    """Standalone run: read every tracked site's deploys, then settings, then evaluate."""
    health = _health()
    horizon = now - timedelta(hours=lookback_hours)
    try:
        deploys = {site["slug"]: health._fetch(site["siteId"], token, horizon) for site in health.SITES}
    except health.CheckerError as exc:
        raise GateError(str(exc)) from exc
    return check(token, now, health.SITES, deploys, lookback_hours)


def _write(path, payload):
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def _self_test():
    now = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)
    checks = []

    def expect(label, condition):
        checks.append((label, bool(condition)))

    repo_url = "https://github.com/%s" % REPOSITORY

    def site(repo_branch="main", allowed=("main",), **extra):
        build = {"repo_url": repo_url, "repo_branch": repo_branch,
                 "allowed_branches": list(allowed) if allowed is not None else None,
                 "skip_prs": None, "stop_builds": False}
        build.update(extra)
        return {"build_settings": build}

    ruleset = {
        "enforcement": "active",
        "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
        "rules": [{"type": "required_status_checks", "parameters": {"required_status_checks": [
            {"context": "build-test-validate"},
            {"context": "netlify/une-ms3-psychiatry/deploy-preview"},
            {"context": "netlify/mmc-psychiatry-residents-sanford/deploy-preview"},
        ]}}],
    }
    learners = ["une-ms3-psychiatry", "mmc-psychiatry-residents-sanford"]
    tracked = learners + ["sp-interview-proxy", "clerkship-faculty-attest", "psychiatry-workforce-tour"]
    siblings = {slug: site() for slug in tracked[2:]}

    # --- THE INCIDENT, replayed with the real 2026-09-25 settings (API snapshot 13:04Z,
    # before the fix): production 'release', branch deploys ['release'] ("only the
    # production branch"), previews on.
    before = dict(siblings, **{slug: site("release", ["release"]) for slug in learners})
    report = evaluate(ruleset, before, tracked, now)
    kinds = sorted((f["site"], f["kind"]) for f in report["findings"])
    expect("the 2026-09-25 settings ARE a finding, on both learner sites",
           kinds == sorted((s, "base_branch_not_deployable") for s in learners))
    expect("the finding says why and how to fix it",
           all("'release'" in f["detail"] and "add 'main'" in f["detail"] for f in report["findings"]))
    expect("the verdict is failed", report["status"] == "failed")

    # --- THE FIX, as applied at 13:05Z: 'main' added as a branch-deploy branch.
    after = dict(siblings, **{slug: site("release", ["release", "main"]) for slug in learners})
    report = evaluate(ruleset, after, tracked, now)
    expect("the fixed settings are clean", report["status"] == "success" and not report["findings"])
    expect("a clean report states its coverage",
           report["sitesExamined"] == 5 and report["sitesDeclared"] == 5
           and report["requiredPreviewSites"] == learners)

    def one(record, bases=("main",)):
        return [f["kind"] for f in settings_findings("s", record, list(bases))]

    expect("production branch == base is buildable", one(site("main", ["main"])) == [])
    expect("empty branch-deploy list is Netlify's 'All'", one(site("release", [])) == [])
    expect("null branch-deploy list is Netlify's 'All'", one(site("release", None)) == [])
    expect("a matching prefix* entry is buildable", one(site("release", ["release", "ma*"])) == [])
    expect("a non-matching prefix* entry is not", one(site("release", ["release", "feature/*"]))
           == ["base_branch_not_deployable"])
    expect("previews switched off is a finding", one(site(skip_prs=True)) == ["previews_disabled"])
    expect("skip_prs false/None is previews on",
           one(site(skip_prs=False)) == [] and one(site(skip_prs=None)) == [])
    expect("stopped builds are a finding", one(site(stop_builds=True)) == ["builds_stopped"])
    expect("a site linked to another repo is a finding",
           one(site(repo_url="https://github.com/someone/else")) == ["linked_to_other_repo"])
    expect("an unlinked site is a finding", one({"build_settings": {}}) == ["not_git_linked"])
    expect("a missing site record is a finding", one(None) == ["site_unreadable"])

    # --- The ruleset side. Anything it cannot resolve is "could not determine".
    def raises(fn):
        try:
            fn()
        except GateError:
            return True
        return False

    expect("~DEFAULT_BRANCH resolves to main", protected_branches(ruleset) == ["main"])
    expect("refs/heads/<name> resolves to <name>", protected_branches(
        {"conditions": {"ref_name": {"include": ["refs/heads/release"]}}}) == ["release"])
    expect("a branch pattern cannot be guessed", raises(lambda: protected_branches(
        {"conditions": {"ref_name": {"include": ["refs/heads/*"]}}})))
    expect("no branches is undetermined", raises(lambda: protected_branches({})))
    expect("a check without a context is undetermined", raises(lambda: required_preview_sites(
        {"enforcement": "active", "rules": [{"type": "required_status_checks",
                                             "parameters": {"required_status_checks": [{}]}}]})))
    expect("a ruleset that is not enforced requires nothing",
           required_preview_sites(dict(ruleset, enforcement="disabled")) == [])
    expect("an unreadable ruleset is undetermined", raises(lambda: load_ruleset("/nonexistent/x.json")))
    untracked = evaluate(ruleset, siblings, tracked[2:], now)
    expect("a required site nobody tracks is a finding",
           sorted(f["kind"] for f in untracked["findings"]) == ["untracked_required_site"] * 2)
    expect("a tracked site whose settings were never read is undetermined",
           raises(lambda: evaluate(ruleset, siblings, tracked, now)))
    limited = dict(after, **{"une-ms3-psychiatry": {"name": "une-ms3-psychiatry", "url": "x"}})
    expect("a site record with no build settings (an unauthorised read) is undetermined, "
           "not 'not linked'", raises(lambda: evaluate(ruleset, limited, tracked, now)))

    # --- EVIDENCE: the symptom, independent of any setting. PR #805 got previews on the three
    # siblings three hours ago and none on the learner sites -- the exact 2026-09-25 picture.
    def preview(number, hours_ago, state="ready"):
        stamp = (now - timedelta(hours=hours_ago)).isoformat().replace("+00:00", "Z")
        return {"context": "deploy-preview", "review_id": number, "state": state, "created_at": stamp}

    stuck = {slug: [preview(805, 3)] for slug in tracked[2:]}
    stuck.update({slug: [] for slug in learners})
    # Settings that LOOK fine, so only the evidence can ring: proves the two are independent.
    report = evaluate(ruleset, after, tracked, now, stuck)
    missing = [f for f in report["findings"] if f["kind"] == "preview_missing"]
    expect("a PR previewed on siblings but not on a required site is a finding",
           sorted(f["site"] for f in missing) == sorted(learners)
           and all(f["pullRequests"] == [805] for f in missing))
    expect("the evidence rings even when the settings look right", report["status"] == "failed")
    expect("the evidence says how many PRs it saw", report["evidence"]["pullRequestsSeen"] == 1)

    ok = dict(stuck, **{slug: [preview(805, 3, state="error")] for slug in learners})
    expect("a required preview in ANY state counts (a failed build is the PR's problem)",
           evaluate(ruleset, after, tracked, now, ok)["status"] == "success")
    fresh = dict(stuck, **{slug: [preview(900, 0.2)] for slug in tracked[2:]})
    expect("inside the grace period a missing preview is 'not yet', not a finding",
           evaluate(ruleset, after, tracked, now, fresh)["status"] == "success")
    ancient = dict(stuck, **{slug: [preview(700, 72)] for slug in tracked[2:]})
    expect("a sibling preview outside the lookback is ignored",
           evaluate(ruleset, after, tracked, now, ancient)["status"] == "success")
    broken_siblings = dict(after, **{slug: site(stop_builds=True) for slug in tracked[2:]})
    report = evaluate(ruleset, broken_siblings, tracked, now, stuck)
    expect("siblings that cannot build PRs are not used as evidence",
           report["evidence"]["siblingsUsed"] == [] and not any(
               f["kind"] == "preview_missing" for f in report["findings"]))
    odd = {slug: [{"context": "deploy-preview", "review_id": "805", "created_at": "garbage"}]
           for slug in tracked[2:]}
    expect("records with no PR number or time are skipped, not trusted",
           evidence(learners, odd, tracked[2:], now)[1]["pullRequestsSeen"] == 0)
    expect("a quiet window is clean and says it saw nothing",
           evaluate(ruleset, after, tracked, now, {})["evidence"]["pullRequestsSeen"] == 0)

    # --- The REAL committed ruleset: it must parse, and every preview it requires must be
    # from a site this repository tracks. Runs on every push via verify.sh, so adding a
    # required Netlify check for a site nobody watches fails before it can strand a PR.
    try:
        real = load_ruleset()
        real_required = required_preview_sites(real)
        real_bases = protected_branches(real)
        tracked_real = [s["slug"] for s in _health().SITES]
        expect("the committed ruleset parses", True)
        expect("the committed ruleset protects a resolvable branch", bool(real_bases))
        expect("every preview the committed ruleset requires is from a tracked site: %s"
               % (", ".join(real_required) or "none"),
               all(slug in tracked_real for slug in real_required))
    except GateError as exc:
        expect("the committed ruleset parses (%s)" % exc, False)

    # --- main() end to end, with the network stubbed: never a quiet pass.
    import contextlib
    import io
    import tempfile

    module = sys.modules[__name__]
    real_collect, real_env = module._collect, os.environ.get("NETLIFY_AUTH_TOKEN")

    def run_main(token, collect):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "r.json"
            try:
                if token is None:
                    os.environ.pop("NETLIFY_AUTH_TOKEN", None)
                else:
                    os.environ["NETLIFY_AUTH_TOKEN"] = token
                module._collect = collect
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    code = main(["--out", str(out)])
                return code, json.loads(out.read_text(encoding="utf-8"))
            finally:
                module._collect = real_collect
                if real_env is None:
                    os.environ.pop("NETLIFY_AUTH_TOKEN", None)
                else:
                    os.environ["NETLIFY_AUTH_TOKEN"] = real_env

    def failing(*_):
        raise GateError("synthetic transport failure")

    code, receipt = run_main(None, lambda *_: evaluate(ruleset, after, tracked, now))
    expect("no token is exit 2, not a pass", code == 2 and receipt["status"] == "undetermined")
    code, receipt = run_main("t", failing)
    expect("an unreadable source is exit 2", code == 2 and "synthetic" in receipt["reason"])
    code, receipt = run_main("t", lambda *_: evaluate(ruleset, before, tracked, now))
    expect("the incident settings are exit 1", code == 1 and receipt["status"] == "failed")
    code, receipt = run_main("t", lambda *_: evaluate(ruleset, after, tracked, now, {}))
    expect("clean settings are exit 0", code == 0 and receipt["status"] == "success")

    failed = [label for label, passed in checks if not passed]
    for label, passed in checks:
        print("%s %s" % ("ok  " if passed else "FAIL", label))
    if failed:
        print("\nself-test FAILED: %d of %d" % (len(failed), len(checks)))
        return 1
    print("\nself-test passed: %d checks" % len(checks))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--hours", type=int, default=DEFAULT_LOOKBACK_HOURS)
    args = parser.parse_args(argv)
    if args.self_test:
        return _self_test()

    now = datetime.now(timezone.utc)
    token = os.environ.get("NETLIFY_AUTH_TOKEN", "").strip()
    if not token:
        print("preview-gate: COULD NOT DETERMINE — NETLIFY_AUTH_TOKEN is not set", file=sys.stderr)
        _write(args.out, {"schemaVersion": 1, "status": "undetermined",
                          "reason": "NETLIFY_AUTH_TOKEN is not set", "checkedAt": now.isoformat()})
        return 2
    try:
        report = _collect(token, now, args.hours)
    except GateError as exc:
        print("preview-gate: COULD NOT DETERMINE — %s" % exc, file=sys.stderr)
        _write(args.out, {"schemaVersion": 1, "status": "undetermined", "reason": str(exc),
                          "checkedAt": now.isoformat()})
        return 2
    _write(args.out, report)
    print_report(report)
    return 0 if report["status"] == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
