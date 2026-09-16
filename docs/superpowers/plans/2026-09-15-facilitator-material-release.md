# Facilitator material: delivery and label policy

**Status:** OPEN — faculty decision required. Nothing in this document has been applied
beyond the one correction noted under "What was already fixed".
**Raised by:** faculty attestation review, 2026-09-14 (shared issue 2 of 4).
**Owner of the decision:** Joshua Moss, MD. This is a release-policy call, not an agent call.

## The finding

All 13 pending clinical Case-of-the-Week pages render their facilitator material inside the
learner preview, on the learner site. Their own headings say they should not be there:

| Label as written | Pages |
|---|---|
| `Facilitator Notes (do not distribute to learners)` | 2 |
| `Facilitator Notes (not for the learner handout)` | 2 |
| `Facilitator Notes (not for distribution to learners before the session)` | 10 |
| `Facilitator Notes` / `Facilitator` (unqualified) | 4 |

Counted across the whole `case-of-the-week/` directory, so the totals exceed the 13 pending
pages. Note that the four unqualified headings are a second, smaller inconsistency: the same
kind of section carries a restriction on some pages and none on others.

This is a **mismatch between labels and delivery**, and it can be resolved in either
direction. It is not a finding that facilitator material must always be hidden.

## Why an agent should not just pick one

Both directions change something only faculty can decide:

- **Separating** the notes changes what a learner can reach during a session, and it needs a
  destination that does not exist yet (see below). It also silently changes what the 13
  pending attestations are attestations *of*.
- **Allowing** the current availability changes the teaching design — several of these
  sections name the errors the case is built to spring, and a learner who reads them first
  has had the exercise spoiled. That is a pedagogical judgment about your own cases.

## What was already fixed (independent of the decision)

One thing here was not a policy question but a false statement, and it is corrected in this
branch. `site_build/cotw_meta.py` generated a bullet on every Case-of-the-Week page reading:

> `MS3 / Step 2 CK level. Facilitator notes are kept separate from the learner-facing stem.`

Nothing in the build ever did that. The facilitator section is part of the same markdown
source and ships inside the same page, so learners read the claim and the notes together.
The bullet now reads `… Each discussion question is paired with a teaching point.`, which is
true under either decision below. **The page headings were left exactly as the authors wrote
them** — removing a restriction label to make the mismatch disappear would be the wrong fix,
and it would also destroy the evidence of authorial intent that the decision below rests on.

## The three options

### Option A — Separate the notes from learner builds

Strip the facilitator section from `_build/ms3` and `_build/res` and publish it somewhere
faculty can reach.

*Mechanism is available and has precedent.* `common.py` already carries marker-driven
removals that run over the built tree — `strip_review_banners(out_dir)` and
`strip_claim_anchors(out_dir, known_ids)`. A `strip_facilitator_block(out_dir)` alongside
them, keyed on an explicit `<!-- facilitator-block -->` marker rather than on heading text,
is a small, testable change of the same shape.

*The real cost is the destination.* There is **no faculty-only shipped surface today** —
`shipped_pages.json` lists none. So Option A requires deciding where the notes go:

| Destination | Cost | Note |
|---|---|---|
| A separate faculty Netlify site | Highest — a sixth site, its own build, auth, and deploy | Cleanest separation |
| A page on the existing faculty console | Medium — console already authenticates | Console is a review tool, not a teaching surface |
| A generated packet (PDF/markdown) faculty download | Low–medium | No live link from the case page |

*Consequences to weigh:*
- **Attestation.** Every affected page's ledger row is currently `pending`, so nothing is
  invalidated today. But the 13 pages would become pages the reviewer previews *without* the
  notes, so the attestation would cover less than it does now. Decide deliberately.
- **Do not implement this with CSS or a collapsed `<details>`.** Either leaves the text in
  the DOM, reachable by view-source, in-page find, and print. That is not separation, and
  presenting it as such would be worse than the current honest exposure.
- One wrinkle worth knowing: per `AGENTS.md`, opting a page into the crisis block makes the
  Reader stop collapsing that page. Any collapse-based approach would interact with that —
  another reason marker-driven removal at build time is the right shape.

### Option B — Allow the current availability and revise the labels

Keep everything on one page and rewrite the headings so they stop asserting a restriction
that is not enforced. For example `## Facilitator Notes — teaching guide (visible to all readers)`.

*Cheapest, and defensible*: these are synthetic teaching cases containing no PHI and no
answer key to a graded assessment, and an MS3 who reads the facilitator notes has read more
teaching, not leaked material. The cost is pedagogical, and it is real for the cases whose
notes name the traps the discussion is designed to spring.

If you choose B, the four unqualified headings should be normalized to the same wording as
the rest in the same pass, so the set stops disagreeing with itself.

### Option C — Split the difference by timing

Labels on 10 of the pages restrict distribution *before the session*, not absolutely — which
is a **timing** rule, and timing is the one thing a static site cannot express. A static page
is published or it is not; it has no notion of "after Thursday's session". Option C therefore
collapses into A or B in practice, and is listed only so it is visibly considered rather than
quietly dropped. If the intent really is time-based, the honest implementation is Option A
with faculty distributing the packet at session time.

## Recommendation for your consideration

**Option B for the current 13 pending pages, and A as a later project if you want it.**

Reasoning: B removes the contradiction now, at near-zero risk, and lets the 13 pending
attestations proceed against pages that say what they do. A is the better end state but
requires standing up a faculty surface that does not exist, and doing that *while* 13 pages
sit pending review couples an infrastructure project to a review backlog for no clinical
gain. The material is synthetic and carries no PHI, so the exposure is a teaching-design
cost, not a safety or privacy one — which is what makes deferring A reasonable.

This is a recommendation, not a decision, and the pedagogical half of it is yours: if the
spoiler cost on cases like serotonin syndrome vs NMS is unacceptable to you, that outranks
the implementation cost and the answer is A.

## What happens next, either way

1. Record the decision in `decisions.json` — there is no entry covering facilitator release
   policy today, which is part of why this drifted.
2. Apply the corresponding change in one small PR.
3. Leave the 13 ledger rows `pending`. Neither option attests anything.
