# MASTER Attestation Ledger — one place to sign off

**Owner:** Joshua Moss, MD | Psychiatrist · **Assembled:** 2026-07-01
**Purpose:** Single source of truth for every open faculty-attestation item across the MS3 + Resident builds. Consolidates four previously-separate tracking surfaces so nothing is quoted to learners as settled until it carries your check here.

> **Why this exists.** Attestation state was scattered across four files: `_QA_REPORT.md` (June 26 per-file table, still blank; now archived at 99_Archive/root-planning-2026-07/), `Tier3_attestation_sheet_2026-07-01.md` (high-stakes numbers), `library_review_2026-07-01.md` (independent fable-5 audit, Top-10), and `openevidence_library_accuracy_review_2026-07-01.md` (OE Tiers). This ledger supersedes them for **sign-off tracking**; each source file remains the detailed record. When a block is fully checked, tell me and I apply + stamp `Reviewed by Joshua Moss, MD — <date>`.

**Legend:** ☐ not reviewed · ✅ approved · ✏️ approved with wording change (note it) · ⏸️ hold
**Tags:** [MS3] / [Resident] / [both] · **P0** safety/accuracy first · **Attest?** = needs your clinical sign-off before shipping
**Independent verification stamp:** 🔬 = re-verified this session against primary source (PubMed / FDA), not just inherited from the review.

---

## ⚡ SESSION LOG — 2026-07-01 (what I already did on your approvals)

**Staged to both deploy folders (`clerkship-hub-deploy`, `mmc-resident-deploy`) — awaiting your `netlify deploy` to go live:**
- **Block 1 (all 5 corrections) — APPLIED to source + both deploy folders.** P0 Miklowitz re-verified against PubMed (PMID 33052390: overall OR 0.56, family retention OR 0.46, family/group psychoed recurrence OR 0.12 — no "OR 0.30/SUCRA 95%"); clozapine REMS re-verified against FDA (removed June 13 2025). **Scope extension:** the same fabricated stat + QTc citation + truncated Q97 also lived in the `notebooklm_upload_2026-07-01` bundle (the review had marked it out of scope) — I corrected those too, so nothing fabricated propagates into generated audio.
- **Block 2 — RELEASED.** `reviewed.json` extended 14 → 22 (added the 8 content pages: t_mood, t_psychosis, t_anxiety, t_sud, t_personality, t_geri, t_perinatal, ddx) across the master + both deploys. Build auto-strips the "pending review" banners.
- **Block 4 (partial) — DONE.** Search synonyms added to both build scripts (`ss`↔serotonin syndrome, `td`↔tardive dyskinesia, `ama`, `dts`, `wke`/wernicke, `aws`, `eps`, + eating-disorder group). Mobile long-table wrapper added to the SPA (`display:block;overflow-x:auto` — verified the shell changed by *only* that one rule). **Build scripts' dead `/sessions/zen-loving-cori/…` paths fixed → now session-portable** (derive from script location; honor `OUT_DIR`/`MS3_DIR` env), and `spa_index.html`/`marked.min.js` now read from the script's own dir — this fixes the §7 blocker.

**Block 5 — Eating Disorders page — ✅ ATTESTED by Joshua Moss, MD (2026-07-01).**
- `03_Core_Topics/Eating_Disorders/…` (deploys as `t_eating.md`) + `topic_meta` entry + nav/search wiring. Pending banner removed, footer stamped attested, `reviewed.json` chip added (master + both deploys). Verified present + chipped in both live deploy folders.

**⚠️ Concurrency note (2026-07-01):** a second chat session was building/deploying these same folders in parallel. Diagnosed as additive — no pages dropped by either side; my corrections + ED page coexist with the other session's newer pages (deploy grew to 56 pages / reviewed.json 41 keys). All my changes are canonical in the **library source**, so any clean build reproduces them. **Coordinate the final build + `netlify deploy` from one place** to avoid the two sessions overwriting each other's in-flight deploy artifacts.

**Verified this session:** both builds run clean (0 missing files, 62 MS3 / 57 resident pages); the generated SPA is byte-identical to the previously-deployed shell except the one intended table rule; each site's `.netlify` linkage preserved; rollback backups at `/tmp/bak_ms3`, `/tmp/bak_res`.

**NOT done — still needs you / deferred:**
- **Block 3 & Block 6** (high-stakes numbers + clinical reconciliations: metabolic-monitoring schedule, CIWA-Ar bands, evidence-page IV-route) — untouched; these need your clinical sign-off. Decide them here and I'll apply.
- **Block 4 P2 polish** — acronym glosses (`exp_tx`/geriatric), `evidence_inpatient` cosmetic cleanup, and the progress-model decouple (SPA JS, §5.3) — deferred as low-priority; offered for a next pass.

