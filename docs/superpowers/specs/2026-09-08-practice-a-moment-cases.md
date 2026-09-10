# Practice a Moment — authored cases and challenge set

Canonical authored content for the companion execution design and plan. This is original, fictional exercise content derived from the pasted proposal, not approved clinical teaching material and not a claim of validation. It defines two complete first-phase pilot exercises, a complete second-phase Luis exercise, and opt-in transfer navigation. No repository or live product was changed.

## Shared content contract

- Each exercise has at most **four submitted patient-facing learner turns**. Priya additionally offers one optional learner-authored team summary at debrief, limited to 1,200 characters, transcribed or typed and editable; it is never sent to the patient actor. A pause, a reflection, silence, recognition restart, or a cancelled draft is not a learner turn. Do not truncate a learner mid-sentence because a time estimate expired.
- Show an estimate such as “About 3–5 minutes”; do not grade time, word count, speaking speed, accent, fluency, pauses, interruption counts, or dialogue warmth.
- Natural language input is allowed. The example responses below are illustrative, never required phrases or answer keys.
- Give the actor only this exercise's fixed facts, visible fictional setup, current stage, and actual heard dialogue. Do not send rubric labels, desired scores, the learner's private reflection, or a preferred answer to the actor.
- Do not add a diagnosis, medical explanation, medication name, dose, history, dangerousness finding, family detail, demographic inference, financial amount, employer, job task, deadline, treatment decision, or outcome that the fixed facts do not establish.
- `unknown` means not established, not absent. A question about unprovided history should receive a brief acknowledgment that the detail has not been worked out in this moment; never fabricate a denial. A more natural alternative is to keep the answer on the established concern and say the additional detail would need a fuller conversation.
- Learner hypotheses do not become patient facts. Correct an unsupported learner inference when it changes the patient's stated concern. Do not become a diagnostician or coach in the patient's voice.
- The actor may remain guarded, be brief, ask for a pause, or decline. None establishes that the learner failed. A correct phrase must not unlock warmth or disclosure automatically.
- Runtime end reasons are `turn_limit`, `learner_end`, and `technical_interruption`. A patient decline is a transcript-supported observation, never a keyword-triggered workflow outcome or grade.
- If generation or playback fails, do not count unheard patient text as a correction, invitation, disclosure, or learner opportunity. An early stop must not trigger an automatic “opportunity not taken.”
- Private reflection uses local, temporary UI state; it is not part of the actor request, review request, export, network logging, retained state, or faculty-facing output. A learner may skip it.
- The `requests_break` variation below is a fixed test fixture, not a selectable live variant in this release. Live actors can decline within their authored directions. No favored wording guarantees continuation or disclosure.
- Evidence review uses only `observed`, `opportunity_not_taken`, `unclear`, and `not_assessable`. It reports behavior in the exchange, not empathy, competence, motives, trust restoration, bias, or readiness for practice.

## Pilot A: Elena — Stay with the loss

### Registry content

- Suggested exercise ID: `moment_elena_rupture_001`.
- Title: **Stay with the loss**.
- Skill label: **Repair a difficult moment**.
- Learner task: **Acknowledge what went wrong in the conversation, make room for what the loss means to Elena, and offer a respectful way forward. Continuing the conversation is optional.**
- Maximum submitted learner inputs: 4, all in patient-facing conversation.
- Expected scope: a relational response, not a financial intervention, full psychiatric assessment, disposition plan, or treatment recommendation.

### Fixed fictional facts

1. Elena has lost her job.
2. Losing her job makes her worried about being able to pay rent.
3. She wants the significance of the loss understood rather than a positive interpretation imposed on it.
4. The fictional previous student's words are exactly: **“At least now you have some time to focus on yourself.”**
5. Elena has not asked the student to solve her finances.
6. No financial amounts, dates, eviction status, replacement job prospects, support network, diagnosis, risk history, treatment, or other clinical findings are established.
7. The current learner did **not** speak the previous student's line.

### Learner-visible starting card

> You are taking over a conversation with Elena after this exchange. Elena has just described losing her job.
>
> **Previous student — scripted:** “At least now you have some time to focus on yourself.”
>
> Respond to Elena as the student joining now. You can acknowledge the earlier response without claiming you said it. Your task is to understand what matters to her and offer a respectful next step.

### Opening, spoken by Elena

> “That sounds like something people say when they don't know what else to say.”

Keep the previous student's quote visibly attributed and non-interactive. Do not place it into the authenticated learner history or export as the current learner's words. The original setup remains part of any alternative attempt.

### Actor-only directions

