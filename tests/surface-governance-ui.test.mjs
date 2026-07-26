import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';


const SHELL = fileURLToPath(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html',
  import.meta.url,
));
const LONGITUDINAL = fileURLToPath(new URL(
  '../08_Cases_and_Simulation/one-patient-six-weeks.html',
  import.meta.url,
));

test('the shared shell consumes only the public governance projection', async () => {
  const source = await readFile(SHELL, 'utf8');

  assert.match(source, /fetch\(['"]governance[.]json['"]\)/);
  assert.doesNotMatch(source, /fetch\(['"]reviewed[.]json['"]\)/);
  assert.match(source, /function renderGovernanceNotice\(item\)/);
  assert.match(
    source,
    /Review status unavailable(?:&mdash;|—)verify with faculty/,
  );
  assert.match(source, /function toolFrameSuffixWithGovernance\(extra\)/);
  assert.match(source, /governed=1/);
});

test('risk-aware notices use semantic urgency and fixed supervision copy', async () => {
  const source = await readFile(SHELL, 'utf8');

  assert.match(source, /class="governance-notice pending-high"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /tabindex="-1"/);
  assert.match(source, /class="governance-notice pending-compact"/);
  assert.match(source, /role="status"/);
  assert.match(source, /class="governance-notice reviewed-receipt"/);
  assert.doesNotMatch(
    source,
    /TOPIC_META[^;\n]*facultyReview|facultyReview[^;\n]*TOPIC_META/,
  );
});

test('navigation and search expose pending status as text, not color alone', async () => {
  const source = await readFile(SHELL, 'utf8');

  assert.match(source, /function governanceBadge\(triplet\)/);
  assert.match(source, /Pending review · High risk/);
  assert.match(source, /governance-badge/);
  assert.match(source, /aria-label/);
});

test('the longitudinal case keeps progress storage but drops its raw-ledger client', async () => {
  const source = await readFile(LONGITUDINAL, 'utf8');

  assert.match(source, /cw_longitudinal_v1/);
  assert.doesNotMatch(source, /reviewed[.]json|function reviewBadge\(/);
});
