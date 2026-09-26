/* Phone attestation client. Same origin, same key, same /api/attest function as the desktop
   console (../app.mjs). Rules come from ../review-model.mjs and ./m-model.mjs; this file is DOM
   only. Spec: docs/superpowers/specs/2026-09-26-mobile-attestation-console-design.md */
import {
  buildExternalReviewUrl, buildPreviewRequest, createReviewToken, deriveReviewCounts,
  matchesPreviewStatus, parseDeepLink, twinOf,
} from '../review-model.mjs';
import {
  applyRows, contentEligibility, diffLines, groupQueue, nextAfterSign, phoneQueue,
  questionEligibility, questionEntry, reviewReason, timeoutStatus,
} from './m-model.mjs';

const API = '/api/attest';
const KEY_STORAGE = 'fac_key';                 // identical to the desktop: one key, one tab
const PREVIEW_SANDBOX = 'allow-scripts allow-same-origin allow-forms';
const PREVIEW_TIMEOUT_MS = 10_000;
const REFRESH_QUIET_MS = 30_000;

const state = {
  server: null,        // last GET payload (items, qbank, attester, student, resident, manifestRevision…)
  changes: null,       // last ?view=changes payload, or null
  items: [],           // phoneQueue(server)
  sections: [],        // groupQueue(items, changes)
  screen: 'queue',     // 'queue' | 'item'
  selectedKey: null,
  search: '',
  preview: null,       // { request, status, frameLoaded, frameWindow, timerId, attempt }
  ui: {},              // acknowledgement flags for the selected item
  sheet: null,         // null | 'changed' | 'confirm' | 'draft'
  diff: null,          // last ?view=diff payload for the selected item
  pending: false,      // a POST is in flight
  receipt: null,       // { commit, pullRequest, pullRequestError, title }
  message: '',         // one-line error shown above the actions
  deepLink: null,      // ?item= held in memory across the key prompt
  refreshTimer: null,
  reauth: null,        // () => Promise, retried after re-entering the key
};

// ---- tiny DOM helper ---------------------------------------------------------------------
function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'text') node.textContent = String(value);
    else if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children]).flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
const app = () => document.getElementById('m-app');
function replaceApp(...children) { const root = app(); root.replaceChildren(...children); return root; }

// ---- key + api ----------------------------------------------------------------------------
function getKey() { try { return window.sessionStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } }
function setKey(value) { try { window.sessionStorage.setItem(KEY_STORAGE, value); } catch { /* private mode */ } }
function clearKey() { try { window.sessionStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ } }

function headers(withBody = false) {
  const out = { 'x-faculty-key': getKey() };
  if (withBody) out['Content-Type'] = 'application/json';
  return out;
}
async function json(response) { try { return await response.json(); } catch { return {}; } }
function errorText(payload, fallback) {
  const code = typeof payload?.error?.code === 'string' ? payload.error.code : '';
  const message = typeof payload?.error?.message === 'string' ? payload.error.message
    : typeof payload?.error === 'string' ? payload.error : fallback;
  return code ? `${code}: ${message}` : message;
}
class Unauthorized extends Error {}

/** GET/POST against /api/attest. A 401 throws Unauthorized after clearing the key. */
async function api(path, init = {}) {
  const response = await fetch(path, { ...init, headers: { ...headers(Boolean(init.body)), ...(init.headers || {}) } });
  if (response.status === 401) { clearKey(); throw new Unauthorized('Key not accepted. Check the shared faculty key and try again.'); }
  if (response.status >= 500) throw new Error('Could not reach the repository.');
  const payload = await json(response);
  if (!response.ok) throw new Error(errorText(payload, `The server answered ${response.status}.`));
  return payload;
}

