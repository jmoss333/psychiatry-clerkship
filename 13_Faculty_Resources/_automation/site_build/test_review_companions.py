"""Source and governance contracts for the Daily Review evidence companion."""
import copy
import importlib
import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock

import test_concept_cards as fixtures
import attestation_hash
import concept_cards
import teaching_dependencies

HERE = fixtures.HERE
MAP = '13_Faculty_Resources/_automation/site_build/review_companion_pairs.json'
REGISTRY = 'evidence_registry.json'
ANNOTATIONS = 'evidence_annotations.json'
QUIZZES = '07_Evidence_and_Reading/Landmark_Trials/quizzes.json'


class ReviewCompanionTests(unittest.TestCase):
    setUp = fixtures.ConceptCardsTests.setUp
    write = fixtures.ConceptCardsTests.write
    sign = fixtures.ConceptCardsTests.sign

    def projection(self):
        self.assertIsNotNone(importlib.util.find_spec('review_companions'),
                             'review_companions projection is missing')
        return importlib.import_module('review_companions')

    def pair_fixture(self):
        self.page.write_text('# Example\n\n**High-yield pearls.**\n'
                             '- First answer.[^paper]\n- Second answer\n')
        self.document['notes'][0]['excerpt'] = 'First answer.[^paper]'
        self.write('concept_candidates.json', self.document)
        self.write('concept_evidence_links.json',
                   {'schemaVersion': 1, 'links': {'paper': 'https://example.org/paper'}})
        self.sign()
        registry = {'sources': [{
            'id': 'paper', 'identity': {'status': 'verified'},
            'citation': {'title': 'Study title', 'url': 'https://example.org/paper'},
            'appraisal': {'reviewStatus': 'reviewed',
                          'outcomes': 'Observed result; unsupported further detail.',
                          'limitations': 'Earlier caveat; important limitation.'},
        }]}
        (self.root / REGISTRY).write_text(json.dumps(registry))
        (self.root / ANNOTATIONS).write_text(json.dumps({
            'annotations': [{'sourceId': 'paper', 'sourceSpan': 'Observed result.'}]}))
        quiz = self.root / QUIZZES
        quiz.parent.mkdir(parents=True)
        quiz.write_text(json.dumps({'decks': [{
            'id': 'AR-1', 'title': 'Study title',
            'questions': [{'q': 'What did the study find?',
                           'o': [{'t': 'A', 'c': True}, {'t': 'B', 'c': False}]}],
        }]}))
        pair = {'clinicalCardId': 'CONCEPT#first:1@1',
                'articleCardId': 'AR-1#0',
                'articleQuestion': 'What did the study find?',
                'sourceId': 'paper',
                'resultExcerpt': 'Observed result',
                'limitationExcerpt': 'important limitation.',
                'expected': {'title': 'Study title',
                             'result': 'Observed result; unsupported further detail.',
                             'limitation': 'Earlier caveat; important limitation.',
                             'url': 'https://example.org/paper'}}
        self.write('review_companion_pairs.json', {'schemaVersion': 1, 'pairs': [pair]})
        return registry, pair

    def test_projects_exact_reviewed_appraisal_into_deterministic_feed(self):
        self.pair_fixture()
        raw = self.projection().feed_bytes(self.root, 'ms3')
        self.assertTrue(raw.endswith(b'\n'))
        self.assertEqual(raw, self.projection().feed_bytes(self.root, 'ms3'))
        self.assertEqual(json.loads(raw), {'schemaVersion': 1, 'pairs': [{
            'clinicalCardId': 'CONCEPT#first:1@1',
            'articleCardId': 'AR-1#0',
            'sourceId': 'paper',
            'title': 'Study title',
            'result': 'Observed result',
            'limitation': 'important limitation.',
            'url': 'https://example.org/paper',
        }]})

    def test_registry_drift_and_unreviewed_source_fail_closed(self):
        registry, _ = self.pair_fixture()
        for path, value, why in [
            (('appraisal', 'outcomes'), 'Changed result.', 'source drift'),
            (('appraisal', 'limitations'), 'Changed limit.', 'source drift'),
            (('citation', 'url'), 'http://example.org/paper', 'HTTPS'),
            (('appraisal', 'reviewStatus'), 'pending', 'reviewed'),
        ]:
            changed = copy.deepcopy(registry)
            changed['sources'][0][path[0]][path[1]] = value
            (self.root / REGISTRY).write_text(json.dumps(changed))
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, why):
                self.projection().feed_bytes(self.root, 'ms3')

    def test_article_question_position_and_source_evidence_are_pinned(self):
        _, pair = self.pair_fixture()
        quiz = self.root / QUIZZES
        changed = json.loads(quiz.read_text())
        changed['decks'][0]['questions'].insert(0, {'q': 'Another question?',
            'o': [{'t': 'A', 'c': True}, {'t': 'B', 'c': False}]})
        quiz.write_text(json.dumps(changed))
        with self.assertRaisesRegex(ValueError, 'article question'):
            self.projection().feed_bytes(self.root, 'ms3')
        quiz.write_text(json.dumps({'decks': []}))
        with self.assertRaisesRegex(ValueError, 'article card'):
            self.projection().feed_bytes(self.root, 'ms3')
        self.write('review_companion_pairs.json', {'schemaVersion': 1, 'pairs': [
            dict(pair, sourceId='unrelated')]})
        with self.assertRaisesRegex(ValueError, 'evidence source'):
            self.projection().feed_bytes(self.root, 'ms3')

    def test_limitation_excerpt_must_be_an_exact_part_of_pinned_appraisal(self):
        _, pair = self.pair_fixture()
        for excerpt in ('Edited limitation.', '', 'Important limitation.'):
            self.write('review_companion_pairs.json', {'schemaVersion': 1, 'pairs': [
                dict(pair, limitationExcerpt=excerpt)]})
            with self.subTest(excerpt=excerpt), self.assertRaisesRegex(ValueError, 'limitation excerpt'):
                self.projection().feed_bytes(self.root, 'ms3')

    def test_result_excerpt_must_be_an_exact_prefix_of_pinned_appraisal(self):
        _, pair = self.pair_fixture()
        for excerpt in ('Edited result', '', 'result; unsupported further detail.'):
            self.write('review_companion_pairs.json', {'schemaVersion': 1, 'pairs': [
                dict(pair, resultExcerpt=excerpt)]})
            with self.subTest(excerpt=excerpt), self.assertRaisesRegex(ValueError, 'result excerpt'):
                self.projection().feed_bytes(self.root, 'ms3')

    def test_reopened_clinical_page_withholds_bridge_without_erasing_pair_intent(self):
        self.pair_fixture()
        other = self.root / '03_Core_Topics/other.md'
        other.write_text('# Other\n\n**In one line** — Another answer.\n')
        self.shipped['pages'].append({'kind': 'page', 'source': '03_Core_Topics/other.md',
                                      'slug': 'other.md', 'title': 'Other',
                                      'sites': ['ms3', 'res']})
        self.write('shipped_pages.json', self.shipped)
        self.document['notes'].append({'id': 'other', 'source': '03_Core_Topics/other.md',
            'kind': 'summary', 'excerpt': 'Another answer.',
            'targets': [{'id': 'other:1', 'text': 'Another', 'contentRevision': 1}]})
        self.write('concept_candidates.json', self.document)
        self.sign('pending')
        ledger_path = self.root / '13_Faculty_Resources/reviewed.json'
        ledger = json.loads(ledger_path.read_text())
        ledger['other.md'] = {'status': 'reviewed', 'at': '2026-01-01',
            'by': 'Synthetic Faculty, MD', 'risk': {'kind': 'clinical', 'level': 'moderate'},
            'contentHash': attestation_hash.digest_from_tree(self.root, self.shipped, {}, 'other.md')}
        ledger_path.write_text(json.dumps(ledger))
        self.assertEqual(json.loads(self.projection().feed_bytes(self.root, 'ms3'))['pairs'], [])

    def test_resident_projection_uses_resident_release_set(self):
        self.pair_fixture()
        projection = self.projection()
        original_release = concept_cards.release_cards

        def release_for_site(root, site):
            document = original_release(root, site)
            return document if site == 'ms3' else dict(document, cards=[])

        def pair_count(site):
            try:
                return len(json.loads(projection.feed_bytes(self.root, site))['pairs'])
            except TypeError as error:
                self.fail('companion feed does not accept a site: ' + str(error))

        with mock.patch.object(concept_cards, 'release_cards', side_effect=release_for_site):
            self.assertEqual(pair_count('ms3'), 1)
            self.assertEqual(pair_count('res'), 0)

    def test_build_dependency_checks_exact_companion_bytes_and_all_teaching_inputs(self):
        self.pair_fixture()
        tool = self.root / 'review.html'
        tool.write_text('<html><body><script>fetch("review_companions.json")</script></body></html>')
        page = {'source': 'review.html', 'slug': 'review.html', 'kind': 'tool',
                'sites': ['ms3', 'res']}
        self.shipped['pages'].append(page)
        self.write('shipped_pages.json', self.shipped)
        out = self.root / '_build/ms3'
        (out / 'tools').mkdir(parents=True)
        (out / 'tools/review.html').write_bytes(tool.read_bytes())
        (out / 'tools/concepts.json').write_bytes(concept_cards.feed_bytes(self.root, 'ms3'))
        asset = out / 'tools/review_companions.json'
        asset.write_bytes(self.projection().feed_bytes(self.root, 'ms3'))
        self.assertEqual(teaching_dependencies.discover(self.root, page, {}, 'ms3', out),
                         {str(MAP),
                          '13_Faculty_Resources/_automation/site_build/concept_candidates.json',
                          '13_Faculty_Resources/_automation/site_build/concept_evidence_links.json'})
        registry_path = self.root / REGISTRY
        registry_bytes = registry_path.read_bytes()
        registry_path.unlink()
        with self.assertRaisesRegex(teaching_dependencies.DependencyError, 'missing teaching source evidence_registry.json'):
            teaching_dependencies.discover(self.root, page, {}, 'ms3')
        registry_path.write_bytes(registry_bytes)
        asset.write_bytes(b'{"schemaVersion":1,"pairs":[]}\n')
        with self.assertRaisesRegex(teaching_dependencies.DependencyError, 'review_companions.json'):
            teaching_dependencies.discover(self.root, page, {}, 'ms3', out)
        asset.unlink()
        with self.assertRaisesRegex(teaching_dependencies.DependencyError, 'review_companions.json'):
            teaching_dependencies.discover(self.root, page, {}, 'ms3', out)


