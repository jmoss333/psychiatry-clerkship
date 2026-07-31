#!/usr/bin/env python3
"""Build a deterministic, content-free monthly maintenance review."""

from __future__ import annotations

import argparse
import calendar
import json
import subprocess
import sys
from datetime import date, datetime, timezone
from hashlib import sha256
from pathlib import Path, PurePosixPath


SP_PACK_PATH = "_prototypes/sp-interview/sp-interview.pack.json"
EVIDENCE_REGISTRY_PATH = "evidence_registry.json"
MEDIA_MANIFEST_PATH = "media_manifest.json"


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


def _evidence_counts(registry, today, generated_views_valid):
    if not isinstance(registry, dict) or not isinstance(registry.get("sources"), list):
        raise MonthlyReviewError("evidence registry has an invalid shape")
    identity = {"verified": 0, "pending": 0, "exception": 0, "unknown": 0}
    faculty = {"reviewed": 0, "pending": 0, "unknown": 0}
    cadence = {"current": 0, "due": 0, "overdue": 0, "unknown": 0}
    local_policy = 0

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

        last_reviewed = _exact_date(governance.get("lastReviewed"))
        review_cadence = governance.get("reviewCadence")
        if (
            last_reviewed is None
            or last_reviewed > today
            or review_cadence not in {"monthly", "annual"}
        ):
            cadence["unknown"] += 1
            continue
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


def _receipt_state(root, receipt_config, today):
    if not isinstance(receipt_config, dict) or set(receipt_config) != {
        "path",
        "maxAgeDays",
    }:
        raise MonthlyReviewError("OpenEvidence receipt config has an invalid shape")
    relative_path = _safe_relative_path(
        receipt_config["path"], "receipts.openEvidence.path"
    )
    max_age = receipt_config["maxAgeDays"]
    if type(max_age) is not int or max_age < 1:
        raise MonthlyReviewError(
            "receipts.openEvidence.maxAgeDays must be a positive integer"
        )
    path = _repository_path(root, relative_path, "receipts.openEvidence.path")
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

    registry = _load_json(root, EVIDENCE_REGISTRY_PATH, "evidence registry")
    media_manifest = _load_json(root, MEDIA_MANIFEST_PATH, "media manifest")
    evidence = _evidence_counts(registry, today, generated_views_valid)

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
    }

    blocked = bool(media["newRegressions"]) or not generated_views_valid
    review = (
        bool(media["existingDebt"])
        or operations["attendedOnlyReviewCount"] > 0
        or not operations["apaCrosswalkPresent"]
        or operations["openEvidenceReceipt"] != "current"
        or operations["redTeamReceipt"] != "current"
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
