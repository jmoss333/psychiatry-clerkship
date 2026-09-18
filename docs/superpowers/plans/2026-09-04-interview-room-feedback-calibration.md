# Interview Room feedback correction and faculty calibration

**Status:** implemented locally; proposed label distinctions pending faculty review.
**Base:** `3e2eeb27804fa005ffa9f78a910f51846de3241c` on `codex/interview-room-benchmark`.
**Scope:** a narrow built-in feedback correction plus a standalone faculty exercise.

The simulator now describes what its wording detector recognized without claiming
that the learner asked a question or that the patient disclosed something. Faculty
can also review five paired conversations before revealing the simulator's labels.
No scoring, vocabulary, patient responses, gates, pack, prompt, or attestation changed.

## Feedback correction

The previous strengths sentence asserted that asking about suicide caused the
patient to tell the truth. The actual practice engine sometimes gave a deflection
instead, and it recognized the same wording in learner statements.

The replacement is:

> The simulator recognized suicide-screening language. Review the patient’s response to see what was shared.

This remains accurate when the engine recognizes wording without obtaining an
answer. It does not infer honesty, causation, or a genuine question. The source and
generated preview carry the same correction.

The [original report](../../../benchmarks/interview-room/baseline-2026-09-04.md)
and [original decision packet](2026-09-04-interview-room-benchmark-findings.md)
remain historical evidence. Their unsupported sentence and 23/29 proposed-label
differences describe the pre-correction source.

| Measurement | Before | After |
|---|---:|---:|
| Existing-decision controls agreeing | 40/40 | 40/40 |
| Client/server parity mismatches | 0/205 turns | 0/205 turns |
| Checks differing from proposed labels | 23/29 | 21/29 |
| Accepted third-person limitation comparisons differing | 3/3, separate | 3/3, separate |
| Paired evaluator-input coverage maps unchanged by patient reply | 3/3 pairs | 3/3 pairs |

The two resolved checks concern the unsupported narrative claim. The remaining
proposed-label differences still require adjudication; these selected adversarial
checks are not an error-rate estimate.

Before/after JSON was compared for all 205 snapshots. Student and patient text,
setup/turn identity, both engine states, coverage, rapport, gates, parity, rubric,
and narrative growth items are identical. Only strengths text differs, in 38
snapshots. All three paired-handler results are identical.

## Five-pair faculty exercise

Open [Listening before labeling](../../../benchmarks/interview-room/calibration.html)
in a browser. It contains:

1. A question and a statement with the actual practice-engine replies.
2. An identical question followed by a substantive answer or a refusal.
3. An identical follow-up question followed by an answer or a deflection.
4. An identical question followed by an answer or a request to pause.
5. Bundled and sequential follow-up questions with actual practice-engine replies.

Each conversation has three optional observations: learner move, patient response,
and clarification for this question. Shared setup exchanges remain available.
Current simulator labels are hidden until the reviewer opens the comparison.

The three supplied-response pairs clearly identify their replies as synthetic
alternatives. Their reveal shows the complete deterministic coverage map captured
from the real evaluation handler's input. The other two pairs show selected
checklist rows and built-in strengths feedback after their final turn. No stub
response is presented as model feedback.

The generator uses benchmark evidence directly, fails on missing runs or failed
controls, escapes rendered text, and embeds source fingerprints. A freshness test
prevents an outdated generated page from silently surviving a source change.
There are no external resources, submissions, storage calls, free-text fields,
grades, or approval controls. Choices clear on reset and reload. A print button
opens the browser's print dialog for the current worksheet.

## Concrete recommendation for faculty adjudication

Keep these three meanings separate in any future feedback design:

| Meaning | Evidence to discuss | Limit |
|---|---|---|
| Wording recognized | The current detector matched the learner's words. | Does not establish that a question was directed to the patient. |
| Question directed to the patient | The conversational move and its target support that interpretation. | Does not establish that the patient answered. |
| Response obtained | The exchange contains a response relevant to the question. | Does not by itself establish complete follow-up or a complete risk assessment. |

A refusal, deflection, or interruption should remain visible as a response state
without automatically turning the learner's attempt into a failure. Uncertain or
mixed exchanges need an explicit uncertain state. The exact labels, evidence
requirements, and relationship to the existing checklist are for faculty to decide.

**Next step:** review these five pairs and record consensus and unresolved cases in
a new faculty decision record. Then revise only the approved display meanings and
retain the agreed examples as regression fixtures. D16's closed-vocabulary decision
and its named reopening conditions remain in force.

**Potential extension:** reserve a second set of unseen paraphrases for a later
blind calibration round, so apparent agreement is tested on unfamiliar exchanges
instead of only the five examples used to establish the labels.

## Verification and limits

- All 12 focused benchmark/calibration tests pass, including actual-engine
  feedback, evidence fidelity, missing-input rejection, artifact freshness,
  offline constraints, and malicious-text escaping.
- The full `bin/verify.sh` gate passes: root and faculty-console suites, proxy and
  Interview Room suites, validators, offline gate-integrity probes, and sequential
  MS3/resident builds with their static QA gates.
- Both built learner pages contain the corrected strengths sentence.
- Chromium checks pass at 1440, 390, and 320 pixels: five pairs and 30 labeled
  selects; hidden/revealed context and feedback; keyboard focus order; choices
  surviving reveal; reset and reload clearing; print-button wiring; no horizontal
  overflow, console/page errors, or external requests. Desktop and phone screenshots
  were visually inspected. The Browser plugin was unavailable; the existing local
  Playwright installation was used. The OS print dialog and a physical printout
  were not tested.
- Independent code review found no consequential issues.
- Existing report-only audits remain separate: the span audit flags 11 source
  rows (15 cut/edited sentences, zero reworded sentences); question-bank coherence
  flags zero pairs. Their source data and audit code are unchanged by this work.

These checks establish local source and build behavior. They do not establish
production deployment, live actor/evaluator performance, clinical validity of the
proposed labels, faculty approval, or learner readiness. No deployment or live
provider call was performed.
