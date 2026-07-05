# ClerkshipOS / Clerkship Library — Current Pending Backlog

**Date:** 2026-07-05 · **Author reconciliation basis:** origin/main @ `77e2ca2`
**Method:** Every item in `FINALIZATION_PLAN.md` (the roadmap of record, dated 2026-07-02) and its five source docs was re-verified against the **actual current tree** — source files, `build_deploy.py`, `check-static-site.mjs`, `reviewed.json`, `topic_meta.json`, tool packs, and the built `_build/{ms3,res}` — not against the docs' own status claims. Work that landed after 2026-07-02 (the 144-item question bank, page restore, QA gate, metadata coverage, study-data export) is reconciled as **DONE** so it is not re-listed as pending.

**Status legend:** ✅ done · 🟡 partial · ⬜ open · 🔒 deferred by decision. **Track:** MS3 · Res · Both · Source. **Effort:** S <1d · M 1–3d · L 1–2wk. **Owner:** Faculty (needs Dr. Moss) · Codex (buildable now).

---

## Recently shipped — verified DONE (do NOT re-list as pending)

| Item | Evidence (verified this pass) |
|---|---|
| **P0-1 — 10 dropped MS3 pages restored** | All of `t_sleep, t_somatic, ect_neuromodulation, cultural_psychiatry, ethics_legal, t_adjustment, t_dissociative, t_impulse, t_neurocog, t_sexual` now exist as canonical source files under `03_Core_Topics/…` & `05_Psychopharmacology/…`, are wired into `build_deploy.py` `md[]`, and build into `_build/ms3/content/`. |
| **P0-3 — QA harness wired as publish gate** | `check-static-site.mjs` lives in `13_Faculty_Resources/_automation/site_build/`; its header + `build_and_check.sh` confirm it is both sites' Netlify build command and a non-zero exit fails the deploy. Both sites currently PASS (hard:0). |
| **P1-5 — structured metadata coverage** | `topic_meta.json` = 63 entries ≥ 56 built pages; `STRICT=1` harness run reports **zero** "missing from topic_meta" findings. (The plan's "11 entries" is stale.) |
| **144-item question bank + practice mode + attestation tool** | `question_bank.json` = 144 items / 144 unique ids, valid; `question-bank-practice.html` + `qbank-attest.html` built into both sites. |
| **Question-bank audit + all fixes** | `QBANK_AUDIT_2026-07.md` + `FIXES_APPLIED.md` in tree; both P0 corrections (sud_014 mechanism, otherdx_005 Hoover), all P1/P2 fixes, 3 new cited source sections (hepatic-benzo, NMS-vs-SS, akathisia mgmt), and 3 duplicate re-angles applied and live. |
| **Item-id collision fix** | `cb851cd` renumbered 4 colliding ids (waves 1+5). |
| **Media/video asset hardening** | `media_guard.py` + `test_media_guard.py` present; `fix/vendor-and-video-asset-deploy` + `feat/intro-trailer-poster-frame` merged (0 commits ahead of main). React vendored locally (no runtime CDN). |
| **P2-12 (partial) — privacy-safe study export** | `611d2db` shipped opt-in de-identified study-data export (evaluation protocol §7). The export half of P2-12 is done; FERPA-before-accounts documentation remains. |
| **Surveillance Phase 2** | `2463dad` — advisory AI-drafted PR edits + live citation-validity checking. |
| **Git-under-source + build-on-push both sites** | Verified live earlier; `STATUS_LATEST`'s gates 1–2 (LFS, site-linking) are done. |

---

## P0 — Ship-blocking (the live sites are unsafe or incomplete today)

All three P0s are **faculty attestation gates**, not builds — high-risk content is live (or ready to publish) without a sign-off.

| ID | Item | Track | Owner | Effort | Status |
|---|---|---|---|---|---|
| **P0-2** | **Attest the 4 resident tools + orientation video already live, and fill the agitation pack's 8 `LOCAL_POLICY` tokens.** Verified still open: `rp-agitation.pack.json` ships `status:"draft-pending-attestation"` with **all 8** tokens `value:null` (formulary, restraint policy, monitoring cadence, QTc action, escalation activation, setting scope, feedback email, PO/IM options); none of `rp-agitation / rp-canon-quiz / rp-brief-psych / orientation-video` is in `reviewed.json`. Faculty ~45 min: watch + attest video, review agitation claims, fill tokens, spot-check quiz + brief-psych. | Res | Faculty + Codex | S | ⬜ |
| **P0-QB** | **Faculty attestation of the 144-item question bank** (new since the plan). Verified: every item is `status:"draft"` — the bank ships watermarked and is not student-final until attested. `qbank-attest.html` (export-patch model, `cw_qbank_attest_v1`) is built and ready. The July audit + fixes make this the fast, safe path. | Both | Faculty | M | ⬜ |
| **P0-1c (clinical)** | **Clinical sign-off: attestation-ledger Blocks 3 & 6** (plan P1-1, elevated here because all are on **live** pages and two are internal contradictions the site teaches today): metabolic-monitoring schedule mismatch (`nutrition_metabolic.md` vs rounds Q13); **CIWA-Ar band mismatch** (withdrawal tool vs Q46 — two different cutoffs live); perinatal teratogenicity/lactation numbers; catatonia lorazepam dosing; evidence-page IV-route clause; §8 false-precision citation cluster. Not verifiable from the repo → treat as open faculty gate. Source: `MASTER_attestation_ledger_2026-07-01.md`. | Both | Faculty | S–M | ⬜ |

---

## P1 — Before broad sharing with students/residents

| ID | Item | Track | Owner | Effort | Status |
|---|---|---|---|---|---|
| **P1-2** | **Attestation publish gate with a `risk` field.** Verified: `reviewed.json` entries are still `{status,at,by}` only — **no `risk` field anywhere** in `reviewed.json` or `topic_meta.json`. The coverage-gate half exists (`STRICT=1` fails on unreviewed nav items); the risk-tiering half (schema `risk: clinical\|legal\|formulary\|local-policy\|general`; high-risk-unreviewed → per-page watermark + harden the harness from soft→hard) is **not built**. Files: `reviewed.json`, `spa_index.html`, `check-static-site.mjs`, `topic_meta.json`, `review-attest.html`. | Both | Codex M + Faculty S | M | 🟡 |
| **P1-3** | **Mobile/bedside a11y — finish the last item.** Verified mostly done: mobile drawer sets `inert`+`aria-hidden` on close, backdrop + `aria-expanded` wired, tool sheet is `role="dialog" aria-modal`, clear/theme/banner buttons have `aria-label`. **Residual:** the search `<input id="search">` (`spa_index.html:275`) still has only a `placeholder`, no `aria-label`/label; 44 px tap-target sweep across `tools/*.html` unverified. | Both | Codex | S | 🟡 |
| **P1-4** | **Separate local policy from universal teaching on MS3 content.** Verified open: **no** `localPolicy` tag exists in any `03_Core_Topics/04_Acute_and_Safety/05_Psychopharmacology` page or in `topic_meta.json`. Tag MMC/MaineHealth/Sanford protocol, order-set, restraint, legal, EHR specifics with `localPolicy:true` + owner/review-date; point student pages to live institutional policy for exact orders. The resident packs' `LOCAL_POLICY`-token pattern is the model. Files: `protocol_library.md`, `pg_suicide.md`, `evidence_inpatient.md`, `rounds_questions.md`, `exp_consult.md`, `violence.html`, `withdrawal.html`, `ethics_legal.md`. | MS3 | Codex M + Faculty S | M | ⬜ |
| **P1-6** | **Triage `quick-wins/` staging folder.** Verified: `dark-mode.css`, `differential-decision-trees.html`, `vignettes.html` still sit unwired at repo root (not in build, not live). Dark-mode likely superseded by the build's dark-mode pass. Wire in or archive to `99_Archive/`. | MS3 | Codex | S | ⬜ |
| **P1-7** | **Refresh stale handoff docs.** Verified: `STATUS_LATEST.md` still dated **2026-07-01**, still prescribes the retired manual `netlify deploy --prod` flow and lists done gates (LFS, site-linking) as open — a fresh session pointed here acts on wrong state. Update it; add "superseded by FINALIZATION_PLAN / this backlog" headers to the five source docs. | Both | Codex | S | ⬜ |
| **P1-8** | **Media accessibility manifest.** Verified open: ~100 LFS audio files (`/audio`, `/audio_oe`) have no transcript/caption/metadata gate. Per-item manifest (title, topic, duration, transcript path, review status, license); orientation video is the done exemplar; harness reports missing transcripts for published media. | Both | Codex | M | ⬜ |

---

## P2 — Polish, scale, post-launch, and infrastructure hygiene

### Infrastructure / build hardening (the remaining "known suspects")

| ID | Item | Track | Owner | Effort | Status |
|---|---|---|---|---|---|
| **P2-8** | **Externalize inline JS/CSS; adopt a strict CSP (drop `unsafe-inline`).** Verified: no CSP header is emitted in `_build/ms3/_headers`; `spa_index.html` is a single-file SPA with all JS/CSS inline. Config portability (Audit #12) is already done; this is the residue. | Both | Codex | M | ⬜ |
| **P2-NDG** | **Near-duplicate build guard.** Verified: **no** dup/near-dup detection exists in `check-static-site.mjs` or any build/qbank script. The one id-collision was fixed by hand (`cb851cd`) and the qbank audit found ~9 near-duplicate item pairs (3 re-angled, rest noted) — nothing prevents recurrence. Add a harness check: duplicate item-ids (hard) + high-similarity stems/pages (soft). | Both | Codex | S–M | ⬜ |
| **P2-SLG** | **Replace the hardcoded source→slug map.** Verified: `build_deploy.py` carries **77** hand-maintained `(source_path, slug, title)` tuples in `md[]`/`tools[]`; the audit flagged this as the brittleness that dropped the 10 pages (P0-1). Derive the map (or lint it against the tree) so a new page can't be silently omitted. | Both | Codex | M | ⬜ |
| **P2-RAW** | **Raw-content triage.** Verified: `OPENEVIDENCE RAW FILES TO REVIEW/` (feeds Features 2–5 packs) and `psychoed-library/Raw_Records` remain untriaged staging at/near root. Process into packs or archive; keep a raw→processed MANIFEST. | Source | Codex | M | ⬜ |

### Features & scale (from feature-spec + audit P2s — all verified not-built)

| ID | Item | Track | Owner | Effort | Status |
|---|---|---|---|---|---|
| **P2-1** | **Feature 2 — Night Float Survival Coach** (`rp-night-float.html` + pack; `nf.*` escalation tokens; content staged in `OPENEVIDENCE RAW…`). | Res | Codex → Faculty tokens | M | ⬜ |
| **P2-2** | **Feature 3 — Family Meeting Simulator** (`rp-family-sim.html`; branching turn engine; reused by Brief-Psych v2). | Res | Codex | L | ⬜ |
| **P2-3** | **F1 Agitation v2 engine** — evolving-scenario state machine, hard teaching stops (benzo-in-delirium), restraint-equity debrief; verify SRS wrong-turn wiring. | Res | Codex | M | ⬜ |
| **P2-4** | **Role-aware navigation & search** (MS3/PGY-1/faculty modes + facets). **Note:** substantial nav work sits unmerged on `origin/claude/dreamy-hugle-539db9` (7 commits: super-category regroup, resident inline tool CTAs, two-tier accordion, search-result group reveal) — decide merge vs. abandon (see Flags). | Both | Codex | M | ⬜ |
| **P2-5** | **Tool registry + shared-shell retrofit** of legacy tools; add `[RC-META]` to the 5 tools the harness still flags (`interview-circle, learning-path, review-attest, review, screeners`). | Both | Codex | M–L | 🟡 |
| **P2-6** | **Browser smoke tests for high-risk tools** (MSE, C-SSRS, withdrawal, BFCRS, capacity, violence, decision-aids) — direct + iframe routes. | Both | Codex | M | ⬜ |
| **P2-7** | **Markdown sanitization before broad authoring** (DOMPurify/constrained pipeline). Trigger-gated: required before any non-technical author adds content. | Both | Codex | M | ⬜ (trigger) |
| **P2-9** | **Staleness automation** — emit `staleness.json` from `[RC-META]` cadence; SPA badges; feed the existing surveillance `DATA[]` (no parallel queue). | Both | Codex | S | ⬜ |
| **P2-10** | **Flag-hook v2** — Netlify Forms → `flags_queue.json` faculty triage (MVP `mailto:` already ships). | Both | Codex | S–M | ⬜ |
| **P2-11** | **Faculty teaching workflow/dashboard** — today's teaching, review queue, recently-changed high-risk pages; builds on `review-attest.html`. | Res→Both | Codex | L | ⬜ |
| **P2-12** | **Privacy-safe analytics — finish.** Export half shipped (`611d2db`). Remaining: aggregate opt-in analytics + document FERPA implications before any accounts. | Both | Codex | M | 🟡 |
| **P2-14** | **Source-hygiene follow-through** (`_AUDIT_AND_ROADMAP.md` §3): verify `_DEDUPE_REPORT.md` executed (Landmark 15-vs-16, ~12 FT decks → 1, RSSM v11-only, Teaching Manual v2-only, archive `Raw_Records`). | Source | Codex | M | ⬜ verify |
| **P2-15** | **Content-gap sweep** vs `_AUDIT_AND_ROADMAP.md` §4 (29 domains): confirm remaining "Create" items live or consciously dropped; surface `11_AI_and_Prompts/` as a student-safe page. | MS3 | Codex | S | ⬜ |
| **P2-16** | **Tracks expansion** (`14_Tracks/`): Sub-I / CAP / SW-Nursing overlays as link-maps only. | Both | Faculty + Codex | M | ⬜ |

---

## §D — Deferred by decision or trigger (not open work)

- **P2-13 One-hub + Residency-track merge** — 🔒 decided; derived-twin build (`resident_section.py`) is the blessed interim until the physical merge.
- **ClerkshipOS migration (Audit #7)** + Phases 4–9 — 🔒 hybrid/bridge. Trigger: audit Issues 1–5 done **and** a real 2nd tenant. Internal issues #13–14 (CI web build, generated-TS scrub) out of scope until then.
- **EPA/Milestones (F4) + PD Team Formulation (F5)** — 🔒 spec-only, deferred v2; EPA blocked on GME/FERPA governance; PD folds into Family Sim.
- **Discharge Pathway + Brief-Psych v2 + pager-timer sim** — after the F3 engine exists.
- **Git-LFS bandwidth escape hatch**; **public-facing mirror** — trigger-gated watch-items.

---

## Known-suspects reconciliation (explicitly requested)

Verified true status of the 8 items flagged as possibly-already-closed. **Finding: none is fully closed; a11y is closest.**

| Suspect | Verified status | Evidence |
|---|---|---|
| Attestation publish-gate **+ risk field** | 🟡 **partial / open** | Coverage gate exists (`STRICT=1`); **no `risk` field** in `reviewed.json` or `topic_meta.json` → P1-2 open. |
| Resident-tool attestation + `LOCAL_POLICY` tokens | ⬜ **open** | `rp-agitation.pack.json` = `draft-pending-attestation`, 8/8 tokens `null`; not in `reviewed.json` → P0-2. |
| Local-policy tagging on high-risk pages | ⬜ **open** | Zero `localPolicy` tags in MS3 content or `topic_meta.json`. (Resident-pack tokens exist but unfilled; that's P0-2, not page-tagging.) → P1-4. |
| A11y quick wins | 🟡 **mostly closed** | Drawer `inert`/focus/`aria`, dialog `aria-modal`, button labels done; **only** the search-input accessible name + 44px sweep remain → P1-3. |
| CSP residue | ⬜ **open** | No CSP header in `_build/ms3/_headers`; inline JS/CSS still inline → P2-8. |
| Hardcoded source→slug map | ⬜ **open** | 77 literal tuples in `build_deploy.py` → P2-SLG. |
| Near-dup build guard | ⬜ **open** | No dup detection in harness/qbank tooling; id-collision fixed by hand once → P2-NDG. |
| Raw-content triage | ⬜ **open** | `OPENEVIDENCE RAW FILES TO REVIEW/` + `Raw_Records` untriaged → P2-RAW. |

---

## Flags / ambiguities

- **Unmerged nav branch.** `origin/claude/dreamy-hugle-539db9` is 7 commits ahead of main with real sidebar/nav UX (super-category regroup, resident inline tool CTAs, two-tier accordion, search-result group reveal). It overlaps P2-4. **Decide: merge, cherry-pick, or abandon** — it is the only genuinely-unmerged feature branch (the other four remote branches are 0 commits ahead = already landed).
- **Faculty-gate items can't be repo-verified.** P0-2, P0-QB, and P0-1c are attestation acts — the tooling/content is ready; only Dr. Moss's sign-off closes them. Their "open" status reflects the absence of a `reviewed.json`/attest-ledger entry, not missing work.
- **P2-12 is split** — export shipped, analytics/FERPA doc not; scored 🟡.
- **"Local-policy tagging" is read two ways** — resident-pack `LOCAL_POLICY` tokens (exist, unfilled) vs. MS3 content-page `localPolicy` tags (absent). This backlog treats the MS3-page tagging as the open P1-4.

---

## Summary counts (open work only)

| Severity | Count | IDs |
|---|---|---|
| **P0** | 3 | P0-2, P0-QB, P0-1c *(all faculty attestation gates)* |
| **P1** | 6 | P1-2 🟡, P1-3 🟡, P1-4, P1-6, P1-7, P1-8 |
| **P2** | 18 | P2-1, P2-2, P2-3, P2-4, P2-5 🟡, P2-6, P2-7, P2-8, P2-9, P2-10, P2-11, P2-12 🟡, P2-14, P2-15, P2-16, P2-NDG, P2-SLG, P2-RAW |
| **§D deferred** | 5 clusters | hub-merge, ClerkshipOS, EPA/PD, F3-dependent, trigger watch-items |

*Read-only reconciliation. No items, `reviewed.json`, or content changed. Joshua Moss, MD | Psychiatrist.*
