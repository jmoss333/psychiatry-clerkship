# Psychiatry Clerkship Library — Clinical Content & Instrument Validity Review

**Prepared:** 2026-08-20 · **Repo:** `~/Psychiatry-Clerkship-Library` (MS3 + resident builds)
**Scope:** clinical content (03, 04, 05, 02, 06), the 11 registered tools, the question/retrieval banks, and The Interview Room (AI standardized patient)
**Method:** four independent read-throughs of the source tree at file/line level, followed by a structured review with two practicing psychiatrists — an inpatient attending (14 yrs, 24-bed adult unit + CL blocks) and a consultation-liaison psychiatrist (9 yrs, ~1,200 consults/yr). Reviewer commentary is quoted where it changes or overturns an audit finding.

---

## 0. Executive summary

**The thesis, in one sentence:** *the prose in this library is attested, careful and hedged; the interactive tools are not — and the tools are the part that produce an output a student will believe.*

A teaching page that is 80% complete teaches 80%. A scoring tool that is 80% correct produces **a number**, and a number is a decision. The governance you built for markdown (attestation banners, reviewer + date, `reviewed.json`) was designed to hold documents. It is currently holding artifacts that render verdicts, gate medication decisions, and generate copyable chart text — and it cannot bear that weight.

The CL reviewer restated the same pattern from the measurement side, and it is worth quoting because it names the fix as well as the fault:

> "The tools are more sophisticated than their clinical content contracts. The BFCRS computes the number that judges the lorazepam challenge and never states the criterion. The SP models disclosure psychology in prose and gates it on a counter. The capacity module states the sliding scale three times and implements a boolean. The withdrawal card says the trend matters and can't hold two scores. In every case the engineering ran ahead of the clinical specification — which is a much better problem than the reverse, because the specification is the part you're qualified to write."

**Headline numbers**

| | |
|---|---|
| Content pages reviewed | ~90 markdown teaching pages, ~15,700 words in 03/05 alone |
| Instruments audited | 6 scored (CIWA-Ar, COWS, C-SSRS, BFCRS, FRST/violence, capacity) + 5 practice tools |
| Instruments with any rater-training artifact | **1** (one capacity vignette) |
| Instruments that can hold two data points | **0** — despite three separate "the trend matters" claims |
| Scored clinical-skills items where the key is at a fixed position | **25 / 25** reasoning steps · **10 / 10** communication cases |
| Question-bank items where the key is the longest option | **164 / 192 (85.4%)**; among *attested* items, **91.6%** |
| Daily Review: score obtainable by pressing "1" without reading | **~50%** (key at index 0 in 220/437; no shuffle) |
| Shelf Mode items actually available to a student | **5** (zero `SHELF-*` decks exist; the blueprint allocator is dead code) |
| SP cases reachable by a learner | **1** (Dana, active SI) — resident overlay is design-only |
| Clinically wrong keyed content found | 1 qbank item (NPH course), 4 landmark-trial keys, 2 mis-cited claims, 1 citation that contradicts its source |

**What is genuinely excellent** is listed in §12 and is not a courtesy section. Both reviewers independently said parts of this library are better than what their own programs hand out. The inpatient attending's verdict: *"I would let my students use it starting Monday"* — with one caveat he wanted printed verbatim:

> *"Read everything. Use the tools to learn what the instrument contains. Do not put a number from any of these into a chart, and do not let a screen result end a conversation."*

---

## 1. The organizing finding: four classes of defect, not forty

Every finding in this review sorts into one of four buckets. Fix them as classes, not as a punch list.

| Class | What it looks like | Why it recurs |
|---|---|---|
| **A · The artifact acts** | `verdict()` declares capacity · "Often no medication" at CIWA ≤8 · violence checklist counts boxes and says "move to de-escalation now" · debrief says "that is exactly why she told you the truth" | Tools were built to be *helpful*, and help was implemented as a directive. The instrument's job is to describe; the clinician's job is to decide. |
| **B · The instrument is a form, not a scale** | CIWA/COWS endpoint-only anchors, no elicitation stems · BFCRS with no examination procedure · C-SSRS with no timeframe and no administration rules | The tools were built as calculators. In a calculator the anchors are decoration; in a rating instrument the anchors and the elicitation **are** the instrument and the total is a byproduct. |
| **C · The score is not earned** | Fixed key position in 25/25 reasoning steps · longest-option cue at 91.6% of attested items · press-"1"-for-50% in Daily Review · keyword-scored SP coverage · 5-item "shelf simulation" | Content authoring and item engineering were done by the same pass. Nothing in CI checks for a positional or length tell. |
| **D · Content tiering leaks** | Catatonia/antipsychotic hazard is resident-only · acute dystonia absent entirely · fentanyl-era buprenorphine absent · lamotrigine absent · dose policy applied arbitrarily | The MS3 tier was built by *subtraction* from the resident tier. Subtraction removed numbers but also removed reasoning, and in three places removed the safety statement. |

The remediation plan in §11 is sequenced by *class*, because a class-level fix (a CI cue check; a `vals[]` schema; a "describe, don't direct" rule) prevents recurrence in a way that item-level fixes do not.

---

## 2. Tier 0 — Fix before the next block starts

These are the only findings in the entire review where the artifact can produce a **wrong bedside act** rather than an incomplete education. Both reviewers independently ranked them at the top. Each is hours, not weeks.

### 2.1 The capacity module declares capacity when nothing was assessed — and offers to paste it into a chart

`04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html:110–116`

```js
var allRated = ABIL.every(function(a){return rate[a.key];});   // 'na' is truthy
if(!allRated) return {cls:'part', txt:'Incomplete — rate all four abilities…'};
if(anyImp)    return {cls:'no',   txt:'Pattern suggests the patient LACKS capacity…'};
return {cls:'ok', txt:'Pattern consistent with INTACT capacity for this specific decision.'};
```

The UI offers a third button, **"Not assessed"**, whose value is the truthy string `'na'`. Set all four abilities to *Not assessed* → `allRated` passes, `anyImp` fails → **"Pattern consistent with INTACT capacity."** The generated note (`:133`) then reads *"Based on the four-abilities assessment, the patient demonstrates the capacity to make this specific decision"* above four bullets each reading *"Not formally assessed."* There is a **Copy note** button at `:190`.

> **Inpatient attending:** *"It's 4:40 on a Friday. 78-year-old, day 3 post-hip, wants to leave, family in the hallway. The student is sent to 'start the capacity assessment,' doesn't feel qualified to rate appreciation on a patient they met four minutes ago, marks things Not assessed, and the tool tells them the patient has capacity. Now there is a note. Now the hospitalist has cover. Now nobody re-examines. I have watched a student paste tool-generated language into a chart — a different tool, an SBIRT template — and it took me two days to find it because it read exactly like something a person had written. Fix this tonight."*

**Minimum fix (tonight):** `ABIL.every(a => a.key in rate && rate[a.key] !== 'na')`, and any `'na'` forces the incomplete verdict with the text *"Cannot determine — abilities marked Not assessed."* Disable **Copy note** while any ability is `na`.

**The real fix (this month) — and this is the deepest conceptual point in the review:**

> **CL psychiatrist:** *"The bug is not the problem. The problem is that the module renders a verdict at all. The four abilities are not a scale. Appelbaum and Grisso gave you a framework; the MacCAT-T is its semi-structured operationalization, and even the MacCAT-T deliberately declines to publish a cutoff — the authors explicitly refused to set one, because the threshold is a function of the decision's risk-benefit asymmetry. Your module knows this. It says so three times, and then `verdict()` never reads `ctx.risk`. The note asserts that a sliding-scale standard was applied while the code applied a flat boolean. **Delete `verdict()`.** The module should produce a structured report — here is the decision, here is what the patient said for each ability, here is which abilities are in question, here is what's reversible, here is what I recommend and what I want help with — and then stop."*

**Also add (highest-frequency trainee misconception, per both reviewers):** *committed ≠ incapacitated.* A committed patient may retain capacity to refuse medication; treatment over objection is a separate legal process. Plus the emergency exception, advance directives, and the surrogate hierarchy. Your question bank already covers all four (`qb_eth_003, _010, _011, _013`) — it is keyed to `ethics_legal.md`, so a learner working through the capacity module meets none of it.

### 2.2 COWS admits scores that do not exist on the instrument — and that total gates a medication decision

`03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html:155`

```js
for(var s=0; s<=i.max; s++) opts.push(...)   // dense 0..max on a sparse scale
```

COWS is sparse. Ten of eleven items are rendered as dense ranges:

| Item | Legal values | Tool offers | Impossible values injected |
|---|---|---|---|
| Resting pulse | 0,1,2,4 | 0–4 | **3** |
| Restlessness | 0,1,3,5 | 0–5 | **2, 4** |
| Pupil size | 0,1,2,5 | 0–5 | **3, 4** |
| Bone/joint aches | 0,1,2,4 | 0–4 | **3** |
| Runny nose/tearing | 0,1,2,4 | 0–4 | **3** |
| GI upset | 0,1,2,3,5 | 0–5 | **4** |
| Tremor | 0,1,2,4 | 0–4 | **3** |
| Yawning | 0,1,2,4 | 0–4 | **3** |
| Anxiety/irritability | 0,1,2,4 | 0–4 | **3** |
| Gooseflesh | 0,3,5 | 0–5 | **1, 2, 4** |

Only *Sweating* is legitimately dense 0–4.

> **CL psychiatrist:** *"On COWS the total is a **gate**, not a description. A number assembled from anchors that don't exist is being read against 'wait for COWS ≥8–12' before buprenorphine. Two raters watching the same patient can land on different legal integers, and a patient can be pushed across a threshold by a rung the instrument doesn't have. In a pure severity scale that's sloppy. In a gating scale it's a mechanism of harm."*

**Fix:** change the item schema from `max:N` to `vals:[0,1,2,4]` and render only legal options, each labelled with its published anchor. Add a schema assertion so this cannot regress. Full drop-in content in the companion spec.

### 2.3 The C-SSRS screener has no timeframe, and a stale-answer bug that leaves "HIGH risk" on screen

