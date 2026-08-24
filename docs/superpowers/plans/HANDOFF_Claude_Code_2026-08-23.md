# HANDOFF → Claude Code · 2026-08-23

**From:** Cowork session, post-#398. **To:** Claude Code, working in
`/Users/jm/Psychiatry-Clerkship-Library`.
**Author of record:** Joshua Moss, MD. **You do not decide content accuracy — he does.**

Four PRs, in the order below. **PR-1 and PR-3 are the ones that matter**; PR-2 is mechanical;
PR-4 is authored copy awaiting attestation. Two items at the end are blocked on Josh and are
**not** yours to resolve.

Companion documents, already in the repo:
- `docs/superpowers/plans/DECISION_BRIEF_2026-08-23.md` — the research and reasoning behind all
  of this. Read it before starting; it explains *why*, which this file does not repeat.
- `docs/superpowers/specs/SPEC_CSSRS_Administration_Teaching_v1_DRAFT.md` — the PR-4 copy,
  already written. Do not re-author it.

---

## 0 · Non-negotiables — read before your first commit

These are repo-specific and have each caused a real failure. Violating any of them wastes a PR.

**Branch base.** Josh's checked-out working tree is usually **stale vs `origin/main`**. Build
every PR in a fresh worktree off `origin/main`:
```bash
git fetch origin
git worktree add .worktrees/<branch-name> -b <branch-name> origin/main
```
Re-apply edits inside the worktree. **Never copy files across from the working tree.**

**The gate is `bash bin/verify.sh`.** GitHub Actions is blocked at the account level (billing),
so CI is self-reported. `verify.sh` mirrors `ci.yml`'s `build-test-validate` job step for step,
and its **stdout goes in the PR body**. `--quick` skips the site builds and is *not* a gate run.
The Playwright smoke suite is separate: `bin/verify-smoke.sh`.
A 4-second, zero-step CI failure is a billing trip, not your bug.

**JSON serialization — match byte-for-byte or the diff explodes.**
| File | indent | ensure_ascii | trailing newline |
|---|---|---|---|
| `topic_meta.json` | `2` | `False` | **yes** |
| `evidence_registry.json` | `2` | `False` | **yes** |
| `evidence_annotations.json` | `2` | `False` | **yes** |

> **Corrected 2026-08-24.** This table previously said `topic_meta.json` was `indent=1` with no
> trailing newline and `evidence_registry.json` was `ensure_ascii=True`. Neither round-trips today.
> `topic_meta.json` was reformatted to `indent=2` + trailing newline by #390, which is why the old
> values no longer match. All three root registries now share the same settings. **Round-trip and
> diff before writing regardless** — that instruction is the durable part, and it is what caught this.
Round-trip the bytes and diff against the original before you write anything.

**New registry ids must be registered in the inventory lock.** `tools/evidence_registry/test_registry.py`
line ~188 asserts against `EXISTING_IDS | TIER1_IDS | SURVEILLANCE_IDS | SAFETY_GATE_IDS | THERAPY_WP_T2_IDS`.
Adding a source without adding its id to one of those sets fails the suite. Add new ids to a new
alphabetical set with a comment naming the PR.

**Claim anchors arm per page, and rule 3 is a trap.** `13_Faculty_Resources/_automation/validate_claim_anchors.py`:
once a page carries **any** `[^source-id]` anchor, **every** id in that page's
`topic_meta.evidenceIds` must be used by at least one anchor. So adding one anchor to a
previously-unanchored page obligates you to anchor all of its declared ids. Do not half-anchor.

**⚠️ NEVER `git add -A` OR `git commit -a` IN THIS REPO.** As of 2026-08-23 the working tree shows
**~110 media files as modified** — every `.m4a` under `07_Evidence_and_Reading/Landmark_Trials/audio/`
and `12_Media/audio_oe/`, plus six `.mp4`s under `_prototypes/`. They are **Git LFS-tracked**
(`.gitattributes`, 4 filter rules) and the working copies are the **real binaries where the index
holds the 132-byte pointers** — e.g. the Rosenhan overview diffs `Bin 132 -> 3562548 bytes`. A
blanket add commits multi-megabyte binaries in place of LFS pointers, into history, on a repo with
a live Actions/LFS budget constraint.

