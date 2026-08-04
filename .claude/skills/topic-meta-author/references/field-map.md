# Field map — what each field is and does

Every field is optional except that a real page needs the core set. Use this to decide which fields
a page of a given type should carry. Frequencies are across the 71 live topics (2026-07).

| Field | Type | What it is / drives | Notes |
|---|---|---|---|
| `read` | int or string | Estimated read time (minutes) shown on the card | Universal. `2` on a stub. |
| `hy` | boolean | "High-yield" flag → badge | Set on shelf-relevant pages (29/71). |
| `tldr` | string | The one-sentence summary at the top of the page | **Core** (71/71). |
| `points` | string[] | The 3 high-yield bullets | **Core** (71/71). Keep to three. |
| `cant` | string | The "can't-miss" trap card | 50/71. Usually "Don't…". |
| `ruleOut` | string[] | The differential to exclude | 24/71. **Pairs with `firstMove`.** |
| `firstMove` | string | The first action once the differential is excluded | 24/71. **Never without `ruleOut`.** |
| `quiz` | object | The board-style self-check (`q`, `o[]`, `why`) | 42/71. Exactly one `c:true`. |
| `cta` | object or list | Call-to-action button(s) `{label, href}` | 65/71. Hrefs are cross-refs → must resolve. |
| `evidenceIds` | string[] | Citations → `evidence_registry.json` | 7/71, but **required if `safetyLevel:high`.** |
| `relatedTools` | string[] | Tool files surfaced as related | 66/71. Must include `family-systems.html` if `familyOverlay` set. |
| `workflowModes` | string[] | Soft filter chips (`ward`, `5min`, `shelf`, …) | 66/71. Not enum-checked; match siblings. |
| `workflowStages` | string[] | Where the page sits in the clinical arc | 71/71. Closed 8-code set. |
| `clinicalWorkflow` | object | The bedside card (`ask/mse/safety/say/collateral/rounds/exam/actions`) | 65/71. 8 allowed keys. |
| `familyOverlay` | string | Free-form snake_case **theme slug** for the page's family angle (e.g. `mood_mania_family_collateral_and_safety`) — NOT a scenario id; authored fresh, never looked up | 13/71. Requires `family-systems.html` in `relatedTools`. |
| `communicationCases` | string[] | Communication-practice case ids | 50/71. Must resolve in `communication_cases.json`. |
| `safetyLevel` | enum | `low`/`moderate`/`high` risk of the page | 13/71. `high` → governance bundle. |
| `facultyReview` | object | `status`/`reviewer`/`lastReviewed` attestation | 13/71. Never fabricate `lastReviewed`; never self-set `reviewed`. `reviewer` may be pre-filled. |
| `shelfBlueprint` | string[] | Disease-category crosswalk tag | 39/71. Absent on skills/reference pages (correct). |
| `epa` | string[] | AAMC EPA crosswalk tag (`EPA1`–`EPA13`) | 52/71. Assign by the mapping rules. |

## Page archetypes — which fields to expect

- **Disease page** (`t_mood`, `t_psychosis`): core + `quiz` + `clinicalWorkflow` + `shelfBlueprint`
  (one code) + `epa` (`EPA1,EPA2` + treatment/workup as applicable) + usually `communicationCases`
  and often `familyOverlay`.
- **Safety / emergency page** (`delirium`, `agitation`, `suicide`): everything above + `ruleOut` +
  `firstMove` + `safetyLevel` (often `high` → `evidenceIds` + `facultyReview`) + `epa` includes `EPA10`.
- **Skills / pocket-guide page** (`pg_interview`, `pg_formulation`): core + a conceptual `quiz` +
  light `epa` (e.g., `EPA1`) + **no** `shelfBlueprint`, no `ruleOut/firstMove/safetyLevel`.
- **Reference / meta page** (`reading_map`, `landmark_trials`, `anki`): often just `read` + `tldr` +
  `points`; a stub may be only `{"read": N}`.

When in doubt, open the closest sibling with `python3 -c "import json;print(json.dumps(json.load(open('topic_meta.json'))['<sibling>.md'],indent=2))"` and mirror its field set.