`04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html:82–103`

Q1–Q5 ship with the official verbatim stems and **no reference period**. The published Screener with Triage places Q1–Q5 under **Past month** and Q6 under **Lifetime** with a **past-3-months** sub-question. The tool preserves the Q6 structure and silently drops the past-month frame on Q1–Q5 — while the triage table it implements is calibrated to past-month ideation. A patient describing ideation from a depressive episode ten years ago answers yes to Q4 and the tool prints **HIGH risk — escalate now.**

Second, compounding: `var showSub = a.q2==='yes'` controls only *rendering*. `band()` reads `a.q3/q4/q5` unconditionally. Answer Q2=Yes → Q4=Yes, then correct Q2 to No: Q3–Q5 dim out and the triage node still reads HIGH off the orphaned Q4.

> **CL psychiatrist:** *"You have built a lifetime-history instrument wearing an acute-triage output. That deserves the critical label on its own merits, with no appeal to base rates."*

**Fix:** add the `Past month` / `Lifetime` column headers verbatim to each node; clear `q3/q4/q5` in the Q2 setter when the value is not `'yes'`.

**Also add — the two highest-yield administration lines you can write:**
1. *"Ask these verbatim, in order. Do not improvise."* (Paraphrase is the dominant source of C-SSRS unreliability.)
2. Q6's example list, verbatim (collected pills, obtained a gun, gave away valuables, wrote a note, held a gun and changed your mind…). Patients do not spontaneously classify an aborted attempt as *"doing anything."* Without the examples, Q6 under-detects exactly the behaviours that drive the high-risk determination.

### 2.4 BFCRS: wrong Withdrawal anchors, invalid scores on dichotomous items, and no malignant-catatonia interrupt

`04_Acute_and_Safety/Catatonia/bfcrs.html`

- **`:130` — Withdrawal anchors are wrong by ~3×.** Published: `1 = minimal PO intake/interaction <1 day; 2 = minimal PO intake/interaction >1 day; 3 = no PO intake/interaction for ≥1 day`. The tool moves the "3" threshold to **≥3 days** and renders the "2" anchor as the uninterpretable fragment `"< 3 days"`. A catatonic patient with no oral intake for 24 h is a **3** — the rung that flags dehydration, rhabdomyolysis and the NG/IV conversation. The tool says 2 and tells the rater to wait two more days. It also depresses the total used to judge lorazepam response.
- **`:129, :133, :136` — waxy flexibility, Mitgehen and grasp reflex are correctly labelled "scored 0 or 3" but `Item()` renders `[0,1,2,3]` as clickable.** A spurious 1 inflates the /69 total and can flip `screenCount` to positive, firing the lorazepam callout.
- **`:139, :147–148` — item 23 (autonomic abnormality) is scoreable and triggers nothing.** The only conditional in the file is `screenCount>=2`. A patient scored 3 on autonomic abnormality with rigidity is **malignant catatonia** — which your own attested page calls *"the emergency you must never miss"* — and the tool's only nudge is toward a benzodiazepine trial.
- **`:189` — the lorazepam-challenge callout gives the wrong reassessment interval and omits the response criterion.** It says *"reassess in 1–2 h."* The challenge is re-rated at **~5 minutes after IV** (10–15 min IM). And the positive-response criterion — **≥50% reduction in BFCRS** — is missing, in a tool that computes and displays exactly that number and captions it *"track it to follow response."* Your resident reference has all of this right; the MS3 tool contradicts it.
- **`:full file` — no examination procedure.** More than half the scale is elicited manoeuvres, and the *instruction* is what makes the sign pathological: ambitendency is elicited by extending your hand and saying **"do not shake my hand"**; grasp reflex by stroking the palm **while telling the patient not to grasp**; Mitgehen by light one-finger pressure **after instructing the patient to keep the arm down**. Without the counter-instruction you are testing cooperativeness, not the sign. Also omitted: the published rigidity exclusion, *"do not consider if cogwheeling or tremor present"* — so parkinsonism gets scored as catatonic rigidity.

**Fix:** restore published Withdrawal anchors verbatim; disable the 1/2 buttons on dichotomous items; add a hard red interrupt when autonomic abnormality ≥1 AND (rigidity ≥2 OR immobility ≥2) → *"Consider malignant catatonia / NMS — medical emergency; ECT is definitive; escalate now"*; add pre/post score fields with automatic Δ%; correct the interval; add a collapsible **How to examine** step under every manoeuvre item.

### 2.5 "Often no medication" at CIWA ≤8, unconditionally, in a tool with no field for withdrawal history

`withdrawal-ciwa-cows-card.html:126` merges 9–19 into one "Moderate" band — erasing **CIWA ≥15**, the conventional escalation threshold — and returns `action:'Often no medication — monitor and reassess.'` at ≤8 with no conditional.

> **CL psychiatrist:** *"That single string is the most dangerous line of text in the acute slice — more dangerous than the missing anchors, because it's an affirmative instruction rather than an omission. A patient with a prior withdrawal seizure or DT gets scheduled prophylaxis regardless of the score, and your card tells the student the opposite."*

> **Inpatient attending:** *"The patient with two prior DT admissions who scores 6 on arrival gets nothing, and at hour 30 he seizes."*

Compounding, in the question bank: `qb_sud_004` marks fixed-schedule dosing a trap (*"not the guideline-recommended approach"*), and `qb_sud_014` then presents a **prior-withdrawal-seizure** patient and keys symptom-triggered titration. Both cannot be right, and for that patient the bank keys the wrong one. Symptom-triggered is the default *in monitored settings*; scheduled + symptom-triggered PRN is recommended for prior seizure/DT, high PAWSS, and settings without trained raters.

**Fix:** add ≥15 as its own band; gate the ≤8 text behind an explicit "no prior seizure/DT and low complicated-withdrawal risk" precondition; add a **hold parameter** (RASS/RR/"hold and call") — absent from the card and from both audits, and in a monitored setting oversedation is the larger real-world risk; re-key `qb_sud_014` to scheduled + PRN and qualify `qb_sud_004`.

### 2.6 The alcohol-withdrawal seizure window is rendered as a sequential ladder

`04_Acute_and_Safety/Decision_Aids/decision-aids.html:189–194` shows hallucinosis at 12–24 h **then** withdrawal seizures at 24–48 h. Seizures occur **6–48 h**, peaking ~**12–24 h**.

> **Inpatient attending:** *"A student reading that will tell a nurse at hour 18 that we're not in the window yet. That is a specific, plausible, dangerous sentence, and it was manufactured by a layout choice."*

**Fix:** overlapping bands, not disjoint steps. `6–48 h (peak 12–24 h)` for seizures; note DTs can extend to ~96 h. Note also that this page self-labels *"AI-drafted, pending faculty attestation"* while an **attested** tool links into it at its highest-stakes moment (`withdrawal-ciwa-cows-card.html:183`).

### 2.7 Fentanyl-era buprenorphine initiation is absent, and low-dose initiation is actively taught as an error

`substance_use_inpatient_teaching.md:13,34` · tool `:137` · `qb_sud_005`

Four assets state the same 2010-era gate and nothing else: *"begin buprenorphine induction only once objective withdrawal is present (roughly COWS ≥8–12)."* `qb_sud_005`'s distractor C explicitly teaches low-dose initiation as a trap: *"Any buprenorphine dose before adequate objective withdrawal risks precipitated withdrawal — the scoring threshold is the safety check, not a half-dose adjustment."*

Repo-wide grep for `cross-taper|micro-dos|low-dose init`: **zero hits.**

> **Inpatient attending:** *"This is the most clinically consequential finding in all four reports. I run this on my unit weekly: last use 30 hours ago, patient looks and feels terrible, COWS is 9 because fentanyl redistributes out of tissue slowly, we give a standard induction dose, and we precipitate them into the worst withdrawal of their life. Then they leave AMA. Then the two-week post-discharge overdose window opens — the window your own page warns about at line 28. I have had a fourth-year tell me, with total confidence and citing a curriculum, that we could not start buprenorphine because the score wasn't high enough. She was repeating exactly what your page says."*

**Fix:** a two-branch initiation panel — standard COWS-gated induction *vs* low-dose initiation / overlap (fentanyl exposure, methadone cross-taper, patient unwilling to withdraw), plus high-dose/macrodose induction and the statement that **the COWS gate is not sufficient in a fentanyl supply**. Rewrite `qb_sud_005` option C so it is wrong for the right reason (a 0.5 mg test dose inside a standard induction ≠ a structured low-dose initiation protocol). Add methadone as an inpatient option, home-dose verification, and the 72-hour rule.

### 2.8 Acute dystonia does not exist in this library

`grep -ril "dystonia" 03_Core_Topics 05_Psychopharmacology` → **no matches.** The primer's *"Medication emergencies you must recognize"* lists five and omits it.

> **Inpatient attending:** *"19-year-old, first episode, first dose of a high-potency D2 blocker, hour 6, eyes roll up and his neck twists. **I have watched a student stand in that doorway and call it 'an anxiety attack.'** One IM dose, four minutes. If it's laryngeal, it's an airway. This is the single highest-yield thing a psych clerkship teaches that a student will actually use, and it isn't in here."*

**Fix:** add the four-part EPS taxonomy (acute dystonia → akathisia → parkinsonism → tardive) to the primer with recognition, timing, risk factors and the reflex response. Do it in the same sitting as §2.9 — same page, ~90 minutes.

### 2.9 The psychosis page never says the word "catatonia"

`03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` — zero occurrences. This is the page a student reads before writing their first antipsychotic order. The safety statement exists only at `14_Tracks/Resident/cl_reference.md:26` (*"Avoid antipsychotics in suspected catatonia"*).

> **Inpatient attending:** *"Mute, immobile, rigid, not eating, admitted as 'catatonic depression vs psychosis.' Overnight the patient becomes 'agitated' — which was posturing and negativism misread — the covering resident gives IM haloperidol, and by morning the temp is 39.4 and the CK is 4,000. I've seen it twice in fourteen years. **The MS3 who wrote the note that led to the order never saw the resident page.**"*

