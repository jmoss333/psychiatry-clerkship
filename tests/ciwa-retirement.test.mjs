// CIWA-Ar retirement guard — the reproduction is retired and must stay retired.
//
// Decision of record: 2026-08-28, author's call (Joshua Moss, MD). Every located
// "may be reproduced freely" notice for the CIWA-Ar is a reproducer's addition in differing
// wordings, and the 1989 article's own permission text is unverified behind a paywall
// (WP-02d). Rights that cannot be established are not rights, so the abbreviated in-house
// descriptors were withdrawn rather than left published on a second-hand notice.
//
// COWS is NOT affected. It shares this page under a separately recorded interim waiver
// ("flagged, not reverted, pending the author's call"), and this file asserts it still scores —
// a retirement that quietly took the other instrument with it would be its own defect.
//
// The descriptor list below is transcribed from the retirement record, independent of the page.
// If a future edit reintroduces one of these strings, THAT EDIT is the finding — do not "fix" it
// by deleting the string from this list or from instrument_rights.json's signatures.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, '03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html'), 'utf8');
const rights = JSON.parse(readFileSync(path.join(ROOT, 'instrument_rights.json'), 'utf8'));
const ciwa = rights.instruments.find((i) => i.id === 'ciwa-ar');

const RETIRED_DESCRIPTORS = [
  '0 none → 7 constant nausea, frequent vomiting',
  '0 none → 7 severe, even with arms not extended',
  '0 none → 7 drenching sweats',
  '0 at ease → 7 acute panic state',
  '0 normal → 7 paces or thrashes',
  'itching, pins & needles, formication',
  'harshness/ability to frighten',
  'light sensitivity → hallucinations',
  '0 none → 7 extremely severe',
  '0 oriented → 4 disoriented to place/person',
];

test('no retired CIWA-Ar descriptor ships on the page', () => {
  for (const d of RETIRED_DESCRIPTORS) {
    assert.ok(!html.includes(d), `retired CIWA-Ar descriptor returned: "${d}"`);
  }
});

test('the CIWA-Ar scoring surface is gone — no item array, no gauge', () => {
  assert.doesNotMatch(html, /var CIWA\s*=\s*\[/, 'the CIWA item array must not return');
  assert.doesNotMatch(html, /CIWA_GAUGE\s*=/, 'a score band with no score to band is dead weight');
  assert.doesNotMatch(html, /items:\s*CIWA\b/, 'nothing may render a CIWA scale');
});

test('the page says on its face that the CIWA-Ar is not reproduced', () => {
  // instrument-rights-gate.mjs enforces this too (requireNotReproducedStatement); pinned here
  // so the sentence is a page contract, not only a build-time one.
  assert.match(html, /no longer reproduces the CIWA-Ar/);
});

test('the retirement is recorded, not merely applied', () => {
  assert.equal(ciwa.status, 'retired');
  assert.match(ciwa.decisionRef, /2026-08-28/);
  assert.ok(ciwa.signatures.length > 0, 'a retirement with no signatures guards nothing');
  const page = ciwa.pages.find((p) => p.file === 'withdrawal.html');
  assert.ok(page, 'the disposition must name the page it governs');
  assert.equal(page.requireNotReproducedStatement, true);
});

test('every recorded signature is genuinely absent from the page', () => {
  for (const sig of ciwa.signatures) {
    assert.ok(!html.includes(sig), `signature still ships: "${sig}"`);
  }
});

// ---- COWS is untouched -----------------------------------------------------------------------

test('COWS still scores — the retirement did not take the other instrument with it', () => {
  assert.match(html, /var COWS\s*=\s*\[/, 'the COWS item array must survive');
  assert.match(html, /COWS_GAUGE/);
  assert.match(html, /items:\s*COWS\b/, 'the COWS scale must still render');
});

test('the COWS interim waiver is still recorded and still scoped to this page', () => {
  const cows = rights.instruments.find((i) => i.id === 'cows');
  assert.equal(cows.status, 'flagged-interim');
  assert.ok(cows.interimWaiver, 'the waiver must not be collateral damage of the CIWA retirement');
  assert.ok(cows.interimWaiver.files.includes('withdrawal.html'));
});

test('the page is still a tool, not a rights reference — it reproduces COWS', () => {
  const cur = JSON.parse(readFileSync(path.join(ROOT, 'curriculum.json'), 'utf8'));
  assert.equal((cur.rightsReferences || []).includes('withdrawal.html'), false,
    'rightsReferences means the page reproduces NOTHING; withdrawal.html still ships COWS');
});

test('attribution for both instruments survives', () => {
  assert.match(html, /2597811/, 'Sullivan 1989 (CIWA-Ar) PMID must remain');
  assert.match(html, /12924748/, 'Wesson & Ling 2003 (COWS) PMID must remain');
});

test('both tabs route the learner to a real form (INV-IR2)', () => {
  // The retired tab needs a route because the descriptors are gone; the COWS tab needs one
  // because "score at the bedside from the real form, not from this page" is otherwise an
  // instruction with nowhere to go. instrument-rights-gate.mjs pins both URLs at build time.
  // The build-time gate can only check the URL is present (this page builds its anchors in
  // React, so the URL ships inside a script string). Assert the anchor form here, where the
  // page's own markup is in view: a URL the learner cannot click is not a route.
  for (const id of ['ciwa-ar', 'cows']) {
    const src = rights.instruments.find((i) => i.id === id).officialSource;
    assert.ok(html.includes(`href:'${src.formUrl}'`),
      `${id}: the page must pass ${src.formUrl} to a Route as an anchor href, not merely mention it`);
  }
  assert.match(html, /function Route\(props\)[\s\S]*?e\('a',\{className:'go',href:props\.href/,
    'Route must render its href as a real anchor');
});

test('the CIWA-Ar route does not quietly become a rights finding', () => {
  // A link to someone else's posting is not reproduction by this library — and it is not
  // permission either. The page must keep saying the rights could not be established.
  assert.match(html, /not the rights-holder|professional society posting a copy/i,
    'the CIWA-Ar route must say whose copy it is');
  assert.equal(rights.instruments.find((i) => i.id === 'ciwa-ar').status, 'retired');
});

test('the page opens on the COWS scorer, not on the retired-instrument notice', () => {
  // The page is reached from Quick Tools and search AS A TOOL. Landing a learner who tapped a
  // scorer on a "not reproduced here" notice is the failure the retired-instrument presentation
  // work exists to prevent. tests/smoke/tool-expand.spec.js asserts live controls on load and
  // went red when this defaulted to the CIWA tab — pinned here so the cause is legible.
  assert.match(html, /var tab\s*=\s*useState\('cows'\)/,
    'default tab must be the scorer that still exists');
});