**Stage explicitly, by path, every time.** `git add <exact paths>`. Do not "clean up" that churn,
do not `git checkout --` it, and do not mention it in your PRs — it predates this work and is
Josh's to sort out.

**Never write a citation from memory.** Resolve PMID, DOI, title, first author, year and journal
against the record. Roughly one in five citations checked in this repo has been mis-attributed.

**Never silently reword clinical content.** If you find something wrong that is not named in this
handoff, stop and surface it. Do not fix it.

---

## PR-1 · Content corrections — two mis-sourced claims

**Branch:** `fix/content-corrections-postdischarge-psychoed`
**Type:** AGENT-EXECUTABLE + **AUTHOR-GATED** (Josh must attest the new registry entries)
**Closes:** the two findings from #398's backfill, plus one it missed.

### 1.1 The Modini & Large mis-attribution

`modini-large-2026` (PMID 41664893) is a **viewpoint**. It reports **no time-course statistic**.
It is currently cited for one.

**Three call sites in `02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md`
— the backfill flagged only the first:**

| Line | What it is |
|---|---|
| 47 | Prose: *"Suicide risk peaks sharply in the first weeks after psychiatric discharge… [5 ✓]"* |
| 69 | Table row: `| Everyone, pre-discharge | Safety-plan review + bridging | Caring-contacts plan | [5 ✓, 12 ✓] |` |
| **102** | **Quiz explanation** — the *correct answer* to the line-100 item is keyed to this citation |

Plus `07_Evidence_and_Reading/Therapy_Reading_Room/therapy_reading_room.md:125`, which calls it
*"the statistic to carry out of this rotation."*

**Line 102 is the most serious.** A quiz answer resting on a paper that does not report the number
is worse than a prose overstatement — students memorise it.

**Add two registry sources** (neither is currently in `evidence_registry.json`; verified today):

```
id: chung-2017-postdischarge-suicide
Chung DT, Ryan CJ, Hadzi-Pavlovic D, Singh SP, Stanton C, Large MM.
Suicide Rates After Discharge From Psychiatric Facilities: A Systematic Review and Meta-analysis.
JAMA Psychiatry. 2017;74(7):694-702.  PMID 28564699  doi:10.1001/jamapsychiatry.2017.1044
type: systematic-review
```
Key figures: 100 studies, 183 samples, 17,857 suicides / 4,725,445 person-years. Pooled
**484**/100,000 PY overall; **1,132** within 3 months; **2,078** among patients admitted with
suicidal ideas or behaviours. Rates stay elevated for years (277/100,000 PY beyond 10 years).

```
id: chung-2019-first-week-month
Chung D, Hadzi-Pavlovic D, Wang M, Swaraj S, Olfson M, Large M.
Meta-analysis of suicide rates in the first week and the first month after psychiatric
hospitalisation.  BMJ Open. 2019;9(3):e023883.  PMID 30904843  doi:10.1136/bmjopen-2018-023883
type: systematic-review
```
Key figures: **first week 2,950**/100,000 PY (95% CI 1,740–5,000); **first month 2,060**/100,000 PY
(95% CI 1,300–3,280).

**`identity.note` scope notes — write these, they are the highest-value part of the entry:**
- `chung-2017-…`: *"Supports the magnitude and the 3-month/post-discharge gradient. Does NOT
  support a first-week-specific figure — use chung-2019-first-week-month for that. Reports
  marked heterogeneity (I²=98%)."*
- `chung-2019-…`: *"Supports first-week and first-month rates specifically. The authors report
  evidence of publication bias toward studies reporting higher post-discharge rates, and
  I²=88–90; do not present these as precise point estimates."*

**Reference-list surgery — do it this way to avoid renumbering 30+ anchors:**
1. **Replace reference 5 in place** with Chung 2017. `[5 ✓]` at lines 47, 69 and 102 then resolves
   correctly with no anchor edits.
2. **Append Chung 2019** as a new trailing reference number. Determine the true last number by
   reading the reference block — `grep -c '^[0-9]\+\. '` over the whole file over-counts, because
   the body contains other numbered lists.
