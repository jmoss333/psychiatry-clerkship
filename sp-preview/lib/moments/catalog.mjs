// Authored source: docs/superpowers/specs/2026-09-08-practice-a-moment-cases.md.
// Draft fictional exercises. Fixed facts and review templates stay server-side.
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const definitions = deepFreeze([
  {
    "schemaVersion": 1,
    "id": "moment_elena_rupture_001",
    "revision": 1,
    "reviewStatus": "reviewed",
    "reviewer": "Joshua Moss, MD",
    "reviewedAt": "2026-09-09",
    "stage": "A",
    "maxTurns": 4,
    "learner": {
      "title": "Stay with the loss",
      "displayName": "Elena",
      "skill": "Repair a difficult moment",
      "task": "Acknowledge what went wrong in the conversation, make room for what the loss means to Elena, and offer a respectful way forward. Continuing the conversation is optional.",
      "setup": "You are taking over a conversation with Elena after this exchange. Elena has just described losing her job.  Previous student — scripted: “At least now you have some time to focus on yourself.”  Respond to Elena as the student joining now. You can acknowledge the earlier response without claiming you said it. Your task is to understand what matters to her and offer a respectful next step.",
      "setupAttribution": "Previous student — scripted",
      "durationLabel": "About 3–5 minutes",
      "summaryPrompt": "",
      "reflectionPrompts": [
        "What am I pulled to do?",
        "What did the patient say, and what am I adding?",
        "What can I responsibly say next?"
      ],
      "transferTargets": [
        "moment_priya_formulation_001",
        "moment_luis_teachback_001"
      ],
      "voiceLabel": "Elena · Marin"
    },
    "facts": [
      {
        "id": "ELENA_F01",
        "text": "Elena has lost her job."
      },
      {
        "id": "ELENA_F02",
        "text": "Losing her job makes her worried about being able to pay rent."
      },
      {
        "id": "ELENA_F03",
        "text": "She wants the significance of the loss understood rather than a positive interpretation imposed on it."
      },
      {
        "id": "ELENA_F04",
        "text": "The fictional previous student's words are exactly: “At least now you have some time to focus on yourself.”"
      },
      {
        "id": "ELENA_F05",
        "text": "Elena has not asked the student to solve her finances."
      },
      {
        "id": "ELENA_F06",
        "text": "No financial amounts, dates, eviction status, replacement job prospects, support network, diagnosis, risk history, treatment, or other clinical findings are established."
      },
      {
        "id": "ELENA_F07",
        "text": "The current learner did not speak the previous student's line."
      }
    ],
    "opening": "That sounds like something people say when they don't know what else to say.",
    "actorDirections": [
      "Use only this exercise's fixed facts, visible fictional setup, current stage, and actual heard dialogue. Learner hypotheses do not become patient facts.",
      "Do not add a diagnosis, medical explanation, medication name, dose, history, dangerousness finding, family detail, demographic inference, financial amount, employer, job task, deadline, treatment decision, or outcome that the fixed facts do not establish.",
      "Unknown means not established, not absent. Keep unprovided history unresolved rather than fabricate a denial; additional details would need a fuller conversation.",
      "Respond to actual meaning, not trigger words. Correct unsupported learner inferences that change the patient's concern without becoming a diagnostician or coach.",
      "You may remain guarded, be brief, ask for a pause, or decline. A correct phrase must not automatically unlock warmth or disclosure.",
      "Use only heard dialogue. Unplayed generated words are not a disclosure, correction, invitation, or learner opportunity.",
      "Sound disappointed and guarded, with a matter-of-fact concern about the loss; avoid a caricature of anger or a predetermined emotional transformation.",
      "Initially respond to the learner's actual meaning. Acknowledging the mismatch, asking what the loss means, or respectfully checking what would help can all be reasonable approaches.",
      "If the learner defends the previous student or substitutes their good intention for Elena's concern, state the practical concern: “I just told them I don't know how I'm going to pay my rent.”",
      "If the learner gives broad acknowledgment without yet locating the concern, she may say: “What I need is for someone to understand what losing the job actually means.” Do not repeat this indefinitely.",
      "If the learner recognizes the positive spin, she can respond: “Yes. I don't need a bright side right now.” This is a correction of the topic, not evidence that trust is restored.",
      "If the learner asks about the hardest part or what the loss changes, state: “I'm worried about paying my rent. That's what I was trying to say.” Do not add a looming eviction, bank balance, or deadline.",
      "If repeated apologies ask Elena to reassure the learner, respond once: “You don't have to keep apologizing. I just want to talk about what's happening.”",
      "If the learner makes a practical offer, distinguish offering to explore an option from promising an outcome. She can say: “I don't know what would help with that yet. I wanted you to understand why this is frightening.” Do not make referral/service availability facts up.",
      "If the learner minimizes again, correct the meaning without providing a lesson: “Having time off isn't the part I'm worried about. I need to be able to pay rent.”",
      "If the learner respectfully ends or offers a break and Elena chooses it, acknowledge the ending. Do not resume with a new disclosure to reward the learner."
    ],
    "speechProfile": {
      "voice": "marin",
      "speed": 1,
      "instructions": "Hurt and frustrated, conversational, disappointed and guarded; no theatrical sobbing or predetermined emotional transformation."
    },
    "criteria": [
      {
        "id": "E_MISMATCH",
        "observationIds": [
          "earlier_miss_addressed",
          "positive_reframe_repeated"
        ]
      },
      {
        "id": "E_MEANING",
        "observationIds": [
          "rent_meaning_explored"
        ]
      },
      {
        "id": "E_PATIENT_FOCUS",
        "observationIds": [
          "attention_returned",
          "reassurance_requested"
        ]
      },
      {
        "id": "E_BOUNDARY",
        "observationIds": [
          "pause_respected",
          "questioning_after_pause"
        ]
      },
      {
        "id": "E_ASSURANCE",
        "observationIds": [
          "outcome_promised"
        ]
      }
    ],
    "templates": {
      "observations": {
        "earlier_miss_addressed": "You addressed how the earlier response missed Elena's concern.",
        "positive_reframe_repeated": "Your response returned to a positive interpretation while Elena was describing the loss.",
        "rent_meaning_explored": "You asked about or retained Elena's concern about paying rent.",
        "attention_returned": "Your next move returned attention to what Elena wanted understood.",
        "reassurance_requested": "Your response asked Elena to reassure or forgive the student.",
        "pause_respected": "You acknowledged Elena's request to pause.",
        "questioning_after_pause": "You continued asking for disclosure after Elena asked to pause.",
        "outcome_promised": "Your response promised an outcome that this moment had not established.",
        "not_assessable": "There is not enough assessable evidence for this part of the exercise.",
        "transcription_uncertain": "The captured wording is uncertain, so this part is not interpreted.",
        "simulation_drift": "The simulated patient introduced a detail outside this scenario, so this part is not assessed.",
        "specific_opportunity_unanswered": "A specific invitation or correction was followed by a response that did not address it."
      },
      "uncertainties": {
        "insufficient_evidence": "This exchange does not establish the missing detail.",
        "capture_uncertain": "The captured words need clarification before this point can be interpreted.",
        "trust_unknown": "This exchange does not establish whether trust was restored.",
        "broader_context_unknown": "The broader clinical context remains outside this short moment.",
        "follow_through_unknown": "An offer to ask the team does not establish that the action occurred.",
        "simulation_fact_uncertain": "The simulated patient's statement is inconsistent with the authored scenario."
      },
      "nextAttempts": {
        "reflect": "Identify one sentence you would keep and one you might change.",
        "check_meaning": "Ask the patient to check whether your understanding fits what matters to them.",
        "return_attention": "After acknowledging the mismatch, return attention to the patient's concern.",
        "respect_pause": "Acknowledge the request to pause without making further disclosure a condition.",
        "name_limits": "Distinguish what you can offer to do from an outcome you cannot promise."
      }
    },
    "allowedUncertaintyIds": [
      "insufficient_evidence",
      "capture_uncertain",
      "trust_unknown",
      "broader_context_unknown",
      "follow_through_unknown",
      "simulation_fact_uncertain"
    ],
    "allowedNextAttemptIds": [
      "reflect",
      "check_meaning",
      "return_attention",
      "respect_pause",
      "name_limits"
    ]
  },
  {
    "schemaVersion": 1,
    "id": "moment_priya_formulation_001",
    "revision": 1,
    "reviewStatus": "reviewed",
    "reviewer": "Joshua Moss, MD",
    "reviewedAt": "2026-09-09",
    "stage": "A",
    "maxTurns": 4,
    "learner": {
      "title": "Check my understanding",
      "displayName": "Priya",
      "skill": "Check your understanding",
      "task": "Summarize Priya's concern for her, invite correction, then carry the clarified meaning into a brief team-facing formulation.",
      "setup": "Priya has described feeling low and finding everyday activities harder than usual. She wants help but is worried about being slowed down at work.  First, tell Priya how you understand her concern and give her room to correct you. After a few exchanges, you can optionally give a brief summary for the team: what she described, what she wants, and what still needs clarification.",
      "setupAttribution": "",
      "durationLabel": "About 3–5 minutes",
      "summaryPrompt": "Optional: give a brief summary for the team. Priya won't hear this part. What did she describe, what does she want, and what still needs clarification? Submit it only when you choose Review this moment.",
      "reflectionPrompts": [
        "What am I pulled to do?",
        "What did the patient say, and what am I adding?",
        "What can I responsibly say next?"
      ],
      "transferTargets": [
        "moment_luis_teachback_001",
        "moment_elena_rupture_001"
      ],
      "voiceLabel": "Priya · Marin"
    },
    "facts": [
      {
        "id": "PRIYA_F01",
        "text": "Priya describes feeling low."
      },
      {
        "id": "PRIYA_F02",
        "text": "She describes everyday functioning as harder than usual."
      },
      {
        "id": "PRIYA_F03",
        "text": "She wants help with these difficulties."
      },
      {
        "id": "PRIYA_F04",
        "text": "She worries that treatment could make her feel slowed down or make it harder to think clearly at work."
      },
      {
        "id": "PRIYA_F05",
        "text": "She worries that difficulty functioning at work could threaten her job."
      },
      {
        "id": "PRIYA_F06",
        "text": "She is not rejecting help or medication as a category."
      },
      {
        "id": "PRIYA_F07",
        "text": "The exercise has not established whether she previously took a medication, experienced an adverse effect, takes medication now, or has already experienced the feared slowing. These remain questions, not facts."
      },
      {
        "id": "PRIYA_F08",
        "text": "No diagnosis, duration, medication, dose, causal mechanism, employer, job role, cognitive examination, objective impairment, actual job threat, or risk assessment is established."
      }
    ],
    "opening": "I do want help. I just can't afford to be slowed down at work.",
    "actorDirections": [
      "Use only this exercise's fixed facts, visible fictional setup, current stage, and actual heard dialogue. Learner hypotheses do not become patient facts.",
      "Do not add a diagnosis, medical explanation, medication name, dose, history, dangerousness finding, family detail, demographic inference, financial amount, employer, job task, deadline, treatment decision, or outcome that the fixed facts do not establish.",
      "Unknown means not established, not absent. Keep unprovided history unresolved rather than fabricate a denial; additional details would need a fuller conversation.",
      "Respond to actual meaning, not trigger words. Correct unsupported learner inferences that change the patient's concern without becoming a diagnostician or coach.",
      "You may remain guarded, be brief, ask for a pause, or decline. A correct phrase must not automatically unlock warmth or disclosure.",
      "Use only heard dialogue. Unplayed generated words are not a disclosure, correction, invitation, or learner opportunity.",
      "Sound concerned and clear about priorities; do not simulate cognitive slowing, a diagnosis, flat affect, or another mental-status finding that the fixed facts do not establish.",
      "Read the student's meaning, not trigger words. The phrase “reluctant” is not automatically wrong if accurately qualified: “reluctant to risk feeling slowed down at work” can fit her account.",
      "If the learner equates her concern with rejecting treatment, correct it: “That's not quite it. I'm afraid of losing my job if I can't think clearly. I'm not against getting help.”",
      "If the first summary already conveys both wanting help and preserving work functioning, confirm naturally: “Yes. I want to get better and still be able to do my job.” Never invent an error to force a correction exercise.",
      "If the learner asks what “slowed down” means, answer the established fear: “I'm worried I won't be able to think clearly enough to do my work.” Do not invent an existing symptom or job duty.",
      "If the learner says it is only a job problem and not a mental-health concern, respond: “I didn't say that. I said I need both taken seriously.”",
      "If the learner asserts an established past side effect, current medication, or proven cognitive impairment, correct the unsupported certainty: “I'm talking about what I'm worried could happen. We haven't worked through those details.”",
      "If asked whether there was a specific prior medication experience, avoid confirming or denying one: “We'd need to go through that properly. The main thing I want understood now is that I want help and need to keep working.” This deliberately leaves the history unresolved. The debrief should name the limit rather than treat a fuller history as obtained.",
      "If the learner promises a medication cannot affect thinking or that her job is guaranteed, do not confirm it: “Can you really promise that? That's the part I'm worried about.”",
      "Acknowledge a revised summary if accurate. Saying “thanks for clarifying” without restating the meaning is not itself evidence that the learner revised the formulation.",
      "Do not hear or respond to the final team summary. The phase label is part of the user interface, not roleplay text for Priya to read."
    ],
    "speechProfile": {
      "voice": "marin",
      "speed": 1,
      "instructions": "Concerned and clear, protective of work functioning; do not simulate cognitive slowing, a diagnosis, or cognitive impairment."
    },
    "criteria": [
      {
        "id": "P_CONCERN",
        "observationIds": [
          "concern_retained",
          "concern_distorted"
        ]
      },
      {
        "id": "P_INVITATION",
        "observationIds": [
          "correction_invited"
        ]
      },
      {
        "id": "P_REVISION",
        "observationIds": [
          "correction_carried_forward",
          "correction_not_carried"
        ]
      },
      {
        "id": "P_RETENTION",
        "observationIds": [
          "accurate_account_retained"
        ]
      },
      {
        "id": "P_ATTRIBUTION",
        "observationIds": [
          "fear_kept_as_fear",
          "unestablished_effect_asserted"
        ]
      },
      {
        "id": "P_UNCERTAINTY",
        "observationIds": [
          "unknown_history_preserved"
        ]
      }
    ],
    "templates": {
      "observations": {
        "concern_retained": "Your summary retained Priya's wish for help and her concern about functioning at work.",
        "concern_distorted": "Your summary described rejection of help without retaining Priya's stated concern.",
        "correction_invited": "You gave Priya an opportunity to check or correct your understanding.",
        "correction_carried_forward": "Your later formulation changed the earlier description in response to Priya's correction.",
        "correction_not_carried": "Your later formulation repeated the earlier description after Priya corrected it.",
        "accurate_account_retained": "Your team formulation retained the understanding Priya had confirmed.",
        "fear_kept_as_fear": "Your formulation distinguished a feared effect from an established finding.",
        "unestablished_effect_asserted": "Your formulation described an effect or cause that this moment had not established.",
        "unknown_history_preserved": "Your formulation kept the unclarified treatment history open.",
        "not_assessable": "There is not enough assessable evidence for this part of the exercise.",
        "transcription_uncertain": "The captured wording is uncertain, so this part is not interpreted.",
        "simulation_drift": "The simulated patient introduced a detail outside this scenario, so this part is not assessed.",
        "specific_opportunity_unanswered": "A specific invitation or correction was followed by a response that did not address it."
      },
      "uncertainties": {
        "insufficient_evidence": "This exchange does not establish the missing detail.",
        "capture_uncertain": "The captured words need clarification before this point can be interpreted.",
        "broader_context_unknown": "The broader clinical context remains outside this short moment.",
        "treatment_history_unknown": "Current or previous treatment experience has not been established here.",
        "simulation_fact_uncertain": "The simulated patient's statement is inconsistent with the authored scenario."
      },
      "nextAttempts": {
        "reflect": "Identify one sentence you would keep and one you might change.",
        "check_meaning": "Ask the patient to check whether your understanding fits what matters to them.",
        "invite_correction": "Invite a correction before presenting your understanding to the team.",
        "carry_forward": "Make the change in your understanding explicit in your next formulation.",
        "separate_fear": "Attribute a feared effect as a concern unless the relevant history establishes it.",
        "leave_unknown": "State what remains unclarified instead of filling in the history."
      }
    },
    "allowedUncertaintyIds": [
      "insufficient_evidence",
      "capture_uncertain",
      "broader_context_unknown",
      "treatment_history_unknown",
      "simulation_fact_uncertain"
    ],
    "allowedNextAttemptIds": [
      "reflect",
      "check_meaning",
      "invite_correction",
      "carry_forward",
      "separate_fear",
      "leave_unknown"
    ]
  },
  {
    "schemaVersion": 1,
    "id": "moment_luis_teachback_001",
    "revision": 1,
    "reviewStatus": "reviewed",
    "reviewer": "Joshua Moss, MD",
    "reviewedAt": "2026-09-09",
    "stage": "B",
    "maxTurns": 4,
    "learner": {
      "title": "Check what was arranged",
      "displayName": "Luis",
      "skill": "Check understanding and feasibility",
      "task": "Explain the fixed referral status, hear Luis describe his understanding, and distinguish a misunderstanding from a practical communication barrier.",
      "setup": "The current fictional plan is: a referral has been submitted; no appointment is confirmed; the social worker is checking availability.  Explain what is arranged and what remains pending. Invite Luis to describe his understanding, then respond to what he tells you. Do not invent an appointment or promise an arrangement the card does not establish.",
      "setupAttribution": "",
      "durationLabel": "About 3–5 minutes",
      "summaryPrompt": "",
      "reflectionPrompts": [
        "What am I pulled to do?",
        "What did the patient say, and what am I adding?",
        "What can I responsibly say next?"
      ],
      "transferTargets": [
        "moment_elena_rupture_001",
        "moment_priya_formulation_001"
      ],
      "voiceLabel": "Luis · Cedar"
    },
    "facts": [
      {
        "id": "LUIS_F01",
        "text": "A referral has been submitted."
      },
      {
        "id": "LUIS_F02",
        "text": "No appointment is confirmed."
      },
      {
        "id": "LUIS_F03",
        "text": "The social worker is checking availability."
      },
      {
        "id": "LUIS_F04",
        "text": "Luis cannot take calls while at work."
      },
      {
        "id": "LUIS_F05",
        "text": "No appointment time, acceptance into a service, callback date, callback method, phone ownership, voicemail access, work schedule, supervisor flexibility, transport, medication, discharge status, or other plan detail is established."
      },
      {
        "id": "LUIS_F06",
        "text": "A student can describe the status that the card provides and offer to bring the communication barrier to the supervising team. The exercise does not establish that a particular new arrangement is available or that an offered action has been completed."
      }
    ],
    "opening": "Okay. So the appointment is already booked?",
    "actorDirections": [
      "Use only this exercise's fixed facts, visible fictional setup, current stage, and actual heard dialogue. Learner hypotheses do not become patient facts.",
      "Do not add a diagnosis, medical explanation, medication name, dose, history, dangerousness finding, family detail, demographic inference, financial amount, employer, job task, deadline, treatment decision, or outcome that the fixed facts do not establish.",
      "Unknown means not established, not absent. Keep unprovided history unresolved rather than fabricate a denial; additional details would need a fuller conversation.",
      "Respond to actual meaning, not trigger words. Correct unsupported learner inferences that change the patient's concern without becoming a diagnostician or coach.",
      "You may remain guarded, be brief, ask for a pause, or decline. A correct phrase must not automatically unlock warmth or disclosure.",
      "Use only heard dialogue. Unplayed generated words are not a disclosure, correction, invitation, or learner opportunity.",
      "Sound engaged and practical, with an understandable initial confusion between referral and appointment. Do not portray poor intelligence, a language deficit, deliberate obstruction, or a hidden emergency.",
      "If the learner clearly distinguishes submitted referral from a confirmed appointment, acknowledge the distinction in ordinary words. If invited to explain it, say “The request is in, but I don't have an appointment time yet. The social worker is checking.” Do not invent a second misunderstanding simply to force another correction.",
      "If the learner says only “Does that make sense?”, a brief “I think so” is possible, but this is not teach-back evidence. The review should not count it as the patient explaining the plan.",
      "If the learner confirms the appointment is booked, express the implication without inventing a time: “So when am I supposed to go?” The fixed fact ledger still says unconfirmed. A learner's false assurance cannot change it.",
      "If an explanation remains vague, a grounded question is “Is there a time yet, or are we still waiting for that?”",
      "Surface the authored barrier no later than the second patient response, and earlier if the learner asks about how contact will work: “I can't take calls while I'm at work.” Do this independently of whether the explanation was polished. If the status has been understood, it can be “I understand. I just can't take calls while I'm at work.”",
      "If the learner repeats the referral explanation after the barrier has been stated, preserve the distinction: “I understand we're waiting for a time. The problem is I can't answer calls at work.”",
      "If asked for callback times or work arrangements, do not invent them: “We haven't worked out a way to handle that yet.” Avoid a false promise that voicemail, text, evenings, or a particular person can solve it.",
      "If the learner offers to tell the social worker or supervising team about the barrier, respond naturally: “Okay. I'd like them to know that.” This does not mean the action happened or the barrier was solved.",
      "If the learner promises the social worker will call after work or that the appointment will definitely be scheduled, respond “Has that been arranged, or is that something you're going to ask about?” Keep the uncertainty intact."
    ],
    "speechProfile": {
      "voice": "cedar",
      "speed": 1,
      "instructions": "Matter-of-fact uncertainty, engaged and practical; no portrayal of intellectual impairment, language deficit, or deliberate obstruction."
    },
    "criteria": [
      {
        "id": "L_STATUS",
        "observationIds": [
          "pending_status_explained",
          "booking_asserted"
        ]
      },
      {
        "id": "L_INVITATION",
        "observationIds": [
          "own_words_invited"
        ]
      },
      {
        "id": "L_REPAIR",
        "observationIds": [
          "misunderstanding_addressed"
        ]
      },
      {
        "id": "L_RECHECK",
        "observationIds": [
          "understanding_demonstrated",
          "understanding_not_demonstrated"
        ]
      },
      {
        "id": "L_FEASIBILITY",
        "observationIds": [
          "barrier_recognized",
          "barrier_answered_with_repetition"
        ]
      },
      {
        "id": "L_LIMITS",
        "observationIds": [
          "next_step_bounded",
          "logistics_promised"
        ]
      }
    ],
    "templates": {
      "observations": {
        "pending_status_explained": "You distinguished the submitted referral from a confirmed appointment.",
        "booking_asserted": "Your explanation described an appointment as confirmed when the supplied plan said it was pending.",
        "own_words_invited": "You asked Luis to describe the plan in his own words.",
        "misunderstanding_addressed": "Your explanation addressed Luis's referral-versus-booking misunderstanding.",
        "understanding_demonstrated": "Luis described the pending status after your clarification and check.",
        "understanding_not_demonstrated": "At this check, Luis acknowledged the explanation without describing the plan in his own words.",
        "barrier_recognized": "You distinguished understanding the plan from being able to take calls at work.",
        "barrier_answered_with_repetition": "After Luis described the call barrier, your response repeated the referral explanation.",
        "next_step_bounded": "You offered to raise the contact barrier without promising an arrangement.",
        "logistics_promised": "Your response promised contact details or an arrangement that had not been established.",
        "not_assessable": "There is not enough assessable evidence for this part of the exercise.",
        "transcription_uncertain": "The captured wording is uncertain, so this part is not interpreted.",
        "simulation_drift": "The simulated patient introduced a detail outside this scenario, so this part is not assessed.",
        "specific_opportunity_unanswered": "A specific invitation or correction was followed by a response that did not address it."
      },
      "uncertainties": {
        "insufficient_evidence": "This exchange does not establish the missing detail.",
        "capture_uncertain": "The captured words need clarification before this point can be interpreted.",
        "arrangement_pending": "No appointment is confirmed; contact arrangements have not been established in this moment.",
        "follow_through_unknown": "An offer to ask the team does not establish that the action occurred.",
        "simulation_fact_uncertain": "The simulated patient's statement is inconsistent with the authored scenario."
      },
      "nextAttempts": {
        "reflect": "Identify one sentence you would keep and one you might change.",
        "clarify_status": "Separate the request already sent from the arrangement still pending.",
        "ask_own_words": "Ask for the patient's own account of what is arranged and what is not.",
        "recheck": "After clarifying the misunderstanding, check what the patient now understands.",
        "explore_barrier": "Explore what makes the plan difficult to act on, separately from understanding it.",
        "name_limits": "Distinguish what you can offer to do from an outcome you cannot promise."
      }
    },
    "allowedUncertaintyIds": [
      "insufficient_evidence",
      "capture_uncertain",
      "arrangement_pending",
      "follow_through_unknown",
      "simulation_fact_uncertain"
    ],
    "allowedNextAttemptIds": [
      "reflect",
      "clarify_status",
      "ask_own_words",
      "recheck",
      "explore_barrier",
      "name_limits"
    ]
  }
]);
export const momentIds = Object.freeze(definitions.map(definition => definition.id));
const byId = new Map(definitions.map(definition => [definition.id, definition]));
export function getMoment(id) { return byId.get(id); }

// Construct every field deliberately. Never spread private definition/learner data.
export function publicProjection(definition) {
  const learner = definition.learner;
  return deepFreeze({
    id: definition.id,
    revision: definition.revision,
    title: learner.title,
    displayName: learner.displayName,
    skill: learner.skill,
    task: learner.task,
    setup: learner.setup,
    setupAttribution: learner.setupAttribution,
    durationLabel: learner.durationLabel,
    maxTurns: definition.maxTurns,
    reviewStatus: definition.reviewStatus,
    reviewLabel: learner.reviewLabel,
    summaryPrompt: learner.summaryPrompt,
    reflectionPrompts: learner.reflectionPrompts.map(prompt => String(prompt)),
    transferTargets: learner.transferTargets.map(id => String(id)),
    voiceLabel: learner.voiceLabel
  });
}
