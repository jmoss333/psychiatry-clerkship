# Anki Export — Psychiatry Clerkship Library

The site build creates three downloads from the same released Concepts feed used
by native cards and the current, post-overlay question bank. Every rendered Anki
card is checked before the site build succeeds.

Measured on 2026-09-27 with the local baseline ledger:

| Download | Content | Cards / notes |
|---|---|---|
| `psychiatry_clerkship_concepts.apkg` | Released Concepts | 154 / 138 |
| `psychiatry_clerkship_library.apkg` | 150 attested question-bank items, including 20 tier-two cards | 170 / 170 |
| `psychiatry_clerkship_library_ALL.apkg` | Both subdecks in one import | 324 / 308 |

Counts describe verified staged output, not the historical committed fallback
packages. Signed faculty reviews can change release membership at build time.
The 47 changed faces and four withdrawals remain pending faculty review; this
implementation does not refresh the committed APKG baselines or establish clinical approval.

## Build and inspect

```bash
python3 -m pip install -r requirements.txt
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
python3 13_Faculty_Resources/_automation/site_build/check_anki_parity.py _build/ms3 ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
python3 13_Faculty_Resources/_automation/site_build/check_anki_parity.py _build/res res
```

`build_anki.sh OUT_DIR` stages exactly three APKG files into `OUT_DIR/anki`.
`OUT_DIR/tools/concepts.json` must already exist. Routine builds never modify
these committed baseline packages. A missing dependency fails the build. If
export fails, committed packages are accepted only when their individual cards,
GUIDs, ordinals, templates and sources exactly match the released feed and current
question bank. Stale fallback packages fail the build.

## Explicit local baseline refresh

Run only after reviewing the staged cards, outside an active ledger overlay.
This rebuilds with the baseline ledger, verifies semantic equality, and copies
only the three verified packages. Review and commit those three files explicitly;
do not commit unrelated generated files or media pointer stubs.

```bash
(
  set -e
  test "${CLERKSHIP_LEDGER:-off}" = off
  test -z "${NETLIFY:-}"
  CLERKSHIP_LEDGER=off bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  python3 13_Faculty_Resources/_automation/site_build/check_anki_parity.py _build/ms3 ms3
  for name in psychiatry_clerkship_library psychiatry_clerkship_concepts psychiatry_clerkship_library_ALL; do
    cp "_build/ms3/anki/$name.apkg" "09_Exam_Prep/anki_export/$name.apkg"
  done
)
```

## Concepts and review history

Concepts consume the built `tools/concepts.json`; there is no prose scraping,
positional pearl mapping, author-bold fallback, or generic recall prompt. Each
editorial target becomes one cloze card, while sibling clozes share one Anki note.
The checker renders every ordinal independently, so a missing sibling cannot hide
behind a correct note count.

`concept_guid_crosswalk.json` preserves GUIDs for unchanged notes. A changed tested
target gives the whole grouped note a new deterministic GUID. This release reports
sibling churn for `cultural_psychiatry-pearl5` `t_neurocog-pearl7`, `t_perinatal-pearl1`, and `t_psychosis-pearl8`. Crosswalk
front/back text must match the generated native question and reveal exactly.
Withdrawn and withheld cards are excluded. Re-importing does not remove already
imported old Anki notes; learners must retire obsolete notes in their collection.
Citation cleanup adds 11 changed cards across nine formerly preserved notes; the
47 changed cards now use new note identities and four historical cards are withdrawn.
The neutral “Concepts” heading replaces the topic on every Anki front, including
107 cards whose fields/GUIDs remain unchanged. Topics and resolved evidence links
appear only after reveal. This template change is separate from identity changes.

Question-bank GUIDs stay keyed to the item ID (`id::t2` for tier two). Draft items
are excluded from all three site downloads. The standalone question-bank exporter
still offers its explicit `--include-drafts` authoring mode and CSV export; those
are not staged as learner downloads by this build.
