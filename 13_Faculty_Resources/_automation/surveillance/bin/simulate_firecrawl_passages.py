#!/usr/bin/env python3
"""Exercise the real pilot CLI with explicitly synthetic source changes; no network."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

import lib_surveillance as L
import passage_review as P


def fixture_markdown(config):
    sections = {}
    for link in P.validate(config):
        if link['source_id'] != 'clozapine-rems':
            continue
        paragraphs = sections.setdefault(link['heading'], [])
        while len(paragraphs) <= link['paragraph']:
            paragraphs.append('SYNTHETIC POSITIONAL FILLER. Not clinical guidance.')
        paragraphs[link['paragraph']] = link['source_quote']
    return '# SIMULATION ONLY — not a live FDA document\n\n' + '\n\n'.join(
        '## ' + heading + '\n\n' + '\n\n'.join(paragraphs)
        for heading, paragraphs in sections.items())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir', type=Path, required=True)
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=False)
    config = P.load_config()
    source = next(s for s in L.load_registry()['sources'] if s['id'] == 'clozapine-rems')
    raw = fixture_markdown(config)
    script = Path(__file__).with_name('run_firecrawl_pilot.py')
    def run(name, text, previous=None):
        inputs = args.out_dir / (name + '-input.json')
        inputs.write_text(json.dumps({source['id']: {'success': True, 'data': {
            'markdown': text, 'metadata': {'sourceURL': source['url'], 'url': source['url'],
                                         'statusCode': 200}}}}, indent=2))
        command = [sys.executable, str(script), '--source', source['id'], '--fixture',
                   '--responses', str(inputs), '--out-dir', str(args.out_dir / name)]
        if previous:
            command += ['--previous', str(previous)]
        process = subprocess.run(command, capture_output=True, text=True)
        report = json.loads((args.out_dir / name / 'report.json').read_text())
        return process.returncode, report['results'][0]
    code, baseline = run('baseline', raw)
    assert code == 0 and baseline['passage_review']['status'] == 'first-observation'
    previous = args.out_dir / 'baseline/report.json'
    links = {p['id']: p for p in config['links']}
    anc = links['clozapine-anc-monitoring']['source_quote']
    enrollment = links['clozapine-rems-enrollment']['source_quote']
    marker = ' [SIMULATED EDIT FOR ROUTING TEST ONLY; NOT CLINICAL GUIDANCE.]'
    scenarios = [
        ('unchanged', raw, 0, 'unchanged', []),
        ('anc-change', raw.replace(anc, anc + marker), 1, 'changed', ['qb_pha_002', 'qb_pha_011', 'qb_psy_007']),
        ('enrollment-change', raw.replace(enrollment, enrollment + marker), 1, 'changed', ['qb_anx_003', 'qb_pha_002', 'qb_pha_011']),
        ('unrelated-change', raw + '\n\n## Unrelated footer\n\nSIMULATED FOOTER EDIT', 1, 'outside-mapped-passages', []),
        ('missing-heading', raw.replace('What Is FDA Doing?', 'SIMULATED MISSING HEADING'), 2, 'unavailable', []),
    ]
    summary = ['# SIMULATION ONLY — passage review results', '',
               'These are synthetic edits used to test routing, not changes detected at FDA.', '',
               '| Scenario | Result | Targeted questions |', '|---|---|---|']
    for name, text, expected_exit, expected_status, expected_questions in scenarios:
        code, row = run(name, text, previous)
        review = row['passage_review']
        actual = sorted({q['id'] for p in review['packets'] for q in p['questions']})
        assert (code, review['status'], actual) == (expected_exit, expected_status, expected_questions), name
        for packet in review['packets']:
            assert {r['page'] for r in packet['readings']} == {'psychopharm_primer.md', 't_psychosis.md'}
        summary.append(f"| [{name}]({name}/faculty-brief.md) | {review['status']} | {', '.join(actual) or 'None'} |")
    summary += ['', 'All five scenarios passed. The ANC-only edit leaves the enrollment-only question '
                'qb_anx_003 unflagged; both changes leave unrelated questions such as qb_psy_012 unflagged. '
                'Broad reading dependencies remain visible as context, not targeted flags.', '',
                'Two readings are selected for each mapped change: psychopharm_primer.md and t_psychosis.md. '
                'Missing headings fail closed. Changes outside mapped paragraphs stay visible as source-level '
                'changes with unknown wider impact. No clinical content or attestations were modified.', '']
    (args.out_dir / 'SUMMARY.md').write_text('\n'.join(summary))
    print(args.out_dir / 'SUMMARY.md')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
