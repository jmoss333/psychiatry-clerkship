#!/usr/bin/env python3
"""Compare revisions actually served by both learner sites; no credentials or deploys.

Exit 0: both serve one valid revision. Exit 1: revisions still differ after retries.
Exit 2: coverage or a response is unavailable/invalid. Equality is not freshness to main.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request

try:
    from . import production_canary as canary
except ImportError:  # Direct workflow/CLI invocation.
    import production_canary as canary

MAX_BODY_BYTES = 4 * 1024 * 1024
TIMEOUT_SECONDS = 20
REVISION = re.compile(r'[0-9a-f]{40}')
REVISION_PATH = '/tool-governance.json'
build_opener = canary.build_opener  # Same no-redirect policy as the public canary.


def unique_object(pairs):
    """Reject duplicate JSON keys rather than silently accepting the last value."""
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def manifest_revision(body):
    """Read source revisions from every item, never the external schema revision.

    Both builders supply the same captured Git revision to this generated manifest
    and FD_CORE_REVISION. This checks deployed metadata, not runtime JS execution.
    """
    data = json.loads(body, object_pairs_hook=unique_object)
    if (not isinstance(data, dict) or type(data.get('schemaVersion')) is not int
            or data['schemaVersion'] != 1 or not isinstance(data.get('items'), list)
            or not data['items']):
        raise ValueError('invalid manifest')
    revisions, ids = set(), set()
    for item in data['items']:
        if not isinstance(item, dict):
            raise ValueError('invalid item')
        item_id, source = item.get('id'), item.get('source')
        if not isinstance(item_id, str) or not item_id or item_id in ids or not isinstance(source, dict):
            raise ValueError('invalid item identity or source')
        ids.add(item_id)
        revision = source.get('revision')
        if (source.get('repository') != 'jmoss333/psychiatry-clerkship'
                or not isinstance(revision, str) or not REVISION.fullmatch(revision)):
            raise ValueError('invalid source revision')
        revisions.add(revision)
    if len(revisions) != 1:
        raise ValueError('mixed source revisions')
    return revisions.pop()


def read_revision(base_url, opener):
    request = Request(base_url + REVISION_PATH, headers={
        'Accept': 'application/json', 'Cache-Control': 'no-cache',
        'User-Agent': 'psychiatry-clerkship-revision-parity/1',
    })
    try:
        response = opener.open(request, timeout=TIMEOUT_SECONDS)
    except HTTPError as exc:
        exc.close()
        return {'error': 'http_status'}
    except (URLError, OSError, HTTPException):
        return {'error': 'transport'}
    try:
        if response.status != 200:
            return {'error': 'http_status'}
        if response.headers.get('Content-Type', '').split(';', 1)[0].strip().lower() != 'application/json':
            return {'error': 'content_type'}
        body = response.read(MAX_BODY_BYTES + 1)
        if len(body) > MAX_BODY_BYTES:
            return {'error': 'response_too_large'}
        return {'revision': manifest_revision(body.decode('utf-8'))}
    except UnicodeError:
        return {'error': 'invalid_encoding'}
    except (ValueError, RecursionError):
        return {'error': 'revision_missing_or_ambiguous'}
    except (OSError, HTTPException):
        return {'error': 'transport'}
    finally:
        response.close()


def _receipt(status, observations, **extra):
    return {'schemaVersion': 1, 'status': status,
            'exitCode': {'matched': 0, 'mismatch': 1, 'unavailable': 2}[status],
            'observations': observations, **extra}


def check(config, *, opener=None, attempts=3, retry_delay=60, sleep=time.sleep,
          now=lambda: datetime.now(timezone.utc).isoformat(timespec='seconds')):
    """Re-read both sites each round; never compare a new sample to an old sample."""
    if type(attempts) is not int or not 1 <= attempts <= 3 or not 0 <= retry_delay <= 60:
        raise ValueError('attempts must be 1–3 and retry delay 0–60 seconds')
    try:
        sites = canary._validate_config(config)
        if len(sites) != 2 or {s['name'] for s in sites} != {'ms3', 'res'}:
            raise canary.CanaryError('exactly the ms3 and res sites are required')
    except canary.CanaryError as exc:
        return _receipt('unavailable', [], error=str(exc))
    opener = opener or build_opener()
    observations = []
    for attempt in range(attempts):
        samples = [dict(name=s['name'], baseUrl=s['baseUrl'], **read_revision(s['baseUrl'], opener))
                   for s in sites]
        status = ('unavailable' if any('error' in s for s in samples) else
                  'matched' if len({s['revision'] for s in samples}) == 1 else 'mismatch')
        observations.append({'checkedAt': now(), 'status': status, 'sites': samples})
        if status == 'matched' or attempt == attempts - 1:
            return _receipt(status, observations)
        sleep(retry_delay)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=canary.DEFAULT_CONFIG_PATH)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--attempts', type=int, choices=range(1, 4), default=3)
    parser.add_argument('--retry-delay', type=int, choices=range(61), default=60)
    args = parser.parse_args(argv)
    try:
        receipt = check(canary._load_config(args.config), attempts=args.attempts,
                        retry_delay=args.retry_delay)
    except canary.CanaryError as exc:
        receipt = _receipt('unavailable', [], error=str(exc))
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    except OSError:
        print('::error::Production revision receipt could not be written', file=sys.stderr)
        return 2
    summary = ', '.join(s['name'] + '=' + s.get('revision', s.get('error', 'unknown'))
                        for s in receipt['observations'][-1]['sites']) if receipt['observations'] else 'configuration unavailable'
    prefix = '::error::' if receipt['exitCode'] else ''
    print(f"{prefix}Production revisions {receipt['status']}: {summary}")
    return receipt['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())
