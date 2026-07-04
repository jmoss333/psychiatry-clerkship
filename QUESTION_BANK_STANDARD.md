# QUESTION_BANK_STANDARD — the gold standard for `question_bank.json` items

> **Status:** AI-drafted standard, pending faculty attestation. Every item produced under this
> standard is itself AI-drafted and **pending Dr. Moss's review/attestation** — see §9.
> Companion files: `QUESTION_BANK_BLUEPRINT.md` (categories × counts × source pages),
> `question_bank.schema.json` (machine shape), `QUESTION_BANK_EXECUTION_BRIEF.md` (work order
> for the drafting model).

`question_bank.json` (repo root) is the exam-style question bank for the MS3 clerkship site —
Shelf/COMAT-level single-best-answer items, separate from `topic_meta.json` (whose one-question
"Test yourself" widgets stay exactly as they are). The bank extends that proven pattern into a
real bank: multi-item, category-tagged, trap-tagged, confidence-weighted, and spaced-repetition
aware. An item is the 90-second version of a page's central discrimination, dressed as the exam
will dress it. It must be **derivable from library page text** — the bank examines the library;
it never extends it.

**Copyright and exam security are absolute:** every item is ORIGINAL. Never reproduce, closely
paraphrase, or reverse-engineer real NBME, NBOME/COMAT, USMLE, or commercial-bank (UWorld,
Amboss, etc.) items. If a drafted item feels remembered rather than derived from a library page,
delete it and start over from the page.

---

## 1. Item anatomy — hard constraints

| Field | Rule |
|---|---|
| `id` | stable forever (`qb_<category>_<nnn>`); analytics, SRS cards, and future cohort stats key on it — never renumber or reuse |
| `type` | `sba` (single best answer), `two-tier` (§3.1), or `relational` (§3.4) |
| `stem` | clinical vignette, 2–5 sentences; ends in a positive lead-in question |
| `options` | **exactly 4**, keyed `A`–`D`; exactly one `"c": true` |
| every wrong option | carries a `trap` — the named misconception it encodes (§3.3) |
| `why` | dispatches the traps by name, then states the discriminator |
| `pearl` | one line the learner keeps — ideally the source page's own pearl |
| `evidence` | the anchor **as the source page states it** — never a new citation (§7) |
| `pages` | ≥1 deployed slug (`t_sud.md`) the item is derived from; must include a slug from the item's blueprint category |
| `link` | one deep link — `?page=<slug>.md` or `tools/<name>.html` — continuing the learning path |

Four options, not five: the house "Test yourself" pattern is four, the renderer is four, and the
bar in §3.3 (every distractor a *named* misconception) is what makes items teach — a fifth
filler option would dilute that, not add rigor. All strings are plain text (the SPA HTML-escapes
on render): no markdown, no HTML, no `**bold**`. Em dashes, arrows (→), and straight quotes are
house style. Options may be shuffled at render time — `key` is the option's identity, so the
correct answer's *authored* position still must rotate across the bank (no positional tell in
the JSON, no tell on screen).

## 2. NBME-style item writing — the rules

These are the classic single-best-answer disciplines. Violating any of them makes an item
unusable regardless of clinical accuracy.

1. **Vignette stems only.** Age, setting, timeline, findings — in that rough order, first
   sentence. No stemless recall ("Which drug requires ANC monitoring?") and no pseudo-vignette
   whose clinical detail is decoration for a recall question. The vignette must *force* the
   discrimination.
2. **Cover-the-options.** A learner who covers the options must be able to formulate the answer
   from the stem and lead-in alone. If the question only makes sense after reading the options,
   the stem is broken. (Adaptation for relational items in §3.4.)
3. **Positive, focused lead-in.** "Most likely diagnosis?", "Best next step?", "Which response
   is best?" Never "Which of the following is NOT/EXCEPT/FALSE", never "Which is true about…".
4. **Homogeneous options.** All four are the same kind of thing — four diagnoses, four next
   steps, four things to say. Parallel grammar, comparable length. The correct answer must not
   be the longest, most hedged, or most qualified option.
5. **One defensible best answer.** The other three must be genuinely worse *for a reason the
   source page states* — not merely less complete. If faculty could defend a second option, the
   item is ambiguous: fix it or kill it.
6. **No absolutes, no aggregates.** No "always/never" answers, no "all of the above / none of
   the above." Distractors must be attractive — an option no student would pick is a wasted slot.
