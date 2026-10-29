"""Exercise learner question downloads with synthetic approval states, never a live queue."""
import csv
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import genanki
import export_anki as qb
import check_anki_parity as parity

HERE = Path(__file__).resolve().parent
QB_PACKAGE = 'psychiatry_clerkship_library.apkg'
QB_CSV = 'psychiatry_clerkship_library.csv'


def item(number, *, status='attested', **changes):
    question = dict(id=f'qb_mood_{number:03d}', status=status, type='sba', category='mood',
                    competency=['dx'], difficulty=1, pages=['synthetic.md'],
                    stem=f'Synthetic marker {number}: which token fits?',
                    options=[dict(key='A', t='Alpha', c=True)] + [
                        dict(key=k, t=k, trap=dict(name='Wrong token', note='Choose Alpha.'))
                        for k in 'BCD'],
                    why='Alpha is the selected token.', pearl='Keep the synthetic token.',
                    evidence='Synthetic source fixture.')
    question.update(changes)
    return question


def bank(items):
    return dict(_note='Synthetic download fixture.', version=1, items=items)


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='qbank-downloads-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.old_tempdir = tempfile.tempdir
        tempfile.tempdir = self.tmp.name
        self.addCleanup(setattr, tempfile, 'tempdir', self.old_tempdir)
        self.env = {**os.environ, 'TMPDIR': self.tmp.name}
        self.items = [item(1), item(2, status='draft'), item(3, retired=True)]
        self.input = self.root / 'bank.json'
        self.input.write_text(json.dumps(bank(self.items)))
        self.feed = self.root / 'concepts.json'
        self.feed.write_text(json.dumps({'cards': []}))

    def command(self, *args):
        return subprocess.run([str(a) for a in args], env=self.env, text=True,
                              capture_output=True, timeout=60)

    def successful(self, *args):
        result = self.command(*args)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def site(self, name='ms3', items=None):
        out = self.root / name
        (out / 'tools').mkdir(parents=True)
        (out / 'tools/concepts.json').write_text(self.feed.read_text())
        (out / 'question_bank.json').write_text(json.dumps(bank(items if items is not None else [item(1)])))
        return out

    def build(self, out, here=HERE):
        return self.successful('bash', here / 'build_anki.sh', out)

    def test_standalone_exports_approved_active_questions_only(self):
        # Removing projection must expose the retired-but-attested fixture here.
        out = self.root / 'standalone'
        self.successful(sys.executable, HERE / 'export_anki.py', '--bank', self.input, '--out', out)
        self.assertEqual([r['fields'][0] for r in parity.read_cards(out / QB_PACKAGE)], ['qb_mood_001'])
        self.successful(sys.executable, HERE / 'export_anki_all.py', '--bank', self.input,
                        '--feed', self.feed, '--out', out)
        for name in (QB_PACKAGE, 'psychiatry_clerkship_library_ALL.apkg'):
            self.assertEqual([r['fields'][0] for r in parity.read_cards(out / name)], ['qb_mood_001'])
        with (out / QB_CSV).open() as handle:
            self.assertEqual([r['id'] for r in csv.DictReader(handle)], ['qb_mood_001'])

    def test_draft_export_switch_cannot_bypass_approval(self):
        out = self.root / 'draft-export'
        result = self.command(sys.executable, HERE / 'export_anki.py', '--bank', self.input,
                              '--out', out, '--include-drafts')
        self.assertNotEqual(result.returncode, 0, 'learner exporter accepted unapproved output')
        self.assertFalse(list(out.glob('*')))
        with self.assertRaises(ValueError):
            qb.build_deck(self.items, include_drafts=True)

    def test_malformed_or_missing_bank_fails_before_export(self):
        for index, content in enumerate((bank([item(1, status='unknown')]), bank([item(1, retired='false')]),
                        {'version': 1, '_note': 'missing items'}, bank([item(1, id='invalid')]))):
            with self.subTest(content=content):
                self.input.write_text(json.dumps(content))
                out = self.root / f'invalid-{index}'
                result = self.command(sys.executable, HERE / 'export_anki.py', '--bank', self.input, '--out', out)
                self.assertNotEqual(result.returncode, 0, 'malformed approval data silently exported')
                self.assertFalse(list(out.glob('*')))
        self.input.unlink()
        result = self.command(sys.executable, HERE / 'export_anki.py', '--bank', self.input, '--out', self.root / 'absent')
        self.assertNotEqual(result.returncode, 0)

    def test_builds_both_sites_from_their_public_bank_and_ships_checked_csv(self):
        # Canonical-bank fallback would yield unrelated IDs instead of this literal fixture.
        for name in ('ms3', 'res'):
            with self.subTest(site=name):
                out = self.site(name)
                self.build(out)
                parity.check_output(out)
                self.assertEqual([r['fields'][0] for r in parity.read_cards(out / 'anki' / QB_PACKAGE)], ['qb_mood_001'])
                with (out / 'anki' / QB_CSV).open() as handle:
                    self.assertEqual([r['id'] for r in csv.DictReader(handle)], ['qb_mood_001'])

    def test_parity_rejects_unapproved_cards_and_csv_even_when_counts_match(self):
        out = self.site()
        self.build(out)
        package = out / 'anki' / QB_PACKAGE
        original = package.read_bytes()
        for leak in (item(2, status='draft'), item(3, retired=True)):
            with self.subTest(leak=leak['id']):
                deck = genanki.Deck(qb.DECK_ID, qb.DECK_NAME)
                for note in qb.build_note(leak, False):
                    deck.add_note(note)
                genanki.Package(deck).write_to_file(str(package))
                with self.assertRaisesRegex(ValueError, 'question-bank'):
                    parity.check_output(out)
        package.write_bytes(original)
        csv_path = out / 'anki' / QB_CSV
        self.assertTrue(csv_path.exists(), 'learner CSV download is missing')
        csv_path.write_text(csv_path.read_text().replace('qb_mood_001', 'qb_mood_002'))
        with self.assertRaisesRegex(ValueError, 'CSV|csv'):
            parity.check_output(out)

    def test_parity_rejects_unregistered_downloads(self):
        out = self.site()
        self.build(out)
        (out / 'anki' / 'unapproved.csv').write_text('id,stem\nqb_mood_002,Draft marker\n')
        with self.assertRaisesRegex(ValueError, 'download|staged'):
            parity.check_output(out)

    def test_parity_cannot_fall_back_to_canonical_when_public_bank_is_missing(self):
        out = self.site()
        self.build(out)
        (out / 'question_bank.json').unlink()
        with self.assertRaises(FileNotFoundError):
            parity.check_output(out)
        result = self.command('bash', HERE / 'build_anki.sh', out)
        self.assertNotEqual(result.returncode, 0)

    def test_no_approved_questions_produces_empty_downloads(self):
        out = self.site(items=[])
        self.build(out)
        parity.check_output(out)
        self.assertEqual(parity.read_cards(out / 'anki' / QB_PACKAGE), [])
        with (out / 'anki' / QB_CSV).open() as handle:
            self.assertEqual(list(csv.DictReader(handle)), [])

    def test_committed_fallback_is_rejected_after_a_question_loses_approval(self):
        # Use actual prior exports as fallback, then fail the concept generation stage.
        previous = self.site('previous')
        self.build(previous)
        fake_repo = self.root / 'fallback-repo'
        here = fake_repo / '13_Faculty_Resources/_automation/site_build'
        here.mkdir(parents=True)
        for name in ('build_anki.sh', 'export_anki.py', 'export_anki_all.py',
                     'export_anki_content.py', 'check_anki_parity.py', 'qbank_public.py',
                     'concept_guid_crosswalk.json'):
            shutil.copyfile(HERE / name, here / name)
        with (here / 'export_anki_content.py').open('a') as handle:
            handle.write('\nif __name__ == "__main__": raise RuntimeError("synthetic generation failure")\n')
        shutil.copyfile(HERE.parents[2] / 'question_bank.schema.json', fake_repo / 'question_bank.schema.json')
        (fake_repo / 'question_bank.json').write_text(json.dumps(bank([item(2)])))
        fallback = fake_repo / '09_Exam_Prep/anki_export'
        shutil.copytree(previous / 'anki', fallback)
        out = self.site('current', items=[item(2)])
        result = self.command('bash', here / 'build_anki.sh', out)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('checking committed fallback', result.stdout)
        self.assertIn('question-bank', result.stderr)
        self.assertFalse((out / 'anki').exists(), 'failed fallback reached learner downloads')


if __name__ == '__main__':
    unittest.main()
