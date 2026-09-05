# Post-Event Learning Huddle — Event 2: "The follow-up that never arrived" (design for approval)

**Status:** APPROVED by Joshua Moss, MD on 2026-09-05 ("i approve"); implemented on branch `claude/huddle-event-2`; ships pending until attested from the preview. Builds on the live V1 (`rp-post-event-huddle.html`, PR #524 → `3e6ca0e`, attested 2026-09-04).
**Author of record for clinical content:** Joshua Moss, MD (to attest). **Drafted by:** Claude (Cowork).
**Proposed spec path if approved:** `docs/superpowers/specs/2026-09-05-post-event-huddle-event-2-discharge-design.md`

---

## 0. What changes and what does not

| | V1 (live) | V1.1 (this proposal) |
|---|---|---|
| Page, slug, nav, Path, ledger slug | `rp-post-event-huddle.html`, one nav entry, Path Week 3 | **Unchanged** — no new slug, so no inventory canaries move (nav 101+COTW, library 93, universe 124 all stay) |
| Event data | one `event` object | an `events` **array** of two; `?event=<id>` selects, unknown/absent → the first (shift-change) |
| Lenses, debrief logic, tests T1–T20 | as shipped | unchanged; `HUDDLE.buildDebrief` is untouched; T14/T20 run **per event**; T16 runs 64 combinations **per event** |
| New logic | — | one pure function `HUDDLE.selectEvent(events, param)` + an accessible event switcher (two links, `aria-current`); no storage, no request — selection lives in the URL |
| Ledger | reviewed | the PR ships **pending** (content changed); flips to reviewed when you attest from the preview — exactly the #524 flow. T2 keeps marker ↔ ledger honest |
| Registrations | — | none. One optional CTA: `exp_family.md` → `tools/rp-post-event-huddle.html?event=discharge` (resident build only, via `_addcta`) |

Everything in V1's contract carries over verbatim (no storage / transport / free text / dose / agent / instrument / crisis number / labels / blame / reporting-completion / universal policy; patient visible; ≤ 600-word longest path; resident-only).

---

## 1. Why a discharge event, and why this one

The first event is agitation *at* a transition (shift handoff). The second is a transition *itself* — the post-discharge week, which `systems_medlegal.md` calls the highest-risk window and which every resident owns but no page lets them rehearse from the systems side. The event is chosen so that:

- **no one did anything wrong** — every step was done the way the tools invite it to be done, and the information still failed to travel; the "why" is four information paths and one missing step;
- it stays **clear of suicide-risk content**, so the crisis-block scope rule and T9 are unchanged (the return is a manic relapse, not a self-harm presentation);
- it names **no medication, dose, payer process or clinic by name**, and no statute or timeline that reads as policy;
- it differs from Event 1 on age, sex, diagnosis, setting and failure shape, so a resident who has done both has seen two different systems, not one twice;
- it does not overlap the discharge content in `exp_family.md` / `collateral_workflow.md` (those teach *how to plan*; this asks *what to learn when the plan did not land*).

---

## 2. Event blueprint (faculty-attested text)

> Fictional composite. No real patient, staff member, clinic or date. Learner-visible event block ≈ 212 words; boundary panel ≈ 53 (measured with the T20 tokenizer).

**Id:** `discharge` · **Title:** The follow-up that never arrived — nine days after discharge
**Setting:** Adult inpatient unit. A 28-year-old woman with bipolar I disorder, admitted for a manic episode, improved by hospital day nine and discharged to her sister's across town.

**Timeline:**

1. **Discharge morning.** The resident booked a clinic follow-up six days out and wrote a 30-day prescription. She mentioned she had no working phone and was using her sister's. The sister's number went into the narrative of the discharge summary.
2. **Same morning — paperwork.** The clinic's scheduling system pulled her contact details from registration: her own old number, and the apartment she had just left.
3. **Day 3.** The clinic's reminder call and text went to the old number. The system recorded "reminder sent".
4. **Day 6.** She did not attend. The clinic recorded a no-show and posted a letter to the old address. Nothing came back to the inpatient team.
5. **Days 1–8 — the prescription.** It had gone electronically to the pharmacy on file, near her old apartment. She never collected it; no one knew.
6. **Day 9.** Her sister brought her to the emergency department: two nights without sleep, speech fast, off medication since discharge. She was assessed, found to be safe, and admitted for observation.

**Patient voice (rendered in every debrief):**
> "I did everything you told me. Nobody called. I thought the appointment got cancelled."

**Boundary panel — "Already handled before this huddle (not here)":** she was assessed in the emergency department and is safe · medications reconciled · the clinic and her sister have been told · any notification or report your institution requires is a separate step through its own process. **This page is not a report, does not know whether one was made, and cannot make one.**

**Boundary panel — "This huddle (later; learning only)":** two minutes · three choices · no free text · nothing saved · not an evaluation of anyone · not a policy statement.

---

## 3. Option set and debrief text

All options are legitimate; none is marked correct. Wording avoids every token in T7, T10, T11, T12 and T13.

### Lens A — the patient question ("Which would you ask her first, next time you sit down?")

| id | Option | Debrief | Bridge |
|---|---|---|---|
| a1 | "When you left, what did you understand was going to happen next — and who did you think would call?" | Starts with her model of the plan, not ours. Most discharge plans are clear to the team and vague to the patient about who moves first. Her answer shows which step she was waiting on. It leaves her current contacts and her feelings about the return for later. | Her picture of who was going to call is the only thing that can tell you which information path actually mattered to her. |
| a2 | "Where do you get calls and pick up medication now — and who else should we tell?" | Asks the two practical questions the system did not ask. It treats her sister's phone and a pharmacy near her sister's home as clinical information, not clerical detail. It repairs nothing by itself, and it does not explain why the old details were still in use. | Whatever she names here is the content the next handoff to the clinic and the pharmacy has to carry. |
| a3 | "What was it like to be back in the emergency department after doing what we asked?" | Puts repair first. "I did everything you told me" is an alliance rupture as much as a relapse; unnamed, it follows her into the next admission. It may surface shame, anger or resignation. It gathers less about the mechanics than the other questions. | Repairing the alliance is what makes her answers to the other two lenses usable rather than polite. |
| a4 | "If we write the next plan together, what would make it one you could actually use — and where should a copy live?" | Makes her the author of the next attempt and asks where the plan should live — a sister's fridge is a system too. The risk is moving to the next plan before she has said what this one felt like; some patients need the third question first. | A plan in her words, kept where she and her sister can see it, is the shortest route from this event to the condition you named. |

### Lens B — the team-communication or workflow signal ("Which signal stood out most?")

| id | Option | Debrief | Bridge |
|---|---|---|---|
| b1 | Her sister's number lived in the discharge narrative; the clinic's reminders read registration. | Information existed and did not travel. The resident wrote the right thing in the place they write things; the reminder system reads a different place. Neither side could see the other. It says nothing about the pharmacy or the no-show. | This signal is about where a phone number lived, not who typed it — a design fact, not a verdict on anyone. |
| b2 | The prescription went to the pharmacy on file, near the apartment she had left. | A default did the choosing. E-prescribing is fast precisely because it does not ask; here the unasked question was the one that mattered. It is upstream of the missed visit and independent of it — she would have been off medication even if the reminder had reached her. | This signal points at a default that chose for her — the fix is a question at the moment of prescribing, not a person. |
| b3 | The no-show closed with a letter to an old address, and nothing came back to the team that discharged her. | The loop closed on paper. A no-show is the clinic's most useful signal about a discharge, and it went to the one place she was not, then stopped. This signal produced the sentence she said in the emergency department. | This signal is where the system stopped looking — the loop closed for the clinic before it closed for her. |
| b4 | The discharge conversation ended with the plan handed over, but no one said aloud who would call whom, and when. | Each side assumed the other owned the first call: inpatient thought the clinic would remind; the clinic thought the patient would come. "Someone will call" reliably becomes nobody. It is the cheapest signal to change — one sentence at the bedside. | This signal is the unspoken sentence — naming who calls whom, and when, is the smallest change with the largest reach. |

### Lens C — the system condition worth raising ("Which condition would you raise, and with whom?")

| id | Option | Debrief | Bridge |
|---|---|---|---|
| c1 | The discharge workflow has no step that confirms phone, address and pharmacy before the summary is signed. | Three fields, one moment. Confirming them at discharge would have changed all three information paths in this story. Worth raising with the unit's discharge or quality group as a question — they will know what the workflow can hold and what it already tries to. | This condition is the durable home for what she tells you about where she can be reached — a step outlives the shift and the rotation. |
| c2 | A clinic no-show after discharge has no route back to the discharging team or to a second contact. | The signal exists; it has nowhere to go. The discussable part is whether a no-show in the first two weeks after discharge can reach the inpatient team, or a named second contact, before a letter goes out. Whoever owns the inpatient–clinic interface is the person to ask. | This condition sits between two teams — raising it means asking how a signal from one side could reach the other. |
| c3 | No shared field says who owns the first contact after discharge — inpatient and clinic each assume the other. | An ownership gap rather than a workload gap; both sides were doing their jobs. The condition worth discussing is a single visible answer to "who calls first, and by when," carried on the summary and readable by the clinic. A resident can also model it in the discharge conversation. | This condition is about what the handoff carries — it is the one a resident can also model at the bedside. |
| c4 | A check-in call in the first days after discharge is not a standard step, so whether it happens depends on who discharged her. | An absent step is invisible until someone notices it was skipped. Making "someone calls the number the patient chose, within the first days, and says so" a named expectation is how "nobody called" stops being predictable. Worth proposing at a team meeting; it is the condition most directly tied to her experience. | This condition is the one her own words are asking for — a call that is expected, not incidental. |

### Synthesis frame (shared with Event 1; the three bridges slot in)

Intro: "Three lenses, one discharge — each true on its own, and incomplete on its own." · Close (shared): "Her answer tells you which signal mattered most; the signal tells you which condition to raise first; the condition is what changes the next patient's answer. One of each is the huddle — none of the other options was wrong."

**"What this huddle did not do" (shared, unchanged):** It did not file a report, decide what your institution requires, evaluate anyone on that shift, or replace the debrief your unit may require after restraint or seclusion. It gave you one question, one signal and one condition to carry into tomorrow.

> Implementation note: `synthesis.intro` and the pronoun in `synthesis.close` become per-event fields so "his/her" and "evening/discharge" read correctly; `notDone` stays shared.

---

## 4. Interaction changes

```
[URL]  tools/rp-post-event-huddle.html            → Event 1 (shift-change escalation) — default
       tools/rp-post-event-huddle.html?event=discharge → Event 2
       ?event=<anything else>                     → Event 1, silently (no error state, no storage)

[Top of page, under the lead]  <nav aria-label="Choose an event">
   [Shift-change escalation]  [The follow-up that never arrived]   ← two links, aria-current="page" on the active one
```

Everything below the switcher renders from the selected event exactly as today. Switching is a full page load of a new URL, so nothing needs to be reset and nothing is stored. "Try a different combination" stays within the current event.

---

## 5. Files and touchpoints

| Path | Change |
|---|---|
| `_prototypes/post-event-huddle/rp-post-event-huddle.html` | `#huddle-event` JSON → `{ "events": [ …event1…, …event2… ], "lenses"…, "notDone" }` with per-event `lenses` (the option sets differ) and `synthesis`; `#huddle-logic` gains `selectEvent(events, param)` (pure: known id → that event, else `events[0]`); renderer reads `new URLSearchParams(location.search).get('event')` once and renders the switcher. Marker `version` 0.1.0 → 0.2.0; `status` → `draft-pending-attestation` until attested. |
| `tests/post-event-huddle.test.mjs` | T14, T16, T20 iterate `events`; new **T21**: `selectEvent` returns event 2 for `discharge`, event 1 for `null`, `''`, `'zzz'`, and is deterministic; per-event option ids unique; every event carries `patientVoice`, `boundaryStatement`, `synthesis.intro/close`; new **T22**: switcher is a `<nav aria-label>` of `<a href="?event=…">` links (no buttons, no JS state), and `URLSearchParams` is the only `location` read. |
| `13_Faculty_Resources/reviewed.json` | status → `pending` on the PR with a reason naming Event 2; → `reviewed` at attestation (same two-commit flow as #524). |
| `site_build/resident_section.py` | optional `_addcta("exp_family.md", {label:"Run a 2-minute Post-Event Learning Huddle (discharge)", href:"tools/rp-post-event-huddle.html?event=discharge"})`. |
| `docs/superpowers/specs/2026-09-05-…-design.md` | this document. |
| Not touched | `site_extras.py`, `shipped_pages.json`, `curriculum.json`, governance counts, smoke pins, `tool_registry.json`. |

---

## 6. Faculty review checklist (human gate 1 — read the prose in §2–§3)

| # | Check |
|---|---|
| R1 | Plausible for a MaineHealth discharge to family across town; clearly fictional; resembles no identifiable patient or staff member. |
| R2 | No medication, dose, payer or prior-authorisation mechanics, instrument, crisis number, statute or timeline that reads as policy. The 30-day prescription and "six days out" are the only numbers; both are ordinary. |
| R3 | The return presentation (manic relapse, assessed and safe) is described at the right depth — enough to be real, not enough to become a clinical case. Confirm you are comfortable with "admitted for observation". |
| R4 | No option or debrief locates cause in a person (resident, clinic scheduler, pharmacy, sister). Read b1, b3, c2 especially. |
| R5 | Every option defensible; each debrief says what it surfaces and what it leaves to the other lenses. |
| R6 | Patient sentence and Lens A never subordinated; synthesis opens with her bridge. |
| R7 | System options are all "worth discussing with…" — none states what the clinic or unit *must* do. |
| R8 | The two events read as one format: same boundary panel, same lens prompts' shape, same close. |
| R9 | Reading load: event 212 words; longest path 588 — the same envelope as Event 1 (207 / 587), and inside T20's 220 / 600 budget. Every option, bridge and label already passes T7–T13 and the PHI hook as written. |
| R10 | Pair-with links for Event 2: `exp_family.md`, `collateral_workflow.md`, `systems_medlegal.md`, `doc_oral.md`. |
| R11 | Ledger goes pending on the PR and you attest from the preview again — acceptable? |

---

## 7. Sequencing

1. **Human gate 1 — approve §2–§3 as prose** (edits inline; no code yet).
2. Implement in a fresh worktree from current `main`; T1–T22 first (red), then the data + `selectEvent` + switcher (green); `bin/verify.sh`; both builds in order; axe + keyboard sweep on **both** `?event=` URLs (the existing harness takes a URL suffix with one line added).
3. PR (pending) → deploy preview → **Human gate 2 — attest from the preview** → attestation commit flips ledger + marker → CI (smoke pins unchanged) → merge.

**Next best step:** read §2 and §3 against R1–R11; the only decision with any weight is R3 (how much of the return presentation to show).

**Innovative next idea:** once two events exist, add a third selector state, `?event=random`, that picks one deterministically from the *date* (day-of-year mod 2) — no storage, no request, still testable — so the Path Week 3 link gives different residents different events across a block and the two events are used evenly without anyone choosing.
