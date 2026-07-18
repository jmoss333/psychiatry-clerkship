"""Frozen question-bank projections, validation, and legacy rendering primitives."""

from __future__ import annotations

import html
from pathlib import Path
import re
from typing import Mapping, Protocol

import genanki
from jsonschema import Draft7Validator, FormatChecker

from pcl_anki.contract import (
    Issue,
    LEGACY_QBANK_DECK_ID,
    LEGACY_QBANK_DECK_NAME,
    LEGACY_QBANK_FIELDS,
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    LEGACY_QBANK_TEMPLATE_NAME,
    LEGACY_QBANK_TEMPLATE_ORDINAL,
    ManifestIndex,
    SourceResolution,
    canonical_json_sha256,
    legacy_qbank_guid,
)
from pcl_anki.sources import SourceResolutionError, resolve_source


QB_HASH_FIELDS = (
    "id",
    "status",
    "retired",
    "stem",
    "options",
    "why",
    "pearl",
    "evidence",
    "pages",
    "link",
    "tier2",
    "category",
    "difficulty",
    "competency",
    "type",
    "hy",
)


CATEGORY_LABELS = {
    "substance": "Substance & Withdrawal",
    "relational": "Relational & Family",
    "neurocog": "Neurocognitive",
    "mood": "Mood",
    "psychosis": "Psychosis",
    "anxiety": "Anxiety",
    "pharm": "Psychopharmacology",
    "safety": "Acute & Safety",
    "personality": "Personality",
    "childdev": "Child & Development",
    "otherdx": "Other Diagnoses",
    "ethics": "Ethics & Legal",
}


LEGACY_QBANK_CSS = """
.card { font-family: -apple-system, Segoe UI, Roboto, sans-serif;
        font-size: 17px; line-height: 1.5; color: #1a1a1a;
        background: #fbf7f0; text-align: left; padding: 14px 18px; }
.stem { margin-bottom: 12px; }
.opts { margin: 0 0 6px 0; padding: 0; list-style: none; }
.opts li { margin: 4px 0; }
.answer { font-weight: 700; color: #1f6f54; }
.tag { display:inline-block; font-size:12px; font-weight:600; color:#8a5a1a;
       background:#f2e6d2; border-radius:4px; padding:1px 7px; margin:2px 4px 2px 0; }
.trap { color:#8a2b2b; }
.trap b { color:#8a2b2b; }
.why { margin-top:10px; }
.pearl { margin-top:10px; padding:8px 12px; background:#eaf3ee;
         border-left:3px solid #1f6f54; border-radius:4px; }
.evidence { margin-top:10px; font-size:14px; color:#555; }
.link { margin-top:10px; font-size:14px; }
.draft { color:#8a2b2b; font-weight:700; }
hr { border:none; border-top:1px solid #d9cdb8; margin:12px 0; }
"""
LEGACY_QBANK_QFMT = '<div class="stem">{{Question}}</div>{{Options}}'
LEGACY_QBANK_AFMT = (
    '<div class="stem">{{Question}}</div>{{Options}}'
    '<hr id="answer">'
    '{{Answer}}'
    '{{#Why}}<div class="why">{{Why}}</div>{{/Why}}'
    '{{#Pearl}}<div class="pearl">💡 {{Pearl}}</div>{{/Pearl}}'
    '{{#Evidence}}<div class="evidence">📄 {{Evidence}}</div>{{/Evidence}}'
    '{{#Link}}<div class="link">🔗 {{Link}}</div>{{/Link}}'
    '{{#Meta}}<div>{{Meta}}</div>{{/Meta}}'
)


LEGACY_QBANK_MODEL = genanki.Model(
    LEGACY_QBANK_MODEL_ID,
    LEGACY_QBANK_MODEL_NAME,
    fields=[{"name": name} for name in LEGACY_QBANK_FIELDS],
    templates=[
        {
            "name": LEGACY_QBANK_TEMPLATE_NAME,
            "qfmt": LEGACY_QBANK_QFMT,
            "afmt": LEGACY_QBANK_AFMT,
        }
    ],
    css=LEGACY_QBANK_CSS,
)


