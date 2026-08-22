# Therapy Curriculum Build Plan — Psychiatry Clerkship Library

**Prepared:** 2026-08-20 · Joshua Moss, MD (drafted with AI; all content routes through faculty attestation)
**Feeds:** WP-35 (go-deeper rails), WP-36 (therapy evidence library), Kaitlin Taplinger's request #5 ("could the therapy section be built up some?")
**Sources synthesized:** the verified therapy triage (38 KEEPs, `THERAPY_LIBRARY_KEEPS_VERIFICATION_2026-08-20.md`) + the OpenEvidence comprehensive reviews (Brief Psychotherapeutic Interventions · Family Involvement · BPD Inpatient Management · Discharge Planning · Family Meetings Training)

---

## 1. The design insight: two layers, not one

The library now has **two distinct therapy assets that must not be blended into mush**:

- **The evidence layer** — the triaged, verified reading list (38 keeps across 12 domains). Answers *"what does the literature actually say, and what should I read?"*
- **The practice layer** — the OpenEvidence brief-interventions corpus. Answers *"what do I actually do in the 10 minutes I have with this patient today?"*

Kaitlin's request is really for the practice layer with the evidence layer behind it. The INCORPORATION_REVIEW principle applies: **one consolidated page per layer**, not 12 fragmented modality pages.

## 2. The deliverables (staged in this folder — see §5 before moving anything)

| # | File | What it is | Target home after attestation | Audience |
|---|---|---|---|---|
| 1 | `DRAFT_PAGE_Therapy_On_The_Unit_2026-08-20.md` | Flagship teaching module — the practice layer. Anchoring vignette, the non-negotiable three, the 5-minute toolkit, scenario matching, BPD-without-a-DBT-unit, the family meeting, self-check questions | `02_Clinical_Skills/` (nav: Skills, cases & exam) | MS3 core + labeled Resident extensions |
| 2 | `DRAFT_PAGE_Therapy_Reading_Room_2026-08-20.md` | The evidence layer — the therapy reading page built from the verified keeps with MS3 annotations and go-deeper rails (Taplinger items 4–5) | `07_Evidence_and_Reading/` | MS3 + resident |
| 3 | This plan | Architecture, wiring, governance, six-week arc | `docs/superpowers/plans/` (stays) | Faculty |

## 3. The six-week therapy arc (integration with the existing curriculum)

Therapy content is currently a section of the site; this arc makes it a **thread through the rotation**, using surfaces that already exist (didactics slots, case-of-the-week, the daily loop):

| Week | Thread | Anchor skill | Library tie-in |
|---|---|---|---|
| 1 | *The alliance is the intervention* | Validation; six levels; alliance with SMI patients | Reading Room D1; entry-contract "daily loop" |
| 2 | *Safety as therapy* | Safety planning quality; means counseling stance | WP-06R-b tool; Reading Room D3 |
| 3 | *Activation and skills* | BA micro-dose; one TIPP skill; group BA rationale | Reading Room D2b; depression core-topic page rail |
| 4 | *The family meeting* | 30-minute structure; listening ≠ disclosing | Reading Room D6; family core-topic rail; case-of-the-week: family meeting case |
| 5 | *The hard cases* | GPM stance for BPD; MI spirit for ambivalence | Reading Room D5/D7; BPD core-topic rail |
| 6 | *The bridge out* | Discharge bridging; what to recommend and how to write it | Reading Room D11; discharge tool |

Each week = one 10-minute pre-rounds teaching bite (content already in Module 1) + one reading (already annotated in the Reading Room). No new didactic hours required.

## 4. topic_meta.evidenceIds wiring map (WP-35 rails, closes F19 as a side effect)

Once keeps are promoted into `evidence_registry.json`, wire rails onto existing pages:

| Existing page | Rail (3–5 items from verified keeps) |
|---|---|
| Depression core topic | 42492146 · 34264703 · 30520019 · 17184887 |
| Psychosis core topic | 41217072 · 40392926 · 15500811 · 31050757 |
| BPD core topic | 38952224 · 42018336 · 41190740 · 42275028 · 41849148 |
| Suicide risk / safety planning tool | 40185617 · 41365522 · 29998307 · 39837259 |
| SUD core topic | 38084817 · 39798118 · 34146994 |
| Family / psychoeducation page | 33568244 · 31050757 · 21154340 |
| Discharge planning tool | 41664893 · 38934489 · 39837259 |
| OMM / evidence-limits page | 40177337 · 36525623 · 40325843 |

## 5. Wiring checklist — do NOT skip (the build will fail otherwise)

