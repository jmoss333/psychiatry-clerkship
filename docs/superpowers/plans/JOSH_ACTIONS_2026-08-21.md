# Your Action List — after Claude Code's WP-37 / Therapy Report

**Date:** 2026-08-21 · Everything below is either *only you can do it* or *only you may decide it*. All the mechanical follow-through is already specced for Claude Code and resumes on its branch (`claude/therapy-curriculum-handoff-fad82c`) once you clear these. **Do not hand-edit the plans-folder artifact copies** — fixes land on Claude Code's branch to avoid divergence.

---

## Part 1 · Mechanical — ~15 minutes, do these first

**1. Restart the Claude desktop app** (or Settings → Extensions → Scholar Sidekick, toggle off/on).
Still broken as of this morning — I re-tested; the running extension host predates the manifest fix. This is the single blocker on WP-T1. *Belt-and-suspenders (optional, only you can):* create a free `ssk_` key at scholar-sidekick.com/account and paste it into the extension's settings — that also lifts the anonymous-tier rate limits the 08-21 gate run hit ("Too many requests").

**2. Fix GitHub Actions billing** (github.com → Settings → Billing). Only you can. Two riders:
- Once CI runs again, **re-enable branch protection on `main`** — it vanished with billing, which is how #385 merged over a red check.
- Ask Claude Code to confirm what #385's red check actually was (probably the known `governance-warnings.spec.js` live-data flake, but confirm — a merge-over-red deserves a look).

**3. Recover the 46 rewritten annotations.**
They exist only in the parallel Cowork session's three agent reports — not in any repo file (the abstract-check doc shows only 4 examples). Either: (a) tell that session to commit its agent reports to `docs/superpowers/plans/`, or (b) authorize Claude Code to regenerate them from abstracts using the documented method. Option (a) is cheaper and preserves provenance.

## Part 2 · Decisions — ~45–60 minutes, yours alone

**4. Review and merge PR #386** (attested-only question bank).
Review focus: the setup-screen toggle copy ("46 draft questions are not served by default"), the fail-safe direction (anything not exactly `attested` is withheld), and that faculty review-mode deep-links still work (Claude Code verified; spot-check one). Merging it makes your answer to Kaitlin true.

**5. The six editorial calls** — recommendations attached; the fourth column is what Claude Code executes on your word:

| # | Call | My recommendation | If you agree, the action is |
|---|---|---|---|
| 1 | **D3 anchor** — 40185617's own finding is "small reduction, if any" | **Swap**: 41365522 (OA umbrella, with the specific positive findings — barriers, screen doors, pesticide bans) becomes sole anchor; 40185617 → go-deeper with softened annotation. Also soften the module's "strongest levers" sentence (§2a) and the "changes outcomes, not just process measures" line — both are mine, both overstate | Anchor swap + 2 prose edits |
| 2 | **D4 anchor** — 41217072 concludes *offer CBTp equally*, the inverse of "patient selection is a skill" | **Keep as anchor with the corrected reading** — "offer it equally" is the cleaner teaching point, and the paper is still the domain's best | Annotation replacement (mine was wrong) |
| 3 | **D9 anchor** — 38279664: MBT not superior to active controls; "prioritizing MBT for self-harm is not supported" | **Swap**: 36958077 (STPP IPD) becomes anchor; 38279664 stays as the read-past-the-effect-size-to-the-comparator lesson | Anchor swap + annotation rewrite |
| 4 | **D12** — anchor found *no* allegiance effect; closing paper unverifiable | **Keep 40177337 reframed** ("the allegiance hypothesis was tested here and failed — which is itself the evidence-limits lesson"). **Read Westra full text** (3 pages, ~10 min) before keeping it as the closing paper — its subtitle answers "process observation," not "common factors" | Reframe + your 10-min read |
| 5 | **D1 on-ramp** — Saxler is a 48-instrument psychometrics catalogue, not a primer | **Flückiger (29792475) becomes anchor and first read**; Saxler demoted to go-deeper as the "measurement chaos" exhibit; retire the separate on-ramp slot | Lean changes |
| 6 | **D2b** — Pott 34146994 is a null result (SMD 0.19, p=0.20, GRADE Low) | **Keep, honestly reframed**: "acceptable, not differentially effective — and a lesson in how thin the evidence under a confident habit can be." Better row than the one I described | Annotation rewrite (mine was wrong) |

**6. The three unverifiable rows:**
- **41920002 (demoralization commentary)** — no abstract anywhere; the "responds to different interventions" claim changes prescribing and can't rest on it. Read the full text before shipping any treatment-response claim — or fold this into the Kaitlin D10 merge, which is where it was headed anyway. *Recommended: bring it to Kaitlin.*
- **42077010 (DHD letter)** — already CUT in the amended triage. Nothing to do; confirm it stays dead.
- **36525623 (Westra)** — the 10-minute read in call #4.

**7. The adolescent-population standard.** Four kept rows carry pediatric/adolescent populations unflagged (41267566, 38279664's MBT-A arm, 40471224, part of 39046622) while other rows were *cut* on that basis. *Recommend: flag, don't cut* — these are mixed-population papers with adult-relevant findings, unlike the wholly-pediatric-setting cuts; a visible population tag squares the standard. Your call.

## Part 3 · Send — ~10 minutes

**8. The Kaitlin reply** — Part C draft + the three additions in `FEEDBACK_IMPACT` §5 (worksheets promise, TUSM front-door timing, the direct "no, it's not because it's offline" answer, and the *ask* for her CL list). **Sequence: merge #386 first, send the same day** — then "the site serves only reviewed items by default" is live truth, not intention.

## Part 4 · Explicitly NOT yours — resumes on Claude Code's branch after Parts 1–2

Difronzo DOI correction (`10.4081/ripppo.2025.841`) · Abbass 32428905 erratum note · Pharoah `.pub2`/`.pub3` resolution at the Cochrane Library · the three-tier `linkType` policy (open / open-fragile / proxy — including NOT substituting submitted-version manuscripts for the version of record on 42018336, 38084817, 32428905) · integrating the 46 rewritten annotations into the staging JSON and both pages · the WP-T1 canonical Sidekick re-run with `verifiedAt` re-stamp · WP-T2→T6 through to the AUTHOR-GATED therapy PR. **Neither draft page gets attested until the contradicted claims are replaced** — four of the seven were in prose I drafted, which is exactly why the attestation gate exists.

---

*One sentence of perspective: three gates have now each caught something the others couldn't — a retraction, a dead DOI, and seven contradicted claims — and none of them needed clinical judgment to run. The system you built is doing its job; these nine items are the part only you can do.*
