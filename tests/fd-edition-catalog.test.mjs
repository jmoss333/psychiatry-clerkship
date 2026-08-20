import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const SOURCE = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_catalog.js', import.meta.url);
const SHARED_PRESET_PLANS = JSON.parse(readFileSync(
  new URL('fixtures/rotation-edition-catalog/valid-local-preset-plans.json', import.meta.url), 'utf8',
));
const API = ['fdEditionCatalogSnapshot', 'fdEditionCatalogRecord', 'fdEditionCatalogResolve', 'fdEditionCatalogSiteSnapshot', 'fdEditionPublicationEnabled'];
const CORE_REVISION = '1234567890abcdef1234567890abcdef12345678';
const CURRENT_CORE_REVISION = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const LOCATION = 'location.example@v1';
const OTHER_LOCATION = 'location.other@v1';
const PHRASES = 'phrases.example@v1';
const CURATOR = 'profile.example@v1';
const BLOCKED = 'choice.blocked@v1';
const DEPRECATED = 'choice.deprecated-reason@v1';
const AUDIENCES = ['ms3', 'resident'];
const RAW_VISIBLE_KEY = 'choice.raw-visible@v9';
const PURPOSE_CODES = [
  'arrival-map', 'orientation', 'access-training', 'documentation-policy', 'attendance-policy',
  'feedback-policy', 'directory', 'parking-transit', 'official-clinical-policy', 'reviewed-operational',
];

const TOKENS = Object.freeze({
  arrival: ['timing', 'time', 'place', 'role'],
  scheduleWindow: ['dayStart', 'dayEnd', 'endQualifier'],
  scheduleRangeWithPlace: ['daySet', 'startTime', 'endTime', 'activity', 'place', 'priority'],
  scheduleRangeWithoutPlace: ['daySet', 'startTime', 'endTime', 'activity', 'priority'],
  schedulePointWithPlace: ['daySet', 'startTime', 'activity', 'place', 'priority'],
  schedulePointWithoutPlace: ['daySet', 'startTime', 'activity', 'priority'],
  rounds: ['preparation', 'participation', 'followUp'],
  presentation: ['format', 'timing', 'elements'],
  documentation: ['workflow', 'timing'],
  attendance: ['events', 'absenceRole'],
  feedback: ['cadence', 'initiator', 'setting'],
  access: ['item', 'due'],
  contact: ['role'],
  checklist: ['item', 'priority'],
  resourceWithReason: ['title', 'priority', 'week', 'reason', 'hostname'],
  resourceWithoutReason: ['title', 'priority', 'week', 'hostname'],
  changeSummary: ['kinds', 'count'],
});

const TEMPLATE_TEXT = Object.freeze({
  arrival: 'On the first day, arrive {timing} {time} and meet at {place}. Check in with {role}.',
  scheduleWindow: 'A typical day runs from {dayStart} until {endQualifier} {dayEnd}.',
  scheduleRangeWithPlace: 'On {daySet}, {activity} runs from {startTime} to {endTime} at {place} ({priority}).',
  scheduleRangeWithoutPlace: 'On {daySet}, {activity} runs from {startTime} to {endTime} ({priority}).',
  schedulePointWithPlace: 'On {daySet}, {activity} starts at {startTime} at {place} ({priority}).',
  schedulePointWithoutPlace: 'On {daySet}, {activity} starts at {startTime} ({priority}).',
  rounds: 'Before rounds, {preparation}. During rounds, {participation}. After rounds, {followUp}.',
  presentation: 'Use {format} {timing} and include {elements}.',
  documentation: '{workflow}; {timing}.',
  attendance: 'Attend {events}. Report absences to {absenceRole}.',
  feedback: 'Feedback occurs {cadence}; {initiator} in {setting}.',
  access: '{item} {due}.',
  contact: 'Contact {role}.',
  checklist: '{item} ({priority}).',
  resourceWithReason: '{title} is {priority} in week {week} because {reason}; destination {hostname}.',
  resourceWithoutReason: '{title} is {priority} in week {week}; destination {hostname}.',
  changeSummary: '{kinds}; {count} changed items.',
});

const CHOICE_DATA = Object.freeze({
  reason: ['Preparation reason', 'prepare for supervised practice'],
  activity: ['Team rounds', 'team rounds'],
  role: ['Clerkship coordinator', 'the clerkship coordinator'],
  checklist: ['Bring identification', 'Bring institutional identification'],
  daySet: ['Weekdays', 'Monday through Friday'],
  roundsPreparation: ['Review assignments', 'review your assigned patients'],
  roundsParticipation: ['Present assignments', 'present assigned patients with supervision'],
  roundsFollowUp: ['Complete follow-up', 'complete follow-up tasks with supervision'],
  presentationFormat: ['Problem representation', 'a concise problem representation'],
  presentationTiming: ['During rounds', 'during team rounds'],
  presentationElement: ['Assessment', 'assessment and plan'],
  documentationWorkflow: ['Approved record', 'Use the approved institutional record for supervisor review'],
  documentationTiming: ['Supervisor timing', 'Complete entries only when the supervisor directs'],
  feedbackCadence: ['Weekly', 'weekly'],
  feedbackInitiator: ['Learner initiates', 'the learner requests it'],
  feedbackSetting: ['Private setting', 'a private supervised setting'],
  accessItem: ['Complete access setup', 'Complete approved access setup'],
  duePoint: ['Before arrival', 'before the first day'],
});

function load(expectedRevision) {
  const source = readFileSync(SOURCE, 'utf8').replace('__FD_CATALOG_EXPECTED_REVISION__', expectedRevision);
  assert.equal(source.includes('__FD_CATALOG_EXPECTED_REVISION__'), false, 'test must install the trusted build revision');
  return new Function(`${source}\nreturn {${API.join(',')}};`)();
}

function loadWithoutBrowserOrClockGlobals(expectedRevision) {
  const source = readFileSync(SOURCE, 'utf8').replace('__FD_CATALOG_EXPECTED_REVISION__', expectedRevision);
  return new Function(
    'document', 'window', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest',
    'Date', 'Intl', 'URL', 'TextEncoder', 'btoa',
    `${source}\nreturn {${API.join(',')}};`,
  )(undefined, undefined, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined);
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function stringValues(value) {
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringValues);
  return typeof value === 'string' ? [value] : [];
}

async function digest(value) {
  const result = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return `sha256-${Buffer.from(result).toString('base64url')}`;
}

async function digestedRecord(value) {
  return { ...value, contentDigest: await digest(value) };
}

function templates() {
  return Object.fromEntries(Object.entries(TOKENS).map(([name, tokens]) => [
    name,
    { text: TEMPLATE_TEXT[name], tokens: [...tokens] },
  ]));
}

function choiceKey(kind) {
  return `choice.${kind.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}@v1`;
}

function fullLocalPlan() {
  return {
    arrival: {
      timingCode: 'by', time: '07:45', placeKey: 'place.workroom@v1',
      checkInRoleKey: choiceKey('role'), linkKey: 'link.arrival@v1',
    },
    schedule: {
      dayStart: '07:45', dayEnd: '17:00', endQualifierCode: 'about',
      events: [
        {
          instanceId: 'local:schedule:1', daySetKey: choiceKey('daySet'), startTime: '08:30',
          endTime: '09:30', activityKey: choiceKey('activity'), placeKey: 'place.workroom@v1',
          priority: 'required',
        },
        {
          instanceId: 'local:schedule:2', daySetKey: choiceKey('daySet'), startTime: '13:00',
          activityKey: choiceKey('activity'), priority: 'optional',
        },
      ],
    },
    rounds: {
      preparationKey: choiceKey('roundsPreparation'),
      participationKey: choiceKey('roundsParticipation'),
      followUpKey: choiceKey('roundsFollowUp'),
    },
    presentation: {
      formatKey: choiceKey('presentationFormat'), timingKey: choiceKey('presentationTiming'),
      elementKeys: [choiceKey('presentationElement'), 'choice.presentation-element-two@v1'],
    },
    documentation: {
      workflowKey: choiceKey('documentationWorkflow'), timingKey: choiceKey('documentationTiming'),
      policyLinkKey: 'link.documentation@v1',
    },
    attendance: {
      eventInstanceIds: ['local:schedule:1', 'local:schedule:2'],
      absenceRoleKey: choiceKey('role'), policyLinkKey: 'link.attendance@v1',
    },
    feedback: {
      cadenceKey: choiceKey('feedbackCadence'), initiatorKey: choiceKey('feedbackInitiator'),
      settingKey: choiceKey('feedbackSetting'),
    },
    accessItems: [{
      instanceId: 'local:access:1', itemKey: choiceKey('accessItem'), dueKey: choiceKey('duePoint'),
      linkKey: 'link.access@v1',
    }],
    contacts: [{ instanceId: 'local:contact:1', roleKey: choiceKey('role'), linkKey: 'link.directory@v1' }],
    checklistItems: [{ instanceId: 'local:checklist:1', itemKey: choiceKey('checklist'), priority: 'recommended' }],
    resources: [
      {
        instanceId: 'local:resource:1', linkKey: 'link.orientation@v1', priority: 'recommended',
        week: 1, reasonKey: choiceKey('reason'),
      },
      { instanceId: 'local:resource:2', linkKey: 'link.orientation@v1', priority: 'optional', week: 2 },
    ],
  };
}

function config(audience = 'ms3', localPlan = fullLocalPlan()) {
  return {
    audience,
    pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week',
    editionNumber: 1,
    createdAgainstCoreRevision: CORE_REVISION,
    createdAgainstLocalCatalogRevision: `sha256-${'A'.repeat(43)}`,
    context: {
      trainingLocationKey: LOCATION,
      curatorProfileKey: CURATOR,
      rotationStart: '2026-09-01',
      rotationEnd: audience === 'ms3' ? '2026-10-12' : '2026-09-28',
      editionCheckedOn: '2026-08-19',
    },
    phraseSetKey: PHRASES,
    pathItems: [
      {
        instanceId: 'core:library/example:1', ref: 'library/example', week: 1, order: 1,
        priority: 'required', reasonKey: choiceKey('reason'),
      },
      {
        instanceId: 'core:library/second:1', ref: 'library/second', week: 2, order: 1,
        priority: 'optional',
      },
    ],
    localPlan,
    changeSummary: { kindCodes: ['initial'], changedItemCount: 0 },
  };
}