class QbankSourceInputs(Protocol):
    repo_root: Path
    manifest: ManifestIndex
    reviewed: Mapping
    surveillance: Mapping


class QbankValidationError(ValueError):
    """Raised when malformed qbank data is about to enter rendering."""

    def __init__(self, issues: list[Issue]):
        self.issues = tuple(issues)
        super().__init__("; ".join(f"{issue.code}: {issue.subject}" for issue in issues))


def qbank_item_payload(item: Mapping) -> dict:
    """Project the exact ordered learner-visible qbank governance fields."""

    return {field: item.get(field) for field in QB_HASH_FIELDS}


def qbank_item_sha256(item: Mapping) -> str:
    """Hash the governed qbank projection using canonical JSON."""

    return canonical_json_sha256(qbank_item_payload(item))


def _subject(item: Mapping, field: str) -> str:
    return f"{item.get('id', '<missing-id>')}.{field}"


def _issue(item: Mapping, code: str, field: str, message: str) -> Issue:
    return Issue(code=code, severity="hard", subject=_subject(item, field), message=message)


def _schema_item(question_bank_schema: Mapping) -> Mapping:
    try:
        return question_bank_schema["properties"]["items"]["items"]
    except (KeyError, TypeError) as error:
        raise ValueError("question_bank_schema does not contain an item schema") from error


def _schema_subject(item: Mapping, path) -> str:
    suffix = "".join(f"[{part}]" if isinstance(part, int) else f".{part}" for part in path)
    return f"{item.get('id', '<missing-id>')}{suffix}"


def validate_qbank_item_schema(
    item: Mapping, question_bank_schema: Mapping
) -> list[Issue]:
    """Validate one item against the canonical root schema's item contract."""

    validator = Draft7Validator(
        _schema_item(question_bank_schema), format_checker=FormatChecker()
    )
    return [
        Issue(
            code=error.schema.get("x-issue-code", "QBANK_SCHEMA_INVALID"),
            severity="hard",
            subject=_schema_subject(item, error.absolute_path),
            message=error.message,
        )
        for error in sorted(
            validator.iter_errors(item), key=lambda value: list(value.path)
        )
    ]


def _option_key_issues(item: Mapping, options: object, *, tier2: bool) -> list[Issue]:
    field = "tier2.options" if tier2 else "options"
    code = "QBANK_TIER2_OPTION_KEYS" if tier2 else "QBANK_OPTION_KEYS"
    if not isinstance(options, list):
        return [_issue(item, code, field, "options must be an array")]
    expected = list("ABCD"[: len(options)]) if tier2 else list("ABCD")
    actual = [option.get("key") if isinstance(option, Mapping) else None for option in options]
    if len(actual) != len(expected) or set(actual) != set(expected):
        return [
            _issue(
                item,
                code,
                field,
                f"expected unique keys {expected!r}, found {actual!r}",
            )
        ]
    return []


def _correct_count(options: object) -> int:
    if not isinstance(options, list):
        return 0
    return sum(
        isinstance(option, Mapping) and option.get("c") is True for option in options
    )


def _required_learner_visible_text_issues(item: Mapping) -> list[Issue]:
    """Reject required strings that would render as an empty learner surface."""

    issues: list[Issue] = []

    def require_text(value: object, field: str) -> None:
        if not isinstance(value, str) or not value.strip():
            issues.append(
                _issue(
                    item,
                    "QBANK_VISIBLE_TEXT_EMPTY",
                    field,
                    "required learner-visible text must contain a non-whitespace character",
                )
            )

    for field in ("stem", "why", "pearl", "evidence"):
        require_text(item.get(field), field)

    link = item.get("link")
    if isinstance(link, Mapping):
        require_text(link.get("href"), "link.href")
        if "label" in link:
            require_text(link.get("label"), "link.label")

    options = item.get("options")
    if isinstance(options, list):
        for index, option in enumerate(options):
            if not isinstance(option, Mapping):
                continue
            require_text(option.get("t"), f"options[{index}].t")
            trap = option.get("trap")
            if isinstance(trap, Mapping):
                require_text(trap.get("name"), f"options[{index}].trap.name")
                require_text(trap.get("note"), f"options[{index}].trap.note")

    tier2 = item.get("tier2")
    if isinstance(tier2, Mapping):
        require_text(tier2.get("q"), "tier2.q")
        require_text(tier2.get("why"), "tier2.why")
        tier2_options = tier2.get("options")
        if isinstance(tier2_options, list):
            for index, option in enumerate(tier2_options):
                if isinstance(option, Mapping):
                    require_text(option.get("t"), f"tier2.options[{index}].t")
    return issues


