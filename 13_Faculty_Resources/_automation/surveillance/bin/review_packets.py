"""Append-preserving evidence inbox. No faculty decision or attestation writes."""
from copy import deepcopy
import json
from pathlib import Path
import jsonschema
from question_impact import revision


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
        superseded = {r for p in state['packets'] for r in p.get('supersedes', [])}
        recoveries = [p for p in state['packets'] if p['sourceId'] == source
                      and p['revision'] not in superseded and p.get('mappingStatus') == 'unavailable'
                      and p.get('lexicalScanStatus') == 'complete'
                      and review.get('status') in ('changed', 'unchanged', 'first-observation', 'outside-mapped-passages')
                      and impact['status'] == 'complete']
        if changed or recoveries:
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
        if review.get('status') == 'unavailable' and prior:
            valid['passage_review'] = deepcopy(prior.get('passage_review', {}))
        state['latestValid'][source] = valid
    return state
