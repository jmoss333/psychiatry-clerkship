import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  startFacultyConsole,
} from '../faculty-console/app.mjs';
import {
  deriveReviewCounts,
  filterReviewItems,
  isValidReopenReason,
  normalizeReviewItems,
} from '../faculty-console/review-model.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(repo, 'faculty-console/index.html'), 'utf8');
const appSource = readFileSync(path.join(repo, 'faculty-console/app.mjs'), 'utf8');
const DEFAULT_MANIFEST_REVISION = 'b'.repeat(40);

function testRevision(label) {
  return createHash('sha256').update(String(label)).digest('hex');
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map(value => Number.parseInt(value, 16) / 255)
    .map(value => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function question(overrides = {}) {
  return {
    id: 'qb_moo_002',
    status: 'draft',
    category: 'mood',
    difficulty: 2,
    stem: 'A fictional patient has depressed mood. What is the diagnosis?',
    evidence: 't_mood.md - syndrome discriminator',
    pages: ['t_mood.md'],
    assessment: { gate: 'ready', blockers: [], warnings: [] },
    options: [
      { key: 'A', t: 'Major depressive disorder', c: true },
      { key: 'B', t: 'Delirium' },
      { key: 'C', t: 'Mania' },
      { key: 'D', t: 'Adjustment disorder' },
    ],
    ...overrides,
  };
}

function validDomQuestion(overrides = {}) {
  return {
    id: 'qb_moo_902',
    revision: testRevision('revision-one'),
    status: 'draft',
    type: 'sba',
    category: 'mood',
    competency: ['dx'],
    difficulty: 2,
    pages: ['t_mood.md'],
    link: { label: 'Open Mood Disorders', href: '?page=t_mood.md' },
    stem: 'A fictional patient has a sustained depressive syndrome. What is the diagnosis?',
    options: [
      { key: 'A', t: 'Major depressive disorder', c: true },
      { key: 'B', t: 'Delirium', trap: { name: 'Timeline miss', note: 'Delirium fluctuates.' } },
      { key: 'C', t: 'Mania', trap: { name: 'Polarity miss', note: 'Mania needs activation.' } },
      { key: 'D', t: 'Adjustment disorder', trap: { name: 'Threshold miss', note: 'The full syndrome is present.' } },
    ],
    why: 'The sustained syndrome supports major depressive disorder.',
    pearl: 'Name the syndrome before choosing treatment.',
    evidence: 't_mood.md - depressive syndrome discriminator.',
    assessment: { gate: 'ready', blockers: [], warnings: [] },
    ...overrides,
  };
}

class FakeTextNode {
  constructor(value, ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.textContent = String(value);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.open = false;
    this.selected = false;
    this.readOnly = false;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.selectionDirection = 'none';
    this._text = '';
    this.contentWindow = this.tagName === 'IFRAME' ? Object.freeze({}) : undefined;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = '';
    for (const child of children) this.appendChild(child);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'readonly') this.readOnly = true;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'readonly') this.readOnly = false;
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  contains(candidate) {
    for (let node = candidate; node; node = node.parentNode) {
      if (node === this) return true;
    }
    return false;
  }

  isInert() {
    for (let node = this; node; node = node.parentNode) {
      if (node.getAttribute?.('inert') !== null) return true;
    }
    return false;
  }

  focus() {
    if (!this.disabled && !this.isInert()) this.ownerDocument.activeElement = this;
  }

  setSelectionRange(start, end, direction = 'none') {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }

  async dispatch(type, properties = {}) {
    const event = {
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties,
    };
    if (this.disabled || this.isInert()) return event;
    if (type === 'change'
        && this.tagName === 'INPUT'
        && this.getAttribute('type') === 'radio'
        && this.checked) {
      const name = this.getAttribute('name');
      for (const element of this.ownerDocument.elements()) {
        if (element !== this
            && element.tagName === 'INPUT'
            && element.getAttribute('type') === 'radio'
            && element.getAttribute('name') === name) {
          element.checked = false;
        }
      }
    }
    for (const listener of this.listeners.get(type) || []) await listener(event);
    return event;
  }

  get textContent() {
    return this._text + this.children.map(child => child.textContent).join('');
  }

  set textContent(value) {
    this.replaceChildren();
    this._text = String(value);
  }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.app = this.createElement('main');
    this.app.setAttribute('id', 'app');
    this.status = this.createElement('div');
    this.status.setAttribute('id', 'app-status');
    this.roots = [this.app, this.status];
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(value) {
    return new FakeTextNode(value, this);
  }

  getElementById(id) {
    return this.elements().find(element => element.getAttribute('id') === id) || null;
  }

  elements() {
    const found = [];
    const visit = node => {
      if (!(node instanceof FakeElement)) return;
      found.push(node);
      for (const child of node.children) visit(child);
    };
    for (const root of this.roots) visit(root);
    return found;
  }

  find(tagName, exactText) {
    const normalizedTag = tagName.toUpperCase();
    return this.elements().find(element => (
      element.tagName === normalizedTag && element.textContent === exactText
    )) || null;
  }

  findAll(tagName) {
    const normalizedTag = tagName.toUpperCase();
    return this.elements().filter(element => element.tagName === normalizedTag);
  }

  links() {
    return this.elements().filter(element => element.tagName === 'A');
  }
}

class FakeWindow {
  constructor(key = 'test-faculty-key') {
    this.listeners = new Map();
    this.timers = new Map();
    this.nextTimerId = 1;
    this.openCalls = [];
    this.storage = new Map(key ? [['fac_key', key]] : []);
    this.sessionStorage = {
      getItem: name => this.storage.get(name) || null,
      setItem: (name, value) => this.storage.set(name, String(value)),
      removeItem: name => this.storage.delete(name),
    };
    this.crypto = {
      getRandomValues: bytes => {
        bytes.forEach((_, index) => { bytes[index] = index; });
        return bytes;
      },
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setTimeout(callback, delay) {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(id, { callback, delay });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  open(...args) {
    this.openCalls.push(args);
    return null;
  }

  async dispatch(type, properties = {}) {
    const event = {
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties,
    };
    for (const listener of this.listeners.get(type) || []) await listener(event);
    return event;
  }
}

function serverState({
  question: item = validDomQuestion(),
  questions,
  items,
  manifestPages = ['t_mood.md'],
  manifestRevision = DEFAULT_MANIFEST_REVISION,
} = {}) {
  const contentItems = items || [{
    slug: 't_mood.md',
    title: 'Mood disorders',
    kind: 'page',
    status: 'reviewed',
    by: 'Dr <Faculty>',
    at: '2026-07-17',
  }];
  return {
    student: 'https://students.example/',
    attester: 'Joshua Moss, MD',
    qbankRevision: 'a'.repeat(40),
    manifestRevision,
    manifestPages,
    qbank: questions || [item],
    qbankSummary: { counts: { total: (questions || [item]).length, draft: 1, attested: 0, ready: 1, warning: 0, blocked: 0 } },
    items: contentItems,
    counts: { pagesReviewed: 0, pagesTotal: contentItems.length, qbankAttested: 0, qbankTotal: 1 },
  };
}

function jsonResponse(body, { ok = true, status = ok ? 200 : 500 } = {}) {
  return { ok, status, json: async () => body };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

async function startHarness({
  fetchImpl,
  assessItemImpl,
  tokenFactory,
  scheduleTimeout,
  cancelTimeout,
  openExternal,
} = {}) {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const requests = [];
  const fetcher = fetchImpl || (async (url, options = {}) => {
    requests.push({ url, options });
    return jsonResponse(serverState());
  });
  const controller = startFacultyConsole({
    document,
    window,
    fetchImpl: fetcher,
    assessItemImpl,
    ...(tokenFactory ? { tokenFactory } : {}),
    ...(scheduleTimeout ? { scheduleTimeout } : {}),
    ...(cancelTimeout ? { cancelTimeout } : {}),
    ...(openExternal ? { openExternal } : {}),
  });
  await flushAsyncWork();
  return { controller, document, window, requests };
}

async function setValue(document, id, value, eventName = 'input') {
  const control = document.getElementById(id);
  assert.ok(control, `Missing control ${id}`);
  control.value = value;
  await control.dispatch(eventName);
  return control;
}

async function setChecked(document, id, checked = true) {
  const control = document.getElementById(id);
  assert.ok(control, `Missing control ${id}`);
  control.checked = checked;
  await control.dispatch('change');
  return control;
}

function attributeTokens(element, name) {
  return (element.getAttribute(name) || '').trim().split(/\s+/).filter(Boolean);
}

function domId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

function previewStatusEvent(preview, status, {
  event = {},
  data = {},
} = {}) {
  return {
    origin: preview.request.origin,
    source: preview.frameWindow,
    data: {
      type: 'faculty-preview-status',
      reviewKey: preview.request.key,
      reviewToken: preview.request.token,
      status,
      surface: preview.request.surface,
      ...data,
    },
    ...event,
  };
}

async function reportPreviewStatus(window, controller, status, overrides = {}) {
  await window.dispatch('message', previewStatusEvent(
    controller.state.preview,
    status,
    overrides,
  ));
}

function runPreviewTimer(window, preview) {
  const timer = window.timers.get(preview.timerId);
  assert.ok(timer, 'Expected an active preview timer.');
  assert.equal(timer.delay, 10_000);
  timer.callback();
}

async function makeCurrentQuestionPreviewReady(harness) {
  const { controller, document, window } = harness;
  if (controller.state.selectedKey !== 'question:qb_moo_902') {
    await setValue(document, 'review-item-selector', 'question:qb_moo_902', 'change');
  }
  await document.getElementById('learner-preview-frame').dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  await setChecked(document, 'review-live-preview');
  await confirmCurrentSavedDraft(document);
}

async function makeCurrentContentPreviewReady(harness) {
  const { controller, document, window } = harness;
  const item = controller.state.reviewItems.find(candidate => (
    candidate.key === controller.state.selectedKey
  ));
  assert.ok(item && ['page', 'tool'].includes(item.type), 'Expected a selected page or tool.');
  await document.getElementById('learner-preview-frame').dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
}

async function completeCurrentContentReview(harness) {
  await makeCurrentContentPreviewReady(harness);
  for (const id of [
    'review-complete-item',
    'review-content-accuracy',
    'review-content-interactions',
  ]) await setChecked(harness.document, id);
}

async function confirmCurrentSavedDraft(document) {
  await document.getElementById('view-draft').dispatch('click');
  // A clean ready-preview draft now renders the compound control (#review-compound)
  // instead of the standalone #review-saved-revision box; drive whichever is present
  // so every caller of this shared helper keeps working across both render paths.
  const compound = document.getElementById('review-compound');
  await setChecked(document, compound ? 'review-compound' : 'review-saved-revision');
  await document.getElementById('view-live').dispatch('click');
}

// Compound-eligible fixture: preview Ready, Draft view active, zero dirty fields, and
// the item's revision matching the saved question — the exact gate compoundReviewEligible
// checks. `dirty: true` walks through Edit to dirty a field and back to Draft, which is
// the one thing that must knock a question back onto the separate-boxes path.
async function startHarnessWithReadyPreviewDraft({ dirty = false } = {}) {
  const harness = await startHarness({
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const { controller, document, window } = harness;
  await document.getElementById('learner-preview-frame').dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  await document.getElementById('view-draft').dispatch('click');
  if (dirty) {
    await document.getElementById('view-edit').dispatch('click');
    await setValue(document, 'question-stem', 'A dirtied stem must disqualify the compound control.');
    await document.getElementById('view-draft').dispatch('click');
  }
  return harness;
}

// Degraded-preview fixture: status lands in PREVIEW_FAILURES, so compoundReviewEligible
// is false regardless of view mode or dirty state — the separate acknowledgements must
// keep rendering.
async function startHarnessWithFailedPreviewDraft() {
  const harness = await startHarness({
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const { controller, document, window } = harness;
  await reportPreviewStatus(window, controller, 'error');
  await document.getElementById('view-draft').dispatch('click');
  return harness;
}

test('exports the injectable faculty-console browser entry', () => {
  assert.equal(typeof startFacultyConsole, 'function');
  assert.match(
    appSource,
    /export function startFacultyConsole\s*\(\{[\s\S]*?tokenFactory\s*=\s*\(\)\s*=>\s*createReviewToken\(window\.crypto\)[\s\S]*?scheduleTimeout[\s\S]*?cancelTimeout[\s\S]*?openExternal[\s\S]*?\}\)/,
  );
});

test('uses an inert document root and one dedicated status region', () => {
  const appRoot = html.match(/<main\b[^>]*\bid="app"[^>]*>/i)?.[0];
  assert.ok(appRoot, 'Missing main application root');
  assert.doesNotMatch(appRoot, /aria-live/i, 'The whole application must not be live');
  assert.equal((html.match(/\brole="status"/g) || []).length, 1);
  assert.match(
    html,
    /<div\s+id="app-status"\s+class="sr-only"\s+role="status"\s+aria-live="polite"><\/div>/,
  );
  assert.match(html, /<script\s+type="module"\s+src="\.\/app\.mjs"><\/script>/);
  assert.doesNotMatch(html, /<script(?!\s+type="module"\s+src=)[^>]*>[\s\S]+?<\/script>/i);
});

test('creates one semantic queue, workspace, and persistent field labels', () => {
  for (const contract of [
    /renderSharedQueueStrip/,
    /renderItemHeader/,
    /renderViewSwitcher/,
    /renderWorkspaceSurface/,
    /renderAttestationRail/,
    /'aria-current'/,
    /el\('fieldset'/,
    /el\('legend'/,
  ]) assert.match(appSource, contract);

  for (const label of [
    'Faculty key',
    'Reviewer',
    'Search pages, tools, and questions',
    'Review item',
    'Item type',
    'Review status',
    'Category',
    'Review gate',
    'Difficulty',
    'Question ID',
    'Question type',
    'Relational subtype',
    'Competencies',
    'High yield',
    'Source pages',
    'Learning link label',
    'Learning link href',
    'Question stem',
    'Option A text',
    'Option B text',
    'Option C text',
    'Option D text',
    'Correct answer',
    'Trap name',
    'Corrective trap note',
    'Rationale',
    'Teaching pearl',
    'Evidence anchor',
    'Tier-two question',
    'Tier-two rationale',
    'Changed fields',
    'Safety issues',
    'I verified the clinical answer and rationale.',
    'I verified the item against the named library page(s) and evidence anchor.',
    'I verified that the vignette is an original fictional composite with no PHI.',
  ]) assert.ok(appSource.includes(label), `Missing persistent label: ${label}`);

  assert.match(appSource, /configured server-side \(ATTESTER_NAME\)/);
  assert.match(appSource, /Revert/);
  assert.match(appSource, /Save draft/);
  assert.match(appSource, /Attest this question/);
  assert.match(appSource, /Review[^\n]+Resolve[^\n]+Confirm/);
  assert.match(appSource, /Ready|Warning|Blocked/);
  assert.doesNotMatch(appSource, /role:\s*'tablist'/);
  assert.doesNotMatch(appSource, /function renderTabNavigation|function renderBatchSummary|function renderBatchConfirmation/);
  assert.doesNotMatch(appSource, /Attest selected green drafts|Mark reviewed & next|queue checkbox|green batch/i);
  // assessBatch left this ban 2026-08-11: the accepted batch design (2026-08-04 spec,
  // section B) has the client surface the server's own batch verdict in the tray. The
  // remaining identifiers still pin OUT the rejected "attest all green" design.
  assert.doesNotMatch(appSource, /\blegacyBatchEligible\b|\breviewedInSession\b|\bbatchConfirmation\b/);
  assert.match(appSource, /\bderiveBatchEligibility\b/);
  assert.match(appSource, /\bassessBatch\b/);
  assert.doesNotMatch(appSource, /function attestWarning\b|function attestBatch\b|function sameAttestationEntries\b/);
  assert.doesNotMatch(appSource, /\bstate\.batch\b|function selectedBatchQuestions\b|function safeBatchAssessment\b|function openBatchConfirmation\b/);
});

test('renders repository text without HTML parsing sinks', () => {
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(appSource, /insertAdjacentHTML|document\.write\s*\(/);
  assert.match(appSource, /document\.createTextNode/);
  assert.match(appSource, /replaceChildren/);
  assert.doesNotMatch(appSource, /Evidence verified/i);
});

test('keeps the shared key in session storage and request headers only', () => {
  assert.match(appSource, /sessionStorage\.getItem\(KEY_STORAGE\)/);
  assert.match(appSource, /sessionStorage\.setItem\(KEY_STORAGE,/);
  assert.match(appSource, /'x-faculty-key'/);
  assert.doesNotMatch(appSource, /localStorage|document\.cookie/);
  assert.doesNotMatch(appSource, /JSON\.stringify\(\{[\s\S]{0,300}?\bkey\s*:/);
});

test('guards unsaved work and reserves the global shortcut for Ctrl or Command S', () => {
  assert.match(appSource, /function hasAnyUnsavedChanges\(\)/);
  assert.match(appSource, /function hasAnyUnsavedChanges\(\)\s*{\s*return hasUnsavedChanges\(\);\s*}/);
  assert.match(appSource, /addEventListener\('beforeunload'/);
  assert.match(appSource, /if \(!hasAnyUnsavedChanges\(\)\) return/);
  assert.match(appSource, /event\.preventDefault\(\)/);
  assert.match(appSource, /event\.returnValue\s*=\s*''/);
  assert.match(appSource, /\(event\.metaKey\s*\|\|\s*event\.ctrlKey\)/);
  assert.match(appSource, /event\.key\.toLowerCase\(\)\s*===\s*'s'/);
  const letterShortcuts = [...appSource.matchAll(/key\.toLowerCase\(\)\s*===\s*'([a-z])'/g)]
    .map(match => match[1]);
  assert.deepEqual(letterShortcuts, ['s']);
  assert.match(appSource, /Save draft/);
  assert.match(appSource, /Discard/);
  assert.match(appSource, /Cancel/);
  assert.doesNotMatch(appSource, /\bcontentChanges\b|\bcommitContent\b|\btoggleContent\b/);
  assert.doesNotMatch(appSource, /Mark reviewed|Save content reviews|Committing content reviews/i);
});

test('uses the approved clinical workbench layout and accessible primary contrast', () => {
  const primary = html.match(/--primary:\s*(#[0-9a-f]{6})/i)?.[1];
  const primaryText = html.match(/--primary-text:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.equal(primary?.toLowerCase(), '#3f5c45');
  assert.equal(primaryText?.toLowerCase(), '#ffffff');
  assert.ok(contrastRatio(primary, primaryText) >= 4.5);

  assert.match(
    html.replace(/\s+/g, ' '),
    /grid-template-columns:\s*minmax\(0,\s*7fr\)\s+minmax\(280px,\s*3fr\)/,
  );
  assert.match(html, /@media\s*\(max-width:\s*900px\)/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  for (const className of [
    'queue-strip',
    'queue-primary',
    'queue-filters',
    'workspace',
    'preview-column',
    'preview-shell',
    'view-switcher',
    'signoff-rail',
    'rail-step',
  ]) assert.match(html, new RegExp(`\\.${className}\\b`));
  assert.match(html, /textarea/);
  assert.match(html, /\.data-text\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(html, /\.modal-panel\s*\{[^}]*position:\s*fixed/s);
  assert.match(html, /\.modal-panel\s*\{[^}]*100vmax/s);
  assert.match(html, /\.tier-cardinality-actions/);
  assert.doesNotMatch(html, /linear-gradient|radial-gradient|@keyframes/);
  assert.doesNotMatch(html, /\.tab-nav\b|\.batch-summary\b|\.content-list\b|\.queue-row\b/);
});

test('normalizes, filters, and counts the shared review queue', () => {
  const server = {
    items: [
      {
        slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed',
        risk: { kind: 'clinical', level: 'high' },
      },
      {
        slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed',
        risk: { kind: 'local-policy', level: 'moderate' },
      },
    ],
    qbank: [
      validDomQuestion({ id: 'qb_moo_003', evidence: 'anchor-only phrase' }),
      validDomQuestion({ id: 'qb_moo_001', pages: ['unique-page.md'] }),
    ],
  };
  const items = normalizeReviewItems(server);

  assert.deepEqual(items.map(item => item.key), [
    'page:t_mood.md',
    'tool:mse.html',
    'question:qb_moo_001',
    'question:qb_moo_003',
  ]);
  assert.deepEqual(items.find(item => item.key === 'page:t_mood.md').risk,
    { kind: 'clinical', level: 'high' });
  assert.deepEqual(items.find(item => item.key === 'tool:mse.html').risk,
    { kind: 'local-policy', level: 'moderate' });
  // Questions carry no ledger risk; normalization never invents one.
  assert.equal(items.find(item => item.key === 'question:qb_moo_001').risk, null);
  assert.deepEqual(filterReviewItems(items, {
    search: 'anchor-only', type: 'all', status: 'needs-review',
    category: 'all', gate: 'all', difficulty: 'all',
  }).map(item => item.key), ['question:qb_moo_003']);
  // Free-text search finds a content item by its risk kind — in the raw ledger form
  // and in the space-separated form a reviewer actually reads on screen.
  assert.deepEqual(filterReviewItems(items, {
    search: 'clinical', type: 'all', status: 'all',
    category: 'all', gate: 'all', difficulty: 'all',
  }).map(item => item.key), ['page:t_mood.md']);
  assert.deepEqual(filterReviewItems(items, {
    search: 'local policy', type: 'all', status: 'all',
    category: 'all', gate: 'all', difficulty: 'all',
  }).map(item => item.key), ['tool:mse.html']);
  assert.deepEqual(deriveReviewCounts(items), {
    total: 4, needsReview: 3, complete: 1, page: 1, tool: 1, question: 2,
  });
});

test('isValidReopenReason accepts 1-240 trimmed characters and rejects empty, whitespace-only, or oversized input', () => {
  assert.equal(isValidReopenReason('Needs another look.'), true);
  assert.equal(isValidReopenReason('a'), true);
  assert.equal(isValidReopenReason('a'.repeat(240)), true);
  assert.equal(isValidReopenReason(`  ${'a'.repeat(240)}  `), true,
    'surrounding whitespace does not count toward the 240-character limit');
  assert.equal(isValidReopenReason(''), false);
  assert.equal(isValidReopenReason('   '), false);
  assert.equal(isValidReopenReason('a'.repeat(241)), false);
  assert.equal(isValidReopenReason(undefined), false);
  assert.equal(isValidReopenReason(null), false);
  assert.equal(isValidReopenReason(42), false);
});

test('renders one ordered queue for pages, tools, and questions', async () => {
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
        { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed' },
      ],
      questions: [validDomQuestion()],
    })),
  });

  assert.deepEqual(controller.state.reviewItems.map(item => item.key), [
    'page:t_mood.md', 'tool:mse.html', 'question:qb_moo_902',
  ]);
  for (const id of [
    'review-item-selector',
    'previous-review-item',
    'next-review-item',
    'review-type-filter',
    'review-status-filter',
    'question-filter-disclosure',
    'review-workspace',
    'attestation-rail',
  ]) assert.ok(document.getElementById(id), `Missing unified-shell control ${id}`);

  assert.equal(document.getElementById('tab-qbank'), null);
  assert.equal(document.getElementById('mark-all-content'), null);
  assert.equal(document.elements().some(element => (
    element.getAttribute('role') === 'tablist'
  )), false);
  assert.equal(document.elements().some(element => (
    (element.getAttribute('id') || '').startsWith('batch-')
  )), false);
  assert.doesNotMatch(document.app.textContent, /Attest selected green drafts/);
});

test('shows the selected item identity, type, saved status, view, and question revision', async () => {
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
        { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed' },
      ],
      questions: [validDomQuestion()],
    })),
  });

  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(document.getElementById('selected-item-title').textContent, 'Mood disorders');
  assert.equal(document.getElementById('selected-item-identity').textContent, 't_mood.md');
  assert.match(document.getElementById('selected-item-type').textContent, /Page/);
  assert.match(document.getElementById('selected-item-status').textContent, /Not reviewed/);
  assert.match(document.getElementById('selected-item-view').textContent, /Live deploy/);
  assert.equal(document.getElementById('selected-item-revision'), null);

  const selector = document.getElementById('review-item-selector');
  selector.value = 'question:qb_moo_902';
  await selector.dispatch('change');
  assert.equal(controller.state.selectedKey, 'question:qb_moo_902');
  assert.equal(controller.state.selectedId, 'qb_moo_902');
  assert.equal(document.getElementById('selected-item-title').textContent, 'qb_moo_902');
  assert.equal(document.getElementById('selected-item-identity').textContent, 'qb_moo_902');
  assert.match(document.getElementById('selected-item-type').textContent, /Question/);
  assert.match(document.getElementById('selected-item-status').textContent, /Draft/);
  assert.match(document.getElementById('selected-item-view').textContent, /Live deploy/);
  assert.match(
    document.getElementById('selected-item-revision').textContent,
    new RegExp(validDomQuestion().revision),
  );
});

test('uses visible filtered order for Previous and Next without wrapping', async () => {
  const questions = [
    validDomQuestion({ id: 'qb_moo_901', revision: testRevision('queue-first') }),
    validDomQuestion({ id: 'qb_moo_902', revision: testRevision('queue-second') }),
  ];
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      questions,
      items: [{ slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' }],
    })),
  });

  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(document.getElementById('previous-review-item').disabled, true);
  await document.getElementById('next-review-item').dispatch('click');
  assert.equal(controller.state.selectedKey, 'question:qb_moo_901');
  await document.getElementById('next-review-item').dispatch('click');
  assert.equal(controller.state.selectedKey, 'question:qb_moo_902');
  assert.equal(document.getElementById('next-review-item').disabled, true);
  await document.getElementById('next-review-item').dispatch('click');
  assert.equal(controller.state.selectedKey, 'question:qb_moo_902');
});

test('an empty filter result clears only the review selection and renders the empty workspace', async () => {
  const { controller, document } = await startHarness();
  const installedServer = controller.state.server;

  await setValue(document, 'review-search', 'no matching curriculum item');

  assert.equal(controller.state.selectedKey, null);
  assert.equal(controller.state.selectedId, null);
  assert.equal(controller.state.server, installedServer);
  assert.match(document.getElementById('selected-item-title').textContent, /No items match/);
  assert.match(document.getElementById('review-workspace').textContent, /No review surface/);
  assert.equal(document.getElementById('learner-preview-frame'), null);
});

test('successful loads retain only review holds that still normalize as complete', async () => {
  const heldKey = 'question:qb_moo_902';
  const page = { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' };
  let includeQuestion = true;
  let question = validDomQuestion({ status: 'attested' });
  const fetchImpl = async () => jsonResponse(serverState({
    items: [page],
    questions: includeQuestion ? [question] : [],
  }));
  const { controller } = await startHarness({ fetchImpl });

  controller.state.completedHoldKey = heldKey;
  assert.equal(await controller.load({ silent: true }), true);
  assert.equal(controller.state.completedHoldKey, heldKey);
  assert.equal(controller.state.selectedKey, heldKey);

  question = {
    ...question,
    status: 'draft',
    revision: testRevision('existing-hold-became-incomplete'),
  };
  assert.equal(await controller.load({ silent: true }), true);
  assert.equal(controller.state.completedHoldKey, null);
  assert.equal(controller.state.selectedKey, heldKey);

  question = {
    ...question,
    status: 'attested',
    revision: testRevision('requested-complete-hold'),
  };
  assert.equal(await controller.load({ silent: true, completedHoldKey: heldKey }), true);
  assert.equal(controller.state.completedHoldKey, heldKey);
  assert.equal(controller.state.selectedKey, heldKey);

  question = {
    ...question,
    status: 'draft',
    revision: testRevision('requested-incomplete-hold'),
  };
  assert.equal(await controller.load({ silent: true, completedHoldKey: heldKey }), true);
  assert.equal(controller.state.completedHoldKey, null);
  assert.equal(controller.state.selectedKey, heldKey);

  controller.state.completedHoldKey = heldKey;
  includeQuestion = false;
  assert.equal(await controller.load({ silent: true }), true);
  assert.equal(controller.state.completedHoldKey, null);
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
});

test('cancelling a dirty filter attempt preserves the completed hold and its Next path', async () => {
  const heldKey = 'question:qb_moo_902';
  const question = validDomQuestion({ status: 'attested' });
  const fetchImpl = async () => jsonResponse(serverState({
    items: [{ slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' }],
    questions: [question],
  }));
  const { controller, document } = await startHarness({ fetchImpl });
  controller.state.completedHoldKey = heldKey;
  assert.equal(await controller.load({ silent: true }), true);
  assert.equal(controller.state.selectedKey, heldKey);
  assert.equal(document.getElementById('next-review-item').textContent, 'Next item');
  assert.equal(document.getElementById('next-review-item').disabled, false);

  await document.getElementById('view-edit').dispatch('click');
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;
  const localStem = 'Keep this completed hold while the dirty filter is cancelled?';
  await setValue(document, 'question-stem', localStem);

  const typeFilter = document.getElementById('review-type-filter');
  typeFilter.value = 'page';
  await typeFilter.dispatch('change');
  assert.ok(document.getElementById('unsaved-guard'));
  assert.equal(controller.state.completedHoldKey, heldKey);
  assert.equal(controller.state.selectedKey, heldKey);
  assert.equal(controller.state.editor.stem, localStem);
  assert.ok(document.getElementById('learner-preview-frame') === frame);
  assert.ok(document.getElementById('learner-preview-frame').contentWindow === frameWindow);

  await document.getElementById('unsaved-cancel').dispatch('click');
  assert.equal(controller.state.completedHoldKey, heldKey);
  assert.equal(controller.state.selectedKey, heldKey);
  assert.equal(controller.state.editor.stem, localStem);
  assert.equal(controller.state.queueFilters.type, 'all');
  assert.equal(document.getElementById('review-type-filter').value, 'all');
  assert.match(document.getElementById('review-item-selector').textContent, /qb_moo_902/);
  assert.equal(document.getElementById('next-review-item').textContent, 'Next item');
  assert.equal(document.getElementById('next-review-item').disabled, false);
  assert.equal(document.activeElement?.getAttribute('id'), 'review-type-filter');
  assert.ok(document.getElementById('learner-preview-frame') === frame);
  assert.ok(document.getElementById('learner-preview-frame').contentWindow === frameWindow);
});

test('retained question-filter refresh preserves disclosure, visible focus, and iframe identity', async () => {
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [{ slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' }],
      questions: [validDomQuestion()],
    })),
  });
  const disclosure = document.getElementById('question-filter-disclosure');
  disclosure.open = true;
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;

  await setValue(document, 'filter-question-category', 'mood', 'change');

  const refreshedDisclosure = document.getElementById('question-filter-disclosure');
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(controller.state.queueFilters.category, 'mood');
  assert.equal(refreshedDisclosure.open, true);
  assert.equal(document.activeElement?.getAttribute('id'), 'filter-question-category');
  assert.equal(refreshedDisclosure.contains(document.activeElement), true);
  assert.ok(document.getElementById('learner-preview-frame') === frame);
  assert.ok(document.getElementById('learner-preview-frame').contentWindow === frameWindow);
});

test('targeted queue, reviewer, view, editor, and rail updates keep the learner iframe alive', async () => {
  const { controller, document } = await startHarness({
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const selector = document.getElementById('review-item-selector');
  selector.value = 'question:qb_moo_902';
  await selector.dispatch('change');
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;

  // Attribution is server-derived and read-only in the shell.
  assert.equal(document.getElementById('reviewer-label').textContent, 'Joshua Moss, MD');
  assert.match(document.getElementById('rail-step-confirm').textContent,
    /Reviewer: Joshua Moss, MD/);
  await setValue(document, 'review-search', 'qb_moo_902');
  await document.getElementById('view-edit').dispatch('click');
  await setValue(document, 'question-stem', 'A targeted local edit. What is the diagnosis?');
  await setChecked(document, 'confirm-clinical');

  assert.equal(controller.state.reviewerLabel, 'Joshua Moss, MD');
  assert.equal(document.getElementById('learner-preview-frame'), frame);
  assert.equal(document.getElementById('learner-preview-frame').contentWindow, frameWindow);
  assert.match(document.getElementById('selected-item-view').textContent, /Edit question/);
});

test('Live deploy, Draft preview, and Edit question are the only mutually exclusive question views', async () => {
  const tier2 = {
    q: '<b>Which finding confirms the diagnosis?</b>',
    options: [
      { key: 'A', t: 'Sustained syndrome', c: true },
      { key: 'B', t: 'Fluctuating attention' },
      { key: 'C', t: 'Elevated energy' },
    ],
    why: 'The sustained syndrome is the tier-two discriminator.',
  };
  const exact = validDomQuestion({
    type: 'two-tier',
    stem: '<img src=x onerror=alert(1)> Exact saved stem?',
    options: [
      { key: 'A', t: 'Exact answer A', c: true },
      { key: 'B', t: 'Exact answer B', trap: { name: 'B trap', note: 'B correction' } },
      { key: 'C', t: 'Exact answer C', trap: { name: 'C trap', note: 'C correction' } },
      { key: 'D', t: 'Exact answer D', trap: { name: 'D trap', note: 'D correction' } },
    ],
    why: 'Exact rationale text.',
    pearl: 'Exact teaching pearl.',
    evidence: 'Exact evidence anchor.',
    pages: ['t_mood.md', '<script>source-page</script>'],
    link: { label: 'Exact learning link', href: '?page=t_mood.md' },
    tier2,
  });
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({ question: exact })),
  });
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;
  const viewButtons = document.findAll('button').filter(button => (
    (button.getAttribute('id') || '').startsWith('view-')
  ));
  assert.deepEqual(viewButtons.map(button => button.getAttribute('id')), [
    'view-live', 'view-draft', 'view-edit',
  ]);

  for (const [mode, label] of [
    ['live', 'Live deploy'],
    ['draft', 'Draft preview'],
    ['edit', 'Edit question'],
  ]) {
    await document.getElementById(`view-${mode}`).dispatch('click');
    assert.equal(controller.state.viewMode, mode);
    assert.equal(document.getElementById('selected-item-view').textContent, label);
    for (const candidate of ['live', 'draft', 'edit']) {
      assert.equal(
        document.getElementById(`view-${candidate}`).getAttribute('aria-pressed'),
        String(candidate === mode),
      );
      assert.equal(
        document.getElementById(`question-view-${candidate}`).getAttribute('hidden'),
        candidate === mode ? null : '',
      );
      assert.equal(
        document.getElementById(`question-view-${candidate}`).getAttribute('aria-labelledby'),
        `view-${candidate}`,
      );
    }
    assert.equal(document.getElementById('learner-preview-frame'), frame);
    assert.equal(document.getElementById('learner-preview-frame').contentWindow, frameWindow);
  }

  await document.getElementById('view-draft').dispatch('click');
  const draft = document.getElementById('question-view-draft');
  assert.equal(document.getElementById('draft-preview-title').textContent,
    'Saved Draft preview · Not deployed');
  for (const exactText of [
    exact.stem,
    ...exact.options.map(optionItem => optionItem.t),
    tier2.q,
    ...tier2.options.map(optionItem => optionItem.t),
    tier2.why,
    exact.why,
    exact.pearl,
    exact.evidence,
    ...exact.pages,
    exact.link.label,
    exact.link.href,
  ]) assert.match(draft.textContent, new RegExp(exactText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const draftElements = document.elements().filter(element => draft.contains(element));
  assert.equal(draftElements.filter(element => element.tagName === 'OL').length, 2);
  assert.equal(draftElements.filter(element => (
    element.tagName === 'STRONG' && element.textContent === 'Correct answer'
  )).length, 2);
  assert.equal(draft.contains(frame), false);
  assert.equal(draftElements.some(element => ['IFRAME', 'IMG', 'SCRIPT'].includes(element.tagName)), false);
});

test('the exact saved-revision receipt is explicit, Draft-only, and revoked by edit or reload', async () => {
  let current = validDomQuestion();
  const other = validDomQuestion({
    id: 'qb_moo_903',
    revision: testRevision('other-question'),
    stem: 'A different item must revoke the prior review receipt. What is the diagnosis?',
  });
  const { controller, document, window } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({ questions: [current, other] })),
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const id = current.id;
  const revision = current.revision;
  const frame = document.getElementById('learner-preview-frame');
  await frame.dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  assert.equal(controller.state.reviewedRevisions.has(id), false,
    'Preview readiness must never manufacture a saved-revision receipt.');
  await setChecked(document, 'review-live-preview');
  assert.equal(controller.state.reviewedRevisions.has(id), false,
    'Live review must remain separate from exact saved-revision review.');
  assert.equal(document.getElementById('review-saved-revision').disabled, true);

  // Clean, ready-preview, Draft view, zero dirty fields, revision matching the saved
  // question: this is exactly compoundReviewEligible's gate, so the receipt is now
  // recorded through #review-compound rather than the standalone box.
  await document.getElementById('view-draft').dispatch('click');
  assert.equal(document.getElementById('review-compound').disabled, false);
  await setChecked(document, 'review-compound');
  assert.equal(controller.state.reviewedRevisions.get(id), revision);
  assert.match(controller.state.reviewedRevisions.get(id), /^[0-9a-f]{64}$/);

  await document.getElementById('view-edit').dispatch('click');
  assert.equal(document.getElementById('review-saved-revision').disabled, true);
  await setValue(document, 'question-stem', 'An unsaved local stem must revoke the receipt?');
  assert.equal(controller.state.reviewedRevisions.has(id), false);
  await document.getElementById('view-draft').dispatch('click');
  assert.equal(document.getElementById('draft-preview-title').textContent,
    'Unsaved local preview · Not deployed');
  assert.match(document.getElementById('question-view-draft').textContent,
    /An unsaved local stem must revoke the receipt/);
  assert.equal(document.getElementById('review-saved-revision').disabled, true);

  // Revert restores a clean editor without leaving Draft view, so the item is
  // compound-eligible again the same way it was before the edit dirtied it.
  await document.getElementById('revert-question').dispatch('click');
  assert.equal(controller.state.reviewedRevisions.has(id), false);
  assert.equal(document.getElementById('review-compound').disabled, false);
  await setChecked(document, 'review-compound');
  assert.equal(controller.state.reviewedRevisions.get(id), revision);
  // Batch design (2026-08-04, section A): navigating to ANOTHER item no longer revokes
  // the receipt — it is anchored to the exact saved revision and self-invalidates the
  // moment that revision moves. Edit revocation is pinned above; save/reload revocation
  // below. Navigation persistence is what lets a reviewer accumulate a batch.
  await setValue(document, 'review-item-selector', 'question:qb_moo_903', 'change');
  assert.equal(controller.state.reviewedRevisions.get(id), revision);
  await setValue(document, 'review-item-selector', 'question:qb_moo_902', 'change');
  assert.equal(controller.state.reviewedRevisions.get(id), revision);
  current = { ...current, revision: testRevision('different-reloaded-revision') };
  assert.equal(await controller.load({ silent: true }), true);
  assert.equal(controller.state.original.revision, current.revision);
  assert.equal(controller.state.reviewedRevisions.has(id), false);
});

test('question rail requires separate Live and Draft proof and uses the exact unavailable acknowledgement', async () => {
  const readyHarness = await startHarness({
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const {
    controller: readyController,
    document: readyDocument,
    window: readyWindow,
  } = readyHarness;
  await readyDocument.getElementById('learner-preview-frame').dispatch('load');
  await reportPreviewStatus(readyWindow, readyController, 'ready');
  assert.match(readyDocument.getElementById('rail-step-review').textContent,
    /I reviewed the complete item in the learner view/);
  assert.match(readyDocument.getElementById('rail-step-review').textContent,
    /I reviewed this exact saved revision/);
  await setChecked(readyDocument, 'review-live-preview');
  assert.equal(readyDocument.getElementById('confirm-clinical').disabled, true);
  await confirmCurrentSavedDraft(readyDocument);
  assert.equal(readyDocument.getElementById('confirm-clinical').disabled, false);

  const fallbackHarness = await startHarness({
    tokenFactory: (() => {
      const tokens = ['c'.repeat(32), 'd'.repeat(32)];
      return () => tokens.shift();
    })(),
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const {
    controller: fallbackController,
    document: fallbackDocument,
    window: fallbackWindow,
  } = fallbackHarness;
  await reportPreviewStatus(fallbackWindow, fallbackController, 'error');
  await fallbackDocument.getElementById('retry-preview').dispatch('click');
  await reportPreviewStatus(fallbackWindow, fallbackController, 'error');
  assert.match(fallbackDocument.getElementById('rail-step-review').textContent,
    /The live question is unavailable; I reviewed the saved revision that will be deployed/);
  await setChecked(fallbackDocument, 'ack-live-unavailable');
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    assert.equal(fallbackDocument.getElementById(id).disabled, true);
  }
  await confirmCurrentSavedDraft(fallbackDocument);
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(fallbackDocument, id);
  }
  assert.equal(fallbackDocument.getElementById('attest-current-item').disabled, false);
});

test('editor mutation and Revert revoke review evidence without replacing the preview', async () => {
  const harness = await startHarness({
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const { controller, document, window } = harness;
  const preview = controller.state.preview;
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;
  await frame.dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  await setChecked(document, 'review-live-preview');
  await document.getElementById('view-edit').dispatch('click');
  const previewToken = preview.request.token;
  const previewAttempt = controller.state.previewAttempt;
  const emptyChecks = {
    completeItemReviewed: false,
    liveReviewed: false,
    separateTabReviewed: false,
    liveUnavailableAcknowledged: false,
    accuracy: false,
    interactions: false,
  };
  const seedAllReviewEvidence = () => {
    Object.assign(controller.state.reviewChecks, {
      completeItemReviewed: true,
      liveReviewed: true,
      separateTabReviewed: true,
      liveUnavailableAcknowledged: true,
      accuracy: true,
      interactions: true,
    });
    controller.state.reviewedRevisions.set('qb_moo_902', validDomQuestion().revision);
    controller.state.confirmations.clinical = true;
  };
  const assertEvidenceRevokedAndPreviewPreserved = () => {
    assert.deepEqual(controller.state.reviewChecks, emptyChecks);
    assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);
    assert.equal(controller.state.confirmations.clinical, false);
    assert.equal(controller.state.preview, preview);
    assert.equal(controller.state.preview.request.token, previewToken);
    assert.equal(controller.state.preview.status, 'ready');
    assert.equal(controller.state.previewAttempt, previewAttempt);
    assert.ok(document.getElementById('learner-preview-frame') === frame);
    assert.ok(document.getElementById('learner-preview-frame').contentWindow === frameWindow);
  };

  seedAllReviewEvidence();
  await setValue(document, 'question-stem', 'A local editor mutation must revoke review evidence?');
  assertEvidenceRevokedAndPreviewPreserved();

  seedAllReviewEvidence();
  await document.getElementById('revert-question').dispatch('click');
  assertEvidenceRevokedAndPreviewPreserved();
});

test('preview selection and Retry create exact tokenized routes, fresh iframes, and strict sandbox policy', async () => {
  const tokens = ['0', '1', '2', '3'].map(value => value.repeat(32));
  let tokenIndex = 0;
  const { controller, document, window } = await startHarness({
    tokenFactory: () => tokens[tokenIndex++],
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
        { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
      ],
      questions: [validDomQuestion()],
    })),
  });

  const pagePreview = controller.state.preview;
  const pageFrame = document.getElementById('learner-preview-frame');
  assert.equal(pagePreview.request.url,
    `https://students.example/?page=t_mood.md&reviewKey=page%3At_mood.md&reviewToken=${tokens[0]}`);
  assert.equal(pageFrame.getAttribute('src'), pagePreview.request.url);
  assert.equal(pageFrame.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-forms');
  assert.equal(pageFrame.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(pageFrame.getAttribute('title'), 'Live learner preview for Mood disorders');
  assert.doesNotMatch(pageFrame.getAttribute('sandbox'), /allow-(?:popups|downloads)/);
  assert.equal(pagePreview.frameWindow, pageFrame.contentWindow);
  assert.equal(window.timers.get(pagePreview.timerId).delay, 10_000);

  await pageFrame.dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  assert.equal(document.getElementById('learner-preview-frame'), pageFrame);
  assert.equal(document.getElementById('learner-preview-frame').contentWindow, pageFrame.contentWindow);
  await setChecked(document, 'review-complete-item');
  await setValue(document, 'review-search', 'mood');
  assert.equal(document.getElementById('learner-preview-frame'), pageFrame);
  assert.equal(document.getElementById('learner-preview-frame').contentWindow, pageFrame.contentWindow);
  assert.equal(controller.state.reviewChecks.completeItemReviewed, true);

  await setValue(document, 'review-search', '');
  await setValue(document, 'review-item-selector', 'tool:mse.html', 'change');
  const toolPreview = controller.state.preview;
  const toolFrame = document.getElementById('learner-preview-frame');
  assert.notEqual(toolFrame, pageFrame);
  assert.equal(toolPreview.attempt, 1);
  assert.equal(toolPreview.request.url,
    `https://students.example/?tool=mse.html&reviewKey=tool%3Amse.html&reviewToken=${tokens[1]}`);

  await setValue(document, 'review-item-selector', 'question:qb_moo_902', 'change');
  const questionPreview = controller.state.preview;
  const questionFrame = document.getElementById('learner-preview-frame');
  assert.notEqual(questionFrame, toolFrame);
  assert.equal(questionPreview.attempt, 1);
  assert.equal(questionPreview.request.url,
    `https://students.example/?tool=question-bank-practice.html&reviewItem=qb_moo_902&reviewKey=question%3Aqb_moo_902&reviewToken=${tokens[2]}`);

  await reportPreviewStatus(window, controller, 'error');
  const priorTimer = questionPreview.timerId;
  await document.getElementById('retry-preview').dispatch('click');
  const retryPreview = controller.state.preview;
  const retryFrame = document.getElementById('learner-preview-frame');
  assert.equal(retryPreview.attempt, 2);
  assert.equal(retryPreview.request.token, tokens[3]);
  assert.notEqual(retryPreview.request.url, questionPreview.request.url);
  assert.notEqual(retryFrame, questionFrame);
  assert.notEqual(retryPreview.timerId, priorTimer);
  assert.equal(window.timers.get(retryPreview.timerId).delay, 10_000);
});

test('preview iframe load, timeout, and error become honest focusable fallback states', async () => {
  const tokens = ['4', '5', '6'].map(value => value.repeat(32));
  let tokenIndex = 0;
  const { controller, document, window } = await startHarness({
    tokenFactory: () => tokens[tokenIndex++],
    fetchImpl: async () => jsonResponse(serverState({ items: [], questions: [validDomQuestion()] })),
  });

  const noLoad = controller.state.preview;
  const noLoadFrame = document.getElementById('learner-preview-frame');
  await document.getElementById('view-edit').dispatch('click');
  assert.equal(document.getElementById('question-view-live').getAttribute('hidden'), '');
  runPreviewTimer(window, noLoad);
  assert.equal(noLoad.status, 'frame_failure');
  assert.match(document.getElementById('preview-status').textContent,
    /Network or embedded-preview failure/);
  assert.match(document.getElementById('preview-status').textContent,
    /did not load reliably, or it changed or reloaded after verification/);
  assert.equal(document.getElementById('preview-status').getAttribute('tabindex'), '-1');
  assert.equal(document.activeElement?.getAttribute('id'), 'preview-status');
  // Step D (2026-08-04 batch design, carried from #310): the timeout fired while Edit
  // was active, so the failure is recorded and announced but the reviewer's view is
  // LEFT ALONE — no forced flip back to Live, no acknowledgement wipe mid-work. The
  // protocol_unavailable stage below runs from the Live view and keeps proving that the
  // reset still happens when nobody is mid-edit.
  assert.equal(document.getElementById('question-view-live').getAttribute('hidden'), '');
  assert.equal(document.getElementById('question-view-edit').getAttribute('hidden'), null);
  await document.getElementById('view-live').dispatch('click');
  assert.equal(document.getElementById('question-view-live').getAttribute('hidden'), null);
  assert.equal(document.getElementById('ack-live-unavailable').disabled, true);

  await document.getElementById('retry-preview').dispatch('click');
  const loadedWithoutProtocol = controller.state.preview;
  const loadedFrame = document.getElementById('learner-preview-frame');
  assert.equal(loadedWithoutProtocol.request.token, tokens[1]);
  assert.notEqual(loadedFrame, noLoadFrame);
  await loadedFrame.dispatch('load');
  assert.equal(loadedWithoutProtocol.frameLoaded, true);
  assert.equal(loadedWithoutProtocol.status, 'loading');
  runPreviewTimer(window, loadedWithoutProtocol);
  assert.equal(loadedWithoutProtocol.status, 'protocol_unavailable');
  assert.match(document.getElementById('preview-status').textContent,
    /Preview protocol unavailable/);
  assert.equal(document.activeElement?.getAttribute('id'), 'preview-status');
  assert.equal(document.getElementById('ack-live-unavailable').disabled, false);

  await document.getElementById('retry-preview').dispatch('click');
  const errored = controller.state.preview;
  const erroredFrame = document.getElementById('learner-preview-frame');
  assert.equal(errored.request.token, tokens[2]);
  assert.notEqual(erroredFrame, loadedFrame);
  const errorTimer = errored.timerId;
  await erroredFrame.dispatch('error');
  assert.equal(errored.status, 'frame_failure');
  assert.equal(window.timers.has(errorTimer), false);
  assert.match(document.getElementById('preview-status').textContent,
    /Network or embedded-preview failure/);
  assert.equal(document.getElementById('ack-live-unavailable').disabled, false);
});

test('preview spoofing and stale messages remain Loading until the current typed proof or timeout', async () => {
  const tokens = ['7', '8'].map(value => value.repeat(32));
  let tokenIndex = 0;
  const { controller, document, window } = await startHarness({
    tokenFactory: () => tokens[tokenIndex++],
    fetchImpl: async () => jsonResponse(serverState({
      items: [{ slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' }],
      questions: [validDomQuestion()],
    })),
  });
  const prior = controller.state.preview;
  const priorFrame = document.getElementById('learner-preview-frame');
  const priorTimer = window.timers.get(prior.timerId);

  await setValue(document, 'review-item-selector', 'question:qb_moo_902', 'change');
  const current = controller.state.preview;
  const currentFrame = document.getElementById('learner-preview-frame');
  priorTimer.callback();
  await priorFrame.dispatch('load');
  await priorFrame.dispatch('error');
  assert.equal(current.status, 'loading');
  assert.ok(window.timers.has(current.timerId));
  await currentFrame.dispatch('load');

  const candidates = [
    previewStatusEvent(current, 'ready', { event: { origin: 'https://evil.example' } }),
    previewStatusEvent(current, 'ready', { event: { source: priorFrame.contentWindow } }),
    previewStatusEvent(current, 'ready', { data: { reviewKey: 'question:qb_other_001' } }),
    previewStatusEvent(current, 'ready', { data: { reviewToken: 'f'.repeat(32) } }),
    previewStatusEvent(current, 'ready', { data: { surface: 'page' } }),
    previewStatusEvent(current, 'ready', { data: { extra: 'reject this shape' } }),
    previewStatusEvent(prior, 'ready'),
  ];
  for (const candidate of candidates) {
    await window.dispatch('message', candidate);
    assert.equal(current.status, 'loading');
    assert.ok(window.timers.has(current.timerId));
    assert.match(document.getElementById('preview-status').textContent, /Loading/);
  }

  runPreviewTimer(window, current);
  assert.equal(current.status, 'protocol_unavailable');
  assert.equal(controller.state.reviewChecks.liveReviewed, false);
});

test('preview Ready preserves its browsing context and later status or navigation revokes review evidence', async () => {
  const tokens = ['9', 'a', 'b'].map(value => value.repeat(32));
  let tokenIndex = 0;
  const { controller, document, window } = await startHarness({
    tokenFactory: () => tokens[tokenIndex++],
    fetchImpl: async () => jsonResponse(serverState({ items: [], questions: [validDomQuestion()] })),
  });

  const preview = controller.state.preview;
  const timerId = preview.timerId;
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;
  await frame.dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  assert.equal(preview.status, 'ready');
  assert.equal(window.timers.has(timerId), false);
  assert.equal(document.getElementById('learner-preview-frame'), frame);
  assert.equal(document.getElementById('learner-preview-frame').contentWindow, frameWindow);
  assert.match(document.getElementById('preview-status').textContent, /Ready/);

  await setChecked(document, 'review-live-preview');
  assert.equal(controller.state.reviewChecks.liveReviewed, true);
  assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);
  await confirmCurrentSavedDraft(document);
  assert.equal(controller.state.reviewedRevisions.get('qb_moo_902'), validDomQuestion().revision);
  await reportPreviewStatus(window, controller, 'ready');
  assert.equal(controller.state.reviewChecks.liveReviewed, true,
    'A duplicate Ready must not erase valid review evidence.');
  assert.equal(document.getElementById('learner-preview-frame'), frame);

  await reportPreviewStatus(window, controller, 'error');
  assert.equal(preview.status, 'error');
  assert.equal(controller.state.reviewChecks.liveReviewed, false);
  assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);
  assert.equal(document.getElementById('attest-current-item').disabled, true);

  await document.getElementById('retry-preview').dispatch('click');
  const notFoundRetry = controller.state.preview;
  const notFoundFrame = document.getElementById('learner-preview-frame');
  await notFoundFrame.dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  await setChecked(document, 'review-live-preview');
  await confirmCurrentSavedDraft(document);
  await reportPreviewStatus(window, controller, 'not_found');
  assert.equal(notFoundRetry.status, 'not_found');
  assert.equal(controller.state.reviewChecks.liveReviewed, false);
  assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);

  await document.getElementById('retry-preview').dispatch('click');
  const navigationRetry = controller.state.preview;
  const navigationFrame = document.getElementById('learner-preview-frame');
  await navigationFrame.dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  await setChecked(document, 'review-live-preview');
  await confirmCurrentSavedDraft(document);
  await navigationFrame.dispatch('load');
  assert.equal(navigationRetry.status, 'frame_failure');
  assert.equal(controller.state.reviewChecks.liveReviewed, false);
  assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);
  assert.equal(document.getElementById('attest-current-item').disabled, true);
});

test('preview fallback gates question Retry and opens only clean page or tool routes externally', async () => {
  const questionTokens = ['b', 'c'].map(value => value.repeat(32));
  let questionTokenIndex = 0;
  const questionHarness = await startHarness({
    tokenFactory: () => questionTokens[questionTokenIndex++],
    fetchImpl: async () => jsonResponse(serverState({ items: [], questions: [validDomQuestion()] })),
  });
  const { controller: questionController, document: questionDocument, window: questionWindow } = questionHarness;

  await reportPreviewStatus(questionWindow, questionController, 'error');
  assert.equal(questionDocument.getElementById('ack-live-unavailable').disabled, true);
  assert.equal(questionDocument.getElementById('open-full-page'), null);
  assert.equal(questionDocument.getElementById('review-separate-tab'), null);
  await questionDocument.getElementById('retry-preview').dispatch('click');
  await reportPreviewStatus(questionWindow, questionController, 'error');
  assert.equal(questionDocument.getElementById('ack-live-unavailable').disabled, false);
  await confirmCurrentSavedDraft(questionDocument);
  await setChecked(questionDocument, 'ack-live-unavailable');
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(questionDocument, id);
  }
  assert.equal(questionDocument.getElementById('attest-current-item').disabled, false);

  const notFoundHarness = await startHarness({
    tokenFactory: () => 'd'.repeat(32),
    fetchImpl: async () => jsonResponse(serverState({ items: [], questions: [validDomQuestion()] })),
  });
  await reportPreviewStatus(notFoundHarness.window, notFoundHarness.controller, 'not_found');
  assert.equal(notFoundHarness.document.getElementById('ack-live-unavailable').disabled, false,
    'Exact Question Not found can use the deployment-lag acknowledgement on attempt one.');

  const externalCalls = [];
  const contentTokens = ['e', 'f', '0'].map(value => value.repeat(32));
  let contentTokenIndex = 0;
  const contentHarness = await startHarness({
    tokenFactory: () => contentTokens[contentTokenIndex++],
    openExternal: (...args) => { externalCalls.push(args); },
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
        { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
      ],
      questions: [],
    })),
  });
  const { controller: contentController, document: contentDocument, window: contentWindow } = contentHarness;

  assert.equal(contentDocument.getElementById('review-separate-tab'), null);
  await reportPreviewStatus(contentWindow, contentController, 'error');
  assert.ok(contentDocument.getElementById('retry-preview'));
  assert.ok(contentDocument.getElementById('open-full-page'));
  assert.ok(contentDocument.getElementById('review-separate-tab'));
  assert.equal(contentDocument.getElementById('review-separate-tab').disabled, true);
  await contentDocument.getElementById('open-full-page').dispatch('click');
  assert.equal(contentDocument.getElementById('review-separate-tab').disabled, false);
  assert.deepEqual(externalCalls[0], [
    'https://students.example/?page=t_mood.md',
    '_blank',
    'noopener,noreferrer',
  ]);
  for (const [url] of externalCalls) {
    assert.equal(url.includes('reviewKey'), false);
    assert.equal(url.includes('reviewToken'), false);
    assert.equal(url.includes('faculty'), false);
    assert.equal(url.includes('test-faculty-key'), false);
  }
  await setChecked(contentDocument, 'review-separate-tab');
  await setChecked(contentDocument, 'review-content-accuracy');
  await setChecked(contentDocument, 'review-content-interactions');
  assert.equal(contentDocument.getElementById('attest-current-item').disabled, false);

  await contentDocument.getElementById('retry-preview').dispatch('click');
  const pageReadyFrame = contentDocument.getElementById('learner-preview-frame');
  await pageReadyFrame.dispatch('load');
  await reportPreviewStatus(contentWindow, contentController, 'ready');
  await setChecked(contentDocument, 'review-complete-item');
  await setChecked(contentDocument, 'review-content-accuracy');
  await setChecked(contentDocument, 'review-content-interactions');
  await reportPreviewStatus(contentWindow, contentController, 'not_found');
  assert.equal(contentController.state.reviewChecks.completeItemReviewed, false);
  assert.equal(contentController.state.reviewChecks.separateTabReviewed, false);
  assert.equal(contentController.state.reviewChecks.accuracy, false);
  assert.equal(contentController.state.reviewChecks.interactions, false);
  assert.equal(contentDocument.getElementById('attest-current-item').disabled, true);

  await setValue(contentDocument, 'review-item-selector', 'tool:mse.html', 'change');
  await reportPreviewStatus(contentWindow, contentController, 'error');
  await contentDocument.getElementById('open-full-page').dispatch('click');
  assert.deepEqual(externalCalls[1], [
    'https://students.example/?tool=mse.html',
    '_blank',
    'noopener,noreferrer',
  ]);
});

test('terminal preview fallback revokes question evidence after a current-frame reload', async () => {
  const tokens = ['1', '2'].map(value => value.repeat(32));
  let tokenIndex = 0;
  const { controller, document, window } = await startHarness({
    tokenFactory: () => tokens[tokenIndex++],
    fetchImpl: async () => jsonResponse(serverState({ items: [], questions: [validDomQuestion()] })),
  });

  await reportPreviewStatus(window, controller, 'error');
  await document.getElementById('retry-preview').dispatch('click');
  const preview = controller.state.preview;
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;
  const timerId = preview.timerId;
  await frame.dispatch('load');
  runPreviewTimer(window, preview);
  assert.equal(preview.status, 'protocol_unavailable');
  await confirmCurrentSavedDraft(document);
  await setChecked(document, 'ack-live-unavailable');
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  assert.equal(document.getElementById('attest-current-item').disabled, false);
  assert.equal(controller.state.reviewedRevisions.get('qb_moo_902'), validDomQuestion().revision);
  await document.getElementById('view-edit').dispatch('click');

  await frame.dispatch('load');

  assert.equal(preview.status, 'frame_failure');
  assert.equal(preview.timerId, null);
  assert.equal(window.timers.has(timerId), false);
  assert.equal(document.getElementById('learner-preview-frame'), frame);
  assert.equal(document.getElementById('learner-preview-frame').contentWindow, frameWindow);
  assert.deepEqual(controller.state.reviewChecks, {
    completeItemReviewed: false,
    liveReviewed: false,
    separateTabReviewed: false,
    liveUnavailableAcknowledged: false,
    accuracy: false,
    interactions: false,
  });
  assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);
  assert.equal(document.getElementById('attest-current-item').disabled, true);
  assert.equal(document.getElementById('question-view-live').getAttribute('hidden'), null);
  assert.equal(document.getElementById('selected-item-view').textContent, 'Live deploy');
  assert.equal(document.activeElement?.getAttribute('id'), 'preview-status');
  assert.match(document.getElementById('preview-status').textContent,
    /Network or embedded-preview failure/);
});

test('terminal preview fallback revokes question evidence on a late first load after timeout', async () => {
  const tokens = ['3', '4'].map(value => value.repeat(32));
  let tokenIndex = 0;
  const { controller, document, window } = await startHarness({
    tokenFactory: () => tokens[tokenIndex++],
    fetchImpl: async () => jsonResponse(serverState({ items: [], questions: [validDomQuestion()] })),
  });

  runPreviewTimer(window, controller.state.preview);
  await document.getElementById('retry-preview').dispatch('click');
  const preview = controller.state.preview;
  const frame = document.getElementById('learner-preview-frame');
  const timerId = preview.timerId;
  runPreviewTimer(window, preview);
  assert.equal(preview.status, 'frame_failure');
  assert.equal(preview.loadCount, 0);
  await confirmCurrentSavedDraft(document);
  await setChecked(document, 'ack-live-unavailable');
  assert.equal(controller.state.reviewChecks.liveUnavailableAcknowledged, true);
  assert.equal(controller.state.reviewedRevisions.get('qb_moo_902'), validDomQuestion().revision);
  await document.getElementById('view-edit').dispatch('click');

  await frame.dispatch('load');

  assert.equal(preview.status, 'frame_failure');
  assert.equal(preview.timerId, null);
  assert.equal(window.timers.has(timerId), false);
  assert.equal(document.getElementById('learner-preview-frame'), frame);
  assert.deepEqual(controller.state.reviewChecks, {
    completeItemReviewed: false,
    liveReviewed: false,
    separateTabReviewed: false,
    liveUnavailableAcknowledged: false,
    accuracy: false,
    interactions: false,
  });
  assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);
  assert.equal(document.getElementById('question-view-live').getAttribute('hidden'), null);
  assert.equal(document.activeElement?.getAttribute('id'), 'preview-status');
});

test('terminal preview fallback revokes page and tool checks after a current-frame error', async () => {
  const { controller, document, window } = await startHarness({
    tokenFactory: () => '5'.repeat(32),
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
        { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
      ],
      questions: [],
    })),
  });

  for (const [key, expectedType] of [
    ['page:t_mood.md', 'Page'],
    ['tool:mse.html', 'Tool'],
  ]) {
    await setValue(document, 'review-item-selector', key, 'change');
    const preview = controller.state.preview;
    const frame = document.getElementById('learner-preview-frame');
    const frameWindow = frame.contentWindow;
    await reportPreviewStatus(window, controller, 'not_found');
    await document.getElementById('open-full-page').dispatch('click');
    for (const id of [
      'review-separate-tab',
      'review-content-accuracy',
      'review-content-interactions',
    ]) {
      await setChecked(document, id);
    }
    assert.equal(document.getElementById('attest-current-item').disabled, false);

    await frame.dispatch('error');

    assert.equal(preview.status, 'frame_failure', `${expectedType} should record a frame failure.`);
    assert.equal(document.getElementById('learner-preview-frame'), frame);
    assert.equal(document.getElementById('learner-preview-frame').contentWindow, frameWindow);
    assert.deepEqual(controller.state.reviewChecks, {
      completeItemReviewed: false,
      liveReviewed: false,
      separateTabReviewed: false,
      liveUnavailableAcknowledged: false,
      accuracy: false,
      interactions: false,
    });
    assert.equal(document.getElementById('attest-current-item').disabled, true);
    assert.equal(document.activeElement?.getAttribute('id'), 'preview-status');
    assert.match(document.getElementById('preview-status').textContent,
      /Network or embedded-preview failure/);
  }
});

