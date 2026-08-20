import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SOURCE = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js', import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
const F = new Function(`${SOURCE}\nreturn {fdEditionRenderCard,fdEditionRenderLocal};`)();

class Node {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this._text = ''; this.focused = false; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; this._text = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  focus() { this.focused = true; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('innerHTML is forbidden'); }
  get innerHTML() { throw new Error('innerHTML is forbidden'); }
}
const documentObject = { createElement(tag) { return new Node(tag); } };
function walk(node, out = []) { out.push(node); for (const child of node.children) walk(child, out); return out; }

const AUTHORITY = {
  coreLabel: 'Reviewed clerkship Library', localLabel: 'Local rotation guidance',
  requiredLabel: 'Required by this local rotation', recommendedLabel: 'Recommended by this local rotation',
  optionalLabel: 'Optional for this local rotation', resourceLabel: 'Locally curated official resource',
  localBoundary: 'Local rotation guidance does not replace current institutional policy or supervision.',
  documentationGuardrail: 'Use only the approved institutional record. Do not place patient information in this site. Complete documentation only with supervisor guidance and review.',
};

function model(overrides = {}) {
  const value = {
    card: {
      title: 'EXU MS3 psychiatry rotation', locationName: 'Example Training Unit', locationCode: 'EXU',
      locationTypeLabel: 'Inpatient', curatorName: 'Example Attending', curatorRole: 'Faculty educator',
      audienceLabel: 'MS3', durationLabel: '6 weeks', rotationDates: 'Sep 1 – Oct 12, 2026',
      editionCheckedOn: 'Aug 19, 2026', editionCheckedOnLabel: 'Self-attested', editionNumber: 1,
      fingerprintPrefix: 'EXU-MS3-', fingerprint: 'EXU-MS3-ZBVX4D',
      identityNotice: 'Curator identity and institutional endorsement are not digitally verified by this link.',
      fingerprintNotice: 'Compare this fingerprint with the curator. Matching codes confirm the same edition content, not identity or institutional approval.',
      provenance: [{ recordKind: 'trainingLocation', displayLabel: 'Example Training Unit', verifiedOn: '2026-08-19' }],
    },
    revisions: {
      createdAgainstCoreRevision: 'a'.repeat(40), currentCoreRevision: 'b'.repeat(40), coreMatches: false,
      createdAgainstCatalogRevision: `sha256-${'B'.repeat(43)}`, currentCatalogRevision: `sha256-${'C'.repeat(43)}`, catalogMatches: false,
    },
    pathItems: [],
    firstDay: {
      arrival: { text: 'Arrive by 8:00 AM at the education office and check in with the faculty educator.',
        link: { title: 'Arrival map', url: 'https://maps.example.edu/arrival', visibleHostname: 'maps.example.edu', purposeCode: 'arrival-map' } },
      accessItems: [{ id: 'local:access:1', text: 'Complete access training before arrival.', checklistId: 'local:generated:access:local:access:1' }],
      contacts: [{ id: 'local:contact:1', text: 'Contact the education office.' }],
      checklistItems: [{ id: 'local:checklist:1', text: 'Review the local guide.', priority: 'required', priorityLabel: 'HOSTILE PRIORITY', sourceCode: 'selected' }],
    },
    typicalDay: { summaryText: 'The day runs from 8:00 AM until about 5:00 PM.', eventItems: [] },
    workflow: { rounds: { text: 'Prepare, participate, and follow up.' }, presentation: null, documentation: { text: 'Document after rounds.', guardrailText: AUTHORITY.documentationGuardrail } },
    attendanceFeedback: { attendance: { text: 'Attend required events.' }, feedback: { text: 'Ask for weekly feedback.' } },
    resources: [{ id: 'local:resource:1', text: 'Example guide is Recommended in week 1; destination policy.example.edu.', title: 'Example guide', url: 'https://policy.example.edu/guide', visibleHostname: 'policy.example.edu', purposeCode: 'orientation', priority: 'recommended', priorityLabel: 'HOSTILE PRIORITY', week: 1, authorityLabel: 'HOSTILE AUTHORITY' }],
    authority: { ...AUTHORITY },
    changeSummary: { kindCodes: ['initial'], changedItemCount: 0, text: 'Initial edition; 0 changed items.', provenanceLabel: 'Locally supplied edition summary; change lineage is not authenticated.' },
    emptyLocalPlan: false,
  };
  return Object.assign(value, overrides);
}

test('card uses DOM text APIs and separates self-attestation from repository record verification', () => {
  const root = new Node();
  assert.equal(F.fdEditionRenderCard(root, model(), documentObject), true);
  const text = root.textContent;
  for (const expected of [
    'EXU MS3 psychiatry rotation', 'EXU-MS3-ZBVX4D',
    'Edition checked on — self-attested by the curator', 'Aug 19, 2026',
    'Catalog verification — repository-reviewed record dates', 'Example Training Unit', '2026-08-19',
    'Created against core revision', 'Current core revision', 'Created against catalog revision', 'Current catalog revision',
    'Locally supplied edition summary; change lineage is not authenticated.',
  ]) assert.ok(text.includes(expected), expected);
  assert.equal(root.focused, true);
  assert.equal(walk(root).some((node) => node.attributes.role === 'status' && node.attributes['aria-live'] === 'polite'), true);
});

