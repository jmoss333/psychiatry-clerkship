import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build/frontdoor';
const SOURCES = ['fd_data.js', 'fd_edition_contract.js', 'fd_edition_project.js', 'fd_curator.js']
  .map((name) => new URL(`${BUILD}/${name}`, import.meta.url));
const HTML_SOURCE = new URL(
  '../13_Faculty_Resources/Rotation_Curation/rotation-curator.html', import.meta.url,
);
const API_NAMES = [
  'fdCuratorNewDraft', 'fdCuratorReduce', 'fdCuratorValidateStep',
  'fdCuratorApplyAction', 'fdCuratorDraftStorage', 'fdCuratorProjectDraft',
  'fdCuratorLocalPreviewMarkup', 'fdCuratorExternalDomain', 'fdCuratorLocalFindings',
  'fdCuratorImportEnvelope', 'fdCuratorMount',
];

function loadApi() {
  const source = SOURCES.map((url) => readFileSync(url, 'utf8')).join('\n');
  return new Function(
    'TextEncoder', 'TextDecoder', 'atob', 'btoa', 'localStorage',
    `function fdEsc(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}\n${source}\n` +
    `return {${API_NAMES.map((name) => `${name}:typeof ${name}==='function'?${name}:null`).join(',')},fdEditionCreateEnvelope,` +
    'setCuratorProjector:function(value){fdCuratorProjectDraft=value;}};',
  )(TextEncoder, TextDecoder, atob, btoa, null);
}

const F = loadApi();
const REVISION = 'c'.repeat(40);
const ORIENTATION_FIELDS = [
  'firstDayArrival', 'dailySchedule', 'roundsWorkflow', 'presentationExpectations',
  'documentationExpectations', 'attendanceExpectations', 'feedbackProcess',
  'accessPreparation',
];

function fn(name) {
  assert.equal(typeof F[name], 'function', `${name} must be implemented`);
  return F[name];
}

function context(audience = 'ms3') {
  return {
    audience,
    pathId: audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week',
    coreRevision: REVISION,
  };
}

function item(ref = 'interview.md', title = 'Synthetic interview guide') {
  return {
    ref, title, kind: 'read', minutes: 5, summary: 'Synthetic summary', points: [],
    attested: true, toolRef: null, risk: null, governance: null, href: `?page=${ref}`,
  };
}

function index(audience = 'ms3') {
  const weekCount = audience === 'ms3' ? 6 : 4;
  const core = item();
  return {
    path: { id: context(audience).pathId, weekCount },
    weeks: Array.from({ length: weekCount }, (_, offset) => ({
      n: offset + 1, title: `Week ${offset + 1}`, theme: '', focusCategories: [],
      items: offset === 0 ? [core] : [],
    })),
    byRef: { [core.ref]: core },
    columns: [{ name: 'Core skills', accent: '#174d43', items: [core] }],
    kit: [],
  };
}

function reduce(draft, action, audience = 'ms3') {
  return fn('fdCuratorReduce')(draft, action, index(audience), context(audience));
}

function completedDraft(audience = 'ms3') {
  let draft = fn('fdCuratorNewDraft')(index(audience), context(audience));
  const card = {
    title: 'Synthetic rotation', locationName: 'Example Unit', locationCode: 'EX1',
    curatorName: 'Example Curator', curatorRole: 'Faculty educator',
    rotationStart: '2026-09-01',
    rotationEnd: audience === 'ms3' ? '2026-10-12' : '2026-09-28',
    lastVerified: '2026-08-19',
  };
  for (const [field, value] of Object.entries(card)) {
    draft = reduce(draft, { type: 'SET_CARD_FIELD', field, value }, audience);
  }
  return draft;
}

function reviewedDraft(audience = 'ms3') {
  let draft = completedDraft(audience);
  draft = reduce(draft, { type: 'SET_PREVIEW_REVIEWED', viewport: 'desktop', value: true }, audience);
  draft = reduce(draft, { type: 'SET_PREVIEW_REVIEWED', viewport: 'mobile', value: true }, audience);
  for (const name of ['publicSafe', 'officialLinks', 'previewsReviewed', 'forwardable']) {
    draft = reduce(draft, { type: 'SET_AFFIRMATION', name, value: true }, audience);
  }
  return draft;
}

