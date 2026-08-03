# FINALIZATION_PLAN.md — Psychiatry Clerkship Platform (MS3 + Resident)

**Author:** Joshua Moss, MD | Psychiatrist
**Date:** 2026-07-02 (reconciled second pass — see Revision note)
**Status:** Single, deduplicated finalization plan. **This is the one roadmap of record — act from this file.**

**Supersedes / consolidates** (the five overlapping 2026-07-02 planning docs at repo root):
1. `CLERKSHIP_PLATFORM_AUDIT_BACKLOG_2026-07-02.md` — the 16-issue platform audit (P0/P1/P2 backlog).
2. `MMC-Resident-Platform_MERGED-ROADMAP_2026-07-02.md` — the interleaved sprint plan + locked decisions.
3. `MMC-Resident-Platform_Interactive-Feature-Specs_2026-07-02.md` — the 5-feature simulation spec + shared architecture + LOCAL_POLICY registry.
4. `_PLATFORM_ARCHITECTURE_ClerkshipOS.md` — the ClerkshipOS platformization blueprint (deferred; see §D).
5. `_AUDIT_AND_ROADMAP.md` (2026-06-26) — the original library audit, dedupe ledger, and six-week curriculum.

Also cross-checked: `Design-Plan-Alignment-and-Video_2026-07-02.md`, `GIT_AND_DEPLOY_PLAN.md`, `STATUS_LATEST.md`, `MASTER_attestation_ledger_2026-07-01.md`.

> **Revision note (2026-07-02, second pass):** two parallel sessions consolidated this plan the same evening — one deploy driver at a time, per the standing guardrail. This version reconciles both and corrects the first pass against a **live-site check**: the first pass stated "56 md pages + 16 tools live," but the live MS3 `nav.json` shows the git cutover **already dropped 10 pages from production** (see P0-1). Where the source docs or the first pass disagree with the filesystem/live sites, this plan reflects the **verified state as of 2026-07-02** (repo @ `4619b5e`, fresh `_build/ms3` build + QA-harness run, live `nav.json` fetch on both sites).

---

## How to read this plan

- **P0 — blocks going live.** Live-site regressions, high-risk content already published without attestation, and the missing publish gate. Both sites are already live on build-on-push, so P0 = "the live sites are wrong or unsafe *today*."
- **P1 — before sharing with students/residents.** Accuracy sign-offs, governance coverage, accessibility.
- **P2 — polish, scale, post-launch features.**
- **§D — deferred by decision or trigger.** Not open work.
- Track: `MS3` (une-ms3-psychiatry) · `Res` (mmc-psychiatry-residents-sanford) · `Both` (shared source/shell).
- Effort: `S` <1 day · `M` 1–3 days · `L` 1–2 wk. Owner: **Codex** = buildable now · **Faculty** = needs Dr. Moss.
- Status: ✅ done · 🟡 partial · ⬜ open · 🔒 decided/deferred.
- Verification (no tests/lint exist): `OUT_DIR=_build/ms3 python3 13_Faculty_Resources/_automation/site_build/build_deploy.py` then `node _prototypes/_tooling/check-static-site.mjs _build/ms3`. Baseline 2026-07-02: build OK (46 md pages, 15 tools, 62 search docs); harness PASS (hard:0, soft:84).

---

## Reconciliation — what the cross-check found already done (do not redo)

