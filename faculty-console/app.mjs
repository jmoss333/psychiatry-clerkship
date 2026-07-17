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
import {
  buildExternalReviewUrl,
  buildPreviewRequest,
  createReviewToken,
  deriveAttestationEligibility,
  deriveReviewCounts,
  filterReviewItems,
  matchesPreviewStatus,
  normalizeReviewItems,
  normalizeStudentBase,
  reviewedRevisionMatches,
} from './review-model.mjs';

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

const emptyReviewChecks = () => ({
  completeItemReviewed: false,
  liveReviewed: false,
  separateTabReviewed: false,
  liveUnavailableAcknowledged: false,
  accuracy: false,
  interactions: false,
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

function freezeSnapshot(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeSnapshot(nested);
  return Object.freeze(value);
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

function legacyBatchEligible(question, reviewedInSession, hasUnsavedChanges = false) {
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
  tokenFactory = () => createReviewToken(window.crypto),
  scheduleTimeout = (callback, delay) => window.setTimeout(callback, delay),
  cancelTimeout = id => window.clearTimeout(id),
  openExternal = url => window.open(url, '_blank', 'noopener,noreferrer'),
}) {
  const app = document.getElementById('app');
  const statusRegion = document.getElementById('app-status');
  if (!app || !statusRegion) {
    throw new Error('Faculty console shell is incomplete.');
  }

  const state = {
    server: null,
    selectedKey: null,
    completedHoldKey: null,
    reviewItems: [],
    selectedId: null,
    editor: null,
    original: null,
    reviewedInSession: new Set(),
    batch: new Set(),
    queueFilters: {
      search: '',
      type: 'all',
      status: 'needs-review',
      category: 'all',
      gate: 'all',
      difficulty: 'all',
    },
    viewMode: 'live',
    preview: null,
    previewAttempt: 0,
    reviewChecks: emptyReviewChecks(),
    pending: false,
    reviewerLabel: DEFAULT_REVIEWER,
    reviewedRevisions: new Map(),
    contentChanges: Object.create(null),
    contentMessage: '',
    contentCommitUrl: null,
    reopenConfirmation: null,
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
  let renderedIssueRecords = [];

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
        || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(text(payload.manifestRevision))
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

  function findReviewItem(key) {
    return state.reviewItems.find(item => item.key === key) || null;
  }

  function currentReviewItem() {
    return findReviewItem(state.selectedKey);
  }

  function visibleReviewItems() {
    return filterReviewItems(state.reviewItems, state.queueFilters);
  }

  function clearReviewSelection() {
    if (state.preview?.timerId) cancelTimeout(state.preview.timerId);
    state.selectedKey = null;
    state.completedHoldKey = null;
    state.selectedId = null;
    state.original = null;
    state.editor = null;
    state.dirtyFields = [];
    state.localAssessment = null;
    state.viewMode = 'live';
    state.preview = null;
    state.previewAttempt = 0;
    state.reviewChecks = emptyReviewChecks();
    resetApprovalInputs();
  }

  function setSelectedReviewKey(key, { force = false, preserveCompletedHold = false } = {}) {
    const item = findReviewItem(key);
    if (!item) return false;
    if (!preserveCompletedHold) state.completedHoldKey = null;
    if (!force && state.selectedKey === key) return true;
    if (state.preview?.timerId) cancelTimeout(state.preview.timerId);
    state.reviewedRevisions.clear();
    state.selectedKey = key;
    state.viewMode = 'live';
    state.preview = null;
    state.previewAttempt = 0;
    state.reviewChecks = emptyReviewChecks();
    resetApprovalInputs();
    if (item.type === 'question') setSelected(item.identity, { force: true });
    else {
      state.selectedId = null;
      state.original = null;
      state.editor = null;
      state.dirtyFields = [];
      state.localAssessment = null;
    }
    return true;
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
      if (!legacyBatchEligible(assessed, state.reviewedInSession, false)) state.batch.delete(id);
    }
  }

  function chooseSelection() {
    const visible = visibleReviewItems();
    const held = state.completedHoldKey && findReviewItem(state.completedHoldKey);
    if (held) {
      setSelectedReviewKey(held.key, { force: true, preserveCompletedHold: true });
      return;
    }
    if (visible.some(item => item.key === state.selectedKey)) {
      setSelectedReviewKey(state.selectedKey, { force: true });
      return;
    }
    if (visible[0]) setSelectedReviewKey(visible[0].key, { force: true });
    else clearReviewSelection();
  }

  function renderLogin(message = '') {
    document.title = 'Faculty attestation workspace';
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
        el('button', { class: 'primary', type: 'submit' }, ['Unlock workspace']),
      ]),
    ]);
    replaceApp(el('section', { class: 'login-shell', 'aria-labelledby': 'login-title' }, [
      el('p', { class: 'eyebrow' }, ['Faculty governance']),
      el('h1', { id: 'login-title' }, ['Faculty attestation workspace']),
      el('p', { class: 'console-subtitle' }, [
        'Review one learner-facing page, tool, or question, resolve concerns, then attest deliberately.',
      ]),
      form,
    ]));
    keyInput.focus();
  }

  function renderLoading() {
    replaceApp(el('section', { class: 'loading-state', 'aria-labelledby': 'loading-title' }, [
      el('p', { class: 'eyebrow' }, ['Faculty governance']),
      el('h1', { id: 'loading-title' }, ['Loading current repository state…']),
      el('p', { class: 'muted' }, ['Pages, tools, and question versions are being organized for review.']),
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
    completedHoldKey = null,
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
      let studentBase;
      let reviewItems;
      try {
        studentBase = normalizeStudentBase(payload.student);
        reviewItems = normalizeReviewItems(payload);
      } catch {
        throw new Error('The server returned an incomplete state.');
      }
      const manifestChanged = state.server !== null
        && state.server.manifestRevision !== payload.manifestRevision;
      if (manifestChanged) {
        state.reviewedInSession.clear();
        state.reviewedRevisions.clear();
        state.batch.clear();
        resetApprovalInputs();
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
      state.server = { ...payload, student: studentBase.href };
      state.reviewItems = reviewItems;
      if (completedHoldKey && findReviewItem(completedHoldKey)) {
        state.completedHoldKey = completedHoldKey;
      }
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
      state.reviewItems = [];
      clearReviewSelection();
      state.navigationGuard = null;
      state.navigationAfterSave = null;
      state.batchConfirmation = null;
      state.reauthAction = null;
      renderLogin();
      return;
    }
    if (target.kind === 'review' && setSelectedReviewKey(target.key)) {
      renderShell(target.focusId || 'review-item-selector');
      return;
    }
    if (target.kind === 'filter') {
      state.queueFilters[target.name] = target.value;
      state.completedHoldKey = null;
      const visible = visibleReviewItems();
      const next = visible[0] || null;
      if (next) setSelectedReviewKey(next.key);
      else clearReviewSelection();
      renderShell(target.focusTarget || 'review-item-selector');
      announce(next
        ? `The prior selection is hidden by the active filters. Selected ${next.title}.`
        : 'No review items match the active filters.');
    }
  }

  function requestNavigation(target, returnFocus = null) {
    const changesReviewItem = (target?.kind === 'review' && target.key !== state.selectedKey)
      || target?.kind === 'filter';
    const locksWithUnsavedChanges = target?.kind === 'lock' && hasAnyUnsavedChanges();
    if (locksWithUnsavedChanges
        || (hasUnsavedChanges() && changesReviewItem)) {
      state.navigationGuard = { target, returnFocus };
      if (!showNavigationGuard()) {
        state.navigationGuard = null;
        announce('Navigation is unavailable. Your local changes were retained.');
      }
      return;
    }
    performNavigation(target);
  }

  function showNavigationGuard() {
    const background = document.getElementById('console-background');
    const modal = renderNavigationGuard();
    if (!background || !modal) return false;
    document.getElementById('unsaved-guard')?.remove();
    background.setAttribute('inert', '');
    app.appendChild(modal);
    modal.focus();
    return true;
  }

  function dismissNavigationGuard(returnFocus = null) {
    document.getElementById('unsaved-guard')?.remove();
    const background = document.getElementById('console-background');
    if (background && !state.pending) background.removeAttribute('inert');
    refreshQueueStrip(returnFocus);
  }

  function focusRequested(focusTarget = null) {
    const focusState = typeof focusTarget === 'string'
      ? { id: focusTarget }
      : record(focusTarget);
    if (!text(focusState.id)) return;
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

  function itemTypeLabel(type) {
    if (type === 'page') return 'Page';
    if (type === 'tool') return 'Tool';
    return 'Question';
  }

  function savedStatusLabel(item) {
    if (item?.type === 'question') return item.savedStatus === 'attested' ? 'Attested' : 'Draft';
    return item?.savedStatus === 'reviewed' ? 'Reviewed' : 'Not reviewed';
  }

  function viewModeLabel(item = currentReviewItem()) {
    if (item?.type !== 'question' || state.viewMode === 'live') return 'Live deploy';
    return state.viewMode === 'draft' ? 'Draft preview' : 'Edit question';
  }

  function renderItemHeader(item) {
    if (!item) {
      return el('section', { id: 'selected-item-header', class: 'item-header empty-selection' }, [
        el('h2', { id: 'selected-item-title' }, ['No items match the active filters']),
        el('p', { class: 'muted' }, ['Clear or widen a queue filter to continue.']),
      ]);
    }
    return el('section', {
      id: 'selected-item-header',
      class: 'item-header',
      'aria-labelledby': 'selected-item-title',
    }, [
      el('div', {}, [
        el('p', { class: 'eyebrow' }, ['Selected curriculum item']),
        el('h2', { id: 'selected-item-title' }, [item.title]),
        el('p', { id: 'selected-item-identity', class: 'data-text item-identity' }, [item.identity]),
      ]),
      el('dl', { class: 'item-facts' }, [
        el('div', {}, [el('dt', {}, ['Type']), el('dd', { id: 'selected-item-type' }, [itemTypeLabel(item.type)])]),
        el('div', {}, [el('dt', {}, ['Saved status']), el('dd', { id: 'selected-item-status' }, [savedStatusLabel(item)])]),
        el('div', {}, [el('dt', {}, ['Current view']), el('dd', { id: 'selected-item-view' }, [viewModeLabel(item)])]),
        item.revision ? el('div', {}, [
          el('dt', {}, ['Revision']),
          el('dd', { id: 'selected-item-revision', class: 'data-text' }, [item.revision]),
        ]) : null,
      ]),
    ]);
  }

  function switchQuestionView(mode, focusId) {
    if (!['live', 'draft', 'edit'].includes(mode) || currentReviewItem()?.type !== 'question') return;
    state.viewMode = mode;
    for (const candidate of ['live', 'draft', 'edit']) {
      const button = document.getElementById(`view-${candidate}`);
      button?.setAttribute('aria-pressed', String(candidate === mode));
      const pane = document.getElementById(`question-view-${candidate}`);
      if (candidate === mode) pane?.removeAttribute('hidden');
      else pane?.setAttribute('hidden', '');
    }
    const view = document.getElementById('selected-item-view');
    if (view) view.textContent = viewModeLabel();
    refreshAttestationRail(focusId);
  }

  function renderViewSwitcher(item) {
    if (item?.type !== 'question') {
      return el('div', { class: 'view-switcher', 'aria-label': 'Current workspace view' }, [
        el('span', { class: 'view-label' }, ['Live deploy']),
      ]);
    }
    return el('div', {
      class: 'view-switcher',
      role: 'group',
      'aria-label': 'Question workspace view',
    }, [
      ...[
        ['live', 'Live deploy'],
        ['draft', 'Draft preview'],
        ['edit', 'Edit question'],
      ].map(([mode, label]) => el('button', {
        id: `view-${mode}`,
        type: 'button',
        'aria-pressed': String(state.viewMode === mode),
        onClick: () => switchQuestionView(mode, `view-${mode}`),
      }, [label])),
    ]);
  }

  function renderWorkspaceSurface(item) {
    if (!item) {
      return el('div', { class: 'preview-shell empty-selection' }, [
        el('p', { class: 'muted' }, ['No review surface is available for the active filters.']),
      ]);
    }
    const live = el('section', {
      id: 'question-view-live',
      class: 'preview-shell',
      hidden: item.type === 'question' && state.viewMode !== 'live',
      'aria-label': 'Live learner deployment',
    }, [
      el('div', { id: 'preview-status-slot', class: 'preview-status' }, [
        el('strong', {}, ['Live preview pending']),
        el('span', {}, [' The authenticated shell is ready; verified preview loading follows in the next slice.']),
      ]),
      el('iframe', {
        id: 'learner-preview-frame',
        title: `Live learner preview for ${item.title}`,
        src: 'about:blank',
      }),
    ]);
    if (item.type !== 'question') return live;
    const dirty = state.dirtyFields.length > 0;
    return el('div', { class: 'question-view-stack' }, [
      live,
      el('section', {
        id: 'question-view-draft',
        class: 'preview-shell draft-preview-shell',
        hidden: state.viewMode !== 'draft',
        'aria-labelledby': 'draft-preview-title',
      }, [
        el('h2', { id: 'draft-preview-title' }, [
          dirty ? 'Unsaved local preview · Not deployed' : 'Saved Draft preview · Not deployed',
        ]),
        el('p', { class: 'muted' }, [
          'The revision-aware Draft rendering surface is introduced in the next review slice.',
        ]),
      ]),
      el('section', {
        id: 'question-view-edit',
        class: 'question-edit-pane',
        hidden: state.viewMode !== 'edit',
        'aria-label': 'Question editor',
      }, [renderQuestionOverview()]),
    ]);
  }

  function renderAttestationRail(item) {
    if (!item) {
      return el('aside', { id: 'attestation-rail', class: 'signoff-rail' }, [
        el('h2', {}, ['Review → Resolve → Confirm']),
        el('p', { class: 'muted' }, ['No item is selected.']),
      ]);
    }
    const question = item.type === 'question' ? state.editor : null;
    const assessment = question ? (state.localAssessment || currentAssessment(question)) : null;
    const dirty = question ? state.dirtyFields.length > 0 : false;
    const blocked = question && (dirty || assessment?.gate === 'blocked' || item.savedStatus !== 'draft');
    const warningCodesComplete = question ? warningAcknowledgementsComplete(assessment) : false;
    const currentStep = dirty ? 'review' : item.completion === 'complete' ? 'confirm' : 'resolve';
    return el('aside', {
      id: 'attestation-rail',
      class: 'signoff-rail',
      'aria-labelledby': 'attestation-rail-title',
    }, [
      el('header', { class: 'rail-heading' }, [
        el('p', { class: 'eyebrow' }, ['Single-item sign-off']),
        el('h2', { id: 'attestation-rail-title' }, ['Review → Resolve → Confirm']),
      ]),
      renderActionFeedback(),
      el('section', {
        id: 'rail-step-review',
        class: `rail-step${currentStep === 'review' ? ' current' : ''}`,
      }, [
        el('h3', {}, ['Review']),
        el('p', {}, [item.type === 'question'
          ? 'Inspect the learner view, saved Draft, and governed question fields.'
          : 'Inspect the complete learner-facing page or tool.']),
      ]),
      el('section', {
        id: 'rail-step-resolve',
        class: `rail-step${currentStep === 'resolve' ? ' current' : ''}`,
      }, [
        el('h3', {}, ['Resolve']),
        question
          ? gateLabel(Object.hasOwn(GATE_LABELS, assessment?.gate) ? assessment.gate : 'blocked')
          : el('p', { class: 'muted' }, [
            'Content checks activate with the verified preview workflow.',
          ]),
      ]),
      el('section', {
        id: 'rail-step-confirm',
        class: `rail-step${currentStep === 'confirm' ? ' current' : ''}`,
      }, [
        el('h3', {}, ['Confirm']),
        question ? renderConfirmations(blocked || state.pending) : el('p', { class: 'muted' }, [
          'Individual attestation activates after live review is verified.',
        ]),
        question ? renderWarningAcknowledgements(assessment, blocked || state.pending) : null,
        question && assessment?.gate === 'warning' ? el('button', {
          id: 'attest-warning',
          class: 'primary rail-action',
          type: 'button',
          disabled: blocked || state.pending || !confirmationsComplete() || !warningCodesComplete,
          onClick: () => void attestWarning(findQuestion(item.identity), assessment),
        }, ['Attest this warning question']) : el('button', {
          id: 'attest-current-item',
          class: 'primary rail-action',
          type: 'button',
          disabled: true,
        }, ['Attestation pending live review']),
      ]),
    ]);
  }

  function renderWorkspace(item) {
    return el('section', { id: 'review-workspace', class: 'workspace' }, [
      el('div', { class: 'preview-column' }, [
        renderViewSwitcher(item),
        renderWorkspaceSurface(item),
      ]),
      renderAttestationRail(item),
    ]);
  }

  function renderShell(focusTarget = null) {
    if (!state.server) return;
    renderedIssueRecords = [];
    document.title = 'Faculty attestation workspace';
    const reviewer = el('input', {
      id: 'reviewer-label',
      type: 'text',
      maxlength: '80',
      value: state.reviewerLabel,
      onInput: event => { state.reviewerLabel = event.target.value; },
    });

    const item = currentReviewItem();
    const modal = renderNavigationGuard();
    const background = el('div', {
      id: 'console-background',
      inert: state.pending || modal ? true : null,
      'aria-busy': state.pending ? 'true' : null,
    }, [
      el('header', { class: 'console-header' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow' }, ['Psychiatry clerkship faculty']),
          el('h1', {}, ['Faculty attestation workspace']),
          el('p', { class: 'console-subtitle' }, [
            'Review one learner-facing page, tool, or question, resolve concerns, then attest deliberately.',
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
      renderSharedQueueStrip(visibleReviewItems()),
      renderItemHeader(item),
      renderWorkspace(item),
    ]);
    replaceApp(background, ...(modal ? [modal] : []));
    applyIssueAssociations(renderedIssueRecords);
    focusRequested(focusTarget);
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
    const control = el('select', { id, value: selected, onChange }, values.map(([value, name]) => (
      option(value, name, selected)
    )));
    return labeledControl(label, id, control);
  }

  function updateQueueFilter(name, value, focusTarget) {
    const filters = { ...state.queueFilters, [name]: value };
    const visible = filterReviewItems(state.reviewItems, filters);
    state.completedHoldKey = null;
    if (visible.some(item => item.key === state.selectedKey)) {
      state.queueFilters[name] = value;
      refreshQueueStrip(focusTarget);
      announce(`${visible.length} review item${visible.length === 1 ? '' : 's'} shown.`);
      return;
    }
    requestNavigation(
      { kind: 'filter', name, value, focusTarget },
      text(record(focusTarget).id) || text(focusTarget) || 'review-item-selector',
    );
  }

  function renderSharedQueueStrip(items) {
    const questions = list(state.server?.qbank);
    const categories = [...new Set(questions.map(question => text(question.category)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    const difficulties = [...new Set(questions.map(question => String(question.difficulty)))]
      .filter(value => value !== 'undefined')
      .sort((left, right) => Number(left) - Number(right));
    const held = state.completedHoldKey && findReviewItem(state.completedHoldKey);
    const selectable = held && !items.some(item => item.key === held.key) ? [held, ...items] : items;
    const index = items.findIndex(item => item.key === state.selectedKey);
    const previousKey = index > 0 ? items[index - 1].key : null;
    const nextKey = held && state.selectedKey === held.key && index < 0
      ? items[0]?.key || null
      : index >= 0 && index < items.length - 1 ? items[index + 1].key : null;
    const counts = deriveReviewCounts(items);
    const search = el('input', {
      id: 'review-search',
      type: 'search',
      value: state.queueFilters.search,
      autocomplete: 'off',
      onInput: event => updateQueueFilter('search', event.target.value, editorFocusState(event.target)),
    });
    const selector = el('select', {
      id: 'review-item-selector',
      value: state.selectedKey || '',
      disabled: !selectable.length || state.pending,
      onChange: event => requestNavigation(
        { kind: 'review', key: event.target.value, focusId: 'review-item-selector' },
        'review-item-selector',
      ),
    }, selectable.length ? selectable.map(item => el('option', {
      value: item.key,
      selected: item.key === state.selectedKey,
      'aria-current': item.key === state.selectedKey ? 'true' : null,
    }, [`${itemTypeLabel(item.type)} · ${item.title} · ${savedStatusLabel(item)}`])) : [
      option('', 'No items match the active filters', ''),
    ]);
    return el('section', {
      id: 'review-queue-strip',
      class: 'queue-strip',
      'aria-labelledby': 'review-queue-title',
    }, [
      el('div', { class: 'queue-primary' }, [
        el('div', { class: 'queue-heading' }, [
          el('p', { class: 'eyebrow' }, ['Ordered review queue']),
          el('h2', { id: 'review-queue-title' }, ['Choose one curriculum item']),
        ]),
        el('div', { class: 'queue-navigation' }, [
          el('button', {
            id: 'previous-review-item',
            type: 'button',
            disabled: !previousKey || state.pending,
            onClick: () => requestNavigation(
              { kind: 'review', key: previousKey, focusId: 'previous-review-item' },
              'previous-review-item',
            ),
          }, ['Previous']),
          el('button', {
            id: 'next-review-item',
            type: 'button',
            disabled: !nextKey || state.pending,
            onClick: () => requestNavigation(
              { kind: 'review', key: nextKey, focusId: 'next-review-item' },
              'next-review-item',
            ),
          }, [held && state.selectedKey === held.key ? 'Next item' : 'Next']),
        ]),
        labeledControl('Search pages, tools, and questions', 'review-search', search, 'queue-search'),
        labeledControl('Review item', 'review-item-selector', selector, 'queue-selector'),
      ]),
      el('div', { class: 'queue-filters' }, [
        filterSelect(
          'review-type-filter',
          'Item type',
          [['all', 'All types'], ['page', 'Pages'], ['tool', 'Tools'], ['question', 'Questions']],
          state.queueFilters.type,
          event => updateQueueFilter('type', event.target.value, 'review-type-filter'),
        ),
        filterSelect(
          'review-status-filter',
          'Review status',
          [['needs-review', 'Needs review'], ['complete', 'Complete'], ['all', 'All statuses']],
          state.queueFilters.status,
          event => updateQueueFilter('status', event.target.value, 'review-status-filter'),
        ),
        el('p', { id: 'review-queue-counts', class: 'queue-counts' }, [
          `${counts.total} shown · ${counts.needsReview} need review · ${counts.complete} complete`,
        ]),
      ]),
      el('details', { id: 'question-filter-disclosure', class: 'question-filter-disclosure' }, [
        el('summary', {}, ['Question filters']),
        el('fieldset', { class: 'question-filter-grid' }, [
          el('legend', { class: 'sr-only' }, ['Question-only filters']),
          filterSelect(
            'filter-question-category',
            'Category',
            [['all', 'All categories'], ...categories.map(value => [value, value])],
            state.queueFilters.category,
            event => updateQueueFilter('category', event.target.value, 'filter-question-category'),
          ),
          filterSelect(
            'question-gate',
            'Review gate',
            [['all', 'All gates'], ['ready', 'Ready'], ['warning', 'Warning'], ['blocked', 'Blocked']],
            state.queueFilters.gate,
            event => updateQueueFilter('gate', event.target.value, 'question-gate'),
          ),
          filterSelect(
            'filter-question-difficulty',
            'Difficulty',
            [['all', 'All levels'], ...difficulties.map(value => [value, `Level ${value}`])],
            state.queueFilters.difficulty,
            event => updateQueueFilter('difficulty', event.target.value, 'filter-question-difficulty'),
          ),
        ]),
      ]),
      items.length ? null : el('p', { class: 'empty-queue' }, [
        'No items match these filters. Clear or widen a filter to continue.',
      ]),
    ]);
  }

  function refreshQueueStrip(focusTarget = null) {
    const current = document.getElementById('review-queue-strip');
    if (!current) return;
    const replacement = renderSharedQueueStrip(visibleReviewItems());
    current.replaceChildren(...replacement.children);
    focusRequested(focusTarget);
  }

  function gateLabel(gate) {
    const meta = GATE_LABELS[gate] || GATE_LABELS.blocked;
    return el('span', { class: `gate-label ${gate}` }, [
      el('span', { 'aria-hidden': 'true' }, [meta.symbol]),
      meta.label,
    ]);
  }

  function refreshAttestationRail(focusTarget = null) {
    const current = document.getElementById('attestation-rail');
    if (!current) return;
    const replacement = renderAttestationRail(currentReviewItem());
    current.replaceChildren(...replacement.children);
    focusRequested(focusTarget);
  }

  function refreshQuestionSurfacesAndRail(focusTarget = null) {
    const item = currentReviewItem();
    if (item?.type !== 'question') return;
    renderedIssueRecords = [];
    const title = document.getElementById('draft-preview-title');
    if (title) {
      title.textContent = state.dirtyFields.length
        ? 'Unsaved local preview · Not deployed'
        : 'Saved Draft preview · Not deployed';
    }
    const editPane = document.getElementById('question-view-edit');
    if (editPane) editPane.replaceChildren(renderQuestionOverview());
    const rail = document.getElementById('attestation-rail');
    if (rail) {
      const replacement = renderAttestationRail(item);
      rail.replaceChildren(...replacement.children);
    }
    applyIssueAssociations(renderedIssueRecords);
    focusRequested(focusTarget);
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
          && legacyBatchEligible(question, state.reviewedInSession, false)
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
      entries: selected.map(question => ({
        id: question.id,
        revision: question.revision,
        reviewedRevision: state.reviewedRevisions.get(question.id),
      })),
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
    refreshQuestionSurfacesAndRail(focusId);
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
    return el('fieldset', {
      id: 'question-competencies',
      class: 'checkbox-fieldset',
      tabindex: '-1',
    }, [
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
    return el('fieldset', {
      id: 'question-tier2',
      class: 'editor-section tier-two',
      tabindex: '-1',
    }, [
      el('legend', {}, ['Tier-two reasoning']),
      editorTextarea('Tier-two question', 'tier2-question', tier.q, 3),
      el('div', {
        id: 'question-tier2-options',
        class: 'option-grid',
        role: 'group',
        'aria-label': 'Tier-two answer options and correct answer',
        tabindex: '-1',
      }, tierKeys.map(key => {
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

  function issueTarget(field) {
    const value = text(field);
    const direct = (targetId, associationIds = [targetId]) => ({ targetId, associationIds });
    if (value === 'id') return direct('question-id');
    if (value === 'status' || value === 'retired') return direct('question-governed-fields');
    if (value === 'stem') return direct('question-stem');
    if (value === 'type') return direct('question-type');
    if (value === 'subtype') return direct('question-subtype');
    if (value === 'category') return direct('question-category');
    if (value === 'competency') return direct('question-competencies');
    if (value === 'difficulty') return direct('question-difficulty');
    if (value === 'hy') return direct('question-high-yield');
    if (value === 'pages') return direct('question-pages');
    if (value === 'link') return direct('question-link-fields');
    if (value === 'link.label') return direct('question-link-label');
    if (value.startsWith('link.href')) return direct('question-link-href');
    if (value === 'why') return direct('question-why');
    if (value === 'pearl') return direct('question-pearl');
    if (value === 'evidence') return direct('question-evidence');
    if (value === 'options') return direct('question-options');
    const optionMatch = /^options\.([A-D])\.(t|c|trap)$/.exec(value);
    if (optionMatch) {
      const [, key, nestedField] = optionMatch;
      if (nestedField === 't') return direct(`option-${key}-text`);
      if (nestedField === 'c') return direct(`correct-${key}`);
      if (nestedField === 'trap') {
        return direct(`option-${key}-trap-name`, [
          `option-${key}-trap-name`,
          `option-${key}-trap-note`,
        ]);
      }
    }
    if (value === 'tier2') return direct('question-tier2');
    if (value === 'tier2.q') return direct('tier2-question');
    if (value === 'tier2.why') return direct('tier2-why');
    if (value === 'tier2.options') return direct('question-tier2-options');
    const tierMatch = /^tier2\.options\.([A-D])\.(t|c)$/.exec(value);
    if (tierMatch) {
      const [, key, nestedField] = tierMatch;
      if (nestedField === 't') return direct(`tier2-option-${key}-text`);
      if (nestedField === 'c') return direct(`tier2-correct-${key}`);
    }
    return { targetId: 'review-title', associationIds: [] };
  }

  function normalizeIssueRecords(assessment) {
    const counts = new Map();
    const normalize = (issue, kind) => {
      const field = text(issue?.field) || 'Question';
      const code = text(issue?.code) || 'uncoded';
      const { targetId, associationIds } = issueTarget(field);
      const baseId = [
        'issue',
        kind,
        domToken(code.toLowerCase()) || 'uncoded',
        domToken(field.toLowerCase()) || 'question',
      ].join('-');
      const occurrence = (counts.get(baseId) || 0) + 1;
      counts.set(baseId, occurrence);
      return {
        issue,
        kind,
        field,
        targetId,
        associationIds,
        issueId: occurrence === 1 ? baseId : `${baseId}-${occurrence}`,
      };
    };
    return [
      ...list(assessment?.blockers).map(issue => normalize(issue, 'blocked')),
      ...list(assessment?.warnings).map(issue => normalize(issue, 'warning')),
    ];
  }

  function applyIssueAssociations(issueRecords) {
    const grouped = new Map();
    for (const issueRecord of issueRecords) {
      for (const targetId of issueRecord.associationIds) {
        const target = document.getElementById(targetId);
        if (!target) continue;
        const group = grouped.get(target) || { issueIds: [], blocked: false };
        group.issueIds.push(issueRecord.issueId);
        group.blocked ||= issueRecord.kind === 'blocked';
        grouped.set(target, group);
      }
    }
    for (const [target, group] of grouped) {
      const descriptionIds = new Set(
        (target.getAttribute('aria-describedby') || '').trim().split(/\s+/).filter(Boolean),
      );
      for (const issueId of group.issueIds) descriptionIds.add(issueId);
      target.setAttribute('aria-describedby', [...descriptionIds].join(' '));
      if (group.blocked) target.setAttribute('aria-invalid', 'true');
      else target.removeAttribute('aria-invalid');
    }
  }

  function renderIssueList(title, issueRecords, kind) {
    if (!issueRecords.length) return null;
    return el('section', { class: `issue-group ${kind}` }, [
      el('h4', {}, [title]),
      el('ul', { class: 'issue-list' }, issueRecords.map(issueRecord => {
        const { issue, field, targetId, issueId } = issueRecord;
        return el('li', { id: issueId }, [
          el('a', {
            href: `#${targetId}`,
            onClick: () => document.getElementById(targetId)?.focus(),
          }, [field]),
          `: ${text(issue.message) || text(issue.code) || 'Review this field.'}`,
        ]);
      })),
    ]);
  }

  function renderAssessment(assessment, dirty, issueRecords) {
    const gate = Object.hasOwn(GATE_LABELS, assessment?.gate) ? assessment.gate : 'blocked';
    const blockers = issueRecords.filter(issueRecord => issueRecord.kind === 'blocked');
    const warnings = issueRecords.filter(issueRecord => issueRecord.kind === 'warning');
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
        ? el('ul', {}, state.dirtyFields.map(field => el('li', {}, [field])))
        : el('p', { class: 'muted' }, ['No local changes.']),
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
        el('h3', { id: 'conflict-title' }, ['This review context changed in the repository']),
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
      dismissNavigationGuard(guard.returnFocus);
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
              refreshAttestationRail(id);
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
              refreshAttestationRail(id);
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
    const issueRecords = normalizeIssueRecords(assessment);
    renderedIssueRecords = issueRecords;
    const dirty = state.dirtyFields.length > 0;
    const learnerUrl = safeStudentUrl(text(question.link?.href));
    const correctKey = list(question.options).find(optionItem => optionItem?.c === true)?.key || '';
    const optionsByKey = Object.fromEntries(list(question.options).map(optionItem => [optionItem?.key, optionItem]));

    panel.appendChild(el('div', { class: 'review-sheet' }, [
      el('header', { class: 'review-heading' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow' }, ['Governed question editor']),
          el('h2', {
            id: 'review-title',
            tabindex: '-1',
          }, ['Edit question']),
          el('p', { class: 'muted' }, [
            'Changes stay local until Save draft succeeds and the repository revision reloads.',
          ]),
        ]),
      ]),
      el('fieldset', {
        id: 'question-governed-fields',
        class: 'editor-section governed-fields',
        tabindex: '-1',
        'aria-describedby': 'governed-fields-description',
      }, [
        el('legend', {}, ['Governed fields — read-only']),
        editorText('Question ID', 'question-id', savedQuestion.id, { readOnly: true }),
        el('dl', { id: 'governed-fields-description', class: 'question-facts' }, [
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
        el('div', {
          id: 'question-link-fields',
          class: 'editor-grid',
          role: 'group',
          'aria-label': 'Learning link',
          tabindex: '-1',
        }, [
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
        el('div', {
          id: 'question-options',
          class: 'option-grid',
          role: 'group',
          'aria-label': 'Answer options and correct answer',
          tabindex: '-1',
        }, OPTION_KEYS.map(key => renderOptionEditor({
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
        renderAssessment(assessment, dirty, issueRecords),
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
            refreshQuestionSurfacesAndRail('question-stem');
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
    ]));
    return panel;
  }

  function toggleContent(item, checked, focusId) {
    const committed = item.status === 'reviewed';
    if (checked === committed) delete state.contentChanges[item.slug];
    else state.contentChanges[item.slug] = checked;
    state.contentMessage = '';
    state.contentCommitUrl = null;
    renderShell(focusId);
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
      const refreshed = await load({
        silent: true,
        focusId: 'content-save-result',
        completedHoldKey: state.selectedKey,
      });
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
      message: stableResponseMessage(payload, 'The repository review context changed after you loaded it.'),
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
      snapshot = freezeSnapshot({
        id,
        body: {
          action: 'qbank.save-draft',
          manifestRevision: text(state.server?.manifestRevision),
          id,
          baseRevision: text(state.original?.revision),
          item: clone(state.editor),
          attester: state.reviewerLabel,
        },
      });
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

  async function attestEntries(entries, ids, retrySnapshot = null) {
    if (state.pending) return false;
    let snapshot = retrySnapshot;
    if (!snapshot) {
      if (!confirmationsComplete()) {
        showQbankError('attest.confirmations_required: Complete all faculty confirmations.');
        return false;
      }
      snapshot = freezeSnapshot({
        ids: [...ids],
        body: {
          action: 'qbank.attest',
          manifestRevision: text(state.server?.manifestRevision),
          items: clone(entries),
          confirmations: {
            clinical: state.confirmations.clinical,
            evidence: state.confirmations.evidence,
            originalityAndNoPhi: state.confirmations.originalityAndNoPhi,
          },
          attester: state.reviewerLabel,
        },
      });
    }
    const requestIds = list(snapshot.ids).map(id => text(id));
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
        body: JSON.stringify(snapshot.body),
      });
      const payload = await responseJson(response);
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        state.reauthAction = {
          kind: 'qbank.attest',
          retry: () => attestEntries(null, null, snapshot),
        };
        renderLogin('Key not accepted. Your exact attestation is retained; enter the faculty key to retry.');
        return false;
      }
      state.reauthAction = null;
      if (response.status === 409) {
        showConflict(payload);
        return false;
      }
      if (!response.ok) {
        showQbankError(stableResponseMessage(payload, 'The attestation was not saved.'));
        return false;
      }
      const expectedRevisions = record(payload.revision);
      if (requestIds.some(id => !text(expectedRevisions[id]))) {
        showQbankError('invalid_response: The attestation receipt did not confirm every revision. Selection was retained.');
        return false;
      }
      state.qbankMessage = `Attested ${requestIds.length} question${requestIds.length === 1 ? '' : 's'}: ${requestIds.join(', ')}.`;
      state.qbankCommitUrl = safeExternalUrl(payload.commit);
      const selectedId = state.selectedId;
      const selectedKey = state.selectedKey;
      const refreshed = await load({
        silent: true,
        focusId: 'qbank-action-result',
        requiredId: selectedId,
        expectedRevisions,
        preserveOnError: true,
        completedHoldKey: selectedKey,
      });
      if (!refreshed) return false;
      for (const id of requestIds) {
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
      state.reauthAction = null;
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
      .map(entry => [
        text(entry?.id),
        text(entry?.revision),
        text(entry?.reviewedRevision),
      ].join('\u0000'))
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
      reviewedRevision: state.reviewedRevisions.get(question.id),
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
      if (hasUnsavedChanges()) saveCurrentDraft();
      else if (Object.keys(state.contentChanges).length) void commitContent();
      else announce('No unsaved question changes to save.');
    }
  });

  if (getKey()) void load();
  else renderLogin();

  return { state, load };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  startFacultyConsole({ document, window });
}