1. **Do not drop the draft pages into `NN_Category/` yet** — an unregistered source page hard-fails the QA gate's orphaned-source check. Staging is `docs/superpowers/plans/` until each page is (a) attested and (b) registered.
2. Per page, on promotion: register in `site_manifest.json` **and** nav in `build_deploy.py` → `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` (and `res`) must pass.
3. Citation gate: every PMID in the drafts is tagged **[✓]** (verified this session via Europe PMC identity+retraction) or **[⚠ OE]** (OpenEvidence-supplied, pending the Scholar_Sidekick canonical pass — connector currently down, fix key first). **No ⚠ citation ships to students unverified.**
4. Registry route: keeps → `therapy_library.json` (staging schema per Taplinger B4) → curated batches into `evidence_registry.json` → must pass `validate_registry_schemas.py` before merge.
5. Attestation: both pages are **AI-drafted, pending faculty attestation** — route through Review & Attest; serve nothing by default until attested (consistent with the WP-37 direction).
6. Provenance: no publisher PDFs, no copied abstracts, no reproduced figures from the OpenEvidence docx files (their embedded figures are publisher property); worksheets authored in-house only (B0 governance).

## 6. OpenEvidence therapy-corpus incorporation decisions (extends INCORPORATION_REVIEW)

| File | Decision | Where it went / goes |
|---|---|---|
| Brief Psychotherapeutic Interventions | **Incorporate, consolidated** | Primary source of Module 1 (practice layer). Its Top-15 papers cross-checked against the Reading Room; net-new candidates queued below |
| Family Involvement | **Mine the practical tools** | Family-meeting structure + "listening ≠ disclosing" + NNT-7/50% pearls → Module 1 §6; resident scripts → resident site (verbatim scripts are resident-level) |
| BPD Inpatient Management | **Mine for GPM section** | Admission/don't-admit logic, splitting management, affective-storm ≠ comorbidity pearl, deprescription → Module 1 §5 + BPD page rail |
| Discharge Planning | **Merge** | Feeds Module 1 §7 and the existing discharge tool; no new page |
| Family Meetings Training (milestones/EPAs) | **Defer to resident track** | Residency-level curriculum design; pair with the CBME/EPA review already in the folder |

**Net-new spine candidates surfaced by the OE corpus** (queue via `LM_additions.csv` after verification): Diefenbach 2024 BCBT-Inpatient RCT (the primary trial behind verified keep 39837259) · Stanley 2018 SPI+ (already verified, 29998307) · Linehan 2015 dismantling · Xia 2011 psychoeducation Cochrane · Kleiman 2026 transdiagnostic-redesign viewpoint · Falloon 1982 NEJM.

## 7. Open decisions for Josh

1. **Module 1 home:** `02_Clinical_Skills` (recommended — it's a skills page) vs `07_Evidence_and_Reading`.
2. **Reading Room scope at launch:** all 12 domains, or launch with the 6 strongest (D2, D2b, D3, D5, D6, D11) and add the rest after the §4 re-runs (D7–D10 queries are being refined)?
3. **D10 stays held for Kaitlin** — the Reading Room ships with a visible "CL domain under construction with Dr. Taplinger" line, which doubles as the collaboration signal. (Her verbatim email does not itself offer the CL list — *ask* for it in the reply rather than assuming it's incoming.)
4. Whether the Week-4 case-of-the-week (family meeting case) gets built this block or next.
5. **Approve the Phase 2 worksheet track** (§8) — her verbatim ask included "worksheets," which the current package doesn't deliver.

## 8. Phase 2 — the worksheet track (added 2026-08-20 after Kaitlin's verbatim email)

Her request #5 verbatim: "more info, examples, **worksheets**, etc." Info and examples are delivered above; worksheets become Phase 2, after the integration PR lands. Four original, license-clean worksheets, each mapped to a module section: **Today's One Thing** (BA activity scheduling, patient-facing), **Cool the Body First** (distress-tolerance pocket card, patient-facing), **Before the Family Meeting** (family prep sheet), **My First Week Out** (discharge bridge). Governance riders: authored from scratch — no Linehan/Guilford, Beck Institute, or Stanley–Brown reproduction (the safety-planning tool owns that surface separately); registered via the WP-38 `instrument_provenance.json` extension; patient/family-facing text ~8th-grade reading level; faculty-attested before release. Full spec: `FEEDBACK_IMPACT_Taplinger_Verbatim_2026-08-20.md` §2.

**Sequencing note (same source):** her TUSM course page intends to link to the site — an external cohort arriving cold. WP-37 (attested-only question-bank default) should land as its own small PR before or alongside the therapy PR, and WP-34 (the entry-contract page) is the next AUTHOR-GATED draft Josh should write.