3. **Re-add Modini & Large** as a further trailing number, cited for its actual argument. Keep it
   on the page so `therapy_on_the_unit.md`'s existing `evidenceIds` rail (which already carries
   `modini-large-2026`) stays valid and needs no surgery.

**Replacement copy for line 47** — use verbatim; `[N]` and `[M]` are the new Chung 2017 / Chung 2019
reference numbers:

> **2c. Discharge bridging.** The weeks after discharge are the highest-risk period in the whole
> episode of care. Pooled across 100 studies and 4.7 million person-years, the post-discharge
> suicide rate was 484 per 100,000 person-years overall, 1,132 within the first three months, and
> 2,078 among patients admitted for suicidal ideas or behaviour [5 ✓]; in the first week alone the
> pooled rate is roughly 2,950 per 100,000 person-years [M ✓]. Risk is highest early but stays
> elevated for years — bridging is the start of aftercare, not the end of the admission.

**Line 102 quiz explanation** — re-key to Chung 2019 and keep answer B. Replacement:

> **Answer: B.** Post-discharge suicide risk is dramatically front-loaded: the pooled rate is about
> 2,950 per 100,000 person-years in the first week and 2,060 in the first month [M ✓] — which is
> why safety-plan review, confirmed 7-day follow-up, and bridging contacts belong to the admission,
> not to the outpatient team.

**Reading Room line 125** — replacement:

> ★ **Post-discharge suicide: time for a rethink** — Modini & Large, *Australas Psychiatry* 2026.
> An argument piece, not a data paper: the field keeps studying categorical predictors and ignoring
> what the admission itself was like for the patient. Read it after the Chung meta-analyses — those
> give you the magnitude, this asks why we still cannot explain it.

If that page's rail needs the Chung ids added, add them; check rule 3 before adding any anchor.

### 1.2 The psychoeducation superlative

`02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md:45`, source
`xia-2011` (PMID 21678337).

**The numbers are correct** — verified today: relapse RR 0.70 (0.61–0.81), NNT 9; readmission
RR 0.71 (0.56–0.89), NNT 5. **The superlative is not.** "The strongest evidence base of any single
psychological intervention" is supported by nothing in the source. Three facts the current copy
omits: the readmission estimate rests on **n = 206** (of 5,142 total); Cochrane's own conclusion is
*"hospital-based studies of limited quality"* whose *"true size of effect is likely to be less than
demonstrated"*; and the last search was **February 2010**.

**Replacement copy for line 45** — use verbatim:

> **2b. Structured psychoeducation.** In schizophrenia-spectrum admissions, structured
> psychoeducation is among the best-supported psychological interventions and one of the few that
> is genuinely deliverable inside a short stay. Cochrane pooling across 44 trials (n = 5,142) found
> reduced relapse (RR 0.70; NNT 9) and reduced readmission (RR 0.71; NNT 5) [4 ✓]. Read those
> numbers with the reviewers' own caveat: these were *"hospital-based studies of limited quality"*
> and *"the true size of effect is likely to be less than demonstrated"* — and the readmission
> estimate rests on just 206 participants [4 ✓]. Do it anyway; the intervention is cheap, safe and
> probably helps. Just don't quote NNT 5 as though it were precise.

**Also:** update `xia-2011`'s `identity.note` via `noteHistory` to record the n = 206 scope limit
and the 2010 search date, so a later author cannot re-attach it to a stronger claim.

### 1.3 A gate rule worth adding while you are here

Both errors are the same species: **a commentary about a topic stored as the source for a number
about that topic.** Propose (do not merge unilaterally) a check in the span-verify pass: if a
source's PubMed `article_types` contains no Meta-Analysis / Systematic Review / Clinical Trial /
Observational Study **and** the claim text it licenses contains a numeral, flag it. That single
rule catches this class automatically. Per amendment A3, do not promote it to a hard gate while CI
is down — ship it as a warning.

### PR-1 done when
- [ ] Both Chung sources added, serialization round-tripped, ids registered in the inventory lock
- [ ] All four call sites updated with the copy above
- [ ] `xia-2011` `noteHistory` appended
- [ ] `bash bin/verify.sh` green, stdout in the PR body
- [ ] PR body flags: **needs Josh's attestation** — new registry entries require
      `governance.facultyReview.lastReviewed` in the same commit

