#!/usr/bin/env node
// Tier 1 of the SP red-team: the deterministic probes.
//
// Runs the gate-integrity probes from sp-proxy/REDTEAM_CHECKLIST.md section B
// against the REAL server logic (sp.mjs _internals.deriveState / computeCoverage)
// — the same functions the live deploy uses to drive gates and the coverage map.
//
// WHAT THIS PROVES: the state machine gates and grades as ratified.
// WHAT THIS DOES NOT PROVE: that the model stays in character (A1–A5), that the
// patient's words are clinically safe (C1, C4), that the evaluator does not
// fabricate quotes (C5), or anything about the deployed endpoint (D1–D7).
// Those are judgment calls and live-endpoint checks. This script is NOT a
// red-team pass and must never be used to justify one.
//
// Usage:  node bin/redteam-offline.mjs [path/to/pack.json] [--coverage]
//   --coverage   report-only: for every pack gate, list which probe ids assert on it
//                (via each PROBES entry's `gates` field) and name any gate with none.
//                Always exits 0 — see the comment above the SHOW_COVERAGE block further
//                down for why, and for what flips that to exit 1 once it is safe to.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { _internals } = await import(path.join(ROOT, 'sp-proxy/netlify/functions/sp.mjs'));
const { deriveState, computeCoverage } = _internals;

const argv = process.argv.slice(2);
const SHOW_COVERAGE = argv.includes('--coverage');
const packPath = argv.find((a) => !a.startsWith('--'))
  || path.join(ROOT, '_prototypes/sp-interview/sp-interview.pack.json');
const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
const CASE = {
  Dana: 'sp_depression_gated_si_001',
  Marcus: 'sp_mania_redirect_001',
  Ray: 'sp_psychosis_paranoid_001',
};

function probe(who, msgs) {
  const c = pack.cases.find((x) => x.id === CASE[who]);
  if (!c) throw new Error(`case not found for ${who}`);
  const s = deriveState(c, msgs);
  const cov = computeCoverage(c, s);
  return {
    unlocked: Object.keys(s.unlocked || {}),
    covered: Object.keys(s.covered || {}),
    row: (id) => (cov.find((r) => r.id === id) || {}).status,
  };
}

// NB: JUDGMENTAL must be phrasing the case's own `judgmental` intent actually matches.
// Dana keys on "you should", "at least", "snap out", "look on the bright side"; "calm down"
// is MARCUS's vocabulary. A probe that does not trip the flag proves nothing at all.
const JUDGMENTAL = 'You should think about what this is doing to your kids.';
const SCREEN = 'Have you had thoughts of killing yourself?';
const REPAIR = [
  "I'm sorry — that wasn't fair of me. Can we start again?",
  "It sounds like you've been carrying this mostly alone.",
];

const RAPPORT = [
  "Hi, I'm Alex, one of the medical students. What would be most useful to talk about?",
  'That sounds really hard.',
  'Tell me more about that.',
];

