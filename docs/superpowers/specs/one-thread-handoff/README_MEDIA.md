# Handoff: Podcast & Book integration ("Beyond this page")

## Overview
Bring the two existing media libraries into each reading:
- `podcast_library.md` (Dr. David Puder's Psychiatry & Psychotherapy Podcast, 250+ episodes)
- `book_library.md` (the curated MS3 book list)

The chosen direction is **B · "For you / For the family"** in `Media Integration.dc.html`. At the end of a reading, under "Next in this thread", there is an optional block called **"Beyond this page"** with:
- **For you · listen:** up to 2 podcast episodes for the learner.
- **For the family · read:** up to 2 books the learner could offer a family, together with the book library's existing "how to offer it" and safety lines, word for word.

Picks are matched by the **page**, not the learner. They come from a curator-owned map (`media_map.json`, drafted as `media_map.draft.json`).

This builds on the main redesign handoff (`README.md` in this folder): the "Next in this thread" component and the Reader layout from Phase 3. It can ship before the Case Journeys part of Phase 3 because it only touches the shell and build.

## About the design files
`Media Integration.dc.html` is an HTML design reference, not production code. Recreate it inside the existing Front Door: `fd_reader.js`, `frontdoor.css` and `spa_index.html`, plus the build scripts in `13_Faculty_Resources/_automation/site_build/`. **Fidelity: high.** Use the tokens and type from `README.md` → Design tokens.

---

## Non-negotiable rules (in addition to CLAUDE.md and README.md)
1. **Do not edit the libraries.** `07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md`, `12_Media/psychiatry_psychotherapy_podcast_library.md`, and their `topic_meta.json` records (`book_library.md`, `podcast_library.md`) stay byte-identical, so no attestation drifts.
2. **Single source.** `media_map.json` stores **keys only**: episode numbers and ISBNs. Titles, authors, descriptions and links are parsed from the two library files at build time.
3. **Verified links only.** Only episodes whose line carries `[▶ YouTube](https://www.youtube.com/watch?v=…)` are eligible. Episodes marked `▶ search channel` must fail validation if picked.
4. **Optional, never counted.**
   - The block is never shown on Today and never enters the week list, due reviews, the block planner, the One-Thing-First picker, or any completion or progress state.
   - No "listened" tracking. No new localStorage key.
5. **Copy.**
   - Shell strings stay audience-neutral (no MS3, resident or site names).
   - The guidance lines are copied verbatim from `topic_meta.json` → `book_library.md.clinicalWorkflow.say` / `.safety` and `podcast_library.md.clinicalWorkflow.say` / `.safety`. Read them from the data; do not retype them.
6. **Medication workstream.** Do not pick medication-focused episodes and do not link into `05_Psychopharmacology/**`. The draft already excludes them.
7. **Safety.**
   - Never render the block on a page carrying the crisis-block marker above the crisis block, and never inside a governance notice.
   - On safety-tagged pages (week 5) the block stays below "Next in this thread", with no visual weight beyond rows.
8. **Schema files are governance.** A new `media_map.schema.json` is under `*.schema.json`, so it must ship in its **own governance PR** before or after the content PR. Never mix the two (`bin/check_governance_separation.py`).

---

## Data

### `media_map.json` (repo root, next to `pairings.json`)
Start from `media_map.draft.json`. It is **draft** until Dr. Moss approves the picks. Which media represents a week is a curricular judgement, as with `pairings.json`.

Shape:
```json
{
  "_note": "…",
  "status": "draft | approved",
  "weeks": [
    {
      "week": 2,
      "anchor": "t_mood.md",
      "pairing": null,
      "podcastCategory": "Mood & bipolar; suicide",
      "listen": [ { "episode": 25, "why": "…" } ],
      "family": [ { "isbn": "9781608822195", "why": "…" } ],
      "gap": "optional explanation when a side is empty"
    }
  ]
}
```
- `anchor`: a shipped page id.
- `listen`: 0–2 items. `family`: 0–2 items. An empty side is **omitted** in the UI, never padded.
- `why`: curator note. It is **not rendered** to learners.
- `status: "draft"` makes the build skip rendering entirely: the map is validated but invisible. Only `"approved"` renders.

### Build step (new, pure Python, no network)
In `13_Faculty_Resources/_automation/site_build/` add `media_index.py`, run by `build_and_check.sh` after the pairings injection. It:
1. **Parses the podcast library.**
   - `## <Category>  (N)` headings become categories.
   - Item lines are `- Episode <n>: <title> — [▶ YouTube](<url>)` or `[▶ search channel](…)`.
   - Output per episode: `{n, title, category, url, verified: bool}`.
2. **Parses the book library.**
   - `## <Category>` headings become categories.
   - Item lines are `- **[<title>](<url>)** — <author>. <description>  ISBN <13 digits>`.
   - Output: `{isbn, title, author, description, category, anchor}`, where `anchor` is the heading slug the Reader already generates for that category.
3. **Validates `media_map.json`.**
   - Every `anchor` exists in `site_manifest.json` for the site.
   - Every episode exists and is `verified`.
   - Every ISBN exists.
   - Limits: at most 2 per side; no duplicate picks within a week.
   - Any failure fails the build with a message naming the key.
4. **Emits `media_index.json`** into `_build/<site>/` with resolved items for approved anchors only, plus the four verbatim guidance strings read from `topic_meta.json`.
5. **Runs for both sites.** If an anchor page doesn't ship on a site, that entry is skipped silently.

Add `test_media_index.py` with fixtures (not the live library files) covering:
- parse of both line formats;
- rejection of a `search channel` pick;
- rejection of an unknown ISBN;
- draft = no render;
- missing anchor = skip.

---

## UI — "Beyond this page" (Reader, end of article)

**Placement:** after "Next in this thread", before the page footer. Render only when `media_index.json` has an entry for the current page.

**Structure:**
- **H2** "Beyond this page": Source Serif 4 700, 19px/1.3; `margin-top:36px; padding-top:20px; border-top:1px solid --fd-line-strong`.
- **Audience switch.** Show it only when both sides exist; otherwise show the one side without a switch.
  - Container: segmented control, `inline-grid 2 cols; padding:3px; radius 10; background --fd-chip; 1px --fd-line`.
  - Option: `min-height:44px` (the 36px in the mock is too small for touch; use 44), radius 8, 14px.
  - Selected: surface background, `box-shadow 0 1px 3px rgba(59,51,44,.12)`, `--fd-teal-deep` 700, `aria-pressed="true"`.
  - Labels: "For you · listen" | "For the family · read".
  - Default: "For you".
  - The choice is transient (not stored, not in the URL).
- **Items.** Up to 2 rows/cards in a `grid-template-columns: repeat(auto-fit, minmax(240px,1fr)); gap:14px` grid. Each card: `padding:14px; radius 10; --fd-surface; 1px --fd-line`.
  - Kicker 12px/700: "For you" in `--fd-teal-deep`, "For the family" in `--fd-text-mid`.
  - **Episode:** title 15px/600 "Episode N: Title"; meta 13px `--fd-text-dim` "Psychiatry & Psychotherapy Podcast · <category>"; link "YouTube ↗" (14px/700 teal-deep, `rel="noopener"`, `target="_blank"`, accessible name "Episode N on YouTube (opens in a new tab)").
  - **Book:** title 15px/600 + " · Author" (400, dim); description 13px/1.5 `--fd-text-mid` verbatim from the library; link "In the Book Library" → `?page=book_library.md#<category-anchor>` (internal). **No Amazon link is rendered here.**
- **Guidance (family side only)**, rendered from `media_index.json`, verbatim:
  - Offer line: `padding:12px 14px; border-left:3px solid --fd-teal; background --fd-callout; radius 0 8 8 0`; 14px/1.55. Prefix "**How to offer it:**" + `book_library.md.clinicalWorkflow.say`.
  - Safety line: `padding:8px 12px; background --fd-olive-wash; color --fd-olive-deep; radius 8`; 13px/1.5. Text: `book_library.md.clinicalWorkflow.safety`.
- **Guidance (learner side):** one 13px `--fd-text-mid` line, `podcast_library.md.clinicalWorkflow.safety`, under the cards.
- **Actions (family side):**
  - Ghost button "＋ Bring to family meeting" opens the existing capture dialog, prefilled with the book title and author only. It shows the capture's existing no-patient-details notice, and nothing is saved until the learner confirms.
  - Text link "Practice the offer in Family Systems →" → `?tool=family-systems.html` (from `book_library.md.relatedTools`).
- **Footer link:** "All <category> episodes" → `?page=podcast_library.md#<category-anchor>`, or "All <category> books" → `?page=book_library.md#<category-anchor>`.
- **Tag:** "Suggested, not required" as 12px `--fd-text-dim` text right-aligned to the H2. The podcast page uses "Suggested listening, not required" and the book page uses "suggested reading, not required"; this is the shared short form, so add it to the shell-copy allow-list.

**States:**
- **No entry for the page:** nothing renders. No empty state.
- **One side empty:** no switch; heading plus that side only.
- **Offline / external link fails:** the link opens normally; no in-app player and no embed (no iframe to YouTube).
- **Pending page:** if the page itself is pending review, the block still renders. Governance applies to the page, not the optional media.
- **Phone:** cards stack; the switch is full-width; all targets are 44px.
- **Dark:** use the same tokens. Do not use hard-coded hex colours.

**Accessibility:**
- The section is `<section aria-labelledby>`.
- The switch is two buttons with `aria-pressed`, and switching moves focus to the first card.
- External links announce "opens in a new tab".
- Visible focus is 3px `--fd-focus`.
- No motion beyond the existing 120ms colour transitions; none under reduced motion.

---

## Other surfaces (later, same index — optional)
| Surface | What | Rule |
|---|---|---|
| Library preview | "Beyond this page: 1 episode · 1 family book" line under "Practice with" | Counts only; opens the reading |
| Preparation chooser → "Family conversation" | Adds this week's family book + offer line | Session-only, like the chooser |
| Search | 4th group "Listen & read", below Safety, Pages, Tools | Titles from the index only |
| Path week detail | One "Listen this week" line from the week's anchor | Never in the week list or counts |
| Case Journeys week 4 | Family side of week 4 | Phase 3 only; tool HTML change → re-attestation |

---

## Rollout

### M1 — data and build (no UI)
**Files:** `media_map.json` (from draft, `status:"draft"`), `site_build/media_index.py`, `test_media_index.py`, `build_and_check.sh` hook.
**Separate governance PR:** `media_map.schema.json` and its registration in `validate_registry_schemas.py`, only if the validator lives under a governance path. Check `check_governance_separation.py`.

Acceptance:
- [ ] Both sites build. `media_index.json` is emitted and is empty while the map is a draft.
- [ ] Picking a `search channel` episode, an unknown ISBN, a non-shipped anchor, or more than 2 items per side fails the build with a named error.
- [ ] Library files and their `topic_meta` records are byte-identical (`git diff --stat` shows none). Zero new attestation drift.

### M2 — Reader block
**Files:** `fd_reader.js`, `frontdoor.css`, `spa_index.html` (capture prefill hook), `CLASS-INVENTORY.md`, tests (`fd-reader`, `shell-copy`, `front-door.spec`).

Acceptance:
- [ ] With a fixture map set to `approved`, the Mood page shows the block after "Next in this thread"; pages without an entry show nothing.
- [ ] One side empty means no switch. Switching is keyboard-operable and focus lands on the first card.
- [ ] Guidance strings render byte-identical to `topic_meta.json`, and the test reads them from data.
- [ ] No block appears above a crisis block; nothing new is persisted; nothing appears on Today or in progress counts.
- [ ] No horizontal overflow at 320px or 200% text; both themes meet contrast; axe has no serious or critical issues.
- [ ] Back from the Book Library anchor returns to the reading at the same scroll.

### M3 — approve picks, then the optional surfaces
- Dr. Moss reviews `media_map.json`. Setting `status:"approved"` is a content PR with no code.
- Add the table surfaces one at a time, each with its own small PR.

---

## Files
- `Media Integration.dc.html` — options A/B/C, the draft picks table, and the surfaces/mechanics notes. **B is the one to build.**
- `media_map.draft.json` — draft picks for the six weeks (+ Mood), the gaps, and the exclusions with reasons.
- `PROMPT_MEDIA.md` — kickoff prompt for Claude Code (M1 → M2).
