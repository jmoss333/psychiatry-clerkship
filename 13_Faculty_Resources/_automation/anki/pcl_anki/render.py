"""Byte-frozen active Anki renderers and exact faculty-review hash payloads."""

from __future__ import annotations

from copy import deepcopy
import html
import json
from pathlib import Path
import re
from typing import Mapping
import unicodedata

import genanki

from pcl_anki.contract import (
    APPLICATION_DECK_ID,
    APPLICATION_DECK_NAME,
    APPLICATION_FIELDS,
    APPLICATION_MODEL_ID,
    APPLICATION_MODEL_NAME,
    APPLICATION_TEMPLATE_ID,
    APPLICATION_TEMPLATE_NAME,
    APPLICATION_TEMPLATE_ORDINAL,
    CORE_BASIC_FIELDS,
    CORE_BASIC_MODEL_ID,
    CORE_BASIC_MODEL_NAME,
    CORE_BASIC_TEMPLATE_ID,
    CORE_BASIC_TEMPLATE_NAME,
    CORE_BASIC_TEMPLATE_ORDINAL,
    CORE_CLOZE_FIELDS,
    CORE_CLOZE_MODEL_ID,
    CORE_CLOZE_MODEL_NAME,
    CORE_CLOZE_TEMPLATE_ID,
    CORE_CLOZE_TEMPLATE_NAME,
    CORE_CLOZE_TEMPLATE_ORDINAL,
    CORE_DECK_ID,
    CORE_DECK_NAME,
    Identity,
    Issue,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    LEGACY_QBANK_TEMPLATE_NAME,
    LEGACY_QBANK_TEMPLATE_ORDINAL,
    Namespace,
    RenderedNote,
    application_guid,
    canonical_json_sha256,
    core_guid,
)
from pcl_anki.qbank import (
    LEGACY_QBANK_AFMT,
    LEGACY_QBANK_CSS,
    LEGACY_QBANK_MODEL,
    LEGACY_QBANK_QFMT,
    build_note as build_legacy_qbank_note,
    esc as legacy_escape,
    link_html as legacy_link_html,
    meta_html as legacy_meta_html,
    QbankValidationError,
    qbank_item_payload,
    qbank_item_sha256,
    validate_qbank_item_schema,
    validate_qbank_render_structure,
)
from pcl_anki.sources import sequence_review_payload


