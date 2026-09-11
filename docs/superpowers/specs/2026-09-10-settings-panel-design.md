# A settings panel for the learner shell

**Date:** 2026-09-10
**Status:** designed, not implemented. Approved in brainstorming (full scope, two-tap confirm);
awaiting spec review, then an implementation plan.
**Decision this serves:** giving device-local preferences a destination. Not a preferences
framework, not a faculty surface, not an account system.

## The question

Preferences that belong to the learner rather than to a screen have no destination in this
platform. Where do they go?

Three of the panel's five sections are already built and merely unreachable or misfiled: role,
the analytics opt-out, and the exam date. Two are genuinely new capability, and the spec should not pretend
otherwise — resolving `prefers-color-scheme`, and clearing device data. The panel is mostly a
**destination**, but it is not only a destination, and the two new pieces are where the risk is.

## What already exists

Six facts, each verified against the source rather than assumed, shaped this more than any
preference did. The first is a constraint; the rest are the gaps.

**The header is already at its budget.** `fdHeader()` (`frontdoor/fd_shell.js:38`) renders three
controls into `.fd-header__actions`: the week pill, ✚ Safety, and the ◐ theme glyph. At ≤640px
that container takes `grid-column:1/-1` and wraps onto its own row (`frontdoor.css:916`). A fourth
button is not free, and it is least free on the surface learners actually use.

**Role is a one-way door whose payoff is cosmetic.** The first-run wizard asks who you are.
`fdDispatch` only ever returns to `screen:'setup-role'` when the stored role is empty
(`fd_wire.js:118`) or from the wizard's own back button (`fd_wire.js:361`). There is no path back
from the app. Tracing every consumer of `state.role` finds exactly one: the Today greeting
(`fd_today.js:270`). So a learner who taps the wrong chip on day one carries a wrong greeting for
six weeks, and clearing site data is the only cure.

**The analytics opt-out ships dead.** `analytics.js` exports `optOut()`, `optIn()` and `enabled()`
on `window.cwAnalytics`. Nothing in the platform calls the first two. The implementation plan
already names the learner-facing notice as unresolved and says it "should land before the first
site is enabled, not after" (`plans/2026-09-04-usage-analytics-collection.md:1280`).
`CLERKSHIP_ANALYTICS` defaults to `off`, so this is pre-emptive rather than urgent — but it is the
clearest case of a control built with nowhere to live.

**The exam date is a setting wearing a dashboard's clothes.** `renderProgress()` renders a date
input (`spa_index.html:1730`) below mastery bars and calibration charts. That date governs the
entire study diet through `phase_policy.js`. It is the most consequential preference in the
platform and it is filed under statistics.

**Theme is light-default and deaf to the system.** The boot script (`spa_index.html:4`) forces
`'light'` unless the stored value is literally `dark` or `light`. `prefers-color-scheme` appears
**nowhere** in the shipped CSS, HTML or JS of the build. A learner whose phone is in dark mode gets
a white page on nights.

And the sixth, which is an absence rather than a defect: **there is no "clear my data"
anywhere.** Everything is
device-local across twenty-six literal `cw_*`/`rp_*` keys and more behind helper indirection, the
sites are used on shared hospital workstations, and there is no reset — neither for privacy nor as
a recovery path from corrupted state.

## The shape: the gear replaces the glyph

The ◐ theme button becomes a ⚙ settings button. The header stays at three controls, the mobile row
is unchanged, and theme gains a third state a two-state glyph could never express.

The cost is honest and should be stated: changing theme goes from one tap to two. That is the price
of "System", and System is the setting most learners will want set once and never touch again.

**The panel is a sheet.** `sheet === 'settings'` becomes a fourth branch in the existing `fdSheet()`
if/else (`frontdoor/fd_sheet.js:271`). That single decision inherits the entire overlay: the
`.fd-sheetbackdrop` sibling with click-to-close, `role="dialog" aria-modal="true"`, the ✕ in
`fdSheetHead()`, and Escape-to-close — because `fdKeyAction` already unwinds on `o.sheetOpen`
(`fd_shell.js:133`). No new overlay machinery, no second close path, no new focus trap, and no
second modal idiom for a reviewer to keep straight.

`fdSheet` is a pure renderer (state in, string out) and stays that way. Everything the panel needs
that it cannot derive — the role list, the analytics posture — arrives on `state`, exactly as
`st.crisisHtml` and `st.protocolFailureCopy` already do.

## What the panel contains

### You — role

