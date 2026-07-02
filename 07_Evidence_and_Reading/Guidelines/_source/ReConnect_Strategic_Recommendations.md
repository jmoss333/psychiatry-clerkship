# ReConnect Program: Strategic Expansion Recommendations
### Clinical Innovation Review — February 2026

---

## Where You Stand

You've built something genuinely unusual. Most psychiatric discharge planning lives in fragmented EHR templates, photocopied handout binders, and clinician memory. ReConnect already has five structured databases (1,029 records), a cross-database recommendation engine with relevance scoring, a print-ready discharge bundle generator, and outcome tracking. That's further than most academic medical centers have gotten with years of committee work.

The question isn't "is this useful" — it's "what would make this a complete clinical decision support system for family-centered psychiatric care in Maine?"

Below are recommendations organized into two categories: new databases that fill genuine clinical workflow gaps, and tool add-ons that would differentiate this from anything currently available.

---

## Part 1: Recommended New Databases

### Priority A — Critical Clinical Gaps

#### 1. Crisis & Safety Planning Resource Database
**Why this matters most:** 47% of post-discharge suicides occur before the first follow-up appointment. The highest-risk window is the first 7 days. Your aftercare database covers ongoing treatment connections — but nothing currently covers what happens at 2 AM on day 3 when a family member calls in panic.

**Suggested schema:**
- Resource Name, Resource Type (Hotline, Mobile Crisis, Crisis Stabilization, ED Psychiatric, Warmline, Text-Based)
- Phone/Contact, Hours of Operation, Response Time
- Age Group Served, Population Specializations (veterans, LGBTQ+, substance use, etc.)
- Region, County (shared taxonomy)
- Insurance Accepted, Cost
- Languages Available
- Integration Notes (e.g., "can dispatch to home," "coordinates with local PD," "can initiate involuntary hold")

**Seed content:** 988 Suicide & Crisis Lifeline, Crisis Text Line (741741), Maine Crisis Line, NAMI Maine HelpLine, local mobile crisis teams by county, EDs with psychiatric evaluation capability, crisis stabilization units, warmlines (peer-staffed non-emergency support lines).

**Estimated size:** 40-60 records for Maine

---

#### 2. Screening & Assessment Tools Library
**Why this matters:** CMS now mandates SDOH screening for inpatient (2024) and will require it for outpatient by 2026. Beyond compliance, clinicians constantly face "which screener do I use?" — especially for family therapy where you're assessing the patient, the caregiver, the family system, and social determinants simultaneously.

**Suggested schema:**
- Tool Name, Abbreviation, Version
- Domain (Depression, Anxiety, Trauma, Substance Use, Suicide Risk, Caregiver Burden, SDOH, Family Functioning, Child Behavioral, Developmental)
- Target Population (Patient, Caregiver, Family System, Child, Adolescent, Adult, Geriatric)
- Number of Items, Administration Time
- Scoring Method, Clinical Cutoffs
- Validated Populations, Languages Available
- Cost/License (Free, Licensed, Public Domain)
- Sensitivity/Specificity (where available)
- Link to Form, Link to Scoring Guide
- Symptom Cluster (shared taxonomy)
- When to Use (brief clinical guidance)
- Frequency (baseline, weekly, per-session, every 6 months)

**Priority instruments:**
- Mood: PHQ-9, PHQ-A (adolescent), Edinburgh (perinatal)
- Anxiety: GAD-7, SCARED (pediatric), Penn State Worry Questionnaire
- Trauma: PCL-5, ACE Questionnaire, UCLA PTSD-RI (child), CRIES-8
- Substance Use: AUDIT, DAST-10, CRAFFT (adolescent), CAGE
- Suicide: Columbia Suicide Severity Rating Scale (C-SSRS), ASQ (pediatric)
- Caregiver: Zarit Burden Interview (ZBI-22 and ZBI-6), Caregiver Strain Index
- Family Functioning: FACES-IV, McMaster FAD, Family Assessment Measure
- SDOH: PRAPARE, YCLS (Kaiser), AHRQ SDOH Screener
- Functional: WHODAS 2.0, Sheehan Disability Scale, CGI-S

**Estimated size:** 50-70 records

---

