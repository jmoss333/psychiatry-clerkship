# Family Conversation Simulator — authoring guide

`family-meeting-sim.html` (slug `family-meeting-sim.html`, both sites) is a static branching rehearsal of three family conversations. It has no AI, no voice, no network calls and no free text. Scenario data lives inline in the tool, in `<script type="application/json" id="fms-scenarios">`, so the whole tool is one attestable artifact.

The display title deliberately avoids the phrase "Family Meeting": `tests/fd-search.test.mjs` pins that searching "family meeting" puts the Family Meeting Playbook first, and a tool titled "Family Meeting Simulator" outranks it. Search aliases for the tool avoid that phrase for the same reason.

## Status and attestation

- Every scenario is a **draft** written from fictional composites. The tool ships **pending** behind the attestation gate (`reviewed.json` row: `risk {kind: clinical, level: high}`, `by: "Pending faculty review"`) because it rehearses safety-planning and means-safety roles.
- Only faculty attest, in the faculty console. An agent never signs, promotes or adds a `contentHash`.
- Any edit to the scenario text or scores after attestation drifts the row back to pending. Batch edits so one review covers them.

## How scoring works

- Four axes, each scored 0, 1 or 2 per choice: `validation`, `structure` (agenda, roles, summary, close), `safety` (risk as clinical data, collaborative means safety, specific roles, routing to the team) and `nonblaming` (illness-not-character framing, holding several perspectives, no cross-examination).
- A run's score per axis is the points earned divided by the most that the moments actually reached could offer. The debrief shows four bars, the authored feedback for each choice, the strongest authored option where the learner chose a weaker one, and "Try again from this moment". It never shows pass or fail.
- Bands are descriptive: "often" (75% or more), "some of the time" (40–74%), "mostly missing" (below 40%).

## Adding or editing a scenario

1. Give it a kebab-case `id`, a `title`, `setting`, `time`, `learnerRole`, `participants` (`name`, `role`, `stance`), `goals`, `start`, `nodes` and `endings`. Optional: `note` and `noteLink` (`label`, `page` — a shipped slug).
2. Each node has a `phase` (`join`, `share`, `hear`, `plan`, `close` — the five phases of `family_meeting_playbook_90min.md`), `lines` (`speaker`, `text`; speaker `narration` renders as a stage direction), an optional `cue`, an optional `repair: true`, and 3–4 `choices`.
3. Each choice has `text` (what the learner says), `next` (a node id or an ending id), `scores` with all four axes, and `feedback` (one or two sentences: why this move helps or hurts, in the same words the playbook and Family Systems Practice use).
4. Structure: 6–10 decisions on every path; no cycles; every node and ending reachable; every rupture has a repair node that rejoins the main line; every path must touch all four axes.
5. Content rules: fictional people only; no doses; no instrument items; no hard-coded crisis numbers (the build injects them at `<!-- crisis-block-html -->`); no consent or confidentiality rules for minors (link the law page instead); means safety stays at the level of the concept, with details routed to the team and local policy.
6. Run `node --test tests/family-meeting-sim.test.mjs`. The engine refuses to run on data that fails its own checks.

## Storage

One literal key, `cw_family_sim_v1`, on the learner's device: scenario ids, run counts, best percentage per axis and the date of the last run (day only). Nothing else is stored or sent. "Clear my saved progress" removes the key.

## Not in this version

Voice or LLM-driven family members (decision D-F1-3), LLM scoring of free responses, spaced-repetition cards and inclusion in "Export my progress" are deliberately out of scope. The voice prototype lives separately under `_prototypes/sp-interview/` and is not part of this tool.
