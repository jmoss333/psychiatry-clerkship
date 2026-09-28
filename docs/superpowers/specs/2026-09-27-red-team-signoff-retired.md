# Interview Room: retire the red-team sign-off and the per-case probe rule

**Decision:** `sp-redteam-signoff-retired` (`decisions.json`) · **Decided:** 2026-09-27 by Joshua Moss, MD
**Scope chosen by the owner:** retire layers 1 and 2 below, keep layer 3.
**Supersedes in part:** `2026-09-27-red-team-governance-simplification-design.md` §2.1 (three-PR case landing) and §2.2 (the guided receipt as the required default after every deploy).

## What "the red team" was on 2026-09-27

| Layer | What it did | What it cost | Disposition |
|---|---|---|---|
| 1. Live sign-off | A 45+ minute human checklist (A–E, plus R1–R16 with voice on) after every deploy, model or pack change, recorded in a signed receipt | Never completed. The only run (2026-08-31) covered Tiers 1–2, so the receipt read `missing` every month. That put a permanent item on the owner queue and the rotation-readiness checklist, and a line in the monthly review, that nobody was going to act on | **Retired.** The checklist and its tools stay available as an optional aid |
| 2. Per-case probe rule | #837/#841 (2026-09-26): every reviewed case and every disclosure gate needed a passing **hand-written** probe, or CI and the pre-push hook failed | Every new case took three PRs: pending content, then probes in a governance PR (L1 keeps `bin/` and the pack apart), then promotion | **Retired**, replaced by S1–S3 below |
| 3. Gate-integrity probes | `bin/redteam-offline.mjs`: B/C/M probes against the real `sp.mjs` state machine, ~1 s, no model call | Nothing. It fails only when the logic that keeps disclosure locked regresses | **Kept** in CI, `bin/verify.sh` and the pre-push hook |

## Why

- **A control that is never satisfied is not a control.** The receipt was red from 2026-08-31 while learners used the room with the owner's approval. It had turned into alarm fatigue, and it kept the monthly review parked on `review` for a reason that hid the real ones.
- **The core safety properties are architectural, not behavioural.** A locked gate's reveal text never enters the model's context (`actorSystem` in `sp.mjs`). Scoring and unlocking are deterministic regex state (`deriveState` / `computeCoverage`); the model never adjudicates. Layer 3 pins those properties on every change. A human re-reading transcripts after each deploy adds little on top of that.
- **The per-case rule demanded paperwork for protection that can be automatic.** What a hand-written probe for a new case mostly proves is that its gates are wired correctly. S1–S3 prove that for every reviewed case without anyone writing anything.

## The automatic checks (S1–S3)

They run in `bin/redteam-offline.mjs` over every `reviewed` case and every one of its gates, and each can fail CI:

- **S1:** small talk ("Hi.", "Tell me more about that.", a reflection) opens no gate. Checked on the patterns and on the engine state.
- **S2:** every gate is keyed to intents the case defines, its `requiresGate` names a real gate, and there is no parent loop. A typo here makes a disclosure unreachable, which is as broken as a leak.
- **S3:** no gate opens on `si_euphemism` or on its own `euphemismIntent` (G1 of #410, ratified 2026-08-31).

Each check prints how many gates and cases it covered, so "every gate" can never mean zero. Hand-written probe coverage is still printed as a `note`, and `--coverage` still prints the table. They are reports, not gates.

## What this does NOT change

- Pack attestation through the faculty console. A pack edit still drifts the `sp-interview.html` row until re-attested.
- The proxy's own refusals: a non-reviewed case, a model-pin mismatch, forged client state.
- The real-time and managed-voice activation gates: privacy approval, faculty speech-to-speech audition, the supervised pilot and the activation flag. Section R of the checklist becomes an optional structure for the audition.
- The rollback procedure in `docs/RED_TEAM_RUNBOOK.md`.

## Residual risk, stated plainly

With layer 1 gone, nothing *requires* a person to watch the live model after a change. The failures only a human sees are the model breaking character, a clinically unsafe improvisation, or the evaluator inventing a quote. A regression of that kind would be caught by a learner or a supervising faculty member, not before. That is acceptable for a passcode-gated, faculty-supervised teaching tool using synthetic cases. It would not be acceptable if any of the revisit triggers below held.

## Revisit if

- the room is offered without faculty supervision, or outside the passcode (for example to another institution's learners);
- the actor or evaluator **provider** changes (not just a model version bump within the pinned family);
- any incident in which the live room said something a learner should not have heard.

In any of those cases, run the optional checklist once before going on, and reconsider this decision.
