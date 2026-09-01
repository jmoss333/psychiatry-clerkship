# Evidence Inbox

**Drop studies, guidelines, PDFs or notes here. Nothing else required.**

Accepted: `.pdf` `.docx` `.txt` `.md` `.csv`. Drop the file, and the next scan notices it by
content hash, extracts its text, and queues it for triage toward the curriculum.

Nothing you put here is committed to git — only this README is tracked. Drop freely.

## What happens to a file you drop

```
  drop  →  scan/extract  →  triage memo  →  faculty decision  →  evidence gate  →  page edit
                                                ↑ you are here
```

1. **Scan.** `bash bin/evidence-inbox.sh` reports what is new and stages the extracted text.
2. **Triage.** Each new document gets a row in a dated memo under
   `13_Faculty_Resources/Handoffs/`: what it is, which library page it bears on, whether the
   library already covers it, and a recommendation — **adopt / cite / ignore / supersedes**.
3. **Your decision.** Nothing enters the curriculum without it.
4. **The gate.** Anything adopted must land in `evidence_registry.json` *and*
   `evidence_annotations.json` with a verbatim `sourceSpan` from the paper's own results —
   in the same change as the page edit. This is the step that keeps the library honest.
5. **Attestation.** Page edits made before you sign off carry a `Pending re-attestation` tag,
   which shows up in every scan until cleared with `--attest`.

## Two rules that matter more than the mechanics

**A review is not a source.** If you drop a review, guideline, or an OpenEvidence summary, the
claims it makes still have to be verified against the *primary* papers it cites. The span stored
in `evidence_annotations.json` must come from the paper that ran the study, not from the document
that summarised it. Skipping this is exactly how a viewpoint article ended up cited for a
statistic it never reported (see the "How We Know" page).

**Read the results section.** Not the title, not the abstract's last sentence, not the
conclusion. A 2026-08-21 pass found a majority of annotations written from titles needed
amendment, and several said close to the opposite of the paper.

## Commands

```bash
bash bin/evidence-inbox.sh                  # what's new; extract text to staging
bash bin/evidence-inbox.sh --list           # what's new, without extracting
bash bin/evidence-inbox.sh --commit "X.pdf" # mark one file triaged
bash bin/evidence-inbox.sh --pending        # pages awaiting your attestation
```

Full procedure: `13_Faculty_Resources/_automation/oe_scanner/EVIDENCE_INBOX_RUNBOOK.md`

**No PHI.** Do not drop anything containing patient identifiers. This folder is on disk in a
clinical-education repository; treat it as you would any shared drive.
