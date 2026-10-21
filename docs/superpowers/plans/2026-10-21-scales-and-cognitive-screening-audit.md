# Scales & cognitive-screening audit — what ships, what to fix, what to add

**Date:** 2026-10-21 · **Verified at:** `main` @ `ba4a5a2` · **Status:** proposal for the author (Joshua Moss, MD); nothing here changes a rights disposition, a page, or a registry. Every "build" item below is gated on the decision table in §8.

**Standing rule this document lives under:** *the library teaches administration; it never reproduces a copyrighted instrument; scope is a faculty decision, not an agent's* (CLAUDE.md invariant 8; `instrument_rights.json`; Option A, 2026-08-23). Rights notes below are **research findings for the author to act on**, not dispositions. A status in `instrument_rights.json` moves only with a `decisionRef`.

---

## 0. Summary

**What ships today.** Two scored tools (COWS on `withdrawal.html`; PHQ-9/GAD-7 on `screeners.html`), three link-only stubs (C-SSRS, BFCRS, CIWA-Ar), one in-house warning-sign checklist (`violence.html`), CIWA-Ar score bands on `decision-aids.html`, and prose mentions of MoCA/MMSE/CAM/4AT in the MSE module and the delirium and neurocognitive pages. **The library has no cognitive, delirium, movement-disorder, trauma, or substance-screening tool**, and no instrument can hold two data points in time.

**The five findings that matter most.**

1. **COWS is the one scored instrument the library fully controls, and it is under-built.** The anchor retirement (2026-09-10) settled the rights question; the pedagogy items that were specified alongside it (`SPEC_Withdrawal_Instrument_Redesign_v1.md` §2.3, §2.4, §4, §5) are unbuilt and are no longer blocked. The strongest evidence-backed additions are serial trending, an objective-sign readout keyed to the canonical "COWS ≥ 8 with one objective sign" statement, per-item confounds, and a rater-calibration exercise. None restores a single published anchor.
2. **The CIWA-Ar tab makes a promise it does not keep.** It says administration teaching "is authored separately and is not yet published here" — since 2026-08-28. The `decision-aids.html` CIWA bands also need a check against the ASAM 2020 categories the page itself cites.
3. **Cognitive and delirium screening is the largest teaching gap**, and the one with the cleanest rights path. The 4AT is published under **CC BY 4.0** by its authors (the4AT.com/attribution), which would make it the first instrument this library could ship verbatim with a recorded licence rather than a waiver. MoCA, MMSE, Mini-Cog, SLUMS and CAM are link-only candidates with different reasons each (§5).
4. **Three high-yield, public-domain instruments are missing**: AIMS (NIMH, public domain; the medication-monitoring page already names it), ASQ (NIMH, public domain; validated in adult medical inpatients with sensitivity 100 %), and the VA's PC-PTSD-5 / PCL-5. Each still needs a recorded disposition before a line of it ships.
5. **Governance needs one small addition.** `instrument_rights.json` has `retired`, `restricted` and `provisional`; it has no `cleared` / `public-domain` status, so even a federal instrument cannot be recorded as shippable without inventing a status. That is a one-line schema change and a policy PR, and it is what every build item below is waiting on.

---

## 1. Inventory — what ships today

Audited at source (`NN_Category/`) and against `instrument_rights.json`, `tool_registry.json`, `decisions.json`, and the tests that pin each surface.

