// Regression guard for WP-B / D3: three faculty-approved suicide-screen phrasing
// families must be recognized as a safety intent by the offline sim engine, for
// EVERY case in sp-interview.pack.json — not just Dana. The engine compiles each
// intent's `patterns` with `new RegExp(p, 'i')` and tests them against the
// learner's typed text (see _prototypes/sp-interview/sp-interview.html, the
// MockProvider.start / _match logic); this test mirrors that compilation exactly
// so it fails the same way the real tool would.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_PATH = path.join(__dirname, '..', '..', '_prototypes', 'sp-interview', 'sp-interview.pack.json');
const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));

// Faculty-approved phrasings (docs/superpowers/plans/2026-08-24-faculty-decisions.md,
// WP-B brief D3). Every one of these must match at least one category:'safety' intent
// in every case's pack, so that a learner who screens correctly is credited.
const APPROVED = [
  "Have you had any thoughts that life isn't worth living?",
  "Do you ever feel like life isn't worth it anymore?",
  "Do you ever feel like you'd be better off not being here?",
  "Do you ever feel your family would be better off without you?",
  "Has it felt like there's no point in going on?",
  "Sometimes I feel like there's no point carrying on.",
];

// Existing safety phrasings that must STAY matched (regression guard against the
// new patterns accidentally displacing or narrowing coverage). Scoped per case to
// the pre-existing baseline: "hurting yourself" was never a si_direct/si_euphemism
// stem in sp_mania_redirect_001 (that case has no si_euphemism intent at all) —
// that is a pre-existing gap, out of scope for WP-B D3, and is flagged in the
// wpb-report rather than silently "fixed" here.
const REGRESSION_GUARD = [
  { phrasing: 'Are you having thoughts of suicide?', caseIds: 'all' },
  { phrasing: 'Have you thought about killing yourself?', caseIds: 'all' },
  {
    phrasing: 'Have you had any thoughts of hurting yourself?',
    caseIds: ['sp_depression_gated_si_001', 'sp_psychosis_paranoid_001'],
  },
];

function safetyIntentIds(caseDef) {
  return caseDef.intents.filter((it) => it.category === 'safety');
}

function matchingSafetyIntentIds(caseDef, text) {
  return safetyIntentIds(caseDef)
    .filter((it) => it.patterns.some((p) => new RegExp(p, 'i').test(text)))
    .map((it) => it.id);
}

test('every case recognizes all three approved suicide-screen phrasing families as a safety intent', () => {
  assert.ok(pack.cases.length > 0, 'pack has no cases');
  for (const caseDef of pack.cases) {
    for (const phrasing of APPROVED) {
      const hits = matchingSafetyIntentIds(caseDef, phrasing);
      assert.ok(
        hits.length > 0,
        `case "${caseDef.id}": no category:'safety' intent matched approved phrasing: ${JSON.stringify(phrasing)}`,
      );
    }
  }
});

test('every applicable case still recognizes the pre-existing safety phrasings (regression guard)', () => {
  for (const caseDef of pack.cases) {
    for (const { phrasing, caseIds } of REGRESSION_GUARD) {
      if (caseIds !== 'all' && !caseIds.includes(caseDef.id)) continue;
      const hits = matchingSafetyIntentIds(caseDef, phrasing);
      assert.ok(
        hits.length > 0,
        `case "${caseDef.id}": no category:'safety' intent matched regression-guard phrasing: ${JSON.stringify(phrasing)}`,
      );
    }
  }
});

test('the family-well-being SI phrasing is not credited as ONLY a social question', () => {
  const phrasing = 'Do you ever feel your family would be better off without you?';
  for (const caseDef of pack.cases) {
    const familySocial = caseDef.intents.find((it) => it.id === 'family_social');
    const familyMatches = familySocial
      ? familySocial.patterns.some((p) => new RegExp(p, 'i').test(phrasing))
      : false;
    if (!familyMatches) continue; // this case has no family_social intent, or it doesn't match — not the bug in question
    const safetyHits = matchingSafetyIntentIds(caseDef, phrasing);
    assert.ok(
      safetyHits.length > 0,
      `case "${caseDef.id}": "${phrasing}" matched family_social but no category:'safety' intent — passive-SI screen mis-classified as a social question`,
    );
  }
});
