# Medication Monitoring & Labs

> **Review status:** Reviewed and attested by Joshua Moss, MD (2026-07-09). Educational; fictional composites only, no PHI.

**In one line.** Every psychotropic with a monitoring requirement has a *baseline* and an *ongoing* schedule — knowing them is both a bedside safety habit and one of the most reliable sources of exam points.

**Why this is a student's job.** On rounds, the question "what did we check before we started this, and what's due next?" is one you can own. Monitoring is part of the prescription, not an afterthought; ordering the baseline labs, the β-hCG, and the EKG *before* the first dose — and knowing when the next level is due — is concrete, high-yield work.

**Baseline and ongoing, by agent.**

<section class="li-case" id="li-eight-am" aria-labelledby="li-title">
  <header class="li-mast">
    <p class="li-kicker">Lithium · Fictional teaching case</p>
    <div class="li-intro">
      <div><h3 id="li-title">Can you call it a trough?</h3>
        <p>At morning handoff on the psychiatry unit, Jules’s lithium level pops up. “That’s the trough we were waiting for, right?” the night nurse asks.</p>
      </div>
      <div class="li-slip" role="group" aria-label="Laboratory result"><span>Serum lithium</span><strong>0.8 <small>mmol/L</small></strong><span>Released Tue 08:00</span></div>
    </div>
  </header>
  <img class="li-art" src="illustrations/lithium-night-shift.webp" width="1400" height="467" alt="A night nurse reads the medication record. Across the station, dawn light falls on a specimen rack.">
  <section class="li-section" aria-labelledby="li-pick">
    <p class="li-kicker">MS3 · Reconstruct the night</p>
    <h4 id="li-pick">Which time ends the interval?</h4>
    <p>Jules has taken the same twice-daily lithium regimen for a week. The evening dose was given at <b>20:00 Monday</b>. The morning dose is still due.</p>
    <div class="li-strip" role="img" aria-label="Timeline from 20:00 Monday to 08:00 Tuesday. Last dose at 20:00." data-axis>
      <div class="li-clock"><div class="li-track"></div><div class="li-run" data-run></div><div class="li-ticks" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>
      <div class="li-times" aria-hidden="true"><span>20:00</span><span>00:00</span><span>04:00</span><span>08:00</span></div>
    </div>
    <div class="li-choices" role="group" aria-labelledby="li-pick">
      <button class="li-record" type="button" data-time="collection" aria-pressed="false" aria-controls="li-read"><svg aria-hidden="true" focusable="false" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-clipboard-check"></use></svg><span><small>Specimen label</small><strong>Collected at 04:00</strong></span></button>
      <button class="li-record" type="button" data-time="posted" aria-pressed="false" aria-controls="li-read"><svg aria-hidden="true" focusable="false" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#ic-clock"></use></svg><span><small>Lab report</small><strong>Released at 08:00</strong></span></button>
    </div>
    <div class="li-read" id="li-read" aria-live="polite" aria-atomic="true" hidden><h5 data-interval></h5><p data-explain></p></div>
  </section>
  <button type="button" class="li-link" data-continue hidden>Continue to the resident handoff ↓</button>
  <template data-interval-for="collection"><h5>8 hours from dose to draw</h5><p>The sample reflects 04:00. Tell the team it was drawn four hours before the intended 12-hour trough. A level drawn this early usually reads higher than the trough will, so the true trough is probably below 0.8. This result alone is a poor basis for a dose change.</p></template>
  <template data-interval-for="posted"><h5>12 hours from dose to report</h5><p>08:00 is when the number appeared on screen. The lithium in the tube reflects when the blood was collected. Try the time on the specimen label.</p></template>
</section>