async function projection(audience = 'ms3', gate = 'enabled') {
  const common = { audiences: [audience], verifiedOn: '2026-08-19' };
  const scoped = { locationKeys: [LOCATION], ...common };
  const records = [
    {
      key: LOCATION, kind: 'trainingLocation', displayName: 'Example Training Unit', locationCode: 'EXU',
      locationTypeCode: 'inpatient', officialHostnames: ['example.edu'], ...common,
    },
    {
      key: OTHER_LOCATION, kind: 'trainingLocation', displayName: 'Other Training Unit', locationCode: 'OTU',
      locationTypeCode: 'outpatient', officialHostnames: ['other.example.edu'], ...common,
    },
    { key: 'place.workroom@v1', kind: 'place', displayName: 'the unit workroom', ...scoped },
    { key: CURATOR, kind: 'curatorProfile', displayName: 'Example Curator', roleKey: choiceKey('role'), ...scoped },
    { key: PHRASES, kind: 'phraseSet', displayName: 'Example reviewed wording', templates: templates(), ...scoped },
    {
      key: 'preset.complete@v1', kind: 'localPreset', displayName: 'Complete example preset',
      localPlan: fullLocalPlan(), phraseSetKey: PHRASES, ...scoped,
    },
    {
      key: 'preset.python-parity@v1', kind: 'localPreset', displayName: 'Python parity preset',
      localPlan: structuredClone(SHARED_PRESET_PLANS[audience]), phraseSetKey: PHRASES, ...scoped,
    },
    {
      key: 'choice.other-role@v1', kind: 'choice', choiceKind: 'role', label: 'Other role',
      fragment: 'the other-location coordinator', locationKeys: [OTHER_LOCATION], ...common,
    },
    {
      key: DEPRECATED, kind: 'choice', choiceKind: 'reason', label: 'Prior reason',
      fragment: 'use the prior reviewed preparation', ...scoped,
    },
    {
      key: 'choice.presentation-element-two@v1', kind: 'choice', choiceKind: 'presentationElement',
      label: 'Next steps', fragment: 'supervised next steps', ...scoped,
    },
  ];
  for (const [choiceKind, [label, fragment]] of Object.entries(CHOICE_DATA)) {
    records.push({ key: choiceKey(choiceKind), kind: 'choice', choiceKind, label, fragment, ...scoped });
  }
  for (const [name, purposeCode, title, path] of [
    ['arrival', 'arrival-map', 'Arrival map', '/arrival'],
    ['documentation', 'documentation-policy', 'Documentation policy', '/documentation'],
    ['attendance', 'attendance-policy', 'Attendance policy', '/attendance'],
    ['access', 'access-training', 'Access training', '/access'],
    ['directory', 'directory', 'Institutional directory', '/directory'],
    ['orientation', 'orientation', 'Official orientation', '/orientation'],
  ]) {
    records.push({
      key: `link.${name}@v1`, kind: 'officialLink', title,
      url: `https://example.edu${path}`, visibleHostname: 'example.edu', purposeCode, ...scoped,
    });
  }
  const resolutionRecords = await Promise.all(records.map(digestedRecord));
  resolutionRecords.sort((left, right) => left.key.localeCompare(right.key));
  const value = {
    schemaVersion: 1,
    audience,
    revision: await digest({ catalog: 'synthetic-catalog', governance: 'synthetic-governance', audience }),
    projectionDigest: '',
    rotationEditionV2: gate,
    selectionKeys: resolutionRecords.filter((item) => item.key !== DEPRECATED).map((item) => item.key),
    resolutionRecords,
    blockedKeys: [BLOCKED],
  };
  value.projectionDigest = await digest(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'projectionDigest')));
  return value;
}

async function refreshProjection(value, { records = true } = {}) {
  if (records) {
    for (const item of value.resolutionRecords) {
      const bare = structuredClone(item);
      delete bare.contentDigest;
      item.contentDigest = await digest(bare);
    }
  }
  const bare = structuredClone(value);
  delete bare.projectionDigest;
  value.projectionDigest = await digest(bare);
  return value;
}

function siteContext(snapshot, overrides = {}) {
  return {
    audience: snapshot.audience,
    localCatalogRevision: snapshot.revision,
    rotationEditionV2: snapshot.rotationEditionV2,
    coreRevision: CURRENT_CORE_REVISION,
    ...overrides,
  };
}

async function preparedFixture(audience = 'ms3', gate = 'enabled') {
  const input = await projection(audience, gate);
  const F = load(input.revision);
  const prepared = await F.fdEditionCatalogSnapshot(input, audience, webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  return { F, input, prepared };
}

async function resolveFixture(audience = 'ms3', value = config(audience), mode = 'learner', contextOverrides = {}) {
  const fixture = await preparedFixture(audience);
  const result = await fixture.F.fdEditionCatalogResolve(
    value, fixture.prepared.snapshot, mode,
    siteContext(fixture.prepared.snapshot, contextOverrides), webcrypto.subtle,
  );
  return { ...fixture, value, result };
}

function recursivelyFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => recursivelyFrozen(value[key], seen));
}

function assertFailure(result, secret = '') {
  assert.equal(result.ok, false);
  assert.equal(result.snapshot ?? result.resolved ?? null, null);
  if ('displayModel' in result) assert.equal(result.displayModel, null);
  if ('referenceSetDigest' in result) assert.equal(result.referenceSetDigest, '');
  if (secret) assert.equal(JSON.stringify(result.errors).includes(secret), false);
}

function testForAudiences(name, body) {
  for (const audience of AUDIENCES) {
    test(`${name} [${audience}]`, () => body(audience));
  }
}

function recordByKey(value, key) {
  const found = value.resolutionRecords.find((record) => record.key === key);
  assert.ok(found, `fixture record ${key}`);
  return found;
}

function assertExactDisplayShapes(model) {
  assert.deepEqual(Object.keys(model).sort(), [
    'attendanceFeedback', 'authority', 'card', 'changeSummary', 'emptyLocalPlan', 'firstDay',
    'pathItems', 'resources', 'revisions', 'typicalDay', 'workflow',
  ].sort());
  assert.deepEqual(Object.keys(model.card).sort(), [
    'audienceLabel', 'curatorName', 'curatorRole', 'durationLabel', 'editionCheckedOn',
    'editionCheckedOnLabel', 'editionNumber', 'fingerprint', 'fingerprintNotice', 'fingerprintPrefix',
    'identityNotice', 'locationCode', 'locationName', 'locationTypeLabel', 'provenance',
    'rotationDates', 'title',
  ].sort());
  assert.deepEqual(Object.keys(model.revisions).sort(), [
    'catalogMatches', 'coreMatches', 'createdAgainstCatalogRevision', 'createdAgainstCoreRevision',
    'currentCatalogRevision', 'currentCoreRevision',
  ].sort());
  assert.deepEqual(Object.keys(model.firstDay).sort(), ['accessItems', 'arrival', 'checklistItems', 'contacts']);
  assert.deepEqual(Object.keys(model.workflow).sort(), ['documentation', 'presentation', 'rounds']);
  assert.deepEqual(Object.keys(model.attendanceFeedback).sort(), ['attendance', 'feedback']);
  assert.deepEqual(Object.keys(model.authority).sort(), [
    'coreLabel', 'documentationGuardrail', 'localBoundary', 'localLabel', 'optionalLabel',
    'recommendedLabel', 'requiredLabel', 'resourceLabel',
  ].sort());
  assert.deepEqual(Object.keys(model.changeSummary).sort(), ['changedItemCount', 'kindCodes', 'provenanceLabel', 'text']);
  for (const item of model.card.provenance) assert.deepEqual(Object.keys(item).sort(), ['displayLabel', 'recordKind', 'verifiedOn']);
  for (const [index, item] of model.pathItems.entries()) {
    assert.deepEqual(Object.keys(item).sort(), (index === 0
      ? ['instanceId', 'order', 'priority', 'priorityLabel', 'reasonText', 'ref', 'week']
      : ['instanceId', 'order', 'priority', 'priorityLabel', 'ref', 'week']).sort());
  }
  assert.deepEqual(Object.keys(model.firstDay.arrival).sort(), ['link', 'text']);
  assert.deepEqual(Object.keys(model.firstDay.arrival.link).sort(), ['purposeCode', 'title', 'url', 'visibleHostname']);
  for (const item of model.firstDay.accessItems) {
    assert.deepEqual(Object.keys(item).sort(), ['checklistId', 'id', 'link', 'text']);
    assert.deepEqual(Object.keys(item.link).sort(), ['purposeCode', 'title', 'url', 'visibleHostname']);
  }
  for (const item of model.firstDay.contacts) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'link', 'text']);
    assert.deepEqual(Object.keys(item.link).sort(), ['purposeCode', 'title', 'url', 'visibleHostname']);
  }
  for (const item of model.firstDay.checklistItems) assert.deepEqual(Object.keys(item).sort(), ['id', 'priority', 'priorityLabel', 'sourceCode', 'text']);
  assert.deepEqual(Object.keys(model.typicalDay).sort(), ['eventItems', 'summaryText']);
  for (const item of model.typicalDay.eventItems) assert.deepEqual(Object.keys(item).sort(), ['id', 'priority', 'priorityLabel', 'text']);
  assert.deepEqual(Object.keys(model.workflow.rounds), ['text']);
  assert.deepEqual(Object.keys(model.workflow.presentation), ['text']);
  assert.deepEqual(Object.keys(model.workflow.documentation).sort(), ['guardrailText', 'link', 'text']);
  assert.deepEqual(Object.keys(model.attendanceFeedback.attendance).sort(), ['link', 'text']);
  assert.deepEqual(Object.keys(model.attendanceFeedback.feedback), ['text']);
  for (const [index, item] of model.resources.entries()) {
    assert.deepEqual(Object.keys(item).sort(), (index === 0
      ? ['authorityLabel', 'id', 'priority', 'priorityLabel', 'purposeCode', 'reasonText', 'text', 'title', 'url', 'visibleHostname', 'week']
      : ['authorityLabel', 'id', 'priority', 'priorityLabel', 'purposeCode', 'text', 'title', 'url', 'visibleHostname', 'week']).sort());
  }
}

