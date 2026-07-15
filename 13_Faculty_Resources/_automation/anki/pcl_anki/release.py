"""Fail-closed orchestration for governed Anki release candidates."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from hashlib import sha256
import json
import re
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
from typing import Iterable

from pcl_anki.contract import (
    HistoryRegistry,
    Issue,
    CandidateRelease,
    MigrationResult,
    canonical_json_bytes,
    canonical_json_sha256,
    application_guid,
    core_guid,
    legacy_qbank_guid,
    LEGACY_QBANK_MODEL_ID,
)
from pcl_anki.governance import (
    detect_quarantines,
    evaluate_card,
    evaluate_qbank_note,
    reconcile_quarantines,
    validate_release_coverage,
)
from pcl_anki.history import (
    LEGACY_COMBINED_RELATIVE_PATH,
    LEGACY_STANDALONE_RELATIVE_PATH,
    build_withdrawals,
)
from pcl_anki.history import (
    history_from_dict,
    history_to_dict,
    load_history,
    propose_history_append,
    validate_history,
    preview_withdrawals,
)
from pcl_anki.inspect import _template_contract, inspect_release, read_apkg
from pcl_anki.migration import (
    ReleaseIdentityError,
    import_package,
    match_latest_release_rebuild,
    preflight_package_generation,
    preflight_release_identity,
)
from pcl_anki.package import (
    APPLICATION_ARTIFACT_FILENAME,
    COMPLETE_ARTIFACT_FILENAME,
    CORE_ARTIFACT_FILENAME,
    QBANK_ARTIFACT_FILENAME,
    RELEASE_FILENAMES,
    write_release,
)
from pcl_anki.qbank import qbank_item_sha256
from pcl_anki.render import (
    TEMPLATE_CONTRACTS,
    TEMPLATE_CONTRACT_SHA256,
    _legacy_html,
    build_qbank_notes,
    build_withdrawal_note,
    render_card,
)
from pcl_anki.sources import load_manifest, parse_markdown_sections
from pcl_anki.contract import validate_registry


INTERNAL_REVIEW_EPOCH = 946684800


class ReleaseOrchestrationError(ValueError):
    """Raised when an orchestration gate cannot prove release safety."""


@dataclass(frozen=True)
class GovernedInputSnapshot:
    sha256: str
    ledger: tuple[tuple[str, str], ...]


_GENERATED_PARTS = {".git", "_build", "__pycache__"}
_HISTORY_NAME = "release_history.json"


def _run_git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        check=False,
        capture_output=True,
        text=True,
    )


def _repo_relative(repo: Path, path: Path) -> str:
    try:
        resolved = path.resolve(strict=True)
        relative = resolved.relative_to(repo.resolve(strict=True))
    except (OSError, ValueError) as error:
        raise ReleaseOrchestrationError(
            f"governed input is missing or outside the repository: {path}"
        ) from error
    if path.is_symlink() or any(part in _GENERATED_PARTS for part in relative.parts):
        raise ReleaseOrchestrationError(f"invalid governed input path: {path}")
    return relative.as_posix()


def _file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def capture_governed_inputs(
    repo: Path, loaded_paths: Iterable[Path | str]
) -> GovernedInputSnapshot:
    """Hash the complete caller access ledger, excluding history and Git shape.

    The loader owns completeness: every canonical byte it reads must be supplied in
    ``loaded_paths``.  This function owns path safety, dirtiness, deduplication and
    deterministic hashing.
    """

    repo = Path(repo).resolve(strict=True)
    normalized: list[tuple[str, Path]] = []
    seen: set[str] = set()
    for raw in loaded_paths:
        path = Path(raw)
        if not path.is_absolute():
            path = repo / path
        relative = _repo_relative(repo, path)
        if relative in seen:
            raise ReleaseOrchestrationError(
                f"duplicate governed input path: {relative}"
            )
        seen.add(relative)
        if Path(relative).name == _HISTORY_NAME:
            continue
        normalized.append((relative, path))

    ledger: list[tuple[str, str]] = []
    for relative, path in sorted(normalized):
        status = _run_git(repo, "status", "--porcelain", "--untracked-files=all", "--", relative)
        if status.returncode != 0:
            raise ReleaseOrchestrationError(
                f"cannot verify governed input worktree state: {relative}"
            )
        if status.stdout.strip():
            raise ReleaseOrchestrationError(f"dirty governed input: {relative}")
        ledger.append((relative, _file_sha256(path)))
    if not ledger:
        raise ReleaseOrchestrationError("governed input ledger cannot be empty")
    aggregate = canonical_json_sha256(dict(ledger))
    return GovernedInputSnapshot(aggregate, tuple(ledger))


# Maintenance is allowed to report only unfinished Phase-2 authoring work.  It must
# never turn structural, identity, source-authority, safety or history failures into
# warnings.  Exact codes keep newly introduced failures blocking by default.
MAINTENANCE_NONFATAL_CODES = frozenset(
    {
        "CORE_COVERAGE_CELL_MISMATCH",
        "CORE_COVERAGE_TOTAL_MISMATCH",
        "CORE_COVERAGE_ROW_MISMATCH",
        "CORE_COVERAGE_COLUMN_MISMATCH",
        "APPLICATION_COVERAGE_CELL_MISMATCH",
        "APPLICATION_COVERAGE_TOTAL_MISMATCH",
        "APPLICATION_COVERAGE_ROW_MISMATCH",
        "APPLICATION_COVERAGE_COLUMN_MISMATCH",
        "CORE_FAMILY_REQUIRED",
        "CORE_TASK_REQUIRED",
        "CORE_WEEK_TASK_REQUIRED",
        "CARD_APPROVAL_REQUIRED",
        "QBANK_RENDER_REVIEW_REQUIRED",
        "HIGH_REVIEW_REQUIRED",
        "HIGH_EVIDENCE_REQUIRED",
        "LOCAL_POLICY_REVIEW_REQUIRED",
        "PILOT_CORE_CELL_MISMATCH",
        "PILOT_CORE_TOTAL_MISMATCH",
    }
)


def classify_maintenance_issues(issues: Iterable[Issue]) -> tuple[Issue, ...]:
    return tuple(
        issue
        for issue in issues
        if issue.severity == "hard" and issue.code not in MAINTENANCE_NONFATAL_CODES
    )


def validate_history_baseline(
    baseline: HistoryRegistry, current: HistoryRegistry
) -> HistoryRegistry:
    """Require every reviewed prior record to remain byte-exact and in position."""

    semantic_issues = validate_history(current, baseline)
    if semantic_issues:
        raise ReleaseOrchestrationError(
            "history baseline/current validation failed: "
            + "; ".join(f"{issue.code} {issue.subject}" for issue in semantic_issues)
        )
    if len(current.identity_entries) < len(baseline.identity_entries) or len(
        current.releases
    ) < len(baseline.releases):
        raise ReleaseOrchestrationError("history baseline records were deleted")
    for prior, present in zip(baseline.identity_entries, current.identity_entries):
        if canonical_json_bytes(prior) != canonical_json_bytes(present):
            raise ReleaseOrchestrationError("history baseline identity prefix changed")
    for prior, present in zip(baseline.releases, current.releases):
        if canonical_json_bytes(prior) != canonical_json_bytes(present):
            raise ReleaseOrchestrationError("history baseline release prefix changed")
    return current


def _input(inputs: object, name: str, default):
    if isinstance(inputs, dict):
        return inputs.get(name, default)
    return getattr(inputs, name, default)


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _with_inputs(inputs: object, **changes) -> SimpleNamespace:
    values = dict(inputs) if isinstance(inputs, dict) else vars(inputs)
    return SimpleNamespace(**{**values, **changes})


def _configured_release_date(config: object) -> date | None:
    if not isinstance(config, dict) or config.get("releaseDate") is None:
        return None
    try:
        return date.fromisoformat(config["releaseDate"])
    except (TypeError, ValueError) as error:
        raise ReleaseOrchestrationError("release config contains an invalid date") from error


def evaluate_release(
    inputs: object,
    build_epoch: int,
    evaluation_date: date,
    profile: str,
    baseline_history: HistoryRegistry,
) -> CandidateRelease:
    """Evaluate all governed notes once and return the immutable candidate boundary."""

    if profile not in {"maintenance", "authoring", "prepare", "release"}:
        raise ReleaseOrchestrationError(f"unknown release profile: {profile}")
    if not isinstance(build_epoch, int) or isinstance(build_epoch, bool) or build_epoch < 0:
        raise ReleaseOrchestrationError("release epoch must be a nonnegative integer")
    config = _input(inputs, "release_config", {})
    configured_epoch = config.get("releaseEpoch") if isinstance(config, dict) else None
    if profile in {"prepare", "release"} and configured_epoch != build_epoch:
        raise ReleaseOrchestrationError("candidate epoch must equal the reviewed config epoch")

    # Governance functions expose authoring decisions or raise in release mode.  The
    # orchestrator always collects the complete issue set first and applies the profile
    # gate only after internal reports can be written.
    collecting_inputs = _with_inputs(inputs, mode="authoring")
    rendered_for_detection = []
    for card in _input(collecting_inputs, "cards", ()):
        try:
            qbank = card.get("qbank", {}) if isinstance(card, dict) else {}
            qbank_item = next(
                (
                    item
                    for item in _input(collecting_inputs, "question_bank", {}).get("items", ())
                    if item.get("id") == qbank.get("id")
                ),
                None,
            )
            rendered_for_detection.append(
                render_card(card, qbank_item=qbank_item if card.get("kind") == "application" else None)
            )
        except (KeyError, TypeError, ValueError):
            continue
    for item in _input(collecting_inputs, "question_bank", {}).get("items", ()):
        try:
            rendered_for_detection.extend(build_qbank_notes(item))
        except (KeyError, TypeError, ValueError):
            continue
    detected = _input(collecting_inputs, "detected_quarantines", None)
    if detected is None:
        detected = detect_quarantines(
            collecting_inputs, rendered_for_detection, evaluation_date
        )
    collecting_inputs = _with_inputs(
        collecting_inputs, detected_quarantines=tuple(detected)
    )

    card_decisions = tuple(
        evaluate_card(card, collecting_inputs, evaluation_date)
        for card in _input(collecting_inputs, "cards", ())
    )
    qbank_decisions = []
    for item in _input(collecting_inputs, "question_bank", {}).get("items", ()):
        try:
            identities = tuple(note.identity for note in build_qbank_notes(item))
        except (KeyError, TypeError, ValueError):
            identities = ("base",)
        for identity in identities:
            qbank_decisions.append(
                evaluate_qbank_note(item, identity, collecting_inputs, evaluation_date)
            )
    qbank_decisions = tuple(qbank_decisions)
    quarantine = reconcile_quarantines(
        detected,
        _input(collecting_inputs, "quarantine", ()),
        release_history={"releases": baseline_history.releases},
    )
    coverage_issues = tuple(
        validate_release_coverage(
            _input(collecting_inputs, "cards", ()),
            config,
            detected_quarantines=detected,
            quarantine=_input(collecting_inputs, "quarantine", ()),
            release_history={"releases": baseline_history.releases},
        )
    )
    issues = tuple(_input(collecting_inputs, "input_issues", ())) + tuple(
        issue for decision in (*card_decisions, *qbank_decisions) for issue in decision.issues
    ) + coverage_issues
    core = tuple(
        decision.rendered
        for decision in card_decisions
        if decision.namespace == "core" and decision.eligible and decision.rendered is not None
    )
    application = tuple(
        decision.rendered
        for decision in card_decisions
        if decision.namespace == "application" and decision.eligible and decision.rendered is not None
    )
    qbank = tuple(
        decision.rendered
        for decision in qbank_decisions
        if decision.eligible and decision.rendered is not None
    )
    release_id = config.get("releaseId") if isinstance(config, dict) else None
    if not isinstance(release_id, str) or not release_id.strip():
        release_id = None
    release_date = _configured_release_date(config)
    coverage = {
        "coreActiveCount": len(core),
        "applicationActiveCount": len(application),
        "qbankActiveCount": len(qbank),
    }
    return CandidateRelease(
        release_id=release_id,
        release_date=release_date,
        release_epoch=build_epoch,
        governed_input_sha256=str(
            _input(collecting_inputs, "governed_input_sha256", "")
        ),
        evaluated_at=evaluation_date,
        core_active=core,
        application_active=application,
        qbank_active=qbank,
        withdrawals=build_withdrawals(baseline_history, quarantine),
        quarantine=quarantine,
        coverage=coverage,
        issues=issues,
        governed_input_ledger=tuple(
            _input(collecting_inputs, "governed_input_ledger", ())
        ),
    )


def _issue_dict(issue: Issue) -> dict[str, str]:
    return {
        "code": issue.code,
        "severity": issue.severity,
        "subject": issue.subject,
        "message": issue.message,
    }


def _finding_dict(finding) -> dict[str, object]:
    return {
        "namespace": finding.namespace,
        "uid": finding.uid,
        "identity": finding.identity,
        "reasonCode": finding.reason_code,
        "subjectSha256": finding.subject_sha256,
        "sourcePath": finding.source_path,
        "firstSeenCommit": finding.first_seen_commit,
        "withdrawalRenderSha256": finding.withdrawal_render_sha256,
    }


def _note_dict(note) -> dict[str, object]:
    return {
        "namespace": note.namespace,
        "uid": note.uid,
        "identity": note.identity,
        "guid": note.guid,
        "deckId": note.deck_id,
        "modelId": note.model_id,
        "templateOrdinal": note.template_ordinal,
        "fields": list(note.fields),
        "tags": list(note.tags),
        "frontHtml": note.front_html,
        "backHtml": note.back_html,
        "templateContractSha256": note.template_contract_sha256,
        "renderSha256": note.render_sha256,
        "active": note.active,
        "withdrawn": note.withdrawn,
    }


def _exact_source_quote(repo_root: Path, source_path: str, item: dict) -> dict:
    path = repo_root / source_path
    try:
        raw = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return {}
    paragraphs = [value.strip() for value in raw.split("\n\n") if value.strip()]
    terms = {
        token.casefold()
        for token in re.findall(
            r"[A-Za-z][A-Za-z-]{4,}",
            " ".join(
                str(item.get(name, "")) for name in ("stem", "evidence", "pearl")
            ),
        )
        if token.casefold()
        not in {"which", "following", "patient", "reports", "correct", "started"}
    }
    if not paragraphs:
        return {}
    quote = max(
        paragraphs,
        key=lambda value: (
            sum(value.casefold().count(term) for term in terms),
            -len(value),
        ),
    )
    return {
        "quote": quote,
        "quoteSha256": sha256(quote.encode("utf-8")).hexdigest(),
        "fileSha256": _file_sha256(path),
        "sections": [
            {
                "anchor": section.anchor,
                "title": section.title,
                "sourceAnchorSha256": sha256(
                    section.normalized_text.encode("utf-8")
                ).hexdigest(),
            }
            for section in parse_markdown_sections(raw)
        ],
    }


def _prior_qbank_renders(inputs: object) -> dict[str, dict[str, str]]:
    """Reconstruct exact governed qbank faces from predecessor package bytes."""

    prior: dict[str, dict[str, str]] = {}
    for raw_path in _input(inputs, "prior_package_paths", ()):
        path = Path(raw_path)
        if not path.is_file():
            continue
        snapshot = read_apkg(path)
        if (
            _template_contract(snapshot, LEGACY_QBANK_MODEL_ID)
            != TEMPLATE_CONTRACTS["legacyQbank"]
        ):
            continue
        for stored in snapshot.notes:
            if stored.model_id != LEGACY_QBANK_MODEL_ID or not stored.fields:
                continue
            serialized_uid = stored.fields[0]
            identity = "tier2" if serialized_uid.endswith("::t2") else "base"
            uid = serialized_uid[:-4] if identity == "tier2" else serialized_uid
            if stored.guid != legacy_qbank_guid(uid, identity):
                continue
            front_html = _legacy_html(stored.fields, back=False)
            back_html = _legacy_html(stored.fields, back=True)
            render_sha256 = canonical_json_sha256(
                {
                    "front": front_html,
                    "back": back_html,
                    "tags": list(stored.tags),
                    "id": uid,
                    "identity": identity,
                    "templateVersion": "pcl-qbank-legacy-v1",
                    "templateContractSha256": TEMPLATE_CONTRACT_SHA256[
                        "legacyQbank"
                    ],
                }
            )
            prior[stored.guid] = {
                "frontHtml": front_html,
                "backHtml": back_html,
                "renderSha256": render_sha256,
            }
    return prior


def _draft_previews(inputs: object) -> list[dict[str, object]]:
    items = {
        item.get("id"): item
        for item in _input(inputs, "question_bank", {}).get("items", ())
        if isinstance(item, dict)
    }
    previews = []
    prior_qbank = _prior_qbank_renders(inputs)
    for card in _input(inputs, "cards", ()):
        try:
            qbank = card.get("qbank", {}) if isinstance(card, dict) else {}
            note = render_card(
                card,
                qbank_item=items.get(qbank.get("id"))
                if card.get("kind") == "application"
                else None,
            )
        except (KeyError, TypeError, ValueError):
            continue
        record = _note_dict(note)
        prior_hash = (card.get("review") or {}).get("approvedCardSha256")
        exact_prior = prior_hash == note.render_sha256
        prior_status = (
            "exact"
            if exact_prior
            else "blocking_prior_evidence_gap"
            if isinstance(prior_hash, str)
            else "never_approved"
        )
        record.update(
            state=card.get("state"),
            source=card.get("source"),
            risk=card.get("risk"),
            review=card.get("review"),
            qbank=card.get("qbank"),
            priorApprovedRenderSha256=prior_hash,
            priorApprovedFrontHtml=note.front_html if exact_prior else None,
            priorApprovedBackHtml=note.back_html if exact_prior else None,
            priorRenderStatus=prior_status,
            targetRegistry="cards",
            recordKey=card.get("id"),
            baseRecordSha256=canonical_json_sha256(card),
            canonicalRecord=card,
        )
        previews.append(record)
    reviews = tuple(_input(inputs, "qbank_reviews", ()))
    manifest = _input(inputs, "manifest", None)
    reviewed = _input(inputs, "reviewed", {})
    for item in _input(inputs, "question_bank", {}).get("items", ()):
        try:
            rendered_notes = build_qbank_notes(item)
        except (KeyError, TypeError, ValueError):
            continue
        for note in rendered_notes:
            review = next(
                (
                    value
                    for value in reviews
                    if isinstance(value, dict)
                    and value.get("qbankId") == item.get("id")
                    and value.get("identity") == note.identity
                ),
                None,
            )
            primary_page = review.get("primaryPage") if isinstance(review, dict) else None
            if not isinstance(primary_page, str):
                pages = item.get("pages", ())
                primary_page = pages[0] if isinstance(pages, list) and pages else None
            source_path = (
                manifest.slug_to_path.get(primary_page)
                if manifest is not None and isinstance(primary_page, str)
                else None
            )
            source_review = None
            if isinstance(reviewed, dict):
                source_review = reviewed.get(source_path) or reviewed.get(primary_page)
            source = {
                "path": source_path,
                "slug": primary_page,
                "anchor": review.get("primaryAnchor")
                if isinstance(review, dict)
                else None,
                "status": source_review,
                "pages": item.get("pages"),
                "evidence": item.get("evidence"),
            }
            if isinstance(primary_page, str):
                source["url"] = (
                    "https://une-ms3-psychiatry.netlify.app/?page=" + primary_page
                )
            if isinstance(source_path, str):
                source.update(
                    _exact_source_quote(
                        Path(_input(inputs, "repo_root", Path.cwd())),
                        source_path,
                        item,
                    )
                )
            record = _note_dict(note)
            prior_hash = (
                review.get("renderedNoteSha256") if isinstance(review, dict) else None
            )
            exact_prior = prior_hash == note.render_sha256
            stored_prior = prior_qbank.get(note.guid)
            if exact_prior:
                prior_status = "exact"
                prior_front = note.front_html
                prior_back = note.back_html
            elif isinstance(stored_prior, dict) and (
                not isinstance(prior_hash, str)
                or stored_prior["renderSha256"] == prior_hash
            ):
                prior_hash = stored_prior["renderSha256"]
                prior_front = stored_prior["frontHtml"]
                prior_back = stored_prior["backHtml"]
                prior_status = (
                    "exact"
                    if prior_hash == note.render_sha256
                    else "changed_exact_prior"
                )
            elif isinstance(prior_hash, str):
                prior_front = None
                prior_back = None
                prior_status = "blocking_prior_evidence_gap"
            else:
                prior_front = None
                prior_back = None
                prior_status = "never_approved"
            proposal_template = None
            if isinstance(primary_page, str):
                proposal_template = {
                    "qbankId": item["id"],
                    "identity": note.identity,
                    "primaryPage": primary_page,
                    "approvedItemSha256": qbank_item_sha256(item),
                    "templateVersion": "pcl-qbank-legacy-v1",
                    "templateContractSha256": note.template_contract_sha256,
                    "renderedNoteSha256": note.render_sha256,
                    "legacyTemplateContract": TEMPLATE_CONTRACTS["legacyQbank"],
                }
            record.update(
                state=item.get("status"),
                qbankItem=item,
                qbank={
                    "stem": item.get("stem"),
                    "answer": next(
                        (
                            option
                            for option in item.get("options", ())
                            if isinstance(option, dict) and option.get("c") is True
                        ),
                        None,
                    ),
                    "traps": [
                        option.get("trap")
                        for option in item.get("options", ())
                        if isinstance(option, dict) and option.get("c") is not True
                    ],
                    "itemSha256": canonical_json_sha256(item),
                },
                source=source,
                risk=review.get("risk") if isinstance(review, dict) else None,
                review=review,
                priorApprovedRenderSha256=prior_hash,
                priorApprovedFrontHtml=prior_front,
                priorApprovedBackHtml=prior_back,
                priorRenderStatus=prior_status,
                targetRegistry="qbank_render_reviews",
                recordKey=f"{item.get('id')}:{note.identity}",
                baseRecordSha256=(
                    canonical_json_sha256(review) if isinstance(review, dict) else None
                ),
                canonicalRecord=review,
                proposedRecordTemplate=proposal_template,
            )
            previews.append(record)
    return previews


def _write_internal_reports(
    candidate: CandidateRelease, inputs: object, review_out: Path, profile: str
) -> None:
    review_out = Path(review_out)
    review_out.mkdir(parents=True, exist_ok=True)
    active = (
        *candidate.core_active,
        *candidate.application_active,
        *candidate.qbank_active,
    )
    repo_root = Path(_input(inputs, "repo_root", Path.cwd()))
    head_result = _run_git(repo_root, "rev-parse", "HEAD")
    generated_from_commit = (
        head_result.stdout.strip() if head_result.returncode == 0 else ""
    )
    withdrawal_previews = []
    history_raw = _input(inputs, "release_history", {})
    try:
        current_history = (
            history_raw
            if isinstance(history_raw, HistoryRegistry)
            else history_from_dict(history_raw)
        )
    except ValueError:
        current_history = HistoryRegistry((), ())
    findings = (
        *candidate.quarantine.new,
        *candidate.quarantine.changed,
        *candidate.quarantine.accepted,
    )
    for finding in findings:
        affected = None
        for release in current_history.releases:
            if any(
                member.get("namespace") == finding.namespace
                and member.get("uid") == finding.uid
                and member.get("identity") == finding.identity
                and member.get("status") == "active"
                for member in release.get("memberships", ())
            ):
                affected = release.get("releaseId")
        if not isinstance(affected, str):
            continue
        previews = preview_withdrawals(
            current_history,
            (
                {
                    "namespace": finding.namespace,
                    "uid": finding.uid,
                    "identity": finding.identity,
                    "reasonCode": finding.reason_code,
                    "affectedReleaseId": affected,
                },
            ),
        )
        for preview in previews:
            rendered = build_withdrawal_note(preview)
            withdrawal_previews.append(
                {
                    "namespace": finding.namespace,
                    "uid": finding.uid,
                    "identity": finding.identity,
                    "reasonCode": finding.reason_code,
                    "affectedReleaseId": affected,
                    "withdrawalTemplateVersion": "pcl-neutral-withdrawal-v1",
                    "approvedWithdrawalSha256": preview.render_sha256,
                    "templateContractSha256": preview.template_contract_sha256,
                    "fields": list(preview.fields),
                    "frontHtml": rendered.front_html,
                    "backHtml": rendered.back_html,
                }
            )
    quarantine_base = {}
    for entry in _input(inputs, "quarantine", ()):
        if not isinstance(entry, dict):
            continue
        key = ":".join(
            str(entry.get(name, ""))
            for name in (
                "namespace",
                "uid",
                "identity",
                "reasonCode",
                "subjectSha256",
            )
        )
        quarantine_base[key] = canonical_json_sha256(entry)
    report = {
        "schemaVersion": 1,
        "reportType": "anki_review_candidate",
        "profile": profile,
        "generatedFromCommit": generated_from_commit,
        "releaseReady": not any(
            issue.severity == "hard" for issue in candidate.issues
        ),
        "releaseId": candidate.release_id,
        "releaseDate": candidate.release_date.isoformat()
        if candidate.release_date
        else None,
        "releaseEpoch": candidate.release_epoch,
        "evaluatedAt": candidate.evaluated_at.isoformat(),
        "governedInputSha256": candidate.governed_input_sha256,
        "qbankItems": list(
            _input(inputs, "question_bank", {}).get("items", ())
        ),
        "evidenceRecords": _input(inputs, "evidence_records", {}),
        "policyRecords": _input(inputs, "policy_records", {}),
        "notes": [_note_dict(note) for note in active],
        "draftAndCurrentPreviews": _draft_previews(inputs),
        "issues": [_issue_dict(issue) for issue in candidate.issues],
        "quarantine": {
            "new": [_finding_dict(value) for value in candidate.quarantine.new],
            "changed": [
                _finding_dict(value) for value in candidate.quarantine.changed
            ],
            "accepted": [
                _finding_dict(value) for value in candidate.quarantine.accepted
            ],
            "resolved": [
                _finding_dict(value) for value in candidate.quarantine.resolved
            ],
        },
        "quarantineBaseRecordSha256": quarantine_base,
        "withdrawals": [
            {
                **_note_dict(value),
                "reasonCode": value.reason_code,
                "affectedReleaseId": value.affected_release_id,
            }
            for value in candidate.withdrawals
        ],
        "withdrawalPreviews": withdrawal_previews,
    }
    (review_out / "review_candidate.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    manifest = {
        "schemaVersion": 1,
        "profile": profile,
        "governedInputSha256": candidate.governed_input_sha256,
        "eligible": [
            f"{note.namespace}:{note.uid}:{note.identity}" for note in active
        ],
        "newlyQuarantined": [
            f"{value.namespace}:{value.uid}:{value.identity}"
            for value in (*candidate.quarantine.new, *candidate.quarantine.changed)
        ],
        "accepted": [
            f"{value.namespace}:{value.uid}:{value.identity}"
            for value in candidate.quarantine.accepted
        ],
        "retired": [
            str(card.get("id"))
            for card in _input(inputs, "cards", ())
            if isinstance(card, dict) and card.get("state") == "retired"
        ],
        "withdrawals": [
            f"{value.namespace}:{value.uid}:{value.identity}"
            for value in candidate.withdrawals
        ],
    }
    (review_out / "candidate_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _raise_hard(candidate: CandidateRelease) -> None:
    hard = tuple(issue for issue in candidate.issues if issue.severity == "hard")
    if hard:
        raise ReleaseOrchestrationError(
            "candidate contains hard issue(s): "
            + "; ".join(f"{issue.code} {issue.subject}" for issue in hard)
        )


def run_profile(
    inputs: object,
    *,
    profile: str,
    out: Path,
    review_out: Path,
    baseline_history: HistoryRegistry,
    candidate_date: date | None = None,
    build_epoch: int | None = None,
    fail_on_hard: bool = False,
    prior_release_dir: Path | None = None,
    history_baseline_path: Path | None = None,
    evaluation_date: date | None = None,
) -> CandidateRelease:
    """Run one already-loaded profile; CLI validation stays outside this seam."""

    if fail_on_hard and profile != "authoring":
        raise ReleaseOrchestrationError("--fail-on-hard is valid only for authoring")
    current_raw = _input(inputs, "release_history", {})
    current_history = None
    if profile != "authoring":
        current_history = (
            current_raw
            if isinstance(current_raw, HistoryRegistry)
            else history_from_dict(current_raw)
        )
        validate_history_baseline(baseline_history, current_history)
    if profile == "authoring":
        evaluation_date = candidate_date or utc_today()
        epoch = build_epoch if build_epoch is not None else INTERNAL_REVIEW_EPOCH
    elif profile == "maintenance":
        if candidate_date is not None or build_epoch is not None:
            raise ReleaseOrchestrationError(
                "date/epoch overrides are valid only for authoring"
            )
        evaluation_date = utc_today()
        epoch = INTERNAL_REVIEW_EPOCH
    else:
        if candidate_date is not None or build_epoch is not None:
            raise ReleaseOrchestrationError(
                "date/epoch overrides are valid only for authoring"
            )
        config = _input(inputs, "release_config", {})
        epoch = config.get("releaseEpoch") if isinstance(config, dict) else None
        if not isinstance(epoch, int) or isinstance(epoch, bool):
            raise ReleaseOrchestrationError(
                "prepare/release requires a configured release epoch"
            )
        evaluation_date = evaluation_date or utc_today()
        configured_date = _configured_release_date(config)
        if configured_date is None:
            raise ReleaseOrchestrationError(
                "prepare/release requires a configured release date"
            )
        if configured_date > evaluation_date:
            raise ReleaseOrchestrationError(
                "configured release date cannot be in the future"
            )

    candidate = evaluate_release(
        inputs,
        build_epoch=epoch,
        evaluation_date=evaluation_date,
        profile=profile,
        baseline_history=baseline_history,
    )
    _write_internal_reports(candidate, inputs, review_out, profile)
    if profile == "authoring":
        if fail_on_hard:
            _raise_hard(candidate)
        out = Path(out)
        if out.name in {"", ".", ".."}:
            raise ReleaseOrchestrationError("authoring output directory is invalid")
        out.mkdir(parents=True, exist_ok=False)
        preview = {
            "schemaVersion": 1,
            "artifactType": "internal_pilot_preview",
            "nonRelease": True,
            "governedInputSha256": candidate.governed_input_sha256,
            "notes": [
                _note_dict(note)
                for note in (
                    *candidate.core_active,
                    *candidate.application_active,
                    *candidate.qbank_active,
                )
            ],
            "issues": [_issue_dict(issue) for issue in candidate.issues],
        }
        (out / "internal-pilot-preview.json").write_text(
            json.dumps(preview, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return candidate
    if profile == "maintenance":
        blockers = classify_maintenance_issues(candidate.issues)
        if blockers:
            raise ReleaseOrchestrationError(
                "maintenance blocker(s): "
                + "; ".join(f"{issue.code} {issue.subject}" for issue in blockers)
            )
        return candidate
    _raise_hard(candidate)
    if history_baseline_path is None or not Path(history_baseline_path).is_file():
        raise ReleaseOrchestrationError("prepare/release requires --history-baseline")
    if prior_release_dir is None or not Path(prior_release_dir).is_dir():
        raise ReleaseOrchestrationError("prepare/release requires actual prior artifacts")
    try:
        receipt = preflight_package_generation(
            candidate,
            baseline_history,
            lambda: write_release(candidate, Path(out)),
        )
    except (ReleaseIdentityError, ValueError) as error:
        raise ReleaseOrchestrationError(str(error)) from error
    inspection = inspect_release(Path(out), receipt)
    inspection_hard = tuple(
        issue for issue in inspection.issues if issue.severity == "hard"
    )
    if inspection_hard:
        raise ReleaseOrchestrationError(
            "candidate inspection failed: "
            + "; ".join(issue.code for issue in inspection_hard)
        )
    assert current_history is not None
    migration = run_candidate_migration(
        Path(prior_release_dir),
        Path(out),
        baseline_history,
        current_history,
        candidate,
    )
    migration_hard = tuple(
        issue for issue in migration.issues if issue.severity == "hard"
    )
    if migration_hard:
            raise ReleaseOrchestrationError(
                "candidate migration failed: "
                + "; ".join(f"{issue.code} {issue.message}" for issue in migration_hard)
            )
    proposal_base = baseline_history
    mode = preflight_release_identity(candidate, baseline_history)
    if mode == "candidate_redeploy":
        release_id = candidate.release_id
        proposal_base = HistoryRegistry(
            tuple(
                entry
                for entry in baseline_history.identity_entries
                if entry.get("firstShippedReleaseId") != release_id
            ),
            baseline_history.releases[:-1],
        )
    history_append = propose_history_append(
        inspection, migration, candidate, proposal_base
    )
    if profile == "prepare":
        write_history_proposal(
            history_append,
            inspection,
            migration,
            candidate,
            Path(review_out),
            Path(history_baseline_path),
            Path(prior_release_dir),
            Path(_input(inputs, "repo_root", Path.cwd())),
        )
        return candidate
    expected = HistoryRegistry(
        (*proposal_base.identity_entries, *history_append.new_identity_entries),
        (*proposal_base.releases, history_append.release_record),
    )
    if canonical_json_bytes(
        {
            "identityEntries": current_history.identity_entries,
            "releases": current_history.releases,
        }
    ) != canonical_json_bytes(
        {
            "identityEntries": expected.identity_entries,
            "releases": expected.releases,
        }
        ):
        current_release = current_history.releases[-1] if current_history.releases else {}
        expected_release = history_append.release_record
        differing = sorted(
            key
            for key in set(current_release) | set(expected_release)
            if canonical_json_bytes(current_release.get(key))
            != canonical_json_bytes(expected_release.get(key))
        )
        raise ReleaseOrchestrationError(
            "release requires the exact reviewed history patch already applied"
            + (f" (differing: {', '.join(differing)})" if differing else "")
        )
    if mode == "candidate_redeploy":
        match_latest_release_rebuild(
            history_append.release_record, current_history
        )
    return candidate


_LEGACY_FIXTURE_SHA256 = {
    "legacy_qbank_2026-07-12.apkg": "07cb14cad54454dc26e441b33058fa4778e515ba0f43cd79881101d0f3c9dfc5",
    "legacy_all_2026-07-12.apkg": "6dea77467f1afdde8996048b959c7d7ca5517322ae3905b4846967b7500771b3",
}


def _migration_issue(code: str, subject: object, message: str) -> MigrationResult:
    return MigrationResult(
        seed_release_id="unverified",
        seed_mode="legacy",
        contract_sha256="0" * 64,
        issues=(Issue(code, "hard", str(subject), message),),
    )


def _load_receipt(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ReleaseOrchestrationError("release receipt root must be an object")
    return value


def _stable_directory_sha256(path: Path) -> str:
    if not path.is_dir():
        raise ReleaseOrchestrationError(f"missing artifact directory: {path}")
    values = {}
    for child in sorted(path.iterdir(), key=lambda value: value.name):
        if child.is_symlink() or not child.is_file():
            raise ReleaseOrchestrationError(
                f"artifact directory contains a non-file: {child.name}"
            )
        values[child.name] = _file_sha256(child)
    if not values:
        raise ReleaseOrchestrationError("artifact directory is empty")
    return canonical_json_sha256(values)


def _original_migration_proof(
    predecessor: dict | None,
    candidate_receipt: dict,
    imported_notes: list,
    imported_cards: list,
) -> tuple[str, str]:
    """Rebuild the first-deployment proof without trusting redeployed artifacts."""

    if predecessor is None:
        seed_release_id = "legacy-qbank-2026-07-12"
        seed_mode = "legacy"
        seed_contract = {"fixtureSha256": dict(_LEGACY_FIXTURE_SHA256)}
    else:
        seed_release_id = predecessor.get("releaseId")
        if not isinstance(seed_release_id, str) or not seed_release_id:
            raise ReleaseOrchestrationError(
                "reviewed predecessor lacks a valid release identity"
            )
        seed_mode = "predecessor"
        seed_contract = {
            "packages": predecessor.get("packages"),
            "csv": predecessor.get("csv"),
            "receiptContractSha256": predecessor.get("receiptContractSha256"),
        }
        if any(value is None for value in seed_contract.values()):
            raise ReleaseOrchestrationError(
                "reviewed predecessor lacks its governed artifact contract"
            )
    contract = {
        "schemaVersion": 1,
        "seedReleaseId": seed_release_id,
        "seedMode": seed_mode,
        "seedContract": seed_contract,
        "candidatePackages": candidate_receipt["packages"],
        "candidateCsv": candidate_receipt["csv"],
        "candidateReceiptContractSha256": candidate_receipt[
            "receiptContractSha256"
        ],
        "result": {"notes": imported_notes, "cards": imported_cards},
    }
    return seed_release_id, canonical_json_sha256(contract)


def _complete_package_projection(package_paths: Iterable[Path]) -> tuple[list, list]:
    """Project the complete last-package-wins state for an import sequence."""

    notes: dict[str, tuple] = {}
    cards: dict[tuple[str, int], tuple] = {}
    for package_path in package_paths:
        snapshot = read_apkg(package_path)
        for note in snapshot.notes:
            notes[note.guid] = (
                note.guid,
                note.model_id,
                tuple(note.fields),
                tuple(sorted(note.tags)),
            )
        for card in snapshot.cards:
            cards.setdefault((card.note_guid, card.ordinal), (
                card.note_guid,
                str(snapshot.decks[card.deck_id]["name"]),
                card.ordinal,
            ))
    return sorted(notes.values()), sorted(cards.values())


def _historically_withdrawn_guids(history: HistoryRegistry) -> set[str]:
    if not history.releases:
        return set()
    values = set()
    for membership in history.releases[-1].get("memberships", ()):
        if not isinstance(membership, dict) or membership.get("status") != "withdrawn":
            continue
        namespace = membership.get("namespace")
        uid = membership.get("uid")
        identity = membership.get("identity", "base")
        if not isinstance(uid, str):
            continue
        if namespace == "core":
            values.add(core_guid(uid))
        elif namespace == "application":
            values.add(application_guid(uid))
        elif namespace == "qbank" and identity in {"base", "tier2"}:
            values.add(legacy_qbank_guid(uid, identity))
    return values


def run_candidate_migration(
    prior_release_dir: Path,
    candidate_dir: Path,
    baseline_history: HistoryRegistry,
    current_history: HistoryRegistry,
    candidate: CandidateRelease,
) -> MigrationResult:
    """Re-verify an actual seed, import it, then import the candidate update."""

    from anki.collection import Collection

    prior_release_dir = Path(prior_release_dir)
    candidate_dir = Path(candidate_dir)
    try:
        mode = preflight_release_identity(candidate, baseline_history)
        latest = baseline_history.releases[-1] if baseline_history.releases else None
        deployment_race = False
        if (
            mode == "new"
            and current_history.releases
            and current_history.releases[-1].get("releaseId") == candidate.release_id
            and {path.name for path in prior_release_dir.iterdir()} == RELEASE_FILENAMES
        ):
            latest = current_history.releases[-1]
            deployment_race = True
            if (
                latest.get("releaseDate")
                != (candidate.release_date.isoformat() if candidate.release_date else None)
                or latest.get("releaseEpoch") != candidate.release_epoch
                or latest.get("governedInputSha256")
                != candidate.governed_input_sha256
                or not isinstance(latest.get("migrationSeedReleaseId"), str)
                or not isinstance(latest.get("migrationContractSha256"), str)
            ):
                raise ReleaseOrchestrationError(
                    "candidate deployment race lacks exact reviewed predecessor proof"
                )
        governed_latest = isinstance(latest, dict) and isinstance(
            latest.get("governedInputSha256"), str
        )
        if not governed_latest:
            seed_mode = "legacy"
            seed_release_id = (
                str(latest.get("releaseId"))
                if isinstance(latest, dict) and latest.get("releaseId")
                else "legacy-qbank-2026-07-12"
            )
            seed_paths = []
            for filename, expected in _LEGACY_FIXTURE_SHA256.items():
                path = prior_release_dir / filename
                if not path.is_file() or _file_sha256(path) != expected:
                    raise ReleaseOrchestrationError(
                        f"legacy migration requires exact frozen fixture {filename}"
                    )
                seed_paths.append(path)
            seed_contract = {
                "fixtureSha256": dict(_LEGACY_FIXTURE_SHA256),
            }
        else:
            seed_mode = (
                "candidate_redeploy"
                if mode == "candidate_redeploy" or deployment_race
                else "predecessor"
            )
            seed_release_id = str(latest["releaseId"])
            if {path.name for path in prior_release_dir.iterdir()} != RELEASE_FILENAMES:
                raise ReleaseOrchestrationError(
                    "governed migration seed requires the exact six release artifacts"
                )
            prior_receipt = _load_receipt(
                prior_release_dir / "anki_release_receipt.json"
            )
            prior_inspection = inspect_release(prior_release_dir, prior_receipt)
            hard = [issue for issue in prior_inspection.issues if issue.severity == "hard"]
            if hard:
                raise ReleaseOrchestrationError(
                    "prior release seed failed receipt-to-payload verification"
                )
            for key in ("packages", "csv", "receiptContractSha256"):
                if canonical_json_bytes(prior_receipt.get(key)) != canonical_json_bytes(
                    latest.get(key)
                ):
                    raise ReleaseOrchestrationError(
                        f"prior release seed {key} differs from reviewed history"
                    )
            seed_paths = [
                prior_release_dir / COMPLETE_ARTIFACT_FILENAME,
                prior_release_dir / QBANK_ARTIFACT_FILENAME,
            ]
            seed_contract = {
                "packages": prior_receipt["packages"],
                "csv": prior_receipt["csv"],
                "receiptContractSha256": prior_receipt["receiptContractSha256"],
            }

        candidate_receipt = _load_receipt(
            candidate_dir / "anki_release_receipt.json"
        )
        candidate_inspection = inspect_release(candidate_dir, candidate_receipt)
        if any(issue.severity == "hard" for issue in candidate_inspection.issues):
            raise ReleaseOrchestrationError(
                "migration candidate failed receipt-to-payload verification"
            )
        candidate_paths = [
            candidate_dir / COMPLETE_ARTIFACT_FILENAME,
            candidate_dir / QBANK_ARTIFACT_FILENAME,
        ]
        seed_notes, _ = _complete_package_projection(seed_paths)
        candidate_notes, _ = _complete_package_projection(candidate_paths)
        candidate_guids = {value[0] for value in candidate_notes}
        withdrawn_guids = _historically_withdrawn_guids(baseline_history)
        unaccounted_seed_guids = sorted(
            value[0]
            for value in seed_notes
            if value[0] not in candidate_guids and value[0] not in withdrawn_guids
        )
        if unaccounted_seed_guids:
            raise ReleaseOrchestrationError(
                "migration seed contains learner-visible identities absent from the "
                "candidate or approved withdrawal history: "
                + ", ".join(unaccounted_seed_guids[:8])
                + (" ..." if len(unaccounted_seed_guids) > 8 else "")
            )
        expected_notes, expected_cards = _complete_package_projection(
            (*seed_paths, *candidate_paths)
        )
        with tempfile.TemporaryDirectory(prefix="pcl-anki-migration-") as temporary:
            collection = Collection(str(Path(temporary) / "collection.anki2"))
            try:
                for package in seed_paths:
                    import_package(collection, package)
                for package in candidate_paths:
                    import_package(collection, package)
                imported_notes = sorted(
                    (
                        guid,
                        mid,
                        tuple(fields.split("\x1f")),
                        tuple(sorted(tags.split())),
                    )
                    for guid, mid, fields, tags in collection.db.all(
                        "select guid, mid, flds, tags from notes order by guid"
                    )
                )
                imported_cards = sorted(
                    (
                        guid,
                        str(collection.decks.get(did)["name"]),
                        ordinal,
                    )
                    for guid, did, ordinal in collection.db.all(
                        "select n.guid, c.did, c.ord from cards c join notes n on n.id = c.nid order by n.guid, c.ord"
                    )
                )
            finally:
                collection.close()
        if imported_notes != expected_notes or imported_cards != expected_cards:
            detail = "unknown"
            for actual, wanted in zip(imported_notes, expected_notes):
                if actual != wanted:
                    detail = f"note {wanted[0]} components=" + ",".join(
                        name
                        for name, left, right in zip(
                            ("guid", "model", "fields", "tags"), actual, wanted
                        )
                        if left != right
                    )
                    break
            else:
                for actual, wanted in zip(imported_cards, expected_cards):
                    if actual != wanted:
                        detail = f"card {wanted[0]} components=" + ",".join(
                            name
                            for name, left, right in zip(
                                ("guid", "deck", "ordinal"), actual, wanted
                            )
                            if left != right
                        )
                        break
            raise ReleaseOrchestrationError(
                "post-import candidate projection differs from inspected candidate "
                f"(notes {len(imported_notes)}/{len(expected_notes)}, cards {len(imported_cards)}/{len(expected_cards)}, {detail})"
            )
        contract = {
            "schemaVersion": 1,
            "seedReleaseId": seed_release_id,
            "seedMode": seed_mode,
            "seedContract": seed_contract,
            "candidatePackages": candidate_receipt["packages"],
            "candidateCsv": candidate_receipt["csv"],
            "candidateReceiptContractSha256": candidate_receipt[
                "receiptContractSha256"
            ],
            "result": {
                "notes": imported_notes,
                "cards": imported_cards,
            },
        }
        if mode == "candidate_redeploy" or deployment_race:
            if mode == "candidate_redeploy":
                predecessor = (
                    baseline_history.releases[-2]
                    if len(baseline_history.releases) > 1
                    else None
                )
            else:
                predecessor = (
                    baseline_history.releases[-1]
                    if baseline_history.releases
                    else None
                )
            reconstructed_seed, reconstructed_contract = _original_migration_proof(
                predecessor,
                candidate_receipt,
                imported_notes,
                imported_cards,
            )
            if (
                reconstructed_seed != latest.get("migrationSeedReleaseId")
                or reconstructed_contract != latest.get("migrationContractSha256")
            ):
                raise ReleaseOrchestrationError(
                    "candidate redeploy predecessor migration proof does not recompute"
                )
        recorded_seed = (
            latest.get("migrationSeedReleaseId")
            if (mode == "candidate_redeploy" or deployment_race) and isinstance(latest, dict)
            else seed_release_id
        )
        recorded_contract = (
            latest.get("migrationContractSha256")
            if (mode == "candidate_redeploy" or deployment_race) and isinstance(latest, dict)
            else canonical_json_sha256(contract)
        )
        if not isinstance(recorded_seed, str) or not isinstance(recorded_contract, str):
            raise ReleaseOrchestrationError(
                "candidate redeploy lacks the exact recorded predecessor migration proof"
            )
        return MigrationResult(
            seed_release_id=recorded_seed,
            seed_mode=seed_mode,
            contract_sha256=recorded_contract,
            issues=(),
        )
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        return _migration_issue(
            "MIGRATION_PROOF_FAILED", prior_release_dir, str(error)
        )


def _history_append_dict(value) -> dict[str, object]:
    return {
        "newIdentityEntries": list(value.new_identity_entries),
        "releaseRecord": value.release_record,
    }


def write_history_proposal(
    history_append,
    inspection,
    migration: MigrationResult,
    candidate: CandidateRelease,
    review_out: Path,
    history_baseline_path: Path,
    prior_release_dir: Path,
    repo_root: Path,
) -> Path:
    """Serialize a non-applicable mechanical proposal after all real gates pass."""

    review_out = Path(review_out)
    manifest_path = review_out / "candidate_manifest.json"
    if not manifest_path.is_file():
        raise ReleaseOrchestrationError("candidate manifest is missing")
    head = _run_git(Path(repo_root), "rev-parse", "HEAD")
    if head.returncode != 0:
        raise ReleaseOrchestrationError("cannot bind history proposal to Git HEAD")
    proposal = {
        "schemaVersion": 1,
        "proposalType": "release_history",
        "generatedFromCommit": head.stdout.strip(),
        "inputSha256": candidate.governed_input_sha256,
        "historyAppend": _history_append_dict(history_append),
        "context": {
            "candidateManifestSha256": _file_sha256(manifest_path),
            "inspectedFilesSha256": dict(sorted(inspection.artifact_sha256.items())),
            "historyBaselineSha256": _file_sha256(history_baseline_path),
            "priorReleaseSeedSha256": _stable_directory_sha256(prior_release_dir),
            "migrationProofSha256": migration.contract_sha256,
            "deterministicCsvSha256": inspection.receipt["csv"]["sha256"],
            "receiptContractSha256": inspection.receipt[
                "receiptContractSha256"
            ],
        },
    }
    from pcl_anki.review import validate_history_proposal

    validate_history_proposal(proposal)
    path = review_out / "release_history.proposal.json"
    path.write_text(
        json.dumps(proposal, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def require_clean_tracked_worktree(repo: Path) -> None:
    status = _run_git(Path(repo), "status", "--porcelain", "--untracked-files=no")
    if status.returncode != 0 or status.stdout.strip():
        raise ReleaseOrchestrationError(
            "prepare/release requires a clean tracked worktree"
        )


def _read_json(path: Path, loaded: set[Path]) -> object:
    loaded.add(path)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ReleaseOrchestrationError(f"cannot read governed JSON {path}: {error}") from error


def _governed_static_paths(repo: Path) -> set[Path]:
    automation = repo / "13_Faculty_Resources" / "_automation" / "anki"
    values = {
        path
        for path in automation.rglob("*")
        if path.is_file()
        and "__pycache__" not in path.parts
        and path.suffix in {".py", ".sh", ".json", ".in", ".lock", ".html", ".css", ".js", ".mjs"}
    }
    site_build = repo / "13_Faculty_Resources" / "_automation" / "site_build"
    for name in (
        "build_and_check.sh",
        "build_anki.sh",
        "build_deploy.py",
        "check-static-site.mjs",
        "export_anki.py",
        "export_anki_all.py",
        "export_anki_content.py",
        "site_manifest.json",
        "spa_index.html",
    ):
        values.add(site_build / name)
    values.update(
        {
            repo / "09_Exam_Prep" / "anki_export" / "anki.md",
            automation / "requirements.lock",
        }
    )
    return values


def load_policy_records(repo: Path, loaded: set[Path]) -> dict[str, dict]:
    """Load the closed policy registry and bind every referenced passage byte."""

    repo = Path(repo).resolve(strict=True)
    registry_dir = repo / "13_Faculty_Resources" / "anki"
    registry_path = registry_dir / "policy_registry.json"
    schema_path = registry_dir / "policy_registry.schema.json"
    registry = _read_json(registry_path, loaded)
    _read_json(schema_path, loaded)
    issues = validate_registry(registry_path, schema_path)
    if issues:
        raise ReleaseOrchestrationError(
            "policy registry validation failed: "
            + "; ".join(f"{issue.code} {issue.subject}" for issue in issues)
        )
    policies = registry.get("policies", ()) if isinstance(registry, dict) else ()
    records: dict[str, dict] = {}
    for record in policies:
        policy_id = record["id"]
        if policy_id in records:
            raise ReleaseOrchestrationError(f"duplicate policy record: {policy_id}")
        passage = repo / record["path"]
        _repo_relative(repo, passage)
        loaded.add(passage)
        try:
            markdown = passage.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise ReleaseOrchestrationError(
                f"cannot read policy passage {policy_id}: {error}"
            ) from error
        matching_sections = [
            section
            for section in parse_markdown_sections(markdown)
            if section.anchor == record["anchor"]
        ]
        if len(matching_sections) != 1:
            raise ReleaseOrchestrationError(
                f"policy anchor must resolve exactly once: {policy_id}"
            )
        passage_sha256 = sha256(
            matching_sections[0].normalized_text.encode("utf-8")
        ).hexdigest()
        if passage_sha256 != record["passageSha256"]:
            raise ReleaseOrchestrationError(
                f"policy passage hash differs from registry: {policy_id}"
            )
        records[policy_id] = record
    return records


def load_release_inputs(repo: Path) -> SimpleNamespace:
    """Load canonical release inputs and freeze their complete access ledger."""

    repo = Path(repo).resolve(strict=True)
    registry = repo / "13_Faculty_Resources" / "anki"
    loaded: set[Path] = set()
    paths = {
        "cards": registry / "cards.json",
        "cards_schema": registry / "cards.schema.json",
        "qbank_reviews": registry / "qbank_render_reviews.json",
        "qbank_reviews_schema": registry / "qbank_render_reviews.schema.json",
        "quarantine": registry / "quarantine.json",
        "quarantine_schema": registry / "quarantine.schema.json",
        "release_config": registry / "release_config.json",
        "release_config_schema": registry / "release_config.schema.json",
        "release_history": registry / "release_history.json",
        "release_history_schema": registry / "release_history.schema.json",
        "question_bank": repo / "question_bank.json",
        "question_bank_schema": repo / "question_bank.schema.json",
        "manifest": repo
        / "13_Faculty_Resources"
        / "_automation"
        / "site_build"
        / "site_manifest.json",
        "reviewed": repo / "13_Faculty_Resources" / "reviewed.json",
        "surveillance": repo
        / "13_Faculty_Resources"
        / "_automation"
        / "surveillance"
        / "config"
        / "needs_reattest.json",
        "evidence": repo / "evidence_registry.json",
        "evidence_schema": repo / "evidence_registry.schema.json",
    }
    raw = {name: _read_json(path, loaded) for name, path in paths.items()}
    input_issues = []
    for value, schema in (
        (paths["cards"], paths["cards_schema"]),
        (paths["qbank_reviews"], paths["qbank_reviews_schema"]),
        (paths["quarantine"], paths["quarantine_schema"]),
        (paths["release_config"], paths["release_config_schema"]),
        (paths["release_history"], paths["release_history_schema"]),
        (paths["question_bank"], paths["question_bank_schema"]),
        (paths["evidence"], paths["evidence_schema"]),
    ):
        input_issues.extend(validate_registry(value, schema))
    manifest = load_manifest(paths["manifest"])
    config = raw["release_config"]
    if not isinstance(config, dict):
        raise ReleaseOrchestrationError("release config root must be an object")
    sequence_path = config.get("sequenceMapPath")
    if not isinstance(sequence_path, str):
        raise ReleaseOrchestrationError("release config sequence map is required")
    loaded.add(repo / sequence_path)
    for relative in config.get("sequencingOnlyPaths", ()):
        if isinstance(relative, str):
            loaded.add(repo / relative)
    cards_root = raw["cards"]
    question_bank = raw["question_bank"]
    cards = cards_root.get("cards", ()) if isinstance(cards_root, dict) else ()
    items = question_bank.get("items", ()) if isinstance(question_bank, dict) else ()
    for card in cards:
        source = card.get("source") if isinstance(card, dict) else None
        relative = source.get("path") if isinstance(source, dict) else None
        if isinstance(relative, str):
            loaded.add(repo / relative)
    for item in items:
        if not isinstance(item, dict):
            continue
        for slug in item.get("pages", ()):
            relative = manifest.slug_to_path.get(slug)
            if relative:
                loaded.add(repo / relative)
    prior_package_paths = (
        repo / LEGACY_STANDALONE_RELATIVE_PATH,
        repo / LEGACY_COMBINED_RELATIVE_PATH,
    )
    loaded.update(prior_package_paths)
    policy_records = load_policy_records(repo, loaded)
    loaded.update(_governed_static_paths(repo))
    snapshot = capture_governed_inputs(repo, sorted(loaded))
    evidence = raw["evidence"]
    history = load_history(paths["release_history"])
    return SimpleNamespace(
        mode="authoring",
        repo_root=repo,
        cards=tuple(cards),
        question_bank=question_bank,
        question_bank_schema=raw["question_bank_schema"],
        manifest=manifest,
        qbank_reviews=tuple(
            raw["qbank_reviews"].get("reviews", ())
            if isinstance(raw["qbank_reviews"], dict)
            else ()
        ),
        quarantine=tuple(
            raw["quarantine"].get("accepted", ())
            if isinstance(raw["quarantine"], dict)
            else ()
        ),
        release_history=history_to_dict(history),
        release_config=config,
        reviewed=raw["reviewed"],
        surveillance=raw["surveillance"],
        evidence_records=evidence,
        policy_records=policy_records,
        prior_package_paths=prior_package_paths,
        input_issues=tuple(input_issues),
        governed_input_sha256=snapshot.sha256,
        governed_input_ledger=snapshot.ledger,
    )
