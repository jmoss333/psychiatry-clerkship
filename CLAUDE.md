# Agent Guide — Psychiatry Clerkship Library

Single source of truth for a six-week adult inpatient psychiatry clerkship (Joshua Moss, MD).
This repo is a **static-site builder**: one source tree publishes **two Netlify sites** —
`une-ms3-psychiatry` (MS3 students) and `mmc-psychiatry-residents-sanford` (residents) — plus a
serverless SP-interview proxy. Numbered `NN_Category/` dirs are **content source**; the build
assembles them into `_build/ms3` and `_build/res`.

> **Codex parity:** this repo is used by both Claude Code and Codex. `CLAUDE.md` is canonical;
> `AGENTS.md` is a **byte-identical copy** of it (Claude reads `CLAUDE.md`, Codex reads `AGENTS.md`).
> After editing `CLAUDE.md`, run `cp CLAUDE.md AGENTS.md` — CI fails the PR if the two diverge.
> (No symlink: this repo has `core.symlinks=false`, so a link would check out as broken text.)

## Build & deploy
```bash
# Build one site + run the static-QA publish gate. This IS each site's Netlify build command.
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3   # → _build/ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res   # → _build/res
```
- **Two sites, one repo.** Build command, publish dir, and `GIT_LFS_ENABLED` are set **per-site in
  the Netlify UI**, not in `netlify.toml` (kept intentionally minimal — one toml can't express two
  sites, and it's read *after* the LFS checkout). See `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`.
- Deploy-on-push to `main`. Deploy previews: `https://deploy-preview-{PR}--{slug}.netlify.app`.
- **Git LFS** tracks `*.mp3 *.m4a *.wav *.mp4`. Never commit LFS **pointer stubs** (~133 B) in place
  of real media — the build's LFS gate fails the deploy. In sandboxes without LFS installed, audio
  shows as false "modified"; don't commit those.

## Validate & test
```bash
# Python contract validators (also run first inside build_and_check.sh and in CI)
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py

# Root static-regression tests (node:test). Use the *.test.mjs glob:
# `node --test tests/` wrongly recurses into tests/smoke/*.spec.js (Playwright, not installed at root).
node --test tests/*.test.mjs        # guarded in CI (build-test-validate); glob avoids tests/smoke/*.spec.js (Playwright)

# Playwright smoke suite (nav crawl · LFS integrity · visual regression)
cd tests/smoke && npm ci && npx playwright test
```
- CI (`.github/workflows/ci.yml`) runs on every PR: path-lint → media/topic_meta/longitudinal
  validators → build+QA gate (ms3 & res) → smoke tests. It mirrors Netlify, so breakage turns a PR
  red instead of only failing at deploy.
- **Visual baselines must be generated on Ubuntu/Chromium** (the CI runner), not a macOS laptop —
  regenerate via the "Refresh visual baselines" workflow_dispatch, not locally.

## Where things live
- `13_Faculty_Resources/_automation/site_build/` — the build pipeline: `build_deploy.py` (assembler),
  `build_and_check.sh` (build + gate), `check-static-site.mjs` (static QA), `site_manifest.json` (source→slug map).
- `site_manifest.json` is the **registry of shipped pages** (tools + content md). A new page must be
  registered here **and** in nav inside `build_deploy.py`, or the QA gate's orphaned-source check
  hard-fails the build.
- `NN_Category/` (00–14, 99) — curriculum **content source**, not build output. `14_Tracks/<audience>/`
  are link-only overlays; content never forks (see README).
- Root data + schemas: `question_bank.json`, `topic_meta.json`, `communication_cases.json`, etc. —
  each validates against its paired `*.schema.json`.
- `sp-proxy/` — serverless LLM patient for The Interview Room. **API key stays server-side; the browser
  holds only a passcode.** Run `sp-proxy/REDTEAM_CHECKLIST.md` after every deploy and every model/pack change.
- `docs/superpowers/{plans,specs}/` — dated design docs and implementation plans.

## Conventions & gotchas
- **localStorage keys must be namespaced `cw_*` (shared hub) or `rp_*` (resident).** The QA gate
  hard-fails any other prefix. Item-id collisions silently corrupt attestation (`cw_qbank_attest_v1`) and SRS state.
- **No hard-coded `/Users` or `/sessions` paths in tracked `.py`** — CI lints for this; derive from `__file__`.
- Clinical tools are **single-file HTML** (Clinical Warm palette, `clinical-warm.css`). Dose literals
  are banned in `rp-*` / `*-trainer` tools (QA gate).
- **No PHI.** Clinical content is synthetic / de-identified only; never commit patient identifiers to
  git-tracked files, memory, or scratch outputs.
