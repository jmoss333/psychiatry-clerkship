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
- **Two sites, one repo.** Build command and publish dir are set **per-site in the Netlify UI**, not
  in `netlify.toml` (kept intentionally minimal — one toml can't express two sites, and it's read
  *after* the clone). The legacy `GIT_LFS_ENABLED` / `GIT_LFS_FETCH_INCLUDE` env vars also live
  there and are being **retired** (next bullet but one). See `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`.
- Deploy-on-push to `main`. Deploy previews: `https://deploy-preview-{PR}--{slug}.netlify.app`.
- **Git LFS** tracks `*.mp3 *.m4a *.wav *.mp4`. Never commit LFS **pointer stubs** (~133 B) in place
  of real media — the build's LFS gate fails the deploy. In sandboxes without LFS installed, audio
  shows as false "modified"; don't commit those.
- **LFS bandwidth is metered per GitHub account (10 GB/mo).** If *every* production deploy of both
  sites fails the LFS gate while previews and CI stay green and nothing changed, it is the quota,
  not the code (2026-08-30 outage) — see `site_build/NETLIFY_LFS_RUNBOOK.md` "Incident pattern 2".
  `site_build/lfs_pull_cached.sh` pulls media inside the build from Netlify's persistent cache so
  a merge costs ~0 MB; it only takes effect once `GIT_LFS_ENABLED` is removed from the site's UI.

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

# THE one-command local gate. Runs everything CI runs plus checks CI does not have
# (span audit, qbank coherence). ~90s+ — background it to a log and poll. This is what the
# pre-push hook runs, so a red verify.sh blocks every push from the Mac.
bash bin/verify.sh            # --quick for the fast subset

