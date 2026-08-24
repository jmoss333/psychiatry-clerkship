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

// WP-B3 finding 8: assert the exact case count. `> 0` would pass silently if a
// case were dropped from the pack, which would also silently drop every
// per-case safety assertion below (the loops would simply iterate less).
const EXPECTED_CASE_COUNT = 3;

test('every case recognizes all three approved suicide-screen phrasing families as a safety intent', () => {
  assert.equal(pack.cases.length, EXPECTED_CASE_COUNT, 'pack case count changed');
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

// WP-B follow-up (wpb2-brief + wpb2-brief correction): "hurting yourself" /
// "harming yourself" / "doing something to yourself" are among the most common
// suicide-screen phrasings in practice. Before this follow-up: Marcus
// (sp_mania_redirect_001) had no si_euphemism intent AND no hurt/harm/do-something
// stem in si_direct, so these phrasings matched nothing at all. Ray
// (sp_psychosis_paranoid_001) had "hurt(ing)? yourself" in si_direct but not
// "harm(ing)? yourself" (so "harming yourself" fell through to violence_screen
// ONLY — self-harm credited as violence toward others) and had no
// "do(ing)? something to yourself" stem anywhere (Edit 3, correction commit,
// closed this: no existing safety intent covered it, and it was out of scope
// until the coordinator authorized the pattern explicitly).
const EUPHEMISTIC_SI = [
  'Have you had any thoughts of hurting yourself?',
  'Have you thought about harming yourself?',
  'Have you had thoughts of doing something to yourself?',
];

test('every case recognizes the common hurting/harming/doing-something-to-yourself phrasings as a safety intent', () => {
  for (const caseDef of pack.cases) {
    for (const phrasing of EUPHEMISTIC_SI) {
      const hits = matchingSafetyIntentIds(caseDef, phrasing);
      assert.ok(
        hits.length > 0,
        `case "${caseDef.id}": no category:'safety' intent matched: ${JSON.stringify(phrasing)}`,
      );
    }
  }
});

// Every case's checklist scores "Suicide screened plainly" against si_direct ONLY
// (si_euphemism appears in no checklist row, in any case). For Marcus and Ray —
// the two cases with no deliberate-euphemism teaching mechanic — all three
// phrasings must specifically hit si_direct, or a learner who screens correctly
// gets no checklist credit. Dana (sp_depression_gated_si_001) is deliberately
// excluded from THIS assertion: her euphemism handling routes to si_euphemism to
// teach re-asking in plain language, and that must stay untouched — she is
// covered instead by the "some safety intent" check above and by the dedicated
// pedagogy guard below.
test('Marcus and Ray specifically credit all three euphemistic SI phrasings to si_direct (checklist-scored intent)', () => {
  const targetCaseIds = ['sp_mania_redirect_001', 'sp_psychosis_paranoid_001'];
  const phrasings = ['hurting yourself', 'harming yourself', 'doing something to yourself'];
  for (const caseDef of pack.cases) {
    if (!targetCaseIds.includes(caseDef.id)) continue;
    const siDirect = caseDef.intents.find((it) => it.id === 'si_direct');
    assert.ok(siDirect, `case "${caseDef.id}": no si_direct intent found`);
    for (const phrasing of phrasings) {
      const matched = siDirect.patterns.some((p) => new RegExp(p, 'i').test(phrasing));
      assert.ok(
        matched,
        `case "${caseDef.id}": si_direct did not match "${phrasing}" — checklist row "Suicide screened plainly" would not be credited`,
      );
    }
  }
});

// For Dana specifically: the three phrasings must match SOME safety intent (they
// will — via si_euphemism, checked in the pedagogy-guard test below) but this
// test intentionally does NOT require si_direct, so it never locks in a change to
// her deliberate euphemism pedagogy.
test('Dana (euphemism case) matches all three phrasings via some safety intent, not necessarily si_direct', () => {
  const caseDef = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
  assert.ok(caseDef, 'sp_depression_gated_si_001 not found in pack');
  for (const phrasing of ['hurting yourself', 'harming yourself', 'doing something to yourself']) {
    const hits = matchingSafetyIntentIds(caseDef, phrasing);
    assert.ok(
      hits.length > 0,
      `Dana: no category:'safety' intent matched "${phrasing}"`,
    );
  }
});

test('Dana keeps her deliberate euphemism pedagogy untouched (si_euphemism, not si_direct)', () => {
  const caseDef = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
  assert.ok(caseDef, 'sp_depression_gated_si_001 not found in pack');
  const siDirect = caseDef.intents.find((it) => it.id === 'si_direct');
  const siEuphemism = caseDef.intents.find((it) => it.id === 'si_euphemism');
  assert.ok(siEuphemism, 'Dana must still have an si_euphemism intent');
  for (const phrasing of ['hurting yourself', 'harming yourself', 'doing something to yourself']) {
    const hitsDirect = siDirect.patterns.some((p) => new RegExp(p, 'i').test(phrasing));
    const hitsEuphemism = siEuphemism.patterns.some((p) => new RegExp(p, 'i').test(phrasing));
    assert.ok(hitsEuphemism, `Dana: si_euphemism should still match "${phrasing}"`);
    assert.ok(!hitsDirect, `Dana: si_direct should NOT match "${phrasing}" — that would break the euphemism-deflection teaching mechanic`);
  }
});

// ---------------------------------------------------------------------------
// WP-B3 finding 5: negative assertions.
//
// Coverage is scored by matched intent IDs, and every case's checklist scores
// "Suicide screened plainly" against si_direct. An over-broad pattern therefore
// tells a learner they completed a suicide screen they never performed — the
// inverse of the bug the positive tests above guard, and strictly worse: a miss
// under-credits a careful student, a false positive certifies a risk assessment
// that did not happen.
//
// Findings 1/2/3 shipped precisely because nothing here tested for over-breadth:
//   1. `without (me|you)` had no word boundary -> matched "without me·dication",
//      "without me·ds", "without you·r father".
//   2. bare `worth living` -> matched protective-factor questions ("What has
//      felt worth living for lately?"), a different clinical move that Dana
//      routes to si_intent_protective.
//   3. `|living` in the no-point alternation was never faculty-authorized ->
//      matched "no point in living in that apartment".
const NON_SAFETY_PHRASINGS = [
  // finding 1 — medication-adherence and collateral probes
  "Do you think you'd be better off without medication?",
  'Would you be better off without meds?',
  'Is your family better off without your father in the house?',
  // finding 2 — protective-factor / reasons-for-living questions
  'What has felt worth living for lately?',
  'Do you have things in your life worth living for?',
  // finding 3 — literal use of "living"
  "There's no point in living in that apartment.",
  // ordinary review-of-systems and social-history questions
  'How has your appetite been?',
  'Are you sleeping alright?',
  'Tell me about your job.',
  'Do you have any family nearby?',
];

test('no ordinary question is miscredited as a safety intent in any case (over-breadth guard)', () => {
  assert.equal(pack.cases.length, EXPECTED_CASE_COUNT, 'pack case count changed');
  const falsePositives = [];
  for (const caseDef of pack.cases) {
    for (const phrasing of NON_SAFETY_PHRASINGS) {
      for (const intent of safetyIntentIds(caseDef)) {
        const culprits = intent.patterns.filter((p) => new RegExp(p, 'i').test(phrasing));
        if (culprits.length) {
          falsePositives.push(
            `case "${caseDef.id}": ${JSON.stringify(phrasing)} -> ${intent.id} via ${JSON.stringify(culprits)}`,
          );
        }
      }
    }
  }
  assert.deepEqual(
    falsePositives,
    [],
    `ordinary questions credited as a safety screen:\n  ${falsePositives.join('\n  ')}`,
  );
});

// PRE-EXISTING over-breadth, deliberately NOT fixed in this wave (WP-B3 finding 10
// is out of scope; the `what'?s the point` stem in sp_mania_redirect_001's
// si_direct is faculty-authorized vocabulary and removing/narrowing it is a
// content decision, not an agent decision). Marcus is on lithium, so
// "What's the point of the lithium?" is a plausible learner question and it is
// credited today as a plain suicide screen. Recorded here as a skipped test so it
// is not silently forgotten. Un-skip when faculty rules on finding 10.
test("PRE-EXISTING (finding 10, out of scope): Marcus's `what'?s the point` credits \"What's the point of the lithium?\" as a suicide screen", { skip: 'pre-existing over-breadth; awaiting faculty decision on WP-B3 finding 10' }, () => {
  const caseDef = pack.cases.find((c) => c.id === 'sp_mania_redirect_001');
  const hits = matchingSafetyIntentIds(caseDef, "What's the point of the lithium?");
  assert.deepEqual(hits, [], 'medication-rationale question credited as a safety screen');
});

// The must-match contract from the WP-B3 brief, asserted per case at the intent
// the checklist actually scores. Marcus and Ray score "Suicide screened plainly"
// off si_direct, so "some safety intent" is not a strong enough assertion for
// them. Dana is checked at category:'safety' because her euphemisms route to
// si_euphemism by design (see the pedagogy guard above).
const MUST_MATCH = [
  'Are you having thoughts of suicide?',
  'Have you thought about killing yourself?',
  "Have you had any thoughts that life isn't worth living?",
  "Do you ever feel like life isn't worth it anymore?",
  "Do you ever feel like you'd be better off not being here?",
  // The boundary probe: with the finding-1 `\b` added to `without (me|you)`, this
  // must STILL match — "you" ends the phrase, so the boundary is satisfied.
  'Do you ever feel your family would be better off without you?',
  "Has it felt like there's no point in going on?",
  "Sometimes I feel like there's no point carrying on.",
  'Have you had any thoughts of hurting yourself?',
  'Have you thought about harming yourself?',
  'Have you had thoughts of doing something to yourself?',
];

test('Marcus and Ray credit every must-match screening phrasing to si_direct', () => {
  for (const caseId of ['sp_mania_redirect_001', 'sp_psychosis_paranoid_001']) {
    const caseDef = pack.cases.find((c) => c.id === caseId);
    assert.ok(caseDef, `${caseId} not found in pack`);
    const siDirect = caseDef.intents.find((it) => it.id === 'si_direct');
    assert.ok(siDirect, `case "${caseId}": no si_direct intent found`);
    for (const phrasing of MUST_MATCH) {
      assert.ok(
        siDirect.patterns.some((p) => new RegExp(p, 'i').test(phrasing)),
        `case "${caseId}": si_direct did not match ${JSON.stringify(phrasing)} — checklist row "Suicide screened plainly" would not be credited`,
      );
    }
  }
});

test('Dana credits every must-match screening phrasing to some safety intent', () => {
  const caseDef = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
  assert.ok(caseDef, 'sp_depression_gated_si_001 not found in pack');
  for (const phrasing of MUST_MATCH) {
    const hits = matchingSafetyIntentIds(caseDef, phrasing);
    assert.ok(
      hits.length > 0,
      `Dana: no category:'safety' intent matched ${JSON.stringify(phrasing)}`,
    );
  }
});
