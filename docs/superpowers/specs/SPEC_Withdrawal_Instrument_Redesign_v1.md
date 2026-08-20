# Withdrawal Instrument Redesign — Drop-In Content Spec v1

**For:** `03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html`
**Companion to:** `Clinical_and_Instrument_Review_2026-08-20.md`
**Status:** authoring spec — every anchor below must be **verified against the primary instrument** before it ships (see §0.3). Nothing here is a dose.

---

## 0. Design contract

### 0.1 The frame that changed

You built a **calculator** and dressed it as a **scale**. In a calculator, anchors are decoration — so they got compressed to fit the layout. In a rating instrument, **the anchors and the elicitation *are* the instrument** and the total is a byproduct.

The tell is in the code: `CIWA_GAUGE={track:30}` announces *"Score 12 of 30"* while the header says max 67. That was filed as an accessibility defect. It is actually a confession — the tool's mental model is a progress bar toward a maximum, which is not what an ordinal symptom index is.

Fix the frame first, or you will build a longer calculator.

### 0.2 The four-line item pattern

This is the generalizable pattern. It replaces the current single two-pole string, it fits on a phone, and it is the shape every future instrument in this library should inherit (BFCRS, any delirium instrument, anything new).

```
┌────────────────────────────────────────────────────────┐
│ 4 · ANXIETY                                    [ASKED] │  ← Line 1: OBSERVED or ASKED tag
├────────────────────────────────────────────────────────┤
│ Ask: "Do you feel nervous?"                            │  ← Line 2: elicitation, VERBATIM, always on screen
├────────────────────────────────────────────────────────┤
│  0  no anxiety, at ease                                │  ← Line 3: three rungs — 0, MIDDLE, top
│  4  moderately anxious, or guarded, so anxiety is      │      (the middle rung is where the variance lives)
│     inferred                                           │
│  7  equivalent to acute panic states as seen in        │
│     severe delirium or acute schizophrenic reactions   │
│              [ see all 8 anchors ▾ ]                   │  ← full ladder one tap behind
├────────────────────────────────────────────────────────┤
│ ⚠ Anxiety, not akathisia. If the patient cannot sit    │  ← Line 4: exclusion / confound, inline
│   still because of an inner restlessness driving the   │
│   movement, that is akathisia — do not score it here.  │
└────────────────────────────────────────────────────────┘
```

**Why three rungs and not eight.** Nobody disagrees about 0 and 7. Every dollar of inter-rater value is at 3-versus-5. Shipping all eight anchors on ten items produces a wall of text a student will scroll past at 2 a.m. — trading an unusable card for an unread one. The full ladder stays one tap away for the learner who wants it, and the *middle rung is never behind the tap.*

**Why the tag matters.** CIWA-Ar mixes three **observed** items with seven **asked** ones, and nothing currently marks which is which. Reported-treated-as-observed is one of the top sources of rater drift, and this fixes it with two words.

**Why the elicitation is non-negotiable.** Paraphrasing the stem is the second-largest source of drift. *"You feeling anxious?"* and *"Do you feel nervous?"* pull different answers from a guarded patient. And for observed items the manoeuvre is the item: if you did not extend the arms and spread the fingers, you did not rate tremor — you rated your impression.

### 0.3 Verification requirement before shipping

Every anchor string below is reproduced from the published instruments and must be **checked character-by-character against the primary source** by a second person before it goes into the build:

| Instrument | Primary source | Reproduction status |
|---|---|---|
| CIWA-Ar | Sullivan JT et al., *Br J Addict* 1989;84:1353–7 | Public / freely reproducible |
| COWS | Wesson DR, Ling W, *J Psychoactive Drugs* 2003;35:253–9 — NIDA/SAMHSA versions | Public domain |
| PAWSS | Maldonado JR et al., *Alcohol* 2014 / *Am J Drug Alcohol Abuse* 2015 | Verify reproduction terms |
| C-SSRS | Research Foundation for Mental Hygiene | **Licensed — confirm terms before public web reproduction** |
| BFCRS | Bush G et al., *Acta Psychiatr Scand* 1996 | Freely reproducible |
| FRST | Fordham Risk Screening Tool | Proprietary — confirm |

