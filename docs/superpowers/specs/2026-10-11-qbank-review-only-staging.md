# Review-only staging for revised questions

Date: 2026-10-11. Owner direction: resolve the zero-draft conflict, keep unapproved
questions off both learner sites, and keep both AI pilots disabled.

## Outcome and scope

The canonical question bank remains the faculty editing and review source. A valid draft
may reach the repository and the existing authenticated faculty console without becoming
learner content. Learner publication contains only explicitly attested, active questions.
Reopening an approved question temporarily withholds it; its previous wording is not kept
as an independently published copy. This avoids two competing versions and is the default
chosen for this implementation. It does not approve the pending PTSD question.

This extends the existing saved-draft console and build pipeline. It creates no second
question store, new clinical status, allowlist exception, draft export, or AI capability.
Faculty signatures and clinical review remain human actions.

## Publication boundary

- A shared strict projector validates every canonical question and emits the complete set
  of active `status: attested` questions, with only learner fields. Drafts and retired items
  are withheld; missing or invalid status, malformed content and duplicate IDs fail closed.
- Both sites receive this projected root JSON. Placement questions, the shell's permitted
  question IDs, Daily Review's restore inventory, Anki packages and CSV derive from it.
- The shell uses an allowed-ID set. Old browser draft preferences or cached response IDs
  cannot widen it. No withheld-ID deny list is published.
- Static QA compares actual public data with the canonical projection, checks the dependent
  feeds, and scans output for withheld question IDs. Anki/CSV parity independently checks
  the final downloads. Missing inputs and stale fallback packages block the build.
- Legitimately empty released inventories differ from missing inventories. Daily Review's
  companion content change permits the former while still refusing the latter.

The source exposure checker names valid drafts as **STAGED — faculty review only**. Its
QB cap remains zero and its allowlist remains empty. The five other banks keep their existing
metadata ratchets. A green source check is not a substitute for publication checks or live
delivery verification.

## Faculty approval

The existing individual, batch-question and phone flows already bind approval to an exact
saved item revision. The broad baseline action now receives a snapshot from its preview:
selected question IDs, each exact item revision, and the manifest revision. The server checks
it before page writes and retains it through retries. Changed, removed, retired, newly
ineligible or already approved selected questions require reloading. New drafts appearing
after preview are not added. An empty selection approves no questions. Missing or malformed
snapshots cannot mean "use the current queue."

Older clients must reload. A newer client refuses an older preview that lacks revision
data. This retains the existing explicit baseline faculty statement; revision binding does
not establish that the faculty member read every complete question.

The rolling `attest/pending` sweep can deliver draft saves to main. It is therefore not a
quarantine boundary. The projection and actual-output checks enforce learner exclusion
regardless of how the canonical draft arrived. Existing page/tool signatures, source checks,
phone readiness and approval-author checks continue to apply.

## Review and delivery order

The machinery is a separate governance PR based on main, with policy changes in their own
commit. It does not edit clinical question wording or any approval record. The small Daily
Review consumer adjustment belongs with its own content diff, including matching tests.
The existing paired-pilot/clinical branch will depend on this machinery and retain its
pending question. No main/release merge, deployment or pilot activation is part of preparing
these drafts.

## Verification

Tests use controlled review-state fixtures rather than current faculty signature counts.
They must demonstrate a valid staged draft, malformed source rejection, unchanged zero cap,
complete approved inclusion, draft/retired exclusion from both sites and downloads, refusal
of stale snapshots before writes, fixed selection through retries, and old-client refusal.
Actual APKG SQLite notes and CSV cells are checked. A deliberate removal of the public
comparison must make the leak/omission test fail; restoring it must make the same test pass.
Run focused tests, the full repository gate, both audience builds, and a combined check with
the pending PTSD revision. Record CI and preview evidence separately from local results.

Potential later improvement: a faculty-only comparison of the last reviewed question and
the proposed wording, alongside the exact revision and publication status. Not implemented
as part of this change.