test('valid complete MS3 and resident inputs produce exact closed labels, copy, provenance, and immutable fresh results', async () => {
  for (const [audience, audienceLabel, durationLabel, dateRange] of [
    ['ms3', 'MS3', '6 weeks', 'September 1 – October 12, 2026'],
    ['resident', 'Resident', '4 weeks', 'September 1 – September 28, 2026'],
  ]) {
    const value = config(audience);
    const before = structuredClone(value);
    const { F, input, prepared, result } = await resolveFixture(audience, value);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(value, before);
    assert.equal(Object.isFrozen(value), false);
    assert.equal(Object.isFrozen(input), false);
    assert.equal(recursivelyFrozen(prepared.snapshot), true);
    assert.equal(recursivelyFrozen(result.displayModel), true);
    assert.equal(recursivelyFrozen(result.resolved), true);
    assertExactDisplayShapes(result.displayModel);

    const model = result.displayModel;
    assert.equal(model.card.title, `EXU ${audienceLabel} psychiatry rotation`);
    assert.equal(model.card.audienceLabel, audienceLabel);
    assert.equal(model.card.durationLabel, durationLabel);
    assert.equal(`${model.card.audienceLabel} · ${model.card.durationLabel}`, `${audienceLabel} · ${durationLabel}`);
    assert.equal(model.card.rotationDates, dateRange);
    assert.equal(model.card.editionCheckedOn, 'August 19, 2026');
    assert.equal(model.card.editionCheckedOnLabel, 'Self-attested');
    assert.equal(model.card.locationTypeLabel, 'Inpatient');
    assert.equal(model.card.fingerprint, '');
    assert.equal(model.card.fingerprintPrefix, `EXU-${audience === 'ms3' ? 'MS3' : 'RES'}-`);
    assert.equal(model.firstDay.arrival.text, 'On the first day, arrive by 7:45 AM and meet at the unit workroom. Check in with the clerkship coordinator.');
    assert.equal(model.typicalDay.summaryText, 'A typical day runs from 7:45 AM until about 5:00 PM.');
    assert.equal(model.typicalDay.eventItems[0].text, 'On Monday through Friday, team rounds runs from 8:30 AM to 9:30 AM at the unit workroom (Required).');
    assert.equal(model.typicalDay.eventItems[1].text, 'On Monday through Friday, team rounds starts at 1:00 PM (Optional).');
    assert.equal(model.workflow.documentation.guardrailText, model.authority.documentationGuardrail);
    assert.equal(model.resources[0].authorityLabel, model.authority.resourceLabel);
    assert.equal(model.changeSummary.text, 'Initial edition; 0 changed items.');
    assert.equal(model.pathItems[0].reasonText, 'prepare for supervised practice');
    assert.equal(Object.hasOwn(model.pathItems[1], 'reasonText'), false);
    assert.equal(Object.hasOwn(model.resources[1], 'reasonText'), false);
    assert.equal(model.emptyLocalPlan, false);
    assert.deepEqual(model.authority, {
      coreLabel: 'Reviewed clerkship Library',
      localLabel: 'Local rotation guidance',
      requiredLabel: 'Required by this local rotation',
      recommendedLabel: 'Recommended by this local rotation',
      optionalLabel: 'Optional for this local rotation',
      resourceLabel: 'Locally curated official resource',
      localBoundary: 'Local rotation guidance does not replace current institutional policy or supervision.',
      documentationGuardrail: 'Use only the approved institutional record. Do not place patient information in this site. Complete documentation only with supervisor guidance and review.',
    });
    assert.equal(model.card.identityNotice, 'Curator identity and institutional endorsement are not digitally verified by this link.');
    assert.equal(model.card.fingerprintNotice, 'Compare this fingerprint with the curator. Matching codes confirm the same edition content, not identity or institutional approval.');
    assert.equal(model.changeSummary.provenanceLabel, 'Locally supplied edition summary; change lineage is not authenticated.');
    assert.deepEqual(model.card.provenance.slice(0, 3).map((row) => row.recordKind), ['trainingLocation', 'curatorProfile', 'phraseSet']);
    const officialProvenance = model.card.provenance.filter((row) => row.recordKind === 'officialLink');
    assert.equal(new Set(officialProvenance.map((row) => row.displayLabel)).size, officialProvenance.length);
    assert.equal(officialProvenance.length, 6);
    assert.equal(model.attendanceFeedback.attendance.text.includes('local:schedule:'), false);
    assert.equal(JSON.stringify(model).includes('@v1'), false, 'learner-visible model must not contain catalog keys');
    assert.equal(stringValues(model).some((text) => /[{}]/.test(text)), false, 'all template placeholders must be resolved');
    assert.deepEqual(Object.keys(result.resolved).sort(), ['config', 'curator', 'location', 'phraseSet']);
    assert.notStrictEqual(result.resolved.location, prepared.snapshot.resolutionRecords.find((row) => row.key === LOCATION));

    const second = await F.fdEditionCatalogResolve(value, prepared.snapshot, 'learner', siteContext(prepared.snapshot), webcrypto.subtle);
    assert.equal(second.ok, true);
    assert.notStrictEqual(second.displayModel, result.displayModel);
    assert.notStrictEqual(second.resolved, result.resolved);
    assert.equal(second.referenceSetDigest, result.referenceSetDigest);
  }

  for (const audience of AUDIENCES) {
    const crossYearValue = config(audience);
    crossYearValue.context.rotationStart = '2026-12-31';
    crossYearValue.context.rotationEnd = '2027-01-02';
    crossYearValue.localPlan.arrival.time = '00:00';
    crossYearValue.localPlan.schedule.dayStart = '00:00';
    crossYearValue.localPlan.schedule.dayEnd = '12:00';
    const crossYear = await resolveFixture(audience, crossYearValue);
    assert.equal(crossYear.result.ok, true, JSON.stringify(crossYear.result.errors));
    assert.equal(crossYear.result.displayModel.card.rotationDates, 'December 31, 2026 – January 2, 2027');
    assert.match(crossYear.result.displayModel.firstDay.arrival.text, /12:00 AM/);
    assert.equal(crossYear.result.displayModel.typicalDay.summaryText, 'A typical day runs from 12:00 AM until about 12:00 PM.');
  }
});

testForAudiences('catalog site context returns one closure-owned frozen snapshot without ordinary Proxy reads', async (audience) => {
  const fixture = await preparedFixture(audience);
  const pathId = audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week';
  const input = { audience, pathId, coreRevision: CURRENT_CORE_REVISION, localCatalogRevision: fixture.prepared.snapshot.revision, rotationEditionV2: 'enabled' };
  const trusted = fixture.F.fdEditionCatalogSiteSnapshot(fixture.prepared.snapshot, input);
  assert.deepEqual(trusted, input);
  assert.notEqual(trusted, input);
  assert.equal(recursivelyFrozen(trusted), true);

  let ordinaryGets = 0;
  let ownKeysCalls = 0;
  let descriptorCalls = 0;
  let prototypeCalls = 0;
  const stateful = new Proxy(input, {
    ownKeys(target) {
      ownKeysCalls += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      descriptorCalls += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    getPrototypeOf(target) {
      prototypeCalls += 1;
      return Reflect.getPrototypeOf(target);
    },
    get(target, key, receiver) {
      ordinaryGets += 1;
      if (key === 'audience') return audience === 'ms3' ? 'resident' : 'ms3';
      if (key === 'pathId') return audience === 'ms3' ? 'resident-four-week' : 'ms3-six-week';
      return Reflect.get(target, key, receiver);
    },
  });
  assert.deepEqual(fixture.F.fdEditionCatalogSiteSnapshot(fixture.prepared.snapshot, stateful), input);
  assert.equal(ordinaryGets, 0);
  assert.equal(ownKeysCalls, 1, 'site context is captured from exactly one descriptor snapshot');
  assert.equal(descriptorCalls, 5, 'each of the exact five fields is described once');
  assert.equal(prototypeCalls, 1, 'the site context prototype is inspected once');

  const disabledFixture = await preparedFixture(audience, 'disabled');
  const disabledInput = { ...input, localCatalogRevision: disabledFixture.prepared.snapshot.revision, rotationEditionV2: 'disabled' };
  const disabledTrusted = disabledFixture.F.fdEditionCatalogSiteSnapshot(disabledFixture.prepared.snapshot, disabledInput);
  assert.deepEqual(disabledTrusted, disabledInput);
  assert.equal(recursivelyFrozen(disabledTrusted), true);

  const other = await preparedFixture(audience === 'ms3' ? 'resident' : 'ms3');
  for (const [label, snapshot, context] of [
    ['wrong branded audience', other.prepared.snapshot, input],
    ['wrong same-audience path', fixture.prepared.snapshot, { ...input, pathId: audience === 'ms3' ? 'resident-four-week' : 'ms3-six-week' }],
    ['malformed core revision', fixture.prepared.snapshot, { ...input, coreRevision: 'not-a-core-revision' }],
    ['wrong revision', fixture.prepared.snapshot, { ...input, localCatalogRevision: `sha256-${'Z'.repeat(43)}` }],
    ['wrong gate', fixture.prepared.snapshot, { ...input, rotationEditionV2: 'disabled' }],
    ['snapshot clone', structuredClone(fixture.prepared.snapshot), input],
    ['context clone with extra', fixture.prepared.snapshot, { ...structuredClone(input), extra: true }],
  ]) {
    assert.equal(fixture.F.fdEditionCatalogSiteSnapshot(snapshot, context), null, label);
  }
  let getterReads = 0;
  const accessor = { ...input };
  Object.defineProperty(accessor, 'audience', { enumerable: true, get() { getterReads += 1; return audience; } });
  const revoked = Proxy.revocable(input, {}); revoked.revoke();
  assert.equal(fixture.F.fdEditionCatalogSiteSnapshot(fixture.prepared.snapshot, accessor), null);
  assert.equal(fixture.F.fdEditionCatalogSiteSnapshot(fixture.prepared.snapshot, revoked.proxy), null);
  assert.equal(getterReads, 0);
});

testForAudiences('reference-set digest is the independently computed unique sorted complete graph and revision drift stays visible', async (audience) => {
  const { input, prepared, result } = await resolveFixture(audience);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const expectedKeys = [
    LOCATION, CURATOR, PHRASES,
    choiceKey('role'), choiceKey('reason'), choiceKey('daySet'), choiceKey('activity'),
    choiceKey('roundsPreparation'), choiceKey('roundsParticipation'), choiceKey('roundsFollowUp'),
    choiceKey('presentationFormat'), choiceKey('presentationTiming'), choiceKey('presentationElement'),
    'choice.presentation-element-two@v1', choiceKey('documentationWorkflow'), choiceKey('documentationTiming'),
    choiceKey('feedbackCadence'), choiceKey('feedbackInitiator'), choiceKey('feedbackSetting'),
    choiceKey('accessItem'), choiceKey('duePoint'), choiceKey('checklist'),
    'place.workroom@v1', 'link.arrival@v1', 'link.documentation@v1', 'link.attendance@v1',
    'link.access@v1', 'link.directory@v1', 'link.orientation@v1',
  ].sort();
  assert.equal(new Set(expectedKeys).size, expectedKeys.length);
  const expectedPairs = expectedKeys.map((key) => [key, recordByKey(input, key).contentDigest]);
  assert.equal(result.referenceSetDigest, await digest(expectedPairs));
  assert.deepEqual(result.displayModel.revisions, {
    createdAgainstCoreRevision: CORE_REVISION,
    currentCoreRevision: CURRENT_CORE_REVISION,
    coreMatches: false,
    createdAgainstCatalogRevision: `sha256-${'A'.repeat(43)}`,
    currentCatalogRevision: prepared.snapshot.revision,
    catalogMatches: false,
  });
});

testForAudiences('empty local plan and all optional omissions remain absent with exact null sentinels', async (audience) => {
  const value = config(audience, {});
  delete value.pathItems[0].reasonKey;
  const { result } = await resolveFixture(audience, value);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.displayModel.emptyLocalPlan, true);
  assert.deepEqual(result.displayModel.firstDay, { arrival: null, accessItems: [], contacts: [], checklistItems: [] });
  assert.equal(result.displayModel.typicalDay, null);
  assert.deepEqual(result.displayModel.workflow, { rounds: null, presentation: null, documentation: null });
  assert.deepEqual(result.displayModel.attendanceFeedback, { attendance: null, feedback: null });
  assert.deepEqual(result.displayModel.resources, []);
  assert.equal(Object.hasOwn(result.displayModel.pathItems[0], 'reasonText'), false);

  for (const category of ['accessItems', 'contacts', 'checklistItems', 'resources']) {
    const presentEmpty = await resolveFixture(audience, config(audience, { [category]: [] }));
    assertFailure(presentEmpty.result);
  }

  const optionalPlan = fullLocalPlan();
  delete optionalPlan.arrival.linkKey;
  delete optionalPlan.documentation.policyLinkKey;
  delete optionalPlan.attendance.policyLinkKey;
  delete optionalPlan.accessItems[0].linkKey;
  delete optionalPlan.contacts[0].linkKey;
  const optional = await resolveFixture(audience, config(audience, optionalPlan));
  assert.equal(optional.result.ok, true, JSON.stringify(optional.result.errors));
  assert.equal(Object.hasOwn(optional.result.displayModel.firstDay.arrival, 'link'), false);
  assert.equal(Object.hasOwn(optional.result.displayModel.workflow.documentation, 'link'), false);
  assert.equal(Object.hasOwn(optional.result.displayModel.attendanceFeedback.attendance, 'link'), false);
  assert.equal(Object.hasOwn(optional.result.displayModel.firstDay.accessItems[0], 'link'), false);
  assert.equal(Object.hasOwn(optional.result.displayModel.firstDay.contacts[0], 'link'), false);
  assert.equal(Object.hasOwn(optional.result.displayModel.resources[1], 'reasonText'), false);
});

