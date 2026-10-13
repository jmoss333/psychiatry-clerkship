"""FDA generated identifier batches are cosmetic; genuine edits stay reviewable."""
import copy
from pathlib import Path
import sys
import unittest
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '13_Faculty_Resources/_automation/surveillance/bin'))
from review_packets import merge_observation
from fda_heading_noise import generated_heading_ids_only
from lib_surveillance import sha_full

URL = 'https://www.fda.gov/drugs/drug-safety-communications/fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine'
HEADINGS = ['What Is FDA Announcing?', 'What Is FDA Doing?', 'What Is Clozapine, and How Can It Help Me?',
            'What Should Patients and Caregivers Do?', 'What Should Health Care Professionals Do?',
            'What Did FDA Find?', 'Data Summary', 'What Is My Risk?', 'How Do I Report Side Effects of Clozapine?',
            'How Can I Get New Safety Information on Medicines I’m Prescribing or Taking?']

def document(prefix):
    return ' '.join(f'## [{label}]({URL}\\#{prefix}{i:05x}) Teaching sentence stays fixed.'
                    for i, label in enumerate(HEADINGS)) + ' [Reference](https://example.org/paper)'

class FDAHeadings(unittest.TestCase):
    def row(self, text):
        return {'source_id':'clozapine-rems', 'source_url':URL, 'extractor':'firecrawl-markdown-main-v1',
                'status':'changed', 'hash':sha_full(text), 'text':text,
                'passage_review':{'status':'outside-mapped-passages', 'observations':{
                    'p':{'quote':'Teaching sentence stays fixed.', 'mapping_signature':'v1'}}}}

    def merge(self, state, row, complete=True):
        return merge_observation(state, {'mode':'fixture','generated_at':'2026-10-12','results':[row]},
            {'clozapine-rems':{'status':'complete' if complete else 'incomplete','coverage':{},'candidates':[]}})

    def setUp(self):
        self.before = self.row(document('6acbd9e7'))
        self.after = self.row(document('6acd104b'))
        self.state = self.merge(None, self.before)

    def test_complete_generated_batch_is_quiet_and_updates_baseline(self):
        state = self.merge(self.state, self.after)
        self.assertEqual(state['packets'], [])
        self.assertEqual(state['latestValid']['clozapine-rems']['changeClassification'], 'formatting-only')
        self.assertEqual(state['latestValid']['clozapine-rems']['hash'], self.after['hash'])
        self.assertEqual(state['latestValid']['clozapine-rems']['text'], self.after['text'])

    def test_wording_and_real_link_changes_create_packets_even_with_generated_churn(self):
        for text in [self.after['text'].replace('stays fixed', 'does not stay fixed', 1),
                     self.after['text'].replace('example.org/paper', 'example.org/new-paper'),
                     self.after['text'].replace(URL, URL+'/other', 1),
                     self.after['text'].replace('www.fda.gov', 'example.org', 1),
                     self.after['text'].replace('What Did FDA Find?', 'New heading'),
                     self.after['text'].replace('6acd104b00001', 'meaningful-section'),
                     self.before['text'].replace('6acbd9e700001', '6acd104b00001'),
                     self.after['text'].replace('6acd104b00001', '6acbd9e700001')]:
            with self.subTest(text=text[:60]):
                state = self.merge(self.state, self.row(text))
                self.assertEqual(len(state['packets']), 1)
                self.assertEqual(state['latestValid']['clozapine-rems']['changeClassification'], 'review-required')

    def test_uncertain_context_mapping_and_scan_failures_remain_reviewable(self):
        variants = []
        for field, value in [('source_url', 'https://example.org'), ('extractor','different')]:
            row=copy.deepcopy(self.after);row[field]=value;variants.append(row)
        for review in [{'status':'unavailable'}, {'status':'not-configured','observations':{}},
                       {'status':'changed','observations':{'p':{'quote':'Changed teaching','mapping_signature':'v1'}}}]:
            row=copy.deepcopy(self.after);row['passage_review']=review;variants.append(row)
        for row in variants:
            with self.subTest(row=row): self.assertEqual(len(self.merge(self.state,row)['packets']),1)
        self.assertEqual(len(self.merge(self.state,self.after,complete=False)['packets']),1)
        for wrapper in ['`{} `', '<code>{}</code>', '~~~{}~~~']:
            state=self.merge(None,self.row(wrapper.format(self.before['text'])))
            self.assertEqual(len(self.merge(state,self.row(wrapper.format(self.after['text'])))['packets']),1)

    def test_missing_duplicate_and_nonbatch_identifiers_are_not_suppressed(self):
        for text in [self.after['text'].replace('## [Data Summary]', '## [Other]'),
                     self.after['text'].replace('6acd104b00001', '6acd104b00000'),
                     self.after['text'].replace('6acd104b00001', '6acd999900001'),
                     self.after['text'].replace('## [Data Summary]', '### [Data Summary]'),
                     self.after['text'].replace('6acd104b00001', '6acbd9e700001')]:
            self.assertEqual(len(self.merge(self.state,self.row(text))['packets']),1)
        other=copy.deepcopy(self.after);other['source_id']='other'
        self.assertFalse(generated_heading_ids_only(self.before,other))
        altered=copy.deepcopy(self.after)
        altered['passage_review']['observations']['p']['mapping_signature']='v2'
        self.assertEqual(len(self.merge(self.state,altered)['packets']),1)

    def test_existing_packet_survives_and_next_meaningful_edit_alerts(self):
        state=self.merge(self.state,self.row(self.before['text']+' Real change.'))
        packets=copy.deepcopy(state['packets'])
        quiet=self.row(self.after['text']+' Real change.')
        state=self.merge(state,quiet)
        self.assertEqual(state['packets'],packets)
        state=self.merge(state,self.row(quiet['text']+' Another change.'))
        self.assertEqual(len(state['packets']),2)
        state=self.merge(state,self.row(quiet['text']+' Another change.'))
        self.assertEqual(len(state['packets']),2)

if __name__ == '__main__': unittest.main()
