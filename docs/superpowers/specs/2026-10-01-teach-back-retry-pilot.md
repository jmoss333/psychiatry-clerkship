# Teach-back same-skill second pass — static pilot (design + exact-text review packet)

**Status:** NON-SHIPPED REVIEW PACKET · Draft PR only · Draft — clinician review required
**Owner:** Joshua Moss, MD (decision owner) · **Executor:** Claude Code (Cowork session), claimed 2026-10-01 per `~/Documents/AI Handoffs/README.md`
**Scope source:** `~/Documents/AI Handoffs/02-Teach-Back-Claude-Code.md`
**Research baseline:** `fa8b2ed381361e5631566886f43252f851f37c08` · **Implemented against main:** `f25c3298c458b9f1e434b5c4d7666c4f45d345a9`

This document is the neutral design record for the change and the review packet the handoff
required for anything a learner will read that did not exist before. Nothing in it is learner-facing
and nothing in it asserts clinical approval. `teach_back_closing_001` remains
`facultyReview.status: "draft"` exactly as it was at the research baseline; this change does not
promote, relabel, or hide that fact.

## 1. Audit (read-only, before any write)

| Item | Finding |
| --- | --- |
| Current `main` vs research baseline | One commit ahead (`f25c329`, #925 Today purpose chooser). Every file in the handoff's source list is byte-identical to the baseline. |
| Handoff path correction | `communication_cases.json` and `communication_cases.schema.json` live at the **repository root**, not under `02_Clinical_Skills/Communication_Practice/` as listed. The tool fetches `../communication_cases.json`. |
| Collisions | Open PRs #914–#929 fetched by ref: none touches Communication Practice. #917/#918 touch `site_manifest.json`/`shipped_pages.json` only (not edited here). #929 (Eli, Milo/Codex) touches `08_Cases_and_Simulation/` only. #925 is merged and untouched. `bin/coordination_report.py --prs`: 0 overlaps. |
| Routing contract | `?case=<id>` and `?filter=<f>` deep links; tool never writes history state. Preserved. |
| Review provenance | `communication-practice.html` ledger row: `reviewed`, 2026-09-30, Joshua Moss, MD, `contentHash` + `clinicalHash` bound. **This edit drifts that row to pending and reopens the sign-off** (the tool is a non-Markdown source, so the v2 clinical fingerprint does not keep it). `communication_cases.json` is its `extraSources` entry and is **not** edited. |
| Case governance | `teach_back_closing_001` `facultyReview.status` = `draft`, reviewer/lastReviewed empty. Unchanged. Already labelled "Draft · faculty review needed" on the orient panel; now also on the second-pass and finish panels. |
| Existing variation | Already authored inside choice **c**'s feedback: *"Retry: he recalls the medication but says the appointment is "sometime next month." Re-explain without shaming, then re-ask."* Reused verbatim; no data field added (the schema is `additionalProperties:false` and schemas are governance). |
| `moment_luis_teachback_001` | Separate `sp-preview` moment, reviewed 2026-09-09, with its own evidence-linked AI review and one terminal alternative. Not touched, duplicated, promoted, or audited. Its live semantic/microphone audition remains unreviewed and no paid audition was run. |
| Word budgets | Feedback panel < 55 visible words (browser + static twin). Pilot best-choice feedback already renders at **52**. Therefore the retry action **replaces** "Try the next related case" on the pilot case (4 words vs 5) rather than joining it. |
| Test impact | Root: `tests/communication-word-budgets.test.mjs` models the panel chrome and had to learn the per-case primary action; `tests/comm-reason-cards.test.mjs` pins the SRS write path (kept byte-identical). Smoke: `tests/smoke/communication-practice.spec.js` runs on both audiences. |

## 2. Design

One case, one new loop, no new content. After the ordinary rep (Orient → Say it → Compare →
Feedback, which still records `cw_comm_v1` and schedules the COMM# card exactly as before), the
pilot case's feedback panel offers **Retry the same skill** as its sole primary action.

| Phase (`data-phase`) | What the learner sees | Primary action | Persists |
| --- | --- | --- | --- |
| `feedback` (pilot case only) | unchanged quality label, authored feedback, "Say it again" transfer line | **Retry the same skill** (replaces *Try the next related case*) | first pick, as before |
| `retry-speaking` | "Second pass" pill + faculty-review badge; heading *Same skill, new reply*; the authored variation sentence verbatim; 20-second countdown | **Finish now** | nothing |
| `retry-compare` | heading *Compare your second sentence*; same variation; the case's four authored lines | (choice group is the task) | nothing |
| `retry-feedback` | heading *Second pass: <quality label>*; the chosen line's authored feedback; *First pass: <label>. Second pass: <label>.*; honesty line; collapsed *Keep, change, listen for* | **Finish practice** | nothing |
| `finished` | setting pill + badge; heading *Practice loop complete*; honesty line | **Try the next related case** (+ secondary *Practice the second pass again*) | nothing |

Session-only is enforced in code, not by convention: `choose()` returns from the `RETRY_COMPARE`
branch before `saveAttempt()` can run; no second-pass function references `saveAttempt`,
`srsGradeCard`, or `localStorage`. A case change, filter change, timer expiry, or reload during the
second pass behaves exactly as during the first (reset to orient, timer cleared); reload loses the
second pass entirely, which is the intended meaning of session-only.

Honesty boundaries kept: feedback is about the authored line chosen; the tool states it compares
"the two authored lines you chose, not your spoken words"; nothing claims to hear, grade speech,
measure patient comprehension, or infer clinical success; no competence, readiness, streak, or
ranking appears; the "Practiced well / Practiced / Retry / Review" navigator status still derives
from the first pick only.

## 3. Exact-text review — every new learner-visible string

All strings below are **interface scaffolding**, not clinical teaching. The only clinical sentence
rendered by the second pass is the authored variation, reproduced verbatim from choice c's
feedback. Josh decides whether any line below needs rewording before the page is re-attested.

| # | Where | Exact text | Note |
| --- | --- | --- | --- |
| 1 | feedback primary action (pilot only) | `Retry the same skill` | replaces `Try the next related case` on this case |
| 2 | retry-speaking pill | `Second pass` | |
| 3 | retry-speaking heading | `Same skill, new reply` | |
| 4 | retry-speaking prompt | `Retry: he recalls the medication but says the appointment is "sometime next month." Re-explain without shaming, then re-ask.` | **authored, verbatim** (choice c feedback, trailing sentence); pinned by test |
| 5 | retry-speaking task line | `Say one new first sentence aloud. Your browser does not listen or record.` | second sentence is the existing orient line |
| 6 | retry-compare heading | `Compare your second sentence` | |
| 7 | retry-compare legend | `Which line is closest to your second response?` | parallels existing legend |
| 8 | retry-feedback heading | `Second pass: ` + existing quality label | |
| 9 | retry-feedback comparison | `First pass: <label>. Second pass: <label>.` | labels are the existing four |
| 10 | retry-feedback honesty line | `This compares the two authored lines you chose, not your spoken words.` | |
| 11 | retry-feedback primary action | `Finish practice` | |
| 12 | retry-feedback details summary | `Keep, change, listen for` | collapsed by default |
| 13 | details headings | `Keep in your wording` / `Change in your wording` / `Listen for` / `Lines you chose` | bodies are the authored `rapidDrill.mustInclude`, `rapidDrill.avoid`, the existing tag-derived supervisor-huddle prompt, and the two chosen lines |
| 14 | details closing line | `Nothing from this second pass is stored. Your first choice remains in local history.` | |
| 15 | finished heading | `Practice loop complete` | |
| 16 | finished body | `Your first choice is in local history. The second pass was not saved.` | |
| 17 | finished secondary action | `Practice the second pass again` | not a primary action |
| 18 | screen-reader announcements | `Second pass started. 20 seconds.` · `Practice loop complete.` | existing `Compare your sentence with the choices.` and the authored feedback are reused |
| 19 | `[CLERKSHIP-META]` summary (head comment, not rendered) | `One pilot case (teach_back_closing_001) adds a session-only same-skill second pass that stores nothing.` | version 3.0 → 3.1 |

**Known presentation wrinkle for Josh's call:** on the second pass, choosing line **c** again shows
its authored feedback, which itself ends with the "Retry: …" sentence the learner has just acted on.
Authoring second-pass-specific feedback would be new clinical wording and is **not** done here; the
options are (a) accept as-is, (b) author retry-specific feedback through the ordinary case-review
path, or (c) retire the pilot.

## 4. Open decisions (stop conditions honoured)

1. Accept, reword, or reject any string in §3 (interface text).
2. Whether the pilot should extend to other cases — requires an authored variation per case; none exists today, so none was invented.
3. Re-attestation of `communication-practice.html` in the faculty console after merge (drift is expected and reported, never silent).
4. Whether `teach_back_closing_001` itself moves out of `draft` — a separate review of the case text, not part of this change.

## 5. Validation performed / not performed

Recorded in the PR body and the handoff README change-log entry: which checks passed, failed,
were skipped, or were not run, with the exact commit. A green test is not clinical validation.
