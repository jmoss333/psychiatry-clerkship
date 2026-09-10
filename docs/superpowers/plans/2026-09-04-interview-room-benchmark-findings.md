# Interview Room benchmark — faculty decision packet

**Where this lives now:** this benchmark was developed on `codex/interview-room-benchmark`
(based at `7eb4ace`) and ported to `benchmarks/interview-room/` at the repository
root on 2026-09-09, because `sp-proxy/netlify.toml` publishes the whole `sp-proxy/`
tree publicly and a blind calibration answer key must not ship on a public
proxy site. The benchmark, test, and generated-worksheet content below is
unchanged in substance; only file locations and relative paths moved. Two
things changed for real in the port: the `sequential-followup/Dana` positive
control gained a fifth turn after WP-5m added a fourth `c_si_followup` intent
(see the corpus entry's `notes` field and the porting PR), and the three
patient-response pairs now report `skipped: "pack_not_approved"` instead of
throwing, because the pack shipped on current `main` is
`draft-pending-attestation` rather than `reviewed`. See
[`../../../benchmarks/interview-room/README.md`](../../../benchmarks/interview-room/README.md)
for the current run instructions.

**Status:** benchmark implemented; proposed labels pending faculty review.
**Measured source:** `7eb4ace0301e163139208e8dc9f05b3aab5f79ea` (2026-09-04 main).
**Scope:** local source execution, not a production-site or live-model assessment.

**Follow-up:** this packet preserves the original baseline. The narrow narrative
correction and five-pair faculty exercise are now implemented locally; see the
[feedback and calibration record](2026-09-04-interview-room-feedback-calibration.md)
for current results and remaining faculty decisions.

## What this establishes

The simulator's existing vocabulary controls pass while conversation-level
counterexamples remain. A statement can receive credit as a question. The offline
narrative can claim disclosure when the patient actually deflected. A compound
question can credit several follow-up domains while delivering only one answer.

These observations come from the real `MockProvider`, real server `deriveState`
and `computeCoverage`, and actual generated offline replies. Proposed alternative
grades remain hypotheses; the observed outputs are reproducible facts.

| Measurement | Result |
|---|---:|
| Scenario definitions / persona runs | 23 / 49 |
| Student turns compared across both engines | 205 |
| Existing-decision control checks agreeing | 40 / 40 |
| Client/server parity differences | 0 |
| Checks differing from proposed labels | 23 / 29 |
| Semantic comparisons against the explicitly accepted third-person limitation | 3 / 3 differ; kept separate |
| Patient-response pairs with unchanged deterministic coverage maps | 3 / 3 |

The proposed-label differences are not independent bugs and are not an accuracy
estimate. This is a selected adversarial corpus, with repeated comparisons across
personas. All fixture labels are pending review. Existing controls are grounded in
the recorded [D12–D16 decisions](2026-08-31-faculty-decisions-410.md), not a new
attestation.

Independent code review identified two initially weak control assertions. Those
were strengthened, and mutation tests now verify that restoring the historical
broad plan matcher or reopening disclosure to euphemisms produces a benchmark
failure even while client/server parity remains green.

## Highest-priority examples

### 1. Feedback asserts a disclosure that did not occur

Fixture: `cold-screen-narrative/Dana`.

- Learner: “Have you had thoughts of killing yourself?”
- Actual offline reply: “*looks at hands* That's a very direct question for someone
  I met four minutes ago.”
- `si_active` stays locked.
- Actual strength: “You asked about suicide in plain language. That is exactly why
  Dana told you the truth.”

The same unsupported conclusion appears after `reassurance-and-screen/Dana`,
where a flag response consumes the turn. This does not require deciding whether
the learner deserves credit for asking: the feedback's account of the patient's
reply is inconsistent with the generated exchange.

**Recommended first correction:** remove the unconditional disclosure/causation
claim from the narrative. Candidate copy for review: “You used explicit language
about suicide.” Any stronger statement should be supported by response evidence.
This is a narrow feedback change; it need not change vocabulary, gates, or grades.

### 2. Statements and quotations receive plain-question credit

Fixtures: `learner-assertion`, `chart-quotation`,
`historical-question-quotation`, and `negated-discussion`, each across all personas.

For example, “The chart says you have had thoughts of killing yourself.” produces
`c_si: observed` in both engines. In Dana's warmed conversation it also triggers
the active-ideation reveal. The finding is not that reading a chart is inherently
bad practice; it is that the simulator identifies this statement as a question.

**Decision needed:** retain explicit phrase recognition as the scope of the
display, or define a separate question-versus-statement rule. Do not add a simple
question-mark requirement: that would not resolve quotations, leading questions,
or spoken questions without punctuation.

### 3. Several questions get more credit than the response supports

Fixture: `compound-one-reply/Dana`.

After disclosure, the learner asks about plan, access, and protective factors in
one turn. All three intents enter `covered`, so `c_si_followup` becomes
`observed`. Only the plan-detail gate fires; the means and protective-detail gates
remain locked, and the patient gives the plan reply.

The sequential positive control asks each question in its own turn. It reaches
all three gates and receives full follow-up credit. This matched comparison
distinguishes vocabulary coverage from response coverage.

`preasked-followup-carried-forward/Dana` shows a related chronology problem:
earlier follow-up attempts remain in `covered` and become fully credited once a
later disclosure unlocks the checklist row, without re-asking those questions.

**Decision needed:** should the existing row mean topics attempted, or information
actually obtained after disclosure? The corpus proposes less than full credit for
the compound case; the exact alternative is for faculty to decide.

### 4. Patient refusals are visible in the transcript but not the deterministic map

Three paired probes traverse the real evaluation request handler. The learner's
words remain fixed while the final patient response changes:

- a substantive answer versus an explicit refusal;
- a plan answer versus a change-of-topic deflection;
- a command-content answer versus an interruption.

All six requests complete, and the patient text reaches the evaluator input.
Within each pair the deterministic coverage map is identical. The server derives
that map from student messages alone and instructs the evaluator to trust it.

This proves a limit of the deterministic map. It does **not** establish how a live
evaluator would respond to the full transcript: no live model was called.

**Decision needed:** present “question recognized” and “answer unresolved” as
separate facts. A patient's refusal should not be treated as learner failure.

## Additional boundaries worth retaining

- `unfamiliar-plain-question` is missed across all personas; the candidate wording
  needs review before any vocabulary change. `rephrase-after-miss` proves a later
  established question still receives credit.
- `leading-negative` receives full credit across all personas. Partial credit is
  proposed, not ratified.
- `discharge-context-then-pronoun/Dana` triggers a plan reveal after the conversation
  explicitly switches to groceries and the learner asks “How would you do it?”
- `third-person` is an **accepted D16 limitation**, not a newly discovered
  regression. It remains visible in its own category.
- D12–D15 controls still hold: euphemisms remain partial, ordinary discharge plans
  do not count as suicide screens, and Ray's self-harm question does not credit
  violence toward others.

## Recommended sequence

1. Review and apply the narrow narrative correction in example 1. Preserve all
   scoring and disclosure behavior during that first change.
2. Resolve the three underlying display/label decisions: a recognized phrase
   versus a question, a question versus an answer, and attempted versus completed
   follow-up. Use the actual exchanges beside each proposed label.
3. Only then consider an evidence-earned vocabulary or state change. The D16
   decision to retain the closed vocabulary and its named reopening conditions
   remain controlling.

An innovative extension is to make these same paired conversations available to
faculty as a calibration exercise: change one feature (statement to question,
answer to refusal, separate turns to compound turn) and compare the feedback they
would give. This could establish the benchmark labels before an engine change.

## Reproduce and inspect

Validation completed on this change:

- Six benchmark infrastructure tests pass, including historical-regression
  mutation checks and command-line failure propagation.
- Full proxy suite: 288 tests pass.
- Root regression suite: 1,748 tests pass.
- All existing Interview Room client suites pass, including parity, generated
  preview checks, and managed-voice contracts.
- Independent code review completed; both identified control gaps were corrected
  and rechecked. Report source fingerprints and local artifact links verify.

Learner-site builds, hosted checks, and live-provider red-team tests were not run:
this change adds only developer benchmark/test files and review documents.

- [Benchmark guide](../../../benchmarks/interview-room/README.md)
- [Scenario corpus](../../../benchmarks/interview-room/corpus.json)
- [Measured report and source fingerprints](../../../benchmarks/interview-room/baseline-2026-09-04.md)
- [Runner](../../../benchmarks/interview-room/run.mjs)
- [Infrastructure tests](../../../sp-proxy/tests/interview-benchmark.test.mjs)

The source mechanisms are in
[`MockProvider.respond` and `buildNarrative`](../../../_prototypes/sp-interview/sp-interview.html)
and [`deriveState`, `computeCoverage`, and `assembleOutbound`](../../../sp-proxy/netlify/functions/sp.mjs).
The runner records every turn and hashes the actual input files. No source pack,
learner UI, prompt, faculty attestation, or deployment was changed by this work.
