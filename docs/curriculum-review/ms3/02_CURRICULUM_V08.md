# MS3 · Curriculum content — volume 8

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Present and Work with the Team

---

## Treatment Team Rounding Prep

- **Slug:** `oral.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `02_Clinical_Skills/Oral_Presentations/oral-presentation-module.html`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Treatment Team Rounding Prep Reviewed by Joshua Moss, MD on 2026-06-30
- Skip to content

**Authored clinical strings (87):**

- Events, nursing notes, incidents, PRNs given
- Hours slept; pattern vs. prior nights
- Agitation, isolation, interactions, groups attended
- PO intake, appetite, hydration; refusals
- Current psychotropics, changes, missed/refused doses, levels
- Pertinent vitals, labs, drug levels, pending studies
- SI/HI status, observation level, restraint/seclusion use
- Barriers to discharge, family/collateral, aftercare, legal status
- ID + chief concern + key context, in one sentence.
- "Mr. A is a 34-year-old man with bipolar I, admitted on a hold for a manic episode after stopping lithium."
- What changed since the last presentation: events, behavior, sleep, intake, PRNs.
- "Overnight he slept 3 hours, was redirectable, took one PRN olanzapine for agitation."
- Subjective + MSE highlights
- Patient report plus the 2-3 MSE findings that matter today — not the whole exam.
- "Reports he feels great; still pressured, expansive affect, grandiose themes, no SI/HI."
- Objective: meds, vitals, labs
- Relevant data and changes only: current psychotropics + adjustments, pertinent vitals/labs/levels.
- "Lithium restarted, level pending; valproate at goal; vitals stable."
- Explicit SI/HI, agitation, elopement, and observation level — never skipped.
- "No SI/HI; one agitation episode managed verbally; remains on Q15 checks."
- One to two lines: who, what, why now — biological + relational. Not a re-read of the HPI.
- "Manic relapse precipitated by lithium discontinuation and sleep loss, with high family expressed emotion."
- Problem-based, concrete next steps: meds, monitoring, milieu/family, disposition.
- "1) Mania: resume lithium, recheck level. 2) Sleep: protect with scheduled meds. 3) Family meeting today. 4) Dispo: needs 1 more day of stability."
- Use after a collateral call, family call, outpatient-clinician call, or nursing update.
- Source -> baseline -> timeline -> risk/discharge -> plan change
- Who you spoke with and the consent/policy frame.
- "I spoke with his sister with patient permission."
- What the patient is like when well.
- "Baseline is organized, employed, and usually sleeps 7 hours."
- "Sleep dropped 5 days ago, spending increased, then paranoia escalated."
- What changes safety or disposition.
- "Family can secure meds, but cannot supervise overnight."
- One sentence on what this changes.
- "This supports mania and makes discharge premature today."
- Use for a daily patient update when the team already knows the admission story.
- Hospital day -> overnight -> one subjective/MSE change -> risk -> plan question
- Orient the team immediately.
- "Hospital day 4 for mania with psychosis."
- Sleep, PRNs, safety events, vitals/labs only if relevant.
- "Slept 5 hours, no IMs, accepted lithium and olanzapine."
- One patient report and one observed change.
- "Feels slower; speech is less pressured but grandiosity persists."
- What is safer, worse, or still unresolved.
- "Violence risk is lower with sleep, but discharge risk remains high."
- End with the decision you need from the team.
- "My question is whether to request limited collateral today."
- Give a real assessment — who/what/why-now, not a recap.
- Plan by problem with concrete next steps.
- End without a plan or disposition thought.
- s 5th line, "Know your numbers", doesn
- t-card // line ever changes, re-check this label stays in sync. {k:
- } ]; var FORMAT_LABEL={full:
- }; function loadOralReps(){ try{ var raw=localStorage.getItem(
- ); if(!raw) return []; var parsed=JSON.parse(raw); if(!parsed||!Array.isArray(parsed.reps)) return []; return parsed.reps; }catch(err){ return []; } } function saveOralReps(list){ try{ localStorage.setItem(
- , JSON.stringify({v:1,reps:list})); }catch(err){} } function targetForFormat(format){ if(format===
- ) return TARGET; var m=MICRO.filter(function(x){return x.key===format;})[0]; return m?m.target:null; } function fmtRepDate(iso){ var d=new Date(iso); if(isNaN(d.getTime())) return iso; return (d.getMonth()+1)+
- +d.getFullYear(); } function rubricScore(rubric){ if(!rubric) return null; var keys=[
- ]; var n=0; for(var i=0;i<keys.length;i++){ if(rubric[keys[i]]) n++; } return n; } function App(){ var tab=useState(
- ); var setTab=tab[1]; tab=tab[0]; var sec=useState(0); var setSec=sec[1]; sec=sec[0]; var microKey=useState(
- ); var setMicroKey=microKey[1]; microKey=microKey[0]; var microSec=useState(0); var setMicroSec=microSec[1]; microSec=microSec[0]; var microRun=useState(false); var setMicroRun=microRun[1]; microRun=microRun[0]; var run=useState(false); var setRun=run[1]; run=run[0]; var done=useState({}); var setDone=done[1]; done=done[0]; var microDone=useState({}); var setMicroDone=microDone[1]; microDone=microDone[0]; var prep=useState({}); var setPrep=prep[1]; prep=prep[0]; var stepMark=useState({}); var setStepMark=stepMark[1]; stepMark=stepMark[0]; var reps=useState(loadOralReps); var setReps=reps[1]; reps=reps[0]; var pending=useState(null); var setPending=pending[1]; pending=pending[0]; var rubricDraft=useState({}); var setRubricDraft=rubricDraft[1]; rubricDraft=rubricDraft[0]; var fullRepAt=useState(null); var setFullRepAt=fullRepAt[1]; fullRepAt=fullRepAt[0]; var microRepAt=useState(null); var setMicroRepAt=microRepAt[1]; microRepAt=microRepAt[0]; var ref=useRef(null); var microRef=useRef(null); useEffect(function(){ if(run){ ref.current=setInterval(function(){ setSec(function(s){return s+1}); },1000);} return function(){ if(ref.current) clearInterval(ref.current);} },[run]); useEffect(function(){ if(microRun){ microRef.current=setInterval(function(){ setMicroSec(function(s){return s+1}); },1000);} return function(){ if(microRef.current) clearInterval(microRef.current);} },[microRun]); function activeStep(){ var acc=0; for(var i=0;i<STEPS.length;i++){ acc+=STEPS[i].sec; if(sec<acc) return i;} return STEPS.length-1; } function activeMicroStep(steps){ var acc=0; for(var i=0;i<steps.length;i++){ acc+=steps[i].sec; if(microSec<acc) return i;} return steps.length-1; } function togglePrep(k){ var x=Object.assign({},prep); x[k]=!x[k]; setPrep(x); } function toggleDone(n){ var x=Object.assign({},done); var turningOn=!x[n]; x[n]=turningOn; setDone(x); var m=Object.assign({},stepMark); if(turningOn){ m[n]=sec; } else { delete m[n]; } setStepMark(m); } function toggleMicroDone(k){ var x=Object.assign({},microDone); x[k]=!x[k]; setMicroDone(x); } function computeFullPerStep(){ var out=[]; var prevT=0; for(var i=0;i<STEPS.length;i++){ var s=STEPS[i]; if(stepMark[s.n]===undefined) return null; var actual=stepMark[s.n]-prevT; if(actual<0) return null; out.push({k:s.t,target:s.sec,actual:actual}); prevT=stepMark[s.n]; } return out; } // One record per continuous timeline (the span between Reset/mode-switches that zero a // timer). `existingAt` is the current timeline
- s total/perStep in place instead of appending a duplicate. Returns the // record
- this timeline already has a rep.
- Optional self-check — tap what you did, or skip.
- Over time — wrap up and stop.
- Over time — stop and trim one sentence.
- Clinical Skills · optional aid
- Treatment Team Rounding Prep
- Optional — use it if it helps
- Walk into treatment-team rounds with the right data, then present it crisply. Gather, present, rehearse the 3-minute structure, or practice a focused 30-second collateral update and 60-second rounds update. Nothing here is required — it is a scaffold you can lean on while you build the habit.
- Before rounds — have these ready
- The pre-round sweep. Tick what you have; the gaps are your to-do before the team sits down.
- Safety is the non-negotiable.
- Even on a quiet patient, know the SI/HI status and observation level before you walk in.
- How to say it: the seven-part, ~3-minute inpatient presentation. The one-liner does the heavy lifting.
- Lead with the one-liner; never bury SI/HI.
- If your first sentence names age, key diagnosis, and why-they-are-here, the team is oriented before the HPI.
- — who/what/why-now, not a recap.
- with concrete next steps.
- (levels, vitals, days admitted).
- ("difficult patient") — describe behavior.
- deg, var(--primary-light) 0deg)
- Tick each section as you say it. The highlighted step is where a well-paced presentation should be right now.
- Two short formats for the moments students actually get interrupted on rounds: a 30-second collateral update and a 60-second daily rounds update. Say them out loud; do not type patient information here.
- Tick each section as you say it. The highlighted line is where this update should be right now.
- Optional educational aid for clinical trainees. Examples are fictional composites — no protected health information. The format is a scaffold; follow your team and institution conventions.
- Treatment Team Rounding Prep · Psychiatry Clerkship Library · Joshua Moss, MD | Psychiatrist

---

## High-Yield Rounds Questions

- **Slug:** `rounds_questions.md` · **Type:** md · **Sidebar:** listed
- **Source:** `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 8,682 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 8 min

**TL;DR (shown above the page text):**

> Nearly 100 Q&A pairs formatted for oral rehearsal before rounds — each with a model answer, supporting evidence, key paper, and clinical pearl; rehearse out loud, not by reading silently.

**Key points (bulleted card):**

- The format mirrors what attendings actually ask: a direct clinical question, a concise evidence-based answer, the key paper, and one pearl that adds depth or names a trap.
- Covers all shelf/COMAT domains: psychotic disorders (Q1–15), mood, substance use, acute safety, personality, neurocognitive, and psychopharmacology.
- Rehearse out loud before rounds — saying the answer in 20–30 seconds approximates the actual clinical demand and reveals gaps that silent reading conceals.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Before rounds, pick one likely attending question from the patient in front of you: diagnosis, risk, medication, family, disposition, or evidence.
- **mse** — Tie your answer to today's observed MSE change, not just to a memorized fact.
- **safety** — When a question touches suicide, violence, delirium, catatonia, withdrawal, capacity, or medication toxicity, include what would trigger escalation.
- **say** — My current answer is..., and the piece of data that would change my mind is...
- **collateral** — Use collateral to support or challenge the answer: baseline, time course, adherence, side effects, family safety, and outpatient course.
- **rounds** — Answer in one sentence, then add evidence or a clinical pearl only if it changes the plan.
- **exam** — Oral rehearsal improves retrieval: say the answer out loud, then test the same concept in the question bank.
- **actions** — Open rounding prep; Open practice questions

**Cross-references and tagging:**

- **Related tools:** `oral.html`, `question-bank-practice.html`
- **Workflow stages:** `team`, `diagnosis`, `safety`, `exam`
- **Workflow modes:** `ward`, `5min`, `shelf`
- **EPA crosswalk:** `EPA6`

#### Page text (as shipped)

# High-Yield Rounds Questions

Rapid rounds prep — nearly a hundred questions a resident or attending might ask, each with a model answer, the supporting evidence, the key paper, and a clinical pearl. Rehearse out loud before rounds and self-test across the core topics (including sleep, eating, and neurodevelopmental disorders for the shelf/COMAT).

## PSYCHOTIC DISORDERS (Questions 1–15)

**1. What are the DSM-5 Criterion A symptoms of schizophrenia?**

- **Answer:** Delusions, hallucinations, disorganized speech, grossly disorganized/catatonic behavior, and negative symptoms. At least one must be delusions, hallucinations, or disorganized speech.

- **Evidence:** DSM-5 eliminated Schneiderian first-rank symptoms as having special diagnostic weight.

- **Key paper:** Tandon et al., Schizophr Res 2013 — DSM-5 schizophrenia definition and rationale.

- **Pearl:** The mnemonic "**D**elusions, **H**allucinations, **D**isorganized speech, **D**isorganized behavior, **N**egative symptoms" — at least 2 required, at least 1 from the first three.

**2. How long must symptoms persist to diagnose schizophrenia vs. schizophreniform disorder?**

- **Answer:** Schizophrenia requires ≥6 months of continuous signs (including ≥1 month of active-phase symptoms); schizophreniform disorder is 1–6 months.

- **Evidence:** Schizophreniform disorder does not require functional decline.

- **Key paper:** Crawford & Go, Am Fam Physician 2022.

- **Pearl:** If a patient presents with first-episode psychosis and has been symptomatic for 3 months, the working diagnosis is schizophreniform — it "upgrades" to schizophrenia at 6 months.

**3. What are positive vs. negative symptoms, and why does the distinction matter?**

- **Answer:** Positive symptoms (delusions, hallucinations, disorganized speech/behavior) are additions to normal experience. Negative symptoms (blunted affect, alogia, avolition, asociality, anhedonia) are deficits. Negative symptoms drive long-term functional impairment and respond poorly to D2 antagonists.

- **Evidence:** Up to 60% of patients have clinically prominent negative symptoms; they are the strongest predictor of poor functional outcomes.

- **Key paper:** McCutcheon et al., JAMA Psychiatry 2020.

- **Pearl:** Always distinguish **primary** negative symptoms (intrinsic to schizophrenia) from **secondary** ones (caused by depression, medication side effects, social deprivation) — secondary causes are treatable.

**4. What is the mechanism of action of antipsychotics?**

