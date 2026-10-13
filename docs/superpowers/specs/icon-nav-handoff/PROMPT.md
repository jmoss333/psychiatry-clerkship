# Kickoff: icons & wayfinding, learning site, C1 onward

> **Amended at C0 import (2026-10-09).** This is the bundle's `handoff/PROMPT_CLERKSHIP.md` (revision 2), with the owner's decisions and the Lucide pin applied. Changes from the bundle text:
>
> - The blocking step is done: the pin is `lucide-static@1.54.0`, and glyphs are copied **verbatim**, not as compound paths.
> - C0 is this folder.
> - The dock bar is 66 px, not 64.
> - N1 is approved.
> - N3 follows the review.

You are starting the icon and wayfinding layer in this repo. Before writing anything, read:

1. `README.md` in this folder: the decision log and errata first, then the bundle README;
2. the repo's `CLAUDE.md`;
3. `../one-thread-handoff/README.md`.

**Design references:** `Screen Shell A.dc.html` and `Icon Spec.dc.html`. Read them as source until `support.js` ships (`ASSETS-OMITTED.md`).

**Sequencing:** start C1 only after #1001 and #1008 merge.

## Provenance (done at C0; keep it true)

- **Glyphs:** take every glyph from `lucide-static@1.54.0` (`LUCIDE-PIN.md`). Copy each `icons/<name>.svg`'s child elements verbatim: no arc conversion, no compound `d`. Never copy from `icons/wf-icons.js` in the bundle; it was not imported because it can't be traced.
- **Licence:** carry `LICENSE-lucide.txt` (ISC + Feather MIT) with the module, and the version string in its header comment.
- **Library tab and book lists:** the Library tab uses Lucide `library`; book lists use `library-big` (N7).

## C1: icon module (one PR; nothing visible changes)

**The module**

- Port as `FD/fd_icons.js`: `function fdIcon(name, opts)` using `fdEsc`. ES5, pure (state in, string out).
- Default output is `aria-hidden="true" focusable="false"`.
- Titled mode is `role="img" aria-label`, with **no `<title>` child**.

**Wiring it in**

- Add the marker after `/*__FD_DATA__*/` and before `/*__FD_TODAY__*/`.
- Add it to `SNIPPET_MARKERS`.
- Bump `EXPECTED_MARKER_COUNT` 40 → 41, and add it to the `fd-inject` `ORDER`.

**Visible-neutral fixes in the same PR**

- Replace the three inline magnifiers (A10/A26/A62) with `fdIcon('search')`.
- Add the missing `aria-hidden` on A10.

**Tests: `tests/fd-icons.test.mjs`**

- the ES5 regex;
- purity;
- every registry name renders;
- unknown names return `''`;
- no `<script>`, event attributes or hex;
- no `<title>` when decorative.

## Rules

- ES5 only. Shared strings stay audience-neutral (`AUDIENCE_TOKEN_RE`).
- **Colour roles only:**
  - text-mid by default;
  - teal-deep when active;
  - danger only for the section **named** "Acute & safety" and the Safety button. Never key it on `accent: safety` (Pocket cards carry that value).
  - A danger-tinted icon class needs an `fd-tokens` SAFETY allowlist entry, with a comment.
- No new persisted keys. No crisis-number or crisis-block changes. No governance paths.
- Visual baselines: refresh only via the "Refresh visual baselines" workflow_dispatch.

## Done when

- `bash bin/verify.sh` passes, and both site gates pass (`build_and_check.sh ms3`, then `res`).
- The PR body states the pinned Lucide version.

## Later phases (separate PRs)

| Phase | Scope | Notes |
|---|---|---|
| W1 | Dock and tab icons; ✚ / ⚙ redrawn | **66 px bar; items stay 52 px**; the line-clamp moves to `.fd-dock__label`. Update `fd-phone-chrome`, `fd-shell`, and `front-door.spec` `DOCK_STANDARD`/`APP` (including "On shift"). **N1 approved:** "＋ Ask" → "Ask" with `ask`, in the dock, header and search footer. The stepper label fix is CSS-only or its own PR |
| W2 | Library index icons + row type column | Type derived in the renderer (**no `kind` field**); derivation table pinned over every ref. **N3:** lead with the type word only for deck, podcast, book list, pocket card and exam; medication readings keep "Reading"; licensed instruments keep "reference" (`file-text`). `.fd-chip.is-tool` comes off Library rows only (it is shared with Today/Path/Sheet). Teaching companion: external mark only, after #1008 (N6) |
| W3 | Reader kicker + search result icons | Reader next-in-thread is `.fd-nextthread__mark`. No external marks inside reading content (N8). A47 after #1001 |
| W4 | Case Journeys | After #1006 and faculty re-attestation |

Verify every class against `frontdoor.css` and `CLASS-INVENTORY.md` before using it. The README errata list the known corrections.
