"""Formatting suppression must not conceal teaching or mapping changes."""
import copy
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '13_Faculty_Resources/_automation/surveillance/bin'))
from review_packets import bold_only_change, merge_observation
from lib_surveillance import sha_full

class Formatting(unittest.TestCase):
    def row(self, text, review=None):
        row = {'source_id': 'synthetic', 'source_url': 'https://example.org',
               'status': 'changed', 'hash': sha_full(text), 'text': text}
        if review is not None: row['passage_review'] = review
        return row

    def merge(self, state, row):
        return merge_observation(state, {'mode': 'fixture', 'generated_at': '2026-10-12', 'results': [row]},
                                 {'synthetic': {'status': 'complete', 'coverage': {}, 'candidates': []}})

    def test_bold_allowlist_and_meaningful_counterexamples(self):
        for a, b in [('Use Cedar.', 'Use **Cedar**.'), ('Use **Cedar**.', 'Use Cedar.'),
                     ('Use Cedar and Maple.', 'Use **Cedar** and **Maple**.')]:
            with self.subTest(a=a, b=b): self.assertTrue(bold_only_change(a, b))
        for a, b in [('Use Cedar.', 'Use **Maple**.'), ('Use Cedar.', 'Do not use **Cedar**.'),
                     ('Use 2 shelves.', 'Use **3** shelves.'), ('Use Cedar.', 'Use *Cedar*.'),
                     ('Use Cedar.', 'Use **Cedar*.'), ('Use Cedar.', 'Use ***Cedar***.'),
                     ('`Cedar`', '`**Cedar**`'), ('[shelf](Cedar)', '[shelf](**Cedar**)'),
                     ('Cedar', r'\**Cedar**'), ('Cedar', '# **Cedar**'),
                     ('Cedar', '- **Cedar**'), ('| Cedar |', '| **Cedar** |'),
                     ('Use Cedar.', 'Use **Cedar**!'), ('Cedar', 'prefix**Cedar**'), (None, '**Cedar**')]:
            with self.subTest(a=a, b=b): self.assertFalse(bold_only_change(a, b))

    def test_baseline_updates_existing_packets_survive_and_next_wording_alerts(self):
        state = self.merge(None, self.row('Use Maple.'))
        state = self.merge(state, self.row('Use Cedar.'))
        existing = copy.deepcopy(state['packets'])
        state = self.merge(state, self.row('Use **Cedar**.'))
        self.assertEqual(state['packets'], existing)
        latest = state['latestValid']['synthetic']
        self.assertEqual(latest['changeClassification'], 'formatting-only')
        self.assertEqual(latest['text'], 'Use **Cedar**.')
        self.assertEqual(latest['hash'], sha_full('Use **Cedar**.'))
        state = self.merge(state, self.row('Do not use Cedar.'))
        self.assertEqual(len(state['packets']), 2)
        self.assertEqual(state['latestValid']['synthetic']['changeClassification'], 'review-required')
        state = self.merge(state, self.row('Do not use Cedar.'))
        self.assertEqual(len(state['packets']), 2)

    def test_mapping_receipts_must_agree_and_failures_remain_visible(self):
        old = {'status': 'unchanged', 'observations': {'p': {'quote': 'Use Cedar.', 'mapping_signature': 'v1'}}}
        state = self.merge(None, self.row('Use Cedar.', old))
        new = copy.deepcopy(old)
        new['observations']['p']['quote'] = 'Use **Cedar**.'
        self.assertEqual(len(self.merge(state, self.row('Use **Cedar**.', new))['packets']), 0)
        for review in [
            {'status': 'unavailable', 'observations': {}},
            {'status': 'changed', 'observations': {}},
            {'status': 'changed', 'observations': {'p': {'quote': 'Use **Cedar**.', 'mapping_signature': 'v2'}}},
            {'status': 'changed', 'observations': {'p': {'quote': 'Use Maple.', 'mapping_signature': 'v1'}}},
        ]:
            with self.subTest(review=review):
                result = self.merge(state, self.row('Use **Cedar**.', review))
                self.assertEqual(len(result['packets']), 1)
                if review['status'] == 'unavailable': self.assertTrue(result['failures'])

    def test_incomplete_question_scan_is_not_hidden(self):
        state = self.merge(None, self.row('Use Cedar.'))
        result = merge_observation(state,
            {'mode': 'fixture', 'generated_at': '2026-10-12', 'results': [self.row('Use **Cedar**.')]},
            {'synthetic': {'status': 'incomplete', 'coverage': {}, 'candidates': []}})
        self.assertEqual(len(result['packets']), 1)
        self.assertTrue(result['failures'])

    def test_mapping_recovery_still_creates_packet(self):
        state = self.merge(None, self.row('Use Maple.'))
        state = self.merge(state, self.row('Use Cedar.', {'status': 'unavailable'}))
        old_revision = state['packets'][0]['revision']
        state = self.merge(state, self.row('Use **Cedar**.', {'status': 'unchanged'}))
        self.assertEqual(len(state['packets']), 2)
        self.assertEqual(state['packets'][1]['supersedes'], [old_revision])

if __name__ == '__main__': unittest.main()