- **Answer:** All current antipsychotics modulate dopamine — most are D2 receptor antagonists or partial agonists. Therapeutic efficacy correlates with ~65–80% D2 receptor occupancy.

- **Evidence:** SGAs add potent 5-HT2A antagonism, which may reduce EPS and modestly improve negative symptoms.

- **Key paper:** Leucht et al., Am J Psychiatry 2024 — concise review of antipsychotic history and classification.

- **Pearl:** The FGA/SGA distinction is increasingly considered clinically unhelpful — what matters is the individual drug's receptor-binding profile and side-effect signature.

**5. What did the CATIE trial show?**

- **Answer:** In 1,460 patients with chronic schizophrenia, olanzapine had the longest time to all-cause discontinuation but the worst metabolic profile. Perphenazine (an FGA) performed comparably to SGAs. Only 26% completed 18 months on assigned medication.

- **Evidence:** Phase 2 showed clozapine was superior for patients who failed initial treatment for efficacy reasons.

- **Key paper:** Lieberman et al., NEJM 2005.

- **Pearl:** CATIE's bottom line — **no SGA is clearly superior to a well-chosen FGA**, and drug selection should be individualized by side-effect profile, not by generation.

**6. What are the indications for clozapine?**

- **Answer:** (1) Treatment-resistant schizophrenia (failure of ≥2 adequate antipsychotic trials), and (2) reducing recurrent suicidal behavior in schizophrenia/schizoaffective disorder.

- **Evidence:** Kane et al. (1988): 30% response to clozapine vs. 4% chlorpromazine in TRS. InterSePT trial: clozapine reduced suicidal behavior vs. olanzapine (HR 0.76).

- **Key paper:** Kane et al., Arch Gen Psychiatry 1988.

- **Pearl:** Clozapine is the **only** antipsychotic with demonstrated superiority in TRS and the **only** one FDA-approved for reducing suicidality — yet it remains vastly underutilized.

**7. What monitoring does clozapine require?**

- **Answer:** Recommended ANC monitoring for agranulocytosis per the prescribing information: weekly for 6 months, biweekly for months 6–12, then monthly. Target trough plasma level ≥350 ng/mL. *(The FDA discontinued the clozapine REMS in 2025; ANC monitoring remains guideline/PI-recommended, not REMS-enforced.)*

- **Evidence:** Agranulocytosis occurs in ~1% of patients; 85–90% of cases occur in the first year.

- **Key paper:** Marder & Cannon, NEJM 2019.

- **Pearl:** The starting dose is 12.5 mg — titrate slowly. Other serious risks include seizures (~4%), myocarditis (~1%), and severe metabolic effects.

**8. What is neuroleptic malignant syndrome (NMS)?**

- **Answer:** A life-threatening reaction to dopamine-blocking agents characterized by **fever, lead-pipe rigidity, altered mental status, and autonomic instability**. CK is typically markedly elevated (often >10,000 U/L).

- **Evidence:** Incidence 0.01–0.2%; virtually all cases occur within 30 days of starting or dose-changing the offending agent.

- **Key paper:** Wijdicks & Ropper, NEJM 2024.

- **Pearl:** NMS is increasingly viewed as a form of **malignant catatonia** precipitated by dopamine blockade — this explains why ECT can be effective in refractory cases.

**9. How do you distinguish NMS from serotonin syndrome?**

- **Answer:** NMS features **lead-pipe rigidity and bradykinesia**; serotonin syndrome features **clonus, hyperreflexia, and tremor**. NMS develops over days; serotonin syndrome typically within 24 hours. NMS involves dopamine blockade; serotonin syndrome involves serotonergic excess.

- **Evidence:** Hunter Criteria for serotonin syndrome emphasize clonus as the key distinguishing feature.

- **Key paper:** Boyer & Shannon, NEJM 2005.

- **Pearl:** **Clonus = serotonin syndrome; rigidity = NMS.** This single distinction is the highest-yield differentiator.

**10. What is tardive dyskinesia and how is it treated?**

- **Answer:** Involuntary orofacial and extremity movements after months-to-years of dopamine receptor-blocking agent exposure. First-line treatment: VMAT2 inhibitors (valbenazine, deutetrabenazine).

- **Evidence:** Annualized incidence ~3.9% with SGAs vs. ~5.5% with FGAs. Valbenazine 80 mg showed AIMS improvement of −2.9 vs. +0.3 placebo.

- **Key paper:** Correll & Citrome, J Clin Psychiatry 2021.

- **Pearl:** Anticholinergics (benztropine) treat **acute EPS** but **worsen tardive dyskinesia** — a critical distinction.

**11. What is the first-line approach to first-episode psychosis?**

- **Answer:** An SGA (not clozapine) at low doses, combined with coordinated specialty care (medication management, family education, individual therapy, supported employment/education).

- **Evidence:** The RAISE-ETP trial showed CSC improved quality of life, symptoms, and functioning vs. usual care, especially with shorter duration of untreated psychosis.

- **Key paper:** Kane et al., Am J Psychiatry 2016 (RAISE-ETP).

- **Pearl:** Response in FEP is typically visible within **2 weeks** — if no improvement by then, reassess adherence and consider switching rather than waiting months.

**12. How does schizoaffective disorder differ from schizophrenia and bipolar disorder with psychotic features?**

- **Answer:** Schizoaffective disorder requires psychotic symptoms (delusions/hallucinations) for ≥2 weeks **without** a concurrent mood episode (separating it from mood disorders), AND mood episodes present for the **majority** of total illness duration (separating it from schizophrenia).

- **Evidence:** DSM-5 shifted to a longitudinal lifetime assessment; diagnostic instability is common (mean ~9.5 years to diagnosis).

- **Key paper:** Malaspina et al., Schizophr Res 2013.

- **Pearl:** The key question is: "Has this patient ever had psychosis **without** a mood episode?" If yes → schizoaffective. If psychosis only occurs during mood episodes → mood disorder with psychotic features.

**13. What metabolic monitoring is required for patients on antipsychotics?**

- **Answer:** Baseline and ongoing monitoring of weight/BMI (monthly for 3 months, then quarterly), fasting glucose and lipids (baseline, 12 weeks, then annually), and blood pressure.

- **Evidence:** Olanzapine and clozapine carry the highest metabolic risk; ziprasidone and lurasidone the lowest. Despite guidelines, baseline glucose testing occurs in only ~44% of patients.

- **Key paper:** Morrato et al., Arch Gen Psychiatry 2010.

- **Pearl:** If a patient gains >7% body weight on an antipsychotic, consider switching to a lower-risk agent (aripiprazole, ziprasidone, lurasidone) before adding metformin.

**14. Which antipsychotics carry the highest risk of QTc prolongation?**

- **Answer:** Thioridazine and pimozide (FGAs); ziprasidone (SGA) among atypicals. Aripiprazole and lurasidone carry the lowest risk.

- **Evidence:** QTc ≥500 ms or increase >60 ms from baseline is considered high-risk for torsades de pointes.

- **Key paper:** Tisdale JE et al., "Drug-Induced Arrhythmias: A Scientific Statement From the American Heart Association," *Circulation* 2020;142(15):e214–e233.

- **Pearl:** Always check electrolytes (K⁺, Mg²⁺) before starting QT-prolonging agents — hypokalemia and hypomagnesemia dramatically increase arrhythmia risk.

**15. What is the dopamine hypothesis of schizophrenia?**

- **Answer:** Mesolimbic dopamine hyperactivity drives positive symptoms; mesocortical dopamine hypoactivity contributes to negative and cognitive symptoms.

- **Evidence:** PET studies show elevated presynaptic dopamine synthesis capacity in the striatum of patients with schizophrenia.

- **Key paper:** McCutcheon et al., JAMA Psychiatry 2020.

- **Pearl:** This "two-pathway" model explains why D2 blockade improves positive symptoms but can worsen negative symptoms and cognition — and why clozapine (with its low D2 affinity and muscarinic activity) may work differently.

## MOOD DISORDERS (Questions 16–35)

**16. What are the DSM-5 criteria for a major depressive episode?**

- **Answer:** ≥5 of 9 symptoms during the same 2-week period, with at least one being depressed mood or anhedonia. Mnemonic: **SIG E CAPS** — Sleep, Interest (anhedonia), Guilt, Energy, Concentration, Appetite, Psychomotor changes, Suicidality.

- **Evidence:** MDD has a lifetime prevalence of ~20%; it is the leading cause of disability worldwide.

- **Key paper:** Park & Zarate, NEJM 2019.

- **Pearl:** Always ask about **anhedonia** — patients may deny "feeling depressed" but endorse loss of interest/pleasure, which is equally sufficient for diagnosis.

**17. What did the STARD trial teach us about depression treatment?**

- **Answer:** No antidepressant was clearly superior to another at any step. Remission rates declined with each successive step (~37% step 1, declining to ~13% by steps 3–4). A 2023 reanalysis found cumulative remission was ~35%, roughly half the originally reported 67%.

- **Evidence:** Relapse rates were higher for patients requiring more steps and for those who responded but did not remit.

- **Key paper:** Rush et al., Am J Psychiatry 2006 (STARD).

- **Pearl:** STARD's most actionable lesson: **aim for remission, not just response** — patients who only respond (vs. remit) have nearly double the relapse rate.

**18. What is the mechanism of SSRIs?**

- **Answer:** Selective inhibition of the serotonin transporter (SERT) at the presynaptic neuron, increasing serotonin availability in the synaptic cleft. Clinical effect takes 4–6 weeks.

- **Evidence:** All SSRIs have similar efficacy; selection is based on side-effect profile, drug interactions, and cost.

- **Key paper:** Boyer & Shannon, NEJM 2005.

- **Pearl:** Fluoxetine has the longest half-life (parent + norfluoxetine = weeks), making it the least likely to cause discontinuation syndrome — and the most problematic for drug interactions after stopping.

**19. What is serotonin syndrome and how is it diagnosed?**

- **Answer:** Excess serotonergic activity causing the triad of neuromuscular excitation (clonus, hyperreflexia), autonomic dysfunction (hyperthermia, tachycardia, diaphoresis), and altered mental status. Diagnosed using the Hunter Criteria.

- **Evidence:** Most dangerous combination: MAOI + SSRI/SNRI. Most cases resolve within 24 hours of drug discontinuation.

- **Key paper:** Boyer & Shannon, NEJM 2005.

- **Pearl:** **Clonus is the hallmark** — spontaneous clonus in a patient on a serotonergic agent is serotonin syndrome until proven otherwise. Treat with benzodiazepines; cyproheptadine (5-HT2A antagonist) for moderate-severe cases.

**20. What are the dietary restrictions with MAOIs and why?**

- **Answer:** Avoid tyramine-rich foods (aged cheeses, cured meats, soy sauce, tap beer) because MAO normally metabolizes tyramine in the gut. With MAO inhibited, tyramine enters the systemic circulation → norepinephrine release → hypertensive crisis.

- **Evidence:** Modern food production has reduced tyramine content; the diet is less restrictive than historically taught.

- **Key paper:** Gardner et al., J Clin Psychiatry 1996 — the "user-friendly MAOI diet."

- **Pearl:** The most dangerous **drug** interaction with MAOIs is meperidine (can cause coma/death) — always check before ordering pain medications.

**21. What washout period is required between SSRIs and MAOIs?**

