# Patient Resource Pack Builder Design

**Status:** Approved for implementation by the repository owner on 2026-09-23

## Purpose

Extend **Patient care resources** with a transient handout builder. A learner can choose up to
three resources from the existing curated ReConnect collection, preview a clean resource handout,
and print or save it as a PDF. The shared crisis-resource block is included automatically from the
repository's governed `crisis_resources.json` build path.

This is a navigation and sharing aid. It does not recommend treatment, gather patient information,
document care, attest competence, or replace supervision.

## Experience

The builder appears between the task navigator and the complete resource shelf.

```text
+-----------------------------------------------------------------------+
| Build a resource handout                                              |
| Choose up to 3. No patient details are collected or saved.            |
|                                                                       |
| Choose resources                    Handout preview                    |
| [ ] Community supports              ________________________________  |
| [ ] Recovery meetings              | Patient care resources       |  |
| [ ] Patient/family education       |                              |  |
| [ ] Podcast Navigator              | Selected resource + QR       |  |
| [ ] Recommended books              | Selected resource + QR       |  |
|                                     |                              |  |
| 2 of 3 selected   Clear             | Crisis resources included   |  |
|                                     | automatically                |  |
|                                     |______________________________|  |
|                                                    [Print handout]     |
+-----------------------------------------------------------------------+
```

- Every resource starts unselected.
- Each selection control exposes its pressed state and preserves keyboard focus after rerender.
- At three selections, remaining choices are disabled and the visible count explains the limit.
- Clear removes selected resources but never removes the crisis block.
- Print is disabled until at least one curated resource is selected.
- The full five-resource shelf remains visible below the builder.
- Changing the task navigator does not silently add, remove, or replace handout resources.

## Handout

The handout contains:

1. The title **Patient care resources**.
2. A short current-information reminder.
3. For each selected resource, its canonical title, description, full HTTPS URL, and an offline
   generated QR code encoding that exact URL.
4. The existing build-injected HTML crisis block, unchanged.
5. ReConnect collection provenance.

The printed surface excludes the application header, task navigator, selection controls, complete
resource shelf, and other shell chrome. URLs remain visible when printed even if QR scanning is not
available. A QR-generation failure omits only that QR image; it never hides the canonical text link
or prevents printing.

## Safety and privacy boundaries

- No free-text inputs.
- No patient name, diagnosis, location, note, or other identifying field.
- No localStorage, sessionStorage, cookie, URL parameter, analytics event, network request, or
  cross-tab persistence for pack selections.
- Every link and QR payload comes from a validated `careResources` record and remains byte-for-byte
  the canonical HTTPS destination.
- Crisis contacts are not copied into JavaScript or CSS. The builder receives only the shell's
  existing `fdCrisisHtml`, which the build expands from `<!-- crisis-block-html -->` using
  `crisis_block.py` and `crisis_resources.json`.
- The crisis block is automatic and cannot be deselected.
- The existing current-information and supervision boundaries remain visible.

## Visual direction

The design extends the established Clinical Warm system rather than creating a new mini-app.

- **Warm paper — `#f6f3ee`:** page ground and print-preview surround.
- **White — `#ffffff`:** the printable sheet.
- **Ink — `#3b332c`:** primary reading text.
- **Olive — `#8b7040`:** curated-collection structure.
- **Teal — `#3a7d6e`:** selected/included state.
- **Terracotta — `#a9634b`:** the single primary Print action.
- **Type:** Georgia for the handout title; Inter/system sans for controls and explanatory text.
- **Layout:** a quiet 7/5 workbench on wide screens and a single reading order on narrow screens.
- **Distinctive element:** the preview is treated as a practical paper handout with a restrained
  sheet edge; controls remain flat and list-like rather than becoming a grid of generic cards.

The memorable element is the paper preview. No additional decorative badges, gradients, animated
entrances, or icon systems are introduced.

## Architecture

- `frontdoor/fd_care_pack.js` owns pure validation, selection, QR rendering, and builder markup.
- `fd_care.js` composes the builder between the navigator and the complete resource groups.
- `fd_wire.js` owns the three actions: toggle a pack resource, clear the pack, and print.
- `spa_index.html` passes the existing build-injected crisis HTML to the pure Care renderer and
  invokes `window.print()` only in response to the explicit print effect.
- `frontdoor.css` owns screen, responsive, dark-mode-token, reduced-motion, and print behavior.
- `common.py` registers the new snippet before `fd_care.js` and `fd_wire.js`.

Transient controller state uses `carePackIds: string[]`. The controller validates and normalizes it
through the pure pack module on every toggle. It is excluded from history snapshots and all device
stores, and reset when the learner leaves Care, opens a resource, reloads, or navigates history.

## Accessibility

- Native buttons with `aria-pressed` represent resource selection.
- Disabled choices at the three-resource limit reference the visible selection-limit explanation.
- Focus returns to the equivalent resource control after a toggle and to the first resource after
  Clear.
- The count is visible text, not color-only state.
- The QR SVG has a useful accessible name while the adjacent full URL remains the primary link.
- The crisis block keeps its existing heading and semantics.
- At 320 CSS pixels and at 200% zoom, selection and preview form one column without horizontal
  page overflow.
- Print retains the entire crisis block and every selected URL.

## Failure behavior

- Malformed resources never become selectable, printable, or QR payloads.
- Unknown, inherited, duplicate, non-string, or fourth selection IDs are dropped or rejected.
- Missing crisis HTML shows a non-clinical build-failure message in the preview, disables Print,
  and never invents replacement crisis contacts.
- Missing QR support leaves a visible link and a short “QR unavailable” note.
- With no selection—or without the governed crisis block—the builder remains visible and the
  print action is disabled.

## Verification boundary

Automated tests can prove source derivation, exact URLs, absence of persistence, interaction state,
responsive DOM/CSS, print visibility, and both MS3/Resident builds. They cannot prove that a native
screen reader speaks every transition, that every physical printer preserves QR contrast, that an
external resource is currently available, or that faculty has clinically re-reviewed linked apps.

## Deferred work

Resource-level audiences, formats, review dates, broken-link reporting, and automated maintenance
status are valuable follow-ons, but they require a separate governed metadata and review-cadence
decision. They are not inferred or invented in this feature.
