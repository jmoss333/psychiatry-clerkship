# Library Gap Scan — Podcasts, Books, Audiobooks

**Date:** 2026-09-03
**Branch:** `claude/library-gaps-podcasts-books-2t7p96`
**Status:** **Proposal for faculty review. Nothing shipped.** No content page, `site_manifest.json`
entry, or nav item was touched. This document is the evidence and the slate; the decision about
what ships is Dr. Moss's.
**Scope:** the two media pages the library ships —
`12_Media/psychiatry_psychotherapy_podcast_library.md` and
`07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md`.

---

## 0. Method and verification status — read this before trusting a link

Two halves of this scan have very different evidential strength. Do not treat them alike.

### 0.1 The repo half is measured, and reproducible

Every number in §1 and §2 comes from parsing the two shipped pages, not from recollection. The
coverage cross-check in §2.1 is a title-level keyword scan over both files; regenerate it with the
script in §8.

**Its one real limitation:** the podcast page lists episode *titles only* — no descriptions, no
tags — so the scan measures **findability**, not coverage. A topic reads as "absent" when no
episode title contains its words, even if an episode covers it. The clearest example: *Agitation /
restraint* scores 0 because no title uses those words, yet Puder Ep 37 ("How to Treat Violent
Patients") and Ep 40 ("Reducing Inpatient Violence") plainly bear on it — which is why *Violence
risk* scores 6. Read "absent" as **"a student searching this page for that word finds nothing,"**
which is itself the problem worth fixing.

### 0.2 The web half is search-attested only — nothing here was opened

This environment's egress policy blocks all outbound HTTP except the search API. `WebFetch` and
`curl` both fail (`EGRESS_BLOCKED` / `CONNECT tunnel failed, 403`) for every candidate domain
tried — Apple Podcasts, Spotify, publisher sites, Wikipedia, OpenLibrary.

**Consequence, stated plainly: I did not open a single page below.** Every URL, ISBN, edition year,
narrator and runtime is what web search returned, corroborated across queries where possible. That
is decent evidence a resource exists and weak evidence about its current details. Editions change,
shows end, URLs rot.

**Therefore: every external link and ISBN in §3 is `[unverified-link]` and must be click-checked
before it ships.** §6 makes that a gating step, not a nicety. This matters more here than in most
repos: `CLAUDE.md` requires a paper's own words before the library asserts what it found, and the
same instinct should govern what the library tells a student to go buy or listen to.

### 0.3 How this was produced

The delegated-workflow path failed at the harness level and produced nothing usable: 10 of 12
agents died on `StructuredOutput retry cap (5) exceeded`, and the two survivors reported that every
tool call from inside a subagent was rejected (`permission handler returned updatedInput ...
required parameter missing`), so no subagent could reach search or read a file. The scan was
redone in the main loop, where tools work. Recorded here because the failure will recur for the
next agent that tries to fan this out.

---

## 1. What the library ships today

| | Shipped | Sections | Link shape | Drawn from |
|---|---|---|---|---|
| **Podcasts** — `12_Media/psychiatry_psychotherapy_podcast_library.md` | **245 episodes, 1 show** (Puder, *Psychiatry & Psychotherapy*) | 13 | YouTube video links; **7 unresolved** "▶ search channel" fallbacks | ReConnect podcast DB — **481 records across ~51 shows** |
| **Books** — `07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md` | **51 titles** | 14 | **51 of 51 Amazon `/dp/`; zero non-Amazon**; no ISBNs | psychoeducation book DB — **345 titles** |
| **Audiobooks** | **0** — nothing in the repo is identified as audio | — | — | — |

Two facts are worth sitting with.

**One show is the library's entire audio voice.** 245 episodes, one host, one theoretical centre of
gravity (psychodynamic/psychotherapy-weighted). The show is good; that is not the issue. A single
editorial source for an entire modality is a governance exposure independent of quality — if it
stops publishing, changes stance, or paywalls, the library's audio surface degrades with no
fallback.

**The source pools were 6-10× larger than what shipped.** 481 podcast records became one show's
245 episodes; 345 book titles became 51. Some of the gap below is not "resource does not exist" but
"existing curation was never surfaced." The upstream DB is not in this repo, so I could not diff
against it — see §5.

---

## 2. The gap map

### 2.1 Coverage cross-check — clerkship topic vs. both pages

Counts are keyword hits in each page (title-level; see §0.1).

| Clerkship topic | Podcast | Books | Status |
|---|---:|---:|---|
| Agitation / restraint | 0 | 0 | **ABSENT FROM BOTH** |
| Medical workup / mimics | 0 | 0 | **ABSENT FROM BOTH** |
| Consult-liaison | 0 | 0 | **ABSENT FROM BOTH** |
| Documentation / oral presentation | 0 | 0 | **ABSENT FROM BOTH** |
| Case formulation | 0 | 0 | **ABSENT FROM BOTH** |
| Discharge / disposition | 0 | 0 | **ABSENT FROM BOTH** |
| Delirium | 1 | 0 | no book |
| Catatonia | 2 | 0 | no book |
| Toxidromes / withdrawal | 1 | 0 | no book |
| Decisional capacity | 1 | 0 | no book |
| ECT / neuromodulation | 1 | 0 | no book |
| Clozapine | 2 | 0 | no book |
| Lithium | 3 | 0 | no book |
| Metabolic / med monitoring | 2 | 0 | no book |
| Suicide / self-harm | 6 | 0 | no book |
| Differential diagnosis | 1 | 0 | no book |
| Motivational interviewing | 1 | 0 | no book |
| Shelf / COMAT exam | 1 | 0 | no book |
| Geriatric / dementia | 3 | 0 | no book |
| Perinatal | 3 | 0 | no book |
| Eating disorders | 3 | 0 | no book |
| Sleep | 4 | 0 | no book |
| Ethics / med-legal | 1 | 0 | no book |
| Violence risk | 6 | 1 | covered |
| Involuntary commitment | 4 | 2 | covered |

**6 topics absent from both pages. 17 topics with zero book coverage.**

The acute inpatient spine — the thing a six-week adult inpatient rotation actually *is* — scores
0-3 across the board. Delirium is one mention. Catatonia is two. The rotation's own
`04_Acute_and_Safety/` tree ships pages on agitation, catatonia, delirium, toxidromes, capacity and
violence; the media library backs almost none of it.

### 2.2 The gaps, named and tiered

| # | Gap | Severity | Who is unserved |
|---|---|---|---|
| **G1** | **Acute inpatient spine has no audio and no books** — delirium, catatonia, agitation, withdrawal, capacity, ECT, clozapine/lithium monitoring, medical workup, C-L | **critical** | every learner, all six weeks |
| **G2** | **No trainee clinical bookshelf exists at all** — nothing on the interview, MSE, formulation, prescribing, emergency or C-L psychiatry | **critical** | MS3, Sub-I, PGY1/2 |
| **G3** | **Single-show dependence** — 245 eps, one host, one stance; no editorial counterweight | **high** | governance, not just coverage |
| **G4** | **No exam-prep resource** despite `09_Exam_Prep/` shipping Shelf_High_Yield, shelf_comat_bank, OSCE_Stations, anki_export | **high** | MS3 sitting the shelf/COMAT |
| **G5** | **No psychotherapy training texts** despite Therapy_Reading_Room, Brief_Psychotherapy, `therapy_on_the_unit.md`, `motivational_interviewing.md` all shipping | **high** | anyone asked to do therapy on the unit |
| **G6** | **No audiobook layer, and no field to hold one** | **high** | commuting learners; a 6-week rotation is mostly windshield time |
| **G7** | **Single-vendor book links** — 51/51 Amazon, no ISBN, no library path | **high** | accessibility, permanence, cost |
| **G8** | **Family shelf has large diagnostic holes** — no dementia caregiving, OCD, eating disorders, perinatal, sleep; nothing for children or siblings of a hospitalized patient | **high** | families on the unit |
| **G9** | **Audience mismatch** — both pages ship identically to MS3 and resident sites; `14_Tracks/` Nursing, SW, Resident_PGY2, CAP_Fellow get nothing addressed to them | **medium** | 4 of 8 tracks |
| **G10** | **No patient-voice audio** — memoirs in print, nothing in ear | **medium** | formation; empathy |
| **G11** | **No systems / history / med-legal frame** — deinstitutionalization, coercion, the shape of the system a patient is discharged into | **medium** | ethics_legal, systems_medlegal, discharge |
| **G12** | **7 unresolved podcast links** — "▶ search channel" fallbacks that dump the student on a search page | **low** (easy fix) | anyone clicking them |

---

## 3. Candidate slate

**All links `[unverified-link]` — see §0.2.** Tiering is mine and is a recommendation, not a
decision: **T1** = would put in front of every learner; **T2** = strong, section-dependent;
**T3** = optional/reference.

### 3A. Podcasts — the case for a second and third show

| Tier | Show | Who | Why it fills a gap the Puder page cannot | Access |
|---|---|---|---|---|
| **T1** | **Psychiatry Boot Camp** — [psychiatrybootcamp.com/episodes](https://www.psychiatrybootcamp.com/episodes/) · [Apple](https://podcasts.apple.com/us/podcast/psychiatry-boot-camp/id1671902940) | Dr. Mark Mullen | **The single best answer to G1.** Structured by season, and **Season 3 is entirely consultation-liaison** — the exact spine the library lacks. Named episodes include *3.6 Catatonia: Management* (Dr. Mark Oldham, President, American Delirium Society), *3.8 Suicide Risk Assessment*, *3.10 Decisional Capacity Determinations*, *3.11 Eating Disorders*, *3.14 Malingering and Factitious Disorder*, *3.1* with Dr. Allen Frances (DSM-IV Task Force chair). Season 1 covers *1.2 Clinical Interviewing* and *1.3 Mental Status Examination* — G2 and the `pg_interview.md` / MSE pages. | free |
| **T1** | **PsychEd: Educational Psychiatry Podcast** — [psychedpodcast.org/episodes](https://www.psychedpodcast.org/episodes) · [Apple](https://podcasts.apple.com/us/podcast/psyched-educational-psychiatry-podcast/id1215646896) | psychiatry residents, University of Toronto | Written *by* trainees *for* medical students and residents — the register the library has none of (G3, G9). Running since 2017, monthly. Ep 64 *Introduction to Consultation-Liaison Psychiatry*; Ep 66 *ADHD in Youth*; Ep 77 *ACT*. **Runs a book-club format** (*Mind Fixers*, Mar 2025; *Healing*, Oct 2025) — a natural bridge between the book page and the podcast page (see §7.3). | free |
| **T2** | **The Carlat Psychiatry Podcast** — [thecarlatreport.com/blogs/2-the-carlat-psychiatry-podcast](https://www.thecarlatreport.com/blogs/2-the-carlat-psychiatry-podcast) | Chris Aiken MD, Kellie Newsome PMHNP | Industry-free psychopharm in short episodes — fills the psychopharm strand (`psychopharm_primer.md`, `adv_psychopharm.md`, `med_monitoring.md`). The *Psychopharmacology 10 Commandments* series is free in full; *3 Ds of Geriatric Psychiatry* maps to delirium/dementia/depression. | free to listen; CME is a paid subscription |
| **T2** | **PsychRounds: The Psychiatry Podcast** — [Apple](https://podcasts.apple.com/us/podcast/psychrounds-the-psychiatry-podcast/id1719888462) | Drs. Tanner Hewitt, Larry Wang, Bradley Miller (residents) | Short, resident-voiced, clinically actionable. Second trainee-voice option; guests have included Allen Frances and Robert Sapolsky. Newer show — **check it is still publishing before shipping.** | free |
| **T3** | **Psychiatry Unbound** — [psychiatryonline.org/psychiatry-unbound](https://psychiatryonline.org/psychiatry-unbound) | Laura Roberts MD, APA Books Editor-in-Chief | APA Publishing's books podcast — authors on their own scholarship. Pairs with a book shelf; more faculty/resident than MS3. | free |
| **T3** | **Psychopharmacology and Psychiatry Updates** — [Apple](https://podcasts.apple.com/us/podcast/psychopharmacology-and-psychiatry-updates/id1425185370) | — | Dedicated psychopharm strand. Verify currency. | free |

### 3B. Acute inpatient spine — episode-level, cross-specialty (G1)

The best audio on several of these lives outside psychiatry. Recommend as **named episodes**, not
whole shows.

| Tier | Episode | Maps to |
|---|---|---|
| **T1** | **The Curbsiders #375 — *Delirium in the Hospital*, Dr. Esther Oh** (Johns Hopkins; President, American Delirium Society), 9 Jan 2023 — [audioboom](https://audioboom.com/posts/8225246-375-delirium-in-the-hospital-featuring-dr-esther-oh) · free CME via VCU. Segments: hypoactive delirium · delirium vs encephalopathy vs dementia · assessment tools · prevention · antipsychotics · workup · management pitfalls. | `delirium.md` |
| **T1** | **EM Cases Ep 115 — *Emergency Management of the Agitated Patient*** (Reuben Strayer, Margaret Thompson) — [emergencymedicinecases.com/emergency-management-agitated-patient](https://emergencymedicinecases.com/emergency-management-agitated-patient/). Physical restraint as last resort and only as a bridge to adequate chemical sedation. | `agitation.md`, restraint |
| **T1** | **Psychiatry Boot Camp 3.6 — *Catatonia: Management*** (Mark Oldham) | `catatonia.md` — currently 2 mentions library-wide |
| **T1** | **Psychiatry Boot Camp 3.10 — *Decisional Capacity Determinations*** | `04_Acute_and_Safety/Decisional_Capacity/` |
| **T2** | **Curbsiders Addiction Medicine** — [thecurbsiders.com/addiction-medicine-podcast](https://thecurbsiders.com/addiction-medicine-podcast) (Yale IM faculty). Ep 2 *Ambulatory Alcohol Withdrawal*; Ep 16 *Distilling Inpatient Alcohol Withdrawal* (Shawn Cohen); Ep 1 *Methadone for OUD*; Curbsiders #212 *Sober Talk: Managing Inpatient Alcohol Withdrawal* (Joji Suzuki); #498 *Opioid Withdrawal* (Ashish Thakrar — methadone vs buprenorphine in hospital). | `t_sud.md`, `toxidromes.md`, withdrawal |
| **T2** | **Curbsiders #116 — *Geriatric Psychiatry*** (Dennis Popeo, NYU) — insomnia, agitation/irritability, psychosis and paranoia in dementia. | `t_geri.md`, `t_neurocog.md` |
| **T2** | **GeriPal — *Managing Behavioral Symptoms in Dementia*, Helen Kales** (the DICE approach) — [geripal.org/managing-behavioral-symptoms-in](https://geripal.org/managing-behavioral-symptoms-in/) | BPSD; non-pharm first |
| **T3** | **EMCrit 60 — *chemical takedown / violent patient sedation*** — [emcrit.org/emcrit/human-bondage-chemical-takedown](https://emcrit.org/emcrit/human-bondage-chemical-takedown/) | **Ship only with the §4 caveat.** Older, dose-forward, EM framing. |

### 3C. Trainee clinical bookshelf (G2) — this shelf does not currently exist

| Tier | Title | Author / publisher | Why |
|---|---|---|---|
| **T1** | ***Psychiatric Interviewing: The Art of Understanding*, 3rd ed.** (2017) — [Elsevier](https://shop.elsevier.com/books/psychiatric-interviewing/shea/978-1-4377-1698-6), ISBN 978-1-4377-1698-6 | Shawn Christopher Shea / Elsevier | The standard text for the skill the rotation opens with. Teaches the *reasoning* behind interview technique, including validated approaches to eliciting sensitive material. Directly serves `pg_interview.md`, MSE, `02_Clinical_Skills/Interviewing/`. Endorsement quoted widely: read it before your first night on call. |
| **T1** | ***Massachusetts General Hospital Handbook of General Hospital Psychiatry*, 8th ed.** — [Elsevier](https://www.us.elsevierhealth.com/massachusetts-general-hospital-handbook-of-general-hospital-psychiatry-9780443118951.html), ISBN 9780443118951 | Stern, Beach, Smith, Freudenreich, Vranceanu, Fava | The C-L reference — a topic **absent from both pages**. Covers delirium, catatonia, capacity, the medically ill psychiatric patient. Reference-desk, not cover-to-cover. Serves `exp_consult.md`, `cl_reference.md`, `medical_workup.md`. |
| **T1** | ***The Maudsley Prescribing Guidelines in Psychiatry*, 15th ed.** (10 Jun 2025) — [Wiley](https://www.wiley.com/en-us/The+Maudsley+Prescribing+Guidelines+in+Psychiatry,+15th+Edition-p-9781394238767), ISBN 9781394238767 | Taylor, Barnes, Young / Wiley-Blackwell | The prescribing reference trainees actually reach for; strong on switching, adverse effects, special populations. **Note the house rule:** recommend it as a *reference the learner consults*, never as a source of dose literals for `rp-*` / `*-trainer` tools. |
| **T2** | ***Prescriber's Guide: Stahl's Essential Psychopharmacology*, 8th ed.** (Apr 2024, 980 pp) — [Cambridge](https://www.cambridge.org/9781009464758), ISBN 9781009464758 | Stephen M. Stahl / CUP | Alternative to Maudsley; drug-by-drug format. Pick one, not both. |
| **T2** | ***Clinical Manual of Emergency Psychiatry*, 2nd ed.** (2016) — [APA Publishing](https://www.appi.org/clinical_manual_of_emergency_psychiatry_second_edition) | Riba, Ravindranath, Winder / APPI | Each chapter pairs a trainee with a senior clinician — unusually well-pitched for a Sub-I. 2016, so **check currency** on anything pharmacological. |
| **T2** | ***Residents' Guide to Clinical Psychiatry*** — [APPI](https://www.appi.org/Products/Academic-Psychiatry/Residents-Guide-to-Clinical-Psychiatry) | APA Publishing | Assessment→treatment structure, tables and checklists; chapters on C-L, emergency psychiatry, ECT. Resident-site candidate. |
| **T3** | ***The Psychiatry Resident Handbook: How to Thrive in Training*** — [APPI](https://www.appi.org/Products/Academic-Psychiatry/Psychiatry-Resident-Handbook) | APA Publishing | Identity, skill-building, work-life — pairs with the repo's existing Reflection/PIF and wellbeing material. Resident site only. |
| **T3** | ***Pocket Guide to Psychiatric Practice*** — [APPI](https://www.appi.org/Products/Academic-Psychiatry/Pocket-Guide-to-Psychiatric-Practice) | APA Publishing | Rotation-pocket companion. |

### 3D. Exam prep and the psychotherapy shelf (G4, G5)

| Tier | Title | Note |
|---|---|---|
| **T1** | ***First Aid for the Psychiatry Clerkship*, 6th ed.** — Ganti, Kaufman, Blitzstein / McGraw Hill. [6th ed. listing](https://booksrun.com/9781264257843-first-aid-for-the-psychiatry-clerkship-sixth-edition), ISBN 9781264257843 | The default shelf book. **Confirm 6th is current** — a 5th ed. is still widely listed. |
| **T2** | ***Case Files: Psychiatry*** — Toy & Klamen / McGraw Hill. 6th ed. [ISBN 1260468739](https://www.amazon.com/Case-Files-Psychiatry-Sixth-Eugene/dp/1260468739); a 7th ed. was reported for Jun 2024 — **verify which is current before shipping.** | 60 vignette cases; complements the repo's own `reasoning_cases.json` and OSCE stations rather than duplicating them. |
| **T1** | ***Motivational Interviewing: Helping People Change and Grow*, 4th ed.** (21 Aug 2023) — [Guilford](https://www.guilford.com/books/Motivational-Interviewing/Miller-Rollnick/9781462552795), ISBN 9781462552795 | Miller & Rollnick. Fully rewritten 4th ed. The library ships `motivational_interviewing.md` and has **no MI text** — the most obvious single hole in G5. |
| **T2** | ***Learning Supportive Psychotherapy*, 2nd ed.** (2020, 232 pp) — [APPI](https://www.appi.org/Learning_Supportive_Psychotherapy_Second_Edition) | Winston, Rosenthal, Roberts. Supportive therapy is what an inpatient unit can actually staff — the right match for `therapy_on_the_unit.md` and `brief_psychotherapy.md`. |
| **T2** | ***The Gift of Therapy*** — Irvin Yalom | 85 short "tips to a new generation of therapists." Audiobook exists (§3F). Reads in fragments, which suits a rotation. |
| **T3** | **Deliberate Practice series** (APA Books), eds. Rousmaniere & Vaz — [sample](https://www.apa.org/pubs/books/3836671-sample-pages.pdf) | Serves `supervision_teaching.md`. Faculty/resident, not MS3. |

### 3E. Patient / family shelf — diagnostic holes in the existing 51 (G8)

The current shelf is strong on BPD, attachment, addiction, trauma, grief. These are the holes.

| Tier | Title | Fills |
|---|---|---|
| **T1** | ***The 36-Hour Day*, 8th ed.** (JHU Press, 16 Sep 2025), Mace & Rabins — [ISBN 978-1421452463](https://us.amazon.com/dp/1421452464) | **Dementia caregiving — zero coverage today** despite `t_neurocog.md` and `t_geri.md`. 4M copies sold; the standard family guide. |
| **T1** | ***Wishing Wellness: A Workbook for Children of Parents with Mental Illness*** — Lisa Anne Clarke / [Magination Press (APA)](https://www.apa.org/pubs/magination/441A313), ISBN 1591473136 | **Children (ages 6-12) of a psychiatrically hospitalized parent.** Explicitly written for children whose parent is in psychiatric hospitalization or day treatment. Nothing on the current shelf speaks to a child on a family-meeting day. Pairs with `exp_family.md` / `family_playbook.md`. |
| **T2** | ***Skills-based Caring for a Loved One with an Eating Disorder: The New Maudsley Method*** (Routledge, 2016) — Treasure, Smith, Crane — [Routledge](https://www.routledge.com/Skills-based-Caring-for-a-Loved-One-with-an-Eating-Disorder-The-New-Maudsley-Method/Treasure-Smith-Crane/p/book/9781138826632) | **Eating disorders — zero family coverage** despite `t_eating.md`. Carer-skills model, not a self-help book. |
| **T2** | ***When a Family Member Has OCD*** — Jon Hershfield / New Harbinger, [ISBN 1626252467](https://www.amazon.com/When-Family-Member-Has-Obsessive-Compulsive/dp/1626252467) | **OCD/anxiety family guidance — zero coverage** despite `t_anxiety.md`. Directly addresses the reassurance-seeking trap families fall into. |
| **T2** | ***Good Moms Have Scary Thoughts*** — Karen Kleiman, illus. Molly McIntyre (Familius, 2019) | **Perinatal — zero coverage** despite `t_perinatal.md`. Normalises intrusive thoughts; short and illustrated, so it actually gets read post-partum. |
| **T3** | ***This Isn't What I Expected*** — Kleiman & Raskin | Longer perinatal companion; audiobook exists. |

### 3F. Audiobook layer (G6) — nothing in the repo is flagged as audio today

Two moves: **(a) flag audiobook editions of titles already on the shelf**, and **(b) add
audio-native works**. Narrators/runtimes below are search-attested.

| Title | Already on shelf? | Audiobook | Caveat |
|---|---|---|---|
| *The Body Keeps the Score* | **yes** | Sean Pratt, **16h 15m** — [Libro.fm 9780593412701](https://libro.fm/audiobooks/9780593412701-the-body-keeps-the-score) | Long. Best as a "over the whole rotation" listen. |
| *The Center Cannot Hold* | **yes** | Alma Cuervo, **12h 10m** — [Libro.fm 9781428198760](https://libro.fm/audiobooks/9781428198760-the-center-cannot-hold) | Strong pairing with `t_psychosis.md`. |
| *An Unquiet Mind* | **yes** | **author-narrated, but ABRIDGED, 2h 46m** — [Libro.fm](https://libro.fm/audiobooks/9780307736345-an-unquiet-mind-abridged) | **Flag the abridgement.** Author narration is a real draw; a 2h46m abridgement of a memoir is a different object from the book on the shelf. Say so rather than letting a student assume equivalence. |
| *Hidden Valley Road* | no | Sean Pratt — [Audible](https://www.audible.com/pd/Hidden-Valley-Road-Audiobook/0593208323) | Kolker, 2020. Six of twelve siblings with schizophrenia; Oprah's Book Club, NYT #1. Genetics + family systems + the era's psychiatry, in one narrative. |
| *Waiting for an Echo* | no | [Audible](https://www.audible.com/pd/Waiting-for-an-Echo-Audiobook/0593211294) | Christine Montross, 2020. Psychiatry and incarceration — serves `ethics_legal.md` and `systems_medlegal.md`, which have no book at all. |
| *The Gift of Therapy* | no | Don Hagen, **7h 39m** — [Audible](https://www.audible.com/pd/The-Gift-of-Therapy-Audiobook/B009P50SAI) | Yalom. |
| *Mind Fixers* | no | Joyce Bean — [audio ed. 9781721339570](https://www.amazon.com/Mind-Fixers-Psychiatrys-Troubled-Biology/dp/1721339574) | Anne Harrington. **PsychEd ran a book club on this in Mar 2025** — book + podcast episode as a matched pair. |

**Audio-native, no print equivalent needed:**

| Tier | Work | Why |
|---|---|---|
| **T1** | ***Lost Patients*** — [Seattle Times / KUOW](https://www.seattletimes.com/seattle-news/mental-health/lost-patients-a-podcast-from-the-seattle-times-and-kuow/) · [Apple](https://podcasts.apple.com/us/podcast/lost-patients/id1733735613) | Six-part docuseries, Mar 2024, Peabody-nominated. Why patients with psychosis cycle between street, jail, ER and court. **Ep 4 covers deinstitutionalization** — the single best short answer to G11, and to "why is disposition so hard?" Bounded (6 eps) so it fits a rotation. |
| **T2** | ***Inside Schizophrenia*** — [psychcentral.com/blog/is](https://psychcentral.com/blog/is) | Co-hosted by Rachel Star Withers, who lives with schizophrenia. **The only patient-voice audio proposed** (G10). |
| **T3** | ***Committable*** — [committablethepodcast.podbean.com](https://committablethepodcast.podbean.com/) | Involuntary commitment told through people who were committed, in conversation with attorneys and clinicians. Pairs with *Committed* (below) as counterweight — patient voice against clinician voice on the same question. |

### 3G. Narrative, history and formation (G11) — books

| Tier | Title | Why |
|---|---|---|
| **T1** | ***Committed: The Battle over Involuntary Psychiatric Care*** — Dinah Miller & Annette Hanson, [Johns Hopkins UP](https://muse.jhu.edu/book/49292/) | Two psychiatrists on seclusion, restraint, involuntary medication and involuntary ECT, with first-hand accounts from patients, clinicians and opponents. The rotation asks students to participate in coercion in week 1; nothing on the shelf helps them think about it. |
| **T2** | ***Strangers to Ourselves*** — Rachel Aviv, [FSG/Macmillan](https://us.macmillan.com/books/9781250872913/strangerstoourselves/) | NYT 10 Best Books of 2022. Six lives, including the author's, on how diagnosis shapes the story a person tells about themselves. |
| **T2** | ***The Collected Schizophrenias*** — Esmé Weijun Wang, Graywolf | Graywolf Nonfiction Prize; Whiting Award. First-person, essayistic, unsentimental. |
| **T3** | ***Desperate Remedies*** — Andrew Scull, [Harvard/Belknap](https://www.hup.harvard.edu/file/feeds/PDF/9780674265103_sample.pdf), 2022 | Two centuries of US psychiatry, critical. |
| **T3** | ***Mind Fixers*** — Anne Harrington, Norton | Why the biological revolution stalled. Audiobook + PsychEd book club (§3F). |
| **T3** | ***The Spirit Catches You and You Fall Down*** — Anne Fadiman | Long-standing cultural-competence text in US medical curricula; serves `cultural_psychiatry.md`. Widely taught, so some students will have read it. |

---

## 4. Deliberate NOs — with reasons

| Not recommending | Why |
|---|---|
| **EM Cases Ep 3, *"Excited Delirium"*** | **The term has been repudiated.** The AMA opposed it in June 2021, citing its use to justify excessive force disproportionately in cases where Black men died in custody; the ACMT issued a position statement calling for its end; in April 2023 ACEP stated it does not recognise the entity, and in **October 2023 ACEP formally withdrew its own 2009 white paper**, saying the term should not be used by clinicians or by ACEP members testifying as expert witnesses. Preferred term: **"hyperactive delirium with agitation."** Shipping a 2010-era episode under the old name on a teaching site would be a liability. **Better use:** cite the retraction itself on `delirium.md` / `agitation.md` as a worked example of a diagnostic label collapsing under scrutiny — that is a *stronger* teaching point than the episode ever was. |
| **EMCrit 60** as a T1 | Dose-forward EM framing; the QA gate bans dose literals in `rp-*` / `*-trainer` tools, and the same instinct should apply to what audio the library front-loads. T3 with a caveat, or not at all. |
| **Any "pocket compendium of rating scales"** | These are superficially perfect trainee-shelf candidates and are exactly what the instrument-reproduction rule forbids. Per `CLAUDE.md`, scope here is a governance decision — an agent must not infer an exemption. Not proposed, and should not be added without Dr. Moss's explicit call. |
| **Anything whose value is a crisis-number list** | `crisis_resources.json` is the only home for those. |
| **Surviving Schizophrenia (Torrey)** | Frequently recommended and genuinely contested — its stance on involuntary treatment is a live argument, not settled ground. If it ships, it should ship *next to* `Committable` / `Committed`, framed as one position among several, not as the family guide. Flagging rather than silently omitting. |
| **Buying a second whole-show podcast page before the link check** | See §6 — the 7 existing broken links say the library already has a link-rot problem. Adding 200 more links before fixing the pipeline compounds it. |

---

## 5. Gaps I could not close — report these honestly

| Gap | Status |
|---|---|
| **Nursing audio (G9)** | Searched twice; found no psychiatric-mental-health nursing podcast of clear quality aimed at inpatient practice. `14_Tracks/Nursing` stays unserved. Not "none exists" — "none surfaced." Worth a targeted ask to nursing leadership rather than more searching. |
| **Social work audio (G9)** | Same. Closest hits (*Social Work HQ*, UPMC *Psychiatry Advances*) are adjacent, not inpatient-psychiatry-SW. Unserved. |
| **CAP fellow (G9)** | Not swept — out of scope for an adult inpatient rotation, but note it stays empty. |
| **ECT / clozapine dedicated audio** | Searched; returned journal literature, not podcasts. No good audio found for two topics the library teaches. Text-only for now. |
| **Diff against the upstream DB** | The ReConnect podcast DB (481 records, ~51 shows) and book DB (345 titles) are **not in this repo** — I could only see the 245 Puder episodes and 51 books in the handoff CSVs. **Some of the "missing" resources above may already be curated upstream and simply never surfaced.** Running that diff is cheaper than more discovery and should happen first — see §6 step 0. |
| **Every external link** | Unopened. §0.2. |

---

## 6. Rollout — proposed sequence

**Step 0 — before anything ships: diff against the upstream DB.** 481 podcast records across ~51
shows already exist upstream. Establish what is already curated there before adding anything new.
This may cut the discovery work substantially and will certainly change the slate.

**Step 1 — link check (gating).** Nothing in §3 ships until its URL has been opened and its edition
confirmed, from an environment with working egress. Fix the **7 existing** "▶ search channel"
fallbacks in the same pass. Deliverable: a CSV mirroring `Handoffs/podcasts_handoff.csv`, with a
`verified_date` column.

**Step 2 — ship the smallest high-value thing: an acute-spine listening list.** Not a new page —
a **section appended to the existing podcast page**, ~8 named episodes from §3B, each tagged to the
topic page it supports. Low surface area, no new `site_manifest.json` entry, no nav change, and it
closes the most severe gap (G1) first.

**Step 3 — faculty review of the trainee bookshelf (§3C/3D).** This is the largest single addition
and the one most in need of Dr. Moss's judgement about what an MS3 vs. a PGY2 should be told to
buy. Consider audience-scoping: MS3 site gets Shea + First Aid; resident site additionally gets
Maudsley, MGH C-L handbook, Residents' Guide.

**Step 4 — new page(s), if warranted.** Only after 1-3. A second podcast page ("Listening Library
— beyond one show") needs a `site_manifest.json` entry **and** a nav entry in `build_deploy.py`, or
the QA gate's orphaned-source check hard-fails the build. Add an audiobook column to the book page
rather than a separate audiobook page.

**Step 5 — attestation.** Both existing pages carry a review-status line; anything shipped should
carry the same, dated.

---

## 7. Three repairs that need no new content and should happen regardless

**7.1 Add `isbn13` to book entries.** 51 of 51 links are Amazon `/dp/`. An ISBN makes every entry
verifiable, library-findable (Libby/Hoopla, institutional holdings), price-independent and
accessible — and it is the precondition for any future automated link check. Today there is no way
to confirm which *edition* the library means.

**7.2 Add an RSS / Apple canonical alongside each YouTube link.** The podcast page points only at
YouTube videos — no canonical feed, no transcript, no offline listening. Seven links already
degrade to a search page. A canonical show URL per entry makes the page survivable.

**7.3 Pair the two pages.** They are currently unaware of each other. PsychEd's book-club format is
the proof of concept: *Mind Fixers* is a book, an audiobook, **and** a podcast episode. A "read it,
then hear it argued" pairing costs nothing but a cross-link and turns two flat lists into one
learning path — and it fits how the repo already cross-links ("Pair with…", `?page=` links).

---

## 8. Reproducing the measurements

```bash
cd /home/user/psychiatry-clerkship
# shipped counts
grep -c "^- Episode"  12_Media/psychiatry_psychotherapy_podcast_library.md          # 245
grep -c "search channel" 12_Media/psychiatry_psychotherapy_podcast_library.md       # 7 unresolved
grep -c '^- \*\*\['   07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md    # 51
grep -o 'https://[^)]*' 07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md \
  | grep -cv amazon.com                                                             # 0 non-Amazon
```

The §2.1 coverage table is a word-boundary keyword scan of both files against the clerkship topic
list; see the git history of this document for the script.

---

*Joshua Moss, MD | Psychiatry Clerkship Library. Prepared for faculty review 2026-09-03.
Educational; every item is a suggestion, not a requirement. No PHI. No instrument text reproduced.
External links are search-attested and unverified — see §0.2.*
