"""Exact, status-free editorial selections projected through current governance.

All text fields are plain text. Consumers must escape them when rendering HTML.
No review status is cached in the tracked candidate catalog.
"""
import hashlib
import html
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from surface_governance import load_effective_ledger

BUILD = Path('13_Faculty_Resources/_automation/site_build')


def _json(root, name):
    return json.loads((Path(root) / BUILD / name).read_text(encoding='utf-8'))


def load_candidates(root: Path) -> dict:
    return _json(root, 'concept_candidates.json')


def normalize(text):
    """Remove inline presentation only; retain punctuation and clinical wording."""
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # A tag must start with a name, not whitespace or a numeric comparison.
    text = re.sub(r'</?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*?)?\s*/?>', '', text)
    text = re.sub(r'(\*\*|__|`)', '', text)
    text = re.sub(r'(?<!\w)\*([^*]+)\*(?!\w)', r'\1', text)
    return ' '.join(html.unescape(text).split())


def extract_sections(text):
    """Read bold-label and Markdown-heading summary/pearl sections structurally."""
    sections = {'summary': [], 'pearl': []}
    mode = None
    summary = []
    for raw in text.splitlines():
        line = raw.strip()
        heading = re.match(r'^(?:#{1,6}\s+|\*\*)(In one line|High[-‑–]yield pearls)[.:]?\s*(?:\*\*)?\s*[—–:-]?\s*(.*)$', line, re.I)
        if heading:
            if summary:
                sections['summary'].append(normalize(' '.join(summary)))
                summary = []
            mode = 'summary' if heading[1].lower() == 'in one line' else 'pearl'
            if heading[2] and mode == 'summary':
                summary.append(heading[2])
            continue
        if mode and (re.match(r'^#{1,6}\s', line) or re.match(r'^\*\*[^*]+\*\*', line) or line == '---'):
            if summary:
                sections['summary'].append(normalize(' '.join(summary)))
                summary = []
            mode = None
        if mode == 'summary':
            if not line and summary:
                sections['summary'].append(normalize(' '.join(summary)))
                summary = []
                mode = None
            elif line:
                summary.append(line)
        elif mode == 'pearl':
            bullet = re.match(r'^[-*+]\s+(.+)$', line)
            if bullet:
                sections['pearl'].append(normalize(bullet[1]))
            elif line and raw[:1].isspace() and sections['pearl']:
                sections['pearl'][-1] += ' ' + normalize(line)
            elif line:
                mode = None
    if summary:
        sections['summary'].append(normalize(' '.join(summary)))
    return sections


def _inventory(root):
    pages = _json(root, 'shipped_pages.json').get('pages')
    if not isinstance(pages, list) or not pages:
        raise ValueError('concept coverage: empty or invalid shipped pages')
    result = {}
    for page in pages:
        if page.get('kind') != 'page' or not page.get('source', '').endswith('.md'):
            continue
        source = page['source']
        text = (Path(root) / source).read_text(encoding='utf-8')
        sections = extract_sections(text)
        if not any(sections.values()):
            continue
        if source in result:
            raise ValueError(f'concept coverage: ambiguous shipped source {source}')
        result[source] = (page, sections)
    return result


CITATION = re.compile(r'\[\^([^\]\s]+)\]')


def canonical_citations(root, ids):
    """Resolve only referenced registry IDs; never copy internal registry notes."""
    evidence = []
    if ids:
        sources = json.loads((Path(root)/'evidence_registry.json').read_text(encoding='utf-8'))['sources']
        for citation_id in ids:
            matches = [s for s in sources if s.get('id') == citation_id]
            if len(matches) != 1:
                raise ValueError('concept citation missing or ambiguous: ' + citation_id)
            url = matches[0].get('citation', {}).get('url', '')
            parsed = urlsplit(url)
            if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or any(c.isspace() for c in url):
                raise ValueError('concept citation needs safe HTTPS URL: ' + citation_id)
            evidence.append({'id': citation_id, 'url': url})
    return evidence


