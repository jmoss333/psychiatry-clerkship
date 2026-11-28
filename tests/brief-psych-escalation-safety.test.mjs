// Simulator red-team BP-2 (2026-11-25, High): "Flooded, escalating, about to act" went straight
// to TIPP with no risk or staff-safety routing. It now opens a safety-first gate, like BP-1's
// self-harm gate: keep everyone safe and call for help, ask directly about intent to harm self or
// others, tell the team, with links to the suicide-risk and agitation pages; TIPP comes after.
// BP-3 (Medium): the acute-risk route no longer offers "the Columbia C-SSRS screener" (that page is
// retired to the official form and training) and puts the suicide-risk pocket guide first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pack = JSON.parse(read('_prototypes/brief-psych/rp-brief-psych.pack.json'));
const HTML = read('_prototypes/brief-psych/rp-brief-psych.html');
const shipped = JSON.parse(read('13_Faculty_Resources/_automation/site_build/shipped_pages.json')).pages;
const slugs = new Set(shipped.map((p) => p.slug));

test('the "about to act" cue goes through a risk and staff-safety gate before TIPP', () => {
  const cue = pack.content.cues.find((c) => c.id === 'cue-flooded');
  assert.ok(cue, 'cue-flooded present');
  assert.equal(cue.techId, 'tipp', 'TIPP is still offered once safe');
  assert.equal(cue.safetyFirst, true);
  const gate = pack.escalationSafety;
  assert.equal(gate.cueId, 'cue-flooded');
  const steps = gate.steps.join(' ');
  assert.match(steps, /exit/i, 'staff safety: a clear exit');
  assert.match(steps, /call for help|security/i, 'calls for help when anyone is in danger');
  assert.match(steps, /hurting themselves or someone else/i, 'asks about intent to harm self or others');
  assert.match(steps, /resident|attending/i, 'tells the team');
  assert.match(gate.continueLabel, /TIPP/);
  assert.ok(gate.cueTag, 'the cue grid can label it');
});

test('the gate links the suicide-risk and agitation pages, and they ship on the resident site', () => {
  const hrefs = pack.escalationSafety.routes.map((r) => r.href);
  for (const want of ['?page=pg_suicide.md', '?page=agitation.md']) assert.ok(hrefs.includes(want), want);
  for (const h of hrefs) {
    const slug = h.replace(/^\?(page|tool)=/, '');
    const row = shipped.find((p) => p.slug === slug);
    assert.ok(row && slugs.has(slug), `${slug} is a shipped page`);
    assert.ok(row.sites.includes('res'), `${slug} ships on the resident site, where this tool lives`);
  }
});

test('the tool reads both gates by cue, and only the gate itself clears it', () => {
  assert.match(HTML, /function gateFor\(cue\)\{return \[pack\.incidentSafety,pack\.escalationSafety\]/);
  assert.equal((HTML.match(/openCue\([^)]*true\)/g) || []).length, 1);
  assert.match(HTML, /gateFor\(c\)\|\|\{\}\)\.cueTag/, 'the cue grid labels each safety-first cue with its gate');
});

test('BP-3: the acute-risk route puts the pocket guide first and names the C-SSRS page for what it is', () => {
  const routes = pack.safety.routes;
  assert.equal(routes[0].href, '?page=pg_suicide.md');
  const cssrs = routes.find((r) => r.href === '?tool=cssrs.html');
  assert.ok(cssrs);
  assert.doesNotMatch(cssrs.label, /screener/i, 'the screener is retired');
  assert.match(cssrs.label, /official form and training/i);
  const row = shipped.find((p) => p.slug === 'cssrs.html');
  assert.match(row.title, /Official Form & Training/, 'the label matches the page it opens');
});