- **Answer:** At least 2 weeks after stopping most SSRIs before starting an MAOI; at least **5 weeks** after stopping fluoxetine (due to norfluoxetine's 7–15 day half-life).

- **Evidence:** The SSRI→MAOI transition is the most dangerous direction; MAOI→SSRI also requires a 2-week washout.

- **Key paper:** Chamberlain & Baldwin, CNS Drugs 2021.

- **Pearl:** The "5-week fluoxetine rule" is one of the most commonly tested pharmacology facts on shelf exams.

**22. What are the DSM-5 criteria for a manic episode?**

- **Answer:** A distinct period of abnormally elevated, expansive, or irritable mood AND increased energy/activity lasting ≥7 days (or any duration if hospitalization required), plus ≥3 of: **DIG FAST** — Distractibility, Impulsivity/Indiscretion, Grandiosity, Flight of ideas, Activity increase, Sleep decreased, Talkativeness.

- **Evidence:** Bipolar I requires at least one manic episode; bipolar II requires hypomania (≥4 days, no hospitalization/psychosis) + major depressive episode.

- **Key paper:** Carvalho et al., NEJM 2020.

- **Pearl:** The key distinction between mania and hypomania is **functional impairment and psychotic features** — hypomania by definition does not cause marked impairment or require hospitalization.

**23. What is the first-line maintenance treatment for bipolar disorder?**

- **Answer:** Lithium remains first-line in most guidelines; quetiapine has near-equal efficacy. Lamotrigine is effective for preventing depressive episodes but not mania. Valproate is effective but inferior to lithium monotherapy.

- **Evidence:** The BALANCE trial showed lithium monotherapy and lithium + valproate were both superior to valproate monotherapy for relapse prevention.

- **Key paper:** BALANCE investigators, Lancet 2010.

- **Pearl:** Match the mood stabilizer to the **polarity** — lithium and quetiapine prevent both poles; lamotrigine prevents depression; valproate and carbamazepine are better for mania.

**24. What are the therapeutic levels and key toxicities of lithium?**

- **Answer:** Acute mania: 0.8–1.2 mEq/L; maintenance: 0.6–0.8 mEq/L. Toxic at ≥1.5 mEq/L. Key toxicities: fine tremor, polyuria/polydipsia (nephrogenic DI), hypothyroidism, hyperparathyroidism, renal impairment.

- **Evidence:** Hypothyroidism occurs in ~14% of lithium-treated patients (OR 5.78 vs. placebo).

- **Key paper:** Nierenberg et al., JAMA 2023.

- **Pearl:** The three organs to monitor on lithium: **thyroid** (TSH), **kidneys** (creatinine), and **parathyroid** (calcium). Levels are drawn 12 hours post-dose.

**25. What drugs increase lithium levels?**

- **Answer:** NSAIDs, ACE inhibitors, ARBs, and thiazide diuretics all increase lithium levels by reducing renal clearance. Dehydration and low-salt diets also increase levels.

- **Evidence:** Any condition causing volume depletion (vomiting, diarrhea, febrile illness) can precipitate toxicity.

- **Key paper:** FDA lithium label.

- **Pearl:** If a patient on lithium needs an analgesic, use **acetaminophen** — not ibuprofen. If they need a diuretic, **loop diuretics** are safer than thiazides (though still require monitoring).

**26. What is the teratogenic risk of mood stabilizers?**

- **Answer:** Valproate is the most teratogenic (~9–10% MCM rate; neural tube defects, dose-dependent IQ reduction of 7–10 points). Carbamazepine ~3–6%. Lamotrigine ~2–3% (comparable to general population). Lithium carries a ~1:1,000 risk of Ebstein's anomaly.

- **Evidence:** The VA/DoD recommends against valproate, carbamazepine, and topiramate in individuals of childbearing potential.

- **Key paper:** Hernandez-Diaz et al., Neurology 2025.

- **Pearl:** **Lamotrigine is the safest mood stabilizer in pregnancy** — but requires slow titration due to Stevens-Johnson syndrome risk, and levels drop significantly during pregnancy due to increased glucuronidation.

**27. What are the indications for ECT?**

- **Answer:** Severe/treatment-resistant depression, catatonia, psychotic depression, severe suicidality requiring rapid response, and history of good ECT response. Response rates 60–80%, remission 50–60%.

- **Evidence:** ECT is the most effective treatment for severe depression; effect size 0.91 vs. sham.

- **Key paper:** Espinoza & Kellner, NEJM 2022.

- **Pearl:** The main limitation of ECT is **relapse** — >50% relapse if treatment is stopped after remission. Continuation ECT or pharmacotherapy (antidepressant + lithium) is essential.

**28. What is treatment-resistant depression and how is it managed?**

- **Answer:** MDD unresponsive to ≥2 adequate antidepressant trials. Options include augmentation (lithium, T3, atypical antipsychotics), switching, ECT, and esketamine (intranasal, FDA-approved for TRD).

- **Evidence:** Esketamine + SSRI/SNRI showed higher remission than quetiapine XR + SSRI/SNRI at 8 weeks (27.1% vs. 17.6%) in the ESCAPE-TRD trial.

- **Key paper:** Anand et al., NEJM 2023 — ketamine vs. ECT for nonpsychotic TRD.

- **Pearl:** Esketamine requires a REMS program with 2-hour post-dose monitoring due to dissociation and sedation risk — it cannot be prescribed for home use.

**29. Does lithium reduce suicide risk?**

- **Answer:** Meta-analyses suggest lithium reduces suicides (OR 0.13–0.26 vs. placebo) and all-cause mortality, but the largest dedicated RCT (Katz et al., 2022) was stopped for futility — possibly due to subtherapeutic levels.

- **Evidence:** Observational data consistently support an anti-suicide effect; RCT data are mixed.

- **Key paper:** Cipriani et al., BMJ 2013.

- **Pearl:** The anti-suicide effect may be independent of mood stabilization — lithium may reduce impulsivity and aggression through serotonergic mechanisms.

**30. What are the key risk factors for suicide?**

- **Answer:** Psychiatric illness (mood disorders, schizophrenia, substance use), prior attempts (strongest predictor), male sex, older age, access to lethal means, recent discharge from psychiatric hospitalization, hopelessness, social isolation.

- **Evidence:** Mood disorders are present in one-third to one-half of completed suicides. Suicidal prevalence is greater in bipolar disorder than MDD.

- **Key paper:** Fazel & Runeson, NEJM 2020.

- **Pearl:** The highest-risk period is the **first week after psychiatric discharge** — always ensure close follow-up and means restriction counseling.

**31. How do you screen for suicidality?**

- **Answer:** PHQ-9 Item 9 for universal screening; Columbia-Suicide Severity Rating Scale (C-SSRS) for structured assessment. No tool reliably predicts completed suicide.

- **Evidence:** C-SSRS positive response to any suicidal thinking in the past month has a positive LR >10 in the general population.

- **Key paper:** USPSTF, JAMA 2023 — screening for depression and suicide risk.

- **Pearl:** Ask directly: "Are you thinking about killing yourself?" Direct questioning does **not** increase suicidal ideation — this is a persistent myth.

**32. What is the SSRI discontinuation syndrome?**

- **Answer:** Symptoms (dizziness, nausea, "electric shock" sensations, insomnia, anxiety) occurring 2–4 days after abrupt cessation of an SSRI taken ≥1 month. Mnemonic: **FINISH**.

- **Evidence:** Highest risk with paroxetine and venlafaxine (short half-lives); lowest with fluoxetine. Resolves quickly if the medication is restarted.

- **Key paper:** Kalfas et al., JAMA Psychiatry 2025.

- **Pearl:** Distinguish from relapse: discontinuation symptoms have **rapid onset** (days) and include physical symptoms (electric shocks, dizziness) not typical of depression; relapse takes weeks.

**33. What is the difference between bipolar I and bipolar II?**

- **Answer:** Bipolar I requires ≥1 manic episode (≥7 days or any duration if hospitalized). Bipolar II requires ≥1 hypomanic episode (≥4 days, no marked impairment) AND ≥1 major depressive episode. Bipolar II is **not** a milder form — it carries equal or greater depression burden and suicide risk.

- **Evidence:** Bipolar II patients spend more time depressed than manic; depression is the predominant source of morbidity.

- **Key paper:** McIntyre et al., Lancet 2020.

- **Pearl:** Antidepressant monotherapy is **contraindicated** in bipolar I (risk of mania switch) and controversial in bipolar II — always pair with a mood stabilizer.

**34. What is the role of lamotrigine in bipolar disorder?**

- **Answer:** Effective for preventing depressive episodes but NOT mania. Requires slow titration (starting 25 mg/day, increasing every 2 weeks) to minimize risk of Stevens-Johnson syndrome (SJS).

- **Evidence:** NNT = 8 vs. placebo for preventing depressive episodes at 1 year.

- **Key paper:** Salisbury-Afshar, Am Fam Physician 2022.

- **Pearl:** If a patient develops **any rash** during lamotrigine titration, stop the drug immediately and evaluate for SJS — do not rechallenge without dermatology consultation.

**35. What is a mixed episode/mixed features specifier?**

- **Answer:** DSM-5 replaced the DSM-IV "mixed episode" with a **"with mixed features" specifier** that can be applied to manic, hypomanic, or depressive episodes. A manic episode with mixed features includes ≥3 depressive symptoms; a depressive episode with mixed features includes ≥3 manic symptoms.

- **Evidence:** Mixed features are associated with higher suicide risk, poorer treatment response, and more rapid cycling.

- **Key paper:** Carvalho et al., NEJM 2020.

- **Pearl:** Mixed states are a **psychiatric emergency** — these patients are simultaneously agitated, dysphoric, and impulsive, creating the highest-risk combination for suicide.

## ANXIETY DISORDERS & OCD (Questions 36–45)

**36. What is the first-line treatment for generalized anxiety disorder?**

- **Answer:** SSRIs or SNRIs are first-line. Benzodiazepines provide rapid relief but carry dependence risk and should not be used as monotherapy.

- **Evidence:** A network meta-analysis found duloxetine, pregabalin, venlafaxine, and escitalopram most efficacious with best acceptability.

- **Key paper:** Slee et al., Lancet 2019.

- **Pearl:** SSRI response takes 4–6 weeks; treatment should continue ≥12 months — up to 50% relapse if discontinued before 1 year.

**37. How do SSRIs compare to benzodiazepines for anxiety?**

- **Answer:** Benzodiazepines have faster onset (within 1 week) and slightly larger acute effect sizes, but by week 8, response rates are equivalent. SSRIs are preferred due to no dependence risk.

- **Evidence:** Benzodiazepines reduce panic attacks with NNT = 4, but carry risks of dependence, withdrawal, and fatal interactions with alcohol/opioids.

- **Key paper:** Szuhany & Simon, JAMA 2022.

- **Pearl:** If using a benzodiazepine as a bridge, use a **fixed-dose schedule** (not PRN) for the first 2–4 weeks while the SSRI takes effect, then taper.

**38. What is the first-line treatment for panic disorder?**

- **Answer:** SSRIs (sertraline, paroxetine, fluoxetine) are first-line; CBT is equally effective and preferred when available. Start SSRIs at half the usual dose to avoid initial activation/worsening.

- **Evidence:** CBT for panic disorder has response rates of 70–90% in treatment completers.

- **Key paper:** Penninx et al., Lancet 2021.

- **Pearl:** Patients with panic disorder are exquisitely sensitive to somatic side effects — start low, go slow, and warn them that initial jitteriness is temporary and not dangerous.

**39. What is the first-line treatment for PTSD?**

- **Answer:** Trauma-focused psychotherapy (prolonged exposure, cognitive processing therapy, EMDR) is first-line with larger effect sizes than pharmacotherapy. Sertraline and paroxetine are the only FDA-approved medications.

- **Evidence:** Cochrane review: SSRIs improved PTSD symptoms vs. placebo (RR 0.66).

- **Key paper:** Schnurr et al., Ann Intern Med 2024 — VA/DoD PTSD guideline synopsis.

- **Pearl:** **Benzodiazepines are not recommended for PTSD** — they may worsen outcomes and interfere with extinction learning during exposure therapy.

**40. What medication is used for PTSD-related nightmares?**

- **Answer:** Prazosin (alpha-1 adrenergic antagonist) is suggested for trauma-related nightmares.

- **Evidence:** Evidence rating B per VA/DoD guidelines; titrate from 1 mg at bedtime.

- **Key paper:** Sartor et al., Am Fam Physician 2023.

- **Pearl:** Monitor for orthostatic hypotension, especially with the first dose — advise patients to sit on the edge of the bed before standing at night.

**41. How does OCD treatment differ from depression treatment with SSRIs?**

- **Answer:** OCD requires **higher SSRI doses** and **longer trials** (8–12 weeks vs. 4–6 weeks for depression). Treatment should continue ≥1–2 years.

- **Evidence:** NNT = 5 for SSRIs vs. placebo in OCD; full remission with pharmacotherapy alone is low (~11%).

- **Key paper:** Grant, NEJM 2014.

- **Pearl:** If a patient with OCD hasn't responded to an SSRI at 8 weeks, **increase the dose** before switching — many patients respond only at maximum doses.

**42. What is the most effective psychotherapy for OCD?**

- **Answer:** Exposure and response prevention (ERP) — response rates up to 70% in treatment completers. Combination ERP + SSRI is recommended for patients with comorbid depression or insufficient monotherapy response.

- **Evidence:** The POTS trial showed combined CBT + sertraline was superior to either monotherapy in pediatric OCD.

- **Key paper:** POTS Team, JAMA 2004.

- **Pearl:** ERP works by **habituation** — the patient confronts feared stimuli while resisting compulsions until anxiety naturally decreases. Avoidance reinforces OCD.

**43. What augmentation strategies exist for SSRI-refractory OCD?**

- **Answer:** Adding ERP is superior to adding risperidone or stress management for SSRI partial responders. Low-dose antipsychotic augmentation (particularly aripiprazole or risperidone) has evidence, especially in patients with comorbid tics.

- **Evidence:** Foa et al., JAMA Psychiatry 2022 showed ERP augmentation was superior to risperidone augmentation.

- **Key paper:** Foa et al., JAMA Psychiatry 2022.

- **Pearl:** Clomipramine (a TCA with potent serotonin reuptake inhibition) is an alternative to SSRIs but has a worse side-effect profile — reserve for SSRI failures.

**44. What distinguishes OCD from obsessive-compulsive personality disorder (OCPD)?**

- **Answer:** OCD involves intrusive, unwanted thoughts (ego-dystonic) that cause distress, with compulsions performed to reduce anxiety. OCPD involves a pervasive pattern of perfectionism, orderliness, and control that the patient views as reasonable (ego-syntonic).

- **Evidence:** OCD and OCPD can co-occur but are distinct entities with different treatments.

- **Key paper:** Grant, NEJM 2014.

- **Pearl:** The patient with OCD says "I know this is irrational but I can't stop." The patient with OCPD says "I don't understand why everyone else isn't this organized."

**45. What is social anxiety disorder and how is it treated?**

- **Answer:** Persistent fear of social situations due to fear of scrutiny/negative evaluation, lasting ≥6 months. First-line: SSRIs/SNRIs and/or CBT. Beta-blockers (propranolol) are used for performance-only subtype.

- **Evidence:** Social anxiety disorder is the most common anxiety disorder with onset typically in adolescence.

- **Key paper:** Penninx et al., Lancet 2021.

- **Pearl:** Beta-blockers address **peripheral** symptoms (tremor, tachycardia, sweating) but do not treat the cognitive component — they are appropriate only for discrete performance situations, not generalized social anxiety.

## SUBSTANCE USE DISORDERS (Questions 46–60)

**46. What is the CIWA-Ar and how is it used?**

- **Answer:** A 10-item clinician-administered scale (score 0–67) for assessing alcohol withdrawal severity. Scores <8–10: mild; 8–18: moderate (benzodiazepines indicated); ≥19: severe (close monitoring, inpatient care).

- **Evidence:** Symptom-triggered dosing based on CIWA-Ar reduces total benzodiazepine dose and treatment duration (mean 9 vs. 68 hours in one RCT).

- **Key paper:** Schuckit, NEJM 2014.

- **Pearl:** Symptom-triggered therapy is superior to fixed-dose scheduling — but requires reliable nursing assessment. Use fixed-dose protocols in ICU patients who cannot be reliably assessed.

**47. What is the first-line treatment for alcohol withdrawal?**

- **Answer:** Benzodiazepines — they reduce seizure risk by 84% vs. placebo (RR 0.16). Long-acting agents (diazepam, chlordiazepoxide) are preferred; lorazepam/oxazepam in liver disease.

- **Evidence:** Withdrawal delirium (delirium tremens) has mortality up to 4% in hospitalized patients.

- **Key paper:** Haber, NEJM 2025.

- **Pearl:** Always give **thiamine before glucose** in suspected alcohol use disorder — glucose metabolism consumes thiamine and can precipitate Wernicke's encephalopathy.

**48. What is delirium tremens and when does it occur?**

- **Answer:** Severe alcohol withdrawal with confusion, agitation, hallucinations, autonomic instability, and seizures. Typically occurs 48–96 hours after last drink, peaking at 72 hours.

- **Evidence:** Risk factors: prior DT, concurrent illness, older age, heavy prolonged use, elevated CIWA score at presentation.

- **Key paper:** Schuckit, NEJM 2014.

- **Pearl:** The timeline of alcohol withdrawal: tremor/anxiety (6–24h) → seizures (12–48h) → hallucinations (12–48h) → delirium tremens (48–96h). Seizures can occur **before** DT.

**49. What are the FDA-approved medications for alcohol use disorder?**

- **Answer:** Naltrexone (oral 50 mg/day or IM 380 mg/month), acamprosate (666 mg TID), and disulfiram (250 mg/day). Naltrexone and acamprosate are first-line.

- **Evidence:** Naltrexone NNT = 11 for preventing return to heavy drinking; acamprosate NNT = 11 for preventing any drinking.

- **Key paper:** McPheeters et al., JAMA 2023.

- **Pearl:** Naltrexone is a μ-opioid antagonist — it is **contraindicated** in patients currently using opioids (precipitates withdrawal) and in acute hepatitis. Acamprosate is safe in liver disease but contraindicated in severe renal impairment.

**50. What is the COWS scale?**

- **Answer:** The Clinical Opiate Withdrawal Scale — an 11-item clinician-administered tool (score 0–47) assessing opioid withdrawal severity. Scores 5–12: mild; 13–24: moderate; >24: severe.

- **Evidence:** Validated against CINA scale (Pearson r = 0.85). For buprenorphine induction, COWS should ideally be ≥10–12.

- **Key paper:** Wesson & Ling, J Psychoactive Drugs 2003.

- **Pearl:** COWS assesses **objective** signs (pupil size, pulse, gooseflesh, yawning) — it is more reliable than patient self-report for timing buprenorphine induction.

**51. What are the first-line treatments for opioid use disorder?**

- **Answer:** Buprenorphine and methadone are both first-line. Methadone has superior retention but higher overdose risk during induction. Buprenorphine has a more favorable safety profile and can be prescribed in office-based settings.

- **Evidence:** 24-month discontinuation: 88.8% buprenorphine vs. 81.5% methadone. Both reduce all-cause mortality vs. no treatment.

- **Key paper:** Nosyk et al., JAMA 2024.

- **Pearl:** Buprenorphine is a **partial agonist** — it can precipitate withdrawal if given while full agonists are still present. Wait for adequate withdrawal (COWS ≥10–12) before initiating.

**52. How does naloxone work and when is it used?**

- **Answer:** Naloxone is a competitive μ-opioid receptor antagonist that rapidly reverses opioid overdose. Given IV, IM, or intranasal. Duration of action is 30–90 minutes — shorter than most opioids, so re-dosing may be needed.

- **Evidence:** Naloxone is available over-the-counter (Narcan nasal spray) since 2023.

- **Key paper:** Harris et al., JAMA 2026.

- **Pearl:** After naloxone administration, observe for **at least 2 hours** — the opioid may outlast naloxone, causing recurrent respiratory depression.

**53. What is the mechanism of disulfiram?**

- **Answer:** Inhibits aldehyde dehydrogenase, causing accumulation of acetaldehyde when alcohol is consumed → flushing, nausea, vomiting, headache, hypotension (disulfiram-ethanol reaction).

- **Evidence:** Effective only in supervised/open-label settings (effect size 0.82 supervised vs. 0.26 unsupervised).

- **Key paper:** Kranzler & Soyka, JAMA 2018.

- **Pearl:** Disulfiram works through **aversion**, not craving reduction — it requires motivation and supervised administration to be effective.

**54. What are the signs of opioid intoxication vs. withdrawal?**

- **Answer:** Intoxication: miosis, respiratory depression, sedation, constipation, euphoria. Withdrawal: mydriasis, lacrimation, rhinorrhea, piloerection, diarrhea, yawning, muscle aches, anxiety.

- **Evidence:** Opioid withdrawal is intensely uncomfortable but rarely life-threatening (unlike alcohol/benzodiazepine withdrawal).

- **Key paper:** Harris et al., JAMA 2026.

- **Pearl:** The mnemonic for opioid withdrawal is essentially "the opposite of intoxication" — everything that was suppressed becomes hyperactive.

**55. What are the medical complications of chronic alcohol use?**

- **Answer:** Hepatic (steatosis → hepatitis → cirrhosis), neurologic (Wernicke-Korsakoff syndrome, peripheral neuropathy, cerebellar degeneration), GI (pancreatitis, esophageal varices), hematologic (macrocytic anemia, thrombocytopenia), cardiovascular (cardiomyopathy), and psychiatric (depression, anxiety, psychosis).

- **Evidence:** Alcohol use disorder affects ~29 million Americans; only ~7% receive treatment.

- **Key paper:** Haber, NEJM 2025.

- **Pearl:** **Wernicke's triad** (confusion, ataxia, ophthalmoplegia) is a medical emergency — all three features are present in only ~10% of cases. Treat empirically with high-dose IV thiamine if suspected.

**56. What is Wernicke-Korsakoff syndrome?**

- **Answer:** Wernicke's encephalopathy (acute: confusion, ataxia, ophthalmoplegia from thiamine deficiency) can progress to Korsakoff's syndrome (chronic: anterograde amnesia, confabulation) if untreated.

- **Evidence:** Treat with high-dose parenteral thiamine (500 mg IV TID for 3 days per some protocols); oral thiamine is inadequately absorbed in alcoholism.

- **Key paper:** Haber, NEJM 2025.

- **Pearl:** **Confabulation** (fabricating memories to fill gaps) is the hallmark of Korsakoff's — the patient is not lying; they genuinely believe their fabricated memories.

**57. What substances cause life-threatening withdrawal?**

- **Answer:** Alcohol, benzodiazepines, and barbiturates — all GABAergic agents. Withdrawal can cause seizures and death. Opioid withdrawal is miserable but rarely fatal.

- **Evidence:** Benzodiazepine withdrawal can be protracted (weeks to months) and should be tapered gradually.

- **Key paper:** Schuckit, NEJM 2014.

- **Pearl:** The board-answer mnemonic: "**ABC** withdrawal can kill" — **A**lcohol, **B**enzodiazepines, **B**arbiturates (and **C**an kill).

**58. What is motivational interviewing?**

- **Answer:** A directive, client-centered counseling style that explores and resolves ambivalence about behavior change. Four processes: engaging, focusing, evoking, planning.

- **Evidence:** Meta-analysis: OR 1.55 favoring MI over comparison conditions in medical settings. Effective for substance use reduction (SMD 0.48 vs. no intervention).

- **Key paper:** Schwenker et al., Cochrane 2023.

- **Pearl:** The key MI skill is **rolling with resistance** — arguing with a patient about their substance use increases resistance; reflecting their ambivalence back to them promotes change.

**59. What are the stages of change?**

- **Answer:** Prochaska & DiClemente's Transtheoretical Model: Precontemplation → Contemplation → Preparation → Action → Maintenance (± Relapse). Treatment should be matched to the patient's stage.

- **Evidence:** MI is most effective in the contemplation and preparation stages.

- **Key paper:** Bischof et al., Dtsch Arztebl Int 2021.

- **Pearl:** A patient in **precontemplation** doesn't see a problem — pushing for action will backfire. Focus on building rapport and raising awareness.

**60. What is the CAGE questionnaire?**

- **Answer:** A 4-item screening tool for alcohol use disorder: **C**ut down, **A**nnoyed by criticism, **G**uilty about drinking, **E**ye-opener. ≥2 positive answers suggests problematic use.

- **Evidence:** AUDIT (10 items) and AUDIT-C (3 items) are now preferred for screening due to better sensitivity for hazardous drinking.

- **Key paper:** Haber, NEJM 2025.

- **Pearl:** CAGE identifies dependence but misses hazardous drinking — AUDIT-C is better for universal screening in primary care.

## DELIRIUM, DEMENTIA & CAPACITY (Questions 61–68)

**61. How do you distinguish delirium from dementia?**

- **Answer:** Delirium: acute onset, fluctuating course, impaired attention (hallmark), altered consciousness, usually reversible. Dementia: insidious onset, progressive, attention preserved until late stages, generally irreversible.

- **Evidence:** Clinicians fail to recognize >50% of delirium cases; hypoactive delirium is most commonly missed.

- **Key paper:** Marcantonio, NEJM 2017.

- **Pearl:** **If uncertain, treat as delirium until proven otherwise** — delirium is reversible and potentially life-threatening; dementia is not an emergency.

**62. What is the CAM and how is it used?**

- **Answer:** The Confusion Assessment Method requires: (1) acute onset + fluctuating course, AND (2) inattention, PLUS either (3) disorganized thinking OR (4) altered level of consciousness.

- **Evidence:** CAM sensitivity 94–100%, specificity 90–95% when administered by trained assessors.

- **Key paper:** Oh et al., JAMA 2017.

- **Pearl:** Test attention at the bedside by asking the patient to recite the **months of the year backward** or spell "WORLD" backward — inability to do so is the cardinal feature of delirium.

**63. What are the most common causes of delirium?**

- **Answer:** Medications (anticholinergics, benzodiazepines, opioids), infections (UTI, pneumonia), metabolic derangements (electrolytes, renal/hepatic failure), substance withdrawal, pain, urinary retention, constipation, and sleep deprivation.

- **Evidence:** Dementia is the strongest predisposing factor for delirium — the two commonly coexist.

- **Key paper:** Fong et al., Lancet Neurol 2015.

- **Pearl:** The mnemonic **DELIRIUM**: Drugs, Electrolytes, Lack of drugs (withdrawal), Infection, Reduced sensory input, Intracranial pathology, Urinary/fecal retention, Myocardial/pulmonary causes.

**64. What are the subtypes of delirium?**

- **Answer:** Hyperactive (agitation, hallucinations, restlessness), hypoactive (lethargy, reduced responsiveness, withdrawal), and mixed. Hypoactive is most common in older adults and carries the worst prognosis.

- **Evidence:** Hypoactive delirium is often misdiagnosed as depression or dementia.

- **Key paper:** Oh et al., JAMA 2017.

- **Pearl:** The "quiet" delirious patient is the most dangerous — hypoactive delirium is associated with higher mortality precisely because it goes unrecognized.

**65. What are the four components of decision-making capacity?**

- **Answer:** (1) **Understanding** — comprehend relevant information; (2) **Appreciation** — recognize how it applies to their situation; (3) **Reasoning** — rationally compare options; (4) **Expressing a choice** — communicate a consistent decision.

- **Evidence:** Incapacity is common among medical inpatients (~26%) but recognized in only ~42% of cases.

- **Key paper:** Sessums et al., JAMA 2011.

- **Pearl:** Capacity is **decision-specific and temporal** — a patient may lack capacity for one decision but retain it for another. Any physician can assess capacity; psychiatry consultation is not required.

**66. What is the difference between capacity and competency?**

- **Answer:** **Capacity** is a clinical determination made by any physician at the bedside. **Competency** is a legal determination made by a court. A patient can lack capacity but still be legally competent until a court rules otherwise.

- **Evidence:** The Aid to Capacity Evaluation (ACE) is the best validated bedside instrument (LR+ 8.5).

- **Key paper:** Sessums et al., JAMA 2011.

- **Pearl:** A patient who refuses treatment is not automatically incapacitated — the threshold for capacity should be proportional to the **risk of the decision** (sliding scale).

**67. What are the criteria for involuntary psychiatric commitment?**

- **Answer:** Generally requires: (1) severe mental disorder, (2) danger to self or others OR inability to meet basic needs/grave disability, and (3) less restrictive alternatives are insufficient. Criteria vary by jurisdiction.

- **Evidence:** 47 of 51 U.S. jurisdictions allow commitment based on criteria beyond dangerousness (grave disability, inability to meet basic needs).

- **Key paper:** Barnard et al., Psychiatr Serv 2025.

- **Pearl:** Involuntary commitment is a **legal process** requiring judicial review — an emergency hold (typically 72 hours) is the initial step, not a final disposition.

**68. Can a patient with dementia or mental illness have capacity?**

- **Answer:** Yes — capacity is not determined by diagnosis alone. Patients with mild-moderate dementia or stable mental illness may retain capacity for many decisions.

- **Evidence:** MMSE scores <20 increase likelihood of incapacity (LR 6.3), but scores 20–24 are non-discriminatory.

- **Key paper:** Sessums et al., JAMA 2011.

- **Pearl:** Always attempt to **optimize** capacity before declaring incapacity — treat delirium, simplify information, use interpreters, choose the patient's best time of day.

## PERSONALITY DISORDERS & PSYCHOTHERAPY (Questions 69–80)

**69. What are the three personality disorder clusters?**

- **Answer:** Cluster A ("odd/eccentric"): paranoid, schizoid, schizotypal. Cluster B ("dramatic/emotional"): antisocial, borderline, histrionic, narcissistic. Cluster C ("anxious/fearful"): avoidant, dependent, OCPD.

- **Evidence:** Any personality disorder prevalence ~10.5% in the general population.

- **Key paper:** Sharp, NEJM 2022.

- **Pearl:** The cluster mnemonic: "**A** is weird, **B** is wild, **C** is worried."

**70. What are the DSM-5 criteria for borderline personality disorder?**

- **Answer:** ≥5 of 9 criteria: abandonment fears, unstable relationships (idealization/devaluation), identity disturbance, impulsivity, recurrent suicidality/self-harm, affective instability, chronic emptiness, inappropriate anger, transient paranoia/dissociation.

- **Evidence:** Prevalence ~1–3%; ~22% of psychiatric inpatients. Lifetime comorbidity: anxiety 84.5%, mood disorders 82.7%, substance use 78.2%.

- **Key paper:** Leichsenring et al., JAMA 2023.

- **Pearl:** **Splitting** (seeing people as all-good or all-bad) is the hallmark defense mechanism — it often manifests on inpatient units as the patient idealizing one staff member while devaluing another.

**71. What is the first-line treatment for BPD?**

- **Answer:** Psychotherapy — specifically DBT, which has the most evidence. No medications are FDA-approved for BPD. Pharmacotherapy targets specific symptoms (e.g., mood instability, impulsivity) but does not treat core pathology.

- **Evidence:** DBT vs. TAU: BPD severity SMD −0.60; self-harm SMD −0.54.

- **Key paper:** Linehan et al., JAMA Psychiatry 2015.

- **Pearl:** **Benzodiazepines should be avoided in BPD** — they can worsen impulsivity and behavioral dyscontrol, and patients with BPD are at high risk for substance misuse.

**72. What are the four modules of DBT?**

- **Answer:** (1) Distress tolerance, (2) Emotion regulation, (3) Interpersonal effectiveness, (4) Mindfulness. DBT also includes individual therapy, telephone coaching, and therapist consultation team.

- **Evidence:** DBT skills training alone also shows benefit (BPD severity SMD −0.66).

- **Key paper:** Bohus et al., Lancet 2021.

- **Pearl:** DBT uniquely balances **acceptance** (mindfulness, distress tolerance) with **change** (emotion regulation, interpersonal effectiveness) — this dialectic is what makes it effective for patients who feel invalidated by pure change-focused therapies.

**73. What is antisocial personality disorder and how does it relate to conduct disorder?**

- **Answer:** ASPD requires age ≥18 AND evidence of conduct disorder with onset before age 15. Features include disregard for others' rights, deceitfulness, impulsivity, aggressiveness, and lack of remorse.

- **Evidence:** Prevalence 2–4%; more common in males; tends to improve with advancing age.

- **Key paper:** Black, Can J Psychiatry 2015.

- **Pearl:** ASPD is the only personality disorder that **requires a childhood precursor** (conduct disorder) — without it, the diagnosis cannot be made regardless of adult behavior.

**74. What are defense mechanisms and how are they classified?**

- **Answer:** Unconscious strategies to manage anxiety, classified hierarchically: mature (sublimation, humor, altruism), neurotic (repression, displacement, intellectualization), immature (projection, splitting, acting out), pathological (psychotic denial, distortion).

- **Evidence:** Vaillant's 50-year longitudinal study showed mature defenses predicted better psychosocial and health outcomes.

- **Key paper:** Soldz & Vaillant, J Nerv Ment Dis 1998.

- **Pearl:** When a student uses a defense mechanism on rounds (e.g., intellectualizing about a difficult patient), name it gently — it's a powerful teaching moment about how universal these mechanisms are.

**75. What is the difference between CBT and psychodynamic therapy?**

- **Answer:** CBT focuses on identifying and modifying dysfunctional thoughts and behaviors (present-focused, structured, time-limited). Psychodynamic therapy explores unconscious conflicts, past experiences, and the therapeutic relationship (insight-oriented, less structured).

- **Evidence:** Meta-analysis of 23 RCTs demonstrated equivalence of psychodynamic therapy to CBT for target symptoms.

- **Key paper:** Steinert et al., Am J Psychiatry 2017.

- **Pearl:** CBT asks "What are you thinking right now and is it accurate?" Psychodynamic therapy asks "Why do you keep ending up in this pattern?"

**76. What is CBT and what is it effective for?**

- **Answer:** A structured psychotherapy that identifies and modifies dysfunctional cognitions and behaviors. Effective across mental disorders with effect sizes 0.3–1.3, strongest for PTSD, anxiety disorders, OCD, bulimia, and depression.

- **Evidence:** A 2025 unified meta-analysis of 375 RCTs confirmed efficacy across all major psychiatric conditions.

- **Key paper:** Cuijpers et al., JAMA Psychiatry 2025.

- **Pearl:** CBT is the **most versatile psychotherapy** — if you can only remember one therapy for boards, CBT is first-line or co-first-line for nearly every condition.

**77. What is interpersonal therapy (IPT)?**

- **Answer:** A time-limited therapy addressing the connection between mood and interpersonal difficulties. Targets four areas: grief, role disputes, role transitions, and interpersonal deficits.

- **Evidence:** First-line for mild-to-moderate depression alongside CBT.

- **Key paper:** Park & Zarate, NEJM 2019.

- **Pearl:** IPT is particularly useful for depression triggered by a **life event** (loss, divorce, retirement) — it directly addresses the interpersonal context of the mood episode.

**78. What is the difference between somatic symptom disorder, factitious disorder, and malingering?**

- **Answer:** SSD: genuine distress about real symptoms, no deception. Factitious disorder: intentionally falsified symptoms for internal motivation (sick role). Malingering: intentionally falsified symptoms for external gain (money, avoiding duty).

- **Evidence:** SSD no longer requires symptoms to be "medically unexplained" — it can coexist with recognized medical conditions.

- **Key paper:** Bass & Halligan, Lancet 2014.

- **Pearl:** The key question is **motivation**: "Does this patient want to be sick (factitious) or want something from being sick (malingering)?" In SSD, the patient genuinely suffers.

**79. What is conversion disorder (functional neurological symptom disorder)?**

- **Answer:** Symptoms of altered voluntary motor or sensory function with clinical evidence of **incompatibility** with recognized neurological conditions. It is a "rule-in" diagnosis, not a diagnosis of exclusion.

- **Evidence:** Hoover's sign (functional leg weakness normalizes with contralateral hip flexion) and tremor entrainment are key positive diagnostic signs.

- **Key paper:** Espay et al., JAMA Neurol 2018.

- **Pearl:** **La belle indifférence is not diagnostically useful** — it is neither sensitive nor specific for conversion disorder and should not be used to make or exclude the diagnosis.

**80. What is the treatment for somatic symptom disorder?**

- **Answer:** CBT has the best evidence. Regularly scheduled visits (not symptom-driven), validation of suffering, and avoiding unnecessary tests/procedures. SSRIs may help comorbid anxiety/depression.

- **Evidence:** The therapeutic relationship is the most important intervention — patients feel dismissed when told "it's all in your head."

- **Key paper:** Löwe et al., Lancet 2024.

- **Pearl:** The goal is **functional improvement**, not symptom elimination. Schedule regular visits to reduce ER utilization and prevent iatrogenic harm from unnecessary workups.

## NEURODEVELOPMENTAL DISORDERS (Questions 81–87)

**81. What are the DSM-5 criteria for ADHD?**

- **Answer:** ≥6 of 9 symptoms (≥5 for adults ≥17) in inattention and/or hyperactivity-impulsivity domains, persisting ≥6 months, with several symptoms present before age 12, in ≥2 settings, with functional impairment.

- **Evidence:** Three presentations: combined, predominantly inattentive, predominantly hyperactive-impulsive.

- **Key paper:** Volkow & Swanson, NEJM 2013.

- **Pearl:** DSM-5 raised the age-of-onset criterion from 7 to **12** and lowered the adult symptom threshold from 6 to **5** — both changes improved diagnostic sensitivity.

**82. What is the first-line treatment for ADHD?**

- **Answer:** Stimulants (methylphenidate or amphetamine-based) are first-line for ages ≥6 and adults, with effect sizes ~1.0. For preschoolers (4–5), behavioral therapy is first-line.

- **Evidence:** >90% of patients show benefit from stimulants; ~40% respond to only one class (methylphenidate vs. amphetamine), so trial of both may be needed.

- **Key paper:** Cortese, NEJM 2020.

- **Pearl:** If a patient doesn't respond to methylphenidate, **try an amphetamine** (or vice versa) before concluding stimulants have failed — response is idiosyncratic between the two classes.

**83. When are non-stimulant ADHD medications preferred?**

- **Answer:** When there is risk of stimulant misuse/diversion, comorbid substance use disorder, anxiety, tics, or intolerable stimulant side effects. Options: atomoxetine (NRI), guanfacine XR, clonidine XR.

- **Evidence:** Atomoxetine effect size ~0.64 in children, ~0.33 in adults — lower than stimulants but still clinically meaningful.

- **Key paper:** Posner et al., Lancet 2020.

- **Pearl:** Atomoxetine takes **4–6 weeks** for full effect (unlike stimulants, which work immediately) — counsel patients about this delay.

**84. How is ADHD diagnosed in adults?**

- **Answer:** Same DSM-5 criteria but with ≥5 symptoms (vs. 6 for children), symptoms present before age 12, and adult-specific examples (difficulty returning calls, paying bills, keeping appointments). Informant reports are more reliable than self-report.

- **Evidence:** Adult ADHD prevalence ~2.5–2.8%; symptoms persist into adulthood in up to 70% of childhood cases.

- **Key paper:** Olagunju & Ghoddusi, Am Fam Physician 2024.

- **Pearl:** Hyperactivity in adults often manifests as **internal restlessness** rather than overt motor hyperactivity — ask about feeling "driven by a motor" or inability to relax.

**85. What are the DSM-5 criteria for autism spectrum disorder?**

- **Answer:** Persistent deficits in all 3 social communication subdomains (reciprocity, nonverbal communication, relationships) PLUS ≥2 of 4 restricted/repetitive behaviors (stereotypies, insistence on sameness, fixated interests, sensory hyper/hyporeactivity).

- **Evidence:** DSM-5 consolidated Asperger's, PDD-NOS, and under one ASD diagnosis and added sensory features.

- **Key paper:** Hirota & King, JAMA 2023.

- **Pearl:** ASD is now diagnosed on a **spectrum with severity levels** (1–3 based on support needs) rather than as discrete subtypes — "Asperger's" is no longer a separate diagnosis.

**86. What medications are used for ASD?**

- **Answer:** No medications treat core ASD symptoms. Risperidone and aripiprazole are FDA-approved for irritability/aggression in ASD. Stimulants can treat comorbid ADHD but with more side effects than in ADHD alone.

- **Evidence:** Risperidone and aripiprazole for irritability: SMD ~1.1.

- **Key paper:** Hirota & King, JAMA 2023.

- **Pearl:** ASD and ADHD can now be **co-diagnosed** (DSM-5 removed the exclusion) — this is important because ~30–50% of children with ASD also meet criteria for ADHD.

**87. What is the difference between intellectual disability and autism spectrum disorder?**

- **Answer:** Intellectual disability involves deficits in intellectual functioning (IQ <70) AND adaptive functioning. ASD involves social communication deficits and restricted/repetitive behaviors regardless of IQ. They frequently co-occur (~30% of ASD cases).

- **Evidence:** Nearly one-third of individuals with ASD have intellectual disability or minimal verbal ability.

- **Key paper:** Lord et al., Lancet 2018.

- **Pearl:** A child with intellectual disability may have social difficulties due to cognitive limitations, but will not show the **restricted/repetitive behaviors** characteristic of ASD — this is the key differentiator.

## SLEEP DISORDERS (Questions 88–90)

**88. What is the first-line treatment for chronic insomnia?**

- **Answer:** CBT-I (cognitive behavioral therapy for insomnia) — endorsed as first-line by AASM, ACP, VA/DoD, and World Sleep Society. Core components: sleep restriction, stimulus control, cognitive restructuring, relaxation training.

- **Evidence:** CBT-I is equivalent to pharmacotherapy short-term but superior long-term. Sleep hygiene alone is **not effective** as standalone treatment.

- **Key paper:** Morin & Buysse, NEJM 2024.

- **Pearl:** The most counterintuitive but effective CBT-I technique is **sleep restriction** — limiting time in bed to match actual sleep time increases sleep drive and consolidates sleep.

**89. What pharmacotherapy options exist for insomnia?**

- **Answer:** FDA-approved: Z-drugs (zolpidem, eszopiclone), dual orexin receptor antagonists (suvorexant, lemborexant), low-dose doxepin (≤6 mg), ramelteon. Trazodone is widely used but has weak evidence. Avoid benzodiazepines and antihistamines in older adults.

- **Evidence:** The AASM conditionally recommends against sleep hygiene as single therapy.

- **Key paper:** Morin & Buysse, NEJM 2024.

- **Pearl:** **Trazodone** is the most commonly prescribed sleep medication in the U.S. despite having less evidence than alternatives — know this for boards, but also know it's not guideline-recommended first-line.

**90. Why is sleep hygiene alone insufficient for insomnia?**

- **Answer:** Sleep hygiene education is a component of CBT-I but has no significant independent effect (iOR 1.01 in a component network meta-analysis). The AASM issued a conditional recommendation against sleep hygiene as single therapy.

- **Evidence:** The critical active components of CBT-I are cognitive restructuring, sleep restriction, and stimulus control — not sleep hygiene.

- **Key paper:** Furukawa et al., JAMA Psychiatry 2024.

- **Pearl:** Telling a patient to "practice good sleep hygiene" without offering CBT-I is like telling a diabetic to "eat better" without providing structured dietary counseling — it's necessary but insufficient.

## EATING DISORDERS (Questions 91–93)

**91. What are the medical complications of anorexia nervosa?**

- **Answer:** Cardiovascular (bradycardia, QT prolongation, arrhythmias), endocrine (amenorrhea in ~78%, hypothalamic), skeletal (osteoporosis), hematologic (pancytopenia), GI (delayed gastric emptying), neurologic (cortical atrophy — reversible), and refeeding syndrome.

- **Evidence:** AN has the **highest mortality rate among psychiatric conditions**; ~one-third of deaths are cardiovascular.

- **Key paper:** Trapani & Rubino, Pediatrics 2025.

- **Pearl:** **Refeeding syndrome** (hypophosphatemia, hypokalemia, hypomagnesemia → cardiac failure, seizures) is the most dangerous complication of nutritional rehabilitation — check phosphate daily during refeeding.

**92. What are the complications of purging in bulimia nervosa?**

- **Answer:** Metabolic alkalosis and hypokalemia (from vomiting), dental enamel erosion, parotid gland enlargement, esophageal tears (Mallory-Weiss), Russell's sign (calluses on knuckles), and pseudo-Bartter syndrome.

- **Evidence:** Suicide attempts occur in 31.4% of patients with bulimia nervosa.

- **Key paper:** Attia & Walsh, JAMA 2025.

- **Pearl:** **Metabolic alkalosis + hypokalemia** in a young patient should raise suspicion for purging — this electrolyte pattern is the laboratory signature of self-induced vomiting.

**93. What medications are FDA-approved for eating disorders?**

- **Answer:** Fluoxetine for bulimia nervosa (60 mg/day); lisdexamfetamine for binge eating disorder. No medications are FDA-approved for anorexia nervosa.

- **Evidence:** Fluoxetine reduces binge-purge frequency in bulimia; the effective dose (60 mg) is higher than the typical antidepressant dose.

- **Key paper:** USPSTF, JAMA 2022.

- **Pearl:** The dose of fluoxetine for bulimia (60 mg) is higher than for depression (20 mg) — similar to OCD, eating disorders require higher SSRI doses.

## PSYCHOPHARMACOLOGY PRINCIPLES (Questions 94–97)

**94. Which SSRIs are the strongest CYP450 inhibitors?**

- **Answer:** Fluoxetine and paroxetine are potent CYP2D6 inhibitors; fluvoxamine is a potent CYP1A2 and CYP2C19 inhibitor. Citalopram, escitalopram, and sertraline have the fewest drug interactions.

- **Evidence:** Fluoxetine's CYP2D6 inhibition persists for weeks after discontinuation due to norfluoxetine's long half-life.

- **Key paper:** Spina et al., Clin Ther 2008.

- **Pearl:** If a patient is on multiple medications, **escitalopram or sertraline** are the safest SSRI choices from a drug-interaction standpoint.

**95. Why does smoking affect clozapine and olanzapine levels?**

- **Answer:** Smoking induces CYP1A2, which metabolizes clozapine and olanzapine. Smoking cessation can cause a rapid rise in drug levels (up to 50–70% increase), potentially causing toxicity.

- **Evidence:** Dose adjustments are needed when patients start or stop smoking — this is a common inpatient scenario.

- **Key paper:** Nemeroff et al., Am J Psychiatry 1996.

- **Pearl:** It's the **polycyclic aromatic hydrocarbons** in smoke (not nicotine) that induce CYP1A2 — nicotine patches do not affect drug levels.

**96. What is pharmacogenomic testing in psychiatry?**

- **Answer:** Testing for CYP2D6 and CYP2C19 polymorphisms to predict drug metabolism. Poor metabolizers have higher drug exposure; ultrarapid metabolizers may have subtherapeutic levels.

- **Evidence:** CYP2D6 and CYP2C19 poor/intermediate metabolizer status significantly affects exposure to aripiprazole, haloperidol, risperidone, escitalopram, and sertraline.

- **Key paper:** Milosavljevic et al., JAMA Psychiatry 2021.

- **Pearl:** Pharmacogenomics is most useful **after treatment failure** — it can explain why a patient didn't respond or had excessive side effects, guiding the next medication choice.

**97. What is the black box warning on antidepressants?**

- **Answer:** FDA black box warning: antidepressants may increase suicidal thinking and behavior in children, adolescents, and young adults (ages 18–24) during initial treatment. Risk decreases in adults >24 and is reduced in adults ≥65.

- **Evidence:** This warning led to decreased antidepressant prescribing in children and adolescents; ecological analyses linked that drop to a concurrent increase in youth suicide attempts, though the causal interpretation remains debated.

- **Key paper:** Gibbons et al., *Am J Psychiatry* 2007; Lu et al., *BMJ* 2014.

- **Pearl:** The teaching point is the **unintended consequence** — a warning meant to improve safety was associated with reduced treatment and a possible net increase in harm. Monitor closely early in treatment rather than withholding effective care.

---
*Educational rounds-prep reference; concise model answers, not a substitute for the primary sources named. Reviewed and attested by Joshua Moss, MD (2026-07-09); verify before clinical use. Joshua Moss, MD | Psychiatrist*


---

# SECTION: Practice and Exam Prep

---

## Practice Questions — Question Bank

- **Slug:** `question-bank-practice.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `13_Faculty_Resources/_automation/site_build/question-bank-practice.html`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`moderate`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Practice Questions — MS3 Question Bank Reviewed by Joshua Moss, MD on 2026-07-05
- Skip to content Practice Questions
- Loading question bank…

**Authored clinical strings (99):**

- s toolExtraFromParams passthrough (spa_index.html) — no shell change needed to reach this tool
- s inject_shared_snippets() expands at build time (same mechanism as crisis blocks). Grades are the strings
- . Semantics: ease floor 1.3, Easy ease ceiling 4.0, interval cap 365 d, lapse halves the interval (min 1 d) and re-dues the card immediately. Requires `var DAY = 86400000` in scope. Behaviour is pinned by tests/sm2-behavior.test.mjs; consumer wiring is pinned by tests/family-srs-parity.test.mjs. applyGrade(card, grade, opts) — opts is optional; opts.fuzzKey (string, usually the card id) enables deterministic ±15% interval fuzz (see sm2Fuzz below) so cohort-seeded cards de-synchronize instead of avalanching due on the same day. Omitting opts (or fuzzKey) is byte-identical to the pre-fuzz grader — every existing caller keeps its exact legacy schedule until it opts in. cw_srs_v1 STATS CONTRACT — who may write stats.seen / stats.correct: - question-bank-practice.html srsUpdate(): YES (ground-truth correctness). - review.html grade(): YES (ground-truth correctness). - family-systems-practice.html srsGradeFamily(): NO — cards only. A self-rating has no ground truth, and review.html renders Retention as correct/seen. - Practice sims write cw_practice_events_v1 instead — never cw_srs_v1.stats. Per-event history (chosen grade vs. suggested grade, requeue flag) is a separate concern logged to cw_calib_v1 via calibLog() (build-injected from calib_log.js, the CALIB_LOG marker) — this file
- s own bounds. */ function sm2Fuzz(ivl, key, reps){ if(ivl < 3 || !key) return ivl; var h = 2166136261, s = key +
- + reps; for(var i=0;i >> 0; } var f = ((h % 2001) / 1000) - 1; /* [-1, 1] */ return Math.min(365, Math.max(1, Math.round(ivl + ivl * 0.15 * f))); } function applyGrade(card, grade, opts){ /* SM-2 variant: ease floor 1.3, interval cap 365 d */ var c = Object.assign({}, card); var fuzzKey = opts && opts.fuzzKey; c.reps = (c.reps||0) + 1; if(c.ivl===0){ /* first encounter */ if(grade===
- ){ c.lapses=(c.lapses||0)+1; c.ivl=1; c.due=Date.now(); } else if(grade===
- ){ c.ivl=1; c.due=Date.now()+DAY; } else if(grade===
- ){ c.ivl=1; c.due=Date.now()+DAY; } else { c.ivl=sm2Fuzz(4, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } /* Easy */ } else { if(grade===
- ){ /* Again is never fuzzed — lapses re-due immediately regardless of fuzzKey. */ c.lapses=(c.lapses||0)+1; c.ease=Math.max(1.3, (c.ease||2.5)-0.2); c.ivl=Math.max(1, Math.round(c.ivl*0.5)); c.due=Date.now(); } else if(grade===
- ){ c.ease=Math.max(1.3, (c.ease||2.5)-0.15); c.ivl=Math.max(1, Math.round(c.ivl*1.2)); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+Math.min(365,c.ivl)*DAY; } else if(grade===
- ){ c.ivl=Math.max(1, Math.round(c.ivl*(c.ease||2.5))); c.ivl=Math.min(365,c.ivl); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } else { /* Easy */ c.ease=Math.min(4, (c.ease||2.5)+0.15); c.ivl=Math.max(1, Math.round(c.ivl*(c.ease)*1.3)); c.ivl=Math.min(365,c.ivl); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } } c.last=Date.now(); return c; } /* Calibration ledger cw_calib_v1 — append-only judgment-vs-outcome history. Enum fields + existing ids ONLY; no free text ever (PHI firewall is structural). cw_qb_v1 stays the current-state store; this is the history store; no reader joins both into one number (spec: 2026-08-05-shared-state-spine-design.md). Writers: qbank qbRecord (re flag), review.html grade() (sug/rq). cw_practice_events_v1 remains reserved for sim process events — a different thing. */ function calibLog(evt){ try{ var S={qb:[
- ]}; if(!evt || !S[evt.s] || S[evt.s].indexOf(evt.p)<0) return; var d=null; try{ d=JSON.parse(localStorage.getItem(
- ); }catch(_e){ d=null; } if(!d || d.v!==1 || !Array.isArray(d.qb) || !Array.isArray(d.rev)) d={v:1,qb:[],rev:[]}; var ring=d[evt.s===
- ]; ring.push(evt); while(ring.length>400) ring.shift(); localStorage.setItem(
- , JSON.stringify(d)); }catch(_){ } } function calibRead(){ try{ var d=JSON.parse(localStorage.getItem(
- ); if(d && d.v===1 && Array.isArray(d.qb) && Array.isArray(d.rev)) return d; }catch(_){ } return {v:1,qb:[],rev:[]}; } function calibClear(){ try{ localStorage.removeItem(
- ); }catch(_){ } } /* Qbank session capsule cw_sess_v1 — per-tool checkpoint store for an interrupted session. Checkpointed at question boundaries only (advance/skip), never mid-question — the caller
- s (design spec §PR-3). sessLoad owns load-validate-expire so two hand-rolled expiry copies can
- s home Resume row (read-only; guards queueIds/idx shape itself since sessLoad only validates expiry). */ function sessLoad(tool, nowMs){ try{ var d=JSON.parse(localStorage.getItem(
- ); if(!d || d.v!==1 || !d.sessions || typeof d.sessions!==
- ) return null; var s=d.sessions[tool]; if(!s || typeof s!==
- ){ return null; } var now=(nowMs===undefined||nowMs===null)?Date.now():nowMs; if(typeof s.expiresAt!==
- || now>s.expiresAt){ delete d.sessions[tool]; localStorage.setItem(
- , JSON.stringify(d)); return null; } return s; }catch(_){ return null; } } function sessSave(tool, session){ try{ var d=JSON.parse(localStorage.getItem(
- ) d={v:1,sessions:{}}; d.sessions[tool]=session; localStorage.setItem(
- , JSON.stringify(d)); }catch(_){ } } function sessClear(tool){ try{ var d=JSON.parse(localStorage.getItem(
- ) return; delete d.sessions[tool]; localStorage.setItem(
- , JSON.stringify(d)); }catch(_){ } } function srsUpdate(item, confidence, correct, twoTierResult){ var s = srsLoad(); var cardId =
- +item.id; var card = s.cards[cardId]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0}; var grade = srsGrade(item, confidence, correct, twoTierResult); s.cards[cardId] = applyGrade(card, grade, {fuzzKey:cardId}); /* update aggregate stats */ s.stats.totalReviews = (s.stats.totalReviews||0)+1; if(correct) s.stats.correct=(s.stats.correct||0)+1; s.stats.seen=(s.stats.seen||0)+1; srsSave(s); return grade; } /* ---- queue building ----------------------------------------------------------- */ function buildQueue(items, catFilter, diffFilter, sizeLimit){ var q = items.filter(function(it){ if(catFilter!==
- && it.category!==catFilter) return false; if(diffFilter!==
- && String(it.difficulty)!==diffFilter) return false; return true; }); q = shuffle(q); if(sizeLimit!==
- ) q = q.slice(0, parseInt(sizeLimit,10)||20); return q; } /* Items eligible to serve to learners. Two gates: — Retired items (near-duplicate/redundant per question_bank.schema.json) are NEVER queued. — Un-attested items serve ONLY when the learner opts in via the setup-screen toggle (persisted as cw_qb_drafts_v1). The default pool is faculty-attested items only, and every surface that shows an included draft labels it — see renderMeta() and the .draft-notice callout in renderQuestion(). Policy history, because this has flipped before: the 2026-07-15 decision log recorded "serve drafts, marked" after a04a848 gated to attested-only by ACCIDENT — the pool fell 192->143 with no UI trace, and #284 restored serving. The 2026-08-20 Taplinger response plan (PLAN_Taplinger_Feedback_and_Therapy_Library_2026-08-20.md §A2 / WP-37, urgency per FEEDBACK_IMPACT_Taplinger_Verbatim_2026-08-20.md §3) reverses that decision deliberately now that an external course page links to the site: attested-only BY DEFAULT, drafts opt-in and labelled. Unlike a04a848, this flip is visible — the setup screen states the exclusion, shows the excluded count, and carries the toggle. Fail-safe direction: only an explicit status===
- reaches the default pool, so a new or misspelled status is withheld rather than served as reviewed (mirrors the label logic, which marks anything not attested). `status` is still the source of truth; nothing here mutates it, and attestation stays server-side. */ function includeDrafts(){ return lsGet(
- )===true; } function setIncludeDrafts(on){ lsSet(
- , !!on); } function activeItems(){ var inc = includeDrafts(); return (BANK && BANK.items ? BANK.items : []).filter(function(it){ if(it.retired) return false; if(!inc && it.status!==
- ) return false; return true; }); } /* Focus-mode presets, built from the learner
- s cw_qb_drafts_v1 opt-in is set (see the policy comment above). */ function missedItems(){ var records = qbLoad(); return activeItems().filter(function(it){ var rec = records[it.id]; return !!rec && rec.correct === false; }); } function certWrongItems(){ var records = qbLoad(); return activeItems().filter(function(it){ var rec = records[it.id]; return !!rec && rec.certWrong === true; }); } /* Due-first serving. This tool has WRITTEN QB# cards to cw_srs_v1 since SRS seeding landed, but nothing ever read the schedule — Daily Review serves TOPIC# cards only (the false "resurfaces in Daily Review" copy was corrected in #344). This makes the schedule real: cards that have come due return at the FRONT of the next practice session here, most-overdue first. Routed through activeItems(), so a since-retired item can never resurface no matter what its card says. */ function dueQbItems(){ var s = srsLoad(); if(!s || !s.cards) return []; var now = Date.now(), due = {}; Object.keys(s.cards).forEach(function(id){ if(id.indexOf(
- ) !== 0) return; var c = s.cards[id]; if(c && typeof c.due ===
- && c.due <= now) due[id.slice(3)] = c.due; }); return activeItems() .filter(function(it){ return Object.prototype.hasOwnProperty.call(due, it.id); }) .sort(function(a, b){ return due[a.id] - due[b.id]; }); } /* ---- rendering helpers -------------------------------------------------------- */ function diffDots(n){ var h=
- ; for(var i=1;i<=3;i++) h+=
- diff-dot'+(i<=n?' on':'')+'
- ; } function renderSetup(){ var items = activeItems(); var cats = {}; items.forEach(function(it){ cats[it.category]=1; }); var catOpts =
- ; Object.keys(CAT_LABELS).forEach(function(k){ if(cats[k]) catOpts+=
- ; }); var total = items.length; /* bankDraftCount is toggle-independent (all non-retired, non-attested items in the bank); draftCount is how many of those are in the SERVED pool right now. The note renders whenever the bank has drafts, in whichever wording matches the toggle — excluded-by-default (off) or labelled-in-pool (on). */ var draftsOn = includeDrafts(); var bankDraftCount = (BANK && BANK.items ? BANK.items : []).filter(function(it){ return !it.retired && it.status!==
- ; }).length; var draftCount = draftsOn ? bankDraftCount : 0; var missedCount = missedItems().length; var certWrongCount = certWrongItems().length; var dueCount = dueQbItems().length; return
- ; } function renderMeta(item){ var h =
- ; h += diffDots(item.difficulty); if(item.type===
- ; /* The glyph is decorative — the wording carries the meaning, so the label never depends on colour or on the icon being announced. */ if(item.status!==
- ; return h; } function renderConfidence(disabled){ var ds = disabled ?
- ; } function renderOptions(item, state){ /* state:
- — locked after answer. Letters come from DISPLAY position, not the authored key: 46 of 47 draft items are keyed A, so rendering opt.key after the shuffle both scrambled the letter sequence and let "A." follow the correct answer around the screen. data-key still carries the authored key for answer logic. A locked re-render reuses the session
- Select the best rationale — then see your full feedback.
- <button class="opt" data-tier2key="
- ✓ Right answer — shaky reasoning
- · Confidently wrong — flagged for review
- Right answer, wrong reason — your SRS interval is capped at Hard , so this item comes due again soon and will serve at the front of a future session here. The correct rationale:
- <a class="fb-link" href="
- target="_blank" rel="noopener"
- ⚠ Draft — not yet faculty-reviewed.
- This question and its explanation have not been checked by faculty. Practise with it,
- but verify anything you would act on against a primary source.
- Calibration gap: You were certain
- Miscalibration on the wards is more dangerous than ignorance —
- replay your confidently-wrong items from this summary.
- No questions match the selected filters.
- t reconstructable), so a mid-question restore would be structurally broken and is not attempted; the checkpoint is deleted instead, in showSummary(), on session completion. Never written for a reviewOnly (faculty-preview) session. Grading state is never duplicated here — qbRecord()/srsUpdate() already persist each answer per-interaction (commitResponse); the capsule stores position + session bookkeeping only, so a resumed showSummary() covers the WHOLE session without a second write against the SM-2 stats contract. */ function checkpointSession(){ if(!SESSION || SESSION.reviewOnly) return; var now = Date.now(); sessSave(
- , { at: now, expiresAt: now + DAY, queueIds: SESSION.queue.map(function(it){ return it.id; }), idx: SESSION.idx, responses: SESSION.responses.map(function(r){ return { id: r.item.id, correct: r.correct, confidence: r.confidence }; }) }); } /* Resume path for ?resume=1. Rebuilds the queue from the capsule
- tier 2 still shown and answered — the feedback teaches against both selections
- Right answer, shaky reasoning.
- s sessClear instead. */ if(SESSION.idx < SESSION.queue.length) checkpointSession(); showQuestion(); } function showSummary(){ /* Session complete (or a resume landed exactly at the end) — clear the capsule so a stale slot never lingers past its own session. Never touched for reviewOnly, which never reaches this function via advance() (no Next button is rendered for a faculty-preview session — see getFeedbackHtml/showFeedback). */ if(!(SESSION && SESSION.reviewOnly)) sessClear(
- ); progLabel.textContent=
- ; qprog.hidden=false; qprogFill.style.width=
- ; setRoot(renderSummary()); var moreBtn=document.getElementById(
- ); if(moreBtn) moreBtn.addEventListener(
- ,showSetup); var homeBtn=document.getElementById(
- ); if(homeBtn) homeBtn.addEventListener(
- ,function(){ /* send parent SPA to Home page */ try{ window.parent.postMessage({type:
- ); } catch(_){} }); } /* ---- init --------------------------------------------------------------------- */ (function init(){ /* try relative path (built: /tools/question-bank-practice.html → /question_bank.json) */ fetch(
- ) .then(function(r){ if(!r.ok) throw new Error(
- +r.status); return r.json(); }) .then(function(data){ BANK = data; if(REVIEW_CONTEXT){ var reviewItem = (data.items || []).find(function(item){ return item && item.id === REVIEW_CONTEXT.reviewItem && item.retired !== true; }); if(!reviewItem){ root.innerHTML =
- ); return; } showReviewItem(reviewItem); return; } if(RESUME_REQUESTED && tryResumeSession()) return; showSetup(); /* adaptive engine handoff: home may set cw_qb_focus to a blueprint category so the learner lands in their weakest area with the filter preselected. */ try{ var _focus=localStorage.getItem(
- ); if(_focus){ localStorage.removeItem(
- ); var _cs=document.getElementById(
- ); if(_cs){ for(var _i=0;_i<_cs.options.length;_i++){ if(_cs.options[_i].value===_focus){ _cs.value=_focus; break; } } var _cnt=document.getElementById(
- ), _n=activeItems().filter(function(it){return it.category===_focus;}).length; if(_cnt) _cnt.textContent=_n+
- ; } } }catch(_){ } }) .catch(function(err){ root.innerHTML=
- ); }); /* handle filter count updates before bank loads */ root.addEventListener(
- ,function(ev){ var t=ev.target; if(t&&(t.id===
- )){ var catSel=document.getElementById(
- ); if(!BANK||!countEl) return; var cat=catSel?catSel.value:
- ; var n=activeItems().filter(function(it){ return (cat===
- ||String(it.difficulty)===diff); }).length; var size=sizeSel?sizeSel.value:
- )?n:Math.min(n,parseInt(size,10)||20); countEl.textContent=(showing===n?n:showing+
- ; } }); /* dark mode sync from parent SPA */ window.addEventListener(
- ,function(ev){ var d=ev.data||{}; if(d.type===
- )){ document.documentElement.setAttribute(
- ,d.mode); try{localStorage.setItem(
- ,d.mode);}catch(_){} } }); try{ var t=localStorage.getItem(
- ) document.documentElement.setAttribute(

---

## One Patient, Six Weeks

- **Slug:** `one-patient-six-weeks.html` · **Type:** tool · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/one-patient-six-weeks.html`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Category:** longitudinal-simulation · **Risk level:** `moderate` · **Disclaimer:** `fictional-simulation-supervision`
- **Related pages:** `pg_interview.md`, `ddx.md`, `medical_workup.md`, `psychopharm_primer.md`, `med_monitoring.md`, `collateral_workflow.md`, `family_playbook.md`, `exp_family.md`, `pg_suicide.md`, `agitation.md`, `doc_oral.md`, `shelf.md`, `evidence_inpatient.md`
- **Storage keys:** `cw_longitudinal_v1`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- One Patient, Six Weeks Reviewed by Joshua Moss, MD on 2026-08-11
- Skip to content Longitudinal case arc
- One Patient, Six Weeks
- Follow one fictional inpatient across changing information, relationships, safety questions, treatment conversations, and the final handoff.
- Boundary: fictional composite only. Do not enter patient information. This is a learning simulation, not a clinical decision tool or substitute for supervision and local policy.
- Loading the longitudinal case...
- If someone is in crisis
- On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
- 988 Suicide & Crisis Lifeline — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
- Crisis Text Line — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
- Maine Crisis Line — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
- Veterans Crisis Line — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
- Emergency services — 911. 24/7. For imminent danger to life.
- Contacts verified 2026-07-27 against official sources. Maintained in crisis_resources.json ; do not edit these numbers inline.

**Authored clinical strings (22):**

- ]/g,function(c){return {'&':'&',' ':'>','"':'"'}[c];});} function requestedWeek(){try{var n=parseInt(new URLSearchParams(location.search).get('week')||'1',10);return Math.max(0,Math.min(5,n-1));}catch(_){return 0;}} function loadProgress(){try{var p=JSON.parse(localStorage.getItem('cw_longitudinal_v1')||'{}');return p&&p.version===1?p:{version:1,current:0,completed:{}};}catch(_){return {version:1,current:0,completed:{}};}} function saveProgress(){try{localStorage.setItem('cw_longitudinal_v1',JSON.stringify(state.progress));}catch(_){} } function week(){return state.caseData.weeks[state.current];} function record(id){return state.progress.completed[id]||{checks:{}};} function complete(w){var r=record(w.id);return (w.checklist||[]).length>0&&(w.checklist||[]).every(function(_,i){return !!r.checks['c'+i];});} function completedCount(){return state.caseData.weeks.filter(complete).length;} function setWeek(i){state.current=Math.max(0,Math.min(state.caseData.weeks.length-1,i));state.progress.current=state.current;saveProgress();try{history.replaceState(null,'','?week='+(state.current+1));}catch(_){}render();} function weekList(){return '<div class=
- >'+state.caseData.weeks.map(function(w,i){var on=i===state.current,done=complete(w);return '<button type=
- ;} function sidebar(){var done=completedCount(),total=state.caseData.weeks.length,pct=Math.round(done*100/total);return
- Longitudinal case progress
- ;} function patientCard(){var p=state.caseData.patient;return
- ;} function checklist(w){ var r=record(w.id); return
- +w.checklist.map(function(item,i){ var key=
- +i; var on=!!r.checks[key]; var inputId=
- checkitem'+(on?' done':'')+'
- ; } function links(w){return
- +w.links.map(function(link){var param=link.kind===
- ;} function weekCard(w){var done=complete(w);var r=record(w.id);return
- status'+(done?' done':'')+'
- +links(w);} function render(){if(!state.caseData){app.innerHTML=
- ;return;}var w=week();app.innerHTML=
- ,function(ev){var weekButton=ev.target.closest&&ev.target.closest(
- )){state.progress={version:1,current:0,completed:{}};setWeek(0);}}}); app.addEventListener(
- ,function(ev){var input=ev.target.closest&&ev.target.closest(
- );if(!input)return;var w=week(),r=record(w.id);r.checks=r.checks||{};r.checks[input.getAttribute(
- )]=!!input.checked;r.at=new Date().toISOString().slice(0,10);state.progress.completed[w.id]=r;saveProgress();render();}); fetch(
- ).then(function(r){if(!r.ok)throw new Error(
- );return r.json();}).then(function(data){state.caseData=data;state.current=Math.max(0,Math.min(data.weeks.length-1,state.progress.current||state.current));render();}).catch(function(){app.innerHTML=

---

## Daily Review (Spaced Repetition)

- **Slug:** `review.html` · **Type:** tool · **Sidebar:** hidden (deep link only)
- **Source:** `07_Evidence_and_Reading/Landmark_Trials/review.html`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`moderate`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Daily Review — Spaced Repetition Reviewed by Joshua Moss, MD on 2026-07-05
- Skip to content

**Authored clinical strings (42):**

- t lean on position memory. Letters are display-position-derived (String.fromCharCode(65+pos)), so relabeling is automatic. */ /* FNV-1a seed + xorshift32 steps — NOT a bare LCG: an LCG
- s inject_shared_snippets() expands at build time (same mechanism as crisis blocks). Grades are the strings
- . Semantics: ease floor 1.3, Easy ease ceiling 4.0, interval cap 365 d, lapse halves the interval (min 1 d) and re-dues the card immediately. Requires `var DAY = 86400000` in scope. Behaviour is pinned by tests/sm2-behavior.test.mjs; consumer wiring is pinned by tests/family-srs-parity.test.mjs. applyGrade(card, grade, opts) — opts is optional; opts.fuzzKey (string, usually the card id) enables deterministic ±15% interval fuzz (see sm2Fuzz below) so cohort-seeded cards de-synchronize instead of avalanching due on the same day. Omitting opts (or fuzzKey) is byte-identical to the pre-fuzz grader — every existing caller keeps its exact legacy schedule until it opts in. cw_srs_v1 STATS CONTRACT — who may write stats.seen / stats.correct: - question-bank-practice.html srsUpdate(): YES (ground-truth correctness). - review.html grade(): YES (ground-truth correctness). - family-systems-practice.html srsGradeFamily(): NO — cards only. A self-rating has no ground truth, and review.html renders Retention as correct/seen. - Practice sims write cw_practice_events_v1 instead — never cw_srs_v1.stats. Per-event history (chosen grade vs. suggested grade, requeue flag) is a separate concern logged to cw_calib_v1 via calibLog() (build-injected from calib_log.js, the CALIB_LOG marker) — this file
- s own bounds. */ function sm2Fuzz(ivl, key, reps){ if(ivl < 3 || !key) return ivl; var h = 2166136261, s = key +
- + reps; for(var i=0;i >> 0; } var f = ((h % 2001) / 1000) - 1; /* [-1, 1] */ return Math.min(365, Math.max(1, Math.round(ivl + ivl * 0.15 * f))); } function applyGrade(card, grade, opts){ /* SM-2 variant: ease floor 1.3, interval cap 365 d */ var c = Object.assign({}, card); var fuzzKey = opts && opts.fuzzKey; c.reps = (c.reps||0) + 1; if(c.ivl===0){ /* first encounter */ if(grade===
- ){ c.lapses=(c.lapses||0)+1; c.ivl=1; c.due=Date.now(); } else if(grade===
- ){ c.ivl=1; c.due=Date.now()+DAY; } else if(grade===
- ){ c.ivl=1; c.due=Date.now()+DAY; } else { c.ivl=sm2Fuzz(4, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } /* Easy */ } else { if(grade===
- ){ /* Again is never fuzzed — lapses re-due immediately regardless of fuzzKey. */ c.lapses=(c.lapses||0)+1; c.ease=Math.max(1.3, (c.ease||2.5)-0.2); c.ivl=Math.max(1, Math.round(c.ivl*0.5)); c.due=Date.now(); } else if(grade===
- ){ c.ease=Math.max(1.3, (c.ease||2.5)-0.15); c.ivl=Math.max(1, Math.round(c.ivl*1.2)); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+Math.min(365,c.ivl)*DAY; } else if(grade===
- ){ c.ivl=Math.max(1, Math.round(c.ivl*(c.ease||2.5))); c.ivl=Math.min(365,c.ivl); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } else { /* Easy */ c.ease=Math.min(4, (c.ease||2.5)+0.15); c.ivl=Math.max(1, Math.round(c.ivl*(c.ease)*1.3)); c.ivl=Math.min(365,c.ivl); c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; } } c.last=Date.now(); return c; } /* Calibration ledger cw_calib_v1 — append-only judgment-vs-outcome history. Enum fields + existing ids ONLY; no free text ever (PHI firewall is structural). cw_qb_v1 stays the current-state store; this is the history store; no reader joins both into one number (spec: 2026-08-05-shared-state-spine-design.md). Writers: qbank qbRecord (re flag), review.html grade() (sug/rq). cw_practice_events_v1 remains reserved for sim process events — a different thing. */ function calibLog(evt){ try{ var S={qb:[
- ]}; if(!evt || !S[evt.s] || S[evt.s].indexOf(evt.p)<0) return; var d=null; try{ d=JSON.parse(localStorage.getItem(
- ); }catch(_e){ d=null; } if(!d || d.v!==1 || !Array.isArray(d.qb) || !Array.isArray(d.rev)) d={v:1,qb:[],rev:[]}; var ring=d[evt.s===
- ]; ring.push(evt); while(ring.length>400) ring.shift(); localStorage.setItem(
- , JSON.stringify(d)); }catch(_){ } } function calibRead(){ try{ var d=JSON.parse(localStorage.getItem(
- ); if(d && d.v===1 && Array.isArray(d.qb) && Array.isArray(d.rev)) return d; }catch(_){ } return {v:1,qb:[],rev:[]}; } function calibClear(){ try{ localStorage.removeItem(
- ); }catch(_){ } } /* Rotation phase policy — cw_shelf_date finally governs the study diet. shelfDaysUntil() is THE local-midnight date helper: spa_index.html
- s range. Copy rule: labels ship to both sites — audience-neutral, "Exam", never "Shelf". */ function shelfDaysUntil(shelfStr, nowMs){ if(!shelfStr) return null; var t=new Date(shelfStr+
- ).getTime(); if(isNaN(t)) return null; return Math.ceil((t-(nowMs||Date.now()))/86400000); } function phasePolicy(nowMs){ var shelf=null; try{ shelf=localStorage.getItem(
- ); }catch(_){ } var days=shelfDaysUntil(shelf, nowMs); if(days===null) return {phase:
- }; if(days<0) return {phase:
- }; if(days<=7) return {phase:
- }; if(days<=14)return {phase:
- }; if(days<=28)return {phase:
- }; } /* localDayStr()/localDayIndex() are the front door
- s queue-build call — patching only one leaves the other unthrottled. An explicit learner choice (setNewPerDay, which sets settings.userSet) always wins over the rotation-phase cap; phasePolicy() itself never throws, but the try/catch keeps this helper safe even if that contract ever changes. */ function effectiveNewPerDay(s){ var set=(s.settings&&s.settings.newPerDay)||12; if(s.settings&&s.settings.userSet) return set; /* explicit choice always wins */ var cap=12; try{ cap=phasePolicy().newPerDayCap; }catch(_){ } return Math.min(set, cap); } var gradedThisSession={}; // session-local: has card.id already been graded once this session? (a requeued Again-card
- s rq flag). Reset in start(). function maturity(st){if(!st||!st.reps)return "new";if(st.ivl>=21)return "mature";if(st.lapses&&st.ivl 0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;} /* ---------- theme ---------- */ function toggleTheme(setTheme){var nx=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",nx);try{localStorage.setItem("cw_theme",nx);}catch(_){ } setTheme(nx); if(framed){try{window.parent.postMessage({type:"theme",mode:nx},"*");}catch(_){ }}} function App(){ var ld=useState(null),cards=ld[0],setCards=ld[1]; var er=useState(false),err=er[0],setErr=er[1]; var sv=useState(loadS()),store=sv[0],setStore=sv[1]; var ses=useState(null),sess=ses[0],setSess=ses[1]; // {queue,pos,chosen,revealed,reviewed,correct,fresh} var th=useState((document.documentElement.getAttribute("data-theme")==="dark")?"dark":"light"),theme=th[0],setTheme=th[1]; var tick=useState(0),setTick=tick[1]; var sessRef=useRef(null); sessRef.current=sess; useEffect(function(){ Promise.all([ fetch("quizzes.json?v=f01d67b4b5f1").then(function(r){return r.ok?r.json():{decks:[]};}).catch(function(){return {decks:[]};}), fetch("../topic_meta.json").then(function(r){return r.ok?r.json():{};}).catch(function(){return {};}) ]).then(function(res){ var j=res[0]||{}, tm=res[1]||{}, out=[]; (j.decks||[]).forEach(function(d){ (d.questions||[]).forEach(function(q,i){ if(!q||!q.q||!q.o)return; out.push({id:d.id+"#"+i,deck:d.id,deckTitle:d.title||d.id,q:q.q,o:q.o,audio:d.audio||null,audioDur:d.audioDur||null}); }); }); function pretty(k){ return k.replace(/^t_/,"").replace(/\.md$/,"").replace(/_/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();}); } Object.keys(tm).forEach(function(k){ if(k.charAt(0)==="_")return; var m=tm[k]; if(m&&m.quiz&&m.quiz.q&&m.quiz.o&&m.quiz.o.length){ out.push({id:"TOPIC#"+k,deck:"TOPIC",deckTitle:"Topic · "+pretty(k),q:m.quiz.q,o:m.quiz.o.map(function(o){return {t:o.t,c:!!o.c,fb:(o.c?(m.quiz.why||""):"")};})}); } }); if(!out.length){ setErr(true); return; } setCards(out); }).catch(function(){setErr(true);}); },[]); useEffect(function(){ function onMsg(ev){var d=ev.data||{};if(d.type==="theme"&&(d.mode==="dark"||d.mode==="light")){document.documentElement.setAttribute("data-theme",d.mode);setTheme(d.mode);}} window.addEventListener("message",onMsg); return function(){window.removeEventListener("message",onMsg);}; },[]); useEffect(function(){ function onKey(ev){ var s=sessRef.current; if(!s)return; var k=ev.key; if(!s.revealed){ var n=parseInt(k,10); if(n>=1&&n<=s.card.o.length){choose(optOrder(s.card)[n-1]);} } else { if(k==="1")grade(0); else if(k==="2")grade(1); else if(k==="3")grade(2); else if(k==="4")grade(3); } } window.addEventListener("keydown",onKey); return function(){window.removeEventListener("keydown",onKey);}; },[]); function persist(s){saveS(s);setStore(Object.assign({},s));} /* dashboard metrics */ function metrics(){ var now=Date.now(),due=0,neu=0,learn=0,young=0,mature=0,seen=0; if(cards){ var s=rollDay(loadS()); cards.forEach(function(c){var st=s.cards[c.id]; if(!st){neu++;return;} seen++; var m=maturity(st); if(m==="mature")mature++; else if(m==="young")young++; else learn++; if(st.due<=now)due++; }); } var newRemain=cards?Math.max(0,effectiveNewPerDay(store)-(rollDay(loadS()).day.newToday||0)):0; return {due:due,neu:neu,newRemain:Math.min(newRemain,neu),learn:learn,young:young,mature:mature,seen:seen}; } function start(ahead){ var s=rollDay(loadS()); var now=Date.now(); var due=[],neu=[],fut=[]; cards.forEach(function(c){var st=s.cards[c.id]; if(!st)neu.push(c); else if(st.due<=now)due.push(c); else fut.push([c,st.due]);}); /* Overdue-first: sort by how overdue each card is (ratio, not raw days) so long-interval cards that are only slightly late don
- Reset all spaced-repetition progress? This clears your review schedule and streak. This also clears your calibration history. Reading progress elsewhere is unaffected.
- Spaced repetition · Joshua Moss, MD
- Could not load the question bank (quizzes.json). Open this tool from the hub so it can find its data, then try again.
- Loading the question bank…
- s calibLog event via closure var fbOpt=c.o[sess.chosen]||{}; var corrOpt=c.o[ci]||{}; var isNew=!loadS().cards[c.id]; return e("div",{className:"wrap"},head, e("div",{className:"sess"}, e("div",{className:"sbar"},e("i",{style:{width:pctp+"%"}})), e("div",{className:"sinner"}, e("div",{className:"smeta"}, e("span",{className:"deckchip"+(isNew?" snew":"")}, isNew?"New":"Review"), e("span",{className:"deckchip",style:{background:"var(--bg-alt)",color:"var(--text-light)"}}, c.deckTitle.length>42?c.deckTitle.slice(0,40)+"…":c.deckTitle), e("span",{className:"scount"}, (sess.pos+1)+" / "+sess.total)), e("div",{className:"qtext"}, c.q), c.audio? e("details",{className:"oeaudio"}, e("summary",null,"🎧 Listen — paper overview"+(c.audioDur?(" · "+c.audioDur):"")), e("audio",{controls:true,preload:"none",src:"../audio_oe/"+c.audio,"aria-label":"Paper overview audio"})) : null, e("div",{className:"opts"}, optOrder(c).map(function(oi,pos){ var o=c.o[oi]; var cls="opt"; if(sess.revealed){ if(oi===ci)cls+=" correct"; else if(oi===sess.chosen)cls+=" wrong"; else cls+=" dim"; } return e("button",{key:oi,className:cls,disabled:sess.revealed,onClick:function(){choose(oi);}}, e("span",{className:"kx"}, String.fromCharCode(65+pos)), e("span",null,o.t)); })), sess.revealed? e("div",{className:"fb"}, e("b",null, gotIt?"✓ Correct. ":"✗ Not quite. "), (fbOpt.fb||corrOpt.fb||"") ) : null, e("div",{className:"visually-hidden","aria-live":"polite","aria-atomic":"true"}, sess.revealed ? (gotIt?"Correct. ":"Not quite. ")+(fbOpt.fb||corrOpt.fb||"") : ""), sess.revealed? e("div",{className:"grades"}, e("button",{className:"gr again"+(sug===
- ?" sug":""),onClick:function(){grade(0);}},"Again",e("span",{className:"gk"},"<10m")), e("button",{className:"gr hard",onClick:function(){grade(1);}},"Hard",e("span",{className:"gk"},"1")), e("button",{className:"gr good"+(sug===
- Missed items can only be graded Again or Hard
- Pick the best answer (or press 1–
- Nothing is due right now and you’ve hit today’s new-card limit. Come back tomorrow, or study ahead below.
- Spaced repetition schedules each board-style question to return just before you’d forget it. A few minutes a day beats cramming. Grade yourself honestly.
- Each question carries its own schedule. Answer, then grade:
- (missed — comes back this session),
- . Correct, confident cards stretch further out; missed ones come back soon. Questions are drawn from the hub’s board-style bank (
- Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.
- Spacing schedule is stored only in this browser.
