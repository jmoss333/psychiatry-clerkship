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
// new patterns accidentally displacing or narrowing coverage). Historical note:
// at D3 time "hurting yourself" was not a Marcus stem; D5 (2026-08-24) then added
// hurt/harm/do-something-to-yourself to Marcus's and Ray's si_direct, so the
// phrasing now matches in every case. The per-case scoping below predates D5 and
// remains valid as a floor.
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
  // Final review of #406, finding F5: the `continue` below skips cases whose
  // family_social pattern does not match, so a future family_social narrowing
  // could empty the loop body and leave this test vacuously green. Count the
  // cases that actually reach the assertion and require at least one.
  let casesExercised = 0;
  for (const caseDef of pack.cases) {
    const familySocial = caseDef.intents.find((it) => it.id === 'family_social');
    const familyMatches = familySocial
      ? familySocial.patterns.some((p) => new RegExp(p, 'i').test(phrasing))
      : false;
    if (!familyMatches) continue; // this case has no family_social intent, or it doesn't match — not the bug in question
    casesExercised += 1;
    const safetyHits = matchingSafetyIntentIds(caseDef, phrasing);
    assert.ok(
      safetyHits.length > 0,
      `case "${caseDef.id}": "${phrasing}" matched family_social but no category:'safety' intent — passive-SI screen mis-classified as a social question`,
    );
  }
  assert.ok(
    casesExercised > 0,
    `no case's family_social intent matched ${JSON.stringify(phrasing)} — this test asserted nothing. Either the phrasing or family_social changed; re-derive the probe rather than deleting the guard.`,
  );
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

// WP-B3 finding 10, now faculty-authorized (docs/superpowers/plans/
// 2026-08-24-faculty-decisions.md): Marcus's `what'?s the point` stem was a bare
// substring, so it fired on any "What's the point of X?" question. Marcus is a
// mania case on lithium, so "What's the point of the lithium?" is a question a
// learner is very likely to ask — and the checklist scores "Suicide screened
// plainly" (quality: "best") off si_direct, so the debrief would certify a
// suicide screen that never happened.
//
// The distinction being encoded: "what's the point" is a hopelessness/SI
// utterance when it stands alone or is about EXISTENCE or CONTINUING; it is an
// ordinary clinical question when it is about an object, a treatment, or an
// activity. The narrowed pattern therefore matches the bare form (nothing, or
// anything other than of/in/to, follows) plus an explicit existential-object
// alternation, and declines every other "point of <thing>".
//
// D8 (2026-08-27) widened the stem's contraction from `what'?s` to
// `what(?:'?s| is)`. Both branches carry it, so the object/treatment guard applies
// to "What is the point of X?" exactly as it does to "What's the point of X?".
// Scope note: this stem exists ONLY in Marcus. Dana and Ray have no
// "what's the point" pattern at all, which is issue #410 item D, not this.
const MARCUS_POINT_MUST_NOT_MATCH = [
  "What's the point of the lithium?",
  "What's the point of the medication?",
  'Whats the point of taking it every day?',
  "What's the point of the mood chart?",
  "What's the point of staying on the unit?",
  // Unabbreviated forms must be declined for the same reasons — the D8 contraction
  // widening must not have reopened the object/treatment branch.
  'What is the point of the lithium?',
  'What is the point of the medication?',
  'What is the point in taking it daily?',
  'What is the point of staying on the unit?',
];

const MARCUS_POINT_MUST_MATCH = [
  "What's the point?",
  'Whats the point anymore?',
  "What's the point of going on?",
  "What's the point of living?",
  "What's the point of any of this?",
  "You said what's the point — can you tell me more about that?",
  // D8: the stem was `what'?s`, so the unabbreviated form — an ordinary way to ask
  // this, and no less a screen — matched nothing at all and scored as a critical miss.
  'What is the point?',
  'What is the point of going on?',
  'What is the point of living?',
  'What is the point of any of this?',
];

test("Marcus: an ordinary \"what's the point of <thing>\" question is NOT credited as a suicide screen", () => {
  const caseDef = pack.cases.find((c) => c.id === 'sp_mania_redirect_001');
  assert.ok(caseDef, 'sp_mania_redirect_001 not found in pack');
  const falsePositives = [];
  for (const phrasing of MARCUS_POINT_MUST_NOT_MATCH) {
    for (const intent of safetyIntentIds(caseDef)) {
      const culprits = intent.patterns.filter((p) => new RegExp(p, 'i').test(phrasing));
      if (culprits.length) {
        falsePositives.push(
          `${JSON.stringify(phrasing)} -> ${intent.id} via ${JSON.stringify(culprits)}`,
        );
      }
    }
  }
  assert.deepEqual(
    falsePositives,
    [],
    `ordinary clinical questions credited as a plain suicide screen:\n  ${falsePositives.join('\n  ')}`,
  );
});