function assertReset(draft) {
  assert.deepEqual(draft.preview, { desktopReviewed: false, mobileReviewed: false });
  assert.deepEqual(draft.affirmations, {
    publicSafe: false, officialLinks: false, previewsReviewed: false, forwardable: false,
  });
}

test('supports exactly the eight bounded structured orientation fields and resets reviews', () => {
  let draft = reviewedDraft();
  const original = structuredClone(draft);
  for (const field of ORIENTATION_FIELDS) {
    draft = reduce(draft, {
      type: 'LOCAL_SET_ORIENTATION', field, value: `${field} synthetic guidance`,
    });
    assert.equal(draft.config.localOrientation[field], `${field} synthetic guidance`);
  }
  assert.deepEqual(original.config.localOrientation, fn('fdCuratorNewDraft')(index(), context()).config.localOrientation);
  assertReset(draft);

  const before = structuredClone(draft);
  for (const action of [
    { type: 'LOCAL_SET_ORIENTATION', field: 'freeFormHtml', value: 'extra' },
    { type: 'LOCAL_SET_ORIENTATION', field: 'firstDayArrival', value: 'x'.repeat(601) },
    { type: 'LOCAL_SET_ORIENTATION', field: 'firstDayArrival', value: 42 },
  ]) assert.deepEqual(reduce(draft, action), before);
});

test('adds only role plus HTTPS directory contacts and uses safe visible domains', () => {
  let draft = reviewedDraft();
  draft = reduce(draft, {
    type: 'LOCAL_CONTACT_ADD', role: 'Clerkship coordinator',
    directoryUrl: 'https://directory.example.edu/people?unit=training#contact',
  });
  assert.deepEqual(draft.config.localOrientation.contacts, [{
    role: 'Clerkship coordinator',
    directoryUrl: 'https://directory.example.edu/people?unit=training#contact',
  }]);
  assertReset(draft);
  assert.equal(fn('fdCuratorExternalDomain')(
    'https://directory.example.edu/people?private=never-visible#fragment',
  ), 'directory.example.edu');
  assert.equal(fn('fdCuratorExternalDomain')('https://user:secret@example.edu/path'), '');
  assert.equal(fn('fdCuratorExternalDomain')('http://example.edu/path'), '');
  assert.equal(fn('fdCuratorExternalDomain')('not a URL'), '');

  const before = structuredClone(draft);
  for (const action of [
    { type: 'LOCAL_CONTACT_ADD', role: 'Coordinator', directoryUrl: 'http://example.edu' },
    { type: 'LOCAL_CONTACT_ADD', role: 'Coordinator', directoryUrl: 'mailto:person@example.edu' },
    { type: 'LOCAL_CONTACT_ADD', role: '', directoryUrl: 'https://example.edu' },
    { type: 'LOCAL_CONTACT_ADD', role: 'x'.repeat(101), directoryUrl: 'https://example.edu' },
    { type: 'LOCAL_CONTACT_ADD', role: 'Coordinator', directoryUrl: `https://example.edu/${'x'.repeat(2030)}` },
  ]) assert.deepEqual(reduce(draft, action), before, JSON.stringify(action));

  draft = reduce(draft, { type: 'LOCAL_CONTACT_REMOVE', index: 0 });
  assert.deepEqual(draft.config.localOrientation.contacts, []);

  draft.config.localOrientation.contacts = Array.from({ length: 12288 }, () => ({
    role: 'Public role', directoryUrl: 'https://directory.example.edu',
  }));
  const atStructuralCeiling = reduce(draft, {
    type: 'LOCAL_CONTACT_ADD', role: 'One too many',
    directoryUrl: 'https://directory.example.edu/extra',
  });
  assert.equal(atStructuralCeiling.config.localOrientation.contacts.length, 12288);
});

