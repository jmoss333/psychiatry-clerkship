DRAFT — NOT APPROVED. NO DATA MAY BE COLLECTED UNDER THIS PROTOCOL UNTIL AN IRB OR QI
DETERMINATION IS ON FILE (see `irb_qi_determination_request_draft.md` beside this file).

# Program evaluation protocol: Psychiatry Clerkship Library (MS3)

- **Work package:** WP-17 (curriculum-architecture remediation handoff, 2026-09-24), step 3.
- **Owner:** Joshua Moss, MD. Drafted by an AI assistant for his review; every judgement here is
  his to confirm, change or reject.
- **Scope:** the six-week MS3 inpatient psychiatry clerkship that uses the library
  (`une-ms3-psychiatry`). The resident site is out of scope for this version.
- **Status:** draft. It creates no obligation and authorizes nothing.
- **Predecessor:** Josh's July draft, `docs/_planning/CURRICULUM_EVALUATION_PROTOCOL_2026-07-04.md`,
  exists only in his local checkout (`docs/_planning/` is in the shared `.git/info/exclude`, so it
  was never committed). This draft builds on it rather than replacing it silently; §11 lists what
  carries forward and what changes. Merge the two, or retire the July one, before submission.

## 1. Why evaluate, and for whom

The library is being readied for dissemination (MedEdPORTAL, ADMSEP) and for accreditation
review. Both audiences ask the same question: what did learners gain, and how do we know? The
repository can already show that its content is governed and attested. It cannot yet show any
effect on learners. This protocol is the plan for producing that evidence without breaking the
library's privacy design (§7).

**Accreditation note to confirm.** UNE COM is an osteopathic school, so its accreditor is the
AOA Commission on Osteopathic College Accreditation (COCA). The LCME elements cited in the
handoff (6.1, 6.2, 8.6, 8.7, 9.4, 9.5, 9.7, 9.8) bind MD programs. Decide which set the
dissemination package should cite, or whether it should cite both.

## 2. Evaluation questions

The protocol uses Kirkpatrick's four-level model and stops at Level 3. Level 4 (patient
outcomes) is out of reach for a six-week clerkship with 4-10 students per block, and no plan
here pretends otherwise.

| Level | Question | Primary measure | Where the data live |
| --- | --- | --- | --- |
| 1. Reaction | Do students find the library usable and worth their time, and which parts? | End-of-clerkship anonymous survey; one focus group per term | Institutional survey platform; custodian's storage |
| 2. Learning | Does knowledge rise across the clerkship? | Consented pre/post knowledge measure (§4) | Learner-held export, submitted to the custodian |
| 3. Behaviour | Do simulated skills show up on the ward? | OSCE scores (§5.1); the Sim-to-Ward pairing study (§5.2) | Rater forms and the school's evaluation system |

**Framework alignment.** Each measure is reported against the Foundational Competencies for
UME (six competencies) and the ADMSEP Clinical Learning Objectives Guide (four Units), both
registered in `standards.json` since this PR. The link from each clerkship objective to a Core
EPA and a Foundational Competency is in
`13_Faculty_Resources/Assessment/clerkship_objectives.md` (WP-3). Reporting stays at the
competency level: with 4-10 students per block, subcompetency-level cells would be too small
to report (§6).

## 3. Level 1: reaction

