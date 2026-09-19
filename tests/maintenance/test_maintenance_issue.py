import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "13_Faculty_Resources" / "_automation"))

from maintenance.maintenance_issue import (  # noqa: E402
    IssueRoutingError,
    _GitHubIssues,
    route_issue,
)


RUN_URL = "https://github.com/example/repo/actions/runs/1"
ARTIFACT_URL = "https://github.com/example/repo/actions/runs/1/artifacts/2"
DISCLAIMER = (
    "Faculty review remains required. This automation does not attest, approve, "
    "close, or modify content."
)


def governance_report(gate="review"):
    return {
        "schemaVersion": 1,
        "gate": gate,
        "qbank": {
            "counts": {
                "total": 10,
                "draft": 2,
                "attested": 8,
                "ready": 7,
                "warning": 1,
                "blocked": 0,
            },
            "warningCount": 1,
            "blockedIds": [],
        },
        # governance_digest.mjs writes this on every digest since PR 1b; it is what makes
        # `Gate: review` legible when nothing else in the report explains the gate.
        "staleAttestations": {
            "count": 3,
            "slugs": ["agitation.md", "bfcrs.html", "delirium.md"],
        },
        "privateClinicalText": "PRIVATE CLINICAL SENTINEL",
        "reviewerName": "PRIVATE IDENTITY SENTINEL",
        "credential": "PRIVATE SECRET SENTINEL",
    }


def monthly_report(gate="review"):
    return {
        "schemaVersion": 1,
        "gate": gate,
        "evidence": {
            "total": 4,
            "identity": {
                "verified": 1,
                "pending": 1,
                "exception": 1,
                "unknown": 1,
            },
            "facultyReview": {"reviewed": 2, "pending": 1, "unknown": 1},
            "cadence": {"current": 1, "due": 1, "overdue": 1, "unknown": 1},
            "localPolicyDependent": 1,
            "generatedViewsValid": True,
            "surveillanceCredit": {
                "historyPresent": True,
                "baselines": 3,
                "openChangeFindings": 1,
                "sourcesCredited": 2,
            },
        },
        "media": {
            "servedMissingCount": 1,
            "existingDebt": ["PRIVATE PATH SENTINEL"],
            "newRegressions": [],
        },
        "operations": {
            "runbooks": {"total": 2, "current": 1, "stale": 1, "unknown": 0},
            "apaCrosswalkPresent": False,
            "openEvidenceReceipt": "missing",
            "redTeamReceipt": "current",
        },
        "citation": "PRIVATE CLINICAL SENTINEL",
        "credential": "PRIVATE SECRET SENTINEL",
    }


def rotation_report(state="due"):
    return {
        "schemaVersion": 1,
        "state": state,
        "blockId": "rot-2026-hx-a1b2c3d4e5f60718",
        "startsOn": "2026-08-10",
        "endsOn": "2026-09-20",
        "daysUntilStart": 7,
        "manualChecklist": ["PRIVATE UNTRUSTED CHECKLIST SENTINEL"],
        "patient": "PRIVATE CLINICAL SENTINEL",
        "passcode": "PRIVATE SECRET SENTINEL",
    }


