# The Interview Room wears the spoken pilot's style

**Date:** 2026-09-27 · **Owner ask:** "I want the live interview room to have the same style the pilot had of the spoken interview room." · **Status:** implemented in `_prototypes/sp-interview/sp-interview.html` (version 0.4.0); the generated twin `sp-interview.preview.html` regenerated with it.

## What "the pilot" is

`sp-preview/` is the protected spoken Interview Room hosted at `interview-room-faculty-preview.netlify.app` (README: "Protected spoken Interview Room"). Its presentation, in `sp-preview/dist/styles.css` and `dist/index.html`, has a recognisable signature:

- a **masthead** with the door mark, a serif title and a badge on the right;
- a two-column **entrance** — the *door* (a section label, one large serif headline, a green lede, the brief) and the *access panel* (a white card with a green top border: choose the encounter, a filled green Start, fine print, a keyboard tip);
- one **encounter panel**: a control head ("In the room", the patient's serif name, an "AI voice" tag, a turn-count pill), the **room view** (a drawn room — window, low table, chair, plant, door — with a seated figure whose halo pulses while the patient speaks and whose floor ring says who answers next, a name chip, a microphone chip, and a caption card carrying the line being said), the transcript as soft bubbles with the speaker's name in green, and a **controls** block with a status dot, a hint and quiet green buttons;
- the **coach** as a private aside: a pale panel with a green left border and a serif prompt;
- paper background, white cards, dark ink, one green, a serif for headings and a system sans for everything else.

The live room (`sp-interview.html`, the tool both learner sites ship) had none of that: a terracotta title, a grid of four case cards, a chat panel with a coloured status rail, and a debrief in the general tool palette.

## What changed

The tool's stylesheet and the chrome of every screen now carry the pilot's design language. Behaviour, state machines, storage keys, copy the tests pin and the crisis block are untouched.

| Screen | Before | After |
|---|---|---|
| Header | kicker, terracotta h1, mode pills, Room select in a title row | `.masthead`: door mark + kicker + serif title on the left; the mode badge, setup and the Room select as quiet badges on the right |
| Select | a `.casegrid` of four cards, each with two Begin buttons | the **entrance**: the door shows the *chosen* patient — the pilot's headline sentence around the name (*Begin with Dana’s story.*), the occasion in serif, the green lede *Practice a conversation. Leave room to listen.*, setting, goal, "Your case brief" with cadence and skill chips — and the access panel chooses the patient from a select, states the room, and carries the same two Begin buttons. As in the pilot's markup the access panel comes **first in the DOM** (`grid-template-areas` keeps the door on the left on wide screens; the phone column shows the controls first). The whole entrance is the `.case` the smoke locator reads; the family door stays its own dashed section after it |
| Spoken room | roomhead, coloured audio rail, chat, composer | control head with "In the room", `AI voice` tag and the `Turn n / N` pill (the setting and mode lines under the name are kept — the pilot's head is quieter, but the learner needs to know which room and whether a door exists); the **room view** projected from the realtime snapshot (`spokenRoomView`); pilot bubbles; then, as in the pilot's `.controls`, the **status row** (dot, status, the hint on its own line) opening the controls block *under* the transcript. The roomhead's waveform chip (`SpeakBars`) is retired — the seated figure's halo carries the speaking state |
| Typed room | same shape as the spoken room | the same panel; the room view is projected from the device-voice state (`typedRoomView`), its microphone chip reads `Typing · no microphone`; the status dot follows the typed phase as the pilot's does (hollow green `ready`, amber `thinking`, solid `speaking`, red `error`) |
| Step-out door | a modal panel | the same modal, in the coach's pale-green language |
| Self-assessment | a bare column | a card with the section label and serif questions |
| Debrief | tool cards; a dark-brown safety card | pilot cards; the safety card in the deep green; feedback notes in the pilot's amber draft-note style |

### The room view is a projection, not a fact

As in the pilot (room view Slice A, #648), the scene draws no case fact: the setting is illustrative, the figure shows seating and turn, never expression or body language, and the legend under it says so. It is derived from state the room already holds — the realtime `phase`, the last patient entry and the interims in the spoken room; the voice controller's phase, `isBusy` and the active turn's text in the typed room — and holds nothing of its own.

| Room state | Seat | Microphone chip | Caption |
|---|---|---|---|
| connecting | idle, tag `joining` | off | *Room · Getting ready…* |
| listening | dashed floor ring, `answers next` | on | *Listening · Your turn — take your time.* or the learner's interim words |
| thinking | amber `thinking` (kind `preparing`) | on | *Dana · thinking…* |
| speaking | pulsing halo, `speaking` | on · speak to interrupt | the line being said |
| paused / ended / error | dimmed | off | *Paused · …* / *Room · closed* / *needs your choice* |
| interrupted (last reply cut, learner's turn) | amber cut ring | on | as listening |

Typed room: the idle caption reads *Typed room · Say what you would actually say.*, speaking falls back to *reading the reply aloud*, and mock mode appends *(offline simulation)*; seat, ring and chip follow the same rows. The visually-hidden alt under the scene is the pilot's ("Illustration of the room from your seat …; the name, whether they are speaking, and the live caption are given in text below") — it does not repeat the caption, so a screen reader hears each line once.

### Colour: the pilot's names as aliases of the tool's tokens

Every tool shares the Clinical Warm tokens and a `[data-theme="dark"]` block, and `bin/check_design_drift.py` C4 fails a shipped tool whose declared colour tokens have no dark counterpart. The pilot's stylesheet is light-only. So the pilot's names are **aliases**: `--paper: var(--bg)`, `--card: var(--surface)`, `--line: var(--border)`, `--muted: var(--text-mid)`, `--green: var(--accent)`, `--green-dark: var(--accent-dark)`, `--pale: var(--accent-light)`, `--amber: var(--warning)`; the room scene's warm neutrals are their own `--room-*` tokens with dark values. Dark mode therefore works without a second stylesheet, and the tool keeps the site's own green (`#2a6b5e`) and paper (`#f6f3ee`) rather than the pilot's near-identical `#245e60` and `#edf2ef`. The pilot's role rule holds too: every text role (section labels, links, `kbd`, `summary`, buttons, the status text, the speaker's name in a bubble, the room tags and caption label) is `--green`; `--green-dark` is the primary button's hover and the link hover only. Two accents stay terracotta: `.sa label .num` and `.teach p .pin` keep `color:var(--primary-dark)` because `tests/contrast-check.mjs` pins them for AA (WP-03).

**The switch, the owner's call:** two declarations in `:root` — `--paper:#edf2ef; --green:#245e60` — give the pilot's paper and green in light mode; `--green-dark`, `--pale`, `--line` and `--muted` stay on the site's tokens and the dark block is unaffected.

No raw colour overrides a token in a narrower selector (C8); white-on-green text uses `--on-brand`; the deep safety card uses `--deep` / `--deep-on`, and its *Re-run this encounter* button sits on the card colour (`--card`, hover `--controls`) because the pale tint over the deep green fell to 3.5:1 in dark mode. The build-injected crisis block reads `--cw-surface/--cw-text/--cw-border/--cw-accent`, which the tool now declares in both blocks so the block follows the theme instead of staying a light island.

## What the tests pin, and what moved

- `tests/smoke/interview-room.spec.js` read `.casegrid` for two document-order assertions (the Room select before the case chooser; the family door after the whole chooser and not inside it). Both now read `.entrance`, which is the same claim about the new markup. `caseCard()` filters `.case` by its heading, which is now the pilot's sentence `Begin with <name>’s story.` (still `exact: true`; not a regex, which would also match the family door's *Morgan and Maya*, and not an `aria-label`, which would hide the visible text from the accessible name). Every other selector, role, name and text the spec pins is unchanged: `.badge.mode`, the `Room` combobox, `.audiostatus` (its text, not its position), `.msg.pt` / `.msg.me`, `.tag`, `Turn n / N` (now the pill, and only there — a second occurrence would make `getByText` ambiguous), the dialogs, the buttons.
- `benchmarks/interview-room/{calibration,round-two-reviewer,round-two-facilitator}.html` embed the sha256 of `sp-interview.html` in their provenance block, so `sp-proxy/tests/interview-calibration.test.mjs` and `interview-round-two.test.mjs` go red on any edit to the tool until the pages are regenerated: `node benchmarks/interview-room/calibration.mjs --write && node benchmarks/interview-room/round-two.mjs --write` (the ritual #821 followed; the first push of this change missed it and CI's *Test — SP Interview and managed proxy* step said so).
- Keyboard: the entrance wrapper carries no React `key`, so changing the patient re-renders the door in place and the select keeps focus (a keyed wrapper remounted the select on the first ArrowDown). The room legend's `summary` inherits the tool's 44px control height.
- `tests/tool-frame.test.mjs` (`cw-frame: viewport` stays), `tests/crisis-block.test.mjs` (`<!-- crisis-block-html -->` stays after the script) and `tests/conversation-encounter-profiles.test.mjs` pass unchanged.
- `_prototypes/sp-interview/tests/preview.test.mjs` pins the generated twin: regenerate with `node _prototypes/sp-interview/generate-preview.mjs --write` after any edit to the canonical file.

## Governance

`sp-interview.html` is content (the `sp-interview.html` ledger row's source), so this change drifts that row to pending on every surface until the faculty console re-attests it. The pack, the proxy and the runner are untouched; the smoke spec edit is `tests/` outside `tests/maintenance/`, and the regenerated benchmark pages are `benchmarks/`, neither of which is content or governance.

## Not in this change

- The pilot's quiet-window bar: the realtime room has no client silence timer to draw (the provider's turn detection decides), so there is nothing truthful to animate.
- The pilot's student station (door note, task, chart request, marked moments, attending presentation) and practice-moment coaching: those are pilot content awaiting their own review, not presentation.
- The family room's two seats: the family visit still opens in the pilot.
