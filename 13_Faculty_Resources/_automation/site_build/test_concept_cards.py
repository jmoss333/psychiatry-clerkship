"""Contract tests: exact selections, complete coverage and post-overlay release."""
import copy
from contextlib import closing
import json
import shutil
import sqlite3
import zipfile
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
import concept_cards as cards
import attestation_hash


class ConceptCardsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.build = self.root / '13_Faculty_Resources/_automation/site_build'
        self.build.mkdir(parents=True)
        self.source = '03_Core_Topics/example.md'
        self.page = self.root / self.source
        self.page.parent.mkdir()
        self.page.write_text('# Example\n\n**High-yield pearls.**\n- First answer\n- Second answer\n')
        self.shipped = {'pages': [{'kind': 'page', 'source': self.source,
            'slug': 'different-route.md', 'title': 'Example', 'sites': ['ms3', 'res']}]}
        self.write('shipped_pages.json', self.shipped)
        self.document = {'schemaVersion': 1, 'notes': [
            {'id': 'first', 'source': self.source, 'kind': 'pearl', 'excerpt': 'First answer',
             'targets': [{'id': 'first:1', 'text': 'First', 'contentRevision': 1}]},
            {'id': 'second', 'source': self.source, 'kind': 'pearl', 'excerpt': 'Second answer',
             'targets': [{'id': 'second:1', 'text': 'Second', 'contentRevision': 1}]}],
            'exclusions': []}
        self.write('concept_candidates.json', self.document)
        self.write('concept_evidence_links.json', {'schemaVersion':1,'links':{}})
        faculty = self.root / '13_Faculty_Resources'
        shutil.copyfile(HERE.parents[1] / 'reviewed.schema.json', faculty / 'reviewed.schema.json')
        (self.root / 'topic_meta.json').write_text('{}')
        self.sign()

    def write(self, name, value):
        (self.build / name).write_text(json.dumps(value))

    def sign(self, status='reviewed'):
        row = {'status': status, 'at': '2026-01-01', 'by': 'Synthetic Faculty, MD',
               'risk': {'kind': 'clinical', 'level': 'moderate'}}
        if status == 'pending':
            row.update(by='Pending faculty review', reason='Synthetic pending fixture')
        if status == 'reviewed':
            row['contentHash'] = attestation_hash.digest_from_tree(self.root, self.shipped, {}, 'different-route.md')
        (self.root / '13_Faculty_Resources/reviewed.json').write_text(json.dumps({'different-route.md': row}))

    def test_reorder_keeps_ids_and_exact_faces(self):
        before = cards.validate_candidates(self.root, self.document)
        self.page.write_text(self.page.read_text().replace('- First answer\n- Second answer', '- Second answer\n- First answer'))
        after = cards.validate_candidates(self.root, self.document)
        self.assertEqual(before, after)
        self.assertEqual(before[0]['id'], 'CONCEPT#first:1@1')
        self.assertEqual(before[0]['q'], '[…] answer')
        self.assertEqual(before[0]['reveal'], 'First answer')
        self.assertEqual(before[0]['page'], 'different-route.md')

    def test_missing_duplicate_overlap_target_names_note(self):
        for targets in [ ['absent'], ['First', 'First'], ['First', 'First answer'] ]:
            with self.subTest(targets=targets):
                doc = copy.deepcopy(self.document)
                doc['notes'][0]['targets'] = [{'id': f'first:{i+1}', 'text': t, 'contentRevision': 1} for i,t in enumerate(targets)]
                with self.assertRaisesRegex(ValueError, 'first'):
                    cards.validate_candidates(self.root, doc)

    def test_duplicate_excerpt_fails(self):
        self.page.write_text(self.page.read_text() + '- First answer\n')
        with self.assertRaisesRegex(ValueError, 'first'):
            cards.validate_candidates(self.root, self.document)

    def test_added_unmapped_pearl_fails_coverage(self):
        self.page.write_text(self.page.read_text() + '- Third answer\n')
        with self.assertRaisesRegex(ValueError, 'coverage'):
            cards.validate_candidates(self.root, self.document)

    def test_missing_source_requires_named_exclusion(self):
        self.document['notes'] = []
        with self.assertRaisesRegex(ValueError, 'coverage'):
            cards.validate_candidates(self.root, self.document)
        self.document['exclusions'] = [{'source': self.source, 'reason': 'First-release scope; faculty review required'}]
        self.assertEqual(cards.validate_candidates(self.root, self.document), [])

    def test_pending_then_post_checkout_signoff_releases(self):
        self.sign('pending')
        with self.assertRaisesRegex(ValueError, 'empty release'):
            cards.release_cards(self.root, 'ms3')
        self.sign()
        feed = cards.release_cards(self.root, 'ms3')
        self.assertEqual(len(feed['cards']), 2)
        self.assertEqual(feed['withheld'], [])
        self.assertEqual(cards.feed_bytes(self.root, 'ms3'), cards.feed_bytes(self.root, 'res'))
        self.page.write_text(self.page.read_text() + '\nChanged authored content.\n')
        with self.assertRaisesRegex(ValueError, 'empty release'):
            cards.release_cards(self.root, 'ms3')

    def test_one_site_source_stops_release(self):
        self.shipped['pages'][0]['sites'] = ['ms3']
        self.write('shipped_pages.json', self.shipped)
        with self.assertRaisesRegex(ValueError, 'audience'):
            cards.release_cards(self.root, 'ms3')

    def test_comparison_operators_survive_inline_html_normalization(self):
        text = 'Use < 5 when <em>low</em> and > 10 when <strong class="high">high</strong>.'
        self.assertEqual(cards.normalize(text), 'Use < 5 when low and > 10 when high.')
        self.assertEqual(cards.normalize('Use <5 when low and >10 when high.'),
                         'Use <5 when low and >10 when high.')

    def test_selected_evidence_links_require_deliberate_update_when_canonical_url_changes(self):
        registry = self.root/'evidence_registry.json'
        row = {'id':'source', 'citation':{'url':'https://example.org/original'}}
        registry.write_text(json.dumps({'sources':[row]}))
        self.write('concept_evidence_links.json', {'schemaVersion':1,'links':{'source':'https://example.org/original'}})
        before = cards.citation_face(self.root, 'Exact source words.[^source]')
        row['governance'] = {'note':'Internal review metadata'}
        registry.write_text(json.dumps({'sources':[row]}))
        self.assertEqual(cards.citation_face(self.root, 'Exact source words.[^source]'), before)
        row['citation']['url'] = 'https://example.org/changed'
        registry.write_text(json.dumps({'sources':[row]}))
        with self.assertRaisesRegex(ValueError, 'evidence link drift'):
            cards.citation_face(self.root, 'Exact source words.[^source]')

    def test_citation_resolution_rejects_missing_ambiguous_or_unsafe_registry_rows(self):
        registry = self.root/'evidence_registry.json'
        for sources in [[], [{'id':'source','citation':{'url':'javascript:alert(1)'}}], [{'id':'source','citation':{'url':'https://example.org'}}]*2]:
            registry.write_text(json.dumps({'sources': sources}))
            with self.subTest(sources=sources), self.assertRaises(ValueError):
                cards.citation_face(self.root, 'Exact source words.[^source]')

    def test_heading_variant_and_inline_formatting(self):
        text = '# Topic\n\n## In one line\nA **specific** answer.\n\n## High-yield pearls\n- First *answer*.\n\n## Next section\n- Not a pearl\n'
        self.assertEqual(cards.extract_sections(text), {'summary': ['A specific answer.'], 'pearl': ['First answer.']})

    def test_missing_excerpt_and_duplicate_ids_fail(self):
        self.page.write_text(self.page.read_text().replace('- First answer\n', ''))
        with self.assertRaisesRegex(ValueError, 'first'):
            cards.validate_candidates(self.root, self.document)
        self.page.write_text('# Example\n**High-yield pearls**\n- First answer\n- Second answer\n')
        self.document['notes'][1]['targets'][0]['id'] = 'first:1'
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            cards.validate_candidates(self.root, self.document)

    def test_partial_withholding_reports_ids_and_current_status(self):
        other = self.root / '03_Core_Topics/other.md'
        other.write_text('# Other\n**In one line** — A separate answer.\n')
        self.shipped['pages'].append({'kind': 'page', 'source': '03_Core_Topics/other.md',
            'slug': 'other.md', 'title': 'Other', 'sites': ['ms3', 'res']})
        self.write('shipped_pages.json', self.shipped)
        self.document['notes'].append({'id': 'other', 'source': '03_Core_Topics/other.md',
            'kind': 'summary', 'excerpt': 'A separate answer.',
            'targets': [{'id': 'other:1', 'text': 'separate', 'contentRevision': 1}]})
        self.write('concept_candidates.json', self.document)
        feed = cards.release_cards(self.root, 'ms3')
        self.assertEqual([c['id'] for c in feed['cards']], ['CONCEPT#first:1@1', 'CONCEPT#second:1@1'])
        self.assertEqual(feed['withheld'], [{'id': 'CONCEPT#other:1@1', 'source': '03_Core_Topics/other.md', 'reason': 'pending'}])
        ledger_path = self.root / '13_Faculty_Resources/reviewed.json'
        ledger = json.loads(ledger_path.read_text())
        ledger['other.md'] = dict(ledger['different-route.md'], contentHash=attestation_hash.digest_from_tree(self.root, self.shipped, {}, 'other.md'))
        ledger_path.write_text(json.dumps(ledger))
        self.assertEqual(len(cards.release_cards(self.root, 'res')['cards']), 3)

    def test_ethics_mismatch_cannot_fall_back(self):
        self.document['notes'][0]['id'] = 'ethics-capacity'
        self.document['notes'][0]['targets'][0]['text'] = 'competence'
        with self.assertRaisesRegex(ValueError, 'ethics-capacity'):
            cards.validate_candidates(self.root, self.document)


