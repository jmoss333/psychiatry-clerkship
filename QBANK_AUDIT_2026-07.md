# Question Bank Audit — July 2026

**Scope:** Read-only dual-lens audit of the live 144-item `question_bank.json` (origin/main @ `2463dad`).
**Date:** 2026-07-05
**Method:** Every item read against its cited source page(s) and current standard of care by seven category-slice auditors, each applying two lenses:

- **Lens A — clinical safety/accuracy** (skeptical attending): wrong/non-best keyed answer, defensible distractor, unsafe oversimplification, evidence cite that doesn't support the claim, mischaracterized trap or tier-2 reasoning.
- **Lens B — NBME/COMAT technical flaws:** cueing/grammatical give-aways, non-homogeneous or implausible options, ambiguous/multiple-defensible answers, absolute terms, cover-the-options violations, difficulty miscalibration.

**Purpose:** Make Dr. Moss's attestation faster and safer. This report changes no items and does not touch `reviewed.json`.

---

## Summary counts

| Severity | Definition | Items |
|---|---|---|
| **P0** | Keyed/taught statement is factually wrong (a learner internalizes something false) | **2** |
| **P1** | Defensible alternative / ambiguous key / evidence cite unsupported / mischaracterized rationale | **10** |
| **P2** | Technical polish (cueing, homogeneity, wording, difficulty) | **41** |
| **Clean** | No flag | **91** |
| **Total** | | **144** |

53 of 144 items carry at least one flag. No P0 is an *immediate management-safety* error — the two P0s are factual-accuracy defects (an inverted mechanism in a keyed answer; a garbled physical-exam sign in a stem). Clinical management content across the bank (thiamine-before-glucose, COWS 8–12 buprenorphine induction, symptom-triggered CIWA benzodiazepines, NMS/clozapine monitoring, benzo-in-delirium caution with correct exceptions, SPI over no-suicide contracts, de-escalation before medication) is current and correct throughout.

---

## P0 — Fix before attestation (factually wrong content)

**`qb_sud_014` — tier-2 keyed answer inverts the GABA-A mechanism.** (Lens A)
The keyed tier-2 option C reads *"Alcohol **upregulates** GABA-A receptors with chronic use — abrupt cessation removes GABAergic suppression…"* This is backwards: chronic alcohol **down**regulates GABA-A and up-regulates NMDA/glutamate. The clause is internally inconsistent (if GABA-A were upregulated, cessation would not *remove* GABAergic suppression) and contradicts the item's own `why`, which correctly says the brain "downregulates GABA receptors." A learner studying the keyed rationale internalizes an inverted mechanism.
*Fix:* Change "upregulates" → "downregulates GABA-A receptors with chronic use," so the option matches the correct kindling/hyperexcitability mechanism and the item's own explanation.

**`qb_otherdx_005` — stem describes the Hoover sign incorrectly.** (Lens A)
The stem says *"When the examiner tests hip flexion strength on the right, the patient's hip flexes strongly in the contralateral direction consistent with the Hoover sign."* This is anatomically incoherent — Hoover is an **extension** sign: voluntary hip extension of the "paralyzed" leg is absent on direct testing but returns involuntarily when the patient flexes the *contralateral* hip against resistance. The keyed diagnostic concept (functional neurological disorder is a rule-in diagnosis) is correct, but a learner memorizes a false exam maneuver from the stem.
*Fix:* Rewrite the finding as "voluntary right hip extension is absent, but strong involuntary right hip extension is felt when she flexes the left hip against resistance (positive Hoover sign)."

> Both were rated P1 by the slice auditors and elevated here on review, because in each case the *taught* statement (a keyed answer; a stem fact) is itself false rather than merely ambiguous.

---

## P1 — Resolve before attestation (ambiguous key / unsupported cite / wrong rationale)

### Multiple-defensible-answer items (single-best-answer violation)

