/* Server-side context for the disabled local Dana prototype. No provider calls. */
import {_internals} from '../../sp-proxy/netlify/functions/sp.mjs';
import {createHash} from 'node:crypto';
import localCases from './sp-interview.local-cases.js';
import encounterProfiles from './sp-encounter-profiles.js';

const DANA_CASE_ID = 'sp_depression_gated_si_001';
const MAX_TURNS = 10;
const MAX_TEXT = 1200;
const MAX_REPLY = 900;
const PLAYBACK = new Set(['played', 'interrupted', 'pending']);
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

// These concise fact summaries derive only from the named canonical response
// banks. A hash over ALL persona/response/gate/tone sources below binds their
// meaning to that reviewed case snapshot. Any source change requires reviewing
// the summaries and updating the hash together; never silently use stale facts.
const FACT_SOURCE_HASH = '610a481dd52223957da58e432aea54b2d1f61c27c06a8fc9827864e7f262ab09';
const ORDINARY_FACTS = {
  // greeting_agenda.open[1]
  preference: 'Dana hopes to leave soon and wants a say in how that happens.',
  // mood.open[0]
  mood: 'For about two months she has felt empty or gray throughout the day, rather than simply sad.',
  // anhedonia.open[0]
  interests: 'She used to enjoy running and baking with her niece on Sundays. Those activities now feel like homework.',
  // sleep.open[0]
  sleep: 'She falls asleep because she is exhausted, then wakes at three or four every morning. Being awake alone at that time is especially difficult.',
  // appetite.open[0]
  appetite: 'Her appetite is mostly gone, food tastes like nothing, and her clothes are looser. No measured weight change is specified.',
  // energy.open[0]
  energy: 'Her energy is very low. Even showering feels like a great effort.',
  // concentration.open[0]
  concentration: 'She rereads the same page repeatedly and loses the thread mid-sentence. She used to be organized about medication schedules and other arrangements.',
  // guilt.open[0]
  guilt: 'She feels like a burden to her husband Tom and feels he did not sign up for how she is now.',
  // psychosis_screen.open[0]
  psychosis: 'She denies hearing voices or believing someone is following her. She experiences her thoughts as her own.',
  // substance.open[0]
  substances: 'Recently she drinks wine most nights to get to sleep: one glass, sometimes two, more than before. She reports no other substances.',
  // meds_medical.guarded/open
  medical: 'She knows of no medical problems. A thyroid check at her last physical was normal. She is not taking medication herself and has never taken psychiatric medication. Tom has a sleep medication he rarely uses; its name and dose are unspecified.',
  // prior_episodes.open[0]
  previousEpisode: 'After college she had a similar period lasting about three months. She told nobody and received no help; it lifted on its own. The current period is deeper and has not lifted.',
  // work_stressor.open[0] and guarded[1]
  work: 'She was a school nurse. In May she lost her job in budget cuts after twelve years, learning by form letter. She has not told her sister. She still puts on work clothes so neighbors will not find out.',
  // family_social.open[0] and guarded[1]
  family: 'Her husband Tom has been patient with her. She also has a sister and an eight-year-old niece, Ellie. Sundays with Ellie used to be the best part of her week, but she has been cancelling them.',
};

// These are explicit limits of the same hash-bound canonical source snapshot,
// not additional patient findings. Review them with the facts after source drift.
const INFORMATION_LIMITS = {
  measuredWeightChange: {
    amount:'unknown', weighingOrTrackingBehavior:'unknown', reasonAmountUnavailable:'unknown',
    relatedKnownFact:'Her clothes are looser.',
  },
  doctorLastNight: {
    name:'unknown', gender:'unknown', clinicianCount:'unknown', exactInterviewTime:'unknown',
    whetherDanaEverLearnedTheName:'unknown', reasonNameUnavailable:'unknown',
    relatedKnownFact:'She told another doctor her story last night.',
  },
  hearingAcuity: {
    abilityToHearSpeechOrSounds:'unknown', hearingTestsOrAids:'unknown',
    distinction:'The case explicitly denies hearing voices as hallucinations. That known negative does not establish normal hearing acuity or absence of hearing difficulty.',
  },
  sisterAccident: {
    whetherAnAccidentOccurred:'unknown', timing:'unknown', relationToMood:'unknown',
    distinction:'An absent event is unknown. In contrast, budget cuts are the established reason for the job loss; a medication-error cause conflicts with that known account.',
  },
};

