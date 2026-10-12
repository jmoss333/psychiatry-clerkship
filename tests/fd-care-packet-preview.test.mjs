// PR C of the Care aftercare packet: the preview's state and controller (the sheet itself is tested in
// fd-care-packet-sheet.test.mjs). Pure state, the controls markup, the blocker order, the rules that re-arm the
// review gate, and the controller's typing / commit / Escape behaviour against fake nodes. DOM-dependent behaviour
// (measuring, the print container, focus, real keyboard) is in the browser spec.
//
// Every test names the production change that would make it fail.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const AUTOMATION = path.join(REPO, '13_Faculty_Resources/_automation');
const SITE_BUILD = path.join(AUTOMATION, 'site_build');
const FD = path.join(SITE_BUILD, 'frontdoor');
const readIf = file => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const PACKET = readIf(path.join(FD, 'fd_care_packet.js'));
const SHEET = readIf(path.join(FD, 'fd_care_packet_sheet.js'));
const SEARCH = readIf(path.join(FD, 'fd_care_search.js'));
const DATA = readIf(path.join(FD, 'fd_data.js'));

const built = spawnSync('python3', ['-B', '-c',
  `import json, sys\nsys.path.insert(0, ${JSON.stringify(AUTOMATION)})\nsys.path.insert(0, ${JSON.stringify(SITE_BUILD)})\nimport care_inserts_payload as p\nprint(json.dumps(p.build_payload()))`],
{ cwd: SITE_BUILD, encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
const PAYLOAD = JSON.parse(built.stdout);
const clone = value => JSON.parse(JSON.stringify(value));

const EXPORTS = `;return typeof fdCarePacketControls === 'function' ? {
  blank: fdCarePacketBlank, normalize: fdCarePacketNormalize, load: fdCarePacketLoad, save: fdCarePacketSave,
  tray: fdCarePacketTray, controls: fdCarePacketControls, blocker: fdCarePacketBlocker, create: fdCreateCarePacket,
  sheet: fdCarePacketSheet, validate: fdCareDirectoryValidate, KEY: FD_CARE_PACKET_KEY
} : null;`;
const load = (storage = undefined, global = PAYLOAD) =>
  new Function('sessionStorage', 'FD_CARE_INSERTS', DATA + PACKET + SHEET + SEARCH + EXPORTS)(storage, global);
const P = load();

const store = () => {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
};
const categoryIds = ['aftercare', 'crisis', 'peer_support', 'basic_needs', 'community_services', 'housing_shelters', 'recovery_meetings', 'telehealth_providers'];
const row = (n, more = {}) => ({ id: 'a' + n, category: 'aftercare', name: 'Support ' + n, description: 'Counseling.', details: 'x', area: 'York',
  regions: ['Southern Maine'], phone: '207-700-0123', contactHref: 'tel:2077000123', website: 'https://example.org/' + n,
  verifiedDate: '2026-10-01', reviewAfter: '2027-03-30', verificationRequired: false, ...more });
const feed = records => ({ schemaVersion: 1, generatedAt: '2026-10-12T00:00:00Z', sourceHash: 'a'.repeat(64),
  categories: categoryIds.map(id => ({ id, label: id, available: true, count: records.filter(r => r.category === id).length })),
  regionOptions: ['Statewide', 'Southern Maine', 'NH'], records });
const dataOf = count => P.validate(feed(Array.from({ length: count }, (_, i) => row(i))));
const gateOn = { verification: true, region: true, identifiers: true, supervisor: true };
const gateOff = { verification: false, region: false, identifiers: false, supervisor: false };
const settle = () => new Promise(resolve => setTimeout(resolve, 300));
const fakeLive = () => ({ textContent: '' });
// A stand-in for the preview mount: innerHTML in, and the two sub-mounts the controller paints into.
function fakePreview() {
  // `writes` counts every assignment, because identical HTML written twice looks unchanged to a string comparison.
  const piece = () => { let html = ''; const node = { writes: 0, get innerHTML() { return html; }, set innerHTML(value) { node.writes += 1; html = value; } }; return node; };
  const pieces = { controls: piece(), pages: piece() };
  return { hidden: true, innerHTML: '', isConnected: true, pieces,
    querySelector(selector) { return /controls/.test(selector) ? pieces.controls : /pages/.test(selector) ? pieces.pages : null; } };
}
const fakeField = (field, value) => ({
  value, checked: false, type: 'text',
  hasAttribute: k => k === 'data-fd-care-packet-unit-field', getAttribute: k => (k === 'data-fd-care-packet-unit-field' ? field : null),
});
const fakeChoice = (attr, value, checked = true) => ({
  value, checked, type: attr === 'data-fd-care-packet-mode' ? 'radio' : 'checkbox',
  hasAttribute: k => k === attr, getAttribute: k => (k === attr ? value : null),
});
function mounted(count = 6, options = {}) {
  const storage = options.storage || store();
  const live = fakeLive();
  const preview = fakePreview();
  const c = P.create({ storage, payload: PAYLOAD, ...options.create });
  const data = dataOf(count);
  c.mount(null, live, () => data, null, preview);
  return { c, storage, live, preview, data };
}
const confirmAll = c => { for (const key of Object.keys(gateOn)) c.setGate(key, true); };
const savedKey = storage => JSON.parse(storage.m.get('fd_care_packet_v1'));

// ---- state ------------------------------------------------------------------------------------------------
test('the module exports the preview API', () => {
  assert.ok(P, 'fd_care_packet.js exports controls, blocker and the sheet');
  assert.equal(typeof P.controls, 'function');
  assert.equal(typeof P.blocker, 'function');
});

test('state carries the ward\'s name and phone, and storage is never trusted for them', () => {
  assert.deepEqual(P.blank().unit, { name: '', phone: '' });
  assert.deepEqual(P.normalize({ unit: { name: '4 East', phone: '(207) 555-0100' } }).unit, { name: '4 East', phone: '(207) 555-0100' });
  for (const [label, unit] of [
    ['markup', { name: '<img onerror=1>', phone: '' }], ['braces', { name: '{{crisis:x}}', phone: '' }], ['control character', { name: 'a\tb', phone: '' }],
    ['over-length name', { name: 'x'.repeat(61), phone: '' }], ['over-length phone', { name: '', phone: '1'.repeat(31) }],
    ['letters in a phone', { name: '', phone: 'call me' }], ['non-strings', { name: 7, phone: null }],
  ]) {
    const stored = P.normalize({ unit }).unit;
    assert.deepEqual(stored, { name: '', phone: '' }, label + ' is dropped whole, not trimmed into something else');
  }
  assert.deepEqual(P.normalize({ unit: ['4 East'] }).unit, { name: '', phone: '' });
  assert.deepEqual(P.normalize({ unit: 'x' }).unit, { name: '', phone: '' });
});

test('a packet that holds only the ward\'s details keeps its key; a truly empty one leaves no residue', () => {
  const s = store();
  P.save(s, { ...P.blank(), unit: { name: '4 East', phone: '' } });
  assert.equal(JSON.parse(s.m.get('fd_care_packet_v1')).unit.name, '4 East');
  assert.deepEqual(P.load(s).unit, { name: '4 East', phone: '' });
  P.save(s, P.blank());
  assert.equal(s.m.size, 0, 'nothing at all to remember: the key goes');
});

test('Clear packet empties the listings but keeps the ward\'s details (they describe the ward, not the patient)', () => {
  const { c, storage } = mounted();
  c.toggle('a1');
  c.setUnit('name', '4 East');
  c.setMode('final');
  c.clear();
  const kept = savedKey(storage);
  assert.deepEqual(kept.ids, []);
  assert.deepEqual(kept.unit, { name: '4 East', phone: '' });
  assert.equal(kept.mode, 'review', 'a new packet starts as a Review copy');
});

// ---- the markup ------------------------------------------------------------------------------------------
const stateWith = (count, more = {}) => ({ ...P.blank(), ids: Array.from({ length: count }, (_, i) => 'a' + i), ...more });
const readyUi = state => {
  const sheet = P.sheet(state, dataOf(6), PAYLOAD, {});
  return { sheet, blocker: P.blocker(state, dataOf(6), gateOn, sheet, false), copyBlocker: P.blocker(state, dataOf(6), gateOn, sheet, true), unitErrors: { name: '', phone: '' } };
};

test('the tray offers Preview and print only for a non-empty packet, as a disclosure that names its region', () => {
  const data = dataOf(6);
  const empty = P.tray(P.blank(), data, gateOff, { previewOpen: false });
  assert.doesNotMatch(empty, /data-fd-care-packet-preview-toggle/);
  const closed = P.tray(stateWith(2), data, gateOff, { previewOpen: false });
  assert.match(closed, /<button[^>]*data-fd-care-packet-preview-toggle[^>]*aria-expanded="false"[^>]*aria-controls="fd-care-packet-preview"[^>]*>Preview and print</);
  const opened = P.tray(stateWith(2), data, gateOff, { previewOpen: true });
  assert.match(opened, /data-fd-care-packet-preview-toggle[^>]*aria-expanded="true"/);
  assert.equal(P.tray(stateWith(2), data, gateOff).includes('Preview and print'), true, 'ui is optional (PR B callers pass three arguments)');
  assert.doesNotMatch(closed + opened, /role="dialog"|aria-modal/, 'a disclosure, never a modal: the shared announcer is silent while a modal exists');
});

test('controls: a native radio group for the copy, a checkbox per optional page, always-included text, labelled unit fields', () => {
  const state = stateWith(2, { inserts: { safety: true, warning: false }, unit: { name: '4 East', phone: '(207) 555-0100' } });
  const html = P.controls(state, dataOf(6), PAYLOAD, gateOn, readyUi(state));
  assert.match(html, /<fieldset[^>]*>\s*<legend>Copy to print<\/legend>/);
  assert.equal((html.match(/type="radio"/g) || []).length, 2);
  assert.equal((html.match(/type="radio"[^>]*checked/g) || []).length, 1, 'exactly one is checked');
  assert.match(html, /name="fd-care-packet-mode"[^>]*value="review"[^>]*checked/);
  assert.match(html, /<legend>Pages to include<\/legend>/);
  const optional = PAYLOAD.inserts.filter(i => !i.core);
  assert.equal((html.match(/type="checkbox"[^>]*data-fd-care-packet-insert=/g) || []).length, optional.length);
  for (const insert of optional) {
    const box = html.match(new RegExp('<input[^>]*data-fd-care-packet-insert="' + insert.id + '"[^>]*>'));
    assert.ok(box, insert.id + ' has a checkbox');
    const expected = insert.id === 'safety' ? true : insert.id === 'warning' ? false : insert.defaultOn;
    assert.equal(/ checked/.test(box[0]), expected, insert.id + ': stored switch over the default');
  }
  assert.equal(PAYLOAD.inserts.filter(i => i.core).length, 1);
  assert.doesNotMatch(html, /data-fd-care-packet-insert="intro"/, 'a core page is text, not a control that can be switched off');
  assert.match(html, /Always included/);
  assert.match(html, /<label for="fd-care-packet-unit-name">Unit name[^<]*<\/label>\s*<input[^>]*id="fd-care-packet-unit-name"[^>]*maxlength="60"[^>]*autocomplete="off"[^>]*value="4 East"/);
  assert.match(html, /<label for="fd-care-packet-unit-phone">Unit phone[^<]*<\/label>\s*<input[^>]*id="fd-care-packet-unit-phone"[^>]*type="tel"[^>]*maxlength="30"[^>]*autocomplete="off"[^>]*value="\(207\) 555-0100"/);
  assert.match(html, /data-fd-care-packet-unit-field="name"/);
  assert.match(html, /never the patient/i, 'the hint says whose details these are');
});

test('controls: typed values are escaped, and an invalid one stays in the field with an error tied to it', () => {
  const evil = '"><script>alert(1)</script>';
  const state = stateWith(2, { unit: { name: evil, phone: '911' } });
  const ui = { ...readyUi(state), unitErrors: { name: 'Use letters, numbers and ordinary punctuation.', phone: 'Enter the ten-digit number patients call, with the area code.' } };
  const html = P.controls(state, dataOf(6), PAYLOAD, gateOn, ui);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /value="&quot;&gt;&lt;script&gt;/);
  assert.match(html, /id="fd-care-packet-unit-phone"[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]*fd-care-packet-unit-phone-error/);
  assert.match(html, /id="fd-care-packet-unit-phone-error"[^>]*>Enter the ten-digit number/);
  const clean = P.controls(stateWith(2), dataOf(6), PAYLOAD, gateOn, readyUi(stateWith(2)));
  assert.doesNotMatch(clean, /aria-invalid="true"/);
});

test('controls: Print and Copy are native-disabled with the reason beside them, and enabled only when nothing blocks', () => {
  const state = stateWith(2, { mode: 'final', unit: { name: '', phone: '(207) 555-0100' } });
  const blockedHtml = P.controls(state, dataOf(6), PAYLOAD, gateOff, { ...readyUi(state), blocker: { code: 'REVIEW', message: 'Finish the four review confirmations above.' }, copyBlocker: { code: 'REVIEW', message: 'Finish the four review confirmations above.' } });
  assert.match(blockedHtml, /<p[^>]*id="fd-care-packet-reason"[^>]*tabindex="-1"[^>]*>Finish the four review confirmations above\.<\/p>/);
  assert.match(blockedHtml, /<button[^>]*data-fd-care-packet-print[^>]*disabled[^>]*aria-describedby="fd-care-packet-reason"[^>]*>Print packet</);
  assert.match(blockedHtml, /<button[^>]*data-fd-care-packet-copy[^>]*disabled[^>]*aria-describedby="fd-care-packet-reason"[^>]*>Copy as text</);
  const okUi = readyUi(state);
  assert.equal(okUi.blocker, null, 'a complete, valid Final copy has no blocker (test precondition)');
  const readyHtml = P.controls(state, dataOf(6), PAYLOAD, gateOn, okUi);
  assert.doesNotMatch(readyHtml.match(/<button[^>]*data-fd-care-packet-print[^>]*>/)[0], /disabled/);
  assert.doesNotMatch(readyHtml.match(/<button[^>]*data-fd-care-packet-copy[^>]*>/)[0], /disabled/);
  const reviewHtml = P.controls({ ...state, mode: 'review' }, dataOf(6), PAYLOAD, gateOn, readyUi({ ...state, mode: 'review' }));
  assert.match(reviewHtml.match(/<button[^>]*data-fd-care-packet-copy[^>]*>/)[0], /disabled/, 'Copy is Final-only');
  assert.doesNotMatch(reviewHtml.match(/<button[^>]*data-fd-care-packet-print[^>]*>/)[0], /disabled/, 'a Review copy still prints');
});

test('controls: a failed sheet shows its message as text and no pages, and the summary says how many pages', () => {
  const state = stateWith(2);
  const html = P.controls(state, dataOf(6), PAYLOAD, gateOn, { ...readyUi(state), sheet: { ok: false, code: 'CRISIS_UNAVAILABLE', message: 'The crisis lines did not load.' }, blocker: { code: 'CRISIS_UNAVAILABLE', message: 'The crisis lines did not load.' } });
  assert.match(html, /The crisis lines did not load\./);
  const okHtml = P.controls(state, dataOf(6), PAYLOAD, gateOn, readyUi(state));
  assert.match(okHtml, /\d+ pages? · Review copy/);
  assert.match(okHtml, /Chrome or Edge/, 'the supported print path is said out loud');
  assert.match(okHtml, /one-sided/, 'and the wallet card needs a one-sided print');
});

// ---- the blocker ------------------------------------------------------------------------------------------
test('the blocker names the first thing in the way, in a fixed order', () => {
  const data = dataOf(6);
  const state = stateWith(2, { mode: 'final', unit: { name: '', phone: '(207) 555-0100' } });
  const sheet = P.sheet(state, data, PAYLOAD, {});
  assert.equal(sheet.ok, true, sheet.message);
  assert.equal(P.blocker(P.blank(), data, gateOn, sheet, false).code, 'EMPTY');
  assert.equal(P.blocker(state, data, gateOff, sheet, false).code, 'REVIEW');
  assert.equal(P.blocker(state, data, gateOn, null, false).code, 'MEASURE_FAILED');
  assert.equal(P.blocker(state, data, gateOn, { ok: false, code: 'OVERFLOW', message: 'too long' }, false).code, 'OVERFLOW');
  assert.equal(P.blocker(state, data, gateOn, { ...sheet, blockers: [{ code: 'LISTING_TEXT', message: 'remove it' }] }, false).code, 'LISTING_TEXT');
  assert.equal(P.blocker(state, data, gateOn, sheet, false), null);
  assert.equal(P.blocker({ ...state, mode: 'review' }, data, gateOn, P.sheet({ ...state, mode: 'review' }, data, PAYLOAD, {}), true).code, 'NOT_FINAL');
  assert.equal(P.blocker({ ...state, mode: 'review' }, data, gateOn, P.sheet({ ...state, mode: 'review' }, data, PAYLOAD, {}), false), null, 'Print has no Final requirement');
  assert.equal(P.blocker(state, data, gateOff, null, false).code, 'REVIEW', 'confirmations come before layout');
  assert.equal(P.blocker(P.blank(), data, gateOff, null, false).code, 'EMPTY', 'an empty packet comes first of all');
});

// ---- the gate is re-armed by anything that adds or changes what is printed ---------------------------------------
test('any edit that adds or changes content re-arms the review confirmations; edits that add nothing do not', () => {
  const rearmed = c => Object.values(c.gate()).every(v => v === false);
  const intact = c => Object.values(c.gate()).every(v => v === true);
  const { c } = mounted();
  c.toggle('a1');
  const arm = () => confirmAll(c);

  arm(); c.setUnit('name', '4 East');
  assert.ok(rearmed(c), 'typing the ward\'s name changes what prints');
  arm(); c.setUnit('name', '4 East');
  assert.ok(intact(c), 'committing the same value again changes nothing');
  arm(); c.setUnit('phone', '(207) 555-0100');
  assert.ok(rearmed(c), 'the ward\'s phone changes what prints');
  arm(); c.setInsert('safety', true);
  assert.ok(rearmed(c), 'switching a page ON adds content nobody reviewed');
  arm(); c.setInsert('safety', false);
  assert.ok(intact(c), 'switching a page OFF removes content: nothing unreviewed is added');
  arm(); c.setInsert('warning', false);
  assert.ok(intact(c));
  arm(); c.setInsert('warning', true);
  assert.ok(rearmed(c), 'switching a default page back on adds it again');
  arm(); c.setMode('final');
  assert.ok(intact(c), 'the mode does not add content');
  arm(); c.setMode('review');
  assert.ok(intact(c));
  arm(); c.toggle('a2');
  assert.ok(rearmed(c), 'a new listing (PR B rule, unchanged)');
});

test('print() and copy() refuse while the confirmations are stale, whatever the buttons look like', () => {
  const { c } = mounted();
  c.toggle('a1');
  c.setUnit('phone', '(207) 555-0100');
  c.setMode('final');
  confirmAll(c);
  c.setUnit('name', '4 East'); // re-arms
  const printed = c.print();
  assert.equal(printed.ok, false);
  assert.equal(printed.code, 'REVIEW', 'refused for the right reason, not because there is no document');
  assert.equal(c.copy().code, 'REVIEW');
  confirmAll(c);
  assert.equal(c.print().code, 'NO_DOCUMENT', 'with the confirmations back the only thing missing is a browser (this suite has none)');
});

test('an unfinished edit is committed before printing, and committing re-arms and refuses', () => {
  const { c, preview } = mounted();
  c.toggle('a1');
  c.setUnit('phone', '(207) 555-0100');
  confirmAll(c);
  c.openPreview();
  // The trainee typed a name and pressed Print without leaving the field: the input still holds an uncommitted value.
  c.handleInput(fakeField('name', 'Bed 4'));
  const result = c.print();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REVIEW');
  assert.equal(preview.pieces.controls.innerHTML.includes('Bed 4'), true, 'the committed value is what the controls now show');
});

// ---- typing, committing, Escape ---------------------------------------------------------------------------
test('typing repaints the pages after a short delay and touches neither storage nor the announcer', async () => {
  const { c, storage, live, preview } = mounted();
  c.toggle('a1');
  await settle();
  live.textContent = '';
  c.openPreview();
  await settle();
  live.textContent = '';
  const before = storage.m.get('fd_care_packet_v1');
  const controlWrites = preview.pieces.controls.writes;
  const pageWrites = preview.pieces.pages.writes;
  c.handleInput(fakeField('name', 'Unit 4 East'));
  assert.equal(storage.m.get('fd_care_packet_v1'), before, 'storage is written on change, not on input');
  await settle();
  assert.match(preview.pieces.pages.innerHTML, /Unit 4 East/, 'the pages follow what is typed');
  assert.ok(preview.pieces.pages.writes > pageWrites, 'and they really were repainted');
  assert.equal(preview.pieces.controls.writes, controlWrites, 'the controls (and the focused field in them) are not written to while typing');
  assert.equal(live.textContent, '', 'nothing is announced per keystroke');
});

test('committing the field saves it and re-arms the gate with an announcement', async () => {
  const { c, storage, live } = mounted();
  c.toggle('a1');
  confirmAll(c);
  await settle();
  const result = c.handleChange(fakeField('phone', '207-555-0100'));
  assert.deepEqual(savedKey(storage).unit, { name: '', phone: '207-555-0100' }, 'the typed value is stored as typed; validation happens at use');
  assert.deepEqual(c.gate(), gateOff);
  assert.deepEqual(result, { attr: 'data-fd-care-packet-unit-field', id: 'phone', keep: true }, 'focus stays in the field');
  await settle();
  assert.match(live.textContent, /Review confirmations cleared/);
});

test('radios and page checkboxes route through handleChange', () => {
  const { c, storage } = mounted();
  c.toggle('a1');
  assert.deepEqual(c.handleChange(fakeChoice('data-fd-care-packet-mode', 'final')), { attr: 'data-fd-care-packet-mode', id: 'final', keep: true });
  assert.equal(savedKey(storage).mode, 'final');
  assert.deepEqual(c.handleChange(fakeChoice('data-fd-care-packet-insert', 'safety', true)), { attr: 'data-fd-care-packet-insert', id: 'safety', keep: true });
  assert.equal(savedKey(storage).inserts.safety, true);
  c.handleChange(fakeChoice('data-fd-care-packet-insert', 'warning', false));
  assert.equal(savedKey(storage).inserts.warning, false);
  assert.equal(c.handleChange(fakeChoice('data-fd-care-packet-insert', 'intro', false)), null, 'a core page has no switch');
  assert.equal(c.handleChange(fakeChoice('data-fd-care-packet-insert', '__proto__', true)), null, 'unknown names are ignored');
  assert.equal(c.handleChange(fakeChoice('data-fd-care-packet-mode', 'sideways')), null);
});

test('Preview opens and closes as a disclosure, Escape closes it from inside it or on its button only, and leaving Care closes it', () => {
  const { c, preview } = mounted();
  c.toggle('a1');
  assert.equal(c.previewOpen(), false);
  assert.equal(preview.hidden, true);
  const toggle = fakeButtonTarget('data-fd-care-packet-preview-toggle');
  assert.deepEqual(c.handleClick(toggle), { attr: 'data-fd-care-packet-preview-toggle', id: '' });
  assert.equal(c.previewOpen(), true);
  assert.equal(preview.hidden, false);
  assert.match(preview.innerHTML + preview.pieces.controls.innerHTML, /Copy to print/);

  const inside = { key: 'Escape', isComposing: false, defaultPrevented: false, target: { closest: s => (/preview/.test(s) ? {} : null) } };
  assert.equal(c.handleKey({ ...inside, target: { closest: () => null } }), null, 'Escape elsewhere (the search box) is not ours');
  assert.equal(c.handleKey({ ...inside, isComposing: true }), null, 'Escape during IME composition');
  assert.equal(c.handleKey({ ...inside, defaultPrevented: true }), null);
  assert.equal(c.handleKey({ ...inside, key: 'Tab' }), null);
  assert.equal(c.previewOpen(), true);
  assert.deepEqual(c.handleKey(inside), { attr: 'data-fd-care-packet-preview-toggle', id: '' }, 'focus goes back to the Preview button');
  assert.equal(c.previewOpen(), false);
  assert.equal(preview.hidden, true);

  c.openPreview();
  c.leave();
  assert.equal(c.previewOpen(), false, 'leaving Care closes it');
});

test('Preview cannot open on an empty packet', () => {
  const { c, preview } = mounted();
  assert.equal(c.openPreview(), false);
  assert.equal(c.previewOpen(), false);
  assert.equal(preview.hidden, true);
});

test('removing the last listing while the preview is open closes it', () => {
  const { c } = mounted();
  c.toggle('a1');
  c.openPreview();
  assert.equal(c.previewOpen(), true);
  c.remove('a1');
  assert.equal(c.previewOpen(), false, 'there is nothing left to preview');
});

test('announcements: opening says the page count and what is in the way; switching a page says the new count', async () => {
  const { c, live } = mounted();
  c.toggle('a1');
  await settle();
  c.openPreview();
  await settle();
  assert.match(live.textContent, /Preview open\. \d+ pages?, Review copy\./);
  assert.match(live.textContent, /Finish the four review confirmations/);
  c.setInsert('safety', true);
  await settle();
  assert.match(live.textContent, /\d+ pages? · Review copy/);
  confirmAll(c);
  await settle();
  assert.match(live.textContent, /Review complete\./);
  assert.match(live.textContent, /Print/);
});

// ---- structure pins ----------------------------------------------------------------------------------------
test('the production default: the controller reads the injected payload when none is passed, and refuses without one', () => {
  const data = dataOf(6);
  const withPreview = fakePreview();
  const withPayload = load(store(), PAYLOAD).create({ storage: store() });
  withPayload.mount(null, null, () => data, null, withPreview);
  withPayload.toggle('a1');
  assert.equal(withPayload.openPreview(), true);
  assert.match(withPreview.pieces.pages.innerHTML, /Page 1 of \d+/, 'the injected global is what the preview renders from');
  const withoutPreview = fakePreview();
  const without = load(store(), null).create({ storage: store() });
  without.mount(null, null, () => data, null, withoutPreview);
  without.toggle('a1');
  confirmAll(without);
  without.openPreview();
  assert.doesNotMatch(withoutPreview.pieces.pages.innerHTML, /fd-packet-page/, 'no payload: no pages at all');
  assert.match(withoutPreview.pieces.pages.innerHTML, /crisis lines did not load/);
  assert.equal(without.print().code, 'CRISIS_UNAVAILABLE', 'no payload: refuse, never print without the crisis lines');
});

test('the module header and search wiring describe the preview, not "printing arrives in the next release"', () => {
  assert.doesNotMatch(PACKET, /arrive in the next release/);
  assert.match(SEARCH, /data-fd-care-packet-preview/, 'the search panel emits the preview mount');
  assert.match(SEARCH, /handleInput/, 'typing in the ward\'s fields is routed to the packet');
  assert.match(SEARCH, /handleKey/, 'Escape is routed to the packet');
  assert.doesNotMatch(SEARCH, /sessionStorage|localStorage/, 'storage stays in fd_care_packet.js');
});

function fakeButtonTarget(attr) {
  return { hasAttribute: k => k === attr, getAttribute: k => (k === attr ? 'x' : null) };
}
