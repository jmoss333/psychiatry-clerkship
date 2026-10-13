# APA Refresh Report — 2026-10-01

Scheduled quarterly run (`apa-quarterly-refresh`). Read-only except this file. No library files modified.

## 1. Staleness
Current set: `APA_Downloads_2026-06-29` — still the **only** `APA_Downloads_*` set present. Age: **3 months, 2 days** (94 days). At the quarterly boundary; see §5.

## 2. Rebuild (`scripts/refresh_apa.py`)
**Blocked — same cause as 2026-07-01.** Script exits at its first guard:

```
library_crosswalk.csv missing — re-run the categorizer after a fresh crawl
```

`metadata/` contains only the already-curated `library_crosswalk_curated.csv`; the raw `library_crosswalk.csv` (columns the script needs: `decision`, `category_codex`, `target_section`, `clean_title`) was never retained. `categorized_manifest.csv` is not a substitute — it carries crawler columns (`category, source_page, …, sha256`), not the curation decisions. Nothing was rebuilt; `catalog.html` / `catalog_data.json` / curated CSV are unchanged from 2026-06-29 (catalog.html mtime 2026-09-10 is from an unrelated edit).

Tier counts (read from the existing curated crosswalk, 353 rows):

| Tier | n |
|---|---|
| SURFACE | 13 |
| BACKGROUND | 7 |
| CATALOG | 260 |
| STALE | 5 |
| SUPERSEDED | 68 |

SHA-256 diff: **not run** — no prior set to diff against (NEW / CHANGED / REMOVED = n/a).

## 3. Link health — 13 SURFACE links
Each `apa_source_url` fetched with `web_fetch` only. **All 13 resolve: HTTP 200 with the correct binary `Content-Type`** (`application/pdf` or `…presentationml.presentation`), 160 KB–950 KB of real payload each, no redirect, no Cloudflare interstitial.

This clears the 5 links flagged "unconfirmed" on 2026-07-01 (CCM one-pager, CoCM overview deck, Asynchronous Screening deck, Digital MH 101 one-pager, Roadmap to Residency) — including the legacy `/File%20Library/…/Private/…` CoCM deck path, which still serves. That batch was a transient fetch-side timeout, not link rot.

**Dead / moved SURFACE links: none. No README card needs fixing.**

Cards verified present (`APA-SURFACE-CARD` marker, main tree): `02_Clinical_Skills/Interviewing`, `02_Clinical_Skills/Screeners`, `03_Core_Topics/{Geriatric, Nutrition, Personality, Psychosis, SUD_Withdrawal}`, `04_Acute_and_Safety/Delirium`, `13_Faculty_Resources`, `14_Tracks/MS3` — 10 READMEs, matching the 13 SURFACE rows (13_Faculty_Resources carries 4, MS3 carries 1).

## 4. New high-yield candidates
Not evaluable — no diff (single set). Deferred to the first run after a fresh crawl.

## 5. Full re-crawl nudge — **DUE**
Set is >3 months old and no newer crawl exists. Re-run `download_public_apa_resources.py` **attended, in Chrome** (Cloudflare verification). Two things to do in the same session so the next scheduled run can complete end-to-end:

1. **Retain `metadata/library_crosswalk.csv`** in the new dated folder after the categorizer step — this is what `refresh_apa.py` consumes. Without it the rebuild and tier re-curation will no-op for a third consecutive quarter.
2. Keep `APA_Downloads_2026-06-29/` in place (don't rename or delete) so the script can compute the first NEW / CHANGED / REMOVED diff against it.

## Summary
- Set age: 3 mo 2 d; only one set exists.
- Rebuild: blocked (missing raw crosswalk) — tiers reported from existing curated CSV: 13 / 7 / 260 / 5 / 68.
- Diff: n/a (no prior set).
- SURFACE link health: **13/13 OK**; prior quarter's 5 flags cleared; zero README fixes needed.
- New SURFACE candidates: none evaluable.
- **Full re-crawl: due now** — and retain `library_crosswalk.csv` this time.
