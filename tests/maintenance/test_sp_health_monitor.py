import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance.sp_health_monitor import (  # noqa: E402
    PUBLIC_STATUS_URL,
    evaluate_status,
    main,
    probe_status,
)


NOW = datetime(2026, 7, 28, 12, 0, tzinfo=timezone.utc)


def success_payload(**overrides):
    payload = {
        "schemaVersion": 1,
        "state": "success",
        "learnerReady": False,
        "actorReady": True,
        "replyLatencyBucket": "fast",
        "caseCount": 3,
        "contractSha256": "a" * 64,
        "checkedAt": "2026-07-28T06:00:00.000Z",
        "nextRun": "2026-07-28T12:00:00.000Z",
    }
    payload.update(overrides)
    return payload


class FixtureResponse:
    def __init__(self, body, *, status=200, content_type="application/json"):
        self.status = status
        self.headers = {"Content-Type": content_type}
        self._body = body
        self.closed = False

    def read(self, size=-1):
        if size < 0 or size > 65_537:
            raise AssertionError("response reads must be bounded")
        return self._body[:size]

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


class FixtureOpener:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        if self.error:
            raise self.error
        return self.response


class SpHealthMonitorTests(unittest.TestCase):
    def test_fresh_success_is_ready(self):
        result = evaluate_status(
            success_payload(),
            now=NOW,
        )
        self.assertEqual(result["gate"], "ready")
        self.assertEqual(
            set(result),
            {
                "schemaVersion",
                "gate",
                "state",
                "checkedAt",
                "receiptCheckedAt",
                "nextRun",
                "learnerReady",
                "actorReady",
                "replyLatencyBucket",
                "caseCount",
                "contractSha256",
            },
        )

    def test_reachability_only_receipt_from_the_pre_probe_canary_is_malformed(self):
        """A green health page once coexisted with a dead provider.

        The pre-probe canary wrote a seven-key receipt attesting reachability
        only. It must never read as a ready gate now that the contract
        promises a completed live turn.
        """
        legacy = success_payload()
        del legacy["actorReady"]
        del legacy["replyLatencyBucket"]
        result = evaluate_status(legacy, now=NOW)
        self.assertEqual(result["state"], "malformed")
        self.assertEqual(result["gate"], "blocked")

    def test_learner_ready_without_actor_ready_is_malformed(self):
        """The shape the health surface had while the tool was mute."""
        result = evaluate_status(
            success_payload(learnerReady=True, actorReady=False),
            now=NOW,
        )
        self.assertEqual(result["state"], "malformed")
        self.assertEqual(result["gate"], "blocked")

    def test_draft_pack_reports_actor_not_ready_without_being_malformed(self):
        """sp.mjs refuses POSTs on a draft pack, so nothing was probed.

        That is correct behaviour, not an outage, and must not blow up the
        monitor the way an unconditional actor probe would.
        """
        result = evaluate_status(
            success_payload(
                learnerReady=False,
                actorReady=False,
                replyLatencyBucket="not-probed",
            ),
            now=NOW,
        )
        self.assertEqual(result["state"], "success")
        self.assertEqual(result["gate"], "ready")
        self.assertIs(result["actorReady"], False)
        self.assertEqual(result["replyLatencyBucket"], "not-probed")

    def test_latency_bucket_and_actor_ready_must_agree(self):
        """A completed turn has a timing; one never sent has none."""
        contradictions = (
            {"actorReady": True, "replyLatencyBucket": "not-probed"},
            {"learnerReady": False, "actorReady": False, "replyLatencyBucket": "fast"},
        )
        for overrides in contradictions:
            with self.subTest(**overrides):
                result = evaluate_status(success_payload(**overrides), now=NOW)
                self.assertEqual(result["state"], "malformed")
                self.assertEqual(result["gate"], "blocked")

    def test_known_latency_buckets_pass_and_unknown_ones_are_malformed(self):
        for bucket in ("fast", "normal", "slow"):
            with self.subTest(replyLatencyBucket=bucket):
                result = evaluate_status(
                    success_payload(replyLatencyBucket=bucket),
                    now=NOW,
                )
                self.assertEqual(result["gate"], "ready")
                self.assertEqual(result["replyLatencyBucket"], bucket)
        for bucket in ("", "FAST", "quick", 0, 3000, None):
            with self.subTest(replyLatencyBucket=bucket):
                result = evaluate_status(
                    success_payload(replyLatencyBucket=bucket),
                    now=NOW,
                )
                self.assertEqual(result["state"], "malformed")

    def test_non_boolean_actor_ready_is_malformed(self):
        for actor_ready in ("true", 1, None):
            with self.subTest(actorReady=actor_ready):
                result = evaluate_status(
                    success_payload(actorReady=actor_ready),
                    now=NOW,
                )
                self.assertEqual(result["state"], "malformed")
                self.assertEqual(result["gate"], "blocked")

    def test_actor_leg_failure_codes_are_accepted_and_block_the_gate(self):
        for code in ("actor_timeout", "actor_status", "actor_budget", "actor_contract"):
            with self.subTest(failureCode=code):
                result = evaluate_status(
                    {
                        "schemaVersion": 1,
                        "state": "failed",
                        "failureCode": code,
                        "checkedAt": "2026-07-28T06:00:00.000Z",
                    },
                    now=NOW,
                )
                self.assertEqual(result["state"], "failed")
                self.assertEqual(result["gate"], "blocked")

    def test_exact_eight_hour_and_slot_boundaries_are_ready(self):
        result = evaluate_status(
            success_payload(
                checkedAt="2026-07-28T04:10:00.000Z",
                nextRun="2026-07-28T12:00:00.000Z",
            ),
            now=datetime(2026, 7, 28, 12, 10, tzinfo=timezone.utc),
        )
        self.assertEqual(result["gate"], "ready")

    def test_stale_success_and_late_slot_block(self):
        stale = evaluate_status(
            success_payload(
                checkedAt="2026-07-28T03:59:59.000Z",
                nextRun="2026-07-28T18:00:00.000Z",
            ),
            now=NOW,
        )
        late = evaluate_status(
            success_payload(),
            now=datetime(2026, 7, 28, 12, 10, 0, 1, tzinfo=timezone.utc),
        )
        self.assertEqual(stale["state"], "stale")
        self.assertEqual(stale["gate"], "blocked")
        self.assertEqual(late["state"], "late-slot")
        self.assertEqual(late["gate"], "blocked")

    def test_utc_boundary_uses_elapsed_time(self):
        result = evaluate_status(
            success_payload(
                checkedAt="2026-07-27T22:00:00.000Z",
                nextRun="2026-07-28T06:00:00.000Z",
            ),
            now=datetime(2026, 7, 28, 6, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(result["gate"], "ready")

    def test_failed_missing_and_public_failure_states_block(self):
        cases = (
            (
                {
                    "schemaVersion": 1,
                    "state": "failed",
                    "failureCode": "transport",
                    "checkedAt": "2026-07-28T06:00:00.000Z",
                },
                "failed",
            ),
            ({"schemaVersion": 1, "state": "missing"}, "missing"),
            ({"schemaVersion": 1, "state": "malformed"}, "malformed"),
            ({"schemaVersion": 1, "state": "unavailable"}, "unavailable"),
            (success_payload(state="stale"), "stale"),
            (success_payload(state="late-slot"), "late-slot"),
        )
        for payload, state in cases:
            with self.subTest(state=state):
                result = evaluate_status(payload, now=NOW)
                self.assertEqual(result["gate"], "blocked")
                self.assertEqual(result["state"], state)

    def test_malformed_or_unexpected_schema_is_redacted(self):
        malformed_values = (
            None,
            [],
            {},
            success_payload(extra="PRIVATE SECRET SENTINEL"),
            success_payload(contractSha256="not-a-hash"),
            success_payload(caseCount=0),
            success_payload(checkedAt="not-a-date"),
            {
                "schemaVersion": 1,
                "state": "failed",
                "failureCode": "PRIVATE SECRET SENTINEL",
                "checkedAt": "2026-07-28T06:00:00.000Z",
            },
        )
        for payload in malformed_values:
            with self.subTest(payload=payload):
                result = evaluate_status(payload, now=NOW)
                self.assertEqual(result["state"], "malformed")
                self.assertNotIn("PRIVATE SECRET SENTINEL", json.dumps(result))

    def test_probe_performs_one_unauthenticated_get_to_exact_endpoint(self):
        response = FixtureResponse(json.dumps(success_payload()).encode())
        opener = FixtureOpener(response)
        receipt = probe_status(PUBLIC_STATUS_URL, opener=opener, now=lambda: NOW)
        self.assertEqual(receipt["gate"], "ready")
        self.assertTrue(response.closed)
        self.assertEqual(len(opener.requests), 1)
        request, timeout = opener.requests[0]
        self.assertEqual(request.full_url, PUBLIC_STATUS_URL)
        self.assertEqual(request.get_method(), "GET")
        self.assertGreater(timeout, 0)
        serialized_headers = json.dumps(dict(request.header_items())).lower()
        self.assertNotIn("authorization", serialized_headers)
        self.assertNotIn("student", serialized_headers)
        self.assertNotIn("passcode", serialized_headers)

    def test_probe_blocks_non_200_invalid_json_content_type_and_unavailable(self):
        cases = (
            FixtureOpener(
                FixtureResponse(
                    json.dumps(success_payload()).encode(),
                    status=503,
                )
            ),
            FixtureOpener(FixtureResponse(b"{", status=200)),
            FixtureOpener(
                FixtureResponse(
                    json.dumps(success_payload()).encode(),
                    content_type="text/html",
                )
            ),
            FixtureOpener(error=OSError("PRIVATE SECRET SENTINEL")),
            FixtureOpener(
                error=HTTPError(
                    PUBLIC_STATUS_URL,
                    503,
                    "PRIVATE SECRET SENTINEL",
                    {},
                    None,
                )
            ),
        )
        expected = (
            "http_status",
            "malformed",
            "content_type",
            "unavailable",
            "http_status",
        )
        for opener, state in zip(cases, expected):
            with self.subTest(state=state):
                result = probe_status(PUBLIC_STATUS_URL, opener=opener, now=lambda: NOW)
                self.assertEqual(result["gate"], "blocked")
                self.assertEqual(result["state"], state)
                self.assertNotIn("PRIVATE SECRET SENTINEL", json.dumps(result))

    def test_probe_rejects_any_other_endpoint_without_requesting_it(self):
        opener = FixtureOpener(FixtureResponse(b"{}"))
        result = probe_status(
            "https://example.invalid/api/sp/health-status",
            opener=opener,
            now=lambda: NOW,
        )
        self.assertEqual(result["state"], "configuration")
        self.assertEqual(opener.requests, [])

    def test_cli_writes_blocked_receipt_and_returns_two(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "receipt.json"
            code = main(
                ["--out", str(output)],
                opener=FixtureOpener(error=OSError("PRIVATE SECRET SENTINEL")),
                now=lambda: NOW,
            )
            self.assertEqual(code, 2)
            receipt = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(receipt["gate"], "blocked")
            self.assertNotIn("PRIVATE SECRET SENTINEL", json.dumps(receipt))


if __name__ == "__main__":
    unittest.main()