**To publish (from your machine / Desktop Commander, ideally AFTER attesting the Eating Disorders page + Block 6):**
```
netlify deploy --prod --dir=/Users/jm/clerkship-hub-deploy
netlify deploy --prod --dir=/Users/jm/mmc-resident-deploy
```
*I did not auto-publish on purpose — it would push the pending Eating Disorders page and preempt your sign-off. Say the word and I can run these via Desktop Commander.*

---

## BLOCK 1 — Verified factual corrections (drafted, ready to apply on your OK)
*Each is a factual/citation error with a sourced fix already written. Five items. Highest priority.*

| # | Item | Tag | P | 🔬 | Decision |
|---|------|-----|---|----|----------|
| 1 | **Miklowitz "OR 0.30 (SUCRA 95%)" is fabricated** — replace with sourced figures | [both] | **P0** | 🔬 verified PMID 33052390 | ☐ |
| 2 | **QTc rounds-Q14 citation** Page 2016 → Tisdale 2020 | [both] | P1 | — | ☐ |
| 3 | **Clozapine "mandatory/required" → "recommended ANC per PI"** + 2025 REMS-eliminated note | [both] | P1 | 🔬 verified FDA 2025 | ☐ |
| 4 | **Truncated rounds Q97** ("…decreased ant") — complete evidence line; fix "hundred questions" count | [both] | P1 | — | ☐ |
| 5 | **BPD/benzodiazepine endpoint** — "highest completed-suicide" → "attempted or completed" + add Lieslehto 2023 cite | [both] | P2 | — | ☐ |

**Item 1 — exact fix (drafted):**
> Replace: *"OR 0.30 (SUCRA 95%) — family/conjoint therapy is the strongest psychosocial option for preventing recurrence (Miklowitz 2021; 39 RCTs)."*
> With: *"Adjunctive manualized psychotherapies reduced recurrence vs. control (OR 0.56, 95% CI 0.43–0.74); family/group-format psychoeducation was the standout for recurrence (OR 0.12, 0.02–0.94), and family/conjoint therapy improved treatment retention (OR 0.46, 0.26–0.82) and helped stabilize depressive symptoms (SMD −0.46, NS) (Miklowitz et al., JAMA Psychiatry 2021; 39 RCTs)."*
> **Verified this session:** all four figures match the paper's abstract via PubMed. "39 RCTs" was correct; only the OR/SUCRA was invented.

**Item 2 — exact fix:** Q14 "Key paper" → *"Tisdale JE et al., 'Drug-Induced Arrhythmias: A Scientific Statement From the American Heart Association,' Circulation 2020;142(15):e214–e233."* (matches your resident `cl_reference.md`.)

**Item 3 — exact fix:** (a) psychosis page + rounds Q7: "required/mandatory monitoring" → *"recommended ANC monitoring per the prescribing information."* (b) one-line note on `adv_psychopharmacology.md`: *"The clozapine REMS was discontinued in 2025; ANC monitoring remains guideline/PI-recommended, not REMS-enforced."* **Guard-rail:** do NOT purge REMS language library-wide — esketamine (Spravato) and inhaled loxapine (Adasuve) REMS remain active in 2026.

**Item 4 — exact fix:** complete Q97 (2004 antidepressant black-box → decreased AD prescribing + debated youth-suicide-attempt signal; Gibbons 2007 / Lu 2014) and change intro to "nearly a hundred" (bank ends at Q97) or add 3 questions.

**Item 5 — exact fix:** *"highest risk of attempted or completed suicide of any psychotropic class studied in BPD (HR 1.61, 95% CI 1.45–1.78; Lieslehto 2023)."*

---

## BLOCK 2 — June 26 AI-drafted core content (both reviews found clinically accurate)
*8 markdown files + 6 tools. The June 26 QA and the July 1 audit both cleared these as accurate, non-stigmatizing, appropriately dose-disciplined. They carry "pending Dr. Moss review" banners and no green chip. Approving flips banners + stamps `reviewed.json`.*

| File / tool | Both reviews' verdict | Your practice-check flag | Decision |
|---|---|---|---|
| Mood one-pager | Accurate | ECT first-line for psychotic/catatonic/life-threatening depression; "lithium = strongest maintenance" | ☐ |
| Psychosis one-pager | Accurate | Clozapine after "two adequate trials"; metabolic cadence | ☐ |
| Anxiety/Trauma/OCD one-pager | Accurate | **Benzo-avoidance phrased strongly — confirm unit nuance** | ☐ |
| Personality one-pager | Accurate, non-stigmatizing | "Brief admissions for chronic BPD" framing | ☐ |
| SUD/Withdrawal one-pager | Accurate | **Bupe induction "COWS ≈ ≥8–12" — confirm your threshold** | ☐ |
| Geriatric one-pager | Accurate | ECT "early, not last resort" late-life | ☐ |
| Perinatal one-pager | Accurate | Lithium/valproate-in-lactation; zuranolone (see Block 3-A) | ☐ |
| DDx scaffolds | Accurate | Syndrome list matches your teaching | ☐ |
| MSE · Capacity · Oral Pres · Violence/Brøset · Withdrawal · Reflection tools | Function + disclaimers + scale items verified | Framing matches institutional policy | ☐ |