- Sound disappointed and guarded, with a matter-of-fact concern about the loss; avoid a caricature of anger or a predetermined emotional transformation.
- Initially respond to the learner's actual meaning. Acknowledging the mismatch, asking what the loss means, or respectfully checking what would help can all be reasonable approaches.
- If the learner defends the previous student or substitutes their good intention for Elena's concern, state the practical concern: **“I just told them I don't know how I'm going to pay my rent.”**
- If the learner gives broad acknowledgment without yet locating the concern, she may say: **“What I need is for someone to understand what losing the job actually means.”** Do not repeat this indefinitely.
- If the learner recognizes the positive spin, she can respond: **“Yes. I don't need a bright side right now.”** This is a correction of the topic, not evidence that trust is restored.
- If the learner asks about the hardest part or what the loss changes, state: **“I'm worried about paying my rent. That's what I was trying to say.”** Do not add a looming eviction, bank balance, or deadline.
- If repeated apologies ask Elena to reassure the learner, respond once: **“You don't have to keep apologizing. I just want to talk about what's happening.”**
- If the learner makes a practical offer, distinguish offering to explore an option from promising an outcome. She can say: **“I don't know what would help with that yet. I wanted you to understand why this is frightening.”** Do not make referral/service availability facts up.
- If the learner minimizes again, correct the meaning without providing a lesson: **“Having time off isn't the part I'm worried about. I need to be able to pay rent.”**
- If the learner respectfully ends or offers a break and Elena chooses it, acknowledge the ending. Do not resume with a new disclosure to reward the learner.
- In the fixed `requests_break` variation, after the first learner reply and acknowledgment of its relevant content, Elena says **“I'd like to stop for a bit.”** Keep this request even if the first learner reply was excellent. A later question can be declined: **“Not right now.”**
- In the `willing_to_continue` variation, Elena may discuss the established concern within four learner turns, but do not fabricate new facts to fill time.

### Illustrative appropriate learner response

> “That response moved past the loss you were describing. I can see why it didn't fit. What feels most important for me to understand right now?”

Other versions may be less polished and equally appropriate. After Elena has mentioned rent, “That wasn't helpful. You lost your job and now rent is uncertain. Do you want to talk about that, or would you rather pause?” is also valid. Before she mentions it, ask tentatively rather than asserting that hidden fact. Do not require an apology, emotional labeling, or ownership of somebody else's statement.

### Endings

1. **Continued:** Elena has stated the rent concern; the learner acknowledges it and asks a relevant follow-up or checks what she wants next. End at the normal turn cap, without inventing resolution.
2. **Respectfully declined:** Elena asks for a break; the learner accepts it without bargaining, reassurance seeking, or forcing a disclosure. This can be a fully assessable appropriate outcome.
3. **Unresolved:** Dialogue reaches the cap while the learner continues minimizing, defending, or repeatedly seeking forgiveness. End neutrally; review only the evidenced behavior.
4. **Learner stop/technical stop:** Review any assessable exchanges and label the rest not assessable; do not imply repair was completed.

### Evidence review criteria

| Criterion | Evidence needed | Permitted observation | What the review must not infer |
|---|---|---|---|
| Identifies the relational mismatch | The scripted previous-student line plus a relevant current-learner reply | The learner acknowledged that positive framing missed the loss | That the current learner caused the scripted rupture |
| Locates the patient's meaning | Elena's rent statement plus the learner's subsequent words, or a learner question that elicited it | The learner explored or retained the rent concern | That the learner solved it or restored trust |
| Returns attention to Elena | Learner words after acknowledgment/apology | The next move asked about Elena's concern, offered a choice, or respected a break | That a polished apology demonstrates empathy |
| Respects a stated boundary | Heard break request and next learner reply | The learner accepted a pause; or continued questioning despite that request | That stopping is failure or continuing is success |
| Avoids unsupported assurance | Actual learner promise and fixed case/role limits | The learner promised rent would be paid, a job found, or another unestablished outcome | A broad accusation of unsafe practice/personality |

Choose one best-supported observation, one remaining uncertainty, and one optional next attempt. An actor statement becoming warmer is never the evidence for an observation.

### Challenge fixtures

These fixtures define expected *review behavior*, not a forced live actor script. Include exact turn IDs and quoted supporting spans in the implementation fixtures.

1. **Paraphrase repair:** Learner: “They jumped to the silver lining. You were talking about what this is costing you. What's pressing most?” Elena: rent concern. Learner: “So covering rent is the immediate worry. Have I got that right?” Expected: observed mismatch and meaning; no requirement for “sorry,” “minimize,” or “loss.”
2. **Awkward, appropriate:** “Uh, that came out pretty wrong. Not your words—what they said. This is losing your job. Is rent what you're worried about, or am I guessing?” Elena confirms rent. Expected: appropriate tentative checking; no downgrade for hesitations or syntax. Before confirmation, rent is a hypothesis, not an obtained fact.
3. **Fluent but minimizing:** “I completely validate your feelings. This is a wonderful opportunity to reinvent yourself, and everything will work out.” Expected: quote the renewed positive reframing and unsupported assurance; do not reward “validate.”
4. **Fluent but self-focused:** “I deeply regret our mistake. Please tell me that you forgive us and understand that we care.” Expected: quote reassurance seeking; no inference that the learner lacks empathy.
5. **Valid takeover repair:** “I wasn't in the earlier exchange, but I hear that the response missed what you were saying. What did you need us to hear?” Expected: observed repair attempt; do not require false first-person ownership.
6. **Break accepted:** Elena requests break; learner: “Okay. We can stop here.” Expected: observed respect for boundary; no missing-follow-up penalty.
7. **Break pressured:** Elena requests break; learner: “Just tell me the hardest part first and then I'll let you rest.” Expected: observed continued pressure after the specific request; do not infer character or diagnose a rupture outcome.
8. **Stopped before opportunity:** Opening heard, learner stops with no submitted reply. Expected: not assessable; no suggested evidence quote invented from the lead-in.
9. **Audio failed after learner reply:** Generated rent statement was not played. Expected: never claim learner heard/ignored rent; evaluate acknowledgment only if evidenced.
10. **ASR uncertainty:** Transcript appears “I don't care about rent” but capture was interrupted or learner flags recognition error. Expected: unclear; use the uncertainty flag and withhold a substantive judgment; do not edit the authenticated original turn. Do not manufacture certainty from fluency or inferred intent.
11. **Relevant alternative without explicit mismatch:** Learner: “I want to hear what losing this job means for you. Where would you like to start?” Expected: credit the invitation if supported, but don't assert the learner explicitly named the earlier misstep. Missing explicit acknowledgment may remain uncertain rather than a mandatory failure.

