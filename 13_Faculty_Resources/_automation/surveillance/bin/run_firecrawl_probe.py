#!/usr/bin/env python3
"""Manual paired comparison; separate artifacts only. Exit 0 complete, 1 disagreement, 2 incomplete."""
import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import uuid

import lib_surveillance as L
import run_firecrawl_pilot as R


def now():
    return datetime.now(timezone.utc).isoformat()


def timestamp(value):
    if not isinstance(value, str):
        raise ValueError('Missing timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timestamp timezone missing')
    return parsed


def data(observation):
    response = observation.get('response')
    value = response.get('data') if isinstance(response, dict) else None
    return value if isinstance(value, dict) else {}


def compare_pair(source, first, second):
    a, b = data(first), data(second)
    ta, tb = a.get('changeTracking'), b.get('changeTracking')
    result = {'sourceId': source['id'], 'sourceUrl': source['url'], 'outcome': 'inconclusive',
              'providerStatus': tb.get('changeStatus') if isinstance(tb, dict) else None}
    def incomplete(reason):
        return {**result, 'reason': reason}
    if result['providerStatus'] == 'removed':
        return incomplete('Provider reports removed; requires source review, never automatic deletion.')
    if any(R.assess(source, o.get('response'), None)['status'] == 'unable-to-check' for o in (first, second)):
        return incomplete('One or both source observations failed retrieval validation.')
    if not all(isinstance(t, dict) and {'changeStatus', 'previousScrapeAt'} <= t.keys() for t in (ta, tb)):
        return incomplete('Change-tracking metadata missing or malformed.')
    if ta['changeStatus'] != 'new' or ta['previousScrapeAt'] is not None:
        return incomplete('Unexpected tracking history on a unique probe tag.')
    if tb['changeStatus'] not in ('same', 'changed'):
        return incomplete('Second observation has no comparable provider verdict.')
    try:
        prior = timestamp(tb['previousScrapeAt'])
        start, end = timestamp(first['startedAt']), timestamp(first['completedAt'])
        # Unique per-source tags and a bounded provider timestamp support alignment.
        # Explicit tolerance for independent host clocks; this is not a lineage guarantee.
        if not start - timedelta(seconds=5) <= prior <= end + timedelta(seconds=5):
            return incomplete('Provider baseline timestamp is outside the first fetch window.')
    except (ValueError, KeyError, TypeError):
        return incomplete('Provider baseline timestamp cannot be aligned.')
    exact = a['markdown'] != b['markdown']
    normalized = L.normalize_text(a['markdown']) != L.normalize_text(b['markdown'])
    provider_changed = tb['changeStatus'] == 'changed'
    outcome = ('candidate-disagreement' if provider_changed != exact else
               'normalization-difference' if exact and not normalized else 'agreement')
    result.update(outcome=outcome, exactChanged=exact, normalizedChanged=normalized,
                  previousScrapeAt=tb['previousScrapeAt'], alignment='unique tag and first-fetch timestamp window',
                  exactHashes=[L.sha_full(d['markdown']) for d in (a, b)],
                  normalizedHashes=[L.sha_full(L.normalize_text(d['markdown'])) for d in (a, b)])
    return result


def safe_response(response):
    """Retain evidence fields, never arbitrary response metadata or request headers."""
    if not isinstance(response, dict):
        return {'success': False}
    raw = response.get('data')
    if not isinstance(raw, dict):
        return {'success': False}
    meta = raw.get('metadata')
    meta = meta if isinstance(meta, dict) else {}
    tracking = raw.get('changeTracking')
    tracking = tracking if isinstance(tracking, dict) else {}
    return {'success': response.get('success') is True, 'data': {
        'markdown': raw.get('markdown'),
        'metadata': {k: meta[k] for k in ('statusCode', 'sourceURL', 'url', 'cachedAt', 'cacheState', 'creditsUsed', 'scrapeId') if k in meta},
        'changeTracking': {k: tracking[k] for k in ('changeStatus', 'previousScrapeAt', 'visibility', 'diff') if k in tracking}}}


