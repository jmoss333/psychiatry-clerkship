# RESIDENT · Curriculum content — volume 3

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Start the Encounter

---

## Screeners: PHQ-9 & GAD-7

- **Slug:** `screeners.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `02_Clinical_Skills/Screeners/screeners.html`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Category:** clinical-skills · **Risk level:** `moderate` · **Disclaimer:** `screening-not-diagnosis`
- **Related pages:** `t_mood.md`, `t_anxiety.md`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Screeners — PHQ-9 & GAD-7 Reviewed by Joshua Moss, MD on 2026-06-30
- Skip to content If someone is in crisis
- On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
- 988 Suicide & Crisis Lifeline — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
- Crisis Text Line — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
- Maine Crisis Line — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
- Veterans Crisis Line — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
- Emergency services — 911. 24/7. For imminent danger to life.
- Contacts verified 2026-07-27 against official sources. Maintained in crisis_resources.json ; do not edit these numbers inline.

**Authored clinical strings (27):**

- Little interest or pleasure in doing things
- Feeling down, depressed, or hopeless
- Trouble falling or staying asleep, or sleeping too much
- Feeling tired or having little energy
- Poor appetite or overeating
- Feeling bad about yourself — or that you are a failure or have let yourself or your family down
- Trouble concentrating on things, such as reading or watching television
- Moving or speaking so slowly that others could have noticed — or being so fidgety/restless that you move around a lot more than usual
- Thoughts that you would be better off dead, or of hurting yourself in some way
- Feeling nervous, anxious, or on edge
- Not being able to stop or control worrying
- Worrying too much about different things
- Being so restless that it is hard to sit still
- Becoming easily annoyed or irritable
- Feeling afraid, as if something awful might happen
- Over the last 2 weeks, how often have you been bothered by the following?
- ⚠ Item 9 (thoughts of being better off dead or self-harm) is endorsed. Move to a direct safety assessment now — open the
- , and follow your team's safety protocol.
- Clinical Skills · validated screeners
- Screeners — PHQ-9 & GAD-7
- Two of the screeners named in the clerkship objectives. Tap the response for each item to score live. These support — they don't replace — a clinical interview, and a positive screen warrants a focused assessment.
- PHQ-9 bands: 0–4 minimal · 5–9 mild · 10–14 moderate · 15–19 moderately severe · 20–27 severe. ≥10 has good sensitivity/specificity for major depression. Always review item 9 (self-harm) regardless of total.
- GAD-7 bands: 0–4 minimal · 5–9 mild · 10–14 moderate · 15–21 severe. ≥10 is the usual threshold for further evaluation of generalized anxiety; it also screens reasonably for panic, social anxiety, and PTSD.
- The tally here is for learning the instruments. Pfizer publishes the whole PHQ family and the GAD-7 — the printable forms, the scoring instructions and translations in roughly 80 languages — which is what you hand a patient and document from.
- PHQ-9 & GAD-7 at phqscreeners.com →
- Free, no registration; leaves this site for phqscreeners.com. Use your clinic’s current version where one is in the EHR — that is the copy your documentation refers to.
- Educational tool for clinical trainees. PHQ-9 and GAD-7 are published by Pfizer (Spitzer, Kroenke, Williams) and are the two instruments this library still reproduces; the official forms are linked above. Scoring is a screen, not a diagnosis — confirm clinically and follow your team's protocols. No PHI is stored. Joshua Moss, MD | Psychiatrist

---

# SECTION: Understand the Problem

---

## Differential Dx Scaffolds

- **Slug:** `ddx.md` · **Type:** md · **Sidebar:** listed
- **Source:** `02_Clinical_Skills/Differential_Diagnosis/inpatient_differential_scaffolds.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 640 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 4 min

**TL;DR (shown above the page text):**

> Run a medical mimic screen before anchoring any psychiatric diagnosis — a new or acutely changed presentation is a medical workup until proven otherwise, especially in elderly, medically ill, and first-episode patients.

**Key points (bulleted card):**

- For new psychosis, delirium is the can't-miss before schizophrenia — confirm attention, get a tox screen and basic labs, and do not assume a primary psychotic disorder on first episode without a workup.
- In mania or severe agitation, akathisia — drug-induced restlessness from antipsychotics — is frequently missed because it looks like anxiety or behavioral escalation.
- In withdrawal, give thiamine before or with glucose — a glucose load in a thiamine-deficient patient can precipitate Wernicke's encephalopathy — but never delay dextrose for documented hypoglycemia.

**Can't-miss / red-flag line:**

> Anchoring on a psychiatric diagnosis before ruling out the medical mimics — especially delirium, intoxication/withdrawal, and thyroid or metabolic causes — is the most common reasoning error on the inpatient unit.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Start with time course, substances/medications, medical changes, trauma, sleep, and baseline functioning before naming a psychiatric disorder.
- **mse** — Separate observed signs from reported symptoms; note arousal, attention, thought process, perception, affect, insight, and judgment.
- **safety** — Ask the safety trio directly: suicide, violence, and vulnerability/exploitation.
- **say** — I want to keep a broad differential at first so we do not miss a medical or substance-related cause.
- **collateral** — Ask family or outpatient clinicians what is new, what is baseline, and what changed right before admission.
- **rounds** — Present symptoms, syndrome, leading diagnosis, dangerous alternatives, and what data would change your mind.
- **exam** — Shelf questions often hide medical mimics, substance causes, and medication adverse effects inside psychiatric vignettes.
- **actions** — Open decision aids; Practice diagnostic reasoning

**Embedded check-for-understanding**

1. *Stem:* An 80-year-old man with no psychiatric history becomes acutely paranoid, cannot say the months in reverse, and was completely lucid last week. The overnight team labels this 'new onset psychosis' and considers an antipsychotic. What is the most important next step?
   - Start a low-dose antipsychotic for the paranoia and request outpatient psychiatric follow-up
   - Treat as delirium until proven otherwise — check vitals, basic labs, tox screen, medication list, and infection markers before any psychiatric label **← keyed correct**
   - Request a psychiatry consult to clarify the diagnosis before doing a medical workup
   - Schedule formal cognitive testing to differentiate dementia from new-onset psychosis
   - *Rationale:* New confusion with fluctuating attention in an elderly patient is delirium until proven otherwise — the one rule on this page that prevents most errors. Starting an antipsychotic before workup risks masking the medical cause; waiting for psychiatry before doing the evaluation loses critical time; dementia testing is premature when delirium hasn't been excluded.

**Cross-references and tagging:**

- **Related tools:** `decision-aids.html`, `mse.html`, `diagnostic-reasoning.html`
- **Evidence sources:** `rosenhan-1973-sane-places`
- **Workflow stages:** `diagnosis`, `safety`, `exam`
- **Workflow modes:** `ward`, `safety`, `5min`, `shelf`
- **EPA crosswalk:** `EPA2`

#### Page text (as shipped)

# Differential Diagnosis Scaffolds — Adult Inpatient Psychiatry


**For:** MS3 on the unit. **Use:** when a patient presents with one of the eight core syndromes below, run the scaffold — *medical mimic first, then the psychiatric differential, then the first move.* Fictional composites only; no PHI.

> **The one rule that prevents most errors:** a new or acutely changed psychiatric presentation is a **medical workup until proven otherwise.** Vitals, glucose, basic labs, tox, and a focused neuro exam come before you anchor on a psychiatric diagnosis — especially in the old, the medically ill, and the first-episode.

---

## 1. New psychosis (hallucinations, delusions, disorganization)
- **Can't-miss mimics:** delirium, substance intoxication/withdrawal (stimulants, cannabis, alcohol/benzo withdrawal), CNS infection, autoimmune/limbic encephalitis, seizure (postictal), steroid/medication-induced, thyroid, B12.
- **Psychiatric DDx:** primary psychotic disorder (schizophrenia spectrum), mood disorder with psychotic features (depression or mania), brief psychotic disorder, substance-induced.
- **First move:** confirm orientation/attention (screen delirium), tox screen, basic labs ± neuroimaging for first-episode; *do not* assume primary psychosis in a first episode without a medical workup. → see the catatonia guidance if mute/immobile.

## 2. Agitation / acute behavioral disturbance
- **Can't-miss mimics:** delirium, hypoglycemia, hypoxia, intoxication/withdrawal, pain, head injury, NMS/serotonin syndrome, akathisia (drug-induced restlessness mistaken for anxiety).
- **Psychiatric DDx:** mania, psychosis, intoxication, personality/impulsivity, trauma response.
- **First move:** ensure team/exit safety; vitals + glucose; verbal de-escalation before PRN. → the agitation & restraint guidance + the Violence-Risk tool.

## 3. Depressed / suicidal
- **Can't-miss mimics:** hypothyroidism, anemia, occult substance use, medication effects (e.g., interferon, steroids), pancreatic/CNS disease, pseudodementia in elders.
- **Psychiatric DDx:** MDD (± psychotic features), bipolar depression (always screen for past mania → changes treatment), adjustment disorder, persistent depressive disorder, demoralization.
- **First move:** explicit C-SSRS + collaborative safety plan; screen for bipolarity (MDQ) before starting an antidepressant. → Suicide tools; MSE module.

## 4. Manic / elevated / irritable
- **Can't-miss mimics:** stimulant or steroid effect, hyperthyroidism, frontal/CNS lesion, delirium, antidepressant-induced switch.
- **Psychiatric DDx:** bipolar I/II, schizoaffective, substance-induced mood disorder.
- **First move:** protect sleep, hold antidepressants, assess capacity/risk; collateral is essential (insight is often low).

## 5. Mute / immobile / minimally responsive (think CATATONIA)
- **Can't-miss mimics:** NMS, nonconvulsive status, stroke, locked-in, akinetic mutism, severe parkinsonism.
- **Psychiatric DDx:** catatonia (mood, psychotic, autistic, or medical), severe depression, malingering (diagnosis of exclusion).
- **First move:** Bush-Francis screen + **lorazepam challenge** (diagnostic and therapeutic); **avoid antipsychotics** until catatonia excluded (NMS risk). → the catatonia guidance.

## 6. Confused / fluctuating / "not themselves" (think DELIRIUM)
- **Can't-miss mimics:** *delirium is the mimic* — infection (UTI/pneumonia), metabolic, hypoxia, drugs (anticholinergics, benzos, opioids), withdrawal, urinary retention/constipation in elders.
- **Psychiatric DDx:** dementia (chronic, non-fluctuating), depression (pseudodementia), primary psychosis (rare as new onset in elders).
- **First move:** attention testing (months backward), find and treat the cause, deprescribe deliriogenic meds, non-pharm first. → the delirium guidance.

## 7. Anxiety / panic
- **Can't-miss mimics:** arrhythmia, PE, hyperthyroidism, hypoglycemia, asthma, pheochromocytoma, caffeine/stimulant, alcohol/benzo withdrawal, akathisia.
- **Psychiatric DDx:** panic disorder, GAD, PTSD, OCD, anxious depression, substance-induced.
- **First move:** rule out the cardiopulmonary/withdrawal mimics; favor SSRIs + skills over standing benzodiazepines (dependence, falls, SUD).

## 8. Substance intoxication / withdrawal
- **Can't-miss mimics:** co-occurring head injury, infection, hepatic encephalopathy, Wernicke's (give **thiamine before or with glucose**; never delay dextrose for true hypoglycemia), polysubstance masking.
- **Psychiatric DDx:** primary mood/psychotic disorder co-occurring with use; substance-induced disorders.
- **First move:** CIWA-Ar / COWS, withdrawal protocol per institution, naloxone education at discharge. → the Withdrawal (CIWA-Ar/COWS) card.

