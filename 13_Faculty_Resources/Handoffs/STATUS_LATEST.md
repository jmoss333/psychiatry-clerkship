# STATUS — Clerkship Library (handoff for the next chat)

**Updated:** 2026-07-01 · **Owner:** Joshua Moss, MD · **Point a fresh chat here first.**

## TL;DR
Two workstreams this session: **(1) clinical attestation** of the 2026-07-01 independent review — done and staged; **(2) put the project under git + plan Netlify-from-git** — repo is live and pushed, but the deploy cutover is gated on audio→LFS and a page reconciliation. Nothing new is live on the sites yet beyond what a parallel chat published.

## Where things live
- **Repo (source of truth):** `~/Psychiatry-Clerkship-Library` — git, branch `main`, private remote **`jmoss333/psychiatry-clerkship`**.
- **Build scripts (session-portable, CI-ready):** `13_Faculty_Resources/_automation/site_build/` → `build_deploy.py` (MS3), `resident_section.py` (derives resident from MS3), `spa_index.html`, `marked.min.js`. Honor `OUT_DIR` / `MS3_DIR` env vars.
- **Deploy folders (BUILD ARTIFACTS — siblings, not in repo):** `~/clerkship-hub-deploy` (MS3), `~/mmc-resident-deploy` (resident).
- **Live sites:** `une-ms3-psychiatry.netlify.app` (site `94717a39-679b-4c78-ae02-7b19e809592e`) · `mmc-psychiatry-residents-sanford.netlify.app` (site `af64d5d4-e0b5-4f03-9857-be40e3b48329`).
- **Key docs (in `13_Faculty_Resources/Handoffs/`):** `MASTER_attestation_ledger_2026-07-01.md` (sign-off source of truth) · `GIT_AND_DEPLOY_PLAN.md` (git + deploy plan, incl. §6 audio/LFS) · `library_review_2026-07-01.md` (the audit that started this).

## DONE — clinical (applied to source + staged in both deploy folders)
- **Block 1 — 5 factual corrections:** Miklowitz P0 (re-verified vs PubMed PMID 33052390 → OR 0.56 / 0.46 / 0.12; the fabricated "OR 0.30 / SUCRA 95%" is gone) · clozapine "recommended ANC per PI" + 2025 REMS-eliminated note (FDA-verified) · QTc citation → Tisdale 2020 · truncated Q97 completed · BPD benzo endpoint → "attempted or completed suicide (HR 1.61; Lieslehto 2023)." Same three errors also cleaned from the `notebooklm_upload_2026-07-01` bundle.
- **Block 2 — released 8 core-topic pages** (green reviewed chips in `reviewed.json`): ddx, t_mood, t_psychosis, t_anxiety, t_sud, t_personality, t_geri, t_perinatal.
- **Block 5 — Eating Disorders page authored + ATTESTED** (`t_eating.md` + `topic_meta` + nav/search wiring; reviewed chip, footer stamped 2026-07-01).
- **Block 4 (partial):** search synonyms (SS/TD/AMA/DTs/Wernicke/AWS/EPS + eating), mobile long-table CSS, and build-script dead-path fix (now session-portable).

## DONE — git
git init → baseline `a7793cc` → plan doc `7be6cbc`; `master`→`main`; private GitHub repo created + pushed; PHI scan of all 361 tracked files clean (only a blank consent-template line, no real identifiers).

## NEXT (in order) — deploy cutover is gated on 1–3
1. **Audio → Git LFS** (`GIT_AND_DEPLOY_PLAN.md` §6). `.gitattributes` added; `.gitignore` already un-ignores `mp3/m4a/wav`. Run natively: `git lfs install` → `git add` the two audio dirs → verify `git lfs ls-files` → commit + push. **328 MB / 100 files.** Required, or a git-CI build ships both sites **audio-less**. (Budget a possible $5/mo LFS bandwidth pack.)
2. **Link both Netlify sites to the repo** — manual UI/OAuth step (can't be scripted). Build commands + publish dirs (`_build/ms3`, `_build/res`) are in the plan's table.
3. **Reconcile ~10 parallel-session pages into the build scripts** — `t_sleep, t_somatic, ect_neuromodulation, cultural_psychiatry, ethics_legal, t_adjustment, t_dissociative, t_impulse, t_neurocog, t_sexual` exist in the deploy folders (added by another chat) but are **not** in `build_deploy.py`'s `md[]`/nav. A clean CI build would drop them until they're added.
4. **Until 1–3 are done + verified, publish manually** (`netlify deploy --prod --dir=…`) from **one** session, rebuilding from source first. ⚠️ A parallel chat may have deployed only the **resident** site — the **MS3** live site may still lack the P0 Miklowitz fix + the ED page. Verify and publish MS3.

## OPEN — clinical, need Dr. Moss's sign-off (untouched this session)
In the ledger, Blocks 3 & 6: perinatal teratogenicity/lactation numbers, catatonia lorazepam dosing, **metabolic-monitoring schedule** reconciliation (`nutrition_metabolic.md` vs rounds Q13), **CIWA-Ar band** mismatch (withdrawal tool vs Q46), evidence-page **IV-route** clause, and the §8 "false-precision" citation cluster.

## GUARDRAILS (learned the hard way this session)
- **Source is truth; never hand-edit the deploy folders** — change source, rebuild.
- **Run git in a native terminal / Desktop Commander, not the Cowork sandbox** (the mount blocks git's lock-file cleanup).
- **One deploy driver at a time.** Two chats editing the same deploy folders clobbered artifacts earlier today (resolved — additive, no data loss — but avoid).

*Uncommitted at last check: `.gitattributes`, edited `.gitignore`, updated `GIT_AND_DEPLOY_PLAN.md`, this file — fold into the next native commit.*