CORE_BASIC_QFMT = (
    '<main class="pcl-card pcl-front"><div class="pcl-prompt">{{Front}}</div></main>'
)
CORE_BASIC_AFMT = """<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{Front}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  {{#Explanation}}<section class="pcl-explanation">{{Explanation}}</section>{{/Explanation}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>"""
CORE_CLOZE_QFMT = (
    '<main class="pcl-card pcl-front"><div class="pcl-prompt">{{cloze:Text}}</div></main>'
)
CORE_CLOZE_AFMT = """<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{cloze:Text}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  {{#Explanation}}<section class="pcl-explanation">{{Explanation}}</section>{{/Explanation}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>"""
APPLICATION_QFMT = (
    '<main class="pcl-card pcl-front"><div class="pcl-prompt">{{Question}}</div></main>'
)
APPLICATION_AFMT = """<main class="pcl-card pcl-back">
  <div class="pcl-question-again">{{Question}}</div><hr id="answer">
  <section class="pcl-answer">{{Answer}}</section>
  <section class="pcl-discriminator"><strong>Decisive clue:</strong> {{Discriminator}}</section>
  <section class="pcl-trap"><strong>Major trap:</strong> {{Trap}}</section>
  {{#Detail}}<details><summary>Why the alternatives fail</summary>{{Detail}}</details>{{/Detail}}
  {{#Caveat}}<aside class="pcl-caveat">{{Caveat}}</aside>{{/Caveat}}
  <details class="pcl-source"><summary>Reviewed source</summary><blockquote>{{SourceQuote}}</blockquote>{{SourceLink}}</details>
  <footer class="pcl-meta">{{Meta}}</footer>
</main>"""
V2_CSS = """.card{box-sizing:border-box;margin:0;padding:24px;background:#fbf8f2;color:#202124;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:20px;line-height:1.5;text-align:left}
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


CORE_BASIC_MODEL = genanki.Model(
    CORE_BASIC_MODEL_ID,
    CORE_BASIC_MODEL_NAME,
    fields=[{"name": name, "id": field_id} for name, field_id in CORE_BASIC_FIELDS],
    templates=[
        {
            "name": CORE_BASIC_TEMPLATE_NAME,
            "id": CORE_BASIC_TEMPLATE_ID,
            "qfmt": CORE_BASIC_QFMT,
            "afmt": CORE_BASIC_AFMT,
        }
    ],
    css=V2_CSS,
)
CORE_CLOZE_MODEL = genanki.Model(
    CORE_CLOZE_MODEL_ID,
    CORE_CLOZE_MODEL_NAME,
    fields=[{"name": name, "id": field_id} for name, field_id in CORE_CLOZE_FIELDS],
    templates=[
        {
            "name": CORE_CLOZE_TEMPLATE_NAME,
            "id": CORE_CLOZE_TEMPLATE_ID,
            "qfmt": CORE_CLOZE_QFMT,
            "afmt": CORE_CLOZE_AFMT,
        }
    ],
    css=V2_CSS,
    model_type=genanki.Model.CLOZE,
)
APPLICATION_MODEL = genanki.Model(
    APPLICATION_MODEL_ID,
    APPLICATION_MODEL_NAME,
    fields=[{"name": name, "id": field_id} for name, field_id in APPLICATION_FIELDS],
    templates=[
        {
            "name": APPLICATION_TEMPLATE_NAME,
            "id": APPLICATION_TEMPLATE_ID,
            "qfmt": APPLICATION_QFMT,
            "afmt": APPLICATION_AFMT,
        }
    ],
    css=V2_CSS,
)


def _field_contract(fields) -> list[dict[str, object]]:
    return [{"name": name, "id": field_id} for name, field_id in fields]


def _template_contract(
    *,
    model_id: int,
    model_name: str,
    deck_id: int,
    deck_name: str,
    fields,
    template_id: int | None,
    template_name: str,
    template_ordinal: int,
    qfmt: str,
    afmt: str,
    css: str,
    template_version: str,
) -> dict[str, object]:
    return {
        "modelId": model_id,
        "modelName": model_name,
        "deckId": deck_id,
        "deckName": deck_name,
        "fields": _field_contract(fields),
        "templateId": template_id,
        "templateName": template_name,
        "templateOrdinal": template_ordinal,
        "qfmt": qfmt,
        "afmt": afmt,
        "css": css,
        "templateVersion": template_version,
    }


TEMPLATE_CONTRACTS = {
    "coreBasic": _template_contract(
        model_id=CORE_BASIC_MODEL_ID,
        model_name=CORE_BASIC_MODEL_NAME,
        deck_id=CORE_DECK_ID,
        deck_name=CORE_DECK_NAME,
        fields=CORE_BASIC_FIELDS,
        template_id=CORE_BASIC_TEMPLATE_ID,
        template_name=CORE_BASIC_TEMPLATE_NAME,
        template_ordinal=CORE_BASIC_TEMPLATE_ORDINAL,
        qfmt=CORE_BASIC_QFMT,
        afmt=CORE_BASIC_AFMT,
        css=V2_CSS,
        template_version="pcl-ms3-core-basic-v2",
    ),
    "coreCloze": _template_contract(
        model_id=CORE_CLOZE_MODEL_ID,
        model_name=CORE_CLOZE_MODEL_NAME,
        deck_id=CORE_DECK_ID,
        deck_name=CORE_DECK_NAME,
        fields=CORE_CLOZE_FIELDS,
        template_id=CORE_CLOZE_TEMPLATE_ID,
        template_name=CORE_CLOZE_TEMPLATE_NAME,
        template_ordinal=CORE_CLOZE_TEMPLATE_ORDINAL,
        qfmt=CORE_CLOZE_QFMT,
        afmt=CORE_CLOZE_AFMT,
        css=V2_CSS,
        template_version="pcl-ms3-core-cloze-v2",
    ),
    "application": _template_contract(
        model_id=APPLICATION_MODEL_ID,
        model_name=APPLICATION_MODEL_NAME,
        deck_id=APPLICATION_DECK_ID,
        deck_name=APPLICATION_DECK_NAME,
        fields=APPLICATION_FIELDS,
        template_id=APPLICATION_TEMPLATE_ID,
        template_name=APPLICATION_TEMPLATE_NAME,
        template_ordinal=APPLICATION_TEMPLATE_ORDINAL,
        qfmt=APPLICATION_QFMT,
        afmt=APPLICATION_AFMT,
        css=V2_CSS,
        template_version="pcl-ms3-application-v2",
    ),
    "legacyQbank": _template_contract(
        model_id=LEGACY_QBANK_MODEL_ID,
        model_name=LEGACY_QBANK_MODEL_NAME,
        deck_id=LEGACY_QBANK_DECK_ID,
        deck_name=LEGACY_QBANK_DECK_NAME,
        fields=tuple((name, None) for name in LEGACY_QBANK_FIELDS),
        template_id=None,
        template_name=LEGACY_QBANK_TEMPLATE_NAME,
        template_ordinal=LEGACY_QBANK_TEMPLATE_ORDINAL,
        qfmt=LEGACY_QBANK_QFMT,
        afmt=LEGACY_QBANK_AFMT,
        css=LEGACY_QBANK_CSS,
        template_version="pcl-qbank-legacy-v1",
    ),
}
TEMPLATE_CONTRACT_SHA256 = {
    name: canonical_json_sha256(contract) for name, contract in TEMPLATE_CONTRACTS.items()
}


def validate_configured_template_contracts(config: Mapping) -> list[Issue]:
    """Compare mechanical configured hashes with byte-exact runtime recomputation."""

    configured = config.get("templateContractSha256")
    if not isinstance(configured, Mapping):
        return [
            Issue(
                code="TEMPLATE_CONTRACT_HASHES_MISSING",
                severity="hard",
                subject="release_config.templateContractSha256",
                message="all four mechanical template-contract hashes are required",
            )
        ]
    issues = []
    if set(configured) != set(TEMPLATE_CONTRACT_SHA256):
        issues.append(
            Issue(
                code="TEMPLATE_CONTRACT_HASH_KEYS",
                severity="hard",
                subject="release_config.templateContractSha256",
                message="configured template-contract hash keys do not match active models",
            )
        )
    for name, expected in TEMPLATE_CONTRACT_SHA256.items():
        if configured.get(name) != expected:
            issues.append(
                Issue(
                    code="TEMPLATE_CONTRACT_HASH_DRIFT",
                    severity="hard",
                    subject=f"release_config.templateContractSha256.{name}",
                    message=f"expected runtime hash {expected}",
                )
            )
    return issues


def tag_slug(value: object) -> str:
    """Return the frozen NFKD ASCII underscore tag projection."""

    decomposed = unicodedata.normalize("NFKD", str(value))
    ascii_value = decomposed.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "_", ascii_value).strip("_")


def _source_link(source: Mapping) -> str:
    url = html.escape(str(source.get("url", "")), quote=True)
    return f'<a href="{url}">Open reviewed source</a>'


def _meta(card: Mapping) -> str:
    return " · ".join(
        (
            html.escape(str(card["id"])),
            f"W{int(card['week']):02d}",
            html.escape(str(card["domain"])),
            html.escape(str(card["task"])),
        )
    )


def _active_tags(card: Mapping) -> tuple[str, ...]:
    kind = str(card["kind"])
    deck = "Application" if kind == "application" else "Core"
    tags = {
        "PsychClerkship",
        "Status::active",
        "Audience::MS3",
        f"Deck::{deck}",
        f"UID::{card['id']}",
        f"Week::W{int(card['week']):02d}",
        f"Domain::{tag_slug(card['domain'])}",
        f"Task::{card['task']}",
        f"Family::{card['family']}",
        f"Kind::{kind}",
        f"Risk::{card['risk']['level']}",
    }
    for facet in sorted(card["risk"].get("facets", [])):
        tags.add(f"Facet::{facet}")
    if kind == "application":
        qbank = card["qbank"]
        tags.update(
            {
                f"TaskBundle::{qbank['taskBundle']}",
                f"QBank::{qbank['id']}",
                f"Trap::{tag_slug(qbank['primaryTrap'])}",
                f"Reinforces::{card['reinforces']}",
            }
        )
    return tuple(sorted(tags))


def _anki_cloze_data_attribute(answer: str) -> str:
    """Mirror Anki's cloze-answer encoding for its front-side data attribute."""

    encoded = []
    for character in answer:
        if character.isascii() and character.isalnum():
            encoded.append(character)
        elif character == "&":
            encoded.append("&amp;")
        elif ord(character) <= 0xFF:
            encoded.append(f"&#x{ord(character):02X};")
        else:
            encoded.append(character)
    return "".join(encoded)


