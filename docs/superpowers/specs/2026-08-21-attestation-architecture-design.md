# Faculty attestation architecture — design

**Date:** 2026-08-21
**Status:** design approved, awaiting implementation plan
**Supersedes the branch model introduced by:** PR #340 (`fix/attest-rolling-branch`)
**Related:** WP-17 in `docs/superpowers/plans/IMPLEMENTATION_HANDOFF_2026-08-20.md` (the qbank half of §1, already specified and unbuilt)

## Problem

The faculty console maintains a second copy of the repository's state and relies on
manual, best-effort reconciliation to keep it in sync. Every failure observed on
2026-08-20 traces to that one decision.

| Observed failure | Cause |
|---|---|
| Interaction Cards could not be attested at all | The queue is built from the **branch's** `site_manifest.json`, which listed 20 tools instead of 21 |
| The Interview Room showed a pending banner to students while the console filed it complete | The branch said `reviewed`, `main` said `pending` |
| Four questions were attested against wording — and answer keys — that had since changed | The branch forked before the answer-key rebalance |
| The branch sat frozen for nine days, 40 commits behind | The rolling PR is opened only *after* a successful write; none existed, so nothing reconciled |
| Every console attestation would have failed CI on merge | Attestation touches four files; the console writes one |

A sixth defect (the ledger being rewritten with `indent: 1` on every attestation) was
fixed in PR #381 and is not architectural.

`ensureBranchFresh()` fast-forwards only when `ahead_by === 0`, deliberately: merging a
stale branch would revert newer ledger entries. That is correct in isolation and
deadlocks in practice — the branch cannot self-heal while it holds unmerged work, and
the thing that clears the unmerged work is a pull request that may never exist.

### Root cause

Two separable faults, and the second is the one that caused harm:

1. **A second copy of state** with no forcing function to reconcile it.
2. **An attestation records a status without recording what it was a status *of*.**
   `reviewed.schema.json` defines `contentHash`, `claimsHash`, and `evidenceHash`;
   **0 of 120 records carry any of them**. Nothing binds a content attestation to the
   bytes it approved, so content drift beneath an attestation is undetectable by
   construction.

Fault 2 is not new. `IMPLEMENTATION_HANDOFF_2026-08-20.md` records commit `e36809c`
materially rewriting attested question content four days after sign-off, with the
ledger still reading clean.

## Non-goals

- Moving the ledger out of git. Git history **is** the audit trail for clinical
  attestation, and a build-time network dependency trades a rare failure for a routine one.
- Changing the review-sitting UX (batch tray, compound receipts, auto-advance). That
  half of the console works and is out of scope.
- Adding a second human reviewer. There is one attester; the rolling PR was never a
  second pair of eyes.

## Design

Three changes. §1 and §2 ship together — §2 is what makes §1 possible. §3 follows.

### §1 — Bind an attestation to the content it approved

**Rule: hash the thing being attested, never the attestation.**

Both existing hashers violate this. `itemRevision()` hashes the whole item;
`QB_HASH_FIELDS` in `13_Faculty_Resources/_automation/anki/pcl_anki/qbank.py` lists
`status` explicitly. Storing either as an attestation hash means the act of attesting
changes `status`, which changes the hash, which fires the drift gate on the item just
signed off.

The attestation digest therefore covers reviewed **substance** and excludes governance
**output**:

- **Question bank:** `QB_ATTEST_HASH_FIELDS = QB_HASH_FIELDS − {status}`, reusing the
  existing `canonical_json_sha256()`.

  *Where it lives:* WP-17 says to extend `qbank_attestation_*.json`, but that file is
  archived (`99_Archive/qbank_attestation_2026-07-05.json`) and there is no live
  successor — an attested item today carries `status` and nothing else. So the digest
  goes on the item itself as `attestedHash`, written when status becomes `attested` and
  removed when it returns to `draft`. Because `QB_ATTEST_HASH_FIELDS` is an explicit
  allowlist, `attestedHash` is excluded from its own input and the record stays
  self-consistent. This also keeps `question_bank.schema.json` as the single contract
  for a question, rather than reviving a sidecar.