Add a `sourceVerified: {by, date, edition}` field to the tool's item schema and surface it in the footer. This is the same content-hashing discipline §9.2 of the main review recommends for the question bank, applied where it matters most.

---

## 1. CIWA-Ar — global gaps to close

Before the item content, the seven things missing that affect **all ten items**:

1. **No elicitation question for any item.** CIWA-Ar is a semi-structured interview; seven of ten items have a standardized patient-facing question. None currently appear.
2. **No intermediate anchors.** Items are 0–7 with published descriptors at 0/1/4/7 (and at every level for the three perceptual items). The card supplies only the poles.
3. **The 0–4 vs 0–7 asymmetry is displayed and never explained.** Orientation renders `/4` beside nine `/7`s and looks like a bug.
4. **No observed-vs-reported discipline.**
5. **No total-score arithmetic.** 9 items × 7 = 63, + 4 = **67**. The header says max 67; the gauge announces "of 30."
6. **No administration frame** — who scores, frequency by band, minimum monitoring interval, **hold parameters**, when to stop scoring, what a *falling* score obligates.
7. **No statement that CIWA-Ar is validated for alcohol withdrawal only** — it is routinely and inappropriately applied to benzodiazepine and other sedative withdrawal.

### 1.1 The administration panel (new — top of the CIWA tab)

> **What this instrument is.** A severity index for a patient **already known** to be in alcohol withdrawal, rated by a **trained** rater, in a patient who can **converse**. Ten items; nine scored 0–7 and one scored 0–4; maximum 67.
>
> **What it cannot do.** It cannot make the diagnosis — tachycardia, tremor and anxiety are also sepsis, pain, thyrotoxicosis, stimulant intoxication and plain fear. It cannot triage level of care. It cannot predict who will seize or develop DTs (that is what PAWSS is for — see §3). It is **not validated for benzodiazepine or other sedative withdrawal**.
>
> **When it does not apply at all.** Delirium. Intubation or any patient who cannot converse. A language barrier without a qualified interpreter. Aphasia. In those patients you do not get a scale — you get a RASS/SAS-anchored or front-loaded protocol and a conversation with a human. *Substituting a different scale is the reflex we are trying to train out of you.*
>
> **Who scores it, and how often.** Per your unit's protocol. Typically q1h while the score is rising or ≥8–10, extending as it falls. **Two different raters produce two different numbers** — see the paired-rater exercise in §5.
>
> **Hold parameters are part of the protocol.** A CIWA protocol without a "hold and call" rule (sedation level, respiratory rate) is how patients get over-sedated. Know your unit's before you score.
>
> **If you did not perform the elicitation, do not score the item — write "not assessed."**

### 1.2 Item-by-item drop-in content

Format: `TAG` · elicitation · [0 / middle / top rungs shown by default] · full ladder · exclusion.

---

**1 · Nausea and vomiting — `ASKED`**
Ask: *"Do you feel sick to your stomach? Have you vomited?"*

| | |
|---|---|
| **0** | no nausea and no vomiting |
| 1 | mild nausea with no vomiting |
| **4** | intermittent nausea with dry heaves |
| **7** | constant nausea, frequent dry heaves and vomiting |

*2, 3, 5, 6 are legitimate intermediate ratings.*
⚠ Patient-reported. Nausea from another cause (GI bleed, pancreatitis, medication) is not withdrawal nausea — but rate what is present and flag the alternative cause to the team.

---

**2 · Tremor — `OBSERVED`**
**Manoeuvre: arms extended, fingers spread apart.** *(If you did not do this, you did not rate tremor.)*

| | |
|---|---|
| **0** | no tremor |
| 1 | not visible, but can be felt fingertip to fingertip |
| **4** | moderate, with patient's arms extended |
| **7** | severe, even with arms not extended |

⚠ Baseline essential tremor, parkinsonian tremor, stimulant or thyrotoxic tremor, and lithium tremor all look like this. Ask about baseline; document the confound.

---

**3 · Paroxysmal sweats — `OBSERVED`**
No question. **Look at the patient.**

| | |
|---|---|
| **0** | no sweat visible |
| 1 | barely perceptible sweating, palms moist |
| **4** | beads of sweat obvious on forehead |
| **7** | drenching sweats |

