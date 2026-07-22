#!/usr/bin/env python3
"""Validate faculty attestation consistency across source registries.

The faculty console commits review decisions to reviewed.json. Source headers,
topic metadata, and the Interview Room's case/voice pack must not imply broader
approval than that ledger actually records.
"""

import json
import math
import os
import re
import sys
from datetime import date
from urllib.parse import urlparse

from validate_tool_governance import GovernanceError, parse_metadata_marker


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REVIEWED_PATH = os.path.join("13_Faculty_Resources", "reviewed.json")
TOPIC_META_PATH = "topic_meta.json"
MANIFEST_PATH = os.path.join(
    "13_Faculty_Resources", "_automation", "site_build", "site_manifest.json"
)

REVIEWED_STATUSES = {"reviewed", "attested"}
PROFILE_STATUSES = {"draft-pending-attestation", "reviewed"}
CADENCES = {"measured-flat", "pressured-fast", "guarded-halting"}
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
MAX_SAFE_INTEGER = 9_007_199_254_740_991
ENGINE_OUTPUT_TOKEN_PINS = {
    "maxActorOutputTokens": 300,
    "maxEvaluatorOutputTokens": 1500,
}
OPENAI_STOCK_VOICES = {
    "alloy",
    "ash",
    "ballad",
    "cedar",
    "coral",
    "echo",
    "fable",
    "marin",
    "nova",
    "onyx",
    "sage",
    "shimmer",
    "verse",
}
EXPECTED_CANDIDATE_IDS = {"openai-quality-v1", "elevenlabs-expressive-v1"}
EXPECTED_CANDIDATE_STACKS = {
    "openai-quality-v1": {
        "transcription": ("openai", "whisper-1"),
        "synthesis": ("openai", "tts-1-hd"),
    },
    "elevenlabs-expressive-v1": {
        "transcription": ("elevenlabs", "scribe_v2"),
        "synthesis": ("elevenlabs", "eleven_v3"),
    },
}
PLANNING_RATE_VERSION = "2026-07-15-planning-v2"
PLANNING_RATE_EFFECTIVE_DATE = "2026-07-15"
EXPECTED_RATE_TUPLES = (
    (
        "anthropic",
        "claude-haiku-4-5-20251001",
        "input_tokens",
        "million_tokens",
        1,
    ),
    (
        "anthropic",
        "claude-haiku-4-5-20251001",
        "output_tokens",
        "million_tokens",
        5,
    ),
    ("openai", "tts-1-hd", "synthesis_characters", "million_characters", 30),
    ("openai", "whisper-1", "transcription_audio", "minute", 0.006),
    (
        "elevenlabs",
        "eleven_multilingual_v2",
        "synthesis_characters",
        "thousand_characters",
        0.1,
    ),
    (
        "elevenlabs",
        "eleven_v3",
        "synthesis_characters",
        "thousand_characters",
        0.1,
    ),
    ("elevenlabs", "scribe_v2", "transcription_audio", "hour", 0.22),
)


def load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def norm_status(value):
    return str(value or "unreviewed")


def is_reviewed(value):
    return norm_status(value) in REVIEWED_STATUSES


def _validate_engine(slug, pack):
    engine = pack.get("engine")
    if not isinstance(engine, dict):
        return ["%s: pack.engine must be an object" % slug]

    errors = []
    for field, expected in ENGINE_OUTPUT_TOKEN_PINS.items():
        value = engine.get(field)
        if (
            isinstance(value, bool)
            or not isinstance(value, int)
            or value <= 0
            or value > MAX_SAFE_INTEGER
        ):
            errors.append(
                "%s: engine.%s must be a positive safe integer" % (slug, field)
            )
        elif value != expected:
            errors.append(
                "%s: engine.%s must equal reviewed value %d"
                % (slug, field, expected)
            )
    return errors


def parse_rc_meta(source, relative_path):
    """Return fields from the shared preferred-or-legacy metadata parser."""
    return parse_metadata_marker(source, relative_path).fields


