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


def draft_speech_profile(profile_id="dana-measured-v1"):
    return {
        "id": profile_id,
        "status": "draft-pending-attestation",
        "profileVersion": 1,
        "provider": None,
        "providerModel": None,
        "voiceId": None,
        "cadence": "measured-flat",
        "speakingRate": 0.95,
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
                    "model": "eleven_multilingual_v3",
                },
            },
        ],
        "rateCard": {
            "version": "2026-07-14-planning-v1",
            "effectiveDate": "2026-07-14",
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
                    "model": "eleven_multilingual_v3",
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
        },
    }


def pending_pack():
    return {
        "schemaVersion": "1.0",
        "tool": "sp-interview",
        "status": "draft-pending-attestation",
        "engine": {"modelPinned": "claude-haiku-4-5-20251001"},
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


def write_fixture(root, *, ledger_status, tool_status, pack):
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
        '<!doctype html>\n<!-- [RC-META] tool="The Interview Room" '
        f'status="{tool_status}" -->\n',
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
                and "RC-META status is draft-pending-attestation" in error
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
