from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
ANKI_AUTOMATION = REPO_ROOT / "13_Faculty_Resources" / "_automation" / "anki"
sys.path.insert(0, str(ANKI_AUTOMATION))


@pytest.fixture
def legacy_qbank_path() -> Path:
    return Path(__file__).parent / "fixtures" / "legacy_qbank_2026-07-12.apkg"


@pytest.fixture
def legacy_all_path() -> Path:
    return Path(__file__).parent / "fixtures" / "legacy_all_2026-07-12.apkg"


@pytest.fixture
def passing_release_factory():
    """Expand compact, non-clinical templates into the exact release matrix."""

    from pcl_anki.contract import canonical_json_sha256
    from pcl_anki.qbank import qbank_item_sha256
    from pcl_anki.render import (
        TEMPLATE_CONTRACTS,
        TEMPLATE_CONTRACT_SHA256,
        build_qbank_notes,
        render_card,
    )

    fixture_dir = Path(__file__).parent / "fixtures" / "passing_release_inputs"
    card_template = json.loads((fixture_dir / "card_template.json").read_text())
    qbank_template = json.loads((fixture_dir / "qbank_item.json").read_text())
    records_template = json.loads((fixture_dir / "governance_records.json").read_text())
    release_config = json.loads(
        (REPO_ROOT / "13_Faculty_Resources" / "anki" / "release_config.json").read_text()
    )

    core_families = (
        "Discriminator",
        "StudentAction",
        "Escalation",
        "Monitor",
        "WordsToSay",
        "TherapyMatch",
        "Disposition",
    )
    core_tasks = (
        "Recognize",
        "Discriminate",
        "Ask",
        "Say",
        "Escalate",
        "Monitor",
        "Handoff",
    )

    def approve_card(card, qbank_item=None):
        note = render_card(card, qbank_item=qbank_item)
        card["review"].update(deepcopy(records_template["review"]))
        card["review"]["approvedCardSha256"] = note.render_sha256
        return render_card(card, qbank_item=qbank_item)

    def make_card(*, uid, week, domain, task, family, state="approved"):
        card = deepcopy(card_template)
        card.update(
            id=uid,
            state=state,
            week=week,
            domain=domain,
            task=task,
            family=family,
            front=f"Prompt {uid} asks marker_{uid}?",
            answer=f"Answer token_{uid} differs feature_{uid}.",
        )
        card["source"]["quote"] = f"Condition Alpha uses invented marker {uid}."
        card["source"]["quoteSha256"] = sha256(
            card["source"]["quote"].encode("utf-8")
        ).hexdigest()
        return card

    def factory():
        qbank_item = deepcopy(qbank_template)
        core_cards = []
        sequence = 0
        for cell, count in release_config["coverage"]["core"].items():
            week_text, domain = cell.split("|", 1)
            week = int(week_text[1:])
            for index in range(count):
                task = core_tasks[sequence % len(core_tasks)]
                family = core_families[sequence % len(core_families)]
                uid = f"synthetic_w{week:02d}_{domain.lower()}_{index + 1:02d}"
                card = make_card(
                    uid=uid,
                    week=week,
                    domain=domain,
                    task=task,
                    family=family,
                )
                core_cards.append(card)
                sequence += 1

        for week in (1, 5):
            week_cards = [card for card in core_cards if card["week"] == week]
            week_cards[0]["task"] = "Recognize"
            week_cards[1]["task"] = "Escalate"

        for card in core_cards:
            approve_card(card)

        application_cards = []
        sequence = 0
        for cell, count in release_config["coverage"]["application"].items():
            week_text, task_bundle = cell.split("|", 1)
            week = int(week_text[1:])
            target = next(card for card in core_cards if card["week"] == week)
            for index in range(count):
                uid = f"synthetic_app_w{week:02d}_{task_bundle.lower()}_{index + 1:02d}"
                card = make_card(
                    uid=uid,
                    week=week,
                    domain="Diagnosis",
                    task=core_tasks[sequence % len(core_tasks)],
                    family="ApplicationVignette",
                )
                card.update(kind="application", reinforces=target["id"])
                card["render"] = {
                    "templateVersion": TEMPLATE_CONTRACTS["application"]["templateVersion"],
                    "templateContractSha256": TEMPLATE_CONTRACT_SHA256["application"],
                }
                card["qbank"] = {
                    "id": qbank_item["id"],
                    "taskBundle": task_bundle,
                    "primaryPage": "synthetic-source.md",
                    "primaryAnchor": "condition-alpha",
                    "approvedItemSha256": qbank_item_sha256(qbank_item),
                    "primaryTrap": "Synthetic trap beta",
                    "sourceAnchorSha256": "d" * 64,
                }
                approve_card(card, qbank_item)
                application_cards.append(card)
                sequence += 1

        quarantine_card = make_card(
            uid="synthetic_quarantine_001",
            week=1,
            domain="Diagnosis",
            task="Ask",
            family="WordsToSay",
            state="quarantined",
        )
        quarantine_note = approve_card(quarantine_card)
        accepted_quarantine = deepcopy(records_template["acceptedQuarantine"])
        accepted_quarantine["subjectSha256"] = quarantine_note.render_sha256

        qbank_note = build_qbank_notes(qbank_item)[0]
        qbank_review = {
            "qbankId": qbank_item["id"],
            "identity": "base",
            "primaryPage": "synthetic-source.md",
            "primaryAnchor": "condition-alpha",
            "approvedItemSha256": qbank_item_sha256(qbank_item),
            "sourceAnchorSha256": "d" * 64,
            "templateVersion": TEMPLATE_CONTRACTS["legacyQbank"]["templateVersion"],
            "templateContractSha256": TEMPLATE_CONTRACT_SHA256["legacyQbank"],
            "renderedNoteSha256": qbank_note.render_sha256,
            "legacyTemplateContract": deepcopy(TEMPLATE_CONTRACTS["legacyQbank"]),
            "risk": {"level": "Routine", "facets": []},
            "facultyApprovedBy": "Synthetic Qbank Reviewer",
            "facultyApprovedAt": "2026-07-02",
        }

        cards = tuple([*core_cards, *application_cards, quarantine_card])
        inputs = SimpleNamespace(
            mode="authoring",
            repo_root=REPO_ROOT,
            cards=cards,
            qbank_items=(qbank_item,),
            qbank_reviews=(qbank_review,),
            quarantine=(accepted_quarantine,),
            release_history=deepcopy(records_template["history"]),
            release_config=deepcopy(release_config),
            reviewed=deepcopy(records_template["reviewed"]),
            evidence_records=deepcopy(records_template["evidenceRecords"]),
            policy_records=deepcopy(records_template["policyRecords"]),
            first_seen_commit="ad7dd2851f4621a4177cd4ce34438af3751620d6",
        )
        return SimpleNamespace(
            core_cards=core_cards,
            application_cards=application_cards,
            quarantine_card=quarantine_card,
            cards=cards,
            qbank_item=qbank_item,
            qbank_review=qbank_review,
            quarantine=accepted_quarantine,
            contract=deepcopy(release_config["coverage"]),
            config=deepcopy(release_config),
            records=deepcopy(records_template),
            inputs=inputs,
            approve_card=approve_card,
            evidence_sha256=canonical_json_sha256(
                records_template["evidenceRecords"]["evidence-alpha-v1"]
            ),
        )

    return factory
