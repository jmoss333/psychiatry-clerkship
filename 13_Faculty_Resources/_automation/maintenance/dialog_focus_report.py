"""Exact-release dialog timing coverage; missing evidence must never look green."""
from collections import Counter
from datetime import datetime
from html import escape
import re

SITES = {"ms3": "une-ms3-psychiatry", "res": "mmc-psychiatry-residents-sanford"}
PREFIX = "delayed dialog focus: "


def inventory():
    """Pin case identities, not a passing count that duplicates could satisfy."""
    cases = {}
    def add(file, project, title, site, width):
        cases[(file, project, PREFIX + title)] = {"site": site, "screen": "phone" if width == 320 else "desktop"}
    for site in SITES:
        for width in (320, 1280):
            for name in ("search", "settings", "safety kit", "protocol pg_suicide.md", "protocol agitation.md",
                         "protocol exp_consult.md", "protocol t_sud.md", "protocol delirium.md", "protocol catatonia.md", "capture",
                         "email review", "patient-details warning", "retained item preview"):
                for source in ("reading and guide arrival", "high-risk ledger arrival"):
                    add("dialog-loading-focus.spec.js", "nav-" + site, f"{name} / {source} / {width}px", site, width)
            for name in ("optional Care Quick Share", "optional clear-packet confirmation"):
                add("dialog-loading-focus.spec.js", "nav-" + site, f"{name} / directory arrival / {width}px", site, width)
            add("rotation-edition-v2.spec.js", "nav-" + site,
                f"optional edition switch / high-risk ledger arrival / {width}px", site, width)
            for name in ("spoken consent", "Chart", "Step out", "typed patient-details alert", "spoken patient-details alert"):
                add("interview-room.spec.js", "interview-room", f"Interview Room {name} / {site} / {width}px", site, width)
        for state in ("open", "closed"):
            add("dialog-loading-focus.spec.js", "nav-" + site,
                f"embedded Communication Practice case browser {state} / high-risk ledger arrival", site, 320)
    return cases


def _specs(suites):
    if not isinstance(suites, list):
        raise ValueError("browser suites are malformed")
    for suite in suites:
        if not isinstance(suite, dict) or not isinstance(suite.get("specs", []), list):
            raise ValueError("browser suite is malformed")
        yield from suite.get("specs", [])
        yield from _specs(suite.get("suites", []))


def _binding(core, report, proof):
    sha = core["releaseSha"]
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("invalid release revision")
    if proof["releaseSha"] != sha or report["config"]["metadata"]["releaseSha"] != sha:
        raise ValueError("dialog evidence targets a different release")
    deploys = core["deployments"]["sites"]
    if len(deploys) != 2 or {d["name"] for d in deploys} != set(SITES):
        raise ValueError("exact deployments are unavailable for both sites")
    if set(proof["sites"]) != set(SITES):
        raise ValueError("dialog target evidence is incomplete")
    origins = {}
    for deploy in deploys:
        site, url = deploy["name"], deploy["permalinkUrl"]
        if (deploy["status"] != "PASS" or deploy["commitRef"] != sha or not isinstance(url, str)
                or not re.fullmatch(r"https://[0-9a-f]{24}--" + SITES[site] + r"\.netlify\.app", url)):
            raise ValueError("dialog target is not the exact production deploy")
        origins[site] = url
        target = proof["sites"][site]
        if target["url"] != url:
            raise ValueError("dialog target differs from verified deployment")
        times = []
        for phase in ("before", "after"):
            row = target[phase]
            if (row["shellRevision"] != sha or row["governanceRevisions"] != [sha]
                    or not isinstance(row["observedAt"], str) or not row["observedAt"]):
                raise ValueError("shell or governance revision check is missing or changed")
            observed = datetime.fromisoformat(row["observedAt"].replace("Z", "+00:00"))
            if observed.tzinfo is None or observed.utcoffset() is None:
                raise ValueError("revision check timestamp has no timezone")
            times.append(observed)
        if times[0] > times[1]:
            raise ValueError("revision check timestamps are reversed")
    if report["config"]["metadata"]["origins"] != origins:
        raise ValueError("browser targets differ from verified deployments")