test('enforces 24 checklist items with unique stable next-unused first-day IDs', () => {
  let draft = reviewedDraft();
  for (let count = 1; count <= 24; count += 1) {
    draft = reduce(draft, {
      type: 'LOCAL_CHECKLIST_ADD', label: `Synthetic first-day item ${count}`,
      priority: count % 2 ? 'required' : 'optional',
    });
  }
  assert.equal(draft.config.localOrientation.checklist.length, 24);
  assert.deepEqual(draft.config.localOrientation.checklist.slice(0, 2).map((entry) => entry.id), [
    'local:first-day:1', 'local:first-day:2',
  ]);
  assert.equal(new Set(draft.config.localOrientation.checklist.map((entry) => entry.id)).size, 24);
  const capped = reduce(draft, {
    type: 'LOCAL_CHECKLIST_ADD', label: 'One too many', priority: 'recommended',
  });
  assert.deepEqual(capped, draft);
  assert.deepEqual(reduce(draft, {
    type: 'LOCAL_CHECKLIST_UPDATE', id: 'local:first-day:1', field: 'label',
    value: 'x'.repeat(101),
  }), draft);

  draft = reduce(draft, { type: 'LOCAL_CHECKLIST_REMOVE', id: 'local:first-day:2' });
  assert.equal(draft.config.localOrientation.checklist.length, 23);
  draft = reduce(draft, {
    type: 'LOCAL_CHECKLIST_ADD', label: 'Replacement item', priority: 'recommended',
  });
  assert.equal(draft.config.localOrientation.checklist.at(-1).id, 'local:first-day:2');
  assert.deepEqual(draft.config.localOrientation.checklist.map((entry) => entry.id).slice(0, 3), [
    'local:first-day:1', 'local:first-day:3', 'local:first-day:4',
  ], 'deletion preserves the normalized visible order of surviving items');
});

test('preserves valid imported schema IDs while generating new IDs in the approved namespace', async () => {
  const draft = completedDraft();
  const config = {
    audience: 'ms3', pathId: 'ms3-six-week', editionNumber: 2,
    createdAgainstCoreRevision: REVISION, card: draft.config.card,
    pathItems: draft.config.pathItems,
    localOrientation: {
      ...draft.config.localOrientation,
      checklist: [{ id: 'local:check:1', label: 'Existing valid backup item', priority: 'optional' }],
    },
    changeNote: '',
  };
  const created = await F.fdEditionCreateEnvelope(config, index(), context(), webcrypto.subtle);
  assert.equal(created.ok, true);
  const imported = await fn('fdCuratorImportEnvelope')(
    JSON.stringify(created.envelope), index(), context(), webcrypto.subtle,
  );
  assert.equal(imported.ok, true, 'Task 10 valid imports remain accepted');
  const edited = reduce(imported.draft, {
    type: 'LOCAL_CHECKLIST_ADD', label: 'New checklist item', priority: 'recommended',
  });
  assert.equal(edited.config.localOrientation.checklist.at(-1).id, 'local:first-day:1');
});

