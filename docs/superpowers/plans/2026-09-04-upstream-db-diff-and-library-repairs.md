# Upstream DB Diff + Library Repairs — results

**Date:** 2026-09-04 · **Answers:** the 2026-09-03 Cowork handoff §5.1, §5.2 (partial) and §5.4
**Status:** findings and machine-readable artifacts. **Nothing learner-facing changed by this document.**

---

## 0. Three corrections to the 2026-09-03 gap scan, all reproducible

The gap scan asked to be checked rather than quoted. Checking it found three errors. None is fatal
to its conclusions; two change what the next session should do.

### 0.1 `audio_oe` is deployed but **unlinked** — and `landmark_trials.md` does not publish it

The gap scan's headline correction said the acute spine "is not an audio desert: `12_Media/audio_oe/`
ships 50 landmark briefs … published by `landmark_trials.md`." **The second half is wrong.**

There are **two distinct 50-file audio sets** in this repo:

| Set | Path | Published by | Reachable by a learner |
|---|---|---|---|
| **LM-\*** | `07_Evidence_and_Reading/Landmark_Trials/audio/` | `landmark_trials_page.md`, as inline `<audio>` | **yes** |
| **OE-\*** | `12_Media/audio_oe/` | nothing | **no** |

`LM_crosswalk.csv` maps between them (each LM row carries an `oe_id`), so they are related
recordings, not duplicates of one file.

Measured, not inferred:

```bash
grep -rl "audio_oe" _build/ms3/content/ | wc -l      # 0 content pages
curl -sI https://une-ms3-psychiatry.netlify.app/audio_oe/OE-38_The_HELP_Trial_…m4a
#   200, audio/mp4, 3,450,376 bytes — same on mmc-psychiatry-residents-sanford
```

So **50 OE briefs (~170 MB of Git-LFS media) build, deploy and serve 200 on both production sites,
and not one content page links to any of them.** Only `tools/review.html` references the directory.
That is gap G1b, and it is more concrete than the scan stated: the audio is not merely unjoined, it
is *paid for and shipped* and reachable only by typing the URL.

### 0.2 There are **6** unresolved podcast links, not 7

`grep -c "search channel"` returns 7, but **line 3 is the prose sentence explaining the marker**.
Cross-check: 245 `^- Episode` lines, 239 contain `watch?v=`, 6 do not. The six are listed in
`tmp/unresolved_podcast_links.csv` (lines 63, 139, 140, 170, 239, 263).

### 0.3 The upstream pools are smaller than reported, and are a **different library**

The gap scan cited "481 podcast records across ~51 shows" and "345 book titles." Measured against
what is actually on disk in `~/ReConnect-Practice/Database/Archive-04/` (master workbook + three
CSVs, de-duplicated by normalized title/show):

| | Gap scan said | Actually on disk |
|---|---:|---:|
| Distinct book titles | 345 | **196** |
| Distinct podcast shows | ~51 | **53** |

---

## 1. §5.1 — the diff, and why it does not cut the discovery work

**Acceptance:** *a list of slate items that already exist upstream, and the genuinely new remainder.*

### Podcasts — 0 of 14 slate shows exist upstream

Not one. The upstream pool is **patient- and family-facing psychoeducation** — its largest shows
after Puder are *Mental Health Happy Hour* (24), *Huberman Lab* (17), *Ten Percent Happier* (13),
*Therapy for Black Girls* (12). No Psychiatry Boot Camp, no PsychEd, no Carlat, no Curbsiders, no
EM Cases, no GeriPal, no *Lost Patients*.

### Books — 5 of 30 slate titles exist upstream, and 3 of those already ship

| Slate title | Upstream? | Already on the shipped 51-title shelf? |
|---|---|---|
| The Body Keeps the Score | yes | **yes** |
| The Center Cannot Hold | yes | **yes** |
| An Unquiet Mind | yes | **yes** |
| **Good Moms Have Scary Thoughts** | **yes** | **no — curated upstream, never shipped** |
| **This Isn't What I Expected** | **yes** | **no — curated upstream, never shipped** |
| the other 25 (Shea, MGH C-L, Maudsley, Stahl, First Aid, MI 4th ed., 36-Hour Day, Committed, …) | **no** | no |

**Conclusion, and it is the opposite of what §5.1 predicted.** The handoff expected the diff to
"cut the discovery work substantially." It does not, because the two libraries do not overlap:
the upstream pool is a *patient/family* shelf and the slate's centre of gravity (G2, the trainee
clinical bookshelf) is a *clinician* shelf. **Every trainee-facing candidate in §3C/3D is genuinely
new and the discovery work stands.**

### But the diff pays off somewhere else: 163 curated-and-unshipped family titles

33 of the 196 upstream titles are already on the shipped shelf. **163 are not** — and they cover
four of the five diagnostic holes G8 names, at a depth the slate's two-or-three candidates do not:

