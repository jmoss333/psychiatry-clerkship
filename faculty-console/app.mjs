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
  buildBookmarklet,
  buildDeepLink,
  buildExternalReviewUrl,
  buildPreviewRequest,
  createReviewToken,
  deriveAttestationEligibility,
  deriveBatchEligibility,
  deriveReviewCounts,
  filterReviewItems,
  isValidReopenReason,
  matchesPreviewStatus,
  normalizeReviewItems,
  audienceLabel,
  audienceShortLabel,
  normalizeStudentBase,
  parseDeepLink,
  reviewedRevisionMatches,
  twinOf,
} from './review-model.mjs';
import { isDriftReason } from './change-history.mjs';

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

// The compact form of CONFIRMATION_COPY, carried by any control that records all three
// in one press (2026-08-13). Kept beside the full copy deliberately: the integrity rule
// for a one-press control is that its label STATES what the press records, so these two
// must never drift apart.
const CONFIRMATION_SUMMARY = 'answer & rationale verified · evidence anchored · original, no PHI';

const OPTION_TEXT_LABELS = {
  A: 'Option A text',
  B: 'Option B text',
  C: 'Option C text',
  D: 'Option D text',
};

const PREVIEW_FAILURES = new Set([
  'not_found', 'error', 'protocol_unavailable', 'frame_failure',
]);
const RETRY_REQUIRED_QUESTION_FAILURES = new Set([
  'error', 'protocol_unavailable', 'frame_failure',
]);
const PREVIEW_SANDBOX = 'allow-scripts allow-same-origin allow-forms';
const ROLLING_PR_WARNING = 'Commit confirmed; rolling review request needs attention.';

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

export function appendSessionAction(actions, action) {
  return [action, ...(Array.isArray(actions) ? actions : [])];
}

// Load-time base-lag alarm (#415 aftermath): the pure model behind the shell's
// branch-sync banner. The server probe (describeBranchSync in attest.mjs) reports
// how the attestation branch compares to the base; this decides what, if anything,
// faculty must be told before they attest into a stale queue. The August 2026
// freeze — three attestations stranded, base nine commits behind, four days
// silent — is the state this exists to make impossible to miss. Kept pure and
// exported so the wire format and its presentation are pinned together in tests.
export function branchSyncNotice(branchSync) {
  if (!branchSync || typeof branchSync !== 'object') return null;
  if (branchSync.error) {
    return {
      tone: 'muted',
      href: null,
      message: 'Branch-sync status is unavailable for this load — staleness of the '
        + 'queue below cannot be ruled out.',
    };
  }
  if (!branchSync.alarmed || !Array.isArray(branchSync.reasons) || !branchSync.reasons.length) {
    return null;
  }
  const ahead = Number(branchSync.aheadBy) || 0;
  const behind = Number(branchSync.behindBy) || 0;
  const branch = text(branchSync.branch) || 'the attestation branch';
  const baseBranch = text(branchSync.baseBranch) || 'main';
  // A stranded branch has no pull request to link or to merge, so it gets its own
  // sentence and its own repair: the Reopen button beside this notice, which asks the
  // server to open the rolling request. Saying "merge the rolling pull request" to
  // someone who has none is what made the 2026-09 stranding survive being noticed.
  const stranded = branchSync.reasons.includes('stranded-no-pr');
  const parts = [stranded
    ? `${ahead} attestation${ahead === 1 ? '' : 's'} ${ahead === 1 ? 'is' : 'are'} on `
      + `\`${branch}\` with no open review request — press Reopen review request.`
    : `${ahead} unmerged attestation${ahead === 1 ? '' : 's'} `
      + `${ahead === 1 ? 'is' : 'are'} waiting on \`${branch}\`.`];
  if (branchSync.reasons.includes('base-lag')) {
    parts.push(`Its base is ${behind} commit${behind === 1 ? '' : 's'} behind ${baseBranch}, `
      + 'so the queue below may be stale.');
  }
  parts.push(stranded
    ? 'Reopen it, then merge it (merge commit, not squash) before attesting further.'
    : 'Merge the rolling pull request (merge commit, not squash) before attesting further.');
  let href = null;
  try {
    const url = new URL(String(branchSync.rollingPr));
    if (url.protocol === 'https:') href = url.href;
  } catch { /* no link */ }
  return { tone: 'alert', href, action: stranded ? 'ensure-pr' : null, message: parts.join(' ') };
}

// The derived review queue (shipped_pages.json) is read from the base branch whenever
// the attestation branch does not carry it — a lagging branch costs this one line
// instead of the whole console (2026-09-04). Pure and exported for the same reason as
// branchSyncNotice: the wire field and the sentence faculty read stay pinned together.
export function shippedPagesNotice(server) {
  if (!server || typeof server !== 'object' || server.shippedPagesSource !== 'base') return null;
  const baseBranch = text(server.shippedPagesBranch) || 'main';
  return {
    tone: 'muted',
    message: `Review queue derived from \`${baseBranch}\`; the attestation branch is missing `
      + 'shipped_pages.json — merge the rolling review request.',
  };
}

// How far the attestation branch trails the base (2026-09-18). A content hash compares a
// page to the ledger row that attests it — both read from the SAME branch — so a lagging
// branch can be perfectly self-consistent while every page it shows is behind what the
// learner sites serve. That is the one staleness the per-item check cannot see, which is
// why it gets its own sentence rather than being folded into the item rail. Pure and
// exported for the same reason as the notices above.
export function branchLagNotice(server) {
  if (!server || typeof server !== 'object') return null;
  const behind = Number(server.branchLag) || 0;
  if (behind <= 0) return null;
  const branch = text(server.branchSync?.branch) || 'attest/pending';
  const baseBranch = text(server.branchSync?.baseBranch) || 'main';
  return {
    tone: 'alert',
    message: `${branch} is ${behind} commit${behind === 1 ? '' : 's'} behind ${baseBranch} `
      + '— sync before re-attesting',
  };
}

// The load could not check any page against its stored hash — the tree read failed, or the
// queue came from the base branch while the text would have come from another ref. Every
// reviewed item is then marked unverified rather than clean, and this says why once.
export function freshnessNotice(server) {
  if (!server || typeof server !== 'object' || server.freshness !== 'unknown') return null;
  return { tone: 'muted', message: 'Freshness unknown — reload' };
}

function parseDelimited(value) {
  return [...new Set(text(value)
    .split(/[\n,]/)
    .map(entry => entry.trim())
    .filter(Boolean))];
}

