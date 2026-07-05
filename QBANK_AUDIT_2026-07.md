# QBANK_AUDIT_2026-07 — clinical + item-writing audit of `question_bank.json`

> **Read-only audit. No items were edited; `reviewed.json` untouched.** Produced 2026-07-05 on
> branch `audit/qbank-2026-07` (off `origin/main` @ `2463dad`). Purpose: make Dr. Moss's
> attestation faster and safer — attest against this flag list. All 144 items remain
> `status:"draft"`.

## Method

Two lenses in one pass over all 144 live items:
- **Lens A — clinical safety/accuracy** (skeptical attending): keyed answer vs source page *and*
  current standard of care; defensible distractors; unsafe oversimplification; evidence cites
  that don't support the claim; mischaracterized tier-2 reasons and traps. Uncertain clinical
  points were externally verified (cited inline).
- **Lens B — NBME/COMAT item-writing**: cueing/giveaways, non-homogeneous options, implausible
  distractors, ambiguous/multiple best answers, absolutes, negative lead-ins, cover-the-options,
  difficulty miscalibration.

Items were split into five category groups audited in parallel, each auditor reading every cited
source page in full. Every P0/P1 was re-verified by reading the raw item text against the page.

## Summary counts

| | Count | Items |
|---|---|---|
| **Total items** | 144 | |
| **Clean** (no item-specific finding) | **111** | (77%) |
| **Flagged** (≥1 item-specific finding) | **33** | (23%) |
| — P0 (patient-safety / clinically wrong) | **1** | qb_sud_014 |
| — P1 (defensible-alternative / ambiguous / miscited / misteaching) | **9** | 9 distinct items |
| — P2 (technical polish) | **23** | 23 distinct items (+ 2 items carry a 2nd P2) |
| **Systemic patterns** (bank-wide, reported once) | **4** | see §Systemic |

Distribution sanity (not defects): difficulty 37/82/25 across levels 1/2/3 (26% / 57% / 17% vs
25/55/20 target — slightly light on level-3); `hy` on 39/144 (27%, within the ≤⅓ cap); every
item has an evidence string and a deep link. **The headline is reassuring: one true clinical
error, and the P1s cluster into two fixable patterns.**

---

## P0 — patient-safety / clinically wrong (fix before attesting the item)

### qb_sud_014 — tier-2 keyed mechanism is inverted (alcohol-withdrawal seizures)
- **Lens A.** Two-tier item; tier-1 keyed answer (aggressive CIWA-guided benzo titration for a
  patient with a prior withdrawal seizure) is **correct**. The **tier-2 keyed option C is
  backwards**: *"Alcohol upregulates GABA-A receptors with chronic use — abrupt cessation removes
  GABAergic suppression."* Chronic alcohol **down**regulates GABA-A receptors (and upregulates
  NMDA/glutamate). The option even contradicts the item's own `why`, which correctly says *"the
  brain compensatory downregulates GABA receptors and upregulates glutamate receptors."*
