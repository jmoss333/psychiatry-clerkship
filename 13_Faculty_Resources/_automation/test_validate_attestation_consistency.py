#!/usr/bin/env python3
"""Fixture tests for the attestation consistency validator."""

import copy
import json
import tempfile
import unittest
from pathlib import Path

import validate_attestation_consistency as validator


TOOL_SOURCE = "_prototypes/sp-interview/sp-interview.html"
TOOL_SLUG = "sp-interview.html"
REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_PACK = REPO_ROOT / "_prototypes" / "sp-interview" / "sp-interview.pack.json"


def draft_speech_profile(profile_id="dana-measured-v1"):
    return {
        "id": profile_id,
        "status": "draft-pending-attestation",
        "profileVersion": 1,
        "provider": None,
        "providerModel": None,
        "voiceId": None,
        "voiceProvenance": None,
        "cadence": "measured-flat",
        "speakingRate": 0.95,
        "adapterMappingVersion": None,
        "providerSettings": None,
        "stageDirections": "visual-only",
        "facultyReview": {
            "status": "pending",
            "reviewer": None,
            "reviewedAt": None,
            "auditionId": None,
            "profileHash": None,
        },
    }


def draft_speech_engine():
    return {
        "schemaVersion": 1,
        "status": "draft-pending-attestation",
        "enabled": False,
        "activeStack": None,
        "candidateStacks": [
            {
                "id": "openai-quality-v1",
                "transcription": {"provider": "openai", "model": "whisper-1"},
                "synthesis": {"provider": "openai", "model": "tts-1-hd"},
            },
            {
                "id": "elevenlabs-expressive-v1",
                "transcription": {"provider": "elevenlabs", "model": "scribe_v2"},
                "synthesis": {
                    "provider": "elevenlabs",
                    "model": "eleven_v3",
                },
            },
        ],
        "rateCard": {
            "version": "2026-07-15-planning-v2",
            "effectiveDate": "2026-07-15",
            "currency": "USD",
            "rates": [
                {
                    "provider": "anthropic",
                    "model": "claude-haiku-4-5-20251001",
                    "meter": "input_tokens",
                    "unit": "million_tokens",
                    "price": 1,
                    "sourceUrl": "https://example.test/anthropic",
                },
                {
                    "provider": "anthropic",
                    "model": "claude-haiku-4-5-20251001",
                    "meter": "output_tokens",
                    "unit": "million_tokens",
                    "price": 5,
                    "sourceUrl": "https://example.test/anthropic",
                },
                {
                    "provider": "openai",
                    "model": "whisper-1",
                    "meter": "transcription_audio",
                    "unit": "minute",
                    "price": 0.006,
                    "sourceUrl": "https://example.test/openai",
                },
                {
                    "provider": "openai",
                    "model": "tts-1-hd",
                    "meter": "synthesis_characters",
                    "unit": "million_characters",
                    "price": 30,
                    "sourceUrl": "https://example.test/openai",
                },
                {
                    "provider": "elevenlabs",
                    "model": "scribe_v2",
                    "meter": "transcription_audio",
                    "unit": "hour",
                    "price": 0.22,
                    "sourceUrl": "https://example.test/elevenlabs",
                },
                {
                    "provider": "elevenlabs",
                    "model": "eleven_multilingual_v2",
                    "meter": "synthesis_characters",
                    "unit": "thousand_characters",
                    "price": 0.1,
                    "sourceUrl": "https://example.test/elevenlabs",
                },
                {
                    "provider": "elevenlabs",
                    "model": "eleven_v3",
                    "meter": "synthesis_characters",
                    "unit": "thousand_characters",
                    "price": 0.1,
                    "sourceUrl": "https://example.test/elevenlabs",
                },
            ],
        },
        "privacyReview": {
            "status": "pending",
            "policyUrls": [],
            "policyHashes": [],
            "reviewer": None,
            "reviewedAt": None,
            "nextReviewAt": None,
            "decision": "pending",
            "consentVersion": "2026-07-14-draft",
            "accountControls": None,
        },
    }


