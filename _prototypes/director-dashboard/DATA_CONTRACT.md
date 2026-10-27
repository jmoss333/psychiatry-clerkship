# Director dashboard — aggregate-only input contract (v1)

**Status:** prototype contract, not yet satisfied by any producer. The committed
`director-dashboard.fixture.json` is SYNTHETIC (`"_synthetic": true`). Designed for data
minimisation; **compliance review pending** — nothing here is claimed to satisfy FERPA or any
other regime.

The dashboard accepts one JSON document. `DD.validateFeed()` in `director-dashboard.html` enforces
every rule below and **refuses to render anything** if one fails. Field sets are closed: an
unknown field anywhere (for example `student`, `name`, `email`, `learnerId`, `studyCode`) is a
rejection, not a warning.

## Top level

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `_synthetic` | boolean | yes | `true` for mock data. The page's MOCK banner stays on regardless. |
| `_label` | string | no | Human description of the feed. |
| `contractVersion` | `1` | yes | This document. |
| `generatedOn` | `YYYY-MM-DD` | no | Day the export was produced (day, never time). |
| `suppressionThreshold` | integer ≥ 5 | no | Small-cell threshold. Default 5. May be raised; values below 5 are rejected (policy floor). |
| `rotationBlocks` | array | yes | The rotation calendar (below). |
| `counters` | array | yes | The metrics site's records (below). |
| `prepost` | array | no | Per-block pre/post feasibility aggregates (below). |

## `rotationBlocks[]` — the calendar, maintained by the director

`{ "id": "MS3-B1", "site": "ms3", "start": "2026-09-07", "weeks": 6 }`

- `id` short label; `site` `ms3` or `res`; `start` the block's first day; `weeks` 1–16.
- Blocks on one site may not overlap — ISO week → rotation week is ambiguous otherwise (the L8
  design's stated limit). The calendar is never derived from learner data (D-F8-3 recommends a
  committed `rotation_blocks.json` with start dates only).

## `counters[]` — exactly the metrics site's shape

`{ "site": "ms3", "week": "2026-W37", "key": "page:review.html", "n": 12 }`

- Exactly these four fields. `week` is an ISO week (the finest time grain stored anywhere);
  `key` an allowlisted `page:` or `tool:` key; `n` a non-negative integer count of **visits**.
- Keys the panels read: `page:*.md` (reading views), `page:*.html` (tool opens),
  `page:question-bank-practice.html`, `page:review.html`, and the nine draft outcome keys from
  PR #1076 (`tool:qbank:answered-5|10|20`, `tool:qbank:first10-lt50|50to79|80up`,
  `tool:daily-review:graded-1|10|25`). Records outside every rotation block are ignored.
- **Proposed, not emitted by anything:** `tool:qbank:cat:<category>:first10-lt50|50to79|80up`
  for the weak-topics panel. #1076 deliberately sends no category. Adding this family is a new
  allowlist and therefore a decision (it widens what a learner's browser sends, even if only by
  a category label); until then the panel shows "No category counters in this feed" on real data.
- Raw records may carry n < 5 — the metrics store holds them. Suppression happens **at render**
  (here) and, per D-F8-2, should also happen **at source** (the read endpoint returns only
  suppressed aggregates). The renderer never relies on the source having done it.

## `prepost[]` — pooled feasibility only

`{ "block": "MS3-B1", "eligible": 14, "consented": 11, "paired": 9, "facultyHours": 1.5, "privacyIncidents": 0 }`

Produced by the honest broker from the pre/post scaffold (PR #1077), never by a learner site.
Integers except `facultyHours`; `consented ≤ eligible`, `paired ≤ consented`. The dashboard
pools these across all blocks on a site before computing any rate.

## Suppression rules (pinned by `tests/director-dashboard.test.mjs`)

1. **Counts:** any displayed count below the threshold — zero included — renders as `<5`.
2. **Totalled rows** (accuracy bands, whose total is shown): if exactly one cell is suppressed,
   the next-smallest shown cell is suppressed too (`—*`) so the hidden one cannot be recovered
   by subtraction.
3. **Shares:** suppressed if the numerator or the denominator is below the threshold; if fewer
   than the threshold fall *outside* the numerator, only a lower bound is shown (`≥81%`), so
   "all but two" is never readable.
4. **Known gap, documented rather than hidden:** the nested thresholds in the funnel
   (answered ≥5 ⊇ ≥10 ⊇ ≥20) can be differenced, and the difference may be < 5 visits. These
   are visits, not learners, and carry no identity; if a reviewer wants it closed, apply rule 2
   along the chain.

## What a producer must never send

Names, emails, student or study IDs, tokens, IP addresses, user agents, session ids, timestamps
finer than the ISO week, item ids, answers, scores, free text. The closed field sets above make
each of these a validation failure.
