# Audit Remediation — Master Implementation Plan

> **For agentic workers:** This is the ORCHESTRATION doc. Each wave has its own task-level plan (bite-sized, TDD, no-placeholder) under `docs/superpowers/plans/`. Execute one wave-plan at a time with `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.

**Goal:** Remediate the findings in `FABLE_PLATFORM_AUDIT_2026-07-15.md` in small, reviewable, dependency-ordered PRs without regressing the live MS3 or resident sites.

**Source spec:** `FABLE_PLATFORM_AUDIT_2026-07-15.md` (repo root) — work packages WP-01…WP-18, findings table, sequencing.

**Architecture:** Static SPA built by Python (`build_deploy.py` → MS3; `resident_section.py` → resident) into `_build/ms3` and `_build/res`, published by Netlify build-on-push. A separate faculty-console Netlify site commits attestations directly to `main`. A separate `sp-proxy` Netlify site backs the LLM standardized-patient room. Remediation touches build scripts, tool HTML, CI YAML, and the faculty console — never the runtime data contracts (`cw_`/`rp_` keys, JSON shapes) unless a package says so explicitly.

**Tech stack:** HTML/vanilla JS + React UMD (vendored), Python 3.11 build, Node 20, Playwright 1.46.1 smoke tests, GitHub Actions CI, Netlify hosting, Git LFS for media.

## Global Constraints (apply to EVERY task)

- **No external CDN dependencies** — `check-static-site.mjs` hard-fails on any external `script src`/`link href`. Vendor everything.
- **localStorage keys stay `cw_*` (student) / `rp_*` (resident prototypes) only** — renaming any key is forbidden (hard-failed by the QA gate).
- **No dose literals in `rp_*` / `*-trainer` tools** — hard-failed by the QA gate.
- **Every served HTML keeps `<title>`, `<meta name=viewport>`, and the RC-META marker** — hard-failed by the QA gate.
- **No PHI, ever** — content is fictional composites only. Clinical-content changes are content-only PRs, faculty-attested, never mixed with code.
- **Dark-mode tokens must not regress** — accessibility fixes target light mode; re-check both themes.
- **Definition of done for any code task:** `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` AND `... res` both exit 0, plus the package's own test.

## Decision log

- **2026-07-15 — Keep serving un-attested draft qbank items (marked).** Confirmed by Dr. Moss. WP-02 therefore excludes **retired** items only; drafts remain served with their "Pending faculty review" badge. Do not gate the practice bank to attested-only.

---

## Wave breakdown & sequencing

Each wave is a self-contained, shippable plan. Merge order within a wave is noted; waves themselves are mostly parallel after Wave A lands.

### Wave A — Governance & Safety Spine  → `2026-07-15-wave-a-governance-safety-spine.md`
Small, high-impact, executable today. **Do first.**
- **WP-01** CI triggers on push to `main` (close the console→main→no-CI gap).
- **WP-02** Practice renderer excludes retired items (drafts kept + marked, per decision log).
- **WP-09** Baseline security headers via the build's `_headers` writer.
- *Merge order:* WP-01 first (so WP-02/WP-09 pushes are themselves CI-gated), then WP-02 and WP-09 in parallel.

### Wave B — Accessibility  → `2026-07-15-wave-b-accessibility.md` (to be written)
Parallelizable; mostly independent files.
- **WP-03** AA contrast tokens (light mode) → **blocks** WP-11.
- **WP-04** `aria-live` on scored surfaces.
- **WP-05** Skip-link + `<main>`/`<nav>` landmarks via the build polish pass → **feeds** WP-10.
- **WP-10** Touch targets ≥44px + `aria-pressed`/`aria-expanded`/`aria-current` (after WP-05).
- **WP-13** Media players + transcript/caption manifest.

### Wave C — Hardening & Maintainability  → `2026-07-15-wave-c-hardening.md` (to be written)
- **WP-07** Per-faculty attestation identity (faculty-console only).
- **WP-08** Schema-validate qbank + topic_meta in CI. *(Verified: current data already passes both schemas — no WP-16 prerequisite; do NOT add `additionalProperties:false` to `topic_meta.schema.json` or it fails on `epa`/`shelfBlueprint`.)*
- **WP-11** Extract light-mode "Clinical Warm" tokens to one stylesheet (after WP-03; visual-gated).
- **WP-12** Single-source nav (kill the duplicated Python `nav[]` arrays).

### Wave D — Hygiene, Docs & CI Polish  → `2026-07-15-wave-d-hygiene.md` (to be written)
- **WP-14** Wire or archive `quick-wins/` artifacts.
- **WP-15** Repo hygiene (archive superseded docs, remove orphans, refresh `STATUS_LATEST.md`).
- **WP-16** Reconcile blueprint/schema/exam-prep docs (144→192, COMAT/NBME, "50-item" claim).
- **WP-17** Lighthouse + a11y-lint budget in CI (after Wave B lands so baselines are clean).
- **WP-18** Wire orphan tests into CI.

### Parallel faculty track (not a code wave)  → `2026-07-15-clinical-harmonization-content.md` (to be written; content-only)
- **WP-06** Clozapine wording unify, 988 on suicide page + pocket card, MAOI washout, `qb_pha_011` correction + **re-attest**.
- Runs on Dr. Moss's timeline as a content-only PR. See the Faculty-Attestation Queue (§7 of the audit) for the full list of items needing sign-off.

---

## Dependency graph (text)

```
WP-01 ─► (gates all later direct-to-main pushes)
WP-02   (independent)
WP-09   (independent; verify CSP doesn't break SP proxy/iframe/audio)

WP-03 ─► WP-11         (tokens, then extract to stylesheet)
WP-05 ─► WP-10         (shell landmarks, then shell touch-targets)
WP-04, WP-13           (independent a11y)

WP-08                  (independent — current data already passes both schemas)
WP-07, WP-12           (independent)
WP-16                  (docs; pairs with WP-06)

WP-01 ─► WP-17, WP-18  (add push gate before tightening/adding CI jobs)
WP-14, WP-15           (hygiene; last)

WP-06 (content)        (own faculty timeline; merges independently, never with code)
```

**Safe to run concurrently (different agents, no shared files):** WP-01, WP-02, WP-09, WP-04, WP-07, WP-14.
**Strictly sequential:** WP-03→WP-11, WP-05→WP-10, WP-16→WP-08, WP-01→WP-17.

---

## Execution model

- **One wave-plan at a time.** Finish + merge Wave A before starting Wave B, so the CI-on-push gate protects every subsequent change.
- **Per PR:** branch off `main`, implement one work package, run the package test + `build_and_check.sh ms3 && ... res`, open a PR (CI runs), review, merge. Never mix a content change (WP-06/WP-16) with a code change.
- **Rollback:** Netlify → Deploys → last-known-good → "Publish deploy" (instant). Tag `main` before any governance-tooling change (`git tag pre-<wp> && git push --tags`).
- **After each merge:** confirm both live sites still render (home, one topic, qbank practice, dark mode toggle); for WP-09 also confirm SP room + iframe tools + audio.

See `FABLE_PLATFORM_AUDIT_2026-07-15.md` §8 (PR grouping) and §9 (deploy/rollback) for the full checklists.
