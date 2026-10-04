# Automated evidence surveillance with final faculty review

Proposed design — October 3, 2026. Not implemented or activated.

## Intended outcome

Automatically find source changes, locate the readings and question-bank items they may affect, and prepare a single review packet. Faculty spend their time deciding whether teaching should change, rather than finding and assembling evidence. Clinical publication and attestation remain explicit faculty decisions.

## Recommended approach and alternatives

Extend the existing scheduled surveillance workflow and authenticated faculty console. Reuse PR #948's retrieval checks, source snapshots, and precise passage mappings. This preserves the established review and revision controls.

A report-only scheduled brief would be faster to ship but still requires faculty to navigate between files and questions. A separate Firecrawl dashboard would duplicate authentication, review state, and governance. Neither is the preferred final destination.

## Automated path

1. Collect the five registered pilot sources weekly, with a manual run option. Keep cadence configurable; increase FDA safety monitoring only after the pilot demonstrates useful signal and acceptable cost. Limit each run to the registered sources, with bounded retries and no unbounded crawl.
2. Verify retrieval success, source identity, freshness, content completeness, and mapping validity. Record retrieval failures separately from clinical findings. A blocked or incomplete examination cannot count as an unchanged source.
3. Compare each valid snapshot with its previous observation. Preserve both versions and their hashes. Retain source changes outside mapped passages as unclassified findings needing triage.
4. Build durable packets linking changed passages to exact question fields and reading excerpts. Label direct passage links separately from broader citation associations. First observations establish a baseline; they do not establish clinical currency or faculty approval.
5. Deduplicate recurring observations. Keep unresolved packets pending even when subsequent scans are unchanged. A later source change creates a new revision and invalidates any decision that no longer covers the evidence.
6. Run schema, mapping, and revision checks automatically. Prepare a review-ready packet without writing clinical content or reviewed.json. Reuse existing advisory drafting only after its inputs and outputs support exact question revisions and explicit source attribution; do not make it a prerequisite for the initial release.
7. Display actionable changes and operational failures in distinct sections of the faculty console. Quiet successful runs remain in the audit history. Do not add external messages or email delivery as part of this phase.

## Faculty screen

Each packet shows the source title and canonical link, retrieval times, old and new passages with a readable diff, and the affected questions and readings beside them. Show the exact question stem, affected explanation or option, mapping reason, and current saved revision. Clearly label the proposed impact as needing judgment.

Use the existing console's item links and editing flow. Faculty may record no teaching change needed with a rationale, defer, or open affected items for editing. Saving an edit remains a draft. Final attestation continues through the existing exact-revision review controls; accepting an evidence packet does not attest every linked item.

Record decisions against the packet revision, source hashes, mapping version, and reviewed item revisions. Reject stale decisions server-side. Keep decision attribution server-controlled, using the existing faculty authentication mechanism. A packet closes only when its explicitly selected affected items have recorded dispositions; partial completion remains visible.

## Persistence and security

Use the existing surveillance report-branch mechanism for collection history and a versioned packet index, after verifying its retention and concurrent-update contracts. Keep faculty decisions in the existing authenticated branch/PR workflow with a separate decision record; do not treat report artifacts as attestations. The implementation plan must specify concrete schema and endpoint contracts before product code starts.

Store only necessary excerpts consistent with source permissions. Respect signal-only sources and instrument rights. Treat all scraped text as untrusted evidence, never executable instructions. No PHI, browser credentials, or patient data enters this workflow. Missing FIRECRAWL_API_KEY produces a visible operational failure and cannot produce a green surveillance result.

## Psychiatry education priorities

Start with medication safety and monitoring changes, where a small wording change can alter a learner's next action. The existing clozapine mappings are the first demonstrator, including the possible enrollment-language discrepancy already flagged in qb_anx_003. These are review candidates, not newly established clinical conclusions.

Next, expand curated mappings to guideline changes affecting assessment, treatment sequencing, and transitions of care. Preserve age group, clinical setting, publication date, and source authority so pediatric recommendations are not silently transferred into the adult inpatient curriculum. A new study should be presented as emerging evidence rather than automatically replacing guideline-based teaching.

Reuse existing correction/retraction monitoring rather than scraping a substitute for PubMed/Crossref checks. Link those findings into the same faculty workflow after the initial packet path is verified.

## Required consistency scan (user-approved scope addition)

For each detected source change, automatically scan answer explanations and distractor feedback teaching the same decision. Include possible contradictions in the same faculty packet, with exact quotations, question IDs, field paths, source links, and the reason for the flag. Do not wait for faculty acceptance to run the scan. Preserve individual item decisions and exact-revision attestation. Describe heuristic coverage explicitly; no detected contradiction does not establish clinical consistency.

## Acceptance evidence

- Simulated ANC changes flag the three mapped questions; enrollment changes flag their three mapped questions; unrelated changes do not falsely become targeted flags.
- Missing headings, removed mappings, retrieval failures, and stale item revisions remain explicit failures or unresolved findings.
- An unchanged scan after a changed scan does not close the pending packet.
- Repeated runs do not duplicate packets or discard faculty decisions; concurrent collection and review preserve both changes.
- Unauthenticated decisions are rejected; stale decisions are rejected; packet acceptance cannot write an attestation.
- The faculty screen works with keyboard navigation, small screens, and meaningful diff labels.
- Production workflow invocation is tested without test-only arguments, scheduled-workflow contracts are refreshed, and the repository gate passes.
- One live manual run proves collection, persistence, and display after the secret is configured. Schedule activation is reported separately from code merge and faculty approval.

## Delivery sequence

First complete/recheck PR #948. Then implement durable packet state and the faculty screen with synthetic fixtures, add the bounded scheduled collector, and run end-to-end validation. Configure the GitHub Actions secret securely and verify a live manual run before claiming unattended operation is active.