testForAudiences('every catalog-backed visible-text source rejects an embedded raw exact key without echo or display output', async (audience) => {
  const base = await projection(audience);
  const cases = [
    ['location display', LOCATION, (record) => { record.displayName = `Unit ${RAW_VISIBLE_KEY} name`; }],
    ['curator display', CURATOR, (record) => { record.displayName = `Curator ${RAW_VISIBLE_KEY} name`; }],
    ['place display', 'place.workroom@v1', (record) => { record.displayName = `Place ${RAW_VISIBLE_KEY} name`; }],
    ['official title', 'link.orientation@v1', (record) => { record.title = `Title ${RAW_VISIBLE_KEY} text`; }],
    ['choice label', choiceKey('role'), (record) => { record.label = `Label ${RAW_VISIBLE_KEY} text`; }],
    ['choice fragment', choiceKey('role'), (record) => { record.fragment = `Fragment ${RAW_VISIBLE_KEY} text`; }],
    ['phrase display', PHRASES, (record) => { record.displayName = `Phrases ${RAW_VISIBLE_KEY} name`; }],
    ['preset display', 'preset.complete@v1', (record) => { record.displayName = `Preset ${RAW_VISIBLE_KEY} name`; }],
    ['rendered template', PHRASES, (record) => { record.templates.arrival.text += ` ${RAW_VISIBLE_KEY}`; }],
  ];
  for (const [name, key, mutate] of cases) {
    const candidate = structuredClone(base);
    mutate(recordByKey(candidate, key));
    await refreshProjection(candidate);
    const F = load(base.revision);
    const prepared = await F.fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(prepared, RAW_VISIBLE_KEY);
    const result = await F.fdEditionCatalogResolve(
      config(audience), prepared.snapshot, 'learner',
      { audience, localCatalogRevision: base.revision, rotationEditionV2: 'enabled', coreRevision: CORE_REVISION },
      webcrypto.subtle,
    );
    assertFailure(result, RAW_VISIBLE_KEY);
    assert.equal(result.displayModel, null, name);
  }
});

testForAudiences('gate, trust brand, lifecycle, kind, and location rules fail closed', async (audience) => {
  const enabled = await preparedFixture(audience, 'enabled');
  const disabled = await preparedFixture(audience, 'disabled');
  assert.equal(enabled.F.fdEditionPublicationEnabled(enabled.prepared.snapshot), true);
  assert.equal(disabled.F.fdEditionPublicationEnabled(disabled.prepared.snapshot), false);
  assert.equal(enabled.F.fdEditionPublicationEnabled(structuredClone(enabled.prepared.snapshot)), false);
  assert.equal(enabled.F.fdEditionPublicationEnabled(enabled.input), false);

  const recordCases = [
    ['reviewed builder', choiceKey('role'), 'builder', 'choice', LOCATION, true, ''],
    ['reviewed learner', choiceKey('role'), 'learner', 'choice', LOCATION, true, ''],
    ['deprecated builder', DEPRECATED, 'builder', 'choice', LOCATION, false, 'CATALOG_RESELECTION_REQUIRED'],
    ['deprecated learner', DEPRECATED, 'learner', 'choice', LOCATION, true, ''],
    ['blocked builder', BLOCKED, 'builder', 'choice', LOCATION, false, 'CATALOG_BLOCKED'],
    ['blocked learner', BLOCKED, 'learner', 'choice', LOCATION, false, 'CATALOG_BLOCKED'],
    ['unlisted', 'choice.unlisted@v1', 'learner', 'choice', LOCATION, false, 'CATALOG_UNAVAILABLE'],
    ['wrong kind', choiceKey('role'), 'learner', 'place', LOCATION, false, 'CATALOG_UNAVAILABLE'],
    ['wrong scope', 'choice.other-role@v1', 'learner', 'choice', LOCATION, false, 'CATALOG_UNAVAILABLE'],
    ['wrong location root', LOCATION, 'learner', 'trainingLocation', OTHER_LOCATION, false, 'CATALOG_UNAVAILABLE'],
    ['wrong mode', choiceKey('role'), 'preview', 'choice', LOCATION, false, 'CATALOG_UNAVAILABLE'],
  ];
  for (const [name, key, mode, kind, location, ok, error] of recordCases) {
    const actual = enabled.F.fdEditionCatalogRecord(enabled.prepared.snapshot, key, mode, kind, location);
    assert.equal(actual.ok, ok, name);
    assert.equal(actual.error, error, name);
    if (ok) {
      assert.equal(recursivelyFrozen(actual.record), true, name);
      const again = enabled.F.fdEditionCatalogRecord(enabled.prepared.snapshot, key, mode, kind, location);
      assert.notStrictEqual(actual.record, again.record, name);
    }
  }
  assert.equal(enabled.F.fdEditionCatalogRecord(structuredClone(enabled.prepared.snapshot), choiceKey('role'), 'learner', 'choice', LOCATION).ok, false);
});

testForAudiences('snapshot top-level ordering, membership, disjointness, audience, revision, and digest mutations are rejected', async (audience) => {
  const base = await projection(audience);
  const otherAudience = audience === 'ms3' ? 'resident' : 'ms3';
  const cases = [
    ['extra top-level field', async (value) => { value.secret = 'TOP-LEVEL-SECRET'; await refreshProjection(value); }, 'TOP-LEVEL-SECRET'],
    ['missing top-level field', async (value) => { delete value.blockedKeys; }, ''],
    ['wrong schema version', async (value) => { value.schemaVersion = 2; await refreshProjection(value); }, ''],
    ['malformed gate', async (value) => { value.rotationEditionV2 = 'preview'; await refreshProjection(value); }, ''],
    ['wrong audience', async (value) => { value.audience = otherAudience; await refreshProjection(value); }, ''],
    ['tampered expected combined revision', async (value) => { value.revision = `sha256-${'B'.repeat(43)}`; await refreshProjection(value); }, ''],
    ['tampered projection digest', async (value) => { value.projectionDigest = `sha256-${'C'.repeat(43)}`; }, ''],
    ['tampered record digest', async (value) => {
      recordByKey(value, choiceKey('role')).contentDigest = `sha256-${'D'.repeat(43)}`;
      await refreshProjection(value, { records: false });
    }, ''],
    ['duplicate selection key', async (value) => { value.selectionKeys.push(value.selectionKeys[0]); value.selectionKeys.sort(); await refreshProjection(value); }, ''],
    ['unlisted selection key', async (value) => { value.selectionKeys.push('choice.unlisted@v1'); value.selectionKeys.sort(); await refreshProjection(value); }, ''],
    ['misordered selection keys', async (value) => { value.selectionKeys.reverse(); await refreshProjection(value); }, ''],
    ['duplicate blocked key', async (value) => { value.blockedKeys.push(BLOCKED); await refreshProjection(value); }, ''],
    ['blocked and resolution overlap', async (value) => { value.blockedKeys = [choiceKey('role')]; await refreshProjection(value); }, ''],
    ['misordered records', async (value) => { value.resolutionRecords.reverse(); await refreshProjection(value); }, ''],
    ['duplicate record key', async (value) => { value.resolutionRecords.push(structuredClone(value.resolutionRecords[0])); value.resolutionRecords.sort((a, b) => a.key.localeCompare(b.key)); await refreshProjection(value); }, ''],
    ['record missing projection audience', async (value) => { recordByKey(value, choiceKey('role')).audiences = [otherAudience]; await refreshProjection(value); }, ''],
  ];
  for (const [name, mutate, secret] of cases) {
    const candidate = structuredClone(base);
    await mutate(candidate);
    const F = load(base.revision);
    const result = await F.fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result, secret);
    assert.equal(F.fdEditionPublicationEnabled(result.snapshot), false, name);
    const unresolved = await F.fdEditionCatalogResolve(config(audience), result.snapshot, 'learner', {
      audience, localCatalogRevision: base.revision, rotationEditionV2: 'enabled', coreRevision: CORE_REVISION,
    }, webcrypto.subtle);
    assertFailure(unresolved);
  }
  const wrongExpected = await load(base.revision).fdEditionCatalogSnapshot(base, otherAudience, webcrypto.subtle);
  assertFailure(wrongExpected);
});