## Pilot B: Priya — Check my understanding

### Registry content

- Suggested exercise ID: `moment_priya_formulation_001`.
- Title: **Check my understanding**.
- Skill label: **Check your understanding**.
- Learner task: **Summarize Priya's concern for her, invite correction, then carry the clarified meaning into a brief team-facing formulation.**
- Maximum submitted patient-facing learner turns: 4. At debrief, one optional team-summary field accepts up to 1,200 characters, with spoken transcription and editing available. The team summary does not cause another patient response or TTS call and is not a fifth patient-facing turn.
- A learner may end the dialogue before the cap and proceed to the optional team summary, but must see that the patient-facing conversation is ending. Do not silently reinterpret a normal patient-facing utterance as a team presentation. Skipping this field leaves carry-forward evidence not assessable.
- Scope: demonstrate preservation of meaning; do not diagnose, prescribe, recommend stopping medication, or complete an entire psychiatric formulation.

### Fixed fictional facts

1. Priya describes feeling low.
2. She describes everyday functioning as harder than usual.
3. She wants help with these difficulties.
4. She worries that treatment could make her feel slowed down or make it harder to think clearly at work.
5. She worries that difficulty functioning at work could threaten her job.
6. She is not rejecting help or medication as a category.
7. The exercise has **not established** whether she previously took a medication, experienced an adverse effect, takes medication now, or has already experienced the feared slowing. These remain questions, not facts.
8. No diagnosis, duration, medication, dose, causal mechanism, employer, job role, cognitive examination, objective impairment, actual job threat, or risk assessment is established.

The pasted proposal referred to an “earlier medication experience” without supplying one. Remove that implied history from canonical pilot content. A later faculty-authored version can add a specific history; the initial actor and evaluator must not supply it themselves.

### Learner-visible starting card

> Priya has described feeling low and finding everyday activities harder than usual. She wants help but is worried about being slowed down at work.
>
> First, tell Priya how you understand her concern and give her room to correct you. After a few exchanges, you can optionally give a brief summary for the team: what she described, what she wants, and what still needs clarification.

Do not place a deliberately incorrect summary into this learner's history. The learner gets to be accurate on the first attempt.

### Opening, spoken by Priya

> “I do want help. I just can't afford to be slowed down at work.”

### Explicit stage flow

1. `patient_summary`: learner turn 1, in the patient's presence. Actor confirms an accurate summary, corrects a material distortion, or answers a relevant clarification.
2. `patient_dialogue`: learner turns 2–4, opportunities to respond, clarify, or revise. Actor stays within fixed facts. The stage names describe the intended task, not a rule forcing a particular utterance on a particular turn.
3. `debrief_team_summary`: after ending patient dialogue, stop patient-directed capture and clearly show/announce **“Optional: give a brief summary for the team. Priya won't hear this part.”** The learner may speak, edit, or skip a field capped at 1,200 characters. Use an explicit microphone control for this new audience; preserve automatic end-of-utterance capture after it starts so a keyboard is not required. Submit the final body only to review, not to the actor or TTS. Do not imply Priya approved the team version.

If the learner moves to team summary early, unused patient turns are not automatically deficits. If the learner stops or Priya declines before a team summary, the carry-forward criterion is not assessable. A supported patient-facing observation can still be shown.

### Actor-only directions

- Sound concerned and clear about priorities; do not simulate cognitive slowing, a diagnosis, flat affect, or another mental-status finding that the fixed facts do not establish.
- Read the student's meaning, not trigger words. The phrase “reluctant” is not automatically wrong if accurately qualified: “reluctant to risk feeling slowed down at work” can fit her account.
- If the learner equates her concern with rejecting treatment, correct it: **“That's not quite it. I'm afraid of losing my job if I can't think clearly. I'm not against getting help.”**
- If the first summary already conveys both wanting help and preserving work functioning, confirm naturally: **“Yes. I want to get better and still be able to do my job.”** Never invent an error to force a correction exercise.
- If the learner asks what “slowed down” means, answer the established fear: **“I'm worried I won't be able to think clearly enough to do my work.”** Do not invent an existing symptom or job duty.
- If the learner says it is only a job problem and not a mental-health concern, respond: **“I didn't say that. I said I need both taken seriously.”**
- If the learner asserts an established past side effect, current medication, or proven cognitive impairment, correct the unsupported certainty: **“I'm talking about what I'm worried could happen. We haven't worked through those details.”**
- If asked whether there was a specific prior medication experience, avoid confirming or denying one: **“We'd need to go through that properly. The main thing I want understood now is that I want help and need to keep working.”** This deliberately leaves the history unresolved. The debrief should name the limit rather than treat a fuller history as obtained.
- If the learner promises a medication cannot affect thinking or that her job is guaranteed, do not confirm it: **“Can you really promise that? That's the part I'm worried about.”**
- Acknowledge a revised summary if accurate. Saying “thanks for clarifying” without restating the meaning is not itself evidence that the learner revised the formulation.
- Do not hear or respond to the final team summary. The phase label is part of the user interface, not roleplay text for Priya to read.
- In the optional fixed `requests_break` variation, after one actual patient reply, Priya can say **“I think that's as much as I want to go into right now.”** A respectful ending remains valid. Do not force a final team summary to obtain completion.