---

## PR-2 · Landmark Library wiring — mechanical, no new sources

**Branch:** `chore/wire-tier1-landmark-rails`
**Type:** AGENT-EXECUTABLE
**Closes:** F19, correctly this time.

### What the previous session got wrong

`evidence_annotations.json → policy.orphanBacklog` (16 ids) is **exactly `TIER1_IDS` in
`tools/evidence_registry/test_registry.py` minus `pharoah-2010-family-intervention`.** It is the
**Tier 1 Landmark primary-source reading list** — already mapped to curriculum weeks with assigned
teaching roles in `07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md`,
several shipping as audio overviews.

They are cited as **reading assignments**, not as sources licensing claims. That is the whole
defect: wired to the curriculum, not to the evidence spine.

> **Retire nothing.** A mechanical wire-or-retire pass would have deleted the required reading
> list. In particular `caspi-2003-5htt-stress` and `border-2019-candidate-gene` are a deliberate
> rise-and-fall pair — they move together or not at all.

### The wiring map

Targets are real `topic_meta.json` keys, verified today. Two are already done.

| Source | Teaching role (from the Tier1 map) | Rail |
|---|---|---|
| `engel-1977-biopsychosocial-model` | The biopsychosocial operating system | `pg_formulation.md` + `case_formulation.md` |
| `rosenhan-1973-sane-places` | Diagnostic humility / labeling | `ddx.md` — **see ⬥A, may change** |
| `appelbaum-grisso-1988-capacity` | Four-abilities capacity model | ✅ `exp_consult.md` |
| `stanley-brown-2012-safety-planning` | The most practical tool on the list | `suicide.md` + `pg_suicide.md` |
| `lieberman-2005-catie` | Pick by profile, not class | ✅ `t_psychosis.md` |
| `rush-2006-stard` | Measurement-based care | `t_mood.md` — **see ⬥B** |
| `brown-1972-expressed-emotion` | Expressed emotion → relapse | `exp_family.md` + `family_modalities.md` |
| `bush-1996-catatonia-rating-scale` | BFCRS; the dx you can't miss | `catatonia.md` |
| `wampold-1997-bona-fide-psychotherapies` | Common factors | `psychotherapy.md` |
| `linehan-1991-dbt` | DBT origin; BPD is treatable | `t_personality.md` |
| `march-2004-tads` | Combination best for teens | `t_mood.md` — add the paediatric-population flag |
| `felitti-1998-ace` | Reframes every patient | `t_adjustment.md` |
| `caspi-2003-5htt-stress` | Candidate-gene rise… | `core_readings.md` — **pair** |
| `border-2019-candidate-gene` | …and fall (replication crisis) | `core_readings.md` — **pair** |
| `franklin-2017-suicide-risk-meta-analysis` | We can't predict; document reasoning | `suicide.md` + `pg_suicide.md` |
| `volkow-2016-addiction-brain-disease` | Combats stigma | `t_sud.md` |

Also add all 16 to `landmark_trials.md`'s rail — that page *is* the reading list, and it currently
declares no `evidenceIds` at all.

### Watch out
- **No new registry sources.** All 16 already exist. The inventory lock needs no edit.
- **Rule 3.** `suicide.md`, `pg_suicide.md`, `t_mood.md`, `t_personality.md`, `t_sud.md` and
  `exp_family.md` already carry `evidenceIds`. Adding ids there is safe **only if you add no
  anchors**. If you add an anchor to any of those pages, you must anchor every declared id on it.
  Recommendation: **wire rails only in this PR; anchors are a separate, later pass.**
- Do **not** touch `policy.orphanBacklog` — the note says it may only shrink, and shrinking it is a
  span-verification act, not a wiring one. Wiring these does not span-verify them; all 16 remain
  `spanVerified: false`.

### PR-2 done when
- [ ] 14 rails added (2 already present), `landmark_trials.md` rail created
- [ ] `topic_meta.json` serialization exact (`indent=1`, `ensure_ascii=False`, no trailing newline)
- [ ] No anchors added; `validate_claim_anchors.py` passes unchanged
- [ ] `bash bin/verify.sh` green, stdout in the PR body

---

## PR-3 · Retire the BFCRS reproduction — WP-02d resolved, and not the way Wave 4 hoped

