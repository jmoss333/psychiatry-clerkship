# Today announces the week's Case of the Week

**Date:** 2026-10-17 · **Status:** built on `claude/today-newest-case-2026-10-17` · **Author:** Claude (Cowork), for Joshua Moss, MD
**Origin:** the "innovative next idea" under O3 in `claude/sequence-status-2026-10-17.md` (project doc); depends on the registry-rendered archive (#1082, `cotw_archive_block.py`).

## 1. The gap

The weekly case is the library's one *live* artifact, and after #1082 a learner can find it — by search, from a topic hub, or from the archive index. All three require the learner to go looking. Nothing on **Today**, the page the site opens on, says that a new case exists. The archive already computes "the newest edition for this site" on every build; this turns that line into a one-row announcement in the week the case ships, with no new content and no attestation movement.

## 2. What was built

| Piece | Change |
|---|---|
| `site_build/cotw_archive_block.py` | `newest(data, site)` → `{slug, title, date: YYYY-MM-DD}` for the newest shipped edition of the site (the row the index lists as *Newest case*), or `None`. Same data path as the archive — `shipped_pages` + `cotw_slug.cotw_weeks()` — no new reader. |
| `build_deploy.py`, `resident_section.py` | Inline it as the verified needle `var FD_COTW_NEWEST=null;` (the `FD_MEDIA` pattern): the MS3 build injects its edition; the resident build matches that exact value and swaps in the `_res` twin, aborting on a drifted needle. Nothing reads the clock at build time, so the built page is byte-stable between builds. |
| `spa_index.html` (`fdTodayLive`) | Hands the needle in raw as `state.newCase`. Shown in a faculty preview too: it is build data, not a device store. |
| `frontdoor/fd_today.js` | `fdNewCase(newest, nowMs)`: pure. Renders the row only when the local calendar day of `nowMs` is the registry date or one of the six days after it (`FD_NEWCASE_WINDOW_DAYS=7`); null for anything malformed. `fdNewCaseRow()` emits one `<button class="fd-newcase" data-fd-open="<slug>">` with kicker *New this week · Case of the Week*, the title, and *Open →*. In `fdToday` it joins **Also today** as a `ring`-marked row after the week's own row and before saved questions — it is never the Now card, so One Thing First is unchanged. |
| `frontdoor/frontdoor.css`, `CLASS-INVENTORY.md` | Four new selectors (`.fd-newcase`, `__kicker`, `__title`, `__action`) that reuse the Also-row measurements; count 758 → 762. |

Why a seven-day window from the registry date rather than "until the next case": Today should carry an announcement, not a standing link — the archive, the hubs and search are the standing routes. A case that lands late in its week gets a shorter window, never a longer one, so a stale "new" is impossible by construction.

## 3. Acceptance checks

| Check | Where |
|---|---|
| Window: shown from 00:00 on the registry day through 23:59 on day seven, local time; hidden the evening before and on day eight; crosses a month end | `tests/fd-today.test.mjs` |
| Malformed data (no slug/title, non-ISO date, no clock) renders nothing, never throws | `tests/fd-today.test.mjs` |
| Row markup: one `data-fd-open` button, escaped slug and title, audience-neutral copy, no new action attribute | `tests/fd-today.test.mjs` |
| Placement: Also today, after the demoted week row, before saved questions; closes the list otherwise; shows with no week set; never inside `.fd-now` | `tests/fd-today.test.mjs` |
| Shell hands the needle in; needle present exactly once; MS3 injects, resident matches-and-swaps before writing its index | `tests/block-wiring.test.mjs` |
| `newest()` returns the right twin per site, ISO date, exactly three keys; `None` with nothing shipped | `tests/cotw-archive-block.test.mjs` |
| Live, both sites: at FROZEN_NOW no row; on the edition's registry date one `ring` row in Also today (planner · case · saved questions), the primary unchanged and still first-focusable, clicking opens `?page=<slug>` with a reader heading; on day eight the row is gone | `tests/smoke/front-door.spec.js` |

## 4. What does not move

- No source page, `topic_meta.json` record or registry row changes: **0 re-signs.**
- The visual baselines (`front-door-today-*.png`) are rendered at FROZEN_NOW = 2026-08-17, before every edition that can ever be newest, so they do not change. The screenshot at the registry date is the one thing not covered by a baseline; the smoke test covers the DOM.
- The `tests/smoke` A2/A3 order assertions run at FROZEN_NOW and are unaffected.

## 5. Open questions for Josh

1. Seven days from the registry date — or should the row stay until the next edition replaces it?
2. The kicker reads *New this week · Case of the Week*. The index block says *Newest case*. Keep both, or align?
3. Should opening the case from this row count toward the week's progress? (It does not: the case is not a week item; nothing is written.)
