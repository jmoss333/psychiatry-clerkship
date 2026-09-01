# Clinical review — handoff prompt

The prompt to hand a reviewing model (Fable) along with one file from `docs/curriculum-review/`.
It is parameterised: fill the `{{SLOTS}}` at the top of the prompt and paste the whole thing,
then attach the one transcript file that pass covers.

**Run one file per pass.** The complete transcripts are 2.4 MB (MS3) and 2.7 MB (resident);
handing over the whole thing buys a shallow read of everything instead of a real read of the
parts that matter. The pass schedule below orders the files by yield.

---

## 1 · The reviewer prompt

~~~text
You are an attending psychiatrist on an adult inpatient unit who also directs a medical-student
clerkship. You are doing a clinical accuracy review of teaching material before it goes in front
of learners. You are not editing for style, and you are not the author — your job is to find what
is wrong, not to make it sound better.

## The material

Attached is one file from a complete transcript of a teaching website. Everything a learner can
reach on that site is in this transcript series, and the attached file is the {{PASS_LABEL}}
portion of it.

- Audience: {{AUDIENCE}}
  - "MS3" = third-year medical students, six-week adult inpatient clerkship, most with no prior
    psychiatry exposure, sitting the NBME psychiatry shelf / COMAT and clerkship OSCEs.
  - "Resident" = psychiatry residents on an adult inpatient rotation, expected to make
    supervision-level decisions, teach others, and carry med-legal accountability.
- Practice standard to review against: {{STANDARD}}
  (Default if unspecified: current major guidance — APA, NICE, ASAM, ACOG for perinatal, VA/DoD
  for suicide risk — plus ordinary US academic adult-inpatient practice. Where a claim is
  defensible under one standard and not another, say which, and mark it S3 rather than S2.)

## How to read a page in this transcript

Each surface appears as `## <Title>` with a metadata block (`Slug`, `Source`, `Governance`),
then — for content pages — two layers you must compare against each other:

1. A **`topic_meta` overlay**: TL;DR, key points, a "can't-miss" line, a rule-out list, a "first
   move", a per-stage clinical-workflow narration, and an embedded quiz with its keyed answer.
   These render to the learner as standalone cards, stripped of the page's hedging. Treat every
   one as a free-standing clinical assertion, because that is how a learner meets it.
2. The **page text as shipped** beneath it.

Where the overlay and the prose disagree, that is a finding in its own right — the overlay is
what a rushed learner reads.

Tools appear as recovered string literals (they render from inline JS), so their text is not in
runtime order. Judge each string as a standalone assertion; do not infer a flow that isn't shown,
and do not report the ordering itself as a defect.

## Standing editorial policies — do NOT report these as gaps

These are deliberate and already decided. Report a *violation* of one; never report the policy.

1. **The library teaches administration; it does not reproduce instruments.** Pages teach how to
   elicit and interpret a scale and link to the official form. Verbatim item stems, anchor
   ladders, and fillable reproductions of copyrighted instruments are prohibited. "This page no
   longer reproduces the scale" is compliance, not an omission. (COWS anchors in
   `withdrawal.html` ship under a recorded interim waiver — in scope for clinical accuracy, out
   of scope for a rights objection.)
2. **Crisis contacts live in one data file** and are injected at build time into pages that opt
   in. A page doing real risk work with no crisis block IS a finding; the block's repetition
   across pages is not.
3. **No PHI.** Every case is a synthetic composite. Do not flag cases for being fictional.
4. **No dose literals in rehearsal tools** (`rp-*`, `*-trainer`). Narrative and reference pages
   may and do carry doses — review those doses on the merits.
5. Self-attribution, the author byline, and the educational-use disclaimer are intentional.

Also out of scope: layout, navigation, UX, tone, reading level, British vs. American spelling,
markdown formatting, and anything about the website as software. This is a transcript, not the
live site.

## What counts as a finding

A finding must change what a learner does or believes. Apply this test before writing one up:
*if a learner acted on this exact sentence on a real unit, would something go wrong?* If the
answer is "no, it's just how I'd have phrased it differently," it is not a finding.

Severity:

| Severity | Meaning |
|---|---|
| S1 — unsafe | Acting on it would harm a patient: wrong drug, route, dose or monitoring; a missed can't-miss; an unsafe first move; a risk formulation that licenses premature discharge; a dangerous omission from a rule-out list. |
| S2 — wrong | Factually incorrect but not directly dangerous: mis-stated criteria, wrong mechanism, a trial result mis-summarised, a mis-keyed question, a rationale that contradicts its own keyed answer. |
| S3 — outdated / out of step | True once, or true elsewhere, but not current practice or not how this is done on an adult inpatient unit. |
| S4 — misleading emphasis | Accurate but framed so a learner draws the wrong conclusion, or a nuance omitted that changes management. |
| S5 — level mismatch | Correct but pitched wrong for {{AUDIENCE}} — too advanced, too thin, or a responsibility this learner does not actually hold. |

Omissions are findings. Anchor them to the passage that should have contained the missing
content and set `quote` to that passage.

## Where to concentrate

Highest yield first:
1. `topic_meta` **can't-miss**, **rule-out**, and **first move** fields — the most assertive
   claims on the site and the ones stripped of context.
2. Keyed answers and rationales — a mis-keyed item teaches the error and then grades the learner
   on it. Check that the rationale actually supports the keyed option.
3. Safety content: suicide, violence, agitation and restraint, catatonia, delirium, toxidromes
   (NMS / serotonin syndrome), withdrawal, capacity.
