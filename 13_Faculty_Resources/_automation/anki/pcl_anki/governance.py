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
from pcl_anki.qbank import (
    QbankValidationError,
    eligible_qbank_items,
    qbank_item_sha256,
    resolve_primary_qbank_source,
    validate_application_qbank,
)
from pcl_anki.render import (
    TEMPLATE_CONTRACTS,
    TEMPLATE_CONTRACT_SHA256,
    build_qbank_notes,
    render_card,
)
from pcl_anki.sources import SourceResolutionError


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
_UNSAFE_ACTION_RE = re.compile(
    r"\b(?:the\s+student|you(?:\s+as\s+the\s+student)?)\s+"
    r"(?:should|must|can|may)\s+"
    r"(?!not\b|never\b|avoid\b|do\s+not\b)(?:independently\s+)?"
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


def _canonical_qbank_item(
    inputs: object, item_id: object, *, namespace: str
) -> tuple[Mapping | None, list[Issue]]:
    """Select only the canonical current eligible qbank item."""

    subject = str(item_id or "<missing-id>")
    prefix = "QBANK" if namespace == "QBANK" else f"{namespace}_QBANK"
    question_bank = _input(inputs, "question_bank", None)
    schema = _input(inputs, "question_bank_schema", None)
    manifest = _input(inputs, "manifest", None)
    if not isinstance(question_bank, Mapping) or not isinstance(schema, Mapping) or manifest is None:
        return None, [
            _issue(
                f"{prefix}_INPUT_REQUIRED",
                subject,
                "canonical question bank, schema, and manifest are required",
            )
        ]

    raw_items = question_bank.get("items", ())
    if not isinstance(raw_items, Sequence) or isinstance(raw_items, (str, bytes)):
        raw_items = ()
    canonical = next(
        (
            item
            for item in raw_items
            if isinstance(item, Mapping) and item.get("id") == item_id
        ),
        None,
    )
    try:
        eligible = eligible_qbank_items(question_bank, schema, manifest)
    except (QbankValidationError, ValueError) as error:
        validation_issues = list(getattr(error, "issues", ()))
        if not validation_issues:
            validation_issues = [
                _issue(
                    f"{prefix}_INVALID",
                    subject,
                    str(error),
                )
            ]
        return canonical, validation_issues
    selected = next((item for item in eligible if item.get("id") == item_id), None)
    if selected is None:
        return canonical, [
            _issue(
                f"{prefix}_NOT_ELIGIBLE",
                subject,
                "the canonical item must be attested, current, and non-retired",
            )
        ]
    return selected, []


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
        answer = _normalize_duplicate_text(card.get("answer", ""))
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
        if caveat_required and not _affirmative_supervision_caveat(
            card.get("caveat", "")
        ):
            issues.append(
                _issue(
                    "ROLE_SAFETY_CAVEAT_REQUIRED",
                    subject,
                    "this card requires an explicit supervision or escalation caveat",
                )
            )
    return issues


_AFFIRMATIVE_SUPERVISION_RE = re.compile(
    r"\b(?:"
    r"notif(?:y|ies|ied)\s+(?:the\s+)?(?:attending|resident|supervisor|clinical\s+team|teaching\s+team|team)"
    r"|escalat\w*(?:\s+to)?\s+(?:the\s+)?(?:attending|resident|supervisor|clinical\s+team|teaching\s+team|team)"
    r"|consult\w*(?:\s+with)?\s+(?:the\s+)?(?:attending|resident|supervisor|clinical\s+team|teaching\s+team|team)"
    r"|review\s+with\s+(?:the\s+)?(?:attending|resident|supervisor|clinical\s+team|teaching\s+team|team)"
    r"|(?:under|with)\s+(?:\w+\s+){0,2}supervision"
    r"|supervising\s+(?:clinician|physician|attending|resident|team)"
    r")\b"
)
_NEGATIVE_GOVERNOR_RE = re.compile(
    r"(?:\b(?:neither|nor|never|not|cannot|without|avoid)"
    r"|\b(?:decline|refuse)(?:\s+to)?"
    r"|\b(?:do|does|did|should|must|may|can|could|would|will)\s+not"
    r"|\b(?:don|doesn|didn|shouldn|mustn|couldn|wouldn|isn|aren|wasn|"
    r"weren|can|won)\s+t)"
    r"(?:\s+(?:ever|directly|independently|immediately))*\s*$"
)
_NEGATIVE_RELATION_MODIFIERS = frozenset(
    {
        "absent",
        "inadequate",
        "insufficient",
        "nil",
        "no",
        "not",
        "unavailable",
        "unsupervised",
        "zero",
    }
)
_NEGATIVE_RELATION_PREFIX_RE = re.compile(
    r"\b(?:absent|inadequate|insufficient|nil|no|unavailable|unsupervised|zero)\s*$"
)
_NEGATIVE_RELATION_SUFFIX_RE = re.compile(
    r"^\s*(?:(?:is|remains)\s+)?(?:not\s+available|absent|inadequate|"
    r"insufficient|unavailable|unsupervised)\b"
)


def _supervision_match_is_negated(clause: str, match: re.Match) -> bool:
    """Limit negation to the governor or modifier attached to one match."""

    prefix = clause[: match.start()]
    if _NEGATIVE_GOVERNOR_RE.search(prefix):
        return True

    matched = match.group(0)
    relation = matched.startswith(("under ", "with ", "supervising "))
    if not relation:
        return False
    if set(matched.split()) & _NEGATIVE_RELATION_MODIFIERS:
        return True
    if _NEGATIVE_RELATION_PREFIX_RE.search(prefix):
        return True
    return bool(_NEGATIVE_RELATION_SUFFIX_RE.search(clause[match.end() :]))


def _affirmative_supervision_caveat(value: object) -> bool:
    """Require affirmative supervision language, not a negated mention."""

    visible = html.unescape(str(value))
    visible = re.sub(r"<[^>]+>", " ", visible)
    for raw_clause in re.split(r"[.;!?]+", visible):
        clause = _normalize_duplicate_text(raw_clause)
        for match in _AFFIRMATIVE_SUPERVISION_RE.finditer(clause):
            if not _supervision_match_is_negated(clause, match):
                return True
    return False


def _ledger_entries(ledger: object) -> tuple[Mapping, ...]:
    if isinstance(ledger, Mapping):
        ledger = ledger.get("accepted", ())
    if not isinstance(ledger, Sequence) or isinstance(ledger, (str, bytes)):
        return ()
    return tuple(entry for entry in ledger if isinstance(entry, Mapping))


def _decision_key(value: Mapping | QuarantineFinding) -> tuple[object, ...]:
    if isinstance(value, QuarantineFinding):
        return (
            value.namespace,
            value.uid,
            value.identity,
            value.reason_code,
            value.subject_sha256,
        )
    return (
        value.get("namespace"),
        value.get("uid"),
        value.get("identity"),
        value.get("reasonCode"),
        value.get("subjectSha256"),
    )


def _finding_card_key(value: Mapping | QuarantineFinding) -> tuple[object, ...]:
    if isinstance(value, QuarantineFinding):
        return value.namespace, value.uid, value.identity
    return value.get("namespace"), value.get("uid"), value.get("identity")


def _quarantine_set_accepted(
    result: QuarantineResult, findings: Iterable[QuarantineFinding]
) -> bool:
    """Require every current exact finding for a card to reconcile as accepted."""

    findings = tuple(findings)
    if not findings:
        return False
    card_keys = {_finding_card_key(finding) for finding in findings}
    if any(
        _finding_card_key(finding) in card_keys
        for finding in (*result.new, *result.changed)
    ):
        return False
    required = Counter(_decision_key(finding) for finding in findings)
    accepted = Counter(_decision_key(finding) for finding in result.accepted)
    return all(accepted[key] >= count for key, count in required.items())


def _historical_membership(
    release_history: object, release_id: object, finding: QuarantineFinding
) -> bool:
    if not isinstance(release_history, Mapping) or not _named(release_id):
        return False
    releases = release_history.get("releases", ())
    if not isinstance(releases, Sequence) or isinstance(releases, (str, bytes)):
        return False
    release = next(
        (
            value
            for value in releases
            if isinstance(value, Mapping) and value.get("releaseId") == release_id
        ),
        None,
    )
    if not isinstance(release, Mapping):
        return False
    memberships = release.get("memberships", ())
    return isinstance(memberships, Sequence) and any(
        isinstance(member, Mapping)
        and member.get("namespace") == finding.namespace
        and member.get("uid") == finding.uid
        and member.get("identity") == finding.identity
        for member in memberships
    )


def _valid_ledger_decision(
    entry: Mapping, finding: QuarantineFinding, release_history: object
) -> bool:
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
        and _historical_membership(
            release_history, entry.get("affectedReleaseId"), finding
        )
        and entry.get("withdrawalTemplateVersion") == WITHDRAWAL_TEMPLATE_VERSION
        and finding.withdrawal_render_sha256 is not None
        and entry.get("approvedWithdrawalSha256") == finding.withdrawal_render_sha256
    )