test('preview repository reload resets attempts and all review acknowledgements', async () => {
  const tokens = ['1', '2'].map(value => value.repeat(32));
  let tokenIndex = 0;
  const harness = await startHarness({
    tokenFactory: () => tokens[tokenIndex++],
    fetchImpl: async () => jsonResponse(serverState({ items: [], questions: [validDomQuestion()] })),
  });
  const { controller, document, window } = harness;
  const firstFrame = document.getElementById('learner-preview-frame');
  await firstFrame.dispatch('load');
  await reportPreviewStatus(window, controller, 'ready');
  await setChecked(document, 'review-live-preview');
  await confirmCurrentSavedDraft(document);
  await setChecked(document, 'confirm-clinical');
  assert.equal(controller.state.reviewChecks.liveReviewed, true);
  assert.equal(controller.state.confirmations.clinical, true);

  assert.equal(await controller.load({ silent: true }), true);
  assert.equal(controller.state.preview.attempt, 1);
  assert.equal(controller.state.preview.request.token, tokens[1]);
  assert.equal(controller.state.preview.status, 'loading');
  assert.equal(controller.state.reviewChecks.liveReviewed, false);
  assert.equal(controller.state.confirmations.clinical, false);
  assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);
  assert.notEqual(document.getElementById('learner-preview-frame'), firstFrame);
});