def _normalize_display_text(text: str) -> str:
    """NFC-normalize display text and reject controls Anki may rewrite silently."""

    normalized = unicodedata.normalize("NFC", text)
    unsupported = [
        character
        for character in normalized
        if unicodedata.category(character) == "Cc" and character != "\n"
    ]
    if unsupported:
        raise ValueError("cloze text contains an unsupported control character")
    return normalized


def _escape_display_text(value: object) -> str:
    """Normalize learner-provided text before escaping it exactly once."""

    return html.escape(_normalize_display_text(str(value)))


def _cloze_display(text: str, *, front: bool) -> str:
    pattern = re.compile(r"\{\{c1::(.*?)(?:::(.*?))?\}\}", re.DOTALL)

    def replace(match: re.Match) -> str:
        answer, hint = match.group(1), match.group(2)
        if front:
            display = f"[{hint}]" if hint else "[...]"
            return (
                '<span class="cloze" data-cloze="'
                + _anki_cloze_data_attribute(answer)
                + '" data-ordinal="1">'
                + display
                + "</span>"
            )
        return f'<span class="cloze" data-ordinal="1">{answer}</span>'

    return pattern.sub(replace, text)


def _render_template(
    template: str, fields: Mapping[str, str], *, cloze_front: bool | None = None
) -> str:
    rendered = template
    for name, value in fields.items():
        conditional = re.compile(
            rf"\{{\{{#{re.escape(name)}\}}\}}(.*?)\{{\{{/{re.escape(name)}\}}\}}",
            re.DOTALL,
        )
        rendered = conditional.sub(lambda match: match.group(1) if value else "", rendered)
    if cloze_front is not None:
        rendered = rendered.replace(
            "{{cloze:Text}}", _cloze_display(fields["Text"], front=cloze_front)
        )
    for name, value in fields.items():
        rendered = rendered.replace("{{" + name + "}}", value)
    return rendered


