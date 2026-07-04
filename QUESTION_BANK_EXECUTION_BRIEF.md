# QUESTION_BANK_EXECUTION_BRIEF — mass-producing the Shelf bank

You are drafting exam-style items for `question_bank.json` on the MS3 clerkship site. The
quality bar, item anatomy, the four mechanics, voice, and guardrails live in
**`QUESTION_BANK_STANDARD.md`** — read it completely before drafting anything. Categories,
counts, source pages, and mix rules live in **`QUESTION_BANK_BLUEPRINT.md`**; the machine shape
is **`question_bank.schema.json`**. This brief is the work order.

## Ground rules (violating any of these voids the work)

1. **Branch discipline.** Work on a new branch off `origin/main` (`git fetch origin` first),
   e.g. `content/question-bank-wave-1`. Commit there. **Never merge, never push** — pushing
   `main` deploys the live site. Leave other branches and any dirty files in other checkouts
   alone.
2. **Additive to one file.** You edit **only** `question_bank.json` (repo root). Never edit
   page markdown, `topic_meta.json`, `build_deploy.py`, the SPA, tools, or schema/standard
   docs. If a page contains an error, note it in your handoff — do not fix it.
3. **Never touch `13_Faculty_Resources/reviewed.json`.** Every item you write carries
   `"status": "draft"` — you never write `"attested"`, and you keep the file-top `_note` intact.
   Attestation happens later, by Dr. Moss, in his own tooling.
4. **ORIGINAL items only.** Never reproduce, closely paraphrase, or reconstruct-from-memory any
   NBME, NBOME/COMAT, USMLE, UWorld, Amboss, or other real exam or commercial-bank item —
   copyright and exam security. Every item is derived fresh from a library page you just read.
   If a drafted item feels remembered rather than derived, delete it and re-derive from the page.
5. **Ground every item in the page text.** Read every file in the item's `pages` in full before
   drafting (source paths: the `md[]` map in
   `13_Faculty_Resources/_automation/site_build/build_deploy.py`). No claim, number, dose,
   cutoff, or citation the page does not state — the `evidence` field quotes the page's own
   anchor. Fictional composites only; no PHI.
6. **Validate before every commit:**
   - `python3 -c "import json; json.load(open('question_bank.json'))"`
   - the structural self-check below, applied to every new item;
   - `question_bank.schema.json` is the shape contract — if `python3 -c "import jsonschema"`
     succeeds in your environment, validate against it; if the module is absent, the manual
     checklist stands in.
   - Do **not** run or modify the site build — the bank is not wired into it yet, and wiring it
     is not your job.

## Per-item procedure

1. Take the next open slot from the wave plan below (category + any competency/type quota
   still unfilled).
2. Read the source page(s) completely. Choose the page's central discrimination — the thing the
   page exists to teach — or, for later items in a category, a secondary discrimination the page
   states explicitly.
3. Draft the stem as a vignette (standard §2): age, setting, timeline, findings; positive
   lead-in; answerable with the options covered.
4. Draft four options, keys `A`–`D`, exactly one `"c": true`. Write the three distractors
   *first* as misconceptions — pick trap names from the vocabulary below (coin a new name only
   for a real, recurring error), each with a one-line dispatching `note`.
5. Write `why` (dispatch traps by name, then the discriminator), `pearl` (prefer the page's own
   pearl), `evidence` (the page's stated anchor), `link` (one deep link: the source page or its
   paired tool), and tags (`category`, `competency`, `difficulty`).
6. If the slot calls for `two-tier`: write `tier2` with 3–4 competing rationales — the correct
   one is the mechanism as the page states it; strong distractor rationales mirror the tier-1
   traps. If `relational`: set `subtype`, options are homogeneous utterances or actions, and the
   correct option must trace to an explicit phrase or principle on the page.
7. Self-check (below), append to `question_bank.json` (2-space indent, real UTF-8 — em dashes
   literal), validate, and commit in batches of ~8 with message
   `content: question_bank wave N batch M — <categories> (pending attestation)`.

## Self-check — every item, before it is committed

- [ ] Stem is a vignette with a positive lead-in; answerable from stem alone (relational:
      the *function* of the best response is pre-statable).
- [ ] Exactly 4 options, keys A–D, exactly one `"c": true`; homogeneous, parallel, no
      absolutes, no all/none-of-the-above; correct option not the longest.
- [ ] Every wrong option has `trap.name` + `trap.note`; every trap is something a real MS3
      would pick.
- [ ] One defensible best answer *for a reason the page states*; if a second option is
      defensible, fix or kill the item.
- [ ] `why` names the traps and states the discriminator; `pearl` is one keepable line;
      `evidence` is the page's own anchor, no outside citations, no new numbers.