export function startFacultyConsole({
  document,
  window,
  fetchImpl = fetch,
  assessItemImpl = assessItem,
  tokenFactory = () => createReviewToken(window.crypto),
  scheduleTimeout = (callback, delay) => window.setTimeout(callback, delay),
  cancelTimeout = id => window.clearTimeout(id),
  openExternal = (url, target = '_blank', features = 'noopener,noreferrer') => (
    window.open(url, target, features)
  ),
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
    batchSelection: new Set(),
    batchExclusions: new Set(),
    batchEnrollmentFeedback: null,
    reviewResetNotice: '',
    reviewResetAnnouncement: '',
    deepLinkNotice: '',
    sessionActions: [],
    externalReviewOpenedKey: null,
    contentMessage: '',
    contentCommitUrl: null,
    contentFeedbackKey: null,
    reopenConfirmation: null,
    reopenReason: '',
    reopenReasonKey: null,
    dirtyFields: [],
    localAssessment: null,
    confirmations: emptyConfirmations(),
    warningAcks: new Set(),
    qbankMessage: '',
    qbankCommitUrl: null,
    qbankError: '',
    qbankFeedbackIds: new Set(),
    conflict: null,
    navigationGuard: null,
    navigationAfterSave: null,
    reauthAction: null,
    loadGeneration: 0,
    // Re-sign by change (read-only views; see renderResignByChange). Nothing here is
    // review progress: it is what the server said changed, and which disclosures are open.
    changeView: null,
    changeViewOpen: false,
    openChangeGroups: new Set(),
    diffViews: new Map(),
    openDiffs: new Set(),
    resignGroupId: null,
    viewGeneration: 0,
    // One press, many pages (2026-09-26; see renderBaseline). The server's preview of a
    // baseline press, what this sitting chose to leave out of it, which corrections this
    // sitting has signed, and the receipt of the last many-page press.
    baseline: null,
    baselineOpen: false,
    baselineLeftOut: new Set(),
    correctionsSigned: new Set(),
    manyPageReceipt: null,
  };
  let renderedIssueRecords = [];
  // Where each diff is on screen (key → element ids), so a diff that arrives later is drawn
  // into every place that asked for it without re-rendering the page around the reader.
  const renderedDiffBodies = new Map();

  /* ?item=<key> deep links (2026-09). The requested key is read ONCE, at startup, and
     held in this closure — never in sessionStorage, never re-read from the address bar
     after load. That is what lets a link survive the key prompt: the console can be
     locked when the link arrives, and the request is still waiting when the queue
     finally loads. It is consumed on first use, so a later reload never re-hijacks the
     reviewer's selection. The value itself is only ever compared against loaded item
     keys (parseDeepLink) — it is never written into the DOM. */
  let pendingDeepLinkSearch = typeof window.location?.search === 'string'
    ? window.location.search : '';

  function requestedDeepLinkKey(search) {
    try {
      return new URLSearchParams(typeof search === 'string' ? search : '').get('item') || '';
    } catch {
      return '';
    }
  }

  /* Keeps the address bar a shareable link to whatever is selected. buildDeepLink
     rebuilds the query from nothing but the item key, so the faculty key, the review
     token and the reviewer label are structurally incapable of reaching the URL. */
  function syncDeepLink() {
    try {
      const href = buildDeepLink(window.location.href, currentReviewItem());
      if (href !== window.location.href) window.history?.replaceState?.(null, '', href);
    } catch {
      // No History API, or an exotic document URL: the console works, links do not.
    }
  }

  function el(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value === null || value === undefined || value === false) continue;
      if (name === 'class') {
        node.className = value;
      } else if (name.startsWith('on') && typeof value === 'function') {
        node.addEventListener(name.slice(2).toLowerCase(), value);
      } else if (['checked', 'disabled', 'open', 'selected', 'value', 'readOnly'].includes(name)) {
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
        || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(text(payload.qbankRevision))
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

  // The learner deployment that serves the selected item. Case-of-the-Week ships an
  // MS3 page and a resident twin from one registry week, and each half exists only on
  // its own site. Falls back to the MS3 base when the server sends no resident base.
  function residentBase() {
    return text(state.server?.resident) || state.server?.student;
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
    return hasUnsavedChanges();
  }

  function shortcutCanSaveQuestion() {
    return currentReviewItem()?.type === 'question'
      && state.viewMode === 'edit'
      && hasUnsavedChanges();
  }

  function resetApprovalInputs() {
    state.confirmations = emptyConfirmations();
    state.warningAcks = new Set();
  }

  function invalidateSessionReview(id) {
    if (!id) return;
    state.reviewedRevisions.delete(id);
    state.batchSelection.delete(id);
    state.batchExclusions.delete(id);
    if (state.batchEnrollmentFeedback?.id === id) state.batchEnrollmentFeedback = null;
  }

  function clearQuestionProgress() {
    state.reviewedRevisions.clear();
    state.batchSelection.clear();
    state.batchExclusions.clear();
    state.batchEnrollmentFeedback = null;
  }

  function repositoryDelivery(payload) {
    const rawPullRequestUrl = text(payload?.pullRequest);
    const pullRequestUrl = safeExternalUrl(rawPullRequestUrl);
    return {
      pullRequestUrl,
      pullRequestError: payload?.pullRequestError === true
        || Boolean(rawPullRequestUrl && !pullRequestUrl),
    };
  }

  function recordSessionAction({
    key,
    message,
    commitUrl = null,
    pullRequestUrl = null,
    pullRequestError = false,
  }) {
    const actionKey = text(key);
    const actionMessage = text(message);
    if (!actionKey || !actionMessage) return;
    state.sessionActions = appendSessionAction(state.sessionActions, {
      key: actionKey,
      message: actionMessage,
      commitUrl: safeExternalUrl(commitUrl),
      pullRequestUrl: safeExternalUrl(pullRequestUrl),
      pullRequestError: pullRequestError === true,
    });
  }

  function clearSessionSitting() {
    clearQuestionProgress();
    state.reviewResetNotice = '';
    state.reviewResetAnnouncement = '';
    state.sessionActions = [];
    state.contentMessage = '';
    state.contentCommitUrl = null;
    state.contentFeedbackKey = null;
    state.reopenReason = '';
    state.reopenReasonKey = null;
    state.qbankMessage = '';
    state.qbankCommitUrl = null;
    state.qbankError = '';
    state.qbankFeedbackIds = new Set();
    state.conflict = null;
  }

  function cancelPreviewTimer(preview = state.preview) {
    if (!preview || preview.timerId === null || preview.timerId === undefined) return;
    cancelTimeout(preview.timerId);
    preview.timerId = null;
  }

  function clearReviewAcknowledgements({
    clearApprovals = false,
    clearAllQuestions = false,
    preserveQuestionReceipts = false,
  } = {}) {
    state.reviewChecks = emptyReviewChecks();
    state.externalReviewOpenedKey = null;
    /* preserveQuestionReceipts: navigating BETWEEN items must not destroy saved-revision
       review receipts — they are the per-item control the batch tray accumulates, each
       one self-invalidating the moment its question's revision moves (2026-08-04 batch
       design, section A). Reload and manifest-change paths keep their conservative wipes. */
    if (preserveQuestionReceipts) {
      if (clearApprovals) resetApprovalInputs();
      return;
    }
    if (clearAllQuestions) {
      clearQuestionProgress();
    } else {
      invalidateSessionReview(state.selectedId);
    }
    if (clearApprovals) resetApprovalInputs();
  }

  function invalidatePreview({
    resetAttempt = false,
    clearApprovals = false,
    clearAllQuestions = false,
    preserveQuestionReceipts = false,
  } = {}) {
    cancelPreviewTimer();
    state.preview = null;
    if (resetAttempt) state.previewAttempt = 0;
    clearReviewAcknowledgements({
      clearApprovals,
      clearAllQuestions,
      preserveQuestionReceipts,
    });
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

  function beginPreviewLoad(item) {
    cancelPreviewTimer();
    const request = buildPreviewRequest({
      studentBase: state.server.student,
      residentBase: residentBase(),
      item,
      reviewToken: tokenFactory(),
    });
    state.previewAttempt += 1;
    const preview = {
      request,
      status: 'loading',
      frameLoaded: false,
      frameWindow: null,
      timerId: null,
      loadCount: 0,
      attempt: state.previewAttempt,
    };
    preview.timerId = scheduleTimeout(() => {
      if (state.preview !== preview || preview.status !== 'loading') return;
      preview.status = preview.frameLoaded ? 'protocol_unavailable' : 'frame_failure';
      /* Batch-design step D (carried from #310): a background preview failure must never
         discard the reviewer's in-flight work. While the editor is dirty or the Edit view
         is active, record and announce the failure but leave the view, the editor text,
         and every recorded acknowledgement exactly where they are — eligibility already
         blocks attestation behind retry/ack for a failed preview, so nothing is weakened. */
      const midWork = state.dirtyFields.length > 0 || state.viewMode === 'edit';
      if (!midWork) {
        clearReviewAcknowledgements();
        applyQuestionView('live');
      }
      announce(preview.frameLoaded
        ? 'Preview protocol unavailable. Use Retry or the documented fallback.'
        : 'Network or embedded-preview failure. Use Retry or the documented fallback.');
      refreshPreviewChromeAndRail('preview-status');
    }, 10_000);
    state.preview = preview;
    return preview;
  }

  function clearReviewSelection() {
    cancelPreviewTimer();
    clearReviewAcknowledgements({
      clearApprovals: true,
      preserveQuestionReceipts: true,
    });
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
    state.reopenConfirmation = null;
    syncDeepLink();
  }

  function setSelectedReviewKey(key, {
    force = false,
    preserveCompletedHold = false,
    carryDraftView = false,
  } = {}) {
    const item = findReviewItem(key);
    if (!item) return false;
    if (!preserveCompletedHold) state.completedHoldKey = null;
    if (!force && state.selectedKey === key) {
      syncDeepLink();
      return true;
    }
    cancelPreviewTimer();
    clearReviewAcknowledgements({
      clearApprovals: true,
      preserveQuestionReceipts: true,
    });
    state.selectedKey = key;
    // `carryDraftView` is the receipt-driven advance's option ONLY (2026-08-12
    // efficiency pass, follow-up). Landing every advanced-to draft on Live deploy made
    // compoundReviewEligible false on arrival, so the one-action-per-draft sitting the
    // design promised actually cost two: a "Draft preview" click before the compound
    // receipt would even render. Carrying the view forward discards nothing the
    // reviewer must see and asserts nothing on their behalf — the receipt still demands
    // Draft view, clean fields, a matching revision, and a Ready preview at tick time.
    // Manual navigation (the item selector, the arrow keys) keeps the Live landing.
    // Only questions have a Draft pane, so every other item type still lands on Live.
    state.viewMode = carryDraftView && item.type === 'question' ? 'draft' : 'live';
    state.preview = null;
    state.previewAttempt = 0;
    if (item.type === 'question') setSelected(item.identity, { force: true });
    else {
      state.selectedId = null;
      state.original = null;
      state.editor = null;
      state.dirtyFields = [];
      state.localAssessment = null;
    }
    beginPreviewLoad(item);
    syncDeepLink();
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

  function pruneReviewedRevisions() {
    const removed = [];
    for (const [id, revision] of [...state.reviewedRevisions]) {
      const question = findQuestion(id);
      if (!question || question.revision !== revision
          || question.status !== 'draft') {
        removed.push(id);
        invalidateSessionReview(id);
      }
    }
    return removed;
  }

  /* Applies a pending ?item= request exactly once, against the queue as loaded. An
     unknown key is not an error the reviewer can act on and must not be echoed back to
     the page, so it produces one neutral notice and the ordinary default selection. */
  function applyPendingDeepLink() {
    if (!pendingDeepLinkSearch) return false;
    const search = pendingDeepLinkSearch;
    pendingDeepLinkSearch = '';
    if (!requestedDeepLinkKey(search)) return false;
    const requested = parseDeepLink(search, state.reviewItems);
    if (requested && setSelectedReviewKey(requested.key, { force: true })) {
      state.deepLinkNotice = '';
      announce(`Opened ${requested.title} from a shared link.`);
      return true;
    }
    state.deepLinkNotice = 'That item is not in the current queue.';
    announce(state.deepLinkNotice);
    return false;
  }

  function chooseSelection() {
    if (applyPendingDeepLink()) return;
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

  // Auto-advance (2026-08-12 efficiency pass, content half): a lookup only, not a
  // selector — load() is mid-reload when it calls this and already owns the
  // hold-vs-select decision at the end of a successful content attest, so this just
  // reports where "next" is and lets that caller apply it. savedStatus 'unreviewed' is
  // the actual not-yet-reviewed value a page or tool carries (normalizeReviewItems in
  // review-model.mjs mirrors record.status verbatim; completion() there treats anything
  // other than 'reviewed' as needing review, but the literal value itself is
  // 'unreviewed', never 'pending').
  /* Twin-first advance (2026-09). A Case-of-the-Week week produces an MS3 page and a
     resident page from one source pair, and a reviewer reads the same case twice. After
     attesting one half, the other half is the next thing they want — not the next
     alphabetical page. This ONLY moves the selection; the attestation itself still
     writes exactly the one slug that was pressed. Restricted to the visible queue so
     the advance can never jump outside the filters the reviewer set. */
  function advanceToTwin(fromKey) {
    const twin = twinOf(findReviewItem(fromKey), state.reviewItems);
    if (!twin || twin.completion === 'complete') return null;
    return visibleReviewItems().some(item => item.key === twin.key) ? twin.key : null;
  }

  /* The next page, in the correction the reviewer opened it from, that still needs its
     own signature. Selection only — like advanceToTwin, it never signs and never leaves
     the queue filters the reviewer set. */
  function advanceWithinChangeGroup(fromKey) {
    const group = activeChangeGroup();
    const from = findReviewItem(fromKey);
    if (!group || !from || !group.slugs.includes(from.identity)) return null;
    const visible = new Set(visibleReviewItems().map(item => item.key));
    const start = group.slugs.indexOf(from.identity);
    const order = [...group.slugs.slice(start + 1), ...group.slugs.slice(0, start)];
    for (const slug of order) {
      const item = contentItemBySlug(slug, text(record(state.changeView?.data?.pages?.[slug]).kind));
      if (item && isDriftedItem(item) && visible.has(item.key)) return item.key;
    }
    return null;
  }

  function advanceToNextPendingContent(fromKey) {
    const visible = visibleReviewItems();
    const start = visible.findIndex(item => item.key === fromKey);
    for (let i = start + 1; i < visible.length; i += 1) {
      const item = visible[i];
      if (item.type === 'question') continue;
      if (item.savedStatus !== 'unreviewed') continue;
      return item.key;
    }
    return null;
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
    expectedStatuses = null,
    expectedContentStatus = null,
    preserveOnError = false,
    completedHoldKey = null,
    errorScope = 'qbank',
  } = {}) {
    const generation = ++state.loadGeneration;
    const confirmingContent = expectedContentStatus !== null;
    if (!confirmingContent) {
      invalidatePreview({
        resetAttempt: true,
        clearApprovals: true,
        clearAllQuestions: true,
      });
    }
    state.pending = true;
    if (!silent) renderLoading();
    else if (state.server && !confirmingContent) renderShell();
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
      let residentSite;
      let reviewItems;
      try {
        studentBase = normalizeStudentBase(payload.student);
        // Optional: a payload from an older function deployment carries no resident
        // base, and every item in it is an MS3 item, so falling back is exact.
        residentSite = text(payload.resident)
          ? normalizeStudentBase(payload.resident) : studentBase;
        reviewItems = normalizeReviewItems(payload);
      } catch {
        throw new Error('The server returned an incomplete state.');
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
      if (expectedStatuses && typeof expectedStatuses === 'object') {
        for (const [id, status] of Object.entries(expectedStatuses)) {
          const refreshed = payload.qbank.find(question => question.id === id);
          if (!refreshed || refreshed.status !== status) {
            throw new Error(`The refreshed state did not confirm ${id} as ${status}. Local work was retained.`);
          }
        }
      }
      let confirmedContentItem = null;
      if (expectedContentStatus !== null) {
        const slug = text(expectedContentStatus?.slug);
        const status = text(expectedContentStatus?.status);
        confirmedContentItem = reviewItems.find(item => (
          ['page', 'tool'].includes(item.type) && item.identity === slug
        )) || null;
        if (!slug || !['reviewed', 'unreviewed'].includes(status)
            || !confirmedContentItem || confirmedContentItem.savedStatus !== status) {
          throw new Error(`The refreshed state did not confirm ${slug || 'this content item'} as ${status || 'requested'}. Local work was retained.`);
        }
      }
      const hadServerState = state.server !== null;
      const manifestChanged = hadServerState
        && state.server.manifestRevision !== payload.manifestRevision;
      const qbankChanged = hadServerState
        && state.server.qbankRevision !== payload.qbankRevision;
      if (confirmingContent) {
        const preserveQuestionProgress = hadServerState && !manifestChanged && !qbankChanged;
        invalidatePreview({
          resetAttempt: true,
          clearApprovals: true,
          clearAllQuestions: !preserveQuestionProgress,
          preserveQuestionReceipts: preserveQuestionProgress,
        });
        if (!preserveQuestionProgress && hadServerState) {
          const changedLabel = manifestChanged && qbankChanged
            ? 'content manifest and question-bank revisions'
            : qbankChanged ? 'question-bank revision' : 'content manifest revision';
          state.reviewResetNotice = `The ${changedLabel} changed. Question review receipts and batch selection were reset.`;
          state.reviewResetAnnouncement = state.reviewResetNotice;
        }
      }
      state.server = { ...payload, student: studentBase.href, resident: residentSite.href };
      state.reviewItems = reviewItems;
      // Attribution is server-derived (ATTESTER_NAME); the console only displays it.
      state.reviewerLabel = text(payload.attester) || DEFAULT_REVIEWER;
      const contentHoldKey = expectedContentStatus?.status === 'reviewed'
        ? confirmedContentItem?.key || null
        : null;
      // Auto-advance (2026-08-12 efficiency pass, content half): a successful content
      // attest prefers the next pending page or tool over holding on the one just
      // attested. Scoped to contentHoldKey specifically — a question attestation's own
      // completedHoldKey param (attestEntries) never produces a contentHoldKey, so that
      // hold path is untouched. When nothing else is pending, advanceKey is null and
      // today's hold falls through unchanged. A live navigationGuard also suppresses
      // the advance (mirrors advanceToNextUnreceipted's own check) — unreachable today,
      // since a content attest never leaves unsaved question-editor state behind for a
      // guard to hold open, but kept symmetric so the invariant still holds if that
      // ever changes.
      // Re-sign by change: when the reviewer is working through one correction's pages,
      // the next page THAT correction changed comes before the next page alphabetically.
      // Twin first still — a Case-of-the-Week pair is read as one case.
      const advanceKey = contentHoldKey && !state.navigationGuard
        ? (advanceToTwin(contentHoldKey)
          || advanceWithinChangeGroup(contentHoldKey)
          || advanceToNextPendingContent(contentHoldKey))
        : null;
      if (advanceKey) openChangesSinceSigned(findReviewItem(advanceKey), { onlyInGroup: true });
      const holdKey = advanceKey ? null : (completedHoldKey || contentHoldKey || state.completedHoldKey);
      const heldItem = holdKey ? findReviewItem(holdKey) : null;
      state.completedHoldKey = heldItem?.completion === 'complete' ? heldItem.key : null;
      state.pending = false;
      const prunedReceiptIds = pruneReviewedRevisions();
      if (confirmingContent && !manifestChanged && !qbankChanged && prunedReceiptIds.length) {
        state.reviewResetNotice = `${prunedReceiptIds.length} question review receipt${
          prunedReceiptIds.length === 1 ? '' : 's'
        } no longer matched the exact saved revision and ${
          prunedReceiptIds.length === 1 ? 'was' : 'were'
        } removed from this review sitting.`;
        state.reviewResetAnnouncement = state.reviewResetNotice;
      }
      // Respect setSelectedReviewKey's own return: on the (unreachable in practice,
      // since advanceKey always names a key already present in state.reviewItems)
      // false case, fall back to the pre-existing chooseSelection() rather than
      // leaving the selection wherever it happened to be.
      if (!advanceKey || !setSelectedReviewKey(advanceKey, { force: true })) chooseSelection();
      renderShell(focusId);
      return true;
    } catch (error) {
      if (generation !== state.loadGeneration) return false;
      state.pending = false;
      const message = error instanceof Error ? error.message : 'Network request failed.';
      if (preserveOnError && state.server) {
        const scopedMessage = `refresh_failed: ${message}`;
        if (errorScope === 'content') {
          state.contentMessage = scopedMessage;
          state.contentCommitUrl = null;
          announce(state.contentMessage);
          refreshPreviewChromeAndRail('content-action-result');
        } else {
          state.qbankError = scopedMessage;
          announce(state.qbankError);
          renderShell('qbank-action-error');
        }
      } else {
        renderLoadError(message);
      }
      return false;
    }
  }

  // The repair the stranded-branch alarm names. One POST asks the server to open (or
  // to find) the rolling review request; the silent reload that follows clears the
  // alarm from the refreshed probe rather than from local optimism. No file is written
  // here, so there is no draft to protect and no conflict to resolve — a failure is
  // announced and the notice stays exactly as it was.
  async function reopenReviewRequest() {
    if (state.pending) return false;
    state.pending = true;
    renderShell();
    try {
      const response = await fetchImpl(API, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ action: 'branch.ensure-pr' }),
      });
      const payload = await responseJson(response);
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        renderLogin('Key not accepted. Enter the faculty key and try again.');
        return false;
      }
      if (!response.ok) {
        state.pending = false;
        announce(stableResponseMessage(payload, 'The review request was not reopened.'));
        renderShell();
        return false;
      }
      const reloaded = await load({ silent: true });
      if (reloaded) {
        announce(text(payload.pullRequest)
          ? 'Review request reopened. The attestations on the attestation branch now have a route to the base branch.'
          : 'Review request confirmed open.');
      }
      return reloaded;
    } catch (error) {
      state.pending = false;
      announce(error instanceof Error
        ? `network_error: ${error.message}`
        : 'network_error: The review request was not reopened.');
      renderShell();
      return false;
    }
  }

  function performNavigation(target) {
    if (!target || typeof target !== 'object') return;
    // The deep-link notice is a landing message about the link the reviewer arrived on.
    // Once they navigate deliberately it has said what it had to say.
    state.deepLinkNotice = '';
    if (target.kind === 'lock') {
      clearKey();
      clearSessionSitting();
      state.server = null;
      state.reviewItems = [];
      clearReviewSelection();
      state.navigationGuard = null;
      state.navigationAfterSave = null;
      state.reauthAction = null;
      state.reopenConfirmation = null;
      resetChangeViews();
      renderLogin();
      return;
    }
    /* Selecting the item that is ALREADY selected changes nothing, and must not be
       treated as a re-render: renderShell() rebuilds the workspace including the preview
       iframe, and a preview frame that loads a second time is — correctly —
       reported as "the embedded preview changed or reloaded", a frame failure. Before
       ?item= deep links this path was effectively unreachable, because a reload always
       landed on the default selection. It is reachable now, so it is a no-op: release
       the completed-item hold exactly as setSelectedReviewKey did before returning
       early, refresh the queue strip (which owns no iframe), and return focus. */
    if (target.kind === 'review' && target.key === state.selectedKey
        && findReviewItem(target.key)) {
      state.completedHoldKey = null;
      refreshQueueStrip(target.focusId || 'review-item-selector');
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

  // "Clinical · High risk" — same title-casing convention as riskLabel() in the
  // shared shell (13_Faculty_Resources/_automation/site_build/spa_index.html), so a
  // reviewer sees identical wording here and on the learner-facing warning.
  function riskLabel(risk) {
    const titleCase = value => text(value)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
    return `${titleCase(risk?.kind)} · ${titleCase(risk?.level)} risk`;
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

  function applyQuestionView(mode) {
    if (!['live', 'draft', 'edit'].includes(mode) || currentReviewItem()?.type !== 'question') return false;
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
    return true;
  }

  function switchQuestionView(mode, focusId) {
    if (!applyQuestionView(mode)) return;
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

  function recordPreviewFrameFailure(preview, message) {
    cancelPreviewTimer(preview);
    preview.status = 'frame_failure';
    clearReviewAcknowledgements();
    applyQuestionView('live');
    announce(message);
    refreshPreviewChromeAndRail('preview-status');
  }

  function handlePreviewFrameLoad(preview) {
    if (state.preview !== preview) return;
    const active = ['loading', 'ready'].includes(preview.status);
    if (!active && !PREVIEW_FAILURES.has(preview.status)) return;
    preview.loadCount += 1;
    if (active && preview.loadCount === 1) {
      preview.frameLoaded = true;
      return;
    }
    recordPreviewFrameFailure(
      preview,
      'The embedded preview changed or reloaded. Use Retry or the documented fallback.',
    );
  }

  function handlePreviewFrameError(preview) {
    if (state.preview !== preview) return;
    if (!['loading', 'ready'].includes(preview.status)
        && !PREVIEW_FAILURES.has(preview.status)) return;
    recordPreviewFrameFailure(
      preview,
      'Network or embedded-preview failure. Use Retry or the documented fallback.',
    );
  }

  function retryPreview() {
    const item = currentReviewItem();
    if (!item || state.pending) return;
    cancelPreviewTimer();
    state.preview = null;
    clearReviewAcknowledgements({ clearApprovals: true });
    beginPreviewLoad(item);
    renderShell('preview-status');
    announce(`Retrying the ${itemTypeLabel(item.type).toLowerCase()} preview.`);
  }

  function openFullPage(item) {
    if (!item || !['page', 'tool'].includes(item.type)) return;
    const url = buildExternalReviewUrl({
      studentBase: state.server.student,
      residentBase: residentBase(),
      item,
    });
    openExternal(url, '_blank', 'noopener,noreferrer');
    state.externalReviewOpenedKey = item.key;
    state.reviewChecks.separateTabReviewed = false;
    announce(`Opened the full ${item.type} in a separate tab.`);
    refreshAttestationRail('review-separate-tab');
  }

  function renderPreviewStatusSlot(item) {
    const status = state.preview?.status || 'frame_failure';
    const statuses = {
      loading: {
        symbol: '…',
        label: 'Loading',
        detail: ' Waiting for the learner surface to report its exact readiness.',
      },
      ready: {
        symbol: '✓',
        label: 'Ready',
        detail: ' The current learner surface reported that it is ready for review.',
      },
      not_found: {
        symbol: '!',
        label: 'Not found',
        detail: ' The deployed learner surface could not find this exact item.',
      },
      error: {
        symbol: '×',
        label: 'Error',
        detail: ' The deployed learner surface reported an error for this exact item.',
      },
      protocol_unavailable: {
        symbol: '!',
        label: 'Preview protocol unavailable',
        detail: ' The outer page loaded, but the exact learner surface did not report readiness within 10 seconds.',
      },
      frame_failure: {
        symbol: '×',
        label: 'Network or embedded-preview failure',
        detail: ' The embedded learner page did not load reliably, or it changed or reloaded after verification.',
      },
    };
    const meta = statuses[status] || statuses.frame_failure;
    const failed = PREVIEW_FAILURES.has(status) || !state.preview;
    const learnerSurfaceAvailable = item && ['page', 'tool'].includes(item.type);
    return el('div', { id: 'preview-status-slot', class: 'preview-status' }, [
      el('section', {
        id: 'preview-status',
        class: `preview-status-panel ${status}`,
        tabindex: '-1',
        'aria-labelledby': 'preview-status-label',
      }, [
        el('span', { class: 'preview-status-icon', 'aria-hidden': 'true' }, [meta.symbol]),
        el('span', {}, [
          el('strong', { id: 'preview-status-label' }, [meta.label]),
          meta.detail,
        ]),
        failed || learnerSurfaceAvailable ? el('div', { class: 'preview-actions' }, [
          failed ? el('button', {
            id: 'retry-preview',
            type: 'button',
            disabled: state.pending,
            onClick: retryPreview,
          }, ['Retry preview']) : null,
          learnerSurfaceAvailable ? el('button', {
            id: 'open-full-page',
            type: 'button',
            disabled: state.pending,
            onClick: () => openFullPage(item),
          }, ['Open learner surface (new tab)']) : null,
        ]) : null,
      ]),
    ]);
  }

  function renderPreviewFrame(item) {
    const preview = state.preview;
    if (!preview) return null;
    const frame = el('iframe', {
      id: 'learner-preview-frame',
      title: `Live learner preview for ${item.title}`,
      sandbox: PREVIEW_SANDBOX,
      referrerpolicy: 'no-referrer',
      onLoad: () => handlePreviewFrameLoad(preview),
      onError: () => handlePreviewFrameError(preview),
    });
    frame.setAttribute('src', preview.request.url);
    return frame;
  }

  function installCurrentPreviewFrame() {
    const preview = state.preview;
    const frame = document.getElementById('learner-preview-frame');
    if (!preview || !frame) return;
    preview.frameWindow = frame.contentWindow;
  }

  function renderLivePreview(item) {
    return el('div', { class: 'live-preview' }, [
      renderPreviewStatusSlot(item),
      renderPreviewFrame(item),
    ]);
  }

  function renderDraftOptions(options, id) {
    return el('ol', { id, class: 'draft-option-list' }, list(options).map(optionItem => {
      const optionRecord = record(optionItem);
      const trap = record(optionRecord.trap);
      return el('li', { class: optionRecord.c === true ? 'correct' : null }, [
        el('span', { class: 'draft-option-key', 'aria-hidden': 'true' }, [text(optionRecord.key)]),
        el('span', { class: 'draft-option-copy' }, [text(optionRecord.t)]),
        optionRecord.c === true
          ? el('strong', { class: 'correct-answer' }, ['Correct answer'])
          : null,
        text(trap.name) || text(trap.note) ? el('div', { class: 'draft-trap-note' }, [
          el('span', { class: 'draft-detail-label' }, ['Distractor review']),
          text(trap.name) ? ` · ${text(trap.name)}` : '',
          text(trap.note) ? `: ${text(trap.note)}` : '',
        ]) : null,
      ]);
    }));
  }

  function renderDraftPreview(question) {
    const draft = record(question);
    const dirty = state.dirtyFields.length > 0;
    const tier = record(draft.tier2);
    const link = record(draft.link);
    const learnerUrl = safeStudentUrl(text(link.href));
    return el('article', {
      class: 'draft-question-preview',
      'aria-labelledby': 'draft-preview-title',
    }, [
      el('header', { class: 'draft-preview-heading' }, [
        el('p', { class: 'eyebrow' }, ['Faculty question rendering']),
        el('h2', { id: 'draft-preview-title', tabindex: '-1' }, [
          dirty ? 'Unsaved local preview · Not deployed' : 'Saved Draft preview · Not deployed',
        ]),
        el('p', { class: 'muted' }, [
          dirty
            ? 'This rendering includes local edits. Save and reload before recording exact-revision review.'
            : 'This is the saved repository question, rendered outside the learner deployment.',
        ]),
      ]),
      el('section', { class: 'draft-preview-section', 'aria-labelledby': 'draft-stem-title' }, [
        el('h3', { id: 'draft-stem-title' }, ['Question stem']),
        el('p', { class: 'draft-stem' }, [text(draft.stem)]),
        renderDraftOptions(draft.options, 'draft-options'),
      ]),
      text(tier.q) || list(tier.options).length || text(tier.why) ? el('section', {
        id: 'draft-tier-two',
        class: 'draft-preview-section',
        'aria-labelledby': 'draft-tier-two-title',
      }, [
        el('h3', { id: 'draft-tier-two-title' }, ['Tier-two question']),
        el('p', { class: 'draft-stem' }, [text(tier.q)]),
        renderDraftOptions(tier.options, 'draft-tier-two-options'),
        el('h4', {}, ['Tier-two rationale']),
        el('p', {}, [text(tier.why)]),
      ]) : null,
      el('div', { class: 'draft-teaching-grid' }, [
        el('section', { class: 'draft-preview-section' }, [
          el('h3', {}, ['Rationale']),
          el('p', {}, [text(draft.why)]),
        ]),
        el('section', { class: 'draft-preview-section' }, [
          el('h3', {}, ['Teaching pearl']),
          el('p', {}, [text(draft.pearl)]),
        ]),
      ]),
      el('section', { class: 'draft-preview-section source-note' }, [
        el('h3', {}, ['Evidence anchor']),
        el('p', {}, [text(draft.evidence)]),
      ]),
      el('section', { class: 'draft-preview-section draft-sources' }, [
        el('h3', {}, ['Learning sources']),
        el('h4', {}, ['Source pages']),
        list(draft.pages).length
          ? el('ul', {}, list(draft.pages).map(page => el('li', { class: 'data-text' }, [text(page)])))
          : el('p', { class: 'muted' }, ['No source pages named.']),
        el('h4', {}, ['Learning link']),
        el('p', {}, [
          learnerUrl ? el('a', {
            href: learnerUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, [text(link.label) || 'Open learning source']) : text(link.label),
          text(link.href) ? el('span', { class: 'data-text draft-link-target' }, [text(link.href)]) : null,
        ]),
      ]),
    ]);
  }

  function renderQuestionSurfaces(item) {
    return el('div', { class: 'question-view-stack' }, [
      el('section', {
        id: 'question-view-live',
        class: 'preview-shell',
        hidden: state.viewMode === 'live' ? null : true,
        'aria-labelledby': 'view-live',
      }, [renderLivePreview(item)]),
      el('section', {
        id: 'question-view-draft',
        class: 'preview-shell draft-preview-shell',
        hidden: state.viewMode === 'draft' ? null : true,
        'aria-labelledby': 'view-draft',
      }, [renderDraftPreview(state.editor || item.record)]),
      el('section', {
        id: 'question-view-edit',
        class: 'question-edit-pane',
        hidden: state.viewMode === 'edit' ? null : true,
        'aria-labelledby': 'view-edit',
      }, [renderQuestionEditor(item.record)]),
    ]);
  }

  function renderWorkspaceSurface(item) {
    if (!item) {
      return el('div', { class: 'preview-shell empty-selection' }, [
        el('p', { class: 'muted' }, ['No review surface is available for the active filters.']),
      ]);
    }
    if (item.type === 'question') return renderQuestionSurfaces(item);
    return el('section', {
      id: 'question-view-live',
      class: 'preview-shell',
      'aria-label': 'Live learner deployment',
    }, [renderLivePreview(item)]);
  }

  function updateReviewCheck(item, key, checked, focusId) {
    state.reviewChecks[key] = checked === true;
    refreshPreviewChromeAndRail(focusId);
  }

  // Auto-advance (2026-08-12 efficiency pass, receipt half): a receipt that just
  // recorded moves the reviewer straight to the next unreceipted draft in the current
  // filter, so a long queue does not need one click per item. "Unreceipted draft" is
  // deliberately narrow — type 'question', savedStatus 'draft', and no matching
  // reviewedRevisions entry — so a broader status filter can never offer up an
  // already-attested question as something left to receipt. The same predicate feeds
  // both the announced count and the advance target, so the two can never disagree. A
  // live navigationGuard means unsaved local work is already blocking navigation
  // elsewhere; the receipt above this call still recorded, but the jump itself is
  // silently skipped rather than stacking a second guard prompt on top of whatever is
  // already pending.
  //
  // Ruling (b) (2026-08-12 efficiency pass, Task 4): `forward` (index > start) is a
  // deliberately narrow scan — it can only ever see drafts AFTER the just-receipted
  // item's position, so it alone decides whether — and where — to move (no wrap: a
  // reviewer who jumped ahead via the item selector chose that position on purpose,
  // and this function only ever reports what is left, it never redirects them). But
  // that same narrowness means it must never drive the terminal "all drafts hold
  // receipts" announcement — a jumped-ahead receipt with unreceipted drafts sitting
  // EARLIER would otherwise announce completion while work remains. `elsewhere`
  // re-scans the whole visible list (excluding the item index just receipted) to
  // decide that terminal case correctly; when forward is empty but elsewhere is not,
  // the count is reported without moving.
  function advanceToNextUnreceipted(fromKey) {
    if (state.navigationGuard) return false;
    const visible = visibleReviewItems();
    const start = visible.findIndex(item => item.key === fromKey);
    const isUnreceiptedDraft = item => item.type === 'question' && item.savedStatus === 'draft'
      && !reviewedRevisionMatches(item, state.reviewedRevisions.get(item.identity));
    const totalDrafts = visible.filter(item => item.type === 'question' && item.savedStatus === 'draft').length;
    const forward = visible.filter((item, index) => index > start && isUnreceiptedDraft(item));
    const elsewhere = visible.filter((item, index) => index !== start && isUnreceiptedDraft(item));
    if (forward.length) {
      // Read the view BEFORE the selection change resets it. In practice this is always
      // 'draft' (only compoundReviewEligible items can reach here, and that demands
      // Draft view), but deriving it rather than hard-coding keeps the carry honest if
      // the separate-checkbox path ever grows an advance of its own.
      const carryDraftView = state.viewMode === 'draft';
      const advanced = setSelectedReviewKey(forward[0].key, { carryDraftView });
      if (!advanced) return false;
      // Focus the Draft preview button, never the item-selector <select>: R's own
      // form-field guard skips select/input/textarea targets, so parking focus there
      // silently ended the keyboard sitting after a single item. #view-draft is a
      // button (R stays live) and names where the advance just landed the reviewer.
      renderShell(carryDraftView ? 'view-draft' : 'review-item-selector');
      const identity = findReviewItem(fromKey)?.identity;
      const batchStatus = state.batchEnrollmentFeedback?.id === identity
        ? state.batchEnrollmentFeedback.status
        : identity != null && state.batchExclusions.has(identity) ? 'excluded' : 'added';
      const batchOutcome = batchStatus === 'individual'
        ? 'individual attestation required'
        : batchStatus === 'blocked'
          ? 'not eligible for batch'
          : `${batchStatus === 'excluded' ? 'excluded from' : 'added to'} batch`;
      announce(`Receipt recorded — ${elsewhere.length} of ${totalDrafts} drafts remaining; ${
        batchOutcome}.`);
      return true;
    }
    if (!elsewhere.length) {
      announce('All drafts in this filter hold receipts.');
      return false;
    }
    announce(`Receipt recorded — ${elsewhere.length} of ${totalDrafts} drafts remaining earlier in the list.`);
    return false;
  }

  function confirmDraftReview(question, checked) {
    refreshEditorState();
    const saved = findQuestion(question?.id);
    if (!checked) {
      invalidateSessionReview(question?.id);
    } else if (state.viewMode === 'draft' && saved
        && !state.dirtyFields.length && saved.revision === question?.revision) {
      state.reviewedRevisions.set(question.id, question.revision);
    }
    // Batch auto-enroll (2026-08-12 efficiency pass): holding a receipt is what earns a
    // spot in the tray by default, so a reviewer who already ticked this box does not
    // also have to find and check the tray box. An exclusion (toggleBatchMember) stays
    // sticky for as long as the same receipt is held uninterrupted; losing the receipt
    // drops the item from the selection and forgets the exclusion.
    const id = question?.id;
    if (id) {
      if (state.reviewedRevisions.has(id)) {
        const assessmentGate = state.localAssessment?.gate
          || (saved ? currentAssessment(saved).gate : 'blocked');
        const batchVerdict = saved ? deriveBatchEligibility(saved, {
          assessmentGate,
          reviewedRevision: state.reviewedRevisions.get(id),
        }) : { eligible: false, reasons: ['batch.blocked'] };
        if (!batchVerdict.eligible) {
          state.batchSelection.delete(id);
          state.batchEnrollmentFeedback = {
            id,
            status: batchVerdict.reasons.includes('batch.warning_individual_only')
              ? 'individual' : 'blocked',
          };
        } else if (state.batchExclusions.has(id)) {
          if (checked) state.batchEnrollmentFeedback = { id, status: 'excluded' };
        } else {
          const newlySelected = !state.batchSelection.has(id);
          state.batchSelection.add(id);
          if (checked && newlySelected) state.batchEnrollmentFeedback = { id, status: 'added' };
        }
      } else {
        state.batchSelection.delete(id);
        state.batchExclusions.delete(id); // receipt loss clears the exclusion
        if (state.batchEnrollmentFeedback?.id === id) state.batchEnrollmentFeedback = null;
      }
    }
    refreshPreviewChromeAndRail('review-saved-revision');
  }

  // A clean ready-preview draft — Draft view, no local edits, the item's revision still
  // matching the saved question — lets one receipt stand in for both of today's separate
  // acknowledgements. Anything else (wrong view, dirty fields, a moved revision, a failed
  // preview, or a non-question item) keeps the two-checkbox path unchanged.
  function compoundReviewEligible(item) {
    if (item?.type !== 'question') return false;
    if ((state.preview?.status || 'frame_failure') !== 'ready') return false;
    const question = state.editor || item.record;
    const saved = findQuestion(item.identity);
    return state.viewMode === 'draft'
      && state.dirtyFields.length === 0
      && saved?.revision === question?.revision
      && item.revision === saved?.revision;
  }

  // Sets both state.reviewedRevisions and state.reviewChecks.liveReviewed atomically:
  // confirmDraftReview records (or revokes) the revision-anchored receipt, then
  // liveReviewed is derived from whether that receipt actually stuck — so a receipt
  // that fails to record (e.g. the revision moved underneath it) never leaves the
  // live check on by itself. reviewedRevisionMatches expects a review-item shape
  // ({type: 'question', revision}) — findQuestion(id) returns the raw qbank record,
  // whose `type` is the question FORMAT ('sba'/'relational'/'two-tier'), never the
  // literal string 'question', so it can never satisfy that check. A minimal shim
  // carrying just the two fields the matcher reads is what confirmDraftReview itself
  // just used to decide whether to record the receipt.
  function confirmCompoundReview(question, checked) {
    const fromKey = state.selectedKey;
    confirmDraftReview(question, checked);
    const receipted = reviewedRevisionMatches(
      { type: 'question', revision: question?.revision },
      state.reviewedRevisions.get(question?.id),
    );
    state.reviewChecks.liveReviewed = checked === true && receipted;
    refreshPreviewChromeAndRail('review-compound');
    // Auto-advance only after a receipt actually recorded — never on an uncheck, and
    // never when the compound conditions failed to stick — so unchecking the box or a
    // revision race can never silently skip a draft.
    if (checked === true && receipted) advanceToNextUnreceipted(fromKey);
  }

  function reviewPathComplete(item) {
    const status = state.preview?.status;
    const draftReviewed = item.type !== 'question'
      || reviewedRevisionMatches(item, state.reviewedRevisions.get(item.identity));
    if (status === 'ready') {
      return item.type === 'question'
        ? state.reviewChecks.liveReviewed === true && draftReviewed
        : state.reviewChecks.completeItemReviewed === true;
    }
    if (!PREVIEW_FAILURES.has(status)) return false;
    return item.type === 'question'
      ? state.reviewChecks.liveUnavailableAcknowledged === true && draftReviewed
      : state.externalReviewOpenedKey === item.key
        && state.reviewChecks.separateTabReviewed === true;
  }

  function renderDraftReviewControl(item) {
    if (compoundReviewEligible(item)) {
      const question = state.editor || item.record;
      const checked = reviewedRevisionMatches(item, state.reviewedRevisions.get(item.identity))
        && state.reviewChecks.liveReviewed === true;
      return el('div', { class: 'draft-review-control' }, [
        el('label', { class: 'checkbox-line', for: 'review-compound' }, [
          el('input', {
            id: 'review-compound',
            type: 'checkbox',
            checked,
            disabled: state.pending,
            'aria-keyshortcuts': 'r',
            onChange: event => confirmCompoundReview(question, event.target.checked),
          }),
          'I reviewed this draft at its saved revision and its live rendering',
        ]),
      ]);
    }
    const question = state.editor || item.record;
    const saved = findQuestion(item.identity);
    const canReview = state.viewMode === 'draft'
      && state.dirtyFields.length === 0
      && saved?.revision === question?.revision
      && item.revision === saved?.revision;
    const checked = reviewedRevisionMatches(
      item,
      state.reviewedRevisions.get(item.identity),
    );
    return el('div', { class: 'draft-review-control' }, [
      el('label', { class: 'checkbox-line', for: 'review-saved-revision' }, [
        el('input', {
          id: 'review-saved-revision',
          type: 'checkbox',
          checked,
          disabled: state.pending || !canReview,
          onChange: event => confirmDraftReview(question, event.target.checked),
        }),
        'I reviewed this exact saved revision',
      ]),
      !canReview ? el('p', { class: 'hint' }, [
        state.dirtyFields.length
          ? 'Save and reload local edits before recording this review.'
          : 'Open Draft preview to record this exact saved-revision review.',
      ]) : null,
    ]);
  }

  function renderDeploymentReviewPath(item) {
    if (compoundReviewEligible(item)) return null;
    const status = state.preview?.status || 'frame_failure';
    if (status === 'loading') {
      return el('p', { class: 'muted' }, [
        'Wait for the exact learner surface to report Ready before recording review.',
      ]);
    }
    if (status === 'ready') {
      const question = item.type === 'question';
      const id = question ? 'review-live-preview' : 'review-complete-item';
      const key = question ? 'liveReviewed' : 'completeItemReviewed';
      return el('label', { class: 'checkbox-line', for: id }, [
        el('input', {
          id,
          type: 'checkbox',
          checked: state.reviewChecks[key] === true,
          disabled: state.pending,
          onChange: event => updateReviewCheck(item, key, event.target.checked, id),
        }),
        question
          ? 'I reviewed the complete item in the learner view'
          : 'I reviewed the complete item',
      ]);
    }
    if (PREVIEW_FAILURES.has(status) || !state.preview) {
      if (item.type !== 'question') {
        return el('label', { class: 'checkbox-line', for: 'review-separate-tab' }, [
          el('input', {
            id: 'review-separate-tab',
            type: 'checkbox',
            checked: state.reviewChecks.separateTabReviewed === true,
            disabled: state.pending || state.externalReviewOpenedKey !== item.key,
            onChange: event => updateReviewCheck(
              item,
              'separateTabReviewed',
              event.target.checked,
              'review-separate-tab',
            ),
          }),
          'I reviewed this item in the separate tab',
        ]);
      }
      const retryRequired = RETRY_REQUIRED_QUESTION_FAILURES.has(status)
        && (state.preview?.attempt || 0) <= 1;
      return el('div', {}, [
        el('label', { class: 'checkbox-line', for: 'ack-live-unavailable' }, [
          el('input', {
            id: 'ack-live-unavailable',
            type: 'checkbox',
            checked: state.reviewChecks.liveUnavailableAcknowledged === true,
            disabled: state.pending || retryRequired,
            onChange: event => updateReviewCheck(
              item,
              'liveUnavailableAcknowledged',
              event.target.checked,
              'ack-live-unavailable',
            ),
          }),
          'The live question is unavailable; I reviewed the saved revision that will be deployed',
        ]),
        retryRequired ? el('p', { class: 'hint' }, [
          'Retry preview once. This acknowledgement becomes available only if that attempt also fails.',
        ]) : null,
      ]);
    }
    return el('p', { class: 'muted' }, ['Preview verification is unavailable.']);
  }

  function renderReviewPath(item) {
    const deploymentReview = renderDeploymentReviewPath(item);
    if (item.type !== 'question') return deploymentReview;
    return el('div', { class: 'question-review-path' }, [
      deploymentReview,
      renderDraftReviewControl(item),
    ]);
  }

  function renderContentChecks(item) {
    return el('fieldset', { class: 'content-review-checks', disabled: state.pending }, [
      el('legend', {}, ['Content checks']),
      ...[
        ['accuracy', 'review-content-accuracy', `I verified that this is accurate and appropriate for ${audienceLabel(item.sites)}.`],
        ['interactions', 'review-content-interactions', 'I tested the relevant links, media, or interactions.'],
      ].map(([key, id, copy]) => el('label', { for: id }, [
        el('input', {
          id,
          type: 'checkbox',
          checked: state.reviewChecks[key] === true,
          disabled: state.pending,
          onChange: event => updateReviewCheck(item, key, event.target.checked, id),
        }),
        copy,
      ])),
    ]);
  }

  function currentAttestationEligibility(item, assessment, dirty, { assumeHumanChecks = false } = {}) {
    // assumeHumanChecks answers "would this be eligible if the reviewer ticked
    // the boxes?" — the gate for the one-click action. Every other precondition
    // still applies (preview ready, revision reviewed, warnings acknowledged);
    // only the three human assertions are presumed, and the button states them.
    //
    // The line this draws is the one that matters, and it holds for both item types:
    // FACULTY JUDGMENT assertions may be presumed by a button that names them
    // (content's accuracy/interactions/complete-item; a question's three
    // confirmations), while EVIDENCE OF HAVING LOOKED never is — liveReviewed and
    // reviewedRevision below are passed through unassumed on purpose, so no press can
    // attest a draft the reviewer never opened and receipted.
    const assume = value => (assumeHumanChecks ? true : value);
    return deriveAttestationEligibility({
      item,
      assessment,
      dirty,
      previewStatus: state.preview?.status,
      retryAttempted: (state.preview?.attempt || 0) > 1,
      completeItemReviewed: assume(state.reviewChecks.completeItemReviewed),
      liveReviewed: state.reviewChecks.liveReviewed,
      separateTabReviewed: state.externalReviewOpenedKey === item.key
        && state.reviewChecks.separateTabReviewed,
      liveUnavailableAcknowledged: state.reviewChecks.liveUnavailableAcknowledged,
      reviewedRevision: state.reviewedRevisions.get(item.identity),
      warningAcks: state.warningAcks,
      confirmations: assumeHumanChecks
        ? { clinical: true, evidence: true, originalityAndNoPhi: true }
        : state.confirmations,
      contentChecks: {
        accuracy: assume(state.reviewChecks.accuracy),
        interactions: assume(state.reviewChecks.interactions),
      },
    });
  }

  /**
   * One click instead of four, for pages and tools.
   *
   * The three checkboxes ARE the attestation record, so collapsing them must not
   * mean asserting less: the button names all three, and the same three flags
   * are what commits. Offered only when the learner surface actually rendered
   * (`preview.status === 'ready'`) — if the preview failed, the granular path
   * stands, because "I reviewed this item in the separate tab" is not something
   * a button press can honestly claim on the reviewer's behalf.
   */
  async function attestContentInOneClick(item) {
    state.reviewChecks.completeItemReviewed = true;
    state.reviewChecks.accuracy = true;
    state.reviewChecks.interactions = true;
    await attestContentItem(item);
  }

  function oneClickAvailable(item) {
    return item.type !== 'question'
      && item.completion !== 'complete'
      && state.preview?.status === 'ready';
  }

  /**
   * One press instead of four, for qbank drafts — the symmetric case of
   * attestContentInOneClick above, and the same bargain: the button NAMES all three
   * confirmations (CONFIRMATION_SUMMARY) and those same three flags are what commits.
   *
   * What is NOT presumed is the point. currentAttestationEligibility passes
   * liveReviewed and reviewedRevision through unassumed, so the press stays disabled
   * until the reviewer has actually opened the draft and recorded its revision-anchored
   * receipt. The three confirmations are faculty judgment; the receipt is evidence of
   * having looked, and no button asserts that on the reviewer's behalf.
   *
   * On the batch path this changes nothing about scope: requireConfirmations() runs
   * once per REQUEST server-side, so a batch has always carried one set of three for
   * the whole selection. What made that defensible — the per-item receipt, enforced
   * independently as reviewedRevision === revision on every entry — is untouched.
   */
  function recordAllConfirmations() {
    state.confirmations.clinical = true;
    state.confirmations.evidence = true;
    state.confirmations.originalityAndNoPhi = true;
  }

  async function attestQuestionInOneClick(question) {
    recordAllConfirmations();
    await attestCurrentQuestion(question);
  }

  async function attestSelectionInOneClick() {
    recordAllConfirmations();
    await attestSelection();
  }

  function renderQuestionResolution(assessment, disabled) {
    const gate = Object.hasOwn(GATE_LABELS, assessment?.gate)
      ? assessment.gate
      : 'blocked';
    const issues = [
      ...list(assessment?.blockers),
      ...list(assessment?.warnings),
    ];
    const gateCopy = {
      ready: 'Ready means structural checks passed. It is not clinical approval.',
      warning: 'Review and acknowledge every current warning before attestation.',
      blocked: 'Resolve every structural blocker and save the question before attestation.',
    };
    return el('div', { class: 'question-resolution' }, [
      gateLabel(gate),
      el('p', { class: 'hint' }, [gateCopy[gate]]),
      issues.length ? el('ul', { class: 'rail-issue-list' }, issues.map(issue => {
        const field = text(issue?.field) || 'Question';
        const { targetId } = issueTarget(field);
        return el('li', {}, [
          el('button', {
            type: 'button',
            class: 'rail-issue-route',
            disabled: state.pending,
            onClick: () => switchQuestionView('edit', targetId),
          }, [`${field}: ${text(issue?.message) || text(issue?.code) || 'Review this field.'}`]),
        ]);
      })) : null,
      renderWarningAcknowledgements(assessment, disabled),
      el('button', {
        id: 'edit-question-from-rail',
        type: 'button',
        class: 'quiet rail-edit-route',
        disabled: state.pending,
        onClick: () => switchQuestionView('edit', 'review-title'),
      }, ['Edit question']),
    ]);
  }

  function contentChecksComplete() {
    return state.reviewChecks.accuracy === true
      && state.reviewChecks.interactions === true;
  }

  function renderContentMoreActions(item) {
    return el('details', { class: 'more-actions' }, [
      el('summary', {}, ['More actions']),
      el('button', {
        id: 'reopen-content-review',
        type: 'button',
        class: 'quiet rail-action',
        disabled: state.pending,
        onClick: () => openReopenConfirmation(item),
      }, ['Reopen review']),
    ]);
  }

  // Read-only in this increment (2026-07-26 risk-aware-publishing-warnings plan): a
  // later classification queue owns risk edits, so there is no affordance here to
  // change it — only to see it before attesting or reopening. Omitted entirely (not
  // a placeholder) for a question, or for content the ledger has no risk for yet.
  function renderRiskContext(item) {
    if (!item || item.type === 'question' || !item.risk) return null;
    return el('p', { id: 'attestation-risk-context', class: 'hint' }, [
      'Publishing risk: ',
      riskLabel(item.risk),
    ]);
  }

  // The ledger's stored reason for a pending item, read-only. The reopen dialog
  // owns writing reasons; this only surfaces what the learner-facing badge says.
  // A stale item is handled by renderStaleNotice below: its reason is computed for this
  // load rather than stored, and labelling it "Pending because" would both mislabel it
  // and print the same sentence twice.
  function renderPendingReason(item) {
    if (!item || item.type === 'question' || item.savedStatus === 'reviewed') return null;
    if (item.record?.stale === true) return null;
    const reason = typeof item.record?.reason === 'string' ? item.record.reason.trim() : '';
    if (!reason) return null;
    return el('p', { id: 'attestation-pending-reason', class: 'hint' }, [
      'Pending because: ',
      reason,
    ]);
  }

  /* Why this item's review no longer stands for its text (2026-09-18).
     The server compares each reviewed row's stored contentHash against a digest of the
     page's current sources and topic_meta record, and sends the finding — drifted, never
     bound, or unverifiable this load. Rendered verbatim, with no lead-in: each sentence
     already says which of the three it is, and a single label would be wrong for two of
     them ("re-attest" is not the answer when the tree call simply failed). Shown for a
     reviewed item as well as an unreviewed one, which is the whole point — a row recorded
     as reviewed that cannot say WHAT it reviewed is exactly the state this closes. */
  function renderStaleNotice(item) {
    if (!item || item.type === 'question' || item.record?.stale !== true) return null;
    const reason = typeof item.record?.reason === 'string' ? item.record.reason.trim() : '';
    if (!reason) return null;
    return el('p', { id: 'attestation-stale-notice', class: 'hint' }, [reason]);
  }

  /* ── Re-sign by change (2026-09-25) ─────────────────────────────────────────────────
     A signed page drifts when a correction changes text it was signed against. When one
     correction set drifts dozens of pages at once, re-reading each whole page to find a
     few changed sentences is the slow, error-prone way to re-review. These views answer
     "which correction changed which page, and what exactly did it say", so re-signing is a
     review of the change — the way interval changes are reviewed on a chart.
     The views themselves never sign; the server views they read (?view=changes,
     ?view=diff) are GET-only and never move a branch. Since 2026-09-26 each correction
     also carries ONE signing control, "Sign this correction", placed after its pages and
     their diffs: one press re-signs every page whose every change since signing is a
     correction the reviewer has signed (see pressManyPages). A page can still be signed
     on its own in the ordinary review flow. */

  const KEY_REJECTED_FOR_VIEW = 'Key not accepted. Lock the console and enter the faculty key again.';

  function isDriftedItem(item) {
    return Boolean(item) && item.type !== 'question'
      && item.record?.stale === true && isDriftReason(item.record?.reason);
  }

  function contentItemBySlug(slug, kind = '') {
    return (kind ? findReviewItem(`${kind}:${slug}`) : null)
      || state.reviewItems.find(item => item.type !== 'question' && item.identity === slug)
      || null;
  }

  function diffKey(slug, sha = '') {
    return `${slug}|${sha}`;
  }

  function splitDiffKey(key) {
    const at = key.lastIndexOf('|');
    return [key.slice(0, at), key.slice(at + 1)];
  }

  function resetChangeViews() {
    state.changeView = null;
    state.changeViewOpen = false;
    state.openChangeGroups = new Set();
    state.diffViews = new Map();
    state.openDiffs = new Set();
    state.resignGroupId = null;
    state.viewGeneration += 1;
    renderedDiffBodies.clear();
    state.baseline = null;
    state.baselineOpen = false;
    state.baselineLeftOut = new Set();
    state.correctionsSigned = new Set();
    state.manyPageReceipt = null;
  }

  function activeChangeGroup() {
    if (!state.resignGroupId) return null;
    return list(state.changeView?.data?.groups).find(group => group?.id === state.resignGroupId) || null;
  }

  function changeLabel(change) {
    if (Number.isSafeInteger(change?.pr)) return `#${change.pr}`;
    return text(change?.sha).slice(0, 7) || 'a change';
  }

  function changeIdLabel(id) {
    const value = text(id);
    if (value.startsWith('pr:')) return `#${value.slice(3)}`;
    if (value.startsWith('sha:')) return value.slice(4, 11);
    return value;
  }

  function dayOf(value) {
    const day = text(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
  }

  function pluralize(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
  }

  async function viewRequest(query, fallback, expectedView) {
    let response;
    try {
      response = await fetchImpl(`${API}?${new URLSearchParams(query)}`, { headers: apiHeaders() });
    } catch (error) {
      throw new Error(`network_error: ${error instanceof Error ? error.message : fallback}`);
    }
    const payload = await responseJson(response);
    if (response.status === 401) throw new Error(KEY_REJECTED_FOR_VIEW);
    if (!response.ok || payload?.view !== expectedView) {
      throw new Error(stableResponseMessage(payload, fallback));
    }
    return payload;
  }

  async function loadChangeView() {
    if (state.changeView?.status === 'loading') return;
    const generation = state.viewGeneration;
    const previous = state.changeView?.data || null;
    state.changeView = { status: 'loading', data: previous };
    refreshResignByChange();
    let next;
    try {
      const data = await viewRequest(
        { view: 'changes' },
        'The list of changes could not be loaded.',
        'changes',
      );
      if (!Array.isArray(data.groups)) throw new Error('The server returned an incomplete list of changes.');
      next = { status: 'ready', data };
    } catch (error) {
      next = {
        status: 'error',
        data: previous,
        message: error instanceof Error ? error.message : 'The list of changes could not be loaded.',
      };
    }
    if (generation !== state.viewGeneration || !state.server) return;
    state.changeView = next;
    refreshResignByChange();
    announce(next.status === 'ready'
      ? `${pluralize(next.data.groups.length, 'correction')} changed pages you had signed.`
      : next.message);
  }

  async function loadDiff(slug, sha = '') {
    const key = diffKey(slug, sha);
    const current = state.diffViews.get(key);
    if (current && current.status !== 'error') return;
    const generation = state.viewGeneration;
    state.diffViews.set(key, { status: 'loading' });
    refreshDiffBodies(key);
    let next;
    try {
      const data = await viewRequest(
        sha ? { view: 'diff', slug, sha } : { view: 'diff', slug },
        'This change could not be loaded.',
        'diff',
      );
      next = { status: 'ready', data };
    } catch (error) {
      next = {
        status: 'error',
        message: error instanceof Error ? error.message : 'This change could not be loaded.',
      };
    }
    if (generation !== state.viewGeneration || !state.server) return;
    state.diffViews.set(key, next);
    refreshDiffBodies(key);
  }

  /* Opens "What changed since you signed" for a page the reviewer is about to re-sign, so
     they land on the change rather than hunting for it. `onlyInGroup`: only while they are
     working through a correction and this page is part of it. */
  function openChangesSinceSigned(item, { onlyInGroup = false } = {}) {
    if (!isDriftedItem(item)) return;
    if (onlyInGroup && !activeChangeGroup()?.slugs.includes(item.identity)) return;
    const key = diffKey(item.identity, '');
    state.openDiffs.add(key);
    void loadDiff(item.identity, '');
  }

  function openFromChangeView(item, groupId, returnFocus) {
    if (!item) return;
    state.resignGroupId = groupId;
    openChangesSinceSigned(item);
    const focusId = isDriftedItem(item) ? 'changes-since-signed-toggle' : null;
    if (item.key === state.selectedKey) {
      // Already open: no navigation (that would reload the preview), just show the change.
      refreshAttestationRail(focusId || returnFocus);
      return;
    }
    requestNavigation({ kind: 'review', key: item.key, focusId }, returnFocus);
  }

  const FILE_STATUS_LABELS = {
    modified: 'changed',
    added: 'added since then',
    removed: 'removed since then',
    binary: 'a binary file changed',
  };

  function renderHunks(hunks) {
    return el('div', { class: 'diff-hunks' }, list(hunks).map(hunk => el('div', { class: 'diff-hunk' }, [
      el('p', { class: 'diff-where' }, [`Near line ${Number(hunk?.newStart) || 1}`]),
      el('pre', { class: 'diff-text' }, list(hunk?.rows).map(row => el('span', {
        class: `diff-row ${['change', 'del', 'add'].includes(row?.kind) ? row.kind : 'context'}`,
      }, [
        ...list(row?.segments).map(segment => {
          if (segment?.t === 'del') return el('del', {}, [text(segment.s)]);
          if (segment?.t === 'add') return el('ins', {}, [text(segment.s)]);
          return text(segment?.s);
        }),
        '\n',
      ]))),
    ])));
  }

  function renderDiffSection(label, change) {
    return el('section', { class: 'diff-file' }, [
      el('p', { class: 'diff-file-name' }, label),
      change.status === 'binary'
        ? el('p', { class: 'hint' }, ['A binary file changed. Open the full comparison to see it.'])
        : change.tooLarge
        ? el('p', { class: 'hint' }, ['Too much changed to show here. Open the full comparison below.'])
        : renderHunks(change.hunks),
      change.truncated ? el('p', { class: 'hint' }, ['Only the first 60 changed passages are shown.']) : null,
    ]);
  }

  // Elements only (no bare text nodes): refreshDiffBodies moves these with replaceChildren.
  function renderDiff(data) {
    const sections = [];
    for (const file of list(data?.files)) {
      if (!file || ['unchanged', 'missing'].includes(file.status)) continue;
      sections.push(renderDiffSection([
        el('code', {}, [text(file.path)]),
        ` · ${FILE_STATUS_LABELS[file.status] || text(file.status)}`,
      ], file));
    }
    for (const change of list(data?.record)) {
      if (!change) continue;
      sections.push(renderDiffSection([
        'Page record field ',
        el('code', {}, [text(change.key)]),
        ' (quiz, key points, evidence and other metadata live here)',
      ], change));
    }
    const commit = record(data?.commit);
    const compare = safeExternalUrl(data?.compareUrl);
    return [
      data?.commit
        ? el('p', { class: 'diff-context' }, [
          `${changeLabel(commit)} · ${text(commit.title)}${dayOf(commit.date) ? ` · ${dayOf(commit.date)}` : ''}`,
        ])
        : el('p', { class: 'diff-context' }, [
          `Every change to this page${'’'}s text and record since the start of ${text(data?.since) || 'the day you signed'}.`,
        ]),
      ...(sections.length ? sections : [el('p', { class: 'hint' }, [
        'Neither this page’s source files nor its record changed between these two versions. '
        + 'Its fingerprint moved for another reason (for example, a file newly counted as part of '
        + 'the page), so review the page as it now reads.',
      ])]),
      compare ? el('p', { class: 'diff-compare' }, [el('a', {
        href: compare,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, ['Open the full comparison on GitHub ↗'])]) : null,
    ].filter(Boolean);
  }

  function renderDiffContent(key) {
    const entry = state.diffViews.get(key);
    if (!entry || entry.status === 'loading') {
      return [el('p', { class: 'hint' }, ['Loading the change…'])];
    }
    if (entry.status === 'error') {
      const [slug, sha] = splitDiffKey(key);
      return [
        el('p', { class: 'hint diff-error' }, [entry.message]),
        el('button', {
          type: 'button',
          class: 'quiet',
          onClick: () => void loadDiff(slug, sha),
        }, ['Try again']),
      ];
    }
    return renderDiff(entry.data);
  }

  function renderDiffDisclosure({ key, slug, sha = '', label, summaryId, bodyId }) {
    const ids = renderedDiffBodies.get(key) || new Set();
    ids.add(bodyId);
    renderedDiffBodies.set(key, ids);
    return el('details', {
      class: 'diff-disclosure',
      open: state.openDiffs.has(key),
      onToggle: event => {
        if (event.currentTarget.open) {
          state.openDiffs.add(key);
          void loadDiff(slug, sha);
        } else {
          state.openDiffs.delete(key);
        }
      },
    }, [
      el('summary', { id: summaryId }, [label]),
      el('div', { id: bodyId, class: 'diff-body', 'data-diff-key': key }, renderDiffContent(key)),
    ]);
  }

  function refreshDiffBodies(key) {
    const ids = renderedDiffBodies.get(key);
    if (!ids) return;
    for (const id of [...ids]) {
      const node = document.getElementById(id);
      if (!node || node.getAttribute('data-diff-key') !== key) {
        ids.delete(id);
        continue;
      }
      node.replaceChildren(...renderDiffContent(key));
    }
  }

  // The rail's half: what changed on THIS page since it was signed, one disclosure away.
  function renderChangesSinceSigned(item) {
    if (!isDriftedItem(item)) return null;
    const at = text(item.record?.at);
    return el('div', { id: 'changes-since-signed', class: 'changes-since-signed' }, [
      renderDiffDisclosure({
        key: diffKey(item.identity, ''),
        slug: item.identity,
        label: `What changed since you signed${/^\d{4}-\d{2}-\d{2}$/.test(at) ? ` on ${at}` : ''}`,
        summaryId: 'changes-since-signed-toggle',
        bodyId: 'changes-since-signed-body',
      }),
    ]);
  }

  // Where the reviewer is in the correction they opened this page from.
  function renderResignGroupProgress(item) {
    const group = activeChangeGroup();
    if (!group || !item || !group.slugs.includes(item.identity)) return null;
    const pages = group.slugs.map(slug => contentItemBySlug(slug)).filter(Boolean);
    const remaining = pages.filter(isDriftedItem).length;
    return el('p', { id: 'resign-group-progress', class: 'resign-progress' }, [
      `Re-signing ${changeLabel(group)}: ${pages.length - remaining} of ${pages.length} pages re-signed. `,
      remaining
        ? 'After you sign this page, the next page this correction changed opens.'
        : 'Every page this correction changed is re-signed.',
    ]);
  }

  function renderResignPage(group, slug, data) {
    const page = record(data.pages?.[slug]);
    const item = contentItemBySlug(slug, text(page.kind));
    const title = item?.title || text(page.title) || slug;
    const token = domToken(`${group.id}-${slug}`);
    const drifted = isDriftedItem(item);
    const status = !item ? 'Not in the current queue'
      : drifted ? 'Needs your signature'
      : item.completion === 'complete' ? '✓ Re-signed'
      : 'Needs review';
    const changes = list(page.changes);
    const thisChange = changes.find(change => change?.id === group.id);
    const others = changes.filter(change => change?.id && change.id !== group.id).map(change => changeIdLabel(change.id));
    return el('li', { class: `resign-page${drifted ? '' : ' settled'}` }, [
      el('div', { class: 'resign-page-line' }, [
        el('button', {
          id: `resign-open-${token}`,
          type: 'button',
          class: 'quiet resign-open',
          disabled: !item || state.pending,
          'aria-current': item && item.key === state.selectedKey ? 'true' : null,
          onClick: () => openFromChangeView(item, group.id, `resign-open-${token}`),
        }, [title]),
        el('span', { class: 'resign-page-status' }, [status]),
      ]),
      thisChange?.sameDay ? el('p', { class: 'hint' }, [
        `This correction landed on ${text(page.at)}, the day you signed, so you may already have read it.`,
      ]) : null,
      others.length ? el('p', { class: 'hint' }, [`Also changed by ${others.join(', ')}.`]) : null,
      renderDiffDisclosure({
        key: diffKey(slug, text(group.sha)),
        slug,
        sha: text(group.sha),
        label: `Show what ${changeLabel(group)} changed on this page`,
        summaryId: `resign-diff-toggle-${token}`,
        bodyId: `resign-diff-body-${token}`,
      }),
    ]);
  }

  function renderResignGroup(group, data) {
    const pages = group.slugs.map(slug => contentItemBySlug(slug, text(record(data.pages?.[slug]).kind)));
    const waiting = pages.filter(isDriftedItem);
    const token = domToken(group.id);
    const url = safeExternalUrl(group.url);
    return el('details', {
      id: `resign-group-${token}`,
      class: 'resign-group',
      open: state.openChangeGroups.has(group.id),
      onToggle: event => {
        if (event.currentTarget.open) state.openChangeGroups.add(group.id);
        else state.openChangeGroups.delete(group.id);
      },
    }, [
      el('summary', {}, [
        el('strong', {}, [changeLabel(group)]),
        ` ${text(group.title)} · ${pluralize(group.slugs.length, 'page')}`
        + ` · ${waiting.length ? `${waiting.length} to re-sign` : 'all re-signed'}`
        + (dayOf(group.date) ? ` · ${dayOf(group.date)}` : ''),
      ]),
      el('div', { class: 'resign-group-body' }, [
        el('div', { class: 'resign-group-actions' }, [
          el('button', {
            id: `resign-start-${token}`,
            type: 'button',
            disabled: !waiting.length || state.pending,
            onClick: () => openFromChangeView(waiting[0], group.id, `resign-start-${token}`),
          }, [waiting.length ? 'Open the next page to re-sign' : 'Nothing left to re-sign']),
          url ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, ['This correction on GitHub ↗']) : null,
        ]),
        el('ul', { class: 'resign-pages' }, group.slugs.map(slug => renderResignPage(group, slug, data))),
        renderSignCorrection(group, data, waiting),
      ]),
    ]);
  }

  /* Which of this correction's pages one "Sign this correction" press would re-sign: still
     drifted, and every change since signing is this correction or one this sitting already
     signed. Only the button's count comes from here; the server decides again from its own
     reading of the history, and returns what it signed and what it left out. */
  function correctionCoverage(group, data) {
    const named = new Set([...state.correctionsSigned, group.id]);
    const covered = [];
    const others = new Set();
    for (const slug of group.slugs) {
      const page = record(data.pages?.[slug]);
      if (!isDriftedItem(contentItemBySlug(slug, text(page.kind)))) continue;
      const missing = list(page.changes).map(change => text(change?.id)).filter(id => id && !named.has(id));
      if (missing.length) missing.forEach(id => others.add(id));
      else covered.push(slug);
    }
    return { covered, others: [...others], named: [...named] };
  }

  function renderSignCorrection(group, data, waiting) {
    const statement = text(data.statement);
    if (!waiting.length || !statement) return null;
    const { covered, others, named } = correctionCoverage(group, data);
    const token = domToken(group.id);
    const left = waiting.length - covered.length;
    return el('div', { id: `sign-correction-${token}`, class: 'resign-footer' }, [
      el('p', { class: 'hint' }, [`Signing says: “${statement}”`]),
      left ? el('p', { class: 'hint' }, [
        `${pluralize(left, 'page')} here ${left === 1 ? 'was' : 'were'} also changed by `
        + `${others.map(changeIdLabel).join(', ')}. Sign ${others.length === 1 ? 'that correction' : 'those corrections'} `
        + `too and ${left === 1 ? 'it is' : 'they are'} re-signed with it — or sign ${left === 1 ? 'it' : 'them'} on ${left === 1 ? 'its' : 'their'} own.`,
      ]) : null,
      el('button', {
        id: `sign-correction-button-${token}`,
        type: 'button',
        class: 'primary',
        disabled: state.pending,
        onClick: () => void pressManyPages(
          { mode: 'correction', statement, corrections: named },
          { signedCorrection: group.id },
        ),
      }, [covered.length
        ? `Sign ${changeLabel(group)} — re-signs ${pluralize(covered.length, 'page')}`
        : `Sign ${changeLabel(group)} — its pages re-sign once their other corrections are signed`]),
    ]);
  }

  function renderResignBody() {
    const view = state.changeView;
    const data = view?.data;
    const children = [el('p', { class: 'hint' }, [
      'Pages you signed whose text changed afterwards, grouped by the correction that changed '
      + 'them. Read one correction across its pages, then press “Sign this correction” once: '
      + 'it re-signs every page that correction (and any correction you already signed here) '
      + 'fully explains. You can still sign any page on its own in the usual review.',
    ])];
    if (!view || (view.status === 'loading' && !data)) {
      children.push(el('p', { class: 'hint' }, ['Finding which corrections changed these pages…']));
      return children;
    }
    if (view.status === 'error') {
      children.push(el('div', { class: 'session-notice individual' }, [
        el('p', {}, [view.message]),
        el('button', {
          id: 'resign-retry',
          type: 'button',
          class: 'quiet',
          onClick: () => void loadChangeView(),
        }, ['Try again']),
      ]));
      if (!data) return children;
    }
    if (data.partial) {
      children.push(el('p', { class: 'session-notice individual' }, [
        `${pluralize(list(data.unchecked).length, 'page')} could not be checked this time and `
        + 'are still in the queue as usual: ' + list(data.unchecked).join(', ') + '.',
      ]));
    }
    for (const group of list(data.groups)) {
      if (group && Array.isArray(group.slugs)) children.push(renderResignGroup(group, data));
    }
    const unexplained = list(data.unexplained);
    if (unexplained.length) {
      children.push(el('details', {
        id: 'resign-unexplained',
        class: 'resign-group',
        open: state.openChangeGroups.has('unexplained'),
        onToggle: event => {
          if (event.currentTarget.open) state.openChangeGroups.add('unexplained');
          else state.openChangeGroups.delete('unexplained');
        },
      }, [
        el('summary', {}, [
          el('strong', {}, ['No text change']),
          ` · ${pluralize(unexplained.length, 'page')} whose record or fingerprint scope changed`,
        ]),
        el('div', { class: 'resign-group-body' }, [
          el('p', { class: 'hint' }, [
            'No correction touched these pages’ source files after you signed. Their record '
            + '(quiz, key points, evidence) or what the fingerprint covers changed instead; '
            + 'each page shows exactly what.',
          ]),
          el('ul', { class: 'resign-pages' }, unexplained.map(slug => {
            const page = record(data.pages?.[slug]);
            const item = contentItemBySlug(slug, text(page.kind));
            const token = domToken(`unexplained-${slug}`);
            return el('li', { class: `resign-page${isDriftedItem(item) ? '' : ' settled'}` }, [
              el('div', { class: 'resign-page-line' }, [
                el('button', {
                  id: `resign-open-${token}`,
                  type: 'button',
                  class: 'quiet resign-open',
                  disabled: !item || state.pending,
                  onClick: () => openFromChangeView(item, null, `resign-open-${token}`),
                }, [item?.title || text(page.title) || slug]),
                el('span', { class: 'resign-page-status' }, [
                  !item ? 'Not in the current queue'
                    : isDriftedItem(item) ? 'Needs your signature'
                    : item.completion === 'complete' ? '✓ Re-signed' : 'Needs review',
                ]),
              ]),
              renderDiffDisclosure({
                key: diffKey(slug, ''),
                slug,
                label: 'Show what changed since you signed',
                summaryId: `resign-diff-toggle-${token}`,
                bodyId: `resign-diff-body-${token}`,
              }),
            ]);
          })),
        ]),
      ]));
    }
    const checkedAt = text(data.generatedAt);
    children.push(el('div', { class: 'resign-footer' }, [
      el('p', { class: 'hint' }, [
        `Checked against ${text(data.branch) || 'the base branch'}`
        + (checkedAt ? ` at ${checkedAt.slice(11, 16)} UTC` : '')
        + (view.status === 'loading' ? ' · checking again…' : '.'),
      ]),
      el('button', {
        id: 'resign-refresh',
        type: 'button',
        class: 'quiet',
        disabled: view.status === 'loading',
        onClick: () => {
          // "Since you signed" diffs run to the base branch head, which may have moved.
          for (const key of [...state.diffViews.keys()]) {
            if (key.endsWith('|')) state.diffViews.delete(key);
          }
          void loadChangeView();
        },
      }, ['Check again']),
    ]));
    return children;
  }

  function resignSummaryText() {
    const drifted = state.reviewItems.filter(isDriftedItem).length;
    return drifted
      ? `Re-sign by change · ${pluralize(drifted, 'page')} changed after you signed`
      : 'Re-sign by change · every changed page is re-signed';
  }

  function renderResignByChange() {
    const drifted = state.reviewItems.some(isDriftedItem);
    if (!drifted && !state.changeView?.data) return null;
    return el('details', {
      id: 'resign-by-change',
      class: 'resign-by-change',
      open: state.changeViewOpen,
      onToggle: event => {
        state.changeViewOpen = event.currentTarget.open;
        if (state.changeViewOpen && !state.changeView) void loadChangeView();
      },
    }, [
      el('summary', {}, [el('span', { id: 'resign-summary-text' }, [resignSummaryText()])]),
      el('div', { id: 'resign-body', class: 'resign-body' }, renderResignBody()),
    ]);
  }

  // Redraws the section in place (summary text and body), so a list that arrives while the
  // reviewer reads never moves the rest of the page or steals the preview's frame.
  function refreshResignByChange() {
    const summary = document.getElementById('resign-summary-text');
    const body = document.getElementById('resign-body');
    if (!summary || !body) return;
    const hadFocus = body.contains(document.activeElement);
    summary.textContent = resignSummaryText();
    body.replaceChildren(...renderResignBody());
    if (hadFocus && !body.contains(document.activeElement)) {
      (document.getElementById('resign-refresh') || document.getElementById('resign-retry'))?.focus();
    }
  }

  /* ── One press, many pages (2026-09-26) ─────────────────────────────────────────────
     The reviewer had re-read the whole library several times and was still being asked to
     re-sign it page by page: every correction wave voided signatures on text he had
     already approved. Two presses now carry many pages at once, both through the server's
     own checks (attest.mjs, commitContentBatch):
       · "Sign everything as it reads today" (baseline) — every page and tool that needs a
         signature, minus anything the reviewer unticks, plus every draft question with no
         warning. The server's preview is listed first, with what it will leave out and why.
       · "Sign this correction" — in Re-sign by change, after the correction's diffs.
     Each press sends the statement it signs verbatim; the server refuses it otherwise. */

  const WAS_LABELS = {
    pending: 'never signed',
    drifted: 'changed since you signed',
    unbound: 'signed before fingerprints',
  };

  function itemsNeedingSignature() {
    const open = state.reviewItems.filter(item => item.completion !== 'complete');
    return {
      content: open.filter(item => item.type !== 'question').length,
      questions: open.filter(item => item.type === 'question').length,
    };
  }

  function contentNoun(count) {
    return `${count} ${count === 1 ? 'page or tool' : 'pages and tools'}`;
  }

  async function loadBaselinePreview() {
    if (state.baseline?.status === 'loading') return;
    const generation = state.viewGeneration;
    state.baseline = { status: 'loading', data: state.baseline?.data || null };
    refreshBaseline();
    let next;
    try {
      const data = await viewRequest(
        { view: 'batch', mode: 'baseline' },
        'The list of items to sign could not be prepared.',
        'batch',
      );
      if (!Array.isArray(data.sign) || !Array.isArray(data.excluded) || !text(data.statement)) {
        throw new Error('The server returned an incomplete list of items to sign.');
      }
      next = { status: 'ready', data };
    } catch (error) {
      next = {
        status: 'error',
        data: null,
        message: error instanceof Error ? error.message : 'The list of items to sign could not be prepared.',
      };
    }
    if (generation !== state.viewGeneration || !state.server) return;
    state.baseline = next;
    refreshBaseline();
  }

  function baselineChosen(data) {
    return list(data?.sign).filter(item => item && !state.baselineLeftOut.has(text(item.slug)));
  }

  function renderLeftOut(entries, idKey) {
    return el('ul', { class: 'resign-pages' }, entries.map(entry => el('li', { class: 'resign-page' }, [
      el('p', {}, text(entry.title)
        ? [el('strong', {}, [text(entry.title)]), ` · ${text(entry[idKey])}`]
        : [el('strong', {}, [text(entry[idKey])])]),
      el('p', { class: 'hint' }, [text(entry.reason)]),
    ])));
  }

  function renderBaselineBody() {
    const children = [el('p', { class: 'hint' }, [
      'One press signs every page and tool that needs your signature — never signed, or changed '
      + 'since you signed — exactly as each reads right now, and attests every draft question '
      + 'that has no warning. Untick anything you have not read. Anything the site build would '
      + 'refuse is listed under “Left out” with the reason, and is not signed.',
    ])];
    const view = state.baseline;
    if (!view || (view.status === 'loading' && !view.data)) {
      children.push(el('p', { class: 'hint' }, ['Checking what needs your signature…']));
      return children;
    }
    if (view.status === 'error') {
      children.push(el('div', { class: 'session-notice individual' }, [
        el('p', {}, [view.message]),
        el('button', {
          id: 'baseline-retry',
          type: 'button',
          class: 'quiet',
          onClick: () => void loadBaselinePreview(),
        }, ['Try again']),
      ]));
      return children;
    }
    const data = view.data;
    const chosen = baselineChosen(data);
    const questions = list(data.questions?.sign);
    const leftOutPages = list(data.excluded);
    const leftOutQuestions = list(data.questions?.excluded);
    children.push(el('p', { id: 'baseline-statement', class: 'resign-progress' }, [
      'Signing says: ', el('strong', {}, [`“${text(data.statement)}”`]),
    ]));
    children.push(el('details', { id: 'baseline-sign-list', class: 'resign-group', open: true }, [
      el('summary', {}, [el('strong', {}, ['To sign']), ` · ${chosen.length} of ${contentNoun(list(data.sign).length)}`]),
      el('div', { class: 'resign-group-body' }, [
        data.sign.length ? el('ul', { class: 'resign-pages' }, data.sign.map(item => {
          const slug = text(item.slug);
          const id = `baseline-include-${domToken(slug)}`;
          return el('li', { class: 'resign-page' }, [
            el('label', { class: 'resign-page-line', for: id }, [
              el('input', {
                id,
                type: 'checkbox',
                checked: !state.baselineLeftOut.has(slug),
                disabled: state.pending,
                onChange: event => {
                  if (event.currentTarget.checked) state.baselineLeftOut.delete(slug);
                  else state.baselineLeftOut.add(slug);
                  refreshBaseline(id);
                },
              }),
              el('span', {}, [text(item.title) || slug]),
              el('span', { class: 'resign-page-status' }, [WAS_LABELS[item.was] || text(item.was)]),
            ]),
            text(item.pendingReason) ? el('p', { class: 'hint' }, [text(item.pendingReason)]) : null,
          ]);
        })) : el('p', { class: 'hint' }, ['Every page and tool is signed and current.']),
      ]),
    ]));
    if (questions.length) {
      children.push(el('details', { id: 'baseline-question-list', class: 'resign-group' }, [
        el('summary', {}, [el('strong', {}, ['Questions to attest']), ` · ${pluralize(questions.length, 'draft question')} with no warnings`]),
        el('div', { class: 'resign-group-body' }, [el('ul', { class: 'resign-pages' }, questions.map(question => el('li', { class: 'resign-page' }, [
          el('p', {}, [el('strong', {}, [text(question.id)]), ` · ${text(question.stem)}`]),
        ])))]),
      ]));
    }
    if (leftOutPages.length || leftOutQuestions.length) {
      children.push(el('details', { id: 'baseline-left-out', class: 'resign-group' }, [
        el('summary', {}, [el('strong', {}, ['Left out']), ` · ${leftOutPages.length + leftOutQuestions.length} with the reason`]),
        el('div', { class: 'resign-group-body' }, [
          leftOutPages.length ? renderLeftOut(leftOutPages, 'slug') : null,
          leftOutQuestions.length ? renderLeftOut(leftOutQuestions, 'id') : null,
        ]),
      ]));
    }
    const total = chosen.length + questions.length;
    children.push(el('div', { class: 'resign-footer' }, [
      el('button', {
        id: 'baseline-sign',
        type: 'button',
        class: 'primary',
        disabled: !total || state.pending || view.status === 'loading',
        onClick: () => void pressManyPages({
          mode: 'baseline',
          statement: text(data.statement),
          exclude: list(data.sign).map(item => text(item.slug)).filter(slug => state.baselineLeftOut.has(slug)),
        }),
      }, [total
        ? `Sign ${contentNoun(chosen.length)}${questions.length ? ` and attest ${pluralize(questions.length, 'question')}` : ''}`
        : 'Nothing to sign']),
      el('button', {
        id: 'baseline-refresh',
        type: 'button',
        class: 'quiet',
        disabled: view.status === 'loading' || state.pending,
        onClick: () => void loadBaselinePreview(),
      }, ['Check again']),
    ]));
    return children;
  }

  function baselineSummaryText() {
    const { content, questions } = itemsNeedingSignature();
    return content + questions
      ? `Sign everything as it reads today · ${contentNoun(content)} and ${pluralize(questions, 'question')} need review`
      : 'Sign everything as it reads today · nothing needs your signature';
  }

  function renderBaseline() {
    const { content, questions } = itemsNeedingSignature();
    if (!content && !questions && !state.baseline) return null;
    return el('details', {
      id: 'baseline',
      class: 'resign-by-change',
      open: state.baselineOpen,
      onToggle: event => {
        state.baselineOpen = event.currentTarget.open;
        if (state.baselineOpen && (!state.baseline || state.baseline.status === 'error')) void loadBaselinePreview();
      },
    }, [
      el('summary', {}, [el('span', { id: 'baseline-summary-text' }, [baselineSummaryText()])]),
      el('div', { id: 'baseline-body', class: 'resign-body' }, renderBaselineBody()),
    ]);
  }

  // In place, like refreshResignByChange: a checkbox or a late preview must not move the page.
  function refreshBaseline(focusId = null) {
    const summary = document.getElementById('baseline-summary-text');
    const body = document.getElementById('baseline-body');
    if (!summary || !body) return;
    summary.textContent = baselineSummaryText();
    body.replaceChildren(...renderBaselineBody());
    if (focusId) document.getElementById(focusId)?.focus();
  }

  function manyPageSummary(payload) {
    const parts = [payload.updated
      ? `Signed ${contentNoun(payload.updated)}.`
      : 'No page or tool needed signing on this press.'];
    if (payload.questions) {
      parts.push(payload.questions.error
        ? `The questions were not attested (${text(payload.questions.error.message)}).`
        : `Attested ${pluralize(payload.questions.updated || 0, 'question')}.`);
    }
    const leftOut = list(payload.excluded).length + list(payload.questions?.excluded).length;
    if (leftOut) parts.push(`${leftOut} left out, with the reason below.`);
    if (payload.facultyReview?.error) parts.push(text(payload.facultyReview.error.message));
    return parts.join(' ');
  }

  function renderManyPageReceipt() {
    const receipt = state.manyPageReceipt;
    if (!receipt) return null;
    if (receipt.error) {
      return el('div', { id: 'many-page-receipt', class: 'session-notice individual', tabindex: '-1' }, [
        el('p', {}, [receipt.error]),
      ]);
    }
    const payload = receipt.payload;
    const links = [
      ['This press on GitHub ↗', safeExternalUrl(payload.commit)],
      ['The questions on GitHub ↗', safeExternalUrl(payload.questions?.commit)],
      ['The review request ↗', safeExternalUrl(payload.pullRequest)],
    ].filter(([, href]) => href);
    const leftOutPages = list(payload.excluded);
    const leftOutQuestions = list(payload.questions?.excluded);
    return el('div', { id: 'many-page-receipt', class: 'session-notice added', tabindex: '-1' }, [
      el('p', {}, [manyPageSummary(payload)]),
      links.length ? el('p', {}, links.flatMap(([label, href], index) => [
        index ? ' · ' : null,
        el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [label]),
      ]).filter(Boolean)) : null,
      payload.pullRequestError ? el('p', { class: 'hint' }, [
        'The signatures are saved, but the review request could not be confirmed open. Use “Reopen review request” if it appears.',
      ]) : null,
      leftOutPages.length || leftOutQuestions.length ? el('details', { class: 'resign-group' }, [
        el('summary', {}, [`Left out · ${leftOutPages.length + leftOutQuestions.length}`]),
        el('div', { class: 'resign-group-body' }, [
          leftOutPages.length ? renderLeftOut(leftOutPages, 'slug') : null,
          leftOutQuestions.length ? renderLeftOut(leftOutQuestions, 'id') : null,
        ]),
      ]) : null,
    ]);
  }

  /* The one press behind both many-page controls. A dropped connection is not reported as
     "nothing happened": the server may have finished, so the queue is reloaded to show what
     is signed, and the receipt says a second press is safe (a signed, current page is never
     signed again). */
  const DROPPED_PRESS = 'network_error: The server did not answer in time, so this press may '
    + 'have finished anyway. The queue below was reloaded and shows what is signed; pressing '
    + 'again is safe — a signed, current page is never signed twice.';

  async function pressManyPages(body, { signedCorrection = null } = {}) {
    if (state.pending) return false;
    // The reload after a press resets the question editor; never at the cost of an edit.
    if (hasAnyUnsavedChanges()) {
      state.manyPageReceipt = { error: 'Save or discard the question you are editing first; this press reloads the queue.' };
      renderShell('many-page-receipt');
      announce(state.manyPageReceipt.error);
      return false;
    }
    state.pending = true;
    state.manyPageReceipt = null;
    renderShell();
    let payload = null;
    let receipt;
    try {
      const response = await fetchImpl(API, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify({ target: 'content', ...body }),
      });
      payload = await responseJson(response);
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        renderLogin('Key not accepted. Enter the faculty key and try again.');
        return false;
      }
      if (response.ok && payload?.ok === true) receipt = { payload };
      // A 5xx this server did not write (a gateway timeout) says nothing about what happened;
      // every failure the function itself reports carries an error code, and means nothing
      // was signed (the rows are one atomic write, and what follows it never throws).
      else if (response.status >= 500 && !payload?.error) receipt = { error: DROPPED_PRESS };
      else receipt = { error: stableResponseMessage(payload, 'Nothing was signed.') };
    } catch {
      receipt = { error: DROPPED_PRESS };
    }
    if (receipt.payload && signedCorrection) state.correctionsSigned.add(signedCorrection);
    state.manyPageReceipt = receipt;
    // Whatever happened, the preview described a queue that may no longer exist.
    state.baseline = null;
    const reloaded = await load({ silent: true, focusId: 'many-page-receipt' });
    if (state.baselineOpen) void loadBaselinePreview();
    announce(receipt.payload ? manyPageSummary(receipt.payload) : receipt.error);
    return reloaded && Boolean(receipt.payload);
  }

  /* Case-of-the-Week twin (2026-09). Names the partner page and offers one hop to it.
     Deliberately NOT an "attest both" control: one press attests one slug, and pairing
     the two into a single affirmation would be a governance change nobody has made. */
  function renderTwinContext(item) {
    const twin = twinOf(item, state.reviewItems);
    if (!twin) return null;
    return el('div', { id: 'attestation-twin', class: 'twin-context' }, [
      el('p', {}, [
        el('strong', {}, ['Twin: ']),
        `${twin.title} · ${twin.completion === 'complete' ? 'Reviewed' : 'Needs review'}`,
      ]),
      el('button', {
        id: 'go-to-twin',
        class: 'quiet',
        type: 'button',
        disabled: state.pending,
        onClick: () => requestNavigation(
          { kind: 'review', key: twin.key, focusId: 'go-to-twin' },
          'go-to-twin',
        ),
      }, ['Go to twin']),
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
    const reviewComplete = reviewPathComplete(item);
    const eligibility = currentAttestationEligibility(item, assessment, dirty);
    const oneClick = oneClickAvailable(item);
    // Questions take the same one-press treatment as pages and tools (2026-08-13):
    // the three faculty confirmations are recorded by the press and stated in the
    // label. Unlike content's oneClickAvailable there is no preview-ready condition
    // here, because for a question the preview IS the review path — a failed preview
    // already blocks eligibility through review.live_unavailable_ack_required and
    // review.saved_revision_required, both of which stay unassumed.
    const questionOneClick = item.type === 'question';
    const oneClickEligibility = oneClick || questionOneClick
      ? currentAttestationEligibility(item, assessment, dirty, { assumeHumanChecks: true })
      : eligibility;
    const currentStep = dirty || !reviewComplete
      ? 'review'
      : item.completion === 'complete'
        ? 'confirm'
        : !question && contentChecksComplete()
          ? 'confirm'
          : 'resolve';
    return el('aside', {
      id: 'attestation-rail',
      class: 'signoff-rail',
      'aria-labelledby': 'attestation-rail-title',
    }, [
      el('header', { class: 'rail-heading' }, [
        el('p', { class: 'eyebrow' }, ['Single-item sign-off']),
        el('h2', { id: 'attestation-rail-title' }, ['Review → Resolve → Confirm']),
      ]),
      renderTwinContext(item),
      renderRiskContext(item),
      renderStaleNotice(item),
      renderResignGroupProgress(item),
      renderChangesSinceSigned(item),
      renderPendingReason(item),
      renderActionFeedback(item),
      el('section', {
        id: 'rail-step-review',
        class: `rail-step${currentStep === 'review' ? ' current' : ''}`,
      }, [
        el('h3', {}, ['Review']),
        el('p', {}, [item.type === 'question'
          ? 'Inspect the learner view, saved Draft, and governed question fields.'
          : 'Inspect the complete learner-facing page or tool.']),
        renderReviewPath(item),
      ]),
      el('section', {
        id: 'rail-step-resolve',
        class: `rail-step${currentStep === 'resolve' ? ' current' : ''}`,
      }, [
        el('h3', {}, ['Resolve']),
        question
          ? renderQuestionResolution(assessment, blocked || state.pending)
          : renderContentChecks(item),
      ]),
      el('section', {
        id: 'rail-step-confirm',
        class: `rail-step${currentStep === 'confirm' ? ' current' : ''}`,
      }, [
        el('h3', {}, ['Confirm']),
        el('p', { class: 'reviewer-confirmation' }, [
          'Reviewer: ',
          el('strong', { id: 'current-reviewer-label' }, [state.reviewerLabel || 'Not provided']),
        ]),
        question ? renderConfirmations(blocked || state.pending || !reviewComplete) : el('p', { class: 'muted' }, [
          item.completion === 'complete'
            ? 'This item is recorded as reviewed. Reopen it only when another review is needed.'
            : oneClick
            ? 'One click records all three confirmations above and moves to the next item. '
              + 'Tick them individually instead if you want to record them one at a time.'
            : reviewComplete
            ? 'The learner surface review is recorded. Complete both content checks to continue.'
            : 'Record the learner surface review before confirming this item.',
        ]),
        question ? el('button', {
          id: 'attest-current-item',
          class: 'primary rail-action',
          type: 'button',
          disabled: state.pending || !oneClickEligibility.eligible,
          onClick: () => void attestQuestionInOneClick(findQuestion(item.identity)),
        }, [`Attest this question — ${CONFIRMATION_SUMMARY}`]) : item.completion === 'complete'
          ? renderContentMoreActions(item)
          : el('button', {
          id: 'attest-current-item',
          class: 'primary rail-action',
          type: 'button',
          // The label carries the assertions, so one press still means all three.
          'aria-keyshortcuts': oneClick ? 'a' : null,
          disabled: state.pending || !(oneClick ? oneClickEligibility.eligible : eligibility.eligible),
          onClick: () => void (oneClick ? attestContentInOneClick(item) : attestContentItem(item)),
        }, [oneClick
          ? `Attest this ${item.type} — reviewed · accurate for ${audienceShortLabel(item.sites)} · links tested`
          : `Attest this ${item.type}`]),
      ]),
      question ? renderBatchTray() : null,
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

  /* "Attest this page" bookmarklet (2026-09). Rendered only in the unlocked console,
     from THIS console's own origin, so a Netlify preview deploy hands out a bookmarklet
     that points at that preview rather than production. The link is for dragging to a
     bookmarks bar, not for clicking here — clicking it in place would only reopen the
     console — so the click is swallowed and the disclosure says what to do with it. */
  function renderBookmarkletDisclosure() {
    let bookmarklet;
    try {
      bookmarklet = buildBookmarklet(window.location.origin);
    } catch {
      return null;
    }
    const source = el('textarea', {
      id: 'bookmarklet-source',
      class: 'data-text',
      rows: '3',
      readOnly: true,
      'aria-label': 'Bookmarklet address to copy',
    });
    source.value = bookmarklet;
    return el('details', {
      id: 'bookmarklet-disclosure',
      class: 'bookmarklet-disclosure',
    }, [
      el('summary', {}, ['Review from the learner site']),
      el('div', { class: 'bookmarklet-body' }, [
        el('p', { class: 'hint' }, [
          'Drag this link to your bookmarks bar once. Then, on any learner page, click it '
          + 'to open that exact page or tool here for review. A learner view with no '
          + 'page or tool in its address opens this console\u2019s queue instead \u2014 '
          + 'it never guesses which item you meant.',
        ]),
        el('a', {
          id: 'attest-this-page-bookmarklet',
          class: 'bookmarklet-link',
          href: bookmarklet,
          draggable: 'true',
          onClick: event => {
            event.preventDefault();
            announce('Drag this link to your bookmarks bar, then click it from a learner page.');
          },
        }, ['Attest this page']),
        el('p', { class: 'hint' }, ['On a phone or tablet, copy the address instead:']),
        source,
      ]),
    ]);
  }

  function renderShell(focusTarget = null) {
    if (!state.server) return;
    renderedIssueRecords = [];
    document.title = 'Faculty attestation workspace';
    // Read-only: attribution comes from the server (ATTESTER_NAME), never the browser.
    const reviewer = el('p', {
      id: 'reviewer-label',
      class: 'reviewer-value',
    }, [state.reviewerLabel || 'Not provided']);

    const item = currentReviewItem();
    const modal = renderNavigationGuard() || renderReopenConfirmation();
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
      (() => {
        const syncNotice = branchSyncNotice(state.server?.branchSync);
        if (!syncNotice) return null;
        return el('div', {
          id: 'branch-sync-notice',
          class: `session-notice branch-sync ${syncNotice.tone}`,
          role: syncNotice.tone === 'alert' ? 'alert' : null,
        }, [
          el('p', {}, [syncNotice.message]),
          syncNotice.href ? el('a', {
            href: syncNotice.href,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, ['Open the rolling pull request']) : null,
          syncNotice.action === 'ensure-pr' ? el('button', {
            id: 'reopen-review-request',
            class: 'quiet',
            type: 'button',
            disabled: state.pending === true,
            onClick: () => void reopenReviewRequest(),
          }, ['Reopen review request']) : null,
        ]);
      })(),
      (() => {
        const shippedNotice = shippedPagesNotice(state.server);
        if (!shippedNotice) return null;
        return el('div', {
          id: 'shipped-pages-notice',
          class: `session-notice branch-sync ${shippedNotice.tone}`,
        }, [el('p', {}, [shippedNotice.message])]);
      })(),
      (() => {
        const lagNotice = branchLagNotice(state.server);
        if (!lagNotice) return null;
        return el('div', {
          id: 'branch-lag-notice',
          class: `session-notice branch-sync ${lagNotice.tone}`,
          role: 'alert',
        }, [el('p', {}, [lagNotice.message])]);
      })(),
      (() => {
        const staleness = freshnessNotice(state.server);
        if (!staleness) return null;
        return el('div', {
          id: 'freshness-notice',
          class: `session-notice branch-sync ${staleness.tone}`,
        }, [el('p', {}, [staleness.message])]);
      })(),
      el('section', { class: 'reviewer-strip', 'aria-label': 'Reviewer context' }, [
        el('div', { class: 'field' }, [
          el('p', { class: 'reviewer-heading' }, ['Reviewer']),
          reviewer,
        ]),
        el('p', { class: 'reviewer-note' }, [
          'Attribution is configured server-side (ATTESTER_NAME) and cannot be edited in the browser.',
        ]),
        renderBookmarkletDisclosure(),
      ]),
      renderSharedQueueStrip(visibleReviewItems()),
      renderItemHeader(item),
      renderWorkspace(item),
    ]);
    replaceApp(background, ...(modal ? [modal] : []));
    installCurrentPreviewFrame();
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
    if (visible.some(item => item.key === state.selectedKey)) {
      state.completedHoldKey = null;
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

  function renderSessionStatus() {
    const enrollment = state.batchEnrollmentFeedback;
    const reviewRequestWarnings = state.sessionActions.filter(action => action.pullRequestError).length;
    const enrollmentCopy = enrollment ? {
      added: `${enrollment.id} was added to this batch when its saved-revision receipt was recorded.`,
      removed: `${enrollment.id} was removed from this batch. Its review receipt is still saved for this sitting.`,
      excluded: `${enrollment.id} was reviewed and remains excluded from this batch.`,
      individual: `${enrollment.id} holds a review receipt but requires individual attestation because it has warnings.`,
      blocked: `${enrollment.id} holds a review receipt but is not eligible for a batch until its blockers are resolved.`,
    }[enrollment.status] || '' : '';
    return el('section', {
      id: 'review-session-status',
      class: 'session-status',
      'aria-label': 'Current review sitting',
    }, [
      el('p', { class: 'session-counts' }, [
        el('strong', {}, ['Review sitting']),
        ` · ${state.reviewedRevisions.size} saved-draft receipt${state.reviewedRevisions.size === 1 ? '' : 's'}`,
        ` · ${state.batchSelection.size} selected for batch`,
      ]),
      enrollmentCopy ? el('div', {
        id: 'batch-enrollment-feedback',
        class: `session-notice ${enrollment.status}`,
        tabindex: '-1',
      }, [
        el('p', {}, [enrollmentCopy]),
        enrollment.status === 'added' ? el('button', {
          id: 'undo-batch-enrollment',
          type: 'button',
          class: 'quiet',
          disabled: state.pending,
          onClick: () => {
            toggleBatchMember(enrollment.id, false, null);
            refreshSessionStatus('batch-enrollment-feedback');
            announce(`${enrollment.id} was removed from the batch. Its review receipt remains recorded.`);
          },
        }, ['Undo batch selection']) : null,
      ]) : null,
      state.reviewResetNotice ? el('p', {
        id: 'review-reset-notice',
        class: 'session-notice reset',
      }, [state.reviewResetNotice]) : null,
      state.sessionActions.length ? el('details', {
        id: 'session-action-ledger',
        class: 'session-action-ledger',
      }, [
        el('summary', {}, [
          `This session · ${state.sessionActions.length} confirmed repository action${state.sessionActions.length === 1 ? '' : 's'}`,
          reviewRequestWarnings
            ? ` · ${reviewRequestWarnings} review-request warning${reviewRequestWarnings === 1 ? '' : 's'}`
            : null,
        ]),
        el('ul', {}, state.sessionActions.map(action => el('li', {}, [
          action.message,
          action.commitUrl ? ' ' : null,
          action.commitUrl ? el('a', {
            href: action.commitUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, ['View commit ↗']) : null,
          action.pullRequestUrl ? ' ' : null,
          action.pullRequestUrl ? el('a', {
            href: action.pullRequestUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, ['View rolling PR ↗']) : null,
          action.pullRequestError ? ' ' : null,
          action.pullRequestError ? el('span', {
            class: 'session-delivery-warning',
          }, [ROLLING_PR_WARNING]) : null,
        ]))),
      ]) : null,
    ]);
  }

  function refreshSessionStatus(focusTarget = null) {
    const current = document.getElementById('review-session-status');
    if (!current) return;
    const replacement = renderSessionStatus();
    current.replaceChildren(...replacement.children);
    focusRequested(focusTarget);
  }

  /* Copies the current ?item= link. The link carries an item key and nothing else
     (buildDeepLink strips the query), so there is no secret to leak into a clipboard. */
  async function copyDeepLink() {
    const item = currentReviewItem();
    if (!item) return;
    let link;
    try {
      link = buildDeepLink(window.location.href, item);
    } catch {
      announce('This item has no shareable link.');
      return;
    }
    try {
      await window.navigator.clipboard.writeText(link);
      announce(`Copied a link to ${item.title}.`);
    } catch {
      announce('The clipboard is unavailable. The address bar already holds this link.');
    }
  }

  function renderSharedQueueStrip(items, { questionFiltersOpen = false } = {}) {
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
    // Whole-queue outstanding work, independent of the active filters: what still needs
    // a faculty judgement, by kind. The per-filter tally stays in #review-queue-counts.
    const outstanding = deriveReviewCounts(
      filterReviewItems(state.reviewItems, { status: 'needs-review' }),
    );
    const plural = (value, noun) => `${value} ${noun}${value === 1 ? '' : 's'}`;
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
    }, [`${itemTypeLabel(item.type)} · ${item.title}${item.essential ? ' · Essentials' : ''} · ${savedStatusLabel(item)}`])) : [
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
        el('div', { class: 'queue-selector-cell' }, [
          labeledControl('Review item', 'review-item-selector', selector, 'queue-selector'),
          el('button', {
            id: 'copy-item-link',
            class: 'quiet',
            type: 'button',
            disabled: !state.selectedKey || state.pending,
            onClick: () => void copyDeepLink(),
          }, ['Copy link']),
        ]),
      ]),
      el('div', { class: 'queue-summary' }, [
        el('p', { id: 'review-pending-summary' }, [
          `${plural(outstanding.page, 'page')} · ${plural(outstanding.tool, 'tool')} · `
          + `${plural(outstanding.question, 'question')} need review`,
        ]),
        state.deepLinkNotice
          ? el('p', { id: 'deep-link-notice', class: 'deep-link-notice' }, [state.deepLinkNotice])
          : null,
      ]),
      renderManyPageReceipt(),
      renderBaseline(),
      renderResignByChange(),
      renderSessionStatus(),
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
          `${counts.total} shown · ${counts.needsReview} need review · ${counts.complete} complete`
          + (counts.essentialTotal
            ? ` · ${counts.essentialNeedsReview} of ${counts.essentialTotal} Essentials need review`
            : ''),
        ]),
      ]),
      el('details', {
        id: 'question-filter-disclosure',
        class: 'question-filter-disclosure',
        open: questionFiltersOpen,
      }, [
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
    const disclosure = document.getElementById('question-filter-disclosure');
    const replacement = renderSharedQueueStrip(visibleReviewItems(), {
      questionFiltersOpen: disclosure?.open === true,
    });
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

  function refreshPreviewChromeAndRail(focusTarget = null) {
    const item = currentReviewItem();
    const background = document.getElementById('console-background');
    if (background) {
      if (state.pending) {
        background.setAttribute('inert', '');
        background.setAttribute('aria-busy', 'true');
      } else {
        background.removeAttribute('aria-busy');
        if (!state.navigationGuard && !state.reopenConfirmation) {
          background.removeAttribute('inert');
        }
      }
    }
    const statusSlot = document.getElementById('preview-status-slot');
    if (statusSlot && item) {
      const replacement = renderPreviewStatusSlot(item);
      statusSlot.replaceChildren(...replacement.children);
    }
    const rail = document.getElementById('attestation-rail');
    if (rail) {
      const replacement = renderAttestationRail(item);
      rail.replaceChildren(...replacement.children);
    }
    refreshSessionStatus();
    applyIssueAssociations(renderedIssueRecords);
    focusRequested(focusTarget);
  }

  function refreshQuestionEditDraftAndRail(focusTarget = null) {
    const item = currentReviewItem();
    if (item?.type !== 'question') return;
    renderedIssueRecords = [];
    const draftPane = document.getElementById('question-view-draft');
    if (draftPane) draftPane.replaceChildren(renderDraftPreview(state.editor || item.record));
    const editPane = document.getElementById('question-view-edit');
    if (editPane) editPane.replaceChildren(renderQuestionEditor(item.record));
    const rail = document.getElementById('attestation-rail');
    if (rail) {
      const replacement = renderAttestationRail(item);
      rail.replaceChildren(...replacement.children);
    }
    refreshSessionStatus();
    applyIssueAssociations(renderedIssueRecords);
    focusRequested(focusTarget);
  }

  function confirmationsComplete() {
    return state.confirmations.clinical === true
      && state.confirmations.evidence === true
      && state.confirmations.originalityAndNoPhi === true;
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
    state.reviewChecks = emptyReviewChecks();
    resetApprovalInputs();
    state.qbankMessage = '';
    state.qbankCommitUrl = null;
    state.qbankError = '';
    state.conflict = null;
    refreshEditorState();
    refreshQuestionEditDraftAndRail(focusId);
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

  function renderActionFeedback(item) {
    const contentActionSucceeded = /^(?:Attested |Reopened )/.test(state.contentMessage);
    const contentActionPending = state.contentMessage === 'Saving this content review…';
    const showContentFeedback = Boolean(item && state.contentFeedbackKey === item.key);
    const showQbankFeedback = item?.type === 'question'
      && state.qbankFeedbackIds.has(item.identity);
    return el('div', { class: 'action-feedback' }, [
      showContentFeedback && state.contentMessage ? el('section', {
        id: 'content-action-result',
        class: contentActionSucceeded || contentActionPending ? 'action-result' : 'action-error',
        role: contentActionSucceeded || contentActionPending ? null : 'alert',
        tabindex: '-1',
      }, [
        state.contentMessage,
        state.contentCommitUrl ? ' ' : null,
        state.contentCommitUrl ? el('a', {
          href: state.contentCommitUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, ['View commit ↗']) : null,
      ]) : null,
      showQbankFeedback && state.qbankMessage ? el('section', {
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
      showQbankFeedback && state.qbankError ? el('section', {
        id: 'qbank-action-error',
        class: 'action-error',
        role: 'alert',
        tabindex: '-1',
      }, [state.qbankError]) : null,
      showQbankFeedback && state.conflict ? el('section', {
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
    if (!savesQuestion) {
      announce('No unsaved question changes to save.');
      return false;
    }
    if (savesQuestion && list(state.localAssessment?.blockers).length > 0) {
      announce('Resolve structural blockers before saving this draft.');
      return false;
    }
    state.navigationAfterSave = guard.target;
    state.navigationGuard = null;
    void saveCurrentDraft();
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
        }, ['Save draft']),
        el('button', {
          id: 'unsaved-discard',
          type: 'button',
          disabled: state.pending,
          onClick: () => {
            state.navigationGuard = null;
            state.editor = clone(state.original);
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

  function dismissReopenConfirmation(focusId = 'reopen-content-review') {
    state.reopenConfirmation = null;
    document.getElementById('reopen-confirmation')?.remove();
    const background = document.getElementById('console-background');
    if (background && !state.pending) background.removeAttribute('inert');
    focusRequested(focusId);
  }

  function openReopenConfirmation(item) {
    const current = findReviewItem(item?.key);
    if (state.pending || !current || !['page', 'tool'].includes(current.type)
        || current.completion !== 'complete') return false;
    // A reason left over from a DIFFERENT item must never pre-fill and silently
    // attach to this one — that would write the wrong reason into exactly the
    // governance audit trail this feature exists to keep honest. Keyed rather than
    // an unconditional reset so a reason survives re-opening the SAME item after an
    // authentication retry or network failure, per this task's own requirement.
    if (state.reopenReasonKey !== current.key) state.reopenReason = '';
    state.reopenReasonKey = current.key;
    state.reopenConfirmation = freezeSnapshot({ key: current.key, reviewed: false });
    const background = document.getElementById('console-background');
    const modal = renderReopenConfirmation();
    if (!background || !modal) {
      state.reopenConfirmation = null;
      return false;
    }
    document.getElementById('reopen-confirmation')?.remove();
    background.setAttribute('inert', '');
    app.appendChild(modal);
    modal.focus();
    return true;
  }

  function confirmReopenReview() {
    const snapshot = state.reopenConfirmation;
    const item = findReviewItem(snapshot?.key);
    if (!snapshot || snapshot.reviewed !== false || !item
        || !isValidReopenReason(state.reopenReason)) {
      dismissReopenConfirmation();
      return false;
    }
    dismissReopenConfirmation(null);
    void commitCurrentContent(item, snapshot.reviewed);
    return true;
  }

  function refreshReopenConfirmation(focusTarget = null) {
    const current = document.getElementById('reopen-confirmation');
    if (!current) return;
    const replacement = renderReopenConfirmation();
    if (!replacement) return;
    current.replaceChildren(...replacement.children);
    focusRequested(focusTarget);
  }

  function renderReopenConfirmation() {
    const snapshot = state.reopenConfirmation;
    const item = findReviewItem(snapshot?.key);
    if (!snapshot || snapshot.reviewed !== false || !item) return null;
    const cancel = () => dismissReopenConfirmation();
    return el('section', {
      id: 'reopen-confirmation',
      class: 'modal-panel guard-panel',
      role: 'alertdialog',
      tabindex: '-1',
      'aria-modal': 'true',
      'aria-labelledby': 'reopen-confirmation-title',
      onKeydown: event => modalKeydown(
        event,
        ['reopen-reason', 'confirm-reopen-review', 'cancel-reopen-review'],
        cancel,
      ),
    }, [
      el('h3', { id: 'reopen-confirmation-title' }, ['Reopen this review?']),
      el('p', {}, [
        `${item.title} will return to Needs review. This changes only ${item.identity}.`,
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'reopen-reason' }, ['Reason for reopening']),
        el('textarea', {
          id: 'reopen-reason',
          rows: '3',
          required: true,
          maxlength: '240',
          disabled: state.pending,
          value: state.reopenReason,
          'aria-describedby': 'reopen-reason-hint',
          onInput: event => {
            state.reopenReason = event.target.value;
            refreshReopenConfirmation(editorFocusState(event.target));
          },
        }),
        el('p', { id: 'reopen-reason-hint', class: 'hint' }, ['1–240 characters.']),
      ]),
      el('div', { class: 'guard-actions' }, [
        el('button', {
          id: 'confirm-reopen-review',
          class: 'primary',
          type: 'button',
          disabled: state.pending || !isValidReopenReason(state.reopenReason),
          onClick: confirmReopenReview,
        }, ['Confirm reopen']),
        el('button', {
          id: 'cancel-reopen-review',
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
              refreshAttestationRail(id);
            },
          }),
          copy,
        ]);
      }),
      el('p', { class: 'hint', id: 'confirmations-one-press-hint' }, [
        'One press of Attest records all three. Tick them individually instead if you '
        + 'want to record them one at a time.',
      ]),
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

  function renderQuestionEditor() {
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
            clearReviewAcknowledgements();
            resetApprovalInputs();
            refreshEditorState();
            state.qbankError = '';
            state.conflict = null;
            refreshQuestionEditDraftAndRail('question-stem');
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

  function contentMutationSnapshot(item, reviewed) {
    if (!item || !['page', 'tool'].includes(item.type) || typeof reviewed !== 'boolean') {
      throw new TypeError('Invalid content review mutation.');
    }
    return freezeSnapshot({
      key: item.key,
      reviewed,
      body: {
        target: 'content',
        changes: { [item.identity]: reviewed },
        reasons: reviewed ? {} : { [item.identity]: state.reopenReason.trim() },
      },
    });
  }

  async function attestContentItem(item) {
    const current = currentReviewItem();
    const eligibility = currentAttestationEligibility(item, null, false);
    if (!current || current.key !== item?.key || !eligibility.eligible || state.pending) {
      announce('Complete the current learner review and content checks before attesting this item.');
      return false;
    }
    return commitCurrentContent(item, true);
  }

  async function commitCurrentContent(item, reviewed, retrySnapshot = null) {
    let snapshot = retrySnapshot;
    if (!snapshot) {
      if (state.pending) return false;
      snapshot = contentMutationSnapshot(item, reviewed);
    }
    state.contentFeedbackKey = snapshot.key;
    state.pending = true;
    state.contentMessage = 'Saving this content review…';
    state.contentCommitUrl = null;
    refreshPreviewChromeAndRail('content-action-result');
    try {
      const response = await fetchImpl(API, {
        method: 'POST', headers: apiHeaders(true),
        body: JSON.stringify(snapshot.body),
      });
      const payload = await responseJson(response);
      if (response.status === 401) {
        clearKey();
        state.pending = false;
        state.reauthAction = {
          kind: 'content.attest',
          retry: () => commitCurrentContent(null, null, snapshot),
        };
        renderLogin('Key not accepted. Your exact one-item review is retained; enter the faculty key to retry.');
        return false;
      }
      state.reauthAction = null;
      if (!response.ok || payload.updated !== 1) {
        throw new Error(responseMessage(payload, 'This content review was not saved.'));
      }
      const commitUrl = safeExternalUrl(payload.commit);
      if (payload.commit && !commitUrl) throw new Error('invalid_response: Commit receipt was not a safe HTTPS URL.');
      const slug = snapshot.body.changes && Object.keys(snapshot.body.changes)[0];
      const expectedStatus = snapshot.reviewed ? 'reviewed' : 'unreviewed';
      const refreshed = await load({
        silent: true,
        focusId: 'content-action-result',
        expectedContentStatus: { slug, status: expectedStatus },
        preserveOnError: true,
        errorScope: 'content',
      });
      if (!refreshed) return false;
      state.contentMessage = snapshot.reviewed
        ? `Attested ${slug}.`
        : `Reopened ${slug} for review.`;
      state.contentCommitUrl = commitUrl;
      const delivery = repositoryDelivery(payload);
      recordSessionAction({
        key: snapshot.key,
        message: state.contentMessage,
        commitUrl,
        ...delivery,
      });
      if (snapshot.reviewed) {
        // load() above already auto-advanced past snapshot.key and cleared the hold
        // when another pending content item existed in this filter, so only reassert
        // the hold here when the selection is still sitting on the just-attested item
        // — otherwise a completed advance would be re-pinned back to a key that is no
        // longer selected.
        if (state.selectedKey === snapshot.key) state.completedHoldKey = snapshot.key;
      } else {
        // Only on a CONFIRMED save: an authentication retry or network failure must
        // still have the reason available to resubmit, so nothing clears it there.
        state.reopenReason = '';
        state.reopenReasonKey = null;
      }
      resetApprovalInputs();
      refreshPreviewChromeAndRail('content-action-result');
      const next = document.getElementById('next-review-item');
      // Auto-advance (2026-08-12 efficiency pass): load() above already moved on to
      // the next pending content item when one existed in this filter, clearing the
      // hold as it went. When none remain, the attested item is held instead so its
      // confirmation and commit link stay on screen — that receipt is the only proof
      // the write landed, and skipping past it would recreate the silent-failure risk
      // this hold exists to prevent. Next is focused whenever it is live, so any
      // further move — onto the item just advanced to, or past a held one — is one
      // Enter either way.
      if (snapshot.reviewed && next && !next.disabled) next.focus();
      else document.getElementById('content-action-result')?.focus();
      const resetAnnouncement = state.reviewResetAnnouncement;
      state.reviewResetAnnouncement = '';
      announce([
        state.contentMessage,
        resetAnnouncement,
        delivery.pullRequestError ? ROLLING_PR_WARNING : '',
      ].filter(Boolean).join(' '));
      return true;
    } catch (error) {
      state.pending = false;
      state.reauthAction = null;
      state.contentMessage = error instanceof Error
        ? error.message : 'This content review was not saved.';
      state.contentCommitUrl = null;
      refreshPreviewChromeAndRail('content-action-result');
      announce(state.contentMessage);
      return false;
    }
  }

  function showQbankError(message) {
    state.pending = false;
    state.qbankFeedbackIds = new Set(state.selectedId ? [state.selectedId] : []);
    state.qbankError = message;
    state.qbankMessage = '';
    state.qbankCommitUrl = null;
    announce(message);
    renderShell('qbank-action-error');
  }

  function showConflict(payload) {
    invalidatePreview({ resetAttempt: true, clearApprovals: true });
    state.pending = false;
    state.qbankFeedbackIds = new Set(state.selectedId ? [state.selectedId] : []);
    state.navigationAfterSave = null;
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
          },
      });
    }
    const { id, body } = snapshot;
    state.qbankFeedbackIds = new Set([id]);
    invalidatePreview({ resetAttempt: true, clearApprovals: true });
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
      const successMessage = `Saved draft ${id}. Checks current for the refreshed repository version.`;
      const successCommitUrl = safeExternalUrl(payload.commit);
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
      state.qbankMessage = successMessage;
      state.qbankCommitUrl = successCommitUrl;
      const delivery = repositoryDelivery(payload);
      recordSessionAction({
        key: `question:${id}`,
        message: successMessage,
        commitUrl: successCommitUrl,
        ...delivery,
      });
      renderShell('qbank-action-result');
      const navigation = state.navigationAfterSave;
      state.navigationAfterSave = null;
      if (navigation) requestNavigation(navigation);
      announce(delivery.pullRequestError
        ? `${state.qbankMessage} ${ROLLING_PR_WARNING}`
        : state.qbankMessage);
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
          },
      });
    }
    invalidatePreview({ resetAttempt: true });
    const requestIds = list(snapshot.ids).map(id => text(id));
    state.qbankFeedbackIds = new Set(requestIds);
    state.pending = true;
    state.qbankError = '';
    state.qbankMessage = 'Saving and confirming this attestation…';
    state.qbankCommitUrl = null;
    state.conflict = null;
    renderShell('qbank-action-result');
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
      const successMessage = `Attested ${requestIds.length} question${requestIds.length === 1 ? '' : 's'}: ${requestIds.join(', ')}.`;
      const successCommitUrl = safeExternalUrl(payload.commit);
      const selectedId = state.selectedId;
      const selectedKey = state.selectedKey;
      const refreshed = await load({
        silent: true,
        requiredId: selectedId,
        expectedRevisions,
        expectedStatuses: Object.fromEntries(requestIds.map(id => [id, 'attested'])),
        preserveOnError: true,
        completedHoldKey: selectedKey,
      });
      if (!refreshed) {
        state.qbankMessage = '';
        state.qbankCommitUrl = null;
        renderShell('qbank-action-error');
        return false;
      }
      resetApprovalInputs();
      state.qbankMessage = successMessage;
      state.qbankCommitUrl = successCommitUrl;
      const delivery = repositoryDelivery(payload);
      recordSessionAction({
        key: requestIds.length === 1
          ? `question:${requestIds[0]}`
          : `questions:${requestIds.join(',')}`,
        message: successMessage,
        commitUrl: successCommitUrl,
        ...delivery,
      });
      renderShell();
      const next = document.getElementById('next-review-item');
      if (next && !next.disabled) next.focus();
      else document.getElementById('qbank-action-result')?.focus();
      announce(delivery.pullRequestError
        ? `${successMessage} ${ROLLING_PR_WARNING}`
        : successMessage);
      return true;
    } catch (error) {
      state.reauthAction = null;
      showQbankError(error instanceof Error
        ? `network_error: ${error.message}`
        : 'network_error: The attestation was not saved.');
      return false;
    }
  }

  async function attestCurrentQuestion(question) {
    refreshEditorState();
    const assessment = state.localAssessment;
    const current = findQuestion(question?.id);
    const item = currentReviewItem();
    if (!current || !item || item.type !== 'question'
        || item.identity !== question?.id || item.identity !== current.id
        || item.savedStatus !== current.status || item.revision !== current.revision) {
      showQbankError('attest.stale_selection: Reload before attesting this question.');
      return false;
    }
    const eligibility = deriveAttestationEligibility({
      item,
      assessment,
      dirty: state.dirtyFields.length > 0,
      previewStatus: state.preview?.status,
      retryAttempted: state.preview?.attempt > 1,
      liveReviewed: state.reviewChecks.liveReviewed,
      liveUnavailableAcknowledged: state.reviewChecks.liveUnavailableAcknowledged,
      reviewedRevision: state.reviewedRevisions.get(current.id),
      warningAcks: state.warningAcks,
      confirmations: state.confirmations,
    });
    if (!eligibility.eligible) {
      showQbankError(`attest.ineligible: ${eligibility.blockers.join(', ')}`);
      return false;
    }
    const entry = {
      id: current.id,
      revision: current.revision,
      reviewedRevision: state.reviewedRevisions.get(current.id),
    };
    if (assessment.gate === 'warning') {
      entry.acknowledgedWarnings = assessment.warnings.map(issue => issue.code);
    }
    return attestEntries([entry], [current.id]);
  }

  /* ---- Batch attestation (2026-08-04 design, sections A + B) ------------------------
     The queue is a selector, not a row list, so multi-select takes the form of a TRAY:
     a draft joins it only after the reviewer has opened it and recorded a review receipt
     at its exact current revision (state.reviewedRevisions), and only while its gate is
     'ready' — warnings force individual attestation (the server's
     attest.warning_individual_only), blocked never attests. Eligibility is re-derived
     from live state on every render, so any event that invalidates a receipt (save,
     reload, revision change) silently drops the item from the tray — a stale receipt can
     never sit quietly in a batch. */
  function batchCandidateSurvey() {
    const rows = [];
    let awaitingReceipt = 0;
    let warningHeld = 0;
    for (const question of list(state.server?.qbank)) {
      if (question?.status !== 'draft') continue;
      let gate;
      try {
        gate = currentAssessment(question)?.gate;
      } catch {
        gate = undefined;
      }
      const verdict = deriveBatchEligibility(question, {
        assessmentGate: gate,
        reviewedRevision: state.reviewedRevisions.get(question.id),
      });
      if (verdict.eligible) rows.push(question);
      else if (verdict.reasons.includes('batch.warning_individual_only')) warningHeld += 1;
      else if (verdict.reasons.includes('batch.review_receipt_required')) awaitingReceipt += 1;
    }
    return { rows, awaitingReceipt, warningHeld };
  }

  async function attestSelection() {
    const { rows } = batchCandidateSurvey();
    const eligible = new Set(rows.map(question => question.id));
    const ids = [...state.batchSelection].filter(id => eligible.has(id));
    if (!ids.length) {
      showQbankError('attest.batch_empty: Select at least one reviewed draft.');
      return false;
    }
    const entries = ids.map(id => {
      const question = findQuestion(id);
      return {
        id,
        revision: question.revision,
        reviewedRevision: state.reviewedRevisions.get(id),
      };
    });
    const ok = await attestEntries(entries, ids);
    // On conflict/failure the selection is retained on purpose (retry after reload);
    // on success the attested ids leave the tray immediately.
    if (ok) ids.forEach(id => state.batchSelection.delete(id));
    return ok;
  }

  function toggleBatchMember(id, checked, focusId) {
    if (checked) {
      state.batchExclusions.delete(id);
      state.batchSelection.add(id);
      state.batchEnrollmentFeedback = { id, status: 'added' };
    } else {
      state.batchSelection.delete(id);
      state.batchExclusions.add(id);
      state.batchEnrollmentFeedback = { id, status: 'removed' };
    }
    refreshPreviewChromeAndRail(focusId);
  }

  function renderBatchTray() {
    const { rows, awaitingReceipt, warningHeld } = batchCandidateSurvey();
    const eligibleIds = new Set(rows.map(question => question.id));
    for (const id of [...state.batchSelection]) {
      if (!eligibleIds.has(id)) state.batchSelection.delete(id);
    }
    // A sticky exclusion only needs to survive as long as there is something to exclude
    // from — an eligible row, or a receipt that could make one ready again (e.g. a gate
    // gone temporarily 'warning'). Once neither holds, the exclusion is stale; drop it so
    // batchExclusions cannot grow without bound across a long review session.
    for (const id of [...state.batchExclusions]) {
      if (!eligibleIds.has(id) && !state.reviewedRevisions.has(id)) state.batchExclusions.delete(id);
    }
    if (!rows.length && !awaitingReceipt && !warningHeld) return null;
    const selected = rows.filter(question => state.batchSelection.has(question.id));
    const batchCheck = selected.length > 0 ? assessBatch(selected) : null;
    const keySummary = batchCheck
      ? Object.entries(batchCheck.answerKeys || {})
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${key}:${count}`)
        .join(' ')
      : '';
    const categories = {};
    for (const question of selected) {
      const category = text(question.category) || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    }
    const categorySummary = Object.entries(categories)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, count]) => `${category} ×${count}`)
      .join(' · ');
    return el('section', {
      id: 'rail-step-batch',
      class: 'rail-step batch-tray',
      'aria-labelledby': 'batch-tray-title',
    }, [
      el('h3', { id: 'batch-tray-title' }, ['Attest together']),
      el('p', { class: 'muted' }, [
        'Eligible Ready drafts are added when their review receipt is recorded. Use Undo in the '
        + 'sitting strip or uncheck a draft here to remove it; warnings remain individual-only. '
        + 'Each selected item still required its own exact saved-revision receipt.',
      ]),
      rows.length ? el('ul', { class: 'batch-candidates' }, rows.map(question => {
        const checkboxId = `batch-select-${question.id}`;
        return el('li', {}, [
          el('label', { for: checkboxId, class: 'batch-candidate' }, [
            el('input', {
              id: checkboxId,
              type: 'checkbox',
              checked: state.batchSelection.has(question.id) ? true : null,
              disabled: state.pending ? true : null,
              onChange: event => toggleBatchMember(question.id, event.target.checked, checkboxId),
            }),
            ` ${question.id} · ${text(question.category) || 'uncategorized'}`,
          ]),
        ]);
      })) : el('p', { class: 'muted' }, ['No drafts hold a current review receipt yet.']),
      awaitingReceipt > 0 ? el('p', { class: 'muted batch-awaiting' }, [
        `${awaitingReceipt} other draft${awaitingReceipt === 1 ? '' : 's'} need${awaitingReceipt === 1 ? 's' : ''} `
        + 'a review receipt at the current revision before joining a batch.',
      ]) : null,
      warningHeld > 0 ? el('p', { class: 'muted batch-warning-held' }, [
        `${warningHeld} draft${warningHeld === 1 ? '' : 's'} carr${warningHeld === 1 ? 'ies' : 'y'} warnings and must be attested individually.`,
      ]) : null,
      selected.length ? el('p', { id: 'batch-readout', class: 'batch-readout' }, [
        `Selected ${selected.length}: ${categorySummary}. Answer keys ${keySummary}. `
        + (batchCheck.ok ? 'Batch checks pass.' : `Blocked: ${(batchCheck.issues || []).map(issue => issue.code).join(', ')}.`),
      ]) : null,
      // One press records the three confirmations and commits (2026-08-13). The tray's
      // gate was never the confirmations — it is the per-item receipt that put each row
      // here, plus assessBatch's cohort check — and both still stand above.
      el('button', {
        id: 'attest-selected-drafts',
        class: 'primary rail-action',
        type: 'button',
        disabled: state.pending || !selected.length
          || (batchCheck ? batchCheck.ok === false : false),
        onClick: () => void attestSelectionInOneClick(),
      }, [`Attest selection (${selected.length}) — ${CONFIRMATION_SUMMARY}`]),
    ]);
  }

  function handlePreviewStatus(event) {
    const preview = state.preview;
    if (!preview || !['loading', 'ready'].includes(preview.status)) return;
    if (!matchesPreviewStatus(event, preview.request, preview.frameWindow)) return;
    if (preview.status === 'ready' && event.data.status === 'ready') return;
    cancelPreviewTimer(preview);
    preview.status = event.data.status;
    clearReviewAcknowledgements({ preserveQuestionReceipts: event.data.status === 'ready' });
    if (event.data.status !== 'ready') applyQuestionView('live');
    announce(`Deployed ${event.data.surface} preview: ${event.data.status.replace('_', ' ')}.`);
    refreshPreviewChromeAndRail('preview-status');
  }

  window.addEventListener('message', handlePreviewStatus);

  window.addEventListener('beforeunload', event => {
    if (!hasAnyUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (state.navigationGuard) {
        if (shortcutCanSaveQuestion()) saveNavigationGuard();
        else if (hasUnsavedChanges()) announce('Open Edit question to save this draft.');
        else announce('No unsaved question changes to save.');
        return;
      }
      if (shortcutCanSaveQuestion()) saveCurrentDraft();
      else if (hasUnsavedChanges()) announce('Open Edit question to save this draft.');
      else announce('No unsaved question changes to save.');
      return;
    }

    // `R` toggles the compound review receipt (Task 1's #review-compound), copying
    // the `A` shortcut's own guard structure below verbatim — target tag checks,
    // modifier checks, an aria-keyshortcuts gate. Placed ahead of `A`'s guard: that
    // guard returns early for any non-`a` key, which would make this unreachable if
    // it came after. Self-contained (matches on `r`, falls through untouched for
    // every other key including `a` itself), so the A-shortcut below is unaffected.
    if (event.key.toLowerCase() === 'r'
      && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      const target = event.target;
      const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      const box = document.getElementById('review-compound');
      if (!box || box.disabled || box.getAttribute('aria-keyshortcuts') !== 'r') return;
      event.preventDefault();
      box.click();
      return;
    }

    // `ArrowUp`/`ArrowDown` move the review-list selection through the same order
    // the item selector renders (visibleReviewItems()). Same guard structure and
    // placement rationale as `R` above.
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp')
      && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      if (state.pending || state.navigationGuard || state.reopenConfirmation) return;
      const target = event.target;
      const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      const visible = visibleReviewItems();
      const index = visible.findIndex(item => item.key === state.selectedKey);
      const next = visible[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      requestNavigation({ kind: 'review', key: next.key, focusId: 'review-item-selector' }, 'review-item-selector');
      return;
    }

    // `A` attests the current page or tool. Only fires for the one-click
    // variant, which is the only button whose label states what is being
    // asserted — a bare keypress must never stand in for an unstated claim.
    if (event.key.toLowerCase() !== 'a'
      || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target;
    const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
    const button = document.getElementById('attest-current-item');
    if (!button || button.disabled || button.getAttribute('aria-keyshortcuts') !== 'a') return;
    event.preventDefault();
    button.click();
  });

  if (getKey()) void load();
  else renderLogin();

  return { state, load };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  startFacultyConsole({ document, window });
}