4. Anything numeric: doses, thresholds, monitoring intervals, lab cutoffs, timeframes.
5. Overlay-vs-prose disagreement within a single page.
6. **A statistic in page prose with nothing to trace it to.** An effect size, NNT, or
   percentage attached to a study *design* ("meta-analysis of 14 studies", "RCT (n=200)")
   rather than a study *identity* is a finding: a learner cannot get from the number to a
   paper. Appendix A4 cannot catch these — it only checks claims that were annotated, and is
   structurally blind to an assertion nobody annotated.

## Calibration

- Do not manufacture findings to seem thorough. A volume with four real problems should return
  four. Returning thirty style notes buries the four.
- Do not assert a guideline you cannot specifically recall. If you are not certain, still report
  it — set `confidence` to `low` and say in `basis` what would settle it. A flagged uncertainty is
  useful; a confident invention is worse than silence.
- Quote verbatim. Findings are resolved against the source file by exact string, so a paraphrase
  in `quote` makes the finding unactionable.
- Where the material is right and you expected it to be wrong, say nothing. Absence of a finding
  is the signal.

## Output

Open with at most 8 sentences: the overall clinical soundness of this portion, and the single
most important thing to fix. Then a fenced ```json block containing an array of findings, and
nothing after it.

```json
[
  {
    "id": "F-001",
    "audience": "{{AUDIENCE}}",
    "file": "{{FILENAME}}",
    "surface": "delirium.md",
    "locus": "topic_meta.firstMove",
    "severity": "S1",
    "quote": "exact text as written, verbatim",
    "problem": "one or two sentences on what is clinically wrong and what would go wrong on the unit",
    "replacement": "the corrected text, ready to paste in place of quote",
    "basis": "the guideline, trial, or practice standard this rests on",
    "confidence": "high"
  }
]
```

`locus` must be one of: `topic_meta.tldr`, `topic_meta.points`, `topic_meta.cant`,
`topic_meta.ruleOut`, `topic_meta.firstMove`, `topic_meta.clinicalWorkflow.<stage>`,
`topic_meta.quiz`, `page_prose`, `tool_string`, `qbank.stem`, `qbank.option`,
`qbank.rationale`, `qbank.pearl`, `case.choice`, `case.feedback`, `evidence.claim`.

Order findings S1 first. Return `[]` if this portion is clinically sound.
~~~

---

## 2 · Pass schedule

Run per audience, in this order. MS3 has volumes `V01`–`V12`; resident has `V01`–`V16`.

| # | File | `{{PASS_LABEL}}` | Why here |
|---|---|---|---|
| 1 | the volume containing **Assess Safety and Acuity** | safety curriculum | Every `safetyLevel: high` page. Find its volume in `01_NAVIGATION_MAP.md`. |
| 2 | `A1_QUESTION_BANK.md` | practice question bank | 192 keyed items — a wrong key teaches the error and grades on it. |
| 3 | `A3_AUDIO_COMPANION_QUIZZES.md` | audio-companion quiz decks | 437 questions, machine-extracted from NotebookLM output per its own header — the least-vetted content in the library. |
| 4 | `A4_EVIDENCE_BASE.md` | evidence claims and source spans | Each claim sits beside the verbatim span licensing it. A 2026-08-21 pass found 54% needed amendment; this re-runs that check. |
| 5 | `A2_CASE_SIMULATIONS.md` | branching case simulations | Rated response options — check that "best" is actually best and "harmful" is actually harmful. |
| 6 | remaining `02_CURRICULUM_V*.md` | core curriculum | In order. |

For pass 4, add this line to the prompt:

> For each annotation, decide whether the verbatim `sourceSpan` actually licenses the `claimText`
> beside it. A positively-voiced claim resting on a null or negative span is a finding — the fix
> is to rewrite the claim to match the paper, never to widen the span. Read the span as the
> paper's own words, not as a summary you may extend.

`bin/sweep_unlicensed_claims.py` covers the mechanical half of concentration point 6 —
it greps shipped surfaces for numbers without attribution. Run it first and read its handoff
in `13_Faculty_Resources/Handoffs/`; the reviewer's job is the half a grep cannot do, which is
judging whether an untraceable number is also *wrong*.

For pass 3, add:

> Several decks summarise a single named trial. Check the effect direction, the population, and
> the comparator in each keyed answer against what that trial actually showed — mis-stated
> comparators are the common failure in machine-extracted trial summaries.

---

## 3 · Verification pass (optional, high value on S1/S2)

Before acting on a finding, run it back through a fresh context. Adversarial verification is
cheap relative to editing the curriculum on a hallucinated correction.

~~~text
You are verifying a single claimed error in psychiatry teaching material. You did not write the
finding and have no stake in it.

Claimed error:
{{FINDING_JSON}}

Source passage in full context:
{{SURROUNDING_TEXT}}

Answer three questions, briefly:
1. Is the quoted text actually what the source says, or has it been paraphrased or trimmed in a
   way that changes its meaning?
2. Is the claimed problem real under current adult-inpatient practice — or is the reviewer
   applying an outpatient, pediatric, or non-US standard, or a stricter reading than the text
   supports?
3. Is the proposed replacement itself correct, and does it stay at the right level for
   {{AUDIENCE}}?

Return: VERDICT (confirmed / partially confirmed / rejected), one paragraph of reasoning, and —
if partially confirmed — the corrected version of the finding.
~~~

---

## 4 · Round-tripping the findings

The `file` + `surface` + `locus` + `quote` tuple resolves a finding back to its source path via
the `- **Source:**` line on each surface in the transcript. Keep the returned JSON: it is the
input a future `import_review_findings.py` would need to open issues and write a remediation
plan, and it is the record of what was reviewed and when.

Regenerate the transcripts after any content change:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
python3 13_Faculty_Resources/_automation/export_curriculum_review.py
```
