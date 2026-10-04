const API = '/api/attest';
const KEY = 'fac_key';
const root = document.querySelector('#medication-review');
const state = { snapshot: null, selected: '', busy: false, notice: '', receipt: null, checks: {}, generation: 0 };
let key = '';
try { key = sessionStorage.getItem(KEY) || ''; } catch { /* in-memory access remains available */ }

function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== null && text !== undefined) node.textContent = String(text);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}
function button(text, action, attrs = {}) {
  const node = el('button', text, { type: 'button', ...attrs });
  node.disabled = state.busy; node.addEventListener('click', action); return node;
}
function label(value) { return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase()); }
function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function dataNode(value) {
  if (Array.isArray(value)) {
    const list = el('ul'); for (const item of value) { const row = el('li'); row.append(dataNode(item)); list.append(row); }
    if (!value.length) list.append(el('li', 'None recorded')); return list;
  }
  if (value && typeof value === 'object') {
    const list = el('dl'); for (const [name, item] of Object.entries(value)) { const detail = el('dd'); detail.append(dataNode(item)); list.append(el('dt', label(name)), detail); } return list;
  }
  const url = typeof value === 'string' ? safeLink(value) : null;
  return url ? el('a', value, { href: url, target: '_blank', rel: 'noopener noreferrer' }) : el('span', value === null ? 'Not recorded' : String(value));
}
function section(title, value, open = false) {
  const node = el('details'); if (open) node.open = true; node.append(el('summary', title), dataNode(value)); return node;
}
async function request(method, body) {
  const requestGeneration = state.generation;
  const response = await fetch(API + (method === 'GET' ? '?view=medications' : ''), {
    method, headers: { 'x-faculty-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data; try { data = await response.json(); } catch { throw new Error('The service returned an unreadable response. Reload before trying again.'); }
  if (!response.ok) {
    if (response.status === 401 && requestGeneration === state.generation) { key = ''; try { sessionStorage.removeItem(KEY); } catch {} state.snapshot = null; }
    throw new Error(data.error?.message || data.message || 'The review request failed. Reload before trying again.');
  }
  return data;
}
function validSnapshot(data) {
  return data && typeof data.head === 'string' && typeof data.attester === 'string' && typeof data.needsSync === 'boolean'
    && Array.isArray(data.items) && data.items.every(item => item && typeof item.id === 'string' && item.record && typeof item.revision === 'string' && Array.isArray(item.issues));
}
async function load({ keepReceipt = false } = {}) {
  const generation = ++state.generation; state.busy = true; state.checks = {}; state.snapshot = null;
  if (!keepReceipt) { state.receipt = null; state.notice = ''; } render();
  try {
    const snapshot = await request('GET');
    if (!validSnapshot(snapshot)) throw new Error('The medication review response is incomplete. Reload before reviewing.');
    if (generation !== state.generation) return;
    state.snapshot = snapshot;
    if (keepReceipt && state.receipt) state.notice = `Review committed for ${state.receipt.name}. Saved status reloaded; publication follows the review and release process.`;
    if (!snapshot.items.some(item => item.id === state.selected)) state.selected = snapshot.items[0]?.id || '';
  } catch (error) { if (generation === state.generation) state.notice = error.message; }
  finally { if (generation === state.generation) { state.busy = false; render(); } }
}
function lock() {
  ++state.generation; key = ''; state.snapshot = null; state.checks = {}; state.receipt = null; state.notice = ''; state.busy = false;
  try { sessionStorage.removeItem(KEY); } catch {} render();
}
function canApprove(item) {
  return !state.busy && !state.snapshot.needsSync && !item.issues.length && state.checks.card && state.checks.sources && (!item.record.retrieval?.length || state.checks.retrieval);
}
async function approve(item) {
  if (!canApprove(item)) return;
  const generation = ++state.generation;
  const body = { action: 'pharmacy.attest', id: item.id, head: state.snapshot.head, revision: item.revision, confirmations: { ...state.checks } };
  state.busy = true; state.notice = ''; state.receipt = null; render();
  try {
    const saved = await request('POST', body);
    if (generation !== state.generation) return;
    const url = safeLink(saved.commit);
    if (saved.ok !== true || saved.id !== item.id || saved.updated !== 1 || !url || new URL(url).hostname !== 'github.com' || !/\/commit\/[a-f0-9]{40,64}$/.test(new URL(url).pathname)) {
      throw new Error('The service did not provide a valid commit receipt. Reload to check the saved state before trying again.');
    }
    state.receipt = { url, name: item.record.generic };
    state.notice = `Review committed for ${item.record.generic}. Refreshing its saved status…`;
    await load({ keepReceipt: true });
  } catch (error) {
    if (generation === state.generation) { state.checks = {}; state.snapshot = null; state.notice = error.message; state.busy = false; render(); }
  }
}
function render() {
  root.replaceChildren(el('h1', 'Medication review'), el('p', 'Review one saved medication at a time. Tool signatures and medication-card reviews are separate.', { class: 'muted' }));
  root.setAttribute('aria-busy', String(state.busy));
  if (state.notice) root.append(el('p', state.notice, { class: 'notice', role: 'status' }));
  if (state.receipt) root.append(el('a', `Open commit receipt for ${state.receipt.name}`, { href: state.receipt.url, target: '_blank', rel: 'noopener noreferrer' }));
  if (!key) {
    const form = el('form', null, { class: 'panel gate' }), input = el('input', null, { id: 'faculty-key', type: 'password', autocomplete: 'current-password', required: '' });
    form.append(el('label', 'Faculty key', { for: 'faculty-key' }), input, el('button', 'Open medication reviews', { type: 'submit' }));
    form.addEventListener('submit', event => { event.preventDefault(); key = input.value; try { sessionStorage.setItem(KEY, key); } catch {} void load(); });
    root.append(form); return;
  }
  const controls = el('div', null, { class: 'controls panel' });
  const lockButton = button('Lock console', lock); lockButton.disabled = false;
  controls.append(button('Reload saved medications', () => void load()), lockButton); root.append(controls);
  if (state.busy && !state.snapshot) { root.append(el('p', 'Loading saved medications…', { role: 'status' })); return; }
  if (!state.snapshot) return;
  root.append(el('p', `Reviewer: ${state.snapshot.attester}`, { class: 'muted' }));
  if (state.snapshot.needsSync) root.append(el('p', 'The review branch is behind main. Sync it normally before approving; no review has been recorded here.', { class: 'notice', role: 'alert' }));
  const pickerLabel = el('label', 'Medication', { for: 'medication-picker' }), picker = el('select', null, { id: 'medication-picker' });
  picker.disabled = state.busy;
  for (const item of state.snapshot.items) picker.append(el('option', `${item.record.generic} — ${item.reviewCurrent ? 'card reviewed' : 'needs review'}`, { value: item.id }));
  picker.value = state.selected; picker.addEventListener('change', () => { state.selected = picker.value; state.checks = {}; state.notice = ''; state.receipt = null; render(); document.querySelector('#medication-heading')?.focus(); });
  pickerLabel.append(picker); controls.prepend(pickerLabel);
  const item = state.snapshot.items.find(row => row.id === state.selected); if (!item) { root.append(el('p', 'No medications are available.')); return; }
  const layout = el('div', null, { class: 'review-layout' }), card = el('article', null, { class: 'panel' }), confirm = el('section', null, { class: 'panel', 'aria-label': 'Confirm medication review' });
  card.append(el('h2', item.record.generic, { id: 'medication-heading', tabindex: '-1' }), el('p', item.reviewCurrent ? 'Card review matches its saved judgment fields' : 'Card needs review', { class: 'stamp' }));
  card.append(el('p', `Selected label: ${item.record.dailymedSetId || 'not recorded'} · ${item.record.labelVersionDate || 'date not recorded'}`, { class: 'muted' }));
  for (const [name, value] of Object.entries(item.record)) {
    if (['generic', 'facultyReview', 'retrieval', 'provenance'].includes(name)) continue;
    card.append(section(label(name), value, ['boxedWarning', 'dosing'].includes(name)));
  }
  card.append(section('Label receipt and verification notes', item.receipt), section('Sources and field classifications', item.record.provenance), section('Retrieval questions and reveal mappings', { attendingAsks: item.record.attendingAsks, retrieval: item.record.retrieval ?? [] }), section('Existing review record', item.record.facultyReview));
  confirm.append(el('h2', 'Confirm this medication'), el('p', 'Approval records the current judgment-field hash. Retrieval approval separately binds the questions and reveal mappings. It does not approve other cards or change clinical text.', { class: 'muted' }));
  if (item.issues.length) { const issues = el('ul', null, { role: 'alert' }); for (const issue of item.issues) issues.append(el('li', issue)); confirm.append(issues); }
  const approval = button('Approve this medication', () => void approve(item), { class: 'primary approve' });
  for (const [name, text] of [['card', 'I reviewed this complete saved card, including formulation, claims, safety warnings and uncertainty.'], ['sources', 'I checked the selected label, cited evidence and source notes, and confirm this card is ready for learners.'], ...(item.record.retrieval?.length ? [['retrieval', 'I checked each retrieval question and its exact reveal mapping.']] : [])]) {
    const row = el('label', null, { class: 'check' }), input = el('input', null, { type: 'checkbox', 'data-confirm': name }); input.checked = state.checks[name] === true; input.disabled = state.busy;
    input.addEventListener('change', () => { state.checks[name] = input.checked; approval.disabled = !canApprove(item); }); row.append(input, el('span', text)); confirm.append(row);
  }
  approval.disabled = !canApprove(item); confirm.append(approval, el('p', 'A successful save returns a commit receipt. Publication follows the existing review and release process.', { class: 'muted' }));
  layout.append(card, confirm); root.append(layout);
}
render(); if (key) void load();