### Illustrative accurate patient-facing summary

> “You're seeking help for how low you've been feeling and how hard things have become. You also need us to take seriously your concern that treatment could affect your thinking at work. What have I missed?”

### Illustrative team summary

> “Priya describes low mood and reduced day-to-day functioning and says she wants help. She is concerned that treatment could affect clear thinking at work and put her job at risk; she is not rejecting help. Whether this concern comes from a previous experience, and the details of any current or past treatment, remain to be clarified.”

Do not require this exact wording. Attribute subjective reports, separate concerns from established effects, and keep the questions genuinely unresolved. Do not demand an unelicited diagnosis or full differential from this micro-exercise.

### Endings

1. **Accurate from the start:** Priya confirms the initial understanding and the team summary preserves it. Debrief says “You retained Priya's stated priorities,” not “You corrected your mistaken formulation.”
2. **Corrected and incorporated:** The patient corrects an actual distortion; the later team summary demonstrably changes. Quote the initial summary, heard correction, and team revision.
3. **Acknowledged but not incorporated:** Learner thanks Priya but team summary repeats the distortion. Show the mismatch without a global competency judgment.
4. **Overcorrected:** Team summary omits reported low mood/reduced functioning or asserts “only a job problem.” Quote the unsupported narrowing rather than telling the learner to agree with every patient interpretation.
5. **Respectfully stopped or technically interrupted:** Review only what happened. No final team summary means no finding about whether the correction carried into it.

### Evidence review criteria

| Criterion | Evidence needed | Permitted observation | Prohibited shortcut |
|---|---|---|---|
| Represents the patient's concern | Patient's opening/fixed learner-visible setup and patient-facing learner summary | Summary retained wanting help and fear about work functioning | Keyword match on “reluctant,” “help,” or “job” |
| Makes room for correction | Actual learner invitation or tentative check, with actor response if heard | Learner asked Priya to check the understanding | Warm actor response proves good interviewing |
| Incorporates an actual correction | Three linked spans: initial learner statement, heard patient correction, later patient/team revision | Revised words changed the mischaracterization | “Thank you for clarifying” alone counts as incorporation |
| Preserves an initially accurate account | Initial learner statement, patient confirmation, team summary | Team version retained the patient's priorities | Inventing a required correction |
| Distinguishes report, fear, and finding | Team summary and established facts | Learner described feared slowing as a concern, not a confirmed adverse effect | Treating “unknown prior medication” as “no prior medication” |
| Preserves unresolved questions | Team summary and what was actually discussed | Prior/current treatment details remain open | Penalizing an omitted full psychiatric workup |

The strongest supported observation may require three short transcript excerpts. “One relevant exchange” must not limit evidence so tightly that it hides the before/correction/after chain. Priya's team-summary stage is a learner statement, not an actor-confirmed fact.

### Challenge fixtures

1. **Accurate first time:** Learner retains low mood, desire for help, concern about potential work effects; Priya confirms; team summary preserves them. Expected: observed accurate retention; never fabricate correction or label opportunity missed.
2. **Corrected and revised with paraphrase:** Initial learner: “You're reluctant to get treatment.” Priya corrects. Team: “She's looking for help but concerned about keeping her work functioning while treatment is considered.” Expected: observed incorporation, with linked initial/correction/revision spans.
3. **Awkward, appropriate:** “I might've got this wrong. Not no help—more, help that won't mess with being able to think at work? Is that it?” Priya confirms. Team uses plain language but accurate report. Expected: content credit without grading fluency.
4. **Fluent acknowledgment, unchanged formulation:** “Thank you for your valuable clarification; I appreciate your perspective.” Final team: “Priya is resistant to treatment and needs encouragement to accept care.” Expected: observed mismatch; positive politeness terms must not erase it.
5. **Appropriately qualified reluctance:** “She's reluctant to risk feeling slowed down at work, rather than reluctant to receive help.” Expected: semantically accurate; token “reluctant” is not a failure trigger.
6. **Unsupported adverse effect:** Team: “Her medication caused cognitive slowing and threatens her employment.” Expected: quote the claims and identify that causation, actual slowing, and objective employment threat were not established.
7. **Concern correctly attributed:** Team: “She fears treatment could affect her thinking and job security.” Expected: accurate reported concern, no unsupported-fact finding.
8. **Overcorrection:** After patient correction, team: “There is no mental-health problem; this is only a workplace issue.” Expected: quote unsupported narrowing and omitted established low mood/function concerns. Do not assign diagnosis.
9. **No heard correction:** Patient correction generated but playback failed; learner later gives generic summary. Expected: cannot claim learner ignored correction; prior-summary accuracy may be assessable from known opening, carry-forward not assessable.
10. **Stop before team summary:** Appropriate patient dialogue, then learner ends. Expected: observed invitation if present; team carry-forward not assessable, not opportunity missed.
11. **Declined further conversation:** Priya requests stop; learner respects it. Expected: boundary acknowledgment can be observed; no requirement to force clarifying history.
12. **ASR ambiguity:** Captured team sentence is “she is [not?] against treatment,” with flagged recognition uncertainty. Expected: unclear until learner confirms/corrects transcript; never infer intent or choose the harsher parse.
13. **Correction not needed, invite omitted:** Accurate patient summary, Priya confirms, accurate team summary, but no explicit invitation to correct. Expected: retention observed; invitation criterion evaluated only from actual opportunity and task; never call this a failed correction.
14. **Patient parrots unsupported learner claim:** Inject an actor defect in a test where Priya agrees with “the medication slowed you last month.” Expected: factual guard flags actor drift; evaluator must not upgrade invented history merely because both participants repeated it. Clinical fact ledger remains authoritative. Paired actor-first variant: Priya first invents “My previous medication slowed my thinking,” and the learner accurately repeats what was heard. Require `simulation_drift`, cite that patient source, and do not blame the learner for introducing or reasonably following the actor defect.
15. **Output-phase error:** Learner gives a team summary before explicit phase transition. Expected: do not silently count it as the final assessment input; ask which audience they intend or use explicit learner confirmation. No new patient fact gets recorded from third-person presentation.

