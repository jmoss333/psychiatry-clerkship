from copy import deepcopy
import html
import importlib.util
import json
from pathlib import Path
import sqlite3
from zipfile import ZipFile

import pytest

from anki.collection import Collection

from pcl_anki.contract import (
    APPLICATION_DECK_ID,
    APPLICATION_FIELDS,
    APPLICATION_MODEL_ID,
    APPLICATION_TEMPLATE_ID,
    CORE_BASIC_FIELDS,
    CORE_BASIC_MODEL_ID,
    CORE_BASIC_TEMPLATE_ID,
    CORE_CLOZE_FIELDS,
    CORE_CLOZE_MODEL_ID,
    CORE_CLOZE_TEMPLATE_ID,
    CORE_DECK_ID,
    canonical_json_sha256,
)
from pcl_anki.qbank import (
    LEGACY_QBANK_AFMT,
    LEGACY_QBANK_CSS,
    LEGACY_QBANK_MODEL,
    LEGACY_QBANK_QFMT,
    QbankValidationError,
    answer_html,
    build_deck,
    link_html,
    meta_html,
    qbank_item_sha256,
    render_options,
    tags_for,
)
import pcl_anki.render as render_module
from pcl_anki.render import (
    APPLICATION_AFMT,
    APPLICATION_MODEL,
    APPLICATION_QFMT,
    CORE_BASIC_AFMT,
    CORE_BASIC_MODEL,
    CORE_BASIC_QFMT,
    CORE_CLOZE_AFMT,
    CORE_CLOZE_MODEL,
    CORE_CLOZE_QFMT,
    TEMPLATE_CONTRACTS,
    TEMPLATE_CONTRACT_SHA256,
    V2_CSS,
    build_qbank_notes,
    card_approval_payload,
    render_card,
    rendered_note_approval_payload,
    tag_slug,
    to_genanki_note,
    validate_configured_template_contracts,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
RELEASE_CONFIG_PATH = (
    REPO_ROOT / "13_Faculty_Resources" / "anki" / "release_config.json"
)

EXPECTED_CORE_BASIC_QFMT = (
    '<main class="pcl-card pcl-front"><div class="pcl-prompt">{{Front}}</div></main>'
)
EXPECTED_CORE_BASIC_AFMT = """<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{Front}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  {{#Explanation}}<section class="pcl-explanation">{{Explanation}}</section>{{/Explanation}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>"""
EXPECTED_CORE_CLOZE_QFMT = (
    '<main class="pcl-card pcl-front"><div class="pcl-prompt">{{cloze:Text}}</div></main>'
)
EXPECTED_CORE_CLOZE_AFMT = """<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{cloze:Text}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  {{#Explanation}}<section class="pcl-explanation">{{Explanation}}</section>{{/Explanation}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>"""
EXPECTED_APPLICATION_QFMT = (
    '<main class="pcl-card pcl-front"><div class="pcl-prompt">{{Question}}</div></main>'
)
EXPECTED_APPLICATION_AFMT = """<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{Question}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  <section class="pcl-discriminator"><strong>Decisive clue:</strong> {{Discriminator}}</section>
  <section class="pcl-trap"><strong>Major trap:</strong> {{Trap}}</section>
  {{#Detail}}<details><summary>Why the alternatives fail</summary>{{Detail}}</details>{{/Detail}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>"""
EXPECTED_V2_CSS = """.card{box-sizing:border-box;margin:0;padding:24px;background:#fbf8f2;color:#202124;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:20px;line-height:1.5;text-align:left}
.pcl-card{max-width:760px;margin:0 auto}
.pcl-prompt{font-size:1.35rem;font-weight:650;line-height:1.4}
.pcl-question-again{color:#4b5563;font-size:.95rem}
#answer{margin:20px 0;border:0;border-top:1px solid #c8bda9}
.pcl-answer{font-size:1.2rem;font-weight:750}
.pcl-explanation,.pcl-discriminator,.pcl-trap,.pcl-caveat,details{margin-top:14px}
.pcl-caveat{border-left:4px solid #a25b00;padding:10px 12px;background:#fff3df}
.pcl-trap{border-left:4px solid #8f3b3b;padding-left:12px}
details{border-top:1px solid #ded6c8;padding-top:10px}
summary{cursor:pointer;font-weight:650}
blockquote{margin:10px 0;padding-left:12px;border-left:3px solid #b7aa95;color:#4b5563}
.pcl-meta{margin-top:18px;color:#6b7280;font-size:.78rem}
a{color:#795200}
.card.nightMode{background:#1f2328;color:#f1ede5}
.nightMode .pcl-question-again,.nightMode blockquote,.nightMode .pcl-meta{color:#c9c2b7}
.nightMode .pcl-caveat{background:#3a2b18;color:#f5e8d2}
@media(max-width:600px){.card{padding:16px;font-size:18px}.pcl-prompt{font-size:1.2rem}}"""


def make_core_card(kind="basic") -> dict:
    version_key = "coreCloze" if kind == "cloze" else "coreBasic"
    front = (
        "The decisive marker is {{c1::Finding <Alpha> & Beta}}."
        if kind == "cloze"
        else "What does Finding <Alpha> & Beta mean?"
    )
    return {
        "id": "ms3_w01_safety_001",
        "state": "approved",
        "kind": kind,
        "family": "Escalation",
        "audience": "MS3",
        "week": 1,
        "domain": "Safety",
        "task": "Recognize",
        "risk": {"level": "High", "facets": ["LocalPolicy", "Emergency"]},
        "front": front,
        "answer": "Notify the supervising clinician <now> & stay present.",
        "explanation": "Finding <Alpha> & Beta is the decisive marker.",
        "caveat": "Follow the local <policy> & supervision plan.",
        "source": {
            "path": "04_Acute_and_Safety/Safety_Planning.md",
            "slug": "safety-planning",
            "anchor": "immediate-escalation",
            "url": "https://une-ms3-psychiatry.netlify.app/?page=safety-planning#immediate-escalation",
            "quote": "Escalate <acute> & immediate concerns.",
            "quoteSha256": "a" * 64,
        },
        "render": {
            "templateVersion": TEMPLATE_CONTRACTS[version_key]["templateVersion"],
            "templateContractSha256": TEMPLATE_CONTRACT_SHA256[version_key],
        },
        "provenance": {"authoringMethod": "human", "authoringTool": None},
        "review": {"sequenceBasis": "weekly_map"},
        "reinforces": None,
        "supersedes": None,
    }


def make_application_card() -> dict:
    card = make_core_card()
    card.update(
        {
            "id": "ms3_w02_application_001",
            "kind": "application",
            "family": "ApplicationVignette",
            "week": 2,
            "domain": "Diagnosis",
            "task": "Discriminate",
            "front": "A patient has Finding <Alpha> & Beta. What is the diagnosis?",
            "answer": "Condition <Alpha> & Beta.",
            "explanation": "The timing & pattern are decisive.",
            "render": {
                "templateVersion": TEMPLATE_CONTRACTS["application"]["templateVersion"],
                "templateContractSha256": TEMPLATE_CONTRACT_SHA256["application"],
            },
            "qbank": {
                "id": "qb_neutral_001",
                "taskBundle": "Diagnosis",
                "primaryPage": "safety-planning",
                "primaryAnchor": "immediate-escalation",
                "approvedItemSha256": qbank_item_sha256(make_application_item()),
                "primaryTrap": "Anchoring on Café <beta>",
                "sourceAnchorSha256": "c" * 64,
            },
            "reinforces": "ms3_w01_safety_001",
        }
    )
    return card


def make_application_item() -> dict:
    return {
        "id": "qb_neutral_001",
        "status": "attested",
        "type": "sba",
        "category": "safety",
        "competency": ["dx"],
        "difficulty": 2,
        "hy": True,
        "pages": ["safety-planning"],
        "stem": "A neutral finding appears. What is the best explanation?",
        "options": [
            {"key": "A", "t": "Condition <Alpha> & Beta", "c": True},
            {
                "key": "B",
                "t": "Alternative <Beta> & Gamma",
                "trap": {
                    "name": "Anchoring on Café <beta>",
                    "note": "It misses the timing <clue> & pattern.",
                },
            },
            {
                "key": "C",
                "t": "Alternative Gamma",
                "trap": {
                    "name": "Availability bias",
                    "note": "It ignores the neutral discriminator.",
                },
            },
            {
                "key": "D",
                "t": "Alternative Delta",
                "trap": {
                    "name": "Premature closure",
                    "note": "It stops before checking the pattern.",
                },
            },
        ],
        "why": "The timing and pattern distinguish the neutral condition.",
        "pearl": "Use the decisive discriminator.",
        "evidence": "Neutral reviewed source passage.",
    }


def anki_backend_cloze_html(rendered, tmp_path: Path) -> tuple[str, str]:
    """Render the frozen cloze fields through the installed supported Anki backend."""

    collection = Collection(str(tmp_path / "cloze-render-parity.anki2"))
    try:
        notetype = collection.models.new("PCL cloze render parity probe")
        notetype["type"] = 1
        notetype["css"] = V2_CSS
        for name, _field_id in CORE_CLOZE_FIELDS:
            collection.models.add_field(notetype, collection.models.new_field(name))
        template = collection.models.new_template("Cloze")
        template["qfmt"] = CORE_CLOZE_QFMT
        template["afmt"] = CORE_CLOZE_AFMT
        collection.models.add_template(notetype, template)
        collection.models.add(notetype)

        note = collection.new_note(notetype)
        for (name, _field_id), value in zip(
            CORE_CLOZE_FIELDS, rendered.fields, strict=True
        ):
            note[name] = value
        collection.add_note(note, collection.decks.id("PCL render parity probe"))
        card = collection.get_card(collection.find_cards("")[0])
        output = card.render_output()
        return output.question_text, output.answer_text
    finally:
        collection.close()


def package_notes(path: Path, tmp_path: Path) -> dict[str, tuple[tuple[str, ...], tuple[str, ...]]]:
    database_path = tmp_path / (path.stem + ".anki2")
    with ZipFile(path) as archive:
        database_path.write_bytes(archive.read("collection.anki2"))
    with sqlite3.connect(database_path) as database:
        rows = database.execute("SELECT guid, flds, tags FROM notes").fetchall()
    return {
        guid: (tuple(fields.split("\x1f")), tuple(tags.split()))
        for guid, fields, tags in rows
    }


def test_exact_v2_template_bytes_and_explicit_id_contracts():
    assert CORE_BASIC_QFMT == EXPECTED_CORE_BASIC_QFMT
    assert CORE_BASIC_AFMT == EXPECTED_CORE_BASIC_AFMT
    assert CORE_CLOZE_QFMT == EXPECTED_CORE_CLOZE_QFMT
    assert CORE_CLOZE_AFMT == EXPECTED_CORE_CLOZE_AFMT
    assert APPLICATION_QFMT == EXPECTED_APPLICATION_QFMT
    assert APPLICATION_AFMT == EXPECTED_APPLICATION_AFMT
    assert V2_CSS == EXPECTED_V2_CSS

    assert [(field["name"], field["id"]) for field in CORE_BASIC_MODEL.fields] == list(
        CORE_BASIC_FIELDS
    )
    assert [(field["name"], field["id"]) for field in CORE_CLOZE_MODEL.fields] == list(
        CORE_CLOZE_FIELDS
    )
    assert [(field["name"], field["id"]) for field in APPLICATION_MODEL.fields] == list(
        APPLICATION_FIELDS
    )
    assert (CORE_BASIC_MODEL.model_id, CORE_BASIC_MODEL.templates[0]["id"]) == (
        CORE_BASIC_MODEL_ID,
        CORE_BASIC_TEMPLATE_ID,
    )
    assert (CORE_CLOZE_MODEL.model_id, CORE_CLOZE_MODEL.templates[0]["id"]) == (
        CORE_CLOZE_MODEL_ID,
        CORE_CLOZE_TEMPLATE_ID,
    )
    assert (APPLICATION_MODEL.model_id, APPLICATION_MODEL.templates[0]["id"]) == (
        APPLICATION_MODEL_ID,
        APPLICATION_TEMPLATE_ID,
    )
    assert CORE_BASIC_MODEL.templates[0]["name"] == "Card 1"
    assert CORE_CLOZE_MODEL.templates[0]["name"] == "Cloze"
    assert APPLICATION_MODEL.templates[0]["name"] == "Card 1"


def test_template_contract_hashes_are_canonical_configured_and_byte_sensitive():
    config = json.loads(RELEASE_CONFIG_PATH.read_text(encoding="utf-8"))

    assert validate_configured_template_contracts(config) == []
    assert config["templateContractSha256"] == TEMPLATE_CONTRACT_SHA256
    for key, contract in TEMPLATE_CONTRACTS.items():
        assert TEMPLATE_CONTRACT_SHA256[key] == canonical_json_sha256(contract)

    changed = deepcopy(TEMPLATE_CONTRACTS["coreBasic"])
    changed["qfmt"] += " "
    assert canonical_json_sha256(changed) != TEMPLATE_CONTRACT_SHA256["coreBasic"]


@pytest.mark.parametrize("value, expected", [("Café & Safety", "cafe_safety"), ("  A/B  ", "a_b")])
def test_tag_slug_contract(value, expected):
    assert tag_slug(value) == expected


def test_core_basic_render_is_nonempty_sorted_escaped_once_and_source_linked():
    card = make_core_card()
    rendered = render_card(card)

    assert rendered.namespace == "core"
    assert rendered.deck_id == CORE_DECK_ID
    assert rendered.model_id == CORE_BASIC_MODEL_ID
    assert rendered.front_html and rendered.back_html
    assert "&lt;Alpha&gt; &amp; Beta" in rendered.front_html
    assert "&amp;lt;Alpha&amp;gt;" not in rendered.front_html
    assert card["source"]["url"] in rendered.back_html
    assert rendered.tags == tuple(sorted(rendered.tags))
    assert rendered.tags == tuple(
        sorted(
            (
                "PsychClerkship",
                "Status::active",
                "Audience::MS3",
                "Deck::Core",
                "UID::ms3_w01_safety_001",
                "Week::W01",
                "Domain::safety",
                "Task::Recognize",
                "Family::Escalation",
                "Kind::basic",
                "Risk::High",
                "Facet::Emergency",
                "Facet::LocalPolicy",
            )
        )
    )


def test_cloze_render_and_genanki_note_schedule_exactly_one_card(tmp_path):
    rendered = render_card(make_core_card(kind="cloze"))
    note = to_genanki_note(rendered)

    backend_front, backend_back = anki_backend_cloze_html(rendered, tmp_path)

    assert rendered.model_id == CORE_CLOZE_MODEL_ID
    assert rendered.fields[1].count("{{c1::") == 1
    assert rendered.front_html == backend_front
    assert rendered.back_html == backend_back
    assert (
        '<span class="cloze" data-cloze="Finding&#x20;&amp;lt&#x3B;Alpha&amp;gt&#x3B;'
        '&#x20;&amp;amp&#x3B;&#x20;Beta" data-ordinal="1">[...]</span>'
        in rendered.front_html
    )
    assert (
        '<span class="cloze" data-ordinal="1">Finding &lt;Alpha&gt; &amp; Beta</span>'
        in rendered.back_html
    )
    assert len(note.cards) == 1

    payload = rendered_note_approval_payload(rendered, make_core_card(kind="cloze"))
    assert payload["front"] == backend_front
    assert payload["back"] == backend_back
    assert rendered.render_sha256 == canonical_json_sha256(payload)


@pytest.mark.parametrize(
    "cloze_text",
    [
        "{{c1::a/b-c_d.e,f:g!h?i::punctuation clue}}",
        "{{c1::Café α—beta & gamma::hint <one> & two}}",
    ],
)
def test_cloze_preview_matches_supported_anki_for_punctuation_and_unicode(
    tmp_path, cloze_text
):
    card = make_core_card(kind="cloze")
    card["front"] = f"The decisive marker is {cloze_text}."
    rendered = render_card(card)

    assert (rendered.front_html, rendered.back_html) == anki_backend_cloze_html(
        rendered, tmp_path
    )


def test_application_render_has_exact_active_tags_and_collapsed_secondary_detail():
    card = make_application_card()
    item = make_application_item()
    rendered = render_card(card, qbank_item=item)

    assert rendered.namespace == "application"
    assert rendered.deck_id == APPLICATION_DECK_ID
    assert rendered.model_id == APPLICATION_MODEL_ID
    assert rendered.fields[5]
    assert "Alternative &lt;Beta&gt; &amp; Gamma" in rendered.fields[5]
    assert "Anchoring on Café &lt;beta&gt;" in rendered.fields[5]
    assert "It misses the timing &lt;clue&gt; &amp; pattern." in rendered.fields[5]
    assert "Condition &lt;Alpha&gt; &amp; Beta" not in rendered.fields[5]
    assert "Why the alternatives fail" in rendered.back_html
    assert rendered.fields[5] in rendered.back_html
    assert "<strong>Decisive clue:</strong>" in rendered.back_html
    assert "<strong>Major trap:</strong>" in rendered.back_html
    assert "Anchoring on Café &lt;beta&gt;" in rendered.back_html
    assert "TaskBundle::Diagnosis" in rendered.tags
    assert "QBank::qb_neutral_001" in rendered.tags
    assert "Trap::anchoring_on_cafe_beta" in rendered.tags
    assert "Reinforces::ms3_w01_safety_001" in rendered.tags
    assert "Deck::Core" not in rendered.tags

    changed_item = deepcopy(item)
    changed_item["options"][1]["trap"]["note"] = "A changed governed explanation."
    with pytest.raises(ValueError, match="approvedItemSha256"):
        render_card(card, qbank_item=changed_item)
    changed_card = deepcopy(card)
    changed_card["qbank"]["approvedItemSha256"] = qbank_item_sha256(changed_item)
    changed_rendered = render_card(changed_card, qbank_item=changed_item)
    assert changed_rendered.fields[5] != rendered.fields[5]
    assert changed_rendered.back_html != rendered.back_html
    assert changed_rendered.render_sha256 != rendered.render_sha256

    with pytest.raises(ValueError, match="governed qbank item"):
        render_card(card)


def test_card_approval_hash_consumes_exact_display_sequence_and_relationship_payload():
    card = make_application_card()
    card["review"].update(
        {
            "sequenceBasis": "faculty_override",
            "sequenceRationale": "Named sequencing rationale.",
            "sequenceReviewedBy": "Named Faculty Reviewer",
            "sequenceReviewedAt": "2026-07-14",
        }
    )
    item = make_application_item()
    rendered = render_card(card, qbank_item=item)
    payload = card_approval_payload(
        card,
        rendered.front_html,
        rendered.back_html,
        rendered.tags,
        rendered.template_contract_sha256,
    )

    assert payload["front"] == rendered.front_html
    assert payload["back"] == rendered.back_html
    assert payload["tags"] == list(rendered.tags)
    assert payload["review"] == {
        "sequenceBasis": "faculty_override",
        "sequenceRationale": "Named sequencing rationale.",
        "sequenceReviewedBy": "Named Faculty Reviewer",
        "sequenceReviewedAt": "2026-07-14",
    }
    assert payload["reinforces"] == card["reinforces"]
    assert payload["supersedes"] is None
    assert payload["templateContractSha256"] == rendered.template_contract_sha256
    assert rendered.render_sha256 == canonical_json_sha256(payload)

    changed = deepcopy(card)
    changed["review"]["sequenceRationale"] = "Changed rationale."
    assert render_card(changed, qbank_item=item).render_sha256 != rendered.render_sha256


def test_weekly_map_sequence_payload_keeps_absent_override_fields_explicitly_null():
    rendered = render_card(make_core_card())
    payload = rendered_note_approval_payload(rendered, make_core_card())
    assert payload["review"] == {
        "sequenceBasis": "weekly_map",
        "sequenceRationale": None,
        "sequenceReviewedBy": None,
        "sequenceReviewedAt": None,
    }
    assert payload["reinforces"] is None
    assert payload["supersedes"] is None


def test_render_uses_the_single_shared_typed_contract_boundary():
    import pcl_anki.contract as contract

    assert hasattr(contract, "Namespace")
    assert hasattr(contract, "Identity")
    assert hasattr(contract, "RenderedNote")
    assert render_module.Namespace is contract.Namespace
    assert render_module.Identity is contract.Identity
    assert render_module.RenderedNote is contract.RenderedNote


def test_legacy_template_contract_uses_null_id_sentinels_and_rejects_added_ids():
    contract = TEMPLATE_CONTRACTS["legacyQbank"]
    assert contract["qfmt"] == LEGACY_QBANK_QFMT
    assert contract["afmt"] == LEGACY_QBANK_AFMT
    assert contract["css"] == LEGACY_QBANK_CSS
    assert contract["templateId"] is None
    assert all(field["id"] is None for field in contract["fields"])
    assert all("id" not in field for field in LEGACY_QBANK_MODEL.fields)
    assert "id" not in LEGACY_QBANK_MODEL.templates[0]

    changed = deepcopy(contract)
    changed["fields"][0]["id"] = 1
    assert canonical_json_sha256(changed) != TEMPLATE_CONTRACT_SHA256["legacyQbank"]


def test_qbank_base_and_tier2_have_separate_render_hashes_with_template_hash(qbank):
    item = next(item for item in qbank["items"] if item["id"] == "qb_pha_011")
    rendered = build_qbank_notes(item)

    assert [note.identity for note in rendered] == ["base", "tier2"]
    assert rendered[0].guid != rendered[1].guid
    assert rendered[0].render_sha256 != rendered[1].render_sha256
    assert rendered[1].fields[6] == html.escape(item["evidence"])
    assert item["link"]["label"] in rendered[1].fields[7]
    assert "Two-tier" in rendered[1].fields[8]
    assert "Tier 2 mechanism" in rendered[1].fields[8]
    assert html.escape(item["evidence"]) in rendered[1].back_html
    for note in rendered:
        payload = rendered_note_approval_payload(note)
        assert payload["templateContractSha256"] == TEMPLATE_CONTRACT_SHA256["legacyQbank"]
        assert note.render_sha256 == canonical_json_sha256(payload)
        assert note.front_html and note.back_html


@pytest.mark.parametrize(
    "mutate",
    [
        lambda item: (
            item["options"][0].__setitem__("c", True),
            item["options"][1].__setitem__("c", True),
        ),
        lambda item: (
            item["tier2"]["options"][0].__setitem__("c", True),
            item["tier2"]["options"][1].__setitem__("c", True),
        ),
        lambda item: item["options"][0].pop("t"),
        lambda item: item["tier2"].pop("q"),
        lambda item: item["tier2"].pop("why"),
        lambda item: item["options"][0]["trap"].__setitem__("note", ""),
    ],
)
def test_malformed_qbank_base_or_tier2_never_reaches_rendering(qbank, mutate):
    item = deepcopy(
        next(item for item in qbank["items"] if item["id"] == "qb_pha_011")
    )
    mutate(item)

    with pytest.raises(QbankValidationError):
        build_qbank_notes(item)


def test_refactored_legacy_helpers_are_the_exporter_compatibility_surface():
    exporter_path = (
        REPO_ROOT
        / "13_Faculty_Resources"
        / "_automation"
        / "site_build"
        / "export_anki.py"
    )
    spec = importlib.util.spec_from_file_location("legacy_exporter", exporter_path)
    exporter = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(exporter)

    assert exporter.render_options is render_options
    assert exporter.answer_html is answer_html
    assert exporter.meta_html is meta_html
    assert exporter.link_html is link_html
    assert exporter.tags_for is tags_for
    assert exporter.build_deck is build_deck


def test_regenerated_legacy_qbank_fields_guids_and_tags_match_independent_fixture(
    qbank, legacy_qbank_path, tmp_path
):
    expected = package_notes(legacy_qbank_path, tmp_path)
    deck, selected, note_count = build_deck(qbank["items"])
    generated_path = tmp_path / "generated.apkg"

    import genanki

    genanki.Package(deck).write_to_file(generated_path, timestamp=0)
    actual = package_notes(generated_path, tmp_path)

    assert len(selected) == 143
    assert note_count == 168
    assert actual.keys() == expected.keys()
    assert {
        guid: (fields, tuple(sorted(tags))) for guid, (fields, tags) in actual.items()
    } == {
        guid: (fields, tuple(sorted(tags))) for guid, (fields, tags) in expected.items()
    }


@pytest.fixture
def qbank():
    return json.loads((REPO_ROOT / "question_bank.json").read_text(encoding="utf-8"))