for (const audience of ['ms3', 'resident']) {
  test(`enforces ${audience} local-resource caps, fields, and audience week bounds`, () => {
    let draft = reviewedDraft(audience);
    const maxWeek = index(audience).path.weekCount;
    for (let count = 1; count <= 12; count += 1) {
      draft = reduce(draft, {
        type: 'LOCAL_RESOURCE_ADD', title: `Official resource ${count}`,
        url: `https://resources.example.edu/item-${count}`,
        priority: count % 2 ? 'recommended' : 'optional',
        week: (count % maxWeek) + 1, rationale: `Review item ${count}.`,
      }, audience);
    }
    assert.equal(draft.config.localOrientation.resources.length, 12);
    assert.equal(draft.config.localOrientation.resources[0].id, 'local:resource:1');
    assert.equal(reduce(draft, {
      type: 'LOCAL_RESOURCE_ADD', title: 'Thirteenth resource',
      url: 'https://example.edu/13', priority: 'optional', week: 1, rationale: '',
    }, audience).config.localOrientation.resources.length, 12);

    const before = structuredClone(draft);
    for (const action of [
      { type: 'LOCAL_RESOURCE_UPDATE', id: 'local:resource:1', field: 'week', value: 0 },
      { type: 'LOCAL_RESOURCE_UPDATE', id: 'local:resource:1', field: 'week', value: maxWeek + 1 },
      { type: 'LOCAL_RESOURCE_UPDATE', id: 'local:resource:1', field: 'priority', value: 'universal' },
      { type: 'LOCAL_RESOURCE_UPDATE', id: 'local:resource:1', field: 'title', value: 'x'.repeat(101) },
      { type: 'LOCAL_RESOURCE_UPDATE', id: 'local:resource:1', field: 'rationale', value: 'x'.repeat(281) },
      { type: 'LOCAL_RESOURCE_UPDATE', id: 'local:resource:1', field: 'url', value: 'http://example.edu' },
    ]) assert.deepEqual(reduce(draft, action, audience), before, JSON.stringify(action));

    draft = reduce(draft, { type: 'LOCAL_RESOURCE_REMOVE', id: 'local:resource:2' }, audience);
    draft = reduce(draft, {
      type: 'LOCAL_RESOURCE_ADD', title: 'Replacement resource',
      url: 'https://example.edu/replacement', priority: 'required', week: maxWeek,
      rationale: '',
    }, audience);
    assert.equal(draft.config.localOrientation.resources.at(-1).id, 'local:resource:2');
  });
}

test('local student-visible semantic no-ops preserve reviews and pending imports', () => {
  const apply = fn('fdCuratorApplyAction');
  let draft = reviewedDraft();
  const actions = [
    { type: 'LOCAL_SET_ORIENTATION', field: 'firstDayArrival', value: '' },
    { type: 'LOCAL_CONTACT_REMOVE', index: 9 },
    { type: 'LOCAL_CHECKLIST_REMOVE', id: 'local:first-day:404' },
    { type: 'LOCAL_RESOURCE_REMOVE', id: 'local:resource:404' },
    { type: 'LOCAL_RESOURCE_ADD', title: '', url: 'https://example.edu', priority: 'optional', week: 1, rationale: '' },
  ];
  for (const action of actions) {
    const applied = apply(draft, action, index(), context());
    assert.equal(applied.changed, false, JSON.stringify(action));
    assert.deepEqual(applied.state, draft);
    draft = applied.state;
  }
});

test('Step 4 reports shared blocking and advisory findings by category and field without echoing text', () => {
  const validate = fn('fdCuratorValidateStep');
  let draft = completedDraft();
  const secret = 'password=synthetic-secret-value';
  draft = reduce(draft, {
    type: 'LOCAL_SET_ORIENTATION', field: 'firstDayArrival', value: secret,
  });
  let checked = validate(draft, 4, index(), context());
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.some((finding) =>
    finding.fieldId === 'curatorFirstDayArrival' &&
    finding.href === '#curatorFirstDayArrival' &&
    /Orientation.*First-day arrival/i.test(finding.message)));
  assert.doesNotMatch(JSON.stringify(checked), /synthetic-secret-value/);

  draft = completedDraft();
  draft = reduce(draft, {
    type: 'LOCAL_SET_ORIENTATION', field: 'accessPreparation',
    value: 'Review the institutional credential process before arrival.',
  });
  checked = validate(draft, 4, index(), context());
  assert.equal(checked.ok, true);
  assert.ok(checked.warnings.some((finding) =>
    finding.fieldId === 'curatorAccessPreparation' &&
    /Orientation.*Access preparation/i.test(finding.message)));
  assert.doesNotMatch(JSON.stringify(checked), /institutional credential process/);

  const displayed = fn('fdCuratorLocalFindings')({
    errors: [{ code: 'EDITION_URL', path: '/config/localOrientation/resources/0/url', message: 'Only HTTPS.', blocking: true }],
    warnings: [{ code: 'EDITION_TEXT_RISK', path: '/config/localOrientation/checklist/0/label', message: 'Review.', blocking: false }],
  }, draft);
  assert.match(displayed.errors[0].message, /Local resource.*URL/i);
  assert.match(displayed.warnings[0].message, /First-day checklist.*Label/i);
});

