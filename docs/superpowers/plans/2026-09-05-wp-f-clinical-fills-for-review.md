# WP-F clinical fills — drafted for author review, **not applied**

**Date:** 2026-09-05 · **Status:** proposal · **Applies to:** `topic_meta.json`
**Author decision (2026-09-05):** draft to a review file rather than edit `topic_meta.json`, so a
single sign-off pass covers the new content and re-dates the attestation in the same act.

## Why this is a file and not a commit

Every page below already carries `facultyReview: {status: "reviewed", lastReviewed: <date>,
reviewer: "Joshua Moss, MD"}`. Adding clinical content under an existing date would leave an
attestation appearing to cover guidance its reviewer never saw — on, among others, the three
highest-stakes safety pages in the library.

`validate_topic_meta.py:297` would not have stopped it: a `safetyLevel: high` page needs
`evidenceIds`, `facultyReview.status` and `facultyReview.lastReviewed` to be *present*, and all
three already are. The contract cannot tell new content from reviewed content. Only you can.

**So: paste, edit freely, then set `lastReviewed` to the day you actually read it.** The date is
the act of sign-off — that is the one field this proposal deliberately leaves alone.

A note on the shape of the finding, because it is the useful part: the six high-safety pages
missing `ruleOut` are *exactly* the six pages an agent cannot add it to without touching an
attestation. The plan listed the fill as a checkbox and did not notice the overlap.

---

## A. `ruleOut` + `firstMove` — the mini-tree

The panel renders these as **"Rule out first → first move"**, the block the plan calls its
highest-value element. It is present on 25 of 74 pages and absent from these.

**Invariant:** `firstMove` is never valid without `ruleOut` — supply both or neither.
**House shape** (from `delirium.md`, `agitation.md`, `catatonia.md`): `ruleOut` is 3–7 terse noun
phrases, not sentences; `firstMove` is one imperative clause, semicolon-separated.

### `suicide.md` · `pg_suicide.md`
Both are risk-assessment pages; the rule-outs are the **drivers that change the plan**, not a
differential for suicidality itself.

```json
"ruleOut": ["Delirium", "Intoxication / withdrawal", "Akathisia", "Undertreated pain", "Command hallucinations", "Agitation"],
"firstMove": "Secure the environment and means access first, then assess with collateral; treat a reversible driver before reading the risk as fixed."
```

**Verify:**
- [ ] Akathisia belongs on this list — it is a treatable, under-recognised driver of acute suicidality, and its inclusion is the least conventional item here.
- [ ] "Secure the environment and means access first" is the right *first* move for your unit, ahead of assessment.
- [ ] Whether `pg_suicide.md` (pocket guide) should carry the same list as `suicide.md` or a shorter one — I drafted them identical; you may want the pocket guide terser.

### `violence.md`

```json
"ruleOut": ["Delirium", "Intoxication / withdrawal", "Akathisia", "Pain / urinary retention", "Hypoglycemia / hypoxia", "Persecutory delusion with a named target", "Neurocognitive disinhibition"],
"firstMove": "Do not interview alone; lower stimulation, keep your exit clear, and treat a reversible driver before escalating to restraint or involuntary medication."
```

**Verify:**
- [ ] The `firstMove` deliberately re-states the page's own `cant` ("Do not interview alone…"). Keep the echo for emphasis, or cut it to avoid printing the same instruction twice in one panel?
- [ ] "Neurocognitive disinhibition" — right term for your teaching, or prefer "TBI / frontal syndrome"?

### `t_anxiety.md`
Here `ruleOut` is a genuine **medical mimic** list, which is the classical use of the block.

```json
"ruleOut": ["Hyperthyroidism", "Arrhythmia", "Pulmonary embolism", "Hypoglycemia", "Akathisia", "Caffeine / stimulant excess", "Alcohol or sedative withdrawal"],
"firstMove": "Take vitals and review the last 72 h of medication changes before treating new anxiety as primary; start an SSRI plus exposure-based therapy rather than a standing benzodiazepine."
```

