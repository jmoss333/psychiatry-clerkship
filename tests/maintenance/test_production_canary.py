import copy
import json
import sys
import tempfile
import threading
import unittest
from email.message import Message
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError
from urllib.request import Request


ROOT = Path(__file__).resolve().parents[2]
AUTOMATION = ROOT / "13_Faculty_Resources" / "_automation"
sys.path.insert(0, str(AUTOMATION))

from maintenance import production_canary


NOW = lambda: "2026-07-28T12:00:00+00:00"
SOURCE_SHA = "a" * 40
MEDIA_PATH = "audio/sample.m4a"
MEDIA_PREFIX = b"M" * 512
NAV_BYTES = json.dumps(
    [
        {
            "section": "Orientation",
            "items": [
                {"t": "Welcome", "f": "welcome.md", "k": "md"},
                {
                    "t": "Hidden but shipped",
                    "f": "hidden.html",
                    "k": "tool",
                    "hidden": True,
                },
            ],
        },
        {
            "section": "Practice",
            "items": [{"t": "Quiz", "f": "quiz.html", "k": "tool"}],
        },
    ],
    separators=(",", ":"),
).encode()
SEARCH_BYTES = json.dumps(
    {
        "version": 1,
        "n": 1,
        "docs": [
            {
                "t": "Welcome",
                "f": "welcome.md",
                "k": "md",
                "sec": "Orientation",
                "snip": "Synthetic fixture",
            }
        ],
        "synonyms": {"welcome": ["orientation", "introduction"]},
        "postings": {"welcome": [[0, 4]]},
        "df": {"welcome": 1},
    },
    separators=(",", ":"),
).encode()
PACK = {
    "schemaVersion": 1,
    "version": "0.1.0",
    "status": "draft-pending-attestation",
    "engine": {"modelPinned": "fixture-model-1"},
    "cases": [{"id": "synthetic-case"}],
}
CONFIG = {
    "schemaVersion": 1,
    "sites": [
        {
            "name": "ms3",
            "baseUrl": "https://une-ms3-psychiatry.netlify.app",
            "siteId": "94717a39-679b-4c78-ae02-7b19e809592e",
        },
        {
            "name": "res",
            "baseUrl": "https://mmc-psychiatry-residents-sanford.netlify.app",
            "siteId": "af64d5d4-e0b5-4f03-9857-be40e3b48329",
        },
    ],
    "spProxy": {
        "baseUrl": "https://sp-interview-proxy.netlify.app",
        "siteId": "455d2740-4020-4d9c-b9f8-82f72f4b2897",
    },
}
CSP = (
    "default-src 'self'; "
    "img-src 'self' data:; "
    "media-src 'self' blob: https://sp-interview-proxy.netlify.app; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self' 'unsafe-inline'; "
    "connect-src 'self' https://sp-interview-proxy.netlify.app; "
    "frame-src 'self'; "
    "frame-ancestors 'self' https://clerkship-faculty-attest.netlify.app"
)


def manifest_for(path=MEDIA_PATH, *, served=True):
    return {
        "_note": "Synthetic media fixture",
        "audio": [{"file": path, "served": served}],
        "video": [],
    }


def response_spec(status, body=b"", headers=None, *, max_read=None):
    return {
        "status": status,
        "body": body,
        "headers": headers or {},
        "max_read": max_read,
    }


def valid_responses(*, media_body=MEDIA_PREFIX, media_etag='"media-v1"'):
    responses = {}
    for site in CONFIG["sites"]:
        base = site["baseUrl"]
        responses[f"{base}/"] = response_spec(
            200,
            headers={
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=0, must-revalidate",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                "Content-Security-Policy": CSP,
            },
        )
        responses[f"{base}/nav.json"] = response_spec(
            200,
            NAV_BYTES,
            {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=0, must-revalidate",
            },
        )
        responses[f"{base}/search-index.json"] = response_spec(
            200,
            SEARCH_BYTES,
            {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "public, max-age=86400",
            },
        )
        responses[f"{base}/{MEDIA_PATH}"] = response_spec(
            206,
            media_body,
            {
                "Content-Type": "audio/mp4",
                "Cache-Control": "public, max-age=604800",
                "Content-Range": "bytes 0-511/2048",
                "Content-Length": "512",
                "ETag": media_etag,
            },
            max_read=512,
        )
    return responses