---

### How to present a differential on rounds (10 seconds)
"My leading diagnosis is **X** because [2 features]; I'm also considering **Y** and **Z**; and I want to rule out **[the medical can't-miss]** with **[test]**." → pairs with the Oral Presentation tool.

*Joshua Moss, MD | Psychiatrist · Educational scaffold; not a substitute for supervised assessment.*


---

## Diagnostic Reasoning Workbench

- **Slug:** `diagnostic-reasoning.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Category:** clinical-reasoning · **Risk level:** `moderate` · **Disclaimer:** `fictional-simulation-supervision`
- **Evidence sources:** `bap-catatonia-2023`, `nice-delirium-cg103`
- **Related pages:** `ddx.md`, `pg_formulation.md`, `t_mood.md`, `t_psychosis.md`, `delirium.md`, `catatonia.md`, `t_personality.md`
- **Storage keys:** `cw_reason_v1`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Diagnostic Reasoning Workbench Reviewed by Joshua Moss, MD on 2026-07-09
- Skip to content Clinical reasoning · diagnostic humility
- Diagnostic Reasoning Workbench
- Practice turning bedside data into a problem representation, differential, update, and supervised next step.
- Boundary: fictional composites only. No patient information, no free text, no diagnosis or treatment advice. Use with supervision and local policy.
- Loading reasoning cases...

**Authored clinical strings (43):**

- s authored quality. */ /* ---- cw_srs_v1 store adapter (shared) ------------------------------------ Every tool that schedules a card writes the SAME store under the SAME shape. This file is the one definition of that shape; `applyGrade` (the SM-2 step itself) is a separate snippet, sm2_apply_grade.js, and stays that way. Why this is shared rather than copied into each tool: `srsFresh` fixes the store
- s daily allowance or dropping a stats field the dashboard reads. The failure is invisible and arrives only for learners who happen to open the wrong tool first. Card id namespaces live in the consumers, not here: deck# and TOPIC# (Daily Review), QB# (question bank), FAM# (family retrieval, fam_retrieval.js), COMM# and REASON# (the two tools below). spa_index.html
- s authored quality rather than asked for. `best` is a clean recall (Good, not Easy — Easy would stretch the interval on a four-way recognition task the learner may well have guessed); `partial` is a hesitant one; anything worse is a lapse. Unknown qualities fail to a lapse so a new quality added to the data can never quietly lengthen an interval. */ function srsGradeForQuality(quality){ if(quality===
- ) return 3; if(quality===
- ) return 2; return 1; } /* ==== Canonical SM-2 grader (build-injected — do not edit inside consumer files) ==== Source of truth: 13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js. Consumers carry a SM2_APPLY_GRADE marker comment that common.py
- s cw_srs_v1 writes stay aggregate/current-state only and are unaffected by that logging. */ /* Deterministic ±15% interval fuzz (opts.fuzzKey): de-synchronizes cohort-seeded cards so due-load avalanches spread out. No fuzzKey (legacy callers) = no fuzz. Also a no-op below ivl 3 d (too short to meaningfully fuzz). Always clamped to [1, 365] regardless of the input interval
- ]/g,function(c){return {'&':'&',' ':'>','
- }[c];});} function requestedCaseId(){try{return new URLSearchParams(location.search).get(
- ;}} function loadAttempts(){try{return JSON.parse(localStorage.getItem(
- )||{};}catch(_){return {};}} function saveAttempt(caseId,stepId,choice){try{var rec=state.attempts[caseId]||{steps:{}};rec.steps=rec.steps||{};rec.steps[stepId]={choiceId:choice.id,quality:choice.quality,at:new Date().toISOString().slice(0,10)};rec.updatedAt=new Date().toISOString().slice(0,10);state.attempts[caseId]=rec;localStorage.setItem(
- ,JSON.stringify(state.attempts));}catch(_){} try{srsGradeCard(reasonCardId(caseId,stepId),srsGradeForQuality(choice&&choice.quality));}catch(_){}} function caseComplete(c){var rec=state.attempts[c.id];var n=(c.steps||[]).length;if(!rec||!rec.steps||!n)return false;return (c.steps||[]).every(function(st){return rec.steps[st.id];});} function bestCount(c){var rec=state.attempts[c.id];if(!rec||!rec.steps)return 0;return Object.keys(rec.steps).filter(function(k){return rec.steps[k].quality===
- ;}).length;} function progressHtml(){var total=state.cases.length||1;var done=state.cases.filter(caseComplete).length;var pct=Math.round(done*100/total);return
- ;} function setCurrentById(id){for(var i=0;i<state.cases.length;i++){if(state.cases[i].id===id){state.current=i;state.step=0;state.choice=null;return true;}}return false;} function currentCase(){return state.cases[state.current]||state.cases[0];} function currentStep(){var c=currentCase();return c&&c.steps?c.steps[state.step]:null;} function navHtml(){return
- +state.cases.map(function(c,i){var done=caseComplete(c), best=bestCount(c), total=(c.steps||[]).length;return
- casebtn'+(i===state.current?' on':'')+'
- ;} function reviewBadge(c){var rv=c.facultyReview||{};if(rv.status===
- ;} function caseHtml(c){var facts=(c.facts||[]).map(function(f){return
- ;} function qualityLabel(q){return q===
- ;} function stepDots(c){return
- dot'+(i<=state.step?' on':'')+'
- ;} function stepHtml(c,st){if(!st)return
- ;var picked=state.choice;var complete=state.step>=(c.steps.length-1)&&picked;return
- +(st.choices||[]).map(function(ch){var cls=picked&&picked.id===ch.id?
- ;} function biasHtml(c){return
- ;} function linkHref(f){return f&&f.endsWith(
- +encodeURIComponent(f);} function linkLabel(f){return LINK_LABELS[f]||String(f||
- ).replace(/\b\w/g,function(m){return m.toUpperCase();});} function linksHtml(c){return
- ;} function savedChoiceForStep(c,st){var rec=state.attempts[c.id];var saved=rec&&rec.steps&&rec.steps[st.id];if(!saved)return null;return (st.choices||[]).filter(function(ch){return ch.id===saved.choiceId;})[0]||null;} function render(){if(!state.cases.length){app.innerHTML=
- ;return;}var c=currentCase(), st=currentStep();if(!state.choice&&st)state.choice=savedChoiceForStep(c,st);app.innerHTML=navHtml()+
- ; var _live=document.getElementById(
- ); var _fb=app.querySelector(
- ); if(_live) _live.textContent=_fb?_fb.textContent:
- ; } app.addEventListener(
- ,function(ev){var caseBtn=ev.target.closest&&ev.target.closest(
- )||0;state.step=0;state.choice=null;state.matchedRequest=false;render();return;}var choiceBtn=ev.target.closest&&ev.target.closest(
- );if(choiceBtn){var c=currentCase(), st=currentStep(), id=choiceBtn.getAttribute(
- );state.choice=(st.choices||[]).filter(function(ch){return ch.id===id;})[0]||null;if(state.choice)saveAttempt(c.id,st.id,state.choice);render();return;}var act=ev.target.closest&&ev.target.closest(
- );if(act){var c=currentCase();if(act.getAttribute(
- &&state.step>0){state.step--;state.choice=null;}else if(act.getAttribute(
- ){state.step=0;state.choice=null;}else if(act.getAttribute(
- ){if(state.step<c.steps.length-1){state.step++;state.choice=null;}}render();}}); fetch(
- ).then(function(r){if(!r.ok)throw new Error(
- );return r.json();}).then(function(d){state.cases=(d&&d.cases)||[];if(state.requestedCase)state.matchedRequest=setCurrentById(state.requestedCase);render();}).catch(function(){app.innerHTML=

---

## Formulation & DDx

- **Slug:** `pg_formulation.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 643 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 4 min

**TL;DR (shown above the page text):**

> Answer why-this-person, why-this-syndrome, and why-now using the four-layer framework (body/brain, psychiatric syndrome, relationships/environment, recovery/role) — a diagnosis without a formulation is just a label.

**Key points (bulleted card):**

- The five-part differential always includes substance/medication-induced and medical contributors — stopping at the primary psychiatric diagnosis skips the most reversible causes.
- The formulation template: name the leading syndrome, the contributors from each layer, the immediate risk, and what must change before discharge — then explain how the treatment follows from that.
- Faculty questions that sharpen formulation: 'What would make this diagnosis wrong?' and 'What collateral would change the plan?' — bring answers to these before presenting.

**Can't-miss / red-flag line:**

> Listing a diagnosis without a formulation leaves the team without the why-now — and without the why-now, the treatment plan has no clinical logic.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Ask what made this person vulnerable, what precipitated this admission, what perpetuates symptoms, and what protects recovery.
- **mse** — Use the MSE to support or challenge your formulation, not just to fill a template.
- **safety** — Formulate risk dynamically: baseline risk, acute change, protective factors, access to means, and supervision needs.
- **say** — Here is how I am understanding why this is happening now, and I want to check that with you.
- **collateral** — Look for relational patterns, housing/financial stressors, medication access, and family capacity.
- **rounds** — Give a one-sentence formulation before your plan: syndrome plus context plus immediate treatment target.
- **exam** — Distinguish symptoms, syndromes, diagnoses, formulation, and treatment targets.
- **actions** — Practice oral presentation; Practice formulation reasoning

**Embedded check-for-understanding**

1. *Stem:* A student presents a patient with severe depression and recommends starting an SSRI. The attending asks for the formulation before any treatment decision. What must the student add?
   - A summary of the body/brain contributors, the psychiatric syndrome, the family/social context, what must change before discharge, and how the SSRI fits that picture **← keyed correct**
   - The specific DSM criteria met by the patient
   - A list of prior antidepressants the patient has tried and why they failed
   - The patient's GAF score and number of prior hospitalizations
   - *Rationale:* A formulation answers why-this-person, why-this-syndrome, and why-now — linking those answers to the treatment choice. The four-layer framework (body/brain, syndrome, relationships/environment, recovery/role) is the structure. The SSRI is only clinically reasoned after the formulation confirms the target is a primary depressive episode, not bipolar depression, a substance-induced condition, or a medically driven one.

**Cross-references and tagging:**

- **Related tools:** `mse.html`, `oral.html`, `diagnostic-reasoning.html`
- **Evidence sources:** `engel-1977-biopsychosocial-model`
- **Workflow stages:** `diagnosis`, `treatment`, `team`
- **Workflow modes:** `ward`, `5min`, `shelf`
- **EPA crosswalk:** `EPA2`

#### Page text (as shipped)

# Formulation And Differential Diagnosis Pocket Guide

Generated: 2026-06-27

Audience: MS3 students.

## The Difference

Differential diagnosis asks:

> "What could this be?"

Formulation asks:

> "Why this patient, why now, and what does that mean for the plan?"

Students often stop after diagnosis. In inpatient psychiatry, that is not enough.

## Five-Part Differential

For every new patient, consider:

1. Primary psychiatric syndrome.
2. Substance or medication-induced condition.
3. Medical or neurologic contributor.
4. Trauma, stressor, or developmental context.
5. Family/system/disposition factor affecting safety and recovery.

## Common Inpatient Presentations

### Psychosis

Consider:

- Primary psychotic disorder.
- Mood disorder with psychotic features.
- Substance/medication-induced psychosis.
- Delirium or neurologic illness.
- Trauma-related dissociation or hypervigilance.

Ask:

- Timeline of psychosis vs mood symptoms.
- Sleep change.
- Substance use and last use.
- New medications.
- Orientation and attention.