def parse_iso_date(value):
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def is_sha256(value):
    return isinstance(value, str) and SHA256_RE.fullmatch(value) is not None


def exact_keys(value, expected):
    return isinstance(value, dict) and set(value) == set(expected)


def finite_number(value, minimum, maximum):
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(value)
        and minimum <= value <= maximum
    )


def valid_https_url(value):
    if not isinstance(value, str):
        return False
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.netloc)
        and parsed.username is None
        and parsed.password is None
    )


def _case_label(case_def, index):
    return str(case_def.get("id") or "case[%d]" % index)


def _validate_reviewed_voice_contract(slug, case_id, profile):
    errors = []
    prefix = "%s: reviewed case %s speechProfile" % (slug, case_id)
    provenance = profile.get("voiceProvenance")
    provenance_keys = {
        "kind", "catalogUrl", "verifiedBy", "verifiedAt", "evidenceHash"
    }
    if not exact_keys(provenance, provenance_keys):
        errors.append(prefix + ".voiceProvenance must have the exact reviewed shape")
    else:
        verified_at = parse_iso_date(provenance.get("verifiedAt"))
        if provenance.get("kind") != "provider-stock":
            errors.append(prefix + ".voiceProvenance.kind must be provider-stock")
        if not valid_https_url(provenance.get("catalogUrl")):
            errors.append(prefix + ".voiceProvenance.catalogUrl must be HTTPS")
        if not isinstance(provenance.get("verifiedBy"), str) or not provenance.get("verifiedBy", "").strip():
            errors.append(prefix + ".voiceProvenance.verifiedBy is required")
        if verified_at is None or verified_at > date.today():
            errors.append(prefix + ".voiceProvenance.verifiedAt is invalid or future")
        if not is_sha256(provenance.get("evidenceHash")):
            errors.append(prefix + ".voiceProvenance.evidenceHash must be SHA-256")

    provider = profile.get("provider")
    model = profile.get("providerModel")
    mapping = profile.get("adapterMappingVersion")
    settings = profile.get("providerSettings")
    speaking_rate = profile.get("speakingRate")
    if provider == "openai" and model == "tts-1-hd":
        if profile.get("voiceId") not in OPENAI_STOCK_VOICES:
            errors.append(prefix + ".voiceId is not a supported OpenAI stock voice")
        if mapping != "openai-tts-1-hd-v1":
            errors.append(prefix + ".adapterMappingVersion is invalid for OpenAI")
        if not exact_keys(settings, {"speed"}):
            errors.append(prefix + ".providerSettings must contain only speed")
        elif settings.get("speed") != speaking_rate:
            errors.append(prefix + ".providerSettings.speed must equal speakingRate")
    elif provider == "elevenlabs" and model == "eleven_v3":
        required_settings = {
            "speed",
            "stability",
            "similarity_boost",
            "style",
            "use_speaker_boost",
        }
        if mapping != "eleven-v3-v1":
            errors.append(prefix + ".adapterMappingVersion is invalid for Eleven v3")
        if not exact_keys(settings, required_settings):
            errors.append(prefix + ".providerSettings has an invalid Eleven v3 shape")
        else:
            if settings.get("speed") != speaking_rate or not finite_number(
                settings.get("speed"), 0.7, 1.2
            ):
                errors.append(prefix + ".providerSettings.speed is invalid for Eleven v3")
            stability = settings.get("stability")
            if isinstance(stability, bool) or stability not in (0, 0.5, 1):
                errors.append(prefix + ".providerSettings.stability is invalid")
            if not finite_number(settings.get("similarity_boost"), 0, 1):
                errors.append(prefix + ".providerSettings.similarity_boost is invalid")
            if not finite_number(settings.get("style"), 0, 1):
                errors.append(prefix + ".providerSettings.style is invalid")
            if not isinstance(settings.get("use_speaker_boost"), bool):
                errors.append(prefix + ".providerSettings.use_speaker_boost must be boolean")
    else:
        errors.append(prefix + " has an unsupported provider/model pair")
    return errors