// ---- load ---------------------------------------------------------------------------------
function validServerState(server) {
  return Boolean(server && Array.isArray(server.items) && Array.isArray(server.qbank)
    && typeof server.student === 'string' && typeof server.manifestRevision === 'string');
}
function recompute() {
  state.items = phoneQueue(state.server);
  state.sections = groupQueue(state.items, state.changes);
}
async function load({ silent = false } = {}) {
  // A silent refresh never repaints the key prompt: it is already up (Lock or a 401), and
  // redrawing it would wipe a half-typed key.
  if (!getKey()) { if (!silent) renderGate(); return false; }
  // Offline: report through render(), which shows the error screen when nothing has loaded and
  // reports in place over a loaded queue or item (a silent refresh must never replace them).
  if (navigator.onLine === false) { state.message = 'You are offline.'; render(); return false; }
  if (!silent) renderBusy('Loading the review queue…');
  try {
    const server = await api(API);
    if (!validServerState(server)) throw new Error('The server returned an incomplete state.');
    state.server = server;
    try { state.changes = await api(`${API}?${new URLSearchParams({ view: 'changes' })}`); }
    catch (error) { if (error instanceof Unauthorized) throw error; state.changes = null; }
    recompute();
    if (state.deepLink) {
      const target = parseDeepLink(state.deepLink, state.items);
      state.deepLink = null;
      if (target) { openItem(target.key); return true; }
      state.message = 'That item is not in the current queue.';
    }
    if (silent) refreshInPlace(); else render();
    return true;
  } catch (error) {
    if (error instanceof Unauthorized) { state.reauth = () => load(); renderGate(error.message); return false; }
    // Nothing loaded yet: say what failed and offer Retry; never fall back to a bare key prompt
    // while the key is still held. A refresh that fails over a shown queue reports in place.
    if (!state.server) { renderLoadError(error.message); return false; }
    state.message = error.message;
    render();
    return false;
  }
}
function scheduleRefresh() {
  if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => { state.refreshTimer = null; void load({ silent: true }); }, REFRESH_QUIET_MS);
}

// ---- screens ------------------------------------------------------------------------------
function bar(title, { back = false } = {}) {
  return h('header', { class: 'bar' }, [
    back ? h('button', { type: 'button', text: 'Queue', onClick: () => { closeItem(); } }) : null,
    h('h1', { text: title }),
    h('button', { type: 'button', text: 'Lock', 'aria-label': 'Lock the console', onClick: () => { clearKey(); state.server = null; renderGate(); } }),
  ]);
}

function renderGate(message = '') {
  const input = h('input', { id: 'faculty-key', type: 'password', autocomplete: 'current-password', required: true, inputmode: 'text' });
  const form = h('form', { class: 'gate', onSubmit: event => {
    event.preventDefault();
    setKey(input.value);
    const retry = state.reauth; state.reauth = null;
    void (retry ? retry() : load());
  } }, [
    h('h1', { text: 'Faculty attestation' }),
    h('p', { text: 'Enter the shared faculty key. It stays in this tab and is cleared when the tab closes.' }),
    h('label', { for: 'faculty-key', text: 'Faculty key' }),
    input,
    message ? h('p', { class: 'field-error', role: 'alert', text: message }) : null,
    h('p', {}, h('button', { class: 'btn', type: 'submit', text: 'Unlock' })),
  ]);
  replaceApp(h('div', { class: 'screen' }, form));
  input.focus();
}
function renderLoadError(message) {
  replaceApp(bar('Faculty attestation'), h('div', { class: 'screen' }, [
    h('p', { class: 'field-error summary', role: 'alert', text: message }),
    h('p', { class: 'summary' }, h('button', { class: 'btn', type: 'button', text: 'Retry', onClick: () => { void load(); } })),
  ]));
}
function renderBusy(text) { replaceApp(bar('Faculty attestation'), h('div', { class: 'screen' }, h('p', { class: 'summary', role: 'status', text }))); }

function riskPill(item) {
  const level = item.risk?.level || '';
  return level ? h('span', { class: `pill ${level}`, text: `${level} risk` }) : null;
}
function siteLabel(item) { return item.site === 'res' ? 'Residents' : 'MS3'; }

function visibleSections() {
  const term = state.search.trim().toLowerCase();
  const visible = section => ({ ...section, items: section.items.filter(i => !term || i.searchText.includes(term)) });
  return state.sections.map(visible).filter(s => s.items.length);
}

function queueRows(sections) {
  return sections.map(section => h('section', { class: 'group' }, [
    h('h2', { text: section.title }),
    h('ul', { class: 'rows' }, section.items.map(item => h('li', {}, h('a', { href: `?item=${encodeURIComponent(item.key)}`,
      onClick: event => { event.preventDefault(); openItem(item.key); } }, [
      h('div', { class: 'title', text: item.title }),
      h('div', { class: 'meta' }, [h('span', { class: 'pill', text: item.type }), h('span', { text: siteLabel(item) }), riskPill(item)]),
      h('div', { class: 'why', text: reviewReason(item) }),
    ])))),
  ]));
}

