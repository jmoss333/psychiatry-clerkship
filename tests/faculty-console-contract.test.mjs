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
    'Reviewer label',
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

  assert.match(appSource, /not verified identit/i);
  assert.match(appSource, /Revert/);
  assert.match(appSource, /Save draft/);
  assert.match(appSource, /Attest this warning question/);
  assert.match(appSource, /Review[^\n]+Resolve[^\n]+Confirm/);
  assert.match(appSource, /Ready|Warning|Blocked/);
  assert.doesNotMatch(appSource, /role:\s*'tablist'/);
  assert.doesNotMatch(appSource, /function renderTabNavigation|function renderBatchSummary|function renderBatchConfirmation/);
  assert.doesNotMatch(appSource, /Attest selected green drafts|Mark reviewed & next|queue checkbox|green batch/i);
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
  assert.match(appSource, /Object\.keys\(state\.contentChanges\)\.length\s*>\s*0/);
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
      { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
      { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed' },
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
  assert.deepEqual(filterReviewItems(items, {
    search: 'anchor-only', type: 'all', status: 'needs-review',
    category: 'all', gate: 'all', difficulty: 'all',
  }).map(item => item.key), ['question:qb_moo_003']);
  assert.deepEqual(deriveReviewCounts(items), {
    total: 4, needsReview: 3, complete: 1, page: 1, tool: 1, question: 2,
  });
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

test('targeted queue, reviewer, view, editor, and rail updates keep the learner iframe alive', async () => {
  const { controller, document } = await startHarness({
    assessItemImpl: () => ({ gate: 'ready', blockers: [], warnings: [] }),
  });
  const selector = document.getElementById('review-item-selector');
  selector.value = 'question:qb_moo_902';
  await selector.dispatch('change');
  const frame = document.getElementById('learner-preview-frame');
  const frameWindow = frame.contentWindow;

  const reviewer = document.getElementById('reviewer-label');
  reviewer.value = 'Faculty reviewer';
  await reviewer.dispatch('input');
  await setValue(document, 'review-search', 'qb_moo_902');
  await document.getElementById('view-edit').dispatch('click');
  await setValue(document, 'question-stem', 'A targeted local edit. What is the diagnosis?');
  await setChecked(document, 'confirm-clinical');

  assert.equal(controller.state.reviewerLabel, 'Faculty reviewer');
  assert.equal(document.getElementById('learner-preview-frame'), frame);
  assert.equal(document.getElementById('learner-preview-frame').contentWindow, frameWindow);
  assert.match(document.getElementById('selected-item-view').textContent, /Edit question/);
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
  assert.equal(document.getElementById('attest-warning').disabled, true);
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
    'action', 'attester', 'baseRevision', 'id', 'item', 'manifestRevision',
  ]);
  assert.equal(posted.action, 'qbank.save-draft');
  assert.equal(posted.manifestRevision, DEFAULT_MANIFEST_REVISION);
  assert.equal(posted.id, 'qb_moo_902');
  assert.equal(posted.baseRevision, testRevision('revision-one'));
  assert.equal(posted.attester, 'Joshua Moss, MD');
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
  await document.getElementById('save-draft').dispatch('click');
  await flushAsyncWork();

  const conflict = document.getElementById('qbank-conflict');
  assert.equal(conflict?.getAttribute('role'), 'alert');
  assert.match(conflict.textContent, /This review context changed in the repository/);
  assert.equal(document.activeElement, conflict);
  assert.ok(document.find('button', 'Reload'));
  assert.ok(document.find('button', 'Keep local copy'));
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

test('Lock saves content-only changes through the same guard before ending the session', async () => {
  let items = serverState().items;
  let posted;
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      posted = JSON.parse(options.body);
      items = items.map(item => ({ ...item, status: 'reviewed' }));
      return jsonResponse({ ok: true, updated: 1, commit: null });
    }
    return jsonResponse(serverState({ items }));
  };
  const { controller, document } = await startHarness({ fetchImpl });
  controller.state.contentChanges['t_mood.md'] = true;
  await document.getElementById('lock-console').dispatch('click');

  assert.ok(document.getElementById('unsaved-guard'));
  assert.equal(document.getElementById('unsaved-save').textContent, 'Save content reviews');
  await document.getElementById('unsaved-save').dispatch('click');
  await flushAsyncWork();

  assert.equal(posted.target, 'content');
  assert.equal(Object.hasOwn(posted, 'manifestRevision'), false);
  assert.equal(controller.state.server, null);
  assert.ok(document.getElementById('faculty-key'));
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
  const { controller, document } = await startHarness({
    fetchImpl,
    assessItemImpl: warningAssessment,
  });
  const attest = document.getElementById('attest-warning');
  assert.equal(attest.disabled, true);
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  assert.equal(document.getElementById('attest-warning').disabled, true);
  await setChecked(document, 'ack-stem-negative_lead_in');
  assert.equal(document.getElementById('attest-warning').disabled, false);
  await document.getElementById('attest-warning').dispatch('click');
  await flushAsyncWork();

  assert.deepEqual(Object.keys(posted).sort(), [
    'action', 'attester', 'confirmations', 'items', 'manifestRevision',
  ]);
  assert.equal(posted.action, 'qbank.attest');
  assert.equal(posted.manifestRevision, DEFAULT_MANIFEST_REVISION);
  assert.deepEqual(posted.items, [{
    id: 'qb_moo_902',
    revision: testRevision('revision-one'),
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
  const { controller, document } = await startHarness({ fetchImpl, assessItemImpl: warningAssessment });
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  await setChecked(document, 'ack-stem-negative_lead_in');
  await document.getElementById('attest-warning').dispatch('click');
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
  const { controller, document } = await startHarness({ fetchImpl, assessItemImpl: warningAssessment });
  for (const id of ['confirm-clinical', 'confirm-evidence', 'confirm-originality']) {
    await setChecked(document, id);
  }
  await setChecked(document, 'ack-stem-pending_warning');
  await document.getElementById('attest-warning').dispatch('click');
  await flushAsyncWork();

  assert.equal(controller.state.pending, true);
  assert.equal(document.getElementById('console-background')?.getAttribute('inert'), '');
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

  controller.state.reviewedInSession.add('qb_moo_902');
  controller.state.reviewedRevisions.set('qb_moo_902', validDomQuestion().revision);
  controller.state.batch.add('qb_moo_902');
  controller.state.batchConfirmation = { entries: [{ id: 'qb_moo_902' }] };
  controller.state.confirmations = {
    clinical: true,
    evidence: true,
    originalityAndNoPhi: true,
  };

  manifestRevision = 'c'.repeat(40);
  assert.equal(await controller.load({ silent: true }), true);

  assert.deepEqual([...controller.state.reviewedInSession], []);
  assert.deepEqual([...controller.state.reviewedRevisions], []);
  assert.deepEqual([...controller.state.batch], []);
  assert.equal(controller.state.batchConfirmation, null);
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

  controller.state.reviewedInSession.add('qb_moo_902');
  controller.state.reviewedRevisions.set('qb_moo_902', validDomQuestion().revision);
  controller.state.batch.add('qb_moo_902');
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
  assert.deepEqual([...controller.state.reviewedInSession], []);
  assert.deepEqual([...controller.state.reviewedRevisions], []);
  assert.deepEqual([...controller.state.batch], []);
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

test('Ctrl or Command S saves the dirty selected question only', async () => {
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
  const shortcut = await window.dispatch('keydown', {
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
