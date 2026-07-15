# Family Systems Practice — active-retrieval loop — design

**Date:** 2026-07-15
**Author:** Joshua Moss, MD (with Claude Code)
**Canonical repository:** `jmoss333/psychiatry-clerkship`
**Primary audience:** third-year medical students and residents on inpatient psychiatry
**Status:** approved design, pending implementation plan

## Purpose

Turn Family Systems Practice from a passive reference-and-self-attest tool into an active-retrieval
practice loop, without discarding any of its existing expert content, without adding any free-text
or patient-data surface, and without introducing new clinical claims that would enlarge the faculty
attestation burden.

Today the tool presents eight fictional-composite family/collateral/discharge scenarios. Each shows
its `prepare / ask / say / avoid / handoff / safety` guidance all at once, and the learner toggles a
self-check checklist. It is the highest-quality reference card in the suite that never asks the
learner to *produce* anything or tests a decision — it tells, but never checks.

This design keeps that reference intact as one mode and adds a second mode in which the learner
**generates a response first, reveals the expert version to self-compare, and self-rates**, with the
self-rating feeding the repository's existing SM-2 spaced-repetition engine so weak scenarios
resurface on a schedule instead of being one-and-done.

This realizes the future improvement already anticipated in
`2026-07-15-one-patient-checkbox-examples-design.md` ("ask learners to say their own response before
revealing the model"), applied to Family Systems Practice.

## Success criteria

The feature succeeds when:

1. The tool offers a **Practice / Reference** toggle. Reference mode reproduces today's behavior
   exactly, including the existing checklist and `cw_family_v1` progress.
2. In Practice mode, each scenario presents its retrieval prompts as `generate → reveal → self-rate`
   cards. The expert reveal is the scenario's own existing content; no expert line is rewritten.
3. Selecting a self-rating (Again / Hard / Good / Easy) creates or updates a spaced-repetition card
   in `cw_srs_v1` under a `FAM#<scenario>#<prompt>` id and computes a future `due` date using SM-2
   math identical to the question bank's.
4. Family cards created this way are counted by the home dashboard's existing due badge with no
   change to `spa_index.html`.
5. `review.html` (Daily Review) and `question-bank-practice.html` are not modified and do not
   regress: neither renders nor breaks on `FAM#` cards.
6. Generation is spoken or scratch only. The tool persists no free text and no patient data; only
   card scheduling metadata and the pre-existing checklist state are stored.
7. Reveal, self-rate, and mode-toggle controls are fully operable by keyboard and assistive
   technology.
8. The MS3 and resident site builds and the `check-static-site.mjs` QA gate pass.

## Approaches considered

This design was selected from three during brainstorming.

### A. Active-retrieval upgrade — selected

Keep the reference content and add a generate-then-reveal-then-self-rate loop plus spaced
resurfacing. Lowest authoring and attestation cost, because the reveals are existing exemplars and
no new "best vs. harmful" adjudication is introduced. Truest to sharpening the existing tool.

### B. Decision-point practice — rejected for now

Insert branching "what do you say next?" choices with best/partial/harmful feedback, mirroring the
Communication Practice tool. Crisper feedback, but it adds substantial authoring, a new
faculty-attestation surface per choice, and risks converging on a tool that already exists. A future
phase may add a few decision points to the highest-yield scenarios.

### C. Family-meeting micro-simulator — rejected as out of scope

A branching engine where the family system reacts to each move. Most distinctive but the largest
build and highest attestation cost; it is effectively the separately tracked "Family Meeting
Simulator" backlog item (P2-2), not a sharpening of this tool.

## Interaction design

### Mode toggle

The tool gains a two-state **Practice / Reference** control near the header, persisted per browser
alongside existing tool state. The choice matters because the `[RC-META]` tag already lists
`settings=rounds-prep`: a clinician scanning the guidance minutes before a family meeting needs the
current read-through, which Reference mode preserves unchanged.

- **Reference mode** renders exactly what ships today: all sections visible, the existing self-check
  checklist, `cw_family_v1` progress, filters, and reset.
- **Practice mode** renders the retrieval loop below the scenario framing (title, setting,
  `learnerGoal`, `opening`, faculty-review badge).

### Retrieval card loop

In Practice mode, each scenario presents two to three retrieval cards. Each card is a small unit
with three states:

1. **Prompt.** A short instruction to produce a response out loud or on scratch — for example, "Say
   your opening line for this family," "Name the three-to-five collateral questions you would ask,"
   or "What is the trap here — what would you *not* do?" The interface states plainly that nothing is
   recorded.
2. **Reveal.** A control that discloses the scenario's own existing content for that move (the
   `opening`, `ask`, or `avoid` field). The reveal is labeled as a model, not an answer key, matching
   the "One way to say it" framing used by One Patient, Six Weeks.
