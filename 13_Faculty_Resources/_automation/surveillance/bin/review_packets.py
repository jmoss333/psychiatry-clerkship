"""Append-preserving evidence inbox. No faculty decision or attestation writes."""
from copy import deepcopy
from question_impact import revision


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
        if changed:
            if impact['status'] != 'complete':
                state['failures'].append({'sourceId': source, 'reason': 'Question scan incomplete'})
            packet = {'sourceId': source, 'sourceUrl': row['source_url'],
                      'sourceName': row.get('source_name', source),
                      'oldHash': prior.get('hash'), 'newHash': row.get('hash'),
                      'observedAt': row['observed_at'] if 'observed_at' in row else report['generated_at'],
                      'previousObservedAt': prior.get('observed_at'),
                      'passages': review.get('packets', []),
                      'diff': row.get('diff', ''), 'mappingStatus': review.get('status', 'not-configured'),
                      'candidates': impact['candidates'], 'coverage': impact['coverage'],
                      'scanStatus': impact['status'], 'readings': impact.get('readings', []),
                      'questionSnapshots': impact.get('questionSnapshots', {})}
            # Identity excludes timestamps: repeats deduplicate, later cycles retain their occurrence.
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
