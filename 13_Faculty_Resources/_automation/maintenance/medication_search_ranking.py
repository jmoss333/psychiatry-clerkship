"""Advisory, evidence-bound medication ranking comparisons for release receipts.

No search rules or release gates are changed here. Unavailable evidence is never
reported as unchanged rankings. Only completed main-branch verifier artifacts can
be baselines, and Git ancestry orders releases rather than recheck timestamps.
"""
from __future__ import annotations

import base64
import binascii
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from html import escape
import io
import json
import os
import re
import subprocess
import zipfile
from urllib.parse import urlencode, urlsplit


PROJECTS = {"release-ms3": "une-ms3-psychiatry", "release-res": "mmc-psychiatry-residents-sanford"}
DEVICES = ("desktop", "phone")
TITLE = "production medication search verifies names, punctuation and safety priority on "
MAX_BYTES = 32 * 1024 * 1024
MAX_RUN_PAGES = 3


class RankingUnavailable(RuntimeError):
    """There is not enough trustworthy evidence to compare rankings."""


def _require(condition, message):
    if not condition:
        raise RankingUnavailable(message)


def _specs(suite):
    if not isinstance(suite, dict):
        return
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from _specs(child)


def _key(case):
    return (case["project"], case["device"], case["viewport"]["width"], case["viewport"]["height"],
            case["phase"], case["expected"]["category"], case["expected"]["query"])


def extract_snapshot(receipt, report):
    """Read the four final-attempt query attachments, including failed assertions."""
    try:
        release = receipt["releaseSha"]
        _require(isinstance(release, str) and re.fullmatch(r"[0-9a-f]{40}", release), "invalid release revision")
        _require(isinstance(report, dict) and not report.get("errors"), "browser report missing or interrupted")
        deploys = {"release-" + s["name"]: s for s in receipt["evidence"]["deployments"]["sites"]}
        groups, cases, outcomes = set(), [], []
        for spec in _specs(report):
            if spec.get("title") not in {TITLE + d for d in DEVICES}:
                continue
            device = spec["title"][len(TITLE):]
            for test in spec["tests"]:
                project = test["projectName"]
                if project not in PROJECTS:
                    continue
                _require((project, device) not in groups, "duplicate medication journey")
                groups.add((project, device))
                outcomes.append(test.get("status") == "expected" and test["results"][-1].get("status") == "passed")
                attachments = [a for a in test["results"][-1].get("attachments", []) if a.get("name") == "medication-search-results"]
                _require(len(attachments) == 1, "medication query attachment missing or duplicated")
                raw = base64.b64decode(attachments[0]["body"], validate=True)
                _require(len(raw) <= MAX_BYTES, "query attachment exceeds size bound")
                payload = json.loads(raw)
                _require(payload["project"] == project and payload["device"] == device and payload["releaseSha"] == release,
                         "query attachment has a different site, device or revision")
                deploy = deploys[project]
                url = deploy["permalinkUrl"]
                _require(deploy["status"] == "PASS" and deploy["commitRef"] == release and
                         re.fullmatch(r"https://[0-9a-f]{24}--" + PROJECTS[project] + r"\.netlify\.app", url),
                         "query evidence is not bound to an exact production deploy")
                observed = urlsplit(payload["url"])
                _require(observed.scheme == "https" and observed.netloc == urlsplit(url).netloc,
                         "query attachment URL differs from the verified deploy")
                viewport = payload["viewport"]
                _require(all(type(viewport.get(k)) is int and viewport[k] > 0 for k in ("width", "height")), "invalid viewport")
                observations = payload["observations"]
                count = payload["expectedQueries"]
                _require(type(count) is int and count > 0 and count == payload["completedQueries"] == len(observations),
                         "incomplete medication query coverage")
                _require(not payload["runtimeErrors"], "browser runtime errors prevent comparison")
                for observation in observations:
                    expected, rows = observation["expected"], observation["rows"]
                    _require(isinstance(expected, dict) and all(isinstance(expected.get(k), str) and expected[k] for k in ("query", "category")),
                             "query identity is missing")
                    _require(set(expected) <= {"query", "category", "empty", "topThree", "before", "exact", "first", "second"},
                             "unsupported query expectation format")
                    for key in ("first", "second"):
                        if key in expected:
                            target = expected[key]
                            _require(isinstance(target, dict) and set(target) == {"ref", "kind"} and
                                     isinstance(target["ref"], str) and target["ref"] and target["kind"] in {"protocol", "item"},
                                     "invalid priority expectation")
                    for key in ("topThree", "before", "exact"):
                        _require(key not in expected or isinstance(expected[key], str) and expected[key], "invalid destination expectation")
                    _require("empty" not in expected or type(expected["empty"]) is bool, "invalid empty-query expectation")
                    _require(observation["phase"] in {"matrix", "after reload"} and type(observation["passed"]) is bool,
                             "invalid query observation")
                    _require(isinstance(rows, list) and len(rows) <= 8 and all(
                        isinstance(r, dict) and isinstance(r.get("ref"), str) and r["ref"] and r.get("kind") in {"item", "protocol"}
                        for r in rows), "invalid ranked results")
                    _require(len({r["ref"] for r in rows}) == len(rows), "duplicate ranked destination")
                    cases.append({"project": project, "device": device, "viewport": viewport,
                                  "phase": observation["phase"], "expected": expected, "rows": rows, "passed": observation["passed"]})
        _require(groups == {(p, d) for p in PROJECTS for d in DEVICES}, "both sites and both devices must have medication evidence")
        _require(len({_key(c) for c in cases}) == len(cases), "duplicate query identity")
        return {"schemaVersion": 1, "releaseSha": release, "verifierSha": receipt["verifierSha"],
                "repository": receipt["repository"], "journeysPassed": all(outcomes), "cases": cases}
    except (KeyError, IndexError, TypeError, ValueError, AttributeError, binascii.Error) as exc:
        raise RankingUnavailable("medication query evidence is malformed") from exc


