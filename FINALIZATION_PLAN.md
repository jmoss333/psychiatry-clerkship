# FINALIZATION_PLAN.md — Psychiatry Clerkship Platform

**Author:** Joshua Moss, MD | Psychiatrist
**Date:** 2026-07-02
**Status:** Single, deduplicated finalization plan. This is now the one roadmap of record.

**Supersedes / consolidates** (the five overlapping 2026-07-02 planning docs at repo root):
1. `CLERKSHIP_PLATFORM_AUDIT_BACKLOG_2026-07-02.md` — the 16-issue platform audit (P0/P1/P2 backlog).
2. `MMC-Resident-Platform_MERGED-ROADMAP_2026-07-02.md` — the interleaved sprint plan + locked decisions.
3. `MMC-Resident-Platform_Interactive-Feature-Specs_2026-07-02.md` — the 5-feature simulation spec + shared architecture + LOCAL_POLICY registry.
4. `_PLATFORM_ARCHITECTURE_ClerkshipOS.md` — the ClerkshipOS platformization blueprint (deferred; see §D).
5. `_AUDIT_AND_ROADMAP.md` (2026-06-26) — the original library audit, dedupe ledger, and six-week curriculum.

> The five source docs remain on disk as reference. **Act from this file.** Where the source docs disagree, this plan reflects the **actual filesystem state as verified on 2026-07-02**, not the docs' assertions.

---

## How to read this plan

- **Priority:** **P0** = blocks the live sites being safe to actively hand to students/residents · **P1** = before wide student-facing rollout · **P2** = polish, scale, and post-launch features.
- **Track:** `MS3` (une-ms3-psychiatry) · `Res` (mmc-psychiatry-residents-sanford) · `Both`.
- **Effort:** `S` <1 day · `M` 1–3 days · `L` 1–2 weeks.
- **Status legend:** ✅ done · 🟡 partial (built but not wired/complete) · ⬜ open · 🔒 decided/deferred.

**Deploy reality check (from `GIT_AND_DEPLOY_PLAN.md`):** both sites are **already live** on Netlify build-on-push. So "going live" here means *safe to actively share*, and the P0 bar is **governance + safety + integrity gates**, not "does it deploy."

---

## Reconciliation: what the cross-check found already done

Auditing the docs against the repo collapsed the apparent backlog. Verified **already built and deployed** (evidence in parentheses):