Chips rendered from the same per-site `FD_ROLES` list the wizard uses (build-injected from
`curriculum.json`; `spa_index.html:1644`). Selecting one patches `state.role` and re-renders.

One plumbing note: `spa_index.html:1996` resolves `out.role` to the **display name** before
renderers see it, so the panel cannot mark the active chip from `state.role` alone. The caller
passes the raw id and the list — `fd_wire.js:114` already reads `src.roles`, so this is partly
wired already.

**Decision (author, 2026-09-10): the setting ships unexplained.** A plain label and the chips, no
sublabel describing what role currently affects. The explanation arrives when role affects
something worth explaining.

One implication follows and constrains the build: role's effect is close to invisible today, so the
panel must not fire a confirmation toast or success state on selection. A visible "Saved" against a
change the learner cannot see anywhere would promise more than happened — the chip's own selected
state is the entire feedback.

### Pacing — exam date

Moved out of `renderProgress()`, not mirrored. `fd_state.js:17` already records the reason in its
own words: duplicating a key creates two sources that silently desync. Progress keeps a single
line linking here, so the affordance is not lost for anyone who learned where it lived.

### Appearance — System · Light · Dark

A three-way segmented control. See the next section; this is the only item with a real edge case.

### Your data — export and clear

Export routes to the existing anonymous export in Progress (`data-act="studyexport"`) rather than
growing a second export path.

**Clear everything on this device** is a two-tap confirm: the button swaps in place for a confirm
row naming what will be destroyed (progress, spaced-repetition cards, practice answers, calibration
history, preferences), with cancel as the larger target. No typed word — the destruction is
recoverable in the sense that nothing irreplaceable lives here, and a typed confirm on a phone
keyboard on a ward is friction that buys nothing. Clearing returns the learner to first-run setup,
which happens naturally: an empty role sends `fdDispatch` to `screen:'setup-role'`.

### Usage — conditional, and honest about why

Rendered **only when the emitter actually shipped** — that is, when `window.cwAnalytics` exists,
which is exactly when `CLERKSHIP_ANALYTICS` enabled the site at build time. A notice about
collection that is not happening is worse than silence.

`enabled()` returns `!signalsPrivacy() && !optedOut()`, so a learner whose browser sends DNT or GPC
is already excluded by a signal this panel did not set. The panel must say that rather than showing
an unchecked box the learner cannot meaningfully change — otherwise it misrepresents who is
deciding.

The panel adds **no new localStorage key**. Theme reuses `cw_theme`, role `cw_frontdoor_v1`, exam
date `cw_shelf_date`, opt-out `cw_analytics_optout_v1`, and clearing needs none.

## Theme: the migration edge case, stated rather than buried

`cw_theme` gains a third value, `'system'`. The boot script resolves `'system'` — **and unset** —
through `matchMedia('(prefers-color-scheme: dark)')`, and a `change` listener repaints live while
and only while the mode is system.

`data-fd-theme` stops being payload-free and carries a value, so its entry in `FD_ACTION_SEMANTICS`
changes from `'toggle saved color theme'` to `'set saved color theme'` (`fd_wire.js:30`), and the
dispatch at `fd_wire.js:389` stops computing the opposite of the current theme.

**The edge case:** a device that has never touched the toggle has no stored value and gets light
today. Resolving unset to system changes what those learners see on their next visit. It is a
behavior change on existing devices, not a pure addition. Devices that *did* toggle keep their
explicit choice, because the stored value is still literally `light` or `dark`.

**Decision (author, 2026-09-10): ship it.** Unset resolves to system. The learner's operating
system is a better default than this platform's guess, and the population affected is exactly the
population that never expressed a preference here.

## The contract I expected to bite, and why it did not

**This section originally predicted a cost that does not exist. It is kept, corrected, because the
reasoning that survived is the part worth having.**

The prediction: `check-static-site.mjs` scans the built `index.html` for `localStorage` calls whose
key argument is not a string literal (`:490`). A prefix-scoped clear loop calls `removeItem(k)` with
a computed `k`, so the `computed-key` SOFT count would rise; `qa-baseline.json` ratchets SOFT
findings and **promotes any class exceeding its baseline to a HARD failure**; therefore the build
would fail until the baseline was deliberately re-recorded, +1 per site.

**What is actually true, measured during Task 7 rather than reasoned about.** The ratchet counts
soft **messages** per class (`:863-868`), and §5c raises exactly **one** message per file no matter
how many computed keys it finds. The shell already raised it — it had four. Adding a fifth moves
that message's own parenthetical from `(4)` to `(5)` and leaves the `computed-key` class count
unchanged. Both sites build `hard:0` with no ratchet line, and `UPDATE_BASELINE=1` against finished
builds reproduces the committed `qa-baseline.json` byte-for-byte. **No bump was needed and none was
committed.**