**Fix:** add a *Catatonia overlap* block to the psychosis page's differential — retarded catatonia mimicking negative symptoms; BFCRS screen; hold antipsychotics; lorazepam challenge — cross-linked to `?page=catatonia.md`. This is Class D (tiering leak) and is the clearest example of subtraction removing a safety statement.

---

## 3. Tier 1 — Clinical content gaps that change bedside behaviour

Ranked by expected harm × frequency. Full coverage matrix in the source audits; this is the actionable subset.

| # | Gap | Where | Why it matters |
|---|---|---|---|
| 1 | **Fentanyl-era buprenorphine** (§2.7) | SUD page, tool, qbank | Precipitated withdrawal → AMA → overdose window |
| 2 | **Acute dystonia** (§2.8) | Absent repo-wide | Most common, most reversible, occasionally airway-threatening AP emergency |
| 3 | **Bipolar depression pharmacotherapy** | `mood…md` has none | The pole that accounts for most bipolar bed-days. Student is told not to use an antidepressant and given no alternative. Add quetiapine/lurasidone/cariprazine/lumateperone/OFC, lamotrigine for the depressive pole, and the ISBD position on antidepressant monotherapy in mixed features |
| 4 | **Catatonia on the psychosis page** (§2.9) | Tiering leak | See above |
| 5 | **Lamotrigine — absent from the entire slice** | `med_monitoring` has 8 agent rows, none is lamotrigine | The one psychotropic rash that kills; a titration schedule that *is* the safety intervention; valproate doubles levels, estrogen-containing contraceptives halve them |
| 6 | **Xylazine / contemporary supply** | Zero hits repo-wide | Sedation not reversed by naloxone; necrotic wounds; a withdrawal syndrome COWS does not cover. Add fentanyl analogues, nitazenes, test strips, "never use alone," syringe services |
| 7 | **LAIs** | Reading-list title only | Initiation-and-bridge during an index admission is one of the highest-yield discharge acts on an adult unit and is MS3-level |
| 8 | **Tardive dyskinesia + VMAT2 inhibitors** | One table cell; zero hits for valbenazine/deutetrabenazine | Two FDA-approved treatments now exist |
| 9 | **AUD pharmacotherapy** | Nine words: *"offer naltrexone or acamprosate"* | Add disulfiram, gabapentin, topiramate; the opioid and hepatic cautions; and the operational rule — **start it before discharge, don't "refer"** (your own disposition section assumes it was started and never tells the student to start it) |
| 10 | **Antidepressants other than SSRIs** | Zero hits for venlafaxine, duloxetine, mirtazapine, bupropion, trazodone, TCA, MAOI in 05 | Mirtazapine/trazodone/bupropion are among the most-written inpatient agents. Organize by side-effect fit, as the antipsychotic block already is |
| 11 | **"How to think about dose" — the reasoning that replaces the withheld number** | Absent from MS3 tier: adequate trial, expected latency, titration cadence, PRN vs standing, when "failed" means "underdosed" | See the dose-policy rewrite in §9.1. Requires **no numbers** |
| 12 | **Tobacco use disorder / NRT** | One incidental hit | Most prevalent SUD in SMI; largest contributor to the mortality gap the library itself cites; NRT on admission is an agitation-prevention measure; and quitting raises clozapine levels (CYP1A2) |
| 13 | **Geriatric psychiatry** | 670 words, **zero medications named** | Add brexpiprazole for agitation in AD (2023 approval), citalopram/CitAD with the QTc ceiling, late-life augmentation (OPTIMUM), the Beers agents that matter, and **late-life suicide epidemiology** — older men have the highest completed-suicide rate of any demographic and the page never says so |
| 14 | **Reproductive pharmacology** | *"note specific cautions around lithium and valproate"* — never specified | Ebstein magnitude vs how it's overstated; peripartum lithium hold/level protocol; **lamotrigine levels falling sharply in pregnancy**; valproate as near-absolute avoidance; lactation and RID; suicide/overdose as leading causes of maternal death in the first postpartum year |
| 15 | **Renal/hepatic/interaction/special populations in 05** | Resident-only or absent | Most of this content already exists in `cl_reference.md` and `adv_psychopharmacology.md` — it needs an MS3-level restatement, not new research |
| 16 | **Prazosin, OCD dose/duration, clomipramine, benzodiazepine harm in PTSD** | One sentence covers three disorder families | Split into three disorder-specific lines |
| 17 | **Clozapine: bowel regimen as an order, BEN/Duffy-null ANC thresholds, the suicidality indication** | Resident page gets the bowel regimen right; MS3 page lists constipation as a side effect | BEN is a genuine equity issue — general thresholds withhold clozapine from Black patients who need it |
| 18 | **No safety-planning tool exists** | Stanley–Brown taught in prose; no builder | You built a tool for the screener with the *least* evidence of changing outcomes and none for the intervention with the most. Lethal-means counselling appears exactly once, as a sub-clause |
| 19 | **Involuntary status / commitment / holds / AMA / capacity** | Zero hits across all five case banks | The longitudinal case has the patient ask to leave the unit twice without ever naming their legal status. Both reviewers named this as the most common student question |
| 20 | **Delirium instrument** | CAM taught in prose; no CAM/4AT/CAM-ICU/RASS anywhere in the tool layer | Also missing: that CAM sensitivity collapses in untrained hands, and that hypoactive delirium is the majority and the one they'll miss |

### 3.1 Evidence hygiene — three defects, one of which costs you credibility

| Claim | Source | Verdict |
|---|---|---|
| `anxiety…md:15,31` — propranolol as akathisia first-line, *"strongest evidence… (Lima et al., Cochrane 2004)"* | Cochrane CD001946 concludes: **"There are insufficient data to recommend beta-blocking drugs for akathisia. These drugs are experimental for this problem."** (3 trials, n=51, ≤72 h) | **Citation contradicts its source** |
| `eating…md:18` — olanzapine *"may modestly help weight and obsessionality in AN"* | Attia 2019 AJP: small BMI benefit (+0.165/month); **"no significant difference… in rate of change in YBOCS total score"** | **Overstates on the dimension the trial nulled** |
| `substance…md:15` — *"(Saitz, N Engl J Med 1998)"* supporting hepatic benzodiazepine choice | Saitz's only 1998 NEJM item is a two-page correspondence piece. The real referent (Saitz, JAMA 1994) is cited correctly elsewhere in the same repo | **Mis-attributed** |

> **Inpatient attending:** *"This one matters differently. It doesn't hurt a patient — the clinical hierarchy on that page is defensible and I teach it the same way. It hurts **you**. That page is your best page. A PGY-2 who checks one citation and finds it inverted will discount every other citation on the site, and there are a lot of correct ones."*

Nothing was fabricated. Every named trial, author and year checked corresponds to a real publication — which is worth stating, because it is rarer than it should be. Four **landmark-trial keys** are wrong, though, and students memorise landmark results as facts:

- `AR-27` Q2 keys *"depressive relapses"* for BALANCE with an HR of 0.63 — BALANCE's outcome was time-to-new-intervention for any emotional episode, and lithium's relapse-prevention effect is larger against **manic** relapse. This inverts the standard framing.
- `AR-27` Q4 attributes the 4-vs-20-month abrupt-discontinuation figures to BALANCE — that is the Faedda/Baldessarini discontinuation literature.
- `AR-26` Q4 compares Miklowitz 2007's 64% one-year recovery to Sachs 2007's 23.5% eight-week durable recovery as *"significantly higher"* — different trials, populations, comparators, outcome definitions, and no such test.
- `AR-44` Q3 presents 20 mg/kg/day oral loading as a Bowden 1994 recommendation.

Plus six DOI/label mismatches on the attested landmark page (Stanley 2012 → 2018 DOI; Bridge 2007 → Hammad 2006; Gabbard 1995 → 1993; Norcross 2011 → Flückiger 2018; Foa 2005 → 2002; Moncrieff 2022 labelled "withdrawal," is the serotonin-theory umbrella review).

**`evidence_registry.json` is ~90% decorative.** 7 of 71 `topic_meta` entries carry `evidenceIds`; 26 of 36 registry sources are referenced by nothing — including `lieberman-2005-catie`, `rush-2006-stard`, `linehan-1991-dbt`, `canmat-isbd-bipolar-2018`, every one of which is **quoted by name in the prose** of a page in this library. Wiring the ten already-registered sources the prose already names to their `topic_meta` entries is roughly an hour and converts the registry from ornament to infrastructure.

---

## 4. Tier 2 — The "you are competent" surfaces

This is a different animal from the psychometric complaints in §8. These are tools that **tell a student they are competent when they have demonstrated nothing**.

| Surface | Defect | Effect |
|---|---|---|
| `reasoning_cases.json` (13 steps) + `reasoning_cases_resident.json` (12 steps) | Key is option **[a] in 25/25 steps** | Click the top button on every screen → *"Strong reasoning"* on every step; progress bar reads **4 of 4 cases completed** |
| `communication_cases.json` (10 cases) | Key is option **"b" in 10/10"** *and* the longest option in **10/10** (mean 175 vs 60 chars) | Two stacked giveaway cues on the one tool whose declared construct is communication skill |
| `review.html` (Daily Review) | No option shuffle; key at index 0 in **220/437** of `quizzes.json`; keyboard handler makes "1" one keystroke | Press "1" → ~50%. The SRS records those keystrokes as **Easy** and stretches the interval. The Retention tile reports it as learning |
| `shelf-mode.html` | `shelfPool()` accepts only `SHELF-*` decks; **zero exist** in source or in either deployed build → falls to 5 hardcoded `SAMPLE` items on every load | Page advertises a *"timed, blueprint-weighted COMAT/shelf vignette simulation."* The 15-row blueprint table and `buildExam` allocator are dead code |
| `one-patient-six-weeks.html` | 18 self-attest checkboxes that **reveal the model answer as the reward for ticking**, and gate progression | Nothing is generated, compared, or scored — retrieval practice inverted |
| Both scored skills tools | Neither states it is formative; both persist a farmable "best" count (overwrite-on-click) | A screenshot of that bar is one email away from being a grade |

