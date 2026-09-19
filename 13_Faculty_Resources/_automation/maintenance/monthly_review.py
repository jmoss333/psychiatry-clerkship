#!/usr/bin/env python3
"""Build a deterministic, content-free monthly maintenance review.

The cadence buckets here and the work list `bin/check_review_cadence.py` prints are
the same judgement rendered twice, so they share the rule that decides WHICH date
counts as a source's last review (see "shared credit rule" below).
"""

from __future__ import annotations

import argparse
import calendar
import importlib.util
import json
import subprocess
import sys
from datetime import date, datetime, timezone
from hashlib import sha256
from pathlib import Path, PurePosixPath


SP_PACK_PATH = "_prototypes/sp-interview/sp-interview.pack.json"
EVIDENCE_REGISTRY_PATH = "evidence_registry.json"
MEDIA_MANIFEST_PATH = "media_manifest.json"
SURVEILLANCE_HISTORY_PATH = "13_Faculty_Resources/_automation/surveillance/history"


# ----------------------------------------------------------- shared credit rule
#
# This report and `bin/check_review_cadence.py` must never disagree about whether a
# source has been reviewed. Until 2026-09-19 they did: the cadence tool credits a green
# guideline-surveillance examination as the review (policy call, 2026-09-19) while this
# report still counted `governance.lastReviewed` alone -- so the same registry read
# 4 overdue there and 8 overdue here, on the same day, and the monthly gate contradicted
# the tool a reviewer had just been told to trust.
#
# The credit rule is IMPORTED, never copied. It is intricate -- per-source baselines,
# newest-report-row-wins, and a detected change the faculty have not actioned WITHHOLDING
# credit -- and a second copy would drift on its first amendment. Importing also means an
# amendment lands in both places at once: when the rule learns to honour a dismissal or a
# closed issue, this gate honours it the same day, with no second edit.
#
# The month arithmetic (`_add_months`) deliberately stays LOCAL. `bin/` tools must run
# standalone, so the cadence tool keeps its own copy and its `--self-test` imports this
# module's to assert the two agree on the month-end boundaries. Splitting it that way
# gives each half the right guarantee: one definition for the part that is hard, and a
# pinned-equal pair for the part that must not create a dependency.
#
# A failed import is a hard error, never a quiet fall back to the faculty-only view. The
# fallback would be *stricter* and so look harmless, but it is precisely the silent
# contradiction this closes -- it would render as an ordinary "review" gate with nothing
# on the report naming the cause.
_CREDIT_RULE_PATH = (
    Path(__file__).resolve().parents[3] / "bin" / "check_review_cadence.py"
)


