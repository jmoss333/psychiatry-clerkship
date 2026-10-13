# Assets omitted from this copy of the handoff bundle

This folder imports bundle **revision 2** (2026-10-09) of the icons & wayfinding design. Some files were deliberately **not** copied. Each was left out because it duplicates something, can't be traced, or belongs to the other repository.

| Bundle file(s) | Why it is not here | Where it lives / what replaces it |
|---|---|---|
| `support.js` | **Not shipped by Claude Design.** Every `.dc.html` loads `./support.js`, so none of the boards render in a browser yet. Read them as source. It has been requested (`DESIGN-TOUCHUP-REQUEST.md` §D). | Add it here when the touched-up bundle returns, as `../one-thread-handoff/` does |
| `icons/wf-icons.js` | Its Lucide paths were **hand-transcribed** for the mockups, with circles and rects converted to arcs. They are not traceable to any Lucide release. Committing them would put untraceable third-party-derived geometry in the repo. | C1 builds `FD/fd_icons.js` straight from `lucide-static@1.54.0` (`LUCIDE-PIN.md`) |
| `icons/SOURCES.md` | Its "Pinned version" slot is blank, and N6/N7 change three rows. | `LUCIDE-PIN.md` |
| `icons/LICENSE-lucide.txt` (bundle copy) | A reference copy with a "replace this file" preamble and an older copyright line. | `LICENSE-lucide.txt` here, a byte copy of the pinned release's `LICENSE` |
| `screenshots-before/*.jpg` (11 files, ~830 KB) | Byte-for-byte copies of the design brief's "before" captures of the live sites. They can be reproduced from `main`, and they are not a specification. | The design brief (outside the repo) |
| `Map Tools Hub.dc.html`, `Screen Explore B.dc.html`, `Screen Home B.dc.html`, `Screen Tool Header B.dc.html`, `handoff/PROMPT_TOOLS_HUB.md` | **Site B (the tools hub) only.** They specify another repository, which imports them itself. `Main`, `Icon Spec` and `Handoff` are kept because they cover both sites. | The tools-hub repository |
| `canvas.json` | Design-editor layout state that points at a claude.ai artifact. It is not a specification. | — |
| "After" PNGs | Never exported from the canvas (Share › Export). | Pending |

**What was copied**

- `README.md`: a C0 header (decision log, errata, Lucide pin) followed by the bundle README, verbatim.
- `PROMPT.md`: the Site A kickoff, amended to the decisions.
- The Site A and shared boards: `Main`, `Icon Spec`, `Map Clerkship`, `Screen Shell A`, `Screen Library A`, `Screen Reader A`, `Handoff` (`.dc.html`).
- `LUCIDE-PIN.md`, `LICENSE-lucide.txt` and `DESIGN-TOUCHUP-REQUEST.md`.

**Size:** 13 files, about 190 KB, against about 1.0 MB for the bundle as delivered.

## Reading the `.dc.html` files

They are **design references built in HTML, not production code.** Until `support.js` arrives, read the markup and the `{{…}}` / `<sc-if>` / `<sc-for>` template logic as source.

**Don't copy their markup into the repo.** Recreate the designs as edits to:

- the ES5 renderers in `13_Faculty_Resources/_automation/site_build/frontdoor/`;
- `frontdoor.css`;
- with `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` as the CSS contract.

The boards load Google Fonts and reference `/_blob/…` "before" images. That is fine in a design reference. Neither may appear in the built sites.