def pending_pack():
    return {
        "schemaVersion": "1.0",
        "tool": "sp-interview",
        "status": "draft-pending-attestation",
        "engine": {
            "modelPinned": "claude-haiku-4-5-20251001",
            "maxActorOutputTokens": 300,
            "maxEvaluatorOutputTokens": 1500,
        },
        "speechEngine": draft_speech_engine(),
        "cases": [
            {
                "id": "sp_depression_gated_si_001",
                "facultyReview": {
                    "status": "reviewed",
                    "reviewer": "Faculty Reviewer, MD",
                    "lastReviewed": "2026-07-13",
                },
                "speechProfile": draft_speech_profile(),
            }
        ],
    }


def canonical_pack():
    return json.loads(CANONICAL_PACK.read_text(encoding="utf-8"))


def reviewed_voice_pack():
    pack = canonical_pack()
    speech_engine = pack["speechEngine"]
    speech_engine.update(
        {
            "status": "reviewed",
            "enabled": True,
            "activeStack": "openai-quality-v1",
            "engineHash": "f" * 64,
            "privacyReview": {
                "status": "reviewed",
                "policyUrls": [
                    "https://example.test/openai-policy",
                    "https://example.test/elevenlabs-policy",
                ],
                "policyHashes": ["a" * 64, "b" * 64],
                "reviewer": "Privacy Reviewer, MD",
                "reviewedAt": "2026-07-14",
                "nextReviewAt": "2099-07-14",
                "decision": "approved",
                "consentVersion": "2026-07-14-v1",
                "accountControls": {
                    "provider": "openai",
                    "zeroRetentionEntitled": False,
                    "evidenceHash": "e" * 64,
                },
            },
        }
    )
    return pack


def review_first_profile(pack, provider="openai"):
    profile = pack["cases"][0]["speechProfile"]
    if provider == "openai":
        provider_model = "tts-1-hd"
        voice_id = "alloy"
        mapping = "openai-tts-1-hd-v1"
        settings = {"speed": profile["speakingRate"]}
        pack["speechEngine"]["activeStack"] = "openai-quality-v1"
    else:
        provider_model = "eleven_v3"
        voice_id = "stock-voice-2"
        mapping = "eleven-v3-v1"
        settings = {
            "speed": profile["speakingRate"],
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.2,
            "use_speaker_boost": True,
        }
        pack["speechEngine"]["activeStack"] = "elevenlabs-expressive-v1"
        pack["speechEngine"]["privacyReview"]["accountControls"] = {
            "provider": "elevenlabs",
            "zeroRetentionEntitled": False,
            "evidenceHash": "f" * 64,
        }
    profile.update(
        {
            "status": "reviewed",
            "provider": provider,
            "providerModel": provider_model,
            "voiceId": voice_id,
            "voiceProvenance": {
                "kind": "provider-stock",
                "catalogUrl": "https://provider.example.test/stock-voices/" + voice_id,
                "verifiedBy": "Faculty voice reviewer",
                "verifiedAt": "2026-07-14",
                "evidenceHash": "c" * 64,
            },
            "adapterMappingVersion": mapping,
            "providerSettings": settings,
            "facultyReview": {
                "status": "reviewed",
                "reviewer": "Faculty Reviewer, MD",
                "reviewedAt": "2026-07-14",
                "auditionId": "synthetic-audition-fixture",
                "profileHash": "d" * 64,
            },
        }
    )
    return profile


def swap_candidate_synthesis(pack):
    candidates = pack["speechEngine"]["candidateStacks"]
    candidates[0]["synthesis"], candidates[1]["synthesis"] = (
        candidates[1]["synthesis"],
        candidates[0]["synthesis"],
    )


def remove_rate(pack, model):
    rates = pack["speechEngine"]["rateCard"]["rates"]
    rates[:] = [rate for rate in rates if rate.get("model") != model]


