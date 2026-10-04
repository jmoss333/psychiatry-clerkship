#!/usr/bin/env python3
"""Bounded weekly collector: exit 0 quiet, 1 changed, 2 incomplete. No clinical edits."""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import lib_surveillance as L
import run_firecrawl_pilot as R
from question_impact import scan_impacts
from review_packets import merge_observation, validate_state

DEFAULT_STATE = Path(L.SURV_ROOT) / 'history/firecrawl/inbox.json'


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if len(text.encode()) > 8_000_000:
        raise ValueError('Evidence inbox exceeds supported size; retain existing state and review storage')
    temp = path.with_suffix('.tmp')
    temp.write_text(text)
    temp.replace(path)


def change_passages(row, prior):
    """Scan complete snapshot changes, including changes outside precise maps."""
    passages = list(row.get('passage_review', {}).get('packets', []))
    if row['status'] != 'changed':
        return passages
    if not isinstance((prior or {}).get('text'), str) or not isinstance(row.get('text'), str):
        raise ValueError('Full source comparison unavailable')
    before, after = prior['text'].split('. '), row['text'].split('. ')
    old, new = [], []
    for tag, a, b, c, d in difflib.SequenceMatcher(None, before, after, autojunk=False).get_opcodes():
        if tag != 'equal':
            old.extend(before[a:b]); new.extend(after[c:d])
    passages.append({'id': row['source_id'] + ':unlocalized', 'old': '. '.join(old),
                     'new': '. '.join(new), 'sourceCoverage': 'complete-snapshot-delta'})
    return passages


def collect(args):
    previous = json.loads(args.state.read_text()) if args.state.exists() else None
    if previous is not None:
        validate_state(previous)
    mode = 'fixture' if args.responses else 'live'
    if previous and previous.get('mode') != mode:
        raise ValueError('Cannot mix synthetic and live evidence')
    args.out_dir.mkdir(parents=True, exist_ok=False)
    if not args.responses and not os.environ.get('FIRECRAWL_API_KEY'):
        state = previous or {'version': 1, 'mode': 'live', 'packets': [], 'latestValid': {}}
        state['generatedAt'] = L.utcnow()
        state['failures'] = [{'sourceId': s, 'reason': 'FIRECRAWL_API_KEY is not configured'} for s in R.DEFAULT_IDS]
        validate_state(state)
        atomic_json(args.state, state)
        atomic_json(args.out_dir / 'receipt.json', {'status': 'incomplete', 'requested': list(R.DEFAULT_IDS), 'examined': [], 'apiRequests': 0})
        return 2
    cmd = [sys.executable, str(Path(__file__).with_name('run_firecrawl_pilot.py')), '--out-dir', str(args.out_dir / 'collection')]
    if previous and previous['latestValid']:
        prior = {'mode': mode, 'extractor': R.EXTRACTOR, 'results': list(previous['latestValid'].values())}
        atomic_json(args.out_dir / 'previous.json', prior)
        cmd += ['--previous', str(args.out_dir / 'previous.json')]
    if args.responses:
        cmd += ['--responses', str(args.responses), '--fixture']
    result = subprocess.run(cmd, capture_output=True, text=True)
    path = args.out_dir / 'collection/report.json'
    if not path.exists():
        raise ValueError('Collector did not produce an examination report')
    report = json.loads(path.read_text())
    if [r['source_id'] for r in report['results']] != list(R.DEFAULT_IDS):
        raise ValueError('Collector source coverage differs from requested set')
    bank = json.loads((Path(L.LIB_ROOT) / 'question_bank.json').read_text())
    impacts = {}
    for row in report['results']:
        try:
            passages = change_passages(row, (previous or {}).get('latestValid', {}).get(row['source_id']))
            source_error = None
        except ValueError as exc:
            passages = row.get('passage_review', {}).get('packets', [])
            source_error = str(exc)
        links = {p['id']: [q['id'] for q in row.get('questions', [])] for p in passages}
        impact = scan_impacts(bank, passages, links)
        if source_error:
            impact['status'] = 'incomplete'
            impact['coverage']['errors'].append(source_error)
        impact['coverage']['sourceText'] = 'incomplete' if source_error else 'complete snapshot delta plus mapped passages'
        impact['questionSnapshots'] = {q['id']: q for q in bank['items']
                                      if any(c['questionId'] == q['id'] for c in impact['candidates'])}
        refs = {r['source']: r for p in passages for r in p.get('readings', [])}
        # Citation-derived reading paths stay visibly broader than exact passage mappings.
        for source in row.get('affects', []):
            refs.setdefault(source, {'source': source, 'quote': '', 'page': '', 'confidence': 'citation association'})
        impact['readings'] = []
        for source, ref in refs.items():
            file = (Path(L.LIB_ROOT) / source).resolve()
            if not file.is_relative_to(Path(L.LIB_ROOT).resolve()) or not file.is_file() or file.suffix != '.md':
                impact['status'] = 'incomplete'
                impact['coverage']['errors'].append('Reading source unavailable: ' + source)
                continue
            impact['readings'].append({**ref, 'revision': hashlib.sha256(file.read_bytes()).hexdigest()})
        impacts[row['source_id']] = impact
    state = merge_observation(previous, report, impacts)
    if result.returncode not in (0, 1):
        state['failures'].append({'sourceId': 'collector', 'reason': 'Examination incomplete; inspect collection report'})
    validate_state(state)
    atomic_json(args.state, state)
    atomic_json(args.out_dir / 'receipt.json', {'status': 'incomplete' if state['failures'] else 'complete',
        'requested': list(R.DEFAULT_IDS), 'examined': [r['source_id'] for r in report['results'] if r['status'] != 'unable-to-check'],
        'apiRequests': 0 if args.responses else len(R.DEFAULT_IDS), 'pendingPackets': len(state['packets'])})
    brief = ['# Faculty source-change inbox', '', 'Potential impact only; faculty judgment required.', '']
    for packet in state['packets']:
        brief += ['## ' + packet['sourceName'], packet['sourceUrl'], '']
        for c in packet['candidates']:
            brief += [f"### {c['questionId']} · {c['fieldPath']} · {c['kind']}",
                      L.sanitize_crawled_text(c['quote']), L.sanitize_crawled_text(c['reason']), '']
    (args.out_dir / 'faculty-brief.md').write_text('\n'.join(brief))
    return 2 if state['failures'] else 1 if len(state['packets']) > len((previous or {}).get('packets', [])) else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir', type=Path, required=True)
    parser.add_argument('--state', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--responses', type=Path, help='Offline synthetic responses; cannot update live history')
    args = parser.parse_args()
    try:
        return collect(args)
    except (OSError, ValueError, KeyError, TypeError):
        print('Evidence collection incomplete; existing state must not be treated as current.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
