"""Project explicitly paired Review cards from canonical, reviewed study appraisals.

The pair map pins intent and exact source wording. The released feed takes its
visible result and limitation from evidence_registry.json, never quiz feedback.
"""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

import concept_cards


PAIRS = Path('13_Faculty_Resources/_automation/site_build/review_companion_pairs.json')
QUIZZES = Path('07_Evidence_and_Reading/Landmark_Trials/quizzes.json')
REGISTRY = Path('evidence_registry.json')
ARTICLE_ID = re.compile(r'^(AR|SP)-[0-9]+#([0-9]+)$')


def _read(root, path):
    return json.loads((Path(root) / path).read_text(encoding='utf-8'))


def _safe_https(value):
    if not isinstance(value, str) or not value or any(c.isspace() for c in value):
        return False
    parsed = urlsplit(value)
    return parsed.scheme == 'https' and bool(parsed.netloc) and not parsed.username and not parsed.password


def _exact_article(quiz, article_id, expected_question):
    match = ARTICLE_ID.fullmatch(article_id) if isinstance(article_id, str) else None
    if not match:
        raise ValueError('companion article card ID invalid: ' + str(article_id))
    deck_id, index = article_id.rsplit('#', 1)
    decks = [deck for deck in quiz.get('decks', []) if deck.get('id') == deck_id]
    if len(decks) != 1:
        raise ValueError('companion article card missing or ambiguous: ' + article_id)
    questions = decks[0].get('questions', [])
    if int(index) >= len(questions):
        raise ValueError('companion article card missing: ' + article_id)
    question = questions[int(index)]
    if not isinstance(expected_question, str) or not expected_question or question.get('q') != expected_question:
        raise ValueError('companion article question drift: ' + article_id)
    choices = question.get('o', [])
    if not isinstance(choices, list) or sum(option.get('c') is True for option in choices) != 1:
        raise ValueError('companion article question has no unique answer: ' + article_id)


def project(root, site):
    """Return release-eligible bridges; invalid authored mappings fail the build."""
    root = Path(root)
    if site not in ('ms3', 'res'):
        raise ValueError('companion site invalid: ' + str(site))
    mapping = _read(root, PAIRS)
    if mapping.get('schemaVersion') != 1 or not isinstance(mapping.get('pairs'), list) or not mapping['pairs']:
        raise ValueError('companion pair map missing or invalid')
    candidates = {card['id']: card for card in concept_cards.validate_candidates(
        root, concept_cards.load_candidates(root))}
    released = {card['id'] for card in concept_cards.release_cards(root, site)['cards']}
    registry = _read(root, REGISTRY)
    quiz = _read(root, QUIZZES)
    if not isinstance(registry.get('sources'), list) or not isinstance(quiz.get('decks'), list):
        raise ValueError('companion source registry or article quizzes invalid')
    output, clinical_ids, article_ids = [], set(), set()
    for pair in mapping['pairs']:
        if not isinstance(pair, dict) or set(pair) != {
                'clinicalCardId', 'articleCardId', 'articleQuestion', 'sourceId',
                'resultExcerpt', 'limitationExcerpt', 'expected'}:
            raise ValueError('companion pair fields invalid')
        clinical_id, article_id, source_id = (pair[key] for key in
            ('clinicalCardId', 'articleCardId', 'sourceId'))
        if not all(isinstance(value, str) and value for value in (clinical_id, article_id, source_id)):
            raise ValueError('companion pair ID invalid')
        if clinical_id in clinical_ids or article_id in article_ids:
            raise ValueError('companion pair duplicate card ID')
        clinical_ids.add(clinical_id)
        article_ids.add(article_id)
        clinical = candidates.get(clinical_id)
        if clinical is None:
            raise ValueError('companion clinical card missing or revised: ' + clinical_id)
        if source_id not in {evidence['id'] for evidence in clinical['evidence']}:
            raise ValueError('companion evidence source differs from clinical card: ' + clinical_id)
        _exact_article(quiz, article_id, pair['articleQuestion'])
        sources = [source for source in registry['sources'] if source.get('id') == source_id]
        if len(sources) != 1:
            raise ValueError('companion source missing or ambiguous: ' + source_id)
        source = sources[0]
        citation, appraisal = source.get('citation', {}), source.get('appraisal', {})
        if source.get('identity', {}).get('status') != 'verified' or appraisal.get('reviewStatus') != 'reviewed':
            raise ValueError('companion source is not verified and reviewed: ' + source_id)
        actual = {'title': citation.get('title'), 'result': appraisal.get('outcomes'),
                  'limitation': appraisal.get('limitations'), 'url': citation.get('url')}
        if not all(isinstance(value, str) and value.strip() for value in actual.values()) or not _safe_https(actual['url']):
            raise ValueError('companion source missing text or safe HTTPS URL: ' + source_id)
        expected = pair['expected']
        if not isinstance(expected, dict) or set(expected) != set(actual) or expected != actual:
            raise ValueError('companion source drift: ' + source_id)
        result_excerpt = pair['resultExcerpt']
        if (not isinstance(result_excerpt, str) or not result_excerpt or
                result_excerpt.strip() != result_excerpt or
                not actual['result'].startswith(result_excerpt)):
            raise ValueError('companion result excerpt is not a verbatim source prefix: ' + source_id)
        excerpt = pair['limitationExcerpt']
        if not isinstance(excerpt, str) or not excerpt or excerpt.strip() != excerpt or excerpt not in actual['limitation']:
            raise ValueError('companion limitation excerpt is not verbatim source text: ' + source_id)
        if clinical_id not in released:
            continue
        output.append({'clinicalCardId': clinical_id, 'articleCardId': article_id,
                       'sourceId': source_id,
                       **dict(actual, result=result_excerpt, limitation=excerpt)})
    return {'schemaVersion': 1, 'pairs': sorted(output, key=lambda row: row['clinicalCardId'])}


def feed_bytes(root, site):
    return (json.dumps(project(root, site), ensure_ascii=False, sort_keys=True,
                       separators=(',', ':')) + '\n').encode('utf-8')
