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

// The device-local exam-date WRITER left Progress for the settings panel (fd_sheet.js's Pacing
// section, committed through fd_wire.js's changeHandler). Progress keeps a read-only signpost, so
// this pins the move rather than the old control: the shell reads the key for the panel and for
// that signpost, and writes it nowhere. Two writable homes for one key silently desync --
// fd_state.js:17 records the same rule for progress, and tests/fd-settings.test.mjs is where the
// panel's half is pinned.
test('the exam-date writer left Progress; the shell only reads the key now', () => {
  assert.doesNotMatch(shell, /fdExamDate/, 'the Progress input and every reference to it are gone');
  assert.doesNotMatch(shell, /save-exam/, 'and its delegated handler with it');
  assert.equal(shell.split("localStorage.setItem('cw_shelf_date'").length - 1, 0,
    'the shell must not write the key at all');
  assert.equal(shell.split("localStorage.removeItem('cw_shelf_date'").length - 1, 0);
  assert.match(shell, /out\.examDate=LS\('cw_shelf_date'\)/,
    'it reads the key into the state the settings panel renders');
});