**Verify:**
- [ ] PE on the list — defensible for acute-onset anxiety/dyspnoea, but it is the item most likely to read as over-broad on an inpatient psychiatry page.
- [ ] The `firstMove` carries a treatment recommendation as well as a rule-out step; the exemplars mostly do one or the other.

### `adv_psychopharm.md`
Not a differential — the rule-outs are the **false-resistance checks** before escalating.

```json
"ruleOut": ["Non-adherence", "Inadequate dose or duration", "Missed diagnosis (bipolar, substance, medical)", "CYP interaction or ultrarapid metabolism", "Untreated psychosocial perpetuator"],
"firstMove": "Confirm the trial was adequate and adherent before calling it a failure; once genuine resistance is established, escalate to clozapine or ECT without further sequential trials."
```

**Verify:**
- [ ] This repurposes `ruleOut` from "medical mimics" to "reasons the last trial does not count". Clinically it is the right content for the page; confirm you want the block used that way, since it changes what the mini-tree means across the library.

### `med_monitoring.md` — **no `ruleOut` proposed**
A monitoring-schedule page has no differential to exclude. Forcing one would manufacture content to
satisfy a checkbox. Recommend leaving `ruleOut`/`firstMove` absent and filling `clinicalWorkflow`
only (§B). Flagging rather than silently skipping.

---

## B. `clinicalWorkflow` — the "On the unit" card

These six pages have **no `clinicalWorkflow` object at all**, so the panel prints "No bedside
workflow scaffold yet." Keys are a closed set; `rounds` and `ask` are the two the panel leans on.

### `med_monitoring.md` *(high-safety)*
```json
"clinicalWorkflow": {
  "ask": "Ask what was started, when, and at what dose — then ask what baseline was drawn before the first dose and what has been repeated since.",
  "rounds": "Present the monitoring state as part of the plan: what is due, what is overdue, and what result would change the prescription."
}
```
**Verify:** [ ] "what result would change the prescription" is the framing you want residents modelling.

### `medical_workup.md` *(moderate)*
```json
"clinicalWorkflow": {
  "ask": "Ask what changed and over what time course, then take the vitals and test attention yourself rather than inheriting them.",
  "rounds": "Present the medical rule-outs you personally completed, and name the ones still open."
}
```

### `toxidromes.md` *(high-safety)*
```json
"clinicalWorkflow": {
  "ask": "Ask for the last 72 hours of medication changes — additions, dose increases, and abrupt stops — and check the skin and neuromuscular exam yourself.",
  "rounds": "Present fever plus altered mental status as an emergency with a named leading candidate, the exam findings that separate it from the other three, and the agent you are stopping."
}
```
**Verify:** [ ] "the other three" assumes the page's four-syndrome frame (NMS, serotonin syndrome, malignant catatonia, anticholinergic) — confirm the count matches the page.

### `case_formulation.md`
```json
"clinicalWorkflow": {
  "ask": "Ask what was happening in the weeks before admission, not just the symptoms — precipitants live in the history the patient does not volunteer.",
  "rounds": "Present why this patient and why now in two sentences before the plan, and name one psychological and one social contributor."
}
```

### `psychotherapy.md`
```json
"clinicalWorkflow": {
  "ask": "Ask what has helped before and what the patient wants to be different — the answer usually names the modality.",
  "rounds": "Name the stance you are taking with this patient and why, rather than the modality you would choose in clinic."
}
```

### `therapy_reading_room.md`
```json
"clinicalWorkflow": {
  "ask": "Before you cite a paper on rounds, open it and read what it actually measured.",
  "rounds": "Attribute the claim and its hedge together — say what the study showed and what it did not."
}
```
**Verify:** [ ] This is a reading-list page; a bedside `clinicalWorkflow` is a slight stretch. It fits
the page's own `cant` about not quoting annotations as findings — but "leave it absent" is a
defensible alternative, as with `med_monitoring.md`'s `ruleOut`.

---

## C. Not proposed, and why

