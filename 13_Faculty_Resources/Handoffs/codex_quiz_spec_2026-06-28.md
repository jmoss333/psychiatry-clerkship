# Codex Quiz Spec — 29 Landmark Decks to Complete Active Recall

*Goal: author MCQ self-test decks for the 29 audio-spine papers that don't yet have a quiz, so Active Recall covers all 50. (21/50 already have decks.) Output drops straight into the live Active Recall tool.*

## What to produce

One file **new_decks.json** — a JSON array of 29 deck objects in EXACTLY this shape (matches the existing quizzes.json engine):

```json
[
  {
    "id": "SP-11",                                 // = canonical_id from the table (enables ?deck=SP-11 deep-link)
    "title": "Brown 1962 - Expressed Emotion",      // = the Paper label from the table, verbatim
    "questions": [
      { "q": "Stem text (board-style, self-contained).",
        "o": [
          {"t":"Option A","c":false,"fb":"One-line why this is wrong."},
          {"t":"Option B","c":true,"fb":"One-line why this is right."},
          {"t":"Option C","c":false,"fb":"..."},
          {"t":"Option D","c":false,"fb":"..."}
        ] }
    ]
  }
]
```

## Rules
- 5-6 questions per deck, 4 options each (A-D), exactly ONE option with c:true per question.
- EVERY option needs fb (one-sentence rationale) — the engine shows the chosen option's feedback, so distractor rationales matter.
- Board/shelf style, anchored to the paper's real method / findings / clinical bottom line. Ground each deck in its NotebookLM audio overview (file listed) + the primary source (DOI listed).
- Do NOT fabricate statistics — if unsure of an exact number, test the concept, not the digit. No all/none-of-the-above. No PHI; fictional vignettes only.
- id MUST equal the canonical_id and title MUST equal the Paper label below (deep-linking + dedupe depend on both).

## Delivery + validation
- Deliver one new_decks.json (array of 29). Validate: valid JSON; each deck >=4 questions; each question exactly one c:true; ids unique and within the 29 below; titles verbatim.
- Dr. Moss merges into quizzes.json (adds n, re-sorts, rebuilds) and flips each paper's 'quiz coming' to 'Quiz this paper' (?deck=<id>).

## Audio source
Library: 07_Evidence_and_Reading/Landmark_Trials/audio/ (filenames below). Also in 13_Exports/notebooklm_audio_overviews_original_2026-06-28/audio/.

## The 29 papers

