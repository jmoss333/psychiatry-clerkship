#!/usr/bin/env python3
"""Manual synthetic new/same/changed/same probe. No clinical or inbox writes."""
import argparse
from datetime import timedelta
import difflib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request
import uuid

import lib_surveillance as L
import run_firecrawl_pilot as R
from run_firecrawl_probe import now, safe_response, timestamp

REPOSITORY = 'jmoss333/psychiatry-clerkship'
PREFIX = 'automation/firecrawl-fixture/'
SENTENCES = {'A': 'Place the fictional amber books on shelf Cedar.',
             'B': 'Place the fictional amber books on shelf Maple.'}


def fixture(probe_id, version):
    return ('# Synthetic change-detection fixture\n\n'
            'This is an automated software test, not clinical guidance or learner material.\n\n'
            f'Fixture identity: {probe_id}\n\n'
            'The fictional library uses named shelves to sort imaginary books. '
            'The following instruction is deliberately changed once to test source surveillance. '
            'No patient information, medical recommendation, faculty decision, or examination item is present.\n\n'
            + SENTENCES[version] + '\n\n'
            'Only the shelf name changes between the two versions. All other text stays fixed.\n')


def github(method, endpoint, payload=None):
    """CLI supplies the Actions credential; do not expose errors or credentials."""
    command = ['gh', 'api', '--method', method, f'repos/{REPOSITORY}/{endpoint}']
    if payload is not None:
        command += ['--input', '-']
    result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                            text=True, capture_output=True, timeout=60, check=False)
    if result.returncode:
        raise OSError('Fixture publication failed')
    return json.loads(result.stdout)


class FixturePublisher:
    """Create one unique orphan fixture branch; never accept arbitrary write targets."""
    def __init__(self, run_id):
        if not re.fullmatch(r'[0-9]+-[0-9]+', run_id):
            raise ValueError('Expected Actions run and attempt IDs')
        self.branch = PREFIX + run_id + '-' + uuid.uuid4().hex
        self.url = f'https://raw.githubusercontent.com/{REPOSITORY}/refs/heads/{self.branch}/fixture.md'
        self.head = None

    def publish(self, text):
        if self.head:
            actual = github('GET', 'git/ref/heads/' + self.branch)['object']['sha']
            if actual != self.head:
                raise ValueError('Fixture branch changed outside this run')
        tree = github('POST', 'git/trees', {'tree': [
            {'path': 'fixture.md', 'mode': '100644', 'type': 'blob', 'content': text}]})['sha']
        commit = github('POST', 'git/commits', {'message': 'Synthetic Firecrawl fixture [skip ci] [skip netlify]',
                        'tree': tree, 'parents': [self.head] if self.head else []})['sha']
        if self.head:
            github('PATCH', 'git/refs/heads/' + self.branch, {'sha': commit, 'force': False})
        else:
            github('POST', 'git/refs', {'ref': 'refs/heads/' + self.branch, 'sha': commit})
        self.head = commit
        return commit


def wait_for_fixture(url, expected):
    """Bounded CDN propagation check, not additional Firecrawl requests."""
    for attempt in range(25):
        try:
            request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
            with urllib.request.build_opener(R.NoRedirect()).open(request, timeout=15) as response:
                if response.status == 200 and response.read(20000).decode('utf-8') == expected:
                    return True
        except (OSError, UnicodeError):
            pass
        if attempt < 24:
            time.sleep(15)
    return False


def validate_observation(source, observation, prior, probe_id, version, expected_status):
    response = observation.get('response')
    assessed = R.assess(source, response, None)
    if assessed['status'] == 'unable-to-check':
        return 'inconclusive', assessed['reason']
    data = response['data']
    text = data['markdown']
    if probe_id not in text or SENTENCES[version] not in text or SENTENCES['B' if version == 'A' else 'A'] in text:
        return 'inconclusive', 'Expected fixture identity and version were not retrieved'
    tracking = data.get('changeTracking', {})
    status = tracking.get('changeStatus')
    if status not in ('new', 'same', 'changed') or 'previousScrapeAt' not in tracking:
        return 'inconclusive', 'Missing or unexpected change-tracking metadata'
    if not prior:
        if status != 'new' or tracking['previousScrapeAt'] is not None:
            return 'inconclusive', 'Unique tag did not establish a new baseline'
        return 'pass', 'New baseline verified'
    if status == 'new':
        return 'inconclusive', 'Provider lost comparison history'
    previous_text = prior[-1]['response']['data']['markdown']
    try:
        stamp = timestamp(tracking['previousScrapeAt'])
        # Some providers retain a content-identical earlier observation as the baseline.
        aligned = any(p['response']['data']['markdown'] == previous_text and
                      timestamp(p['startedAt']) - timedelta(seconds=5) <= stamp <=
                      timestamp(p['completedAt']) + timedelta(seconds=5) for p in prior)
    except (ValueError, TypeError, KeyError):
        aligned = False
    if not aligned:
        return 'inconclusive', 'Provider baseline cannot be aligned to an observed matching version'
    changed = text != previous_text
    normalized_changed = L.normalize_text(text) != L.normalize_text(previous_text)
    expected_change = expected_status == 'changed'
    if status != expected_status or changed != expected_change or normalized_changed != expected_change:
        return 'disagreement', 'Provider or saved-text comparison disagrees with the controlled edit'
    return 'pass', 'Expected provider and saved-text result verified'