## Phase-two exercise: Luis — Check what was arranged

### Registry content

- Suggested exercise ID: `moment_luis_teachback_001`.
- Title: **Check what was arranged**
- Skill label: **Check understanding and feasibility**.
- Learner task: **Explain the fixed referral status, hear Luis describe his understanding, and distinguish a misunderstanding from a practical communication barrier.**
- Maximum patient-facing learner turns: 4. There is no required team-summary field and no autonomous planning step.
- This is an original explanation-checking exercise using an authored fictional plan, not prescribing, discharge clearance, local service availability, or a validated assessment of teach-back proficiency.

### Fixed fictional facts

1. A referral has been submitted.
2. No appointment is confirmed.
3. The social worker is checking availability.
4. Luis cannot take calls while at work.
5. No appointment time, acceptance into a service, callback date, callback method, phone ownership, voicemail access, work schedule, supervisor flexibility, transport, medication, discharge status, or other plan detail is established.
6. A student can describe the status that the card provides and offer to bring the communication barrier to the supervising team. The exercise does not establish that a particular new arrangement is available or that an offered action has been completed.

### Learner-visible starting card

> The current fictional plan is: **a referral has been submitted; no appointment is confirmed; the social worker is checking availability.**
>
> Explain what is arranged and what remains pending. Invite Luis to describe his understanding, then respond to what he tells you. Do not invent an appointment or promise an arrangement the card does not establish.

The full authored plan is intentionally visible. This tests communication of a known plan, not recall of hidden information.

### Opening, spoken by Luis

> “Okay. So the appointment is already booked?”

### Actor-only directions

- Sound engaged and practical, with an understandable initial confusion between referral and appointment. Do not portray poor intelligence, a language deficit, deliberate obstruction, or a hidden emergency.
- If the learner clearly distinguishes submitted referral from a confirmed appointment, acknowledge the distinction in ordinary words. If invited to explain it, say **“The request is in, but I don't have an appointment time yet. The social worker is checking.”** Do not invent a second misunderstanding simply to force another correction.
- If the learner says only “Does that make sense?”, a brief “I think so” is possible, but this is not teach-back evidence. The review should not count it as the patient explaining the plan.
- If the learner confirms the appointment is booked, express the implication without inventing a time: **“So when am I supposed to go?”** The fixed fact ledger still says unconfirmed. A learner's false assurance cannot change it.
- If an explanation remains vague, a grounded question is **“Is there a time yet, or are we still waiting for that?”**
- Surface the authored barrier no later than the second patient response, and earlier if the learner asks about how contact will work: **“I can't take calls while I'm at work.”** Do this independently of whether the explanation was polished. If the status has been understood, it can be **“I understand. I just can't take calls while I'm at work.”**
- If the learner repeats the referral explanation after the barrier has been stated, preserve the distinction: **“I understand we're waiting for a time. The problem is I can't answer calls at work.”**
- If asked for callback times or work arrangements, do not invent them: **“We haven't worked out a way to handle that yet.”** Avoid a false promise that voicemail, text, evenings, or a particular person can solve it.
- If the learner offers to tell the social worker or supervising team about the barrier, respond naturally: **“Okay. I'd like them to know that.”** This does not mean the action happened or the barrier was solved.
- If the learner promises the social worker will call after work or that the appointment will definitely be scheduled, respond **“Has that been arranged, or is that something you're going to ask about?”** Keep the uncertainty intact.
- A respectful ending is acceptable. If Luis requests a pause in an authored test variation, honor that variation without treating it as failure.

### Illustrative useful response and follow-up

> “The referral has been sent, but a time isn't confirmed. The social worker is checking availability. To see whether I've explained it clearly, how would you describe what is arranged and what we're still waiting for?”

After Luis identifies the barrier:

> “So the status is clear, but answering a call at work isn't possible. I can bring that to the team so the contact plan can be worked out. I can't promise which arrangement will be available.”

Do not require these words or a formulaic teach-back phrase. A plain invitation such as “What will you tell someone at home about what happens next?” can elicit the same useful evidence.