### Mania Or Severe Agitation

Consider:

- Bipolar mania.
- Substance intoxication or withdrawal.
- Medication effect, including steroids or stimulants.
- Delirium.
- Akathisia.
- Trauma/fear response.

Ask:

- Decreased need for sleep vs insomnia with fatigue.
- Grandiosity, pressured speech, risky behavior.
- Stimulants, cannabis, antidepressants, steroids.
- Vital signs, attention, fluctuating course.

### Severe Depression Or Suicidality

Consider:

- Major depressive episode.
- Bipolar depression.
- Substance-induced mood disorder.
- Grief, trauma, adjustment disorder.
- Medical contributors.
- Personality pathology and interpersonal crisis.

Ask:

- Episodicity and past mania/hypomania.
- Alcohol and sedative use.
- Sleep, appetite, energy.
- Intent, plan, means, preparation.
- Collateral and protective relationships.

### Confusion Or Disorganization

Consider:

- Delirium.
- Intoxication or withdrawal.
- Psychosis.
- Mania.
- Catatonia.
- Dementia or neurologic disorder.

Ask:

- Acute vs chronic.
- Fluctuating vs stable.
- Attention.
- Vitals, infection, hypoxia, medications.
- Baseline from collateral.

### Refusal Of Care

Consider:

- Capacity issue.
- Fear, mistrust, trauma, or communication failure.
- Psychosis, mania, depression.
- Delirium or intoxication.
- Values-based refusal.

Ask:

- Exact decision.
- Understanding, appreciation, reasoning, choice.
- What the patient is afraid will happen.
- Whether attention or psychosis is impairing the decision.

## Four-Layer Formulation

Use plain language:

1. Body and brain: sleep, substance, medications, medical/neurologic factors.
2. Psychiatric syndrome and treatment: diagnosis, symptoms, therapy/medication needs.
3. Relationship and environment: family, trauma, housing, supports, conflict, culture.
4. Recovery and role: identity, function, meaning, goals, discharge life.

Template:

> "[Patient] is admitted with [syndrome/problem] in the setting of [body/brain
> contributors], [psychological/diagnostic factors], and [family/social/system
> factors]. The immediate risk is [X]. The plan should prioritize [safety/medical
> stabilization], [treatment], [family/collateral/disposition], and [recovery
> goal]."

## One-Minute Formulation Example

> "This is a young adult admitted with first-episode mania with psychotic
> features. Body/brain contributors include severe sleep loss and daily cannabis
> use. Psychiatric treatment priorities are mood stabilization, antipsychotic
> treatment, and monitoring adverse effects. Family context matters because the
> family is frightened and may respond with over-control, which could make
> discharge planning harder. Recovery work includes returning to school in a
> staged way rather than treating discharge as immediate return to baseline."

## Faculty Questions That Improve Reasoning

- What would make this diagnosis wrong?
- What medical or substance cause would be dangerous to miss?
- What changed in the last week?
- What collateral would change the plan?
- What is the discharge barrier?
- What is the modifiable risk target today?

## Student Checklist

Before presenting, confirm:

- I have a differential, not just a diagnosis.
- I included substance/medication and medical contributors.
- I separated chronic and acute risk.
- I know what collateral is missing.
- I can name one family/system factor.
- I can say what must change before discharge.

Plain-English note: this guide gives students a repeatable thinking structure.
It keeps them from diagnosing too early and helps them connect the diagnosis to
the treatment and discharge plan.


---

## Case Formulation

- **Slug:** `case_formulation.md` · **Type:** md · **Sidebar:** listed
- **Source:** `02_Clinical_Skills/Case_Formulation/case_formulation_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 634 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 4 min

**TL;DR (shown above the page text):**

> A formulation answers why this patient, why now — built on the biopsychosocial axis and sharpened by the four P's (predisposing, precipitating, perpetuating, protective) — and turns a diagnosis into a plan.

**Key points (bulleted card):**

- The differential gives the diagnosis; the formulation gives the 'why now' and the plan.
- Always name a precipitant ('why now?') and at least one protective factor — the two cells students most often skip.
- Every perpetuating factor is a treatment target; every protective factor is a lever.

**Can't-miss / red-flag line:**

> Don't stop at a diagnosis or write an all-biology story — force a psychological and a social contributor into the formulation.

**Cross-references and tagging:**

- **Evidence sources:** `engel-1977-biopsychosocial-model`
- **Workflow stages:** `diagnosis`, `treatment`, `team`, `exam`
- **Workflow modes:** `ward`, `5min`, `shelf`
- **EPA crosswalk:** `EPA2`
- **Faculty review:** {"status": "reviewed", "lastReviewed": "2026-07-09", "reviewer": "Joshua Moss, MD"}

#### Page text (as shipped)

# Case Formulation on the Inpatient Unit


**In one line.** A formulation is the sentence the differential can't give you — it answers *why this patient, why now,* and turns a diagnosis into a plan. (For the quick-reference version, see the Formulation & DDx pocket guide; this page is the how-to and a worked example.)

**Differential vs. formulation.** The differential asks "what could this be?" and yields a diagnosis. The formulation asks "why did this person develop this, at this moment, and what does that imply?" A student who stops at "major depressive disorder" has named the what; the formulation names the *why* that the treatment and disposition actually hang on. On inpatient psychiatry, the formulation is what separates a problem list from a plan.

**Two frameworks that fit together.** Build the formulation on the **biopsychosocial** axis — biological, psychological, and social contributors — and sharpen it with the **four P's**, which sort every contributor by *timing and function*:
- **Predisposing** — what made this person vulnerable (genetics, temperament, early trauma, chronic illness).
- **Precipitating** — what triggered *this* episode *now* (a medication stop, a loss, a substance, a role transition).
- **Perpetuating** — what keeps it going (ongoing substance use, high-expressed-emotion home, untreated pain, hopelessness, nonadherence).
- **Protective** — strengths to build on (supports, treatment engagement, responsibilities, insight).

Cross the four P's with the biopsychosocial axis and you have a 3×4 grid; you do not need every cell, but scanning it keeps you from the common student error of a purely biological story.

**A worked example (fictional composite).** *A 34-year-old man with bipolar I is admitted for a manic episode after stopping lithium three weeks ago when he lost his insurance; he has been using cannabis nightly and his marriage is strained.*
- **Biological:** genetic loading for bipolar illness (**predisposing**); lithium discontinuation (**precipitating**); nightly cannabis destabilizing sleep and mood (**perpetuating**).
- **Psychological:** "I'm fine, I don't need medication" during euthymia (**perpetuating** — insight that fluctuates with mood).
- **Social:** loss of insurance and access to medication (**precipitating** and **perpetuating**); marital strain (**perpetuating**); a spouse still engaged and willing to attend a family meeting (**protective**).
- **The sentence:** "Genetically predisposed bipolar illness, precipitated by lithium discontinuation after an insurance loss, perpetuated by cannabis and a strained home, with a supportive spouse as the lever." That sentence writes the plan — restart a mood stabilizer, solve the access barrier with the social worker, address cannabis, and use the family meeting — in a way "bipolar I, manic" never could.

**What the student does.**
- Write one formulation sentence for every patient you follow, in the four-P structure — it is the single highest-yield habit for rounds and oral presentations.
- Always name a **precipitant** ("why now?") and at least one **protective** factor — these are the two cells students most often skip and the two the team most wants.
- Let the formulation drive the plan: each perpetuating factor should map to an intervention, each protective factor to a lever.
- Revise it as collateral and the course change — a formulation is a working hypothesis, not a fixed label.

**High-yield pearls.**
- The differential gives the diagnosis; the formulation gives the "why now" and the plan.
- The four P's — predisposing, precipitating, perpetuating, protective — are the fastest scaffold; the precipitating and protective cells are the ones students forget.
- A formulation that is all biology is incomplete: force yourself to fill a psychological and a social cell.
- Every perpetuating factor is a treatment target; every protective factor is a lever — that is how the formulation becomes a plan.

**Pair with** the Formulation & DDx pocket guide, the Differential Diagnosis scaffolds, the Oral Presentation tool, and the family pages.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*


---

## Medical Workup & Mimics

- **Slug:** `medical_workup.md` · **Type:** md · **Sidebar:** listed
- **Source:** `03_Core_Topics/Medical_Workup/medical_workup_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 574 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 4 min · safetyLevel=`moderate`

**TL;DR (shown above the page text):**

> A new psychiatric presentation is a medical workup until proven otherwise — rule out the medical and substance mimics before committing to a psychiatric diagnosis.

**Key points (bulleted card):**

- Red flags: first episode at an atypical age, no prior psychiatric history, abnormal vitals or a focal neuro exam, visual hallucinations, and fluctuating attention (delirium until proven otherwise).
- Core new-admission screen: vitals, CBC, CMP, TSH, B12/folate, UA, urine tox + alcohol, β-hCG before medications, and a baseline QTc before QT-prolonging agents.
- Psychosis + movement disorder + seizures/autonomic instability → think anti-NMDA-receptor (autoimmune) encephalitis.

**Can't-miss / red-flag line:**

> Don't inherit 'psych' as the label on an older or medically ill patient with an acute change — take the vitals and test attention yourself first.

**Rule-out list (differential the page forces):**

- Delirium / medical cause
- Substance intoxication or withdrawal
- Thyroid disease
- B12/folate deficiency
- CNS lesion / seizure
- Autoimmune (anti-NMDA-receptor) encephalitis

**First move (the action the page tells the learner to take):**

