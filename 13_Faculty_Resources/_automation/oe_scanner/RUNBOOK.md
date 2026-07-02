# OpenEvidence new-content scan — runbook

**Purpose:** Automatically notice when Dr. Moss drops new OpenEvidence review files into
`~/Psychiatry-Clerkship-Library/OPENEVIDENCE RAW FILES TO REVIEW/`, and turn each new review
into a concrete, prioritized list of clinical **accuracy/completeness** improvements for the
MS3 and psychiatry-resident clerkship libraries.

## Files
- `oe_scan.py` — detects new/changed files vs `oe_manifest.json`, extracts their text to `staging/`.
- `oe_manifest.json` — processed-file ledger (filename → sha256 + date). Do not hand-edit unless resetting.
- `staging/` — extracted plain text of new files (scratch; safe to clear).

## Procedure (what the scheduled run should do)
1. **Scan.** Run `python3 oe_scan.py` (translate the /Users path to the current bash mount).
   It prints JSON with `new_or_changed` (filenames + extracted-text paths in `staging/`).
2. **If `new_or_changed_count == 0`:** stop. Report "No new OpenEvidence files." Done.
3. **For each new file** (process oldest/most clinically central first; a few per run is fine —
   the manifest tracks progress so the next run continues):
   - Read the staged text (`staging/<file>.txt`).
   - Identify the clinical topic and the matching library page(s) under
     `~/Psychiatry-Clerkship-Library/` (e.g. Personality, SUD/Withdrawal, Delirium, Discharge,
     Family/Relational, Psychopharm primer, resident Advanced Psychopharm, evidence_inpatient, etc.).
   - Produce two lists, exactly as in the existing memo
     `13_Faculty_Resources/Handoffs/openevidence_library_accuracy_review_2026-06-30.md`:
     - **A. Accuracy corrections** — quote the library's current wording, state the issue, give the
       corrected fact + specific number + paper.
     - **B. Completeness additions** — the missing high-yield fact (with number), the exact target page,
       a one-line suggested phrasing.
   - Tag every item **[MS3]/[Resident]/[both]** and **P1** (accuracy/safety) or **P2** (completeness).
   - Rules: only shelf/COMAT- or bedside-relevant items; **quote real library text, never invent it**;
     write "verify" if unsure; **flag anything needing Dr. Moss's attestation**; **PHI-free** (de-identified
     composites only); do not edit library pages — this is a review memo only.
4. **Write** the findings to a dated memo:
   `13_Faculty_Resources/Handoffs/openevidence_library_accuracy_review_<YYYY-MM-DD>.md`
   (append to an existing same-day file rather than overwriting).
5. **Commit** each reviewed file: `python3 oe_scan.py --commit "<exact filename>"`.
6. **Report** a short summary: how many new files, which topics, where the memo is, and how many remain.

## Reset / reseed
- To re-review everything: delete `oe_manifest.json`.
- To mark the current backlog as done without reviewing: `python3 oe_scan.py --commit-all`.
