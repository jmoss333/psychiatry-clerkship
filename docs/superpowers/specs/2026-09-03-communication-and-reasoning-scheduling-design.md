# Communication and reasoning cards in Daily Review

**Date:** 2026-09-03
**Follows:** `2026-09-02-daily-review-recall-cards-design.md` (concept G), which made Daily Review
serve the family cards it already counted.
**Status:** implemented.

## The gap

Two tools recorded a learner's work and scheduled nothing:

| Tool | Store | What it kept | What came back |
|---|---|---|---|
| What Do You Say Next? | `cw_comm_v1` | one attempt per case: `{choiceId, quality, at}` | nothing |
| Diagnostic Reasoning Workbench | `cw_reason_v1` | per step: `{choiceId, quality, at}` | nothing |

So the two surfaces where a student most needs spacing — the words you say to a patient, and the
order you think in — were the two the library never brought back. A learner could answer all
twelve communication cases in week one and meet none of them again for five weeks. Meanwhile
`cw_srs_v1` scheduled decks, topic quizzes, question-bank items and family prompts.

G's closing note named this and said each tool was "a builder plus a fetch". That turned out to be
right, with three qualifications worth recording.

## What shipped

### The cards are `choice`, not `recall`

A family prompt has no options, which is why G needed a second card shape. These two tools already
present options, each carrying an authored `quality` (`best` / `partial` / `missed` / `harmful`)
and its own feedback. So they map onto the queue's **existing** choice card and need no renderer:
`best` becomes the correct option, the option's feedback becomes its explanation.

`choiceOptions()` rejects anything but exactly one `best`. That guard is load-bearing, not
decorative: `correctIdx()` takes the *first* option flagged correct, so a case authored with two
bests would score a learner who picked the second one **wrong**, and one authored with none would
mark every answer wrong. A case failing the guard drops out of the queue; its own tool still
teaches it and the schema validators still see it.

### The gate moved from card kind to a per-card flag

G gated on `card.kind !== 'recall'`. That was the right rule for the wrong reason — it read the
shape when it meant the origin. Communication and reasoning cards are `choice`-shaped and still
must not be sprung cold, so the gate now keys on `seededOnly`:

```js
function queueable(card, cardState){ return !card || !card.seededOnly || !!cardState; }
```

Had the gate stayed shape-based, both namespaces would have entered the new-card stream silently
— 25 cards from tools a learner may never have opened. G's promise holds unchanged: **decks and
topic quizzes remain the only sources feeding the daily new-card allowance.** Verified over every
authored card, not a sample: all 12 communication and all 13 reasoning cards return `false` from
the gate with an empty store, and all of them return `true` once scheduled.

### A reasoning step travels with its patient brief

