# Learner continuity pilot

Approved scope: both learner sites gain a small Library continuation area and optional pinned
tools. This adds navigation convenience, not clinical advice, assessment, or evidence approval.

## Experience

- Place “On this device” after the Library's normal content in Essentials and Everything. It
  must not push the first reading below the phone's fixed bottom navigation at 320 or 390px.
- A compact “On this device” shortcut shares the Library heading's row and scrolls to the
  continuation heading with keyboard focus. No new row is added before the first reading.
- “Continue reading” shows at most three unfinished readings with a valid saved position,
  ordered by that position's update time. Opening a reading without saving a position does not
  create a new history record. Continue uses the existing reader resume action and governance.
- Sectioned guides also save positions. Explicit passage/search links and returns from practice
  retain arrival priority; collapsed headings cannot become saved positions or resize targets.
- Only current audience resources actually placed in the Library are eligible. Hidden,
  unlisted, missing, tool, and completed references never enter recent readings.
- Each recent reading has Remove; Clear saved places removes all saved reading positions.
  These controls do not clear completion, questions, or other learning data.
- Tool rows have Pin/Unpin. The continuation area lists pinned tools and has Clear pins.
  Five pins are allowed; a sixth is declined with an explicit message, never silently evicted.
- Today Quick tools places valid pins first, followed by its existing suggestions, with its
  existing five-item cap. Safety kit membership, ordering, actions, and governance are unchanged.
- Saved-state failures display an honest failure message. No successful save is claimed when
  the browser refuses storage. Changes preserve current task, section, text filter, and route.

## Data and storage allowlist

`cw_tool_pins_v1` is the sole new allowed localStorage key. Its only value is an ordered JSON
array of at most five unique canonical local `.html` resource references. No free text, user or
patient identifiers, timestamps, history, telemetry, or network calls are added. The
`fd_tool_pins.js` store validates every read and write against the current audience's projected
catalog; rights notices and hidden/search-only/reader-only resources cannot be pinned. The
existing device erase removes this namespaced key automatically.

Reading positions retain their existing single home, `cw_frontdoor_v1.readingPlaces`, existing
50-record bound, and existing heading/offset/time schema. The recent list is a derived view,
not another store. Pin state and feedback notices do not enter `FD_KEYS` or the URL.

## Verification

Unit checks cover catalog/audience rejection, completion exclusion, deterministic newest-three
selection, safe escaping, resume affordances, persistence failure, remove/clear scope, Quick tools
priority/cap, preserved Safety, and existing Library task/filter/history behavior. Browser smoke
checks cover both audiences, pin/reload/Today/unpin, reading resume/removal, first reading at
320/390px, and keyboard focus. Automated Chromium does not claim physical-device or VoiceOver proof.
