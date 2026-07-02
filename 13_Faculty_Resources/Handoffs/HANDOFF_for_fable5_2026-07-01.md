# Session Handoff — 2026-07-01 (EDT) — dev + clinical-content — for a fresh chat (fable 5)

## TL;DR
Long build session on the two private psychiatry-clerkship sites (MS3 + MMC resident). Shipped: interactive-tool enhancements, a full OpenEvidence Tier-1 evidence pass, two new pages, a nav reorder, and a complete UX layer (local `marked`, tool-launcher badges + floating dock, Progress home, Start-here landing) — all live and verified on both sites. **Two items are requested but not yet built: #7 (search abbreviations + resume) and #8 (mobile pocket-card/print view).** The next chat (fable 5) is being asked to do a **thorough independent review of the whole clerkship library** — the copy-paste prompt for that is at the bottom of this file.

---

## The two sites (both live, private, noindex)
| | MS3 | MMC Resident |
|---|---|---|
| URL | https://une-ms3-psychiatry.netlify.app | https://mmc-psychiatry-residents-sanford.netlify.app |
| Netlify site id | `94717a39-679b-4c78-ae02-7b19e809592e` | `af64d5d4-e0b5-4f03-9857-be40e3b48329` |
| Deploy dir (persistent) | `/Users/jm/clerkship-hub-deploy` | `/Users/jm/mmc-resident-deploy` |

Both are one SPA shell (`index.html`) + markdown content (`content/*.md`) + iframe tools (`tools/*.html`) + `nav.json` + `search-index.json`. The resident site is **derived** from the MS3 build (copytree + rebrand + resident-only pages/nav).

## Source of truth & build/deploy
- **Library source tree:** `/Users/jm/Psychiatry-Clerkship-Library/` — this is where all `.md`/`.html`/`.json` content is authored and edited.
- **Site build toolchain (persisted this session):** `/Users/jm/Psychiatry-Clerkship-Library/13_Faculty_Resources/_automation/site_build/` — `spa_index.html` (SPA shell source), `build_deploy.py` (MS3 build), `resident_section.py` (resident derive), `marked.min.js` (vendored), `build_index.py`.
  - ⚠️ **Gotcha:** these scripts contain **hard-coded sandbox mount paths** from this session (`/sessions/zen-loving-cori/mnt/...`). A new session's bash mount prefix will differ. Before running, translate paths to the new mount (the `/Users/jm/...` equivalents are stable; only the `/sessions/<name>/mnt/` prefix changes). Also update `spa_index.html`'s copy path if you moved it.
- **Build:** in the sandbox — `python3 build_deploy.py` then `python3 resident_section.py`.
- **Deploy:** via Desktop_Commander (real shell, has Netlify auth): `cd /Users/jm/clerkship-hub-deploy && netlify deploy --prod --dir . --site 94717a39-679b-4c78-ae02-7b19e809592e` (and the resident dir/id).
- **Nav order** is enforced by a `_navorder` sort at the end of both build scripts.
- **Workspace note:** the sandbox bash intermittently times out on the big `copytree` in `resident_section.py`. If it stalls, the deploy dirs are still intact from the prior successful build; a nav-only change can be delta-patched into the deployed `nav.json` + redeployed rather than full-rebuilt.

## PHI firewall & governance (must respect)
- **PHI-free.** Fictional/de-identified composites only; never persist patient-identifying content.
- All AI-drafted clinical content is **"pending Dr. Moss's attestation."** Don't fabricate DOIs, doses, or effect sizes; quote real page text, never invent it.
- **External-facing framing:** strip "RSS"/"ReConnect"/"Layer" terms from learner content.
- Signature on authored pages: `Joshua Moss, MD | Psychiatrist`.
- House style for tools: single-file, React 18 UMD (`var e=React.createElement`, no JSX/Babel), "Clinical Warm" CSS custom-property tokens, dark mode via `[data-theme="dark"]`, reduced-motion guards. Do **not** reproduce the proprietary `.dc`/DCLogic design-runtime — recreate in house style.

---

