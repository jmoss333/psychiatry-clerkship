# Library task shortcuts pilot

Approved scope: add **All · Interview · Rounds** to the shared learner Library, for both audiences.
The shortcuts curate existing navigation; they do not change clinical content or its governance.

## Behavior

- All is the default and preserves the existing catalog order.
- Interview offers Suicide Risk & Safety first, then Interview & MSE, then the Mental Status Exam tool.
- Rounds offers Documentation & Oral Presentation, Treatment Team Rounding Prep, and the audience's formulation guide: Formulation & DDx for MS3, Case Formulation for residents.
- Task membership intersects the current Essentials/Everything view, section and title/topic filter. A task never introduces a resource absent from that view.
- View totals remain the full catalog totals. Section badges count the combined task/text matches. The status line names the task and section; with text, its denominator is the task/section set before text filtering.
- An active task's desktop preview must belong to the final visible set. Zero matches hide it and offer Search the library, Clear task, All sections, and Clear filter when applicable.
- Existing title Open, Details, governance labels and global Safety/Search routes remain available.
- Task state is transient: view switches, Details and resource Open/Back preserve it; a fresh Library visit or reload starts at All. No storage key or URL parameter is added.

## Validation and delivery

Exercise both audience projections and both Library views in renderer tests. Controller tests cover valid actions, context guards, focus, history and the persistence boundary. Browser checks cover desktop and phone widths, safety ordering, combined filters, empty recovery, Open/Back, Details, keyboard focus and horizontal overflow.

Deliver a draft PR with hosted previews usable from a phone. Merging and production release are separate steps. Automated browser checks do not certify physical-device or native VoiceOver behavior.

## Later possibility

A curated Read → Rehearse pairing could connect a task's reading to an existing practice tool. This is outside the pilot and must not introduce generated clinical instructions.