The lesson is not about this gate. A confident, specific, wrong cost analysis sat in a spec through
seven tasks and was corrected only because someone ran the thing instead of reading it — the same
failure mode this document warns about everywhere else, committed by the document itself.

**The decision the prediction was used to justify still stands, on its own merits.** Enumerating
every key as a literal `removeItem` is precisely the failure class
`docs/SILENT_SHRINK_CHECKLIST.md` catalogues: a check reporting success over a set smaller than the
one it claims to cover. Only twenty-six keys are reachable as literals; the rest hide behind helper
indirection, and any key added next month by any feature would be silently missed while the panel
still said "cleared". A clear-data that quietly leaves data behind is a privacy bug that reports
success. So: a computed loop, and a test that seeds a `cw_*` key **no source file mentions** and
asserts it is gone. That test is what makes completeness real rather than asserted — Task 7's review
built four separate implementations that leave data behind while reporting success, including one
whose enumerated list contained the seeded key, and every one of them turned the suite red.

`localStorage.clear()` is still rejected: it reaches past the namespace the storage-namespaces
decision governs, and it is invisible to the very scan that would otherwise document the choice.

## Contracts this touches

| Contract | What must change |
|---|---|
| `FD_HANDLED_ATTRS`, `FD_ACTION_SEMANTICS`, selector string | Three sites in `fd_wire.js` (:6, :14, :585) must agree |
| `tests/fd-action-contract.test.mjs:36` | Exhaustive alphabetical list of every emitted `data-fd-*` |
| `qa-baseline.json` | **Nothing.** The +1 was predicted, not real — the ratchet counts one finding per file and the shell already had it. An empty diff here is the expected outcome; a non-empty one means something else moved. |
| `frontdoor.css:867-868` | Coarse-pointer 44px rules name `.fd-themebtn` by class |
| `tests/smoke/front-door.spec.js` | Header pin — a **separate CI job** `bin/verify.sh` cannot see |

That last row is the one that turned #562 red. A green local gate is not evidence the smoke suite
passes.

Copy in `frontdoor/` ships to **both sites unrebranded** — audience-neutral, "Exam" never "Shelf"
(`tests/shell-copy.test.mjs`). All `frontdoor/` modules are **ES5 only**: `var`/`function`, no
`const`/`let`, no arrow functions, no template literals.

## Non-goals

- **Week.** It has a pill. Duplicating it creates a second source of truth for the same state.
- **The Interview Room's `cw_sp_passcode` / `cw_sp_endpoint`.** They belong to that tool, and a
  passcode field in a general settings menu is a security smell.
- **Anything faculty or governance.** The console is a separate site behind a separate credential.
  A learner-facing gear should not hint that it exists.
- **Feature flags and debug surfaces.** `cw_flags` / `rp_flags` are a feedback transport, not a
  preference.
- **A preferences framework.** Five sections, hand-written. The moment this grows a registry it has
  become a second content system with none of the governance the first one has.
- **Reduced motion.** Already honored in CSS (`frontdoor.css:943`). An override toggle would let a
  learner contradict an accessibility preference they set at the OS level.

## Testing

A new `tests/fd-settings.test.mjs` drives the pure renderer directly, as the other `fd-*` suites
do: each section renders from state; the Usage section is absent when the emitter did not ship and
explains itself when a privacy signal is the reason; the active role chip matches the stored id;
the confirm row replaces the button rather than appearing beside it.

`fd-shell.test.mjs` covers the gear replacing the glyph. `fd-action-contract.test.mjs` gets the new
attributes. `spa-shell-a11y.test.mjs` covers the dialog. Theme resolution — stored `system`, stored
`light`, stored `dark`, unset — is testable as a pure function and should be extracted as one
rather than tested through the DOM.

The clear-data completeness test is described above and is the one test in this set that is load-
bearing rather than confirmatory.

## Decisions

All three resolved by the author on 2026-09-10, in the sections above:

| # | Question | Decision |
|---|---|---|
| 1 | Unset theme resolves to system? | **Ship it** — unset follows the OS |
| 2 | `computed-key` baseline +1 acceptable? | **Yes** — completeness over a rotting literal list. (It turned out to cost 0, not +1; the ruling stands either way.) |
| 3 | Does role copy explain its effect? | **No** — ships unexplained, and therefore without a save toast |

Spec approved. Next step is an implementation plan.