class PublishedInventoryTests(unittest.TestCase):
    def test_real_generated_feed_hides_citation_keys_and_excluded_excerpts(self):
        root = HERE.parents[2]
        feed = cards.release_cards(root, 'ms3')
        registry = {s['id']: s for s in json.loads((root/'evidence_registry.json').read_text())['sources']}
        for card in feed['cards']:
            with self.subTest(card=card['id']):
                self.assertNotIn('[^', card['q'])
                self.assertNotIn('[^', card['reveal'])
                for evidence in card.get('evidence', []):
                    self.assertEqual(evidence['url'], registry[evidence['id']]['citation']['url'])
        self.assertTrue(any(c.get('evidence') for c in feed['cards']))

    def test_release_omits_excluded_excerpts_but_catalog_retains_them(self):
        root = HERE.parents[2]
        feed = cards.release_cards(root, 'ms3')
        self.assertTrue(any(e.get('excerpt') for e in cards.load_candidates(root)['exclusions']))
        for excluded in cards.load_candidates(root)['exclusions']:
            if excluded.get('excerpt'):
                self.assertNotIn(excluded['excerpt'], json.dumps(feed, ensure_ascii=False))

    def test_all_historical_faces_match_baseline_including_withdrawn_clozes(self):
        import html, re
        root = HERE.parents[2]
        cw = json.loads((HERE/'concept_guid_crosswalk.json').read_text())
        with zipfile.ZipFile(root/cw['package']) as archive, tempfile.TemporaryDirectory() as tmp:
            archive.extract('collection.anki2', tmp)
            with closing(sqlite3.connect(str(Path(tmp)/'collection.anki2'))) as db:
                fields = {guid: text.split('\x1f') for guid,text in db.execute('select guid,flds from notes')}
        for row in cw['cards']:
            field = fields[row['oldGuid']]
            text = field[2]
            front = re.sub(r'\{\{c(\d+)::(.*?)\}\}', lambda m: '[…]' if int(m[1]) == row['oldOrdinal']+1 else m[2], text)
            self.assertEqual(row['oldFront'], cards.normalize(html.unescape(front)))
            back = field[3] if len(field) == 5 else re.sub(r'\{\{c(\d+)::(.*?)\}\}', lambda m:m[2], text)
            self.assertEqual(row['oldBack'], cards.normalize(html.unescape(back)))

    def test_every_published_card_has_unique_migration_and_current_coverage(self):
        root = HERE.parents[2]
        document = cards.load_candidates(root)
        candidates = cards.validate_candidates(root, document)
        crosswalk = json.loads((HERE / 'concept_guid_crosswalk.json').read_text())
        cross = crosswalk['cards']
        with zipfile.ZipFile(root / crosswalk['package']) as archive, tempfile.TemporaryDirectory() as temp:
            archive.extract('collection.anki2', temp)
            with closing(sqlite3.connect(str(Path(temp) / 'collection.anki2'))) as db:
                published = set(db.execute('select notes.guid, cards.ord from cards join notes on notes.id=cards.nid'))
                self.assertEqual(db.execute('select count(*) from notes').fetchone()[0], 142)
        self.assertEqual(len(published), 158)
        self.assertEqual({(r['oldGuid'], r['oldOrdinal']) for r in cross}, published)
        self.assertEqual(len(cross), len(published))
        self.assertEqual(len({r['editorialId'] for r in cross}), len(cross))
        active = {r['editorialId'] for r in cross if r['identityAction'] != 'withdrawn'}
        self.assertEqual({c['editorialId'] for c in candidates}, active)
        self.assertEqual(len(candidates), 154)
        self.assertEqual(len({n['source'] for n in document['notes']}), 22)
        inventory = cards._inventory(root)
        self.assertEqual(len(inventory), 38)
        for row in crosswalk['coverageInventory']:
            page, sections = inventory[row['source']]
            self.assertEqual(row['page'], page['slug'])
            self.assertEqual(row['sections'], {k: len(v) for k, v in sections.items()})
            self.assertEqual(row['mappedNotes'], sum(n['source'] == row['source'] for n in document['notes']))
        self.assertEqual({row['source'] for row in crosswalk['coverageInventory']}, set(inventory))
        self.assertEqual(sum('kind' not in e for e in document['exclusions']), 16)
        self.assertFalse(any(c['q'] in ('In one line?', 'Recall the key point:', '[…]') for c in candidates))


if __name__ == '__main__':
    unittest.main()
