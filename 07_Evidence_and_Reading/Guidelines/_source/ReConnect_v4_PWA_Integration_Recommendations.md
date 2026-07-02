# ReConnect v4 PWA — Integration Recommendations

**Date:** 2026-02-27  
**Author:** Joshua Moss, MD | Psychiatrist  
**Purpose:** Ranked recommendations for integrating existing ReConnect tool suite assets into the v4 PWA

---

## Executive Summary

The ReConnect ecosystem contains 18 production HTML tools, 16 databases (1,963 records), and extensive clinical materials. The v4 PWA currently has 105 modules across 4 phases and 2 pathways — all narrative text. This analysis identifies **6 high-value integration candidates** where existing tool suite components would add genuine interactive or data-driven capability that the PWA currently lacks.

**Key finding:** The PWA's greatest gap is not content — it has excellent narrative coverage. The gap is *interactivity* and *data-backed personalization*. Every top-ranked candidate below addresses this.

---

## Methodology

1. Cataloged all 18 production tools (line counts, component inventories)
2. Mapped all 16 databases in `data_all.json` (1,963 records, field structures)
3. Extracted all 105 PWA module IDs and audited existing coverage
4. Identified gaps: areas where the PWA has narrative-only content but the tool suite has interactive or database-driven equivalents
5. Ranked by **clinical impact × implementation feasibility**

---

## Tier 1 — High Impact, Moderate Effort

### 1. Interactive Safety Plan Builder

**Source:** Resource Finder v6 → `SafetyPlanBuilder` component  
**PWA gap:** Module `safety-plan-yours` (Phase 3, individual path) is narrative guidance only — a 2-minute read about safety planning. No interactive builder.  
**What it adds:** Full Stanley-Brown 6-step wizard with localStorage persistence:

- Warning signs (array input)
- Internal coping strategies (array input)
- Distraction contacts (name/phone/place)
- Support contacts (name/phone/relationship)
- Professional contacts (pre-populated with 988, Maine Crisis, 911)
- Means safety checklist (weapons, medications, places, disclosure)
- Reason for living (free text)
- Clinician name + date stamp
- Completion tracking + PDF/print export

**Clinical rationale:** Safety planning is one of the highest-evidence suicide prevention interventions. An interactive builder that patients can update and carry with them is categorically different from reading *about* safety planning.  
**Implementation notes:** The SafetyPlanBuilder is a self-contained React component (~300 lines). It uses localStorage for persistence, which aligns with the PWA's existing storage pattern. Would need: (a) extraction from Resource Finder, (b) styling alignment with PWA design tokens, (c) integration as an interactive sub-module within or alongside `safety-plan-yours`.  
**Effort estimate:** 2–3 hours  
**Impact:** ★★★★★

---

### 2. Crisis Resource Database Integration

**Source:** `data_all.json` → `crisis` database (53 records, 33 fields)  
**PWA gap:** Crisis references are hardcoded inline — only 988 Suicide & Crisis Lifeline, Maine Crisis Line (1-888-568-1112), and 911. No searchable directory.  
**What it adds:** Queryable crisis resource database with:

- 53 crisis resources with availability windows, response times, geographic coverage
- Special capabilities (e.g., substance use, veterans, youth-specific)
- Filterable by type: hotlines, mobile crisis teams, walk-in crisis centers, ED-based services
- Ages served, insurance accepted, languages available

**Clinical rationale:** Patients and families in crisis need the *right* resource, not just *a* number. A veteran in crisis needs the Veterans Crisis Line, not just 988. A family dealing with a child's crisis needs a pediatric-capable mobile crisis team, not an adult walk-in clinic.  
**Implementation notes:** Use the existing `rc-data.js` async loader pattern (Phase 2 architecture). Could be implemented as a filterable overlay/modal triggered from any crisis-mention module. The crisis database slice is ~15KB (vs. 2.1MB full `data_all.json`), so per-tool data slicing from Phase 5 applies.  
**Effort estimate:** 3–4 hours  
**Impact:** ★★★★★

---

### 3. Medication Information Database

**Source:** `data_all.json` → `medications` database (58 records, 24 fields)  
**PWA gap:** Module `medication-talk` and several others reference medications narratively ("ask about side effects," "your medication schedule matters"). No drug-specific information.  
**What it adds:** Searchable medication reference with:

- Drug name, class, common brand names
- FDA-approved indications
- Typical dose ranges
- Common side effects (with frequency data where available)
- Cost Plus Pharmacy pricing
- MaineCare formulary status
- Black box warnings
- Monitoring requirements
- Patient-friendly explanations

**Clinical rationale:** "Talk to your doctor about your medications" is correct but insufficient for engaged patients and families. Being able to look up their specific medication, understand common side effects, and know what monitoring is expected transforms passive compliance into active partnership.  
**Implementation notes:** The medications database is already structured for patient-facing use (it includes reading-level-appropriate descriptions). Implementation pattern: searchable lookup triggered from medication-related modules. The `diagnostic_bundle_map.json` (10 diagnoses) maps conditions to recommended medication classes, enabling filtered views.  
**Effort estimate:** 3–4 hours  
**Impact:** ★★★★☆

---

## Tier 2 — Moderate Impact, Lower Effort

### 4. Diagnosis-Specific Content Filtering

