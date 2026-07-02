# Independent Clerkship-Library Review — MS3 + MMC Resident sites

**Reviewer:** fable 5 (independent audit) · **Date:** 2026-07-01 · **For:** Joshua Moss, MD
**Status:** Findings report only — **no files edited.** Awaiting your direction on fixes.

> **How to read this.** Every finding is tagged **[MS3] / [Resident] / [both]**, priority **P0** (safety/accuracy — fix first) / **P1** / **P2**, and effort **S / M / L**. Each gives the *quoted current state*, the *issue*, the *specific fix*, and whether it **needs your attestation**. Quotes are the library's actual current text. Where I could not independently verify a number, it is marked **"verify."** The **Top-10 shortlist** and a **safe-to-ship-now vs. needs-sign-off** split are at the end.

---

## 0. Scope, method, and what I did *not* touch

**Reviewed:** the 45 deployed content pages + 16 tools of the **MS3** build (https://une-ms3-psychiatry.netlify.app) and the **Resident** build (https://mmc-psychiatry-residents-sanford.netlify.app), their source under `/Users/jm/Psychiatry-Clerkship-Library/`, the SPA shell, both build scripts, `topic_meta.json`, `reviewed.json`, and `nav.json`. I read the context memos first (`HANDOFF_for_fable5_2026-07-01.md`, `openevidence_library_accuracy_review_2026-07-01.md`, `Tier3_attestation_sheet_2026-07-01.md`) and have deliberately **not re-flagged items already tracked there** except where I could sharpen or correct them.

**Method:** full inventory → source read of every core clinical page and both build scripts → live-behavior sampling in-browser (dark mode, topic template, tool dock, tool rendering, console, search) → targeted primary-source verification (PubMed for Miklowitz 2021; web for the clozapine REMS status) → cross-reference/dead-link audit.

**Assumptions (stated, not blocking):** I treated `_source/`, `_more-from-computer.md`, `notebooklm_upload_*`, and the faculty automation as out of scope except where they surfaced a live defect. I treated the OpenEvidence Tier-1/Tier-3 numbers already staged in your attestation sheet as *pending your sign-off* rather than re-verifying each.

**Overall:** This is a strong, unusually coherent library. Clinical reasoning is sound, the dose-discipline (recognition-not-titration for MS3; numbers quarantined to the resident C-L page) is consistent and well-judged, and the anti-stigma / trauma-informed voice is a genuine, uniform strength. Link integrity is clean. The issues below are concentrated in (a) a few **specific numbers/citations**, (b) **currency** (one 2025 practice change), and (c) **enhancement-layer polish** (search, mobile tables, progress model). Nothing I found is dangerous; the highest-priority item is an evidence-integrity fix.

---

## 1. Clinical accuracy & currency

### 1.1 — [both] **P0 · S · ATTEST** — Fabricated/conflated effect size on the Family Therapy Modalities page
**File:** `06_Family_and_Relational/family_therapy_modalities_inpatient.md` (line 27) → live `family_modalities.md`
**Current text:** *"**OR 0.30 (SUCRA 95%)** — in bipolar disorder, family/conjoint therapy is the *strongest* psychosocial option for preventing recurrence (Miklowitz et al., *JAMA Psychiatry* 2021; 39 RCTs) — the evidence anchor for Family-Focused Therapy above."*
**Issue:** I verified the primary source. According to PubMed, Miklowitz et al. 2021 (JAMA Psychiatry; [DOI](https://doi.org/10.1001/jamapsychiatry.2020.2993)) reports the overall manualized-psychotherapy-vs-control recurrence effect as **OR 0.56 (95% CI 0.43–0.74)**. Family/conjoint therapy's *significant* findings were **study retention (OR 0.46, 0.26–0.82)** and depressive-symptom stabilization (**SMD −0.46, 95% CI −1.01 to 0.08 — crosses zero, not significant**). The strongest *recurrence* signal was for psychoeducation with guided practice in a **family/group format** (OR 0.12, 0.02–0.94). **There is no "OR 0.30" and no "SUCRA 95%" anywhere in the paper** — and SUCRA is a ranking percentage, not an odds ratio, so the two are conflated. The claim that family/conjoint therapy is "the strongest psychosocial option for preventing recurrence" is not what the paper concluded.
**Fix:** Replace with sourced language, e.g.: *"Adjunctive manualized psychotherapies reduced recurrence vs. control (OR 0.56, 95% CI 0.43–0.74); family/group-format psychoeducation was the standout for recurrence (OR 0.12), and family/conjoint therapy improved treatment retention (OR 0.46) and helped stabilize depressive symptoms (Miklowitz 2021)."* This is the single most important fix in the library — a fabricated statistic attributed to a real paper is the most corrosive kind of error for a teaching resource's credibility.

### 1.2 — [both] **P1 · S · ATTEST** — QTc rounds-question still cites the wrong AHA statement
**File:** `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` (Q14, line 143)
**Current text:** *"**Key paper:** AHA Scientific Statement, Page et al., Circulation 2016."*
**Issue:** Page et al. 2016 (Circulation) is *"Drugs That May Cause or Exacerbate Heart Failure,"* not a QTc/torsades statement. The threshold in the answer (QTc ≥500 ms / Δ ≥60 ms) is correct; only the citation is wrong. This is **already flagged in your 2026-07-01 OE memo (Priority Action 1) but not yet shipped.** It is also an **internal inconsistency**: your resident `cl_reference.md` (line 39) already cites the correct source — *"Tisdale et al., Circulation 2020."*
**Fix:** Change Q14 to **Tisdale JE et al., "Drug-Induced Arrhythmias: A Scientific Statement From the American Heart Association," Circulation 2020;142(15):e214–e233.**

### 1.3 — [both] **P1 · S · ATTEST** — Clozapine monitoring framed as "mandatory/required" (post-REMS currency)
**Files:** `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` (*"pair it with the required hematologic and metabolic monitoring"*; pearl: *"consider clozapine, with mandatory monitoring"*); `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` Q7 (*"**Mandatory** ANC monitoring for agranulocytosis…"*).
**Issue (currency):** The FDA **eliminated the clozapine REMS** (announced Feb 24, 2025; REMS formally removed June 13, 2025). ANC monitoring is still **recommended per the boxed warning/prescribing information**, but pharmacies no longer need an ANC to dispense and prescribers/pharmacies are no longer REMS-enrolled. "Mandatory/required" now implies a program that no longer exists. **The good news: I found no stale "REMS" *program* language anywhere in the library** (you avoided it) — the gap is the opposite, that the 2025 change is *not mentioned at all*, and "mandatory" is now imprecise.
**Internal inconsistency:** the resident `adv_psychopharmacology.md` and `cl_reference.md` already use the correct phrasing (*"ANC monitoring for agranulocytosis"*), so the psychosis page and rounds Q7 are out of step with your own resident pages.
**Fix:** (a) Change "required/mandatory monitoring" → *"recommended ANC monitoring per the prescribing information."* (b) Consider a one-line currency note on `adv_psychopharmacology.md`: *"The clozapine REMS was discontinued in 2025; ANC monitoring remains guideline/PI-recommended, not REMS-enforced."* This is a high-yield, frequently-discussed 2025 change for residents on the ward.
**⚠️ Guard-rail for whoever implements this:** Do **not** "purge all REMS language" library-wide. The **esketamine (Spravato)** and **inhaled loxapine (Adasuve)** REMS programs remain active in 2026 — any page mentioning those is correct and should be left alone. Only clozapine lost its REMS.

### 1.4 — [both] **P1 · S** — Truncated answer at the end of the rounds Q-bank
**File:** `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` (Q97, line 989)
**Current text:** *"**Evidence:** This warning led to decreased ant"* — the file ends mid-word, with no completion, no pearl, and no "Key paper" for Q97.
**Issue:** A visibly broken sentence on a shelf-prep page. Also the header promises *"a hundred questions"* but the bank ends at **Q97**.
**Fix:** Complete Q97's evidence line (the well-known finding: the 2004 black-box warning was followed by decreased antidepressant prescribing and a debated signal of increased youth suicide attempts — Gibbons 2007 / Lu 2014) and either add the 3 missing questions or change the intro to "nearly a hundred."

### 1.5 — [both] **P2 · S · ATTEST** — "Highest completed-suicide risk" mislabels the study endpoint (BPD/benzodiazepines)
**File:** `03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md` (line 13; also the pearl "highest suicide risk of any class").
**Current text:** *"they carry the **highest completed-suicide risk** of any psychotropic class studied in BPD (HR ~1.61)…"*
**Issue:** The HR 1.61 is correctly sourced (Lieslehto 2023, JAMA Netw Open — a Swedish within-individual cohort), **but the study's endpoint was a composite of *attempted or completed* suicide**, not completed suicide alone. As written it overstates the endpoint. (This is on your Tier-3 sheet as a shipped-but-flagged item.)
**Fix:** *"highest risk of attempted or completed suicide of any psychotropic class studied in BPD (HR 1.61, 95% CI 1.45–1.78; Lieslehto 2023)."* Add the citation inline.

### 1.6 — Spot-checks that PASSED (documented so they are not re-litigated)
- **MAOI tyramine list** incl. *"tap/draft beer"* (`adv_psychopharmacology.md`, rounds Q20): **correct** — tap/unpasteurized draft beer is the classic high-tyramine item to restrict (Gardner "user-friendly" MAOI diet). Leave as is.
- **Serotonin syndrome vs. NMS** (`cl_reference.md`, primer, rounds Q9): accurate (clonus/hyperreflexia + <24 h vs. lead-pipe rigidity/bradyreflexia + days; Hunter criteria; CK; SS restraints-contraindicated). Strong.
- **Lithium toxicity / hemodialysis thresholds** (`cl_reference.md`): therapeutic 0.6–1.2, toxic ≥1.5, HD >4.0 (or >2.5 with severe features), charcoal ineffective, rebound — consistent with EXTRIP. Good.
- **Delirium numbers** (`cl_reference.md`): HELP ~40–53% (Hshieh 2015), MIND-USA n=566 haloperidol/ziprasidone no better than placebo — accurate and current.
- **Catatonia & Delirium teaching pages**: clinically excellent and appropriately **dose-free** (catatonia explicitly: *"Do not memorize or quote a dose"*). BAP 2023 cited.
- **Esketamine REMS / inhaled loxapine REMS** references: correct (still active). **Naloxone OTC since 2023, STAR\*D 2023 reanalysis (~35%), KarXT/xanomeline-trospium**: all current.

---

## 2. Completeness / high-yield gaps

### 2.1 — [both] **P1 · L** — No dedicated **Eating Disorders** topic page (highest-yield content gap)
**Current state:** Eating disorders appear only in `rounds_questions.md` (Q91–93) and briefly in the shelf guide. There is **no Core Topics page** for them, unlike Mood, Psychosis, Anxiety, SUD, Personality, Geriatric, Perinatal, Neurodevelopmental, Nutrition, OMM.
**Issue:** AN/BN/BED are reliably tested on the **psychiatry shelf/COMAT** (refeeding syndrome, electrolyte signatures, medical complications, fluoxetine 60 mg for BN, admission criteria) and are genuinely encountered on adult inpatient units. This is the clearest board-relevant hole.
**Fix:** Add a `t_eating.md` Core Topics page (recognition, medical-instability/admission criteria, refeeding-syndrome management, comorbidity, disposition), matching the house teaching-page template; add a `topic_meta` entry so it gets the "In 30 seconds / Can't miss / quiz" treatment. Sleep disorders (currently only rounds Q88–90) are a lower-priority secondary candidate.

### 2.2 — [Resident] **P2 · S** — No consolidated antipsychotic **metabolic-monitoring schedule** or lithium therapeutic range in one reference
**Current state:** Pages say "metabolic monitoring / baseline metabolic panel" qualitatively; `nutrition_metabolic.md` gives *"baseline, ~12 weeks, then annually"* (see 3.2 for the accuracy issue), and rounds Q13 gives a different schedule. No single resident reference states the staged ADA/APA schedule or the lithium therapeutic range in one place.
**Fix:** Add the staged schedule (weight at 4/8/12 wk then quarterly; glucose + lipids at baseline, 12 wk, then periodic) and lithium range to `cl_reference.md` or `adv_psychopharmacology.md`. Low effort, closes a resident-level gap and fixes the inconsistency in 3.2.

### 2.3 — [both] **P1 · M** — Requested but not-yet-built enhancement gaps (#7, #8) — confirmed real, and sharpened
Both are genuine (details in §4 and §5). Also still open from prior sessions: the **Tier-1 OE numbers** and **Tier-3 attestation** items already staged in your two 2026-07-01 memos.

---

## 3. Internal consistency & cross-references

### 3.1 — Cross-links / dead links: **CLEAN** ✅
A full audit of every `?page=` / `?tool=` / `tools/…` reference across all 52 source files against the built target sets found **zero broken links, zero silent dead-ends, and no cross-site leaks** (resident-only targets are referenced only from resident pages). The previously-broken **Week 3 "Psychotherapy folder"** link is confirmed fixed (now → `brief_psychotherapy.md`). Minor cosmetic-only note: `systems_medlegal.md` labels a link *"Decisional Capacity (tool)"* but routes to the `exp_consult.md` content page (not the `capacity.html` tool) — valid link, slightly misleading label.

### 3.2 — [both] **P2 · S · ATTEST** — Two pages give different antipsychotic metabolic-monitoring schedules
**`nutrition_metabolic.md`:** *"track at **baseline, ~12 weeks, then annually**"* and calls it *"the **ADA/APA consensus** monitoring standard."*
**`rounds_questions.md` Q13:** *"weight/BMI (**monthly for 3 months, then quarterly**), fasting glucose and lipids (baseline, 12 weeks, then annually)."*
**Issue:** These disagree on the weight-monitoring cadence, and the nutrition-page attribution to "ADA/APA consensus" oversimplifies the actual staged schedule (weight at 4/8/12 wk then quarterly). Pick one and make both pages match.

### 3.3 — [both] **P2 · S** — CIWA-Ar severity bands differ between the tool and the Q-bank
**Withdrawal tool (`withdrawal.html`):** bands shown as *"≤8 mild · 9–19 mod · ≥20 severe."*
**Rounds Q46:** *"<8–10 mild; 8–18 moderate; ≥19 severe."*
**Issue:** Published CIWA-Ar cutoffs vary, so neither is "wrong," but a student toggling between the tool and the Q-bank sees different numbers. Align them (and cite the source you standardize on).

### 3.4 — [both] **P2 · M** — `topic_meta.json` covers only 9 of 45 content pages (drives the progress-model gap in §5.3)
Only 9 pages (delirium, agitation, catatonia, mood, psychosis, anxiety, SUD, personality, neurodevelopmental) have `topic_meta` entries, so only they get the "In 30 seconds / Can't miss / Test-yourself / Mark-reviewed" template. 36 pages — including all 6 week pages, both pocket guides, the psychopharm primer, protocol library, evidence page, and every skills/family page — render as plain markdown with no template and **no "Mark reviewed" affordance.** See §5.3 for the downstream UX effect. (Geriatric and Perinatal are notable omissions given they *are* Core Topics.)

---

## 4. Reading level & tone

- **Tone / anti-stigma / trauma-informed voice: a uniform strength.** The "words to use carefully" table (interview pocket guide), splitting-as-symptom framing (personality), "behavior is communication" (neurodevelopmental), chain-analysis-not-punishment, and de-shaming family stance are all exemplary and mutually consistent. No stigmatizing language found anywhere.
- **[MS3] P2 · S — Undefined acronyms on an explicitly "basics" page.** `treatment_basics_digest.md` uses **EPS, NMS, QTc, akathisia, anticholinergic burden, serotonin syndrome** in the medication-class table with no first-use expansion. For a page pitched as MS3 "basics," expand on first use (EPS = extrapyramidal symptoms, NMS = neuroleptic malignant syndrome). The `geriatric` page similarly uses "deliriogenic," "orthostasis," "iatrogenic" without gloss. Low effort, real for the target reader.

## 4a. Governance / trust model (surfaced during the review)
**[both] P1 · M — The "reviewed" trust signal covers 14 of ~61 learner-facing items, and the per-page source banner is stripped at build.**
- I verified in `build_deploy.py` that the `> **Review status:** …` line is **stripped from every content page at build** (a regex removes it). So the source-tree inconsistency (some pocket guides/modules lack that banner) does **not** reach learners — but it also means the *only* trust signal on the live site is the green **"✓ Reviewed by Joshua Moss, MD"** chip driven by `reviewed.json`.
- `reviewed.json` currently marks **14 items** (the 3 orientation pages + 11 tools). **Zero of the ~30 core clinical content pages** (Mood, Psychosis, Catatonia, Delirium, SUD, Personality, Perinatal, Geriatric, primer, evidence, etc.) carry a review chip — they render with no trust indicator at all, sitting in an unlabeled middle state between "reviewed" and "pending."
- This is exactly your **Finding #4** (per-topic faculty-reviewed vs. draft badge). Recommend extending `reviewed.json` to a 3-state model (reviewed / pending / AI-draft) and surfacing "pending" explicitly, so the absence of a green chip isn't ambiguous.

---

## 5. UX / IA

### 5.1 — Start-here, Progress-home, tool badges/dock: **working well** ✅
Live-tested on the MS3 site: the Progress home renders (ring, due-today, streak, shelf countdown, high-yield-not-reviewed, coverage bars); the topic template (chips, "In 30 seconds," "Can't miss," rule-out chips, "Test yourself") renders correctly; the floating **"Tools for this page"** dock mounts on topic pages; dark mode toggles cleanly with good token coverage; `marked` is vendored locally and content renders (no CDN dependency). No console errors on the SPA or inside the withdrawal tool. Nav order matches the intended Start here → Core Topics → Six-Week → Interactive tools → rest.

### 5.2 — [both] **P1 · M — Search misses a few clinical abbreviations (#7), but narrower than expected**
I tested the live search engine directly. **Full terms and most acronyms already resolve** because the content spells them out (as literal tokens) or they're in the synonym groups: **NMS, EPS, OCD, ADHD, ECT, akathisia, "serotonin syndrome"** all return the right pages. The **genuine gaps** are abbreviations that are *neither* spelled out nor synonym-grouped:
- **"SS"** → 1 tangential hit (not the serotonin-syndrome teaching)
- **"TD"** → 1 tangential hit (not tardive dyskinesia)
- **"AMA"** → tangential hits (not against-medical-advice content)
**Fix (small, high-value):** add these bidirectional synonym groups to the `GROUPS` list in **both** build scripts' `build_search_index()`: `["ss","serotonin syndrome"]`, `["td","tardive dyskinesia","tardive"]`, `["ama","against medical advice","discharge ama"]`, and while there `["dts","delirium tremens"]`, `["wke","wernicke"]`, `["aws","alcohol withdrawal"]`, `["eps","extrapyramidal"]` (belt-and-suspenders). The "resume where I was" half of #7 is already implemented (`cw_last` + the Home "Resume" card) — it just needs the search-synonym layer to finish the ticket.

### 5.3 — [both] **P2 · M — Progress model reflects only 9 of 45 pages**
Because "Mark reviewed" only renders on the 9 `topic_meta` pages (§3.4), the Home ring reads **"X / 9"** while the "Coverage by section" bars use *all* nav pages as denominators — so most section bars can never reach 100% (e.g., a student can complete only 6 of 11 Core Topics because Geriatric/Perinatal/Nutrition/OMM/Differential have no button). Live-confirmed: **36 of 45 content pages cannot be marked reviewed.** Either extend `topic_meta`/mark-reviewed to all content pages, or decouple "Mark reviewed" from `topic_meta` so every page is trackable. Low-risk, improves the headline feature's honesty.

### 5.4 — [both] **P1 · M — Mobile long-table experience (#8) confirmed**
The SPA's `.md-body table` has `width:100%` but **no horizontal-scroll wrapper and no card-collapse** at narrow widths. Wide tables (e.g., the resident SS-vs-NMS 7-column table, family-modalities, evidence tables) will overflow or cramp on a phone. This matches your known gap #8. **Fix options:** wrap markdown tables in an `overflow-x:auto` container in the SPA (one CSS rule + a tiny post-render step), and/or surface the existing `pg_*` pocket cards as the condensed mobile view you planned. The `pg_interview.md` embedded `<iframe … height:1080px>` is a related fixed-height mobile risk.

---

## 6. Accessibility (WCAG AA)
Baseline a11y is **well-considered**: skip-link, `:focus-visible` outlines, `aria-label`/`aria-expanded`/`aria-haspopup` on the theme toggle and dock FAB, `inert`/`aria-hidden` on the closed mobile drawer, iframe `title`s, and `prefers-reduced-motion` guards throughout. Keyboard operability of nav/search/results/quiz is via real `<button>`s. **Honest limitation:** I did not run an automated contrast analyzer. Two spot-checks to do before you rely on AA: (a) the gold **"HIGH-YIELD"** chip text and the salmon **rule-out** chips against their tints in **dark mode**; (b) `--text-light` (#8a7c6e in dark) on dark surfaces for small text. Effort S to verify, likely fine but not measured.

---

## 7. Code / build health
- **Tools render, dark tokens inject, reduced-motion guards present, no console errors** on the pages sampled. `marked` loads locally (ward-wifi safe). ✅
- **Build scripts still contain hard-coded `/sessions/zen-loving-cori/mnt/…` sandbox paths** (both `build_deploy.py` and `resident_section.py`, plus the two `shutil.copy2("/sessions/zen-loving-cori/mnt/outputs/…")` lines). This is already noted in your handoff — a new session's mount prefix differs, so translate before running. **P1 for the next build session**, no learner impact.
- **`evidence_inpatient.md` housekeeping (P2):** duplicate *"The Joint Commission. Joint Commission (2018)."* citation lines, several citations missing article titles, and stray trailing commas in tables. Cosmetic.
- **`evidence_inpatient.md` internal tension (P1 · S · ATTEST):** §4 says *"most guidelines recommend avoiding IV treatments"* while the same section leads meth-agitation guidance with *"IV midazolam 5 mg + droperidol 5 mg."* Add a clause that IV is reserved for monitored settings / not first-line on a general unit. This page also carries explicit IM/IV **doses** and is shared MS3+Resident — consider a "dosing shown for reference; defer to institutional order sets" scope banner to preserve the MS3 dose-discipline the rest of the library maintains.

---

## 8. "Verify against primary source" cluster (overlaps your Tier-3 sheet)
These are plausible but carry **false precision** (two-significant-figure ORs/SMDs/NNTs) and should be confirmed against the cited source before you fully rely on them. I hard-verified the flagship (Miklowitz — wrong, §1.1) and confirmed Rodolico 2022 (OR 0.18; 90 RCTs; 10,340) is **accurate**. Remainder to check: Brief Psychotherapy — BA "SMD −0.78" (Uphoff 2020), PST "13.5% vs 22.1%, NNT 12" (Hatcher 2011), psychoeducation "readmission NNT 5 / relapse NNT 9" (Xia 2011); Family — "NNT 7" (Pharoah 2010), "≈3×" 7-day follow-up (Haselden 2019), EE "OR 4.87 / warmth 0.35" (Ma 2021); evidence page — catatonia "Cohen's d −3.15," "CALM 3.3%→0.83% at 180 d," restraint disparity "aOR 1.85 / 2.84." Most already live on your Tier-3 sheet; this review adds only that they should be **sourced or rounded** for a teaching audience.

---

## 9. Top 10 highest-yield fixes (ranked)

| # | Fix | Tag | P | Effort | Attest? |
|---|-----|-----|---|--------|---------|
| 1 | Replace fabricated **Miklowitz "OR 0.30 (SUCRA 95%)"** with sourced figures (OR 0.56 overall; family retention OR 0.46) | [both] | **P0** | S | Yes |
| 2 | Fix **QTc rounds-Q14 citation** Page 2016 → **Tisdale 2020** (matches your resident page) | [both] | P1 | S | Yes |
| 3 | Clozapine **"mandatory/required" → "recommended ANC per PI"** + 2025 REMS-eliminated note (resident) | [both] | P1 | S | Yes |
| 4 | Add **search synonym groups** for SS / TD / AMA (+ DTs, Wernicke, EPS) to both build scripts — closes #7 | [both] | P1 | S | No |
| 5 | Complete the **truncated rounds Q97** ("…decreased ant") + fix "hundred questions" count | [both] | P1 | S | Yes |
| 6 | **Mobile table** wrapper (`overflow-x:auto`) in the SPA + surface `pg_*` pocket cards — closes #8 | [both] | P1 | M | No |
| 7 | Add a **Core Topics: Eating Disorders** page (+ `topic_meta`) — top shelf/COMAT content gap | [both] | P1 | L | Yes |
| 8 | Reconcile **metabolic-monitoring schedule** (nutrition page vs rounds Q13) + add staged schedule to a resident ref | [both] | P2 | S | Yes |
| 9 | Extend **`reviewed.json` to a 3-state trust model** so the ~30 unlabeled clinical pages aren't ambiguous (your Finding #4) | [both] | P1 | M | Yes (status) |
| 10 | Fix **benzodiazepine-in-BPD endpoint** wording ("attempted or completed," add Lieslehto 2023 cite) | [both] | P2 | S | Yes |

---

## 10. Safe to implement now vs. needs your sign-off

**Safe to implement immediately (no clinical attestation needed — mechanical/UX/build):**
- #4 search synonyms (SS/TD/AMA/DTs/Wernicke/EPS)
- #6 mobile table wrapper + pocket-card surfacing
- Progress-model coverage fix (§5.3) — decouple "Mark reviewed" from `topic_meta` or extend meta
- `evidence_inpatient.md` cosmetic housekeeping (duplicate citation, trailing commas)
- Acronym expansions on `treatment_basics_digest.md` / geriatric jargon glosses (§4)
- Dark-mode contrast spot-check (§6)

**Needs your attestation before shipping (clinical fact/citation/status changes):**
- #1 Miklowitz rewrite · #2 QTc citation · #3 clozapine wording + REMS note · #5 Q97 completion · #7 Eating Disorders page content · #8 monitoring-schedule reconciliation · #9 review-status assignments · #10 BPD benzo endpoint · the §8 "verify" cluster · the evidence-page IV-route clarification (§7).

---

*Prepared by the review session (fable 5) · 2026-07-01 · No files edited. Miklowitz 2021 verified via PubMed ([DOI](https://doi.org/10.1001/jamapsychiatry.2020.2993)); clozapine REMS status via FDA/Psychiatric Times (Feb–June 2025). Pairs with `openevidence_library_accuracy_review_2026-07-01.md` and `Tier3_attestation_sheet_2026-07-01.md`.*
