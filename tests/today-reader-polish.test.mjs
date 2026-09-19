// Four phone-width and reader polish pins from the 2026-09-18 critique.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const shell = read('spa_index.html');

test('a timed-block chip never wraps its label, and tightens by token on a phone', () => {
  const css = strip(read('frontdoor/frontdoor.css'));
  const base = css.match(/\n\.fd-block__chip\{([^}]*)\}/);
  assert.ok(base);
  assert.match(base[1], /white-space:nowrap/, '"10 min" broke into two lines inside its pill at 375px');
  // The phone rule is the one that also carries flex:1 (frontdoor.css's (max-width:640px) block).
  const phone = css.match(/\.fd-block__chip\{flex:1;([^}]*)\}/);
  assert.ok(phone, 'the phone chip rule exists');
  assert.match(phone[1], /padding:var\(--fd-space-\d+\) var\(--fd-space-\d+\)/, 'tokens, not raw px — the drift ratchet counts raw padding');
});

test("the practice panel's Can't-miss note stacks its label over its sentence on a phone", () => {
  assert.match(shell, /@media\(max-width:640px\)\{\.practice-mode-note\{flex-direction:column;gap:var\(--fd-space-\d+\)\}\}/);
});

test('the panel does not restate the page lead: "In 30 seconds" is the points list, or the muted fallback', () => {
  // The reader's lead IS topic_meta.tldr (fd_data.js maps item.summary from it); the panel used
  // to print it again one screen below, and on a phone the panel opens by default under the lead.
  const marker = "<div class=\"practice-section-title\">In 30 seconds</div>";
  const at = shell.indexOf(marker);
  assert.ok(at !== -1, 'the In 30 seconds section is built in buildTpl');
  const section = shell.slice(at, shell.indexOf("practice-section-title\">On the unit", at));
  assert.doesNotMatch(section, /class="one"|esc\(m\.tldr\)/, 'the one-liner is gone');
  assert.match(section, /m\.points&&m\.points\.length/, 'the points list decides the section');
  assert.match(section, /practice-muted/, 'no points -> the muted fallback, never an empty heading');
  assert.doesNotMatch(shell, /\.in30 \.one\{/, 'no orphan rule for a line that is never emitted');
});
