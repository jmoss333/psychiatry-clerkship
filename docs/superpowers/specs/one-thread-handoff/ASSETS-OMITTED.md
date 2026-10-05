# Assets omitted from this copy of the handoff bundle

`README.md`'s **Assets** section names four groups of files. Three of them were deliberately **not**
copied into the repository, because every one of them is a duplicate of something the repository
already tracks, and re-committing them here would create a second copy that can silently drift from
the first:

| Named in README.md "Assets" | Why it is not here | Where the real one lives |
|---|---|---|
| `tests/smoke/baseline/*.png` (12 files) | These are the repo's own committed CI baselines. A second copy under a spec path is a trap: baselines are generated **only** by the "Refresh visual baselines" `workflow_dispatch` (CLAUDE.md), and a stale duplicate invites someone to compare against the wrong set. | `tests/smoke/baseline/` |
| `13_Faculty_Resources/_automation/site_build/fonts/source-serif-4-latin-opsz-wght600-700.woff2` + OFL licence | The bundle's own README says these are "copied from the repo, already shipped". | `13_Faculty_Resources/_automation/site_build/fonts/` |
| `audit/shots/*.png` (4 files) | 26 Sept device captures the bundle README sources from the repo's `_to_delete/` folder — superseded working material, not a specification. | history / `_to_delete/` |

What **was** copied: the full specification (`README.md`), the kickoff prompt (`PROMPT.md`), the six
`Screen *.dc.html` visual references plus `Library Redesign.dc.html` and `support.js` needed to open
them, the media track (`README_MEDIA.md`, `PROMPT_MEDIA.md`, `Media Integration.dc.html`,
`media_map.draft.json`), and `screenshots/` (6 PNGs, one per concept screen — these are the only
images in the bundle that exist nowhere else in the repo).

Total: 20 files, ~600 KB, against ~2.7 MB for the bundle as delivered.

## Reading the `.dc.html` files

They are **design references built in HTML, not production code** (bundle README, "About the design
files"). Open `Library Redesign.dc.html` in a browser; it loads `support.js` and the `Screen *.dc.html`
children from this folder. Do not copy their markup into the repo — recreate the designs as edits to
the ES5 renderers in `13_Faculty_Resources/_automation/site_build/frontdoor/`, `frontdoor.css` and
`clinical-warm.css`, with `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` as the CSS
contract.
