# 2026-08-01 Audit Remediation — Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every confirmed finding of the 2026-08-01 codebase audit (8-dimension multi-agent audit, adversarially verified) through five independently executable workstream plans, in an order that protects clinical safety first and rebases cheapest.

**Architecture:** One master plan (this file) owns sequencing, the decision register, and the cross-workstream conflict map. Five workstream plans own the tasks; each is self-contained, bite-sized, TDD, and batched into PR-sized units with explicit PR boundaries. Every batch lands via feature branch + PR (main is protected; required checks: build-test-validate + smoke).

**Tech Stack:** Python 3.11 build pipeline (`site_build/`, post-#264 `common.py`), Node 20 ESM (`node:test`, Netlify Functions v2), Playwright smoke suite (CI-only on this hardware), GitHub Actions, GitHub REST API.

## Global Constraints

- main is branch-protected (GH006 on direct push): feature branch + `gh pr create`, merge only with build-test-validate + smoke green.
- Editing CLAUDE.md requires `cp CLAUDE.md AGENTS.md` in the same commit (CI byte-parity gate).
- `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `... res` must pass before any PR that touches build inputs.
- Playwright hangs locally on this macOS — verify smoke via CI only. Visual baselines regenerate ONLY via the "Refresh visual baselines" workflow_dispatch.
- No PHI. Crisis contacts only via `crisis_resources.json` markers. localStorage keys `cw_*`/`rp_*` only.
- Any edit to `_prototypes/sp-interview/sp-interview.html` or the pack requires `node _prototypes/sp-interview/generate-preview.mjs --write`.

## The five workstream plans

| Plan | Covers | Size |
|---|---|---|
| [WS1 — Governance spine](2026-08-01-audit-remediation-ws1-governance-spine.md) | Faculty-console write path under branch protection (attest/inbox + auto-merge PR), streamline-branch rescue, SP rate limiting + spend attribution, red-team receipt, APIFY token header, crawled-title sanitizer | 5 batches |
| [WS2 — Review throughput](2026-08-01-audit-remediation-ws2-review-throughput.md) | Faculty attestation sessions A–D (safety surfaces → sim registries → CotW → qbank drafts), reviewBadge fix, SP pack-level flip, qb_pha_017 authoring, id-prefix pinning | 4 sessions + tooling batches |
| [WS3 — Learning loop](2026-08-01-audit-remediation-ws3-learning-loop.md) | Honest "Due today", seedSRS phantom-card guard + migration, canonical SM-2 (build-injected from common.py) + behavioral tests, `cw_practice_events_v1` practice→mastery contract + per-sim adapters, retrieval-pattern spread | 7 batches |
| [WS4 — Pipeline safety](2026-08-01-audit-remediation-ws4-pipeline-safety.md) | Resident derivation fail-closed (reproduced repro as the test), crisis-block symmetry for the res pipeline, QA-gate shell coverage, dark-mode literal fixes + gate, SPA route announcement + toggle ARIA, light-token single-sourcing, byte-reproducible build, nav-as-data | 6 batches |
| [WS5 — Ops signal](2026-08-01-audit-remediation-ws5-ops-signal.md) | Surveillance dedup regex + lychee self-crawl fix, issue-board close-out, root-doc archive (20 files), repo cruft (quick-wins, snapshot, .apkg→LFS, OE-audio relocation with fail-closed guard), Playwright toolchain alignment, node suites in the Netlify gate, run-all.sh completeness guard, Anki + tools suites in CI, branch sweep | 8 batches |

Where a workstream plan and the audit text disagree, **the plan wins** — each plan re-verified its premises against origin/main `817ef90` and recorded deltas in its header (notably: sub-44px touch targets already fixed by #279; SP per-case attestation already exists in the pack; both FDA URLs now return 200; `.apkg` cannot be gitignored because Netlify ships the committed files as the fail-soft fallback).

## Decision register (all [JOSH] gates, consolidated)

Every decision has a recommendation; an executor proceeds on a decision ONLY after Josh confirms it in-session. Defaults are what the plans implement.

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Console write path: (a) attest/inbox branch + rolling auto-merge PR vs (b) ruleset + GitHub-App bypass | **(a)** — keeps CI on every learner-facing publish | WS1 Batch 5 |
| D2 | Push `codex/faculty-attestation-streamline` + land it before #263 | **Yes, both** (merge cost verified: one README hunk, 385/385 tests) | WS1 Batch 1; WS5 Task 15 sweep |
| D3 | Run REDTEAM_CHECKLIST A–E live for Dana/Marcus/Ray | **This week** — section B (SI-gating) on Marcus/Ray is the unverified clinical core | WS1 Task 11 receipt; D5 |
| D4 | Attest rp-agitation/rp-brief-psych with LOCAL_POLICY placeholders | **Yes** — placeholder framing is safe teaching content; real Sanford values are separate work | WS2 Session A |
| D5 | Flip SP pack to pack-level `reviewed` | **Yes, after D3 receipt + golden-transcript spot-check** | WS2 Task 14 |
| D6 | Qbank attestation scope: all 48 drafts in one sitting vs tiers | **One sitting (~2–3 h)**; tier 1–2 subset (~30 min) restores both blueprint gaps if splitting | WS2 Session D |
| D7 | Accept review.html SM-2 migration behavior change (first-Good 1d, first-Easy 4d, no reps reset) | **Accept** — small, conservative, buys one tested canonical grader | WS3 Batch 2 |
| D8 | Resident crisis-block required surfaces | **rp-agitation.html + cl_reference.md** (start rp-agitation-only if in doubt) | WS4 Task 7 |
| D9 | Canonical light text palette | **Majority #3b332c/#64574b** (smallest diff; reversible in one line) | WS4 Batch 5 |
| D10 | Issue-board close-out batch as written (#98–#107 close, #108 rescope, #232 retitle, dup closes) | **Approve** — every closure carries re-verified file:line evidence | WS5 Batch 8 |
| D11 | Add `*.apkg` to `GIT_LFS_FETCH_INCLUDE` on both Netlify sites (dashboard) | **Yes** (2 min/site); if declined, skip WS5 Task 11 | WS5 Batch 6 |
| D12 | Branch sweep: delete 30 verified local branches + 6 merged worktrees | **Approve** — runs only after D2 push; keep-list preserves parked work | WS5 Task 15 |
| D13 | Family retrieval prompts review depth | **PR-diff wording review** (no re-attestation event implied) | WS3 Task 14 |

**Workstream-local decision ids → this register.** The five plans were drafted with their own decision names; resolve them as: WS1 `attest-write-path-option`→D1, `streamline-push-and-sequencing`→D2, `redteam-live-run`→D3 · WS2 `rp-local-policy`→D4, `sp-pack-attestation`→D5, `qbank-session-scope`→D6 · WS3 `review-schedule-migration`→D7, `family-retrieval-prompt-wording`→D13, `one-patient-263-sequencing`→ not a decision: it is the Phase 3 rule (#263 rebases and lands last; WS3 lands first) · WS4 `d1-resident-crisis-surfaces`→D8, `d2-canonical-light-text`→**D9 (not master D2)** · WS5 `issue-board-closeout`→D10, `netlify-lfs-apkg-env`→D11, `branch-sweep-approval`→D12.

## Global landing order

**Phase 0 — land the open PRs (they are prerequisites, not remediation):**
- [ ] Merge #284 (serve drafts labelled) — WS2/WS3/WS4 tasks are written against its `question-bank-practice.html`.
- [ ] Merge #280 then #281 (clozapine/MAOI content + fixture; #280 needs faculty attestation per its title).

**Phase 1 — urgent + unblocking (parallel-safe, all small):**
- [ ] WS5 Batch 1 (surveillance dedup fix) — **must merge before the 2026-08-03 weekly link-monitor run** or a fourth duplicate issue set is filed.
- [ ] WS1 Batch 1 (streamline rescue) — gated on D2; before #263 and before WS1 Batch 5.
- [ ] WS4 Batches 1–2 (resident fail-closed + crisis symmetry) — highest clinical-safety code fix.
- [ ] WS3 Batch 1 (honest Due-today) — smallest learner-trust fix.
- [ ] WS1 Batch 3 (Task 9 recorder script first, then D3 red-team run, then Task 11 receipt) — clinical-safety verification of live personas.

**Phase 2 — the broad middle (order between workstream groups is free; intra-workstream orderings stated in each plan still bind):**
- [ ] WS1 Batches 2 and 4 (rate limiting, spend log, APIFY header, title sanitizer).
- [ ] WS5 Batches 2–7 (toolchain, CI wiring, root-doc archive, cruft, OE-audio move).
- [ ] WS4 Batches 3–5 (dark mode + gate, shell a11y, light-token single-sourcing).
- [ ] WS3 Batches 2–7 (canonical SM-2 → practice events → adapters → retrieval spread).
- [ ] WS2 Sessions A–D + tooling (PR-fallback attestation flow until WS1 Batch 5 lands).

**Phase 3 — big refactors and close-out (strictly last):**
- [ ] WS1 Batch 5 (attest/inbox write path) — after streamline (same files).
- [ ] WS4 Batch 6 (nav-as-data) — after WS4 Batch 1 (uses byte-reproducible diff as its proof instrument).
- [ ] WS5 Batch 8 (issue close-out; owns the #108 rescope — gated on WS5 Batch 1 AND WS1 Batch 4 (title sanitizer) both merged, since the sanitizer is what completes #108's injection half) + Task 15 (branch sweep, after D2 push).
- [ ] #263: rebase over everything, split per WS1 Task 5's comment (validator/schema half vs console-UI half), fix its real failing SP test, un-draft, land **last**.

## Cross-workstream conflict map

Files touched by more than one in-flight effort; whoever lands second rebases:

| File | Touched by | Note |
|---|---|---|
| `spa_index.html` | WS3 (:555, :1125, :1334–1394, :1487) · WS4 (route live-region, modetoggle ARIA, :root palette) · #263 | Disjoint regions — rebases are trivial; land in any order |
| `question-bank-practice.html` | #284 (rewrite) · WS3 Batches 2–3 · WS4 Batches 3+5 | Everything re-anchors AFTER #284 merges |
| `common.py` | WS3 (SM-2 snippet injection) · WS4 (polish extensions, sorted synonyms) | Coordinate: both extend `apply_full_page_pass` |
| `check-static-site.mjs` | WS4 (shell scans, light-literal + drift gates) | Single workstream, multiple batches — same-file batches noted in WS4 |
| `faculty-console/*` | streamline branch · WS1 Batch 5 · #263 | Strict order: streamline → WS1 Batch 5 → #263 |
| `reviewed.json` | WS2 sessions · #263 | WS2's small PRs land promptly; #263 rebases |
| `ci.yml` | WS1 Batch 4 · WS5 Batches 3–4 · #263 | Small adjacent hunks; WS5 Batch 2 edits the neighboring ci-build-contract test; #263 rebases last |
| `resident_section.py` | WS4 Batches 1–2 · #263 | WS4 first |
| `sp-interview.html` + `sp-interview.preview.html` | WS2 Task 14 · WS3 Task 12 | Whoever lands second re-runs `generate-preview.mjs --write` after rebase — **never hand-merge the generated preview** |
| `family-systems-practice.html` | WS2 Task 1 (badge :247) · WS3 Tasks 3/6 (SM-2 marker, due-first) | Disjoint regions; text-anchored, land in any order |
| `communication-practice.html` | WS3 adapter · WS4 Batch 3 (dark-mode literals) | Disjoint regions |
| `review.html` | WS3 Batch 2 (SM-2 marker) · WS4 Batch 5 (light tokens) | Disjoint regions |
| `diagnostic-reasoning.html` | WS3 (adapter, retrieval mode) · WS4 Batch 5 (light tokens) | Disjoint regions |
| `learning-path.html` | WS3 Batch 1 (srsDue) · WS4 Batch 3 (dark-mode `.dx`) | Disjoint regions |
| `build_deploy.py` | WS4 Batches 1/6 · WS5 Batch 6 (OE-audio move) · #263 | Text-anchored; nav refactor (WS4 Batch 6) lands last of these |
| `rp-agitation.html` | WS2 Session A (attestation) · WS4 Task 7 (crisis marker) | Attestation is registry-side; marker is source-side — no textual conflict, but re-run smoke in CI after each |
| `test_common.py` | WS4 multiple batches (append at same anchor) | Same-file appends — land WS4 batches in their stated order |

## Verification protocol (applies to every batch)

- [ ] Task-level: the plan's own failing-test-first steps, run with the exact commands given.
- [ ] Batch-level, before `gh pr create`: `node --test tests/*.test.mjs` → **0 failures** (pass count grows as batches land — 379 at tip 817ef90, 385 once streamline merges; never treat a literal count as the gate), the python validators, and both build gates if build inputs changed.
- [ ] PR-level: both required checks green in CI; smoke verified in CI only (never locally).
- [ ] After any pack/sp-interview edit: `node _prototypes/sp-interview/generate-preview.mjs --check` passes.

## Risk register

- **The 2026-08-03 link-monitor run** files a new duplicate issue set if WS5 Batch 1 misses the window (cosmetic, but re-dirties the board mid-cleanup).
- **#263 decay:** every phase-2 merge widens its rebase. Mitigated by the split recommendation and by landing it last, once, rather than rebasing continuously.
- **Attestation ↔ smoke coupling:** attesting personas/scenarios changes card counts; interview-room specs already use scoped `caseCard()` helpers, but WS2's session tasks re-run the smoke suite in CI before merge for exactly this reason.
- **Two-writer stores:** WS3 changes SRS scheduling while WS2 changes which items are served; both are keyed by stable item ids, and neither rewrites existing `cw_srs_v1` cards outside the explicit phantom-card migration (WS3 Batch 1).
