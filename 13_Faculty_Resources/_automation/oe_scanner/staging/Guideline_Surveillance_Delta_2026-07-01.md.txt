# Guideline Surveillance Delta Report — 2026-07-01

**Prepared for:** Joshua Moss, MD — Psychiatrist (BHU2)
**Window covered:** June 23, 2026 (date of last reconciled review / live-page "as of") → July 1, 2026 (8 days)
**Baseline documents read:** `Inpatient_Psychiatry_Guideline_Surveillance_2023-2026.docx` (review date June 23, 2026) and the live `DATA[]` array in `clinical-warm-site/clinician-guidelines.html` (as-of June 23, 2026) — both already reconciled with each other, so they served as a single baseline.
**Method:** Parallel primary-source searches (organizational sites, Federal Register, FDA.gov, NICE.org.uk, jointcommission.org, ncqa.org, samhsa.gov, asam.org) across three clusters: (1) APA/VA-DoD/NICE/specialty societies, (2) FDA/ASAM, (3) CMS/Joint Commission/SAMHSA/NCQA. Nothing below is asserted without a primary-source URL; anything not independently confirmed is marked **[VERIFY]**.

**Bottom line:** Given the 8-day window, the guideline literature itself is essentially unchanged — no new APA/VA-DoD/NICE/specialty guidelines, no new FDA psychiatric safety actions, no new ASAM CPGs. The substantive findings this cycle are three regulatory/quality items that were **not previously captured on the live page at all** (not just "updated" — genuinely new to the tracker), surfaced by explicitly chasing the two open watchlist items.

---

## 1. NEW (not previously on the live page)

### 1.1 CMS FY2027 IPF PPS Proposed Rule (CMS-1847-P) — resolves the "standardized IPF-PAI" watchlist item
- **Status:** Proposed rule issued April 2, 2026; published Federal Register April 7, 2026; comment period closed June 1, 2026; **final rule not yet published** as of July 1, 2026 (CMS typically finalizes IPF PPS rules Aug/Sept for an Oct 1 fiscal-year start).
- **What it does:**
  - Proposes a 2.3% IPF PPS payment rate update.
  - Caps facility-level outlier payments at 20% of total IPF PPS payments.
  - Proposes **removing** the SUB-2/SUB-2a (alcohol use brief intervention) and TOB-3/TOB-3a (tobacco use treatment) IPFQR measures, beginning CY2026 reporting / FY2028 payment determination.
  - Proposes a **standardized IPF Patient Assessment Instrument (IPF-PAI)**, mandated by the Consolidated Appropriations Act 2023 §4125(b)(1): ages 18+, admission and discharge assessments, data collection to begin FY2028 (affecting FY2029 payment), submitted via **HL7 FHIR API** — reportedly the first CMS statutory quality program to use FHIR-API submission.
