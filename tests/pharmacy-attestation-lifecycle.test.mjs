// Exercise the real validators and projection with synthetic signatures in a disposable
// fixture. No repository attestation is written or refreshed by this test.
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Pharmacy can move from pending to signed to drifted without a second source status', () => {
  execFileSync('python3', ['-c', String.raw`
import copy, json, pathlib, shutil, sys, tempfile
repo = pathlib.Path.cwd()
sys.path.insert(0, str(repo / '13_Faculty_Resources/_automation'))
from attestation_hash import digest, clinical_digest
from surface_governance import load_effective_ledger
from validate_attestation_consistency import validate
from validate_tool_governance import parse_metadata_marker, normalize_tool

slug = 'pharmacy.html'
source = '05_Psychopharmacology/Pharmacy/pharmacy.html'
data = (repo / source).read_bytes()
marker = parse_metadata_marker(data, source)
assert 'status' not in marker.fields, 'a source status deadlocks signing or reopening'
old = data.replace(b' authorship="ai-drafted"', b' authorship="ai-drafted" status="pending"', 1)
assert digest(slug, {source: old}, None) != digest(slug, {source: data}, None)
assert clinical_digest(slug, {source: old}, None) != clinical_digest(slug, {source: data}, None)

with tempfile.TemporaryDirectory(prefix='pharmacy-lifecycle-') as directory:
    root = pathlib.Path(directory)
    def write(path, value):
        p = root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(value))
    (root / source).parent.mkdir(parents=True)
    (root / source).write_bytes(data)
    write('topic_meta.json', {})
    prefix = '13_Faculty_Resources/'
    build = prefix + '_automation/site_build/'
    write(build + 'site_manifest.json', {'md': [], 'tools': [[source, slug, 'Psychiatric Pharmacy']]})
    document = json.loads((repo / (build + 'shipped_pages.json')).read_text())
    page = next(p for p in document['pages'] if p['slug'] == slug)
    write(build + 'shipped_pages.json', {**document, 'pages': [page]})
    shutil.copyfile(repo / (prefix + 'reviewed.schema.json'), root / (prefix + 'reviewed.schema.json'))
    pending = {'status': 'pending', 'risk': {'kind': 'formulary', 'level': 'high'},
               'at': '2026-01-01', 'by': 'Pending faculty review', 'reason': 'Synthetic fixture'}
    def check(row, expected):
        write(prefix + 'reviewed.json', {slug: row})
        assert validate(root) == [], validate(root)
        effective, report = load_effective_ledger(root)
        assert effective[slug]['status'] == expected, report
        envelope = normalize_tool((root / source).read_bytes(), source, slug, marker,
                                  revision='0' * 40, ledger_entry=effective[slug])
        assert envelope['reviewStatus'] == ('reviewed' if expected == 'reviewed' else 'needs-review')
        assert envelope['attestationStatus'] == ('faculty-attested' if expected == 'reviewed' else 'needs-attestation')
        return report
    check(pending, 'pending')
    signed = {**pending, 'status': 'reviewed', 'by': 'Synthetic Fixture Reviewer',
              'contentHash': digest(slug, {source: data}, None),
              'clinicalHash': clinical_digest(slug, {source: data}, None)}
    signed.pop('reason')
    stale = {**signed, 'contentHash': digest(slug, {source: old}, None),
             'clinicalHash': clinical_digest(slug, {source: old}, None)}
    assert slug in check(stale, 'pending')['stale'], 'the existing signature must not approve new bytes'
    check(signed, 'reviewed')
    (root / source).write_bytes(data + b'\n<!-- synthetic later change -->\n')
    assert slug in check(signed, 'pending')['stale']
    check(pending, 'pending')
    unbound = copy.deepcopy(signed)
    del unbound['contentHash']
    write(prefix + 'reviewed.json', {slug: unbound})
    assert validate(root), 'removing source status must not admit an unbound attestation'
`], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe' });
});
