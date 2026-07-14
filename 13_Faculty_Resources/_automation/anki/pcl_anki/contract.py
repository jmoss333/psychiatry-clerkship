"""Permanent Anki identities shared by build, inspection, and release tooling."""

from dataclasses import dataclass
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Literal, Mapping
import unicodedata

import genanki
from jsonschema import Draft7Validator, FormatChecker


Severity = Literal["hard", "review", "info"]
Namespace = Literal["core", "application", "qbank"]
Identity = Literal["base", "tier2"]


@dataclass(frozen=True)
class Issue:
    code: str
    severity: Severity
    subject: str
    message: str


@dataclass(frozen=True)
class ManifestIndex:
    path_to_slug: Mapping[str, str]
    slug_to_path: Mapping[str, str]
    slug_to_title: Mapping[str, str]


@dataclass(frozen=True)
class WeekMap:
    slug_to_first_week: Mapping[str, int]
    tool_to_first_week: Mapping[str, int]


@dataclass(frozen=True)
class Section:
    anchor: str
    title: str
    level: int
    start_line: int
    end_line: int
    raw_text: str
    normalized_text: str


@dataclass(frozen=True)
class SourceResolution:
    path: str
    slug: str
    anchor: str
    url: str
    quote: str
    quote_sha256: str
    section_sha256: str
    reviewed_at: date
    introduced_week: int | None


@dataclass(frozen=True)
class HistoryRegistry:
    identity_entries: tuple[dict, ...]
    releases: tuple[dict, ...]


@dataclass(frozen=True)
class RenderedNote:
    namespace: Namespace
    uid: str
    identity: Identity
    guid: str
    deck_id: int
    model_id: int
    template_ordinal: int
    fields: tuple[str, ...]
    tags: tuple[str, ...]
    front_html: str
    back_html: str
    template_contract_sha256: str
    render_sha256: str
    active: bool
    withdrawn: bool


@dataclass(frozen=True)
class CardDecision:
    namespace: Namespace
    uid: str
    identity: Identity
    eligible: bool
    rendered: RenderedNote | None
    issues: tuple[Issue, ...]


@dataclass(frozen=True)
class QuarantineFinding:
    namespace: Namespace
    uid: str
    identity: Identity
    reason_code: str
    subject_sha256: str
    source_path: str | None
    first_seen_commit: str
    withdrawal_render_sha256: str | None = None


@dataclass(frozen=True)
class WithdrawalDecisionProof:
    """Exact Task-5 reconciliation proof for a neutral safety update."""

    finding: QuarantineFinding
    disposition: Literal["withdraw", "retire"]
    affected_release_id: str
    withdrawal_template_version: str
    approved_withdrawal_sha256: str
    review_owner: str
    reviewed_by: str
    reviewed_at: date
    decision_sha256: str


@dataclass(frozen=True)
class QuarantineResult:
    new: tuple[QuarantineFinding, ...]
    changed: tuple[QuarantineFinding, ...]
    accepted: tuple[QuarantineFinding, ...]
    resolved: tuple[QuarantineFinding, ...]
    withdrawal_proofs: tuple[WithdrawalDecisionProof, ...] = ()
    resolved_withdrawal_proofs: tuple[WithdrawalDecisionProof, ...] = ()
    detected_snapshot: tuple[QuarantineFinding, ...] = ()
    governed_ledger_json: str = ""


@dataclass(frozen=True)
class Withdrawal:
    namespace: Namespace
    uid: str
    identity: Identity
    guid: str
    deck_id: int
    deck_name: str
    model_id: int
    model_name: str
    template_id: int | None
    template_name: str
    template_ordinal: int
    field_names: tuple[str, ...]
    field_ids: tuple[int | None, ...]
    fields: tuple[str, ...]
    tags: tuple[str, ...]
    template_contract_sha256: str
    render_sha256: str
    reason_code: str
    affected_release_id: str
    active: bool
    withdrawn: bool