def _validate_speech_profile(slug, case_def, case_id, engine_status):
    errors = []
    profile = case_def.get("speechProfile")
    if not isinstance(profile, dict):
        return ["%s: case %s is missing speechProfile" % (slug, case_id)]

    profile_status = norm_status(profile.get("status"))
    if profile_status not in PROFILE_STATUSES:
        errors.append(
            "%s: case %s speechProfile.status is %s"
            % (slug, case_id, profile_status)
        )

    if not profile.get("id"):
        errors.append("%s: case %s speechProfile is missing id" % (slug, case_id))
    version = profile.get("profileVersion")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        errors.append(
            "%s: case %s speechProfile.profileVersion must be a positive integer"
            % (slug, case_id)
        )
    if profile.get("cadence") not in CADENCES:
        errors.append(
            "%s: case %s speechProfile.cadence is invalid" % (slug, case_id)
        )
    speaking_rate = profile.get("speakingRate")
    if (
        isinstance(speaking_rate, bool)
        or not isinstance(speaking_rate, (int, float))
        or not 0.75 <= speaking_rate <= 1.25
    ):
        errors.append(
            "%s: case %s speechProfile.speakingRate must be between 0.75 and 1.25"
            % (slug, case_id)
        )
    if profile.get("stageDirections") != "visual-only":
        errors.append(
            "%s: case %s speechProfile.stageDirections must be visual-only"
            % (slug, case_id)
        )

    review = profile.get("facultyReview")
    if not isinstance(review, dict):
        errors.append(
            "%s: case %s speechProfile is missing facultyReview" % (slug, case_id)
        )
        review = {}

    if profile_status == "draft-pending-attestation":
        if norm_status(review.get("status")) == "reviewed":
            errors.append(
                "%s: case %s draft speechProfile cannot claim reviewed facultyReview"
                % (slug, case_id)
            )
        for field in (
            "provider",
            "providerModel",
            "voiceId",
            "voiceProvenance",
            "adapterMappingVersion",
            "providerSettings",
        ):
            if field not in profile or profile.get(field) is not None:
                errors.append(
                    "%s: case %s draft speechProfile.%s must be null"
                    % (slug, case_id, field)
                )
    elif profile_status == "reviewed":
        if engine_status != "reviewed":
            errors.append(
                "%s: case %s speechProfile is reviewed while speechEngine is %s"
                % (slug, case_id, engine_status)
            )
        if not is_reviewed(case_def.get("facultyReview", {}).get("status")):
            errors.append(
                "%s: non-reviewed case %s cannot have a reviewed speechProfile"
                % (slug, case_id)
            )
        for field in ("provider", "providerModel", "voiceId"):
            if not profile.get(field):
                errors.append(
                    "%s: reviewed case %s speechProfile is missing %s"
                    % (slug, case_id, field)
                )
        if norm_status(review.get("status")) != "reviewed":
            errors.append(
                "%s: reviewed case %s speechProfile facultyReview is not reviewed"
                % (slug, case_id)
            )
        for field in ("reviewer", "reviewedAt", "auditionId", "profileHash"):
            if not review.get(field):
                errors.append(
                    "%s: reviewed case %s speechProfile facultyReview is missing %s"
                    % (slug, case_id, field)
                )
        if review.get("profileHash") and not is_sha256(review.get("profileHash")):
            errors.append(
                "%s: reviewed case %s speechProfile facultyReview.profileHash must be SHA-256"
                % (slug, case_id)
            )
        errors.extend(_validate_reviewed_voice_contract(slug, case_id, profile))

    if profile_status != "draft-pending-attestation":
        for field in (
            "provider",
            "providerModel",
            "voiceId",
            "voiceProvenance",
            "adapterMappingVersion",
            "providerSettings",
        ):
            if profile.get(field) is None:
                errors.append(
                    "%s: null speechProfile.%s is allowed only while draft"
                    % (slug, field)
                )
    return errors