test('preview save and conflict cancel the active load and clear preview acknowledgements', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      return jsonResponse({
        error: { code: 'qbank.conflict', message: 'The saved question changed.' },
      }, { ok: false, status: 409 });
    }
    return jsonResponse(serverState({ items: [], questions: [validDomQuestion()] }));
  };
  const { controller, document, window } = await startHarness({
    tokenFactory: () => '3'.repeat(32),
    fetchImpl,
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const preview = controller.state.preview;
  const timerId = preview.timerId;
  assert.ok(window.timers.has(timerId));
  await setValue(document, 'question-stem', 'A changed saved Draft that will conflict?');

  await document.getElementById('save-draft').dispatch('click');
  await flushAsyncWork();

  assert.equal(window.timers.has(timerId), false);
  assert.equal(controller.state.preview, null);
  assert.equal(controller.state.previewAttempt, 0);
  assert.deepEqual(controller.state.reviewChecks, {
    completeItemReviewed: false,
    liveReviewed: false,
    separateTabReviewed: false,
    liveUnavailableAcknowledged: false,
    accuracy: false,
    interactions: false,
  });
  assert.ok(document.getElementById('qbank-conflict'));
  assert.equal(document.getElementById('learner-preview-frame'), null);
});

test('normalizes the learner base before installing state and preserves prior state on failure', async () => {
  let payload = serverState();
  payload.student = 'https://students.example/course/?old=1#fragment';
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(payload),
  });
  const installed = controller.state.server;
  assert.equal(installed.student, 'https://students.example/course/');

  payload = { ...serverState(), student: 'javascript:alert(1)' };
  assert.equal(await controller.load(), false);
  assert.equal(controller.state.server, installed);
  assert.match(document.app.textContent, /incomplete state/i);
});

