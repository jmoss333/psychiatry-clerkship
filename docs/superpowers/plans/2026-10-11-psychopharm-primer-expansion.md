# Psychopharmacology Primer Expansion Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved content plan in the current session.

**Goal:** Expand the existing adult inpatient primer into a practical, source-backed clerkship core with resident nuances.

**Architecture:** Keep the existing Markdown page and shipping route. Update only its topic summary and the evidence records supporting the new teaching; preserve medication-card quotation links.

**Tech Stack:** Markdown, JSON, existing Python validators and dual-site builder.

**Spec:** ../specs/2026-10-11-psychopharm-primer-expansion.md

## Global Constraints

- No numeric prescribing schedules; no patient data.
- Educational draft for faculty review; never create or refresh a faculty signature.
- Current primary sources and official labels establish facts; OpenEvidence supports discovery.
- Preserve unrelated work and medication-card quotations, or explicitly repair their provenance.
- Existing ratchets and policy gates remain unchanged.

## Review Focus

- Bipolar phase: lamotrigine maintenance/depression teaching must not imply acute antimanic efficacy.
- Null results: lithium suicide-prevention claims must retain randomized-trial uncertainty.
- Benzodiazepines: avoid autopilot prescribing without implying abrupt cessation or excluding indicated scheduled care.
- Regulatory changes: clozapine REMS removal does not remove ANC monitoring; esketamine depression outcomes are not suicide-prevention proof.
- Shared source: primer edits must not leave medication-card quotes or summary cards inconsistent.

## Task 1: Source-backed teaching content

- [x] Verify the specific guideline sections, paper results and label limitations used below.
- [x] Rewrite `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md`: opening framework, medication tables, monitoring, resident nuances, synthetic cases, question-led references.
- [x] Update only `topic_meta.json["psychopharm_primer.md"]`, and the two psychopharmacology README files.
- [x] Add pending faculty-review sources to `evidence_registry.json`, matching claims in `evidence_annotations.json`, and independently retrieved source text to the existing span cache. Refresh missing citation identities using the existing tool.
- [x] Run evidence/schema/topic/pharmacy/span/citation validators; inspect each finding and the source-to-claim alignment manually.

## Task 2: Reviewable delivery

- [ ] Run `bash bin/verify.sh` with output captured outside the worktree; confirm both site builds and required gates complete.
- [x] Inspect the rendered primer in both builds, including links, tables, review status and narrow-screen behavior.
- [x] Run `python3 bin/signoff_impact.py`; record reopened signatures in the draft PR.
- [x] Review the complete diff for unsupported claims, accidental prescribing instructions and unrelated edits.
- [ ] Commit, push and open an attached draft PR. Report local validation and remote checks separately; do not merge or publish.

## Execution notes

- Owner explicitly approved the expansion before implementation. Execute in this session without another approval round.
- This is a content revision using existing validators; do not add tests that merely repeat prose.
- Base: `615b8c838c6cf6f7d96ff3e9e4acfe6fabec1baf`. Isolated worktree: `psychopharm-primer-2026-10-11`.

- Research: PubMed-indexed Europe PMC records, relevant full guideline text, the APA publisher-indexed LAI recommendation, ASAM and official FDA/DailyMed labels. OpenEvidence query opened in Chrome but returned a blank answer page; it was not used as verified evidence.
- Evidence changes: seven new sources pending faculty review; reuse the existing BAP catatonia record; eight new claim annotations; existing CATIE and VA lithium claims gain the primer as a consumer. Published corrections for Lam, Huhn and McPheeters are recorded with their scope.
- Review: independent read-only clinical/source review found narrow evidence excerpts; expanded the bipolar/neuromodulation excerpts, clarified the APA LAI excerpt, and removed an attribution no longer supported by the retained excerpt. Review is not faculty attestation.
- Integration: regenerate the existing evidence drill (11 new draft items); preserve the five-pearl structure and all 34 pharmacy quotation links; retain QTc in the searchable summary. Registry inventory tests enumerate the seven new IDs and their recorded corrections without changing a gate or ratchet.

- Render review: both audience previews show seven tables, all ten PubMed reference links, no raw footnote syntax, and pending faculty review. Desktop comparison layout and phone row layout checked; at 390px the page width remains 390px. This is browser review, not native VoiceOver proof.
- Sign-off impact: one reopened signature, `psychopharm_primer.md` (signed 2026-09-26). No faculty approval records changed.
- Final integration repairs: refresh the two proposed clozapine surveillance reading quotes; place source markers inside sentence punctuation so generated draft cards do not combine adjacent sources; refresh the primer's existing MS3/resident panel snapshots. A label URL triggered a false crisis-contact match, so the bupropion link now uses the verified current Wellbutrin XL DailyMed label instead.
- Final full validation and remote check status are recorded in the draft PR delivery. Initial failed runs were used to find and repair the dependencies above; they are not claimed as passing evidence.

- Review packaging: the L1 gate treats `bin/data/citation_attribution_cache.json` as governance. Its five identity additions are isolated on `codex/psychopharm-citation-cache-2026-10-11`; the teaching PR is stacked on that branch. Retarget the teaching PR to main only after the prerequisite lands. The original unpushed branch is preserved.
- The resident-only deep link is replaced with the resident Library entrance so both audience builds retain valid navigation.
