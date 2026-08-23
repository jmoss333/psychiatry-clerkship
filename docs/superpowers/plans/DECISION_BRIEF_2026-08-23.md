# Decision brief — 2026-08-23

Work done against the handoff after #398. Everything below is either **resolved** (research
complete, ready for a PR) or **needs a decision from you** (marked ⬥).

**One correction up front, and it changes what you do first.** The "eleven attested sources no
page cites" is not eleven orphans awaiting wire-or-retire. It is the **Tier 1 Landmark Library**
— the required primary-source reading list, already mapped to curriculum weeks with assigned
teaching roles. Almost nothing there should be retired. Details in §1.

---

## 1 · F19 "orphans" — the framing was wrong, and the fix is one mechanical PR

### What the query was actually finding

`evidence_annotations.json → policy.orphanBacklog` lists **16 ids** (the note says n=17;
`pharoah-2010-family-intervention` was cleared, leaving 16). A query for "sources on no
`topic_meta.evidenceIds` rail" returns them because **they were never meant to sit on a topic
rail.** They are the Landmark Library — `07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md`,
a faculty-facing map generated from the registry that assigns every one of them:

- a **curriculum week** (Weeks 1–6),
- a **Required** role,
- a stated **teaching role**, and
- a Zotero parent key.

Several also ship as ~2-minute audio overviews on the Landmark Trials page. They are cited as
**reading assignments**, not as sources licensing a claim. That is the entire defect: they are
wired to the *curriculum* and not to the *evidence spine*. Retiring them would delete the
required reading list.

Current state: **2 of 16** are already on rails (`appelbaum-grisso-1988-capacity` →
`exp_consult.md`; `lieberman-2005-catie` → `t_psychosis.md`). **0 of 16** are span-verified.

### The wiring map — the Tier1 "teaching role" column already tells you the target

Each paper's assigned teaching role *is* the claim it should license. This is a mechanical PR,
not sixteen judgment calls.

| # | Source | Wk | Assigned teaching role | Proposed rail | Call |
|---|---|---|---|---|---|
| 1 | `engel-1977-biopsychosocial-model` | 1 | The biopsychosocial operating system | formulation page | **WIRE** |
| 2 | `rosenhan-1973-sane-places` | 1 | Diagnostic humility / labeling | see ⬥1.1 | **RE-SCOPE** |
| 3 | `appelbaum-grisso-1988-capacity` | 1 | Four-abilities capacity model | `exp_consult.md` | ✅ done |
| 4 | `stanley-brown-2012-safety-planning` | 3 | The most practical tool on the list | suicide-risk page | **WIRE** |
| 5 | `lieberman-2005-catie` | 2 | Pick by profile, not class | `t_psychosis.md` | ✅ done |
| 6 | `rush-2006-stard` | 2 | Measurement-based care | `t_mood.md` | **WIRE** + ⬥1.2 |
| 7 | `brown-1972-expressed-emotion` | 4 | Expressed emotion → relapse | family/relational | **WIRE** |
| 8 | `bush-1996-catatonia-rating-scale` | 2 | BFCRS; the dx you can't miss | `catatonia.md` | **WIRE** (see §2) |
| 9 | `wampold-1997-bona-fide-psychotherapies` | 3 | Common factors | psychotherapy page | **WIRE** |
| 10 | `linehan-1991-dbt` | 3 | DBT origin; BPD is treatable | `t_personality.md` | **WIRE** |
| 11 | `pharoah-2010-family-intervention` | 4 | NNT ~7 for relapse | family page | ✅ cleared |
| 12 | `march-2004-tads` | 2 | Combination best for teens | `t_mood.md` | **WIRE** + age flag |
| 13 | `felitti-1998-ace` | 6 | Reframes every patient | trauma / adjustment | **WIRE** |
| 14a | `caspi-2003-5htt-stress` | 6 | Candidate-gene rise… | evidence/methods | **WIRE as a pair** |
| 14b | `border-2019-candidate-gene` | 6 | …and fall (replication crisis) | evidence/methods | **WIRE as a pair** |
| 15 | `franklin-2017-suicide-risk-meta-analysis` | 5 | We can't predict; document reasoning | suicide-risk page | **WIRE** |
| 16 | `volkow-2016-addiction-brain-disease` | 5 | Combats stigma | `t_sud.md` | **WIRE** |