- **`anki.md`** — flagged by the plan as near-empty. It has `tldr`, `points`, `cta` and
  `relatedTools`, and renders a complete panel for a study-tools page. Its only missing block is
  "On the unit", and a flashcard-download page has no bedside workflow. Recommend leaving it.
  *(The plan's "5 near-empty pages" is now 1: main's curriculum-review work filled the other four.)*
- **`shelf.md`** — still names the shelf/COMAT in prose that ships to residents, but its *subject*
  is that exam. Whether the page should be MS3-only is a curriculum question, not a copy fix.
- **`cotw_index.md`, `orientation.md`, `week1.md`, `therapy_on_the_unit.md`** — carry "MS3" or
  "resident" correctly: escalation targets ("tell the resident or attending") and descriptions of
  the two-audience structure. Left alone deliberately.


---

## D. Exam-name neutralisation — reverted, and why

**Added 2026-09-05 after Codex P2 on #534.** These 14 phrases were applied and then reverted in
the same PR. They are correct copy edits; they were applied against the wrong precondition.

### The mistake worth recording

I checked `topic_meta.json`'s `facultyReview` block, found it absent on all nine pages, and
concluded they were unreviewed. **That is not the ledger that governs.** The chain is:

```
13_Faculty_Resources/reviewed.json   <- the canonical attestation
  -> build_deploy.py:377             <- flattened into the sanitized projection
  -> _build/<site>/governance.json   <- what ships
  -> spa_index.html:761              <- renders: Reviewed by Joshua Moss, MD · <date>
```
All nine carry a live receipt, and `protocol_library.md` is **`riskLevel: high`** — so the PR
body's "every page touched is unreviewed and none is high-safety" was wrong on both halves.

This is the same principle §A and §B are built on. Applying it there and violating it here was
one unchecked assumption, not two different standards.

**To apply:** make each edit below, then re-attest the page in `reviewed.json` — the `at` date
is the act of sign-off and stays yours. `anki.md` and `welcome.md`'s `ask` are not exam-name
edits at all; take or leave them independently.

### `ddx.md` · *reviewed @ 2026-07-01, risk moderate*

`clinicalWorkflow.exam`

```diff
- Shelf questions often hide medical mimics, substance causes, and medication adverse effects inside psychiatric vignettes.
+ Exam questions often hide medical mimics, substance causes, and medication adverse effects inside psychiatric vignettes.
```

### `evidence_inpatient.md` · *reviewed @ 2026-07-03, risk moderate*

`clinicalWorkflow.exam`

```diff
- Link each landmark finding to a shelf-style distinction: delirium treatment, suicide prevention, capacity, family psychoeducation, or risk prediction limits.
+ Link each landmark finding to a board-style distinction: delirium treatment, suicide prevention, capacity, family psychoeducation, or risk prediction limits.
```

### `protocol_library.md` · *reviewed @ 2026-07-03, risk high*

`clinicalWorkflow.exam`

```diff
- Know the conceptual indications and safety logic; local protocol details are not shelf facts and should not be guessed.
+ Know the conceptual indications and safety logic; local protocol details are not exam facts and should not be guessed.
```

### `welcome.md` · *reviewed @ 2026-06-29, risk low*

`clinicalWorkflow.ask`

```diff
- Before you open a patient page, ask what you need right now: orientation, bedside action, communication rehearsal, rounds prep, or shelf review.
+ Before you open a patient page, ask what you need right now: orientation, bedside action, communication rehearsal, rounds prep, or exam review.
```

`clinicalWorkflow.exam`

```diff
- Use shelf mode and daily review for retrieval practice; use patient pages to organize the facts.
+ Use the board-style question bank and daily review for retrieval practice; use patient pages to organize the facts.
```

### `core_readings.md` · *reviewed @ 2026-06-30, risk low*

`points[2]`

```diff
- The differential-diagnosis scaffolds and rounds questions pair with the landmark trials audio set for the deepest shelf and COMAT preparation in the hub.
+ The differential-diagnosis scaffolds and rounds questions pair with the landmark trials audio set for the deepest exam preparation in the hub.
```

