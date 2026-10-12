# Aftercare packet, part 1: choose, order, review (behind a default-off flag)

PR B of the Care aftercare packet (`_prototypes/care-packet/HANDOFF.md` §2). A trainee searching the
ReConnect directory on `?tab=care` can add listings to a running packet, reorder them, and complete a
four-point review. **Nothing prints yet** (PR C) and **nothing is patient-facing** until MaineHealth
approves and an owner-approved source edit flips `FD_CARE_PACKET_ENABLED` (gate G-D).

## Boundaries

- `fd_care_packet.js` owns the gate (`var FD_CARE_PACKET_ENABLED=false;`), the state, the pure renderers
  and the controller. `fd_care_search.js` only asks it for markup and delegates packet clicks.
- With the gate off, `fdCreateCarePacket` is never called and the results renderer receives no packet
  context, so the markup is byte-identical to before (AC0, pinned by the existing search tests and by a
  flag-off browser test that also checks `sessionStorage` stays empty).
- State is one `sessionStorage` key, `fd_care_packet_v1` = `{ids, why, inserts, mode}`. It is written only
  when the packet changes (never while typing), removed when the packet empties, validated on read, and
  every id is filtered through the current directory feed before it renders or counts. Nothing in
  `localStorage`, the URL, history, analytics or the network.
- The tray sits after the results mount and outside it, so typing repaints only results and the tray's
  focus and checkboxes survive.

## Where this deviates from HANDOFF §4/§5, and why

| HANDOFF | PR B | Why |
|---|---|---|
| Why-line input guarded by `CRISIS_KEYWORD_PATTERN` "like the visit summary bullets" | **Not built.** `why` stays `{}` in the stored shape | The pattern and the visit-summary behaviour are "doc 18"; neither exists in this repo. The why-line is the only patient-facing free text, so a hand-rolled crisis classifier is the wrong thing to invent. Open question Q3 already allows holding it until G-D. |
| Print and Copy buttons, disabled until the review gate | Gate + a `role="status"` readiness line; **no buttons** | A button that does nothing is worse than none. The enable rule (`fdCarePacketCanPrint`) is built and tested; PR C attaches the buttons to it. |
| Label flips to "✓ In packet" | Constant label **"Add to packet"**, `aria-pressed`, a visible "In packet" tag and a CSS check | A visible label that differs from the accessible name fails WCAG 2.5.3 (voice control). State is never colour alone. |
| `fdCreateCarePacket(index, inserts, crisisHtml)` | `fdCreateCarePacket(options)` | PR B has no print inputs. PR C widens the signature. |
| Flag "in `spa_index.html` next to the sharing flag" | Flag in `fd_care_packet.js` | The sharing flag actually lives in `fd_care_pack.js` (#1029). The test fixture replaces the same literal form. |
| AC5 (sheet output) | PR C | `fdCarePacketSheet` does not exist yet. |
| Tray has a **Preview** button; state carries insert switches and a print mode | **Not built.** `inserts` and `mode` are stored and validated (known insert names, `review`/`final`) but nothing writes them | Preview, the standard inserts and the two print modes are PR C. The stored shape is already the v1 contract, so C needs no migration. |
| Review gate "resets when the tab is left" | Resets when the tab is left **and** whenever a listing is added or the packet is cleared; the boxes are disabled while the packet is empty | An independent review found the confirmations could be ticked on an empty packet and then survive every later change, so a trainee could confirm one listing and print another. Removing or reordering does not reset (nothing unreviewed is added). |
| `ids()` filtered through the directory, always | Filtered for display and count, but **a partial feed (a category failed to load) never deletes saved ids**; they stay hidden, hold their slots, and the tray says so | A transient load failure must not destroy a trainee's saved listings. A complete feed that lacks an id still drops it as stale. |
| Add / remove announced and the packet count spoken | Announced through the shared polite region **after** the repaint and focus move (150 ms), with the count; readiness changes are announced there too | The tray's own readiness line is plain text, not a live region (it is recreated on every repaint). |

## Known limits for the G-B review

- **Clear packet has no confirmation or undo.** The brief asks for a plain Clear; one press removes up to 12 curated listings. Say if you want a confirm step.
- A pressed card button still reads "Add to packet" (with a check, `aria-pressed` and the "In packet" tag); pressing it again removes the listing. Tell me if that reads as unclear on a real phone.
- A feed id longer than 120 characters can be added but is dropped on reload (the stored-id bound). The directory feed does not produce such ids today.
- Screen-reader behaviour (NVDA / JAWS / VoiceOver) was reasoned about and probed in code, not run. The 150 ms announcement delay is the thing to confirm by ear.

## Execution ledger

- [x] Unit tests written and seen failing (module missing); implementation to green.
- [x] Browser spec written and seen failing (11 of 12 failed for the right reason; the flag-off test passed).
- [x] Independent review (5 lenses, 13 verifier runs): the confirmed findings are fixed test-first (gate bound to the packet, focus and scroll, announcements, display-order focus after Remove, partial-feed safety, and a set of vacuous tests made real).
- [x] Browser spec green on both site projects (42 passed including the directory regression).
- [ ] Full `bin/verify.sh`; draft PR.

Review gate G-B (owner): add / bulk / tray behaviour on desktop and phone, and whether the cap and the
"eight or fewer" nudge feel right. The feature is invisible on a deploy preview (the gate is off in
production source), so the PR carries flag-on screenshots and says how to run it locally.