- [ ] `pages` includes ≥1 slug from the item's blueprint category; `id` prefix matches the
      category; `status` is `"draft"`.
- [ ] Two-tier: `tier2` present, rationales compete, correct rationale is page-stated.
      Relational: `subtype` set; options homogeneous; correct option traces to a page phrase.
- [ ] Safety content: correct answer is the conservative, supervision-seeking option; the
      student never independently discharges, clears, or prescribes.
- [ ] Batch-level: correct keys balanced A–D; difficulty tracking ~25/55/20; `hy` ≤ ⅓;
      type quotas (two-tier, relational) on pace per the blueprint's mix rules.
- [ ] The item resembles no real exam question you have ever seen. When in doubt, re-derive.

## Target set — 144 items in 6 waves

Counts and source pages per category: the table in `QUESTION_BANK_BLUEPRINT.md` is authoritative.
Wave contract:

| Wave | Scope | Items | Gate |
|---|---|---|---|
| 1 | 2 per category (24) — include ≥3 two-tier, ≥3 relational, one level-3 | 24 | **stop; faculty spot-check before Wave 2** |
| 2 | `neurocog` (+14) + `safety` (+10) | 24 | |
| 3 | `substance` (+12) + `pharm` (+14) | 26 | |
| 4 | `mood` (+14) + `psychosis` (+12) | 26 | |
| 5 | `anxiety` (+10) + `ethics` (+6) + `personality` (+4) + `childdev` (+4) | 24 | |
| 6 | `relational` (+10) + `otherdx` (+10); then audit the whole bank against the blueprint's cross-cutting mix rules and fill any gaps flagged | 20 | final handoff |

The three reference exemplars (`qb_sud_001`, `qb_rel_001`, `qb_cog_001`) count toward
`substance`, `relational`, and `neurocog` totals respectively. Maintain a running tally per
category × competency × type × difficulty in your handoff notes — the Wave 6 audit reconciles
it against the blueprint.

## Trap vocabulary (seed — extensible, never diluted)

Reuse these names verbatim where they fit; the aggregate "you fell for X n times" analytics
depend on consistent naming. Seeded from the shelf guide's Exam Traps table and the topic pages.

| Trap name | Better thinking (the note, roughly) |
|---|---|
| Denies SI = low risk | Ask about acute factors, means, preparatory behavior, collateral |
| Sudden improvement = recovery | Unexplained brightening after severe suicidality is an escalation trigger |
| Safety plan = discharge permission slip | A safety plan is one component of the risk plan, not clearance |
| Face-value reassurance | Family support is data, not a substitute for risk reasoning |
| Quoting statistics at families | Numbers explain the why; recited at families they become an argument |
| Making the family responsible | Understand what support is realistic — don't hand the family the treatment |
| The righting reflex | Arguing for change produces sustain talk — reflect, don't push |
| Psychosis = schizophrenia | Check mood episodes, substances, medications, delirium, medical causes |
| Confused elder = dementia | Hours-to-days onset with fluctuation is delirium until proven otherwise |
| Hypoactive delirium labeled depression | Flat and quiet with inattention that fluctuates is delirium, not MDD |
| Quiet patient = stable patient | Hypoactive delirium is missed precisely because no one is alarmed |
| Agitation = antipsychotic | Consider delirium, withdrawal, pain, akathisia, trauma first |
| The reflexive benzodiazepine | Benzos treat alcohol/sedative withdrawal — elsewhere they deepen delirium and add falls |
| Refusal = no capacity | Capacity is four decision-specific abilities, assessed — not inferred from disagreement |
| It's just withdrawal | New confusion in substance use gets a real differential — Wernicke, trauma, infection, hepatic |
| Comfort-first induction | Buprenorphine waits for objective withdrawal (COWS ~8–12), not for the request |
| Not lethal = not treatable | Opioid withdrawal is rarely fatal but untreated it drives AMA discharge into peak overdose risk |
| Prescribe before deprescribe | In older patients the drug list is often the diagnosis — subtract first |
| Newer = better | Choose antipsychotics by side-effect profile (CATIE), not recency |
| Treat the number, not the patient | Monitoring parameters guide, they don't replace, the clinical exam |

## End-of-run handoff (every wave)

1. Items drafted: ids, category × competency × type × difficulty tally vs blueprint targets.
2. Correct-key distribution for the wave.
3. Anything you were tempted to write but couldn't source to a page (faculty-review input).
4. Any page errors noticed (for faculty, not for fixing).
5. New trap names coined, with justification.
6. Confirmation: JSON valid; `reviewed.json` untouched; no push, no merge.