**Retire: none.** 14a/14b must move together — Caspi is taught as the *rise* half of a
rise-and-fall pair, so a mechanical pass that dropped either would destroy the teaching point.
That is precisely the failure mode the "quick wire-or-retire" framing invited.

### ⬥ 1.1 — Rosenhan needs a decision, but not a retirement

`rosenhan-1973-sane-places` is taught as a Week 1 landmark on diagnostic humility. Since 2019 the
study's integrity has been seriously challenged: Susannah Cahalan's investigation
(*The Great Pretender*) located only one of the alleged pseudopatients and found records that
contradict Rosenhan's published account. This is now mainstream enough that the Science History
Institute titles its segment "The Fraud That Transformed Psychiatry."

The library currently teaches the finding with no mention of the challenge. Three options:

- **A — Keep and re-scope (recommended).** Keep it in Week 1, change the teaching role from
  "diagnostic humility / labeling" to "*how a study with this little underlying data reshaped a
  profession*." It becomes a better Week 1 paper, not a worse one: it teaches diagnostic humility
  *and* evidence appraisal in one object.
- **B — Keep as-is with a caveat line.** Minimal change; weakest pedagogy.
- **C — Retire.** Loses a genuinely useful teaching artifact.

### ⬥ 1.2 — STAR*D needs a caveat wherever the 67% figure appears

Pigott et al. (*BMJ Open* 2023;13:e063095) reanalysed the STAR*D patient-level data with fidelity
to the original protocol: using the protocol-stipulated blinded HRSD and the protocol's own
exclusion criteria, the **cumulative remission rate was 35.0%, not the reported 67%**. STAR*D
remains sound for its assigned teaching role (measurement-based care), but any page quoting 67%
is quoting a figure its own protocol does not support. Worth a grep before the wiring PR lands.

---

## 2 · WP-02d — RESOLVED. Wave 4 can move, but not in the direction the SPEC assumed

Research complete on all three instruments. **The answer is not the one the Wave-4 plan needs.**

| Instrument | Finding | Consequence |
|---|---|---|
| **BFCRS** | **Affirmatively restricted.** The URMC BFCRS site — the closest thing to an official home — publishes the items under site-wide Web Terms of Use that read: *"The contents of the site are copyrighted and may not be distributed, modified, reproduced, or used, in whole or in part without the prior written consent of the University of Rochester Medical Center."* Acceptable Use grants only *"personal non-commercial use."* No instrument-specific licence exists on any URMC BFCRS page or PDF. | **`bfcrs.html` joins the retirement queue.** WP-22 blocked pending written permission. |
| **COWS** | **Real permission, wrong scope.** The instrument as published carries, printed in Appendix 1: *"This version may be copied and used clinically."* That licenses clinical copying. It does not plainly reach verbatim reproduction on a public educational website. WHO re-typeset the scale and **dropped** the line. NIDA reproduces the journal page but claims no permission. | **WP-02's 45 verbatim anchors are outside the grant on a conservative reading.** Ask Taylor & Francis one question; quote the line. |
| **CIWA-Ar** | **Unverified.** "The CIWA-Ar is not copyrighted and may be reproduced freely" circulates widely — but every instance found is a note added by the *reproducer* (an ASAM News supplement, a 2003 web capture, a 2005 health-plan form), in three different wordings. CamCOPS attributes the sentence to the 1989 article itself; that could not be verified — the article is closed-access. | **One ILL request settles it.** Highest-yield single action in this whole brief. |

**Three findings that dismantle the "everybody reproduces it" argument** — worth keeping, because
it will be raised again:

1. **SAMHSA had the words and declined to use them.** TIP 45 Appendix C lists CIWA-Ar as
   "Fee for use: No." On the *same page*, for a different instrument, SAMHSA writes "Fee for use:
   No — *the instrument is in the public domain*." That phrase was available and not applied.
2. **SAMHSA routes around COWS.** TIP 63 reproduces dozens of tools but links out to WHO for
   COWS rather than reprinting it — and WHO's copy is itself all-rights-reserved.