/** Re-render only the groups, so the search box (and its focus and caret) survives typing. */
/** The write's receipt: on the item screen after an advance, over the queue after the last sign. */
function receiptNode() {
  const receipt = state.receipt;
  if (!receipt) return null;
  return h('div', { class: 'receipt', 'aria-live': 'polite' }, [
    h('strong', { text: `Signed: ${receipt.title}` }), ' ',
    receipt.commit ? h('a', { href: receipt.commit, target: '_blank', rel: 'noopener noreferrer', text: 'commit' }) : null,
    receipt.pullRequest ? [' · ', h('a', { href: receipt.pullRequest, target: '_blank', rel: 'noopener noreferrer', text: 'rolling PR' })] : null,
    receipt.pullRequestError ? ' · the rolling review request needs attention' : null,
  ]);
}

function refreshQueueGroups() {
  const groups = document.getElementById('queue-groups');
  if (!groups) return;
  const sections = visibleSections();
  groups.replaceChildren(...queueRows(sections),
    ...(sections.length ? [] : [h('p', { class: 'summary', text: 'Nothing needs review.' })]));
}

function queueCountsText() {
  const counts = deriveReviewCounts(state.items);
  return `${counts.page} page${counts.page === 1 ? '' : 's'} · ${counts.tool} tool${counts.tool === 1 ? '' : 's'} · ${counts.question} question${counts.question === 1 ? '' : 's'} need review`;
}

function renderQueue() {
  const search = h('input', { type: 'search', placeholder: 'Search titles', value: state.search, 'aria-label': 'Search the queue',
    onInput: event => { state.search = event.target.value; refreshQueueGroups(); } });
  replaceApp(
    bar('Faculty attestation'),
    h('div', { class: 'screen' }, [
      h('h2', { class: 'summary', text: 'Needs review' }),
      receiptNode(),
      h('p', { id: 'queue-counts', class: 'summary', role: 'status', text: queueCountsText() }),
      state.message ? h('p', { class: 'field-error summary', role: 'alert', text: state.message }) : null,
      h('div', { class: 'search' }, search),
      h('div', { id: 'queue-groups' }),
    ]),
  );
  refreshQueueGroups();
  // The shareable link is rebuilt from the selected item only; on the queue it carries nothing.
  window.history.replaceState(null, '', window.location.pathname);
}

/**
 * A silent refresh repaints in place: on the queue only the counts line and the groups (the
 * search box keeps its focus and caret); on the item screen refreshItem() over the mounted
 * frame (renderItem() remounts only when no frame is mounted, and leaves for the queue when the
 * item has left it).
 */
function refreshInPlace() {
  if (state.screen === 'item' && state.selectedKey) { renderItem(); return; }
  const counts = document.getElementById('queue-counts');
  if (!counts || !document.getElementById('queue-groups')) { render(); return; }
  counts.textContent = queueCountsText();
  refreshQueueGroups();
}

function render() {
  if (!getKey()) { renderGate(); return; }
  // Key held but nothing loaded (e.g. the offline/online listeners on the load-error screen):
  // keep the error and Retry rather than a bare key prompt.
  if (!state.server) { renderLoadError(state.message || 'The review queue has not loaded yet.'); return; }
  if (state.screen === 'item' && state.selectedKey) { renderItem(); return; }
  renderQueue();
}

// ---- item screen (Task 4), sheets + attest (Tasks 5–6) ------------------------------------
function openItem(key) { state.selectedKey = key; state.screen = 'item'; state.ui = {}; state.sheet = null; state.diff = null; state.receipt = null; state.message = ''; beginPreview(); render(); }
// Keeps state.receipt: the last sign of a sitting reports over the queue until the next openItem.
function closeItem() { cancelPreview(); state.screen = 'queue'; state.selectedKey = null; state.sheet = null; render(); }
function selectedItem() { return state.items.find(i => i.key === state.selectedKey) || null; }
// ---- preview ------------------------------------------------------------------------------
function residentBase() { return typeof state.server?.resident === 'string' && state.server.resident ? state.server.resident : state.server?.student; }

