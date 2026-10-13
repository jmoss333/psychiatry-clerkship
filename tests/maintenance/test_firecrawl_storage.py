"""Serialization overhead must not block intact review evidence within the byte cap."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'13_Faculty_Resources/_automation/surveillance/bin'))
from run_firecrawl_review import atomic_json

class Storage(unittest.TestCase):
    def test_compact_fallback_preserves_every_record(self):
        value={'packets':[{'text':'é'*25,'evidence':[1,2,3]}]*65000}
        self.assertGreater(len(json.dumps(value,ensure_ascii=False,indent=2).encode()),8_000_000)
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'inbox.json'
            atomic_json(path,value)
            self.assertLessEqual(path.stat().st_size,8_000_000)
            self.assertEqual(json.loads(path.read_text()),value)
            self.assertFalse(path.with_suffix('.tmp').exists())
    def test_actual_overflow_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'inbox.json';path.write_text('{"previous":true}')
            with self.assertRaisesRegex(ValueError,'exceeds supported size'):
                atomic_json(path,{'text':'é'*4_000_001})
            self.assertEqual(path.read_text(),'{"previous":true}')
            self.assertFalse(path.with_suffix('.tmp').exists())

if __name__=='__main__': unittest.main()
