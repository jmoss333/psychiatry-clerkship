import {
  assessBatch,
  assessItem,
  CATEGORIES,
  COMPETENCIES,
  diffEditableFields,
  OPTION_KEYS,
  SUBTYPES,
  TYPES,
} from './qbank-rules.mjs';

const API = '/api/attest';
const KEY_STORAGE = 'fac_key';
const DEFAULT_REVIEWER = 'Joshua Moss, MD';

const GATE_LABELS = {
  ready: { label: 'Ready', symbol: '✓' },
  warning: { label: 'Warning', symbol: '!' },
  blocked: { label: 'Blocked', symbol: '×' },
};

const CONFIRMATION_COPY = {
  clinical: 'I verified the clinical answer and rationale.',
  evidence: 'I verified the item against the named library page(s) and evidence anchor.',
  originalityAndNoPhi: 'I verified that the vignette is an original fictional composite with no PHI.',
};

const OPTION_TEXT_LABELS = {
  A: 'Option A text',
  B: 'Option B text',
  C: 'Option C text',
  D: 'Option D text',
};

const emptyConfirmations = () => ({
  clinical: false,
  evidence: false,
  originalityAndNoPhi: false,
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clone(value) {
  return structuredClone(value);
}

function parseDelimited(value) {
  return [...new Set(text(value)
    .split(/[\n,]/)
    .map(entry => entry.trim())
    .filter(Boolean))];
}

function gateOf(question) {
  const gate = question?.assessment?.gate;
  return Object.hasOwn(GATE_LABELS, gate) ? gate : 'blocked';
}

export function filteredQuestions(server, filters) {
  const questions = list(server?.qbank);
  const selected = filters && typeof filters === 'object' ? filters : {};
  const needle = text(selected.search).trim().toLowerCase();

  return questions.filter(question => {
    const pages = list(question?.pages).filter(page => typeof page === 'string');
    const haystack = [
      text(question?.id),
      text(question?.stem),
      text(question?.category),
      text(question?.evidence),
      ...pages,
    ].join(' ').toLowerCase();
    return (!needle || haystack.includes(needle))
      && (selected.category === 'all' || question?.category === selected.category)
      && (selected.status === 'all' || question?.status === selected.status)
      && (selected.gate === 'all' || gateOf(question) === selected.gate)
      && (selected.difficulty === 'all'
        || String(question?.difficulty) === selected.difficulty);
  }).sort((left, right) => (
    text(left?.category).localeCompare(text(right?.category))
      || text(left?.id).localeCompare(text(right?.id))
  ));
}

export function deriveQueueCounts(questions) {
  const counts = { draft: 0, ready: 0, warning: 0, blocked: 0, attested: 0 };
  for (const question of list(questions)) {
    if (question?.status === 'draft') counts.draft += 1;
    if (question?.status === 'attested') counts.attested += 1;
    counts[gateOf(question)] += 1;
  }
  return counts;
}

export function isBatchEligible(question, reviewedInSession, hasUnsavedChanges = false) {
  return question?.status === 'draft'
    && gateOf(question) === 'ready'
    && reviewedInSession instanceof Set
    && reviewedInSession.has(question.id)
    && !hasUnsavedChanges;
}

export function startFacultyConsole({
  document,
  window,
  fetchImpl = fetch,
  assessItemImpl = assessItem,
}) {
  const app = document.getElementById('app');
  const statusRegion = document.getElementById('app-status');
  if (!app || !statusRegion) {
    throw new Error('Faculty console shell is incomplete.');
  }

  const state = {
    server: null,
    tab: 'qbank',
    selectedId: null,
    editor: null,
    original: null,
    reviewedInSession: new Set(),
    batch: new Set(),
    filters: { search: '', category: 'all', status: 'draft', gate: 'all', difficulty: 'all' },
    pending: false,
    reviewerLabel: DEFAULT_REVIEWER,
    reviewedRevisions: new Map(),
    contentChanges: Object.create(null),
    contentFilters: { kind: 'all', status: 'all' },
    contentMessage: '',
    contentCommitUrl: null,
    dirtyFields: [],
    localAssessment: null,
    confirmations: emptyConfirmations(),
    warningAcks: new Set(),
    qbankMessage: '',
    qbankCommitUrl: null,
    qbankError: '',
    conflict: null,
    navigationGuard: null,
    navigationAfterSave: null,
    batchConfirmation: null,
    reauthAction: null,
    loadGeneration: 0,
  };

  function el(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value === null || value === undefined || value === false) continue;
      if (name === 'class') {
        node.className = value;
      } else if (name.startsWith('on') && typeof value === 'function') {
        node.addEventListener(name.slice(2).toLowerCase(), value);
      } else if (['checked', 'disabled', 'selected', 'value', 'readOnly'].includes(name)) {
        node[name] = value;
      } else {
        node.setAttribute(name, value === true ? '' : String(value));
      }
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === null || child === undefined) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  function announce(message) {
    statusRegion.textContent = message;
  }

  function replaceApp(...children) {
    app.replaceChildren(...children);
  }

  function getKey() {
    try {
      return window.sessionStorage.getItem(KEY_STORAGE) || '';
    } catch {
      return '';
    }
  }

  function setKey(value) {
    try {
      window.sessionStorage.setItem(KEY_STORAGE, value);
    } catch {
      // The next authenticated request will fail closed when storage is unavailable.
    }
  }

  function clearKey() {
    try {
      window.sessionStorage.removeItem(KEY_STORAGE);
    } catch {
      // The server remains authoritative even if browser storage is unavailable.
    }
  }

  function apiHeaders(withBody = false) {
    const headers = { 'x-faculty-key': getKey() };
    if (withBody) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function responseMessage(payload, fallback) {
    if (typeof payload?.error === 'string') return payload.error;
    if (typeof payload?.error?.message === 'string') return payload.error.message;
    if (typeof payload?.message === 'string') return payload.message;
    return fallback;
  }

  function stableResponseMessage(payload, fallback) {
    const message = responseMessage(payload, fallback);
    const code = text(payload?.error?.code);
    return code ? `${code}: ${message}` : message;
  }

  async function responseJson(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  function validServerState(payload) {
    if (!payload || typeof payload !== 'object'
        || !Array.isArray(payload.qbank)
        || !Array.isArray(payload.items)
        || !Array.isArray(payload.manifestPages)
        || payload.manifestPages.length === 0
        || payload.manifestPages.some(page => typeof page !== 'string' || !page.trim())) return false;
    const ids = new Set();
    for (const question of payload.qbank) {
      if (!question || typeof question !== 'object' || Array.isArray(question)
          || !text(question.id) || !/^[0-9a-f]{64}$/i.test(text(question.revision))
          || ids.has(question.id)) return false;
      ids.add(question.id);
    }
    return true;
  }

  function safeStudentUrl(query) {
    try {
      const url = new URL(query, state.server?.student);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function safeExternalUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function domToken(value) {
    return text(value).replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function findQuestion(id) {
    return list(state.server?.qbank).find(question => question.id === id) || null;
  }

  function hasUnsavedChanges(question = state.editor) {
    if (!state.original || !question) return false;
    try {
      return diffEditableFields(state.original, question).length > 0;
    } catch {
      return true;
    }
  }

  function hasAnyUnsavedChanges() {
    return hasUnsavedChanges() || Object.keys(state.contentChanges).length > 0;
  }

  function resetApprovalInputs() {
    state.confirmations = emptyConfirmations();
    state.warningAcks = new Set();
    state.batchConfirmation = null;
  }

  function invalidateSessionReview(id) {
    if (!id) return;
    state.reviewedInSession.delete(id);
    state.reviewedRevisions.delete(id);
    state.batch.delete(id);
  }

  function refreshEditorState() {
    if (!state.original || !state.editor) {
      state.dirtyFields = [];
      state.localAssessment = null;
      return;
    }
    try {
      state.dirtyFields = diffEditableFields(state.original, state.editor);
    } catch {
      state.dirtyFields = ['Question'];
    }
    state.localAssessment = currentAssessment(state.editor);
  }

  function setSelected(id, { force = false } = {}) {
    const question = findQuestion(id);
    if (!question) {
      state.selectedId = null;
      state.original = null;
      state.editor = null;
      state.dirtyFields = [];
      state.localAssessment = null;
      resetApprovalInputs();
      return;
    }
    if (!force && state.selectedId === question.id && state.editor) return;
    state.selectedId = question.id;
    state.original = clone(question);
    state.editor = clone(question);
    state.qbankError = '';
    state.conflict = null;
    resetApprovalInputs();
    refreshEditorState();
  }

  function currentAssessment(question) {
    try {
      const activeItems = list(state.server?.qbank).map(item => (
        item?.id === question?.id ? question : item
      ));
      const assessment = assessItemImpl(question, {
        manifestPages: list(state.server?.manifestPages),
        activeItems,
      });
      if (!assessment || !Object.hasOwn(GATE_LABELS, assessment.gate)
          || !Array.isArray(assessment.blockers) || !Array.isArray(assessment.warnings)) {
        throw new Error('Malformed assessment');
      }
      return assessment;
    } catch {
      return {
        gate: 'blocked',
        blockers: [{
          code: 'checks.runtime_failure',
          field: 'Question',
          message: 'Automated checks could not run. Reload before reviewing this question.',
        }],
        warnings: [],
      };
    }
  }

  function assessedQuestion(question) {
    return { ...question, assessment: currentAssessment(question) };
  }

  function assessedQuestions() {
    return list(state.server?.qbank).map(assessedQuestion);
  }

  function pruneSessionReview() {
    for (const id of [...state.reviewedInSession]) {
      const question = findQuestion(id);
      const revision = state.reviewedRevisions.get(id);
      const assessment = question ? currentAssessment(question) : null;
      if (!question || question.revision !== revision
          || question.status !== 'draft' || assessment?.gate !== 'ready') {
        state.reviewedInSession.delete(id);
        state.reviewedRevisions.delete(id);
        state.batch.delete(id);
      }
    }
    for (const id of [...state.batch]) {
      const question = findQuestion(id);
      const assessed = question ? assessedQuestion(question) : null;
      if (!isBatchEligible(assessed, state.reviewedInSession, false)) state.batch.delete(id);
    }
  }

  function chooseSelection() {
    if (findQuestion(state.selectedId)) {
      setSelected(state.selectedId, { force: true });
      return;
    }
    const first = filteredQuestions(state.server, state.filters)[0]
      || list(state.server?.qbank)[0];
    setSelected(first?.id || null, { force: true });
  }

  function renderLogin(message = '') {
    const keyInput = el('input', {
      id: 'faculty-key',
      type: 'password',
      autocomplete: 'current-password',
      required: true,
    });
    const form = el('form', {
      class: 'login-panel',
      onSubmit: event => {
        event.preventDefault();
        setKey(keyInput.value);
        if (typeof state.reauthAction?.retry === 'function') {
          void state.reauthAction.retry();
        } else {
          void load();
        }
      },
    }, [
      el('div', { class: 'field' }, [
        el('label', { for: 'faculty-key' }, ['Faculty key']),
        keyInput,
        message
          ? el('p', { class: 'field-error', role: 'alert' }, [message])
          : el('p', { class: 'hint' }, [
            'The key stays in this browser session and is checked by the server.',
          ]),
      ]),
      el('div', { class: 'login-actions' }, [
        el('button', { class: 'primary', type: 'submit' }, ['Unlock workbench']),
      ]),
    ]);
    replaceApp(el('section', { class: 'login-shell', 'aria-labelledby': 'login-title' }, [
      el('p', { class: 'eyebrow' }, ['Faculty governance']),
      el('h1', { id: 'login-title' }, ['Clinical-question quality workbench']),
      el('p', { class: 'console-subtitle' }, [
        'Private review space for the psychiatry clerkship question bank and content attestations.',
      ]),
      form,
    ]));
    keyInput.focus();
  }

  function renderLoading() {
    replaceApp(el('section', { class: 'loading-state', 'aria-labelledby': 'loading-title' }, [
      el('p', { class: 'eyebrow' }, ['Faculty governance']),
      el('h1', { id: 'loading-title' }, ['Loading current repository state…']),
      el('p', { class: 'muted' }, ['Question versions and automated gates are being checked.']),
    ]));
  }

  function renderLoadError(message) {
    const panel = el('section', {
      class: 'error-panel',
      role: 'alert',
      tabindex: '-1',
      'aria-labelledby': 'load-error-title',
    }, [
      el('h1', { id: 'load-error-title' }, ['The console could not load']),
      el('p', {}, [message]),
      el('button', { class: 'primary', type: 'button', onClick: () => void load() }, ['Retry']),
    ]);
    replaceApp(panel);
    panel.focus();
  }

  async function load({
    silent = false,
    focusId = null,
    requiredId = null,
    expectedRevisions = null,
    preserveOnError = false,
  } = {}) {
    const generation = ++state.loadGeneration;
    state.pending = true;
    if (!silent) renderLoading();
    else if (state.server) renderShell();
    try {
      const response = await fetchImpl(API, { headers: apiHeaders() });
      const payload = await responseJson(response);
      if (generation !== state.loadGeneration) return false;
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        renderLogin('Key not accepted. Check the shared faculty key and try again.');
        return false;
      }
      if (!response.ok || !validServerState(payload)) {
        throw new Error(responseMessage(payload, 'The server returned an incomplete state.'));
      }
      if (requiredId && !payload.qbank.some(question => question.id === requiredId)) {
        throw new Error(`The refreshed state did not include ${requiredId}. Local work was retained.`);
      }
      if (expectedRevisions && typeof expectedRevisions === 'object') {
        for (const [id, revision] of Object.entries(expectedRevisions)) {
          const refreshed = payload.qbank.find(question => question.id === id);
          if (!refreshed || refreshed.revision !== revision) {
            throw new Error(`The refreshed state did not confirm ${id}. Local work was retained.`);
          }
        }
      }
      state.server = payload;
      state.pending = false;
      pruneSessionReview();
      chooseSelection();
      renderShell(focusId);
      return true;
    } catch (error) {
      if (generation !== state.loadGeneration) return false;
      state.pending = false;
      const message = error instanceof Error ? error.message : 'Network request failed.';
      if (preserveOnError && state.server) {
        state.qbankError = `refresh_failed: ${message}`;
        announce(state.qbankError);
        renderShell('qbank-action-error');
      } else {
        renderLoadError(message);
      }
      return false;
    }
  }

  function performNavigation(target) {
    if (!target || typeof target !== 'object') return;
    if (target.kind === 'lock') {
      clearKey();
      state.server = null;
      state.navigationGuard = null;
      state.navigationAfterSave = null;
      state.batchConfirmation = null;
      state.reauthAction = null;
      renderLogin();
      return;
    }
    if (target.kind === 'tab') {
      state.tab = target.name;
      renderShell(target.focus ? `tab-${target.name}` : null);
      return;
    }
    if (target.kind === 'question' && findQuestion(target.id)) {
      setSelected(target.id);
      renderShell(target.focusId || `queue-${domToken(target.id)}`);
    }
  }

  function requestNavigation(target, returnFocus = null) {
    const changesQuestion = target?.kind === 'question' && target.id !== state.selectedId;
    const leavesQuestionTab = target?.kind === 'tab'
      && state.tab === 'qbank' && target.name !== 'qbank';
    const locksWithUnsavedChanges = target?.kind === 'lock' && hasAnyUnsavedChanges();
    if (locksWithUnsavedChanges
        || (hasUnsavedChanges() && (changesQuestion || leavesQuestionTab))) {
      state.navigationGuard = { target, returnFocus };
      renderShell('unsaved-guard');
      return;
    }
    performNavigation(target);
  }

  function activateTab(name, focusTab = false) {
    requestNavigation(
      { kind: 'tab', name, focus: focusTab },
      `tab-${state.tab}`,
    );
  }

  function tabButton(name, label) {
    const active = state.tab === name;
    return el('button', {
      id: `tab-${name}`,
      class: 'tab',
      type: 'button',
      role: 'tab',
      'aria-selected': String(active),
      'aria-controls': `panel-${name}`,
      tabindex: active ? '0' : '-1',
      onClick: () => activateTab(name, true),
    }, [label]);
  }

  function renderTabNavigation() {
    const tabs = el('div', {
      class: 'tabs',
      role: 'tablist',
      'aria-label': 'Faculty console sections',
      onKeydown: event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const next = state.tab === 'qbank' ? 'content' : 'qbank';
        activateTab(next, true);
      },
    }, [
      tabButton('qbank', 'Question bank'),
      tabButton('content', 'Content pages & tools'),
    ]);
    return el('nav', { class: 'tab-nav', 'aria-label': 'Review areas' }, [tabs]);
  }

  function renderShell(focusTarget = null) {
    if (!state.server) return;
    const focusState = typeof focusTarget === 'string'
      ? { id: focusTarget }
      : record(focusTarget);
    const reviewer = el('input', {
      id: 'reviewer-label',
      type: 'text',
      maxlength: '80',
      value: state.reviewerLabel,
      onInput: event => { state.reviewerLabel = event.target.value; },
    });
    const panel = el('section', {
      id: `panel-${state.tab}`,
      role: 'tabpanel',
      tabindex: '0',
      'aria-labelledby': `tab-${state.tab}`,
    }, [state.tab === 'qbank' ? renderQuestionWorkbench() : renderContentPanel()]);

    const modal = renderNavigationGuard() || renderBatchConfirmation();
    const background = el('div', {
      id: 'console-background',
      inert: state.pending || modal ? true : null,
      'aria-busy': state.pending ? 'true' : null,
    }, [
      el('header', { class: 'console-header' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow' }, ['Psychiatry clerkship faculty']),
          el('h1', {}, ['Question review workbench']),
          el('p', { class: 'console-subtitle' }, [
            'Triage question quality, open one item, and record deliberate faculty review.',
          ]),
        ]),
        el('div', { class: 'header-actions' }, [
          el('button', {
            id: 'lock-console',
            class: 'quiet',
            type: 'button',
            onClick: () => requestNavigation(
              { kind: 'lock' },
              'lock-console',
            ),
          }, ['Lock console']),
        ]),
      ]),
      el('section', { class: 'reviewer-strip', 'aria-label': 'Reviewer context' }, [
        el('div', { class: 'field' }, [
          el('label', { for: 'reviewer-label' }, ['Reviewer label']),
          reviewer,
        ]),
        el('p', { class: 'reviewer-note' }, [
          'Self-asserted under the shared faculty key; this label is not verified identity.',
        ]),
      ]),
      renderTabNavigation(),
      panel,
    ]);
    replaceApp(background, ...(modal ? [modal] : []));

    if (text(focusState.id)) {
      const target = document.getElementById(focusState.id);
      target?.focus();
      const targetType = target?.getAttribute?.('type');
      if (targetType === 'search' || targetType === 'text' || target?.tagName === 'TEXTAREA') {
        const hasSelection = Number.isInteger(focusState.selectionStart)
          && Number.isInteger(focusState.selectionEnd);
        const start = hasSelection ? focusState.selectionStart : target.value.length;
        const end = hasSelection ? focusState.selectionEnd : target.value.length;
        target.setSelectionRange?.(start, end, text(focusState.selectionDirection) || 'none');
      }
    }
  }

  function labeledControl(label, id, control, className = '') {
    return el('div', { class: `field ${className}`.trim() }, [
      el('label', { for: id }, [label]),
      control,
    ]);
  }

  function option(value, label, selectedValue) {
    return el('option', { value, selected: value === selectedValue }, [label]);
  }

  function filterSelect(id, label, values, selected, onChange) {
    const control = el('select', { id, onChange }, values.map(([value, name]) => (
      option(value, name, selected)
    )));
    return labeledControl(label, id, control);
  }

  function updateFilter(name, value, focusId) {
    state.filters[name] = value;
    renderShell(focusId);
  }

  function renderQueueFilters() {
    const questions = list(state.server?.qbank);
    const categories = [...new Set(questions.map(question => text(question.category)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    const difficulties = [...new Set(questions.map(question => String(question.difficulty)))]
      .filter(value => value !== 'undefined')
      .sort((left, right) => Number(left) - Number(right));
    const search = el('input', {
      id: 'question-search',
      type: 'search',
      value: state.filters.search,
      autocomplete: 'off',
      onInput: event => updateFilter('search', event.target.value, 'question-search'),
    });
    return el('fieldset', { class: 'queue-filters' }, [
      el('legend', {}, ['Filter question queue']),
      el('div', { class: 'filter-grid' }, [
        labeledControl('Search questions', 'question-search', search, 'filter-search'),
        filterSelect(
          'filter-question-category',
          'Category',
          [['all', 'All categories'], ...categories.map(value => [value, value])],
          state.filters.category,
          event => updateFilter('category', event.target.value, 'filter-question-category'),
        ),
        filterSelect(
          'question-status',
          'Status',
          [['all', 'All statuses'], ['draft', 'Draft'], ['attested', 'Attested']],
          state.filters.status,
          event => updateFilter('status', event.target.value, 'question-status'),
        ),
        filterSelect(
          'question-gate',
          'Review gate',
          [['all', 'All gates'], ['ready', 'Ready'], ['warning', 'Warning'], ['blocked', 'Blocked']],
          state.filters.gate,
          event => updateFilter('gate', event.target.value, 'question-gate'),
        ),
        filterSelect(
          'filter-question-difficulty',
          'Difficulty',
          [['all', 'All levels'], ...difficulties.map(value => [value, `Level ${value}`])],
          state.filters.difficulty,
          event => updateFilter('difficulty', event.target.value, 'filter-question-difficulty'),
        ),
      ]),
    ]);
  }

  function renderCountStrip(questions) {
    const counts = deriveQueueCounts(questions);
    const labels = [
      ['Draft', counts.draft],
      ['Ready', counts.ready],
      ['Warnings', counts.warning],
      ['Blocked', counts.blocked],
      ['Attested', counts.attested],
    ];
    return el('dl', { class: 'count-strip', 'aria-label': 'Question bank counts' }, labels.map(
      ([label, count]) => el('div', {}, [el('dt', {}, [label]), el('dd', {}, [count])]),
    ));
  }

  function gateLabel(gate) {
    const meta = GATE_LABELS[gate] || GATE_LABELS.blocked;
    return el('span', { class: `gate-label ${gate}` }, [
      el('span', { 'aria-hidden': 'true' }, [meta.symbol]),
      meta.label,
    ]);
  }

  function batchReason(question, dirty) {
    if (question.status !== 'draft') return 'Only saved drafts can enter a batch.';
    if (gateOf(question) !== 'ready') return 'Only questions with a green Ready gate can enter a batch.';
    if (dirty) return 'Save or discard local changes before batch selection.';
    if (!state.reviewedInSession.has(question.id)) {
      return 'Open this question and choose Mark reviewed & next before batch selection.';
    }
    return 'Eligible for a green batch after faculty review in this session.';
  }

  function renderQueueRow(question) {
    const selected = state.selectedId === question.id;
    const dirty = selected && hasUnsavedChanges();
    const revisionReviewed = state.reviewedRevisions.get(question.id) === question.revision;
    const eligible = revisionReviewed
      && isBatchEligible(question, state.reviewedInSession, dirty);
    const checkboxId = `batch-${domToken(question.id)}`;
    const queueId = `queue-${domToken(question.id)}`;
    const checkbox = el('input', {
      id: checkboxId,
      type: 'checkbox',
      checked: state.batch.has(question.id),
      disabled: !eligible || state.pending,
      'aria-label': `Select ${question.id} for batch attestation. ${batchReason(question, dirty)}`,
      onChange: event => {
        if (event.target.checked) state.batch.add(question.id);
        else state.batch.delete(question.id);
        resetApprovalInputs();
        renderShell(checkboxId);
      },
    });
    return el('li', { class: `queue-row gate-${gateOf(question)}` }, [
      el('label', { class: 'batch-check', for: checkboxId, title: batchReason(question, dirty) }, [
        checkbox,
      ]),
      el('button', {
        id: queueId,
        class: 'queue-choice',
        type: 'button',
        'aria-current': selected ? 'true' : null,
        onClick: () => {
          requestNavigation(
            { kind: 'question', id: question.id, focusId: queueId },
            `queue-${domToken(state.selectedId)}`,
          );
        },
      }, [
        el('span', { class: 'queue-id' }, [question.id]),
        el('span', { class: 'queue-stem' }, [text(question.stem) || 'Stem unavailable']),
        el('span', { class: 'queue-detail' }, [
          el('span', {}, [`${text(question.category) || 'uncategorized'} · L${question.difficulty ?? '—'}`]),
          gateLabel(gateOf(question)),
        ]),
      ]),
    ]);
  }

  function confirmationsComplete() {
    return state.confirmations.clinical === true
      && state.confirmations.evidence === true
      && state.confirmations.originalityAndNoPhi === true;
  }

  function selectedBatchQuestions() {
    return [...state.batch]
      .map(findQuestion)
      .filter(Boolean)
      .map(assessedQuestion)
      .filter(question => (
        state.reviewedRevisions.get(question.id) === question.revision
          && isBatchEligible(question, state.reviewedInSession, false)
      ));
  }

  function safeBatchAssessment(questions) {
    try {
      const assessment = assessBatch(questions);
      if (!assessment || typeof assessment.ok !== 'boolean' || !Array.isArray(assessment.issues)) {
        throw new Error('Malformed batch assessment');
      }
      return assessment;
    } catch {
      return {
        ok: false,
        issues: [{
          code: 'batch.runtime_failure',
          field: 'options',
          message: 'Batch checks could not run. Reload before attesting.',
        }],
        answerKeys: { A: 0, B: 0, C: 0, D: 0 },
      };
    }
  }

  function openBatchConfirmation() {
    const selected = selectedBatchQuestions();
    const assessment = safeBatchAssessment(selected);
    if (!selected.length || selected.length !== state.batch.size) {
      showQbankError('batch.selection_stale: Reload or review the selected questions again.');
      return;
    }
    if (!assessment.ok) {
      showQbankError(`${assessment.issues[0].code}: ${assessment.issues[0].message}`);
      return;
    }
    if (!confirmationsComplete()) {
      showQbankError('attest.confirmations_required: Complete all faculty confirmations.');
      return;
    }
    state.batchConfirmation = {
      entries: selected.map(question => ({ id: question.id, revision: question.revision })),
      returnFocus: 'open-batch-attest',
    };
    renderShell('batch-confirmation');
  }

  function modalKeydown(event, controlIds, cancel) {
    if (state.pending) {
      if (event.key === 'Escape' || event.key === 'Tab') event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = controlIds
      .map(id => document.getElementById(id))
      .filter(control => control && !control.disabled);
    if (!controls.length) return;
    const index = controls.indexOf(document.activeElement);
    const wrapsBackward = event.shiftKey && index <= 0;
    const wrapsForward = !event.shiftKey && (index < 0 || index === controls.length - 1);
    if (!wrapsBackward && !wrapsForward) return;
    event.preventDefault();
    controls[wrapsBackward ? controls.length - 1 : 0].focus();
  }

  function closeBatchConfirmation() {
    const returnFocus = text(state.batchConfirmation?.returnFocus) || 'open-batch-attest';
    state.batchConfirmation = null;
    renderShell(returnFocus);
  }

  function renderBatchConfirmation() {
    if (!state.batchConfirmation || !Array.isArray(state.batchConfirmation.entries)) return null;
    const entries = state.batchConfirmation.entries.map(entry => ({
      id: text(entry?.id),
      revision: text(entry?.revision),
    }));
    return el('section', {
      id: 'batch-confirmation',
      class: 'modal-panel guard-panel batch-confirmation',
      role: 'dialog',
      tabindex: '-1',
      'aria-modal': 'true',
      'aria-labelledby': 'batch-confirmation-title',
      onKeydown: event => modalKeydown(
        event,
        ['confirm-batch-attest', 'cancel-batch-attest'],
        closeBatchConfirmation,
      ),
    }, [
      el('h3', { id: 'batch-confirmation-title' }, ['Confirm green batch attestation']),
      el('p', {}, ['The following saved revisions will be attested atomically:']),
      el('ul', { class: 'data-text' }, entries.map(entry => el('li', {}, [
        `${entry.id} — revision ${entry.revision}`,
      ]))),
      el('div', { class: 'guard-actions' }, [
        el('button', {
          id: 'confirm-batch-attest',
          class: 'primary',
          type: 'button',
          disabled: state.pending,
          onClick: () => void attestBatch(entries),
        }, ['Confirm batch attestation']),
        el('button', {
          id: 'cancel-batch-attest',
          type: 'button',
          disabled: state.pending,
          onClick: closeBatchConfirmation,
        }, ['Cancel']),
      ]),
    ]);
  }

  function renderBatchSummary() {
    const selected = selectedBatchQuestions();
    const assessment = safeBatchAssessment(selected);
    const selectedIds = selected.map(question => question.id);
    const message = selected.length
      ? `${selected.length} reviewed green draft${selected.length === 1 ? '' : 's'} selected: ${selectedIds.join(', ')}`
      : 'No questions selected. Review each green draft before using its batch checkbox.';
    return el('div', { class: 'batch-summary' }, [
      el('div', { id: 'batch-safety', class: 'batch-copy' }, [
        el('p', {}, [message]),
        !assessment.ok
          ? el('p', { class: 'batch-warning' }, [assessment.issues[0].message])
          : null,
      ]),
      el('button', {
        id: 'open-batch-attest',
        class: 'primary',
        type: 'button',
        disabled: !selected.length || selected.length !== state.batch.size
          || !assessment.ok || !confirmationsComplete() || state.pending,
        onClick: openBatchConfirmation,
      }, ['Attest selected green drafts']),
    ]);
  }

  function markReviewedAndNext(question) {
    const assessment = currentAssessment(question);
    if (question.status !== 'draft' || assessment.gate !== 'ready' || hasUnsavedChanges()) {
      announce(`${question.id} is not eligible for a green batch.`);
      return;
    }
    state.reviewedInSession.add(question.id);
    state.reviewedRevisions.set(question.id, question.revision);
    const queue = filteredQuestions({ qbank: assessedQuestions() }, state.filters);
    const index = queue.findIndex(candidate => candidate.id === question.id);
    const next = index >= 0 ? queue[index + 1] : null;
    if (next) setSelected(next.id);
    renderShell(next ? `queue-${domToken(next.id)}` : `queue-${domToken(question.id)}`);
    announce(`${question.id} marked reviewed in this session. Its batch checkbox is now available.`);
  }

  function moveQueueSelection(event, questions) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const targetId = event.target?.getAttribute?.('id') || '';
    if (!targetId.startsWith('queue-')) return;
    const index = questions.findIndex(question => question.id === state.selectedId);
    if (index < 0) return;
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const next = questions[Math.max(0, Math.min(questions.length - 1, index + offset))];
    if (!next || next.id === state.selectedId) return;
    event.preventDefault();
    requestNavigation(
      { kind: 'question', id: next.id, focusId: `queue-${domToken(next.id)}` },
      targetId,
    );
  }

  function controlValue(id, fallback = '') {
    const control = document.getElementById(id);
    return control ? text(control.value) : text(fallback);
  }

  function controlChecked(id, fallback = false) {
    const control = document.getElementById(id);
    return control ? control.checked === true : fallback === true;
  }

  function tierTwoOptionKeys(tier) {
    const options = list(record(tier).options);
    const keys = options.map(optionItem => text(optionItem?.key));
    const preservesActualKeys = [3, 4].includes(keys.length)
      && keys.every(key => OPTION_KEYS.includes(key))
      && new Set(keys).size === keys.length;
    return preservesActualKeys ? keys : [...OPTION_KEYS];
  }

  function addTierTwoOptionId(key) {
    return `add-tier2-option-${text(key).toLowerCase()}`;
  }

  function readEditor() {
    const base = clone(state.editor || state.original || {});
    const next = clone(base);
    next.type = controlValue('question-type', base.type);
    next.category = controlValue('question-category', base.category);
    const selectedCompetencies = COMPETENCIES.filter(value => controlChecked(
      `competency-${domToken(value)}`,
      list(base.competency).includes(value),
    ));
    const preservedCompetencies = list(base.competency).filter(value => (
      selectedCompetencies.includes(value)
    ));
    next.competency = [
      ...preservedCompetencies,
      ...selectedCompetencies.filter(value => !preservedCompetencies.includes(value)),
    ];
    next.difficulty = Number(controlValue('question-difficulty', base.difficulty));
    if (controlChecked('question-high-yield', base.hy === true)) next.hy = true;
    else delete next.hy;
    next.pages = parseDelimited(controlValue('question-pages', list(base.pages).join(', ')));
    next.link = {
      ...clone(record(base.link)),
      label: controlValue('question-link-label', base.link?.label),
      href: controlValue('question-link-href', base.link?.href),
    };
    next.stem = controlValue('question-stem', base.stem);
    next.why = controlValue('question-why', base.why);
    next.pearl = controlValue('question-pearl', base.pearl);
    next.evidence = controlValue('question-evidence', base.evidence);

    const currentOptions = Object.fromEntries(list(base.options).map(optionItem => [optionItem?.key, optionItem]));
    const correctKey = OPTION_KEYS.find(key => controlChecked(
      `correct-${key}`,
      currentOptions[key]?.c === true,
    )) || '';
    next.options = OPTION_KEYS.map(key => {
      const originalOption = record(currentOptions[key]);
      const optionItem = clone(originalOption);
      optionItem.key = key;
      optionItem.t = controlValue(`option-${key}-text`, originalOption.t);
      if (key === correctKey) {
        optionItem.c = true;
        delete optionItem.trap;
      } else {
        delete optionItem.c;
        optionItem.trap = {
          ...clone(record(originalOption.trap)),
          name: controlValue(`option-${key}-trap-name`, originalOption.trap?.name),
          note: controlValue(`option-${key}-trap-note`, originalOption.trap?.note),
        };
      }
      return optionItem;
    });

    if (next.type === 'relational') {
      next.subtype = controlValue('question-subtype', base.subtype);
    } else {
      delete next.subtype;
    }

    if (next.type === 'two-tier') {
      const tier = record(base.tier2);
      const tierOptions = Object.fromEntries(list(tier.options).map(optionItem => [optionItem?.key, optionItem]));
      const tierKeys = tierTwoOptionKeys(tier);
      const tierCorrect = tierKeys.find(key => controlChecked(
        `tier2-correct-${key}`,
        tierOptions[key]?.c === true,
      )) || '';
      next.tier2 = {
        ...clone(tier),
        q: controlValue('tier2-question', tier.q),
        options: tierKeys.map(key => {
          const optionItem = clone(record(tierOptions[key]));
          optionItem.key = key;
          optionItem.t = controlValue(`tier2-option-${key}-text`, tierOptions[key]?.t);
          if (key === tierCorrect) optionItem.c = true;
          else delete optionItem.c;
          return optionItem;
        }),
        why: controlValue('tier2-why', tier.why),
      };
    } else {
      delete next.tier2;
    }
    return next;
  }

  function applyEditorChange(candidate, focusId) {
    state.editor = candidate;
    invalidateSessionReview(state.selectedId);
    resetApprovalInputs();
    state.qbankMessage = '';
    state.qbankCommitUrl = null;
    state.qbankError = '';
    state.conflict = null;
    refreshEditorState();
    renderShell(focusId);
  }

  function editorFocusState(controlOrId) {
    if (typeof controlOrId === 'string') return { id: controlOrId };
    const control = controlOrId;
    const id = control?.getAttribute?.('id');
    const type = control?.getAttribute?.('type');
    const supportsSelection = type === 'search' || type === 'text' || control?.tagName === 'TEXTAREA';
    if (!supportsSelection) return { id };
    return {
      id,
      selectionStart: control.selectionStart,
      selectionEnd: control.selectionEnd,
      selectionDirection: control.selectionDirection,
    };
  }

  function editorChanged(controlOrId) {
    applyEditorChange(readEditor(), editorFocusState(controlOrId));
  }

  function changeTierTwoCardinality(includeFourth) {
    const candidate = readEditor();
    const tier = clone(record(candidate.tier2));
    const options = list(tier.options).map(optionItem => clone(optionItem));
    let focusId;
    if (includeFourth && options.length === 3) {
      const keys = tierTwoOptionKeys(tier);
      const missingKey = OPTION_KEYS.find(key => !keys.includes(key));
      if (!missingKey) return;
      options.push({ key: missingKey, t: '' });
      focusId = `tier2-option-${missingKey}-text`;
    } else if (!includeFourth && options.length === 4) {
      options.splice(3, 1);
      const keys = tierTwoOptionKeys({ ...tier, options });
      const missingKey = OPTION_KEYS.find(key => !keys.includes(key));
      focusId = addTierTwoOptionId(missingKey);
    } else {
      return;
    }
    tier.options = options;
    candidate.tier2 = tier;
    applyEditorChange(candidate, focusId);
  }

  function editorInput(id, attributes = {}) {
    return el('input', {
      id,
      ...attributes,
      onInput: event => editorChanged(event.target),
    });
  }

  function editorSelect(id, values, selected, label) {
    return labeledControl(label, id, el('select', {
      id,
      value: text(selected),
      onChange: event => editorChanged(event.target),
    }, values.map(([value, name]) => option(value, name, selected))));
  }

  function editorTextarea(label, id, value, rows = 3) {
    return labeledControl(label, id, el('textarea', {
      id,
      rows: String(rows),
      value: text(value),
      onInput: event => editorChanged(event.target),
    }));
  }

  function editorText(label, id, value, attributes = {}) {
    return labeledControl(label, id, editorInput(id, {
      type: 'text',
      value: text(value),
      ...attributes,
    }));
  }

  function renderCompetencies(question) {
    return el('fieldset', { class: 'checkbox-fieldset' }, [
      el('legend', {}, ['Competencies']),
      el('div', { class: 'checkbox-grid' }, COMPETENCIES.map(value => {
        const id = `competency-${domToken(value)}`;
        return el('label', { for: id }, [
          el('input', {
            id,
            type: 'checkbox',
            checked: list(question.competency).includes(value),
            onChange: event => editorChanged(event.target),
          }),
          value,
        ]);
      })),
    ]);
  }

  function renderOptionEditor(optionItem, correctKey) {
    const key = optionItem.key;
    const group = el('fieldset', { class: 'option-card' });
    group.appendChild(el('legend', {}, [`Option ${key}`]));
    group.appendChild(editorText(`Option ${key} key`, `option-${key}-key`, key, { readOnly: true }));
    group.appendChild(el('label', { class: 'radio-choice', for: `correct-${key}` }, [
      el('input', {
        id: `correct-${key}`,
        type: 'radio',
        name: 'correct-key',
        value: key,
        checked: correctKey === key,
        onChange: event => editorChanged(event.target),
      }),
      'Correct answer',
    ]));
    group.appendChild(editorTextarea(OPTION_TEXT_LABELS[key], `option-${key}-text`, optionItem.t, 3));
    if (correctKey !== key) {
      group.appendChild(editorText('Trap name', `option-${key}-trap-name`, optionItem.trap?.name));
      group.appendChild(editorTextarea('Corrective trap note', `option-${key}-trap-note`, optionItem.trap?.note, 3));
    }
    return group;
  }

  function renderTierTwoEditor(question) {
    if (question.type !== 'two-tier') return null;
    const tier = record(question.tier2);
    const tierKeys = tierTwoOptionKeys(tier);
    const missingKey = OPTION_KEYS.find(key => !tierKeys.includes(key));
    const optionsByKey = Object.fromEntries(list(tier.options).map(optionItem => [optionItem?.key, optionItem]));
    const correctKey = list(tier.options).find(optionItem => optionItem?.c === true)?.key || '';
    return el('fieldset', { class: 'editor-section tier-two' }, [
      el('legend', {}, ['Tier-two reasoning']),
      editorTextarea('Tier-two question', 'tier2-question', tier.q, 3),
      el('div', { class: 'option-grid' }, tierKeys.map(key => {
        const optionItem = record(optionsByKey[key]);
        return el('fieldset', { class: 'option-card compact' }, [
          el('legend', {}, [`Tier-two option ${key}`]),
          editorText(`Tier-two option ${key} key`, `tier2-option-${key}-key`, key, { readOnly: true }),
          el('label', { class: 'radio-choice', for: `tier2-correct-${key}` }, [
            el('input', {
              id: `tier2-correct-${key}`,
              type: 'radio',
              name: 'tier2-correct-key',
              value: key,
              checked: correctKey === key,
              onChange: event => editorChanged(event.target),
            }),
            'Correct answer',
          ]),
          editorTextarea(`Tier-two option ${key} text`, `tier2-option-${key}-text`, optionItem.t, 2),
        ]);
      })),
      el('div', { class: 'tier-cardinality-actions' }, [
        tierKeys.length === 3 && missingKey
          ? el('button', {
            id: addTierTwoOptionId(missingKey),
            type: 'button',
            onClick: () => changeTierTwoCardinality(true),
          }, ['Add fourth option'])
          : el('button', {
            id: 'remove-tier2-option-d',
            type: 'button',
            onClick: () => changeTierTwoCardinality(false),
          }, ['Remove fourth option']),
      ]),
      editorTextarea('Tier-two rationale', 'tier2-why', tier.why, 4),
    ]);
  }

  function issueControlId(field) {
    const value = text(field);
    if (value === 'stem') return 'question-stem';
    if (value === 'type') return 'question-type';
    if (value === 'subtype') return 'question-subtype';
    if (value === 'category') return 'question-category';
    if (value === 'competency') return 'competency-dx';
    if (value === 'difficulty') return 'question-difficulty';
    if (value === 'pages') return 'question-pages';
    if (value.startsWith('link.href')) return 'question-link-href';
    if (value.startsWith('link')) return 'question-link-label';
    if (value === 'why') return 'question-why';
    if (value === 'pearl') return 'question-pearl';
    if (value === 'evidence') return 'question-evidence';
    const optionMatch = /^options\.([A-D])(?:\.(t|trap))?/.exec(value);
    if (optionMatch) {
      if (optionMatch[2] === 'trap') return `option-${optionMatch[1]}-trap-name`;
      return `option-${optionMatch[1]}-text`;
    }
    const tierMatch = /^tier2\.options\.([A-D])/.exec(value);
    if (tierMatch) return `tier2-option-${tierMatch[1]}-text`;
    if (value.startsWith('tier2.why')) return 'tier2-why';
    if (value.startsWith('tier2')) return 'tier2-question';
    return 'review-title';
  }

  function renderIssueList(title, issues, kind) {
    if (!issues.length) return null;
    return el('section', { class: `issue-group ${kind}` }, [
      el('h4', {}, [title]),
      el('ul', { class: 'issue-list' }, issues.map((issue, index) => {
        const field = text(issue.field) || 'Question';
        const target = issueControlId(field);
        return el('li', {}, [
          el('a', {
            id: `issue-${kind}-${index + 1}-${domToken(field)}`,
            href: `#${target}`,
            onClick: () => document.getElementById(target)?.focus(),
          }, [field]),
          `: ${text(issue.message) || text(issue.code) || 'Review this field.'}`,
        ]);
      })),
    ]);
  }

  function renderAssessment(assessment, dirty) {
    const gate = Object.hasOwn(GATE_LABELS, assessment?.gate) ? assessment.gate : 'blocked';
    const blockers = list(assessment?.blockers);
    const warnings = list(assessment?.warnings);
    return el('section', {
      id: 'safety-issues',
      class: `safety-note ${gate}`,
      'aria-labelledby': 'checks-title',
    }, [
      el('h3', { id: 'checks-title' }, ['Safety issues']),
      el('p', { class: dirty ? 'checks-stale' : 'checks-current' }, [
        dirty
          ? 'Checks are local and stale until this draft is saved and reloaded.'
          : 'Checks current for the saved repository version.',
      ]),
      !blockers.length && !warnings.length
        ? el('div', {}, [
          el('h4', {}, ['Automated checks passed']),
          el('p', {}, [
            'Green means the saved structure passed. It does not verify clinical accuracy or source support.',
          ]),
        ])
        : null,
      renderIssueList('Structural blockers', blockers, 'blocked'),
      renderIssueList('Faculty review warnings', warnings, 'warning'),
    ]);
  }

  function renderChangedFields() {
    return el('section', {
      id: 'changed-fields',
      class: 'change-summary',
      'aria-labelledby': 'changed-fields-title',
    }, [
      el('h3', { id: 'changed-fields-title' }, ['Changed fields']),
      state.dirtyFields.length
        ? el('ul', { class: 'data-text' }, state.dirtyFields.map(field => el('li', {}, [field])))
        : el('p', { class: 'muted' }, ['No local changes.']),
    ]);
  }

  function renderWorkflowRail(question, dirty) {
    const current = dirty ? 0 : question.status === 'attested' ? 2 : 1;
    return el('nav', {
      class: 'workflow-rail',
      'aria-label': 'Save draft → Checks current → Attest',
    }, [
      el('ol', {}, [
        el('li', { class: current === 0 ? 'current' : current > 0 ? 'complete' : '' }, ['Save draft']),
        el('li', { class: current === 1 ? 'current' : current > 1 ? 'complete' : '' }, ['Checks current']),
        el('li', { class: current === 2 ? 'complete current' : '' }, ['Attest']),
      ]),
    ]);
  }

  function renderActionFeedback() {
    return el('div', { class: 'action-feedback' }, [
      state.qbankMessage ? el('section', {
        id: 'qbank-action-result',
        class: 'action-result',
        tabindex: '-1',
      }, [
        state.qbankMessage,
        state.qbankCommitUrl ? ' ' : null,
        state.qbankCommitUrl ? el('a', {
          href: state.qbankCommitUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, ['View commit ↗']) : null,
      ]) : null,
      state.qbankError ? el('section', {
        id: 'qbank-action-error',
        class: 'action-error',
        role: 'alert',
        tabindex: '-1',
      }, [state.qbankError]) : null,
      state.conflict ? el('section', {
        id: 'qbank-conflict',
        class: 'action-error conflict-alert',
        role: 'alert',
        tabindex: '-1',
        'aria-labelledby': 'conflict-title',
      }, [
        el('h3', { id: 'conflict-title' }, ['This question changed in the repository']),
        el('p', {}, [state.conflict.message]),
        el('p', {}, ['Reload the current repository version, or keep this local copy for reference. This console will not overwrite the newer version.']),
        el('div', { class: 'guard-actions' }, [
          el('button', {
            class: 'primary',
            type: 'button',
            onClick: () => {
              const id = state.selectedId;
              state.conflict = null;
              state.qbankError = '';
              void load({
                silent: true,
                focusId: 'question-stem',
                requiredId: id,
                preserveOnError: true,
              });
            },
          }, ['Reload']),
          el('button', {
            type: 'button',
            onClick: () => {
              state.conflict = null;
              state.qbankError = '';
              announce('Local copy retained. Reload before trying to save over a newer revision.');
              renderShell('save-draft');
            },
          }, ['Keep local copy']),
        ]),
      ]) : null,
    ]);
  }

  function saveNavigationGuard() {
    const guard = state.navigationGuard;
    if (!guard) return false;
    if (state.pending) {
      announce('A faculty action is already in progress.');
      return false;
    }
    const savesQuestion = hasUnsavedChanges();
    if (savesQuestion && list(state.localAssessment?.blockers).length > 0) {
      announce('Resolve structural blockers before saving this draft.');
      return false;
    }
    state.navigationAfterSave = guard.target;
    state.navigationGuard = null;
    if (savesQuestion) void saveCurrentDraft();
    else void commitContent();
    return true;
  }

  function renderNavigationGuard() {
    if (!state.navigationGuard) return null;
    const guard = state.navigationGuard;
    const savesQuestion = hasUnsavedChanges();
    const cancel = () => {
      state.navigationGuard = null;
      renderShell(guard.returnFocus);
    };
    return el('section', {
      id: 'unsaved-guard',
      class: 'modal-panel guard-panel',
      role: 'alertdialog',
      tabindex: '-1',
      'aria-modal': 'true',
      'aria-labelledby': 'unsaved-guard-title',
      onKeydown: event => modalKeydown(
        event,
        ['unsaved-save', 'unsaved-discard', 'unsaved-cancel'],
        cancel,
      ),
    }, [
      el('h3', { id: 'unsaved-guard-title' }, ['Unsaved question changes']),
      el('p', {}, ['Choose what to do with the current local edits before navigating.']),
      el('div', { class: 'guard-actions' }, [
        el('button', {
          id: 'unsaved-save',
          class: 'primary',
          type: 'button',
          disabled: state.pending
            || (savesQuestion && list(state.localAssessment?.blockers).length > 0),
          onClick: () => { saveNavigationGuard(); },
        }, [savesQuestion ? 'Save draft' : 'Save content reviews']),
        el('button', {
          id: 'unsaved-discard',
          type: 'button',
          disabled: state.pending,
          onClick: () => {
            state.navigationGuard = null;
            state.editor = clone(state.original);
            if (guard.target?.kind === 'lock') {
              state.contentChanges = Object.create(null);
            }
            refreshEditorState();
            resetApprovalInputs();
            performNavigation(guard.target);
          },
        }, ['Discard']),
        el('button', {
          id: 'unsaved-cancel',
          type: 'button',
          disabled: state.pending,
          onClick: cancel,
        }, ['Cancel']),
      ]),
    ]);
  }

  function renderConfirmations(disabled) {
    return el('fieldset', { class: 'human-confirmations', disabled }, [
      el('legend', {}, ['Faculty confirmations']),
      el('p', { class: 'hint' }, ['Automated checks support faculty judgment; they do not establish clinical truth.']),
      ...Object.entries(CONFIRMATION_COPY).map(([key, copy]) => {
        const id = key === 'originalityAndNoPhi' ? 'confirm-originality' : `confirm-${key}`;
        return el('label', { for: id }, [
          el('input', {
            id,
            type: 'checkbox',
            checked: state.confirmations[key] === true,
            disabled,
            onChange: event => {
              state.confirmations[key] = event.target.checked === true;
              state.batchConfirmation = null;
              renderShell(id);
            },
          }),
          copy,
        ]);
      }),
    ]);
  }

  function renderWarningAcknowledgements(assessment, disabled) {
    const warnings = list(assessment?.warnings);
    if (!warnings.length) return null;
    return el('fieldset', { class: 'warning-acknowledgements', disabled }, [
      el('legend', {}, ['Acknowledge current warnings individually']),
      ...warnings.map(warning => {
        const code = text(warning.code);
        const id = `ack-${domToken(code)}`;
        return el('label', { for: id }, [
          el('input', {
            id,
            type: 'checkbox',
            checked: state.warningAcks.has(code),
            disabled,
            onChange: event => {
              if (event.target.checked) state.warningAcks.add(code);
              else state.warningAcks.delete(code);
              renderShell(id);
            },
          }),
          `${code}: ${text(warning.message)}`,
        ]);
      }),
    ]);
  }

  function warningAcknowledgementsComplete(assessment) {
    const codes = list(assessment?.warnings).map(warning => warning.code);
    return codes.length > 0 && codes.every(code => state.warningAcks.has(code));
  }

  function renderQuestionOverview() {
    const savedQuestion = findQuestion(state.selectedId);
    const question = state.editor;
    const panel = el('article', { class: 'review-panel', 'aria-labelledby': 'review-title' });
    if (!savedQuestion || !question) {
      panel.appendChild(el('div', { class: 'review-sheet' }, [
        el('h2', { id: 'review-title' }, ['Select a question']),
        el('p', { class: 'muted' }, ['Choose a queue row to open its full editor.']),
      ]));
      return panel;
    }

    const assessment = state.localAssessment || currentAssessment(question);
    const gate = assessment.gate;
    const dirty = state.dirtyFields.length > 0;
    const reviewed = savedQuestion.status === 'draft'
      && gate === 'ready'
      && !dirty
      && state.reviewedInSession.has(savedQuestion.id)
      && state.reviewedRevisions.get(savedQuestion.id) === savedQuestion.revision;
    const markEligible = savedQuestion.status === 'draft' && gate === 'ready' && !dirty;
    const attestationDisabled = state.pending || dirty || gate === 'blocked'
      || savedQuestion.status !== 'draft';
    const warningCodesComplete = warningAcknowledgementsComplete(assessment);
    const learnerUrl = safeStudentUrl(text(question.link?.href));
    const correctKey = list(question.options).find(optionItem => optionItem?.c === true)?.key || '';
    const optionsByKey = Object.fromEntries(list(question.options).map(optionItem => [optionItem?.key, optionItem]));

    panel.appendChild(el('div', { class: 'review-sheet' }, [
      el('header', { class: 'review-heading' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow' }, ['Selected question']),
          el('h2', { id: 'review-title', class: 'question-id' }, [savedQuestion.id]),
          el('p', { class: 'muted' }, [`${savedQuestion.status === 'attested' ? 'Attested' : 'Draft'} repository version`]),
        ]),
        gateLabel(gate),
      ]),
      renderWorkflowRail(savedQuestion, dirty),
      renderActionFeedback(),
      el('fieldset', { class: 'editor-section governed-fields' }, [
        el('legend', {}, ['Governed fields — read-only']),
        editorText('Question ID', 'question-id', savedQuestion.id, { readOnly: true }),
        el('dl', { class: 'question-facts' }, [
          el('div', {}, [el('dt', {}, ['Status']), el('dd', {}, [text(savedQuestion.status) || 'Unknown'])]),
          el('div', {}, [el('dt', {}, ['Revision']), el('dd', { class: 'data-text' }, [text(savedQuestion.revision) || 'Unavailable'])]),
          el('div', {}, [el('dt', {}, ['Retirement']), el('dd', {}, ['Managed outside this workbench'])]),
          el('div', {}, [el('dt', {}, ['Reserved data']), el('dd', {}, [
            Object.hasOwn(savedQuestion, 'v2')
              ? 'Reserved v2 data is preserved and read-only.'
              : 'System fields are preserved and read-only.',
          ])]),
        ]),
      ]),
      el('fieldset', { class: 'editor-section metadata-section' }, [
        el('legend', {}, ['Question metadata']),
        el('div', { class: 'editor-grid' }, [
          editorSelect('question-type', TYPES.map(value => [value, value]), question.type, 'Question type'),
          question.type === 'relational'
            ? editorSelect(
              'question-subtype',
              [['', 'Choose subtype'], ...SUBTYPES.map(value => [value, value])],
              question.subtype,
              'Relational subtype',
            ) : null,
          editorSelect(
            'question-category',
            CATEGORIES.map(value => [value, value]),
            question.category,
            'Category',
          ),
          editorSelect(
            'question-difficulty',
            [['1', 'Level 1'], ['2', 'Level 2'], ['3', 'Level 3']],
            String(question.difficulty),
            'Difficulty',
          ),
        ]),
        renderCompetencies(question),
        el('label', { class: 'checkbox-line', for: 'question-high-yield' }, [
          el('input', {
            id: 'question-high-yield',
            type: 'checkbox',
            checked: question.hy === true,
            onChange: event => editorChanged(event.target),
          }),
          'High yield',
        ]),
      ]),
      el('fieldset', { class: 'editor-section source-section' }, [
        el('legend', {}, ['Learning source']),
        editorTextarea('Source pages', 'question-pages', list(question.pages).join(', '), 2),
        el('div', { class: 'editor-grid' }, [
          editorText('Learning link label', 'question-link-label', question.link?.label),
          editorText('Learning link href', 'question-link-href', question.link?.href),
        ]),
        learnerUrl ? el('a', {
          href: learnerUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, ['Open learner-site deep link ↗']) : el('p', { class: 'hint' }, [
          'Enter a valid page or tool link to open the learner surface.',
        ]),
      ]),
      el('fieldset', { class: 'editor-section' }, [
        el('legend', {}, ['Question and answers']),
        editorTextarea('Question stem', 'question-stem', question.stem, 6),
        el('div', { class: 'option-grid' }, OPTION_KEYS.map(key => renderOptionEditor({
          key,
          ...record(optionsByKey[key]),
        }, correctKey))),
      ]),
      el('fieldset', { class: 'editor-section teaching-section' }, [
        el('legend', {}, ['Teaching explanation']),
        editorTextarea('Rationale', 'question-why', question.why, 5),
        editorTextarea('Teaching pearl', 'question-pearl', question.pearl, 3),
        editorTextarea('Evidence anchor', 'question-evidence', question.evidence, 4),
      ]),
      renderTierTwoEditor(question),
      el('div', { class: 'review-safety-grid' }, [
        renderChangedFields(),
        renderAssessment(assessment, dirty),
      ]),
      el('div', { class: 'draft-actions' }, [
        el('button', {
          id: 'revert-question',
          type: 'button',
          disabled: !dirty || state.pending,
          onClick: () => {
            state.editor = clone(state.original);
            resetApprovalInputs();
            refreshEditorState();
            state.qbankError = '';
            state.conflict = null;
            renderShell('question-stem');
            announce(`${savedQuestion.id} reverted to the loaded repository version.`);
          },
        }, ['Revert']),
        el('button', {
          id: 'save-draft',
          class: 'primary',
          type: 'button',
          disabled: !dirty || list(assessment.blockers).length > 0 || state.pending,
          onClick: () => void saveCurrentDraft(),
        }, [state.pending ? 'Saving…' : 'Save draft']),
      ]),
      renderConfirmations(attestationDisabled),
      renderWarningAcknowledgements(assessment, attestationDisabled),
      el('fieldset', { class: 'session-review' }, [
        el('legend', {}, ['Attest']),
        el('p', {}, [reviewed
          ? 'Reviewed in this session. Use the queue checkbox to add this saved green revision to a batch.'
          : batchReason({ ...savedQuestion, assessment }, dirty)]),
        el('div', { class: 'session-actions' }, [
          el('button', {
            id: 'mark-reviewed-next',
            class: 'primary',
            type: 'button',
            disabled: !markEligible || reviewed || state.pending,
            onClick: () => markReviewedAndNext(savedQuestion),
          }, [reviewed ? 'Reviewed this session' : 'Mark reviewed & next']),
          assessment.gate === 'warning' ? el('button', {
            id: 'attest-warning',
            class: 'primary',
            type: 'button',
            disabled: attestationDisabled || !confirmationsComplete() || !warningCodesComplete,
            onClick: () => void attestWarning(savedQuestion, assessment),
          }, ['Attest this warning question']) : null,
        ]),
      ]),
    ]));
    return panel;
  }

  function renderQuestionWorkbench() {
    const questions = assessedQuestions();
    const shown = filteredQuestions({ qbank: questions }, state.filters);
    const queue = el('aside', { class: 'queue-panel', 'aria-labelledby': 'queue-title' }, [
      el('header', { class: 'panel-heading' }, [
        el('h2', { id: 'queue-title' }, ['Review queue']),
        el('p', { class: 'hint' }, ['Gate rails show machine-checkable status; symbols and words carry the same meaning.']),
      ]),
      renderQueueFilters(),
      renderCountStrip(questions),
      el('p', { class: 'queue-meta' }, [`${shown.length} of ${list(state.server?.qbank).length} questions shown`]),
      shown.length
        ? el('ol', {
          id: 'question-queue',
          class: 'queue-list',
          onKeydown: event => moveQueueSelection(event, shown),
        }, shown.map(renderQueueRow))
        : el('p', { class: 'empty-queue' }, [
          'No questions match these filters. Clear or widen a filter to continue.',
        ]),
      renderBatchSummary(),
    ]);
    return el('div', { class: 'workbench' }, [queue, renderQuestionOverview()]);
  }

  function contentStatusLabel(status) {
    if (status === 'reviewed') return 'Reviewed';
    if (status === 'pending') return 'Pending';
    return 'Not reviewed';
  }

  function contentShown() {
    return list(state.server?.items).filter(item => {
      if (state.contentFilters.kind !== 'all' && item.kind !== state.contentFilters.kind) return false;
      if (state.contentFilters.status === 'reviewed' && item.status !== 'reviewed') return false;
      if (state.contentFilters.status === 'unreviewed' && item.status === 'reviewed') return false;
      return true;
    });
  }

  function updateContentFilter(name, value, focusId) {
    state.contentFilters[name] = value;
    renderShell(focusId);
  }

  function toggleContent(item, checked, focusId) {
    const committed = item.status === 'reviewed';
    if (checked === committed) delete state.contentChanges[item.slug];
    else state.contentChanges[item.slug] = checked;
    state.contentMessage = '';
    state.contentCommitUrl = null;
    renderShell(focusId);
  }

  function renderContentRow(item) {
    const id = `content-${domToken(item.slug)}`;
    const committed = item.status === 'reviewed';
    const checked = Object.hasOwn(state.contentChanges, item.slug)
      ? state.contentChanges[item.slug]
      : committed;
    const studentUrl = safeStudentUrl(
      item.kind === 'tool' ? `?tool=${encodeURIComponent(item.slug)}` : `?page=${encodeURIComponent(item.slug)}`,
    );
    const provenance = text(item.by)
      ? ` · Reviewed by ${text(item.by)}${text(item.at) ? ` on ${text(item.at)}` : ''}`
      : '';
    return el('li', { class: 'content-row' }, [
      el('input', {
        id,
        type: 'checkbox',
        checked,
        disabled: state.pending,
        'aria-label': `Mark ${text(item.title) || item.slug} reviewed`,
        onChange: event => toggleContent(item, event.target.checked, id),
      }),
      el('div', {}, [
        el('p', { class: 'content-title' }, [text(item.title) || item.slug]),
        el('p', { class: 'content-meta data-text' }, [
          `${item.kind === 'tool' ? 'tool' : 'page'} · ${item.slug}${provenance}`,
        ]),
      ]),
      studentUrl
        ? el('a', { href: studentUrl, target: '_blank', rel: 'noopener noreferrer' }, ['View ↗'])
        : null,
      el('span', { class: 'content-status' }, [contentStatusLabel(item.status)]),
    ]);
  }

  async function commitContent() {
    const changes = { ...state.contentChanges };
    if (!Object.keys(changes).length || state.pending) return;
    state.pending = true;
    state.contentMessage = 'Committing content reviews…';
    state.contentCommitUrl = null;
    renderShell('content-save-result');
    try {
      const response = await fetchImpl(API, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({
          attester: state.reviewerLabel,
          target: 'content',
          changes,
        }),
      });
      const payload = await responseJson(response);
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        renderLogin('Key not accepted. Check the shared faculty key and try again.');
        return;
      }
      if (!response.ok) throw new Error(responseMessage(payload, 'Content reviews were not saved.'));
      state.contentChanges = Object.create(null);
      state.contentMessage = `Saved ${payload.updated ?? 0} content review${payload.updated === 1 ? '' : 's'}.`;
      state.contentCommitUrl = safeExternalUrl(payload.commit);
      announce(state.contentMessage);
      const refreshed = await load({ silent: true, focusId: 'content-save-result' });
      if (!refreshed) {
        state.navigationAfterSave = null;
        return;
      }
      const navigation = state.navigationAfterSave;
      state.navigationAfterSave = null;
      if (navigation) requestNavigation(navigation);
    } catch (error) {
      state.pending = false;
      state.navigationAfterSave = null;
      state.contentMessage = error instanceof Error ? error.message : 'Content reviews were not saved.';
      state.contentCommitUrl = null;
      announce(state.contentMessage);
      renderShell('content-save-result');
    }
  }

  function renderContentPanel() {
    const shown = contentShown();
    const changes = Object.keys(state.contentChanges).length;
    const kind = filterSelect(
      'content-kind',
      'Content type',
      [['all', 'All types'], ['page', 'Content pages'], ['tool', 'Interactive tools']],
      state.contentFilters.kind,
      event => updateContentFilter('kind', event.target.value, 'content-kind'),
    );
    const status = filterSelect(
      'content-status',
      'Review status',
      [['all', 'All statuses'], ['unreviewed', 'Not reviewed'], ['reviewed', 'Reviewed']],
      state.contentFilters.status,
      event => updateContentFilter('status', event.target.value, 'content-status'),
    );
    return el('section', { class: 'content-panel', 'aria-labelledby': 'content-title' }, [
      el('header', { class: 'panel-heading' }, [
        el('h2', { id: 'content-title' }, ['Content pages & tools']),
        el('p', { class: 'hint' }, ['The existing content-attestation workflow remains available here.']),
      ]),
      el('div', { class: 'content-toolbar' }, [
        kind,
        status,
        el('div', { class: 'content-actions' }, [
          el('span', { class: 'hint' }, [
            `${shown.length} shown · ${shown.filter(item => item.status !== 'reviewed').length} not reviewed`,
          ]),
          el('button', {
            id: 'mark-all-content',
            type: 'button',
            disabled: state.pending,
            onClick: () => {
              for (const item of shown) {
                if (item.status !== 'reviewed') state.contentChanges[item.slug] = true;
              }
              state.contentMessage = '';
              state.contentCommitUrl = null;
              renderShell('mark-all-content');
            },
          }, ['Mark all shown reviewed']),
        ]),
      ]),
      el('ul', { class: 'content-list' }, shown.map(renderContentRow)),
      el('div', { class: 'save-strip' }, [
        el('p', { class: changes ? '' : 'muted' }, [
          changes ? `${changes} unsaved content change${changes === 1 ? '' : 's'}` : 'No unsaved content changes',
        ]),
        el('div', { class: 'content-actions' }, [
          state.contentMessage ? el('span', {
            id: 'content-save-result',
            class: 'hint',
            tabindex: '-1',
          }, [
            state.contentMessage,
            state.contentCommitUrl ? ' ' : null,
            state.contentCommitUrl
              ? el('a', {
                href: state.contentCommitUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
              }, ['View commit ↗'])
              : null,
          ]) : null,
          el('button', {
            id: 'save-content-reviews',
            class: 'primary',
            type: 'button',
            disabled: !changes || state.pending,
            onClick: () => void commitContent(),
          }, [state.pending ? 'Saving…' : 'Save content reviews']),
        ]),
      ]),
    ]);
  }

  function showQbankError(message) {
    state.pending = false;
    state.qbankError = message;
    state.qbankMessage = '';
    state.qbankCommitUrl = null;
    state.batchConfirmation = null;
    announce(message);
    renderShell('qbank-action-error');
  }

  function showConflict(payload) {
    state.pending = false;
    state.navigationAfterSave = null;
    state.batchConfirmation = null;
    state.qbankError = '';
    state.qbankMessage = '';
    state.qbankCommitUrl = null;
    state.conflict = {
      message: stableResponseMessage(payload, 'This question changed after you loaded it.'),
    };
    announce(state.conflict.message);
    renderShell('qbank-conflict');
  }

  async function saveCurrentDraft(retrySnapshot = null) {
    if (state.pending) {
      announce('A faculty action is already in progress.');
      return false;
    }
    let snapshot = retrySnapshot;
    if (!snapshot) {
      refreshEditorState();
      if (!hasUnsavedChanges()) {
        announce('No unsaved question changes to save.');
        return false;
      }
      if (list(state.localAssessment?.blockers).length) {
        announce('Resolve structural blockers before saving this draft.');
        return false;
      }
      const id = state.selectedId;
      snapshot = {
        id,
        body: {
          action: 'qbank.save-draft',
          id,
          baseRevision: text(state.original?.revision),
          item: clone(state.editor),
          attester: state.reviewerLabel,
        },
      };
    }
    const { id, body } = snapshot;
    state.pending = true;
    state.qbankError = '';
    state.qbankMessage = '';
    state.qbankCommitUrl = null;
    state.conflict = null;
    renderShell('save-draft');
    try {
      const response = await fetchImpl(API, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify(body),
      });
      const payload = await responseJson(response);
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        state.reauthAction = {
          kind: 'qbank.save-draft',
          retry: () => saveCurrentDraft(snapshot),
        };
        renderLogin('Key not accepted. Your local draft is retained; enter the faculty key to retry the same save.');
        return false;
      }
      state.reauthAction = null;
      if (response.status === 409) {
        showConflict(payload);
        return false;
      }
      if (!response.ok) {
        state.navigationAfterSave = null;
        showQbankError(stableResponseMessage(payload, 'The draft was not saved.'));
        return false;
      }
      const revision = text(payload.revision);
      if (!revision) {
        state.navigationAfterSave = null;
        showQbankError('invalid_response: The save receipt did not include a question revision. Local work was retained.');
        return false;
      }
      state.qbankMessage = `Saved draft ${id}. Checks current for the refreshed repository version.`;
      state.qbankCommitUrl = safeExternalUrl(payload.commit);
      const refreshed = await load({
        silent: true,
        focusId: 'qbank-action-result',
        requiredId: id,
        expectedRevisions: { [id]: revision },
        preserveOnError: true,
      });
      if (!refreshed) {
        state.navigationAfterSave = null;
        return false;
      }
      const navigation = state.navigationAfterSave;
      state.navigationAfterSave = null;
      if (navigation) requestNavigation(navigation);
      announce(state.qbankMessage);
      return true;
    } catch (error) {
      state.reauthAction = null;
      state.navigationAfterSave = null;
      showQbankError(error instanceof Error
        ? `network_error: ${error.message}`
        : 'network_error: The draft was not saved.');
      return false;
    }
  }

  async function attestEntries(entries, ids) {
    if (state.pending) return false;
    if (!confirmationsComplete()) {
      showQbankError('attest.confirmations_required: Complete all faculty confirmations.');
      return false;
    }
    state.pending = true;
    state.qbankError = '';
    state.qbankMessage = '';
    state.qbankCommitUrl = null;
    state.conflict = null;
    renderShell(state.batchConfirmation ? 'batch-confirmation' : 'attest-warning');
    try {
      const response = await fetchImpl(API, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({
          action: 'qbank.attest',
          items: entries,
          confirmations: {
            clinical: state.confirmations.clinical,
            evidence: state.confirmations.evidence,
            originalityAndNoPhi: state.confirmations.originalityAndNoPhi,
          },
          attester: state.reviewerLabel,
        }),
      });
      const payload = await responseJson(response);
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        renderLogin('Key not accepted. Check the shared faculty key and try again.');
        return false;
      }
      if (response.status === 409) {
        showConflict(payload);
        return false;
      }
      if (!response.ok) {
        showQbankError(stableResponseMessage(payload, 'The attestation was not saved.'));
        return false;
      }
      const expectedRevisions = record(payload.revision);
      if (ids.some(id => !text(expectedRevisions[id]))) {
        showQbankError('invalid_response: The attestation receipt did not confirm every revision. Selection was retained.');
        return false;
      }
      state.qbankMessage = `Attested ${ids.length} question${ids.length === 1 ? '' : 's'}: ${ids.join(', ')}.`;
      state.qbankCommitUrl = safeExternalUrl(payload.commit);
      const selectedId = state.selectedId;
      const refreshed = await load({
        silent: true,
        focusId: 'qbank-action-result',
        requiredId: selectedId,
        expectedRevisions,
        preserveOnError: true,
      });
      if (!refreshed) return false;
      for (const id of ids) {
        state.batch.delete(id);
        state.reviewedInSession.delete(id);
        state.reviewedRevisions.delete(id);
      }
      state.batchConfirmation = null;
      resetApprovalInputs();
      renderShell('qbank-action-result');
      announce(state.qbankMessage);
      return true;
    } catch (error) {
      showQbankError(error instanceof Error
        ? `network_error: ${error.message}`
        : 'network_error: The attestation was not saved.');
      return false;
    }
  }

  async function attestWarning(question, assessment) {
    refreshEditorState();
    const current = findQuestion(question.id);
    if (!current || state.dirtyFields.length || current.status !== 'draft'
        || state.localAssessment?.gate !== 'warning') {
      showQbankError('attest.selection_stale: Save and reload this warning question before attesting.');
      return false;
    }
    const warningCodes = list(state.localAssessment.warnings).map(warning => warning.code);
    if (!warningCodes.length || !warningCodes.every(code => state.warningAcks.has(code))) {
      showQbankError('attest.warning_acknowledgement_required: Acknowledge every current warning before attestation.');
      return false;
    }
    const batchAssessment = safeBatchAssessment([current]);
    if (!batchAssessment.ok) {
      showQbankError(`${batchAssessment.issues[0].code}: ${batchAssessment.issues[0].message}`);
      return false;
    }
    return attestEntries([{
      id: current.id,
      revision: current.revision,
      acknowledgedWarnings: warningCodes,
    }], [current.id]);
  }

  function sameAttestationEntries(left, right) {
    const keys = entries => list(entries)
      .map(entry => `${text(entry?.id)}\u0000${text(entry?.revision)}`)
      .sort();
    const before = keys(left);
    const after = keys(right);
    return before.length === after.length
      && before.every((value, index) => value === after[index]);
  }

  async function attestBatch(frozenEntries) {
    const selected = selectedBatchQuestions();
    const currentEntries = selected.map(question => ({
      id: question.id,
      revision: question.revision,
    }));
    if (selected.length !== state.batch.size
        || !sameAttestationEntries(frozenEntries, currentEntries)) {
      resetApprovalInputs();
      showQbankError('batch.selection_stale: Reload or review the selected questions again.');
      return false;
    }
    const assessment = safeBatchAssessment(selected);
    if (!assessment.ok) {
      showQbankError(`${assessment.issues[0].code}: ${assessment.issues[0].message}`);
      return false;
    }
    return attestEntries(currentEntries, currentEntries.map(entry => entry.id));
  }

  window.addEventListener('beforeunload', event => {
    if (!hasAnyUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (state.navigationGuard) {
        saveNavigationGuard();
        return;
      }
      if (state.tab === 'content') {
        if (state.pending) {
          announce('Content reviews are already saving.');
        } else if (Object.keys(state.contentChanges).length) {
          void commitContent();
        } else {
          announce('No unsaved content reviews to save.');
        }
      } else {
        saveCurrentDraft();
      }
    }
  });

  if (getKey()) void load();
  else renderLogin();

  return { state, load };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  startFacultyConsole({ document, window });
}