⚠ Not from a warm room, exertion, fever, or a blanket. If you cannot exclude those, say so rather than scoring high.

---

**4 · Anxiety — `ASKED`**
Ask: *"Do you feel nervous?"*

| | |
|---|---|
| **0** | no anxiety, at ease |
| 1 | mildly anxious |
| **4** | **moderately anxious, or guarded, so anxiety is inferred** |
| **7** | equivalent to acute panic states as seen in severe delirium or acute schizophrenic reactions |

⚠ **The "guarded → inferred" clause at level 4 is the whole point of this item** and is the piece most often lost. A patient who will not say they are anxious but is scanning the room and answering in monosyllables scores here.
⚠ Anxiety, not akathisia. If an inner restlessness is *driving* the movement, that is akathisia — score it nowhere on CIWA and tell the team.

---

**5 · Agitation — `OBSERVED`**

| | |
|---|---|
| **0** | normal activity |
| 1 | somewhat more than normal activity |
| **4** | moderately fidgety and restless |
| **7** | paces back and forth during most of the interview, or constantly thrashes about |

⚠ Same akathisia caution. Also: pain, full bladder, and delirium all produce this.

---

**6 · Tactile disturbances — `ASKED`**
Ask: *"Have you any itching, pins and needles sensations, any burning, any numbness, or do you feel bugs crawling on or under your skin?"*

| | |
|---|---|
| **0** | none |
| 1 | very mild itching, pins and needles, burning or numbness |
| 2 | mild itching, pins and needles, burning or numbness |
| 3 | moderate itching, pins and needles, burning or numbness |
| **4** | **moderately severe hallucinations** |
| 5 | severe hallucinations |
| 6 | extremely severe hallucinations |
| **7** | continuous hallucinations |

⚠ **This is the ladder that must not be collapsed.** The jump from level 3 to level 4 is the jump from a *sensation* to a *hallucination*, and it is the single most clinically meaningful step in the instrument. Show all eight rungs on the three perceptual items by default — the "three rungs" rule does not apply here.

---

**7 · Auditory disturbances — `ASKED`**
Ask: *"Are you more aware of sounds around you? Are they harsh? Do they frighten you? Are you hearing anything that is disturbing to you? Are you hearing things you know are not there?"*

| | |
|---|---|
| **0** | not present |
| 1 | very mild harshness or ability to frighten |
| 2 | mild harshness or ability to frighten |
| 3 | moderate harshness or ability to frighten |
| **4** | moderately severe hallucinations |
| 5 | severe hallucinations |
| 6 | extremely severe hallucinations |
| **7** | continuous hallucinations |

⚠ Do not score sounds the patient correctly identifies as coming from outside the room.

---

**8 · Visual disturbances — `ASKED`**
Ask: *"Does the light appear to be too bright? Is its color different? Does it hurt your eyes? Are you seeing anything that is disturbing to you? Are you seeing things you know are not there?"*

| | |
|---|---|
| **0** | not present |
| 1 | very mild sensitivity |
| 2 | mild sensitivity |
| 3 | moderate sensitivity |
| **4** | moderately severe hallucinations |
| 5 | severe hallucinations |
| 6 | extremely severe hallucinations |
| **7** | continuous hallucinations |

---

**9 · Headache, fullness in head — `ASKED`**
Ask: *"Does your head feel different? Does it feel like there is a band around your head?"*

| | |
|---|---|
| **0** | not present |
| 1 | very mild |
| 2 | mild |
| 3 | moderate |
| **4** | moderately severe |
| 5 | severe |
| 6 | very severe |
| **7** | extremely severe |

⚠ **Published exclusion, currently omitted: "Do not rate for dizziness or lightheadedness. Otherwise, rate severity."** Without it, dizzy patients get scored here.

---

**10 · Orientation and clouding of sensorium — `ASKED` — note this item is 0–4, not 0–7**
Ask: *"What day is this? Where are you? Who am I?"* **and test serial additions.**

| | |
|---|---|
| **0** | oriented **and can do serial additions** |
| **1** | **cannot do serial additions** or is uncertain about date |
| **2** | disoriented for date by no more than 2 calendar days |
| **3** | disoriented for date by more than 2 calendar days |
| **4** | disoriented for place and/or person |

