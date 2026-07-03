# TOPIC_META_RUBRIC — the gold standard for `topic_meta.json` entries

> **Status:** AI-drafted rubric, pending faculty attestation. Every entry produced under this
> rubric is itself AI-drafted and **pending Dr. Moss's review/attestation** — see §8.
> Companion file: `TOPIC_META_EXECUTION_BRIEF.md` (steps + target list for the drafting model).

`topic_meta.json` (repo root) holds the structured "topic template" the SPA renders **above the
prose** of a page: read-time chip, ★ High-yield chip, "In 30 seconds" summary, "Can't miss"
callout, "Rule out first → first move" mini-tree, a one-question "Test yourself" quiz, and a CTA
link. The entry is the 30-second version of the page for a tired MS3 between rounds. It must be
**derivable from the page text alone** — the meta summarizes the page; it never extends it.

---

## 1. How the SPA renders each field (hard constraints)

These come from `buildTpl()` in `13_Faculty_Resources/_automation/site_build/spa_index.html`.
Violating them produces silently-broken UI, so they are rules, not suggestions:

| Field | Renders as | Hard constraint |
|---|---|---|
| `read` | chip "N min read" | integer minutes |
| `hy` | chip "★ High-yield" | boolean; omit rather than `false` |
| `tldr` | "In 30 seconds" lead | **`points[]` render only if `tldr` exists** |
| `points[]` | bullets under the tldr | invisible without `tldr` |
| `cant` | "⚠ Can't miss." callout | — |
| `ruleOut[]` | chip row "Rule out first → first move" (links to Decision Aids) | — |
| `firstMove` | "First move ·" line | **renders only inside the `ruleOut` block — never emit `firstMove` without `ruleOut`** |
| `quiz` | "Test yourself" one-question widget | **any entry with a `quiz` joins the "X of Y reviewed" progress denominator and seeds a spaced-repetition card** — quiz inclusion is a curation decision (§2), not completeness |
| `cta` | button link, opens in new tab | needs `href`; `label` defaults to "Open tool" |

All strings are HTML-escaped on render: **plain text only — no markdown, no HTML, no `**bold**`**.
Em dashes (—), arrows (→), and straight quotes are fine and are house style.

Key = the **deployed filename** (e.g. `t_geri.md`), exactly as it appears in the `md[]` map in
`build_deploy.py` — not the source path. Canonical field order within an entry:
`read, hy, tldr, points, cant, ruleOut, firstMove, quiz, cta`.

## 2. Page archetypes — which fields each page gets

Not every page is a "topic." Fit the schema to the page, never the reverse.

| Archetype | Pages like | Fields |
|---|---|---|
| **A — clinical topic** | `t_*`, delirium, catatonia, nutrition | Full schema. `ruleOut` + `firstMove` whenever the page has a real differential; omit both if it doesn't. |
| **B — clinical skill / how-to** | pocket guides, MI, brief psychotherapy, documentation, family meeting | `read, tldr, points, cant, quiz, cta`. **No `ruleOut`/`firstMove`** — there is no differential; a quiz that tests *applying* the skill is expected. |
| **C — resource / navigation** | week pages, reading lists, book/podcast libraries, welcome, OSCE/cases hubs | `read, tldr, points, cta` only. **No quiz** — resource pages must not enter the reviewed-progress denominator or the spaced-repetition deck; those belong to clinical content. No `cant` unless the page states a genuine warning. |

Safety-critical pages (suicide risk, violence, withdrawal) are archetype A or B with the bar in
§7 raised further: every claim must be conservative, escalation-biased, and traceable.

## 3. Field-by-field: what excellent looks like

### `read` (int)
Word count ÷ ~200, rounded to the nearest minute, floor 3, ceiling 8. Honest, not aspirational.

### `hy` (bool)
Reserve ★ for pages that are disproportionately shelf/COMAT-tested **or** safety-critical.
Target ≤ ⅓ of all entries — if everything is high-yield, nothing is. Omit the key entirely when
not earned (house data has no `"hy": false`).