---

## BLOCK 3 — High-stakes numbers (from Tier-3 sheet; verify vs. primary source or practice)
*Teratogenicity / lactation / dosing thresholds + observational figures. Some HELD (not live), some LIVE-flagged. Full detail in `Tier3_attestation_sheet_2026-07-01.md`.*

**3-A. Perinatal teratogenicity & lactation (NOT LIVE — held):** lithium 1st-tri cardiac RR; valproate malformation/IQ/autism; lamotrigine PK; paroxetine; lactation RIDs; zuranolone/brexanolone status. ☐
**3-B. Catatonia lorazepam dosing (resident, live-flagged):** 2 mg IV challenge, ≥50% BFCRS = positive, ~90% effective. Placement already ✅ (dose-free MS3, dosed resident). Clinical numbers ☐
**3-C. Shipped-but-flagged observational:** benzo/BPD HR 1.61 (= Block 1 #5); restraint disparity aOR 1.85/2.84; SDOH readmission aOR 12.55; AD black-box NNH ~110/NNT ~10. ☐
**3-D. C-L dose thresholds (resident, live):** cyproheptadine; lithium HD >4.0; QTc ≥500/Δ≥60; NMS CK; capacity contributors. ☐
**3-E. Data-quality flag:** SDOH export had a corrupted reference list — re-verify 3-C bracket citations against named primary sources. ☐

---

## BLOCK 4 — Safe to implement now (NO attestation — mechanical / UX / build)
*No clinical fact changes. Note: items touching build scripts live in the deploy repos and per your tooling rules are better run from Claude Code / Desktop_Commander (hard-coded sandbox paths in `build_deploy.py` + `resident_section.py` must be translated first — §7 of the audit).*

- [ ] Search synonym groups (SS↔serotonin syndrome, TD↔tardive dyskinesia, AMA↔against medical advice, +DTs/Wernicke/EPS) → both build scripts' `GROUPS` — *build script*
- [ ] Mobile long-table wrapper (`overflow-x:auto`) in SPA + surface `pg_*` pocket cards — *SPA/build*
- [ ] Progress model: decouple "Mark reviewed" from `topic_meta` (or extend meta to all 45 pages) so coverage bars can reach 100% — *build*
- [ ] `evidence_inpatient.md` cosmetic housekeeping (dup Joint Commission cite, trailing commas, missing article titles) — *content, safe*
- [ ] Acronym expansions on `treatment_basics_digest.md` (EPS/NMS/QTc) + geriatric jargon glosses — *content, safe*
- [ ] Dark-mode contrast spot-check (gold HIGH-YIELD chip, salmon rule-out chips, `--text-light` small text) — *verify only*

---

## BLOCK 5 — Content gaps to build (author, then attest)

- [ ] **Eating Disorders core-topic page** (`t_eating.md` + `topic_meta` entry) — the clearest shelf/COMAT hole (AN/BN/BED, refeeding, electrolytes, admission criteria, fluoxetine 60 mg BN). **P1 · L · Attest.**
- [ ] `reviewed.json` → **3-state trust model** (reviewed / pending / AI-draft) so the ~30 unlabeled clinical pages aren't ambiguous (Finding #4). **P1 · Attest (status).**
- [ ] Consolidated antipsychotic **metabolic-monitoring schedule** + lithium range in one resident reference — resolves the nutrition-page vs. rounds-Q13 conflict. **P2.**
- [ ] (Secondary) Sleep Disorders page — lower priority than ED.

---

## BLOCK 6 — Internal-consistency reconciliations (pick one, make both match)

- [ ] **Metabolic-monitoring cadence:** `nutrition_metabolic.md` ("baseline, ~12 wk, then annually") vs. rounds Q13 ("weight monthly ×3 then quarterly; glucose/lipids baseline, 12 wk, annually"). Recommend standardizing on staged ADA/APA (weight 4/8/12 wk then quarterly). **Attest.**
- [ ] **CIWA-Ar bands:** tool ("≤8 / 9–19 / ≥20") vs. rounds Q46 ("<8–10 / 8–18 / ≥19"). Pick one + cite source.
- [ ] `evidence_inpatient.md` IV-route tension: "avoid IV" vs. "IV midazolam+droperidol" for meth agitation — add "IV reserved for monitored settings / not first-line on a general unit." **Attest.**
- [ ] §8 "false-precision" cluster — source-or-round the two-sig-fig ORs/SMDs/NNTs (BA −0.78, PST NNT 12, psychoed NNT 5/9, family NNT 7, EE OR 4.87). Rodolico 2022 already ✅ verified accurate.

---

### Sign-off
- Reviewed by: __________________________  Date: __________
- Global notes / wording changes:

*Assembled by the attestation session (fable 5), 2026-07-01. Miklowitz 2021 re-verified via PubMed; clozapine REMS via FDA. Pairs with the four source files named at top. No learner-facing files were edited in assembling this ledger.*