| Surface | Instrument(s) | What actually ships | Rights status (registry) | Pinned by | Gaps found |
|---|---|---|---|---|---|
| `withdrawal.html` (COWS tab) | COWS | 11 items, legal sparse values only (`cows-legal-values.test.mjs`), in-house descriptors, 4 published bands, live gauge, "drivers" panel, NIDA route | `retired` (anchors) — item names and score values are facts and stay | `cows-legal-values`, `withdrawal-presentation`, `instrument-rights-gate` (5 signatures) | No trend; no objective-sign readout; no per-item confounds; no onset-window context; no precipitated-withdrawal card; no calibration; no documentation string |
| `withdrawal.html` (CIWA-Ar tab) | CIWA-Ar | Stub: safety pearl, rights explanation, Sullivan 1989 citation, CSAM route, one "use it well" pearl | `retired` (2026-08-28, author) | `ciwa-retirement.test.mjs` | Promised administration teaching unpublished; non-communicative-patient pathway is one clause ("RASS/PAWSS") and misdescribes PAWSS |
| `decision-aids.html` ("CIWA-Ar bands") | CIWA-Ar | Three bands: ≤ 8 · 9–19 · ≥ 20 | — (bands only; audit called it "borderline") | — | Bands do not match ASAM 2020's mild < 10 / moderate 10–18 / severe ≥ 19 (verify against full text; `asam-alcohol-withdrawal-2020` is the page's own evidence id) |
| `screeners.html` | PHQ-9, GAD-7 | Both instruments verbatim with official wording, bands, item-9 flag → `cssrs.html`, phqscreeners route, crisis block | `provisional` (WP-02c evidence complete; `cleared` awaits the author's record) | `screeners-official-form.test.mjs` | No PHQ-2/GAD-2 two-step teaching; no "what a 10 does not tell you" beyond one line; item-9 route lands on a link stub |
| `cssrs.html` | C-SSRS | Rights stub + Columbia route + training link | `retired` | `cssrs-retirement.test.mjs` | Stage 2 (administration teaching) still author-gated |
| `bfcrs.html` | BFCRS | Rights stub + URMC route (scale, manual, videos) | `restricted` | `retired-instrument-presentation` | WP-22 blocked on URMC written permission |
| `violence.html` | FRST (named), in-house warning-sign list | Generic checklist authored in-house; FRST described, not reproduced; MMC validation cited (Racine 2025) | not registered (nothing reproduced) | — | **ODC-4 still open**: attested prose page sends learners to a Brøset tool that does not exist; FRST has no public route |
| `mse.html` | MoCA, MMSE, 4AT, CAM | Named in one pearl: delirium screen first, MoCA only after delirium is excluded | n/a | — | The right rule, with nothing behind it to practise |
| `delirium.md`, `neurocognitive.md`, `geriatric.md` | CAM features; MoCA > MMSE | Prose; CAM's four features walked correctly; `nasreddine-2005-moca` already in the registry | n/a | — | No attention-testing trainer; no structured screen; no delirium-vs-dementia-vs-depression table |
| `capacity.html` | — | Four-abilities workbench (in-house) | n/a | `capacity-verdict.test.mjs` | Could route to the free Aid to Capacity Evaluation (Etchells 1999) |
| Question bank / topic_meta | CIWA 7 · PHQ-9 4 · COWS 3 · CAM 3 · Y-BOCS 1 · EPDS 1 items | Items reference scales learners cannot practise here | — | — | — |

**What the curriculum names but never operationalises** (counts are files mentioning the scale, non-archive): AIMS (6), MDQ (6), EPDS (4), AUDIT-C / CAGE (rounds questions), PCL-5 (resident COTW), MADRS / QIDS (resident COTW), Y-BOCS (anxiety page), STOP-BANG (sleep page), BVC / DASA / HCR-20 (violence page), RASS / CAM-ICU / bCAM (agitation and delirium COTWs), PANSS (therapy reading room).

---

## 2. COWS — what the evidence says the tool should teach

According to PubMed (DOIs linked), the instrument's own literature supports exactly the enhancements the 2026-08 spec asked for, and adds two the spec did not have.

| Finding | Source | What it changes on the page |
|---|---|---|
| COWS was validated against the CINA under naloxone challenge (r = 0.85 for peak scores; Cronbach's α 0.78) — it is a valid acute-withdrawal measure, not a folk score | Tompkins 2009, *Drug Alcohol Depend*, PMID 19647958, [10.1016/j.drugalcdep.2009.07.001](https://doi.org/10.1016/j.drugalcdep.2009.07.001) | Keep the scale; say what it was validated against |
| A one-factor model does not fit: resting pulse was unrelated to the withdrawal construct in men; yawning and gooseflesh unrelated in women (CTN-0003, n = 516) | Barbosa-Leiker 2015, PMID 25908321, [10.1016/j.drugalcdep.2015.03.036](https://doi.org/10.1016/j.drugalcdep.2015.03.036) | The "drivers" panel should not imply every item carries equal meaning; teach that the total, not a single item, is the decision input |
| Nurse–physician agreement: moderate for severity category (κ 0.55), substantial for the ≥ 5 cut (κ 0.65); **only pulse reached substantial per-item agreement** | Tomaszewski 2021, PMID 34179884, [10.1002/emp2.12462](https://doi.org/10.1002/emp2.12462) | This is the empirical case for the rater-calibration module (§3, C7): the subjective items are where raters diverge |
| Precipitated withdrawal, defined as a ≥ 5-point COWS rise within 4 h of the first dose, occurred in 11.5 % of ED/hospital initiations (16.3 % of confirmed-fentanyl patients); BMI ≥ 30 and urine fentanyl ≥ 200 ng/mL were associated | Thakrar 2024, *JAMA Netw Open*, PMID 39331392, [10.1001/jamanetworkopen.2024.35895](https://doi.org/10.1001/jamanetworkopen.2024.35895) | Gives the page a **research definition of precipitated withdrawal that is itself a COWS delta** — the single best reason the tool needs a second data point |
| In a 29-site ED RCT (n ≈ 2,000; 76 % fentanyl-positive), precipitated withdrawal was rare: 0.6 % extended-release, 0.8 % sublingual; enrolment required COWS ≥ 4 | D'Onofrio 2026, *JAMA*, PMID 41670966, [10.1001/jama.2025.27019](https://doi.org/10.1001/jama.2025.27019) | Already the optional `donofrio-2026-ed-bup` span in the 2026-09-24 remediation §7-C; MaineHealth Maine Medical Center was a site (Strout, Baumann) — worth saying on a Portland-facing page |
| Fentanyl's lipophilicity and peripheral accumulation produce a long terminal phase and "fentanyl rebound"; implications for withdrawal timing and buprenorphine-precipitated withdrawal | Bird 2023, *J Addict Med*, PMID 37788600, [10.1097/ADM.0000000000001185](https://doi.org/10.1097/ADM.0000000000001185) | The mechanism sentence behind the spec's "a patient can be 30+ hours out and still score below threshold" |
| Hospital OUD care in the fentanyl era: low-dose initiation with opioid continuation, rapid methadone titration and alternative agonists are emerging practices; fentanyl "has rendered traditional techniques … inadequate for some patients" | Englander 2024, *JAMA Intern Med*, PMID 38683591, [10.1001/jamainternmed.2023.7282](https://doi.org/10.1001/jamainternmed.2023.7282) | Citable anchor for the two-branch panel (§3, C5) without claiming low-dose initiation is proven superior — ASAM's "no available data exist to recommend a specific dosing schedule" stays |
| K-COWS correlates strongly with SOWS (r = 0.74) but weakly with craving measures (r ≈ 0.2) | Jang 2026, PMID 41696705, [10.3389/fpubh.2025.1706053](https://doi.org/10.3389/fpubh.2025.1706053) | Teach plainly: **COWS does not measure craving, insomnia or dysphoria**; those are SOWS / craving-scale territory |
| A free Spanish-language COWS (ECAO) now exists, rated accurate by 107 providers | Bourdon 2026, PMID 41884288, [10.2147/SAR.S588456](https://doi.org/10.2147/SAR.S588456) | A second route on the page for Spanish-speaking patients (link-only; verify the host before recording a `formUrl`) |

Already settled and **not** reopened here: the canonical §7-C statement (approved 2026-09-24) — teach the principle, not one number; "COWS ≥ 8 with one objective sign" is ASAM's 2023 high-potency-synthetic-opioid wording (Weimer 2023, PMID 37934520); the tool's Mild-band copy was already reworded to it.

---

## 3. COWS tool — proposed improvements (all in-house; none touches anchor text)

Rights check for every item: the 45 withdrawn anchors stay withdrawn; `instrument-rights-gate.mjs` signatures are untouched; `tests/cows-legal-values.test.mjs` and `withdrawal-presentation.test.mjs` continue to pass unchanged. Everything below is *administration teaching* under the rule.

| # | Improvement | What it looks like | Evidence hook | Effort | Needs the author? |
|---|---|---|---|---|---|
| **C1** | **Serial trending** (WP-21, spec §4) | "Log this score" → sparkline of the last 8, Δ per hour, one-line read ("Rising 4 in 2 h"). Keys `cw_cows_series_v1` / `rp_cows_series_v1`; 7-day expiry; "Clear series"; no free-text field; no-PHI banner before first entry | Thakrar 2024 — precipitated withdrawal *is* a COWS delta | 4 h | No (WP-21 was blocked only on WP-20, which closed 2026-08-28; it is agent-executable now) |
| **C2** | **Objective-sign readout** | Beside the total: "Objective signs scored: 3 of 8 (pulse, tremor, pupils)". Then a teaching line, not an order: "Your team's gate is commonly COWS ≥ 8 with at least one objective sign." Objective set = the eight `OBSERVED`-tagged items already in the data | Weimer 2023 Table 3 (canonical §7-C); Tomaszewski 2021 on where raters disagree | 2 h | Confirm the wording matches §7-C (it does) |
| **C3** | **Per-item confound line** (spec §0.2 line 4) | Under each item, one in-house sentence: pulse — beta-blockade, stimulants, fever, pain, anxiety; sweating — room temperature, fever, alcohol withdrawal; pupils — lighting, recent opioid, anticholinergic/stimulant mydriasis; tremor — alcohol/benzodiazepine withdrawal, lithium, caffeine, essential tremor; yawning — fatigue; GI — intercurrent illness; anxiety — baseline anxiety disorder; gooseflesh — cold room | The rule's own mandate ("the confounds"); Barbosa-Leiker 2015 on pulse | 2 h | Review of the eight sentences |
| **C4** | **Context panel: last use + opioid type → expected onset** | Three chips (short-acting / fentanyl / methadone or other long-acting) and a free-of-numbers onset note; link to the withdrawal timeline on `decision-aids.html` | Bird 2023; spec §2.3 | 2 h | Review the three sentences |
| **C5** | **"When the standard gate fails" panel** (spec §2.4) | Branch A (standard, COWS-gated) vs Branch B (low-dose overlap) vs the high-dose option; "student role: recognise which branch, do not invent a protocol" | Englander 2024; ASAM 2020 (PMID 32511106); Weimer 2023 | 3 h | **Yes** — this is WP-25 content (author-gated); the spec text is a draft, not approved copy |
| **C6** | **Precipitated-withdrawal recognition card** | What it looks like (abrupt rise after the first dose), the research definition (≥ 5-point rise within 4 h), the first response (more buprenorphine, per ASAM 2023), when to call — no doses | Thakrar 2024; Weimer 2023 | 1 h | Review |
| **C7** | **Rater-calibration module** (spec §5) | 6–8 fictional 60-word observations per high-variance item (restlessness, pulse, gooseflesh, anxiety); criterion score set by three faculty raters; feedback names the error type (halo / reported-as-observed / construct bleed / manoeuvre not performed / confound not excluded); "this instrument does not apply here" as a correct answer; signed mean error reported | Tomaszewski 2021 (only pulse substantial per item) | 8 h + an afternoon of faculty rating | **Yes** — criterion scores are faculty work; the shell is agent-buildable |
| **C8** | **Documentation string** | "Copy note line": `COWS 14 (moderate) — pulse 2, sweating 2, tremor 2, GI 3, anxiety 2, yawning 2, nose 1; objective signs 5/8; last use ~18 h (short-acting)` — synthesises what a resident actually charts; nothing stored | — | 1 h | No |
| **C9** | **"What COWS does not measure"** pearl | Craving, insomnia, dysphoria; point to SOWS as the subjective complement (link-only — see rights note) and to craving VAS | Jang 2026 | 0.5 h | Review |
| **C10** | **Spanish route** | Second route block: ECAO (free Spanish COWS) | Bourdon 2026 | 0.5 h | Needs a verified custodian URL recorded in `officialSource` before it ships |
| **C11** | **Paired-rater exercise page** (spec §5.6) | One printable page for week one: two learners, one patient, locked scores, three questions per discordant item | — | 1 h | Review |

**SOWS / OOWS rights note (for C9).** Handelsman 1987 (*Am J Drug Alcohol Abuse*, PMID 3687892) is a Taylor & Francis title — the same chain-of-title problem recorded for COWS in `rq-10-2026-09-10` f2. AHRQ's Integration Academy lists SOWS as "copyrighted, freely available"; NIDA DataShare hosts it. Treat as **link-only** until the author records otherwise; do not program it.

**Order of build if approved as a set:** C1 → C2 → C8 → C3 → C6 → C9 → C4 → C11 → C7, with C5/C10 waiting on their gates. C1, C2 and C8 are a single PR; they touch only `withdrawal-ciwa-cows-card.html` and one new test (`cows-series.test.mjs`, controlled fixtures, no live state — invariant 10).

---

## 4. Alcohol withdrawal — the CIWA-Ar tab and `decision-aids.html`

| # | Finding | Evidence | Proposal | Gate |
|---|---|---|---|---|
| **A1** | The tab promises administration teaching that has not been published since 2026-08-28 | — | Either author it (item *names* + elicitation + validity conditions, no descriptors — the pattern the retirement decision left open) or delete the promise. A page should not say "not yet published here" for two months | **Author** |
| **A2** | Fewer than half of patients on a CIWA-Ar protocol in a general hospital met the two preconditions (intact verbal communication and recent drinking); 7 of 11 adverse events occurred in patients inappropriately on the protocol | Hecksel 2008, *Mayo Clin Proc*, PMID 18315992, [10.4065/83.3.274](https://doi.org/10.4065/83.3.274) | The tab's best sentence ("CIWA assumes the patient can communicate…") becomes a two-item **preconditions check** the learner answers before anything else | Review |
| **A3** | **PAWSS** predicts *complicated* withdrawal before symptoms start: at ≥ 4, sensitivity 93.1 %, specificity 99.5 % in 403 medically ill inpatients; inter-rater concordance 0.96 | Maldonado 2015, PMID 25999438, [10.1093/alcalc/agv043](https://doi.org/10.1093/alcalc/agv043); derivation Maldonado 2014, PMID 24657098, [10.1016/j.alcohol.2014.01.004](https://doi.org/10.1016/j.alcohol.2014.01.004) | WP-23 (blocked-author). Rights: published in Elsevier and OUP journals; the ten items are plain clinical-history facts, but the form's wording is the authors'. Ship the **concept, threshold and link**; do not program the ten stems until a disposition is recorded | **Author** (WP-23) + a rights row |
| **A4** | For the patient who cannot do CIWA-Ar: the 5-item **BAWS** (≥ 3 predicts CIWA-Ar ≥ 8, sensitivity 85 %, specificity 66 %); in a **psychiatric** sample BAWS sensitivity 79 % vs CIWA-Ar 47 % at the ≥ 8 cut, specificity 88 % both, 65 s vs 120 s to administer | Rastegar 2017, PMID 28699845, [10.1080/08897077.2017.1354119](https://doi.org/10.1080/08897077.2017.1354119); Elefante 2020, PMID 32209957, [10.1097/ADM.0000000000000655](https://doi.org/10.1097/ADM.0000000000000655); Lindner 2019, PMID 30741834; Rastegar 2020 ICU, PMID 32851920 | Replace the "RASS/PAWSS" clause with a **non-communicative-patient pathway**: objective scales (BAWS, GMAWS — McPherson 2012, PMID 22328545), RASS-anchored ICU protocols, and the local phenobarbital protocol by name only. The psychiatric-population result is the one to teach on a psychiatry site | Review; BAWS items are link-only (Taylor & Francis journal) |
| **A5** | `decision-aids.html` bands (≤ 8 / 9–19 / ≥ 20) vs the ASAM 2020 categories (mild < 10, moderate 10–18, severe ≥ 19) that the page cites as its evidence | `asam-alcohol-withdrawal-2020` (registry) | Verify against the guideline full text, then align the three bands and label them "ASAM 2020 categories" — or label the current ones as the local protocol's if that is what they are | **Author** (which bands MMC's order set uses) |

---

## 5. Cognitive and delirium screening — the gap, the evidence, and the rights path

The clerkship objectives name "Recommend and Interpret Common Diagnostic and Screening Tests" as a shelf competency; the MSE module's pearl states the right rule (delirium screen first, MoCA only once delirium is excluded); nothing lets a learner practise either. This is the largest teaching gap in the scales inventory and, unusually, the one with an **open-licence instrument** at its centre.

### 5.1 What the evidence supports

| Instrument | Key evidence (PubMed) | Take-home for the unit |
|---|---|---|
| **4AT** | Pooled sensitivity 0.88, specificity 0.88 across 17 studies, 3,702 observations — Tieges 2021, *Age Ageing*, PMID 33951145, [10.1093/ageing/afaa224](https://doi.org/10.1093/ageing/afaa224). Head-to-head RCT vs CAM in 785 acute medical patients ≥ 70: 4AT sensitivity 76 % / specificity 94 %; CAM 40 % / 100 % — Shenkin 2019, *BMC Med*, PMID 31337404, [10.1186/s12916-019-1367-9](https://doi.org/10.1186/s12916-019-1367-9). Original validation — Bellelli 2014, PMID 24590568. Accuracy consistent across baseline-cognition tertiles — Hogan 2026, PMID 42341202 | Under 2 minutes, no training, usable in the patient who cannot speak (alertness and acute-change items score without engagement). The CAM's low real-world sensitivity when used by non-experts is the teaching point |
| **CAM** (algorithm) | Inouye 1990, *Ann Intern Med*, PMID 2240918 — the four features the delirium page already teaches | Keep as the diagnostic *concept*; the operationalised instruments (3D-CAM, CAM-ICU) are the tools |
| **3D-CAM** | Sensitivity 95 %, specificity 94 %, median 3 min — Marcantonio 2014, PMID 25329203, [10.7326/M14-0865](https://doi.org/10.7326/M14-0865); vs CAM-ICU on general medicine: 95 % vs 53 % sensitivity, CAM-ICU 30 % in mild delirium — Kuczmarska 2016, PMID 26443577 | CAM-ICU belongs in the ICU; teach why it misses mild and hypoactive delirium on a ward |
| **bCAM / Delirium Triage Screen** | Two-step ED approach: DTS sensitivity 98 % (rule-out), bCAM specificity 96–97 % (rule-in) — Han 2013, PMID 23916018 | The ED model MMC's ED may already use; worth asking |
| **Months-of-the-year-backward, digit span** | Operationalised as the 4AT attention item; the delirium page already instructs it | Public-domain bedside tasks — the one trainer that needs no rights decision at all |
| **MoCA** | Best alternative for MCI (sensitivity 0.89, specificity 0.75); Mini-Cog and ACE-R best for dementia (0.91/0.86; 0.92/0.89); MMSE 0.81/0.89 — Tsoi 2015, *JAMA Intern Med*, PMID 26052687, [10.1001/jamainternmed.2015.2152](https://doi.org/10.1001/jamainternmed.2015.2152). Original: Nasreddine 2005, PMID 15817019 (already `nasreddine-2005-moca`) | Teach interpretation: cut-off 26, the one-point education adjustment, and that a MoCA during delirium is uninterpretable |
| **Mini-Cog** | Sensitivity 76 %, specificity 89 % for dementia in a population sample, equal to the MMSE at 25 — Borson 2003, PMID 14511167 | Three-word recall + clock: the fastest dementia screen for a busy unit |
| **SLUMS** | Comparable to the MMSE for dementia, better for mild neurocognitive disorder in a VA sample (n = 702) — Tariq 2006, PMID 17068312 | The free alternative many systems adopted when the MMSE became fee-bearing |
| **MMSE** | Folstein 1975, PMID 1202204 | Teach its ceiling effect and why institutions moved away; not a build candidate |
| **Clock drawing** | Shulman 2000 review of scoring systems, PMID 10861923 | A public-domain *task*; scoring-system descriptions are authored text — any trainer uses in-house criteria and synthetic clocks |
| **RUDAS** | Storey 2004, PMID 15190994 | The multicultural / low-literacy option; free |
| **FAB** | Dubois 2000, PMID 11113214 | Frontal/executive bedside battery; link-only |

### 5.2 The rights picture (research findings, not dispositions)

| Instrument | What the custodian says (secondary unless noted) | Library pattern this implies |
|---|---|---|
| **4AT** | the4AT.com/attribution: licensed **CC BY 4.0**; "no permission, payment or registration is required"; credit line "4AT © 2011–2014 Alasdair MacLullich, Tracy Ryan and Helen Cash"; any change to wording, items, instructions, response options, thresholds or interpretation is a *modified version* that must say so and may not claim the validation evidence | **The only candidate for a verbatim scored tool.** Capture the attribution page into `docs/permissions/` the way PHQ was captured; author records `cleared`; ship unmodified with the credit line, or ship administration-only and link |
| **CAM** (long and short) | HELP / AGS CoCare: free download after registration; NIDUS slides: "copyrighted instrument, free of charge for all nonprofit clinical, educational, academic research purposes with acknowledgement"; a trial protocol prints the 3D-CAM as "copyrighted by Hospital Elder Life Program, LLC, not to be reproduced without permission" | Teach the four-feature algorithm (already done); **link-only** for the forms |
| **MoCA** | mocacognition.com FAQ / policy notice: from **December 2025** certification is *optional* when only the total score is used for screening, triage or referral; it remains required for sub-score or domain interpretation; copyright held by the author; commercial use licensed separately | **Link-only** plus interpretation teaching. Update the MSE pearl, which pre-dates the policy change |
| **MMSE** | PAR manages rights; per-form fee (secondary, 2016 figures) | Link-only; teach the history |
| **Mini-Cog** | Printed forms: "© S. Borson … solely for clinical and educational purposes. May not be modified or used for commercial, marketing, or research purposes without permission"; author interview: never a fee for non-commercial clinical use | Educational use is named in the licence; **programming it is a modification** — link-only unless the author obtains written leave |
| **SLUMS** | SLU retains copyright; free for clinicians; SLU asks that the training video be viewed first; LOINC lists it "used with permission" | Link-only to SLU's page and video; a permission letter would be cheap to ask for |
| **CAM-ICU** | Vanderbilt; free for clinical use with attribution | Link-only |
| **RUDAS** | Free; copyright retained by the authors | Link-only |
| **Clock draw, MOTYB, digit span** | Public-domain tasks | **Build freely** (in-house scoring criteria, synthetic stimuli) |

### 5.3 Proposed tool: "Bedside cognition & delirium" (`cognition.html`)

Three layers, each separately shippable; the first two need no rights decision.

1. **Attention and the delirium reflex** — a practice panel for months-backward and digit span with what a failure means; the CAM four-feature algorithm as an interactive decision tree (already prose on `delirium.md`); the delirium / dementia / depression differentiator table; "do not MoCA a delirious patient" as a hard stop.
2. **Clock-drawing scoring trainer** — eight synthetic clocks (SVG), in-house 0–5 criteria, learner scores, feedback names the error (number placement, hand length, perseveration). This is the executive-function teaching the neurocognitive page wants and it reproduces nothing.
3. **A scored 4AT** — only after the author records `cleared` under CC BY 4.0, with the credit line, the official wording unaltered, and a "Get the official form" route to the4AT.com. Until then, a 4AT *administration* panel (what the four items are, how alertness is tested, the attention task) with the link.

Plus a **"Which screen, when" chooser**: delirium suspected → 4AT (or the unit's CAM-based tool); dementia suspected and delirium excluded → Mini-Cog or SLUMS at the bedside, MoCA when the question is MCI or a domain profile; language or literacy barrier → RUDAS; always a collateral baseline. Each ends on the custodian's link, so the chooser is itself the route block the rule requires.

---

## 6. Other candidate scales — ranked for an adult inpatient clerkship

Pattern key: **Build** = scored trainer is rights-feasible once a disposition is recorded · **Teach + link** = administration teaching with the custodian's form linked · **Link** = route only.

| Priority | Instrument | Why here | Rights finding (source) | Evidence anchor | Pattern |
|---|---|---|---|---|---|
| **1** | **AIMS** | Medication-monitoring page already says "AIMS"; every antipsychotic start on the unit needs a baseline; exam procedure is the teaching | NIMH, ECDEU 1976 — **public domain** (federal work; forms print "available in the public domain") | Munetz & Benjamin 1988 "How to examine patients using the AIMS", PMID 2906320, [10.1176/ps.39.11.1172](https://doi.org/10.1176/ps.39.11.1172) | **Build** an examination trainer (12-step procedure, scoring, what a positive means); pair with Barnes akathisia (link-only — *BJPsych*, PMID 2574607) and Simpson-Angus (link) |
| **2** | **ASQ** (4 items + acuity) | The C-SSRS retirement left the item-9 route landing on a link stub. ASQ is validated in **adult medical inpatients**: sensitivity 100 %, specificity 89 %, NPV 100 % (n = 727, 4 hospitals) | NIMH toolkit: "public domain tool, free of charge"; adult inpatient pathway published | Horowitz 2020, *Psychosomatics*, PMID 32487323, [10.1016/j.psym.2020.04.008](https://doi.org/10.1016/j.psym.2020.04.008); original Horowitz 2012, PMID 23027429 | **Build or teach + link** — but this is a *safety-tool policy* question (the library chose rehearsal over form replication for safety planning), so the author decides the posture, not the rights |
| **3** | **PC-PTSD-5 / PCL-5** | Trauma screening is named in the resident COTW and absent as a tool; inpatient trauma histories are routine | VA National Center for PTSD: described as public domain / "a work of the US Government" (secondary; confirm on ptsd.va.gov and capture) | Prins 2016, *JGIM*, PMID 27170304, [10.1007/s11606-016-3703-5](https://doi.org/10.1007/s11606-016-3703-5) — AUC 0.94; cut 3 maximises sensitivity, 4 efficiency | **Build** PC-PTSD-5 trainer; PCL-5 teach + link (20 items; 31–33 probable-PTSD cut) |
| **4** | **Substance screening set**: AUDIT / AUDIT-C, single-item drug screen, TAPS, CAGE, DAST-10 | Rounds questions and COTWs name AUDIT-C and CAGE; nothing teaches the two-step (screen → full AUDIT) | AUDIT: WHO (free, attribution); TAPS: NIDA (public domain); single-item: Smith 2010 (public); CAGE: Ewing 1984 (widely treated as free); DAST-10: © Skinner, permission for reproduction | Saunders 1993, PMID 8329970; Bush 1998 (AUDIT-C), PMID 9738608; McNeely 2016 (TAPS), PMID 27595276; Smith 2010, PMID 20625025; Ewing 1984, PMID 6471323; Skinner 1982, PMID 7183189 | **Teach + link** on one "screening on admission" card; TAPS and the single-item screen are build-feasible |
| **5** | **PAWSS** | §4 A3 | Elsevier / OUP journals; no custodian form | PMID 25999438 | Teach + link (WP-23) |
| **6** | **BAWS / GMAWS** | §4 A4 — the psychiatric-population result | Journal-published; no custodian form | PMID 28699845; PMID 32209957 | Teach + link |
| **7** | **4AT / cognition set** | §5 | CC BY 4.0 (4AT); others link | PMID 33951145 | Build (4AT, after decision) / teach + link |
| **8** | **EPDS** | Perinatal page cites it four times | *BJPsych* 1987 copyright line permits reproduction with full citation (verify the current RCPsych statement) | Cox 1987, PMID 3651732 | Teach + link now; build only with the captured permission sentence |
| **9** | **MDQ** | Named in topic_meta and the differential scaffolds | © Hirschfeld; free for clinical use (secondary) | Hirschfeld 2000, PMID 11058490 | Link |
| **10** | **BVC / DASA** (and ODC-4) | Violence page prose points at a Brøset tool that does not exist; both have large pooled effects for 24-h aggression (g 1.35 BVC; 1.04 DASA) | BVC: copyright held, "do not use without written permission" (openEHR archetype note; riskassessment.no is the custodian); DASA: Swinburne CFBS | Dickens 2020 meta-analysis, PMID 32062051, [10.1016/j.ijnurstu.2020.103526](https://doi.org/10.1016/j.ijnurstu.2020.103526); FRST: Rosenfeld 2017, PMID 28639803 | **Link-only**, and close ODC-4 by making the prose page match the tool: FRST via the MMC EHR workflow, BVC/DASA as named references |
| **11** | **BARS** (agitation activity) and **RASS** | Agitation page cites Richmond (Project BETA); BARS is the 7-point scale the IM-antipsychotic trials used; RASS is on the ICU/CL path | BARS: Elsevier journal, rights unclear; RASS: widely reproduced, custodian not established | Swift 2002, PMID 11777497; Sessler 2002, PMID 12421743 | Teach the concept (what a BARS 7 vs 4 means); link |
| **12** | **"Scales you will meet in the landmark trials"** — HAM-D, MADRS, YMRS, PANSS, BPRS, CGI, QIDS | 07_Evidence reads CATIE / STAR*D without saying what a 50 % HAM-D response or a PANSS point means | HAM-D, BPRS, CGI: public domain; MADRS/YMRS: *BJPsych*; PANSS: © MHS (never reproduce); QIDS: public | Hamilton 1960, PMID 14399272; Montgomery 1979, PMID 444788; Young 1978, PMID 728692; Kay 1987, PMID 3616518; Rush 2003, PMID 12946886 | **Teach only** — an explainer page in 07_Evidence; no items |
| **13** | Y-BOCS, SCOFF, STOP-Bang, GDS-15, ACE (capacity), WHODAS 2.0, DSM-5-TR Level 1 | Each named once in the curriculum | Y-BOCS © Goodman (free clinical); SCOFF *BMJ* 1999; STOP-Bang © UHN (free clinical, permission to reproduce); GDS public domain; ACE free (U Toronto JCB); WHO / APA permit clinician use | PMID 2684084; 10582927; 18431116; 9893088 | Link from the pages that name them |

---

## 7. The governance pattern every build item needs (proposed, not enacted)

1. **Capture the permission** as a dated file in `docs/permissions/` (the PHQ precedent: live sentence, URL, retrieval date).
2. **Record the decision** in `decisions.json` (`instrument-<id>-cleared`, author-signed).
3. **Register the instrument** in `instrument_rights.json` with a status the schema allows. **Today it allows none for a cleared instrument** — add `cleared` (and optionally `public-domain`) to `instrument_rights.schema.json`, with `officialSource` still required and `decisionRef` still mandatory. This is a **policy commit** (`bin/check_policy_content_separation.py`) and goes alone.
4. **Build to the house pattern**: every item tagged `OBSERVED` / `ASKED`; sparse legal values only; in-house descriptors unless the licence covers verbatim text; a route block with the custodian's `formUrl`; `<!-- crisis-block-html -->` wherever the learner does risk work (ASQ, any suicide item); no dose literals; storage keys `cw_*` / `rp_*`; no free-text field that could hold an identifier.
5. **Register the page** (G10): `site_manifest.json`, nav in `build_deploy.py` (+ `resident_section.py`), `shipped_pages.py --write`, a pending ledger row, `analytics_events.py --write`, a `topic_meta.json` entry through the `topic-meta-author` skill.
6. **Pin it**: a legal-values test on the `cows-legal-values.test.mjs` model; a presentation test that the page says exactly what it reproduces; controlled fixtures only (invariant 10).
7. **Cite it**: every "the scale does X" sentence carries a `sourceSpan` in `evidence_annotations.json`; registry ids proposed in §9.

---

## 8. Decisions needed from the author

| ID | Decision | Options (recommended first) | Unblocks |
|---|---|---|---|
| **S1** | Add a `cleared` status to `instrument_rights.schema.json` | Yes, policy-only PR · no, keep three statuses | every build item |
| **S2** | 4AT: record `cleared` under CC BY 4.0 after capturing the attribution page | Yes, verbatim with credit line · administration-only + link · defer | §5.3 layer 3 |
| **S3** | AIMS: record `public-domain` and build the examination trainer | Yes · teach + link only | §6 #1 |
| **S4** | ASQ posture on `screeners.html` | Teach + link (consistent with the safety-planning precedent) · build the four items (public domain) · leave the item-9 route as is | §6 #2 |
| **S5** | COWS enhancement set C1–C4, C6, C8, C9, C11 (agent-executable) | Approve as a set · approve C1/C2/C8 first · defer | §3 |
| **S6** | C5 (two-branch initiation panel) and C7 criterion scores | Author writes / rates · defer to WP-25 | §3 |
| **S7** | CIWA-Ar tab: author the administration teaching or remove the promise | Author it · remove the sentence | §4 A1 |
| **S8** | `decision-aids.html` CIWA bands → ASAM 2020 categories, or label as MMC protocol | Align to ASAM (verify) · relabel | §4 A5 |
| **S9** | Which cognitive and delirium screens MMC nursing and the ED actually use (CAM? 4AT? Nu-DESC? bCAM?) | Author answers; the chooser in §5.3 should name the local tool first | §5.3 |
| **S10** | PHQ-9 / GAD-7 `provisional` → `cleared` | Already evidenced (`docs/permissions/phq-gad-review-2026-10-02.md`); one `decisions.json` entry | removes the last provisional row |

---

## 9. Evidence registry candidates (ids proposed; every PMID resolved via PubMed on 2026-10-21)

| Proposed id | Citation | PMID | DOI |
|---|---|---|---|
| `tompkins-2009-cows-validation` | Tompkins DA et al. *Drug Alcohol Depend* 2009;105:154-9 | 19647958 | 10.1016/j.drugalcdep.2009.07.001 |
| `barbosa-leiker-2015-cows-factor` | Barbosa-Leiker C et al. *Drug Alcohol Depend* 2015;152:218-23 | 25908321 | 10.1016/j.drugalcdep.2015.03.036 |
| `tomaszewski-2021-cows-interrater` | Tomaszewski CA et al. *JACEP Open* 2021;2:e12462 | 34179884 | 10.1002/emp2.12462 |
| `thakrar-2024-precipitated-withdrawal` | Thakrar AP et al. *JAMA Netw Open* 2024;7:e2435895 | 39331392 | 10.1001/jamanetworkopen.2024.35895 |
| `donofrio-2026-ed-bup` (already proposed §7-C) | D'Onofrio G et al. *JAMA* 2026;335:948-960 | 41670966 | 10.1001/jama.2025.27019 |
| `bird-2023-fentanyl-adme` | Bird HE, Huhn AS, Dunn KE. *J Addict Med* 2023;17:503-508 | 37788600 | 10.1097/ADM.0000000000001185 |
| `englander-2024-hospital-oud-fentanyl` | Englander H et al. *JAMA Intern Med* 2024;184:691-701 | 38683591 | 10.1001/jamainternmed.2023.7282 |
| `jang-2026-kcows` | Jang J et al. *Front Public Health* 2026;13:1706053 | 41696705 | 10.3389/fpubh.2025.1706053 |
| `bourdon-2026-ecao` | Bourdon JL et al. *Subst Abuse Rehabil* 2026;17:588456 | 41884288 | 10.2147/SAR.S588456 |
| `hecksel-2008-ciwa-inappropriate` | Hecksel KA et al. *Mayo Clin Proc* 2008;83:274-9 | 18315992 | 10.4065/83.3.274 |
| `maldonado-2015-pawss-validation` | Maldonado JR et al. *Alcohol Alcohol* 2015;50:509-18 | 25999438 | 10.1093/alcalc/agv043 |
| `maldonado-2014-pawss` | Maldonado JR et al. *Alcohol* 2014;48:375-90 | 24657098 | 10.1016/j.alcohol.2014.01.004 |
| `rastegar-2017-baws` | Rastegar DA et al. *Subst Abus* 2017;38:394-400 | 28699845 | 10.1080/08897077.2017.1354119 |
| `elefante-2020-ciwa-baws-psychiatric` | Elefante RJ et al. *J Addict Med* 2020;14:e355-e358 | 32209957 | 10.1097/ADM.0000000000000655 |
| `mcpherson-2012-gmaws` | McPherson A, Benson G, Forrest EH. *QJM* 2012;105:649-56 | 22328545 | 10.1093/qjmed/hcs020 |
| `tieges-2021-4at-meta` | Tieges Z et al. *Age Ageing* 2021;50:733-743 | 33951145 | 10.1093/ageing/afaa224 |
| `shenkin-2019-4at-vs-cam` | Shenkin SD et al. *BMC Med* 2019;17:138 | 31337404 | 10.1186/s12916-019-1367-9 |
| `bellelli-2014-4at` | Bellelli G et al. *Age Ageing* 2014;43:496-502 | 24590568 | 10.1093/ageing/afu021 |
| `inouye-1990-cam` | Inouye SK et al. *Ann Intern Med* 1990;113:941-8 | 2240918 | — (resolve) |
| `marcantonio-2014-3dcam` | Marcantonio ER et al. *Ann Intern Med* 2014;161:554-61 | 25329203 | 10.7326/M14-0865 |
| `kuczmarska-2016-3dcam-vs-camicu` | Kuczmarska A et al. *J Gen Intern Med* 2016;31:297-303 | 26443577 | 10.1007/s11606-015-3514-0 |
| `han-2013-bcam` | Han JH et al. *Ann Emerg Med* 2013;62:457-465 | 23916018 | 10.1016/j.annemergmed.2013.05.003 |
| `tsoi-2015-cognitive-tests-meta` | Tsoi KK et al. *JAMA Intern Med* 2015;175:1450-8 | 26052687 | 10.1001/jamainternmed.2015.2152 |
| `borson-2003-minicog` | Borson S et al. *J Am Geriatr Soc* 2003;51:1451-4 | 14511167 | 10.1046/j.1532-5415.2003.51465.x |
| `tariq-2006-slums` | Tariq SH et al. *Am J Geriatr Psychiatry* 2006;14:900-10 | 17068312 | 10.1097/01.JGP.0000221510.33817.86 |
| `shulman-2000-clock` | Shulman KI. *Int J Geriatr Psychiatry* 2000;15:548-61 | 10861923 | — (resolve) |
| `horowitz-2020-asq-adult` | Horowitz LM et al. *Psychosomatics* 2020;61:713-722 | 32487323 | 10.1016/j.psym.2020.04.008 |
| `prins-2016-pcptsd5` | Prins A et al. *J Gen Intern Med* 2016;31:1206-11 | 27170304 | 10.1007/s11606-016-3703-5 |
| `munetz-1988-aims-exam` | Munetz MR, Benjamin S. *Hosp Community Psychiatry* 1988;39:1172-7 | 2906320 | 10.1176/ps.39.11.1172 |
| `swift-2002-bars` | Swift RH et al. *J Psychiatr Res* 2002;36:87-95 | 11777497 | 10.1016/s0022-3956(01)00052-8 |
| `dickens-2020-imminent-aggression-meta` | Dickens GL et al. *Int J Nurs Stud* 2020;104:103526 | 32062051 | 10.1016/j.ijnurstu.2020.103526 |
| `rosenfeld-2017-frst` | Rosenfeld B et al. *Law Hum Behav* 2017;41:325 | 28639803 | — (resolve) |

Resolved by citation lookup, for the link rows in §6 (PMIDs only): AUDIT 8329970 · AUDIT-C 9738608 · CAGE 6471323 · DAST 7183189 · TAPS 27595276 · single-item drug screen 20625025 · MDQ 11058490 · CAM-ICU 11730446 · RASS 12421743 · EPDS 3651732 · FAB 11113214 · MMSE 1202204 · YMRS 728692 · MADRS 444788 · HAM-D 14399272 · PANSS 3616518 · Barnes 2574607 · Y-BOCS 2684084 · GAD-7 16717171 · RUDAS 15190994 · DASA 17171770 · QIDS 12946886 · SCOFF 10582927 · Nu-DESC 15857740 · ACE 9893088 · MOAS 3418327 · OAS 3942284 · STOP-Bang 18431116 · Nasreddine 2005 (MoCA) 15817019 · Kroenke 2001 (PHQ-9) 11556941. **Not resolved:** Almvik 2000 (BVC primary) — cite Dickens 2020 until it is.

Known decoys to avoid (from the 2026-09-24 remediation §7-C): ASAM 2020 OUD guideline is PMID 32511106 (the erratum 32487948 is not it); Weimer 2023 is PMID 37934520.

---

## 10. Roadmap

| Horizon | Work | Type | Gate |
|---|---|---|---|
| **Now** (one PR each, agent-executable) | COWS C1 + C2 + C8 (`withdrawal-ciwa-cows-card.html`, one new test); CIWA preconditions check (A2); fix the "RASS/PAWSS" clause (A4, teach + link); update the MSE pearl for the December 2025 MoCA policy | content | S5 |
| **Now** (policy-only PR) | `cleared` status in `instrument_rights.schema.json` + `decisions.json` entry for PHQ-9/GAD-7 | policy | S1, S10 |
| **Next** | `cognition.html` layers 1–2 (attention trainer, CAM tree, clock-drawing trainer, "which screen, when" chooser with routes); AIMS examination trainer; substance-screening card; ODC-4 closure on `violence.html` | content + registration | S3, S9 |
| **Next** (author) | COWS C3/C4/C6/C9 copy review; C7 criterion scores; CIWA-Ar administration teaching (A1); PAWSS card (WP-23); decision-aids bands (A5) | author-gated | S6, S7, S8 |
| **Later** | 4AT scored tool (after S2 and a captured licence); ASQ per S4; PC-PTSD-5 trainer after the VA statement is captured; EPDS after the RCPsych sentence is captured; "scales in the landmark trials" explainer in 07_Evidence | content | S2, S4 |

**Next best step.** Approve S1 and S5 together: the schema addition is the one policy change every later build depends on, and C1/C2/C8 are a half-day of agent work on a page whose rights are now settled — they turn the library's only fully-controlled instrument into one that can show a trend, name its objective signs, and produce the line a resident actually charts.

**Innovative next idea.** A **cross-instrument calibration ladder**: the rater-calibration shell built for COWS (C7) is generic — a vignette, a criterion score, a named error type. Once it exists, the same engine runs clock-drawing scoring, AIMS severity, and 4AT attention items from one fixture format, and the question bank's calibration-gap panel can report a learner's *signed* bias across instruments on the same dashboard. That is the one capability no commercial scale app offers and the one that best fits a library whose rule is to teach administration rather than reproduce forms.

---

## Appendix A — sources consulted for rights statements (web, 2026-10-21; none are custodian captures yet)

- the4AT.com — attribution page and FAQ (CC BY 4.0; credit line; modified-version rule; FAQ wording is inconsistent with the attribution page, so the attribution page is the one to capture).
- mocacognition.com — FAQ and policy notice (certification optional from December 2025 for total-score use; required for sub-score interpretation); training-certification and terms pages.
- hospitalelderlifeprogram.org and help.agscocare.org — instruments free after registration; NIDUS 2019 slide deck (Marcantonio) on nonprofit use with attribution; a trial protocol's 3D-CAM copyright notice.
- Printed Mini-Cog forms (UNE, Iowa, Buffalo copies) and the Borson interview on fee policy.
- SLU geriatrics assessment-tools page; LOINC 71947-6 ("used with permission").
- NIMH ASQ toolkit information sheet (7/1/2020: "public domain tool, free of charge"); NIMH ASQ pages (adult inpatient pathway).
- AIMS copies (Upstate, UF, Wisconsin, Delaware DHSS; OpenStax attribution to NIMH, public domain).
- AHRQ Integration Academy entry for SOWS ("copyrighted, freely available"); NIDA DataShare.
- openEHR BVC archetype copyright note pointing to riskassessment.no; DASA secondary commentary (Swinburne CFBS).
- Deployment Psychology / UW AIMS Center notes on PCL-5 public-domain status (secondary; ptsd.va.gov not reached from this environment).
- Guideline Central and ASAM pages: no 2025 ASAM OUD guideline update found; the 2020 focused update remains current, with the 2023 HPSO clinical considerations.

Direct fetches of mocacognition.com, the4AT.com, nimh.nih.gov and ptsd.va.gov were blocked from this session's network; every statement above is from search summaries and must be re-read on the custodian's page before it is captured as a permission.