3. **Two institutions hosting these instruments disclaim the inference in writing.** UW–Madison's
   Addiction Research Center: *"We do not have copyright authority over these measures and cannot
   grant permission for use… Please contact the author of the questionnaire for use permissions."*

Also worth knowing: the STM cross-publisher allowance sometimes cited as an educational exemption
does not apply — it runs *between STM publishers and their authors*, and Wiley's own guidance
states it "continue[s] to require that a permissions request is made."

### ⬥ 2.1 — Recommended WP-02d disposition

| Action | Instrument | Effort |
|---|---|---|
| **ILL the 1989 Sullivan article** and look at whether the printed scale carries the "not copyrighted" line | CIWA-Ar | 10 min to request |
| **One email to Taylor & Francis** (`permissionrequest@tandf.co.uk`), quoting the printed clinical-use line, asking whether it extends to educational web reproduction | COWS | 15 min |
| **Email URMC** (Mark Oldham, Joshua Wortzel) **cc Andrew Francis** (original author, Penn State) for written permission — *and* ask them to add a terms-of-use statement to the BFCRS site, which currently has none | BFCRS | 20 min |
| **Pull `bfcrs.html`'s 23 anchor ladders now**, replacing with administration teaching, rather than waiting on the reply | BFCRS | agent-executable |

Ask for the same thing in all three: *"verbatim reproduction of item text and response anchors,
on a publicly accessible non-commercial medical education website, in perpetuity, with
attribution."* Vague requests get narrow grants. Keep the replies — the email is the artifact
that makes the decision defensible later.

**I'd sequence it: send the three requests, pull the BFCRS ladders in the same week, and let
WP-20/21/22 stay blocked on the replies rather than on the question.**

---

## 3 · The two content findings — confirmed, with replacement copy

### 3.1 Modini & Large — confirmed mis-attribution, and there is a second instance the backfill missed

Modini & Large (*Australas Psychiatry* 2026;34(3):227–230, PMID 41664893) is a **viewpoint**. Its
argument is that research "largely focuses on simple categorical variables and fails to consider
inpatient experiences of their admission and treatment." **It reports no time-course statistic.**

Two places depend on it — the backfill flagged one:

**(a)** `02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md:47`
**(b)** `07_Evidence_and_Reading/Therapy_Reading_Room/therapy_reading_room.md:125` — which calls
it *"the statistic to carry out of this rotation"*
**(c) — not previously flagged —** the same file's **quiz item at line 100** keys its correct
answer ("the first 1–4 weeks after discharge") to this citation. A quiz answer resting on a paper
that does not report the number is worse than a prose overstatement; students memorise it.

**The fix is clean, because Large co-authored the papers that do report it:**

- **Chung DT, Ryan CJ, Hadzi-Pavlovic D, Singh SP, Stanton C, Large MM.** Suicide Rates After
  Discharge From Psychiatric Facilities: A Systematic Review and Meta-analysis. *JAMA Psychiatry.*
  2017;74(7):694–702. PMID 28564699. — 100 studies, 17,857 suicides, 4,725,445 person-years.
  Pooled 484/100,000 PY overall; **1,132 within 3 months**; **2,078 among patients admitted with
  suicidal ideas or behaviours.**
- **Chung D, Hadzi-Pavlovic D, Wang M, Swaraj S, Olfson M, Large M.** Meta-analysis of suicide
  rates in the first week and the first month after psychiatric hospitalisation. *BMJ Open.*
  2019;9(3):e023883. PMID 30904843. — **first week 2,950/100,000 PY; first month 2,060/100,000 PY.**
  Use this one for the quiz item; it is the paper that answers the question asked.

**Replacement for (a), line 47:**

> **2c. Discharge bridging.** The weeks after discharge are the highest-risk period in the whole
> episode of care. Pooled across 100 studies and 4.7 million person-years, the post-discharge
> suicide rate was 484 per 100,000 person-years overall, 1,132 within the first three months, and
> 2,078 among patients admitted for suicidal ideas or behaviour [5 ✓]; in the first week alone the
> pooled rate is roughly 2,950 per 100,000 person-years [6 ✓]. Risk is highest early but stays
> elevated for years — bridging is the start of aftercare, not the end of the admission.

**Keep Modini & Large — for its actual argument.** It belongs on the Reading Room as the
provocation it is, not as a statistic:

> ★ **Post-discharge suicide: time for a rethink** — Modini & Large, *Australas Psychiatry* 2026.
> An argument piece, not a data paper: the field keeps studying categorical predictors and
> ignoring what the admission itself was like for the patient. Read it after the Chung
> meta-analyses — those give you the magnitude, this asks why we still cannot explain it.

**Note the general lesson for the annotation gate:** both errors are the same species — a
*commentary about a topic* stored as the source for a *number about that topic*. Worth a check in
the span-verify pass: if a source's PubMed `article_types` contains no
Meta-Analysis / Systematic Review / Clinical Trial and the claim contains a numeral, flag it.
That one rule would have caught this automatically.

### 3.2 Psychoeducation — the numbers are right, the superlative is not

`02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md:45`

Verified against Xia J, Merinder LB, Belgamwar MR. Psychoeducation for schizophrenia. *Cochrane
Database Syst Rev.* 2011;(6):CD002831. PMID 21678337:

- Relapse RR 0.70 (0.61–0.81), **NNT 9** ✅ as stated
- Readmission RR 0.71 (0.56–0.89), **NNT 5** ✅ as stated — **but n = 206**, against 5,142
  participants overall. The most quotable number on the page rests on the smallest sample in the
  review.
- Cochrane's own conclusion: *"in these hospital-based studies of limited quality. The true size
  of effect is likely to be less than demonstrated in this review."*
- Last search **February 2010**. The review is 16 years old and not updated.

The superlative — "the strongest evidence base of any single psychological intervention" — is
supported by nothing in the cited source, and is doubtful on its face given the CBT-for-psychosis
and family-intervention literatures already registered elsewhere in this library.

**Replacement for line 45:**

> **2b. Structured psychoeducation.** In schizophrenia-spectrum admissions, structured
> psychoeducation is among the best-supported psychological interventions and one of the few that
> is genuinely deliverable inside a short stay. Cochrane pooling across 44 trials (n = 5,142)
> found reduced relapse (RR 0.70; NNT 9) and reduced readmission (RR 0.71; NNT 5) [4 ✓]. Read
> those numbers with the reviewers' own caveat: these were *"hospital-based studies of limited
> quality"* and *"the true size of effect is likely to be less than demonstrated"* — and the
> readmission estimate rests on just 206 participants [4 ✓]. Do it anyway; the intervention is
> cheap, safe and probably helps. Just don't quote NNT 5 as though it were precise.

That version teaches better than the original: it models reading a Cochrane conclusion rather
than harvesting its NNT.

---

## 4 · Still yours ⬥

### 4.1 The four guideline PMIDs — writing `citation.pmid` and `identity` on attested records

**Recommend: yes, with one condition.** The operation is mechanical, append-only via
`noteHistory`, reversible, and does not touch any clinical claim — it completes bibliographic
identity on records whose *content* you already attested. The condition: the `noteHistory` entry
should name what was resolved and against what (PMID, DOI, title, first author, year, journal —
all six, per the registry's own discipline), so the append is self-documenting and a later reader
can tell attestation from identity resolution. Given ~1 in 5 citations checked has been
mis-attributed, resolve each against the record rather than from the existing title string.

### 4.2 The Kaitlin draft — send as written, or re-close live mode first

Needs your read; the footer lays out the three options. Only flag from here: if it references
instrument reproduction anywhere, §2 changes what is true as of today — BFCRS is now known to be
restricted, not merely unestablished.

---

## Recommended order of work

1. **Send the three permissions requests** (§2.1) — they have the longest latency, and nothing
   else in Wave 4 moves until they land. 45 minutes total.
2. **One content-corrections PR** — §3.1 (a)(b)(c) + §3.2. Four edits, all with copy already
   written above. Needs your attestation, nothing else.
3. **One wiring PR** — the 14 rails in §1. Mechanical; the map already exists.
4. **Decide ⬥1.1 (Rosenhan) and ⬥1.2 (STAR*D)** — these are curriculum calls, not defects.
5. **WP-06R-a** — replacement copy drafted, in a separate file; review and attest.

---

*Prepared 2026-08-23. Bibliographic verification via PubMed. Copyright research from primary
publisher, institutional and government sources — full source list and verification tags held
with this brief.*
