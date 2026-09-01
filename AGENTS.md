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
python3 -m pip install -r requirements.txt
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py

# Root static-regression tests (node:test). Scope to the *.test.mjs glob — tests/smoke/*.spec.js
# is a separate Playwright suite (own deps + CI job; not runnable from repo root).
node --test tests/*.test.mjs        # guarded in CI (build-test-validate)

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
- `13_Faculty_Resources/_automation/export_curriculum_review.py` → `docs/curriculum-review/`
  — assembles a complete human-readable transcript of everything each site ships (one set per
  audience) for external clinical review. Reads the **builds**, not the source tree, so it
  reflects nav order and audience scoping. Report-only; regenerate after building both sites.

## Conventions & gotchas
- **localStorage keys must be namespaced `cw_*` (shared hub) or `rp_*` (resident).** The QA gate
  hard-fails any other prefix. Item-id collisions silently corrupt attestation (`cw_qbank_attest_v1`) and SRS state.
- **No hard-coded `/Users` or `/sessions` paths in tracked `.py`** — CI lints for this; derive from `__file__`.
- Clinical tools are **single-file HTML** (Clinical Warm palette — build-injected from
  `13_Faculty_Resources/_automation/site_build/clinical-warm.css`). Dose literals
  are banned in `rp-*` / `*-trainer` tools (QA gate).
- **Crisis contacts (988 etc.) live in `crisis_resources.json` only.** Never hard-code a crisis
  number in a content page or tool. A page opts in with a `<!-- crisis-block -->` marker
  (`<!-- crisis-block-html -->` in tools); `site_build/crisis_block.py` renders it and
  `build_deploy.py` injects at build time, so `res` inherits it via `resident_section.py`.
  Dropping the marker from a required safety surface **hard-fails the build**. Scope rule for
  adding a surface: the learner must plausibly be *doing* risk work there (assessing, rehearsing,
  or planning disposition) — not merely reading a page that mentions suicide. Data is derived
  from the ReConnect crisis dataset and independently re-verified — refresh with
  `_automation/sync_crisis_from_reconnect.py --reconnect <path>` (dev-only, report-only; never
  runs on Netlify).
- **No PHI.** Clinical content is synthetic / de-identified only; never commit patient identifiers to
  git-tracked files, memory, or scratch outputs.
- **Every claim the library makes about a paper needs that paper's own words.**
  `evidence_annotations.json` stores a verbatim `sourceSpan` per source and
  `_automation/validate_evidence_annotations.py` gates it (CI + `bin/verify.sh`). If you add or edit
  a sentence asserting what a source found, add or update its span in the same change. **Read the
  results section, not the title or the conclusion** — a 2026-08-21 pass found 54% of annotations
  needed amendment and 7 said close to the opposite of the paper, all written from titles. `C5`
  rejects a positively-voiced claim licensed by a null/negative span; the fix is to rewrite the
  claim to match the paper, never to trim the span. Note the gate verifies the *stored* claim, not
  page prose — keep the two saying the same thing yourself.
- **Adding a step to `ci.yml` trips three separate contracts.** `bin/check-verify-coverage.py`
  (mirror it in `bin/verify.sh` or justify an `ALLOWED` exemption);
  `_automation/maintenance/validate_scheduled_workflows.py`, which pins the workflow by **exact step
  inventory *and* a sha256 of the whole file** — recompute that digest by importing the validator's
  own `_load`/`_contract_digest` rather than reimplementing its canonicalisation; and
  `_automation/test_validate_registry_schemas.py`'s `PAIRS` tuple if you added a root registry.
- **A red node test silently aborts the build.** `build_and_check.sh` is `set -euo pipefail` and runs
  `node --test tests/*.test.mjs` *before* `build_deploy.py`, so a failing contract test exits early
  and `_build/` keeps serving **stale output** while the script merely looks "failed". If a source
  edit isn't showing up in the built site, run the node suite first.
- **THE LIBRARY TEACHES ADMINISTRATION; IT DOES NOT REPRODUCE INSTRUMENTS.** Same standing as the
  dose-literal rule. Teach *how to give* an instrument — the elicitation, the confounds, what the
  score does and does not license, what a negative result fails to rule out — and link to the
  official form. Do **not** ship the instrument itself: no verbatim item stems, no verbatim anchor
  ladders, no reproduced field labels, and no tool that functions as a fillable copy of a
  copyrighted form. "Programming the form" counts as reproduction even when no text is copied —
  the Stanley-Brown Safety Plan's terms name it explicitly, which is why the safety-planning work
  (WP-06R-b) is a *rehearsal* tool and reproduces nothing.
  Scope is a governance decision, not an agent decision: if a WP asks you to add verbatim item or
  anchor text, **stop and ask** rather than inferring that a particular instrument is exempt.
  **Resolved 2026-08-23 — Option A: the rule covers copyrighted instruments only** (#391). C-SSRS
  retires (WP-06R-a); Stanley-Brown is never programmed (WP-06R-b); PHQ-9/GAD-7 provisionally stay
  pending a check of the current permission footer (WP-02c); **BFCRS is RESTRICTED** (URMC written
  consent required) and **CIWA-Ar RETIRES** (2026-08-28, author's call — rights unestablishable, so
  the descriptors came down; WP-20 is closed with it). **COWS alone remains open**: permission real,
  scope wrong, its 45 verbatim anchors in `withdrawal.html` published under a recorded interim
  waiver pending the Taylor & Francis letter — that waiver is the one thing still blocking Wave 4,
  and an agent must not narrow or lift it. An instrument is exempt only once its status is recorded
  in the audit's decision table — Option A settles scope, not individual cases.
  Audit and current disposition: `docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md`.