> **Inpatient attending:** *"A student who has 'completed' the reasoning workbench and passed the communication cases arrives on my unit believing something false about themselves, and I will find out on day 4 in front of a patient. False competence is worse than no competence: a student who knows they don't know asks; a student certified 4/4 by your workbench walks into the room alone. And Shelf Mode is its own harm — students plan around practice-test scores. **Turn it off before you fix it.** A disabled state is honest; a startable exam with no exam in it is not."*

**Fixes, all small:**
1. `review.html:222` — `shuffle()` is already defined at line 122 and used only for queue order. **One line.**
2. Shuffle option order at render in `diagnostic-reasoning.html` and `communication-practice.html`; rotate keys in both JSON banks.
3. Gate `shelf-mode.html` as a disabled preview; remove the 10/20/40 selector and the "blueprint-weighted COMAT simulation" copy today.
4. Add a visible *"Formative only — not a grade; do not submit these counts"* line to both scored tools, and store first response rather than best.
5. Add a CI assertion: **no bank may key the same positional index in >40% of items.**

### 4.1 Two case-bank defects worth fixing on clinical grounds

- **`family-systems-practice.html:247`** hard-codes the draft badge with no `reviewed` branch — after attestation all 8 scenarios will permanently display *"reviewed - faculty review needed."* One-line copy from the sibling tools.
- **All 22 cases ship stamped `facultyReview: draft` / "faculty review needed"** while the tool pages carrying them are attested in `reviewed.json`. Two sources of truth disagree, and the learner-facing one says the content is unvetted. Attest at case level or inherit page-level attestation — do not ship both.
- **The MSE builder** permits contradictory multi-select (`no SI/HI` + `active SI`) and has a **Copy as prose** button that emits *"Thought content is notable for no SI/HI, and active SI."* It also emits ungrammatical prose (*"The patient appears stated age, disheveled, and poor hygiene"*) because the copy renderer differs from the on-screen one. And at `:117` it defines MSE **judgment** as *"capacity to make reasoned, safe decisions"* — conflating it with decisional capacity, which drives holds and refusal-of-treatment decisions.

> **Inpatient attending, on the MSE builder — a harder critique than the audit's:** *"The grammar is real but my complaint is deeper. **A checkbox-to-prose generator is pointed the wrong way for this skill.** The MSE is an observational skill; its value is that it forces a trainee to convert what they saw into language. A tool that converts pre-selected categories into sentences automates away the exact cognitive step the exercise exists to train. The 'Copy as prose' button is the problem, not the grammar."*

Suggested replacement: a **"Fix this MSE"** tab — two or three weak drafts (interpretive, stigmatising, missing SI/HI) with a reveal-the-rewrite, plus exemplars for a catatonic and a delirious patient. You currently have exactly one exemplar (manic, 9 lines, every line already good), which teaches recognition of good writing and never asks the learner to produce any.

---

## 5. Tier 3 — The Interview Room (AI standardized patient)

**Build status matters here and the design doc will mislead you.** The infrastructure is real and better than most: server-side state derivation, gate-leak defence with 48-scenario parity tests, model/token pins, timing-safe passcode compare, CORS pinning, metadata-only logging, a fail-closed governance chain. The clinical writing in the personas is excellent. But:

- **Case bank = 3 cases; 1 is learner-reachable** (Dana — depression + active SI). Marcus and Ray are `facultyReview: draft`.
- **The live LLM path currently 403s** because `pack.status` is `draft-pending-attestation` ∉ `POST_PACK_STATUSES`. Every encounter today runs the deterministic MockProvider.
- **The resident overlay is DESIGN-ONLY.** No agitation/capacity/collateral/med-error cases, no milestone anchors, no `events[]`, no `LOCAL_POLICY` tokens. Both sites ship the byte-identical MS3 file.

### 5.1 The assessment layer is not fixable by tuning

Four executed findings, all reproduced by the reviewer against the shipped code:

1. **Coverage scores keyword emission, not information obtained.** One turn — *"Have you had thoughts of killing yourself?"* — the patient deflects, the SI gate stays **LOCKED**, and the debrief renders `c_si: observed` plus the strength line: *"You asked about suicide in plain language. That is exactly why she told you the truth."* She told them nothing.
2. **The disclosure gate is a counter.** `si_active` requires rapport ≥1; rapport increments per regex "reflection" hit with no first-time-only rule. `["That sounds really hard.", "Have you had thoughts of killing yourself?"]` → full SI reveal in two turns. Marcus's mixed-SI gate requires rapport **0** and unlocks cold on turn one.
3. **The technique regexes punish correct technique.** `"you should(n'?t)?"` flags *"You shouldn't have to carry all of this by yourself"* → `judgmental`, **−2**. `"slow down[.!]"` flags *"I hear you. Let's slow down. Walk me through your sleep"* — the exact warm redirect the mania case's own teaching points reward — → **−2**, and the patient snaps *"CALM down. Great. Revolutionary clinical technique."* A −2 also arms `blockedByRecentFlags` for two turns, so correct technique **locks the SI gate.**
4. **Nothing requires a turn to be a question or a sentence.** Fifteen turns of bare noun-strings (*"mood sleep appetite energy concentration guilt"*, *"plan"*, *"voices"*) unlocked every gate, scored 8/8 checklist items `observed`, rubric `data: observed`, `technique: observed`, plus two strengths.

Plus: **"EVERY claim must quote a numbered turn verbatim" is prompt text with zero enforcement**, and the schema **requires exactly two strengths** — a learner who did nothing well cannot receive fewer; the server throws `providerFailed()`. The deterministic fallback printed the same praise sentence twice.

> **Inpatient attending:** *"That is not a bug, it's a curriculum, and it teaches the exact error that gets people killed: **asking is not the same as knowing.** The most common failure I see, by a wide margin, is a student who asks about suicide once, receives a flat 'no,' and writes 'denies SI.' Your SP rewards that."*

> **CL psychiatrist:** *"A rubric that structurally cannot say 'nothing here was done well' is not an assessment. It's a compliment generator with a clinical vocabulary. And the SP evidence base says the debrief **is** the active ingredient — everything else is scaffolding for it. So the one component that could produce transfer is the one that's fabricated. Turn off the score and keep the conversation, not the reverse."*

**Rebuild order (do not ship the score until all five are done — intermediate states are worse than no score):**

| # | Change | Effort |
|---|---|---|
| 1 | **Coverage moves to the patient side.** A checklist item is `observed` **iff the patient emitted the content**. The state machine already knows what it revealed. This single change fixes findings 1 and 4 — if gates open only on disclosure, noun-strings stop working automatically | Small |
| 2 | **Gates move to authored preconditions transcribed from `hiddenAgenda`.** The correct model is already written as prose — shame, fear of commitment, prior bad experience. Transcribe it: *"she will not talk about the firearm until you have acknowledged the divorce and she has not been interrupted for three turns; she shuts down for two turns if you ask about means before she has told you she's been thinking about dying."* Hand-authored, deterministic, testable — and the preconditions **are** the lesson | Medium (per case; highest-value clinical authoring in the project) |
| 3 | **Delete the technique flag regexes entirely.** There is no regex that scores empathy | Trivial |
| 4 | **Evaluator:** verbatim-quote enforcement as a hard validator (reject any evaluation whose quoted string is not literally a substring of the transcript; retry once; then fall back to *"evaluation unavailable — review your transcript with your supervisor"*). **Strengths minimum: zero.** No deterministic praise fallback. Apply the CI `DOSE` regex to model output | Small |
| 5 | **Complete the coverage checklists.** Dana has **no prior-attempt and no lethal-means/firearm item** while citing VA/DoD 2024 as its evidence base. Ray — command hallucination naming an identifiable upstairs target — has no access-to-means and no prior-attempt item. Marcus — manic, found with a shovel at 4 a.m., "flip to furious in ninety seconds" — has no organic screen and no violence screen. *A student can currently score full coverage on a suicide interview without ever asking about a gun* | An afternoon per case |

### 5.2 The duty-of-care gate — do this before anything else in §5.1

This is the only part of the library where **someone could be hurt rather than mistaught.** The tool is `riskLevel: high`; its only reachable case is active suicidal ideation; there is **no out-of-scope detector, no 988, no crisis resource anywhere in the flow**; and the entire safety net is a post-hoc aftercare note on the debrief screen naming one person.

> **CL psychiatrist:** *"Roughly a fifth of medical students screen positive for depression in a given year, a meaningful minority have their own history of suicidal ideation, and some fraction have never told anyone at your institution. You are putting them alone, unsupervised, with a system whose explicit optimization target is to elicit a suicide disclosure — and then grading them on how well they did it. The system has no idea when that's gone wrong and no way to find out."*

Non-negotiable before the 403 is lifted:

- **Out-of-scope / distress detector with a hard interrupt** — not a scoring penalty. Ends the encounter; shows 988, Crisis Text Line, the local crisis line, student health with actual hours, and the on-call number. Fires generously; false positives cost nothing.
- **Crisis resources on every screen of the encounter**, not on the debrief.
- **A prebrief with a real opt-out** — *"This case involves suicidal ideation. If that's not something you want to sit with today, choose a different case — no one is notified."* And make it true: do not log the opt-out in a way that identifies who took it.
- **At least two named humans in the aftercare path, one of whom is not the clerkship director** — the person a distressed student is least likely to tell is the person who grades them.
- **A rule that the SP never escalates SI content in response to learner hesitancy.** If the student slows down, the patient does not push harder.
- **Somebody's name on the decision, in writing.** If a student has a bad night after using this at 11 p.m. from their apartment, who is accountable?

> **CL psychiatrist:** *"One point of luck worth naming: an accident of your governance chain — the pack-status 403 — is the only thing currently protecting your learners. Don't lift that gate until the list above is done. And treat the fact that it's holding as evidence the fail-closed design was worth building, because it is."*

### 5.3 What to require before it goes live at all