test('an assessment exception renders a blocker and prevents confirmation', async () => {
  const harness = await startHarness({
    assessItemImpl: () => { throw new Error('synthetic assessor failure'); },
  });
  const { document } = harness;

  assert.match(document.app.textContent, /Automated checks could not run/);
  assert.match(document.getElementById('attestation-rail').textContent, /Blocked/);
  assert.equal(document.getElementById('confirm-clinical').disabled, true);
});

test('renders every v1 editor field safely and switches conditional question controls', async () => {
  const unsafe = '<img src=x onerror=alert(1)> What is the diagnosis?';
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      question: validDomQuestion({
        stem: unsafe,
        v2: { reserved: '<script>not markup</script>' },
        systemNote: 'preserve me',
      }),
    })),
  });

  for (const id of [
    'question-id',
    'question-type',
    'question-category',
    'competency-dx',
    'question-difficulty',
    'question-high-yield',
    'question-pages',
    'question-link-label',
    'question-link-href',
    'question-stem',
    'option-A-text',
    'option-B-text',
    'option-C-text',
    'option-D-text',
    'correct-A',
    'correct-B',
    'correct-C',
    'correct-D',
    'option-B-trap-name',
    'option-B-trap-note',
    'question-why',
    'question-pearl',
    'question-evidence',
    'changed-fields',
    'safety-issues',
  ]) assert.ok(document.getElementById(id), `Missing editor control ${id}`);

  assert.equal(document.getElementById('question-id').readOnly, true);
  assert.equal(document.getElementById('option-A-key').readOnly, true);
  assert.equal(document.getElementById('correct-A').getAttribute('name'), 'correct-key');
  assert.equal(document.getElementById('option-A-trap-name'), null);
  assert.equal(document.getElementById('question-subtype'), null);
  assert.equal(document.getElementById('tier2-question'), null);
  assert.equal(document.findAll('img').length, 0);
  assert.equal(document.getElementById('question-stem').value, unsafe);
  assert.match(document.app.textContent, /Reserved v2 data is preserved and read-only/);

  await setValue(document, 'question-type', 'relational', 'change');
  assert.ok(document.getElementById('question-subtype'));
  assert.equal(document.getElementById('tier2-question'), null);
  assert.equal(controller.state.editor.type, 'relational');
  assert.equal(Object.hasOwn(controller.state.editor, 'tier2'), false);

  await setValue(document, 'question-type', 'two-tier', 'change');
  assert.equal(document.getElementById('question-subtype'), null);
  for (const id of [
    'tier2-question',
    'tier2-option-A-text',
    'tier2-option-B-text',
    'tier2-option-C-text',
    'tier2-option-D-text',
    'tier2-correct-A',
    'tier2-correct-B',
    'tier2-correct-C',
    'tier2-correct-D',
    'tier2-why',
  ]) assert.ok(document.getElementById(id), `Missing two-tier control ${id}`);
  assert.equal(Object.hasOwn(controller.state.editor, 'subtype'), false);

  await setChecked(document, 'correct-B');
  assert.equal(document.getElementById('option-B-trap-name'), null);
  assert.ok(document.getElementById('option-A-trap-name'));
  assert.equal(controller.state.editor.options.find(option => option.key === 'B').c, true);
  assert.equal(Object.hasOwn(
    controller.state.editor.options.find(option => option.key === 'A'),
    'c',
  ), false);
  assert.equal(controller.state.editor.v2.reserved, '<script>not markup</script>');
  assert.equal(controller.state.editor.systemNote, 'preserve me');

  await setValue(document, 'question-pages', 't_mood.md, psychopharm_primer.md\n t_mood.md');
  assert.deepEqual(controller.state.editor.pages, ['t_mood.md', 'psychopharm_primer.md']);
  await setChecked(document, 'competency-safety');
  assert.deepEqual(controller.state.editor.competency.sort(), ['dx', 'safety']);
});

test('stem-only edits preserve competency order and unknown nested link and trap metadata', async () => {
  const original = validDomQuestion({
    competency: ['safety', 'dx'],
    link: {
      label: 'Open Mood Disorders',
      href: '?page=t_mood.md',
      future: { provenance: 'preserve-link-metadata' },
    },
    options: validDomQuestion().options.map(optionItem => (
      optionItem.key === 'B'
        ? {
          ...optionItem,
          trap: {
            ...optionItem.trap,
            future: { reviewerHint: 'preserve-trap-metadata' },
          },
        }
        : optionItem
    )),
  });
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({ question: original })),
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });

  await setValue(document, 'question-stem', 'A stem-only edit should preserve model order. What is the diagnosis?');
  assert.deepEqual(controller.state.editor.competency, ['safety', 'dx']);
  assert.deepEqual(controller.state.dirtyFields, ['stem']);
  assert.equal(controller.state.editor.link.future.provenance, 'preserve-link-metadata');
  assert.equal(
    controller.state.editor.options.find(optionItem => optionItem.key === 'B').trap.future.reviewerHint,
    'preserve-trap-metadata',
  );

  await setChecked(document, 'competency-pharm');
  assert.deepEqual(controller.state.editor.competency, ['safety', 'dx', 'pharm']);
});

test('three-option tier two round-trips and exposes explicit add and remove fourth controls', async () => {
  const tier2 = {
    q: 'Which finding best supports that diagnosis?',
    future: { sourceVersion: 'preserve-tier-metadata' },
    options: [
      { key: 'A', t: 'Sustained syndrome', c: true, future: { rank: 1 } },
      { key: 'B', t: 'Fluctuating attention', future: { rank: 2 } },
      { key: 'C', t: 'Elevated energy', future: { rank: 3 } },
    ],
    why: 'The duration and syndrome threshold distinguish the diagnosis.',
  };
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      question: validDomQuestion({ type: 'two-tier', tier2 }),
    })),
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });

  assert.ok(document.getElementById('tier2-option-C-text'));
  assert.equal(Boolean(document.getElementById('tier2-option-D-text')), false);
  assert.ok(document.getElementById('add-tier2-option-d'));
  assert.equal(Boolean(document.getElementById('remove-tier2-option-d')), false);

  await setValue(document, 'tier2-option-B-text', 'Fluctuating attention and awareness');
  assert.equal(controller.state.editor.tier2.options.length, 3);
  assert.equal(controller.state.editor.tier2.future.sourceVersion, 'preserve-tier-metadata');
  assert.equal(controller.state.editor.tier2.options[1].future.rank, 2);

  await document.getElementById('add-tier2-option-d').dispatch('click');
  assert.equal(controller.state.editor.tier2.options.length, 4);
  assert.ok(document.getElementById('tier2-option-D-text'));
  assert.ok(document.getElementById('remove-tier2-option-d'));

  await setValue(document, 'tier2-option-D-text', 'A fourth explicit rationale option');
  await document.getElementById('remove-tier2-option-d').dispatch('click');
  assert.equal(controller.state.editor.tier2.options.length, 3);
  assert.equal(Boolean(document.getElementById('tier2-option-D-text')), false);
  assert.ok(document.getElementById('add-tier2-option-d'));
});

test('noncanonical three-option tier two preserves its actual keys when editing and adding the missing fourth', async () => {
  const tier2 = {
    q: 'Which finding best supports that diagnosis?',
    future: { sourceVersion: 'preserve-noncanonical-tier' },
    options: [
      { key: 'A', t: 'Sustained syndrome', future: { rank: 1 } },
      { key: 'B', t: 'Fluctuating attention', future: { rank: 2 } },
      { key: 'D', t: 'Threshold crossing', c: true, future: { rank: 4 } },
    ],
    why: 'The threshold-crossing finding distinguishes the diagnosis.',
  };
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      question: validDomQuestion({ type: 'two-tier', tier2 }),
    })),
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });

  assert.deepEqual(controller.state.editor.tier2.options.map(optionItem => optionItem.key), ['A', 'B', 'D']);
  assert.ok(document.getElementById('tier2-option-D-text'));
  assert.equal(Boolean(document.getElementById('tier2-option-C-text')), false);
  assert.ok(document.getElementById('add-tier2-option-c'));

  await setValue(document, 'tier2-option-D-text', 'A revised threshold-crossing finding');
  assert.deepEqual(controller.state.editor.tier2.options.map(optionItem => optionItem.key), ['A', 'B', 'D']);
  assert.equal(controller.state.editor.tier2.options[2].future.rank, 4);
  assert.equal(controller.state.editor.tier2.options[2].c, true);
  assert.equal(controller.state.editor.tier2.future.sourceVersion, 'preserve-noncanonical-tier');

  await document.getElementById('add-tier2-option-c').dispatch('click');
  assert.deepEqual(controller.state.editor.tier2.options.map(optionItem => optionItem.key), ['A', 'B', 'D', 'C']);
  assert.equal(controller.state.editor.tier2.options.filter(optionItem => optionItem.key === 'D').length, 1);
  assert.ok(document.getElementById('tier2-option-C-text'));
  assert.ok(document.getElementById('remove-tier2-option-d'));

  await document.getElementById('remove-tier2-option-d').dispatch('click');
  assert.deepEqual(controller.state.editor.tier2.options.map(optionItem => optionItem.key), ['A', 'B', 'D']);
  assert.equal(controller.state.editor.tier2.options[2].c, true);
  assert.equal(Boolean(document.getElementById('tier2-option-C-text')), false);
  assert.ok(document.getElementById('add-tier2-option-c'));
});