| Item the docs list as "to build" | Actual state | Evidence |
|---|---|---|
| "Library is not a git repo"; no build pipeline; absolute Netlify paths (Audit #1/#12 partial) | ✅ done/stale — private repo `jmoss333/psychiatry-clerkship`; build-on-push live + verified both sites; portable `netlify.toml` + build-ignore hook; audio on Git LFS (100 files) | `GIT_AND_DEPLOY_PLAN.md` §Status |
| Sprint-0 shared tool shell (`_TEMPLATE.html`) | ✅ built | `_prototypes/agitation-trainer/_TEMPLATE.html` |
| Static QA harness | 🟡 built, **not wired into CI** → P0-3 | `_prototypes/_tooling/check-static-site.mjs`; run passes |
| F1 Agitation Trainer + all design-handoff refits (vendored React — no CDN, `rp_*` keys, ladder rail, "Call your senior") | ✅ built + **live on resident site** (unattested → P0-2) | `_prototypes/agitation-trainer/rp-agitation.html`; `resident_section.py` PROTO_TOOLS |
| F4 slot Canon Quiz Bank · F5 slot Brief-Psych Coach (locked slots) | ✅ built + **live on resident site** (unattested → P0-2) | `rp-canon-quiz.html`, `rp-brief-psych.html` |
| Orientation video gates (captions + transcript + accessible player) | 🟡 built (`.vtt`, synced transcript, chapters) + **live**; narration attestation open → P0-2 | `_prototypes/orientation-video/`; RC-META `draft-pending-attestation` |
| "EPA/Milestones and PD Formulation built earlier, held as attested v2 modules" (roadmap addendum) | ❌ **inaccurate — spec-only, never built** (repo-wide search: no EPA/PD/night-float tool exists). Correct status: designed (spec §6–7), deferred by locked decision → §D | repo-wide `find` |
| MS3 content gaps from `_AUDIT_AND_ROADMAP.md` §4 (MSE, capacity, oral, DDx, psychopharm primer, shelf, OSCE, cases, weeks 1–6…) | ✅ largely complete as pages/tools — **but 10 pages exist only in the stale deploy artifact, not in source** → P0-1 | build `md[]`; `_FILL_MAP.md` |
| Attestation waves | ✅ 23 items reviewed (8 core-topic pages + eating disorders + 5 factual corrections incl. Miklowitz P0, 2026-07-01) | `13_Faculty_Resources/reviewed.json` |
| `STATUS_LATEST.md` deploy gates | Gates 1–2 (LFS, site-linking) ✅ done; **gate 3 (page reconciliation) was skipped and has now bitten** → P0-1; doc itself stale → P1-7 | commits `1b1bf51`…`4619b5e` |

**Consequence:** apart from P0-1 (a live regression), the remaining go-live work is **attestation, safety tagging, metadata coverage, and QA/a11y wiring** — a finishing job, not a feature build.

## Locked decisions (carry forward — do not relitigate)

- **Platform = hybrid/bridge.** Ship on the hardened static shell; **do not migrate to ClerkshipOS now** (Audit #7 → 🔒 decided). Revisit only when Audit Issues 1–5 are done **and** a second real tenant/audience exists (per merged-roadmap §4, reassess after Night Float ships).
- **One hub + "Residency" track is the eventual target.** Current state ships **two sites derived from one source** (`resident_section.py` derives the resident build from the MS3 build) — the drift problem is solved; the physical merge is deferred, not done (→ P2-13).
- **Feature slots 4–5 = Canon Quiz Bank + Brief Psychotherapy Coach** (both now shipped). **EPA/Milestones and PD Formulation are deferred v2 modules** pending GME-governance answers (→ §D).
- **Every new tool is built from `_TEMPLATE.html`** with stable `tokenId`s + separate JSON packs, so a future migration stays mechanical.

---

## P0 — Blocks going live (the live sites are wrong or unsafe today)

| ID | Item | Track | Owner | Effort | Status |
|---|---|---|---|---|---|
| **P0-1** | **Restore the 10 pages the git cutover dropped from the LIVE MS3 site.** Old hand-assembled deploy: 56 pages; git build: 46. Confirmed missing from live `nav.json` right now: `t_sleep, t_somatic, ect_neuromodulation, cultural_psychiatry, ethics_legal, t_adjustment, t_dissociative, t_impulse, t_neurocog, t_sexual`. Their **only copies** live in the untracked `~/clerkship-hub-deploy/content/` (one `rm -rf` from lost). Copy into the proper source folders; add to `build_deploy.py` `md[]` + nav; salvage matching `topic_meta` entries from the deploy copy; diff deploy dirs vs `_build/*` for any other artifact-only files. AI-drafted by a parallel session → do **not** add to `reviewed.json`. | Both | Codex | M | ⬜ **live regression** |
| **P0-2** | **Faculty attestation of the four resident tools + orientation video that are ALREADY LIVE, + fill their `LOCAL_POLICY` tokens.** `rp-agitation` (all **8** tokens `value:null`), `rp-canon-quiz`, `rp-brief-psych`, and the AI-narrated orientation video ship on the resident site with no `reviewed.json` entry. Faculty (~45 min): watch video once + attest; review agitation pack claims; fill the 8 tokens (formulary, restraint policy, monitoring cadence, QTc action, escalation activation, setting scope, feedback email); spot-check quiz + brief-psych. Codex: confirm each shows a **learner-visible** "Draft — pending faculty review" state until attested (RC-META alone isn't visible); wire attested items into the resident review state. | Res | Faculty + Codex | S | ⬜ faculty gate |
| **P0-3** | **Wire the QA harness into the deploy pipeline as a publish gate.** Deploys are automatic on push but nothing runs the harness — a bad push goes straight to production. Move `check-static-site.mjs` from `_prototypes/_tooling/` to `13_Faculty_Resources/_automation/site_build/`; chain into both sites' Netlify build commands against `_build/ms3` / `_build/res`; hard failures (missing nav/search targets, dose literals, non-`cw_`/`rp_` storage, broken packs) fail the deploy; soft findings stay advisory until P1-2. | Both | Codex | S–M | 🟡 built, not wired |

---

## P1 — Before sharing with students/residents

| ID | Item | Track | Owner | Effort | Status |
|---|---|---|---|---|---|
| **P1-1** | **Clinical sign-off: attestation-ledger Blocks 3 & 6** (all on live pages): perinatal teratogenicity/lactation numbers; catatonia lorazepam dosing; **metabolic-monitoring mismatch** (`nutrition_metabolic.md` vs rounds Q13); **CIWA-Ar band mismatch** (withdrawal tool vs Q46 — the site currently teaches two different cutoffs); evidence-page IV-route clause; §8 false-precision citation cluster. Files: `MASTER_attestation_ledger_2026-07-01.md` + the named pages/tools. | Both | Faculty | S–M | ⬜ |
| **P1-2** | **Attestation publish gate with `risk` field** (Audit #2). `reviewed.json` has `{status,at,by}` but no risk tiering; 23 of 62+ nav items reviewed. Add schema (reviewer/date/scope + `risk: clinical|legal|formulary|local-policy|general`); high-risk unreviewed → per-page watermark (the global banner isn't enough); harness STRICT reports (later fails) high-risk-unreviewed in CI. Files: `13_Faculty_Resources/reviewed.json`, `spa_index.html`, harness, `topic_meta.json`, `review-attest.html`. | Both | Codex M + Faculty S | M | ⬜ |
| **P1-3** | **Mobile/bedside a11y quick wins** (Audit #3), verified still open in the shared shell: search input has **no label/`aria-label`** (`spa_index.html:254`, placeholder only); sub-44 px targets; floating tool dock can cover mobile content (add bottom padding when mounted); move/trap/restore focus for the open drawer (closed-state `inert` already ✅). Smoke at 390×844 + 1280×720, no console errors. Files: `spa_index.html`; `tools/*.html` (target sizes). | Both | Codex | S | 🟡 partial |
| **P1-4** | **Separate local policy from universal teaching on MS3 content** (Audit #4). Tag MMC/MaineHealth/Sanford protocol, order-set, restraint, legal, EHR specifics with `localPolicy: true` + owner/review-date; student pages point to live institutional policy for exact orders/doses. The resident tools' `LOCAL_POLICY`-token pattern is the model. Files: `protocol_library.md`, `pg_suicide.md`, `evidence_inpatient.md`, `rounds_questions.md`, `exp_consult.md`, `violence.html` (FRST), `withdrawal.html`, `ethics_legal.md` (after P0-1 restores it to source). | MS3 | Codex M + Faculty S | M | ⬜ |
| **P1-5** | **Complete structured metadata coverage** (Audit #5). Source `topic_meta.json` has **11 entries** vs 46+ built pages (the audit's "17/56" measured the stale deploy copy — salvage its extra entries first, then author the rest, incl. the 10 restored pages). Harness soft findings enumerate the exact gaps. Files: `topic_meta.json` (root; build copies it), `~/clerkship-hub-deploy/topic_meta.json` (salvage source). | Both | Codex | M–L | ⬜ |
| **P1-6** | **Triage the `quick-wins/` staging folder** — `dark-mode.css`, `differential-decision-trees.html`, `vignettes.html` sit unwired at repo root (not in build, not live; dark-mode likely superseded by the build's dark-mode pass). Wire in or archive to `99_Archive/`. Same source/artifact-drift class as P0-1. | MS3 | Codex | S | ⬜ |
| **P1-7** | **Refresh the stale handoff docs.** `STATUS_LATEST.md` (untracked, 07-01) still prescribes the retired manual-deploy flow and lists done gates as open — a fresh session pointed there will act on wrong state. Update it + add "superseded by FINALIZATION_PLAN" headers to the five source docs. | Both | Codex | S | ⬜ |
| **P1-8** | **Media accessibility manifest** (Audit #11). 100 LFS audio files across `/audio`, `/audio_oe` have no transcript/caption/metadata gate. Manifest per item (title, topic, duration, transcript path, review status, license); orientation video is the done exemplar; CI reports missing transcripts for published media. Files: `audio/`, `audio_oe/`, `12_Media/`, `podcast_library.md`, new manifest. | Both | Codex | M | ⬜ |

---

## P2 — Polish, scale, and post-launch features

| ID | Item | Track | Owner | Effort | Status |
|---|---|---|---|---|---|
| **P2-1** | **Feature 2 — Night Float Survival Coach** (`rp-night-float.html` + pack) — the next net-new build. Spec §4: 12–15 playbooks, `nf.*` escalation tokens, cross-links to F1/C-SSRS/capacity/withdrawal; content staged in `OPENEVIDENCE RAW FILES TO REVIEW/`. | Res | Codex → Faculty tokens | M | ⬜ |
| **P2-2** | **Feature 3 — Family Meeting Simulator** (`rp-family-sim.html`) — biggest new build (branching turn engine; reused by Brief-Psych v2 and the deferred pager-timer mode). Spec §5. | Res | Codex | L | ⬜ |
| **P2-3** | **F1 v2 engine:** evolving-scenario state machine (de-escalation can fail), hard teaching stops (benzo-in-delirium), restraint-equity debrief; verify the SRS wrong-turn wiring landed. | Res | Codex | M | ⬜ |
| **P2-4** | **Role-aware navigation & search** (Audit #10): MS3 / PGY-1 cross-cover / faculty entry modes + facets ("bedside now", "shelf", "cross-cover", "teaching") without forking content. Files: `spa_index.html`, `build_index.py`, `topic_meta.json`. | Both | Codex | M | ⬜ |
| **P2-5** | **Tool registry + shared-shell retrofit of the 15 legacy tools** (Audit #9): registry metadata, shared disclaimer/theme/review-state; add `[RC-META]` to the 5 tools the harness flags (`interview-circle`, `learning-path`, `review-attest`, `review`, `screeners`). | Both | Codex | M–L | 🟡 template built |
| **P2-6** | **Browser smoke tests for high-risk tools** (Audit #8): MSE, C-SSRS, withdrawal, BFCRS, capacity, violence, decision-aids — direct + iframe routes; loads, no console errors, no 390 px overflow, accessible names, state updates. | Both | Codex | M | ⬜ |
| **P2-7** | **Markdown sanitization before broad authoring** (Audit #6). Verified: `spa_index.html` renders `marked.parse()` into `innerHTML` with zero sanitize calls. Acceptable while authors are trusted; **required before** any non-technical faculty/admin can add content (DOMPurify or constrained pipeline + malicious-fixture tests). | Both | Codex | M | ⬜ trigger-gated |
| **P2-8** | **Externalize inline JS/CSS; drop CSP `unsafe-inline`** (Audit #12 residue — config portability already done). Files: `_headers`, `spa_index.html`. | Both | Codex | M | 🟡 |
| **P2-9** | **Staleness automation:** emit `staleness.json` from `[RC-META]` `reviewCadenceDays`/`evidenceThrough`; SPA badges stale items; flags feed the existing `clinician-guidelines` surveillance `DATA[]` — do not build a parallel queue. | Both | Codex | S | ⬜ |
| **P2-10** | **Flag-hook v2:** Netlify Forms capture → `flags_queue.json` faculty triage (MVP `mailto:` ships with each tool). | Both | Codex | S–M | ⬜ |
| **P2-11** | **Faculty teaching workflow/dashboard** (Audit #15): today's teaching options, cases, rounds questions, review queue, recently-changed high-risk pages; auditable attestation. Builds on `review-attest.html`. | Res→Both | Codex | L | ⬜ |
| **P2-12** | **Privacy-safe progress export/analytics** (Audit #16): keep `localStorage` PHI-free; optional export/import; aggregate opt-in only; document FERPA implications before any accounts. | Both | Codex | M–L | ⬜ |
| **P2-13** | **One-hub + Residency-track merge** (locked target): fold the resident build into the shared hub as a Residency nav section (`rp_*` storage stays isolated from `cw_*`). Until then the derived-twin build (`resident_section.py`) is the blessed interim. | Both | Codex | M–L | 🔒 decided, deferred |
| **P2-14** | **Source hygiene follow-through** from `_AUDIT_AND_ROADMAP.md` §3: verify `_DEDUPE_REPORT.md` recommendations were executed (Landmark 15-vs-16 count fix, ~12 FT decks → 1 canonical, RSSM v11-only, Teaching Manual v2-only, archive `Raw_Records` after verification). | source | Codex | M | ⬜ verify |
| **P2-15** | **Content-gap sweep** vs `_AUDIT_AND_ROADMAP.md` §4 (29 domains): confirm the remaining "Create" items (violence-risk one-pager, weekly reflection prompts, OSCE checklists depth, consult-etiquette one-pager) are live or consciously dropped; surface `11_AI_and_Prompts/` as a student-safe page. | MS3 | Codex | S | ⬜ |
| **P2-16** | **Tracks expansion** (`14_Tracks/`): Sub-I / CAP / SW-Nursing overlays as link-maps only (never fork content), per the June roadmap R6. | Both | Faculty + Codex | M | ⬜ |

---

## §D — Deferred by decision or trigger (not open work)

- **ClerkshipOS migration (Audit #7)** — 🔒 hybrid/bridge decided. Monorepo at `/Users/jm/clerkshipos` (separate repo; build/test/validate pass; 16 engine tests green). **Trigger:** Audit Issues 1–5 done **and** a second real tenant/audience. Its internal issues (#13 CI web build, #14 generated-TS scrub, schema `risk/localPolicy/media` extensions) are out of scope until that trigger. The `_TEMPLATE.html` + token + pack discipline keeps the eventual migration mechanical (token → tenant overlay, pack → content node, `reviewed.json` → attestation fields).
- **ClerkshipOS Phases 4–9** (no-code admin, AI layer, Supabase control plane, multi-specialty packs, SaaS) — gate: 2nd synthetic tenant stood up <1 day with zero engine edits, plus real external demand (§14/§17 of the architecture doc).
- **EPA/Milestones (F4) + PD Team Formulation (F5)** — 🔒 deferred v2 modules, **spec-only (never built)**. EPA blocked on governance: does a resident-owned formative entrustment log collide with the GME system of record / FERPA? PD folds into the Family Sim as a case type.
- **Discharge Planning Pathway + Brief-Psych v2 + pager-timer simulator** — after the F3 engine exists (spec §1.3).
- **Git-LFS bandwidth escape hatch** (audio → R2/CDN or data pack, not a DB) — trigger: an actual bandwidth overage (watch-item; `GIT_AND_DEPLOY_PLAN.md` §6a).
- **Public-facing mirror** (RSS/internal naming stripped) — trigger: external-sharing decision (June roadmap R6).

## Disposition of the superseded docs

After this plan merges: move `CLERKSHIP_PLATFORM_AUDIT_BACKLOG_2026-07-02.md`, `MMC-Resident-Platform_MERGED-ROADMAP_2026-07-02.md`, `_AUDIT_AND_ROADMAP.md`, `Design-Plan-Alignment-and-Video_2026-07-02.md`, `_CODEX_AUDIT_INTEGRATION.md` to `99_Archive/planning-2026-07/` (P1-7 adds the superseded headers first). Keep at root as living references: `MMC-Resident-Platform_Interactive-Feature-Specs_2026-07-02.md` (build spec for P2-1/2 and the deferred F4/F5) and `_PLATFORM_ARCHITECTURE_ClerkshipOS.md` (reference for §D).

## Guardrails (carry into every item)

- **Not a clinical decision-support device.** Trainers grade reasoning/hazard-avoidance; they never emit orders. **No dose literals** in any tool or pack — CI-enforced via the P0-3 grep.
- **No invented local policy.** Every institution-specific fact is a `LOCAL_POLICY` token, `value:null` until faculty fills it; renders as a visible "⚠ Confirm locally" chip.
- **No PHI.** Fictional composites only; `localStorage` is `cw_`- (MS3) / `rp_`- (resident) prefixed and PHI-free.
- **Attestation before publish.** High-risk clinical/legal/formulary content ships visibly watermarked "Draft — pending faculty review" until it is in `reviewed.json`.
- **Source is truth.** Never hand-edit `~/clerkship-hub-deploy` or `~/mmc-resident-deploy`; change source, push, let CI build. **One deploy driver at a time.**

---

## The P0 list

1. **P0-1 — Restore the 10 pages the git cutover dropped from the live MS3 site** (`t_sleep, t_somatic, ect_neuromodulation, cultural_psychiatry, ethics_legal, t_adjustment, t_dissociative, t_impulse, t_neurocog, t_sexual`) — copy from `~/clerkship-hub-deploy/content/` into source, wire into `build_deploy.py` `md[]`/nav, salvage their `topic_meta` entries, keep them pending-review. *Both · Codex · M.* **Live regression; sole copies sit in an untracked folder.**
2. **P0-2 — Faculty-attest the four resident tools + orientation video that are already live, and fill the agitation pack's 8 `LOCAL_POLICY` tokens** (`rp-agitation`, `rp-canon-quiz`, `rp-brief-psych`, `orientation-video`; verify a learner-visible "Draft — pending faculty review" state until then). *Res · Faculty ~45 min + Codex S.*
3. **P0-3 — Wire the QA harness into both Netlify builds as a publish gate** (move `check-static-site.mjs` out of `_prototypes/_tooling/` into `site_build/`; hard failures fail the deploy). *Both · Codex · S–M.*

*Joshua Moss, MD | Psychiatrist*
