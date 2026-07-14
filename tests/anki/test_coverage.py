from collections import Counter
from copy import deepcopy

import pytest

from pcl_anki.governance import (
    compute_application_coverage,
    compute_core_coverage,
    validate_pilot_coverage,
    validate_release_coverage,
)


CORE_FAMILIES = {
    "Discriminator",
    "StudentAction",
    "Escalation",
    "Monitor",
    "WordsToSay",
    "TherapyMatch",
    "Disposition",
}
CORE_TASKS = {
    "Recognize",
    "Discriminate",
    "Ask",
    "Say",
    "Escalate",
    "Monitor",
    "Handoff",
}


def codes(issues):
    return {issue.code for issue in issues}


def cell_counter(contract):
    return Counter(
        {
            (int(cell.split("|", 1)[0][1:]), cell.split("|", 1)[1]): count
            for cell, count in contract.items()
        }
    )


def test_passing_fixture_is_exact_36_plus_36_cells_and_144_plus_48_totals(
    passing_release_factory,
):
    bundle = passing_release_factory()

    core = compute_core_coverage(bundle.cards)
    application = compute_application_coverage(bundle.cards)

    assert core == cell_counter(bundle.contract["core"])
    assert application == cell_counter(bundle.contract["application"])
    assert len(bundle.contract["core"]) == len(core) == 36
    assert len(bundle.contract["application"]) == 36
    assert len(application) <= 36  # zero-valued exact cells remain explicit in the contract.
    assert sum(core.values()) == 144
    assert sum(application.values()) == 48
    assert validate_release_coverage(
        bundle.cards,
        bundle.contract,
        detected_quarantines=bundle.detected_quarantines,
        quarantine=bundle.inputs.quarantine,
        release_history=bundle.inputs.release_history,
    ) == []


@pytest.mark.parametrize("namespace", ["core", "application"])
def test_every_one_of_the_36_declared_cells_is_compared_for_exact_equality(
    passing_release_factory, namespace
):
    bundle = passing_release_factory()
    source = bundle.core_cards if namespace == "core" else bundle.application_cards
    expected_code = (
        "CORE_COVERAGE_CELL_MISMATCH"
        if namespace == "core"
        else "APPLICATION_COVERAGE_CELL_MISMATCH"
    )

    for cell in bundle.contract[namespace]:
        week_text, dimension = cell.split("|", 1)
        week = int(week_text[1:])
        if namespace == "core":
            victim = next(
                card
                for card in source
                if card["week"] == week and card["domain"] == dimension
            )
            mutated = [card for card in bundle.cards if card is not victim]
        elif bundle.contract[namespace][cell] > 0:
            victim = next(
                card
                for card in source
                if card["week"] == week
                and card["qbank"]["taskBundle"] == dimension
            )
            mutated = [card for card in bundle.cards if card is not victim]
        else:
            overfill = deepcopy(bundle.application_cards[0])
            overfill["id"] = f"synthetic_zero_cell_w{week:02d}_{dimension.lower()}"
            overfill["week"] = week
            overfill["qbank"]["taskBundle"] = dimension
            mutated = [*bundle.cards, overfill]
        issues = validate_release_coverage(mutated, bundle.contract)
        assert expected_code in codes(issues), cell
        assert any(issue.subject == cell for issue in issues), cell


def test_exact_equality_rejects_overfill_not_only_underfill(passing_release_factory):
    bundle = passing_release_factory()
    duplicate = deepcopy(bundle.core_cards[0])
    duplicate["id"] = "synthetic_overfill_001"

    issues = validate_release_coverage((*bundle.cards, duplicate), bundle.contract)

    assert "CORE_COVERAGE_CELL_MISMATCH" in codes(issues)
    assert "CORE_COVERAGE_TOTAL_MISMATCH" in codes(issues)


def test_accepted_quarantine_is_excluded_and_exact_coverage_still_holds(
    passing_release_factory,
):
    bundle = passing_release_factory()

    assert bundle.quarantine_card["state"] == "quarantined"
    assert bundle.quarantine["uid"] == bundle.quarantine_card["id"]
    assert validate_release_coverage(
        bundle.cards,
        bundle.contract,
        detected_quarantines=bundle.detected_quarantines,
        quarantine=bundle.inputs.quarantine,
        release_history=bundle.inputs.release_history,
    ) == []
    assert sum(compute_core_coverage(bundle.cards).values()) == 144


def test_coverage_cannot_bypass_quarantine_reconciliation(passing_release_factory):
    bundle = passing_release_factory()

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    assert "QUARANTINE_RECONCILIATION_REQUIRED" in codes(issues)


def test_accepted_quarantine_cannot_break_even_one_quota_cell(passing_release_factory):
    bundle = passing_release_factory()
    victim = bundle.core_cards[0]
    victim["state"] = "quarantined"

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    assert "CORE_COVERAGE_CELL_MISMATCH" in codes(issues)
    assert "CORE_COVERAGE_TOTAL_MISMATCH" in codes(issues)


@pytest.mark.parametrize("inactive_state", ["retired", "quarantined"])
def test_retired_or_quarantined_records_are_never_counted_as_active(
    passing_release_factory, inactive_state
):
    bundle = passing_release_factory()
    card = deepcopy(bundle.core_cards[0])
    card["state"] = inactive_state

    assert compute_core_coverage((card,)) == Counter()