def load_evidence_links(root):
    document = _json(root, 'concept_evidence_links.json')
    if document.get('schemaVersion') != 1 or not isinstance(document.get('links'), dict):
        raise ValueError('concept evidence links: invalid schema')
    return document['links']


def evidence_links_document(root):
    """Generate the small, tracked teaching input; changes require deliberate review."""
    ids = sorted({key for note in load_candidates(root)['notes'] for key in CITATION.findall(note['excerpt'])})
    return {'schemaVersion': 1, 'links': {row['id']: row['url'] for row in canonical_citations(root, ids)}}


def citation_face(root, excerpt):
    """Keep matching exact; pin selected links without hashing unrelated metadata."""
    ids = list(dict.fromkeys(CITATION.findall(excerpt)))
    evidence = canonical_citations(root, ids)
    if ids:
        links = load_evidence_links(root)
        for row in evidence:
            if links.get(row['id']) != row['url']:
                raise ValueError('concept evidence link drift: ' + row['id'] + '; regenerate concept_evidence_links.json and review the change')
            row['url'] = links[row['id']]
    return ' '.join(CITATION.sub('', excerpt).split()), evidence


def validate_candidates(root: Path, document: dict) -> list[dict]:
    if document.get('schemaVersion') != 1 or not isinstance(document.get('notes'), list) or not isinstance(document.get('exclusions'), list):
        raise ValueError('concept catalog: invalid schema')
    expected_ids = {key for note in document['notes'] for key in CITATION.findall(note.get('excerpt', ''))}
    if set(load_evidence_links(root)) != expected_ids:
        raise ValueError('concept evidence links: missing or orphaned citation mapping')
    inventory = _inventory(root)
    covered = Counter()
    excluded_sources = set()
    for exclusion in document['exclusions']:
        source = exclusion.get('source')
        if source not in inventory or not exclusion.get('reason', '').strip():
            raise ValueError(f'concept coverage: invalid exclusion {source}')
        kind, excerpt = exclusion.get('kind'), exclusion.get('excerpt')
        if kind is None and excerpt is None:
            if source in excluded_sources:
                raise ValueError(f'concept coverage: duplicate exclusion {source}')
            excluded_sources.add(source)
        elif kind in ('summary', 'pearl') and inventory[source][1][kind].count(excerpt) == 1:
            covered[(source, kind, excerpt)] += 1
        else:
            raise ValueError(f'concept coverage: orphaned exclusion {source}')
    output, note_ids, target_ids = [], set(), set()
    for note in document['notes']:
        note_id, source, kind = note.get('id'), note.get('source'), note.get('kind')
        label = f'{source}: {note_id}'
        if not isinstance(note_id, str) or not note_id or note_id in note_ids:
            raise ValueError(f'{label}: duplicate or invalid note ID')
        note_ids.add(note_id)
        if source not in inventory or kind not in ('summary', 'pearl'):
            raise ValueError(f'{label}: orphaned selection')
        if source in excluded_sources:
            raise ValueError(f'{label}: mapped and excluded source')
        page, sections = inventory[source]
        excerpt = note.get('excerpt', '')
        if not excerpt or normalize(excerpt) != excerpt or sections[kind].count(excerpt) != 1:
            raise ValueError(f'{label}: exact excerpt must occur once')
        covered[(source, kind, excerpt)] += 1
        if not note.get('targets'):
            raise ValueError(f'{label}: missing targets; generic prompts forbidden')
        face, evidence = citation_face(root, excerpt)
        spans = []
        for ordinal, target in enumerate(note['targets'], 1):
            tid, text, revision = target.get('id'), target.get('text'), target.get('contentRevision')
            if not isinstance(tid, str) or not tid or tid in target_ids:
                raise ValueError(f'{label}: duplicate or invalid target ID')
            if type(revision) is not int or revision < 1:
                raise ValueError(f'{label}: invalid content revision')
            target_ids.add(tid)
            if not isinstance(text, str) or not text.strip() or len(list(re.finditer('(?=' + re.escape(text) + ')', excerpt))) != 1:
                raise ValueError(f'{label}: exact target must occur once')
            start = excerpt.index(text)
            end = start + len(text)
            if any(start < b and end > a for a, b in spans):
                raise ValueError(f'{label}: overlapping targets')
            spans.append((start, end))
            if face.count(text) != 1:
                raise ValueError(f'{label}: target must occur once after citation removal')
            face_start = face.index(text)
            face_end = face_start + len(text)
            output.append({'id': f'CONCEPT#{tid}@{revision}', 'noteId': note_id,
                'editorialId': tid, 'ordinal': ordinal, 'revision': revision, 'kind': kind,
                'q': face[:face_start] + '[…]' + face[face_end:], 'reveal': face,
                'evidence': evidence,
                'target': text, 'targetStart': face_start, 'targetEnd': face_end,
                'page': page['slug'], 'source': source, 'topic': page.get('title', page['slug'])})
    for source, (_, sections) in inventory.items():
        if source in excluded_sources:
            continue
        for kind, excerpts in sections.items():
            for excerpt in excerpts:
                if covered[(source, kind, excerpt)] != 1:
                    raise ValueError(f'concept coverage: {source}: {kind}: unmapped or duplicate excerpt: {excerpt}')
    return sorted(output, key=lambda card: card['id'])


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def release_cards(root: Path, site: str) -> dict:
    if site not in ('ms3', 'res'):
        raise ValueError(f'unknown concept audience: {site}')
    document = load_candidates(root)
    candidates = validate_candidates(root, document)
    ledger, _ = load_effective_ledger(Path(root))
    inventory = _inventory(root)
    exclusions = {item['source'] for item in document['exclusions'] if 'kind' not in item}
    examined, withheld, released = [], [], []
    for source, (page, sections) in sorted(inventory.items()):
        status = ledger.get(page['slug'], {}).get('status', 'pending')
        excluded = source in exclusions
        if not excluded and status == 'reviewed' and set(page['sites']) != {'ms3', 'res'}:
            raise ValueError(f'concept audience mismatch: {source}: {page["sites"]}')
        examined.append({'source': source, 'page': page['slug'], 'status': status,
                         'excluded': excluded, 'sections': {k: len(v) for k, v in sections.items()}})
    states = {row['source']: row['status'] for row in examined}
    for card in candidates:
        if states[card['source']] == 'reviewed':
            released.append(card)
        else:
            withheld.append({'id': card['id'], 'source': card['source'], 'reason': states[card['source']]})
    if not released:
        raise ValueError('concept empty release: no effectively reviewed cards')
    return {'schemaVersion': 1, 'cards': released, 'examinedSources': examined,
            'withheld': withheld, 'exclusions': [{k: v for k, v in exclusion.items() if k != 'excerpt'} for exclusion in document['exclusions']], 'digest': _digest(released),
            'eligibilityDigest': _digest({'released': [c['id'] for c in released], 'withheld': withheld}),
            'examinedSourcesDigest': _digest(examined)}


def feed_bytes(root: Path, site: str) -> bytes:
    return (json.dumps(release_cards(root, site), sort_keys=True, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', choices=['ms3', 'res'], default='ms3')
    parser.add_argument('--write-evidence-links', action='store_true', help='regenerate the tracked selected ID/URL map for review')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    if args.write_evidence_links:
        path = root / BUILD / 'concept_evidence_links.json'
        path.write_text(json.dumps(evidence_links_document(root), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print('Wrote selected concept evidence links:', path.relative_to(root))
    else:
        print(json.dumps(release_cards(root, args.site), indent=2, ensure_ascii=False))
