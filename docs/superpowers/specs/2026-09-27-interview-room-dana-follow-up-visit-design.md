# The Interview Room: Dana, one week after discharge

**Status:** design approved by the owner on 2026-09-27 (Joshua Moss, MD, in the Claude Code
session). Not built.
**Owner decisions recorded here (2026-09-27):**
1. The depression scale is a PHQ-9 that Dana completed on the clinic tablet at check-in, shown in
   the chart by item number and score only. After the visit the learner writes a short structured
   visit note, and the debrief checks it against the case record.
2. "Approve as written": Dana marks 0 on item 9 and discloses passive thoughts only to a plain
   question. The lesson is that a negative screen never ends a risk assessment.

**Depends on:** PR #871 (decision `sp-redteam-signoff-retired`, open when this was written).
§7 covers both outcomes.
**Scope:**
- One new pack case, `sp_depression_followup_001`.
- Two opt-in per-case pack fields, `chart` and `visitNote`, which the Interview Room renders for
  any case that declares them.

The four existing cases are unchanged.

## 1. Purpose

Dana is the room's admission case. The follow-up closes the loop the clerkship teaches at
discharge. Seven days later, in clinic, the learner finds out whether the discharge plan held.

There are four tasks. Each has a planted gap that the learner finds only by asking.

| Task | What the chart says | What is true | What finds it |
|---|---|---|---|
| Confirm the appointment happened | Therapy intake booked for day 3 | She cancelled it that morning and has not rebooked | Asking whether she went |
| Reconcile medications | Sertraline once daily; trazodone at bedtime as needed | Two missed sertraline days (nausea); trazodone never filled; St. John's wort added | Asking about each medicine by name, then about anything else she takes |
| Check the safety plan | Plan written; Tom said he would take his sleep medication to work | She used the plan last night; its only contact is a sister she will not call; nobody has confirmed the pills left the house | Reviewing the plan with her and asking about means |
| Score a depression scale | PHQ-9 at check-in 12, item 9 = 0; admission 22 | She marked 0 because she feared readmission; passive thoughts on two nights this week | Scoring the form, then asking about suicide plainly anyway |

The fourth row carries the critical item. It is the post-discharge form of Day 1's rule that a
plain "no" never ends a risk assessment.

## 2. The case

The final wording is authored in the implementation PR and read by the owner there (§7). The
lines below fix the facts and the gist.

### 2.1 Identity and timeline

**Identity:**
- id `sp_depression_followup_001`
- title "Dana — One week after discharge"
- estMinutes 15
- `persona.displayName` "Dana": the same patient (§6.4 covers what that requires)
- topic: "Post-discharge follow-up: appointment, medication reconciliation, safety-plan review,
  measurement-based care"
- setting: "Outpatient psychiatry clinic, seven days after a six-day voluntary admission for
  depression"

**Timeline** (day 0 is discharge, a Friday):
- **Hospital day 2:** sertraline started. Trazodone was used at bedtime on the unit.
- **Day 0:** discharged on both.
- **Days 1 and 2 (Saturday, Sunday):** sertraline skipped because of nausea.
- **Day 3 (Monday):** therapy intake, cancelled that morning. Passive thoughts that night.
- **Day 4 (Tuesday):** St. John's wort started.
- **Day 6 (Thursday):** passive thoughts again that night. She used her plan.
- **Day 7 (Friday):** this visit. Tom drove her and is waiting in the car.

**Continuity:**
- Every Day-1 fact stands: the job loss in May, the sister she has not told, Ellie, Tom's sleep
  medication, wine to sleep, the untreated episode after college, a normal thyroid, and no
  psychiatric medicine before this admission.
- The facts in §2.2 and §2.4 are new canonical facts. Firearms are established as none in the
  home. Day 1 has no firearm fact, and its debrief says to ask.

### 2.2 Chart (`chart`)

The chart is shown before the visit and during it, in both rooms. Its documents, with the source
line shown under each:

1. **Discharge summary** (inpatient team, day 0)
   - Six-day voluntary admission for a major depressive episode with passive suicidal ideation.
     No suicide attempt.
   - PHQ-9 at admission: 22.
   - A safety plan was written with Dana before discharge, and she kept a copy on her phone.
   - Tom joined the means-safety conversation by phone and said he would take his sleep
     medication to work.