def _validate_speech_engine(slug, pack, cases):
    errors = []
    speech_engine = pack.get("speechEngine")
    if not isinstance(speech_engine, dict):
        return ["%s: pack is missing speechEngine" % slug]

    if speech_engine.get("schemaVersion") != 1:
        errors.append("%s: speechEngine.schemaVersion must be 1" % slug)
    engine_status = norm_status(speech_engine.get("status"))
    if engine_status not in PROFILE_STATUSES:
        errors.append("%s: speechEngine.status is %s" % (slug, engine_status))
    if not isinstance(speech_engine.get("enabled"), bool):
        errors.append("%s: speechEngine.enabled must be boolean" % slug)
    if engine_status == "draft-pending-attestation":
        if speech_engine.get("enabled") is not False:
            errors.append("%s: draft speechEngine must be disabled" % slug)
        if speech_engine.get("activeStack") is not None:
            errors.append("%s: draft speechEngine.activeStack must be null" % slug)

    candidates = speech_engine.get("candidateStacks")
    if not isinstance(candidates, list):
        errors.append("%s: speechEngine.candidateStacks must be a list" % slug)
        candidates = []
    candidate_ids = [
        candidate.get("id")
        for candidate in candidates
        if isinstance(candidate, dict) and candidate.get("id")
    ]
    candidate_id_set = set(candidate_ids)
    actual_candidate_stacks = {}
    for candidate in candidates:
        if not isinstance(candidate, dict) or not candidate.get("id"):
            continue
        if not exact_keys(candidate, {"id", "transcription", "synthesis"}):
            errors.append(
                "%s: candidate %s must have the exact stack shape"
                % (slug, candidate.get("id") or "<unknown>")
            )
        for leg in ("transcription", "synthesis"):
            if not exact_keys(candidate.get(leg), {"provider", "model"}):
                errors.append(
                    "%s: candidate %s %s must have exact provider/model fields"
                    % (slug, candidate.get("id") or "<unknown>", leg)
                )
        actual_candidate_stacks[candidate.get("id")] = {
            leg: (
                candidate.get(leg, {}).get("provider"),
                candidate.get(leg, {}).get("model"),
            )
            if isinstance(candidate.get(leg), dict)
            else (None, None)
            for leg in ("transcription", "synthesis")
        }
    if (
        len(candidates) != len(EXPECTED_CANDIDATE_STACKS)
        or candidate_id_set != EXPECTED_CANDIDATE_IDS
        or len(candidate_ids) != len(EXPECTED_CANDIDATE_STACKS)
        or len(candidate_id_set) != len(candidate_ids)
        or actual_candidate_stacks != EXPECTED_CANDIDATE_STACKS
    ):
        errors.append(
            "%s: speechEngine candidate stacks do not match the dated planning contract"
            % slug
        )
    if engine_status == "reviewed" and speech_engine.get("activeStack") not in candidate_id_set:
        errors.append("%s: reviewed speechEngine must select an audition candidate" % slug)

    # The runtime gate (sp-governance.mjs) refuses managed voice unless the
    # reviewed/enabled engine carries a SHA-256 engineHash. CI never checked it,
    # so a reviewed pack missing engineHash passed here yet was ineligible live.
    if engine_status == "reviewed" or speech_engine.get("enabled") is True:
        if not is_sha256(speech_engine.get("engineHash")):
            errors.append(
                "%s: reviewed or enabled speechEngine requires a SHA-256 engineHash" % slug
            )

    # A reviewed profile pins provider/providerModel; the runtime additionally
    # requires that pin to equal the engine's active synthesis stack (a mismatch
    # is silently ineligible live). Cross-check it here so CI catches the drift.
    active_synthesis = actual_candidate_stacks.get(
        speech_engine.get("activeStack"), {}
    ).get("synthesis")
    if engine_status == "reviewed" and active_synthesis and active_synthesis != (None, None):
        for case_def in cases:
            if not isinstance(case_def, dict):
                continue
            profile = case_def.get("speechProfile")
            if not isinstance(profile, dict) or norm_status(profile.get("status")) != "reviewed":
                continue
            if (profile.get("provider"), profile.get("providerModel")) != active_synthesis:
                errors.append(
                    "%s: reviewed case %s speechProfile provider/model must match the active synthesis stack"
                    % (slug, case_def.get("id") or "<unknown>")
                )
    elif engine_status == "reviewed" and any(
        isinstance(case_def, dict)
        and isinstance(case_def.get("speechProfile"), dict)
        and norm_status(case_def["speechProfile"].get("status")) == "reviewed"
        for case_def in cases
    ):
        # Do not skip the parity check silently: a reviewed engine with reviewed
        # profiles but an unresolvable active synthesis stack is a governance gap.
        errors.append(
            "%s: reviewed profiles could not be cross-checked — the active synthesis stack is unresolvable"
            % slug
        )

    rate_card = speech_engine.get("rateCard")
    rate_models = set()
    rate_keys = set()
    if not isinstance(rate_card, dict):
        errors.append("%s: speechEngine is missing rateCard" % slug)
    else:
        if not rate_card.get("version") or not rate_card.get("effectiveDate"):
            errors.append("%s: rateCard requires version and effectiveDate" % slug)
        rates = rate_card.get("rates")
        if not isinstance(rates, list) or not rates:
            errors.append("%s: rateCard.rates must be a non-empty list" % slug)
            rates = []
        actual_rate_tuples = []
        for index, rate in enumerate(rates):
            if not isinstance(rate, dict):
                errors.append("%s: rateCard.rates[%d] must be an object" % (slug, index))
                continue
            if not exact_keys(
                rate,
                {"provider", "model", "meter", "unit", "price", "sourceUrl"},
            ):
                errors.append(
                    "%s: rateCard.rates[%d] must have the exact rate shape"
                    % (slug, index)
                )
            provider = rate.get("provider")
            model = rate.get("model")
            meter = rate.get("meter")
            if not all((provider, model, meter, rate.get("unit"), rate.get("sourceUrl"))):
                errors.append(
                    "%s: rateCard.rates[%d] is missing provider/model/meter/unit/sourceUrl"
                    % (slug, index)
                )
            if not valid_https_url(rate.get("sourceUrl")):
                errors.append(
                    "%s: rateCard.rates[%d].sourceUrl must be credential-free HTTPS"
                    % (slug, index)
                )
            price = rate.get("price")
            if (
                isinstance(price, bool)
                or not isinstance(price, (int, float))
                or price <= 0
            ):
                errors.append(
                    "%s: rateCard.rates[%d].price must be positive" % (slug, index)
                )
            actual_rate_tuples.append(
                (provider, model, meter, rate.get("unit"), price)
            )
            if isinstance(model, str) and model:
                rate_models.add(model)
                rate_keys.add((model, meter))
        exact_rates = (
            len(actual_rate_tuples) == len(EXPECTED_RATE_TUPLES)
            and all(
                actual_rate_tuples.count(expected) == 1
                for expected in EXPECTED_RATE_TUPLES
            )
            and all(rate_tuple in EXPECTED_RATE_TUPLES for rate_tuple in actual_rate_tuples)
        )
        if (
            rate_card.get("version") != PLANNING_RATE_VERSION
            or
            rate_card.get("effectiveDate") != PLANNING_RATE_EFFECTIVE_DATE
            or not exact_rates
        ):
            errors.append(
                "%s: rateCard does not match the 2026-07-15 planning contract"
                % slug
            )

    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        for leg in ("transcription", "synthesis"):
            contract = candidate.get(leg)
            if not isinstance(contract, dict) or not contract.get("provider") or not contract.get("model"):
                errors.append(
                    "%s: candidate %s is missing %s provider/model"
                    % (slug, candidate.get("id") or "<unknown>", leg)
                )
                continue
            if contract.get("model") not in rate_models:
                errors.append(
                    "%s: candidate model %s is absent from the rate card"
                    % (slug, contract.get("model"))
                )

    actor_model = pack.get("engine", {}).get("modelPinned")
    if actor_model:
        for meter in ("input_tokens", "output_tokens"):
            if (actor_model, meter) not in rate_keys:
                errors.append(
                    "%s: actor model %s %s rate is absent from the rate card"
                    % (slug, actor_model, meter)
                )

    privacy = speech_engine.get("privacyReview")
    if not isinstance(privacy, dict):
        errors.append("%s: speechEngine is missing privacyReview" % slug)
    elif engine_status == "draft-pending-attestation":
        if privacy.get("status") != "pending" or privacy.get("decision") != "pending":
            errors.append("%s: draft speechEngine privacy review must remain pending" % slug)
        if privacy.get("policyUrls") != [] or privacy.get("policyHashes") != []:
            errors.append("%s: pending privacy review policy records must be empty" % slug)
        for field in ("reviewer", "reviewedAt", "nextReviewAt"):
            if privacy.get(field) is not None:
                errors.append(
                    "%s: pending privacyReview.%s must be null" % (slug, field)
                )
        if privacy.get("consentVersion") != "2026-07-14-draft":
            errors.append(
                "%s: pending privacyReview consentVersion must be 2026-07-14-draft"
                % slug
            )
        if "accountControls" not in privacy or privacy.get("accountControls") is not None:
            errors.append(
                "%s: pending privacyReview.accountControls must be null" % slug
            )

    if isinstance(privacy, dict) and (
        engine_status == "reviewed" or speech_engine.get("enabled") is True
    ):
        if privacy.get("status") != "reviewed" or privacy.get("decision") != "approved":
            errors.append(
                "%s: reviewed or enabled speechEngine requires an approved privacy decision"
                % slug
            )
        policy_urls = privacy.get("policyUrls")
        policy_hashes = privacy.get("policyHashes")
        valid_policy_urls = (
            isinstance(policy_urls, list)
            and bool(policy_urls)
            and all(valid_https_url(value) for value in policy_urls)
        )
        valid_policy_hashes = (
            isinstance(policy_hashes, list)
            and bool(policy_hashes)
            and all(is_sha256(value) for value in policy_hashes)
        )
        if (
            not valid_policy_urls
            or not valid_policy_hashes
            or len(policy_urls) != len(policy_hashes)
        ):
            errors.append(
                "%s: approved privacy review requires matched nonempty policy URLs and hashes"
                % slug
            )
        if not isinstance(privacy.get("reviewer"), str) or not privacy.get("reviewer", "").strip():
            errors.append("%s: approved privacy review is missing reviewer" % slug)
        reviewed_at = parse_iso_date(privacy.get("reviewedAt"))
        if reviewed_at is None or reviewed_at > date.today():
            errors.append("%s: approved privacy review has invalid reviewedAt" % slug)
        next_review_at = parse_iso_date(privacy.get("nextReviewAt"))
        if next_review_at is None or next_review_at <= date.today():
            errors.append(
                "%s: approved privacy review requires a future nextReviewAt" % slug
            )
        consent_version = privacy.get("consentVersion")
        if (
            not isinstance(consent_version, str)
            or not consent_version.strip()
            or "draft" in consent_version.lower()
        ):
            errors.append(
                "%s: approved privacy review requires a non-draft consentVersion"
                % slug
            )
        active_candidates = [
            candidate
            for candidate in candidates
            if isinstance(candidate, dict)
            and candidate.get("id") == speech_engine.get("activeStack")
        ]
        active_provider = None
        if len(active_candidates) == 1:
            transcription_provider = active_candidates[0].get("transcription", {}).get("provider")
            synthesis_provider = active_candidates[0].get("synthesis", {}).get("provider")
            if transcription_provider == synthesis_provider:
                active_provider = synthesis_provider
        account_controls = privacy.get("accountControls")
        if not exact_keys(
            account_controls,
            {"provider", "zeroRetentionEntitled", "evidenceHash"},
        ):
            errors.append(
                "%s: approved privacy review requires exact accountControls" % slug
            )
        else:
            if not active_provider or account_controls.get("provider") != active_provider:
                errors.append(
                    "%s: privacyReview.accountControls provider must match the active stack"
                    % slug
                )
            if not isinstance(account_controls.get("zeroRetentionEntitled"), bool):
                errors.append(
                    "%s: privacyReview.accountControls zeroRetentionEntitled must be boolean"
                    % slug
                )
            if not is_sha256(account_controls.get("evidenceHash")):
                errors.append(
                    "%s: privacyReview.accountControls evidenceHash must be SHA-256"
                    % slug
                )

    if speech_engine.get("enabled") is True and engine_status != "reviewed":
        errors.append("%s: managed voice cannot be enabled before speechEngine review" % slug)

    for index, case_def in enumerate(cases):
        if isinstance(case_def, dict):
            case_id = _case_label(case_def, index)
            errors.extend(
                _validate_speech_profile(slug, case_def, case_id, engine_status)
            )
    return errors