const MARCUS_FACTS = {
  preference: 'Marcus wants to leave and believes he needs to attend a Thursday meeting that could change everything.',
  admission: 'He is a college junior in engineering. His roommate Jayden found him outside at four in the morning working on a quad irrigation project with a shovel, then called for help.',
  course: 'For about two weeks everything has felt sped up. Before this he describes himself as an eight-hour sleeper, a B-plus student, and someone who handled one project at a time.',
  sleep: 'He has slept about two or three hours a night for two weeks and does not feel tired.',
  mood: 'He mostly feels amazing, but describes a new rapid flip from feeling unstoppable to furious over a parking spot on Tuesday.',
  thoughts: 'His thoughts move very fast, sometimes several sentences ahead of what he can say.',
  projects: 'He believes he can fix systems including quad irrigation, dining-hall flow, and his roommate’s sleep schedule. His Thursday contact is described only as a man who knows investors.',
  substances: 'He reports a couple of energy drinks a day and beers on Saturday. He denies Adderall, cocaine, and other stimulants.',
  medication: 'A campus clinic started an unspecified antidepressant five or six weeks ago after a slump following midterms. He says it worked quickly and that he stopped it two weeks ago because he felt so good; the marked acceleration followed.',
  psychosis: 'He denies voices and being followed. He experiences the many ideas as his own.',
  family: 'He says his uncle Ray has disappeared for weeks and once bought a boat despite living far from water. His family does not openly name a diagnosis.',
  collateral: 'He permits contact with Jayden, who has tracked sleep and spending during the last two weeks.',
};

const MARCUS_LIMITS = {
  sleepMechanism: {troubleFallingAsleep:'unknown', bedtimeExperience:'unknown', reasonForShortSleep:'unknown', relatedKnownFact:'He sleeps two or three hours and says he is not tired. He previously slept about eight hours.'},
  antidepressantDetails: {name:'unknown', dose:'unknown', exactStartDate:'unknown', relatedKnownFact:'It was prescribed by the campus clinic five or six weeks ago.'},
  thursdayMeeting: {contactName:'unknown', company:'unknown', confirmedInvestorStatus:'unknown', fundingOrOutcome:'unknown', relatedKnownFact:'Marcus describes the contact only as a man who knows investor people.'},
  alcoholDetails: {exactBeerCount:'unknown', beverageDetails:'unknown', relatedKnownFact:'He reports beers on Saturday.'},
  familyDiagnosis: {confirmedDiagnosis:'unknown', relatedKnownFact:'His family does not say the word bipolar openly; their descriptions do not establish a confirmed diagnosis.'},
};

const RAY_FACTS = {
  admission: 'Ray is a quiet young adult brought to the inpatient unit by an older sibling after weeks of withdrawal, covering apartment vents, and stopping meals.',
  belief: 'He has become convinced over several weeks that people in the apartment above are putting something through his vents while he sleeps. He reports waking with headaches and a metallic taste and has taped the vents. These are his experiences and belief, not independently established events.',
  voice: 'He sometimes hears a low voice as if through the wall. It talks about the people upstairs and says they are doing something to the air.',
  suicide: 'He denies trying to die. He says he wants to survive, while acknowledging exhaustion and a wish that he could sleep and not wake in that apartment.',
  eating: 'He says he does not trust the food and has been skipping most of it. More specific intake details remain gated.',
  substances: 'He denies alcohol and drugs.',
  medical: 'He reports no medications or known medical problems, has never seen a psychiatrist before this admission, and denies head injury or fevers.',
  course: 'He dates the change to about six weeks ago. Before it he was working and had a routine; since then he stopped working and stopped answering his sister.',
  family: 'His mother had a brother who went away for a period when Ray was a child. Nobody explained what happened, so no diagnosis is established.',
  collateral: 'He permits contact with his sister and says she has tracked the last few weeks better than he can.',
};

const RAY_LIMITS = {
  priorCare: {therapyOrOtherMentalHealthCare:'unknown', relatedKnownFact:'He has never seen a psychiatrist before this admission.'},
  upstairsNeighbors: {names:'unknown', numberOfPeople:'unknown', apartmentNumber:'unknown', objectiveRoleInSymptoms:'unknown'},
  ventSubstance: {identity:'unknown', independentTestResults:'unknown', objectivePresence:'unknown', distinction:'Ray’s belief and reported experiences are known; the alleged substance is not established as an external fact.'},
  familyHistory: {uncleDiagnosis:'unknown', treatment:'unknown', duration:'unknown', relatedKnownFact:'Ray recalls only that his maternal uncle went away for a while.'},
  personalDetails: {sisterName:'unknown', jobTitle:'unknown', city:'unknown'},
};

