"""Fail-closed Anki approval, quarantine, role-safety, and coverage gates."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from datetime import date
import html
from pathlib import Path
import re
import subprocess
from typing import Any
import unicodedata

from pcl_anki.contract import (
    CardDecision,
    Identity,
    Issue,
    QuarantineFinding,
    QuarantineResult,
    RenderedNote,
    canonical_json_sha256,
)
from pcl_anki.qbank import qbank_item_sha256
from pcl_anki.render import (
    TEMPLATE_CONTRACTS,
    TEMPLATE_CONTRACT_SHA256,
    build_qbank_notes,
    render_card,
)


WITHDRAWAL_TEMPLATE_VERSION = "pcl-neutral-withdrawal-v1"
HIGH_FACETS = frozenset(
    {
        "Medication",
        "Emergency",
        "Pregnancy",
        "Legal",
        "Regulatory",
        "Numerical",
        "EvidenceSensitive",
    }
)
CORE_DOMAINS = (
    "Diagnosis",
    "Psychopharmacology",
    "Safety",
    "Communication",
    "PsychotherapyFormulation",
    "DispositionHandoff",
)
APPLICATION_TASK_BUNDLES = (
    "Diagnosis",
    "NextStep",
    "Safety",
    "Pharmacology",
    "Psychosocial",
    "Disposition",
)
CORE_FAMILIES = frozenset(
    {
        "Discriminator",
        "StudentAction",
        "Escalation",
        "Monitor",
        "WordsToSay",
        "TherapyMatch",
        "Disposition",
    }
)
CORE_TASKS = frozenset(
    {"Recognize", "Discriminate", "Ask", "Say", "Escalate", "Monitor", "Handoff"}
)
ROLE_CAVEAT_FAMILIES = frozenset(
    {"StudentAction", "Escalation", "Monitor", "Disposition"}
)
_SUPERVISION_RE = re.compile(
    r"\b(?:supervis\w*|attending|resident|clinical\s+team|teaching\s+team|"
    r"escalat\w*|notif(?:y|ies|ied)|consult\w*)\b",
    re.IGNORECASE,
)
_UNSAFE_ACTION_RE = re.compile(
    r"\b(?:the\s+student|you)\s+(?:should|must|can)\s+"
    r"(?!not\b|never\b|avoid\b)(?:independently\s+)?"
    r"(?:prescribe|discharge|medically\s+clear|restrain|"
    r"determine\s+(?:the\s+)?legal\s+disposition|titrate)\b",
    re.IGNORECASE,
)
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class GovernanceError(ValueError):
    """Raised when release mode encounters one or more hard governance issues."""

    def __init__(self, issues: Iterable[Issue]):
        self.issues = tuple(issues)
        super().__init__("; ".join(f"{issue.code}: {issue.subject}" for issue in self.issues))


def _input(inputs: object, name: str, default: Any) -> Any:
    if isinstance(inputs, Mapping):
        return inputs.get(name, default)
    return getattr(inputs, name, default)


def _issue(code: str, subject: object, message: str, severity: str = "hard") -> Issue:
    return Issue(code=code, severity=severity, subject=str(subject), message=message)


def _hard(issues: Iterable[Issue]) -> bool:
    return any(issue.severity == "hard" for issue in issues)


def _mode(inputs: object) -> str:
    explicit = _input(inputs, "mode", None)
    if explicit in {"authoring", "release"}:
        return explicit
    config = _input(inputs, "release_config", {})
    return "release" if isinstance(config, Mapping) and config.get("siteMode") == "release" else "authoring"


def _finish(decision: CardDecision, inputs: object) -> CardDecision:
    if _mode(inputs) == "release" and _hard(decision.issues):
        raise GovernanceError(decision.issues)
    return decision


def _parse_date(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _named(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _reviewed_source_issues(source: Mapping, reviewed: object, subject: str) -> list[Issue]:
    if not isinstance(reviewed, Mapping):
        return [_issue("SOURCE_REVIEW_REQUIRED", subject, "reviewed source registry is missing")]
    if isinstance(reviewed.get("items"), Mapping):
        reviewed = reviewed["items"]
    path = source.get("path")
    slug = source.get("slug")
    record = reviewed.get(path) or reviewed.get(slug)
    if record is None and isinstance(slug, str):
        record = next(
            (
                value
                for key, value in reviewed.items()
                if isinstance(key, str) and key.endswith("/" + slug)
            ),
            None,
        )
    status = None
    if isinstance(record, Mapping):
        status = record.get("status") or record.get("reviewStatus")
    if status != "reviewed":
        return [
            _issue(
                "SOURCE_REVIEW_REQUIRED",
                subject,
                "the exact source page must have reviewed status before card approval",
            )
        ]
    return []


def _record_mapping(records: object, *, collection_key: str | None = None) -> Mapping:
    if not isinstance(records, Mapping):
        return {}
    if collection_key and isinstance(records.get(collection_key), Sequence):
        return {
            record.get("id"): record
            for record in records[collection_key]
            if isinstance(record, Mapping) and _named(record.get("id"))
        }
    return records


def _risk_review_issues(
    risk: object,
    review: object,
    inputs: object,
    candidate_date: date,
    subject: str,
) -> list[Issue]:
    issues: list[Issue] = []
    risk = risk if isinstance(risk, Mapping) else {}
    review = review if isinstance(review, Mapping) else {}
    level = risk.get("level")
    facets_value = risk.get("facets")
    facets = set(facets_value) if isinstance(facets_value, Sequence) and not isinstance(facets_value, str) else set()
    if facets & HIGH_FACETS and level != "High":
        issues.append(
            _issue(
                "HIGH_RISK_LABEL_REQUIRED",
                subject,
                "the declared facet requires risk.level High",
            )
        )

    due = _parse_date(review.get("reviewDue"))
    if level == "High":
        reference = review.get("evidenceRecord")
        evidence_id = (
            reference.removeprefix("evidence_registry.json#")
            if isinstance(reference, str) and reference.startswith("evidence_registry.json#")
            else None
        )
        evidence_records = _record_mapping(
            _input(inputs, "evidence_records", {}), collection_key="sources"
        )
        record = evidence_records.get(evidence_id) if evidence_id else None
        required = (
            _named(review.get("evidenceCitation"))
            and evidence_id is not None
            and _named(review.get("evidenceReviewedBy"))
            and _parse_date(review.get("evidenceReviewedAt")) is not None
            and _named(review.get("evidenceSha256"))
            and due is not None
        )
        if not required:
            issues.append(
                _issue(
                    "EVIDENCE_REVIEW_REQUIRED",
                    subject,
                    "High risk requires an exact named and dated evidence review",
                )
            )
        if not isinstance(record, Mapping) or (
            record.get("facultyReviewStatus")
            or record.get("reviewStatus")
            or record.get("status")
        ) != "reviewed":
            issues.append(
                _issue(
                    "EVIDENCE_RECORD_INVALID",
                    subject,
                    "the exact evidence source ID must exist with reviewed status",
                )
            )
        elif review.get("evidenceSha256") != canonical_json_sha256(record):
            issues.append(
                _issue(
                    "EVIDENCE_RECORD_DRIFT",
                    subject,
                    "the approved evidence hash no longer matches the exact registry record",
                )
            )

    if "LocalPolicy" in facets:
        reference = review.get("localPolicySource")
        policy_id = None
        if _named(reference):
            policy_id = reference.split("#", 1)[1] if "#" in reference else reference
        policy_records = _record_mapping(_input(inputs, "policy_records", {}))
        record = policy_records.get(policy_id) if policy_id else None
        required = (
            policy_id is not None
            and _named(review.get("localPolicyReviewedBy"))
            and _parse_date(review.get("localPolicyReviewedAt")) is not None
            and _named(review.get("localPolicySha256"))
            and due is not None
        )
        if not required:
            issues.append(
                _issue(
                    "LOCAL_POLICY_REVIEW_REQUIRED",
                    subject,
                    "LocalPolicy requires an exact named and dated policy review",
                )
            )
        valid_record = isinstance(record, Mapping) and all(
            _named(record.get(field))
            for field in ("version", "owner", "path", "anchor", "passageSha256")
        )
        if valid_record and not _SHA256_RE.fullmatch(str(record.get("passageSha256"))):
            valid_record = False
        if not valid_record:
            issues.append(
                _issue(
                    "LOCAL_POLICY_RECORD_INVALID",
                    subject,
                    "the versioned policy record needs owner, path, anchor, and passage hash",
                )
            )
        elif review.get("localPolicySha256") != record.get("passageSha256"):
            issues.append(
                _issue(
                    "LOCAL_POLICY_RECORD_DRIFT",
                    subject,
                    "the approved local-policy hash no longer matches the exact passage",
                )
            )

    if (level == "High" or "LocalPolicy" in facets) and due is not None and due < candidate_date:
        issues.append(
            _issue(
                "REVIEW_EXPIRED",
                subject,
                f"reviewDue {due.isoformat()} precedes candidate date {candidate_date.isoformat()}",
            )
        )
    return issues


def _find_qbank_item(inputs: object, item_id: object) -> Mapping | None:
    for item in _input(inputs, "qbank_items", ()):
        if isinstance(item, Mapping) and item.get("id") == item_id:
            return item
    return None


def _live_core_target(card: Mapping, cards: Iterable[Mapping]) -> Mapping | None:
    target_id = card.get("reinforces")
    if not _named(target_id) or target_id == card.get("id"):
        return None
    target = next(
        (candidate for candidate in cards if candidate.get("id") == target_id), None
    )
    if not isinstance(target, Mapping):
        return None
    if target.get("kind") not in {"basic", "cloze"} or target.get("state") != "approved":
        return None
    if not isinstance(target.get("week"), int) or target["week"] > card.get("week", 0):
        return None
    try:
        rendered = render_card(target)
    except (KeyError, TypeError, ValueError):
        return None
    review = target.get("review") if isinstance(target.get("review"), Mapping) else {}
    if review.get("approvedCardSha256") != rendered.render_sha256:
        return None
    return target


def _application_issues(card: Mapping, cards: Iterable[Mapping]) -> list[Issue]:
    if card.get("kind") != "application":
        return []
    qbank = card.get("qbank") if isinstance(card.get("qbank"), Mapping) else {}
    issues = []
    if not _named(qbank.get("taskBundle")):
        issues.append(
            _issue(
                "APPLICATION_TASK_BUNDLE_REQUIRED",
                card.get("id", "<missing-id>"),
                "Application cards require one primary taskBundle",
            )
        )
    if _live_core_target(card, cards) is None:
        issues.append(
            _issue(
                "APPLICATION_REINFORCES_INVALID",
                card.get("id", "<missing-id>"),
                "Application reinforces must name an exact live approved Core from the same or earlier week",
            )
        )
    return issues


def validate_role_safety(cards: Iterable[Mapping]) -> list[Issue]:
    """Reject independent MS3 actions and require explicit supervision caveats."""

    issues: list[Issue] = []
    for card in cards:
        if not isinstance(card, Mapping) or card.get("state") != "approved":
            continue
        subject = str(card.get("id", "<missing-id>"))
        answer = str(card.get("answer", ""))
        if _UNSAFE_ACTION_RE.search(answer):
            issues.append(
                _issue(
                    "ROLE_SAFETY_UNSAFE_INDEPENDENT_ACTION",
                    subject,
                    "the direct answer assigns an independent clinical/legal action to an MS3",
                )
            )
        risk = card.get("risk") if isinstance(card.get("risk"), Mapping) else {}
        facets = set(risk.get("facets", ())) if isinstance(risk.get("facets"), Sequence) else set()
        caveat_required = (
            card.get("family") in ROLE_CAVEAT_FAMILIES
            or risk.get("level") == "High"
            or bool(facets & {"Legal", "Regulatory"})
        )
        if caveat_required and not _SUPERVISION_RE.search(str(card.get("caveat", ""))):
            issues.append(
                _issue(
                    "ROLE_SAFETY_CAVEAT_REQUIRED",
                    subject,
                    "this card requires an explicit supervision or escalation caveat",
                )
            )
    return issues


def _ledger_entries(ledger: object) -> tuple[Mapping, ...]:
    if isinstance(ledger, Mapping):
        ledger = ledger.get("accepted", ())
    if not isinstance(ledger, Sequence) or isinstance(ledger, (str, bytes)):
        return ()
    return tuple(entry for entry in ledger if isinstance(entry, Mapping))


def _decision_key(value: Mapping | QuarantineFinding) -> tuple[object, ...]:
    if isinstance(value, QuarantineFinding):
        return (value.namespace, value.uid, value.identity, value.reason_code)
    return (
        value.get("namespace"),
        value.get("uid"),
        value.get("identity"),
        value.get("reasonCode"),
    )


def _valid_ledger_decision(entry: Mapping, finding: QuarantineFinding) -> bool:
    if entry.get("subjectSha256") != finding.subject_sha256:
        return False
    if (
        entry.get("sourcePath") != finding.source_path
        or entry.get("firstSeenCommit") != finding.first_seen_commit
    ):
        return False
    if not all(
        _named(entry.get(field))
        for field in ("reviewOwner", "reviewedBy", "reviewedAt", "firstSeenCommit")
    ):
        return False
    if _parse_date(entry.get("reviewedAt")) is None:
        return False
    disposition = entry.get("disposition")
    if disposition in {"exclude", "retire"}:
        return True
    if disposition != "withdraw":
        return False
    return (
        _named(entry.get("affectedReleaseId"))
        and entry.get("withdrawalTemplateVersion") == WITHDRAWAL_TEMPLATE_VERSION
        and finding.withdrawal_render_sha256 is not None
        and entry.get("approvedWithdrawalSha256") == finding.withdrawal_render_sha256
    )


def _accepted_quarantine(note: RenderedNote, inputs: object) -> bool:
    for entry in _ledger_entries(_input(inputs, "quarantine", ())):
        if (
            entry.get("namespace") == note.namespace
            and entry.get("uid") == note.uid
            and entry.get("identity") == note.identity
            and entry.get("subjectSha256") == note.render_sha256
            and entry.get("disposition") in {"exclude", "retire", "withdraw"}
            and _named(entry.get("reviewedBy"))
            and _parse_date(entry.get("reviewedAt")) is not None
        ):
            return True
    return False


def evaluate_card(card: Mapping, inputs: object, candidate_date: date) -> CardDecision:
    """Evaluate one Core/Application card while preserving authoring previews."""

    namespace = "application" if card.get("kind") == "application" else "core"
    subject = str(card.get("id", "<missing-id>"))
    issues = _application_issues(card, _input(inputs, "cards", ()))
    qbank_item = None
    if namespace == "application":
        qbank = card.get("qbank") if isinstance(card.get("qbank"), Mapping) else {}
        qbank_item = _find_qbank_item(inputs, qbank.get("id"))
        if qbank_item is None:
            issues.append(
                _issue(
                    "APPLICATION_QBANK_ITEM_REQUIRED",
                    subject,
                    "Application rendering requires the exact canonical qbank item",
                )
            )

    rendered = None
    if not any(issue.code in {"APPLICATION_TASK_BUNDLE_REQUIRED", "APPLICATION_QBANK_ITEM_REQUIRED"} for issue in issues):
        try:
            rendered = render_card(card, qbank_item=qbank_item)
        except (KeyError, TypeError, ValueError) as error:
            issues.append(_issue("CARD_RENDER_INVALID", subject, str(error)))

    source = card.get("source") if isinstance(card.get("source"), Mapping) else {}
    issues.extend(
        _reviewed_source_issues(source, _input(inputs, "reviewed", {}), subject)
    )
    review = card.get("review") if isinstance(card.get("review"), Mapping) else {}
    issues.extend(
        _risk_review_issues(
            card.get("risk"), review, inputs, candidate_date, subject
        )
    )
    issues.extend(validate_role_safety((card,)))

    if rendered is not None:
        if not (
            _named(review.get("cardApprovedBy"))
            and _parse_date(review.get("cardApprovedAt")) is not None
            and _named(review.get("approvedCardSha256"))
        ):
            issues.append(
                _issue(
                    "CARD_APPROVAL_REQUIRED",
                    subject,
                    "every release card requires a named, dated exact render approval",
                )
            )
        elif review.get("approvedCardSha256") != rendered.render_sha256:
            issues.append(
                _issue(
                    "CARD_APPROVAL_DRIFT",
                    subject,
                    "the displayed approval hash no longer matches the exact current render",
                )
            )

    state = card.get("state")
    if state == "quarantined":
        issues.append(
            _issue(
                "CARD_QUARANTINED",
                subject,
                "quarantined cards remain excluded even when source and approval hashes match",
                severity="review",
            )
        )
        if rendered is None or not _accepted_quarantine(rendered, inputs):
            issues.append(
                _issue(
                    "QUARANTINE_UNACCEPTED",
                    subject,
                    "new or changed quarantine requires an exact accepted ledger decision",
                )
            )
    elif state == "retired":
        issues.append(
            _issue(
                "CARD_RETIRED", subject, "retired cards are tombstones", severity="info"
            )
        )
    elif state != "approved":
        issues.append(
            _issue(
                "CARD_NOT_APPROVED",
                subject,
                "draft cards may be previewed in authoring but cannot enter a release",
            )
        )

    eligible = state == "approved" and rendered is not None and not _hard(issues)
    return _finish(
        CardDecision(
            namespace=namespace,
            uid=subject,
            identity="base",
            eligible=eligible,
            rendered=rendered,
            issues=tuple(issues),
        ),
        inputs,
    )


def evaluate_qbank_note(
    item: Mapping, identity: Identity, inputs: object, candidate_date: date
) -> CardDecision:
    """Evaluate one base/Tier-2 qbank render independently of item attestation."""

    subject = str(item.get("id", "<missing-id>"))
    issues: list[Issue] = []
    rendered = None
    try:
        notes = build_qbank_notes(item)
        rendered = next((note for note in notes if note.identity == identity), None)
        if rendered is None:
            issues.append(
                _issue(
                    "QBANK_IDENTITY_MISSING",
                    f"{subject}:{identity}",
                    "the requested qbank identity does not exist",
                )
            )
    except (KeyError, TypeError, ValueError) as error:
        issues.append(_issue("QBANK_RENDER_INVALID", subject, str(error)))

    if item.get("status") != "attested" or item.get("retired") is True:
        issues.append(
            _issue(
                "QBANK_NOT_ATTESTED",
                subject,
                "only current attested non-retired items are eligible",
            )
        )

    review = next(
        (
            candidate
            for candidate in _input(inputs, "qbank_reviews", ())
            if isinstance(candidate, Mapping)
            and candidate.get("qbankId") == subject
            and candidate.get("identity") == identity
        ),
        None,
    )
    if not isinstance(review, Mapping):
        issues.append(
            _issue(
                "QBANK_RENDER_REVIEW_REQUIRED",
                f"{subject}:{identity}",
                "attestation never substitutes for a rendered-note faculty approval",
            )
        )
    elif rendered is not None:
        expected_version = TEMPLATE_CONTRACTS["legacyQbank"]["templateVersion"]
        exact = (
            _named(review.get("facultyApprovedBy"))
            and _parse_date(review.get("facultyApprovedAt")) is not None
            and review.get("approvedItemSha256") == qbank_item_sha256(item)
            and review.get("templateVersion") == expected_version
            and review.get("templateContractSha256")
            == TEMPLATE_CONTRACT_SHA256["legacyQbank"]
            and review.get("renderedNoteSha256") == rendered.render_sha256
        )
        if not exact:
            issues.append(
                _issue(
                    "QBANK_RENDER_APPROVAL_DRIFT",
                    f"{subject}:{identity}",
                    "the exact qbank item/template/render approval no longer matches",
                )
            )
        issues.extend(
            _risk_review_issues(
                review.get("risk"), review, inputs, candidate_date, f"{subject}:{identity}"
            )
        )

    page = review.get("primaryPage") if isinstance(review, Mapping) else None
    source = {"path": page, "slug": page}
    issues.extend(
        _reviewed_source_issues(
            source, _input(inputs, "reviewed", {}), f"{subject}:{identity}"
        )
    )
    eligible = rendered is not None and not _hard(issues)
    return _finish(
        CardDecision(
            namespace="qbank",
            uid=subject,
            identity=identity,
            eligible=eligible,
            rendered=rendered,
            issues=tuple(issues),
        ),
        inputs,
    )


def _normalize_duplicate_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", html.unescape(str(value))).casefold()
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r" \1 ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r" \1 ", text)
    text = re.sub(r"[`*_~>#]", " ", text)
    text = "".join(character if character.isalnum() else " " for character in text)
    return re.sub(r"\s+", " ", text).strip()


def _jaccard(left: str, right: str) -> float:
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    union = left_tokens | right_tokens
    return len(left_tokens & right_tokens) / len(union) if union else 0.0


def _first_seen(inputs: object, uid: str, source_path: str | None) -> str:
    configured = _input(inputs, "first_seen_commit", None)
    if _named(configured):
        return configured
    repo = Path(_input(inputs, "repo_root", Path.cwd()))
    path = source_path or "question_bank.json"
    try:
        result = subprocess.run(
            [
                "git",
                "log",
                "--reverse",
                "--format=%H",
                "-S",
                f'"id": "{uid}"',
                "--",
                path,
            ],
            cwd=repo,
            check=True,
            capture_output=True,
            text=True,
        )
        commit = next((line for line in result.stdout.splitlines() if line), "")
        if commit:
            return commit
    except (OSError, subprocess.CalledProcessError):
        pass
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "0000000"


def _finding(
    card: Mapping,
    target: Mapping,
    note: RenderedNote,
    reason_code: str,
    field: str,
    normalized: str,
    inputs: object,
    withdrawal_hash: str | None,
) -> QuarantineFinding:
    source = card.get("source") if isinstance(card.get("source"), Mapping) else {}
    source_path = source.get("path") if isinstance(source.get("path"), str) else None
    return QuarantineFinding(
        namespace=note.namespace,
        uid=note.uid,
        identity=note.identity,
        reason_code=reason_code,
        subject_sha256=canonical_json_sha256(
            {
                "field": field,
                "normalized": normalized,
                "target": target.get("id"),
                "targetApproval": (
                    target.get("review", {}).get("approvedCardSha256")
                    if isinstance(target.get("review"), Mapping)
                    else None
                ),
            }
        ),
        source_path=source_path,
        first_seen_commit=_first_seen(inputs, note.uid, source_path),
        withdrawal_render_sha256=withdrawal_hash,
    )


def detect_quarantines(
    inputs: object,
    rendered_notes: Iterable[RenderedNote],
    candidate_date: date,
) -> tuple[QuarantineFinding, ...]:
    """Detect configured safety holds and unwaived normalized duplicates."""

    del candidate_date  # Reserved for future time-sensitive finding detectors.
    notes = tuple(rendered_notes)
    active_by_key = {
        (note.namespace, note.uid, note.identity): note
        for note in notes
        if note.active and not note.withdrawn
    }
    withdrawals = {
        (note.namespace, note.uid, note.identity): note.render_sha256
        for note in notes
        if note.withdrawn
    }
    findings: list[QuarantineFinding] = []
    config = _input(inputs, "release_config", {})
    holds = config.get("knownSafetyHolds", ()) if isinstance(config, Mapping) else ()
    for hold in holds:
        if not isinstance(hold, Mapping):
            continue
        uid = hold.get("qbankUid")
        for key, note in active_by_key.items():
            if key[0] != "qbank" or key[1] != uid:
                continue
            findings.append(
                QuarantineFinding(
                    namespace="qbank",
                    uid=note.uid,
                    identity=note.identity,
                    reason_code=str(hold.get("reasonCode")),
                    subject_sha256=note.render_sha256,
                    source_path="question_bank.json",
                    first_seen_commit=_first_seen(inputs, note.uid, "question_bank.json"),
                    withdrawal_render_sha256=withdrawals.get(key),
                )
            )

    cards = [
        card
        for card in _input(inputs, "cards", ())
        if isinstance(card, Mapping) and card.get("state") == "approved"
    ]
    live: list[tuple[Mapping, RenderedNote]] = []
    for card in cards:
        namespace = "application" if card.get("kind") == "application" else "core"
        note = active_by_key.get((namespace, card.get("id"), "base"))
        review = card.get("review") if isinstance(card.get("review"), Mapping) else {}
        if note is not None and review.get("approvedCardSha256") == note.render_sha256:
            live.append((card, note))

    front_threshold = float(config.get("frontJaccardReviewThreshold", 0.8)) if isinstance(config, Mapping) else 0.8
    answer_threshold = float(config.get("answerJaccardReviewThreshold", 0.8)) if isinstance(config, Mapping) else 0.8
    for index, (card, note) in enumerate(live):
        for target, _target_note in live[:index]:
            if target.get("id") == card.get("id"):
                continue
            waived = _live_core_target(card, cards) is target
            if waived:
                continue
            for field, threshold, exact_code, jaccard_code in (
                ("front", front_threshold, "FRONT_EXACT_DUPLICATE", "FRONT_JACCARD_DUPLICATE"),
                ("answer", answer_threshold, "ANSWER_EXACT_DUPLICATE", "ANSWER_JACCARD_DUPLICATE"),
            ):
                left = _normalize_duplicate_text(target.get(field, ""))
                right = _normalize_duplicate_text(card.get(field, ""))
                if not left or not right:
                    continue
                reason = None
                if left == right:
                    reason = exact_code
                elif _jaccard(left, right) >= threshold:
                    reason = jaccard_code
                if reason:
                    key = (note.namespace, note.uid, note.identity)
                    findings.append(
                        _finding(
                            card,
                            target,
                            note,
                            reason,
                            field,
                            right,
                            inputs,
                            withdrawals.get(key),
                        )
                    )

    unique = {
        (
            finding.namespace,
            finding.uid,
            finding.identity,
            finding.reason_code,
            finding.subject_sha256,
        ): finding
        for finding in findings
    }
    return tuple(
        unique[key]
        for key in sorted(unique, key=lambda value: tuple(str(part) for part in value))
    )


def _ledger_finding(entry: Mapping) -> QuarantineFinding:
    return QuarantineFinding(
        namespace=entry.get("namespace", "core"),
        uid=str(entry.get("uid", "<missing-id>")),
        identity=entry.get("identity", "base"),
        reason_code=str(entry.get("reasonCode", "INVALID_LEDGER_DECISION")),
        subject_sha256=str(entry.get("subjectSha256", "0" * 64)),
        source_path=entry.get("sourcePath"),
        first_seen_commit=str(entry.get("firstSeenCommit", "0000000")),
        withdrawal_render_sha256=entry.get("approvedWithdrawalSha256"),
    )


def reconcile_quarantines(
    detected: Iterable[QuarantineFinding], ledger: object
) -> QuarantineResult:
    """Classify exact accepted decisions without inventing faculty authority."""

    detected = tuple(detected)
    entries = _ledger_entries(ledger)
    ledger_by_key = {_decision_key(entry): entry for entry in entries}
    detected_keys = {_decision_key(finding) for finding in detected}
    new: list[QuarantineFinding] = []
    changed: list[QuarantineFinding] = []
    accepted: list[QuarantineFinding] = []
    for finding in detected:
        entry = ledger_by_key.get(_decision_key(finding))
        if entry is None:
            new.append(finding)
        elif _valid_ledger_decision(entry, finding):
            accepted.append(finding)
        else:
            changed.append(finding)
    resolved = [
        _ledger_finding(entry)
        for entry in entries
        if _decision_key(entry) not in detected_keys
    ]
    return QuarantineResult(
        new=tuple(new),
        changed=tuple(changed),
        accepted=tuple(accepted),
        resolved=tuple(resolved),
    )


def compute_core_coverage(cards: Iterable[Mapping]) -> Counter[tuple[int, str]]:
    """Count only live approved Core cards by the primary Week/Domain cell."""

    return Counter(
        (int(card["week"]), str(card["domain"]))
        for card in cards
        if isinstance(card, Mapping)
        and card.get("state") == "approved"
        and card.get("kind") in {"basic", "cloze"}
        and isinstance(card.get("week"), int)
        and _named(card.get("domain"))
    )


def compute_application_coverage(
    cards: Iterable[Mapping],
) -> Counter[tuple[int, str]]:
    """Count only live approved Application cards by Week/primary taskBundle."""

    counter: Counter[tuple[int, str]] = Counter()
    for card in cards:
        if (
            not isinstance(card, Mapping)
            or card.get("state") != "approved"
            or card.get("kind") != "application"
            or not isinstance(card.get("week"), int)
        ):
            continue
        qbank = card.get("qbank") if isinstance(card.get("qbank"), Mapping) else {}
        if _named(qbank.get("taskBundle")):
            counter[(int(card["week"]), str(qbank["taskBundle"]))] += 1
    return counter


def _expected_counter(contract: Mapping, key: str) -> Counter[tuple[int, str]]:
    values = contract.get(key, {})
    if not isinstance(values, Mapping):
        return Counter()
    counter: Counter[tuple[int, str]] = Counter()
    for cell, count in values.items():
        if not isinstance(cell, str) or "|" not in cell or not isinstance(count, int):
            continue
        week, dimension = cell.split("|", 1)
        if re.fullmatch(r"W0[1-6]", week):
            counter[(int(week[1:]), dimension)] = count
    return counter


def _cell_label(cell: tuple[int, str]) -> str:
    return f"W{cell[0]:02d}|{cell[1]}"


def _matrix_issues(
    observed: Counter[tuple[int, str]],
    expected: Counter[tuple[int, str]],
    *,
    namespace: str,
    dimensions: Sequence[str],
    exact_total: int,
) -> list[Issue]:
    issues: list[Issue] = []
    prefix = namespace.upper()
    required_cells = {(week, dimension) for week in range(1, 7) for dimension in dimensions}
    for cell in sorted(required_cells | set(observed) | set(expected)):
        if observed[cell] != expected[cell]:
            issues.append(
                _issue(
                    f"{prefix}_COVERAGE_CELL_MISMATCH",
                    _cell_label(cell),
                    f"expected {expected[cell]}, observed {observed[cell]}",
                )
            )
    if sum(expected.values()) != exact_total:
        issues.append(
            _issue(
                f"{prefix}_COVERAGE_CONTRACT_TOTAL_MISMATCH",
                namespace,
                f"contract must total exactly {exact_total}",
            )
        )
    if sum(observed.values()) != exact_total:
        issues.append(
            _issue(
                f"{prefix}_COVERAGE_TOTAL_MISMATCH",
                namespace,
                f"release must total exactly {exact_total}; observed {sum(observed.values())}",
            )
        )
    for week in range(1, 7):
        actual = sum(observed[(week, dimension)] for dimension in dimensions)
        wanted = sum(expected[(week, dimension)] for dimension in dimensions)
        if actual != wanted:
            issues.append(
                _issue(
                    f"{prefix}_COVERAGE_ROW_MISMATCH",
                    f"W{week:02d}",
                    f"expected {wanted}, observed {actual}",
                )
            )
    for dimension in dimensions:
        actual = sum(observed[(week, dimension)] for week in range(1, 7))
        wanted = sum(expected[(week, dimension)] for week in range(1, 7))
        if actual != wanted:
            issues.append(
                _issue(
                    f"{prefix}_COVERAGE_COLUMN_MISMATCH",
                    dimension,
                    f"expected {wanted}, observed {actual}",
                )
            )
    return issues


def validate_release_coverage(cards: Iterable[Mapping], contract: Mapping) -> list[Issue]:
    """Require exact production matrices plus role/family/task safeguards."""

    cards = tuple(cards)
    if "coverage" in contract and isinstance(contract.get("coverage"), Mapping):
        contract = contract["coverage"]
    core = compute_core_coverage(cards)
    application = compute_application_coverage(cards)
    expected_core = _expected_counter(contract, "core")
    expected_application = _expected_counter(contract, "application")
    issues = _matrix_issues(
        core,
        expected_core,
        namespace="core",
        dimensions=CORE_DOMAINS,
        exact_total=144,
    )
    issues.extend(
        _matrix_issues(
            application,
            expected_application,
            namespace="application",
            dimensions=APPLICATION_TASK_BUNDLES,
            exact_total=48,
        )
    )
    approved_core = [
        card
        for card in cards
        if isinstance(card, Mapping)
        and card.get("state") == "approved"
        and card.get("kind") in {"basic", "cloze"}
    ]
    present_families = {card.get("family") for card in approved_core}
    present_tasks = {card.get("task") for card in approved_core}
    for family in sorted(CORE_FAMILIES - present_families):
        issues.append(
            _issue(
                "CORE_FAMILY_REQUIRED",
                family,
                "every governed Core family must appear at least once",
            )
        )
    for task in sorted(CORE_TASKS - present_tasks):
        issues.append(
            _issue(
                "CORE_TASK_REQUIRED",
                task,
                "every governed Core task must appear at least once",
            )
        )
    for week in (1, 5):
        week_tasks = {card.get("task") for card in approved_core if card.get("week") == week}
        for task in ("Recognize", "Escalate"):
            if task not in week_tasks:
                issues.append(
                    _issue(
                        "CORE_WEEK_TASK_REQUIRED",
                        f"W{week:02d}|{task}",
                        f"Week {week} requires at least one {task} Core card",
                    )
                )
    approved_applications = [
        card
        for card in cards
        if isinstance(card, Mapping)
        and card.get("state") == "approved"
        and card.get("kind") == "application"
    ]
    for card in approved_applications:
        issues.extend(_application_issues(card, cards))
    issues.extend(validate_role_safety(cards))
    return issues


def validate_pilot_coverage(cards: Iterable[Mapping]) -> list[Issue]:
    """Require exactly one draft Core card per Week/Domain for the 36-card pilot."""

    cards = tuple(cards)
    observed = Counter(
        (int(card["week"]), str(card["domain"]))
        for card in cards
        if isinstance(card, Mapping)
        and card.get("state") == "draft"
        and card.get("kind") in {"basic", "cloze"}
        and isinstance(card.get("week"), int)
        and _named(card.get("domain"))
    )
    issues = []
    for week in range(1, 7):
        for domain in CORE_DOMAINS:
            if observed[(week, domain)] != 1:
                issues.append(
                    _issue(
                        "PILOT_CORE_CELL_MISMATCH",
                        f"W{week:02d}|{domain}",
                        f"pilot requires exactly one draft; observed {observed[(week, domain)]}",
                    )
                )
    if sum(observed.values()) != 36:
        issues.append(
            _issue(
                "PILOT_CORE_TOTAL_MISMATCH",
                "pilot",
                f"pilot requires exactly 36 drafts; observed {sum(observed.values())}",
            )
        )
    return issues
