# ReConnect Discharge Synthesizer — Architecture & Implementation Blueprint

**Internal codename:** `rc-dx-synth` (Discharge Synthesizer)
**External-facing name:** Discharge Documentation Companion (DDC)
**Status:** Architecture Draft v1 — 2026-05-11
**Author context:** Josh Moss, MD — embedded in the ReConnect Psychiatry monorepo
**Target audience:** Implementation team (Claude Code / Codex / human dev)

---

## TL;DR — The Three Decisions That Govern Everything Else

1. **Adopt a Structured Intermediate Representation (SIR) as the system's spine.** The LLM extracts to JSON; deterministic code matches against your existing 17-category resource database; templates assemble the output with LLM-narrated narrative sections. The LLM never names a resource — that comes from the database. This single architectural choice collapses the hallucination problem from "constant clinical risk" to "rare and bounded."

2. **Phase 1 is deidentified-only, runs in the browser, posts to a thin LLM proxy with no logging.** This sidesteps HIPAA BAA blockers entirely for MVP; preserves your static-first Netlify deploy pattern; gets you to clinical pilot in 30 days. Phase 2 swaps the proxy for Bedrock/Azure-with-BAA when you're ready for live PHI.

3. **Build it as another single-file React 18 UMD tool inside `tools-suite/`** consuming `data_discharge_bundle_generator_v4.json` and the aftercare slice of `data_all.json`. Do **not** stand up a new service, new repo, or new data store for MVP. Your existing infrastructure is 80% of what this tool needs.

Everything below elaborates these three decisions, identifies the seams where they break, and gives you the concrete tickets to ship.

---

## SECTION 1 — Ecosystem Audit

### 1.1 What you already have (verified, not assumed)

| Asset | Location | What it gives the discharge tool |
|---|---|---|
| **Unified resource DB** | `databases/core/data_all.json` (14 MB, 17 categories) | The entire matching layer. 40+ field schema with `rss_layers`, `safety_tier`, `evidence_level`, `accepts_mainecare`, `telehealth_available`, `trauma_informed`, `stage_of_change`, `patient_profile` is already discharge-shaped. |
| **Discharge bundle slice** | `databases/slices/data_discharge_bundle_generator_v4.json` (6.1 MB) | Pre-tiered/pre-mapped subset — the curated layer the tool should query first before falling back to full `data_all.json`. |
| **State staging files** | `databases/staging/aftercare_staged_{ME,MA,NH,VT,RI,CT}.json` | Multi-state expansion path is already a data pattern, not a refactor. |
| **Maintenance pipeline** | `databases/maintenance/` (79 Python scripts) | Append/normalize/dedup/verify ops exist; new resource categories or fields plug into a working pipeline. |
| **Clinical handouts** | `clinical-materials/Layer_{1..4}_*_Family_Handout.pdf`, `Companion_Navigating_Discharge.pdf` | The patient-facing output side has canonical PDFs already; the synthesizer's role is to **route** to these, not regenerate. |
| **RSSM 4-layer scaffold** | `rssm-manual/` + manuscript v10 | Sleep/Rhythm/Relational/Autonomy layers map directly to the four content blocks every discharge output needs. |
| **Tools-suite convention** | Single-file React 18 UMD, raw `React.createElement`, no Babel, design-system CSS (rc-tokens, rc-a11y, rc-components), shared libs (`rc-storage.js`, `rc-context.js`, `rc-data.js`, `rc-freshness.js`) | The build/deploy pipeline is already wired; this is one more tool, not a new infrastructure layer. |
| **Skills scaffolding** | `discharge-bundle-assembler`, `reconnect-tool-scaffolder`, `clinical-materials-qa-auditor`, `evidence-synthesis-pipeline` | Existing skill prompts encode the conventions you want this tool to honor. Use them as authoritative spec. |
| **Evidence layer** | `data_all.json` `ebp_reference` category (56 entries) + `evidence-synthesis-pipeline-workspace/` | Each recommendation can carry an evidence-tier tag back to a known source — a defensible posture under any audit. |

### 1.2 Inferred current architecture

Read literally from what's on disk: **client-side static**. Netlify Git-auto-build → static HTML tools that read JSON databases shipped as assets, with all logic in browser JS. No persistent server, no API gateway, no auth layer beyond Netlify's own. MCP servers exist in worktrees but they're development-time aids, not runtime production paths.

This is a strong architectural posture for the discharge tool because it:
- removes the entire "where does PHI live" question at MVP (answer: nowhere — it never leaves the browser),
- removes the auth/identity build-out,
- and keeps deploy cycles in minutes not days.

### 1.3 Infrastructure gaps that matter for `rc-dx-synth`

| Gap | Implication | Fix path |
|---|---|---|
| **No canonical schema files** | 40+ field schema is implicit in `data_all.json`. Implicit schemas drift. | Generate `databases/schemas/resource.schema.json` (Zod or JSON Schema) from a sampled inference + manual review. One-time job, blocks SIR design otherwise. |
| **No LLM proxy** | You currently call Claude only inside agent sessions, not from deployed tools. | Stand up a Netlify Edge function (`/.netlify/edge-functions/dx-synth-llm.ts`) as a thin no-log proxy to Anthropic. ~80 lines of code. |
| **No structured extraction pattern in the codebase** | None of your existing tools do "paste text → extracted JSON" at runtime. | This is the new capability the tool introduces; treat it as a reusable shared lib (`rc-extract.js`) so future tools inherit it. |
| **No telemetry / event log** | Can't measure click-saves, edits, accept rates. | Local-storage event log keyed to anonymous session ID for MVP; export-on-demand. Postpone server-side telemetry. |
| **No clinician-facing "review extracted variables" UX pattern** | Pattern is novel in your suite. | Build once in `rc-dx-synth`, port to other tools that would benefit (RDP screening, family meeting prep). |
| **`plan-net-directory` not yet present at repo root** | FHIR Plan-Net would let you live-query insurance networks instead of hardcoding `accepts_mainecare`. | Out of MVP scope. Phase 3. The current `insurance_nav` (101 entries) + `accepts_mainecare` boolean is sufficient at MVP. |
| **Evidence DB is iteration-1, not the claimed 76 entries** | CLAUDE.md says 76 entries; on disk you have `ebp_reference: 56` + one synthesis topic. Reconcile. | Treat the 56-entry `ebp_reference` as authoritative for MVP. Drop "76" from external claims until reconciled. |

### 1.4 Normalization strategy for the resource database

The 17-category schema is heterogeneous in practice (a pharmacy entry doesn't meaningfully have `stage_of_change`; a podcast doesn't have `accepts_mainecare`). Two strategies, with my recommendation:

**Option A — One big union schema (current state).** Every field is optional; type-checking is loose. Wins on simplicity, loses on validation.

**Option B — Core + per-category extensions (recommended).** A `ResourceCore` interface with universal fields (id, name, category, geo, evidence_level, last_verified, rss_layers, safety_tier), plus typed extensions per category (`AftercareExtension`, `CrisisExtension`, `HousingExtension`). Use TypeScript discriminated unions or JSON Schema `oneOf` keyed on `category`.

**Why B wins:** the discharge synthesizer's matching layer needs to ask category-specific questions ("does this PHP accept MaineCare AND is within 30 miles AND has openings within 14 days?") and a union schema makes those queries either unsound or written as defensive null-checks everywhere. A discriminated schema turns those into compile-time guarantees in the extraction → matching → output pipeline.

**Migration path:** non-breaking. Author the schema; add a `schema_version: "2026.05"` field to entries as they're touched by the maintenance pipeline; ship a `validate_schema.py` in `databases/maintenance/` and gate PRs on it once coverage > 95%. No re-write required.

---

## SECTION 2 — Clinical Input Parsing Engine

### 2.1 The pipeline (five stages, in order)

```
[1] PRE-PROCESS         → normalize whitespace, section-split, redact PHI patterns
[2] STRUCTURAL EXTRACT  → LLM call w/ JSON schema constraint → SIR.draft
[3] VALIDATE & ENRICH   → schema validation, rule-based fills, clinical sanity checks
[4] CLINICIAN REVIEW    → render SIR.draft as editable form, capture corrections
[5] FINALIZE            → SIR.final → downstream resource matching + output generation
```

Stage [3] is what most "LLM extraction" implementations skip and what makes the difference between a tool clinicians trust and one they abandon after two uses.

### 2.2 The Structured Intermediate Representation (SIR)

This is the contract between extraction and everything downstream. Lock it early; version it.