def card_approval_payload(
    card: Mapping,
    front_html: str,
    back_html: str,
    tags,
    template_contract_sha256: str,
) -> dict[str, object]:
    """Return the exact displayed-card payload that faculty approves."""

    sequence = {
        "sequenceBasis": None,
        "sequenceRationale": None,
        "sequenceReviewedBy": None,
        "sequenceReviewedAt": None,
    }
    sequence.update(sequence_review_payload(card.get("review")))
    return {
        "front": front_html,
        "back": back_html,
        "tags": list(sorted(tags)),
        "id": card["id"],
        "kind": card["kind"],
        "family": card["family"],
        "week": card["week"],
        "domain": card["domain"],
        "task": card["task"],
        "risk": deepcopy(card["risk"]),
        "source": deepcopy(card["source"]),
        "qbank": deepcopy(card.get("qbank")),
        "review": sequence,
        "reinforces": card.get("reinforces"),
        "supersedes": card.get("supersedes"),
        "templateVersion": card["render"]["templateVersion"],
        "templateContractSha256": template_contract_sha256,
    }


def _card_rendered_note(
    card: Mapping,
    *,
    namespace: Namespace,
    model_id: int,
    deck_id: int,
    fields: tuple[str, ...],
    front_html: str,
    back_html: str,
    contract_key: str,
) -> RenderedNote:
    expected_hash = TEMPLATE_CONTRACT_SHA256[contract_key]
    render_contract = card.get("render") if isinstance(card.get("render"), Mapping) else {}
    if render_contract.get("templateVersion") != TEMPLATE_CONTRACTS[contract_key][
        "templateVersion"
    ]:
        raise ValueError(f"template version drift for {card.get('id')}")
    if render_contract.get("templateContractSha256") != expected_hash:
        raise ValueError(f"template contract hash drift for {card.get('id')}")
    tags = _active_tags(card)
    payload = card_approval_payload(card, front_html, back_html, tags, expected_hash)
    return RenderedNote(
        namespace=namespace,
        uid=str(card["id"]),
        identity="base",
        guid=application_guid(str(card["id"]))
        if namespace == "application"
        else core_guid(str(card["id"])),
        deck_id=deck_id,
        model_id=model_id,
        template_ordinal=0,
        fields=fields,
        tags=tags,
        front_html=front_html,
        back_html=back_html,
        template_contract_sha256=expected_hash,
        render_sha256=canonical_json_sha256(payload),
        active=card.get("state") == "approved",
        withdrawn=False,
    )


