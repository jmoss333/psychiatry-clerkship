# Codex Spec — Vignette Shelf/COMAT Qbank for the MS3 Psychiatry Hub

*Goal: author an original, NBME/COMAT-style **clinical vignette** question bank (~220 items) that drops straight into the live **Active Recall** engine. This closes the one competitive gap both audits named (a vignette Qbank, à la UWorld/AMBOSS) without copying anyone's items. The exam these students sit is the **NBOME COMAT Clinical Psychiatry** ([blueprint](https://www.nbome.org/assessments/comat/clinical-subject-exams/comat-clinical-psychiatry/)), which also overlaps the NBME psychiatry shelf.*

## What to produce
One file **`qbank.json`** — an object `{ "decks": [ <deck>, … ] }`, where each deck is a topic group of vignette questions in **exactly** the existing engine schema (so it merges into `tools/quizzes.json` with no engine change):

```json
{
  "id": "SHELF-MOOD",
  "title": "Shelf — Mood Disorders",
  "topic": "Mood",
  "questions": [
    {
      "q": "A 26-year-old woman is admitted after 5 days of decreased need for sleep, rapid speech, increased spending, and a belief that she has been chosen to reform the hospital. She has had two prior depressive episodes treated with sertraline. On exam she is irritable with pressured speech and flight of ideas. Which of the following is the most appropriate next step?",
      "o": [
        {"t":"Continue sertraline and add CBT","c":false,"fb":"Antidepressant monotherapy can sustain or worsen mania; priority is to stop it and start an antimanic agent."},
        {"t":"Discontinue sertraline and start a mood stabilizer or second-generation antipsychotic","c":true,"fb":"Correct — acute mania (bipolar I): stop the antidepressant, begin lithium/valproate or an SGA, and protect sleep."},
        {"t":"Start fluoxetine for treatment-resistant depression","c":false,"fb":"The presentation is mania, not depression; an antidepressant is contraindicated."},
        {"t":"Obtain brain MRI before any treatment","c":false,"fb":"Classic mania with prior mood episodes does not require imaging before treatment; don't delay antimanic therapy."},
        {"t":"Begin lorazepam monotherapy","c":false,"fb":"A benzodiazepine is adjunctive for agitation/sleep but does not treat the manic episode."}
      ],
      "tp": "Acute mania: stop the antidepressant, start a mood stabilizer or SGA, protect sleep.",
      "obj": "Mood — management (EPA 2,4)",
      "diff": "easy",
      "ref": "t_mood.md"
    }
  ]
}
```

**Required per question:** `q` (the full vignette + lead-in), `o` (4–5 options, each `{t, c, fb}`, **exactly one** `c:true`, `fb` on **every** option). **Optional but wanted:** `tp` (one-line teaching point shown after answering), `obj` (objective/blueprint + EPA tag), `diff` (`easy`/`med`/`hard`), `ref` (the hub page or tool this maps to, e.g. `t_mood.md`, `delirium.md`, `cssrs.html`). The engine ignores unknown fields today; Dr. Moss will wire `tp`/`ref` rendering + a difficulty filter after the bank lands.

## Blueprint & target counts (~234; deliver in topic batches so review is incremental)

