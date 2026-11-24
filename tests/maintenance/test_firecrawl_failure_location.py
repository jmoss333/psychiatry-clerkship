"""The weekly Firecrawl job must say why it failed, and one bad source must not sink the rest.

From Oct 19 to Nov 23, 2026 the scheduled job failed six weeks running with only
"Evidence collection incomplete" in its log: the review script swallowed the exception
and the pilot's stderr was captured and dropped. These tests pin the repair:

  * a failure is named by class and code location, never by its message;
  * a crash while examining one source records that source as unable to check and
    keeps the report for the others;
  * when the pilot cannot produce a report, the review log and receipt say where.
"""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

BIN = Path(__file__).resolve().parents[2] / '13_Faculty_Resources/_automation/surveillance/bin'
sys.path.insert(0, str(BIN))
import lib_surveillance as L  # noqa: E402
import run_firecrawl_pilot as R  # noqa: E402
import run_firecrawl_review as V  # noqa: E402

SECRET = 'fc-secret-token-should-never-print'


def sources():
    by_id = {s['id']: s for s in L.load_registry()['sources']}
    return [by_id[i] for i in R.DEFAULT_IDS]


def ok_response(source):
    text = ' '.join(['Registered guidance text for a synthetic fixture sentence.'] * 12)
    return {'success': True, 'data': {'markdown': text, 'metadata': {
        'statusCode': 200, 'sourceURL': source['url'], 'url': source['url']}}}


class FailureLocation(unittest.TestCase):
    def test_names_class_and_line_never_the_message(self):
        try:
            L.load_registry(path=Path('/nonexistent/' + SECRET + '.json'))
        except OSError as exc:
            where = L.failure_location(exc)
        else:
            self.fail('expected the registry read to fail')
        self.assertTrue(where.startswith('FileNotFoundError at lib_surveillance.py:'), where)
        self.assertIn('in load_registry', where)
        self.assertNotIn(SECRET, where)

    def test_exception_raised_outside_these_scripts_is_still_named(self):
        where = L.failure_location(KeyError(SECRET))
        self.assertEqual(where, 'KeyError at outside the surveillance scripts')


class OneSourceCrash(unittest.TestCase):
    def test_other_sources_keep_their_report(self):
        responses = {s['id']: ok_response(s) for s in sources()}
        real = R.P.evaluate

        def evaluate(source, *rest):
            if source['id'] == 'clozapine-rems':
                raise KeyError(SECRET)
            return real(source, *rest)

        with tempfile.TemporaryDirectory() as tmp:
            resp = Path(tmp) / 'responses.json'
            resp.write_text(json.dumps(responses))
            out = Path(tmp) / 'run'
            argv = ['run_firecrawl_pilot.py', '--out-dir', str(out), '--responses', str(resp), '--fixture']
            err = io.StringIO()
            with patch.object(sys, 'argv', argv), patch.object(R.P, 'evaluate', evaluate), \
                    contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                code = R.guarded_main()
            report = json.loads((out / 'report.json').read_text())
        self.assertEqual(code, 2)
        rows = {r['source_id']: r for r in report['results']}
        self.assertEqual(list(rows), list(R.DEFAULT_IDS))
        crashed = rows['clozapine-rems']
        self.assertEqual(crashed['status'], 'unable-to-check')
        self.assertEqual(crashed['passage_review']['status'], 'unavailable')
        self.assertTrue(crashed['reason'].startswith('Examination failed: KeyError at '), crashed['reason'])
        for sid, row in rows.items():
            if sid != 'clozapine-rems':
                self.assertEqual(row['status'], 'first-observation', sid)
        self.assertIn('clozapine-rems could not be examined: KeyError at ', err.getvalue())
        self.assertNotIn(SECRET, err.getvalue() + json.dumps(report))


class ReviewNamesTheFailure(unittest.TestCase):
    def test_missing_report_is_named_in_log_and_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / 'responses.json'
            bad.write_text('{not json ' + SECRET)
            out = Path(tmp) / 'run'
            argv = ['run_firecrawl_review.py', '--out-dir', str(out),
                    '--state', str(Path(tmp) / 'state.json'), '--responses', str(bad)]
            err = io.StringIO()
            with patch.object(sys, 'argv', argv), contextlib.redirect_stderr(err):
                code = V.main()
            receipt = json.loads((out / 'receipt.json').read_text())
        log = err.getvalue()
        self.assertEqual(code, 2)
        self.assertIn('Firecrawl pilot failure: JSONDecodeError at run_firecrawl_pilot.py:', log)
        self.assertIn('Evidence collection incomplete (ValueError at run_firecrawl_review.py:', log)
        self.assertEqual(receipt['status'], 'incomplete')
        self.assertTrue(receipt['failure'].startswith('ValueError at run_firecrawl_review.py:'))
        self.assertNotIn(SECRET, log + json.dumps(receipt))

    def test_unexpected_exception_class_is_incomplete_not_a_crash(self):
        # Before the repair an AttributeError escaped as Python's exit 1, which the
        # workflow reads as "changed" and reports green.
        with tempfile.TemporaryDirectory() as tmp:
            argv = ['run_firecrawl_review.py', '--out-dir', str(Path(tmp) / 'run'),
                    '--state', str(Path(tmp) / 'state.json')]
            err = io.StringIO()
            with patch.object(sys, 'argv', argv), patch.object(V, 'collect', side_effect=AttributeError(SECRET)), \
                    contextlib.redirect_stderr(err):
                code = V.main()
        self.assertEqual(code, 2)
        self.assertIn('Evidence collection incomplete (AttributeError at ', err.getvalue())
        self.assertNotIn(SECRET, err.getvalue())


if __name__ == '__main__':
    unittest.main()
