# Sim & content improvements — future-work register

**Date:** 2026-07-15
**Author:** Joshua Moss, MD (with Claude Code)
**Origin:** surfaced during the brainstorm that produced
`2026-07-15-family-systems-active-retrieval-design.md`. That work sharpened **one** sim (Family
Systems Practice → active-retrieval). This file records every other improvement we identified and
deliberately set aside, with enough context to pick up later.

## The pattern worth reusing

The Family Systems work established a reusable, low-cost, low-attestation pattern:
**generate → reveal (existing expert content) → self-rate → feed the shared SM-2 store
(`cw_srs_v1`, `FAM#`/`QB#`/`TOPIC#` id namespaces) → resurface on a schedule.** It is PHI-safe
(spoken/scratch, nothing persisted but scheduling metadata) and adds no new clinical claims (the
reveal is content that already exists). The items below are mostly applications of this same pattern.

## 1. Apply active-retrieval to the other three sims

The four practice sims share one root weakness: they are *recognition* ("pick the best option") or
*self-report* ("check the box"), not *generation* or *adaptive retrieval*. Family Systems is now
fixed; the other three remain.

- **Diagnostic Reasoning Workbench** (`02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html`, v1.0, `cw_reason_v1`).
  - Recognition-only MCQ across reasoning steps; only 4 cases.
  - Add a **generate-first "problem representation"** step before options; add a **re-test-what-you-missed** loop; feed `cw_srs_v1` with a `RSN#` namespace.
  - **Surface the hidden resident bank:** `reasoning_cases_resident.json` (4 cases) is only reachable through the resident derived-twin build (`resident_section.py`), never as a learner-selectable mode. Wire a mode/toggle so residents can actually reach it.
- **One Patient, Six Weeks** (`08_Cases_and_Simulation/one-patient-six-weeks.html`, v1.0, `cw_longitudinal_v1`).
  - Fixed narrative + self-check; the story never responds to the learner. It just gained model-answer reveals (#227) — the natural next step is "generate your own line before revealing," the same active-retrieval move.
  - Alternative/bigger: let decisions **branch the arc**, or make this the **hub** that threads the other sims' cases week-by-week.
- **Communication Practice / "What Do You Say Next?"** (`02_Clinical_Skills/Communication_Practice/communication-practice.html`, v2.0, `cw_comm_v1`).
  - Already deep (spoken drills, timers, transfer debriefs). Lower marginal gain.
  - Options: **multi-turn branching dialogue** instead of single-line picks; **data-drive the hardcoded maps** (`CASE_FILTERS`, `CASE_LABELS` live in the HTML — move into `communication_cases.json`).

## 2. Family Systems follow-ons (deferred from the shipped design)

- **Approach B — decision points:** add 2–3 branching "what do you say next?" moments with best/partial/harmful feedback to the 2–3 highest-yield scenarios (e.g. High Expressed Emotion, When Family Involvement May Harm). Higher authoring + a new faculty-attestation surface per choice.
- **Approach C — family-meeting micro-simulator:** a short branching engine where the family *system* reacts to each move (emotional temperature, a member escalating/softening, a confidentiality test). This is effectively the separately-tracked backlog item **P2-2 "Family Meeting Simulator"** — a new project, not a tweak.
- **Unify Daily Review (the documented v2 non-goal):** `review.html` is catalog-based, so it counts `FAM#` cards in the home due badge but cannot *render* them (family review happens in-tool). Teaching `review.html` a "family deck" card type (it already has a `deck` concept) would fully unify review. Small papercut today: the home badge can read a few higher than Daily Review shows.
- **Data-drive the family maps:** `SCENARIO_FILTERS` / `CASE_LABELS` are hardcoded in `family-systems-practice.html`; move to `family_systems_scenarios.json` so faculty can edit filters/labels as data.

## 3. Close the practice → mastery loop for ALL sims (structural)

The home/adaptive engine (`13_Faculty_Resources/_automation/site_build/spa_index.html`) tracks
mastery but reads **none** of the sims' `cw_*_v1` practice stores. Family now feeds `cw_srs_v1`;
doing the same for Diagnostic Reasoning, One Patient, and Communication would make **all** practice
feed one review queue and the weak-topic engine. `cw_srs_v1`'s `dueCount()` is already generic, so
new namespaces (`RSN#`, `COMM#`, …) join the home due badge for free. (Same catalog-based Daily
Review limitation as §2 applies — plan for it.)

## 4. Content improvements (not code)

- **Question bank:** ~49 draft items still need a faculty attestation pass; the July audit found ~9 near-duplicate item pairs (3 re-angled, rest noted). A near-duplicate build guard (backlog **P2-NDG**) would prevent recurrence.
- **Content-gap sweep** across the 14 sections vs `_AUDIT_AND_ROADMAP.md` §4 (confirm remaining "Create" items are live or consciously dropped).
- **Media accessibility** (backlog **P1-8**): ~100 LFS audio files have no transcript/caption/metadata gate.

## 5. Reconcile the stale backlog

`CLERKSHIPOS_BACKLOG_2026-07.md` is dated 2026-07-05 and is **~10 days stale** — several items have
since shipped (SP Interview redesign, adaptive engine v2, Anki decks, question-bank growth). A
reconciliation pass would re-verify it against the current tree. Still-relevant buildables spotted
in passing: **P1-4** (separate local policy from universal teaching on MS3 content), **P2-SLG**
(replace the 77-tuple hardcoded source→slug map in `build_deploy.py`), **P2-6** (browser smoke tests
for the high-risk validated-instrument tools — this feature extended that practice to a
moderate-risk tool), **P2-8** (CSP hardening).

---

*Read-only planning note. Nothing here is scheduled; it is a menu for future sessions. Each item
should get its own brainstorm → spec → plan cycle when picked up.*