def validate_qbank_render_structure(item: Mapping) -> list[Issue]:
    """Validate every structural rule required before base/Tier-2 rendering."""

    issues: list[Issue] = []
    issues.extend(_required_learner_visible_text_issues(item))
    options = item.get("options")
    issues.extend(_option_key_issues(item, options, tier2=False))
    if _correct_count(options) != 1:
        issues.append(
            _issue(
                item,
                "QBANK_CORRECT_COUNT",
                "options",
                "exactly one base option must have c=true",
            )
        )
    if isinstance(options, list):
        for index, option in enumerate(options):
            if not isinstance(option, Mapping):
                continue
            if option.get("c") is True and "trap" in option:
                issues.append(
                    _issue(
                        item,
                        "QBANK_CORRECT_OPTION_TRAP",
                        f"options[{index}].trap",
                        "the correct option must not carry a trap",
                    )
                )
            if option.get("c") is not True:
                trap = option.get("trap")
                if (
                    not isinstance(trap, Mapping)
                    or not isinstance(trap.get("name"), str)
                    or not trap["name"].strip()
                    or not isinstance(trap.get("note"), str)
                    or not trap["note"].strip()
                ):
                    issues.append(
                        _issue(
                            item,
                            "QBANK_WRONG_OPTION_TRAP",
                            f"options[{index}].trap",
                            "every wrong option must carry a nonempty trap name and note",
                        )
                    )

    if item.get("retired") is True:
        if item.get("status") != "draft":
            issues.append(
                _issue(
                    item,
                    "QBANK_RETIRED_STATUS",
                    "status",
                    "retired items must remain draft",
                )
            )
        reason = item.get("retiredReason")
        if not isinstance(reason, str) or not reason.strip():
            issues.append(
                _issue(
                    item,
                    "QBANK_RETIRED_REASON",
                    "retiredReason",
                    "retired items require a nonempty reason",
                )
            )

    tier2 = item.get("tier2")
    if item.get("type") == "two-tier" and not isinstance(tier2, Mapping):
        issues.append(
            _issue(
                item,
                "QBANK_TIER2_REQUIRED",
                "tier2",
                "two-tier items require Tier 2",
            )
        )
    elif item.get("type") != "two-tier" and tier2 is not None:
        issues.append(
            _issue(
                item,
                "QBANK_TIER2_FORBIDDEN",
                "tier2",
                "non-two-tier items cannot carry Tier 2",
            )
        )
    if isinstance(tier2, Mapping):
        tier2_options = tier2.get("options")
        issues.extend(_option_key_issues(item, tier2_options, tier2=True))
        if _correct_count(tier2_options) != 1:
            issues.append(
                _issue(
                    item,
                    "QBANK_TIER2_CORRECT_COUNT",
                    "tier2.options",
                    "exactly one Tier 2 option must have c=true",
                )
            )
    return issues


def validate_qbank_item(
    item: Mapping, question_bank_schema: Mapping, manifest: ManifestIndex
) -> list[Issue]:
    """Apply item JSON Schema plus hard qbank cross-field integrity rules."""

    issues = validate_qbank_item_schema(item, question_bank_schema)

    issues.extend(validate_qbank_render_structure(item))

    pages = item.get("pages")
    if isinstance(pages, list):
        if len(pages) != len(set(pages)):
            issues.append(
                _issue(
                    item,
                    "QBANK_DUPLICATE_PAGE",
                    "pages",
                    "source-page slugs must be unique within an item",
                )
            )
        for page in pages:
            if page not in manifest.slug_to_path:
                issues.append(
                    _issue(
                        item,
                        "QBANK_PAGE_NOT_IN_MANIFEST",
                        "pages",
                        f"{page!r} is not an exact manifest slug",
                    )
                )
    return issues


