# Post-Event Learning Huddle — V1 design (resident-only, 2 minutes)

**Status:** APPROVED by Joshua Moss, MD on 2026-09-04 ("Yes" — design as written, and Path Week 3 placement once attested). Audit measured read-only on `main @ 87e6c82`; PR #522 merged as `7eb4ace` the same afternoon, which removed constraint C1. Implemented on branch `claude/post-event-huddle` in an isolated worktree. Path Week 3 placement is deferred to the attestation PR (§7).
**Author of record for clinical content:** Joshua Moss, MD (to attest). **Drafted by:** Claude (Cowork).
**Proposed spec path if approved:** `docs/superpowers/specs/2026-09-04-post-event-learning-huddle-design.md`

---

## 0. One-paragraph summary

A single-file, resident-only tool (`rp-post-event-huddle.html`) that walks a resident through one fixed, faculty-attested synthetic event — an evening escalation on hospital day 2 that happened at a shift change, resolved without restraint — and asks for three structured selections: a patient-centred follow-up question, a team-communication/workflow signal, and a system condition. The page then renders a deterministic debrief that shows how the three lenses complement each other. It stores nothing, requests nothing, generates nothing, names no medication or dose, reproduces no instrument, evaluates no one, and draws a visible line between the immediate safety/reporting actions (already done, not here, not recorded here) and this later learning step.

---

## 1. Live-state and collision audit (read-only)

### 1.1 The gap, verified on `main`

| Claim | Evidence | Verdict |
|---|---|---|
| Debriefing is *mandated* but never *taught* | `agitation.md` L46 "Participate in the post-event debrief…", L53 "…demand monitoring plus a debrief"; `systems_medlegal.md` L22 "…ensures the required … debrief are documented"; `protocol_library_inpatient.md` L17; `decision-aids.html` L183 "debrief afterward" | Four shipped resident pages point at a step no page explains. **Gap confirmed.** |
| No QI / systems-learning content ships | Corpus grep for `quality improvement`, `PDSA`, `root cause`, `sentinel event`, `just culture`, `second victim`, `huddle`, `near miss` across `0*_*`, `1[0-4]_*`: zero teaching hits on any shipped page. Only `02_Clinical_Skills/Documentation/_source/06_Second_Victim_Script_Card_CLI.md` exists, and `_source/` does not ship. Matches the 2026-09-04 required-path audit ("finding 5 is the only one sequencing cannot fix"). | **Gap confirmed.** |
| Nothing already occupies this slot | Resident nav has no post-event, QI, or systems-learning tool. The closest neighbours are intervention trainers (`rp-agitation.html`) and a differential-diagnosis case (COTW 2026-07-13, 74-year-old with delirium in the ED). Neither is a post-event learning exercise. | **No functional collision.** |

### 1.2 Collisions and constraints found

| # | Finding | Consequence for this design |
|---|---|---|
| C1 | **PR #522 (`claude/shipped-pages-single-source`) is open and unmerged.** It introduces `shipped_pages.py` / `shipped_pages.json` and re-derives the faculty-console content universe from it. On today's `main`, resident-only tools are **not** in `deriveContentUniverse()`; `rp-agitation`/`rp-brief-psych` sit in `NOT_REVIEWABLE_IN_CONSOLE`. | A new resident-only tool must start `status:"pending"` in `reviewed.json` (the governance validator hard-fails on a missing ledger record). On pre-#522 `main`, a pending key outside the console universe **fails `check_pending_visible.mjs`**, and CLAUDE.md forbids the allowlist fix. **Hard sequencing constraint: implement after #522 merges.** Extending `deriveContentUniverse()` + `cotw_built_slugs()` in parallel would conflict with #522 line-for-line. |
| C2 | WP-6a/6b/6h branches (search reachability, length normalisation, path coverage) are in flight on `curriculum.json`, `common.py`, `resident_section.py` hidden flags. | Keep our `curriculum.json` edit to two additive entries (`siteLibrary.resident` column ref + `libraryExclude` reason). Do **not** touch the resident Path in V1; Path placement is a separate faculty decision (§8). |
| C3 | `rp-agitation.html` ships as a placeholder awaiting LOCAL_POLICY completion and attestation. Its nav title is "Agitation Ladder — PRN Trainer" under *Assess Safety and Acuity*. | The Huddle is deliberately **not** an intervention trainer: it depicts no ladder step, names no agent, and lives under *Present and Work with the Team*. A CTA from `agitation.md` to the Huddle sits beside (not instead of) the existing ladder CTA. |
| C4 | The `_TEMPLATE.html` convention (React UMD + `fetch()` of a sibling `.pack.json`) is what the three `rp-*` tools use. `check-static-site.mjs` bans network-transport APIs **only** for `rotation-curator.html`. | V1 requirement "no network request" is stricter than the gate. The Huddle inlines its event as `<script type="application/json">`, uses vanilla JS (no vendor React), and ships its **own** node test asserting zero transport tokens. |
| C5 | The dose regex is **hard** for any `rp-*.html` filename; localStorage namespace rule is hard; CDN scripts are hard; a metadata marker is required by `validate_tool_governance.py` (`tool`, `audience` ∈ {trainee, ms3, resident, faculty}). | Keep the `rp-` prefix on purpose (it opts us into the strict dose gate). No storage at all. `audience="resident"` only. |
| C6 | Edit-time hooks (`.claude/hooks/clerkship_guards.py`): **deny** hard-coded crisis numbers, dose literals in `rp-*`, non-namespaced keys, machine paths; **ask** on PHI heuristics — 6+ digit runs, slash dates, `MRN`, `DOB`, `date of birth`, `my patient`. | Event text uses "hospital day 2", "about 19:30", no slash dates, no identifiers, no "my patient". |
| C7 | Crisis-block scope rule: opt in only where the learner is plausibly *doing* risk work. | Not opted in (the event is agitation without self-harm content; the learner assesses nothing). Recorded as a faculty-overridable default in §7. |
| C8 | Instrument rule (Option A) and INV-IR2. | No instrument is named or reproduced; no rating of the event; no form. Test asserts no registered instrument name appears. |
| C9 | Registration surface is **nine** code locations, not the two CLAUDE.md names (see §6). | Enumerated with exact anchors so the implementation PR is one pass, not three. |