testForAudiences('all seven catalog record variants are closed and every common text/date/set cap is enforced', async (audience) => {
  const base = await projection(audience);
  for (const kind of ['trainingLocation', 'curatorProfile', 'place', 'officialLink', 'phraseSet', 'choice', 'localPreset']) {
    const candidate = structuredClone(base);
    const target = candidate.resolutionRecords.find((record) => record.kind === kind);
    target.unreviewedField = 'VARIANT-SECRET';
    await refreshProjection(candidate);
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result, 'VARIANT-SECRET');
  }

  const cases = [
    ['display name 121 scalars', (value) => { recordByKey(value, LOCATION).displayName = 'x'.repeat(121); }],
    ['display name unpaired surrogate', (value) => { recordByKey(value, LOCATION).displayName = '\ud800'; }],
    ['display text control', (value) => { recordByKey(value, LOCATION).displayName = 'unsafe\u202evalue'; }],
    ['display text markup', (value) => { recordByKey(value, LOCATION).displayName = '<unsafe>'; }],
    ['display text trim', (value) => { recordByKey(value, LOCATION).displayName = ' unsafe'; }],
    ['choice label 81 scalars', (value) => { recordByKey(value, choiceKey('role')).label = 'x'.repeat(81); }],
    ['choice fragment 241 scalars', (value) => { recordByKey(value, choiceKey('role')).fragment = 'x'.repeat(241); }],
    ['template text 513 scalars', (value) => { recordByKey(value, PHRASES).templates.arrival.text = 'x'.repeat(513); }],
    ['audiences unsorted', (value) => { recordByKey(value, choiceKey('role')).audiences = ['resident', 'ms3']; }],
    ['audiences duplicate', (value) => { recordByKey(value, choiceKey('role')).audiences = [audience, audience]; }],
    ['audiences over cap', (value) => { recordByKey(value, choiceKey('role')).audiences = ['ms3', 'resident', 'faculty']; }],
    ['location scope empty', (value) => { recordByKey(value, choiceKey('role')).locationKeys = []; }],
    ['location scope duplicate', (value) => { recordByKey(value, choiceKey('role')).locationKeys = [LOCATION, LOCATION]; }],
    ['location scope over 64', (value) => { recordByKey(value, choiceKey('role')).locationKeys = Array.from({ length: 65 }, (_, i) => `location.cap-${i}@v1`); }],
    ['hostnames unsorted', (value) => { recordByKey(value, LOCATION).officialHostnames = ['z.example.edu', 'example.edu']; }],
    ['hostnames duplicate', (value) => { recordByKey(value, LOCATION).officialHostnames = ['example.edu', 'example.edu']; }],
    ['hostnames over 32', (value) => { recordByKey(value, LOCATION).officialHostnames = Array.from({ length: 33 }, (_, i) => `${String(i).padStart(2, '0')}.example.edu`); }],
    ['impossible verified date', (value) => { recordByKey(value, LOCATION).verifiedOn = '2026-02-30'; }],
    ['bad location code', (value) => { recordByKey(value, LOCATION).locationCode = 'unsafe'; }],
    ['bad location type', (value) => { recordByKey(value, LOCATION).locationTypeCode = 'hospital'; }],
    ['bad choice kind', (value) => { recordByKey(value, choiceKey('role')).choiceKind = 'other'; }],
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(base);
    mutate(candidate);
    await refreshProjection(candidate);
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result);
    assert.ok(name);
  }

  const emojiBoundary = structuredClone(base);
  recordByKey(emojiBoundary, LOCATION).displayName = '😀'.repeat(120);
  await refreshProjection(emojiBoundary);
  const accepted = await load(base.revision).fdEditionCatalogSnapshot(emojiBoundary, audience, webcrypto.subtle);
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors));

  const overRecords = structuredClone(base);
  overRecords.resolutionRecords = new Array(4097);
  const overResult = await load(base.revision).fdEditionCatalogSnapshot(overRecords, audience, webcrypto.subtle);
  assertFailure(overResult);

  const overBytes = structuredClone(base);
  const fillCount = 4096 - overBytes.resolutionRecords.length;
  for (let index = 0; index < fillCount; index += 1) {
    overBytes.resolutionRecords.push({
      key: `choice.cap-${String(index).padStart(4, '0')}-${'x'.repeat(100)}@v1`,
      kind: 'choice', contentDigest: `sha256-${'A'.repeat(43)}`, audiences: [audience],
      verifiedOn: '2026-08-19', choiceKind: 'reason', label: 'x'.repeat(120),
      fragment: 'x'.repeat(240), locationKeys: [LOCATION],
    });
  }
  assert.ok(Buffer.byteLength(canonical(overBytes), 'utf8') > 2 * 1024 * 1024);
  const byteResult = await load(base.revision).fdEditionCatalogSnapshot(overBytes, audience, webcrypto.subtle);
  assertFailure(byteResult);
});

testForAudiences('official URLs enforce exact HTTPS hostname, declaration, purpose, and length rules', async (audience) => {
  const base = await projection(audience);
  const cases = [
    ['http', (link) => { link.url = 'http://example.edu/orientation'; }],
    ['userinfo', (link) => { link.url = 'https://user@example.edu/orientation'; }],
    ['query', (link) => { link.url = 'https://example.edu/orientation?token=x'; }],
    ['fragment', (link) => { link.url = 'https://example.edu/orientation#private'; }],
    ['uppercase raw hostname', (link) => { link.url = 'https://EXAMPLE.edu/orientation'; }],
    ['visible hostname mismatch', (link) => { link.visibleHostname = 'other.example.edu'; }],
    ['undeclared hostname', (link) => { link.url = 'https://unlisted.example.edu/orientation'; link.visibleHostname = 'unlisted.example.edu'; }],
    ['invalid purpose', (link) => { link.purposeCode = 'other'; }],
    ['url over 2048', (link) => { link.url = 'https://example.edu/' + 'a'.repeat(2030); }],
    ['hostname over 253', (link) => { const host = 'a'.repeat(254); link.url = `https://${host}/`; link.visibleHostname = host; }],
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(base);
    mutate(recordByKey(candidate, 'link.orientation@v1'));
    await refreshProjection(candidate);
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result, 'token=x');
    assert.ok(name);
  }
  for (const purposeCode of PURPOSE_CODES) {
    const candidate = structuredClone(base);
    recordByKey(candidate, 'link.orientation@v1').purposeCode = purposeCode;
    await refreshProjection(candidate);
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assert.equal(result.ok, true, purposeCode);
  }
  for (const purposeCode of ['access-training', 'parking-transit', 'reviewed-operational']) {
    const candidate = structuredClone(base);
    recordByKey(candidate, 'link.access@v1').purposeCode = purposeCode;
    await refreshProjection(candidate);
    const F = load(base.revision);
    const prepared = await F.fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assert.equal(prepared.ok, true, purposeCode);
    const result = await F.fdEditionCatalogResolve(config(audience), prepared.snapshot, 'learner', siteContext(prepared.snapshot), webcrypto.subtle);
    assert.equal(result.ok, true, purposeCode);
  }
});

testForAudiences('every phrase template rejects missing, repeated, unknown, or reordered placeholders and inventory drift', async (audience) => {
  const base = await projection(audience);
  const mutations = [
    ['missing placeholder', (row) => { row.text = row.text.replace(`{${row.tokens[0]}}`, 'plain'); }],
    ['repeated placeholder', (row) => { row.text += ` {${row.tokens[0]}}`; }],
    ['unknown placeholder', (row) => { row.text += ' {unknown}'; }],
    ['reordered token declaration', (row) => { row.tokens = row.tokens.length > 1 ? [...row.tokens].reverse() : ['unknown']; }],
  ];
  for (const name of Object.keys(TOKENS)) {
    for (const [mutationName, mutate] of mutations) {
      const candidate = structuredClone(base);
      mutate(recordByKey(candidate, PHRASES).templates[name]);
      await refreshProjection(candidate);
      const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
      assertFailure(result);
      assert.ok(`${name} ${mutationName}`);
    }
  }
  for (const [name, mutate] of [
    ['missing template', (value) => { delete value.arrival; }],
    ['extra template', (value) => { value.other = { text: '{item}', tokens: ['item'] }; }],
    ['extra row field', (value) => { value.arrival.other = true; }],
  ]) {
    const candidate = structuredClone(base);
    mutate(recordByKey(candidate, PHRASES).templates);
    await refreshProjection(candidate);
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result);
    assert.ok(name);
  }
});

testForAudiences('catalog relationship graph rejects missing, wrong-kind, cross-location, hostname, closure, and cycle-like dependencies', async (audience) => {
  const base = await projection(audience);
  const cases = [
    ['missing location record', (value) => {
      value.resolutionRecords = value.resolutionRecords.filter((row) => row.key !== OTHER_LOCATION);
      value.selectionKeys = value.selectionKeys.filter((key) => key !== OTHER_LOCATION);
    }],
    ['location key wrong kind', (value) => { recordByKey(value, choiceKey('role')).locationKeys = [choiceKey('reason')]; }],
    ['curator role wrong kind', (value) => { recordByKey(value, CURATOR).roleKey = choiceKey('reason'); }],
    ['curator role wrong scope', (value) => { recordByKey(value, CURATOR).roleKey = 'choice.other-role@v1'; }],
    ['preset phrase wrong kind', (value) => { recordByKey(value, 'preset.complete@v1').phraseSetKey = choiceKey('role'); }],
    ['preset phrase cycle-like self reference', (value) => { recordByKey(value, 'preset.complete@v1').phraseSetKey = 'preset.complete@v1'; }],
    ['link hostname not declared at every location', (value) => { recordByKey(value, 'link.orientation@v1').locationKeys = [LOCATION, OTHER_LOCATION]; }],
    ['reference omitted from resolution closure', (value) => {
      value.resolutionRecords = value.resolutionRecords.filter((row) => row.key !== choiceKey('duePoint'));
      value.selectionKeys = value.selectionKeys.filter((key) => key !== choiceKey('duePoint'));
    }],
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(base);
    mutate(candidate);
    await refreshProjection(candidate);
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result);
    assert.ok(name);
  }
});