**Why this item is 0–4:** it is not a symptom-severity item at all — it is a five-point *clouding-of-sensorium* index bolted onto nine seven-point severity items. That is also why the maximum is 9 × 7 + 4 = **67**.

⚠ **Serial additions is the most-skipped element of CIWA on any real floor, and skipping it is the point of failure.** If you skip it you are not scoring item 10, you are guessing at it — and item 10 is the one whose gradations distinguish incipient DT from mild clouding. **If you did not test it, do not score it — write "not assessed."**

### 1.3 Score interpretation — describe, do not direct

Replace the current directive strings.

| Total | Label | What the tool says |
|---|---|---|
| 0–8 | Minimal | *"Low current symptom burden. **This does not mean no treatment is indicated** — prophylaxis is driven by withdrawal history and complicated-withdrawal risk (see PAWSS), not by this score. Discuss with your team."* |
| 9–14 | Mild–moderate | *"Symptomatic. Highest drivers: [items]. Follow your unit's protocol and re-score per protocol."* |
| **15–19** | **Moderate — escalation threshold** | *"**≥15 is the conventional trigger for intensified monitoring and escalation in most institutional protocols.** Tell your senior now. Highest drivers: [items]."* |
| ≥20 | Severe | *"Severe. Escalate now. Ask whether CIWA is still the right instrument — if the patient is delirious, it is not."* |

**Delete entirely:** `'Often no medication — monitor and reassess.'`

**Add to every band:** a *"your highest drivers are…"* readout naming the two top-scoring items. This is what a clinician actually communicates and it is what the score is for.

---

## 2. COWS — legal values and drop-in anchors

### 2.1 The schema fix (Tier 0)

```js
// BEFORE — dense range on a sparse instrument
{k:'gooseflesh', b:'Gooseflesh skin', max:5}
for(var s=0; s<=i.max; s++) opts.push(...)        // offers 0,1,2,3,4,5

// AFTER
{k:'gooseflesh', b:'Gooseflesh skin', tag:'OBSERVED',
 vals:[
   {v:0, a:'skin is smooth'},
   {v:3, a:'piloerection of skin can be felt or hairs standing up on arms'},
   {v:5, a:'prominent piloerection'}
 ]}
i.vals.forEach(function(o){ opts.push(o); })      // offers only 0, 3, 5
```

Add a schema/validator assertion: **every COWS item must declare `vals[]`; no item may render an integer absent from `vals[]`.**

### 2.2 Item content — all eleven items, legal values only

Maximum total = **48**.

| # | Item | Tag | Elicitation / window | Legal values and anchors |
|---|---|---|---|---|
| 1 | **Resting pulse rate** | OBSERVED | Measured **after the patient has been sitting or lying for one minute** | **0** ≤80 · **1** 81–100 · **2** 101–120 · **4** >120 |
| 2 | **Sweating** | OBSERVED | Over the **past ½ hour**, **not** accounted for by room temperature or patient activity | **0** no report of chills or flushing · **1** subjective report of chills or flushing · **2** flushed or observable moistness on face · **3** beads of sweat on brow or face · **4** sweat streaming off face |
| 3 | **Restlessness** | OBSERVED | Observation during assessment | **0** able to sit still · **1** reports difficulty sitting still, but is able to do so · **3** frequent shifting or extraneous movements of legs/arms · **5** unable to sit still for more than a few seconds |
| 4 | **Pupil size** | OBSERVED | — | **0** pupils pinned **or normal size for room light** · **1** pupils possibly larger than normal for room light · **2** pupils moderately dilated · **5** pupils so dilated that only the rim of the iris is visible |
| 5 | **Bone or joint aches** | ASKED | If the patient had pain previously, **only the additional component attributed to opioid withdrawal is scored** | **0** not present · **1** mild diffuse discomfort · **2** patient reports severe diffuse aching of joints/muscles · **4** patient is **rubbing joints or muscles and unable to sit still** because of discomfort |
| 6 | **Runny nose or tearing** | OBSERVED | **Not** accounted for by cold symptoms or allergies | **0** not present · **1** nasal stuffiness or unusually moist eyes · **2** nose running or tearing · **4** nose constantly running or tears streaming down cheeks |
| 7 | **GI upset** | ASKED | Over the **last ½ hour** | **0** no GI symptoms · **1** stomach cramps · **2** nausea or loose stool · **3** vomiting or diarrhea · **5** multiple episodes of diarrhea or vomiting |
| 8 | **Tremor** | OBSERVED | **Observation of outstretched hands** | **0** no tremor · **1** tremor can be felt, but not observed · **2** slight tremor observable · **4** gross tremor or muscle twitching |
| 9 | **Yawning** | OBSERVED | Observation **during assessment** | **0** no yawning · **1** yawning once or twice during assessment · **2** yawning three or more times during assessment · **4** yawning several times per minute |
| 10 | **Anxiety or irritability** | ASKED/OBSERVED | — | **0** none · **1** patient reports increasing irritability or anxiousness · **2** patient obviously irritable or anxious · **4** patient so irritable or anxious that participation in the assessment is difficult |
| 11 | **Gooseflesh skin** | OBSERVED | — | **0** skin is smooth · **3** piloerection can be felt or hairs standing up on arms · **5** prominent piloerection |

