import json
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
AUTOMATION = ROOT / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))

from maintenance.rotation_readiness import (
    MANUAL_CHECKLIST,
    RotationConfigError,
    _utc_today,
    evaluate_rotation,
    render_rotation_markdown,
    rotation_exit_code,
    validate_rotation_config,
)


class RotationReadinessTests(unittest.TestCase):
    def test_raw_evaluator_and_renderer_reject_invalid_opaque_id(self):
        invalid_block = {
            "id": "learner@example.com",
            "startsOn": "2026-08-10",
            "endsOn": "2026-09-20",
            "status": "planned",
        }
        with self.assertRaisesRegex(RotationConfigError, "opaque"):
            evaluate_rotation([invalid_block], today=date(2026, 8, 3))

        invalid_passport = {
            "schemaVersion": 1,
            "state": "due",
            "blockId": "learner@example.com",
            "startsOn": "2026-08-10",
            "endsOn": "2026-09-20",
            "daysUntilStart": 7,
            "manualChecklist": list(MANUAL_CHECKLIST),
        }
        with self.assertRaisesRegex(RotationConfigError, "opaque"):
            render_rotation_markdown(invalid_passport)

    def test_cli_clock_uses_utc_date(self):
        class FakeDateTime:
            @classmethod
            def now(cls, tz):
                self.assertIs(tz, timezone.utc)
                return datetime(2026, 7, 29, 0, 5, tzinfo=timezone.utc)

        with mock.patch(
            "maintenance.rotation_readiness.datetime",
            FakeDateTime,
        ):
            self.assertEqual(_utc_today(), date(2026, 7, 29))

    def test_empty_configuration_is_honest_and_quiet(self):
        blocks = validate_rotation_config({"schemaVersion": 1, "blocks": []})
        passport = evaluate_rotation(blocks, today=date(2026, 8, 3))
        self.assertEqual(
            passport,
            {
                "schemaVersion": 1,
                "state": "configuration_required",
                "blockId": None,
                "startsOn": None,
                "endsOn": None,
                "daysUntilStart": None,
                "manualChecklist": list(MANUAL_CHECKLIST),
            },
        )
        self.assertEqual(rotation_exit_code(passport), 0)

    def test_exactly_seven_days_before_block_is_due(self):
        passport = evaluate_rotation(
            [
                {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-08-10",
                    "endsOn": "2026-09-20",
                    "status": "planned",
                }
            ],
            today=date(2026, 8, 3),
        )
        self.assertEqual(passport["state"], "due")
        self.assertEqual(passport["daysUntilStart"], 7)
        self.assertEqual(rotation_exit_code(passport), 10)
        self.assertNotIn("super-secret-value", json.dumps(passport))

    def test_not_due_overdue_active_and_complete_states(self):
        cases = (
            (
                date(2026, 7, 1),
                {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-08-10",
                    "endsOn": "2026-09-20",
                    "status": "planned",
                },
                "not_due",
                40,
                0,
            ),
            (
                date(2026, 8, 5),
                {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-08-10",
                    "endsOn": "2026-09-20",
                    "status": "planned",
                },
                "overdue",
                5,
                10,
            ),
            (
                date(2026, 8, 20),
                {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-08-10",
                    "endsOn": "2026-09-20",
                    "status": "active",
                },
                "active",
                -10,
                0,
            ),
            (
                date(2026, 9, 21),
                {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-08-10",
                    "endsOn": "2026-09-20",
                    "status": "completed",
                },
                "complete",
                -42,
                0,
            ),
        )
        for today, block, expected_state, expected_days, expected_exit in cases:
            with self.subTest(state=expected_state):
                passport = evaluate_rotation([block], today=today)
                self.assertEqual(passport["state"], expected_state)
                self.assertEqual(passport["daysUntilStart"], expected_days)
                self.assertEqual(rotation_exit_code(passport), expected_exit)

    def test_manual_checklist_is_exact_and_markdown_disclaims_automation(self):
        self.assertEqual(
            list(MANUAL_CHECKLIST),
            [
                "issue a new non-identifying SP_ROTATION_ID",
                "rotate the learner passcode and separate operations credential",
                "preserve the prior content-free usage receipt",
                "run the Interview Room red-team checklist and golden transcript",
                "verify the latest production canary, release rehearsal, governance digest, and attestation gate",
                "confirm managed voice remains disabled unless all external faculty/privacy gates are recorded",
            ],
        )
        passport = evaluate_rotation([], today=date(2026, 8, 3))
        markdown = render_rotation_markdown(passport)
        self.assertIn("does not rotate or display credentials", markdown)
        self.assertIn("does not authorize managed voice", markdown)

    def test_duplicate_ids_and_overlapping_open_blocks_are_rejected(self):
        duplicate = {
            "schemaVersion": 1,
            "blocks": [
                {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-08-10",
                    "endsOn": "2026-09-20",
                    "status": "planned",
                },
                {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-10-01",
                    "endsOn": "2026-11-11",
                    "status": "planned",
                },
            ],
        }
        with self.assertRaisesRegex(RotationConfigError, "duplicate"):
            validate_rotation_config(duplicate)

        overlapping = {
            "schemaVersion": 1,
            "blocks": [
                {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-08-10",
                    "endsOn": "2026-09-20",
                    "status": "planned",
                },
                {
                    "id": "rot-2026-hx-b2c3d4e5f6071829",
                    "startsOn": "2026-09-01",
                    "endsOn": "2026-10-12",
                    "status": "active",
                },
            ],
        }
        with self.assertRaisesRegex(RotationConfigError, "overlap"):
            validate_rotation_config(overlapping)

    def test_id_grammar_rejects_names_email_numeric_and_non_mixed_values(self):
        invalid_ids = (
            "rot-2026-joshua",
            "rot-2026-12345678",
            "rot-2026-hx-1234567890123456",
            "rot-2026-hx-abcdefabcdefabcd",
            "rot-2026-hx-A1b2c3d4e5f60718",
            "rot-2026-hx-a1b2c3d4e5f6071",
            "joshua@example.com",
            " rot-2026-hx-a1b2c3d4e5f60718",
        )
        for invalid_id in invalid_ids:
            with self.subTest(invalid_id=invalid_id):
                with self.assertRaisesRegex(RotationConfigError, "opaque"):
                    validate_rotation_config(
                        {
                            "schemaVersion": 1,
                            "blocks": [
                                {
                                    "id": invalid_id,
                                    "startsOn": "2026-08-10",
                                    "endsOn": "2026-09-20",
                                    "status": "planned",
                                }
                            ],
                        }
                    )

    def test_dates_order_and_35_to_49_day_duration_are_enforced(self):
        cases = (
            ("not-a-date", "2026-09-20", "date"),
            ("2026-08-10", "not-a-date", "date"),
            ("2026-09-20", "2026-08-10", "before"),
            ("2026-08-10", "2026-09-12", "35"),
            ("2026-08-10", "2026-09-28", "49"),
        )
        for starts_on, ends_on, message in cases:
            with self.subTest(starts_on=starts_on, ends_on=ends_on):
                with self.assertRaisesRegex(RotationConfigError, message):
                    validate_rotation_config(
                        {
                            "schemaVersion": 1,
                            "blocks": [
                                {
                                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                                    "startsOn": starts_on,
                                    "endsOn": ends_on,
                                    "status": "planned",
                                }
                            ],
                        }
                    )

    def test_unexpected_and_identity_or_secret_keys_are_rejected(self):
        forbidden = (
            "name",
            "email",
            "learnerId",
            "patient",
            "passcode",
            "credential",
        )
        for key in forbidden:
            with self.subTest(key=key):
                block = {
                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                    "startsOn": "2026-08-10",
                    "endsOn": "2026-09-20",
                    "status": "planned",
                    key: "super-secret-value",
                }
                with self.assertRaisesRegex(RotationConfigError, "forbidden"):
                    validate_rotation_config({"schemaVersion": 1, "blocks": [block]})

        with self.assertRaisesRegex(RotationConfigError, "unexpected"):
            validate_rotation_config(
                {
                    "schemaVersion": 1,
                    "blocks": [
                        {
                            "id": "rot-2026-hx-a1b2c3d4e5f60718",
                            "startsOn": "2026-08-10",
                            "endsOn": "2026-09-20",
                            "status": "planned",
                            "note": "not allowed",
                        }
                    ],
                }
            )

    def test_configuration_shape_status_and_whitespace_are_strict(self):
        invalid_values = (
            [],
            {"schemaVersion": 2, "blocks": []},
            {"schemaVersion": 1, "blocks": [], "extra": True},
            {"schemaVersion": 1, "blocks": "not-an-array"},
        )
        for value in invalid_values:
            with self.subTest(value=value):
                with self.assertRaises(RotationConfigError):
                    validate_rotation_config(value)

        for status in ("draft", " planned", ""):
            with self.subTest(status=status):
                with self.assertRaises(RotationConfigError):
                    validate_rotation_config(
                        {
                            "schemaVersion": 1,
                            "blocks": [
                                {
                                    "id": "rot-2026-hx-a1b2c3d4e5f60718",
                                    "startsOn": "2026-08-10",
                                    "endsOn": "2026-09-20",
                                    "status": status,
                                }
                            ],
                        }
                    )

    def test_passport_is_deterministic_and_content_free(self):
        blocks = [
            {
                "id": "rot-2026-hx-a1b2c3d4e5f60718",
                "startsOn": "2026-08-10",
                "endsOn": "2026-09-20",
                "status": "planned",
            }
        ]
        first = evaluate_rotation(blocks, today=date(2026, 8, 3))
        second = evaluate_rotation(list(reversed(blocks)), today=date(2026, 8, 3))
        self.assertEqual(first, second)
        self.assertEqual(
            set(first),
            {
                "schemaVersion",
                "state",
                "blockId",
                "startsOn",
                "endsOn",
                "daysUntilStart",
                "manualChecklist",
            },
        )
        serialized = json.dumps(first)
        self.assertNotIn("super-secret-value", serialized)
        self.assertNotIn("@example.com", serialized)


if __name__ == "__main__":
    unittest.main()
