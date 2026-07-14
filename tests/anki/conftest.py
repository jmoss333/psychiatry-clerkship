from copy import deepcopy
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import subprocess
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
def passing_release_factory(tmp_path):
    """Expand compact, non-clinical templates into the exact release matrix."""

    from pcl_anki.contract import ManifestIndex, canonical_json_sha256
    from pcl_anki.governance import detect_quarantines, reconcile_quarantines
    from pcl_anki.qbank import qbank_item_sha256, resolve_primary_qbank_source
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
    question_bank_schema = json.loads((REPO_ROOT / "question_bank.schema.json").read_text())

    synthetic_repo = tmp_path / "synthetic-release-repo"
    synthetic_dir = synthetic_repo / "synthetic"
    synthetic_dir.mkdir(parents=True)
    (synthetic_dir / "synthetic-source.md").write_text(
        (fixture_dir / "synthetic-source.md").read_text(), encoding="utf-8"
    )
    (synthetic_dir / "week-map.md").write_text(
        "# Synthetic Sequence\n\n## Week 1\n\n"
        "[Condition Alpha](https://une-ms3-psychiatry.netlify.app/?page=synthetic-source.md)\n",
        encoding="utf-8",
    )
    synthetic_registry = synthetic_repo / "13_Faculty_Resources" / "anki"
    synthetic_registry.mkdir(parents=True)
    synthetic_config = deepcopy(release_config)
    synthetic_config.update(
        primaryAuthorityPathPrefixes=["synthetic/"],
        contextOnlyPathPrefixes=[],
        sequencingOnlyPaths=[],
        sequenceMapPath="synthetic/week-map.md",
    )
    (synthetic_registry / "release_config.json").write_text(
        json.dumps(synthetic_config), encoding="utf-8"
    )
    manifest = ManifestIndex(
        path_to_slug={"synthetic/synthetic-source.md": "synthetic-source.md"},
        slug_to_path={"synthetic-source.md": "synthetic/synthetic-source.md"},
        slug_to_title={"synthetic-source.md": "Synthetic Source"},
    )
    reviewed = {
        "items": {
            "synthetic-source.md": {"status": "reviewed", "at": "2026-07-01"},
            "synthetic/synthetic-source.md": {
                "status": "reviewed",
                "at": "2026-07-01",
            },
        }
    }

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
        question_bank = {
            "_note": "Synthetic nonclinical qbank root",
            "version": 1,
            "items": [qbank_item],
        }
        source_inputs = SimpleNamespace(
            repo_root=synthetic_repo,
            manifest=manifest,
            reviewed=reviewed,
            surveillance={"slugs": []},
        )
        source_resolution = resolve_primary_qbank_source(
            qbank_item, "synthetic-source.md", "condition-alpha", source_inputs
        )
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
                    "sourceAnchorSha256": source_resolution.section_sha256,
                }
                card["source"] = {
                    "path": source_resolution.path,
                    "slug": source_resolution.slug,
                    "anchor": source_resolution.anchor,
                    "url": source_resolution.url,
                    "quote": source_resolution.quote,
                    "quoteSha256": source_resolution.quote_sha256,
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
        quarantine_card["front"] = core_cards[0]["front"]
        approve_card(quarantine_card)

        qbank_note = build_qbank_notes(qbank_item)[0]
        qbank_review = {
            "qbankId": qbank_item["id"],
            "identity": "base",
            "primaryPage": "synthetic-source.md",
            "primaryAnchor": "condition-alpha",
            "approvedItemSha256": qbank_item_sha256(qbank_item),
            "sourceAnchorSha256": source_resolution.section_sha256,
            "templateVersion": TEMPLATE_CONTRACTS["legacyQbank"]["templateVersion"],
            "templateContractSha256": TEMPLATE_CONTRACT_SHA256["legacyQbank"],
            "renderedNoteSha256": qbank_note.render_sha256,
            "legacyTemplateContract": deepcopy(TEMPLATE_CONTRACTS["legacyQbank"]),
            "risk": {"level": "Routine", "facets": []},
            "facultyApprovedBy": "Synthetic Qbank Reviewer",
            "facultyApprovedAt": "2026-07-02",
        }

        cards = tuple([*core_cards, *application_cards, quarantine_card])
        (synthetic_registry / "cards.json").write_text(
            json.dumps({"schemaVersion": 1, "cards": list(cards)}, indent=2),
            encoding="utf-8",
        )
        (synthetic_repo / "question_bank.json").write_text(
            json.dumps(question_bank, indent=2), encoding="utf-8"
        )
        if not (synthetic_repo / ".git").exists():
            subprocess.run(["git", "init", "-q"], cwd=synthetic_repo, check=True)
        subprocess.run(["git", "add", "."], cwd=synthetic_repo, check=True)
        staged = subprocess.run(
            ["git", "diff", "--cached", "--quiet"], cwd=synthetic_repo
        )
        if staged.returncode == 1:
            subprocess.run(
                [
                    "git",
                    "-c",
                    "user.name=Synthetic Fixture",
                    "-c",
                    "user.email=fixture@example.invalid",
                    "commit",
                    "-qm",
                    "synthetic canonical registries",
                ],
                cwd=synthetic_repo,
                check=True,
            )
        elif staged.returncode != 0:
            raise RuntimeError("could not inspect synthetic canonical registries")
        provisional_inputs = SimpleNamespace(
            mode="authoring",
            repo_root=synthetic_repo,
            cards=cards,
            question_bank=question_bank,
            question_bank_schema=question_bank_schema,
            manifest=manifest,
            qbank_reviews=(qbank_review,),
            quarantine=(),
            release_history=deepcopy(records_template["history"]),
            release_config=deepcopy(synthetic_config),
            reviewed=deepcopy(reviewed),
            surveillance={"slugs": []},
            evidence_records=deepcopy(records_template["evidenceRecords"]),
            policy_records=deepcopy(records_template["policyRecords"]),
        )
        detection_cards = (core_cards[0], quarantine_card)
        rendered_notes = tuple(
            render_card(
                card,
                qbank_item=qbank_item if card.get("kind") == "application" else None,
            )
            for card in detection_cards
        )
        detection_inputs = SimpleNamespace(
            **{**vars(provisional_inputs), "cards": detection_cards}
        )
        detected_quarantines = detect_quarantines(
            detection_inputs, rendered_notes, date(2026, 7, 14)
        )
        quarantine_finding = next(
            finding
            for finding in detected_quarantines
            if finding.uid == quarantine_card["id"]
        )
        accepted_quarantine = deepcopy(records_template["acceptedQuarantine"])
        accepted_quarantine.update(
            reasonCode=quarantine_finding.reason_code,
            subjectSha256=quarantine_finding.subject_sha256,
            sourcePath=quarantine_finding.source_path,
            firstSeenCommit=quarantine_finding.first_seen_commit,
        )
        inputs = SimpleNamespace(
            **{
                **vars(provisional_inputs),
                "quarantine": (accepted_quarantine,),
                "detected_quarantines": detected_quarantines,
            }
        )
        quarantine_result = reconcile_quarantines(
            detected_quarantines,
            inputs.quarantine,
        )
        return SimpleNamespace(
            core_cards=core_cards,
            application_cards=application_cards,
            quarantine_card=quarantine_card,
            cards=cards,
            qbank_item=qbank_item,
            qbank_review=qbank_review,
            quarantine=accepted_quarantine,
            detected_quarantines=detected_quarantines,
            quarantine_result=quarantine_result,
            source_resolution=source_resolution,
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
