# ADR-002 Phase 2 — migrate the 13 direct readers to `shipped_pages.json` (fan-out workflow)

**Date:** 2026-09-04 · **Author:** Claude (Cowork) for Joshua Moss, MD · **Status:** DRAFT — not executed. Runs only when Josh says "run the workflow".
**Follows:** #522 (ADR-002, merged 2026-09-04 20:54Z). **Authoritative list:** the Phase-2 block of `ALLOWED_DIRECT_READERS` in `tests/shipped-pages-readers.test.mjs` on `main`.

## 0. What this does and why it can be parallel

Thirteen scripts still assemble "what ships" for themselves (several with a private copy of the Case-of-the-Week patch). Each migration is the same shape — replace the private derivation with `shipped_pages.py`'s `load_shipped_pages()` (or a JSON read in JS), delete the private patch, delete the script's line from the ratchet allowlist — and each has a **mechanical proof of correctness**: the script's own output on the same inputs must be byte-identical before and after. That makes it safe to fan out.

What is **not** the same across scripts is coupling: some share helpers, one has a circular-import hazard, one is client-side. So the fan-out is over **six batches**, not thirteen files.

## 1. Batches (one branch, one PR each)

| # | Batch | Files | Why grouped | Parity oracle (byte-identical before/after) |
|---|---|---|---|---|
| B1 | Curriculum validators | `validate_curriculum.py`, `validate_claim_anchors.py` | Both already repointed at `site_extras.py` in #522; both re-derive COTW; `validate_curriculum.py`'s totality guard is the closest analogue of the original bug | stdout + exit code of each validator on `origin/main`; `test_validate_curriculum.py`, `test_validate_claim_anchors.py` green |
| B2 | Surface & tool governance | `surface_governance.py`, `validate_tool_governance.py` | `_ADDITIONAL_TOOL_SOURCES` in the first is a hand-synced miniature of `SITE_EXTRAS` in the second; **circular-import hazard** — read `shipped_pages.json` as data, do not import `shipped_pages.py` | `surface_governance.py` report output; `test_surface_governance.py`, `test_validate_tool_governance.py` green |
| B3 | Report generators | `export_curriculum_review.py`, `library_coverage_scan.py`, `generate_evidence_drill.py` | All report-only; `export_curriculum_review.py` carries its own inline COTW format string | each generator's output file(s) diffed (`evidence_drill_review.json` etc.); note: `generate_evidence_drill.py` output is a `bin/verify.sh` byproduct — delete before commit |
| B4 | Build-side consumers | `pairings_block.py`, `governance_digest.mjs`, `frontdoor/fd_data.js` | Run inside or beside the build; **`fd_data.js` is shipped client code** — must not fetch `shipped_pages.json` at runtime; the build injects titles, so migrate the injection point, not the file | **learner build byte-identical**: `find _build/<site> -type f \| sort \| xargs shasum -a 256` before/after for ms3 AND res (the #522 D3 proof, repeated); `governance_digest` output diffed |
| B5 | Exports & sweeps | `anki/pcl_anki/release.py`, `bin/sweep_unlicensed_claims.py`, `tools/pdf_library_export/export_website_pdf_library.py` | Standalone tools with their own test suites | `tests/anki/*` green; `sweep_unlicensed_claims.py` row output diffed (it exits 0 even when it flags rows — diff the rows, not the exit code); `test_export_website_pdf_library.py` green |
| B6 | Schema registry | `validate_registry_schemas.py` | Reads the manifest to validate `pairings.json` slugs — smallest change, but it is the schema gate everything else depends on, so it goes last | `test_validate_registry_schemas.py` 28+ green; `validate_registry_schemas.py` stdout identical |

Not in scope (stay on the allowlist, by ADR-002 design): the three producers, `clerkship_guards.py`, and the two partial readers (`attest.mjs`, `validate_attestation_consistency.py`).

## 2. Per-batch contract (identical for every agent)

1. Mac worktree: `git fetch origin && git worktree add .claude/worktrees/p2-<batch> -b claude/adr002-phase2-<batch> origin/main`. Edit in the VM mount, git/gh/gates on the Mac (Desktop Commander). Never `git add -A`. Never `--no-verify`.
2. **Record the oracle first** — run the batch's scripts/tests on the untouched worktree and save outputs under `$HOME/p2-<batch>/before/` (Mac-side `$HOME`, not the repo).
3. Migrate: read `shipped_pages.json` via `load_shipped_pages()` (Python) or `JSON.parse(readFileSync(...))` (JS); delete the private COTW derivation and any hand-synced extras list; delete the batch's lines from `ALLOWED_DIRECT_READERS`. Do not touch any file outside the batch except that allowlist and the batch's own tests.
4. Prove: re-run the oracle into `before/`'s sibling `after/`; `diff -r before after` must be empty. For B4 the oracle is both learner builds.
5. Grep-proof the deletion: `git grep -n "cotw_%s\|cotw_\${\|_cotw_slug\|_ADDITIONAL_TOOL_SOURCES\|SITE_EXTRAS" -- <batch files>` returns nothing (except imports of the shared helper).
6. `nohup bash bin/verify.sh > /tmp/p2-<batch>.log 2>&1 &`, poll; `node --test tests/shipped-pages-readers.test.mjs` on the Mac (fails in the VM: no `git ls-files`).
7. Push; `gh pr create --draft` with: the batch table row, the oracle diff result (the literal empty-diff line), the allowlist lines removed, deviations. **Do not merge.**
8. Return to the orchestrator: PR URL, oracle result, allowlist delta, deviations.

## 3. Concurrency and landing (the parts that need Josh's answers)

- **Concurrency 2, not 6.** Every push runs `bin/verify.sh` (two full builds) on the same MacBook; six at once is a 10-minute thermal stall and Playwright port fights. Two at a time finishes in roughly an hour.
- **Every batch edits the same allowlist file**, so PRs will conflict as they land. Landing is serial: merge one → `gh pr update-branch` the next → wait for CI → merge. A one-shot scheduled task per PR can do the update-branch and the CI poll; the **merge stays with Josh** unless he says otherwise for this phase.
- Order: B1 → B2 → B3 → B5 → B4 → B6 (B4 last-but-one because its oracle is the heaviest; B6 last because it is the schema gate).

## 4. Workflow script (draft — `meta` is a pure literal; runs only on explicit "run the workflow")

```js
export const meta = {
  name: 'adr002-phase2-readers',
  description: 'Migrate the 13 direct site_manifest/cotw_registry readers to shipped_pages.json in 6 batched PRs, 2 at a time, each proven byte-identical',
  phases: [{ title: 'Migrate' }, { title: 'Report' }],
}
const BATCHES = [
  { key: 'B1', files: ['validate_curriculum.py','validate_claim_anchors.py'], oracle: 'validator stdout+exit; unit tests' },
  { key: 'B2', files: ['surface_governance.py','validate_tool_governance.py'], oracle: 'surface_governance report; unit tests; NO import of shipped_pages.py (circular)' },
  { key: 'B3', files: ['export_curriculum_review.py','library_coverage_scan.py','generate_evidence_drill.py'], oracle: 'generated report files diffed' },
  { key: 'B5', files: ['anki/pcl_anki/release.py','bin/sweep_unlicensed_claims.py','tools/pdf_library_export/export_website_pdf_library.py'], oracle: 'tests/anki; sweep rows diffed; pdf export tests' },
  { key: 'B4', files: ['site_build/pairings_block.py','maintenance/governance_digest.mjs','site_build/frontdoor/fd_data.js'], oracle: 'BOTH learner builds sha256-identical; digest output diffed' },
  { key: 'B6', files: ['validate_registry_schemas.py'], oracle: 'registry-schema tests; stdout identical' },
]
const CONTRACT = /* the §2 text, verbatim, plus the two-machines rules from CLAUDE.md */ ''
const results = []
for (let i = 0; i < BATCHES.length; i += 2) {              // concurrency 2 — see §3
  const pair = BATCHES.slice(i, i + 2)
  results.push(...await parallel(pair.map(b => () =>
    agent(`${CONTRACT}\n\nBATCH ${b.key}: ${b.files.join(', ')}\nORACLE: ${b.oracle}`,
          { label: `migrate:${b.key}`, phase: 'Migrate', model: 'opus',
            schema: { prUrl: 'string', oracleIdentical: 'boolean', allowlistRemoved: 'string[]', deviations: 'string' } })
  )))
}
const summary = await agent(
  `Summarize these Phase-2 results for Josh as one table (batch, PR, oracle identical?, allowlist lines removed, deviations) and list the serial landing order B1→B2→B3→B5→B4→B6 with the exact gh commands. Results: ${JSON.stringify(results)}`,
  { label: 'report', phase: 'Report' })
return { results, summary }
```

## 5. Acceptance for the phase as a whole

| # | Check | Command |
|---|---|---|
| 1 | Allowlist shrinks by exactly 13 lines, to producers + guard + 2 partial readers | `node --test tests/shipped-pages-readers.test.mjs` on the Mac |
| 2 | No private COTW derivation left outside the producers | `git grep -n "cotw_%s\|_cotw_slug" -- ':!site_build/build_deploy.py' ':!site_build/resident_section.py' ':!site_build/cotw_meta.py' ':!site_build/cotw_slug.py' ':!site_build/shipped_pages.py'` → empty |
| 3 | Learner output unchanged across the whole phase | sha256 listing of `_build/ms3` and `_build/res` on `main` before B1 and after B6: identical |
| 4 | Every gate green | `bin/verify.sh` ALL CHECKS PASSED on `main` after B6; CI green on each PR |
| 5 | ADR updated | ADR-002 "Phase 2" section rewritten as "Done — <date>, PRs #…"; CLAUDE.md gotcha unchanged (still true) |

## 6. Rollback

Each PR reverts independently; the ratchet line comes back with it. Nothing else depends on Phase 2.
