// WP-06R-a stage 1 regression guard — the C-SSRS reproduction is retired and must stay retired.
//
// Decision of record: Option A (2026-08-23) — the C-SSRS is copyrighted and licensed by the
// Columbia Lighthouse Project, and it retires from this library
// (docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md, decision table).
// Stage 1 replaces the functional branching screener with a rights stub on the bfcrs.html
// (#400) pattern: attribution + the official route, no item text, no scoring surface.
// Stage 2 (the separately-authored administration teaching, SPEC_CSSRS_Administration_Teaching)
// remains author-gated on faculty attestation and does not pass through this file's guards —
// it also reproduces no item text, so these assertions hold for it too.
//
// The stem list below is transcribed from the retirement record, independent of the page.
// If a future edit reintroduces one of these strings, that edit is the finding — do not
// "fix" it by removing the string from this list. A repo-wide instrument-rights gate
// (instrument_rights.json + check-static-site.mjs) is planned to supersede this file; until
// it lands, this is the executable form of the retirement.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(
  __dirname, '..',
  '04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html',
);
const html = readFileSync(FILE, 'utf8');

// Verbatim screener language that shipped until stage 1. Fragments, lowercase, so a
// re-worded-but-recognizable reintroduction still trips the guard.
const VERBATIM_STEMS = [
  'wished you were dead',
  'go to sleep and not wake up',
  'thoughts of killing yourself',
  'thinking about how you might do this',
  'intention of acting on them',
  'work out the details of how to kill yourself',
  'prepared to do anything to end your life',
];

test('no verbatim C-SSRS stem appears in the source', () => {
  const hay = html.toLowerCase();
  for (const stem of VERBATIM_STEMS) {
    assert.ok(!hay.includes(stem),
      `retired C-SSRS stem present: "${stem}" — the instrument is retired (WP-06R-a); ` +
      'see docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md');
  }
});

test('no functional screener remains — the page ships no script and no scoring engine', () => {
  // "Programming the form counts as reproduction even when no text is copied" (CLAUDE.md).
  // The stub is static by design; any script tag is a step back toward a functional form.
  assert.doesNotMatch(html, /<script\b/i, 'the rights stub must ship no script at all');
  for (const marker of ['React.createElement', 'useState', 'function band(', 'q6b']) {
    assert.ok(!html.includes(marker), `screener engine artifact survived: ${marker}`);
  }
});

test('the stub keeps the crisis-block marker', () => {
  // cssrs.html stays in _CRISIS_REQUIRED_TOOLS (build_deploy.py) and in
  // tests/crisis-block.test.mjs — the page sits in the suicide-risk section either way.
  assert.match(html, /<!-- crisis-block-html -->/);
});

test('the stub carries attribution and the official route', () => {
  assert.match(html, /22193671/, 'Posner 2011 PMID');
  assert.match(html, /cssrs\.columbia\.edu/, 'official Columbia Protocol site');
  assert.match(html, /no longer reproduces/i, 'the retirement must be stated on the page');
});

test('the route is a followable link to Columbia’s own forms, not just a citation', () => {
  // INV-IR2. A retirement that names the custodian but hands the learner no way to reach the
  // instrument is a dead end; instrument-rights-gate.mjs pins the same URL at build time from
  // instrument_rights.json (officialSource.formUrl), so the two must stay in step.
  const rights = JSON.parse(readFileSync(path.join(__dirname, '..', 'instrument_rights.json'), 'utf8'));
  const src = rights.instruments.find((i) => i.id === 'cssrs').officialSource;
  assert.ok(html.includes(`href="${src.formUrl}"`),
    `the stub must link the recorded official form: ${src.formUrl}`);
  assert.ok(html.includes(`href="${src.trainingUrl}"`),
    'Columbia’s free training is the half the withdrawn screener took with it — link it');
});
