# One Patient, Six Weeks checkbox examples — design

**Date:** 2026-07-15
**Author:** Joshua Moss, MD (with Codex)
**Canonical repository:** `jmoss333/psychiatry-clerkship`
**Primary audience:** third-year medical students on a six-week psychiatry clerkship
**Status:** approved design, pending implementation plan

## Purpose

Turn the existing checklist from a completion signal into a small calibration exercise. After a
learner checks any item, the tool reveals one short example of language a supervised MS3 could use
with Jordan, on rounds, or with a supervisor.

The example is a model, not an answer key. The interface labels every reveal **One way to say it**
to avoid implying that a single script is the only acceptable response.

## Success criteria

The feature succeeds when:

1. Each of the 18 checklist items has one matching, nonempty model response.
2. Checking an item reveals its response immediately beneath that item.
3. Unchecking the item hides the response.
4. Existing week completion, navigation unlocking, reset behavior, and browser-local progress keep
   working unchanged.
5. The tool stores only checkbox progress and dates; it adds no free-text entry or patient data.
6. The reveal is understandable with a keyboard and assistive technology.
7. Safety-sensitive examples use direct language and explicitly preserve immediate supervision.

## Approaches considered

### 1. Structured checklist objects — selected

Replace each checklist string with an object containing `prompt` and `example`. The prompt and its
teaching model remain adjacent in the canonical JSON, so they cannot silently drift apart when an
item is reordered.

### 2. Parallel examples arrays

Keep the current checklist strings and add a same-length `examples` array to each week. This would
reduce the initial data edit, but pairing would depend on array position and would be easier to
break during later curriculum revisions.

### 3. Hard-coded examples in the HTML renderer

Map week and item identifiers to examples inside the page. This would avoid changing the JSON
shape, but it would split curriculum content across two files and make faculty review harder.

## Data contract

Every week keeps its existing `checklist` property, but each entry becomes:

```json
{
  "prompt": "I can name one alliance move that gives Jordan more control.",
  "example": "I might begin, ‘I have read the admission note, but I want to hear what happened in your words. Where would you like to start?’"
}
```

The six-week and three-items-per-week structure does not change. No new storage key or schema
version is needed because examples are static curriculum content and only the existing `c0`, `c1`,
and `c2` completion booleans are persisted.

The contract test must reject:

- a checklist entry that is not an object;
- a missing or blank `prompt`;
- a missing or blank `example`; and
- a week that does not contain exactly three checklist entries.

## Interaction design

Each checklist item becomes a small container with two parts:

1. The existing checkbox and prompt.
2. A reveal panel rendered only while that checkbox is checked.

The panel appears directly below the checked prompt and contains:

- the visible label **One way to say it**; and
- the escaped model response from `longitudinal_case.json`.

Checking still triggers the existing render cycle, completion calculation, progress bar update, and
next-week unlock. Unchecking reverses those effects and removes the reveal. Reveals do not receive a
separate persistence flag; they are derived entirely from checkbox state.

The reveal uses the established teal teaching-card palette and a subtle left border. It should be
visually subordinate to the learner task and readable on mobile without horizontal scrolling.

## Content design

Each response is one or two sentences and is written in the learner's voice. The response should do
at least one of the following:

- demonstrate patient-centered words the learner could say aloud;
- model a concise rounds statement;
- show how to ask a supervisor for help; or
- demonstrate an observation-versus-interpretation distinction.

Content guardrails:

- use plain, respectful language rather than jargon-heavy formulations;
- preserve diagnostic uncertainty where the prompt asks for it;
- avoid patient-specific treatment recommendations or dosing;
- avoid promising outcomes;
- distinguish patient report, collateral report, observation, and interpretation;
- use direct, calm suicide inquiry in the safety week; and
- explicitly involve the supervising team when action or escalation is required.

The examples remain part of a faculty-review-pending fictional composite. This change does not alter
the review status in `reviewed.json`.

## Accessibility

The native checkbox remains the interactive control. The prompt remains its visible label. The
checked item exposes the example immediately after that label in reading order, with a stable item
identifier and an `aria-describedby` relationship from the checkbox to the visible example.

The reveal text does not rely on color to convey meaning. Keyboard focus styling remains unchanged,
and no hover, animation, or pointer action is required to access the content.

## Privacy and storage

The page continues to prohibit real-patient information and provides no free-text field. The local
storage contract remains `cw_longitudinal_v1`, containing only the current week, checklist state,
and completion date. Model responses are loaded from the static case JSON and are never copied into
local storage.

## Verification

Implementation follows a test-first sequence:

1. Extend `test_longitudinal_case.py` to require structured checklist entries with nonempty prompt
   and example values, then run it and observe the expected failure against the current string data.
2. Convert all 18 JSON entries and rerun the contract test.
3. Add a focused browser test that checks one item, verifies its escaped example appears with the
   **One way to say it** label and accessibility relationship, then unchecks it and verifies the
   example disappears.
4. Run the longitudinal data test, the focused browser test, JSON parsing, and the existing MS3 and
   resident site build checks.
5. If browser smoke testing is needed and the default runtime stalls, retry with the repository's
   established Node 22 path before classifying the test as broken.

## Scope boundaries

This feature does not add learner-authored responses, scoring, clinical decision support, new
analytics, a new storage schema, delayed retrieval, or a Week 6 remix. A future improvement may ask
learners to say their own response before revealing the model. A later innovative extension may
reuse selected earlier prompts in an unrehearsed Week 6 handoff challenge.