### `tldr` (string, 1 sentence, ~20–40 words)
The page's "In one line" compressed into an actionable instruction — what to *do and decide*,
not what the page "covers." Verb-first or claim-first; em-dash clauses in house voice.

- **Strong:** "Sort delirium vs dementia vs depression, rule out the reversible causes, and name
  the subtype — because subtype decides what you prescribe and what you must not."
- **Weak:** "This page covers the major neurocognitive disorders and their management." (describes
  the page, commands nothing, no clinical tension)

### `points[]` (exactly 3 strings, each ≤ ~25 words)
The three things worth remembering at 2 a.m. Each point = one complete, self-standing clinical
sentence that survives out of context. Prefer discriminators ("inattention is the fingerprint of
delirium") over topic labels ("delirium is important"). No overlap with `cant` — the fourth-best
point is what `cant` is for.

- **Strong:** "Refeeding syndrome — start low, go slow, watch phosphate, give thiamine."
- **Weak:** "Eating disorders have serious medical complications." (true, unactionable, teaches nothing)

### `cant` (string, 1 sentence)
The single failure that hurts a patient or fails an exam — the thing the attending assumes you
know. Frame as the mistake plus the protection, not a fact.

- **Strong:** "In older inpatients, benzodiazepines and diphenhydramine cause falls and delirium — avoid them."
- **Weak:** "Delirium is dangerous." (no behavior to change)

### `ruleOut[]` (3–5 short chips, archetype A only)
The genuine can't-miss differential **as the page states it**, ordered dangerous-first. Chip
grammar: 2–5 words, optionally a parenthetical cue — "Restless legs (check ferritin)". Not a
symptom list, not a table of contents.

### `firstMove` (string, 1 sentence — only ever alongside `ruleOut`)
The concrete opening play a student can actually execute on the unit: assessment + first
management step. "Test attention formally, get collateral for baseline, review every med against
Beers — then treat what's reversible." Never "consider a broad workup."

### `quiz` — the single-best-answer standard
One question, exactly 4 options, exactly one `"c": true`.

- **Stem:** a 1–3 sentence clinical vignette that forces the page's central discrimination — the
  shelf pattern ("best next step?", "most likely explanation?"), answerable without reading the
  options. Never recall trivia ("Which scale assesses…?").
- **Distractors that teach:** each wrong option is a *named misconception* a real MS3 holds — the
  righting reflex, the reflexive benzodiazepine, the premature label. A distractor that no one
  would pick is a wasted slot. All four options parallel in grammar and length; no "all/none of
  the above"; no option comically wrong.
- **`why`:** 1–2 sentences that state the discriminator **and** dispatch the tempting
  distractors by name — it is the teaching payload, not a restatement of the answer.
- Rotate the position of the correct option across entries (house data skews toward first —
  do not make it a tell).

**Strong quiz** (pattern): "A patient with 'treatment-resistant' depression snores, is obese, and
is sleepy all day. Best next step?" → evaluate for OSA / add a third antidepressant / nightly
diphenhydramine / long-acting benzodiazepine. Every distractor is a real bad habit, and the `why`
explains why OSA reframes the "resistance."
**Weak quiz:** "Which of the following is true about sleep disorders?" — no vignette, no
decision, distractors interchangeable.

### `cta` (object `{label, href}`)
One high-value next hop that continues the learning path — the page's own "Pair with" links are
the menu. `href` forms: `?page=<slug>.md` (another page) or `tools/<name>.html` (a tool). Label
is imperative and specific: "Open the Delirium page", never "Click here". One CTA, not a link farm.

## 4. Voice and reading level

Write like the pages: direct second-person clinical coaching for an MS3 — plain English first,
term-of-art in parentheses on first use ("depression masquerading as cognitive impairment
(pseudodementia)"). Sentences a tired student parses on one read. Em-dash rhythm, verb-first
imperatives, no hedging filler ("it is important to note"), no bureaucratic voice, and no drama —
the content is serious enough.

## 5. Clinical-accuracy guardrails (non-negotiable)

1. **Every clinical claim must be traceable to the page text.** The meta is a compression, not a
   second source. If the page doesn't say it, the entry doesn't say it — even if it is true.
2. **No new numbers.** No doses, scale cutoffs, percentages, or durations that the page itself
   does not state. Vignette dressing (ages, day counts) is fine; clinical parameters are not.
3. **No legal or procedural absolutes the page hedges.** If the page says "varies by state,"
   the entry may not say "must." Prefer "escalate / involve the team" over legal instruction.
4. **Escalation bias on safety content.** For suicide, violence, withdrawal, capacity: when in
   doubt the correct quiz answer is the conservative, supervision-seeking option.
5. **Students act under supervision.** Correct answers never have the student independently
   discharge, clear, or prescribe.
6. **Fictional composites only, no PHI** — vignettes are invented, never drawn from real cases.
7. Flag anything you were tempted to add but couldn't source to the page in your handoff notes —
   that list is faculty-review input, not an invitation to include it.

## 6. Worked strong-vs-weak example (one entry, annotated)

For `t_geri.md` (full entry lives in `topic_meta.json` as a reference exemplar):

- `tldr` **strong** because it compresses the page's one-line ("separate reversible from
  irreversible… avoid iatrogenic harm") into commands and keeps the memorable coinage "the drug
  list is often the diagnosis." A weak version would be "An overview of geriatric psychiatry."
- `quiz` **strong** because the vignette (effortful "I don't know", giving up, mood context)
  forces the delirium/dementia/pseudodementia discrimination that is the page's spine, and each
  distractor is a real reflex (start a cholinesterase inhibitor; hunt a UTI; call it aging).
  Note it says "a structured cognitive screen is mildly impaired" — **not** an invented MoCA
  score, because the page names no instrument or cutoff (§5.2).
- `ruleOut` **strong** because it is dangerous-first (delirium, meds, infection) and lifts the
  page's own list rather than a textbook's.

## 7. Safety-critical pages — the raised bar

`pg_suicide.md` (exemplar in `topic_meta.json`) shows the pattern: `ruleOut`/`firstMove` omitted
because a safety card has escalation triggers, not a differential — do not force differential
furniture onto safety content. The quiz's correct answer is the reassess-and-escalate option; the
distractors are the three real failure modes (face-value reassurance, safety plan as discharge
permission slip, not asking). `cant` carries the page's sharpest warning (sudden unexplained
improvement is a warning sign, not progress).

## 8. Attestation and process guardrails

- Every entry is **AI-drafted, pending faculty attestation**. The `_note` at the top of
  `topic_meta.json` declares this for the whole file; keep it intact.
- **Never touch `13_Faculty_Resources/reviewed.json`** — attestation is Dr. Moss clicking
  Review & Attest, never a drafted artifact.
- **Never edit the page markdown** while drafting meta. Meta work is additive to
  `topic_meta.json` only. If you find a page error, note it in the handoff — don't fix it.
- Work on a branch; commit; **no merge, no push** — merging to `main` deploys the live site.
- Validate before committing: `python3 -c "import json; json.load(open('topic_meta.json'))"`
  and run the build (`OUT_DIR=_build/ms3 python3
  13_Faculty_Resources/_automation/site_build/build_deploy.py`) — it must complete with
  `missing: []`.

## 9. Reference exemplars

Three entries in `topic_meta.json` are the standard to imitate, one per archetype:

| Entry | Archetype | Why it's the reference |
|---|---|---|
| `t_geri.md` | A — clinical topic | full schema; differential-driven quiz; §6 annotation |
| `motivational_interviewing.md` | B — skill | no ruleOut/firstMove; quiz tests *doing* the skill (righting-reflex distractors) |
| `pg_suicide.md` | A/B — safety-critical | escalation-biased quiz; differential furniture correctly omitted |

Also strong (from the restore wave): `t_sleep.md` (quiz + why), `t_neurocog.md`, `delirium.md`.
