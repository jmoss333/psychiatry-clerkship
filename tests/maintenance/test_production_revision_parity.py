import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '13_Faculty_Resources' / '_automation'))
from maintenance import production_revision_parity as parity
from maintenance import production_canary

CONFIG = production_canary._load_config(production_canary.DEFAULT_CONFIG_PATH)
SHA_A, SHA_B = 'a' * 40, 'b' * 40


def manifest(revision):
    return json.dumps({'schemaVersion': 1, 'items': [
        {'id': 'tools/example', 'source': {
            'repository': 'jmoss333/psychiatry-clerkship', 'revision': revision}}
    ]}).encode()


class Response:
    def __init__(self, body, status=200, content_type='application/json; charset=utf-8'):
        self.body, self.status, self.closed = body, status, False
        self.headers = {'Content-Type': content_type}

    def read(self, size):
        assert 0 < size <= parity.MAX_BODY_BYTES + 1
        return self.body[:size]

    def close(self):
        self.closed = True


class Opener:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        assert timeout == parity.TIMEOUT_SECONDS
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class RevisionParityTests(unittest.TestCase):
    def check(self, *responses, attempts=1, config=None):
        opener, pauses = Opener(*responses), []
        receipt = parity.check(config or CONFIG, opener=opener, attempts=attempts,
                               retry_delay=60, sleep=pauses.append,
                               now=lambda: '2026-09-16T18:00:00+00:00')
        return receipt, opener, pauses

    def test_equal_served_revisions_pass_without_comparing_to_checker_checkout(self):
        responses = [Response(manifest(SHA_B)), Response(manifest(SHA_B))]
        receipt, opener, pauses = self.check(*responses, attempts=3)
        self.assertEqual(receipt['status'], 'matched')
        self.assertEqual(receipt['exitCode'], 0)
        self.assertEqual([s['revision'] for s in receipt['observations'][0]['sites']], [SHA_B, SHA_B])
        self.assertEqual(len(opener.requests), 2)
        self.assertEqual(pauses, [])
        self.assertTrue(all(r.closed for r in responses))
        self.assertTrue(all(r.get_header('Cache-control') == 'no-cache' for r in opener.requests))
        self.assertEqual({r.full_url for r in opener.requests}, {s['baseUrl'] + '/tool-governance.json' for s in CONFIG['sites']})

    def test_manifest_uses_every_item_source_not_external_contract_revision(self):
        data = json.loads(manifest(SHA_A))
        data['contract'] = {'revision': SHA_B}
        data['items'].append(dict(copy.deepcopy(data['items'][0]), id='tools/second'))
        receipt, _, _ = self.check(Response(json.dumps(data).encode()), Response(manifest(SHA_A)))
        self.assertEqual(receipt['exitCode'], 0)
        self.assertEqual(receipt['observations'][0]['sites'][0]['revision'], SHA_A)

    def test_persistent_mismatch_fails_after_bounded_rechecks(self):
        receipt, opener, pauses = self.check(
            *[Response(manifest(sha)) for sha in [SHA_A, SHA_B] * 3], attempts=3)
        self.assertEqual((receipt['status'], receipt['exitCode']), ('mismatch', 1))
        self.assertEqual(len(receipt['observations']), 3)
        self.assertEqual(len(opener.requests), 6)
        self.assertEqual(pauses, [60, 60])

    def test_staggered_rollout_can_converge_and_keeps_initial_evidence(self):
        receipt, _, pauses = self.check(
            *[Response(manifest(sha)) for sha in [SHA_A, SHA_B, SHA_B, SHA_B]], attempts=3)
        self.assertEqual(receipt['exitCode'], 0)
        self.assertEqual([r['status'] for r in receipt['observations']], ['mismatch', 'matched'])
        self.assertEqual(pauses, [60])

    def test_one_unavailable_site_never_becomes_a_match_and_other_site_is_still_checked(self):
        receipt, opener, _ = self.check(URLError('private transport detail'), Response(manifest(SHA_A)))
        self.assertEqual((receipt['status'], receipt['exitCode']), ('unavailable', 2))
        self.assertEqual(len(opener.requests), 2)
        self.assertNotIn('private transport detail', json.dumps(receipt))
        self.assertEqual(receipt['observations'][0]['sites'][1]['revision'], SHA_A)

    def test_both_missing_is_unavailable_not_equal(self):
        receipt, _, _ = self.check(Response(b'<html></html>'), Response(b'<html></html>'))
        self.assertEqual(receipt['exitCode'], 2)

    def test_http_errors_close_without_following_redirects(self):
        error_body = Response(b'private error body')
        error = HTTPError('https://example.test', 302, 'redirect', {}, error_body)
        receipt, opener, _ = self.check(error, Response(manifest(SHA_A)))
        self.assertEqual(receipt['exitCode'], 2)
        self.assertTrue(error_body.closed)
        self.assertEqual(len(opener.requests), 2)
        self.assertTrue(any(isinstance(h, production_canary.NoRedirectHandler)
                            for h in parity.build_opener().handlers))

    def test_invalid_responses_fail_closed(self):
        invalid = [
            Response(manifest(SHA_A), status=503), Response(manifest(SHA_A), content_type='text/plain'),
            Response(b'\xff'), Response(b'x' * (parity.MAX_BODY_BYTES + 1)),
            Response(manifest('short')), Response(manifest('A' * 40)),
            Response(manifest(SHA_A) + manifest(SHA_A)),
            Response(manifest(SHA_A) + manifest('invalid')),
            Response(b'{}'), Response(b'{"schemaVersion": 1, "items": []}'),
            Response(b'{"schemaVersion": 1, "items": [null]}'),
            Response(b'{"schemaVersion": 1, "items": [{}]}'),
            Response(manifest(SHA_A).replace(b'"schemaVersion": 1', b'"schemaVersion": true')),
            Response(manifest(SHA_A).replace(b'jmoss333/psychiatry-clerkship', b'other/repo')),
            Response(manifest(SHA_A).replace(b'"schemaVersion": 1', b'"schemaVersion": 2, "schemaVersion": 1')),
            Response(f'<script>/*\nvar FD_CORE_REVISION="{SHA_A}";\n*/</script>'.encode()),
            Response(f'<script>const example = `\nvar FD_CORE_REVISION="{SHA_A}";\n`;</script>'.encode()),
        ]
        for response in invalid:
            with self.subTest(body=response.body[:70]):
                receipt, _, _ = self.check(response, Response(manifest(SHA_A)))
                self.assertEqual(receipt['exitCode'], 2)
                self.assertTrue(response.closed)

    def test_all_manifest_items_must_have_one_revision_and_unique_ids(self):
        base = json.loads(manifest(SHA_A))
        for second in [
            {'id': 'tools/other', 'source': {'repository': 'jmoss333/psychiatry-clerkship', 'revision': SHA_B}},
            {'id': 'tools/other', 'source': {}},
            copy.deepcopy(base['items'][0]),
        ]:
            body = json.dumps(dict(base, items=base['items'] + [second])).encode()
            with self.subTest(second=second):
                receipt, _, _ = self.check(Response(body), Response(manifest(SHA_A)))
                self.assertEqual(receipt['exitCode'], 2)

    def test_interrupted_response_is_unavailable_and_closes(self):
        from http.client import IncompleteRead
        response = Response(b'')
        response.read = mock.Mock(side_effect=IncompleteRead(b'partial'))
        receipt, _, _ = self.check(response, Response(manifest(SHA_A)))
        self.assertEqual(receipt['exitCode'], 2)
        self.assertTrue(response.closed)

    def test_partial_extra_and_duplicate_site_config_cannot_silently_shrink_coverage(self):
        for names in [['ms3'], ['ms3', 'ms3'], ['ms3', 'other'], ['ms3', 'res', 'third'], []]:
            config = copy.deepcopy(CONFIG)
            config['sites'] = [dict(CONFIG['sites'][min(i, 1)], name=name) for i, name in enumerate(names)]
            with self.subTest(names=names):
                receipt, opener, _ = self.check(config=config)
                self.assertEqual(receipt['exitCode'], 2)
                self.assertEqual(opener.requests, [])

    def test_cli_saves_mismatch_receipt_and_returns_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'receipt.json'
            with mock.patch.object(parity, 'build_opener', return_value=Opener(Response(manifest(SHA_A)), Response(manifest(SHA_B)))):
                code = parity.main(['--out', str(target), '--attempts', '1'])
            self.assertEqual(code, 1)
            self.assertEqual(json.loads(target.read_text())['status'], 'mismatch')

    def test_cli_bad_config_records_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'receipt.json'
            code = parity.main(['--config', str(Path(directory) / 'missing.json'), '--out', str(target)])
            self.assertEqual(code, 2)
            self.assertEqual(json.loads(target.read_text())['status'], 'unavailable')

    def test_retry_controls_are_bounded(self):
        for attempts, delay in [(0, 0), (4, 0), (1, -1), (1, 61)]:
            with self.subTest(attempts=attempts, delay=delay):
                with self.assertRaises(ValueError):
                    parity.check(CONFIG, attempts=attempts, retry_delay=delay)


if __name__ == '__main__':
    unittest.main()