function beginPreview() {
  cancelPreview();
  const item = selectedItem();
  if (!item) return;
  const attempt = (state.preview?.attempt || 0) + 1;
  const request = buildPreviewRequest({ studentBase: state.server.student, residentBase: residentBase(), item, reviewToken: createReviewToken(window.crypto) });
  state.preview = { request, status: 'loading', frameLoaded: false, frameWindow: null, timerId: null, attempt };
  state.preview.timerId = window.setTimeout(() => {
    const preview = state.preview;
    if (!preview || preview.status !== 'loading') return;
    preview.status = timeoutStatus(preview.frameLoaded);
    renderItem();
  }, PREVIEW_TIMEOUT_MS);
}
function cancelPreview() {
  if (state.preview?.timerId) window.clearTimeout(state.preview.timerId);
  state.preview = state.preview ? { ...state.preview, timerId: null } : null;
}
function retryPreview() { state.ui = { ...state.ui, retryAttempted: true }; beginPreview(); renderItem(); }

function handlePreviewStatus(event) {
  const preview = state.preview;
  if (!preview || !['loading', 'ready'].includes(preview.status)) return;
  if (!matchesPreviewStatus(event, preview.request, preview.frameWindow)) return;
  if (preview.status === 'ready' && event.data.status === 'ready') return;
  if (preview.timerId) window.clearTimeout(preview.timerId);
  preview.timerId = null;
  preview.status = event.data.status;
  resetAcks(event.data.status);
  renderItem();
}

const STATUS_LABEL = {
  loading: 'Loading the learner page…', ready: 'Ready', not_found: 'Not found on the learner site', error: 'The learner page reported an error',
  protocol_unavailable: 'Page loaded, but it never reported ready', frame_failure: 'The learner page did not load',
};
function previewFailed() { return ['not_found', 'error', 'protocol_unavailable', 'frame_failure'].includes(state.preview?.status); }

// ---- sheets -------------------------------------------------------------------------------
function focusSheet() {
  const el = document.querySelector('#item-sheet .sheet');
  if (el) { el.setAttribute('tabindex', '-1'); el.focus(); }
}
function openSheet(name) { state.sheet = name; renderItem(); focusSheet(); }
function closeSheet() { state.sheet = null; renderItem(); }

async function loadDiff(item) {
  let diff;
  try {
    diff = await api(`${API}?${new URLSearchParams({ view: 'diff', slug: item.identity })}`);
  } catch (error) {
    if (error instanceof Unauthorized) { state.reauth = () => { openSheet('changed'); return loadDiff(item); }; renderGate(error.message); return; }
    diff = { error: error.message };
  }
  // The reviewer may have moved to another item while this was in flight: never show one
  // item's changes on another item's sheet.
  if (state.selectedKey !== item.key) return;
  state.diff = diff;
  renderItem();
}
function safeHttps(value) { try { const u = new URL(String(value)); return u.protocol === 'https:' ? u.href : null; } catch { return null; } }

/** The desktop's context line: the correction's PR (or short sha), title and day; else the signing date. */
function diffContext(diff) {
  const commit = diff.commit && typeof diff.commit === 'object' ? diff.commit : null;
  if (!commit) return typeof diff.since === 'string' && diff.since ? h('p', { text: `Since you signed on ${diff.since}` }) : null;
  const label = Number.isSafeInteger(commit.pr) ? `#${commit.pr}` : String(commit.sha || '').slice(0, 7) || 'a change';
  const url = safeHttps(commit.url);
  const day = String(commit.date || '').slice(0, 10);   // the server sends the committer timestamp
  return h('p', {}, [
    url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: label }) : label,
    ` · ${String(commit.title || '')}${/^\d{4}-\d{2}-\d{2}$/.test(day) ? ` · ${day}` : ''}`,
  ]);
}

function sheetChanged(item) {
  if (state.diff === null) { state.diff = { loading: true }; void loadDiff(item); }
  const loading = state.diff?.loading === true;
  const ready = Boolean(state.diff) && !state.diff.error && !loading;
  // The page record (quiz, key points, evidence) is signed with the text, so its changes are
  // listed beside the files'; record entries carry the same hunk shape as a file.
  const lines = ready ? diffLines({ files: [
    ...(Array.isArray(state.diff.files) ? state.diff.files : []),
    ...(Array.isArray(state.diff.record) ? state.diff.record : []).map(c => ({ ...c, path: `Page record field ${c.key}` })),
  ] }) : [];
  const compareUrl = ready ? safeHttps(state.diff.compareUrl) : null;
  return h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'What changed since you signed' }, [
    h('h2', { text: 'What changed since you signed' }),
    ready ? diffContext(state.diff) : null,
    loading ? h('p', { text: 'Loading the changes…' }) : null,
    state.diff?.error ? h('p', { class: 'field-error', role: 'alert', text: state.diff.error }) : null,
    ready && !lines.length ? h('p', { text: "Neither this page's source files nor its record changed since you signed; its fingerprint moved for another reason." }) : null,
    // `lines` carries file / context / del / add / note kinds; a note marks a too-large, binary or truncated file.
    h('div', { class: 'lines' }, lines.map(line => h('div', { class: line.kind, text: line.text }))),
    compareUrl ? h('p', {}, h('a', { href: compareUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Open the comparison on GitHub' })) : null,
    h('p', {}, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onClick: closeSheet })),
  ]);
}