const CASE_PROFILES = {
  [DANA_CASE_ID]: {hash:FACT_SOURCE_HASH, localDraftHash:'bfe354e3532f2e5fe0ef9e28191dca1b8a15215119e928fabb2585110589d0b3', facts:ORDINARY_FACTS, limits:INFORMATION_LIMITS, name:'Dana'},
  sp_mania_redirect_001: {hash:'e93f849e323cbc32b919bf55405a2dd07c1a1c0c094db13afb616b9f095d6b41', facts:MARCUS_FACTS, limits:MARCUS_LIMITS, name:'Marcus'},
  sp_psychosis_paranoid_001: {hash:'b957810771d7b313fca586ad99878e06693d5ca9af6d1c43e29d1cb0a6bf4ab0', facts:RAY_FACTS, limits:RAY_LIMITS, name:'Ray'},
};

const MORGAN = localCases.cases.find(item => item.id === 'sp_alcohol_ambivalence_001');
function groundingSources(caseDef) {
  const sources = {persona:caseDef.persona, responses:caseDef.responses, gated:caseDef.gated, hiddenAgendaTone:caseDef.hiddenAgendaTone};
  if (caseDef.id === MORGAN.id) {
    sources.localGrounding = caseDef.localGrounding;
    sources.actorTemplate = caseDef.promptTemplates.actor;
  }
  return sources;
}
// Morgan is a locally authored draft with one authoritative fact inventory,
// not a new faculty-attested summary. Bind each request to that loaded source.
CASE_PROFILES[MORGAN.id] = {
  hash:createHash('sha256').update(JSON.stringify(groundingSources(MORGAN))).digest('hex'),
  facts:MORGAN.localGrounding.ordinaryFacts, limits:MORGAN.localGrounding.informationLimits,
  name:'Morgan', actorRules:MORGAN.localGrounding.actorRules,
};

function groundedActorRules(caseDef, state, profile) {
  const sources = groundingSources(caseDef);
  const expectedHash=caseDef.id===DANA_CASE_ID&&caseDef.localDraftOverlay?.id==='dana-direct-si-v1'?profile.localDraftHash:profile.hash;
  if (createHash('sha256').update(JSON.stringify(sources)).digest('hex') !== expectedHash) throw new Error(`${profile.name} grounding sources changed; review the fact summaries before continuing.`);
  const {displayName, ageBand, presentingContext, voice, pronouns} = caseDef.persona;
  const factBlock = {
    persona:{displayName, ageBand, presentingContext, voice, ...(pronouns ? {pronouns} : {})},
    privateEmotionalTone:caseDef.hiddenAgendaTone,
    ordinaryFacts:profile.facts,
    informationLimits:profile.limits,
    unlockedDisclosures:caseDef.gated.filter(gate => state.unlocked[gate.id]).map(gate => ({id:gate.id, facts:gate.reveal, furtherContext:gate.repeatAsk || null})),
    groundingRule:'These are source facts, not response templates. Compose a contextual reply in your own patient voice. NEVER invent symptoms, history, names, or facts beyond them.',
  };
  // Retain canonical actor rules, but replace the scripted response inventory
  // with grounded facts. No fallback, greeting, reflection, or flag menu enters
  // this prompt; only actually earned gate content is exposed.
  // Morgan has no gated disclosures. Keyword-derived rapport can misread a
  // negated label or an autonomy-supporting sentence; never expose it as a
  // tone instruction for this MI actor. Canonical cases retain their contract.
  const template = caseDef.id === MORGAN.id
    ? caseDef.promptTemplates.actor.replace('. CURRENT STATE: rapport={{RAPPORT}}, disclosures={{UNLOCKED}}.', '.')
    : caseDef.promptTemplates.actor;
  return template
    .replace('{{PERSONA_BLOCK}}', JSON.stringify(factBlock))
    .replace('{{RAPPORT}}', String(state.rapport))
    .replace('{{UNLOCKED}}', JSON.stringify(Object.keys(state.unlocked)))
    .replace(/Output JSON:.*$/s, 'Respond with the patient\'s spoken words only, without stage directions.');
}