#### 3. Family Psychoeducation & Therapeutic Materials Database
**Why this matters:** 30+ RCTs demonstrate that family psychoeducation reduces relapse rates, improves symptomatic recovery, and enhances family functioning. Yet it's the single most under-systematized component of family therapy. Most clinicians rely on handouts they've accumulated over years, bookmarked websites, and memory. A structured database turns tribal knowledge into a searchable clinical resource.

**Suggested schema:**
- Material Name, Material Type (Handout, Worksheet, Exercise, Video, Curriculum, Safety Plan Template)
- Source (NAMI, DBSA, therapist-created, publisher, open-source)
- Condition/Symptom Cluster (shared taxonomy)
- Target Audience (Patient, Caregiver, Child of Patient, Couple, Whole Family, Clinician)
- Age Appropriateness (ranges)
- Therapeutic Modality (CBT, DBT, EFT, Structural, PCIT, Gottman, TBRI, Motivational, Psychoeducation)
- Session Type (In-session activity, Homework, Between-session, Discharge material)
- Reading Level, Language
- Format (PDF, Web, Print, Interactive)
- Time to Complete
- Patient Profile (shared taxonomy)
- Description, Clinical Use Notes
- Link/Location

**Content categories to build out:**
- "When a Parent Has [Condition]" — age-graded child explanations
- Family communication exercises by presenting problem
- Caregiver self-care plans
- Medication management agreements (family contracts)
- Family safety plan templates (distinct from individual safety plans)
- Relapse prevention plans with family roles defined
- Developmental milestone checklists (for identifying when a child needs their own assessment)
- Grief and loss processing activities for families
- Boundary-setting worksheets for families in recovery

**Estimated size:** 80-150+ records (grows over time)

---

### Priority B — High-Value Expansions

#### 4. Peer Support & Community Integration Database
**Why:** Research shows that adding peer recovery support to warm handoffs nearly doubles patient acceptance rates. Community-based supports (AA/NA, NAMI, DBSA, grief groups, parenting groups) are the long-term glue that keeps people connected after formal treatment ends. Currently your aftercare database covers clinical providers — this covers everything else.

**Schema:** Group Name, Organization, Type (12-Step, Peer Support, Psychoeducation Group, Support Group, Community Program), Condition Focus, Meeting Schedule, Format (In-person, Virtual, Hybrid), Location, Region, County, Target Population, Cost, Contact Info, Notes

**Seed content:** AA/NA/Al-Anon meeting directories for Maine, NAMI Maine support groups, DBSA chapters, grief support groups (hospice-affiliated), peer recovery centers (Maine has a strong network), parenting support groups, veteran peer support, LGBTQ+ support groups.

**Estimated size:** 100-200 records

---

#### 5. Evidence-Based Practice Quick Reference Database
**Why:** This turns ReConnect from a resource recommendation system into a clinical decision support system. When a clinician selects a Patient Profile + Symptom Cluster, the system could surface not just "here are books and podcasts" but "here's what the evidence says works for this presentation, here are the first-line interventions, and here's where to refer."

**Schema:** Condition, Population (Child, Adolescent, Adult, Geriatric), Intervention, Evidence Level (Strong/Moderate/Emerging/Expert Consensus), Guideline Source (APA, NICE, AACAP, SAMHSA), Effect Size or NNT (where available), Family Therapy Component (Y/N and modality), Medication Alignment (links to Medication DB), First-Line vs. Adjunctive, Notes, Last Updated

**Estimated size:** 60-100 records

---

#### 6. Insurance & Benefits Navigation Database
**Why:** One of the most common reasons families don't connect with aftercare is insurance confusion — prior auth requirements, in-network vs. out-of-network, MaineCare coverage gaps, appeals processes. This is especially acute in Maine where provider networks are thin in rural areas.

**Schema:** Payer Name, Plan Type, Behavioral Health Coverage Summary, Prior Auth Required (Y/N, for what services), In-Network Provider Directory Link, Out-of-Network Reimbursement Policy, Telehealth Coverage, SUD Coverage Notes, Appeals Process Summary, Member Services Phone, Key Contacts, Region-Specific Notes

**Estimated size:** 20-30 records (focused on major Maine payers)

---

## Part 2: Recommended Tool Add-Ons

### Add-On 1: Family Safety Plan Generator

