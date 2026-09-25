#!/usr/bin/env python3
"""Build and publish an exact-revision production release verification receipt.

The receipt is technical evidence only. It binds CI, both learner-site Netlify
deploys, served revision, the content-free production canary, and two focused
browser journeys to one full Git commit SHA. It never deploys or changes learner
content, and it does not imply faculty approval, clinical approval, or native
assistive-technology verification.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request

try:
    from . import production_canary
    from . import production_revision_parity
except ImportError:  # Direct workflow/CLI invocation.
    import production_canary
    import production_revision_parity


SCHEMA_VERSION = 1
SHA_RE = re.compile(r"[0-9a-f]{40}")
NETLIFY_DEPLOY_ID_RE = re.compile(r"[0-9a-f]{24}")
REPOSITORY_RE = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
GITHUB_API = "https://api.github.com"
NETLIFY_API = "https://api.netlify.com/api/v1"
MAX_JSON_BYTES = 16 * 1024 * 1024
COMMENT_MARKER_PREFIX = "<!-- production-release-verification:"
EXPECTED_JOURNEY_PROJECTS = ("release-ms3", "release-res")
VALID_STATUSES = {"PASS", "FAIL", "UNKNOWN"}
EXIT_BY_STATUS = {"PASS": 0, "FAIL": 1, "UNKNOWN": 2}


class ReceiptError(RuntimeError):
    """The receipt cannot be determined safely."""


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def validate_sha(value):
    if not isinstance(value, str) or SHA_RE.fullmatch(value) is None:
        raise ReceiptError("release SHA must be exactly 40 lowercase hexadecimal characters")
    return value


def validate_repository(value):
    if not isinstance(value, str) or REPOSITORY_RE.fullmatch(value) is None:
        raise ReceiptError("repository must be an owner/name pair")
    return value


def _integer(value, default=-1):
    return value if type(value) is int else default


def _group_status(statuses):
    values = list(statuses)
    if not values or any(value not in VALID_STATUSES for value in values):
        return "UNKNOWN"
    if "FAIL" in values:
        return "FAIL"
    if "UNKNOWN" in values:
        return "UNKNOWN"
    return "PASS"


def select_ci_evidence(payload, release_sha):
    """Select the newest post-merge CI run for exactly this main-branch SHA."""
    validate_sha(release_sha)
    runs = payload.get("workflow_runs") if isinstance(payload, dict) else None
    if not isinstance(runs, list):
        return {"status": "UNKNOWN", "runId": None, "error": "CI response is invalid"}
    candidates = [
        run for run in runs
        if isinstance(run, dict)
        and run.get("head_sha") == release_sha
        and run.get("head_branch") == "main"
        and run.get("event") == "push"
    ]
    if not candidates:
        return {
            "status": "UNKNOWN",
            "runId": None,
            "conclusion": None,
            "error": "no post-merge CI run found for the exact release SHA",
        }
    run = max(
        candidates,
        key=lambda item: (
            _integer(item.get("run_number")),
            _integer(item.get("run_attempt")),
            _integer(item.get("id")),
        ),
    )
    status = "UNKNOWN"
    if run.get("status") == "completed":
        status = "PASS" if run.get("conclusion") == "success" else "FAIL"
    return {
        "status": status,
        "runId": run.get("id"),
        "runNumber": run.get("run_number"),
        "runAttempt": run.get("run_attempt"),
        "workflowStatus": run.get("status"),
        "conclusion": run.get("conclusion"),
        "url": run.get("html_url"),
        "updatedAt": run.get("updated_at"),
    }


def select_deploy_evidence(site, deploys, release_sha):
    """Select the newest production deploy whose commit_ref is exactly release_sha."""
    validate_sha(release_sha)
    if not isinstance(site, dict) or not isinstance(deploys, list):
        return {"status": "UNKNOWN", "deployId": None, "error": "deploy response is invalid"}
    candidates = [
        deploy for deploy in deploys
        if isinstance(deploy, dict)
        and deploy.get("context") == "production"
        and deploy.get("commit_ref") == release_sha
    ]
    base = {
        "name": site.get("name"),
        "siteId": site.get("siteId"),
        "baseUrl": site.get("baseUrl"),
    }
    if not candidates:
        return {
            **base,
            "status": "UNKNOWN",
            "deployId": None,
            "state": None,
            "commitRef": release_sha,
            "error": "no production deploy found for the exact release SHA",
        }
    deploy = max(candidates, key=lambda item: str(item.get("created_at") or ""))
    state = deploy.get("state")
    deploy_id = deploy.get("id")
    base_url = base.get("baseUrl")
    parsed_base = urlsplit(base_url) if isinstance(base_url, str) else None
    permalink_url = None
    if (
        isinstance(deploy_id, str)
        and NETLIFY_DEPLOY_ID_RE.fullmatch(deploy_id) is not None
        and parsed_base is not None
        and parsed_base.scheme == "https"
        and parsed_base.hostname
        and parsed_base.path in ("", "/")
    ):
        permalink_url = f"https://{deploy_id}--{parsed_base.hostname}"
    if state in {"ready", "current"} and permalink_url:
        status = "PASS"
    elif state in {"ready", "current"}:
        status = "UNKNOWN"
    elif state == "error":
        status = "FAIL"
    else:
        status = "UNKNOWN"
    return {
        **base,
        "status": status,
        "deployId": deploy_id,
        "state": state,
        "commitRef": deploy.get("commit_ref"),
        "createdAt": deploy.get("created_at"),
        "publishedAt": deploy.get("published_at"),
        "permalinkUrl": permalink_url,
        "url": deploy.get("deploy_ssl_url") or deploy.get("ssl_url") or deploy.get("url"),
        "error": (
            deploy.get("error_message")
            if status == "FAIL"
            else "deploy does not expose a safe atomic permalink"
            if status == "UNKNOWN" and state in {"ready", "current"}
            else None
        ),
    }


def _immutable_deploy_config(config, deploy_rows):
    """Replace mutable production aliases with exact deploy-ID permalinks."""
    sites = production_canary._validate_config(config)
    rows = {
        row.get("name"): row
        for row in deploy_rows
        if isinstance(row, dict) and isinstance(row.get("name"), str)
    }
    if set(rows) != {site["name"] for site in sites}:
        raise ReceiptError("exact deploy permalinks are unavailable for both learner sites")
    immutable_sites = []
    for site in sites:
        row = rows[site["name"]]
        expected_url = None
        deploy_id = row.get("deployId")
        if isinstance(deploy_id, str) and NETLIFY_DEPLOY_ID_RE.fullmatch(deploy_id):
            expected_url = f"https://{deploy_id}--{urlsplit(site['baseUrl']).hostname}"
        if row.get("status") != "PASS" or row.get("permalinkUrl") != expected_url:
            raise ReceiptError(f"safe atomic deploy permalink unavailable for {site['name']}")
        immutable_sites.append({**site, "baseUrl": expected_url})
    return {
        "schemaVersion": config.get("schemaVersion"),
        "sites": immutable_sites,
        "spProxy": config.get("spProxy"),
    }


def served_revision_evidence(parity_receipt, release_sha):
    """Require both live learner manifests to report the requested SHA."""
    validate_sha(release_sha)
    if not isinstance(parity_receipt, dict):
        return {"status": "UNKNOWN", "sites": {}, "error": "revision receipt is unavailable"}
    observations = parity_receipt.get("observations")
    if not isinstance(observations, list) or not observations:
        return {"status": "UNKNOWN", "sites": {}, "error": "revision receipt has no observations"}
    observation = observations[-1]
    rows = observation.get("sites") if isinstance(observation, dict) else None
    if not isinstance(rows, list):
        return {"status": "UNKNOWN", "sites": {}, "error": "revision observation is invalid"}
    sites = {
        row.get("name"): row.get("revision")
        for row in rows
        if isinstance(row, dict) and isinstance(row.get("name"), str)
    }
    if any(isinstance(row, dict) and row.get("error") for row in rows):
        status = "UNKNOWN"
    elif set(sites) != {"ms3", "res"}:
        status = "UNKNOWN"
    elif parity_receipt.get("status") != "matched":
        status = "FAIL" if parity_receipt.get("status") == "mismatch" else "UNKNOWN"
    else:
        status = "PASS" if all(value == release_sha for value in sites.values()) else "FAIL"
    return {
        "status": status,
        "checkedAt": observation.get("checkedAt"),
        "sites": sites,
        "requestedSha": release_sha,
    }


def _walk_specs(suites):
    for suite in suites if isinstance(suites, list) else []:
        if not isinstance(suite, dict):
            continue
        for spec in suite.get("specs", []) if isinstance(suite.get("specs"), list) else []:
            if isinstance(spec, dict):
                yield spec
        yield from _walk_specs(suite.get("suites"))


def summarize_playwright(report):
    """Reduce a Playwright JSON report to the two required production journeys."""
    if not isinstance(report, dict):
        return {
            "status": "UNKNOWN",
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "projects": [],
            "missingProjects": list(EXPECTED_JOURNEY_PROJECTS),
            "error": "Playwright report is unavailable",
        }
    rows = []
    for spec in _walk_specs(report.get("suites")):
        for test in spec.get("tests", []) if isinstance(spec.get("tests"), list) else []:
            if not isinstance(test, dict):
                continue
            project = test.get("projectName")
            if project not in EXPECTED_JOURNEY_PROJECTS:
                continue
            results = test.get("results") if isinstance(test.get("results"), list) else []
            final_result = results[-1] if results and isinstance(results[-1], dict) else {}
            outcome = test.get("status")
            result_status = final_result.get("status")
            if outcome == "expected" and result_status == "passed":
                state = "passed"
            elif outcome == "skipped" or result_status == "skipped":
                state = "skipped"
            elif outcome in {"unexpected", "flaky"} or result_status in {
                "failed", "timedOut", "interrupted"
            }:
                state = "failed"
            else:
                state = "unknown"
            rows.append(
                {
                    "project": project,
                    "title": spec.get("title"),
                    "state": state,
                    "durationMs": final_result.get("duration"),
                }
            )
    projects = [name for name in EXPECTED_JOURNEY_PROJECTS if any(row["project"] == name for row in rows)]
    missing = [name for name in EXPECTED_JOURNEY_PROJECTS if name not in projects]
    passed = sum(row["state"] == "passed" for row in rows)
    failed = sum(row["state"] == "failed" for row in rows)
    skipped = sum(row["state"] in {"skipped", "unknown"} for row in rows)
    if failed:
        status = "FAIL"
    elif missing or skipped or passed != len(EXPECTED_JOURNEY_PROJECTS):
        status = "UNKNOWN"
    else:
        status = "PASS"
    return {
        "status": status,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "projects": projects,
        "missingProjects": missing,
        "journeys": rows,
    }


def build_receipt(core, journeys, *, trigger, generated_at=None):
    if not isinstance(core, dict):
        raise ReceiptError("core evidence must be an object")
    release_sha = validate_sha(core.get("releaseSha"))
    verifier_sha = validate_sha(core.get("verifierSha") or release_sha)
    repository = validate_repository(core.get("repository"))
    generated_at = generated_at or utc_now()
    evidence = {
        "ci": core.get("ci", {"status": "UNKNOWN", "error": "CI evidence missing"}),
        "deployments": core.get(
            "deployments", {"status": "UNKNOWN", "sites": [], "error": "deploy evidence missing"}
        ),
        "servedRevision": core.get(
            "servedRevision", {"status": "UNKNOWN", "sites": {}, "error": "revision evidence missing"}
        ),
        "staticCanary": core.get(
            "staticCanary", {"status": "UNKNOWN", "error": "canary evidence missing"}
        ),
        "browserJourneys": journeys if isinstance(journeys, dict) else {
            "status": "UNKNOWN", "error": "browser evidence missing"
        },
    }
    status = _group_status(item.get("status") for item in evidence.values() if isinstance(item, dict))
    evidence_bytes = json.dumps(
        evidence, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("utf-8")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": status,
        "generatedAt": generated_at,
        "repository": repository,
        "releaseSha": release_sha,
        "verifierSha": verifier_sha,
        "trigger": trigger,
        "coreCollectedAt": core.get("collectedAt"),
        "evidenceSha256": sha256(evidence_bytes).hexdigest(),
        "evidence": evidence,
        "boundary": (
            "Technical deployment evidence only; this does not establish faculty approval, "
            "clinical approval, learner readiness, or native VoiceOver and physical-device coverage."
        ),
    }


def _md_link(label, url):
    if isinstance(url, str) and url.startswith("https://"):
        return f"[{label}]({url})"
    return label


def render_markdown(receipt):
    status = receipt.get("status", "UNKNOWN")
    sha = receipt.get("releaseSha", "unknown")
    evidence = receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {}
    ci = evidence.get("ci", {})
    deployments = evidence.get("deployments", {})
    revision = evidence.get("servedRevision", {})
    canary = evidence.get("staticCanary", {})
    journeys = evidence.get("browserJourneys", {})
    lines = [
        f"# Production release verification: {status}",
        "",
        f"- Release: `{sha}`",
        f"- Verifier: `{receipt.get('verifierSha', sha)}`",
        f"- Repository: `{receipt.get('repository', 'unknown')}`",
        f"- Generated: `{receipt.get('generatedAt', 'unknown')}`",
        f"- Evidence digest: `{receipt.get('evidenceSha256', 'unknown')}`",
        "",
        "| Evidence | Status | Bound record |",
        "|---|---:|---|",
        f"| Post-merge CI | **{ci.get('status', 'UNKNOWN')}** | "
        f"{_md_link('run ' + str(ci.get('runId')), ci.get('url'))} |",
    ]
    for site in deployments.get("sites", []) if isinstance(deployments.get("sites"), list) else []:
        deploy_label = f"deploy `{site.get('deployId')}`"
        lines.append(
            f"| Netlify {site.get('name', 'site')} | **{site.get('status', 'UNKNOWN')}** | "
            f"{_md_link(deploy_label, site.get('permalinkUrl'))} · `{site.get('commitRef')}` |"
        )
    revision_sites = revision.get("sites") if isinstance(revision.get("sites"), dict) else {}
    lines.extend(
        [
            f"| Served revision | **{revision.get('status', 'UNKNOWN')}** | "
            f"MS3 `{revision_sites.get('ms3')}` · Resident `{revision_sites.get('res')}` |",
            f"| Static production canary | **{canary.get('status', 'UNKNOWN')}** | "
            f"{len(canary.get('sites', [])) if isinstance(canary.get('sites'), list) else 0} site receipt(s) |",
            f"| Browser journeys | **{journeys.get('status', 'UNKNOWN')}** | "
            f"{journeys.get('passed', 0)} passed · {journeys.get('failed', 0)} failed · "
            f"{journeys.get('skipped', 0)} unavailable/skipped |",
            "",
            f"> {receipt.get('boundary', '')}",
            "",
        ]
    )
    return "\n".join(lines)


def _validate_https(value, label):
    if not isinstance(value, str):
        raise ReceiptError(f"{label} must be HTTPS")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ReceiptError(f"{label} must be HTTPS") from exc
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or port:
        raise ReceiptError(f"{label} must be HTTPS")
    return value


def _comment_body(receipt, artifact_url, run_url):
    sha = receipt["releaseSha"]
    marker = COMMENT_MARKER_PREFIX + sha + " -->"
    return "\n".join(
        [
            marker,
            f"## Production release verification — {receipt.get('status', 'UNKNOWN')}",
            "",
            f"Exact release: `{sha}`",
            "",
            f"{_md_link('Download the 90-day receipt artifact', artifact_url)} · "
            f"{_md_link('Open the verification run', run_url)}",
            "",
            "This is technical deployment evidence. It does not establish faculty approval, "
            "clinical approval, learner readiness, or native VoiceOver coverage.",
        ]
    )


def attach_receipt_comment(receipt, *, artifact_url, run_url, request_json):
    release_sha = validate_sha(receipt.get("releaseSha"))
    repository = validate_repository(receipt.get("repository"))
    artifact_url = _validate_https(artifact_url, "artifact URL")
    run_url = _validate_https(run_url, "run URL")
    pulls = request_json(
        "GET", f"/repos/{repository}/commits/{release_sha}/pulls?per_page=100"
    )
    if not isinstance(pulls, list):
        raise ReceiptError("GitHub commit-to-pull response is invalid")
    matches = [
        pr for pr in pulls
        if isinstance(pr, dict)
        and pr.get("merged_at")
        and pr.get("merge_commit_sha") == release_sha
        and isinstance(pr.get("base"), dict)
        and pr["base"].get("ref") == "main"
    ]
    if not matches:
        return {"status": "not_applicable", "pullRequest": None}
    pr = max(matches, key=lambda item: str(item.get("merged_at") or ""))
    number = pr.get("number")
    if type(number) is not int or number <= 0:
        raise ReceiptError("matched pull request has no valid number")
    comments = []
    for page in range(1, 11):
        batch = request_json(
            "GET",
            f"/repos/{repository}/issues/{number}/comments?per_page=100&page={page}",
        )
        if not isinstance(batch, list):
            raise ReceiptError("GitHub pull-request comments response is invalid")
        comments.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise ReceiptError("pull-request comment history exceeds the safe pagination bound")
    marker = COMMENT_MARKER_PREFIX + release_sha
    body = _comment_body(receipt, artifact_url, run_url)
    existing = next(
        (
            comment for comment in comments
            if isinstance(comment, dict)
            and isinstance(comment.get("body"), str)
            and marker in comment["body"]
        ),
        None,
    )
    if existing is not None:
        comment_id = existing.get("id")
        if type(comment_id) is not int or comment_id <= 0:
            raise ReceiptError("existing verification comment has no valid id")
        request_json("PATCH", f"/repos/{repository}/issues/comments/{comment_id}", {"body": body})
        action = "updated"
    else:
        request_json("POST", f"/repos/{repository}/issues/{number}/comments", {"body": body})
        action = "created"
    return {"status": action, "pullRequest": number, "url": pr.get("html_url")}


def _json_request(url, token, *, method="GET", payload=None, accept="application/json"):
    headers = {
        "Accept": accept,
        "Authorization": f"Bearer {token}",
        "User-Agent": "psychiatry-clerkship-release-receipt/1",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    body = None
    if payload is not None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method=method)
    opener = production_canary.build_opener()
    try:
        response = opener.open(request, timeout=30)
    except HTTPError as exc:
        exc.close()
        raise ReceiptError(f"API returned HTTP {exc.code}") from exc
    except (URLError, OSError) as exc:
        raise ReceiptError("API transport unavailable") from exc
    try:
        raw = response.read(MAX_JSON_BYTES + 1)
        if len(raw) > MAX_JSON_BYTES:
            raise ReceiptError("API response is too large")
        return json.loads(raw)
    except (UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise ReceiptError("API response is not valid JSON") from exc
    finally:
        response.close()


def _github_request(token, repository, method, path, payload=None):
    validate_repository(repository)
    if not path.startswith(f"/repos/{repository}/"):
        raise ReceiptError("unsafe GitHub API path")
    return _json_request(
        GITHUB_API + path,
        token,
        method=method,
        payload=payload,
        accept="application/vnd.github+json",
    )


def _fetch_ci(token, repository, release_sha):
    query = urlencode({"head_sha": release_sha, "per_page": 20})
    payload = _github_request(
        token,
        repository,
        "GET",
        f"/repos/{repository}/actions/workflows/ci.yml/runs?{query}",
    )
    evidence = select_ci_evidence(payload, release_sha)
    run_id = evidence.get("runId")
    if type(run_id) is int and run_id > 0:
        jobs = _github_request(
            token,
            repository,
            "GET",
            f"/repos/{repository}/actions/runs/{run_id}/jobs?per_page=100",
        )
        rows = jobs.get("jobs") if isinstance(jobs, dict) else None
        if isinstance(rows, list):
            evidence["jobs"] = [
                {
                    "id": row.get("id"),
                    "name": row.get("name"),
                    "status": row.get("status"),
                    "conclusion": row.get("conclusion"),
                    "url": row.get("html_url"),
                }
                for row in rows if isinstance(row, dict)
            ]
    return evidence


def _fetch_deploy(token, site, release_sha):
    site_id = quote(str(site.get("siteId")), safe="")
    payload = _json_request(
        f"{NETLIFY_API}/sites/{site_id}/deploys?per_page=100",
        token,
    )
    return select_deploy_evidence(site, payload, release_sha)


def collect_core_evidence(
    *,
    release_sha,
    verifier_sha=None,
    repository,
    config,
    github_token,
    netlify_token,
    wait_seconds=3600,
    poll_seconds=20,
    sleep=time.sleep,
    monotonic=time.monotonic,
):
    """Poll CI and both deploys, then sample served content independently."""
    release_sha = validate_sha(release_sha)
    verifier_sha = validate_sha(verifier_sha or release_sha)
    repository = validate_repository(repository)
    sites = production_canary._validate_config(config)
    if len(sites) != 2 or {site["name"] for site in sites} != {"ms3", "res"}:
        raise ReceiptError("exactly the ms3 and res learner sites are required")
    if wait_seconds < 0 or wait_seconds > 3600 or poll_seconds < 1 or poll_seconds > 60:
        raise ReceiptError("wait must be 0-3600 seconds and poll interval 1-60 seconds")
    deadline = monotonic() + wait_seconds
    ci = {"status": "UNKNOWN", "runId": None, "error": "GITHUB_TOKEN unavailable"}
    deploy_rows = [
        {
            "name": site["name"],
            "siteId": site["siteId"],
            "baseUrl": site["baseUrl"],
            "status": "UNKNOWN",
            "deployId": None,
            "commitRef": release_sha,
            "error": "NETLIFY_AUTH_TOKEN unavailable",
        }
        for site in sites
    ]
    while True:
        if github_token:
            try:
                ci = _fetch_ci(github_token, repository, release_sha)
            except ReceiptError as exc:
                ci = {"status": "UNKNOWN", "runId": None, "error": str(exc)}
        if netlify_token:
            fetched = []
            for site in sites:
                try:
                    fetched.append(_fetch_deploy(netlify_token, site, release_sha))
                except ReceiptError as exc:
                    fetched.append(
                        {
                            "name": site["name"],
                            "siteId": site["siteId"],
                            "baseUrl": site["baseUrl"],
                            "status": "UNKNOWN",
                            "deployId": None,
                            "commitRef": release_sha,
                            "error": str(exc),
                        }
                    )
            deploy_rows = fetched
        waiting = (
            github_token and ci.get("status") == "UNKNOWN"
        ) or (
            netlify_token and any(row.get("status") == "UNKNOWN" for row in deploy_rows)
        )
        if not waiting or monotonic() >= deadline:
            break
        sleep(min(poll_seconds, max(0, deadline - monotonic())))

    try:
        immutable_config = _immutable_deploy_config(config, deploy_rows)
    except (ReceiptError, production_canary.CanaryError) as exc:
        immutable_config = None
        immutable_error = str(exc)

    try:
        if immutable_config is None:
            raise ReceiptError(immutable_error)
        parity = production_revision_parity.check(
            immutable_config,
            attempts=3,
            retry_delay=15,
        )
        served = served_revision_evidence(parity, release_sha)
        served["receipt"] = parity
    except (ReceiptError, ValueError, production_canary.CanaryError) as exc:
        served = {"status": "UNKNOWN", "sites": {}, "error": str(exc)}

    try:
        if immutable_config is None:
            raise ReceiptError(immutable_error)
        twin = production_canary.probe(
            immutable_config,
            opener=production_canary.build_opener(),
            now=utc_now,
            source_sha=release_sha,
        )
        static_canary = {"status": "PASS", **twin}
    except ReceiptError as exc:
        static_canary = {"status": "UNKNOWN", "error": str(exc)}
    except production_canary.CanaryError as exc:
        static_canary = {"status": "FAIL", "error": str(exc)}

    return {
        "schemaVersion": SCHEMA_VERSION,
        "releaseSha": release_sha,
        "verifierSha": verifier_sha,
        "repository": repository,
        "collectedAt": utc_now(),
        "ci": ci,
        "deployments": {
            "status": _group_status(row.get("status") for row in deploy_rows),
            "sites": deploy_rows,
        },
        "servedRevision": served,
        "staticCanary": static_canary,
    }


def _load_json(path, label):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise ReceiptError(f"{label} is unavailable or invalid") from exc


def _write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _fallback_core(args, error):
    return {
        "schemaVersion": SCHEMA_VERSION,
        "releaseSha": validate_sha(args.release_sha),
        "verifierSha": validate_sha(getattr(args, "verifier_sha", None) or args.release_sha),
        "repository": validate_repository(args.repository),
        "collectedAt": utc_now(),
        "ci": {"status": "UNKNOWN", "error": error},
        "deployments": {"status": "UNKNOWN", "sites": [], "error": error},
        "servedRevision": {"status": "UNKNOWN", "sites": {}, "error": error},
        "staticCanary": {"status": "UNKNOWN", "error": error},
    }


def _command_collect(args):
    config = production_canary._load_config(args.config)
    core = collect_core_evidence(
        release_sha=args.release_sha,
        verifier_sha=args.verifier_sha,
        repository=args.repository,
        config=config,
        github_token=os.environ.get("GITHUB_TOKEN", ""),
        netlify_token=os.environ.get("NETLIFY_AUTH_TOKEN", ""),
        wait_seconds=args.wait_seconds,
        poll_seconds=args.poll_seconds,
    )
    _write_json(args.out, core)
    status = _group_status(
        core[name].get("status") for name in ("ci", "deployments", "servedRevision", "staticCanary")
    )
    return EXIT_BY_STATUS[status]


def _command_finalize(args):
    try:
        core = _load_json(args.core, "core evidence")
    except ReceiptError as exc:
        if not args.release_sha or not args.repository:
            raise
        core = _fallback_core(args, str(exc))
    try:
        journey_report = _load_json(args.journeys, "browser journey report")
        journeys = summarize_playwright(journey_report)
    except ReceiptError as exc:
        journeys = summarize_playwright(None)
        journeys["error"] = str(exc)
    combined = build_receipt(
        core,
        journeys,
        trigger=args.trigger,
        generated_at=args.generated_at,
    )
    _write_json(args.json_out, combined)
    args.markdown_out.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_out.write_text(render_markdown(combined), encoding="utf-8")
    digest = sha256(args.json_out.read_bytes()).hexdigest()
    args.digest_out.parent.mkdir(parents=True, exist_ok=True)
    args.digest_out.write_text(f"{digest}  {args.json_out.name}\n", encoding="utf-8")
    return EXIT_BY_STATUS[combined["status"]]


def _command_comment(args):
    receipt = _load_json(args.receipt, "release receipt")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        raise ReceiptError("GITHUB_TOKEN is required to attach the receipt")
    repository = validate_repository(receipt.get("repository"))

    def request_json(method, path, payload=None):
        return _github_request(token, repository, method, path, payload)

    result = attach_receipt_comment(
        receipt,
        artifact_url=args.artifact_url,
        run_url=args.run_url,
        request_json=request_json,
    )
    print(json.dumps(result, sort_keys=True))
    return 0


def _parser():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    collect = subparsers.add_parser("collect", help="collect CI, deploy, revision, and canary evidence")
    collect.add_argument("--release-sha", required=True)
    collect.add_argument("--verifier-sha")
    collect.add_argument("--repository", required=True)
    collect.add_argument("--config", type=Path, default=production_canary.DEFAULT_CONFIG_PATH)
    collect.add_argument("--out", type=Path, required=True)
    collect.add_argument("--wait-seconds", type=int, default=3600)
    collect.add_argument("--poll-seconds", type=int, default=20)

    finalize = subparsers.add_parser("finalize", help="combine core evidence and browser journeys")
    finalize.add_argument("--core", type=Path, required=True)
    finalize.add_argument("--journeys", type=Path, required=True)
    finalize.add_argument("--trigger", required=True)
    finalize.add_argument("--json-out", type=Path, required=True)
    finalize.add_argument("--markdown-out", type=Path, required=True)
    finalize.add_argument("--digest-out", type=Path, required=True)
    finalize.add_argument("--release-sha")
    finalize.add_argument("--repository")
    finalize.add_argument("--generated-at")

    comment = subparsers.add_parser("comment", help="create or update the merged-PR receipt comment")
    comment.add_argument("--receipt", type=Path, required=True)
    comment.add_argument("--artifact-url", required=True)
    comment.add_argument("--run-url", required=True)
    return parser


def main(argv=None):
    args = _parser().parse_args(argv)
    try:
        if args.command == "collect":
            return _command_collect(args)
        if args.command == "finalize":
            return _command_finalize(args)
        if args.command == "comment":
            return _command_comment(args)
        raise ReceiptError("unknown command")
    except ReceiptError as exc:
        print(f"production release receipt unavailable: {exc}", file=sys.stderr)
        return 2
    except production_canary.CanaryError as exc:
        print(f"production release receipt failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