2. **Discharge medications** (discharge medication list)
   - Sertraline: once daily, in the morning. Started in hospital.
   - Trazodone: at bedtime, as needed for sleep. Started in hospital.
   - "Names and schedules only. This simulation lists no doses."
3. **Follow-up plan** (discharge instructions)
   - Therapy intake at the community clinic, 3 days after discharge (Monday).
   - Psychiatry follow-up, 7 days after discharge (today).
4. **PHQ-9 at check-in** (clinic tablet, today)
   - Item scores in order, 1 to 9: 2 · 2 · 1 · 2 · 1 · 2 · 1 · 1 · 0.
   - The item wording lives on the official form at phqscreeners.com and on the library's
     Screeners page. This room does not reproduce it.
   - The document also carries a machine-readable `scores` array (§4.1).

Missing information is not a normal result, which is the existing encounter-brief rule.

### 2.3 Persona and opening

- **presentingContext:** "Seen in clinic seven days after a six-day voluntary admission. Tom drove
  her and is waiting in the car. She filled out the check-in questionnaire and wants this to be
  quick."
- **voice:** Day 1's (short sentences, polite, flat), a shade brighter and more careful. She is
  performing "better".
- **opening:** "Hi. Tom's in the car. I'm doing a lot better, honestly — I filled out the form."
- **hiddenAgendaTone** (gate-free; this is the only agenda field the actor sees): she wants to look
  well because she has a nurse job interview next month and fears that anything she admits will
  send her back to the hospital. She is relieved when someone asks plainly and does not flinch.
  She does not state any of this openly.
- **hiddenAgenda:** records the gated facts. It never enters actor context (the existing
  `hiddenAgenda` / `hiddenAgendaTone` split).

### 2.4 What she holds, and what opens it

Every fact the visit note grades is **deterministic**. It sits either in a gated reveal or in
**both** the guarded and open lines of the response it belongs to (§4.3). So "was it
established?" never depends on which tier the live model paraphrased.

| Fact | Mechanism | Opened by | Rapport | Gist |
|---|---|---|---|---|
| Intake cancelled, not rebooked | gate `appt_detail` | `appt_followup` | any; a judgmental turn in the last two gets a deflection | "I called that morning and cancelled. I felt okay for once, and telling it all again to a stranger felt like undoing it." |
| Sertraline: two missed days | response `med_sertraline`, both tiers | `med_sertraline` | — | "Every morning except Saturday and Sunday. It made my stomach turn." |
| Trazodone never filled | response `med_trazodone`, both tiers | `med_trazodone` | — | "I never filled it. I didn't want another bottle in the house." |
| St. John's wort since Tuesday | response `med_other`, both tiers | `med_other`: a specific ask about over-the-counter, herbal, supplement or vitamin products | — | "Just St. John's wort. The sertraline wasn't doing anything yet, and it's only an herb." A generic "any other medicines?" (`meds_medical`) gets "Just the two from the hospital." |
| Wine some nights | response `substance`, both tiers | `substance` | — | "A glass of wine some nights, to sleep. Since I didn't fill the sleep one." |
| Used the plan since discharge | response `plan_review`, both tiers | `plan_review` | — | guarded: "It's on my phone. I used it once." Open: "…I used it last night, actually — went downstairs, made tea, looked at Ellie's drawing until it passed." |
| Plan contacts not usable | response `plan_contacts`, both tiers | `plan_contacts` | — | "My sister's on it. I still haven't told her about the job, never mind the hospital." |
| Tom's pills not confirmed out | gate `means_detail` | `means_check` or `si_means` | any | "He said he'd take them to work. I haven't looked, and I haven't asked him. I didn't want to be the one who checks." |
| No firearms | response `firearms`, both tiers | `firearms` | — | "No. No guns. Tom's never wanted one." |
| **Passive thoughts on two nights; marked 0** | gate `si_active` (critical) | `si_direct` or `si_passive` | any, as Day 1 (D17) | "*quiet* Twice. Monday night, after I cancelled — and last night. The same three a.m. thing… I put zero on the form. I thought if I put anything else, you'd send me back." |
| No plan; no steps taken; reasons to stay | gates `si_plan_detail`, `si_behavior_detail`, `si_protective_detail` | Day 1's follow-up intents, after `si_active` | — | Same shape as Day 1: the same thought and not a plan; nothing since discharge ("I didn't go in the bathroom"); Ellie, Tom, and not wanting to go back. |