test('save rejects blocking local policy findings but preserves advisory drafts', () => {
  const calls = [];
  const storage = { setItem(key, value) { calls.push([key, value]); } };
  const adapter = fn('fdCuratorDraftStorage')(storage);
  let draft = completedDraft();
  draft = reduce(draft, {
    type: 'LOCAL_SET_ORIENTATION', field: 'firstDayArrival', value: 'password=do-not-save',
  });
  assert.equal(adapter.save(draft, index(), context()), false);
  assert.equal(calls.length, 0);

  draft = completedDraft();
  draft = reduce(draft, {
    type: 'LOCAL_SET_ORIENTATION', field: 'accessPreparation',
    value: 'Review the institutional credential process.',
  });
  assert.equal(adapter.save(draft, index(), context()), true);
  assert.equal(calls.length, 1);
});

test('validated projector preview escapes local text and shows only external domains', async () => {
  let draft = completedDraft();
  draft = reduce(draft, {
    type: 'LOCAL_SET_ORIENTATION', field: 'roundsWorkflow', value: 'Team & learner workflow',
  });
  draft = reduce(draft, {
    type: 'LOCAL_CONTACT_ADD', role: 'Faculty directory',
    directoryUrl: 'https://directory.example.edu/faculty?search=private#result',
  });
  draft = reduce(draft, {
    type: 'LOCAL_CHECKLIST_ADD', label: 'Confirm approved access', priority: 'required',
  });
  draft = reduce(draft, {
    type: 'LOCAL_RESOURCE_ADD', title: 'Official local policy',
    url: 'https://policy.example.edu/clinical/path?topic=not-displayed#part',
    priority: 'recommended', week: 1, rationale: 'Read before orientation.',
  });
  const projected = await fn('fdCuratorProjectDraft')(
    draft, index(), context(), webcrypto.subtle,
  );
  assert.equal(projected.ok, true, JSON.stringify(projected.errors));
  const markup = fn('fdCuratorLocalPreviewMarkup')(projected);
  assert.match(markup, /Team &amp; learner workflow/);
  assert.match(markup, /directory\.example\.edu/);
  assert.match(markup, /policy\.example\.edu/);
  assert.doesNotMatch(markup, /search=private|topic=not-displayed|#result|#part/);
  assert.match(markup, /Attending-provided local resource/);
});

test('delayed preview review records only the requested view for the still-current draft', async () => {
  const harness = loadApi();
  const pending = [];
  harness.setCuratorProjector((draft) => new Promise((resolve) => {
    pending.push({ title: draft.config.card.title, resolve });
  }));
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      id, hidden: false, innerHTML: '', textContent: '', value: '', disabled: false,
      attributes: new Map(), listeners: {},
      setAttribute(name, value) { this.attributes.set(name, String(value)); },
      removeAttribute(name) { this.attributes.delete(name); },
      getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      focus() { this.focused = true; },
      querySelector() { return null; }, querySelectorAll() { return []; },
    });
    return nodes.get(id);
  }
  const root = node('root');
  root.querySelector = (selector) => selector.startsWith('#') ? node(selector.slice(1)) : null;
  root.querySelectorAll = () => [];
  root.addEventListener = (name, callback) => { root.listeners[name] = callback; };
  const app = harness.fdCuratorMount(root, index(), context());
  for (const [field, value] of Object.entries({
    title: 'Synthetic rotation', locationName: 'Example Unit', locationCode: 'EX1',
    curatorName: 'Example Curator', curatorRole: 'Faculty educator',
    rotationStart: '2026-09-01', rotationEnd: '2026-10-12', lastVerified: '2026-08-19',
  })) app.dispatch({ type: 'SET_CARD_FIELD', field, value });
  app.dispatch({ type: 'GO_TO_STEP', step: 4 });

  const first = app.reviewPreview('desktop');
  assert.equal(pending.length, 1);
  app.dispatch({ type: 'LOCAL_SET_ORIENTATION', field: 'dailySchedule', value: 'New draft' });
  pending[0].resolve({ ok: true, index: { weeks: [], columns: [], edition: { localOrientation: { firstDayArrival: '', dailySchedule: '', roundsWorkflow: '', presentationExpectations: '', documentationExpectations: '', attendanceExpectations: '', feedbackProcess: '', accessPreparation: '', contacts: [], checklist: [], resources: [] } } } });
  assert.equal((await first).ok, false, 'the visible edit makes the older preview stale');
  assert.equal(app.getState().preview.desktopReviewed, false);

  const second = app.reviewPreview('mobile');
  assert.equal(pending.length, 2);
  pending[1].resolve({ ok: true, index: { weeks: [], columns: [], edition: { localOrientation: app.getState().config.localOrientation } } });
  assert.equal((await second).ok, true);
  assert.deepEqual(app.getState().preview, { desktopReviewed: false, mobileReviewed: true });

  const input = node('curatorDailySchedule');
  input.value = 'Later visible edit'; input.maxLength = 600;
  input.setAttribute('data-curator-orientation', 'dailySchedule');
  root.listeners.input({ target: input });
  assert.deepEqual(app.getState().preview, { desktopReviewed: false, mobileReviewed: false });
  assert.equal(node('curatorPreviewReviewStatus').textContent,
    'Desktop preview not yet reviewed · Mobile preview not yet reviewed');
});