- **Content ledger:** `contentHash` = SHA-256 of the manifest source file's bytes.
  This is only stable once §2 removes governance state from content files — see below.

`claimsHash`, `evidenceHash`, and `evidenceThrough` stay defined and unused. They are
out of scope; do not backfill them.

**Enforcement:** a step in `build_and_check.sh` re-hashes every attested record and
fails the build naming the drifted slugs and ids. Because `build_and_check.sh` is the
Netlify build command, drift blocks the deploy rather than reaching learners.

**Backfill:** compute hashes for all currently-attested records. Where content has
changed since the recorded `at` date, **flag for re-attestation; never fabricate a
hash**. No agent changes an attestation status. The four questions reopened in PR #385
are the known-drifted set on the qbank side; the content side is unaudited and the
backfill is what audits it.

Also add `tests/anki/test_qbank_governance.py` to CI — it passes today and has never run
(WP-17 task 1).

### §2 — Derive the mirrors instead of duplicating them

Attestation currently has to agree across five places. Four are copies of a fact that
lives in `reviewed.json`, and only one of the four is ever read by a learner.

| Mirror | Consumer | Action |
|---|---|---|
| Tool `CLERKSHIP-META status="…"` | Validators and `check-static-site` only | **Delete from source** |
| Top-level `pack.status` | Nothing. The SP tool's only runtime status read is `pack.speechEngine.status`, a different field gating voice | **Delete from source** |
| `> **Review status:**` markdown banner | Authored in **46 files**, cross-checked, then deleted at build by `strip_review_banners()` (`build_deploy.py:430`) | **Delete from source; delete the stripper** |
| `topic_meta.facultyReview` | **Renders** — `spa_index.html:962` draws a `tpl-chip review` chip | **Derive from `governance.json`** |

The third is the clearest statement of the problem: a fact maintained in 46 source
files, validated for consistency, and then stripped so that no learner ever sees it.
The banner students *do* see is injected by `surface_governance.py` from the ledger.

**Deriving the chip:** `build_deploy.py` already emits a per-site `governance.json`
carrying `status`, `reviewer`, and `reviewedAt` per slug, and `annotate_navigation()`
already attaches governance triplets to nav items. The SPA chip reads from there;
`facultyReview` leaves `topic_meta.json`.

This fixes a live inconsistency as a side effect: `topic_meta` holds **23**
`facultyReview` entries against **120** ledger records, so 97 pages show no review chip
today despite the ledger knowing their status. Derived, every page gets an accurate one.

**Consequence:** all six `reviewed-ledger-*-mismatch` rules in
`validate_attestation_consistency.py` are deleted. Not weakened — unnecessary. Nothing
can be inconsistent with itself. The high-safety governance bundle in
`validate_topic_meta.py` must be repointed at the ledger, since `facultyReview` is the
field it currently requires.

### §3 — Write to `main`

The console reads and writes `main`. `attest/pending` is retired.

This configuration already exists: `requireServerSettings` derives
`isolated = branch !== baseBranch`, and `attest.mjs:13` documents setting `GIT_BRANCH`
equal to `GIT_BASE_BRANCH` for direct writes. The handler tests already run this way.
Step one is a Netlify environment change; the code change is deletion.

**Deleted:** `ensureBranchFresh()` (~46 lines), `ensureRollingPullRequest()` (~43), 11
`isolated`/`baseBranch` references, and `tests/faculty-console-branch-sync.test.mjs`
(270 lines). Roughly 370 lines, and with them rows 1–4 of the failure table.

**Why this is safe.** Two guards already stand between a console write and a learner:

1. *Server-side, before the write.* `commitContentMutation` spreads the current record
   forward and sets only `status`/`at`/`by`, deleting `reason`. It structurally cannot
   write arbitrary fields — `risk`, `note`, and the hashes survive untouched. §1 adds
   `contentHash` to that same narrow set.
