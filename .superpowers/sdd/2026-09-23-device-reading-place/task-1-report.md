# Task 1 report — pure reading-place records

- Base: `ffed01bfb1b0365f3241568d4b2e0bb31baab5d2`
- Implementation head: `24530e36e338b13547365248d86bfc8a96a44dc2`
- Commit: `feat: define device reading-place records`
- Tests: `node --test tests/fd-reading-place.test.mjs` — 8 passed; `git diff --check` — clean.

## RED / GREEN

- RED: after adding the test harness and an empty module, all 8 behavior tests failed with
  `ReferenceError: fdReadingPlaces is not defined`.
- GREEN: after implementing the five APIs, all 8 tests passed. Coverage includes inherited and
  prototype-like keys, malformed refs/headings/timestamps, non-finite offsets, offset clamping,
  clone-only updates and drops, 50-record eviction, timestamp ties, slug collisions, and stale ids.

## Files

- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reading_place.js` — ES5 pure helpers
  for validating/sanitizing records, bounded clone updates/removal, deterministic ids, and resume.
- `tests/fd-reading-place.test.mjs` — behavior tests evaluating the real module functions.

## Risks and boundaries

- Ref validation is syntax-based for relative `.md` page refs; this pure module does not load the
  shipped-page registry, so canonical membership remains a caller responsibility.
- Tied LRU timestamps evict the lexically earliest ref to make eviction independent of insertion
  order. Offset values are clamped to 0–100000 and may remain fractional.
- Layman summary: the module accepts only well-formed reading bookmarks, keeps at most 50, and
  gives repeated headings stable unique labels so a later reader can tell whether a saved spot
  still exists.

## Next options

- Best next option: Task 2 should add `readingPlaces` to the existing state allowlist, sanitize at
  save time, and prove that storage errors return failure.
- Brainstormed idea: a later browser fixture could rename one of two duplicate headings between
  visits and verify that the old bookmark is discarded without affecting other page bookmarks.
