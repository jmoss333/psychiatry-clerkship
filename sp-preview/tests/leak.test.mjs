// Hosted-room leak probe. No provider calls, no network — pure state-machine assertions
// against the same actor-context builders the hosted Function uses.
//
// WHY THIS EXISTS SEPARATELY FROM _prototypes/sp-interview/tests/leak.test.mjs: that suite
// checks the TYPED room's `_internals.actorSystem`. The HOSTED spoken room builds its actor
// prompt a different way — `createContext()` in dana-live-context.mjs, via the case
// definitions in sp-preview/lib/case.mjs (`CASES[id].caseDef`, which is what applies Dana's
// direct-suicide-question overlay: sp-interview.local-dana.js) — and family.mjs's
// `familyContext()` for the two-participant family case. Neither path is exercised by the
// typed-room suite, so a regression specific to the hosted prompt assembly (encounterProfiles
// portrayal instructions, delivery notes, the family public/private channel split) would ship
// unnoticed without this file.
//
// APPROACH, reused from _prototypes/sp-interview/tests/leak.test.mjs: for each case, build a
// transcript, derive state the same way the server does, and assert LOCKED gates never leak
// their reveal/repeatAsk text while EARNED gates always do. Never assert on `covered` for a
// gate — coverage is credited even when a gate never opens (see bin/redteam-offline.mjs's B8e
// comment; that is exactly how the 2026-09-06 defect hid).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../lib/case.mjs';
import { createContext } from '../../_prototypes/sp-interview/dana-live-context.mjs';
import { familyContext } from '../lib/family.mjs';
import { familyCase } from '../../_prototypes/sp-interview/family-visit-case.mjs';

const DANA = 'sp_depression_gated_si_001';
const MARCUS = 'sp_mania_redirect_001';
const RAY = 'sp_psychosis_paranoid_001';
const CASE_IDS = [DANA, MARCUS, RAY];

// One shared "direct suicide question" matrix run against all three cases, matching the
// style of the typed-room B1/B2/B4 probes: cold (first message), warm-plus-screen (rapport
// built first), flagged (a judgmental line immediately before the screen). The same wording
// works across all three casedefs' own `si_direct`/`reflection`/`judgmental` intent patterns.
const SI_Q = 'Have you had thoughts of killing yourself?';
const REFLECTIONS = ['That sounds really exhausting.', 'I can hear how hard this has been.'];
const JUDGMENTAL = 'You should really just snap out of this.';
const SCENARIOS = {
  cold: [SI_Q],
  'warm-plus-screen': [...REFLECTIONS, SI_Q],
  flagged: [JUDGMENTAL, SI_Q],
};

function buildContext(caseId, learnerTexts) {
  const { caseDef } = CASES[caseId];
  const transcript = learnerTexts.map((text) => ({ who: 'me', text }));
  const { system, messages, state } = createContext(caseDef, learnerTexts, transcript);
  return { system, messages, state, caseDef };
}

function blobOf(system, messages) {
  return system + '\n' + JSON.stringify(messages);
}

for (const caseId of CASE_IDS) {
  for (const [label, learnerTexts] of Object.entries(SCENARIOS)) {
    test(`${caseId} / ${label}: locked gates never leak; earned gates always disclose`, () => {
      const { system, messages, state, caseDef } = buildContext(caseId, learnerTexts);
      const blob = blobOf(system, messages);
      for (const gate of caseDef.gated) {
        const unlocked = !!state.unlocked[gate.id];
        if (unlocked) {
          if (gate.reveal) {
            assert.ok(blob.includes(gate.reveal),
              `${caseId} / ${label}: ${gate.id} is UNLOCKED but its reveal text is missing from the actor context`);
          }
        } else {
          if (gate.reveal) {
            assert.equal(blob.includes(gate.reveal), false,
              `${caseId} / ${label}: ${gate.id} is LOCKED but its reveal text leaked into the actor context`);
          }
          if (gate.repeatAsk) {
            assert.equal(blob.includes(gate.repeatAsk), false,
              `${caseId} / ${label}: ${gate.id} is LOCKED but its repeatAsk text leaked into the actor context`);
          }
        }
      }
    });
  }
}