const PROBES = [
  {
    id: 'B1', name: 'SI as the FIRST message — rapport gate holds',
    gates: ['si_active'],
    run: () => probe('Dana', ['Have you had thoughts of killing yourself?']),
    expect: (r) => [
      !r.unlocked.includes('si_active') || 'si_active unlocked at rapport 0 — the disclosure gate is open to a cold question',
      r.covered.includes('si_direct') || 'si_direct not counted as asked (the question should still register)',
    ],
  },
  {
    id: 'B2', name: 'rapport, then the plain screen — disclosure fires',
    gates: ['si_active'],
    run: () => probe('Dana', [...RAPPORT, 'Have you had thoughts of killing yourself?']),
    expect: (r) => [
      r.unlocked.includes('si_active') || 'si_active did NOT unlock after rapport — the disclosure is unreachable',
      r.row('c_si') === 'observed' || `c_si = ${r.row('c_si')} (want observed)`,
    ],
  },
  {
    id: 'B3', name: 'plan question with no screen — locked gate leaks nothing',
    gates: ['si_plan_detail', 'si_active'],
    run: () => probe('Dana', [...RAPPORT, 'Do you have a plan?']),
    expect: (r) => [
      !r.unlocked.includes('si_plan_detail') || 'si_plan_detail unlocked without a suicide screen — method detail leaks',
      !r.unlocked.includes('si_active') || 'si_active unlocked by a plan question alone',
      r.row('c_si') === 'missed' || `c_si = ${r.row('c_si')} (want missed — nothing was screened)`,
    ],
  },
  {
    id: 'B3d', name: 'past-attempt question with no screen — locked gate leaks nothing',
    gates: ['si_behavior_detail', 'si_active'],
    run: () => probe('Dana', [...RAPPORT, 'Have you ever tried to hurt yourself before?']),
    expect: (r) => [
      !r.unlocked.includes('si_behavior_detail') || 'si_behavior_detail unlocked without a suicide screen — attempt history leaks',
      !r.unlocked.includes('si_active') || 'si_active unlocked by a past-attempt question alone',
      // "tried to hurt yourself" is Dana's euphemism vocabulary, so partial is the
      // correct score here, not missed. What must never happen is `observed`: a
      // euphemistic past-attempt question is not a plain suicide screen.
      r.row('c_si') !== 'observed' || 'a euphemistic past-attempt question was credited as a real suicide screen',
    ],
  },
  {
    id: 'B3b', name: 'D14: a DISCHARGE plan question is not a plan question',
    gates: ['si_plan_detail'],
    run: () => probe('Dana', [...RAPPORT, 'Have you had thoughts of killing yourself?', 'What is your plan for after discharge?']),
    expect: (r) => [
      !r.unlocked.includes('si_plan_detail') || 'si_plan_detail fired on a discharge-planning question (D14 regression)',
      !r.covered.includes('si_plan') || 'si_plan credited for a discharge-planning question (D14 regression)',
    ],
  },
  {
    // The other half of B3: a gate that fails closed forever is as broken as one that
    // leaks. After a real screen, the follow-up detail gates MUST become reachable.
    id: 'B3c', name: 'after disclosure, the real follow-up gates do open',
    gates: ['si_plan_detail', 'si_means_detail', 'si_protective_detail', 'si_behavior_detail'],
    run: () => ({
      plan: probe('Dana', [...RAPPORT, 'Have you had thoughts of killing yourself?', 'Do you have a plan?']),
      means: probe('Dana', [...RAPPORT, 'Have you had thoughts of killing yourself?', 'Do you have access to the pills?']),
      prot: probe('Dana', [...RAPPORT, 'Have you had thoughts of killing yourself?', 'What keeps you going?']),
      behavior: probe('Dana', [...RAPPORT, 'Have you had thoughts of killing yourself?', 'Have you ever tried to hurt yourself before?']),
    }),
    expect: (r) => [
      r.plan.unlocked.includes('si_plan_detail') || 'si_plan_detail did not open after a real screen — D14 over-narrowed',
      r.means.unlocked.includes('si_means_detail') || 'si_means_detail did not open after a real screen — D14 over-narrowed',
      r.prot.unlocked.includes('si_protective_detail') || 'si_protective_detail did not open after a real screen — D15 over-narrowed',
      // WP-5m's own teaching note calls past attempts the element students most often
      // drop and the one carrying the most weight. It was the only one of si_active's
      // four unlocks with no probe on either side.
      r.behavior.unlocked.includes('si_behavior_detail') || 'si_behavior_detail did not open after a real screen — past attempts unreachable',
    ],
  },
  {
    id: 'B4', name: 'judgmental turn, then the screen — gate stays shut',
    gates: ['si_active'],
    // NB: the phrasing must actually trip Dana's `judgmental` intent. "Calm down"
    // is Marcus's flag vocabulary, not hers — hers keys on "you should", "at least",
    // "snap out", "look on the bright side". A probe that does not flag proves nothing.
    run: () => probe('Dana', [...RAPPORT, JUDGMENTAL, SCREEN]),
    expect: (r) => [
      !r.unlocked.includes('si_active') || 'si_active unlocked on a turn following a judgmental flag',
    ],
  },
  {
    // The other half of B4. The flag window is flagHistory.slice(-2), so a learner who
    // was judgmental must put TWO clean turns between the flag and the re-ask before the
    // disclosure is reachable again. That is a designed amount of forgiveness — pin it,
    // or a change to the window silently makes the patient harsher or cheaper to win over.
    id: 'B4b', name: 'the gate RECOVERS after the flag ages out (2 clean turns)',
    gates: ['si_active'],
    run: () => ({
      one: probe('Dana', [...RAPPORT, JUDGMENTAL, SCREEN, REPAIR[0], SCREEN]),
      two: probe('Dana', [...RAPPORT, JUDGMENTAL, SCREEN, ...REPAIR, SCREEN]),
    }),
    expect: (r) => [
      !r.one.unlocked.includes('si_active') || 'gate reopened after only ONE repair turn — the flag window shrank',
      r.two.unlocked.includes('si_active') || 'gate never reopened after two repair turns — a single judgmental turn locks the disclosure out permanently',
    ],
  },
  {
    id: 'B6', name: 'D12: a euphemism on Marcus stays locked and scores partial',
    gates: ['g_si_mixed'],
    run: () => probe('Marcus', [...RAPPORT, 'Have you thought about hurting yourself?']),
    expect: (r) => [
      !r.unlocked.includes('g_si_mixed') || 'g_si_mixed unlocked on a euphemism — D12 violation',
      r.covered.includes('si_euphemism') || 'si_euphemism not counted as asked',
      !r.covered.includes('si_direct') || 'si_direct credited for a euphemism — D12 violation',
      r.row('c_si') === 'partial' || `c_si = ${r.row('c_si')} (want partial)`,
    ],
  },
  {
    id: 'B6b', name: 'D12: the plain screen still works after a euphemism',
    gates: ['g_si_mixed'],
    run: () => probe('Marcus', [...RAPPORT, 'Have you thought about hurting yourself?', 'Have you had thoughts of killing yourself?']),
    expect: (r) => [
      r.unlocked.includes('g_si_mixed') || 'g_si_mixed did not unlock after a plain screen',
      r.row('c_si') === 'observed' || `c_si = ${r.row('c_si')} (want observed)`,
    ],
  },
  {
    id: 'B7', name: 'D12/D13: a self-harm euphemism on Ray is not a violence screen',
    gates: ['g_target'],
    run: () => probe('Ray', [...RAPPORT, 'Is it okay if we stop whenever you want?', 'Do the voices ever tell you to do anything?', 'Have you thought about hurting yourself?']),
    expect: (r) => [
      !r.unlocked.includes('g_target') || 'g_target fired on a SELF-harm question — the learner never asked about others',
      r.row('c_violence') !== 'observed' || 'c_violence credited for a self-harm question — a violence screen is certified that never happened',
      r.row('c_si') === 'partial' || `c_si = ${r.row('c_si')} (want partial)`,
    ],
  },
  {
    id: 'B7b', name: 'D13: an other-directed screen on Ray still credits violence',
    // Coverage-only: asserts a checklist row, never state.unlocked.
    gates: [],
    run: () => probe('Ray', [...RAPPORT, 'Is it okay if we stop whenever you want?', 'Do the voices ever tell you to do anything?', 'Have you thought about hurting them?']),
    expect: (r) => [
      r.row('c_violence') === 'observed' || `c_violence = ${r.row('c_violence')} (want observed — the boundary must not over-narrow)`,
    ],
  },
  {
    // WP-5m added si_behavior / si_behavior_detail and nothing here exercised them: the whole
    // B-section passed 12/12 while blind to the change it was gating. B8* close that, and B8b/B8d
    // are the regression pins for the cascade-precedence defect the 2026-09-06 red-team found.
    id: 'B8', name: 'a past-attempts question before any screen leaks nothing',
    gates: ['si_behavior_detail'],
    run: () => probe('Dana', [...RAPPORT, 'Have you had any past attempts?']),
    expect: (r) => [
      !r.unlocked.includes('si_behavior_detail')
        || 'si_behavior_detail unlocked without a disclosure — the attempt history is reachable unearned',
    ],
  },
  {
    // THE regression pin for the cascade-precedence defect. "Have you ever tried to kill
    // yourself?" matches si_behavior AND si_direct. Before the fix, gated[0] (si_active, already
    // unlocked) re-consumed the turn with its repeatAsk and gated[4] was never reached, so Dana
    // answered a past-attempts question with a repeat of the disclosure — or, in Live mode, with
    // "Tried what? I'm not sure what you're asking me."
    id: 'B8b', name: 'a past-attempts question that also names the act opens the attempt gate',
    gates: ['si_behavior_detail'],
    run: () => ({
      names: probe('Dana', [...RAPPORT, SCREEN, 'Have you ever tried to kill yourself?']),
      alt: probe('Dana', [...RAPPORT, SCREEN, 'Have you ever attempted suicide?']),
      soft: probe('Dana', [...RAPPORT, SCREEN, 'Have you had any past attempts?']),
    }),
    expect: (r) => [
      r.names.unlocked.includes('si_behavior_detail')
        || 'si_behavior_detail did NOT open — si_active re-consumed the turn with its repeat line',
      r.alt.unlocked.includes('si_behavior_detail')
        || '"attempted suicide" did not open the attempt gate',
      r.soft.unlocked.includes('si_behavior_detail')
        || 'the plain phrasing did not open the attempt gate either',
    ],
  },
  {
    id: 'B8c', name: 'a judgmental turn still shuts the attempt-history gate',
    gates: ['si_active', 'si_behavior_detail'],
    run: () => probe('Dana', [...RAPPORT, JUDGMENTAL, SCREEN, 'Have you ever tried to end your life?']),
    expect: (r) => [
      !r.unlocked.includes('si_active') || 'si_active unlocked on a turn following a judgmental flag',
      !r.unlocked.includes('si_behavior_detail')
        || 'si_behavior_detail opened while its required gate was blocked by a flag',
    ],
  },
  {
    // The same cascade defect on a gate that predates WP-5m. Naming the act explicitly is the
    // taught standard for a risk interview, so the simulation must not answer only the vaguer form.
    // NB the means half of this is NOT here: "anything at home you could use to kill yourself"
    // matches si_direct and family_social but never si_means, so no gate's requirement is hit and
    // the cascade cannot help. That is an intent-pattern gap, tracked separately.
    id: 'B8d', name: 'an explicit plan question opens the same gate as the soft form',
    gates: ['si_plan_detail'],
    run: () => ({
      explicit: probe('Dana', [...RAPPORT, SCREEN, 'Have you thought about how you would kill yourself?']),
      soft: probe('Dana', [...RAPPORT, SCREEN, 'Do you have a plan?']),
    }),
    expect: (r) => [
      r.explicit.unlocked.includes('si_plan_detail')
        || 'si_plan_detail did NOT open for an explicit plan question — the vaguer phrasing is rewarded',
      r.soft.unlocked.includes('si_plan_detail') || 'si_plan_detail did not open for the soft form either',
      r.explicit.covered.includes('si_plan') || 'si_plan not credited for an explicit plan question',
    ],
  },
  {
    // Grading half: c_si_followup read `partial` either way, so the score HID the difference.
    // Both runs below ask all four follow-ups; only the wording of plan and past-behaviour moves.
    id: 'B8e', name: 'explicit and soft phrasings grade the same',
    // Compares the SET of `_detail` gates each phrasing reaches (see `gates()` in expect
    // below) rather than asserting a fixed id, but si_plan_detail/si_means_detail/
    // si_behavior_detail/si_protective_detail are exactly the gates that comparison spans.
    gates: ['si_plan_detail', 'si_means_detail', 'si_behavior_detail', 'si_protective_detail'],
    run: () => ({
      explicit: probe('Dana', [...RAPPORT, SCREEN,
        'Have you thought about how you would kill yourself?',
        'Do you have access to the pills?',
        'Have you ever tried to kill yourself?',
        'What keeps you going?']),
      soft: probe('Dana', [...RAPPORT, SCREEN,
        'Do you have a plan?', 'Do you have access to the pills?',
        'Have you had any past attempts?', 'What keeps you going?']),
    }),
    expect: (r) => {
      const want = ['si_plan', 'si_means', 'si_behavior', 'si_intent_protective'];
      const missing = want.filter((i) => !r.explicit.covered.includes(i));
      // Coverage alone does NOT bite: an intent is credited as asked even when its gate never
      // opened, which is exactly how the defect stayed invisible. The disclosures reached are
      // the half that moves, so assert those too.
      const gates = (x) => x.unlocked.filter((g) => g.endsWith('_detail')).sort().join(',');
      return [
        r.explicit.row('c_si_followup') === r.soft.row('c_si_followup')
          || `c_si_followup differs by phrasing: explicit=${r.explicit.row('c_si_followup')} soft=${r.soft.row('c_si_followup')}`,
        !missing.length || `explicit phrasing lost coverage: ${missing.join(', ')}`,
        gates(r.explicit) === gates(r.soft)
          || `different disclosures reached: explicit=[${gates(r.explicit)}] soft=[${gates(r.soft)}]`,
      ];
    },
  },
  {
    id: 'C3', name: 'a symptom outside the inventory invents nothing',
    // Coverage-only: asserts a covered-intent flag, never state.unlocked.
    gates: [],
    run: () => probe('Dana', [...RAPPORT, 'Have you had any seizures?']),
    expect: (r) => [
      !r.covered.includes('si_direct') || 'an unrelated symptom question credited a safety intent',
    ],
  },
  {
    // B9 series: the five disclosure gates the 2026-09-09 coverage audit found with NO
    // probe on either side — Marcus's g_fear_passenger/g_spending/g_sexual and Ray's
    // g_command/g_not_eating. Each follows B2/B6/B7's shape: build the rapport the pack's
    // own rapportRules require, ask the exact intent the gate's `requiresIntents` names,
    // and assert on state.unlocked — never on `covered`, which is credited as asked even
    // when the gate never opens (see the B8e comment above; that is exactly how the
    // 2026-09-06 cascade defect stayed invisible for a release).
    id: 'B9', name: 'Marcus: the racing-thoughts fear-of-losing-control gate needs real rapport',
    gates: ['g_fear_passenger'],
    // requiresIntents: ['racing_thoughts'] (pattern "\bracing"), requiresRapport: 2.
    run: () => ({
      warm: probe('Marcus', [...RAPPORT, "Let's stay with one thing at a time.", 'Are your thoughts racing?']),
      cold: probe('Marcus', ['Are your thoughts racing?']),
    }),
    expect: (r) => [
      r.warm.unlocked.includes('g_fear_passenger') || 'g_fear_passenger did NOT unlock after real rapport — the fear-of-losing-control disclosure is unreachable',
      !r.cold.unlocked.includes('g_fear_passenger') || 'g_fear_passenger unlocked at rapport 0 — the disclosure gate is open to a cold question',
    ],
  },
  {
    id: 'B9b', name: 'Marcus: the spending gate needs at least a little rapport',
    gates: ['g_spending'],
    // requiresIntents: ['spending'] (pattern "\bmoney\b" / "spen[dt]"), requiresRapport: 1.
    run: () => ({
      warm: probe('Marcus', [...RAPPORT, 'Have you been spending a lot of money?']),
      cold: probe('Marcus', ['Have you been spending a lot of money?']),
    }),
    expect: (r) => [
      r.warm.unlocked.includes('g_spending') || 'g_spending did NOT unlock after rapport — the spending disclosure is unreachable',
      !r.cold.unlocked.includes('g_spending') || 'g_spending unlocked at rapport 0 — the disclosure gate is open to a cold question',
    ],
  },
  {
    id: 'B9c', name: 'Marcus: the sexual-risk gate needs real rapport',
    gates: ['g_sexual'],
    // requiresIntents: ['sexual_risk'] (pattern "\bsex\b|\bsexual"), requiresRapport: 2.
    run: () => ({
      warm: probe('Marcus', [...RAPPORT, "Let's stay with one thing at a time.", 'Have you been sexually active lately?']),
      cold: probe('Marcus', ['Have you been sexually active lately?']),
    }),
    expect: (r) => [
      r.warm.unlocked.includes('g_sexual') || 'g_sexual did NOT unlock after real rapport — the sexual-risk disclosure is unreachable',
      !r.cold.unlocked.includes('g_sexual') || 'g_sexual unlocked at rapport 0 — the disclosure gate is open to a cold question',
    ],
  },
  {
    id: 'B9d', name: 'Ray: the command-hallucination gate needs real rapport',
    gates: ['g_command'],
    // requiresIntents: ['command_content'] (pattern "voices? (ever )?(tell|telling|...)"), requiresRapport: 2.
    run: () => ({
      warm: probe('Ray', [...RAPPORT, 'Do the voices ever tell you to do anything?']),
      cold: probe('Ray', ['Do the voices ever tell you to do anything?']),
    }),
    expect: (r) => [
      r.warm.unlocked.includes('g_command') || 'g_command did NOT unlock after real rapport — the command-hallucination disclosure is unreachable',
      !r.cold.unlocked.includes('g_command') || 'g_command unlocked at rapport 0 — the disclosure gate is open to a cold question',
    ],
  },
  {
    id: 'B9e', name: 'Ray: the not-eating gate needs at least a little rapport',
    gates: ['g_not_eating'],
    // requiresIntents: ['eating_selfcare'] (pattern "\beat(ing|en)?\b"), requiresRapport: 1.
    run: () => ({
      warm: probe('Ray', ['My name is Alex — is that okay?', 'Have you been eating okay?']),
      cold: probe('Ray', ['Have you been eating okay?']),
    }),
    expect: (r) => [
      r.warm.unlocked.includes('g_not_eating') || 'g_not_eating did NOT unlock after rapport — the not-eating disclosure is unreachable',
      !r.cold.unlocked.includes('g_not_eating') || 'g_not_eating unlocked at rapport 0 — the disclosure gate is open to a cold question',
    ],
  },
];

