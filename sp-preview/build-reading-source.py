#!/usr/bin/env python3
"""Build a dated source snapshot; no provider access or ledger writes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / '13_Faculty_Resources/_automation'))
from attestation_hash import project_effective_ledger, sources_for_slug


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def extract(root):
    config = json.loads((HERE / 'config/reading-companion.json').read_text())
    shipped = json.loads((root / '13_Faculty_Resources/_automation/site_build/shipped_pages.json').read_text())
    slug = config['slug']
    pages = [p for p in shipped['pages'] if p.get('slug') == slug]
    if not any(config['audience'] in p.get('sites', []) and p.get('source') == config['source'] for p in pages):
        raise ValueError('source_lineage')
    if sources_for_slug(shipped, slug) != [config['source']]:
        raise ValueError('source_lineage')
    ledger = json.loads((root / '13_Faculty_Resources/reviewed.json').read_text())
    meta = json.loads((root / 'topic_meta.json').read_text())
    effective, report = project_effective_ledger(root, {slug: ledger.get(slug, {})}, shipped, meta)
    row = effective[slug]
    # A clinical-only binding permits source citation changes but does not approve
    # this exact excerpt snapshot: require the full canonical binding here.
    if row.get('status') != 'reviewed' or slug not in report['bound'] or slug in report['bound_clinical'] or not row.get('at'):
        raise ValueError('source_attestation')
    text = (root / config['source']).read_text(encoding='utf8')
    matches = list(re.finditer(r'^## ([^\n]+)\n', text, re.M))
    positions = []
    units = []
    for section in config['sections']:
        found = [(i, m) for i, m in enumerate(matches) if m.group(1) == section['heading']]
        if len(found) != 1:
            raise ValueError('source_heading')
        i, match = found[0]
        positions.append(match.start())
        body = text[match.end():matches[i+1].start() if i+1 < len(matches) else len(text)].strip('\n')
        if re.search(r'<\s*[A-Za-z!/?]', body) or not body.strip():
            raise ValueError('source_html_or_empty')
        blocks = re.split(r'\n\s*\n', body)
        paragraphs = []
        for block in blocks:
            if all(re.match(r'^[-*+] ', line) for line in block.splitlines()):
                paragraphs.extend(block.splitlines())
            else:
                paragraphs.append(block)
        for n, paragraph in enumerate(paragraphs, 1):
            units.append({'id': f"{section['id']}-{n}", 'text': paragraph, 'sourceRef': slug, 'sectionId': section['id']})
    if positions != sorted(positions):
        raise ValueError('source_heading_order')
    if sum(len(u['text']) for u in units) > 12000:
        raise ValueError('source_oversized')
    commit = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], check=True, text=True, capture_output=True).stdout.strip()
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('source_revision')
    provenance_paths = [config['source'], '13_Faculty_Resources/reviewed.json',
                        '13_Faculty_Resources/_automation/site_build/shipped_pages.json',
                        'topic_meta.json', 'LICENSE-content']
    for relative in provenance_paths:
        committed = subprocess.run(['git', '-C', str(root), 'show', commit + ':' + relative],
                                   check=True, capture_output=True).stdout
        if (root / relative).read_bytes() != committed:
            raise ValueError('source_provenance: ' + relative)
    snapshot_at = subprocess.run(['git', '-C', str(root), 'show', '-s', '--format=%cI', commit],
                                 check=True, text=True, capture_output=True).stdout.strip()
    for unit in units:
        unit['revision'] = commit
    presets = []
    for preset in config['presets']:
        presets.append({**preset, 'unitIds': [u['id'] for u in units if u['sectionId'] == preset['sectionId']]})
    pack = {'version': 1, 'sourceId': config['sourceId'], 'slug': slug, 'audience': config['audience'], 'sourceCommit': commit, 'snapshotAt': snapshot_at,
            'attestationHash': row['contentHash'], 'reviewedAt': row['at'],
            'attribution': {'author': 'Joshua Moss, MD', 'license': 'CC BY-NC-SA 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-nc-sa/4.0/', 'notice': (root / 'LICENSE-content').read_text()},
            'units': units, 'presets': presets}
    pack['sourceHash'] = hashlib.sha256(canonical(pack).encode()).hexdigest()
    return pack


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=HERE.parent)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--enabled', action='store_true')
    args = parser.parse_args()
    try:
        pack = extract(args.root)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.SubprocessError) as error:
        if args.enabled:
            # Delete stale output so a failed enabled build cannot reuse it.
            if not args.check:
                args.out.parent.mkdir(parents=True, exist_ok=True)
                args.out.write_text(canonical({'version': 1, 'available': False, 'reason': 'source_unavailable'}) + '\n')
                os.chmod(args.out, 0o600)
            print('source_unavailable: ' + str(error), file=sys.stderr)
            return 1
        pack = {'version': 1, 'available': False, 'reason': 'source_unavailable'}
    output = canonical(pack) + '\n'
    if args.check:
        return 0 if args.out.is_file() and args.out.read_text() == output else 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    temp = args.out.with_suffix(args.out.suffix + '.tmp')
    temp.write_text(output, encoding='utf8')
    os.chmod(temp, 0o600)
    temp.replace(args.out)
    return 0

if __name__ == '__main__':
    sys.exit(main())