def _validate_pack(slug, pack_path, ledger_status, meta_status):
    errors = []
    try:
        pack = load(pack_path)
    except (OSError, ValueError) as exc:
        return ["%s: could not load case pack (%s)" % (slug, exc)]

    pack_status = norm_status(pack.get("status"))
    if is_reviewed(ledger_status) and not is_reviewed(pack_status):
        errors.append(
            "%s: reviewed-ledger-pack-status-mismatch" % slug
        )
    if not is_reviewed(ledger_status) and is_reviewed(pack_status):
        errors.append(
            "%s: pack-reviewed-ledger-status-mismatch" % slug
        )
    if meta_status and is_reviewed(meta_status) != is_reviewed(pack_status):
        errors.append(
            "%s: metadata-pack-status-mismatch" % slug
        )

    errors.extend(_validate_engine(slug, pack))

    cases = pack.get("cases")
    if not isinstance(cases, list) or not cases:
        return errors + ["%s: pack.cases must be a non-empty list" % slug]
    for index, case_def in enumerate(cases):
        if not isinstance(case_def, dict):
            errors.append("%s: pack.cases[%d] must be an object" % (slug, index))
            continue
        case_id = _case_label(case_def, index)
        review = case_def.get("facultyReview")
        if not isinstance(review, dict):
            errors.append("%s: case %s is missing facultyReview" % (slug, case_id))
            review = {}
        case_status = norm_status(review.get("status"))
        if is_reviewed(pack_status) and not is_reviewed(case_status):
            errors.append(
                "%s: attested pack contains non-reviewed case %s" % (slug, case_id)
            )
        if is_reviewed(case_status):
            reviewer = review.get("reviewer")
            if not reviewer or reviewer == "Pending faculty review":
                errors.append(
                    "%s: reviewed case %s is missing reviewer" % (slug, case_id)
                )
            if not (review.get("lastReviewed") or review.get("reviewedAt")):
                errors.append(
                    "%s: reviewed case %s is missing review date" % (slug, case_id)
                )

    errors.extend(_validate_speech_engine(slug, pack, cases))
    return errors