// ---- item screen --------------------------------------------------------------------------
// Mounted ONCE per open (or Retry). Re-inserting an iframe reloads it, and the second-load rule
// below would read that as frame_failure, so state changes refresh only the dynamic regions.
let mountedFor = null;   // `${item.key}#${preview.attempt}` the current DOM was mounted for

function renderItem() {
  // The key prompt is up (a 401 cleared the key, or Lock): a late timer, message or diff
  // response must never paint the item screen over it.
  if (!getKey() || !state.server) return;
  const item = selectedItem();
  if (!item) { closeItem(); return; }
  // The mounted screen was replaced (the key prompt after a 401, then the key again): the new
  // frame gets a new attempt and token, or its first load would read as a second load.
  if (mountedFor === `${item.key}#${state.preview?.attempt || 0}` && !document.getElementById('learner-frame')) beginPreview();
  const signature = `${item.key}#${state.preview?.attempt || 0}`;
  if (mountedFor !== signature || !document.getElementById('learner-frame')) mountItem(item);
  refreshItem(item);
}

function mountItem(item) {
  const preview = state.preview;
  const frame = h('iframe', { id: 'learner-frame', title: `Learner view of ${item.title}`, sandbox: PREVIEW_SANDBOX, referrerpolicy: 'no-referrer' });
  frame.addEventListener('load', () => {
    const current = state.preview;
    if (!current || current.request !== preview.request) return;      // a stale frame's event
    if (current.frameLoaded) { current.status = 'frame_failure'; refreshItem(item); return; }
    current.frameLoaded = true;
  });
  frame.addEventListener('error', () => {
    if (state.preview?.request === preview.request) { state.preview.status = 'frame_failure'; refreshItem(item); }
  });
  frame.setAttribute('src', preview.request.url);
  replaceApp(
    bar(item.title, { back: true }),
    h('div', { class: 'screen item' }, [
      h('div', { id: 'item-status', class: 'status', role: 'status' }),
      h('div', { id: 'item-twin' }),
      h('div', { id: 'item-receipt' }),
      h('div', { id: 'item-message' }),
      h('div', { class: 'frame-wrap' }, frame),
    ]),
    h('nav', { id: 'item-actions', class: 'actions', 'aria-label': 'Review actions' }),
    h('div', { id: 'item-sheet' }),
  );
  preview.frameWindow = frame.contentWindow;
  mountedFor = `${item.key}#${preview.attempt}`;
  window.history.replaceState(null, '', `${window.location.pathname}?item=${encodeURIComponent(item.key)}`);
}

