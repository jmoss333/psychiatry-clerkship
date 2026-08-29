# Faculty decisions — Joshua Moss, MD · 2026-08-24

Captured live in session. These open gates recorded in
`2026-08-23-taplinger-ux-remediation.md`. Each records what was decided, the evidence
put in front of the decision, and what it unblocks.

> **D6 and D7 were added 2026-08-27**, ratifying decisions made on the 24th that were never
> written down at the time. Everything above them was captured on 2026-08-24. The filename keeps
> the original date because the regression tests cite it by that path.

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

---

## D6 · Marcus's `what'?s the point` narrowing (WP-B3 finding 10)

**DECIDED: ratified.** Confirmed 2026-08-27, ratifying the authorization given 2026-08-24.
Recorded late — the narrowing shipped in `f519b1e` on 08-24 and the regression test cited this
document as its authority, but no entry was written here at the time. This closes that gap.

Evidence presented: `si_direct` scores Marcus's checklist row "Suicide screened plainly"
(`quality: "best"`), and the stem was a bare substring, so `"What's the point of the lithium?"`
was credited as a plain-language suicide screen. Marcus is a mania case on lithium, so this is a
question learners actually ask. Session ruling **R11** had deferred it ("fixing it means narrowing
a pattern faculty never approved, mid-wave, on a safety intent"); that ruling is **superseded** by
this decision.

Rationale — the two failure directions are not equally bad. Leaving the bare substring produces a
false **pass**: the debrief certifies a screen that never happened, which is the exact lesson the
whole WP-B wave exists to stop teaching. Narrowing produces at worst a false **miss**: an SI
utterance in unlisted words earns no credit. In a simulator whose purpose is teaching suicide
screening, wrongly telling a competent student they missed is recoverable; wrongly telling an
incompetent one they screened is not.

The distinction encoded: `"what's the point"` is a hopelessness utterance when it stands alone or
is about existence/continuing, and an ordinary clinical question when it is about an object, a
treatment, or an activity. Two branches — the bare form, plus a closed existential-object
alternation. Everything else after "point of" is declined.

Verified: 30/31 on an independent adversarial probe (13 existential must-fire, 18 ordinary-clinical
and protective-factor must-not-fire), **zero over-fires**. Dana and Ray structurally untouched.

Unblocks: PR #406. Pack diff is one line; the regression test's citation now resolves.

## D7 · Ambiguous "point of" phrasings (item 8c)

**DECIDED: leave uncredited.** `"What's the point of trying?"` and
`"What's the point of talking to you?"` are hopelessness-adjacent in one reading and ordinary
frustration or rapport statements in another — `"What's the point of trying the lithium?"` is
plainly a medication question. A regex cannot resolve this without the rest of the utterance.

They currently match nothing, which is the safe direction: an ambiguous phrase never falsely
certifies a screen. Recorded as decided so it stops resurfacing as an open item.

The existential alternation is a **closed vocabulary by design** — anything unlisted falls to
"not a screen". Additional existential objects (e.g. "waking up tomorrow", "getting better") are
one alternation entry each if wanted later.

### Noted, not decided — for a later WP, not PR #406

Two pre-existing issues surfaced while ratifying the above. Neither was introduced by WP-B and
neither blocks the PR:

1. **The bare branch credits a reflection as a plain-language screen.** These patterns match the
   *learner's* text. A student who says `"You said what's the point — can you tell me more?"` is
   reflecting the patient's words back, not asking plainly — yet it scores `si_direct` at
   `quality: "best"`. Arguably belongs at `partial`, the way Dana's `si_euphemism` →
   `partialIfOnly` already works.
2. **Dana/Marcus asymmetry.** The bare stem exists only in Marcus's case, so bare
   `"What's the point?"` scores `observed` on him and a **critical** `missed` on Dana. Same learner
   words, two grades.

~~Also pre-existing and unchanged: `"what is the point"` unabbreviated never matched.~~
**Superseded by D8 (2026-08-27)** — the contraction was broadened and this now matches on Marcus.


## D8 · Unabbreviated "what is the point" (issue #410 item A, partial)

**DECIDED 2026-08-27: broaden the contraction.** Directed in session, same day.

The stem had always been `what'?s`, so `"What is the point of going on?"` — an ordinary way to
phrase it, and no less a screen — matched **nothing at all**, in any case. On Marcus, where `c_si`
is `critical: true`, that scored as a critical safety miss for a learner who screened correctly.
D6's narrowing did not cause this and did not touch it; `wpb4-report.md` flagged it as pre-existing
and out of scope because broadening was not authorized at the time. This authorizes it.

Change: `what'?s the point` → `what(?:'?s| is) the point`, in **both** branches of the pattern, so
the object/treatment guard from D6 applies identically to the unabbreviated form. One line in
`sp_mania_redirect_001`.

Verified: 24/24 on an adversarial probe — 11 existential forms fire (both contractions), 13
ordinary-clinical forms decline, including all four `"What is the point of <treatment|object>"`
variants. The D6 guard is intact. The regression test was extended with both lists and
teeth-checked: it fails on the pre-D8 pack and passes after.

**Scope — this fixes Marcus only.** The `what's the point` stem exists in **no other case**; Dana
and Ray have never carried it in any form. `"What is the point of going on?"` still scores as a miss
on both of them, exactly as `"What's the point of going on?"` already did. Giving them the stem is a
different decision — it is issue #410 item D (the Dana/Marcus asymmetry), which turns on whether a
bare or reflected `"what's the point"` should count as a *plain* screen at all, and is not settled
here. All three cases do carry `no point (in )?(going on|carrying on)`, so that family is unaffected.

Unblocks: #410 item A, in part. Items A (remainder: `dark thoughts` / `unsafe thoughts` /
`something drastic|stupid` missing from Marcus and Ray), B, C, D, E, F and G remain open.

