# Care Resource Navigator Design

**Date:** 2026-09-23
**Status:** approved in conversation; awaiting written-spec review

## Decision

Add a fixed-choice **“What are you trying to do?”** navigator near the top of the existing
Patient care resources page. A learner chooses one nonclinical task and receives one clearly
identified best starting resource plus no more than two optional alternatives. The complete
five-resource collection remains visible below the navigator at all times.

The navigator is a local decision map, not an AI assistant, search box, patient-specific
recommendation, or clinical decision-support system. It accepts no free text, stores no selection,
sends no query or context to another site, and makes no claim about the right treatment for a
patient.

## Intended outcome

The feature is for MS3 students, residents, and APP learners using the shared Front Door during
supervised patient care. It should reduce the time required to choose among Joshua Moss, MD's
personally curated ReConnect resources without asking the learner to understand the boundaries of
each underlying application first.

Success means that a learner can:

1. identify the task they are trying to accomplish;
2. see one useful place to begin and, when appropriate, one or two related options;
3. open a fixed external destination in a new tab;
4. return immediately to the complete resource list; and
5. complete the flow without entering, storing, or transmitting patient information.

## Existing foundation

PR #744 established the Patient care resources page and its governing contracts:

- `curriculum.json` owns exactly five external `careResources` in the `support` and `education`
  groups.
- `curriculum.schema.json` constrains each resource's identifier, copy, fixed URL, and local search
  terms.
- `fd_data.js` projects those records outside the canonical Clerkship content universe so they do
  not enter shipped-page, completion, or attestation accounting.
- `fd_care.js` renders the resource collection and its privacy/current-information notice.
- `fd_search.js` searches the resources locally without forwarding the query.
- `fd_wire.js` owns Front Door interaction wiring and transient in-memory state.
- The Family Therapy Seminar Companion remains a teaching resource in The Essentials. It is not a
  sixth patient-care resource and will not be moved by this feature.

The navigator extends these contracts. It does not replace or weaken them.

## Interaction design

The navigator appears after the existing “Verify current details before sharing” notice and before
the two resource groups. Its heading is **“What are you trying to do?”** and its supporting line is
**“Choose the task—not patient details.”**

It presents these six fixed choices in this order:

1. **Find community services**
2. **Locate recovery meetings**
3. **Explain something to a patient or family**
4. **Find a podcast or listening resource**
5. **Recommend a book**
6. **Prepare for a family conversation**

Only one choice can be active. Selecting a choice:

- visually and programmatically marks that choice as selected;
- shows a result panel immediately below the choices;
- labels the primary match **“Best starting point”**;
- shows zero to two resources under **“Also useful”**;
- includes one short, curator-authored explanation of why the primary resource fits the task; and
- retains the normal resource groups below without hiding, reordering, or filtering them.

Selecting a different choice replaces the transient result. A visible **“Clear choice”** button
returns the navigator to its initial state. Switching tabs, reloading, or opening a new browser
session also clears the selection. Browser Back and Forward do not traverse navigator choices
because selection is not represented in the URL.

Every recommended resource uses the same title, description, URL, new-tab behavior, and external
link protections as its canonical `careResources` record. The navigator never constructs or
modifies an external URL.

## Curated decision map

Add one top-level `careNavigator` array to `curriculum.json`. The array contains exactly six
records with this shape:

```json
{
  "id": "services",
  "label": "Find community services",
  "explanation": "Start with the Resource Finder to review practical and treatment supports by need.",
  "primaryResourceId": "resource-finder",
  "alternativeResourceIds": ["meeting-calendar"]
}
```

The six mappings are:

| Intent ID | Primary resource | Alternatives |
| --- | --- | --- |
| `services` | `resource-finder` | `meeting-calendar` |
| `meetings` | `meeting-calendar` | `resource-finder` |
| `explain` | `education-library` | `book-shelf`, `podcast-navigator` |
| `listen` | `podcast-navigator` | `education-library`, `book-shelf` |
| `books` | `book-shelf` | `education-library`, `podcast-navigator` |
| `family-conversation` | `education-library` | `book-shelf`, `podcast-navigator` |

The Family Therapy Seminar Companion stays in The Essentials. “Prepare for a family conversation”
therefore recommends patient/family-facing resources from the Care collection; it does not turn
the teaching companion into a Care link or silently move it between navigation surfaces.

