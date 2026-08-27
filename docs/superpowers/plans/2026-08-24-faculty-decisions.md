# Faculty decisions — Joshua Moss, MD · 2026-08-24

Captured live in session. These open gates recorded in
`2026-08-23-taplinger-ux-remediation.md`. Each records what was decided, the evidence
put in front of the decision, and what it unblocks.

---

## D1 · MS3 Week 3 composition (Task 4a gate)

**DECIDED: add `therapy_on_the_unit.md` only. The Reading Room stays in Library.**

Evidence presented: Week 3 is currently the lightest week at 5 items / 12 read-min.
Adding both pages → 7 items / 32 min, heaviest in the rotation (W1 is next at 25).
Adding the module alone → 6 items / 24 min, in line with W1.

Rationale: a curated reading list is a reference surface, not a sequenced path item.
The Reading Room is now reachable from the module's Go-deeper rail (added in cdf976d)
and ranks #1 for the query "reading room".

Unblocks: Task 4a. `curriculum.json` → `learningPaths.ms3.weeks[2].items` gains one
`{"ref":"therapy_on_the_unit.md","kind":"read"}` entry. Validate with
`validate_curriculum.py`. Task 5 step 2.1 (deferred under ruling R3) can then run.

## D2 · Interview Room review status (F7 gate)

**DECIDED: reviewed. Remove the stale in-tool badge.**

Evidence presented: four independent artifacts say reviewed — pack `status`, all three
cases' `facultyReview` (signed 2026-07-13 / 07-22 / 08-12), `13_Faculty_Resources/reviewed.json`
and `governance.json` (2026-08-11). One hard-coded badge at `sp-interview.html:840`
(and `.preview.html:842`) said "Redesigned — pending faculty review". Both visible to a
learner ~85px apart.

Action: delete the `e('span',{className:'badge draft'},'Redesigned — pending faculty review'),`
element from both files. The Front Door already renders the authoritative chip from
`governance.json`, so removing it leaves exactly one claim, not none. Then run
`validate_attestation_consistency.py`.