2. *Publish gate, after the write.* `build_deploy.py:353` calls
   `load_validated_ledger()` at module scope, raising `SurfaceGovernanceError` on a
   schema-invalid ledger. Since `build_and_check.sh` is the Netlify build command, a
   malformed write fails the build and the previous deploy stays live.

The trade is explicit: direct-to-main gives up *pre-publish* review, and the blast
radius of a bad write becomes a red build rather than a bad publish.

**Defense in depth:** a CI step keyed on committer `Faculty Attestation Console`
(`attest.mjs:412`) asserting that such commits touch only `reviewed.json` and
`question_bank.json`, and only governed fields. This is detection-after, not
prevention — a direct push cannot be gated by a required status check.

**Rebuild churn** is accepted. Batch attestation already collapses a tray into one
commit per request, so a sitting is a handful of pushes. Netlify cancels superseded
builds.

## Risks

**Branch protection returns and the bypass is missing.** GitHub Actions billing lapsed
on 2026-08-20, which also removed branch protection from `main` (protection on a private
repo requires a paid plan). When billing is restored, protection returns. Without a
ruleset allowing the console's actor past required pull requests, writes begin failing
with 409 — the exact failure `attest.mjs:13` records as "invisible for a month, because
a 409 reads as a race."

Mitigations, all required:

- A scheduled monitor watches for billing restoration and reports it, so the ruleset is
  created deliberately rather than discovered by a failed sitting.
- The console surfaces a 409 as a named configuration error, not a retryable race. The
  error text at `attest.mjs:43` already says this; nothing verifies it.
- A startup self-check confirms the bypass exists, rather than finding out on the next
  write.

**Backfill surfaces widespread content drift.** Plausible: the content ledger has never
been hash-checked, and the qbank side turned up four drifted records out of five
sampled. If the count is large, re-attestation is a scheduling problem, not a technical
one. The design's answer does not change — flag, never fabricate — but the rollout may
need to stage re-attestation across several sittings.

**`topic_meta.facultyReview` has consumers beyond the chip.** `validate_curriculum.py`,
`validate_topic_meta.py`, and `validate_attestation_consistency.py` all read it. The
implementation plan must enumerate every reader before the field is removed.

## Rollout order

1. §1 + §2 as one change: derive the mirrors, add the attest-hash contract, backfill
   with drift flagged, wire the anki governance suite into CI.
2. Re-attest whatever the backfill flags, plus the four questions from PR #385, in the
   console — which by then shows current content.
3. §3: repoint the console at `main`, delete the branch machinery, add the committer
   guard, retire `attest/pending`.
4. Create the ruleset bypass when billing is restored (monitored).

Order matters. §1 before §2 leaves content files carrying governance state, so hashes
are unstable. §3 before §1 removes the stale-branch symptom without adding the drift
detection that makes any of it verifiable.

## Acceptance criteria

- [ ] Every attested record carries an attestation hash computed over content-only
      fields, excluding `status`: `contentHash` in `reviewed.json`, `attestedHash` on
      the item in `question_bank.json`.
- [ ] `attestedHash` is absent on every `draft` item, and is removed when an attested
      item is reopened.
- [ ] Re-attesting an item does not change its own attestation hash.
- [ ] Content drift beneath an attested record fails `build_and_check.sh`, naming the
      drifted slugs and ids.
- [ ] Backfill changed no attestation status, and enumerated every drifted record for
      author re-attestation.
- [ ] `tests/anki/test_qbank_governance.py` runs in CI.
- [ ] Tool sources, pack files, and markdown sources carry no review-status field or
      banner; `strip_review_banners()` is gone.
- [ ] The SPA review chip renders from `governance.json` for every page with a ledger
      record, not only the 23 with a `facultyReview` entry.
- [ ] The six `reviewed-ledger-*-mismatch` rules are deleted, and
      `validate_attestation_consistency.py` still fails on a real inconsistency it can
      still express.
- [ ] `attest/pending` no longer exists; the console reads and writes `main`.
- [ ] A console commit touching a file or field outside the governed set fails CI.
- [ ] A 409 from a protected branch is reported as a configuration error naming the
      missing bypass, and is not retried.