class RealReviewCompanionTests(unittest.TestCase):
    def test_current_pair_projects_catie_appraisal_without_rewriting_quiz(self):
        self.assertIsNotNone(importlib.util.find_spec('review_companions'))
        projection = importlib.import_module('review_companions')
        root = HERE.parents[2]
        raw = projection.feed_bytes(root, 'ms3')
        pairs = json.loads(raw)['pairs']
        clinical_id = 'CONCEPT#t_psychosis-pearl3:1@2'
        released = {card['id'] for card in concept_cards.release_cards(root, 'ms3')['cards']}
        self.assertEqual(len(pairs), int(clinical_id in released))
        if pairs:
            self.assertEqual(pairs[0]['clinicalCardId'], clinical_id)
            self.assertEqual(pairs[0]['articleCardId'], 'AR-24#5')
            source = next(s for s in json.loads((root / REGISTRY).read_text())['sources']
                          if s['id'] == 'lieberman-2005-catie')
            expected_result = 'Seventy-four percent discontinued assigned treatment before 18 months; olanzapine had longer persistence than some agents but greater weight and metabolic effects'
            self.assertEqual(pairs[0]['result'], expected_result)
            self.assertTrue(source['appraisal']['outcomes'].startswith(expected_result))
            expected_excerpt = 'time to discontinuation combines efficacy, tolerability, and other reasons rather than isolating symptom efficacy.'
            self.assertEqual(pairs[0]['limitation'], expected_excerpt)
            self.assertIn(expected_excerpt, source['appraisal']['limitations'])


if __name__ == '__main__':
    unittest.main()