**Branch:** `fix/wp-02d-bfcrs-retire-reproduction`
**Type:** AGENT-EXECUTABLE removal + **AUTHOR-GATED** replacement copy
**File:** `04_Acute_and_Safety/Catatonia/bfcrs.html` → builds to `_build/*/tools/bfcrs.html`

### The finding

WP-02d research is complete (full evidence in the decision brief). **BFCRS is not merely
"status not established" — it is affirmatively restricted.** The URMC BFCRS site, the closest
thing to an official home, publishes the items under site-wide Web Terms of Use
(https://www.urmc.rochester.edu/privacy/disclaimer):

> "The contents of the site are copyrighted and **may not be distributed, modified, reproduced, or
> used, in whole or in part without the prior written consent** of the University of Rochester
> Medical Center."
>
> "…grant you a nonexclusive license to use the Site solely for your **personal non-commercial use**."

No instrument-specific licence exists on any URMC BFCRS page or PDF. Absence of a copyright notice
is not a licence — works published after 1 March 1989 need none.

`bfcrs.html` currently ships **all 23 items with their 0–3 anchor ladders.** That is live learner
exposure against terms that forbid it.

### What to do
1. **Remove all 23 item texts and anchor ladders.** Mechanical, and do it in this PR — do not wait
   on a permissions reply.
2. **Leave a stub in place** that names the instrument, cites Bush G, Fink M, Petrides G, Dowling F,
   Francis A. Catatonia. I. Rating scale and standardized examination. *Acta Psychiatr Scand.*
   1996;93(2):129-36 (PMID 8686483), links to the URMC official site, and directs scoring to the
   institution's current approved form. **Author no clinical content in this PR.**
3. Update `docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md`: move BFCRS from
   "status not established" to **restricted**, quote the URMC terms, and record WP-22 as blocked on
   written permission rather than on the open question.
4. Update `docs/superpowers/plans/2026-08-20-review-remediation-STATUS.md` — WP-02d from
   `todo` → `resolved`, with the per-instrument dispositions.

### Also record, do not act on
- **COWS** — the published instrument carries, printed in Appendix 1: *"This version may be copied
  and used clinically."* That licenses clinical copying; it does not plainly reach public
  educational web reproduction. WHO dropped the line when re-typesetting. **WP-02's 45 verbatim
  anchors in `03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html` are outside the grant
  on a conservative reading — flag, do not revert, pending Josh's call.**
- **CIWA-Ar** — the "not copyrighted and may be reproduced freely" sentence is real but every
  instance traces to a *reproducer's* note, in three different wordings. Unresolved.
- Do **not** infer that any further instrument is exempt. The audit's Option A rule stands: exempt
  only once status is established and recorded in that table.

### PR-3 done when
- [ ] Zero BFCRS item text or anchor ladders in `_build/ms3/tools/bfcrs.html` and `_build/res/…`
- [ ] Stub cites the primary source and links the official site
- [ ] Both planning docs updated
- [ ] `bash bin/verify.sh` green, stdout in the PR body

---

## PR-4 · WP-06R-a — C-SSRS replacement copy

**Branch:** `feat/wp-06r-a-cssrs-administration-teaching`
**Type:** **AUTHOR-GATED** — the copy is written; it needs Josh's attestation, not your editing
**File:** `04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html`
→ builds to `_build/*/tools/cssrs.html`
**Copy:** `docs/superpowers/specs/SPEC_CSSRS_Administration_Teaching_v1_DRAFT.md`

Currently ships Q1–Q5 verbatim stems plus the Q6 lifetime structure. Under the Option A resolution
of 2026-08-23, C-SSRS retires — Josh's decision, already recorded.

1. **Remove all six verbatim stems and any anchor/response structure.**
2. **Port the drafted copy** into the page. It reproduces no item text; it teaches the three axes,
   the severity ladder as clinical constructs, the behavior categories, interviewing technique, the
   Franklin 2017 humility point, and escalation.
3. **`LOCAL_POLICY:` markers.** The draft uses `LOCAL_POLICY:` inline markers as placeholders.
   Convert them to this repo's canonical token per `AGENTS.md` §LOCAL_POLICY, and **leave them
   unfilled** — filling them is Josh's, and the page must not ship until they are filled.
4. The draft cites Posner 2011 (PMID 22193671) and Franklin 2017 (PMID 27841450). Neither
   `posner-2011` nor a Franklin id resolved to a registry entry when checked —
   `franklin-2017-suicide-risk-meta-analysis` exists and should be reused;
   **Posner 2011 will need adding**, with the inventory-lock registration and attestation that
   implies. Confirm before you build.

### PR-4 done when
- [ ] Zero C-SSRS item text in either build output
- [ ] Draft copy ported faithfully — **do not rewrite the clinical content**
- [ ] `LOCAL_POLICY` tokens converted to repo convention and left unfilled
- [ ] Posner 2011 registry status resolved
- [ ] PR body states: **blocked on Josh — attestation + LOCAL_POLICY fill**
- [ ] `bash bin/verify.sh` green, stdout in the PR body

---

## Blocked on Josh — do not attempt

| Item | Why it is his |
|---|---|
| ⬥**A. Rosenhan disposition** | The study's integrity is seriously challenged (Cahalan 2019; only one alleged pseudopatient located, records contradicting the published account). Recommended: keep in Week 1, re-scope the teaching role to *"how a study with this little underlying data reshaped a profession"* — better pedagogy, not worse. But it is a curriculum call. **Wire it to `ddx.md` per PR-2 in the meantime; the rail is right either way.** |
| ⬥**B. STAR*D caveat** | Pigott et al. *BMJ Open* 2023;13:e063095 (PMID 37491091) reanalysed the patient-level data with fidelity to protocol: cumulative remission **35.0%, not the reported 67%**. STAR*D stays sound for measurement-based care. **Grep the repo for `67%` near STAR*D and report what you find — do not edit.** |
| ⬥**C. Four guideline PMIDs** | Whether you may write `citation.pmid` and `identity` on attested records. Recommended yes, append-only via `noteHistory`, with the entry naming all six resolved fields. **His call.** |
| ⬥**D. The Kaitlin draft** | His read. Note only: if it references instrument reproduction, PR-3 changes what is true — BFCRS is now known restricted, not merely unestablished. |
| ⬥**E. The three permissions requests** | Wiley (CIWA-Ar + BFCRS), Taylor & Francis (COWS), URMC/Francis (BFCRS). Addresses and exact wording are in the decision brief. Longest latency item; nothing in Wave 4 moves until they land. |

---

## Suggested sequencing

PR-3 first — it is the only item with live learner exposure against explicit terms. Then PR-1
(two real content defects, one of them a quiz answer). Then PR-2 (mechanical, no risk). PR-4 last,
since it parks on Josh's desk anyway.

**Land them one at a time.** Branch protection on `jmoss333/psychiatry-clerkship` requires each
branch to be **up to date with `main`** before merge, and there is **no auto-merge** — you poll,
then merge. Four concurrent PRs means three rebases. Also: every merge to `main` triggers
production Netlify deploys on both sites, so **get Josh's per-PR approval before merging**.

**On merging.** The Cowork sandbox git cannot reach GitHub. Use Desktop Commander (where `gh` is
authed via keychain) for commits, pushes and PR operations; fall back to Claude in Chrome for the
merge click if `gh`'s keychain access drops mid-session, which it does.

**On CI.** Treat `bash bin/verify.sh` as the gate and put its stdout in every PR body regardless
of what Actions reports — `verify.sh`'s own header states Actions is blocked at the account level
for billing. If checks do run, confirm the current required-check names against branch protection
rather than assuming; they have changed more than once:
```bash
gh api /repos/jmoss333/psychiatry-clerkship/branches/main/protection \
  --jq '.required_status_checks.contexts[]'
```
A 4-second, zero-step failure is a billing trip. A long queue with `busy=true` and zero runs in
progress is a runner-capacity problem — that specific regression was fixed by #1482, so if you see
it again it is new, and it is not yours to fix silently.

---

*Prepared 2026-08-23 from the post-#398 board state. Bibliographic facts verified against PubMed;
copyright findings from primary publisher, institutional and government sources. Repo paths, ids,
line numbers and `topic_meta` keys verified against the working tree the same day.*