> Take the vitals and test attention yourself, order the core labs + β-hCG + QTc, and present the medical differential first when the story is 'new, old, and abnormal-vitals.'

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`
- **Workflow modes:** `ward`, `safety`, `5min`, `shelf`
- **Shelf blueprint tags:** `neurocog`
- **EPA crosswalk:** `EPA2`, `EPA3`
- **Faculty review:** {"status": "reviewed", "lastReviewed": "2026-07-10", "reviewer": "Joshua Moss, MD"}

#### Page text (as shipped)

# Medical Workup & Medical Mimics


**In one line.** A new psychiatric presentation is a medical workup until proven otherwise — the job on admission is to rule out the medical and substance causes that masquerade as psychiatric illness before you commit to a psychiatric diagnosis.

**When to suspect a medical cause.** Some features should raise your index of suspicion sharply: a first episode at an atypical age (new psychosis after ~40, new "depression" in an older adult), *no* prior psychiatric history, abnormal vital signs, an abnormal neurologic exam or focal signs, visual (rather than auditory) hallucinations, a fluctuating level of consciousness or inattention (that is delirium until proven otherwise), rapid onset over hours, or a poor response to appropriate psychiatric treatment. The single most useful bedside move is to test attention and take the vitals yourself rather than inherit them.

**Baseline workup of the new admission.** A reasonable core screen for most new admissions: vital signs; CBC; a complete metabolic panel (glucose, electrolytes, calcium, renal and hepatic function); TSH; B12 and folate; urinalysis with culture (especially in older adults — UTI is a classic delirium driver); urine toxicology and blood alcohol; a pregnancy test (β-hCG) in anyone of childbearing potential *before* starting medication; and a baseline EKG (QTc) before QT-prolonging agents. Add targeted tests by the clinical picture: RPR and HIV; ammonia (hepatic encephalopathy); ceruloplasmin/copper in a young patient with neuropsychiatric signs (Wilson disease); ANA (lupus); neuroimaging (CT/MRI) for first-episode psychosis that is late-onset or atypical, or any focal neurologic sign; lumbar puncture when delirium is accompanied by fever or meningismus; EEG when a seizure or nonconvulsive status is possible; and autoimmune/paraneoplastic panels (anti-NMDA-receptor) when psychosis is accompanied by movement disorder, seizures, or autonomic instability.

**Medical mimics by presentation.**

| Looks like | Consider |
|---|---|
| **Depression** | Hypothyroidism; anemia; B12/folate deficiency; Parkinson disease; obstructive sleep apnea; hypercalcemia; corticosteroids; pancreatic cancer |
| **Mania** | Hyperthyroidism; corticosteroids; stimulants; frontal or subcortical lesions/stroke |
| **Psychosis** | Delirium; temporal-lobe epilepsy; anti-NMDA-receptor/autoimmune encephalitis; substances (stimulants, cannabis, PCP, hallucinogens); Wilson disease; SLE; B12 deficiency; neurosyphilis; HIV |
| **Anxiety/panic** | Hyperthyroidism; pheochromocytoma; hypoglycemia; arrhythmia; pulmonary embolism; caffeine/stimulants; alcohol or benzodiazepine withdrawal |
| **Catatonia / altered mental status** | Anti-NMDA-receptor encephalitis; neuroleptic malignant syndrome; nonconvulsive status epilepticus |

**What the student does.**
- Take the vitals and test attention yourself — do not inherit "psych" as the label on an older patient with an acute change.
- Confirm a β-hCG and a baseline EKG are done *before* a teratogen (valproate, lithium) or a QT-prolonging antipsychotic is started.
- Chase the four fixable, easily-missed screens: TSH, B12/folate, urine tox, and a urinalysis in the older patient.
- When the story is "new, old, and abnormal-vitals," present the medical differential first — that framing is what rounds and the exam reward.

**High-yield pearls.**
- New "psychiatric" symptoms in an older or medically ill patient are delirium/medical until proven otherwise.
- Visual hallucinations, fluctuating attention, and abnormal vitals point *away* from a primary psychiatric disorder.
- Always get a β-hCG before teratogens and a baseline QTc before QT-prolonging antipsychotics.
- First-episode psychosis after ~40, or with any focal neurologic sign, warrants neuroimaging.
- Psychosis + movement disorder + seizures/autonomic instability = think autoimmune (anti-NMDA-receptor) encephalitis.

**Pair with** the Differential Diagnosis scaffolds, Delirium, Neurocognitive (Dementia), and Hyperthermia & Toxidromes.

*Joshua Moss, MD | Psychiatrist · Educational; confirm tests/thresholds against current references and institutional protocol; fictional composites only, no PHI.*


---

## Mood

- **Slug:** `t_mood.md` · **Type:** md · **Sidebar:** listed
- **Source:** `03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Length:** 1,295 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 5 min · safetyLevel=`high`

**TL;DR (shown above the page text):**

> Before treating depression, screen for a past manic or hypomanic episode — antidepressant monotherapy can destabilize unrecognized bipolar illness.

**Key points (bulleted card):**

- Get collateral and ask specifically about prior mania/hypomania (MDQ).
- Match severity to setting; consider ECT for severe, psychotic, or catatonic depression.
- Lithium carries the strongest maintenance evidence and an anti-suicidal effect.

**Can't-miss / red-flag line:**

> Acute mania: stop the antidepressant, start a mood stabilizer or second-generation antipsychotic, and protect sleep.

**Rule-out list (differential the page forces):**

- Thyroid dysfunction
- Medication/steroid-induced
- Intoxication or withdrawal
- Delirium
- Proportionate grief/adjustment reaction

**First move (the action the page tells the learner to take):**

> Screen for past mania before any antidepressant; rule out medical, substance, and proportionate-grief causes first.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Anchor depressive, manic, and mixed symptoms to time course; ask about sleep, energy, impulsivity, psychosis, substances, antidepressants, and past episodes.
- **mse** — Look for psychomotor change, pressured or slowed speech, affect reactivity, thought speed, grandiosity, guilt, psychosis, and cognition.
- **safety** — Assess suicide, psychosis, inability to sleep, impulsive spending/sex/driving, access to means, and postpartum status when relevant.
- **say** — It is important that we screen for past mania before choosing a depression medication, because the wrong medication can worsen bipolar illness.
- **collateral** — Ask family about decreased need for sleep, episodic behavior change, spending, irritability, psychosis, medication adherence, and baseline functioning.
- **rounds** — Present unipolar vs bipolar evidence, safety acuity, psychosis/catatonia features, and why today's medication plan fits the risk profile.
- **exam** — Always screen for mania before antidepressants; acute mania means stop antidepressant and start an antimanic agent while protecting sleep.
- **actions** — Practice mania limit-setting; Open screeners; Practice mood reasoning; Map mania collateral and safety roles; Open mania collateral workflow

**Embedded check-for-understanding**

1. *Stem:* A patient with prior depressive episodes presents manic while on sertraline. Best next step?
   - Add a second antidepressant
   - Increase the sertraline dose
   - Stop sertraline; start a mood stabilizer or SGA **← keyed correct**
   - Order a brain MRI before any treatment
   - *Rationale:* This is bipolar mania; discontinue the antidepressant and begin an antimanic agent while protecting sleep.

**Family overlay:** `mood_mania_family_collateral_and_safety`

**Cross-references and tagging:**

- **Related tools:** `screeners.html`, `communication-practice.html`, `diagnostic-reasoning.html`, `family-systems.html`
- **Communication cases:** `mania_limit_sleep_001`
- **Evidence sources:** `cipriani-2013-lithium-suicide`, `canmat-isbd-bipolar-2018`
- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `communication`, `exam`, `family`
- **Workflow modes:** `ward`, `safety`, `5min`, `shelf`, `family`
- **Shelf blueprint tags:** `mood`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA4`
- **Call-to-action buttons:** Open the Screeners (PHQ-9 / GAD-7); Practice mania limit-setting; Map mania collateral and safety roles; Open mania collateral workflow
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-08"}

#### Page text (as shipped)

# Mood Disorders on the Inpatient Unit


**In one line** — Inpatient mood work is about safety, getting the diagnosis right (especially separating unipolar from bipolar), and starting an effective, measured treatment while the milieu and sleep do half the work.

**How it presents on the unit** — Patients rarely arrive with a tidy outpatient picture. Severe unipolar depression shows up as psychomotor retardation, poor oral intake, hopelessness, and sometimes mood-congruent psychosis (nihilistic or guilt-laden delusions) — a presentation that can shade into catatonia. Mania presents as decreased need for sleep, pressured speech, grandiosity, impulsivity, and irritability that destabilizes the milieu; floridly manic or psychotic patients often lack insight and arrive on a hold. Mixed features (depressed mood with concurrent activation/agitation) are easy to miss and carry elevated suicide risk. Across all of these, acute suicidality is the modal reason for admission — assess it actively and serially, not once at intake.

**Differential & can't-miss mimics** — Rule out medical mimics before anchoring on a primary mood disorder: thyroid dysfunction (hypo- and hyperthyroid states), corticosteroids and other medications, intoxication or withdrawal (alcohol, stimulants, sedatives), and CNS processes (delirium, stroke, frontal/limbic lesions, neurocognitive disorders). Delirium masquerading as depression or mania is the classic inpatient trap. Critically, always screen for a past manic or hypomanic episode before calling a depression "unipolar" — a bipolar depression misread as unipolar can be pushed into mania or rapid cycling by an antidepressant.

**Grief vs depression anchor** — Normal bereavement can be intensely painful and culturally shaped, but it is not automatically a mood disorder. DSM-5-TR prolonged grief disorder is considered when, at least 12 months after the death of a close person in adults, grief remains centered on intense yearning or preoccupation with the deceased plus additional grief-specific symptoms, causes impairment, and exceeds cultural or religious expectations. Major depression can co-occur, but depression is more defined by pervasive low mood/anhedonia, neurovegetative symptoms, guilt or worthlessness, and suicidality not limited to yearning for the deceased.

**Initial workup** — Keep it focused and decision-relevant: a full MSE with explicit suicide assessment, collateral history (the single highest-yield diagnostic move for distinguishing bipolar from unipolar), medication reconciliation, TSH, CBC, CMP, and urine drug screen. Add a pregnancy test in patients who can become pregnant before starting teratogenic agents, and a head CT/MRI when the picture is atypical, late-onset, or has focal findings.

**Acute inpatient management** — Treatment is medications plus milieu plus safety, layered deliberately. Before starting an antidepressant for depression, screen for bipolarity (e.g., Mood Disorder Questionnaire plus collateral) so you do not destabilize an unrecognized bipolar patient. For unipolar depression, practice measurement-based, sequential treatment in the spirit of STAR*D: pick an agent, dose it adequately, track response with a scale, and switch or augment by protocol rather than by impression. For suicidality and for bipolar illness, lithium deserves specific emphasis — it carries a distinct anti-suicidal effect (Cipriani 2013) and is a first-line maintenance mood stabilizer with the strongest long-term evidence (BALANCE trial). Reserve ECT for severe, psychotic, catatonic, or treatment-resistant depression, for life-threatening states (refusal of food/fluids, acute high suicide risk), and — when illness of that severity occurs in pregnancy — as a preferred option, since the therapeutic seizure works without the systemic fetal drug exposure pharmacotherapy requires. Pregnancy is not itself an ECT indication: for uncomplicated moderate depression in pregnancy, first-line remains psychotherapy and/or an SSRI. The milieu is therapeutic, not incidental: protect sleep and circadian rhythm actively, since sleep loss both worsens depression and precipitates mania (Harvey; IPSRT/Frank). For acute mania, reduce stimulation, restore sleep, and start or optimize a mood stabilizer or antipsychotic. Throughout, maintain a safe environment — contraband removal, appropriate observation level, and a collaboratively developed safety plan.

**What the student does** —
- Perform and document a focused MSE every day, with an explicit, serial suicide assessment.
- Obtain collateral (family, prior records, outpatient clinician) and specifically ask about past mania/hypomania.
- Track symptoms with a standardized measure so the team can see trajectory, not just snapshots.
- Reconcile medications and verify labs (TSH, UDS, pregnancy test) are back and reviewed.
- Round on the milieu: check sleep, oral intake, and whether the safety plan is current.

**Practice what to say next** — Rehearse
[offering a sleep-restoring plan in mania](?tool=communication-practice.html&case=mania_limit_sleep_001)
without arguing, shaming, or making promises about discharge.

**Disposition & discharge essentials** — Discharge readiness is functional and safety-based, not calendar-based: improving mood and resolving acute risk, adequate sleep and intake, an established and tolerated medication, and a concrete follow-up. Send the patient out with a timely outpatient appointment (ideally within a week), a clear medication plan with monitoring (lithium levels, renal/thyroid follow-up where relevant), a written safety plan with crisis contacts, means-restriction counseling, and engaged family or supports when consent allows.

**High-yield pearls** —
- Screen every depressed patient for past mania before writing for an antidepressant.
- New "depression" or "mania" in an older or medically complex patient is delirium until proven otherwise.
- Lithium is the mood stabilizer with anti-suicidal and best maintenance evidence — use it, and monitor it.
- Sleep is treatment: protect it to pull patients out of depression and to prevent mania.
- ECT is not a last resort — it is first-line for psychotic, catatonic, or life-threatening mood states, and in pregnancy it is a preferred option when illness of that severity demands rapid, definitive treatment. Pregnancy alone is not the indication; the severity is.
- Lithium runs a **narrow therapeutic window (~0.6–1.2 mEq/L)**: check baseline and periodic renal and thyroid function (and an ECG in older/cardiac patients), and remember NSAIDs, ACE-inhibitors/ARBs, thiazides, and dehydration push levels toward toxicity.
- For acute mania, first-line is lithium, valproate, or a second-generation antipsychotic — but **avoid valproate in anyone who could become pregnant** (teratogenic, including neural-tube defects); confirm before it is ordered.

> <div class="crisis-block-hook" hidden></div>
>
> ### If someone is in crisis
>
> On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
>
> - **988 Suicide & Crisis Lifeline** — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
> - **Crisis Text Line** — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
> - **Maine Crisis Line** — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
> - **Veterans Crisis Line** — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
> - **Emergency services** — 911. 24/7. For imminent danger to life.
>
> *Contacts verified 2026-07-27 against official sources. Maintained in `crisis_resources.json`; do not edit these numbers inline.*

**Pair with** — the <a href="tools/mse.html" target="_blank" rel="noopener">Mental Status Exam tool</a> for documenting mood, affect, and psychotic features; the [Differential Diagnosis scaffolds](?page=ddx.md) for the medical-mimic differential; the [suicide-risk & safety pocket card](?page=pg_suicide.md) for structured risk assessment and safety planning; and the [What Do You Say Next? mania case](?tool=communication-practice.html&case=mania_limit_sleep_001).

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI. Lithium targets and interaction lists here are teaching illustrations, not prescribing guidance — verify levels, interactions, and any pregnancy-related decision against current labeling and your attending.*


---

## Psychosis

- **Slug:** `t_psychosis.md` · **Type:** md · **Sidebar:** listed
- **Source:** `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Length:** 1,467 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 5 min · safetyLevel=`high`

