# Kickoff prompt for Claude Code — Phase 1 (shell and Today)

Paste this into Claude Code at the root of `jmoss333/psychiatry-clerkship`, with this folder copied to `docs/superpowers/specs/one-thread-handoff/`.

---

You are implementing Phase 1 of the "One thread" Library redesign. The specification is `docs/superpowers/specs/one-thread-handoff/README.md`; the visual references are the `.dc.html` files beside it. Open `Library Redesign.dc.html` in a browser to see them.

Before writing code:
1. Read `CLAUDE.md` in full, and `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` for the shell, Today and dock surfaces.
2. Run `git fetch origin` and confirm #949 and #951 are merged. If they are not, stop and report back. Phase 1 must rebase on both.
3. The owner has answered D1–D6 (README, "Owner decisions"). Implement them as recorded; do not re-ask.

Scope — shell and Today only. Do not touch content sources, governance paths, medication files or `reviewed.json`:
- `fd_shell.js`:
  - Desktop header: remove the week pill (D4); add "＋ Ask a question", which opens the existing capture dialog.
  - Phone: one-row top bar, no `.fd-carebtn`.
  - Dock: five fixed items (Today, Path, Library, Care, ＋ Ask). Remove the context slot and the Browse `<details>` menu.
- `spa_index.html` / `fd_wire.js`:
  - Remove the floating global capture launcher.
  - Keep `data-fd-dock-source` attributes, but stop forwarding the primary into the dock.
  - Keep focus restoration and keyboard shortcuts working.
- `fd_today.js` + the spa_index "Also today" assembly — render Today in this order:
  1. place: eyebrow, week-title H1, theme line, and the new `.fd-thread` six-week mark row;
  2. the One-Thing-First Now card (a single shell for every primary kind);
  3. "Also today" as flat rows;
  4. the preparation chooser with its open state preserved;
  5. the week list;
  6. "On the unit this week", derived from `longitudinal_case.json`, only where the tool ships;
  0. the active-testing line at the very top, one row (D1);
  7. the rail (safety kit, quick tools, learning-record link).
  
  Move the activity strip to Learning activity & review (D2), remove the daily pick, and the pills' `order:-1` hoist.
- `frontdoor.css`, `clinical-warm.css`:
  - Add `--fd-font-4xl:34px`, `--fd-font-section:19px` and `--fd-space-11…14` (32/40/48/64).
  - Alias `--fd-success` to `--fd-teal` per D6.
  - Labels in sentence case; one focus ring (3px `--fd-focus`, offset 2px).
  - Under reduced motion: no row stagger and no animation.
- Update `CLASS-INVENTORY.md` in the same PR.

Constraints:
- ES5 only in frontdoor modules.
- Audience-neutral copy.
- No new persisted state.
- `FD_TODAY_PRIMARY_ORDER` must not change.
- Tests use governance fixtures, never live ledger state.

Done means:
- Every Phase 1 acceptance criterion in the README passes.
- `node --test tests/*.test.mjs`, `bash bin/verify.sh`, `build_and_check.sh ms3` and then `build_and_check.sh res` all pass.
- The smoke suite is updated: `front-door.spec.js` dock/header locators and the 320px overflow pin.
- Open a **draft** PR. Do not merge or deploy. Ask the owner to trigger the "Refresh visual baselines" workflow.