## What shipped this session (all live + verified on both sites)
1. **Interactive-tool enhancements** (React-UMD, house style): CIWA-Ar/COWS **needle-gauge** readout (`03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html`); C-SSRS **walked-path** view (`04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html`); BFCRS **screen/severity split + heat grid** (`04_Acute_and_Safety/Catatonia/bfcrs.html`); oral-presentation **conic countdown ring + status dots** (`02_Clinical_Skills/Oral_Presentations/oral-presentation-module.html`); MSE **live-assembling note** (`02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html`).
2. **OpenEvidence Tier-1 evidence pass** — 9 new evidence reviews cross-checked against the library; memo at `13_Faculty_Resources/Handoffs/openevidence_library_accuracy_review_2026-07-01.md` (see "RUN 2"). Drop-in numbers added to: Perinatal, Psychopharm primer, Family & Discharge module, Family Therapy Modalities, Family Meeting Playbook, Agitation & Restraint, Evidence-Based Inpatient, Personality/BPD. Two accuracy fixes (family EE figures; BPD "long stays" wording).
3. **New page — Brief Psychotherapy on the Unit** (`02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md`), wired into both navs; fixed the Week-3 dead "Psychotherapy folder" link.
4. **New page — C-L resident numbers reference** (`14_Tracks/Resident/cl_reference.md`, resident-only): serotonin syndrome vs NMS, lithium tox, QTc, delirium prevention, capacity epidemiology, hepatic/renal dosing, catatonia lorazepam dosing. MS3 catatonia page kept **dose-free** per Josh's decision.
5. **Tier-3 attestation sheet** (`13_Faculty_Resources/Handoffs/Tier3_attestation_sheet_2026-07-01.md`) — teratogenicity/lactation/dosing + newer/observational figures awaiting Josh's sign-off.
6. **Nav reorder:** Start here → **Core Topics → Six-Week Curriculum → Interactive tools** → rest (MS3); analogous on resident.
7. **UX layer (from Claude Design handoff, rebuilt in house style):**
   - `marked` **bundled locally** (`marked.min.js`) — fixes "blank on ward wifi."
   - **Tool-launcher badges** — inline `.tl-chip` (icon + in-app open via `.navitem[data-f]` click) + auto-mounting **floating dock** driven by a `PAGE_TOOLS` map in `spa_index.html`. Inline chips placed on the SUD and Catatonia pages.
   - **Progress home** (Concept B) — "Home" item computed from `cw_progress_v1` + `cw_srs_v1` + `topic_meta.json` (reviewed ring, due-today, streak, shelf countdown, high-yield-not-reviewed, coverage-by-section).
   - **Start-here landing** (Concept A) — first-run orientation (Path vs Library, track/week/shelf pickers → `cw_track`/`cw_start_week`/`cw_shelf_date`, first-day checklist, quick-tools row); shown once via `cw_seen_start`, reopenable from the Overview nav section.
8. **Reference artifacts:** `13_Faculty_Resources/Handoffs/claude_design_prompt_floating_tool_badges.md` (the prompt that produced the badges); the Claude Design return package extracted under the session outputs.

## Open / not-yet-done (priority order)
- [ ] **#7 — Search abbreviations + resume (P1, requested, not started).** Search misses clinical abbreviations (SS, NMS, EPS, AMA, TD, etc.); add a synonym/abbrev layer to the search index/synonyms, and a "resume where I was" using the already-persisted `cw_last` key.
- [ ] **#8 — Mobile pocket-card / print view (P1, requested, not started).** Long tables are painful on phones; surface the existing `pg_*` pocket cards from each topic and add a condensed one-tap print/pocket view.
- [ ] **Tier-3 attestation** — Josh to check the sheet; then promote/confirm those numbers.
- [ ] **Finding #4 (recommended, not designed)** — per-topic faculty-reviewed vs draft trust badge (extend `reviewed.json`).
- [ ] **Concept C — bedside mobile tool bar** — not selected this round; shares the badge registry if built.
- [ ] Weekly OpenEvidence scan continues (LaunchAgent/scheduled task); all 17 raw files currently committed in the scanner manifest.

## Decisions made (for future reference)
- MS3 catatonia page stays **dose-free**; lorazepam dosing lives only on the resident C-L reference (Josh approved 2026-07-01).
- Progress home is a **nav item** (not a forced Path default) to stay low-risk; returning users land on Home, first-run users on Start here.
- Badges open in-app by clicking the matching sidebar nav item — **no host change required**; a `?tool=` soft-swap handler is an optional future nicety.
- UX mockup `.dc.html` from Claude Design is **reference-only** (proprietary runtime) — rebuilt in house style instead.

## Next session starting point
- **First files:** `/Users/jm/Psychiatry-Clerkship-Library/13_Faculty_Resources/_automation/site_build/spa_index.html` (SPA shell) and `.../site_build/build_deploy.py`.
- **First move if building #7/#8:** read the search-index builder in `build_deploy.py` (synonym groups + `TOOLKW`) and the `pg_*` pocket-guide sources under `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/`.
- **If reviewing (fable 5):** use the prompt below — no build needed; review source tree + live sites.