function refreshItem(item) {
  const preview = state.preview;
  const twin = item.type === 'page' ? twinOf(item, state.items) : null;
  const external = item.type === 'question' ? null : buildExternalReviewUrl({ studentBase: state.server.student, residentBase: residentBase(), item });
  document.getElementById('item-status').replaceChildren(
    h('span', { class: `pill ${preview.status === 'ready' ? 'ok' : ''}`, text: STATUS_LABEL[preview.status] || preview.status }),
    h('span', { text: `${siteLabel(item)} · ${reviewReason(item)}` }),
    ...(previewFailed() ? [h('button', { type: 'button', class: 'pill', text: 'Retry', onClick: retryPreview })] : []),
  );
  document.getElementById('item-twin').replaceChildren(...(twin ? [h('p', { class: 'summary' }, [
    `Twin: ${twin.title} · ${twin.completion === 'needs-review' ? 'needs review' : 'reviewed'} `,
    h('a', { href: `?item=${encodeURIComponent(twin.key)}`, text: 'Go to twin', onClick: event => { event.preventDefault(); openItem(twin.key); } }),
  ])] : []));
  const receipt = receiptNode();
  document.getElementById('item-receipt').replaceChildren(...(receipt ? [receipt] : []));
  document.getElementById('item-message').replaceChildren(...(state.message ? [h('p', { class: 'field-error summary', role: 'alert', text: state.message })] : []));
  document.getElementById('item-actions').replaceChildren(
    item.type === 'question'
      ? h('button', { class: 'btn secondary', type: 'button', text: 'Saved draft', onClick: () => openSheet('draft') })
      : h('button', { class: 'btn secondary', type: 'button', text: 'What changed', onClick: () => openSheet('changed') }),
    external ? h('a', { class: 'btn secondary', href: external, target: '_blank', rel: 'noopener noreferrer', text: 'Open in site' }) : h('span'),
    h('button', { class: 'btn', type: 'button', text: 'Attest', disabled: state.pending || preview.status === 'loading', onClick: () => openSheet('confirm') }),
  );
  const sheet = state.sheet === 'changed' ? sheetChanged(item)
    : state.sheet === 'confirm' ? sheetConfirm(item)
    : state.sheet === 'draft' ? sheetDraft(item)
    : null;
  // Rebuilding an open sheet (a tick, a refresh) must not drop keyboard focus to the page:
  // refocus the same control by id, else the sheet itself.
  const host = document.getElementById('item-sheet');
  const focusedId = host.contains(document.activeElement) ? document.activeElement.id : null;
  host.replaceChildren(...(sheet ? [h('div', { class: 'sheet-backdrop', onClick: closeSheet }), sheet] : []));
  if (sheet && focusedId !== null) {
    const again = focusedId ? document.getElementById(focusedId) : null;
    if (again && host.contains(again)) again.focus(); else focusSheet();
  }
}

// ---- confirm + sign (pages and tools) -----------------------------------------------------
/** Eligibility reads the live preview status; state.ui holds only the reviewer's acknowledgements. */
function uiWithPreview() { return { ...state.ui, previewStatus: state.preview?.status || 'loading' }; }
/**
 * The desktop clears acknowledgements whenever the preview status changes. Kept: the Retry, and
 * the saved-draft receipt when the live question (re)reports ready — the desktop's
 * clearReviewAcknowledgements({ preserveQuestionReceipts }). Every other flag resets.
 */
function resetAcks(nextStatus) {
  const { retryAttempted, reviewedRevision } = state.ui;
  state.ui = { retryAttempted: retryAttempted === true };
  if (nextStatus === 'ready' && typeof reviewedRevision === 'string' && reviewedRevision) {
    state.ui.reviewedRevision = reviewedRevision;
  }
}
function ack(id, label, checked, onChange, { disabled = false } = {}) {
  const input = h('input', { id, type: 'checkbox', checked: checked ? true : undefined, disabled: disabled ? true : undefined,
    onChange: event => onChange(event.target.checked) });
  return h('label', { class: 'ack', for: id }, [input, h('span', { text: label })]);
}
function setUi(patch) { state.ui = { ...state.ui, ...patch }; renderItem(); }

