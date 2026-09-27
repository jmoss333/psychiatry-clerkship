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
| Select | a `.casegrid` of four cards, each with two Begin buttons | the **entrance**: the door shows the *chosen* patient (serif name, occasion, setting, goal, "Your case brief" with cadence and skill chips) and the access panel chooses the patient from a select, states the room, and carries the same two Begin buttons. The whole entrance is the `.case` the smoke locator reads; the family door stays its own dashed section after it |
| Spoken room | roomhead, coloured audio rail, chat, composer | control head with "In the room", `AI voice` tag and the `Turn n / N` pill; the **room view** projected from the realtime snapshot (`spokenRoomView`); the audio rail restyled as the status row; pilot bubbles; the composer as the controls block |
| Typed room | same shape as the spoken room | the same panel; the room view is projected from the device-voice state (`typedRoomView`), its microphone chip reads `Typing · no microphone` |
| Step-out door | a modal panel | the same modal, in the coach's pale-green language |
| Self-assessment | a bare column | a card with the section label and serif questions |
| Debrief | tool cards; a dark-brown safety card | pilot cards; the safety card in the deep green; feedback notes in the pilot's amber draft-note style |

### The room view is a projection, not a fact

As in the pilot (room view Slice A, #648), the scene draws no case fact: the setting is illustrative, the figure shows seating and turn, never expression or body language, and the legend under it says so. It is derived from state the room already holds — the realtime `phase`, the last patient entry and the interims in the spoken room; the voice controller's phase, `isBusy` and the active turn's text in the typed room — and holds nothing of its own.

| Room state | Seat | Microphone chip | Caption |
|---|---|---|---|
| connecting | idle, tag `joining` | off | *Room · Getting ready…* |
| listening | dashed floor ring, `answers next` | on | *Listening · Your turn — take your time.* or the learner's interim words |
| thinking | amber `preparing` | on | *Dana · thinking…* |
| speaking | pulsing halo, `speaking` | on · speak to interrupt | the line being said |
| paused / ended / error | dimmed | off | *Paused · …* / *Room · closed* / *needs your choice* |
| interrupted (last reply cut, learner's turn) | amber cut ring | on | as listening |

### Colour: the pilot's names as aliases of the tool's tokens

Every tool shares the Clinical Warm tokens and a `[data-theme="dark"]` block, and `bin/check_design_drift.py` C4 fails a shipped tool whose declared colour tokens have no dark counterpart. The pilot's stylesheet is light-only. So the pilot's names are **aliases**: `--paper: var(--bg)`, `--card: var(--surface)`, `--line: var(--border)`, `--muted: var(--text-mid)`, `--green: var(--accent)`, `--green-dark: var(--accent-dark)`, `--pale: var(--accent-light)`, `--amber: var(--warning)`; the room scene's warm neutrals are their own `--room-*` tokens with dark values. Dark mode therefore works without a second stylesheet, and the tool keeps the site's own green (`#2a6b5e`) and paper (`#f6f3ee`) rather than the pilot's near-identical `#245e60` and `#edf2ef`.

**One-line switch, the owner's call:** to wear the pilot's exact tint, set `--paper:#edf2ef` and `--green:#245e60` in `:root`; nothing else changes.

No raw colour overrides a token in a narrower selector (C8); white-on-green text uses `--on-brand`; the deep safety card uses `--deep` / `--deep-on`.

## What the tests pin, and what moved

- `tests/smoke/interview-room.spec.js` read `.casegrid` for two document-order assertions (the Room select before the case chooser; the family door after the whole chooser and not inside it). Both now read `.entrance`, which is the same claim about the new markup. Every other selector, role, name and text the spec pins is unchanged: `.case` with the patient's heading and `Begin — Supported`, `.badge.mode`, the `Room` combobox, `.audiostatus`, `.msg.pt` / `.msg.me`, `.tag`, `Turn n / N` (now the pill, and only there — a second occurrence would make `getByText` ambiguous), the dialogs, the buttons.
- `tests/tool-frame.test.mjs` (`cw-frame: viewport` stays), `tests/crisis-block.test.mjs` (`<!-- crisis-block-html -->` stays after the script) and `tests/conversation-encounter-profiles.test.mjs` pass unchanged.
- `_prototypes/sp-interview/tests/preview.test.mjs` pins the generated twin: regenerate with `node _prototypes/sp-interview/generate-preview.mjs --write` after any edit to the canonical file.

## Governance

`sp-interview.html` is content (the `sp-interview.html` ledger row's source), so this change drifts that row to pending on every surface until the faculty console re-attests it. The pack, the proxy and the runner are untouched; the smoke spec edit is `tests/` outside `tests/maintenance/`, which is neither content nor governance.

## Not in this change

- The pilot's quiet-window bar: the realtime room has no client silence timer to draw (the provider's turn detection decides), so there is nothing truthful to animate.
- The pilot's student station (door note, task, chart request, marked moments, attending presentation) and practice-moment coaching: those are pilot content awaiting their own review, not presentation.
- The family room's two seats: the family visit still opens in the pilot.