7. **Shelf-level cognition.** Target recognition + initial management: pattern → what do you do
   first. Not rare-disease trivia, not attending-level titration, not "which study showed…"
   recall. The student in every stem acts under supervision (§7).
8. **Difficulty is discrimination load, not obscurity** (§5).

### Strong vs weak, field by field

- **Stem — strong:** "A 76-year-old woman, hospital day 3 after hip-fracture repair, is quiet,
  slow to respond, and sleeps much of the day; nurses say she was conversational yesterday
  evening. She cannot recite the months of the year backward. Most likely explanation?" (every
  detail earns its place: timeline, fluctuation, inattention). **Weak:** "An elderly patient is
  confused. Which is the most likely diagnosis?" (no discrimination possible).
- **Lead-in — strong:** "Best next step?" **Weak:** "Which of the following statements about
  delirium is correct?"
- **Options — strong:** four parallel next steps a real team member might propose. **Weak:**
  two diagnoses, a test, and a disposition mixed together; or a correct option twice as long as
  the others.
- **Distractor — strong:** "Major depressive disorder — start an SSRI" (a named trap: hypoactive
  delirium mislabeled as depression; a real consult reflex). **Weak:** "Prescribe chemotherapy"
  (no one falls for it; slot wasted).
- **`why` — strong:** "Fluctuation plus inattention is delirium until proven otherwise — the
  'depression' label is the classic miss for the hypoactive form; dementia declines over months,
  not shifts." (dispatches traps by name, then the discriminator). **Weak:** "The correct answer
  is B because the patient has delirium." (restates, teaches nothing).
- **`pearl` — strong:** "Hypoactive delirium is the dangerous one: commonly missed, worse
  outcomes, easily mislabeled as depression." **Weak:** "Delirium is important to recognize."
- **`evidence` — strong:** "delirium.md 'Recognize and screen' — CAM (Inouye et al.): acute
  onset + fluctuation + inattention + disorganized thinking or altered consciousness." **Weak:**
  "UpToDate, delirium chapter" (not owned content; not what the page states).

## 3. The four baked-in mechanics

### 3.1 Two-tier items (`type: "two-tier"`)

The answer, then the reason. Tier 1 is a standard SBA. Tier 2 immediately asks **why** that
answer is right — a second required selection among 3–4 competing *rationales* — before any
feedback is shown. Use two-tier where the mechanism decides the action (pharmacology, withdrawal
physiology, capacity logic): the item catches students who pattern-match the right move for the
wrong reason.

- **Tier-2 options are rationales, not facts.** The correct rationale is the mechanism as the
  source page states it. Strong distractor rationales are the *reasoning behind the tier-1
  distractors* (the student who almost chose "start buprenorphine now" believes a specific wrong
  thing — offer that belief as a tier-2 option) plus common wrong mechanisms.
- **Scoring:** both tiers right = correct. Right answer + wrong reason = **"right, shaky
  reason"** — displayed as such (not as a pass), scored half for mastery purposes, and the SRS
  grade is capped at *Hard* (§6) so the item resurfaces soon. Wrong tier-1 = wrong, regardless
  of tier 2 (tier 2 still shown and answered — the feedback teaches against both selections).
- Tier 2 has its own one-line `why`. It never introduces claims the source page doesn't make.

### 3.2 Confidence weighting

Every item (all types), the learner commits a confidence **at answer time, before feedback**:
**guess / likely / certain**. Submitting = answer + confidence in one action; there is no
post-hoc adjustment.

Scoring and spaced-repetition mapping — onto the existing SM-2 grades in `review.html`
(Again / Hard / Good / Easy; `cw_srs_v1` cards, ease floor 1.3, interval cap 365 d):

| | **Correct** | **Incorrect** |
|---|---|---|
| **certain** | Easy — longest interval, ease up | **Again + confidently-wrong flag** — interval reset, lapse recorded, front of queue |
| **likely** | Good — standard interval | Again — interval reset |
| **guess** | Hard — short interval; a lucky guess is not mastery | Again — interval reset (expected miss; no flag) |

- **Confidently wrong is the payload.** certain + incorrect items are flagged, resurface first,
  and feed the SPA's "Focus next · your weak spots" panel via the item's `pages` slugs (the
  same route `cw_quiz_v1` misses already take). Miscalibration is more dangerous on the wards
  than ignorance — the mechanic exists to surface it.