// --coverage: for every disclosure gate in every pack case, name the probe ids whose
// `gates` field asserts on it (on `state.unlocked`, per the B9 comment above — never on
// `covered`, which a gate can win without ever opening). Gate ids are unique across this
// pack's three cases (si_* only on Dana, g_* only on Marcus/Ray), so a gate id alone tells
// you which case owns it; this loop still keys off `pack.cases` so a same-named gate added
// to a fourth case would not silently merge into another case's coverage row.
//
// REPORT-ONLY, ALWAYS EXITS 0. bin/check_qbank_coherence.py and bin/verify_spans.py are the
// pattern this deliberately does NOT follow: today five gates have no probe (that is the
// whole reason this flag exists), and this repo's own verify.sh step would go red on day
// one if this exited 1 for a finding nobody has acted on yet. Flip the final `process.exit`
// below to `process.exit(missing.length ? 1 : 0)` once every gate below has at least one
// probe — at that point this becomes a real regression gate instead of a report.
if (SHOW_COVERAGE) {
  console.log('SP red-team — gate coverage (report-only; does not fail the build)');
  console.log('pack: %s\n', path.relative(ROOT, packPath));
  const missing = [];
  for (const c of pack.cases) {
    console.log(c.id);
    for (const g of c.gated || []) {
      const probeIds = PROBES.filter((p) => (p.gates || []).includes(g.id)).map((p) => p.id);
      if (probeIds.length) {
        console.log(`  ${g.id}: ${probeIds.join(', ')}`);
      } else {
        missing.push(`${c.id} / ${g.id}`);
        console.log(`  ${g.id}: NO PROBE ASSERTS ON state.unlocked FOR THIS GATE`);
      }
    }
  }
  console.log(
    missing.length
      ? `\n${missing.length} gate(s) with no probe:\n` + missing.map((m) => `  - ${m}`).join('\n')
        + '\n\nReport-only: this does NOT fail the build. See the comment above this block.'
      : '\nEvery pack gate has at least one probe.',
  );
  process.exit(0); // ALWAYS 0 — see the comment above this block.
}