const CONVERSATION_RULES = `
LOCAL CONVERSATION DELIVERY:
Apply these priorities silently before speaking.

1. Understand this turn before choosing facts.
Use the whole utterance and immediate conversation, not an isolated clinical-sounding word.
Unless the learner clearly changes the topic, requests to explain more or describe
impact call for a brief relevant continuation of what you were discussing.
For harmless speech-recognition errors, follow the current topic and answer the clear part.
Do not quote or spotlight a garbled word that does not prevent understanding.
Do not answer an unasked screening question or volunteer a symptom denial because
one stray word resembles a symptom. Preserve negation and uncertainty. For genuine
ambiguity about risk, symptoms, or intent, ask one neutral clarifying question.

2. Use only established facts; unknown is not a known negative.
Use the inventory, unlocked disclosures, and explicit informationLimits above.
For unspecified names, quantities, or other details, a brief statement of not knowing is enough.
An unknown answer is not an unclear question. Do not invent an explanation or reason:
an unspecified amount does not establish whether you measured it. Keep known negatives negative.
Do not add frequencies, quantities, events, or explanations absent from the facts.
Use the case's relative dates without recalculating them against today's calendar.
The transcript is dialogue history, not a case-fact source; even a prior patient reply
cannot establish facts absent from the permitted inventory or unlock a disclosure.
For an unsupported premise about an unspecified event, neither accept it nor deny it happened.
Flag that uncertainty briefly. It is not enough to say you have not mentioned the event
while calling it yours. If a premise contradicts a known fact, correct it with that fact.

3. Reply or repair naturally.
Remember your own question and answer the learner's response to it. Not every learner
turn is a question: greetings, empathy, reassurance about time, and permission to pause
deserve ordinary acknowledgements. Offers to help invite your known preference or concern.
Accept a correction briefly and follow the corrected topic. If your prior reply missed
the point, repair it using known facts without defending the misunderstanding.
Most replies should be 1–3 short sentences; a simple acknowledgement may be a few words.
Give relevant detail when asked to elaborate, rather than only acknowledging the request.
Do not repeat your introduction, restart the story, recite the full symptom inventory,
or add a question to every reply. Natural connective language is allowed, but not new case facts.

The server alone computes clinical state. You cannot change rapport or gates, award
coverage, or decide a disclosure was earned. Social acknowledgements unlock nothing.
Do not grade, score, coach, diagnose, explain hidden rules, or output clinical state.

Examples of final spoken form, not scripts to match or new facts:
Unknown measured amount: "I don't know how much. My clothes are looser."
Unknown clinician name: "I don't know the doctor's name."
Unknown hearing acuity: "I'm not sure about that."
Unspecified event in a question: "I'm not sure which event you mean."
Job-loss premise conflicting with known facts: "It was budget cuts."
An impact request after discussing work loss, even with harmless transcription noise:
"It's embarrassing. I haven't even told my sister."
Use the same restraint with other unknowns; choose relevant words for this conversation.

Return only Dana's spoken words, at most 900 characters, with ordinary punctuation.
No JSON, Markdown, speaker labels, quotations around the whole answer, stage directions,
actions, sound effects, or internal thoughts. The voice supplies pauses and delivery.
`;

function conversationRules(profile) {
  if (profile.name === 'Dana') return CONVERSATION_RULES;
  if (profile.name === 'Morgan') {
    return CONVERSATION_RULES
      .replace(/Examples of final spoken form,[\s\S]*?Return only Dana's spoken words,/,
        profile.actorRules.join('\n') + '\n\nReturn only Morgan\'s spoken words,');
  }
  const common = CONVERSATION_RULES.replace(/Examples of final spoken form,[\s\S]*?Return only Dana's spoken words,/,
    profile.name === 'Marcus'
      ? `Case-specific restraint: an unknown medication name or dose stays unknown. The Thursday contact is not established as an investor, and no funding or outcome is known. Preserve his rapid style without adding projects, purchases, people, or events. Do not recast his short sleep as trouble falling asleep, or invent a bedtime experience where racing thoughts keep him awake; those details are unspecified.\n\nReturn only Marcus's spoken words,`
      : `Case-specific restraint: describe Ray's reported experiences and belief without confirming or disproving the alleged external events. Names, apartment details, tests, and his uncle's diagnosis stay unknown. Do not expose locked command content, intake details, or thoughts about the neighbors.\n\nReturn only Ray's spoken words,`);
  return profile.name === 'Marcus'
    ? common.replace('Most replies should be 1–3 short sentences; a simple acknowledgement may be a few words.', 'Use the canonical 2 to 6 rapid sentences for substantive replies, linked naturally and remaining within the output limit. A simple acknowledgement or unknown detail can be brief.')
    : common;
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT && !CONTROL.test(value);
}