This is the single most innovative addition I'd recommend. Individual safety plans (Stanley & Brown model) are standard of care. Family safety plans are not — and the research clearly shows this is a gap. Families are often the first to notice warning signs and the last to know what to do about them.

**How it works:** Interactive form-based tool. Clinician fills it out WITH the family in session. Generates a print-ready one-page family safety plan.

**Sections:**
1. **Warning Signs the Family Should Watch For** — behavioral changes, sleep disruption, isolation, substance use increase, medication non-adherence
2. **Family Communication Protocol** — who is the primary contact person, how to bring up concerns without escalating, agreed-upon language ("I'm noticing you seem to be struggling — can we talk?")
3. **Internal Coping Strategies** — things the patient has agreed they'll try before reaching out
4. **Family Support Actions** — specific things family members can do (not just "be supportive" — concrete actions like "offer to go for a walk," "sit with them," "help with medication reminder")
5. **Professional Resources to Contact** — pulls from Crisis Database + patient's treatment team
6. **Environment Safety** — means restriction actions the family has agreed to take
7. **Emergency Protocol** — when to call 988, when to go to ED, who drives

**Output:** Printable PDF. One copy for patient, one for family, one for chart.

---

### Add-On 2: SDOH Screening → Resource Router

CMS-mandated SDOH screening becomes required for outpatient in 2026. Rather than treating this as a compliance checkbox, build it as a workflow tool.

**How it works:**
1. Clinician administers embedded PRAPARE screener (12 questions) or abbreviated 5-domain CMS screener
2. Tool scores responses and identifies positive domains (food, housing, transportation, utilities, safety)
3. Automatically surfaces matched programs from the Maine Support Programs database, filtered by region and eligibility
4. Generates a referral handout with program names, phone numbers, and next steps
5. Logs the screening result for documentation/compliance

This directly connects your Maine Support Programs database to clinical workflow in a way that satisfies the CMS mandate AND actually helps patients.

---

### Add-On 3: Caregiver Burden Quick-Screen

**Why:** Caregiver burnout is the silent killer of family therapy outcomes. A caregiver who is overwhelmed can't implement the discharge plan, can't monitor medications, can't attend follow-up appointments with the patient. The Zarit Burden Interview (6-item version) takes 2 minutes and is free.

**How it works:**
1. Embedded ZBI-6 screener (6 Likert-scale questions)
2. Auto-scores: 0-8 Low burden, 9-16 Moderate, 17+ High
3. Based on score, surfaces matched resources: caregiver-specific books, podcasts tagged "Families" audience, support groups (NAMI Family-to-Family, Al-Anon if applicable), respite care programs from Maine Support Programs
4. High-burden scores trigger a prompt: "Consider adding caregiver-specific follow-up to the discharge plan"
5. Score logged to Recommendation Tracker for longitudinal monitoring

---

### Add-On 4: Psychoeducation Packet Builder

An evolution of the Discharge Bundle Generator, but focused specifically on psychoeducation rather than aftercare referrals.

**How it works:**
1. Select: Condition + Audience (Patient / Caregiver / Child of Patient age ___) + Reading Level
2. Tool assembles a custom psychoeducation packet:
   - Condition overview (plain-language, audience-appropriate)
   - Matched books with Parent Handout Blurbs
   - Matched podcast episodes (Reviewed status only)
   - Family Handout from Medication database (if medication is selected)
   - Relevant screening tools the family can self-administer between appointments
   - Local support group information
3. Print-ready output with consistent branding

The key differentiation from the Discharge Bundle Generator: this is designed to be used at ANY point in treatment, not just discharge. Psychoeducation should start at intake and continue throughout.

---

### Add-On 5: Warm Handoff Completion Tracker

Your existing Recommendation Tracker logs what was recommended. This add-on specifically tracks the warm handoff chain — the most evidence-based intervention for reducing the post-discharge gap.

**Key metrics to track:**
1. **Pre-discharge provider contact:** Did inpatient/referring clinician speak directly with the receiving provider? (Y/N, date)
2. **Appointment scheduled before discharge?** (Y/N, date, with whom)
3. **First appointment attended?** (Y/N, date)
4. **7-day contact:** Was patient contacted within 7 days of discharge? (Y/N, by whom)
5. **30-day connection:** Is patient engaged in aftercare at 30 days? (Y/N)