```typescript
// rc-dx-synth/src/types/sir.ts — canonical patient state representation
// version 0.1.0 — increment on any breaking change

interface SIR {
  schema_version: "0.1.0";
  extracted_at: string;                       // ISO 8601
  source: "discharge_summary" | "hp" | "progress_note" | "synopsis" | "abridged";
  source_text_hash: string;                   // SHA-256, for dedup/cache
  redaction_applied: boolean;
  redaction_log?: RedactionEvent[];

  // ── CLINICAL ──
  diagnoses: Diagnosis[];                     // primary + comorbid
  presenting_symptoms: Symptom[];
  current_medications: Medication[];
  medication_changes_this_admission: MedChange[];
  allergies: Allergy[];

  // ── RISK ──
  safety: {
    si_history: TernaryFlag;                  // present | denied | unknown
    si_current: TernaryFlag;
    hi_history: TernaryFlag;
    hi_current: TernaryFlag;
    self_harm_history: TernaryFlag;
    suicide_attempts: { count: number | "unknown"; most_recent?: string };
    access_to_means: TernaryFlag;
    safety_plan_in_place: boolean | "unknown";
    risk_tier: "low" | "moderate" | "high" | "indeterminate";
    risk_tier_rationale: string;              // LLM-extracted, clinician-editable
  };

  // ── SOCIAL / SDoH ──
  housing: {
    status: "stable" | "marginal" | "homeless" | "transitional" | "unknown";
    type?: "own" | "rent" | "family" | "shelter" | "street" | "facility" | "other";
    barriers: string[];                       // free-text tags
    eviction_risk?: boolean;
  };
  transportation: {
    access: "reliable" | "limited" | "none" | "unknown";
    barriers: string[];
    distance_to_followup_acceptable?: boolean;
  };
  substance_use: {
    current_use: SubstanceEntry[];
    history: SubstanceEntry[];
    withdrawal_risk: TernaryFlag;
    mat_eligible?: boolean;
    mat_current?: boolean;
  };
  family_supports: {
    living_with: string[];                    // role tags only — "spouse", "parent"
    quality: "supportive" | "mixed" | "absent" | "harmful" | "unknown";
    family_meeting_held?: boolean;
    contact_authorized?: boolean;             // ROI signed
  };
  legal: {
    pending_charges: boolean | "unknown";
    probation_parole: boolean | "unknown";
    custody_issues: boolean | "unknown";
    civil_commitment?: boolean;
  };
  work_school: {
    status: "employed" | "unemployed" | "student" | "disabled" | "retired" | "unknown";
    fmla_or_disability_needed?: boolean;
    school_communication_needed?: boolean;
  };

  // ── INSURANCE / ACCESS ──
  insurance: {
    primary?: string;                         // payer name (free text initially; normalize later)
    mainecare?: boolean;
    medicare?: boolean;
    commercial?: boolean;
    self_pay?: boolean;
    coverage_gaps_noted: string[];
  };

  // ── CARE CONTINUITY ──
  pcp: {
    has_pcp: boolean | "unknown";
    last_seen?: string;
    name?: string;                            // de-id'd to role/clinic if PHI-aware mode is off
  };
  outpatient_psychiatry: { has_provider: boolean | "unknown"; name?: string; last_seen?: string };
  outpatient_therapy: { has_provider: boolean | "unknown"; name?: string; modality?: string };

  // ── DISCHARGE NEEDS ──
  discharge: {
    target_loc: "outpatient" | "iop" | "php" | "residential" | "acute_followup" | "unknown";
    target_date?: string;
    barriers_to_discharge: string[];
    follow_up_timeframe_recommended_days?: number;
    family_meeting_recommended?: boolean;
    safety_plan_required: boolean;
    rss_layer_needs: ("sleep"|"rhythm"|"relational"|"autonomy")[];
  };

  // ── EXTRACTION META ──
  fields_extracted: number;
  fields_missing_critical: string[];          // dotted paths e.g. "safety.si_current"
  ambiguous_flags: AmbiguityFlag[];           // see §2.5
  confidence: Record<string, ConfidenceTier>; // dotted path → tier
}

type TernaryFlag = "yes" | "no" | "unknown";
type ConfidenceTier = "high" | "medium" | "low" | "absent";

interface AmbiguityFlag {
  field: string;
  reason: "contradiction" | "negation_ambiguity" | "low_evidence" | "out_of_scope";
  source_span?: string;                       // verbatim text from input
  llm_note?: string;
}

interface Diagnosis {
  code?: string;                              // ICD-10 if extractable
  label: string;
  status: "primary" | "comorbid" | "rule_out" | "historical";
  evidence_span?: string;
}

interface Medication {
  name: string;
  generic?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  class?: string;                             // ssri, mood_stabilizer, antipsychotic, etc.
  prn?: boolean;
}
```

Notes on schema decisions:

- **Ternary flags everywhere** (`yes | no | unknown`) instead of booleans, because "not mentioned" ≠ "no" in a clinical note and conflating them is how discharge tools generate dangerously confident wrong outputs.
- **Confidence per field**, not per document. Lets the UI gray out low-confidence values for clinician attention.
- **`evidence_span` on extractables** so the UI can underline the source text on hover/click — clinician trust comes from being able to verify provenance in one motion.
- **`ambiguous_flags` is a first-class output**, not an error condition. Discharge inputs are messy; the system should surface ambiguity rather than resolve it silently.

### 2.3 Extraction strategy: constrained JSON, two-pass

**Pass 1 — Structural extraction.** Single call to Claude (Sonnet 4.6 is the right balance of cost/quality for MVP; Haiku 4.5 is fine for re-extraction during edits). Use the Anthropic API's tool-use mechanism with a single tool whose input schema is the SIR — this forces JSON output that validates against your schema and avoids the "LLM returns prose-wrapped JSON" parsing headache.

**Pass 2 — Targeted re-extraction for low-confidence fields.** If Pass 1 returns `confidence.safety.si_current = "low"` or marks the field as ambiguous, fire a focused second call that gets only the relevant text span + the schema for just that subtree. Cheaper, more accurate, and isolates the error surface.

**Why two-pass beats one big prompt:** the model spends its attention budget on the whole document and underweights specific high-stakes fields. Two-pass lets you say "you missed/flagged this, look at it again with this much narrower lens."

### 2.4 Pre-processing & redaction (before any LLM call)

In Phase 1 (deidentified-only), the tool **does not trust the user to have redacted properly.** Run a client-side regex/spaCy-lite redactor before the call:

- Names: pattern-match against a names corpus + run `compromise.js` NER; replace with `[NAME_n]`
- Dates: collapse to relative ("3 days prior to admission")
- MRNs / phone / SSN / addresses: regex
- Free-text fields like "lives in Sanford" → preserve only the geographic granularity needed for matching (zip prefix or town)

The redactor logs every replacement to `redaction_log[]` so the clinician can verify before sending. **The Send button is disabled until the clinician has scrolled the redaction-preview pane.** This is a UX, not technical, requirement, and it matters disproportionately for adoption.

### 2.5 Ambiguity handling — the four classes

| Class | Example | System behavior |
|---|---|---|
| **Contradiction** | "Denies SI" later in note vs. "endorses passive SI to RN" | Flag both spans, force clinician resolution before downstream generation. |
| **Negation ambiguity** | "No clear plan or intent" — is plan absent or unclear? | Mark `unknown` not `no`; flag for review. |
| **Low evidence** | Single mention in HPI, never reconfirmed | Extract with `confidence: low`; do not auto-include in outputs. |
| **Out of scope** | Note mentions complex medical comorbidity beyond the synthesizer's domain | Note in `ambiguous_flags`; pass through to PCP summary as "see source note for [...]" rather than fabricate. |

The **bright-line rule** I'd encode in the system prompt: *Never assert a clinical fact that is not supported by a specific span from the input. If unsure, mark `unknown` and surface for review. There is no cost to a clinician confirming a missing field; there is a real cost to confidently extracting wrong information.*

### 2.6 Missing-data handling

Mandatory-fill fields (those the discharge output cannot be safely generated without):

- `diagnoses[0]` (primary diagnosis)
- `safety.si_current`, `safety.hi_current`, `safety.risk_tier`
- `discharge.target_loc`
- `insurance.primary` OR `insurance.self_pay`
- `housing.status`
- `pcp.has_pcp`

If any are missing or `unknown` after Pass 1, the UI surfaces a **completion panel** before allowing output generation. Optional fields proceed with their absence noted in outputs as "not documented" rather than fabricated.

### 2.7 Suggested ontologies / external references