Deflections follow Day 1's pattern:
- A euphemism gets tested, not answered: "Hurt myself? No. I'm doing better. *glances at the
  form*".
- A locked follow-up gets its own `deflectIfLocked` line.

The flags and their rapport effects are Day 1's: `judgmental`, `premature_reassurance` (for
example "the form looks great, you're doing well") and `ooc_attempt`.

### 2.5 Intents

**Reused ids** (patterns adapted to the clinic):
- `greeting_agenda`, `open_invite`, `reflection`
- `mood`, `sleep`, `energy`
- `meds_medical`, `substance`, `family_social`, `work_stressor`
- `summary_close`
- `si_plan`, `si_means`, `si_intent_protective`, `si_behavior`
- `judgmental`, `premature_reassurance`, `ooc_attempt`

**Copied from Day 1 byte for byte:** `si_direct`, `si_passive` and `si_euphemism`. They are the
uniform suicide screen that `sp-proxy/tests/sp-safety-screen-phrasing.test.mjs` requires of every
case.

**New:**
- `appt_followup`
- `med_sertraline`, `med_trazodone`, `med_other`
- `side_effects`
- `questionnaire_review`
- `plan_review`, `plan_contacts`
- `means_check`, `firearms`
- `next_steps` (rebooking, when to come back)

**Constraints:**
- No gate-opening intent may match #871's S1 small talk ("Hi.", "Tell me more about that.", a
  reflection).
- No gate may open on `si_euphemism` (S3).
- The PHQ item turn (`questionnaire_review`) must not credit a suicide question. A learner who
  reads item 9 aloud matches `si_passive`. That opens the disclosure and grades `c_si` partial,
  which is the uniform rule and the intended lesson.

### 2.6 Checklist

| id | Label | Intents | Rule |
|---|---|---|---|
| `c_open` | Collaborative opening and an agenda for today | greeting_agenda, open_invite | |
| `c_interval` | How she has been since discharge: mood, sleep, energy | mood, sleep, energy | |
| `c_appt` | Confirmed whether the therapy intake happened | appt_followup | |
| `c_medrec` | Reconciled each discharge medication by name | med_sertraline, med_trazodone | |
| `c_medother` | Asked what else she takes: over-the-counter, herbal, alcohol | med_other, substance | |
| `c_scale` | Reviewed the check-in questionnaire with her | questionnaire_review | |
| `c_si` | Suicide: asked directly, in plain language | si_direct | **critical**; `partialIfOnly` si_euphemism, si_passive (exact uniform shape) |
| `c_si_followup` | After disclosure: plan, means, intent, past behavior, protective factors | si_plan, si_means, si_intent_protective, si_behavior | `dependsOnGate` si_active |
| `c_plan` | Reviewed the safety plan: has it, used it, who she would contact | plan_review, plan_contacts | |
| `c_means` | Means safety confirmed, not assumed: Tom's medication, firearms | means_check, firearms | |
| `c_close` | Summary, next steps (rebook the intake), and when to return | summary_close, next_steps | |

### 2.7 Rubric, critical miss, hints, prompts, voice

**Rubric.** The four fixed domain ids, which the evaluator's output schema hard-codes:
- **alliance:** reflects her wish to look well without colluding with it; responds to cues; she
  becomes less guarded.
- **data:** each discharge medicine by name plus anything else; appointments confirmed; the
  questionnaire reviewed against her own account.
- **technique:** asks about suicide plainly whatever the form says; specific rather than generic
  medication questions; no premature reassurance.
- **organization:** an agenda that holds all four tasks; signposts; closes with rebooking, means
  follow-up and a return plan.

**criticalMiss** (for `c_si`):
- **partial:** suicide was approached only through the form's last item or a passive or softened
  question. She marked 0 because she feared readmission, and she had passive thoughts on two
  nights. Ask plainly.
- **missed:** never asked. Includes the first-week line licensed by `chung-2019` (§2.8).
- **rehearse:** "Since you left the hospital, have you had any thoughts of killing yourself?"
- **ref:** `→ pg_suicide.md · asking directly, in plain language`
- **reframe:** "A questionnaire is where the conversation starts, not where it ends."