**`qb_cdev_003`** (Lens B) — Options C and D state essentially the same correct reasoning (ADHD is chronic/cross-situational vs episodic mania → evaluate for a first manic episode, don't intensify the stimulant). C's own trap note admits *"This is the correct reasoning — check key D,"* and the rationale defends D only as "more complete." A student cannot defensibly pick D over C.
*Fix:* Rewrite C into a genuinely wrong option (e.g., attribute the episode to a stimulant side effect or to normal adolescent variation) so only D is defensible.

**`qb_per_004`** (Lens B) — Options C and D both correctly name and define diagnostic overshadowing as the cardinal error; the trap is literally named "Correct description, but wrong key." This tests reading vigilance, not knowledge.
*Fix:* Replace C with a genuinely incorrect option (e.g., "her symptoms are best understood as BPD mood lability, which can fully account for sustained anhedonia and neurovegetative signs").

**`qb_anx_012`** (Lens B) — Option B assigns the PE and CPT descriptions **correctly** ("PE = imaginal/in-vivo exposure; CPT = challenging stuck points"), making it clinically indistinguishable from keyed C. The trap name claims the descriptions are "swapped" (they are not), and the note tells the reader to "check the stem's option C" — a meta-reference no exam item can contain.
*Fix:* Actually swap the labels in B (describe PE as stuck-point work, CPT as exposure), rewrite the trap note to match, and delete the meta-reference.

**`qb_eth_004`** (Lens B) — Options B and D are both fully correct statements of the capacity/competence distinction (B even specifies "for a specific decision at a specific time"). B's own trap note concedes "the descriptions are correct here." Choosing the "better" of two true statements is ambiguous.
*Fix:* Introduce a real error into B (e.g., attribute competence determination to a physician, or drop the decision-specific element) so only D is defensible.

### Evidence/rationale not supported by the cited source

**`qb_psy_001`** (Lens A) — The `evidence` field claims the source lists "medication causes including corticosteroids," but `t_psychosis.md` never mentions corticosteroids or medication-induced psychosis (only substance-induced: stimulants, cannabis, hallucinogens, withdrawal). The steroid-psychosis vignette is clinically sound but unsupported by the cited page.
*Fix:* Add corticosteroids to the source page's mimics list, or reword the `evidence` field to quote only what the page states and rest the steroid specifics on the general "exclude secondary causes" principle.

**`qb_sud_013`** (Lens A) — The keyed answer (lorazepam/oxazepam preferred in cirrhosis via preserved glucuronidation) is clinically correct, but the cited `t_sud.md` contains none of this pharmacology — the `evidence` field itself admits it is only an "[Anchor: general principle…]." The tested distinction is not on the page.
*Fix:* Add the LOT-drug/hepatic-metabolism content to the cited source page, or cite a pharmacology reference that actually supports the key.

**`qb_rel_004`** (Lens A) — The keyed option conflates two citations: "led 11 models for 12-month relapse prevention" is Rodolico et al. (Lancet Psychiatry 2022, 90 RCTs), while "NNT 7" belongs to Pharoah (Cochrane 2010, 53 RCTs). As written it attributes the network-meta-analysis finding to the wrong study.
*Fix:* Split the attribution in the option text ("led 11 models — Rodolico 2022; NNT 7 — Pharoah, Cochrane 2010").

**`qb_rel_005`** (Lens A) — The keyed MI option ("What would it take to get you to a 9 or 10?") does not match the technique the item's own `why`/evidence teach — the source's readiness-ruler moves are "You said 4 — why not a 2?" and "What would move you from a 4 to a 6?". A leap from 4 to 9–10 risks evoking sustain talk, so the rationale doesn't support the key.
*Fix:* Reword the keyed option to "You said 4 — why not a 2?" (or "what would move you from a 4 to a 6?") to match the source.

### Mischaracterized rationale (teaches a false point in a distractor note)

**`qb_psy_011`** (Lens A) — The trap note for option C invents a DSM criterion — "Brief psychotic disorder requires intact consciousness between episodes." No such criterion exists (and brief psychotic disorder has no "episodes" structure); the real exclusion is that the disturbance is better explained by delirium/another medical condition. A learner memorizes a fake criterion.
*Fix:* Rewrite the note: brief psychotic disorder cannot be diagnosed when the disturbance is better explained by delirium or a medical condition — the fluctuating consciousness here points to delirium.

### Safety framing gap

**`qb_saf_011`** (Lens A) — The keyed answer has a lone student initiate solo verbal engagement with a hostile, door-slamming manic patient with no mention of alerting staff, while the cited page's own pearls say "call for help early" and cast the student's role as observing de-escalation. No option pairs calm engagement with summoning support, so the safest real-world action isn't offered.
*Fix:* Add "while signaling a staff member to join you" to the keyed option and note it in the `why`.

---

## P2 — Technical polish (41 items)

### Cross-cutting pattern A — key-length / hedging cueing (the dominant defect)

In roughly a third of the bank, the keyed option restates the source pearl in full (embedding the mechanism and rationale) while the three distractors are terse one-liners, letting a test-wise student pick the longest/most-qualified option without content knowledge. **Recommended bank-wide pass:** trim keyed options to the bare decision and relocate embedded reasoning into the `why` field; lengthen/qualify at least one distractor per item to homogenize.

Items where this is the primary flag: `qb_pha_009`, `qb_mood_008`, `qb_mood_009`, `qb_mood_011`, `qb_mood_012`, `qb_cog_003`, `qb_cog_004`, `qb_psy_004`, `qb_psy_012`, `qb_psy_013`, `qb_per_002`, `qb_anx_004`, `qb_anx_005`, `qb_anx_009`, `qb_anx_010`, `qb_otherdx_007`, `qb_otherdx_009`, `qb_sud_012`, `qb_rel_009`. (Also present but secondary in `qb_mood_003`, `qb_saf_001`, `qb_saf_006`, `qb_rel_003`, `qb_rel_011`.)

### Cross-cutting pattern B — near-duplicate item pairs

The `_build/ms3/content/t_*.md` pages are verbatim copies of the `03_Core_Topics` teaching pages; different authoring waves generated near-identical items from each copy. Duplicate pairs (retire one, or re-angle from recognition → management):

| Pair | Shared teaching point |
|---|---|
| `qb_mood_001` / `qb_mood_003` | Screen for prior mania before starting an antidepressant |
| `qb_psy_002` / `qb_psy_008` | NMS → stop antipsychotic, supportive care |
| `qb_per_001` / `qb_per_006` | Splitting / team consistency |
| `qb_anx_001` / `qb_anx_003` | Akathisia mislabeled as agitation |
| `qb_oth_001` / `qb_otherdx_001` | Refeeding syndrome (falling phosphate) |
| `qb_oth_002` / `qb_otherdx_003` | Postpartum psychosis lucid interval |
| `qb_cog_001` / `qb_cog_008` | Hypoactive delirium mislabeled depression |
| `qb_cog_002` / `qb_cog_013` | Catatonia screen before haloperidol |
| `qb_saf_002` / `qb_saf_011` | Agitation de-escalation ladder |

(`qb_mood_002` / `qb_mood_012` both cover NSAID–lithium toxicity — acceptable acute-vs-early split, noted only.)

### Individual technical flaws

- **`qb_pha_008`** (B) — Non-homogeneous set: A/B/C are management actions, keyed D is the lone "explanation" option and the longest. *Fix:* recast D as a parallel management choice ("Continue sertraline and reassess in several weeks, counseling delayed onset…").
- **`qb_pha_012`** (B) — Difficulty 3 but is straightforward SS-vs-NMS pattern recognition with conflation distractors → functionally difficulty 2. *Fix:* recalibrate to 2, or add a genuine discriminator.
- **`qb_cog_005`** (A) — Keyed A calls the Lewy-body constellation "the **pathognomonic** tetrad"; these are McKeith **core** features, not pathognomonic, and the source omits the word. *Fix:* "characteristic core-feature tetrad."
- **`qb_psy_002`** (B) — Difficulty 3 but hands the full NMS triad + critically elevated CK → difficulty 1; near-duplicate of `qb_psy_008`. *Fix:* recalibrate and/or withhold the CK to test SS/catatonia discrimination.
- **`qb_psy_005`** (A) — Distractor C says "CATIE found haloperidol superior to all second-generation agents" — haloperidol was **not** in CATIE (the FGA comparator was perphenazine). *Fix:* replace "haloperidol" with "perphenazine."
- **`qb_psy_007`** (B) — Distractor B references "the residual negative symptoms," which the stem never establishes. *Fix:* add negative symptoms to the stem or reword B to "residual symptoms."
- **`qb_psy_014`** (A) — Trap note for B argues risperidone 4 mg/day "may not meet the dose threshold"; 4 mg × 6 weeks is generally an adequate trial — the real error is that one failed trial ≠ treatment resistance. *Fix:* rewrite the note to the two-adequate-trials rule.
- **`qb_per_002`** (B) — Option A reads "scheduled lorazepam PRN" (scheduled and PRN are contradictory); option C references "her current antidepressant," never stated in the stem. *Fix:* pick "scheduled" or "PRN," and add an SSRI to the stem or reword C.
- **`qb_per_005`** (A) — Key/pearl state benzodiazepines "should not be started" in BPD as an unscoped absolute; a learner could over-generalize to a BPD patient with catatonia or alcohol withdrawal. *Fix:* scope to "for BPD symptoms or crisis distress."
- **`qb_mood_011`** (A) — Keyed A endorses "lithium, valproate, or an SGA" for a 28-year-old woman, and "She is not pregnant" invites the inference that valproate is fine — but the source stresses avoiding valproate in anyone of childbearing potential regardless of current pregnancy status. *Fix:* make the patient male, or add the valproate/childbearing caveat.
- **`qb_mood_003`** (B) — Substantive duplicate of `qb_mood_001` (see pattern B) plus key-length cueing on a difficulty-1 item. *Fix:* retire or re-anchor to a distinct teaching point (its own distractor D — that a structured instrument is not required).
- **`qb_anx_007`** (B) — Lead-in "Which diagnosis should be reconsidered?" is answered by interpretive statements, not diagnoses; keyed reasoning rests on "ego-dystonic"/"recognizes them as excessive," which the stem never establishes. *Fix:* change the lead-in to "most accurate interpretation" and add a stem sentence establishing insight.
- **`qb_otherdx_002`** (B) — Distractor D (malingering) is implausible (no external incentive; self-refuting logic) → functionally three options. *Fix:* replace with purging disorder or ARFID.
- **`qb_otherdx_003`** (B) — Grammatical slip in keyed C ("…and the lucid interval **do** not provide reassurance"). *Fix:* subject-verb agreement, plus dedupe vs `qb_oth_002`.
- **`qb_sud_011`** (B) — Stem reads "**An** 19-year-old man." *Fix:* "A 19-year-old man."
- **`qb_saf_001`** (B) — Difficulty 3 but sudden brightening after severe suicidality is a classic MS3 point with transparently wrong distractors. *Fix:* re-rate to 1–2 or harden distractors.
- **`qb_saf_006`** (B) — Non-homogeneous: A/B/C are quoted example notes, D is a meta-statement about verbatim quotes. *Fix:* rewrite D as a fourth quoted example.
- **`qb_saf_008`** (B) — Distractor B is near-defensible; the item hinges entirely on the single word "independently." *Fix:* sharpen B's flaw so the boundary violation is unambiguous.
- **`qb_saf_012`** (B) — All three tier-2 distractors use absolutes, leaving the nuanced C as the only non-absolute option. *Fix:* soften one distractor into a plausible partial truth.
- **`qb_rel_003`** (B) — Keyed option asserts "You've ended up here twice this year," a fact not in the stem (imported from source dialogue). *Fix:* add the second admission to the stem or drop the clause.
- **`qb_rel_011`** (B) — Distractor C ("complete a punitive documentation record and involve security") is a non-functional caricature. *Fix:* replace with a plausible option (e.g., 1:1 observation + privilege restriction pending review).

### Metadata note (not itemized above)

Trap-name taxonomy is occasionally recycled onto mismatched mechanisms (e.g., `qb_saf_004` option B, `qb_saf_005` option D carry labels that don't describe the error their notes correctly explain). Low priority — worth a metadata pass only if the trap names surface in learner-facing feedback.

---

## Recommended attestation order

1. **Two P0 factual fixes** — `qb_sud_014` (one-word mechanism flip), `qb_otherdx_005` (rewrite the Hoover-sign sentence). Fast and unambiguous.
2. **Ten P1s** — the four "two-correct-answer" items (`qb_cdev_003`, `qb_per_004`, `qb_anx_012`, `qb_eth_004`) share one design anti-pattern (a distractor that restates the correct concept, often with a "check the key" meta-note); fixing them is mechanical. Then the four cite/rationale items and the two remaining (`qb_rel_005` MI wording, `qb_saf_011` safety framing).
3. **P2s** — run the two cross-cutting passes first (key-length homogenization; duplicate-pair dedupe), which resolve the bulk of the 41; then the ~20 individual wording/difficulty fixes.

*Audit performed read-only. No items and no `reviewed.json` were modified.*