- **Diagnoses**: ICD-10 + DSM-5-TR labels. Don't try to autocomplete from a hardcoded list at MVP; let LLM extract free-text and offer ICD lookup as a phase-2 nicety.
- **Medications**: RxNorm is the right long-term anchor; for MVP, normalize via a small lookup table for the ~120 medications you'd realistically see on a BHU.
- **SDoH**: align loosely with Gravity Project codes — useful for any future FHIR work but not blocking.
- **Risk scoring**: do not adopt a published instrument as gospel (C-SSRS, BSSA). Extract the *components* of risk into the SIR and let the clinician categorize. Adopting a scored instrument creates regulatory exposure as a clinical decision aid without adding clinical value at MVP.

---

## SECTION 3 — Output Engine

### 3.1 The seven output channels

Each is a distinct generator with its own template, hallucination safeguards, and readability target. They share the SIR as input but produce independently — the tool should let the clinician toggle which channels to generate, not force a monolithic output.

| Channel | Format | Required SIR fields | Optional | Readability target | Hallucination safeguard |
|---|---|---|---|---|---|
| **A — Epic discharge instructions** | Plain text, copy-paste-ready, no markdown | dx, meds, follow-up windows, safety plan ref, ER instructions | family contact, work/school | 7th–8th grade Flesch-Kincaid | Every named resource pulled from DB, never LLM-generated. Every dose number echoed verbatim from extracted med list. |
| **B — Patient-friendly handout** | HTML (printable) + plaintext fallback | dx (lay term), meds (lay term), follow-up names + dates, safety plan, warning signs | family guidance, work note | 6th grade | Resource names from DB; lay-term medication descriptions from an internal lookup table, not LLM. |
| **C — Referral summary** | Plain text per referral | target_loc, insurance, geo, dx, risk_tier | family supports, transport | N/A (clinician audience) | Resource name + contact info from DB; clinical narrative LLM-generated but must echo SIR fields. |
| **D — Social work communication** | Plain text + checklist | housing, transportation, insurance, family, legal, work | substance use, MAT needs | N/A | Bulleted SDoH facts only; no interpretive narrative. |
| **E — PCP handoff summary** | Plain text, 250 words max | dx, meds, med changes this admission, follow-up plan, red flags | substance use, social context | N/A | Hard word cap + structured template; LLM fills slots, doesn't free-write. |
| **F — Family guidance language** | Plain text or HTML | dx, RSS layer needs, family quality, ROI status | family meeting outcomes | 7th grade | Pull family handouts from `clinical-materials/Layer_{1..4}_*_Family_Handout.pdf` by reference; LLM only personalizes intro/closing. |
| **G — Safety planning language** | Plain text, Stanley-Brown format | safety.* | access to means, support contacts | 6th grade | Use a fixed-skeleton template; LLM only fills patient-specific examples in slots. **Never** auto-generate without explicit clinician confirmation of risk tier. |

### 3.2 Generator architecture: template + slot + narrative

Each output is built as:

```
TEMPLATE                          (deterministic, versioned, in repo)
  ├── FIXED HEADER                (e.g., "Discharge Instructions for...")
  ├── SLOTS                       (filled from SIR + DB lookups — no LLM)
  │     ├── {{patient_age_role}}
  │     ├── {{primary_diagnosis_lay}}
  │     ├── {{medication_list}}
  │     ├── {{followup_appt_blocks}}    ← DB-pulled resources
  │     └── {{safety_plan_ref}}
  ├── NARRATIVE BLOCKS            (LLM-generated, constrained to SIR + DB facts)
  │     ├── "Why you came to the hospital" (lay summary of admission)
  │     ├── "What helped you get better"   (RSS-layer-aware)
  │     └── "What to do if you feel worse" (uses safety.* directly)
  └── FIXED FOOTER                (legal/contact boilerplate from `clinical-materials/`)
```

Templates live as Markdown files with Mustache-style `{{slot}}` and `{{#narrative:slot_id}}` markers in `tools-suite/tools/rc-dx-synth/templates/`. They're version-controlled; changing a template requires a PR. This makes the output behavior auditable and reproducible.

### 3.3 Hallucination safeguards (a layered defense)

1. **Schema constraint on extraction** — LLM cannot output a med name that isn't in the medication slot of the SIR.
2. **Database-only resource naming** — any specific provider/program named in output must have come from a `data_all.json` query; the templating engine validates this against the active DB snapshot before render.
3. **Verbatim echo for high-stakes fields** — doses, frequencies, and follow-up appointment date/time strings appear in output exactly as they appear in SIR. Implemented as `{{verbatim:field}}` slot type that rejects modification.
4. **Source-span hover on every clinical claim** — the editor UI shows, on hover over any output sentence, the SIR field(s) and DB record IDs it traces to.
5. **Confidence-gated rendering** — output blocks dependent on `low`-confidence SIR fields render with a yellow caution underline and a tooltip stating which field is uncertain. The clinician can opt to remove the block.
6. **No model-generated lists** — wherever the output enumerates resources, side effects, warning signs, or appointments, the list is assembled from structured data and the LLM only narrates around it.
7. **Final pass: clinical-fact diff** — before allowing copy-to-clipboard, the system diffs the generated text against the SIR. Any clinical noun phrase (med, dx, dose, provider name) that doesn't echo from SIR or DB is flagged.

### 3.4 Readability scoring

Build readability checks directly into the generator. Use a JS port of Flesch-Kincaid (`textstat`-equivalent in browser); render the score next to each block. If the patient-facing output exceeds 8th grade, the tool either:
- regenerates that block with a "simplify" instruction, or
- highlights long/complex sentences for the clinician to manually edit.

This is a feature *and* a documentation artifact — being able to say "all patient handouts auto-checked at ≤7.5 grade level" is meaningful for institutional adoption.

### 3.5 Editing UX principles (the part most clinical tools get wrong)

- **Every output block is independently editable inline.** No modal, no "edit mode" toggle. Click-to-edit, blur-to-save.
- **Edits are tracked diffs.** The "Regenerate" button on a block shows what changed since last regen. Clinician's edits aren't blown away on regen of a sibling block.
- **One-shot regenerate-with-prompt.** Below each block: "Regenerate ▾" → free-text "make it shorter / mention transportation barrier / 5th grade level". Power-user feature; surface once clinicians demand it.
- **Locked blocks.** A clinician can click 🔒 on any block to freeze it; subsequent SIR edits won't propagate. Critical for the workflow of "I tuned this one paragraph perfectly, don't touch it."
- **Copy-block buttons everywhere.** Each block has its own copy button. Clinicians paste blocks into different Epic fields; making them copy-all-then-trim is friction.
- **Show me the Epic preview.** Render one tab that shows what the output looks like as a single concatenated text block stripped of HTML — the actual paste experience.

---

## SECTION 4 — Database Integration Plan

### 4.1 The matching problem stated precisely

Given a finalized SIR, return for each `discharge.target_loc` and each adjacent need (housing, transportation, peer support, family supports, etc.) a *ranked, filtered, geo-aware* list of resources from `data_all.json`, with explicit fallbacks when filters return zero results.

### 4.2 Query patterns by need

For each need-channel, a deterministic filter expression:

```typescript
// Aftercare (IOP/PHP/outpatient psych)
const aftercareCandidates = data_all.aftercare
  .filter(r => r.category === sir.discharge.target_loc)
  .filter(r => insuranceMatch(r, sir.insurance))
  .filter(r => geoWithin(r, sir.patient_zip, milesByLOC[sir.discharge.target_loc]))
  .filter(r => locWaitlistAcceptable(r, sir.discharge.follow_up_timeframe_recommended_days))
  .filter(r => populationMatch(r, sir));     // adult vs pediatric, gender-specific, etc.
```

The functions `insuranceMatch`, `geoWithin`, `locWaitlistAcceptable`, `populationMatch` are pure deterministic JS — testable, reviewable, no LLM in the loop.

### 4.3 Ranking (deterministic, then LLM-narrated)

Score each candidate via a weighted sum:

```
score = w1 * proximity_score          (closer = higher; logarithmic)
      + w2 * evidence_tier_score      (from ebp_reference cross-link, if any)
      + w3 * recency_of_verification  (last_verified < 90 days = high)
      + w4 * profile_match_score      (rss_layers ∩ sir.discharge.rss_layer_needs)
      + w5 * trauma_informed_bonus    (when sir flags trauma history)
      + w6 * mainecare_accepting_bonus (when sir.insurance.mainecare)
```

Initial weights from clinical judgment, then tunable. Log scores so they're auditable; expose a "why this resource?" affordance in the UI.

