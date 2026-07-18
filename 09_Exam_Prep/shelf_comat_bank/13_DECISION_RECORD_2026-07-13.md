# Decision Record — Shelf/COMAT Question Bank Integration

**Date:** 2026-07-13 · **Decided by:** Joshua Moss, MD · **Recorded by:** technical-lead audit pass
**Supersedes:** the open "integration mode" fork in `11_FINAL_REPORT.md` §7 and
`12_TECHNICAL_LEAD_AUDIT_2026-07-13.md` §7.

## Decision

Adopt **Path B — one canonical, dual-exam bank (transform + gap-fill)**, executed in stages, **not**
as a big-bang rewrite. External citations are added to previously-attested items **where they add
value** (see policy below) — not universally.

## Agreed sequence (critical path)

1. **Commit `shelf_comat_bank/`** (currently untracked; only in the working tree). *Josh / Claude Code.*
2. **Attest the pilot 24** to learn calibration before scaling. Route via `09_ATTESTATION_QUEUE.json`,
   emergency/legal first. Apply the two `revise` fixes (`engine/proposed_fixes.md`) and confirm the
   `verified:false` guideline versions in the same pass. *Josh.*
3. **B1 — bug-fix replacements:** swap the two audit-flagged live items for the corrected `qbx_`
   versions (`qb_otherdx_005` Hoover; the DLB "pathognomonic" item). Small, obviously correct.
4. **CI gate:** add `engine/test_qbank.py` + `engine/qbank_validate.py` to `ci.yml`; fail build on
   non-zero exit. Do before B2/B3 so every batch self-polices.
5. **B2 — enrich attested items** with `blueprint.nbme` / `blueprint.comat` / `exam_alignment` tags
   and external `references` **where the citation policy says they add value**, in batches, re-attesting
   each batch. Additive metadata, not clinical rewriting.
6. **B3 — net-new items** for uncovered cells only (validator prints assignments: mood +20, anxiety
   +18, pharm +18, neurocog/safety/relational +14, …). Batches of 24, gate on each.

## Citation policy — "external citations where it makes sense" (Josh, 2026-07-13)

Add a real external reference to an item when a citation **changes or anchors a management/diagnostic
claim that a reader could reasonably contest**. Do **not** cite where DSM-5-TR definition alone
suffices or where a citation would be decorative.

**Cite (high value):**
- Management thresholds and drug-of-choice claims (e.g., clozapine for TRS → Kane 1988; CATIE for
  antipsychotic tolerability → Lieberman 2005).
- Emergency/safety and monitoring standards (serotonin syndrome → Boyer 2005; de-escalation →
  Project BETA; means-safety / post-discharge → VA/DoD suicide CPG).
- Capacity/legal/ethics reasoning (capacity → Appelbaum 2007).
- Any claim where guideline currency matters (AACAP, ASAM, Beers, APA schizophrenia, FDA labeling) —
  and mark `verified:false` until the exact version/URL is confirmed.

**Do not cite (low value / decorative):**
- Pure DSM-5-TR criterion recall (duration thresholds, criteria counts) — `evidence` field naming
  DSM-5-TR is enough; a landmark citation adds nothing.
- Ubiquitous textbook facts with no contested management hinge.

**Hard rules (unchanged):** real identifiers only — never fabricate a PMID/DOI; PMID/DOI-verify every
landmark before setting `verified:true`; the live bank's "no outside citations" contract is retired
**only** for items that pass this policy, and only under Path B.

## Item-writing standing rule (from the audit)

Bake into the V1 drafting prompt: **trim the correct option to the bare decision; rationale goes in
`why` / explanations.** This prevents the 46% longest-answer cue from recurring. Only lightly touch the
11 flagged pilot items if already editing them for attestation — do not spend a dedicated pass.

## Still Josh-only / not done here

Commit, attest, deploy. No live-bank content was modified in this session.
