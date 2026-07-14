from copy import deepcopy
from dataclasses import replace
from datetime import date
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from pcl_anki.contract import QuarantineFinding
from pcl_anki.governance import (
    WITHDRAWAL_TEMPLATE_VERSION,
    GovernanceError,
    detect_quarantines,
    evaluate_card,
    evaluate_qbank_note,
    reconcile_quarantines,
    validate_release_coverage,
)
from pcl_anki.render import build_qbank_notes, render_card


CANDIDATE_DATE = date(2026, 7, 14)


def codes(issues):
    return {issue.code for issue in issues}


def replace_inputs(inputs, **changes):
    values = vars(deepcopy(inputs))
    values.update(changes)
    return SimpleNamespace(**values)


def configure_high_review(bundle, card, facets=("Medication",)):
    card["risk"] = {"level": "High", "facets": list(facets)}
    card["review"].update(
        {
            "evidenceCitation": "Synthetic evidence citation",
            "evidenceRecord": "evidence_registry.json#evidence-alpha-v1",
            "evidenceSha256": bundle.evidence_sha256,
            "evidenceReviewedBy": "Synthetic Evidence Reviewer",
            "evidenceReviewedAt": "2026-07-02",
            "reviewDue": "2027-07-02",
        }
    )
    bundle.approve_card(card)


def configure_policy_review(bundle, card):
    card["review"].update(
        {
            "localPolicySource": "policy_registry.json#policy-alpha-v1",
            "localPolicySha256": "e" * 64,
            "localPolicyReviewedBy": "Synthetic Policy Reviewer",
            "localPolicyReviewedAt": "2026-07-02",
            "reviewDue": "2027-07-02",
        }
    )