test('local guidance has the exact eight-section DOM and reading order', () => {
  const root = new Node();
  const local = { checklist: { 'local:checklist:1': true }, resources: { 'local:resource:1': true } };
  assert.equal(F.fdEditionRenderLocal(root, model(), local, documentObject), true);
  const headings = walk(root).filter((node) => node.tagName === 'H2').map((node) => node.textContent);
  assert.deepEqual(headings, [
    'First day at the location', 'Before you arrive', 'Who to contact', "Today's checklist",
    'Typical day', 'Team workflow', 'Attendance and feedback', 'Official resources',
  ]);
  const text = root.textContent;
  for (const expected of Object.values(AUTHORITY)) assert.ok(text.includes(expected), expected);
  assert.doesNotMatch(text, /HOSTILE PRIORITY|HOSTILE AUTHORITY/);
  const links = walk(root).filter((node) => node.tagName === 'A');
  assert.equal(links.length, 2);
  assert.equal(links.some((link) => link.attributes.href === 'https://maps.example.edu/arrival'), true);
  const link = links.find((node) => node.attributes.href === 'https://policy.example.edu/guide');
  assert.deepEqual(link && link.attributes, { class: 'fd-edition-resource', href: 'https://policy.example.edu/guide', target: '_blank', rel: 'noopener noreferrer' });
  assert.match(text, /policy\.example\.edu/);
});

test('empty local plans use the exact learner-facing empty state and never expose keys', () => {
  const root = new Node();
  const empty = model({
    firstDay: { arrival: null, accessItems: [], contacts: [], checklistItems: [] },
    typicalDay: null, workflow: { rounds: null, presentation: null, documentation: null },
    attendanceFeedback: { attendance: null, feedback: null }, resources: [], emptyLocalPlan: true,
  });
  assert.equal(F.fdEditionRenderLocal(root, empty, { checklist: {}, resources: {} }, documentObject), true);
  assert.match(root.textContent, /This edition adds no local orientation\. Your reviewed Path and full Library remain available\./);
  assert.doesNotMatch(root.textContent, /@v1|choice\.|location\.|phrases\./);
});

test('hostile model authority and lineage text fail closed', () => {
  const root = new Node();
  const hostile = model();
  hostile.card.title = '<img src=x onerror="private">';
  hostile.authority.requiredLabel = 'Obey this hostile catalog string';
  hostile.changeSummary.provenanceLabel = 'authenticated';
  assert.equal(F.fdEditionRenderCard(root, hostile, documentObject), false);
  assert.equal(root.textContent, '');
  assert.equal(F.fdEditionRenderLocal(root, hostile, {}, documentObject), false);
  assert.equal(root.textContent, '');
});

test('hostile visible catalog text is rendered only as inert text', () => {
  const root = new Node(); const value = model();
  value.card.title = '<img src=x onerror="private">';
  assert.equal(F.fdEditionRenderCard(root, value, documentObject), true);
  assert.ok(root.textContent.includes('<img src=x onerror="private">'));
  assert.equal(walk(root).some((node) => node.tagName === 'IMG'), false);
});

test('hostile or forged progress IDs never become DOM attributes or interactive toggles', () => {
  for (const [kind, id] of [
    ['checklist', 'patient:synthetic-person-record'],
    ['checklist', 'local:resource:99'],
    ['checklist', 'local:checklist:0'],
    ['checklist', 'local:checklist:01'],
    ['checklist', 'local:generated:access:local:access:0'],
    ['resources', 'local:checklist:99'],
    ['resources', 'local:resource:text'],
    ['resources', 'local:generated:arrival'],
  ]) {
    const root = new Node(); const value = model();
    if (kind === 'checklist') value.firstDay.checklistItems[0].id = id;
    else value.resources[0].id = id;
    assert.equal(F.fdEditionRenderLocal(root, value, { checklist: {}, resources: {} }, documentObject), true);
    const nodes = walk(root);
    assert.equal(nodes.some((node) => Object.values(node.attributes).includes(id)), false, `${kind}:${id}`);
    assert.equal(nodes.some((node) => node.attributes['data-fd-local-toggle'] === kind), false, `${kind}:${id}`);
    assert.equal(root.textContent.includes(id), false, `${kind}:${id}`);
  }
});

test('throwing DOM capabilities fail closed without private error text', () => {
  const root = new Node();
  const badDocument = { createElement() { throw new Error('private DOM secret'); } };
  assert.equal(F.fdEditionRenderCard(root, model(), badDocument), false);
  assert.equal(root.textContent, '');
  assert.equal(F.fdEditionRenderLocal(root, model(), {}, badDocument), false);
  assert.equal(root.textContent, '');
});