**TL;DR (shown above the page text):**

> First-episode psychosis is a workup, not a diagnosis — rule out secondary causes before calling it primary.

**Key points (bulleted card):**

- Screen for substances, delirium, autoimmune (anti-NMDA), seizure, and CNS causes.
- Characterize positive, negative, and disorganized symptoms.
- Choose an antipsychotic by side-effect profile; clozapine for treatment resistance.

**Can't-miss / red-flag line:**

> Don't anchor on schizophrenia at a first presentation — secondary psychoses are missed when the workup is skipped.

**Rule-out list (differential the page forces):**

- Substance / intoxication
- Delirium
- Autoimmune (anti-NMDA)
- Seizure / CNS lesion
- Medication-induced

**First move (the action the page tells the learner to take):**

> Medical workup first; then an antipsychotic chosen by side-effect fit.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Clarify hallucinations, delusions, disorganization, negative symptoms, mood episodes, trauma, substances, medical/neurologic symptoms, and timeline.
- **mse** — Describe thought process, thought content, response to internal stimuli, affect, behavior, cognition, insight, and judgment without loaded language.
- **safety** — Assess command hallucinations, paranoia-driven defensive behavior, inability to care for self, access to weapons, and medication adverse effects.
- **say** — I may not see it the same way, but I can tell this feels frightening, and I want to understand what you are experiencing.
- **collateral** — Ask about first episode vs baseline, substance exposure, medical symptoms, functional decline, family history, and what helps the patient feel safe.
- **rounds** — State primary vs secondary psychosis differential, medical workup, safety drivers, antipsychotic choice, and family engagement plan.
- **exam** — First-episode psychosis is a workup; do not anchor on schizophrenia when delirium, substances, seizures, or autoimmune encephalitis fit better.
- **actions** — Practice psychosis validation; Open decision aids; Practice psychosis reasoning; Plan family psychoeducation; Open psychosis collateral workflow

**Embedded check-for-understanding**

1. *Stem:* A 22-year-old has three weeks of hallucinations, low-grade fever, and orofacial dyskinesias. Most important to exclude?
   - Adjustment disorder
   - Schizophrenia
   - Malingering
   - Anti-NMDA receptor (autoimmune) encephalitis **← keyed correct**
   - *Rationale:* Subacute psychosis with neurologic and autonomic features warrants an autoimmune-encephalitis workup before a primary psychiatric label.

**Family overlay:** `first_episode_psychosis_family_psychoeducation`

**Cross-references and tagging:**

- **Related tools:** `mse.html`, `decision-aids.html`, `communication-practice.html`, `diagnostic-reasoning.html`, `family-systems.html`, `sp-interview.html`
- **Communication cases:** `psychosis_validation_001`, `guardedness_privacy_001`, `interview_motive_suspicion_001`
- **Evidence sources:** `boyer-shannon-2005-serotonin-syndrome`, `strawn-2007-neuroleptic-malignant-syndrome`, `clozapine-rems`, `lieberman-2005-catie`
- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `communication`, `family`, `exam`
- **Workflow modes:** `ward`, `family`, `5min`, `shelf`
- **Shelf blueprint tags:** `psychosis`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA4`
- **Call-to-action buttons:** Open the Decision Aids; Practice psychosis communication; Open psychosis collateral workflow
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-08"}

#### Page text (as shipped)

# Psychotic Disorders on the Inpatient Unit


**In one line** — Psychosis is a syndrome, not a diagnosis; your job on the unit is to rule out a medical or substance cause, stabilize safety, start an antipsychotic chosen to fit the patient, and — especially in first-episode illness — build the engagement and family scaffolding that determines long-term trajectory.

**How it presents on the unit** — Patients arrive with positive symptoms (delusions, auditory hallucinations, disorganized speech or behavior), negative symptoms (flat affect, alogia, avolition), and disrupted insight. Many do not believe they are ill. Presentations range from the floridly agitated patient requiring rapid stabilization to the withdrawn, internally preoccupied patient who is easy to overlook. First-episode patients are often young, frightened, and brought in by family during a crisis.

**Differential & can't-miss mimics** — Always exclude secondary/medical psychosis before settling on a primary disorder. Think delirium first in any acute, fluctuating presentation with inattention or clouded consciousness. Screen for substance-induced psychosis (stimulants, cannabis, hallucinogens, withdrawal states). Do not miss autoimmune/limbic encephalitis (e.g., anti-NMDA receptor encephalitis — subacute psychosis with seizures, dyskinesias, autonomic instability) and seizure-related phenomena (ictal/postictal psychosis). Then distinguish a mood disorder with psychotic features (psychosis confined to mood episodes) from a primary psychotic disorder. Schizophreniform, brief psychotic disorder, and schizophrenia are duration-based distinctions you refine over time.

**Duration and mood anchors** — For primary psychotic disorders, timing matters. Brief psychotic disorder lasts at least 1 day but less than 1 month, with return to baseline. Schizophreniform disorder lasts 1 to 6 months. Schizophrenia requires at least 6 months of continuous disturbance. Delusional disorder centers on delusions without prominent hallucinations, disorganization, negative symptoms, or major functional collapse. Schizoaffective disorder requires at least 2 weeks of hallucinations or delusions without prominent mood symptoms, plus mood episodes present for the majority of the illness; if psychosis occurs only during mood episodes, diagnose a mood disorder with psychotic features instead.

**Initial workup** — History (including timeline, substance use, family history, prior episodes), collateral, and full mental status and neurologic exams. Labs: CBC, CMP, TSH, urine toxicology, and where relevant pregnancy test, infectious workup, and substance levels. First-episode psychosis specifically warrants a medical workup because a treatable organic cause is more likely when there is no established psychiatric history; obtain neuroimaging (MRI preferred) when the exam is focal, onset is atypical or abrupt, age is unusual, or there are seizures, and consider EEG and autoimmune/LP workup when encephalitis is on the table. Establish a baseline metabolic panel and weight before starting an antipsychotic.

**Acute inpatient management** — Combine medication, milieu, and safety. Choose the antipsychotic by side-effect profile, not by "newer is better": CATIE showed first- and second-generation agents had broadly comparable effectiveness, with differences driven by tolerability. Huhn 2019 and Leucht 2013 document real, drug-specific efficacy and tolerability differences across antipsychotics — use them to match a drug to the patient's metabolic, motor, and sedation risks. Use the milieu (structure, low stimulation, consistent staff, sleep restoration) and graded safety measures (observation level, environmental safety, least-restrictive de-escalation before PRNs or restraint). For first-episode patients, RAISE supports coordinated specialty care with active family involvement and early psychosocial intervention, not medication alone. Engagement is its own clinical task: many patients have anosognosia, so use Amador's LEAP approach (Listen, Empathize, Agree, Partner) rather than arguing about whether they are ill. For treatment-resistant schizophrenia (inadequate response to two adequate antipsychotic trials), clozapine is the evidence-based agent — pair it with recommended ANC (hematologic) and metabolic monitoring per the prescribing information.

**Neuroleptic malignant syndrome vs. serotonin syndrome** — Both produce fever, rigidity, and autonomic instability in a patient on psychotropics, but the distinction matters because the mechanisms, offending agents, and downstream interventions differ. **NMS**: onset is gradual, typically evolving over hours to days after starting or changing a **dopamine-blocking** agent (antipsychotic, metoclopramide, prochlorperazine); rigidity is **lead-pipe** — uniform resistance throughout the passive range of motion; deep tendon reflexes are normal or diminished; CK is often dramatically elevated (thousands to tens of thousands of U/L); the course, untreated, can extend over days to weeks. **Serotonin syndrome (SS)**: onset is rapid, usually within hours of a serotonergic dose increase or a new drug addition; rigidity is accompanied by **clonus** and **hyperreflexia** — especially lower-extremity ankle clonus, which is the hallmark physical finding; myoclonus, tremor, and agitation are common; CK may be mildly elevated but rarely reaches NMS levels; the offending agents include SSRIs, SNRIs, MAOIs, tramadol, fentanyl in high doses, linezolid, methylene blue, and triptans. The bedside discriminator: **lead-pipe rigidity + hyporeflexia → think NMS; clonus + hyperreflexia → think SS** (Boyer and Shannon, N Engl J Med 2005; Strawn et al., Am J Psychiatry 2007). Both syndromes require stopping the offending agent; severe NMS additionally warrants supportive intensive care, serial CK and renal function monitoring, and consideration of dantrolene or bromocriptine; SS resolves more rapidly once the serotonergic agent is removed but may require cyproheptadine in moderate-to-severe cases.

> **Reviewed and attested by Joshua Moss, MD (2026-07-09).**

**Practice what to say next** — Use the communication practice tool to rehearse
[validating psychosis without colluding](?tool=communication-practice.html&case=psychosis_validation_001)
and [responding to guardedness without escalating it](?tool=communication-practice.html&case=guardedness_privacy_001).

**What the student does** — (1) Gather collateral and build a clean symptom and substance timeline. (2) Perform and document serial mental status exams to track trajectory. (3) Track the metabolic baseline and monitoring (weight, glucose, lipids) for any patient on an antipsychotic. (4) Practice a LEAP-style engagement conversation and observe a family meeting. (5) Help reconcile medications and confirm the discharge follow-up is actually booked.

**Disposition & discharge essentials** — Confirm symptom stabilization, adequate insight or supervision for adherence, and a concrete safety plan. Arrange timely outpatient follow-up (coordinated specialty care for first-episode), engage family with consent, reconcile medications with clear monitoring instructions, and address housing, substance use, and any medical comorbidity before the patient leaves.

**High-yield pearls**
- Psychosis is a syndrome — exclude delirium, substances, and autoimmune/seizure causes before calling it primary.
- First-episode psychosis earns a medical workup ± neuroimaging; the organic yield is highest here.
- Per CATIE, pick the antipsychotic by side-effect fit; "newer" is not automatically better.
- Anosognosia is not denial — use LEAP, not debate, to build the alliance.
- Two failed adequate antipsychotic trials means consider clozapine, with recommended ANC monitoring per the prescribing information (the FDA eliminated the clozapine REMS in 2025; ANC monitoring continues per the prescribing information — FDA, 2025).
- Beyond the ANC: clozapine can cause **myocarditis** (especially in the first weeks), **severe constipation/ileus**, seizures, and orthostasis — monitor for these, not just the count.
- **Neuroleptic malignant syndrome** (fever, lead-pipe rigidity, autonomic instability, elevated CK) is the can't-miss antipsychotic emergency — stop the antipsychotic and treat supportively; consider dantrolene/bromocriptine in severe cases.
- **NMS vs. serotonin syndrome**: the key discriminator is the reflex exam — lead-pipe rigidity + hyporeflexia → NMS; clonus + hyperreflexia (especially ankle clonus) → SS. Onset timeline and offending agent (dopamine blocker vs. serotonergic drug) also direct the diagnosis.

> <div class="crisis-block-hook" hidden></div>
>
> ### If someone is in crisis
>
> On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
>
> - **988 Suicide & Crisis Lifeline** — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
> - **Crisis Text Line** — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
> - **Maine Crisis Line** — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
> - **Veterans Crisis Line** — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
> - **Emergency services** — 911. 24/7. For imminent danger to life.
>
> *Contacts verified 2026-07-27 against official sources. Maintained in `crisis_resources.json`; do not edit these numbers inline.*

**Pair with** — the [Family Meeting Playbook (90-min)](?page=family_playbook.md), the protocol library (benzo taper, clozapine), the Decisional Capacity tool, the Differential Diagnosis scaffolds, and the [What Do You Say Next? communication cases](?tool=communication-practice.html&case=psychosis_validation_001).

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI. The NMS and serotonin-syndrome material here is for recognition, not for ordering — antidote selection and dosing go through your attending, pharmacy, and toxicology.*


---

## Anxiety/Trauma/OCD

- **Slug:** `t_anxiety.md` · **Type:** md · **Sidebar:** listed
- **Source:** `03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Length:** 1,430 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 4 min · safetyLevel=`high`