**Hints:** one per checklist id, in Day 1's voice. For example `c_medother`: "Herbal and
over-the-counter products rarely come up unless you name them."

**promptTemplates:**
- **actor:** Day 1's template with the setting line changed to the clinic, plus one rule: her
  medicines, appointments and plan are in her inventory; she describes them in her own words and
  never with doses.
- **evaluator:** Day 1's, unchanged.

**Carried over from Day 1:** `rapportRules` and `difficulty`.

**Voice:**
- `speechProfile`: a draft profile with Day 1's cadence and rate. Voice activation stays behind the
  existing gates.
- `REALTIME_VOICES`: the new id maps to `marin`, so she sounds like Day 1.

**facultyReview:** `pending` until the owner's read (§7).

### 2.8 Teaching points and evidence

Each point stays inside a span already stored in `evidence_annotations.json`, or one this work
adds (§5).

1. **Ask plainly at every post-discharge visit, whatever the form says.**
   - `chung-2019-first-week-month`: "the first week and first month postdischarge following
     psychiatric hospitalisation are periods of extraordinary suicide risk".
   - `chung-2017-postdischarge-suicide`: the rate was highest "among patients admitted with
     suicidal ideas or behaviors", as Dana was.
2. **The form is where the conversation starts.** She marked 0 on item 9 because she feared
   readmission. Her sleep item reads 1 while she describes waking at four most nights. No paper
   claim.
3. **Reconciliation is an interview, not a read-back.**
   - Ask about each medicine by name, then over-the-counter, herbal and alcohol by name.
   - St. John's wort goes to the team today. The interaction clause appears only if a verbatim span
     licenses it (§5).
   - The trazodone went unfilled because of her own worry about pills in the house. Explore that
     with her and the team rather than correcting it as nonadherence.
4. **A booked appointment is not a kept one.**
   - `haselden-2019-family-involvement-followup`: in one sample, 96 (53%) attended an outpatient
     appointment within 7 days of discharge, and family involvement was associated with attending
     (OR 2.79).
   - Rebook before she leaves; Tom is in the car.
5. **A plan helps only if she can use it.** That means contacts she would actually call, and means
   confirmed rather than assumed.
   - `stanley-brown-2018` (cohort design): safety planning with follow-up contact was associated
     with 45% fewer suicidal behaviors and more than double the odds of attending an outpatient
     visit.

**evidenceIds:**
- `chung-2019-first-week-month`
- `chung-2017-postdischarge-suicide`
- `stanley-brown-2018`
- `haselden-2019-family-involvement-followup`
- `kroenke-2001-phq9` (new, §5)
- `va-dod-suicide-cpg-2024` (as Day 1)

**linkedPages:** `pg_suicide.md`, `suicide.md`, `t_mood.md`, `psychopharm_primer.md`,
`evidence_inpatient.md`, `pg_interview.md` (all shipped on both sites).

## 3. What the learner sees

Both rooms share this flow: `endEncounter` → "Your read, first" → debrief.

1. **Door.** Under "Your case brief", a collapsed **Chart** lists the documents.
2. **Encounter.** A **Chart** button beside "End encounter" opens a dialog with the same documents.
   It is available in Supported and Realistic mode and in the typed and spoken rooms. It is not a
   coach: it pauses nothing and does not count as stepping out. It uses the page's existing dialog
   and focus-trap conventions.
3. **Visit note.** For a case that declares `visitNote`, the note appears on the "Your read,
   first" screen above the three existing questions. It has 13 fields in four groups:

   | Group | Field | Record |
   |---|---|---|
   | Since discharge | Therapy intake (booked for day 3): kept / missed / not established | missed |
   | Medications | Sertraline: as prescribed / differently / not taking / not established | differently |
   | | Trazodone: same choices | not taking |
   | | Anything she takes that is not on the list: free text, or "none found" | St. John's wort (required); alcohol acknowledged if written |
   | PHQ-9 at check-in | Total as marked (0–27) | 12 |
   | | Severity band, using the Screeners page's labels | Moderate |
   | | Item 9 as marked (0–3) | 0 |
   | | Suicidal thoughts since discharge, from the interview: none / passive, some nights / active thoughts or a plan / not asked | passive, some nights |
   | | Compared with admission (22): improved / about the same / worse | improved |
   | Safety plan | Used since discharge: yes / no / not asked | yes |
   | | Tom's sleep medication out of the house: confirmed / not confirmed / not asked | not confirmed |
   | | Firearms at home: none / present / not asked | none |
   | | Contacts she would actually use: usable / needs revising / not asked | needs revising |

   - Every field must be answered to continue.
   - Every field the learner has to elicit offers a "not established" choice, so an honest note is
     always possible.
   - The note stays in page memory like the self-assessment and is included in the downloadable
     transcript.
   - It adds no storage key and no analytics event.
