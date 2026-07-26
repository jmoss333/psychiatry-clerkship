# Risk-Aware Publishing Warnings

**Date:** 2026-07-26
**Status:** Approved design
**Audience:** Psychiatry Clerkship Library maintainers and faculty reviewers

## Plain-language summary

The library already records whether each learner-facing page or tool has been
reviewed, and several individual tools show their own draft warnings. The behavior
is inconsistent, however: a pending record does not automatically create a
page-specific warning, warning wording can drift between tools, and no central risk
classification determines how prominent the warning should be.

This design makes `13_Faculty_Resources/reviewed.json` the single governance ledger
for shipped pages and tools. The build validates that ledger, the shared MS3 and
resident sites display consistent review status, and directly opened tools retain
the same warning. Pending material may still publish, but it cannot look attested.

## Current behavior

- The shared shell displays a general site notice that some content is pending
  review.
- The shell displays reviewer and date for reviewed pages and tools.
- The shell does not automatically display a page-specific warning when
  `reviewed.json` marks an item `pending`.
- The build removes Markdown `Review status` blockquotes from published pages.
- Some surfaces implement their own visible warnings, including draft question-bank
  items, the Interview Room, the agitation trainer, and One Patient, Six Weeks.
- Other pending status can exist only in metadata or non-visible comments.
- `topic_meta.json` and tool metadata contain overlapping review signals that can
  drift from `reviewed.json`.

## Goals

1. Give every shipped page and tool one canonical governance record.
2. Make pending material visibly different from reviewed material.
3. Scale warning prominence to the recorded risk.
4. Preserve warnings when a tool is opened outside the shared site shell.
5. Fail publication when governance metadata is missing, malformed, or
   contradictory.
6. Preserve the present policy that pending content may publish with an appropriate
   warning.
7. Keep faculty judgment authoritative for risk classification and attestation.

## Non-goals

- Changing clinical recommendations, local policy, doses, citations, or teaching
  content.
- Attesting any currently pending item.
- Replacing the faculty console.
- Introducing learner accounts or new analytics.
- Adding evidence-staleness automation in this increment.
- Physically merging the MS3 and resident sites.

## Relationship to the evidence-reliability design

`docs/superpowers/specs/2026-07-12-evidence-reliability-zotero-design.md` already
establishes two important boundaries that this design preserves:

- `reviewed.json` is the sole authority for page/tool review status.
- Claim-level evidence and risk remain in the evidence and clinical-claim
  registries.

This design refines the earlier proposal for page/tool publishing risk. The nested
`risk.kind` and `risk.level` object defined below replaces the earlier proposed
surface fields `riskLevel` and `localPolicyDependent`; those values must not coexist
as separately editable fields. Future hash-bound attestation fields such as
`contentHash`, `claimsHash`, and `evidenceHash` may coexist with this record without
changing the warning policy.

Surface risk and claim risk serve different purposes. The surface record determines
how an entire page or tool publishes. Claim records determine evidence traceability
inside high-risk content. Validation must reject a high-risk claim attached to a
surface classified below that claim's risk, but it may allow a surface to be more
conservative than its individual claims.

## Canonical governance record

`13_Faculty_Resources/reviewed.json` remains the source of truth. Every shipped
Markdown page and HTML tool must have one record:

```json
{
  "status": "pending",
  "risk": {
    "kind": "clinical",
    "level": "high"
  },
  "reason": "New clinical simulation awaiting faculty review",
  "by": "Pending faculty review",
  "at": "2026-07-26"
}
```

### Required fields

- `status`: `pending` or `reviewed`
- `risk.kind`: `general`, `clinical`, `legal`, `formulary`, or `local-policy`
- `risk.level`: `low`, `moderate`, or `high`
- `by`: non-empty reviewer label; pending records use `Pending faculty review`
- `at`: ISO date (`YYYY-MM-DD`) recording the current decision
- `reason`: required for pending records; optional for reviewed records

Notes remain optional for internal context. They do not replace the concise
learner-facing `reason`.

### Risk semantics

- `general`: orientation, navigation, study workflow, or non-clinical educational
  material
- `clinical`: diagnosis, assessment, safety, treatment, or clinical communication
  teaching
- `legal`: law, reporting, consent, confidentiality, or legal-status teaching
- `formulary`: medication availability, selection, monitoring, or order-set detail
- `local-policy`: institution-, hospital-, unit-, or workflow-specific instruction

Risk level describes the consequence of learners treating unreviewed material as
authoritative:

- `low`: unlikely to affect a clinical or operational decision
- `moderate`: could influence reasoning or communication but includes normal
  supervisory checks
- `high`: could influence safety, legal, medication, emergency, or local-policy
  action

Clinical, legal, formulary, and local-policy classifications that are not
mechanically obvious require faculty confirmation. Automated suggestions may prepare
a review worksheet, but they never become authoritative without that confirmation.