- **Why it's P0.** A two-tier item exists to teach the mechanism; the keyed *reason* teaches the
  inverted direction of receptor adaptation. (Discrimination still "works" because the distractors
  are clearly wrong, so it won't misgrade — but it will misteach.)
- **Fix.** Reword option C to: *"Chronic alcohol use downregulates GABA-A receptors and
  upregulates NMDA/glutamate receptors — abrupt cessation leaves the already-reduced GABAergic
  brake unopposed by an overactive glutamatergic drive, producing hyperexcitability and seizures,"*
  aligning the option with its own explanation.
- **Verified:** item's own tier-2 `why`; Rogawski 2005 / GABAergic-signaling reviews — chronic
  ethanol → compensatory GABA-A downregulation + NMDA upregulation underlies withdrawal
  hyperexcitability.

---

## P1 — defensible alternative / ambiguous best answer / miscited / misteaching

### Pattern 1 — "twin-correct option" (4 items): a distractor is *actually correct*
These items have **two defensible correct options**, distinguished only by which is "more
complete." That violates single-best-answer and will be contested by strong students. In three
of the four, the **trap note openly admits it** ("Read carefully — the descriptions are correct
here"). Root-cause pattern for the drafting model to avoid in future waves: never build a
distractor that is true and then rely on the key being *more* true.

- **qb_eth_004** (capacity vs competence). Distractor **B** — *"Competence is a legal
  determination made by a court; capacity is a clinical determination made by a physician for a
  specific decision at a specific time — the two are distinct"* — is fully correct, including the
  decision-specific element the `why` claims only D has. **Fix:** make B genuinely wrong (e.g., B
  says capacity, once assessed, applies globally to all decisions).
- **qb_anx_012** (PE vs CPT for PTSD). Distractor **B** correctly assigns both labels (PE =
  exposure; CPT = challenging stuck points); the trap name *"PE and CPT descriptions swapped"* is
  false — they are **not** swapped, so the trap misteaches. **Fix:** actually swap B's
  descriptions, or write a new distractor.
- **qb_per_004** (diagnostic overshadowing in BPD). Distractor **C** correctly names and defines
  diagnostic overshadowing; trap note: *"Read carefully — this is the correct clinical reasoning."*
  **Fix:** make C wrong in substance.
- **qb_cdev_003** (ADHD baseline vs first manic episode). Distractor **C** is a complete correct
  answer; trap note: *"This is the correct reasoning — check key D."* **Fix:** make C conclude
  something wrong (e.g., treat as a stimulant side effect).

### Pattern 2 — clinical/citation accuracy (5 items)

- **qb_otherdx_009** (postpartum — **highest-priority P1**, safety-adjacent). Two-tier; tier-1
  keyed answer is correctly escalation-biased (EPDS misses psychosis — ask about
  delusions/hallucinations/mania) and the vignette genuinely depicts postpartum **OCD**. The flaw
  is the **tier-2 rationale's over-generalization**: *"command hallucinations … are ego-syntonic
  and acted upon."* Command-hallucination compliance is variable (~18–67%; many are resisted and
  distressing/ego-dystonic). Teaching "ego-dystonic + doesn't act ⇒ benign" could **falsely
  reassure** about a genuinely psychotic postpartum mother — exactly the scenario the page warns
  about. Not P0 (no keyed answer is wrong; the specific vignette *is* OCD), but fix the teaching.
  **Fix:** discriminate on phenomenology — intrusive *thought* vs perceived *voice*, reality
  testing, associated psychotic features — and drop the "ego-syntonic/acted upon" absolute; add
  that any perceptual experience mandates emergency psychosis evaluation. *(Verified: Junginger
  1990; Rudnick — compliance not definitional; the page never claims commands are ego-syntonic.)*
- **qb_otherdx_005** (functional neurological disorder). Keyed diagnosis (rule-in via Hoover sign)
  is correct, but the **stem describes the sign backwards / incoherently**: *"tests hip flexion
  strength on the right, the patient's hip flexes strongly in the contralateral direction."*
  Hoover's sign = weak voluntary **hip extension** of the affected leg that normalizes as
  involuntary extension when the patient flexes the **contralateral** hip against resistance.
  Teaches a wrong maneuver on students' likely first exposure. **Fix:** rewrite the exam sentence.
  *(Verified: Stone et al., J Psychosom Res 2011.)*
- **qb_eth_007** (Tarasoff / duty to protect). Keyed action (warn/protect) is correct and safe,
  but the **distractor trap notes state jurisdiction-variable law as national fact**: *"The
  Tarasoff duty does not require the threat to be imminent"* and *"There is no family exception."*
  Duty-to-warn/protect statutes vary by state (≈23 mandate; others permissive/silent; imminence
  language differs), and the source page itself hedges *"specifics vary by state."* Violates the
  house no-legal-absolutes rule. **Fix:** hedge the trap notes and add a state-law hedge to keyed
  option A (mirror qb_eth_002's "may include" phrasing). *(Verified: Johnson et al., JAAPL 2014.)*
- **qb_rel_004** (family psychoeducation). Keyed option **misattributes citations**: it credits
  *"led 11 models for 12-month relapse prevention, NNT 7"* to *"Pharoah, Cochrane 2010; 53 RCTs"* —
  but the "11 models / relapse" result is Rodolico et al., Lancet Psychiatry 2022 (90 RCTs); NNT 7
  is the Pharoah Cochrane figure. **Fix:** split the attribution. (Also carries a P2 lead-in flaw,
  below.) *(Verified against the source page's own two sentences.)*
- **qb_rel_005** (MI readiness ruler). Relational item; keyed utterance *"What would it take to
  get you to a 9 or 10?"* is still the best of the four options, but it **does not trace to the
  source page and contradicts the item's own evidence cite**, which quotes the page's taught
  moves: *"You said 4 — why not a 2?"* and *"What would move you from a 4 to a 6?"* Under the
  relational standard (the page is the answer key), and because the incremental move is the better
  MI technique, **fix:** replace A's utterance with one of the page's exact phrases so key,
  evidence, and pearl align.

---

## P2 — technical polish (attest as-is; queue for a cleanup pass)

Grouped by defect type. None affect the correctness or safety of the keyed answer.

**"Enemy" / near-duplicate pairs** (two items testing the same discrimination with the same
vignette skeleton — split across forms or they cue each other):
- qb_mood_003 ↔ qb_mood_001 (screen for mania before an SSRI)
- qb_mood_012 ↔ qb_mood_002 (lithium + NSAID toxicity)
- qb_psy_008 ↔ qb_psy_002 (NMS recognition; qb_psy_002 also mistagged difficulty 3 → should be 2)
- qb_cog_008 ↔ qb_cog_001 (hypoactive delirium)
- qb_cog_013 ↔ qb_cog_002 (screen catatonia before antipsychotic)
- qb_anx_003 ↔ qb_anx_001 (akathisia vs agitation)
- qb_per_006 ↔ qb_per_001 (splitting)
- *Fix:* retire one of each pair or re-scope the second to test management rather than recognition.

**Implausible distractor (functionally a 3-option item):**
- qb_anx_005 (benzo "acceptable in any patient… dependence only with chronic use")
- qb_cdev_002 (risperidone "first-line for all behaviors… started prophylactically")
- qb_rel_011 (option self-labels as "punitive")
- qb_otherdx_002 (malingering "because normal weight = fabrication")
- *Fix:* replace with a plausible middle option in each.

**Non-homogeneous options / lead-in–option mismatch:**
- qb_anx_007 (lead-in "which diagnosis should be reconsidered?" but an option *affirms* a dx)
- qb_otherdx_004 (lead-in asks for a "principle," option C asserts a competing diagnosis)
- qb_rel_004 (lead-in only the keyed option can satisfy — answerable by logic alone; see P1 above)
- *Fix:* neutralize the lead-in so all four options are candidate answers.

**Test-wiseness cue (hedged-correct / label / absolute giveaway):**
- qb_cog_005 (keyed option calls the DLB tetrad "pathognomonic" — absolute in the key; page says
  "features"; soften to "characteristic")
- qb_eth_006 (keyed option is the only hedged one; distractors carry "always"/"in all contexts")
- qb_otherdx_007 (keyed option uniquely hedged "may be ataque de nervios"; distractors declarative)
- qb_rel_003 (bracketed MI-technique labels on each option hand over the answer)
- *Fix:* make hedging/among-option phrasing parallel; strip technique labels.

**Wording / format:**
- qb_eth_005 (true negatively-worded lead-in — "which component has NOT yet been addressed?";
  recast positively)
- qb_per_002 (option "scheduled lorazepam PRN" — "scheduled" and "PRN" are mutually exclusive)
- qb_sud_011 (typo "An 19-year-old" → "A 19-year-old")
- qb_pha_011 (keyed option says "enrollment in the clozapine monitoring program"; the centralized
  REMS ended 2025 — the item's *own* pearl says so; reword to "ongoing ANC per prescribing info")
- qb_mood_011 (keyed acute-mania option lists valproate unqualified for a reproductive-age woman;
  page says "avoid valproate in anyone who could become pregnant" — add the caveat)

**Adjudicated, no action:** qb_saf_005 — pre-flag on the absolute "only" in the correct option;
the phrase is a verbatim page quote, clinically accurate, and all distractors also carry strong
terms, so it doesn't differentially cue. No change needed.

---

## Systemic patterns (bank-wide — one root-cause fix each, not 100 edits)

**S1 — Correct answer is the longest option in 135/144 items (94%; chance ≈ 25%).** This is the
single biggest test-wiseness vulnerability in the bank: a student who knows nothing can score well
above chance by "pick the longest, most-qualified option." Individually each item is only P2, but
the *pattern* is high-impact. **Fix (systemic):** a length-balancing pass — trim keyed options
and/or pad the best distractor so option lengths are comparable within each item; make this a hard
check in the drafting brief for all future waves.

**S2 — 44 items carry a source *basename* in `pages` instead of the deployed slug.** e.g.
`anxiety_trauma_ocd_inpatient_teaching.md` instead of `t_anxiety.md`. Affected: all
`qb_anx_*` (10), `qb_eth_003..008` (6), `qb_per_003..006` (4), `qb_cdev_*` (4), and 20 relational/
otherdx items. Clinically harmless, but it breaks any tooling that resolves `pages` → deployed
page (deep-link grounding, the Focus-next weak-spot mapper). **Fix (systemic):** one script pass
mapping basenames→slugs via the `md[]` table in `build_deploy.py`.

**S3 — Mixed id prefixes within two categories.** `childdev` uses both `qb_cdev_*` and `qb_chd_*`;
`otherdx` uses both `qb_oth_*` and `qb_otherdx_*`. Ids are stable identities (SRS cards, responses,
attestation) — inconsistent prefixes invite keying mistakes. **Fix:** pick one prefix per category
and note the alias (do **not** silently renumber attested items later).

**S4 — "Twin-correct" distractor construction** (the 4 Pattern-1 P1s). Contained to those four
items (a bank-wide scan for the tell-tale trap phrasing found no others hiding), but worth a rule
in the drafting brief: a distractor must be *false*, never "true but less complete than the key."

---

## Top P0/P1s for Dr. Moss (attestation order)

1. **qb_sud_014 (P0)** — fix the inverted GABA-A up/downregulation in the tier-2 key before
   attesting.
2. **qb_otherdx_009 (P1, safety-adjacent)** — correct the "command hallucinations are ego-syntonic
   and acted upon" overgeneralization so it can't falsely reassure in postpartum psychosis.
3. **qb_eth_007 (P1)** — hedge the Tarasoff no-imminence / no-family legal absolutes to state law.
4. **The four twin-correct items (qb_eth_004, qb_anx_012, qb_per_004, qb_cdev_003)** — each needs
   its "true" distractor made false; they are the items most likely to draw a student challenge.
5. **qb_otherdx_005 (P1)** — fix the backwards Hoover-sign description in the stem.
6. **qb_rel_004 / qb_rel_005 (P1)** — fix the citation misattribution and align the MI keyed
   utterance with the page it cites.

Everything else is P2 polish that can be attested as-is and cleaned up in a batch. 111 of 144
items carry no item-specific finding.
