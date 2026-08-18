# Mental Status Exam Contradiction Guard — Design

**Date:** 2026-08-18
**Status:** approved in chat; pending implementation plan
**Scope:** `02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html`

## 1. Purpose

The Mental Status Exam builder currently lets a trainee select mutually incompatible descriptors
and then copies those contradictions into drafted clinical prose. Examples include "no SI/HI"
with "active SI," "no delusions" with "paranoid delusions," and "oriented x3" with
"oriented x4."

The change will make the newest incompatible selection replace the older one and will briefly
explain the correction. The builder remains a teaching aid: it does not make a diagnosis, assess
risk, or replace supervision.

In plain language, the builder gains a small rulebook and one gatekeeper. Every selection passes
through the gatekeeper before it can enter the drafted note.

## 2. Scope boundary

### Included conflict families

The first release covers only logically indisputable conflicts:

1. **Suicide and homicide**
   - `no SI/HI` conflicts with `passive SI`, `active SI`, and `homicidal ideation`.
   - The conflict is bidirectional: selecting `no SI/HI` also clears any of those positive
     findings.
2. **Delusions**
   - `no delusions` conflicts with `paranoid delusions` and `grandiose delusions`.
   - The conflict is bidirectional.
3. **Perception**
   - `no perceptual disturbances` conflicts with `auditory hallucinations`,
     `visual hallucinations`, and `responding to internal stimuli`.
   - The conflict is bidirectional.
4. **Orientation documentation level**
   - `oriented x3` and `oriented x4` are alternatives. Selecting one replaces the other.

### Deliberately allowed combinations

- `denies hallucinations` may coexist with `responding to internal stimuli`. One records patient
  report and the other records clinician observation; the discrepancy can be clinically
  meaningful.
- Findings that can vary during an encounter or require clinical interpretation remain
  unrestricted. Examples include agitation with retardation, grooming with dress, and observed
  eye-contact patterns.

### Excluded work

- No new clinical descriptors or changes to existing clinical prose.
- No changes to the tool's faculty-review or attestation status.
- No diagnostic inference, severity scoring, treatment recommendation, or risk disposition.
- No persistence, analytics, account, or server-side behavior.
- No broader redesign of the MSE teaching module.
- No additional conflict families without separate faculty review.

## 3. Interaction design

The newest selection wins. When a trainee selects an option that conflicts with an active option:

1. The older incompatible option is cleared.
2. The new option remains selected.
3. A concise message appears, for example:
   `Active SI replaced no SI/HI because these findings conflict.`
4. The same message is announced through a persistent `role="status"` region with
   `aria-live="polite"`.

The message describes the interface action rather than offering clinical advice. Ordinary
selections do not trigger an announcement. Reset clears the selections and any visible status
message.

Mouse, touch, Enter, and Space use the same selection path. There is no separate pointer-only
implementation.

## 4. Code design

The implementation stays in the existing single-file HTML tool and remains compatible with its
React 18 UMD/ES5-style source.

### 4.1 Conflict data

Add a single `MSE_CONFLICTS` data structure near `DOMAINS`. It records the approved relationships
using existing domain keys and exact option strings. Clinical relationships must not be scattered
through event-handler conditionals.

The configuration is symmetric by behavior even if represented compactly. A contract test will
verify that every referenced domain and descriptor exists in `DOMAINS`.

### 4.2 Pure selection boundary

Add a pure function with the conceptual interface:

```text
applyMseSelection(selection, domainKey, option, singleChoice)
  -> { selection, removed }
```

Responsibilities:

- Copy the provided selection state instead of mutating it.
- Preserve the existing toggle behavior for ordinary multi-select and single-choice domains.
- Remove every active descriptor that conflicts with the newly selected descriptor.
- Return removed descriptors in deterministic order for the explanation.
- Return an unchanged, well-formed selection object for unknown domains or malformed conflict
  entries rather than throwing.

The existing `pick()` handler becomes a thin adapter: call the pure function, update React state,
clear the prior copied state, and set the status message when `removed` is non-empty.

