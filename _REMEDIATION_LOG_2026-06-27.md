# Remediation Log — Committee Review Response (2026-06-27)

Site: **une-ms3-psychiatry.netlify.app** · Acting on the external committee review. This pass covered the two non-negotiables + the MSE bug + audience-bleed; larger items are staged for your decision.

## (a) Framework-terminology removal — CONFIRMED
All "RSS / RSSM / ReConnect / RSS Layer / Layer 1–4 / Biological Stabilization / Relational Connection / Functional Engagement" strings removed from student-facing content.
- 6 week headers: `*(RSS Layer …)*` parentheticals stripped → plain titles ("Week 1 — Foundations & Orientation").
- Curriculum index, folder READMEs, and the deployed pack file (`family_discharge…`) reworded ("internal manuals," "relational-psychiatry frame," "video scripts").
- **Verification:** `grep -i 'RSS|RSSM|ReConnect|Layer [1-4]|Biological Stabilization|Relational Connection|Functional Engagement'` over the deployed bundle → **0 hits.** (Only residual "reconnect-psychiatry-system" instances are literal git-repo paths in two *faculty-library* READMEs that are NOT on the student site.)

## (b) Internal-reference audit — ZERO dead path strings
Every `NN_Folder/…` backtick path string in deployed content was rewritten to a plain-language phrase (the SPA's sidebar is the navigation). No raw folder paths, no 404 links remain.

| Referenced target | Resolution on the student site |
|---|---|
| `02_Clinical_Skills/Mental_Status_Exam` | → "the Mental Status Exam tool" (tool exists) |
| `02_Clinical_Skills/Oral_Presentations` | → "the Oral Presentation tool" (exists) |
| `04_Acute_and_Safety/Decisional_Capacity` | → "the Decisional Capacity tool" (exists) |
| `04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning` | → "the suicide-risk & safety tools (C-SSRS)" (exists) |
| `03_Core_Topics/SUD_Withdrawal` | → "the Withdrawal (CIWA-Ar/COWS) card" (exists) |
| `02_Clinical_Skills/Differential_Diagnosis` | → "the Differential Diagnosis scaffolds" (exists) |
| `06_Family_and_Relational` | → "the Family & Relational material (Family Meeting Playbook)" (page exists) |
| `04_Acute_and_Safety/Catatonia`, `…/Delirium`, `…/Agitation_and_Restraint` | → plain prose ("the catatonia / delirium / agitation guidance") — **dedicated pages not yet built (see Outstanding)** |
| `05_Psychopharmacology/Protocol_Library`, `05_Psychopharmacology` | → "the protocol library (benzo taper, clozapine)" / "the Psychopharmacology section" — **not yet built** |
| `_QA_REPORT.md` (in review banners) | reference removed from student pages |

**Verification:** `grep` for backtick `NN_…` path tokens in the deployed bundle → **0 hits.**
*Note:* references are now plain text, not clickable cross-links. Turning them into working in-app links is part of the IA rebuild below.

## MSE builder bug — FIXED
Rewrote the sentence generator: each MSE domain now emits its own clean, capitalized sentence (no more run-ons like "…disheveled. with guarded."); the fragile string-replace hacks are gone and **Mood now renders** ("Mood is "depressed"."). JS re-verified (`node --check`).

## Audience-bleed — FIXED
The faculty-facing Primary-Source download list (addressed to "Dr. Moss," with MaineHealth-library instructions) was **removed from the student bundle.** It remains in the library/faculty area.

## (c) New pages created this pass
None (the missing clinical pages are staged for your go — see Outstanding). *Prior passes already added the Columbia C-SSRS tool, the FRST violence tool, and the Family Therapy Modalities page.*

## (d) Outstanding faculty-attestation checklist (the #1 gate)
Still carrying "pending Dr. Moss's review" banners — review, then I strip the banner + stamp "Reviewed by Joshua Moss, MD — [date]":
- [ ] 7 topic pages (Mood, Psychosis, Anxiety/Trauma/OCD, Personality, Substance Use, Geriatric, Perinatal)
- [ ] Differential Diagnosis scaffolds
- [ ] Tools: MSE, Decisional Capacity, Oral Presentation, Violence/FRST, CIWA-Ar/COWS, C-SSRS, Reflection
- [ ] Family Therapy Modalities page

## Outstanding (need your decision — larger lifts)
1. **Build the 5 referenced-but-missing clinical pages** (Catatonia, Delirium, Agitation ladder/Restraint, Psychopharmacology primer, Protocol Library) — net-new clinical content; needs your attestation. *Recommend yes.*
2. **IA rebuild** — clickable in-app cross-links, a Faculty Annex split, search bar, mobile-collapse fix, family-systems thread in every week, documentation-template library.
3. **New tools** the review proposed (catatonia screener, delirium workup, agitation simulator, bipolar-vs-unipolar tool, flashcards/self-test).
