import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveQueueCounts,
  filteredQuestions,
  isBatchEligible,
  startFacultyConsole,
} from '../faculty-console/app.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(repo, 'faculty-console/index.html'), 'utf8');
const appSource = readFileSync(path.join(repo, 'faculty-console/app.mjs'), 'utf8');

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
    revision: 'revision-one',
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
    this._text = '';
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
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  focus() {
    if (!this.disabled) this.ownerDocument.activeElement = this;
  }

  setSelectionRange() {}

  async dispatch(type, properties = {}) {
    const event = {
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties,
    };
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

  links() {
    return this.elements().filter(element => element.tagName === 'A');
  }
}

class FakeWindow {
  constructor(key = 'test-faculty-key') {
    this.listeners = new Map();
    this.storage = new Map(key ? [['fac_key', key]] : []);
    this.sessionStorage = {
      getItem: name => this.storage.get(name) || null,
      setItem: (name, value) => this.storage.set(name, String(value)),
      removeItem: name => this.storage.delete(name),
    };
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
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

function serverState({ question: item = validDomQuestion(), items } = {}) {
  const contentItems = items || [{
    slug: 't_mood.md',
    title: 'Mood disorders',
    kind: 'page',
    status: 'unreviewed',
    by: 'Dr <Faculty>',
    at: '2026-07-17',
  }];
  return {
    student: 'https://students.example/',
    qbankRevision: 'a'.repeat(40),
    manifestPages: ['t_mood.md'],
    qbank: [item],
    qbankSummary: { counts: { total: 1, draft: 1, attested: 0, ready: 1, warning: 0, blocked: 0 } },
    items: contentItems,
    counts: { pagesReviewed: 0, pagesTotal: contentItems.length, qbankAttested: 0, qbankTotal: 1 },
  };
}

function jsonResponse(body, { ok = true, status = ok ? 200 : 500 } = {}) {
  return { ok, status, json: async () => body };
}

async function flushAsyncWork() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

async function startHarness({ fetchImpl, assessItemImpl } = {}) {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const requests = [];
  const fetcher = fetchImpl || (async (url, options = {}) => {
    requests.push({ url, options });
    return jsonResponse(serverState());
  });
  const controller = startFacultyConsole({ document, window, fetchImpl: fetcher, assessItemImpl });
  await flushAsyncWork();
  return { controller, document, window, requests };
}

test('exports the injectable faculty-console browser entry', () => {
  assert.equal(typeof startFacultyConsole, 'function');
  assert.match(
    appSource,
    /export function startFacultyConsole\s*\(\{\s*document,\s*window,\s*fetchImpl\s*=\s*fetch,\s*assessItemImpl\s*=\s*assessItem,?\s*\}\)/,
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

test('creates semantic tabs, queue controls, and persistent field labels', () => {
  for (const contract of [
    /role:\s*'tablist'/,
    /role:\s*'tab'/,
    /role:\s*'tabpanel'/,
    /'aria-selected'/,
    /'aria-current'/,
    /el\('fieldset'/,
    /el\('legend'/,
  ]) assert.match(appSource, contract);

  for (const label of [
    'Faculty key',
    'Reviewer label',
    'Search questions',
    'Category',
    'Status',
    'Review gate',
    'Difficulty',
  ]) assert.ok(appSource.includes(label), `Missing persistent label: ${label}`);

  assert.match(appSource, /not verified identit/i);
  assert.match(appSource, /Mark reviewed & next/);
  assert.match(appSource, /Ready|Warning|Blocked/);
});

test('restores focus to the active tab after click-driven rendering', () => {
  assert.match(appSource, /onClick:\s*\(\)\s*=>\s*activateTab\(name,\s*true\)/);
});

test('renders repository text without HTML parsing sinks', () => {
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(appSource, /insertAdjacentHTML|document\.write\s*\(/);
  assert.match(appSource, /document\.createTextNode/);
  assert.match(appSource, /replaceChildren/);
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
});

test('uses the approved clinical workbench layout and accessible primary contrast', () => {
  const primary = html.match(/--primary:\s*(#[0-9a-f]{6})/i)?.[1];
  const primaryText = html.match(/--primary-text:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.equal(primary?.toLowerCase(), '#3f5c45');
  assert.equal(primaryText?.toLowerCase(), '#ffffff');
  assert.ok(contrastRatio(primary, primaryText) >= 4.5);

  assert.match(
    html.replace(/\s+/g, ' '),
    /grid-template-columns:\s*minmax\(280px,\s*340px\)\s+minmax\(0,\s*1fr\)/,
  );
  assert.match(html, /@media\s*\(max-width:\s*760px\)/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(html, /\.queue-row::before/);
  assert.doesNotMatch(html, /linear-gradient|radial-gradient|@keyframes/);
});

test('filters search text and dimensions, then sorts by category and ID', () => {
  const server = {
    qbank: [
      question({ id: 'qb_psy_010', category: 'psychosis', difficulty: 3 }),
      question({ id: 'qb_moo_003', evidence: 'anchor-only phrase' }),
      question({ id: 'qb_moo_001', pages: ['unique-page.md'] }),
      question({ id: 'qb_moo_004', status: 'attested' }),
      question({
        id: 'qb_moo_005',
        assessment: { gate: 'warning', blockers: [], warnings: [{ code: 'stem.lead_in' }] },
      }),
    ],
  };
  const base = {
    search: '', category: 'all', status: 'all', gate: 'all', difficulty: 'all',
  };

  assert.deepEqual(
    filteredQuestions(server, base).map(item => item.id),
    ['qb_moo_001', 'qb_moo_003', 'qb_moo_004', 'qb_moo_005', 'qb_psy_010'],
  );
  assert.deepEqual(
    filteredQuestions(server, { ...base, search: 'anchor-only' }).map(item => item.id),
    ['qb_moo_003'],
  );
  assert.deepEqual(
    filteredQuestions(server, { ...base, search: 'unique-page' }).map(item => item.id),
    ['qb_moo_001'],
  );
  assert.deepEqual(
    filteredQuestions(server, {
      ...base, category: 'mood', status: 'draft', gate: 'warning', difficulty: '2',
    }).map(item => item.id),
    ['qb_moo_005'],
  );
});

test('derives queue counts without hard-coded totals', () => {
  const questions = [
    question({ id: 'qb_moo_001' }),
    question({
      id: 'qb_moo_002',
      assessment: { gate: 'warning', blockers: [], warnings: [{ code: 'stem.lead_in' }] },
    }),
    question({
      id: 'qb_moo_003',
      assessment: { gate: 'blocked', blockers: [{ code: 'required.stem' }], warnings: [] },
    }),
    question({ id: 'qb_moo_004', status: 'attested' }),
  ];
  assert.deepEqual(deriveQueueCounts(questions), {
    draft: 3,
    ready: 2,
    warning: 1,
    blocked: 1,
    attested: 1,
  });
});

test('batch eligibility requires a saved green draft reviewed in this session', () => {
  const reviewed = new Set(['qb_moo_002']);
  assert.equal(isBatchEligible(question(), reviewed, false), true);
  assert.equal(isBatchEligible(question(), new Set(), false), false);
  assert.equal(isBatchEligible(question({ status: 'attested' }), reviewed, false), false);
  assert.equal(isBatchEligible(question({
    assessment: { gate: 'warning', blockers: [], warnings: [{ code: 'stem.lead_in' }] },
  }), reviewed, false), false);
  assert.equal(isBatchEligible(question(), reviewed, true), false);
});

test('opening then reviewing a green saved revision enables only its batch checkbox', async () => {
  let revision = 'revision-one';
  const harness = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      question: validDomQuestion({ revision }),
    })),
  });
  const { controller, document } = harness;
  const queueButton = document.getElementById('queue-qb_moo_902');
  assert.ok(queueButton);
  await queueButton.dispatch('click');

  const mark = document.find('button', 'Mark reviewed & next');
  assert.ok(mark);
  assert.equal(mark.disabled, false);
  await mark.dispatch('click');

  let checkbox = document.getElementById('batch-qb_moo_902');
  assert.equal(checkbox.disabled, false);
  assert.equal(controller.state.reviewedInSession.has('qb_moo_902'), true);

  revision = 'revision-two';
  await controller.load({ silent: true });
  await flushAsyncWork();
  checkbox = document.getElementById('batch-qb_moo_902');
  assert.equal(checkbox.disabled, true);
  assert.equal(controller.state.reviewedInSession.has('qb_moo_902'), false);
});

test('an assessment exception renders a blocker and revokes session batch eligibility', async () => {
  const harness = await startHarness({
    assessItemImpl: () => { throw new Error('synthetic assessor failure'); },
  });
  const { controller, document } = harness;
  controller.state.reviewedInSession.add('qb_moo_902');
  controller.state.reviewedRevisions.set('qb_moo_902', 'revision-one');

  await controller.load({ silent: true });
  await flushAsyncWork();

  const checkbox = document.getElementById('batch-qb_moo_902');
  const queueButton = document.getElementById('queue-qb_moo_902');
  const mark = document.find('button', 'Mark reviewed & next');
  assert.equal(controller.state.reviewedInSession.has('qb_moo_902'), false);
  assert.equal(checkbox.disabled, true);
  assert.match(queueButton.parentNode.className, /gate-blocked/);
  assert.equal(mark.disabled, true);
  assert.match(document.app.textContent, /Automated checks could not run/);
  assert.ok(document.find('p', 'Only questions with a green Ready gate can enter a batch.'));
});

test('Ctrl or Command S routes Content changes to commit and qbank to draft save', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === 'POST') return jsonResponse({ ok: true, updated: 1, commit: null });
    return jsonResponse(serverState());
  };
  const { document, window } = await startHarness({ fetchImpl });
  await document.getElementById('tab-content').dispatch('click');
  const contentCheckbox = document.getElementById('content-t_mood-md');
  contentCheckbox.checked = true;
  await contentCheckbox.dispatch('change');

  const contentShortcut = await window.dispatch('keydown', {
    metaKey: true,
    ctrlKey: false,
    key: 's',
  });
  await flushAsyncWork();
  assert.equal(contentShortcut.defaultPrevented, true);
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 1);

  await document.getElementById('tab-qbank').dispatch('click');
  const qbankShortcut = await window.dispatch('keydown', {
    metaKey: false,
    ctrlKey: true,
    key: 's',
  });
  await flushAsyncWork();
  assert.equal(qbankShortcut.defaultPrevented, true);
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 1);
  assert.equal(document.status.textContent, 'No unsaved question changes to save.');
});

test('Content renders provenance safely and restores focus after mark-all and successful save', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === 'POST') {
      return jsonResponse({
        ok: true,
        updated: 1,
        commit: 'https://github.example/commit/safe-receipt',
      });
    }
    return jsonResponse(serverState());
  };
  const { document } = await startHarness({ fetchImpl });
  await document.getElementById('tab-content').dispatch('click');
  assert.match(document.app.textContent, /Reviewed by Dr <Faculty> on 2026-07-17/);

