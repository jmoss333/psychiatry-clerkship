# Ratchet gates

**What a ratchet is here.** A committed JSON pins a count that the tool measures on every run.
The count may **fall freely** (the tool prints a `note:` and names the command that locks the
gain in). A **rise fails** and blocks the push. Nobody has to drive the number to zero for the
gate to be useful, and nobody can let it drift upward without a diff a reviewer sees. Hard
checks — the ones that must be zero regardless — live *beside* the ratchets, never inside them.

Four tools use it. Each ships its own falsification (`--self-test`) that proves a synthetic
regression exits 1 and the live tree exits 0, and `bin/verify.sh` runs both the self-test and the
gate, so the pre-push hook is the enforcement. None of them is in `ci.yml`: adding a step
there trips three separate contracts (`bin/check-verify-coverage.py`, the step inventory and the
workflow digest in `validate_scheduled_workflows.py`), and `verify.sh` runs before every push
anyway. See `CLAUDE.md`, "Validate & test".

| Tool | Baseline | Pinned keys | Hard checks beside the ratchet |
|---|---|---|---|
| `bin/check_design_drift.py` | `13_Faculty_Resources/_automation/site_build/design_drift_baseline.json` | raw dimension declarations, distinct font sizes, sub-floor font sizes, non-standard breakpoints (per file) | C1–C9, see `docs/DESIGN_SYSTEM.md` §3 |
| `bin/verify_spans.py` | `bin/verify_spans_baseline.json` | `rows_flagged`, `sentences_truncated`, `sentences_edited`, `rows_uncached` | any **REWORDED** sentence (a sentence the paper never wrote) fails whatever the baseline says |
| `bin/check_qbank_coherence.py` | `bin/check_qbank_coherence_baseline.json` | `pairs` (0 today) | none — the pin is the floor |
| `bin/check_qbank_length_cue.py` | `bin/qbank_length_cue_baseline.json` | `attested_uniquely_longest` (133 of 144), `live_uniquely_longest` (156 of 189) — items whose keyed option is the uniquely longest (WP-7) | none; the flagged ids it prints are the rewrite work list. Report-only lines for `topic_meta.json` quizzes and the practice-case JSONs never move the exit |

## Lowering the ratchet

After a reduction you made on purpose (a span re-quoted from the paper, an abstract added to
the cache, a contradicting bank item fixed), re-pin from the current tree and commit the JSON
diff **in the same PR** as the reduction:

```bash
python3 bin/check_design_drift.py --update-baseline
```

```bash
python3 bin/verify_spans.py --update-baseline
```

```bash
python3 bin/check_qbank_coherence.py --update-baseline
```

```bash
python3 bin/check_qbank_length_cue.py --update-baseline
```

`check_qbank_length_cue.py` pins two counts because each hides the other's shortcut: demoting a
cueing item to `draft` lowers the attested count without fixing anything, and the live count
does not move until the item is rewritten. Lower the attested pin after the rewritten batch is
re-attested through the console.

Each command rewrites its baseline from what the tool measures right now, prints the new pins,
then runs the gate. The tool does not refuse to write a *higher* number — the diff in the PR is
the review, and a reviewer who sees a pin go up should ask why. Never re-pin to make a red
push green: fix the row or the item the tool printed. The message on a rise says so.

## Exit codes (the `bin/` tools)

| Exit | Meaning | Examples |
|---|---|---|
| 0 | clean — every pinned count at or below its baseline, hard checks clear | a fall prints `note: … improved 6 -> 5 — run --update-baseline …` |
| 1 | a finding | a count rose; a REWORDED sentence |
| 2 | could not check — **not a pass** | no baseline; a baseline missing a key; zero rows carrying a span; zero live bank items; zero attested items; an item whose options cannot be measured |

Exit 2 exists because a pass over an empty set is the defect `docs/SILENT_SHRINK_CHECKLIST.md`
§D4 describes. Before 2026-09-16, `verify_spans.py --cache <wrong path>` printed
`0 clean … 49 uncached` and exited 0; it is now a rise in `rows_uncached` and exits 1. The
abstract cache is git-tracked, which is what makes that count deterministic across checkouts.

`verify_spans.py --id <sourceId>` is a **partial run**: it reports one row and keeps the
REWORDED hard floor, but does not evaluate the ratchet, because the pins cover the whole file.

## Why the span audit needed this

`verify_spans.py` exists because pott-2022 shipped a quoted sentence with the clause "for
comorbid depression and substance use disorders" deleted from its middle. That shape
reassembles from two in-order verbatim runs, so the classifier calls it **EDITED** — and until
2026-09-16 only **REWORDED** was gated. Re-shipping the exact defect the tool was built for
exited 0. The ratchet on `sentences_edited` is what closes that; `--self-test` pins it with a
fixture of the same shape.

Expect **two** FAIL lines in `bin/verify.sh` for one such regression: the gate step, and the
`unit — span audit` step before it, because the self-test's last assertion runs the live tree
against the committed pin. That is deliberate — `--self-test` alone certifies the pin is current —
and it is how a re-shipped pott-2022 deletion rendered on 2026-09-16: `sentences_edited rose
6 -> 7`, `rows_flagged rose 11 -> 12`, exit 1 from both steps.

## Known limitation

A count cannot see one flagged row (or pair) replaced by a different one: eleven flagged spans
today and eleven tomorrow could be a different eleven. The tool prints every flagged row and
pair, and that listing — not the summary line — is what a reviewer reads. Pinning the sorted
list of flagged ids instead of the count would close this and is a small follow-up.

`rows_clean` and `rows_audited` are printed, not pinned. A shrinking `evidence_annotations.json`
therefore lowers `rows_flagged` and `rows_audited` together and the gate exits 0 with an
improvement note. The deletion is visible in that file's own diff and in the `of N audited`
tally on the last line, and `validate_evidence_annotations.py` gates a source that loses its
row — but a **coverage floor** on `rows_audited` (fail when it *falls*, re-pin to lower it) is the
inverse ratchet, and the honest SILENT_SHRINK answer. It is a deliberate follow-up rather than
part of the first cut because it changes what `--update-baseline` means.
