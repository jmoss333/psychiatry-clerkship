"""Permanent Anki identities shared by build, inspection, and release tooling."""

import genanki


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


def core_guid(card_id: str) -> str:
    return genanki.guid_for("pcl-ms3-core-v2", card_id)


def application_guid(card_id: str) -> str:
    return genanki.guid_for("pcl-ms3-application-v2", card_id)


def legacy_qbank_guid(item_id: str, identity: str = "base") -> str:
    key = item_id if identity == "base" else item_id + "::t2"
    return genanki.guid_for(key)