**Crucially: the LLM does not rank.** The LLM may *narrate* why the top-3 are appropriate ("Bridgeway IOP is closest, accepts MaineCare, and has trauma-informed track"), but ranking is deterministic and reproducible.

### 4.4 Geographic filtering

`data_all.json` records carry addresses; for ME, you can pre-compute lat/lon during the maintenance pipeline (`databases/maintenance/geocode_addresses.py` — write if not present). Then proximity = Haversine distance.

For other states (NH/VT/MA/CT/RI in your staging files), do the same once at staging-merge time. **Do not call a geocoding API at runtime** — pre-compute, ship coordinates in the JSON.

Distance budget by LOC (defaults, override per-patient):
- IOP/PHP: 30 miles
- Outpatient psych/therapy: 25 miles
- Residential: 100 miles (acceptable for substance use; clinician judgment)
- Peer support / community: 20 miles
- Telehealth: ignore distance, prefer `telehealth_available: true`

### 4.5 Insurance filtering

The current schema's `accepts_mainecare: boolean` is sufficient for ME. For multi-state, add `accepts_insurance: string[]` with normalized payer names from the `insurance_nav` category. Three-strike rule:

1. Exact payer match → primary results
2. `accepts_self_pay: true` → secondary results, surfaced separately
3. None → flag in UI with "No in-network options found within distance; consider [telehealth/self-pay/expand radius]"

### 4.6 Level-of-care filtering

`sir.discharge.target_loc` directly maps to `category` in `data_all.aftercare`. But add a *step-down chain* for fallback:

```
target_loc = "php" → fallback to "iop" → fallback to "outpatient"
target_loc = "iop" → fallback to "outpatient" + peer_support
target_loc = "residential" → never fallback silently; flag for SW consult
```

### 4.7 Fallback logic when filters return zero

The single most important UX behavior: **never return an empty list silently.** Always return something + an explanation of how the filters were relaxed.

```
Stage 1: Exact filters → 0 results
Stage 2: Drop insurance filter → "Showing options that may require self-pay or insurance verification"
Stage 3: Expand radius to 2x → "Showing options up to 60 miles from home zip"
Stage 4: Drop LOC for one step → "Showing PHP options (no IOP availability in network)"
Stage 5: Telehealth-only sweep → "Consider telehealth options listed below"
Stage 6: Crisis line + "no aftercare match found — escalate to SW" sentinel
```

Each fallback stage logs why the relaxation happened. This is essential for clinical defensibility.

### 4.8 Resource freshness gating

Your maintenance pipeline already tracks `last_verified`. Add a UI rule: resources older than 180 days display with a "needs re-verification" badge but are *not* hidden. After 365 days, they're hidden by default with a toggle. This pushes maintenance attention to stale records without crippling matching when DB hygiene slips.

### 4.9 Future: FHIR Plan-Net layer

Out of MVP scope. When you reactivate `plan-net-directory`, the integration point is: it produces an *insurance overlay* on `data_all.aftercare` that augments `accepts_*` flags with live network data. The matching engine doesn't need to change; only the data source does.

---

## SECTION 5 — Technical Architecture

### 5.1 Recommended stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Single-file React 18 UMD + raw `React.createElement`, no Babel | Honors your existing tools-suite convention. No build step. Ships to Netlify the same way every other tool does. |
| **State** | `useReducer` + a top-level `SIR` context (via `rc-context.js`) | The whole tool is one state machine: input → SIR draft → SIR final → outputs. Reducer makes flow explicit and unit-testable. |
| **Styling** | rc-tokens, rc-a11y, rc-components | Consistency + accessibility free of charge. |
| **Data load** | `rc-data.js` (existing) loading `data_all.json` + `data_discharge_bundle_generator_v4.json` | Already does what we need. Cache-bust by content hash. |
| **Schema validation** | Ajv (JSON Schema) loaded via CDN UMD bundle | Validates extracted SIR client-side before any output is generated. |
| **Redaction** | `compromise.js` (UMD) + a regex layer | Browser-side, no network. |
| **LLM call** | Netlify Edge Function proxy (Phase 1) / AWS Bedrock (Phase 2) | Edge function is ~80 LOC, no logging by configuration, returns Anthropic responses straight through. |
| **Readability** | `text-readability` browser port (or roll in ~50 lines) | Inline scoring. |
| **Telemetry** | `localStorage` event log keyed to session UUID | No server roundtrip, exportable, deletable. |
| **PDF export** | `html2pdf.js` (UMD) | For patient handout printable variant. |

**What I'd explicitly not use at MVP:** any vector DB, any RAG framework, any LangChain/LlamaIndex orchestration layer. Your databases are small enough (14 MB unified) to ship as JSON and filter in-memory. Vector retrieval is a solution looking for a problem here.

### 5.2 LLM orchestration

A single orchestrator function in `rc-dx-synth/src/orchestrator.js`:

```javascript
async function synthesizeDischarge({ rawText, opts }) {
  const cleanText = redact(rawText);                              // 1
  const sirDraft = await extractSIR(cleanText, opts);             // 2 (LLM call #1)
  const ambig = sirDraft.ambiguous_flags;
  if (ambig.length) {
    await reExtractAmbiguousFields(sirDraft, cleanText);          // 3 (optional LLM call #2)
  }
  // 4 — clinician review happens in UI; we await sirFinal via state
  return { sirDraft };
}

async function generateOutputs(sirFinal, channels) {
  const resources = matchResources(sirFinal);                     // 5 deterministic
  const outputs = {};
  for (const ch of channels) {
    outputs[ch] = await renderTemplate(ch, sirFinal, resources);  // 6 (LLM call per channel for narrative blocks)
  }
  return outputs;
}
```

**Prompts as versioned files**, not string-concatenated in JS. Live at `tools-suite/tools/rc-dx-synth/prompts/` as `.md` with a YAML front-matter declaring inputs/outputs. Loaded at runtime via `fetch`. Makes prompt iteration a PR-reviewable activity.

### 5.3 Local vs. cloud processing

| Stage | Where it runs | Rationale |
|---|---|---|
| Redaction | Browser | PHI never crosses the wire if Phase 1 deidentified-only. |
| Extraction LLM call | Edge function → Anthropic API | Edge function logs nothing, holds the API key, applies rate limits. |
| SIR validation | Browser | Schema is shipped to client. |
| Resource matching | Browser | DB is shipped to client. |
| Template rendering | Browser, with embedded LLM calls per narrative block via the same proxy | |
| Telemetry write | Browser localStorage | Until you have a need for cross-session analytics. |

**Phase 2 PHI path**: same flow, but the proxy targets Anthropic-on-Bedrock under a MaineHealth BAA (or Azure OpenAI with BAA). Proxy gains a logging layer for audit (PHI-aware: log metadata, not content). The browser-side logic is unchanged.

### 5.4 Structured JSON intermediate layer

This is the SIR (Section 2.2). Single source of truth between extraction, matching, and output. Persist to localStorage during a session; never persist across sessions in Phase 1.

### 5.5 Caching opportunities

- **Source text hash → SIR draft**: dedup identical pastes. Per-session localStorage, opt-in clearable.
- **Resource match query → results**: cache for 5 min within session.
- **Template + SIR snapshot → output**: cache so re-rendering after a non-affecting edit is instant.

No server-side cache in Phase 1.

### 5.6 Audit logging strategy

Phase 1 — local only:
```typescript
interface AuditEvent {
  ts: string;
  session_id: string;          // UUID, per-tab
  event: "extract_start" | "extract_complete" | "sir_edit" | "match_run" | "output_generated" | "output_copied";
  channel?: string;            // for output events
  llm_model?: string;
  tokens?: { in: number; out: number };
  hash?: string;               // never raw content
}
```
Logged to localStorage; exportable as JSON via a hidden "Export audit" link. This becomes the foundation for any future quality improvement project.

Phase 2 — when you have a server proxy under BAA, the proxy logs structured events (still no content) to a HIPAA-compliant store. Use the same schema.

### 5.7 PHI boundary recommendations

**The bright lines:**

1. **In Phase 1, no PHI crosses the proxy.** Period. The redaction step is enforced by the UI (Send disabled until redaction preview confirmed) and by a server-side regex check in the Edge function that rejects requests containing high-confidence PHI patterns. Defense in depth.
2. **No PHI in localStorage even within a session.** When the tab closes, the SIR is gone. This is a deliberate UX cost (no resume) that buys you a clean PHI story.
3. **No third-party analytics, no Sentry, no Datadog RUM, no CDN with logging** on this tool's HTML page. Audit the included scripts every release.
4. **Phase 2 adds PHI capability under a BAA.** Bedrock under MaineHealth's AWS account with a configured BAA is the cleanest. Azure OpenAI is fine. Direct Anthropic API does not currently come with a BAA for healthcare in all contexts — verify with their enterprise team before crossing this line.

