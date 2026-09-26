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
  if (!getKey()) { renderGate(); return false; }
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
    render();
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
function refreshQueueGroups() {
  const groups = document.getElementById('queue-groups');
  if (!groups) return;
  const sections = visibleSections();
  groups.replaceChildren(...queueRows(sections),
    ...(sections.length ? [] : [h('p', { class: 'summary', text: 'Nothing needs review.' })]));
}

function renderQueue() {
  const counts = deriveReviewCounts(state.items);
  const search = h('input', { type: 'search', placeholder: 'Search titles', value: state.search, 'aria-label': 'Search the queue',
    onInput: event => { state.search = event.target.value; refreshQueueGroups(); } });
  replaceApp(
    bar('Faculty attestation'),
    h('div', { class: 'screen' }, [
      h('h2', { class: 'summary', text: 'Needs review' }),
      h('p', { class: 'summary', role: 'status', text: `${counts.page} page${counts.page === 1 ? '' : 's'} · ${counts.tool} tool${counts.tool === 1 ? '' : 's'} · ${counts.question} question${counts.question === 1 ? '' : 's'} need review` }),
      state.message ? h('p', { class: 'field-error summary', role: 'alert', text: state.message }) : null,
      h('div', { class: 'search' }, search),
      h('div', { id: 'queue-groups' }),
    ]),
  );
  refreshQueueGroups();
  // The shareable link is rebuilt from the selected item only; on the queue it carries nothing.
  window.history.replaceState(null, '', window.location.pathname);
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
  renderItem();
}

const STATUS_LABEL = {
  loading: 'Loading the learner page…', ready: 'Ready', not_found: 'Not found on the learner site', error: 'The learner page reported an error',
  protocol_unavailable: 'Page loaded, but it never reported ready', frame_failure: 'The learner page did not load',
};
function previewFailed() { return ['not_found', 'error', 'protocol_unavailable', 'frame_failure'].includes(state.preview?.status); }

// ---- sheets -------------------------------------------------------------------------------
function openSheet(name) { state.sheet = name; renderItem(); }
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
    ready && !lines.length ? h('p', { text: 'No text change was recorded; the record or its fingerprint scope moved.' }) : null,
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
  document.getElementById('item-receipt').replaceChildren(...(state.receipt ? [h('div', { class: 'receipt', role: 'status' }, [
    h('strong', { text: `Signed: ${state.receipt.title}` }), ' ',
    state.receipt.commit ? h('a', { href: state.receipt.commit, target: '_blank', rel: 'noopener noreferrer', text: 'commit' }) : null,
    state.receipt.pullRequest ? [' · ', h('a', { href: state.receipt.pullRequest, target: '_blank', rel: 'noopener noreferrer', text: 'rolling PR' })] : null,
    state.receipt.pullRequestError ? ' · the rolling review request needs attention' : null,
  ])] : []));
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
  document.getElementById('item-sheet').replaceChildren(...(sheet ? [h('div', { class: 'sheet-backdrop', onClick: closeSheet }), sheet] : []));
}
function sheetConfirm(item) { return h('div'); }   // Task 5
function sheetDraft(item) { return h('div'); }     // Task 6

// ---- boot ---------------------------------------------------------------------------------
state.deepLink = window.location.search.includes('item=') ? window.location.search : null;
window.addEventListener('message', handlePreviewStatus);
window.addEventListener('offline', () => { state.message = 'You are offline.'; render(); });
window.addEventListener('online', () => { state.message = ''; render(); });
void load();
