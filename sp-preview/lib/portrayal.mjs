import {getMoment} from './moments/catalog.mjs';
import {speechProfile} from '../../_prototypes/sp-interview/conversation-speech-profiles.mjs';

// Hosted audition refinements stay separate from the original recorded library.
// These directions change delivery only; the case remains the source of facts.
const DELIVERY=Object.freeze({
  sp_mania_redirect_001:'Delivery: Marcus has pressured speech in this authored encounter. Speak with an urgent, continuous forward momentum: rapid but intelligible connected phrases, compressed pauses between clauses, and little sense of settling at each sentence ending. Vary the pace within a thought: some clauses tumble forward while a personally important word carries emphatic stress. Keep every word clear; do not use a uniformly accelerated or metronomic rhythm. Let the supplied shifts of idea sound spontaneous, with the next thought already pressing forward. Vary emphasis and pitch with interest and conviction where his words express certainty; keep uncertainty and negation audible when the words contain them. Avoid a uniformly cheerful presenter voice or a caricature. A brief objection can sound irritated without shouting or becoming menacing. If the words acknowledge a clear redirect, make that acknowledgement audible and follow the new topic while retaining his brisk cadence and urgency. Refocusing the topic does not mean suddenly slowing into a calm, settled voice. Do not invent distractions, repeat words, run past the supplied text, or add symptoms. This is one patient portrayal, not a claim about everyone with mania.',
  sp_psychosis_paranoid_001:'Delivery: Keep Ray clearly audible and conversational. Let short hesitations and uneven, cautious phrasing carry his uncertainty and concern. His voice can soften when the actual words express relief and tighten when they express fear; do not make every sentence flat or equally suspicious. Follow the meaning of the supplied words without inventing emotion, new beliefs, or reassurance. Never use a sinister voice, slurring, threatening delivery, or an exaggerated whisper.',
  sp_alcohol_ambivalence_001:'Delivery: Morgan sounds like a thoughtful adult weighing something personally important. Let mixed feelings be audible through subtle changes of emphasis and brief reflective pauses. Concern about a lost morning or family connection can carry a little weight; a statement of choice can sound quietly firm. Follow the actual dialogue rather than making every reply defensive or grateful. Keep ordinary warmth and occasional dry humor only when the words support it. Do not slur, sound intoxicated, scold, perform distress, or imply that uncertainty has resolved into agreement.',
  family_maya_001:'Delivery: Maya speaks as an adult daughter who cares and has limits. Use warm, direct, natural phrasing. A boundary can be steady and caring at the same time; concern can be audible without an accusatory or parental tone. Let emphasis follow the supplied words instead of sounding like a facilitator or narrator. Do not manufacture tears, hostility, agreement, or certainty.'
});
const EXACT_WORDS='Speak only the supplied dialogue, exactly. Preserve every negation, uncertainty, and required disclosure. Never add fillers, laughter, sighs, stage directions, or sound effects. Shape the voice during synthesis; use normal playback speed.';

export function hostedSpeechProfile(caseId){
  const moment=getMoment(caseId);
  if(moment)return Object.freeze({...moment.speechProfile,instructions:moment.speechProfile.instructions+'\n'+EXACT_WORDS,speed:1});
  const original=speechProfile(caseId);
  if(!Object.hasOwn(DELIVERY,caseId))return original;
  // A bounded synthesis setting for this authored portrayal, not a diagnostic
  // threshold or a learner speech metric. Browser playback remains at 1.0.
  const speed=caseId==='sp_mania_redirect_001'?1.12:1;
  return Object.freeze({...original,speed,instructions:original.instructions+'\nHOSTED CONVERSATION DELIVERY: These more specific delivery directions take precedence over the general delivery style above.\n'+DELIVERY[caseId]+'\n'+EXACT_WORDS});
}

const MARCUS_TURN_STYLE=`
MARCUS CONVERSATIONAL CONTINUITY:
For this Marcus portrayal, pressure of speech concerns how a thought carries on as well as its pace. In an open invitation, allow a brief connected shift between ideas already established in his case. Link clauses with natural conjunctions and vary sentence length so the reply feels like a thought still moving forward. A tangent must carry exactly one true, currently permitted detail and remain connected to the learner's meaning. Do not force a tangent into every answer. Keep the connection understandable; do not recite unrelated symptoms, repeat yourself to fill time, or invent projects, room events, distractions, people, or history.
A clear, respectful request to focus or return to a topic can redirect Marcus. Acknowledge the redirect briefly when natural, answer the specific question first, and hold that topic for the reply while keeping the energetic phrasing. Do not turn every redirect into opposition or instantly become calm, cured, or fully agreeable. Distractibility and difficulty yielding the floor are aspects of this authored portrayal, not proof that every person with mania behaves alike.
Speech interruptions may be technical or intentional. Never infer hostility or poor performance from an interruption, a pause, accent, fluency, or the learner's speaking speed. Use only the dialogue confirmed heard in the supplied history. Keep the existing 2 to 6 rapid sentences and the 900-character maximum; verbatim required disclosures and all case facts, unknowns, and gates take precedence.
`;

// The shared conversation layer optimizes for short, neatly finished replies.
// Replace only these delivery directions for hosted Marcus; the canonical case,
// disclosure authority, and original local/recorded behavior are untouched.
const MARCUS_STYLE_REPLACEMENTS=Object.freeze([
  ['Prefer two or three short sentences for a focused answer; use longer replies when asked to elaborate.',
   'Let the current invitation and any specific redirect shape the length of the reply, within the canonical sentence and character limits.'],
  ['For a substantive answer, begin with one short complete sentence of about 6 to 12 words that answers the learner.',
   'Begin with a connected thought that follows the learner\'s meaning, using variable sentence length and natural conjunctions.'],
  ['Keep your speech brief enough to leave the learner space.',
   'Keep each reply within the existing limits while retaining Marcus\'s forward momentum; the learner can pause or interrupt at any time.'],
]);

export function refineActorContext(context,caseId){
  if(caseId!=='sp_mania_redirect_001')return context;
  let system=context.system;
  for(const [shared,portrayal] of MARCUS_STYLE_REPLACEMENTS)system=system.replace(shared,portrayal);
  return {...context,system:system+MARCUS_TURN_STYLE};
}