| Agent | Baseline | Ongoing | Watch for |
|---|---|---|---|
| **Lithium** | BMP (renal), TSH, calcium, β-hCG, EKG if cardiac risk | Level ~5 days after start/change (12-h trough; mmol/L = mEq/L): acute mania 0.8–1.2; maintenance usually 0.6–0.8 — 0.4–0.6 if the response is good but tolerance poor, 0.8–1.0 if the response is inadequate and tolerance good; older adults usually 0.4–0.6 (at most ~0.7–0.8 at 65–79, ~0.7 at ≥80)[^nolen-2019-lithium-levels]; renal + TSH periodically | Narrow therapeutic index; tremor/ataxia/confusion = toxicity; NSAIDs, thiazides, ACE-inhibitors raise levels; teratogen (Ebstein anomaly) |
| **Valproate** | LFTs, CBC (platelets), β-hCG | Level; LFTs and CBC periodically; **send an ammonia level if the patient gets confused** — hyperammonaemic encephalopathy occurs with normal LFTs | Hepatotoxicity, thrombocytopenia, hyperammonemia presenting as worsening delirium, pancreatitis; contraindicated in significant hepatic impairment; teratogen (neural-tube) — avoid in childbearing potential |
| **Clozapine** | ANC (per prescribing information — the FDA eliminated the REMS in 2025) | ANC weekly ×6 months → every 2 weeks ×6 months → monthly (per the prescribing information; not REMS-enforced); metabolic panel; EKG | Severe neutropenia; **myocarditis (early, mostly weeks 1–4 — many protocols check troponin/CRP at baseline and weekly for the first 4 weeks; check urgently with fever, tachycardia, chest pain, or flu-like illness)**; constipation → ileus; dose-related seizures |
| **Antipsychotics (metabolic)** | Weight/BMI, waist, fasting glucose/A1c, lipids, blood pressure | Glucose/lipids at ~12 weeks then annually; weight each visit; AIMS for tardive dyskinesia | Metabolic syndrome; EPS/akathisia; tardive dyskinesia; prolactin elevation if symptomatic |
| **Carbamazepine** | CBC, LFTs, sodium, level, β-hCG; HLA-B*1502 in at-risk ancestry | Level, CBC, LFTs, sodium | Agranulocytosis/aplastic anemia; SIADH (hyponatremia); Stevens-Johnson (HLA-B*1502); auto-induction of its own metabolism; potent enzyme inducer (lowers hormonal contraceptives and many psychotropics); teratogen (neural-tube) |
| **QT-prolonging agents** (e.g., ziprasidone, IV haloperidol, droperidol, high-dose citalopram — and **methadone**, often already on board) | Baseline EKG (QTc); potassium, magnesium | Repeat QTc with dose changes; correct electrolytes | Torsades risk; respect citalopram dose ceilings; check what the patient is already taking before adding a second QT-prolonging agent |
| **Stimulants** | Blood pressure, heart rate, cardiac history screen; growth in children | BP/HR at visits; growth monitoring in children | Cardiovascular effects; appetite/growth suppression; misuse |
| **SSRIs/SNRIs** | (Clinical) — no routine labs required | Clinical monitoring | Hyponatremia (elderly), bleeding risk, activation and suicidality monitoring under age 25, discontinuation syndrome |

**What the student does.**
- Before a mood stabilizer or antipsychotic is started, confirm the baseline labs, β-hCG, and EKG (as indicated) are ordered — and say so on rounds.
- Track when the next lithium level or clozapine ANC is due, and flag it before it lapses.
- Watch the interaction traps: an NSAID or thiazide added to a lithium patient, a QT-prolonging combination, a serotonergic stack.