def _safety(case):
    return bool(case) and (any(r["kind"] == "protocol" for r in case["rows"]) or
                          any(isinstance(case["expected"].get(k), dict) and case["expected"][k].get("kind") == "protocol"
                              for k in ("first", "second")))


def _change(before, after):
    case = after or before
    old, new = (before or {}).get("rows", []), (after or {}).get("rows", [])
    movements, notes = [], []
    regression, expectation_failure = False, False
    for ref in dict.fromkeys([r["ref"] for r in old + new]):
        old_rank = next((i + 1 for i, r in enumerate(old) if r["ref"] == ref), None)
        new_rank = next((i + 1 for i, r in enumerate(new) if r["ref"] == ref), None)
        old_kind = old[old_rank - 1]["kind"] if old_rank else None
        new_kind = new[new_rank - 1]["kind"] if new_rank else None
        if (old_rank, old_kind) != (new_rank, new_kind):
            movements.append({"ref": ref, "beforeRank": old_rank, "afterRank": new_rank,
                              "beforeKind": old_kind, "afterKind": new_kind})
        if before and after and old_kind == "protocol":
            if new_rank is None:
                notes.append(f"Safety protocol {ref} missing from results.")
                regression = True
            elif new_kind != "protocol":
                notes.append(f"Safety protocol {ref} became an ordinary reading action.")
                regression = True
            elif new_rank > old_rank:
                notes.append(f"Safety protocol {ref} demoted from {old_rank} to {new_rank}.")
                regression = True
    if not after:
        notes.append("Query removed from comparison coverage.")
    elif not before:
        notes.append("New query coverage; no previous result order.")
    elif before["expected"] != after["expected"]:
        notes.append("Expected destination or priority changed; review the test contract too.")
    if after:
        for index, label in enumerate(("first", "second")):
            target = after["expected"].get(label)
            if isinstance(target, dict) and target.get("kind") == "protocol" and (len(new) <= index or new[index] != target):
                notes.append(f"Expected safety protocol {target['ref']} is not in position {index + 1}.")
                expectation_failure = True
    return {"project": case["project"], "device": case["device"], "viewport": case["viewport"],
            "phase": case["phase"], "category": case["expected"]["category"], "query": case["expected"]["query"],
            "before": old, "after": new, "movements": movements, "notes": notes,
            "safetyAffected": bool(_safety(before) or _safety(after)), "safetyRegression": bool(regression),
            "safetyCoverageGap": bool(not after and _safety(before)),
            "safetyExpectationFailure": expectation_failure,
            "coverage": "removed" if not after else "added" if not before else "shared",
            "expectationChanged": bool(before and after and before["expected"] != after["expected"])}


