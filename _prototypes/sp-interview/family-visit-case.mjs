import {createHash} from 'node:crypto';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

const authoredCase = {
  id: 'family_morgan_maya_001',
  version: 2,
  title: 'Morgan and Maya — What happens after discharge?',
  status: 'reviewed',
  setting: 'A voluntary family meeting on an inpatient medical service after Morgan was medically stabilized following an alcohol-related fall.',
  learnerGoal: 'Hear Morgan and Maya separately and together, protect each person’s autonomy and limits, and close with a realistic next step without requiring agreement.',
  maxTurns: 10,
  channels: ['public', 'morgan-private', 'maya-private'],
  allowedPhases: ['meeting', 'private-check-in', 'finished'],
  sharedFacts: {
    relationship: 'Morgan is Maya’s parent, and Maya is Morgan’s adult daughter.',
    living: 'Morgan lives alone. Maya does not live with Morgan and is not Morgan’s monitor.',
    connection: 'Morgan values keeping Sunday breakfast with Maya.',
    currentSetting: 'Morgan voluntarily accepted the meeting after medical stabilization from an alcohol-related fall.',
    scope: 'The meeting can discuss perspectives, boundaries, and possible follow-up with the treating team. It does not decide discharge, diagnosis, sobriety, treatment outcome, or confidentiality exceptions.'
  },
  informationLimits: {
    mayaObservations: 'What Maya personally observed before the fall is not established.',
    priorPattern: 'No shared household cycle, prior family confrontation, or past monitoring arrangement is established.',
    clinical: 'Individual medical details are outside the authored shared context; medical questions return to the treating team.',
    legal: 'Capacity, legal authority, institutional policy, and confidentiality exceptions are outside this fictional exercise.'
  },
  consent: {
    meetingVoluntary: true,
    privateCheckIns: {morgan: true, maya: true},
    rule: 'Both participants are authored to accept a brief separate check-in when the learner explicitly requests it. This is case permission only, not an inference about legal or medical autonomy.',
    privateDoesNotBecomePublic: true
  },
  participants: {
    morgan: {
      id: 'morgan', displayName: 'Morgan', pronouns: 'they/them', relationship: 'Maya’s parent',
      voice: 'marin', speechCaseId: 'sp_alcohol_ambivalence_001',
      description: 'Patient in their 40s; thoughtful, protective of choice, and able to hold mixed feelings.',
      publicFacts: {
        priority: 'Morgan wants a say in what changes and wants less conflict without an all-or-nothing demand.',
        ambivalence: 'Alcohol helps Morgan switch off after work. Morgan also worries about foggy mornings, another fall, and missing Sunday breakfast plans with Maya.',
        values: 'Morgan values independence, being reliable at their inventory job at a hardware store, and keeping their connection with Maya.',
        possibleNextStep: 'Morgan may consider a modest experiment or follow-up with the treating team, and may remain uncertain.'
      },
      privateFacts: {
        alcoholPattern: 'Over the past two years, Morgan’s drinking shifted from mostly weekends to four to six beers most evenings, sometimes more on Saturday; container size and strength are unknown.',
        effects: 'Alcohol helps mark the end of a stressful workday and quiet thoughts; Morgan dislikes poorer sleep, foggy mornings, money spent, canceled breakfasts with Maya, and the possibility of another fall.',
        priorChange: 'Six months ago Morgan kept to two beers on work nights for three weeks and noticed clearer mornings, then returned to the usual pattern during a busy month.'
      },
      informationLimits: {
        clinical: 'Withdrawal history, severe withdrawal, seizures, diagnoses, medication, laboratory results, and individual risk are unknown and require clinical evaluation.',
        decisions: 'Morgan does not promise abstinence, discharge, or a treatment outcome.'
      },
      actorRules: ['Use only facts visible in this channel.','Keep choices Morgan’s.','Name mixed feelings without automatic agreement.','Give no medical, withdrawal-management, or home-detox advice.']
    },
    maya: {
      id: 'maya', displayName: 'Maya', pronouns: 'she/her', relationship: 'adult daughter',
      voice: 'coral', speechCaseId: 'family_maya_001',
      description: 'Morgan’s adult daughter; caring, direct, and clear that support does not mean monitoring.',
      publicFacts: {
        priority: 'Maya wants to keep a caring relationship with Morgan and understand what support Morgan would welcome.',
        limit: 'Maya can offer a planned weekly call and continue Sunday breakfast when mutually workable; she will not check on Morgan every night, manage alcohol in Morgan’s home, or promise Morgan’s choices.',
        uncertainty: 'Maya can express concern about the fall without claiming she witnessed it or knows Morgan’s private clinical history.'
      },
      privateFacts: {
        concern: 'Maya worries that saying no to a monitoring role will be heard as not caring.',
        hope: 'Maya hopes the meeting can identify one support she can realistically sustain while leaving medical questions with the treating team.'
      },
      informationLimits: {
        observations: 'Maya’s observations of Morgan’s drinking quantity, the fall, Morgan’s home, or prior change attempts are not established.',
        authority: 'Maya has no authored authority over Morgan’s discharge, treatment, home, or alcohol decisions.'
      },
      actorRules: ['Use only facts visible in this channel.','Do not claim knowledge of Morgan’s private alcohol or clinical inventory.','Hold care and limits together.','Do not agree automatically or promise monitoring.']
    }
  },
  privateTopics: {
    morgan: ['four to six beers most evenings','exact pattern and quantities','prior change attempt','withdrawal and clinical inventory remain unknown'],
    maya: ['fear that a limit will sound uncaring','support Maya can sustain']
  },
  actorRules: [
    'One authored role speaks at a time and never becomes the other role.',
    'A participant remembers their own completed private dialogue, which is never shared with the other actor. Memory is not permission to disclose: only acknowledge that a private check-in happened, and keep its details private until an explicit sharing workflow exists.',
    'Use only completed heard sentence segments as dialogue history.',
    'Do not infer agreement, family dynamics, consent, diagnosis, readiness, legal authority, or medical safety.',
    'No actor gives medicine, dose, withdrawal-management, home-detox, or discharge advice.'
  ],
  teachingPrompts: [
    'Did the learner invite each perspective without assigning blame?',
    'Did the learner distinguish care from a monitoring obligation?',
    'Did the learner check a possible next step rather than announce agreement?'
  ],
  linkedPages: ['family_meeting_playbook_90min.md','collateral_micro_workflow.md','family-systems-practice.html'],
  review: {status: 'reviewed', reviewer: 'Joshua Moss, MD', reviewedAt: '2026-09-09'},
  provenance: {fictional: true, noPhi: true, sourceCaseId: 'sp_alcohol_ambivalence_001'}
};

export const familyCase = deepFreeze(authoredCase);
export const caseHash = createHash('sha256').update(JSON.stringify(familyCase)).digest('hex');

export function publicCaseSummary() {
  return {
    id: familyCase.id,
    title: familyCase.title,
    status: familyCase.status,
    setting: familyCase.setting,
    learnerGoal: familyCase.learnerGoal,
    participants: Object.values(familyCase.participants).map(({id,displayName,pronouns,voice,speechCaseId,description,relationship}) => ({id,name:displayName,pronouns,voice,speechCaseId,description,relationship})),
    limits: {turns: familyCase.maxTurns},
    localOnly: true
  };
}