- **Why it matters:** This is the concrete answer to the live page's existing watchlist line — "Watch FY2027+ rulemaking for the standardized IPF Patient Assessment Instrument." It's no longer speculative; there's a docketed proposed rule with a defined (if not yet final) timeline.
- **Source:** [CMS fact sheet](https://www.cms.gov/newsroom/fact-sheets/fiscal-year-2027-medicare-inpatient-psychiatric-facility-prospective-payment-system-proposed-rule) · [Federal Register](https://www.federalregister.gov/documents/2026/04/07/2026-06675/medicare-program-fy-2027-inpatient-psychiatric-facilities-prospective-payment-system-rate-update)
- **Note on timing:** the proposed rule itself predates the June 23 baseline (issued April 2026), but it was not in either baseline document — it's being added now because it directly resolves an open watchlist item, not because it's new this week.

### 1.2 Joint Commission / NQF Sentinel Events List alignment (workplace-violence relevant)
- **Status:** Effective January 1, 2027. Announced January 2026; detail document dated May 2026. Not in either baseline document.
- **What it does:** Aligns the Joint Commission's Sentinel Events List with NQF's Serious Reportable Events List, adding three events with direct behavioral-health-unit relevance: **Homicide**, **Sexual Abuse/Assault**, and **Physical Assault of staff**.
- **Why it matters:** Pairs directly with your existing R3 #42 (Behavioral Health Workplace Violence, eff Jul 1 2024) entry — this extends mandatory sentinel-event reporting to cover staff-assault events, which is squarely a BHU2 workplace-safety concern even though it isn't one of your 10 named domains.
- **Source:** [Joint Commission announcement](https://www.jointcommission.org/en-us/knowledge-library/news/2026-01-joint-commission-and-nqf-aligning) — **[VERIFY: no confirmation found of any update to this since the May 2026 detail doc; re-check closer to the Jan 1, 2027 effective date]**

### 1.3 NCQA HEDIS MY2026 Measure Trending Determinations
- **Status:** Posted June 26, 2026 — inside the surveillance window.
- **What it does:** Confirms which MY2026 HEDIS measures trend for Health Plan Ratings/accreditation scoring. Behavioral-health follow-up measures (FUH/FUM/FUA) are within scope of this posting.
- **Why it matters:** Possible downstream effect on how your FUH/FUM/FUA performance is weighted for accreditation purposes, but **the exact trending designation for FUH/FUM/FUA specifically could not be confirmed from search snippets alone.**
- **Source:** [NCQA HEDIS measures](https://www.ncqa.org/hedis/measures/) · [NCQA MY2026 what's new/changed/retired](https://www.ncqa.org/blog/hedis-my-2026-whats-new-whats-changed-whats-retired/) — **[VERIFY: pull the full trending document directly before citing a specific FUH/FUM/FUA determination]**

---

## 2. UPDATED

None of the guideline-content items on the live page changed substantively in this window. One documentation-precision correction:

- **Clozapine REMS removal (FDA):** the live page cites the source as effectively dated June 13, 2025. Confirmed: June 13, 2025 is the correct **effective date** of REMS removal; the FDA Drug Safety Communication document itself is dated **August 27, 2025** (i.e., published ~2.5 months after the effective date). This is not a substantive change — ANC monitoring and the Boxed Warning still persist as stated — just a citation-precision note in case anyone traces the DSC by its document date rather than its effective date. [Source](https://www.fda.gov/drugs/drug-safety-communications/fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine)

---

## 3. RETIRED / SUPERSEDED

None identified this cycle. (The proposed SUB-2/TOB-3 measure removals in §1.1 are **proposed**, not yet final — do not treat as retired until the FY2027 IPF PPS final rule publishes.)

---

## 4. Status confirmations — live-page items now resolved or reaffirmed unchanged

| Live-page item | Status as of July 1, 2026 | Action |
|---|---|---|
| NICE NG10 rewrite (GID-NG10432) | **Unchanged.** Scope consultation closed March 3, 2025; NICE's project page still lists publication as "TBC." No indication of imminent publication. [Source](https://www.nice.org.uk/guidance/indevelopment/gid-ng10432) | No page edit needed; re-check next cycle. |
| Joint Commission NPSG→NPG renumber | **Confirmed live/in effect** since Jan 1, 2026 (was previously described in future tense). Dual numbering for freestanding psych confirmed unchanged. [Source](https://www.jointcommission.org/en-us/standards/national-performance-goals/reducing-the-risk-for-suicide) | Update tense on the watchlist line (see §5). |
| CMS IPFQR PIX survey (voluntary CY2025 → mandatory CY2026) | **Confirmed on track**, no new update this window. [Source](https://www.qualityreportingcenter.com/globalassets/2025/08/iqr/pix-implementation-guidance_august-2025_final_508.pdf) | No page edit needed. |

---

## 5. Items flagged and excluded (do not act on these)

- **"Bysanti (milsaperidone)" approval claimed June 30, 2026** — an AI-generated search summary asserted this date, but primary sources (drugs.com approval history, a UTHealth article) place FDA approval at **February 20, 2026**. Excluded from this report as a likely search-summary hallucination. If you encounter this drug/date elsewhere, verify against drugs.com or FDA's Orange Book before citing.
- **EMA/PRAC paternal valproate exposure recommendation** — dated June 15, 2026, which is *before* the June 23 baseline cutoff, so it isn't a delta item. It's also a distinct EU/EMA mechanism from the UK MHRA valproate action already on your page — worth folding in as a related-but-separate line if you want EU regulatory actions in scope, but not urgent. [Source](https://www.ema.europa.eu/en/news/potential-risk-neurodevelopmental-disorders-children-born-men-treated-valproate-medicines-prac-recommends-precautionary-measures)

---

## Page edits to make (`clinician-guidelines.html` → `DATA[]`)

1. **ADD** new CMS record:
   ```js
   {org:"CMS",dom:"Quality metrics",t:"FY2027 IPF PPS Proposed Rule (CMS-1847-P) — standardized IPF Patient Assessment Instrument",yr:"proposed Apr 2 2026; comment closed Jun 1 2026; final rule pending",st:"new",pr:"plan",cf:1,ch:"Proposes 2.3% payment update; caps facility-level outlier payments at 20%; proposes REMOVING SUB-2/SUB-2a and TOB-3/TOB-3a IPFQR measures beginning CY2026 reporting/FY2028 payment; proposes standardized IPF-PAI (CAA 2023 §4125(b)(1)) — ages 18+, admission/discharge assessment, data collection starts FY2028 (impacts FY2029 payment), submitted via HL7 FHIR API (first CMS statutory quality program to use FHIR API).",ac:"Watch for the final rule (typically Aug/Sept 2026); begin scoping IPF-PAI workflow and FHIR-API readiness; reconcile SUB-2/TOB-3 measure removal in your EHR build once finalized.",sr:"https://www.cms.gov/newsroom/fact-sheets/fiscal-year-2027-medicare-inpatient-psychiatric-facility-prospective-payment-system-proposed-rule"}
   ```
2. **ADD** new Joint Commission record:
   ```js
   {org:"Joint Commission",dom:"Workplace safety",t:"Sentinel Events List aligned with NQF Serious Reportable Events List",yr:"eff Jan 1 2027; announced Jan 2026",st:"new",pr:"watch",cf:1,ch:"Adds Homicide, Sexual Abuse/Assault, and Physical Assault of staff as reportable sentinel events — direct relevance to BH workplace-violence programs; pairs with R3 #42.",ac:"Prepare sentinel-event reporting workflows for the three added categories ahead of Jan 1 2027.",sr:"https://www.jointcommission.org/en-us/knowledge-library/news/2026-01-joint-commission-and-nqf-aligning"}
   ```
3. **UPDATE** the "Live watchlist" section:
   - Change the Joint Commission NPSG→NPG bullet from future tense ("takes effect Jan 1 2026") to confirmed-live phrasing.
   - Replace the CMS IPFQR PIX bullet's "Watch FY2027+ rulemaking for the standardized IPF Patient Assessment Instrument" clause — that's no longer speculative; point directly to CMS-1847-P (see item 1 above) and note the final rule is still pending.
4. **UPDATE** the page's `<span class="asof">` from "Current as of June 23, 2026" to July 1, 2026 once these edits are made.
5. **OPTIONAL / low priority:** add a parenthetical on the clozapine REMS card noting the FDA DSC document itself is dated Aug 27, 2025 (effective date June 13, 2025 unchanged) — citation precision only, not substantive.
6. **HOLD, do not add yet:** NCQA HEDIS MY2026 trending item (§1.3) — confirm the specific FUH/FUM/FUA trending determination from the primary document before adding a card; currently [VERIFY].