def summarize(core, report, proof):
    expected = inventory()
    rows, problems, runner_errors = [], [], []
    bound = False
    try:
        _binding(core, report, proof)
        bound = True
    except (KeyError, TypeError, ValueError, AttributeError):
        problems.append("Exact-release target evidence is missing, malformed, or mismatched.")
    try:
        runner_errors = report.get("errors")
        if not isinstance(runner_errors, list):
            raise ValueError("runner errors are malformed")
        for spec in _specs(report["suites"]):
            if not isinstance(spec, dict) or not isinstance(spec.get("tests"), list) or not spec["tests"]:
                raise ValueError("browser test is malformed")
            for test in spec["tests"]:
                key = (spec["file"], test["projectName"], spec["title"])
                results = test.get("results", [])
                if not isinstance(results, list) or any(not isinstance(r, dict) for r in results):
                    raise ValueError("test attempts are malformed")
                if any(not isinstance(r.get(field), list) or
                       any(not isinstance(item, dict) for item in r.get(field, []))
                       for r in results for field in ("errors", "attachments")):
                    raise ValueError("attempt errors or attachments are malformed")
                failed = test.get("status") in ("unexpected", "flaky") or any(
                    r.get("status") in ("failed", "timedOut", "interrupted") or r.get("errors") for r in results)
                passed = (test.get("status") == "expected" and test.get("expectedStatus") == "passed" and
                          len(results) == 1 and results[0].get("status") == "passed" and type(results[0].get("retry")) is int and results[0]["retry"] == 0)
                state = "failed" if failed else "passed" if passed else "unavailable"
                rows.append({"file": key[0], "project": key[1], "title": key[2], **expected.get(key, {}),
                             "state": state, "attempts": len(results),
                             "errors": [e.get("message", "Browser assertion failed")[:1500]
                                        for r in results for e in r.get("errors", []) if isinstance(e, dict)],
                             "attachments": [{"name": a.get("name"), "path": a.get("path")} for r in results
                                             for a in r.get("attachments", []) if isinstance(a, dict) and a.get("path")]})
    except (KeyError, TypeError, ValueError, AttributeError):
        problems.append("Browser results are missing or malformed; coverage cannot be certified.")
    counts = Counter((r["file"], r["project"], r["title"]) for r in rows)
    for key, meta in expected.items():
        if counts[key] == 0:
            rows.append({"file": key[0], "project": key[1], "title": key[2], **meta, "state": "missing", "attempts": 0})
        elif counts[key] > 1:
            problems.append("Duplicate case: " + key[1] + " / " + key[2])
    for key in counts:
        if key not in expected:
            problems.append("Unexpected case: " + str(key))
    def totals(selected):
        return {"passed": sum(r["state"] == "passed" for r in selected),
                "failed": sum(r["state"] == "failed" for r in selected),
                "unavailable": sum(r["state"] in ("missing", "unavailable") for r in selected)}
    totals_all = totals(rows)
    status = "FAIL" if totals_all["failed"] or runner_errors else "UNKNOWN" if (
        problems or totals_all["unavailable"] or totals_all["passed"] != len(expected)) else "PASS"
    sites = {}
    for site in SITES:
        site_rows = [r for r in rows if r.get("site") == site]
        sites[site] = {**totals(site_rows), "expected": sum(m["site"] == site for m in expected.values()),
                       "screens": {screen: totals([r for r in site_rows if r["screen"] == screen])
                                   for screen in ("phone", "desktop")}}
    return {"status": status, "releaseSha": core.get("releaseSha"), "boundToRelease": bound,
            "expected": len(expected), **totals_all, "sites": sites, "problems": problems,
            "runnerErrors": runner_errors, "findings": [r for r in rows if r["state"] != "passed"], "cases": rows,
            "targets": proof}


def _cell(value):
    return escape(str(value), quote=False).replace("|", "\\|").replace("\n", " ").replace("`", "&#96;")


def render_markdown(summary):
    lines = ["## Dialog-focus regression results", "", f"Result: **{summary['status']}** · "
             f"{summary['passed']}/{summary['expected']} passed · {summary['failed']} failed · {summary['unavailable']} unavailable/missing.", "",
             "Automated Chromium controlled-response checks: background reading, guide, review-status and directory arrivals "
             "are released while a dialog is open. Optional features and Interview Room providers use explicit fixtures.",
             "This does not prove physical iPhone keyboard, microphone/provider behavior, or native VoiceOver support.", "",
             "| Site | Screen | Passed | Failed | Unavailable / missing |", "|---|---|---:|---:|---:|"]
    for site, label in (("ms3", "MS3"), ("res", "Resident")):
        for screen, row in summary["sites"][site]["screens"].items():
            lines.append(f"| {label} | {screen} | {row['passed']} | {row['failed']} | {row['unavailable']} |")
    if not summary["boundToRelease"]:
        lines += ["", "**Target provenance is incomplete: these results cannot certify this release.**"]
    if summary["problems"]:
        lines += ["", *["- " + _cell(p) for p in summary["problems"]]]
    if summary["runnerErrors"]:
        lines += ["", "**Browser runner failed.** The raw JSON report contains the runner errors."]
    if summary["findings"]:
        lines += ["", "| Site / screen | Check | Result |", "|---|---|---|"]
        for row in summary["findings"]:
            lines.append(f"| {_cell(row.get('site', row['project']))} / {_cell(row.get('screen', 'unknown'))} | "
                         f"{_cell(row['title'])} | **{row['state']}** |")
    lines += ["", "The release artifact retains the raw dialog report, before/after revision checks, and failure traces/screenshots. "
              "All attempts are retained; a later pass does not erase a failure.", ""]
    return "\n".join(lines)