  const markAll = document.getElementById('mark-all-content');
  assert.ok(markAll);
  await markAll.dispatch('click');
  assert.equal(document.activeElement?.getAttribute('id'), 'mark-all-content');

  const save = document.getElementById('save-content-reviews');
  assert.equal(save.disabled, false);
  await save.dispatch('click');
  await flushAsyncWork();
  assert.equal(document.activeElement?.getAttribute('id'), 'content-save-result');
  const commitLink = document.links().find(link => link.textContent === 'View commit ↗');
  assert.equal(commitLink?.getAttribute('href'), 'https://github.example/commit/safe-receipt');
});

test('Content rejects an unsafe commit URL and restores focus after a failed save', async () => {
  let responseMode = 'unsafe-success';
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      if (responseMode === 'unsafe-success') {
        return jsonResponse({ ok: true, updated: 1, commit: 'javascript:alert(1)' });
      }
      return jsonResponse({ error: { message: 'Synthetic save failure' } }, { ok: false, status: 500 });
    }
    return jsonResponse(serverState());
  };
  const { controller, document } = await startHarness({ fetchImpl });
  await document.getElementById('tab-content').dispatch('click');
  let checkbox = document.getElementById('content-t_mood-md');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  await document.getElementById('save-content-reviews').dispatch('click');
  await flushAsyncWork();
  assert.equal(document.links().some(link => link.textContent === 'View commit ↗'), false);
  assert.equal(document.activeElement?.getAttribute('id'), 'content-save-result');

  responseMode = 'failure';
  controller.state.contentChanges['t_mood.md'] = true;
  controller.state.tab = 'content';
  await controller.load({ silent: true, focusId: 'save-content-reviews' });
  await flushAsyncWork();
  checkbox = document.getElementById('content-t_mood-md');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  await document.getElementById('save-content-reviews').dispatch('click');
  await flushAsyncWork();
  assert.match(document.app.textContent, /Synthetic save failure/);
  assert.equal(document.activeElement?.getAttribute('id'), 'content-save-result');
});

test('Content rejects an unencrypted HTTP commit receipt', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      return jsonResponse({
        ok: true,
        updated: 1,
        commit: 'http://github.example/commit/insecure-receipt',
      });
    }
    return jsonResponse(serverState());
  };
  const { document } = await startHarness({ fetchImpl });
  await document.getElementById('tab-content').dispatch('click');
  const checkbox = document.getElementById('content-t_mood-md');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  await document.getElementById('save-content-reviews').dispatch('click');
  await flushAsyncWork();

  assert.equal(document.links().some(link => link.textContent === 'View commit ↗'), false);
  assert.equal(document.activeElement?.getAttribute('id'), 'content-save-result');
});
