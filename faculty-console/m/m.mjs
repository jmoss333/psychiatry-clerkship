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
  if (!getKey() || !state.server) { renderGate(); return; }
  if (state.screen === 'item' && state.selectedKey) { renderItem(); return; }
  renderQueue();
}

// ---- item screen (Task 4), sheets + attest (Tasks 5–6) ------------------------------------
function openItem(key) { state.selectedKey = key; state.screen = 'item'; state.ui = {}; state.sheet = null; state.diff = null; state.receipt = null; state.message = ''; beginPreview(); render(); }
function closeItem() { cancelPreview(); state.screen = 'queue'; state.selectedKey = null; state.sheet = null; render(); }
function selectedItem() { return state.items.find(i => i.key === state.selectedKey) || null; }
function beginPreview() { /* Task 4 */ }
function cancelPreview() { /* Task 4 */ }
function renderItem() { /* Task 4 */ }

// ---- boot ---------------------------------------------------------------------------------
state.deepLink = window.location.search.includes('item=') ? window.location.search : null;
window.addEventListener('message', event => { /* Task 4 wires handlePreviewStatus here */ if (typeof handlePreviewStatus === 'function') handlePreviewStatus(event); });
window.addEventListener('offline', () => { state.message = 'You are offline.'; render(); });
window.addEventListener('online', () => { state.message = ''; render(); });
void load();