const LOCAL_PLAN_INVALID_CASES = [
  ['unknown category', (plan) => { plan.other = true; }],
  ['arrival missing required field', (plan) => { delete plan.arrival.time; }],
  ['arrival extra field', (plan) => { plan.arrival.note = 'LOCAL-SECRET'; }],
  ['arrival timing enum', (plan) => { plan.arrival.timingCode = 'around'; }],
  ['arrival invalid time', (plan) => { plan.arrival.time = '24:00'; }],
  ['schedule missing events', (plan) => { plan.schedule.events = []; }],
  ['schedule events cap', (plan) => { plan.schedule.events = Array.from({ length: 25 }, (_, index) => ({ ...plan.schedule.events[0], instanceId: `local:schedule:${index + 1}`, startTime: `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}` })); }],
  ['schedule bounds', (plan) => { plan.schedule.dayStart = plan.schedule.dayEnd; }],
  ['schedule invalid day start', (plan) => { plan.schedule.dayStart = '7:45'; }],
  ['schedule qualifier', (plan) => { plan.schedule.endQualifierCode = 'near'; }],
  ['schedule event missing field', (plan) => { delete plan.schedule.events[0].activityKey; }],
  ['schedule event extra field', (plan) => { plan.schedule.events[0].note = true; }],
  ['schedule event end not after start', (plan) => { plan.schedule.events[0].endTime = plan.schedule.events[0].startTime; }],
  ['schedule event invalid start', (plan) => { plan.schedule.events[0].startTime = '25:00'; }],
  ['schedule event invalid end', (plan) => { plan.schedule.events[0].endTime = '09:99'; }],
  ['schedule event priority', (plan) => { plan.schedule.events[0].priority = 'urgent'; }],
  ['duplicate schedule ID', (plan) => { plan.schedule.events[1].instanceId = plan.schedule.events[0].instanceId; }],
  ['duplicate schedule tuple', (plan) => { const id = plan.schedule.events[1].instanceId; plan.schedule.events[1] = { ...structuredClone(plan.schedule.events[0]), instanceId: id }; }],
  ['rounds missing field', (plan) => { delete plan.rounds.followUpKey; }],
  ['presentation elements empty', (plan) => { plan.presentation.elementKeys = []; }],
  ['presentation elements cap', (plan) => { plan.presentation.elementKeys = Array(9).fill(choiceKey('presentationElement')); }],
  ['presentation elements duplicate', (plan) => { plan.presentation.elementKeys = [choiceKey('presentationElement'), choiceKey('presentationElement')]; }],
  ['documentation extra field', (plan) => { plan.documentation.other = true; }],
  ['attendance event IDs empty', (plan) => { plan.attendance.eventInstanceIds = []; }],
  ['attendance event IDs cap', (plan) => { plan.attendance.eventInstanceIds = Array.from({ length: 25 }, (_, i) => `local:schedule:${i + 1}`); }],
  ['attendance event IDs duplicate', (plan) => { plan.attendance.eventInstanceIds = ['local:schedule:1', 'local:schedule:1']; }],
  ['attendance missing schedule membership', (plan) => { plan.attendance.eventInstanceIds = ['local:schedule:99']; }],
  ['feedback missing field', (plan) => { delete plan.feedback.settingKey; }],
  ['present empty access must be omitted', (plan) => { plan.accessItems = []; }],
  ['access cap', (plan) => { plan.accessItems = Array.from({ length: 13 }, (_, i) => ({ ...plan.accessItems[0], instanceId: `local:access:${i + 1}` })); }],
  ['access rows must be an array', (plan) => { plan.accessItems = {}; }],
  ['access row missing required field', (plan) => { delete plan.accessItems[0].dueKey; }],
  ['access row extra field', (plan) => { plan.accessItems[0].other = true; }],
  ['present empty contacts must be omitted', (plan) => { plan.contacts = []; }],
  ['contact cap', (plan) => { plan.contacts = Array.from({ length: 9 }, (_, i) => ({ ...plan.contacts[0], instanceId: `local:contact:${i + 1}` })); }],
  ['contact rows must be an array', (plan) => { plan.contacts = {}; }],
  ['contact row missing required field', (plan) => { delete plan.contacts[0].roleKey; }],
  ['contact row extra field', (plan) => { plan.contacts[0].other = true; }],
  ['present empty checklist must be omitted', (plan) => { plan.checklistItems = []; }],
  ['checklist cap', (plan) => { plan.checklistItems = Array.from({ length: 25 }, (_, i) => ({ ...plan.checklistItems[0], instanceId: `local:checklist:${i + 1}` })); }],
  ['checklist rows must be an array', (plan) => { plan.checklistItems = {}; }],
  ['checklist row missing required field', (plan) => { delete plan.checklistItems[0].itemKey; }],
  ['checklist row extra field', (plan) => { plan.checklistItems[0].other = true; }],
  ['present empty resources must be omitted', (plan) => { plan.resources = []; }],
  ['resource cap', (plan) => { plan.resources = Array.from({ length: 13 }, (_, i) => ({ ...plan.resources[0], instanceId: `local:resource:${i + 1}` })); }],
  ['resource rows must be an array', (plan) => { plan.resources = {}; }],
  ['resource row missing required field', (plan) => { delete plan.resources[0].linkKey; }],
  ['resource row extra field', (plan) => { plan.resources[0].other = true; }],
  ['duplicate cross-category ID', (plan) => { plan.contacts[0].instanceId = plan.accessItems[0].instanceId; }],
  ['row non-ASCII ID', (plan) => { plan.contacts[0].instanceId = 'local:contact:é'; }],
  ['resource priority', (plan) => { plan.resources[0].priority = 'urgent'; }],
  ['resource week above audience maximum', (plan, audience) => { plan.resources[0].week = audience === 'ms3' ? 7 : 5; }],
  ['resolved checklist total cap', (plan) => {
    plan.accessItems = Array.from({ length: 12 }, (_, i) => ({ ...plan.accessItems[0], instanceId: `local:access:${i + 1}` }));
    plan.checklistItems = Array.from({ length: 12 }, (_, i) => ({ ...plan.checklistItems[0], instanceId: `local:checklist:${i + 1}` }));
  }],
];

const SHARED_PARITY_INVALID_CASES = [
  ...['accessItems', 'contacts', 'checklistItems', 'resources'].map((category) => [
    `shared present-empty ${category}`,
    (plan) => { plan[category] = []; },
  ]),
  ['shared duplicate schedule tuple', (plan) => {
    const secondId = plan.schedule.events[1].instanceId;
    plan.schedule.events[1] = { ...structuredClone(plan.schedule.events[0]), instanceId: secondId };
  }],
  ['shared resolved checklist total 25', (plan) => {
    plan.accessItems = Array.from({ length: 12 }, (_, index) => ({
      ...plan.accessItems[0], instanceId: `local:access:${index + 1}`,
    }));
    plan.checklistItems = Array.from({ length: 12 }, (_, index) => ({
      ...plan.checklistItems[0], instanceId: `local:checklist:${index + 1}`,
    }));
  }],
];

testForAudiences('every local-plan category, row discriminator, optional field, cap, ID union, tuple, attendance membership, and checklist total is validated for configs', async (audience) => {
  const fixture = await preparedFixture(audience);
  for (const [name, mutate] of LOCAL_PLAN_INVALID_CASES) {
    const value = config(audience);
    mutate(value.localPlan, audience);
    const result = await fixture.F.fdEditionCatalogResolve(value, fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot), webcrypto.subtle);
    assertFailure(result, 'LOCAL-SECRET');
    assert.ok(name);
  }
  const maximumWeek = config(audience);
  maximumWeek.localPlan.resources[0].week = audience === 'ms3' ? 6 : 4;
  const maximumResult = await fixture.F.fdEditionCatalogResolve(maximumWeek, fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot), webcrypto.subtle);
  assert.equal(maximumResult.ok, true, JSON.stringify(maximumResult.errors));
});

testForAudiences('the same complete local-plan validation and dependency rules apply inside localPreset records', async (audience) => {
  const base = await projection(audience);
  const F = load(base.revision);
  const prepared = await F.fdEditionCatalogSnapshot(base, audience, webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  const validPresetPlan = structuredClone(recordByKey(base, 'preset.python-parity@v1').localPlan);
  const resolvedPresetPlan = await F.fdEditionCatalogResolve(
    config(audience, validPresetPlan), prepared.snapshot, 'learner', siteContext(prepared.snapshot), webcrypto.subtle,
  );
  assert.equal(resolvedPresetPlan.ok, true, 'every Python-valid synthetic preset plan must snapshot and resolve in the browser');
  for (const [name, mutate] of SHARED_PARITY_INVALID_CASES) {
    const invalidConfigPlan = structuredClone(SHARED_PRESET_PLANS[audience]);
    mutate(invalidConfigPlan);
    const configResult = await F.fdEditionCatalogResolve(
      config(audience, invalidConfigPlan), prepared.snapshot, 'learner', siteContext(prepared.snapshot), webcrypto.subtle,
    );
    assertFailure(configResult);

    const invalidProjection = structuredClone(base);
    mutate(recordByKey(invalidProjection, 'preset.python-parity@v1').localPlan);
    await refreshProjection(invalidProjection);
    const snapshotResult = await load(base.revision).fdEditionCatalogSnapshot(invalidProjection, audience, webcrypto.subtle);
    assertFailure(snapshotResult);
    assert.ok(name);
  }
  for (const [name, mutate] of LOCAL_PLAN_INVALID_CASES) {
    const candidate = structuredClone(base);
    mutate(recordByKey(candidate, 'preset.complete@v1').localPlan, audience);
    await refreshProjection(candidate);
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result, 'LOCAL-SECRET');
    assert.ok(name);
  }
  const referenceCases = [
    ['arrival place kind', (plan) => { plan.arrival.placeKey = choiceKey('role'); }],
    ['arrival role choice kind', (plan) => { plan.arrival.checkInRoleKey = choiceKey('reason'); }],
    ['arrival link purpose', (plan) => { plan.arrival.linkKey = 'link.orientation@v1'; }],
    ['schedule day choice kind', (plan) => { plan.schedule.events[0].daySetKey = choiceKey('role'); }],
    ['schedule activity choice kind', (plan) => { plan.schedule.events[0].activityKey = choiceKey('role'); }],
    ['schedule place kind', (plan) => { plan.schedule.events[0].placeKey = choiceKey('role'); }],
    ['rounds preparation choice kind', (plan) => { plan.rounds.preparationKey = choiceKey('role'); }],
    ['rounds participation choice kind', (plan) => { plan.rounds.participationKey = choiceKey('role'); }],
    ['rounds followup choice kind', (plan) => { plan.rounds.followUpKey = choiceKey('role'); }],
    ['presentation format choice kind', (plan) => { plan.presentation.formatKey = choiceKey('role'); }],
    ['presentation timing choice kind', (plan) => { plan.presentation.timingKey = choiceKey('role'); }],
    ['presentation element choice kind', (plan) => { plan.presentation.elementKeys[0] = choiceKey('role'); }],
    ['documentation workflow choice kind', (plan) => { plan.documentation.workflowKey = choiceKey('role'); }],
    ['documentation timing choice kind', (plan) => { plan.documentation.timingKey = choiceKey('role'); }],
    ['documentation policy purpose', (plan) => { plan.documentation.policyLinkKey = 'link.orientation@v1'; }],
    ['attendance role choice kind', (plan) => { plan.attendance.absenceRoleKey = choiceKey('reason'); }],
    ['attendance policy purpose', (plan) => { plan.attendance.policyLinkKey = 'link.orientation@v1'; }],
    ['feedback cadence choice kind', (plan) => { plan.feedback.cadenceKey = choiceKey('role'); }],
    ['feedback initiator choice kind', (plan) => { plan.feedback.initiatorKey = choiceKey('role'); }],
    ['feedback setting choice kind', (plan) => { plan.feedback.settingKey = choiceKey('role'); }],
    ['access item choice kind', (plan) => { plan.accessItems[0].itemKey = choiceKey('role'); }],
    ['access due choice kind', (plan) => { plan.accessItems[0].dueKey = choiceKey('role'); }],
    ['access link purpose', (plan) => { plan.accessItems[0].linkKey = 'link.directory@v1'; }],
    ['contact role choice kind', (plan) => { plan.contacts[0].roleKey = choiceKey('reason'); }],
    ['contact link purpose', (plan) => { plan.contacts[0].linkKey = 'link.orientation@v1'; }],
    ['checklist choice kind', (plan) => { plan.checklistItems[0].itemKey = choiceKey('role'); }],
    ['resource link kind', (plan) => { plan.resources[0].linkKey = choiceKey('role'); }],
    ['resource reason choice kind', (plan) => { plan.resources[0].reasonKey = choiceKey('role'); }],
    ['cross-location choice', (plan) => { plan.arrival.checkInRoleKey = 'choice.other-role@v1'; }],
    ['unlisted key', (plan) => { plan.arrival.checkInRoleKey = 'choice.unlisted@v1'; }],
  ];
  for (const [name, mutate] of referenceCases) {
    const candidate = structuredClone(base);
    mutate(recordByKey(candidate, 'preset.complete@v1').localPlan);
    await refreshProjection(candidate);
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result);
    assert.ok(name);
  }

  const maximumWeek = structuredClone(base);
  recordByKey(maximumWeek, 'preset.complete@v1').localPlan.resources[0].week = audience === 'ms3' ? 6 : 4;
  await refreshProjection(maximumWeek);
  const maximumResult = await load(base.revision).fdEditionCatalogSnapshot(maximumWeek, audience, webcrypto.subtle);
  assert.equal(maximumResult.ok, true, JSON.stringify(maximumResult.errors));
});

