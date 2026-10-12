"""Append-preserving evidence inbox. No faculty decision or attestation writes."""
from copy import deepcopy
import json
import re
from pathlib import Path
import jsonschema
from question_impact import revision


def bold_only_change(before, after):
    """Conservative allowlist, not a general Markdown-to-text conversion.

    Only balanced **plain words** may differ. Reject contexts where stars can
    be literal code, link targets, HTML, escapes or other Markdown syntax.
    Unrecognized syntax stays reviewable rather than being guessed harmless.
    """
    if not isinstance(before, str) or not isinstance(after, str) or not before or before == after:
        return False
    def plain(text):
        if any(c in text for c in '`\\[]<>_|~'):
            return None
        stripped = re.sub(r'(?<![\w*])\*\*([A-Za-z0-9]+(?: [A-Za-z0-9]+)*)\*\*(?![\w*])', r'\1', text)
        return None if '*' in stripped else stripped
    left, right = plain(before), plain(after)
    return left is not None and right is not None and left == right


def formatting_only_change(prior, row):
    """Full snapshot and every mapped passage must independently be harmless."""
    if not prior or not bold_only_change(prior.get('text'), row.get('text')):
        return False
    old_review, review = prior.get('passage_review', {}), row.get('passage_review', {})
    if any(r.get('status') == 'unavailable' for r in (old_review, review)):
        return False
    old, new = old_review.get('observations', {}), review.get('observations', {})
    if not isinstance(old, dict) or not isinstance(new, dict) or old.keys() != new.keys():
        return False
    for key in old:
        a, b = old[key], new[key]
        if not isinstance(a, dict) or not isinstance(b, dict):
            return False
        if {k: v for k, v in a.items() if k != 'quote'} != {k: v for k, v in b.items() if k != 'quote'}:
            return False
        if a.get('quote') != b.get('quote') and not bold_only_change(a.get('quote'), b.get('quote')):
            return False
    return True


def validate_state(state):
    schema = json.loads((Path(__file__).resolve().parent.parent / 'config/review_packets.schema.json').read_text())
    try:
        jsonschema.validate(state, schema)
    except jsonschema.ValidationError as exc:
        raise ValueError('Malformed evidence inbox') from exc
    ids = [p['revision'] for p in state['packets']]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate packet revisions')


def merge_observation(previous, report, impacts):
    if previous is not None and (previous.get('version') != 1 or previous.get('mode') != report['mode']):
        raise ValueError('Incompatible prior packet state')
    state = deepcopy(previous) if previous is not None else {
        'version': 1, 'mode': report['mode'], 'packets': [], 'latestValid': {}, 'failures': []}
    state['generatedAt'] = report['generated_at']
    state['failures'] = []
    for row in report['results']:
        source = row['source_id']
        prior = state['latestValid'].get(source)
        review = row.get('passage_review', {})
        impact = impacts.get(source, {'status': 'incomplete', 'coverage': {}, 'candidates': []})
        if row['status'] == 'unable-to-check':
            state['failures'].append({'sourceId': source, 'reason': row.get('reason', 'Retrieval incomplete')})
            continue
        if review.get('status') == 'unavailable':
            state['failures'].append({'sourceId': source, 'reason': review.get('reason', 'Passage mapping unavailable')})
        changed = prior is not None and (row.get('hash') != prior.get('hash') or
                  review.get('observations') != prior.get('passage_review', {}).get('observations'))
        formatting_only = changed and impact['status'] == 'complete' and formatting_only_change(prior, row)
        superseded = {r for p in state['packets'] for r in p.get('supersedes', [])}
        recoveries = [p for p in state['packets'] if p['sourceId'] == source
                      and p['revision'] not in superseded and p.get('mappingStatus') == 'unavailable'
                      and p.get('lexicalScanStatus') == 'complete'
                      and review.get('status') in ('changed', 'unchanged', 'first-observation', 'outside-mapped-passages')
                      and impact['status'] == 'complete']
        if (changed and not formatting_only) or recoveries:
            if impact['status'] != 'complete':
                state['failures'].append({'sourceId': source, 'reason': 'Question scan incomplete'})
            packet = {'sourceId': source, 'sourceUrl': row['source_url'],
                      'sourceName': row.get('source_name', source),
                      'oldHash': prior.get('hash'), 'newHash': row.get('hash'),
                      'observedAt': row['observed_at'] if 'observed_at' in row else report['generated_at'],
                      'previousObservedAt': prior.get('observed_at'),
                      'passages': review.get('packets', []),
                      'diff': row.get('diff', ''), 'mappingStatus': review.get('status', 'not-configured'),
                      'candidates': deepcopy(impact['candidates']), 'coverage': deepcopy(impact['coverage']),
                      'lexicalScanStatus': impact['status'],
                      'scanStatus': 'incomplete' if review.get('status') == 'unavailable' else impact['status'], 'readings': deepcopy(impact.get('readings', [])),
                      'questionSnapshots': impact.get('questionSnapshots', {})}
            packet['supersedes'] = [p['revision'] for p in recoveries]
            for old_packet in recoveries:
                for candidate in old_packet['candidates']:
                    if not any(c['questionId'] == candidate['questionId'] and c['fieldPath'] == candidate['fieldPath']
                               for c in packet['candidates']):
                        packet['candidates'].append(deepcopy(candidate))
                for reading in old_packet['readings']:
                    if not any(r['source'] == reading['source'] for r in packet['readings']):
                        packet['readings'].append(deepcopy(reading))
            # Identity excludes timestamps: repeats deduplicate, later cycles retain their occurrence.
            packet['occurrence'] = 1 + sum(p['sourceId'] == source for p in state['packets'])
            identity = {k: v for k, v in packet.items() if k not in ('observedAt', 'previousObservedAt')}
            packet['revision'] = revision(identity)
            if not any(p['revision'] == packet['revision'] for p in state['packets']):
                state['packets'].append(packet)
        # Preserve prior mapping receipt across failed mapping examinations.
        valid = deepcopy(row)
        valid['changeClassification'] = ('formatting-only' if formatting_only else
                                         'review-required' if changed else 'unchanged' if prior else 'first-observation')
        if review.get('status') == 'unavailable' and prior:
            valid['passage_review'] = deepcopy(prior.get('passage_review', {}))
        state['latestValid'][source] = valid
    return state
