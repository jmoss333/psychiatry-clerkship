# Item-Writing & Review Rubric — Shelf/COMAT Dual-Exam Bank

> Companion to `01_BLUEPRINT_CROSSWALK.md` (what to cover) and `02_ITEM_SCHEMA.json` (shape).
> Inherits the repo's `QUESTION_BANK_STANDARD.md` wholesale and **extends** it with the
> external-evidence and dual-exam disciplines the initiative brief adds. Where this rubric and
> the repo standard agree, the repo standard governs (back-portability). Where the brief adds a
> stricter requirement (external verification, dual tagging, richer explanation fields), this
> rubric governs for this bank.

---

## A. Item-writing standard (NBME Item-Writing Guide 6th ed. principles + repo standard)

Every item must:

1. **Assess one meaningful clinical decision** — nameable in `tested_decision`. If you can't
   name the single decision, the item is unfocused.
2. **Be answerable with the options covered** — the vignette + `lead_in` force the answer.
   (Relational adaptation: the *function* of the best response must be pre-statable.)
3. **Have exactly one defensible best answer** — the other three are worse *for a reason a cited
   source states*. If faculty could defend a second option, fix or kill it. (This is the
   single most common defect in the existing bank's audit — guard it hardest.)
4. **Use a vignette stem** — age, setting, timeline, findings, in that rough order; first
   sentence orients. No stemless recall, no pseudo-vignette decoration.
5. **Positive, focused lead-in** — "Most likely diagnosis?", "Best next step?", "Most
   appropriate initial treatment?", "Most likely mechanism?" Never NOT/EXCEPT/FALSE, never
   "Which is true about…".
6. **Precise lead-in verbs** — distinguish *most likely diagnosis* vs *best next step* vs *most
   appropriate treatment* vs *underlying mechanism*. Mismatched lead-in and options is a flaw.
7. **Homogeneous options** — four of the same kind (four diagnoses, four next steps, four
   utterances). Parallel grammar, comparable length. **The correct answer must not be the
   longest, most hedged, or most qualified** — the dominant P2 defect in the current bank.
8. **Plausible, discriminating distractors** — every wrong option is a real MS3 misconception,
   tagged in `trap` and explained in `explanation_for_each_distractor`. An option no one would
   pick is a wasted slot.
9. **No gratuitous trickery** — no double negatives, no "all/none of the above," no absolutes
   ("always/never"), no grammatical cueing, no unnecessary lab data. Include a datum only if the
   decision needs it.
10. **Enough to distinguish without making it comic** — provide the discriminator; don't hand
    the diagnosis in the first clause of a "difficulty 3" item.
11. **Application over recall** — diagnostic reasoning, treatment selection, adverse-effect
    recognition, next-step decisions. Not "which study showed X," not attending-level titration,
    not zebra trivia.
12. **No dose questions** unless dosing itself is the justified `learning_objective`.
13. **Student acts under supervision** — the correct answer never has the student independently
    discharge, clear, prescribe, or decide disposition. Escalation bias on safety content.
14. **Respectful, humane portrayal** (§C).

## B. Evidence standard (the brief's addition to the repo)

The repo bank grounds only in library pages and forbids outside citations. **This bank
additionally requires external authoritative verification** — because a board-aligned bank must
be defensible against the current standard of care, not only against the library.

1. **Verify every keyed answer against a current authoritative source** before finalizing.
   Priority order: official guidelines (APA, AACAP, VA/DoD, ASAM, ACOG for perinatal) →
   primary professional-society statements → FDA labeling → major consensus statements →
   high-quality systematic reviews → DSM-5-TR for diagnostic criteria.
2. **Never fabricate a reference** — no invented PMID, DOI, journal, year, or title. If a
   claim cannot be sourced, mark the item `faculty_review_flags: ["unanchored-claim"]` and set
   the reference `verified: false`. A missing anchor is a faculty note, never an invention.
3. **Every `references[]` entry** carries a full `citation` and, where applicable, a real
   `url`/`doi`/`pmid` plus `access_date`. Landmark-trial and specific-statistic citations must
   have their identifier **verified** during authoring (`verified: true`).
4. **Model memory is never the sole source** for a clinically consequential claim.
5. **Keep library grounding too** — populate `pages`/`related_lesson_paths` when a library page
   teaches the same point, so items stay back-portable and continue the learning path. `evidence`
   states the anchor; `references[]` proves it.
6. **Flag conflicting or rapidly changing guidance** with `faculty_review_flags:
   ["evidence-conflict"]` and a one-line note in the reference.
7. **Higher-intensity review** (`faculty_review_flags`) is mandatory for any item touching:
   `medication`, `pregnancy`, `emergency`, `legal-jurisdiction`, `pediatric`. Legal content is
   marked `legal-jurisdiction` and kept jurisdiction-neutral (no legal absolutes the source
   hedges).

## C. Respectful-language & bias standard

1. Person-first, non-stigmatizing language ("a person with schizophrenia," not "a schizophrenic";
   "died by suicide," not "committed suicide"; "use disorder," not "abuser").
2. No sensationalized or deterministic portrayal of psychiatric illness. Patients have goals,
   relationships, strengths, and uncertainty — show at least one where the vignette allows.
3. **Demographics only when clinically relevant.** Do not use race, gender identity, trauma
   history, homelessness, or substance use as a superficial diagnostic shortcut. If a
   demographic detail is in the stem, it must change the correct reasoning.
4. Safety content (suicide, self-harm, violence) models sound risk-assessment language, frames
   around recognition/escalation/safety-planning, and **omits method detail**. Add
   `content_warning` where warranted.
5. Fictional composites only. No real patients, names, MRNs, dates, or identifiable specifics —
   even if a real case inspired the teaching point.

## D. Dual-exam tagging discipline

1. Every item carries `blueprint.nbme` (system, physician_task, site_of_care, patient_age) and
   `blueprint.comat` (presentation, physician_task). These are inherited from the crosswalk row
   for the item's `category` but must be **verified against the individual item** (a `mood` item
   set in the ED with a management decision tags site=ED, task=Management, not the cluster default).
