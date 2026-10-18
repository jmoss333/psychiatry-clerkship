# Case of the Week — a registry-rendered archive, grouped by topic (O3)

**Date:** 2026-10-17 · **Status:** built on `claude/cotw-archive-2026-10-17` · **Author:** Claude (Cowork), for Joshua Moss, MD
**Origin:** O3 of `claude/org-and-features-review-2026-10-17.md` (project doc); depends on the topic hubs (#1080, merged `471f29e7`).

## 1. The problem, measured

In the learner shell the weekly cases are reachable by browsing **only through the index page** (`cotw_index.md`, placed in the Library's *Evidence & exam* column): the case pages are not Library-placed and the legacy nav section no longer renders. The index's line-up was hand-written, attested 2026-09-26, and on 2026-10-17 listed **12 of the 17 shipped editions** — Sep 7 (first-episode psychosis), Sep 23, Sep 28, Oct 5 and Oct 12 could be found by search and (since #1080) by the topic hubs, but not by browsing. Its "How to use it" still pointed at a sidebar that no longer exists. A hand-maintained list of a weekly artifact rots by one line a week.

The 17 editions cover 12 subjects; five subjects have two editions (suicide risk, agitation/delirium, mania, MDD treatment, serotonin syndrome vs NMS), and the date-ordered list gave no sign which was current.

## 2. What was built

| Piece | Change |
|---|---|
| `site_build/cotw_archive_block.py` | Renders, at `<!-- cotw-archive -->`: **Newest case** (one line) then **All cases, by topic** — every shipped edition for the site grouped under the topic hub that claims its registry `topic` (`topic_hubs.json` `cotwTopics`; unclaimed → *Other topics*), newest first within a group, each with the registry's own `tldr_<level>`/`tldr` line, and *(earlier edition)* when a group already listed the same subject (same topic code **or** same label stem — the Oct 12 case is coded `safety`, the Jul 23 one `suiciderisk`). Reads "what ships" via `shipped_pages` and the registry via `cotw_slug.cotw_weeks()` (the one shared reader; no new direct reader). 8-test `--self-test`. |
| `cotw_registry.json` | `tldr_ms3` / `tldr_res` for the six editions that had no one-liner (Sep 7 → Oct 12). These are the same fields `cotw_meta.py` already renders above each case, so those six case pages also stop showing the generic fallback sentence. Build-only effect; no attestation moves for the case pages. |
| `index_ms3.md`, `index_resident.md` | The stale hand-written line-up is replaced by the marker; "Pick the current week from the sidebar" becomes "Pick a case from the list below". **This is a source edit to an attested page: `cotw_index.md` (one slug, both sources) needs one re-sign.** The blurbs the hand list carried are not lost — the registry `tldr` lines carry the same role, and the five missing editions gain one. |
| `build_deploy.py`, `resident_section.py` | Inject at the marker in the same md loops as the hub block; `assert_complete()` fails the build if any shipped edition for the site is not linked from the rendered index; a missing marker aborts the build. |
| `bin/verify.sh` | `unit — case-of-the-week archive` runs the self-test (policy-only commit; the vacuity gate requires a named step). |
| `tests/cotw-archive-block.test.mjs` | Every shipped edition listed exactly once per site, correct twins, newest first, hub-label groups; both sources carry the marker; both scripts wired and fail-closed; copy audience-neutral. |

## 3. Acceptance checks

| Check | Where |
|---|---|
| Archive lists exactly the shipped editions for each site (no missing, no extra, right twin) | node test + build-time `assert_complete` |
| Newest case on top; newest first within each topic; second edition of a subject marked | self-test + node test |
| Marker present in both index sources; the hand list does not return | node test |
| An unclaimed topic lands under *Other topics*, last | self-test |
| Deterministic render | self-test |
| Every `?page=` link resolves | existing `check-static-site.mjs` |
| `shipped_pages.json` unchanged (no new producer) | existing `--check` |

## 4. Faculty decision

1. **Re-sign `cotw_index.md`** once from the console (general / low). After that the index never needs a hand edit again: a new registry row appears in the archive on the next build.
2. The six new `tldr_ms3`/`tldr_res` lines are teaching copy drafted from the case pages — they ride under the index re-sign and are visible in the diff; edit any you would phrase differently.
3. The weekly case workflow should write `tldr_ms3` and `tldr_res` for each new entry (optional; without them the archive shows the title alone). Adding `blueprint` for the six newest entries is a separate registry-hygiene follow-up (it changes the crosswalk coverage counts, so it should ride alone).

## 5. Not done, deliberately

- No change to the legacy nav section or to Library placement of individual case pages (they remain reachable through the index, search and the hubs).
- No "current case" slot on Today — the index's **Newest case** line is the live slot for now.
