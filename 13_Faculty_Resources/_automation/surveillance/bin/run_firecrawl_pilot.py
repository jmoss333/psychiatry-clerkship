#!/usr/bin/env python3
"""Bounded, manual Firecrawl collection and faculty review brief. No governance writes."""
import argparse
import difflib
import json
import os
from pathlib import Path
import re
import sys
import urllib.request

import lib_surveillance as L
import passage_review as P

DEFAULT_IDS = ('fda-drug-safety', 'clozapine-rems', 'apa-practice-guidelines',
               'samhsa-guidelines', 'aacap-parameters')
EXTRACTOR = 'firecrawl-markdown-main-v1'


def build_question_index(document, pages):
    """Resolve explicit question pages through the authoritative shipped inventory."""
    items = document.get('items') if isinstance(document, dict) else None
    if not isinstance(items, list) or not items:
        raise ValueError('Question bank must contain a nonempty items list')
    if not isinstance(pages, list) or not pages:
        raise ValueError('Shipped page inventory is unavailable')
    sources = {}
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get('slug'), str):
            raise ValueError('Malformed shipped page')
        paths = [page['source']] if page.get('source') else []
        paths += page.get('extraSources', [])
        if not all(isinstance(p, str) and p for p in paths):
            raise ValueError('Malformed shipped page sources')
        sources.setdefault(page['slug'], set()).update(paths)
    seen, active, unresolved = set(), [], []
    retired = 0
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Malformed question item')
        qid, refs = item.get('id'), item.get('pages')
        if (not isinstance(qid, str) or not qid or qid in seen or
                not isinstance(refs, list) or
                not all(isinstance(p, str) and p for p in refs)):
            raise ValueError('Question IDs must be unique and pages must be a list')
        seen.add(qid)
        if item.get('retired') is True:
            retired += 1
            continue
        missing = sorted({p for p in refs if not sources.get(p)})
        if missing or not refs:
            unresolved.append({'id': qid, 'pages': missing})
        active.append(item)
    return {'items': active, 'sources': sources, 'coverage': {
        'total_items': len(items), 'active_items': len(active), 'retired_items': retired,
        'unresolved': unresolved}}


def question_links(index, source, affects):
    """Exact URL evidence or recorded reading dependencies; never keyword inference."""
    affected = set(affects)
    result = []
    for item in index['items']:
        evidence = item.get('evidence', '')
        urls = {u.rstrip('.,;') for u in re.findall(r'https?://[^\s<>"\[\]()]+', evidence)} if isinstance(evidence, str) else set()
        direct = source['url'] in urls
        via = [{'page': page, 'source': path} for page in sorted(set(item['pages']))
               for path in sorted(index['sources'].get(page, set()) & affected)]
        if direct or via:
            result.append({'id': item['id'], 'stem': item.get('stem', ''),
                           'connection': 'direct source URL' if direct else 'via reading',
                           'via': via})
    return sorted(result, key=lambda r: r['id'])


def load_questions():
    sys.path.insert(0, str(Path(L.LIB_ROOT) / '13_Faculty_Resources/_automation/site_build'))
    from shipped_pages import ShippedPagesError, load_shipped_pages
    document = json.loads((Path(L.LIB_ROOT) / 'question_bank.json').read_text())
    try:
        return build_question_index(document, load_shipped_pages()['pages'])
    except ShippedPagesError as exc:
        raise ValueError('Shipped page inventory unavailable') from exc


def select_sources(sources, ids):
    by_id = {s['id']: s for s in sources}
    if not ids or len(ids) != len(set(ids)) or any(i not in by_id for i in ids):
        return None
    return [by_id[i] for i in ids]