def test_application_task_bundle_absence_is_a_hard_coverage_issue(
    passing_release_factory,
):
    bundle = passing_release_factory()
    card = bundle.application_cards[0]
    card["qbank"].pop("taskBundle")

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    assert "APPLICATION_TASK_BUNDLE_REQUIRED" in codes(issues)
    assert "APPLICATION_COVERAGE_TOTAL_MISMATCH" in codes(issues)


@pytest.mark.parametrize("week", [1, 5])
@pytest.mark.parametrize("missing_task", ["Recognize", "Escalate"])
def test_week_one_and_five_each_require_recognize_and_escalate(
    passing_release_factory, week, missing_task
):
    bundle = passing_release_factory()
    for card in bundle.core_cards:
        if card["week"] == week and card["task"] == missing_task:
            card["task"] = "Ask"

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    assert "CORE_WEEK_TASK_REQUIRED" in codes(issues)
    assert any(
        issue.subject == f"W{week:02d}|{missing_task}" for issue in issues
    )


@pytest.mark.parametrize("kind", ["family", "task"])
def test_every_core_family_and_task_must_appear(passing_release_factory, kind):
    bundle = passing_release_factory()
    values = CORE_FAMILIES if kind == "family" else CORE_TASKS
    missing = sorted(values)[0]
    replacement = next(value for value in values if value != missing)
    for card in bundle.core_cards:
        if card[kind] == missing:
            card[kind] = replacement

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    expected = "CORE_FAMILY_REQUIRED" if kind == "family" else "CORE_TASK_REQUIRED"
    assert expected in codes(issues)


@pytest.mark.parametrize(
    "answer",
    [
        "The student should prescribe the invented token.",
        "You must discharge the invented subject.",
        "The student can medically clear the invented subject.",
        "You should independently restrain the invented subject.",
        "The student must determine legal disposition.",
        "You can titrate the invented token.",
        "You, as the student, should prescribe the invented token.",
        "<b>You</b> may discharge the invented subject.",
    ],
)
def test_direct_answer_rejects_independent_ms3_actions(
    passing_release_factory, answer
):
    bundle = passing_release_factory()
    bundle.core_cards[0]["answer"] = answer

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    assert "ROLE_SAFETY_UNSAFE_INDEPENDENT_ACTION" in codes(issues)


@pytest.mark.parametrize(
    "answer",
    [
        "Recognize the invented marker and notify the supervising clinician.",
        "Do not restrain; notify the supervising team.",
        "The student should not prescribe and should escalate to the supervisor.",
        "You can recognize the invented pattern and ask the resident to review it.",
        "You should determine whether the invented marker is present and notify the supervisor.",
        "You should clear up the invented wording with the teaching team.",
    ],
)
def test_role_safety_minimal_pairs_allow_recognition_notification_and_negation(
    passing_release_factory, answer
):
    bundle = passing_release_factory()
    bundle.core_cards[0]["answer"] = answer

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    assert "ROLE_SAFETY_UNSAFE_INDEPENDENT_ACTION" not in codes(issues)


def test_negated_supervision_language_does_not_satisfy_required_caveat(
    passing_release_factory,
):
    bundle = passing_release_factory()
    card = bundle.core_cards[0]
    card["family"] = "StudentAction"
    card["caveat"] = "Do not notify the attending."

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    assert "ROLE_SAFETY_CAVEAT_REQUIRED" in codes(issues)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda card: card.__setitem__("family", "StudentAction"),
        lambda card: card.__setitem__("family", "Escalation"),
        lambda card: card.__setitem__("family", "Monitor"),
        lambda card: card.__setitem__("family", "Disposition"),
        lambda card: card.__setitem__("risk", {"level": "High", "facets": []}),
        lambda card: card.__setitem__(
            "risk", {"level": "High", "facets": ["Legal"]}
        ),
    ],
)
def test_action_high_and_legal_cards_require_explicit_supervision_caveat(
    passing_release_factory, mutation
):
    bundle = passing_release_factory()
    card = bundle.core_cards[0]
    mutation(card)
    card["caveat"] = "An invented caveat without role language."

    issues = validate_release_coverage(bundle.cards, bundle.contract)

    assert "ROLE_SAFETY_CAVEAT_REQUIRED" in codes(issues)


def test_pilot_authoring_assertion_is_separate_and_exactly_one_draft_per_core_cell(
    passing_release_factory,
):
    bundle = passing_release_factory()
    pilot = []
    for cell in bundle.contract["core"]:
        week_text, domain = cell.split("|", 1)
        source = next(
            card
            for card in bundle.core_cards
            if card["week"] == int(week_text[1:]) and card["domain"] == domain
        )
        card = deepcopy(source)
        card["id"] += "_pilot"
        card["state"] = "draft"
        pilot.append(card)

    assert len(pilot) == 36
    assert validate_pilot_coverage(pilot) == []
    assert "CORE_COVERAGE_TOTAL_MISMATCH" in codes(
        validate_release_coverage(pilot, bundle.contract)
    )

    pilot.pop()
    assert "PILOT_CORE_CELL_MISMATCH" in codes(validate_pilot_coverage(pilot))