def validate_question_bank(
    question_bank: Mapping, question_bank_schema: Mapping, manifest: ManifestIndex
) -> list[Issue]:
    """Validate the root before any item eligibility decision is made."""

    issues: list[Issue] = []
    validator = Draft7Validator(question_bank_schema, format_checker=FormatChecker())
    for error in sorted(validator.iter_errors(question_bank), key=lambda value: list(value.path)):
        issues.append(
            Issue(
                code=error.schema.get("x-issue-code", "QBANK_SCHEMA_INVALID"),
                severity="hard",
                subject="$" + "".join(
                    f"[{part}]" if isinstance(part, int) else f".{part}"
                    for part in error.absolute_path
                ),
                message=error.message,
            )
        )
    items = question_bank.get("items")
    if not isinstance(items, list):
        return issues
    ids: dict[object, int] = {}
    for index, item in enumerate(items):
        if not isinstance(item, Mapping):
            continue
        item_id = item.get("id")
        if item_id in ids:
            issues.append(
                Issue(
                    code="QBANK_DUPLICATE_ITEM_ID",
                    severity="hard",
                    subject=f"{item_id}.id",
                    message=f"item ID duplicates items[{ids[item_id]}] at items[{index}]",
                )
            )
        else:
            ids[item_id] = index
        issues.extend(validate_qbank_item(item, question_bank_schema, manifest))
    return issues


def eligible_qbank_items(
    question_bank: Mapping, question_bank_schema: Mapping, manifest: ManifestIndex
) -> tuple[Mapping, ...]:
    """Return current-state eligible items only after fail-closed validation."""

    issues = validate_question_bank(question_bank, question_bank_schema, manifest)
    if issues:
        raise QbankValidationError(issues)
    return tuple(
        item
        for item in question_bank["items"]
        if item["status"] == "attested" and item.get("retired") is not True
    )


def _evidence_quote(item: Mapping) -> str:
    evidence = item.get("evidence")
    if not isinstance(evidence, str) or not evidence.strip():
        raise SourceResolutionError(
            "QBANK_EVIDENCE_MISSING",
            str(item.get("id", "<missing-id>")),
            "a nonempty evidence quote is required",
        )
    parts = re.split(r"\s+[—–-]\s+", evidence, maxsplit=1)
    return parts[1].strip() if len(parts) == 2 else evidence.strip()


def resolve_primary_qbank_source(
    item: dict,
    primary_page: str,
    primary_anchor: str,
    inputs: QbankSourceInputs,
) -> SourceResolution:
    """Resolve a nominated qbank page/anchor through the exact source authority lane."""

    if primary_page not in item.get("pages", []):
        raise SourceResolutionError(
            "QBANK_PRIMARY_PAGE_MISSING",
            str(item.get("id", "<missing-id>")),
            f"{primary_page!r} is not an exact member of item.pages",
        )
    source_path = inputs.manifest.slug_to_path.get(primary_page)
    if source_path is None:
        raise SourceResolutionError(
            "QBANK_PRIMARY_SLUG_MISSING",
            primary_page,
            "primary page is not an exact manifest slug",
        )
    return resolve_source(
        inputs.repo_root,
        {
            "path": source_path,
            "slug": primary_page,
            "anchor": primary_anchor,
            "quote": _evidence_quote(item),
        },
        inputs.manifest,
        inputs.reviewed,
        inputs.surveillance,
    )


