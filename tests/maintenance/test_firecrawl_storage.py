"""Serialization overhead must not block intact review evidence within the byte cap."""
import contextlib
import io
import os
from unittest.mock import patch
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'13_Faculty_Resources/_automation/surveillance/bin'))
from run_firecrawl_review import atomic_json, storage_capacity, report_storage, STORAGE_WARNING_BYTES

class Storage(unittest.TestCase):
    def test_compact_fallback_preserves_every_record(self):
        value={'packets':[{'text':'é'*25,'evidence':[1,2,3]}]*65000}
        self.assertGreater(len(json.dumps(value,ensure_ascii=False,indent=2).encode()),8_000_000)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'inbox.json'
            atomic_json(path,value)
            self.assertLessEqual(path.stat().st_size,8_000_000)
            self.assertEqual(storage_capacity(path)['usedBytes'],path.stat().st_size)
            self.assertEqual(json.loads(path.read_text()),value)
            self.assertFalse(path.with_suffix('.tmp').exists())
    def test_warning_boundary_measures_bytes_without_modifying_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'inbox.json'
            for size, expected in [(STORAGE_WARNING_BYTES-1,'ok'),(STORAGE_WARNING_BYTES,'warning'),(8_000_000,'warning')]:
                evidence=('é'*(size//2)).encode()+b' '*(size%2)
                path.write_bytes(evidence)
                capacity=storage_capacity(path)
                self.assertEqual(capacity['status'],expected)
                self.assertEqual(capacity['usedBytes'],len(evidence))
                self.assertEqual(capacity['remainingBytes'],8_000_000-size)
                self.assertEqual(path.read_bytes(),evidence)

    def test_warning_reaches_actions_summary_and_annotation(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'inbox.json';summary=Path(d)/'summary.md'
            path.write_bytes(b' '*STORAGE_WARNING_BYTES)
            output=io.StringIO()
            with patch.dict(os.environ,{'GITHUB_ACTIONS':'true','GITHUB_STEP_SUMMARY':str(summary)}),contextlib.redirect_stdout(output):
                capacity=report_storage(path)
            self.assertEqual(capacity['status'],'warning')
            self.assertIn('::warning title=Surveillance storage capacity::',output.getvalue())
            self.assertIn('80.0%',summary.read_text())
            self.assertIn('All review evidence is retained',summary.read_text())
            self.assertEqual(path.stat().st_size,STORAGE_WARNING_BYTES)

    def test_actual_overflow_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'inbox.json';path.write_text('{"previous":true}')
            with self.assertRaisesRegex(ValueError,'exceeds supported size'):
                atomic_json(path,{'text':'é'*4_000_001})
            self.assertEqual(path.read_text(),'{"previous":true}')
            self.assertFalse(path.with_suffix('.tmp').exists())

if __name__=='__main__': unittest.main()
