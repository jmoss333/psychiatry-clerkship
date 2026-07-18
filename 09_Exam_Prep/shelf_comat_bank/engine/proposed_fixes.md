# Proposed item-writing fixes (drop-in; not yet applied to the batch)

These are the two `revise`-class fixes from the 2026-07-13 audit. Clinical content is unchanged;
these remove structural cues. **Not applied to `04_pilot_batch_01.json`** — apply during the faculty
editing pass, then re-run `qbank_validate.py` (the longest-answer/coaching flags should clear or drop).

---

## qbx_rel_001 — remove answer-telegraphing coaching from the stem

**Problem:** the stem embeds coaching that hands the examinee the correct option's function.

**Current stem (offending sentence in *italics*):**
> You are meeting with the mother of a 19-year-old man recently hospitalized for depression with
> suicidal ideation. She is tearful and says, 'I don't know how to keep him safe at home — am I
> supposed to watch him every second?' The team has recommended securing medications and removing
> firearm access. *Before uncovering the options, consider the function of the best reply: it should
> validate her fear and then translate 'keep him safe' into a concrete, verifiable means-safety step
> she can actually do.* Which of the following responses is best?

**Proposed stem (coaching removed; lead-in unchanged):**
> You are meeting with the mother of a 19-year-old man recently hospitalized for depression with
> suicidal ideation. She is tearful and says, 'I don't know how to keep him safe at home — am I
> supposed to watch him every second?' The team has recommended securing medications and removing
> firearm access. Which of the following responses is best?

The teaching point ("validate, then operationalize means safety") stays where it belongs — in `why`,
`complete_correct_answer_explanation`, and `key_takeaway` — not in the stem.

---

## qbx_pha_002 — negative lead-in (style call for faculty)

**Problem:** NBME item-writing discourages negative lead-ins. Current:
> "Which of the following agents is most important to **avoid** given his risk profile?"

**Option 1 — keep, accept as a recognized minority format** (clinically clear; flag `style-negative`).

**Option 2 — convert to a positive "best next step" stem** (preferred by the guide). Reframe so the
key is a chosen agent rather than an avoided one, e.g.:
> "…Which of the following maintenance antipsychotics is most appropriate given his metabolic risk
> profile?" — with the key becoming a metabolically favorable agent (aripiprazole/ziprasidone/
> lurasidone) and olanzapine demoted to a distractor. This inverts the option set and requires
> rewriting all four distractor explanations, so it is left as a faculty decision rather than
> auto-applied.

Recommendation: Option 2 if the editing budget allows; otherwise Option 1 with the `style-negative`
flag recorded.