@dataclass(frozen=True)
class CandidateRelease:
    release_id: str | None
    release_date: date | None
    release_epoch: int
    governed_input_sha256: str
    evaluated_at: date
    core_active: tuple[RenderedNote, ...]
    application_active: tuple[RenderedNote, ...]
    qbank_active: tuple[RenderedNote, ...]
    withdrawals: tuple[Withdrawal, ...]
    quarantine: QuarantineResult
    coverage: Mapping[str, object]
    issues: tuple[Issue, ...]


@dataclass(frozen=True)
class PackageNote:
    guid: str
    model_id: int
    fields: tuple[str, ...]
    tags: tuple[str, ...]


@dataclass(frozen=True)
class PackageCard:
    note_guid: str
    deck_id: int
    ordinal: int
    queue: int


@dataclass(frozen=True)
class PackageSnapshot:
    path: Path
    models: Mapping[int, dict]
    decks: Mapping[int, dict]
    notes: tuple[PackageNote, ...]
    cards: tuple[PackageCard, ...]


@dataclass(frozen=True)
class InspectionResult:
    snapshots: Mapping[str, PackageSnapshot]
    receipt: Mapping[str, object]
    identity_fingerprints: Mapping[tuple[str, str, str], str]
    artifact_sha256: Mapping[str, str]
    issues: tuple[Issue, ...]


@dataclass(frozen=True)
class MigrationResult:
    seed_release_id: str
    seed_mode: Literal["legacy", "predecessor", "candidate_redeploy"]
    contract_sha256: str
    issues: tuple[Issue, ...]


@dataclass(frozen=True)
class HistoryAppend:
    new_identity_entries: tuple[dict, ...]
    release_record: dict


# Frozen legacy qbank identities. The shipped model intentionally has no
# per-field or per-template IDs.
LEGACY_QBANK_MODEL_ID = 1607392901
LEGACY_QBANK_MODEL_NAME = "PCL Vignette (Moss)"
LEGACY_QBANK_DECK_ID = 2059400191
LEGACY_QBANK_DECK_NAME = "Psychiatry Clerkship Library (Moss)"
LEGACY_QBANK_FIELDS = (
    "UID",
    "Question",
    "Options",
    "Answer",
    "Why",
    "Pearl",
    "Evidence",
    "Link",
    "Meta",
)
LEGACY_QBANK_TEMPLATE_NAME = "Card 1"
LEGACY_QBANK_TEMPLATE_ORDINAL = 0


# Permanent v2 deck and model identities.
CORE_DECK_ID = 2059400201
CORE_DECK_NAME = "Psychiatry Clerkship MS3 (Moss)::Core Recall"
APPLICATION_DECK_ID = 2059400202
APPLICATION_DECK_NAME = "Psychiatry Clerkship MS3 (Moss)::Clinical Application"

CORE_BASIC_MODEL_ID = 1740112001
CORE_BASIC_MODEL_NAME = "PCL MS3 Core Basic v2"
CORE_CLOZE_MODEL_ID = 1740112002
CORE_CLOZE_MODEL_NAME = "PCL MS3 Core Cloze v2"
APPLICATION_MODEL_ID = 1740112003
APPLICATION_MODEL_NAME = "PCL MS3 Clinical Application v2"


# Ordered (field name, serialized field ID) pairs are immutable after release.
CORE_BASIC_FIELDS = (
    ("UID", 7715026946512367336),
    ("Front", 1581891087570822773),
    ("Answer", 3648809565985408987),
    ("Explanation", 2174348647067507977),
    ("Caveat", 3436125447725103097),
    ("SourceQuote", 2553051568381521149),
    ("SourceLink", 2854218784170519640),
    ("Meta", 1744796410914045706),
)