2. `exam_alignment`: `both` unless the item genuinely leans one exam. Mark `shelf` for
   NBME-flavored framing (adverse-effect ID, ambulatory next-step, foundational-science
   mechanism) and `comat` for COMAT-flavored framing (holistic/osteopathic, health-care-delivery,
   DO-relevant presentation). Put the reason in `exam_emphasis_note`.
3. **Osteopathic integration is opt-in, never forced.** Add `blueprint.osteopathic_competency`
   and `faculty_review_flags: ["osteopathic-content"]` only where holistic assessment, social
   determinants, mind-body integration, or (rarely) OMM is *clinically real*. Do not bolt OMT
   onto a scenario where it is artificial.
4. **Protect the NBME site/age/task distributions** at the batch level (crosswalk §6), regardless
   of the inpatient clerkship. Ambulatory is the default setting; inpatient is rationed.

---

## E. Production workflow — batches of 24, five review passes

For each 24-item batch:

**Pass 0 — Draft to fill specific blueprint cells.** Take open cells from the crosswalk quota +
cross-cutting tables. Write distractors *first* as named misconceptions, then the key, then the
explanations, then tags, then verify evidence.

**Pass 1 — Independent clinical-accuracy review** (skeptical attending lens).
- Keyed answer is the current best answer; no better option exists.
- No factually wrong statement in stem, key, distractor notes, or tier-2 rationale.
- `evidence` + `references[]` actually support the claim; identifiers verified.
- Safety items: conservative, supervision-seeking key; no method detail.
- Revise failures in place; do not merely list them.

**Pass 2 — Item-writing / psychometric review** (NBME technical lens).
- Cover-the-options holds; positive focused lead-in; homogeneous parallel options.
- **Key is not the longest/most-hedged option** (measure it).
- No absolutes, no all/none, no grammatical cue, no meta-references ("check option C").
- One defensible answer (no two-correct-answer trap).
- `intended_difficulty` matches actual discrimination load (not obscurity).

**Pass 3 — Respectful-language & bias review** (§C). Person-first; demographics earn their place;
humane portrayal; content warnings set.

**Pass 4 — Duplicate / template review.**
- No duplicate concept, vignette template, answer phrasing, or distractor pattern *within* the
  batch.
- **Cross-check against the existing 192-item `question_bank.json`** — a new item must not
  restate an attested item's central discrimination. Log every near-neighbor in the concept index.

**Pass 5 — Batch reconciliation.**
- Correct-key positions balanced A–D (no positional tell in authored keys).
- Difficulty ≈ 25/55/20; type mix on pace; site/age/task distributions within crosswalk bands.
- Update `05_coverage_dashboard.json` and `10_CONTINUATION_MANIFEST`.

**Do not claim measured difficulty or discrimination** before student-response data exist. Use
`intended_difficulty` only.

---

## F. Per-item pre-commit self-check (every item)

- [ ] Vignette stem, positive lead-in, answerable covered; `tested_decision` nameable.
- [ ] Exactly 4 options, one `c:true`, `correct_option` matches; homogeneous, parallel, no
      absolutes/all-none; **key not the longest**.
- [ ] Every distractor has `trap` + an `explanation_for_each_distractor` entry; each is a real
      MS3 error.
- [ ] One defensible best answer for a reason a cited source states.
- [ ] `why` names traps + discriminator; `complete_correct_answer_explanation`,
      `key_takeaway`/`pearl`, `common_reasoning_error` present; `management_or_safety_caveat`
      where relevant.
- [ ] `references[]` ≥1, real identifiers, `access_date` set, `reference_access_date` set;
      consequential identifiers `verified: true`.
- [ ] `blueprint.nbme` + `blueprint.comat` verified against *this* item; `exam_alignment` set.
- [ ] `faculty_review_flags` set for medication/pregnancy/emergency/legal/pediatric/osteopathic.
- [ ] Safety content conservative + supervision-seeking; no method detail; `content_warning` if
      warranted.
- [ ] Original — resembles no real exam/commercial item; `status: "draft"`.
- [ ] JSON validates against `02_ITEM_SCHEMA.json`.

---

## G. Trap vocabulary (inherited from the repo, extend never dilute)

Reuse the repo's `QUESTION_BANK_EXECUTION_BRIEF.md` trap names verbatim so the "you fell for X n
times" analytics stay consistent (e.g., *Denies SI = low risk*, *Sudden improvement = recovery*,
*The righting reflex*, *Quoting statistics at families*, *Agitation = antipsychotic*, *The
reflexive benzodiazepine*, *Refusal = no capacity*, *Confused elder = dementia*, *Hypoactive
delirium labeled depression*, *Newer = better*, *Prescribe before deprescribe*). Coin a new name
only for a real, recurring misconception; record new names in the batch handoff.
