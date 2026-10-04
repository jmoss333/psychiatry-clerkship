# Kickoff prompt for Claude Code — Podcast & Book integration (M1 → M2)

Paste into Claude Code at the root of `jmoss333/psychiatry-clerkship`, with this folder copied to `docs/superpowers/specs/one-thread-handoff/`.

---

You are implementing "Beyond this page": optional podcast and book picks at the end of each reading. The spec is `docs/superpowers/specs/one-thread-handoff/README_MEDIA.md`, and the visual reference is option **B** in `Media Integration.dc.html` beside it.

Before writing code:
1. Read `CLAUDE.md` and `README.md` → "Non-negotiable repo rules" in that folder.
2. Read `pairings.json`, `validate_registry_schemas.py` and the pairings injection in `build_and_check.sh`. Mirror that pattern.
3. Confirm the Reader has a "Next in this thread" section. If it does not yet exist, place the new block at the end of the article and leave a TODO to move it after "Next in this thread" when that ships.

**M1 — data and build** (first PR, no UI):
- Copy `media_map.draft.json` to the repo root as `media_map.json`, keeping `"status": "draft"`.
- Add `site_build/media_index.py`:
  - parse `12_Media/psychiatry_psychotherapy_podcast_library.md` and `07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md`;
  - validate the map;
  - pull the four guidance strings from `topic_meta.json` (`book_library.md` / `podcast_library.md` → `clinicalWorkflow.say` / `.safety`);
  - emit `_build/<site>/media_index.json`. It must be empty while the map is a draft.
- Add `test_media_index.py`, using fixtures only.
- If you need a JSON schema, put it in a **separate governance PR**. `*.schema.json` is a governance path.

**M2 — Reader block** (second PR):
- `fd_reader.js` renders the "Beyond this page" section from `media_index.json` exactly as specified: audience switch, cards, verbatim guidance, "＋ Bring to family meeting" through the existing capture dialog, and internal Book Library links (no Amazon links).
- Style it in `frontdoor.css` with existing tokens only. Update `CLASS-INVENTORY.md` in the same PR.
- Test with a fixture map set to `approved`. Never flip the real map to approved; Dr. Moss does that.

**Hard constraints:**
- Do not edit either library file or their `topic_meta.json` records.
- Do not pick or link medication content.
- Only verified "▶ YouTube" episodes.
- No new persisted state, and nothing on Today or in progress counts.
- ES5 in frontdoor modules; audience-neutral shell copy.

**Done means:**
- Every M1 and M2 acceptance item in `README_MEDIA.md` passes.
- `node --test tests/*.test.mjs`, `bash bin/verify.sh`, `build_and_check.sh ms3`, then `res`.
- `check_attestation_hashes.py` shows zero new drift.
- Open **draft** PRs only. Do not merge, deploy, or change repository settings.