def write_fixture(
    root,
    *,
    ledger_status,
    tool_status,
    pack,
    marker="RC-META",
    extra_markers="",
):
    root = Path(root)
    reviewed_path = root / "13_Faculty_Resources" / "reviewed.json"
    manifest_path = (
        root
        / "13_Faculty_Resources"
        / "_automation"
        / "site_build"
        / "site_manifest.json"
    )
    source_path = root / TOOL_SOURCE
    pack_path = source_path.with_suffix(".pack.json")
    for path in (reviewed_path, manifest_path, source_path, pack_path):
        path.parent.mkdir(parents=True, exist_ok=True)

    reviewed_path.write_text(
        json.dumps(
            {
                TOOL_SLUG: {
                    "status": ledger_status,
                    "at": "2026-07-13",
                    "by": "Historical Reviewer, MD",
                }
            }
        ),
        encoding="utf-8",
    )
    (root / "topic_meta.json").write_text("{}", encoding="utf-8")
    manifest_path.write_text(
        json.dumps(
            {
                "md": [],
                "tools": [[TOOL_SOURCE, TOOL_SLUG, "The Interview Room"]],
            }
        ),
        encoding="utf-8",
    )
    source_path.write_text(
        f'<!doctype html>\n<!-- [{marker}] tool="The Interview Room" '
        f'audience="ms3,resident" status="{tool_status}" -->\n{extra_markers}',
        encoding="utf-8",
    )
    pack_path.write_text(json.dumps(pack), encoding="utf-8")