**Score bands (currently collapsed — restore all four):**

| Total | Band |
|---|---|
| 5–12 | Mild |
| 13–24 | Moderate |
| 25–36 | Moderately severe |
| 37–48 | Severe |

Fix the meter segment labels, which currently read `≤12 mild / 13–24 mod / ≥25 severe` beneath an `info()` function whose first tier is `≤4 None/minimal`.

### 2.3 The COWS "use it well" panel (new — the CIWA tab has one; this tab has none)

> **The pulse item is four of forty-eight points and it is the one item students trust because it looks objective.** It is confounded by beta-blockade, stimulants, anticholinergics, fever, pain and anxiety. A beta-blocked patient in florid withdrawal scores 0 here.
>
> **Several items are patient-reported and therefore effort-dependent** in a patient who wants medication sooner. That is not an accusation — it is a property of the instrument, and it is why the observed items carry the weight.
>
> **Methadone-maintained patients:** withdrawal onset is delayed 24–48 h. A low COWS at 12 hours means nothing.
>
> **Fentanyl and fentanyl analogues:** tissue redistribution can delay objective withdrawal well past the usual window. A patient can be 30+ hours out, feel terrible, and still score below the traditional induction threshold.
>
> **Not validated for:** neonatal withdrawal (use Finnegan/ESC) or benzodiazepine co-withdrawal.

### 2.4 The "when the standard gate fails" panel (new — the highest-priority content addition)

Currently the tool and three other assets state a single 2010-era rule and `qb_sud_005` teaches low-dose initiation as an **error**. Replace with two branches.

> **Branch A — standard (COWS-gated) induction.** Appropriate when the patient's last use was a short-acting opioid and objective withdrawal is developing on schedule. Wait for objective withdrawal before the first dose; the score is the safety check.
>
> **Branch B — low-dose initiation / overlap ("micro-dosing," Bernese method).** Buprenorphine is started at very low doses **while the full agonist is still on board** and increased over days, with the full agonist tapered or stopped later. This deliberately avoids the precipitated-withdrawal window rather than waiting it out.
>
> **When Branch B is the right answer:**
> - **Fentanyl or fentanyl-analogue exposure** — the dominant supply. Tissue redistribution makes the COWS gate unreliable, and standard induction has a materially higher precipitated-withdrawal rate.
> - **Transition from methadone** — this is the standard approach.
> - **The patient who cannot or will not tolerate a withdrawal window** — including medically ill and post-operative patients.
> - **A prior precipitated-withdrawal event** on a standard induction.
>
> **Also on the menu and currently absent from this library:** high-dose/macrodose induction, and **methadone** as an inpatient option.
>
> **Student role:** recognise which branch this patient needs and say so. **Do not invent a protocol** — the specific schedules are institutional and belong to your team.

**And rewrite `qb_sud_005` option C** so it is wrong for the right reason: *a 0.5 mg test dose inside a standard induction is not the same thing as a structured low-dose initiation protocol.* As written, the distractor rationale teaches a guideline-supported technique as a trap.

