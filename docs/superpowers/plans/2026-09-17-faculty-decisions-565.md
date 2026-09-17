# Faculty decision — 2026-09-17 — issue #565

Continues the numbering of `2026-08-31-faculty-decisions-410.md` (D12–D16).

## D17 · The direct suicide question is never the gated object (issue #565)

**Approved:** Joshua Moss, MD, "approve" on #565, 2026-09-17.

**Finding.** `si_active` required `rapport ≥ 1` and no `judgmental` / `premature_reassurance` flag in
the previous two turns. Driving the prototype's own `MockProvider`: a plain first-utterance safety
question (A), the question after one reassurance at rapport 2 (C2), after a judgment (D), and a
re-ask after a deflection (E) all returned *"That's a very direct question for someone I met four
minutes ago."* The encounter taught that asking about suicide early is punished, misattributed the
friction to the question rather than to the reassurance or judgment, and left correct persistence
unrewarded. The debrief says the opposite (*"the one question that can't be skipped"*), and the
encounter is the stronger teacher.

**Decision.**
1. `si_active.requiresRapport` → `-3` (the engine's rapport floor, so "no rapport gate" without an
   engine exception — the same expression the local draft overlay had used) and
   `blockedByRecentFlags` → `[]`. A plain `si_direct` question discloses at any rapport level,
   including as the first utterance and immediately after a flagged turn.
2. Depth gates (`si_plan_detail`, `si_means_detail`, `si_protective_detail`, `si_behavior_detail`)
   are unchanged and still require `si_active`.
3. Friction, where it happens, names its own cause: the flag lines already answer the reassuring or
   judging turn itself (*"You don't actually know that, though…"*, *"…Sure. Right. I'll try that."*).
   No response attributes friction to the directness or timing of the safety question. The
   `deflectLowRapport` text stays in the pack (77 recorded lines, unchanged) but is unreachable:
   the offline engine never reaches its branch at the floor, and `sp.mjs`'s locked-gate context now
   offers a rapport-floor gate only its euphemism / locked lines.
4. The debrief states that asking early was right (new teaching point; the first point no longer
   says "with some rapport established").
5. The spoken room's local draft overlay `dana-direct-si-v1`, which carried exactly this policy on
   top of the reviewed pack, is retired into an identity that still pins the reviewed gate's hash.
   The "LOCAL DRAFT · Faculty review pending" label for Dana goes with it.

**Scope not changed.** Marcus's `g_si_mixed` (`requiresRapport 0`, blocked by `judgmental` /
`argue_grandiosity`) is the same class and was not part of this approval.

**Operational follow-up owed.** `sp-proxy/REDTEAM_CHECKLIST.md` section B after merge (the proxy
compiles the same pack); `sp-preview` rebuild and `netlify deploy --prod` so the hosted room bundles
the new pack and overlay; Dana's recording manifest re-finalised against the new pack hash
(`finalize-dana-recordings.mjs` — verifies the existing 77 MP3s, generates nothing).

**Tests.** `_prototypes/sp-interview/tests/conversation-local-dana.test.mjs` (rewritten to the
promoted contract: A, C2, D, E, no friction line in any sequence, depth gates, live-context parity),
`tests/smoke.test.js` scenario 3 (now discloses), `conversation-responses.test.mjs` (social
acknowledgements still unlock nothing; the question does), and
`sp-proxy/tests/sp-direct-question-discloses.test.mjs` (deriveState / computeCoverage /
actorSystem on the real pack). The offline red-team tier (`bin/redteam-offline.mjs`, run by
`bin/verify.sh`) had four probes pinning the old premise — B1 (cold first-message question stays
shut), B4 (judgment shuts the question), B4b (two-turn recovery window), B8c (judgment shuts the
attempt-history gate) — restated to the D17 contract: the question discloses cold and after a
judgment, repair turns are not what opens it, and a judgment still cannot open a depth gate on its
own. 23/23 probes pass. `tests/leak.test.mjs`'s lock probe became a euphemism, since the direct
question is no longer a way to keep the gate shut.