**TL;DR (shown above the page text):**

> SSRIs plus exposure-based therapy are first-line across anxiety, OCD, and PTSD (SNRIs are alternatives for anxiety disorders and PTSD, not OCD) — standing benzodiazepines are a trap on the unit.

**Key points (bulleted card):**

- Rule out medical mimics (hyperthyroidism, arrhythmia, substance withdrawal).
- OCD: exposure and response prevention plus a higher-dose SSRI.
- PTSD: trauma-focused therapy (CPT/PE) is first-line.

**Can't-miss / red-flag line:**

> Don't start scheduled benzodiazepines for PTSD — they don't treat core symptoms and carry dependence risk.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Separate panic, generalized worry, obsessions/compulsions, trauma re-experiencing, avoidance, substances, and medical mimics.
- **mse** — Look for autonomic arousal, avoidance, reassurance seeking, compulsions, dissociation, sleep disruption, and concentration changes.
- **safety** — Ask about suicide, self-harm, substance use, benzodiazepine dependence, domestic violence, and trauma-related vulnerability.
- **say** — We can ask about trauma at your pace; you do not have to give details for me to understand what feels unsafe now.
- **collateral** — Ask what avoidance or rituals are impairing function and whether symptoms are episodic, trauma-linked, or substance-linked.
- **rounds** — Present the anxiety/OCD/PTSD syndrome, ruled-out mimics, functional impairment, and why the plan avoids reflexive benzodiazepines.
- **exam** — OCD is ERP plus higher-dose SSRI; PTSD is trauma-focused therapy; scheduled benzodiazepines are not first-line for PTSD.
- **actions** — Open screeners; Practice medication ambivalence

**Embedded check-for-understanding**

1. *Stem:* First-line treatment for OCD?
   - Scheduled benzodiazepine
   - Higher-dose SSRI + exposure and response prevention **← keyed correct**
   - Low-dose antipsychotic monotherapy
   - Supportive therapy alone
   - *Rationale:* OCD responds to ERP and higher-dose SSRIs; antipsychotics are adjuncts, not monotherapy.

**Cross-references and tagging:**

- **Related tools:** `screeners.html`, `communication-practice.html`
- **Communication cases:** `guardedness_privacy_001`, `medication_ambivalence_001`
- **Evidence sources:** `lima-2004-betablockers-akathisia`, `project-beta-psychopharm-agitation-2012`
- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `communication`, `exam`
- **Workflow modes:** `ward`, `5min`, `shelf`
- **Shelf blueprint tags:** `anxiety`
- **EPA crosswalk:** `EPA1`, `EPA2`
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-08"}

#### Page text (as shipped)

# Anxiety, OCD & Trauma on the Inpatient Unit


**In one line** — On the unit, anxiety, OCD, and PTSD are usually layered onto a primary admission diagnosis; your job is to separate the medical and substance mimics from the psychiatric disorder, treat the disorder with antidepressants plus structured behavioral work, and resist the reflex to standing benzodiazepines.

**How it presents on the unit** — Pure anxiety, OCD, or PTSD rarely earns an inpatient bed on its own; you will far more often meet them riding alongside a mood episode, psychosis, or substance use disorder. Distinguish anxiety *the symptom* — a near-universal reaction to admission, withdrawal, akathisia, or an undiagnosed medical problem — from anxiety *the disorder*, which is pervasive, predates the crisis, and carries its own functional impairment. PTSD may surface as hyperarousal, nightmares, or a "behavioral" reaction to restraint, seclusion, or a same-gender vs. opposite-gender examiner. OCD can masquerade as psychosis when rituals are elaborate, or as treatment refusal when contamination fears collide with the milieu.

**Differential & can't-miss mimics** — Anxiety is a final common pathway, so screen the body first: cardiopulmonary causes (arrhythmia, PE), thyroid disease (hyperthyroidism), hypoglycemia, caffeine and stimulant intoxication, and alcohol or benzodiazepine withdrawal. On a psychiatric unit, **akathisia** is the classic miss — restless, driven motor anxiety from antipsychotics that worsens if you reflexively treat it as "agitation" with more dopamine blockade. Sudden-onset panic, chest pain, dyspnea, or autonomic instability deserves a medical workup, not reassurance.

**Initial workup** — Keep it focused and hypothesis-driven: vitals with orthostatics, a careful medication and substance history (including caffeine and recent benzodiazepine changes), and a withdrawal assessment when indicated. Order TSH, glucose/fingerstick, and a basic metabolic panel; add ECG and troponin for cardiac complaints and the PERC/Wells pathway for suspected PE. A toxicology screen helps when stimulants are plausible. Examine for tremor, the inner-restlessness of akathisia, and goiter.

**Acute inpatient management** — Combine medication, skills, and milieu. **SSRIs and SNRIs are first-line** across anxiety disorders, OCD, and PTSD; counsel patients on the delayed onset and the transient early activation. **Avoid standing benzodiazepines on the unit** — they drive dependence, falls, and delirium, and are especially hazardous with comorbid SUD or in older adults; reserve them for specific, time-limited indications (e.g., a structured alcohol or sedative withdrawal protocol). Pair pharmacology with disorder-specific behavioral work: **exposure and response prevention (ERP)** for OCD, **prolonged exposure (PE)** and **cognitive processing therapy (CPT)** for PTSD, and **interoceptive exposure** for panic, introduced in graded form even during a short stay. Wrap all of it in **trauma-informed care** — predictability, explained procedures, offered choices, and minimized restraint/seclusion — which both reduces retraumatization and lowers behavioral escalation.

**Exam treatment anchors** — Panic disorder is treated first-line with an SSRI or SNRI plus CBT, especially interoceptive exposure; benzodiazepines are short-term bridges at most, not maintenance monotherapy. OCD is treated first-line with ERP and an SSRI, often at higher doses than depression; clomipramine or antipsychotic augmentation is reserved for refractory cases. PTSD care prioritizes trauma-focused psychotherapy such as CPT or prolonged exposure, with sertraline, paroxetine, or venlafaxine as medication options when medication is chosen; routine benzodiazepines are generally avoided, and prazosin may help trauma-related nightmares. Generalized social anxiety is treated with CBT/exposure and an SSRI or SNRI when medication is needed. Performance-only social anxiety is limited to discrete public performances; a PRN beta-blocker can reduce tremor, tachycardia, and sweating for those events when medically appropriate.

**When akathisia is identified** — Recognition triggers a management hierarchy; escalating the offending antipsychotic is the cardinal error. First step: **reduce the antipsychotic dose or switch to a lower-dopamine-affinity agent** (e.g., quetiapine, which has lower D2 occupancy at clinical doses) — addressing the mechanism directly is more durable than adding a second drug. When dose reduction is not immediately possible or insufficient: **propranolol 20–40 mg BID** is the usual first-line pharmacological option. Note the controlled-trial evidence is thin: the Cochrane review of beta-blockers for akathisia found only three small RCTs (n=51) and concluded the data were insufficient to recommend them (Lima et al., Cochrane Database Syst Rev 2004). This is consensus-driven practice, not a well-powered evidence base. Avoid in reactive airway disease, significant bradycardia, or heart block. If **parkinsonism co-exists** alongside the akathisia: add benztropine (anticholinergic agents target parkinsonism more reliably than pure akathisia). A **benzodiazepine** (typically clonazepam 0.5–1 mg) can provide adjunctive relief when symptoms remain severe after propranolol, but is third-line specifically for akathisia. Mirtazapine 15 mg has emerging evidence from small trials. The management hierarchy — dose reduction or switch → propranolol → benztropine if parkinsonism co-exists → benzodiazepine adjunct — ensures the intervention matches the mechanism.

> **Reviewed and attested by Joshua Moss, MD (2026-07-09).**

**What the student does**
- Screen new admissions for an anxiety, OCD, or PTSD history and document whether symptoms predate the acute crisis.
- At the bedside, evaluate restlessness deliberately: ask about an inner urge to move and inspect for akathisia before labeling a patient "anxious."
- Review the medication list and home regimen for benzodiazepine use, abrupt discontinuation, or high caffeine intake, and flag taper or withdrawal risk to the team.
- Coach one concrete skill — paced diaphragmatic breathing or grounding — and note the patient's response.
- Track target symptoms (panic frequency, ritual time, nightmares) on serial exams to gauge medication response.

**Disposition & discharge essentials** — Confirm the SSRI/SNRI is at a tolerated dose with a clear titration plan, and verify outpatient follow-up that can deliver ERP, PE, or CPT — the medication rarely finishes the job alone. Reconcile medications so no patient leaves on a new standing benzodiazepine without an explicit, time-limited rationale and taper. Give the patient and family a relapse-warning plan and crisis contacts, and communicate trauma-informed considerations to the next setting.

> <div class="crisis-block-hook" hidden></div>
>
> ### If someone is in crisis
>
> On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
>
> - **988 Suicide & Crisis Lifeline** — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
> - **Crisis Text Line** — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
> - **Maine Crisis Line** — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
> - **Veterans Crisis Line** — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
> - **Emergency services** — 911. 24/7. For imminent danger to life.
>
> *Contacts verified 2026-07-27 against official sources. Maintained in `crisis_resources.json`; do not edit these numbers inline.*