3. **Self-rate.** Four buttons — Again, Hard, Good, Easy — answering "how close was your response to
   the model?" Selecting one writes the spaced-repetition card and advances.

After the cards, the scenario's `say`, `safety`, and `handoff` sections and the existing checklist
remain available as post-reveal debrief. The `prepare` section is shown as framing before the cards.

### Ordering and resurfacing

Within a scenario, Practice mode shows a small "N due" indicator (the scenario's due / started /
total). **Shipped scope:** cards are presented in authored order. Sorting a scenario's *due* cards to
the front was deferred — the deck is only 2–3 cards and the due count is already surfaced, so the
ordering gain is marginal (recorded in the future-work register). The tool does not implement a
new-cards-per-day throttle in this version; the deck is small and scenario-scoped.

## Data contract

Add one optional property, `retrieval`, to each scenario in `family_systems_scenarios.json`. Because
the scenario object is validated with `additionalProperties: false`, the property must be added
explicitly to `family_systems_scenarios.schema.json` or strict validation will reject every scenario
that uses it.

```json
"retrieval": [
  { "id": "opening", "prompt": "Say your opening line for this family.", "revealFrom": "opening" },
  { "id": "ask",     "prompt": "Name the collateral questions you would ask.", "revealFrom": "ask" },
  { "id": "avoid",   "prompt": "What is the trap here — what would you not do?", "revealFrom": "avoid" }
]
```

- `id` matches `^[a-z0-9_]+$` and is unique within its scenario. It becomes part of the SRS card id,
  so it must be stable across edits.
- `prompt` is the learner-facing instruction.
- `revealFrom` names an existing scenario field (`opening`, `ask`, `say`, `avoid`, `handoff`) whose
  content is disclosed on reveal. An optional `revealText` string may override with bespoke content
  when no existing field fits; when present it is escaped and shown verbatim.

If a scenario omits `retrieval`, the renderer derives a default set from the fields that exist
(`opening`, then `ask`, then `avoid`), so the eight current scenarios gain the loop with no content
authoring. Authors may later add or reword prompts as pure data.

The contract test must reject:

- a `retrieval` value that is present but not an array;
- an entry missing or with a blank `id` or `prompt`;
- an `id` that violates the pattern or repeats within a scenario; and
- a `revealFrom` that names neither an existing populated section nor a `revealText`.

No change is made to the required scenario fields, so existing data remains valid.

## Spaced-repetition integration

### Store and identity

Family cards live in the shared `cw_srs_v1` store, which already holds multiple id namespaces in
production: `QB#` for question-bank items (`question-bank-practice.html`) and `TOPIC#` for reviewed
topic pages (seeded by `spa_index.html`). Family cards use a third namespace,
`FAM#<scenarioId>#<retrievalId>`. The double separator is safe because no consumer parses these ids
except by exact-prefix checks (`spa_index.html` only slices ids that begin with `TOPIC#`).

Cards are created lazily on first self-rate, exactly as `QB#` cards are, so prompts a learner has
never attempted do not exist in the store and never inflate any due count.

### Grading

The four self-rating buttons map directly to the SM-2 grades the engine already accepts
(Again / Hard / Good / Easy); no confidence-times-correctness derivation is needed, because there is
no objective key. A learner rating recall against a model exemplar is the canonical SM-2 use case.

The tool duplicates the question bank's `applyGrade` function verbatim (ease floor 1.3, interval cap
365 days, the same first-encounter and lapse arithmetic). Duplication is required by the single-file
tool convention — `review.html` and `question-bank-practice.html` already each carry their own copy.
A test asserts interval parity with the question bank's implementation for a fixed grade sequence.

### Store safety

Writing a card is a defensive read-modify-write of the whole `cw_srs_v1` object: parse with a
fallback to a fresh store shape on any error, set only the tool's own `FAM#` key via `applyGrade`,
and save. The tool never deletes or rewrites `QB#` or `TOPIC#` cards. Cross-tab writes are
last-write-wins, matching every existing tool. Aggregate `stats.totalReviews` and `stats.seen` are
incremented because a family review is a review; `stats.correct` is left untouched because there is
no objective correctness to report.

### The Daily Review boundary (known limitation)

`review.html` builds its session from a *catalog* of cards it knows how to render — `TOPIC#`
quizzes and `QB#` bank items, all multiple-choice shaped — and looks up each catalog card's due
state. It never iterates the raw store to render arbitrary cards. Consequently:

- Foreign `FAM#` cards cannot crash Daily Review; they are simply outside its catalog and never
  appear there. This is why Daily Review needs no change and cannot regress.
- The home badge's `dueCount()` iterates the store generically, so it *does* include due `FAM#`
  cards.

The honest consequence is a bounded display gap: the home due badge can exceed what Daily Review
shows by the number of family prompts a learner has started and that are now due. Those family cards
are reviewed inside the family tool, which is their review surface. This is the accepted cost of
confining the change to a single tool.

Teaching `review.html` to render a family "deck" (its card model already supports a `deck` concept)
would fully unify review but touches a second tool and adds another attestation surface. It is a
deliberate non-goal for this version and is recorded as the natural next step if unified review is
wanted later.

## Architecture and isolation

The change is confined to three files plus tests:

- `family_systems_scenarios.json` — optional `retrieval` content (faculty-editable).
- `family_systems_scenarios.schema.json` — the `retrieval` property definition.
- `06_Family_and_Relational/family-systems-practice.html` — the renderer, gaining three
  well-bounded pieces:
  1. a **mode toggle** that selects Reference (today's render path, untouched) or Practice;
  2. a **retrieval-card component** that owns one card's prompt → reveal → self-rate lifecycle and
     is unit-testable in isolation; and
  3. an **SRS adapter** — a small module holding the duplicated `applyGrade`, the lazy
     load/create/save of `FAM#` cards, and the due computation. It is the only code that touches
     `cw_srs_v1` and exposes a narrow surface (`gradeCard(scenarioId, promptId, grade)` and
     `dueForScenario(scenarioId)`).

No changes are made to `spa_index.html`, `review.html`, `question-bank-practice.html`, the build
pipeline, or `_headers` (which already serves `family_systems_scenarios.json` uncached). The tool's
built slug remains `family-systems.html`; its `[RC-META]` version increments to reflect the new
interaction.

## Accessibility

The mode toggle is a labeled control pair with `aria-pressed` state. Each reveal is a native button
whose accessible name identifies what it discloses; the revealed content follows the prompt in
reading order and is associated with an `aria-describedby` relationship where a native control owns
the card. Self-rating buttons are a labeled group; the four grades are distinguishable by text, not
color alone. Focus-visible styling and the existing Clinical Warm palette are reused unchanged, and
no hover, pointer, or animation is required to reach any content.

## Privacy and storage

The page continues to prohibit real-patient information and provides no free-text field; generation
is spoken or scratch and is never captured. Persistent state is limited to the existing
`cw_family_v1` checklist data (unchanged) and the family scheduling cards added to `cw_srs_v1`
(grade math, intervals, due dates, and lapse counts only). No model text, no learner text, and no
patient data are ever written to storage.

## Attestation impact

Because every reveal is an existing expert line and the design introduces no new "best" or "harmful"
judgments, the clinical content of the eight scenarios is unchanged. All scenarios currently ship
`facultyReview.status: "draft"` and require sign-off regardless of this change. Faculty re-attest the
reframed presentation, not new claims. `reviewed.json` semantics are unaffected.

## Verification

Implementation follows a test-first sequence:

1. Extend the family scenarios contract test to enforce the `retrieval` rules above, run it, and
   observe the expected failure once a `retrieval` block is added to the JSON before the schema and
   renderer support it.
2. Update `family_systems_scenarios.schema.json`; rerun the contract test to green.
3. Add a unit test asserting the tool's `applyGrade` produces intervals identical to the question
   bank's for a fixed grade sequence, and that a first self-rate creates a `FAM#` card with a future
   `due`.
4. Add a focused browser test (extending the P2-6 browser-smoke-test practice to this moderate-risk
   tool): load the tool, switch to Practice, reveal a card, self-rate Good, and assert exactly one
   `FAM#` card was written with a future `due`, that no `QB#` or `TOPIC#` card was altered, and that
   Reference mode still renders the original checklist.
5. Run the family data test, the browser test, JSON parsing, and the MS3 and resident site build
   checks including `check-static-site.mjs`.
6. If browser smoke testing stalls on the default runtime, retry with the repository's established
   Node path before classifying the test as broken.

## Scope boundaries

This version does not add: learner-authored or captured text; branching decision choices or
best/partial/harmful scoring (Approach B); a reactive family simulator (Approach C); any change to
`review.html`, `spa_index.html`, or the question bank tool; a new storage schema version; a
new-cards-per-day throttle in the family tool; or any change to the visual design system.

Two future steps are recorded but out of scope here: teaching Daily Review to render a family deck
for fully unified review, and adding a small number of Approach-B decision points to the two or
three highest-yield scenarios.
