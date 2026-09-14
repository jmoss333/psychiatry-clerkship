/* New authored coaching draft: faculty review pending.
   Student/resident changes coaching depth only, never the case's MD/DO student
   role or authority. Help-seeking is never scored. No actor facts, requests,
   learner data, persistence, or automatic example submission belong here. */
(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PracticeContent=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var CASES={
    sp_depression_gated_si_001:{id:'sp_depression_gated_si_001',title:'Dana',goals:[
      {id:'dana_purpose',title:'Make another interview useful',
        student:{
          question:'What has Dana asked you to acknowledge before starting?',
          hint:'Introduce your student role accurately. Acknowledge the burden of repeating her story and ask what would make this conversation useful. Avoid promising how long it will take.',
          examples:['I’m a medical student working with the team. What would you most like help with today?','You’ve already gone through this once. What would make this conversation useful to you?'],
          reflection:'What purpose did you agree on, and what remained your assumption?'
        },
        resident:{
          question:'What further understanding is needed, and how can you explain its purpose without unnecessary repetition?',
          hint:'Use this deeper coaching lens within the same student role. Acknowledge what Dana has already shared, explain what you still need to understand, and negotiate the focus without promising a duration or outcome.',
          examples:['What feels most important to make sure the team understands from your point of view?','Before asking you to repeat things, could we agree on what would be useful to focus on today?'],
          reflection:'How did you balance the assessment’s purpose with Dana’s priorities, and what would you clarify with your supervisor?'
        }
      },
      {id:'dana_impact',title:'Understand the effect on daily life',
        student:{
          question:'Which part of Dana’s account do you understand least?',
          hint:'Follow something she actually said. Ask for one concrete example of its effect on daily life before offering an explanation.',
          examples:['What has been hardest to get through in an ordinary day?','Could you walk me through a recent day so I can understand what things have been like?'],
          reflection:'What did Dana describe directly, and what did you infer?'
        },
        resident:{
          question:'What would clarify the course of this change and its effect on functioning?',
          hint:'Link one reported difficulty to its timing and effect. Distinguish Dana’s account, your observations, and information that still needs confirmation; do not supply a cause for her.',
          examples:['When did you first notice things becoming different from what is usual for you?','Which change has affected your day-to-day life most, and how has it affected you?'],
          reflection:'What supports your working understanding of the change, and which competing explanations remain open?'
        }
      },
      {id:'dana_safety',title:'Ask directly and follow the answer',
        student:{
          question:'What safety concern needs a direct question rather than an assumption?',
          hint:'Ask plainly, then follow the answer. Clarify whether thoughts are current and any intent, plans, access, supports, or immediate needs that require follow-up. Bring concerns promptly to your supervisor. One answer cannot establish safety; these examples are not a complete assessment.',
          examples:['Have you recently had thoughts about ending your life?','Are you thinking about suicide right now?'],
          reflection:'What did you clarify, what remains unknown, and what needs prompt discussion with your supervisor?'
        },
        resident:{
          question:'Which current uncertainty could change how urgently you need to involve your supervisor?',
          hint:'Follow direct questions with clarification of timing, intent, plans, access, supports, and immediate needs as relevant to the answer. Keep uncertainty explicit and seek supervision for safety concerns; do not convert a denial or a reassuring exchange into a global safety conclusion.',
          examples:['Have thoughts about suicide been present recently, even if they are not present right now?','When you think about the next few hours, are you concerned you might act on thoughts of suicide?'],
          reflection:'Which reported details inform your concern, what remains unassessed, and what would you ask your supervisor to help address now?'
        }
      }
    ]},
    sp_mania_redirect_001:{id:'sp_mania_redirect_001',title:'Marcus',goals:[
      {id:'marcus_redirect',title:'Redirect while keeping his priorities in view',
        student:{
          question:'What matters to Marcus, and what do you need to understand next?',
          hint:'Briefly acknowledge the point he made, explain the next topic, and ask one question. Redirection need not dismiss his ideas or require agreement.',
          examples:['I want to understand your plans. First, could we focus on how you’ve been sleeping?','Let me pause you so I can follow. What happened next that night?'],
          reflection:'Did your redirect make the next topic clear while preserving his perspective?'
        },
        resident:{
          question:'Which redirect would make the interview more useful without turning it into an argument?',
          hint:'Connect the topic you need to assess with the priority Marcus has expressed. Keep the redirect brief and explain its purpose. Cooperation does not establish agreement or clinical improvement.',
          examples:['I hear that your plans matter to you. I’d like to understand what the last few nights have been like before we return to them.','I want to keep track of your point. Could we stay with what happened that night for a moment?'],
          reflection:'How did Marcus respond to the redirect, and what can you conclude from that response without assuming agreement?'
        }
      },
      {id:'marcus_question',title:'Make one question answerable',
        student:{
          question:'What single piece of information would make this account clearer?',
          hint:'Choose one topic and a clear timeframe. Let the answer guide your next question instead of stacking several questions together.',
          examples:['How much did you sleep last night?','How does your sleep recently compare with what is usual for you?'],
          reflection:'What became clearer, and which details still need confirmation?'
        },
        resident:{
          question:'What would distinguish the reported change from your impression of this conversation?',
          hint:'Ask about baseline and course using one question at a time. Keep reported sleep, functioning, and observed speech distinct. Missing collateral remains unknown; the simulated voice does not establish a diagnosis.',
          examples:['What is a usual night’s sleep like for you when things are going well?','When did you first notice your sleep becoming different from usual?'],
          reflection:'Which findings came from Marcus’s account, which were observations, and what still needs another source?'
        }
      },
      {id:'marcus_summary',title:'Summarize without promising a decision',
        student:{
          question:'What can you accurately summarize without implying a decision has been made?',
          hint:'Reflect his priorities and check your understanding. Identify what needs to go back to the team without promising discharge or another outcome.',
          examples:['I want to represent your priorities accurately. What is most important for the team to understand?','Before we finish, what have I misunderstood about what you want to happen next?'],
          reflection:'Which priorities were expressed, which plans were agreed, and which decisions remain open?'
        },
        resident:{
          question:'Where could a summary accidentally turn understanding into agreement or a proposed plan into a decision?',
          hint:'Distinguish Marcus’s priorities, what you have established, and unresolved team decisions. The resident coaching lens does not change your role or authority in this case. Carry uncertainty into supervision.',
          examples:['I want to separate what you hope will happen from what the team still needs to discuss. What should I make sure they hear?','What part of my understanding would you want me to correct before I bring it to the team?'],
          reflection:'How would you present his priorities and the unresolved questions without implying that either of you agreed to an unmade decision?'
        }
      }
    ]},
    sp_psychosis_paranoid_001:{id:'sp_psychosis_paranoid_001',title:'Ray',goals:[
      {id:'ray_information',title:'Be clear about your role and information',
        student:{
          question:'What can you truthfully explain, and what do you need to check?',
          hint:'Take his question seriously. Consult the actual information notice and explain the relevant facts you know. If you are unsure, pause to check. Do not invent promises about recording, sharing, privacy, or access; checking should not replace an available factual answer.',
          examples:['I want to give you an accurate answer about recording. Let’s clarify that before we continue.','I don’t want to guess about who has access to what you say. We can pause while we check.'],
          reflection:'Did you answer his concern accurately, or leave an assurance that still needs verification?'
        },
        resident:{
          question:'How could uncertainty about information-sharing affect this conversation, and what can you establish accurately?',
          hint:'Use the actual information notice, not assumed clinical-room privacy. Explain verified facts and the limits of what you know. If clarification is needed, say what needs checking without interpreting his concern as proof of distrust or illness.',
          examples:['I want to answer the recording question accurately before asking more personal questions. Let’s check the information notice together.','Which part about who receives the information would you like clarified before deciding whether to continue?'],
          reflection:'Which information did you verify, what remains unclear, and how did Ray respond to the explanation?'
        }
      },
      {id:'ray_experience',title:'Understand the experience before explaining it',
        student:{
          question:'What has Ray experienced, and what meaning has he given it?',
          hint:'Start with what he noticed. Invite his account without confirming or dismissing its explanation. Check any feeling or meaning you reflect rather than treating it as established.',
          examples:['What have you noticed that you want me to understand?','Could you describe a recent example from your point of view?'],
          reflection:'Did you distinguish his experience from his explanation and your interpretation?'
        },
        resident:{
          question:'What detail would help you understand the experience while keeping its explanation open?',
          hint:'Clarify what occurred, its context, and the meaning Ray gives it. Attend to his own language and cultural context. Avoid debating the explanation or adding an interpretation he has not endorsed.',
          examples:['Could you take me through one occasion, starting with what you first noticed?','What leads you to understand the experience in that way?'],
          reflection:'What supports your account of the experience, and which interpretations remain uncertain or need checking?'
        }
      },
      {id:'ray_needs',title:'Explore impact and immediate needs',
        student:{
          question:'What is hardest for Ray now, and what requires clarification today?',
          hint:'Follow the stated concern into daily functioning, basic needs, or safety. Ask directly when harm or immediate needs require clarification. Bring concerns to your supervisor; do not infer dangerousness from a diagnosis, gaze, or reluctance to talk.',
          examples:['What has this made hardest to manage day to day?','Is there something you’re worried might happen to you or someone else?'],
          reflection:'Which needs did you establish, and what should be clarified with the team?'
        },
        resident:{
          question:'Which reported difficulty needs immediate clarification, and what broader information is still missing?',
          hint:'Connect his account to functioning and practical needs. Clarify possible harm when relevant without assuming it from unusual experiences. Separate what can be established here from physical assessment, collateral, and supervisory input still needed.',
          examples:['How has this affected your ability to look after yourself?','What do you need help with most urgently today?'],
          reflection:'What makes a concern urgent or uncertain in this account, and which questions would you prioritize with your supervisor?'
        }
      }
    ]},
    sp_alcohol_ambivalence_001:{id:'sp_alcohol_ambivalence_001',title:'Morgan',goals:[
      {id:'morgan_agenda',title:'Find a useful shared agenda',
        student:{
          question:'Whose goal is leading the conversation right now?',
          hint:'Ask what Morgan wants from the consultation before offering advice. Explain your purpose without assuming that discussion means agreement to change.',
          examples:['What would make this conversation worthwhile for you?','Where would you like us to begin with how alcohol fits into your life?'],
          reflection:'What focus did Morgan accept, and what remained your preferred agenda?'
        },
        resident:{
          question:'How can you hold the clinical reason for this conversation alongside Morgan’s own priorities?',
          hint:'Negotiate a focus that Morgan recognizes as useful. Explore a difference in priorities without treating it as resistance or imposing a change goal. Your coaching depth does not change the case’s clinical decision-making boundaries.',
          examples:['What feels most important for us to understand about your relationship with alcohol?','Before we discuss options, what would you hope to get from talking with me?'],
          reflection:'Where did your assessment agenda and Morgan’s priorities meet, and what difference remains to be discussed?'
        }
      },
      {id:'morgan_reflection',title:'Reflect mixed feelings accurately',
        student:{
          question:'Which competing concerns has Morgan actually expressed?',
          hint:'Use these examples only after both sides have been expressed. Reflect what you heard and invite correction. Do not supply reasons for change or label mixed feelings as resistance.',
          examples:['There are things you value about drinking, and effects you’re less comfortable with. Have I understood that?','You’re weighing more than one side of this. What am I missing?'],
          reflection:'What did Morgan confirm or correct in your reflection?'
        },
        resident:{
          question:'What meaning could your reflection explore without putting words in Morgan’s mouth?',
          hint:'After mixed feelings have emerged, offer a tentative account that preserves both sides. Let Morgan revise it. A more elaborate reflection is not automatically more accurate, and continued conversation is not evidence of commitment.',
          examples:['There is something important on each side of this decision. Which part have I not understood yet?','You’ve described reasons to keep things as they are and reasons to consider something different. How do those fit together for you?'],
          reflection:'Which parts of your reflection were supported or corrected, and where might you have added a meaning of your own?'
        }
      },
      {id:'morgan_next_step',title:'Invite a next step without requiring one',
        student:{
          question:'Has Morgan expressed a wish to change something, or only willingness to discuss it?',
          hint:'Invite Morgan’s own idea, including uncertainty or a wish to think further. Do not turn an exploratory answer into a commitment or give unsupervised medical instructions.',
          examples:['What, if anything, would you like to be different?','Is there a next step you would want to consider, or would it help to talk this through further?'],
          reflection:'What was actually chosen, and what remains undecided?'
        },
        resident:{
          question:'What would distinguish an expressed preference from a commitment Morgan actually wants to make?',
          hint:'Check what Morgan means by considering a change before planning it. Keep the person’s choice separate from medical decisions that need the treating team. Further exploration can be a useful outcome without an agreed behavior change.',
          examples:['When you say you might consider a change, what does considering it mean to you?','Would you like to explore an option now, or leave that decision open while you think?'],
          reflection:'How would you describe Morgan’s actual level of agreement, and what clinical questions still need the treating team?'
        }
      }
    ]},
    family_morgan_maya_001:{id:'family_morgan_maya_001',title:'Morgan and Maya',goals:[
      {id:'family_purpose',title:'Make room for each person’s purpose',
        student:{
          question:'Whose perspective has had less room so far?',
          hint:'Invite each person by name and listen in turn. Different hopes can remain different. Both participants hear this shared meeting; the examples do not open a private conversation.',
          examples:['Morgan, what would make this meeting useful for you?','Maya, what would you most want us to understand about your hopes for this conversation?'],
          reflection:'Can you describe each person’s priorities separately?'
        },
        resident:{
          question:'Are you holding both perspectives, or letting one person’s agenda become the presumed family goal?',
          hint:'Make space for each person’s purpose before seeking a shared focus. Facilitate their accounts without treating a difference as conflict or needing to settle it. All replies remain in the shared meeting.',
          examples:['Morgan, what would you want to make sure this conversation includes from your point of view?','Maya, what matters to you about being part of this meeting?'],
          reflection:'Which priorities overlap, which differ, and what have you avoided assuming about the relationship?'
        }
      },
      {id:'family_accounts',title:'Keep each account attributable',
        student:{
          question:'Do you know whose experience or observation this statement represents?',
          hint:'Ask what was personally observed and what came from someone else. Do not assume a family member witnessed an event. Give the other person room to describe their own account without deciding who is right.',
          examples:['Maya, which parts did you see or hear yourself?','Morgan, how does that compare with your experience?'],
          reflection:'Which accounts differed, and what remains unverified?'
        },
        resident:{
          question:'Which apparent disagreement reflects different information, experience, or interpretation?',
          hint:'Clarify each account’s source before synthesizing it. Do not assume a family member witnessed an event or that one account verifies another. Preserve uncertainty and avoid becoming an arbiter of who is right.',
          examples:['Maya, what do you know firsthand, and what have you heard from someone else?','Morgan, what would you add or understand differently from your own experience?'],
          reflection:'How would you present the different accounts to your supervisor while preserving their sources and unresolved details?'
        }
      },
      {id:'family_support',title:'Separate support, choice, and limits',
        student:{
          question:'Have you distinguished an offer of support from an expectation placed on someone?',
          hint:'Ask what is welcome and what is workable. An offer is not an agreement until the relevant people accept it. Do not assign Maya responsibility for monitoring Morgan or managing their choices.',
          examples:['Maya, what support would be workable for you, and what would be too much?','Morgan, which of those offers, if any, would you welcome?'],
          reflection:'What did each person actually agree to, and which limits remain explicit?'
        },
        resident:{
          question:'Does the proposed support preserve Morgan’s choice and Maya’s own limits?',
          hint:'Check each person’s agreement separately. Distinguish caring, availability, and responsibility; do not turn an offer into a monitoring role. Leave unresolved clinical decisions with the team rather than treating family agreement as sufficient.',
          examples:['Maya, what would you want clarified before deciding whether that support is workable for you?','Morgan, what would you want that support to look like, if you choose it?'],
          reflection:'Which specific commitments are supported by what each person said, and what still requires clarification or team input?'
        }
      }
    ]}
  };
  function ids(){return Object.keys(CASES);}
  function getCase(id){return typeof id==='string'&&Object.prototype.hasOwnProperty.call(CASES,id)?JSON.parse(JSON.stringify(CASES[id])):null;}
  return {getCase:getCase,ids:ids};
}));