**Source:** `diagnostic_bundle_map.json` (10 diagnoses) + `data_all.json` → `psychoeducation` (137 records)  
**PWA gap:** All 105 modules are diagnosis-agnostic. A family dealing with first-episode psychosis sees the same content as one dealing with substance use disorder. The `visiting-during-psychosis` module exists but isn't surfaced preferentially.  
**What it adds:** Diagnosis-aware content routing:

- 10 mapped diagnoses: Depression, Bipolar, Schizophrenia/FEP, SUD, Anxiety, PTSD, BPD, Eating Disorders, OCD, Dual Diagnosis
- Each maps to relevant psychoeducation bundles, screening tools, and recommended reading
- Could drive "recommended for you" badges on existing modules
- Links to condition-specific psychoeducation resources (137 records with audience tags, reading levels, and format types)

**Clinical rationale:** Personalization increases engagement. A family who selected "first-episode psychosis" at onboarding should see `visiting-during-psychosis` and `understanding-treatment` promoted, not buried at module #95.  
**Implementation notes:** Lightweight implementation — add an optional diagnosis selector to the PWA's onboarding flow, then use it to tag/sort/promote existing modules. No new content needed; just filtering logic. The `diagnostic_bundle_map.json` is already structured for this.  
**Effort estimate:** 2–3 hours  
**Impact:** ★★★★☆

---

### 5. Aftercare Provider Directory

**Source:** `data_all.json` → `aftercare` database (319 records, 38 fields)  
**PWA gap:** No provider lookup. Modules like `building-team`, `between-visits`, and `looking-ahead` discuss the importance of outpatient care but provide no way to find providers.  
**What it adds:** Searchable provider directory with:

- 319 providers across Maine
- Specialty, insurance accepted (including MaineCare), telehealth availability
- Wait times, sliding scale, languages
- Geographic filtering
- Provider type: psychiatrist, therapist, PCP, peer support, case management

**Clinical rationale:** The #1 post-discharge barrier is finding an outpatient provider. Currently the PWA tells families to "build your team" but offers no tools to actually do so.  
**Implementation notes:** Larger dataset (~80KB slice). Best implemented as a dedicated module or overlay rather than inline. The Resource Finder v6 already has a provider search UI that could be adapted. Consider lazy-loading this database only when the user navigates to provider search.  
**Effort estimate:** 4–5 hours  
**Impact:** ★★★☆☆

---

### 6. Screening Tools Reference

**Source:** `data_all.json` → `screening_tools` database (67 records, 15 fields)  
**PWA gap:** No self-assessment or screening capability. Modules discuss symptoms but don't offer structured measurement.  
**What it adds:** Reference library of validated screening instruments:

- 67 screening tools across conditions
- Administration time, scoring interpretation, clinical thresholds
- Links to publicly available versions where permitted
- Appropriate use guidance (self-screen vs. clinician-administered)

**Clinical rationale:** Families often ask "how do I know if it's getting worse?" Pointing them to validated tools (PHQ-9 for depression, GAD-7 for anxiety, AUDIT for alcohol use) gives them concrete, evidence-based markers rather than subjective guessing.  
**Implementation notes:** This is primarily a reference/lookup feature. Some tools (PHQ-9, GAD-7) are in the public domain and could be implemented as interactive self-screens within the PWA. Others are proprietary and can only be referenced.  
**Effort estimate:** 3–4 hours (reference only); 6–8 hours (with interactive public-domain screeners)  
**Impact:** ★★★☆☆

---

## Not Recommended for Integration

| Asset | Reason to Skip |
|-------|---------------|
| **Analytics Dashboard** | Clinician-facing; wrong audience for patient/family PWA |
| **Content Index** | Internal development tool; not patient-facing |
| **DESIGN_SYSTEM tool** | Developer reference; no patient value |
| **Infographic Gallery** | Static visual content; better served as linked resources than embedded |
| **Interactive Training Platform** | Clinician training; wrong audience |
| **Discharge Bundle** | Largely redundant — PWA Phase 1–2 modules cover the same discharge content |
| **dashboard.html** | System overview; not patient-facing |
| **offline.html** | Already handled by PWA's service worker (sw.js) |

---

## Implementation Sequence

**Recommended order** (maximizes clinical value per hour invested):

1. **Safety Plan Builder** (2–3 hrs) — Highest single-module clinical impact
2. **Crisis Resource Database** (3–4 hrs) — Direct safety value; pairs with Safety Plan
3. **Diagnosis-Specific Filtering** (2–3 hrs) — Low effort, transforms UX personalization
4. **Medication Database** (3–4 hrs) — High engagement value for medication modules
5. **Aftercare Directory** (4–5 hrs) — Addresses biggest post-discharge barrier
6. **Screening Tools** (3–8 hrs) — Nice-to-have; reference mode is fast, interactive is slower

**Total estimated effort:** 17–27 hours for all 6 candidates.

---

## Architecture Notes

All integrations should follow the existing Phase 2–5 architecture:

- **Data loading:** Use `rc-data.js` async loader with IndexedDB caching (not inline JSON)
- **Data slicing:** Use `build_all.py` per-tool data slices (Phase 5 delivered 84.6% avg size reduction)
- **Context sharing:** Use `rc-context.js` BroadcastChannel bus for cross-tool workflows (Phase 3)
- **Offline support:** All database slices should be precached via `sw.js` manifest (Phase 4)
- **Styling:** Use `rc-tokens.css` design tokens — the PWA already aligns with Clinical Warm palette

---

*Generated from cross-reference analysis of 18 production tools, 16 databases (1,963 records), and 105 PWA modules.*
