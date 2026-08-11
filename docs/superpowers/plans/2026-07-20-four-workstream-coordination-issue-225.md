# Four-Workstream Coordination Package — Issue #225 (pack-driven debrief crit-card)

> **For agentic workers:** This is a *coordination* document, not the implementation plan.
> WS1's first gated deliverable is a full implementation plan authored with
> superpowers:writing-plans (complete code, TDD steps) before any source edit.

**Coordinator:** Claude (session 2026-07-20, worktree `skill-creator-brainstorm-43dbe0`,
branch `claude/psychiatry-repo-coordination-d17162`)

**Anchor change:** Issue #225 — *SP Interview: pack-drive per-case rehearse/reframe for
debrief crit-card (Ray & future non-SI cases)*.

**Why this anchor (verified 2026-07-20):**
- #104 (home metric) and #232's top item (reclaim reachability) are **already fixed on
  main** (`FABLE_PLATFORM_AUDIT_2026-07-15.md` method note; commit `b531088` = PR #233)
  despite both issues showing OPEN. Board is stale; do not dispatch against them.
- #225 is confirmed unimplemented: `_prototypes/sp-interview/sp-interview.html:1058-1076`
  still hard-codes the `isSI` gate with inline SI rehearse/ref/myth strings; non-SI cases
  (Ray, `c_command`) receive no crit-card coaching. No commit references #225's scope.
- It is small, bounded (debrief view + pack schema), contains no dose literals, and voice
  remains disabled — "smallest safe change" that still exercises all four workstreams.

**Scope guard:** Voice enablement (#232 remainder) and pg_suicide content edits are OUT of
scope. The SI coaching text migrates into packs **byte-for-byte verbatim** or stays in code.

---

## 1. Workstream assignments

### WS1 — Implementation
- **Agent:** general-purpose, worktree isolation.
- **Scope:** Add optional per-critical-item crit-card fields to the case-pack contract
  (rehearse lines, reference pointer, myth-buster line, heading variant); render the
  debrief crit-card from pack data when present; fall back to current behavior when
  absent. Migrate existing SI text (Dana/Marcus) verbatim; author Ray's `c_command`
  coaching entry as **draft-flagged for clinician review** — WS1 must not invent final
  clinical coaching language.
- **Files:** `_prototypes/sp-interview/sp-interview.html` (crit-card render, ~1058-1076),
  case pack files, `sp-interview.preview.html` (regenerate via canonical transform),
  pack schema/governance if the contract is typed.
- **Constraints (landmines from prior sessions):**
  - Preserve the `isSI` separation: `si_direct` → SI coaching; Ray gets command-hallucination
    coaching, never SI coaching.
  - `hiddenAgendaToneOnly` sources `caseDef.hiddenAgendaTone`, **not** `hiddenAgenda`.
  - Keep the parity-scenario union intact.
  - Preview regeneration is not just html+pack: also `useState('live')→('mock')`,
    endpoint prefill → `''`, drop auto-settings.
  - Model pin stays `claude-haiku-4-5-20251001`.
- **Deliverable:** implementation plan (gated) → minimal diff → green local suites.

### WS2 — Testing
- **Agent:** general-purpose, worktree isolation. Two phases.
- **Phase A (parallel with WS1, spec-only — before reading the implementation):**
  regression inventory from issue #225 + current source: SI crit-card must render
  unchanged for Dana/Marcus; Ray must gain a card without SI text; pack-absent cases
  fall back cleanly; preview mock-mode parity holds.
- **Phase B (after WS1 diff):** unit tests (`sp-proxy/tests/` node:test conventions +
  root `tests/*.test.mjs`), pack-governance cases in the style of
  `sp-proxy/tests/sp-pack-governance.test.mjs`, and Playwright coverage in
  `tests/smoke/interview-room.spec.js`.
- **Required adverse-content scenarios:** malformed pack (crit-card field wrong type /
  truncated), missing pack fields (fallback path), stale pack (schema-version mismatch or
  pre-#225 pack against new renderer). At least one Phase-B test must FAIL against
  pre-WS1 main to prove regression teeth.
- **Constraint:** no visual-baseline regeneration locally — Ubuntu/Chromium
  workflow_dispatch only.

### WS3 — Clinical-content review (read-only; no edits)
- **Agent:** claude (clinical rubric), no branch.
- **Input:** WS1's diff only. **Output:** findings report; every finding cites file+line
  and the affected source claim; no rewrites proposed inline.
- **Rubric:** (a) unsupported claims in any new Ray coaching text; (b) lost qualifiers in
  migrated SI lines (e.g., the myth-buster "Asking doesn't plant the thought…" must
  survive byte-identical); (c) population mismatch (MS3 vs resident overlay routing);
  (d) medication guidance — should be none; any dose literal in `rp-*`/`*-trainer`
  surfaces is an automatic block; (e) crisis language — SI coaching reachable only for
  `si_direct` items, 988-consistent framing; (f) PHI — packs stay fully synthetic.
- **Escalation:** anything in categories (d)/(e)/(f) goes to Josh, never self-resolved.

### WS4 — Browser verification
- **Agent:** general-purpose with in-app Browser tools; runs on the integration branch.
- **Local:** `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3`
  and `… res`; serve `_build/*` statically; drive the Interview Room debrief for
  Dana/Marcus (SI card) and Ray (command-hallucination card) plus `preview.html` mock mode.
- **Matrix:** desktop (1280×800) + mobile (375×812), both sites. Checks: zero console
  errors, no network failures (media must return real bytes, not ~133 B LFS stubs),
  heading hierarchy, control labels, focus order through the debrief step-out, loading
  states (transcript/debrief), empty states (fresh `cw_*`/`rp_*` localStorage, pack-absent
  case).
- **Deploy previews (after PR opens):**
  `https://deploy-preview-{PR}--une-ms3-psychiatry.netlify.app` and
  `https://deploy-preview-{PR}--mmc-psychiatry-residents-sanford.netlify.app`.

---

## 2. Branches & worktrees

| WS | Branch | Worktree | Cut from |
|---|---|---|---|
| WS1 | `claude/ws1-impl-225-pack-critcard` | `.claude/worktrees/ws1-impl-225-pack-critcard` | `main` (4029da7+) |
| WS2 | `claude/ws2-tests-225-pack-critcard` | `.claude/worktrees/ws2-tests-225-pack-critcard` | `main` (Phase A); rebase onto WS1 for Phase B |
| WS3 | *(none — read-only)* | *(none; reviews WS1 diff)* | n/a |
| WS4 | *(none — verifies)* | `.claude/worktrees/ws4-browser-225` on the integration branch | WS1 branch post-integration |

Integration branch = WS1's branch; WS2 merges into it before the PR. This repo is **not**
covered by the nightly worktree sweep (RPS + therapy-match only) — remove worktrees
manually with `git worktree remove` after merge.

Kickoff (per workstream): `git worktree add .claude/worktrees/<name> -b <branch> main`

---

## 3. Dependencies

```
WS2 Phase A (spec-only regression inventory) ──┐
WS1 implementation plan → gated review → diff ─┼→ WS2 Phase B (tests vs diff)
                                               ├→ WS3 (diff review)      ─┐
WS1+WS2 integrated on WS1 branch → PR opened ──┼→ WS4 local verification ─┼→ merge gate
                                               └→ WS4 deploy previews    ─┘
```
- Truly parallel: WS1 ∥ WS2-Phase-A; then WS3 ∥ WS4 after the diff exists.
- WS2 Phase A's inventory feeds WS1 (what not to break) — deliver it to WS1 before
  WS1 finalizes its diff.
- Sequencing note (dispatching-parallel-agents): these are staged-parallel, not four-way
  independent — WS3/WS4 cannot start meaningfully before a diff exists.

---

## 4. Definition of done

**WS1:** minimal diff; SI text migration byte-identical (verify with `diff` against
extracted strings); Ray entry flagged `draft` pending clinician sign-off; preview.html
regenerated via canonical transform; all local suites green
(`validate_registry_schemas.py`, `validate_topic_meta.py`,
`validate_attestation_consistency.py`, `node --test tests/*.test.mjs`,
`sp-proxy` tests, `build_and_check.sh ms3` + `res`); CLAUDE.md untouched (or
`cp CLAUDE.md AGENTS.md` re-run).

**WS2:** Phase-A inventory delivered before WS1 freeze; ≥1 Phase-B test red on pre-WS1
main and green post-WS1; malformed/missing/stale pack scenarios all covered;
`tests/smoke` passes on Chromium; no local baseline regeneration.

**WS3:** signed report covering all six rubric categories; zero PHI; every crisis-language
and (if any) medication finding either cleared with cited source or escalated to Josh;
explicit verdict on the verbatim-migration check.

**WS4:** zero console errors and zero failed requests across the matrix (2 sites × 2
viewports × 3 cases + empty/fallback states); focus order and labels pass on the debrief
flow; LFS media integrity confirmed; deploy previews spot-checked on both sites;
evidence (screenshots + console/network logs) attached to the PR.

**Overall:** single PR to `main`; CI fully green (path-lint → validators → build+QA both
sites → smoke); WS3 report and WS4 evidence attached as PR comments; Josh has signed off
on Ray's coaching text and the SI-migration verdict.

---

## 5. Conflicts requiring human review (Josh)

1. **Ray's `c_command` coaching language** — net-new clinical crisis-adjacent text.
   Agents draft; only Josh approves the final wording.
2. **SI text relocation itself** — even a verbatim move of suicide-related coaching from
   code to data changes where clinical language lives and who can edit it (packs are
   easier to touch than renderer code). Policy call, not an engineering call.
3. **Stale issue board** — #104 fixed (audit-verified) and #232's headline item fixed
   (PR #233) but both OPEN; #99–#107 each have referencing commits. Josh should
   close/re-scope so future coordinators don't dispatch against ghosts.
4. **Pack-contract change** — new crit-card fields alter the pack governance surface;
   per repo policy, run `sp-proxy/REDTEAM_CHECKLIST.md` after any pack change, and
   confirm the schema change doesn't break the parity-scenario union.
5. **Shared-file collisions** — WS1 and WS2 both touch `sp-interview.html`-adjacent tests
   and `tests/smoke/interview-room.spec.js`; coordinator owns the integration merge.
6. **Anchor confirmation** — #225 was coordinator-selected because the request named no
   change. If Josh intended a different anchor, only §1 scope text changes; the
   workstream skeleton, gates, and merge path are anchor-independent.

---

## 6. Merge recommendation

**One squash-merge PR** (`claude/ws1-impl-225-pack-critcard` → `main`) containing
implementation + tests together — never split, so main never holds tests referencing
missing code or code without its regression teeth. WS3/WS4 contribute review artifacts,
not commits.

Merge order & gates: WS2 Phase A → WS1 diff → WS2 Phase B merged into WS1 branch →
open PR (previews build) → WS3 report clean/resolved + WS4 matrix clean + CI green +
Josh sign-off (items 1–2 above) → **squash-merge**. Post-merge: verify both Netlify
production deploys, run the REDTEAM checklist (pack change), close #225 with a comment
linking the PR, remove the three worktrees, delete remote branches.

Rollback: single squash commit → `git revert <sha>` restores prior behavior; packs are
additive-optional, so pre-#225 packs remain valid either way.