def validate(root):
    """Return every attestation inconsistency found below ``root``."""
    root = os.path.abspath(os.fspath(root))
    reviewed = load(os.path.join(root, REVIEWED_PATH))
    topic_meta = load(os.path.join(root, TOPIC_META_PATH))
    manifest = load(os.path.join(root, MANIFEST_PATH))
    manifest_md_entries = manifest.get("md", [])
    manifest_tool_entries = manifest.get("tools", [])
    manifest_md = {slug for _src, slug, _title in manifest_md_entries}
    manifest_tools = {slug for _src, slug, _title in manifest_tool_entries}
    manifest_items = manifest_md | manifest_tools

    errors = []
    for slug in sorted(manifest_items):
        if slug not in reviewed:
            errors.append("%s: missing reviewed.json entry" % slug)

    for src, slug, _title in manifest_md_entries:
        ledger_status = norm_status(reviewed.get(slug, {}).get("status"))
        if not is_reviewed(ledger_status):
            continue
        source_path = os.path.join(root, src)
        try:
            with open(source_path, encoding="utf-8") as handle:
                source_head = "\n".join(handle.read().splitlines()[:8])
        except FileNotFoundError:
            errors.append(
                "%s: source file listed in manifest is missing (%s)" % (slug, src)
            )
            continue
        if re.search(r"pending.*review|pending.*attestation|AI-drafted", source_head, re.I):
            errors.append(
                "%s: reviewed.json says reviewed but source banner still says pending review"
                % slug
            )

    for src, slug, _title in manifest_tool_entries:
        ledger_status = norm_status(reviewed.get(slug, {}).get("status"))
        source_path = os.path.join(root, src)
        try:
            with open(source_path, "rb") as handle:
                source = handle.read()
        except FileNotFoundError:
            errors.append(
                "%s: source file listed in manifest is missing (%s)" % (slug, src)
            )
            continue
        try:
            meta = parse_rc_meta(source, src)
        except GovernanceError as error:
            if str(error).endswith(": metadata marker missing"):
                errors.append("%s: manifest tool is missing a recognized metadata header" % slug)
            else:
                errors.append("%s: manifest tool has an invalid metadata header" % slug)
            meta = {}
        meta_status = meta.get("status")
        if meta_status and is_reviewed(ledger_status) and not is_reviewed(meta_status):
            errors.append(
                "%s: reviewed-ledger-metadata-status-mismatch" % slug
            )
        if meta_status and not is_reviewed(ledger_status) and is_reviewed(meta_status):
            errors.append(
                "%s: metadata-reviewed-ledger-status-mismatch" % slug
            )

        pack_path = os.path.splitext(source_path)[0] + ".pack.json"
        if slug == "sp-interview.html" and not os.path.exists(pack_path):
            errors.append("%s: case pack is missing (%s)" % (slug, pack_path))
        elif os.path.exists(pack_path):
            errors.extend(
                _validate_pack(slug, pack_path, ledger_status, meta_status)
            )

    for slug in sorted(manifest_md):
        meta = topic_meta.get(slug)
        if not isinstance(meta, dict):
            continue
        faculty = meta.get("facultyReview")
        if not isinstance(faculty, dict):
            continue
        ledger = reviewed.get(slug, {})
        ledger_status = norm_status(ledger.get("status"))
        faculty_status = norm_status(faculty.get("status"))
        if is_reviewed(ledger_status) and not is_reviewed(faculty_status):
            errors.append(
                "%s: reviewed-ledger-topic-meta-status-mismatch" % slug
            )
        if not is_reviewed(ledger_status) and is_reviewed(faculty_status):
            errors.append(
                "%s: topic-meta-reviewed-ledger-status-mismatch" % slug
            )
        if is_reviewed(ledger_status):
            if not faculty.get("lastReviewed"):
                errors.append(
                    "%s: reviewed topic_meta entry is missing facultyReview.lastReviewed"
                    % slug
                )
            if not faculty.get("reviewer") or faculty.get("reviewer") == "Pending faculty review":
                errors.append(
                    "%s: reviewed topic_meta entry is missing an attesting reviewer" % slug
                )

    return errors


def main():
    errors = validate(ROOT)
    if errors:
        print("attestation consistency INVALID — %d issue(s):" % len(errors))
        for error in errors:
            print("  -", error)
        return 1

    topic_meta = load(os.path.join(ROOT, TOPIC_META_PATH))
    manifest = load(os.path.join(ROOT, MANIFEST_PATH))
    manifest_md = {slug for _src, slug, _title in manifest.get("md", [])}
    manifest_items = manifest_md | {
        slug for _src, slug, _title in manifest.get("tools", [])
    }
    faculty_count = sum(
        1
        for slug in manifest_md
        if isinstance(topic_meta.get(slug), dict)
        and isinstance(topic_meta.get(slug, {}).get("facultyReview"), dict)
    )
    noun = "entry" if faculty_count == 1 else "entries"
    print(
        "attestation consistency OK — %d manifest item(s), %d topic facultyReview %s aligned."
        % (len(manifest_items), faculty_count, noun)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