def run_known_change(out_dir, token, publisher, probe_id):
    out_dir = Path(out_dir).resolve()
    if out_dir.is_relative_to(Path(L.SURV_ROOT).resolve() / 'history'):
        raise ValueError('Output must be separate from production history')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,70}', probe_id):
        raise ValueError('Invalid fixture identity')
    out_dir.mkdir(parents=True, exist_ok=False)
    report = {'version': 1, 'mode': 'synthetic-known-change', 'probeId': probe_id,
              'status': 'incomplete', 'verdict': 'inconclusive', 'apiRequests': 0,
              'maxApiRequests': 4, 'requestCountComplete': False, 'observations': [], 'publications': [],
              'expected': ['new', 'same', 'changed', 'same'],
              'limits': 'Synthetic text detection only; not clinical sensitivity, faculty approval, or review credit.'}
    def save():
        report['generatedAt'] = now()
        temporary = out_dir / 'report.tmp'
        temporary.write_text(json.dumps(report, indent=2) + '\n')
        temporary.replace(out_dir / 'report.json')
    save()
    if not token:
        report['reason'] = 'FIRECRAWL_API_KEY is not configured'
        save()
        return report
    source = {'id': 'synthetic-known-change', 'url': publisher.url, 'modality': 'full_text'}
    report.update(sourceUrl=publisher.url, fixtureBranch=publisher.branch, trackingTag='known-' + probe_id)
    try:
        for index, version in enumerate(('A', 'A', 'B', 'B')):
            text = fixture(probe_id, version)
            if index in (0, 2):
                commit = publisher.publish(text)
                report['publications'].append({'version': version, 'commit': commit, 'textHash': L.sha_full(text)})
                save()
            if not wait_for_fixture(publisher.url, text):
                report['reason'] = 'Expected public fixture version was not served before scraping'
                break
            observation = {'version': version, 'startedAt': now(), 'expectedStatus': report['expected'][index]}
            report['apiRequests'] += 1
            save()  # A terminated in-flight request remains counted.
            observation['response'] = safe_response(R.fetch(source, token, tracking_tag=report['trackingTag']))
            observation['completedAt'] = now()
            observation['providerStatus'] = observation['response'].get('data', {}).get('changeTracking', {}).get('changeStatus')
            verdict, reason = validate_observation(source, observation, report['observations'], probe_id, version, report['expected'][index])
            observation.update(verdict=verdict, reason=reason)
            if report['observations'] and verdict != 'inconclusive':
                old = report['observations'][-1]['response']['data']['markdown']
                new = observation['response']['data']['markdown']
                observation['diff'] = '\n'.join(difflib.unified_diff(old.splitlines(), new.splitlines(), lineterm=''))
            report['observations'].append(observation)
            save()
            if verdict == 'inconclusive':
                break
        report['requestCountComplete'] = True
        if len(report['observations']) == 4 and all(o['verdict'] != 'inconclusive' for o in report['observations']):
            report['status'] = 'complete'
            report['verdict'] = 'disagreement' if any(o['verdict'] == 'disagreement' for o in report['observations']) else 'pass'
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        report['reason'] = 'Probe stopped on a publication or retrieval error; no request retry was issued'
        report['requestCountComplete'] = True
    finally:
        save()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out-dir', type=Path, required=True)
    args = parser.parse_args()
    publisher = FixturePublisher(os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'])
    report = run_known_change(args.out_dir, os.environ.get('FIRECRAWL_API_KEY', ''), publisher, uuid.uuid4().hex)
    print(json.dumps({k: report[k] for k in ('status', 'verdict', 'apiRequests')}))
    return 0 if report['verdict'] == 'pass' else 1 if report['verdict'] == 'disagreement' else 2


if __name__ == '__main__':
    raise SystemExit(main())