### 1.3 What already exists that the Huddle should point *to*, not duplicate

`agitation.md` (driver, ladder, restraint-as-last-resort), `systems_medlegal.md` (documentation, restraint order floor, disposition), `collateral_workflow.md`, `doc_oral.md`, `communication-practice.html` case `rupture_limit_setting_001` ("Repair after limit-setting"). The Huddle's "Pair with" row links to these with relative `?page=` / `?tool=` hrefs only.

---

## 2. Boundaries the tool enforces on itself

| Boundary | How it is made visible / testable |
|---|---|
| Immediate safety and reporting vs later learning | A two-column **boundary panel** above the event: *Already handled before this huddle (not here)* vs *This huddle (later, learning only)*. Contains the literal sentence "This page is not a report, does not know whether one was made, and cannot make one." |
| Not an incident report / not evidence of reporting | No inputs except radios; no submit; no storage; no export; the phrase "your institution's own process" appears; the banned-phrase test (§9, T12) fails on any wording that implies completion. |
| Not a restraint trainer | The event contains **no restraint or seclusion**. Footer sentence: "If restraint or seclusion occurs, the face-to-face evaluation, monitoring and documented debrief your institution requires are separate obligations; this exercise is not that." |
| Not a legal review / not universal policy | No statute, timeline, or "policy requires" language; every system option is phrased as "a condition worth discussing with…", never "the policy is…". T13 bans universalising phrases. |
| No labels | T10 bans `competent / incompetent / negligent / negligence / passed / failed / fail / ready / score / grade / remediation / deficient`. No option is marked correct; all four options per lens are legitimate and the debrief says so. |
| No blame on an individual | Options and debriefs name **conditions and information paths**, never a person's error. T11 bans `fault / blame / should have / shouldn't have / careless / error by / mistake by`. Faculty checklist item R4 covers the semantic residue a regex cannot. |
| Patient stays visible | The patient's own sentence (`patientVoice`) is rendered inside the debrief every time, regardless of choices; the synthesis always opens with the patient lens. |
| Resident-only | `audience="resident"`; built only via `PROTO_TOOLS` in `resident_section.py`; T17 asserts absence from `_build/ms3/`. An MS3 version is out of scope unless faculty separately approves. |

---

## 3. Event blueprint## 3. Event blueprint (the one static, faculty-reviewed synthetic event)

> Everything below is fictional and composite. It is the text faculty attests. Learner-visible event block ≈ 207 words; boundary panel ≈ 42.

**Title:** Evening escalation at shift change — hospital day 2
**Setting:** Adult inpatient unit, voluntary admission. A 41-year-old man with schizoaffective disorder, admitted two days ago for worsening paranoia and several nights without sleep.

**Timeline (as the learner sees it):**

1. **Day shift.** He told his primary nurse that noise and "being crowded" set him off, and that dim light and his own headphones help. It went into the progress-note narrative.
2. **About 19:00 — handoff.** A float nurse who had not met him took over. The handoff tool carried orders, observation level and PRN availability. The "what helps" line was not in it.
3. **About 19:30.** Bed management moved a new admission into his room. He learned of it when the stretcher reached the door.
4. **About 19:45.** He shouted, kicked the door frame and stood in the doorway. Staff cleared the hallway; the float nurse and a mental-health worker talked with him. The resident's page read: "pt agitated come now".
5. **About 20:00.** He accepted the already-ordered oral PRN and walked to the quiet room himself. No restraint or seclusion. No injuries. Vitals checked.
6. **Later.** No reassessment time was agreed; the resident assumed nursing had checked in with him, nursing assumed the resident had. Nobody on the evening team had met him before that shift.

**Patient voice (rendered in every debrief):**
> "Nobody asked me what happened. They just decided I was dangerous."

**Boundary panel — left column, "Already handled before this huddle (not here)":** reassessed and safe · no injuries · orders and monitoring per unit practice · any notification or report your institution requires is a separate step through its own process. **This page is not a report, does not know whether one was made, and cannot make one.**

**Boundary panel — right column, "This huddle (later; learning only)":** two minutes · three choices · no free text · nothing saved · not an evaluation · not a policy statement.

### Why this event

- It is an **agitation event at a transition of care** (shift handoff + room move), so both of the brief's candidate event types are in one story without doubling the reading load.
- It resolved **without restraint**, so the huddle cannot be mistaken for the regulatory post-restraint debrief, and it stays clear of `rp-agitation`'s territory.
- Every "why" is an **information path or a condition**, not a person — the story has no villain and no hero.
- It differs from COTW 2026-07-13 (older adult, delirium, ED, pharmacology) on age, setting, diagnosis and learning objective.
- It passes the edit-time PHI heuristics as written (no identifiers, no slash dates, no digit runs).

---

## 4. Interaction flow (target: ≤ 2 minutes, 3 taps)

```
[0:00] Boundary panel (two columns) ── read, ~15 s
[0:15] Event: title, setting, 6-step timeline, patient voice ── read, ~45 s
[1:00] Lens A · fieldset "One question you would ask him next" ── 4 radios, pick 1
       Lens B · fieldset "One team-communication or workflow signal" ── 4 radios, pick 1
       Lens C · fieldset "One system condition worth raising" ── 4 radios, pick 1
       (progress text "1 of 3 chosen" … "3 of 3 chosen"; button "Show the debrief" enables at 3/3)