@pytest.mark.parametrize(
    "mutate",
    [
        lambda card: card.__setitem__("front", "A changed displayed front."),
        lambda card: card.__setitem__("answer", "A changed displayed answer."),
        lambda card: card.__setitem__("domain", "Safety"),
        lambda card: card.__setitem__(
            "risk", {"level": "Routine", "facets": ["LocalPolicy"]}
        ),
        lambda card: card["source"].__setitem__("quote", "A changed source quote."),
        lambda card: card["render"].__setitem__("templateVersion", "changed-v99"),
    ],
)
def test_any_display_tag_template_risk_or_source_drift_invalidates_approval(
    passing_release_factory, mutate
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    mutate(card)

    decision = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert {"CARD_APPROVAL_DRIFT", "CARD_RENDER_INVALID"} & codes(decision.issues)


@pytest.mark.parametrize("relationship", ["reinforces", "supersedes"])
@pytest.mark.parametrize("mutation", ["added", "removed", "changed"])
def test_relationship_add_remove_or_change_invalidates_exact_approval(
    passing_release_factory, relationship, mutation
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[2])
    first = bundle.core_cards[0]["id"]
    second = bundle.core_cards[1]["id"]
    if mutation == "added":
        card[relationship] = first
        # Approval intentionally remains the hash with an explicit null relationship.
    else:
        card[relationship] = first
        bundle.approve_card(card)
        card[relationship] = None if mutation == "removed" else second

    decision = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "CARD_APPROVAL_DRIFT" in codes(decision.issues)


def test_routine_card_still_requires_exact_named_render_approval(passing_release_factory):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    card["review"].pop("approvedCardSha256")

    decision = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "CARD_APPROVAL_REQUIRED" in codes(decision.issues)


def test_source_review_is_a_prerequisite_but_never_an_approval(passing_release_factory):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    inputs = replace_inputs(bundle.inputs, reviewed={})

    decision = evaluate_card(card, inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "SOURCE_REVIEW_REQUIRED" in codes(decision.issues)


def test_source_review_consumes_the_existing_raw_items_registry_shape(
    passing_release_factory,
):
    bundle = passing_release_factory()
    reviewed = {
        "items": {
            "synthetic-source.md": {
                "status": "reviewed",
                "reviewedBy": "Synthetic Source Reviewer",
                "reviewedAt": "2026-07-01",
            }
        }
    }
    inputs = replace_inputs(bundle.inputs, reviewed=reviewed)

    decision = evaluate_card(bundle.core_cards[0], inputs, CANDIDATE_DATE)

    assert decision.eligible is True
    assert decision.issues == ()


@pytest.mark.parametrize(
    "mutation,expected",
    [
        (lambda card, inputs: card["review"].pop("evidenceReviewedBy"), "EVIDENCE_REVIEW_REQUIRED"),
        (lambda card, inputs: card["review"].__setitem__("reviewDue", "2026-07-13"), "REVIEW_EXPIRED"),
        (
            lambda card, inputs: inputs.evidence_records["evidence-alpha-v1"].__setitem__(
                "title", "Changed exact evidence record"
            ),
            "EVIDENCE_RECORD_DRIFT",
        ),
    ],
)
def test_high_review_must_be_complete_current_and_exact(
    passing_release_factory, mutation, expected
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    inputs = deepcopy(bundle.inputs)
    configure_high_review(bundle, card)
    mutation(card, inputs)

    decision = evaluate_card(card, inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert expected in codes(decision.issues)


@pytest.mark.parametrize(
    "facet",
    [
        "Medication",
        "Emergency",
        "Pregnancy",
        "Legal",
        "Regulatory",
        "Numerical",
        "EvidenceSensitive",
    ],
)
def test_every_high_trigger_facet_rejects_routine_label(
    passing_release_factory, facet
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    card["risk"] = {"level": "Routine", "facets": [facet]}
    bundle.approve_card(card)

    decision = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "HIGH_RISK_LABEL_REQUIRED" in codes(decision.issues)


@pytest.mark.parametrize(
    "mutation,expected",
    [
        (lambda card, inputs: card["review"].pop("localPolicyReviewedBy"), "LOCAL_POLICY_REVIEW_REQUIRED"),
        (
            lambda card, inputs: card["review"].__setitem__(
                "localPolicySha256", "0" * 64
            ),
            "LOCAL_POLICY_RECORD_DRIFT",
        ),
        (
            lambda card, inputs: inputs.policy_records["policy-alpha-v1"].pop("owner"),
            "LOCAL_POLICY_RECORD_INVALID",
        ),
    ],
)
def test_local_policy_requires_versioned_owned_exact_review(
    passing_release_factory, mutation, expected
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    inputs = deepcopy(bundle.inputs)
    card["risk"] = {"level": "Routine", "facets": ["LocalPolicy"]}
    configure_policy_review(bundle, card)
    bundle.approve_card(card)
    mutation(card, inputs)

    decision = evaluate_card(card, inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert expected in codes(decision.issues)


def test_combined_high_and_local_policy_requires_both_reviews(passing_release_factory):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    configure_high_review(bundle, card, ("Medication", "LocalPolicy"))

    missing_policy = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)
    assert "LOCAL_POLICY_REVIEW_REQUIRED" in codes(missing_policy.issues)

    configure_policy_review(bundle, card)
    bundle.approve_card(card)
    complete = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)
    assert complete.eligible is True
    assert complete.issues == ()


def test_local_policy_accepts_an_exact_versioned_record_id_without_inventing_a_prefix(
    passing_release_factory,
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    card["risk"] = {"level": "Routine", "facets": ["LocalPolicy"]}
    configure_policy_review(bundle, card)
    card["review"]["localPolicySource"] = "policy-alpha-v1"
    bundle.approve_card(card)

    decision = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)

    assert decision.eligible is True
    assert decision.issues == ()


def test_qbank_attestation_is_only_a_prerequisite_for_render_approval(
    passing_release_factory,
):
    bundle = passing_release_factory()
    approved = evaluate_qbank_note(
        bundle.qbank_item, "base", bundle.inputs, CANDIDATE_DATE
    )
    assert approved.eligible is True

    no_review = replace_inputs(bundle.inputs, qbank_reviews=())
    unapproved = evaluate_qbank_note(
        bundle.qbank_item, "base", no_review, CANDIDATE_DATE
    )
    assert unapproved.eligible is False
    assert "QBANK_RENDER_REVIEW_REQUIRED" in codes(unapproved.issues)


@pytest.mark.parametrize("state", ["draft", "retired"])
def test_application_uses_canonical_current_qbank_eligibility(
    passing_release_factory, state
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.application_cards[0])
    question_bank = deepcopy(bundle.inputs.question_bank)
    canonical = question_bank["items"][0]
    canonical["status"] = "draft"
    if state == "retired":
        canonical["retired"] = True
        canonical["retiredReason"] = "Synthetic retirement for gate testing."
    inputs = replace_inputs(bundle.inputs, question_bank=question_bank)

    decision = evaluate_card(card, inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "APPLICATION_QBANK_NOT_ELIGIBLE" in codes(decision.issues)


@pytest.mark.parametrize(
    "mutation,expected",
    [
        (
            lambda card: card["qbank"].__setitem__("primaryAnchor", "missing-anchor"),
            "SOURCE_ANCHOR_MISSING",
        ),
        (
            lambda card: card["qbank"].__setitem__("primaryTrap", "Missing trap"),
            "QBANK_PRIMARY_TRAP_MISMATCH",
        ),
        (
            lambda card: card["source"].__setitem__("slug", "changed-source.md"),
            "QBANK_SOURCE_SLUG_MISMATCH",
        ),
        (
            lambda card: card["qbank"].__setitem__("sourceAnchorSha256", "0" * 64),
            "QBANK_SOURCE_ANCHOR_DRIFT",
        ),
    ],
    ids=["anchor", "trap", "source-slug", "section-hash"],
)
def test_application_binds_exact_primary_source_and_trap(
    passing_release_factory, mutation, expected
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.application_cards[0])
    mutation(card)
    if expected == "SOURCE_ANCHOR_MISSING":
        card["source"]["anchor"] = card["qbank"]["primaryAnchor"]
    bundle.approve_card(card, bundle.qbank_item)

    decision = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert expected in codes(decision.issues)


def test_application_rejects_primary_page_removed_from_canonical_item(
    passing_release_factory,
):
    bundle = passing_release_factory()
    question_bank = deepcopy(bundle.inputs.question_bank)
    question_bank["items"][0]["pages"] = []
    inputs = replace_inputs(bundle.inputs, question_bank=question_bank)

    decision = evaluate_card(bundle.application_cards[0], inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "QBANK_PRIMARY_PAGE_MISSING" in codes(decision.issues)


@pytest.mark.parametrize("state", ["draft", "retired"])
def test_qbank_note_uses_canonical_current_item_state(passing_release_factory, state):
    bundle = passing_release_factory()
    question_bank = deepcopy(bundle.inputs.question_bank)
    canonical = question_bank["items"][0]
    canonical["status"] = "draft"
    if state == "retired":
        canonical["retired"] = True
        canonical["retiredReason"] = "Synthetic retirement for gate testing."
    inputs = replace_inputs(bundle.inputs, question_bank=question_bank)

    decision = evaluate_qbank_note(bundle.qbank_item, "base", inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "QBANK_NOT_ELIGIBLE" in codes(decision.issues)


@pytest.mark.parametrize(
    "field,value,expected",
    [
        ("primaryPage", "missing-source.md", "QBANK_PRIMARY_PAGE_MISSING"),
        ("primaryAnchor", "missing-anchor", "SOURCE_ANCHOR_MISSING"),
        ("sourceAnchorSha256", "0" * 64, "QBANK_SOURCE_ANCHOR_DRIFT"),
    ],
)
def test_qbank_note_review_binds_manifest_page_anchor_and_section_hash(
    passing_release_factory, field, value, expected
):
    bundle = passing_release_factory()
    review = deepcopy(bundle.qbank_review)
    review[field] = value
    inputs = replace_inputs(bundle.inputs, qbank_reviews=(review,))

    decision = evaluate_qbank_note(bundle.qbank_item, "base", inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert expected in codes(decision.issues)


@pytest.mark.parametrize(
    "change,expected",
    [
        ({"reviewed": {"items": {}}}, "SOURCE_NOT_REVIEWED"),
        ({"surveillance": {"slugs": ["synthetic-source.md"]}}, "SOURCE_NEEDS_REATTEST"),
    ],
)
def test_qbank_note_requires_current_exact_source_review(
    passing_release_factory, change, expected
):
    bundle = passing_release_factory()
    inputs = replace_inputs(bundle.inputs, **change)

    decision = evaluate_qbank_note(bundle.qbank_item, "base", inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert expected in codes(decision.issues)


def test_passing_fixture_uses_actual_task4_source_and_production_reconciliation(
    passing_release_factory,
):
    bundle = passing_release_factory()

    assert bundle.application_cards[0]["qbank"]["sourceAnchorSha256"] == (
        bundle.source_resolution.section_sha256
    )
    matching = tuple(
        finding
        for finding in bundle.detected_quarantines
        if finding.uid == bundle.quarantine_card["id"]
    )
    assert matching
    assert bundle.quarantine_result.accepted == matching
    assert bundle.quarantine["subjectSha256"] == matching[0].subject_sha256


def test_qbank_detected_quarantine_cannot_remain_release_eligible(
    passing_release_factory,
):
    bundle = passing_release_factory()
    config = deepcopy(bundle.config)
    config["knownSafetyHolds"] = [
        {
            "qbankUid": bundle.qbank_item["id"],
            "reasonCode": "SYNTHETIC_QBANK_HOLD",
        }
    ]
    detection_inputs = replace_inputs(bundle.inputs, release_config=config)
    findings = detect_quarantines(
        detection_inputs, build_qbank_notes(bundle.qbank_item), CANDIDATE_DATE
    )

    unaccepted_inputs = replace_inputs(
        detection_inputs, detected_quarantines=findings, quarantine=()
    )
    unaccepted = evaluate_qbank_note(
        bundle.qbank_item, "base", unaccepted_inputs, CANDIDATE_DATE
    )
    assert unaccepted.eligible is False
    assert "QUARANTINE_UNACCEPTED" in codes(unaccepted.issues)

    accepted_entry = ledger_entry(findings[0])
    accepted_inputs = replace_inputs(
        detection_inputs,
        detected_quarantines=findings,
        quarantine=(accepted_entry,),
    )
    accepted = evaluate_qbank_note(
        bundle.qbank_item, "base", accepted_inputs, CANDIDATE_DATE
    )
    assert accepted.eligible is False
    assert "QBANK_QUARANTINED" in codes(accepted.issues)
    assert "QUARANTINE_UNACCEPTED" not in codes(accepted.issues)


def test_qbank_risk_facets_use_the_same_fail_closed_rules(passing_release_factory):
    bundle = passing_release_factory()
    review = deepcopy(bundle.qbank_review)
    review["risk"] = {"level": "Routine", "facets": ["Medication"]}
    inputs = replace_inputs(bundle.inputs, qbank_reviews=(review,))

    decision = evaluate_qbank_note(
        bundle.qbank_item, "base", inputs, CANDIDATE_DATE
    )

    assert decision.eligible is False
    assert "HIGH_RISK_LABEL_REQUIRED" in codes(decision.issues)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda card, bundle: card.pop("reinforces"),
        lambda card, bundle: card.__setitem__(
            "reinforces", next(c["id"] for c in bundle.core_cards if c["week"] > card["week"])
        ),
        lambda card, bundle: card.__setitem__(
            "reinforces", bundle.application_cards[1]["id"]
        ),
        lambda card, bundle: card.__setitem__(
            "reinforces", next(c["id"] for c in bundle.core_cards if c["state"] == "approved")
        ),
    ],
    ids=["absent", "later-week", "non-core", "not-approved"],
)
def test_application_reinforces_requires_an_approved_same_or_earlier_core(
    passing_release_factory, mutation, request
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.application_cards[0])
    inputs = deepcopy(bundle.inputs)
    if request.node.callspec.id == "not-approved":
        target = next(c for c in inputs.cards if c["kind"] != "application")
        target["state"] = "draft"
        card["reinforces"] = target["id"]
    else:
        mutation(card, bundle)
    if "reinforces" in card:
        bundle.approve_card(card, bundle.qbank_item)

    decision = evaluate_card(card, inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "APPLICATION_REINFORCES_INVALID" in codes(decision.issues)


def test_application_task_bundle_is_required_before_rendering(passing_release_factory):
    bundle = passing_release_factory()
    card = deepcopy(bundle.application_cards[0])
    card["qbank"].pop("taskBundle")

    decision = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert decision.rendered is None
    assert "APPLICATION_TASK_BUNDLE_REQUIRED" in codes(decision.issues)


def test_authoring_returns_blockers_but_release_mode_raises(passing_release_factory):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    card["answer"] = "Changed after approval."

    authoring = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)
    assert authoring.rendered is not None
    assert authoring.eligible is False

    release_inputs = replace_inputs(bundle.inputs, mode="release")
    with pytest.raises(GovernanceError) as caught:
        evaluate_card(card, release_inputs, CANDIDATE_DATE)
    assert "CARD_APPROVAL_DRIFT" in codes(caught.value.issues)


def test_authoring_may_render_a_draft_preview_but_release_fails_closed(
    passing_release_factory,
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    card["state"] = "draft"

    preview = evaluate_card(card, bundle.inputs, CANDIDATE_DATE)
    assert preview.rendered is not None
    assert preview.rendered.active is False
    assert preview.eligible is False
    assert "CARD_NOT_APPROVED" in codes(preview.issues)

    with pytest.raises(GovernanceError):
        evaluate_card(
            card, replace_inputs(bundle.inputs, mode="release"), CANDIDATE_DATE
        )


def test_matching_source_and_approval_never_restore_quarantined_card(
    passing_release_factory,
):
    bundle = passing_release_factory()

    decision = evaluate_card(bundle.quarantine_card, bundle.inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "CARD_QUARANTINED" in codes(decision.issues)


def test_arbitrary_note_hash_ledger_cannot_bypass_detected_quarantine_reconciliation(
    passing_release_factory,
):
    bundle = passing_release_factory()
    forged = deepcopy(bundle.quarantine)
    forged["subjectSha256"] = render_card(bundle.quarantine_card).render_sha256
    inputs = replace_inputs(
        bundle.inputs, quarantine=(forged,), detected_quarantines=()
    )

    decision = evaluate_card(bundle.quarantine_card, inputs, CANDIDATE_DATE)

    assert decision.eligible is False
    assert "QUARANTINE_UNACCEPTED" in codes(decision.issues)


def make_finding(**changes):
    values = dict(
        namespace="core",
        uid="synthetic_duplicate_002",
        identity="base",
        reason_code="FRONT_EXACT_DUPLICATE",
        subject_sha256="a" * 64,
        source_path="synthetic/synthetic-source.md",
        first_seen_commit="ad7dd2851f4621a4177cd4ce34438af3751620d6",
        withdrawal_render_sha256="b" * 64,
    )
    values.update(changes)
    return QuarantineFinding(**values)


def ledger_entry(finding, **changes):
    value = {
        "namespace": finding.namespace,
        "uid": finding.uid,
        "identity": finding.identity,
        "reasonCode": finding.reason_code,
        "subjectSha256": finding.subject_sha256,
        "sourcePath": finding.source_path,
        "firstSeenCommit": finding.first_seen_commit,
        "reviewOwner": "Synthetic Review Owner",
        "disposition": "exclude",
        "reviewedBy": "Synthetic Reviewer",
        "reviewedAt": "2026-07-03",
    }
    value.update(changes)
    return value


def test_same_canonical_quarantined_card_flows_through_detection_to_coverage(
    passing_release_factory,
):
    bundle = passing_release_factory()
    target = bundle.core_cards[0]
    quarantined = bundle.quarantine_card
    assert quarantined["state"] == "quarantined"
    detection_inputs = replace_inputs(
        bundle.inputs,
        cards=(target, quarantined),
        detected_quarantines=(),
        quarantine=(),
    )

    findings = detect_quarantines(
        detection_inputs,
        (render_card(target), render_card(quarantined)),
        CANDIDATE_DATE,
    )
    matching = tuple(finding for finding in findings if finding.uid == quarantined["id"])
    assert len(matching) == 1

    fresh = reconcile_quarantines(matching, ())
    assert fresh.new == matching
    fresh_inputs = replace_inputs(
        bundle.inputs, detected_quarantines=matching, quarantine=()
    )
    fresh_decision = evaluate_card(quarantined, fresh_inputs, CANDIDATE_DATE)
    assert "QUARANTINE_UNACCEPTED" in codes(fresh_decision.issues)
    fresh_coverage = validate_release_coverage(
        bundle.cards,
        bundle.contract,
        detected_quarantines=matching,
        quarantine=(),
        release_history=bundle.inputs.release_history,
    )
    assert "QUARANTINE_UNACCEPTED" in codes(fresh_coverage)

    changed_entry = ledger_entry(
        matching[0], sourcePath="synthetic/changed-source.md"
    )
    changed = reconcile_quarantines(matching, (changed_entry,))
    assert changed.changed == matching
    changed_inputs = replace_inputs(
        bundle.inputs,
        detected_quarantines=matching,
        quarantine=(changed_entry,),
    )
    changed_decision = evaluate_card(
        quarantined, changed_inputs, CANDIDATE_DATE
    )
    assert "QUARANTINE_UNACCEPTED" in codes(changed_decision.issues)
    assert "QUARANTINE_UNACCEPTED" in codes(
        validate_release_coverage(
            bundle.cards,
            bundle.contract,
            detected_quarantines=matching,
            quarantine=(changed_entry,),
            release_history=bundle.inputs.release_history,
        )
    )

    accepted_entry = ledger_entry(matching[0])
    accepted = reconcile_quarantines(matching, (accepted_entry,))
    assert accepted.accepted == matching
    accepted_inputs = replace_inputs(
        bundle.inputs,
        detected_quarantines=matching,
        quarantine=(accepted_entry,),
    )
    accepted_decision = evaluate_card(
        quarantined, accepted_inputs, CANDIDATE_DATE
    )
    assert accepted_decision.eligible is False
    assert not any(issue.severity == "hard" for issue in accepted_decision.issues)
    assert validate_release_coverage(
        bundle.cards,
        bundle.contract,
        detected_quarantines=matching,
        quarantine=(accepted_entry,),
        release_history=bundle.inputs.release_history,
    ) == []


def two_findings_for_one_card(bundle):
    candidate = deepcopy(bundle.core_cards[0])
    first_target = deepcopy(bundle.core_cards[1])
    second_target = deepcopy(bundle.core_cards[2])
    for index, card in enumerate((candidate, first_target, second_target), start=1):
        card["front"] = "one shared normalized prompt"
        card["answer"] = f"unique direct answer {index}"
        card["reinforces"] = None
        bundle.approve_card(card)
    inputs = replace_inputs(
        bundle.inputs, cards=(candidate, first_target, second_target)
    )
    findings = detect_quarantines(
        inputs,
        tuple(render_card(card) for card in (candidate, first_target, second_target)),
        CANDIDATE_DATE,
    )
    candidate_findings = tuple(
        finding
        for finding in findings
        if finding.uid == candidate["id"]
        and finding.reason_code == "FRONT_EXACT_DUPLICATE"
    )
    assert len(candidate_findings) == 2
    assert len({finding.subject_sha256 for finding in candidate_findings}) == 2
    return candidate_findings


def test_reconciliation_preserves_multiple_exact_findings_for_one_card(
    passing_release_factory,
):
    bundle = passing_release_factory()
    findings = two_findings_for_one_card(bundle)

    partial = reconcile_quarantines(findings, (ledger_entry(findings[0]),))
    assert partial.accepted == (findings[0],)
    assert (*partial.new, *partial.changed) == (findings[1],)

    complete = reconcile_quarantines(
        findings, tuple(ledger_entry(finding) for finding in findings)
    )
    assert complete.accepted == findings
    assert complete.new == complete.changed == ()


def test_quarantined_card_requires_every_current_exact_finding_accepted(
    passing_release_factory,
):
    bundle = passing_release_factory()
    quarantined = bundle.quarantine_card
    first_target = bundle.core_cards[0]
    second_target = bundle.core_cards[1]
    quarantined["front"] = "alpha beta gamma delta epsilon"
    first_target["front"] = "alpha beta gamma delta"
    second_target["front"] = "alpha beta gamma epsilon"
    for card in (quarantined, first_target, second_target):
        bundle.approve_card(card)
    detection_inputs = replace_inputs(
        bundle.inputs, cards=(quarantined, first_target, second_target)
    )
    detected = detect_quarantines(
        detection_inputs,
        tuple(
            render_card(card)
            for card in (quarantined, first_target, second_target)
        ),
        CANDIDATE_DATE,
    )
    findings = tuple(
        finding
        for finding in detected
        if finding.uid == quarantined["id"]
        and finding.reason_code == "FRONT_JACCARD_DUPLICATE"
    )
    assert len(findings) == 2

    partial_ledger = (ledger_entry(findings[0]),)
    partial_inputs = replace_inputs(
        bundle.inputs,
        detected_quarantines=findings,
        quarantine=partial_ledger,
    )
    partial = evaluate_card(quarantined, partial_inputs, CANDIDATE_DATE)
    assert "QUARANTINE_UNACCEPTED" in codes(partial.issues)

    complete_ledger = tuple(ledger_entry(finding) for finding in findings)
    complete_inputs = replace_inputs(
        bundle.inputs,
        detected_quarantines=findings,
        quarantine=complete_ledger,
    )
    complete = evaluate_card(quarantined, complete_inputs, CANDIDATE_DATE)
    assert not any(issue.severity == "hard" for issue in complete.issues)
    assert validate_release_coverage(
        bundle.cards,
        bundle.contract,
        detected_quarantines=findings,
        quarantine=complete_ledger,
        release_history=bundle.inputs.release_history,
    ) == []


@pytest.mark.parametrize(
    "mutation",
    [
        lambda finding: replace(finding, subject_sha256="f" * 64),
        lambda finding: replace(finding, reason_code="CHANGED_REASON"),
        lambda finding: replace(finding, source_path="synthetic/changed-source.md"),
        lambda finding: replace(finding, first_seen_commit="b" * 40),
    ],
    ids=["subject", "reason", "source", "first-seen"],
)
def test_one_changed_finding_is_changed_without_collapsing_its_sibling(
    passing_release_factory, mutation
):
    bundle = passing_release_factory()
    original = two_findings_for_one_card(bundle)
    changed = mutation(original[0])
    detected = (changed, original[1])
    ledger = tuple(ledger_entry(finding) for finding in original)

    result = reconcile_quarantines(detected, ledger)

    assert result.accepted == (original[1],)
    assert result.changed == (changed,)
    assert result.new == ()


def test_quarantine_reconciliation_distinguishes_new_changed_accepted_and_resolved():
    accepted = make_finding(uid="accepted")
    changed = make_finding(uid="changed", subject_sha256="c" * 64)
    new = make_finding(uid="new")
    resolved = make_finding(uid="resolved")
    ledger = {
        "accepted": [
            ledger_entry(accepted),
            ledger_entry(changed, subjectSha256="d" * 64),
            ledger_entry(resolved),
        ]
    }

    result = reconcile_quarantines((accepted, changed, new), ledger)

    assert result.accepted == (accepted,)
    assert result.changed == (changed,)
    assert result.new == (new,)
    assert [finding.uid for finding in result.resolved] == ["resolved"]


@pytest.mark.parametrize(
    "drift",
    [
        {"sourcePath": "synthetic/changed-source.md"},
        {"firstSeenCommit": "bbbbbbb"},
    ],
)
def test_quarantine_source_or_first_seen_drift_requires_new_review(drift):
    finding = make_finding()
    entry = ledger_entry(finding, **drift)

    result = reconcile_quarantines((finding,), {"accepted": [entry]})

    assert result.accepted == ()
    assert result.changed == (finding,)


@pytest.mark.parametrize(
    "missing",
    [
        "reviewedBy",
        "reviewedAt",
        "affectedReleaseId",
        "withdrawalTemplateVersion",
        "approvedWithdrawalSha256",
    ],
)
def test_withdrawal_requires_named_review_release_frozen_template_and_exact_hash(missing):
    finding = make_finding()
    decision = ledger_entry(
        finding,
        disposition="withdraw",
        affectedReleaseId="synthetic-release-n",
        withdrawalTemplateVersion=WITHDRAWAL_TEMPLATE_VERSION,
        approvedWithdrawalSha256=finding.withdrawal_render_sha256,
    )
    decision.pop(missing)

    result = reconcile_quarantines((finding,), {"accepted": [decision]})

    assert result.accepted == ()
    assert result.changed == (finding,)


def test_valid_withdrawal_requires_exact_current_neutral_render_hash():
    finding = make_finding()
    valid = ledger_entry(
        finding,
        disposition="withdraw",
        affectedReleaseId="synthetic-release-n",
        withdrawalTemplateVersion=WITHDRAWAL_TEMPLATE_VERSION,
        approvedWithdrawalSha256=finding.withdrawal_render_sha256,
    )
    history = {
        "releases": [
            {
                "releaseId": "synthetic-release-n",
                "memberships": [
                    {
                        "namespace": finding.namespace,
                        "uid": finding.uid,
                        "identity": finding.identity,
                    }
                ],
            }
        ]
    }
    reconciled = reconcile_quarantines(
        (finding,), {"accepted": [valid]}, release_history=history
    )
    assert reconciled.accepted == (finding,)
    assert len(reconciled.withdrawal_proofs) == 1
    proof = reconciled.withdrawal_proofs[0]
    assert proof.finding == finding
    assert proof.approved_withdrawal_sha256 == finding.withdrawal_render_sha256
    assert proof.affected_release_id == "synthetic-release-n"

    valid["approvedWithdrawalSha256"] = "f" * 64
    drift = reconcile_quarantines(
        (finding,), {"accepted": [valid]}, release_history=history
    )
    assert drift.accepted == ()
    assert drift.changed == (finding,)


def test_withdrawal_without_exact_historical_membership_is_blocked():
    finding = make_finding()
    decision = ledger_entry(
        finding,
        disposition="withdraw",
        affectedReleaseId="synthetic-release-n",
        withdrawalTemplateVersion=WITHDRAWAL_TEMPLATE_VERSION,
        approvedWithdrawalSha256=finding.withdrawal_render_sha256,
    )

    result = reconcile_quarantines(
        (finding,), {"accepted": [decision]}, release_history={"releases": []}
    )

    assert result.accepted == ()
    assert result.changed == (finding,)


def test_withdrawal_without_independent_neutral_render_proof_is_blocked():
    finding = make_finding(withdrawal_render_sha256=None)
    decision = ledger_entry(
        finding,
        disposition="withdraw",
        affectedReleaseId="synthetic-release-n",
        withdrawalTemplateVersion=WITHDRAWAL_TEMPLATE_VERSION,
        approvedWithdrawalSha256="b" * 64,
    )
    history = {
        "releases": [
            {
                "releaseId": "synthetic-release-n",
                "memberships": [
                    {
                        "namespace": finding.namespace,
                        "uid": finding.uid,
                        "identity": finding.identity,
                    }
                ],
            }
        ]
    }

    result = reconcile_quarantines(
        (finding,), {"accepted": [decision]}, release_history=history
    )

    assert result.accepted == ()
    assert result.changed == (finding,)


def duplicate_findings(
    bundle,
    *,
    first_front="first unique front",
    second_front="second unique front",
    first_answer="first unique answer",
    second_answer="second unique answer",
    reinforces=None,
    extras=(),
    reverse=False,
):
    first = deepcopy(bundle.core_cards[0])
    second = deepcopy(bundle.core_cards[1])
    first.update(front=first_front, answer=first_answer, reinforces=None)
    second.update(front=second_front, answer=second_answer, reinforces=reinforces)
    bundle.approve_card(first)
    bundle.approve_card(second)
    rendered = (render_card(first), render_card(second))
    input_cards = (first, second, *extras)
    if reverse:
        rendered = tuple(reversed(rendered))
        input_cards = tuple(reversed(input_cards))
    inputs = replace_inputs(bundle.inputs, cards=input_cards)
    return detect_quarantines(inputs, rendered, CANDIDATE_DATE), first, second


@pytest.mark.parametrize(
    "fronts,expected",
    [
        (("Alpha Beta", "alpha beta"), "FRONT_EXACT_DUPLICATE"),
        (("alpha beta gamma delta", "alpha beta gamma delta epsilon"), "FRONT_JACCARD_DUPLICATE"),
        (("alpha beta gamma", "alpha beta gamma delta"), None),
    ],
    ids=["exact", "boundary-0.80", "below-0.80"],
)
def test_front_duplicate_exact_and_jaccard_boundary(passing_release_factory, fronts, expected):
    bundle = passing_release_factory()
    findings, _first, _second = duplicate_findings(
        bundle, first_front=fronts[0], second_front=fronts[1]
    )
    reason_codes = {finding.reason_code for finding in findings}
    if expected is None:
        assert reason_codes.isdisjoint({"FRONT_EXACT_DUPLICATE", "FRONT_JACCARD_DUPLICATE"})
    else:
        assert expected in reason_codes


@pytest.mark.parametrize(
    "answers,expected",
    [
        (("Alpha Beta", "alpha beta"), "ANSWER_EXACT_DUPLICATE"),
        (("alpha beta gamma delta", "alpha beta gamma delta epsilon"), "ANSWER_JACCARD_DUPLICATE"),
        (("alpha beta gamma", "alpha beta gamma delta"), None),
    ],
    ids=["exact", "boundary-0.80", "below-0.80"],
)
def test_direct_answer_duplicate_exact_and_jaccard_boundary(
    passing_release_factory, answers, expected
):
    bundle = passing_release_factory()
    findings, _first, _second = duplicate_findings(
        bundle, first_answer=answers[0], second_answer=answers[1]
    )
    reason_codes = {finding.reason_code for finding in findings}
    if expected is None:
        assert reason_codes.isdisjoint({"ANSWER_EXACT_DUPLICATE", "ANSWER_JACCARD_DUPLICATE"})
    else:
        assert expected in reason_codes


def test_duplicate_normalization_removes_html_markdown_case_and_punctuation(
    passing_release_factory,
):
    bundle = passing_release_factory()
    findings, _first, _second = duplicate_findings(
        bundle,
        first_front="<b>Condition Alpha</b> -- marker!",
        second_front="**condition alpha** marker",
    )
    assert "FRONT_EXACT_DUPLICATE" in {finding.reason_code for finding in findings}


@pytest.mark.parametrize("link_kind", ["self", "retired", "missing", "unrelated"])
def test_reinforces_waives_only_the_exact_compared_live_approved_target(
    passing_release_factory, link_kind
):
    bundle = passing_release_factory()
    first = deepcopy(bundle.core_cards[0])
    second = deepcopy(bundle.core_cards[1])
    retired = deepcopy(bundle.core_cards[2])
    unrelated = deepcopy(bundle.core_cards[3])
    retired["state"] = "retired"
    targets = {
        "self": second["id"],
        "retired": retired["id"],
        "missing": "synthetic_missing_target",
        "unrelated": unrelated["id"],
    }
    findings, _first, _second = duplicate_findings(
        bundle,
        first_front="same exact prompt",
        second_front="same exact prompt",
        reinforces=targets[link_kind],
        extras=(retired, unrelated),
    )
    assert "FRONT_EXACT_DUPLICATE" in {finding.reason_code for finding in findings}


def test_valid_reinforces_waives_only_that_duplicate_pair(passing_release_factory):
    bundle = passing_release_factory()
    target_id = bundle.core_cards[0]["id"]
    findings, _first, _second = duplicate_findings(
        bundle,
        first_front="same exact prompt",
        second_front="same exact prompt",
        reinforces=target_id,
    )
    assert "FRONT_EXACT_DUPLICATE" not in {
        finding.reason_code for finding in findings
    }


def test_duplicate_finding_is_canonical_under_input_order_permutation(
    passing_release_factory,
):
    bundle = passing_release_factory()
    forward, _first, _second = duplicate_findings(
        bundle, first_front="same exact prompt", second_front="same exact prompt"
    )
    reverse, _first, _second = duplicate_findings(
        bundle,
        first_front="same exact prompt",
        second_front="same exact prompt",
        reverse=True,
    )
    forward_front = next(
        finding for finding in forward if finding.reason_code == "FRONT_EXACT_DUPLICATE"
    )
    reverse_front = next(
        finding for finding in reverse if finding.reason_code == "FRONT_EXACT_DUPLICATE"
    )

    assert reverse_front == forward_front


def test_directed_reinforces_waiver_is_independent_of_note_input_order(
    passing_release_factory,
):
    bundle = passing_release_factory()
    target_id = bundle.core_cards[0]["id"]

    findings, _first, _second = duplicate_findings(
        bundle,
        first_front="same exact prompt",
        second_front="same exact prompt",
        reinforces=target_id,
        reverse=True,
    )

    assert "FRONT_EXACT_DUPLICATE" not in {
        finding.reason_code for finding in findings
    }


@pytest.mark.parametrize("which", ["candidate", "target"])
def test_duplicate_acceptance_hash_binds_both_current_renders_and_approvals(
    passing_release_factory, which
):
    bundle = passing_release_factory()
    baseline, first, second = duplicate_findings(
        bundle, first_front="same exact prompt", second_front="same exact prompt"
    )
    baseline_front = next(
        finding for finding in baseline if finding.reason_code == "FRONT_EXACT_DUPLICATE"
    )
    changed = second if which == "candidate" else first
    changed["explanation"] = f"Changed nonduplicate {which} explanation."
    bundle.approve_card(changed)
    rendered = (render_card(first), render_card(second))
    inputs = replace_inputs(bundle.inputs, cards=(first, second))

    current = detect_quarantines(inputs, rendered, CANDIDATE_DATE)
    current_front = next(
        finding for finding in current if finding.reason_code == "FRONT_EXACT_DUPLICATE"
    )

    assert current_front.subject_sha256 != baseline_front.subject_sha256


def test_duplicate_detection_fails_closed_without_canonical_first_seen_provenance(
    passing_release_factory, tmp_path
):
    bundle = passing_release_factory()
    first = deepcopy(bundle.core_cards[0])
    second = deepcopy(bundle.core_cards[1])
    first["front"] = second["front"] = "same exact prompt"
    bundle.approve_card(first)
    bundle.approve_card(second)
    empty_repo = tmp_path / "no-canonical-registry"
    empty_repo.mkdir()
    inputs = replace_inputs(bundle.inputs, cards=(first, second), repo_root=empty_repo)

    with pytest.raises(ValueError, match="FIRST_SEEN_PROVENANCE_REQUIRED"):
        detect_quarantines(
            inputs, (render_card(first), render_card(second)), CANDIDATE_DATE
        )


def test_configured_qbank_hold_is_detected_with_ownerless_proposal_fields(
    passing_release_factory,
):
    bundle = passing_release_factory()
    held_item = deepcopy(bundle.qbank_item)
    held_item["id"] = "qb_pha_002"
    rendered = build_qbank_notes(held_item)
    config = deepcopy(bundle.config)
    config["knownSafetyHolds"] = [
        {"qbankUid": "qb_pha_002", "reasonCode": "QBANK_STALE_SAFETY_WORDING"}
    ]
    inputs = replace_inputs(
        bundle.inputs,
        release_config=config,
        repo_root=Path(__file__).resolve().parents[2],
    )

    findings = detect_quarantines(inputs, rendered, CANDIDATE_DATE)

    assert [(f.uid, f.reason_code, f.first_seen_commit) for f in findings] == [
        (
            "qb_pha_002",
            "QBANK_STALE_SAFETY_WORDING",
            "27e2ef26245145bedfb997dfc424e7c91e72bb40",
        )
    ]


def test_narrow_scanner_writes_noncanonical_owner_required_proposal_only(tmp_path):
    from scan_quarantine import scan_repository

    repo = Path(__file__).resolve().parents[2]
    canonical_path = repo / "13_Faculty_Resources" / "anki" / "quarantine.json"
    canonical_before = canonical_path.read_bytes()
    out = tmp_path / "quarantine-proposals.json"

    report = scan_repository(repo, out)

    assert out.exists()
    assert report["canonical"] is False
    assert [proposal["uid"] for proposal in report["proposals"]] == ["qb_pha_002"]
    proposal = report["proposals"][0]
    assert proposal["reasonCode"] == "QBANK_STALE_SAFETY_WORDING"
    assert proposal["firstSeenCommit"] == "27e2ef26245145bedfb997dfc424e7c91e72bb40"
    assert proposal["reviewOwnerRequired"] is True
    assert not ({"reviewOwner", "reviewedBy", "reviewedAt"} & set(proposal))
    assert canonical_path.read_bytes() == canonical_before


def test_narrow_scanner_fails_closed_when_a_configured_hold_item_is_missing(tmp_path):
    from scan_quarantine import scan_repository

    repo = tmp_path / "repo"
    registry = repo / "13_Faculty_Resources" / "anki"
    registry.mkdir(parents=True)
    (registry / "release_config.json").write_text(
        json.dumps(
            {
                "knownSafetyHolds": [
                    {
                        "qbankUid": "qb_pha_002",
                        "reasonCode": "QBANK_STALE_SAFETY_WORDING",
                    }
                ]
            }
        )
    )
    (repo / "question_bank.json").write_text(json.dumps({"items": []}))

    with pytest.raises(ValueError, match="configured safety hold is missing"):
        scan_repository(repo, tmp_path / "proposals.json")
