# Interview Room feedback labels — faculty decision record

**Status: draft for faculty adjudication. No decisions recorded.**

This record makes the next review concrete: decide what the feedback should mean,
then test those meanings on fresh phrasing. The recommendations below are proposals
from the source review; they are not faculty consensus, new scoring rules, or pack
attestation. The narrower factual strengths correction is already implemented
locally in `2f03ab4`.

## Recommended decisions

Mark **accept**, **revise**, or **defer** for each row. Acceptance here concerns the
display meaning only. Any scoring, gate, vocabulary, model, or release change needs
its own explicit scope and verification. The engine direction documented in
[D16](2026-08-31-faculty-decisions-410.md#d16--engine-direction-wp-b-task-9--410-item-g)
remains the starting point.

| ID | Recommended decision | Why this decision is needed | Faculty response |
|---|---|---|---|
| F1 | Describe a detector match as **“Screening language recognized.”** Reserve “question asked” for an observation supported by the conversational move and target. | Round-one comparison 1: a statement and a question receive the same screening credit and patient reply. Recognition alone does not distinguish them. | Unrecorded |
| F2 | Keep **learner attempt** and **patient response** as separate observations. For the response, distinguish “addresses the question,” “declines,” “deflects,” “requests a pause,” and “unclear.” | Comparisons 2–4: changing only the patient reply leaves the deterministic map unchanged. A refusal is a response but is not a substantive answer to the screening question. | Unrecorded |
| F3 | Describe the current follow-up map as **“Follow-up language recognized.”** Show attempted questions and answers only as separate, evidence-supported observations. Any future answer indicator should point to the relevant exchange for each topic. | Comparison 5: bundled questions can receive the same follow-up credit as separate questions while producing fewer patient answers. As in comparison 1, recognizing words does not by itself establish an attempted question. | Unrecorded |
| F4 | Use **“Unclear from this exchange”** when evidence is insufficient. Do not automatically convert a refusal, pause, or unresolved response into learner failure or overall safety clearance. | The worksheet separates learner behavior, patient response, and clarification. One label should not silently stand for all three. | Unrecorded |
| F5 | Make the next implementation a **display-only change** based on accepted meanings. Keep the existing grades, disclosure gates, and vocabulary until a separately scoped decision supports changing them. | The current exercise tests interpretation; it does not establish new clinical labels, a semantic classifier, or readiness criteria. | Unrecorded |

For F2 and F3, the existing engine does not reliably supply the proposed additional
observations. Acceptance of the meaning does not authorize an automatic detector
that guesses them. The first implementation can explain the limitation and present
the actual exchange for human review; an automatic response classifier remains a
separate proposal.

## Review sequence

1. Open the [round-one worksheet](../../../sp-proxy/benchmarks/interview-room/calibration.html).
   For each conversation, make observations before revealing the simulator labels.
   Compare interpretations and draft decisions F1–F5.
2. Freeze the proposed wording for this review session. Independently complete the
   [round-two reviewer copy](../../../sp-proxy/benchmarks/interview-room/round-two-reviewer.html).
   It contains four additional pairs across Dana, Marcus, and Ray, with no simulator
   labels or facilitator discussion prompts in the file.
3. Compare reviewers' observations before opening the
   [round-two facilitator copy](../../../sp-proxy/benchmarks/interview-room/round-two-facilitator.html).
   It contains the same dialogues and the actual current-engine results. Disagreement
   with the engine is not automatically an error by the reviewer.
4. Record unresolved examples and revise the proposed meanings if needed. If the
   second round changes the rules, it becomes a development set for those rules;
   reserve another fresh set for any later independent check.
5. Record the final faculty decisions below. Only accepted, explicitly scoped work
   should become an implementation task. No consensus is inferred from silence,
   matching automated outputs, or this document's existence.

Round two uses new evaluated learner wording relative to the original corpus;
shared warm-up and disclosure context are intentionally reused. This is a small
selected exercise, not a validated clinical benchmark. Reviewer exposure has not
been measured, and no faculty observations have been collected. “Fresh” describes
the phrasing relative to the first set, not proven independence or generalizability.

## Record the decision

Use synthetic conversation IDs only. The worksheet has no submission or automatic
save; print it if useful. Do not add real patient or learner records here.

- Faculty reviewer(s): ____________________
- Review date: ____________________
- F1 — accept / revise / defer: ____________________
- F2 — accept / revise / defer: ____________________
- F3 — accept / revise / defer: ____________________
- F4 — accept / revise / defer: ____________________
- F5 — accept / revise / defer: ____________________
- Approved display wording and scope: ____________________
- Unresolved conversation IDs and the disputed observation: ____________________
- Required additional evidence: ____________________
- Authorized next implementation, if any: ____________________

Do not treat an unresolved row as approval. This record does not update
`reviewed.json`, the patient pack's faculty-review data, or the release ledger.

## Evidence and reproduction

The [feedback correction record](2026-09-04-interview-room-feedback-calibration.md)
contains the original five-pair findings and before/after comparison. Its historical
23-scenario benchmark remains unchanged by this extension.

The second round lives in a separate
[input file](../../../sp-proxy/benchmarks/interview-room/round-two.json). It has no
expected grades. Its runner uses the real practice engine and server state
functions, checks the established controls first, and compares both engines on
all 36 turns across eight conversations. The generated pages include fingerprints
of the measured source files. The reviewer and facilitator copies share the same
dialogue, context, and observation choices; only the facilitator copy includes
engine results and discussion prompts.

From the repository root:

```bash
node sp-proxy/benchmarks/interview-room/round-two.mjs --check
node sp-proxy/benchmarks/interview-room/round-two.mjs --json
```

Regenerate both copies with `--write` when the evidence changes. Keep this round
separate from the original corpus; do not silently tune the engine to it before
faculty review. A new response to the same wording is evidence to inspect, not a
reason to rewrite the source fixture to make the display look better.

**Potential next experiment:** after two independent faculty reviews, create a
small disagreement map by conversation and observation type. Report the number
of comparisons actually completed and retain disagreements explicitly. Do not
simulate reviewers or turn their agreement into a learner score.