testForAudiences('typed config references enforce exact kind, choiceKind, purpose, audience, location, lifecycle, and closure', async (audience) => {
  const fixture = await preparedFixture(audience);
  const cases = [
    ['location kind', (plan, value) => { value.context.trainingLocationKey = choiceKey('role'); }],
    ['curator kind', (plan, value) => { value.context.curatorProfileKey = choiceKey('role'); }],
    ['phrase kind', (plan, value) => { value.phraseSetKey = choiceKey('role'); }],
    ['reason choice kind', (plan, value) => { value.pathItems[0].reasonKey = choiceKey('role'); }],
    ['arrival place kind', (plan) => { plan.arrival.placeKey = choiceKey('role'); }],
    ['arrival role choice kind', (plan) => { plan.arrival.checkInRoleKey = choiceKey('reason'); }],
    ['arrival link purpose', (plan) => { plan.arrival.linkKey = 'link.orientation@v1'; }],
    ['schedule day choice kind', (plan) => { plan.schedule.events[0].daySetKey = choiceKey('role'); }],
    ['schedule activity choice kind', (plan) => { plan.schedule.events[0].activityKey = choiceKey('role'); }],
    ['schedule place kind', (plan) => { plan.schedule.events[0].placeKey = choiceKey('role'); }],
    ['rounds preparation choice kind', (plan) => { plan.rounds.preparationKey = choiceKey('role'); }],
    ['rounds participation choice kind', (plan) => { plan.rounds.participationKey = choiceKey('role'); }],
    ['rounds followup choice kind', (plan) => { plan.rounds.followUpKey = choiceKey('role'); }],
    ['presentation format choice kind', (plan) => { plan.presentation.formatKey = choiceKey('role'); }],
    ['presentation timing choice kind', (plan) => { plan.presentation.timingKey = choiceKey('role'); }],
    ['presentation element choice kind', (plan) => { plan.presentation.elementKeys[0] = choiceKey('role'); }],
    ['documentation workflow choice kind', (plan) => { plan.documentation.workflowKey = choiceKey('role'); }],
    ['documentation timing choice kind', (plan) => { plan.documentation.timingKey = choiceKey('role'); }],
    ['documentation policy purpose', (plan) => { plan.documentation.policyLinkKey = 'link.orientation@v1'; }],
    ['attendance role choice kind', (plan) => { plan.attendance.absenceRoleKey = choiceKey('reason'); }],
    ['attendance policy purpose', (plan) => { plan.attendance.policyLinkKey = 'link.orientation@v1'; }],
    ['feedback cadence choice kind', (plan) => { plan.feedback.cadenceKey = choiceKey('role'); }],
    ['feedback initiator choice kind', (plan) => { plan.feedback.initiatorKey = choiceKey('role'); }],
    ['feedback setting choice kind', (plan) => { plan.feedback.settingKey = choiceKey('role'); }],
    ['access item choice kind', (plan) => { plan.accessItems[0].itemKey = choiceKey('role'); }],
    ['access due choice kind', (plan) => { plan.accessItems[0].dueKey = choiceKey('role'); }],
    ['access link purpose', (plan) => { plan.accessItems[0].linkKey = 'link.directory@v1'; }],
    ['contact role choice kind', (plan) => { plan.contacts[0].roleKey = choiceKey('reason'); }],
    ['contact link purpose', (plan) => { plan.contacts[0].linkKey = 'link.orientation@v1'; }],
    ['checklist choice kind', (plan) => { plan.checklistItems[0].itemKey = choiceKey('role'); }],
    ['resource link kind', (plan) => { plan.resources[0].linkKey = choiceKey('role'); }],
    ['resource reason choice kind', (plan) => { plan.resources[0].reasonKey = choiceKey('role'); }],
    ['cross-location choice', (plan) => { plan.arrival.checkInRoleKey = 'choice.other-role@v1'; }],
    ['unlisted key', (plan) => { plan.arrival.checkInRoleKey = 'choice.unlisted@v1'; }],
    ['blocked key', (plan) => { plan.arrival.checkInRoleKey = BLOCKED; }],
  ];
  for (const [name, mutate] of cases) {
    const value = config(audience);
    mutate(value.localPlan, value);
    const result = await fixture.F.fdEditionCatalogResolve(value, fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot), webcrypto.subtle);
    assertFailure(result);
    assert.ok(name);
  }

  let digestCalls = 0;
  const incomplete = config(audience);
  incomplete.localPlan.arrival.checkInRoleKey = 'choice.unlisted@v1';
  const incompleteResult = await fixture.F.fdEditionCatalogResolve(
    incomplete, fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot),
    { digest() { digestCalls += 1; return Promise.resolve(new ArrayBuffer(32)); } },
  );
  assertFailure(incompleteResult);
  assert.equal(digestCalls, 0, 'the complete typed graph must close before digesting or rendering');

  const learnerValue = config(audience);
  learnerValue.pathItems[0].reasonKey = DEPRECATED;
  const learner = await fixture.F.fdEditionCatalogResolve(learnerValue, fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot), webcrypto.subtle);
  assert.equal(learner.ok, true, JSON.stringify(learner.errors));
  const builder = await fixture.F.fdEditionCatalogResolve(learnerValue, fixture.prepared.snapshot, 'builder', siteContext(fixture.prepared.snapshot), webcrypto.subtle);
  assertFailure(builder);
});

testForAudiences('config root, context, path, ordering, size, audience limits, and exact change-summary rules are table-validated', async (audience) => {
  const fixture = await preparedFixture(audience);
  const cases = [
    ['extra config field', (value) => { value.secret = 'CONFIG-SECRET'; }],
    ['missing config field', (value) => { delete value.context; }],
    ['audience/path mismatch', (value) => { value.pathId = audience === 'ms3' ? 'resident-four-week' : 'ms3-six-week'; }],
    ['edition zero', (value) => { value.editionNumber = 0; }],
    ['edition above max', (value) => { value.editionNumber = 2147483648; }],
    ['edition noninteger', (value) => { value.editionNumber = 1.5; }],
    ['core revision malformed', (value) => { value.createdAgainstCoreRevision = 'ABC'; }],
    ['catalog revision malformed', (value) => { value.createdAgainstLocalCatalogRevision = 'sha256-bad'; }],
    ['context extra', (value) => { value.context.note = 'CONTEXT-SECRET'; }],
    ['context missing', (value) => { delete value.context.editionCheckedOn; }],
    ['impossible start date', (value) => { value.context.rotationStart = '2026-02-30'; }],
    ['end before start', (value) => { value.context.rotationEnd = '2026-08-31'; }],
    ['impossible checked date', (value) => { value.context.editionCheckedOn = '2026-02-30'; }],
    ['path empty', (value) => { value.pathItems = []; }],
    ['path cap', (value) => { value.pathItems = Array.from({ length: 97 }, (_, i) => ({ instanceId: `core:item:${i + 1}`, ref: `library/${i + 1}`, week: 1, order: i + 1, priority: 'required' })); }],
    ['path duplicate ID', (value) => { value.pathItems[1].instanceId = value.pathItems[0].instanceId; }],
    ['path and local ID union collision', (value) => { value.localPlan.contacts[0].instanceId = value.pathItems[0].instanceId; }],
    ['path ID empty', (value) => { value.pathItems[0].instanceId = ''; }],
    ['path ID nonASCII', (value) => { value.pathItems[0].instanceId = 'core:é'; }],
    ['path ref empty', (value) => { value.pathItems[0].ref = ''; }],
    ['path ref nonASCII', (value) => { value.pathItems[0].ref = 'library/é'; }],
    ['path week zero', (value) => { value.pathItems[0].week = 0; }],
    ['path week above audience', (value) => { value.pathItems[0].week = audience === 'ms3' ? 7 : 5; }],
    ['path order zero', (value) => { value.pathItems[0].order = 0; }],
    ['path duplicate week/order tuple', (value) => { value.pathItems[1].week = 1; value.pathItems[1].order = 1; }],
    ['path noncontiguous order', (value) => { value.pathItems[0].order = 2; }],
    ['path array misordered', (value) => { value.pathItems.reverse(); }],
    ['path priority', (value) => { value.pathItems[0].priority = 'urgent'; }],
    ['path optional reason invalid', (value) => { value.pathItems[0].reasonKey = 'bad'; }],
    ['change kinds empty', (value) => { value.changeSummary.kindCodes = []; }],
    ['change kinds cap', (value) => { value.editionNumber = 2; value.changeSummary = { kindCodes: [...Array(13)].map((_, i) => `kind-${i}`), changedItemCount: 1 }; }],
    ['change kinds duplicate', (value) => { value.changeSummary.kindCodes = ['schedule', 'schedule']; value.editionNumber = 2; value.changeSummary.changedItemCount = 1; }],
    ['change kinds misordered', (value) => { value.changeSummary.kindCodes = ['arrival', 'schedule']; value.editionNumber = 2; value.changeSummary.changedItemCount = 1; }],
    ['change kind unknown', (value) => { value.changeSummary.kindCodes = ['unknown']; }],
    ['change count above max', (value) => { value.changeSummary.changedItemCount = 256; }],
    ['change count negative', (value) => { value.changeSummary.changedItemCount = -1; }],
    ['change count noninteger', (value) => { value.changeSummary.changedItemCount = 1.5; }],
    ['edition one must be initial only', (value) => { value.changeSummary = { kindCodes: ['schedule'], changedItemCount: 1 }; }],
    ['later edition cannot be initial', (value) => { value.editionNumber = 2; value.changeSummary = { kindCodes: ['initial'], changedItemCount: 0 }; }],
    ['later edition must have changed item', (value) => { value.editionNumber = 2; value.changeSummary = { kindCodes: ['schedule'], changedItemCount: 0 }; }],
  ];
  for (const [name, mutate] of cases) {
    const value = config(audience);
    mutate(value);
    const result = await fixture.F.fdEditionCatalogResolve(value, fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot), webcrypto.subtle);
    assertFailure(result, 'SECRET');
    assert.ok(name);
  }

  const oversized = config(audience);
  oversized.pathItems = Array.from({ length: 96 }, (_, i) => ({
    instanceId: `${'i'.repeat(150)}${String(i).padStart(3, '0')}`,
    ref: `${'r'.repeat(150)}${String(i).padStart(3, '0')}`,
    week: 1, order: i + 1, priority: 'required',
  }));
  assert.ok(Buffer.byteLength(canonical(oversized), 'utf8') > 12 * 1024);
  const overResult = await fixture.F.fdEditionCatalogResolve(oversized, fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot), webcrypto.subtle);
  assertFailure(overResult);

  const maximumEdition = config(audience);
  maximumEdition.editionNumber = 2147483647;
  maximumEdition.changeSummary = { kindCodes: ['schedule'], changedItemCount: 1 };
  const maximumResult = await fixture.F.fdEditionCatalogResolve(maximumEdition, fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot), webcrypto.subtle);
  assert.equal(maximumResult.ok, true, JSON.stringify(maximumResult.errors));
});

