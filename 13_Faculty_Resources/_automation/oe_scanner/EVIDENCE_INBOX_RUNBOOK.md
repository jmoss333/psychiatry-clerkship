# Evidence Inbox — runbook

**Purpose:** turn a document dropped into `Evidence Inbox/` into either a curriculum change
backed by a verbatim source span, or a recorded decision not to use it. Nothing enters the
library without one of those two outcomes.

This extends `RUNBOOK.md` (the OpenEvidence review procedure) with the step that one stops
short of: **landing an adopted source in the evidence gate.**

## How this relates to the OpenEvidence inbox

Same scanner, two inboxes, separate ledgers.

| | OpenEvidence inbox | Evidence Inbox |
|---|---|---|
| Folder | `OPENEVIDENCE RAW FILES TO REVIEW/` | `Evidence Inbox/` |
| Ledger | `oe_manifest.json` | `evidence_inbox_manifest.json` |
| Command | `python3 oe_scan.py` | `bash bin/evidence-inbox.sh` |
| Holds | OpenEvidence comprehensive reviews | anything: primary studies, guidelines, PDFs, notes |
| Output | accuracy/completeness memo | triage memo + evidence-gate landing |

Retargeting is done with `--folder` / `--manifest`; defaults are unchanged, so every existing
OpenEvidence invocation behaves exactly as before.

## Procedure

### 1. Scan
```bash
bash bin/evidence-inbox.sh
```
Prints JSON with `new_or_changed` (filenames + extracted-text paths under the manifest's
`staging/`). If `new_or_changed_count == 0`, stop — report "nothing new."

Accepted types: `.pdf` `.docx` `.txt` `.md` `.csv`. `README.md` is ignored.

### 2. Classify each document — the fork that governs everything after
Before anything else, decide what kind of document this is. The answer changes the whole path.

| Kind | Examples | What it can license |
|---|---|---|
| **Primary** | RCT, cohort, meta-analysis with its own extraction | Its own results. Span comes from this paper. |
| **Secondary** | narrative or systematic review, guideline, OpenEvidence summary | **Nothing on its own.** Use it to *find* primary papers; the span must come from the primary. |
| **Viewpoint / commentary / editorial** | perspective pieces, letters | Only its own argument, attributed as an argument. Never a statistic. |
| **Instrument or form** | rating scales, safety plans | Nothing. See the instrument-reproduction rule — teach administration, never reproduce. |

**This classification is the single highest-value step.** The August 2026 Modini correction
happened because a viewpoint was treated as primary. PubMed types many viewpoints as "Journal
Article", so no automated check will make this call for you.

### 3. Triage — write the memo, change nothing
For each document, append a row to a dated memo at
`13_Faculty_Resources/Handoffs/evidence_intake_<YYYY-MM-DD>.md`:

- **What it is** — full citation, PMID/DOI, document kind from §2.
- **What it bears on** — the specific library page(s) and, where relevant, the `topic_meta.json` key.
- **Does the library already cover it?** — quote the library's current wording. Never invent
  library text; if you cannot find it, write "verify."
- **Recommendation** — one of:
  - `adopt` — a new fact belongs in the curriculum
  - `cite` — the library already says this; add the source to strengthen it
  - `supersedes` — replaces a source we currently cite (name it)
  - `ignore` — out of scope, redundant, or too weak; record why
- **Tag** — `[MS3]` / `[Resident]` / `[both]`, and `P1` (accuracy/safety) or `P2` (completeness).

Rules carried over from `RUNBOOK.md`: only shelf/COMAT- or bedside-relevant items; PHI-free;
do not edit library pages at this stage.

### 4. Faculty decision
Dr. Moss reviews the memo and marks each row. Nothing proceeds without this.

### 5. Land it — the evidence gate
For every `adopt`, `cite` or `supersedes` row, in **one change**:

1. Add or update the source in `evidence_registry.json`. New sources ship
   `facultyReviewStatus: pending`.
2. Add the annotation to `evidence_annotations.json`:
   - `verifiedAgainst.sourceSpan` — **verbatim, from the primary paper's results**, retrieved
     from PubMed/Europe PMC, not retyped from a review or from memory.
   - `verifiedAgainst.pmid` / `doi`, `spanType`, `retrievedAt`.
   - `claims[]` with `claimText` that says no more than the span licenses, and a `direction`
     of `positive` / `negative` / `mixed` / `descriptive` that matches it.
3. Edit the page prose. **The stored claim and the page sentence must say the same thing** —
   the validator checks the stored claim, not your prose, so that consistency is on you.
4. If the edit lands before Dr. Moss re-attests, tag the page's review-status line:
   `**Pending re-attestation:** <fact> added <date> (<source>)`.
5. Run the gates:
   ```bash
   python3 13_Faculty_Resources/_automation/validate_evidence_annotations.py
   bash bin/verify.sh
   ```

**If claim and span disagree, rewrite the claim.** Never trim the span, and never move the claim
to a paper that does not support it. That is the stored policy, verbatim.

### 6. Commit the file as triaged
```bash
bash bin/evidence-inbox.sh --commit "<exact filename>"
```

### 7. Report
How many new documents, their kinds, the memo path, how many remain — **and the current
attestation queue** (`bash bin/evidence-inbox.sh --pending`). If the queue is non-empty, say
plainly that those edits are live to learners but not yet attested.

### 8. Refresh the teaching page
```bash
python3 bin/build_how_we_know.py
```
If this intake corrected an existing claim, the "How We Know" page picks it up automatically —
the correction ledger is derived from commit history, not maintained by hand.

## Reset
- Re-triage everything: delete `evidence_inbox_manifest.json`.
- Mark the current backlog done without triage: `bash bin/evidence-inbox.sh --commit-all`.
