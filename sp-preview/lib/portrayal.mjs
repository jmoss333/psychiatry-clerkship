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

export const isDeliveryIntensity=value=>['gentle','standard','expressive'].includes(value);

// Faculty choose how prominently the authored expression is performed, not an
// illness severity, a new symptom inventory, or the learner's speaking ability.
// Numeric speed and voice identity stay fixed across these bounded presets.
const INTENSITY=Object.freeze({
  sp_depression_gated_si_001:Object.freeze({
    gentle:'Dana remains reserved and tired. Use a small, natural range of emphasis and restrained emotional weight. Permit subtle tone changes if the supplied words express embarrassment, irritation, or dry humor; do not make every line sad. Keep the words clear and the phrasing connected; gentler expression does not imply relief, recovery, or agreement.',
    expressive:'Dana remains reserved and tired. Make the emotional weight of the actual words a little clearer through selective stress and brief, natural pauses. Allow a small change of tone when the dialogue itself expresses concern, relief, embarrassment, irritation, or dry humor; do not make every line sad. Stay understated; do not add despair, crying, breathiness, or an unresponsive monotone.'
  }),
  sp_mania_redirect_001:Object.freeze({
    gentle:'Marcus retains pressured forward momentum, urgency, and the authored difficulty settling between thoughts. Use less contrast in emphatic stress while keeping his connected, brisk cadence. A gentle performance does not make him suddenly calm, symptom-free, agreeable, or slower after a redirect.',
    expressive:'Make Marcus\'s existing urgency more audible through clearer variation in emphatic stress and pace within a connected thought, while keeping compressed clause pauses and every word intelligible. Keep the supplied thought connections understandable. A redirect can focus the topic without removing his pressure. Do not turn conviction into shouting, hostility, extra words, or a uniformly faster rhythm.'
  }),
  sp_psychosis_paranoid_001:Object.freeze({
    gentle:'Ray remains guarded and cautious. Use a smaller range of tension in the voice and subtle hesitations while remaining clearly audible. Gentler delivery does not mean trust, reassurance, or agreement that his words do not express.',
    expressive:'Make Ray\'s existing concern and cautious phrasing more audible through small changes in stress, tension, and hesitation only where his words support them. Let actual relief soften the voice without implying that his beliefs have resolved. Do not add suspicion, a sinister or threatening tone, shouting, or an exaggerated whisper.'
  }),
  sp_alcohol_ambivalence_001:Object.freeze({
    gentle:'Morgan retains mixed feelings and their own choices. Use understated changes in emphasis and brief reflective pauses while keeping an ordinary conversational voice. Gentler delivery must not turn ambivalence into agreement, gratitude, readiness, or a promise to change.',
    expressive:'Make Morgan\'s mixed feelings a little more audible: let the actual words about something valued, a concern, or a personal choice carry distinct emphasis. Keep both sides of ambivalence present when spoken. Do not add defensiveness, shame, distress, intoxication, slurring, or a decision that the words do not contain.'
  }),
  family_maya_001:Object.freeze({
    gentle:'Maya retains care and personal limits. Use understated warmth and steady emphasis for a boundary. Gentler delivery does not remove a limit or manufacture agreement with Morgan.',
    expressive:'Make the distinction between Maya\'s care, concern, and personal limits clearer through selective emphasis in the supplied words. A boundary can sound firmer while remaining caring. Do not manufacture anger, blame, tears, family conflict, or agreement.'
  })
});
const INTENSITY_BOUNDARY='This faculty preset changes vocal expression only, not illness severity, case facts, symptoms, disclosure permissions, or the meaning of the dialogue. Follow emotion present in the supplied words; do not invent it. Never infer learner competence or intent from speaking speed, accent, fluency, pauses, or interruptions.';

export function hostedSpeechProfile(caseId,deliveryIntensity='standard'){
  if(!isDeliveryIntensity(deliveryIntensity))throw new Error('Unsupported voice intensity.');
  const moment=getMoment(caseId);
  if(moment){
    if(deliveryIntensity!=='standard')throw new Error('Voice intensity is not available for this moment.');
    return Object.freeze({...moment.speechProfile,instructions:moment.speechProfile.instructions+'\n'+EXACT_WORDS,speed:1});
  }
  const original=speechProfile(caseId);
  // A bounded synthesis setting for this authored portrayal, not a diagnostic
  // threshold or a learner speech metric. Browser playback remains at 1.0.
  const speed=caseId==='sp_mania_redirect_001'?1.12:1;
  const standard=Object.hasOwn(DELIVERY,caseId)?Object.freeze({...original,speed,instructions:original.instructions+'\nHOSTED CONVERSATION DELIVERY: These more specific delivery directions take precedence over the general delivery style above.\n'+DELIVERY[caseId]+'\n'+EXACT_WORDS}):original;
  if(deliveryIntensity==='standard')return standard;
  if(!Object.hasOwn(INTENSITY,caseId))throw new Error('Voice intensity is not available for this case.');
  return Object.freeze({...standard,instructions:standard.instructions+'\nFACULTY VOCAL EXPRESSION — '+deliveryIntensity.toUpperCase()+':\n'+INTENSITY[caseId][deliveryIntensity]+'\n'+INTENSITY_BOUNDARY+'\n'+EXACT_WORDS});
}

const MARCUS_TURN_STYLE=`
MARCUS CONVERSATIONAL CONTINUITY:
For this Marcus portrayal, pressure of speech concerns how a thought carries on as well as its pace. In an open invitation, allow a brief connected shift between ideas already established in his case. Link clauses with natural conjunctions and vary sentence length so the reply feels like a thought still moving forward. A tangent must carry exactly one true, currently permitted detail and remain connected to the learner's meaning. Do not force a tangent into every answer. Keep the connection understandable; do not recite unrelated symptoms, repeat yourself to fill time, or invent projects, room events, distractions, people, or history.
Select relevant known details for the current invitation rather than automatically enumerating the whole inventory. A substantive connected burst is welcome when the question calls for it; this is not a new brevity rule or a demand to stay on one clinical topic.
Do not invent routines, scenes, or other people's reactions merely to connect known details. A reported reaction must be supported by an authoritative case fact. You may acknowledge what the learner actually said in heard dialogue, keeping it attributed to that learner; prior generated patient replies do not establish new facts or other people's past reactions. Preserve who actually said or experienced an established event. Natural colloquial phrasing can express Marcus's conviction without inventing a supporting story.
For an unknown sleep mechanism, express ordinary uncertainty without inventing an explanation. The question can be clear even when the answer is not known. If useful, distinguish that uncertainty from the known short sleep and lack of tiredness, without choosing an unsupported cause or forcing a stock response.
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