test('Step 4 HTML exposes the bounded editor, deliberate previews, and responsive modes', () => {
  const source = readFileSync(HTML_SOURCE, 'utf8');
  assert.match(source, /id="curatorStepFour"/);
  const labels = {
    curatorFirstDayArrival: 'First-day arrival guidance',
    curatorDailySchedule: 'Typical daily schedule',
    curatorRoundsWorkflow: 'Rounds workflow',
    curatorPresentationExpectations: 'Presentation expectations',
    curatorDocumentationExpectations: 'Documentation expectations',
    curatorAttendanceExpectations: 'Attendance expectations',
    curatorFeedbackProcess: 'Feedback process',
    curatorAccessPreparation: 'Approved institutional access or training',
  };
  for (const [id, label] of Object.entries(labels)) {
    assert.match(source, new RegExp(`<label[^>]+for="${id}"[^>]*>${label}<`));
    assert.match(source, new RegExp(`id="${id}"[^>]+maxlength="600"[^>]+aria-describedby=`));
    assert.match(source, new RegExp(`id="${id}Count"[^>]+class="character-count"`));
  }
  assert.match(source, /No PHI, learner information, evaluations, credentials, access codes, private contact details, doses, copied clinical protocols, or direct clinical directives/);
  assert.match(source, /official HTTPS institutional link/);
  assert.match(source, /id="curatorReviewDesktop"[^>]*>Review desktop preview</);
  assert.match(source, /id="curatorReviewMobile"[^>]*>Review mobile preview</);
  assert.match(source, /id="curatorPreviewReviewStatus"[^>]+role="status"[^>]+aria-live="polite"[^>]*>Desktop preview not yet reviewed · Mobile preview not yet reviewed</);
  assert.match(source, /data-curator-local-view="edit"[^>]*>Edit</);
  assert.match(source, /data-curator-local-view="preview"[^>]*>Preview</);
  assert.match(source, /@media \(max-width: 760px\)[\s\S]*\.local-view-toggle/);
  assert.match(source, /\.preview-panel \{ position: sticky; top: 18px; \}/);
  assert.doesNotMatch(source, /aria-live=["'][^"']*["'][^>]*id="curatorPreviewBody"/);
  assert.match(source, /id="curatorGenerate" disabled aria-disabled="true"/);
});