---

## SECTION 6 — Safety, Legal, Clinical Governance

### 6.1 Hallucination risk — concrete failure modes and mitigations

| Failure mode | Severity | Mitigation |
|---|---|---|
| LLM invents a medication or dose | Critical | Verbatim-echo slots; pre-render diff check against SIR; clinician must re-paste dose if edited. |
| LLM invents a provider name / phone | Critical | All resource names come from DB only; template engine rejects un-DB-sourced provider strings. |
| LLM oversimplifies risk language ("low risk for self-harm" when SIR says `moderate`) | High | Risk-tier rendered from SIR enum, not LLM prose. LLM narrative around risk is guard-railed with explicit instructions to echo the tier. |
| LLM generates plausible but unsupported clinical claim ("patient demonstrated insight") | Medium | All clinical claims must trace to a SIR field. Pre-publish diff highlights ungrounded noun phrases. |
| LLM fabricates a follow-up date | Critical | Dates are slot-filled from SIR + DB query result; not LLM-generated. |
| LLM softens or omits a safety concern | High | Safety section is template-only with structured slots; LLM gets to narrate only the patient-friendly framing. |

### 6.2 Liability risks

- **As a CDS tool (not SaMD), keep it on the right side of the line:**
  - The four 21st Century Cures Act criteria require: (1) the software is not intended to acquire/process medical images for diagnosis; (2) it displays information including clinical recommendations; (3) it provides recommendations to a healthcare professional; (4) it enables the professional to independently review the basis for recommendations such that they don't rely primarily on the recommendation. Hit all four explicitly in your design and labeling.
  - **"Why this resource?" affordance, edit-everything UX, source-span hover** — these are not just nice UX, they are the legal moat. Document the design choice as such in `docs/regulatory/cds-exemption-analysis.md`.
- **Get a written "for clinician use, not a substitute for clinical judgment" disclosure** on every screen and every printed output. Boilerplate language reviewed by MaineHealth counsel before any clinical pilot.
- **Do not market or describe** the tool as "AI-generated discharge plans." Describe it as a *documentation efficiency tool that assembles content from a clinician-curated resource database*. This framing both matches reality and reduces regulatory surface.

### 6.3 Physician review safeguards

- No output is rendered as final until the clinician clicks "Finalize for paste" — explicit affirmation. Prior to that, all outputs carry a "DRAFT — clinician review required" header that's stripped only on finalize.
- The full SIR review screen is non-skippable. Even if all fields extracted with high confidence, the clinician must click "Confirm extracted variables" before generating outputs.
- A "what would change?" diff view shows the clinician what output they would have generated 10 minutes ago vs. now — catches the case of accidental edits cascading badly.

### 6.4 Auditability

Every clinical session leaves behind, on clinician request, a JSON export:
- The redacted input text
- The SIR draft, edit history, and final SIR
- The DB snapshot version (hash) used for matching
- The generated outputs (each version)
- The clinician edits to outputs
- The timestamped event log

This is the artifact that, if a sentinel event ever traces back to a discharge plan, lets you reconstruct precisely what the tool surfaced and what the clinician did with it.

### 6.5 Transparency requirements

Build a permanent "How this tool works" panel accessible from the header:
- Which model is being called
- What prompts are sent (templated, with placeholders for redacted clinical text)
- How resources are ranked
- Last DB update date
- Known limitations and disclaimers

This is a clinical adoption tool as much as a legal one — clinicians trust tools they can inspect.

### 6.6 Informed-use language (placeholders for counsel review)

> *This tool assembles documentation from clinician-curated resources and your structured clinical input. All output is draft text intended to be reviewed, edited, and verified by the discharging clinician prior to use. The tool does not replace clinical judgment, diagnostic reasoning, or your professional responsibility for discharge planning. No patient-identifiable information should be entered in [Phase 1 / deidentified mode].*

### 6.7 Clinical governance recommendations

Stand up a lightweight governance structure before clinical pilot:

- **Clinical owner**: you (Dr. Moss). Final say on prompts, templates, content.
- **Technical owner**: TBD; rotates with engineering staffing.
- **Adverse output review**: any clinician who finds a problematic output flags via a one-click "Report concern" button → exports the full audit JSON to a shared review folder. Weekly review meeting (you + Russell + one other clinician).
- **Quarterly prompt/template re-review**: scheduled, with a written checklist (covered in QA harness, §7).
- **Version + changelog discipline**: every prompt and template gets a semver. CHANGELOG.md at the tool root. Output exports always carry the version triplet (prompt vN, template vN, db vN).

### 6.8 HIPAA / security considerations

- Phase 1 deidentified mode: no BAA strictly needed if redaction is robust and Edge function never logs content. **But** sign one with Anthropic anyway if available — defensive posture.
- Phase 2 PHI mode: Bedrock-under-MaineHealth-AWS or Azure with full BAA. Encrypted at rest, encrypted in transit, no third-party model providers, no model fine-tuning on data without separate review.
- Access control: at MVP, the tool is gated behind MaineHealth SSO via Netlify's auth or a simple shared-secret in the Edge function. Phase 2 hardens to org SSO with MFA.
- Pen test before Phase 2. MaineHealth security review before any PHI mode.

### 6.9 Data retention strategy

- **Phase 1**: nothing retained. Tab close = gone. Audit exports are user-initiated and live wherever the clinician saves them.
- **Phase 2**: server-side audit logs retained per MaineHealth IT policy (typically 7 years for healthcare audit). No content, only metadata + hashes. Patient-input text is never persisted server-side unless explicitly opted in for a research study under separate consent.

---

## SECTION 7 — MVP Roadmap

### 7.1 The highest-yield MVP

A single tool at `tools-suite/tools/rc-dx-synth/index.html` that:

1. Accepts paste of one deidentified clinical text block.
2. Runs redaction + extraction.
3. Renders SIR for clinician review (single screen, all fields).
4. On confirmation, runs resource matching against `data_discharge_bundle_generator_v4.json` (+ aftercare slice).
5. Generates exactly **three** output channels at MVP: **A (Epic discharge instructions)**, **B (Patient-friendly handout)**, **E (PCP handoff)**. Postpone the other four channels to v0.2.
6. Provides inline editing, copy buttons, and a structured audit export.

Why these three first: A is the daily pain you actually feel, B has the highest patient-care impact, E unlocks PCP relationships (which has follow-on value for the multi-state expansion). C/D/F/G are valuable but build incrementally on the same machinery.

### 7.2 30-day build plan

| Days | Workstream | Deliverable |
|---|---|---|
| 1–3 | Schema lock | `databases/schemas/resource.schema.json`, `tools-suite/tools/rc-dx-synth/src/types/sir.ts` finalized; ADR written. |
| 1–3 | Edge function | Netlify Edge function proxy live in `infrastructure/edge-functions/dx-synth-llm.ts`; smoke tested. |
| 4–7 | Extraction prompt + tool harness | `prompts/extract_sir.md` first version; offline test against 20 synthetic notes; success measured by SIR validation pass rate. |
| 5–8 | Redaction layer | `rc-extract.js` shared lib; regex + compromise.js; test fixtures with planted PHI patterns; 100% capture on test set. |
| 6–10 | Resource matching | `rc-match.js` deterministic functions for `insuranceMatch`, `geoWithin`, `locWaitlistAcceptable`, fallback chain; unit tests. |
| 10–15 | Template engine + first 3 templates | Mustache-style renderer; A/B/E templates v1; readability scoring; test render with synthetic SIRs. |
| 13–18 | UI shell | Single-page React tool: paste → redaction preview → extraction → SIR review → matching → outputs; inline edit; copy buttons. |
| 18–22 | Output narrative LLM integration | LLM calls per narrative slot wired up; verbatim-slot enforcement; pre-publish diff check. |
| 22–25 | Audit export + governance panel | localStorage event log, JSON export, "how this works" panel. |
| 25–28 | Synthetic patient testing harness | 30 synthetic cases covering 5 risk profiles × 6 LOC; expected SIR + expected output channels documented; tool runs all 30, generates QA report. |
| 28–30 | Internal pilot prep | You + one other BHU clinician runs through 10 synthetic cases; ship-list of edits. Decision gate: pilot or iterate. |

### 7.3 90-day roadmap

