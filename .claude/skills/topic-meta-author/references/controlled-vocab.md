# Controlled vocabulary + crosswalk mapping rules

Every code below is a **closed set**. A code outside the set is a hard validator failure; a
plausible-but-wrong code passes the validator but silently corrupts coverage reporting and the
EPA/Milestones feature. Pick codes for the documented *reason*, not by resemblance.

Authoritative sources: `13_Faculty_Resources/CROSSWALK_TAXONOMY.md` (meanings + mapping rules) and
the enum sets hard-coded in `validate_topic_meta.py`.

---

## `shelfBlueprint[]` — disease-category tag (12 codes)

The library's own 12 exam categories (from `QUESTION_BANK_BLUEPRINT.md`), shared with
`question_bank.json` so pages and items join on one vocabulary.

| Code | Covers |
|---|---|
| `mood` | Depressive & bipolar disorders |
| `psychosis` | Schizophrenia spectrum & other psychotic disorders |
| `anxiety` | Anxiety, OCD, trauma/stressor (PTSD) |
| `substance` | Substance use, intoxication, withdrawal |
| `neurocog` | Delirium, dementia/major neurocognitive, medical workup |
| `pharm` | Psychopharmacology, monitoring, protocols |
| `safety` | Suicide, violence, agitation — risk & safety |
| `personality` | Personality disorders |
| `childdev` | Neurodevelopmental / child & adolescent |
| `otherdx` | Eating, sleep, somatic, sexual, dissociative, impulse, adjustment, perinatal |
| `ethics` | Ethics, law, capacity, consent |
| `relational` | Family systems, couples, interpersonal |

**Rule of absence:** skills / process / reference pages (interview, formulation, documentation-as-a-
skill, reading lists, orientation, exam-prep meta) carry **no** `shelfBlueprint`. Absence means "not
a disease-category page" and is correct — do not force a code onto them.

A page usually has **one** code; a genuinely cross-cutting page may have two (e.g., `toxidromes.md`
→ `neurocog` + `pharm`). Prefer the smallest set that is true.

**Placing a *new* disease topic (no "Source pages" entry yet).** `CROSSWALK_TAXONOMY.md` derives a
page's code from the author's "Source pages" column — which can't list a page that doesn't exist yet,
so a brand-new topic isn't placed by any lookup. Resolve it in this order, and **flag your choice in
the report** for the author to confirm in `CROSSWALK_TAXONOMY.md` (the code is a coverage-reporting
commitment, not just a label):

1. **Chapter analogy.** For a DSM-5-TR entity, copy the code of its nearest existing chapter-mate.
   Prolonged grief disorder is a Trauma-and-Stressor disorder — adjustment disorder's chapter-mate —
   so it takes `otherdx`, exactly as `t_adjustment.md` does.
2. **Tag what the page *is*, never what it's contrasted against.** If the teaching point is "this is
   *not* a major depressive episode," tagging `mood` silently corrupts coverage. That's the
   confused-with trap — the single most likely shelf error on a new topic.
3. **No clean home → leave it absent and say so.** A disease page that fits no category is a signal
   the taxonomy needs a human decision, not a forced guess. Absence + a flag beats a plausible-wrong
   code.

---

## `epa[]` — AAMC Core Entrustable Professional Activities (`EPA1`–`EPA13`)

| Code | Core EPA |
|---|---|
| EPA1 | Gather a history and perform a physical examination |
| EPA2 | Prioritize a differential diagnosis after a clinical encounter |
| EPA3 | Recommend and interpret common diagnostic and screening tests |
| EPA4 | Enter and discuss orders and prescriptions |
| EPA5 | Document a clinical encounter in the patient record |
| EPA6 | Provide an oral presentation of a clinical encounter |
| EPA7 | Form clinical questions and retrieve evidence to advance care |
| EPA8 | Give or receive a patient handover to transition care |
| EPA9 | Collaborate as a member of an interprofessional team |
| EPA10 | Recognize a patient needing urgent/emergent care and initiate management |
| EPA11 | Obtain informed consent for tests and/or procedures |
| EPA12 | Perform general procedures of a physician |
| EPA13 | Identify system failures and contribute to a culture of safety |

### Mapping rules (apply these, transparently)

- Every **disease topic page** → `EPA1`, `EPA2`.
- **Safety / emergency** page (suicide, violence, agitation, delirium, catatonia, toxidromes,
  withdrawal) → add `EPA10`.
- **Capacity / consent / ethics** page → add `EPA11`.
- **Diagnostic-workup / labs / monitoring** page → add `EPA3`.
- **Treatment / pharmacology / protocol** page → add `EPA4`.
- **Documentation & oral-presentation** page → `EPA5`, `EPA6`.
- **Interview / MSE** skill page → `EPA1`; **formulation / DDx** skill pages → `EPA2`.
- **Collateral / consult / handoff** page → add `EPA8`; **family / interprofessional** page → add `EPA9`.
- **Evidence / reading / journal** page → `EPA7`.

`epa[]` is a labeled *teaching default*, not an attested assignment — it is faculty-reviewable. The
idempotent `site_build/crosswalk_apply.py` encodes exactly these rules; for a bulk backfill prefer
running it, for a single entry apply the rules by hand and validate.

Worked examples (from live entries): `delirium.md` → `EPA1,EPA2,EPA3,EPA10` (disease + workup +
emergency). `agitation.md` → `EPA2,EPA4,EPA10` (safety, treat-the-driver, emergency).
`t_mood.md` → `EPA1,EPA2,EPA4` (disease + pharmacology). `pg_interview.md` → `EPA1` (interview skill).

---

## `workflowStages[]` — where the page sits in the clinical arc (8 codes)

`encounter · diagnosis · safety · treatment · communication · family · team · exam`

Order them roughly as they appear in the entry's own workflow. Most disease pages touch
`diagnosis, treatment, exam`; safety pages add `safety, team`; anything with a family overlay adds
`family`; anything with a `communicationCases` link adds `communication`.

---

## `clinicalWorkflow` keys — the bedside card (8 keys)

`ask · mse · safety · say · collateral · rounds · exam · actions`

- `ask` — what to ask the patient.
- `mse` — what to track on exam.
- `safety` — the safety formulation / escalation.
- `say` — a one-line, patient-facing sentence in plain language (quotable).
- `collateral` — what to ask family/staff.
- `rounds` — how to present it on rounds.
- `exam` — the shelf/COMAT test-taking point.
- `actions` — a list of `{label, href}` buttons (hrefs are cross-refs → must resolve; see invariants).

All keys are optional and all values are strings except `actions` (a list of objects). No other keys
are allowed — an unknown key fails the validator.

---

## `safetyLevel` (3) and `facultyReview.status` (4)

- `safetyLevel`: `low` · `moderate` · `high`. Only set it on pages where clinical risk is a live
  concern. `high` triggers the governance bundle (see invariants).
- `facultyReview.status`: `draft` · `pending` · `reviewed` · `retired`. **You may set `draft` or
  `pending`. Never set `reviewed`** — that is a human attestation. **Never fabricate
  `lastReviewed`** — the date is the sign-off. You *may* pre-fill `reviewer` with the author's own
  name; a name without a date asserts nothing.

---

## `workflowModes[]` — soft display tags (not enum-validated)

Free-ish strings the renderer uses for filter chips; not checked against a closed set, but stay
consistent with existing usage: `ward · safety · family · 5min · shelf`. Match siblings; don't
invent new modes without reason.