<section class="li-case li-rounds" id="li-resident" aria-labelledby="li-resident-title">
    <p class="li-kicker">Resident · Morning handoff</p>
    <h3 id="li-resident-title">What will you tell the team first?</h3>
    <button type="button" class="li-link" data-back>Return to the timing exercise ↑</button>
    <button class="li-primary" type="button" data-hear hidden data-close-label="Close the nurse’s update" aria-controls="li-call" aria-expanded="false">Hear the day nurse’s update</button>
    <div id="li-call" hidden>
      <div class="li-voice"><div class="li-from"><span class="li-kicker">Day nurse</span><button class="li-link" type="button" data-switch>Try the other report</button></div><blockquote data-voice aria-live="polite"></blockquote></div>
      <div class="li-actions" role="group" aria-labelledby="li-resident-title">
        <button type="button" data-first="timing" aria-pressed="false" aria-controls="li-feedback">Lead with the timing of the level</button>
        <button type="button" data-first="bedside" aria-pressed="false" aria-controls="li-feedback">Lead with how Jules is doing now</button>
      </div>
      <div id="li-feedback" class="li-read" aria-live="polite" hidden><p data-coach></p></div>
      <details data-worked hidden><summary class="cursor-interaction">Compare your handoff</summary><p data-note></p></details>
    </div>
  <footer><div><a href="https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=c84cce95-cfcb-4426-aac6-d2f48f946ada" target="_blank" rel="noopener noreferrer">Lithium prescribing information</a><span aria-hidden="true"> · </span><a href="https://sps.nhs.uk/monitorings/lithium-monitoring/" target="_blank" rel="noopener noreferrer">NHS monitoring guidance</a></div></footer>
  <template data-report="breakfast">
    <blockquote>“Jules walked down to breakfast with me. They ate, and they say they feel like themselves this morning.”</blockquote>
    <p data-lead="timing">Give the collection time so the team can plan a properly timed level. Include what the nurse saw and check in with Jules about symptoms and recent changes.</p>
    <p data-lead="bedside">That gives the team useful context. Add that the sample was drawn eight hours after the dose so nobody records it as the planned trough.</p>
    <p data-handoff>“Jules’s lithium was 0.8. The blood was drawn at four, eight hours after the evening dose, so the true trough is probably lower. The nurse says Jules walked to breakfast, ate and feels like themselves. I’ll check in with Jules and coordinate a 12-hour pre-dose level with the team.”</p>
  </template>
  <template data-report="change">
    <blockquote>“Can you come see Jules now? They’ve vomited twice, and I had to steady them on the way back from the bathroom. They were walking fine last night.”</blockquote>
    <p data-lead="timing">Go to Jules now and alert your supervisor. New vomiting and unsteadiness raise concern for lithium toxicity or another acute illness. Withhold lithium, draw an urgent lithium level and check renal function and electrolytes, and ask for urgent medical evaluation. A routine timed draw can wait.</p>
    <p data-lead="bedside">Lead with the new vomiting and gait change. Assess Jules now with the nurse and alert your supervisor. Withhold lithium and draw an urgent lithium level and check renal function and electrolytes while evaluating possible toxicity and other acute causes.</p>
    <p data-handoff>“I’m going to see Jules now. They’ve vomited twice and newly need help walking. I’m concerned about lithium toxicity or another acute illness. Let’s hold lithium, alert the supervising clinician and get an urgent lithium level, renal function and electrolytes. The earlier 0.8 was drawn eight hours after the dose.”</p>
  </template>
</section>

**High-yield pearls.**
- Lithium level is a 12-hour trough, drawn ~5 days after any dose change.[^canmat-isbd-bipolar-2018]
- The clozapine ANC schedule (weekly → biweekly → monthly) is worth memorizing; myocarditis is the early killer beyond the count.[^clozapine-rems]
- Valproate and lithium are teratogenic — β-hCG before starting, and avoid valproate in anyone who may become pregnant.
- Baseline and ongoing metabolic monitoring is part of prescribing an antipsychotic, not optional.
- Get a baseline QTc before QT-prolonging agents and keep potassium and magnesium repleted.[^fda-drug-safety]

**Pair with** the Psychopharmacology Primer, the Protocol Library, and ECT & Neuromodulation.

*Joshua Moss, MD | Psychiatrist · Educational; confirm all thresholds/schedules against current prescribing information and institutional protocol; fictional composites only, no PHI.*