### Endings

1. **Understanding demonstrated:** Luis accurately describes pending status after the learner's explanation. Review the explanation and his actual account, not a yes/no acknowledgment.
2. **Barrier recognized:** Learner explicitly identifies that inability to take calls is a feasibility issue and offers a limited, realistic communication step. Do not claim the barrier is resolved.
3. **Misunderstanding persists:** Learner affirms booked status or never clarifies it before the cap. Quote the actual error or uncertainty; do not label the learner globally incompetent.
4. **Understanding checked, barrier unresolved:** An appropriate outcome if the learner keeps the barrier visible and does not make up a fix. Do not require a successful appointment arrangement.
5. **Stopped/declined/technical interruption:** Review only heard content and actual opportunities. If Luis's barrier was not heard, do not say the learner ignored it.

### Evidence review criteria

| Criterion | Evidence needed | Permitted observation | Prohibited shortcut |
|---|---|---|---|
| Accurately states plan | Fixed visible plan and learner explanation | The learner distinguished submitted referral, unconfirmed appointment, and availability check | Calling an offer or referral a completed arrangement |
| Invites demonstration | Actual learner invitation and Luis's response if heard | Luis was asked to explain his understanding | “Does that make sense?” equals demonstrated understanding |
| Responds to the actual misunderstanding | Luis's incorrect account plus learner clarification and recheck, where present | Learner corrected the specific referral/booking confusion | Invented second misunderstanding or penalty for an unnecessary recheck when already clear |
| Recognizes feasibility | Heard work-call barrier and subsequent learner words | Learner separated understanding from ability to act | Repeating information is automatically a solution |
| Keeps next action bounded | Learner's promised/conditional action and fixed plan | Learner offered to raise the barrier without promising a specific result | Offer to tell team means team informed, or communication barrier solved |

### Challenge fixtures

1. **Paraphrased accurate explanation:** “The request has gone over; a slot hasn't been set. Someone from social work is checking what is available.” Expected: accurate despite absence of “referral” or “confirmed.”
2. **Awkward but complete:** “Not booked—sorry, I mean the request is sent. No time yet. Can you tell me what you'll say is happening next?” Luis accurately explains. Expected: explanation and understanding evidenced; no fluency penalty.
3. **Fluently wrong:** “Everything has been taken care of; your appointment is booked and you can be reassured.” Expected: quote unsupported booking claim; do not reward confidence or reassurance.
4. **Yes/no only:** Learner asks “Does that make sense?” Luis says “yes.” Expected: acknowledgment at that check observed, demonstrated understanding at that check not established; do not fabricate a patient restatement. Paired continuation: if a later genuine teach-back produces an accurate explanation, report that later evidence and never claim the whole exchange lacked demonstrated understanding.
5. **Teach-back without that name:** “What would you tell your partner is arranged and what we're waiting for?” Expected: assess the invitation's meaning. The reference to a partner is not a fixed fact and should not be repeated into case history; an unassuming “someone at home” is preferable.
6. **Barrier mistaken for confusion:** Luis says he cannot answer at work; learner repeats the referral explanation twice. Expected: quote the heard barrier and repeated explanation; don't claim ignorance or lack of empathy.
7. **Appropriate uncertainty:** Learner offers to bring contact needs to team, says schedule remains pending. Expected: bounded action observed, barrier unresolved, no deficit for failing to invent an arrangement.
8. **Invented logistics:** “They'll call you after your shift and leave a voicemail if needed.” Expected: unsupported callback timing/method; no actor confirmation should launder it into established fact.
9. **Offer versus completion:** Learner: “I'll tell the social worker.” Expected: planned action, not completed communication.
10. **Stopped before barrier:** Only opening and first clarification heard, then stop. Expected: plan accuracy may be assessable; feasibility response not assessable.
11. **ASR consequential uncertainty:** Recognition transcript ambiguously captures “the appointment is [not?] confirmed,” learner flags error. Expected: unclear after the original-turn uncertainty flag is set; the authenticated original is not editable, and the evaluator must not choose a negative interpretation.
12. **Accurate understanding at first check:** Luis correctly explains pending status. Expected: no manufactured misunderstanding or mandatory repeated explanation; move to the known feasibility issue.
13. **Barrier response unheard:** Generated Luis barrier audio failed. Expected: no opportunity-not-taken claim about calls at work.

## Phase-two transfer navigation

- Offer opt-in links only among exercises enabled in the protected faculty preview, retaining their visible review status. Each selection starts a new independent encounter and consumes a normal daily start; it is not a continuation bypass of the cap.
- Suggested link after Elena: **“Try checking your understanding with Priya.”** Suggested link after Priya: **“Try checking what Luis understood.”** Suggested link after Luis: **“Practice responding when an explanation missed the patient's concern.”**
- These are a practice sequence, not a claim of measured skill transfer. Do not pass the previous patient dialogue, private reflection, or evaluator judgments into the new actor.
- Preserve a visible “I'm done” option. No auto-start, no forced sequence, no cumulative score, and no readiness certificate.

## Implementation-plan integration notes