def validate_application_qbank(
    card: Mapping, item: Mapping, source: SourceResolution
) -> list[Issue]:
    """Bind an Application card to one item, named wrong trap, and full source section."""

    qbank = card.get("qbank") if isinstance(card.get("qbank"), Mapping) else {}
    card_source = card.get("source") if isinstance(card.get("source"), Mapping) else {}
    issues: list[Issue] = []
    if qbank.get("id") != item.get("id"):
        issues.append(
            _issue(
                item,
                "QBANK_ID_MISMATCH",
                "id",
                "Application qbank.id must equal the supplied item ID",
            )
        )
    primary_page = qbank.get("primaryPage")
    if primary_page not in item.get("pages", []):
        issues.append(
            _issue(
                item,
                "QBANK_PRIMARY_PAGE_MISSING",
                "pages",
                "Application primaryPage must be an exact item.pages member",
            )
        )
    if card_source.get("slug") != primary_page or source.slug != primary_page:
        issues.append(
            _issue(
                item,
                "QBANK_SOURCE_SLUG_MISMATCH",
                "source.slug",
                "Application source slug must equal qbank.primaryPage",
            )
        )
    primary_anchor = qbank.get("primaryAnchor")
    if card_source.get("anchor") != primary_anchor or source.anchor != primary_anchor:
        issues.append(
            _issue(
                item,
                "QBANK_SOURCE_ANCHOR_MISMATCH",
                "source.anchor",
                "Application source anchor must equal qbank.primaryAnchor",
            )
        )
    if qbank.get("approvedItemSha256") != qbank_item_sha256(item):
        issues.append(
            _issue(
                item,
                "QBANK_APPROVED_ITEM_DRIFT",
                "id",
                "approvedItemSha256 must match the exact governed item projection",
            )
        )
    wrong_traps = [
        option.get("trap", {}).get("name")
        for option in item.get("options", [])
        if isinstance(option, Mapping)
        and option.get("c") is not True
        and isinstance(option.get("trap"), Mapping)
    ]
    if wrong_traps.count(qbank.get("primaryTrap")) != 1:
        issues.append(
            _issue(
                item,
                "QBANK_PRIMARY_TRAP_MISMATCH",
                "options",
                "primaryTrap must equal exactly one incorrect option trap name",
            )
        )
    if qbank.get("sourceAnchorSha256") != source.section_sha256:
        issues.append(
            _issue(
                item,
                "QBANK_SOURCE_ANCHOR_DRIFT",
                "evidence",
                "sourceAnchorSha256 must bind the full normalized primary section",
            )
        )
    return issues


def esc(value) -> str:
    return html.escape(str(value or ""))


def render_options(options, draft=False):
    """Render the frozen legacy options fragments without output drift."""

    front_items = []
    back_items = []
    correct = None
    for option in options:
        key = option.get("key", "")
        text = esc(option.get("t", ""))
        front_items.append(f"<li><b>{esc(key)}.</b> {text}</li>")
        if option.get("c"):
            correct = (key, option.get("t", ""))
            back_items.append(f'<li class="answer">✓ {esc(key)}. {text}</li>')
        else:
            trap = option.get("trap") or {}
            note = trap.get("note")
            name = trap.get("name")
            fragment = f"<li>{esc(key)}. {text}"
            if name or note:
                bits = []
                if name:
                    bits.append(f"<b>{esc(name)}</b>")
                if note:
                    bits.append(esc(note))
                fragment += f'<br><span class="trap">Trap: {" — ".join(bits)}</span>'
            fragment += "</li>"
            back_items.append(fragment)
    front = '<ul class="opts">' + "".join(front_items) + "</ul>"
    back = '<ul class="opts">' + "".join(back_items) + "</ul>"
    return front, back, correct


def answer_html(correct):
    if not correct:
        return ""
    key, text = correct
    return f'<div class="answer">Best answer: {esc(key)}. {esc(text)}</div>'


def meta_html(item):
    category = CATEGORY_LABELS.get(item.get("category"), item.get("category", ""))
    bits = [f'<span class="tag">{esc(category)}</span>']
    if item.get("hy"):
        bits.append('<span class="tag">High-yield</span>')
    bits.append(f'<span class="tag">Difficulty {esc(item.get("difficulty", ""))}</span>')
    for competency in item.get("competency", []):
        bits.append(f'<span class="tag">{esc(competency)}</span>')
    return '<div style="margin-top:10px">' + "".join(bits) + "</div>"


def link_html(item):
    link = item.get("link") or {}
    label = link.get("label")
    href = link.get("href")
    if label and href:
        return f"{esc(label)} ({esc(href)})"
    return ""


