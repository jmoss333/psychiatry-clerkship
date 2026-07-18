commit def513f5511b8144bb540a06f7346b9534a8c788
Author: Joshua Moss <jmoss333@gmail.com>
Date:   Wed Jul 15 07:12:53 2026 -0400

    docs: design Anki batch attestation console

diff --git a/docs/superpowers/specs/2026-07-15-anki-batch-attestation-console-design.md b/docs/superpowers/specs/2026-07-15-anki-batch-attestation-console-design.md
new file mode 100644
index 0000000..300e1bd
--- /dev/null
+++ b/docs/superpowers/specs/2026-07-15-anki-batch-attestation-console-design.md
@@ -0,0 +1,346 @@
+# Anki Batch Attestation Console Design
+
+**Date:** 2026-07-15
+
+**Status:** Approved design, pending implementation plan
+
+**Branch:** `codex/anki-batch-attestation`
+
+**Foundation:** `dfd9b25c095c6e9848895ddcd9a8733de83049ff`
+
+## Purpose
+
+Replace the one-off qbank quarantine review with one version-bound faculty action in
+the existing private Faculty Attestation Console. The action attests every active
+question-bank source item and every exact rendered Anki note in the current snapshot.
+It must preserve the approved source, render, risk, evidence, stale-input, and
+no-fabricated-decision safeguards.
+
+The initial snapshot contains 189 active qbank items and 217 rendered Anki notes.
+Three retired qbank items remain excluded. `qb_pha_002:base` is explicitly accepted
+as its exact current render inside the batch rather than receiving a separate
+quarantine decision.
+
+## Goals
+
+- Add an **Anki Deck** tab to `https://clerkship-faculty-attest.netlify.app/`.
+- Show the exact proposed learner-facing front and back for every included note.
+- Surface a conservatively classified high-risk subset before attestation.
+- Let a named faculty reviewer attest the entire snapshot with one action.
+- Atomically attest all active qbank source items and append one batch-attestation
+  record in a single Git commit.
+- Make any later source, qbank, render, template, risk, evidence, policy, or safety
+  finding drift require a new batch attestation.
+- Let the release evaluator recompute and verify the batch without trusting browser
+  data or a server-supplied computed field.
+- Preserve the truthful 141-identity legacy Concept-card release blocker.
+
+## Non-goals
+
+- Do not infer Anki approval from `question_bank.json.status` alone.
+- Do not create 217 hand-authored or browser-trusted per-note review records.
+- Do not attest retired questions or silently reactivate them.
+- Do not delete safety detection, legacy withdrawal handling, or migration gates.
+- Do not resolve the 141 legacy Concept identities in this feature.
+- Do not deploy, merge, rebase, or cherry-pick unrelated work as part of this design.
+
+## Decisions
+
+### One signed snapshot, not 217 independent browser decisions
+
+The canonical faculty decision is one append-only batch record. Its mechanical
+manifest covers every included qbank item and rendered identity. This keeps the Git
+review surface small while preserving exact per-note coverage.
+
+The existing `qbank_render_reviews.json` remains available for future exception or
+single-note workflows, but the current qbank release path may be satisfied by an
+exact matching batch. Existing card and withdrawal governance is unchanged.
+
+### Attest the post-action projection
+
+Forty-nine current qbank items are still `draft`. Changing them to `attested` can
+change eligibility or rendered learner text. The console must therefore display and
+sign the **proposed post-attestation projection**, not the pre-attestation preview.
+
+The mechanical candidate records both:
+
+- the current/base `question_bank.json` SHA-256; and
+- the proposed `question_bank.json` SHA-256 after every active item is set to
+  `status: "attested"` and retired items remain unchanged.
+
+All 217 front/back renders are generated from the proposed projection. The server
+must reproduce the proposed qbank bytes before committing them.
+
+### Remove the qbank quarantine step, not safety detection
+
+Qbank safety findings are displayed in the Anki batch. The signed batch includes the
+exact finding key and subject hash. A matching finding, including the current
+`qb_pha_002:base` stale-wording finding, is explicitly accepted as part of the batch.
+
+There is no separate faculty quarantine export for an included qbank finding. New,
+missing, or changed findings alter the manifest and block a stale batch. The existing
+quarantine/withdrawal machinery remains available for content outside the qbank
+batch and for actual exclude, retire, or same-GUID withdrawal decisions.
+
+## Architecture
+
+### 1. Deterministic batch candidate builder
+
+Add a Python batch module and CLI beside the existing Anki release tooling. It:
+
+1. Loads the real governed inputs.
+2. Computes the current/base qbank hash.
+3. Projects every active qbank item to `attested`, preserving retired records and all
+   non-status bytes.
+4. Re-runs qbank eligibility, source-anchor resolution, risk classification,
+   rendering, prior-render reconstruction, and safety detection on that projection.
+5. Requires exact coverage of all active qbank items and all derived base/tier2 note
+   identities.
+6. Emits a closed visual candidate containing exact front/back HTML and a compact,
+   canonical server contract containing identities and hashes.
+
+The candidate contains no reviewer, review date, or approval decision.
+
+### 2. Build-time console artifacts
+
+The Faculty Console Netlify build runs the deterministic builder for the deployed Git
+commit and produces two untracked deploy artifacts:
+
+- a public visual candidate used by the Anki Deck tab; and
+- a compact server contract bundled with the attestation function.
+
+The full visual candidate is not committed to Git. The compact contract contains no
+clinical prose beyond stable identifiers and hashes. The build fails if the candidate
+has incomplete membership, unresolved sources, unclassified risk, missing required
+evidence/policy proof, or malformed data.
+
+Netlify build configuration pins CPython 3.11 and the governed Anki dependency lock.
+Local and CI commands use the same runner. A smoke test must prove the deployed
+function can read the bundled contract before enabling the tab.
+
+### 3. Faculty Console Anki Deck tab
+
+The tab presents:
+
+- snapshot commit and generated date;
+- 189 active source questions and 217 exact rendered notes;
+- counts by category, base/tier2 identity, prior-render state, and risk facet;
+- a searchable list with expandable exact front/back renders;
+- exact prior/current red-green panes for changed renders;
+- source path, anchor, source status, evidence, and policy context;
+- a dedicated high-risk filter shown before the final action;
+- all safety findings included in the snapshot, including `qb_pha_002:base`;
+- a fixed attestation statement and named attester field; and
+- one **Attest entire Anki snapshot** action.
+
+The action remains disabled until the visual payload matches the bundled contract,
+all required sections have loaded, the high-risk view has been opened, the attester
+is nonblank, and the faculty confirmation checkbox is selected. Opening the high-risk
+view is an acknowledgement gate, not a claim that scrolling proves review.
+
+### 4. Versioned risk classification
+
+Risk classification is deterministic, conservative, and versioned. It does not use
+model recall. A closed rules file maps structured qbank fields plus explicit,
+reviewed lexical triggers to these facets:
+
+- Medication
+- Emergency
+- Pregnancy
+- Legal
+- Regulatory
+- Numerical
+- EvidenceSensitive
+- LocalPolicy
+
+Any trigger facet makes the note `High`; only a note with no trigger may be
+`Routine`. Missing or ambiguous classification fails closed as High/
+EvidenceSensitive and must still have complete evidence context. The rules file,
+classifier code, and rule version are part of the attestable input digest.
+
+For High notes, the console displays the exact source/evidence context. Missing
+required evidence blocks the batch. A LocalPolicy facet additionally requires an
+exact validated policy-registry record; the batch cannot substitute general faculty
+attestation for a missing local policy.
+
+The batch reviewer/date supplies the named faculty review for every included note,
+but does not manufacture an evidence record or local policy record.
+
+### 5. Canonical batch-attestation registry
+
+Add `13_Faculty_Resources/anki/batch_attestations.json` and a closed schema. Each
+append-only record contains at least:
+
+```json
+{
+  "batchId": "anki-qbank-<manifest-prefix>",
+  "scope": "active-qbank-and-rendered-notes",
+  "generatedFromCommit": "<40-hex commit>",
+  "baseQuestionBankSha256": "<sha256>",
+  "proposedQuestionBankSha256": "<sha256>",
+  "attestableInputSha256": "<sha256>",
+  "manifestSha256": "<sha256>",
+  "findingSetSha256": "<sha256>",
+  "riskRulesVersion": "pcl-anki-risk-v1",
+  "activeQbankCount": 189,
+  "renderedNoteCount": 217,
+  "highRiskNoteCount": 0,
+  "attestationStatementVersion": "pcl-anki-batch-v1",
+  "reviewedBy": "Joshua Moss, MD",
+  "reviewedAt": "YYYY-MM-DD"
+}
+```
+
+`highRiskNoteCount` is computed, not fixed to zero; zero above is only the schema
+shape example. The final schema also binds stable membership-set hashes for active
+qbank IDs and rendered note keys.
+
+`attestableInputSha256` excludes the batch registry itself to avoid self-reference.
+It includes the projected qbank bytes, every other governed input, the batch/risk
+code and schemas, and the exact finding set. The final release governed-input digest
+continues to include the committed batch registry.
+
+## Save and commit flow
+
+1. The browser posts only the named attester plus the deployed candidate/manifest
+   identifiers. It cannot supply computed membership, risk, render, or finding data.
+2. The Netlify function authenticates with the existing faculty key.
+3. It checks the current GitHub branch HEAD equals the bundled candidate commit.
+4. It fetches current `question_bank.json` and the batch registry.
+5. It requires the qbank base hash and latest registry state to match the contract.
+6. It projects active qbank items to attested and requires the resulting bytes to
+   match `proposedQuestionBankSha256` exactly.
+7. It materializes the batch record only by adding the named reviewer and current ISO
+   date to the bundled mechanical contract.
+8. It validates both new files against their schemas.
+9. It uses the GitHub Git Data API to create both blobs, one tree, one commit, and one
+   conditional branch-ref update. No one-file intermediate state is allowed.
+10. It returns the commit URL and exact counts. A conflict or stale head writes
+    nothing and instructs the reviewer to refresh.
+
+The endpoint never accepts a browser-supplied GitHub path, arbitrary registry
+record, clinical HTML, computed hash, commit message, or reviewer date.
+
+## Release verification
+
+The release evaluator independently rebuilds the projected/current batch manifest
+from canonical repository bytes. A batch is applicable only when:
+
+- its qbank, input, manifest, membership, risk-rule, and finding hashes match;
+- every active qbank ID and every derived rendered note key is covered exactly once;
+- retired qbank IDs are absent;
+- the reviewer/date and statement version are valid;
+- every High note has the required evidence proof;
+- every LocalPolicy note has the required policy proof; and
+- no later input or finding drift exists.
+
+An applicable batch satisfies qbank source attestation and qbank rendered-note review
+for its exact members. It satisfies the matching qbank finding set, so
+`qb_pha_002:base` no longer requires a separate quarantine record. It does not satisfy
+core/application card approvals, legacy Concept dispositions, release-history review,
+or withdrawal approvals.
+
+## Failure behavior
+
+- **Stale console deployment:** disable/save fails; no write; refresh required.
+- **Qbank changed after deployment:** proposed hash mismatch; no write.
+- **Registry changed concurrently:** conditional ref update fails; no write; refresh.
+- **Visual payload/contract mismatch:** tab is read-only and shows a build-integrity
+  error.
+- **Missing source, risk, evidence, policy, render, or prior proof:** batch build
+  fails and the action is absent.
+- **New or changed safety finding:** manifest/finding digest changes; prior batch is
+  inapplicable.
+- **Partial GitHub failure:** no branch ref update means neither canonical file
+  changes.
+- **Release recomputation mismatch:** release remains blocked even if a malformed
+  record somehow reaches Git.
+
+## Test strategy
+
+### Python candidate and release tests
+
+- Exact 189-active-item and 217-rendered-note coverage on the current fixture.
+- Retired items never enter membership or change status.
+- Post-attestation projection renders are the bytes displayed and signed.
+- Deterministic output under identical inputs and both supported Anki versions.
+- One-byte source/qbank/template/risk/evidence/policy/finding drift changes the
+  manifest and invalidates the batch.
+- Missing, duplicate, or extra membership fails.
+- Conservative risk-rule vectors cover every facet and ambiguous fallback.
+- High evidence and LocalPolicy requirements fail closed.
+- Exact `qb_pha_002:base` finding coverage succeeds; changed/missing hashes fail.
+- The 141 legacy Concept identities remain release blockers.
+
+### Console and API tests
+
+- Anki tab loads the visual payload and verifies its contract hash.
+- Search, category, high-risk, and changed-render views show correct membership.
+- Exact front/back and prior/current content is safely escaped and sandboxed.
+- Button enablement requires payload integrity, high-risk acknowledgement, reviewer,
+  and confirmation.
+- Browser cannot override IDs, hashes, risk, findings, date, paths, or commit data.
+- Authentication, CORS, request-size, malformed JSON, and unknown-target tests.
+- Stale head, stale qbank, stale registry, and ref-conflict tests prove zero writes.
+- Git Data API fixture proves the successful path makes one commit containing both
+  canonical files.
+
+### Integration and release gates
+
+- Local Netlify build generates both artifacts from the same commit.
+- Function-bundle smoke test proves the compact contract is available at runtime.
+- Successful batch save is followed by a fresh Python recomputation and release
+  evaluation.
+- Full Anki suite under build, current, and minimum dependency locks.
+- Faculty-console unit tests, static-site checks, and accessibility smoke checks.
+- Protected curriculum bytes remain unchanged except the explicit qbank status
+  projection produced by the named faculty action.
+
+## Security and auditability
+
+- Keep the fine-grained GitHub token server-side and repository-scoped.
+- Keep the shared faculty key behavior unchanged for this milestone.
+- Use constant-time key comparison and the configured allowed origin.
+- Limit the endpoint to two allowlisted canonical paths.
+- Attribute every save to the named attester in both the registry and commit message.
+- Return and display the GitHub commit URL as the durable receipt.
+- Log only identifiers and hashes; do not log clinical card bodies or secrets.
+
+## Branch and integration strategy
+
+The reviewed Task 1–9 branch remains frozen at `dfd9b25`. Design and implementation
+occur on `codex/anki-batch-attestation`, created from that exact commit in the existing
+isolated worktree.
+
+Before integration:
+
+1. Fetch the then-current `main`.
+2. Create a new integration branch from that current `main`.
+3. Compare patch IDs to avoid replaying work already present upstream.
+4. Cherry-pick only the reviewed Anki foundation and batch-attestation commits in
+   dependency order.
+5. Resolve overlaps without discarding upstream work.
+6. Re-run all Anki, console, site, compatibility, and protected-input checks.
+7. Review the integration diff before any merge or pull request.
+
+The main checkout's unrelated `.playwright-cli/` directory and all other worktrees
+remain untouched.
+
+## Acceptance criteria
+
+- A named faculty reviewer can use one action in the existing console to attest all
+  active qbank sources and all exact current Anki renders.
+- High-risk notes and safety findings are visible before the action.
+- The action creates one atomic Git commit and one version-bound batch record.
+- The browser cannot create or alter computed approval data.
+- Current `qb_pha_002:base` is accepted by the exact batch without a separate qbank
+  quarantine decision.
+- Any governed drift invalidates the batch.
+- The release pipeline remains fail-closed, and the 141 legacy Concept blocker stays
+  visible until separately resolved.
+
+## Future enhancement
+
+On re-attestation, default the console to a compact delta receipt such as “17 of 217
+renders changed,” while retaining access to the complete signed snapshot and the
+focused high-risk subset.