1. **A second psychiatrist reviews each case pack.** `facultyReview` is currently the author attesting his own pack one day after writing it. That is a timestamp, not a review.
2. **An adversarial transcript set as a merge gate** — minimal input, noun strings, hostile input, off-topic input, the student who types the answer into the question, the student who says nothing, the student who is rude. Each with expected system behaviour. The reviewer found four criticals by trying four obvious things; that entire class should be caught by CI.
3. **A "fails correctly" test.** Take a deliberately bad encounter and assert the debrief is bad. *If the system cannot produce a poor evaluation, it cannot produce a good one.*
4. **A real pilot** — ten encounters, transcripts read end to end by you. Not a mock-provider golden transcript: that tests the mock, and cannot detect live actor drift by construction.
5. **A read-the-transcripts loop** — ten encounters a week for the first month. This catches drift faster than any golden transcript, and it is how you would supervise a human SP anyway.

---

## 6. Tier 4 — The consult layer

Judged as a consult curriculum, the verdict from the CL reviewer is blunt and, on inspection, correct:

> *"You have built an excellent inpatient psychiatry library and labeled it 'inpatient + consult.' The consult layer is one 935-word MS3 module and one 61-line resident reference. Both are good. Neither is a curriculum."*

What is handled well: the question behind the question (`exp_consult.md`'s five opening questions are better than most fellowship teaching), catatonia (the most completely built topic you have), the NMS/SS discriminator, `inpatient_differential_scaffolds.md`, and the four-abilities framework.

**Absent entirely** — every item below is something a PGY-2 meets in their first week:

| | |
|---|---|
| **Delirium ownership** | The hard half of every delirium consult is the negotiation, not the diagnosis. Students need one memorised sentence: *delirium is a medical diagnosis; the workup and disposition stay with the primary team; psychiatry helps with the behavioural phenotype and the medication reconciliation.* Plus: accepting transfer of a delirious patient to a psych unit — no telemetry, no rapid response — is usually a harm to that patient, and they need a script for saying so without starting a war |
| **How to write a note the medicine team will follow** | **Highest-yield single document you could add.** A seven-heading skeleton is not the skill. The skill is numbered, specific, executable recommendations with who/what/when on one line, the reason on the *same* line, a contingency (*"if he is still refusing at 1600, page us — do not wait for morning"*), an explicit re-consult trigger, and the discipline of **not** putting a five-item differential where an order should be, because the intern cannot act on a differential and will skip the block |
| **Capacity vs. commitment** | The most common trainee misconception, annually, without fail |
| **Surrogate hierarchy, advance directives, treatment over objection, the emergency exception** | The *second half of every capacity consult*: you determine incapacity and the question is immediately "so who decides?" |
| **AMA discharge** | Zero hits in the MS3 build. Capacity to leave, documenting the conversation, what AMA does and does not do to liability and insurance (the "insurance won't pay" claim is a myth students repeat), and that an AMA patient should still leave with prescriptions, naloxone and follow-up |
| **"Medically clear" / "clear them for discharge"** | The archetype of a whole missing genre: consults where the question is not answerable as asked and your job is to reframe it without insulting anyone |
| **1:1 sitters** | The most-requested and least-understood consult recommendation in any hospital. Who orders it, what it is for, what it demonstrably does *not* do, how it gets discontinued, and the uncomfortable fact that "psychiatry recommended a sitter" functions as a liability artifact |
| **Restraint law on a medical floor** | Behavioural vs non-violent medical restraint are governed differently — different orders, time limits by age band, face-to-face windows, monitoring and renewal. A student who learns your psych-unit rules and applies them on a medical floor will be wrong, confidently |
| **Ligature risk / environmental safety on a medical floor** | A medical room is full of tubing, cords and hardware |
| **Medication reconciliation and abrupt-discontinuation hazards** | The most common iatrogenic psychiatric event on a medical floor is not a new side effect, it is a **stop**: SSRI discontinuation misread as anxiety, benzodiazepine withdrawal misread as delirium, **clozapine held past 48 h requiring full re-titration** (a card unto itself), lithium held during AKI and restarted at home dose, the MAOI nobody noticed before the fentanyl |
| **Steroids, interferon, checkpoint inhibitors** | Checkpoint inhibitors: zero hits repo-wide. Immune-related hypophysitis presenting as depression; encephalitis presenting as psychosis |
| **Perioperative buprenorphine and opioid co-management** | Zero hits on "perioperative." Guidance has changed — continue through surgery in most cases rather than the old taper-off reflex |
| **Transplant / bariatric pre-surgical evaluation** | Zero, repo-wide. A defined genre with its own structure, instruments (SIPAT) and ethics — and where a student first encounters psychiatry holding gatekeeping power over a scarce resource |
| **Oncology: demoralization, desire for hastened death** | "Demoralization" appears once, as a list word |
| **End-of-life and terminal delirium** | Zero hits on palliative. Terminal delirium is a different clinical object with different goals; a student applying the standard algorithm at end of life will do harm |
| **Hepatic encephalopathy vs psychosis** | Listed as a mimic, never taught |
| **PICS / ICU follow-up** | Zero |
| **The liaison half of consultation-liaison** | *"The patient is difficult"* is the consult question maybe a third of the time. Reading the request as data about the requester, recognising team splitting, knowing that sometimes the intervention is a conversation with the nurse manager and not a medication. **This is half the name of the specialty and it is nowhere** |
| **Time discipline and consult triage** | Consults are same-day. The note has to be in before the team rounds tomorrow or it doesn't exist. Eight consults, three urgent. What a curbside is and why you document one |
| **Agitation in the medically fragile / ICU** | A different disease from agitation on your unit: different agents, lines, dexmedetomidine, restraint rules — and **every instrument in this library is invalid in an intubated patient**. The CIWA card says this once; BFCRS, C-SSRS and the capacity module say it nowhere |
| **QTc as a decision tree** | Resident-only, no MS3 version, no tool. *"The medicine team wants to know if they can keep the haloperidol with a QTc of 505"* is a several-times-a-week consult. Add the one-line trap students actually fall into: they read the machine-printed QTc without checking rate, rhythm or QRS, and Bazett overcorrects at tachycardia — so the tachycardic withdrawal patient gets a spuriously alarming number and somebody's haloperidol gets held for nothing |
| **Catatonia on a medical floor** | Presents as *"poor motivation," "failure to thrive," "he won't participate with PT"* — and the primary team will ask you to start an antidepressant |

> **CL psychiatrist:** *"Build six pages — consult recommendation writing, delirium ownership plus a real delirium instrument, medical-floor restraint/sitter/environment, medication reconciliation and discontinuation hazards, AMA/clearance/refusal, and the liaison half — and you roughly double the value of this library for the audience on the label."*

**And one reframe worth more than any of the six:** *capacity is taught as adjudication when the actual skill is restoration.* A large share of capacity consults end with the patient consenting once somebody actually explained the thing in language they could use — the deaf patient nobody got an interpreter for, the patient whose "refusal" was fear of a specific complication nobody addressed, the delirious patient who is lucid at 10 a.m. and wasn't at 4 p.m. Your reversible-contributors checklist gestures at this and it is good. But the frame teaches students to *decide* rather than to *fix*, and the fixing is most of the value we add.

---

## 7. What the reviewers said neither audit noticed

The most valuable material in the peer review was not a correction — it was a category of content nobody had audited for, because the auditors read the library as a *document* and the clinicians read it as a *rotation*.

### 7.1 The library is written in daylight, and half of psychiatry happens at night

> **Inpatient attending:** *"Everything here assumes rounds, a team, an attending, an EMR, and time. But the moments that decide whether a student's patient is safe happen at 2am, and at 2am there is one nurse, one covering resident who has never met your patient, and your note. Which means **the note is the 2am intervention**, and nothing in the library says that out loud."*

The frame he suggested, verbatim, for the documentation page: *"Write the note for the person who will be woken at 2am to make a decision about your patient without ever having met them. That person is the only reader who matters."*

**And the single most requested missing section: what a PRN order actually is.** A student writes, or asks for, "PRN for agitation." At 2 a.m. that is not a medication — it is a decision handed to a nurse with no criteria attached. A PRN without a trigger, a route preference, a maximum, and a *"call me if you use it twice"* is an unfunded mandate. ~200 words, and it changes how a student is regarded on a unit within a week.

Also absent: **the overnight events that generate the morning's actual work.** The first thing a student should do at 6:45 a.m. is not open the chart — it is find the night nurse before shift change.

### 7.2 Nursing — the single largest hole, and not one auditor mentioned it

> **Inpatient attending:** *"On a 24-bed unit, nursing determines patient safety and determines whether a student's rotation goes well. Here is what my nurses complain to me about every single block, and none of it is in here."*

- **Students who walk into a room alone with a patient nobody warned them about.** *"Your violence tool teaches an ED intake screen and an 8-item checkbox list. It does not teach **the sentence**: 'Anything I should know before I go see him?' That question, asked reliably, prevents more violence on my unit than any instrument on that page."*
- **Students who promise things** — a pass, a discharge date, a medication change. The patient hears a promise, the nurse absorbs the fallout at 8 p.m., and the student never knows. *"A student has no ability to promise and enormous ability to imply."*
- **Students who don't say where they're going.** Boring, structural, and the most common complaint he receives.
- **"Denies SI" with no second question** — which the nurses see, because they're the ones asked at 10 p.m. whether the patient is going to be locked up forever.

And the reciprocal, which he called the highest-value single thing that could be added: *"The nurse spent twelve hours with your patient and you spent twelve minutes. When a nurse says 'something's off with him today,' that has a better predictive track record than your MSE. Teach students to write it down, attribute it, and bring it to rounds as **data** — 'Nursing reports he's been pacing since 4am and declined breakfast, which is a change' — instead of as gossip. A student who does that gets treated like a colleague by day three."*

### 7.3 What students actually get wrong in front of an attending

- **They stop after the first "no" on suicide.** You have 21 suicide items, a C-SSRS tool and a pocket card, and **not one artifact that drills the second question.**
- **They don't touch the patient.** No vitals reviewed, no gait, no reflexes, no look at the tongue. The Medical Workup page is good and entirely cognitive. *"On this rotation you personally lay hands on your patient, because you are the only person on the team with time to notice the tremor."*
- **They over-identify with the patient their own age and under-identify with the patient who is frightening or repellent** — and nobody has named that out loud for them, so they think it is a personal defect rather than the ordinary condition of the work.
- **Medication reconciliation** — the "psychosis" that is prednisone, the delirium that is the anticholinergic started last month, the person stacking three serotonergic agents across three prescribers. Anticholinergic burden is named as a toxidrome and never taught as a burden.
- **Sleep as an intervention, not a symptom.** In the first 48 hours of a manic admission, restoring sleep is the most effective thing done. The sleep-wake page is a *disorders* page.

### 7.4 The emotional and professional-identity side

You have `reflection.html` and the instinct is right. What actually happens in six weeks: a student gets frightened by a patient; is told something horrifying in a flat voice and has to keep their face still; gets attached to someone who leaves AMA against everyone's advice; watches a restraint and feels sick and doesn't know if that means they're too soft for this; finds out later that a patient they knew died.

> *"None of that is preventable and all of it is survivable if someone told you in advance that it happens and that it isn't a sign you're unsuited. That's a page. It costs nothing and it's the thing they'll remember in ten years."*

And one reframe for the orientation packet: *"On medicine, students are useless because everything takes them four times as long. On psychiatry, students are useful on day one, because the scarcest resource on my unit is unhurried time with a patient and the student is the only person who has any. Nobody tells them that, so they spend two weeks apologising for existing, and then leave thinking psychiatry is where you go to be underemployed."*

Finally: **what a student does when they disagree with the team.** They will watch a discharge they think is unsafe or a restraint they think was avoidable. Give them a script, a person, a timing, and explicit permission — plus the reassurance that raising it well is a skill they're being graded on, not a risk to their evaluation.

---

## 8. Contested findings — where the reviewers overruled the audit

Included because acting on all four audits uncritically would make parts of this library **worse**.

### 8.1 The C-SSRS "risk stratification is discredited" critique — **partly rejected**

The audit filed this as CRITICAL and demanded a persistent PPV/base-rate panel. Both clinicians pushed back.

> **Inpatient attending:** *"The auditor is right on the **label**. 'HIGH RISK' is the wrong string — the Screener with Triage is an **action table**, and printing 'HIGH risk' makes it read like a prediction. Change the output header to the action and 90% of the concern evaporates. But the substantive claim — no. First, this is how the instrument is used in every hospital in the country, including mine; a student who learns the categories is learning the language of the actual workplace. Second, the PPV argument proves too much: that statistic is about predicting suicide death over a follow-up period, and nobody using this at intake thinks they're doing that — they're deciding whether this person gets a 1:1 tonight, and for that decision a highly sensitive screen with poor specificity is exactly right. Third — **a wall of epistemological caveats teaches learned helplessness.** I have met the resident produced by that teaching. She can explain beautifully why no instrument predicts suicide and she cannot tell me what she's going to do about the patient in room 12 tonight."*

**Resolution — three changes, one sentence each:**
1. Relabel the output **"Screen result → required action"** and print the action, not a tier.
2. Add the one line of honesty that changes behaviour: **a negative screen is not safety** — roughly half of people who die by suicide denied ideation at their last contact. *(This prevents a real error — writing "C-SSRS negative" and going home. The PPV panel prevents nothing.)*
3. Copy the **tone** of your own FRST paragraph, which both reviewers named as the model: *"sensitivity was limited (~33%), so a negative screen does not rule out risk; the FRST supports structured clinical judgment, it does not predict violence."*

### 8.2 The demand for full published CIWA-Ar anchors — **right diagnosis, wrong prescription**

> **CL psychiatrist:** *"You cannot ship a 0–7 item with two poles — the auditor is right that as-shipped the item is unscoreable and every rater improvises. But dumping eight anchor strings × ten items onto a phone screen produces a wall of text that a student at 2 a.m. will scroll past, and you will have traded an unusable card for an unread one. **Reproducing everything produces a document that is technically complete and clinically unused, which is the same failure as producing nothing, only more expensive.**"*

The four-line-per-item pattern he specified is in the companion spec (§9.2 below, full content in `SPEC_Withdrawal_Instrument_Redesign_v1.md`).

### 8.3 The item-writing complaints — **one overcalled, one under-weighted**

- **Key position (48/49 drafts keyed A):** the shipped UI shuffles (`question-bank-practice.html:368`), so this is **invisible to every student**. It matters as a **provenance signal** — those 49 items came off a generation run with no randomisation, which predicts everything else wrong with them — and for Anki export and print. Metadata hygiene. Do not rank it near the top.
- **Longest-option cueing (85.4% bank-wide, 91.6% attested):** both reviewers took this seriously, for different reasons.
  > *"An MS3 doing formative practice on their own time is not gaming your bank. The actual harm is subtler: **you are training a heuristic that will fail them on the shelf.** NBME item writers specifically balance option length. A student who spends six weeks being rewarded for picking the long hedged option walks into the COMAT with a broken instinct."* — inpatient
  > *"A cued item measures test-wiseness and then tells the student they knew the medicine. That is **strictly worse in a formative bank than a summative one**, because here it produces a false confidence signal the student carries to the bedside — which is precisely the failure mode your own calibration panel names."* — CL
- **The COMAT/NBME blueprint mismatch:** overcalled. You built an inpatient bank for an inpatient rotation; that is the correct decision. **The defect is the marketing, not the bank** — `shelf-mode.html` claims a "blueprint-weighted COMAT simulation." Fix the sentence.
- **Item p-values / point-biserial / append-only response history:** overcalled. *"You will have thirty-odd students a year. You will never power a discrimination index that means anything. Don't build psychometrics infrastructure you can't power — build the two or three structural checks you can run without students at all."*
- **28% meta/pedagogical stems ("A student is asked…"):** defended. *"Teaching a student how to talk to their attending about a clinical concept is legitimate clerkship content and a genuine skill. It's just not shelf content, and that's fine as long as nothing claims otherwise."*

### 8.4 The confidentiality-monologue key (`communication_cases.json:146`) — **audit overruled, with an amendment**

The audit argued the keyed best answer (a 383-char, 63-word confidentiality paragraph) rewards information-completeness rather than skill, and that the demoted option D (*"What are you worried might happen if you tell me more?"*) is what an experienced interviewer would actually say.

> **Inpatient attending:** *"I side with Josh, and I think the auditor made a specific analytic error: he judged the item against **his** learning objective instead of the item's stated one. The case declares `learnerGoal: 'Lower the threat level, name choice, and explain confidentiality limits without pressuring disclosure'` and lists three `mustInclude` items. Option B hits all three; D hits one. You can disagree with the objective; you can't call an item defective for achieving the objective it declares. And the objective is right, because it corrects an error I see constantly: students say either 'everything you tell me is confidential' — a lie they will be caught in, usually within a day — or, having been scared by a Tarasoff lecture, they front-load an ominous warning that stops the conversation. Option B threads it: routine team sharing is **not** a confidentiality breach, and the real limits are imminent risk and mandated reporting. Most attendings I know can't articulate that cleanly on demand."*

**Amendment (accepted):** sixty-three words to a man with his arms crossed is a wall, and walls confirm the fear. **B is written as a teaching paragraph wearing a quotation mark.** Cut it to ~25 words — *"You get to choose what you answer. What I'd have to share is an immediate safety risk. Otherwise this stays with the team caring for you"* — and promote D to co-acceptable with feedback that names the real judgment: *"B and D differ in sequencing, not quality — B if the patient's fear is about the system, D if it's about you."*

**And the structural insight underneath it, which is worth more than the item:**

> *"Your communication cases force a single best answer onto items whose actual content is a judgment call. That's **why** the key ends up being the longest option in 10/10 — when you have to justify one option as uniquely best, you write the most complete one. The length cue isn't a formatting slip; it's a structural consequence of the single-best-answer format applied to a domain that doesn't have single best answers. Two-tier — 'which would you say, and why?' — fits this content far better, and you already built the two-tier machinery."*

### 8.5 The Bipolar I differential key (`reasoning_cases.json:45`) — **audit overruled**

The audit called it premature closure. The reviewer disagreed on three grounds:

> *"One: clinically the key is right. One stimulant pill does not produce a week-long escalating manic syndrome with grandiosity, flight of ideas and goal-directed 2am investor-seeking. Daily cannabis is chronic, not new. The syndrome is mania; substance-induced remains on the differential and **the key explicitly says so**. Two: the auditor misread which option was penalized. The `partial` option isn't 'substance-induced' — it's 'substance-induced **because there was recent stimulant exposure**.' The `because` clause is the discriminator. The item punishes a causal inference from a single data point, which is the actual student error. He graded the option label instead of the option text. Three: **committing to a leading hypothesis with explicit rule-outs pending is not anchoring — it is the job.** Anchoring is refusing to update, and your case makes the student update at step 3. The version of the world the auditor's fix produces is a student who stands at the foot of the bed with a manic patient and says 'well, it could be a lot of things.' I have supervised that student. She is not being careful; she is being unwilling to be wrong in public."*

**Action: fix the key position (13/13 at [a]). Do not touch the content.**

### 8.6 Two more downgrades

- **Acute F20** (an unattested decision-aid linked from an attested tool) is filed MAJOR; it is a governance nit. *"The actual problem is that the seizure timing on that page is wrong, and it would be equally wrong if it were attested. **Attestation is not what makes content correct** — and treating it as though it does is the same habit that produced a 144-item review with zero items flagged."*
- **Acute F31** (engineering ADRs and psychoanalytic PDFs filed under `04_Acute_and_Safety/_source/`) is housekeeping, not MAJOR — *"though the 0-byte file named `06_Risk_Stratified_Discharge_Pathway.md` is a tell about something you meant to write and should."*

---

## 9. Policy fixes

### 9.1 The dose-literal policy — currently an evasion, and easy to fix

> **Inpatient attending:** *"The policy bans **numbers**. What it should govern is **authority**."*

Three different things are being swept into one rule:

| Category | Verdict | Example |
|---|---|---|
| **(a) Initiation and titration doses** a student should never choose alone | **Withhold** — but the way your eating-disorders page does it: *"Defer exact caloric targets and repletion doses to your institution's refeeding order set — the student job is to anticipate and monitor, not to prescribe."* The number is gone and the **role** replaces it | Antipsychotic start doses |
| **(b) Recognition thresholds and regulatory numbers — which are not doses at all** | **Always teach** | CIWA ≥15 · COWS 8–12 · QTc ≥500 or +60 · lithium ≥1.5 · **≥50% BFCRS reduction** · ANC thresholds · **restraint time limits by age band, face-to-face evaluation windows, monitoring intervals, order-renewal rules** |
| **(c) Numbers where the number *is* the safety teaching** | **Teach** | Lamotrigine titration — the whole point is that slow is the intervention |

> **CL psychiatrist:** *"**A ≥50% BFCRS reduction is not a dose** — it's a response criterion, and its absence makes your catatonia tool unable to do the one thing it exists for."*

And the policy is not actually being enforced: MS3 pages currently carry propranolol 20–40 mg BID, clonazepam 0.5–1 mg, mirtazapine 15 mg, fluoxetine target 60 mg/day, lithium 0.6–1.2, "citalopram dose ceilings." *"So you have the costs of the ban without the benefits."*

**The deeper problem** is that the MS3 tier is dose-free **and** reasoning-free. There is no definition of an adequate trial anywhere in it. No expected latency. No *"start low go slow, except in acute mania and catatonia where slow is the harm."* No PRN-vs-standing logic. No *"'failed an antidepressant' usually means underdosed or under-duration"* — that is on your resident page, it requires no numbers, and it belongs at MS3 level.

**Drop-in policy paragraph (put it on every dose-free page):**

> *MS3 pages carry no initiation or titration doses. Thresholds, therapeutic ranges, monitoring intervals, regulatory limits and response criteria are always teachable and always taught. Resident pages carry doses under an institutional-protocol banner. By design, this page stays dose-free; the numbers live on the resident reference.*

*(Your own `cl_reference.md:26` already wrote that last sentence. When a policy is invisible, learners experience it as arbitrary omission and stop trusting the page.)*

### 9.2 Attestation is being read as a claim about content when it is a claim about process

The evidence is consistent and it will eventually be noticed externally:

- **144 items, one date, one reviewer, zero flagged, zero pending** — two weeks after a prior audit found 53 problems in the same 144.
- **Post-attestation drift is invisible.** Commit `e36809c` (four days after sign-off) materially rewrote attested item content — `qb_eth_005`'s stem, `qb_rel_006`'s option D, `qb_pha_011`'s pearl. No re-attestation; the ledger still reads clean. The attestation record is `{status, at, by}` only — nothing binds it to the text it approved.
- **`question_bank.json:2` claims** *"All 144 items attested"* in a file containing **192** items; **46 unattested drafts (24.3% of shipped) are served to students.** The per-item chip is honest; the file-level claim is not. This may be a fine decision — it should be one you made on purpose and can defend to a clerkship committee, not one inherited from a stale string.
- **`quizzes.json`** — 437 assessment items, 427 KB **stored as a single line**, no schema, absent from `validate_registry_schemas.py`, no attestation ledger, self-declared AI extraction provenance — while both consuming tools are marked `reviewed`. *"The tool is attested; the 437 items it serves are not, and cannot be."*
- **Attested pages contradict attested tools** on the same topic (the MS3 catatonia page says never quote a dose; the BFCRS tool quotes one), and one attested page carries a citation whose source concludes the opposite of what it is cited for.

**The fix already exists in your repo and is unwired.** `13_Faculty_Resources/_automation/anki/pcl_anki/qbank.py:30–137` implements `QB_HASH_FIELDS` and `qbank_item_sha256()` — canonical-JSON content hashing over stem, options, why, pearl, evidence, category. Write that hash into the attestation record; add a CI step that re-hashes and fails on drift; require a second reviewer for `status: reviewed`; correct the `_note` to state actual counts.

### 9.3 Licensing — a finding neither audit raised

> **CL psychiatrist:** *"While the auditor was litigating base rates, they walked past the fact that you are reproducing **licensed C-SSRS items verbatim on two public Netlify sites**. CIWA-Ar and BFCRS are effectively free to reproduce; COWS is public-domain via NIDA; the C-SSRS is licensed through the Research Foundation for Mental Hygiene. Somebody should check that before this gets any more traffic."*

**Action:** confirm the C-SSRS license terms for web reproduction and educational use before the next block. Same check for FRST (proprietary/local version) and for anything else reproduced verbatim.

### 9.4 Formative framing must be technical, not asserted

Neither scored skills tool says it is formative; both persist a farmable "best" count. The SP design doc says "formative only, forever" and nothing enforces it. Add the visible line, store first response rather than best, and suppress per-domain reporting where n < 5 items per domain (currently Safety n=1, Psychosis n=1, Medication n=1 — and the tool renders a per-domain breakdown anyway).

---

## 10. Instrument validity scorecard, and the redesign principle

| Instrument | Item anchors | Administration rules | Interpretation | Misuse warnings | Rater calibration | Grade |
|---|---|---|---|---|---|---|
| **CIWA-Ar** | ✗ endpoint fragments; 6 of 8 levels unlabelled per item; no elicitation for any item | ✗ no rater, frequency, training, hold parameter | ~ bands present, **≥15 collapsed**; ≤8 "often no medication" unsafe | **~ best in the set** — names delirium/intubation/language-barrier invalidity, but misdirects to PAWSS | ✗ | **D** |
| **COWS** | ✗ endpoint fragments **+ impossible scores on 10 of 11 items** | ✗ none | ~ 4 tiers, meter labels contradict bands | ✗ none — no methadone, no pulse confounders, no effort-dependence | ✗ | **F** |
| **C-SSRS Screener** | ~ stems verbatim, **all timeframes missing**, Q6 examples missing | ✗ no rater, no verbatim rule, no invalidating conditions | ✗ risk tiers with a stale-answer bug | ~ one generic line | ✗ | **D−** |
| **BFCRS** | ~ **best coverage in the set** — 4 levels × 23 items — but Withdrawal anchors wrong, 3 items accept invalid 1/2 | ✗ **no examination procedure at all**; no observation window; rigidity exclusion omitted | ~ screen and severity correct; **no response criterion**, **no malignant-catatonia interrupt** | ✗ | ✗ | **C−** |
| **Violence / FRST** | ✗ homemade 8-item list has no anchors | ~ site-specific and untokenized; md points to a nonexistent BVC tool | ✓ **best interpretation writing in the library** | ~ excellent on FRST, none on the homemade list which nonetheless issues an n≥1 directive | ✗ | **C** |
| **Decisional Capacity** | ✓ four abilities well operationalized with verbatim probes | ~ good reversible-contributors checklist; no interpreter protocol; no MacCAT-T | ✗ **declares capacity when nothing assessed**; sliding scale captured and never applied | ~ strong principles grid; no commitment/treatment-over-objection boundary | ~ **one** worked case — the only calibration artifact in the library | **C** |

### 10.1 Should a teaching instrument compute a score at all?

> **CL psychiatrist:** *"Different answer per instrument, and the principle is: **compute what the instrument was built to produce; never compute the action.**"*

| | |
|---|---|
| **CIWA-Ar / COWS** | **Yes, compute** — the total is the instrument's output and hiding it would be precious. Show the total and the driver items. **Strip every directive.** *"Often no medication"* is the tool acting; *"your highest drivers are tremor and anxiety; escalate per your unit's protocol"* is the tool describing |
| **C-SSRS** | **No risk tier.** Print the required action |
| **BFCRS** | **Yes — and this is the one where the score is the whole point.** It exists to be subtracted from a later score. Compute it, persist it, show Δ%. It is the only instrument whose number has a real job and the only one you cannot trend |
| **Violence checklist** | **No.** Delete the count. Replace with *"any of these means tell the team now — this list is not summed"* |
| **Decisional capacity** | **Absolutely not.** Structured report, then stop |

### 10.2 All five instruments promise trend and none can hold two data points

> *"Score the current state, **repeat over time**… **The trend matters as much as the number.**"* — CIWA card `:193`
> *"Perform and document **serial** CIWA-Ar or COWS scores… and **flag trends** to the team."* — SUD page `:22`
> *"Independent of the screen — **track it to follow response**."* — BFCRS `:186`

Zero localStorage writes across all five tools. The audit filed this MODERATE.

> **CL psychiatrist:** *"On a consult service you see the patient for ten minutes a day and the entire clinical question is **better or worse than yesterday**. A tool that says the trend matters and is structurally incapable of teaching a trend cannot model the work. On a psych unit that's an annoyance. On consult it's the central mismatch."*

**Fix:** a compliant `cw_ciwa_series_v1` / `rp_*` timestamped local series with a sparkline and a Δ-per-hour readout, and a pre/post Δ% for BFCRS. Both reviewers ranked this in their top two structural changes.

---

## 11. What actually moves inter-rater reliability

Because this is the question underneath *"the CIWA should have more scoring detail."* The CL reviewer's ranking of what degrades reliability at the bedside, in order of destructiveness:

1. **Motivated scoring.** *"The nurse who wants the patient to sleep and the nurse who has decided the patient is drug-seeking produce systematically different scores on the same patient. That is a bias, not noise, and no amount of anchor text touches it. It's the reason CIWA protocols get corrupted on real floors."*
2. **Not performing the elicitation.** Tremor is scored with **arms extended, fingers spread apart**. If you don't do that you are rating your impression. *"Your card omits the manoeuvre for tremor entirely — while the COWS tab, by accident, is the one place in either scale that states its manoeuvre. That asymmetry is the whole problem in one file."*
3. **Paraphrasing the stem.** *"You feeling anxious?"* and *"Do you feel nervous?"* pull different answers from a guarded patient.
4. **Construct bleed.** Dizziness scored into headache (the published item says *do not rate for dizziness*, and your card omits it). **Akathisia scored into agitation** — and you teach akathisia beautifully two folders over. Anxiety-driven tachycardia scored into COWS pulse. Room-warm sweating scored as paroxysmal sweats.
5. **Reported treated as observed.** CIWA mixes three observed items with seven asked ones and nothing marks which is which.
6. **Halo.** Rater decides "this guy's withdrawing," everything drifts up two points.

**Items 2–5 are fixable by design. Items 1 and 6 are only fixable by training.** That split should drive the build: the four-line item redesign handles 2–5; the calibration module handles 1 and 6.

The full seven-component calibration module spec — criterion-scored exemplars weighted to the *middle* rungs, directional feedback that names the error type (halo / reported-as-observed / construct bleed / manoeuvre not performed), confound cases where **"this instrument does not apply here"** is a correct answer, signed rather than absolute error reporting, a trajectory exercise, the **paired-rater exercise**, and actual agreement statistics — is in the companion document.

> **CL psychiatrist, on the cheapest high-yield item in the whole review:** *"Two students score the same patient independently at the same encounter, and neither sees the other's score until both are locked. Then they compare, in front of a supervisor, and account for the difference. Ten minutes. No software required. It produces the single insight that no amount of anchor text produces: **the number came out of you, not out of the patient.** If you build nothing else from this section, build a one-page protocol for this and put it in the week-one materials."*

---

## 12. What to protect

Both reviewers volunteered this list unprompted and asked that a revision not touch it.

- **The named-trap taxonomy.** *"Comfort-first induction," "It's just withdrawal," "Agitation = antipsychotic," "Quiet patient = stable patient," "Refusal = no capacity."* Naming the cognitive error rather than marking the option wrong is real instructional design; commercial banks don't do it. **If a psychometric cleanup threatens the traps, stop the cleanup.**
- **Confidence-before-answer, the "confidently wrong" count, and the sentence** *"Miscalibration on the wards is more dangerous than ignorance."* — *"the truest thing in this entire project."*
- **The two-tier `shaky` cap** (right answer, wrong reason → capped at Hard) and *"guess + correct = Hard (lucky guess ≠ mastery)."*
- **The shrinkage-corrected mastery estimate** `((correct+1.5)/(n+3))` with an explicit confidence label and one-click routing into the learner's weakest category. *"Almost nobody bothers to do this."*
- **`cl_reference.md` and `adv_psychopharmacology.md` as they stand.** Specifically: *"in serotonin syndrome, physical restraints are contraindicated — isometric muscle contraction worsens hyperthermia"*; *"clozapine-associated constipation is a lethal, under-recognized complication; a bowel regimen is part of the prescription"*; *"the patient who quits smoking at admission may need a dose decrease, not the reflexive increase"*; *"in chronic lithium toxicity symptoms may be severe even when the level looks only mildly elevated — treat the patient, not the number."*
- **The MS3 scope calibration in the consult expansion module:** *"Identify risk and escalate. Do not invent a withdrawal protocol. Know whether your unit uses CIWA-Ar, COWS, or other local tools."* Also the only asset in the repo that gets thiamine-and-hypoglycemia right.
- **The BPD page, whole** — the Lieslehto benzodiazepine warning with the CI attached and an alternative offered, and especially *"it is unstructured, open-ended stays — not length itself — that foster regression and dependency… so define discharge criteria on day one."*
- **The toxidrome discriminator.** *"Lead-pipe rigidity + hyporeflexia → NMS. Clonus + hyperreflexia, worse in the legs → serotonin syndrome. Serotonin syndrome is wet; anticholinergic is dry."*
- **The FRST honesty paragraph** — and copy its *tone*, not a caveat panel, onto the C-SSRS.
- **The safety-plan-vs-contract passage** and *"treat discharge planning as a safety intervention, not paperwork."*
- **The refeeding *"anticipate and monitor, not prescribe"* line** — the template your entire dose policy should be rebuilt on.
- **The restraint disparity figure framed as a quality-of-care issue rather than a footnote.**
- **The documentation and oral-presentation guide's "Common Student Pitfalls"** — *"treating 'denies SI' as a full risk assessment," "forgetting sleep and substances," "treating family as logistics rather than clinical context."* *(Note: this also corrects one audit finding — the admission presentation **is** taught, in the page. It is the tool that lacks it.)*
- **The family-systems retrieval loop** (generate → reveal → self-rate → SM-2) and the honest code comment about what a self-rating can and cannot contribute.
- **The spoken rapid drill** — forcing production before recognition is the best construct-validity move in the skills layer.
- **The SP personas.** *"Killing myself? No. I'm trying not to be killed. There's a difference."* · *"Never argue with grandiosity, never collude with it — curious neutrality is the lane."* *"The engine underneath needs work. The writing needs none."*
- **The OMM page's evidence honesty.** *"You had every incentive to fudge that and you didn't. That's the sentence that tells me the rest of the site is written in good faith."*
- **The PHI and no-storage discipline throughout.** *"Boring, invisible, and the thing that keeps this project alive institutionally."*
- **The fail-closed governance chain.** It is the only thing currently protecting learners from the SP's assessment layer, and that is evidence it was worth building.

---

## 13. Sequenced remediation plan

Ranked on patient-safety and learner impact, not effort. Both reviewers converged on the top three independently.

### This week — ~6 hours total

| | Item | Effort |
|---|---|---|
| 1 | **Capacity `verdict()`:** `'na'` forces the incomplete verdict; disable **Copy note** while any ability is `na` | 15 min |
| 2 | **COWS `vals[]`** — replace `max:N` with legal-value arrays; render only legal options | 2 h |
| 3 | **CIWA:** delete *"Often no medication"* as an unconditional string; add the ≥15 band | 30 min |
| 4 | **Seizure timeline:** overlapping bands, 6–48 h peak 12–24 h | 15 min |
| 5 | **BFCRS:** restore Withdrawal anchors; disable 1/2 on dichotomous items; correct "1–2 h" → ~5 min IV; state the ≥50% criterion; add the malignant-catatonia interrupt | 90 min |
| 6 | **C-SSRS:** add Past-month/Lifetime headers; clear q3–5 on Q2 change; add the verbatim-administration line; add "a negative screen is not safety" | 45 min |
| 7 | **`review.html:222`** — call the `shuffle()` already defined at line 122 | 1 line |
| 8 | **Disable Shelf Mode**; remove the COMAT-simulation copy | 15 min |
| 9 | **SP:** delete the three technique regexes; add crisis resources + out-of-scope interrupt; **do not lift the pack-status 403** | 2 h |
| 10 | **Add catatonia + acute dystonia to the psychosis page and the primer** — one sitting, same page | 90 min |

### This month

11. **Delete `verdict()`** and convert the capacity module to a structured report; add commitment-vs-capacity, treatment over objection, emergency exception, surrogate hierarchy.
12. **Rebuild CIWA-Ar and COWS as rating instruments** per the companion spec — four lines per item, legal-value arrays, orientation restored with serial additions, hold parameter, PAWSS as a separate admission-time pre-screen.
13. **Add serial persistence** (`cw_ciwa_series_v1`) with a sparkline and Δ-per-hour; BFCRS pre/post Δ%.
14. **Fentanyl-era buprenorphine branch** + rewrite `qb_sud_005` option C + re-key `qb_sud_014` + qualify `qb_sud_004`.
15. **Rotate keys and shuffle option order** in both skills case banks; add the CI positional-tell assertion; add the *"Formative only"* line to both scored tools.
16. **Fix the three citations** (Lima, Attia, Saitz), the four landmark-trial keys, the six DOI mismatches, and the NPH item; wire the citation checker to the landmark page.
17. **Rewrite the dose policy** per §9.1 and put the disclosure sentence on every dose-free page.
18. **`quizzes.json` distractor migration** — mechanical split of rationale out of option text into `fb`, plus a validator assertion (40% of the retrieval bank currently prints the answer before the student answers).
19. **Longest-option trim pass** using your own written rule: *"trim the correct option to the bare decision; rationale goes in `why`."*
20. **Confirm C-SSRS licensing** for public web reproduction.

### This quarter

21. **The six consult pages** (§6) — starting with consult recommendation writing, which both reviewers named the single highest-yield document you could add.
22. **A delirium instrument** (CAM/4AT + RASS) with the training-dependence note.
23. **The rater-calibration module** (§11 + companion spec), starting with the one-page paired-rater protocol in week-one materials.
24. **A Stanley–Brown safety-plan builder with a lethal-means module.**
25. **SP rebuild** in the five-step order (§5.1), then a real pilot with transcripts read end to end and a second-reviewer requirement on every pack.
26. **The rotation layer** (§7): the 2 a.m. frame, PRN order anatomy, the nursing page, the "what students actually get wrong" page, and the emotional/professional-identity page.
27. **Wire the content-hashing attestation** (`pcl_anki/qbank.py`) into CI; add second-reviewer requirement; correct `question_bank.json:2`; decide explicitly whether drafts ship.
28. **Bipolar depression, lamotrigine, LAIs, TD/VMAT2, xylazine, geriatric agents, reproductive pharmacology** — the Tier 1 content block.

---

## 14. Open questions for you

1. **Do unattested drafts ship?** 24.3% of served qbank items are unattested. That may be the right call; it should be an explicit, defensible decision rather than an inherited string. If yes, the file-level `_note` needs to say so.
2. **Is the SP going live this academic year?** If yes, §5.2 becomes Tier 0 and needs a named accountable person before the 403 lifts. If no, the current fail-closed state is acceptable and §5.1 can proceed at a normal pace.
3. **Who is the second reviewer?** Both peer reviewers independently identified single-reviewer attestation as the systemic weakness. The CL reviewer volunteered to be second on the SP packs.
4. **Is BVC or FRST the instrument you actually want students using?** Your attested prose teaches BVC; your tool implements FRST. BVC is six present/absent items and roughly an hour to build, and it is the one your inpatient students would actually use shift-to-shift.
5. **Should the communication bank move to two-tier?** §8.4's structural argument suggests the length cue is a symptom of the single-best-answer format, not a formatting slip — and you already have the two-tier machinery.

---

*Companion document: `SPEC_Withdrawal_Instrument_Redesign_v1.md` — drop-in item content for CIWA-Ar and COWS, the generalizable four-line item pattern, the PAWSS pre-screen card, the serial-trend spec, and the seven-component rater-calibration module.*
