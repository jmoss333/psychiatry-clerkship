DRAFT — NOT APPROVED. `CLERKSHIP_PREPOST` stays `off` until the owner approves the design and an
ethics determination is on file (see `evaluation_protocol_draft.md` §4 and
`irb_qi_determination_request_draft.md`). The on-screen consent wording is a placeholder.

# Pre/post knowledge check: scaffold

**What it is.** The interim form of the protocol's Phase B (§4.3): an opt-in, local-only pair of
12-item checks, one at the start and one at the end of the rotation, built from **existing
faculty-attested question-bank items**. It writes no new clinical content and changes no item.

## Off by default, and what "off" means

`CLERKSHIP_PREPOST=off|on`, default `off`. An off build:

- expands the shell's `/*__FD_PREPOST__*/` marker to nothing, so the two `typeof`-guarded hooks in
  `spa_index.html` (Progress section, click handler) do nothing;
- writes no `prepost_forms.json`;
- aborts if either is present anyway (`build_deploy.py`).

## Forms

`qbank_public.prepost_forms()`: forms A and B, one item per blueprint category each (12 + 12),
single-best-answer items with four options, drawn from the attested projection, **disjoint from each
other and from the 12 placement items**. Ranking reuses the placement rule (closest to difficulty 2,
then high-yield, then id). The first- and second-ranked items alternate between forms by category
so neither form is systematically easier. Explanations and pearls are not shipped; the check shows
no feedback. `verify_publication()` checks the file against the projection whenever it ships.

## Learner flow

Progress → "Knowledge check · optional · draft" → information screen → consent → start check
(Day 1–3) → end check (last week) → optional export. A random code (`PP-` + 6 characters, no
look-alike letters) is generated on consent. Its last character sets the order (A→B or B→A). A
learner switching devices can re-enter the code so the custodian can pair the two files. "Stop and
delete" wipes the local record.

## What the export holds

`schema`, `status`, `code`, `order`, `restored`, and for each sitting: `form`, `on` (date only),
`n`, `score`, and per item `{id, cat, a}` where `a` is 1, 0 or null. No name, email, free text,
timestamp or device data. Nothing is transmitted. The only network call is the same-origin GET of
the forms file.

## Known limits (do not report a knowledge-gain claim without reading these)

1. **Exposure:** the items stay in the practice pool. Holding them out needs a question-bank
   decision and is out of scope here.
2. **12 items per form:** fine for group-level change, too few for any individual inference.
3. **Form equivalence is assumed, not shown:** the matching is on authored difficulty. Item
   statistics from the first cohorts should confirm it before any comparison is reported.
4. **Self-selected volunteers:** opt-in means the sample is not the cohort.