### 4.3 Drafting and copying

`buildParagraph()` and the visible domain draft continue to consume the React selection state.
Because all input methods pass through the pure selection boundary, contradictory pairs cannot
reach either visible output or clipboard output.

No generated clinical sentence is rewritten as part of this change.

## 5. Failure behavior

- A conflict entry that names an unknown option is ignored by the runtime selection function; the
  builder stays usable. The contract test must still fail so the configuration cannot merge in
  that state.
- A clipboard API failure retains the existing behavior and is outside this scope.
- If no prior conflicting option was selected, no replacement message is shown.
- If more than one incompatible option is present because of unexpected legacy or injected state,
  all incompatible options are removed and named in deterministic order.

The tool holds selection state only for the current page session, so no migration is required.

## 6. Accessibility

- Retain the existing checkbox/radio semantics and keyboard selection behavior.
- Add exactly one persistent, narrowly scoped polite status region; do not mark the entire builder
  live.
- Visible and announced replacement text must match.
- The status region must not steal focus.
- Selection state exposed through `aria-checked` must update immediately after replacement.

## 7. Test strategy

Implementation follows red-green-refactor. No production behavior is added before its failing
test is observed.

### 7.1 Node contract test

Create `tests/mse-builder.test.mjs`. It reads the real MSE source, extracts the conflict data and
pure selection function, and exercises them through `new Function`, following existing repository
test patterns.

Required cases:

- Every configured domain and descriptor exists in `DOMAINS`.
- Each approved conflict works in both selection orders.
- The newest selection wins.
- Multiple incompatible stale values are all removed.
- Unrelated values in the same domain remain selected.
- Values in other domains remain unchanged.
- `denies hallucinations` and `responding to internal stimuli` remain allowed together.
- Existing single-choice toggle behavior remains intact.
- Selecting an already-active multi-select option still turns it off without a replacement.
- Inputs are not mutated.
- Unknown or malformed conflict entries do not throw.

### 7.2 Browser test

Create `tests/smoke/mse-builder.spec.js` and include it in both the `nav-ms3` and `nav-res`
Playwright projects because both builds ship the shared tool.

The test opens `/tools/mse.html`, enters the builder, and verifies:

- Pointer selection replaces an incompatible choice.
- Keyboard selection performs the same replacement.
- `aria-checked` updates on both chips.
- The visible status message is announced from the polite status region.
- The cleared descriptor disappears from the drafted MSE.
- The copied prose excludes the cleared descriptor and includes the newest selection.
- Reset clears selections and the replacement message.
- The allowed report-versus-observation combination remains selected together.

Clipboard verification may use Playwright's browser-context permission support or a narrow
clipboard stub when the browser does not expose clipboard access on the local HTTP test origin.
The test must still assert against the tool's real copy handler and real drafted text.

## 8. Verification

Run, in order:

```bash
node --test tests/mse-builder.test.mjs
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke && npm ci
npx playwright test mse-builder.spec.js --project=nav-ms3 --project=nav-res
```

The visual baseline workflow is not required because this change adds only a compact status line
inside the existing builder and does not alter a baseline-covered shell view.

## 9. Acceptance criteria

- No approved contradictory pair can coexist after any supported input action.
- The newest selection wins and the previous finding is cleared.
- The learner receives a concise visible and accessible explanation.
- Allowed report-versus-observation combinations remain possible.
- Drafted and copied prose never contains a cleared descriptor.
- Reset and existing non-conflicting selection behavior remain unchanged.
- No clinical prose, governance record, attestation status, storage key, or server behavior changes.
- Both site builds, static QA gates, the full root contract suite, and the targeted browser tests
  pass.

## 10. Follow-on boundary

This specification is the first of five separately testable clinical-contract packages. It does
not authorize the audience-specific rotation map, search-ranking changes, first-shift local facts,
or any deployment. Those receive their own design and verification boundaries after this package
is implemented and reviewed.