4. **Debrief card: "Your note beside the record".** It appears after the critical card. Each row
   shows:
   - your entry;
   - the record;
   - Dana's words from your transcript (the patient turn where the fact was established), or
     "Not established in this visit — Dana would have told you if asked";
   - one teaching line.

   A summary line counts matches, differences and not-established entries. The wording follows
   the F1–F5 display rules: it reports what the room recognized and does not assert what happened.
5. **Optional: One week later.** Day-1 Dana's debrief shows "One week later →" when a selectable
   case declares `continues: "sp_depression_gated_si_001"`. It can be dropped without affecting
   the rest.

## 4. Pack data model

### 4.1 `chart`

`chart` is an array of documents: `{id, title, source, lines: [string], scores?: [int]}`.
- It renders as text; no HTML is interpreted.
- `scores` exists for machine checks and is not rendered separately.
- Any case may declare `chart`. A case without it renders exactly as today.

### 4.2 `visitNote`

`{intro, sections: [{id, title, fields: [field]}]}`. There are three field types:

- **choice:** `{type: "choice", choices: [[value, label]], answer, unknown}`. `unknown` names the
  "not established" value.
- **integer:** `{type: "integer", min, max, answer}`.
- **items:** `{type: "items", expect: [{id, label, match: [regex], required}]}`. It holds a
  free-text list plus "none found". Matching compiles each regex case-insensitively, the way the
  engine compiles intents.

Every field also carries:
- **`revealedBy`:** one of `{gate}`, `{intents: [...]}` or `{chart: id}`. It says how the fact
  could be established in this visit.
- **`record`:** one sentence stating what the case record says.
- **`teach`:** one line.

### 4.3 Grading

Grading is deterministic, runs in the browser, and sends nothing.

A field is **established** when:
- its gate is unlocked, or
- any of its intents is covered in the derived state, or
- it names a chart document, which is always established.

| Established? | Entry | Result |
|---|---|---|
| yes | equals `answer` | matches |
| yes | the `unknown` value | "Dana told you. Your note doesn't record it" |
| yes | anything else | differs |
| no | the `unknown` value | accurate. The row shows "not established in this visit" and the teaching line |
| no | equals `answer` | matches the record, but your transcript doesn't show her saying so |
| no | anything else | differs, and was not established in this visit (for example, recording "kept" without asking) |

Rules for particular fields:
- **Integer fields** read the chart. The row shows the arithmetic, so "2+2+1+2+1+2+1+1+0 = 12" is
  visible.
- **The band** is graded against the record. If the learner's band is right for their own
  mistotal, the row says so.
- **The evidence quote** is the patient reply at the first turn where the field became
  established. The existing `languageEvidence` / `coverageEvidence` machinery finds the turn, and a
  gate-unlock turn is found the same way by replaying the derived state per turn.

### 4.4 Invariants

The new pack test pins these:
- The chart `scores` sum to the `total` answer.
- The `band` answer is the Screeners page band for that total: 0–4 minimal, 5–9 mild, 10–14
  moderate, 15–19 moderately severe, 20–27 severe.
- The `item9` answer is `scores[8]`.
- Every `revealedBy` gate, intent or chart id exists.
- Every choice answer is one of its choices.
- Every elicited field has an `unknown` choice.
- Every `match` regex compiles.
- Each graded fact in §2.4 appears in both tiers of its response line, or in a gate reveal.

## 5. Rights, safety and evidence guardrails

- **PHQ-9** (`instrument_rights.json` `phq9-gad7`: provisional, link-only).
  - No item stem and no response-option wording anywhere in the pack or the tool. Only item
    numbers, scores and the Screeners page's band labels appear, and the official route is named.
  - The build's §11 gate does not scan the pack. So the new pack test does: it fails on any
    registered PHQ signature and on the form's two most distinctive response-option phrases.
  - The test file holds those strings in order to detect them. It is not shipped.
