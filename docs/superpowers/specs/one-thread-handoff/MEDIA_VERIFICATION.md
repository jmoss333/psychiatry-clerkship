# "Beyond this page" — media verification record (2026-10-05, updated 2026-10-06)

Every podcast episode and book that `media_map.json` picks was checked before it was allowed into
the map. This records what was checked, against what, and what was withheld. It is a record for
curatorial review, not an attestation: the map ships as `status: "draft"` and renders nothing
until Dr. Moss approves it.

## Method

**Episodes** — three repo sources had to agree, plus the build's own rule:

1. `12_Media/psychiatry_psychotherapy_podcast_library.md` (attested `podcast_library.md`): the
   line `- Episode N: Title — [▶ YouTube](https://www.youtube.com/watch?v=ID)` exists.
2. `13_Faculty_Resources/Handoffs/youtube_channel_flat.jsonl` (the show's channel listing,
   channel "Psychiatry & Psychotherapy"): video `ID` exists and its title names the same episode.
3. The line's Apple Podcasts link (joined by feed episode id in 3473f69c, not by title): the
   number leading its slug equals `N`. `13_Faculty_Resources/Handoffs/podcasts_handoff.csv` maps
   `N` to the same title and the same video URL.
4. Build rule (`site_build/media_index.py`): `▶ YouTube` only; the video id is used by exactly one
   episode line (3473f69c recorded 234→239's and 247→231's video, so 231, 234, 239 and 247 are
   ineligible); the Apple slug number, when present, matches. Host for every episode: Dr. David
   Puder (library header; several channel titles carry "w/ Dr. David Puder").

**Books** — the book library line exists with title, author and a valid ISBN-13 check digit; the
ISBN-13 equals the ISBN-10 in its Amazon link converted (all 51 lines agree). The library has no
catalogue confirmation of edition (the `isbn-verify` queue task never recorded one), so each pick
had ONE targeted catalogue lookup (Scholar Sidekick `verifyCitation`: ISBN + title + first author →
Open Library), per the session brief.

## Episodes (12 picked, 12 verified; Ep 26 removed 2026-10-06)

| Ep | Library title | Channel title for that video | Apple # | Anchor |
|---|---|---|---|---|
| 1 | The Basics of the Psychiatric Interview | The Basics of the Psychiatric Interview Part 1 — Psychiatry and Psychotherapy Podcast | 001 | pg_interview.md |
| 28 | Therapeutic Alliance Part 1 | Therapeutic Alliance Part 1: Psychiatry and Psychotherapy Podcast w/ Dr. David Puder | 028 | pg_interview.md |
| 70 | Connecting with Psychotic Patients | Connecting with the Psychotic Patient, Therapeutic Alliance Part 7 | 070 | t_psychosis.md |
| 211 | Early Psychosis | Early Psychosis: Detection and Treatment | 211 | t_psychosis.md |
| 25 | The History and Nuances of Bipolar Illness | The History and Nuances of Bipolar Illness — Psychiatry and Psychotherapy Podcast w/ Dr. David Puder | 025 | t_mood.md |
| 201 | Psychotic Depression | Psychotic Depression with Dr. Cummings | 201 | t_mood.md |
| 41 | Transference and Countertransference | Transference & Countertransference | 041 | psychotherapy.md |
| 199 | Motivational Interviewing | Unlocking Change: The Power of Motivational Interviewing with Dr. William Miller | 199 | psychotherapy.md |
| 26 | Setting Boundaries in Relationships | Setting Boundaries in Relationships — Psychiatry and Psychotherapy Podcast w/ Dr. David Puder | 026 | **removed** (Dr. Moss, 2026-10-06) |
| 31 | Psychiatric Approach to Delirium | Psychiatric Approach to Delirium with Dr. Timothy Lee | 031 | delirium.md |
| 40 | Reducing Inpatient Violence | Inpatient Psychiatric Violence — Psychiatry & Psychotherapy Podcast w/ Dr. David Puder | 040 | delirium.md |
| 207 | 5 Domains of Psychiatric Care | 5 Factors and Domains of Psychiatric Care | 207 | case_formulation.md |
| 90 | How to Rock the USMLE Step 1 (retitled 2026-10-06; was "How to Rock the USMLE") | How to Rock the USMLE Step 1 (or Any Big Test) | 90 | shelf.md, **MS3 only** (moved from case_formulation.md, Dr. Moss, 2026-10-06) |

