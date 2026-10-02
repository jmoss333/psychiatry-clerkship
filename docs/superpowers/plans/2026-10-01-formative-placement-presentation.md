# Formative placement presentation

Base: current main 4aff4ef9fbc1fec81ca4a5c0506b9c52798c6646 (includes #920 and #922).

## Inspectable bounded plan

1. Replace the unsupported two-minute promise in placement launch, loading, question, and retake labels with formative placement. Loaded presentation derives question count from the existing attested pool, not a second fixed count.
2. Describe this as optional, untimed formative practice and an initial estimate, not a grade. State that unsubmitted answers are not saved; the existing flow resets them on reopening and has no unfinished-attempt storage. Add a polite accessible answered-count announcement.
3. Preserve exact questions, options, scoring, mastery calculation, submitted-result stores, plan algorithm, guest behavior, and private supervisor/reflection/ReConnect boundaries. No save/resume feature or new storage/backend/AI calls.
4. Validate both audience builds, full required local gate, focused storage/plan contracts, keyboard/mobile/large-text/repeated/interrupted browser flows and unchanged submission/scoring. Independently review the whole diff. One batched push and draft PR; monitor exact-head CI. No merge/release authority for this slice.

## Independent contract inspection

The existing pool is built from attested question-bank items; the producer and QA gate own the twelve-category sampling. PRETEST_POOL is fetched lazily; ptAnswers is in memory and resets in startPretest. Submitted cw_pretest_v1/cw_qb_v1/cw_plan_v1 writes catch storage errors; genuine practice records take precedence on retake. None is an unfinished-attempt store. The dynamic counter already counts answered indexes; this change only exposes its status semantics.

Today retains the reviewed FD_TODAY_PRIMARY_ORDER and existing 5/10/20-minute block planner. An optional purpose chooser is deferred to a separate coherent slice: before implementation, map rounds/interview/family/study to existing faculty-curated IDs and specify interaction with unfinished work/reviews. No new purpose mapping, clinical curriculum, protected preview route or feature flag is introduced here.

Historical design SPEC_diagnostic-pretest-personalized-path.md contains the old timing claim; this plan supersedes only its presentation wording, not its content/assessment contracts.

## Scoped validation finding

A deterministic delayed-load contract reproduced a preexisting race: an earlier pending pool response resets a newer reopened attempt after the learner answers. Guard each startPretest request with an in-memory generation counter so only the newest attempt can accept its load. This adds no persistence, question/scoring change, or network calls. Include delayed-load and backward/forward regression coverage and independently re-review the small change.