## Publishing policy

| Governance state | Publication | Learner presentation |
|---|---|---|
| Reviewed, any risk | Allowed | Reviewer/date receipt |
| Pending, low or moderate | Allowed | Compact pending-review badge and reason |
| Pending, high | Allowed | Prominent warning, reason, supervision/policy instruction, and feedback route |
| Missing or invalid record | Blocked | Build fails |
| Contradictory review signals | Blocked | Build fails with the conflicting sources |
| Runtime governance data unavailable | Site remains usable | Fail-safe “Review status unavailable—verify with faculty” notice |

A pending item must never render identically to a reviewed item.

High-risk local-policy warnings must explicitly instruct the learner to verify the
current institutional policy or workflow. High-risk clinical, legal, or formulary
warnings must instruct the learner to verify decisions with a supervising clinician.
Warning templates are fixed application text, not generated clinical prose.

## Architecture

### 1. Governance ledger and schema

A JSON Schema defines the record shape, enumerations, conditional `reason`
requirement, reviewer label, and ISO-date format. The schema covers every record in
`reviewed.json`.

### 2. Governance validator

The existing attestation-consistency validator is extended to:

- require one record for every page and tool in the built navigation;
- reject records for impossible statuses or risk values;
- reject `reviewed` records with a pending reviewer label;
- require a reason for pending records;
- compare overlapping `topic_meta.json`, `[RC-META]`, pack, and ledger status;
- report exact file and field names for contradictions; and
- verify that both site variants receive the same shared-item governance decision.

Missing or contradictory governance is a hard error. A valid pending record is not
an error.

### 3. Normalized build artifact

The publisher creates a deterministic `governance.json` artifact for the browser. It
contains only presentation-ready fields needed by the learner sites:

```json
{
  "one-patient-six-weeks.html": {
    "status": "pending",
    "riskKind": "clinical",
    "riskLevel": "high",
    "reason": "New clinical simulation awaiting faculty review",
    "reviewer": "Pending faculty review",
    "reviewedAt": "2026-07-26"
  }
}
```

The artifact is derived from the canonical ledger; it is not edited by hand.
Stable ordering makes changes reviewable. Learner clients use `governance.json`
rather than the source ledger so internal notes and future server-only attestation
fields are not published.

The existing `tool-governance.json` remains the cross-repository provenance and
policy envelope for tools. It is not a second learner-status authority. Tool
envelopes must derive review category, safety severity, review status, and
attestation status from the same canonical ledger record, and validation must reject
any difference between those envelope fields and `governance.json`.

### 4. Shared-shell presentation

The MS3 and resident shells use the normalized artifact to render:

- a prominent warning above pending high-risk content;
- a compact badge for pending low/moderate content;
- the existing reviewer/date receipt for reviewed content;
- pending status in navigation and search results; and
- a fail-safe status-unavailable notice if the artifact cannot load.

The warning receives focus only when navigation lands on a pending high-risk
surface and doing so does not disrupt an active faculty-preview flow. It uses
semantic status/alert markup appropriate to urgency, remains keyboard accessible,
and does not rely on color alone.

### 5. Direct-tool presentation

HTML tools can be opened without the shared shell. During publication, every pending
tool receives a standardized warning inside the built artifact. Embedded mode shows
exactly one warning: the shell supplies the outer warning and marks the same-origin
iframe as a governed embed, while the injected tool warning suppresses itself only
when it is inside that governed embed. Opening the tool at the top level always shows
the injected warning.

Source tools do not need bespoke warning wording. Existing tool-specific draft
labels may remain as secondary status text during migration, but the standardized
warning is authoritative and duplicate prominent warnings are removed.

### 6. Faculty console

Attestation and reopening actions preserve risk classification:

- attesting changes `status`, `by`, and `at` but retains `risk`;
- reopening sets `status: pending`, records a concise reason, and retains `risk`;
- changing risk is an explicit faculty action, separate from attestation; and
- stale-write protection continues to apply to the exact reviewed revision.

## Data flow

1. A maintainer or faculty reviewer records governance once in `reviewed.json`.
2. Validation joins the ledger to both navigation manifests and overlapping source
   metadata.
3. Invalid or contradictory state stops the build.
4. The publisher creates the normalized browser artifact and injects direct-tool
   warnings.
5. The shared shell renders the appropriate warning, badge, or review receipt.
6. Static QA verifies that the built presentation matches the canonical decision.

## Error handling

- **Malformed JSON or schema failure:** stop before assembling either site.
- **Shipped item missing from the ledger:** stop and name the item and site.
- **Ledger/source contradiction:** stop and show both values and their locations.
- **Direct-tool injection failure:** stop if the affected item is pending.
- **Browser artifact fetch failure:** show the generic status-unavailable notice;
  do not imply that the current item is reviewed.
- **Unknown item reached at runtime:** show status unavailable and provide the
  existing feedback route.