### `week6.md` · *reviewed @ 2026-07-03, risk low*

`tldr`

```diff
- Week 6 — Integration, Disposition & Exam Readiness: build a discharge/disposition plan, present a full case with formulation and risk reasoning, and complete the shelf high-yield review and OSCE station set.
+ Week 6 — Integration, Disposition & Exam Readiness: build a discharge/disposition plan, present a full case with formulation and risk reasoning, and complete the high-yield exam review and OSCE station set.
```

`points[0]`

```diff
- Skills of the week: the Risk-Stratified Discharge Pathway, the shelf high-yield review with self-check, and the full OSCE station set for stations you have not yet completed.
+ Skills of the week: the Risk-Stratified Discharge Pathway, the high-yield exam review with self-check, and the full OSCE station set for stations you have not yet completed.
```

`clinicalWorkflow.exam`

```diff
- Use the patient in front of you as the shelf organizer: syndrome, mimic, treatment, safety/legal issue, and disposition.
+ Use the patient in front of you as the exam organizer: syndrome, mimic, treatment, safety/legal issue, and disposition.
```

### `landmark_trials.md` · *reviewed @ 2026-07-03, risk moderate*

`tldr`

```diff
- Fifty landmark papers as 90–120 second audio overviews with board-style self-test in Shelf Mode and Daily Review — listen to the four Foundations papers first (Engel, Rosenhan, Robins-Guze, Insel), then follow your patients to the theme that fits.
+ Fifty landmark papers as 90–120 second audio overviews with board-style self-test in the question bank and Daily Review — listen to the four Foundations papers first (Engel, Rosenhan, Robins-Guze, Insel), then follow your patients to the theme that fits.
```

`points[2]`

```diff
- The same trials feed the board-style questions in Shelf Mode and Daily Review, which extend beyond the individual trial into the broader clinical question — pair the audio with those for shelf preparation.
+ The same trials feed the board-style questions in the question bank and Daily Review, which extend beyond the individual trial into the broader clinical question — pair the audio with those for exam preparation.
```

`clinicalWorkflow.exam`

```diff
- Pair each audio with board-style self-test in Shelf Mode or Daily Review, then answer one question bank item on the same concept.
+ Pair each audio with board-style self-test in the question bank or Daily Review, then answer one question bank item on the same concept.
```

### `rounds_questions.md` · *reviewed @ 2026-08-11, risk moderate*

`points[1]`

```diff
- Covers all shelf/COMAT domains: psychotic disorders (Q1–15), mood, substance use, acute safety, personality, neurocognitive, and psychopharmacology.
+ Covers all exam domains: psychotic disorders (Q1–15), mood, substance use, acute safety, personality, neurocognitive, and psychopharmacology.
```

### `anki.md` · *reviewed @ 2026-08-11, risk low*

`tldr`

```diff
- Download the clerkship's attested question bank and high-yield concepts as Anki spaced-repetition decks; suspend all cards, then unsuspend by topic as the rotation covers each block.
+ Download the library's attested question bank and high-yield concepts as Anki spaced-repetition decks; suspend all cards, then unsuspend by topic as the rotation covers each block.
```

---

## Applying this

1. Paste each fragment into its entry, editing freely.
2. `python3 13_Faculty_Resources/_automation/validate_topic_meta.py` → must print OK.
3. **Re-attest every page you touched, in the ledger that governs it:**
   - `topic_meta.json` → `facultyReview.lastReviewed` (§A, §B — pages that carry that block)
   - `13_Faculty_Resources/reviewed.json` → the entry's `at` and `by` (§D — this is the one
     that renders the learner-visible *Reviewed by* receipt; see §D for the chain)
   Both dates are the act of sign-off. Neither is an agent's to write.
4. `node bin/render_panels.mjs` → read the diff; it is exactly what learners will see change.
5. `node --test tests/*.test.mjs`, then build both sites.