- **Calibration stat:** per category, show "% of your *certain* answers that were correct."
  Below ~80% is the teaching moment, independent of the raw score.
- Two-tier interaction: the tier-scoring cap (§3.1) applies after the confidence mapping —
  certain + right answer + wrong reason still lands at Hard, and certain + shaky-reason twice
  in a row is surfaced like a confidently-wrong.
- Bank responses persist in their own namespace (`cw_qb_v1`), keyed by item `id`; per-item SRS
  cards use id-based keys (`QB#<id>`), parallel to the existing `TOPIC#<file>` cards.

### 3.3 "The trap you fell for" — distractor tagging

Every wrong option carries `trap: {name, note}`:

- `name` — the misconception in 2–6 words, reusable across items ("the righting reflex",
  "denies SI = low risk", "agitation = antipsychotic"). Draw from the trap vocabulary in
  `QUESTION_BANK_EXECUTION_BRIEF.md` (seeded from the shelf guide's Exam Traps table); coin a
  new name only for a real, recurring misconception — never for filler.
- `note` — one line of better thinking that dispatches it, in house voice.

When the learner answers wrong, feedback leads with **their** trap by name ("You fell for:
*face-value reassurance*"), then the note, then the item's `why`, `pearl`, and `evidence`, then
the deep link. A distractor that cannot be honestly trap-tagged is not a distractor — replace it.
Trap names also aggregate: "you've fallen for *the reflexive benzodiazepine* 3 times" is a
category-independent weak-spot signal, and the schema keys it for exactly that use.

### 3.4 Relational / communication items (`type: "relational"`) — the signature archetype

The clerkship's differentiator: items where the best answer is the best **thing to say or do
relationally**. Three sub-archetypes (`subtype`):

- `family-system` — reading the room: who minimizes, who escalates, expressed emotion, alliance
  and role dynamics in a family meeting.
- `what-would-you-say` — options are four quoted utterances; the lead-in is "Which response is
  best?"
- `transition-of-care` — discharge realism: means safety, follow-up linkage, the plan the system
  can actually hold.

**How "best answer" stays defensible when the question is relational:** intuition and etiquette
are not the answer key — **the source page is.** The correct option must be derivable from an
explicit phrase, behavior, or principle the page states (the module's own "useful student
phrases" are the richest source). The generic anatomy of a correct relational answer, per the
library's own teaching: it validates before redirecting, keeps the student inside role and
supervision, and advances safety or the plan with a *concrete, verifiable* step. Each distractor
is a named **relational** trap — the righting reflex, quoting statistics at families, face-value
reassurance, taking sides, making the family responsible, avoiding the topic.

Cover-the-options adapts: for `what-would-you-say` items the learner can't pre-compose the exact
sentence, but the stem must let them pre-state the *function* of the best response ("validate,
then get means safety concretely confirmed") before uncovering the options. If the stem doesn't
support that, it's underspecified. Homogeneity is strict: four utterances or four actions —
never mixed.

Two-tier composes naturally with relational items (tier 2: *why* is that the best thing to
say?); use sparingly, where the page states the rationale.

## 4. Voice and reading level

Inherit `TOPIC_META_RUBRIC.md` §4 wholesale: direct second-person clinical coaching, plain
English first, term-of-art in parentheses on first use, em-dash rhythm, no hedging filler, no
drama. Vignettes are fictional composites — plausible ages, realistic unit settings, never a
real case. Stem dressing (age, day counts, who's in the room) is free; clinical parameters
(doses, lab values, scale scores) may appear **only** as the source page states them.

## 5. Difficulty calibration (`difficulty`: 1–3)

| Level | What it is | Target share |
|---|---|---|
| 1 | recognition — one classic cue, the pattern names itself | ~25% |
| 2 | shelf-standard — competing cues, two steps: pattern → first action | ~55% |
| 3 | stretch — a mimic or a confidently-wrong bait; the tempting answer is the trap | ~20% |

Difficulty is discrimination load, never obscurity. A level-3 item is hard because the wrong
answer is *attractive* (sudden improvement that reads as recovery; the "depressed" patient who
is actually hypoactively delirious) — not because the disease is rare or the fact is deep in a
footnote. If a page can't support a level-3 item honestly, don't force one.

## 6. Scoring summary (renderer contract)

- SBA: correct/incorrect × confidence → SRS grade per §3.2 table.
- Two-tier: tier-pair result first (§3.1), then confidence mapping, then the Hard cap for
  right-answer/wrong-reason.
- Every response record: `{item id, option key, tier2 key, confidence, correct, ts}` in
  `cw_qb_v1` — that record is also the v2 hook for cohort stats (option keys are stable
  identities, so "62% of students chose C" is computable later without touching items).
- Wrong answers surface trap-first feedback (§3.3); all answers surface `why` → `pearl` →
  `evidence` → `link`.

## 7. Clinical-accuracy guardrails (non-negotiable)

`TOPIC_META_RUBRIC.md` §5 applies in full. Restated for the bank, with additions:

1. **Every clinical claim traceable to a library page** named in `pages`. The bank examines the
   library; if the page doesn't say it, the item doesn't test it — even if it is true.
2. **No new numbers.** No doses, cutoffs, percentages, or durations the page does not state.
   Vignette dressing is fine; clinical parameters are not.
3. **`evidence` cites what the page cites,** in the page's terms ("exp_family.md — CALM
   lethal-means counseling, attempts/deaths 3.3% → 0.83% at 180 days"). The drafting model never
   adds outside citations — a missing anchor is a note for faculty, not a PubMed trip.
4. **Escalation bias on safety content.** Suicide, violence, withdrawal, capacity: when in
   doubt, the correct answer is the conservative, supervision-seeking option.
5. **Students act under supervision.** Correct answers never have the student independently
   discharge, clear, prescribe, or decide disposition.
6. **No legal absolutes the page hedges** ("duty to protect/warn varies by jurisdiction" stays
   hedged).
7. **Fictional composites only, no PHI.**
8. **ORIGINAL items only** — the copyright/exam-security rule in the preamble is a guardrail,
   not a preference.
9. Anything you were tempted to write but couldn't source goes in the handoff notes — faculty
   input, never silent inclusion.

## 8. Blueprint discipline

Every item carries `category` (one of the 12 in `QUESTION_BANK_BLUEPRINT.md`) and 1–3
`competency` tags (`dx`, `next-step`, `management`, `safety`, `pharm`, `psychosocial`). The
blueprint's counts are the production contract; the brief tracks the tally. An item whose
`pages` don't include at least one slug from its category's page list is mis-filed or
ungrounded — fix the category or the grounding.

## 9. Attestation and process guardrails

- Every item is **AI-drafted, `status: "draft"`, pending faculty attestation.** The `_note` at
  the top of `question_bank.json` declares this for the whole file; keep it intact. Only
  Dr. Moss's attest tooling ever changes `status` — the drafting model writes `"draft"`, always.
- **Never touch `13_Faculty_Resources/reviewed.json`.**
- **Never edit page markdown, `topic_meta.json`, or the build/SPA code** while drafting items.
  Bank work is additive to `question_bank.json` only. Page errors go in the handoff.
- Work on a branch off `origin/main`; commit; **no merge, no push** — merging deploys the site.
- Validate before every commit: `python3 -c "import json; json.load(open('question_bank.json'))"`
  plus the structural self-check in the execution brief; the shape contract is
  `question_bank.schema.json`.

## 10. v2 mechanics — reserved, not implemented

The schema reserves clean hooks so these slot in without rewriting v1 items:

- **Sequential / unfolding cases:** optional `v2.case = {caseId, step, of}` — items sharing a
  `caseId` render in `step` order, stems written to be cumulative. v1 items simply omit it.
- **Adaptive difficulty blocks:** `difficulty` + `category` + stable `id` are already sufficient
  for an adaptive picker; optional `v2.blockTag` labels hand-built blocks.
- **Cohort-answer reveal:** stable item `id` + option `key` are the aggregation identities;
  responses in `cw_qb_v1` already record both. No per-item authoring cost now.

v1 authors write nothing under `v2` unless the brief says otherwise. Renderers must ignore `v2`
keys they don't know.

## 11. Reference exemplars

Three items ship in `question_bank.json` as the standard to imitate:

| id | Type | Category | Why it's the reference |
|---|---|---|---|
| `qb_sud_001` | two-tier | substance | mechanism-bearing next-step; tier-2 rationales mirror the tier-1 traps |
| `qb_rel_001` | relational (what-would-you-say) | relational | means-safety family meeting; page phrase as answer key; statistics-at-families trap |
| `qb_cog_001` | sba | neurocog | hypoactive-delirium mimic; every distractor a named trap; level-2 discrimination |
