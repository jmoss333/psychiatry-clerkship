# Release-passport governance decisions

**Authority:** Joshua Moss, MD  
**Adopted:** 2026-09-20  
**Provenance:** Wording supplied by Josh (drafted by Claude, adopted by Josh).

## Entry 1 — Provenance references faculty review; it never copies it

Provenance artifacts — release passports and any successor format — reference faculty-review status by pointer to the governance record. They never embed a copy of it.

Rationale: content hashes are immutable, faculty judgment is not. Binding both into one object means a stale artifact keeps asserting a review status that has since changed, while hash-matching gates continue to pass.

Enforcement: the passport schema forbids an embedded review-status field. A passport asserting a review status that disagrees with the registry is not treated as current.

Authority: faculty. No agent may alter the pointer target.

## Entry 2 — `third-person` remains an accepted limitation

Scenario `third-person` retains `decision_basis: accepted-limitation`. Its three recurring mismatches are expected output, not defects, and are excluded from defect counts.

Rationale: reclassifying an accepted limitation changes what the system is permitted to do. It carries the same authority requirement as any other label promotion.

`acceptedOn`: 2026-09-20 · `revisitTrigger`: faculty ruling on the `c_si` proposal family · `revisitBy`: 2027-03-31

Authority: faculty only. No agent may reclassify.

## Registry mapping

The registry uses its existing camel-case field convention: `decisionBasis`, `acceptedOn`, `revisitTrigger`, and `revisitBy`. The `revisitBy` date is advisory: reaching it records that faculty review is due, but does not invalidate the decision or block a merge, build, or deployment.