# Playwright smoke suite (nav crawl · LFS integrity · visual regression)
cd tests/smoke && npm ci && npx playwright test
```
- CI (`.github/workflows/ci.yml`) runs on every PR: path-lint → media/topic_meta/longitudinal
  validators → build+QA gate (ms3 & res) → smoke tests. It mirrors Netlify, so breakage turns a PR
  red instead of only failing at deploy.
- `bin/verify.sh` is a **superset** of `ci.yml`, not a mirror: `bin/check-verify-coverage.py`
  enforces that every CI step has a local equivalent (or a recorded `ALLOWED` exemption), but
  verify.sh may run more. `bin/verify_spans.py` and `bin/check_qbank_coherence.py` run there and
  not in CI — and both **exit 0 even when they flag rows**, so they surface findings at push time
  without blocking. Read their output; a PASS line is not "nothing found".
- **A local gate failing while CI is green usually means bash 3.2**, not your change: the Mac's
  `/bin/bash` is 3.2.57 and CI's is >= 4.4. Under `set -u`, bash < 4.4 treats `"${ARR[@]}"` on an
  empty array as unbound and aborts with an empty message (PR #469). Write
  `${ARR[@]+"${ARR[@]}"}`. Prove whose fault it is by running the failing gate on clean `main`
  before reaching for `--no-verify` (which is never the answer).
- **Visual baselines must be generated on Ubuntu/Chromium** (the CI runner), not a macOS laptop —
  regenerate via the "Refresh visual baselines" workflow_dispatch, not locally.

## Where things live
- `13_Faculty_Resources/_automation/site_build/` — the build pipeline: `build_deploy.py` (assembler),
  `build_and_check.sh` (build + gate), `check-static-site.mjs` (static QA), `site_manifest.json` (source→slug map).
- `site_manifest.json` is the registry of **hand-registered** shipped pages (tools + content md). A
  new page must be registered here **and** in nav inside `build_deploy.py`, or the QA gate's
  orphaned-source check hard-fails the build. **It is not the only source of what ships**: Case-of-
  the-Week pages are appended at build time from
  `08_Cases_and_Simulation/case-of-the-week/cotw_registry.json` (`_cotw_slug()` in `build_deploy.py`
  and `resident_section.py`). Anything that needs "the set of shipped pages" must use
  `faculty-console/content-universe.mjs` (JS) or `validate_attestation_consistency.py`'s
  `cotw_built_slugs()` (Python) — never the manifest alone. See the gotcha below.
- `NN_Category/` (00–14, 99) — curriculum **content source**, not build output. `14_Tracks/<audience>/`
  are link-only overlays; content never forks (see README).
- Root data + schemas: `question_bank.json`, `topic_meta.json`, `communication_cases.json`, etc. —
  each validates against its paired `*.schema.json`.
- `sp-proxy/` — serverless LLM patient for The Interview Room. **API key stays server-side; the browser
  holds only a passcode.** Run `sp-proxy/REDTEAM_CHECKLIST.md` after every deploy and every model/pack change.
- `.claude/agents/` — project subagents (`evidence-verifier`, `deploy-verifier`). The frontmatter
  tool allowlist is the enforcement; `tests/agent-definitions.test.mjs` pins each agent's scope.
  **`deploy-verifier` cannot reach `*.netlify.app` from a sandboxed web session** — the egress
  proxy answers `403` to the `CONNECT`, so its whole HTTP runbook is unrunnable there. It falls
  back to Netlify's deploy record (read-only, keyed by the `siteId` already in
  `maintenance_config.json`) and reports `DEPLOY VERIFIED · CONTENT UNVERIFIED`: a `ready`
  **production** deploy proves the build's Git-LFS gate passed, and proves nothing about served
  content. The inference does not carry to a preview — `check_lfs_media.py`'s `is_soft_context()`
  is true on `deploy-preview`, so a preview reaches `ready` with pointer stubs in it. Run it from a
  machine with real egress when you need the content half.
- `.claude/settings.json` + `.claude/hooks/` — session hooks that enforce the rules below at edit
  time: crisis contacts, dose literals, localStorage namespaces, machine paths (deny); PHI and
  instrument item text (ask); LFS phantoms on `git add` (deny); registry validators, workflow
  digest, and AGENTS.md sync after an edit; a quick gate at stop. `bin/install-hooks.sh` installs
  the matching **pre-commit** gate for hand edits. The tool hooks (PreToolUse/PostToolUse) also
  fire for a subagent's tool calls; SessionStart and Stop are session-level. A subagent's tool
  allowlist is still its primary enforcement. `tests/hooks.test.mjs` drives every hook.
- `bin/` — the audit tools that find the defect classes **no schema or gate can see**, because
  each item is individually valid and the corpus is jointly wrong. `sweep_unlicensed_claims.py`
  (specific assertion, no attribution in range — report-only; calibrate before quoting a count),
  `verify_spans.py` (every sentence of a stored `sourceSpan` must appear verbatim in the paper —
  the validators check claim-vs-span, this checks span-vs-paper), `check_qbank_coherence.py`
  (two question-bank items that teach different steps for the same scenario),
  `check_instrument_links.py` (dev-only; the recorded instrument routes still resolve —
  deliberately not in CI, external links are flaky and the build egress blocks those hosts).
- `docs/curriculum-review/findings/` — the review→remediation loop. `export_curriculum_review.py`
  produces the transcripts, a review pass writes `findings.json` (id · verbatim `quote` ·
  ready-to-paste `replacement` · `verification`), and remediation lands as small per-work-package
  PRs. **`rejected.json` is a do-not-apply list** — each entry records why the page was right.
  Findings point at transcripts; you fix **sources** (never hand-edit `docs/curriculum-review/`).
  Completion check for a claimed fix: grep its verbatim `quote` in the regenerated transcript —
  it must be gone. Still present = you edited the wrong audience's source.
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
- **Every page that ships must be attestable, and "what ships" is ONE derived file.**
  `13_Faculty_Resources/_automation/site_build/shipped_pages.json` is generated by
  `site_build/shipped_pages.py` from every producer (`site_manifest.json`, `cotw_registry.json`,
  and the `site_extras.py` lists the two build scripts copy), and `build_and_check.sh` verifies it
  against the **real build output** on every build. **Read it — do not read the producers.**
  Python: `load_shipped_pages()` in `shipped_pages.py`. JS: `deriveContentUniverse()` in
  `faculty-console/content-universe.mjs`. See `site_build/ADR-002-shipped-pages-single-source.md`.
  Why: from 2026-07-09 to 2026-09-04 the faculty console (`clerkship-faculty-attest.netlify.app`)
  built its review queue from `site_manifest.json` alone while COTW pages shipped from
  `cotw_registry.json`; 22 pending case pages never appeared under "Needs review" and nobody
  noticed, because the console showed *something* (questions). #517 taught the console the second
  source; ADR-002 found there were five producers in total and replaced remembering them with a
  derivation the build checks. Rules that follow:
  (1) a new route that puts a page on a learner site is a new **producer** — add it to
  `site_extras.py` and to `shipped_pages.py`'s `derive()`, and regenerate with
  `python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --write`; until you do,
  `--check-build` fails the build and names the slug;
  (2) do not add a direct read of `site_manifest.json`/`cotw_registry.json` to new code —
  `tests/shipped-pages-readers.test.mjs` freezes the remaining direct readers and that list may
  only shrink;
  (3) never "fix" a red `check_pending_visible` by adding a slug to `NOT_REVIEWABLE_IN_CONSOLE` —
  that list is only for items **not deployed on any learner site**, and it is empty today: the two
  `_prototypes/` tools that used to sit on it turned out to ship on the resident site all along,
  which is what deriving the universe from the build surfaced;
  (4) if you edit a producer, regenerate — a stale `shipped_pages.json` fails `--check` in CI, in
  `bin/verify.sh`, in the build, and in the post-edit hook;
  (5) when a faculty-facing surface shows a partial list, treat "partial" as a bug signal, not a
  filter — compare its count against `reviewed.json` before assuming it is right (today: 123).
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
  **A withdrawal must leave a route (INV-IR2, 2026-09-03).** Retiring an instrument may not leave
  a dead end: every removed or link-only instrument ships the custodian's official `formUrl` from
  `instrument_rights.json`, and `site_build/instrument-rights-gate.mjs` fails the build when a
  pinned page drops it or points at a copy hosted here. `bin/check_instrument_links.py` re-checks
  the far end by hand; it is not a gate.
  Audit and current disposition: `docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md`.
