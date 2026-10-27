// L8 D3 (decided 2026-10-27): the learner-facing usage notice. It renders only where the usage
// emitter shipped, says something true about THIS device in each of three states, and offers the
// existing Settings action instead of a second opt-out writer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dir = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const shellJs = readFileSync(new URL('frontdoor/fd_shell.js', dir), 'utf8');
const shell = readFileSync(new URL('spa_index.html', dir), 'utf8');
const css = readFileSync(new URL('frontdoor/frontdoor.css', dir), 'utf8');

function fdEsc(s) { return String(s); }
// eslint-disable-next-line no-new-func
const { fdUsageNotice } = new Function('fdEsc', `${shellJs}\nreturn { fdUsageNotice };`)(fdEsc);

const LEAD = 'This site counts page and tool use in aggregate to improve the curriculum: '
  + 'no accounts, no cookies, no individual tracking.';

test('no emitter on this build: renders nothing at all', () => {
  assert.equal(fdUsageNotice(null), '');
  assert.equal(fdUsageNotice(undefined), '');
});

test('counted device: the disclosure plus an Opt out control that opens Settings', () => {
  const html = fdUsageNotice({ optedIn: true, privacySignal: false });
  assert.ok(html.includes(LEAD));
  assert.match(html, /<button type="button" class="fd-usage-notice__btn" data-fd-settings>Opt out<\/button>/);
  assert.doesNotMatch(html, /not counted/);
});

test('opted-out device says so and offers settings, not "Opt out"', () => {
  const html = fdUsageNotice({ optedIn: false, privacySignal: false });
  assert.ok(html.includes(LEAD));
  assert.match(html, /This device is not counted\./);
  assert.match(html, />Usage settings<\/button>/);
  assert.doesNotMatch(html, />Opt out</);
});

test('DNT/GPC device: attributes the exclusion to the browser, and optedIn is ignored', () => {
  const a = fdUsageNotice({ optedIn: true, privacySignal: true });
  const b = fdUsageNotice({ optedIn: false, privacySignal: true });
  assert.equal(a, b);
  assert.match(a, /Your browser asks sites not to measure usage/);
  assert.doesNotMatch(a, />Opt out</);
});

test('the notice never writes the opt-out key itself', () => {
  const body = shellJs.slice(shellJs.indexOf('function fdUsageNotice('), shellJs.indexOf('/* Header actions'));
  assert.doesNotMatch(body, /localStorage|optOut\(|optIn\(/);
});

test('shell wiring: one footer mount, rendered from the emitter, inerted by the safety pause', () => {
  assert.equal((shell.match(/id="fdUsageMount"/g) || []).length, 1);
  assert.match(shell, /<\/main>\s*<footer id="fdUsageMount" class="fd-usage-foot"><\/footer>/);
  assert.match(shell, /FD_SAFETY_INERT_IDS=\[[^\]]*'fdUsageMount'/);
  assert.match(shell, /function fdRenderUsageNotice\(\)\{[\s\S]*?window\.cwAnalytics[\s\S]*?fdUsageNotice\(an\)/);
  assert.equal((shell.match(/fdRenderOverlays\(state\);\n\s*fdRenderUsageNotice\(\);/g) || []).length, 2,
    'both render paths refresh the notice with the overlays');
  // The off build's own text gate: the shell must never name the emitter's file.
  assert.doesNotMatch(shell, /analytics\.js/);
  assert.match(css, /\.fd-usage-foot:empty\{display:none\}/);
});