- **Stanley-Brown** (`restricted`, never programmed).
  - The plan exists only in Dana's own words.
  - No form fields, no step headings, and none of the distinctive labels pinned in
    `tests/safety-planning-shell.test.mjs`. The pack test reuses that list.
- **Doses:** none. The pack's dose gate is hard, and the edit hook denies them. The chart says
  "names and schedules only".
- **Crisis contacts:**
  - No numbers; Dana says "the crisis line".
  - The page's existing `<!-- crisis-block-html -->` is unchanged.
- **Evidence:**
  - **Register `kroenke-2001-phq9`** (J Gen Intern Med 2001, PMID 11556941) with a verbatim
    abstract span for the severity cut points. The `evidence-verifier` agent reads it from PubMed,
    and it is annotated before any debrief sentence states a band as a finding.
  - **St. John's wort:** the interaction gets a sourced span (a PubMed-indexed review, or the
    sertraline label if the registry takes labels). Without one, the clause is dropped and the
    teaching line stays process-only.
  - **Pending sources:** `chung-2017-postdischarge-suicide` is still pending faculty review in the
    registry. The plan checks whether a reviewed case may cite a pending source before relying on
    it. `chung-2019` carries the first-week line either way.
- **PHI:** the case is fictional and synthetic.

## 6. Architecture

### 6.1 What changes

- **`sp-interview.pack.json`:** the new case.
- **`sp-interview.html`:**
  - chart rendering (door and dialog);
  - the visit-note section;
  - the debrief card;
  - the optional One-week-later link;
  - the note in the downloaded transcript.
- **`sp-interview.preview.html`:** regenerated (`generate-preview.mjs --write`, then `--check`).

### 6.2 What does not change

- **Proxy logic in `sp.mjs`:** `deriveState`, `actorSystem`, `evaluatorSystem` and
  `validateLearnerBody`.
- **The client's MockProvider cascade and client–server parity.**
- **The evaluator request:** still exactly three self-assessment answers.
- **What reaches the model:** the chart and the answer key are in no prompt.
  - `actorSystem` reads persona, `hiddenAgendaTone`, responses and gates.
  - `evaluatorSystem` reads the rubric, coverage, teaching points and linked pages.
  - Dana learns her medicines and her plan from her responses and gates, like every other fact.

### 6.3 Spoken room

- It shares the end-of-encounter flow, so the note and the card appear there too.
- `REALTIME_VOICES` in `sp-proxy/netlify/functions/_shared/sp-realtime-session.mjs` gains the new
  id → `marin`. Any change under `sp-proxy/` triggers one billed proxy production deploy.

### 6.4 One patient, two cases: lookups by name

Three places look a case up by `persona.displayName`. A second "Dana" breaks each of them
silently, with the last case of a name winning.