let pass = 0;
const failures = [];
console.log('SP red-team — Tier 1 (deterministic gate integrity)');
console.log('pack: %s\n', path.relative(ROOT, packPath));
for (const p of PROBES) {
  let errs;
  try {
    errs = p.expect(p.run()).filter((x) => x !== true);
  } catch (e) {
    errs = [`crashed: ${e.message}`];
  }
  if (errs.length) {
    failures.push([p.id, p.name, errs]);
    console.log(`FAIL  ${p.id}  ${p.name}`);
    errs.forEach((e) => console.log(`        · ${e}`));
  } else {
    pass++;
    console.log(`pass  ${p.id}  ${p.name}`);
  }
}
console.log('\n%d/%d deterministic probes pass', pass, PROBES.length);
if (failures.length) {
  console.log('\nDO NOT RECORD A RED-TEAM PASS. Fix the failures above first.');
  process.exit(1);
}
console.log(
  '\nTier 1 clean. This is NOT a red-team pass — it proves the state machine only.\n' +
  'Sections A (character), C1/C4/C5 (content + evaluator), D (endpoint) and E (golden\n' +
  'transcript) are human/live checks. See docs/RED_TEAM_RUNBOOK.md, then record with\n' +
  'record_red_team.py once the WHOLE checklist has actually been run.',
);
