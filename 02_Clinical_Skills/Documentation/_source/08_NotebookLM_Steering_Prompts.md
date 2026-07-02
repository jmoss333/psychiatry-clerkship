# NotebookLM Steering Prompts for RSSM Audiobook
## 20+ Production-Ready Prompts Organized by Use Case

**Version:** 1.0  
**Date:** April 2026  
**Purpose:** Provide field-tested prompts for generating specific audiobook content types using NotebookLM's Audio Overview and Video Overview features, organized by audience and distribution channel.

---

## How to Use This Document

Each prompt below is designed to be **copied verbatim** into NotebookLM's chat interface. The formatting is consistent:

1. **Prompt Title** — identifies the content type
2. **Source Segment** — which NotebookLM notebook to load
3. **Output Type** — Audio Overview vs. Video Overview
4. **Recommended Length** — 5/10/15/20 min
5. **Distribution Channel** — where this content lives (social media, CME platform, etc.)
6. **The Prompt Itself** — copy into NotebookLM, adjust parameters to taste

Each prompt is designed to be **audience-specific** and **format-optimized**. Audio Overview prompts generate narrated summaries; Video Overview prompts add visual elements (though actual video implementation depends on NotebookLM's video capabilities).

---

# SECTION A: MARKETING/SAMPLING PROMPTS
## For social media teasers, event promotion, and general audience sampling

### Prompt A1: "Core Model 5-Minute Introduction"

**Output Type:** Audio Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_01_Foundation_Architecture  
**Distribution Channel:** YouTube Shorts, TikTok, LinkedIn feed  
**Audience:** General clinicians, families, public  

**Copy this prompt into NotebookLM:**
```
Create a 5-minute audio overview explaining the core premise of the 
Relational Systems Stabilization (RSS) model. 

Focus on:
1. What problem RSS solves (when usual interventions fail or escalate conflict)
2. The four-layer principle (biological, regulatory, relational, functional)
3. Why layer emphasis matters (clinical energy allocation, not protocol steps)
4. One concrete example of how the model changes clinical practice

Speak directly to clinicians who feel stuck or teams that feel ineffective. 
Avoid jargon. Use accessible language. End with: "Layer emphasis determines 
whether interventions succeed."

Target length: 4-6 minutes. Tone: authoritative but conversational.
```

**Expected output characteristics:**
- Clear, punchy narrative arc
- Accessible to non-specialists
- 1–2 specific clinical examples
- Call-to-action implied ("learn more about layer emphasis")

---

### Prompt A2: "Sleep as Psychiatric Foundation"

**Output Type:** Audio Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_02_Biological_Layer  
**Distribution Channel:** CME/podcast platforms, LinkedIn professional content  
**Audience:** Psychiatrists, medical doctors, clinical teams  

**Copy this prompt into NotebookLM:**
```
Generate a 5-minute audio overview on sleep as a psychiatric foundation, 
targeting practicing psychiatrists and medical teams.

Focus on:
1. The clinical crisis threshold: why patients decompensate when sleep degrades
2. Sleep as Layer 1 prerequisite (not optional; foundational)
3. Three evidence-based circadian interventions (light therapy, blue-blocking, chronotherapy)
4. One case narrative showing how sleep-first approach changed outcome

Include effect sizes where available. Reference polyvagal and arousal science 
without oversimplifying. End with: "Assess sleep first; it predicts treatment success."

Target length: 4-6 minutes. Tone: evidence-grounded, clinical authority.
```

**Expected output characteristics:**
- Evidence citations included
- Clinically actionable interventions named
- Sleep-outcome linkage established
- Authority voice with practical focus

---

### Prompt A3: "Layer Dynamics in Crisis"

**Output Type:** Audio Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_01_Foundation_Architecture + RSSM_07_Clinical_Applications  
**Distribution Channel:** Conference snippets, podcast, YouTube educational series  
**Audience:** Clinical trainees, curious clinicians, program directors  

**Copy this prompt into NotebookLM:**
```
Create a 5-minute audio overview explaining how the four layers interact 
during psychiatric crisis.

Focus on:
1. What "layer emphasis" means in acute presentations
2. How ignoring a lower layer blocks higher-layer work (with example)
3. The intensity gradient: maintaining all layers at reduced energy while 
   prioritizing the most unstable domain
4. One acute case showing layer shift (e.g., "we tried family work, then realized 
   sleep was the issue")

Tone: teaching-focused, shows how model guides decision-making. 
Target length: 4-6 minutes.
```

**Expected output characteristics:**
- Concrete clinical example provided
- Hierarchy of layer stability explained
- Decision-making framework implicit
- Training-appropriate depth

---

### Prompt A4: "Milieu as Medicine"

**Output Type:** Video Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_03_Regulatory_Layer + RSSM_06_Implementation_Operations  
**Distribution Channel:** YouTube educational series, staff orientation videos, hospital training  
**Audience:** Nurses, technicians, administrative staff, program directors  

**Copy this prompt into NotebookLM:**
```
Generate a 5-minute video overview on the psychiatric milieu as an active 
treatment agent (not just a setting).

Focus on:
1. How predictable rhythms, environmental structure, and "signals of safety" 
   reduce arousal load
2. Concrete sensory and temporal modifications (lighting, noise, schedules)
3. Team consistency as treatment mechanism
4. One visual narrative showing what a "predictable milieu" looks like in practice

Include text descriptions suitable for on-screen graphics. Target length: 4-6 minutes.
Tone: professional but warm. End with: "The milieu is the medicine; clinicians execute it."
```

**Expected output characteristics:**
- Visual descriptions provided
- Operational details (not just theory)
- Staff roles clarified
- Concrete physical environment elements

---

### Prompt A5: "Family as System, Not Problem"

**Output Type:** Audio Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_04_Relational_Layer  
**Distribution Channel:** Family-focused podcasts, public health campaigns, community mental health  
**Audience:** Family members, community advocates, clinicians new to family systems  

**Copy this prompt into NotebookLM:**
```
Create a 5-minute audio overview on viewing family as an active system in 
psychiatric stabilization (not as a complicating factor).

Focus on:
1. Family dysregulation as information, not pathology
2. Co-regulation and emotional contagion (how family nervous systems link)
3. Family psychoeducation as safety signal, not blame assignment
4. One family scenario showing shift from "problem family" to "injured system"

Language should be accessible to people without clinical backgrounds. 
Warm, non-judgmental tone. End with: "Family change enables individual change."

Target length: 4-6 minutes.
```

**Expected output characteristics:**
- No clinical jargon
- Dignity-centered language
- Family perspective honored
- Evidence of systemic thinking

---

## SECTION B: CLINICAL EDUCATION PROMPTS
## For CME modules, residency training, and professional development

### Prompt B1: "The Layer Architecture: Full Clinical Depth"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_01_Foundation_Architecture  
**Distribution Channel:** CME platform, residency curriculum, continuing education  
**Audience:** Psychiatrists, psychiatric nurse practitioners, experienced clinicians  

**Copy this prompt into NotebookLM:**
```
Generate a comprehensive 15-minute audio overview of the four-layer architecture, 
designed for psychiatric resident education and CME credit.

Include:
1. Detailed explanation of each layer (biological, regulatory, relational, functional)
2. Layer interaction mechanisms: downward constraints, upward scaffolding, 
   bidirectional effects
3. The intensity gradient: how layers remain active while emphasis shifts
4. Three distinct clinical scenarios (acute crisis, chronic instability, 
   family system rupture) showing different emphasis patterns
5. Evidence level for each layer; evidence level for layer integration
6. Discussion of boundary conditions: when stabilization approaches cause problems

Tone: authoritative, evidence-grounded, assumption of clinical experience.
Include effect sizes and evidence grades. Duration: 14-16 minutes.

End with: "The model is testable; this represents Level V evidence awaiting 
direct randomized evaluation."
```

**Expected output characteristics:**
- All four layers explained in clinical depth
- Evidence citations and effect sizes
- Multiple clinical examples
- Integration mechanisms clarified
- Testability/evidence transparency addressed

---

### Prompt B2: "Sleep and Circadian Medicine in Psychiatric Crisis"

**Output Type:** Audio Overview  
**Recommended Length:** 20 min  
**Source Segment:** RSSM_02_Biological_Layer  
**Distribution Channel:** CME module, medical education conference, psychiatry residency  
**Audience:** Psychiatrists, internal medicine doctors, neurologists with psychiatric interest  

**Copy this prompt into NotebookLM:**
```
Create a comprehensive 20-minute CME module on sleep and circadian neurobiology 
as psychiatric stabilization foundations.

Cover:
1. Sleep architecture: REM/NREM cycles, sleep deprivation cascade, crisis threshold
2. Circadian biology: SCN (suprachiasmatic nucleus), blue light, melatonin, 
   temperature regulation
3. Sleep loss and psychiatric decompensation: specific mechanisms (mood, 
   psychosis risk, behavioral control)
4. Diagnosis-specific sleep vulnerability (bipolar sleep loss sensitivity, 
   depression chronicity)
5. Evidence-based interventions: light therapy (evidence level, timing, intensity), 
   blue-light-blocking glasses, triple chronotherapy
6. Clinical assessment tools and "good-enough sleep" threshold
7. Two detailed case narratives showing sleep-first transformation

Include all cited effect sizes and NCCIH/APA recommendations. 
Tone: authoritative, sleep-medicine-grounded. Duration: 19-21 minutes.
```

**Expected output characteristics:**
- Sleep neurobiology explained accessibly
- All interventions evidence-graded
- Case narratives clinically rich
- Specific protocols provided
- CME-level depth and rigor

---

### Prompt B3: "Co-Regulation and Environmental Structure"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_03_Regulatory_Layer  
**Distribution Channel:** Clinical training, psychiatric nursing education, staff development  
**Audience:** Nurses, therapists, psychiatric technicians, residential staff  

**Copy this prompt into NotebookLM:**
```
Generate a 15-minute clinical education module on co-regulation as a 
treatment mechanism and environmental structure as intervention.

Cover:
1. Polyvagal theory basics: vagal tone, social engagement system, autonomic state
2. Co-regulation definition: how one nervous system affects another
3. "Signals of safety" operationalized: facial expressions, tone, proximity, 
   predictability, rhythm
4. Environmental modifications: sensory (lighting, sound, temperature), 
   temporal (scheduling, routines), interpersonal (consistency, predictability)
5. Team function and consistency as environmental element
6. Assessing arousal state and matching environmental intensity
7. One extended narrative: environmental reset in escalating agitation scenario

Tone: teaching-focused but clinically grounded. Reference Porges, Schore, 
and dyadic physiology research. Duration: 14-16 minutes.

Include: "Co-regulation precedes self-regulation; it is not a limitation but 
a necessary phase."
```

**Expected output characteristics:**
- Physiology explained without oversimplification
- Environmental elements concrete and actionable
- Team role clarified
- Co-regulation positioned as mechanism, not weakness

---

### Prompt B4: "Authority Without Coercion"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_04_Relational_Layer  
**Distribution Channel:** Clinician ethics training, leadership development, supervision  
**Audience:** Psychiatrists, senior clinicians, program leaders, supervisors  

**Copy this prompt into NotebookLM:**
```
Create a 15-minute audio overview on establishing clinical authority without 
coercion, designed for clinician development and ethical practice.

Cover:
1. Authority definition: right to make decisions about treatment and safety
2. The clinician as container: self-regulation as prerequisite
3. Boundary clarity without coldness: how respect preserves authority
4. Language and tone as authority tools: the "non-shaming curiosity" approach
5. Authority rupture and repair: what to do when authority is challenged
6. Cultural context: how authority is recognized and established differently 
   across communities
7. Ethics framework: duty, autonomy, and the limits of paternalism
8. Three scenario-based demonstrations: (a) escalating patient, (b) family challenge, 
   (c) team disagreement

Tone: thoughtful, introspective, grounded in relational theory. 
Duration: 14-16 minutes.

Positioning: "Authority is a clinical tool. It is most effective when 
earned through consistency, transparency, and dignity."
```

**Expected output characteristics:**
- Authority positioned as ethical tool
- Concrete language examples
- Cultural humility integrated
- Clinician self-reflection supported

---

### Prompt B5: "The First Three Sessions: Clinical Decision Map"

**Output Type:** Audio Overview  
**Recommended Length:** 20 min  
**Source Segment:** RSSM_06_Implementation_Operations (§25: First-3-Sessions Clinical Map)  
**Distribution Channel:** Residency training, new clinician orientation, clinical supervision  
**Audience:** Psychiatric residents, social workers, therapists, new clinicians  

**Copy this prompt into NotebookLM:**
```
Generate a comprehensive 20-minute clinical decision map for the first three 
patient/family encounters in RSS-framed care.

Cover:
1. Session 1 objectives: assessment, alliance-building, layer identification
2. Layer prioritization decision: which domain needs primary attention?
3. Session 2 objectives: family inclusion, narrative gathering, predictability 
   frame-setting
4. Environmental and behavioral interventions (Layer 1 and 2) to initiate 
   regardless of diagnosis
5. Session 3 objectives: milestone review, trajectory clarity, engagement 
   deepening
6. Common decision points and branch logic:
   - If sleep is severely disrupted → do this
   - If family is dysregulated → do this
   - If patient is apathetic/withdrawn → do this
7. Three narrative examples: acute crisis, chronic presentation, family-initiated request

Include timing, decision trees, and concrete phrases. 
Tone: practical, trainee-appropriate, procedural but principle-grounded.
Duration: 19-21 minutes.
```

**Expected output characteristics:**
- Decision trees provided
- Timing explicit
- Concrete language included
- Multiple clinical scenarios covered

---

## SECTION C: ACADEMIC/RESEARCH PROMPTS
## For professional audiences, evidence synthesis, and publication support

### Prompt C1: "Evidence Base and Mechanisms of Action"

**Output Type:** Audio Overview  
**Recommended Length:** 20 min  
**Source Segment:** RSSM_01_Foundation_Architecture + RSSM appendices (specifically Appendix F)  
**Distribution Channel:** Research conference, academic seminar, publication preparation  
**Audience:** Researchers, academics, clinician-scientists, peer reviewers  

**Copy this prompt into NotebookLM:**
```
Create a 20-minute academic overview of the RSS model's evidence base, 
mechanisms, and testability.

Cover:
1. Component evidence levels (Layer 1: Level I sleep RCTs; Layer 2: arousal/polyvagal 
   Level II-III; Layer 3: family psychoeducation RCTs, expressed emotion cohorts; 
   Layer 4: autonomy/identity development theory)
2. Effect sizes for individual components (sleep: NNT for relapse prevention; 
   family psychoeducation: NNT = 7; expressed emotion: OR = 4.87)
3. Integration hypothesis: the layer interaction principle as Level V evidence 
   (clinical consensus + convergent mechanism-level science, not yet tested as 
   integrated model)
4. Proposed randomized evaluation design for the integrated model (SMART trial, 
   primary outcomes: LOS, 30-day readmission, family engagement, restrictive 
   interventions)
5. Boundary conditions and failure modes: when does the model NOT work?
6. Disconfirmatory evidence: alternative models (Open Dialogue, DBT, Soteria, TCs) 
   and what RSS claims to add
7. Publication-ready evidence transparency: how the model handles gaps

Tone: rigorous, evidence-grounded, transparent about limitations and Level V evidence.
Include all citations. Duration: 19-21 minutes.

End with: "This model is clinically implemented, empirically testable, and 
awaiting direct randomized evaluation of integrated effect."
```

**Expected output characteristics:**
- All evidence levels cited
- Effect sizes provided
- Integration hypothesis clearly stated as Level V
- Proposed study design outlined
- Publication-ready language

---

### Prompt C2: "Layer Interaction Mechanisms: Neurobiology and Systems Theory"

**Output Type:** Audio Overview  
**Recommended Length:** 20 min  
**Source Segment:** RSSM_01_Foundation_Architecture (§3.3: Layer Interactions) + RSSM_03_Regulatory_Layer + Appendix G (Dyadic Physiological Processes)  
**Distribution Channel:** Neuroscience journal club, research seminar, systems medicine conference  
**Audience:** Neuroscientists, researchers, clinician-scientists, systems biologists  

**Copy this prompt into NotebookLM:**
```
Generate a 20-minute research-level overview of the mechanisms by which 
layer instability in one domain constrains or enables work in other domains.

Cover:
1. Downward constraints: how lower-layer instability blocks higher-layer interventions
   - Sleep deprivation → cortical prefrontal impairment → task failure even when 
     relational support is in place
   - Arousal dysregulation → threat perception → family dynamics become threat-driven
   - Relational rupture → neuroceptive threat → arousal escalation → circadian disruption
2. Upward scaffolding: how lower-layer stability enables higher-layer work
   - Sleep restoration → prefrontal access → insight work becomes possible
   - Co-regulation and environmental predictability → arousal reduction → 
     capacity for relational processing
   - Relational safety → reduced threat perception → autonomy and identity work possible
3. Bidirectional effects: how higher layers feed back on lower layers
   - Identity work → meaning restoration → motivation for sleep/circadian adherence
   - Functional success → mood elevation → sleep architecture improvement
4. Timing and temporal ordering: sequential vs. parallel engagement
5. Dyadic physiology: nervous system coupling, mirror neurons, vagal tone transmission 
   between clinician and patient, family members and identified patient
6. Measurement and documentation: how to capture layer-interaction effects in clinical notes
7. Mechanistic hypothesis: the thesis that ALL four layers operate simultaneously 
   but with varying intensity allocation

Reference: Porges, Schore, Coan, Seery, attachment theory, family systems theory, 
and computational neurobiology. Tone: rigorous, evidence-grounded.
Duration: 19-21 minutes.

Include: "Layer interaction is the testable hypothesis at the model's core."
```

**Expected output characteristics:**
- Neurobiology integrated with systems theory
- Mechanisms explained at multiple scales
- Measurement/documentation guidance
- Testable hypotheses identified

---

### Prompt C3: "Comparative Effectiveness: RSS vs. Alternative Models"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_01_Foundation_Architecture (§3.9: How RSS Relates to Other Models)  
**Distribution Channel:** Health policy forum, comparative effectiveness research conference  
**Audience:** Health services researchers, policymakers, clinical leaders  

**Copy this prompt into NotebookLM:**
```
Create a 15-minute research-focused comparison of the RSS model with other 
major inpatient psychosocial frameworks.

Cover:
1. Open Dialogue: strengths (speed of family engagement, low coercion), 
   limitations for acute crisis, resource requirements
2. DBT in inpatient settings: diary cards and structure vs. milieu-based 
   co-regulation; population fit (chronic suicidality)
3. Soteria: anti-psychiatry foundations, medication minimization, community model
4. Therapeutic Communities: hierarchy, peer structure, long-term vs. acute
5. What RSS claims to add: prioritized layer emphasis, biological integration, 
   testable mechanisms, transportability to standard settings
6. Hybrid approaches: can elements from each be integrated?
7. Comparative outcomes where available: readmission, restraint/seclusion, LOS
8. Implementation barriers: what makes each model challenging to deploy?

Tone: scholarly, comparative, non-partisan. Acknowledge strengths and limitations 
of each approach. Duration: 14-16 minutes.

Positioning: "The optimal model may depend on population, setting, and available 
resources. This comparative lens supports informed implementation choice."
```

**Expected output characteristics:**
- Fair treatment of alternative models
- Strengths and limitations both covered
- Implementation barriers addressed
- Evidence for comparative outcomes cited

---

### Prompt C4: "Population-Specific Adaptation: Research Implications"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_08_Population_Adaptations + §38 (Cross-Population Integration)  
**Distribution Channel:** Health disparities conference, population health seminar  
**Audience:** Public health researchers, health equity leaders, population health clinicians  

**Copy this prompt into NotebookLM:**
```
Generate a 15-minute research overview of how the RSS model adapts across 
eight distinct populations and what this suggests about model robustness.

Cover:
1. Geriatric: layer emphasis shifts (medication sensitivity, cognitive scaffolding priority)
2. Perinatal: attachment foundation, postpartum neurobiology, identity preservation
3. Dual diagnosis (MH + SUD): parallel engagement timelines, harm reduction integration
4. Pediatric: developmental stage, family as treatment primary vehicle
5. LGBTQ+: affirming environment as Layer 2 foundation, identity as safety signal
6. Forensic: structure and authority as therapeutic (vs. restraint), transparency 
   as boundary maintenance
7. Refugee: trauma context, cultural adaptation, safety reconstruction
8. IDD: scaffolding, communication adaptation, consent and autonomy
9. Cross-population principles: universals that hold across all eight populations

Include: research gaps, implementation challenges, hypothesized mechanisms 
by population. Tone: scholarly, population-centered, gaps-transparent.
Duration: 14-16 minutes.

End with: "Population adaptation suggests the model's core principle 
(layer emphasis) generalizes; effectiveness measurement needs population-specific 
outcomes."
```

**Expected output characteristics:**
- Each population covered briefly but substantively
- Commonalities identified across populations
- Research gaps named
- Health equity perspective integrated

---

## SECTION D: GENERAL AUDIENCE PROMPTS
## For broader reach, family education, and public health contexts

### Prompt D1: "When Usual Treatment Isn't Working: A New Framework"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_01_Foundation_Architecture + RSSM_07_Clinical_Applications  
**Distribution Channel:** Mental health podcast, public health website, family education  
**Audience:** Families, patients, community advocates, general clinicians  

**Copy this prompt into NotebookLM:**
```
Create a 10-minute audio overview for families and patients whose usual psychiatric 
treatment isn't working or is making things worse.

Focus on:
1. When treatment fails, it's often an emphasis problem, not an effort problem
2. Four domains that matter equally: sleep, rhythm/environment, relationships, engagement
3. If one domain is wobbly, the others can't bear weight
4. The clinician's job is to ask: which domain needs the most help right now?
5. One family story: "We tried family therapy, but nothing shifted until we addressed 
   sleep. Then everything became possible."
6. What families can do: ask about all four domains, notice which one clinicians 
   are ignoring

Language: accessible, non-jargon, empowering without being dismissive of 
clinicians. Tone: hopeful, practical. Duration: 9-11 minutes.

End with: "Better treatment is often not more treatment; it's treatment that 
addresses what's actually unstable right now."
```

**Expected output characteristics:**
- No clinical jargon
- Family perspective honored
- Empowerment without blame
- Practical action items for families

---

### Prompt D2: "Sleep as Mental Health Foundation"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_02_Biological_Layer  
**Distribution Channel:** Mental health awareness campaign, family education website, general podcast  
**Audience:** General public, families, patients, community health workers  

**Copy this prompt into NotebookLM:**
```
Generate a 10-minute public health audio overview on sleep as a mental health 
foundation.

Focus on:
1. Sleep isn't optional; it's a treatment mechanism
2. When sleep gets bad, psychiatric symptoms get worse (not just fatigue, but mood, 
   thinking, impulse control)
3. Clinicians often overlook sleep because it seems obvious
4. Three things that help: daylight exposure (midday is best), consistent schedule, 
   dark bedroom at night
5. One patient story: "When I started sleeping better, my whole world shifted"
6. What to ask your doctor: "Is my sleep stable enough for other treatments to work?"

Language: warm, accessible, non-technical. Tone: educational and normalizing.
Duration: 9-11 minutes.

Include practical tips families can use immediately. End with: "Sleep is medicine. 
If sleep is bad, psychiatry should address it first."
```

**Expected output characteristics:**
- Practical, immediately useful tips
- No jargon
- Patient perspective centered
- Sleep positioned as leverage point

---

### Prompt D3: "Family as Healer, Not Burden"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_04_Relational_Layer  
**Distribution Channel:** Family support podcast, NAMI-affiliated content, community health site  
**Audience:** Family members, patients, community advocates  

**Copy this prompt into NotebookLM:**
```
Create a 10-minute audio for family members about their role as healer (not burden) 
in psychiatric recovery.

Focus on:
1. Family isn't the problem; family is the solution (when structured right)
2. Families are dysregulated because they're scared, not because they're broken
3. When clinicians help families calm down, patients improve faster
4. What healthy family involvement looks like: presence, consistency, clarity
5. One family story: transformation from "hovering and controlling" to "present 
   and stable"
6. What clinicians should offer: family psychoeducation, not blame; support, not judgment
7. What families should ask: "How do we participate in treatment in healthy ways?"

Language: non-stigmatizing, dignity-centered, strength-focused. Tone: warm, 
validating. Duration: 9-11 minutes.

Positioning: "Family participation saves lives. Clinicians who engage family 
well see better outcomes."
```

**Expected output characteristics:**
- Family dignity centered
- Blame actively reversed
- Practical family behaviors named
- Clinician responsibility clarified

---

### Prompt D4: "Getting Unstuck: When Recovery Isn't Happening"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_07_Clinical_Applications (§29.2: Chronic Instability and Repeated Admissions) + §28 (Failure Modes & Recovery Guide)  
**Distribution Channel:** Support group podcast, patient education site, community mental health  
**Audience:** Patients, families, community health advocates  

**Copy this prompt into NotebookLM:**
```
Generate a 10-minute audio overview for people who feel stuck in psychiatric crisis 
or chronic instability.

Focus on:
1. Feeling stuck usually means something foundational hasn't stabilized yet
2. Four foundations that matter: biological (sleep), environmental (rhythm/safety), 
   relational (trust/consistency), engagement (purpose/meaningful activity)
3. If recovery feels impossible, ask: which foundation is most shaky?
4. What recovery *can* look like: gradual, supported, with setbacks
5. Three stories: acute crisis recovery, chronic instability breakthrough, 
   family-enabled transformation
6. What to ask your clinical team: "Which foundation should we focus on right now?"
7. Red flags: treatment getting busier but nothing improving (emphasis problem)

Language: hopeful without false promises, realistic about complexity. 
Tone: companionable, practical. Duration: 9-11 minutes.

End with: "Feeling stuck doesn't mean treatment doesn't work. It usually means 
treatment needs to shift focus."
```

**Expected output characteristics:**
- Realistic hope
- Pattern recognition provided
- Agency-supporting framing
- Multiple recovery trajectories shown

---

### Prompt D5: "Building Stability: A Practical Guide for Families"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_03_Regulatory_Layer + RSSM_06_Implementation_Operations (Daily Rhythm and Environmental Design)  
**Distribution Channel:** Family support website, practical health podcast, community education  
**Audience:** Families, patients, residential staff, support people  

**Copy this prompt into NotebookLM:**
```
Create a 10-minute practical audio guide for families on building psychiatric 
stability at home.

Focus on:
1. Predictability is medicine: consistent schedules, routines, expectations
2. Sensory environment matters: reduce sudden noise, bright lights, chaos
3. Presence is treatment: be there without trying to "fix"
4. Clear roles and boundaries: everyone knows what they're responsible for
5. Five practical changes families can make immediately:
   - Establish sleep schedule (same bedtime, dark room)
   - Morning daylight exposure (15 min, no sunglasses)
   - One family meal together daily
   - Clear daily rhythm (wake, meals, activity, sleep)
   - No surprise schedule changes
6. How to know it's working: patient calmer, sleeping better, fewer incidents

Language: practical, encouraging, non-blaming. Tone: warm guide, not expert 
lecturing. Duration: 9-11 minutes.

Include: "Stability built at home is just as important as medication. 
Families can provide it."
```

**Expected output characteristics:**
- Immediately actionable steps
- No special equipment needed
- Family empowerment centered
- Success markers clarified

---

## SECTION E: SPECIAL-PURPOSE PROMPTS
## For unique contexts and specialized distributions

### Prompt E1: "RSSM for Program Leaders: Implementation Roadmap"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_01_Foundation_Architecture + RSSM_06_Implementation_Operations  
**Distribution Channel:** Leadership conference, administrative training, implementation consulting  
**Audience:** Program directors, unit managers, hospital leaders, system administrators  

**Copy this prompt into NotebookLM:**
```
Generate a 15-minute administrative overview for program leaders implementing RSS.

Cover:
1. Core principle: layer emphasis determines clinical effectiveness and outcomes
2. Operational implications: daily rhythm design, team role clarity, family integration 
   protocols
3. Outcome shifts to expect: LOS, readmission, restraint/seclusion, family engagement, 
   staff burnout
4. Implementation barriers and solutions:
   - Staff skepticism → education on layer mechanism
   - Medication-centered culture → balance with milieu (both required)
   - Family resistance → psychoeducation on co-regulation
   - Resource constraints → minimum viable RSS model available
5. Data collection: what to measure? (pilot study outcomes listed)
6. Staff training roadmap: orientation, layer education, clinical application, 
   supervision
7. Timeline: realistic implementation phasing

Tone: leadership-focused, practical, outcome-oriented. Include ROI considerations 
and evidence base. Duration: 14-16 minutes.

End with: "RSS implementation requires cultural shift but produces measurable 
outcome improvement."
```

**Expected output characteristics:**
- Administrative language and framing
- Implementation barriers addressed
- Outcome expectations set
- Resource considerations included

---

### Prompt E2: "RSSM in Substance Use Disorder: Layer Integration"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_02_Biological_Layer (§6: Substances and Physiological Load) + RSSM_01_Foundation_Architecture (§3.8: Substance Use Case)  
**Distribution Channel:** Addiction medicine conference, dual diagnosis training, substance use specialist education  
**Audience:** Addiction psychiatrists, substance use counselors, dual diagnosis specialists  

**Copy this prompt into NotebookLM:**
```
Create a 15-minute clinical education module on RSS application to substance use 
disorder (SUD) in the context of concurrent psychiatric illness.

Cover:
1. SUD and psychiatric illness modify layer engagement timelines
2. Physiological load: how active use/withdrawal disrupts all four layers simultaneously
3. Neurobiological timelines for SUD: acute withdrawal (days), protracted withdrawal 
   (weeks/months), reward system recalibration (months/years)
4. Layer 1 (biological): managing withdrawal, stabilizing sleep/circadian during 
   acute phase, addressing PAWS
5. Layer 2 (regulatory): structure and environmental predictability as craving management
6. Layer 3 (relational): therapeutic alliance rupture risk, family support for harm 
   reduction vs. abstinence
7. Layer 4 (functional): delayed functional recovery; meaning-making around substance 
   role in identity
8. Concurrent vs. sequential engagement: why both happen simultaneously in SUD
9. One detailed case: dual diagnosis (bipolar + alcohol use) showing layer integration 
   during first 90 days

Reference: withdrawal timeline science, reward circuitry, harm reduction principles, 
family impact research. Tone: evidence-grounded, non-judgmental.
Duration: 14-16 minutes.

Include: "SUD and psychiatric illness are intertwined layers; both require 
simultaneous engagement."
```

**Expected output characteristics:**
- Neurobiological specificity
- Harm reduction framework integrated
- Concurrent vs. sequential explained
- Withdrawal timelines clarified

---

### Prompt E3: "RSSM and Perinatal Psychiatry: Mother, Baby, Family"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_08_Population_Adaptations (§31: Perinatal) + RSSM_04_Relational_Layer  
**Distribution Channel:** OB/GYN education, perinatal psychiatry conference, women's health CME  
**Audience:** Obstetricians, perinatologists, perinatal mental health specialists, midwives  

**Copy this prompt into NotebookLM:**
```
Generate a 15-minute clinical education module on RSS application to perinatal 
psychiatry (pregnancy, postpartum, postpartum psychosis).

Cover:
1. Perinatal vulnerability: sleep disruption, hormonal change, identity shift, 
   attachment formation
2. Layer 1 (biological): pregnancy-related sleep changes, postpartum circadian 
   disruption, lactation impact on sleep
3. Layer 2 (regulatory): environmental and relational predictability as 
   attachment foundation
4. Layer 3 (relational): mother-baby dyadic regulation, partner role, clinical 
   alliance in context of motherhood
5. Layer 4 (functional): identity integration (woman/mother/clinician), postpartum 
   recovery timeline, meaning-making
6. Special urgency: postpartum psychosis as psychiatric emergency; RSS-structured 
   mother-baby dyad stabilization
7. Family involvement: partner as co-regulator, extended family support, 
   peer support role
8. One detailed case: postpartum depression with treatment resistance, 
   transformed by layer-based approach

Include: attachment neurobiology, lactation and medication, reproductive psychiatric 
ethics. Tone: maternal-centered, women-affirming, evidence-grounded.
Duration: 14-16 minutes.

Positioning: "Perinatal psychiatry is dyadic psychiatry. The mother-baby 
stabilization happens together."
```

**Expected output characteristics:**
- Mother-baby dyad centered
- Pregnancy/postpartum biology integrated
- Attachment neurobiology included
- Women's healthcare perspective

---

## DEPLOYMENT GUIDE

### Audio Overview Setup
1. Load NotebookLM notebook segment (see "Source Segment" in each prompt)
2. Open the "Audio Overview" feature
3. Copy the full prompt (everything from "Copy this prompt" onward)
4. Paste into NotebookLM chat
5. Adjust length recommendation if needed (5/10/15/20 min)
6. Click "Generate"
7. Wait for audio generation (typically 2-5 minutes per segment)

### Video Overview Setup (if available)
1. Same as Audio Overview but select "Video Overview" feature
2. NotebookLM may auto-generate visual elements or allow you to suggest them
3. Specify visual descriptions in prompt if needed (see prompts A4 and others with visual notes)

### Content Use & Licensing
- **Internal use:** All prompts are ready for internal training, CME delivery, staff orientation
- **Publication/distribution:** Confirm with Josh Moss before external sharing or podcast distribution
- **Citation:** If using, cite as "RSSM Audiobook Audio Overview, generated via NotebookLM, Moss 2026"
- **Modification:** You may modify prompts for specific audience/context but maintain accuracy

### Quality Assurance Checklist Before Distribution
- [ ] Audio is clear and professional in tone
- [ ] Clinical content is accurate and evidence-cited (not hallucinated)
- [ ] Duration matches recommendation (within 1-2 minutes acceptable)
- [ ] Audience-appropriate language used (no jargon for general audience; sufficient depth for clinical)
- [ ] No discontinuities or repetitions
- [ ] Visuals (if video overview) align with narration

---

## Next Steps

1. **Select prompts** most relevant to your distribution channels
2. **Load RSSM notebook segments** to NotebookLM in this order: Segment 1, 2, 3, 4, 5, 6, 7, 8
3. **Generate Audio Overviews** using the prompts above
4. **QA each output** for accuracy and tone
5. **Distribute** via designated channels (podcast, CME platform, YouTube, etc.)
6. **Gather feedback** on content quality and clinical accuracy
7. **Iterate** based on audience response

---

**Document prepared for:** Josh Moss, MD — ReConnect Psychiatry System  
**Document status:** Ready for NotebookLM deployment  
**Last updated:** April 2026  
**Questions:** Contact Claude Cowork for prompt refinement or custom prompt creation