| Deck id | Title | Target | Notes |
|---|---|---|---|
| SHELF-MOOD | Shelf — Mood Disorders | 30 | MDD, bipolar I/II, MDQ-before-antidepressant, MBC, ECT indications |
| SHELF-PSYCHOSIS | Shelf — Psychotic Disorders | 22 | schizophrenia spectrum, secondary causes incl. anti-NMDA, antipsychotic choice by SE profile, clozapine/TRS |
| SHELF-ANX | Shelf — Anxiety, OCD & Trauma | 26 | GAD/panic/social, OCD, PTSD; SSRI-first, ERP/CPT/PE |
| SHELF-SUD | Shelf — Substance Use & Withdrawal | 22 | CIWA/COWS, alcohol/opioid/benzo/stimulant, MAT, Wernicke (thiamine-before-glucose) |
| SHELF-PSYCHOPHARM | Shelf — Psychopharm & Med Emergencies | 26 | first-line choices, monitoring, **NMS vs serotonin syndrome**, lithium toxicity, EPS/akathisia, QTc, metabolic, anticholinergic, clozapine red flags |
| SHELF-NEUROCOG | Shelf — Delirium, Dementia, MCI | 16 | delirium-as-mimic, CAM, dementia types, capacity overlap |
| SHELF-PERSONALITY | Shelf — Personality Disorders | 12 | clusters, BPD management/splitting, DBT |
| SHELF-CHILD | Shelf — Child & Adolescent | 14 | ADHD, ASD, conduct/ODD, pediatric depression black-box, TADS |
| SHELF-GERI | Shelf — Geriatric | 8 | late-life depression, BPSD, avoid antipsychotics in dementia (CATIE-AD) |
| SHELF-PERINATAL | Shelf — Perinatal | 6 | PPD/postpartum psychosis emergency, med safety |
| SHELF-EATING | Shelf — Eating Disorders | 8 | AN/BN/BED, refeeding, medical complications |
| SHELF-SOMATIC | Shelf — Somatic & Related | 10 | somatic symptom, illness anxiety, functional neuro, factitious vs malingering |
| SHELF-EMERG | Shelf — Psychiatric Emergencies | 16 | suicide risk/C-SSRS, agitation/de-escalation, violence, **capacity & involuntary hold** |
| SHELF-INTERVIEW-ETHICS | Shelf — Interview, Ethics & Law | 12 | MSE, confidentiality/Tarasoff, consent, decision-making capacity |
| SHELF-SLEEP-SEX | Shelf — Sleep & Sexual | 6 | insomnia, SSRI sexual SE, parasomnias |

## Authoring rules (NBME/COMAT quality)
- **Single best answer.** 4–5 options, exactly one correct. Vignette stem with age/sex/setting + relevant HPI/exam/labs, then a focused lead-in ("most likely diagnosis," "best next step," "most appropriate pharmacotherapy," "most likely adverse effect").
- **Test reasoning, not recall.** Homogeneous, plausible distractors; no "all/none of the above," no absolute terms ("always/never"), no grammatical give-aways.
- **Per-option feedback is the teaching payload** — one crisp line on why each option is right/wrong. Add one `tp` per question.
- **Calibrate to MS3/COMAT level** and to this site's pitch — *recognize-and-escalate, first-line management*; do **not** require sub-specialist dosing.
- **COMAT/osteopathic flavor:** because this is a DO exam, a *small* number of items may incorporate the biopsychosocial/osteopathic frame; keep them clinically rigorous and tag `obj` with "OPP" so faculty can review those specifically. Do not invent OMM efficacy claims.
- **Consistency with the site:** align answers with the hub's teaching pages (e.g., screen for mania before antidepressants; thiamine before glucose; delirium-as-mimic; avoid antipsychotics until catatonia excluded). Set `ref` to the matching page/tool where natural.
- **Don't fabricate statistics or doses** — test the concept if unsure of an exact number.

## Copyright & safety (hard rules)
- **Write 100% original vignettes.** Do **not** copy, paraphrase closely, or reproduce items/answer-explanations from UWorld, AMBOSS, NBME, COMSAE/COMAT, or any commercial bank — that's infringement. Original clinical scenarios only.
- **No PHI** — fictional composites only.
- Where you cite guidance in feedback (APA, etc.), reference it generically; no need for formal citations.

## Delivery & validation
- Deliver `qbank.json` (`{decks:[...]}`), batchable by topic. Self-validate before handoff: valid JSON; each question exactly one `c:true`; 4–5 options; `fb` on every option; deck `id`s unique and within the blueprint; topic targets roughly met.
- Flag any item you're <90% confident is correct/current with `"diff":"review"` so faculty can spot-check it first.

## What Dr. Moss does after handoff (so you can design to it)
1. Merge `qbank.json` decks into `tools/quizzes.json` (bump `deckCount`/`questionCount`); the **`SHELF-*`** prefix keeps them grouped and deep-linkable (`active-recall.html?deck=SHELF-MOOD`).
2. Wire the engine to render `tp` (teaching point) and a `ref` "Learn more →" link after answering, plus a **difficulty filter** and a timed **"Shelf Mode"** (mixed-topic, blueprint-weighted).
3. Route the bank through **Review & Attest** for faculty sign-off before it's promoted from "practice" to "exam-ready."

*Joshua Moss, MD | Psychiatrist · Qbank handoff spec; original items only; educational; no PHI.*