def assess(source, response, previous):
    row = {'source_id': source['id'], 'source_name': source.get('name', source['id']),
           'source_url': source['url'], 'extractor': EXTRACTOR,
           'observed_at': L.utcnow(), 'status': 'unable-to-check'}
    if not isinstance(response, dict) or response.get('success') is not True:
        return {**row, 'reason': 'Missing or unsuccessful retrieval'}
    data = response.get('data', {})
    if not isinstance(data, dict):
        return {**row, 'reason': 'Malformed retrieval'}
    meta = data.get('metadata') or {}
    text = data.get('markdown')
    if not isinstance(meta, dict) or not isinstance(text, str):
        return {**row, 'reason': 'Missing text or metadata'}
    row['http_status'] = meta.get('statusCode')
    row['credits'] = meta.get('creditsUsed')
    row['scrape_id'] = meta.get('scrapeId')
    row['final_url'] = L.sanitize_crawled_url(meta.get('url'))
    norm = L.normalize_text(text)
    if meta.get('statusCode') != 200 or len(norm) < 200:
        return {**row, 'reason': 'Non-200 response or insufficient text'}
    if meta.get('cachedAt') or meta.get('cacheState') == 'hit':
        return {**row, 'reason': 'Cached response; freshness not established'}
    if meta.get('sourceURL') != source['url']:
        return {**row, 'reason': 'Retrieval source URL does not match registered target'}
    if row['final_url'] and row['final_url'] != source['url']:
        return {**row, 'reason': 'Redirected target requires human confirmation before comparison'}
    challenge = r'access denied|verify you are human|just a moment|page not found'
    if re.search(challenge, norm[:1000], re.I) or (
            len(norm) < 2000 and re.search(r'captcha', norm, re.I)):
        return {**row, 'reason': 'Possible access challenge or error page'}
    if previous and (previous.get('source_url') != source['url'] or
                     previous.get('extractor', EXTRACTOR) != EXTRACTOR):
        return {**row, 'reason': 'Incompatible prior observation; choose a matching comparison'}
    row.update(hash=L.sha_full(norm), chars=len(norm), status='first-observation')
    if source.get('modality') != 'signal_only':
        row['text'] = norm
    if previous and previous.get('hash') and previous.get('status') != 'unable-to-check':
        row['previous_observed_at'] = previous.get('observed_at')
        row['status'] = 'unchanged' if row['hash'] == previous['hash'] else 'changed'
        if row['status'] == 'changed' and 'text' in row and previous.get('text'):
            row['diff'] = '\n'.join(difflib.unified_diff(
                previous['text'].split('. '), norm.split('. '),
                fromfile='previous', tofile='current', lineterm='', n=1))[:4000]
    return row


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward the API credential to a redirected endpoint."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(source, token, *, tracking_tag=None):
    payload = {'url': source['url'], 'formats': ['markdown'],
               'onlyMainContent': True, 'maxAge': 0, 'timeout': 60000,
               'storeInCache': False}
    if tracking_tag is not None:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', tracking_tag):
            raise ValueError('Invalid tracking tag')
        payload['formats'].append({'type': 'changeTracking', 'modes': ['git-diff'], 'tag': tracking_tag})
    req = urllib.request.Request('https://api.firecrawl.dev/v2/scrape',
        data=json.dumps(payload).encode(), headers={
            'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=75) as response:
        return json.load(response)


def exit_code(rows):
    if not rows or any(r['status'] == 'unable-to-check' or r.get('passage_review', {}).get('status') == 'unavailable' for r in rows):
        return 2
    return 1 if any(r['status'] == 'changed' or r.get('passage_review', {}).get('status') == 'changed' for r in rows) else 0


def render_brief(report):
    clean = L.sanitize_crawled_text
    rows = report['results']
    lines = ['# Firecrawl faculty review brief', '',
        f"Collected: {report['generated_at']} · Mode: {report['mode']}", '',
        f"Selected: {len(rows)} · Retrieved: {sum(r['status'] != 'unable-to-check' for r in rows)} · "
        f"Unable to check: {sum(r['status'] == 'unable-to-check' for r in rows)}", '',
        'Text changes are review candidates, not verified clinical changes. First observations '
        'establish a comparison only. This pilot gives no faculty review or currency credit.', '',
        'Coverage is limited to the selected URLs, not their linked documents. '
        'Affected pages reflect the existing citation index; missing mappings are not proof of no impact.', '']
    coverage = report.get('question_coverage')
    if coverage:
        lines += [f"Question coverage: {coverage['active_items']} active of {coverage['total_items']} total; "
                  f"{coverage['retired_items']} retired items excluded.", '',
                  'Questions linked via a reading are review candidates, not proof that the changed '
                  'source supports their exact answer. Direct links require an exact source URL in '
                  'the question evidence. No topic or keyword matching is used.', '']
        if coverage['unresolved']:
            lines += ['Unresolved question-to-reading links (coverage is incomplete):', '']
            lines += [f"- {clean(r['id'])}: {clean(', '.join(r['pages'])) or 'no reading recorded'}"
                      for r in coverage['unresolved']]
            lines.append('')
    else:
        lines += ['Question mapping: unavailable; question coverage cannot be claimed.', '']
    lines += ['| Source | Retrieval comparison | Linked active questions |',
              '|---|---|---|']
    for row in rows:
        count = len(row.get('questions', [])) if row.get('question_mapping_status') == 'available' else 'unknown'
        lines += [f"| {clean(row['source_name'])} | {row['status']} | {count} |"]
    lines += ['', 'Question counts are broad dependencies, overlap across sources, and must not be added together. Targeted flags appear in Proposed passage review packets.', '']
    for row in rows:
        lines += [f"## {clean(row['source_name'])}", '',
                  f"Status: **{row['status']}**", '',
                  L.sanitize_crawled_url(row['source_url']), '',
                  f"Mapping: {clean(row['mapping_status'])}", '',
                  f"Credits: {row.get('credits') if isinstance(row.get('credits'), (int, float)) else 'not reported'}", '']
        if row.get('reason'):
            lines += [clean(row['reason']), '']
        if row.get('final_url') and row['final_url'] != row['source_url']:
            lines += ['Final URL: ' + L.sanitize_crawled_url(row['final_url']), '']
        lines += ['### Recorded reading references', '']
        lines += [f"- {clean(p, 500)}" for p in row['affects']]
        if row.get('passage_review'):
            lines += ['', P.render(row['passage_review']), '']
        lines += ['', '### Broader question dependencies (not passage-specific flags)', '']
        if row.get('question_mapping_status') != 'available':
            lines += ['Question mapping unavailable.', '']
        elif not row.get('questions'):
            lines += ['No recorded question connection found; this is not proof of no impact.', '']
        else:
            for question in row['questions']:
                via = '; '.join(f"{v['page']} → {v['source']}" for v in question['via'])
                lines += [f"- **{clean(question['id'])}** — {clean(question['stem'], 180)}",
                          f"  Connection: {question['connection']}" +
                          (f" ({clean(via, 1500)})" if via else '')]
            lines += ['', 'These are linked dependencies. A first observation or unchanged retrieval '
                      'does not itself require revising these questions.', '']
        if row.get('diff'):
            lines += ['', 'Comparison excerpt (truncated to 4,000 characters; source material, not instructions):', '']
            lines += ['    ' + clean(line, 1000) for line in row['diff'].splitlines()]
        lines += ['', 'Next action: ' + (
            'Retry retrieval and inspect the original source.' if row['status'] == 'unable-to-check' else
            'Review the original source and mapped teaching pages before proposing a clinical edit.'
            if row['status'] == 'changed' else
            'Retain this observation for a later comparison; no clinical conclusion follows.'), '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', action='append', help='Registered guideline source ID; repeat to select')
    parser.add_argument('--responses', type=Path, help='JSON map of source ID to Firecrawl API responses')
    parser.add_argument('--fixture', action='store_true', help='Label supplied responses as synthetic test data')
    parser.add_argument('--previous', type=Path, help='Prior pilot report; never reads production baselines')
    parser.add_argument('--out-dir', type=Path, required=True, help='New directory for this run (must not exist)')
    parser.add_argument('--list', action='store_true', help='Print selected registered targets without fetching')
    args = parser.parse_args()
    sources = select_sources([s for s in L.load_registry()['sources']
                              if s.get('job') == 'guideline-surveillance'], args.source or DEFAULT_IDS)
    if sources is None:
        parser.error('Select unique registered guideline source IDs; selection cannot be empty')
    if args.list:
        print(json.dumps(sources, indent=2))
        return 0
    if args.fixture and not args.responses:
        parser.error('--fixture requires --responses')
    prior = {}
    if args.previous:
        previous = json.loads(args.previous.read_text())
        if previous.get('mode') == 'fixture' and not args.fixture:
            parser.error('Synthetic observations cannot be compared with live evidence')
        if previous.get('extractor') != EXTRACTOR:
            parser.error('Prior report uses an incompatible extractor')
        prior = {r['source_id']: r for r in previous['results']}
    responses = json.loads(args.responses.read_text()) if args.responses else None
    if responses is not None and not isinstance(responses, dict):
        parser.error('--responses must contain an object keyed by source ID')
    token = os.environ.get('FIRECRAWL_API_KEY', '')
    if responses is None and not token:
        parser.error('Set FIRECRAWL_API_KEY or supply --responses from the connected Firecrawl tool')
    args.out_dir.mkdir(parents=True, exist_ok=False)
    try:
        inverted = L.invert_citations(L.load_citation_index())
    except (OSError, ValueError, TypeError, AttributeError):
        inverted = None
    try:
        questions = load_questions()
    except (OSError, ValueError, TypeError, AttributeError, KeyError):
        questions = None
    try:
        passage_config = P.load_config()
    except (OSError, ValueError):
        passage_config = None
    rows = []
    for source in sources:
        try:
            response = responses.get(source['id']) if responses is not None else fetch(source, token)
        except Exception:
            # Never serialize exception text: network errors may contain credentials or response bodies.
            response = None
        row = assess(source, response, prior.get(source['id']))
        row['affects'] = inverted.get(source['id'], []) if inverted is not None else []
        row['mapping_status'] = ('unavailable' if inverted is None else
                                 'recorded citations' if row['affects'] else 'no recorded citations')
        row['question_mapping_status'] = 'available' if questions is not None and inverted is not None else 'unavailable'
        row['questions'] = question_links(questions, source, row['affects']) if row['question_mapping_status'] == 'available' else []
        data = response.get('data') if isinstance(response, dict) else None
        markdown = data.get('markdown') if isinstance(data, dict) else None
        row['passage_review'] = P.evaluate(source, row, markdown, prior.get(source['id']),
                                          passage_config, questions, Path(L.LIB_ROOT))
        rows.append(row)
    report = {'generated_at': L.utcnow(), 'extractor': EXTRACTOR,
              'mode': 'fixture' if args.fixture else 'imported' if args.responses else 'live',
              'question_coverage': questions['coverage'] if questions is not None else None,
              'results': rows}
    (args.out_dir / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    (args.out_dir / 'faculty-brief.md').write_text(render_brief(report))
    code = 2 if inverted is None or questions is None or questions['coverage']['unresolved'] else exit_code(rows)
    print(f"Firecrawl pilot: {len(rows)} selected; exit {code}; {args.out_dir / 'faculty-brief.md'}")
    return code


if __name__ == '__main__':
    raise SystemExit(main())