`curriculum.schema.json` requires exactly six navigator records, their exact allowed IDs, nonempty
labels and explanations, one primary ID, and no more than two alternative IDs. A validator test
must additionally enforce relationships JSON Schema cannot express cleanly:

- every referenced ID exists in `careResources`;
- the primary resource is not repeated among alternatives;
- alternatives contain no duplicate IDs; and
- every navigator intent ID appears exactly once.

The relationship check must use the real curriculum plus negative fixtures so a typo cannot
silently remove an intent or recommendation.

## Front Door architecture

Create `frontdoor/fd_care_navigator.js` as a small, pure ES5 module. It owns two responsibilities:

1. resolving a selected intent against the projected `careNavigator` and `careResources` data; and
2. rendering the fixed choices and optional recommendation panel with escaped curriculum copy.

The module must not read from `window`, `document`, `localStorage`, the URL, or the network. Its
input is the projected index plus an optional selected intent ID; its output is HTML. An unknown or
malformed selected ID produces the unselected navigator, never a guessed recommendation.

`fd_data.js` copies `careNavigator` into the Front Door index without adding the records to
`byRef`, `known`, shipped pages, completion, or governance inventories. The projection preserves
the declared order and copies every alternatives array so downstream code cannot mutate the source
object.

`fd_care.js` composes the new navigator between the existing notice and resource groups. It remains
responsible for the page shell and full collection; the new module remains responsible for the
decision experience.

`fd_wire.js` owns one in-memory `careIntentId` value. Delegated click handlers update or clear that
value and rerender only the Care page. Opening a recommendation uses the rendered canonical anchor;
the controller does not synthesize a URL. Leaving the Care tab clears the selection so the existing
transient-navigation convention stays simple and predictable.

Register the new module in `common.py` and `spa_index.html` before `fd_care.js`, and document every
new `fd-care-*` and `is-*` selector in the Front Door class inventory in the same change as the
stylesheet.

## Accessibility and responsive behavior

The six choices use native `button` elements grouped under the visible navigator heading. The
active button exposes `aria-pressed="true"`; every other choice exposes `aria-pressed="false"`.
The result region has a stable accessible label and a polite live status that announces the newly
selected task and primary resource without rereading all result-card content.

Keyboard behavior follows native controls:

- Tab reaches each choice, the primary recommendation, alternatives, and Clear choice in visual
  order.
- Enter and Space select a choice.
- External-resource anchors retain their ordinary Enter behavior and open a new tab.
- Focus remains on the selected choice after rerender; clearing returns focus to the navigator
  heading or first choice without moving the page unexpectedly.

Choice and action targets are at least 44 by 44 CSS pixels. At narrow phone widths the choices form
a one-column stack; at wider widths they may use a compact grid. Text wraps without horizontal
scroll at 320 CSS pixels, 200% zoom, and with long curriculum copy. Selection is not conveyed by
color alone: the active state includes a visible text or icon cue in addition to its color/border.

Motion is unnecessary. The navigator introduces no animation and respects the current Front Door
typography and Clinical Warm palette.

## Privacy, safety, and governance boundaries

- No free-text field is present.
- No patient name, diagnosis, symptom, location, clinical note, or other patient-specific detail is
  requested.
- No intent ID or selection is written to localStorage, sessionStorage, cookies, the URL, analytics,
  logs, or a remote endpoint.
- No selected intent, search term, route state, or patient context is appended to an external URL.
- The navigator is explicitly described as resource navigation, not clinical decision support or a
  substitute for supervision.
- The existing instruction to verify current details before sharing remains above the navigator.
- The resource collection remains navigation-only. It does not enter attestation, learner
  completion, review readiness, or shipped-page counts.
- This feature adds no clinical claims, dose content, crisis contacts, patient records, or faculty
  attestation changes.

## Failure behavior

The full resource list is the fail-safe surface.

- If `careNavigator` is absent, empty, or wholly invalid at runtime, omit the navigator and render
  the existing five-resource collection unchanged.
- If one projected intent references a missing resource, omit that intent rather than rendering a
  broken recommendation. Build validation and unit tests must make this condition a release
  failure for the real curriculum.
- If an alternative is invalid in a synthetic runtime fixture, drop only that alternative and keep
  the valid primary result.