**High-yield pearls**
- Anxiety is a symptom before it is a diagnosis — clear the medical and withdrawal mimics first.
- Akathisia is the great inpatient impostor; treat the cause, not with more dopamine blockade.
- Akathisia management hierarchy: reduce dose or switch the antipsychotic → **propranolol** (first-line by consensus; thin trial evidence, Lima et al. Cochrane 2004) → benztropine if co-existing parkinsonism → benzodiazepine adjunct.
- SSRIs/SNRIs are first-line; benzodiazepines are a liability on the unit, not a maintenance plan.
- Definitive treatment is behavioral — ERP for OCD, PE/CPT for PTSD, interoceptive exposure for panic.
- The scale to know for OCD is the **Y-BOCS** (Yale-Brown Obsessive-Compulsive Scale) — the gold-standard clinician-rated measure of OCD severity and treatment response (a symptom checklist plus 10 severity items, obsessions and compulsions scored separately).
- Trauma-informed care is clinical, not optional: predictability and choice prevent escalation.

**Pair with** — the Mental Status Exam tool (Language & Interview tab) for eliciting anxiety and trauma history without retraumatizing; the **Reflection & PIF** set (the Reflection & Identity tool) to process your own response to distressing presentations; and the **Differential Diagnosis** scaffolds for working the anxiety-mimic list systematically.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI. Doses here are teaching illustrations, not prescribing guidance — verify every dose and contraindication (β-blockers in asthma, bradycardia, or heart block) against current labeling and your attending.*


---

## Personality

- **Slug:** `t_personality.md` · **Type:** md · **Sidebar:** listed
- **Source:** `03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 1,322 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 4 min

**TL;DR (shown above the page text):**

> For borderline personality, the unit's job is a consistent, validating frame — not a medication for the diagnosis itself.

**Key points (bulleted card):**

- DBT-informed stance: validate and hold limits; debrief splitting as a team.
- Treat comorbid depression or PTSD; medications target symptoms, not the disorder.
- Name and tolerate countertransference rather than acting on it.

**Can't-miss / red-flag line:**

> Avoid polypharmacy and reactive medication changes driven by crises — they rarely help and can harm.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Ask about enduring patterns, trauma, relationships, self-harm, abandonment fears, affect shifts, and what has helped during past crises.
- **mse** — Track affect intensity, interpersonal stance, impulsivity, dissociation, self-harm cues, and countertransference in the team.
- **safety** — Separate chronic baseline risk from acute change; assess means, intoxication, recent losses, threats, and ability to collaborate on a plan.
- **say** — I want to take the distress seriously and also keep our plan consistent, so we do not make reactive changes that later feel unhelpful.
- **collateral** — Ask about baseline risk, effective limits, crisis plans, outpatient supports, and team-splitting patterns without blaming the patient.
- **rounds** — Present a validating formulation, acute risk change, team consistency plan, and symptom-targeted medication rationale.
- **exam** — Personality disorders are enduring patterns; inpatient care focuses on safety, consistency, comorbidity, and avoiding reactive polypharmacy.
- **actions** — Practice rupture repair; Practice formulation reasoning; Plan boundary-safe family involvement; Open boundary-safe collateral workflow

**Embedded check-for-understanding**

1. *Stem:* Best inpatient response to staff splitting around a patient with borderline personality disorder?
   - Discharge for the behavior
   - Assign one nurse to meet all requests
   - Start a mood stabilizer for the personality disorder
   - A unified team plan with consistent, kind limits **← keyed correct**
   - *Rationale:* Splitting is managed with team consistency and clear limits; medication does not treat the personality disorder itself.

**Family overlay:** `personality_family_boundaries_and_team_consistency`

**Cross-references and tagging:**

- **Related tools:** `cssrs.html`, `reflection.html`, `communication-practice.html`, `diagnostic-reasoning.html`, `family-systems.html`
- **Communication cases:** `rupture_limit_setting_001`, `bpd_rupture_repair_001`
- **Evidence sources:** `links-ross-2025`, `wibbelink-2026`, `brodsky-2025`, `arqueros-2026`, `appel-2026`, `linehan-1991-dbt`
- **Workflow stages:** `diagnosis`, `safety`, `communication`, `team`, `exam`, `family`
- **Workflow modes:** `ward`, `family`
- **Shelf blueprint tags:** `personality`
- **EPA crosswalk:** `EPA1`, `EPA2`
- **Call-to-action buttons:** Practice rupture repair; Plan boundary-safe family involvement; Open boundary-safe collateral workflow

#### Page text (as shipped)

# Personality Disorders on the Inpatient Unit


**In one line** — Personality pathology (most often borderline personality disorder, BPD) drives a large share of inpatient distress and crisis, and your job is to treat the acute problem while avoiding the iatrogenic harms of overlong, overmedicalized, or poorly coordinated care.

**How it presents on the unit** — Patients are usually admitted in crisis, not because the personality disorder itself responds to hospitalization. Distinguish *chronic suicidality* (a long-standing, fluctuating baseline of suicidal thoughts as a way of coping with unbearable affect) from *acute-on-chronic* escalation (a sharp rise above baseline, often after an interpersonal rupture or loss). Watch for non-suicidal self-injury, intense and rapidly shifting emotions, fear of abandonment, and interpersonal crises that play out on the unit. Splitting—experiencing staff as all-good or all-bad—is common and is a feature of the illness, not a character flaw or manipulation.

**Differential & can't-miss mimics** — Before attributing presentation to personality, rule out a treatable acute episode: major depression, bipolar mood states (especially mixed features), and primary or substance-induced psychosis. Screen for intoxication and withdrawal. Complex PTSD overlaps heavily with BPD (affect dysregulation, relational instability, dissociation) and may be the more actionable frame. The cardinal error is *diagnostic overshadowing*: letting a personality label cause you to under-treat a real, acute, treatable illness. A BPD diagnosis does not protect a patient from also having a serious mood, psychotic, or medical condition.

**Exam diagnostic anchors** — A personality disorder is an enduring, pervasive, inflexible pattern that begins by adolescence or early adulthood, is stable across contexts, and causes distress or impairment. Do not diagnose a personality disorder from behavior limited to an acute manic, psychotic, intoxicated, or withdrawal state.

| Anchor | What separates it |
|---|---|
| **Clusters** | A = odd/eccentric (paranoid, schizoid, schizotypal); B = dramatic/erratic (antisocial, borderline, histrionic, narcissistic); C = anxious/fearful (avoidant, dependent, OCPD) |
| **Antisocial PD** | Age at least 18 plus evidence of conduct disorder with onset before age 15; one violent act is not enough |
| **Paranoid PD** | Lifelong distrust and suspiciousness without fixed delusions, hallucinations, or schizophrenia-level functional collapse |
| **Schizotypal PD** | Odd beliefs or magical thinking, ideas of reference, odd speech, eccentric behavior, and paranoid social anxiety that does not ease with familiarity |
| **Schizoid PD** | Detachment and limited desire for relationships, without the odd beliefs of schizotypal PD |
| **OCPD vs OCD** | OCPD is ego-syntonic perfectionism, order, and control; OCD has intrusive ego-dystonic obsessions and anxiety-reducing compulsions |
| **Narcissistic PD** | Grandiosity, need for admiration, entitlement, and lack of empathy |
| **Dependent PD** | Excessive need to be cared for, difficulty making decisions without reassurance, helplessness when alone, and urgent replacement of lost caregiving relationships |
| **Histrionic PD** | Attention-seeking through dramatic, seductive, shallow, rapidly shifting emotionality and overestimating intimacy |

**Initial workup** — Focused and proportionate. Collateral history (prior records, outpatient clinician, family) is often the highest-yield step. Targeted labs as the presentation dictates (toxicology, TSH, basic metabolic, pregnancy where relevant); medication reconciliation; review prior admissions and what helped or harmed. Clarify the *function* of the current crisis—what changed in the last days—rather than only cataloguing symptoms.

**Acute inpatient management** — Anchor care in a few durable principles. Use a DBT-informed stance (Linehan): pair genuine *validation* of the patient's distress with a steady *push toward change* and skill use. Keep admissions brief and goal-focused; it is **unstructured, open-ended stays — not length itself — that foster regression and dependency** (structured inpatient DBT programs of differing lengths produce comparable gains), so define discharge criteria on day one. Apply consistent, transparent limit-setting and communicate as a unified team—shared notes and handoffs blunt splitting and prevent staff from being divided into "good" and "bad." Minimize polypharmacy; no medication treats BPD itself, and accumulating agents adds risk without benefit. In particular, **do not start or escalate benzodiazepines** — they carry the highest risk of attempted or completed suicide of any psychotropic class studied in BPD (HR 1.61, 95% CI 1.45–1.78; Lieslehto 2023) and worsen disinhibition. If a crisis genuinely needs pharmacology, follow the NICE rule: a *single* agent at the minimum effective dose for ≤1 week (prefer a sedating antihistamine or low-dose quetiapine over benzodiazepines and TCAs), then stop. Teaching coping skills can substitute for medication — DBT skills training itself reduces polypharmacy ("skills, not pills"). For chronic suicidality, collaborative safety planning is often preferable to repeated or prolonged admission, which can reinforce the hospital as the primary coping strategy. Throughout, notice and manage your own countertransference—frustration, rescue urges, dread—because it shapes decisions and can leak into care.

**What the student does** —
- Obtain and document collateral; reconcile medications and prior-admission outcomes.
- Sit with the patient and build a collaborative safety plan in their words.
- Bring observed splitting or team-division to rounds so the plan stays unified.
- Reach for concrete DBT-informed unit tools — distress-tolerance (TIPP) skills, a chain analysis *with* the patient after self-harm rather than a punitive response, diary cards.
- Track suicidality against the patient's chronic baseline, not in the abstract.
- Name your countertransference to your resident or attending and use supervision.

**Practice what to say next** — Rehearse
[repairing rupture after a patient feels dismissed](?tool=communication-practice.html&case=bpd_rupture_repair_001)
and [repairing after limit-setting](?tool=communication-practice.html&case=rupture_limit_setting_001).
The goal is validation plus a steady frame, not either/or.

**Disposition & discharge essentials** — Plan discharge from admission. Secure a concrete outpatient follow-up (ideally a structured therapy such as DBT) with a named clinician and date, a written safety plan, means-restriction counseling, and family or support-system involvement when appropriate. Communicate the plan clearly to outpatient providers so continuity is real, not assumed.

**High-yield pearls**
- Hospitalization treats the acute crisis, not the personality disorder—define the goal and the exit early.
- Splitting is a symptom; the antidote is team consistency and communication, not confrontation.
- Always exclude a treatable acute mood, psychotic, or substance disorder before invoking personality.
- Chronic suicidality is managed primarily in the outpatient/safety-planning frame, not by serial admissions.
- Never start or escalate benzodiazepines in BPD — highest risk of attempted or completed suicide of any class (Lieslehto 2023); reach for skills, not pills.
- Your countertransference is clinical data—track it and use supervision.

> <div class="crisis-block-hook" hidden></div>
>
> ### If someone is in crisis
>
> On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
>
> - **988 Suicide & Crisis Lifeline** — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
> - **Crisis Text Line** — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
> - **Maine Crisis Line** — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
> - **Veterans Crisis Line** — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
> - **Emergency services** — 911. 24/7. For imminent danger to life.
>
> *Contacts verified 2026-07-27 against official sources. Maintained in `crisis_resources.json`; do not edit these numbers inline.*

**Pair with** — the [suicide-risk & safety pocket card](?page=pg_suicide.md), the <a href="tools/reflection.html" target="_blank" rel="noopener">Reflection & Identity tool</a>, the [Family Therapy Modalities](?page=family_modalities.md) material, and the [What Do You Say Next? rupture-repair cases](?tool=communication-practice.html&case=bpd_rupture_repair_001).

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*


---

## Substance Use

- **Slug:** `t_sud.md` · **Type:** md · **Sidebar:** listed
- **Source:** `03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`high`
- **Length:** 1,345 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> flagged **high-yield** · est. read 4 min · safetyLevel=`high`

