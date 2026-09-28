"""Generated concepts: attestation inputs, signed release, and final artifacts."""
import ast
import hashlib
import json
import re
import subprocess
import unittest
from pathlib import Path

import test_concept_cards as fixtures
HERE = fixtures.HERE
import attestation_hash
import common
import concept_cards
import teaching_dependencies as deps

CANDIDATE = '13_Faculty_Resources/_automation/site_build/concept_candidates.json'
EVIDENCE = '13_Faculty_Resources/_automation/site_build/concept_evidence_links.json'


class ConceptBuildTests(unittest.TestCase):
    setUp = fixtures.ConceptCardsTests.setUp
    write = fixtures.ConceptCardsTests.write
    sign = fixtures.ConceptCardsTests.sign

    def setup_tool(self):
        (self.root / 'evidence_registry.json').write_text('{"sources": []}')
        self.tool = self.root / 'review.html'
        self.tool.write_text('<html><head></head><body>Review</body></html>')
        self.tool_page = {'source': 'review.html', 'slug': 'review.html', 'kind': 'tool',
                          'sites': ['ms3', 'res'], 'extraSources': [CANDIDATE, EVIDENCE]}
        self.shipped['pages'].append(self.tool_page)
        self.write('shipped_pages.json', self.shipped)
        self.out = self.root / '_build/ms3'
        (self.out / 'tools').mkdir(parents=True)
        (self.out / 'tools/review.html').write_bytes(self.tool.read_bytes())
        (self.out / 'index.html').write_bytes(self.tool.read_bytes())

    def test_generated_concepts_asset_is_checked(self):
        self.setup_tool()
        for site in ('ms3', 'res'):
            expected = concept_cards.feed_bytes(self.root, site)
            asset = self.out / 'tools/concepts.json'
            asset.write_bytes(expected)
            self.assertEqual(deps.discover(self.root, self.tool_page, {}, site, self.out), {CANDIDATE, EVIDENCE})
            asset.write_bytes(expected[:-1])
            with self.assertRaisesRegex(deps.DependencyError, 'concepts.json'):
                deps.discover(self.root, self.tool_page, {}, site, self.out)
            asset.unlink()
            with self.assertRaisesRegex(deps.DependencyError, 'concepts.json'):
                deps.discover(self.root, self.tool_page, {}, site, self.out)

    def test_signed_overlay_changes_release_without_changing_tool_hash(self):
        self.setup_tool()
        self.sign('pending')
        before = attestation_hash.digest_from_tree(self.root, self.shipped, {}, 'review.html')
        self.assertEqual(deps.discover(self.root, self.tool_page, {}, 'ms3'), {CANDIDATE, EVIDENCE})
        with self.assertRaisesRegex(ValueError, 'empty release'):
            concept_cards.feed_bytes(self.root, 'ms3')
        source_hash = attestation_hash.digest_from_tree(self.root, self.shipped, {}, 'different-route.md')
        (self.root / 'question_bank.json').write_text('{"version":1,"items":[]}')
        script = r'''
import fs from 'node:fs';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {appendEvents, loadSigner} from './faculty-console/ledger.mjs';
import {run} from './13_Faculty_Resources/_automation/site_build/ledger_overlay.mjs';
const [root, hash] = process.argv.slice(1);
const {privateKey} = generateKeyPairSync('ed25519');
const signer = loadSigner(privateKey.export({type:'pkcs8',format:'der'}).toString('base64'));
const keysDoc = {version:1,keys:[{keyId:signer.keyId,algorithm:'ed25519',publicKeyPem:signer.publicKey.export({type:'spki',format:'pem'}),addedAt:'2026-09-25',revokedAt:null}]};
fs.mkdirSync(path.join(root,'13_Faculty_Resources/ledger'),{recursive:true});
fs.writeFileSync(path.join(root,'13_Faculty_Resources/ledger/keys.json'),JSON.stringify(keysDoc));
const text = appendEvents({existingText:'',keysDoc,drafts:[{type:'attest',kind:'content',id:'different-route.md',contentHash:hash}],ts:'2026-09-25T12:00:00.000Z',by:'Synthetic Faculty, MD',base:'b'.repeat(40),signer}).text;
const file = path.join(root,'events.jsonl');
fs.writeFileSync(file,text);
process.exitCode = run(['--root',root,'--receipt',path.join(root,'receipt.json')],{...process.env,CLERKSHIP_LEDGER:'on',CLERKSHIP_LEDGER_FILE:file});
'''
        result = subprocess.run(['node', '--input-type=module', '-e', script, str(self.root), source_hash],
                                cwd=HERE.parents[2], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for site in ('ms3', 'res'):
            self.assertEqual(len(json.loads(concept_cards.feed_bytes(self.root, site))['cards']), 2)
        self.assertEqual(before, attestation_hash.digest_from_tree(self.root, self.shipped, {}, 'review.html'))
        self.page.write_text(self.page.read_text() + '\nAuthored change.\n')
        with self.assertRaisesRegex(ValueError, 'empty release'):
            concept_cards.feed_bytes(self.root, 'res')

    def test_digest_replaces_inherited_value_and_worker_precaches_final_bytes(self):
        self.setup_tool()
        raw = concept_cards.feed_bytes(self.root, 'ms3')
        (self.out / 'tools/concepts.json').write_bytes(raw)
        digest = hashlib.sha256(raw).hexdigest()
        common.inject_concept_digest(self.out, '0' * 64)
        common.inject_concept_digest(self.out, digest)
        common.inject_concept_digest(self.out, digest)
        for path in (self.out / 'index.html', self.out / 'tools/review.html'):
            text = path.read_text()
            self.assertEqual(text.count('name="cw-concept-digest"'), 1)
            self.assertIn('content="' + digest + '"', text)
            self.assertNotIn('0' * 64, text)
        common.emit_service_worker(str(self.out))
        self.assertIn('"/tools/concepts.json"', (self.out / 'sw.js').read_text())

    def test_review_restore_inventory_embeds_every_bank_id_and_replaces_inherited_site_data(self):
        self.setup_tool()
        first = [{'id': 'QB-one', 'retired': False}, {'id': 'QB-old', 'retired': True}]
        second = [{'id': 'QB-two', 'retired': False}]
        common.inject_review_qb_inventory(self.out, first)
        common.inject_review_qb_inventory(self.out, second)
        text = (self.out / 'tools/review.html').read_text()
        match = re.findall(r'<script id="cw-review-qb-inventory" type="application/json">(.*?)</script>', text)
        self.assertEqual(len(match), 1)
        self.assertEqual(json.loads(match[0]), second)
        self.assertNotIn('QB-one', text)
        self.assertNotIn('QB-old', text)
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            common.inject_review_qb_inventory(self.out, [{'id': 'x'}, {'id': 'x'}])

    def test_review_source_digests_bind_exact_built_bytes_and_replace_inherited_site_data(self):
        self.setup_tool()
        sources = {
            'articles': 'tools/quizzes.json',
            'topics': 'topic_meta.json',
            'family': 'family_systems_scenarios.json',
            'communication': 'communication_cases.json',
            'reasoning': 'reasoning_cases.json',
        }
        for key, relative in sources.items():
            path = self.out / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(('ms3-' + key).encode('utf-8'))
        first = common.inject_review_source_digests(self.out)
        self.assertEqual(first, {
            key: hashlib.sha256(('ms3-' + key).encode('utf-8')).hexdigest()
            for key in sources
        })
        for key, relative in sources.items():
            (self.out / relative).write_bytes(('resident-' + key).encode('utf-8'))
        second = common.inject_review_source_digests(self.out)
        text = (self.out / 'tools/review.html').read_text()
        match = re.findall(r'<script id="cw-review-source-digests" type="application/json">(.*?)</script>', text)
        self.assertEqual(len(match), 1)
        self.assertEqual(json.loads(match[0]), second)
        self.assertEqual(second, {
            key: hashlib.sha256(('resident-' + key).encode('utf-8')).hexdigest()
            for key in sources
        })
        self.assertNotIn(first['articles'], text)
        (self.out / 'reasoning_cases.json').unlink()
        with self.assertRaisesRegex(FileNotFoundError, 'reasoning_cases.json'):
            common.inject_review_source_digests(self.out)

    def test_each_builder_projects_before_worker_and_daily_review_is_visible(self):
        for name, site in [('build_deploy.py', 'ms3'), ('resident_section.py', 'res')]:
            text = (HERE / name).read_text()
            self.assertIn('concept_cards.feed_bytes(Path(LIB), "' + site + '")', text)
            self.assertLess(text.index('common.inject_concept_digest('), text.index('common.emit_service_worker('))
            self.assertLess(text.index('common.inject_review_qb_inventory('), text.index('common.emit_service_worker('))
            self.assertLess(text.index('common.inject_review_qb_inventory('), text.index('common.inject_review_source_digests('))
            self.assertLess(text.index('common.inject_review_source_digests('), text.index('common.emit_service_worker('))
            self.assertLess(text.index('_tm_built'), text.index('common.inject_review_source_digests('))
            self.assertIn('Path(OUT) / "question_bank.json"', text)
            tree = ast.parse(text)
            if site == 'ms3':
                hidden = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                              and any(isinstance(t, ast.Name) and t.id == 'HIDDEN_TOOLS' for t in n.targets))
                self.assertNotIn('review.html', hidden)
                self.assertIn('shelf-mode.html', hidden)
            else:
                nav = next(n.value for n in tree.body if isinstance(n, ast.Assign)
                           and any(isinstance(t, ast.Name) and t.id == 'nav' for t in n.targets))
                practice = next(ast.literal_eval(section) for section in nav.elts
                                if isinstance(section, ast.Dict) and any(
                                    isinstance(value, ast.Constant) and value.value == 'Practice and Exam Prep'
                                    for value in section.values))
                items = {i['f']: i for i in practice['items']}
                self.assertFalse(items['review.html'].get('hidden', False))
                self.assertTrue(items['shelf-mode.html']['hidden'])


if __name__ == '__main__':
    unittest.main()