def evaluate_card(card: Mapping, inputs: object, candidate_date: date) -> CardDecision:
    """Evaluate one Core/Application card while preserving authoring previews."""

    namespace = "application" if card.get("kind") == "application" else "core"
    subject = str(card.get("id", "<missing-id>"))
    issues = _application_issues(card, _input(inputs, "cards", ()))
    qbank_item = None
    if namespace == "application":
        qbank = card.get("qbank") if isinstance(card.get("qbank"), Mapping) else {}
        canonical_item, eligibility_issues = _canonical_qbank_item(
            inputs, qbank.get("id"), namespace="APPLICATION"
        )
        issues.extend(eligibility_issues)
        if canonical_item is None:
            issues.append(
                _issue(
                    "APPLICATION_QBANK_ITEM_REQUIRED",
                    subject,
                    "Application rendering requires the exact canonical qbank item",
                )
            )
        else:
            try:
                source_resolution = resolve_primary_qbank_source(
                    canonical_item,
                    qbank.get("primaryPage"),
                    qbank.get("primaryAnchor"),
                    inputs,
                )
            except SourceResolutionError as error:
                issues.append(_issue(error.code, error.subject, error.message))
            except (TypeError, ValueError) as error:
                issues.append(_issue("QBANK_SOURCE_INVALID", subject, str(error)))
            else:
                issues.extend(
                    validate_application_qbank(card, canonical_item, source_resolution)
                )
        if not eligibility_issues:
            qbank_item = canonical_item

    rendered = None
    if not any(
        issue.code in {"APPLICATION_TASK_BUNDLE_REQUIRED", "APPLICATION_QBANK_ITEM_REQUIRED"}
        or issue.code.startswith("APPLICATION_QBANK_")
        for issue in issues
    ):
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
    detected = tuple(
        finding
        for finding in _input(inputs, "detected_quarantines", ())
        if isinstance(finding, QuarantineFinding)
    )
    matching_findings = tuple(
        finding
        for finding in detected
        if finding.namespace == namespace
        and finding.uid == subject
        and finding.identity == "base"
    )
    quarantine_result = reconcile_quarantines(
        detected,
        _input(inputs, "quarantine", ()),
        release_history=_input(inputs, "release_history", None),
    )
    matching_accepted = _quarantine_set_accepted(
        quarantine_result, matching_findings
    )
    if state == "quarantined":
        issues.append(
            _issue(
                "CARD_QUARANTINED",
                subject,
                "quarantined cards remain excluded even when source and approval hashes match",
                severity="review",
            )
        )
        if not matching_accepted:
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
        if matching_findings and not matching_accepted:
            issues.append(
                _issue(
                    "QUARANTINE_UNACCEPTED",
                    subject,
                    "a retired quarantine record still requires exact reconciliation",
                )
            )
    elif matching_findings:
        issues.append(
            _issue(
                "QUARANTINE_STATE_REQUIRED",
                subject,
                "a detected quarantine finding must remain excluded from the active release",
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
    canonical_item, issues = _canonical_qbank_item(
        inputs, item.get("id"), namespace="QBANK"
    )
    issues = list(issues)
    render_item = canonical_item if canonical_item is not None else item
    if canonical_item is not None and qbank_item_sha256(item) != qbank_item_sha256(
        canonical_item
    ):
        issues.append(
            _issue(
                "QBANK_CANONICAL_ITEM_DRIFT",
                subject,
                "the supplied item differs from the canonical registry item",
            )
        )
    rendered = None
    try:
        notes = build_qbank_notes(render_item)
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
            and review.get("approvedItemSha256") == qbank_item_sha256(render_item)
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

    if isinstance(review, Mapping) and canonical_item is not None:
        try:
            source_resolution = resolve_primary_qbank_source(
                canonical_item,
                review.get("primaryPage"),
                review.get("primaryAnchor"),
                inputs,
            )
        except SourceResolutionError as error:
            issues.append(_issue(error.code, error.subject, error.message))
        except (TypeError, ValueError) as error:
            issues.append(_issue("QBANK_SOURCE_INVALID", subject, str(error)))
        else:
            if review.get("sourceAnchorSha256") != source_resolution.section_sha256:
                issues.append(
                    _issue(
                        "QBANK_SOURCE_ANCHOR_DRIFT",
                        f"{subject}:{identity}",
                        "sourceAnchorSha256 must bind the full normalized primary section",
                    )
                )
    detected = tuple(
        finding
        for finding in _input(inputs, "detected_quarantines", ())
        if isinstance(finding, QuarantineFinding)
    )
    matching_findings = tuple(
        finding
        for finding in detected
        if finding.namespace == "qbank"
        and finding.uid == subject
        and finding.identity == identity
    )
    if matching_findings:
        result = reconcile_quarantines(
            detected,
            _input(inputs, "quarantine", ()),
            release_history=_input(inputs, "release_history", None),
        )
        accepted = _quarantine_set_accepted(result, matching_findings)
        issues.append(
            _issue(
                "QBANK_QUARANTINED",
                f"{subject}:{identity}",
                "a detected qbank quarantine remains excluded from release",
                severity="review",
            )
        )
        if not accepted:
            issues.append(
                _issue(
                    "QUARANTINE_UNACCEPTED",
                    f"{subject}:{identity}",
                    "new or changed quarantine requires an exact accepted ledger decision",
                )
            )
    eligible = rendered is not None and not matching_findings and not _hard(issues)
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


def _first_seen(
    inputs: object,
    namespace: str,
    uid: str,
    identity: str,
    source_path: str | None,
) -> str:
    del source_path  # Provenance is derived only from canonical registries.
    repo = Path(_input(inputs, "repo_root", Path.cwd()))
    registry_path = (
        "question_bank.json"
        if namespace == "qbank"
        else "13_Faculty_Resources/anki/cards.json"
    )
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
                registry_path,
            ],
            cwd=repo,
            check=True,
            capture_output=True,
            text=True,
        )
        commit = next((line for line in result.stdout.splitlines() if line), "")
        if re.fullmatch(r"[0-9a-f]{40}", commit):
            return commit
    except (OSError, subprocess.CalledProcessError):
        pass
    raise ValueError(
        f"FIRST_SEEN_PROVENANCE_REQUIRED: {namespace}:{uid}:{identity}"
    )