function sheetConfirm(item) {
  if (item.type === 'question') return sheetConfirmQuestion(item);
  const failed = previewFailed();
  const ready = state.preview?.status === 'ready';
  const eligibility = contentEligibility(item, uiWithPreview());
  return h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Sign ${item.title}` }, [
    h('h2', { text: `Sign ${item.title}` }),
    h('p', { text: `As ${state.server.attester}. This signs the text as it is on main right now; if the page changes later it shows as pending again until re-signed.` }),
    failed && !state.ui.retryAttempted ? h('p', { class: 'field-error', text: 'The learner page did not report ready. Press Retry once; if it still fails, review it with Open in site and acknowledge that below.' }) : null,
    ready
      ? ack('ack-complete', 'I reviewed the complete item on this screen', state.ui.completeItemReviewed, v => setUi({ completeItemReviewed: v }))
      : ack('ack-separate', 'I reviewed it in the learner site tab', state.ui.separateTabReviewed, v => setUi({ separateTabReviewed: v }), { disabled: !state.ui.retryAttempted }),
    ack('ack-accuracy', 'Accurate and appropriate for a third-year student', state.ui.accuracy, v => setUi({ accuracy: v })),
    ack('ack-interactions', 'Links, media and interactions work', state.ui.interactions, v => setUi({ interactions: v })),
    // A sign error is shown here too: #item-message sits under the sheet's backdrop.
    state.message ? h('p', { class: 'field-error', role: 'alert', text: state.message }) : null,
    h('p', {}, h('button', { class: 'btn', type: 'button', text: state.pending ? 'Signing…' : 'Sign', disabled: !eligibility.eligible || state.pending, onClick: () => { void signContent(item); } })),
    h('p', {}, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onClick: closeSheet })),
  ]);
}
function sheetConfirmQuestion(item) {
  const warnings = item.record?.assessment?.warnings || [];
  const eligibility = questionEligibility(item, uiWithPreview());
  const failed = previewFailed();
  return h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Sign ${item.identity}` }, [
    h('h2', { text: `Sign ${item.identity}` }),
    h('p', { text: `As ${state.server.attester}. Attested questions are what learners see in the bank.` }),
    warnings.length ? h('p', { class: 'field-error', text: 'This question has warnings and cannot be attested from the phone.' }) : null,
    state.preview?.status === 'ready'
      ? ack('ack-live', 'I reviewed the live question on this screen', state.ui.liveReviewed, v => setUi({ liveReviewed: v }))
      : ack('ack-live-unavailable', 'The live question is unavailable; I reviewed the saved draft instead', state.ui.liveUnavailableAcknowledged,
        v => setUi({ liveUnavailableAcknowledged: v }), { disabled: !failed || !state.ui.retryAttempted }),
    ack('ack-revision', `I reviewed the saved draft, revision ${String(item.revision).slice(0, 12)}`, state.ui.reviewedRevision === item.revision,
      v => setUi({ reviewedRevision: v ? item.revision : '' })),
    ack('ack-clinical', 'Clinically accurate', state.ui.clinical, v => setUi({ clinical: v })),
    ack('ack-evidence', 'Evidence and rationale hold', state.ui.evidence, v => setUi({ evidence: v })),
    ack('ack-phi', 'Original wording, no patient information', state.ui.originalityAndNoPhi, v => setUi({ originalityAndNoPhi: v })),
    // A sign error is shown here too: #item-message sits under the sheet's backdrop.
    state.message ? h('p', { class: 'field-error', role: 'alert', text: state.message }) : null,
    h('p', {}, h('button', { class: 'btn', type: 'button', text: state.pending ? 'Signing…' : 'Sign',
      disabled: warnings.length > 0 || !eligibility.eligible || state.pending, onClick: () => { void signQuestion(item); } })),
    h('p', {}, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onClick: closeSheet })),
  ]);
}

/**
 * After a successful write: apply it to the loaded state, schedule a refresh, and advance only
 * when the reviewer is still on the signed item. A sign that completes after they pressed Queue,
 * opened another item or locked the console refreshes what is on screen in place and keeps the
 * receipt; it never pulls them into the next item or repaints the key prompt.
 */
function finishSign(item, update) {
  state.pending = false;
  const before = state.items; const sections = state.sections;
  if (state.server) { state.server = update(state.server); recompute(); scheduleRefresh(); }
  if (!getKey() || !state.server) return;          // the key prompt is up: leave it exactly as typed
  if (state.screen !== 'item' || state.selectedKey !== item.key) { render(); return; }
  state.sheet = null;
  const nextKey = nextAfterSign(item.key, before, sections);
  if (nextKey && state.items.some(i => i.key === nextKey)) { const receipt = state.receipt; openItem(nextKey); state.receipt = receipt; renderItem(); }
  else closeItem();   // the signed item has left the queue; its receipt shows over the queue
}

async function signContent(item) {
  if (state.pending) return;                       // idempotent while a POST is in flight
  if (!contentEligibility(item, uiWithPreview()).eligible) { state.message = 'Complete the acknowledgements before signing.'; renderItem(); return; }
  state.pending = true; state.message = ''; renderItem();
  const body = { target: 'content', changes: { [item.identity]: true }, reasons: {} };
  try {
    const payload = await api(API, { method: 'POST', body: JSON.stringify(body) });
    if (!payload?.ok || payload.updated !== 1) throw new Error(errorText(payload, 'This attestation was not saved.'));
    state.receipt = { title: item.title, commit: safeHttps(payload.commit), pullRequest: safeHttps(payload.pullRequest), pullRequestError: payload.pullRequestError === true };
    finishSign(item, server => (payload.rows && typeof payload.rows === 'object'
      ? applyRows(server, payload.rows)
      // Ledger mode or an older function: trust the 200 for this item and refresh soon.
      : applyRows(server, { [item.identity]: { status: 'reviewed', at: new Date().toISOString().slice(0, 10), by: server.attester, risk: item.risk, reason: '' } })));
  } catch (error) {
    state.pending = false;
    if (error instanceof Unauthorized) { state.reauth = () => { state.sheet = 'confirm'; return signContent(item); }; renderGate(error.message); return; }
    state.message = /github_conflict/.test(error.message) ? 'The branch moved while signing. Press Sign again.' : error.message;
    renderItem();
  }
}