**TL;DR (shown above the page text):**

> Time the withdrawal syndrome and treat it proactively — alcohol withdrawal is benzodiazepines (CIWA-guided) plus thiamine before or with glucose.

**Key points (bulleted card):**

- Use CIWA-Ar (alcohol) and COWS (opioid) to drive symptom-triggered dosing.
- Offer medication for addiction: buprenorphine/methadone for opioids; naltrexone/acamprosate for alcohol.
- Give thiamine before or with glucose to prevent Wernicke encephalopathy — and never delay dextrose in documented hypoglycemia.

**Can't-miss / red-flag line:**

> Delirium tremens (48–72h) is a medical emergency with real mortality — escalate early, don't wait.

**Rule-out list (differential the page forces):**

- Alcohol withdrawal (tremor → DTs)
- Opioid withdrawal
- Benzodiazepine withdrawal
- Stimulant intoxication

**First move (the action the page tells the learner to take):**

> Symptom-triggered benzodiazepine for alcohol; thiamine; begin medication-for-addiction planning early.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Ask last use, amount, route, withdrawal history, seizures/DTs, overdose, medications for addiction, readiness, and concurrent psychiatric symptoms.
- **mse** — Look for intoxication, withdrawal, delirium, tremor, diaphoresis, psychosis, mood symptoms, cognition, and pain.
- **safety** — Monitor alcohol/benzodiazepine withdrawal, opioid overdose risk, suicidality, violence risk when intoxicated, and medical instability.
- **say** — Would it be okay if we talk about what the substance is doing for you and what it is costing you right now?
- **collateral** — Clarify withdrawal timeline, overdose history, access to substances after discharge, family supports, and barriers to medication treatment.
- **rounds** — Present withdrawal timing, CIWA/COWS trend, thiamine, medication-for-addiction options, and discharge linkage.
- **exam** — Alcohol withdrawal is benzodiazepines plus thiamine; opioid use disorder treatment includes buprenorphine or methadone.
- **actions** — Open withdrawal tool; Practice medication ambivalence; Clarify family supports and discharge barriers; Open discharge collateral workflow

**Embedded check-for-understanding**

1. *Stem:* On hospital day 2, a heavy drinker is tremulous and tachycardic with visual hallucinations and a clear sensorium. Best management?
   - Restraints and observation
   - Scheduled haloperidol
   - IV dextrose first
   - CIWA-guided benzodiazepine + thiamine **← keyed correct**
   - *Rationale:* Alcohol withdrawal is treated with symptom-triggered benzodiazepines plus thiamine, given before or with any glucose-containing fluids. Dextrose is not the priority here — nothing in the stem suggests hypoglycemia — and carbohydrate given to a thiamine-depleted patient without thiamine can precipitate Wernicke encephalopathy.

**Family overlay:** `sud_family_discharge_supports_and_boundaries`

**Cross-references and tagging:**

- **Related tools:** `withdrawal.html`, `cssrs.html`, `communication-practice.html`, `family-systems.html`
- **Communication cases:** `medication_ambivalence_001`
- **Evidence sources:** `asam-alcohol-withdrawal-2020`, `schwenker-2023`, `bastos-maia-2025`, `pott-2022`, `volkow-2016-addiction-brain-disease`
- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `communication`, `exam`, `family`
- **Workflow modes:** `ward`, `safety`, `5min`, `shelf`, `family`
- **Shelf blueprint tags:** `substance`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA10`
- **Call-to-action buttons:** Open withdrawal tool; Clarify discharge supports; Open discharge collateral workflow
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-07-01"}

#### Page text (as shipped)

# Substance Use & Withdrawal on the Inpatient Unit


**In one line** — On the inpatient unit, substance use disorders show up as intoxication, withdrawal, or a confounder of every other psychiatric presentation, and your job is to keep the patient physiologically safe while engaging them, without judgment, in treatment that continues after discharge.

**How it presents on the unit** — Three overlapping patterns. *Intoxication* can mimic or unmask psychiatric illness (stimulant-induced paranoia, alcohol-related mood lability, sedative disinhibition). *Withdrawal* is the time-sensitive one: alcohol and benzodiazepine withdrawal can progress to seizures and delirium tremens and can kill, whereas opioid and stimulant withdrawal are intensely uncomfortable but rarely lethal. *Co-occurring psychiatric illness* is the rule, not the exception — depression, anxiety, PTSD, and psychotic disorders frequently travel with substance use, and you cannot reliably diagnose a primary mood or psychotic disorder while the patient is acutely intoxicated or withdrawing.

**Differential & can't-miss mimics** — Altered mental status in a patient who uses substances is never automatically "just withdrawal." Keep these live: **Wernicke encephalopathy** (confusion, ophthalmoplegia, ataxia — often incomplete, so a low threshold is correct); **head injury / subdural hematoma** (falls and trauma are common); **occult infection / sepsis** (meningitis, pneumonia, aspiration); **hepatic encephalopathy** in the patient with alcohol-related liver disease (asterixis, elevated ammonia); and **polysubstance use masking** a more dangerous co-ingestant or an evolving metabolic, electrolyte, or anticholinergic picture. Anchor every withdrawal assessment with vitals and a neuro exam.

**Initial workup** — Focused and pragmatic: full vitals with a neurologic exam, fingerstick glucose, basic metabolic panel and magnesium, liver function tests, CBC, a urine drug screen and blood/breath alcohol, and a pregnancy test where relevant. Add ECG when QTc-affecting agents or methadone are in play. Image the head if there is trauma, a focal deficit, or unexplained or out-of-proportion altered mental status.

**Acute inpatient management** — For **alcohol withdrawal**, score serially with the **CIWA-Ar** and treat symptom-driven with **benzodiazepines**, escalating vigilance for **seizures and delirium tremens** in high-risk patients. Give **thiamine before or with glucose** — administering carbohydrate to a thiamine-depleted patient can precipitate Wernicke encephalopathy. The sequencing matters for maintenance and repletion fluids; it is **not** a reason to withhold emergency dextrose in documented hypoglycemia, where delay causes real neuronal injury — give the sugar immediately and the thiamine as soon as it is in hand. For **opioid withdrawal**, track severity with the **COWS**, and begin **buprenorphine induction only once objective withdrawal is present (roughly COWS greater than or equal to 8 to 12)** to avoid precipitated withdrawal from displacing residual full agonist too early. For ongoing **alcohol use disorder**, offer **naltrexone or acamprosate**. Frame the whole encounter through the **Volkow brain-disease model** of addiction — naming addiction as a chronic, treatable brain condition rather than a moral failing directly combats stigma — and use **motivational interviewing** to meet ambivalence with curiosity rather than confrontation.

**Alcohol use disorder pharmacotherapy anchor** — Naltrexone and acamprosate are first-line maintenance medications for alcohol use disorder when not contraindicated. Naltrexone reduces heavy drinking but cannot be used with opioids and requires liver-risk review; in compensated cirrhosis it may be considered with monitoring, while acute hepatitis or advanced decompensation pushes you away from it. Acamprosate supports abstinence, is renally cleared, and is the cleaner first-line choice when the question asks you to avoid hepatic metabolism; adjust or avoid it in renal impairment. Disulfiram is adherence-dependent and avoided in liver disease; benzodiazepines treat withdrawal, not maintenance.

**Benzodiazepine choice in hepatic impairment** — Not all benzodiazepines are equivalent when liver function is compromised, and the distinction has direct management implications. Chlordiazepoxide and diazepam depend on **oxidative CYP450 hepatic metabolism** and produce long-lived active metabolites (desmethyldiazepam, nordiazepam) that accumulate when hepatic clearance is reduced — the result is progressive over-sedation, respiratory depression, and worsening hepatic encephalopathy. **Lorazepam, oxazepam, and temazepam** (the "LOT" drugs) bypass the oxidative step entirely: they are conjugated directly by **glucuronidation**, a pathway that is relatively preserved even in significant cirrhosis, and they produce no clinically meaningful active metabolites. In patients with Child-Pugh B or C cirrhosis (or any patient with overt hepatic encephalopathy, jaundice, or coagulopathy from liver disease), use a LOT drug at conservative initial doses rather than a long-acting oxidatively metabolized benzodiazepine (Schuckit, N Engl J Med 2014; Saitz, N Engl J Med 1998). Phenobarbital is an alternative in refractory withdrawal but carries its own sedation and respiratory risks and typically requires a higher-acuity setting.

> **Reviewed and attested by Joshua Moss, MD (2026-07-09).**

<a class="tl-chip" href="?tool=withdrawal.html" data-tool="withdrawal.html" data-icon="withdrawal">Score at the bedside — CIWA-Ar / COWS</a>

**What the student does**
- Perform and document serial **CIWA-Ar** or **COWS** scores at the bedside and flag trends to the team.
- Lay hands on the patient: vitals, hydration status, pupils, gait, asterixis — and report concerning changes early.
- Verify **thiamine was given before or with any glucose-containing fluids** — and that nobody delayed emergency dextrose to go looking for it.
- Take a non-judgmental substance history (substances, routes, last use, prior withdrawal/seizures) using open questions.
- Practice one motivational-interviewing reflection and bring it to rounds.

**Disposition & discharge essentials** — Discharge is the intervention that prevents the next admission. Provide **naloxone and overdose-prevention education** to any patient at opioid risk and to their family. Arrange **linkage to medication for opioid use disorder (MOUD)** — buprenorphine or methadone — before the patient leaves, since the post-discharge window carries elevated overdose risk. Confirm follow-up, a warm handoff where possible, and continuation of any alcohol use disorder pharmacotherapy started inpatient.

**High-yield pearls**
- Alcohol and benzodiazepine withdrawal can be lethal; opioid and stimulant withdrawal are miserable but rarely fatal — match your urgency accordingly.
- In hepatic impairment, reach for a **LOT drug** (Lorazepam, Oxazepam, Temazepam) — glucuronidation is preserved in cirrhosis; the oxidative CYP450 pathway (chlordiazepoxide, diazepam) is not.
- Thiamine before (or with) glucose in withdrawal and refeeding — but never delay dextrose for documented hypoglycemia; give the sugar immediately and the thiamine as soon as it is in hand.
- Do not start buprenorphine until objective withdrawal is on board (COWS roughly greater than or equal to 8 to 12) or you may precipitate withdrawal.
- A patient who uses substances with new confusion gets a real differential — Wernicke, trauma, infection, hepatic encephalopathy — not a reflex withdrawal label.
- Naloxone plus MOUD linkage at discharge is a concrete, evidence-based way to save a life.

> <div class="crisis-block-hook" hidden></div>
>
> ### If someone is in crisis
>
> On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
>
> - **988 Suicide & Crisis Lifeline** — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
> - **Crisis Text Line** — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
> - **Maine Crisis Line** — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
> - **Veterans Crisis Line** — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
> - **Emergency services** — 911. 24/7. For imminent danger to life.
>
> *Contacts verified 2026-07-27 against official sources. Maintained in `crisis_resources.json`; do not edit these numbers inline.*

**Pair with** — the **Withdrawal scales CIWA-Ar / COWS card** (the Withdrawal (CIWA-Ar/COWS) card), the **Benzodiazepine taper protocol** (the protocol library (benzo taper, clozapine)), and the **Differential Diagnosis scaffolds**.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*
