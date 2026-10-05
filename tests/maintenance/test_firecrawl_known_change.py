"""Known-change probe must prove the expected sequence, never just count requests."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '13_Faculty_Resources/_automation/surveillance/bin'))

class KnownChange(unittest.TestCase):
    def setUp(self):
        import run_firecrawl_known_change as K
        self.K = K

    def run_case(self, directory, statuses=None, stale=False, interrupt=False):
        K = self.K
        state = {'version': None, 'calls': 0, 'published': []}
        class Publisher:
            url = 'https://raw.githubusercontent.com/jmoss333/psychiatry-clerkship/refs/heads/automation/firecrawl-fixture/test/fixture.md'
            branch = 'automation/firecrawl-fixture/test'
            def publish(self, text):
                state['version'] = text
                state['published'].append(text)
                return 'a' * 40
        statuses = statuses or ['new', 'same', 'changed', 'same']
        def fetch(source, token, tracking_tag):
            i = state['calls']; state['calls'] += 1
            if interrupt: raise KeyboardInterrupt()
            text = state['published'][0] if stale and i == 2 else state['version']
            return {'success': True, 'data': {'markdown': text,
                'metadata': {'statusCode': 200, 'sourceURL': source['url'], 'url': source['url']},
                'changeTracking': {'changeStatus': statuses[i], 'previousScrapeAt': None if i == 0 else '2026-10-04T10:00:01Z'}}}
        with patch.object(K.R, 'fetch', side_effect=fetch), patch.object(K, 'now', return_value='2026-10-04T10:00:01+00:00'), patch.object(K, 'wait_for_fixture', return_value=True):
            report = K.run_known_change(Path(directory)/'probe', 'synthetic-secret', Publisher(), 'synthetic-run')
        return report, state

    def test_four_observations_prove_same_changed_same(self):
        with tempfile.TemporaryDirectory() as d:
            report, state = self.run_case(d)
            self.assertEqual(report['status'], 'complete')
            self.assertEqual(report['verdict'], 'pass')
            self.assertEqual(report['apiRequests'], 4)
            self.assertEqual([o['providerStatus'] for o in report['observations']], ['new', 'same', 'changed', 'same'])
            self.assertEqual(len(state['published']), 2)
            self.assertNotIn('synthetic-secret', (Path(d)/'probe/report.json').read_text())

    def test_false_unchanged_is_a_disagreement(self):
        with tempfile.TemporaryDirectory() as d:
            report, _ = self.run_case(d, ['new','same','same','same'])
            self.assertEqual(report['verdict'], 'disagreement')
            self.assertEqual(report['apiRequests'], 4)

    def test_stale_changed_observation_is_inconclusive(self):
        with tempfile.TemporaryDirectory() as d:
            report, _ = self.run_case(d, stale=True)
            self.assertEqual(report['status'], 'incomplete')
            self.assertEqual(report['verdict'], 'inconclusive')
            self.assertLessEqual(report['apiRequests'], 4)

    def test_interruption_retains_attempt_count(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(KeyboardInterrupt): self.run_case(d, interrupt=True)
            report = json.loads((Path(d)/'probe/report.json').read_text())
            self.assertEqual(report['status'], 'incomplete')
            self.assertEqual(report['apiRequests'], 1)
            self.assertFalse(report['requestCountComplete'])

    def test_no_key_publishes_nothing(self):
        from unittest.mock import Mock
        publisher = Mock()
        with tempfile.TemporaryDirectory() as d:
            report = self.K.run_known_change(Path(d)/'probe', '', publisher, 'synthetic-run')
            self.assertEqual(report['apiRequests'], 0)
            self.assertEqual(report['verdict'], 'inconclusive')
            publisher.publish.assert_not_called()

    def test_unserved_fixture_never_calls_firecrawl(self):
        from unittest.mock import Mock
        publisher = Mock(url='https://example.org', branch='synthetic-branch')
        publisher.publish.return_value = 'a' * 40
        with tempfile.TemporaryDirectory() as d, patch.object(self.K, 'wait_for_fixture', return_value=False), patch.object(self.K.R, 'fetch') as fetch:
            report = self.K.run_known_change(Path(d)/'probe', 'key', publisher, 'synthetic-run')
            self.assertEqual(report['apiRequests'], 0)
            self.assertEqual(report['verdict'], 'inconclusive')
            fetch.assert_not_called()

    def test_publisher_uses_orphan_fixture_tree_and_refuses_foreign_head(self):
        calls = []
        def api(method, path, payload=None):
            calls.append((method, path, payload))
            if method == 'GET': return {'object': {'sha': 'foreign'}}
            return {'sha': 'a' * 40}
        with patch.object(self.K, 'github', side_effect=api):
            publisher = self.K.FixturePublisher('123-1')
            publisher.publish('synthetic text')
            self.assertTrue(publisher.branch.startswith('automation/firecrawl-fixture/123-1-'))
            tree = calls[0][2]
            self.assertNotIn('base_tree', tree)
            self.assertEqual([v['path'] for v in tree['tree']], ['fixture.md'])
            self.assertEqual(calls[1][2]['parents'], [])
            self.assertEqual(calls[2][2]['ref'], 'refs/heads/' + publisher.branch)
            with self.assertRaises(ValueError): publisher.publish('changed text')
            self.assertEqual(len(calls), 4)  # read-only mismatch detection, no further writes
        for value in ('main', '123/../../main', '', '123-1-invalid'):
            with self.assertRaises(ValueError): self.K.FixturePublisher(value)

    def test_metadata_loss_and_wrong_baseline_never_pass(self):
        K = self.K
        source = {'id':'fixture', 'url':'https://example.org', 'modality':'full_text'}
        def obs(status, prior):
            return {'startedAt':'2026-10-04T10:00:00Z', 'completedAt':'2026-10-04T10:00:02Z',
                    'response':{'success':True,'data':{'markdown':K.fixture('synthetic-run','A'),
                    'metadata':{'statusCode':200,'sourceURL':source['url']},
                    'changeTracking':{'changeStatus':status,'previousScrapeAt':prior}}}}
        first = obs('new',None)
        for candidate in (obs('same','2026-10-03T10:00:01Z'), obs('new',None), obs('removed',None), obs('same',None)):
            verdict,_ = K.validate_observation(source,candidate,[first],'synthetic-run','A','same')
            self.assertEqual(verdict,'inconclusive')
        candidate = obs('same','2026-10-04T10:00:01Z')
        del candidate['response']['data']['changeTracking']
        self.assertEqual(K.validate_observation(source,candidate,[first],'synthetic-run','A','same')[0],'inconclusive')

    def test_workflow_is_manual_and_separate_from_production_health(self):
        sys.path.insert(0,str(ROOT/'13_Faculty_Resources/_automation'))
        from maintenance import validate_scheduled_workflows as V
        errors=[]
        workflow,_ = V._load(ROOT,'firecrawl-known-change.yml',errors)
        self.assertFalse(errors)
        self.assertEqual(set(workflow['on']), {'workflow_dispatch'})
        self.assertEqual(workflow['permissions'], {'contents':'write'})
        self.assertEqual(set(workflow['jobs']), {'known-change'})
        steps = workflow['jobs']['known-change']['steps']
        self.assertIn(steps[0]['with']['persist-credentials'], (False, 'false'))
        upload=next(s for s in steps if str(s.get('uses','')).startswith('actions/upload-artifact@'))
        self.assertEqual(upload['if'],'always()')
        escalation,_ = V._load(ROOT,'automation-failure-escalation.yml',[])
        self.assertNotIn(workflow['name'],escalation['on']['workflow_run']['workflows'])

if __name__ == '__main__': unittest.main()