| Item the docs list as "to build" | Actual state | Evidence |
|---|---|---|
| Sprint-0 shared tool shell (`_TEMPLATE.html`) | ✅ built | `_prototypes/agitation-trainer/_TEMPLATE.html` |
| Static QA harness (`check-static-site.mjs`) | 🟡 built, not wired | `_prototypes/_tooling/check-static-site.mjs` (not at `scripts/`, not in build/CI) |
| Feature 1 — Agitation PRN Trainer | ✅ built + deployed, refit + local React done | `mmc-resident-deploy/tools/rp-agitation.html` + `.pack.json`; built by `resident_section.py` |
| Feature 4 slot — Canon Quiz Bank (200-paper) | ✅ built + deployed | `mmc-resident-deploy/tools/rp-canon-quiz.html` |
| Brief Psychotherapy Coach ("Five Good Minutes") | ✅ built + deployed | `mmc-resident-deploy/tools/rp-brief-psych.html` + `.pack.json` |
| Orientation Video (captions + transcript) | ✅ built + deployed | `orientation-video.html`, `.vtt`, `transcript.md` in `_prototypes/orientation-video/` |
| "Vendor React locally, no CDN" refit | ✅ appears done for `rp-*` tools | `rp-*` tools reference no CDN; `mmc-resident-deploy/vendor/` present |
| MS3 content gaps (MSE, capacity, oral, DDx, psychopharm primer, etc. from `_AUDIT_AND_ROADMAP.md` §4) | ✅ largely complete | 56 md pages + 16 tools live; recon confirmed the six flagship tools |
| Deploy config portability (Audit #12) | 🟡 mostly resolved | `netlify.toml` now minimal + build-on-push; residual = `_headers` CSP `unsafe-inline` |

**Consequence:** the remaining go-live work is **attestation, safety tagging, metadata coverage, and a11y/QA wiring** — a finishing job, not a feature build.

## Locked decisions (carry forward — do not relitigate)

From `MERGED-ROADMAP` §4 + addendum:
- **Platform = hybrid/bridge.** Ship on the hardened static shell; **do not migrate to ClerkshipOS now.** Revisit only when Audit Issues 1–5 are done *and* a second real tenant exists. (Audit Issue 7 → **decided/deferred.**)
- **One hub + "Residency" track** is the eventual target (not a separate resident deploy). *Current state still ships two separate deploys via `resident_section.py` — the merge is deferred, not done (§C-2).*
- **EPA/Milestones (F4)** and **PD Team Formulation (F5)** are **held as attested v2 modules** — EPA can duplicate the GME system of record and needs governance answers first. (§D)
- **Every new tool is built from `_TEMPLATE.html`** with stable `tokenId`s + separate JSON packs, so a future migration is mechanical.

---

## P0 — Blocks safe go-live (attestation, safety, integrity)

| ID | Item | Track | Effort | Status | Concrete files |
|---|---|---|---|---|---|
| **P0-1** | **Faculty attestation of high-risk clinical/legal/formulary content + add `risk` field to the review schema.** Convert `reviewed.json` from passive display to a publish gate; high-risk unreviewed → visible "Draft — pending faculty review" watermark. (Audit #2 · Merged Sprint 0) | Both | M | ⬜ open — `reviewed.json` has `{status,at,by}` but **no `risk` field**; 23/72 nav items reviewed | `13_Faculty_Resources/reviewed.json`; `topic_meta.json`; `13_Faculty_Resources/review-attest.html`; SPA watermark in `13_Faculty_Resources/_automation/site_build/spa_index.html` |
| **P0-2** | **Faculty attestation of the four shipped resident tools + fill their `LOCAL_POLICY` tokens.** Agitation pack has **8** tokens (formulary, restraint policy, monitoring cadence, QTc action, escalation activation, setting scope, faculty email); brief-psych + canon-quiz packs similar. Nothing enters `reviewed.json` until attested; tools ship watermarked until then. (Merged §6 · Spec §9) | Res | S | ⬜ open (faculty gate) | `_prototypes/agitation-trainer/rp-agitation.pack.json`; `_prototypes/brief-psych/rp-brief-psych.pack.json`; `_prototypes/canon-quiz/*`; `13_Faculty_Resources/reviewed.json` |
| **P0-3** | **Wire the static QA harness into the build + document a run command.** Script exists but is orphaned. Move `check-static-site.mjs` to a canonical `scripts/` (or `_automation/site_build/`), run it against `_build/ms3` and `_build/res`, and fail the build on: missing nav/search targets, orphans, broken local links, metadata + review coverage, **dose-literal grep**, `cw_`/`rp_`-only storage. (Audit #1 · Merged Sprint 0 · Spec DoD) | Both | S–M | 🟡 built, not wired — `_prototypes/_tooling/check-static-site.mjs` | `_prototypes/_tooling/check-static-site.mjs` → `scripts/check-static-site.mjs`; `13_Faculty_Resources/_automation/site_build/build_deploy.py`; `netlify.toml` |
| **P0-4** | **Tag & separate local policy from universal teaching on MS3 content.** The high-risk pages that assert MMC/MaineHealth/Sanford protocol, order-set, restraint, legal, or EHR specifics must carry a `localPolicy: true` badge and point to live institutional policy for exact orders/doses — no invented local policy. (Audit #4 · Spec §2.2 LOCAL_POLICY) | MS3 | M | ⬜ open | `content/protocol_library.md`; `content/ethics_legal.md`; `content/pg_suicide.md`; `content/evidence_inpatient.md`; `content/rounds_questions.md`; `tools/violence.html`; `tools/withdrawal.html` |
| **P0-5** | **Mobile/bedside a11y quick wins on the shared shell.** Verified still open in `spa_index.html`: **search input has no `aria-label`** (placeholder only); normalize sub-44px tap targets; stop the floating tool dock overlapping content on mobile; move focus into the open drawer + trap, restore on close (closed-state `inert` already correct). Smoke-clean at 390×844 and 1280×720. (Audit #3 · Merged Sprint 0) | Both | S | 🟡 partial — closed-drawer `inert` ✅; search label + open-drawer focus ⬜ | `13_Faculty_Resources/_automation/site_build/spa_index.html`; `tools/*.html` (target sizes) |

---

## P1 — Before wide student/resident rollout (coverage & quality)

| ID | Item | Track | Effort | Status | Concrete files |
|---|---|---|---|---|---|
| **P1-1** | **Complete structured metadata coverage.** Source `topic_meta.json` covers only **10/56** pages (the audit's "17/56" measured the *stale* legacy `clerkship-hub-deploy`; the live `_build/ms3` ships 10). Extend to every learner-facing page: title, audience, section, read time, review risk, attestation state, tags, high-yield summary. Drive search/home from metadata, not hardcoded lists. (Audit #5) | Both | M–L | ⬜ open (10/56) | `topic_meta.json`; `content/*.md`; `nav.json` |
| **P1-2** | **Direct browser smoke tests for high-risk tools.** Open MSE, C-SSRS, withdrawal, BFCRS, capacity, violence, decision-aids under both direct and iframe routes; assert loads, no console errors, no 390px overflow, accessible names, state updates. (Audit #8) | Both | M | ⬜ open | `tools/*.html`; new Playwright/browser-smoke script under `scripts/` |
| **P1-3** | **Attest & ship the Orientation Video.** Built with `.vtt` captions + `transcript.md`; blocked only on Josh attesting the narration, then add to `reviewed.json`. (Merged addendum) | Res | S | 🟡 built, awaiting attestation | `_prototypes/orientation-video/*`; `13_Faculty_Resources/reviewed.json` |
| **P1-4** | **Normalize the tool registry + shared shell across the existing MS3 tools.** `_TEMPLATE.html` exists; retrofit the older single-file tools to the shared disclaimer/theme/storage/review-state primitives so the parent shell and direct tool pages show consistent disclaimers + review state. (Audit #9 · Spec §2) | Both | M–L | 🟡 template built; retrofit ⬜ | `_prototypes/agitation-trainer/_TEMPLATE.html`; `tools/*.html`; `nav.json`; `reviewed.json` |
| **P1-5** | **Markdown sanitization before broad authoring.** `spa_index.html` renders `marked.parse()` into `innerHTML` with no DOMPurify (verified: 0 sanitize calls). Safe only while authors are trusted — add sanitization (or constrained MDX) before non-technical faculty/admins can add content. (Audit #6) | Both | M | ⬜ open | `spa_index.html`; `marked.min.js`; content-tooling |
| **P1-6** | **Media accessibility manifest.** Give each audio/video item title, source, duration, topic tags, audience, review status, transcript/caption status, license; expose transcripts on learner pages; CI reports missing transcripts for published media. (Audit #11) | Both | M | ⬜ open | `audio/`, `audio_oe/`, `12_Media/`; `content/podcast_library.md`; new media manifest |
| **P1-7** | **Role-aware navigation & search.** Add MS3 / PGY-1 cross-cover / faculty entry points and facets ("bedside now", "shelf", "cross-cover", "faculty teaching") without forking content. (Audit #10) | Both | M | ⬜ open | `nav.json`; `search-index.json`; `topic_meta.json`; `spa_index.html` |

---

## P2 — Polish, scale, and post-launch features

| ID | Item | Track | Effort | Status | Concrete files / notes |
|---|---|---|---|---|---|
| **P2-1** | Feature 2 — **Night Float Survival Coach** (MVP). Reuses `_TEMPLATE.html`; content from withdrawal/delirium/C-L/legal reviews; escalation = `LOCAL_POLICY`. (Spec §4) | Res | M | ⬜ not started | new `tools/rp-night-float.html` + pack |
| **P2-2** | Feature 3 — **Family Meeting Simulator** (MVP). Biggest new build (branching turn engine); engine reused by future coaches. (Spec §5) | Res | L | ⬜ not started | new `tools/rp-family-sim.html` + pack |
| **P2-3** | **Faculty teaching workflow / dashboard** — today's teaching options, cases, questions, review queue, recently-changed high-risk pages; auditable attestation. (Audit #15) | Res→Both | L | ⬜ open | `13_Faculty_Resources/`; `tools/review-attest.html` |
| **P2-4** | **Externalize inline JS/CSS; drop CSP `unsafe-inline`.** `netlify.toml` portability already largely resolved; residual security debt is the inline-app CSP in `_headers`. (Audit #12) | Both | M | 🟡 config portable; CSP ⬜ | `_headers`; `spa_index.html` |
| **P2-5** | **Source hygiene / dedupe** from `_AUDIT_AND_ROADMAP.md` §3: canonicalize Landmark library (fix the 15-vs-16-paper count), collapse ~12 family-therapy decks → 1 canonical + archive, RSSM v11-only, Teaching Manual v2-only, archive `Raw_Records`. | n/a (source) | M | ⬜ open | `07_Evidence_and_Reading/`, `06_Family_and_Relational/`, `99_Archive/` |
| **P2-6** | **Privacy-safe progress export/analytics.** Keep `localStorage` PHI-free; add optional export/import; aggregate opt-in only; document FERPA implications before any accounts. (Audit #16) | Both | M–L | ⬜ open | `spa_index.html`; `tools/review.html`; `tools/learning-path.html` |
| **P2-7** | **One-hub + Residency-track merge.** Fold the resident build into the shared hub as a Residency nav section (`rp_*` storage isolated from `cw_*`) instead of a separate deploy. Enables MS3↔resident cross-reference; aligns with the ClerkshipOS multi-tenant path. (Merged addendum) | Both | M–L | 🔒 decided, deferred | `resident_section.py`; `nav.json`; `spa_index.html` |

---

## D. Deferred / resolved by decision (not open work)

- **ClerkshipOS migration (Audit #7)** — 🔒 **decided: hybrid/bridge, do not migrate now.** The monorepo lives at `/Users/jm/clerkshipos` (separate git repo; builds/tests/validate pass per the audit). Revisit at end of resident Sprint 3, only when Audit Issues 1–5 are done AND a second tenant is real. Its internal issues (#13 web-build CI, #14 generated-TS-content scrub) are **out of scope for this repo** until that trigger.
- **EPA/Milestones (Feature 4)** and **PD Team Formulation (Feature 5)** — 🔒 **held as v2 modules.** EPA needs governance answers (avoid duplicating the GME system of record); PD folds into the Family Sim as a case type. (Spec §6–7 · Merged addendum)
- **Honorable-mention Discharge Planning Pathway** — deferred; content overlaps `exp_family.md`; revisit once the entrustment model exists. (Spec §1.3)

## Guardrails (carry into every item)

- **Not a clinical decision-support device.** Trainers grade reasoning/hazard-avoidance; they never emit orders. **No dose literals** in any tool or pack — CI-enforced via the P0-3 grep.
- **No invented local policy.** Every institution-specific fact is a `LOCAL_POLICY` token, `value:null` until faculty fills it; renders as a visible "⚠ Confirm locally" chip.
- **No PHI.** Fictional composites only; `localStorage` is `cw_`- (MS3) / `rp_`- (resident) prefixed and PHI-free.
- **Attestation before publish.** High-risk clinical/legal/formulary content ships watermarked "Draft — pending faculty review" until it is in `reviewed.json`.

---

## The P0 list — do these before actively sharing the live sites

1. **P0-1 — Attestation publish-gate + `risk` field** (`reviewed.json`, `topic_meta.json`, `review-attest.html`, `spa_index.html`). *Both · M.* High-risk unreviewed content shows a "Draft — pending faculty review" watermark; 23/72 reviewed today, no risk tiering yet.
2. **P0-2 — Faculty attest the 4 shipped resident tools + fill their `LOCAL_POLICY` tokens** (`rp-agitation.pack.json` [8 tokens], `rp-brief-psych.pack.json`, `rp-canon-quiz`, `reviewed.json`). *Res · S.* Faculty gate — the tools are built and deployed but must not lose the "Draft" watermark until attested.
3. **P0-3 — Wire the static QA harness into the build + fail on violations** (move `_prototypes/_tooling/check-static-site.mjs` → `scripts/`, call from `build_deploy.py`). *Both · S–M.* Includes dose-literal grep + storage-prefix check.
4. **P0-4 — Tag local-policy vs. universal teaching on the high-risk MS3 pages** (`protocol_library.md`, `ethics_legal.md`, `pg_suicide.md`, `evidence_inpatient.md`, `rounds_questions.md`, `violence.html`, `withdrawal.html`). *MS3 · M.* Point to live institutional policy for exact orders/doses.
5. **P0-5 — Mobile/bedside a11y quick wins** (`spa_index.html`, `tools/*.html`): label the search input (`aria-label`), ≥44px targets, fix mobile tool-dock overlap, open-drawer focus trap/restore. *Both · S.*

*Joshua Moss, MD | Psychiatrist*