def compare_snapshots(before, after, provenance):
    old, new = ({_key(c): c for c in s["cases"]} for s in (before, after))
    shared = old.keys() & new.keys()
    changes = [_change(old.get(k), new.get(k)) for k in sorted(old.keys() | new.keys())
               if k not in shared or old[k]["rows"] != new[k]["rows"] or old[k]["expected"] != new[k]["expected"]]
    changes.sort(key=lambda c: (not (c["safetyRegression"] or c["safetyCoverageGap"] or c["safetyExpectationFailure"]),
                               not c["safetyAffected"], c["project"], c["device"], c["query"], c["phase"]))
    added, removed = len(new.keys() - old.keys()), len(old.keys() - new.keys())
    expectations = sum(c["expectationChanged"] for c in changes)
    return {"status": "PARTIAL" if added or removed or expectations or not shared else "COMPARED",
            "releaseSha": after["releaseSha"], "baseline": provenance,
            "previousQueries": len(old), "currentQueries": len(new), "comparedQueries": len(shared),
            "addedQueries": added, "removedQueries": removed, "changedExpectations": expectations,
            "safetyRegressions": sum(c["safetyRegression"] for c in changes),
            "safetyCoverageGaps": sum(c["safetyCoverageGap"] for c in changes),
            "safetyExpectationFailures": sum(c["safetyExpectationFailure"] for c in changes),
            "safetyChanges": sum(c["safetyAffected"] for c in changes), "changes": changes,
            "sites": {p: {"comparedQueries": sum(k[0] == p for k in shared),
                          "changedQueries": sum(c["project"] == p for c in changes),
                          "safetyCoverageGaps": sum(c["project"] == p and c["safetyCoverageGap"] for c in changes),
                          "safetyRegressions": sum(c["project"] == p and c["safetyRegression"] for c in changes)} for p in PROJECTS}}


def read_artifact(raw, repository, release):
    """Read only bounded named JSON members; never extract files from the archive."""
    try:
        _require(len(raw) <= MAX_BYTES, "baseline artifact exceeds size bound")
        with zipfile.ZipFile(io.BytesIO(raw)) as package:
            def member(name):
                found = [i for i in package.infolist() if i.filename.split("/")[-1] == name]
                _require(len(found) == 1 and found[0].file_size <= MAX_BYTES, "baseline artifact member missing, duplicated or too large")
                return package.read(found[0])
            receipt_bytes = member("production-release-receipt.json")
            digest = member("production-release-receipt.json.sha256").decode().split()[0]
            _require(sha256(receipt_bytes).hexdigest() == digest, "baseline receipt digest mismatch")
            receipt = json.loads(receipt_bytes)
            _require(receipt["status"] == "PASS" and receipt["repository"] == repository and receipt["releaseSha"] == release,
                     "baseline receipt is not a verified release for this repository")
            _require(receipt["evidence"]["browserJourneys"]["status"] == "PASS", "baseline browser journeys did not pass")
            snapshot = extract_snapshot(receipt, json.loads(member("production-release-journeys.json")))
            _require(snapshot["journeysPassed"] and all(c["passed"] for c in snapshot["cases"]), "baseline has failing or flaky medication journeys")
            return snapshot
    except (OSError, KeyError, IndexError, TypeError, ValueError, AttributeError, zipfile.BadZipFile) as exc:
        raise RankingUnavailable("baseline artifact is unreadable or malformed") from exc


