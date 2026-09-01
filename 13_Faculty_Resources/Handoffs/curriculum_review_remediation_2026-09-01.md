# Handoff — apply the 2026-09-01 clinical-review findings

**To:** the remediation session (Opus)
**From:** the review session (PR #448, branch `claude/curriculum-review-h0l55w`)
**Inputs:** `docs/curriculum-review/findings/` — read `REVIEW_REPORT.md` first, then work from
`findings.json`. Raw pass output and verifier verdicts are under `findings/raw/` if a finding's
provenance needs checking.

## What you are holding

A completed clinical-accuracy review of everything both sites ship (MS3 + resident), executed
per `docs/curriculum-review/REVIEW_PROMPT.md` against the 2026-09-01 transcripts (build
`455ee87`). **164 findings: 8 S1 · 76 S2 · 10 S3 · 68 S4 · 2 S5.** Every S1/S2 was
adversarially re-verified in a fresh context with PubMed abstract checks; 29 of them carry
*corrected* text from that verification, and 7 findings that failed verification live in
`rejected.json`. Each finding has: `file` + `surface` + `locus` + a verbatim `quote` that
resolves exactly once in the transcript, a ready-to-paste `replacement`, `basis`,
`confidence`, and a `verification` block.

## Ground rules — read before the first edit

1. **The verification metadata is binding.**
   - `rejected.json` is a **do-not-apply list**. Each entry records why the page is right and
     the finding was wrong (e.g. Rodolico 2022's OR 0.18 is genuine; Santo 2021's six-fold is
     genuine; the "phantom" 2025 DBT-vs-SSRI RCT is Brodsky et al., AJP 2025). Applying one
     introduces an error the review already caught once.
   - On `verification.verdict: "partially confirmed"` findings, the `replacement` in
     `findings.json` is already the corrected version — use it, not your own re-derivation,
     and read `verification.reasoning` before editing (it often names the exact primary
     source that settled the point).
   - S3–S5 findings were **not** individually re-verified. Treat them as reviewer judgment:
     apply the clear ones, and independently verify any that surprises you (several
     low-confidence ones name in `basis` what would settle them) before editing.
2. **Findings point at transcripts; you fix sources.** `docs/curriculum-review/` is exported
   build output — never edit it by hand. Resolve each finding to its true source via the
   `- **Source:**` line on its surface in the transcript file (or the Source-path column in
   `01_NAVIGATION_MAP.md`). The transcript regenerates from your source fixes (step 6 below).
3. **CLAUDE.md gates that will bite on exactly this work:**
   - Any edit to `topic_meta.json` (every `locus: topic_meta.*` finding) goes through the
     **`topic-meta-author` skill** — no exceptions, even one-field tweaks.
   - Any sentence you write asserting what a paper found needs its verbatim `sourceSpan` in
     `evidence_annotations.json` **in the same change** (`validate_evidence_annotations.py`
     gates it). Several replacements state trial results — budget for span work. Never widen
     a span to fit a claim; rewrite the claim (C5).
   - Crisis contacts live in `crisis_resources.json` only — fixes replace hard-coded 988
     with the `<!-- crisis-block -->` marker mechanism, never with another literal.
   - No dose literals in `rp-*` / `*-trainer` tools. RSAF-F002's corrected splice already
     respects this; don't reintroduce one while applying it.
   - No verbatim instrument text may be added while fixing (e.g., the COWS range correction
     in MS3V08 must not expand anchor text; the interim waiver on `withdrawal.html` is not
     yours to touch).
4. **A red node test silently aborts the build** and leaves `_build/` stale — if a fix isn't
   showing up in a regenerated transcript, run `node --test tests/*.test.mjs` first.

## Locus → source-file map

| locus | Edit this | Notes |
|---|---|---|
| `topic_meta.*` (tldr/points/cant/ruleOut/firstMove/clinicalWorkflow/quiz) | `topic_meta.json` | via topic-meta-author skill; validator enforces invariants schema doesn't |
| `page_prose` | the markdown file on the surface's `- **Source:**` line | audience matters — resident overrides live under `14_Tracks/Resident/` etc. |
| `tool_string` | the single-file HTML tool on the Source line | e.g. `_prototypes/sp-interview/sp-interview.html`, `04_Acute_and_Safety/...` |
| `qbank.*` | `question_bank.json` (root) | items are `status: attested` — run `validate_attestation_consistency.py`; a text change may need re-attestation, flag for author |
| A3 quiz findings (`qbank.*` with deck ids like `AR-35 Q7`) | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json` | resident Canon Quiz variant: `_prototypes/canon-quiz/quizzes.json` |
| `case.choice` / `case.feedback` | `communication_cases.json`, `reasoning_cases.json` / `reasoning_cases_resident.json`, `family_systems_scenarios.json`, `longitudinal_case.json` | pick by the case id in `surface` |
| `evidence.claim` | `evidence_annotations.json` (root) | rewrite claims only; spans stay |

## Work packages, in order

**WP-1 — the eight S1s** (one focused session; five sit together in the resident safety
surfaces). Sources: `agitation.md` resident overlay/topic_meta (RSAF-F001), the
`rp-agitation` pack (RSAF-F002 — use the verifier's restructured `hazardIf` splice), the
resident C-L reference (RSAF-F003, RSAF-F009 — note the corrected magnesium conversion:
2.0 mEq/L ≈ 2.4 mg/dL), resident SS-vs-NMS case (RV11-F001, depot prohibition), MS3 suicide
COTW (MS3V10-F001, firearm-access counselling), `qb_otherdx_009` (A1C2-F001, both the option
and its why-text), delirium reasoning case (A2MS3-F001, add withdrawal to the keyed workup).

**WP-2 — crisis-block scope and plumbing.** Three linked fixes: (a) resident-only markdown
never passes through `crisis_block.inject_markdown` — fix the resident pipeline
(`resident_section.py` / `build_deploy.py`) so markers render on resident pages; (b) replace
the hard-coded 988 in the resident COTW risk pages with markers (RV09-F002's corrected
replacement); (c) adding `t_anxiety.md` and the FRST tool to `_CRISIS_REQUIRED_MD`
(`build_deploy.py:250`) is a **governance decision — propose it in the PR, get the author's
explicit sign-off before merging**; the review recommends both under the "learner is doing
risk work" scope rule.

**WP-3 — citations tell the truth.** The seven wrong DOIs on the landmark page (verifier
supplied PubMed-checked replacements; re-resolve each DOI before pasting, two were
proxy-blocked during review), Q39's inverted Cochrane RR (issue #441), the A3 trial
mis-summaries (13 S2s — every replacement was abstract-checked), the Canon's four wrong
paper-summaries plus its provenance cluster (chatbot artifact in `14_Tracks/Resident/canon_200.md`,
reference dump), and the `evidence_inpatient.md` "82%" two-paper conflation.

**WP-4 — overlay-vs-prose drift** (the perinatal "doubles", clozapine–smoking inversion,
OUD TL;DR naloxone fiction, ECT memory TL;DR, mixed-features advert, etc.). All are
`topic_meta.json` edits → topic-meta-author skill, batched.

**WP-5 — everything else in `findings.json`, file by file,** S2 before S3/S4/S5. The 2 S5s
and several S4s change framing/scope — where a fix changes what a learner is told they may
decide (e.g., the suicide COTW naming a supervisor), keep the replacement as given; it was
written to the audience level.

Small PRs per work package, not one omnibus. Each PR body lists the finding ids it resolves.

## Acceptance loop (per work package, before push)

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_evidence_annotations.py   # if claims touched
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
python3 13_Faculty_Resources/_automation/export_curriculum_review.py
```

Then the mechanical completion check: for each finding id claimed fixed, grep its verbatim
`quote` in the regenerated transcript — **it must be gone or amended**. A quote still present
verbatim means the fix missed the real source (common cause: editing the MS3 source when the
finding's `file` starts with `resident/`, or vice versa — check `audience`, and remember
`audience: "both"` content has ONE shared source). Record the id → commit map in the PR body.

## Branch mechanics

`findings.json` exists only on `claude/curriculum-review-h0l55w` (PR #448, stacked on #447)
until those merge. If they have merged: branch each WP off `main`. If not: branch off
`claude/curriculum-review-h0l55w` and base your PRs on it (they'll retarget to `main`
automatically when it merges). Never commit fixes onto the review branch itself — it is the
record of what was found, not where fixes land.

## Explicitly out of scope (note in PRs, don't do unless asked)

- The exporter defects found during review: A1 `Evidence:` lines char-exploded, and *One
  Patient, Six Weeks* weekly JSON absent from transcripts (its content is **unreviewed** —
  say so anywhere completeness is claimed).
- The Canon reference-list rebuild beyond the four wrong summaries (flagged as its own
  project in the report).
- Anything touching the COWS interim waiver, instrument scope, or `ci.yml`.
- The overlay-vs-prose CI gate idea from the report — separate proposal.

— Review session, 2026-09-01. Full method, ledger, systemic patterns, and the sweep
follow-ups (Xia NNT 5 verified *correct*; perinatal incidence verified correct; Q39
confirmed inverted): `docs/curriculum-review/findings/REVIEW_REPORT.md`.
