# OpenEvidence pipeline — attestation pass, 2026-07-31

**Run type:** weekly scheduled scan (0 new files) + attestation burn-down of the carried queue.
**Scanner:** `13_Faculty_Resources/_automation/oe_scanner/oe_scan.py`
**Outcome:** `pending_attestation_count` 4 → **0**. No library body text was edited in this pass.

> **Scope note.** This is a *verification and sign-off* memo, not an accuracy-review memo. No new
> OpenEvidence files were present (30 files, 30 already processed), so there are no new
> ACCURACY / COMPLETENESS lists this cycle. The two P2 items in §4 are editorial refinements
> surfaced *during* verification, not new-source findings.

---

## 1. Weekly scan result

| Field | Value |
|---|---|
| `total_files` | 30 |
| `already_processed` | 30 |
| `new_or_changed_count` | **0** |
| `pending_attestation_count` (before) | 4 |
| `pending_attestation_count` (after) | **0** |

No new or changed files in `OPENEVIDENCE RAW FILES TO REVIEW/`. Nothing staged, nothing committed
to the manifest's processed-file ledger.

---

## 2. What was attested

Four pages carried `**Pending re-attestation:**` tags dated 2026-07-23. Every inserted fact was
verified against its primary source before the tag was cleared. Stamps advanced
**2026-07-09 → 2026-07-31**, attester `Joshua Moss, MD`.

| Page | Content attested | Verification |
|---|---|---|
| `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` | Commitment + involuntary-med case law | 4/4 cases confirmed (CourtListener) |
| `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md` | CATIE discontinuation figure | Exact match to source abstract |
| `14_Tracks/Resident/adv_psychopharmacology.md` | STAR\*D reanalysis figure | Exact match to source abstract |
| `14_Tracks/Resident/systems_medlegal.md` | PAD RCT figure + involuntary-med case law | Exact match; 2/2 cases confirmed |

---

## 3. Verification detail (source-of-truth quotes)

Journal citations verified via PubMed; the DOI in each page's tag resolves to the paper whose
findings the page states. Case law verified via CourtListener (reporter cite + filing date).

### 3.1 CATIE — **VERIFIED EXACT**
- **Page says:** "**74% of patients stopped their assigned drug within 18 months**, and the older
  first-generation perphenazine performed comparably to the newer agents."
- **Source says:** "Overall, 74 percent of patients discontinued the study medication before 18
  months (1061 of the 1432 patients who received at least one dose)… the efficacy of the
  conventional antipsychotic agent perphenazine appeared similar to that of quetiapine,
  risperidone, and ziprasidone."
