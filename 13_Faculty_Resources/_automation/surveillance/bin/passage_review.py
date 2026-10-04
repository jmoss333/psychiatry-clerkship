"""Proposed, exact passage dependencies for a bounded surveillance pilot.

This never establishes clinical correctness or faculty approval. Unmapped source
changes remain visible, and stale/missing dependencies cannot clear review.
"""
import hashlib
import json
from pathlib import Path
import re

import lib_surveillance as L

CONFIG = Path(L.CONFIG) / 'passage_links.json'


def load_config():
    document = json.loads(CONFIG.read_text())
    registered = {s['id']: s for s in L.load_registry()['sources']}
    for link in validate(document):
        source = registered.get(link['source_id'])
        if source is None or source['url'] != link['source_url']:
            raise ValueError('Passage map source is missing or differs from the registry')
        if source.get('modality') == 'signal_only':
            raise ValueError('Restricted source cannot carry a stored passage mapping')
    return document


def signature(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def extract(markdown, heading, paragraph):
    """Read one paragraph from one uniquely named level-two section."""
    sections, lines, name = [], [], None
    for line in markdown.splitlines():
        if line.startswith('## '):
            if name == heading:
                sections.append('\n'.join(lines))
            label = line[3:].strip()
            match = re.match(r'^\[([^\]]+)\]\(', label)
            name = match.group(1) if match else label
            lines = []
        else:
            lines.append(line)
    if name == heading:
        sections.append('\n'.join(lines))
    if len(sections) != 1:
        raise ValueError('Source heading is missing or ambiguous')
    paragraphs = [L.normalize_text(p) for p in re.split(r'\n\s*\n', sections[0]) if p.strip()]
    if type(paragraph) is not int or paragraph < 0 or paragraph >= len(paragraphs):
        raise ValueError('Source paragraph is missing')
    return paragraphs[paragraph]


def field(item, pointer):
    if not isinstance(pointer, str) or not pointer.startswith('/'):
        raise ValueError('Question field must be a JSON pointer')
    value = item
    for part in pointer[1:].split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        value = value[int(part)] if isinstance(value, list) else value[part]
    if not isinstance(value, str):
        raise ValueError('Question field is not text')
    return value


def validate(document):
    if not isinstance(document, dict) or document.get('version') != 1:
        raise ValueError('Passage mapping version is invalid')
    links = document.get('links')
    if not isinstance(links, list) or not links:
        raise ValueError('Passage mapping is empty or malformed')
    ids = set()
    for link in links:
        if not isinstance(link, dict):
            raise ValueError('Malformed passage link')
        for key in ('id', 'source_id', 'source_url', 'heading', 'source_quote'):
            if not isinstance(link.get(key), str) or not link[key].strip():
                raise ValueError('Missing passage mapping field: ' + key)
        if link['id'] in ids or link.get('status') != 'proposed':
            raise ValueError('Duplicate mapping or unsupported approval claim')
        ids.add(link['id'])
        if type(link.get('paragraph')) is not int or link['paragraph'] < 0:
            raise ValueError('Invalid paragraph selector')
        for key in ('questions', 'readings'):
            if not isinstance(link.get(key), list) or not link[key]:
                raise ValueError('Missing recorded dependencies: ' + key)
    return links


def dependencies(link, questions, root):
    by_id = {q['id']: q for q in questions['items']}
    seen, qrows = set(), []
    for ref in link['questions']:
        qid = ref['id']
        if qid in seen or qid not in by_id:
            raise ValueError('Question is missing, retired, or duplicated')
        seen.add(qid)
        quote = ref['quote']
        if not isinstance(quote, str) or not quote.strip() or quote not in field(by_id[qid], ref['field']):
            raise ValueError('Recorded question text has drifted')
        if not isinstance(ref.get('reason'), str) or not ref['reason'].strip():
            raise ValueError('Question connection needs a review reason')
        qrows.append({**ref, 'stem': by_id[qid].get('stem', '')})
    for ref in link['readings']:
        if ref['source'] not in questions['sources'].get(ref['page'], set()):
            raise ValueError('Reading is not a recorded shipped source')
        path = (root / ref['source']).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError('Reading path leaves the repository')
        quote = ref['quote']
        if not isinstance(quote, str) or not quote.strip() or quote not in path.read_text():
            raise ValueError('Recorded reading text has drifted')
    return qrows


def evaluate(source, row, markdown, previous, document, questions, root):
    result = {'status': 'unavailable', 'packets': [], 'observations': {},
              'coverage': 'Only the explicitly mapped passages; all links are proposed.'}
    try:
        links = [p for p in validate(document) if p['source_id'] == source['id']]
        prior_review = (previous or {}).get('passage_review') or {}
        prior = prior_review.get('observations') or {}
        if prior and set(prior) != {link['id'] for link in links}:
            raise ValueError('Passage coverage changed; establish an explicit new baseline')
        if not links:
            return {**result, 'status': 'not-configured'}
        if row['status'] == 'unable-to-check' or row.get('modality') == 'signal_only' or source.get('modality') == 'signal_only':
            raise ValueError('Source retrieval is unavailable or restricted to signals')
        if questions is None or not isinstance(markdown, str):
            raise ValueError('Question mapping or source text unavailable')
        if previous and (previous.get('source_url') != source['url'] or previous.get('extractor') != row.get('extractor')):
            raise ValueError('Prior source or extractor does not match')
        first = False
        for link in links:
            if link['source_url'] != source['url']:
                raise ValueError('Mapping URL differs from the registered source')
            qrows = dependencies(link, questions, root)
            current = extract(markdown, link['heading'], link['paragraph'])
            receipt = signature(link)
            old = prior.get(link['id'])
            if old is None:
                if current != L.normalize_text(link['source_quote']):
                    raise ValueError('Initial source passage no longer matches the proposed map')
                first = True
            else:
                if (not isinstance(old, dict) or old.get('mapping_signature') != receipt or
                        not isinstance(old.get('quote'), str) or not old['quote'].strip()):
                    raise ValueError('Prior mapping receipt is missing, malformed, or stale')
                if old['quote'] != current:
                    result['packets'].append({'id': link['id'], 'heading': link['heading'],
                        'old': old['quote'], 'new': current, 'questions': qrows,
                        'readings': link['readings'], 'mapping_status': 'proposed'})
            result['observations'][link['id']] = {'quote': current, 'mapping_signature': receipt}
        result['status'] = ('changed' if result['packets'] else 'first-observation' if first else
                            'outside-mapped-passages' if row['status'] == 'changed' else 'unchanged')
        return result
    except (ValueError, KeyError, TypeError, IndexError, OSError) as exc:
        # No partial result is allowed to masquerade as complete localization.
        return {**result, 'status': 'unavailable', 'packets': [], 'observations': {},
                'reason': L.sanitize_crawled_text(str(exc))}


def render(review):
    clean = L.sanitize_crawled_text
    out = ['### Proposed passage review', '', f"Status: **{review['status']}**", '', review['coverage'], '']
    if review.get('reason'):
        out += [clean(review['reason']), '']
    if review['status'] == 'outside-mapped-passages':
        out += ['The source changed outside the tracked passages. Review the source-level diff; '
                'this pilot cannot determine impact on other questions.', '']
    for packet in review['packets']:
        out += [f"#### {clean(packet['id'])}", '', 'Previous source passage:', '',
                '    ' + clean(packet['old'], 6000), '', 'Current source passage:', '',
                '    ' + clean(packet['new'], 6000), '', 'Targeted question candidates:', '']
        for q in packet['questions']:
            out += [f"- **{clean(q['id'])}** — {clean(q['stem'], 180)}",
                    f"  Why flagged: {clean(q['reason'], 600)}",
                    f"  Recorded text ({clean(q['field'])}): {clean(q['quote'], 1000)}"]
        out += ['', 'Targeted reading candidates:', '']
        out += [f"- {clean(r['page'])} → {clean(r['source'], 500)}: {clean(r['quote'], 1000)}"
                for r in packet['readings']]
        out += ['', 'Review the original source and these candidates before proposing any clinical edit. '
                'This packet does not change an answer or record faculty approval.', '']
    return '\n'.join(out)