| canonical_id | Paper (use as deck title) | Audio file | Primary source (DOI) |
|---|---|---|---|
| SP-09 | Kellner 2006 - Continuation ECT | `09_LM_09_Kellner_2006_Continuation_ECT_1_48.m4a` | 10.1001/archpsyc.63.12.1337 |
| SP-10 | Moncrieff 2022 - Antidepressant Withdrawal | `10_LM_10_Moncrieff_2022_Antidepressant_Withdrawal_1_37.m4a` | — (use audio + general source) |
| SP-11 | Brown 1962 - Expressed Emotion | `11_LM_11_Brown_1962_Expressed_Emotion_2_02.m4a` | 10.1136/jech.16.2.55 |
| SP-12 | Leff 1982 - Family Intervention | `12_LM_12_Leff_1982_Family_Intervention_1_35.m4a` | 10.1192/bjp.141.2.121 |
| SP-13 | Falloon 1982 - Family Management | `14_LM_13_Falloon_1982_Family_Management_1_57.m4a` | 10.1056/nejm198206173062401 |
| SP-14 | McFarlane 1995 - Multifamily | `13_LM_14_McFarlane_1995_Multifamily_1_52.m4a` | 10.1001/archpsyc.1995.03950200069016 |
| SP-16 | Diamond 2010 - ABFT | `19_LM_16_Diamond_2010_ABFT_1_53.m4a` | 10.1016/j.jaac.2009.11.002 |
| SP-17 | Pinsof 1995 - Systemic Meta | `17_LM_17_Pinsof_1995_Systemic_Meta_2_00.m4a` | 10.1111/j.1752-0606.1995.tb00179.x |
| SP-18 | Minuchin 1978 - Psychosomatic Families | `18_LM_18_Minuchin_1978_Psychosomatic_Families_1_50.m4a` | 10.4159/harvard.9780674418233 |
| SP-19 | Leff 2000 - Couple Therapy Depression | `16_LM_19_Leff_2000_Couple_Therapy_Depression_1_45.m4a` | 10.1192/bjp.177.2.95 |
| SP-20 | Pharoah 2010 - Cochrane Family | `20_LM_20_Pharoah_2010_Cochrane_Family_1_35.m4a` | 10.1002/14651858.cd000088.pub3 |
| SP-22 | Bateman 1999 - MBT | `21_LM_22_Bateman_1999_MBT_2_02.m4a` | 10.1176/ajp.156.10.1563 |
| SP-23 | Wampold 2001 - Common Factors | `22_LM_23_Wampold_2001_Common_Factors_1_42.m4a` | — (use audio + general source) |
| SP-24 | Shedler 2010 - Psychodynamic | `23_LM_24_Shedler_2010_Psychodynamic_1_43.m4a` | 10.1037/a0018378 |
| SP-27 | Appelbaum 1988 - Capacity | `27_LM_27_Appelbaum_1988_Capacity_1_49.m4a` | 10.1056/nejm198812223192504 |
| SP-31 | Zanarini 2005 - BPD Remission | `32_LM_31_Zanarini_2005_BPD_Remission_1_48.m4a` | 10.1521/pedi.2005.19.5.505 |
| SP-32 | Gunderson 2018 - BPD Review | `33_LM_32_Gunderson_2018_BPD_Review_1_46.m4a` | 10.1038/nrdp.2018.29 |
| SP-35 | Franklin 2017 - Risk Factors | `35_LM_35_Franklin_2017_Risk_Factors_1_38.m4a` | 10.1037/bul0000084 |
| SP-36 | Caspi 2003 - 5-HTTLPR | `51_LM_36_Caspi_2003_5_HTTLPR_1_47.m4a` | 10.1126/science.1083968 |
| SP-37 | Border 2019 - Non-Replication | `37_LM_37_Border_2019_Non_Replication_1_36.m4a` | 10.1176/appi.ajp.2018.18070881 |
| SP-38 | Sekar 2016 - C4 Schizophrenia | `36_LM_38_Sekar_2016_C4_Schizophrenia_1_50.m4a` | 10.1038/nature16549 |
| SP-39 | Kernberg 1984 - Personality Org | `39_LM_39_Kernberg_1984_Personality_Org_1_56.m4a` | — (use audio + general source) |
| SP-40 | Gabbard 1995 - Boundaries | `38_LM_40_Gabbard_1995_Boundaries_1_46.m4a` | 10.1176/ajp.150.2.188 |
| SP-42 | Robins-Guze 1970 - Diagnostic Validity | `44_LM_42_Robins_Guze_1970_Diagnostic_Validity_1_54.m4a` | 10.1176/ajp.126.7.983 |
| SP-43 | Stein-Test 1980 - ACT | `43_LM_43_Stein_Test_1980_ACT_1_54.m4a` | 10.1001/archpsyc.1980.01780170034003 |
| SP-44 | Felitti 1998 - ACE Study | `41_LM_44_Felitti_1998_ACE_Study_1_52.m4a` | 10.1016/s0749-3797(98)00017-8 |
| SP-46 | Volkow 2016 - Addiction | `47_LM_46_Volkow_2016_Addiction_1_53.m4a` | 10.1056/nejmra1511480 |
| SP-47 | MTA 1999 - ADHD | `46_LM_47_MTA_1999_ADHD_1_45.m4a` | 10.1001/archpsyc.56.12.1073 |
| SP-50 | Insel 2010 - RDoC | `49_LM_50_Insel_2010_RDoC_1_44.m4a` | 10.1176/appi.ajp.2010.09091379 |

*Note: SP-10 Moncrieff 2022 has an ambiguous year/title (verify which paper first); SP-23 Wampold & SP-39 Kernberg are textbooks (no article DOI) — build from the audio + the work itself.*

*Joshua Moss, MD | Psychiatrist · Quiz handoff spec; educational; no PHI.*