- **Survey.** Anonymous and optional, completed in the last week of the block on the
  institution's survey platform with identity collection switched off. Items are written for
  this study (no borrowed instrument, per the library's instrument-reproduction rule). Content:
  overall usefulness; the three most and least useful surfaces; the Days 1-3 core; the Interview
  Room; the midpoint feedback conversation; time spent per week (banded); any free text.
  Free-text fields carry a prompt not to name patients, staff or classmates.
- **Focus group.** One per term, run by someone who does not grade the participants, recorded
  only as notes with no names. The review behind this handoff asked for student focus-group
  data before dissemination.
- **Usage counters (context only).** When `CLERKSHIP_ANALYTICS` is enabled for a site (off by
  default; enabling it is the repository owner's call), the metrics site holds integer counters
  per page and tool step, per ISO week. They show what was opened, not by whom, and cells below
  n = 5 are suppressed. They are never linked to any other measure.

## 4. Level 2: consented pre/post knowledge measurement

### 4.1 What already exists

The diagnostic pretest from `13_Faculty_Resources/SPEC_diagnostic-pretest-personalized-path.md`
has shipped as the **"2-minute placement"**:

- 12 attested question-bank items, one per internal blueprint category, chosen at build time
  by a deterministic rule (`build_deploy.py` writes `pretest_pool.json`);
- results kept only in the learner's browser (`cw_pretest_v1`);
- the Progress view's optional **"Export my anonymous progress"** button, which downloads a JSON
  file to the learner's own device. The file carries a random study ID (`cw_study_id`), the
  placement result, practice records and dates, and no name.

Nothing is transmitted. A learner who does nothing contributes nothing.

### 4.2 Why it is not yet a pre/post measure

Recorded here so no one reports it as one by accident:

1. **Twelve items** are too few for a reliable individual score. The spec calls the result a
   "starting estimate", and that is what it is.
2. **Same items twice.** The pool is fixed per build, so a Week 6 retake shows the same 12
   items. Any gain mixes learning with memory of the items.
3. **Exposure.** Placement items are ordinary bank items, so a student can practise the exact
   items between the two sittings.
4. **Pairing depends on the browser.** The study ID lives in one browser's storage. A new
   device or cleared storage breaks the pre/post link.

### 4.3 Proposed design

- **Phase A (feasibility, first determined cohort).** Use the placement as shipped. Ask
  consenting students to export after the Day 1 placement and again after a Week 6 retake.
  Report only feasibility: consent rate, export completion, pairing success. Report no
  knowledge-gain claim.
- **Phase B (the real measure; a decision for Josh).** Two parallel forms, each about 24
  attested items sampled to the subject-exam blueprint, **held out of the practice pool** and
  counterbalanced across students. This needs question-bank work, and every
  `question_bank.json` edit belongs to another workstream. It is listed here as a dependency,
  not scheduled.
- **Distal measure.** The COMAT Clinical Psychiatry score (UNE COM) is held by the school. It
  enters the evaluation only as a de-identified cohort aggregate, or through linkage done by the
  school's own evaluation office with the student's consent. It never enters this repository.
- **Consent.** Opt-in, collected by someone other than the grading preceptor. It states that
  taking part or declining has no effect on grades, and that the preceptor will not see
  individual research data until final grades are submitted.
- **Submission.** The student uploads the exported file to [institution survey or file-request
  platform, identity collection off]. Files go to the data custodian (§8), who holds them on
  [institutional storage]. Files are never emailed to the grading preceptor.

## 5. Level 3: behaviour

### 5.1 OSCE score capture, outside this repository

The formative six-station OSCE (`14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md`:
suicide assessment with collateral, capacity, catatonia, alcohol withdrawal, family-meeting
agenda, oral presentation) is supplied by the library. **Its scores are not.** Raters score on
paper or in [the school's assessment system]. The custodian receives a de-identified extract,
keyed by study ID where the student consented to linkage and otherwise unlinked. Reporting
uses station-level aggregates only. No score, rater comment or roster ever lands in git.

### 5.2 Sim-to-Ward encounter-card pairing study

Design from the curriculum architecture review (§10, "Sim-to-Ward Entrustment Loop"),
instruments from WP-3.

- **Pairs.** Each simulated encounter is paired with the ward skill it rehearses: Dana (direct
  suicide inquiry), Ray (psychosis admission interview), Marcus (mania), Morgan (motivational
  interviewing), and the family meeting. The adopted six-week spine places them on Days 1-3
  and in Weeks 1, 2, 3 and 5.
- **Encounter card.** After the Interview Room encounter, the student copies the coverage
  summary the tool shows on screen (for each element, covered or not) onto a one-page card, on
  paper or in the school's system. The card names the simulated case and the skill. It carries
  no transcript, and nothing about any real patient. The Interview Room keeps transcripts in
  the student's browser. Its proxy logs metadata only (`sp-proxy/README.md`), and the study
  asks nothing of it.
- **Ward observation.** Within about 48 hours the student performs the same skill on the ward.
  The preceptor observes and signs the matching direct-observation card from WP-3 (a sign-off
  of about 5 minutes).
- **Recorded per pair:** skill, simulation coverage (covered/total), preceptor rating on the
  card's entrustment anchors, whole days between simulation and ward, and rater role. No names
  of patients, staff or students.
- **Analysis.** Per skill: descriptive paired summaries, and the association between simulation
  coverage and preceptor rating (Spearman, with its interval), pooled across blocks.
  Pre-register the skills and the analysis before the first pair is collected.
- **Honest limits.** No control group, so this is a transfer description, not a causal
  estimate. Preceptors see the card, so their ratings are not blind to it. At 4-10 students
  per block, the first year yields tens of pairs per skill at most.

## 6. Analysis and reporting rules

- **Pre-specified:** descriptive statistics for every measure; for Phase B, paired pre/post
  change with an effect size and its interval (Wilcoxon signed-rank if the distribution needs
  it); and thematic analysis of survey free text and focus-group notes.
- **Small cells:** no reported cell below n = 5, matching the metrics site's rule. Aggregate
  across blocks and terms until cells clear it.
- **No individual reporting,** ever, including to the clerkship director.
- **Report against the frameworks:** results rolled up to the six Foundational Competencies
  and the four ADMSEP Units through the WP-3 objective map, and to Core EPAs where an
  instrument targets one.

## 7. No learner data in this repository

This section is binding on every contributor, human or AI.

**Why the repository can promise this.** The library was designed so learner data never needs
to exist in it:

- **No identity.** No accounts, no login, no learner cookie. The only credential in the
  platform belongs to the faculty console.
- **Learner state stays on the learner's device,** under `cw_*` and `rp_*` browser-storage keys.
  None of it is transmitted.
- **Usage analytics store integers, never events.** When enabled per site, the metrics
  function increments a counter keyed by site, ISO week and an allowlisted event key. It stores
  no IP address, user agent, session identifier or timestamp finer than the week, it does not
  log requests, and reports suppress cells below n = 5 (`CLAUDE.md`, "Usage analytics store
  integers, never events"; design in `docs/superpowers/specs/2026-09-04-usage-analytics-design.md`).
- **The study export is learner-initiated** and lands on the learner's own device. It reaches
  the evaluation only through the submission channel in §4.3, which is outside this repository.
- **No PHI anywhere.** Cases are synthetic, and encounter cards reference simulated patients
  only.

**Therefore:**

1. Survey responses, exported files, OSCE scores, observation cards, focus-group notes and
   exam scores are held by the data custodian on [institutional storage]. They are never
   committed to git, pasted into issues or pull requests, uploaded as Actions artifacts,
   written to agent memory or scratch files, or attached to review threads.
2. The repository may carry only instruments (in `13_Faculty_Resources/Assessment/`), this
   protocol, and **aggregate results that clear n = 5**, after the determination and the
   custodian's sign-off.
3. Anyone who finds learner-level or patient-level data in the repository stops, does not
   commit, and routes it to the custodian for removal.

## 8. Roles

| Role | Who | Notes |
| --- | --- | --- |
| Principal investigator / clerkship lead | Joshua Moss, MD | Grades students, so never handles individual-level research data before final grades are in |
| Data custodian (honest broker) | [name, role, institution] | Holds all data; runs linkage only where consent covers it |
| Consent and survey administration | [non-grading team member] | |
| Site leads | UNE COM: [name]; [Maine Medical Center]: [name]; [Sanford site: confirm name] | Confirm each site's name and IRB reliance |
| OSCE raters and ward preceptors | [roster held outside the repo] | Trained on the WP-3 cards before the first block |

## 9. Timeline

- A cohort starts on 2026-09-28. **No data are collected from it.** This protocol and the
  determination letter are not yet approved.
- Earliest collection: the first block to start after the determination is on file.
- Phase A runs for one term. Phase B starts only after the parallel-form decision (§4.3) and
  its question-bank work.

## 10. Open decisions for Josh

1. **Accreditor framing:** COCA, LCME or both (§1).
2. **Phase B:** build parallel held-out forms, or accept the COMAT aggregate as the only
   knowledge outcome (§4.3)?
3. **Custodian and consent:** who is the honest broker, and who takes consent (§8)?
4. **Sim-to-Ward pairs:** which skills are pre-registered for the first term (§5.2)?
5. **Determination route:** QI, exempt research, or both split by component (companion letter)?
6. **The July draft:** merge it into this one, or keep it as the research-aims version (§11)?

## 11. Relationship to the July 2026 draft

| Element of the July draft | Here |
| --- | --- |
| Aim 1: engagement (from the opt-in export) predicts subject-exam percentile | Kept as a **secondary** analysis. The export it asked for has shipped (§4.1). The primary Level 2 measure is now pre/post (§4.3), because an engagement association cannot separate the library's effect from who chooses to engage. |
| Aim 2: OSCE checklist scores and critical-fail rate | Kept (§5.1), with scores captured outside the repository. |
| Aim 3: pre/post self-efficacy scale (its Appendix B items) | Kept as a candidate Level 1/2 measure. It is original, so the instrument-reproduction rule does not block it. Add it to the §3 survey if Josh wants it. |
| Historical comparison with pre-platform blocks; stepped-wedge option | Not adopted here. A historical comparison of cohort-aggregate exam scores is cheap and can be added to §6. A stepped wedge needs multiple sites, which this protocol does not assume. |
| Study-code key held by the PI | **Changed:** held by an honest broker (§8), because the PI grades the participants. |
| Exempt categories 1 and 4 | The companion letter asks about (d)(1), (d)(2) and (d)(4). |
| New here | Kirkpatrick level 3 via the Sim-to-Ward pairing study (§5.2); the stated limits of the shipped placement (§4.2); the binding no-learner-data section (§7); alignment with `standards.json` (§2). |