def find_baseline(repository, release, ancestry, request_json, download):
    """Choose the closest earlier release; newer reruns of older releases lose."""
    _require(ancestry and ancestry[0] == release, "release ancestry is unavailable")
    order = {sha: i for i, sha in enumerate(ancestry) if i > 0}
    runs = []
    since = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    for page in range(1, MAX_RUN_PAGES + 1):
        query = urlencode({"branch": "main", "event": "workflow_dispatch", "status": "completed", "created": ">=" + since,
                           "per_page": 100, "page": page})
        payload = request_json(f"/repos/{repository}/actions/workflows/production-release-verification.yml/runs?{query}")
        _require(isinstance(payload, dict) and isinstance(payload.get("workflow_runs"), list) and
                 all(isinstance(r, dict) for r in payload["workflow_runs"]), "verification history is malformed")
        batch = payload["workflow_runs"]
        runs.extend(batch)
        if len(batch) < 100:
            _require(type(payload.get("total_count")) is int and len(runs) == payload["total_count"], "verification history is incomplete")
            break
    else:
        raise RankingUnavailable("90-day verification history exceeds the bounded scan; nearest retained prior release cannot be established")
    trusted = [r for r in runs if r.get("head_branch") == "main" and r.get("event") == "workflow_dispatch"
               and r.get("status") == "completed" and r.get("conclusion") == "success" and type(r.get("id")) is int]
    def artifacts(run):
        payload = request_json(f"/repos/{repository}/actions/runs/{run['id']}/artifacts?per_page=100")
        _require(isinstance(payload, dict) and isinstance(payload.get("artifacts"), list) and
                 payload.get("total_count") == len(payload["artifacts"]) and
                 all(isinstance(a, dict) and isinstance(a.get("name"), str) and type(a.get("id")) is int and a["id"] > 0
                     and type(a.get("expired")) is bool for a in payload["artifacts"]), "release artifact listing is incomplete or malformed")
        return run, payload["artifacts"]
    candidates = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        for run, items in pool.map(artifacts, trusted):
            for item in items:
                match = re.fullmatch(r"production-release-([0-9a-f]{40})-" + str(run["id"]), item.get("name", ""))
                if match and match[1] in order:
                    candidates.append((order[match[1]], -run["id"], match[1], item))
    _require(candidates, "no earlier verified release artifact is available in the 90-day run window")
    _, neg_run, sha, artifact = min(candidates, key=lambda c: (c[0], c[1]))
    provenance = {"releaseSha": sha, "runId": -neg_run, "artifactId": artifact["id"],
                  "runWindowStart": since, "runsExamined": len(runs),
                  "runUrl": f"https://github.com/{repository}/actions/runs/{-neg_run}"}
    _require(not artifact.get("expired"), "nearest prior release artifact has expired")
    snapshot = read_artifact(download(artifact["id"]), repository, sha)
    provenance["verifierSha"] = snapshot["verifierSha"]
    return {"snapshot": snapshot, "provenance": provenance}


def _command(args):
    try:
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=90)
        _require(len(result.stdout) <= MAX_BYTES, "history response exceeds size bound")
        return result.stdout
    except (OSError, subprocess.SubprocessError) as exc:
        # Provider stderr can contain signed download URLs. Keep those out of receipts.
        raise RankingUnavailable("release history command failed or timed out") from exc


def discover_baseline(receipt):
    _require(os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"), "release-history credentials unavailable")
    repository, release = receipt["repository"], receipt["releaseSha"]
    _require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository), "invalid repository")
    ancestry = _command(["git", "rev-list", "--first-parent", release]).decode().splitlines()
    def request(path):
        try:
            return json.loads(_command(["gh", "api", path]))
        except ValueError as exc:
            raise RankingUnavailable("release history is not valid JSON") from exc
    return find_baseline(repository, release, ancestry, request,
                         lambda artifact: _command(["gh", "api", f"/repos/{repository}/actions/artifacts/{artifact}/zip"]))


