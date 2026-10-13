"""Storage must round-trip every logical record and reject broken references."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'13_Faculty_Resources/_automation/surveillance/bin'))
from evidence_storage import encode_inbox, decode_inbox, serialized

class SharedStorage(unittest.TestCase):
    def example(self):
        snapshots={'q1':{'why':'Clinical teaching — é. '*200}}
        return {'version':1,'packets':[{'revision':'original-a','questionSnapshots':snapshots},
                {'revision':'original-b','questionSnapshots':deepcopy(snapshots)}],
                'latestValid':{},'mappingReceiptReconciliations':[{'old':'receipt','new':'receipt2'}],
                'futureAudit':{'mustRemain':[1,'unchanged']}}

    def test_lossless_smaller_and_non_mutating(self):
        state=self.example();original=deepcopy(state)
        stored=encode_inbox(state)
        self.assertLess(len(serialized(stored).encode()),len(serialized(state).encode()))
        self.assertEqual(state,original)
        self.assertEqual(decode_inbox(stored),original)
        self.assertEqual(encode_inbox(decode_inbox(stored)),stored)
        expanded=decode_inbox(stored)
        expanded['packets'][0]['questionSnapshots']['q1']['why']='changed'
        self.assertNotEqual(expanded['packets'][1]['questionSnapshots']['q1']['why'],'changed')

    def test_distinct_snapshots_and_legacy_remain_exact(self):
        state=self.example();state['packets'][1]['questionSnapshots']['q1']['why']+=' NOT'
        self.assertEqual(encode_inbox(state),state)
        self.assertEqual(decode_inbox(state),state)

    def test_corruption_missing_overwrite_and_orphans_fail_closed(self):
        stored=encode_inbox(self.example());digest=next(iter(stored['snapshots']))
        for kind in ['corrupt','missing','overwrite','orphan','duplicate','path','version']:
            value=deepcopy(stored)
            if kind=='corrupt': value['snapshots'][digest]+=' '
            if kind=='missing': value['snapshots'].clear()
            if kind=='overwrite': value['state']['packets'][0]['questionSnapshots']={}
            if kind=='orphan': value['references']=[]
            if kind=='duplicate': value['references'].append(value['references'][0])
            if kind=='path': value['references'][0]['path']=['packets',0,'revision']
            if kind=='version': value['storageVersion']=2
            with self.subTest(kind=kind),self.assertRaises(ValueError):decode_inbox(value)

    def test_expansion_budget_rejects_excessive_references(self):
        stored=encode_inbox(self.example())
        with patch('evidence_storage.EXPANDED_LIMIT',1000),self.assertRaisesRegex(ValueError,'exceeds'):
            decode_inbox(stored)

    def test_shared_source_text_is_exact(self):
        state={'packets':[], 'latestValid':{'a':{'text':'source '*100},'b':{'text':'source '*100}}}
        stored=encode_inbox(state)
        self.assertEqual(len(stored['snapshots']),1)
        self.assertEqual(decode_inbox(stored),state)

if __name__=='__main__':unittest.main()
