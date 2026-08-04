---
name: topic-meta-author
description: >-
  Author or edit entries in topic_meta.json — the structured metadata that drives the psychiatry
  clerkship SPA's topic pages, quizzes, clinical-workflow cards, and shelf/EPA crosswalk. Use this
  whenever the user wants to add a new topic entry, enrich or edit an existing one, add or fix a
  quiz, write clinicalWorkflow narration, add ruleOut/firstMove, tag shelfBlueprint or EPA crosswalk
  codes, add a familyOverlay, set a page's safetyLevel, wire evidenceIds or communicationCases
  cross-references, or move a topic through facultyReview — and whenever a change to a topic page
  implies its topic_meta.json entry must change. ALWAYS use this skill for ANY edit to
  topic_meta.json, even a one-field tweak, because validate_topic_meta.py enforces controlled
  vocabularies, conditional invariants, cross-file referential integrity, and a high-safety
  governance bundle that are silent to get wrong and are NOT captured in topic_meta.schema.json.
---

# topic_meta.json author

`topic_meta.json` is the spine of the clerkship SPA: each entry (keyed `<topic>.md`) renders a
topic page's summary, high-yield points, quiz, clinical-workflow cards, family overlay, and the
shelf/EPA coverage crosswalk. Getting an entry *structurally* right matters as much as getting it
*clinically* right — a bad shape or a dangling reference fails the build, and a wrong vocabulary
code silently corrupts coverage reporting.

## Why this skill exists (read this first)

**The validator is the source of truth, not the schema.** `topic_meta.schema.json` has drifted: it
does not even mention `shelfBlueprint` or `epa`. The real contract is
`13_Faculty_Resources/_automation/validate_topic_meta.py`, and it is not a shape-checker — it is a
**cross-contract referential-integrity engine**. Editing one topic can break it through a *different*
file: every `evidenceId` must resolve in `evidence_registry.json`; every `communicationCases` id and
every `?tool=communication-practice.html&case=…` href must resolve in `communication_cases.json`;
every `?tool=family-systems.html&scenario=…` href must resolve in
`family_systems_scenarios.json`; and high-risk pages require a governance bundle.

So the job is never "write some JSON." It is: **produce an entry that passes
`validate_topic_meta.py`, uses the right controlled-vocabulary codes for the right reasons, keeps
every cross-reference resolvable, respects the governance gate, and reads in the house voice — with
every clinical claim flagged for the author to verify.**

## Workflow

Follow these steps in order. Create a todo per step so none is skipped.

1. **Orient.** Read the target entry if it exists (`python3 -c "import json;print(json.dumps(json.load(open('topic_meta.json'))['<key>.md'],indent=2))"`). If it's a new entry, read the two or three closest existing siblings as templates — a core disease page (`t_mood.md`, `delirium.md`), a safety page (`agitation.md`, `suicide.md`), or a skills/pocket-guide page (`pg_interview.md`). Match their shape and depth. Read `references/field-map.md` if you're unsure what a field renders or which fields a page of this type should carry.

2. **Draft on-voice.** Write the prose fields (`tldr`, `points`, `cant`, `clinicalWorkflow.*`, `quiz`) in the house voice — terse, imperative, exam-aware. Study `references/voice-and-exemplars.md` before writing; do not free-associate. The `tldr` is one punchy teaching sentence; `points` are 3 imperative bullets; `cant` is the "don't do this" trap; the quiz is board-style with plausible distractors and a `why` that teaches. See the content-posture rule below.

3. **Choose vocabulary codes by meaning, never by guess.** `shelfBlueprint`, `epa`, `workflowStages`, and the `clinicalWorkflow` keys are closed sets. Open `references/controlled-vocab.md`, read what each code *means* and the crosswalk mapping rules, and pick the codes that actually fit this page. A code outside the set fails the validator; a plausible-but-wrong code silently corrupts coverage.

4. **Wire cross-references — look them up, never invent them.** Before writing any `evidenceIds`, `communicationCases`, or `?tool=…&case=/&scenario=` href, confirm the id exists (see "Cross-references" below). If the author wants to point at something that does not exist yet, **do not fabricate an id** — flag it: "this needs a `communication_cases.json` (or `evidence_registry.json`) entry first; that's out of this skill's scope." A dangling reference is a hard validator failure.

5. **Enforce the invariants.** Walk `references/invariants.md` as a checklist against your draft. These are the rules that are silent to violate: `firstMove` never without `ruleOut`; the quiz's exactly-one-correct rule; `familyOverlay` ⇒ `family-systems.html` in `relatedTools`; the high-safety governance bundle; referential integrity.

6. **Validate — this is the hard gate.** Apply the edit, then run:
   ```
   python3 13_Faculty_Resources/_automation/validate_topic_meta.py
   ```
   It must print `topic_meta.json OK`. If it prints violations, fix them and re-run. **You are not done until it exits zero.** Never report success without showing the passing output — evidence before assertion.

7. **Hand back with a verification report.** Show the finished entry and then the report described in "Output" below: the clinical claims and quiz answer the author must confirm, any dangling references, and any governance gate you hit.

## Content posture: draft on-voice, flag every clinical claim

The author is a psychiatrist and the domain authority. Your drafting removes the friction of typing
JSON and finding the house voice — it does **not** transfer clinical judgment to you. So:

- Draft confidently in-voice, but treat every clinical assertion as *provisional pending the
  author's sign-off*. Collect them into the verification report rather than presenting them as
  settled fact.
- The **quiz answer** is the highest-stakes claim on the page (a student will be graded against it).
  Always surface which option you marked correct and why, for explicit confirmation.
- When you are unsure of a fact, say so in the report instead of writing around it with vague prose.
  A flagged uncertainty is useful; confident vagueness is not.

## Governance: never fabricate the attestation itself

`facultyReview` (`status`, `reviewer`, `lastReviewed`) records a human governance act. The
**`lastReviewed` date IS the act of sign-off — never invent one**, and never set `status: reviewed`
yourself. You *may* pre-fill `reviewer` with the author's own name (`Joshua Moss, MD`) as a
convenience: a name without a date asserts nothing. The date and a `reviewed` status are what claim
a review actually happened, so those remain the human's to give.

This matters most for high-safety pages. The validator requires that any `safetyLevel: high` page
carry non-empty `evidenceIds` **and** `facultyReview.status` **and** `facultyReview.lastReviewed`.
That is deliberate: you *cannot* make a high-risk page pass the contract by drafting alone. When a
page should be high-safety, draft its content and evidence scaffold, set `facultyReview.status` to
`draft` or `pending`, and then **stop and tell the author** the page cannot validate until a real
review date is supplied. Do not paper over the gate with a fabricated date. See `references/invariants.md`.

## Controlled vocabulary

Never emit a code you have not confirmed against `references/controlled-vocab.md`. The closed sets:
`shelfBlueprint` (12 disease-category codes), `epa` (`EPA1`–`EPA13`), `workflowStages` (8),
`clinicalWorkflow` keys (8), `safetyLevel` (3), `facultyReview.status` (4). That file also carries
the crosswalk *mapping rules* (e.g., every disease page → `EPA1`+`EPA2`; safety/emergency page →
`+EPA10`) so you assign codes for the documented reason, not by vibe.

For a *bulk* EPA/shelf backfill across many existing pages, the idempotent
`13_Faculty_Resources/_automation/site_build/crosswalk_apply.py` already encodes these rules — prefer
running it over re-deriving codes by hand. For a single new or bespoke entry, assign per the rules in
`controlled-vocab.md` and validate.

## Cross-references: confirm before you write

Each of these must resolve, or the validator fails. Look the id up first:

- **evidenceIds** → ids in `evidence_registry.json`:
  `python3 -c "import json;print([s['id'] for s in json.load(open('evidence_registry.json'))['sources']])"`
- **communicationCases** and `?tool=communication-practice.html&case=<id>` → ids in `communication_cases.json` (`cases[].id`).
- `?tool=family-systems.html&scenario=<id>` → ids in `family_systems_scenarios.json` (`scenarios[].id`).
- **familyOverlay** is NOT a foreign key — it is a free-form snake_case **theme slug** (e.g. `delirium_family_orientation_and_collateral`), authored fresh to name this page's family angle. Never look it up or set it to a scenario id; all 13 existing overlays are theme slugs. Its only rule: `family-systems.html` must be in `relatedTools`.
- **relatedTools** / `?tool=<file>` — **NOT validated against `tool_registry.json`, and must never be
  "fixed" to match it.** The registry is partial (11 tools) while `relatedTools` legitimately references
  7 unregistered ones — `oral.html` (19 pages), `review.html` (11), `mse.html` (10),
  `question-bank-practice.html` (8), `reflection.html` (6), `interview-circle.html` (4),
  `shelf-mode.html` (2) — ~60 page-references, all validator-green. Match what sibling pages use;
  never drop a tool for being unregistered. The only href params that must resolve are `scenario=`
  and `case=` (above).
- **linkedPages** (in the case banks) → an existing topic key in `topic_meta.json` — validator-enforced.
  A `?page=<key>` href in a topic's own `cta` is *not* validator-checked, but must still name a real
  topic key or the SPA 404s.

If the desired target does not exist, flag it as out-of-scope follow-up work — do not stub it and do
not invent a plausible id.

## Boundaries

This skill authors **metadata only**. It does not write the topic's teaching-content markdown page,
and it does not register a page in `site_manifest.json` or the nav in `build_deploy.py`. If the
author is adding a genuinely new *page* (not just a metadata entry), author the metadata here, then
tell them: "metadata done; shipping the new page (markdown + site_manifest + nav) is a separate
step." It also does not author the case-bank or evidence entries a topic references — it consumes
existing ids and flags missing ones.

## Output

After the validator passes, hand back:

```
## <key>.md — authored / edited

<the final JSON entry, or a summary of the fields changed>

**Validator:** topic_meta.json OK — <N> topics, contract satisfied.

**Please verify (clinical):**
- <each clinical claim you drafted, as a checkable statement>
- Quiz answer: "<the option you marked correct>" — <one line on why>

**Dangling / follow-up (out of scope here):**
- <any reference that doesn't exist yet, and which contract it belongs in>

**Governance:**
- <e.g., "safetyLevel:high — set facultyReview.status:draft; needs a real lastReviewed date + your attestation before it validates."  Omit if not applicable.>
```

Keep the verification list specific and checkable — it is the author's fastest path to trusting the
entry, so it should read like a sign-off checklist, not a paragraph.
