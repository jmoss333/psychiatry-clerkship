import {
  assessBatch,
  assessItem,
  diffEditableFields,
} from './qbank-rules.mjs';

const API = '/api/attest';
const KEY_STORAGE = 'fac_key';
const DEFAULT_REVIEWER = 'Joshua Moss, MD';

const GATE_LABELS = {
  ready: { label: 'Ready', symbol: '✓' },
  warning: { label: 'Warning', symbol: '!' },
  blocked: { label: 'Blocked', symbol: '×' },
};

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value : '';
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
  };

  function el(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value === null || value === undefined || value === false) continue;
      if (name === 'class') {
        node.className = value;
      } else if (name.startsWith('on') && typeof value === 'function') {
        node.addEventListener(name.slice(2).toLowerCase(), value);
      } else if (['checked', 'disabled', 'selected', 'value'].includes(name)) {
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

  async function responseJson(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
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
    return diffEditableFields(state.original, question).length > 0;
  }

  function hasAnyUnsavedChanges() {
    return hasUnsavedChanges() || Object.keys(state.contentChanges).length > 0;
  }

  function setSelected(id) {
    const question = findQuestion(id);
    if (!question) {
      state.selectedId = null;
      state.original = null;
      state.editor = null;
      return;
    }
    state.selectedId = question.id;
    state.original = structuredClone(question);
    state.editor = structuredClone(question);
  }

  function currentAssessment(question) {
    try {
      return assessItemImpl(question, {
        manifestPages: list(state.server?.manifestPages),
        activeItems: list(state.server?.qbank),
      });
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
      setSelected(state.selectedId);
      return;
    }
    const first = filteredQuestions(state.server, state.filters)[0]
      || list(state.server?.qbank)[0];
    setSelected(first?.id || null);
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
        void load();
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

  async function load({ silent = false, focusId = null } = {}) {
    state.pending = true;
    if (!silent) renderLoading();
    try {
      const response = await fetchImpl(API, { headers: apiHeaders() });
      const payload = await responseJson(response);
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        renderLogin('Key not accepted. Check the shared faculty key and try again.');
        return;
      }
      if (!response.ok || !Array.isArray(payload.qbank) || !Array.isArray(payload.items)) {
        throw new Error(responseMessage(payload, 'The server returned an incomplete state.'));
      }
      state.server = payload;
      state.pending = false;
      pruneSessionReview();
      chooseSelection();
      renderShell(focusId);
    } catch (error) {
      state.pending = false;
      renderLoadError(error instanceof Error ? error.message : 'Network request failed.');
    }
  }

  function activateTab(name, focusTab = false) {
    state.tab = name;
    renderShell(focusTab ? `tab-${name}` : null);
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

  function renderShell(focusId = null) {
    if (!state.server) return;
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

    replaceApp(
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
            class: 'quiet',
            type: 'button',
            onClick: () => {
              clearKey();
              state.server = null;
              renderLogin();
            },
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
    );

    if (focusId) {
      const target = document.getElementById(focusId);
      target?.focus();
      if (target?.type === 'search') {
        const end = target.value.length;
        target.setSelectionRange?.(end, end);
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
          'question-category',
          'Category',
          [['all', 'All categories'], ...categories.map(value => [value, value])],
          state.filters.category,
          event => updateFilter('category', event.target.value, 'question-category'),
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
          'question-difficulty',
          'Difficulty',
          [['all', 'All levels'], ...difficulties.map(value => [value, `Level ${value}`])],
          state.filters.difficulty,
          event => updateFilter('difficulty', event.target.value, 'question-difficulty'),
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
          setSelected(question.id);
          renderShell(queueId);
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

  function renderBatchSummary() {
    const selected = [...state.batch]
      .map(findQuestion)
      .filter(Boolean)
      .map(assessedQuestion);
    const assessment = assessBatch(selected);
    const message = selected.length
      ? `${selected.length} reviewed green draft${selected.length === 1 ? '' : 's'} selected.`
      : 'No questions selected. Review each green draft before using its batch checkbox.';
    return el('div', { class: 'batch-summary' }, [
      el('p', {}, [message]),
      !assessment.ok
        ? el('p', { class: 'batch-warning' }, [assessment.issues[0].message])
        : null,
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

  function renderAssessment(assessment) {
    const gate = Object.hasOwn(GATE_LABELS, assessment.gate) ? assessment.gate : 'blocked';
    const issues = gate === 'blocked' ? list(assessment.blockers) : list(assessment.warnings);
    if (!issues.length) {
      return el('section', { class: 'safety-note', 'aria-labelledby': 'checks-title' }, [
        el('h3', { id: 'checks-title' }, ['Automated checks passed']),
        el('p', {}, [
          'Green means the saved structure passed. It does not verify clinical accuracy or source support.',
        ]),
      ]);
    }
    return el('section', {
      class: `safety-note ${gate}`,
      'aria-labelledby': 'checks-title',
    }, [
      el('h3', { id: 'checks-title' }, [
        gate === 'blocked' ? 'Structural blockers' : 'Faculty review warnings',
      ]),
      el('ul', { class: 'issue-list' }, issues.map(issue => (
        el('li', {}, [`${text(issue.field) || 'Question'}: ${text(issue.message) || text(issue.code)}`])
      ))),
    ]);
  }

  function renderQuestionOverview() {
    const question = findQuestion(state.selectedId);
    const panel = el('article', { class: 'review-panel', 'aria-labelledby': 'review-title' });
    if (!question) {
      panel.appendChild(el('div', { class: 'review-sheet' }, [
        el('h2', { id: 'review-title' }, ['Select a question']),
        el('p', { class: 'muted' }, ['Choose a queue row to open its review overview.']),
      ]));
      return panel;
    }

    const assessment = currentAssessment(question);
    const gate = assessment.gate;
    const assessed = { ...question, assessment };
    const learnerUrl = safeStudentUrl('?tool=question-bank-practice.html');
    const reviewed = gate === 'ready'
      && state.reviewedInSession.has(question.id)
      && state.reviewedRevisions.get(question.id) === question.revision;
    const eligible = question.status === 'draft'
      && gate === 'ready'
      && !hasUnsavedChanges();
    const pages = list(question.pages).filter(page => typeof page === 'string');
    const sessionCopy = reviewed
      ? 'Reviewed in this session. Use the separate queue checkbox if this item belongs in a green batch.'
      : batchReason(assessed, hasUnsavedChanges());

    panel.appendChild(el('div', { class: 'review-sheet' }, [
      el('header', { class: 'review-heading' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow' }, ['Selected question']),
          el('h2', { id: 'review-title', class: 'question-id' }, [question.id]),
          el('p', { class: 'muted' }, [`${question.status === 'attested' ? 'Attested' : 'Draft'} repository version`]),
        ]),
        el('span', { class: `status-chip ${gate}` }, [
          el('span', { 'aria-hidden': 'true' }, [GATE_LABELS[gate]?.symbol || '×']),
          GATE_LABELS[gate]?.label || 'Blocked',
        ]),
      ]),
      el('div', { class: 'overview-grid' }, [
        el('p', { class: 'stem-copy' }, [text(question.stem) || 'Stem unavailable']),
        el('dl', { class: 'question-facts' }, [
          el('div', {}, [el('dt', {}, ['Category']), el('dd', {}, [text(question.category) || '—'])]),
          el('div', {}, [el('dt', {}, ['Difficulty']), el('dd', {}, [`Level ${question.difficulty ?? '—'}`])]),
          el('div', {}, [
            el('dt', {}, ['Source pages']),
            el('dd', { class: 'data-text' }, [pages.length ? pages.join(', ') : 'None listed']),
          ]),
        ]),
      ]),
      el('section', { class: 'source-note', 'aria-labelledby': 'evidence-title' }, [
        el('h3', { id: 'evidence-title' }, ['Evidence anchor']),
        el('p', {}, [text(question.evidence) || 'No evidence anchor supplied.']),
      ]),
      renderAssessment(assessment),
      el('fieldset', { class: 'session-review' }, [
        el('legend', {}, ['Session review']),
        el('p', {}, [sessionCopy]),
        el('div', { class: 'session-actions' }, [
          el('button', {
            class: 'primary',
            type: 'button',
            disabled: !eligible || reviewed || state.pending,
            onClick: () => markReviewedAndNext(question),
          }, [reviewed ? 'Reviewed this session' : 'Mark reviewed & next']),
          learnerUrl
            ? el('a', { href: learnerUrl, target: '_blank', rel: 'noopener noreferrer' }, [
              'Open learner practice ↗',
            ])
            : null,
        ]),
      ]),
      el('p', { class: 'review-placeholder' }, [
        'This queue step supports safe triage and session review. Full field editing, draft saving, and attestation controls follow in the guarded editor step.',
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
        ? el('ol', { class: 'queue-list' }, shown.map(renderQueueRow))
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
      state.pending = false;
      announce(state.contentMessage);
      await load({ silent: true, focusId: 'content-save-result' });
    } catch (error) {
      state.pending = false;
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

  function saveCurrentDraft() {
    if (!hasUnsavedChanges()) {
      announce('No unsaved question changes to save.');
      return;
    }
    announce('Draft saving will be available in the guarded question editor.');
  }

  window.addEventListener('beforeunload', event => {
    if (!hasAnyUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
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
