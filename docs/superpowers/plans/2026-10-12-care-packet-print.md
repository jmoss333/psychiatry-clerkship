# Aftercare packet, part 2: preview, print and copy (behind the same default-off flag)

> Historical implementation plan. [Revision 4](2026-10-13-care-packet-revision-4.md) supersedes its clinical/profile rules; [the G-B closure record](2026-10-13-care-packet-gb-decisions.md) records owner workflow approval on 2026-10-13. G-C and G-D remain open.

PR C of the Care aftercare packet (`_prototypes/care-packet/HANDOFF.md` §6–§7). It stacks on PR B (#1034, the
chooser and review gate) and uses PR A's data (#1032, merged). **Nothing here is patient-facing** until an
owner-approved source edit flips `FD_CARE_PACKET_ENABLED` (gate G-D). Gate G-C is a human one: Josh, one nurse
and one peer specialist read the output **on paper, from the ward printer**.

This is the third revision. The design was attacked by five independent reviewers before any code (print layout,
patient safety, accessibility, repo gates, testability; about 78 findings, 2 blockers), and the finished
implementation by five more (about 40 confirmed findings). Every adopted change is folded in below and written to
match what was built; "Rejected or deferred" lists what was not, with the reason.

## What a trainee gets

A **Preview and print** button in the packet tray opens an inline preview of the printable packet: a mode choice
(Review copy / Final copy), a checkbox per optional standard page, the ward's name and phone (two short inputs),
the pages themselves, **Print** and **Copy as text**. Print and Copy are unavailable until the four review
confirmations from PR B are ticked **for the packet exactly as it now stands**; any edit that adds or changes
content clears them again. A visible sentence beside the buttons always says what is blocking them.

## Design

### 1. The payload reaches the browser at build time
`care_inserts_payload.build_payload()` (its own module, `site_build/care_inserts_payload.py`) builds
`{generatedAt, checkedOn, crisisCopy, crisis, inserts, contacts, required}`:

- it loads the governed record and the data and **runs `validate_care_inserts`'s `check()`**, aborting the build
  on any error (one source of truth, no second token scanner);
- `checkedOn` is the OLDEST check date behind anything the sheet prints: every helpline row's own `verifiedDate`
  and every referenced governed line's `verifiedOn`. The footer's "helpline numbers checked" date comes from it;
  the data file's `generatedAt` is when the file was assembled, which is not a check of anything;