---

## 3. PAWSS — the missing pre-screen (new card on the CIWA tab)

Currently `PAWSS` appears in exactly one clause in the entire repo, misdescribed as a monitoring alternative for the non-communicative patient. It is neither of those things.

> **PAWSS — Prediction of Alcohol Withdrawal Severity Scale.** A **10-point, admission-time prediction** instrument. It does not measure current symptoms; it identifies, **before symptoms start**, who is likely to develop **complicated** withdrawal — seizures, delirium tremens, ICU-level care — so that prophylaxis and the right monitoring level can be arranged in advance.
>
> **Threshold: ≥4 = high risk of complicated withdrawal.**
>
> **Structure (verify items verbatim against Maldonado 2014/2015 before shipping):** a pilot question establishing recent alcohol use or a positive BAL, then history items (prior withdrawal episodes, prior withdrawal seizures, prior delirium tremens, prior rehabilitation/detoxification, prior blackouts, combined use of other CNS depressants) and clinical-evidence items (elevated BAL on presentation, evidence of autonomic hyperactivity). One point each.
>
> **What it changes:** a PAWSS ≥4 patient gets scheduled prophylaxis and a higher monitoring level **regardless of a low CIWA**. This is the single highest-value skill in inpatient alcohol withdrawal and it is currently absent from this library.
>
> **What it is not:** a severity scale, a monitoring instrument, or a substitute for CIWA. And it is **not** the answer for the intubated or delirious patient — that is a RASS/SAS-anchored or front-loaded phenobarbital protocol, plus a conversation with a human.

**Also fix, in the same edit:** split `withdrawal-ciwa-cows-card.html:202`. Keep the validity-conditions half (*"CIWA assumes the patient can communicate — it is unreliable in delirium, intubation, or language barriers"*) — it is the best sentence on the tab and most CIWA teaching materials never say it. Delete *"use a protocol like RASS/PAWSS there"* and replace with the non-communicative-patient pathway.

---

## 4. Serial trending — the change both peer reviewers ranked in their top two

Three separate assets promise that the trend matters; zero instruments can hold two data points.

**Spec:**

```
localStorage key:  cw_ciwa_series_v1   (MS3 hub)  /  rp_ciwa_series_v1  (resident)
                   cw_cows_series_v1  ·  cw_bfcrs_series_v1
Stored per entry:  { t: <ISO timestamp>, total: <int>, items: {k:v}, note: <optional> }
Stored NEVER:      any patient identifier, initials, MRN, room, DOB, or free text
                   describing a real patient. Practice sessions only.
Retention:         session or 7 days, learner-clearable, with a visible "Clear series" control
```

**Display:**
- A sparkline of the last 8 scores.
- **Δ per hour** between the last two entries — this is the number a clinician actually communicates.
- A one-line read: *"Rising 4 points in 2 hours"* / *"Plateau"* / *"Falling — what does a falling score oblige you to do?"*
- For BFCRS specifically: **pre/post lorazepam-challenge fields with automatic Δ%**, and the criterion stated on screen — *a ≥50% reduction in BFCRS is the conventional positive response.* You already compute both numbers and caption the total *"track it to follow response"*; you have built the numerator and denominator and never written the fraction.

**Banner (required, given no-PHI policy):** *"Practice tool. Enter observations from a case or a simulated patient only. Never enter data from a real patient."*

---

## 5. The rater-calibration module

Everything above is design, and design fixes drift sources 2–5 (elicitation not performed, paraphrase, construct bleed, reported-as-observed). **Only training fixes the other two — motivated scoring and halo.** There is currently exactly one worked example in the entire acute layer (the capacity vignette), and it should be the template.

Seven components. Anything less is a slide deck.

### 5.1 Criterion-scored exemplars — weighted to the middle rungs
Six to eight per item, **for the items that carry the variance only**: CIWA tremor, anxiety, agitation, orientation; COWS restlessness, pulse, gooseflesh; BFCRS the manoeuvre items. Each exemplar is a short video or a tightly written 60-word observation. Each has a criterion score set by **three independent raters with disagreements resolved and documented**.

**Do not build exemplars for 0 and 7.** Nobody disagrees about 0 and 7.