def add_report(receipt, journey_report):
    """Advisory failures are visible without changing existing release verdicts."""
    report = {"releaseSha": receipt["releaseSha"], "status": "CURRENT_UNAVAILABLE"}
    try:
        snapshot = extract_snapshot(receipt, journey_report)
        receipt["medicationSearch"] = snapshot
    except RankingUnavailable as exc:
        report["reason"] = str(exc)
    else:
        try:
            baseline = discover_baseline(receipt)
            report = compare_snapshots(baseline["snapshot"], snapshot, baseline["provenance"])
        except RankingUnavailable as exc:
            report.update(status="BASELINE_UNAVAILABLE", reason=str(exc), currentQueries=len(snapshot["cases"]))
    receipt["medicationSearchRanking"] = report


def _cell(value):
    return escape(str(value), quote=False).replace("|", "\\|").replace("\n", " ").replace("\r", " ").replace("`", "&#96;")


def render_markdown(report):
    lines = ["## Medication-search ranking changes", "", f"Comparison: **{report['status']}**", "",
             "Advisory comparison of observed search results; existing medication and safety checks still determine release verification.", ""]
    if report["status"] not in {"COMPARED", "PARTIAL"}:
        lines += ["Comparison unavailable: " + _cell(report.get("reason", "evidence unavailable")) + ".",
                  "This does not mean rankings were unchanged. Comparison requires complete medication evidence from an earlier verified main-branch run.", ""]
        return "\n".join(lines)
    baseline = report["baseline"]
    run = f"[run {baseline['runId']}]({baseline['runUrl']})" if baseline.get("runUrl") else f"run {baseline['runId']}"
    lines += [f"Baseline release: `{baseline['releaseSha']}` · verifier `{baseline.get('verifierSha', 'unknown')}` · {run}.",
              "Baseline selection: nearest earlier verified release with a retained artifact in the 90-day run window; releases without retained receipts may be absent.",
              f"Current release: `{report['releaseSha']}`.", "",
              f"Compared {report['comparedQueries']} queries; {report['addedQueries']} added, {report['removedQueries']} removed, "
              f"{report['changedExpectations']} changed expectations.", "",
              "| Site | Compared | Changed queries | Safety-priority regressions | Safety coverage gaps |", "|---|---:|---:|---:|---:|"]
    for site, summary in report["sites"].items():
        lines.append(f"| {site} | {summary['comparedQueries']} | {summary['changedQueries']} | {summary['safetyRegressions']} | {summary['safetyCoverageGaps']} |")
    lines += ["", f"**Safety-priority regressions: {report['safetyRegressions']}**. Safety coverage gaps: {report['safetyCoverageGaps']}. "
              f"Current safety expectations unmet: {report['safetyExpectationFailures']}. Safety-related changed queries: {report['safetyChanges']}.", ""]
    if not report["changes"]:
        lines += ["No ranking changes in the complete, comparable query set.", ""]
        return "\n".join(lines)
    lines += ["Safety-priority regressions and coverage gaps appear first, followed by other safety-related changes and ordinary reading changes.", "",
              "| Site / screen | Query | Before → after | Review note |", "|---|---|---|---|"]
    for change in report["changes"][:60]:
        def order(rows):
            return "; ".join(f"{i + 1}. {_cell(r['ref'])} ({r['kind']})" for i, r in enumerate(rows)) or "no results"
        notes = " ".join(change["notes"]) or "Result order or membership changed."
        prefix = ("**SAFETY PRIORITY** " if change["safetyRegression"] else "**SAFETY COVERAGE GAP** " if change["safetyCoverageGap"]
                  else "**CURRENT SAFETY CHECK** " if change["safetyExpectationFailure"] else "Safety-related: " if change["safetyAffected"] else "")
        screen = f"{change['device']} {change['viewport']['width']}×{change['viewport']['height']}"
        lines.append(f"| {change['project']} / {screen} | {_cell(change['query'])} ({_cell(change['category'])}; {change['phase']}) | "
                     f"{order(change['before'])} → {order(change['after'])} | {prefix}{_cell(notes)} |")
    if len(report["changes"]) > 60:
        lines += ["", f"Showing 60 of {len(report['changes'])} changed queries; the JSON receipt contains every change."]
    lines.append("")
    return "\n".join(lines)