def _finding(
    candidate: Mapping,
    target: Mapping,
    candidate_note: RenderedNote,
    target_note: RenderedNote,
    reason_code: str,
    field: str,
    normalized: str,
    inputs: object,
    withdrawal_hash: str | None,
) -> QuarantineFinding:
    source = (
        candidate.get("source")
        if isinstance(candidate.get("source"), Mapping)
        else {}
    )
    source_path = source.get("path") if isinstance(source.get("path"), str) else None
    candidate_review = (
        candidate.get("review") if isinstance(candidate.get("review"), Mapping) else {}
    )
    target_review = (
        target.get("review") if isinstance(target.get("review"), Mapping) else {}
    )
    return QuarantineFinding(
        namespace=candidate_note.namespace,
        uid=candidate_note.uid,
        identity=candidate_note.identity,
        reason_code=reason_code,
        subject_sha256=canonical_json_sha256(
            {
                "field": field,
                "normalized": normalized,
                "candidate": {
                    "namespace": candidate_note.namespace,
                    "uid": candidate_note.uid,
                    "identity": candidate_note.identity,
                    "renderSha256": candidate_note.render_sha256,
                    "approvedCardSha256": candidate_review.get(
                        "approvedCardSha256"
                    ),
                },
                "target": {
                    "namespace": target_note.namespace,
                    "uid": target_note.uid,
                    "identity": target_note.identity,
                    "renderSha256": target_note.render_sha256,
                    "approvedCardSha256": target_review.get("approvedCardSha256"),
                },
            }
        ),
        source_path=source_path,
        first_seen_commit=_first_seen(
            inputs,
            candidate_note.namespace,
            candidate_note.uid,
            candidate_note.identity,
            source_path,
        ),
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
    current_by_key = {
        (note.namespace, note.uid, note.identity): note
        for note in notes
        if not note.withdrawn
    }
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
                    first_seen_commit=_first_seen(
                        inputs, "qbank", note.uid, note.identity, "question_bank.json"
                    ),
                    withdrawal_render_sha256=withdrawals.get(key),
                )
            )

    cards = [
        card
        for card in _input(inputs, "cards", ())
        if isinstance(card, Mapping)
        and card.get("state") in {"approved", "quarantined"}
    ]
    live: list[tuple[Mapping, RenderedNote]] = []
    for card in cards:
        namespace = "application" if card.get("kind") == "application" else "core"
        note = current_by_key.get((namespace, card.get("id"), "base"))
        review = card.get("review") if isinstance(card.get("review"), Mapping) else {}
        if note is not None and review.get("approvedCardSha256") == note.render_sha256:
            live.append((card, note))

    front_threshold = float(config.get("frontJaccardReviewThreshold", 0.8)) if isinstance(config, Mapping) else 0.8
    answer_threshold = float(config.get("answerJaccardReviewThreshold", 0.8)) if isinstance(config, Mapping) else 0.8
    live.sort(
        key=lambda value: (
            value[1].namespace,
            value[1].uid,
            value[1].identity,
        )
    )
    for index, (left, left_note) in enumerate(live):
        for right, right_note in live[index + 1 :]:
            if right.get("id") == left.get("id"):
                continue
            if (
                right.get("state") == "quarantined"
                and left.get("state") != "quarantined"
            ):
                candidate, candidate_note = right, right_note
                target, target_note = left, left_note
            else:
                candidate, candidate_note = left, left_note
                target, target_note = right, right_note
            candidate_target = _live_core_target(candidate, cards)
            target_candidate = _live_core_target(target, cards)
            waived = (
                isinstance(candidate_target, Mapping)
                and candidate_target.get("id") == target.get("id")
            ) or (
                isinstance(target_candidate, Mapping)
                and target_candidate.get("id") == candidate.get("id")
            )
            if waived:
                continue
            for field, threshold, exact_code, jaccard_code in (
                ("front", front_threshold, "FRONT_EXACT_DUPLICATE", "FRONT_JACCARD_DUPLICATE"),
                ("answer", answer_threshold, "ANSWER_EXACT_DUPLICATE", "ANSWER_JACCARD_DUPLICATE"),
            ):
                candidate_text = _normalize_duplicate_text(candidate.get(field, ""))
                target_text = _normalize_duplicate_text(target.get(field, ""))
                if not candidate_text or not target_text:
                    continue
                reason = None
                if candidate_text == target_text:
                    reason = exact_code
                elif _jaccard(candidate_text, target_text) >= threshold:
                    reason = jaccard_code
                if reason:
                    key = (
                        candidate_note.namespace,
                        candidate_note.uid,
                        candidate_note.identity,
                    )
                    findings.append(
                        _finding(
                            candidate,
                            target,
                            candidate_note,
                            target_note,
                            reason,
                            field,
                            target_text,
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
        first_seen_commit=str(entry.get("firstSeenCommit", "")),
        # Approval metadata is never treated as independent render evidence.
        withdrawal_render_sha256=None,
    )


def reconcile_quarantines(
    detected: Iterable[QuarantineFinding],
    ledger: object,
    *,
    release_history: object = None,
) -> QuarantineResult:
    """Classify exact accepted decisions without inventing faculty authority."""

    detected = tuple(detected)
    entries = _ledger_entries(ledger)
    new: list[QuarantineFinding] = []
    changed: list[QuarantineFinding] = []
    accepted: list[QuarantineFinding] = []
    used_entries: set[int] = set()
    unmatched: list[QuarantineFinding] = []
    for finding in detected:
        entry_index = next(
            (
                index
                for index, entry in enumerate(entries)
                if index not in used_entries
                and _decision_key(entry) == _decision_key(finding)
            ),
            None,
        )
        if entry_index is None:
            unmatched.append(finding)
            continue
        used_entries.add(entry_index)
        if _valid_ledger_decision(entries[entry_index], finding, release_history):
            accepted.append(finding)
        else:
            changed.append(finding)

    for finding in unmatched:
        same_card = [
            index
            for index, entry in enumerate(entries)
            if index not in used_entries
            and _finding_card_key(entry) == _finding_card_key(finding)
        ]
        same_reason = [
            index
            for index in same_card
            if entries[index].get("reasonCode") == finding.reason_code
        ]
        candidates = same_reason or same_card
        if not candidates:
            new.append(finding)
            continue
        used_entries.add(candidates[0])
        changed.append(finding)

    resolved = [
        _ledger_finding(entry)
        for index, entry in enumerate(entries)
        if index not in used_entries
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


def _card_note_key(card: Mapping) -> tuple[str, object, str]:
    namespace = "application" if card.get("kind") == "application" else "core"
    return namespace, card.get("id"), "base"


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


def validate_release_coverage(
    cards: Iterable[Mapping],
    contract: Mapping,
    *,
    detected_quarantines: Iterable[QuarantineFinding] | None = None,
    quarantine: object = None,
    release_history: object = None,
) -> list[Issue]:
    """Require exact production matrices plus role/family/task safeguards."""

    cards = tuple(cards)
    issues: list[Issue] = []
    quarantined_cards = tuple(
        card
        for card in cards
        if isinstance(card, Mapping) and card.get("state") == "quarantined"
    )
    excluded_keys: set[tuple[object, ...]] = set()
    quarantine_result: QuarantineResult | None = None
    if detected_quarantines is None:
        if quarantined_cards:
            issues.append(
                _issue(
                    "QUARANTINE_RECONCILIATION_REQUIRED",
                    "coverage",
                    "coverage exclusion requires the exact reconciliation result",
                )
            )
    else:
        detected_quarantines = tuple(detected_quarantines)
        quarantine_result = reconcile_quarantines(
            detected_quarantines,
            quarantine,
            release_history=release_history,
        )
        excluded = (
            *quarantine_result.new,
            *quarantine_result.changed,
            *quarantine_result.accepted,
        )
        excluded_keys = {
            (finding.namespace, finding.uid, finding.identity) for finding in excluded
        }
        for card in quarantined_cards:
            namespace = "application" if card.get("kind") == "application" else "core"
            key = (namespace, card.get("id"), "base")
            current_findings = tuple(
                finding
                for finding in detected_quarantines
                if _finding_card_key(finding) == key
            )
            if not _quarantine_set_accepted(quarantine_result, current_findings):
                issues.append(
                    _issue(
                        "QUARANTINE_UNACCEPTED",
                        card.get("id", "<missing-id>"),
                        "coverage cannot exclude an unreconciled quarantine record",
                    )
                )
        for finding in (*quarantine_result.new, *quarantine_result.changed):
            issues.append(
                _issue(
                    "QUARANTINE_UNACCEPTED",
                    f"{finding.namespace}:{finding.uid}:{finding.identity}",
                    "new or changed quarantine findings block release coverage",
                )
            )

    coverage_cards = tuple(
        card
        for card in cards
        if not (
            isinstance(card, Mapping)
            and _card_note_key(card) in excluded_keys
        )
    )
    if "coverage" in contract and isinstance(contract.get("coverage"), Mapping):
        contract = contract["coverage"]
    core = compute_core_coverage(coverage_cards)
    application = compute_application_coverage(coverage_cards)
    expected_core = _expected_counter(contract, "core")
    expected_application = _expected_counter(contract, "application")
    issues.extend(
        _matrix_issues(
            core,
            expected_core,
            namespace="core",
            dimensions=CORE_DOMAINS,
            exact_total=144,
        )
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
        for card in coverage_cards
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
        for card in coverage_cards
        if isinstance(card, Mapping)
        and card.get("state") == "approved"
        and card.get("kind") == "application"
    ]
    for card in approved_applications:
        issues.extend(_application_issues(card, coverage_cards))
    issues.extend(validate_role_safety(coverage_cards))
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