---

## D9 · Habitability forms of "worth living" (Codex review of #406, comment 2)

**PROPOSED — ratified by merging PR #406.** `"Is that apartment not worth living in?"` matched the
D3 worth-of-living stem in every case; Ray's case is apartment-centered, so habitability questions
are realistic learner moves there. Fixed by a trailing lookahead — `worth living(?!\s+(in|there|at)\b)` —
which declines "worth living in/there/at …" while preserving every D3-approved phrasing
(regression-tested). Known cost, accepted under the D7 heuristic: a rare genuine screen shaped like
"not worth living in a world without her" now declines — an ambiguous form a regex cannot resolve,
and declining is the safe direction.

## D10 · Causal "by"-forms of hurt/harm-yourself (Codex review of #406, comment 3)

**PROPOSED — ratified by merging PR #406.** `"Do you think you're hurting yourself by sleeping only
two hours?"` — an insight/consequences question, not a screen — matched the D5 stems, certified
Marcus's critical `c_si`, and unlocked `g_si_mixed` at rapport 0. D5 accepted *euphemistic screen →
full credit* as better than a hard miss; it never contemplated crediting a non-screen. Fixed by
`hurt/harm(ing)? yourself(?!\s+by\b)` plus a recovery stem —
`(thoughts?|think(ing)?) (about|of) (hurt|harm)(ing)? yourself` — so thought-framed screens with a
method clause ("thought about hurting yourself by taking pills?") still credit. Applied uniformly:
Marcus `si_direct`, Ray `si_direct`, Dana `si_euphemism` (avoiding a new same-words-different-grade
instance; Dana's deflection mechanic and her `si_direct` euphemism guard are untouched). Does not
supersede #410 item C — the structural `si_euphemism` uniformity for Marcus/Ray remains the full
resolution of euphemism *over-credit*; D10 only stops *non-screens* from crediting at all.

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