- **Faculty-console write conflict:** retain the current unsaved decision and require
  refresh/review rather than overwriting newer governance.

## Migration

The migration is governance-only and does not alter clinical content.

1. Inventory the current ledger entries and all MS3/resident navigation targets.
   As of `origin/main` on 2026-07-26, the ledger has 110 records: 94 reviewed and
   16 pending. Treat these counts as a measured baseline, not a permanent invariant.
2. Preserve every existing reviewed or pending decision.
3. Prepare proposed risk classifications using existing explicit signals such as
   `safetyLevel`, `LOCAL_POLICY`, `[RC-META]`, pack status, and navigation category.
4. Route ambiguous clinical, legal, formulary, and local-policy classifications for
   faculty confirmation.
5. Add the accepted classification to every ledger record.
6. Enable schema and contradiction checks.
7. Generate warning presentation for every current pending surface.
8. Move current learner consumers, including One Patient, Six Weeks, from the
   published source ledger to the normalized artifact.
9. Enable strict missing-record enforcement only after the ledger is complete.

The current dirty checkout contains unrelated evidence-review and smoke-test work.
Implementation must touch only the approved governance/build/test files and preserve
all unrelated changes.

## Expected tracked-file boundary

The implementation plan may narrow this list further, but it must not expand it
without a new design decision:

- Modify `13_Faculty_Resources/reviewed.json`.
- Add a schema beside the ledger.
- Modify `13_Faculty_Resources/_automation/validate_attestation_consistency.py` and
  its tests.
- Modify the minimum required publishing files under
  `13_Faculty_Resources/_automation/site_build/`, including `build_deploy.py`,
  `spa_index.html`, and `check-static-site.mjs`.
- Modify `resident_section.py` only if resident-specific assembly cannot consume the
  shared normalized artifact without a change.
- Modify the minimum faculty-console read/write model and its tests so risk survives
  attestation and reopening.
- Modify pending tools only to remove competing prominent warning logic or to consume
  the standardized governed-embed contract; do not alter their clinical behavior.
- Add targeted root and Playwright tests.

No evidence registry, clinical-claim registry, clinical prose, question-bank item,
media, or local-policy value changes belong in this increment.

## Accessibility and learner experience

- Warning meaning is conveyed by text and iconography, not color alone.
- High-risk warnings use a heading and concise action statement.
- Warnings are readable at mobile widths and do not obscure tool controls.
- Navigation/search badges have accessible names.
- Route changes announce the new status without repeatedly interrupting the learner.
- Reviewer/date receipts remain visible but lower emphasis than pending warnings.
- Warning language distinguishes educational status from emergency clinical advice.

## Verification

### Contract and unit tests

- Valid reviewed and pending records pass the schema.
- Invalid status, risk kind, risk level, reviewer, date, and missing pending reason
  fail with field-specific errors.
- Attestation and reopening preserve risk.
- Contradictory ledger, topic, RC-META, and pack states fail.
- Normalized output is deterministic.

### Static build checks

- Every MS3 and resident nav target has one governance record.
- Every pending HTML tool contains the standardized direct-access warning.
- Reviewed tools do not contain the pending warning.
- Search and navigation data carry pending state.
- Existing `cw_*` and `rp_*` storage-key gates remain green.

### Browser checks

- Pending high-risk Markdown page in the shared shell
- Pending high-risk embedded tool
- The same tool opened directly
- Pending low/moderate surface
- Reviewed page and reviewed tool receipts
- Governance-artifact fetch failure
- MS3 and resident navigation/search badges
- Keyboard, screen-reader announcement, contrast, and mobile layout behavior

Visual baselines are refreshed only through the Ubuntu/Chromium workflow.

### Build order

Run the shared-output builds sequentially:

1. `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3`
2. `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`

Then run targeted browser tests against both outputs.

## Acceptance criteria

- Every shipped page and tool has one valid governance record.
- Every pending surface is visibly distinguishable in the shared shell.
- Every pending high-risk tool remains visibly marked when opened directly.
- Exactly one prominent warning appears for a pending embedded tool.
- Reviewed surfaces display reviewer and date.
- Pending high-risk local-policy material tells learners to verify current policy.
- Missing, malformed, or contradictory governance blocks publication.
- Runtime status-load failure does not imply approval.
- Faculty-console status changes preserve the risk classification.
- MS3 and resident builds, validators, static QA, root tests, and targeted browser
  checks pass.
- Existing learner storage, navigation behavior, clinical text, and unrelated dirty
  work remain unchanged.

## Next increment

After this foundation, build a faculty classification and review queue that groups
ambiguous records by risk kind and allows deliberate batch confirmation without
batch attestation.

## Future idea

Add a “Why is this pending?” disclosure that distinguishes evidence freshness,
clinical review, local policy, and technical validation, then routes feedback to the
matching faculty queue rather than a generic inbox. This is intentionally outside
the first increment.