testForAudiences('descriptor-safe boundaries reject accessors, proxies, revoked proxies, inheritance, pollution keys, symbols, non-enumerables, sparse arrays, oversize arrays, and cycles', async (audience) => {
  const base = await projection(audience);
  let accessorReads = 0;
  const projectionCases = [];
  const accessor = structuredClone(base);
  Object.defineProperty(accessor, 'revision', { enumerable: true, get() { accessorReads += 1; return base.revision; } });
  projectionCases.push(['accessor', accessor]);
  projectionCases.push(['throwing proxy', new Proxy(structuredClone(base), { ownKeys() { throw new Error('PROXY-SECRET'); } })]);
  const revocable = Proxy.revocable(structuredClone(base), {}); revocable.revoke(); projectionCases.push(['revoked proxy', revocable.proxy]);
  projectionCases.push(['inherited property', Object.assign(Object.create({ inherited: true }), structuredClone(base))]);
  const pollution = structuredClone(base); Object.defineProperty(pollution, '__proto__', { enumerable: true, value: 'POLLUTION-SECRET' }); projectionCases.push(['pollution key', pollution]);
  const constructorKey = structuredClone(base); Object.defineProperty(constructorKey, 'constructor', { enumerable: true, value: 'POLLUTION-SECRET' }); projectionCases.push(['constructor pollution key', constructorKey]);
  const prototypeKey = structuredClone(base); Object.defineProperty(prototypeKey, 'prototype', { enumerable: true, value: 'POLLUTION-SECRET' }); projectionCases.push(['prototype pollution key', prototypeKey]);
  const symbol = structuredClone(base); symbol[Symbol('secret')] = true; projectionCases.push(['symbol', symbol]);
  const hidden = structuredClone(base); Object.defineProperty(hidden, 'hidden', { enumerable: false, value: true }); projectionCases.push(['non-enumerable', hidden]);
  const sparse = structuredClone(base); sparse.selectionKeys = new Array(2); sparse.selectionKeys[1] = choiceKey('role'); projectionCases.push(['sparse array', sparse]);
  const oversize = structuredClone(base); oversize.selectionKeys = new Array(4097).fill(choiceKey('role')); projectionCases.push(['oversize array', oversize]);
  const cycle = structuredClone(base); cycle.self = cycle; projectionCases.push(['cycle', cycle]);
  for (const [name, candidate] of projectionCases) {
    const result = await load(base.revision).fdEditionCatalogSnapshot(candidate, audience, webcrypto.subtle);
    assertFailure(result, 'SECRET');
    assert.ok(name);
  }
  assert.equal(accessorReads, 0);

  const fixture = await preparedFixture(audience);
  let configReads = 0;
  const configAccessor = config(audience);
  Object.defineProperty(configAccessor.context, 'rotationStart', { enumerable: true, get() { configReads += 1; return '2026-09-01'; } });
  const configSymbol = config(audience); configSymbol[Symbol('secret')] = true;
  const configCycle = config(audience); configCycle.self = configCycle;
  const contextAccessor = siteContext(fixture.prepared.snapshot);
  Object.defineProperty(contextAccessor, 'audience', { enumerable: true, get() { configReads += 1; return audience; } });
  for (const [name, value, context] of [
    ['config accessor', configAccessor, siteContext(fixture.prepared.snapshot)],
    ['config symbol', configSymbol, siteContext(fixture.prepared.snapshot)],
    ['config cycle', configCycle, siteContext(fixture.prepared.snapshot)],
    ['context accessor', config(audience), contextAccessor],
  ]) {
    const result = await fixture.F.fdEditionCatalogResolve(value, fixture.prepared.snapshot, 'learner', context, webcrypto.subtle);
    assertFailure(result);
    assert.ok(name);
  }
  assert.equal(configReads, 0);
});

function crossRealmSubtle() {
  return {
    digest(_algorithm, data) {
      const expected = createHash('sha256').update(Buffer.from(data)).digest();
      const foreign = runInNewContext('new ArrayBuffer(32)');
      new Uint8Array(foreign).set(expected);
      return Promise.resolve(foreign);
    },
  };
}

testForAudiences('Web Crypto accepts genuine cross-realm exact 32-byte ArrayBuffers and rejects every malformed async boundary without partial trust', async (audience) => {
  const base = await projection(audience);
  const crossRealm = await load(base.revision).fdEditionCatalogSnapshot(base, audience, crossRealmSubtle());
  assert.equal(crossRealm.ok, true, JSON.stringify(crossRealm.errors));

  const detached = new ArrayBuffer(32);
  structuredClone(detached, { transfer: [detached] });
  let thenReads = 0;
  const hostileThenable = {};
  Object.defineProperty(hostileThenable, 'then', { get() { thenReads += 1; throw new Error('THENABLE-SECRET'); } });
  const boundaryCases = [
    ['missing', null],
    ['methodless', {}],
    ['sync throw', { digest() { throw new Error('SYNC-SECRET'); } }],
    ['rejection', { digest() { return Promise.reject(new Error('REJECT-SECRET')); } }],
    ['sync ArrayBuffer', { digest() { return new ArrayBuffer(32); } }],
    ['hostile thenable', { digest() { return hostileThenable; } }],
    ['tag spoof', { digest() { return Promise.resolve({ [Symbol.toStringTag]: 'ArrayBuffer', byteLength: 32 }); } }],
    ['plain object', { digest() { return Promise.resolve({ byteLength: 32 }); } }],
    ['view', { digest() { return Promise.resolve(new Uint8Array(32)); } }],
    ['wrong length', { digest() { return Promise.resolve(new ArrayBuffer(31)); } }],
    ['detached', { digest() { return Promise.resolve(detached); } }],
  ];
  const snapshotCases = [
    ...boundaryCases,
    ['wrong final bytes', { digest() { return Promise.resolve(new ArrayBuffer(32)); } }],
  ];
  for (const [name, subtle] of snapshotCases) {
    const F = load(base.revision);
    const result = await F.fdEditionCatalogSnapshot(base, audience, subtle);
    assertFailure(result, 'SECRET');
    assert.equal(F.fdEditionPublicationEnabled(result.snapshot), false, name);
  }
  assert.equal(thenReads, 0, 'intrinsic Promise brand check must not assimilate hostile thenables');

  const fixture = await preparedFixture(audience);
  for (const [name, subtle] of boundaryCases) {
    const result = await fixture.F.fdEditionCatalogResolve(config(audience), fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot), subtle);
    assertFailure(result, 'SECRET');
    assert.ok(name);
  }
});

testForAudiences('site context is closed and must exactly bind audience, current catalog revision, gate, and core revision', async (audience) => {
  const fixture = await preparedFixture(audience);
  const otherAudience = audience === 'ms3' ? 'resident' : 'ms3';
  const cases = [
    ['extra field', { extra: true }],
    ['audience', { audience: otherAudience }],
    ['catalog revision', { localCatalogRevision: `sha256-${'Z'.repeat(43)}` }],
    ['gate', { rotationEditionV2: 'disabled' }],
    ['core revision', { coreRevision: 'ABC' }],
  ];
  for (const [name, overrides] of cases) {
    const result = await fixture.F.fdEditionCatalogResolve(config(audience), fixture.prepared.snapshot, 'learner', siteContext(fixture.prepared.snapshot, overrides), webcrypto.subtle);
    assertFailure(result);
    assert.ok(name);
  }
});

testForAudiences('the resolver executes without DOM, storage, network, clock, locale, URL-parser, TextEncoder, or btoa globals', async (audience) => {
  const input = await projection(audience);
  const F = loadWithoutBrowserOrClockGlobals(input.revision);
  const prepared = await F.fdEditionCatalogSnapshot(input, audience, webcrypto.subtle);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  const result = await F.fdEditionCatalogResolve(
    config(audience), prepared.snapshot, 'learner', siteContext(prepared.snapshot), webcrypto.subtle,
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});