**Days 30–60 — Internal pilot, deidentified mode:**
- 2 BHU clinicians, 4 weeks, target 25–40 deidentified discharges processed.
- Metrics: extraction accuracy (sampled), clinician edit rate per block, time-to-complete vs. baseline (paper or current workflow), accept-as-is rate.
- Weekly governance review of flagged outputs.
- Output channels C/D/F/G added incrementally as v0.2.

**Days 60–90 — Pilot expansion + PHI path planning:**
- Expand to 4–6 clinicians at BHU; introduce structured feedback form.
- Begin MaineHealth IT/Compliance conversation for Phase 2 PHI mode (Bedrock under BAA).
- Multi-state DB integration: tool offers state selector that switches the aftercare slice used for matching. NH and VT come online in this window per the staging files you already have.
- Start collecting outcome data — preliminary readmission tracking on pilot cohort vs. matched controls. Not powered for inference yet; setting up the pipeline.

**Days 90+ — Phase 2 PHI mode + expansion to non-BHU settings:**
- Bedrock proxy live, MaineHealth SSO gating, audit logging server-side.
- Expansion targets: outpatient psychiatry follow-up summaries; ED-to-IOP referrals; private practice deployment as a separate hosted instance.
- Pilot study tie-in: the audit export becomes a research data source for the BHU pilot, with proper IRB coverage.

### 7.4 Ideal clinician testing workflow

For each test case:
1. Clinician opens the tool, pastes a synthetic note from the test set.
2. Tool runs extraction; clinician reviews SIR.
3. Clinician notes any incorrect extraction in a structured feedback form (in-tool).
4. Clinician confirms / corrects SIR, generates outputs.
5. Clinician reviews each output; rates each on a 4-point scale (use-as-is / minor edit / major edit / unusable).
6. Tool auto-exports the audit + feedback to a shared review folder.

This is the data you'd ultimately want to publish: extraction accuracy, output usability rates, time savings.

### 7.5 QA harness strategy

`tools-suite/tools/rc-dx-synth/qa/` contains:

- **`fixtures/`** — synthetic clinical notes covering: 5 risk profiles (low/mod/high/mixed/contradictory), 6 LOCs, 4 SDoH combinations (housed/unhoused × insured/uninsured), pediatric vs. adult, substance use co-occurring, geriatric, perinatal. Aim for ~50 cases.
- **`expected/`** — for each fixture, the expected SIR (golden file) + the expected resource match top-3 + the expected output skeleton (slot-by-slot expectations, not exact prose since narrative varies).
- **`harness.js`** — runs the full pipeline against each fixture, asserts SIR validation, computes extraction field-level F1, asserts resource-match top-3 contains expected, asserts output skeletons match expected slot values.
- **CI integration** — runs on every PR. Failing fixtures block merge unless explicitly waived with rationale.

This is the single most important investment after the initial build. The tool's reliability is the harness's coverage.

### 7.6 Synthetic patient testing strategy

Never use real patient data for testing. Use the `population-adaptation-scaffolder` skill conventions to generate synthetic cases that cover edge categories — perinatal, geriatric, forensic/justice-involved, IDD, refugee/immigrant, LGBTQ+ affirming, dual-diagnosis. Each case lives as a markdown file with structured front-matter declaring expected SIR fields and risk profile.

A small internal "case factory" — even just a Claude prompt that produces synthetic discharge summaries given a profile spec — keeps the fixture set growing without leaking real PHI into the test pipeline.

---

## SECTION 8 — UX / Workflow Design

### 8.1 The five-screen flow

```
[ 1. PASTE ]   →   [ 2. REDACT REVIEW ]   →   [ 3. SIR REVIEW ]   →   [ 4. MATCH + OUTPUTS ]   →   [ 5. COPY / FINALIZE ]
   ~10s             ~15s                         ~60–120s              ~30s wait + edit              ~10s
```

Total target: **3–4 minutes from paste to clipboard for a typical discharge.** Baseline (clinician building this manually) is closer to 15–25 minutes. The time saving is the entire commercial and clinical thesis.

### 8.2 Screen 1 — Paste

- One large textarea.
- A "Source type" selector (discharge summary / H&P / progress note / synopsis) — informs extraction prompt selection.
- A "State" selector (defaults to ME) — informs resource matching.
- "Paste and continue" button. Cmd-Enter shortcut.

### 8.3 Screen 2 — Redaction review

- Side-by-side: original (with PHI highlighted) vs. redacted (with `[NAME_1]`, `[DATE_REL]` etc.).
- Counter at top: "8 PHI patterns redacted." Click to see the list.
- "Looks good — extract" button is disabled until the user has scrolled past the bottom of the redacted text (forced verification).
- "Add a redaction" affordance — clinician can highlight any remaining text they want stripped. Common case: free-text identifiers the regex missed.

### 8.4 Screen 3 — SIR review (the longest stop)

This is the most important screen and the one most likely to be ugly if rushed. Design principles:

- **Single page, no tabs at MVP.** Tabs let clinicians miss fields. Long scroll forces eyes across every section.
- **Section blocks in clinical reading order**: Demographics-lite → Diagnoses → Meds → Safety → SDoH → Care continuity → Discharge plan.
- **Each field shows: extracted value, confidence pill, source-span on hover, inline-editable.** Confidence pills are color-coded (green/yellow/orange/red).
- **Critical fields are flagged with a red dot if missing.** "5 critical fields need attention" banner at top counts down as the clinician fills them.
- **"Show me where this came from" on every field** — clicking a small icon scrolls a panel at right that shows the redacted source text with that span highlighted. This is the single most clinician-trust-building feature.
- **Ambiguity flags surfaced as a banner**, not buried in fields. "3 ambiguities detected — review before continuing." Each is a 1-click jump.

### 8.5 Screen 4 — Match + outputs

- Three output panels visible simultaneously (A, B, E at MVP).
- Each panel: title, generated content (editable inline), copy button, readability score, "regenerate" button.
- A right-side rail: matched resources for each channel, top 3 with "why this?" expander, "swap" affordance to pick #4/#5 if clinician disagrees.
- A "Resources I want to add" affordance — clinician can search the DB and add a resource that wasn't auto-matched (e.g., a specific therapist they want to refer to).
- Sticky footer: "Finalize for paste" with output channel checkboxes.

### 8.6 Screen 5 — Copy / finalize

- One canonical Epic-pasteable view for channel A.
- One printable HTML view for channel B (auto-print dialog on demand).
- One smaller block for channel E.
- "Audit export" link (always present, never the primary action).
- "Start over" button — clears state, clears localStorage SIR.

### 8.7 Minimizing clicks

Map every click to a target:
- Paste → 1 click (paste shortcut counts as 0 explicit).
- Continue past redact → 1 click.
- Confirm SIR → 1 click (more if edits needed, but the *non-edit* path is 1 click).
- Trigger output generation → 0 clicks (auto-trigger on SIR confirm).
- Per-output copy → 1 click each.

Minimum-friction case: **4 clicks** from open-to-clipboard. Realistic with edits: **8–12 clicks.**

### 8.8 Cognitive-load minimization

- **Never ask the clinician to remember the last screen.** Carry the active diagnosis, target LOC, and patient zip into every subsequent screen header as a compact ribbon.
- **Reduce options to choices.** Don't show 47 IOP options; show top 3 with a "show more" expander.
- **Defaults that match the BHU norm.** Adult, MaineCare, 30-mile radius — these don't need to be set every time.
- **Inline help is on-hover, not on-modal.** Tooltips, not popups.

### 8.9 Preserving clinician trust

The persistent through-line: **the clinician is always in control, always can see why, and can always edit.** The minute the tool feels like a black box, adoption dies. The provenance/source-span pattern, the structured DB matching, and the always-editable outputs are the substrate of that trust.

### 8.10 Flexibility hooks for power users

After the first few sessions, clinicians want:
- **Bookmarklets to paste from Epic** (clipboard auto-strips one common Epic header).
- **Profile presets** — "always use 20-mile radius, always include peer support channel."
- **Snippet library** — clinician-authored phrasings they want auto-inserted into specific output blocks ("My usual closing line for safety plans").

Phase 2 features. Foreshadow in the UI; ship in v0.3.

---

## SECTION 9 — Codex-Ready Backlog

The following are concrete, atomized tickets, written in a form Claude Code / Codex can consume. Grouped by epic. P0 = blocking MVP; P1 = needed by v0.2; P2 = nice-to-have.

