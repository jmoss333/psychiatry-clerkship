# Branch & PR Cleanup Plan — 2026-04-24

> Triage and cleanup plan for the 40 remote branches and 30 open PRs on `jmoss333/reconnect-psychiatry-system`. Goal: shrink the active surface to what is actually in-flight, preserve provenance for archived work, and define a repeatable hygiene loop.

## TL;DR

- **40 remote branches** / **30 open PRs** — 10 branches have no open PR.
- **2 branches are already merged to `main`** and can be deleted today (no risk).
- **4 `archive/*` branches** should be converted to git tags then deleted (preserve history, shrink branch list).
- **3 overlapping ARIA-label PRs** and **2 near-duplicate regex/tone-check bot PRs** should be consolidated.
- **11 Dependabot MCP-server PRs** (zod, typescript, @types/node × 4 servers) should be regrouped into one group PR per server via `.github/dependabot.yml`, or batch-merged in dependency order.
- **1 stale `wip/*` branch** (8 days old, +770 commits ahead, no PR) needs an owner decision before deletion.

After the plan is executed, we expect ~22 branches and ~15 PRs — roughly half the current surface.

---

## Current State (snapshot 2026-04-24)

| Category | Count | Notes |
|---|---|---|
| Total remote branches | 40 | incl. `main` |
| Open PRs | 30 | all target `main` |
| Branches with no open PR | 10 | candidates for deletion, archive, or PR opening |
| Branches already merged to `main` | 2 | safe delete |
| `archive/*` branches | 4 | by convention, these are snapshots |
| `dependabot/*` branches | 11 | auto-generated |
| Bot-authored open PRs (Bolt/Sentinel/Palette/Jules) | 12 | some duplicate each other |
| `wip/*` branches | 1 | 8 days stale, no PR |

---

## Classification

### Bucket A — Delete immediately (already merged to `main`)

Verified via `git merge-base --is-ancestor origin/<br> origin/main`:

| Branch | Last commit | Notes |
|---|---|---|
| `fix/suite-sri-fan-out` | 2026-04-21 | +0/-29 (fully absorbed) |
| `feat/media-mappings-REC-54` | 2026-04-22 | +0/-25 (fully absorbed) |

**Action:** `git push origin --delete <branch>` for each. No tag needed — commits are on `main`.

### Bucket B — Tag-then-delete (archive branches)

These carry the `archive/` prefix and are snapshots of historical work. Keep the commits reachable via an annotated tag but drop the branch ref so they stop appearing in `git branch -r`, PR filters, and the branch picker.

| Branch | Last commit | Ahead/Behind | Proposed tag |
|---|---|---|---|
| `archive/codex-therapymatch-pr343-2026-04-17` | 2026-04-10 | +758/-71 | `snapshot/codex-therapymatch-pr343-2026-04-17` |
| `archive/claude-great-montalcini-db-steward-2026-04-15` | 2026-04-15 | +1/-43 | `snapshot/claude-great-montalcini-db-steward-2026-04-15` |
| `archive/rssm-v10-layer-names-2026-04-15` | 2026-04-15 | +1/-43 | `snapshot/rssm-v10-layer-names-2026-04-15` |
| `archive/rec-20-v10-propagation-2026-04-16` | 2026-04-16 | +2/-43 | `snapshot/rec-20-v10-propagation-2026-04-16` |

**Action (per branch):**
```bash
git tag -a snapshot/<name> origin/archive/<name> -m "Snapshot of archive/<name> preserved on 2026-04-24"
git push origin snapshot/<name>
git push origin --delete archive/<name>
```

Context: the 2026-04-17 cross-branch checkout that wiped ~1,500 lines of uncommitted work (per `CLAUDE.md`) is likely why these archive branches exist. Tags preserve that recovery lineage permanently and are cheaper than branches.

### Bucket C — Stale orphan branches (need owner decision)

| Branch | Last commit | Ahead/Behind | Recommendation |
|---|---|---|---|
| `wip/phase1-db-optimization-recovery-meeting-calendar-2026-04-13` | 2026-04-16 | +770/-71 | Substantial work, no PR, 8 days stale. **Ask Josh** — either open a PR or tag-and-delete like Bucket B. |
| `sentinel-xss-fix-13159580101580628016` | 2026-04-18 | +1/-33 | Share suffix `13159580101580628016` with PR #416 (`sentinel-fix-escapehtml-xss-...`). Likely an abandoned earlier bot attempt. **Delete** once confirmed PR #416 supersedes it. |