test('rebuilds the candidate immediately, shows blockers before warnings, and marks dirty checks stale', async () => {
  const assessItemImpl = item => {
    const stem = typeof item?.stem === 'string' ? item.stem : '';
    const blockers = stem
      ? []
      : [{ code: 'required.stem', field: 'stem', message: 'Question stem is required.' }];
    const warnings = stem.includes('warning')
      ? [{ code: 'stem.synthetic_warning', field: 'stem', message: 'Review this synthetic warning.' }]
      : [];
    return {
      gate: blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ready',
      blockers,
      warnings,
    };
  };
  const { controller, document, window, requests } = await startHarness({ assessItemImpl });
  controller.state.confirmations.clinical = true;

  await setValue(document, 'question-stem', '');
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 0);
  assert.equal(controller.state.editor.stem, '');
  assert.deepEqual(controller.state.dirtyFields, ['stem']);
  assert.equal(controller.state.confirmations.clinical, false);
  assert.match(document.getElementById('changed-fields').textContent, /stem/);
  assert.match(document.getElementById('safety-issues').textContent, /Question stem is required/);
  assert.match(document.app.textContent, /Checks are local and stale until this draft is saved and reloaded/);
  assert.equal(document.getElementById('save-draft').disabled, true);
  const blockedStem = document.getElementById('question-stem');
  assert.equal(blockedStem.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(attributeTokens(blockedStem, 'aria-describedby'), [
    'issue-blocked-required-stem-stem',
  ]);
  const blockerDescription = document.getElementById('issue-blocked-required-stem-stem');
  assert.equal(blockerDescription.tagName, 'LI');
  assert.equal(blockerDescription.textContent, 'stem: Question stem is required.');
  const blockerLink = document.links().find(link => (
    link.getAttribute('href') === '#question-stem'
  ));
  await blockerLink.dispatch('click');
  assert.equal(document.activeElement, blockedStem);
  const beforeUnload = await window.dispatch('beforeunload');
  assert.equal(beforeUnload.defaultPrevented, true);
  assert.equal(beforeUnload.returnValue, '');

  await setValue(document, 'question-stem', 'A warning question?');
  assert.equal(controller.state.localAssessment.gate, 'warning');
  assert.match(document.getElementById('safety-issues').textContent, /Review this synthetic warning/);
  assert.equal(document.getElementById('save-draft').disabled, false);
  assert.equal(document.getElementById('attest-current-item').disabled, true);
  assert.equal(document.links().some(link => link.getAttribute('href') === '#question-stem'), true);
  const warningStem = document.getElementById('question-stem');
  assert.equal(warningStem.getAttribute('aria-invalid'), null);
  assert.deepEqual(attributeTokens(warningStem, 'aria-describedby'), [
    'issue-warning-stem-synthetic_warning-stem',
  ]);
  assert.equal(
    document.getElementById('issue-warning-stem-synthetic_warning-stem').textContent,
    'stem: Review this synthetic warning.',
  );

  await document.getElementById('revert-question').dispatch('click');
  assert.deepEqual(controller.state.dirtyFields, []);
  assert.equal(document.getElementById('question-stem').value, validDomQuestion().stem);
  assert.equal(document.getElementById('question-stem').getAttribute('aria-invalid'), null);
  assert.deepEqual(attributeTokens(document.getElementById('question-stem'), 'aria-describedby'), []);
  assert.match(document.app.textContent, /Checks current for the saved repository version/);
});

test('input rerenders preserve the exact caret range and direction during mid-string edits', async () => {
  const { controller, document } = await startHarness({
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const stem = document.getElementById('question-stem');
  stem.value = `${stem.value.slice(0, 12)}carefully ${stem.value.slice(12)}`;
  stem.setSelectionRange(5, 17, 'backward');
  await stem.dispatch('input');

  const rerendered = document.getElementById('question-stem');
  assert.equal(controller.state.editor.stem.includes('carefully'), true);
  assert.equal(rerendered.selectionStart, 5);
  assert.equal(rerendered.selectionEnd, 17);
  assert.equal(rerendered.selectionDirection, 'backward');
});

test('dirty state takes sign-off precedence for an edited attested item', async () => {
  const { document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      question: validDomQuestion({ status: 'attested' }),
    })),
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  await setValue(document, 'review-status-filter', 'all', 'change');
  await setValue(document, 'review-item-selector', 'question:qb_moo_902', 'change');
  await setValue(document, 'question-stem', 'An attested item now has a local edit. What is the diagnosis?');

  assert.match(document.getElementById('rail-step-review').className, /current/);
  assert.doesNotMatch(document.getElementById('rail-step-confirm').className, /current/);
});

test('issue descriptions keep semantic IDs across rerenders when several issues share a field', async () => {
  const assessItemImpl = () => ({
    gate: 'blocked',
    blockers: [
      { code: 'stem.first', field: 'stem', message: 'First stem blocker.' },
      { code: 'stem.second', field: 'stem', message: 'Second stem blocker.' },
    ],
    warnings: [
      { code: 'stem.warning', field: 'stem', message: 'Stem warning.' },
      { code: 'stem.warning', field: 'stem', message: 'Second stem warning.' },
    ],
  });
  const { document } = await startHarness({ assessItemImpl });
  const issueLinks = document.links().filter(link => (
    link.getAttribute('href') === '#question-stem'
  ));
  const ids = issueLinks.map(link => link.parentNode.getAttribute('id'));
  assert.equal(issueLinks.length, 4);
  assert.deepEqual(ids, [
    'issue-blocked-stem-first-stem',
    'issue-blocked-stem-second-stem',
    'issue-warning-stem-warning-stem',
    'issue-warning-stem-warning-stem-2',
  ]);
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(attributeTokens(document.getElementById('question-stem'), 'aria-describedby'), ids);
  assert.equal(document.getElementById(ids[0]).textContent, 'stem: First stem blocker.');
  assert.equal(document.getElementById(ids[1]).textContent, 'stem: Second stem blocker.');
  assert.equal(document.getElementById(ids[2]).textContent, 'stem: Stem warning.');
  assert.equal(document.getElementById(ids[3]).textContent, 'stem: Second stem warning.');
  assert.equal(document.getElementById('question-stem').getAttribute('aria-invalid'), 'true');

  await setValue(document, 'question-stem', `${document.getElementById('question-stem').value} Updated`);
  const rerenderedIds = document.links()
    .filter(link => link.getAttribute('href') === '#question-stem')
    .map(link => link.parentNode.getAttribute('id'));
  assert.deepEqual(rerenderedIds, ids);
});

test('maps aggregate, option, tier-two, and global issues to purposeful visible targets', async () => {
  const item = validDomQuestion({
    type: 'two-tier',
    tier2: {
      q: 'Which finding best supports that answer?',
      options: [
        { key: 'A', t: 'Finding one', c: true },
        { key: 'B', t: 'Finding two' },
        { key: 'C', t: 'Finding three' },
      ],
      why: 'Finding one is the best discriminator.',
    },
  });
  const blockers = [
    { code: 'status.enum', field: 'status', message: 'Review the governed status.' },
    { code: 'item.retired', field: 'retired', message: 'This item is retired.' },
    { code: 'competency.count', field: 'competency', message: 'Choose competencies.' },
    { code: 'link.required', field: 'link', message: 'Provide a learning link.' },
    { code: 'options.count', field: 'options', message: 'Review the answer option set.' },
    { code: 'options.text', field: 'options.B.t', message: 'Option B needs text.' },
    { code: 'options.correct_flag', field: 'options.B.c', message: 'Review option B correctness.' },
    { code: 'options.trap', field: 'options.B.trap', message: 'Option B needs trap details.' },
    { code: 'tier2.required', field: 'tier2', message: 'Review tier-two reasoning.' },
    { code: 'tier2.options_count', field: 'tier2.options', message: 'Review tier-two options.' },
    { code: 'tier2.text', field: 'tier2.options.B.t', message: 'Tier-two option B needs text.' },
    { code: 'tier2.correct_flag', field: 'tier2.options.B.c', message: 'Review tier-two option B correctness.' },
    { code: 'tier2.why', field: 'tier2.why', message: 'Tier-two rationale is required.' },
    { code: 'runtime.assessment', message: 'Assessment failed unexpectedly.' },
  ];
  const warnings = [
    { code: 'pages.review', field: 'pages', message: 'Review the source pages.' },
    { code: 'hy.review', field: 'hy', message: 'Review the high-yield flag.' },
    { code: 'link.page_mismatch', field: 'link.href', message: 'Review the link destination.' },
  ];
  const { document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({ question: item })),
    assessItemImpl: () => ({ gate: 'blocked', blockers, warnings }),
  });

  const blockerTargets = new Map([
    ['status.enum', 'question-governed-fields'],
    ['item.retired', 'question-governed-fields'],
    ['competency.count', 'question-competencies'],
    ['link.required', 'question-link-fields'],
    ['options.count', 'question-options'],
    ['options.text', 'option-B-text'],
    ['options.correct_flag', 'correct-B'],
    ['options.trap', 'option-B-trap-name'],
    ['tier2.required', 'question-tier2'],
    ['tier2.options_count', 'question-tier2-options'],
    ['tier2.text', 'tier2-option-B-text'],
    ['tier2.correct_flag', 'tier2-correct-B'],
    ['tier2.why', 'tier2-why'],
  ]);
  for (const issue of blockers.slice(0, -1)) {
    const target = document.getElementById(blockerTargets.get(issue.code));
    assert.ok(target, `Missing issue target for ${issue.field}`);
    const issueId = `issue-blocked-${domId(issue.code)}-${domId(issue.field)}`;
    assert.equal(attributeTokens(target, 'aria-describedby').includes(issueId), true);
    assert.equal(target.getAttribute('aria-invalid'), 'true');
    assert.equal(document.getElementById(issueId).textContent, `${issue.field}: ${issue.message}`);
  }
  assert.deepEqual(
    attributeTokens(document.getElementById('question-governed-fields'), 'aria-describedby'),
    [
      'governed-fields-description',
      'issue-blocked-status-enum-status',
      'issue-blocked-item-retired-retired',
    ],
  );
  assert.ok(document.getElementById('governed-fields-description'));

  const warningTargets = new Map([
    ['pages.review', 'question-pages'],
    ['hy.review', 'question-high-yield'],
    ['link.page_mismatch', 'question-link-href'],
  ]);
  for (const issue of warnings) {
    const target = document.getElementById(warningTargets.get(issue.code));
    const issueId = `issue-warning-${domId(issue.code)}-${domId(issue.field)}`;
    assert.deepEqual(attributeTokens(target, 'aria-describedby'), [issueId]);
    assert.equal(target.getAttribute('aria-invalid'), null);
  }

  for (const id of [
    'question-governed-fields',
    'question-competencies',
    'question-link-fields',
    'question-options',
    'question-tier2',
    'question-tier2-options',
  ]) assert.equal(document.getElementById(id).getAttribute('tabindex'), '-1');
  const linkFields = document.getElementById('question-link-fields');
  assert.equal(linkFields.contains(document.getElementById('question-link-label')), true);
  assert.equal(linkFields.contains(document.getElementById('question-link-href')), true);
  assert.equal(linkFields.contains(document.getElementById('question-type')), false);

  const trapIssueId = 'issue-blocked-options-trap-options-b-trap';
  assert.equal(
    attributeTokens(document.getElementById('option-B-trap-note'), 'aria-describedby')
      .includes(trapIssueId),
    true,
  );
  assert.equal(document.getElementById('option-B-trap-note').getAttribute('aria-invalid'), 'true');

  const globalIssue = document.getElementById('issue-blocked-runtime-assessment-question');
  assert.equal(globalIssue.textContent, 'Question: Assessment failed unexpectedly.');
  const reviewTitle = document.getElementById('review-title');
  assert.equal(reviewTitle.getAttribute('aria-describedby'), null);
  assert.equal(reviewTitle.getAttribute('aria-invalid'), null);
  assert.equal(reviewTitle.getAttribute('tabindex'), '-1');
  const globalLink = document.links().find(link => (
    link.parentNode === globalIssue && link.getAttribute('href') === '#review-title'
  ));
  await globalLink.dispatch('click');
  assert.equal(document.activeElement, reviewTitle);
});

test('saves only on explicit action with the exact revision-safe payload, then confirms the refreshed item', async () => {
  const original = validDomQuestion({
    status: 'attested',
    v2: { reserved: true },
    systemNote: 'preserve me',
  });
  let current = original;
  let posted;
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      current = {
        ...structuredClone(posted.item),
        status: 'draft',
        revision: testRevision('revision-two'),
        assessment: { gate: 'ready', blockers: [], warnings: [] },
      };
      return jsonResponse({
        ok: true,
        action: 'qbank.save-draft',
        updated: 1,
        revision: testRevision('revision-two'),
        assessment: current.assessment,
        commit: 'https://github.example/commit/draft-two',
      });
    }
    return jsonResponse(serverState({ question: current }));
  };
  const { controller, document } = await startHarness({ fetchImpl });
  await setValue(document, 'review-status-filter', 'all', 'change');
  await setValue(document, 'review-item-selector', 'question:qb_moo_902', 'change');
  const changedStem = 'A fictional patient has a sustained syndrome. Which diagnosis is most likely?';
  await setValue(document, 'question-stem', changedStem);
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 0, 'must not autosave');

  await document.getElementById('save-draft').dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(Object.keys(posted).sort(), [
    'action', 'baseRevision', 'id', 'item', 'manifestRevision',
  ]);
  assert.equal(posted.action, 'qbank.save-draft');
  assert.equal(posted.manifestRevision, DEFAULT_MANIFEST_REVISION);
  assert.equal(posted.id, 'qb_moo_902');
  assert.equal(posted.baseRevision, testRevision('revision-one'));
  assert.equal(posted.item.stem, changedStem);
  assert.equal(posted.item.id, 'qb_moo_902');
  assert.equal(posted.item.status, 'attested');
  assert.deepEqual(posted.item.v2, { reserved: true });
  assert.equal(posted.item.systemNote, 'preserve me');
  assert.equal(controller.state.selectedId, 'qb_moo_902');
  assert.equal(controller.state.original.revision, testRevision('revision-two'));
  assert.deepEqual(controller.state.dirtyFields, []);
  assert.match(document.app.textContent, /Saved draft qb_moo_902/);
  assert.equal(document.activeElement?.getAttribute('id'), 'qbank-action-result');
  assert.equal(
    document.links().find(link => link.textContent === 'View commit ↗')?.getAttribute('href'),
    'https://github.example/commit/draft-two',
  );
});

test('a successful draft POST with an unconfirmed GET never reports the draft as saved', async () => {
  const original = validDomQuestion();
  const returnedRevision = testRevision('unconfirmed-draft-save');

  for (const [label, confirmingState] of [
    ['stale revision', serverState({ question: original })],
    ['missing item', serverState({ questions: [] })],
  ]) {
    let postCompleted = false;
    const fetchImpl = async (url, options = {}) => {
      if (options.method === 'POST') {
        postCompleted = true;
        return jsonResponse({
          ok: true,
          action: 'qbank.save-draft',
          updated: 1,
          revision: returnedRevision,
          assessment: { gate: 'ready', blockers: [], warnings: [] },
          commit: 'https://github.example/commit/not-confirmed-draft',
        });
      }
      return jsonResponse(postCompleted
        ? confirmingState
        : serverState({ question: original }));
    };
    const { controller, document } = await startHarness({ fetchImpl });
    const localStem = `Keep this ${label} local draft?`;
    await setValue(document, 'question-stem', localStem);
    await document.getElementById('save-draft').dispatch('click');
    await flushAsyncWork();

    assert.equal(controller.state.original.revision, original.revision, label);
    assert.equal(controller.state.editor.stem, localStem, label);
    assert.ok(controller.state.dirtyFields.includes('stem'), label);
    assert.equal(controller.state.qbankMessage, '', label);
    assert.equal(controller.state.qbankCommitUrl, null, label);
    assert.match(document.getElementById('qbank-action-error').textContent, /refresh_failed/, label);
    assert.doesNotMatch(document.app.textContent, /Saved draft qb_moo_902/, label);
    assert.equal(document.links().some(link => link.textContent === 'View commit ↗'), false, label);
  }
});

test('retains the local candidate on ordinary save failure', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      return jsonResponse({
        error: { code: 'github_rate_limited', message: 'Repository write is temporarily unavailable.', retryable: true },
      }, { ok: false, status: 429 });
    }
    return jsonResponse(serverState());
  };
  const { controller, document } = await startHarness({ fetchImpl });
  await setValue(document, 'question-stem', 'Keep this local candidate?');
  await document.getElementById('save-draft').dispatch('click');
  await flushAsyncWork();

  assert.equal(controller.state.editor.stem, 'Keep this local candidate?');
  assert.ok(controller.state.dirtyFields.includes('stem'));
  assert.equal(document.getElementById('question-stem').value, 'Keep this local candidate?');
  assert.match(document.getElementById('qbank-action-error').textContent, /github_rate_limited/);
  assert.equal(document.activeElement?.getAttribute('id'), 'qbank-action-error');
});

test('handles 409 with an accessible reload or keep-local conflict alert and never overwrites', async () => {
  const local = validDomQuestion();
  const remote = validDomQuestion({
    revision: testRevision('revision-remote'),
    stem: 'A remote faculty edit is now current. What is the diagnosis?',
  });
  let useRemote = false;
  let postCount = 0;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      postCount += 1;
      return jsonResponse({
        error: { code: 'qbank.conflict', message: 'This question changed after you loaded it.' },
      }, { ok: false, status: 409 });
    }
    return jsonResponse(serverState({ question: useRemote ? remote : local }));
  };
  const { controller, document } = await startHarness({ fetchImpl });
  await setValue(document, 'question-stem', 'My unsaved local edit?');
  controller.state.reviewedRevisions.set('qb_moo_902', local.revision);
  await document.getElementById('save-draft').dispatch('click');
  await flushAsyncWork();

  const conflict = document.getElementById('qbank-conflict');
  assert.equal(conflict?.getAttribute('role'), 'alert');
  assert.match(conflict.textContent, /This review context changed in the repository/);
  assert.equal(document.activeElement, conflict);
  assert.ok(document.find('button', 'Reload'));
  assert.ok(document.find('button', 'Keep local copy'));
  assert.equal(controller.state.reviewedRevisions.has('qb_moo_902'), false);
  await document.find('button', 'Keep local copy').dispatch('click');
  assert.equal(controller.state.editor.stem, 'My unsaved local edit?');
  assert.ok(controller.state.dirtyFields.includes('stem'));
  assert.equal(postCount, 1);

  await document.getElementById('save-draft').dispatch('click');
  await flushAsyncWork();
  useRemote = true;
  await document.find('button', 'Reload').dispatch('click');
  await flushAsyncWork();
  assert.equal(controller.state.selectedId, 'qb_moo_902');
  assert.equal(controller.state.editor.stem, remote.stem);
  assert.deepEqual(controller.state.dirtyFields, []);
  assert.equal(postCount, 2, 'reload must not issue an overwrite POST');
});

