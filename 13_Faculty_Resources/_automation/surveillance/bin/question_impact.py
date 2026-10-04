"""Field-aware heuristic triage, never a clinical consistency verdict."""
import hashlib
import json
import re

VERSION = 'teaching-fields-v1'
STOP = set('the a an and or to of for in on is are be was were with by this that it as from should must requires required no not longer'.split())


def revision(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def words(text):
    return set(re.findall(r'[a-z][a-z0-9-]{3,}', text.lower())) - STOP


def stance(text):
    # Deliberately narrow: context-sensitive/historical language is triage only.
    if re.search(r'\b(historic\w*|previously|formerly|sometimes|unless|except)\b', text, re.I):
        return None
    if re.search(r'\b(no longer|not required|not recommended|do not|never)\b', text, re.I):
        return 'negative'
    if re.search(r'\b(requires?|required|must|mandatory|recommend\w*)\b', text, re.I):
        return 'positive'
    return None


def teaching_fields(item):
    def text(obj, key, prefix):
        value = obj.get(key)
        if value is not None:
            if not isinstance(value, str):
                raise ValueError(prefix + key + ' is not text')
            if value.strip():
                yield prefix + key, value
    def options(obj, prefix):
        for key in ('options', 'o'):
            if key not in obj:
                continue
            values = obj[key]
            if not isinstance(values, list):
                raise ValueError(prefix + key + ' is not an array')
            for n, option in enumerate(values):
                if not isinstance(option, dict):
                    raise ValueError('Malformed option')
                path = f'{prefix}{key}/{n}/'
                if option.get('c') is True:
                    yield from text(option, 't', path)
                yield from text(option, 'note', path)
                if 'trap' in option:
                    if not isinstance(option['trap'], dict):
                        raise ValueError('Malformed distractor feedback')
                    yield from text(option['trap'], 'note', path + 'trap/')
    for key in ('why', 'evidence', 'pearl'):
        yield from text(item, key, '/')
    yield from options(item, '/')
    if 'tier2' in item:
        if not isinstance(item['tier2'], dict):
            raise ValueError('Malformed second tier')
        yield from text(item['tier2'], 'why', '/tier2/')
        yield from options(item['tier2'], '/tier2/')


def scan_impacts(bank, changed_passages, citation_links):
    coverage = {'active': 0, 'retired': 0, 'scanned': 0, 'fields': 0,
                'errors': [], 'algorithm': VERSION,
                'limits': 'Lexical candidate detection only; no findings does not establish clinical consistency.'}
    candidates, seen = [], set()
    items = bank.get('items') if isinstance(bank, dict) else None
    if not isinstance(items, list) or not items:
        coverage['errors'].append('Question inventory empty or malformed')
        items = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not item['id'] or item['id'] in seen:
            coverage['errors'].append('Missing or duplicate question ID')
            continue
        seen.add(item['id'])
        if item.get('retired') or item.get('retiredReason'):
            coverage['retired'] += 1
            continue
        coverage['active'] += 1
        try:
            fields = list(teaching_fields(item))
        except ValueError as exc:
            coverage['errors'].append(item['id'] + ': ' + str(exc))
            continue
        coverage['scanned'] += 1
        coverage['fields'] += len(fields)
        context = str(item.get('stem', ''))
        for passage in changed_passages:
            old, new = passage.get('old', ''), passage.get('new', '')
            terms = words(old + ' ' + new)
            for path, quote in fields:
                shared = sorted(words(quote) & terms)
                direct = any(q.get('id') == item['id'] and q.get('field') == path
                             for q in passage.get('questions', []))
                linked = item['id'] in citation_links.get(passage['id'], [])
                if not direct and not linked and not shared:
                    continue
                opposite = stance(quote) and stance(new) and stance(quote) != stance(new)
                possible = bool(opposite and len(shared) >= 2)
                candidates.append({'questionId': item['id'], 'fieldPath': path, 'quote': quote,
                    'itemRevision': revision(item), 'context': context,
                    'sourcePassageId': passage['id'], 'confidence': 'direct' if direct else 'heuristic',
                    'kind': 'possible-contradiction' if possible else 'related-teaching',
                    'reason': ('Opposing requirement language; verify clinical context.' if possible else
                               'Related teaching; clinical effect has not been determined.') +
                              (' Shared terms: ' + ', '.join(shared) if shared else ' Recorded citation association.')})
    return {'status': 'incomplete' if coverage['errors'] else 'complete',
            'coverage': coverage, 'candidates': candidates}