- `contacts` maps every crisis id the data references (the `crisis[].ref` list plus every `{{crisis:<id>}}`
  token) to `{name, contact, availability}` copied verbatim from `crisis_resources.json`. `alsoAvailable` is not
  shipped (it carries further numbers; the data's `when` text already names the audiences);
- `required` is `validate_care_inserts.REQUIRED_CRISIS` (the ids whose digit-exact contacts the validator
  already pins). **JS, CSS and comments never name a crisis id or number**: three guards reject it (the edit hook,
  the pre-commit gate, `crisis-block.test.mjs`). The sheet learns what is required from the payload only.

Injection follows the repo's verified-needle convention, not a new comment marker: the shell declares
`var FD_CARE_INSERTS=null;` beside `FD_CASE_ARC`; `build_deploy.py` replaces that exact line, once, with
`frontdoor_catalog._inline_json(payload)` (already escapes `& < >` and U+2028/9) and aborts on a count other than
one. Postconditions in `build_deploy.py` and `resident_section.py`: the null line is gone and
`var FD_CARE_INSERTS=` occurs exactly once. A payload that never arrived is `null`, which the sheet treats as
`CRISIS_UNAVAILABLE`. It ships whether the flag is on or off (inert data, about 20 KB), so browser tests exercise
the production injection. Tests for all of this are `tests/*.test.mjs` spawning `python3 -B` (not `-I`: isolated
mode hides the user site-packages, where `jsonschema`'s own dependency can live; the working directory is the
build directory, which is controlled) (the existing
glob already runs them in CI, `verify.sh` and the Netlify build); there is **no new Python test file**, so
nothing needs wiring into `bin/verify.sh` (a policy file) and no policy commit is needed.

### 2. The sheet is pure functions (`frontdoor/fd_care_packet_sheet.js`, ES5, no DOM, no network, no storage)
- `fdCarePacketFill(text, ctx)`: only the three tokens. `{{unitName}}`/`{{unitPhone}}` become the validated
  value or a handwriting blank (`<span class="fd-packet-blank">` with visually hidden "blank line to write in";
  `______` in text). `{{crisis:<id>}}` becomes that id's `contact`. A missing/blank contact, an unknown id, or any
  `{{` left in the result **fails the sheet**. Fill is never applied to feed text.
- `fdCarePacketForbidden(text)` / `fdCarePacketNorm(text)`: ONE forbidden-token pattern family, ported from
  `validate_care_inserts.py` (verification wording incl. `verif…`, `verifiedDate`, `reviewAfter`, tier tokens, and
  PR A's dose family: digits+unit, `mcg`/`mL`, spelled-out, tablet counts), applied to a scan-only view: NFKC,
  every format/bidirectional/tag character dropped, other scripts' decimal digits mapped to ASCII, every dash a
  hyphen. A parity test runs the same probe strings through the JS and Python patterns. **What prints is what was
  scanned**: `fdCarePacketStrip` removes the same characters (and control characters, and collapses whitespace)
  from every feed string before it is checked and printed, so a bidirectional trick cannot hide a dose from the scan
  and then show it on paper. The invisible characters are built from code-point ranges at load time, never typed
  into the source (nobody reviewing the file could see them; a raw-source scan pins that). Applied to **every**
  printed free-text field: name, phone, area, description, website host, the category label and the unit name. A hit in a
  description, area or website omits that field and records it as *withheld* with its reason (a note or dose, or a
  crisis number); a hit in a listing's name or phone blocks printing and names the listing; a category label with a
  hit prints as "Other resources"; a unit name with a hit is rejected.
- Description truncation: a description of 400+ characters (the feed cuts at 420) that does not end in sentence
  punctuation is trimmed back to its last complete sentence, or omitted when none exists and "More details on the
  website" printed when there is a website. A fragment never prints. Short descriptions without a full stop are
  left alone.
- Crisis numbers inside listings: `fdCarePacketNumbers` takes every ten-digit North American number whole FIRST
  (so `1-888-568-1112 (24/7)` is that number and its groups are never re-read), then reads standalone runs of 3 to 6
  digits and spaced-out short codes (`9 1 1`); a seven-digit run is not read as the six-digit code at its front. Numbers
  are compared as numbers, so `207-791-1000` is not `911` and `1988` is not `988`. A listing whose name or phone
  contains a number registered in `contacts` **blocks printing** with a message naming it; the same number in a
  description or area withholds that field; in the unit name it is rejected. The governed block on page 1 is the only
  place a crisis line prints. Whether crisis-category listings should be
  addable at all is Josh's call (owner decisions).
- `fdCarePacketBuild(state, data, payload, opts)`: the model, shared by the paper and the copy text (so the two print
  the same cleaned listings): the ordered print units. Page 1: header, intro, crisis block
  (built from `crisisCopy` + `crisis` + `contacts`, shows `availability`), then `week`. Then resources by
  category (a heading keeps with its first resource; a listing is one atomic unit). Then the remaining standard
  pages in array order, each as sub-units with legal split points only **between groups, and between the lead,
  the table and the tip**. Tables are never split in this PR: a table taller than a sheet fails closed. Core
  pages cannot be switched off. Every unit sets `data-fd-packet-*` attributes, never ids.
- `fdCarePacketPaginate(units, heights, capacity, slack)`: greedy; a standard page stays whole when it fits a fresh
  sheet, otherwise falls back to its sub-units; headings keep with the next unit. Returns pages with
  `used`/`capacity`. `capacity` 0/NaN, any non-finite height, or a unit taller than a sheet returns
  `MEASURE_FAILED` / `OVERFLOW` (not a degraded layout). **The crisis unit must land on sheet 1** in both modes, or
  `CRISIS_NOT_PAGE_ONE`.
- `fdCarePacketSheet(state, data, payload, opts)` returns
  `{ok, code, message, pages, count, html, mode, blockers, withheld, addresses}`. After rendering it checks the
  OUTPUT: every `required` contact appears in the sheet-1 crisis unit and, when the wallet card is on, in the card.
  Otherwise `CRISIS_UNAVAILABLE`; a standard page that cannot be filled is `PAGES_UNAVAILABLE`. `addresses` lists the
  full URL behind each QR code, as data. `opts`: `headingBase`, `measure`, `slack`, `keepWhole`, `verify`.
- `fdCarePacketText(state, data, payload, opts)`: plain text for the After Visit Summary field with the same
  `{ok, code}` contract. Raw strings (never `fdEsc`), control/bidi stripped, `______` for blanks, crisis lines
  first, then each listing (name, phone, domain, area), then the footer lines. It carries no unit name/phone. It is
  only available in **Final** mode; a Review draft never goes into the record.

### 3. Layout contract (what makes "measured = printed" true)
- Measured and printed in the **same CSS context**: a body-level host, never inside the shell or the preview.
  On screen the measuring host sits in a wrapper `position:absolute;width:0;height:0;overflow:hidden` containing
  the box at its true width, `visibility:hidden`, `aria-hidden`, `inert`, removed synchronously after reading
  (screen readers never see a second copy; it adds no horizontal scroll).
- The sheet root sets font family (an explicit system stack: no Inter, Source Sans 3 or Source Serif 4), size,
  numeric line-height, letter/word spacing, kerning and `text-size-adjust:100%`. No `@media` width or type
  conditionals on any geometry rule that reaches the measuring host or the print container (the one width query is
  below). No shell classes inside the sheet. A sibling selector (`+`) may style the inside of ONE unit and may never
  depend on a neighbouring unit. Units are direct children of a block page body with zero outer margin (the margin
  reset is `:where()`, specificity 0, so the spacing rules after it win; a bordered element is always an inner
  element or a plain wrapper, never a unit root); spacing is the unit's own padding. Heights are
  `getBoundingClientRect()` (fractional). The browser spec asserts no unit root carries a margin.
- Every page is `min-height:11in` (never `height`, never `overflow:hidden`; only `overflow-x:clip` as a backstop).
  Verified in Chromium 153: a fixed-height box silently **drops** overflowing text from the PDF while the page
  count stays equal, whereas `min-height` makes an overflowing page spill to an extra sheet that a parity test sees.
  Every feed field gets `overflow-wrap:anywhere;min-width:0`; `nowrap` is only for governed numbers.
- **Verify after layout** (`fdCarePacketVerifyDom`, inside `fdCarePacketSheet`, so it covers Print, Ctrl+P and the
  preview alike): the assembled pages are laid out once more in the hidden paper-width host, and each must be no
  taller than a sheet (1056 px plus one) and no wider than its own box, and the number of pages found must equal
  the number packed; otherwise the sheet is `OVERFLOW` (or `MEASURE_FAILED` when the check itself cannot run, or
  throws) and nothing prints. Pages are `min-height`, so a page that outgrew its sheet GROWS and this is what
  notices; a `scrollHeight` test on the body would be vacuous, because the body grows with its content. Capacity is
  reduced by a 24 px slack. The sheet is rebuilt synchronously inside the Print click (no timers), so what prints is
  the current state.
- Tokens only for type and spacing (`--fd-font-*`, `--fd-space-*`; px are absolute in print), because
  `check_design_drift.py` ratchets raw font sizes, paddings and margins and C2 forbids colour literals. Body is
  `--fd-font-base` (15 px); phones `--fd-font-lg` (17 px ≥ 12 pt); the footer is never below `--fd-font-2xs`.
  Inches appear on the 8.5in × 11in sheet, the ID-1 wallet card (3.375in, min-height 2.125in), the QR code (0.9in
  square), and two values inside the fixed paper geometry (the crisis lines' number column, 2.3in, and the blank
  line's `min-width`, 1.6in). Page padding is `--fd-space-12` (40 px) on all four sides, so all ink is at least
  0.4in from every edge, clear of printers' unprintable margin. There is **one** width media query,
  `(max-width:640px)`, and every rule in it is scoped to `.fd-packet-sheet--screen`, which is never measured (the
  measuring host and the print container are `--paper`) and never printed, so measured = printed still holds.
- The review band is **ink only** (bold text with rules above and below, inside the padding). A tinted or inverted
  band vanishes without background graphics and would make a Review copy indistinguishable from a Final one.
  The band slot and the tick-box column are reserved in both modes so most of the layout is mode-invariant.
- Colour: `color-scheme:light`, `color:CanvasText;background:Canvas` set together on the sheet root. **No
  `GrayText`** (3.95:1 on Canvas, and "disabled" in forced colours): the footer is set apart by size, weight and a
  rule.
- The wallet card is ID-1 sized; its instruction and scissors line sit **outside** the dashed box; a card taller than
  2.125in (half a pixel of tolerance) fails the browser spec. The preview shows "Print one-sided so the wallet card
  can be cut out" when the card is on, and updates it in place when the card is switched on or off.
- QR: ≥ 0.9in with explicit width and height, `shape-rendering:crispEdges`. Modules are counted from the SVG
  `viewBox`; above 49 modules (module < 0.4 mm) the QR is omitted and the domain printed alone. The preview lists the
  full encoded URLs as plain text (not anchors) in a `<details>` OUTSIDE the sheet, so a wrong deep link is visible
  at review while the sheet stays the same bytes in the preview and on paper (a preview-only line inside the sheet
  would be measured, and the page count would differ from the printed one).

### 4. Print lifecycle (atomic, state-driven, no timers)
`print()` builds `#fdPacketPrint` (child of `<body>`), adds `body.fd-packet-printing`, injects
`@page{size:Letter;margin:0}`, sets a transient `document.title` ("Your aftercare resources"), sets a `printing`
flag, and calls `window.print()`. **Teardown is one atomic function** (container + class + `@page` rule + title +
flag) run on `afterprint`, on `leave()`, and synchronously on any change to listings, gate, mode, inserts or unit
fields. It never runs on "the next paint" or a timer. `@media print` hides every other body child **only** while
the class is present, so a leftover cannot hide the app on screen (`#fdPacketPrint` is `display:none` on screen).

`beforeprint` (registered only while the Care tab is mounted): if our `printing` flag is unset (the trainee used
Ctrl+P) **and the preview is open**, it builds the same container when the gate is released and the sheet is `ok`,
otherwise a one-line notice ("This is not the patient packet. Use Print in the packet preview after review."). The
notice is also what prints when a ward field is still being typed (uncommitted), because the stored value is not the
one the preview shows. With the preview closed it tears everything down and the ordinary Care page prints. The inline
preview is `display:none` in print always. A second Print click is ignored for 30 seconds after the first (a print
that never reports `afterprint`, as on iOS Safari, must not lock Print forever). Teardown puts the page title back
only if it is still ours.

### 5. State, controller and mounts
- State gains `unit:{name,phone}` in the same tab-scoped `sessionStorage` key. `normalize`, `copy`, `save`, `blank`
  and the empty rule change accordingly. `unit` survives **Clear packet**, since it describes the ward, not the
  patient, so **a packet holding only a unit keeps its key**; only a packet with no listings, no switches, the
  default copy and no ward details leaves no residue. (The first draft of this plan said the opposite and
  contradicted itself.) Stored ward details are kept whole or dropped whole. Storage stays in `fd_care_packet.js`;
  `fd_care_search.js` routes events to `packet.handleInput` / `handleChange` / `handleKey` and touches no storage.
- Unit validation happens when the field is committed (a `change`, i.e. on leaving it), never silently on read and
  never per keystroke (a per-key repaint would move the caret): name 1–60, deny control characters and `< > { }`,
  and the forbidden-token pattern; phone is a NANP ten-digit number (optional leading 1), **not** an N11 number and
  **not** a number in `contacts`. Invalid values stay in the field with an inline error (`aria-invalid`,
  `aria-describedby`) and are treated as empty for printing. `type=tel`, `autocomplete=off`. No extension
  (`x`): iOS tel keypads cannot type it.
- **The controls are patched in place after their first paint, never replaced.** Found while designing the commit
  path: a `change` event fires when a field loses focus, before focus moves, so a repaint that replaced the Print
  button would drop keyboard focus and lose the mouse click. The controller sets `disabled`, text and `aria-invalid`
  on the existing nodes; hits that carry `keep:true` tell the directory controller not to refocus them. The tray is
  patched the same way when the listings did not change (the four boxes, the ready line, the preview button's
  `aria-expanded`), and a unit-field commit defers the preview's controls by one task, so that if the trainee is
  tabbing to Print, Print is still there when focus lands; if it then becomes unavailable the reason paragraph takes
  focus, and the announcement (built when it is spoken) adds what Print and Copy can now do only if that changed.
- **Gate re-arming.** `resetGate()` (PR B) now also runs, with the usual "Review confirmations cleared"
  announcement, when: a unit value changes (on commit), an optional page is switched **on**, or a listing is
  added. Switching a page off, removing a listing, reordering and changing the mode do not (nothing unreviewed is
  added). `print()`/`copy()` re-read the live inputs first and, if they differ from committed state, commit (which
  clears the gate) and refuse; a direct call with a stale gate is refused by the controller, not just by `disabled`.
- **Blockers** come from one pure `fdCarePacketBlocker(...)` returning `{code,message}` or null, in this order:
  empty packet · confirmations incomplete · the sheet itself failed (payload/crisis unavailable, a page that cannot be
  built, layout overflow or measure failure) · the sheet's own blockers in the order found (a listing with a
  withheld or crisis-number name or phone, hidden saved listings on a partial feed, Final without a valid unit
  phone) · Copy only: not Final. Both orders fail closed; only the first message differs. The message renders in
  one visible paragraph before the buttons (`tabindex=-1`, referenced by `aria-describedby` on Print and Copy; the
  Preview button carries `aria-expanded` and `aria-controls` only). Buttons stay native `disabled` (fail closed). A
  button that becomes disabled while focused moves focus to that paragraph.
- **Three mounts so typing is never destroyed by a repaint**: (a) the tray (PR B, repainted on packet changes);
  (b) a sibling preview-controls mount (mode, page checkboxes, unit inputs, reason, Print/Copy), painted on
  open/close and on gate/blocker changes, never on input events; (c) a pages mount, repainted after a 200 ms
  debounce on input. `previewOpen` lives in the controller closure, so a gate tick or feed refresh re-renders it open.
  Unit values are written to storage on `change`/blur, not on `input`.
- **Semantics**: disclosure pattern; the button's label is constant ("Preview and print") with `aria-expanded` and
  `aria-controls` pointing at a region that is always rendered (`hidden` when closed). Focus does not move on open;
  the region follows the button. Never `role=dialog`/`aria-modal` (the shared announcer drops messages while a
  modal exists). Mode is a native radio group in a fieldset ("Copy to print"); pages are a checkbox group in a
  fieldset, label rows ≥ 44 px; the core pages are static text, not a disabled control. Escape is handled on the
  button and the region only, ignoring `isComposing`/`defaultPrevented`, and returns focus to the button. Nothing is
  announced before `window.print()`; after `afterprint` focus returns to Print. Copy announces after the clipboard
  promise settles and falls back to a visible read-only text area.
- **Headings and ids**: the sheet takes `headingBase`. Print host: 1. Preview: an `h3` "Packet preview" then sheet
  headings from `h4`. Each page is `<article aria-label="Page n of N">`. Sheet markup contains no `id`.
- **On screen the pages reflow** (`width:100%;max-width:8.5in`, `min-height:0`). Fixed Letter geometry exists only in
  the measuring host and `#fdPacketPrint`. Page grouping comes from the print-geometry measurement, so
  "Page n of N" is right even though the on-screen card height differs.
- Footer, every sheet: "Listings copied from the ReConnect community directory on <feed `generatedAt`, date
  only>. Call ahead to confirm hours, cost and availability. Not a medical record." then "Helpline numbers checked
  against official sources, as of <payload `checkedOn`>." (left out when there is no date, so a claim of a check is
  never made without one) then "Page n of N". Never the word "verified". The copy text for the After Visit Summary
  leaves out "Not a medical record", because it is going into the record. The preview shows a notice above the
  sheet (not on paper) when the directory copy is more than 7 days old; it does not block.

## Deviations from HANDOFF, and why

| HANDOFF | PR C | Why |
|---|---|---|
| §6 print-safe colour literals | System colours + borders | `check_design_drift.py` C2 (zero literals in `frontdoor.css`) is hard; mono printers lose tints; `GrayText` fails AA. |
| §6 pt/in typography | Tokens; px; inches only on width/height | `check_design_drift.py` ratchets raw font sizes and spacing. |
| §3 prototype `overflow:hidden`, `height:11in` | `min-height:11in`, no clip, verify after layout | Verified: a fixed-height box drops overflowing text from the PDF silently. |
| §4 `fdCarePacketSheet(..., crisisHtml, ...)` from the trusted crisis template | Page 1 and the wallet card are rendered from `payload.contacts` | `{{crisis:<id>}}` tokens in insert prose need per-id contacts; the clinician-addressed shared block is not for patients (PR A schema). Contacts are byte-pinned to `crisis_resources.json`. |
| AC5 "always contains 988 and 1-888-568-1112" | Same literals asserted in the test; the sheet itself checks its OUTPUT against `payload.required` | JS cannot name crisis ids or numbers. |
| AC7 ≤ 5 pages | Invariants asserted; the measured count recorded, not pinned | The default-on inserts exceed five pages (measured in the PR). A pinned count would be red on whichever OS did not produce it. |
| AC8 axe | Deterministic checks (below); axe is draft #1008 | The repo has no axe-core; `contrast.spec.js` is a production canary and must not be touched. |
| Why-line | Still not built (Q3) | Unchanged from PR B. |
| Schema contract: the crisis block takes the governed `name` | The crisis block prints the data's patient-facing `label` ("Suicide and crisis line", "Emergency"); the number and availability are the governed values, verbatim | Printing both would print "Maine Crisis Line" and "Veterans Crisis Line" twice (their label equals their name), on page 1, the wallet card and the copy text. Whether the paper should carry the official "988 Suicide & Crisis Lifeline" name is Josh's call (a data edit in PR A's file); rewording the schema's contract is a `*.schema.json` edit, which is governance and its own PR. |
| Plan: layout at screen widths is unconditional | One `(max-width:640px)` block, scoped to `.fd-packet-sheet--screen` | The screen preview must reflow on a phone; that class is never measured or printed. |
| Plan: reasons and the Preview button share `aria-describedby` | Print and Copy only | The Preview button is a disclosure; its state is `aria-expanded`. |
| Visual baselines | None | Frozen only after G-C, from the Ubuntu workflow. |
| Edition-contract unit field | Two inputs | The field does not exist (Q2). |
| Print and Copy gated by four confirmations | Same, **and re-armed by any content edit**; Copy only in Final; Final needs a valid unit phone | See §5. |

## Measured (Chromium 153, eight listings, short descriptions, default pages; the print spec reproduces these)

1. **The default packet is 9 sheets in both copies, not 5.** The content is about 5,600 px, i.e. 6.5 sheets of 858 px
   usable height, so even perfect packing could not reach 5 at this type size (body 15 px, phone numbers 17 px).
   Heights of the pieces (Final copy, px): header 79 · welcome 230 (279 in the Review copy, which adds a note) · crisis
   block 366 · first week 264 · "places that can help" head 42 · each listing 113 (+24 per category label) ·
   expect-a-call 508 · warning signs 753 · family 497 · helplines 544 · insurance 451 · medicines 531 · wallet card 290
   (home safety, rights and notes are off by default). A five-sheet budget means the defaults shrink to the welcome, the
   crisis lines, the resources and about three of those pages. That is Josh's choice, made in PR A's data.
2. **Keeping each standard page whole costs one sheet over filling by part** (9 vs 8; the floor is 7). Whole is the
   default: every sheet is a coherent page with its heading. Splitting would also need a "(continued)" heading. (Before
   the review fixes, with the header margin and the smaller bottom padding, the numbers were 10 and 8.)
3. **The first-week rows do not fit on page 1** after the welcome and the crisis block (939 px needed, 834 available
   after the 24 px slack), so they open page 2, before the resources. The contract's order holds; only the sheet changes.
4. **PDF parity holds**: `page.pdf()` produces exactly as many pages as there are sheets, in both copies, with short,
   realistic-long and hostile (170-character names, 60-character unbroken hostnames) feeds. Pages are `min-height`, so a
   spill becomes an extra sheet that the parity check sees, and the check after layout refuses to print one.
5. **The wallet card measured 3.1 in tall** before it was scoped: it reused the crisis-line markup, whose number is 17 px
   for the page-1 block. Scoped back to 12 px on the card; a card taller than 2.125in fails the browser spec.
6. **Every printed sheet's content ends at least 0.4in from every edge** (40 px padding on all four sides; before the
   review the bottom was 32 px). Whether a given ward printer clips that is the human gate's question.

## Decisions that are Josh's (listed in the PR body, none assumed)
1. **Crisis-category listings** (126 in the live feed; 12 carry the 988/Maine numbers, 15 non-crisis listings do too):
   today they are blocked at print, not at add. Exclude them from the chooser (a PR B change), allow only local
   mobile-crisis teams, or keep the print-time block.
2. **Default-on inserts vs a page budget**: HANDOFF's five pages cannot hold today's defaults. The PR reports pages
   per insert so you can choose what to default off (a data edit in PR A's file).
3. Final copy requires a valid unit phone (otherwise four "call the unit at ____" blanks). Relax if you prefer.
4. Org line "Maine Medical Center" is a module constant (the data schema has no org field).
5. Wallet card on a duplex printer: the preview says "print one-sided"; confirm at G-C.
6. Whether a unit name/phone should survive Clear packet (kept: they describe the ward).
7. axe-core: draft #1008 already proposes it; this PR adds a surface to it once it merges.

## Test plan (ordered; what each catches)
Node (`tests/fd-care-packet-sheet.test.mjs`, payload test, updated PR B tests; the QR generator and `fd_care_pack.js`
are loaded so QR assertions cannot pass vacuously):
1. `pdfPageCount` helper (smoke dir): counts `/Type /Page`, asserts max `/Count`, Producer Skia, no `/ObjStm`, > 0,
   else throws. Self-tested in the browser spec on 1-, 3- and 12-page PDFs (crosses the 8-page tree nesting).
2. Payload: contacts byte-equal to `crisis_resources.json` read directly; `required` present; hostile strings
   (`</script><script>`, U+2028/9, `&`) round-trip through `JSON.parse` with no `</script` in output; needle count 0
   and 2 abort; parse-back from both built sites equals the payload.
3. Fill: unknown id, blank contact, leftover `{{`, escaping, blanks, unit values.
4. Clean/forbidden-token parity with the Python patterns; hostile fixtures in every field (`10mg`, `10 mcg`, spelled
   out, `Verification due`, `L3`, a zero-width dose, a bidi-reversed phone); truncation (Riverview-shaped string).
5. Paginate: keep-with-next, whole-insert-then-split fallback, `OVERFLOW`, `MEASURE_FAILED` for zero/NaN/non-finite and
   capacity 0, `used`/`capacity`, crisis on sheet 1.
6. AC5 matrix {default, all-on, core-only} × {review, final} × {html, text} on html **and** textContent, sentinel
   values for `verifiedDate`/`reviewAfter`/`details`, per-row crisis check against contacts read independently,
   crisis first in text, QR count equals https-listing count.
7. Fail-closed: payload null / `required` deleted / contact '' / unknown token → `ok:false`.
8. No crisis literal in the new module, `fd_care_packet.js` or CSS; ES5, no network, no storage.
9. State: unit round-trip, tampered storage (`<img onerror>`, `{{crisis:x}}`, over-length), key set exactly
   `ids,inserts,mode,unit,why`, empty-with-unit removes the key.
10. Gate re-arming: each content edit clears it; remove/reorder/mode do not; direct `print()`/`copy()` refused.

Browser (`care-packet-print.spec.js`, both nav projects, Desktop Chrome; flag on through the fixture):
11. Payload mutations through the served HTML (null; contact deleted; contact ''; unknown token): failure copy shown,
    buttons disabled, no `#fdPacketPrint`, print stub never called, nothing copied.
12. Print lifecycle: unstubbed `beforeprint` snapshot (container, class, `@page` text with Letter/margin 0) then all
    gone after `afterprint`; stubbed print + `page.pdf({preferCSSPageSize:true})`: PDF pages = pages in
    `#fdPacketPrint`; container survives 2 rAF + 500 ms (no timer teardown); gone on untick and on leaving Care;
    Ctrl+P with the preview open and gate unreleased prints only the notice; preview closed prints the Care page.
13. Layout at **816×1056 under print emulation**: containment per page (band above first unit, units inside the body,
    last unit above the footer, footer inside the sheet), `scrollWidth ≤ 816`, band count = N in Review and 0 in
    Final, footer reads `Page 1..N of N`; no unit root carries a margin; every footer is at least 0.35in from the
    edge; with long descriptions each listings sheet is filled until the first block of the next sheet would not fit
    (the packer's measured numbers agree with the real layout; a fixed percentage was dropped because a page of
    fixed-height pages always passes it); long-token fixture (60-char hostname, 200-char names, 420-char descriptions, 180-char phones) for
    both the DOM and the PDF; preview opened at 1280 and at 390 then printed. A mutation (one giant insert) must make
    the sheet `OVERFLOW` and Print disabled.
14. Typing: `pressSequentially` into the unit name, after every character the input is still active with the caret at
    the end; `#careDirectoryStatus` is not written; a gate tick with the preview open keeps it open and keeps focus.
    Fill + immediate Print contains the typed name.
15. A11y deterministic set (1280 light, 390 dark, 320 light): contrast probe (copied helper, not the canary spec),
    non-text contrast ≥ 3:1 for the text fields' boundaries (checkboxes and radios are the browser's own rendering),
    structure (expanded/controls exist, radios named with one checked, unique Print/Copy names, `Page n of N`
    articles), no duplicate ids, one `h1`, sheet headings start below the preview's own, ≥ 44 px targets,
    `scrollWidth ≤ innerWidth`, nothing under the dock, every QR code inside its page, table rows readable on a
    phone, forced colours (the crisis box keeps an opaque border; the empty Final band draws no rule), the WCAG text
    spacing stylesheet makes no sibling overlap another, examined counts asserted (not just absence of failures).
16. AC10: bounded Tab order; Escape returns focus to the button; announcements through `#careDirectoryStatus`
    with auto-waiting `toContainText`.
17. Copy: real clipboard (granted permission) equals `fdCarePacketText` and passes the text oracle; a rejecting
    `writeText` announces failure and never says "Copied".
18. Partial feed (`partial:true`) disables Print/Copy with the reason.
19. Negative pins: no `toHaveScreenshot`/`toMatchSnapshot` in the spec, no `care-packet-*` baseline file.

Human gate G-C (not provable in CI): hardware margins vs `@page margin:0` (footer, band, crisis lines at the edges);
the ward browser's print dialog defaults (margins, headers/footers) and whether `print()` blocks and `afterprint`
fires; page count on the ward's fonts and real feed text; QR scan from paper; tick-box size; card cut-out and duplex;
screen-reader rendering of the announcements. Firefox, Safari and phone printing are unproven; the supported path is
Chrome or Edge with margins Default and scale 100, said in the preview.

## Pins and commit order (every file is content or neutral class; no policy commit)
Pins: `SNIPPET_MARKERS` +`/*__FD_CARE_PACKET_SHEET__*/` and `parallel-ceilings` 42 → 43 (the needle payload is not a
marker); `fd-action-contract` `CARE_PACKET_ATTRS` +every new `data-fd-*` (letters and hyphens only); `CLASS-INVENTORY`
count 622 → new and the 3a-i tree; PR B tests (the "no Print/Copy" assertion inverted, the stored-key set, the loader
now loads `fd_care_pack.js`, the QR vendor and the sheet); `.fd-care-packet__*` screen rules go inside PR B's block
before the print block, print/sheet rules use `fd-packet-*`/`#fdPacketPrint`/`body.fd-packet-printing` and never
`.fd-care-packet` inside `@media print` (the old pack's isolation pin slices to end of file); no audience tokens
(`MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford`, case-insensitive substrings, comments included); not touched:
`fd_care_pack.js`, `fd_wire.js`, `contrast.spec.js`, canary lists, `bin/`, `.github/`, `*.schema.json`, drift baselines.

Commits: C1 payload (needle, builder, postconditions, tests, this plan) · C2 sheet module (marker, 43 pin, unit tests
incl. AC5) · C3 state and controller (`fd_care_packet.js`, search routing, PR B test edits, attrs) · C4 CSS +
CLASS-INVENTORY · C5 browser spec. Push as a draft with `CLERKSHIP_PR_BASE=origin/claude/care-packet-core-2026-10-12`.

## Rejected or deferred
- Table-row splitting with repeated `thead`: a table taller than a sheet fails closed instead (tables are ≤ 7 rows
  today; the schema allows 12, so a future edit may need it).
- Moving the four confirmations into the preview: they stay in the tray (PR B's design, awaiting G-B); any content
  edit re-arms them, which gets the same safety without moving them.
- Padding the packet to an odd page count for duplex cut-outs: a hint and a G-C check instead.
- Hiding Print on coarse-pointer devices: unproven rather than blocked; said in the PR.
- A 640px case in the accessibility matrix, and a heading-level-skip assertion: the matrix runs 1280, 390 and 320;
  headings are counted (none below `h4` in the preview, one `h1`), not walked for skips. Deferred.
- Non-text contrast for the preview's checkboxes and radios: native controls, rendered by the browser.
- Reading `alsoAvailable` from the governed record: leaves further numbers off the sheet.

## Execution ledger
- [x] Plan written, critiqued by five lenses, revised (this document).
- [x] C1: payload tests red, then green.
- [x] C2: sheet unit tests red, then green; AC5 matrix.
- [x] C3: state/controller tests red, then green.
- [x] C4: CSS + inventory; design-drift and tokens tests green.
- [x] C5: browser spec red, then green, both sites; falsification mutations watched going red.
- [ ] Measure: default page count per mode and per insert; keep-whole vs fill; QR/feed distributions.
- [x] Independent multi-lens review of the implementation (five lenses, adversarially verified); confirmed findings fixed,
      each new guard broken once to watch its test go red (28 sheet and 20 controller mutations, none surviving).
- [ ] Full `bin/verify.sh` on a quiet machine; draft PR stacked on #1034 with the G-C checklist.