def build_core_note(card: Mapping) -> RenderedNote:
    """Build one Basic/Cloze Core note from the fixed v2 contract."""

    kind = card.get("kind")
    if kind not in {"basic", "cloze"}:
        raise ValueError("build_core_note requires kind basic or cloze")
    source = card["source"]
    shared = {
        "UID": html.escape(str(card["id"])),
        "Answer": _escape_display_text(card["answer"]),
        "Explanation": _escape_display_text(card["explanation"]),
        "Caveat": _escape_display_text(card.get("caveat", "")),
        "SourceQuote": _escape_display_text(source["quote"]),
        "SourceLink": _source_link(source),
        "Meta": _meta(card),
    }
    if kind == "basic":
        field_map = {"Front": _escape_display_text(card["front"]), **shared}
        fields = tuple(field_map[name] for name, _field_id in CORE_BASIC_FIELDS)
        return _card_rendered_note(
            card,
            namespace="core",
            model_id=CORE_BASIC_MODEL_ID,
            deck_id=CORE_DECK_ID,
            fields=fields,
            front_html=_render_template(CORE_BASIC_QFMT, field_map),
            back_html=_render_template(CORE_BASIC_AFMT, field_map),
            contract_key="coreBasic",
        )
    field_map = {
        "Text": _escape_display_text(card["front"]),
        **shared,
    }
    fields = tuple(field_map[name] for name, _field_id in CORE_CLOZE_FIELDS)
    return _card_rendered_note(
        card,
        namespace="core",
        model_id=CORE_CLOZE_MODEL_ID,
        deck_id=CORE_DECK_ID,
        fields=fields,
        front_html=_render_template(CORE_CLOZE_QFMT, field_map, cloze_front=True),
        back_html=_render_template(CORE_CLOZE_AFMT, field_map, cloze_front=False),
        contract_key="coreCloze",
    )


def _application_detail(card: Mapping, qbank_item: Mapping) -> str:
    """Render escaped incorrect-option explanations from the governed item projection."""

    issues = validate_qbank_render_structure(qbank_item)
    if issues:
        raise QbankValidationError(issues)
    qbank = card.get("qbank") if isinstance(card.get("qbank"), Mapping) else {}
    if qbank.get("id") != qbank_item.get("id"):
        raise ValueError("Application qbank.id must match the governed qbank item")
    if qbank.get("approvedItemSha256") != qbank_item_sha256(qbank_item):
        raise ValueError("Application approvedItemSha256 must match the governed qbank item")

    projected = qbank_item_payload(qbank_item)
    distractors = []
    for option in projected["options"]:
        if option.get("c") is True:
            continue
        trap = option["trap"]
        distractors.append(
            "<li><strong>"
            + html.escape(str(option["key"]))
            + ". "
            + html.escape(str(option["t"]))
            + "</strong><br>"
            + html.escape(str(trap["name"]))
            + ": "
            + html.escape(str(trap["note"]))
            + "</li>"
        )
    if not distractors:
        raise ValueError("Application qbank item must contain incorrect alternatives")
    return '<ul class="pcl-distractors">' + "".join(distractors) + "</ul>"


def build_application_note(card: Mapping, qbank_item: Mapping) -> RenderedNote:
    """Build one Application note from the fixed v2 contract."""

    if card.get("kind") != "application":
        raise ValueError("build_application_note requires kind application")
    source = card["source"]
    field_map = {
        "UID": html.escape(str(card["id"])),
        "Question": html.escape(str(card["front"])),
        "Answer": html.escape(str(card["answer"])),
        "Discriminator": html.escape(str(card["explanation"])),
        "Trap": html.escape(str(card["qbank"]["primaryTrap"])),
        "Detail": _application_detail(card, qbank_item),
        "Caveat": html.escape(str(card.get("caveat", ""))),
        "SourceQuote": html.escape(str(source["quote"])),
        "SourceLink": _source_link(source),
        "Meta": _meta(card),
    }
    fields = tuple(field_map[name] for name, _field_id in APPLICATION_FIELDS)
    return _card_rendered_note(
        card,
        namespace="application",
        model_id=APPLICATION_MODEL_ID,
        deck_id=APPLICATION_DECK_ID,
        fields=fields,
        front_html=_render_template(APPLICATION_QFMT, field_map),
        back_html=_render_template(APPLICATION_AFMT, field_map),
        contract_key="application",
    )