*Cost:* a well-written 60-word observation does the job for anxiety and agitation. Tremor and the BFCRS manoeuvres genuinely need video — about **eight short clips, shot in an afternoon with a colleague.**

### 5.2 Directional feedback that names the error type
When the learner scores 5 and the criterion is 2, the feedback names the failure mode:

| Error type | Feedback |
|---|---|
| **Halo** | *"You scored high across every item. Rate each item on its own evidence."* |
| **Reported scored as observed** | *"This is an OBSERVED item. What did you see?"* |
| **Construct bleed** | *"That's akathisia, not agitation."* / *"That's dizziness — the item says do not rate for it."* |
| **Manoeuvre not performed** | *"You cannot score tremor without extending the arms."* |
| **Confound not excluded** | *"The room was warm. Say so instead of scoring the sweat."* |

**This is your own question bank's named-trap architecture, ported to the instruments** — and it is the best instructional idea in the repository.

### 5.3 Confound cases where "do not score" is a correct answer
The beta-blocked patient. Baseline essential tremor. The post-op patient in pain. The anxious patient who is not withdrawing. The delirious patient where CIWA does not apply at all. The methadone-maintained patient at 12 hours. **If the module never offers "this instrument does not apply here" as a scoreable response, it has taught the wrong reflex.**

### 5.4 Bias measurement, not just accuracy
Report **signed** mean error, not absolute. A learner who is +1.8 on every item is a different problem from one who is ±1.8 randomly — and the first one is going to over-benzodiazepine somebody. Your question bank already does the sophisticated version of this in the calibration-gap panel; the instruments have nothing.

### 5.5 A trajectory exercise
Three time points on one patient. Rising, falling, or plateau? What do you do at each? **This is the actual skill and the tool structurally cannot teach it today** (see §4).

### 5.6 The paired-rater exercise — cheapest, highest-yield item in this entire spec

**Put this one page in the week-one materials. It requires no software.**

> **Paired-rater exercise — 10 minutes**
>
> 1. Two learners attend the **same** patient encounter.
> 2. Each scores the instrument **independently**. Neither sees the other's sheet.
> 3. Both scores are **locked** before either is shown.
> 4. Compare, item by item, in front of a supervisor.
> 5. For every item that differs by ≥2, answer three questions out loud:
>    - Did we both perform the elicitation the same way?
>    - Is this an OBSERVED or an ASKED item, and did we both treat it that way?
>    - What did one of us count that the other excluded?
> 6. Name the drift source out loud (halo / paraphrase / construct bleed / manoeuvre / confound).
>
> **The point of the exercise, stated to the learners at the end:** *the number came out of you, not out of the patient.*

### 5.7 Actual agreement statistics — or admit you are not training raters
If you never measure agreement, you have run an exercise, not a training. Report **ICC** for the ordinal scales and **kappa** for BFCRS screen positivity across the cohort, once a year, to the faculty. *"It'll be worse than you expect the first year. That's the point."*

---

## 6. What generalizes beyond withdrawal

Apply the same five rules to every instrument in the library, present and future:

1. **Tag every item `OBSERVED` or `ASKED`.**
2. **Ship the elicitation verbatim, always visible** — the question for asked items, the manoeuvre *with its counter-instruction* for observed ones. (BFCRS: *"do not shake my hand"*; stroke the palm *"while telling the patient not to grasp"*; light one-finger pressure *"after instructing the patient to keep the arm down."*)
3. **Three rungs by default — 0, middle, top — with the full ladder one tap away.** Exception: any item whose ladder contains a categorical jump (the CIWA perceptual items' sensation→hallucination step) shows all rungs.
4. **Exclusions inline**, where the rater is looking. (*"Do not rate for dizziness."* · *"Not from room temperature or activity."* · *"Do not consider if cogwheeling or tremor present."*)
5. **Legal values only.** No dense range on a sparse scale, ever. Enforce in the schema and in CI.

And the one rule that governs all of them:

> **Compute what the instrument was built to produce. Never compute the action.**
> *"Your highest drivers are tremor and anxiety; escalate per your unit's protocol"* is the tool describing.
> *"Often no medication"* is the tool prescribing — and it has no idea whether this patient has had two prior DT admissions.