A step asks things like *"which one-liner best captures the syndrome without prematurely
closing?"* — unanswerable without the case. In the tool the brief is on screen throughout. So each
reasoning card carries `stem` (the case's `patientBrief`), rendered above the question and
visually subordinate to it. A case with no brief is dropped rather than served bare.

This is the one renderer change in the diff, and it is why reasoning cards are honest rather than
a harder, different question wearing the same words.

## Decisions and why

### One card per reasoning STEP, not per case

A case's steps test different moves — build the problem representation, keep the rule-outs open,
then commit to a plan. A learner can be solid on one and lost on the next. Scheduling the case as
a unit would average them and keep re-serving the step already mastered. Card id:
`REASON#<caseId>#<stepId>`.

### The grade is derived, not asked for

Family cards are self-rated because there is no ground truth. These two have one: the option's
authored quality. So the tools schedule silently on the choice the learner already made —

| quality | grade |
|---|---|
| `best` | 3 (Good) |
| `partial` | 2 (Hard) |
| anything else | 1 (Again) |

`best` maps to Good rather than Easy deliberately: Easy stretches the interval hard, and this is
four-way recognition the learner may have guessed. Unknown qualities fail to a lapse, so a quality
added to the data later can never quietly lengthen an interval.

### The store adapter became a shared snippet

`srsFresh` / `srsLoadStore` / `srsSaveStore` lived in `family-systems-practice.html`. Copying them
into two more tools would have put three definitions of the store's shape in the tree. The failure
mode is invisible: `srsFresh` fixes the version tag, the `day` / `stats` / `settings` sub-objects
and the `newPerDay` default, so a tool carrying a stale copy would — on a browser whose store had
never been written — create a store the *other* tools then read as authoritative, resetting a
learner's daily allowance or dropping a stats field the dashboard reads. It would only ever bite
learners who happened to open the wrong tool first.

So `site_build/srs_store.js` (`SNIPPET_MARKERS` 28 → 29), injected into all three scheduling
tools. `applyGrade` was already shared; this is the same argument one level down.

`srsGradeCard` writes `cards` only, never `stats` — Retention counts what Daily Review itself
served, and a grade inferred inside another tool has no place in that denominator.

### Resetting communication history clears its cards

`resetHistory()` now also drops every `COMM#` card, and its confirmation text says so. Otherwise a
learner who cleared the tool would keep being served its cards with nothing left in the tool to
explain where they came from. (The reasoning tool has no reset.)

## A defect this surfaced in #465

`fdBlockDueTotal` counted only the `daily` bucket, with a comment explaining that `FAM#` cards
"are served by Family Systems Practice, so counting them here would promise cards review.html
cannot show". That was true when written and **false the moment #465 shipped** — review.html
serves `FAM#` cards now. The timed-block launcher was therefore under-promising: a learner with
six due family cards and no due deck cards got no review step at all.

Fixed by naming the buckets review.html actually builds a queue from:

```js
var FD_BLOCK_REVIEW_BUCKETS=['daily','fam','comm','reason'];
```

`qb` stays out — the question bank's own session serves those first, so the block reaches them
through its question step. `other` stays out because nothing writes it; an id landing there is an
unrouted namespace, which is a bug in `srsBucket`, not a card to promise.

The general lesson, worth keeping: **adding a card source to review.html is a three-file change**
— the builder, `srsBucket`, and this list — and only the builder is obvious. A test now pins the
list against the buckets.

## What this does not do

- **The 20-second spoken rep does not survive into review.** What Do You Say Next exists because
  you say the line out loud before you see the options; the review is recognition practice on a
  line the learner has already tried to say. That is a real loss and an acceptable one — the
  alternative is a second speaking timer in a queue built for 30-second cards.
- **A card whose case is deleted from the registry** stays counted and unrenderable, the same
  residual G recorded for `FAM#` and the shell gates for `QB#` via `qbRecordServable`. Still rare
  enough (deletion, not editing) not to warrant a second registry read in the shell — but this is
  now the third namespace with the shape, which is the point at which a shared servability check
  starts to pay for itself.
- **No new clinical wording.** Every card's question, options and feedback are the authoring
  tool's own; nothing clinical originates in the review.

## Verification

- `node --test tests/*.test.mjs`: **1636 pass, 0 fail** (new: `comm-reason-cards`).
- Every single-line Python validator in `ci.yml`, run individually. Two PDF-export tests fail on a
  broken system `cryptography` binding in the sandbox, at import, before any repo code runs.
- Both builds + `check-static-site.mjs` on each: no hard finding except the LFS pointer stubs this
  sandbox always produces. Two new soft `computed-key` findings accepted into `qa-baseline.json` —
  the shared snippet reads `localStorage[SRS_KEY]` rather than a literal, the same indirection
  already accepted for family, question-bank, review and shelf-mode.
- **End to end on the built site**, 15 checks: both card kinds served with options and (for
  reasoning) the brief; a correct answer graded Good advances both schedules (`reps` 1 → 2,
  `ivl` → 3 days); the gate rejects all 25 cards cold and admits all of them once scheduled; and
  each tool, driven through its own UI, writes exactly the card id the review builds.
