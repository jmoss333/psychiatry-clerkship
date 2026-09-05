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

## Applying this

1. Paste each fragment into its entry, editing freely.
2. `python3 13_Faculty_Resources/_automation/validate_topic_meta.py` → must print OK.
3. Set `facultyReview.lastReviewed` to today's date on every page you touched.
4. `node --test tests/*.test.mjs`, then build both sites.
