# MMC Sanford Psychiatry — Resident Platform: Merged Roadmap

**Author:** Joshua Moss, MD | Psychiatrist
**Date:** 2026-07-02
**Reconciles:** (a) the 5-feature interactive spec (`MMC-Resident-Platform_Interactive-Feature-Specs_2026-07-02.md`), (b) today's platform audit (`CLERKSHIP_PLATFORM_AUDIT_BACKLOG_2026-07-02.md`), and (c) the live guideline-surveillance process (`Guideline_Surveillance_Delta_2026-07-01.md`).
**Locked decisions (2026-07-02):** Platform target = **Hybrid / bridge**. Sequencing = **Interleave** (foundation + first feature together). Build all four session deliverables (done — see §5).

---

## 1. The one-paragraph situation

Three workstreams are live at once and were previously uncoordinated: **(A) Platform hardening** (today's audit — the static site is a hand-assembled monolith with attestation/metadata/a11y gaps), **(B) New features** (the 5-feature spec — agitation, night float, family sim, EPA/milestones, PD formulation), and **(C) Content + evidence** (a large OpenEvidence review corpus that feeds the features, plus a mature guideline-surveillance pipeline). The locked decision is to **interleave A and B on a shared, migration-ready foundation** and run **C in parallel** as the content supply line. This doc is the single sequenced plan.

## 2. Convergence: the audit independently validated the spec

Two of the spec's core primitives are the same as two of the audit's P0/P1 issues. Build once, satisfy both.

| Spec primitive (§2 of feature spec) | Audit issue | Merged action |
|---|---|---|
| Shared tool shell (`_TEMPLATE.html`, primitives) | **Issue 9** — normalize tool registry + shared shell | One artifact (built this session). |
| `LOCAL_POLICY` placeholder tokens + `LocalChip` | **Issue 4** — separate local policy from universal teaching | Tokens ARE the separation mechanism. |
| Disclaimer component (teaching/safety/simulation) | Issue 2 — attestation/publish state | Disclaimer + `reviewed.json` watermark = the visible gate. |
| Evidence governance + "flag" hook (§2.4) | Issue 2 + existing surveillance pipeline | Flag hook **feeds the existing `clinician-guidelines.html` `DATA[]` surveillance process** — do not build a parallel one. |
| Pack loader + `[RC-META]` extension (`reviewCadenceDays`, `evidenceThrough`) | Issue 5 — metadata coverage; Issue 1 — static QA | `[RC-META]` + pack envelope are the metadata source the QA harness checks. |

**Implication:** the spec and the audit are not competing backlogs. Sprint 0 below delivers the intersection.

## 3. The interleaved sequence

Effort key: S <1 day · M 1–3 days · L 1–2 weeks. "Codex" = buildable now from specs; "Faculty" = requires your attestation/localization; "Decision" = needs your call.

### Sprint 0 — Foundation (do first; unblocks everything) — **partially done this session**
| Item | Source | Owner | Effort | Status |
|---|---|---|---|---|
| Shared tool shell `_TEMPLATE.html` + primitives (LocalChip, Disclaimer, FlagButton, pack loader) | Spec §2 / Audit #9 | Codex | M | ✅ built (`_prototypes/agitation-trainer/_TEMPLATE.html`) |
| `LOCAL_POLICY` token convention + registry | Spec §2.2 / Audit #4 | Codex | S | ✅ pattern shipped; registry in spec §9 |
| Static QA harness (`scripts/check-static-site.mjs`): JSON valid, nav/search targets exist, orphans, metadata + review coverage, **dose-literal grep**, cw_-only storage | Audit #1 (+ spec DoD) | Codex | S–M | ⬜ next |
| Attestation publish-gate: `reviewed.json` schema + `risk` field; high-risk unreviewed → visible "Draft" watermark | Audit #2 | Codex + Faculty | M | ⬜ next |
| Mobile/a11y quick wins on the shell (search label, 44px targets, drawer focus) | Audit #3 | Codex | S | ⬜ next |

### Sprint 1 — Feature 1 pilot (proves the hardened, gated pattern)
| Item | Owner | Effort | Status |
|---|---|---|---|
| `agitation.pack.json` from OpenEvidence reviews (class-level, LOCAL_POLICY tokens, real citations) | Codex/you | M | ✅ built (7 scenarios, verified) |
| `agitation-trainer.html` (Guided + Reference map + Challenge; de-escalation gate; hazard verdicts; trace) | Codex | M | ✅ prototype built + verified |
| Faculty attestation of the agitation pack + fill its 8 LOCAL_POLICY tokens | **Faculty** | S | ⬜ **your gate before deploy** |
| Wire into `nav.json`; add to `reviewed.json` after attestation | Codex | S | ⬜ |

### Sprint 2 — Feature 2 (Night Float Coach)
Reuses shell + cross-links to Feature 1. Content from Alcohol Withdrawal, Delirium, C-L, and Legal/Ethical reviews (staging). Escalation layer = LOCAL_POLICY. Effort M.

### Sprint 3 — Feature 4 (EPA/Milestones)
Provides the EPA-log endpoint that Features 3 & 5 write to → build before them. **Content source already in hand:** the "Competency-Based Med Ed + EPA-Based Assessment Implementation Toolkit" review answers the open EPA-list/milestone-version question. Ship EPA set as a labeled teaching default (LOCAL_POLICY: `epa.program_epa_list`, `epa.milestone_version`). Effort M.

### Sprint 4 — Feature 3 (Family Meeting Simulator)
Biggest new build (turn engine). Content from "Integrating Structured Family Meetings into Residency Training" + Family Involvement reviews. Engine is reused later for the deferred Brief Psychotherapy Coach. Effort L.

### Sprint 5 — Feature 5 (PD Team Formulation)
Content from the Borderline/Severe Personality Pathology review. Reuses Family Sim patterns + EPA hook. Effort M–L.

### Sprint 6+ — v2 passes + audit P1/P2 + honorable mentions
Role-aware nav (#10), tool registry (#9 full), media accessibility manifest (#11), Discharge Pathway + Brief Psychotherapy Coach (spec honorable mentions), coach dashboard for EPA (v2).

## 4. The ClerkshipOS decision (Audit Issue 7) — resolved by "hybrid/bridge"

You are **not** migrating now, and **not** committing to more permanent single-file islands. The bridge:

- **Every new tool is built from `_TEMPLATE.html`** with **stable `tokenId`s** and content in **separate JSON packs**. This is deliberately shaped so migration is mechanical, not a rewrite.
- **Mapping when you do migrate:** each `LOCAL_POLICY` token → a ClerkshipOS **tenant-local overlay** node (institution layer); each pack `content` → a **content node**; disclaimer intensity + `reviewed.json` → schema fields (`risk`, `localPolicy`, `lastReviewed`, `verification`) that ClerkshipOS's engine already models (inherit/override/extend/hide/pin/local + provenance, 16 passing tests per the audit).
- **Trigger to flip to ClerkshipOS as production:** when audit Issues 1–5 are done AND a second audience/tenant (residents *and* MS3s, or a second hospital) is real. Until then, ship on the hardened static shell. Revisit at the end of Sprint 3.

## 5. What shipped this session

Prototype bundle in `Psychiatry-Clerkship-Library/_prototypes/agitation-trainer/` (the library is content/staging, not a deploy root — correct home for unattested prototypes):

| File | What it is |
|---|---|
| `_TEMPLATE.html` | Sprint-0 shared shell + primitives; the copy-me base for Features 2–5. |
| `agitation.pack.json` | Feature 1 content pack: 7 scenarios, 8 LOCAL_POLICY tokens, 11 real citations, incorporation checklist. **Zero dose literals** (verified). |
| `agitation-trainer.html` | Working Feature 1 prototype: Guided / Challenge / Reference-map, de-escalation gate, etiology→hazard verdict logic, decision trace, dark mode, keyboard, flag hook. |

**Verified:** JS syntax OK (both files) · zero dose literals · only `cw_`-prefixed storage · 10/10 clinical-safety verdict assertions pass (e.g., benzo+delirium→hazard, D2-blocker+Parkinson→hazard, benzo+withdrawal→good, SGA+older-delirium→black-box caution) · loads over HTTP with pack.

**Production path (after your attestation):** move the three files to `mmc-resident-deploy/tools/`, rename pack fetch path, add `nav.json` entry, add to `reviewed.json`.

## 6. Immediate next actions

1. **You (Faculty), ~30 min, blocking deploy:** review the agitation pack's teaching claims and fill its 8 `LOCAL_POLICY` tokens (formulary, restraint policy, monitoring cadence, QTc action, escalation activation, setting scope, faculty-feedback email). Do the same one-pass fill for the full registry in feature-spec §9. Nothing goes into `reviewed.json` until you attest.
2. **Codex, Sprint 0 remainder:** build the static QA harness (incl. the dose-literal + `cw_`-storage checks used this session) and the attestation gate; apply the mobile/a11y quick wins.
3. **Codex, content pipeline:** run the incorporation checklist on the remaining OpenEvidence reviews (they're staging/unattested) to pre-stage packs for Features 2–5.
4. **Wire the flag hook to the existing surveillance process**, not a new one — flags land as candidate `DATA[]` deltas for `clinician-guidelines.html`.

## 7. Guardrails (carry into every sprint)

- **Not a clinical decision-support device** — trainers grade reasoning/hazard-avoidance, never emit orders. No dose literals in any tool or pack (CI-enforced).
- **No invented local policy** — every institution-specific fact is a `LOCAL_POLICY` token, `value:null` until faculty fills it; renders as a visible "⚠ Confirm locally" chip.
- **No PHI** — fictional composites only; `localStorage` is `cw_`-prefixed and PHI-free; EPA schema has no field that can hold a patient identifier.
- **Attestation before publish** — high-risk clinical/legal/formulary content ships watermarked "Draft — pending faculty review" until it's in `reviewed.json`.

---

## Addendum — decisions locked 2026-07-02 (after reviewing the "Claude design" handoff + orientation video)

A parallel **Claude-design handoff** (`design_handoff_resident_platform_tools/`) was reviewed and found to independently converge on this same architecture and conventions. It is now the **authoritative target spec**; the prototype + shell + QA harness built here are F1's MVP + shared infrastructure. Full analysis: `Design-Plan-Alignment-and-Video_2026-07-02.md`.

**Locked decisions:**
1. **One hub + "Residency" track** (not a separate resident deploy). Build the resident tools into the shared hub as a new Residency nav section; `rp_*`-namespaced storage that never touches `cw_*`. Matches the ClerkshipOS multi-tenant path; enables MS3 ↔ resident cross-reference.
2. **Feature slots 4–5 = Canon Quiz Bank (surface existing `quizzes.json`) + Brief Psychotherapy Coach.** The EPA/Milestones and PD Team Formulation tools built earlier are **held as attested v2 modules** (PD folds into Family Sim as a case type). Rationale: EPA can duplicate the GME system of record and needs governance answers first; quiz-surfacing is the cheapest high-certainty win.
3. **Orientation video approved** — captions + transcript + accessible player built (`_prototypes/orientation-video/`); ships once Josh attests the narration.

**Refits owed to the agitation prototype before ship (from the design handoff):**
- **Vendor React locally** — no CDN at runtime (ward wifi blanks CDN-dependent pages). *Highest priority; also a general rule for all tools.*
- Rename to `rp-agitation.html` / `rp-agitation-scenarios.json`; use `rp_*` storage keys.
- Add the least-restrictive **ladder rail** visual + a **"Call your senior" always-correct** option.
- Wire wrong-turn tags into the existing `cw_srs_v1` spaced-repetition store; add restraint-equity teaching to a debrief.
- Defer the richer consequence-engine + hard-stops to F1 v2.

**Revised near-term sequence:** Sprint 0 (shared shell + QA gate, +local-bundling) → F1 Agitation refit + attest → F4 Quiz-Bank surfacing (fast win) → F2 Night Float → F5 Brief-Psych → F3 Family Sim (EPA/PD slot in as v2).

*Joshua Moss, MD | Psychiatrist*
