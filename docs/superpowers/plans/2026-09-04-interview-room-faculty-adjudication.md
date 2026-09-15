# Interview Room feedback labels — faculty decision record

**Status: F1–F5 approved by the project author in this task on 2026-09-04.**

The user reviewed the five decisions in chat and explicitly replied **“Approve all
5.”** Approval covers the display meanings and their first implementation. It does
not establish multi-reviewer consensus, individual benchmark labels, new scoring
rules, pack attestation, or release approval. The earlier narrow strengths correction
is preserved in `2f03ab4`; this follow-up applies the approved meanings more broadly.

## Approved decisions

All five rows are accepted. Acceptance here concerns the
display meaning only. Any scoring, gate, vocabulary, model, or release change needs
its own explicit scope and verification. The engine direction documented in
[D16](2026-08-31-faculty-decisions-410.md#d16--engine-direction-wp-b-task-9--410-item-g)
remains the starting point.

| ID | Approved display decision | Why this decision is needed | Faculty response |
|---|---|---|---|
| F1 | Describe a detector match as **“Screening language recognized.”** Reserve “question asked” for an observation supported by the conversational move and target. | Round-one comparison 1: a statement and a question receive the same screening credit and patient reply. Recognition alone does not distinguish them. | Accepted |
| F2 | Keep **learner attempt** and **patient response** as separate observations. For the response, distinguish “addresses the question,” “declines,” “deflects,” “requests a pause,” and “unclear.” | Comparisons 2–4: changing only the patient reply leaves the deterministic map unchanged. A refusal is a response but is not a substantive answer to the screening question. | Accepted |
| F3 | Describe the current follow-up map as **“Follow-up language recognized.”** Show attempted questions and answers only as separate, evidence-supported observations. Any future answer indicator should point to the relevant exchange for each topic. | Comparison 5: bundled questions can receive the same follow-up credit as separate questions while producing fewer patient answers. As in comparison 1, recognizing words does not by itself establish an attempted question. | Accepted |
| F4 | Use **“Unclear from this exchange”** when evidence is insufficient. Do not automatically convert a refusal, pause, or unresolved response into learner failure or overall safety clearance. | The worksheet separates learner behavior, patient response, and clarification. One label should not silently stand for all three. | Accepted |
| F5 | Make the next implementation a **display-only change** based on accepted meanings. Keep the existing grades, disclosure gates, and vocabulary until a separately scoped decision supports changing them. | The current exercise tests interpretation; it does not establish new clinical labels, a semantic classifier, or readiness criteria. | Accepted |

For F2 and F3, the existing engine does not reliably supply the proposed additional
observations. Acceptance of the meaning does not authorize an automatic detector
that guesses them. The first implementation can explain the limitation and present
the actual exchange for human review; an automatic response classifier remains a
separate proposal.

## Optional calibration follow-up

1. Open the [round-one worksheet](../../../benchmarks/interview-room/calibration.html).
   For each conversation, make observations before revealing the simulator labels.
   Compare interpretations against the approved meanings F1–F5.
2. Keep the approved wording fixed during this review session. Independently complete the
   [round-two reviewer copy](../../../benchmarks/interview-room/round-two-reviewer.html).
   It contains four additional pairs across Dana, Marcus, and Ray, with no simulator
   labels or facilitator discussion prompts in the file.
3. Compare reviewers' observations before opening the
   [round-two facilitator copy](../../../benchmarks/interview-room/round-two-facilitator.html).
   It contains the same dialogues and the actual current-engine results. Disagreement
   with the engine is not automatically an error by the reviewer.
4. Record unresolved examples and propose revisions if needed. If the
   second round changes the rules, it becomes a development set for those rules;
   reserve another fresh set for any later independent check.
5. Record any additional faculty decisions separately. Only accepted, explicitly scoped work
   should become an implementation task. No consensus is inferred from silence,
   matching automated outputs, or this document's existence.

Round two uses new evaluated learner wording relative to the original corpus;
shared warm-up and disclosure context are intentionally reused. This is a small
selected exercise, not a validated clinical benchmark. Reviewer exposure has not
been measured, and no faculty observations have been collected. “Fresh” describes
the phrasing relative to the first set, not proven independence or generalizability.

## Approval record

Use synthetic conversation IDs only. The worksheet has no submission or automatic
save; print it if useful. Do not add real patient or learner records here.

- Approver: project author, via the user message in this task.
- Approval date: 2026-09-04.
- Approval text: “Approve all 5.”
- F1, F2, F3, F4, F5: accepted.
- Approved scope: display wording and human review of actual exchanges; preserve
  scores, vocabulary, disclosure gates, and patient behavior.
- Individual conversation observations: not submitted or adjudicated by this approval.
- Additional evidence: independent faculty observations are still needed before
  claiming calibration agreement or adopting new automatic judgments.
- Authorized implementation: apply the wording in step-out notes, debrief, and
  transcript export; present exchanges for human review without classifying them.

Do not treat an unresolved row as approval. This record does not update
`reviewed.json`, the patient pack's faculty-review data, or the release ledger.

## Implementation

The display uses neutral topic names and recognized-language labels while retaining
the raw checklist data. The critical-screen card no longer renders pack sentences
that infer an unasked question or undisclosed content from a detector miss. Its
case-specific rehearsal, reference, and reframe remain intact; the pack itself is
unchanged. Built-in narrative feedback likewise describes recognized wording.

The debrief presents the actual patient opening and learner–patient exchanges in a
collapsible review section, explains the separate response observations, and uses
“Unclear from this exchange” as human-review guidance. No response classification
is computed or saved. Live-model suggestions are identified as model-generated
commentary to check against the exchange; prompts and provider output are unchanged.

The same meaning appears in the downloaded practice transcript. This local source
implementation does not constitute a deployment or live-model verification.

Verification on the implementation based on `4b03fcc`:

- All 241 benchmark snapshots (205 original plus 36 second-round turns) retain
  identical learner text, patient replies, coverage, rubric results, rapport,
  disclosure state, and client/server parity. Only narrative text differs. The
  three paired evaluation-handler captures are identical before and after.
- Five display regression tests pass, including a live-session fallback test using
  the actual proxy client's state handling. The full local verification gate,
  proxy/client suites, and sequential MS3/resident builds pass.
- Browser checks cover recognized, partial, unrecognized, and follow-up wording;
  Ray's separate critical topic; step-out, debrief, keyboard-opened exchange review,
  and downloaded transcript. Exact learner and patient text matches the encounter.
  Tested at 1440, 390, and 320 pixels in light/dark themes with no page errors or
  horizontal overflow. Source checks used local Playwright because the Browser
  plugin was unavailable; no live actor or evaluator was called.
- Independent review identified and rechecked the live fallback counter issue
  described below; no consequential findings remain.

**Separate existing scoring limitation:** live sessions retain recognized intents
per turn but do not update the older reflection counter used by the rubric.
Display feedback now counts the stored reflection intents without mutating that
counter. Decision F5 preserves the existing rubric behavior. Any correction to
live reflection ratings needs a separately scoped scoring decision; this change
does not claim to resolve it.

## Evidence and reproduction

The [feedback correction record](2026-09-04-interview-room-feedback-calibration.md)
contains the original five-pair findings and before/after comparison. Its historical
23-scenario benchmark remains unchanged by this extension.

The second round lives in a separate
[input file](../../../benchmarks/interview-room/round-two.json). It has no
expected grades. Its runner uses the real practice engine and server state
functions, checks the established controls first, and compares both engines on
all 36 turns across eight conversations. The generated pages include fingerprints
of the measured source files. The reviewer and facilitator copies share the same
dialogue, context, and observation choices; only the facilitator copy includes
engine results and discussion prompts.

From the repository root:

```bash
node benchmarks/interview-room/round-two.mjs --check
node benchmarks/interview-room/round-two.mjs --json
```

Regenerate both copies with `--write` when the evidence changes. Keep this round
separate from the original corpus; do not silently tune the engine to it before
faculty review. A new response to the same wording is evidence to inspect, not a
reason to rewrite the source fixture to make the display look better.

**Potential next experiment:** after two independent faculty reviews, create a
small disagreement map by conversation and observation type. Report the number
of comparisons actually completed and retain disagreements explicitly. Do not
simulate reviewers or turn their agreement into a learner score.

## Follow-up: reflection rating and linked evidence — approved 2026-09-04

The project author subsequently selected **“1 and 2”** in chat, approving the
proposed live-mode reflection-rating repair and **Show me why** feedback controls.
This is a separate, narrow extension of F5: the live client's stale reflection
counter now follows the existing offline/server reflection rules. Rating
thresholds, vocabulary, case content, patient replies, and disclosure rules are
unchanged. The earlier note about the live reflection-counter limitation records
the state before this follow-up repair.

The debrief's built-in observations, topic rows, critical-topic notice, and
practice indicators now offer collapsed evidence panels. They preserve the
original exchange numbers and exact learner/patient text. Recognized wording is
not interpreted as a genuine question, an answer, completed assessment, patient
trust, or learner readiness. Rapport evidence includes the full conversation
because the running value can also change on later turns. Missing matches remain
uncertain and link to the full transcript, which opens and receives keyboard
focus. No transcript is newly stored or transmitted.

Model-written suggestions currently supply no linked transcript references.
Their controls explicitly state that limitation and offer the full exchange;
the client does not invent supporting quotes or assign the built-in observation's
evidence to a different model-generated claim. Model prompts and response
contracts are unchanged. When only part of the model feedback is available, the
built-in fallback retains its own source label and evidence.

Verification includes real client/server reflection-count and rating comparisons
after every benchmark turn, exact-quote and refusal cases, absent/partial/unavailable
evidence, and narrative/rating evidence selection. The 205 offline benchmark
frames retain their original states, patient replies, ratings, and parity;
evaluation payload captures are unchanged. New narrative fields only link the
existing observations to their source wording categories.

The browser check uses the real offline engine and the real live client with
local transport fixtures and server state derivation. Fixtures deliberately
include a refusal and unlinked evaluator suggestions; they are not evidence of
a hosted model's behavior. Independent code review found no consequential issues.
Six browser scenarios passed at 320, 390, and 1440 pixels across light and dark
themes, including absent/partial matches, a learner statement, live fallback,
unlinked model suggestions, and mixed model/built-in feedback. Exact quotes,
keyboard expansion, transcript focus, no horizontal overflow, and no console
errors or external requests were checked. Browser plugin not available;
validation used the repository's existing Playwright installation.
The final `bash bin/verify.sh` run passed, including both sequential site builds,
the proxy/client suites, validators, and static QA. Generated preview and faculty
worksheet artifacts were refreshed from their canonical generators.
No clinical attestation, publication, deployment, or individual benchmark-label
adjudication is implied by this change.

## Offline retry prototype — requested 2026-09-04

The project author selected **“Prototype”** after the recommendation to prototype
**Retry this moment**. The generated local `sp-interview.preview.html` enables
the prototype; the canonical learner page has no retry control by default.
No manifest, navigation, provider, pack, clinical attestation, or deployment
configuration changes are part of this prototype.

After an entirely offline encounter, choose a completed exchange from the
debrief and select **Retry this moment**. The prototype rebuilds only the earlier
learner turns in a fresh offline session, preserving the original difficulty and
checking that the earlier patient replies reproduce exactly. It starts before
the chosen question: later questions, coverage, and disclosures do not carry
backward. Live/mixed conversations are ineligible.

Rewrite the chosen line and optionally practice two follow-ups. The view compares
the original and retry exchanges with their original numbering. It offers no
score, preferred-answer verdict, mastery, or readiness claim; a changed simulated
reply does not establish a better question. The retry is text-only, has no
provider calls, and introduces no storage or export. Returning to the original
debrief discards the retry and restores keyboard focus; original ratings,
self-assessment, and transcript remain unchanged.

Verification covers prefix isolation, repeatability across all three personas,
invalid/mixed input, the three-exchange limit, and original-state preservation.
Independent review additionally exercised 940 replayed replies across benchmark
scenarios and both difficulty modes without changing any original encounter.
Its screen-reader announcement finding was corrected: every accepted retry reply
is announced with the practice exchange number, and the browser check verifies
that announcement. Browser scenarios cover 320/390-pixel phones, a 1440-pixel
desktop, light/dark themes, return/re-entry, unchanged storage, and absence of the
prototype control on the canonical page. The original 205 benchmark frames and
evaluation captures remain unchanged.
The final `bash bin/verify.sh` run passed, including both sequential learner-site
builds. Preview, storage, proxy/client, and generated-artifact checks passed;
no publication or deployment was performed.