test('conflict Reload is immediately inert and ignores a slower stale response', async () => {
  const local = validDomQuestion({
    revision: testRevision('reload-local'),
    stem: 'The initially loaded repository stem. What is the diagnosis?',
  });
  const staleRemote = validDomQuestion({
    revision: testRevision('reload-stale'),
    stem: 'A slower repository response that must not win. What is the diagnosis?',
  });
  const newestRemote = validDomQuestion({
    revision: testRevision('reload-newest'),
    stem: 'The newest repository response must remain current. What is the diagnosis?',
  });
  const slowReload = deferred();
  let getCount = 0;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      return jsonResponse({
        error: { code: 'qbank.conflict', message: 'This question changed after you loaded it.' },
      }, { ok: false, status: 409 });
    }
    getCount += 1;
    if (getCount === 1) return jsonResponse(serverState({ question: local }));
    if (getCount === 2) return slowReload.promise;
    if (getCount === 3) return jsonResponse(serverState({ question: newestRemote }));
    throw new Error(`Unexpected GET ${getCount}`);
  };
  const { controller, document } = await startHarness({ fetchImpl });
  const retainedStem = 'Keep this local candidate until Reload completes?';
  await setValue(document, 'question-stem', retainedStem);
  await document.getElementById('save-draft').dispatch('click');
  await flushAsyncWork();

  await document.find('button', 'Reload').dispatch('click');
  assert.equal(controller.state.pending, true);
  assert.equal(document.getElementById('console-background').getAttribute('inert'), '');
  const pendingStem = document.getElementById('question-stem');
  pendingStem.value = 'This pending mutation must be ignored.';
  await pendingStem.dispatch('input');
  assert.equal(controller.state.editor.stem, retainedStem);

  const latestLoad = controller.load({ silent: true });
  assert.equal(await latestLoad, true);
  assert.equal(controller.state.editor.stem, newestRemote.stem);
  slowReload.resolve(jsonResponse(serverState({ question: staleRemote })));
  await flushAsyncWork();

  assert.equal(controller.state.editor.stem, newestRemote.stem);
  assert.equal(controller.state.original.revision, newestRemote.revision);
  assert.equal(controller.state.pending, false);
});

test('guards dirty unified-queue navigation with Save draft, Discard, and Cancel', async () => {
  const first = validDomQuestion({ id: 'qb_moo_901', revision: testRevision('rev-one') });
  const second = validDomQuestion({
    id: 'qb_moo_902',
    revision: testRevision('rev-two'),
    stem: 'A second fictional patient has symptoms. What is the diagnosis?',
  });
  let questions = [first, second];
  let postCount = 0;
  const alwaysReady = () => ({ gate: 'ready', blockers: [], warnings: [] });
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      postCount += 1;
      const body = JSON.parse(options.body);
      questions = questions.map(item => item.id === body.id
        ? { ...structuredClone(body.item), status: 'draft', revision: testRevision('rev-saved') }
        : item);
      return jsonResponse({
        ok: true,
        action: 'qbank.save-draft',
        revision: testRevision('rev-saved'),
        assessment: alwaysReady(),
        commit: null,
      });
    }
    return jsonResponse(serverState({ questions }));
  };
  const { controller, document } = await startHarness({ fetchImpl, assessItemImpl: alwaysReady });
  assert.equal(controller.state.selectedId, 'qb_moo_901');
  await setValue(document, 'question-stem', 'A guarded local edit?');
  const selector = document.getElementById('review-item-selector');
  selector.value = 'question:qb_moo_902';
  await selector.dispatch('change');
  const guard = document.getElementById('unsaved-guard');
  assert.equal(guard?.getAttribute('role'), 'alertdialog');
  assert.equal(document.activeElement, guard);
  assert.equal(guard.parentNode, document.app);
  assert.equal(guard.getAttribute('aria-modal'), 'true');
  assert.equal(document.getElementById('console-background').getAttribute('inert'), '');
  for (const label of ['Save draft', 'Discard', 'Cancel']) assert.ok(document.find('button', label));

  await guard.dispatch('keydown', { key: 'Tab', shiftKey: false });
  assert.equal(document.activeElement?.getAttribute('id'), 'unsaved-save');
  document.getElementById('unsaved-cancel').focus();
  await guard.dispatch('keydown', { key: 'Tab', shiftKey: false });
  assert.equal(document.activeElement?.getAttribute('id'), 'unsaved-save');
  await guard.dispatch('keydown', { key: 'Escape', shiftKey: false });
  assert.equal(controller.state.selectedId, 'qb_moo_901');
  assert.equal(controller.state.editor.stem, 'A guarded local edit?');
  assert.equal(document.activeElement?.getAttribute('id'), 'review-item-selector');
  assert.equal(document.getElementById('console-background').getAttribute('inert'), null);

  document.getElementById('review-item-selector').value = 'question:qb_moo_902';
  await document.getElementById('review-item-selector').dispatch('change');
  await document.getElementById('unsaved-save').dispatch('click');
  await flushAsyncWork();
  assert.equal(postCount, 1);
  assert.equal(controller.state.selectedId, 'qb_moo_902');
  assert.deepEqual(controller.state.dirtyFields, []);

  await setValue(document, 'question-stem', 'Discard this second edit?');
  await document.getElementById('previous-review-item').dispatch('click');
  assert.equal(document.activeElement?.getAttribute('id'), 'unsaved-guard');
  await document.getElementById('unsaved-discard').dispatch('click');
  assert.equal(controller.state.selectedKey, 'question:qb_moo_901');
  assert.equal(postCount, 1);
});

test('dirty queue and filter cancellation preserves the learner iframe and local edit', async () => {
  const first = validDomQuestion({ id: 'qb_moo_901', revision: testRevision('stable-frame-one') });
  const second = validDomQuestion({ id: 'qb_moo_902', revision: testRevision('stable-frame-two') });
  const alwaysReady = () => ({ gate: 'ready', blockers: [], warnings: [] });
  const { controller, document } = await startHarness({
    assessItemImpl: alwaysReady,
    fetchImpl: async () => jsonResponse(serverState({ questions: [first, second] })),
  });
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;
  const selectedKey = controller.state.selectedKey;
  const localStem = 'Keep this unsaved edit and the live learner frame?';
  await setValue(document, 'question-stem', localStem);

  const selector = document.getElementById('review-item-selector');
  selector.value = 'question:qb_moo_902';
  await selector.dispatch('change');
  assert.ok(document.getElementById('learner-preview-frame') === frame,
    'Opening the dirty queue guard must preserve the iframe node.');
  assert.ok(document.getElementById('learner-preview-frame').contentWindow === frameWindow,
    'Opening the dirty queue guard must preserve the iframe window.');
  assert.equal(controller.state.selectedKey, selectedKey);
  assert.equal(controller.state.editor.stem, localStem);

  await document.getElementById('unsaved-cancel').dispatch('click');
  assert.ok(document.getElementById('learner-preview-frame') === frame,
    'Cancelling dirty queue navigation must preserve the iframe node.');
  assert.ok(document.getElementById('learner-preview-frame').contentWindow === frameWindow,
    'Cancelling dirty queue navigation must preserve the iframe window.');
  assert.equal(controller.state.selectedKey, selectedKey);
  assert.equal(controller.state.editor.stem, localStem);

  const typeFilter = document.getElementById('review-type-filter');
  typeFilter.value = 'page';
  await typeFilter.dispatch('change');
  assert.ok(document.getElementById('learner-preview-frame') === frame,
    'Opening the dirty filter guard must preserve the iframe node.');
  assert.ok(document.getElementById('learner-preview-frame').contentWindow === frameWindow,
    'Opening the dirty filter guard must preserve the iframe window.');
  assert.equal(controller.state.selectedKey, selectedKey);
  assert.equal(controller.state.editor.stem, localStem);

  await document.getElementById('unsaved-cancel').dispatch('click');
  assert.ok(document.getElementById('learner-preview-frame') === frame,
    'Cancelling dirty filter navigation must preserve the iframe node.');
  assert.ok(document.getElementById('learner-preview-frame').contentWindow === frameWindow,
    'Cancelling dirty filter navigation must preserve the iframe window.');
  assert.equal(controller.state.selectedKey, selectedKey);
  assert.equal(controller.state.editor.stem, localStem);
  assert.equal(controller.state.queueFilters.type, 'all');
});

test('Lock uses the dirty guard and save-time 401 reauthentication retries the captured draft unchanged', async () => {
  const original = validDomQuestion({ revision: testRevision('reauth-original') });
  const savedRevision = testRevision('reauth-saved');
  let current = original;
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      const key = options.headers['x-faculty-key'];
      posts.push({ body, key });
      if (key !== 'correct-key') {
        return jsonResponse({ error: { code: 'unauthorized', message: 'Wrong key.' } }, {
          ok: false,
          status: 401,
        });
      }
      current = { ...structuredClone(body.item), status: 'draft', revision: savedRevision };
      return jsonResponse({
        ok: true,
        action: 'qbank.save-draft',
        revision: savedRevision,
        assessment: { gate: 'ready', blockers: [], warnings: [] },
        commit: null,
      });
    }
    return jsonResponse(serverState({ question: current }));
  };
  const { controller, document, window } = await startHarness({
    fetchImpl,
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const localStem = 'This local candidate must survive reauthentication. What is the diagnosis?';
  await setValue(document, 'question-stem', localStem);

  await document.find('button', 'Lock console').dispatch('click');
  assert.ok(document.getElementById('unsaved-guard'));
  assert.equal(window.sessionStorage.getItem('fac_key'), 'test-faculty-key');
  await document.getElementById('unsaved-save').dispatch('click');
  await flushAsyncWork();
  assert.equal(posts.length, 1);
  assert.equal(controller.state.editor.stem, localStem);
  assert.ok(document.getElementById('faculty-key'));
  controller.state.server.manifestRevision = 'c'.repeat(40);

  let keyInput = document.getElementById('faculty-key');
  keyInput.value = 'still-wrong';
  await keyInput.parentNode.parentNode.dispatch('submit');
  await flushAsyncWork();
  assert.equal(posts.length, 2);
  assert.equal(controller.state.editor.stem, localStem);
  assert.ok(document.getElementById('faculty-key'));

  keyInput = document.getElementById('faculty-key');
  keyInput.value = 'correct-key';
  await keyInput.parentNode.parentNode.dispatch('submit');
  await flushAsyncWork();
  assert.equal(posts.length, 3);
  assert.deepEqual(posts.map(entry => entry.body.item.stem), [localStem, localStem, localStem]);
  assert.deepEqual(posts.map(entry => entry.body.baseRevision), [
    testRevision('reauth-original'),
    testRevision('reauth-original'),
    testRevision('reauth-original'),
  ]);
  assert.deepEqual(posts.map(entry => entry.body.manifestRevision), [
    DEFAULT_MANIFEST_REVISION,
    DEFAULT_MANIFEST_REVISION,
    DEFAULT_MANIFEST_REVISION,
  ]);
  assert.equal(controller.state.server, null, 'successful guarded save should complete the requested lock');
  assert.ok(document.getElementById('faculty-key'));
  assert.equal(window.sessionStorage.getItem('fac_key'), null);
});

test('the attestation rail shows read-only publishing risk for a page or tool but never for a question', async () => {
  const { document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        {
          slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed',
          risk: { kind: 'clinical', level: 'high' },
        },
        {
          slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed',
          risk: { kind: 'local-policy', level: 'moderate' },
        },
      ],
      questions: [validDomQuestion()],
    })),
  });

  assert.equal(
    document.getElementById('attestation-risk-context')?.textContent,
    'Publishing risk: Clinical · High risk',
  );

  await setValue(document, 'review-item-selector', 'tool:mse.html', 'change');
  assert.equal(
    document.getElementById('attestation-risk-context')?.textContent,
    'Publishing risk: Local Policy · Moderate risk',
  );

  await setValue(document, 'review-item-selector', 'question:qb_moo_902', 'change');
  assert.equal(document.getElementById('attestation-risk-context'), null,
    'a question has no governed publishing risk to show');
});

test('the attestation rail omits the risk context entirely when the ledger has no risk for the item yet', async () => {
  const { document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
      ],
      questions: [],
    })),
  });
  assert.equal(document.getElementById('attestation-risk-context'), null);
});

test('page and tool use the same Live Review Resolve Confirm rail and clear content checks on selection', async () => {
  const harness = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
        { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
      ],
      questions: [],
    })),
  });
  const { controller, document } = harness;

  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(document.getElementById('selected-item-type').textContent, 'Page');
  assert.equal(document.getElementById('selected-item-view').textContent, 'Live deploy');
  assert.ok(document.getElementById('learner-preview-frame'));
  assert.equal(document.getElementById('attestation-rail-title').textContent,
    'Review → Resolve → Confirm');
  assert.match(document.getElementById('rail-step-review').className, /current/);
  assert.equal(document.find('button', 'Attest this page')?.disabled, true);

  await makeCurrentContentPreviewReady(harness);
  assert.ok(document.find('label', 'I reviewed the complete item'));
  assert.ok(document.find('label',
    'I verified that this is accurate and appropriate for a third-year student.'));
  assert.ok(document.find('label', 'I tested the relevant links, media, or interactions.'));
  await setChecked(document, 'review-complete-item');
  assert.match(document.getElementById('rail-step-resolve').className, /current/);
  await setChecked(document, 'review-content-accuracy');
  await setChecked(document, 'review-content-interactions');
  assert.match(document.getElementById('rail-step-confirm').className, /current/);
  const attestButton = document.getElementById('attest-current-item');
  assert.equal(attestButton?.disabled, false);
  // With the learner surface ready the action is one click, and its label has to
  // carry every assertion the three checkboxes make — one press must not mean less.
  assert.match(attestButton.textContent, /^Attest this page — /);
  assert.match(attestButton.textContent, /reviewed/);
  assert.match(attestButton.textContent, /accurate for MS3/);
  assert.match(attestButton.textContent, /links tested/);
  assert.equal(document.getElementById('current-reviewer-label').textContent, 'Joshua Moss, MD');

  // The reviewer label is server-derived and display-only — no editable control exists.
  assert.equal(document.getElementById('reviewer-label').tagName, 'P');
  await setValue(document, 'review-item-selector', 'tool:mse.html', 'change');

  assert.equal(controller.state.selectedKey, 'tool:mse.html');
  assert.equal(document.getElementById('selected-item-type').textContent, 'Tool');
  assert.equal(document.getElementById('selected-item-view').textContent, 'Live deploy');
  assert.ok(document.getElementById('learner-preview-frame'));
  assert.match(document.getElementById('rail-step-review').className, /current/);
  assert.equal(document.find('button', 'Attest this tool')?.disabled, true);
  assert.deepEqual(controller.state.reviewChecks, {
    completeItemReviewed: false,
    liveReviewed: false,
    separateTabReviewed: false,
    liveUnavailableAcknowledged: false,
    accuracy: false,
    interactions: false,
  });
});

test('content attestation submits exactly one page slug, confirms it, and holds the item for Next item', async () => {
  let items = [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
  ];
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      const [[slug, reviewed]] = Object.entries(posted.changes);
      items = items.map(item => item.slug === slug
        ? { ...item, status: reviewed ? 'reviewed' : 'unreviewed' }
        : item);
      return jsonResponse({
        ok: true,
        updated: 1,
        commit: 'https://github.example/commit/content-page',
      });
    }
    return jsonResponse(serverState({ items, questions: [] }));
  };
  const harness = await startHarness({ fetchImpl });
  const { controller, document } = harness;
  await completeCurrentContentReview(harness);
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(posted, {
    target: 'content',
    changes: { 't_mood.md': true },
    reasons: {},
  });
  assert.equal(Object.keys(posted.changes).length, 1);
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(controller.state.completedHoldKey, 'page:t_mood.md');
  assert.equal(controller.state.reviewItems.find(item => item.key === 'page:t_mood.md').savedStatus,
    'reviewed');
  assert.equal(controller.state.contentMessage, 'Attested t_mood.md.');
  assert.match(document.getElementById('content-action-result').textContent, /Attested t_mood\.md/);
  assert.equal(
    document.links().find(link => link.textContent === 'View commit ↗')?.getAttribute('href'),
    'https://github.example/commit/content-page',
  );
  assert.equal(document.getElementById('next-review-item').textContent, 'Next item');
  assert.equal(document.getElementById('next-review-item').disabled, false);
  assert.equal(document.activeElement?.getAttribute('id'), 'next-review-item');
  assert.equal(document.status.textContent, 'Attested t_mood.md.');
});

test('content POST with a stale confirming GET remains unconfirmed and never announces success', async () => {
  const items = [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
  ];
  const confirmingGet = deferred();
  let getCount = 0;
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      return jsonResponse({
        ok: true,
        updated: 1,
        commit: 'https://github.example/commit/content-stale',
      });
    }
    getCount += 1;
    if (getCount === 1) return jsonResponse(serverState({ items, questions: [] }));
    return confirmingGet.promise;
  };
  const harness = await startHarness({ fetchImpl });
  const { controller, document } = harness;
  await completeCurrentContentReview(harness);
  const preservedPreview = controller.state.preview;
  const preservedFrame = document.getElementById('learner-preview-frame');
  const preservedChecks = structuredClone(controller.state.reviewChecks);
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(posted.changes, { 't_mood.md': true });
  assert.equal(controller.state.pending, true);
  assert.equal(controller.state.contentMessage, 'Saving this content review…');
  assert.match(document.getElementById('content-action-result').textContent,
    /Saving this content review/);
  assert.equal(controller.state.preview, preservedPreview);
  assert.equal(document.getElementById('learner-preview-frame'), preservedFrame);
  assert.deepEqual(controller.state.reviewChecks, preservedChecks);
  assert.doesNotMatch(document.status.textContent, /Attested|Reopened/);

  confirmingGet.resolve(jsonResponse(serverState({ items, questions: [] })));
  await flushAsyncWork();

  assert.equal(controller.state.pending, false);
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(controller.state.completedHoldKey, null);
  assert.equal(controller.state.reviewItems.find(item => item.key === 'page:t_mood.md').savedStatus,
    'unreviewed');
  assert.match(controller.state.contentMessage, /refresh_failed/);
  assert.match(document.getElementById('content-action-result').textContent, /refresh_failed/);
  assert.equal(controller.state.preview, preservedPreview);
  assert.equal(document.getElementById('learner-preview-frame'), preservedFrame);
  assert.deepEqual(controller.state.reviewChecks, preservedChecks);
  assert.equal(document.activeElement?.getAttribute('id'), 'content-action-result');
  assert.doesNotMatch(document.app.textContent, /Attested t_mood\.md|Reopened t_mood\.md/);
  assert.doesNotMatch(document.status.textContent, /Attested|Reopened/);
});

test('content commit URL must be safe HTTPS before any confirming GET', async () => {
  const items = [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
  ];
  let getCount = 0;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      return jsonResponse({
        ok: true,
        updated: 1,
        commit: 'http://github.example/commit/unsafe-content',
      });
    }
    getCount += 1;
    return jsonResponse(serverState({ items, questions: [] }));
  };
  const harness = await startHarness({ fetchImpl });
  const { controller, document } = harness;
  await completeCurrentContentReview(harness);
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.equal(getCount, 1);
  assert.equal(controller.state.completedHoldKey, null);
  assert.match(controller.state.contentMessage,
    /invalid_response: Commit receipt was not a safe HTTPS URL/);
  assert.match(document.getElementById('content-action-result').textContent,
    /invalid_response: Commit receipt was not a safe HTTPS URL/);
  assert.equal(document.links().some(link => link.getAttribute('href')
    === 'http://github.example/commit/unsafe-content'), false);
  assert.doesNotMatch(document.status.textContent, /Attested/);
});

