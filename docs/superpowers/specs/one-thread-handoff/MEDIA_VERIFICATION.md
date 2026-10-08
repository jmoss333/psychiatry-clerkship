# "Beyond this page" — media verification record (2026-10-05)

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

## Episodes (13 picked, 13 verified)

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
| 26 | Setting Boundaries in Relationships | Setting Boundaries in Relationships — Psychiatry and Psychotherapy Podcast w/ Dr. David Puder | 026 | exp_family.md |
| 31 | Psychiatric Approach to Delirium | Psychiatric Approach to Delirium with Dr. Timothy Lee | 031 | delirium.md |
| 40 | Reducing Inpatient Violence | Inpatient Psychiatric Violence — Psychiatry & Psychotherapy Podcast w/ Dr. David Puder | 040 | delirium.md |
| 207 | 5 Domains of Psychiatric Care | 5 Factors and Domains of Psychiatric Care | 207 | case_formulation.md |
| 90 | How to Rock the USMLE | How to Rock the USMLE Step 1 (or Any Big Test) | 90 | case_formulation.md |

## Books (5 checked, 4 verified, 1 withheld)

| ISBN | Title · author (library) | Catalogue result | Status |
|---|---|---|---|
| 9781608822195 | Loving Someone with Bipolar Disorder · Julie Fast & John Preston | Open Library: same title, Fast & Preston, New Harbinger 2012 (2nd ed.) | verified — t_mood.md |
| 9780143128724 | Reasons to Stay Alive · Matt Haig | Open Library: same title, Haig, Penguin 2016 | verified — t_mood.md |
| 9781684036899 | Stop Walking on Eggshells · Paul Mason & Randi Kreger | Open Library: same title, Mason & Kreger, New Harbinger 2020 | verified — psychotherapy.md |
| 9781476709475 | Beyond Addiction · Jeffrey Foote et al. | Open Library: same title, Foote (with Wilkens, Kosanke), Scribner 2014 | verified — exp_family.md |
| 9780985206703 | I Am Not Sick I Don't Need Help! · Xavier Amador | ISBN did not resolve (Open Library, Crossref); OpenAlex title search found the book by Amador | **withheld** — was t_psychosis.md and exp_family.md |

The withheld book is real (title and author confirmed); what is unconfirmed is that this ISBN is
the edition the library names. It is listed under `unverified` in `media_map.json` and the build
cannot pick it until a curator restores it.

## For curatorial review (not defects in the data)

- **Ep 26** is about relationship boundaries in general (guest episode); the draft's note pairs it
  with confidentiality framing in family meetings.
- **Ep 90** is USMLE Step 1 exam preparation; it is mapped to week 6 on both sites, including the
  resident site.
- **Reasons to Stay Alive** is a memoir of a suicidal crisis and recovery; the draft keeps
  suicide-specific *episodes* out of automatic pairing, and this pick sits on the family side of
  the Mood page.
- `topic_meta.json` → `podcast_library.md.tldr` says "10 categories"; the library has 13 headings.
  Not changed here (the record is attested and must stay byte-identical).