def run_probe(sources, out_dir, token):
    if [s['id'] for s in sources] != list(R.DEFAULT_IDS):
        raise ValueError('Probe requires the five registered targets in order')
    if any(s.get('modality') != 'full_text' for s in sources):
        raise ValueError('Probe requires approved full-text surveillance for every source')
    # Never overwrite a prior probe or accept the production state directory.
    out_dir = Path(out_dir).resolve()
    if out_dir.is_relative_to(Path(L.SURV_ROOT).resolve() / 'history'):
        raise ValueError('Probe output must be separate from production history')
    out_dir.mkdir(parents=True, exist_ok=False)
    probe_id = uuid.uuid4().hex
    observations, results, requests = {}, [], 0
    initial = {'version': 1, 'probeId': probe_id, 'generatedAt': now(),
               'mode': 'manual-paired-probe', 'status': 'incomplete',
               'requested': list(R.DEFAULT_IDS), 'examined': [], 'observations': {},
               'results': [], 'apiRequests': 0, 'requestCountComplete': False,
               'maxApiRequests': 10, 'summary': {'agreement': 0, 'normalization-difference': 0,
                                              'candidate-disagreement': 0, 'inconclusive': 0}}
    (out_dir / 'report.json').write_text(json.dumps(initial, indent=2) + '\n')
    for source in sources:
        tag = 'probe-' + probe_id + '-' + source['id']
        pair = []
        for _ in range(2):
            observation = {'startedAt': now()}
            if token:
                requests += 1
                try:
                    observation['response'] = safe_response(R.fetch(source, token, tracking_tag=tag))
                except (OSError, ValueError, TypeError):
                    observation['error'] = 'Retrieval failed; no retry was issued.'
            else:
                observation['error'] = 'FIRECRAWL_API_KEY is not configured.'
            observation['completedAt'] = now()
            pair.append(observation)
        observations[source['id']] = {'tag': tag, 'pair': pair}
        results.append(compare_pair(source, *pair))
        # Persist each finished pair, so interrupted jobs still expose partial coverage.
        counts = Counter(r['outcome'] for r in results)
        summary = {k: counts[k] for k in ('agreement', 'normalization-difference', 'candidate-disagreement', 'inconclusive')}
        report = {'version': 1, 'probeId': probe_id, 'generatedAt': now(), 'mode': 'manual-paired-probe',
                  'status': 'incomplete' if len(results) != len(sources) or counts['inconclusive'] else 'complete',
                  'requested': list(R.DEFAULT_IDS), 'examined': [r['sourceId'] for r in results],
                  'apiRequests': requests, 'requestCountComplete': len(results) == len(sources), 'maxApiRequests': 10, 'summary': summary, 'results': results,
                  'observations': observations, 'clockToleranceSeconds': 5,
                  'extractionOptions': {'formats': ['markdown', 'tagged git-diff changeTracking'], 'onlyMainContent': True, 'maxAge': 0, 'storeInCache': False},
                  'limits': 'A quiet short-interval pair does not establish sensitivity to real guideline changes. No faculty approval or clinical consistency is implied.'}
        temporary = out_dir / 'report.tmp'
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(out_dir / 'report.json')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir', type=Path, required=True)
    args = parser.parse_args()
    sources = R.select_sources([s for s in L.load_registry()['sources'] if s.get('job') == 'guideline-surveillance'], R.DEFAULT_IDS)
    try:
        report = run_probe(sources or [], args.out_dir, os.environ.get('FIRECRAWL_API_KEY', ''))
    except (OSError, ValueError, KeyError, TypeError):
        print('Probe incomplete; inspect any partial artifact. Production inbox was not changed.')
        return 2
    print(json.dumps({k: report[k] for k in ('status', 'apiRequests', 'summary')}))
    return 2 if report['status'] != 'complete' else 1 if report['summary']['candidate-disagreement'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
