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

## Fix round 1/5 — generated heading id stability

- Base: `f832b75419e2d90a906593993aa0e0852a851db8`
- Implementation head: `635c734ac37815ece005e615d9af1093903dad54`
- RED: the focused suite had 3 failing cases: duplicate ids lacked group cardinality, removing a
  duplicate did not invalidate the group bookmarks, and long generated ids exceeded the 200
  character record limit.
- GREEN: `node --test tests/fd-reading-place.test.mjs` — 10 passed, including a save/resume
  round-trip for every generated id and uniqueness after truncation collisions. `git diff --check`
  — clean.
- Change: IDs now cap the slug at 140 characters before deterministic collision suffixes; exact
  duplicate labels include each occurrence and group count. The implementation plan example and
  contract now reflect this behavior.