// Positive control: prove the matrix above actually exercises a real earned disclosure
// somewhere, not only vacuous "nothing unlocked" runs.
test('positive control: the warm SI scenario actually earns a disclosure for Dana and Marcus', () => {
  const dana = buildContext(DANA, SCENARIOS['warm-plus-screen']);
  const marcus = buildContext(MARCUS, SCENARIOS['warm-plus-screen']);
  assert.ok(dana.state.unlocked.si_active, 'Dana: si_active did not unlock in the warm SI scenario');
  assert.ok(marcus.state.unlocked.g_si_mixed, 'Marcus: g_si_mixed did not unlock in the warm SI scenario');
  // FINDING: Ray's psychosis case has no gate keyed on `si_direct` — a direct suicide
  // question alone earns nothing for him anywhere in this matrix (confirmed by the loop
  // above passing with an empty `state.unlocked` in all three of his scenarios). His own
  // disclosure gates (g_command, g_not_eating, g_target) are keyed on different intents
  // entirely and are covered by bin/redteam-offline.mjs's B7/B9d/B9e instead.
});

// Dana's local draft overlay (sp-interview.local-dana.js, applied by sp-preview/lib/case.mjs)
// deliberately makes si_active fire on a correct direct question "regardless of rapport or
// earlier flags" — so her `flagged` row above unlocks same as `cold`/`warm`. Marcus carries no
// such overlay: g_si_mixed's own `blockedByRecentFlags` still applies. Pin the asymmetry so a
// future change to either case's flag-blocking is visible here, not just in the raw counts.
test('Marcus, unlike Dana, is still blocked by a judgmental turn immediately before the screen', () => {
  const marcusFlagged = buildContext(MARCUS, SCENARIOS.flagged);
  const danaFlagged = buildContext(DANA, SCENARIOS.flagged);
  assert.equal(!!marcusFlagged.state.unlocked.g_si_mixed, false,
    'g_si_mixed unlocked despite a judgmental turn immediately before the screen');
  assert.ok(danaFlagged.state.unlocked.si_active,
    "Dana's direct-question overlay regressed — si_active should still fire even after a flag");
});

// Family: the hosted public/shared-meeting projection must never carry the private
// inventory authored in _prototypes/sp-interview/family-visit-case.mjs, for either role.
test('family public context never carries the private inventory (either role)', () => {
  // `privateFacts` are the authored sentences that must never leave their private channel —
  // the actual inventory. `privateTopics` (a separate field on familyCase) is a documentation
  // label list, not verbatim content: e.g. its "prior change attempt" label is deliberately
  // echoed, in negated form, by Maya's own PUBLIC informationLimits ("...or prior change
  // attempts are not established") — a real disclaimer, not a leak. Checking labels here
  // would false-positive on exactly that sentence; see family-visit-state.test.mjs's own
  // narrower markers ("four to six", "withdrawal") for the same distinction.
  const privateInventory = [
    ...Object.values(familyCase.participants.morgan.privateFacts),
    ...Object.values(familyCase.participants.maya.privateFacts),
  ];
  const histories = {
    morgan: [
      { who: 'me', text: 'Morgan, what would be most useful to talk about?', targetRoleId: 'morgan' },
      { who: 'pt', text: 'I want a say in what happens next.', speakerId: 'morgan', playbackStatus: 'played' },
      { who: 'me', text: 'What has drinking been doing for you lately?', targetRoleId: 'morgan' },
    ],
    maya: [
      { who: 'me', text: 'Maya, what would you like us to understand?', targetRoleId: 'maya' },
      { who: 'pt', text: 'I can offer a weekly call.', speakerId: 'maya', playbackStatus: 'played' },
      { who: 'me', text: 'What worries you most about Morgan right now?', targetRoleId: 'maya' },
    ],
  };
  for (const [roleId, history] of Object.entries(histories)) {
    const context = familyContext(history, roleId);
    const blob = blobOf(context.system, context.messages);
    for (const fact of privateInventory) {
      assert.equal(blob.includes(fact), false,
        `role ${roleId}: a private-inventory phrase leaked into the public family context: "${fact}"`);
    }
  }
});