**Consequence — live mode stays OPEN.** `sp-proxy` `resolveReviewedCase` 403s only on
unreviewed cases; all three are reviewed, so the case-review gate passes. This settles the
open question recorded in the session memory note "SP live mode is open" (#380 vs WP-08).

**Follow-on this makes mandatory:** the WP-08f refusal copy — "Live patient mode is closed
while this case pack is pending faculty review" — is now FALSE and must be rewritten to name
the actual refusal reason (passcode, budget, or proxy availability). Tracked as Task 8 step 3.

## D3 · Suicide-screen phrasings the offline sim must recognise (F6 / P0 gate)

**DECIDED: add all three families.**

1. **Worth-of-living** — "thoughts that life isn't worth living" / "isn't worth it"
2. **Better-off / not-being-here** — "better off not being here", "better off without me/you"
3. **No-point-in-going-on** — "no point in going on" / "carrying on"

Evidence presented: each currently returns a generic deflection. Because coverage is scored
by matched intent IDs, a learner who screens correctly in guideline-concordant language is
recorded as NOT having screened — the gated disclosure never unlocks and the debrief tells
them they missed it.

**Also fix, surfaced by the same probe:** "Do you ever feel your family would be better off
without you?" currently matches `family_social` and NO safety intent — a passive-SI screen
credited as a social question. Family #2 must take precedence over `family_social` for this
phrasing, not merely be added alongside it.

Unblocks: WP-B Task 7. Extend `si_direct` / `si_euphemism` patterns in
`sp-interview.pack.json` for ALL THREE cases, add the regression test asserting each approved
phrasing is recognised by a `category:'safety'` intent, then re-run
`sp-proxy/REDTEAM_CHECKLIST.md` (mandatory after any pack change).

---

## D4 · Learner entry contract (F5 / WP-C Task 10)

**DECIDED (two parts):**

**D4a — Frame the hub as a starting point, and point at the depth rails.**
Not a bare sentence: say the hub is a floor rather than a ceiling AND name where to go
deeper, reusing structure already shipped — every long page ends with a Go-deeper rail, and
the Therapy Reading Room is exactly that surface.

Reframing that produced this: Kaitlin's question was about **sufficiency**, not permission.
"Do you explain to them that this is a starting point?" asks whether students will mistake the
hub for the whole curriculum — not whether they are obliged to read it. The 2026-08-23 decision
packet framed F5 as "nothing is required vs a completion-tracked path"; that framing was too
narrow. The house style is already consistently "suggested, not required" (podcast library,
landmark trials, book library, one-pager line 29), so there was never a real contradiction in
substance.

Target: `13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md` (ships as
`welcome.md`), around line 29. Copy needs faculty authorship — it is a statement to enrolled
students about what the rotation expects.

**D4b — Label the progress marks as private and self-directed.**
The front door shows `N of M done`, a percentage ring, "~N min left", a **streak counter**, and
"Mark done". Nothing on those surfaces says the marks are private; the only reassurance ("No
account. Everything saves on this device.") is on the setup screen, seen once. Add one line near
the progress card: these are yours, saved on this device, nobody else sees them.
Faculty chose to KEEP the streak counter.

Type: mechanical once the copy is written. Must obey the audience-neutral copy rule if it lands
in `frontdoor/*.js` (no MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford tokens).

---

## Escalated 2026-08-24 — a pre-existing safety gap D3 did not cover

Measured after the D3 fix landed, across all three cases:

| Screen | Dana | Marcus | Ray |
|---|---|---|---|
| "thoughts of **hurting yourself**" | si_euphemism | **MISS — nothing** | si_direct |
| "thoughts about **harming yourself**" | si_euphemism | **MISS — nothing** | violence_screen |
| worth-of-living / better-off / no-point (D3) | si_direct | si_direct | si_direct |

Two problems, both the same class as D3 and neither covered by it:

1. **`sp_mania_redirect_001` (Marcus) has only ONE safety intent — `si_direct` — and no
   `si_euphemism` at all.** So the euphemistic screen, arguably the phrasing clinicians reach
   for more often than the word "suicide", returns a generic deflection. Marcus's own learner
   goal names risk assessment ("cover sleep, risk behaviors, medications, and safety"), so a
   learner doing the right thing there is scored as not having screened.
2. **In Ray, "harming yourself" matches `violence_screen`** — self-harm credited as
   violence-toward-others. Same shape as the `family_social` mis-classification D3 fixed.

Pre-existing, correctly left out of scope by the WP-B implementer. Now measured, so leaving it
is a decision.

**DECIDED 2026-08-24 (D5): close it.** Faculty authorised extending the fix. Implemented in
c3c72d0 and 9ee39ce by adding patterns to each case's existing `si_direct` — deliberately NOT by
creating new intents, because every case's checklist scores "Suicide screened plainly" against
`si_direct` only, so a new intent would not be scored at all. Dana was left untouched: her
euphemism routes to `si_euphemism` -> `deflectEuphemism`, which is the case's teaching mechanic,
and a guard test now asserts her `si_direct` does NOT match the euphemistic phrasings.

---

## Operational follow-up owed

`sp-proxy/REDTEAM_CHECKLIST.md` is mandatory after any pack or model change. The D3 pack change
is committed but the checklist has NOT been run. It must run before this reaches learners.

## Still open after this session

- Learner entry contract (F5 / WP-C Task 10) — "nothing is required reading" vs a
  completion-tracked path.
- Resident-extension blocks in the MS3 view (F8b / WP-C Task 11).
- Engine direction for the offline sim (WP-B Task 9) — broaden patterns / semantic layer /
  reframe offline as phrase-sensitive practice.
- Safety-synonym coverage in `curriculum.json` (ruling R7) — the protocol search net currently
  matches via coarse substrings rather than by design.
- Passcode handling — it is circulating in plaintext on a forwarded distribution list.
- Kaitlin's two unanswered questions: question-bank provenance, and her reading-list /
  pilot-cohort offer (5–6 MS3s per 6 weeks plus MS4s).