def _load_credit_rule(path):
    """Load the cadence tool by PATH, never by a `sys.path` search.

    Putting `bin/` on `sys.path` would make all 36 modules in it importable from
    here, so a future `bin/types.py` or `bin/copy.py` would shadow the stdlib for
    every consumer of this file -- a failure with no plausible connection to the
    change that caused it. The rule lives in one known file; name that file.

    An already-imported module is reused rather than re-executed, so a caller that
    imported the cadence tool by name (the cross-tool test does) shares this object
    and can patch it.
    """
    existing = sys.modules.get("check_review_cadence")
    if existing is not None:
        return existing
    spec = importlib.util.spec_from_file_location("check_review_cadence", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"no loadable module at {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["check_review_cadence"] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop("check_review_cadence", None)
        raise
    return module


try:
    _credit_rule = _load_credit_rule(_CREDIT_RULE_PATH)
    CREDITED_JOB = _credit_rule.CREDITED_JOB
    _classify_cadence = _credit_rule.classify
    _load_surveillance = _credit_rule.load_surveillance
except (ImportError, OSError, SyntaxError, AttributeError) as _exc:
    _CREDIT_IMPORT_ERROR = _exc
    CREDITED_JOB = None
    _classify_cadence = None
    _load_surveillance = None
else:
    _CREDIT_IMPORT_ERROR = None


class MonthlyReviewError(ValueError):
    """Monthly review input is missing, malformed, or unsafe."""


def _safe_relative_path(value, label):
    if not isinstance(value, str) or not value or value != value.strip():
        raise MonthlyReviewError(f"{label} must be a non-empty relative path")
    if "\\" in value or "?" in value or "#" in value:
        raise MonthlyReviewError(f"{label} must be a plain repository-relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "." in path.parts:
        raise MonthlyReviewError(f"{label} must stay within the repository")
    return value


def _repository_path(root, relative_path, label):
    """Resolve a configured path without permitting symlink escape."""
    relative_path = _safe_relative_path(relative_path, label)
    try:
        resolved_root = Path(root).resolve(strict=True)
        if not resolved_root.is_dir():
            raise MonthlyReviewError("repository root is not a directory")
        resolved_path = (resolved_root / relative_path).resolve(strict=False)
        resolved_path.relative_to(resolved_root)
    except MonthlyReviewError:
        raise
    except (OSError, RuntimeError, ValueError) as exc:
        raise MonthlyReviewError(
            f"{label} must resolve within the repository root"
        ) from exc
    return resolved_path


def _load_json(root, relative_path, label):
    path = _repository_path(root, relative_path, label)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MonthlyReviewError(f"{label} is unavailable or malformed") from exc


def _exact_date(value):
    if not isinstance(value, str) or value != value.strip():
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == value else None


def _utc_datetime(value):
    if not isinstance(value, str) or value != value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _utc_today():
    return datetime.now(timezone.utc).date()


def _add_months(value, months):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _credit_summary(surveillance, history_present, credited):
    """A content-free account of what the credit rule had to work with.

    Counts only -- no source ids, no titles, no finding text, in keeping with the rest
    of this report. It is stated beside the verdict because `sourcesCredited: 0` has two
    very different causes: the job examined every source and found changes nobody has
    actioned, or there was nothing on record to read at all. A gate that reports the
    same number for "checked, and it is bad" and "never checked" is the silent-shrink
    failure in docs/SILENT_SHRINK_CHECKLIST.md, so both are named.

    `_meta` is skipped rather than assumed absent: the shared rule grew a `_meta` entry
    for its own coverage line, and counting it as a source would inflate every figure.
    """
    records = {
        key: value
        for key, value in (surveillance or {}).items()
        if key != "_meta" and isinstance(value, dict)
    }
    return {
        "historyPresent": history_present,
        "baselines": sum(1 for v in records.values() if v.get("examinedAt")),
        "openChangeFindings": sum(
            len(v.get("openChanges") or []) for v in records.values()
        ),
        "sourcesCredited": credited,
    }


def _evidence_counts(
    registry,
    today,
    generated_views_valid,
    surveillance,
    history_present,
):
    if not isinstance(registry, dict) or not isinstance(registry.get("sources"), list):
        raise MonthlyReviewError("evidence registry has an invalid shape")
    identity = {"verified": 0, "pending": 0, "exception": 0, "unknown": 0}
    faculty = {"reviewed": 0, "pending": 0, "unknown": 0}
    cadence = {"current": 0, "due": 0, "overdue": 0, "unknown": 0}
    local_policy = 0
    credited = 0

    for source in registry["sources"]:
        if not isinstance(source, dict):
            raise MonthlyReviewError("evidence registry source has an invalid shape")
        identity_value = source.get("identity", {})
        identity_value = (
            identity_value.get("status") if isinstance(identity_value, dict) else None
        )
        identity[identity_value if identity_value in identity else "unknown"] += 1

        governance = source.get("governance", {})
        governance = governance if isinstance(governance, dict) else {}
        review_value = governance.get("facultyReviewStatus")
        faculty[review_value if review_value in faculty else "unknown"] += 1
        if governance.get("localPolicyDependent") is True:
            local_policy += 1

        # The date that COUNTS as this source's last review: the faculty's own, or a
        # green guideline-surveillance examination where the shared rule credits one.
        # Asking the shared rule -- rather than reading `lastReviewed` here -- is what
        # makes this gate and `bin/check_review_cadence.py` incapable of disagreeing.
        row = _classify_cadence(source, today, surveillance)
        if not isinstance(row, dict):
            raise MonthlyReviewError("shared review-credit rule returned an invalid row")
        last_reviewed = _exact_date(row.get("effectiveReviewed"))
        review_cadence = governance.get("reviewCadence")
        if (
            last_reviewed is None
            or last_reviewed > today
            or review_cadence not in {"monthly", "annual"}
        ):
            cadence["unknown"] += 1
            continue
        if row.get("reviewedBy") == CREDITED_JOB:
            credited += 1
        next_review = _add_months(
            last_reviewed,
            1 if review_cadence == "monthly" else 12,
        )
        if next_review == today:
            cadence["due"] += 1
        elif next_review < today:
            cadence["overdue"] += 1
        else:
            cadence["current"] += 1

    return {
        "total": len(registry["sources"]),
        "identity": identity,
        "facultyReview": faculty,
        "cadence": cadence,
        "localPolicyDependent": local_policy,
        "generatedViewsValid": generated_views_valid,
        "surveillanceCredit": _credit_summary(
            surveillance,
            history_present,
            credited,
        ),
    }


def _served_missing_accessibility(media):
    if not isinstance(media, dict):
        raise MonthlyReviewError("media manifest has an invalid shape")
    missing = set()
    for collection in ("audio", "video"):
        records = media.get(collection, [])
        if not isinstance(records, list):
            raise MonthlyReviewError("media manifest has an invalid shape")
        for record in records:
            if not isinstance(record, dict) or record.get("served") is not True:
                continue
            file_name = record.get("file")
            if not isinstance(file_name, str) or not file_name:
                raise MonthlyReviewError("served media must have a file path")
            has_accessible_record = (
                record.get("captions") is True
                or isinstance(record.get("textAlt"), str)
                and bool(record["textAlt"].strip())
                or isinstance(record.get("transcript"), str)
                and bool(record["transcript"].strip())
                or isinstance(record.get("transcriptPath"), str)
                and bool(record["transcriptPath"].strip())
            )
            if not has_accessible_record:
                missing.add(file_name)
    return sorted(missing)


def _runbook_counts(root, configured_docs, today, git_last_changed):
    if not isinstance(configured_docs, list):
        raise MonthlyReviewError("operationalDocs must be an array")
    counts = {"total": len(configured_docs), "current": 0, "stale": 0, "unknown": 0}
    for index, item in enumerate(configured_docs):
        if not isinstance(item, dict) or set(item) != {"path", "maxAgeDays"}:
            raise MonthlyReviewError(f"operationalDocs[{index}] has an invalid shape")
        configured_path = _safe_relative_path(
            item["path"], f"operationalDocs[{index}].path"
        )
        document_path = _repository_path(
            root,
            configured_path,
            f"operationalDocs[{index}].path",
        )
        max_age = item["maxAgeDays"]
        if type(max_age) is not int or max_age < 1:
            raise MonthlyReviewError(
                f"operationalDocs[{index}].maxAgeDays must be a positive integer"
            )
        if not document_path.is_file():
            counts["unknown"] += 1
            continue
        changed_at = _utc_datetime(
            git_last_changed(
                ["git", "log", "-1", "--format=%cI", "--", configured_path]
            )
        )
        if changed_at is None or changed_at.date() > today:
            counts["unknown"] += 1
        elif (today - changed_at.date()).days > max_age:
            counts["stale"] += 1
        else:
            counts["current"] += 1
    return counts


def _receipt_state(root, receipt_config, today, label="openEvidence"):
    """Age a dated `{state: success, checkedAt: ...}` receipt against maxAgeDays.

    `label` names the config key in error messages. It exists because several receipts
    now use this shape, all of them attesting to a check Actions CANNOT run itself:

      openEvidence  a human ran the OpenEvidence sweep.
      rulesetBypass a human ran `bin/check_ruleset_drift.py --check-bypass`. GitHub
                    returns bypass_actors only to a caller with ruleset WRITE access,
                    so a workflow token can never see it.
      staleClaims   a human ran `bin/check_stale_claims.py --write-receipt`. That sweep
                    needs `gh`, `npm audit --include=dev` and every local worktree --
                    none of which exist on a fresh Actions runner, which would report a
                    confident clean sweep of nothing.

    In every case the receipt's freshness is the ONLY signal the monthly review has.
    That is the point: a check nobody can run automatically still has to be run.
    """
    if not isinstance(receipt_config, dict) or set(receipt_config) != {
        "path",
        "maxAgeDays",
    }:
        raise MonthlyReviewError(f"{label} receipt config has an invalid shape")
    relative_path = _safe_relative_path(
        receipt_config["path"], f"receipts.{label}.path"
    )
    max_age = receipt_config["maxAgeDays"]
    if type(max_age) is not int or max_age < 1:
        raise MonthlyReviewError(
            f"receipts.{label}.maxAgeDays must be a positive integer"
        )
    path = _repository_path(root, relative_path, f"receipts.{label}.path")
    if not path.exists():
        return "missing"
    try:
        receipt = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "invalid"
    if not isinstance(receipt, dict) or receipt.get("state") != "success":
        return "failed"
    checked_at = _utc_datetime(receipt.get("checkedAt"))
    if checked_at is None or checked_at.date() > today:
        return "invalid"
    return "stale" if (today - checked_at.date()).days > max_age else "current"


def _sp_expectations(root):
    pack_path = _repository_path(root, SP_PACK_PATH, "canonical SP pack")
    try:
        pack_bytes = pack_path.read_bytes()
        pack = json.loads(pack_bytes)
        model = pack["engine"]["modelPinned"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
        raise MonthlyReviewError("canonical SP pack is unavailable or malformed") from exc
    if not isinstance(model, str) or not model:
        raise MonthlyReviewError("canonical SP pack has no pinned model")
    return {
        "packSha256": sha256(pack_bytes).hexdigest(),
        "modelSha256": sha256(model.encode("utf-8")).hexdigest(),
    }


def _red_team_state(
    root,
    receipt_config,
    expected_pack_hash,
    today,
    git_last_changed,
):
    if not isinstance(receipt_config, dict) or set(receipt_config) != {"path"}:
        raise MonthlyReviewError("red-team receipt config has an invalid shape")
    relative_path = _safe_relative_path(receipt_config["path"], "receipts.redTeam.path")
    changed_at = _utc_datetime(
        git_last_changed(
            ["git", "log", "-1", "--format=%cI", "--", SP_PACK_PATH]
        )
    )
    path = _repository_path(root, relative_path, "receipts.redTeam.path")
    if not path.exists():
        return "missing"
    try:
        receipt = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "invalid"
    if not isinstance(receipt, dict) or receipt.get("state") != "passed":
        return "failed"
    checked_at = _utc_datetime(receipt.get("checkedAt"))
    if checked_at is None or checked_at.date() > today:
        return "invalid"
    if receipt.get("packSha256") != expected_pack_hash:
        return "pack_mismatch"
    if changed_at is None or changed_at.date() > today:
        return "unknown_pack_change"
    return "current" if checked_at > changed_at else "stale"


def build_monthly_review(root, config, today, git_last_changed):
    """Build the content-free monthly report from canonical local inputs."""
    root = Path(root)
    if not isinstance(config, dict):
        raise MonthlyReviewError("maintenance config must be an object")
    if not isinstance(today, date):
        raise MonthlyReviewError("today must be a date")
    generated_views_valid = config.get("evidenceGeneratedViewsValid")
    if type(generated_views_valid) is not bool:
        raise MonthlyReviewError("evidenceGeneratedViewsValid must be boolean")
    if _CREDIT_IMPORT_ERROR is not None:
        raise MonthlyReviewError(
            "shared review-credit rule is unavailable "
            f"(bin/check_review_cadence.py): {_CREDIT_IMPORT_ERROR}"
        )

    registry = _load_json(root, EVIDENCE_REGISTRY_PATH, "evidence registry")
    media_manifest = _load_json(root, MEDIA_MANIFEST_PATH, "media manifest")
    history_dir = _repository_path(
        root,
        SURVEILLANCE_HISTORY_PATH,
        "surveillance history",
    )
    history_present = history_dir.is_dir()
    try:
        surveillance = _load_surveillance(history_dir)
    except OSError as exc:
        raise MonthlyReviewError("surveillance history is unreadable") from exc
    if not isinstance(surveillance, dict):
        raise MonthlyReviewError(
            "shared review-credit rule returned an invalid surveillance map"
        )
    evidence = _evidence_counts(
        registry,
        today,
        generated_views_valid,
        surveillance,
        history_present,
    )

    baseline = config.get("accessibilityDebtBaseline")
    if not isinstance(baseline, list) or any(
        not isinstance(item, str) for item in baseline
    ):
        raise MonthlyReviewError("accessibilityDebtBaseline must be an array of paths")
    baseline = sorted(
        {
            _safe_relative_path(item, "accessibilityDebtBaseline item")
            for item in baseline
        }
    )
    served_missing = _served_missing_accessibility(media_manifest)
    baseline_set = set(baseline)
    media = {
        "servedMissingCount": len(served_missing),
        "baselineCount": len(baseline),
        "existingDebt": sorted(set(served_missing).intersection(baseline_set)),
        "newRegressions": sorted(set(served_missing).difference(baseline_set)),
    }

    receipts = config.get("receipts")
    if not isinstance(receipts, dict) or set(receipts) != {
        "openEvidence",
        "redTeam",
        "rulesetBypass",
        "staleClaims",
    }:
        raise MonthlyReviewError("receipts config has an invalid shape")
    expected_sp = _sp_expectations(root)
    apa_path = _repository_path(root, config.get("apaCrosswalk"), "apaCrosswalk")
    operations = {
        "runbooks": _runbook_counts(
            root,
            config.get("operationalDocs"),
            today,
            git_last_changed,
        ),
        "attendedOnlyReviewCount": 2,
        "apaCrosswalkPresent": apa_path.is_file(),
        "openEvidenceReceipt": _receipt_state(
            root,
            receipts["openEvidence"],
            today,
        ),
        "redTeamReceipt": _red_team_state(
            root,
            receipts["redTeam"],
            expected_sp["packSha256"],
            today,
            git_last_changed,
        ),
        "rulesetBypassReceipt": _receipt_state(
            root,
            receipts["rulesetBypass"],
            today,
            label="rulesetBypass",
        ),
        "staleClaimsReceipt": _receipt_state(
            root,
            receipts["staleClaims"],
            today,
            label="staleClaims",
        ),
    }

    blocked = bool(media["newRegressions"]) or not generated_views_valid
    review = (
        bool(media["existingDebt"])
        or operations["attendedOnlyReviewCount"] > 0
        or not operations["apaCrosswalkPresent"]
        or operations["openEvidenceReceipt"] != "current"
        or operations["redTeamReceipt"] != "current"
        or operations["rulesetBypassReceipt"] != "current"
        or operations["staleClaimsReceipt"] != "current"
        or operations["runbooks"]["stale"] > 0
        or operations["runbooks"]["unknown"] > 0
        or evidence["identity"]["pending"] > 0
        or evidence["identity"]["unknown"] > 0
        or evidence["facultyReview"]["pending"] > 0
        or evidence["facultyReview"]["unknown"] > 0
        or evidence["cadence"]["due"] > 0
        or evidence["cadence"]["overdue"] > 0
        or evidence["cadence"]["unknown"] > 0
        or evidence["localPolicyDependent"] > 0
    )
    return {
        "schemaVersion": 1,
        "asOf": today.isoformat(),
        "gate": "blocked" if blocked else "review" if review else "ready",
        "evidence": evidence,
        "media": media,
        "operations": operations,
        "expectedSp": expected_sp,
    }


def render_monthly_markdown(report):
    evidence = report["evidence"]
    media = report["media"]
    operations = report["operations"]
    lines = [
        "# Monthly evidence and operations review",
        "",
        f"- As of: `{report['asOf']}`",
        f"- Gate: `{report['gate']}`",
        "",
        "## Evidence counts",
        "",
        f"- Total sources: {evidence['total']}",
        f"- Identity: {json.dumps(evidence['identity'], sort_keys=True)}",
        f"- Faculty review: {json.dumps(evidence['facultyReview'], sort_keys=True)}",
        f"- Cadence: {json.dumps(evidence['cadence'], sort_keys=True)}",
        "- Surveillance credit: "
        f"{json.dumps(evidence['surveillanceCredit'], sort_keys=True)}",
        f"- Local-policy-dependent: {evidence['localPolicyDependent']}",
        f"- Generated views valid: {str(evidence['generatedViewsValid']).lower()}",
        "",
        "## Media accessibility",
        "",
        f"- Served records missing an accessibility record: {media['servedMissingCount']}",
        f"- Existing documented debt: {len(media['existingDebt'])}",
        f"- New regressions: {len(media['newRegressions'])}",
        "",
        "## Operations",
        "",
        f"- Runbooks: {json.dumps(operations['runbooks'], sort_keys=True)}",
        f"- Attended-only reviews: {operations['attendedOnlyReviewCount']}",
        f"- APA crosswalk present: {str(operations['apaCrosswalkPresent']).lower()}",
        f"- OpenEvidence receipt: `{operations['openEvidenceReceipt']}`",
        f"- Red-team receipt: `{operations['redTeamReceipt']}`",
        f"- Ruleset bypass receipt: `{operations['rulesetBypassReceipt']}`"
        " (local-only: needs ruleset write access)",
        f"- Stale-claims receipt: `{operations['staleClaimsReceipt']}`"
        " (local-only: needs gh, npm and every worktree)",
        "",
        "Cadence counts credit a green guideline-surveillance examination as the review,",
        "on the same rule `bin/check_review_cadence.py` applies; that tool names the rows.",
        "",
        "This GitHub-side report does not assess authenticated Netlify deploy recency.",
        "Provider-policy and local Zotero checks remain attended-only review items.",
        "",
    ]
    return "\n".join(lines)


def _default_git_runner(root):
    def run(argv):
        completed = subprocess.run(
            argv,
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        )
        return completed.stdout.strip() if completed.returncode == 0 else None

    return run


def main(argv=None):
    root_default = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=root_default)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--out-json", type=Path, required=True)
    parser.add_argument("--out-md", type=Path, required=True)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    config_path = args.config or (
        root
        / "13_Faculty_Resources"
        / "_automation"
        / "maintenance"
        / "maintenance_config.json"
    )
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        generated_check = subprocess.run(
            [
                sys.executable,
                "tools/evidence_registry/validate.py",
                "--check-generated",
            ],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        )
        config["evidenceGeneratedViewsValid"] = generated_check.returncode == 0
        report = build_monthly_review(
            root,
            config,
            _utc_today(),
            _default_git_runner(root),
        )
        args.out_json.parent.mkdir(parents=True, exist_ok=True)
        args.out_md.parent.mkdir(parents=True, exist_ok=True)
        args.out_json.write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        args.out_md.write_text(render_monthly_markdown(report), encoding="utf-8")
        return 2 if report["gate"] == "blocked" else 0
    except (OSError, json.JSONDecodeError, MonthlyReviewError) as exc:
        print(f"monthly review failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
