"""The optional probe must never become a second writer or scheduled collector."""
import sys
import copy
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '13_Faculty_Resources' / '_automation'))
from maintenance import validate_scheduled_workflows as V

class ProbeWorkflow(unittest.TestCase):
    def test_manual_only_read_only_and_separate_artifact(self):
        errors = []
        w, _ = V._load(ROOT, 'surveillance-firecrawl.yml', errors)
        self.assertFalse(errors)
        control = w['on']['workflow_dispatch']['inputs']['comparison_probe']
        self.assertEqual(control['type'], 'boolean')
        self.assertIs(control['default'], False)
        regular = w['jobs']['evidence-review']
        self.assertEqual(regular['if'], "${{ github.event_name != 'workflow_dispatch' || !inputs.comparison_probe }}")
        probe = w['jobs']['comparison-probe']
        self.assertEqual(probe['if'], "${{ github.event_name == 'workflow_dispatch' && inputs.comparison_probe }}")
        self.assertEqual(probe['permissions'], {'contents': 'read'})
        self.assertEqual(probe['steps'][0]['with']['ref'], '${{ github.sha }}')
        steps = probe['steps']
        calls = [s.get('run', '') for s in steps]
        self.assertTrue(any('run_firecrawl_probe.py' in s for s in calls))
        self.assertFalse(any('report_branch.py' in s or 'run_firecrawl_review.py' in s for s in calls))
        upload = next(s for s in steps if str(s.get('uses', '')).startswith('actions/upload-artifact@'))
        self.assertEqual(upload['if'], 'always()')
        self.assertEqual(upload['with']['path'], '${{ runner.temp }}/firecrawl-probe')
        self.assertEqual(w['on']['schedule'], [{'cron': '30 6 * * 1'}])

    def test_guard_rejects_probe_write_permissions_or_scheduling(self):
        w, _ = V._load(ROOT, 'surveillance-firecrawl.yml', [])
        for mutation in ('write', 'missing', 'scheduled', 'skip-regular'):
            changed = copy.deepcopy(w)
            if mutation == 'write':
                changed['jobs']['comparison-probe']['permissions'] = {'contents': 'write'}
            elif mutation == 'missing':
                del changed['jobs']['comparison-probe']['permissions']
            elif mutation == 'scheduled':
                del changed['jobs']['comparison-probe']['if']
            else:
                changed['jobs']['evidence-review']['if'] = "${{ github.event_name == 'workflow_dispatch' }}"
            errors = []
            V._validate_job_boundaries('surveillance-firecrawl.yml', changed, errors)
            self.assertTrue(errors, mutation)

    def test_probe_cannot_recover_or_raise_production_escalation(self):
        probe, _ = V._load(ROOT, 'surveillance-firecrawl.yml', [])
        self.assertEqual(probe['run-name'], "${{ inputs.comparison_probe && 'Firecrawl comparison probe' || 'Surveillance — Firecrawl Faculty Review' }}")
        escalation, _ = V._load(ROOT, 'automation-failure-escalation.yml', [])
        condition = escalation['jobs']['escalate']['if']
        self.assertIn("github.event.workflow_run.name == 'Surveillance — Firecrawl Faculty Review'", condition)
        self.assertIn("github.event.workflow_run.display_title == 'Firecrawl comparison probe'", condition)
        self.assertIn("&& !(", condition)

    def test_live_event_name_is_excluded_but_regular_collector_is_not(self):
        escalation, _ = V._load(ROOT, 'automation-failure-escalation.yml', [])
        condition = escalation['jobs']['escalate']['if']
        def permitted(name, title, conclusion):
            expression = condition
            for field, value in {'name': name, 'display_title': title, 'conclusion': conclusion}.items():
                expression = expression.replace('github.event.workflow_run.' + field, repr(value))
            expression = expression.replace('&&', ' and ').replace('||', ' or ').replace('!(', 'not (')
            return eval(expression, {'__builtins__': {}}, {})
        regular = 'Surveillance — Firecrawl Faculty Review'
        probe = 'Firecrawl comparison probe'
        for conclusion in ('success', 'failure'):
            # Observed workflow_run payload for live run 37243735436.
            self.assertFalse(permitted(probe, probe, conclusion))
            self.assertFalse(permitted(regular, probe, conclusion))
            self.assertTrue(permitted(regular, regular, conclusion))
            self.assertTrue(permitted('Other workflow', 'Other workflow', conclusion))
        self.assertFalse(permitted(regular, regular, 'cancelled'))

if __name__ == '__main__':
    unittest.main()