---

# ⬇️ COPY-PASTE PROMPT FOR THE NEW CHAT (fable 5) — thorough clerkship-library review

> **Role.** You are a meticulous senior reviewer auditing two private psychiatry-clerkship learning sites for Dr. Joshua Moss (psychiatrist, UNE COM preceptor, MaineHealth–Sanford BHU). Be rigorous and specific; treat the author as a domain expert. Do **not** edit any files yet — produce a prioritized findings report first, then wait for direction on fixes.
>
> **What you're reviewing.**
> - Source tree: `/Users/jm/Psychiatry-Clerkship-Library/` (authored `.md` content, `tools/*.html`, `topic_meta.json`, `nav.json` via the build).
> - Live sites: MS3 → https://une-ms3-psychiatry.netlify.app · Resident → https://mmc-psychiatry-residents-sanford.netlify.app
> - Context memos in `13_Faculty_Resources/Handoffs/` — especially `HANDOFF_for_fable5_2026-07-01.md` (this file), `openevidence_library_accuracy_review_2026-07-01.md`, and `Tier3_attestation_sheet_2026-07-01.md`. Read these first so you don't re-flag known/pending items.
>
> **Hard rules.** PHI-free (fictional composites only). Quote the library's **actual** current text when flagging — never invent page text. Don't fabricate DOIs, doses, or effect sizes; if unsure, write "verify." Flag anything that needs Dr. Moss's clinical attestation. Keep "RSS/ReConnect/Layer" terminology out of learner-facing content. Preserve house style (single-file React-UMD tools, Clinical-Warm tokens, dark mode, reduced-motion).
>
> **Review across these dimensions — for BOTH the MS3 and resident variants:**
> 1. **Clinical accuracy & currency** — check facts, numbers, and drug/dosing statements against current guidelines (DSM-5-TR, APA, NICE, ASAM, AHA/QTc, landmark trials). Flag anything outdated, overstated, or unsourced. Note: the clozapine REMS was discontinued — confirm no stale REMS language remains.
> 2. **Completeness / high-yield gaps** — for a shelf/COMAT- and ward-relevant inpatient clerkship, what's missing or thin? (Prioritize board- and bedside-relevant gaps; don't pad.)
> 3. **Internal consistency** — cross-reference integrity (dead `?page=`/`?tool=` links, broken pocket-card references), terminology consistency, MS3-vs-resident divergence that should or shouldn't exist, `topic_meta.json` (high-yield flags, quizzes) coverage.
> 4. **Reading level & tone** — appropriate for the audience (students vs residents); flag jargon that isn't taught, and any stigmatizing language.
> 5. **UX / IA** — navigation order and grouping, discoverability, the new Start-here + Progress-home + tool-badge/dock layer (sanity-check they behave), search quality (esp. abbreviations like SS, NMS, EPS, AMA — a known gap, #7), and the mobile experience incl. long tables (known gap, #8).
> 6. **Accessibility** — WCAG AA color contrast (light + dark), keyboard operability, focus states, touch-target size, aria labels on the interactive tools.
> 7. **Code/build health** — the interactive `tools/*.html` (React-UMD) for console errors, dark-mode token coverage, reduced-motion; the SPA shell for regressions; confirm `marked` loads locally (renders with CDN blocked).
>
> **Method.** Inventory first (list every content page and tool). Then review systematically, sampling live behavior in the browser where useful (open pages/tools, toggle dark mode, test on a narrow viewport, try searches). Cite exact file paths and, for live issues, the page/tool + what you observed.
>
> **Deliverable.** A single prioritized report saved to `/Users/jm/Psychiatry-Clerkship-Library/13_Faculty_Resources/Handoffs/library_review_<YYYY-MM-DD>.md`, with findings tagged **[MS3]/[Resident]/[both]**, **P0 (safety/accuracy) / P1 / P2**, and **effort S/M/L**. For each: the quoted current state, the issue, the specific fix, and whether it needs Dr. Moss's attestation. End with a "top 10 highest-yield fixes" shortlist and a note on which are safe to implement immediately vs. which need sign-off. Ask **one** high-leverage clarifying question only if it would materially change the review's scope; otherwise proceed.

*Prepared by the prior session (Opus) · 2026-07-01T20:33 EDT · Joshua Moss, MD | Psychiatrist*