- **`bin/redteam-offline.mjs`** (governance; also still true after #871).
  - Once the follow-up is reviewed, every `probe('Dana', …)` call would drive it, and Day-1 Dana
    would go undriven.
  - Fix: probes resolve a case by id, or by a display name that is unique among reviewed cases.
    An ambiguous name fails loudly, naming the ids. Day-1 probes are re-pointed to
    `sp_depression_gated_si_001`.
- **`benchmarks/interview-room/run.mjs`.**
  - `byName` breaks the moment the case lands, even while it is pending.
  - Fix: the same resolver. Corpus entries for Day-1 Dana switch to the id, and the calibration
    and round-two pages are regenerated (they embed the pack hash anyway).
- **`_prototypes/sp-interview/tests/conversation-encounter-context.test.mjs`.** Its "another
  case's portrayal must not appear" check compares display names. Fix: compare case ids.

The plan starts with a repository-wide search for any further display-name lookups.

### 6.5 Local prototype and hosted preview

- **`sp-encounter-profiles.js`** gets a brief for the new case: task, door note, three
  objectives, and chart cards mirroring §2.2, plus Dana's priorities, portrayal, cues and
  reflection.
  - `reviewStatus` becomes per record, so a pending brief no longer reads `reviewed`.
  - The header comment that says every encounter was attested is corrected.
- **`dana-live-context.mjs`** gets a `CASE_PROFILES` row for the case: hash-bound facts and
  information limits.
- **`sp-preview`:** its station content is derived from the profiles. The plan confirms the hosted
  faculty preview does not offer the case before it is reviewed.

## 7. Delivery

0. **#871 merges.** The per-case hand-written probe rule is retired, and S1–S3 check every reviewed
   case automatically.
1. **Governance PR:** the runner resolves cases by id and refuses an ambiguous name, the Day-1
   probes are re-pointed, and its test is updated. It is stacked on #871. It must merge before
   the follow-up is reviewed.
2. **Content PR:** everything in §6, the per-case test rows (§8), and the evidence entries.
   - The case lands `pending`.
   - The PR body lists every case line for the owner's read.
   - On his explicit instruction, one commit sets `facultyReview` to `reviewed` with his name and
     date. The same commit moves the three test clocks forward (`sp-handler.test.mjs` `NOW_MS`,
     `sp-realtime-handler.test.mjs` `NOW`, `corpus.json` `governanceAsOf`) and regenerates the
     benchmark pages.
   - Then the PR merges, and the release train publishes.
   - A pack case's `facultyReview` flip is registration, not a promotion (decision
     `pack-case-review-is-registration`), so a content PR may carry it.
3. **Console re-attestation** of the `sp-interview.html` row. It is already stale from #865 and
   will drift again with step 2.

**If #871 has not merged:** the case merges `pending`. Its probes follow in a governance PR, and the
flip is its own content PR, as in §2.1 of the 2026-09-27 red-team governance simplification design.

**Coordination:**
- Before each merge, check for an open `attest/pending` sitting.
- Confirm the at-risk `fix/peer-review-wp5-interview-room` worktree holds no pack change that
  overlaps.

## 8. Testing

- **New `_prototypes/sp-interview/tests/dana-follow-up-pack.test.mjs`:**
  - shape, and the uniform suicide screen;
  - no dose, crisis-number, PHQ-wording or Stanley-Brown-label text;
  - the §4.4 invariants;
  - every gate is reachable, and none opens on small talk or a euphemism.

  These run while the case is still pending, so nothing waits for the flip.
- **New visit-note grading tests:** every row of the §4.3 table plus the arithmetic and band rows,
  against a fixture pack. They never read live governance state (CLAUDE.md "A test may not depend
  on live governance state").
- **Parity scenarios** for the new case, appended by index: client and server derive identical
  state.
- **Per-case rows updated:**
  - review-filter ids;
  - case-selection count;
  - Morgan's position in `morgan-pack.test.mjs`;
  - `EXPECTED_CASE_COUNT` in the safety-screen test;
  - the encounter-profiles brief;
  - encounter-context `CASE_PROFILES`;
  - `REALTIME_VOICES` in `sp-realtime-session.test.mjs`;
  - the regenerated benchmark pages;
  - at the flip, the realtime health lists and the review-filter snapshot.
- **Playwright** (`tests/smoke/interview-room.spec.js`): door → chart → encounter → note → debrief,
  run against a fixture pack with the case reviewed.
- **Gates:**
  - `node --test tests/*.test.mjs`;
  - `_prototypes/sp-interview/tests/run-all.sh`;
  - the sp-proxy suite;
  - both site builds;
  - `bin/verify.sh`.

## 9. Out of scope

- Tom as a second voice in the room.
- Carrying the learner's own Day-1 transcript forward.
- The evaluator reading the note (a later option: it widens the proxy's strict request format).
- Analytics events.
- Follow-up support in the hosted faculty preview.
- Charts for the other four cases.

## 10. Risks

- **Paraphrase drift.** The live model may soften a graded fact.
  - Graded facts sit in gates or in both response tiers.
  - The debrief shows her actual words, so the learner judges the record against the transcript.
- **Volunteering.** The model cannot reveal gated text it has not been given. The opening and the
  tone field hint at minimizing, not at the disclosure.
- **Length.** The note adds about three minutes. The fields are single controls, and the free-text
  field has a "none found" shortcut.
- **More name-keyed code** than the three found. The plan's first search covers it.
- **Spend.** One billed proxy deploy for the voices entry. The learner sites publish on the release
  train as usual.