- If the selected intent becomes invalid after a partial asset/cache response, return to the
  unselected state and keep the full list.
- External destinations may independently become unavailable. The navigator does not proxy,
  prefetch, cache, or claim availability for them; the existing “Verify current details” boundary
  remains the user-facing instruction.

No failure mode may hide the canonical resource groups or invent a fallback URL.

## Testing strategy

### Contract and data tests

- Pin the exact six intent IDs and mappings in `curriculum.json`.
- Validate `careNavigator` against the schema.
- Prove every primary and alternative reference resolves to one of the five canonical resources.
- Use negative fixtures for unknown resource IDs, duplicated alternatives, a primary repeated as an
  alternative, and missing intent IDs.
- Prove `fd_data.js` copies navigator arrays and keeps navigator records outside `byRef`, `known`,
  completion, attestation, and shipped-page accounting.

### Pure renderer tests

- Render all six fixed choices in declared order.
- Render the initial state without a recommendation panel.
- For each intent, render the expected primary and exact alternatives from canonical resource data.
- Escape labels, explanations, resource titles, descriptions, IDs, and URLs.
- Reject an unknown selected ID without guessing.
- Preserve `_blank` plus `noopener noreferrer` on every recommendation link.
- Prove the module contains no browser-global, storage, network, modern-syntax, or dynamic-URL use.

### Controller tests

- Selecting a choice updates only in-memory state and rerenders Care.
- Selecting another choice replaces the result.
- Clear choice resets the result.
- Leaving and returning to Care resets selection.
- Recommendation clicks do not mutate Front Door tab, reader, search, Path, URL, or storage state.
- Focus is restored to the selected choice after rerender and to the first choice after clearing.

### Browser tests

Run the same journey against MS3 and resident builds, plus the APP shell where it shares the Front
Door:

1. Open Patient care resources.
2. Select each of the six choices by keyboard.
3. Verify the announced primary resource and exact alternatives.
4. Open one recommendation and assert the exact fixed popup URL.
5. Clear the choice and verify the full collection never changed order or count.
6. Confirm no `cw_*` or `rp_*` storage key, query parameter, or hash was created.
7. Verify 44-pixel targets, logical tab order, no horizontal overflow at 320 pixels, and no
   color-only selected state.
8. Confirm Family Therapy Seminar Companion remains absent from Care and remains available from
   The Essentials.

The browser journey also runs with the navigator data removed from a controlled fixture to prove
the five-resource fallback remains usable. Tests must not depend on live external content; they
assert exact anchor destinations and popup behavior without treating third-party page rendering as
part of the Front Door contract.

## Acceptance criteria

- The Care page offers exactly six fixed task choices to MS3, resident, and APP learners.
- Each task resolves to the approved primary resource and no more than two approved alternatives.
- The ordinary five-resource collection remains visible, complete, and in its original order.
- Family Therapy Seminar Companion remains in The Essentials and is not presented as a Care
  resource.
- No free text, persistence, analytics, query forwarding, URL state, or network request is added by
  the navigator.
- All recommendation links reuse canonical resource records and retain exact fixed URLs, new-tab
  behavior, and `noopener noreferrer`.
- Keyboard, focus, live announcement, touch-target, zoom, phone-width, and no-overflow tests pass.
- Missing or malformed navigator data cannot hide the full resource collection or produce a broken
  link.
- `node --test tests/*.test.mjs`, both `build_and_check.sh` targets, the relevant Playwright smoke
  journeys, and `bash bin/verify.sh` pass.
- The class inventory is updated with every new selector and state class.

## Non-goals

- Free-text, conversational, generative-AI, symptom, diagnosis, or treatment recommendation.
- Collecting patient context or tailoring results to an individual patient.
- Checking external-site availability at page load.
- Moving Family Therapy Seminar Companion from The Essentials.
- Adding, removing, or changing the five canonical external destinations.
- Saving recent choices, favorites, bundles, or learner history.
- Adding usage analytics or faculty attestation.
- Building the proposed printable/shareable care-resource bundle in this iteration.

## Future extension

A later, separately approved feature may let a learner select two or three canonical resources and
produce a local printable/shareable link sheet. That extension must remain patient-data-free, use
only fixed URLs, and require its own design review because printing, QR codes, and sharing introduce
new privacy and accessibility surfaces.
