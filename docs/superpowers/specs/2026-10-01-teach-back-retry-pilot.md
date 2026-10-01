# Teach-back same-skill retry pilot

This review/design packet accompanies the one-case static pilot in PR930. Clinical teaching
content is canonical data in `communication_cases.json`; this document records its exact
wording and scope. It is not a faculty attestation or a merge/publication instruction.

## 1. Owner decisions and scope

Joshua Moss approved the five-part teaching direction and the exact best-response/listen-for
lines on 2026-10-01 at 22:21 UTC (user message `Sentinel_2e335eb817e88191953337d1e5dcc5db`,
answering `Sentinel_283b3110de3c8191985cb4204ad62a0d`). He then approved all four exact feedback
strings and the narrow secondPass schema/supporting-reader change at 23:36:54 UTC
(user `Sentinel_da23b506937c81918d1c226d147fd096`, answering
`Sentinel_7b28fc6d49608191986ba24153d29d92`: “Yes I do”).

These are owner content/scope approvals. No console re-attestation, faculty reviewer/date,
case promotion, merge, ready, auto-merge or production release is implied. The parent case's
existing facultyReview block is unchanged. The three technical fixes at 289acd6 remain intact.

Only `teach_back_closing_001` can carry the optional `secondPass` object. Its required fields
are `prompt`, `choices` (the existing authored choice format), and `listenFor`; unknown fields
and use on other cases are rejected by the schema. Every first-pass field and all other
cases remain unchanged. There is no new case/card, Daily Review expansion, timer setting,
persistent state, runtime AI, free text, recording or generic retry framework.

## 2. Behavior and governance

First pass: Orient →20-second speaking →comparison →authored feedback. Its selected choice
alone retains the legacy cw_comm_v1 history and cw_srs_v1 COMM# scheduling behavior.

Pilot feedback offers Retry the same skill. The session-only loop is:
retry-speaking →retry-compare →retry-feedback (first/second authored-choice comparison) →
finished. Another second pass remains session-only. The retry branch selects from
`secondPass.choices` and returns before saveAttempt; no second-pass function saves or grades.

The approved variation is retained verbatim. Second-pass c now corrects the Tuesday timing
before re-asking. Its own authored feedback contains no repeated Retry instruction; visible
feedback and its live announcement use the same selected second-pass record. First-pass c
keeps its original complete feedback and Retry suffix. The exact new listen-for question
is used for every second-pass choice; first-pass huddles remain unchanged.

Expiry advances either speaking phase to comparison. Case changes, filter changes during
speaking, reload, and persisted native Back/Forward restore of interrupted speaking reset
to Orient and clear timers/announcements. Filters retaining the current case can retain
completed feedback; native cached completed feedback/finished states retain their state.
Repeated pointer clicks cannot answer a newly rendered comparison; deliberate pointer
and keyboard activation remain immediate. Both neutral storage strings remain truthful
when first-pass persistence fails.

The tool's existing source manifest binds communication_cases.json in extraSources for both
audiences. The data addition therefore affects the genuine content fingerprint; no review
hash or attestation record is rewritten. Reopened warnings and live case badges remain visible.
Validation checks both passes' unique choice IDs and exactly one best choice. Clinical review
exports include both prompts, every option/rationale and listen-for text. Length-cue reporting
also includes the second set, report-only with unchanged question-bank ratchets.

## 3. Exact-text review

