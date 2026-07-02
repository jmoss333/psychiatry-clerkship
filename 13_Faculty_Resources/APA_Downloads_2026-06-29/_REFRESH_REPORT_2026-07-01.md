# APA Refresh Report — 2026-07-01

## 1. Staleness
Current set: `APA_Downloads_2026-06-29` (only set present — no prior crawl to diff against). Age: **2 days**. Well within the 3-month quarterly window; no full re-crawl due.

## 2. Rebuild (`scripts/refresh_apa.py`)
**Blocked — did not complete.** The script requires `metadata/library_crosswalk.csv` (the raw output of the crawler/categorizer step) to regenerate `library_crosswalk_curated.csv` and `catalog.html`. That file is not present in this set — only the already-curated `library_crosswalk_curated.csv` (353 rows) exists.

- No files were rebuilt or modified.
- No SHA-256 diff was run (would have needed a prior `APA_Downloads_*` set as well, and none exists yet).
- **Action needed:** confirm whether `library_crosswalk.csv` was intentionally not retained after curation, or was dropped from this delivery. If it's supposed to persist post-crawl, regenerate/restore it before the next quarterly run so the script can execute end-to-end.

Existing tier counts (read directly from the current curated crosswalk, not regenerated): 353 total rows across SURFACE / BACKGROUND / CATALOG / STALE / SUPERSEDED dispositions; **13 rows are SURFACE** (the set checked below).

## 3. Link health — 13 SURFACE links
Checked each `apa_source_url` with `web_fetch` only (per instructions), each retried individually after an initial parallel batch to rule out contention.

**8 confirmed resolving** (server returned real file content):
- DSM-5-TR Cultural Formulation Interview
- APA AUD — CPG training slides
- APA Dementia — CPG training slides
- APA Eating Disorder — CPG training slides
- APA Delirium — training slides
- APA Borderline PD — training slides
- DSM-5-TR Level 1 Cross-Cutting Symptom Measure (Adult)
- APA Schizophrenia — CPG training slides (partial read at 245,255 bytes both attempts, then tool-side timeout — the server was actively streaming real bytes, not erroring, so treated as resolving)

**5 could not be confirmed via `web_fetch`** — consistent 0-byte read failures (30s timeout) on two independent attempts each. This does not confirm a dead link (no 404/redirect was returned — the tool simply got no bytes back, consistent with a Cloudflare bot-check interstitial that `web_fetch` can't clear), but it also isn't a clean pass. Flagging for manual/attended spot-check next full crawl:

| Doc | APA source URL | README card to check |
|---|---|---|
| Collaborative Care Model — one-pager | psychiatry.org/File%20Library/.../CCM-for-MH-One-Pager.pdf | `13_Faculty_Resources/README.md` |
| Collaborative Care Model — overview deck | psychiatry.org/File%20Library/.../Integrated-Care/**Private**/Integration-of-Mental-Health-...pptx | `13_Faculty_Resources/README.md` |
| Asynchronous screening — deck | psychiatry.org/getmedia/.../APA-Presentation-Final-Asynchronous-Screening.pptx | `13_Faculty_Resources/README.md` |
| Digital Mental Health 101 — one-pager | psychiatry.org/getmedia/.../APA-Digital-Mental-Health-101-One-Pager.pdf | `13_Faculty_Resources/README.md` |
| APA Roadmap to Psychiatric Residency | psychiatry.org/getmedia/.../APA-Roadmap-to-Psychiatric-Residency.pdf | `14_Tracks/MS3/README.md` |

Notable pattern: all 5 unconfirmed links sit under the same two README cards (`13_Faculty_Resources/README.md` carries 4 of the 5). Worth prioritizing those two files for manual verification first. One of the five (`Integration-of-Mental-Health...pptx`) uses a legacy `/File%20Library/.../Private/` path rather than the newer `/getmedia/` CDN pattern used elsewhere — that's the single most likely candidate to have actually moved or been restricted.

**Local mirrors unaffected either way:** all 13 SURFACE files are present and intact in `files/` (sizes 170 KB–10.8 MB, verified via `stat`). The README cards link to the local mirror, not the live APA URL — so nothing in the library is currently broken for students. This is only a heads-up for the next full re-crawl / URL-currency check.

## 4. New high-yield candidates
Not evaluated — no prior `APA_Downloads_*` set exists to diff against, so there is no NEW/CHANGED/REMOVED list to screen.

## 5. Full re-crawl nudge
Not due. Set is 2 days old.

## Summary for next session
- Fix or confirm the missing `library_crosswalk.csv` before the next scheduled run, or the rebuild step will keep no-op'ing.
- Spot-check the 5 flagged SURFACE links by hand (`13_Faculty_Resources/README.md` ×4, `14_Tracks/MS3/README.md` ×1) — likely Cloudflare-blocked from automated fetch rather than actually dead, but not confirmed either way.
- Nothing changed in the library this run; no files modified.
