# Safety Planning Practice — Content Spec v1 (DRAFT FOR AUTHOR SIGNATURE)

**For:** WP-06R-b · "Safety Planning Practice — the six-step conversation"
**Status:** ⚠️ **DRAFT — not attested, not author-approved.** Every clinical string below is a first draft for Joshua Moss, MD to redline and sign. Claude Code may build the shell against this structure but must not treat any string as final until the author marks it so.
**Scope decision (author, 2026-08-20):** **generic**, not Maine-specific. Jurisdiction-dependent content is marked `LOCAL_POLICY` and left as a token.

---

## 0. Reproduction discipline — read before writing any string

The Stanley–Brown Safety Plan form is copyrighted (Stanley & Brown, 2008, 2021) and written permission is required to reword, adapt, **or program** it. This spec therefore:

- **reproduces no field label, prompt, or instruction from the form;**
- teaches the **method** — six conversations — under original headings;
- cites **Stanley & Brown 2012, *Cognitive and Behavioral Practice*** as the source of the method;
- links out to the official form at suicidesafetyplan.com and to the unit's own version;
- never calls its output "a Stanley–Brown Safety Plan," and never produces an output document at all.

If a future permission grant arrives, that changes what a *later* version may do. It does not change this one.

**Repo rule this instantiates:** *the library teaches administration; it does not reproduce instruments.*

---

## 1. What the tool is, and what it deliberately is not

**Is:** a rehearsal tool. The learner produces the actual sentence they would say, then compares it to a model, self-rates, and the card spaces. Same loop as `family-systems-practice.html`, which is the strongest instructional design in the repo.

**Is not:**
- a form-filler,
- a document generator,
- a place to type anything about a real patient.

**Enforced in code, not asserted in copy:**
- no persisted free text; practice cases are synthetic and supplied (§5)
- **no export button of any kind** — this is the `verdict()` failure mode and the worst PHI surface the library could add
- storage keys `cw_*` / `rp_*` only; no-PHI banner above the fold
- the learner's spoken/typed rehearsal is never recorded

**Loop, per step:** clinical task (one line) → **learner produces their opening line first** → reveal model line + self-check criteria → named traps → self-rate (Again/Hard/Good/Easy) → `cw_srs_v1`.

---

## 2. The six conversations

> Headings are original to this library. Ordering follows the published method.

### Step 1 · Finding the slope, not the cliff

**Task.** Get this patient's own early-warning signature, in their words, specific enough that they could actually notice it.

**Model line.**
> *"Think back to the last time things got really bad. What was going on a day or two before the worst of it? Not the worst part — the part just before."*

**Self-check.**
1. Did you anchor to a **specific past episode** rather than asking in general?
2. Is what you got **observable** — a behaviour, a thought, a time of day — rather than "feeling bad"?
3. Is it in **the patient's words**, not yours?

**Traps.**
- *The general question* — "What are your warning signs?" gets you a shrug or a textbook answer.
- *The clinician's warning signs* — you write "increased social withdrawal"; the patient would have said "I stop answering my sister."
- *Starting at the cliff* — asking about the worst moment gets you the crisis, not the runway. The runway is the part they can act on.

---

### Step 2 · What you can do alone

**Task.** Things this person can do **without involving anyone else**, that have actually worked before.

**Model line.**
> *"When you've gotten through a bad night before without calling anyone — what did you do? Even if it seems small, or stupid."*

**Self-check.**
1. Did you ask what has **worked before** rather than offering suggestions?
2. Is it doable **at 3 a.m., alone, with no money and no car**?
3. Did you test it out loud — *"Would that actually be possible on the worst night?"*

**Traps.**
- *The clinician's list* — you offer deep breathing and a warm bath; nothing on the list is theirs, so nothing on the list gets used.
- *The untested strategy* — "go for a walk," from someone who does not leave the apartment when it is bad.
- *Skipping the feasibility check* — a strategy that quietly requires daylight, a working car, or another person.

---

### Step 3 · Somewhere else to be

**Task.** Interruption, **not disclosure**. People or places that break the spiral without any conversation about suicide.

**Model line.**
> *"Who could you be around, or where could you go, just to not be alone with it? You wouldn't have to talk about any of this."*

**Self-check.**
1. Did you make explicit that this is **not** the telling-someone step?
2. Is it available **at the hours the crisis actually happens**?
3. Is it a **named** person or place, not "friends" or "out"?

**Traps.**
- *Collapsing three and four* — **the most common learner error.** The distraction step becomes a second disclosure step, the patient balks, and you lose both.
- *The unavailable setting* — the coffee shop that closes at six, in a crisis that happens at midnight.
- *Names without a route* — a person listed with no way to actually reach them.

---

### Step 4 · Who you'd actually tell

