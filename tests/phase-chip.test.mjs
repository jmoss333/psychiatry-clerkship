// Migration contract for the retired Today phase chip. Phase-policy remains injected because
// Daily Review and the internal Progress plan share its date math; the Front Door Today surface
// now owns pacing copy through fdExamCountdown instead of the removed renderHome chip.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const shell = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url), 'utf8');
const today = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js', import.meta.url), 'utf8');

test('the canonical phase-policy snippet remains injected once with no local clone', () => {
  assert.equal(shell.split('/*__PHASE_POLICY__*/').length - 1, 1);
  assert.doesNotMatch(shell, /function\s+phasePolicy\s*\(|function\s+shelfDaysUntil\s*\(/);
  assert.equal(shell.split("+'T00:00:00'").length - 1, 0,
    'all shell date parsing continues through the injected helper');
});

test('the old renderHome phase chip is retired, and Today uses the Front Door countdown', () => {
  assert.doesNotMatch(shell, /window\.renderHome|\/\* ---- phase chip ---- \*\/|class="hm-phase"/);
  assert.match(today, /var countdown=fdExamCountdown\(st\.week,idx\.weeks,nowMs,st\.rotationStart\)/);
  assert.match(today, /if\(countdown\) sub\+=' '\+countdown/);
});

test('Progress retains a device-local exam-date writer through stable delegation', () => {
  assert.match(shell, /id="fdExamDate" type="date"/);
  assert.match(shell, /data-progress-action="save-exam"/);
  assert.match(shell, /localStorage\.setItem\('cw_shelf_date',value\)/);
  assert.match(shell, /localStorage\.removeItem\('cw_shelf_date'\)/);
});