| # | Where | Exact text |
| --- | --- | --- |
| 1 | first-feedback pilot action | `Retry the same skill` |
| 2 | retry-speaking pill | `Second pass` |
| 3 | retry-speaking heading | `Same skill, new reply` |
| 4 | retry-speaking prompt | `Retry: he recalls the medication but says the appointment is "sometime next month." Re-explain without shaming, then re-ask.` |
| 5 | retry-speaking task | `Say one new first sentence aloud. Your browser does not listen or record.` |
| 6 | retry-compare heading | `Compare your second sentence` |
| 7 | retry-compare legend | `Which line is closest to your second response?` |
| 8 | retry-feedback heading | `Second pass: ` + existing quality label |
| 9 | selected-example comparison | `First pass: <label>. Second pass: <label>.` |
| 10 | honesty line | `This compares the two authored lines you chose, not your spoken words.` |
| 11 | retry-feedback action | `Finish practice` |
| 12 | reflection summary | `Keep, change, listen for` |
| 13 | reflection headings | `Keep in your wording` / `Change in your wording` / `Listen for` / `Lines you chose` |
| 14 | reflection storage line | `Nothing from this second pass is saved.` |
| 15 | finish heading | `Practice loop complete` |
| 16 | finish body | `The second pass was not saved.` |
| 17 | finish secondary action | `Practice the second pass again` |
| 18 | announcements | `Second pass started. 20 seconds.` / `Practice loop complete.`; comparison announcement unchanged, feedback uses the exact selected rationale below |
| 19 | non-rendered metadata summary | `One pilot case (teach_back_closing_001) adds a session-only same-skill second pass that stores nothing.` (version 3.2) |
| 20 | selected-line prefixes | `First: ` / `Second: ` + actual authored selections |
| 21 | second-pass listen-for | `Did the patient describe the appointment timing accurately? What still needs clarification?` |

The first prompt stays:
> You just reviewed tomorrow's discharge plan: a new medication, a Tuesday follow-up appointment, and what to do if suicidal thoughts return. The patient says, "Yeah, yeah, I get it." What do you say next?

Second-pass authored choices and approved feedback:

| ID / label | Exact response | Exact feedback |
| --- | --- | --- |
| a / Missed opportunity | Great. Do you understand everything? | A yes/no check does not show whether the patient now understands that the appointment is this Tuesday. |
| b / Partly useful | Any questions before tomorrow? | Inviting questions still leaves the appointment misunderstanding uncorrected. Clarify the timing, then ask for it back in the patient's own words. |
| c / Best next line | I may not have explained the timing clearly. Your appointment is this Tuesday. Can you tell me in your own words when it is, what medication you’ll take, and what you’ll do if those thoughts come back? | Best choice. You take responsibility for the unclear explanation, correct the appointment to this Tuesday, and ask for the plan back in the patient's own words, including the safety step. |
| d / Avoid this line | If you don't follow this plan, you'll probably end up back here. | A threat does not correct the appointment misunderstanding. It adds shame rather than checking what the patient understood. |

Keep guidance stays exactly:

- Frame it as checking your explanation, not testing them
- Ask for the plan back in their own words, including what they would do if the thoughts return
- Re-explain any gap, then check again

Change guidance stays exactly:

- Yes/no checks such as 'Do you understand?' or a quizzing tone

The original first-pass c response/rationale remains unchanged in canonical data. The second
best option is still uniquely longest (201 characters versus 36/30/64); this is an acknowledged
practice-case teaching limitation, not a new assessment or an altered question-bank gate.

## 4. Validation and delivery boundaries

Contract/schema/semantic/export tests cover data origin, exact approved strings, unchanged
contrasts, invalid or foreign second-pass records, duplicate IDs/best-choice counts, complete
review exports, and feedback budgets for all first/second choice pairs. Browser tests cover
all second choices and visible/announced feedback parity, reflection, optional-data fallback,
storage, keyboard, repeated clicks, expiry/interruptions, real native cache and unaffected cases.

Native-cache tests use installed full Chromium with Playwright's cache-disabling flag removed
and require persisted restoration; reload is not counted as cache coverage. Badge tests use
controlled governance fixtures rather than depending on a live faculty queue. Desktop/mobile
captures and both-audience/full verification supplement existing CI visual coverage.

The handoff records actual final head, passing/failing/skipped tests and CI results. A green
test is not clinical validation, a renewed faculty signature or permission to merge.