class MaintenanceIssueTests(unittest.TestCase):
    def test_governance_review_creates_one_content_free_issue(self):
        created = []
        result = route_issue(
            "governance",
            governance_report(),
            run_url=RUN_URL,
            artifact_url=ARTIFACT_URL,
            list_issues=lambda: [],
            create_issue=lambda payload: created.append(payload) or {"number": 7},
            update_issue=lambda number, payload: self.fail("unexpected update"),
        )
        self.assertEqual(result, {"action": "created", "number": 7})
        self.assertEqual(len(created), 1)
        self.assertIn("<!-- maintenance:governance -->", created[0]["body"])
        self.assertIn(DISCLAIMER, created[0]["body"])
        self.assertIn(RUN_URL, created[0]["body"])
        self.assertIn(ARTIFACT_URL, created[0]["body"])
        self.assertEqual(set(created[0]), {"title", "body", "labels"})
        serialized = json.dumps(created[0])
        for forbidden in (
            "PRIVATE CLINICAL SENTINEL",
            "PRIVATE IDENTITY SENTINEL",
            "PRIVATE SECRET SENTINEL",
        ):
            self.assertNotIn(forbidden, serialized)

    def test_monthly_blocking_report_creates_count_only_issue(self):
        created = []
        result = route_issue(
            "monthly",
            monthly_report("blocked"),
            run_url=RUN_URL,
            artifact_url="",
            list_issues=lambda: [],
            create_issue=lambda payload: created.append(payload) or {"number": 8},
            update_issue=lambda *_args: self.fail("unexpected update"),
        )
        self.assertEqual(result, {"action": "created", "number": 8})
        body = created[0]["body"]
        self.assertIn("<!-- maintenance:monthly -->", body)
        self.assertIn("Artifact: unavailable", body)
        self.assertIn("Evidence records: 4", body)
        self.assertIn("New accessibility regressions: 0", body)
        for forbidden in (
            "PRIVATE PATH SENTINEL",
            "PRIVATE CLINICAL SENTINEL",
            "PRIVATE SECRET SENTINEL",
        ):
            self.assertNotIn(forbidden, body)

    def test_existing_marker_updates_without_state_or_close_payload(self):
        updated = []
        result = route_issue(
            "governance",
            governance_report("blocked"),
            run_url=RUN_URL,
            artifact_url=ARTIFACT_URL,
            list_issues=lambda: [
                {
                    "number": 22,
                    "state": "open",
                    "body": "<!-- maintenance:governance -->\nprior",
                }
            ],
            create_issue=lambda _payload: self.fail("unexpected create"),
            update_issue=lambda number, payload: updated.append((number, payload))
            or {"number": number},
        )
        self.assertEqual(result, {"action": "updated", "number": 22})
        self.assertEqual(updated[0][0], 22)
        self.assertEqual(set(updated[0][1]), {"title", "body"})
        self.assertNotIn("state", updated[0][1])
        self.assertNotIn("closed", json.dumps(updated[0][1]).lower())

    def test_only_exact_first_line_marker_is_authoritative(self):
        created = []
        issues = [
            {
                "number": 20,
                "state": "open",
                "body": "quoted\n<!-- maintenance:governance -->",
            },
            {
                "number": 21,
                "state": "open",
                "body": "prefix <!-- maintenance:governance -->",
            },
            {
                "number": 22,
                "state": "open",
                "body": "<!-- maintenance:governance --> suffix",
            },
        ]
        result = route_issue(
            "governance",
            governance_report(),
            run_url=RUN_URL,
            artifact_url=ARTIFACT_URL,
            list_issues=lambda: issues,
            create_issue=lambda payload: created.append(payload) or {"number": 23},
            update_issue=lambda *_args: self.fail("unexpected update"),
        )
        self.assertEqual(result, {"action": "created", "number": 23})
        self.assertEqual(len(created), 1)

    def test_issue_listing_finds_marker_after_label_removal(self):
        marker_issue = {
            "number": 22,
            "state": "open",
            "body": "<!-- maintenance:governance -->\nprior",
            "labels": [],
        }

        class Response:
            status = 200

            def read(self, size):
                self.assertion = size
                return json.dumps([marker_issue]).encode("utf-8")

            def close(self):
                self.closed = True

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        class Opener:
            def __init__(self):
                self.requests = []

            def open(self, request, timeout):
                self.requests.append((request, timeout))
                return Response()

        opener = Opener()
        try:
            client = _GitHubIssues(
                "example/repo",
                "PRIVATE TOKEN SENTINEL",
                opener=opener,
            )
        except TypeError as exc:
            self.fail(f"GitHub issue client does not accept an opener: {exc}")
        updated = []
        result = route_issue(
            "governance",
            governance_report("blocked"),
            run_url=RUN_URL,
            artifact_url=ARTIFACT_URL,
            list_issues=client.list,
            create_issue=lambda _payload: self.fail("unexpected create"),
            update_issue=lambda number, payload: updated.append((number, payload))
            or {"number": number},
        )
        self.assertEqual(result, {"action": "updated", "number": 22})
        self.assertEqual(updated[0][0], 22)
        query = parse_qs(urlsplit(opener.requests[0][0].full_url).query)
        self.assertEqual(
            query,
            {"state": ["open"], "per_page": ["100"], "page": ["1"]},
        )

    def test_default_client_rejects_redirect_without_forwarding_authorization(self):
        source_headers = []
        sink_headers = []

        class SinkHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                sink_headers.append(self.headers.get("Authorization"))
                body = b"[]"
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, _format, *_args):
                return

        sink = ThreadingHTTPServer(("127.0.0.1", 0), SinkHandler)

        class SourceHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                source_headers.append(self.headers.get("Authorization"))
                self.send_response(302)
                self.send_header(
                    "Location",
                    f"http://127.0.0.1:{sink.server_port}/target",
                )
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, _format, *_args):
                return

        source = ThreadingHTTPServer(("127.0.0.1", 0), SourceHandler)
        threads = [
            threading.Thread(target=server.serve_forever, daemon=True)
            for server in (source, sink)
        ]
        for thread in threads:
            thread.start()
        try:
            client = _GitHubIssues("example/repo", "PRIVATE TOKEN SENTINEL")
            client.base = f"http://127.0.0.1:{source.server_port}/issues"
            with self.assertRaises(IssueRoutingError):
                client.list()
        finally:
            for server in (source, sink):
                server.shutdown()
                server.server_close()
            for thread in threads:
                thread.join(timeout=2)

        self.assertEqual(source_headers, ["Bearer PRIVATE TOKEN SENTINEL"])
        self.assertEqual(sink_headers, [])

    def test_two_open_marker_matches_fail_closed(self):
        issues = [
            {"number": 1, "state": "open", "body": "<!-- maintenance:monthly -->"},
            {"number": 2, "state": "open", "body": "<!-- maintenance:monthly -->"},
        ]
        with self.assertRaisesRegex(IssueRoutingError, "ambiguous"):
            route_issue(
                "monthly",
                monthly_report(),
                run_url=RUN_URL,
                artifact_url=ARTIFACT_URL,
                list_issues=lambda: issues,
                create_issue=lambda _payload: self.fail("unexpected create"),
                update_issue=lambda *_args: self.fail("unexpected update"),
            )

    def test_closed_issues_and_pull_requests_do_not_match(self):
        created = []
        issues = [
            {
                "number": 1,
                "state": "closed",
                "body": "<!-- maintenance:governance -->",
            },
            {
                "number": 2,
                "state": "open",
                "body": "<!-- maintenance:governance -->",
                "pull_request": {"url": "https://api.github.invalid/pulls/2"},
            },
        ]
        route_issue(
            "governance",
            governance_report(),
            run_url=RUN_URL,
            artifact_url=ARTIFACT_URL,
            list_issues=lambda: issues,
            create_issue=lambda payload: created.append(payload) or {"number": 3},
            update_issue=lambda *_args: self.fail("unexpected update"),
        )
        self.assertEqual(len(created), 1)

    def test_ready_and_non_actionable_rotation_states_create_no_issue(self):
        cases = (
            ("governance", governance_report("ready")),
            ("monthly", monthly_report("ready")),
            ("rotation", rotation_report("not_due")),
            ("rotation", rotation_report("configuration_required")),
            ("rotation", rotation_report("active")),
            ("rotation", rotation_report("complete")),
        )
        for kind, report in cases:
            with self.subTest(kind=kind, state=report.get("state", report.get("gate"))):
                result = route_issue(
                    kind,
                    report,
                    run_url=RUN_URL,
                    artifact_url=ARTIFACT_URL,
                    list_issues=lambda: self.fail("no issue lookup needed"),
                    create_issue=lambda _payload: self.fail("unexpected create"),
                    update_issue=lambda *_args: self.fail("unexpected update"),
                )
                self.assertEqual(result, {"action": "none"})

    def test_due_and_overdue_rotation_use_opaque_id_marker_and_fixed_checklist(self):
        for state in ("due", "overdue"):
            with self.subTest(state=state):
                created = []
                route_issue(
                    "rotation",
                    rotation_report(state),
                    run_url=RUN_URL,
                    artifact_url=ARTIFACT_URL,
                    list_issues=lambda: [],
                    create_issue=lambda payload: created.append(payload)
                    or {"number": 9},
                    update_issue=lambda *_args: self.fail("unexpected update"),
                )
                body = created[0]["body"]
                self.assertIn(
                    "<!-- maintenance:rotation:id=rot-2026-hx-a1b2c3d4e5f60718 -->",
                    body,
                )
                self.assertIn("issue a new non-identifying SP_ROTATION_ID", body)
                self.assertNotIn("PRIVATE UNTRUSTED CHECKLIST SENTINEL", body)
                self.assertNotIn("PRIVATE CLINICAL SENTINEL", body)
                self.assertNotIn("PRIVATE SECRET SENTINEL", body)

    def _governance_body(self, report):
        created = []
        route_issue(
            "governance",
            report,
            run_url=RUN_URL,
            artifact_url=ARTIFACT_URL,
            list_issues=lambda: [],
            create_issue=lambda payload: created.append(payload) or {"number": 3},
            update_issue=lambda number, payload: self.fail("unexpected update"),
        )
        self.assertEqual(len(created), 1)
        return created[0]["body"]

    def test_governance_body_names_the_stale_attestation_count_and_first_slugs(self):
        # A routed `Gate: review` that does not say WHY is an issue nobody can act on: the
        # question counts alone are clean here, so the stale queue is the only thing that
        # opened it.
        body = self._governance_body(governance_report())
        self.assertIn("Gate: review", body)
        self.assertIn(
            "Stale attestations: 3 (agitation.md, bfcrs.html, delirium.md)", body
        )

    def test_governance_body_truncates_a_long_stale_list_and_says_how_many_are_hidden(self):
        slugs = [f"page{index:02d}.md" for index in range(12)]
        body = self._governance_body(
            {
                **governance_report(),
                "staleAttestations": {"count": len(slugs), "slugs": slugs},
            }
        )
        self.assertIn(
            "Stale attestations: 12 (page00.md, page01.md, page02.md, page03.md, "
            "page04.md; 7 more)",
            body,
        )
        self.assertNotIn("page05.md", body)

    def test_governance_body_reports_a_missing_stale_summary_as_unknown_never_zero(self):
        # An older digest artifact has no staleAttestations key. Rendering that as 0 would say
        # the queue is empty when nothing measured it -- the failure mode CLAUDE.md's queue rule
        # names ("a measurement that fails reports unknown, never zero").
        report = {key: value for key, value in governance_report().items()
                  if key != "staleAttestations"}
        body = self._governance_body(report)
        self.assertIn("Stale attestations: not reported", body)
        self.assertNotIn("Stale attestations: 0", body)

    def test_unsafe_stale_attestation_summaries_fail_closed(self):
        for stale in (
            [],
            {"count": 3},
            {"count": -1, "slugs": []},
            {"count": 1, "slugs": ["../../etc/passwd"]},
            {"count": 1, "slugs": "agitation.md"},
            {"count": 2, "slugs": ["agitation.md"]},
            {"count": 1, "slugs": ["slug with whitespace"]},
        ):
            with self.subTest(stale=stale):
                with self.assertRaises(IssueRoutingError):
                    self._governance_body(
                        {**governance_report(), "staleAttestations": stale}
                    )

    def test_unsafe_rotation_id_dates_counts_and_links_fail_closed(self):
        bad_reports = [
            ("rotation", {**rotation_report(), "blockId": "rot-2026-joshua"}),
            ("rotation", {**rotation_report(), "startsOn": "not-a-date"}),
            (
                "governance",
                {
                    **governance_report(),
                    "qbank": {
                        "counts": {
                            **governance_report()["qbank"]["counts"],
                            "warning": -1,
                        },
                        "warningCount": 1,
                        "blockedIds": [],
                    },
                },
            ),
            (
                "governance",
                {
                    **governance_report(),
                    "qbank": {
                        **governance_report()["qbank"],
                        "blockedIds": ["unsafe id with whitespace"],
                    },
                },
            ),
        ]
        for kind, report in bad_reports:
            with self.subTest(kind=kind):
                with self.assertRaises(IssueRoutingError):
                    route_issue(
                        kind,
                        report,
                        run_url=RUN_URL,
                        artifact_url=ARTIFACT_URL,
                        list_issues=lambda: [],
                        create_issue=lambda _payload: {"number": 1},
                        update_issue=lambda *_args: {"number": 1},
                    )
        with self.assertRaisesRegex(IssueRoutingError, "URL"):
            route_issue(
                "governance",
                governance_report(),
                run_url="javascript:alert(1)",
                artifact_url=ARTIFACT_URL,
                list_issues=lambda: [],
                create_issue=lambda _payload: {"number": 1},
                update_issue=lambda *_args: {"number": 1},
            )
        with self.assertRaisesRegex(IssueRoutingError, "URL"):
            route_issue(
                "governance",
                governance_report(),
                run_url=f"{RUN_URL}?token=PRIVATE_SECRET_SENTINEL",
                artifact_url=ARTIFACT_URL,
                list_issues=lambda: [],
                create_issue=lambda _payload: {"number": 1},
                update_issue=lambda *_args: {"number": 1},
            )


    def test_monthly_body_states_how_many_reviews_surveillance_credited(self):
        """The cadence figure is now net of surveillance credit, so the body says so.

        Without it a reader watching "due or overdue" fall has no way to tell work the
        job did from findings somebody quietly dismissed.
        """
        created = []
        route_issue(
            "monthly",
            monthly_report(),
            run_url=RUN_URL,
            artifact_url=ARTIFACT_URL,
            list_issues=lambda: [],
            create_issue=lambda payload: created.append(payload) or {"number": 11},
            update_issue=lambda number, payload: self.fail("unexpected update"),
        )
        self.assertIn(
            "Reviews credited to guideline surveillance: 2",
            created[0]["body"],
        )

    def test_a_monthly_report_without_the_credit_block_is_malformed(self):
        """Strict, like every other figure in this body: absent is not zero.

        A report predating the credit rule would otherwise render a confident
        `credited: 0` beside a cadence count that never considered credit at all.
        """
        report = monthly_report()
        del report["evidence"]["surveillanceCredit"]
        with self.assertRaisesRegex(
            IssueRoutingError,
            "surveillance credit is invalid",
        ):
            route_issue(
                "monthly",
                report,
                run_url=RUN_URL,
                artifact_url=ARTIFACT_URL,
                list_issues=lambda: [],
                create_issue=lambda payload: self.fail("unexpected create"),
                update_issue=lambda number, payload: self.fail("unexpected update"),
            )


if __name__ == "__main__":
    unittest.main()
