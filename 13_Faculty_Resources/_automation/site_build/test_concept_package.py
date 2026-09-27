import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import genanki
import export_anki_content as concepts
from check_anki_parity import check_concepts, check_output, check_qbank, read_cards, FILES
import export_anki as qb
import concept_cards

class PackageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        # genanki 0.13.1 leaves its SQLite tempfile; contain it in our fixture.
        self.old_tempdir = tempfile.tempdir
        tempfile.tempdir = self.tmp.name
        self.package = Path(self.tmp.name) / 'fixture.apkg'
        text = 'Alpha and beta.'
        self.feed = {'cards': [dict(id=f'CONCEPT#n:{i}@1', editorialId=f'n:{i}', noteId='n', ordinal=i, revision=1, kind='cloze', q=q, reveal=text, target=t, targetStart=s, targetEnd=e, page='p.md', source='03_Core_Topics/p.md', topic='Topic') for i,t,s,e,q in [(1,'Alpha',0,5,'[…] and beta.'),(2,'beta',10,14,'Alpha and […].')]]}
        self.crosswalk = {'cards': [dict(editorialId=c['editorialId'], noteId='n', oldGuid='old-guid', oldOrdinal=c['ordinal']-1, identityAction='preserve-guid', oldFront=c['q'], oldBack=c['reveal'], newFront=c['q'], newBack=c['reveal']) for c in self.feed['cards']]}
    def tearDown(self):
        tempfile.tempdir = self.old_tempdir
        self.tmp.cleanup()
    def write(self, feed=None, crosswalk=None):
        deck, _ = concepts.build_deck(feed or self.feed, crosswalk=crosswalk or self.crosswalk)
        genanki.Package(deck).write_to_file(str(self.package))
    def test_same_note_two_clozes_are_two_cards(self):
        self.write()
        self.assertEqual({c['id'] for c in self.feed['cards']}, {'CONCEPT#n:1@1','CONCEPT#n:2@1'})
        self.assertEqual({(c['guid'], c['ordinal']) for c in read_cards(self.package)}, {('old-guid',0),('old-guid',1)})
        check_concepts(read_cards(self.package), self.feed, self.crosswalk, concepts.DECK_ID)
    def test_semantic_mutations_fail_even_with_same_note_count(self):
        self.write()
        rows = read_cards(self.package)
        for mutation in ['missing','extra','answer','source','ordinal','withdrawn']:
            actual = copy.deepcopy(rows)
            if mutation == 'missing': actual.pop()
            elif mutation == 'extra': actual.append(copy.deepcopy(actual[0]))
            elif mutation == 'answer': actual[0]['fields'][2] += ' changed'
            elif mutation == 'source': actual[0]['fields'][-1] = 'wrong source'
            elif mutation == 'ordinal': actual[0]['ordinal'] = 4
            else: actual[0]['fields'][0] = 'withdrawn'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                check_concepts(actual, self.feed, self.crosswalk, concepts.DECK_ID)
    def test_changed_sibling_changes_whole_note_guid(self):
        cw = copy.deepcopy(self.crosswalk)
        for c in cw['cards']: c['identityAction'] = 'new-note-required'
        self.write(crosswalk=cw)
        guids = {r['guid'] for r in read_cards(self.package)}
        self.assertEqual(len(guids),1)
        self.assertNotIn('old-guid',guids)
    def test_crosswalk_faces_must_match_feed(self):
        cw = copy.deepcopy(self.crosswalk)
        cw['cards'][0]['newFront'] = 'stale'
        with self.assertRaises(ValueError): self.write(crosswalk=cw)

    def test_preserve_guid_rejects_changed_old_face(self):
        # Updating both the feed and new crosswalk face must not silently keep
        # an old Anki schedule when the historical teaching face differs.
        for field in ('oldFront', 'oldBack'):
            cw = copy.deepcopy(self.crosswalk)
            cw['cards'][0][field] += ' historical difference'
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'preserved face changed'):
                self.write(crosswalk=cw)

    def test_all_candidate_faces_pin_crosswalk(self):
        root = Path(__file__).resolve().parents[3]
        cards = concept_cards.validate_candidates(root, concept_cards.load_candidates(root))
        deck, stats = concepts.build_deck({'cards':cards})
        self.assertEqual(stats['total'], len(cards))
        genanki.Package(deck).write_to_file(str(self.package))
        check_concepts(read_cards(self.package), {'cards':cards}, concepts.load_crosswalk(), concepts.DECK_ID)

    def test_source_position_does_not_renumber_targets(self):
        feed = copy.deepcopy(self.feed)
        cw = copy.deepcopy(self.crosswalk)
        for card in feed['cards']:
            card['ordinal'] = 3-card['ordinal']
        for row in cw['cards']:
            row['oldOrdinal'] = 1-row['oldOrdinal']
        self.write(feed, cw)
        check_concepts(read_cards(self.package), feed, cw, concepts.DECK_ID)

    def test_exact_fallback_and_overlaid_question_bank(self):
        root = Path(__file__).resolve().parents[3]
        items = json.loads((root/'question_bank.json').read_text())['items']
        item = copy.deepcopy(next(i for i in items if i['status']=='attested'))
        items = [item]
        out = Path(self.tmp.name)/'site'
        (out/'tools').mkdir(parents=True)
        (out/'anki').mkdir()
        (out/'tools/concepts.json').write_text(json.dumps(self.feed))
        bank = out/'bank.json'
        bank.write_text(json.dumps({'items':items}))
        q,_,_ = qb.build_deck(items)
        c,_ = concepts.build_deck(self.feed,crosswalk=self.crosswalk)
        cq,_,_ = qb.build_deck(items,deck_id=2059400193)
        cc,_ = concepts.build_deck(self.feed,deck_id=2059400194,crosswalk=self.crosswalk)
        # These packages act as committed fallback inputs, copied without regeneration.
        import shutil
        for name,decks in zip(FILES,[[q],[c],[cq,cc]]):
            source = Path(self.tmp.name)/name
            genanki.Package(decks).write_to_file(str(source))
            shutil.copyfile(source,out/'anki'/name)
        check_output(out,bank,self.crosswalk)
        item['status']='draft'
        bank.write_text(json.dumps({'items':items}))
        with self.assertRaisesRegex(ValueError,'question-bank'):
            check_output(out,bank,self.crosswalk)
        item['status']='attested'
        item['id'] += '-newly-attested'
        bank.write_text(json.dumps({'items':items}))
        with self.assertRaisesRegex(ValueError,'question-bank'):
            check_output(out,bank,self.crosswalk)
        q,_,_=qb.build_deck(items)
        cq,_,_=qb.build_deck(items,deck_id=2059400193)
        genanki.Package(q).write_to_file(str(out/'anki'/FILES[0]))
        genanki.Package([cq,cc]).write_to_file(str(out/'anki'/FILES[2]))
        check_output(out,bank,self.crosswalk)
        rows=read_cards(out/'anki'/FILES[1])
        rows[0]['fields'][2]+='x'
        with self.assertRaises(ValueError):
            check_concepts(rows,self.feed,self.crosswalk,concepts.DECK_ID)

if __name__ == '__main__': unittest.main()