def render_card(card: Mapping, *, qbank_item: Mapping | None = None) -> RenderedNote:
    """Single active Core/Application rendering path used by review and packaging."""

    if card.get("kind") == "application" and qbank_item is None:
        raise ValueError("Application rendering requires the governed qbank item")
    return (
        build_application_note(card, qbank_item)
        if card.get("kind") == "application"
        else build_core_note(card)
    )


def _legacy_html(fields: tuple[str, ...], *, back: bool) -> str:
    field_map = dict(zip(LEGACY_QBANK_FIELDS, fields, strict=True))
    return _render_template(
        LEGACY_QBANK_AFMT if back else LEGACY_QBANK_QFMT,
        field_map,
    )


def _qbank_payload_values(note: RenderedNote) -> dict[str, object]:
    return {
        "front": note.front_html,
        "back": note.back_html,
        "tags": list(note.tags),
        "id": note.uid,
        "identity": note.identity,
        "templateVersion": TEMPLATE_CONTRACTS["legacyQbank"]["templateVersion"],
        "templateContractSha256": note.template_contract_sha256,
    }


def build_qbank_notes(
    item: Mapping, question_bank_schema: Mapping | None = None
) -> tuple[RenderedNote, ...]:
    """Build separately governed base/Tier-2 notes with frozen legacy identities."""

    if question_bank_schema is None:
        schema_path = Path(__file__).resolve().parents[4] / "question_bank.schema.json"
        question_bank_schema = json.loads(schema_path.read_text(encoding="utf-8"))
    structural_issues = [
        *validate_qbank_item_schema(item, question_bank_schema),
        *validate_qbank_render_structure(item),
    ]
    if structural_issues:
        raise QbankValidationError(structural_issues)
    built = []
    for index, note in enumerate(build_legacy_qbank_note(item)):
        identity: Identity = "tier2" if index else "base"
        governed_fields = list(note.fields)
        if identity == "tier2":
            governed_fields[5] = legacy_escape(item.get("pearl", ""))
            governed_fields[6] = legacy_escape(item.get("evidence", ""))
            governed_fields[7] = legacy_link_html(item)
            governed_fields[8] = (
                legacy_meta_html(item)
                + '<div style="margin-top:10px">'
                + '<span class="tag">Two-tier</span>'
                + '<span class="tag">Tier 2 mechanism</span></div>'
            )
        fields = tuple(governed_fields)
        tags = tuple(sorted(note.tags))
        placeholder = RenderedNote(
            namespace="qbank",
            uid=str(item["id"]),
            identity=identity,
            guid=note.guid,
            deck_id=LEGACY_QBANK_DECK_ID,
            model_id=LEGACY_QBANK_MODEL_ID,
            template_ordinal=LEGACY_QBANK_TEMPLATE_ORDINAL,
            fields=fields,
            tags=tags,
            front_html=_legacy_html(fields, back=False),
            back_html=_legacy_html(fields, back=True),
            template_contract_sha256=TEMPLATE_CONTRACT_SHA256["legacyQbank"],
            render_sha256="",
            active=item.get("status") == "attested" and item.get("retired") is not True,
            withdrawn=False,
        )
        built.append(
            RenderedNote(
                **{
                    **placeholder.__dict__,
                    "render_sha256": canonical_json_sha256(
                        _qbank_payload_values(placeholder)
                    ),
                }
            )
        )
    return tuple(built)


def rendered_note_approval_payload(
    note: RenderedNote, card: Mapping | None = None
) -> dict[str, object]:
    """Return the exact hash projection for a rendered active note."""

    if note.namespace == "qbank":
        return _qbank_payload_values(note)
    if card is None:
        raise ValueError("Core/Application approval payload requires its card record")
    return card_approval_payload(
        card,
        note.front_html,
        note.back_html,
        note.tags,
        note.template_contract_sha256,
    )


def to_genanki_note(note: RenderedNote) -> genanki.Note:
    """Materialize one already-rendered note without defining another render path."""

    models = {
        CORE_BASIC_MODEL_ID: CORE_BASIC_MODEL,
        CORE_CLOZE_MODEL_ID: CORE_CLOZE_MODEL,
        APPLICATION_MODEL_ID: APPLICATION_MODEL,
        LEGACY_QBANK_MODEL_ID: LEGACY_QBANK_MODEL,
    }
    try:
        model = models[note.model_id]
    except KeyError as error:
        raise ValueError(f"unknown rendered model ID {note.model_id}") from error
    return genanki.Note(
        model=model,
        fields=list(note.fields),
        tags=list(note.tags),
        guid=note.guid,
    )