| G8 hole | Slate proposed | Already curated upstream, unshipped |
|---|---:|---:|
| OCD / intrusive thoughts | 1 | **11** |
| Perinatal | 2 | **9** |
| Sleep / insomnia | 0 | **7** |
| Eating disorders | 1 | **3** |
| **Dementia caregiving** | 1 (*The 36-Hour Day*) | **0** — one weak adjacent title only |

**So G8 is mostly a surfacing problem, not a discovery problem** — and it needs no link check,
because these are already-curated records. Dementia caregiving is the exception: *The 36-Hour Day*
stays a genuinely new recommendation, which raises rather than lowers confidence in it.

---

## 2. §5.4 — both structural repairs, unblocked and delivered as data

### 2.1 ISBN-13 backfill — `tmp/isbn_backfill.csv` (51 rows)

The intended route was an ISBN lookup service; **egress to `openlibrary.org` proved intermittent**
(reachable at one point in this session, refused at another), and Google Books is still 429 on the
shared proxy quota. A better route existed and needs no lookup at all:

**All 51 Amazon `/dp/` tokens on the shelf are already ISBN-10s** — every one passes the mod-11 check
digit. ISBN-10 → ISBN-13 is deterministic arithmetic, not a guess. Each derived ISBN-13 was then
**independently confirmed against K10plus SRU (MARCXML), with Libris as fallback**, comparing
normalized title *and* author.

| Confidence | n | Meaning |
|---|---:|---|
| `exact` | 48 | catalog record matches title and author |
| `probable` | 1 | *I Hate You* — shelf uses a truncated title; both authors match |
| `not_found` | 2 | ISBN is checksum-valid but **no catalog confirms the title↔ISBN binding** |

All 51 match `^97[89][0-9]{10}$`, all EAN-13 check digits validate, no duplicates.
The two `not_found` rows are deliberately **not** presented as verified:

- *Addict in the Family* (Conyers) — K10plus holds the title under a **different** ISBN.
- *I Am Not Sick, I Don't Need Help!* (Amador) — publisher is the author's own imprint; held by no
  catalog checked (K10plus, HathiTrust, archive.org, loc.gov).

### 2.2 RSS / Apple canonicals — `tmp/podcast_canonicals.csv`

The iTunes Search API answers and returns a real feed. The page references exactly **one** show:

- **Psychiatry & Psychotherapy Podcast** · David Puder, MD · Apple id `1335892956`
- RSS: `https://rss.libsyn.com/shows/204575/destinations/1465178.xml` — **verified live**: 200, feed
  title matches, **280 `<item>` entries** (matches Apple's `trackCount`).

**The canonical feed carries a title-matching episode for all six dead-end links.** That makes RSS a
working replacement route for every one of them — but the feed carries **no episode numbers**, so
those are title matches, not proven number bindings, and a human should confirm each before it is
written into a shipped page.

### 2.3 A defect found in passing

`12_Media/psychiatry_psychotherapy_podcast_library.md` lines 64 and 65 — **Episode 234
(*Transference Focused Psychotherapy*) and Episode 239 (*TFP & Personality Disorders with Dr. Otto
Kernberg*) point at the same YouTube video** (`watch?v=uyPquOVhO-c`). They are different episodes.
One link is wrong; which one needs a human ear, not a script.

---

## 3. Environment note for the next session

The handoff's §4 egress table does **not** describe this environment, and the difference is not
stable enough to write down as a new table. Within one session: `openlibrary.org` returned real JSON
early and refused later; `podcasts.apple.com` and `itunes.apple.com` answered throughout;
`api.github.com`, `pubmed.ncbi.nlm.nih.gov` and `global.oup.com` answered; `amazon.com` returns 503
(bot-block, not egress); `appi.org` returns 403; Google Books remains 429.

**Practical rule: probe the specific host you need, at the moment you need it, and prefer a route
that does not need the network at all** — the ISBN-10 arithmetic above is the worked example.

Also, contra the handoff §4: **the delegated-subagent path works here.** One `Agent` call completed
a 38-tool-call job successfully. The `StructuredOutput retry cap` failure did not recur.

---

## 4. What is still open

| Item | State |
|---|---|
| §5.2 link check of the external slate | **still open.** Publisher hosts are mixed (`appi.org` 403); nothing in §3 of the gap scan has been opened. |
| The 6 unresolved podcast links | route identified (RSS), **episode-number binding unconfirmed** |
| Ep 234/239 duplicate link | needs a human decision |
| Applying the ISBNs to the shelf page | **not done** — the CSV is the deliverable; editing 51 shipped entries is its own reviewed change |
| Surfacing the 163 unshipped family titles | **not done** — a curation decision for Dr. Moss, not an agent |

*Joshua Moss, MD | Psychiatry Clerkship Library. Educational; no PHI; no instrument text;
no crisis contacts outside `crisis_resources.json`.*