## Books (5 checked, 5 verified)

| ISBN | Title · author (library) | Catalogue result | Status |
|---|---|---|---|
| 9781608822195 | Loving Someone with Bipolar Disorder · Julie Fast & John Preston | Open Library: same title, Fast & Preston, New Harbinger 2012 (2nd ed.) | verified — t_mood.md |
| 9780143128724 | Reasons to Stay Alive · Matt Haig | Open Library: same title, Haig, Penguin 2016 | verified — t_mood.md (description revised 2026-10-06, below) |
| 9781684036899 | Stop Walking on Eggshells · Paul Mason & Randi Kreger | Open Library: same title, Mason & Kreger, New Harbinger 2020 | verified — psychotherapy.md |
| 9781476709475 | Beyond Addiction · Jeffrey Foote et al. | Open Library: same title, Foote (with Wilkens, Kosanke), Scribner 2014 | verified — exp_family.md |
| 9780985206703 | I Am Not Sick I Don't Need Help! · Xavier Amador | 20th Anniversary Edition, Vida Press, 2020 (2026-10-06, below) | verified — restored to t_psychosis.md and exp_family.md |

### 9780985206703 — confirmed 2026-10-06

Withheld on 2026-10-05 because the ISBN did not resolve in Open Library or Crossref (the title and
author did, via OpenAlex). Confirmed by Dr. Moss on 2026-10-06, and checked against the same
primary source:

- **Publisher's own sample** (LEAP Institute, `leapinstitute.org/wp-content/uploads/2020/07/20thAnniversarySample.pdf`).
  - The title page reads "20th Anniversary Edition", Xavier Amador, Ph.D., Vida Press, New York, 2020.
  - The copyright page prints ISBN-13 978-0-9852067-0-3.
  - Fetched once, 2026-10-06; bibliographic facts only are recorded here.
- **Library catalogue:** an independent match cited by Dr. Moss (Calderdale Libraries, BRN 563164).
- **The library record matches this edition:**
  - title as printed on the cover (no comma; the catalogue-in-publication line adds one);
  - author;
  - ISBN-13;
  - the Amazon link `dp/0985206705`, which is the ISBN-10 form of the same ISBN and so addresses the same edition.

  The 25th Anniversary edition's metadata is not used anywhere. The repo holds no cover image for any book, so there is no cover to reconcile.
- The `unverified` entry is removed and both draft picks are restored. The build still treats them as draft until approval.

### Reasons to Stay Alive — description, 2026-10-06

Per Dr. Moss, the book is optional lived-experience reading: one person's memoir of depression
and recovery that includes discussion of suicidal thoughts. It is not a practical family-support
manual, a treatment recommendation or a crisis resource.

The new description lives in the reviewed source (the book library line, so `book_library.md`
re-signs), not in the renderer. The family side's offer and safety lines are unchanged and
verbatim. The block promises no practical guidance: its kicker reads "For the family", and the
safety line says a book is not treatment or crisis care. So the book stays on the Mood page's
family side rather than moving to a separate memoir category.

## Curatorial decisions (Dr. Moss, 2026-10-06)

- **Ep 26:** removed from exp_family.md. It covers general relationship boundaries, which is not
  confidentiality teaching, and no reading page teaches personal boundaries, so the placement is
  omitted.
- **Ep 90:** removed from case_formulation.md (week 6, both sites). It now sits only on the
  optional Shelf Review Guide (`shelf.md`), scoped `"sites": ["ms3"]`, so residents never see it.
  - It carries its full title, "How to Rock the USMLE Step 1".
  - It is filed under "Clinician wellbeing & professional growth" (moved from "Anxiety, OCD &
    stress"), so the category printed beside it reads as exam and study skills, not clinical
    anxiety teaching.
  - Both are podcast-library edits, so `podcast_library.md` re-signs. The category move is its
    own commit and can be dropped on its own.
- **Reasons to Stay Alive:** kept, with the description above.
- **Still open:** `topic_meta.json` → `podcast_library.md.tldr` says "10 categories"; the library
  has 13 headings. Not changed.