**Task.** People this patient **would** tell — not people who **should** be told.

**Model line.**
> *"Who's someone you could tell that it's a bad night? Not the whole story if you don't want — just that it's bad."*

**Self-check.**
1. Did you ask who they **would** tell, not who they **should**?
2. Did you ask **what would make it hard** to reach out to that person?
3. Does that person **know they are on the plan**?

**Traps.**
- *The obligatory family member* — the mother the patient hasn't spoken to in two years goes on the list because it looked thin.
- *Support that has never been asked* — the person named has no idea. *(Matches the library's existing family-systems rule: do not write "family supportive" without specific tasks.)*
- *Skipping the barrier* — you never ask what would stop them from calling, so you never find out the plan is already dead.

---

### Step 5 · The professional layer

**Task.** Real numbers, in the patient's phone, with realistic expectations about what happens when they call.

**Model line.**
> *"If it's the middle of the night and the people on your list aren't enough — who do you call? Let's put the number in your phone right now, before you leave."*

**Self-check.**
1. Is the number **in the patient's phone, now** — not on a handout?
2. Does the patient know **what actually happens** when they call?
3. Is there a **named clinician and a scheduled appointment**, or just an agency?

**Traps.**
- *The handout that goes in a drawer* — a printed number is not an accessible number.
- *The unexamined fear of calling* — many patients will not use a crisis line because they believe it means police or commitment. If you never ask, you never learn that this step is decorative. Ask: *"What do you think would happen if you called?"*
- *The agency without an appointment* — "follow up with outpatient" is not a step. *(Matches the existing rule: do not rely on a phone number when an appointment should be scheduled.)*

`LOCAL_POLICY:crisis_contacts` — the crisis line, the unit's after-hours number, and the local mobile crisis service. In the US the national line is **988**. ⚑ *Author: confirm what you want listed and whether the resident and MS3 builds should differ.*

---

### Step 6 · Time and distance from means

**Task.** Put time and distance between this person and the method they would most plausibly use.

**Model line.**
> *"I ask everyone this, and it isn't about taking anything away from you. When things are at their worst, what's within reach? Let's think about how to make that harder to get to for a while."*

**Self-check.**
1. Did you **normalise before asking** — "I ask everyone this"?
2. Did you ask about **firearms specifically**, rather than waiting to be told?
3. Did you land on a **concrete change, a named person, and a timeframe** — not "be careful"?

**Traps.**
- *Waiting to be told* — means access is never volunteered. It is asked about.
- *The confiscation frame* — framing it as removal starts an argument and ends the conversation.
- *The unowned action* — "we'll secure the medications," with nobody named and no date.
- *Firearm avoidance* — the clinician's discomfort becomes the patient's risk. This is the honest name for the most common failure in this step.

---

## 3. The lethal-means module

> Currently this content appears **once in the entire tool layer**, as a sub-clause. It is the step with the best outcome evidence and the one learners skip.

**Why this conversation is worth having — stated honestly.** Suicidal crises are often short-lived, and case fatality differs enormously between methods, so *which* method is within reach during the crisis matters more than most learners expect.

The evidence sits at three different strengths, and a learner should be able to say all three:

| Level | What the evidence shows |
|---|---|
| **Population-level means restriction** | **Strong.** Barriers at jumping sites (Cochrane pooled IRR ~0.05), pesticide bans (Sri Lanka, ~93,000 deaths averted), analgesic pack-size limits (fewer overdose deaths without substitution); 30-50% declines in method-specific rates. |
| **Individual lethal-means counselling** | **Thin but favourable.** One large quasi-experimental study found documented lethal-means assessment associated with a fall in 180-day attempt/death risk from 3.3% to 0.83% (P = .034) - in a sample where only 33% received it. A 2024 systematic review of 22 counselling studies found 14 of 19 reported improved safe-storage behaviour, but 77% were at high risk of bias. VA/DoD issues a **weak** recommendation. |
| **Firearm-legislation reviews** | **Weak, and honestly so.** A 2026 systematic review found stricter regulations associated with *"a small reduction, if any"* in suicide deaths, identified **no high-quality randomised trials**, and states that its ecological level of analysis *"precluded individual-level causal inference."* |

> **So the case for doing this rests on three things - the mechanism is sound, the intervention is cheap and low-risk, and guidelines recommend it. It does not rest on a demonstrated mortality reduction from counselling itself.** Say it that way if a student pushes, because a student who has read the primary review will push.

**What the plan as a whole does and does not do.** The safety-planning intervention with structured follow-up was associated with ~45% fewer suicidal *behaviours* and more than double the odds of attending outpatient care (OR 0.56; OR 2.06). Meta-analysis puts safety-planning-type interventions at RR 0.57 for suicidal behaviour (NNT 16) **and no effect on suicidal ideation.** No completed randomised trial of the full six-step plan exists, and VA/DoD 2024 rates the evidence low quality. Plan **quality** - not completion - carries the association with fewer attempts (AHR 0.79), with **warning-sign quality the most protective single step (HR 0.48)**; in one audit, lethal-means documentation quality averaged 1.29 out of 3 and 52.5% of at-risk inpatients had no plan at all. In children and adolescents, standalone safety planning is **null** across ideation, behaviour, attempts and re-presentation; family-integrated adaptations are the field's next move.

⚑ *Author: confirm the three-tier framing above; citations are listed in `SPEC_Therapy_Curriculum_Domains_v2_2026-08-21.md` §4 and are abstract-verified.*

**Firearms.** Ask directly, early, and without apology. The goal during a high-risk period is **temporary out-of-home storage** — with family, a trusted friend, or (jurisdiction-dependent) a licensed dealer or law-enforcement agency. If out-of-home storage is refused, work down the ladder rather than abandoning the conversation: a locking device; ammunition stored separately and elsewhere; the key or combination held by someone else.

`LOCAL_POLICY:means_storage` — ⚑ **Author: legal transfer rules and available storage options vary by state and this page must not guess.** Left as a token per the generic-for-now decision.

**Framing that works:** temporary · collaborative · "while things are hard" · "so you have time on your side."
**Framing that fails:** permanent · confiscatory · moralising · delivered as a condition of discharge.

**Medications.** Quantity is the lever — smaller quantities dispensed, a lockbox, or someone else holding them. Ask about over-the-counter as well; **acetaminophen is the one learners forget.**

**Who is actually in this conversation.** The person who controls access is frequently not the patient. That makes means safety a **collateral** conversation with its own consent considerations — link `collateral_workflow.md` and `family_playbook.md`.

**Document what was asked, what was found, what was agreed, who is doing it, and by when.**

**Ask again.** Means access changes. One conversation at admission is not a plan.

---

## 4. The close — who does what by when

**Task.** Convert a document into owned actions.

**Model line.**
> *"Let's go through it once more. Where will you keep this? Who else has seen it? Who's doing the thing with the [means], and when?"*

**Self-check.**
1. Does the patient **physically have it**, in a form they will actually have on them?
2. Is it **in the chart**?
3. Does the person who controls means access **know their part**?
4. Is there a **scheduled follow-up contact**, and does the patient know when?

**Traps.**
- *The plan in the chart only* — the patient doesn't have it.
- *The unshared plan* — the people on it don't know they're on it.
- *The paperwork close* — signed, filed, and nothing about the next bad night is different.

---

## 5. Practice cases (synthetic seeds — author to finalise)

Three, deliberately spanning the failure modes above. All fictional composites; no PHI.

1. **Pre-discharge, recurrent depression, minimises.** Middle-aged, admitted after an interrupted attempt, now "fine" and eager to leave. A firearm at home, mentioned once and not returned to. *Targets:* Step 6 avoidance, the confiscation frame, the paperwork close.
2. **Post-overdose, young adult, lives with parents.** Embarrassed, wants no one told. Medications in a shared bathroom cabinet. *Targets:* Steps 3/4 collapse, the obligatory family member, the collateral consent problem in Step 6.
3. **Consult / ED boarding, older man, recent bereavement, no prior treatment.** Stoic, brief answers, first psychiatric contact of his life. *Targets:* Step 1 anchoring, the unexamined fear of calling, and firearm avoidance in a patient the learner finds hard to read.

---

## 6. Reuse verbatim — do not rewrite

Two passages already exist in the library and both reviewers flagged them as content to protect. **Pull them from the source page rather than restating:**

- The **safety-plan-vs-no-suicide-contract** passage in `suicide_risk_safety_planning_inpatient_teaching.md` — states the harm mechanism, not just the prohibition.
- The **peri-discharge risk window** passage on the same page — *"treat discharge planning as a safety intervention, not paperwork."*
- The **outcome evidence** for the intervention with follow-up, as already quoted and cited on that page.

---

## 7. Author checklist before this ships

- [ ] Every model line reads like something you would actually say on your unit
- [ ] The six headings and all step text reproduce nothing from the copyrighted form
- [ ] `LOCAL_POLICY:crisis_contacts` and `LOCAL_POLICY:means_storage` filled or deliberately left as tokens
- [ ] Lethal-means framing and citations confirmed - *three-tier framing drafted 2026-08-21; author confirmation outstanding*
- [ ] MS3 vs resident scope decided — does the resident build get a harder case, or is this shared?
- [ ] Three practice cases finalised as fictional composites
- [ ] `facultyReview` set by you, not by the agent