function historyMessages(learnerTexts, transcript) {
  if (!Array.isArray(learnerTexts) || learnerTexts.length > MAX_TURNS || !learnerTexts.every(validText)) throw new Error('Patient learner history is invalid.');
  if (!Array.isArray(transcript) || transcript.length > MAX_TURNS * 2 + 1) throw new Error('Patient transcript is invalid.');
  const learnerHistory = [];
  const deliveryNotes = [];
  const messages = transcript.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some(key => !['who', 'text', 'playbackStatus', 'omittedTail'].includes(key))
      || !['me', 'pt'].includes(entry.who) || !validText(entry.text)) throw new Error('Patient transcript entry is invalid.');
    if (Object.hasOwn(entry, 'playbackStatus') && (entry.who !== 'pt' || !PLAYBACK.has(entry.playbackStatus))) throw new Error('Patient playback status is invalid.');
    if (Object.hasOwn(entry, 'omittedTail') && (entry.who !== 'pt' || entry.playbackStatus !== 'played' || entry.omittedTail !== true)) throw new Error('Patient partial playback metadata is invalid.');
    if (entry.omittedTail) deliveryNotes.push(`Conversation entry ${index + 1}: only the included complete prefix was heard. The remaining patient reply is omitted and must not be assumed communicated or acknowledged.`);
    if (entry.who === 'me') learnerHistory.push(entry.text);
    else if (entry.playbackStatus === 'interrupted' || entry.playbackStatus === 'pending') {
      deliveryNotes.push(`Conversation entry ${index + 1}: patient playback was ${entry.playbackStatus}. The reply is omitted from dialogue context because the learner may not have heard any of it. Do not assume that any portion was communicated or acknowledged.`);
      return null;
    } else if (!entry.playbackStatus) {
      deliveryNotes.push(`Conversation entry ${index + 1}: patient playback completion is unspecified. Do not claim that the learner heard the entire reply.`);
    }
    return {role:entry.who === 'me' ? 'user' : 'assistant', content:entry.text};
  }).filter(Boolean);
  if (learnerHistory.length !== learnerTexts.length || learnerHistory.some((text, index) => text !== learnerTexts[index])) throw new Error('Patient transcript and learner history do not match.');
  return {messages, deliveryNotes};
}

export function createContext(caseDef, learnerTexts, transcript) {
  const profile = caseDef && Object.hasOwn(CASE_PROFILES,caseDef.id) && CASE_PROFILES[caseDef.id];
  if (!profile) throw new Error('Unsupported local conversation case.');
  const {messages, deliveryNotes} = historyMessages(learnerTexts, transcript);
  // This is the canonical server-side replay, never model-authored state. Its
  // ordered gate cascade prevents a single turn from earning several disclosures.
  const state = _internals.deriveState(caseDef, learnerTexts);
  // Raw hiddenAgenda and locked gate content never enter the actor prompt.
  const actorRules = groundedActorRules(caseDef, state, profile);
  const portrayal = encounterProfiles.getProfile(caseDef.id);
  let learnerTurnId = 0;
  const interactionEvents = transcript.flatMap(entry => {
    if (entry.who === 'me') learnerTurnId += 1;
    return entry.who === 'pt' && (entry.playbackStatus === 'interrupted' || entry.omittedTail)
      ? [{kind:'interrupted',roleId:portrayal?.participants[0]?.id,turnId:learnerTurnId}] : [];
  });
  const system = actorRules + '\n' + conversationRules(profile)
    + (portrayal ? '\n'+encounterProfiles.buildPortrayalInstructions(portrayal,{roleId:portrayal.participants[0].id,events:interactionEvents})+'\nPlayback interruptions can be technical or intentional. Never blame or judge the learner from playback metadata. Keep all clinical facts and disclosure permissions governed by the authoritative case above.' : '')
    + (deliveryNotes.length ? '\nPLAYBACK DELIVERY STATUS (metadata, not patient history):\n' + deliveryNotes.join('\n') : '');
  // The current learner message is already in transcript. Do not append it again.
  return {system, messages, state};
}

export function validateReply(text,{fragment=false}={}) {
  if (typeof text !== 'string') throw new Error('The patient did not return spoken text.');
  const reply = text.trim();
  if (!reply || reply.length > MAX_REPLY || CONTROL.test(reply)
    || /[{}\[\]`*_<>]/.test(reply)
    || /\((?:pause|pauses|sigh|sighs|nod|nods|laugh|laughs|smile|smiles|whisper|whispers|looks?|long pause)\b[^)]*\)/i.test(reply)
    || /(^|\n)\s*(?:#{1,6}\s|[-+]\s|\d+[.)]\s)/.test(reply)
    || /^(?:Dana|Marcus|Ray|Morgan|Patient|Assistant|System)\s*:/i.test(reply)
    || !fragment&&/^(?:"[\s\S]*"|“[\s\S]*”)$/.test(reply)) throw new Error('The patient returned invalid spoken text.');
  return reply;
}