- Lieberman JA et al. *Effectiveness of antipsychotic drugs in patients with chronic schizophrenia.*
  N Engl J Med 2005;353(12):1209-23. PMID 16172203.
  [DOI](https://doi.org/10.1056/NEJMoa051688)

### 3.2 STAR\*D reanalysis — **VERIFIED EXACT**
- **Page says:** "the widely quoted ~67% cumulative remission figure was overstated: a 2023
  reanalysis faithful to the original protocol (blinded HRSD, correct exclusions) put true
  cumulative remission near **35%**, roughly half the reported rate (so about two-thirds never
  remitted)."
- **Source says:** "In contrast to the STAR\*D-reported 67% cumulative remission rate after up to
  four antidepressant treatment trials, the rate was 35.0% when using the protocol-stipulated HRSD
  and inclusion in data analysis criteria… STAR\*D's cumulative remission rate was approximately
  half of that reported." The excluded patients are specified as 99 remitted at study outset plus
  125 remitted when initiating next-level treatment.
- Pigott HE, Kim T, Xu C, Kirsch I, Amsterdam J. BMJ Open 2023;13(7):e063095. PMID 37491091.
  [DOI](https://doi.org/10.1136/bmjopen-2022-063095)

### 3.3 Psychiatric advance directives — **VERIFIED EXACT**
- **Page says:** "in a multicenter RCT, peer-worker–facilitated PADs cut compulsory admissions from
  **39.9% to 27.0%** over 12 months (risk difference −0.13)."
- **Source says:** "In the PW-PAD group, 27.0% had compulsory admissions compared with 39.9% in the
  control group (risk difference, −0.13; 95% CI, −0.22 to −0.04; P = .007)." Multicenter RCT,
  7 French mental health facilities, 394 participants, 12-month follow-up.
- Tinland A et al. JAMA Psychiatry 2022;79(8):752-759. PMID 35662314.
  [DOI](https://doi.org/10.1001/jamapsychiatry.2022.1627)

### 3.4 Case law — **4/4 VERIFIED** (reporter citation and year)

| Case as cited on the page | Confirmed citation | Filed | Holding as stated |
|---|---|---|---|
| *Addington v. Texas* (1979) | 441 U.S. 418 | 1979-04-30 | Clear-and-convincing standard for civil commitment — correct |
| *O'Connor v. Donaldson* (1975) | 422 U.S. 563 | 1975-06-26 | Non-dangerous person able to survive safely in the community cannot be confined — correct |
| *Washington v. Harper* (1990) | 494 U.S. 210 | 1990-04-16 | Administrative review + medical-interest finding for a dangerous, mentally ill prisoner — correct |
| *Sell v. United States* (2003) | 539 U.S. 166 | 2003-06-16 | Four-part judicial test to medicate solely to restore trial competency — correct, and all four factors are stated accurately |

---

## 4. Flagged for your judgment — P2, editorial, not blocking

Both items below are **phrasing**, not factual error; the underlying numbers verify exactly, which
is why they did not block attestation. Raising them because both are resident-facing.

**P2 · [MS3] · `psychopharmacology_primer_inpatient.md` — CATIE comparator scope.**
The page reads "perphenazine performed comparably to **the newer agents**." The trial found
perphenazine similar to quetiapine, risperidone, and ziprasidone, but olanzapine was the most
effective on time-to-discontinuation (significantly longer vs. quetiapine P<0.001 and risperidone
P=0.002; not significantly vs. perphenazine at the study's adjusted threshold). "Comparably to the
newer agents" is the standard textbook gloss and is defensible for shelf purposes, but it slightly
overstates the parity.
*Suggested phrasing:* "…perphenazine performed comparably to most of the newer agents, with
olanzapine showing a modest edge on time to discontinuation (at the cost of the worst metabolic
profile)." — which also reinforces the page's own choose-by-side-effect message.

**P2 · [Resident] · `adv_psychopharmacology.md` — "true" adopts one side of a live dispute.**
The page reads "put **true** cumulative remission near 35%." The 35.0% figure is exactly what
Pigott et al. report, but that reanalysis is contested in the literature rather than settled, and
"true" reads as adjudicating the dispute. Residents citing this on rounds should know it is a
reanalysis under active debate.
*Suggested phrasing:* "…a 2023 protocol-faithful reanalysis put cumulative remission at 35.0% —
roughly half the reported rate — a figure the original investigators dispute."
*Attestation note:* the number and its provenance are accurate as written; only the framing word
is at issue.

---

## 5. Repository hygiene — needs a decision

**5.1 The attested content is not committed.** All four pages' 2026-07-23 clinical edits *and*
this pass's attestation stamps are uncommitted working-tree changes on branch
`fix/table-scroll-desktop-affordance-v2` — a branch named for an unrelated concern. `git show
HEAD:<page>` contains no pending tags, confirming the whole batch is untracked. This is the
Cowork↔Claude Code handoff trap in the global CLAUDE.md: another agent in a different worktree
cannot see any of it, and a branch switch could lose it. **Recommend committing these to their own
branch before further work.** Nothing was committed in this pass — that call is yours.

**5.2 Worktree sprawl in this repo is unswept.** The scan surfaced 8 live worktrees
(`.worktrees/` ×6, `.claude/worktrees/` ×2). The nightly sweep LaunchAgent
(`com.jm.rps.worktreesweep` → `~/bin/rps-worktree-sweep.sh`) covers
`reconnect-psychiatry-system` and `therapy-match` but **not** `psychiatry-clerkship`. Adding it is
one `sweep_repo` call at the bottom of that script.

---

## 6. Tooling change shipped this session

`oe_scan.py` gained an attestation-clearing path, so the pending queue is now closable in-tool
instead of by hand-editing pages.

```
python3 oe_scan.py --attest "<page>" [...]   # clear tag, advance stamp, log it
python3 oe_scan.py --attest-all             # everything currently pending
python3 oe_scan.py --attest-log             # print the audit trail
    flags: --dry-run | --attester "Name, MD" | --date YYYY-MM-DD
```

Per page it (1) strips the `Pending re-attestation` tag from the review-status line, (2) advances
the `Reviewed and attested by … (DATE)` stamp, and (3) appends a record to a reserved
`__attestations__` key in `oe_manifest.json` capturing the cleared note text, the prior stamp date,
and the attester — so the sign-off survives after the tag is gone from the page.

**Safety properties verified before the live run:** `--dry-run` left all 5 touched files
byte-identical (sha256-compared); the rewrite is confined to the single review-status line, leaving
all clinical body text untouched; a page tagged but lacking a parseable stamp returns an explicit
`warning` rather than silently skipping; `--date` rejects non-`YYYY-MM-DD` input; and the reserved
manifest key is excluded from `already_processed` / `manifest_size` counts so it cannot inflate
them.

**Verified after the live run:** `pending_attestation_count` = 0; 4 audit-log entries persisted;
all three clinical figures still present verbatim in the pages; the 9 remaining
`pending re-attestation` string matches in the repo are all planning docs and worktree copies,
correctly pruned by the scanner's skip rules — no hidden backlog.

`RUNBOOK.md` still describes clearing an item by deleting the tag by hand. That instruction is now
superseded by `--attest` and should be updated on the next pass.

---

*Prepared 2026-07-31 by the scheduled `openevidence-reviews-scan` task. Citation verification via
PubMed and CourtListener. No PHI. No library body text altered — frontmatter stamps only.
The two P2 items in §4 remain open for Dr. Moss's decision.*
