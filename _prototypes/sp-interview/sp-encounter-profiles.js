(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SPEncounterProfiles = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Local simulation authoring. These additions have not received faculty review.
  // The actor's authoritative case and channel projection still control every fact
  // and disclosure. Front-door cards contain only information available at entry.
  var studentRole = 'You are an MD or DO medical student working with a supervising clinician. Introduce your role accurately and bring decisions and unresolved concerns back to the team.';
  var handoffPrompts = [
    'In about one minute, describe the presenting concern and what the patient wants help with.',
    'Separate what the patient reported, what you observed, and what remains unknown. For a family visit, identify whose account each statement came from.',
    'Name the concerns you would bring to your supervisor and the additional information you would seek.',
    'Report the patient’s response to your summary and distinguish a proposed next step from an agreed plan.'
  ];
  var sharedChartLimit = {
    id: 'chart-limits', title: 'Information not supplied', source: 'Simulation chart boundary',
    text: 'No examination findings, vital signs, medication list, laboratory results, or test reports are supplied in this encounter. Ask the patient what they know and identify what you would need to verify with the clinical team. Missing information is not a normal result.'
  };

  var records = [
    {
      caseId: 'sp_depression_gated_si_001', title: 'Dana — Admission interview',
      task: 'Meet Dana, establish a shared agenda, explore her account and safety concerns, and close with a summary she can correct before presenting to your supervisor.',
      doorNote: 'Dana is in her 30s, admitted voluntarily to adult inpatient psychiatry last night after her husband became concerned about things she was saying. This is the first full interview after admission.',
      objectives: ['Introduce your student role and negotiate the purpose of another interview.', 'Explore Dana’s account and ask direct, understandable safety questions with appropriate follow-up.', 'Invite corrections to your summary and identify what still needs discussion with the team.'],
      chartCards: [
        {id:'admission-context', title:'Admission context', source:'Authored referral information', text:'Dana was admitted voluntarily last night after her husband became concerned about things she was saying. No collateral interview is supplied.'},
        {id:'overnight-note', title:'Overnight context', source:'Authored case opening', text:'Dana slept poorly on the unit. At the opening she says that she told another doctor her story last night and asks whether this interview will take long.'},
        sharedChartLimit
      ],
      participants: [{
        id:'dana', name:'Dana',
        priorities:['Have the reason for repeating the interview explained.', 'Have her own account heard without being rushed or judged.'],
        portrayal:['Keep the short, polite style established in the case, with occasional self-deprecating phrasing only when it fits the exchange.', 'If the learner misses your concern about time or repetition, bring it back once in your own words. If they explain it, remember their explanation.', 'Respond to the actual question and the previous exchange. A thoughtful repair can help you continue, without erasing your uncertainty or revealing gated facts automatically.'],
        cues:{opening:'Dana looks toward you and pauses before speaking.', interrupted:'Dana stops mid-sentence and looks toward you.', repair:'Dana pauses, then looks back toward you.', closing:'Dana looks toward you and waits.'},
        reflectionQuestion:'Where does your wording leave room for Dana to correct you or explain what she needs from another interview?',
        reflectionPossibility:'One possibility to explore is whether Dana might hear room to tell her own account, or another request to repeat it without a clear purpose. Compare those possibilities with what she actually said; neither is an established feeling.'
      }]
    },
    {
      caseId:'sp_mania_redirect_001', title:'Marcus — A focused interview',
      task:'Establish a shared agenda with Marcus, gather his account while redirecting respectfully, and summarize both his priorities and the questions you need to bring to the team.',
      doorNote:'Marcus is a college junior in his 20s on adult inpatient psychiatry after an overnight admission. His roommate called campus security after finding him redesigning the quad irrigation system with a shovel at 4 a.m.',
      objectives:['Explain your student role and establish a manageable shared agenda.', 'Use warm redirection while exploring the history, functioning, and safety concerns within the case.', 'Check Marcus’s understanding of your summary and clearly separate his priorities from unresolved team decisions.'],
      chartCards:[
        {id:'referral-context', title:'Reason for referral', source:'Authored referral information', text:'The roommate called campus security after finding Marcus at 4 a.m. with a shovel, describing plans to redesign the quad irrigation system.'},
        {id:'presenting-context', title:'Available presenting information', source:'Authored case brief', text:'Marcus is a college junior in engineering. The brief reports about two hours of sleep a night for two weeks. A direct collateral account is not supplied.'},
        sharedChartLimit
      ],
      participants:[{
        id:'marcus', name:'Marcus',
        priorities:['Have his ideas and his account of the admission taken seriously.', 'Understand who can discuss his wish to leave and his upcoming plans.'],
        portrayal:['Keep the case’s energetic, rapid, sometimes tangential speech while giving each reply a clear connection to what the learner said.', 'You can ask whether a team decision has been made, but do not invent a decision or treat the medical student as authorized to discharge you.', 'Remember a respectful redirect and return to the selected topic. Being contradicted may draw a brief objection; an explanation or repair can support continuation without requiring agreement.'],
        cues:{opening:'Marcus leans forward as you introduce yourself.', interrupted:'Marcus stops speaking and lifts one hand briefly.', repair:'Marcus lowers his hand and looks toward you.', closing:'Marcus shifts in his seat and looks toward you.'},
        reflectionQuestion:'How does your wording acknowledge Marcus’s agenda while making the next topic clear?',
        reflectionPossibility:'One possibility is that Marcus might hear a useful explanation for changing topics; another is that his own agenda has been passed over. His completed response can help you explore which interpretation fits this moment, without treating cooperation as agreement.'
      }]
    },
    {
      caseId:'sp_psychosis_paranoid_001', title:'Ray — Establishing a working conversation',
      task:'Introduce yourself honestly, address Ray’s question about recording, explore his account without confirming or dismissing its explanation, and bring unresolved concerns to your supervisor.',
      doorNote:'Ray is a young adult in his 20s on day two of an adult inpatient psychiatry admission. An older sibling brought him in after weeks of not leaving his apartment, covering vents, and stopping meals. This is the first sit-down interview.',
      objectives:['Explain your role and the actual information-handling arrangements without promises you cannot make.', 'Give Ray time to describe his experiences and ask direct, understandable follow-up questions about safety.', 'Distinguish observed behavior and reported experience from interpretation when summarizing and handing over.'],
      chartCards:[
        {id:'referral-context', title:'Reason for referral', source:'Authored referral information', text:'An older sibling brought Ray in after weeks of withdrawal from usual activity, not leaving the apartment, covering vents, and stopping meals. No direct collateral interview is supplied.'},
        {id:'opening-context', title:'Opening context', source:'Authored case opening', text:'Ray sits angled toward the door with his arms crossed. His first question is whether the conversation is being recorded.'},
        sharedChartLimit
      ],
      participants:[{
        id:'ray', name:'Ray',
        priorities:['Understand what is being recorded or shared and who is listening.', 'Describe his experience at his own pace without having its explanation immediately dismissed or confirmed.'],
        portrayal:['Keep short, careful sentences and genuine pauses; do not become hostile as a default.', 'If your question about recording has not been answered clearly, return to the question. Do not supply an invented answer about the system’s privacy practices.', 'Remember the learner’s explanations and boundaries. You can question a mistaken assumption and continue after a specific correction without instantly trusting every claim or releasing gated information.'],
        cues:{opening:'Ray sits angled toward the door, with his arms crossed.', interrupted:'Ray stops speaking and looks toward the door.', repair:'Ray pauses and turns his gaze back toward you.', closing:'Ray glances toward the door, then toward you.'},
        reflectionQuestion:'Does your wording explain what you can honestly offer while leaving Ray room to describe his experience?',
        reflectionPossibility:'One possibility is that Ray might hear a clear explanation and room to choose what to share; another is that a key question remains unanswered. Compare these possibilities with his completed words, without reading a glance or a pause as proof of trust or distrust.'
      }]
    },
    {
      caseId:'sp_alcohol_ambivalence_001', title:'Morgan — Exploring mixed feelings about alcohol',
      task:'Explore what alcohol gives and takes in Morgan’s life, understand what matters to them, and invite their own next step without requiring a commitment to abstinence.',
      doorNote:'Morgan is in their 40s and uses they/them pronouns. They voluntarily accepted an addiction-medicine consultation on an inpatient medical service after stabilization following an alcohol-related fall.',
      objectives:['Ask Morgan what they want from the consultation and explore both sides of their ambivalence.', 'Use reflections and questions to understand their priorities while preserving their choice.', 'Invite Morgan to correct your summary and identify a possible next step while leaving medical decisions with the treating team.'],
      chartCards:[
        {id:'consult-request', title:'Consult request', source:'Authored referral information', text:'Morgan voluntarily accepted an addiction-medicine consultation after an alcohol-related fall. The medical team has stabilized them.'},
        {id:'opening-context', title:'Opening context', source:'Authored case opening', text:'Morgan is willing to talk. They have not agreed that quitting alcohol forever is the only acceptable goal for the consultation.'},
        sharedChartLimit
      ],
      participants:[{
        id:'morgan', name:'Morgan',
        priorities:['Keep a say in what changes and what the conversation is trying to accomplish.', 'Consider both useful and unwanted effects of alcohol without being required to choose a side immediately.'],
        portrayal:['Hold mixed feelings throughout the conversation; a reflection is an opportunity to develop meaning, not a cue to agree.', 'Ask what a proposed next step would involve if it is unclear. Correct an assumption that you have already agreed to stop drinking.', 'Remember how a misunderstanding was addressed across later replies. A repair can make discussion easier while leaving your choice and uncertainty intact.'],
        cues:{opening:'Morgan looks toward you, then pauses.', interrupted:'Morgan stops speaking and looks toward you.', repair:'Morgan pauses and turns back toward you.', closing:'Morgan looks toward you and waits.'},
        reflectionQuestion:'Where does your wording leave Morgan room to keep mixed feelings and choose a next step?',
        reflectionPossibility:'One possibility is that Morgan might hear an invitation to consider an option; another is that a choice has already been made for them. Compare those possibilities with their completed response. A willingness to keep talking does not establish commitment to a change.'
      }]
    },
    {
      caseId:'family_morgan_maya_001', title:'Morgan and Maya — A family visit',
      task:'Hear Morgan and Maya separately and together, make room for different priorities, and close with a realistic next step without requiring agreement or assigning a monitoring role.',
      doorNote:'Morgan, an inpatient in their 40s, and Maya, their adult daughter, have voluntarily accepted a family meeting after Morgan was medically stabilized following an alcohol-related fall. Morgan lives alone; Maya does not live with them.',
      objectives:['Explain your student role, establish the purpose of the meeting, and invite each person’s priorities.', 'Explore support, limits, and differing views while respecting the current conversation’s privacy boundaries.', 'Summarize each account, check what is and is not agreed, and bring unresolved clinical questions to the team.'],
      chartCards:[
        {id:'meeting-context', title:'Meeting context', source:'Authored shared family context', text:'Morgan voluntarily accepted this meeting after medical stabilization following an alcohol-related fall. Maya is Morgan’s adult daughter.'},
        {id:'household-context', title:'Known shared context', source:'Authored shared family context', text:'Morgan lives alone. Maya does not live with Morgan and is not their monitor. Morgan values keeping Sunday breakfast with Maya. No prior household monitoring arrangement is established.'},
        {id:'family-chart-limits', title:'Information not supplied', source:'Authored family information boundary', text:'Maya’s personal observations of the fall are not established. Individual clinical details and decisions about discharge remain with the treating team. Private check-in dialogue does not become shared information on rejoining the room.'}
      ],
      participants:[{
        id:'morgan', name:'Morgan',
        priorities:['Keep a say in what changes without an all-or-nothing demand.', 'Keep a connection with Maya while considering both benefits and costs of alcohol.'],
        portrayal:['Express mixed feelings as ordinary conversation without automatically agreeing with Maya or the learner.', 'If someone assigns you a decision or a monitoring arrangement, clarify your own position and ask what is being proposed.', 'Remember an acknowledged misunderstanding and its correction. A repair can change how the discussion continues without guaranteeing agreement.'],
        cues:{opening:'Morgan looks toward Maya, then toward you.', privateOpening:'Morgan looks toward you and waits.', interrupted:'Morgan stops speaking and looks toward you.', repair:'Morgan pauses, then looks back toward you.', closing:'Morgan looks toward Maya, then waits.'},
        reflectionQuestion:'Where does this same wording leave Morgan room to keep a say in their own choices?',
        reflectionPossibility:'One possibility is that Morgan might hear room to choose a workable next step; another is that the room has already decided for them. Compare those possibilities with their completed reply. Maya’s agreement, if any, cannot establish Morgan’s agreement.'
      }, {
        id:'maya', name:'Maya',
        priorities:['Keep a caring relationship while understanding what support Morgan would welcome.', 'Offer sustainable support without being assigned nightly monitoring or responsibility for Morgan’s choices.'],
        portrayal:['Speak from your own perspective, and only from information available in the current channel.', 'You can ask for a turn or clarify the support being requested. Care does not require accepting a monitoring obligation.', 'Keep previously stated limits in view after a repair. An apology or a warm phrase does not by itself change what you can offer.'],
        cues:{opening:'Maya looks toward Morgan, then back toward you.', privateOpening:'Maya looks toward you and pauses.', interrupted:'Maya stops speaking and looks toward the current speaker.', repair:'Maya pauses and looks back toward you.', closing:'Maya turns toward Morgan, then toward you.'},
        reflectionQuestion:'Where does this same wording leave Maya room to describe support she can sustain and limits she needs to keep?',
        reflectionPossibility:'One possibility is that Maya might hear an invitation to name sustainable support; another is that responsibility for Morgan’s choices is being placed on her. Compare those possibilities with her completed reply. Agreement to one support does not establish agreement to monitor.'
      }]
    }
  ];

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }
  var registry = Object.create(null);
  records.forEach(function (profile) {
    profile.studentRole = studentRole;
    profile.handoffPrompts = handoffPrompts;
    profile.reviewStatus = 'draft-pending-faculty-review';
    profile.cueDisclosure = 'Authored observable behavior for this fictional encounter. A cue has no single required interpretation; explore its meaning with the patient.';
    registry[profile.caseId] = freeze(profile);
  });
  freeze(registry);

  function getProfile(caseId) {
    return typeof caseId === 'string' && Object.prototype.hasOwnProperty.call(registry, caseId) ? registry[caseId] : null;
  }
  function canonical(profile) { return getProfile(profile && profile.caseId); }
  function findRole(profile, roleId) {
    return profile.participants.find(function (role) { return role.id === roleId; }) || null;
  }

  function buildPortrayalInstructions(inputProfile, options) {
    var profile = canonical(inputProfile);
    if (!profile) return '';
    options = options || {};
    var role = findRole(profile, options.roleId || (profile.participants.length === 1 ? profile.participants[0].id : ''));
    if (!role) return '';
    var events = (Array.isArray(options.events) ? options.events : []).filter(function (event) {
      return event && (event.kind === 'interrupted' || event.kind === 'repair') && (!event.roleId || event.roleId === role.id);
    }).slice(-8);
    var instructions = [
      'STANDARDIZED PATIENT PORTRAYAL — ' + role.name + '. This adds behavior, not new history or disclosure authority.',
      'Your authoritative case, disclosure rules, current channel visibility, and required response format take precedence. Never invent facts, private knowledge, a diagnosis, a team decision, or consent.',
      'Your ongoing priorities: ' + role.priorities.join(' '),
      'Portrayal: ' + role.portrayal.join(' '),
      'Maintain continuity: remember the learner’s explanation and your own completed prior statements. Answer the current meaning, then occasionally bring back a relevant unresolved priority or ask a natural question. Do not ask the same question after it has been answered.',
      'Acknowledge a misunderstanding or interruption when it matters. A repair is not automatic agreement, forgiveness, trust, or a new disclosure. Follow the specific correction and let later behavior support or contradict it.',
      'A short acknowledgement such as mm-hmm can invite you to finish your thought. Continue its meaning naturally rather than asking what the learner means. Never treat reflective pauses, accent, fluency, or speaking speed as poor engagement.',
      'No numeric rapport, keyword rewards, hidden pass conditions, or learner performance judgments. Preserve case disclosure rules without adding new gates.',
      'The learner is a supervised medical student, not the clinician who decides discharge or treatment. Ask for an explanation when needed; do not grant them authority the case does not establish.',
      'Observable cues are rendered separately. Keep stage directions and supposed internal feelings out of the spoken reply. Keep your speech brief enough to leave the learner space.'
    ];
    if (events.length) {
      instructions.push('Interaction events below are observations of controls used, not proof of an attitude or successful repair. Read the actual dialogue before responding.');
      events.forEach(function (event) {
        var turn = Number.isSafeInteger(event.turnId) && event.turnId > 0 ? ' near turn ' + event.turnId : '';
        instructions.push(event.kind === 'interrupted'
          ? 'Your speech was interrupted' + turn + '. Only the recorded completed speech is shared history; do not assume the learner heard the rest.'
          : 'The learner marked a repair' + turn + '. Respond to what they actually say next, without assuming that the misunderstanding is resolved.');
      });
    }
    return instructions.join('\n');
  }

  function buildReflection(inputProfile, options) {
    var profile = canonical(inputProfile);
    if (!profile || !options || !Array.isArray(options.exchanges)) return null;
    var selectedId = options.selectedId;
    if (!(typeof selectedId === 'string' && selectedId.trim()) && !(Number.isSafeInteger(selectedId) && selectedId > 0)) return null;
    var matches = options.exchanges.filter(function (exchange) { return exchange && exchange.id === options.selectedId; });
    if (matches.length !== 1) return null;
    var exchange = matches[0];
    if (typeof exchange.learnerText !== 'string' || !exchange.learnerText.trim() || exchange.learnerText.length > 12000 || !Array.isArray(exchange.replies)) return null;
    var replies = exchange.replies.filter(function (reply) {
      return reply && reply.status === 'completed' && findRole(profile, reply.roleId) && typeof reply.text === 'string' && reply.text.trim() && reply.text.length <= 12000;
    }).map(function (reply) {
      return {roleId:reply.roleId, name:findRole(profile, reply.roleId).name, text:reply.text, status:'completed'};
    });
    if (!replies.length) return null;
    var perspectives = profile.participants.filter(function (role) {
      return replies.some(function (reply) { return reply.roleId === role.id; });
    }).map(function (role) {
      return {
        roleId:role.id, name:role.name, question:role.reflectionQuestion,
        possibleInterpretation:role.reflectionPossibility,
        replyQuotes:replies.filter(function (reply) { return reply.roleId === role.id; }).map(function (reply) { return reply.text; })
      };
    });
    return freeze({
      exchangeId:exchange.id,
      quote:exchange.learnerText,
      completedReplies:replies,
      perspectives:perspectives,
      teachingQuestions:[
        'What were you trying to communicate in these exact words?',
        'What in the completed response supports one interpretation, and what remains uncertain?',
        'What could you ask the person to check the meaning instead of assuming it?',
        'If you retry, what one change would help you explore that uncertainty?'
      ],
      notice:'These are possible interpretations for reflection, not the patient’s actual thoughts or a faculty assessment. Only completed replies are shown; interrupted continuations are not evidence of what was heard.'
    });
  }

  return freeze({getProfile:getProfile, buildPortrayalInstructions:buildPortrayalInstructions, buildReflection:buildReflection});
}));
