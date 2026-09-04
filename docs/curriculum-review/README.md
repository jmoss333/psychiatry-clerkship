# Curriculum content transcripts — for clinical review

Generated 2026-09-04 from build `56e9423` by
`13_Faculty_Resources/_automation/export_curriculum_review.py`.

Two complete, human-readable transcripts of everything the two sites ship — one per audience.
Assembled from the **built** sites (`_build/ms3`, `_build/res`), so each reflects sidebar
order, the audience-scoped page set, resident overrides and build-injected blocks. Nothing is
summarised or truncated.

| | MS3 (`une-ms3-psychiatry`) | Residents (`mmc-psychiatry-residents-sanford`) |
|---|---|---|
| Narrative pages | 80 | 86 |
| Words of curriculum | 100,988 | 120,736 |
| Interactive tools | 23 | 25 |
| Question-bank items | 192 | 192 |
| Audio-companion questions | 437 | 437 |
| Communication cases | 12 | 12 |
| Reasoning cases | 4 | 5 |
| Family systems scenarios | 8 | 8 |
| Evidence sources / annotated claims | 107 / 49 | 107 / 49 |
| Complete transcript | `ms3/MS3_CURRICULUM_COMPLETE.md` (2,404,531 B) | `resident/RESIDENT_CURRICULUM_COMPLETE.md` (2,657,667 B) |

## How to use

`REVIEW_PROMPT.md` is the handoff prompt to give a reviewing model, plus the pass schedule that
orders these files by yield. Hand over **one file per pass** — the complete transcripts are
multi-megabyte, and handing over the whole thing buys a shallow read of everything instead of a
real read of the parts that matter.

`<audience>/00_REVIEW_BRIEF.md` states the audience, the inventory, the standing editorial
constraints a reviewer should not mistake for omissions, and the severity rubric findings should
come back in.

Then either hand over the single `*_CURRICULUM_COMPLETE.md`, or work the split files in order:

1. `01_NAVIGATION_MAP.md` — every shipped surface with its governance status and source path
2. `02_CURRICULUM_V*.md` — the curriculum itself, in sidebar order, each page paired with the
   `topic_meta` assertions the SPA renders around it
3. `A1_QUESTION_BANK.md` — practice items with keyed answers and rationales
4. `A2_CASE_SIMULATIONS.md` — communication, reasoning, family-systems and longitudinal cases
5. `A3_AUDIO_COMPANION_QUIZZES.md` — the landmark-trial / spine audio quiz decks
6. `A4_EVIDENCE_BASE.md` — every claim beside the verbatim source span that licenses it
7. `A5_COVERAGE_MATRICES.md` — blueprint, EPA and safety-level coverage

## Regenerating

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
python3 13_Faculty_Resources/_automation/export_curriculum_review.py
```

The exporter is report-only: it reads the builds and the root registries and writes only into
`docs/curriculum-review/`.
