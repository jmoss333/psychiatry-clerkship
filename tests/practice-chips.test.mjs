// The practice panel's chip row speaks the shell's chip language.
//
// Measured 2026-09-18 on a phone reader (?page=suicide.md): the shell's eyebrow row paints
// lowercase pills ("read", "tool", "✓ faculty-attested" — .fd-chip / .fd-attested) and, one
// screen below, the practice panel painted five UPPERCASE tracked chips ("5 MIN READ",
// "★ HIGH-YIELD", "HIGH-RISK WORKFLOW", "9 SOURCES", "REVIEWED · 2026-07-09") — two chip
// languages on one page. The fifth chip also restated a fact the page already carried twice:
// the head's ✓ faculty-attested pill and the governance receipt ("Reviewed by … · date"), which
// is the risk-aware publishing surface and the one that is pinned. So: the .tpl-chip rule mirrors
// .fd-chip (same size token, padding, pill, no uppercase, no wide tracking) and keeps its
// semantic colours; the review chip is not emitted at all.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const shell = read('spa_index.html');
const fdCss = read('frontdoor/frontdoor.css');

const rule = (css, selector) => {
  const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  assert.ok(m, `${selector} must exist`);
  return m[1];
};

test('.tpl-chip mirrors .fd-chip: same size token, padding and pill, no uppercase, no wide tracking', () => {
  const tpl = rule(shell, '.tpl-chip');
  const fd = rule(fdCss, '.fd-chip');
  assert.doesNotMatch(tpl, /text-transform:\s*uppercase/, 'the shell never shouts its chips');
  const tracking = tpl.match(/letter-spacing:\s*([\d.]+)em/);
  assert.ok(!tracking || Number(tracking[1]) <= 0.03, `tracking must not exceed .fd-chip's .03em: ${tpl}`);
  const squash = (css) => css.replace(/\s+/g, ' ').replace(/\s*([:;{}])\s*/g, '$1');
  for (const decl of ['font-size:var(--fd-font-2xs)', 'padding:2px 9px', 'font-weight:700']) {
    assert.ok(squash(fd).includes(decl), `fixture premise: .fd-chip carries ${decl}`);
    assert.ok(squash(tpl).includes(decl), `.tpl-chip must carry ${decl}`);
  }
  assert.match(tpl, /border-radius:(?:999px|var\(--fd-radius-pill\))/);
});

test('the panel emits read, high-yield, high-risk and sources chips in sentence case, and no review chip', () => {
  const at = shell.indexOf("h+='<div class=\"tpl-meta\">'");
  assert.ok(at !== -1, 'the chip row is built in buildTpl');
  const row = shell.slice(at, shell.indexOf("h+='</div>';", at));
  assert.match(row, /tpl-chip read">'\+m\.read\+' min read</);
  assert.match(row, /tpl-chip hy">★ High-yield</);
  assert.match(row, /tpl-chip safety">High-risk workflow</);
  assert.match(row, /tpl-chip evidence">/);
  assert.doesNotMatch(row, /tpl-chip review/, 'review status is the governance receipt\'s to state, once');
  assert.doesNotMatch(row, /facultyReview/, 'the panel does not read the review ledger for a chip');
  assert.doesNotMatch(shell, /\.tpl-chip\.review\{/, 'no orphan rule for a chip that is never emitted');
});