class AttestationConsistencyTests(unittest.TestCase):
    def validate(self, root):
        validate = getattr(validator, "validate", None)
        self.assertTrue(
            callable(validate),
            "validator must expose validate(root) -> list[str]",
        )
        return validate(root)

    def validate_pack(self, pack):
        with tempfile.TemporaryDirectory() as root:
            write_fixture(
                root,
                ledger_status="pending",
                tool_status="draft-pending-attestation",
                pack=pack,
            )
            return self.validate(root)

    def test_reviewed_ledger_with_pending_tool_header_fails(self):
        with tempfile.TemporaryDirectory() as root:
            write_fixture(
                root,
                ledger_status="reviewed",
                tool_status="draft-pending-attestation",
                pack=pending_pack(),
            )
            errors = self.validate(root)
        self.assertTrue(
            any(
                "reviewed.json says reviewed" in error
                and "metadata status is draft-pending-attestation" in error
                for error in errors
            ),
            errors,
        )

    def test_attested_pack_containing_a_draft_case_fails(self):
        pack = pending_pack()
        pack["status"] = "attested"
        pack["cases"].append(
            {
                "id": "sp_mania_redirect_001",
                "facultyReview": {"status": "draft", "reviewer": "", "lastReviewed": ""},
                "speechProfile": draft_speech_profile("marcus-pressured-v1"),
            }
        )
        with tempfile.TemporaryDirectory() as root:
            write_fixture(
                root,
                ledger_status="reviewed",
                tool_status="reviewed",
                pack=pack,
            )
            errors = self.validate(root)
        self.assertTrue(
            any(
                "attested pack contains non-reviewed case sp_mania_redirect_001" in error
                for error in errors
            ),
            errors,
        )

    def test_reviewed_case_requires_reviewer_and_date(self):
        mutations = {
            "reviewer": ("reviewer", ""),
            "review date": ("lastReviewed", ""),
        }
        for label, (field, value) in mutations.items():
            with self.subTest(missing=label), tempfile.TemporaryDirectory() as root:
                pack = pending_pack()
                pack["cases"][0]["facultyReview"][field] = value
                write_fixture(
                    root,
                    ledger_status="pending",
                    tool_status="draft-pending-attestation",
                    pack=pack,
                )
                errors = self.validate(root)
                self.assertTrue(
                    any(
                        "reviewed case sp_depression_gated_si_001 is missing " + label
                        in error
                        for error in errors
                    ),
                    errors,
                )

    def test_pending_pack_with_draft_voice_records_passes(self):
        with tempfile.TemporaryDirectory() as root:
            write_fixture(
                root,
                ledger_status="pending",
                tool_status="draft-pending-attestation",
                pack=copy.deepcopy(pending_pack()),
            )
            errors = self.validate(root)
        self.assertEqual(errors, [])

    def test_preferred_and_legacy_markers_preserve_identical_attestation_checks(self):
        results = {}
        for marker in ("RC-META", "CLERKSHIP-META v1"):
            with self.subTest(marker=marker), tempfile.TemporaryDirectory() as root:
                write_fixture(
                    root,
                    ledger_status="reviewed",
                    tool_status="draft-pending-attestation",
                    pack=pending_pack(),
                    marker=marker,
                )
                results[marker] = self.validate(root)
        self.assertEqual(results["CLERKSHIP-META v1"], results["RC-META"])
        self.assertTrue(
            any("reviewed.json says reviewed" in error for error in results["RC-META"]),
            results,
        )

    def test_conflicting_markers_fail_without_echoing_metadata_values(self):
        with tempfile.TemporaryDirectory() as root:
            write_fixture(
                root,
                ledger_status="pending",
                tool_status="draft-pending-attestation",
                pack=pending_pack(),
                extra_markers=(
                    '<!-- [CLERKSHIP-META v1] tool="The Interview Room" '
                    'status="secret-status" -->\n'
                ),
            )
            errors = self.validate(root)
        self.assertIn("sp-interview.html: manifest tool has an invalid metadata header", errors)
        self.assertFalse(any("secret-status" in error for error in errors), errors)

    def test_engine_output_token_pins_are_required_positive_safe_integers(self):
        fields = ("maxActorOutputTokens", "maxEvaluatorOutputTokens")
        for field in fields:
            for label, value in {
                "missing": None,
                "boolean": True,
                "zero": 0,
                "fractional": 1.5,
                "unsafe": 9_007_199_254_740_992,
            }.items():
                with self.subTest(field=field, mutation=label):
                    pack = canonical_pack()
                    pack["engine"].update(
                        {
                            "maxActorOutputTokens": 300,
                            "maxEvaluatorOutputTokens": 1500,
                        }
                    )
                    if value is None:
                        pack["engine"].pop(field)
                    else:
                        pack["engine"][field] = value
                    errors = self.validate_pack(pack)
                    self.assertTrue(
                        any(field in error and "positive safe integer" in error for error in errors),
                        errors,
                    )

    def test_engine_output_token_pins_match_the_reviewed_contract(self):
        for field, value in {
            "maxActorOutputTokens": 301,
            "maxEvaluatorOutputTokens": 1499,
        }.items():
            with self.subTest(field=field):
                pack = canonical_pack()
                pack["engine"][field] = value
                errors = self.validate_pack(pack)
                self.assertTrue(
                    any(field in error and "reviewed value" in error for error in errors),
                    errors,
                )

    def test_draft_privacy_cannot_claim_account_controls(self):
        pack = pending_pack()
        pack["speechEngine"]["privacyReview"]["accountControls"] = {
            "provider": "openai",
            "zeroRetentionEntitled": False,
            "evidenceHash": "e" * 64,
        }
        errors = self.validate_pack(pack)
        self.assertTrue(any("accountControls must be null" in error for error in errors), errors)

    def test_draft_profiles_require_explicit_null_attestation_only_fields(self):
        for field, value in {
            "provider": "openai",
            "providerModel": "tts-1-hd",
            "voiceId": "alloy",
            "voiceProvenance": {
                "kind": "provider-stock",
                "catalogUrl": "https://example.test/voice",
                "verifiedBy": "Unapproved placeholder",
                "verifiedAt": "2026-07-14",
                "evidenceHash": "a" * 64,
            },
            "adapterMappingVersion": "openai-tts-1-hd-v1",
            "providerSettings": {"speed": 0.95},
        }.items():
            with self.subTest(field=field):
                pack = pending_pack()
                pack["cases"][0]["speechProfile"][field] = value
                errors = self.validate_pack(pack)
                self.assertTrue(any(field in error and "must be null" in error for error in errors), errors)

    def test_reviewed_profile_requires_exact_stock_provenance_and_openai_mapping(self):
        valid = reviewed_voice_pack()
        review_first_profile(valid)
        self.assertEqual(self.validate_pack(valid), [])

        def mutate(field, value):
            def apply(pack):
                profile = review_first_profile(pack)
                if field.startswith("voiceProvenance."):
                    profile["voiceProvenance"][field.split(".", 1)[1]] = value
                elif field.startswith("providerSettings."):
                    profile["providerSettings"][field.split(".", 1)[1]] = value
                else:
                    profile[field] = value
            return apply

        mutations = {
            "cloned provenance": mutate("voiceProvenance.kind", "cloned"),
            "HTTP catalog": mutate("voiceProvenance.catalogUrl", "http://example.test/voice"),
            "blank verifier": mutate("voiceProvenance.verifiedBy", "  "),
            "future verification": mutate("voiceProvenance.verifiedAt", "2999-01-01"),
            "invalid evidence hash": mutate("voiceProvenance.evidenceHash", "A" * 64),
            "wrong mapping": mutate("adapterMappingVersion", "openai-v2"),
            "speed mismatch": mutate("providerSettings.speed", 1.0),
            "unknown model": mutate("providerModel", "tts-unknown"),
        }
        for label, apply in mutations.items():
            with self.subTest(mutation=label):
                pack = reviewed_voice_pack()
                apply(pack)
                self.assertTrue(self.validate_pack(pack), label)

        pack = reviewed_voice_pack()
        profile = review_first_profile(pack)
        profile["voiceProvenance"]["extra"] = True
        self.assertTrue(self.validate_pack(pack))
        pack = reviewed_voice_pack()
        profile = review_first_profile(pack)
        profile["providerSettings"]["pitch"] = 1
        self.assertTrue(self.validate_pack(pack))

    def test_reviewed_eleven_v3_profile_requires_exact_supported_settings(self):
        valid = reviewed_voice_pack()
        review_first_profile(valid, "elevenlabs")
        self.assertEqual(self.validate_pack(valid), [])

        mutations = {
            "speed over supported range": lambda p: (
                p.update({"speakingRate": 1.21}),
                p["providerSettings"].update({"speed": 1.21}),
            ),
            "unsupported stability": lambda p: p["providerSettings"].update({"stability": 0.2}),
            "similarity out of range": lambda p: p["providerSettings"].update({"similarity_boost": 1.1}),
            "style out of range": lambda p: p["providerSettings"].update({"style": -0.1}),
            "non-boolean boost": lambda p: p["providerSettings"].update({"use_speaker_boost": "true"}),
            "wrong mapping": lambda p: p.update({"adapterMappingVersion": "eleven-v2-v1"}),
        }
        for label, apply in mutations.items():
            with self.subTest(mutation=label):
                pack = reviewed_voice_pack()
                profile = review_first_profile(pack, "elevenlabs")
                apply(profile)
                self.assertTrue(self.validate_pack(pack), label)

    def test_reviewed_profile_provider_must_match_active_synthesis_stack(self):
        pack = reviewed_voice_pack()
        review_first_profile(pack, "openai")
        self.assertEqual(self.validate_pack(pack), [])
        # Point the engine's active stack at the ElevenLabs candidate while the
        # reviewed profile stays pinned to the OpenAI synthesis model.
        pack["speechEngine"]["activeStack"] = "elevenlabs-expressive-v1"
        errors = self.validate_pack(pack)
        self.assertTrue(
            any("must match the active synthesis stack" in message for message in errors),
            errors,
        )

    def test_reviewed_engine_flags_unresolvable_active_synthesis_for_profile_crosscheck(self):
        pack = reviewed_voice_pack()
        review_first_profile(pack, "openai")
        self.assertEqual(self.validate_pack(pack), [])
        # A reviewed profile with an active stack that resolves to no synthesis
        # must produce an explicit error, not a silent skip of the parity check.
        pack["speechEngine"]["activeStack"] = "nonexistent-stack"
        errors = self.validate_pack(pack)
        self.assertTrue(
            any("active synthesis stack is unresolvable" in message for message in errors),
            errors,
        )

    def test_reviewed_or_enabled_engine_requires_a_sha256_engine_hash(self):
        self.assertEqual(self.validate_pack(reviewed_voice_pack()), [])
        mutations = {
            "missing engineHash": lambda engine: engine.pop("engineHash", None),
            "null engineHash": lambda engine: engine.__setitem__("engineHash", None),
            "malformed engineHash": lambda engine: engine.__setitem__("engineHash", "not-a-hash"),
        }
        for label, apply in mutations.items():
            with self.subTest(mutation=label):
                pack = reviewed_voice_pack()
                apply(pack["speechEngine"])
                errors = self.validate_pack(pack)
                # Match the specific message so an unrelated shape error can't
                # keep this green if the engineHash requirement regresses.
                self.assertTrue(
                    any("requires a SHA-256 engineHash" in message for message in errors),
                    (label, errors),
                )

    def test_reviewed_enabled_engine_requires_complete_approved_privacy(self):
        self.assertEqual(self.validate_pack(reviewed_voice_pack()), [])

        def pending_decision(pack):
            pack["speechEngine"]["privacyReview"]["decision"] = "pending"

        def pending_status(pack):
            pack["speechEngine"]["privacyReview"]["status"] = "pending"

        def empty_policy_urls(pack):
            pack["speechEngine"]["privacyReview"]["policyUrls"] = []

        def empty_policy_hashes(pack):
            pack["speechEngine"]["privacyReview"]["policyHashes"] = []

        def mismatched_policy_records(pack):
            pack["speechEngine"]["privacyReview"]["policyHashes"].pop()

        def blank_policy_hash(pack):
            pack["speechEngine"]["privacyReview"]["policyHashes"][0] = ""

        def missing_reviewer(pack):
            pack["speechEngine"]["privacyReview"]["reviewer"] = None

        def invalid_reviewed_at(pack):
            pack["speechEngine"]["privacyReview"]["reviewedAt"] = "not-a-date"

        def expired_next_review(pack):
            pack["speechEngine"]["privacyReview"]["nextReviewAt"] = "2020-01-01"

        def invalid_next_review(pack):
            pack["speechEngine"]["privacyReview"]["nextReviewAt"] = "not-a-date"

        def draft_consent(pack):
            pack["speechEngine"]["privacyReview"]["consentVersion"] = (
                "2026-07-14-draft"
            )

        def missing_account_controls(pack):
            pack["speechEngine"]["privacyReview"]["accountControls"] = None

        def wrong_account_provider(pack):
            pack["speechEngine"]["privacyReview"]["accountControls"]["provider"] = "elevenlabs"

        def invalid_entitlement(pack):
            pack["speechEngine"]["privacyReview"]["accountControls"]["zeroRetentionEntitled"] = "false"

        def invalid_account_evidence(pack):
            pack["speechEngine"]["privacyReview"]["accountControls"]["evidenceHash"] = "E" * 64

        def extra_account_field(pack):
            pack["speechEngine"]["privacyReview"]["accountControls"]["reviewedBy"] = "placeholder"

        def unsafe_policy_url(pack):
            pack["speechEngine"]["privacyReview"]["policyUrls"][0] = "javascript:alert(1)"

        mutations = {
            "pending decision": pending_decision,
            "pending status": pending_status,
            "empty policy URLs": empty_policy_urls,
            "empty policy hashes": empty_policy_hashes,
            "mismatched policy records": mismatched_policy_records,
            "blank policy hash": blank_policy_hash,
            "missing reviewer": missing_reviewer,
            "invalid reviewedAt": invalid_reviewed_at,
            "expired nextReviewAt": expired_next_review,
            "invalid nextReviewAt": invalid_next_review,
            "draft consent version": draft_consent,
            "missing account controls": missing_account_controls,
            "wrong account provider": wrong_account_provider,
            "invalid entitlement": invalid_entitlement,
            "invalid account evidence": invalid_account_evidence,
            "extra account field": extra_account_field,
            "unsafe policy URL": unsafe_policy_url,
        }
        for label, mutate in mutations.items():
            with self.subTest(mutation=label):
                pack = reviewed_voice_pack()
                mutate(pack)
                self.assertTrue(self.validate_pack(pack), label)

    def test_canonical_voice_contract_rejects_every_drift_mutation(self):
        self.assertEqual(self.validate_pack(canonical_pack()), [])

        def wrong_candidate_provider(pack):
            pack["speechEngine"]["candidateStacks"][0]["transcription"][
                "provider"
            ] = "elevenlabs"

        def missing_candidate(pack):
            pack["speechEngine"]["candidateStacks"].pop()

        def duplicate_candidate(pack):
            candidates = pack["speechEngine"]["candidateStacks"]
            candidates.append(copy.deepcopy(candidates[0]))

        def missing_candidate_model(pack):
            pack["speechEngine"]["candidateStacks"][0]["transcription"].pop(
                "model"
            )

        def wrong_candidate_model(pack):
            pack["speechEngine"]["candidateStacks"][0]["transcription"][
                "model"
            ] = "eleven_v3"

        def extra_candidate_field(pack):
            pack["speechEngine"]["candidateStacks"][0]["voiceId"] = "alloy"

        def extra_candidate_leg_field(pack):
            pack["speechEngine"]["candidateStacks"][0]["synthesis"]["voiceId"] = "alloy"

        def unsafe_rate_source(pack):
            pack["speechEngine"]["rateCard"]["rates"][0]["sourceUrl"] = "javascript:alert(1)"

        def missing_v2_rate(pack):
            remove_rate(pack, "eleven_multilingual_v2")

        def duplicate_rate(pack):
            rates = pack["speechEngine"]["rateCard"]["rates"]
            rates.append(copy.deepcopy(rates[0]))

        def wrong_rate_tuple(pack):
            pack["speechEngine"]["rateCard"]["rates"][0]["unit"] = "tokens"

        def wrong_rate_value(pack):
            pack["speechEngine"]["rateCard"]["rates"][2]["price"] = 31

        def wrong_effective_date(pack):
            pack["speechEngine"]["rateCard"]["effectiveDate"] = "2026-07-14"

        def wrong_rate_card_version(pack):
            pack["speechEngine"]["rateCard"]["version"] = "2026-07-14-planning-v1"

        mutations = {
            "swapped candidate synthesis models": swap_candidate_synthesis,
            "wrong candidate provider": wrong_candidate_provider,
            "missing candidate": missing_candidate,
            "duplicate candidate": duplicate_candidate,
            "missing candidate model": missing_candidate_model,
            "wrong candidate model": wrong_candidate_model,
            "extra candidate field": extra_candidate_field,
            "extra candidate leg field": extra_candidate_leg_field,
            "unsafe rate source": unsafe_rate_source,
            "missing ElevenLabs v2 rate": missing_v2_rate,
            "duplicate rate": duplicate_rate,
            "wrong rate tuple": wrong_rate_tuple,
            "wrong rate value": wrong_rate_value,
            "wrong effective date": wrong_effective_date,
            "wrong rate-card version": wrong_rate_card_version,
        }
        for label, mutate in mutations.items():
            with self.subTest(mutation=label):
                pack = canonical_pack()
                mutate(pack)
                self.assertTrue(self.validate_pack(pack), label)


if __name__ == "__main__":
    unittest.main(verbosity=2)