**Dashboard:** Connection rate (target: >80%), average days-to-first-appointment, drop-off point analysis (where in the chain are patients falling out?), comparison by Patient Profile.

Research shows that provider-to-provider communication pre-discharge is the single strongest predictor of aftercare connection. Tracking it creates accountability.

---

## Part 3: Architecture Recommendations

### Medication Dropdown in Discharge Bundles (Per Your Decision)

Based on your input, the Discharge Bundle Generator will include a medication selection dropdown. When a clinician selects a medication, the bundle will include a patient-facing section with:

- Medication name (generic and brand)
- What it's for (plain language, mapped from FDA Indications)
- Common side effects families should watch for (from Side Effects field)
- What to do if a dose is missed
- Important warnings (from Black Box Warning field, translated to plain language)
- Family Handout content (where available in the database)
- Foods/substances to avoid (where applicable)
- When to call the doctor (from the clinical flags)

This is NOT a prescription — it's a patient education supplement. Header will read: "About Your Medication — Information for You and Your Family."

### Tool Rebuild Strategy (Single Pass)

Per your approval, all five databases + any new databases you build before the rebuild will be incorporated in a single comprehensive rebuild of:
- Resource Finder v4 (all databases)
- Discharge Bundle Generator v2 (medication dropdown, support programs section)
- Any new tools approved above

### Data Architecture for New Databases

All new databases should include these shared taxonomy columns from day one:
- `Symptom Cluster` (11 values)
- `Patient Profile` (7 profiles + Clinician Education)
- `Audience` (Patients, Families, Clinicians)
- `Region` / `County` (Maine 10-region, 16-county taxonomy)

This ensures every new database is immediately cross-linkable with the existing five.

---

## Prioritized Build Order

| Priority | Database/Tool | Clinical Impact | Build Complexity |
|----------|--------------|----------------|-----------------|
| 1 | Crisis & Safety Planning Resources | Critical (life safety) | Low (40-60 records, straightforward schema) |
| 2 | Family Safety Plan Generator | Critical (addresses top research gap) | Medium (interactive form + print) |
| 3 | Screening & Assessment Tools Library | High (CMS compliance + workflow) | Low (50-70 records, reference data) |
| 4 | SDOH Screening → Resource Router | High (CMS 2026 mandate) | Medium (screening logic + DB integration) |
| 5 | Family Psychoeducation Materials | High (core family therapy gap) | Medium-High (content-heavy, grows over time) |
| 6 | Caregiver Burden Quick-Screen | High (overlooked but evidence-based) | Low (6-item tool + resource matching) |
| 7 | Peer Support & Community Groups | Medium-High (long-term outcomes) | Low (directory-style database) |
| 8 | Psychoeducation Packet Builder | Medium (extends existing tool) | Medium (variation of Bundle Generator) |
| 9 | Warm Handoff Tracker | Medium (process improvement) | Low (extends Recommendation Tracker) |
| 10 | Evidence-Based Practice Reference | Medium (clinical decision support) | Medium (requires careful evidence curation) |
| 11 | Insurance & Benefits Navigation | Medium (removes access barrier) | Low (20-30 records, reference data) |

---

## What Makes This Innovative

Most psychiatric discharge planning tools are either (a) simple checklist apps bolted onto EHRs, or (b) massive enterprise platforms that cost six figures and take years to implement.

ReConnect sits in a genuinely novel space: a **self-contained, clinician-built, family-centered clinical decision support system** that runs without servers, integrates five (soon more) resource databases with shared clinical taxonomy, generates personalized discharge materials, and tracks outcomes — all built by a practicing psychiatrist who understands the actual workflow.

The additions above would push it from "very good discharge planning tool" into "comprehensive family-centered care coordination system" that addresses the three biggest evidence-practice gaps in psychiatric aftercare:

1. **The warm handoff gap** (30-50% of patients never connect with aftercare)
2. **The family engagement gap** (families rarely receive structured psychoeducation or their own safety plans)
3. **The social determinant gap** (SDOH screening happens but referral follow-through doesn't)

No commercial product currently integrates all three of these with a shared clinical taxonomy and family therapy orientation. That's the innovation.