CORE_CLOZE_FIELDS = (
    ("UID", 1799494823268918589),
    ("Text", 7771538009428565766),
    ("Answer", 4332612271198974114),
    ("Explanation", 7364136103503060308),
    ("Caveat", 7788919485417581378),
    ("SourceQuote", 1452385292661756254),
    ("SourceLink", 6557169000714987829),
    ("Meta", 5637910376665094000),
)

APPLICATION_FIELDS = (
    ("UID", 1131999658638281388),
    ("Question", 3636781603027082657),
    ("Answer", 9202232928613487235),
    ("Discriminator", 403813941556652594),
    ("Trap", 3236073075272291878),
    ("Detail", 5987568621819550144),
    ("Caveat", 3260351373777911252),
    ("SourceQuote", 8755104689011360910),
    ("SourceLink", 1306800255169644962),
    ("Meta", 14791453266034096),
)


CORE_BASIC_TEMPLATE_ID = 8777453155042897990
CORE_BASIC_TEMPLATE_NAME = "Card 1"
CORE_BASIC_TEMPLATE_ORDINAL = 0
CORE_CLOZE_TEMPLATE_ID = 3287951719162080235
CORE_CLOZE_TEMPLATE_NAME = "Cloze"
CORE_CLOZE_TEMPLATE_ORDINAL = 0
APPLICATION_TEMPLATE_ID = 29615640114988655
APPLICATION_TEMPLATE_NAME = "Card 1"
APPLICATION_TEMPLATE_ORDINAL = 0


CORE_GUID_NAMESPACE = "pcl-ms3-core-v2"
APPLICATION_GUID_NAMESPACE = "pcl-ms3-application-v2"


# Governed learner artifact names.
CORE_ARTIFACT_FILENAME = "psychiatry_clerkship_ms3_core.apkg"
APPLICATION_ARTIFACT_FILENAME = "psychiatry_clerkship_ms3_application.apkg"
COMPLETE_ARTIFACT_FILENAME = "psychiatry_clerkship_ms3_complete.apkg"
QBANK_ARTIFACT_FILENAME = "psychiatry_clerkship_qbank.apkg"
RELEASE_ARTIFACT_FILENAMES = (
    CORE_ARTIFACT_FILENAME,
    APPLICATION_ARTIFACT_FILENAME,
    COMPLETE_ARTIFACT_FILENAME,
    QBANK_ARTIFACT_FILENAME,
)


def normalize_source(text: str) -> str:
    """Return the exact normalized source text used for governance hashes."""

    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\s+", " ", text).strip()


def canonical_json_bytes(value: object) -> bytes:
    """Serialize a value using the governed canonical JSON representation."""

    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def canonical_json_sha256(value: object) -> str:
    """Hash the governed canonical JSON representation of a value."""

    return sha256(canonical_json_bytes(value)).hexdigest()


def _json_subject(path: object) -> str:
    subject = "$"
    for part in path:
        subject += f"[{part}]" if isinstance(part, int) else f".{part}"
    return subject


def validate_registry(path: Path, schema_path: Path) -> list[Issue]:
    """Validate one registry against its closed schema."""

    value = json.loads(Path(path).read_text(encoding="utf-8"))
    schema = json.loads(Path(schema_path).read_text(encoding="utf-8"))
    validator = Draft7Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(value), key=lambda error: list(error.path))
    return [
        Issue(
            code=error.schema.get("x-issue-code", "SCHEMA_VALIDATION_ERROR"),
            severity="hard",
            subject=_json_subject(error.absolute_path),
            message=error.message,
        )
        for error in errors
    ]


def core_guid(card_id: str) -> str:
    return genanki.guid_for(CORE_GUID_NAMESPACE, card_id)


def application_guid(card_id: str) -> str:
    return genanki.guid_for(APPLICATION_GUID_NAMESPACE, card_id)


def legacy_qbank_guid(item_id: str, identity: Identity = "base") -> str:
    if identity not in {"base", "tier2"}:
        raise ValueError("identity must be base or tier2")
    key = item_id if identity == "base" else item_id + "::t2"
    return genanki.guid_for(key)