### EPIC 1 — Schema & data model

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 1.1 | P0 | Generate canonical `resource.schema.json` from sampled inference of `databases/core/data_all.json` | Validates 100% of current entries with no warnings; reviewed by clinical lead. |
| 1.2 | P0 | Author SIR TypeScript interface and equivalent JSON Schema at `tools-suite/tools/rc-dx-synth/src/types/sir.ts` (+ `.schema.json`) | Roundtrip-validates against test fixture SIR JSON. |
| 1.3 | P0 | ADR: "Why Core+Extensions schema for resources" at `docs/adr/0001-resource-schema-strategy.md` | Includes decision, alternatives, consequences. |
| 1.4 | P1 | `databases/maintenance/validate_schema.py` — gate maintenance ops against `resource.schema.json` | CI runs on PRs touching `databases/`. |
| 1.5 | P1 | Geocode all aftercare entries → add `lat`, `lon`, `geocoded_at` fields | 99% coverage; failures logged; idempotent. |
| 1.6 | P2 | Migrate `accepts_mainecare: boolean` → `accepts_insurance: string[]` with backfill | Non-breaking; old field retained for one release. |

### EPIC 2 — LLM proxy infrastructure

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 2.1 | P0 | Netlify Edge Function at `infrastructure/edge-functions/dx-synth-llm.ts` proxying Anthropic with no logging | <100 LOC; rate-limited; rejects requests >32k chars; rejects PHI patterns (regex check). |
| 2.2 | P0 | API key management — env var pattern, rotation runbook | Documented in `infrastructure/edge-functions/README.md`. |
| 2.3 | P1 | Edge function emits anonymous metrics (request count, token count, error count) to a metrics sink | No content logged; sink is local-first (counter file) then optionally upgraded. |
| 2.4 | P2 | Plan + ADR for Bedrock/Azure migration path under BAA | ADR at `docs/adr/0003-phi-mode-llm-routing.md`. |

### EPIC 3 — Extraction engine

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 3.1 | P0 | `rc-extract.js` shared lib: redaction (regex + compromise.js NER) | Captures planted PHI in 100% of test fixtures. |
| 3.2 | P0 | Extraction prompt v1 at `tools-suite/tools/rc-dx-synth/prompts/extract_sir.md` | Versioned with YAML front-matter; passes Ajv against SIR schema on 25/25 synthetic cases. |
| 3.3 | P0 | Two-pass extraction wrapper — pass 1 full, pass 2 targeted for low-confidence fields | Pass 2 reduces low-confidence field count by ≥50% on benchmark set. |
| 3.4 | P0 | Source-span attribution: every extracted field carries `evidence_span` when available | ≥90% of extracted clinical fields have a non-empty span. |
| 3.5 | P1 | Source-type-specific prompt variants (discharge summary vs. H&P vs. synopsis) | 4 variants; harness chooses based on user selection. |
| 3.6 | P2 | Local model fallback evaluation (Llama 3 70B / Mistral) for parsing-only stage | Quality bar: ≥85% of field-level F1 vs. Sonnet baseline; documented. |

### EPIC 4 — Matching engine

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 4.1 | P0 | `rc-match.js` shared lib with `insuranceMatch`, `geoWithin`, `locWaitlistAcceptable`, `populationMatch`, `rankResources` | Unit tests for each; all deterministic; no LLM in any path. |
| 4.2 | P0 | Fallback chain logic — five-stage relaxation with logging | Returns a result for every fixture (no empty list); chain decisions logged. |
| 4.3 | P0 | Ranking weights v1 with rationale comments citing clinical sources | Documented in `rc-match.js` header; reviewed by clinical lead. |
| 4.4 | P1 | "Why this resource?" generator — produces 1-line explanation per ranked resource | Pure-deterministic explanation (not LLM); uses score components. |
| 4.5 | P1 | Resource freshness display (180/365 day badges) | Hidden if disabled in user profile; visible by default. |
| 4.6 | P2 | Manual resource override — clinician searches DB, pins to channel | Available in match-screen rail; surfaces "added by clinician" tag in output. |

### EPIC 5 — Output engine

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 5.1 | P0 | Mustache-style template renderer with `{{slot}}`, `{{verbatim:slot}}`, `{{#narrative:id}}` markers | Renders template fixtures with mock SIR + DB; verbatim slots reject modification. |
| 5.2 | P0 | Template — Channel A (Epic discharge instructions) v1 | Renders correctly for 5 synthetic SIRs; FK grade ≤8 on patient-facing portions. |
| 5.3 | P0 | Template — Channel B (Patient-friendly handout) v1, printable HTML variant | Renders + prints; FK grade ≤6 on body text. |
| 5.4 | P0 | Template — Channel E (PCP handoff summary) v1 | Renders ≤250 words on standard test SIR. |
| 5.5 | P0 | Narrative-block LLM call wrapper with verbatim-echo enforcement and source-span hover support | Pre-publish diff check rejects ungrounded clinical noun phrases. |
| 5.6 | P1 | Templates — Channels C, D, F, G v1 | Each ships with ≥5 fixture renderings reviewed by clinical lead. |
| 5.7 | P1 | Readability scoring inline next to each block | FK + Gunning Fog + SMOG triplet; click to expand for diagnostics. |
| 5.8 | P1 | "Simplify this block" affordance — re-runs LLM with simplification prompt | Reduces FK by ≥1 grade on benchmark blocks. |
| 5.9 | P2 | Snippet library — clinician saves frequently-used phrasings, inserts into slots | Saved per-user in localStorage; export/import. |

### EPIC 6 — UI / workflow

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 6.1 | P0 | Single-file React 18 UMD shell at `tools-suite/tools/rc-dx-synth/index.html`; rc-tokens, rc-a11y, rc-components imports | Lighthouse a11y ≥95; matches existing tool conventions. |
| 6.2 | P0 | Screen 1 — Paste UI with source-type + state selectors | Keyboard-driven; Cmd-Enter advances. |
| 6.3 | P0 | Screen 2 — Redaction review with planted-PHI test | Send button disabled until scrolled; "add redaction" affordance works. |
| 6.4 | P0 | Screen 3 — SIR review with inline-edit, confidence pills, source-span hover, missing-field banner | All P0 fields editable; ambiguity flags surfaced; missing-critical banner counts down. |
| 6.5 | P0 | Screen 4 — three-output layout with matched resources rail | Outputs render; resources rail shows top-3 with "why this?". |
| 6.6 | P0 | Screen 5 — copy / finalize / audit export | Copy buttons work per-block; finalize strips draft header; audit export downloads JSON. |
| 6.7 | P1 | "How this tool works" governance panel accessible from header | Lists active model, prompt versions, DB version, last update. |
| 6.8 | P1 | Profile presets in localStorage | Saved radius, default state, default output channels. |
| 6.9 | P2 | Power-user keyboard shortcuts (`?` modal listing all) | Documented in panel. |

### EPIC 7 — QA harness & testing

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 7.1 | P0 | QA harness scaffold at `tools-suite/tools/rc-dx-synth/qa/harness.js` | Runs all fixtures end-to-end; emits report. |
| 7.2 | P0 | Synthetic-fixture set: 30 cases across 5 risk × 6 LOC | Fixtures + expected SIR golden files + expected match top-3. |
| 7.3 | P0 | CI integration — harness runs on PRs touching `tools-suite/tools/rc-dx-synth/` | Failing fixtures block merge. |
| 7.4 | P1 | Extend fixture set to 50 cases adding pediatric / perinatal / forensic / IDD | Reviewed by clinical lead. |
| 7.5 | P1 | Hallucination diff-check pre-publish — flags un-SIR-sourced clinical noun phrases | False-positive rate <5% on benchmark; documented. |
| 7.6 | P2 | Quarterly prompt/template re-review checklist + runner | Documented in `tools-suite/tools/rc-dx-synth/docs/qa-cadence.md`. |

### EPIC 8 — Clinical validation

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 8.1 | P0 | Pilot protocol at `docs/pilot/dx-synth-deidentified-pilot.md` | Approved by clinical lead and Russell. |
| 8.2 | P0 | In-tool clinician feedback form (post-output) | Captures use-as-is/minor-edit/major-edit/unusable + free-text; localStorage persisted. |
| 8.3 | P1 | Pilot data export pipeline — aggregates audit + feedback into deidentified dataset for analysis | Weekly run; outputs to `pilot-data/` (gitignored). |
| 8.4 | P1 | Outcome-tracking schema — readmission, follow-up attendance, ER return | Spec doc; data collection TBD with IRB. |
| 8.5 | P2 | IRB pre-submission package draft for Phase 2 PHI pilot | Aligns with R34 / pilot study timeline. |

### EPIC 9 — Security & governance