class FixtureResponse:
    def __init__(self, spec):
        self.status = spec["status"]
        self.headers = Message()
        header_items = (
            spec["headers"].items()
            if isinstance(spec["headers"], dict)
            else spec["headers"]
        )
        for name, value in header_items:
            self.headers[name] = value
        self._body = spec["body"]
        self._offset = 0
        self._max_read = spec["max_read"]
        self.closed = False

    def read(self, size=-1):
        if self._max_read is not None and (size < 0 or size > self._max_read):
            raise AssertionError(f"read must be bounded to {self._max_read} bytes")
        if size is None or size < 0:
            size = len(self._body) - self._offset
        chunk = self._body[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.close()
        return False


class FixtureOpener:
    def __init__(self, responses):
        self.responses = responses
        self.opened = []

    def open(self, request, timeout):
        spec = self.responses.get(request.full_url)
        if spec is None:
            raise AssertionError(f"unexpected URL: {request.full_url}")
        if spec["max_read"] is not None and request.get_header("Range") != "bytes=0-511":
            return FixtureResponse(
                response_spec(
                    416,
                    headers={
                        "Content-Type": "text/plain",
                        "Cache-Control": "no-store",
                    },
                )
            )
        response = FixtureResponse(copy.deepcopy(spec))
        self.opened.append(response)
        return response


class ProductionCanaryTests(unittest.TestCase):
    def setUp(self):
        self._temp = tempfile.TemporaryDirectory()
        self.temp_dir = Path(self._temp.name)
        self.manifest_path = self.temp_dir / "media_manifest.json"
        self.pack_path = self.temp_dir / "sp-interview.pack.json"
        self.write_manifest(manifest_for())
        self.pack_bytes = json.dumps(PACK, separators=(",", ":")).encode()
        self.pack_path.write_bytes(self.pack_bytes)

    def tearDown(self):
        self._temp.cleanup()

    def write_manifest(self, manifest):
        self.manifest_path.write_text(
            json.dumps(manifest, separators=(",", ":")),
            encoding="utf-8",
        )

    def run_probe(self, responses=None, *, config=None, source_sha=SOURCE_SHA):
        opener = FixtureOpener(responses or valid_responses())
        with (
            mock.patch.object(
                production_canary,
                "MEDIA_MANIFEST_PATH",
                self.manifest_path,
            ),
            mock.patch.object(production_canary, "SP_PACK_PATH", self.pack_path),
        ):
            receipt = production_canary.probe(
                copy.deepcopy(config or CONFIG),
                opener=opener,
                now=NOW,
                source_sha=source_sha,
            )
        return receipt, opener

    def mutate_all(self, responses, suffix, mutation):
        for url, spec in responses.items():
            if url.endswith(suffix):
                mutation(spec)
        return responses

    def assert_probe_error(self, regex, responses=None, *, config=None):
        with self.assertRaisesRegex(production_canary.CanaryError, regex):
            self.run_probe(responses, config=config)

    def test_release_twin_is_content_free_deterministic_and_schema_exact(self):
        first, _ = self.run_probe()
        second, _ = self.run_probe()
        self.assertEqual(first, second)
        self.assertEqual(first["schemaVersion"], 1)
        self.assertEqual(first["generatedAt"], NOW())
        self.assertEqual(first["sourceSha"], SOURCE_SHA)
        self.assertEqual(first["sites"][0]["navSha256"], sha256(NAV_BYTES).hexdigest())
        self.assertEqual(
            first["sites"][0]["searchSha256"],
            sha256(SEARCH_BYTES).hexdigest(),
        )
        self.assertEqual(first["sites"][0]["navItemCount"], 3)
        self.assertEqual(first["sites"][0]["mediaChecked"], 1)
        prefix_hash = sha256(MEDIA_PREFIX).hexdigest()
        record = f'{MEDIA_PATH}|2048|"media-v1"|{prefix_hash}'
        self.assertEqual(
            first["sites"][0]["mediaIntegrityAggregateSha256"],
            sha256(record.encode()).hexdigest(),
        )
        self.assertEqual(
            set(first),
            {"schemaVersion", "generatedAt", "sourceSha", "sites", "expectedSp"},
        )
        self.assertEqual(
            set(first["sites"][0]),
            {
                "name",
                "baseUrl",
                "navSha256",
                "searchSha256",
                "navItemCount",
                "mediaChecked",
                "mediaIntegrityAggregateSha256",
            },
        )
        self.assertEqual(
            set(first["expectedSp"]),
            {
                "packSha256",
                "packVersion",
                "packStatus",
                "learnerReady",
                "actorModel",
                "evaluatorModel",
            },
        )
        self.assertEqual(first["expectedSp"]["packSha256"], sha256(self.pack_bytes).hexdigest())
        self.assertEqual(first["expectedSp"]["packVersion"], "0.1.0")
        self.assertEqual(
            first["expectedSp"]["packStatus"],
            "draft-pending-attestation",
        )
        self.assertFalse(first["expectedSp"]["learnerReady"])
        self.assertEqual(first["expectedSp"]["actorModel"], "fixture-model-1")
        self.assertEqual(first["expectedSp"]["evaluatorModel"], "fixture-model-1")
        serialized = json.dumps(first).lower()
        self.assertNotIn("content", serialized)
        self.assertNotIn("test-only-passcode", serialized)

    def test_reviewed_and_attested_packs_are_learner_ready(self):
        for status in ("reviewed", "attested"):
            with self.subTest(status=status):
                pack = copy.deepcopy(PACK)
                pack["status"] = status
                self.pack_bytes = json.dumps(pack, separators=(",", ":")).encode()
                self.pack_path.write_bytes(self.pack_bytes)
                receipt, _ = self.run_probe()
                self.assertTrue(receipt["expectedSp"]["learnerReady"])

    def test_lfs_pointer_prefix_is_a_hard_failure(self):
        responses = valid_responses(
            media_body=b"version https://git-lfs.github.com/spec/v1\n",
        )
        self.assert_probe_error("Git LFS pointer", responses)

    def test_root_security_headers_are_required_and_csp_is_parsed(self):
        missing_headers = (
            "X-Content-Type-Options",
            "Referrer-Policy",
            "Content-Security-Policy",
        )
        for header in missing_headers:
            with self.subTest(header=header):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    "/",
                    lambda spec, header=header: spec["headers"].pop(header),
                )
                self.assert_probe_error("header|policy|CSP", responses)

        bad_csp_values = (
            CSP.replace("default-src 'self'", "default-src https:"),
            CSP.replace("frame-ancestors 'self'", "frame-ancestors *"),
            CSP.replace(
                "connect-src 'self' https://sp-interview-proxy.netlify.app",
                "connect-src 'self'",
            ),
            CSP.replace("script-src 'self' 'unsafe-inline'", "script-src 'none'"),
        )
        for csp in bad_csp_values:
            with self.subTest(csp=csp):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    "/",
                    lambda spec, csp=csp: spec["headers"].__setitem__(
                        "Content-Security-Policy",
                        csp,
                    ),
                )
                self.assert_probe_error("CSP", responses)

    def test_cache_contracts_are_parsed_for_every_surface(self):
        cases = (
            ("/", "public, max-age=60, must-revalidate"),
            ("/nav.json", "public, max-age=86400"),
            ("/search-index.json", "public, max-age=0"),
            (f"/{MEDIA_PATH}", "public, max-age=0"),
        )
        for suffix, value in cases:
            with self.subTest(suffix=suffix):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    suffix,
                    lambda spec, value=value: spec["headers"].__setitem__(
                        "Cache-Control",
                        value,
                    ),
                )
                self.assert_probe_error("Cache-Control", responses)

    def test_duplicate_critical_headers_are_rejected(self):
        cases = (
            ("/", "Content-Type"),
            ("/", "Cache-Control"),
            ("/", "X-Content-Type-Options"),
            ("/", "Referrer-Policy"),
            ("/", "Content-Security-Policy"),
            ("/nav.json", "Content-Type"),
            ("/nav.json", "Cache-Control"),
            ("/search-index.json", "Content-Type"),
            ("/search-index.json", "Cache-Control"),
            (f"/{MEDIA_PATH}", "Content-Type"),
            (f"/{MEDIA_PATH}", "Cache-Control"),
            (f"/{MEDIA_PATH}", "Content-Range"),
            (f"/{MEDIA_PATH}", "ETag"),
        )
        for suffix, header in cases:
            with self.subTest(suffix=suffix, header=header):
                responses = valid_responses()

                def duplicate(spec, header=header):
                    original = spec["headers"][header]
                    spec["headers"] = [
                        *spec["headers"].items(),
                        (header, original),
                    ]

                self.mutate_all(responses, suffix, duplicate)
                self.assert_probe_error("exactly once", responses)

    def test_nav_and_search_bodies_are_bounded_with_or_without_content_length(self):
        for suffix in ("/nav.json", "/search-index.json"):
            with self.subTest(content_length=suffix):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    suffix,
                    lambda spec: spec["headers"].__setitem__(
                        "Content-Length",
                        "999999999",
                    ),
                )
                self.assert_probe_error("too large", responses)

        responses = valid_responses()
        oversized = b"x" * 8_388_609
        self.mutate_all(
            responses,
            "/nav.json",
            lambda spec: spec.__setitem__("body", oversized),
        )
        self.assert_probe_error("too large", responses)

    def test_root_nav_and_search_require_success_and_json_content_types(self):
        for suffix in ("/", "/nav.json", "/search-index.json"):
            with self.subTest(status=suffix):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    suffix,
                    lambda spec: spec.__setitem__("status", 503),
                )
                self.assert_probe_error("HTTP", responses)
        for suffix in ("/nav.json", "/search-index.json"):
            with self.subTest(content_type=suffix):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    suffix,
                    lambda spec: spec["headers"].__setitem__(
                        "Content-Type",
                        "text/plain",
                    ),
                )
                self.assert_probe_error("Content-Type", responses)

    def test_malformed_or_empty_nav_is_rejected(self):
        invalid_nav = (
            b"{",
            b"{}",
            b"[]",
            b'[{"section":"Only","items":[]}]',
            b'[{"section":"Only","items":"not-an-array"}]',
            b'[{"section":"Only","items":[{}]}]',
            b'[{"section":"Only","items":[{"t":"","f":"x.md","k":"md"}]}]',
        )
        for body in invalid_nav:
            with self.subTest(body=body):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    "/nav.json",
                    lambda spec, body=body: spec.__setitem__("body", body),
                )
                self.assert_probe_error("nav.json", responses)

    def test_search_index_fields_are_validated_independently(self):
        valid = json.loads(SEARCH_BYTES)
        mutations = [
            ("version", lambda value: value.__setitem__("version", 2)),
            ("n", lambda value: value.__setitem__("n", "1")),
            ("n mismatch", lambda value: value.__setitem__("n", 2)),
            ("docs", lambda value: value.__setitem__("docs", [])),
            ("doc identity", lambda value: value.__setitem__("docs", [{}])),
            ("missing synonyms", lambda value: value.pop("synonyms")),
            ("synonyms object", lambda value: value.__setitem__("synonyms", [])),
            (
                "synonym term",
                lambda value: value.__setitem__("synonyms", {" ": ["orientation"]}),
            ),
            (
                "synonym array",
                lambda value: value.__setitem__("synonyms", {"welcome": "orientation"}),
            ),
            (
                "empty synonym array",
                lambda value: value.__setitem__("synonyms", {"welcome": []}),
            ),
            (
                "blank synonym",
                lambda value: value.__setitem__("synonyms", {"welcome": [" "]}),
            ),
            (
                "non-string synonym",
                lambda value: value.__setitem__("synonyms", {"welcome": [7]}),
            ),
            ("postings", lambda value: value.__setitem__("postings", {})),
            (
                "empty posting list",
                lambda value: value.__setitem__("postings", {"welcome": []}),
            ),
            (
                "posting pair",
                lambda value: value.__setitem__("postings", {"welcome": [[0]]}),
            ),
            (
                "posting object",
                lambda value: value.__setitem__("postings", {"welcome": [{"id": 0}]}),
            ),
            (
                "string document id",
                lambda value: value.__setitem__("postings", {"welcome": [["0", 4]]}),
            ),
            (
                "boolean document id",
                lambda value: value.__setitem__("postings", {"welcome": [[True, 4]]}),
            ),
            (
                "negative document id",
                lambda value: value.__setitem__("postings", {"welcome": [[-1, 4]]}),
            ),
            (
                "out-of-range document id",
                lambda value: value.__setitem__("postings", {"welcome": [[1, 4]]}),
            ),
            (
                "zero term frequency",
                lambda value: value.__setitem__("postings", {"welcome": [[0, 0]]}),
            ),
            (
                "boolean term frequency",
                lambda value: value.__setitem__("postings", {"welcome": [[0, True]]}),
            ),
            (
                "fractional term frequency",
                lambda value: value.__setitem__("postings", {"welcome": [[0, 1.5]]}),
            ),
            (
                "string term frequency",
                lambda value: value.__setitem__("postings", {"welcome": [[0, "4"]]}),
            ),
            ("df", lambda value: value.__setitem__("df", {})),
            (
                "df extra term",
                lambda value: value.__setitem__(
                    "df",
                    {"welcome": 1, "unexpected": 1},
                ),
            ),
            (
                "df count mismatch",
                lambda value: value.__setitem__("df", {"welcome": 2}),
            ),
            (
                "df zero",
                lambda value: value.__setitem__("df", {"welcome": 0}),
            ),
            (
                "df boolean",
                lambda value: value.__setitem__("df", {"welcome": True}),
            ),
        ]
        for field in ("t", "f", "k", "sec", "snip"):
            mutations.append(
                (
                    f"missing doc {field}",
                    lambda value, field=field: value["docs"][0].pop(field),
                )
            )
        for field in ("t", "f", "k", "sec"):
            mutations.append(
                (
                    f"blank doc {field}",
                    lambda value, field=field: value["docs"][0].__setitem__(field, " "),
                )
            )
        mutations.append(
            (
                "non-string doc snip",
                lambda value: value["docs"][0].__setitem__("snip", None),
            )
        )
        for label, mutation in mutations:
            with self.subTest(label=label):
                body = copy.deepcopy(valid)
                mutation(body)
                responses = valid_responses()
                encoded = json.dumps(body, separators=(",", ":")).encode()
                self.mutate_all(
                    responses,
                    "/search-index.json",
                    lambda spec, encoded=encoded: spec.__setitem__("body", encoded),
                )
                self.assert_probe_error("search-index.json", responses)

        two_docs = copy.deepcopy(valid)
        two_docs["n"] = 2
        two_docs["docs"].append(
            {
                "t": "Quiz",
                "f": "quiz.html",
                "k": "tool",
                "sec": "Practice",
                "snip": "",
            }
        )
        impossible_postings = (
            ("duplicate ids", [[0, 4], [0, 2]]),
            ("descending ids", [[1, 2], [0, 4]]),
        )
        for label, postings in impossible_postings:
            with self.subTest(label=label):
                body = copy.deepcopy(two_docs)
                body["postings"] = {"welcome": postings}
                body["df"] = {"welcome": 2}
                responses = valid_responses()
                encoded = json.dumps(body, separators=(",", ":")).encode()
                self.mutate_all(
                    responses,
                    "/search-index.json",
                    lambda spec, encoded=encoded: spec.__setitem__("body", encoded),
                )
                self.assert_probe_error("search-index.json", responses)

        for body in (b"{", b"{}", b"[]"):
            with self.subTest(body=body):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    "/search-index.json",
                    lambda spec, body=body: spec.__setitem__("body", body),
                )
                self.assert_probe_error("search-index.json", responses)

    def test_media_status_and_content_type_are_strict(self):
        for status in (302, 404, 500):
            with self.subTest(status=status):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    f"/{MEDIA_PATH}",
                    lambda spec, status=status: spec.__setitem__("status", status),
                )
                self.assert_probe_error("media HTTP", responses)
        for content_type in ("application/octet-stream", "text/html", ""):
            with self.subTest(content_type=content_type):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    f"/{MEDIA_PATH}",
                    lambda spec, content_type=content_type: spec["headers"].__setitem__(
                        "Content-Type",
                        content_type,
                    ),
                )
                self.assert_probe_error("media Content-Type", responses)

    def test_media_requires_one_quoted_strong_etag(self):
        for etag in (
            None,
            "",
            'W/"weak"',
            "unquoted",
            '""',
            '"one", "two"',
            '"ambiguous|etag"',
            '"control\tetag"',
            '"delete\x7fetag"',
        ):
            with self.subTest(etag=etag):
                responses = valid_responses()

                def mutate(spec, etag=etag):
                    if etag is None:
                        spec["headers"].pop("ETag")
                    else:
                        spec["headers"]["ETag"] = etag

                self.mutate_all(responses, f"/{MEDIA_PATH}", mutate)
                self.assert_probe_error("ETag", responses)

    def test_content_range_is_anchored_and_full_length_is_plausible(self):
        invalid_ranges = (
            "",
            "bytes 0-510/2048",
            "bytes 1-512/2048",
            "bytes 0-511/*",
            "bytes 0-511/512",
            "bytes 0-511/100",
            "bytes 0-511/2048 trailing",
            "0-511/2048",
        )
        for value in invalid_ranges:
            with self.subTest(value=value):
                responses = valid_responses()
                self.mutate_all(
                    responses,
                    f"/{MEDIA_PATH}",
                    lambda spec, value=value: spec["headers"].__setitem__(
                        "Content-Range",
                        value,
                    ),
                )
                self.assert_probe_error("Content-Range", responses)

    def test_media_prefix_must_fill_the_requested_range(self):
        responses = valid_responses(media_body=b"M" * 511)
        self.assert_probe_error("512-byte", responses)

    def test_media_requests_use_a_bounded_range_and_all_responses_close(self):
        receipt, opener = self.run_probe()
        self.assertEqual(receipt["sites"][0]["mediaChecked"], 1)
        self.assertTrue(opener.opened)
        self.assertTrue(all(response.closed for response in opener.opened))

    def test_duplicate_and_unsafe_media_paths_are_rejected(self):
        duplicate = manifest_for()
        duplicate["video"].append({"file": MEDIA_PATH, "served": True})
        self.write_manifest(duplicate)
        self.assert_probe_error("duplicate media path")

        unsafe_paths = (
            "../audio/sample.m4a",
            "/audio/sample.m4a",
            "audio/../sample.m4a",
            "audio/%2e%2e/sample.m4a",
            "audio/sample.m4a?download=1",
            "audio/sample.m4a#fragment",
            r"audio\sample.m4a",
            "audio/ambiguous|sample.m4a",
            "other/sample.m4a",
        )
        for path in unsafe_paths:
            with self.subTest(path=path):
                self.write_manifest(manifest_for(path))
                self.assert_probe_error("media path")

    def test_only_literal_true_selects_media_and_at_least_one_asset_is_checked(self):
        manifest = manifest_for()
        manifest["audio"].extend(
            [
                {"file": "audio/not-served-false.m4a", "served": False},
                {"file": "audio/not-served-null.m4a", "served": None},
                {"file": "audio/not-served-one.m4a", "served": 1},
                {"file": "audio/not-served-string.m4a", "served": "true"},
                {
                    "file": "legacy/source-page.html#not-a-deployed-media-path",
                    "served": False,
                },
            ]
        )
        self.write_manifest(manifest)
        receipt, _ = self.run_probe()
        self.assertEqual(receipt["sites"][0]["mediaChecked"], 1)

        self.write_manifest(
            {
                "_note": "Synthetic media fixture",
                "audio": [
                    {"file": MEDIA_PATH, "served": False},
                    {"file": "audio/not-served-null.m4a", "served": None},
                    {"file": "audio/not-served-one.m4a", "served": 1},
                ],
                "video": [],
            }
        )
        self.assert_probe_error("served media", valid_responses())

    def test_rejects_invalid_source_sha(self):
        for value in ("not-a-sha", "A" * 40, "a" * 39, "a" * 41, None):
            with self.subTest(value=value):
                with self.assertRaisesRegex(production_canary.CanaryError, "source SHA"):
                    self.run_probe(source_sha=value)

    def test_base_urls_reject_non_https_credentials_queries_and_fragments(self):
        invalid_urls = (
            "http://example.test",
            "https://user:secret@example.test",
            "https://example.test?query=1",
            "https://example.test#fragment",
        )
        for value in invalid_urls:
            with self.subTest(value=value):
                config = copy.deepcopy(CONFIG)
                config["sites"][0]["baseUrl"] = value
                self.assert_probe_error("HTTPS URL", config=config)

    def test_default_opener_rejects_redirect_without_requesting_location(self):
        hits = {"/start": 0, "/target": 0}

        class RedirectDiagnosticHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                hits[self.path] = hits.get(self.path, 0) + 1
                if self.path == "/start":
                    self.send_response(302)
                    self.send_header(
                        "Location",
                        f"http://127.0.0.1:{self.server.server_port}/target",
                    )
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                if self.path == "/target":
                    self.send_response(200)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                self.send_error(404)

            def log_message(self, format, *args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), RedirectDiagnosticHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        response = None
        error = None
        try:
            request = Request(f"http://127.0.0.1:{server.server_port}/start")
            try:
                response = production_canary._open_response(
                    production_canary.build_opener(),
                    request,
                    "redirect diagnostic",
                )
            except production_canary.CanaryError as exc:
                error = exc
        finally:
            if response is not None:
                response.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

        self.assertIsNotNone(error, "the production opener followed a redirect")
        self.assertEqual(hits, {"/start": 1, "/target": 0})
        self.assertIsInstance(error.__cause__, HTTPError)
        self.assertTrue(error.__cause__.closed)

    def test_pack_and_model_metadata_are_required(self):
        mutations = (
            ("version", lambda pack: pack.pop("version")),
            ("status", lambda pack: pack.pop("status")),
            ("known status", lambda pack: pack.__setitem__("status", "unknown")),
            ("engine", lambda pack: pack.pop("engine")),
            (
                "modelPinned",
                lambda pack: pack["engine"].pop("modelPinned"),
            ),
            (
                "modelPinned",
                lambda pack: pack["engine"].__setitem__("modelPinned", ""),
            ),
        )
        for label, mutation in mutations:
            with self.subTest(label=label):
                pack = copy.deepcopy(PACK)
                mutation(pack)
                self.pack_path.write_text(json.dumps(pack), encoding="utf-8")
                self.assert_probe_error("pack|status|model", valid_responses())

    def test_changed_strong_etag_changes_same_length_media_aggregate(self):
        first, _ = self.run_probe(valid_responses(media_etag='"tail-v1"'))
        second, _ = self.run_probe(valid_responses(media_etag='"tail-v2"'))
        self.assertNotEqual(
            first["sites"][0]["mediaIntegrityAggregateSha256"],
            second["sites"][0]["mediaIntegrityAggregateSha256"],
        )

    def test_cli_projects_checked_in_shared_config_before_strict_validation(self):
        config_path = (
            ROOT
            / "13_Faculty_Resources"
            / "_automation"
            / "maintenance"
            / "maintenance_config.json"
        )
        shared_config = json.loads(config_path.read_text(encoding="utf-8"))
        self.assertTrue(set(shared_config) - set(CONFIG))
        with self.assertRaisesRegex(production_canary.CanaryError, "config keys"):
            production_canary._validate_config(shared_config)

        out_path = self.temp_dir / "release-twin.json"
        opener = FixtureOpener(valid_responses())
        with (
            mock.patch.object(
                production_canary,
                "MEDIA_MANIFEST_PATH",
                self.manifest_path,
            ),
            mock.patch.object(production_canary, "SP_PACK_PATH", self.pack_path),
            mock.patch.object(production_canary, "build_opener", return_value=opener),
        ):
            exit_code = production_canary.main(
                [
                    "--config",
                    str(config_path),
                    "--out",
                    str(out_path),
                    "--source-sha",
                    SOURCE_SHA,
                ]
            )

        self.assertEqual(exit_code, 0)
        receipt = json.loads(out_path.read_text(encoding="utf-8"))
        self.assertEqual(receipt["sourceSha"], SOURCE_SHA)
        self.assertEqual(
            [site["baseUrl"] for site in receipt["sites"]],
            [site["baseUrl"] for site in CONFIG["sites"]],
        )

    def test_load_config_requires_a_json_object(self):
        config_path = self.temp_dir / "array-config.json"
        config_path.write_text("[]\n", encoding="utf-8")

        with self.assertRaisesRegex(production_canary.CanaryError, "must be an object"):
            production_canary._load_config(config_path)

    def test_checked_in_config_has_exact_public_urls_and_netlify_site_ids(self):
        path = (
            ROOT
            / "13_Faculty_Resources"
            / "_automation"
            / "maintenance"
            / "maintenance_config.json"
        )
        config = json.loads(path.read_text(encoding="utf-8"))
        canary_config = {key: config[key] for key in CONFIG}
        self.assertEqual(canary_config, CONFIG)


if __name__ == "__main__":
    unittest.main()