test("Marcus: hopelessness \"what's the point\" phrasings still credit si_direct", () => {
  const caseDef = pack.cases.find((c) => c.id === 'sp_mania_redirect_001');
  assert.ok(caseDef, 'sp_mania_redirect_001 not found in pack');
  const siDirect = caseDef.intents.find((it) => it.id === 'si_direct');
  assert.ok(siDirect, 'Marcus: no si_direct intent found');
  for (const phrasing of MARCUS_POINT_MUST_MATCH) {
    assert.ok(
      siDirect.patterns.some((p) => new RegExp(p, 'i').test(phrasing)),
      `Marcus: si_direct did not match ${JSON.stringify(phrasing)} — checklist row "Suicide screened plainly" would not be credited`,
    );
  }
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
  // D9 amendment (final review of #406, finding F1): the habitability lookahead's
  // `at` branch swallowed the intensifier, so these — unambiguous screens, and the
  // commonest way a learner adds emphasis — declined in every case, scoring a
  // critical miss on Dana and Marcus.
  "Do you ever feel like life isn't worth living at all?",
  "Do you ever feel like life just isn't worth living at all?",
  // The golden transcript's screening line, pinned so a stem narrowing can never
  // take out the plainest phrasing the tool ships as its own worked example.
  'When you say burden — have you had thoughts of killing yourself?',
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

// ---- Codex review of PR #406 (2026-08-27), inline comments 2 & 3 ----
// Consequence/insight questions ("are you hurting yourself BY <behavior>?") and
// habitability questions ("is that apartment not worth living IN?") are not
// suicide screens, but the widened WP-B stems matched them — which scored c_si
// (critical on Dana and Marcus) and unlocked g_si_mixed at rapport 0 on Marcus.
// Decision provenance: D9 + D10 in docs/superpowers/plans/2026-08-24-faculty-decisions.md.
// Only si_direct / si_euphemism can credit c_si or unlock the si gates, so these
// assertions filter to those two ids: Dana's si_plan ("how (you )?(would|might)")
// legitimately brushes one probe, is gated behind si_active, and is tracked as
// issue #410 item E — not re-litigated here.
const C_SI_CREDITING = new Set(['si_direct', 'si_euphemism']);

const NON_SCREEN_PROBES = [
  'Is that apartment not worth living in?',
  "Do you think you're hurting yourself by sleeping only two hours?",
  'Do you see how you might be hurting yourself by not sleeping?',
  "Aren't you harming yourself by skipping the lithium?",
  // D10 amendment (final review of #406, finding F3): `(?!\s+by\b)` closed exactly
  // one surface form of the consequence question. The same clinical move phrased
  // with `with`, with `when`, or with a comma before `by` still credited c_si.
  "Do you think you're hurting yourself with all this spending?",
  'Are you harming yourself when you skip the lithium?',
  "Do you think you're hurting yourself, by sleeping so little?",
  // D9 amendment (finding F1): recovering "worth living at all" must not reopen
  // habitability when the intensifier trails the preposition's own object.
  'Is the place not worth living in at all?',
  'Is it not worth living at home anymore?',
];

const METHOD_CLAUSE_SCREENS = [
  'Have you thought about hurting yourself by taking pills?',
  'Have you had thoughts of harming yourself by overdosing?',
];

test('consequence and habitability questions never credit a suicide screen (D9/D10)', () => {
  for (const caseDef of pack.cases) {
    for (const phrasing of NON_SCREEN_PROBES) {
      const credited = matchingSafetyIntentIds(caseDef, phrasing)
        .filter((id) => C_SI_CREDITING.has(id));
      assert.deepEqual(
        credited,
        [],
        `${caseDef.id} credited ${JSON.stringify(credited)} for non-screen: "${phrasing}"`,
      );
    }
  }
});

test('thought-framed screens with a method clause still credit a safety intent (D10)', () => {
  for (const caseDef of pack.cases) {
    for (const phrasing of METHOD_CLAUSE_SCREENS) {
      const credited = matchingSafetyIntentIds(caseDef, phrasing)
        .filter((id) => C_SI_CREDITING.has(id));
      assert.ok(
        credited.length > 0,
        `${caseDef.id} failed to credit a genuine screen: "${phrasing}"`,
      );
    }
  }
});

// ---- Final review of PR #406 (2026-08-29), finding F2 ----
// The existential vocabularies are alternations of VERB PHRASES, and a verb phrase
// takes an object. Every item was terminated by a bare `\b`, which a following
// object satisfies, so "What's the point of continuing THE LITHIUM?" and
// "no point in going on ABOUT THE NEIGHBORS" scored as plain suicide screens.
// Two families were affected: Marcus's `what(?:'?s| is) the point of <existential>`
// alternation, and `no point (in )?(going on|carrying on)`, which is in all three
// cases' si_direct. Both credit c_si — critical on Dana and Marcus — and the
// Marcus one also unlocks g_si_mixed at rapport 0, on the very move the case is
// built to teach (redirecting him off the irrigation project).
//
// Decision provenance: D11 in docs/superpowers/plans/2026-08-24-faculty-decisions.md.
// Fix: each verb-phrase item must be followed by a CLOSING CONTEXT — punctuation,
// end of text, or a closed list of existential continuations ("anymore", "at all",
// "like this", "lately", "to live", …). The nominal items (`life`, `anything`,
// `(it|this) all`, `any of this`) take no object in practice and are untouched,
// per D7's closed-vocabulary design. The closing list is a positive allowlist, not
// a denylist of objects: a denylist kept re-declining genuine screens — excluding
// `at` would re-break "going on at all" exactly as D9's first form broke "worth
// living at all", and excluding `to` would decline "continuing to live".
const OBJECT_FORM_NON_SCREENS = [
  // Marcus's alternation, one row per over-firing item
  "What's the point of continuing the lithium?",
  'What is the point of continuing to take the lithium?',
  "What's the point of waking up at the same time every day?",
  "What's the point of getting up early for the group?",
  "What's the point of being here on the unit another week?",
  "What's the point of going on about the irrigation project?",
  "What's the point of carrying on with the irrigation plan?",
  "What's the point of keeping going with the mood chart?",
  "What's the point of living in that apartment?",
  // the no-point family — present in all three cases
  "There's no point in going on about the neighbors right now",
  'no point in going on the lithium?',
  "There's no point in carrying on about the irrigation project.",
];

// The other half of the contract: narrowing a safety stem is only acceptable if
// the genuine forms survive. Rows scoped to Marcus use the `what's the point`
// stem, which exists in no other case (D8 scope note).
const EXISTENTIAL_CLOSURE_MUST_MATCH = [
  { phrasing: "What's the point of going on at all?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: 'What is the point of going on at all?', caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of going on anymore?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of carrying on anymore?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of keeping going?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of continuing?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of continuing to live?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of living anymore?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of being here?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of waking up?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of waking up in the morning?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of getting up?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of going on much longer?", caseIds: ['sp_mania_redirect_001'] },
  { phrasing: "What's the point of carrying on anyway?", caseIds: ['sp_mania_redirect_001'] },
  // the no-point family, in every case
  { phrasing: 'no point going on anymore', caseIds: 'all' },
  { phrasing: "There's no point in carrying on anymore.", caseIds: 'all' },
  { phrasing: "I feel like there's no point going on, doctor.", caseIds: 'all' },
  { phrasing: "Do you ever feel like there's no point in going on at all?", caseIds: 'all' },
  { phrasing: "Does it feel like there's no point going on like this?", caseIds: 'all' },
  // Time adverbials belong in the closing vocabulary for the same reason they are
  // safe there: an adverbial cannot introduce an object, so admitting it cannot
  // revive any row in OBJECT_FORM_NON_SCREENS above.
  { phrasing: "Do you ever feel like there's no point going on lately?", caseIds: 'all' },
  { phrasing: "Has it felt like there's no point in carrying on these days?", caseIds: 'all' },
  { phrasing: "Do you feel like there's no point in going on right now?", caseIds: 'all' },
];

test('an existential stem followed by its own object is not a suicide screen (D11)', () => {
  assert.equal(pack.cases.length, EXPECTED_CASE_COUNT, 'pack case count changed');
  const falsePositives = [];
  for (const caseDef of pack.cases) {
    for (const phrasing of OBJECT_FORM_NON_SCREENS) {
      for (const intent of safetyIntentIds(caseDef)) {
        if (!C_SI_CREDITING.has(intent.id)) continue;
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
    `object-form questions credited as a plain suicide screen:\n  ${falsePositives.join('\n  ')}`,
  );
});

test('genuine existential forms still credit si_direct after the D11 object closure', () => {
  for (const { phrasing, caseIds } of EXISTENTIAL_CLOSURE_MUST_MATCH) {
    for (const caseDef of pack.cases) {
      if (caseIds !== 'all' && !caseIds.includes(caseDef.id)) continue;
      const siDirect = caseDef.intents.find((it) => it.id === 'si_direct');
      assert.ok(siDirect, `case "${caseDef.id}": no si_direct intent found`);
      assert.ok(
        siDirect.patterns.some((p) => new RegExp(p, 'i').test(phrasing)),
        `case "${caseDef.id}": si_direct did not match ${JSON.stringify(phrasing)} — the D11 closing context is too tight; widen the closing vocabulary rather than reopening the object branch`,
      );
    }
  }
});