test('content 401 retry freezes the exact slug and boolean status', async () => {
  let items = [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
  ];
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      const key = options.headers['x-faculty-key'];
      posts.push({ body, key });
      if (key !== 'correct-key') {
        return jsonResponse({ error: { code: 'unauthorized', message: 'Wrong key.' } }, {
          ok: false,
          status: 401,
        });
      }
      const [[slug, reviewed]] = Object.entries(body.changes);
      items = items.map(item => item.slug === slug
        ? { ...item, status: reviewed ? 'reviewed' : 'unreviewed' }
        : item);
      return jsonResponse({ ok: true, updated: 1, commit: null });
    }
    return jsonResponse(serverState({ items, questions: [] }));
  };
  const harness = await startHarness({ fetchImpl });
  const { controller, document } = harness;
  await completeCurrentContentReview(harness);
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.equal(posts.length, 1);
  assert.ok(document.getElementById('faculty-key'));
  controller.state.selectedKey = 'tool:mse.html';
  controller.state.reviewChecks.accuracy = false;
  const keyInput = document.getElementById('faculty-key');
  keyInput.value = 'correct-key';
  await keyInput.parentNode.parentNode.dispatch('submit');
  await flushAsyncWork();

  assert.equal(posts.length, 2);
  assert.deepEqual(posts[1].body, posts[0].body);
  assert.deepEqual(posts[1].body, {
    target: 'content',
    changes: { 't_mood.md': true },
    reasons: {},
  });
});

test('reopen 401 retry preserves the exact requested reason across reauthentication', async () => {
  let items = [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'reviewed' },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed' },
  ];
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      const key = options.headers['x-faculty-key'];
      posts.push({ body, key });
      if (key !== 'correct-key') {
        return jsonResponse({ error: { code: 'unauthorized', message: 'Wrong key.' } }, {
          ok: false,
          status: 401,
        });
      }
      const [[slug, reviewed]] = Object.entries(body.changes);
      items = items.map(item => item.slug === slug
        ? { ...item, status: reviewed ? 'reviewed' : 'unreviewed' }
        : item);
      return jsonResponse({ ok: true, updated: 1, commit: null });
    }
    return jsonResponse(serverState({ items, questions: [] }));
  };
  const { controller, document } = await startHarness({ fetchImpl });
  await setValue(document, 'review-status-filter', 'all', 'change');
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');

  await document.find('button', 'Reopen review').dispatch('click');
  await setValue(document, 'reopen-reason', 'Local policy updated; re-verify current guidance.');
  await document.getElementById('confirm-reopen-review').dispatch('click');
  await flushAsyncWork();

  assert.equal(posts.length, 1);
  assert.ok(document.getElementById('faculty-key'));
  // The reason survives the reauth prompt untouched — the retry replays the exact
  // frozen snapshot, and nothing on the 401 path clears client state.
  assert.equal(controller.state.reopenReason, 'Local policy updated; re-verify current guidance.');
  const keyInput = document.getElementById('faculty-key');
  keyInput.value = 'correct-key';
  await keyInput.parentNode.parentNode.dispatch('submit');
  await flushAsyncWork();

  assert.equal(posts.length, 2);
  assert.deepEqual(posts[1].body, posts[0].body);
  assert.deepEqual(posts[1].body, {
    target: 'content',
    changes: { 't_mood.md': false },
    reasons: { 't_mood.md': 'Local policy updated; re-verify current guidance.' },
  });
  assert.equal(controller.state.contentMessage, 'Reopened t_mood.md for review.');
  assert.equal(controller.state.reopenReason, '', 'cleared only once the retry actually succeeds');
});

test('Reopen review is a confirmed More action, requires a 1-240 character reason, and submits exactly that content slug as false', async () => {
  assert.match(html, /summary:focus-visible/);
  let items = [
    {
      slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'reviewed',
      risk: { kind: 'clinical', level: 'high' },
    },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed' },
  ];
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      const [[slug, reviewed]] = Object.entries(posted.changes);
      items = items.map(item => item.slug === slug
        ? { ...item, status: reviewed ? 'reviewed' : 'unreviewed' }
        : item);
      return jsonResponse({ ok: true, updated: 1, commit: null });
    }
    return jsonResponse(serverState({ items, questions: [] }));
  };
  const { controller, document, window } = await startHarness({ fetchImpl });
  await setValue(document, 'review-status-filter', 'all', 'change');

  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(Boolean(document.getElementById('attest-current-item')), false);
  assert.ok(document.find('summary', 'More actions'));
  assert.ok(document.find('button', 'Reopen review'));
  await document.find('button', 'Reopen review').dispatch('click');

  const confirmation = document.getElementById('reopen-confirmation');
  assert.equal(confirmation?.getAttribute('role'), 'alertdialog');
  assert.equal(confirmation?.getAttribute('aria-modal'), 'true');
  assert.equal(document.getElementById('console-background').getAttribute('inert'), '');
  assert.deepEqual(controller.state.reopenConfirmation, {
    key: 'page:t_mood.md',
    reviewed: false,
  });
  assert.equal(Object.isFrozen(controller.state.reopenConfirmation), true);

  // No reason yet: the control is disabled and a click on it is a no-op.
  assert.equal(controller.state.reopenReason, '');
  assert.equal(document.getElementById('confirm-reopen-review').disabled, true);
  await document.getElementById('confirm-reopen-review').dispatch('click');
  assert.equal(posted, undefined);
  assert.ok(document.getElementById('reopen-confirmation'), 'a disabled control must not dismiss the modal');

  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;
  await reportPreviewStatus(window, controller, 'ready');
  assert.equal(document.getElementById('console-background').getAttribute('inert'), '');
  assert.ok(document.getElementById('reopen-confirmation'));
  assert.equal(document.getElementById('learner-preview-frame'), frame);
  assert.equal(document.getElementById('learner-preview-frame').contentWindow, frameWindow);

  // Whitespace-only still counts as no reason.
  await setValue(document, 'reopen-reason', '   ');
  assert.equal(controller.state.reopenReason, '   ');
  assert.equal(document.getElementById('confirm-reopen-review').disabled, true);

  await setValue(document, 'reopen-reason', 'Guideline changed; re-verify the dosing table.');
  assert.equal(document.getElementById('confirm-reopen-review').disabled, false);
  await document.getElementById('confirm-reopen-review').dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(posted, {
    target: 'content',
    changes: { 't_mood.md': false },
    reasons: { 't_mood.md': 'Guideline changed; re-verify the dosing table.' },
  });
  assert.equal(Object.keys(posted.changes).length, 1);
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(controller.state.completedHoldKey, null);
  assert.equal(controller.state.reviewItems.find(item => item.key === 'page:t_mood.md').savedStatus,
    'unreviewed');
  assert.equal(controller.state.contentMessage, 'Reopened t_mood.md for review.');
  assert.equal(controller.state.reopenReason, '', 'a confirmed save clears the reason');
  assert.equal(Boolean(document.find('button', 'Reopen review')), false);
  assert.ok(document.find('button', 'Attest this page'));
});

test('cancelling a reopen for one item never lets its reason apply to a different item', async () => {
  let items = [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'reviewed' },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed' },
  ];
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      const [[slug, reviewed]] = Object.entries(posted.changes);
      items = items.map(item => item.slug === slug
        ? { ...item, status: reviewed ? 'reviewed' : 'unreviewed' }
        : item);
      return jsonResponse({ ok: true, updated: 1, commit: null });
    }
    return jsonResponse(serverState({ items, questions: [] }));
  };
  const { controller, document } = await startHarness({ fetchImpl });
  await setValue(document, 'review-status-filter', 'all', 'change');
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');

  // Open item A's (t_mood.md) reopen dialog, type a reason meant only for A, cancel.
  await document.find('button', 'Reopen review').dispatch('click');
  await setValue(document, 'reopen-reason', 'Guideline changed for t_mood.md specifically.');
  assert.equal(controller.state.reopenReason, 'Guideline changed for t_mood.md specifically.');
  await document.getElementById('cancel-reopen-review').dispatch('click');
  assert.equal(document.getElementById('reopen-confirmation'), null);

  // Select item B (mse.html) and open ITS reopen dialog.
  await setValue(document, 'review-item-selector', 'tool:mse.html', 'change');
  assert.equal(controller.state.selectedKey, 'tool:mse.html');
  await document.find('button', 'Reopen review').dispatch('click');

  // A's leftover text must not pre-fill B's dialog, and confirming with nothing
  // freshly typed for B must be impossible — a disabled control is a no-op, not a
  // silent submission of A's reason onto B's ledger record.
  assert.equal(controller.state.reopenReason, '');
  assert.equal(document.getElementById('reopen-reason').value, '');
  assert.equal(document.getElementById('confirm-reopen-review').disabled, true);
  await document.getElementById('confirm-reopen-review').dispatch('click');
  assert.equal(posted, undefined, "a disabled confirm must not submit A's reason onto B");

  // Typing B's own reason and confirming submits exactly B's reason, never A's.
  await setValue(document, 'reopen-reason', 'A separate, current reason for mse.html.');
  assert.equal(document.getElementById('confirm-reopen-review').disabled, false);
  await document.getElementById('confirm-reopen-review').dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(posted, {
    target: 'content',
    changes: { 'mse.html': false },
    reasons: { 'mse.html': 'A separate, current reason for mse.html.' },
  });
});

test('reopening the same item again after a network failure keeps the previously typed reason', async () => {
  // The flip side of the cross-item test above: the fix must not overcorrect into
  // wiping the reason on every open — a failed save retried against the SAME item
  // must not force the reviewer to retype (2026-07-26 risk-aware-publishing-warnings
  // plan, Step 6: "preserve it across authentication retry or network failure").
  let attempts = 0;
  const items = [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'reviewed' },
  ];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      attempts += 1;
      throw new Error('Synthetic network failure.');
    }
    return jsonResponse(serverState({ items, questions: [] }));
  };
  const { controller, document } = await startHarness({ fetchImpl });
  await setValue(document, 'review-status-filter', 'all', 'change');

  await document.find('button', 'Reopen review').dispatch('click');
  await setValue(document, 'reopen-reason', 'Retry after a dropped connection.');
  await document.getElementById('confirm-reopen-review').dispatch('click');
  await flushAsyncWork();

  assert.equal(attempts, 1);
  assert.match(controller.state.contentMessage, /Synthetic network failure/);
  assert.equal(controller.state.reopenReason, 'Retry after a dropped connection.');
  // Still status 'reviewed' locally (the failed POST never refreshed state), so
  // Reopen review is still the visible action for the SAME item.
  await document.find('button', 'Reopen review').dispatch('click');
  assert.equal(document.getElementById('reopen-reason').value, 'Retry after a dropped connection.');
  assert.equal(document.getElementById('confirm-reopen-review').disabled, false);
});

test('content checks are not unsaved bulk state and the shortcut never submits them', async () => {
  const posts = [];
  const harness = await startHarness({
    fetchImpl: async (url, options = {}) => {
      if (options.method === 'POST') posts.push(JSON.parse(options.body));
      return jsonResponse(serverState({
        items: [
          { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
        ],
        questions: [],
      }));
    },
  });
  const { controller, document, window } = harness;
  assert.equal(Object.hasOwn(controller.state, 'contentChanges'), false);
  await completeCurrentContentReview(harness);
  const shortcut = await window.dispatch('keydown', {
    metaKey: true,
    ctrlKey: false,
    key: 's',
  });
  await flushAsyncWork();

  assert.equal(shortcut.defaultPrevented, true);
  assert.deepEqual(posts, []);
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(controller.state.reviewChecks.accuracy, true);
  assert.equal(document.status.textContent, 'No unsaved question changes to save.');
});

test('requires all human confirmations and each current warning acknowledgement for one yellow item', async () => {
  const warning = {
    code: 'stem.negative_lead_in',
    field: 'stem',
    message: 'Confirm that the negative lead-in is intentional.',
  };
  const warningAssessment = () => ({ gate: 'warning', blockers: [], warnings: [warning] });
  let current = validDomQuestion();
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      current = { ...current, status: 'attested', revision: testRevision('revision-attested') };
      return jsonResponse({
        ok: true,
        action: 'qbank.attest',
        updated: 1,
        revision: { qb_moo_902: testRevision('revision-attested') },
        assessment: { qb_moo_902: warningAssessment() },
        commit: 'https://github.example/commit/attested-yellow',
      });
    }
    return jsonResponse(serverState({ question: current }));
  };
  const { controller, document, window } = await startHarness({
    fetchImpl,
    assessItemImpl: warningAssessment,
  });
  await makeCurrentQuestionPreviewReady({ controller, document, window });
  const attest = document.getElementById('attest-current-item');
  assert.equal(attest.disabled, true);
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  assert.equal(document.getElementById('attest-current-item').disabled, true);
  await setChecked(document, 'ack-stem-negative_lead_in');
  assert.equal(document.getElementById('attest-current-item').disabled, false);
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(Object.keys(posted).sort(), [
    'action', 'confirmations', 'items', 'manifestRevision',
  ]);
  assert.equal(posted.action, 'qbank.attest');
  assert.equal(posted.manifestRevision, DEFAULT_MANIFEST_REVISION);
  assert.deepEqual(posted.items, [{
    id: 'qb_moo_902',
    revision: testRevision('revision-one'),
    reviewedRevision: testRevision('revision-one'),
    acknowledgedWarnings: ['stem.negative_lead_in'],
  }]);
  assert.deepEqual(posted.confirmations, {
    clinical: true,
    evidence: true,
    originalityAndNoPhi: true,
  });
  assert.equal(controller.state.original.status, 'attested');
  assert.equal(controller.state.original.revision, testRevision('revision-attested'));
  assert.equal(document.activeElement?.getAttribute('id'), 'qbank-action-result');
});

test('Ready attestation posts one exact-revision entry and holds the completed question for Next item', async () => {
  const attestedRevision = testRevision('ready-attested');
  const second = validDomQuestion({
    id: 'qb_moo_903',
    revision: testRevision('ready-next'),
    stem: 'A second saved question should not be auto-selected. What is the diagnosis?',
  });
  let questions = [validDomQuestion(), second];
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      questions = questions.map(questionItem => (
        questionItem.id === 'qb_moo_902'
          ? { ...questionItem, status: 'attested', revision: attestedRevision }
          : questionItem
      ));
      return jsonResponse({
        ok: true,
        action: 'qbank.attest',
        updated: 1,
        revision: { qb_moo_902: attestedRevision },
        assessment: { qb_moo_902: { gate: 'ready', blockers: [], warnings: [] } },
        commit: 'https://github.example/commit/ready-attested',
      });
    }
    return jsonResponse(serverState({ questions }));
  };
  const harness = await startHarness({
    fetchImpl,
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const { controller, document } = harness;
  await makeCurrentQuestionPreviewReady(harness);
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  const attestButtons = document.findAll('button').filter(button => (
    button.textContent === 'Attest this question'
  ));
  assert.equal(attestButtons.length, 1);
  assert.equal(attestButtons[0].disabled, false);
  await attestButtons[0].dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(posted.items, [{
    id: 'qb_moo_902',
    revision: testRevision('revision-one'),
    reviewedRevision: testRevision('revision-one'),
  }]);
  assert.equal(controller.state.selectedKey, 'question:qb_moo_902');
  assert.equal(controller.state.completedHoldKey, 'question:qb_moo_902');
  assert.equal(controller.state.original.status, 'attested');
  assert.match(document.getElementById('qbank-action-result').textContent,
    /Attested 1 question: qb_moo_902/);
  assert.equal(document.getElementById('next-review-item').textContent, 'Next item');
  assert.equal(document.getElementById('next-review-item').disabled, false);
  assert.equal(document.activeElement?.getAttribute('id'), 'next-review-item');
});

test('a successful attestation POST with a stale confirming GET stays unconfirmed', async () => {
  const original = validDomQuestion();
  const returnedRevision = testRevision('unconfirmed-attestation');
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      return jsonResponse({
        ok: true,
        action: 'qbank.attest',
        updated: 1,
        revision: { qb_moo_902: returnedRevision },
        assessment: { qb_moo_902: { gate: 'ready', blockers: [], warnings: [] } },
        commit: 'https://github.example/commit/not-confirmed',
      });
    }
    return jsonResponse(serverState({ question: original }));
  };
  const harness = await startHarness({
    fetchImpl,
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const { controller, document } = harness;
  await makeCurrentQuestionPreviewReady(harness);
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(posted.items, [{
    id: 'qb_moo_902',
    revision: original.revision,
    reviewedRevision: original.revision,
  }]);
  assert.equal(controller.state.original.status, 'draft');
  assert.equal(controller.state.original.revision, original.revision);
  assert.equal(controller.state.selectedKey, 'question:qb_moo_902');
  assert.equal(controller.state.completedHoldKey, null);
  assert.match(document.getElementById('qbank-action-error').textContent, /refresh_failed/);
  assert.doesNotMatch(document.app.textContent, /Attested 1 question/);
  assert.equal(controller.state.qbankMessage, '');
});

test('an attestation GET with a matching revision but Draft status stays unconfirmed', async () => {
  const original = validDomQuestion();
  const returnedRevision = testRevision('matching-draft-attestation');
  let postCompleted = false;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      postCompleted = true;
      return jsonResponse({
        ok: true,
        action: 'qbank.attest',
        updated: 1,
        revision: { qb_moo_902: returnedRevision },
        assessment: { qb_moo_902: { gate: 'ready', blockers: [], warnings: [] } },
        commit: 'https://github.example/commit/draft-not-confirmed',
      });
    }
    return jsonResponse(serverState({
      question: postCompleted
        ? validDomQuestion({ revision: returnedRevision, status: 'draft' })
        : original,
    }));
  };
  const harness = await startHarness({
    fetchImpl,
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const { controller, document } = harness;
  await makeCurrentQuestionPreviewReady(harness);
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.equal(controller.state.original.revision, original.revision);
  assert.equal(controller.state.original.status, 'draft');
  assert.equal(controller.state.completedHoldKey, null);
  assert.equal(controller.state.qbankMessage, '');
  assert.match(document.getElementById('qbank-action-error').textContent, /refresh_failed/);
  assert.doesNotMatch(document.app.textContent, /Attested 1 question/);
});