// ---- questions: saved draft (read-only) + sign ------------------------------------------------
function sheetDraft(item) {
  const q = item.record || {};
  const options = Array.isArray(q.options) ? q.options : [];
  return h('div', { class: 'sheet draft', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Saved draft (not deployed)' }, [
    h('h2', { text: 'Saved draft (not deployed)' }),
    h('p', { class: 'summary', text: `${q.category || ''} · difficulty ${q.difficulty ?? '–'} · revision ${String(item.revision).slice(0, 12)}` }),
    h('h3', { text: 'Stem' }), h('p', { text: q.stem || '' }),
    h('h3', { text: 'Options' }),
    h('ol', {}, options.map(option => h('li', { class: option.c ? 'key' : '' }, [
      `${option.key}. ${option.t}`, option.c ? ' (key)' : '',
      option.trap?.note ? h('div', { class: 'summary', text: option.trap.note }) : null,
    ]))),
    q.tier2 ? [
      h('h3', { text: 'Second tier' }), h('p', { text: q.tier2.q || '' }),
      h('ol', {}, (q.tier2.options || []).map(o => h('li', { class: o.c ? 'key' : '', text: `${o.key}. ${o.t}${o.c ? ' (key)' : ''}` }))),
    ] : null,
    h('h3', { text: 'Why' }), h('p', { text: q.why || '' }),
    q.pearl ? [h('h3', { text: 'Pearl' }), h('p', { text: q.pearl })] : null,
    h('h3', { text: 'Evidence' }), h('p', { text: q.evidence || '' }),
    (q.assessment?.warnings || []).length ? h('p', { class: 'field-error', text: 'This question carries warnings; attest it on the desktop console, which records each acknowledgement.' }) : null,
    h('p', {}, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onClick: closeSheet })),
  ]);
}

async function signQuestion(item) {
  if (state.pending) return;                       // idempotent while a POST is in flight
  if (!questionEligibility(item, uiWithPreview()).eligible) { state.message = 'Complete the acknowledgements before signing.'; renderItem(); return; }
  state.pending = true; state.message = ''; renderItem();
  const body = {
    action: 'qbank.attest',
    manifestRevision: state.server.manifestRevision,
    items: [questionEntry(item, state.ui.reviewedRevision)],
    confirmations: { clinical: state.ui.clinical === true, evidence: state.ui.evidence === true, originalityAndNoPhi: state.ui.originalityAndNoPhi === true },
  };
  try {
    const payload = await api(API, { method: 'POST', body: JSON.stringify(body) });
    if (!payload?.ok || payload.updated !== 1) throw new Error(errorText(payload, 'This attestation was not saved.'));
    state.receipt = { title: item.identity, commit: safeHttps(payload.commit), pullRequest: safeHttps(payload.pullRequest), pullRequestError: payload.pullRequestError === true };
    finishSign(item, server => ({ ...server, qbank: server.qbank.map(q => (q.id === item.identity ? { ...q, status: 'attested' } : q)) }));
  } catch (error) {
    state.pending = false;
    if (error instanceof Unauthorized) { state.reauth = () => { state.sheet = 'confirm'; return signQuestion(item); }; renderGate(error.message); return; }
    state.message = /qbank\.conflict/.test(error.message) ? 'This question changed since you loaded it. Pull to refresh and review again.' : error.message;
    renderItem();
  }
}

// ---- boot ---------------------------------------------------------------------------------
state.deepLink = window.location.search.includes('item=') ? window.location.search : null;
window.addEventListener('message', handlePreviewStatus);
window.addEventListener('keydown', event => { if (event.key === 'Escape' && state.sheet) closeSheet(); });
window.addEventListener('offline', () => { state.message = 'You are offline.'; render(); });
window.addEventListener('online', () => { state.message = ''; render(); });
void load();
