# Invariants — the checklist `validate_topic_meta.py` enforces

Distilled from the **validator**, not `topic_meta.schema.json` (which omits `shelfBlueprint`/`epa`
and several rules). Walk this against your draft before running the validator. Every item here is a
hard failure if violated.

## Per-entry shape

- The entry is an object.
- `read` — integer (minutes) or string.
- `tldr` — string.
- `points` — list (of strings, by convention).
- `evidenceIds`, `relatedTools`, `workflowModes`, `workflowStages`, `communicationCases` — each, if
  present, a list of strings.
- `familyOverlay` — string, if present.
- `safetyLevel` ∈ `low | moderate | high`, if present.
- `facultyReview` — object; `status` ∈ `draft | pending | reviewed | retired`, if present.

## Conditional rules (the ones that bite silently)

- **`firstMove` requires `ruleOut`.** Never emit `firstMove` without a non-empty `ruleOut` list.
  (`ruleOut` = the differential to exclude; `firstMove` = the action once excluded. The action
  without its differential is a rubric violation.)
- **`ruleOut`**, if present, is a **non-empty** list of strings.
- **`quiz`**, if present, is an object with:
  - `q` — non-empty string.
  - `o` — list of **≥2** options; each option an object with a truthy `t`.
  - **exactly one** option has `c: true` — not zero, not two.
  - `why` — non-empty string (teaches why the answer is right / others wrong).
- **`familyOverlay` ⇒ `relatedTools` must include `family-systems.html`.** If you set a family
  overlay, the family-systems tool must be in `relatedTools`, or validation fails.
- **`clinicalWorkflow`**, if present, is an object whose keys are a subset of
  `ask, mse, safety, say, collateral, rounds, exam, actions`. Every value is a string **except**
  `actions`, which is a list of `{label, href}` objects (both strings).

## Controlled vocabulary

All from `references/controlled-vocab.md`:

- `shelfBlueprint[]` — non-empty; every code ∈ the 12-code set.
- `epa[]` — non-empty; every code ∈ `EPA1`…`EPA13`.
- `workflowStages[]` — every value ∈ `encounter, diagnosis, safety, treatment, communication, family, team, exam`.
- `clinicalWorkflow` keys — ∈ the 8-key set above.

## Referential integrity (cross-file — resolve before writing)

Each reference must resolve in its target contract, or validation fails:

- `evidenceIds[]` → `evidence_registry.json` `sources[].id`.
- `communicationCases[]` → `communication_cases.json` `cases[].id`.
- Any href `?tool=communication-practice.html&case=<id>` (in `cta` or `clinicalWorkflow.actions`)
  → `communication_cases.json` `cases[].id`.
- Any href `?tool=family-systems.html&scenario=<id>` → `family_systems_scenarios.json` `scenarios[].id`.
- `familyOverlay` is **not** a cross-reference — it is a free-form snake_case theme slug authored
  fresh (e.g. `suicide_safety_family_means_restriction`), never a scenario id. Its only rule is the
  paired `relatedTools` ⇒ `family-systems.html` invariant above. To link a real family *scenario*,
  use a `?tool=family-systems.html&scenario=<id>` href, which does resolve.
- `?page=<key>` / `linkedPages` → an existing topic key in `topic_meta.json`.

Look ids up first (commands are in `SKILL.md` → "Cross-references"). If the target doesn't exist,
**flag it as out-of-scope** — do not fabricate an id or stub the other contract.

## Governance gate — `safetyLevel: high`

A page with `safetyLevel: high` **requires all of**:

- non-empty `evidenceIds` (that resolve), **and**
- `facultyReview.status` (present), **and**
- `facultyReview.lastReviewed` (present).

This is load-bearing: you cannot make a high-risk page pass the contract by drafting alone. Draft
the content + evidence scaffold, set `facultyReview.status: draft` (or `pending`), and **stop and
ask the author** for a real `lastReviewed` date and their attestation. Never fabricate the date or
a `reviewed` status. (Pre-filling `reviewer` with the author's own name is fine — a name without a
date asserts nothing; the date is what claims the review happened.)

## Don't break the sibling contracts

`validate_topic_meta.py` validates the whole family in one pass, so a run also fails if you disturb
`communication_cases.json`, `family_systems_scenarios.json`, `reasoning_cases*.json`,
`evidence_registry.json`, or `tool_registry.json`. You normally only edit `topic_meta.json`; if a
task pulls you into a sibling file, the load-bearing rules there are: unique ids everywhere;
communication cases and reasoning-case *steps* each have exactly one `quality: "best"` choice;
family scenarios carry the six required sections (`prepare, ask, say, avoid, handoff, safety`) as
non-empty string lists plus unique-id `checks`; and every cross-id resolves. But authoring those is
out of this skill's scope — prefer to flag and stop.

## The gate

```
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
```

Green = `topic_meta.json OK — <N> topics, contract satisfied.` Anything else lists the exact
violations by topic key — fix and re-run. Not done until green.