def tags_for(item, tier2=False, draft=False):
    tags = ["PsychClerkship"]
    category = item.get("category")
    if category:
        tags.append(f"Psychiatry::{category}")
    for competency in item.get("competency", []):
        tags.append(f"Competency::{competency}")
    tags.append(f"Difficulty::{item.get('difficulty', 'NA')}")
    tags.append(f"Type::{item.get('type', 'sba')}")
    if item.get("hy"):
        tags.append("HighYield")
    for page in item.get("pages", []):
        tags.append(f"Source::{page.replace('.md', '')}")
    if tier2:
        tags.append("Tier2::mechanism")
    tags.append("Status::draft" if draft else "Status::attested")
    return [tag.replace(" ", "_") for tag in tags]


def build_note(item, include_drafts=False):
    """Build the frozen legacy base/Tier-2 genanki notes."""

    draft = item.get("status") != "attested"
    prefix = '<span class="draft">[DRAFT — NOT ATTESTED] </span>' if draft else ""
    front_options, back_options, correct = render_options(item.get("options", []))
    question = prefix + esc(item.get("stem", ""))
    note = genanki.Note(
        model=LEGACY_QBANK_MODEL,
        fields=[
            item["id"],
            question,
            back_options,
            answer_html(correct),
            esc(item.get("why", "")),
            esc(item.get("pearl", "")),
            esc(item.get("evidence", "")),
            link_html(item),
            meta_html(item),
        ],
        tags=tags_for(item, draft=draft),
        guid=legacy_qbank_guid(item["id"]),
    )
    note.fields[1] = question + front_options
    note.fields[2] = ""
    note.fields[3] = back_options + answer_html(correct)
    notes = [note]

    tier2 = item.get("tier2")
    if tier2:
        front2, back2, correct2 = render_options(tier2.get("options", []))
        question2 = prefix + f'<b>Tier 2 — {esc(tier2.get("q", ""))}</b>'
        notes.append(
            genanki.Note(
                model=LEGACY_QBANK_MODEL,
                fields=[
                    item["id"] + "::t2",
                    question2 + front2,
                    "",
                    back2 + answer_html(correct2),
                    esc(tier2.get("why", "")),
                    "",
                    "",
                    "",
                    meta_html(item),
                ],
                tags=tags_for(item, tier2=True, draft=draft),
                guid=legacy_qbank_guid(item["id"], "tier2"),
            )
        )
    return notes


def csv_rows(item, include_drafts=False):
    _, _, correct = render_options(item.get("options", []))
    correct_key, correct_text = correct if correct else ("", "")
    options = " | ".join(
        f"{option.get('key')}. {option.get('t', '')}" for option in item.get("options", [])
    )
    yield {
        "id": item["id"],
        "status": item.get("status"),
        "category": item.get("category"),
        "type": item.get("type"),
        "difficulty": item.get("difficulty"),
        "high_yield": bool(item.get("hy")),
        "competency": ";".join(item.get("competency", [])),
        "source_pages": ";".join(item.get("pages", [])),
        "stem": item.get("stem", ""),
        "options": options,
        "answer_key": correct_key,
        "answer_text": correct_text,
        "why": item.get("why", ""),
        "pearl": item.get("pearl", ""),
        "evidence": item.get("evidence", ""),
    }


def build_deck(
    items,
    include_drafts=False,
    deck_id=LEGACY_QBANK_DECK_ID,
    deck_name=LEGACY_QBANK_DECK_NAME,
):
    """Build the compatibility deck using the frozen legacy selection behavior."""

    selected = [
        item for item in items if include_drafts or item.get("status") == "attested"
    ]
    deck = genanki.Deck(deck_id, deck_name)
    note_count = 0
    for item in selected:
        for note in build_note(item, include_drafts):
            deck.add_note(note)
            note_count += 1
    return deck, selected, note_count


# Legacy exporter aliases retained for downstream imports during cutover.
MODEL_ID = LEGACY_QBANK_MODEL_ID
MODEL = LEGACY_QBANK_MODEL
DECK_ID = LEGACY_QBANK_DECK_ID
DECK_NAME = LEGACY_QBANK_DECK_NAME
CARD_CSS = LEGACY_QBANK_CSS