[1:30] Debrief (aria-live region): patient voice → A debrief → B debrief → C debrief
       → "How the three fit together" (synthesis: intro + A.bridge + B.bridge + C.bridge + close)
       → "What this huddle did not do" footer → Pair-with links
[2:00] Optional <details> "Try a different combination" — re-enables radios; nothing is stored,
       reload resets everything (stated in the UI).
```

Mechanics: real `<input type="radio">` in `<fieldset>`/`<legend>` groups with `<label for>`; button disabled until three picks; debrief is inserted into a `<section aria-live="polite" tabindex="-1">` and focus moves to it; no timer (a visible "~2 min" hint only); no animation beyond the build's shared motion CSS.

Determinism: `HUDDLE.buildDebrief(data, picks)` is a **pure function** defined in a separate `<script id="huddle-logic">` with no DOM access; the renderer is a second script. T16 runs the pure function under `node:vm` across all 64 combinations.

---

## 5. Option set and debrief text (faculty-attested content)

All options are legitimate; the debrief for each says what that choice *surfaces* and what it *leaves for the other lenses*. No option is marked correct.

### Lens A — the patient-centred follow-up question ("Which would you ask him first, next time you sit down?")

| id | Option (a question) | Debrief (~55 words) | Bridge sentence (used in synthesis) |
|---|---|---|---|
| a1 | "What did you notice first — before things got loud?" | Starts with his sequence, not ours. Early cues — the stretcher at the door, an unfamiliar face, the noise — are often known to the patient and invisible in the chart. It tells you which moment mattered to him. It leaves his preferences and his view of staff for later conversations. | His account of what came first is the only thing that can tell you which of the team signals actually mattered to him. |
| a2 | "What would have helped in that moment — and what made it worse?" | Asks for his de-escalation preferences in his own words, right after an event in which the team did not have them. It turns the day-shift note into something he owns. It does not by itself repair trust, and it does not explain why the information did not travel. | Whatever he says would have helped is the content the team's information path needs to carry next time. |
| a3 | "How are you feeling about the staff and this unit now?" | Puts repair first. "They just decided I was dangerous" is an alliance rupture as much as an event; if it is not named, the next shift inherits it. It may surface fear, shame or anger. It gathers less about causes than the other questions. | Repairing the alliance is what makes his answers to the other two lenses trustworthy rather than guarded. |
| a4 | "What do you want the team to know or do differently next time — and is it all right if we write it where the next shift can see it?" | Makes him the author of the plan and asks consent for where it lives. It treats his preferences as clinical information, not a courtesy. The risk is moving to solutions before he has said what happened; some patients need the first or third question first. | A plan in his words, placed where the next shift reads, is the shortest route from this event to the system condition you named. |

### Lens B — the team-communication or workflow signal ("Which signal stood out most?")

| id | Option (a condition, not a person) | Debrief | Bridge sentence |
|---|---|---|---|
| b1 | The "what helps him" line lived in a note narrative, not in the handoff. | Information existed and did not travel. The right thing was documented; the handoff tool had no place to receive it. That is the usual shape of a handoff gap: nobody withheld anything, and the receiving nurse could not have known. It says nothing about whether the room move would still have happened. | This signal is about where information lived, not about who read it — it is a design fact, not a verdict on anyone on shift. |
| b2 | The room change happened without the patient or his nurse knowing in advance. | A decision made off-unit reached the bedside as an event. For a patient whose stated trigger is being crowded, an unannounced roommate is close to the worst case. This signal is about coordination between bed flow and the clinical team; it sits upstream of the escalation and mostly outside the evening team's reach. | This signal points upstream of the evening team — a decision arrived at the bedside without a clinical check-in. |
| b3 | Nobody on the evening team had met him, and the page said only "pt agitated come now". | The team was working from the fewest possible facts: an unfamiliar patient, a one-line page, no shared picture of what usually helps. Float coverage without a patient-level orientation turns every event into a first meeting. The page wording is a symptom of the same thing — there was nothing else to say. | This signal is about a team that had nothing in common yet — the fix is in what the shift starts with, not in anyone's judgement. |
| b4 | After the PRN, no reassessment time was agreed and each discipline assumed the other had spoken to him. | The event was "over" for the team before it was over for him. A closed loop needs a named time and a named person; without them, "somebody will check" reliably becomes nobody. This signal produced the sentence he said later, and it is the cheapest to change on the next shift. | This signal is what left his sentence unheard — the loop closed for the team before it closed for him. |

### Lens C — the system condition worth improving or discussing ("Which condition would you raise, and with whom?")

| id | Option (a condition worth discussing — never "the policy") | Debrief | Bridge sentence |
|---|---|---|---|
| c1 | The handoff tool has no structured field for patient-stated de-escalation preferences. | A field is a small change with a large reach: it makes a bedside observation a standing part of every handoff, for every patient. Worth raising with the nurse manager or the unit's quality group as a question, not a demand — they know what the tool can carry. It does not touch bed flow or reassessment. | This condition is the durable home for what he says helps — a field outlives the shift and the rotation. |
| c2 | Room moves are decided off-unit without a clinical check-in. | Bed pressure is real and the move may have been unavoidable; the condition worth discussing is whether there is a moment — a call, a flag, a question — before a move reaches a patient with a known trigger. Whoever owns bed flow on your unit is the person to ask how that moment could exist. | This condition sits above the unit — raising it means asking how a decision could pause for a clinical question. |
| c3 | Evening coverage relies on float staff without a unit-specific orientation to current patients. | A staffing reality, not a staffing complaint. The discussable part is what a float nurse receives at the start of a shift: a two-line "who is this person and what helps" for the patients most likely to need it. Raise it with nursing leadership — and model it at the physician handoff too. | This condition is about what a shift begins with — it is the one a resident can also model at their own handoff. |
| c4 | A post-event check-in with the patient is not a standard step, so whether it happens depends on who is on. | An absent step is invisible until someone notices it was skipped. Making "someone talks with the patient afterwards, and says so" a named expectation is how "nobody asked me" stops being predictable. Worth proposing at a team meeting; it is the condition most directly tied to his experience. | This condition is the one his own words are asking for — a check-in that is expected, not incidental. |

### Synthesis (fixed frame; the three bridge sentences slot in)

**Intro:** "Three lenses, one evening — each true on its own, and incomplete on its own."
**Then:** A.bridge → B.bridge → C.bridge (in that order — patient first, always).
**Close:** "His answer tells you which signal mattered most; the signal tells you which condition to raise first; the condition is what changes the next patient's answer. One of each is the huddle — none of the other options was wrong."

**"What this huddle did not do" (always rendered):** It did not file a report, decide what your institution requires, evaluate anyone on that shift, or replace the debrief your unit may require after restraint or seclusion. It gave you one question, one signal and one condition to carry into tomorrow.

---

## 6. Proposed files and every gate touchpoint

### 6.1 New files

| Path | Purpose | Notes |
|---|---|---|
| `_prototypes/post-event-huddle/rp-post-event-huddle.html` | The tool. Single file, vanilla JS, inline CSS on Clinical Warm tokens, inline `<script type="application/json" id="huddle-event">` event data, `<script id="huddle-logic">` pure function, `<script id="huddle-render">` DOM. | `_prototypes/` is the established source route for resident-only tools (`PROTO_TOOLS`). `<!-- [CLERKSHIP-META v1] tool="Post-Event Learning Huddle" version="0.1.0" built="<date>" category="systems-practice" audience="resident" settings="inpatient" time="2min" reviewCadenceDays="365" evidenceThrough="n/a" status="draft-pending-attestation" summary="…" -->`. No `.pack.json`. |
| `tests/post-event-huddle.test.mjs` | Deterministic acceptance tests (§9). | Picked up by `node --test tests/*.test.mjs`, which runs inside `build_and_check.sh` before the build — so a red test blocks both sites. |
| `docs/superpowers/specs/2026-09-04-post-event-learning-huddle-design.md` | This document. | Dated; superseded-note convention applies later. |

### 6.2 Edits, with anchors (measured on `main @ 87e6c82`)

| # | File | Edit | Gate that fails if skipped |
|---|---|---|---|
| E1 | `13_Faculty_Resources/_automation/site_build/resident_section.py` — **after #522: `site_extras.py::RESIDENT_PROTO_TOOLS`** (triples `source, slug, title`), which `resident_section.py` and `shipped_pages.py` both import | Register `("_prototypes/post-event-huddle/rp-post-event-huddle.html","rp-post-event-huddle.html","Post-Event Learning Huddle (2 min)")`; nav *Present and Work with the Team* += `{"t":"Post-Event Learning Huddle (2 min)","f":"rp-post-event-huddle.html","k":"tool"}`; `_addcta("agitation.md", {label:"Run a 2-minute Post-Event Learning Huddle", href:"tools/rp-post-event-huddle.html"})` and the same on `systems_medlegal.md`. | Orphan-tool hard fail; source-map orphan hard fail; post-#522 `shipped_pages.py --check-build`. |
| E2 | `_automation/validate_tool_governance.py` | `SITE_EXTRAS["resident"]` += the pair; `EXPECTED_TOOL_COUNTS["resident"]` 25 → 26. | Governance validator (CI + verify.sh). |
| E3 | `_automation/test_validate_tool_governance.py` | Two assertions pin the **real** resident count (L543 `validate_repository(ROOT)` with a synthetic ledger; L638 runs the validator as a subprocess and greps `resident: 25 item(s)`). Both bump 25 → 26. Verified by reading the lines. | py test suite (CI + verify.sh). |
| E4 | `_automation/surface_governance.py` ≈ L551 | slug → source map entry. | Governance projection (`governance.json`) would omit the tool → SPA renders no review notice. |
| E5 | `_automation/export_curriculum_review.py` ≈ L129 | resident extras list += pair. | Not a gate — but the tool would never appear in the faculty review transcript. |
| E6 | `site_build/common.py` ≈ L214 | boost map: `"rp-post-event-huddle.html": "post-event huddle debrief learning systems handoff shift change room move reassessment patient voice quality improvement team communication"`. | Not a gate; without it the tool is nearly unfindable (known resident-index weakness). |
| E7 | `13_Faculty_Resources/reviewed.json` | `"rp-post-event-huddle.html": {"status":"pending","risk":{"kind":"general","level":"moderate"},"reason":"New resident tool: one synthetic post-event learning huddle; event text and debrief language await faculty attestation.","at":"<date>","by":"Pending faculty review"}` | `validate_tool_governance.py` "missing canonical ledger record" (hard). |
| E8 | `curriculum.json` | `siteLibrary.resident` "Interactive tools" refs += slug; `libraryExclude` += `{ref, reason:"resident-only tool; library columns ship to both sites, so placing it would dead-link on MS3"}` (same reason text the rp-* tools use). | `validate_curriculum.py` "shipped slug appears in no column and no libraryExclude entry". |
| E9 | **After #522:** nothing extra in `shipped_pages.py` itself — it iterates `site_extras.RESIDENT_PROTO_TOOLS` (verified on the branch, L184), so E1 is the registration; then run `shipped_pages.py --write` and commit the regenerated `shipped_pages.json`. **Before #522:** blocked (C1). | `shipped_pages.py --check` (CI, verify.sh, post-edit hook) and `--check-build`. |
| E10 | Nav-inventory canaries — `site_build/test_frontdoor_catalog.py::RESIDENT_EXTRAS`, `tests/fd-reader.test.mjs`, `tests/smoke/front-door.spec.js`, `faculty-console/content-universe.test.mjs` | Run first; update only the ones that pin a full inventory. Never widen `NOT_REVIEWABLE_IN_CONSOLE`. | Their own suites. |
| E11 | `tool_registry.json` | **Not added (decided at implementation).** `tool_registry.relatedPages` back-links are audience-blind: the practice panel would link the Huddle from `agitation.md` on the MS3 site too, where it does not ship (`tests/practice-panel.test.mjs` "every tool the panel can link resolves in FD_INDEX" fails). This is the same reason `rp-agitation` has never been in the registry; resident-only cross-links use `_addcta()` in `resident_section.py` instead. | — |
| E12 | `docs/curriculum-review/` | Regenerate after both builds (report-only). | — |

Not touched: `site_manifest.json` (shared-site registry — this tool is resident-only), `topic_meta.json` (md pages only), `crisis_resources.json`, `instrument_rights.json`, `evidence_annotations.json` (the tool asserts nothing about any paper), `CLAUDE.md`/`AGENTS.md`.

---

## 7. Decisions recorded as faculty-overridable defaults

| Decision | Default in this design | Why | Override cost |
|---|---|---|---|
| Crisis-block opt-in | **No** | The learner does no risk assessment; the event has no self-harm content; the scope rule says "doing risk work", not "mentions an emergency". | Add `<!-- crisis-block-html -->` + list in `_CRISIS_REQUIRED_RES_MD`-equivalent for tools; one-line change. |
| Ledger risk tier | `general / moderate` | No clinical recommendation is made; the risk is framing (blame, policy implication), which the tests and checklist cover. `high` would render the red "Pending faculty review" alert over a 2-minute tool. | Edit one JSON line. |
| Nav section | *Present and Work with the Team* | The three lenses are team/systems skills; *Assess Safety and Acuity* already holds the intervention trainer and would blur the boundary. | One nav line. |
| Resident required Path | **Not placed** in V1; **approved for Week 3 once attested** (Josh, 2026-09-04) | Path additions follow attestation, not precede it. Mechanically safe (PATH_CONTRACT pins week count, not item count; W3 "Systems, med-legal, and disposition" is the natural home). | One `curriculum.json` item in the attestation PR. |
| MS3 version | **None** | Brief says resident-only unless separately approved. | New audience decision; would need `site_manifest.json` registration instead of `PROTO_TOOLS`. |
| Source location | `_prototypes/post-event-huddle/` | Only existing build route for resident-only tools. A `14_Tracks/Resident/tools/` route would be cleaner but needs new plumbing — not V1. | Build change. |
| Data format | Inline JSON block, not `.pack.json` | V1 "no network request" is stricter than the gate; `.pack.json` implies `fetch()`. | — |

---

## 8. Sequencing by constraint

1. **Blocker — PR #522 merges** (or Josh explicitly chooses the parallel path of extending `content-universe.mjs` + `cotw_built_slugs()` here, which I do not recommend).
2. **Human gate 1 — Josh approves this document:** the event text (§3), the twelve options and their debriefs (§5), the seven defaults (§7). Content edits happen here, in prose, before any code.
3. Implement in an isolated worktree: `git worktree add .worktrees/post-event-huddle -b claude/post-event-huddle main`. Tests first (`tests/post-event-huddle.test.mjs`, red), then the tool (green), then registrations E1–E11.
4. Verify: `bash bin/verify.sh` (full, backgrounded to a log); **sequential builds in order** `build_and_check.sh ms3` then `res` (res is a copytree of ms3 — order matters); confirm `_build/ms3/tools/` lacks the file and `_build/res/tools/` has it; Playwright + axe-core against `_build/res/tools/rp-post-event-huddle.html` (keyboard-only completion, contrast, landmarks, live-region announcement); `shipped_pages.py --check-build` both sites.
5. PR with deploy preview → Josh walks the preview on a phone (bedside form factor) → **Human gate 2 — attestation in the faculty console** → flip marker `status="reviewed"` and the ledger record in the same PR the console writes.
6. Optional follow-on: Path W3 placement; `docs/curriculum-review` regeneration.

---

## 9. Clinical / governance review checklist (human gate 1 — for Josh)

Answer each yes/no on the text in §3 and §5. A "no" is a prose edit, not a code change.

| # | Check | Where to look |
|---|---|---|
| R1 | The event is plausible on Sanford BHU2 and clearly fictional; nothing resembles an identifiable patient or staff member. | §3 setting + timeline |
| R2 | The event depicts no restraint/seclusion, no dose, no agent name, no instrument, no crisis number. | §3 step 5; §5 all cells |
| R3 | The boundary panel's "already handled" list does not imply a reporting step was taken by the learner or by anyone. | §3 boundary text |
| R4 | No option or debrief locates cause in a person (day nurse, float nurse, resident, bed management staff, MHW). Conditions and information paths only. Read especially b1, b3, b4, c3. | §5 B and C tables |
| R5 | Every option is defensible; the debrief for each says what it surfaces and what it leaves to the other lenses. No hidden "right answer". | §5 debrief column |
| R6 | The patient's sentence and the patient lens are never subordinated to team/system content; synthesis opens with the patient bridge. | §5 synthesis |
| R7 | No sentence states or implies a universal institutional policy; every system option is "worth discussing with…". | §5 C table |
| R8 | The "what this huddle did not do" footer is accurate for MMC/MaineHealth practice (in particular, it does not misdescribe the post-restraint debrief obligation). | §5 footer |
| R9 | Reading load is acceptable for a "two-minute" framing: event ≈ 207 words; longest full path ≈ 587 words (~2:40 straight through at 220 wpm; less with bullets skimmed). If a hard 2:00 matters, say so and the debriefs shrink to ~40 words each. | §4; T20 |
| R10 | The four CTAs/links (agitation.md, systems_medlegal.md, doc_oral.md, communication-practice rupture case) are the right neighbours. | §1.3 |
| R11 | Ledger tier `general / moderate` is acceptable, and crisis-block opt-out is acceptable. | §7 |
| R12 | Resident-only placement stands; no MS3 version for now. | §7 |

---

## 10. Deterministic acceptance tests (`tests/post-event-huddle.test.mjs`, node:test)

All run against the **source** file unless marked *build*; build-scoped tests skip when `_build/` is absent (existing suite convention). Regexes are case-insensitive unless noted.

| ID | Assertion | Pass condition |
|---|---|---|
| T1 | Static shell | File exists; `<html lang="en">`; exactly one `<title>`; viewport meta; exactly one `<h1>`; heading levels never skip. |
| T2 | Governance marker | Exactly one `[CLERKSHIP-META v1]`; `audience="resident"` (parsed list equals `["resident"]`); `time="2min"`; marker `status` is `draft-pending-attestation` **iff** `reviewed.json[slug].status === "pending"`, else `reviewed`. |
| T3 | Self-contained | Zero `<script src`, zero `<link … href`, zero `@import`, zero `url(http`, zero occurrences of `https?://` anywhere in the file. |
| T4 | No network transport | Zero matches of `\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|navigator\.)\b|\bimport\s*\(|new\s+Image\s*\(|\.(src|srcset)\s*=|\.pack\.json`. |
| T5 | No storage | Zero matches of `localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\b|BroadcastChannel|openDatabase`. |
| T6 | No free text | Zero `<textarea`, zero `contenteditable`, zero `<form`, zero `<select`; every `<input` has `type="radio"`; exactly 12 radios in 3 groups of 4 (`name` attribute cardinality). |
| T7 | No dose, no agent | Zero matches of the gate's `DOSE` regex; zero matches of `\b(haloperidol|lorazepam|olanzapine|ziprasidone|droperidol|ketamine|risperidone|diphenhydramine|benzodiazepine|antipsychotic|IM\b)\b`. |
| T8 | No instrument | For every entry in `instrument_rights.json` (id, name, aliases), zero case-insensitive matches; zero matches of `\b(C-SSRS|CSSRS|PHQ|GAD-7|BFCRS|CIWA|COWS|Stanley|safety plan form)\b`. |
| T9 | No crisis number / no crisis marker | Zero matches of the patterns `clerkship_guards.crisis_patterns()` derives from `crisis_resources.json` (re-implemented in JS from the same file); zero `crisis-block-html` markers (design default; flip to "exactly one" if §7 is overridden). |
| T10 | No labels | Zero matches of `\b(competent|incompetent|negligen(t|ce)|passed|fail(ed|s|ure)?|ready|score[sd]?|grade[sd]?|remediat\w*|deficien\w*)\b`. |
| T11 | No blame | Zero matches of `\b(fault|blame[sd]?|should have|shouldn't have|should not have|careless|error by|mistake by|to blame)\b`. |
| T12 | Reporting boundary | Element `#boundary` exists with two `<h2>`/`<h3>` headings matching `/already handled/i` and `/this huddle/i`; file contains `is not a report`; zero matches of `\b(you have (now )?(reported|filed|completed)|report (was|has been|is) (filed|made|complete)|counts as (a )?report|this fulfils|this fulfills)\b`. |
| T13 | No universal policy | Zero matches of `\b(all hospitals|every hospital|always required|the law requires|policy requires|regulation requires|must be reported within|within \d+ hours?)\b`; at least one match of `your institution`. |
| T14 | Event data shape | `#huddle-event` parses as JSON; `event.title`, `event.setting`, `event.timeline` (array, 4–7 strings), `event.patientVoice` (non-empty), `event.alreadyHandled` (≥3), `event.thisHuddle` (≥2); `lenses` length 3 with ids exactly `["patient","team","system"]` in that order; each lens has `prompt` and exactly 4 options `{id,label,debrief,bridge}`; 12 option ids unique; every `debrief` 150–450 chars; every `bridge` 60–220 chars; every patient-lens `label` ends with `?`; `synthesis.intro`, `synthesis.close`, `notDone` non-empty. |
| T15 | Patient visibility | Render script references `patientVoice`; the debrief container includes an element with `data-slot="patient-voice"`; synthesis order in `buildDebrief` output is patient → team → system (T16 verifies). |
| T16 | Pure, deterministic logic | Extract `<script id="huddle-logic">`, run under `node:vm` with an empty sandbox (no `document`, `window` = `{}`); `HUDDLE.buildDebrief(data, picks)` for all 64 pick combinations returns `{patientVoice, sections:[3], synthesis:[5 strings], notDone}`; each section's text equals the chosen option's `debrief`; synthesis[1..3] equal the chosen bridges in patient→team→system order; calling twice with the same picks is `deepStrictEqual`; an invalid pick id throws. |
| T17 *(build)* | Audience isolation | If `_build/res/tools/rp-post-event-huddle.html` exists: `_build/ms3/tools/rp-post-event-huddle.html` must **not** exist; the resident nav (as emitted in `_build/res/index.html` or its nav JSON) contains the slug under *Present and Work with the Team*; the built file still passes T3–T5 (the page pass must not introduce a request). |
| T18 | Accessibility statics | Every radio has a `<label for=…>` whose target exists; each group is inside `<fieldset>` with a non-empty `<legend>`; the debrief region has `aria-live="polite"` and `tabindex="-1"`; no `tabindex` > 0; no inline `onclick`; the "Show the debrief" control is a `<button>`; a `<main>` landmark exists. |
| T19 | Ledger + registries | `reviewed.json[slug]` exists with `status ∈ {pending, reviewed}` and `risk.kind ∈ {general, clinical, legal, formulary, local-policy}`; `curriculum.json.libraryExclude` contains the slug with a non-empty reason; `siteLibrary.resident` contains the slug. |
| T20 | Two-minute budget | Visible text (tags stripped) of boundary + event + the **longest** single path (max debrief per lens + synthesis + notDone) ≤ **600 words**; the event block alone ≤ 220 words. (Measured on this draft with the same tokenizer: event 207, boundary 42, longest path 587 — about 2:40 read straight through at 220 wpm; the boundary and timeline are bullets and skim faster. If faculty wants a hard 2:00, the lever is cutting each debrief to ~40 words, which brings the path to ≈500.) |

Implementation-time verification that is *not* deterministic and therefore lives in the PR checklist, not the suite: axe-core clean on the built page; keyboard-only completion in Chromium; VoiceOver announcement of the debrief region; phone-width layout with no horizontal scroll; both deploy previews green; `deploy-verifier` run from a machine with real egress for the content half.

---

## 11. Risks and honest uncertainty

| Risk | Likelihood | Mitigation |
|---|---|---|
| #522 stalls; the Huddle waits behind it. | Medium — it is "opened, awaiting Josh". | The tool and tests can be built and verified in the worktree now; only E7/E9 registration waits. |
| Regex bans (T10–T13) over-block ordinary prose ("ready", "fail"). | Certain for the first draft. | Copy in §5 was written against the lists; the tests are the enforcement, the checklist is the intent. |
| "No blame" cannot be fully regex-tested. | Certain. | R4 is a human gate; T11 catches the obvious. |
| Nav-canary tests pin counts I have not read line-by-line. | Medium. | Run them first in the worktree; update only inventory pins. |
| Search still weak for resident-only tools (WP-6a/6b in flight). | High. | E6 boost map; do not wait for WP-6. |

---

## 12. Next best step and next idea

**Next best step:** approve §3 and §5 as prose (or mark up edits inline), confirm the seven defaults in §7, and tell me whether to wait for #522 or not. On approval I open the worktree, write T1–T20 first, then the tool.

**Innovative next idea (not V1):** an **event library with a faculty-authored second event** (a discharge-transition event: a 7-day follow-up that was booked but never reached the patient's phone) selected by URL parameter `?event=…` from the same inline JSON array — same three lenses, same pure function, zero new plumbing — so the Huddle becomes a *format* the rotation can reuse each block, and the attested events accumulate into a small, reviewable systems-learning corpus that finally gives the resident site its QI spine without ever touching a real incident.