test('save-time 401 reauthentication retries the exact captured attestation and manifest revision', async () => {
  const warning = {
    code: 'stem.negative_lead_in',
    field: 'stem',
    message: 'Confirm that the negative lead-in is intentional.',
  };
  const warningAssessment = () => ({ gate: 'warning', blockers: [], warnings: [warning] });
  const attestedRevision = testRevision('reauth-attested');
  let current = validDomQuestion();
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      const key = options.headers['x-faculty-key'];
      posts.push({ body, key });
      if (key !== 'correct-key') {
        return jsonResponse({ error: { code: 'unauthorized', message: 'Wrong key.' } }, {
          ok: false,
          status: 401,
        });
      }
      current = { ...current, status: 'attested', revision: attestedRevision };
      return jsonResponse({
        ok: true,
        action: 'qbank.attest',
        updated: 1,
        revision: { qb_moo_902: attestedRevision },
        assessment: { qb_moo_902: warningAssessment() },
        commit: null,
      });
    }
    return jsonResponse(serverState({ question: current }));
  };
  const { controller, document, window } = await startHarness({ fetchImpl, assessItemImpl: warningAssessment });
  await makeCurrentQuestionPreviewReady({ controller, document, window });
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  await setChecked(document, 'ack-stem-negative_lead_in');
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.equal(posts.length, 1);
  assert.ok(document.getElementById('faculty-key'));
  controller.state.server.manifestRevision = 'c'.repeat(40);
  controller.state.confirmations.clinical = false;
  const keyInput = document.getElementById('faculty-key');
  keyInput.value = 'correct-key';
  await keyInput.parentNode.parentNode.dispatch('submit');
  await flushAsyncWork();

  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.manifestRevision, DEFAULT_MANIFEST_REVISION);
  assert.deepEqual(posts[1].body, posts[0].body);
  assert.equal(controller.state.original.revision, attestedRevision);
  assert.equal(document.activeElement?.getAttribute('id'), 'qbank-action-result');
});

test('attestation keeps the captured entry and confirmations immutable while POST and refresh are pending', async () => {
  const warning = {
    code: 'stem.pending_warning',
    field: 'stem',
    message: 'Acknowledge the pending synthetic warning.',
  };
  const warningAssessment = () => ({ gate: 'warning', blockers: [], warnings: [warning] });
  const postGate = deferred();
  const refreshGate = deferred();
  const attestedRevision = testRevision('pending-attested');
  let gets = 0;
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      return postGate.promise;
    }
    gets += 1;
    if (gets === 1) return jsonResponse(serverState());
    return refreshGate.promise;
  };
  const { controller, document, window } = await startHarness({ fetchImpl, assessItemImpl: warningAssessment });
  await makeCurrentQuestionPreviewReady({ controller, document, window });
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  await setChecked(document, 'ack-stem-pending_warning');
  await document.getElementById('attest-current-item').dispatch('click');
  await flushAsyncWork();

  assert.equal(controller.state.pending, true);
  assert.equal(document.getElementById('console-background')?.getAttribute('inert'), '');
  assert.match(document.getElementById('qbank-action-result').textContent,
    /Saving and confirming this attestation/);
  assert.doesNotMatch(document.getElementById('qbank-action-result').textContent, /Attested/);
  const clinical = document.getElementById('confirm-clinical');
  clinical.checked = false;
  await clinical.dispatch('change');
  const pendingStem = document.getElementById('question-stem');
  pendingStem.value = 'Attestation-time mutation must not enter state.';
  await pendingStem.dispatch('input');
  await document.getElementById('lock-console').dispatch('click');
  assert.equal(controller.state.confirmations.clinical, true);
  assert.equal(controller.state.editor.stem, validDomQuestion().stem);
  assert.equal(controller.state.selectedKey, 'question:qb_moo_902');
  assert.ok(controller.state.server);

  postGate.resolve(jsonResponse({
    ok: true,
    action: 'qbank.attest',
    updated: 1,
    revision: { qb_moo_902: attestedRevision },
    assessment: { qb_moo_902: warningAssessment() },
    commit: null,
  }));
  await flushAsyncWork();
  assert.equal(controller.state.pending, true);
  assert.deepEqual(posted.items, [{
    id: 'qb_moo_902',
    revision: testRevision('revision-one'),
    reviewedRevision: testRevision('revision-one'),
    acknowledgedWarnings: ['stem.pending_warning'],
  }]);

  refreshGate.resolve(jsonResponse(serverState({
    question: validDomQuestion({ status: 'attested', revision: attestedRevision }),
  })));
  await flushAsyncWork();
  assert.equal(controller.state.pending, false);
  assert.equal(controller.state.original.status, 'attested');
  assert.equal(controller.state.original.revision, attestedRevision);
});

test('save and refresh keep the editor and navigation inert until the captured revision is confirmed', async () => {
  const first = validDomQuestion({ id: 'qb_moo_901', revision: testRevision('pending-first') });
  const second = validDomQuestion({
    id: 'qb_moo_902',
    revision: testRevision('pending-second'),
    stem: 'A second queue item should remain unopened. What is the diagnosis?',
  });
  const postGate = deferred();
  const refreshGate = deferred();
  let gets = 0;
  let posted;
  const savedRevision = testRevision('pending-saved');
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      return postGate.promise;
    }
    gets += 1;
    if (gets === 1) return jsonResponse(serverState({ questions: [first, second] }));
    return refreshGate.promise;
  };
  const { controller, document } = await startHarness({
    fetchImpl,
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });

  const savedStem = 'This captured draft must survive both deferred requests. What is the diagnosis?';
  await setValue(document, 'question-stem', savedStem);
  await document.getElementById('save-draft').dispatch('click');
  await flushAsyncWork();

  assert.equal(controller.state.pending, true);
  assert.equal(document.getElementById('console-background')?.getAttribute('inert'), '');
  const pendingStem = document.getElementById('question-stem');
  pendingStem.value = 'A post-click mutation must not enter state.';
  await pendingStem.dispatch('input');
  const selector = document.getElementById('review-item-selector');
  selector.value = 'question:qb_moo_902';
  await selector.dispatch('change');
  await document.getElementById('lock-console').dispatch('click');
  assert.equal(controller.state.editor.stem, savedStem);
  assert.equal(controller.state.selectedId, 'qb_moo_901');
  assert.equal(controller.state.selectedKey, 'question:qb_moo_901');
  assert.ok(controller.state.server);

  postGate.resolve(jsonResponse({
    ok: true,
    action: 'qbank.save-draft',
    revision: savedRevision,
    assessment: { gate: 'ready', blockers: [], warnings: [] },
    commit: null,
  }));
  await flushAsyncWork();
  assert.equal(controller.state.pending, true);
  assert.equal(document.getElementById('console-background')?.getAttribute('inert'), '');
  const refreshStem = document.getElementById('question-stem');
  refreshStem.value = 'A refresh-time mutation must also be ignored.';
  await refreshStem.dispatch('input');
  assert.equal(controller.state.editor.stem, savedStem);

  refreshGate.resolve(jsonResponse(serverState({
    questions: [
      { ...structuredClone(posted.item), status: 'draft', revision: savedRevision },
      second,
    ],
  })));
  await flushAsyncWork();
  assert.equal(controller.state.pending, false);
  assert.equal(controller.state.original.revision, savedRevision);
  assert.equal(controller.state.editor.stem, savedStem);
  assert.deepEqual(controller.state.dirtyFields, []);
});

test('fails closed when authenticated state omits concurrency or assessment context', async () => {
  const incomplete = serverState();
  delete incomplete.manifestPages;
  incomplete.qbank[0] = { ...incomplete.qbank[0] };
  delete incomplete.qbank[0].revision;
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(incomplete),
  });
  assert.equal(controller.state.server, null);
  assert.match(document.app.textContent, /incomplete state/i);
  assert.equal(document.activeElement?.getAttribute('role'), 'alert');
});

for (const [name, manifestRevision] of [
  ['missing', undefined],
  ['blank', ' '.repeat(40)],
  ['non-hex', 'g'.repeat(40)],
  ['39-character', 'a'.repeat(39)],
  ['65-character', 'a'.repeat(65)],
  ['non-string', 7],
]) {
  test(`fails closed when authenticated state has a ${name} manifest revision`, async () => {
    const payload = serverState();
    if (manifestRevision === undefined) delete payload.manifestRevision;
    else payload.manifestRevision = manifestRevision;
    const { controller, document } = await startHarness({
      fetchImpl: async () => jsonResponse(payload),
    });

    assert.equal(controller.state.server, null);
    assert.match(document.app.textContent, /incomplete state/i);
  });
}

test('a successful load with a changed manifest revision invalidates all review-session approval state', async () => {
  let manifestRevision = DEFAULT_MANIFEST_REVISION;
  const fetchImpl = async () => jsonResponse(serverState({ manifestRevision }));
  const { controller } = await startHarness({ fetchImpl });

  controller.state.reviewedRevisions.set('qb_moo_902', validDomQuestion().revision);
  controller.state.confirmations = {
    clinical: true,
    evidence: true,
    originalityAndNoPhi: true,
  };

  manifestRevision = 'c'.repeat(40);
  assert.equal(await controller.load({ silent: true }), true);

  assert.deepEqual([...controller.state.reviewedRevisions], []);
  assert.deepEqual(controller.state.confirmations, {
    clinical: false,
    evidence: false,
    originalityAndNoPhi: false,
  });
});

test('a valid changed-manifest GET invalidates approvals even when post-write revision confirmation fails', async () => {
  let manifestRevision = DEFAULT_MANIFEST_REVISION;
  const fetchImpl = async () => jsonResponse(serverState({ manifestRevision }));
  const { controller } = await startHarness({ fetchImpl });

  controller.state.reviewedRevisions.set('qb_moo_902', validDomQuestion().revision);
  controller.state.confirmations = {
    clinical: true,
    evidence: true,
    originalityAndNoPhi: true,
  };
  manifestRevision = 'c'.repeat(40);

  const loaded = await controller.load({
    silent: true,
    expectedRevisions: { qb_moo_902: testRevision('not-the-returned-revision') },
    preserveOnError: true,
  });

  assert.equal(loaded, false);
  assert.deepEqual([...controller.state.reviewedRevisions], []);
  assert.deepEqual(controller.state.confirmations, {
    clinical: false,
    evidence: false,
    originalityAndNoPhi: false,
  });
});

test('fails closed when manifest pages are blank or question revisions are not exact SHA-256 hex', async () => {
  const emptyManifestHarness = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({ manifestPages: [] })),
  });
  assert.equal(emptyManifestHarness.controller.state.server, null);
  assert.match(emptyManifestHarness.document.app.textContent, /incomplete state/i);

  const blankPageState = serverState({ manifestPages: ['t_mood.md', '   '] });
  const blankPageHarness = await startHarness({
    fetchImpl: async () => jsonResponse(blankPageState),
  });
  assert.equal(blankPageHarness.controller.state.server, null);
  assert.match(blankPageHarness.document.app.textContent, /incomplete state/i);

  const shortRevisionState = serverState({
    question: validDomQuestion({ revision: 'a'.repeat(63) }),
  });
  const shortRevisionHarness = await startHarness({
    fetchImpl: async () => jsonResponse(shortRevisionState),
  });
  assert.equal(shortRevisionHarness.controller.state.server, null);
  assert.match(shortRevisionHarness.document.app.textContent, /incomplete state/i);

  const nonHexRevisionState = serverState({
    question: validDomQuestion({ revision: 'g'.repeat(64) }),
  });
  const nonHexRevisionHarness = await startHarness({
    fetchImpl: async () => jsonResponse(nonHexRevisionState),
  });
  assert.equal(nonHexRevisionHarness.controller.state.server, null);
  assert.match(nonHexRevisionHarness.document.app.textContent, /incomplete state/i);
});

test('shortcut saves a dirty selected question only in Edit question', async () => {
  let current = validDomQuestion();
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      posts.push(body);
      current = { ...structuredClone(body.item), status: 'draft', revision: testRevision('shortcut-revision') };
      return jsonResponse({
        ok: true,
        action: 'qbank.save-draft',
        revision: testRevision('shortcut-revision'),
        assessment: { gate: 'ready', blockers: [], warnings: [] },
        commit: null,
      });
    }
    return jsonResponse(serverState({ question: current }));
  };
  const { document, window } = await startHarness({ fetchImpl });
  await setValue(document, 'question-stem', 'Save this question with the keyboard?');
  let shortcut = await window.dispatch('keydown', {
    metaKey: false,
    ctrlKey: true,
    key: 's',
  });
  await flushAsyncWork();
  assert.equal(shortcut.defaultPrevented, true);
  assert.equal(posts.length, 0);
  assert.equal(document.status.textContent, 'Open Edit question to save this draft.');

  await document.getElementById('view-draft').dispatch('click');
  shortcut = await window.dispatch('keydown', {
    metaKey: true,
    ctrlKey: false,
    key: 's',
  });
  await flushAsyncWork();
  assert.equal(shortcut.defaultPrevented, true);
  assert.equal(posts.length, 0);
  assert.equal(document.status.textContent, 'Open Edit question to save this draft.');

  await document.getElementById('view-edit').dispatch('click');
  shortcut = await window.dispatch('keydown', {
    metaKey: false,
    ctrlKey: true,
    key: 's',
  });
  await flushAsyncWork();
  assert.equal(shortcut.defaultPrevented, true);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].action, 'qbank.save-draft');
  assert.equal(posts[0].target, undefined);
});

test('Ctrl or Command S in the unsaved-navigation modal saves and continues its destination', async () => {
  const first = validDomQuestion({
    id: 'qb_moo_901',
    revision: testRevision('shortcut-guard-first'),
  });
  const second = validDomQuestion({
    id: 'qb_moo_902',
    revision: testRevision('shortcut-guard-second'),
    stem: 'A second saved question is the guarded destination. What is the diagnosis?',
  });
  const savedRevision = testRevision('shortcut-guard-saved');
  let questions = [first, second];
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      posts.push(body);
      questions = questions.map(questionItem => questionItem.id === body.id
        ? { ...structuredClone(body.item), status: 'draft', revision: savedRevision }
        : questionItem);
      return jsonResponse({
        ok: true,
        action: 'qbank.save-draft',
        revision: savedRevision,
        assessment: { gate: 'ready', blockers: [], warnings: [] },
        commit: null,
      });
    }
    return jsonResponse(serverState({ questions }));
  };
  const { controller, document, window } = await startHarness({
    fetchImpl,
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  await document.getElementById('view-edit').dispatch('click');
  await setValue(document, 'question-stem', 'Save this guarded local candidate?');
  const selector = document.getElementById('review-item-selector');
  selector.value = 'question:qb_moo_902';
  await selector.dispatch('change');
  assert.ok(document.getElementById('unsaved-guard'));

  const shortcut = await window.dispatch('keydown', {
    metaKey: false,
    ctrlKey: true,
    key: 's',
  });
  await flushAsyncWork();

  assert.equal(shortcut.defaultPrevented, true);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, first.id);
  assert.equal(posts[0].item.stem, 'Save this guarded local candidate?');
  assert.equal(controller.state.selectedId, second.id);
  assert.equal(controller.state.navigationGuard, null);
  assert.equal(controller.state.navigationAfterSave, null);
  assert.equal(document.getElementById('unsaved-guard'), null);
  assert.equal(document.activeElement?.getAttribute('id'), 'review-item-selector');
});

test('one click attests a page: no checkboxes, all three assertions recorded, auto-advance', async () => {
  // 51 items × 4 clicks was the complaint. The rule this pins is that fewer
  // clicks may not mean asserting less: pressing the button must set the same
  // three flags the checkboxes set, and its label must say so.
  let items = [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'unreviewed' },
  ];
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      const [[slug, reviewed]] = Object.entries(posted.changes);
      items = items.map(item => (item.slug === slug
        ? { ...item, status: reviewed ? 'reviewed' : 'unreviewed' }
        : item));
      return jsonResponse({ ok: true, updated: 1, commit: 'https://github.example/commit/one-click' });
    }
    return jsonResponse(serverState({ items, questions: [] }));
  };
  const harness = await startHarness({ fetchImpl });
  const { controller, document } = harness;

  await makeCurrentContentPreviewReady(harness);

  // Nothing ticked, yet the action is already available.
  assert.deepEqual(controller.state.reviewChecks, {
    completeItemReviewed: false,
    liveReviewed: false,
    separateTabReviewed: false,
    liveUnavailableAcknowledged: false,
    accuracy: false,
    interactions: false,
  });
  const button = document.getElementById('attest-current-item');
  assert.equal(button.disabled, false, 'a ready learner surface is the only precondition');
  assert.match(button.textContent, /reviewed · accurate for MS3 · links tested/);
  assert.equal(button.getAttribute('aria-keyshortcuts'), 'a');

  await button.dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(posted, { target: 'content', changes: { 't_mood.md': true }, reasons: {} });
  assert.equal(controller.state.contentMessage, 'Attested t_mood.md.');
  // The item is held, not skipped: the confirmation and commit link stay on
  // screen. Next is focused, so advancing is one Enter.
  assert.equal(controller.state.selectedKey, 'page:t_mood.md');
  assert.equal(controller.state.completedHoldKey, 'page:t_mood.md');
});

test('one click is withheld when the learner surface never rendered', async () => {
  // "I reviewed this item in the separate tab" is not a claim a button press can
  // make for the reviewer, so a failed preview keeps the granular path.
  const harness = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [{ slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' }],
      questions: [],
    })),
  });
  const { controller, document, window } = harness;

  await reportPreviewStatus(window, controller, 'error');
  const button = document.getElementById('attest-current-item');
  assert.equal(button.textContent, 'Attest this page', 'no one-click label');
  assert.equal(button.getAttribute('aria-keyshortcuts'), null, 'no keyboard shortcut either');
  assert.equal(button.disabled, true);
});

test('a clean ready-preview draft renders ONE compound receipt control', async () => {
  const harness = await startHarnessWithReadyPreviewDraft();
  const { document } = harness;
  const compound = document.getElementById('review-compound');
  assert.ok(compound, 'compound checkbox renders');
  assert.equal(compound.getAttribute('aria-keyshortcuts'), 'r');
  assert.match(
    compound.parentNode.textContent,
    /I reviewed this draft at its saved revision and its live rendering/,
  );
  assert.equal(document.getElementById('review-saved-revision'), null, 'separate draft box gone');
  assert.equal(document.getElementById('review-live-preview'), null, 'separate live box gone');
});

test('checking the compound receipt records both state slices atomically; unchecking clears both', async () => {
  const harness = await startHarnessWithReadyPreviewDraft();
  const { controller, document } = harness;
  await setChecked(document, 'review-compound');
  const item = controller.state.reviewItems.find(candidate => candidate.type === 'question');
  assert.equal(
    controller.state.reviewedRevisions.get(item.identity), item.revision,
    'revision-anchored receipt recorded',
  );
  assert.equal(controller.state.reviewChecks.liveReviewed, true);
  await setChecked(document, 'review-compound', false);
  assert.equal(controller.state.reviewedRevisions.has(item.identity), false);
  assert.equal(controller.state.reviewChecks.liveReviewed, false);
});

test('a degraded preview keeps the separate explicit acknowledgments', async () => {
  const harness = await startHarnessWithFailedPreviewDraft();
  const { document } = harness;
  assert.equal(document.getElementById('review-compound'), null, 'no compound on degraded path');
  assert.ok(document.getElementById('review-saved-revision'), 'separate draft box present');
});

test('a dirty draft renders no compound control and the hint remains', async () => {
  const harness = await startHarnessWithReadyPreviewDraft({ dirty: true });
  const { document } = harness;
  assert.equal(document.getElementById('review-compound'), null);
  assert.ok(document.getElementById('review-saved-revision'));
});