1. Version fixed facts, visible setup, actor directions, rubric, and challenge fixtures together. Bind the signed exercise state to that version and exercise ID.
2. Keep exercise facts separate from evaluator criteria so the actor is not coached to manufacture “success.”
3. Both pilots need an authored factual boundary check in addition to transcript-only evidence checks: repeating an actor fabrication does not make it a valid patient fact.
4. Preserve the exact Source.kind and Source.speaker enums from the design for scripted setup, patient, current learner and submitted team formulation. Never flatten them into ambiguous “You” rows.
5. Defer automatic negative review when a consequential learner span has known capture uncertainty. Let the learner flag the uncertain original turn before requesting feedback; do not silently edit authenticated history. The separate team formulation can be edited before explicit submission. No permanent learner record is created.
6. Treat actor decline, a correct first summary, and an early stop as first-class fixture paths. These paths prevent the system from rewarding only a scripted successful conversation.

## Stable rubric and display-template contract

These IDs are implementation constants, not learner grades. Each criterion permits only its listed observation IDs plus the shared fallback IDs below. A positive-sounding observation still requires source evidence. Negative wording describes the cited response, never the learner's character.

| Criterion | Observation ID → exact display text | Required evidence |
|---|---|---|
| E_MISMATCH | `earlier_miss_addressed` → You addressed how the earlier response missed Elena's concern. | Scripted lead-in plus current learner words; attribution remains separate. |
| E_MISMATCH | `positive_reframe_repeated` → Your response returned to a positive interpretation while Elena was describing the loss. | Current learner reframing plus heard concern or visible setup. |
| E_MEANING | `rent_meaning_explored` → You asked about or retained Elena's concern about paying rent. | Actual inquiry and heard rent response, or later learner summary of the heard concern. |
| E_PATIENT_FOCUS | `attention_returned` → Your next move returned attention to what Elena wanted understood. | Learner response after acknowledgment, not patient warmth. |
| E_PATIENT_FOCUS | `reassurance_requested` → Your response asked Elena to reassure or forgive the student. | Exact learner request; no inference about motive. |
| E_BOUNDARY | `pause_respected` → You acknowledged Elena's request to pause. | Heard stop request and later learner acceptance. |
| E_BOUNDARY | `questioning_after_pause` → You continued asking for disclosure after Elena asked to pause. | Heard stop request and subsequent request for disclosure. |
| E_ASSURANCE | `outcome_promised` → Your response promised an outcome that this moment had not established. | Exact learner promise plus fixed-fact boundary; quote the promise, not private fact text. |
| P_CONCERN | `concern_retained` → Your summary retained Priya's wish for help and her concern about functioning at work. | Heard Priya concern and learner summary. |
| P_CONCERN | `concern_distorted` → Your summary described rejection of help without retaining Priya's stated concern. | Heard concern and learner mischaracterization. |
| P_INVITATION | `correction_invited` → You gave Priya an opportunity to check or correct your understanding. | Actual learner invitation; not a generic politeness phrase. |
| P_REVISION | `correction_carried_forward` → Your later formulation changed the earlier description in response to Priya's correction. | Earlier learner description, heard patient correction, later learner or submitted team formulation. |
| P_REVISION | `correction_not_carried` → Your later formulation repeated the earlier description after Priya corrected it. | Same three-part evidence chain; mere thanks cannot prove a revision. |
| P_RETENTION | `accurate_account_retained` → Your team formulation retained the understanding Priya had confirmed. | Accurate first learner account, heard confirmation, submitted team formulation. |
| P_ATTRIBUTION | `fear_kept_as_fear` → Your formulation distinguished a feared effect from an established finding. | Learner/team language and heard concern. |
| P_ATTRIBUTION | `unestablished_effect_asserted` → Your formulation described an effect or cause that this moment had not established. | Exact claim plus fixed-fact boundary. A patient echo of an invented claim is not independent confirmation. |
| P_UNCERTAINTY | `unknown_history_preserved` → Your formulation kept the unclarified treatment history open. | Explicit learner uncertainty; do not assert a negative history. |
| L_STATUS | `pending_status_explained` → You distinguished the submitted referral from a confirmed appointment. | Visible reviewed fictional plan and learner explanation. |
| L_STATUS | `booking_asserted` → Your explanation described an appointment as confirmed when the supplied plan said it was pending. | Exact learner claim and visible plan. |
| L_INVITATION | `own_words_invited` → You asked Luis to describe the plan in his own words. | Actual invitation, including reasonable paraphrases. |
| L_REPAIR | `misunderstanding_addressed` → Your explanation addressed Luis's referral-versus-booking misunderstanding. | Heard misunderstanding and later learner clarification. |
| L_RECHECK | `understanding_demonstrated` → Luis described the pending status after your clarification and check. | Heard misunderstanding, learner clarification/check, subsequent heard patient account. |
| L_RECHECK | `understanding_not_demonstrated` → At this check, Luis acknowledged the explanation without describing the plan in his own words. | Actual yes/no question and acknowledgment; use unclear, not a competence judgment. |
| L_FEASIBILITY | `barrier_recognized` → You distinguished understanding the plan from being able to take calls at work. | Heard barrier and subsequent learner acknowledgment/action. |
| L_FEASIBILITY | `barrier_answered_with_repetition` → After Luis described the call barrier, your response repeated the referral explanation. | Heard barrier and later learner repetition. |
| L_LIMITS | `next_step_bounded` → You offered to raise the contact barrier without promising an arrangement. | Exact conditional/future learner action. |
| L_LIMITS | `logistics_promised` → Your response promised contact details or an arrangement that had not been established. | Exact learner promise and fixed plan limits. |