| # | P | Ticket | Acceptance |
|---|---|---|---|
| 9.1 | P0 | Disclaimer language reviewed by MaineHealth counsel | Boilerplate present on every screen + output. |
| 9.2 | P0 | CDS exemption analysis at `docs/regulatory/cds-exemption-analysis.md` | Maps tool design to four 21st Century Cures criteria. |
| 9.3 | P0 | Adverse-output reporting — one-click button → exports full audit JSON | Goes to a shared review folder; weekly review meeting scheduled. |
| 9.4 | P1 | Auth gating via MaineHealth SSO or shared secret | Configurable per deployment; Phase 1 can use Netlify auth. |
| 9.5 | P1 | Penetration testing scope doc for Phase 2 | Pre-engagement spec; vendor identified. |
| 9.6 | P2 | BAA inventory and renewal calendar | Living doc in `docs/regulatory/`. |

---

## Appendices

### A. The "why this architecture" cheat sheet

For each major decision, the WHY / TRADEOFFS / RISKS / ALTERNATIVES.

**Decision: Structured Intermediate Representation as the spine**
- **Why:** Collapses hallucination from "everywhere" to "narrative-only," lets you swap LLMs without changing outputs, makes the system testable.
- **Tradeoffs:** More code to maintain (schema, validation), slower to add new output channels (each needs slot design).
- **Risks:** Schema drift; SIR doesn't capture something clinically important and the output silently omits it.
- **Mitigations:** Schema versioning, quarterly clinical review of SIR coverage, fixture-set growth tied to discovered edge cases.
- **Alternatives:** End-to-end LLM generation (rejected — uncontrollable hallucinations); rule-based templates with no LLM (rejected — can't handle free-text inputs).

**Decision: Single-file React 18 UMD inside tools-suite**
- **Why:** Honors your existing convention; zero new infrastructure; ships in minutes.
- **Tradeoffs:** No code-splitting; bundle size matters; harder to share complex components than a build-step setup.
- **Risks:** Single-file constraint chafes at >2,000 lines.
- **Mitigations:** Shared libs under `tools-suite/shared-libs/` already handle this; refactor extraction/matching/templating into them.
- **Alternatives:** Stand up Next.js / Vite app (rejected — breaks deploy parity); use a separate repo (rejected — fractures the ecosystem).

**Decision: Phase 1 deidentified-only, no PHI**
- **Why:** Removes the biggest regulatory blocker for MVP; lets you ship in 30 days; preserves a clean audit story.
- **Tradeoffs:** Clinicians must redact manually (with tool assist) — small friction.
- **Risks:** Imperfect redaction leaks PHI through proxy; clinicians complain about friction.
- **Mitigations:** Robust redaction layer + UI enforcement + server-side regex check; explicit "Phase 1 limitation" labeling.
- **Alternatives:** Go straight to Phase 2 PHI mode (rejected — adds 60–120 days for BAA + IT review); on-prem model only (rejected — quality + maintenance cost too high at MVP).

**Decision: Static deploy, no backend service**
- **Why:** No new infrastructure, no auth build-out, no PHI-at-rest question.
- **Tradeoffs:** No cross-session state; no centralized telemetry; harder multi-user features (snippet sharing).
- **Risks:** Limits eventual ambition.
- **Mitigations:** Plan the server-side path explicitly (Phase 2 ADR); architect with the seam already drawn.
- **Alternatives:** Stand up a service from day one (rejected — premature; you don't yet know what the persistent state model should be).

**Decision: Templates as versioned files, not strings in JS**
- **Why:** PR-reviewable; auditable; lets non-engineers (you) iterate on outputs without touching code.
- **Tradeoffs:** Slight runtime cost to fetch+parse templates; one more thing in the deploy bundle.
- **Risks:** Templates and SIR drift; template references a field SIR doesn't have.
- **Mitigations:** Template linter that validates slot references against current SIR schema; runs in CI.
- **Alternatives:** String literals in source (rejected — no PR review on prose changes; non-engineers can't contribute).

### B. Concrete file structure

```
tools-suite/tools/rc-dx-synth/
├── index.html                     # single-file React UMD tool
├── README.md                      # tool-level overview + usage
├── CHANGELOG.md
├── src/                           # logical organization; bundled into index.html via inline scripts
│   ├── types/
│   │   ├── sir.ts                 # TypeScript source for SIR
│   │   └── sir.schema.json        # Generated JSON Schema
│   ├── extract.js                 # extraction orchestration
│   ├── redact.js                  # redaction layer
│   ├── match.js                   # resource matching (delegates to rc-match)
│   ├── render.js                  # template rendering
│   ├── audit.js                   # event logging + export
│   └── ui/                        # React components (function components only)
├── prompts/
│   ├── extract_sir.md             # versioned, YAML front-matter
│   ├── reextract_field.md
│   ├── narrative_a_epic.md
│   ├── narrative_b_handout.md
│   └── narrative_e_pcp.md
├── templates/
│   ├── channel_a_epic.mustache
│   ├── channel_b_handout.mustache
│   └── channel_e_pcp.mustache
├── qa/
│   ├── harness.js
│   ├── fixtures/
│   │   ├── case_001_adult_low_risk_php.md
│   │   └── ...
│   └── expected/
│       ├── case_001_sir.golden.json
│       └── ...
└── docs/
    ├── adr/
    ├── regulatory/
    └── pilot/
```

### C. Open questions / things to decide

These don't block ticket 1.1 but you'll hit them within 2 weeks:

1. **Model choice for extraction.** Sonnet 4.6 is my default recommendation; Haiku 4.5 for cost-sensitive re-extraction. Test both. The economic argument matters more at scale than at MVP.
2. **Where do templates and prompts get hot-reloaded vs. baked into the deploy?** Hot-reload from same-origin static files is fine for MVP. Don't over-engineer.
3. **State scope for the resource DB at MVP.** Recommend ME-only at launch; expose state selector but only ME data on day one; NH/VT light up as their staging files finalize. Multi-state from day 30+.
4. **Telemetry export format.** JSON is fine for MVP. If you anticipate aggregation across clinicians, design the schema now even if not implemented (so day-1 logs are compatible with day-90 dashboards).
5. **Snippet/preset sharing.** Phase 1 = localStorage only. Phase 2 = consider a shared "preferences" file in the monorepo per clinician — git-backed, no server.
6. **Pilot consent / clinician opt-in language.** Will need MaineHealth IT/Compliance sign-off even for deidentified pilot. Start that conversation now.

### D. Risks I'd lose sleep over (and what to do)

1. **Imperfect redaction in Phase 1.** Most likely path to "we leaked PHI": clinician pastes a note with rare-name patterns the regex misses. *Mitigation:* server-side regex re-check on proxy + UI scroll-confirmation + clinician training.
2. **Resource DB staleness biting at a critical moment.** Clinician sends a patient to a program that closed 6 months ago. *Mitigation:* freshness badges, but also a "verified within last 30 days" filter clinicians can toggle on. Maintenance cadence is the real fix.
3. **LLM produces a plausible-sounding wrong dose.** Already low-probability with verbatim-slot enforcement, but residual. *Mitigation:* pre-publish diff check + clinician trained to verify doses against source on every output. Document this in the disclaimer.
4. **Adoption tail-off after week 2.** Common in clinician tools. *Mitigation:* aggressive in-tool feedback collection; the "what would you change?" question on every session; rapid iteration based on it. Half of all clinical-tool failures are UX failures masquerading as accuracy failures.
5. **Scope creep into a full EHR integration.** Tempting and would be a multi-quarter slowdown. *Mitigation:* explicit ADR that says "Epic copy-paste is the integration model at MVP; FHIR/SMART-on-FHIR is a separate, future project."

### E. What I'd ship to the clinician on day 1 of pilot

A single page. URL bookmarked. The clinician pastes their finished discharge summary text, walks through five screens in 3 minutes, and ends up with three blocks of polished text they paste into Epic. They submit one in-tool feedback rating. Done. The whole experience should feel less like an "AI tool" and more like a faster way to do something they already do.

That's the whole product at MVP. Everything else is layer on top.

---

**End of Architecture & Implementation Blueprint v1.**

Next concrete steps for tomorrow morning:
1. Open `~/Code/reconnect-psychiatry-system/` in Claude Code.
2. Ask Claude Code to act on Ticket 1.1 (canonical resource schema) and Ticket 2.1 (Edge function proxy) in parallel worktrees.
3. By end of week 1, you should have schema + proxy + redaction working and the extraction prompt iterating.

If you want me to go deep on any one section — prompts, templates, schema, the pilot protocol — say which and I'll produce the next-level-of-detail artifact directly. Same goes for converting any of the nine epics into a Claude-Code-executable kickoff brief.
