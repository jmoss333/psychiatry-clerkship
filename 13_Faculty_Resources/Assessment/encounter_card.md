# Sim-to-Ward Encounter Card

**DRAFT for Josh's edit.** The **Sim-to-Ward Entrustment Loop** (review §10). A student who has
practised an interview in the Interview Room brings this card to the preceptor. Within 48 hours
the preceptor watches the student do the same skill with a real patient and signs DO-1 for the
rows that matter.

**EPA:** Core EPA 1 (through DO-1); Core EPA 10 when the practised skill is the safety inquiry

**Objectives:** OBJ-02, OBJ-03, OBJ-04, OBJ-05, OBJ-06, OBJ-11 (collateral items)

**LCME:** 9.4 (direct observation)

> This card feeds your school's official evaluation; it is not itself the grade. No patient
> identifiers: patient initials: not recorded; encounter type: ___. Copy no transcript text onto
> this card: the simulation's own coverage map is the only simulation record it needs. The card
> is paper or an entry in [your school's evaluation system]; the library stores nothing about it.

## How the loop works

1. **Simulate.** The student completes an Interview Room case and reads the debrief's coverage
   map (each checklist item is shown as observed, partial, or missed).
2. **Carry forward.** The student copies the ids of the items marked *partial* or *missed* onto
   this card and picks the one to work on first.
3. **Observe on the ward, within 48 hours.** The student asks the preceptor to watch the matching
   part of a real interview. The crosswalk below says which DO-1 row each item belongs to.
4. **Sign.** The preceptor rates those rows on DO-1, signs it, and attaches this card.

Why it is built this way: it gives LCME 9.4 direct observation a specific target, spaces
deliberate practice between simulation and a real encounter, and costs the preceptor about five
minutes against a card the student has already filled in.

## Card

**Simulation**

- Sim case id: ☐ Dana `sp_depression_gated_si_001` ☐ Marcus `sp_mania_redirect_001`
  ☐ Ray `sp_psychosis_paranoid_001` ☐ other: ____________
- Completed: rotation week ___, day ___
- Coverage items the student missed in sim (the ids the debrief marked partial or missed):
  ____________________________________________________________
- The one item the student will work on first: ____________________

**Ward observation**

- Observed: rotation week ___, day ___; hours after the simulation: ___ (target: 48 or fewer)
- Patient initials: not recorded. Encounter type: ____________________
- DO-1 rows observed (from the crosswalk): ______
- Rating for those rows, as recorded on DO-1: ☐ needs direct supervision ☐ needs prompting
  ☐ needs occasional checking ☐ ready for indirect supervision
- DO-1 signed and attached: ☐ yes

Preceptor: ______________________ Student: ______________________

The ward observation is recorded as a rotation week and day plus the interval from the
simulation, not as a calendar date: a date tied to an encounter type can identify a patient on a
small unit.

## Crosswalk: Interview Room coverage items to DO-1 rows

Checklist ids as they stand in the Interview Room case pack
(`_prototypes/sp-interview/sp-interview.pack.json`). `tests/assessment-pack.test.mjs` fails if an
id here stops existing, or if one of these cases gains a checklist item this table does not
place.

| DO-1 row | Dana (`sp_depression_gated_si_001`) | Marcus (`sp_mania_redirect_001`) | Ray (`sp_psychosis_paranoid_001`) |
|---|---|---|---|
| 1. Open-ended start | `c_open` | `c_open` | `c_open`, `c_stance` |
| 2. No leading questions | — | `c_structure` | `c_explore` |
| 3. Presenting syndrome and timeline | `c_mood_core`, `c_cognitive`, `c_prior`, `c_context` | `c_mania_core`, `c_risk`, `c_fhx` | `c_eating`, `c_context` |
| 4. Safety screen asked plainly | `c_si` | `c_si` | `c_command`, `c_si`, `c_violence` |
| 5. Follow-up after a disclosure | `c_si_followup` | — | — |
| 6. Substance and medical review | `c_substance`, `c_medical` | `c_substance`, `c_meds` | `c_substance`, `c_medical` |
| 7. Mental status domains elicited | `c_psychosis` | `c_psychosis` | `c_hall` |
| 8. Summary back to the patient | `c_close` | `c_close` | `c_close` |
| Not a DO-1 row: rate on DO-4 variant B (collateral call) | — | `c_collateral` | `c_collateral` |

## What the paired record could show, and what it may not be used for yet

Each completed card pairs a simulation result with a ward rating for the same skill. Collected
across a cohort by the school, those pairs would show how well simulation performance transfers
to the ward, which is scarce evidence nationally and the core of a MedEdPORTAL or *Academic
Psychiatry* submission. Until an IRB or quality-improvement determination is in hand (WP-17
step 4), the card is formative only: nobody compiles, analyses, or publishes the pairs. The
library never holds them.