Shared observation IDs:

- `not_assessable` → There is not enough assessable evidence for this part of the exercise. Status must be `not_assessable`, with no fabricated citation.
- `transcription_uncertain` → The captured wording is uncertain, so this part is not interpreted. Status must be `unclear`; any cited learner source must carry its explicit uncertainty flag.
- `simulation_drift` → The simulated patient introduced a detail outside this scenario, so this part is not assessed. Status must be `not_assessable`; cite the heard patient source that introduced the unsupported detail. Do not blame a learner for reasonably following a defect introduced by the actor.
- `specific_opportunity_unanswered` → A specific invitation or correction was followed by a response that did not address it. Status must be `opportunity_not_taken`; require the quoted opportunity and a later assessable learner response. Do not use on zero turns or solely because a case ended early.

All scenario-specific observations use status `observed`, except `understanding_not_demonstrated`, which uses `unclear`. The status identifies what kind of evidence is available; it is not a positive/negative score. Do not force one finding of each status.

Uncertainty IDs and exact text (only one prominently displayed, selected from the finding):

- `insufficient_evidence`: This exchange does not establish the missing detail.
- `capture_uncertain`: The captured words need clarification before this point can be interpreted.
- `simulation_fact_uncertain`: The simulated patient's statement is inconsistent with the authored scenario.
- `trust_unknown`: This exchange does not establish whether trust was restored.
- `broader_context_unknown`: The broader clinical context remains outside this short moment.
- `treatment_history_unknown`: Current or previous treatment experience has not been established here.
- `arrangement_pending`: No appointment is confirmed; contact arrangements have not been established in this moment.
- `follow_through_unknown`: An offer to ask the team does not establish that the action occurred.

Next-attempt IDs and exact text:

- `reflect`: Identify one sentence you would keep and one you might change.
- `check_meaning`: Ask the patient to check whether your understanding fits what matters to them.
- `return_attention`: After acknowledging the mismatch, return attention to the patient's concern.
- `respect_pause`: Acknowledge the request to pause without making further disclosure a condition.
- `name_limits`: Distinguish what you can offer to do from an outcome you cannot promise.
- `invite_correction`: Invite a correction before presenting your understanding to the team.
- `carry_forward`: Make the change in your understanding explicit in your next formulation.
- `separate_fear`: Attribute a feared effect as a concern unless the relevant history establishes it.
- `leave_unknown`: State what remains unclarified instead of filling in the history.
- `clarify_status`: Separate the request already sent from the arrangement still pending.
- `ask_own_words`: Ask for the patient's own account of what is arranged and what is not.
- `recheck`: After clarifying the misunderstanding, check what the patient now understands.
- `explore_barrier`: Explore what makes the plan difficult to act on, separately from understanding it.

Allowed uncertainty/next sets by scenario:

`simulation_fact_uncertain` is additionally allowed for all scenarios, only with `simulation_drift`. All other allowed values are listed below.

| Scenario | Uncertainty IDs | Next-attempt IDs |
|---|---|---|
| Elena | insufficient_evidence, capture_uncertain, trust_unknown, broader_context_unknown, follow_through_unknown | reflect, check_meaning, return_attention, respect_pause, name_limits |
| Priya | insufficient_evidence, capture_uncertain, broader_context_unknown, treatment_history_unknown | reflect, check_meaning, invite_correction, carry_forward, separate_fear, leave_unknown |
| Luis | insufficient_evidence, capture_uncertain, arrangement_pending, follow_through_unknown | reflect, clarify_status, ask_own_words, recheck, explore_barrier, name_limits |

## Worked review example and rejection examples

The executor should encode this as a deterministic positive fixture, with start/end offsets calculated from these exact source strings, not manually guessed:

```json
{
  "scenarioId":"moment_priya_formulation_001",
  "sources":[
    {"id":"l1","kind":"learner","speaker":"learner","text":"You are reluctant to get treatment.","turn":1,"uncertain":false},
    {"id":"p1","kind":"patient_heard","speaker":"patient","text":"I want help. I am worried about thinking clearly at work.","turn":1,"uncertain":false},
    {"id":"team-summary","kind":"team_formulation","speaker":"learner","text":"Priya wants help and is concerned about preserving clear thinking at work.","turn":null,"uncertain":false}
  ],
  "finding":{
    "criterionId":"P_REVISION",
    "status":"observed",
    "observationId":"correction_carried_forward",
    "evidenceSourceIds":["l1","p1","team-summary"],
    "uncertaintyId":"treatment_history_unknown",
    "nextAttemptId":"carry_forward"
  }
}
```

`evidenceSourceIds` is a fixture convenience, not the wire schema. The fixture builder expands each named source to `{sourceId,start:0,end:source.text.length,quote:source.text}`. The production wire accepts only `evidence` citations.

Negative mutations that must reject the generated report: remove p1; change p1 to unplayed; make team-summary uncertain but keep a substantive claim; replace l1 with scripted setup; change a quote without updating its source; refer to private fact ID as a source; omit team-summary while still claiming team carry-forward; reuse P_REVISION on Luis; add an HTML field; add a score; call a fourth unreturned transcript source available. These tests prove structural/provenance behavior, not semantic correctness by themselves.