### Bucket D — Duplicate/superseded PRs (close + delete branch)

Multiple bot pipelines have produced near-duplicate PRs. Choose the freshest that passes CI, close the rest, and delete the closed branches.

**ARIA-label consolidation (3 PRs, pick 1):**
| PR | Branch | Created | Scope |
|---|---|---|---|
| #401 | `palette/add-aria-labels-to-icon-buttons-4627432255973404731` | 2026-04-15 | Icon-only buttons |
| #415 | `jules-5090154565997620579-ed92e2ff` | 2026-04-18 | Dashboard inputs |
| #419 | `palette-add-aria-labels-9297460514518836017` | 2026-04-21 | Buttons (scope?) |

**Recommendation:** Have an owner skim diffs; likely close #401 (oldest, 60 commits behind) and #415 if #419 subsumes them. If scopes genuinely differ, rename PR titles to disambiguate.

**Regex/tone-check consolidation (4 PRs, pick survivors):**
| PR | Branch | Created | Title |
|---|---|---|---|
| #414 | `bolt-regex-optimization-12183799669627556449` | 2026-04-18 | Combine multiple regex patterns |
| #421 | `bolt-regex-optimization-4580014162760867529` | 2026-04-21 | Optimize regex list with single alternation |
| #425 | `bolt-optimize-check-tone-4784833617358189122` | 2026-04-22 | Optimize RegExp allocation in Serverless Fallbacks |
| #447 | `bolt-optimize-tone-check-15824911713227035230` | 2026-04-22 | Optimize check-tone.mjs — move RegExp array to module scope |

**Recommendation:** #414 vs #421 — same target, keep the newer. #425 vs #447 — near-identical naming; diff them and keep whichever is more complete.

**XSS fix consolidation (2 PRs + 1 orphan):**
- PR #416 `sentinel-fix-escapehtml-xss-13159580101580628016` (HIGH) and PR #420 `sentinel-xss-fix-9112889159696454304` (HIGH) may overlap — verify both are needed; if one supersedes the other, close the loser.

### Bucket E — Dependabot MCP-server group (11 PRs)

All opened 2026-04-22, one per `(server, package)` pair:

| Server | zod 4.3.6 | typescript 6.0.3 | @types/node 25.6.0 |
|---|---|---|---|
| `reconnect-build-mcp-server` | #439 | #443 | #435 |
| `reconnect-clinical-content-mcp-server` | #441 | #437 | #445 |
| `reconnect-data-mcp-server` | #438 | #434 | #442 |
| `reconnect-pilot-mcp-server` | #440 | #444 | #436 |

Plus the already-grouped root PR: #446 `dependabot/npm_and_yarn/dev-dependencies-fa09309454` (4 updates across the root).

**Two options:**

1. **Regroup via config** (preferred, reduces future noise): add a `groups:` block per MCP server in `.github/dependabot.yml` so each server ships one combined PR covering all three bumps. This prevents the next Dependabot cycle from producing another 11-PR fan-out.
2. **Batch-merge as-is**: merge in this order per server, watching CI:
   1. `@types/node` (type-only, lowest risk)
   2. `typescript` (compiler bump — run `tsc --noEmit` per server)
   3. `zod` — ⚠️ **major bump (3.x → 4.x)**; review `z.record`, `z.object().strict()`, and error-format changes per server. Do this one at a time with the MCP server's tests.

Note: `reconnect-pilot-mcp-server` uses **npm, not pnpm** (per `CLAUDE.md`) — its `package-lock.json` is independent of the root `pnpm-lock.yaml`. Lock-revert pattern (dependabot lockfile gets clobbered by later merges) is a known risk here — prefer merging Dependabot PRs in close succession.

### Bucket F — Active/in-flight PRs (leave alone)

These are recent (≤2 days old) and appear to be actively driven:

| PR | Branch | Owner | Title |
|---|---|---|---|
| #468 | `bolt-rc-tool-recommendations-map-...` | jmoss333 | Precompute Map for tool lookups |
| #467 | `fix/gate-exemptions-rmc-smf` | jmoss333 | fix(ci): restore green main |
| #461 | `claude/sleepy-ptolemy-ce3a16` | jmoss333 | repair 15 harnesses + 2 tools |
| #458 | `feat/pat-handouts-REC-75` | jmoss333 | PAT diagnosis handouts, Wave C baselines |
| #456 | `fix/run23-safety-corrections` (draft) | jmoss333 | Run 23 safety corrections |
| #450 | `feat/rmc-find-your-path-screener` | jmoss333 | RMC pathway screener v14.0 |
| #424 | `sentinel-replace-math-random-with-crypto-...` | jmoss333 | Fix predictable PRNG |
| #417 | `bolt-fix-analytics-rate-limits-...` | jmoss333 | Fix redundant network reads |

**Action:** none from this plan — merge/close on their own track.

### Bucket G — Branches with open PRs but no local record

`feat/smart-recovery-suite-integration` has no open PR (per the snapshot) but +8/-43 — either revive by opening a PR, or delete. Confirm with owner.

---

## Execution Order

Do this in one sitting to avoid partial state (e.g., a tag without the deletion):

1. **(safe)** Delete Bucket A branches (2 merged branches).
2. **(safe)** Tag + delete Bucket B branches (4 archive branches).
3. **(ask owner first)** Resolve Bucket C: open PR or tag+delete for the `wip/*` branch; delete the superseded sentinel XSS orphan.
4. **(ask owner first)** Resolve Bucket D duplicates: close the loser PRs via GitHub, delete their branches.
5. **(config-first)** Edit `.github/dependabot.yml` to add `groups:` blocks for the four MCP-server directories. Let Dependabot rebase PRs, or close the 11 Bucket E PRs and let the next dependabot run produce 4 grouped PRs.
6. **Bucket F** — no action, proceed on feature cadence.

After execution, run `git remote prune origin` locally and re-run `git branch -r | wc -l` to confirm.

---

## Ongoing Hygiene (keep branch count bounded)

The repo already has the tooling; the gap is consistency. Recommended standing rules:

1. **Delete-on-merge**: enable "Automatically delete head branches" in repo settings (`Settings → General → Pull Requests`). This removes the need to manually delete Bucket A every week.
2. **Group Dependabot by ecosystem + directory** in `.github/dependabot.yml`. One group PR per MCP server per week beats 3 PRs × 4 servers.
3. **Weekly `/pr-triage` run** — already scheduled (`~/.claude/scheduled-tasks/weekly-pr-triage`, Mondays 9:23 AM). Extend the skill to also surface orphan branches (no PR, >7 days stale) and print the Bucket A/B/C classification this plan defines.
4. **Archive convention**: when work truly needs preserving without a live branch, use `git tag snapshot/<name>` then delete — don't create `archive/*` branches. Tags are cheaper and don't appear in branch pickers, PR filters, or stale-branch scans.
5. **Bot PR quality bar**: if Bolt/Sentinel/Palette/Jules produce near-duplicate PRs within a week, close all but one as duplicates. Add a CODEOWNERS line requiring human approval on `bot-*` PRs so they don't silently accumulate.
6. **Branch-naming discipline**: `feat/`, `fix/`, `chore/`, `wip/`, `dependabot/`, `archive/` (deprecated — use tags instead). Bot branches should always carry the bot name as prefix (`bolt-`, `sentinel-`, `palette-`, `jules-`) — already the case.

---

## Open Questions for the Owner

1. **`wip/phase1-db-optimization-recovery-meeting-calendar-2026-04-13`** — +770 commits of real work. Open a PR or tag-and-delete?
2. **`feat/smart-recovery-suite-integration`** — no PR, +8 commits, 3 days stale. Still in flight?
3. **ARIA-label PR triad (#401/#415/#419)** — which represents the canonical scope? Close the others?
4. **Regex optimization pair (#414/#421) and tone-check pair (#425/#447)** — any reason to keep both?
5. **Enable "auto-delete head branches" on merge?** (one-click repo setting)
6. **Regroup Dependabot** via `.github/dependabot.yml` now, or wait for the next cycle?
